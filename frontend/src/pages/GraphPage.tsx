import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAppDialog } from '../context/AppDialogContext';
import type { PricePoint, UserListItem } from '../types/dashboard';
import { fetchPriceHistoryBatched } from '../api/dashboard';
import { DateRangeSlicerPanel } from '../components/DateRangeSlicerPanel';
import { ProductSearchPanel } from '../components/ProductSearchPanel';
import { SingleSelectDropdown } from '../components/SingleSelectDropdown';
import type PptxGenJS_Types from 'pptxgenjs';
import { useListMainPreservedHeight } from '../hooks/useListMainPreservedHeight';
import { useUserListEditor } from '../hooks/useUserListEditor';
import {
  TABLE_DATE_ANCHOR_YMD,
  enforceTimelineGap,
  expandPriceFetchWindow,
  formatYmdDisplay,
  priceClosestByYmd,
  pricePointClosestByYmd,
  formatPriceDisplay,
  timelineIdxToYmd,
  timelineYmdToIdx,
  timelineMaxIdx,
} from '../utils/priceHistory';
import { noAutofill } from '../utils/noAutofill';
import { obscureProductDisplayName } from '../utils/productDisplay';
import { priceChartYDomain, Y_AXIS_TICK_COUNT, YAxisTickHideTopLabel } from '../utils/chartAxis';
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
type SnapshotPriceSortDir = 'asc' | 'desc' | null;

/** Matches `.graph-point-tooltip` max-width and typical height (long names may wrap). */
const TOOLTIP_EST_W = 280;
const TOOLTIP_EST_H = 120;
const TOOLTIP_OFFSET = 14;
const VIEW_MARGIN = 8;
const GRAPH_DATE_RANGE_STORAGE_KEY = 'graph:date-range:v1';
const GRAPH_DEFAULT_START_YMD = '2026-03-29';
const GRAPH_SNAPSHOT_SORT_STORAGE_PREFIX = 'graph:snapshot-sort:v1:';

function chartColorForProductUrl(productUrl: string): string {
  // Stable color by item identity (not row/array position).
  let h = 0;
  for (let i = 0; i < productUrl.length; i++) {
    h = (h * 31 + productUrl.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % CHART_SERIES_COLORS.length;
  return CHART_SERIES_COLORS[idx];
}

function clampTooltipViewport(clientX: number, clientY: number): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  const W = Math.min(TOOLTIP_EST_W, vw - 2 * VIEW_MARGIN);
  const H = TOOLTIP_EST_H;

  let left = Math.min(clientX + TOOLTIP_OFFSET, vw - W - VIEW_MARGIN);
  left = Math.max(VIEW_MARGIN, left);

  let top = clientY + TOOLTIP_OFFSET;
  if (top + H > vh - VIEW_MARGIN) {
    top = clientY - H - TOOLTIP_OFFSET;
  }
  top = Math.max(VIEW_MARGIN, Math.min(top, vh - H - VIEW_MARGIN));
  return { left, top };
}

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

    const showAt = (e: { clientX: number; clientY: number }) => {
      const { left, top } = clampTooltipViewport(e.clientX, e.clientY);
      setTip({
        date: String(payload?.date ?? ''),
        name: seriesName,
        value: v,
        color: strokeColor,
        left,
        top,
      });
    };

    return (
      <g className="graph-line-dot-group">
        <circle
          cx={cx}
          cy={cy}
          r={18}
          fill="transparent"
          stroke="none"
          style={{ cursor: 'pointer' }}
          onMouseEnter={(e) => {
            e.stopPropagation();
            showAt(e);
          }}
          onMouseMove={(e) => {
            e.stopPropagation();
            showAt(e);
          }}
          onMouseLeave={() => setTip(null)}
        />
        <circle
          cx={cx}
          cy={cy}
          r={6}
          fill={strokeColor}
          stroke="var(--surface)"
          strokeWidth={1}
          pointerEvents="none"
        />
      </g>
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
        <h2>Ожидайте подтверждения от администратора</h2>
        <p className="muted">
          Ваш аккаунт (<strong>{user?.displayName || user?.login}</strong>) ожидает подтверждения.
        </p>
      </main>
    );
  }
  if (!hasAccess && user.accessUntil) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Доступ истек</h2>
        <p className="muted">Ваш доступ завершился <strong>{user.accessUntil}</strong>.</p>
      </main>
    );
  }

  return (
    <main className="dashboard graph-page">
      <h2>График</h2>
      <GraphContent token={token} />
    </main>
  );
}

