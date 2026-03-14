export interface User {
  id: string;
  login: string;
  displayName: string;
  email: string | null;
  avatarId: string | null;
}

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  token: string | null;
  loginWithYandex: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
