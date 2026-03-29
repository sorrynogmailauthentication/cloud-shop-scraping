import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListWithItems, UserList, UserListItem, UserListKind } from '../types/dashboard';
import type { ProductWithPrice } from '../types/dashboard';
import {
  fetchMyLists,
  fetchListWithItems,
  createList,
  deleteListApi,
  addProductToList,
  clearListItems,
} from '../api/dashboard';

export function rowFromSearchProduct(p: ProductWithPrice, listId: string, seq: number): UserListItem {
  return {
    id: -(Date.now() + seq),
    list_id: listId,
    product_url: p.url,
    position: seq,
    created_at: new Date().toISOString(),
    product: p,
  };
}

export type UserListEditorOptions = {
  /** Table page vs graph page — separate saved lists in the API. */
  listKind: UserListKind;
};

export function useUserListEditor(token: string | null, options: UserListEditorOptions) {
  const { listKind } = options;
  const defaultListName = listKind === 'graph' ? 'My graph' : 'My table';

  const [lists, setLists] = useState<UserList[]>([]);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [listWithItems, setListWithItems] = useState<ListWithItems | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState<UserListItem[] | null>(null);
  const [saveTableName, setSaveTableName] = useState('');
  const [tableToolsBusy, setTableToolsBusy] = useState(false);
  const saveNameSyncedForListIdRef = useRef<string | null>(null);

  const loadLists = useCallback(async () => {
    if (!token) return;
    try {
      let { lists: L } = await fetchMyLists(token, listKind);
      if (L.length === 0) {
        try {
          const { list } = await createList(token, defaultListName, null, listKind);
          L = [list];
        } catch {
          const { lists: again } = await fetchMyLists(token, listKind);
          L = again;
        }
      }
      setLists(L);
      setCurrentListId((prev) => {
        if (L.length === 0) return null;
        if (prev && L.some((l) => l.id === prev)) return prev;
        return L[0].id;
      });
    } catch {
      setLists([]);
      setCurrentListId(null);
    }
  }, [token, listKind, defaultListName]);

  const loadListWithItems = useCallback(
    async (options?: { silent?: boolean; forListId?: string | null }) => {
      const id = options?.forListId !== undefined ? options.forListId : currentListId;
      if (!token || !id) {
        if (options?.forListId === undefined) setListWithItems(null);
        return;
      }
      const silent = options?.silent ?? false;
      if (!silent) setListLoading(true);
      try {
        const { list } = await fetchListWithItems(token, id);
        setListWithItems(list);
      } catch {
        if (options?.forListId === undefined) setListWithItems(null);
      } finally {
        if (!silent) setListLoading(false);
      }
    },
    [token, currentListId]
  );

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    loadListWithItems();
  }, [loadListWithItems]);

  useEffect(() => {
    setPendingItems(null);
  }, [currentListId]);

  useEffect(() => {
    if (!listWithItems || listWithItems.id !== currentListId) return;
    if (saveNameSyncedForListIdRef.current === listWithItems.id) return;
    saveNameSyncedForListIdRef.current = listWithItems.id;
    setSaveTableName(listWithItems.name);
  }, [currentListId, listWithItems]);

  const displayItems = useMemo(
    () => pendingItems ?? listWithItems?.items ?? [],
    [pendingItems, listWithItems?.items]
  );

  const inListUrls = useMemo(
    () => new Set(displayItems.map((i) => i.product_url)),
    [displayItems]
  );

  const addOneToList = (product: ProductWithPrice) => {
    if (!currentListId) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    if (base.some((i) => i.product_url === product.url)) return;
    setPendingItems([...base, rowFromSearchProduct(product, currentListId, base.length)]);
  };

  const handleAddAllFromSearch = (products: ProductWithPrice[]) => {
    if (!currentListId) return;
    const base = pendingItems ?? listWithItems?.items ?? [];
    const existing = new Set(base.map((i) => i.product_url));
    let next = [...base];
    let seq = next.length;
    for (const p of products) {
      if (existing.has(p.url)) continue;
      existing.add(p.url);
      next.push(rowFromSearchProduct(p, currentListId, seq));
      seq += 1;
    }
    setPendingItems(next);
  };

  const handleSaveTableCopy = async () => {
    const name = saveTableName.trim();
    if (!token || !name) return;
    const nameKey = name.toLowerCase();
    const existing = lists.find((l) => l.name.trim().toLowerCase() === nameKey);

    setTableToolsBusy(true);
    try {
      if (currentListId && pendingItems !== null) {
        await clearListItems(token, currentListId);
        for (const url of pendingItems.map((i) => i.product_url)) {
          try {
            await addProductToList(token, currentListId, url);
          } catch {
            /* skip */
          }
        }
        setPendingItems(null);
        await loadListWithItems({ silent: true, forListId: currentListId });
      }

      let urls: string[] = [];
      if (currentListId) {
        const { list: source } = await fetchListWithItems(token, currentListId);
        urls = source.items.map((i) => i.product_url);
      }

      if (existing) {
        await clearListItems(token, existing.id);
        for (const url of urls) {
          try {
            await addProductToList(token, existing.id, url);
          } catch {
            /* skip */
          }
        }
        setCurrentListId(existing.id);
        const { lists: L } = await fetchMyLists(token, listKind);
        setLists(L);
      } else {
        const { list: created } = await createList(token, name, null, listKind);
        for (const url of urls) {
          try {
            await addProductToList(token, created.id, url);
          } catch {
            /* skip */
          }
        }
        setCurrentListId(created.id);
        const { lists: L } = await fetchMyLists(token, listKind);
        setLists(L);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setTableToolsBusy(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!token || !currentListId) return;
    const label = lists.find((l) => l.id === currentListId)?.name ?? 'this list';
    if (!window.confirm(`Delete “${label}”?`)) return;
    setTableToolsBusy(true);
    setPendingItems(null);
    try {
      const id = currentListId;
      await deleteListApi(token, id);
      let { lists: L } = await fetchMyLists(token, listKind);
      if (L.length === 0) {
        try {
          const { list } = await createList(token, defaultListName, null, listKind);
          L = [list];
        } catch {
          const { lists: again } = await fetchMyLists(token, listKind);
          L = again;
        }
      }
      setLists(L);
      setCurrentListId((prev) => (prev === id ? L[0]?.id ?? null : prev));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setTableToolsBusy(false);
    }
  };

  const handleClearTable = () => {
    if (!currentListId) return;
    setPendingItems([]);
  };

  return {
    lists,
    currentListId,
    setCurrentListId,
    listWithItems,
    listLoading,
    pendingItems,
    setPendingItems,
    displayItems,
    inListUrls,
    saveTableName,
    setSaveTableName,
    tableToolsBusy,
    loadListWithItems,
    loadLists,
    handleSaveTableCopy,
    handleDeleteTable,
    handleClearTable,
    addOneToList,
    handleAddAllFromSearch,
  };
}
