/**
 * High-contrast series colors for dark UI (saturated, well-separated hues).
 * Cycles with `% length` when there are many series.
 */
export const CHART_SERIES_COLORS = [
  '#FFB300',
  '#2979FF',
  '#00E676',
  '#FF4081',
  '#FF6D00',
  '#00E5FF',
  '#E040FB',
  '#FF1744',
  '#C6FF00',
  '#448AFF',
  '#FFEA00',
  '#651FFF',
  '#1DE9B6',
  '#FF9100',
  '#F50057',
  '#40C4FF',
  '#76FF03',
  '#D500F9',
  '#FF5252',
  '#18FFFF',
  '#EEFF41',
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
];

/**
 * SVG stroke-dasharray patterns (cycles with series index).
 * Mix of solid, dashed, tight dots, and spaced “morse” patterns for overlap readability.
 */
export const CHART_LINE_STROKE_PATTERNS: (string | undefined)[] = [
  undefined,
  '6 5',
  '2 4',
  '10 4',
  '1 5',
  '8 4 2 4',
  '4 3',
  '12 6',
  '2 3 8 3',
  '1 2 1 6',
  '14 4 4 4',
  '3 3',
  '6 2 2 2',
];

export function chartSeriesStrokeDash(index: number): string | undefined {
  return CHART_LINE_STROKE_PATTERNS[index % CHART_LINE_STROKE_PATTERNS.length];
}
