// Linux login helper: the desktop host may lazily load or release MCP services.
// Keep one ordinary plugin process alive only while the local desktop is running.
import { readFile, readlink, readdir, stat, mkdir, copyFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { acquireLock } from './companion.mjs';
import { codexCommand } from './account.mjs';
const exec = promisify(execFile);
const entryName = 'codex-usage-compass.desktop';

export function startupPaths(env = process.env) {
  const config = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config');
  const root = join(config, 'codex-usage-compass', 'startup');
  return { root, entry: join(config, 'autostart', entryName), settings: join(root, 'settings.json'), worker: join(root, 'startup.cjs'), lock: join(root, 'worker.lock') };
}

async function desktopProcess(pid, executable) {
  try {
    if ((await stat(`/proc/${pid}`)).uid !== process.getuid()) return false;
    const exe = await readlink(`/proc/${pid}/exe`);
    if (exe !== executable) return false;
    const args = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
    return !args.some(arg => arg.startsWith('--type='));
  } catch { return false; }
}
export async function desktopRunning(executable) {
  for (const pid of await readdir('/proc')) {
    if (/^\d+$/.test(pid) && await desktopProcess(pid, executable)) return true;
  }
  return false;
}
export async function desktopAncestor() {
  let pid = process.ppid;
  for (let count = 0; pid > 1 && count < 16; count++) {
    try {
      const exe = await readlink(`/proc/${pid}/exe`);
      // Lowercase `codex` is the CLI/app-server, not the graphical application.
      if (/^(ChatGPT|Codex|codex-desktop)$/.test(basename(exe)) && await desktopProcess(pid, exe)) return exe;
      const status = await readFile(`/proc/${pid}/status`, 'utf8');
      pid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1] || 0);
    } catch { break; }
  }
  return null;
}
// Desktop Entry Exec quoting has two layers: general string escapes and argv.
export function desktopQuote(value) {
  return '"' + value.replace(/\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/[$`]/g, '\\\\$&').replace(/%/g, '%%').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
}
async function atomicWrite(path, contents) {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, contents, { mode: 0o600 });
  await rename(temp, path);
}
export async function installStartup(bundleDir, options = {}) {
  if (process.platform !== 'linux' || process.env.USAGE_STARTUP_WORKER === '1' || process.env.USAGE_STARTUP_DISABLED === '1' || process.env.USAGE_TRAY_DISABLED === '1') return false;
  const desktop = options.desktop || await desktopAncestor();
  if (!desktop || (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)) return false;
  const paths = options.paths || startupPaths();
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await mkdir(dirname(paths.entry), { recursive: true });
  const temp = `${paths.worker}.${process.pid}.tmp`;
  await copyFile(join(bundleDir, 'startup.cjs'), temp);
  await rename(temp, paths.worker);
  await atomicWrite(paths.settings, JSON.stringify({ desktop, cli: codexCommand(), codexHome: process.env.CODEX_HOME || join(homedir(), '.codex') }));
  await atomicWrite(paths.entry, `[Desktop Entry]\nType=Application\nName=Codex Usage Compass\nComment=Show the quota ring while Codex is open\nExec=${desktopQuote(process.execPath)} ${desktopQuote(paths.worker)} ${desktopQuote(paths.settings)}\nTerminal=false\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\n`);
  const child = spawn(process.execPath, [paths.worker, paths.settings], { detached: true, stdio: 'ignore', env: { ...process.env, USAGE_STARTUP_WORKER: '1' } });
  child.on('error', () => {});
  child.unref();
  return true;
}

export async function installedPlugin(settings) {
  let stdout;
  try {
    ({ stdout } = await exec(settings.cli, ['mcp', 'get', 'weekly-usage', '--json'], { env: { ...process.env, CODEX_HOME: settings.codexHome }, timeout: 8000, maxBuffer: 1024 * 1024 }));
  } catch (error) {
    if (/No MCP server named 'weekly-usage' found/.test(error.stderr || '')) return { removed: true };
    throw error;
  }
  const config = JSON.parse(stdout);
  if (!config.enabled) return null;
  const root = config.transport?.env?.PLUGIN_ROOT;
  if (!root || resolve(config.transport.command) !== join(root, 'launch')) return null;
  const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
  if (manifest.name !== 'weekly-usage') return null;
  return root;
}

export async function runStartup(settingsFile, options = {}) {
  const paths = options.paths || startupPaths();
  // Never let a second worker remove a live worker's lock.
  let release = await acquireLock(paths.lock);
  if (!release) release = await acquireLock(paths.lock); // Recover a dead PID after reboot.
  if (!release) return;
  const isDesktopRunning = options.isDesktopRunning || desktopRunning;
  const resolvePlugin = options.resolvePlugin || installedPlugin;
  let child, childRoot, stopped = false, timer, busy = false, nextLookup = 0, cachedRoot;
  async function stopChild() {
    if (!child) return;
    const current = child; child = undefined; childRoot = undefined;
    const exited = new Promise(resolve => current.once('close', resolve));
    current.stdin.end();
    let timeout;
    await Promise.race([exited, new Promise(resolve => { timeout = setTimeout(resolve, 2500); })]);
    clearTimeout(timeout);
    if (current.exitCode === null && current.signalCode === null) current.kill();
  }
  async function close() {
    stopped = true; clearInterval(timer);
    while (busy) await new Promise(resolve => setTimeout(resolve, 20));
    await stopChild(); await release();
  }
  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
      const active = await isDesktopRunning(settings.desktop);
      if (!active) { nextLookup = 0; await stopChild(); return; }
      if (Date.now() >= nextLookup) {
        cachedRoot = await resolvePlugin(settings);
        nextLookup = Date.now() + (options.lookupIntervalMs || 30000);
      }
      if (cachedRoot?.removed) {
        await stopChild();
        await rm(paths.entry, { force: true });
        stopped = true; clearInterval(timer); await release();
        return;
      }
      if (!cachedRoot) { await stopChild(); return; }
      if (child && childRoot !== cachedRoot) await stopChild();
      if (child) return;
      childRoot = cachedRoot;
      child = spawn(process.execPath, [join(cachedRoot, 'dist/server.cjs')], {
        cwd: cachedRoot, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
        env: { ...process.env, CODEX_HOME: settings.codexHome, CODEX_CLI_PATH: settings.cli, CODEX_MCP_NODE_PATH: process.execPath, USAGE_STARTUP_WORKER: '1' },
      });
      const current = child;
      current.stdin.on('error', () => {});
      current.on('error', () => {});
      current.on('close', () => { if (child === current) { child = undefined; childRoot = undefined; } });
    } catch { nextLookup = 0; } // Desktop/config not ready yet: retry without a user refresh.
    finally { busy = false; }
  }
  timer = setInterval(() => void tick(), options.intervalMs || 3000);
  await tick();
  return { close, tick };
}
