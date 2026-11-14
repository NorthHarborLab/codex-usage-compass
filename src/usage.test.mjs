import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIVE_HOUR_MINUTES, WEEK_MINUTES, quotaWindows, snapshotWindows, usageStatus, usageAdvice } from './usage.mjs';

const weekMs = WEEK_MINUTES * 60_000;

test('finds both windows by duration and represents unavailable windows explicitly', () => {
  const weekly = { usedPercent: 25, windowDurationMins: WEEK_MINUTES, resetsAt: 123_456 };
  const hourly = { usedPercent: 40, windowDurationMins: FIVE_HOUR_MINUTES, resetsAt: 100_000 };
  const week = { usedPercent: 25, windowMinutes: WEEK_MINUTES, resetsAtMs: 123_456_000 };
  const short = { usedPercent: 40, windowMinutes: FIVE_HOUR_MINUTES, resetsAtMs: 100_000_000 };
  const both = { weekly: week, fiveHour: short };
  assert.deepEqual(quotaWindows({ rateLimits: { primary: weekly, secondary: hourly } }), both);
  assert.deepEqual(quotaWindows({
    rateLimits: { primary: weekly },
    rateLimitsByLimitId: { codex: { primary: hourly, secondary: weekly } },
  }), both);
  assert.deepEqual(quotaWindows({ rateLimits: { primary: hourly } }), { weekly: null, fiveHour: short });
  assert.deepEqual(quotaWindows({ rateLimits: { primary: weekly } }), { weekly: week, fiveHour: null });
  assert.deepEqual(quotaWindows({ rateLimits: { primary: { ...weekly, resetsAt: null } } }),
    { weekly: null, fiveHour: null });
  assert.deepEqual(snapshotWindows({ windows: both }), both);
  assert.deepEqual(snapshotWindows(week), { weekly: week, fiveHour: null });
});

test('five-hour budgets use 300 minutes and a separate reset timestamp', () => {
  const window = { usedPercent: 40, windowMinutes: FIVE_HOUR_MINUTES, resetsAtMs: 150 * 60_000 };
  const status = usageStatus(window, 0);
  assert.equal(status.target, 50);
  assert.equal(status.coverage, 120);
  assert.equal(status.tone, 'green');
  assert.equal(usageStatus(window, window.resetsAtMs).tone, 'neutral');
});

test('six color bands and exact boundaries', () => {
  const cases = [
    [0, 'red'], [24, 'red'], [25, 'orange'], [49, 'orange'],
    [50, 'yellow'], [79, 'yellow'], [80, 'blue'], [99, 'blue'],
    [100, 'green'], [149, 'green'], [150, 'cyan'], [200, 'cyan'],
  ];
  for (const [coverage, color] of cases) {
    const status = usageStatus({ usedPercent: 100 - coverage / 2, resetsAtMs: weekMs / 2 }, 0);
    assert.equal(status.tone, color, `coverage ${coverage}`);
    assert.equal(status.coverage, coverage);
    assert.equal(status.fill, Math.min(100, coverage));
  }
});

test('time increases coverage, usage decreases it, and expiration waits for fresh data', () => {
  const snapshot = { usedPercent: 60, resetsAtMs: weekMs };
  assert.equal(usageStatus(snapshot, 0).coverage, 40);
  assert.equal(usageStatus(snapshot, weekMs * 0.5).coverage, 80);
  assert.equal(usageStatus(snapshot, weekMs * 0.75).coverage, 160);
  assert.equal(usageStatus({ ...snapshot, usedPercent: 75 }, weekMs * 0.5).coverage, 50);
  assert.equal(usageStatus(snapshot, weekMs).coverage, null);
  assert.equal(usageStatus(snapshot, weekMs).tone, 'neutral');
});

test('advice respects short limit, small absolute reserve, stale data and reset', () => {
  const now = 1_000;
  const week = { usedPercent: 20, windowMinutes: 10080, resetsAtMs: now + 5040 * 60000 };
  const short = { usedPercent: 90, windowMinutes: 300, resetsAtMs: now + 150 * 60000 };
  const snapshot = { fetchedAtMs: now, windows: { weekly: week, fiveHour: short } };
  assert.equal(usageAdvice(snapshot, now).key, 'save');
  assert.equal(usageAdvice({ ...snapshot, windows: { weekly: week } }, now).key, 'explore');
  assert.equal(usageAdvice(snapshot, now + 121000).key, 'old');
  assert.equal(usageAdvice({ fetchedAtMs: now, windows: { weekly: { ...week, usedPercent: 96, resetsAtMs: now + 10000 } } }, now).key, 'low');
  assert.equal(usageAdvice({ ...snapshot, windows: { weekly: { ...week, resetsAtMs: now } } }, now).key, 'reset');
});

test('translations cover every key and unknown locales fall back to English', async () => {
  const { t, resolveLocale, formatCountdown } = await import('./i18n.mjs');
  assert.equal(resolveLocale('fr-FR'), 'en');
  assert.equal(resolveLocale('zh_CN.UTF-8'), 'zh-CN');
  for (const key of ['save','slow','careful','steady','comfortable','explore','low','old','partial','reset','unknown']) {
    assert.notEqual(t('en',key),key);
    assert.notEqual(t('zh-CN',key),key);
  }
  assert.equal(formatCountdown(61000, 'en'), '0 h 1 m 1 s');
});
