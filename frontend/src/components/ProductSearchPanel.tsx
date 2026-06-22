import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { fetchShops, fetchShopCategoryPairs, searchProducts } from '../api/dashboard';
import type { ShopCategoryPair } from '../api/dashboard';
import type { ProductWithPrice } from '../types/dashboard';
import { formatPriceDisplay } from '../utils/priceHistory';
import { noAutofill } from '../utils/noAutofill';

const SEARCH_PAGE_SIZE = 10;
/** Cap chained fetches when every page is already in the table (avoid runaway loops). */
const MAX_AUTO_SEARCH_PAGES = 500;
const VISIBLE_ROWS = { compact: 5, expanded: 10 } as const;
type VisibleRowCap = (typeof VISIBLE_ROWS)[keyof typeof VISIBLE_ROWS];
const SEARCH_VISIBLE_ROWS_STORAGE_KEY = 'search:visible-rows:v1';

function readStoredVisibleRowCap(): VisibleRowCap {
  if (typeof window === 'undefined') return VISIBLE_ROWS.compact;
  try {
    const raw = window.localStorage.getItem(SEARCH_VISIBLE_ROWS_STORAGE_KEY);
    if (raw === String(VISIBLE_ROWS.expanded)) return VISIBLE_ROWS.expanded;
    if (raw === String(VISIBLE_ROWS.compact)) return VISIBLE_ROWS.compact;
  } catch {
    /* ignore */
  }
  return VISIBLE_ROWS.compact;
}

export type ProductSearchPanelProps = {
  token: string | null;
  existingUrls: Set<string>;
  /** Max rows for this list (table vs graph). Omit to skip client-side cap in the panel. */
  listMaxItems?: number;
  addDisabled?: boolean;
  onAddOne: (p: ProductWithPrice) => void | Promise<void>;
  /** Add multiple products (e.g. current multi-selection in search results). */
  onAddMany: (products: ProductWithPrice[]) => void | Promise<void>;
  addSelectedLabel?: string;
  /** Select every row currently shown (after client-side filters). */
  selectAllVisibleLabel?: string;
  addOneTitle?: string;
  alreadyInPhrase?: string;
  resultRowClassName?: string;
};

