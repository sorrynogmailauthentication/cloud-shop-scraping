export interface JwtPayload {
  id: string;
  login: string;
  displayName: string;
  email: string | null;
  avatarId: string | null;
  iat?: number;
  exp?: number;
}

export interface YandexTokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface YandexUserInfo {
  id: string;
  login: string;
  client_id?: string;
  psuid?: string;
  display_name?: string;
  real_name?: string;
  default_email?: string;
  default_avatar_id?: string;
}
