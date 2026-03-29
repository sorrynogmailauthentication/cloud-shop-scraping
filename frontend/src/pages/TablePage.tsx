import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ProductWithPrice, ListWithItems, UserList, UserListItem } from '../types/dashboard';
import {
  searchProducts,
  fetchShops,
  fetchShopCategoryPairs,
  fetchMyLists,
  fetchListWithItems,
  createList,
  deleteListApi,
  addProductToList,
  clearListItems,
  fetchPriceHistoryBatched,
} from '../api/dashboard';
import type { ShopCategoryPair } from '../api/dashboard';
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
} from '../utils/priceHistory';

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

function rowFromSearchProduct(p: ProductWithPrice, listId: string, seq: number): UserListItem {
  return {
    id: -(Date.now() + seq),
    list_id: listId,
    product_url: p.url,
    position: seq,
    created_at: new Date().toISOString(),
    product: p,
  };
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
  const [searchOpen, setSearchOpen] = useState(false);
  const SEARCH_PAGE_SIZE = 20;
  const [searchQ, setSearchQ] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [searchShops, setSearchShops] = useState<string[]>([]);
  const [searchCategoryPairs, setSearchCategoryPairs] = useState<string[]>([]);
  const [priceAbove, setPriceAbove] = useState('');
  const [priceBelow, setPriceBelow] = useState('');
  const [shops, setShops] = useState<string[]>([]);
  const [shopCategoryPairs, setShopCategoryPairs] = useState<ShopCategoryPair[]>([]);
  const [resultFilterName1, setResultFilterName1] = useState('');
  const [resultFilterName2, setResultFilterName2] = useState('');
  const [resultFilterName3, setResultFilterName3] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithPrice[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const shopDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        shopDropdownRef.current && !shopDropdownRef.current.contains(e.target as Node)
      ) setShopDropdownOpen(false);
      if (
        categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)
      ) setCategoryDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [lists, setLists] = useState<UserList[]>([]);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [listWithItems, setListWithItems] = useState<ListWithItems | null>(null);
  const [listLoading, setListLoading] = useState(false);
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
  const [saveTableName, setSaveTableName] = useState('');
  const [tableToolsBusy, setTableToolsBusy] = useState(false);
  const saveNameSyncedForListIdRef = useRef<string | null>(null);
  /** Local edits not yet written with Save (add/remove/clear). */
  const [pendingItems, setPendingItems] = useState<UserListItem[] | null>(null);

  const loadLists = useCallback(async () => {
    if (!token) return;
    try {
      let { lists: L } = await fetchMyLists(token);
      if (L.length === 0) {
        try {
          const { list } = await createList(token, 'My table', null);
          L = [list];
        } catch {
          const { lists: again } = await fetchMyLists(token);
          L = again;
        }
      }
      setLists(L);
      setCurrentListId((prev) => {
        if (L.length === 0) return null;
        if (prev && L.some((l) => l.id === prev)) return prev;
        return L[0].id;
      });
    } catch {
      setLists([]);
      setCurrentListId(null);
    }
  }, [token]);

  const loadListWithItems = useCallback(async (options?: { silent?: boolean; forListId?: string | null }) => {
    const id = options?.forListId !== undefined ? options.forListId : currentListId;
    if (!token || !id) {
      if (options?.forListId === undefined) setListWithItems(null);
      return;
    }
    const silent = options?.silent ?? false;
    if (!silent) setListLoading(true);
    try {
      const { list } = await fetchListWithItems(token, id);
      setListWithItems(list);
    } catch {
      if (options?.forListId === undefined) setListWithItems(null);
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [token, currentListId]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    loadListWithItems();
  }, [loadListWithItems]);

  useEffect(() => {
    setTableSort({ key: null, dir: null });
    setSelectedUrls(new Set());
    setPendingItems(null);
  }, [currentListId]);

  useEffect(() => {
    if (!listWithItems || listWithItems.id !== currentListId) return;
    if (saveNameSyncedForListIdRef.current === listWithItems.id) return;
    saveNameSyncedForListIdRef.current = listWithItems.id;
    setSaveTableName(listWithItems.name);
  }, [currentListId, listWithItems]);

  useEffect(() => {
    if (!searchOpen || !token) return;
    fetchShops(token).then(({ shops: s }) => setShops(s)).catch(() => setShops([]));
    fetchShopCategoryPairs(token).then(({ pairs: p }) => setShopCategoryPairs(p)).catch(() => setShopCategoryPairs([]));
  }, [searchOpen, token]);

  const shopsFiltered = useMemo(() => {
    if (searchCategoryPairs.length === 0) return shops;
    const shopsInSelectedPairs = new Set(searchCategoryPairs.map((k) => k.split('|')[0]));
    return shops.filter((s) => shopsInSelectedPairs.has(s));
  }, [shops, searchCategoryPairs]);

  const categoryPairsFiltered = useMemo(() => {
    if (searchShops.length === 0) return shopCategoryPairs;
    return shopCategoryPairs.filter((p) => searchShops.includes(p.shop));
  }, [shopCategoryPairs, searchShops]);

  const displayItems = useMemo(
    () => pendingItems ?? listWithItems?.items ?? [],
    [pendingItems, listWithItems?.items]
  );

  const runSearch = async () => {
    setSearchError('');
    setSearchLoading(true);
    const pairs = searchCategoryPairs
      .map((key) => {
        const [shop, category] = key.split('|');
        return shop && category ? { shop, category } : null;
      })
      .filter((p): p is { shop: string; category: string } => p != null);
    try {
      const { products } = await searchProducts(token, {
        q: searchQ || undefined,
        url: searchUrl || undefined,
        shops: searchShops.length > 0 ? searchShops : undefined,
        pairs: pairs.length > 0 ? pairs : undefined,
        limit: SEARCH_PAGE_SIZE,
        offset: 0,
      });
      setSearchResults(products);
      setSearchHasMore(products.length === SEARCH_PAGE_SIZE);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
      setSearchResults([]);
      setSearchHasMore(false);
    } finally {
      setSearchLoading(false);
    }
  };

  const loadMoreSearch = useCallback(async () => {
    if (!token || searchLoadingMore || !searchHasMore) return;
    const pairs = searchCategoryPairs
      .map((key) => {
        const [shop, category] = key.split('|');
        return shop && category ? { shop, category } : null;
      })
      .filter((p): p is { shop: string; category: string } => p != null);
    setSearchLoadingMore(true);
    try {
      const { products } = await searchProducts(token, {
        q: searchQ || undefined,
        url: searchUrl || undefined,
        shops: searchShops.length > 0 ? searchShops : undefined,
        pairs: pairs.length > 0 ? pairs : undefined,
        limit: SEARCH_PAGE_SIZE,
        offset: searchResults.length,
      });
      setSearchResults((prev) => [...prev, ...products]);
      setSearchHasMore(products.length === SEARCH_PAGE_SIZE);
    } catch {
      setSearchHasMore(false);
    } finally {
      setSearchLoadingMore(false);
    }
  }, [token, searchQ, searchUrl, searchShops, searchCategoryPairs, searchResults.length, searchHasMore, searchLoadingMore]);

  const inListUrls = useMemo(
    () => new Set(displayItems.map((i) => i.product_url)),
    [displayItems]
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

  /** Rows from the current in-memory search pages only (never fetches more from the API). */
  const filteredSearchResults = useMemo(() => {
    let list = searchResults.filter((p) => !inListUrls.has(p.url));
    const nameNeedles = [resultFilterName1, resultFilterName2, resultFilterName3]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (nameNeedles.length > 0) {
      list = list.filter((p) => {
        const hay = (p.product_name ?? '').toLowerCase();
        return nameNeedles.every((n) => hay.includes(n));
      });
    }
    const minP = priceAbove.trim() ? parseFloat(priceAbove) : null;
    const maxP = priceBelow.trim() ? parseFloat(priceBelow) : null;
    if (Number.isFinite(minP)) list = list.filter((p) => p.price != null && p.price >= minP!);
    if (Number.isFinite(maxP)) list = list.filter((p) => p.price != null && p.price <= maxP!);
    return list;
  }, [searchResults, inListUrls, resultFilterName1, resultFilterName2, resultFilterName3, priceAbove, priceBelow]);

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

  const handleSearchResultsScroll = useCallback(() => {
    const el = searchResultsRef.current;
    if (!el || searchLoadingMore || !searchHasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      loadMoreSearch();
    }
  }, [loadMoreSearch, searchLoadingMore, searchHasMore]);

  const addAllToTable = async () => {
    if (!currentListId) return;
    const toAdd = filteredSearchResults.slice();
    const moreOnServer = searchHasMore;
    if (toAdd.length === 0) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    const existingUrls = new Set(base.map((i) => i.product_url));
    let next = [...base];
    let seq = next.length;
    for (const p of toAdd) {
      if (existingUrls.has(p.url)) continue;
      existingUrls.add(p.url);
      next.push(rowFromSearchProduct(p, currentListId, seq));
      seq += 1;
    }
    setPendingItems(next);
    if (moreOnServer) {
      await loadMoreSearch();
    }
  };

  const addOneToTable = async (product: ProductWithPrice) => {
    if (!currentListId) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    if (base.some((i) => i.product_url === product.url)) return;
    setPendingItems([...base, rowFromSearchProduct(product, currentListId, base.length)]);
  };

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
    if (!currentListId) return;
    setPendingItems([]);
    setSelectedUrls(new Set());
  };

  const handleSaveTableCopy = async () => {
    const name = saveTableName.trim();
    if (!token || !name) return;
    const nameKey = name.toLowerCase();
    const existing = lists.find((l) => l.name.trim().toLowerCase() === nameKey);

    setTableToolsBusy(true);
    try {
      if (currentListId && pendingItems !== null) {
        await clearListItems(token, currentListId);
        for (const url of pendingItems.map((i) => i.product_url)) {
          try {
            await addProductToList(token, currentListId, url);
          } catch {
            /* skip */
          }
        }
        setPendingItems(null);
        await loadListWithItems({ silent: true, forListId: currentListId });
      }

      let urls: string[] = [];
      if (currentListId) {
        const { list: source } = await fetchListWithItems(token, currentListId);
        urls = source.items.map((i) => i.product_url);
      }

      if (existing) {
        await clearListItems(token, existing.id);
        for (const url of urls) {
          try {
            await addProductToList(token, existing.id, url);
          } catch {
            /* skip */
          }
        }
        setCurrentListId(existing.id);
        const { lists: L } = await fetchMyLists(token);
        setLists(L);
      } else {
        const { list: created } = await createList(token, name, null);
        for (const url of urls) {
          try {
            await addProductToList(token, created.id, url);
          } catch {
            /* skip */
          }
        }
        setCurrentListId(created.id);
        const { lists: L } = await fetchMyLists(token);
        setLists(L);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setTableToolsBusy(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!token || !currentListId) return;
    const label = lists.find((l) => l.id === currentListId)?.name ?? 'this table';
    if (!window.confirm(`Delete “${label}”?`)) return;
    setTableToolsBusy(true);
    setPendingItems(null);
    try {
      const id = currentListId;
      await deleteListApi(token, id);
      let { lists: L } = await fetchMyLists(token);
      if (L.length === 0) {
        try {
          const { list } = await createList(token, 'My table', null);
          L = [list];
        } catch {
          const { lists: again } = await fetchMyLists(token);
          L = again;
        }
      }
      setLists(L);
      setCurrentListId((prev) => (prev === id ? L[0]?.id ?? null : prev));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setTableToolsBusy(false);
    }
  };

  return (
    <div className="table-page-layout">
      <section className={`search-panel ${searchOpen ? 'search-panel-open' : ''}`}>
        <button
          type="button"
          className="search-panel-toggle"
          onClick={() => setSearchOpen((o) => !o)}
          aria-expanded={searchOpen}
        >
          {searchOpen ? '▼ Close search' : '▶ Search products'}
        </button>
        {searchOpen && (
          <div className="search-panel-inner">
            <p className="widget-hint">
              By name, shop(s), category (Shop - Category), or URL. Use ✕ on each field to clear; shops and
              categories reset to all.
            </p>
            <div className="search-form">
              <div className="search-field-with-clear search-field-with-clear--name">
                <input
                  type="text"
                  placeholder="Name (partial)"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  className="search-input search-input-name"
                />
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={!searchQ.trim()}
                  onClick={() => setSearchQ('')}
                  aria-label="Clear name"
                  title="Clear name"
                >
                  ✕
                </button>
              </div>
              <div className="search-field-with-clear search-field-with-clear--shop">
              <div className="search-dropdown-wrap search-dropdown-wrap--shop" ref={shopDropdownRef}>
                <label className="search-multi-label">Shop</label>
                <button
                  type="button"
                  className="search-dropdown-trigger"
                  onClick={() => setShopDropdownOpen((o) => !o)}
                  aria-expanded={shopDropdownOpen}
                >
                  {searchShops.length === 0 ? 'All shops' : searchShops.length === 1 ? searchShops[0] : `${searchShops.length} shops`}
                </button>
                {shopDropdownOpen && (
                  <div className="search-dropdown-panel">
                    <label className="search-dropdown-option search-dropdown-all">
                      <input
                        type="checkbox"
                        checked={searchShops.length === 0}
                        onChange={() => setSearchShops([])}
                      />
                      <span>All shops</span>
                    </label>
                    {shopsFiltered.map((s) => (
                      <label key={s} className="search-dropdown-option">
                        <input
                          type="checkbox"
                          checked={searchShops.includes(s)}
                          onChange={() => {
                            setSearchShops((prev) =>
                              prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                            );
                          }}
                        />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={searchShops.length === 0}
                  onClick={() => {
                    setSearchShops([]);
                    setShopDropdownOpen(false);
                  }}
                  aria-label="Reset shops to all"
                  title="All shops"
                >
                  ✕
                </button>
              </div>
              <div className="search-field-with-clear search-field-with-clear--categories">
              <div className="search-dropdown-wrap search-dropdown-wrap--categories" ref={categoryDropdownRef}>
                <label className="search-multi-label">Shop - Category</label>
                <button
                  type="button"
                  className="search-dropdown-trigger search-dropdown-trigger--categories"
                  onClick={() => setCategoryDropdownOpen((o) => !o)}
                  aria-expanded={categoryDropdownOpen}
                >
                  {searchCategoryPairs.length === 0
                    ? 'All categories'
                    : searchCategoryPairs.length === 1
                      ? (() => {
                          const p = shopCategoryPairs.find((x) => `${x.shop}|${x.category}` === searchCategoryPairs[0]);
                          return p ? `${p.shop} - ${p.category}` : '1 category';
                        })()
                      : `${searchCategoryPairs.length} categories`}
                </button>
                {categoryDropdownOpen && (
                  <div className="search-dropdown-panel search-dropdown-panel--categories">
                    <label className="search-dropdown-option search-dropdown-all">
                      <input
                        type="checkbox"
                        checked={searchCategoryPairs.length === 0}
                        onChange={() => setSearchCategoryPairs([])}
                      />
                      <span>All categories</span>
                    </label>
                    {categoryPairsFiltered.map((p) => {
                      const key = `${p.shop}|${p.category}`;
                      return (
                        <label key={key} className="search-dropdown-option">
                          <input
                            type="checkbox"
                            checked={searchCategoryPairs.includes(key)}
                            onChange={() => {
                              setSearchCategoryPairs((prev) =>
                                prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
                              );
                            }}
                          />
                          <span>{p.shop} - {p.category}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={searchCategoryPairs.length === 0}
                  onClick={() => {
                    setSearchCategoryPairs([]);
                    setCategoryDropdownOpen(false);
                  }}
                  aria-label="Reset categories to all"
                  title="All categories"
                >
                  ✕
                </button>
              </div>
              <div className="search-field-with-clear search-field-with-clear--url">
                <input
                  type="text"
                  placeholder="URL (partial)"
                  value={searchUrl}
                  onChange={(e) => setSearchUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  className="search-input search-input-url"
                />
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={!searchUrl.trim()}
                  onClick={() => setSearchUrl('')}
                  aria-label="Clear URL"
                  title="Clear URL"
                >
                  ✕
                </button>
              </div>
              <button type="button" className="btn-primary btn-search" onClick={runSearch} disabled={searchLoading}>
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            {searchError && <div className="widget-error">{searchError}</div>}
            <div className="search-filter-block">
              <div className="search-field-with-clear search-field-with-clear--filter-text">
                <input
                  type="text"
                  placeholder="Name contains (1)"
                  value={resultFilterName1}
                  onChange={(e) => setResultFilterName1(e.target.value)}
                  className="search-input search-filter-text"
                />
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={!resultFilterName1.trim()}
                  onClick={() => setResultFilterName1('')}
                  aria-label="Clear name filter 1"
                  title="Clear"
                >
                  ✕
                </button>
              </div>
              <div className="search-field-with-clear search-field-with-clear--filter-text">
                <input
                  type="text"
                  placeholder="Name contains (2)"
                  value={resultFilterName2}
                  onChange={(e) => setResultFilterName2(e.target.value)}
                  className="search-input search-filter-text"
                />
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={!resultFilterName2.trim()}
                  onClick={() => setResultFilterName2('')}
                  aria-label="Clear name filter 2"
                  title="Clear"
                >
                  ✕
                </button>
              </div>
              <div className="search-field-with-clear search-field-with-clear--filter-text">
                <input
                  type="text"
                  placeholder="Name contains (3)"
                  value={resultFilterName3}
                  onChange={(e) => setResultFilterName3(e.target.value)}
                  className="search-input search-filter-text"
                />
                <button
                  type="button"
                  className="search-field-clear"
                  disabled={!resultFilterName3.trim()}
                  onClick={() => setResultFilterName3('')}
                  aria-label="Clear name filter 3"
                  title="Clear"
                >
                  ✕
                </button>
              </div>
              <div className="search-filter-price-group">
                <div className="search-field-with-clear search-field-with-clear--filter-num">
                  <input
                    type="number"
                    placeholder="Price above (min)"
                    value={priceAbove}
                    onChange={(e) => setPriceAbove(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    className="search-input search-input-num"
                    min={0}
                    step={0.01}
                  />
                  <button
                    type="button"
                    className="search-field-clear"
                    disabled={!priceAbove.trim()}
                    onClick={() => setPriceAbove('')}
                    aria-label="Clear min price"
                    title="Clear"
                  >
                    ✕
                  </button>
                </div>
                <div className="search-field-with-clear search-field-with-clear--filter-num">
                  <input
                    type="number"
                    placeholder="Price below (max)"
                    value={priceBelow}
                    onChange={(e) => setPriceBelow(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                    className="search-input search-input-num"
                    min={0}
                    step={0.01}
                  />
                  <button
                    type="button"
                    className="search-field-clear"
                    disabled={!priceBelow.trim()}
                    onClick={() => setPriceBelow('')}
                    aria-label="Clear max price"
                    title="Clear"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            {searchResults.length > 0 && (
              <>
                <div className="search-actions">
                  <button
                    type="button"
                    className="btn-add-all"
                    onClick={addAllToTable}
                    disabled={filteredSearchResults.length === 0}
                    title="Adds only products already shown in this list. If more search pages exist, the next page loads automatically after adding."
                  >
                    Add all loaded to table
                  </button>
                  {searchHasMore && filteredSearchResults.length > 0 && (
                    <p className="muted search-add-all-hint">
                      Only loaded rows are added; the next page loads after add all when more exist. Scroll for further pages.
                    </p>
                  )}
                </div>
                <div
                  className="search-results"
                  ref={searchResultsRef}
                  onScroll={handleSearchResultsScroll}
                >
                  {filteredSearchResults.map((p) => (
                    <div key={p.url} className="search-result-row search-result-row--table">
                      <span className="result-name">{p.product_name || p.url}</span>
                      <div className="result-shop-stack">
                        <span className="result-shop-main">{p.shop ?? '—'}</span>
                        {p.category ? (
                          <span className="result-shop-category">{p.category}</span>
                        ) : null}
                      </div>
                      <div className="result-price-stack">
                        <span className="result-price-main">
                          {p.price != null ? formatPriceDisplay(p.price) : '—'}
                        </span>
                        {(p.price_before_discount != null || p.discount_pct != null) && (
                          <span className="result-price-sub">
                            {p.price_before_discount != null && (
                              <span className="result-price-was">{formatPriceDisplay(p.price_before_discount)}</span>
                            )}
                            {p.discount_pct != null && (
                              <span className="result-price-pct">
                                {p.price_before_discount != null ? ' ' : ''}({p.discount_pct}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      <button type="button" className="btn-add-one" onClick={() => addOneToTable(p)} title="Add to table">
                        + Add
                      </button>
                    </div>
                  ))}
                  {searchHasMore && (
                    <div className="search-load-more">
                      {searchLoadingMore ? (
                        <span className="muted">Loading…</span>
                      ) : (
                        <span className="muted">Scroll for more</span>
                      )}
                    </div>
                  )}
                  {filteredSearchResults.length === 0 && searchResults.length > 0 && (
                    <p className="muted">No matches for filter or all are already in the table.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <section className="table-section">
        <div className="table-toolbar-wrap">
        <div className="table-toolbar">
          <label className="table-toolbar-field">
            <span className="table-toolbar-label">Load</span>
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
              placeholder="Table name"
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
          <div className="date-range-slicer-panel">
            <div className="date-range-slicer-panel-head">
              <span className="date-range-slicer-title">Date range</span>
              <span className="muted date-range-slicer-anchor">from {TABLE_DATE_ANCHOR_YMD}</span>
              {histLoading && <span className="muted date-range-slicer-status">…</span>}
            </div>
            {histError && <div className="widget-error date-range-slicer-error">{histError}</div>}
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
                aria-label="Range start"
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
                aria-label="Range end"
              />
            </div>
            <div className="date-range-slicer-ticks">
              <time dateTime={fromYmd}>{fromYmd}</time>
              <time dateTime={toYmd}>{toYmd}</time>
            </div>
          </div>
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
                    title={`Closest price to ${fromYmd}`}
                  >
                    <abbr title={`Closest price to ${fromYmd}`}>@ start</abbr>
                  </SortableTh>
                  <SortableTh
                    columnKey="deltaPrice"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    title={`Price change, ${fromYmd} → ${toYmd}`}
                  >
                    <abbr title={`Price change, ${fromYmd} → ${toYmd}`}>Δ price</abbr>
                  </SortableTh>
                  <SortableTh
                    columnKey="deltaPct"
                    sort={tableSort}
                    onSort={cycleTableSort}
                    title={`Percent change, ${fromYmd} → ${toYmd}`}
                  >
                    <abbr title={`Percent change, ${fromYmd} → ${toYmd}`}>Δ %</abbr>
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
                      <td className="cell-wrap">{item.product?.product_name ?? item.product_url}</td>
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
