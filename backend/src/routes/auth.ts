import { Router, type Request } from 'express';
import { getYandexAuthUrl, exchangeCodeForToken, getYandexUser } from '../auth/yandex.js';
import { signToken, verifyToken } from '../auth/jwt.js';
import { config } from '../config.js';
import type { JwtPayload } from '../types/auth.js';
import { upsertUser } from '../db/users.js';
import { createUserSession, revokeSessionById } from '../db/sessions.js';
import { requireAuth } from '../auth/middleware.js';

const router = Router();
const { frontendUrl } = config;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const isProd = config.nodeEnv === 'production';

router.get('/yandex', (req: Request, res) => {
  const state = (req.query.state as string) || '';
  const url = getYandexAuthUrl(state);
  res.redirect(url);
});

router.get('/yandex/callback', async (req: Request, res) => {
  const { code, error, error_description } = req.query;
  const errMsg = String(error_description || error || '');

  if (error) {
    return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(errMsg)}`);
  }

  if (!code || typeof code !== 'string') {
    return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent('No code received')}`);
  }

  try {
    const { access_token } = await exchangeCodeForToken(code);
    const profile = await getYandexUser(access_token);

    const dbUser = await upsertUser(profile);
    const session = await createUserSession(profile.id, SESSION_TTL_MS);

    const payload: JwtPayload = {
      id: profile.id,
      sid: session.id,
      login: profile.login,
      displayName: profile.display_name || profile.real_name || profile.login,
      email: profile.default_email ?? null,
      avatarId: profile.default_avatar_id ?? null,
      isPaid: Boolean(dbUser.is_paid),
      accessUntil: dbUser.access_until ?? null,
    };

    const token = signToken(payload);
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.redirect(`${frontendUrl}/table`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth failed';
    console.error('Yandex auth error:', message);
    res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(message)}`);
  }
});

router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      req.cookies?.token ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);
    if (token) {
      const payload = verifyToken(token);
      if (payload?.sid) {
        await revokeSessionById(payload.sid);
      }
    }
  } catch (err) {
    console.error('Logout error:', err);
  } finally {
    res.clearCookie('token', { path: '/' });
    res.json({ ok: true });
  }
});

router.get('/me', requireAuth, (req: Request, res) => {
  const payload = req.user!;
  res.json({
    user: {
      id: payload.id,
      email: payload.email,
      login: payload.login,
      displayName: payload.displayName,
      avatarId: payload.avatarId,
      isPaid: payload.isPaid,
      accessUntil: payload.accessUntil,
    },
  });
});

export default router;
