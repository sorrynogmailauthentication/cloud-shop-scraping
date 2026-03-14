import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { verifyAdminToken } from './jwt.js';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const secretHeader = req.headers['x-admin-secret'];

  if (bearerToken) {
    const payload = verifyAdminToken(bearerToken);
    if (payload) {
      next();
      return;
    }
  }

  if (config.adminSecret && secretHeader === config.adminSecret) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
