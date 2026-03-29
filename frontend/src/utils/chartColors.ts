/**
 * First 10 series: solid lines, hues spread for maximum contrast on dark UI.
 */
export const CHART_SOLID_COLORS = [
  '#FFB300',
  '#2979FF',
  '#00E676',
  '#FF4081',
  '#FF6D00',
  '#00E5FF',
  '#E040FB',
  '#FF1744',
  '#EEFF41',
  '#651FFF',
] as const;

/** Extra hues for series 11+ (paired with dash patterns). */
const CHART_EXTENDED_COLORS = [
  '#448AFF',
  '#FFEA00',
  '#1DE9B6',
  '#FF9100',
  '#F50057',
  '#40C4FF',
  '#76FF03',
  '#D500F9',
  '#FF5252',
  '#18FFFF',
  '#7C4DFF',
  '#FF80AB',
  '#69F0AE',
  '#82B1FF',
  '#FFD600',
  '#EA80FC',
  '#A7FFEB',
  '#FF6E40',
  '#B388FF',
  '#84FFFF',
  '#FF9E80',
  '#C6FF00',
];

/**
 * Full palette (solid 10 first, then extended). Cycles with `% length` for stroke color.
 */
export const CHART_SERIES_COLORS = [...CHART_SOLID_COLORS, ...CHART_EXTENDED_COLORS];

/** First this many series use solid strokes; beyond that, dash patterns differentiate. */
export const GRAPH_SOLID_LINE_COUNT = CHART_SOLID_COLORS.length;

/** Dash length fixed; gap grows so first dashed line is tightest, then progressively more space. */
const DASHED_STROKE_LEN = 8;
const DASHED_GAP_MIN = 2;
const DASHED_GAP_MAX = 26;
const DASHED_GAP_STEPS = 13;

function strokeDasharrayForExtraSeries(k: number): string {
  const step = k % DASHED_GAP_STEPS;
  const t = DASHED_GAP_STEPS <= 1 ? 0 : step / (DASHED_GAP_STEPS - 1);
  const gap = Math.round(DASHED_GAP_MIN + t * (DASHED_GAP_MAX - DASHED_GAP_MIN));
  return `${DASHED_STROKE_LEN} ${gap}`;
}

export function chartSeriesStrokeDash(index: number): string | undefined {
  if (index < GRAPH_SOLID_LINE_COUNT) return undefined;
  const k = index - GRAPH_SOLID_LINE_COUNT;
  return strokeDasharrayForExtraSeries(k);
}
