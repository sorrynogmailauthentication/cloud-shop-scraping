import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppDialog } from '../context/AppDialogContext';
import type { UserListItem } from '../types/dashboard';
import {
  createList,
  fetchListWithItems,
  fetchMyLists,
  fetchPricesAtDates,
} from '../api/dashboard';
import { DateRangeSlicerPanel } from '../components/DateRangeSlicerPanel';
import { ProductSearchPanel } from '../components/ProductSearchPanel';
import { SingleSelectDropdown } from '../components/SingleSelectDropdown';
import { GRAPH_LIST_MAX_ITEMS } from '../constants/listLimits';
import { useListMainPreservedHeight } from '../hooks/useListMainPreservedHeight';
import { useUserListEditor } from '../hooks/useUserListEditor';
import {
  TABLE_DATE_ANCHOR_YMD,
  timelineIdxToYmd,
  timelineYmdToIdx,
  timelineMaxIdx,
  enforceTimelineGap,
  deltaPctNumeric,
  formatDeltaPctOnly,
  formatDeltaPriceOnly,
  formatPriceDisplay,
  formatYmdDisplay,
} from '../utils/priceHistory';
import { noAutofill } from '../utils/noAutofill';

const GRAPH_SELECTED_LIST_STORAGE_KEY = 'list-editor:selected-list:graph';

type TableEndpointPrices = {
  p0: number | null;
  p1: number | null;
  beforeDiscount: number | null;
  discountPct: number | null;
};

const EMPTY_ENDPOINT_PRICES: TableEndpointPrices = {
  p0: null,
  p1: null,
  beforeDiscount: null,
  discountPct: null,
};

const TABLE_DATE_RANGE_STORAGE_KEY = 'table:date-range:v1';
const TABLE_DEFAULT_START_YMD = '2026-03-29';
const TABLE_SORT_STORAGE_PREFIX = 'table:sort:v1:';
const TABLE_COLUMN_ORDER_STORAGE_KEY = 'table:column-order:v1';
const TABLE_COLUMN_WIDTHS_STORAGE_KEY = 'table:column-widths:v1';
const TABLE_ACTIONS_COL_WIDTH = 44;
const TABLE_CHECK_COL_WIDTH = 40;
const TABLE_MIN_COLUMN_WIDTH = 56;
const TABLE_COLUMN_DRAG_THRESHOLD_PX = 5;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type TableSortColumn =
  | 'product'
  | 'shop'
  | 'category'
  | 'price'
  | 'beforeDiscount'
  | 'discountPct'
  | 'atStart'
  | 'deltaPrice'
  | 'deltaPct';

type TableSortState = { key: TableSortColumn | null; dir: 'asc' | 'desc' | null };
const TABLE_SORT_COLUMNS: TableSortColumn[] = [
  'product',
  'shop',
  'category',
  'atStart',
  'price',
  'deltaPrice',
  'deltaPct',
  'beforeDiscount',
  'discountPct',
];

const DEFAULT_COLUMN_ORDER: TableSortColumn[] = [...TABLE_SORT_COLUMNS];

const DEFAULT_COLUMN_WIDTHS: Record<TableSortColumn, number> = {
  product: 280,
  shop: 120,
  category: 160,
  atStart: 92,
  price: 92,
  deltaPrice: 88,
  deltaPct: 72,
  beforeDiscount: 100,
  discountPct: 80,
};

const COLUMN_CLASS: Record<TableSortColumn, string> = {
  product: 'table-col-product',
  shop: 'cell-wrap table-col-shop',
  category: 'cell-wrap table-col-category',
  atStart: 'table-col-num',
  price: 'table-col-num',
  deltaPrice: 'table-col-num',
  deltaPct: 'table-col-pct',
  beforeDiscount: 'table-col-num',
  discountPct: 'table-col-pct',
};

function normalizeColumnOrder(raw: unknown): TableSortColumn[] {
  if (!Array.isArray(raw)) return [...DEFAULT_COLUMN_ORDER];
  const seen = new Set<TableSortColumn>();
  const next: TableSortColumn[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    if (!TABLE_SORT_COLUMNS.includes(item as TableSortColumn)) continue;
    const key = item as TableSortColumn;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(key);
  }
  for (const key of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(key)) next.push(key);
  }
  return next;
}

function normalizeColumnWidths(raw: unknown): Record<TableSortColumn, number> {
  const next = { ...DEFAULT_COLUMN_WIDTHS };
  if (!raw || typeof raw !== 'object') return next;
  for (const key of TABLE_SORT_COLUMNS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = Math.max(TABLE_MIN_COLUMN_WIDTH, Math.round(value));
    }
  }
  return next;
}

function loadColumnOrder(): TableSortColumn[] {
  if (typeof window === 'undefined') return [...DEFAULT_COLUMN_ORDER];
  try {
    const raw = window.localStorage.getItem(TABLE_COLUMN_ORDER_STORAGE_KEY);
    if (!raw) return [...DEFAULT_COLUMN_ORDER];
    return normalizeColumnOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_COLUMN_ORDER];
  }
}

