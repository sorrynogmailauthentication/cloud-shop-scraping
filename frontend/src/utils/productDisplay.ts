/** Max visible length for product titles; extra characters are omitted (…). */
export const PRODUCT_DISPLAY_NAME_MAX = 50;

export function obscureProductDisplayName(
  productName: string | null | undefined,
  fallbackUrl: string
): string {
  const s = ((productName ?? '').trim() || fallbackUrl).trim();
  if (s.length <= PRODUCT_DISPLAY_NAME_MAX) return s;
  return s.slice(0, PRODUCT_DISPLAY_NAME_MAX) + '…';
}
