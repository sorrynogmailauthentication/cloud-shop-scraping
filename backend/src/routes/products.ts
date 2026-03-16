import { Router, type Request, type Response } from 'express';
import { searchProducts, getPriceHistory, getShops, getShopCategoryPairs } from '../db/products.js';

const router = Router();

/** GET /api/products/shops - distinct shops for multi-select */
router.get('/shops', async (_req: Request, res: Response) => {
  try {
    const shops = await getShops();
    res.json({ shops });
  } catch (err) {
    console.error('Shops error:', err);
    res.status(500).json({ error: 'Failed to load shops' });
  }
});

/** GET /api/products/shop-category-pairs - distinct (shop, category) for "Shop - Category" multi-select */
router.get('/shop-category-pairs', async (_req: Request, res: Response) => {
  try {
    const pairs = await getShopCategoryPairs();
    res.json({ pairs });
  } catch (err) {
    console.error('Shop-category pairs error:', err);
    res.status(500).json({ error: 'Failed to load pairs' });
  }
});

/** GET /api/products?q=&url=&shop=&shop=...&pair=&pair=...&priceMin=&priceMax=&limit=&offset= - search. shop and pair can repeat. */
router.get('/', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const url = typeof req.query.url === 'string' ? req.query.url : undefined;
  const rawShops = req.query.shop;
  const shops = Array.isArray(rawShops)
    ? (rawShops as string[]).map((s) => String(s).trim()).filter(Boolean)
    : typeof rawShops === 'string' && rawShops.trim()
      ? [rawShops.trim()]
      : [];
  const rawPairs = req.query.pair;
  const pairStrs = Array.isArray(rawPairs)
    ? (rawPairs as string[]).filter((s) => typeof s === 'string' && s.includes('|'))
    : typeof rawPairs === 'string' && rawPairs.includes('|')
      ? [rawPairs]
      : [];
  const pairs = pairStrs.map((s) => {
    const [shop, category] = s.split('|');
    return { shop: (shop ?? '').trim(), category: (category ?? '').trim() };
  }).filter((p) => p.shop && p.category);
  const priceMin = typeof req.query.priceMin === 'string' ? parseFloat(req.query.priceMin) : undefined;
  const priceMax = typeof req.query.priceMax === 'string' ? parseFloat(req.query.priceMax) : undefined;
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 50;
  const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

  try {
    const products = await searchProducts({
      q,
      url,
      shops: shops.length > 0 ? shops : undefined,
      pairs: pairs.length > 0 ? pairs : undefined,
      priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
      limit: safeLimit,
      offset: safeOffset,
    });
    res.json({ products });
  } catch (err) {
    console.error('Search products error:', err);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

/** GET /api/products/prices?product_url=...&from=YYYY-MM-DD&to=YYYY-MM-DD - one product. */
/** GET /api/products/prices?product_url=...&product_url=...&from=&to= - multiple products (batch). */
router.get('/prices', async (req: Request, res: Response) => {
  const rawUrls = req.query.product_url;
  const productUrls = Array.isArray(rawUrls)
    ? (rawUrls as string[]).map((u) => String(u).trim()).filter(Boolean)
    : typeof rawUrls === 'string' && rawUrls.trim()
      ? [rawUrls.trim()]
      : [];
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;

  if (productUrls.length === 0) {
    res.status(400).json({ error: 'At least one product_url is required' });
    return;
  }
  if (!from || !to) {
    res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });
    return;
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    return;
  }
  if (from > to) {
    res.status(400).json({ error: 'from must be <= to' });
    return;
  }
  const uniqueUrls = [...new Set(productUrls)].slice(0, 20);

  try {
    const results = await Promise.all(
      uniqueUrls.map(async (product_url) => {
        const history = await getPriceHistory(product_url, from, to);
        return { product_url, history };
      })
    );
    res.json({ results });
  } catch (err) {
    console.error('Price history error:', err);
    res.status(500).json({ error: 'Failed to load price history' });
  }
});

export default router;
