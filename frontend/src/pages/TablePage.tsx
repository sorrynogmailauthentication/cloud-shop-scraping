import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import type { ProductWithPrice, ListWithItems, UserList } from '../types/dashboard';
import {
  searchProducts,
  fetchShops,
  fetchShopCategoryPairs,
  fetchMyLists,
  fetchListWithItems,
  createList,
  addProductToList,
  removeProductFromList,
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
  formatPriceDelta,
  formatPriceDisplay,
} from '../utils/priceHistory';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
  const SEARCH_PAGE_SIZE = 50;
  const [searchQ, setSearchQ] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [searchShops, setSearchShops] = useState<string[]>([]);
  const [searchCategoryPairs, setSearchCategoryPairs] = useState<string[]>([]);
  const [priceAbove, setPriceAbove] = useState('');
  const [priceBelow, setPriceBelow] = useState('');
  const [shops, setShops] = useState<string[]>([]);
  const [shopCategoryPairs, setShopCategoryPairs] = useState<ShopCategoryPair[]>([]);
  const [secondaryFilter, setSecondaryFilter] = useState('');
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

  const loadLists = useCallback(async () => {
    if (!token) return;
    try {
      const { lists: L } = await fetchMyLists(token);
      setLists(L);
      if (L.length > 0 && !currentListId) setCurrentListId(L[0].id);
      else if (L.length === 0) setCurrentListId(null);
    } catch {
      setLists([]);
      setCurrentListId(null);
    }
  }, [token, currentListId]);

  const loadListWithItems = useCallback(async () => {
    if (!token || !currentListId) {
      setListWithItems(null);
      return;
    }
    setListLoading(true);
    try {
      const { list } = await fetchListWithItems(token, currentListId);
      setListWithItems(list);
    } catch {
      setListWithItems(null);
    } finally {
      setListLoading(false);
    }
  }, [token, currentListId]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    loadListWithItems();
  }, [loadListWithItems]);

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

  const ensureDefaultList = useCallback(async () => {
    if (!token || lists.length > 0) return lists[0]?.id ?? null;
    try {
      const { list } = await createList(token, 'My table', null);
      setLists((prev) => [...prev, list]);
      setCurrentListId(list.id);
      return list.id;
    } catch {
      return null;
    }
  }, [token, lists.length]);

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
    () => new Set((listWithItems?.items ?? []).map((i) => i.product_url)),
    [listWithItems?.items]
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
    () => [...new Set((listWithItems?.items ?? []).map((i) => i.product_url))].sort().join('\0'),
    [listWithItems?.items]
  );

  useEffect(() => {
    if (!token || !listWithItems?.items?.length) {
      setHistByUrl(new Map());
      setHistLoading(false);
      setHistError('');
      return;
    }
    const urls = [...new Set(listWithItems.items.map((i) => i.product_url))];
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

  const filteredSearchResults = useMemo(() => {
    let list = searchResults.filter((p) => !inListUrls.has(p.url));
    const sf = secondaryFilter.trim().toLowerCase();
    if (sf) {
      list = list.filter((p) =>
        [p.product_name, p.url, p.category, p.shop, p.article].some(
          (f) => (f ?? '').toLowerCase().includes(sf)
        )
      );
    }
    const minP = priceAbove.trim() ? parseFloat(priceAbove) : null;
    const maxP = priceBelow.trim() ? parseFloat(priceBelow) : null;
    if (Number.isFinite(minP)) list = list.filter((p) => p.price != null && p.price >= minP!);
    if (Number.isFinite(maxP)) list = list.filter((p) => p.price != null && p.price <= maxP!);
    return list;
  }, [searchResults, inListUrls, secondaryFilter, priceAbove, priceBelow]);

  const handleSearchResultsScroll = useCallback(() => {
    const el = searchResultsRef.current;
    if (!el || searchLoadingMore || !searchHasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      loadMoreSearch();
    }
  }, [loadMoreSearch, searchLoadingMore, searchHasMore]);

  const addAllToTable = async () => {
    const listId = currentListId || (await ensureDefaultList());
    if (!listId || filteredSearchResults.length === 0) return;
    for (const p of filteredSearchResults) {
      try {
        await addProductToList(token, listId, p.url);
      } catch {
        /* skip duplicates */
      }
    }
    loadListWithItems();
  };

  const addOneToTable = async (product: ProductWithPrice) => {
    const listId = currentListId || (await ensureDefaultList());
    if (!listId) return;
    try {
      await addProductToList(token, listId, product.url);
      loadListWithItems();
    } catch {
      /* already in list */
    }
  };

  const removeFromTable = async (productUrl: string) => {
    if (!currentListId || !token) return;
    try {
      await removeProductFromList(token, currentListId, productUrl);
      loadListWithItems();
    } catch {
      /* ignore */
    }
  };

  const handleClearTable = async () => {
    if (!currentListId || !token) return;
    try {
      await clearListItems(token, currentListId);
      loadListWithItems();
    } catch {
      /* ignore */
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
            <p className="widget-hint">By name, shop(s), category (Shop - Category), or URL. Multiple choice with All to clear.</p>
            <div className="search-form">
              <input
                type="text"
                placeholder="Name (partial)"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                className="search-input search-input-name"
              />
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
              <input
                type="text"
                placeholder="URL (partial)"
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                className="search-input search-input-url"
              />
              <button type="button" className="btn-primary btn-search" onClick={runSearch} disabled={searchLoading}>
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
            {searchError && <div className="widget-error">{searchError}</div>}
            <div className="search-filter-block">
              <input
                type="text"
                placeholder="Filter within results (name, URL, category, shop…)"
                value={secondaryFilter}
                onChange={(e) => setSecondaryFilter(e.target.value)}
                className="search-input search-secondary-input"
              />
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
            </div>
            {searchResults.length > 0 && (
              <>
                <div className="search-actions">
                  <button
                    type="button"
                    className="btn-add-all"
                    onClick={addAllToTable}
                    disabled={filteredSearchResults.length === 0}
                  >
                    Add all to table
                  </button>
                </div>
                <div
                  className="search-results"
                  ref={searchResultsRef}
                  onScroll={handleSearchResultsScroll}
                >
                  {filteredSearchResults.map((p) => (
                    <div key={p.url} className="search-result-row">
                      <span className="result-name">{p.product_name || p.url}</span>
                      <span className="result-shop">{p.shop ?? '—'}</span>
                      <span className="result-price">
                        {p.price != null ? formatPriceDisplay(p.price) : '—'}
                        {p.discount_pct != null && ` (−${p.discount_pct}%)`}
                      </span>
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
        <div className="table-section-header">
          {lists.length > 0 && (
            <select
              className="list-select"
              value={currentListId ?? ''}
              onChange={(e) => setCurrentListId(e.target.value || null)}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {currentListId && (
            <button type="button" className="btn-clear-table" onClick={handleClearTable}>
              Clear table
            </button>
          )}
        </div>
        {!currentListId && lists.length === 0 && (
          <p className="widget-hint">Open search above and add products to create your first list.</p>
        )}
        {listLoading && <p className="muted">Loading…</p>}
        {listWithItems && !listLoading && listWithItems.items.length > 0 && (
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
          <div className="table-wrap table-full-width">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Link</th>
                  <th>Price</th>
                  <th>Before discount</th>
                  <th>Discount %</th>
                  <th>
                    <abbr title={`Closest price to ${fromYmd}`}>@ start</abbr>
                  </th>
                  <th>
                    <abbr title={`${fromYmd} → ${toYmd}`}>Δ</abbr>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listWithItems.items.map((item) => {
                  const h = histByUrl.get(item.product_url) ?? [];
                  const p0 = priceClosestByYmd(h, fromYmd);
                  const p1 = priceClosestByYmd(h, toYmd);
                  const delta = formatPriceDelta(p0, p1);
                  const dn = p0 != null && p1 != null ? p1 - p0 : null;
                  return (
                    <tr key={item.id}>
                      <td className="cell-wrap">{item.product?.product_name ?? item.product_url}</td>
                      <td>
                        <a
                          href={item.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="table-link"
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
                        {histLoading ? '…' : delta}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-remove"
                          onClick={() => removeFromTable(item.product_url)}
                          title="Remove from table"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {listWithItems.items.length === 0 && (
              <p className="muted table-empty">No items. Add from search above.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
