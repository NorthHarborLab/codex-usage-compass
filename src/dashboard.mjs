import { t, resolveLocale, formatCountdown, adviceScope } from './i18n.mjs';
import { App, applyDocumentTheme } from '@modelcontextprotocol/ext-apps';
import { QUOTA_PERIODS, countdownText, snapshotWindows, usageStatus, usageAdvice } from './usage.mjs';

const elements = Object.fromEntries(
  ['dashboard', 'updated', 'refresh', 'notice'].map((id) => [id, document.getElementById(id)]),
);
const periods = document.getElementById('periods');
const template = document.getElementById('period-template');
const cards = QUOTA_PERIODS.map(({ id, label }) => {
  const card = template.content.firstElementChild.cloneNode(true);
  card.setAttribute('aria-label', `${label}额度`);
  const fields = Object.fromEntries(Array.from(card.querySelectorAll('[data-field]'),
    (element) => [element.dataset.field, element]));
  fields.heading.textContent = `${label}额度`;
  periods.append(card);
  return { id, fields, chart: card.querySelector('.chart'), badge: card.querySelector('.status') };
});
const refreshInterval = 60_000;
let locale = resolveLocale(navigator.language);
try { locale = resolveLocale(localStorage.getItem('usage-language') || navigator.language); } catch {}
let number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
let clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
let dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

let snapshot;
let companionStatus = 'starting';
const trayToggle = document.getElementById('tray-toggle');
let connected = false;
let busy = false;
let stopped = false;
let error;
let lastAttempt = 0;
const checkedAtReset = new Map();
function localize() {
  document.documentElement.lang = locale;
  document.title = t(locale, 'title');
  document.querySelector('h1').textContent = t(locale, 'title');
  elements.refresh.textContent = t(locale, 'refresh');
  number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  cards.forEach(({ id, fields, chart }) => {
    fields.heading.textContent = t(locale, id);
    chart.parentElement.setAttribute('aria-label', t(locale, id));
    chart.querySelector('.chart-label').textContent = t(locale, 'remaining');
    chart.parentElement.querySelectorAll('dt').forEach((node, i) => node.textContent = t(locale, ['countdown', 'target', 'coverage'][i]));
  });
  for (const [id, key] of Object.entries({ 'language-label': 'language', 'legend-title': 'legend', formula: 'formula', forecast: 'forecast' })) {
    document.getElementById(id).textContent = t(locale, key);
  }
  const bands = document.getElementById('bands');
  bands.replaceChildren(...[['red', '<25%'], ['orange', '25–<50%'], ['yellow', '50–<80%'], ['blue', '80–<100%'], ['green', '100–<150%'], ['cyan', '≥150%']].map(([tone, range]) => {
    const li = document.createElement('li');
    li.dataset.tone = tone;
    li.textContent = range + ' · ' + t(locale, tone);
    return li;
  }));
  document.getElementById('language').value = locale;
  render();
}
document.getElementById('language').addEventListener('change', (event) => {
  locale = resolveLocale(event.target.value);
  try { localStorage.setItem('usage-language', locale); } catch {}
  localize();
});
const percent = (value) => `${number.format(value)}%`;

function render() {
  const windows = snapshotWindows(snapshot);
  const now = Date.now();
  for (const { id, chart, badge, fields } of cards) {
    const window = windows[id];
    const status = window && usageStatus(window, now);
    const live = status && status.timeLeftMs > 0;
    badge.dataset.tone = chart.dataset.tone = status?.tone ?? 'neutral';
    badge.textContent = t(locale, status?.label ?? (snapshot ? 'unavailable' : error ? 'failed' : 'loading'));
    chart.style.setProperty('--fill', `${status?.fill ?? 0}%`);
    fields.remaining.textContent = live ? number.format(status.remaining) : '—';
    fields.unit.hidden = !live;
    fields.countdown.textContent = live ? formatCountdown(status.timeLeftMs, locale) : '—';
    fields.countdown.title = live ? dateTime.format(window.resetsAtMs) : '';
    fields.target.textContent = live ? percent(status.target) : '—';
    fields.coverage.textContent = live ? percent(status.coverage) : '—';
  }

  const trayKeys = { running: 'trayRunning', shared: 'trayRunning', starting: 'trayStarting', disabled: 'trayDisabled', failed: 'trayFailed', headless: 'trayHeadless', unsupported: 'trayUnsupported' };
  document.getElementById('tray-status').textContent = t(locale, trayKeys[companionStatus] || 'trayStarting');
  trayToggle.textContent = t(locale, companionStatus === 'disabled' ? 'trayEnable' : 'trayDisable');
  trayToggle.disabled = !connected || busy;
  const { updated, refresh, notice } = elements;
  updated.textContent = snapshot ? `${t(locale, 'updated')} ${clock.format(snapshot.fetchedAtMs)}` : t(locale, 'auto');
  refresh.disabled = !connected || busy;
  notice.hidden = !error;
  notice.textContent = error ? t(locale, 'stale') : '';
  const advice = usageAdvice(snapshot);
  document.getElementById('advice').textContent = t(locale, error ? 'old' : advice.key);
  document.getElementById('advice').dataset.tone = advice.tone;
  document.getElementById('partial').textContent = t(locale, adviceScope(snapshotWindows(snapshot)));
}

