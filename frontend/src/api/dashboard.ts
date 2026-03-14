const API_BASE = import.meta.env.VITE_API_URL as string || '';

function authHeaders(token: string | null): HeadersInit {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export interface SearchParams {
  q?: string;
  url?: string;
  category?: string;
  shop?: string;
  limit?: number;
}

export async function searchProducts(
  token: string | null,
  params: SearchParams
): Promise<{ products: import('../types/dashboard').ProductWithPrice[] }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.url) sp.set('url', params.url);
  if (params.category) sp.set('category', params.category);
  if (params.shop) sp.set('shop', params.shop);
  if (params.limit != null) sp.set('limit', String(params.limit));
  const res = await fetch(`${API_BASE}/api/products?${sp}`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Search failed'));
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

export async function fetchMyLists(
  token: string | null
): Promise<{ lists: import('../types/dashboard').UserList[] }> {
  const res = await fetch(`${API_BASE}/api/me/lists`, {
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
  description?: string | null
): Promise<{ list: import('../types/dashboard').UserList }> {
  const res = await fetch(`${API_BASE}/api/me/lists`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
    body: JSON.stringify({ name, description: description ?? null }),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Create list failed'));
  return res.json();
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
