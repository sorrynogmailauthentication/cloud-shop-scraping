import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchShops, fetchShopCategoryPairs, searchProducts } from '../api/dashboard';
import type { ShopCategoryPair } from '../api/dashboard';
import type { ProductWithPrice } from '../types/dashboard';
import { formatPriceDisplay } from '../utils/priceHistory';
import { obscureProductDisplayName } from '../utils/productDisplay';

const SEARCH_PAGE_SIZE = 20;

export type ProductSearchPanelProps = {
  token: string | null;
  existingUrls: Set<string>;
  addDisabled?: boolean;
  onAddOne: (p: ProductWithPrice) => void | Promise<void>;
  onAddAll: (products: ProductWithPrice[]) => void | Promise<void>;
  addAllLabel?: string;
  addOneTitle?: string;
  alreadyInPhrase?: string;
  resultRowClassName?: string;
};

export function ProductSearchPanel({
  token,
  existingUrls,
  addDisabled = false,
  onAddOne,
  onAddAll,
  addAllLabel = 'Add all loaded to table',
  addOneTitle = 'Add to table',
  alreadyInPhrase = 'table',
  resultRowClassName = 'search-result-row--table',
}: ProductSearchPanelProps) {
  const [searchOpen, setSearchOpen] = useState(true);
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
    function handleClickOutside(e: Event) {
      const t = e.target as Node;
      if (shopDropdownRef.current && !shopDropdownRef.current.contains(t)) setShopDropdownOpen(false);
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(t))
        setCategoryDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const filteredSearchResults = useMemo(() => {
    let list = searchResults.filter((p) => !existingUrls.has(p.url));
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
  }, [searchResults, existingUrls, resultFilterName1, resultFilterName2, resultFilterName3, priceAbove, priceBelow]);

  const handleSearchResultsScroll = useCallback(() => {
    const el = searchResultsRef.current;
    if (!el || searchLoadingMore || !searchHasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      loadMoreSearch();
    }
  }, [loadMoreSearch, searchLoadingMore, searchHasMore]);

  const handleAddAll = async () => {
    const toAdd = filteredSearchResults.slice();
    const moreOnServer = searchHasMore;
    if (toAdd.length === 0) return;
    await onAddAll(toAdd);
    if (moreOnServer) {
      await loadMoreSearch();
    }
  };

  const addBlocked = addDisabled;

  return (
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
                  {searchShops.length === 0
                    ? 'All shops'
                    : searchShops.length === 1
                      ? searchShops[0]
                      : `${searchShops.length} shops`}
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
                          <span>
                            {p.shop} - {p.category}
                          </span>
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
                  onClick={() => void handleAddAll()}
                  disabled={addBlocked || filteredSearchResults.length === 0}
                  title="Adds only products already shown in this list. If more search pages exist, the next page loads automatically after adding."
                >
                  {addAllLabel}
                </button>
                {searchHasMore && filteredSearchResults.length > 0 && (
                  <p className="muted search-add-all-hint">
                    Only loaded rows are added; the next page loads after add all when more exist. Scroll for further pages.
                  </p>
                )}
              </div>
              <div className="search-results" ref={searchResultsRef} onScroll={handleSearchResultsScroll}>
                {filteredSearchResults.map((p) => (
                  <div key={p.url} className={`search-result-row ${resultRowClassName}`}>
                    <span className="result-name">{obscureProductDisplayName(p.product_name, p.url)}</span>
                    <div className="result-shop-stack">
                      <span className="result-shop-main">{p.shop ?? '—'}</span>
                      {p.category ? <span className="result-shop-category">{p.category}</span> : null}
                    </div>
                    <div className="result-price-stack">
                      <span className="result-price-main">{p.price != null ? formatPriceDisplay(p.price) : '—'}</span>
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
                    <button
                      type="button"
                      className="btn-add-one"
                      onClick={() => void onAddOne(p)}
                      disabled={addBlocked}
                      title={addOneTitle}
                    >
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
                  <p className="muted">No matches for filter or all are already in the {alreadyInPhrase}.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
