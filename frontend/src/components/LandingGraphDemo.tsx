import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_SERIES_COLORS, chartSeriesStrokeDash } from '../utils/chartColors';
import { priceChartYDomain, Y_AXIS_TICK_COUNT, YAxisTickHideTopLabel } from '../utils/chartAxis';

const SERIES_LABELS = [
  'Сыр плавленный 200 г',
  'Кофе растворимый 95 г',
  'Напиток Coca-Cola 1 л',
  'Жевательная резинка 13,6 г',
  'Начос Takis 180 г',
] as const;

const CHART_DATES = [
  '2026-05-10',
  '2026-05-11',
  '2026-05-12',
  '2026-05-13',
  '2026-05-14',
  '2026-05-15',
  '2026-05-16',
  '2026-05-17',
  '2026-05-18',
  '2026-05-19',
  '2026-05-20',
  '2026-05-21',
  '2026-05-22',
  '2026-05-23',
  '2026-05-24',
  '2026-05-25',
  '2026-05-26',
  '2026-05-27',
] as const;

function buildChartRow(date: string, index: number) {
  return {
    date,
    p0: index < 9 ? 118 : index < 14 ? 132 : 149,
    p1: index < 6 ? 92 : index < 11 ? 78 : 88,
    p2: index < 4 ? 145 : index < 8 ? 145 : index < 13 ? 128 : 142,
    p3: index < 7 ? 56 : 49,
    p4: index < 5 ? 165 : index < 10 ? 152 : index < 15 ? 152 : 171,
  };
}

const CHART_DATA = CHART_DATES.map(buildChartRow);

export default function LandingGraphDemo() {
  const chartYDomain = useMemo(
    () => priceChartYDomain(CHART_DATA, SERIES_LABELS.length),
    []
  );

  return (
    <div className="landing-graph-demo" aria-label="Демонстрация графика цен">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={CHART_DATA} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--muted)" tick={{ fill: 'var(--muted)', fontSize: 10 }} />
            <YAxis
              stroke="var(--muted)"
              tick={YAxisTickHideTopLabel}
              domain={chartYDomain}
              tickCount={Y_AXIS_TICK_COUNT}
              interval={0}
            />
            <Tooltip active={false} cursor={false} />
            <Legend layout="horizontal" align="center" verticalAlign="bottom" height={36} />
            {SERIES_LABELS.map((label, i) => (
              <Line
                key={label}
                type="monotone"
                dataKey={`p${i}`}
                name={label}
                stroke={CHART_SERIES_COLORS[i]}
                strokeDasharray={chartSeriesStrokeDash(i)}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 1 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
    </div>
  );
}

function LandingArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8H12M12 8L8 4M12 8L8 12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LandingFormatsSidebar() {
  return (
    <aside className="landing-formats-sidebar">
      <div className="landing-monitor-card landing-formats-card landing-formats-card--row">
        <span className="landing-formats-card-icon">
          <LandingArrowIcon />
        </span>
        <p>Графики — быстрая визуализация трендов (для малого ассортимента)</p>
      </div>
      <div className="landing-monitor-card landing-formats-card landing-formats-card--row">
        <span className="landing-formats-card-icon">
          <LandingArrowIcon />
        </span>
        <p>Таблицы — детальный анализ больших массивов данных</p>
      </div>
      <div className="landing-monitor-card landing-formats-card landing-formats-card--list">
        <ul className="landing-formats-list">
          <li>
            <span className="landing-formats-list-icon" aria-hidden="true">
              →
            </span>
            <span>Данные из публичных источников</span>
          </li>
          <li>
            <span className="landing-formats-list-icon" aria-hidden="true">
              →
            </span>
            <span>Текущие и исторические изменения</span>
          </li>
          <li>
            <span className="landing-formats-list-icon" aria-hidden="true">
              →
            </span>
            <span>Учет прошедших и действующих промо-акций</span>
          </li>
        </ul>
      </div>
    </aside>
  );
}
