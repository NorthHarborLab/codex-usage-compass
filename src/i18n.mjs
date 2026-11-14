export const languages = { en: 'English', 'zh-CN': '简体中文' };
export function resolveLocale(value = 'en') {
  return /^zh(?:[-_]|$)/i.test(value) ? 'zh-CN' : 'en';
}
const en = {
  title: 'Codex Usage Compass', scopeBoth: 'Guidance · both quota windows', scopeWeekly: 'Guidance · based on 7-day quota only', scopeShort: 'Guidance · based on 5-hour quota only', scopeNone: 'Guidance · waiting for quota data', weekly: '7 days', fiveHour: '5 hours',
  remaining: 'Remaining', countdown: 'Resets in', target: 'Time-based reserve',
  coverage: 'Budget coverage', loading: 'Loading', unavailable: 'No data available',
  failed: 'Unable to read usage', refresh: 'Refresh', refreshing: 'Refreshing…',
  stale: 'Sync failed · showing previous usage', updated: 'Last synced',
  auto: 'Syncs every minute', legend: 'How it works', language: 'Language',
  formula: 'Coverage = remaining quota ÷ time-based reserve. Reserve = minutes until reset ÷ cycle minutes × 100%. The ring fills up to 100%. Seven days = 10,080 minutes; five hours = 300 minutes.',
  forecast: 'Guidance uses a steady spending pace, not a prediction of model costs. Both available limits are considered. Models and speed options depend on your plan.',
  neutral: 'Waiting for reset', red: 'Save for essentials', orange: 'Slow down', yellow: 'Use carefully',
  blue: 'Close to pace', green: 'On track', cyan: 'Room to explore',
  save: 'Keep quota for important work. Choose a lighter model and standard speed, or wait for reset.',
  slow: 'Try a lighter model or lower reasoning effort. Use standard speed where available.',
  careful: 'Use stronger models for difficult tasks and lighter models for routine work.',
  steady: 'Your usage is close to the time budget. Keep your current pace.',
  comfortable: 'You have a comfortable reserve. Use a stronger model for tasks that benefit from it.',
  explore: 'Plenty of reserve. You can try a stronger model or Fast mode where available.',
  low: 'Only a small absolute reserve remains. Save it for priority tasks even if coverage looks high.',
  unknown: 'Waiting for current quota data before suggesting a pace.',
  reset: 'A quota window has expired. Waiting for the updated window.',
  partial: 'Guidance uses the available quota window; the other window has no data.',
  old: 'Quota data is over two minutes old. Refresh before changing your pace.',
  timeout: 'Usage request timed out. Try again.', launch: 'Could not start local Codex.',
  auth: 'Could not read usage. Check your Codex sign-in.', exit: 'Codex exited before returning usage.',
  connect: 'Open this panel inside the Codex desktop plugin.', node: 'Node.js was not found.',
  day: 'd', hour: 'h', minute: 'm', second: 's',
};
const zh = {
  title: 'Codex 额度指南', scopeBoth: '使用建议 · 综合两个额度周期', scopeWeekly: '使用建议 · 依据 7 天额度', scopeShort: '使用建议 · 依据 5 小时额度', scopeNone: '使用建议 · 等待额度数据', weekly: '7 天', fiveHour: '5 小时',
  remaining: '实际剩余', countdown: '距重置', target: '按时间应留', coverage: '预算覆盖率',
  loading: '正在读取', unavailable: '暂无数据', failed: '读取失败', refresh: '刷新用量', refreshing: '正在刷新…',
  stale: '同步失败 · 显示上次用量', updated: '上次同步', auto: '每分钟同步用量',
  legend: '计算与建议说明', language: '语言',
  formula: '覆盖率 = 实际余量 ÷ 按时间应留额度。应留额度 = 剩余分钟数 ÷ 周期分钟数 × 100%。圆环最多填满一圈。7 天为 10,080 分钟，5 小时为 300 分钟。',
  forecast: '建议按均匀使用节奏计算，同时考虑可用的两个额度窗口。模型与速度选项取决于套餐，具体消耗也会随任务变化。',
  neutral: '等待额度重置', red: '留给重要任务', orange: '放慢节奏', yellow: '精打细算',
  blue: '接近预算', green: '节奏合适', cyan: '可以多探索',
  save: '把额度留给重要任务。可选轻量模型与标准速度，或等额度重置。',
  slow: '试试轻量模型或降低推理强度；有速度选项时可切回标准速度。',
  careful: '复杂任务用强模型，日常任务用轻量模型，适当节省额度。',
  steady: '用量接近时间预算，保持当前节奏即可。',
  comfortable: '余量比较宽裕，值得深入的任务可以试试更强的模型。',
  explore: '余量充足，可以试试更强的模型，或在支持时开启快速模式。',
  low: '实际余量已经很少，即使覆盖率较高，也建议留给重要任务。',
  unknown: '等待读取当前额度，再给出使用节奏建议。',
  reset: '额度周期已到重置时间，正在等待新周期数据。',
  partial: '建议依据已有窗口计算，另一窗口暂时没有数据。',
  old: '用量数据已超过两分钟，请刷新后再调整使用节奏。',
  timeout: '读取超时，请重试。', launch: '无法启动本机 Codex。',
  auth: '无法读取额度，请确认已登录 Codex。', exit: 'Codex 在返回额度前退出。',
  connect: '请在 Codex 桌面插件中打开此面板。', node: '找不到 Node.js。',
  day: '天', hour: '小时', minute: '分', second: '秒',
};
export function t(locale, key) {
  return (resolveLocale(locale) === 'zh-CN' ? zh : en)[key] ?? en[key] ?? key;
}
export function formatCountdown(timeLeftMs, locale) {
  const seconds = Math.ceil(timeLeftMs / 1000);
  const parts = [[Math.floor(seconds / 86400), 'day'], [Math.floor(seconds / 3600) % 24, 'hour'],
    [Math.floor(seconds / 60) % 60, 'minute'], [seconds % 60, 'second']];
  return parts.filter(([value, key]) => key !== 'day' || value).map(([value, key]) => `${value} ${t(locale, key)}`).join(' ');
}
export function systemLocale() {
  if (typeof process !== 'undefined') return resolveLocale(process.env.USAGE_LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG);
  return 'en';
}

export function adviceScope(windows = {}) {
  if (windows.weekly && windows.fiveHour) return 'scopeBoth';
  if (windows.weekly) return 'scopeWeekly';
  if (windows.fiveHour) return 'scopeShort';
  return 'scopeNone';
}
