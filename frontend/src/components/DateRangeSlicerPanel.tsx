import { useRef, type Dispatch, type SetStateAction } from 'react';
import { enforceTimelineGap, timelineIdxToYmd, timelineYmdToIdx } from '../utils/priceHistory';
import { noAutofill } from '../utils/noAutofill';

export type DateRangeSlicerPanelProps = {
  anchorYmd: string;
  timelineMax: number;
  dateRange: { start: number; end: number };
  setDateRange: Dispatch<SetStateAction<{ start: number; end: number }>>;
  fromYmd: string;
  toYmd: string;
  fromDateLabel: string;
  toDateLabel: string;
  error?: string | null;
};

type SlicerDateButtonProps = {
  ymd: string;
  label: string;
  minYmd: string;
  maxYmd: string;
  pickerLabel: string;
  onChangeYmd: (ymd: string) => void;
};

function SlicerDateButton({
  ymd,
  label,
  minYmd,
  maxYmd,
  pickerLabel,
  onChangeYmd,
}: SlicerDateButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      el.showPicker();
    } else {
      el.click();
    }
  }

  return (
    <span className="date-range-slicer-date-wrap">
      <button type="button" className="date-range-slicer-date-btn" onClick={openPicker} aria-label={pickerLabel}>
        <time dateTime={ymd}>{label}</time>
      </button>
      <input
        {...noAutofill}
        ref={inputRef}
        type="date"
        className="date-range-slicer-date-input"
        value={ymd}
        min={minYmd}
        max={maxYmd}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChangeYmd(v);
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </span>
  );
}

export function DateRangeSlicerPanel({
  anchorYmd,
  timelineMax,
  dateRange,
  setDateRange,
  fromYmd,
  toYmd,
  fromDateLabel,
  toDateLabel,
  error,
}: DateRangeSlicerPanelProps) {
  const minYmd = anchorYmd;
  const maxYmd = timelineIdxToYmd(anchorYmd, timelineMax);

  function pickFrom(ymd: string) {
    const idx = timelineYmdToIdx(anchorYmd, ymd, timelineMax);
    setDateRange((prev) => enforceTimelineGap(idx, prev.end, timelineMax));
  }

  function pickTo(ymd: string) {
    const idx = timelineYmdToIdx(anchorYmd, ymd, timelineMax);
    setDateRange((prev) => enforceTimelineGap(prev.start, idx, timelineMax));
  }

  return (
    <div className="date-range-slicer-panel">
      <div className="date-range-slicer-panel-head">
        <span className="date-range-slicer-title">Временной отрезок</span>
        <span className="date-range-slicer-selection" aria-live="polite">
          <SlicerDateButton
            ymd={fromYmd}
            label={fromDateLabel}
            minYmd={minYmd}
            maxYmd={maxYmd}
            pickerLabel={`Выбрать начало периода, сейчас ${fromDateLabel}`}
            onChangeYmd={pickFrom}
          />
          <span className="date-range-slicer-arrow" aria-hidden>
            →
          </span>
          <SlicerDateButton
            ymd={toYmd}
            label={toDateLabel}
            minYmd={minYmd}
            maxYmd={maxYmd}
            pickerLabel={`Выбрать конец периода, сейчас ${toDateLabel}`}
            onChangeYmd={pickTo}
          />
        </span>
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
          {...noAutofill}
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
          {...noAutofill}
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
          <SlicerDateButton
            ymd={fromYmd}
            label={fromDateLabel}
            minYmd={minYmd}
            maxYmd={maxYmd}
            pickerLabel={`Выбрать начало периода, сейчас ${fromDateLabel}`}
            onChangeYmd={pickFrom}
          />
        </div>
        <div className="date-range-slicer-tick">
          <span className="date-range-slicer-tick-role">Конец</span>
          <SlicerDateButton
            ymd={toYmd}
            label={toDateLabel}
            minYmd={minYmd}
            maxYmd={maxYmd}
            pickerLabel={`Выбрать конец периода, сейчас ${toDateLabel}`}
            onChangeYmd={pickTo}
          />
        </div>
      </div>
    </div>
  );
}
