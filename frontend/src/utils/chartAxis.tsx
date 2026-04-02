import type { ReactElement } from 'react';
import { Text } from 'recharts';
import type { YAxisTickContentProps } from 'recharts';

/** Recharts default is 5; 10 ≈ 2× denser numbered ticks on the Y axis. */
export const Y_AXIS_TICK_COUNT = 10;

/**
 * Y-axis domain for price line charts: floor at 0, ceiling 10% above the highest point.
 */
export function priceChartYDomain(
  rows: ReadonlyArray<Record<string, string | number | null | undefined>>,
  seriesCount: number
): [number, number] {
  let max = 0;
  for (const row of rows) {
    for (let i = 0; i < seriesCount; i++) {
      const v = row[`p${i}`];
      if (typeof v === 'number' && Number.isFinite(v)) max = Math.max(max, v);
    }
  }
  const high = max > 0 ? max * 1.1 : 1;
  return [0, high];
}

/** Hides the label on the topmost Y tick (domain max); keeps other ticks as default. */
export function YAxisTickHideTopLabel(props: YAxisTickContentProps): ReactElement | null {
  const { index, visibleTicksCount, tickFormatter, payload } = props;
  if (visibleTicksCount > 1 && index === visibleTicksCount - 1) return null;
  const text =
    typeof tickFormatter === 'function' ? tickFormatter(payload.value, index) : payload.value;
  return (
    <Text
      {...props}
      fill={props.fill ?? 'var(--muted)'}
      fontSize={11}
      className="recharts-cartesian-axis-tick-value"
    >
      {text}
    </Text>
  );
}
