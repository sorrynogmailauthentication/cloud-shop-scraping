import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserListItem } from '../types/dashboard';
import { fetchPriceHistoryBatched } from '../api/dashboard';
import { DateRangeSlicerPanel } from '../components/DateRangeSlicerPanel';
import { ProductSearchPanel } from '../components/ProductSearchPanel';
import { useUserListEditor } from '../hooks/useUserListEditor';
import type { PricePoint } from '../types/dashboard';
import {
  TABLE_DATE_ANCHOR_YMD,
  timelineIdxToYmd,
  timelineMaxIdx,
  defaultTimelineRange,
  enforceTimelineGap,
  priceClosestByYmd,
  deltaPctNumeric,
  formatDeltaPctOnly,
  formatDeltaPriceOnly,
  formatPriceDisplay,
  formatYmdDisplay,
} from '../utils/priceHistory';
import { obscureProductDisplayName } from '../utils/productDisplay';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type TableSortColumn =
  | 'product'
  | 'shop'
  | 'category'
  | 'link'
  | 'price'
  | 'beforeDiscount'
  | 'discountPct'
  | 'atStart'
  | 'deltaPrice'
  | 'deltaPct';

type TableSortState = { key: TableSortColumn | null; dir: 'asc' | 'desc' | null };

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
  narrow,
}: {
  columnKey: TableSortColumn;
  sort: TableSortState;
  onSort: (k: TableSortColumn) => void;
  children: ReactNode;
  className?: string;
  title?: string;
  narrow?: boolean;
}) {
  const active = sort.key === columnKey;
  const dir = active ? sort.dir : null;
  const ariaSort =
    active && dir ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      className={[className, narrow ? 'sort-th--narrow' : ''].filter(Boolean).join(' ')}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className="table-sort-btn"
        onClick={() => onSort(columnKey)}
        title={title}
      >
        <span className="table-sort-label">{children}</span>
        <span className="table-sort-arrows" aria-hidden>
          <span className={`table-sort-arrow ${dir === 'asc' ? 'is-active' : ''}`}>▲</span>
          <span className={`table-sort-arrow ${dir === 'desc' ? 'is-active' : ''}`}>▼</span>
        </span>
      </button>
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
    <main className="dashboard table-page">
      <h2>Table</h2>
      <TableContent token={token} />
    </main>
  );
}

