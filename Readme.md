# Cloud Shop Dashboard

React (TypeScript) + Node.js Express (TypeScript) app with **Yandex ID** login and dashboards from DB (auth implemented first).

## Setup

### 1. Yandex OAuth app

1. Go to [Yandex OAuth](https://oauth.yandex.com/) and create an application.
2. Under **Platforms** → **Web services** add:
   - **Redirect URI:** `http://localhost:4000/auth/yandex/callback` (for local dev).
3. Copy the **ID** and **Secret** (Client secret).

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET, and optionally JWT_SECRET
npm install
npm run dev
```

Runs at `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173`. Vite proxies `/auth` and `/api` to the backend.

## Auth flow

1. User clicks “Sign in with Yandex” → redirect to backend `GET /auth/yandex` → Yandex OAuth.
2. Yandex redirects to `GET /auth/yandex/callback?code=...` on the backend.
3. Backend exchanges `code` for an access token, loads user from Yandex, issues a JWT, and redirects to frontend with `#token=...` in the URL.
4. Frontend stores the token (e.g. in `localStorage`) and uses it as `Authorization: Bearer <token>` for `/auth/me` and other API calls.

## Scripts

- **Backend:** `npm run dev` (watch mode), `npm start`
- **Frontend:** `npm run dev`, `npm run build`, `npm run preview`