export function ProductSearchPanel({
  token,
  existingUrls,
  listMaxItems,
  addDisabled = false,
  onAddOne,
  onAddMany,
  addSelectedLabel = 'Добавить выбранные в таблицу',
  selectAllVisibleLabel = 'Выбрать всё',
  addOneTitle = 'Добавить в таблицу',
  alreadyInPhrase = 'таблице',
  resultRowClassName = 'search-result-row--table',
}: ProductSearchPanelProps) {
  const [searchOpen, setSearchOpen] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [searchShops, setSearchShops] = useState<string[]>([]);
  const [searchCategoryPairs, setSearchCategoryPairs] = useState<string[]>([]);
  const [categoryFilterText, setCategoryFilterText] = useState('');
  const [priceAbove, setPriceAbove] = useState('');
  const [priceBelow, setPriceBelow] = useState('');
  const [shops, setShops] = useState<string[]>([]);
  const [shopCategoryPairs, setShopCategoryPairs] = useState<ShopCategoryPair[]>([]);
  const [resultFilterName1, setResultFilterName1] = useState('');
  const [resultFilterName2, setResultFilterName2] = useState('');
  const [resultFilterName3, setResultFilterName3] = useState('');
  const [resultNegFilterName1, setResultNegFilterName1] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithPrice[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [addManyFeedback, setAddManyFeedback] = useState('');
  const [visibleRowCap, setVisibleRowCap] = useState<VisibleRowCap>(readStoredVisibleRowCap);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const scrollYOnCloseRef = useRef<number | null>(null);
  const [shopDropdownOpen, setShopDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const shopDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSearchUrls, setSelectedSearchUrls] = useState<Set<string>>(() => new Set());
  const selectedSearchUrlsRef = useRef(selectedSearchUrls);
  selectedSearchUrlsRef.current = selectedSearchUrls;
  const searchSelectMouseDownRef = useRef(false);
  const searchDragAnchorRef = useRef<number | null>(null);
  const searchSelectionWrapRef = useRef<HTMLDivElement>(null);
  const existingUrlsRef = useRef(existingUrls);
  existingUrlsRef.current = existingUrls;
  /** Prevents overlapping load-more runs (Strict Mode / effect + click). */
  const searchLoadMoreOngoingRef = useRef(false);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SEARCH_VISIBLE_ROWS_STORAGE_KEY, String(visibleRowCap));
    } catch {
      /* ignore */
    }
  }, [visibleRowCap]);

  const shopsFiltered = useMemo(() => {
    if (searchCategoryPairs.length === 0) return shops;
    const shopsInSelectedPairs = new Set(searchCategoryPairs.map((k) => k.split('|')[0]));
    return shops.filter((s) => shopsInSelectedPairs.has(s));
  }, [shops, searchCategoryPairs]);

  const categoryPairsFiltered = useMemo(() => {
    if (searchShops.length === 0) return shopCategoryPairs;
    return shopCategoryPairs.filter((p) => searchShops.includes(p.shop));
  }, [shopCategoryPairs, searchShops]);

  const categoryPairsTypedFiltered = useMemo(() => {
    const needle = categoryFilterText.trim().toLowerCase();
    if (!needle) return categoryPairsFiltered;
    return categoryPairsFiltered.filter((p) =>
      `${p.shop} ${p.category}`.toLowerCase().includes(needle)
    );
  }, [categoryPairsFiltered, categoryFilterText]);

  const listRoom = useMemo(() => {
    if (listMaxItems == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, listMaxItems - existingUrls.size);
  }, [listMaxItems, existingUrls]);

  const listAtCapacity = listMaxItems != null && listRoom === 0;

  const capacityHint = useMemo(() => {
    if (listMaxItems == null || searchResults.length === 0 || existingUrls.size < listMaxItems) return '';
    return `В ${alreadyInPhrase} достигнут лимит (${listMaxItems} товаров). Удалите позиции из списка или выберите другой сохранённый список.`;
  }, [listMaxItems, searchResults.length, existingUrls, alreadyInPhrase]);

  const limitStatusMessage = addManyFeedback || capacityHint;

  const runSearch = async () => {
    if (!token) return;
    setAddManyFeedback('');
    setSearchError('');
    setSelectedSearchUrls(new Set());
    setSearchLoading(true);
    const pairs = searchCategoryPairs
      .map((key) => {
        const [shop, category] = key.split('|');
        return shop && category ? { shop, category } : null;
      })
      .filter((p): p is { shop: string; category: string } => p != null);
    try {
      let accumulated: ProductWithPrice[] = [];
      let pages = 0;
      while (true) {
        pages += 1;
        if (pages > MAX_AUTO_SEARCH_PAGES) break;
        const { products } = await searchProducts(token, {
          q: searchQ || undefined,
          url: searchUrl || undefined,
          shops: searchShops.length > 0 ? searchShops : undefined,
          pairs: pairs.length > 0 ? pairs : undefined,
          limit: SEARCH_PAGE_SIZE,
          offset: accumulated.length,
        });
        accumulated = accumulated.concat(products);
        setSearchResults(accumulated);
        const pageFull = products.length === SEARCH_PAGE_SIZE;
        setSearchHasMore(pageFull);
        const ex = existingUrlsRef.current;
        const hasAnyNew = accumulated.some((p) => !ex.has(p.url));
        if (hasAnyNew || !pageFull) break;
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Ошибка поиска');
      setSearchResults([]);
      setSearchHasMore(false);
    } finally {
      setSearchLoading(false);
    }
  };

  const loadMoreSearch = useCallback(async () => {
    if (!token || searchLoadingMore || !searchHasMore) return;
    if (searchLoadMoreOngoingRef.current) return;
    searchLoadMoreOngoingRef.current = true;
    const pairs = searchCategoryPairs
      .map((key) => {
        const [shop, category] = key.split('|');
        return shop && category ? { shop, category } : null;
      })
      .filter((p): p is { shop: string; category: string } => p != null);
    setSearchLoadingMore(true);
    try {
      let merged = [...searchResults];
      let offset = merged.length;
      let pages = 0;
      while (true) {
        pages += 1;
        if (pages > MAX_AUTO_SEARCH_PAGES) break;
        const { products } = await searchProducts(token, {
          q: searchQ || undefined,
          url: searchUrl || undefined,
          shops: searchShops.length > 0 ? searchShops : undefined,
          pairs: pairs.length > 0 ? pairs : undefined,
          limit: SEARCH_PAGE_SIZE,
          offset,
        });
        merged = merged.concat(products);
        setSearchResults(merged);
        const pageFull = products.length === SEARCH_PAGE_SIZE;
        setSearchHasMore(pageFull);
        offset = merged.length;
        const ex = existingUrlsRef.current;
        const batchHasNew = products.some((p) => !ex.has(p.url));
        if (batchHasNew || !pageFull) break;
      }
    } catch {
      setSearchHasMore(false);
    } finally {
      searchLoadMoreOngoingRef.current = false;
      setSearchLoadingMore(false);
    }
  }, [token, searchQ, searchUrl, searchShops, searchCategoryPairs, searchResults, searchHasMore, searchLoadingMore]);

  useEffect(() => {
    if (!searchOpen || !token) return;
    if (searchLoading || searchLoadingMore) return;
    if (!searchHasMore || searchResults.length === 0) return;
    if (!searchResults.every((p) => existingUrls.has(p.url))) return;
    void loadMoreSearch();
  }, [
    searchOpen,
    token,
    searchLoading,
    searchLoadingMore,
    searchHasMore,
    searchResults,
    existingUrls,
    loadMoreSearch,
  ]);

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
    const negNameNeedles = [resultNegFilterName1]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (negNameNeedles.length > 0) {
      list = list.filter((p) => {
        const hay = (p.product_name ?? '').toLowerCase();
        return negNameNeedles.every((n) => !hay.includes(n));
      });
    }
    const minP = priceAbove.trim() ? parseFloat(priceAbove) : null;
    const maxP = priceBelow.trim() ? parseFloat(priceBelow) : null;
    if (Number.isFinite(minP)) list = list.filter((p) => p.price != null && p.price >= minP!);
    if (Number.isFinite(maxP)) list = list.filter((p) => p.price != null && p.price <= maxP!);
    return list;
  }, [searchResults, existingUrls, resultFilterName1, resultFilterName2, resultFilterName3, resultNegFilterName1, priceAbove, priceBelow]);

  const filteredSearchResultsRef = useRef<ProductWithPrice[]>([]);
  filteredSearchResultsRef.current = filteredSearchResults;

  useEffect(() => {
    const onUp = () => {
      searchSelectMouseDownRef.current = false;
      searchDragAnchorRef.current = null;
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedSearchUrls(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (selectedSearchUrlsRef.current.size === 0) return;
      const wrap = searchSelectionWrapRef.current;
      if (!wrap || wrap.contains(e.target as Node)) return;
      setSelectedSearchUrls(new Set());
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) setSelectedSearchUrls(new Set());
  }, [searchOpen]);

  useEffect(() => {
    if (searchResults.length === 0) setSelectedSearchUrls(new Set());
  }, [searchResults.length]);

  useEffect(() => {
    setSelectedSearchUrls((prev) => {
      const allowed = new Set(filteredSearchResults.map((p) => p.url));
      const next = new Set([...prev].filter((u) => allowed.has(u)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredSearchResults]);

  const applySearchRowRangeSelection = useCallback(
    (from: number, to: number) => {
      setSelectedSearchUrls(() => {
        const next = new Set<string>();
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        for (let i = lo; i <= hi; i++) {
          const row = filteredSearchResults[i];
          if (row) next.add(row.url);
        }
        return next;
      });
    },
    [filteredSearchResults]
  );

  const handleSearchRowMouseDown = useCallback(
    (e: ReactMouseEvent, index: number) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('button, a')) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const url = filteredSearchResults[index]?.url;
        if (!url) return;
        setSelectedSearchUrls((prev) => {
          const next = new Set(prev);
          if (next.has(url)) next.delete(url);
          else next.add(url);
          return next;
        });
        return;
      }
      e.preventDefault();
      searchSelectMouseDownRef.current = true;
      searchDragAnchorRef.current = index;
      applySearchRowRangeSelection(index, index);
    },
    [filteredSearchResults, applySearchRowRangeSelection]
  );

  const handleSearchRowMouseEnter = useCallback(
    (index: number) => {
      if (!searchSelectMouseDownRef.current || searchDragAnchorRef.current == null) return;
      applySearchRowRangeSelection(searchDragAnchorRef.current, index);
    },
    [applySearchRowRangeSelection]
  );

  const handleSelectAllVisible = useCallback(() => {
    const rows = filteredSearchResultsRef.current;
    if (rows.length === 0) return;
    const visible = new Set(rows.map((p) => p.url));
    setSelectedSearchUrls((prev) => {
      const allOn = [...visible].every((u) => prev.has(u));
      if (allOn) return new Set();
      return visible;
    });
  }, []);

  const handleAddSelected = useCallback(async () => {
    const urls = selectedSearchUrlsRef.current;
    const rows = filteredSearchResultsRef.current;
    const toAdd = rows.filter((p) => urls.has(p.url));
    if (toAdd.length === 0) return;
    const listSize = existingUrls.size;
    if (listMaxItems != null) {
      const room = Math.max(0, listMaxItems - listSize);
      if (room <= 0) {
        setAddManyFeedback(
          `В ${alreadyInPhrase} уже максимум — ${listMaxItems} товаров. Удалите позиции из списка или выберите другой сохранённый список.`
        );
        return;
      }
      if (toAdd.length > room) {
        setAddManyFeedback(
          `Добавлено ${room} из ${toAdd.length}: в ${alreadyInPhrase} осталось место только для ещё ${room} товаров (лимит ${listMaxItems}).`
        );
        await onAddMany(toAdd.slice(0, room));
        setSelectedSearchUrls(new Set());
        return;
      }
    }
    setAddManyFeedback('');
    await onAddMany(toAdd);
    setSelectedSearchUrls(new Set());
  }, [onAddMany, listMaxItems, alreadyInPhrase, existingUrls]);

  const addBlocked = addDisabled || listAtCapacity;

  const toggleSearchOpen = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) scrollYOnCloseRef.current = window.scrollY;
      return !prev;
    });
  }, []);

  /** Capture scroll before focus moves to the toggle (avoids browser scroll-into-view on mousedown). */
  const onToggleMouseDown = useCallback(() => {
    if (searchOpen) scrollYOnCloseRef.current = window.scrollY;
  }, [searchOpen]);

  useLayoutEffect(() => {
    if (searchOpen || scrollYOnCloseRef.current == null) return;
    const y = scrollYOnCloseRef.current;
    scrollYOnCloseRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
        searchToggleRef.current?.focus({ preventScroll: true });
      });
    });
  }, [searchOpen]);

  return (
    <section className={`search-panel ${searchOpen ? 'search-panel-open' : ''}`}>
      <button
        ref={searchToggleRef}
        type="button"
        className="search-panel-toggle"
        onMouseDown={onToggleMouseDown}
        onClick={toggleSearchOpen}
        aria-expanded={searchOpen}
      >
        {searchOpen ? '▼ Скрыть поиск' : '▶ Поиск товаров'}
      </button>
      {searchOpen && (
        <div className="search-panel-inner">
          <form className="search-form" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <div className="search-field-with-clear search-field-with-clear--name">
              <input
                {...noAutofill}
                type="text"
                placeholder="Название (часть)"
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
                aria-label="Очистить название"
                title="Очистить название"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--shop">
              <div className="search-dropdown-wrap search-dropdown-wrap--shop" ref={shopDropdownRef}>
                <button
                  type="button"
                  className="search-dropdown-trigger"
                  onClick={() => setShopDropdownOpen((o) => !o)}
                  aria-expanded={shopDropdownOpen}
                >
                  {searchShops.length === 0
                    ? 'Все магазины'
                    : searchShops.length === 1
                      ? searchShops[0]
                      : `${searchShops.length} магаз.`}
                </button>
                {shopDropdownOpen && (
                  <div className="search-dropdown-panel">
                    <label className="search-dropdown-option search-dropdown-all">
                      <input
                        {...noAutofill}
                        type="checkbox"
                        checked={searchShops.length === 0}
                        onChange={() => setSearchShops([])}
                      />
                      <span>Все магазины</span>
                    </label>
                    {shopsFiltered.map((s) => (
                      <label key={s} className="search-dropdown-option">
                        <input
                          {...noAutofill}
                          type="checkbox"
                          checked={searchShops.includes(s)}
                          onChange={() => {
                            setSearchShops((prev) =>
                              prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                            );
                          }}
                        />
                        <span title={s}>{s}</span>
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
                aria-label="Сбросить выбор магазинов"
                title="Все магазины"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--categories">
              <div className="search-dropdown-wrap search-dropdown-wrap--categories" ref={categoryDropdownRef}>
                <button
                  type="button"
                  className="search-dropdown-trigger search-dropdown-trigger--categories"
                  onClick={() => setCategoryDropdownOpen((o) => !o)}
                  aria-expanded={categoryDropdownOpen}
                >
                  {searchCategoryPairs.length === 0
                    ? 'Все категории'
                    : searchCategoryPairs.length === 1
                      ? (() => {
                          const p = shopCategoryPairs.find((x) => `${x.shop}|${x.category}` === searchCategoryPairs[0]);
                          return p ? `${p.shop} - ${p.category}` : '1 категория';
                        })()
                      : `${searchCategoryPairs.length} катег.`}
                </button>
                {categoryDropdownOpen && (
                  <div className="search-dropdown-panel search-dropdown-panel--categories">
                    <div className="search-dropdown-filter-wrap">
                      <input
                        {...noAutofill}
                        type="text"
                        className="search-dropdown-filter-input"
                        placeholder="Фильтр категорий"
                        value={categoryFilterText}
                        onChange={(e) => setCategoryFilterText(e.target.value)}
                      />
                      <button
                        type="button"
                        className="search-dropdown-filter-clear"
                        onClick={() => setCategoryFilterText('')}
                        disabled={!categoryFilterText.trim()}
                        aria-label="Очистить фильтр категорий"
                        title="Очистить фильтр категорий"
                      >
                        ✕
                      </button>
                    </div>
                    <label className="search-dropdown-option search-dropdown-all">
                      <input
                        {...noAutofill}
                        type="checkbox"
                        checked={searchCategoryPairs.length === 0}
                        onChange={() => setSearchCategoryPairs([])}
                      />
                      <span>Все категории</span>
                    </label>
                    {categoryPairsTypedFiltered.map((p) => {
                      const key = `${p.shop}|${p.category}`;
                      return (
                        <label key={key} className="search-dropdown-option">
                          <input
                            {...noAutofill}
                            type="checkbox"
                            checked={searchCategoryPairs.includes(key)}
                            onChange={() => {
                              setSearchCategoryPairs((prev) =>
                                prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
                              );
                            }}
                          />
                          <span title={`${p.shop} — ${p.category}`}>
                            {p.shop} - {p.category}
                          </span>
                        </label>
                      );
                    })}
                    {categoryPairsTypedFiltered.length === 0 && (
                      <div className="search-dropdown-empty muted">Нет категорий по фильтру</div>
                    )}
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
                aria-label="Сбросить выбор категорий"
                title="Все категории"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--url">
              <input
                {...noAutofill}
                type="text"
                placeholder="Ссылка (часть)"
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
                aria-label="Очистить ссылку"
                title="Очистить ссылку"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              className="btn-primary btn-search"
              onClick={runSearch}
              disabled={searchLoading}
              aria-busy={searchLoading}
              aria-label={searchLoading ? 'Поиск выполняется' : 'Поиск'}
            >
              <span className="btn-search-inner">
                <span className="btn-search-label">Поиск</span>
                <span className={`btn-search-ellipsis${searchLoading ? ' btn-search-ellipsis--visible' : ''}`} aria-hidden>
                  …
                </span>
              </span>
            </button>
          </form>
          {searchError && <div className="widget-error">{searchError}</div>}
          <form className="search-filter-block" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                {...noAutofill}
                type="text"
                placeholder="Название содержит (1)"
                value={resultFilterName1}
                onChange={(e) => setResultFilterName1(e.target.value)}
                className="search-input search-filter-text"
              />
              <button
                type="button"
                className="search-field-clear"
                disabled={!resultFilterName1.trim()}
                onClick={() => setResultFilterName1('')}
                aria-label="Очистить фильтр названия 1"
                title="Очистить"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                {...noAutofill}
                type="text"
                placeholder="Название содержит (2)"
                value={resultFilterName2}
                onChange={(e) => setResultFilterName2(e.target.value)}
                className="search-input search-filter-text"
              />
              <button
                type="button"
                className="search-field-clear"
                disabled={!resultFilterName2.trim()}
                onClick={() => setResultFilterName2('')}
                aria-label="Очистить фильтр названия 2"
                title="Очистить"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                {...noAutofill}
                type="text"
                placeholder="Название содержит (3)"
                value={resultFilterName3}
                onChange={(e) => setResultFilterName3(e.target.value)}
                className="search-input search-filter-text"
              />
              <button
                type="button"
                className="search-field-clear"
                disabled={!resultFilterName3.trim()}
                onClick={() => setResultFilterName3('')}
                aria-label="Очистить фильтр названия 3"
                title="Очистить"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                {...noAutofill}
                type="text"
                placeholder="Название не содержит (1)"
                value={resultNegFilterName1}
                onChange={(e) => setResultNegFilterName1(e.target.value)}
                className="search-input search-filter-text"
              />
              <button
                type="button"
                className="search-field-clear"
                disabled={!resultNegFilterName1.trim()}
                onClick={() => setResultNegFilterName1('')}
                aria-label="Очистить негативный фильтр названия 1"
                title="Очистить"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-num">
              <input
                {...noAutofill}
                type="number"
                placeholder="Цена от (мин.)"
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
                aria-label="Очистить мин. цену"
                title="Очистить"
              >
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-num">
              <input
                {...noAutofill}
                type="number"
                placeholder="Цена до (макс.)"
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
                aria-label="Очистить макс. цену"
                title="Очистить"
              >
                ✕
              </button>
            </div>
          </form>
          {searchResults.length > 0 && (
            <>
              <div className="search-selection-wrap" ref={searchSelectionWrapRef}>
                <div className="search-actions search-actions--row">
                  <button
                    type="button"
                    className="btn-search-select-all"
                    onClick={handleSelectAllVisible}
                    disabled={filteredSearchResults.length === 0}
                    title="Выделить все строки в текущем списке (повторный клик снимает выделение)"
                  >
                    {selectAllVisibleLabel}
                  </button>
                  <button
                    type="button"
                    className="btn-add-all"
                    onClick={() => void handleAddSelected()}
                    disabled={addBlocked || selectedSearchUrls.size === 0}
                    title={
                      listAtCapacity && listMaxItems != null
                        ? `Лимит ${listMaxItems} товаров в ${alreadyInPhrase}`
                        : 'Добавить все выделенные строки в список (мышью, Ctrl+клик или «Выбрать всё»)'
                    }
                  >
                    {addSelectedLabel}
                  </button>
                  {limitStatusMessage ? (
                    <p
                      role="status"
                      className={`search-add-all-hint${addManyFeedback ? ' search-add-all-hint--error' : ' muted'}`}
                    >
                      {limitStatusMessage}
                    </p>
                  ) : null}
                </div>
                <div
                  className="search-results-height-selector"
                  role="group"
                  aria-label="Сколько строк списка показывать"
                >
                  <span className="search-results-height-selector-label">Строк:</span>
                  <div className="search-results-height-selector-btns">
                    <button
                      type="button"
                      className={`search-results-height-btn${visibleRowCap === VISIBLE_ROWS.compact ? ' is-active' : ''}`}
                      onClick={() => setVisibleRowCap(VISIBLE_ROWS.compact)}
                      aria-pressed={visibleRowCap === VISIBLE_ROWS.compact}
                    >
                      {VISIBLE_ROWS.compact}
                    </button>
                    <button
                      type="button"
                      className={`search-results-height-btn${visibleRowCap === VISIBLE_ROWS.expanded ? ' is-active' : ''}`}
                      onClick={() => setVisibleRowCap(VISIBLE_ROWS.expanded)}
                      aria-pressed={visibleRowCap === VISIBLE_ROWS.expanded}
                    >
                      {VISIBLE_ROWS.expanded}
                    </button>
                  </div>
                </div>
                <div className="search-results-stack">
                  <div
                    className={`search-results search-results--selectable search-results--cap-${visibleRowCap}`}
                    ref={searchResultsRef}
                  >
                    {filteredSearchResults.map((p, index) => (
                      <div
                        key={p.url}
                        className={[
                          'search-result-row',
                          resultRowClassName,
                          selectedSearchUrls.has(p.url) ? 'search-result-row--selected' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onMouseDown={(e) => handleSearchRowMouseDown(e, index)}
                        onMouseEnter={() => handleSearchRowMouseEnter(index)}
                      >
                        <span className="result-name">{p.product_name || p.url}</span>
                        <div className="result-shop-stack">
                          <span className="result-shop-main">{p.shop ?? '—'}</span>
                          {p.category ? (
                            <span className="result-shop-category" title={p.category}>
                              {p.category}
                            </span>
                          ) : null}
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
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => void onAddOne(p)}
                          disabled={addBlocked}
                          title={
                            listAtCapacity && listMaxItems != null
                              ? `Лимит ${listMaxItems} товаров в ${alreadyInPhrase}`
                              : addOneTitle
                          }
                        >
                          + Добавить
                        </button>
                      </div>
                    ))}
                    {filteredSearchResults.length === 0 && searchResults.length > 0 && (
                      <p className="muted">Нет совпадений по фильтру, либо всё уже есть в {alreadyInPhrase}.</p>
                    )}
                  </div>
                  <div className="search-results-stack-footer">
                    {searchHasMore ? (
                      <button
                        type="button"
                        className="search-result-load-more-row"
                        onClick={() => void loadMoreSearch()}
                        disabled={searchLoadingMore}
                      >
                        {searchLoadingMore ? 'Загрузка…' : 'Загрузить ещё'}
                      </button>
                    ) : (
                      <div className="search-result-load-more-slot" aria-hidden="true" />
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
