import { useLayoutEffect, useRef } from 'react';

/**
 * Switching saved lists sets `listLoading` and hides the main table/graph, which shrinks the page and
 * the browser jumps to the top. Save scroll when the selected list id changes (while content is still
 * tall) and restore after the load finishes.
 */
export function useKeepScrollOnListSwitch(currentListId: string | null, listLoading: boolean) {
  const pendingScrollY = useRef<number | null>(null);

  useLayoutEffect(() => {
    pendingScrollY.current = window.scrollY;
  }, [currentListId]);

  useLayoutEffect(() => {
    if (listLoading) return;
    const y = pendingScrollY.current;
    if (y == null) return;
    pendingScrollY.current = null;
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, y));
    });
  }, [listLoading]);
}
