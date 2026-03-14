import { getPool } from './index.js';

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

/** Search products by partial name, url, category, shop. Returns latest price per product. */
export async function searchProducts(params: {
  q?: string;
  url?: string;
  category?: string;
  shop?: string;
  limit?: number;
}): Promise<ProductWithPrice[]> {
  const { q, url, category, shop, limit = 50 } = params;
  const p = getPool();

  const conditions: string[] = ['1=1'];
  const values: unknown[] = [];
  let idx = 1;

  if (q && q.trim()) {
    conditions.push(`p.product_name ILIKE $${idx}`);
    values.push(`%${q.trim()}%`);
    idx++;
  }
  if (url && url.trim()) {
    conditions.push(`p.url ILIKE $${idx}`);
    values.push(`%${url.trim()}%`);
    idx++;
  }
  if (category && category.trim()) {
    conditions.push(`p.category ILIKE $${idx}`);
    values.push(`%${category.trim()}%`);
    idx++;
  }
  if (shop && shop.trim()) {
    conditions.push(`p.shop ILIKE $${idx}`);
    values.push(`%${shop.trim()}%`);
    idx++;
  }

  values.push(limit);
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (product_url) product_url, date, price, discount
      FROM prices
      ORDER BY product_url, date DESC
    ),
    parsed AS (
      SELECT product_url, price,
             NULLIF(TRIM(REGEXP_REPLACE(COALESCE(discount,''), '[^0-9.,]', '', 'g')), '')::numeric AS price_before_discount
      FROM latest
    )
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
    LEFT JOIN parsed par ON par.product_url = p.url
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.product_name ASC NULLS LAST
    LIMIT $${idx}
  `;

  const res = await p.query(sql, values);
  return (res.rows as Record<string, unknown>[]).map((row) => ({
    url: String(row.url),
    product_name: row.product_name != null ? String(row.product_name) : null,
    shop: row.shop != null ? String(row.shop) : null,
    category: row.category != null ? String(row.category) : null,
    article: row.article != null ? String(row.article) : null,
    price: row.price != null ? Number(row.price) : null,
    price_before_discount: row.price_before_discount != null ? Number(row.price_before_discount) : null,
    discount_pct: row.discount_pct != null ? Number(row.discount_pct) : null,
  }));
}

/** Price history for one product in date range. */
export async function getPriceHistory(
  productUrl: string,
  fromDate: string,
  toDate: string
): Promise<PricePoint[]> {
  const p = getPool();
  const res = await p.query(
    `WITH parsed AS (
       SELECT date, price,
              NULLIF(TRIM(REGEXP_REPLACE(COALESCE(discount,''), '[^0-9.,]', '', 'g')), '')::numeric AS price_before_discount
       FROM prices
       WHERE product_url = $1 AND date >= $2 AND date <= $3
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
    price: row.price != null ? Number(row.price) : null,
    price_before_discount: row.price_before_discount != null ? Number(row.price_before_discount) : null,
    discount_pct: row.discount_pct != null ? Number(row.discount_pct) : null,
  }));
}
