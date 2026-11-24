import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireLock, windowsLaunch, macLaunch, companionPaths } from './companion.mjs';
import { trayModel } from './tray-model.mjs';

test('concurrent plugin instances elect one owner and can acquire again after shutdown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-lock-'));
  try {
    const path = join(dir, 'lock');
    const owners = await Promise.all(Array.from({length: 12}, () => acquireLock(path)));
    assert.equal(owners.filter(Boolean).length, 1);
    await owners.find(Boolean)();
    const next = await acquireLock(path);
    assert.ok(next);
    await next();
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('crashed lock is removed without disrupting a live owner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-stale-'));
  try {
    const path = join(dir, 'lock'); await mkdir(path);
    await writeFile(join(path, 'owner.json'), JSON.stringify({pid: 2147483647, token: 'crashed'}));
    assert.equal(await acquireLock(path), null);
    const next = await acquireLock(path); assert.ok(next);
    assert.equal(await acquireLock(path), null);
    await next();
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('Windows launcher keeps Unicode source paths in environment and changes no policy', () => {
  const launch = windowsLaunch('C:\\用户\\My Plugin\\tray.cs', {SystemRoot:'C:\\Windows'});
  assert.equal(launch.env.USAGE_TRAY_SOURCE, 'C:\\用户\\My Plugin\\tray.cs');
  assert.ok(launch.args.includes('-STA'));
  const script = Buffer.from(launch.args.at(-1), 'base64').toString('utf16le');
  assert.ok(!/ExecutionPolicy|Bypass/i.test(script));
  assert.match(script, /USAGE_TRAY_SOURCE/);
});
test('Linux lock recovers after reboot even when the old PID was reused', {skip: process.platform !== 'linux'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-reboot-'));
  try {
    const path = join(dir, 'lock'); await mkdir(path);
    await writeFile(join(path, 'owner.json'), JSON.stringify({pid:process.pid,token:'previous-boot',identity:'previous-boot:123'}));
    assert.equal(await acquireLock(path), null);
    const owner = await acquireLock(path); assert.ok(owner);
    assert.equal(await acquireLock(path), null);
    await owner();
  } finally { await rm(dir, {recursive:true,force:true}); }
});
test('native tray frame uses tightest quota, both languages, stale neutral and changing countdown', () => {
  const now = Date.now();
  const snapshot = {fetchedAtMs: now, windows: {weekly: {usedPercent:20,windowMinutes:10080,resetsAtMs:now+5040*60000},fiveHour:{usedPercent:90,windowMinutes:300,resetsAtMs:now+150*60000}}};
  const en = trayModel(snapshot, 'en', false, now);
  const zh = trayModel(snapshot, 'zh-CN', false, now);
  assert.equal(en.rows.length, 13);
  assert.match(en.rows[1], /important work/);
  assert.match(zh.rows[0], /使用建议/);
  assert.equal(en.colour, '#FC637A');
  assert.equal(en.shortText, '10%');
  assert.equal(en.showFiveHour, true);
  assert.equal(trayModel(snapshot,'en',false,now+121000).shortText, '—');
  assert.notEqual(en.rows[9], trayModel(snapshot,'en',false,now+1000).rows[9]);
  assert.equal(trayModel(snapshot,'en',false,now+121000).fill,0);
});
test('system menus hide absent 5-hour data but retain known empty or expired quotas', () => {
  const now = Date.now();
  assert.equal(trayModel(undefined,'en').showFiveHour, false);
  assert.equal(trayModel({fetchedAtMs:now,windows:{fiveHour:null}},'en').showFiveHour, false);
  const short = {usedPercent:100,windowMinutes:300,resetsAtMs:now-1000};
  assert.equal(trayModel({fetchedAtMs:now,windows:{fiveHour:short}},'en').showFiveHour, true);
});
test('macOS launch accepts Unicode/spaces without a shell and uses Application Support', () => {
  const source = '/Users/测试/Plugin directory/macos-tray.js';
  assert.deepEqual(macLaunch(source, {}).args, ['-l', 'JavaScript', source]);
  assert.equal(macLaunch(source, {}).command, '/usr/bin/osascript');
  assert.equal(companionPaths({HOME:'/Users/demo', CODEX_HOME:'/tmp/test'}, 'darwin').preferences,
    join('/Users/demo', 'Library', 'Application Support', 'codex-usage-compass', 'preferences.json'));
});
