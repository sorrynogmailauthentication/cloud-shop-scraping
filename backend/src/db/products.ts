import { getPool } from './index.js';

/** Normalize price: comma to dot, return as number (no rounding). */
function priceToNum(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const s = String(val).replace(/,/g, '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export interface ProductWithPrice {
  url: string;
  product_name: string | null;
  shop: string | null;
  category: string | null;
  article: string | null;
  price: number | null;
  price_before_discount: number | null;
  discount_pct: number | null;
}

export interface PricePoint {
  date: string;
  price: number | null;
  price_before_discount: number | null;
  discount_pct: number | null;
}

/** Search products by partial name, url, shops (multiple), shop-category pairs (multiple), price range. Supports offset for pagination. */
export async function searchProducts(params: {
  q?: string;
  url?: string;
  shops?: string[];
  pairs?: { shop: string; category: string }[];
  priceMin?: number;
  priceMax?: number;
  limit?: number;
  offset?: number;
}): Promise<ProductWithPrice[]> {
  const { q, url, shops = [], pairs = [], priceMin, priceMax, limit = 50, offset = 0 } = params;
  const p = getPool();

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;

  if (q && q.trim()) {
    conditions.push(`p.product_name ILIKE $${idx}`);
    values.push(`%${q.trim()}%`);
    idx++;
  }
  if (shops.length > 0) {
    conditions.push(`p.shop = ANY($${idx}::text[])`);
    values.push(shops);
    idx++;
  }
  if (pairs.length > 0) {
    const pairShops = pairs.map((x) => x.shop);
    const pairCats = pairs.map((x) => x.category);
    conditions.push(`(p.shop, p.category) IN (SELECT s, c FROM unnest($${idx}::text[], $${idx + 1}::text[]) AS t(s, c))`);
    values.push(pairShops, pairCats);
    idx += 2;
  }
  if (url && url.trim()) {
    conditions.push(`p.url ILIKE $${idx}`);
    values.push(`%${url.trim()}%`);
    idx++;
  }
  if (priceMin != null && Number.isFinite(priceMin)) {
    conditions.push(`(par.price IS NOT NULL AND par.price >= $${idx})`);
    values.push(priceMin);
    idx++;
  }
  if (priceMax != null && Number.isFinite(priceMax)) {
    conditions.push(`(par.price IS NOT NULL AND par.price <= $${idx})`);
    values.push(priceMax);
    idx++;
  }

  const qTrim = q?.trim();
  const hasQ = Boolean(qTrim);
  if (hasQ) {
    values.push(`${qTrim}%`, `%${qTrim}%`);
    idx += 2;
  }
  values.push(limit, Math.max(0, offset));
  const limitParam = idx;
  const offsetParam = idx + 1;
  const orderBy = hasQ
    ? `ORDER BY CASE WHEN p.product_name ILIKE $${idx - 2} THEN 0 WHEN p.product_name ILIKE $${idx - 1} THEN 1 ELSE 2 END, p.product_name ASC NULLS LAST`
    : 'ORDER BY p.product_name ASC NULLS LAST';
  /* Prefer today's price row; otherwise latest prior date (per product). Avoids scanning all prices. */
  const sql = `
    SELECT
      p.url,
      p.product_name,
      p.shop,
      p.category,
      p.article,
      par.price::numeric AS price,
      par.price_before_discount,
      CASE
        WHEN par.price_before_discount IS NOT NULL AND par.price_before_discount > 0
             AND par.price_before_discount > COALESCE(par.price, 0)
        THEN ROUND(((par.price_before_discount - COALESCE(par.price, 0)) / par.price_before_discount * 100)::numeric, 2)
        ELSE NULL
      END AS discount_pct
    FROM products p
    LEFT JOIN LATERAL (
      SELECT pr.price,
             NULLIF(REPLACE(TRIM(REGEXP_REPLACE(COALESCE(pr.discount,''), '[^0-9.,]', '', 'g')), ',', '.'), '')::numeric AS price_before_discount
      FROM prices pr
      WHERE pr.product_id = p.product_id
      ORDER BY (pr.date = CURRENT_DATE) DESC, pr.date DESC
      LIMIT 1
    ) par ON true
    WHERE ${conditions.join(' AND ')}
    ${orderBy}
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const res = await p.query(sql, values);
  return (res.rows as Record<string, unknown>[]).map((row) => ({
    url: String(row.url),
    product_name: row.product_name != null ? String(row.product_name) : null,
    shop: row.shop != null ? String(row.shop) : null,
    category: row.category != null ? String(row.category) : null,
    article: row.article != null ? String(row.article) : null,
    price: priceToNum(row.price),
    price_before_discount: priceToNum(row.price_before_discount),
    discount_pct: row.discount_pct != null ? Number(row.discount_pct) : null,
  }));
}

export async function getShops(): Promise<string[]> {
  const res = await getPool().query(
    'SELECT DISTINCT shop FROM products WHERE shop IS NOT NULL AND TRIM(shop) <> \'\' ORDER BY shop'
  );
  return (res.rows as { shop: string }[]).map((r) => r.shop);
}

export interface ShopCategoryPair {
  shop: string;
  category: string;
}

export async function getShopCategoryPairs(): Promise<ShopCategoryPair[]> {
  const res = await getPool().query(
    `SELECT DISTINCT shop, category FROM products
     WHERE shop IS NOT NULL AND TRIM(shop) <> '' AND category IS NOT NULL AND TRIM(category) <> ''
     ORDER BY shop, category`
  );
  return (res.rows as { shop: string; category: string }[]).map((r) => ({ shop: r.shop, category: r.category }));
}

/** Price history for one product (by canonical URL) in date range. */
export async function getPriceHistory(
  productUrl: string,
  fromDate: string,
  toDate: string
): Promise<PricePoint[]> {
  const p = getPool();
  const res = await p.query(
    `WITH parsed AS (
       SELECT pr.date, pr.price,
              NULLIF(REPLACE(TRIM(REGEXP_REPLACE(COALESCE(pr.discount,''), '[^0-9.,]', '', 'g')), ',', '.'), '')::numeric AS price_before_discount
       FROM prices pr
       INNER JOIN products p ON p.product_id = pr.product_id AND p.url = $1
       WHERE pr.date >= $2 AND pr.date <= $3
     )
     SELECT date::text, price, price_before_discount,
       CASE
         WHEN price_before_discount IS NOT NULL AND price_before_discount > 0 AND price_before_discount > COALESCE(price, 0)
         THEN ROUND(((price_before_discount - COALESCE(price, 0)) / price_before_discount * 100)::numeric, 2)
         ELSE NULL
       END AS discount_pct
     FROM parsed
     ORDER BY date ASC`,
    [productUrl, fromDate, toDate]
  );
  return (res.rows as Record<string, unknown>[]).map((row) => ({
    date: String(row.date),
    price: priceToNum(row.price),
    price_before_discount: priceToNum(row.price_before_discount),
    discount_pct: row.discount_pct != null ? Number(row.discount_pct) : null,
  }));
}
