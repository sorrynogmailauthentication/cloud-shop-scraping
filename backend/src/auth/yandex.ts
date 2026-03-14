import { config } from '../config.js';
import type { YandexTokenResponse, YandexUserInfo } from '../types/auth.js';

const { yandex: y } = config;

export function getYandexAuthUrl(state = ''): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: y.clientId,
    redirect_uri: y.redirectUri,
  });
  if (state) params.set('state', state);
  return `${y.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<YandexTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: y.clientId,
    client_secret: y.clientSecret,
  });
  const res = await fetch(y.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error_description?: string; error?: string };
    throw new Error(err.error_description || err.error || `Token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<YandexTokenResponse>;
}

export async function getYandexUser(accessToken: string): Promise<YandexUserInfo> {
  const res = await fetch(y.userInfoUrl, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`User info failed: ${res.status}`);
  }
  return res.json() as Promise<YandexUserInfo>;
}
