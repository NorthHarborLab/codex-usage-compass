import { t, resolveLocale, languages, formatCountdown, adviceScope } from '../src/i18n.mjs';
let AppIndicator;
try {
  imports.gi.versions.AppIndicator3 = '0.1';
  AppIndicator = imports.gi.AppIndicator3;
} catch {
  imports.gi.versions.AyatanaAppIndicator3 = '0.1';
  AppIndicator = imports.gi.AyatanaAppIndicator3;
}
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=3.0';
import Cairo from 'cairo';
import { QUOTA_PERIODS, countdownText, usageStatus, usageAdvice } from '../src/usage.mjs';

const runtime = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'codex-weekly-usage']);
const configPath = GLib.build_filenamev([GLib.get_user_config_dir(), 'codex-weekly-usage-language']);
let locale = resolveLocale(GLib.getenv('USAGE_LANGUAGE') || GLib.get_language_names()[0]);
try {
  const [ok, bytes] = GLib.file_get_contents(configPath);
  if (ok) locale = resolveLocale(new TextDecoder().decode(bytes).trim());
} catch {}
const managed = GLib.getenv('USAGE_MANAGED_TRAY') === '1';
const emit = (value) => { if (managed) print(JSON.stringify(value)); };
const refreshIntervalMs = 60_000;
const colours = {
  neutral: [0.63, 0.69, 0.75],
  red: [0.99, 0.39, 0.48],
  orange: [1, 0.59, 0.33],
  yellow: [1, 0.80, 0.29],
  blue: [0.40, 0.66, 1],
  green: [0.58, 0.83, 0.33],
  forest: [0.23, 0.68, 0.46],
  cyan: [0.30, 0.85, 0.90],
};

function ringPath(tone, fill) {
  const steps = Math.round(fill);
  const file = GLib.build_filenamev([runtime, `${tone}-${steps}.png`]);
  if (GLib.file_test(file, GLib.FileTest.EXISTS)) return file;

  const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 64, 64);
  const context = new Cairo.Context(surface);
  context.setLineWidth(8);
  const [r, g, b] = colours[tone];
  const start = -Math.PI / 2;
  context.setSourceRGBA(r, g, b, 0.33);
  context.arc(32, 32, 23, start, start + 2 * Math.PI);
  context.stroke();
  if (steps > 0) {
    context.setSourceRGB(r, g, b);
    context.arc(32, 32, 23, start, start + 2 * Math.PI * (steps / 100));
    context.stroke();
  }
  surface.writeToPNG(file);
  return file;
}

