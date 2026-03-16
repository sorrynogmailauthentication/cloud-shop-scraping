import { useEffect, useState } from 'react';
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
import type { ProductWithPrice } from '../types/dashboard';
import { searchProducts, fetchPriceHistory } from '../api/dashboard';

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
      <h2>Price history</h2>
      <GraphContent token={token} />
    </main>
  );
}

function GraphContent({ token }: { token: string | null }) {
  const [chartRange, setChartRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [chartProducts, setChartProducts] = useState<{ url: string; name: string }[]>([]);
  const [chartSearchResults, setChartSearchResults] = useState<ProductWithPrice[]>([]);
  const [chartSearchQ, setChartSearchQ] = useState('');
  const [chartData, setChartData] = useState<{ date: string; [key: string]: string | number | null }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const runChartSearch = async () => {
    setChartSearchResults([]);
    if (!chartSearchQ.trim()) return;
    try {
      const { products } = await searchProducts(token, { q: chartSearchQ, limit: 20 });
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

  const clearGraph = () => {
    setChartProducts([]);
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
    <div className="graph-page-layout">
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
        {chartProducts.length > 0 && (
          <button type="button" className="btn-clear-graph" onClick={clearGraph}>
            Clear graph
          </button>
        )}
      </div>
      {chartSearchResults.length > 0 && (
        <ul className="chart-search-results">
          {chartSearchResults.map((p) => (
            <li key={p.url}>
              <span className="cell-wrap">{p.product_name || p.url}</span>
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
            <span className="cell-wrap">{p.name}</span>
            <button type="button" className="chart-tag-remove" onClick={() => removeProductFromChart(p.url)}>
              ✕
            </button>
          </span>
        ))}
      </div>
      {chartLoading && <p className="muted">Loading chart…</p>}
      {chartData.length > 0 && !chartLoading && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={360}>
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
    </div>
  );
}
