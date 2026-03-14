import { useEffect, useState, useCallback } from 'react';
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
import type { ProductWithPrice, ListWithItems, UserList } from '../types/dashboard';
import {
  searchProducts,
  fetchPriceHistory,
  fetchMyLists,
  fetchListWithItems,
  createList,
  addProductToList,
  removeProductFromList,
} from '../api/dashboard';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateRange(range: '7d' | '14d' | '30d'): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === '7d') from.setDate(from.getDate() - 7);
  else if (range === '14d') from.setDate(from.getDate() - 14);
  else from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const CHART_COLORS = ['#f0b429', '#58a6ff', '#3fb950', '#d2a8ff', '#ff7b72'];

export default function Dashboard() {
  const { user, token } = useAuth();

  const hasAccess =
    user?.isPaid &&
    (!user.accessUntil || user.accessUntil >= todayStr());

  if (!user?.isPaid) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Please wait for admin confirmation</h2>
        <p className="muted">
          Your account (<strong>{user?.displayName || user?.login}</strong>
          {user?.email && ` — ${user.email}`}) is pending. You will see the dashboard once an admin has confirmed access.
        </p>
      </main>
    );
  }

  if (!hasAccess && user.accessUntil) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Access expired</h2>
        <p className="muted">
          Your dashboard access ended on <strong>{user.accessUntil}</strong>. Contact an admin to extend access.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <h2>Dashboard</h2>
      <p className="muted">
        Logged in as <strong>{user?.displayName || user?.login}</strong>
        {user?.email && ` (${user.email})`}.
      </p>
      <DashboardContent token={token} />
    </main>
  );
}

