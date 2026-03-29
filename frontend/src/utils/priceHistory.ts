import type { PricePoint } from '../types/dashboard';

/** Earliest selectable day on the timeline (absolute). */
export const TABLE_DATE_ANCHOR_YMD = '2026-03-25';

/** Format `YYYY-MM-DD` for UI (e.g. "25 Mar 2026"). */
export function formatYmdDisplay(ymd: string): string {
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const t = new Date(y, m - 1, d);
  if (Number.isNaN(t.getTime())) return ymd;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(t);
}

export function timelineIdxToYmd(anchorYmd: string, dayIndex: number): string {
  const [y, m, d] = anchorYmd.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + dayIndex);
  const yy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Index of today relative to anchor (0 = anchor day). */
export function timelineMaxIdx(anchorYmd: string): number {
  const [y, m, d] = anchorYmd.split('-').map(Number);
  const anchor = new Date(y, m - 1, d);
  anchor.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - anchor.getTime()) / 86400000));
}

export function defaultTimelineRange(maxIdx: number): { start: number; end: number } {
  if (maxIdx <= 0) return { start: 0, end: 0 };
  return { start: 0, end: maxIdx };
}

/** Keep start < end when maxIdx ≥ 2; never both thumbs on the same calendar day if a second day exists. */
export function enforceTimelineGap(
  start: number,
  end: number,
  maxIdx: number
): { start: number; end: number } {
  if (maxIdx <= 0) return { start: 0, end: 0 };
  let s = Math.max(0, Math.min(maxIdx, Math.round(start)));
  let e = Math.max(0, Math.min(maxIdx, Math.round(end)));
  if (s >= e) {
    e = Math.min(maxIdx, s + 1);
    if (e <= s) s = Math.max(0, e - 1);
  }
  return { start: s, end: e };
}

function ymdToUtc(ymd: string): number {
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Closest history row to `targetYmd` by calendar distance (ignores rows with no `price`). */
export function pricePointClosestByYmd(history: PricePoint[], targetYmd: string): PricePoint | null {
  const t = ymdToUtc(targetYmd);
  let best: PricePoint | null = null;
  let bestDist = Infinity;
  let bestKey = '';
  for (const pt of history) {
    if (pt.price == null) continue;
    const key = pt.date.slice(0, 10);
    const dist = Math.abs(ymdToUtc(key) - t);
    if (dist < bestDist || (dist === bestDist && key < bestKey)) {
      bestDist = dist;
      best = pt;
      bestKey = key;
    }
  }
  return best;
}

export function priceClosestByYmd(history: PricePoint[], targetYmd: string): number | null {
  const p = pricePointClosestByYmd(history, targetYmd);
  return p?.price ?? null;
}

/** Whole-euro amounts show two decimals (e.g. 12 → 12.00); others stay compact after cent rounding. */
export function formatPriceDisplay(price: number): string {
  const r = Math.round(price * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 1e-9) return Math.round(r).toFixed(2);
  return String(parseFloat(r.toFixed(2)));
}

export function formatPriceDelta(start: number | null, end: number | null): string {
  if (start == null || end == null) return '—';
  const d = end - start;
  if (Math.abs(d) < 1e-9) return '0';
  const dR = Math.round(d * 100) / 100;
  const main =
    Math.abs(dR - Math.round(dR)) < 1e-9 ? Math.round(dR).toFixed(2) : String(parseFloat(dR.toFixed(2)));
  const pctRaw = start !== 0 ? (d / start) * 100 : null;
  if (pctRaw == null || !Number.isFinite(pctRaw)) return main;
  const pStr =
    Math.abs(pctRaw) >= 10 ? pctRaw.toFixed(0) : pctRaw.toFixed(1);
  return `${main} (${pctRaw > 0 ? '+' : ''}${pStr}%)`;
}

/** Price change only (same range as `formatPriceDelta` main part). */
export function formatDeltaPriceOnly(start: number | null, end: number | null): string {
  if (start == null || end == null) return '—';
  const d = end - start;
  if (Math.abs(d) < 1e-9) return '0';
  const dR = Math.round(d * 100) / 100;
  return Math.abs(dR - Math.round(dR)) < 1e-9
    ? Math.round(dR).toFixed(2)
    : String(parseFloat(dR.toFixed(2)));
}

/** Percent change from start to end price; — when undefined (e.g. start is 0). */
export function formatDeltaPctOnly(start: number | null, end: number | null): string {
  if (start == null || end == null) return '—';
  const d = end - start;
  if (Math.abs(d) < 1e-9) return '0%';
  const pctRaw = start !== 0 ? (d / start) * 100 : null;
  if (pctRaw == null || !Number.isFinite(pctRaw)) return '—';
  const pStr =
    Math.abs(pctRaw) >= 10 ? pctRaw.toFixed(0) : pctRaw.toFixed(1);
  return `${pctRaw > 0 ? '+' : ''}${pStr}%`;
}

export function deltaPctNumeric(p0: number | null, p1: number | null): number | null {
  if (p0 == null || p1 == null) return null;
  if (Math.abs(p0) < 1e-9) return null;
  return ((p1 - p0) / p0) * 100;
}

/** Calendar add for `YYYY-MM-DD` strings (local date). */
export function addDaysYmd(ymd: string, deltaDays: number): string {
  const s = ymd.slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + deltaDays);
  const yy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Clamp `ymd` to [minYmd, maxYmd] inclusive. */
export function clampYmdBetween(ymd: string, minYmd: string, maxYmd: string): string {
  const x = ymd.slice(0, 10);
  const lo = minYmd.slice(0, 10);
  const hi = maxYmd.slice(0, 10);
  if (x.localeCompare(lo) < 0) return lo;
  if (x.localeCompare(hi) > 0) return hi;
  return x;
}

/** Widen [fromYmd, toYmd] so the API returns neighbors for nearest-date price at the boundaries. */
export function expandPriceFetchWindow(
  fromYmd: string,
  toYmd: string,
  anchorYmd: string,
  maxYmd: string,
  bufferDays = 400
): { fetchFrom: string; fetchTo: string } {
  const rawFrom = addDaysYmd(fromYmd, -bufferDays);
  const rawTo = addDaysYmd(toYmd, bufferDays);
  return {
    fetchFrom: clampYmdBetween(rawFrom, anchorYmd, maxYmd),
    fetchTo: clampYmdBetween(rawTo, anchorYmd, maxYmd),
  };
}
