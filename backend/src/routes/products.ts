import { Router, type Request, type Response } from 'express';
import { searchProducts, getPriceHistory } from '../db/products.js';

const router = Router();

/** GET /api/products?q=&url=&category=&shop=&limit= - search products with latest price. */
router.get('/', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const url = typeof req.query.url === 'string' ? req.query.url : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const shop = typeof req.query.shop === 'string' ? req.query.shop : undefined;
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 200 ? limit : 50;

  try {
    const products = await searchProducts({ q, url, category, shop, limit: safeLimit });
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