function DashboardContent({ token }: { token: string | null }) {
  const [searchQ, setSearchQ] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [searchShop, setSearchShop] = useState('');
  const [searchResults, setSearchResults] = useState<ProductWithPrice[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [lists, setLists] = useState<UserList[]>([]);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [listWithItems, setListWithItems] = useState<ListWithItems | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const [chartRange, setChartRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [chartProducts, setChartProducts] = useState<{ url: string; name: string }[]>([]);
  const [chartSearchResults, setChartSearchResults] = useState<ProductWithPrice[]>([]);
  const [chartSearchQ, setChartSearchQ] = useState('');
  const [chartData, setChartData] = useState<{ date: string; [key: string]: string | number | null }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

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
    try {
      const { products } = await searchProducts(token, {
        q: searchQ || undefined,
        url: searchUrl || undefined,
        category: searchCategory || undefined,
        shop: searchShop || undefined,
        limit: 100,
      });
      setSearchResults(products);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const addAllToTable = async () => {
    const listId = currentListId || (await ensureDefaultList());
    if (!listId || searchResults.length === 0) return;
    for (const p of searchResults) {
      try {
        await addProductToList(token, listId, p.url);
      } catch {
        // skip duplicates
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
      // already in list or error
    }
  };

  const removeFromTable = async (productUrl: string) => {
    if (!currentListId || !token) return;
    try {
      await removeProductFromList(token, currentListId, productUrl);
      loadListWithItems();
    } catch {
      // ignore
    }
  };

  const runChartSearch = async () => {
    setChartSearchResults([]);
    if (!chartSearchQ.trim()) return;
    try {
      const { products } = await searchProducts(token, {
        q: chartSearchQ,
        limit: 20,
      });
      setChartSearchResults(products);
    } catch {
      setChartSearchResults([]);
    }
  };

  const addProductToChart = (product: ProductWithPrice) => {
    if (chartProducts.some((p) => p.url === product.url)) return;
    setChartProducts((prev) => [
      ...prev,
      { url: product.url, name: product.product_name || product.url.slice(0, 40) },
    ]);
    setChartSearchResults([]);
    setChartSearchQ('');
  };

  const removeProductFromChart = (url: string) => {
    setChartProducts((prev) => prev.filter((p) => p.url !== url));
  };

  useEffect(() => {
    if (!token || chartProducts.length === 0) {
      setChartData([]);
      return;
    }
    const { from, to } = dateRange(chartRange);
    setChartLoading(true);
    fetchPriceHistory(token, chartProducts.map((p) => p.url), from, to)
      .then(({ results }) => {
        const byDate = new Map<string, Record<string, string | number | null>>();
        results.forEach((r, idx) => {
          const key = `p${idx}`;
          r.history.forEach((pt) => {
            let row = byDate.get(pt.date);
            if (!row) {
              row = { date: pt.date };
              byDate.set(pt.date, row);
            }
            row[key] = pt.price;
          });
        });
        const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const out = sorted.map(([, row]) => {
          const obj: { date: string; [key: string]: string | number | null } = { date: row.date as string };
          Object.keys(row).forEach((k) => (obj[k] = row[k] ?? null));
          return obj;
        });
        setChartData(out);
      })
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false));
  }, [token, chartProducts, chartRange]);

  return (
    <div className="dashboard-grid">
      <section className="dashboard-widget search-widget">
        <h3>Search products</h3>
        <p className="widget-hint">By name, link (URL), category, or shop</p>
        <div className="search-form">
          <input
            type="text"
            placeholder="Name (partial)"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <input
            type="text"
            placeholder="URL (partial)"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <input
            type="text"
            placeholder="Category"
            value={searchCategory}
            onChange={(e) => setSearchCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <input
            type="text"
            placeholder="Shop"
            value={searchShop}
            onChange={(e) => setSearchShop(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <button type="button" className="btn-primary btn-search" onClick={runSearch} disabled={searchLoading}>
            {searchLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchError && <div className="widget-error">{searchError}</div>}
        {searchResults.length > 0 && (
          <div className="search-actions">
            <button type="button" className="btn-add-all" onClick={addAllToTable}>
              Add all to table
            </button>
          </div>
        )}
        <div className="search-results">
          {searchResults.slice(0, 30).map((p) => (
            <div key={p.url} className="search-result-row">
              <span className="result-name">{p.product_name || p.url}</span>
              <span className="result-price">
                {p.price != null ? `${p.price}` : '—'}
                {p.discount_pct != null && ` (−${p.discount_pct}%)`}
              </span>
              <button type="button" className="btn-add-one" onClick={() => addOneToTable(p)} title="Add to table">
                + Add
              </button>
            </div>
          ))}
          {searchResults.length > 30 && <p className="muted">… and {searchResults.length - 30} more</p>}
        </div>
      </section>

      <section className="dashboard-widget table-widget">
        <h3>My table</h3>
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
        {!currentListId && lists.length === 0 && (
          <p className="widget-hint">Search and &quot;Add all&quot; or &quot;+ Add&quot; to create and fill your first list.</p>
        )}
        {listLoading && <p className="muted">Loading…</p>}
        {listWithItems && !listLoading && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Link</th>
                  <th>Price</th>
                  <th>Before discount</th>
                  <th>Discount %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listWithItems.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product?.product_name ?? item.product_url.slice(0, 50)}</td>
                    <td>
                      <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="table-link">
                        Link
                      </a>
                    </td>
                    <td>{item.product?.price != null ? item.product.price : '—'}</td>
                    <td>{item.product?.price_before_discount != null ? item.product.price_before_discount : '—'}</td>
                    <td>{item.product?.discount_pct != null ? `${item.product.discount_pct}%` : '—'}</td>
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
                ))}
              </tbody>
            </table>
            {listWithItems.items.length === 0 && (
              <p className="muted table-empty">No items. Add from search above.</p>
            )}
          </div>
        )}
      </section>

      <section className="dashboard-widget chart-widget">
        <h3>Price history</h3>
        <div className="chart-controls">
          <select
            className="range-select"
            value={chartRange}
            onChange={(e) => setChartRange(e.target.value as '7d' | '14d' | '30d')}
          >
            <option value="7d">7 days</option>
            <option value="14d">14 days</option>
            <option value="30d">30 days</option>
          </select>
          <div className="chart-search">
            <input
              type="text"
              placeholder="Search product to add to graph…"
              value={chartSearchQ}
              onChange={(e) => setChartSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runChartSearch()}
              className="search-input"
            />
            <button type="button" className="btn-primary btn-search" onClick={runChartSearch}>
              Search
            </button>
          </div>
        </div>
        {chartSearchResults.length > 0 && (
          <ul className="chart-search-results">
            {chartSearchResults.map((p) => (
              <li key={p.url}>
                <span>{p.product_name || p.url}</span>
                <button type="button" className="btn-add-one" onClick={() => addProductToChart(p)}>
                  Add to graph
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="chart-products">
          {chartProducts.map((p, i) => (
            <span key={p.url} className="chart-tag" style={{ borderColor: CHART_COLORS[i % CHART_COLORS.length] }}>
              {p.name}
              <button type="button" className="chart-tag-remove" onClick={() => removeProductFromChart(p.url)}>
                ✕
              </button>
            </span>
          ))}
        </div>
        {chartLoading && <p className="muted">Loading chart…</p>}
        {chartData.length > 0 && !chartLoading && (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Legend />
                {chartProducts.map((p, i) => (
                  <Line
                    key={p.url}
                    type="monotone"
                    dataKey={`p${i}`}
                    name={p.name.length > 25 ? p.name.slice(0, 25) + '…' : p.name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {chartProducts.length === 0 && !chartLoading && (
          <p className="widget-hint">Search and add products to see price history.</p>
        )}
      </section>
    </div>
  );
}
