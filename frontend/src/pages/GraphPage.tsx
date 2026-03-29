import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import type { PricePoint, UserListItem } from '../types/dashboard';
import { fetchPriceHistoryBatched } from '../api/dashboard';
import { DateRangeSlicerPanel } from '../components/DateRangeSlicerPanel';
import { ProductSearchPanel } from '../components/ProductSearchPanel';
import { useUserListEditor } from '../hooks/useUserListEditor';
import {
  TABLE_DATE_ANCHOR_YMD,
  defaultTimelineRange,
  enforceTimelineGap,
  expandPriceFetchWindow,
  formatYmdDisplay,
  priceClosestByYmd,
  pricePointClosestByYmd,
  formatPriceDisplay,
  timelineIdxToYmd,
  timelineMaxIdx,
} from '../utils/priceHistory';
import { obscureProductDisplayName } from '../utils/productDisplay';
import { CHART_SERIES_COLORS, chartSeriesStrokeDash } from '../utils/chartColors';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type GraphPointTip = {
  date: string;
  name: string;
  value: number;
  color: string;
  left: number;
  top: number;
};

/** Recharts 3 LineChart only supports axis tooltips; item hover is done via custom dots. */
function lineDotRenderer(
  seriesName: string,
  strokeColor: string,
  setTip: (t: GraphPointTip | null) => void
) {
  return function GraphLineDot(dotProps: {
    cx?: number;
    cy?: number;
    payload?: { date?: string };
    value?: number | string | null;
  }) {
    const { cx, cy, payload, value } = dotProps;
    if (cx == null || cy == null || value == null || value === '') return null;
    const v = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(v)) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={strokeColor}
        stroke="var(--surface)"
        strokeWidth={1}
        className="graph-line-dot-hit"
        onMouseEnter={(e) => {
          e.stopPropagation();
          setTip({
            date: String(payload?.date ?? ''),
            name: seriesName,
            value: v,
            color: strokeColor,
            left: e.clientX,
            top: e.clientY,
          });
        }}
        onMouseMove={(e) => {
          e.stopPropagation();
          setTip((prev) =>
            prev
              ? { ...prev, left: e.clientX, top: e.clientY }
              : null
          );
        }}
        onMouseLeave={() => setTip(null)}
      />
    );
  };
}

export default function GraphPage() {
  const { user, token } = useAuth();
  const hasAccess =
    user?.isPaid && (!user.accessUntil || user.accessUntil >= todayStr());

  if (!user?.isPaid) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Please wait for admin confirmation</h2>
        <p className="muted">
          Your account (<strong>{user?.displayName || user?.login}</strong>
          {user?.email && ` — ${user.email}`}) is pending.
        </p>
      </main>
    );
  }
  if (!hasAccess && user.accessUntil) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Access expired</h2>
        <p className="muted">Your access ended on <strong>{user.accessUntil}</strong>.</p>
      </main>
    );
  }

  return (
    <main className="dashboard graph-page">
      <h2>Graph</h2>
      <GraphContent token={token} />
    </main>
  );
}

