CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- ============================================================
-- Users (Yandex OAuth)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,              -- Yandex user id
  email VARCHAR(255),
  login VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  avatar_id VARCHAR(255),
  is_paid SMALLINT NOT NULL DEFAULT 0,
  access_until VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);

-- Products: one row per product (url is the unique identifier)
CREATE TABLE IF NOT EXISTS products (
    product_id UUID PRIMARY KEY,
    url TEXT NOT NULL,
    product_name TEXT,
    shop TEXT NOT NULL,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    article TEXT
);

-- If article is present, treat (shop, article) as the canonical identity.
-- This prevents duplicates even if `url` changes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_shop_article
    ON products(shop, article)
    WHERE article IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_url ON products(url);

-- Prices: one row per product per day (no row = product not seen that day)
CREATE TABLE IF NOT EXISTS prices (
    id SERIAL PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    price NUMERIC(12, 2),
    discount TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, date)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prices_product_id ON prices(product_id);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);


-- ============================================================
-- User lists (custom tables per user – persisted)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'table',  -- table | graph
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_lists_user_id ON user_lists(user_id);

-- Optional: unique list name per user (matches app init in db/index.ts)
CREATE UNIQUE INDEX IF NOT EXISTS user_lists_user_kind_name_lower
  ON user_lists (user_id, kind, (LOWER(TRIM(name))));

-- ============================================================
-- Items in a user list (product_id → products)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_list_items (
  id SERIAL PRIMARY KEY,
  list_id UUID NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(list_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_list_items_list_id ON user_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_user_list_items_product_id ON user_list_items(product_id);

-- ============================================================
-- Dashboard configs (layout/widgets per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  layout JSONB NOT NULL DEFAULT '{"widgets":[]}',
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_configs_user_default
  ON dashboard_configs(user_id) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_dashboard_configs_user_id ON dashboard_configs(user_id);