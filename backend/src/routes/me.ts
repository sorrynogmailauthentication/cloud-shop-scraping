import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import {
  getListsByUserId,
  getListById,
  getListWithItems,
  createList,
  updateList,
  deleteList,
  addListItem,
  removeListItem,
  clearListItems,
} from '../db/lists.js';

const router = Router();
router.use(requireAuth);

/** GET /api/me/lists - my lists */
router.get('/lists', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  try {
    const lists = await getListsByUserId(userId);
    res.json({ lists });
  } catch (err) {
    console.error('Get lists error:', err);
    res.status(500).json({ error: 'Failed to load lists' });
  }
});

/** POST /api/me/lists - create list */
router.post('/lists', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : null;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const list = await createList(userId, name, description || undefined);
    res.status(201).json({ list });
  } catch (err) {
    console.error('Create list error:', err);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

/** GET /api/me/lists/:id - list with items (and product + price info) */
router.get('/lists/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const listId = req.params.id;
  const list = await getListWithItems(listId, userId);
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  res.json({ list });
});

/** PATCH /api/me/lists/:id - update list name/description */
router.patch('/lists/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const listId = req.params.id;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const description = req.body?.description !== undefined
    ? (typeof req.body.description === 'string' ? req.body.description.trim() : null)
    : undefined;
  const list = await updateList(listId, userId, { name, description });
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  res.json({ list });
});

/** DELETE /api/me/lists/:id */
router.delete('/lists/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const listId = req.params.id;
  const ok = await deleteList(listId, userId);
  if (!ok) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  res.status(204).send();
});

/** DELETE /api/me/lists/:id/items - clear all items from list */
router.delete('/lists/:id/items', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const listId = req.params.id;
  await clearListItems(listId, userId);
  res.status(204).send();
});

/** POST /api/me/lists/:id/items - add product to list. Body: { product_url } */
router.post('/lists/:id/items', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const listId = req.params.id;
  const productUrl = typeof req.body?.product_url === 'string' ? req.body.product_url.trim() : '';
  if (!productUrl) {
    res.status(400).json({ error: 'product_url is required' });
    return;
  }
  const result = await addListItem(listId, userId, productUrl);
  if (!result.added) {
    if (result.error === 'List not found') res.status(404).json({ error: result.error });
    else if (result.error === 'Product not found') res.status(400).json({ error: result.error });
    else if (result.error === 'Already in list') res.status(409).json({ error: result.error });
    else res.status(500).json({ error: 'Failed to add item' });
    return;
  }
  res.status(201).json({ ok: true });
});

/** DELETE /api/me/lists/:id/items/:productUrl - remove product from list */
router.delete('/lists/:id/items/:productUrl', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const listId = req.params.id;
  const productUrl = decodeURIComponent(req.params.productUrl || '');
  if (!productUrl) {
    res.status(400).json({ error: 'product_url required' });
    return;
  }
  const ok = await removeListItem(listId, userId, productUrl);
  if (!ok) {
    res.status(404).json({ error: 'List or item not found' });
    return;
  }
  res.status(204).send();
});

export default router;