function GraphContent({ token }: { token: string | null }) {
  const {
    lists,
    currentListId,
    setCurrentListId,
    listWithItems,
    listLoading,
    pendingItems,
    setPendingItems,
    displayItems,
    inListUrls,
    saveTableName,
    setSaveTableName,
    tableToolsBusy,
    handleSaveTableCopy,
    handleDeleteTable,
    handleClearTable: clearListRows,
    addOneToList,
    handleAddAllFromSearch,
  } = useUserListEditor(token);

  const timelineMax = timelineMaxIdx(TABLE_DATE_ANCHOR_YMD);
  const [dateRange, setDateRange] = useState(() =>
    defaultTimelineRange(timelineMaxIdx(TABLE_DATE_ANCHOR_YMD))
  );

  useEffect(() => {
    setDateRange((r) => enforceTimelineGap(r.start, r.end, timelineMax));
  }, [timelineMax]);

  const fromYmd = useMemo(
    () => timelineIdxToYmd(TABLE_DATE_ANCHOR_YMD, dateRange.start),
    [dateRange.start]
  );
  const toYmd = useMemo(
    () => timelineIdxToYmd(TABLE_DATE_ANCHOR_YMD, dateRange.end),
    [dateRange.end]
  );
  const fromDateLabel = useMemo(() => formatYmdDisplay(fromYmd), [fromYmd]);
  const toDateLabel = useMemo(() => formatYmdDisplay(toYmd), [toYmd]);

  const [chartData, setChartData] = useState<{ date: string; [key: string]: string | number | null }[]>([]);
  const [histByUrl, setHistByUrl] = useState<Map<string, PricePoint[]>>(() => new Map());
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [pointTip, setPointTip] = useState<GraphPointTip | null>(null);
  const [snapshotYmd, setSnapshotYmd] = useState<string | null>(null);

  const chartItemsKey = useMemo(
    () => displayItems.map((i) => i.product_url).join('\0'),
    [displayItems]
  );

  const removeFromList = (productUrl: string) => {
    if (!currentListId) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    setPendingItems(base.filter((i) => i.product_url !== productUrl));
  };

  const handleClearRows = () => {
    clearListRows();
  };

  useEffect(() => {
    if (!token || displayItems.length === 0) {
      setChartData([]);
      setHistByUrl(new Map());
      setChartError('');
      setChartLoading(false);
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    setChartError('');
    const urls = displayItems.map((i) => i.product_url);
    const { fetchFrom, fetchTo } = expandPriceFetchWindow(
      fromYmd,
      toYmd,
      TABLE_DATE_ANCHOR_YMD,
      todayStr()
    );
    fetchPriceHistoryBatched(token, urls, fetchFrom, fetchTo)
      .then(({ results }) => {
        if (cancelled) return;
        const byUrl = new Map(results.map((r) => [r.product_url, r.history]));
        setHistByUrl(byUrl);
        const byDate = new Map<string, Record<string, string | number | null>>();

        const ensureRow = (d: string) => {
          let row = byDate.get(d);
          if (!row) {
            row = { date: d };
            byDate.set(d, row);
          }
          return row;
        };

        displayItems.forEach((item, idx) => {
          const key = `p${idx}`;
          const hist = byUrl.get(item.product_url) ?? [];
          for (const pt of hist) {
            const d = pt.date.slice(0, 10);
            if (d < fromYmd || d > toYmd) continue;
            if (pt.price == null) continue;
            const row = ensureRow(d);
            row[key] = pt.price;
          }
          const atStart = priceClosestByYmd(hist, fromYmd);
          const atEnd = priceClosestByYmd(hist, toYmd);
          if (atStart != null) {
            const row = ensureRow(fromYmd);
            if (row[key] == null) row[key] = atStart;
          }
          if (atEnd != null) {
            const row = ensureRow(toYmd);
            if (row[key] == null) row[key] = atEnd;
          }
        });

        const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const out = sorted.map(([, row]) => {
          const obj: { date: string; [key: string]: string | number | null } = { date: row.date as string };
          Object.keys(row).forEach((k) => (obj[k] = row[k] ?? null));
          return obj;
        });
        setChartData(out);
      })
      .catch((e) => {
        if (!cancelled) {
          setChartData([]);
          setHistByUrl(new Map());
          setChartError(e instanceof Error ? e.message : 'Failed to load chart');
        }
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, chartItemsKey, fromYmd, toYmd]);

  useEffect(() => {
    setPointTip(null);
  }, [chartItemsKey, fromYmd, toYmd, chartData.length]);

  useEffect(() => {
    setSnapshotYmd((prev) => {
      if (prev == null || prev < fromYmd || prev > toYmd) return toYmd;
      return prev;
    });
  }, [fromYmd, toYmd]);

  const snapshotRows = useMemo(() => {
    const day = snapshotYmd ?? toYmd;
    if (!day || displayItems.length === 0) return [];
    return displayItems.map((item, i) => {
      const hist = histByUrl.get(item.product_url) ?? [];
      const pt = pricePointClosestByYmd(hist, day);
      return {
        item,
        i,
        price: pt?.price ?? null,
        priceBeforeDiscount: pt?.price_before_discount ?? null,
        discountPct: pt?.discount_pct ?? null,
        color: CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length],
      };
    });
  }, [snapshotYmd, toYmd, displayItems, histByUrl]);

  const lineLabel = (item: UserListItem) =>
    obscureProductDisplayName(item.product?.product_name, item.product_url);

  const lineDotFns = useMemo(
    () =>
      displayItems.map((item, i) =>
        lineDotRenderer(
          obscureProductDisplayName(item.product?.product_name, item.product_url),
          CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length],
          setPointTip
        )
      ),
    [displayItems]
  );

  return (
    <div className="table-page-layout graph-page-layout">
      <ProductSearchPanel
        token={token}
        existingUrls={inListUrls}
        addDisabled={!currentListId}
        onAddOne={addOneToList}
        onAddAll={handleAddAllFromSearch}
        addAllLabel="Add all loaded to graph"
        addOneTitle="Add to graph"
        alreadyInPhrase="graph"
      />

      <section className="table-section graph-chart-section">
        <div className="table-toolbar-wrap">
          <div className="table-toolbar">
            <label className="table-toolbar-field">
              <span className="table-toolbar-label">Table</span>
              <select
                className="list-select table-toolbar-select"
                value={currentListId ?? ''}
                onChange={(e) => setCurrentListId(e.target.value || null)}
                disabled={lists.length === 0 || tableToolsBusy}
              >
                {lists.length === 0 ? (
                  <option value="">No tables</option>
                ) : (
                  lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="table-toolbar-field table-toolbar-field--grow">
              <span className="table-toolbar-label">Name</span>
              <input
                type="text"
                className="search-input table-toolbar-name"
                value={saveTableName}
                onChange={(e) => setSaveTableName(e.target.value)}
                placeholder="My table"
                disabled={tableToolsBusy}
                autoComplete="off"
              />
            </label>
            <div className="table-toolbar-actions">
              <button
                type="button"
                className="btn-add-all"
                disabled={tableToolsBusy || !saveTableName.trim()}
                onClick={() => void handleSaveTableCopy()}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-clear-table"
                disabled={tableToolsBusy || !currentListId}
                onClick={() => void handleDeleteTable()}
              >
                Delete
              </button>
              {currentListId && (
                <button type="button" className="btn-clear-table" onClick={handleClearRows} disabled={tableToolsBusy}>
                  Clear rows
                </button>
              )}
            </div>
          </div>
        </div>

        {pendingItems !== null && (
          <p className="widget-hint">Unsaved row changes — click Save to write them to the server.</p>
        )}
        {!currentListId && lists.length === 0 && (
          <p className="widget-hint muted">Loading your table…</p>
        )}
        {listLoading && <p className="muted">Loading…</p>}

        {listWithItems && !listLoading && displayItems.length > 0 && (
          <DateRangeSlicerPanel
            timelineMax={timelineMax}
            dateRange={dateRange}
            setDateRange={setDateRange}
            fromYmd={fromYmd}
            toYmd={toYmd}
            fromDateLabel={fromDateLabel}
            toDateLabel={toDateLabel}
            loading={chartLoading}
            error={chartError || null}
          />
        )}

        {listWithItems && !listLoading && displayItems.length > 0 && !chartLoading && (
          <div className="graph-snapshot-panel">
            <div className="graph-snapshot-panel-head">
              <label className="graph-snapshot-date-field">
                <span className="graph-snapshot-label">Prices on</span>
                <input
                  type="date"
                  className="graph-snapshot-date-input"
                  min={fromYmd}
                  max={toYmd}
                  value={snapshotYmd ?? toYmd}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v >= fromYmd && v <= toYmd) setSnapshotYmd(v);
                  }}
                  aria-label="Date for price list"
                />
              </label>
              <span className="graph-snapshot-date-hint muted">
                {formatYmdDisplay(snapshotYmd ?? toYmd)}
              </span>
            </div>
            {chartError ? (
              <p className="widget-error graph-snapshot-error">{chartError}</p>
            ) : (
              <>
                <div className="graph-snapshot-list-head" aria-hidden>
                  <span className="graph-snapshot-col-name">Product</span>
                  <span className="graph-snapshot-col-num">Price</span>
                  <span className="graph-snapshot-col-num">Before discount</span>
                  <span className="graph-snapshot-col-pct">%</span>
                  <span className="graph-snapshot-col-remove" />
                </div>
                <ul className="graph-snapshot-list" aria-label="Product prices for selected date">
                  {snapshotRows.map(
                    ({ item, price, priceBeforeDiscount, discountPct, color }) => (
                      <li
                        key={item.product_url}
                        className="graph-snapshot-row"
                        style={{ borderLeftColor: color }}
                      >
                        <span className="graph-snapshot-name" title={item.product?.product_name || item.product_url}>
                          {item.product?.product_name || item.product_url}
                        </span>
                        <span className="graph-snapshot-price">
                          {price != null ? formatPriceDisplay(price) : '—'}
                        </span>
                        <span className="graph-snapshot-before">
                          {priceBeforeDiscount != null ? formatPriceDisplay(priceBeforeDiscount) : '—'}
                        </span>
                        <span className="graph-snapshot-pct">
                          {discountPct != null ? `${discountPct}%` : '—'}
                        </span>
                        <span className="graph-snapshot-remove">
                          <button
                            type="button"
                            className="btn-remove"
                            onClick={() => removeFromList(item.product_url)}
                            title="Remove from list"
                            aria-label="Remove from list"
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </>
            )}
            <p className="graph-snapshot-footnote muted">
              When no price exists for that exact day, the closest available price in history is shown (same as the chart).
            </p>
          </div>
        )}

        {listWithItems && !listLoading && displayItems.length > 0 && chartData.length > 0 && !chartLoading && (
          <div className="chart-container table-wrap">
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <Tooltip active={false} cursor={false} />
                <Legend />
                {displayItems.map((item, i) => (
                  <Line
                    key={item.product_url}
                    type="monotone"
                    dataKey={`p${i}`}
                    name={lineLabel(item)}
                    stroke={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
                    strokeDasharray={chartSeriesStrokeDash(i)}
                    strokeWidth={2}
                    dot={lineDotFns[i]}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {listWithItems && !listLoading && displayItems.length > 0 && chartData.length === 0 && !chartLoading && !chartError && (
          <p className="widget-hint muted">No price points in this date range.</p>
        )}

        {listWithItems && !listLoading && displayItems.length === 0 && (
          <p className="widget-hint">Search and add products, then adjust the date range. Save to persist the list.</p>
        )}
      </section>

      {pointTip &&
        createPortal(
          <div
            className="graph-point-tooltip"
            style={{
              position: 'fixed',
              left: pointTip.left + 14,
              top: pointTip.top + 14,
              zIndex: 10050,
            }}
          >
            <div className="graph-point-tooltip-date">{formatYmdDisplay(pointTip.date)}</div>
            <div className="graph-point-tooltip-name" style={{ color: pointTip.color }}>
              {pointTip.name}
            </div>
            <div className="graph-point-tooltip-price">{formatPriceDisplay(pointTip.value)}</div>
          </div>,
          document.body
        )}
    </div>
  );
}