function TableContent({ token }: { token: string | null }) {
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
  const [histByUrl, setHistByUrl] = useState<Map<string, PricePoint[]>>(() => new Map());
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState('');
  const [tableSort, setTableSort] = useState<TableSortState>({ key: null, dir: null });
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() => new Set());
  const selectedUrlsRef = useRef(selectedUrls);
  selectedUrlsRef.current = selectedUrls;
  const tableSelectMouseDownRef = useRef(false);
  const tableDragAnchorRef = useRef<number | null>(null);
  const tableItemsWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTableSort({ key: null, dir: null });
    setSelectedUrls(new Set());
  }, [currentListId]);

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
  const tableUrlsKey = useMemo(
    () => [...new Set(displayItems.map((i) => i.product_url))].sort().join('\0'),
    [displayItems]
  );

  useEffect(() => {
    if (!token || !displayItems.length) {
      setHistByUrl(new Map());
      setHistLoading(false);
      setHistError('');
      return;
    }
    const urls = [...new Set(displayItems.map((i) => i.product_url))];
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setHistLoading(true);
      setHistError('');
      fetchPriceHistoryBatched(token, urls, fromYmd, toYmd)
        .then(({ results }) => {
          if (cancelled) return;
          const m = new Map<string, PricePoint[]>();
          results.forEach((r) => m.set(r.product_url, r.history));
          setHistByUrl(m);
        })
        .catch((e) => {
          if (!cancelled) {
            setHistByUrl(new Map());
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
  }, [token, tableUrlsKey, fromYmd, toYmd]);

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

    const getP0P1 = (item: UserListItem) => {
      const h = histByUrl.get(item.product_url) ?? [];
      return {
        p0: priceClosestByYmd(h, fromYmd),
        p1: priceClosestByYmd(h, toYmd),
      };
    };

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
        case 'link':
          return cmpStr(a.product_url.toLowerCase(), b.product_url.toLowerCase(), dir);
        case 'price':
          return cmpNullableNum(a.product?.price ?? null, b.product?.price ?? null, dir);
        case 'beforeDiscount':
          return cmpNullableNum(
            a.product?.price_before_discount ?? null,
            b.product?.price_before_discount ?? null,
            dir
          );
        case 'discountPct':
          return cmpNullableNum(a.product?.discount_pct ?? null, b.product?.discount_pct ?? null, dir);
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
  }, [displayItems, tableSort, histByUrl, fromYmd, toYmd]);

  useEffect(() => {
    const onUp = () => {
      tableSelectMouseDownRef.current = false;
      tableDragAnchorRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
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
      const wrap = tableItemsWrapRef.current;
      if (!wrap || wrap.contains(e.target as Node)) return;
      setSelectedUrls(new Set());
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

  const applyRowRangeSelection = useCallback((from: number, to: number) => {
    setSelectedUrls(() => {
      const next = new Set<string>();
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      for (let i = lo; i <= hi; i++) {
        const row = sortedTableItems[i];
        if (row) next.add(row.product_url);
      }
      return next;
    });
  }, [sortedTableItems]);

  const handleTableRowMouseDown = useCallback(
    (e: MouseEvent, index: number) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('button, a')) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const url = sortedTableItems[index]?.product_url;
        if (!url) return;
        setSelectedUrls((prev) => {
          const next = new Set(prev);
          if (next.has(url)) next.delete(url);
          else next.add(url);
          return next;
        });
        return;
      }
      e.preventDefault();
      tableSelectMouseDownRef.current = true;
      tableDragAnchorRef.current = index;
      applyRowRangeSelection(index, index);
    },
    [sortedTableItems, applyRowRangeSelection]
  );

  const handleTableRowMouseEnter = useCallback(
    (index: number) => {
      if (!tableSelectMouseDownRef.current || tableDragAnchorRef.current == null) return;
      applyRowRangeSelection(tableDragAnchorRef.current, index);
    },
    [applyRowRangeSelection]
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
  };

  const handleClearTable = () => {
    clearListRows();
    setSelectedUrls(new Set());
  };

  return (
    <div className="table-page-layout">
      <ProductSearchPanel
        token={token}
        existingUrls={inListUrls}
        addDisabled={!currentListId}
        onAddOne={addOneToList}
        onAddAll={handleAddAllFromSearch}
      />

      <section className="table-section">
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
                <button type="button" className="btn-clear-table" onClick={handleClearTable} disabled={tableToolsBusy}>
                  Clear rows
                </button>
              )}
            </div>
          </div>
        </div>
        {listWithItems && displayItems.length > 0 && (
          <p className="widget-hint table-select-hint">
            Drag across rows to select a range. Ctrl/⌘+click to toggle. Click ✕ on a selected row to remove
            all selected. Click outside the table or Esc to clear selection.
          </p>
        )}
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
            loading={histLoading}
            error={histError || null}
          />
        )}
        {listWithItems && !listLoading && (
          <div className="table-wrap table-full-width" ref={tableItemsWrapRef}>
            <table className="data-table data-table--selectable">
              <thead>
                <tr>
                  <SortableTh
                    columnKey="product"
                    sort={tableSort}
                    onSort={cycleTableSort}
                  >
                    Product
                  </SortableTh>
                  <SortableTh
                    columnKey="shop"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    className="table-col-shop"
                  >
                    Shop
                  </SortableTh>
                  <SortableTh
                    columnKey="category"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    className="table-col-category"
                  >
                    Category
                  </SortableTh>
                  <SortableTh columnKey="link" sort={tableSort} onSort={cycleTableSort}>
                    Link
                  </SortableTh>
                  <SortableTh columnKey="price" sort={tableSort} onSort={cycleTableSort}>
                    Price
                  </SortableTh>
                  <SortableTh
                    columnKey="beforeDiscount"
                    sort={tableSort}
                    onSort={cycleTableSort}
                  >
                    Before discount
                  </SortableTh>
                  <SortableTh
                    columnKey="discountPct"
                    sort={tableSort}
                    onSort={cycleTableSort}
                  >
                    Discount %
                  </SortableTh>
                  <SortableTh
                    columnKey="atStart"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    title={`Closest price to ${fromDateLabel}`}
                  >
                    <abbr title={`Closest price to ${fromDateLabel}`}>@ start</abbr>
                  </SortableTh>
                  <SortableTh
                    columnKey="deltaPrice"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    title={`Price change, ${fromDateLabel} → ${toDateLabel}`}
                  >
                    <abbr title={`Price change, ${fromDateLabel} → ${toDateLabel}`}>Δ price</abbr>
                  </SortableTh>
                  <SortableTh
                    columnKey="deltaPct"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    title={`Percent change, ${fromDateLabel} → ${toDateLabel}`}
                  >
                    <abbr title={`Percent change, ${fromDateLabel} → ${toDateLabel}`}>Δ %</abbr>
                  </SortableTh>
                  <th className="sort-th--narrow" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {sortedTableItems.map((item, index) => {
                  const h = histByUrl.get(item.product_url) ?? [];
                  const p0 = priceClosestByYmd(h, fromYmd);
                  const p1 = priceClosestByYmd(h, toYmd);
                  const dn = p0 != null && p1 != null ? p1 - p0 : null;
                  const dPct = deltaPctNumeric(p0, p1);
                  return (
                    <tr
                      key={item.product_url}
                      className={selectedUrls.has(item.product_url) ? 'table-row--selected' : undefined}
                      onMouseDown={(e) => handleTableRowMouseDown(e, index)}
                      onMouseEnter={() => handleTableRowMouseEnter(index)}
                    >
                      <td className="cell-wrap">
                        {obscureProductDisplayName(item.product?.product_name, item.product_url)}
                      </td>
                      <td className="cell-wrap table-col-shop">{item.product?.shop ?? '—'}</td>
                      <td className="cell-wrap table-col-category">{item.product?.category ?? '—'}</td>
                      <td>
                        <a
                          href={item.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="table-link"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          Link
                        </a>
                      </td>
                      <td>
                        {item.product?.price != null ? formatPriceDisplay(item.product.price) : '—'}
                      </td>
                      <td>
                        {item.product?.price_before_discount != null
                          ? formatPriceDisplay(item.product.price_before_discount)
                          : '—'}
                      </td>
                      <td>{item.product?.discount_pct != null ? `${item.product.discount_pct}%` : '—'}</td>
                      <td>{histLoading ? '…' : p0 != null ? formatPriceDisplay(p0) : '—'}</td>
                      <td
                        className={
                          dn != null && dn > 0
                            ? 'table-delta table-delta--up'
                            : dn != null && dn < 0
                              ? 'table-delta table-delta--down'
                              : 'table-delta'
                        }
                      >
                        {histLoading ? '…' : formatDeltaPriceOnly(p0, p1)}
                      </td>
                      <td
                        className={
                          dPct != null && dPct > 0
                            ? 'table-delta table-delta--up'
                            : dPct != null && dPct < 0
                              ? 'table-delta table-delta--down'
                              : 'table-delta'
                        }
                      >
                        {histLoading ? '…' : formatDeltaPctOnly(p0, p1)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-remove"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            if (selectedUrls.has(item.product_url)) {
                              removeSelectedFromTable();
                            } else {
                              removeFromTable(item.product_url);
                            }
                          }}
                          title={
                            selectedUrls.has(item.product_url) && selectedUrls.size > 1
                              ? 'Remove all selected rows'
                              : 'Remove from table'
                          }
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
              <p className="muted table-empty">No items. Add from search above.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
