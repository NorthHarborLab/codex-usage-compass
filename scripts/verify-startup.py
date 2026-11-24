"""dbus-run-session -- python3 scripts/verify-startup.py <installed plugin>"""
import json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
root=Path(tempfile.mkdtemp(prefix='quota-startup-'))
package=Path(sys.argv[1]).resolve()
config=root/'config'; runtime=root/'runtime'; runtime.mkdir(mode=0o700)
startup=config/'codex-usage-compass/startup'; startup.mkdir(parents=True)
exe=root/'sleep'; shutil.copy('/bin/sleep',exe)
cli=root/'codex-cli'; cli.write_text('''#!/usr/bin/python3
import json,sys,time,os
if sys.argv[1:3]==['mcp','get']:
 print(json.dumps({'enabled':True,'transport':{'command':os.environ['FIXTURE_PLUGIN']+'/launch','env':{'PLUGIN_ROOT':os.environ['FIXTURE_PLUGIN']}}}));sys.exit()
for line in sys.stdin:
 m=json.loads(line)
 if m.get('id')==1: print(json.dumps({'id':1,'result':{}}),flush=True)
 if m.get('id')==2: print(json.dumps({'id':2,'result':{'rateLimits':{'primary':{'usedPercent':20,'windowDurationMins':10080,'resetsAt':int(time.time())+302400}}}}),flush=True)
''');cli.chmod(0o755)
settings=startup/'settings.json';settings.write_text(json.dumps({'desktop':str(exe),'cli':str(cli),'codexHome':str(root/'home/.codex')}))
env=dict(os.environ,HOME=str(root/'home'),XDG_CONFIG_HOME=str(config),XDG_RUNTIME_DIR=str(runtime),USAGE_LANGUAGE='en',USAGE_STARTUP_WORKER='1',FIXTURE_PLUGIN=str(package),CODEX_MCP_NODE_PATH=shutil.which('node'))
watcher=subprocess.Popen(['/usr/bin/python3','-c','''
from gi.repository import Gio, GLib
c=Gio.bus_get_sync(Gio.BusType.SESSION,None)
i=Gio.DBusNodeInfo.new_for_xml('<node><interface name="org.kde.StatusNotifierWatcher"><method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method><property name="IsStatusNotifierHostRegistered" type="b" access="read"/><property name="ProtocolVersion" type="i" access="read"/></interface></node>').interfaces[0]
c.register_object('/StatusNotifierWatcher',i,lambda c,s,p,i,m,a,v:v.return_value(None),lambda c,s,p,i,n:GLib.Variant('b',True) if n=='IsStatusNotifierHostRegistered' else GLib.Variant('i',0),None)
Gio.bus_own_name_on_connection(c,'org.kde.StatusNotifierWatcher',Gio.BusNameOwnerFlags.NONE,None,None)
GLib.MainLoop().run()
'''])
worker=None;desktop=None
path='/org/ayatana/NotificationItem/codex_weekly_usage'
def bus(*args):return json.loads(subprocess.check_output(['busctl','--user','--timeout=1','--json=short','--',*args],stderr=subprocess.DEVNULL,text=True))['data']
def icons():
 result=[]
 # Restrict inspection to the worker's GJS descendants on this isolated bus.
 listing=subprocess.check_output(['busctl','--user','--no-pager','--no-legend','list'],text=True)
 for line in listing.splitlines():
  fields=line.split()
  if len(fields)<3 or fields[2]!='gjs':continue
  try:
   if bus('get-property',fields[0],path,'org.kde.StatusNotifierItem','Id')=='codex-weekly-usage':result.append(fields[0])
  except Exception:pass
 return result

def until(fn):
 for _ in range(80):
  if fn():return
  time.sleep(.25)
 raise AssertionError('startup state timed out')
try:
 time.sleep(.3)
 worker=subprocess.Popen(['node',str(package/'dist/startup.cjs'),str(settings)],env=env)
 time.sleep(1);assert not icons(),'No circle before desktop starts'
 desktop=subprocess.Popen([str(exe),'300'])
 until(lambda:len(icons())==1)
 address=icons()[0]
 menu=bus('get-property',address,path,'org.kde.StatusNotifierItem','Menu')
 def labels():
  layout=bus('call',address,menu,'com.canonical.dbusmenu','GetLayout','iias','0','-1','0')[1]
  return [n['data'][1].get('label',{}).get('data','') for n in layout[2] if n['data'][1].get('visible',{}).get('data',True)]
 until(lambda:any('7 days' in s and '80%' in s for s in labels()))
 assert not any('5 hours' in s for s in labels())
 before=next(s for s in labels() if s.startswith('Resets in'))
 time.sleep(2);assert before!=next(s for s in labels() if s.startswith('Resets in'))
 desktop.terminate();desktop.wait();desktop=None
 until(lambda:not icons())
 desktop=subprocess.Popen([str(exe),'300'])
 until(lambda:len(icons())==1)
 prefs=config/'codex-usage-compass/preferences.json';prefs.write_text('{"enabled":false}')
 until(lambda:not icons())
 desktop.terminate();desktop.wait();desktop=None
 time.sleep(3.5)
 desktop=subprocess.Popen([str(exe),'300']);time.sleep(6)
 assert not icons(),'Hidden preference must survive a desktop restart'
 print('STARTUP_NATIVE_OK: no panel/tool call, cold start, live menu, countdown, hidden 5h, desktop close/reopen, hidden preference.')
finally:
 if desktop:desktop.terminate();desktop.wait()
 if worker:worker.terminate();worker.wait(timeout=10)
 watcher.terminate();watcher.wait()
