import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { JwtPayload } from '../types/auth.js';

const { secret, expiresIn } = config.jwt;

export type { JwtPayload };

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

export interface AdminPayload {
  admin: true;
  iat?: number;
  exp?: number;
}

export function signAdminToken(): string {
  return jwt.sign({ admin: true } as AdminPayload, secret, { expiresIn });
}

export function verifyAdminToken(token: string): AdminPayload | null {
  try {
    const payload = jwt.verify(token, secret) as AdminPayload;
    return payload?.admin === true ? payload : null;
  } catch {
    return null;
  }
}
