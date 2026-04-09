import { useLayoutEffect, useRef } from 'react';

const FALLBACK_MIN_PX = 320;

/**
 * While `listLoading` is true, the table/graph block would otherwise unmount and shrink the page,
 * which moves the window scroll. Track the last measured height of the main data block (when not
 * loading) and apply it as min-height on the loading placeholder so only that region changes.
 *
 * When `tableToolsBusy` (e.g. Save) turns on, snapshot height in the same frame so a subsequent
 * list reload still has a good min-height before the async work finishes.
 */
export function useListMainPreservedHeight(listLoading: boolean, tableToolsBusy = false) {
  const mainBlockRef = useRef<HTMLDivElement>(null);
  const lastContentHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!tableToolsBusy) return;
    const el = mainBlockRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    if (h > 0) lastContentHeightRef.current = h;
  }, [tableToolsBusy]);

  useLayoutEffect(() => {
    const el = mainBlockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!listLoading && !tableToolsBusy) {
        const h = el.offsetHeight;
        if (h > 0) lastContentHeightRef.current = h;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [listLoading, tableToolsBusy]);

  const loadingMinHeightPx = listLoading
    ? lastContentHeightRef.current ?? FALLBACK_MIN_PX
    : undefined;

  return { mainBlockRef, loadingMinHeightPx };
}
