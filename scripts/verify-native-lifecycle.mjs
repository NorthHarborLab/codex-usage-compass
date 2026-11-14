import { mkdtemp, readFile, readdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
const mac = process.platform === 'darwin';
assert.ok(mac || process.platform === 'win32');
const temp = await mkdtemp(join(tmpdir(), 'quota native 中文 '));
const env = { ...process.env, LOCALAPPDATA: temp, ...(mac ? {HOME:temp} : {}), CODEX_HOME: join(temp, 'codex'), CODEX_MCP_NODE_PATH: process.execPath };
const installed = join(temp, '安装包 with spaces');
await cp(resolve('plugins/weekly-usage'), installed, { recursive: true });
const clients = [];
async function connect() {
  const client = new Client({ name: 'native-lifecycle-test', version: '1' });
  const transport = new StdioClientTransport({ command: join(installed, mac ? 'launch' : 'launch.cmd'), args: [], env });
  await client.connect(transport);
  clients.push(client);
  return client;
}
async function until(fn) {
  for (let attempt = 0; attempt < 50; attempt++) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); }
  throw new Error('Timed out waiting for tray lifecycle');
}
const config = mac ? join(temp, 'Library', 'Application Support', 'codex-usage-compass') : join(temp, 'codex-usage-compass');
const locks = async () => (await readdir(config)).filter(n => n.endsWith('.lock'));
try {
  const first = await connect();
  const second = await connect();
  // set_system_ring returns status without depending on account sign-in.
  const status = async client => (await client.callTool({ name: 'set_system_ring', arguments: { enabled: true } })).structuredContent.companion;
  await until(async () => ['running','shared'].includes(await status(first)) && ['running','shared'].includes(await status(second)));
  assert.equal((await locks()).length, 1);
  await first.callTool({ name: 'set_system_ring', arguments: { enabled: false } });
  await until(async () => (await locks()).length === 0);
  const prefs = JSON.parse(await readFile(join(config,'preferences.json'), 'utf8'));
  assert.equal(prefs.enabled, false);
  await until(async () => ['running','shared'].includes(await status(second)));
  await first.close();
  await until(async () => (await status(second)) === 'running');
  await second.close();
  await until(async () => (await locks()).length === 0);
  console.log(process.platform.toUpperCase() + '_PLUGIN_LIFECYCLE_OK: bundled launcher, Unicode profile, two clients, hide, restart, cleanup');
} finally { await Promise.all(clients.map(c => c.close().catch(() => {}))); }
