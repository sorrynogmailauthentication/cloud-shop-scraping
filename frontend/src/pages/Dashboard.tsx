import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { useKeepScrollOnListSwitch } from '../hooks/useKeepScrollOnListSwitch';
import { formatPriceDisplay } from '../utils/priceHistory';
import { obscureProductDisplayName } from '../utils/productDisplay';
import { priceChartYDomain, Y_AXIS_TICK_COUNT, YAxisTickHideTopLabel } from '../utils/chartAxis';
import { CHART_SERIES_COLORS, chartSeriesStrokeDash } from '../utils/chartColors';

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

export default function Dashboard() {
  const { user, token } = useAuth();

  const hasAccess =
    user?.isPaid &&
    (!user.accessUntil || user.accessUntil >= todayStr());

  if (!user?.isPaid) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Ожидайте подтверждения от администратора</h2>
        <p className="muted">
          Ваш аккаунт (<strong>{user?.displayName || user?.login}</strong>
          {user?.email && ` — ${user.email}`}) ожидает подтверждения. Дашборд станет доступен после подтверждения администратором.
        </p>
      </main>
    );
  }

  if (!hasAccess && user.accessUntil) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Доступ истек</h2>
        <p className="muted">
          Ваш доступ к дашборду завершился <strong>{user.accessUntil}</strong>. Обратитесь к администратору для продления.
        </p>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <h2>Дашборд</h2>
      <p className="muted">
        Вы вошли как <strong>{user?.displayName || user?.login}</strong>
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

  useKeepScrollOnListSwitch(currentListId, listLoading);

  const loadLists = useCallback(async () => {
    if (!token) return;
    try {
      const { lists: L } = await fetchMyLists(token, 'table');
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
      const { list } = await createList(token, 'таблица 1', null, 'table');
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
      setSearchError(e instanceof Error ? e.message : 'Ошибка поиска');
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
      { url: product.url, name: product.product_name || product.url },
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

  const chartYDomain = useMemo(
    () => priceChartYDomain(chartData, chartProducts.length),
    [chartData, chartProducts.length]
  );

  return (
    <div className="dashboard-grid">
      <section className="dashboard-widget search-widget">
        <h3>Поиск товаров</h3>
        <p className="widget-hint">По названию, ссылке (URL), категории или магазину</p>
        <div className="search-form">
          <input
            type="text"
            placeholder="Название (часть)"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <input
            type="text"
            placeholder="Ссылка (часть)"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <input
            type="text"
            placeholder="Категория"
            value={searchCategory}
            onChange={(e) => setSearchCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <input
            type="text"
            placeholder="Магазин"
            value={searchShop}
            onChange={(e) => setSearchShop(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            className="search-input"
          />
          <button type="button" className="btn-primary btn-search" onClick={runSearch} disabled={searchLoading}>
            {searchLoading ? 'Поиск…' : 'Поиск'}
          </button>
        </div>
        {searchError && <div className="widget-error">{searchError}</div>}
        {searchResults.length > 0 && (
          <div className="search-actions">
            <button type="button" className="btn-add-all" onClick={addAllToTable}>
              Добавить всё в таблицу
            </button>
          </div>
        )}
        <div className="search-results">
          {searchResults.slice(0, 30).map((p) => (
            <div key={p.url} className="search-result-row">
              <span className="result-name">{obscureProductDisplayName(p.product_name, p.url)}</span>
              <span className="result-price">
                {p.price != null ? formatPriceDisplay(p.price) : '—'}
                {p.discount_pct != null && ` (−${p.discount_pct}%)`}
              </span>
              <button type="button" className="btn-add-one" onClick={() => addOneToTable(p)} title="Добавить в таблицу">
                + Добавить
              </button>
            </div>
          ))}
          {searchResults.length > 30 && <p className="muted">… и еще {searchResults.length - 30}</p>}
        </div>
      </section>

      <section className="dashboard-widget table-widget">
        <h3>Моя таблица</h3>
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
          <p className="widget-hint">Найдите товары и нажмите &quot;Добавить всё&quot; или &quot;+ Добавить&quot;, чтобы создать и заполнить первый список.</p>
        )}
        {listLoading && <p className="muted">Загрузка…</p>}
        {listWithItems && !listLoading && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Ссылка</th>
                  <th>Цена</th>
                  <th>До скидки</th>
                  <th>Скидка %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listWithItems.items.map((item) => (
                  <tr key={item.id}>
                    <td>{obscureProductDisplayName(item.product?.product_name, item.product_url)}</td>
                    <td>
                      <a href={item.product_url} target="_blank" rel="noopener noreferrer" className="table-link">
                        Ссылка
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
                    <td>
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeFromTable(item.product_url)}
                        title="Удалить из таблицы"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listWithItems.items.length === 0 && (
              <p className="muted table-empty">Нет элементов. Добавьте их через поиск выше.</p>
            )}
          </div>
        )}
      </section>

      <section className="dashboard-widget chart-widget">
        <h3>История цен</h3>
        <div className="chart-controls">
          <select
            className="range-select"
            value={chartRange}
            onChange={(e) => setChartRange(e.target.value as '7d' | '14d' | '30d')}
          >
            <option value="7d">7 дней</option>
            <option value="14d">14 дней</option>
            <option value="30d">30 дней</option>
          </select>
          <div className="chart-search">
            <input
              type="text"
              placeholder="Найти товар для добавления в график…"
              value={chartSearchQ}
              onChange={(e) => setChartSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runChartSearch()}
              className="search-input"
            />
            <button type="button" className="btn-primary btn-search" onClick={runChartSearch}>
              Поиск
            </button>
          </div>
        </div>
        {chartSearchResults.length > 0 && (
          <ul className="chart-search-results">
            {chartSearchResults.map((p) => (
              <li key={p.url}>
                <span>{obscureProductDisplayName(p.product_name, p.url)}</span>
                <button type="button" className="btn-add-one" onClick={() => addProductToChart(p)}>
                  Добавить в график
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="chart-products">
          {chartProducts.map((p, i) => (
            <span key={p.url} className="chart-tag" style={{ borderColor: CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length] }}>
              {obscureProductDisplayName(p.name, p.url)}
              <button type="button" className="chart-tag-remove" onClick={() => removeProductFromChart(p.url)}>
                ✕
              </button>
            </span>
          ))}
        </div>
        {chartLoading && <p className="muted">Загрузка графика…</p>}
        {chartData.length > 0 && !chartLoading && (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={640}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis
                  stroke="var(--muted)"
                  tick={YAxisTickHideTopLabel}
                  domain={chartYDomain}
                  tickCount={Y_AXIS_TICK_COUNT}
                  interval={0}
                />
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
                    name={obscureProductDisplayName(p.name, p.url)}
                    stroke={CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
                    strokeDasharray={chartSeriesStrokeDash(i)}
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
          <p className="widget-hint">Найдите и добавьте товары, чтобы увидеть историю цен.</p>
        )}
      </section>
    </div>
  );
}
