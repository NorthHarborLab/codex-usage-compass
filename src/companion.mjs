import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, stat, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { getUsage } from './account.mjs';
import { systemLocale, resolveLocale } from './i18n.mjs';
import { trayModel } from './tray-model.mjs';

export function companionPaths(env = process.env, platform = process.platform) {
  const base = platform === 'win32' ? env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local') : env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const root = join(base, 'codex-usage-compass');
  const scope = createHash('sha256').update((env.CODEX_HOME || join(homedir(), '.codex')) + (env.DISPLAY || env.WAYLAND_DISPLAY || '')).digest('hex').slice(0, 16);
  return { root, lock: join(root, `tray-${scope}.lock`), preferences: join(root, 'preferences.json') };
}

// Exclusive directory + live PID prevents duplicate icons across chats. A crashed
// owner is recovered; a partially written lock is given time to finish first.
export async function acquireLock(path) {
  const token = randomUUID();
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')); }
    catch { if (Date.now() - (await stat(path)).mtimeMs < 30_000) return null; }
    if (owner) {
      try { process.kill(owner.pid, 0); return null; }
      catch (failure) { if (failure.code !== 'ESRCH') return null; }
    }
    // Rename the stale lock before removal; contenders then race on mkdir only.
    const { rename } = await import('node:fs/promises');
    const stale = `${path}.${token}.stale`;
    try { await rename(path, stale); await rm(stale, { recursive: true, force: true }); } catch {}
    return null;
  }
  try { await writeFile(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, token }), { mode: 0o600 }); }
  catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
  return async () => {
    try {
      const owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8'));
      if (owner.token === token) await rm(path, { recursive: true, force: true });
    } catch {}
  };
}

export function windowsLaunch(source, env = process.env) {
  // Windows PowerShell 5.1 and .NET Framework are built into Windows 10+.
  // Load C# source as data; no execution-policy changes or external downloads.
  const script = `[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false); [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); Add-Type -Path $env:USAGE_TRAY_SOURCE -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions; [UsageCompassTray]::Run()`;
  return {
    command: join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    env: { ...env, USAGE_TRAY_SOURCE: source },
  };
}

export function startCompanion(bundleDir, options = {}) {
  const paths = options.paths || companionPaths();
  let status = 'starting', stopped = false, running = false, release, child, retry, timer, polling = false, snapshot, failed = false;
  let locale = systemLocale();
  let preferences = {};
  const statusCode = () => status;
  const savePreferences = async () => writeFile(paths.preferences, JSON.stringify(preferences), { mode: 0o600 });
  async function stopChild() {
    clearInterval(timer);
    if (child) {
      const current = child; child = undefined;
      const exited = new Promise(resolve => current.once('exit', resolve));
      current.kill();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 1500))]);
      if (current.exitCode === null && current.signalCode === null) current.kill('SIGKILL');
    }
    if (release) { const unlock = release; release = undefined; await unlock(); }
  }
  async function poll() {
    if (polling) return;
    polling = true;
    try { snapshot = await getUsage(); failed = false; } catch { failed = true; }
    polling = false;
  }
  async function migrateLegacyService() {
    const service = join(homedir(), '.config/systemd/user/codex-weekly-usage-indicator.service');
    try {
      await access(service);
      await new Promise((resolve, reject) => execFile('systemctl', ['--user', 'disable', '--now', 'codex-weekly-usage-indicator.service'], { timeout: 5000 }, error => error ? reject(error) : resolve()));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function tick() {
    if (stopped || running) return;
    running = true;
    try {
      await mkdir(paths.root, { recursive: true, mode: 0o700 });
      try { preferences = JSON.parse(await readFile(paths.preferences, 'utf8')); } catch { preferences = {}; }
      if (preferences.enabled === false || process.env.USAGE_TRAY_DISABLED === '1') {
        status = 'disabled'; await stopChild(); return;
      }
      if (child) return;
      if (!['linux', 'win32'].includes(process.platform)) { status = 'unsupported'; return; }
      if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) { status = 'headless'; return; }
      release = await acquireLock(paths.lock);
      if (!release) { status = 'shared'; return; }
      locale = resolveLocale(preferences.locale || systemLocale());
      let launch;
      if (process.platform === 'linux') {
        if (!options.skipMigration) await migrateLegacyService();
        launch = { command: 'gjs', args: ['-m', join(bundleDir, 'desktop/indicator.mjs')], env: { ...process.env, CODEX_MCP_NODE_PATH: process.execPath, USAGE_LANGUAGE: locale, USAGE_MANAGED_TRAY: '1', USAGE_TRAY_PREFERENCES: paths.preferences } };
      } else launch = windowsLaunch(join(bundleDir, 'desktop/UsageCompassTray.cs'));
      child = spawn(launch.command, launch.args, { env: launch.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      const current = child;
      status = 'starting';
      current.stdin.on('error', () => {});
      current.stderr.on('data', () => {}); // Never leak account or host diagnostics into MCP stdout.
      const output = createInterface({ input: current.stdout });
      output.on('line', line => {
        try {
          const event = JSON.parse(line);
          if (event.action === 'ready') status = 'running';
          if (event.action === 'render-error') status = 'failed';
          if (event.action === 'refresh') void poll();
          if (event.action === 'language') { locale = resolveLocale(event.locale); preferences.locale = locale; void savePreferences().catch(() => {}); }
          if (event.action === 'hide') { preferences.enabled = false; void savePreferences().then(stopChild).catch(() => {}); status = 'disabled'; }
        } catch {}
      });
      current.once('error', () => { status = 'failed'; });
      current.once('close', () => {
        output.close();
        if (child !== current) return;
        child = undefined; clearInterval(timer);
        status = 'failed';
        if (release) { const unlock = release; release = undefined; void unlock(); }
      });
      if (process.platform === 'win32') {
        let lastPoll = 0;
        const resetChecks = new Set();
        timer = setInterval(() => {
          const now = Date.now();
          const expired = Object.values(snapshot?.windows || {}).filter(w => w && w.resetsAtMs <= now && !resetChecks.has(w.resetsAtMs));
          if (now - lastPoll >= 60_000 || expired.length) { lastPoll = now; expired.forEach(w => resetChecks.add(w.resetsAtMs)); void poll(); }
          if (current.stdin.writable && current.stdin.writableLength < 65536) current.stdin.write(JSON.stringify(trayModel(snapshot, locale, failed)) + '\n');
        }, 1000);
      }
    } catch { status = 'failed'; await stopChild(); }
    finally { running = false; }
  }
  void tick();
  retry = setInterval(() => void tick(), 5000);
  retry.unref();
  return {
    status: statusCode,
    async installDesktopSupport() {
      if (process.platform !== 'linux') return status;
      // Only the explicit in-panel setup button requests OS authorization.
      // No sudo password handling and no shell interpolation.
      try {
        await access('/usr/bin/apt-get');
        await new Promise((resolve, reject) => execFile('pkexec', ['/usr/bin/apt-get', 'install', '-y', 'gjs', 'gir1.2-gtk-3.0', 'gir1.2-ayatanaappindicator3-0.1', 'gnome-shell-extension-appindicator'], { timeout: 180_000 }, error => error ? reject(error) : resolve()));
        await tick();
      } catch { status = 'failed'; }
      return status;
    },
    async enable(enabled) {
      await mkdir(paths.root, { recursive: true, mode: 0o700 });
      preferences.enabled = enabled;
      await savePreferences();
      await tick();
      return status;
    },
    async close() { stopped = true; clearInterval(retry); while (running) await new Promise(resolve => setTimeout(resolve, 20)); await stopChild(); },
  };
}
