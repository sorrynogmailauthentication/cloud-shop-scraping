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
import { useAppDialog } from '../context/AppDialogContext';

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
  const { showAlert, showConfirm } = useAppDialog();
  const { listKind } = options;
  const defaultListName = listKind === 'graph' ? 'график 1' : 'таблица 1';
  const selectedListStorageKey = `list-editor:selected-list:${listKind}`;

  const [lists, setLists] = useState<UserList[]>([]);
  const [currentListId, setCurrentListId] = useState<string | null>(null);
  const [listWithItems, setListWithItems] = useState<ListWithItems | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState<UserListItem[] | null>(null);
  const [saveTableName, setSaveTableName] = useState('');
  const [tableToolsBusy, setTableToolsBusy] = useState(false);
  const saveNameSyncedForListIdRef = useRef<string | null>(null);
  const pendingHydratedKeyRef = useRef<string | null>(null);
  const pendingStorageKey = useMemo(
    () => (currentListId ? `list-editor:pending:${listKind}:${currentListId}` : null),
    [listKind, currentListId]
  );

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
        if (typeof window !== 'undefined') {
          try {
            const stored = window.localStorage.getItem(selectedListStorageKey);
            if (stored && L.some((l) => l.id === stored)) return stored;
          } catch {
            // Ignore storage failures.
          }
        }
        if (prev && L.some((l) => l.id === prev)) return prev;
        return L[0].id;
      });
    } catch {
      setLists([]);
      setCurrentListId(null);
    }
  }, [token, listKind, defaultListName, selectedListStorageKey]);

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
    if (!currentListId) return;
    try {
      window.localStorage.setItem(selectedListStorageKey, currentListId);
    } catch {
      // Ignore storage failures.
    }
  }, [currentListId, selectedListStorageKey]);

  useEffect(() => {
    if (!pendingStorageKey) {
      pendingHydratedKeyRef.current = null;
      setPendingItems(null);
      return;
    }
    if (typeof window === 'undefined') {
      pendingHydratedKeyRef.current = pendingStorageKey;
      setPendingItems(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(pendingStorageKey);
      if (!raw) {
        setPendingItems(null);
      } else {
        const parsed = JSON.parse(raw) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.every((row) => row && typeof row === 'object' && typeof (row as UserListItem).product_url === 'string')
        ) {
          setPendingItems(parsed as UserListItem[]);
        } else {
          setPendingItems(null);
        }
      }
    } catch {
      setPendingItems(null);
    } finally {
      pendingHydratedKeyRef.current = pendingStorageKey;
    }
  }, [pendingStorageKey]);

  useEffect(() => {
    if (!pendingStorageKey) return;
    if (pendingHydratedKeyRef.current !== pendingStorageKey) return;
    if (typeof window === 'undefined') return;
    try {
      if (pendingItems === null) {
        window.localStorage.removeItem(pendingStorageKey);
      } else {
        window.localStorage.setItem(pendingStorageKey, JSON.stringify(pendingItems));
      }
    } catch {
      // Ignore storage failures.
    }
  }, [pendingStorageKey, pendingItems]);

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
      /** Save edits only onto the list that is already selected (same name in the field). */
      const inPlaceSave =
        pendingItems !== null &&
        currentListId != null &&
        existing != null &&
        existing.id === currentListId;

      if (inPlaceSave) {
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
        const { lists: L } = await fetchMyLists(token, listKind);
        setLists(L);
        return;
      }

      let urls: string[] = [];
      if (pendingItems !== null) {
        urls = pendingItems.map((i) => i.product_url);
      } else if (currentListId) {
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
        setPendingItems(null);
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
        setPendingItems(null);
        setCurrentListId(created.id);
        const { lists: L } = await fetchMyLists(token, listKind);
        setLists(L);
      }
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Не удалось сохранить', { title: 'Не удалось сохранить' });
    } finally {
      setTableToolsBusy(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!token || !currentListId) return;
    const label = lists.find((l) => l.id === currentListId)?.name ?? 'этот список';
    if (
      !(await showConfirm(`Удалить «${label}»?`, {
        title: 'Удалить список',
        confirmLabel: 'Удалить',
        cancelLabel: 'Отмена',
        destructive: true,
      }))
    )
      return;
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
      await showAlert(e instanceof Error ? e.message : 'Не удалось удалить', { title: 'Не удалось удалить' });
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
