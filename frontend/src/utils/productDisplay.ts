/**
 * Product display name used across chart labels and UI blocks.
 *
 * IMPORTANT: we intentionally do NOT truncate here. Truncation makes it hard
 * to read full product titles, and the UI already provides `title` tooltips.
 */

export function obscureProductDisplayName(
  productName: string | null | undefined,
  fallbackUrl: string
): string {
  const s = ((productName ?? '').trim() || fallbackUrl).trim();
  return s;
}
