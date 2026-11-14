import { t, systemLocale } from './i18n.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getUsage } from './account.mjs';
import { QUOTA_PERIODS, usageStatus } from './usage.mjs';

const server = new McpServer({ name: 'weekly-usage', title: t(systemLocale(), 'title'), version: '0.3.2' });
const resourceUri = 'ui://weekly-usage/dashboard.html';
const viewPath = join(__dirname, 'dashboard.html');

async function usageResult() {
  try {
    const snapshot = await getUsage();
    const locale = systemLocale();
    const summary = QUOTA_PERIODS.map(({ id }) => {
      const window = snapshot.windows[id];
      if (!window) return t(locale, id) + ' · ' + t(locale, 'unavailable');
      const status = usageStatus(window, snapshot.fetchedAtMs);
      return t(locale, id) + ' · ' + t(locale, status.tone) + ' · ' + status.remaining.toFixed(1) + '%';
    }).join('\n');
    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: snapshot,
    };
  } catch (error) {
    const message = error.message;
    return {
      content: [{ type: 'text', text: message }],
      structuredContent: { error: message },
    };
  }
}

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

registerAppTool(server, 'show_weekly_usage', {
  title: t(systemLocale(), 'title'),
  description: '打开 Codex 7 天和 5 小时额度圆环，显示实际余量、预算覆盖率和重置倒计时。',
  inputSchema: {},
  annotations,
  _meta: {
    ui: { resourceUri },
    'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] },
  },
}, usageResult);

registerAppTool(server, 'refresh_weekly_usage', {
  title: t(systemLocale(), 'refresh'),
  description: '从本机 Codex 读取最新的 7 天和 5 小时额度。',
  inputSchema: {},
  annotations,
  _meta: { ui: { visibility: ['app'] } },
}, usageResult);

registerAppResource(server, t(systemLocale(), 'title'), resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
  contents: [{
    uri: resourceUri,
    mimeType: RESOURCE_MIME_TYPE,
    text: await readFile(viewPath, 'utf8'),
    _meta: {
      ui: { csp: {}, prefersBorder: false },
      'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'inline' },
    },
  }],
}));

server.connect(new StdioServerTransport()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
