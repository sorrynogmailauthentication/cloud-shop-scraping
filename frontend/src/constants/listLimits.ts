import type { UserListKind } from '../types/dashboard';

export const TABLE_LIST_MAX_ITEMS = 120;
export const GRAPH_LIST_MAX_ITEMS = 30;

export function listMaxItemsForKind(kind: UserListKind): number {
  return kind === 'graph' ? GRAPH_LIST_MAX_ITEMS : TABLE_LIST_MAX_ITEMS;
}
