import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt.js';
import { isSessionActive, touchSession } from '../db/sessions.js';
import { getUserById } from '../db/users.js';

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!token) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Неверный или просроченный токен' });
      return;
    }

    const active = await isSessionActive(payload.sid, payload.id);
    if (!active) {
      res.status(401).json({ error: 'Сессия истекла или отозвана' });
      return;
    }

    await touchSession(payload.sid);
    req.user = payload;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Ошибка проверки авторизации' });
  }
}

export async function requirePaidAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }

    const dbUser = await getUserById(authUser.id);
    if (!dbUser) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const paid = dbUser.is_paid === 1;
    const accessUntil = dbUser.access_until;
    const activeByDate = !accessUntil || accessUntil >= todayYmd();
    if (!paid || !activeByDate) {
      res.status(403).json({ error: 'Требуется оплаченная подписка' });
      return;
    }

    // Keep request user in sync with latest subscription state from DB.
    req.user = {
      ...authUser,
      isPaid: paid,
      accessUntil,
    };
    next();
  } catch (err) {
    console.error('Paid access middleware error:', err);
    res.status(500).json({ error: 'Ошибка проверки доступа' });
  }
}
