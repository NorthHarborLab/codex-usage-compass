"""Run with dbus-run-session and an isolated HOME after verify-clean.mjs."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

root = Path(tempfile.mkdtemp(prefix="quota-indicator-test-"))
fixture = root / "codex"
fixture.write_text("""#!/usr/bin/python3
import json,sys,time
for line in sys.stdin:
 message=json.loads(line)
 if message.get('id')==1: print(json.dumps({'id':1,'result':{}}),flush=True)
 if message.get('id')==2:
  print(json.dumps({'id':2,'result':{'rateLimits':{
   'primary':{'usedPercent':20,'windowDurationMins':10080,'resetsAt':int(time.time())+5040*60},
   'secondary':{'usedPercent':90,'windowDurationMins':300,'resetsAt':int(time.time())+150*60}
  }}}),flush=True)
""")
fixture.chmod(0o755)
env = dict(os.environ, CODEX_CLI_PATH=str(fixture), USAGE_LANGUAGE="en", XDG_RUNTIME_DIR=str(root), GDK_BACKEND="x11")
entry = Path.home()/".local/share/codex-weekly-usage/desktop/indicator.mjs"
watcher_code = """
from gi.repository import Gio, GLib
connection=Gio.bus_get_sync(Gio.BusType.SESSION,None)
xml='<node><interface name="org.kde.StatusNotifierWatcher"><method name="RegisterStatusNotifierItem"><arg type="s" direction="in"/></method><property name="IsStatusNotifierHostRegistered" type="b" access="read"/><property name="ProtocolVersion" type="i" access="read"/></interface></node>'
info=Gio.DBusNodeInfo.new_for_xml(xml).interfaces[0]
def call(c,s,p,i,m,args,inv): inv.return_value(None)
def prop(c,s,p,i,name): return GLib.Variant('b',True) if name=='IsStatusNotifierHostRegistered' else GLib.Variant('i',0)
connection.register_object('/StatusNotifierWatcher',info,call,prop,None)
Gio.bus_own_name_on_connection(connection,'org.kde.StatusNotifierWatcher',Gio.BusNameOwnerFlags.NONE,None,None)
GLib.MainLoop().run()
"""
watcher=subprocess.Popen(['/usr/bin/python3','-c',watcher_code])
time.sleep(.3)
process = subprocess.Popen(["gjs", "-m", str(entry)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
def bus(*args):
    return json.loads(subprocess.check_output(["busctl","--user","--json=short","--",*args],text=True,stderr=subprocess.DEVNULL,timeout=4))["data"]
try:
    address = None
    for attempt in range(50):
        names = bus("call","org.freedesktop.DBus","/org/freedesktop/DBus","org.freedesktop.DBus","ListNames")[0]
        for name in names:
            if not name.startswith(":"): continue
            try:
                ident = bus("get-property",name,"/org/ayatana/NotificationItem/codex_weekly_usage","org.kde.StatusNotifierItem","Id")
                if ident == "codex-weekly-usage": address=name;break
            except subprocess.CalledProcessError: pass
        if address: break
        time.sleep(.1)
    assert address
    path="/org/ayatana/NotificationItem/codex_weekly_usage"
    menu=bus("get-property",address,path,"org.kde.StatusNotifierItem","Menu")
    def rows():
        _, layout=bus("call",address,menu,"com.canonical.dbusmenu","GetLayout","iias","0","-1","0")
        def walk(node):
            ident, props, children=node
            result={ident:props.get("label",{}).get("data","")}
            for child in children: result.update(walk(child["data"]))
            return result
        return walk(layout)
    for attempt in range(50):
        values=rows()
        if any("important work" in val for val in values.values()): break
        time.sleep(.1)
    assert any("important work" in val for val in values.values()),values
    assert next(v for v in values.values() if v).startswith("Guidance"), values
    before=[v for v in values.values() if v.startswith("Resets in")]
    time.sleep(2)
    assert before != [v for v in rows().values() if v.startswith("Resets in")]
    language=next(k for k,v in rows().items() if v=="简体中文")
    subprocess.check_call(["busctl","--user","--","call",address,menu,"com.canonical.dbusmenu","Event","isvu",str(language),"clicked","s","","0"])
    assert any("重要任务" in v for v in rows().values())
    print("Isolated indicator passed: fresh home, separate D-Bus, two fixture windows, countdown, language menu.")
finally:
    watcher.terminate()
    watcher.wait(timeout=5)
    process.terminate()
    process.wait(timeout=5)
