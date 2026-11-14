import { QUOTA_PERIODS, usageStatus, usageAdvice } from './usage.mjs';
import { t, formatCountdown, adviceScope } from './i18n.mjs';

export const trayColours = { neutral: '#A1B0BF', red: '#FC637A', orange: '#FF9654', yellow: '#FFCC4A', blue: '#66A8FF', green: '#94D454', cyan: '#4CD9E6' };
export function trayModel(snapshot, locale, error = false, now = Date.now()) {
  const percent = value => `${value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  const rows = [t(locale, adviceScope(snapshot?.windows)), t(locale, error ? 'old' : usageAdvice(snapshot, now).key), null];
  const live = [];
  for (const { id } of QUOTA_PERIODS) {
    const window = snapshot?.windows[id];
    const status = window && usageStatus(window, now);
    const active = status?.timeLeftMs > 0;
    if (active) live.push({ ...status, id });
    rows.push(`${t(locale, id)} · ${active ? percent(status.remaining) + ' · ' : ''}${t(locale, status?.tone ?? (error ? 'failed' : 'unavailable'))}`,
      `${t(locale, 'countdown')} · ${active ? formatCountdown(status.timeLeftMs, locale) : '—'}`,
      `${t(locale, 'target')} · ${active ? percent(status.target) : '—'}`,
      `${t(locale, 'coverage')} · ${active ? percent(status.coverage) : '—'}`, null);
  }
  const tightest = live.sort((a, b) => a.coverage - b.coverage)[0];
  const stale = error || (snapshot && now - snapshot.fetchedAtMs > 120_000);
  const tone = stale ? 'neutral' : tightest?.tone ?? 'neutral';
  return {
    showFiveHour: Boolean(snapshot?.windows?.fiveHour),
    shortText: stale || !tightest ? '—' : percent(tightest.remaining),
    title: t(locale, 'title'), rows, colour: trayColours[tone], fill: stale ? 0 : tightest?.fill ?? 0,
    tooltip: `${t(locale, 'title')} · ${stale ? t(locale, 'stale') : tightest ? `${t(locale, tightest.id)} ${percent(tightest.remaining)}` : t(locale, 'unavailable')}`,
    refresh: t(locale, 'refresh'), hide: t(locale, 'trayHide'), locale,
  };
}
