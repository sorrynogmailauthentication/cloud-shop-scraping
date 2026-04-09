import { useLayoutEffect, useRef } from 'react';

const FALLBACK_MIN_PX = 320;

/**
 * While `listLoading` is true, the table/graph block would otherwise unmount and shrink the page,
 * which moves the window scroll. Track the last measured height of the main data block (when not
 * loading) and apply it as min-height on the loading placeholder so only that region changes.
 */
export function useListMainPreservedHeight(listLoading: boolean) {
  const mainBlockRef = useRef<HTMLDivElement>(null);
  const lastContentHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = mainBlockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!listLoading) {
        const h = el.offsetHeight;
        if (h > 0) lastContentHeightRef.current = h;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [listLoading]);

  const loadingMinHeightPx = listLoading
    ? lastContentHeightRef.current ?? FALLBACK_MIN_PX
    : undefined;

  return { mainBlockRef, loadingMinHeightPx };
}
