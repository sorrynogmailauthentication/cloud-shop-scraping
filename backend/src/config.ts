import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  yandex: {
    clientId: process.env.YANDEX_CLIENT_ID || '',
    clientSecret: process.env.YANDEX_CLIENT_SECRET || '',
    redirectUri: process.env.YANDEX_REDIRECT_URI || 'http://localhost:4000/auth/yandex/callback',
    authorizeUrl: 'https://oauth.yandex.com/authorize',
    tokenUrl: 'https://oauth.yandex.com/token',
    userInfoUrl: 'https://login.yandex.ru/info',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  db: {
    host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.DB_PORT) || 5432,
    database: process.env.PGDATABASE || process.env.DB_NAME || 'priceMonitor',
    user: process.env.PGUSER || process.env.DB_USER || '',
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
  },
  adminSecret: process.env.ADMIN_SECRET || '',
  adminLogin: process.env.ADMIN_LOGIN || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
} as const;
