import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';
import type { JwtPayload } from '../types/auth.js';

const { secret, expiresIn } = config.jwt;
const jwtExpiresIn = expiresIn as SignOptions['expiresIn'];

export type { JwtPayload };

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: jwtExpiresIn });
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
  return jwt.sign({ admin: true } as AdminPayload, secret, { expiresIn: jwtExpiresIn });
}