function GraphContent({ token }: { token: string | null }) {
  const { showAlert } = useAppDialog();
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
    handleDiscardPendingChanges,
    addOneToList,
    handleAddManyFromSearch,
    listMaxItems,
  } = useUserListEditor(token, { listKind: 'graph' });

  const { mainBlockRef, loadingMinHeightPx } = useListMainPreservedHeight(listLoading, tableToolsBusy);

  const timelineMax = timelineMaxIdx(TABLE_DATE_ANCHOR_YMD);
  const [dateRange, setDateRange] = useState(() => {
    const max = timelineMaxIdx(TABLE_DATE_ANCHOR_YMD);
    const defaultStart = timelineYmdToIdx(TABLE_DATE_ANCHOR_YMD, GRAPH_DEFAULT_START_YMD, max);
    const fallback = enforceTimelineGap(defaultStart, max, max);
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(GRAPH_DATE_RANGE_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as { start?: unknown; end?: unknown };
      if (typeof parsed.start !== 'number' || typeof parsed.end !== 'number') return fallback;
      return enforceTimelineGap(parsed.start, parsed.end, max);
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    setDateRange((r) => enforceTimelineGap(r.start, r.end, timelineMax));
  }, [timelineMax]);

  useEffect(() => {
    try {
      window.localStorage.setItem(GRAPH_DATE_RANGE_STORAGE_KEY, JSON.stringify(dateRange));
    } catch {
      // Ignore localStorage failures (e.g. private mode or blocked storage).
    }
  }, [dateRange]);

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
  const histCacheRef = useRef<Map<string, PricePoint[]>>(new Map());
  const histWindowKeyRef = useRef<string>('');
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [pointTip, setPointTip] = useState<GraphPointTip | null>(null);
  const [snapshotPriceSortDir, setSnapshotPriceSortDir] = useState<SnapshotPriceSortDir>(null);
  const [exportPptBusy, setExportPptBusy] = useState(false);

  useEffect(() => {
    if (!currentListId) {
      setSnapshotPriceSortDir(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(`${GRAPH_SNAPSHOT_SORT_STORAGE_PREFIX}${currentListId}`);
      if (raw === 'asc' || raw === 'desc') setSnapshotPriceSortDir(raw);
      else setSnapshotPriceSortDir(null);
    } catch {
      setSnapshotPriceSortDir(null);
    }
  }, [currentListId]);

  useEffect(() => {
    if (!currentListId) return;
    try {
      const key = `${GRAPH_SNAPSHOT_SORT_STORAGE_PREFIX}${currentListId}`;
      if (snapshotPriceSortDir == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, snapshotPriceSortDir);
    } catch {
      // Ignore localStorage failures.
    }
  }, [currentListId, snapshotPriceSortDir]);

  const chartItemsKey = useMemo(
    () => displayItems.map((i) => i.product_url).join('\0'),
    [displayItems]
  );

  const preserveScrollAfterListMutation = () => {
    const y = window.scrollY;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, y));
    });
  };

  const removeFromList = (productUrl: string) => {
    if (!currentListId) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    setPendingItems(base.filter((i) => i.product_url !== productUrl));
    preserveScrollAfterListMutation();
  };

  const handleClearRows = () => {
    clearListRows();
  };

  useEffect(() => {
    if (!token || displayItems.length === 0 || listLoading) {
      histWindowKeyRef.current = '';
      histCacheRef.current = new Map();
      setChartData([]);
      setHistByUrl(new Map());
      setChartError('');
      setChartLoading(false);
      return;
    }
    const urls = [...new Set(displayItems.map((i) => i.product_url))];
    const { fetchFrom, fetchTo } = expandPriceFetchWindow(
      fromYmd,
      toYmd,
      TABLE_DATE_ANCHOR_YMD,
      todayStr()
    );
    const windowKey = `${fetchFrom}|${fetchTo}`;
    if (histWindowKeyRef.current !== windowKey) {
      histWindowKeyRef.current = windowKey;
      histCacheRef.current = new Map();
    }
    const urlSet = new Set(urls);
    let cacheChanged = false;
    for (const url of [...histCacheRef.current.keys()]) {
      if (urlSet.has(url)) continue;
      histCacheRef.current.delete(url);
      cacheChanged = true;
    }
    const buildChartRows = (byUrl: Map<string, PricePoint[]>) => {
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
      return sorted.map(([, row]) => {
        const obj: { date: string; [key: string]: string | number | null } = { date: row.date as string };
        Object.keys(row).forEach((k) => (obj[k] = row[k] ?? null));
        return obj;
      });
    };
    const missingUrls = urls.filter((u) => !histCacheRef.current.has(u));
    if (missingUrls.length === 0) {
      if (cacheChanged) setHistByUrl(new Map(histCacheRef.current));
      setChartData(buildChartRows(histCacheRef.current));
      setChartLoading(false);
      setChartError('');
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    setChartError('');
    fetchPriceHistoryBatched(token, missingUrls, fetchFrom, fetchTo)
      .then(({ results }) => {
        if (cancelled) return;
        results.forEach((r) => histCacheRef.current.set(r.product_url, r.history));
        setHistByUrl(new Map(histCacheRef.current));
        setChartData(buildChartRows(histCacheRef.current));
      })
      .catch((e) => {
        if (!cancelled) {
          setChartError(e instanceof Error ? e.message : 'Failed to load chart');
        }
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, chartItemsKey, fromYmd, toYmd, listLoading]);

  useEffect(() => {
    setPointTip(null);
  }, [chartItemsKey, fromYmd, toYmd, chartData.length]);

  const snapshotRows = useMemo(() => {
    const day = toYmd;
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
        color: chartColorForProductUrl(item.product_url),
      };
    });
  }, [toYmd, displayItems, histByUrl]);

  const sortedSnapshotRows = useMemo(() => {
    if (snapshotPriceSortDir == null) return snapshotRows;
    const rows = [...snapshotRows];
    rows.sort((a, b) => {
      if (a.price == null && b.price == null) return 0;
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      const diff = a.price - b.price;
      return snapshotPriceSortDir === 'asc' ? diff : -diff;
    });
    return rows;
  }, [snapshotRows, snapshotPriceSortDir]);

  const lineLabel = (item: UserListItem) =>
    obscureProductDisplayName(item.product?.product_name, item.product_url);

  const lineDotFns = useMemo(
    () =>
      displayItems.map((item) =>
        lineDotRenderer(
          obscureProductDisplayName(item.product?.product_name, item.product_url),
          chartColorForProductUrl(item.product_url),
          setPointTip
        )
      ),
    [displayItems]
  );

  const chartYDomain = useMemo(
    () => priceChartYDomain(chartData, displayItems.length),
    [chartData, displayItems.length]
  );
  const [isNarrowLegend, setIsNarrowLegend] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 900px)');
    const apply = () => setIsNarrowLegend(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  const legendColumns = isNarrowLegend ? 2 : 4;
  const legendRows = Math.max(1, Math.ceil(displayItems.length / legendColumns));
  const legendHeight = Math.max(36, legendRows * 22 + 8);
  const chartTotalHeight = 720 + Math.max(0, legendHeight - 36);

  const exportGraphToPptx = useCallback(async () => {
    if (sortedSnapshotRows.length === 0 || exportPptBusy) return;
    setExportPptBusy(true);
    try {
      const { default: PptxGenJS } = await import('pptxgenjs');
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.author = 'Ценалитика';
      pptx.subject = 'Экспорт графика';
      pptx.title = `График ${fromDateLabel} - ${toDateLabel}`;

      const graphSlide = pptx.addSlide();
      graphSlide.background = { color: '1A2332' };
      graphSlide.addText(`График: ${fromDateLabel} - ${toDateLabel}`, {
        x: 0.35,
        y: 0.2,
        w: 12.0,
        h: 0.35,
        color: 'E6EDF3',
        bold: true,
        fontSize: 16,
      });

      const chartCategories = chartData.map((r) => String(r.date));
      const fillSeriesGaps = (values: Array<number | null>): number[] => {
        const out = values.slice();
        let last: number | null = null;
        for (let i = 0; i < out.length; i++) {
          if (typeof out[i] === 'number') last = out[i] as number;
          else if (last != null) out[i] = last;
        }
        let next: number | null = null;
        for (let i = out.length - 1; i >= 0; i--) {
          if (typeof out[i] === 'number') next = out[i] as number;
          else if (next != null) out[i] = next;
        }
        return out.map((v) => (typeof v === 'number' ? v : 0));
      };
      const chartSeries = displayItems.map((item, i) => ({
        name: obscureProductDisplayName(item.product?.product_name, item.product_url).slice(0, 80),
        labels: chartCategories,
        values: fillSeriesGaps(
          chartData.map((r) => {
            const v = r[`p${i}`];
            return typeof v === 'number' ? v : null;
          })
        ),
      }));

      if (chartSeries.length > 0 && chartCategories.length > 0) {
        graphSlide.addChart(pptx.ChartType.line, chartSeries, {
          x: 0.35,
          y: 0.75,
          w: 12.0,
          h: 6.25,
          showLegend: true,
          legendPos: 'b',
          legendColor: 'E6EDF3',
          catAxisLabelColor: 'E6EDF3',
          valAxisLabelColor: 'E6EDF3',
          catAxisTitleColor: 'E6EDF3',
          valAxisTitleColor: 'E6EDF3',
          catAxisLabelRotate: -45,
          valAxisTitle: 'Цена',
          catAxisTitle: 'Дата',
          chartColors: displayItems.map((item) => chartColorForProductUrl(item.product_url).replace('#', '')),
        });
      } else {
        graphSlide.addText('Нет данных графика для экспорта', {
          x: 0.6,
          y: 1.2,
          w: 7.1,
          h: 0.35,
          color: '8B9CB3',
          fontSize: 12,
        });
      }

      const tableSlide = pptx.addSlide();
      tableSlide.background = { color: '1A2332' };
      tableSlide.addText(`Список товаров на дату: ${toDateLabel}`, {
        x: 0.35,
        y: 0.2,
        w: 12.0,
        h: 0.35,
        color: 'E6EDF3',
        bold: true,
        fontSize: 16,
      });

      const toCell = (text: string): PptxGenJS_Types.TableCell => ({ text });
      const rows: PptxGenJS_Types.TableRow[] = [
        ['Товар', 'Магазин', 'Цена', 'До скидки', '%'].map(toCell),
        ...sortedSnapshotRows.slice(0, 24).map(({ item, price, priceBeforeDiscount, discountPct }) => [
          toCell(item.product?.product_name || item.product_url),
          toCell(item.product?.shop ?? '—'),
          toCell(price != null ? formatPriceDisplay(price) : '—'),
          toCell(priceBeforeDiscount != null ? formatPriceDisplay(priceBeforeDiscount) : '—'),
          toCell(discountPct != null ? `${discountPct}%` : '—'),
        ]),
      ];

      tableSlide.addTable(rows, {
        x: 0.35,
        y: 0.85,
        w: 12.0,
        h: 6.2,
        fontSize: 9,
        color: 'E6EDF3',
        border: { pt: 1, color: '2D3A4F' },
        fill: { color: '1A2332' },
        valign: 'middle',
        colW: [6.2, 2.1, 1.2, 1.3, 1.2],
      });

      const dateStamp = new Date().toISOString().slice(0, 10);
      await pptx.writeFile({ fileName: `tsenalitika-graph-${dateStamp}.pptx` });
    } catch (e) {
      console.error('PPTX export failed:', e);
      await showAlert(e instanceof Error ? e.message : 'Не удалось экспортировать PPTX', {
        title: 'Экспорт PPTX',
      });
    } finally {
      setExportPptBusy(false);
    }
  }, [sortedSnapshotRows, exportPptBusy, fromDateLabel, toDateLabel, showAlert]);

  return (
    <div className="table-page-layout graph-page-layout">
      <ProductSearchPanel
        token={token}
        existingUrls={inListUrls}
        listMaxItems={listMaxItems}
        addDisabled={!currentListId}
        onAddOne={addOneToList}
        onAddMany={handleAddManyFromSearch}
        addSelectedLabel="Добавить выбранные в график"
        addOneTitle="Добавить в график"
        alreadyInPhrase="графике"
      />

      <section className="table-section graph-chart-section">
        <div className="table-toolbar-wrap">
          <div className="table-toolbar">
            <label className="table-toolbar-field table-toolbar-field--grow">
              <span className="table-toolbar-label">График</span>
              <SingleSelectDropdown
                options={lists.map((l) => ({ value: l.id, label: l.name }))}
                value={currentListId}
                placeholder={lists.length === 0 ? 'Нет сохраненных графиков' : 'Выберите график'}
                disabled={lists.length === 0 || tableToolsBusy}
                onChange={(nextId) => setCurrentListId(nextId)}
                ariaLabel="Выбор графика"
                listLoading={listLoading}
              />
            </label>
            <label className="table-toolbar-field table-toolbar-field--grow">
              <span className="table-toolbar-label">Название нового графика</span>
              <input
                type="text"
                className="search-input table-toolbar-name"
                value={saveTableName}
                onChange={(e) => setSaveTableName(e.target.value)}
                placeholder="график 1"
                disabled={tableToolsBusy}
                {...noAutofill}
              />
            </label>
            <div className="table-toolbar-actions">
              <button
                type="button"
                className={`btn-add-all${tableToolsBusy ? ' btn-add-all--busy' : ''}`}
                disabled={tableToolsBusy || !saveTableName.trim()}
                aria-busy={tableToolsBusy}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void handleSaveTableCopy()}
              >
                {tableToolsBusy ? (
                  <>
                    <span className="btn-inline-spinner" aria-hidden />
                    Сохранение…
                  </>
                ) : (
                  'Сохранить'
                )}
              </button>
              <button
                type="button"
                className={`btn-clear-table${pendingItems !== null ? '' : ' btn-clear-table--inactive'}`}
                disabled={tableToolsBusy || pendingItems === null}
                onClick={handleDiscardPendingChanges}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn-clear-table"
                disabled={tableToolsBusy || !currentListId}
                onClick={() => void handleDeleteTable()}
              >
                Удалить
              </button>
              {currentListId && (
                <button type="button" className="btn-clear-table" onClick={handleClearRows} disabled={tableToolsBusy}>
                  Очистить строки
                </button>
              )}
              <button
                type="button"
                className="btn-add-all table-toolbar-export"
                disabled={displayItems.length === 0 || exportPptBusy}
                onClick={() => void exportGraphToPptx()}
                title="Скачать график и список в PowerPoint"
              >
                {exportPptBusy ? 'Экспорт…' : 'Экспорт PPTX'}
              </button>
            </div>
          </div>
        </div>

        <div className="list-pending-hint-slot" aria-live="polite">
          {pendingItems !== null ? (
            <p className="widget-hint">Есть несохраненные изменения строк — нажмите "Сохранить", чтобы отправить их на сервер.</p>
          ) : (
            <p className="widget-hint" aria-hidden="true">
              &nbsp;
            </p>
          )}
        </div>
        {!currentListId && lists.length === 0 && (
          <p className="widget-hint muted">Загрузка вашего графика…</p>
        )}
        <div ref={mainBlockRef} className="list-main-data-block">
          {listLoading ? (
            <div
              className="list-main-block-loading"
              style={{ minHeight: loadingMinHeightPx }}
              aria-busy
            >
              <p className="muted">Загрузка…</p>
            </div>
          ) : (
            <>
              {listWithItems && displayItems.length > 0 && (
                <DateRangeSlicerPanel
                  anchorYmd={TABLE_DATE_ANCHOR_YMD}
                  timelineMax={timelineMax}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  fromYmd={fromYmd}
                  toYmd={toYmd}
                  fromDateLabel={fromDateLabel}
                  toDateLabel={toDateLabel}
                  error={chartError || null}
                />
              )}

              {listWithItems && displayItems.length > 0 && (
                <div className="graph-snapshot-panel">
            {chartError ? (
              <p className="widget-error graph-snapshot-error">{chartError}</p>
            ) : (
              <>
                <div className="graph-snapshot-list-head" aria-hidden>
                  <span className="graph-snapshot-col-name">Товар</span>
                  <span className="graph-snapshot-col-shop">Магазин</span>
                  <button
                    type="button"
                    className="graph-snapshot-col-num table-sort-btn"
                    onClick={() =>
                      setSnapshotPriceSortDir((prev) =>
                        prev == null ? 'asc' : prev === 'asc' ? 'desc' : null
                      )
                    }
                    title="Сортировать по цене на конец периода (правая граница дат)"
                  >
                    <span className="table-sort-label">Цена</span>
                    <span className="table-sort-arrows" aria-hidden>
                      <span className={`table-sort-arrow ${snapshotPriceSortDir === 'asc' ? 'is-active' : ''}`}>▲</span>
                      <span className={`table-sort-arrow ${snapshotPriceSortDir === 'desc' ? 'is-active' : ''}`}>▼</span>
                    </span>
                  </button>
                  <span className="graph-snapshot-col-num">До скидки</span>
                  <span className="graph-snapshot-col-pct">%</span>
                  <span className="graph-snapshot-col-remove" />
                </div>
                <ul className="graph-snapshot-list" aria-label={`Цены товаров на ${toDateLabel}`}>
                  {sortedSnapshotRows.map(
                    ({ item, price, priceBeforeDiscount, discountPct, color }) => (
                      <li
                        key={item.product_url}
                        className="graph-snapshot-row"
                        style={{ borderLeftColor: color }}
                      >
                        <span className="graph-snapshot-name" title={item.product?.product_name || item.product_url}>
                          {item.product?.product_name || item.product_url}
                        </span>
                        <span
                          className="graph-snapshot-shop"
                          title={item.product?.shop ?? ''}
                        >
                          {item.product?.shop ?? '—'}
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
                            title="Удалить из списка"
                            aria-label="Удалить из списка"
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
              Если на последний день периода нет цены, показывается ближайшая доступная цена из истории (как на графике).
            </p>
                </div>
              )}

              {listWithItems && displayItems.length > 0 && chartData.length > 0 && (
                <div className="chart-container">
            <ResponsiveContainer width="100%" height={chartTotalHeight}>
              <LineChart data={chartData} margin={{ top: 8, right: 56, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis
                  stroke="var(--muted)"
                  tick={YAxisTickHideTopLabel}
                  domain={chartYDomain}
                  tickCount={Y_AXIS_TICK_COUNT}
                  interval={0}
                />
                <Tooltip active={false} cursor={false} />
                <Legend
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  height={legendHeight}
                />
                {displayItems.map((item, i) => (
                  <Line
                    key={item.product_url}
                    type="monotone"
                    dataKey={`p${i}`}
                    name={lineLabel(item)}
                    stroke={chartColorForProductUrl(item.product_url)}
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

              {listWithItems && displayItems.length > 0 && chartData.length === 0 && !chartLoading && !chartError && (
                <p className="widget-hint muted">Нет цен в выбранном диапазоне дат.</p>
              )}

              {listWithItems && displayItems.length === 0 && (
                <p className="widget-hint">
                  Найдите и добавьте товары, затем настройте диапазон дат. Нажмите &quot;Сохранить&quot;, чтобы закрепить список.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {pointTip &&
        createPortal(
          <div
            className="graph-point-tooltip"
            style={{
              position: 'fixed',
              left: pointTip.left,
              top: pointTip.top,
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
