import type { Dispatch, SetStateAction } from 'react';
import { enforceTimelineGap } from '../utils/priceHistory';

export type DateRangeSlicerPanelProps = {
  timelineMax: number;
  dateRange: { start: number; end: number };
  setDateRange: Dispatch<SetStateAction<{ start: number; end: number }>>;
  fromYmd: string;
  toYmd: string;
  fromDateLabel: string;
  toDateLabel: string;
  loading?: boolean;
  error?: string | null;
};

export function DateRangeSlicerPanel({
  timelineMax,
  dateRange,
  setDateRange,
  fromYmd,
  toYmd,
  fromDateLabel,
  toDateLabel,
  loading,
  error,
}: DateRangeSlicerPanelProps) {
  return (
    <div className="date-range-slicer-panel">
      <div className="date-range-slicer-panel-head">
        <span className="date-range-slicer-title">Период дат</span>
        <span className="date-range-slicer-selection" aria-live="polite">
          <time dateTime={fromYmd}>{fromDateLabel}</time>
          <span className="date-range-slicer-arrow" aria-hidden>
            →
          </span>
          <time dateTime={toYmd}>{toDateLabel}</time>
        </span>
        {loading && <span className="muted date-range-slicer-status">…</span>}
      </div>
      {error ? <div className="widget-error date-range-slicer-error">{error}</div> : null}
      <div className="date-range-slicer">
        <div className="date-range-slicer-rail" aria-hidden />
        <div
          className="date-range-slicer-fill"
          aria-hidden
          style={
            timelineMax <= 0
              ? { left: 'var(--slicer-inset)', width: 'calc(100% - 2 * var(--slicer-inset))' }
              : {
                  left: `calc(var(--slicer-inset) + (100% - 2 * var(--slicer-inset)) * ${dateRange.start / timelineMax})`,
                  width: `calc((100% - 2 * var(--slicer-inset)) * ${(dateRange.end - dateRange.start) / timelineMax})`,
                }
          }
        />
        <input
          type="range"
          className="date-range-slicer-thumb date-range-slicer-thumb--from"
          min={0}
          max={timelineMax}
          value={dateRange.start}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            setDateRange((prev) => enforceTimelineGap(n, prev.end, timelineMax));
          }}
          aria-label={`Начало периода, ${fromDateLabel}`}
        />
        <input
          type="range"
          className="date-range-slicer-thumb date-range-slicer-thumb--to"
          min={0}
          max={timelineMax}
          value={dateRange.end}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            setDateRange((prev) => enforceTimelineGap(prev.start, n, timelineMax));
          }}
          aria-label={`Конец периода, ${toDateLabel}`}
        />
      </div>
      <div className="date-range-slicer-ticks">
        <div className="date-range-slicer-tick">
          <span className="date-range-slicer-tick-role">Начало</span>
          <time dateTime={fromYmd}>{fromDateLabel}</time>
        </div>
        <div className="date-range-slicer-tick">
          <span className="date-range-slicer-tick-role">Конец</span>
          <time dateTime={toYmd}>{toDateLabel}</time>
        </div>
      </div>
    </div>
  );
}
