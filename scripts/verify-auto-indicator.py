"""Run with dbus-run-session and an isolated HOME after verify-clean.mjs."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import sys

root = Path(tempfile.mkdtemp(prefix="quota-indicator-test-"))
fixture = root / "codex"
fixture.write_text("""#!/usr/bin/python3
import json,sys,time,os
for line in sys.stdin:
 message=json.loads(line)
 if message.get('id')==1: print(json.dumps({'id':1,'result':{}}),flush=True)
 if message.get('id')==2:
  limits={'primary':{'usedPercent':20,'windowDurationMins':10080,'resetsAt':int(time.time())+5040*60}}
  if os.path.exists(os.environ['USAGE_FIXTURE_SHORT_FILE']):
   limits['secondary']={'usedPercent':90,'windowDurationMins':300,'resetsAt':int(time.time())+150*60}
  print(json.dumps({'id':2,'result':{'rateLimits':limits}}),flush=True)
""")
fixture.chmod(0o755)
short_flag=root/"short-window"
short_flag.touch()
env = dict(os.environ, XDG_CONFIG_HOME=str(root/"config"), CODEX_CLI_PATH=str(fixture), USAGE_LANGUAGE="en", XDG_RUNTIME_DIR=str(root), GDK_BACKEND="x11", USAGE_FIXTURE_SHORT_FILE=str(short_flag))
entry = Path(sys.argv[1]).resolve()/"launch"
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
process = subprocess.Popen([str(entry)], env=env, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
second = None
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
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired): pass
        if address: break
        time.sleep(.1)
    assert address
    path="/org/ayatana/NotificationItem/codex_weekly_usage"
    menu=bus("get-property",address,path,"org.kde.StatusNotifierItem","Menu")
    def rows():
        _, layout=bus("call",address,menu,"com.canonical.dbusmenu","GetLayout","iias","0","-1","0")
        def walk(node):
            ident, props, children=node
            if props.get("visible",{}).get("data") is False: return {}
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
    # Missing short-window data removes the whole block; a later sync restores it.
    refresh=next(k for k,v in rows().items() if v=="Refresh")
    def click(ident):
        subprocess.check_call(["busctl","--user","--","call",address,menu,"com.canonical.dbusmenu","Event","isvu",str(ident),"clicked","s","","0"])
    short_flag.unlink()
    click(refresh)
    for attempt in range(50):
        if not any(v.startswith("5 hours") for v in rows().values()): break
        time.sleep(.1)
    assert not any(v.startswith("5 hours") for v in rows().values())
    assert len([v for v in rows().values() if v.startswith("Resets in")]) == 1
    short_flag.touch()
    click(refresh)
    for attempt in range(50):
        if any(v.startswith("5 hours") for v in rows().values()): break
        time.sleep(.1)
    assert any(v.startswith("5 hours") for v in rows().values())
    language=next(k for k,v in rows().items() if v=="简体中文")
    subprocess.check_call(["busctl","--user","--","call",address,menu,"com.canonical.dbusmenu","Event","isvu",str(language),"clicked","s","","0"])
    assert any("重要任务" in v for v in rows().values())
    # A second loaded plugin must share the icon and must not own a second lock.
    second = subprocess.Popen([str(entry)], env=env, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    time.sleep(1)
    locks=list((root/"config/codex-usage-compass").glob("*.lock"))
    assert len(locks)==1
    owner=json.loads((locks[0]/"owner.json").read_text())["pid"]
    assert owner == process.pid
    # The owner can exit while another chat remains loaded. The second takes over.
    process.stdin.close()
    process.wait(timeout=5)
    time.sleep(6)
    assert json.loads((locks[0]/"owner.json").read_text())["pid"] == second.pid
    names = bus("call","org.freedesktop.DBus","/org/freedesktop/DBus","org.freedesktop.DBus","ListNames")[0]
    for name in names:
        if not name.startswith(":"): continue
        try:
            if bus("get-property",name,path,"org.kde.StatusNotifierItem","Id") == "codex-weekly-usage":
                address=name
                menu=bus("get-property",address,path,"org.kde.StatusNotifierItem","Menu")
                break
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired): pass
    assert any("重要任务" in v for v in rows().values())
    # Hide through the native menu; the next loaded plugin must respect it.
    hide=next(k for k,v in rows().items() if v=="隐藏系统圆环")
    subprocess.check_call(["busctl","--user","--","call",address,menu,"com.canonical.dbusmenu","Event","isvu",str(hide),"clicked","s","","0"])
    time.sleep(1)
    prefs=root/"config/codex-usage-compass/preferences.json"
    assert json.loads(prefs.read_text())["enabled"] is False
    assert not list((root/"config/codex-usage-compass").glob("*.lock"))
    print("Automatic Linux tray passed: plugin-only package, first load, fixture data, countdown, language, shared lock, owner handover, hide and cleanup.")
finally:
    watcher.terminate()
    watcher.wait(timeout=5)
    if second:
        second.terminate()
        second.wait(timeout=5)
    process.terminate()
    process.wait(timeout=5)
