const API_BASE = import.meta.env.VITE_API_URL as string || '';

function authHeaders(token: string | null): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function readApiErrorBody(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { error?: string };
    if (typeof j.error === 'string' && j.error.trim()) return j.error.trim();
  } catch {
    /* plain text */
  }
  return t.trim() || res.statusText || 'Request failed';
}

export interface SearchParams {
  q?: string;
  url?: string;
  shops?: string[];
  pairs?: { shop: string; category: string }[];
  priceMin?: number;
  priceMax?: number;
  limit?: number;
  offset?: number;
}

export async function searchProducts(
  token: string | null,
  params: SearchParams
): Promise<{ products: import('../types/dashboard').ProductWithPrice[] }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.url) sp.set('url', params.url);
  (params.shops ?? []).forEach((s) => sp.append('shop', s));
  (params.pairs ?? []).forEach((p) => sp.append('pair', `${p.shop}|${p.category}`));
  if (params.priceMin != null && Number.isFinite(params.priceMin)) sp.set('priceMin', String(params.priceMin));
  if (params.priceMax != null && Number.isFinite(params.priceMax)) sp.set('priceMax', String(params.priceMax));
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null && params.offset > 0) sp.set('offset', String(params.offset));
  const res = await fetch(`${API_BASE}/api/products?${sp}`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readApiErrorBody(res));
  return res.json();
}

export async function fetchShops(token: string | null): Promise<{ shops: string[] }> {
  const res = await fetch(`${API_BASE}/api/products/shops`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Shops failed'));
  return res.json();
}

export interface ShopCategoryPair {
  shop: string;
  category: string;
}

export async function fetchShopCategoryPairs(
  token: string | null
): Promise<{ pairs: ShopCategoryPair[] }> {
  const res = await fetch(`${API_BASE}/api/products/shop-category-pairs`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Pairs failed'));
  return res.json();
}

export interface PriceHistoryResult {
  product_url: string;
  history: import('../types/dashboard').PricePoint[];
}

export async function fetchPriceHistory(
  token: string | null,
  productUrls: string[],
  from: string,
  to: string
): Promise<{ results: PriceHistoryResult[] }> {
  const sp = new URLSearchParams({ from, to });
  productUrls.forEach((u) => sp.append('product_url', u));
  const res = await fetch(`${API_BASE}/api/products/prices?${sp}`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Price history failed'));
  return res.json();
}

const PRICE_HISTORY_BATCH = 20;

export async function fetchPriceHistoryBatched(
  token: string | null,
  productUrls: string[],
  from: string,
  to: string
): Promise<{ results: PriceHistoryResult[] }> {
  const unique = [...new Set(productUrls)];
  const results: PriceHistoryResult[] = [];
  for (let i = 0; i < unique.length; i += PRICE_HISTORY_BATCH) {
    const chunk = unique.slice(i, i + PRICE_HISTORY_BATCH);
    const { results: part } = await fetchPriceHistory(token, chunk, from, to);
    results.push(...part);
  }
  return { results };
}

export async function fetchMyLists(
  token: string | null,
  kind?: import('../types/dashboard').UserListKind
): Promise<{ lists: import('../types/dashboard').UserList[] }> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  const res = await fetch(`${API_BASE}/api/me/lists${q}`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Lists failed'));
  return res.json();
}

export async function fetchListWithItems(
  token: string | null,
  listId: string
): Promise<{ list: import('../types/dashboard').ListWithItems }> {
  const res = await fetch(`${API_BASE}/api/me/lists/${encodeURIComponent(listId)}`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'List failed'));
  return res.json();
}

export async function createList(
  token: string | null,
  name: string,
  description?: string | null,
  kind: import('../types/dashboard').UserListKind = 'table'
): Promise<{ list: import('../types/dashboard').UserList }> {
  const res = await fetch(`${API_BASE}/api/me/lists`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify({ name, description: description ?? null, kind }),
  });
  if (!res.ok) throw new Error(await readApiErrorBody(res));
  return res.json();
}

export async function deleteListApi(token: string | null, listId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await res.text().catch(() => 'Delete list failed'));
  }
}

export async function addProductToList(
  token: string | null,
  listId: string,
  productUrl: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/lists/${encodeURIComponent(listId)}/items`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify({ product_url: productUrl }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Add to list failed'));
}

export async function addProductsToListBatch(
  token: string | null,
  listId: string,
  productUrls: string[]
): Promise<{ added_count: number; missing_urls: string[] }> {
  const res = await fetch(`${API_BASE}/api/me/lists/${encodeURIComponent(listId)}/items/batch`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify({ product_urls: productUrls }),
  });
  if (!res.ok) throw new Error(await readApiErrorBody(res));
  return res.json();
}

export async function removeProductFromList(
  token: string | null,
  listId: string,
  productUrl: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/me/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(productUrl)}`,
    { method: 'DELETE', headers: authHeaders(token), credentials: 'include' }
  );
  if (!res.ok) throw new Error(await res.text().catch(() => 'Remove failed'));
}

export async function clearListItems(token: string | null, listId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/me/lists/${encodeURIComponent(listId)}/items`, {
    method: 'DELETE',
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Clear failed'));
}
