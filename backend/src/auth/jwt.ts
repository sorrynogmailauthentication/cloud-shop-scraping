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
