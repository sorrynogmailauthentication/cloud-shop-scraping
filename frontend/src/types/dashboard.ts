export interface ProductWithPrice {
  url: string;
  product_name: string | null;
  shop: string | null;
  category: string | null;
  article: string | null;
  price: number | null;
  price_before_discount: number | null;
  discount_pct: number | null;
}

export interface PricePoint {
  date: string;
  price: number | null;
  price_before_discount: number | null;
  discount_pct: number | null;
}

/** Whether the list is used on the Table page or Graph page (independent saves per user). */
export type UserListKind = 'table' | 'graph';

export interface UserList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  kind: UserListKind;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserListItem {
  id: number;
  list_id: string;
  /** Set when loaded from API; omitted on optimistic rows from search. */
  product_id?: string;
  product_url: string;
  position: number;
  created_at: string;
  product?: ProductWithPrice;
}

export interface ListWithItems extends UserList {
  items: UserListItem[];
}