function loadColumnWidths(): Record<TableSortColumn, number> {
  if (typeof window === 'undefined') return { ...DEFAULT_COLUMN_WIDTHS };
  try {
    const raw = window.localStorage.getItem(TABLE_COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
    return normalizeColumnWidths(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

function cmpStr(a: string, b: string, dir: 'asc' | 'desc'): number {
  const c = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return dir === 'asc' ? c : -c;
}

function cmpNullableNum(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const diff = a - b;
  return dir === 'asc' ? diff : -diff;
}

function SortableTh({
  columnKey,
  sort,
  onSort,
  children,
  className,
  title,
  width,
  isDragging,
  suppressSortClickRef,
  onColumnMouseDown,
  onColumnMouseEnter,
  onResizeMouseDown,
}: {
  columnKey: TableSortColumn;
  sort: TableSortState;
  onSort: (k: TableSortColumn) => void;
  children: ReactNode;
  className?: string;
  title?: string;
  width: number;
  isDragging?: boolean;
  suppressSortClickRef: { current: boolean };
  onColumnMouseDown: (e: ReactMouseEvent, key: TableSortColumn) => void;
  onColumnMouseEnter: (key: TableSortColumn) => void;
  onResizeMouseDown: (e: ReactMouseEvent, key: TableSortColumn) => void;
}) {
  const active = sort.key === columnKey;
  const dir = active ? sort.dir : null;
  const ariaSort =
    active && dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      className={[
        className,
        'table-col-th',
        isDragging ? 'table-col--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width, minWidth: width, maxWidth: width }}
      aria-sort={ariaSort}
      onMouseDown={(e) => onColumnMouseDown(e, columnKey)}
      onMouseEnter={() => onColumnMouseEnter(columnKey)}
    >
      <button
        type="button"
        className="table-sort-btn"
        title={title}
        onClick={() => {
          if (suppressSortClickRef.current) return;
          onSort(columnKey);
        }}
      >
        <span className="table-sort-label">{children}</span>
        <span className="table-sort-arrows" aria-hidden>
          <span className={`table-sort-arrow ${dir === 'asc' ? 'is-active' : ''}`}>▲</span>
          <span className={`table-sort-arrow ${dir === 'desc' ? 'is-active' : ''}`}>▼</span>
        </span>
      </button>
      <span
        className="col-resize-handle"
        title="Изменить ширину"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResizeMouseDown(e, columnKey);
        }}
      />
    </th>
  );
}

export default function TablePage() {
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
    <main className="dashboard table-page">
      <h2>Таблица</h2>
      <TableContent token={token} />
    </main>
  );
}

function TableContent({ token }: { token: string | null }) {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useAppDialog();
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
  } = useUserListEditor(token, { listKind: 'table' });

  const { mainBlockRef, loadingMinHeightPx } = useListMainPreservedHeight(listLoading, tableToolsBusy);
  const [sendToGraphBusy, setSendToGraphBusy] = useState(false);

  const timelineMax = timelineMaxIdx(TABLE_DATE_ANCHOR_YMD);
  const [dateRange, setDateRange] = useState(() => {
    const max = timelineMaxIdx(TABLE_DATE_ANCHOR_YMD);
    const defaultStart = timelineYmdToIdx(TABLE_DATE_ANCHOR_YMD, TABLE_DEFAULT_START_YMD, max);
    const fallback = enforceTimelineGap(defaultStart, max, max);
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(TABLE_DATE_RANGE_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as { start?: unknown; end?: unknown };
      if (typeof parsed.start !== 'number' || typeof parsed.end !== 'number') return fallback;
      return enforceTimelineGap(parsed.start, parsed.end, max);
    } catch {
      return fallback;
    }
  });
  const [pricesByUrl, setPricesByUrl] = useState<Map<string, TableEndpointPrices>>(() => new Map());
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState('');
  const histCacheRef = useRef<Map<string, TableEndpointPrices>>(new Map());
  const histWindowKeyRef = useRef<string>('');
  const [tableSort, setTableSort] = useState<TableSortState>({ key: null, dir: null });
  const [columnOrder, setColumnOrder] = useState<TableSortColumn[]>(loadColumnOrder);
  const [columnWidths, setColumnWidths] = useState<Record<TableSortColumn, number>>(loadColumnWidths);
  const [draggingColumnKey, setDraggingColumnKey] = useState<TableSortColumn | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() => new Set());
  const selectedUrlsRef = useRef(selectedUrls);
  selectedUrlsRef.current = selectedUrls;
  const [draggingUrl, setDraggingUrl] = useState<string | null>(null);
  const tableRowDragActiveRef = useRef(false);
  const tableRowDragIndexRef = useRef<number | null>(null);
  const tableRowDragOrderRef = useRef<UserListItem[] | null>(null);
  const tableColDragActiveRef = useRef(false);
  const tableColDragKeyRef = useRef<TableSortColumn | null>(null);
  const tableColDragOrderRef = useRef<TableSortColumn[] | null>(null);
  const tableColDragMovedRef = useRef(false);
  const tableColDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressSortClickRef = useRef(false);
  const columnResizeRef = useRef<{
    key: TableSortColumn;
    startX: number;
    startWidth: number;
  } | null>(null);
  const tableItemsWrapRef = useRef<HTMLDivElement>(null);
  const sendToGraphRef = useRef<HTMLDivElement>(null);
  const selectionActionsRef = useRef<HTMLDivElement>(null);
  const selectionAnchorRef = useRef<number | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(TABLE_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      // Ignore localStorage failures.
    }
  }, [columnOrder]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TABLE_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
    } catch {
      // Ignore localStorage failures.
    }
  }, [columnWidths]);

  const tableTotalWidth = useMemo(
    () =>
      TABLE_CHECK_COL_WIDTH +
      columnOrder.reduce((sum, key) => sum + columnWidths[key], 0) +
      TABLE_ACTIONS_COL_WIDTH,
    [columnOrder, columnWidths]
  );

  useEffect(() => {
    setSelectedUrls(new Set());
    selectionAnchorRef.current = null;
  }, [currentListId]);

  useEffect(() => {
    if (!currentListId) {
      setTableSort({ key: null, dir: null });
      return;
    }
    try {
      const raw = window.localStorage.getItem(`${TABLE_SORT_STORAGE_PREFIX}${currentListId}`);
      if (!raw) {
        setTableSort({ key: null, dir: null });
        return;
      }
      const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown };
      const key = parsed.key;
      const dir = parsed.dir;
      if (
        (key === null || TABLE_SORT_COLUMNS.includes(key as TableSortColumn)) &&
        (dir === null || dir === 'asc' || dir === 'desc')
      ) {
        setTableSort({
          key: (key ?? null) as TableSortColumn | null,
          dir: (dir ?? null) as 'asc' | 'desc' | null,
        });
      } else {
        setTableSort({ key: null, dir: null });
      }
    } catch {
      setTableSort({ key: null, dir: null });
    }
  }, [currentListId]);

  useEffect(() => {
    if (!currentListId) return;
    try {
      window.localStorage.setItem(`${TABLE_SORT_STORAGE_PREFIX}${currentListId}`, JSON.stringify(tableSort));
    } catch {
      // Ignore localStorage failures.
    }
  }, [currentListId, tableSort]);

  useEffect(() => {
    setDateRange((r) => enforceTimelineGap(r.start, r.end, timelineMax));
  }, [timelineMax]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TABLE_DATE_RANGE_STORAGE_KEY, JSON.stringify(dateRange));
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
  const tableUrlsKey = useMemo(
    () => [...new Set(displayItems.map((i) => i.product_url))].sort().join('\0'),
    [displayItems]
  );

  useEffect(() => {
    if (!token || !displayItems.length || listLoading) {
      histWindowKeyRef.current = '';
      histCacheRef.current = new Map();
      setPricesByUrl(new Map());
      setHistLoading(false);
      setHistError('');
      return;
    }
    const windowKey = `${fromYmd}|${toYmd}`;
    if (histWindowKeyRef.current !== windowKey) {
      histWindowKeyRef.current = windowKey;
      histCacheRef.current = new Map();
    }
    const urls = [...new Set(displayItems.map((i) => i.product_url))];
    const urlSet = new Set(urls);
    let cacheChanged = false;
    for (const url of [...histCacheRef.current.keys()]) {
      if (urlSet.has(url)) continue;
      histCacheRef.current.delete(url);
      cacheChanged = true;
    }
    const missingUrls = urls.filter((u) => !histCacheRef.current.has(u));
    if (missingUrls.length === 0) {
      if (cacheChanged) setPricesByUrl(new Map(histCacheRef.current));
      setHistLoading(false);
      setHistError('');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setHistLoading(true);
      setHistError('');
      fetchPricesAtDates(token, missingUrls, fromYmd, toYmd)
        .then(({ results }) => {
          if (cancelled) return;
          for (const url of missingUrls) {
            histCacheRef.current.set(url, EMPTY_ENDPOINT_PRICES);
          }
          results.forEach((r) =>
            histCacheRef.current.set(r.product_url, {
              p0: r.price_at_start,
              p1: r.price_at_end,
              beforeDiscount: r.price_before_discount,
              discountPct: r.discount_pct,
            })
          );
          setPricesByUrl(new Map(histCacheRef.current));
        })
        .catch((e) => {
          if (!cancelled) {
            setHistError(e instanceof Error ? e.message : 'Failed to load prices');
          }
        })
        .finally(() => {
          if (!cancelled) setHistLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, tableUrlsKey, fromYmd, toYmd, listLoading]);

  const cycleTableSort = useCallback((key: TableSortColumn) => {
    setTableSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: null };
    });
  }, []);

  const sortedTableItems = useMemo((): UserListItem[] => {
    const items = displayItems;
    if (!items?.length) return [];
    const copy = [...items];
    const { key, dir } = tableSort;
    if (!key || !dir) return copy;

    const getP0P1 = (item: UserListItem) =>
      pricesByUrl.get(item.product_url) ?? EMPTY_ENDPOINT_PRICES;

    copy.sort((a, b) => {
      switch (key) {
        case 'product':
          return cmpStr(
            (a.product?.product_name || a.product_url).toLowerCase(),
            (b.product?.product_name || b.product_url).toLowerCase(),
            dir
          );
        case 'shop':
          return cmpStr(
            (a.product?.shop ?? '').toLowerCase(),
            (b.product?.shop ?? '').toLowerCase(),
            dir
          );
        case 'category':
          return cmpStr(
            (a.product?.category ?? '').toLowerCase(),
            (b.product?.category ?? '').toLowerCase(),
            dir
          );
        case 'price':
          return cmpNullableNum(getP0P1(a).p1, getP0P1(b).p1, dir);
        case 'beforeDiscount':
          return cmpNullableNum(getP0P1(a).beforeDiscount, getP0P1(b).beforeDiscount, dir);
        case 'discountPct':
          return cmpNullableNum(getP0P1(a).discountPct, getP0P1(b).discountPct, dir);
        case 'atStart': {
          const { p0: a0 } = getP0P1(a);
          const { p0: b0 } = getP0P1(b);
          return cmpNullableNum(a0, b0, dir);
        }
        case 'deltaPrice': {
          const { p0: a0, p1: a1 } = getP0P1(a);
          const { p0: b0, p1: b1 } = getP0P1(b);
          const da = a0 != null && a1 != null ? a1 - a0 : null;
          const db = b0 != null && b1 != null ? b1 - b0 : null;
          return cmpNullableNum(da, db, dir);
        }
        case 'deltaPct': {
          const { p0: a0, p1: a1 } = getP0P1(a);
          const { p0: b0, p1: b1 } = getP0P1(b);
          return cmpNullableNum(deltaPctNumeric(a0, a1), deltaPctNumeric(b0, b1), dir);
        }
        default:
          return 0;
      }
    });
    return copy;
  }, [displayItems, tableSort, pricesByUrl]);

  useEffect(() => {
    const endPointerInteractions = () => {
      tableRowDragActiveRef.current = false;
      tableRowDragIndexRef.current = null;
      tableRowDragOrderRef.current = null;
      setDraggingUrl(null);

      tableColDragActiveRef.current = false;
      tableColDragKeyRef.current = null;
      tableColDragOrderRef.current = null;
      tableColDragStartRef.current = null;
      setDraggingColumnKey(null);
      // Keep suppress flag until after the click that follows a drag.
      if (tableColDragMovedRef.current) {
        window.setTimeout(() => {
          tableColDragMovedRef.current = false;
          suppressSortClickRef.current = false;
        }, 0);
      }

      if (columnResizeRef.current) {
        columnResizeRef.current = null;
        document.body.classList.remove('is-col-resizing');
      }
    };

    const onMove = (e: MouseEvent) => {
      const resize = columnResizeRef.current;
      if (resize) {
        const nextWidth = Math.max(
          TABLE_MIN_COLUMN_WIDTH,
          Math.round(resize.startWidth + (e.clientX - resize.startX))
        );
        setColumnWidths((prev) =>
          prev[resize.key] === nextWidth ? prev : { ...prev, [resize.key]: nextWidth }
        );
        return;
      }

      if (!tableColDragActiveRef.current || !tableColDragStartRef.current) return;
      const dx = Math.abs(e.clientX - tableColDragStartRef.current.x);
      const dy = Math.abs(e.clientY - tableColDragStartRef.current.y);
      if (dx > TABLE_COLUMN_DRAG_THRESHOLD_PX || dy > TABLE_COLUMN_DRAG_THRESHOLD_PX) {
        tableColDragMovedRef.current = true;
        suppressSortClickRef.current = true;
        if (tableColDragKeyRef.current) setDraggingColumnKey(tableColDragKeyRef.current);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', endPointerInteractions);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', endPointerInteractions);
      document.body.classList.remove('is-col-resizing');
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedUrls(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (selectedUrlsRef.current.size === 0) return;
      const target = e.target as Node;
      const wrap = tableItemsWrapRef.current;
      if (wrap?.contains(target)) return;
      if (sendToGraphRef.current?.contains(target)) return;
      if (selectionActionsRef.current?.contains(target)) return;
      setSelectedUrls(new Set());
      selectionAnchorRef.current = null;
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    setSelectedUrls((prev) => {
      const allowed = new Set(sortedTableItems.map((i) => i.product_url));
      const next = new Set([...prev].filter((u) => allowed.has(u)));
      return next.size === prev.size ? prev : next;
    });
  }, [sortedTableItems]);

  const allRowsSelected =
    sortedTableItems.length > 0 && sortedTableItems.every((i) => selectedUrls.has(i.product_url));
  const someRowsSelected = selectedUrls.size > 0 && !allRowsSelected;

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) el.indeterminate = someRowsSelected;
  }, [someRowsSelected]);

  const handleRowCheckboxChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, index: number) => {
      const url = sortedTableItems[index]?.product_url;
      if (!url) return;

      const mouse = e.nativeEvent as MouseEvent;
      const shiftKey = Boolean(mouse.shiftKey);
      const checked = e.target.checked;

      if (shiftKey && selectionAnchorRef.current != null) {
        const lo = Math.min(selectionAnchorRef.current, index);
        const hi = Math.max(selectionAnchorRef.current, index);
        setSelectedUrls(() => {
          const next = new Set<string>();
          for (let i = lo; i <= hi; i++) {
            const row = sortedTableItems[i];
            if (row) next.add(row.product_url);
          }
          return next;
        });
        return;
      }

      // Native checkbox behavior: toggle this row, keep the rest.
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        if (checked) next.add(url);
        else next.delete(url);
        return next;
      });
      selectionAnchorRef.current = index;
    },
    [sortedTableItems]
  );

  const handleToggleSelectAll = useCallback(() => {
    if (allRowsSelected) {
      setSelectedUrls(new Set());
      selectionAnchorRef.current = null;
      return;
    }
    setSelectedUrls(new Set(sortedTableItems.map((i) => i.product_url)));
    selectionAnchorRef.current = sortedTableItems.length > 0 ? 0 : null;
  }, [allRowsSelected, sortedTableItems]);

  const handleTableRowMouseDown = useCallback(
    (e: ReactMouseEvent, index: number) => {
      if (e.button !== 0) return;
      if (columnResizeRef.current || tableColDragActiveRef.current) return;
      const t = e.target as HTMLElement;
      // Checkbox / actions / product name: no drag (name stays text-selectable).
      if (t.closest('button, a, input, label, .table-col-check, .table-col-product')) return;
      const url = sortedTableItems[index]?.product_url;
      if (!url) return;
      e.preventDefault();
      tableRowDragActiveRef.current = true;
      tableRowDragIndexRef.current = index;
      tableRowDragOrderRef.current = sortedTableItems.map((item, i) =>
        item.position === i ? item : { ...item, position: i }
      );
      setDraggingUrl(url);
    },
    [sortedTableItems]
  );

  const handleTableRowMouseEnter = useCallback(
    (index: number) => {
      if (!tableRowDragActiveRef.current || tableRowDragIndexRef.current == null) return;
      const from = tableRowDragIndexRef.current;
      const order = tableRowDragOrderRef.current;
      if (!order || from === index || from < 0 || index < 0) return;
      if (from >= order.length || index >= order.length) return;
      const next = [...order];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      const withPositions = next.map((item, i) =>
        item.position === i ? item : { ...item, position: i }
      );
      tableRowDragOrderRef.current = withPositions;
      tableRowDragIndexRef.current = index;
      setPendingItems(withPositions);
      setTableSort((prev) => (prev.key == null ? prev : { key: null, dir: null }));
    },
    [setPendingItems]
  );

  const handleColumnMouseDown = useCallback(
    (e: ReactMouseEvent, key: TableSortColumn) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('.col-resize-handle')) return;
      e.preventDefault();
      tableColDragActiveRef.current = true;
      tableColDragKeyRef.current = key;
      tableColDragOrderRef.current = [...columnOrder];
      tableColDragMovedRef.current = false;
      suppressSortClickRef.current = false;
      tableColDragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [columnOrder]
  );

  const handleColumnMouseEnter = useCallback((key: TableSortColumn) => {
    if (!tableColDragActiveRef.current || !tableColDragMovedRef.current) return;
    const fromKey = tableColDragKeyRef.current;
    const order = tableColDragOrderRef.current;
    if (!fromKey || !order || fromKey === key) return;
    const from = order.indexOf(fromKey);
    const to = order.indexOf(key);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    tableColDragOrderRef.current = next;
    tableColDragKeyRef.current = fromKey;
    setColumnOrder(next);
  }, []);

  const handleColumnResizeMouseDown = useCallback(
    (e: ReactMouseEvent, key: TableSortColumn) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      columnResizeRef.current = {
        key,
        startX: e.clientX,
        startWidth: columnWidths[key],
      };
      document.body.classList.add('is-col-resizing');
    },
    [columnWidths]
  );

  const renderColumnHeader = useCallback(
    (key: TableSortColumn) => {
      switch (key) {
        case 'product':
          return { children: 'Товар' as ReactNode };
        case 'shop':
          return { children: 'Магазин' as ReactNode };
        case 'category':
          return { children: 'Категория' as ReactNode };
        case 'atStart':
          return {
            title: `Ближайшая цена к ${fromDateLabel}`,
            children: (
              <abbr title={`Ближайшая цена к ${fromDateLabel}`}>
                Цена,
                <br />
                начало
              </abbr>
            ) as ReactNode,
          };
        case 'price':
          return {
            title: `Ближайшая цена к ${toDateLabel}`,
            children: (
              <abbr title={`Ближайшая цена к ${toDateLabel}`}>
                Цена,
                <br />
                конец
              </abbr>
            ) as ReactNode,
          };
        case 'deltaPrice':
          return {
            title: `Изменение цены, ${fromDateLabel} → ${toDateLabel}`,
            children: (
              <abbr title={`Изменение цены, ${fromDateLabel} → ${toDateLabel}`}>Δ цена</abbr>
            ) as ReactNode,
          };
        case 'deltaPct':
          return {
            title: `Процентное изменение, ${fromDateLabel} → ${toDateLabel}`,
            children: (
              <abbr title={`Процентное изменение, ${fromDateLabel} → ${toDateLabel}`}>Δ %</abbr>
            ) as ReactNode,
          };
        case 'beforeDiscount':
          return {
            title: `Цена до скидки на ${toDateLabel}, если скидка есть`,
            children: (
              <abbr title={`Цена до скидки на ${toDateLabel}, если скидка есть`}>До скидки</abbr>
            ) as ReactNode,
          };
        case 'discountPct':
          return {
            title: `Скидка на ${toDateLabel}, если есть`,
            children: (
              <abbr title={`Скидка на ${toDateLabel}, если есть`}>Скидка %</abbr>
            ) as ReactNode,
          };
        default:
          return { children: null as ReactNode };
      }
    },
    [fromDateLabel, toDateLabel]
  );

  const renderColumnCell = useCallback(
    (key: TableSortColumn, item: UserListItem, prices: TableEndpointPrices) => {
      const { p0, p1, beforeDiscount, discountPct } = prices;
      const dn = p0 != null && p1 != null ? p1 - p0 : null;
      const dPct = deltaPctNumeric(p0, p1);
      switch (key) {
        case 'product':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              title={item.product?.product_name || item.product_url}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              <span className="table-col-product-text">
                {item.product?.product_name || item.product_url}
              </span>
            </td>
          );
        case 'shop':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {item.product?.shop ?? '—'}
            </td>
          );
        case 'category':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {item.product?.category ?? '—'}
            </td>
          );
        case 'atStart':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {histLoading ? '…' : p0 != null ? formatPriceDisplay(p0) : '—'}
            </td>
          );
        case 'price':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {histLoading ? '…' : p1 != null ? formatPriceDisplay(p1) : '—'}
            </td>
          );
        case 'deltaPrice':
          return (
            <td
              key={key}
              className={
                (dn != null && dn > 0
                  ? 'table-delta table-delta--down'
                  : dn != null && dn < 0
                    ? 'table-delta table-delta--up'
                    : 'table-delta') +
                ' ' +
                COLUMN_CLASS[key]
              }
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {histLoading ? '…' : formatDeltaPriceOnly(p0, p1)}
            </td>
          );
        case 'deltaPct':
          return (
            <td
              key={key}
              className={
                (dPct != null && dPct > 0
                  ? 'table-delta table-delta--down'
                  : dPct != null && dPct < 0
                    ? 'table-delta table-delta--up'
                    : 'table-delta') +
                ' ' +
                COLUMN_CLASS[key]
              }
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {histLoading ? '…' : formatDeltaPctOnly(p0, p1)}
            </td>
          );
        case 'beforeDiscount':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {histLoading
                ? '…'
                : beforeDiscount != null
                  ? formatPriceDisplay(beforeDiscount)
                  : '—'}
            </td>
          );
        case 'discountPct':
          return (
            <td
              key={key}
              className={COLUMN_CLASS[key]}
              style={{ width: columnWidths[key], minWidth: columnWidths[key], maxWidth: columnWidths[key] }}
            >
              {histLoading ? '…' : discountPct != null ? `${discountPct}%` : '—'}
            </td>
          );
        default:
          return null;
      }
    },
    [columnWidths, histLoading]
  );

  const removeFromTable = (productUrl: string) => {
    if (!currentListId) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    setPendingItems(base.filter((i) => i.product_url !== productUrl));
    setSelectedUrls((prev) => {
      const n = new Set(prev);
      n.delete(productUrl);
      return n;
    });
  };

  const removeSelectedFromTable = () => {
    if (!currentListId || selectedUrls.size === 0) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    setPendingItems(base.filter((i) => !selectedUrls.has(i.product_url)));
    setSelectedUrls(new Set());
    selectionAnchorRef.current = null;
  };

  const clearRowSelection = () => {
    setSelectedUrls(new Set());
    selectionAnchorRef.current = null;
  };

  const handleClearTable = () => {
    clearListRows();
    setSelectedUrls(new Set());
    selectionAnchorRef.current = null;
  };

  const handleSendTableToGraph = useCallback(async () => {
    if (!token || sendToGraphBusy) return;

    let items = [...sortedTableItems];
    if (items.length === 0) {
      await showAlert('В таблице нет товаров для переноса на график.', {
        title: 'Пустая таблица',
      });
      return;
    }

    if (items.length > GRAPH_LIST_MAX_ITEMS) {
      const ok = await showConfirm(
        `На графике не больше ${GRAPH_LIST_MAX_ITEMS} товаров. Перенести первые ${GRAPH_LIST_MAX_ITEMS} из ${items.length}?`,
        {
          title: 'Лимит графика',
          confirmLabel: 'Перенести',
          cancelLabel: 'Отмена',
        }
      );
      if (!ok) return;
      items = items.slice(0, GRAPH_LIST_MAX_ITEMS);
    }

    setSendToGraphBusy(true);
    try {
      let { lists: graphLists } = await fetchMyLists(token, 'graph');
      let targetId: string | null = null;
      try {
        const stored = window.localStorage.getItem(GRAPH_SELECTED_LIST_STORAGE_KEY);
        if (stored && graphLists.some((l) => l.id === stored)) targetId = stored;
      } catch {
        // Ignore storage failures.
      }
      if (!targetId) targetId = graphLists[0]?.id ?? null;
      if (!targetId) {
        const { list } = await createList(token, 'график 1', null, 'graph');
        targetId = list.id;
        graphLists = [list];
      }

      const { list: graphList } = await fetchListWithItems(token, targetId);
      const pendingKey = `list-editor:pending:graph:${targetId}`;
      let hasLocalPending = false;
      try {
        hasLocalPending = Boolean(window.localStorage.getItem(pendingKey));
      } catch {
        hasLocalPending = false;
      }
      if (hasLocalPending || graphList.items.length > 0) {
        const ok = await showConfirm(
          `Заменить товары в графике «${graphList.name}» всей текущей таблицей (${items.length})? Несохранённые изменения на графике будут перезаписаны.`,
          {
            title: 'На график',
            confirmLabel: 'Заменить',
            cancelLabel: 'Отмена',
          }
        );
        if (!ok) return;
      }

      const pending: UserListItem[] = items.map((item, i) => ({
        id: -(Date.now() + i),
        list_id: targetId!,
        product_url: item.product_url,
        position: i,
        created_at: new Date().toISOString(),
        product_id: item.product_id,
        product: item.product,
      }));

      try {
        window.localStorage.setItem(pendingKey, JSON.stringify(pending));
        window.localStorage.setItem(GRAPH_SELECTED_LIST_STORAGE_KEY, targetId);
      } catch {
        await showAlert('Не удалось сохранить таблицу для графика (localStorage).', {
          title: 'Ошибка',
        });
        return;
      }

      navigate('/graph');
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Не удалось перенести на график', {
        title: 'Ошибка',
      });
    } finally {
      setSendToGraphBusy(false);
    }
  }, [token, sendToGraphBusy, sortedTableItems, showAlert, showConfirm, navigate]);

  const exportTableToCsv = useCallback(() => {
    if (sortedTableItems.length === 0) return;

    const csvEscape = (value: string): string => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };

    const headers = [
      'Товар',
      'Магазин',
      'Категория',
      `Цена, начало (${fromDateLabel})`,
      `Цена, конец (${toDateLabel})`,
      `До скидки (${toDateLabel})`,
      `Скидка % (${toDateLabel})`,
      'Δ цена',
      'Δ %',
    ];

    const lines = [
      csvEscape(`Диапазон дат: ${fromDateLabel} -> ${toDateLabel}`),
      headers.map(csvEscape).join(','),
    ];

    for (const item of sortedTableItems) {
      const { p0, p1, beforeDiscount, discountPct } =
        pricesByUrl.get(item.product_url) ?? EMPTY_ENDPOINT_PRICES;
      const row = [
        item.product?.product_name || item.product_url,
        item.product?.shop ?? '',
        item.product?.category ?? '',
        p0 != null ? formatPriceDisplay(p0) : '',
        p1 != null ? formatPriceDisplay(p1) : '',
        beforeDiscount != null ? formatPriceDisplay(beforeDiscount) : '',
        discountPct != null ? `${discountPct}%` : '',
        formatDeltaPriceOnly(p0, p1) === '—' ? '' : formatDeltaPriceOnly(p0, p1),
        formatDeltaPctOnly(p0, p1) === '—' ? '' : formatDeltaPctOnly(p0, p1),
      ];
      lines.push(row.map((v) => csvEscape(String(v))).join(','));
    }

    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tsenalitika-table-${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sortedTableItems, pricesByUrl, fromDateLabel, toDateLabel]);

  return (
    <div className="table-page-layout">
      <ProductSearchPanel
        token={token}
        existingUrls={inListUrls}
        listMaxItems={listMaxItems}
        addDisabled={!currentListId}
        onAddOne={addOneToList}
        onAddMany={handleAddManyFromSearch}
      />

      <section className="table-section">
        <div className="table-toolbar-row">
          <div className="table-toolbar-wrap">
            <div className="table-toolbar">
            <label className="table-toolbar-field table-toolbar-field--grow">
              <span className="table-toolbar-label">Таблица</span>
              <SingleSelectDropdown
                options={lists.map((l) => ({ value: l.id, label: l.name }))}
                value={currentListId}
                placeholder={lists.length === 0 ? 'Нет таблиц' : 'Выберите таблицу'}
                disabled={lists.length === 0 || tableToolsBusy}
                onChange={(nextId) => setCurrentListId(nextId)}
                ariaLabel="Выбор таблицы"
                listLoading={listLoading}
              />
            </label>
            <label className="table-toolbar-field table-toolbar-field--grow">
              <span className="table-toolbar-label">Название новой таблицы</span>
              <input
                type="text"
                className="search-input table-toolbar-name"
                value={saveTableName}
                onChange={(e) => setSaveTableName(e.target.value)}
                placeholder="таблица 1"
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
                <button type="button" className="btn-clear-table" onClick={handleClearTable} disabled={tableToolsBusy}>
                  Очистить строки
                </button>
              )}
              <button
                type="button"
                className="btn-add-all table-toolbar-export"
                disabled={displayItems.length === 0}
                onClick={exportTableToCsv}
                title="Скачать текущую таблицу в CSV"
              >
                Экспорт CSV
              </button>
            </div>
          </div>
          </div>
          <div className="table-secondary-actions">
          <div className="table-send-to-graph" ref={sendToGraphRef}>
            <button
              type="button"
              className={`btn-add-all table-send-to-graph-btn${sendToGraphBusy ? ' btn-add-all--busy' : ''}`}
              disabled={sendToGraphBusy || sortedTableItems.length === 0}
              aria-busy={sendToGraphBusy}
              onClick={() => void handleSendTableToGraph()}
              title={
                sortedTableItems.length === 0
                  ? 'В таблице нет товаров'
                  : `Перенести всю таблицу (${sortedTableItems.length}) на график`
              }
            >
              {sendToGraphBusy ? (
                <>
                  <span className="btn-inline-spinner" aria-hidden />
                  На график…
                </>
              ) : sortedTableItems.length > 0 ? (
                `На график (${sortedTableItems.length})`
              ) : (
                'На график'
              )}
            </button>
          </div>
          {selectedUrls.size > 0 && (
            <div className="table-selection-actions" ref={selectionActionsRef}>
              <span className="table-selection-count">Выбрано: {selectedUrls.size}</span>
              <button
                type="button"
                className="btn-clear-table"
                onClick={removeSelectedFromTable}
                title="Удалить выбранные строки"
              >
                Удалить выделенные
              </button>
              <button
                type="button"
                className="btn-add-all"
                onClick={clearRowSelection}
                title="Снять выделение"
              >
                Снять выделение
              </button>
            </div>
          )}
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
          <p className="widget-hint muted">Загрузка вашей таблицы…</p>
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
                  error={histError || null}
                />
              )}
              {listWithItems && (
                <div className="table-wrap table-full-width" ref={tableItemsWrapRef}>
            <table
              className="data-table data-table--selectable data-table--resizable"
              style={{ width: tableTotalWidth, minWidth: tableTotalWidth }}
            >
              <colgroup>
                <col style={{ width: TABLE_CHECK_COL_WIDTH }} />
                {columnOrder.map((key) => (
                  <col key={key} style={{ width: columnWidths[key] }} />
                ))}
                <col style={{ width: TABLE_ACTIONS_COL_WIDTH }} />
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="table-col-check"
                    style={{
                      width: TABLE_CHECK_COL_WIDTH,
                      minWidth: TABLE_CHECK_COL_WIDTH,
                      maxWidth: TABLE_CHECK_COL_WIDTH,
                    }}
                  >
                    <input
                      ref={selectAllCheckboxRef}
                      type="checkbox"
                      className="table-row-checkbox"
                      checked={allRowsSelected}
                      onChange={handleToggleSelectAll}
                      disabled={sortedTableItems.length === 0}
                      aria-label="Выделить все строки"
                      title="Выделить все"
                    />
                  </th>
                  {columnOrder.map((key) => {
                    const header = renderColumnHeader(key);
                    return (
                      <SortableTh
                        key={key}
                        columnKey={key}
                        sort={tableSort}
                        onSort={cycleTableSort}
                        className={COLUMN_CLASS[key]}
                        title={header.title}
                        width={columnWidths[key]}
                        isDragging={draggingColumnKey === key}
                        suppressSortClickRef={suppressSortClickRef}
                        onColumnMouseDown={handleColumnMouseDown}
                        onColumnMouseEnter={handleColumnMouseEnter}
                        onResizeMouseDown={handleColumnResizeMouseDown}
                      >
                        {header.children}
                      </SortableTh>
                    );
                  })}
                  <th
                    className="sort-th--narrow table-col-actions"
                    aria-label="Удалить"
                    style={{
                      width: TABLE_ACTIONS_COL_WIDTH,
                      minWidth: TABLE_ACTIONS_COL_WIDTH,
                      maxWidth: TABLE_ACTIONS_COL_WIDTH,
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedTableItems.map((item, index) => {
                  const prices = pricesByUrl.get(item.product_url) ?? EMPTY_ENDPOINT_PRICES;
                  const isSelected = selectedUrls.has(item.product_url);
                  return (
                    <tr
                      key={item.product_url}
                      className={[
                        isSelected ? 'table-row--selected' : '',
                        draggingUrl === item.product_url ? 'table-row--dragging' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined}
                      onMouseDown={(e) => handleTableRowMouseDown(e, index)}
                      onMouseEnter={() => handleTableRowMouseEnter(index)}
                    >
                      <td
                        className="table-col-check"
                        style={{
                          width: TABLE_CHECK_COL_WIDTH,
                          minWidth: TABLE_CHECK_COL_WIDTH,
                          maxWidth: TABLE_CHECK_COL_WIDTH,
                        }}
                      >
                        <input
                          type="checkbox"
                          className="table-row-checkbox"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleRowCheckboxChange(e, index)}
                          aria-label={`Выбрать ${item.product?.product_name || item.product_url}`}
                        />
                      </td>
                      {columnOrder.map((key) => renderColumnCell(key, item, prices))}
                      <td
                        className="table-col-actions"
                        style={{
                          width: TABLE_ACTIONS_COL_WIDTH,
                          minWidth: TABLE_ACTIONS_COL_WIDTH,
                          maxWidth: TABLE_ACTIONS_COL_WIDTH,
                        }}
                      >
                        <button
                          type="button"
                          className="btn-remove"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => removeFromTable(item.product_url)}
                          title="Удалить из таблицы"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {displayItems.length === 0 && (
              <p className="muted table-empty">Нет элементов. Добавьте их через поиск выше.</p>
            )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
