import { getPool } from './index.js';
import type { ProductWithPrice } from './products.js';

/** Normalize price: comma to dot, return as number (no rounding). */
function priceToNum(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const s = String(val).replace(/,/g, '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export interface UserList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserListItem {
  id: number;
  list_id: string;
  product_url: string;
  position: number;
  created_at: string;
}

export interface ListWithItems extends UserList {
  items: (UserListItem & { product?: ProductWithPrice })[];
}

function rowToList(row: Record<string, unknown>): UserList {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    sort_order: Number(row.sort_order),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function getListsByUserId(userId: string): Promise<UserList[]> {
  const res = await getPool().query(
    'SELECT id, user_id, name, description, sort_order, created_at, updated_at FROM user_lists WHERE user_id = $1 ORDER BY sort_order, created_at',
    [userId]
  );
  return res.rows.map((r: Record<string, unknown>) => rowToList(r));
}

export async function getListById(listId: string, userId: string): Promise<UserList | null> {
  const res = await getPool().query(
    'SELECT id, user_id, name, description, sort_order, created_at, updated_at FROM user_lists WHERE id = $1 AND user_id = $2',
    [listId, userId]
  );
  if (res.rows.length === 0) return null;
  return rowToList(res.rows[0]);
}

export async function createList(
  userId: string,
  name: string,
  description?: string | null
): Promise<UserList> {
  const pool = getPool();
  const nextOrder = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM user_lists WHERE user_id = $1',
    [userId]
  );
  const sortOrder = Number((nextOrder.rows[0] as { next_order: number }).next_order);
  const res = await pool.query(
    `INSERT INTO user_lists (user_id, name, description, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, name, description, sort_order, created_at, updated_at`,
    [userId, name, description ?? null, sortOrder]
  );
  return rowToList(res.rows[0]);
}

export async function updateList(
  listId: string,
  userId: string,
  updates: { name?: string; description?: string | null }
): Promise<UserList | null> {
  if (!updates.name && updates.description === undefined) {
    return getListById(listId, userId);
  }
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (updates.name !== undefined) {
    setClauses.push(`name = $${i++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${i++}`);
    values.push(updates.description);
  }
  setClauses.push(`updated_at = NOW()`);
  values.push(listId, userId);
  const res = await getPool().query(
    `UPDATE user_lists SET ${setClauses.join(', ')} WHERE id = $${i} AND user_id = $${i + 1}
     RETURNING id, user_id, name, description, sort_order, created_at, updated_at`,
    values
  );
  if (res.rows.length === 0) return null;
  return rowToList(res.rows[0]);
}

export async function deleteList(listId: string, userId: string): Promise<boolean> {
  const res = await getPool().query('DELETE FROM user_lists WHERE id = $1 AND user_id = $2', [
    listId,
    userId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function getListItems(listId: string, userId: string): Promise<UserListItem[]> {
  const res = await getPool().query(
    `SELECT li.id, li.list_id, li.product_url, li.position, li.created_at
     FROM user_list_items li
     JOIN user_lists l ON l.id = li.list_id AND l.user_id = $2
     WHERE li.list_id = $1
     ORDER BY li.position, li.created_at`,
    [listId, userId]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    list_id: String(r.list_id),
    product_url: String(r.product_url),
    position: Number(r.position),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function getListWithItems(listId: string, userId: string): Promise<ListWithItems | null> {
  const list = await getListById(listId, userId);
  if (!list) return null;
  const items = await getListItems(listId, userId);
  const pool = getPool();
  const withProducts = await Promise.all(
    items.map(async (item) => {
      const pr = await pool.query(
        `WITH latest AS (
          SELECT price, discount FROM prices WHERE product_url = $1 ORDER BY date DESC LIMIT 1
        ),
        parsed AS (
          SELECT price,
                 NULLIF(REPLACE(TRIM(REGEXP_REPLACE(COALESCE(discount,''), '[^0-9.,]', '', 'g')), ',', '.'), '')::numeric AS price_before_discount
          FROM latest
        )
        SELECT p.url, p.product_name, p.shop, p.category, p.article,
               par.price::numeric AS price, par.price_before_discount,
               CASE
                 WHEN par.price_before_discount IS NOT NULL AND par.price_before_discount > 0
                      AND par.price_before_discount > COALESCE(par.price, 0)
                 THEN ROUND(((par.price_before_discount - COALESCE(par.price, 0)) / par.price_before_discount * 100)::numeric, 2)
                 ELSE NULL
               END AS discount_pct
        FROM products p
        LEFT JOIN parsed par ON true
        WHERE p.url = $1`,
        [item.product_url]
      );
      const row = pr.rows[0] as Record<string, unknown> | undefined;
      const product: ProductWithPrice | undefined = row
        ? {
            url: String(row.url),
            product_name: row.product_name != null ? String(row.product_name) : null,
            shop: row.shop != null ? String(row.shop) : null,
            category: row.category != null ? String(row.category) : null,
            article: row.article != null ? String(row.article) : null,
            price: priceToNum(row.price),
            price_before_discount: priceToNum(row.price_before_discount),
            discount_pct: row.discount_pct != null ? Number(row.discount_pct) : null,
          }
        : undefined;
      return { ...item, product };
    })
  );
  return { ...list, items: withProducts };
}

export async function addListItem(
  listId: string,
  userId: string,
  productUrl: string
): Promise<{ added: boolean; error?: string }> {
  const list = await getListById(listId, userId);
  if (!list) return { added: false, error: 'List not found' };
  const pool = getPool();
  const productExists = await pool.query('SELECT 1 FROM products WHERE url = $1', [productUrl]);
  if (productExists.rows.length === 0) return { added: false, error: 'Product not found' };
  const maxPos = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM user_list_items WHERE list_id = $1',
    [listId]
  );
  const nextPos = Number((maxPos.rows[0] as { next: number }).next);
  try {
    await pool.query(
      'INSERT INTO user_list_items (list_id, product_url, position) VALUES ($1, $2, $3)',
      [listId, productUrl, nextPos]
    );
    return { added: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('duplicate')) return { added: false, error: 'Already in list' };
    throw e;
  }
}

export async function removeListItem(
  listId: string,
  userId: string,
  productUrl: string
): Promise<boolean> {
  const res = await getPool().query(
    `DELETE FROM user_list_items
     WHERE list_id = $1 AND product_url = $2
     AND EXISTS (SELECT 1 FROM user_lists WHERE id = $1 AND user_id = $3)`,
    [listId, productUrl, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function clearListItems(listId: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `DELETE FROM user_list_items li
     USING user_lists l
     WHERE li.list_id = l.id AND l.id = $1 AND l.user_id = $2`,
    [listId, userId]
  );
  return (res.rowCount ?? 0) >= 0;
}
