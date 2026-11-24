import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { t, systemLocale } from './i18n.mjs';
import { quotaWindows } from './usage.mjs';

export function codexCommand() {
  const candidates = [
    process.env.CODEX_CLI_PATH,
    process.env.CODEX_ELECTRON_RESOURCES_PATH && join(process.env.CODEX_ELECTRON_RESOURCES_PATH, process.platform === 'win32' ? 'codex.exe' : 'codex'),
    join(homedir(), '.local/bin/codex'),
    ...(process.platform === 'darwin' ? [
      '/Applications/Codex.app/Contents/Resources/codex',
      join(homedir(), 'Applications/Codex.app/Contents/Resources/codex'),
      '/opt/homebrew/bin/codex', '/usr/local/bin/codex',
    ] : []),
    '/usr/lib/chatgpt/resources/codex',
  ];
  return candidates.find((path) => path && existsSync(path)) ?? 'codex';
}

function readLimits() {
  return new Promise((resolve, reject) => {
    const child = spawn(codexCommand(), ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
    });
    const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const timeout = setTimeout(() => finish(new Error(t(systemLocale(), 'timeout'))), 12_000);

    let finished = false;
    function finish(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      output.close();
      child.kill();
      if (error) reject(error);
      else resolve(result);
    }

    child.on('error', () => finish(new Error(t(systemLocale(), 'launch'))));
    child.on('exit', () => finish(new Error(t(systemLocale(), 'exit'))));
    child.stdin.on('error', () => finish(new Error(t(systemLocale(), 'launch'))));

    const send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    output.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message.id !== 1 && message.id !== 2) return;
      if (message.error) {
        finish(new Error(t(systemLocale(), 'auth')));
      } else if (message.id === 1) {
        send({ method: 'initialized' });
        send({ id: 2, method: 'account/rateLimits/read' });
      } else {
        finish(null, message.result);
      }
    });
    send({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'weekly-usage', title: 'Codex 用量', version: '0.5.1' } },
    });
  });
}

let pending;

export async function getUsage() {
  pending ??= readLimits().then((result) => {
    const windows = quotaWindows(result);
    return {
      ...windows.weekly,
      windows,
      fetchedAtMs: Date.now(),
    };
  }).finally(() => { pending = undefined; });

  return pending;
}
