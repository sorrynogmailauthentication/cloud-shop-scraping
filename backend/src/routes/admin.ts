import { Router, type Request } from 'express';
import { config } from '../config.js';
import { requireAdmin } from '../auth/adminMiddleware.js';
import { signAdminToken } from '../auth/jwt.js';
import { getPool } from '../db/index.js';
import { getUserByEmail, setUserPaid, setUserAccessUntil } from '../db/users.js';
import { revokeAllUserSessions } from '../db/sessions.js';

const router = Router();

router.post('/login', (req: Request, res) => {
  const { login, password } = req.body as { login?: string; password?: string };
  if (config.adminLogin === '' || config.adminPassword === '') {
    res.status(503).json({ error: 'Admin login not configured (ADMIN_LOGIN/ADMIN_PASSWORD)' });
    return;
  }
  if (login !== config.adminLogin || password !== config.adminPassword) {
    res.status(401).json({ error: 'Invalid login or password' });
    return;
  }
  const token = signAdminToken();
  res.json({ token });
});

router.use(requireAdmin);

router.patch('/users/set-paid', async (req: Request, res) => {
  const { id, email, isPaid } = req.body as { id?: string; email?: string; isPaid?: boolean };
  if (typeof isPaid !== 'boolean') {
    res.status(400).json({ error: 'Body must include isPaid (boolean)' });
    return;
  }
  if (id) {
    const updated = await setUserPaid(id, isPaid);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    return res.json({ user: { id: updated.id, email: updated.email, login: updated.login, isPaid: Boolean(updated.is_paid) } });
  }
  if (email) {
    const user = await getUserByEmail(email);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const updated = await setUserPaid(user.id, isPaid);
    return res.json({ user: { id: updated!.id, email: updated!.email, login: updated!.login, isPaid } });
  }
  res.status(400).json({ error: 'Body must include id or email' });
});

router.patch('/users/set-access', async (req: Request, res) => {
  const { id, email, accessUntil } = req.body as { id?: string; email?: string; accessUntil?: string | null };
  if (id) {
    const value = accessUntil === undefined ? undefined : (accessUntil === null || accessUntil === '' ? null : accessUntil);
    if (value !== undefined && value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      res.status(400).json({ error: 'accessUntil must be YYYY-MM-DD or null' });
      return;
    }
    const updated = await setUserAccessUntil(id, value ?? null);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    return res.json({ user: { id: updated.id, accessUntil: updated.access_until } });
  }
  if (email) {
    const user = await getUserByEmail(email);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const value = accessUntil === undefined ? null : (accessUntil === null || accessUntil === '' ? null : accessUntil);
    if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      res.status(400).json({ error: 'accessUntil must be YYYY-MM-DD or null' });
      return;
    }
    const updated = await setUserAccessUntil(user.id, value);
    return res.json({ user: { id: updated!.id, accessUntil: updated!.access_until } });
  }
  res.status(400).json({ error: 'Body must include id or email' });
});

router.post('/users/expire-sessions', async (req: Request, res) => {
  const { id, email } = req.body as { id?: string; email?: string };
  if (id) {
    const revoked = await revokeAllUserSessions(id);
    return res.json({ ok: true, revoked });
  }
  if (email) {
    const user = await getUserByEmail(email);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const revoked = await revokeAllUserSessions(user.id);
    return res.json({ ok: true, revoked });
  }
  res.status(400).json({ error: 'Body must include id or email' });
});

router.get('/users', async (_req, res) => {
  const result = await getPool().query(
    'SELECT id, email, login, display_name, is_paid, access_until, created_at FROM users ORDER BY created_at DESC'
  );
  const rows = result.rows.map((r: { id: string; email: string | null; login: string; display_name: string | null; is_paid: number; access_until: string | null; created_at: Date | string }) => ({
    id: r.id,
    email: r.email,
    login: r.login,
    display_name: r.display_name,
    is_paid: Number(r.is_paid),
    access_until: r.access_until,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
  res.json({ users: rows });
});

export default router;