function accept(result) {
  const data = result.structuredContent;
  if (data?.companion) companionStatus = data.companion;
  if (data?.error || result.isError) {
    error = data?.error ?? '暂时无法读取额度，请重试。';
  } else if (Number.isFinite(data?.fetchedAtMs) &&
      (!snapshot || data.fetchedAtMs >= snapshot.fetchedAtMs)) {
    snapshot = data;
    error = undefined;
    lastAttempt = Math.max(lastAttempt, data.fetchedAtMs);
  }
  render();
}

async function refreshUsage() {
  if (!connected || busy || stopped) return;
  lastAttempt = Date.now();
  for (const [id, window] of Object.entries(snapshotWindows(snapshot))) {
    if (window?.resetsAtMs <= lastAttempt) checkedAtReset.set(id, window.resetsAtMs);
  }
  busy = true;
  render();
  try {
    accept(await app.callServerTool({ name: 'refresh_weekly_usage', arguments: {} }, { timeout: 18_000 }));
  } catch {
    error = '同步用量失败，请重试。';
  } finally {
    busy = false;
    render();
  }
}

function tick() {
  render();
  const now = Date.now();
  const resetDue = Object.entries(snapshotWindows(snapshot)).some(([id, window]) =>
    window?.resetsAtMs <= now && window.resetsAtMs !== checkedAtReset.get(id));
  if (!document.hidden && (resetDue || now - lastAttempt >= refreshInterval)) void refreshUsage();
}

function applyContext(context) {
  if (context?.theme) applyDocumentTheme(context.theme);
  for (const [side, inset] of Object.entries(context?.safeAreaInsets ?? {})) {
    elements.dashboard.style.setProperty(`--safe-${side}`, `${inset}px`);
  }
}

applyDocumentTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const app = new App({ name: 'Codex 周额度', version: '0.4.0' }, { availableDisplayModes: ['inline', 'fullscreen'] });
let interval;
let initialRead;
app.ontoolresult = (result) => {
  clearTimeout(initialRead);
  accept(result);
};
app.onhostcontextchanged = applyContext;
app.onteardown = async () => {
  stopped = true;
  clearInterval(interval);
  clearTimeout(initialRead);
  document.removeEventListener('visibilitychange', onVisibility);
  return {};
};

function onVisibility() {
  if (!document.hidden && document.hasFocus()) void refreshUsage();
}

trayToggle.addEventListener('click', async () => {
  busy = true; render();
  try {
    const result = await app.callServerTool({ name: 'set_system_ring', arguments: { enabled: companionStatus === 'disabled' } });
    if (result.structuredContent?.companion) companionStatus = result.structuredContent.companion;
  } catch { companionStatus = 'failed'; } finally { busy = false; render(); }
});

elements.refresh.addEventListener('click', () => void refreshUsage());
document.addEventListener('visibilitychange', onVisibility);
app.connect().then(() => {
  applyContext(app.getHostContext());
  connected = true;
  render();
  initialRead = setTimeout(() => {
    if (!snapshot && !error) void refreshUsage();
  }, 1_500);
  lastAttempt = Date.now();
  interval = setInterval(tick, 1_000);
}).catch(() => {
  error = '请在 Codex 桌面插件中打开此面板。';
  render();
});

localize();
