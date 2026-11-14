// Real AppKit objects and IPC, with synthetic quota data and no account access.
import { spawn } from 'node:child_process';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { macLaunch } from '../src/companion.mjs';
import { trayModel } from '../src/tray-model.mjs';

assert.equal(process.platform, 'darwin', 'Run on a macOS desktop session');
const temp = await mkdtemp(join(tmpdir(), 'quota macOS 中文 '));
const script = join(temp, '菜单 ring.js');
await cp(resolve('plugins/weekly-usage/dist/desktop/macos-tray.js'), script);
const launch = macLaunch(script);
const child = spawn(launch.command, [...launch.args, '--self-test'], { env: launch.env, stdio: ['pipe','pipe','pipe'] });
let diagnostic = '', fatal;
const events = [];
child.stderr.on('data', chunk => { diagnostic += chunk; });
child.on('error', error => { fatal = error; });
const exited = once(child, 'exit');
const lines = createInterface({ input: child.stdout });
lines.on('line', line => { try { events.push(JSON.parse(line)); } catch { fatal = Error('Unexpected stdout: ' + line); } });
async function event(action) {
  for (let i = 0; i < 200; i++) {
    if (fatal) throw fatal;
    const error = events.find(e => e.action === 'test-error' || e.action === 'render-error');
    if (error) throw Error(JSON.stringify(error) + diagnostic);
    const index = events.findIndex(e => e.action === action);
    if (index >= 0) return events.splice(index, 1)[0];
    if (child.exitCode !== null) throw Error('Renderer exited: ' + diagnostic);
    await new Promise(r => setTimeout(r, 50));
  }
  throw Error('Timed out waiting for ' + action + ': ' + diagnostic);
}
const send = data => child.stdin.write(JSON.stringify(data) + '\n');
const inspect = async () => { send({test:'inspect'}); return event('inspection'); };
try {
  await event('ready');
  const now = Date.now();
  const snapshot = {fetchedAtMs:now, windows:{weekly:{usedPercent:21,windowMinutes:10080,resetsAtMs:now+4*86400000},fiveHour:{usedPercent:62,windowMinutes:300,resetsAtMs:now+150*60000}}};
  const en = trayModel(snapshot,'en',false,now);
  send(en);
  const first = await inspect();
  assert.deepEqual(first.rows,en.rows);
  assert.equal(first.title,'38%');
  assert.equal(first.imageWidth,18);
  assert.equal(first.english,1);
  assert.equal(first.shortHidden,false);
  send(trayModel({...snapshot,windows:{weekly:snapshot.windows.weekly}},'en',false,now));
  const weeklyOnly = await inspect();
  assert.equal(weeklyOnly.shortHidden,true);
  assert.equal(weeklyOnly.shortSeparatorHidden,true);
  send(trayModel(snapshot,'en',false,now+1000));
  assert.notEqual((await inspect()).rows[9],first.rows[9]);
  // Split inside a multibyte character to verify the native byte buffer.
  const zh = trayModel(snapshot,'zh-CN',false,now);
  const bytes = Buffer.from(JSON.stringify(zh)+'\n');
  const split = bytes.findIndex(b => b > 127) + 1;
  child.stdin.write(bytes.subarray(0,split));
  await new Promise(r => setTimeout(r,100));
  child.stdin.write(bytes.subarray(split));
  const chinese = await inspect();
  assert.deepEqual(chinese.rows,zh.rows);
  assert.equal(chinese.chinese,1);
  assert.equal(chinese.shortHidden,false);
  for (const colour of ['#FC637A','#FF9654','#FFCC4A','#66A8FF','#94D454','#4CD9E6']) {
    for (const fill of [0,25,100]) send({...en,colour,fill});
  }
  assert.ok((await inspect()).frames >= 21);
  for (const name of ['refresh','en','zh-CN','hide']) {
    send({test:'click',item:name});
    const action = await event(name==='en'||name==='zh-CN'?'language':name);
    if (action.action==='language') assert.equal(action.locale,name);
  }
  send(trayModel(snapshot,'en',true,now));
  assert.equal((await inspect()).title,'—');
  child.stdin.end();
  const timeout = setTimeout(()=>child.kill('SIGKILL'),5000);
  const [code] = await exited;
  clearTimeout(timeout);
  assert.equal(code,0,'EOF should remove the ring and exit cleanly: '+diagnostic);
  console.log('MACOS_NATIVE_OK: AppKit menu/icon, both languages, split UTF-8, countdown, actions, colours and EOF cleanup');
} finally { child.kill(); lines.close(); await rm(temp,{recursive:true,force:true}); }
