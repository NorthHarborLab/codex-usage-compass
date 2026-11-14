export const WEEK_MINUTES = 10_080;
export const FIVE_HOUR_MINUTES = 300;
export const QUOTA_PERIODS = [
  { id: 'weekly', label: '7 天', minutes: WEEK_MINUTES },
  { id: 'fiveHour', label: '5 小时', minutes: FIVE_HOUR_MINUTES },
];
const MINUTE_MS = 60_000;

export function quotaWindows(result) {
  const codex = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  const windows = [codex?.primary, codex?.secondary];
  return Object.fromEntries(QUOTA_PERIODS.map(({ id, minutes }) => {
    const window = windows.find((candidate) =>
      candidate?.windowDurationMins === minutes &&
      Number.isFinite(candidate.usedPercent) &&
      candidate.usedPercent >= 0 &&
      candidate.usedPercent <= 100 &&
      Number.isSafeInteger(candidate.resetsAt) &&
      candidate.resetsAt > 0
    );
    return [id, window ? {
      usedPercent: window.usedPercent,
      resetsAtMs: window.resetsAt * 1_000,
      windowMinutes: minutes,
    } : null];
  }));
}

export function snapshotWindows(snapshot) {
  if (snapshot?.windows) return snapshot.windows;
  if (Number.isFinite(snapshot?.usedPercent) && Number.isFinite(snapshot?.resetsAtMs)) {
    return { weekly: snapshot, fiveHour: null };
  }
  return {};
}

export function countdownText(timeLeftMs) {
  const seconds = Math.ceil(timeLeftMs / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds / 3_600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return `${days ? `${days} 天 ` : ''}${hours} 小时 ${minutes} 分 ${seconds % 60} 秒`;
}

export function usageStatus({ usedPercent, resetsAtMs, windowMinutes = WEEK_MINUTES }, nowMs = Date.now()) {
  const remaining = 100 - usedPercent;
  const timeLeftMs = Math.max(0, resetsAtMs - nowMs);
  const target = Math.min(timeLeftMs / MINUTE_MS, windowMinutes) * 100 / windowMinutes;
  const coverage = target > 0 ? remaining * 100 / target : null;

  let tone = 'neutral';
  if (coverage !== null) {
    if (coverage >= 150) tone = 'cyan';
    else if (coverage >= 100) tone = 'green';
    else if (coverage >= 80) tone = 'blue';
    else if (coverage >= 50) tone = 'yellow';
    else if (coverage >= 25) tone = 'orange';
    else tone = 'red';
  }
  const label = tone;

  return { remaining, timeLeftMs, target, coverage, fill: Math.min(100, coverage ?? 0), tone, label };
}

export function usageAdvice(snapshot, now = Date.now()) {
  const windows = Object.values(snapshotWindows(snapshot)).filter(Boolean);
  if (!windows.length) return { key: 'unknown', tone: 'neutral', partial: false };
  if (now - snapshot.fetchedAtMs > 120_000) return { key: 'old', tone: 'neutral', partial: windows.length < 2 };
  const statuses = windows.map(window => usageStatus(window, now));
  if (statuses.some(status => status.timeLeftMs === 0)) return { key: 'reset', tone: 'neutral', partial: windows.length < 2 };
  const tightest = statuses.reduce((a, b) => a.coverage < b.coverage ? a : b);
  let key = { red: 'save', orange: 'slow', yellow: 'careful', blue: 'steady', green: 'comfortable', cyan: 'explore' }[tightest.tone];
  if (statuses.some(status => status.remaining <= 5)) key = 'low';
  return { key, tone: tightest.tone, partial: windows.length < 2 };
}