function readUsage() {
  const node = GLib.getenv('CODEX_MCP_NODE_PATH')
    || (GLib.file_test('/usr/lib/chatgpt/resources/cua_node/bin/node', GLib.FileTest.IS_EXECUTABLE)
      ? '/usr/lib/chatgpt/resources/cua_node/bin/node'
      : GLib.find_program_in_path('node'));
  if (!node) throw new Error(t(locale, 'node'));

  const script = Gio.File.new_for_uri(import.meta.url).get_parent().get_child('read-usage.mjs').get_path();
  const child = Gio.Subprocess.new(
    [node, script],
    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
  );
  return new Promise((resolve, reject) => {
    child.communicate_utf8_async(null, null, (process, result) => {
      try {
        const [, output] = process.communicate_utf8_finish(result);
        if (!process.get_successful()) throw new Error(t(locale, 'exit'));
        const data = JSON.parse(output);
        if (data.error) throw new Error(data.error);
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  });
}

GLib.mkdir_with_parents(runtime, 0o700);
Gtk.init(null);
const menu = new Gtk.Menu();
const indicator = AppIndicator.Indicator.new(
  'codex-weekly-usage',
  ringPath('neutral', 0),
  AppIndicator.IndicatorCategory.APPLICATION_STATUS,
);
indicator.set_title(t(locale, 'title'));

function addItem(label, sensitive = false) {
  const item = new Gtk.MenuItem({ label, sensitive });
  menu.append(item);
  return item;
}

function setLabel(item, text) {
  if (item.label !== text) item.label = text;
}

const scopeItem = addItem('');
const adviceItem = addItem('');
menu.append(new Gtk.SeparatorMenuItem());
const sections = QUOTA_PERIODS.map(({ id, label }, index) => {
  if (index > 0) menu.append(new Gtk.SeparatorMenuItem());
  return {
    id, label,
    summary: addItem(`${label}额度 · 正在读取`),
    countdown: addItem('距重置 · —'),
    target: addItem('按时间应留 · —'),
    coverage: addItem('预算覆盖率 · —'),
  };
});
const notice = addItem('');
notice.set_no_show_all(true);
menu.append(new Gtk.SeparatorMenuItem());
const refresh = addItem(t(locale, 'refresh'), true);
const languageMenu = new Gtk.Menu();
const languageItem = addItem('Language / 语言', true);
languageItem.set_submenu(languageMenu);
for (const [code, label] of Object.entries(languages)) {
  const item = new Gtk.MenuItem({ label });
  item.connect('activate', () => {
    locale = code;
    GLib.mkdir_with_parents(GLib.get_user_config_dir(), 0o700);
    GLib.file_set_contents(configPath, code);
    emit({ action: 'language', locale: code });
    render();
  });
  languageMenu.append(item);
}
const hideItem = managed ? addItem(t(locale, 'trayHide'), true) : null;
hideItem?.connect('activate', () => { emit({ action: 'hide' }); Gtk.main_quit(); });
const percent = (value) => `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;

let snapshot;
let error;
let busy = false;
let lastPoll = 0;
const resetChecked = new Map();
let icon;
let panelLabel;

function render() {
  const now = Date.now();
  const active = [];
  for (const section of sections) {
    const window = snapshot?.windows[section.id];
    const status = window && usageStatus(window, now);
    const live = status?.timeLeftMs > 0;
    if (live) active.push({ label: t(locale, section.id), ...status });

    const label = t(locale, status?.label ?? (snapshot ? 'unavailable' : error ? 'failed' : 'loading'));
    const remaining = live ? percent(status.remaining) + ' · ' : '';
    setLabel(section.summary, `${t(locale, section.id)} · ${remaining}${label}`);
    setLabel(section.countdown, `${t(locale, 'countdown')} · ${live ? formatCountdown(status.timeLeftMs, locale) : '—'}`);
    setLabel(section.target, `${t(locale, 'target')} · ${live ? percent(status.target) : '—'}`);
    setLabel(section.coverage, `${t(locale, 'coverage')} · ${live ? percent(status.coverage) : '—'}`);
  }

  const tightest = active.reduce((current, quota) =>
    !current || quota.coverage < current.coverage ? quota : current, null);
  const nextIcon = ringPath(tightest?.tone ?? 'neutral', tightest?.fill ?? 0);
  if (nextIcon !== icon) {
    icon = nextIcon;
    indicator.set_icon_full(icon, t(locale, 'title'));
  }
  const nextLabel = tightest
    ? active.length === 1 ? percent(tightest.remaining) : `${tightest.label} ${percent(tightest.remaining)}`
    : '—';
  if (nextLabel !== panelLabel) {
    panelLabel = nextLabel;
    indicator.set_label(panelLabel, '5 小时 100%');
  }
  const advice = usageAdvice(snapshot);
  setLabel(adviceItem, t(locale, error ? 'old' : advice.key));
  setLabel(scopeItem, t(locale, adviceScope(snapshot?.windows)));
  if (error) setLabel(notice, t(locale, 'stale'));
  notice.set_visible(Boolean(error));
  refresh.set_sensitive(!busy);
  setLabel(refresh, t(locale, busy ? 'refreshing' : 'refresh'));
  if (hideItem) setLabel(hideItem, t(locale, 'trayHide'));
}

async function poll() {
  if (busy) return;
  busy = true;
  lastPoll = GLib.get_monotonic_time() / 1_000;
  const now = Date.now();
  for (const [id, window] of Object.entries(snapshot?.windows ?? {})) {
    if (window?.resetsAtMs <= now) resetChecked.set(id, window.resetsAtMs);
  }
  render();
  try {
    snapshot = await readUsage();
    error = undefined;
  } catch (failure) {
    error = failure.message;
    console.error(failure.message);
  } finally {
    busy = false;
    render();
  }
}

refresh.connect('activate', () => void poll());
menu.show_all();
indicator.set_menu(menu);
indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE);
emit({ action: 'ready' });
if (managed) {
  // A pipe hangup also closes the tray if the owning MCP process is killed.
  const input = GLib.IOChannel.unix_new(0);
  GLib.io_add_watch(input, GLib.PRIORITY_DEFAULT, GLib.IOCondition.HUP | GLib.IOCondition.ERR, () => { Gtk.main_quit(); return GLib.SOURCE_REMOVE; });
}
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
  const elapsed = GLib.get_monotonic_time() / 1_000 - lastPoll;
  const now = Date.now();
  const resetDue = Object.entries(snapshot?.windows ?? {}).some(([id, window]) =>
    window?.resetsAtMs <= now && window.resetsAtMs !== resetChecked.get(id));
  if (elapsed >= refreshIntervalMs || resetDue) void poll();
  else render();
  return GLib.SOURCE_CONTINUE;
});
void poll();
Gtk.main();
