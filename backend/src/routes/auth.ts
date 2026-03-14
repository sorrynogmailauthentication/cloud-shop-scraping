import { Router, type Request } from 'express';
import { getYandexAuthUrl, exchangeCodeForToken, getYandexUser } from '../auth/yandex.js';
import { signToken, verifyToken } from '../auth/jwt.js';
import { config } from '../config.js';
import type { JwtPayload } from '../types/auth.js';

const router = Router();
const { frontendUrl } = config;

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

    const payload: JwtPayload = {
      id: profile.id,
      login: profile.login,
      displayName: profile.display_name || profile.real_name || profile.login,
      email: profile.default_email ?? null,
      avatarId: profile.default_avatar_id ?? null,
    };

    const token = signToken(payload);
    res.redirect(`${frontendUrl}/#token=${encodeURIComponent(token)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auth failed';
    console.error('Yandex auth error:', message);
    res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(message)}`);
  }
});

router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

router.get('/me', (req: Request, res) => {
  const authHeader = req.headers.authorization;
  const token =
    req.cookies?.token ||
    (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null);
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  res.json({ user: payload });
});

export default router;
