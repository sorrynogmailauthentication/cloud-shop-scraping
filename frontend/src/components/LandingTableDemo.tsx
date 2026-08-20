import { useState } from 'react';
import { DateRangeSlicerPanel } from './DateRangeSlicerPanel';
import { TABLE_DATE_ANCHOR_YMD, formatYmdDisplay, timelineIdxToYmd } from '../utils/priceHistory';

type DemoRow = {
  product: string;
  shop: string;
  category: string;
  priceStart: string;
  priceEnd: string;
  deltaPrice: string;
  deltaPct: string;
  deltaPriceDir: 'up' | 'down' | 'neutral';
  deltaPctDir: 'up' | 'down' | 'neutral';
  beforeDiscount: string;
  discountPct: string;
};

const DEMO_ROWS: DemoRow[] = [
  {
    product: 'Начос Takis Extreme 180 г',
    shop: 'Лента',
    category: 'Сухарики, снеки, чипсы',
    priceStart: '169.99',
    priceEnd: '159.49',
    deltaPrice: '-15.00',
    deltaPct: '+4.5%',
    deltaPriceDir: 'up',
    deltaPctDir: 'down',
    beforeDiscount: '—',
    discountPct: '—',
  },
  {
    product: 'Сушеное манго с/м 100 г',
    shop: 'Ашан',
    category: 'Сухофрукты, орехи, семечки',
    priceStart: '119.99',
    priceEnd: '119.99',
    deltaPrice: '0.00',
    deltaPct: '0%',
    deltaPriceDir: 'neutral',
    deltaPctDir: 'neutral',
    beforeDiscount: '—',
    discountPct: '—',
  },
  {
    product: 'Напиток Coca-Cola 1 л',
    shop: 'Лента',
    category: 'Газированные напитки',
    priceStart: '149.99',
    priceEnd: '142.99',
    deltaPrice: '+7.00',
    deltaPct: '-4.7%',
    deltaPriceDir: 'down',
    deltaPctDir: 'up',
    beforeDiscount: '—',
    discountPct: '—',
  },
  {
    product: 'Торт уп. 500 г в ассортименте',
    shop: 'Лента',
    category: 'Кондитерские изделия, торты',
    priceStart: '349.00',
    priceEnd: '349.00',
    deltaPrice: '0.00',
    deltaPct: '0%',
    deltaPriceDir: 'neutral',
    deltaPctDir: 'neutral',
    beforeDiscount: '—',
    discountPct: '—',
  },
  {
    product: 'Сыр плавленный Hochland 200 г',
    shop: 'Ашан',
    category: 'Сыры',
    priceStart: '219.00',
    priceEnd: '194.00',
    deltaPrice: '+25.00',
    deltaPct: '-11.4%',
    deltaPriceDir: 'down',
    deltaPctDir: 'up',
    beforeDiscount: '249.00',
    discountPct: '12%',
  },
  {
    product: 'Кофе растворимый Jacobs 95 г',
    shop: 'Ашан',
    category: 'Кофе, какао',
    priceStart: '499.00',
    priceEnd: '499.00',
    deltaPrice: '0.00',
    deltaPct: '0%',
    deltaPriceDir: 'neutral',
    deltaPctDir: 'neutral',
    beforeDiscount: '—',
    discountPct: '—',
  },
  {
    product: 'Жевательная резинка Orbit 13,6 г',
    shop: 'Лента',
    category: 'Жевательная резинка',
    priceStart: '59.99',
    priceEnd: '54.99',
    deltaPrice: '+1.00',
    deltaPct: '-8.3%',
    deltaPriceDir: 'down',
    deltaPctDir: 'up',
    beforeDiscount: '—',
    discountPct: '—',
  },
];

function deltaClass(dir: DemoRow['deltaPriceDir'], kind: 'price' | 'pct'): string {
  const base = kind === 'pct' ? 'table-delta table-col-pct' : 'table-delta table-col-num';
  if (dir === 'up') return `${base} table-delta--up`;
  if (dir === 'down') return `${base} table-delta--down`;
  return base;
}

export default function LandingTableDemo() {
  const timelineMax = 60;
  const [dateRange, setDateRange] = useState({ start: 0, end: timelineMax });
  const fromYmd = timelineIdxToYmd(TABLE_DATE_ANCHOR_YMD, dateRange.start);
  const toYmd = timelineIdxToYmd(TABLE_DATE_ANCHOR_YMD, dateRange.end);

  return (
    <div className="landing-table-demo" aria-label="Демонстрация таблицы с периодом дат">
      <DateRangeSlicerPanel
        anchorYmd={TABLE_DATE_ANCHOR_YMD}
        timelineMax={timelineMax}
        dateRange={dateRange}
        setDateRange={setDateRange}
        fromYmd={fromYmd}
        toYmd={toYmd}
        fromDateLabel={formatYmdDisplay(fromYmd)}
        toDateLabel={formatYmdDisplay(toYmd)}
      />
      <div className="table-wrap table-full-width landing-table-demo-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="table-col-shop">Магазин</th>
              <th className="table-col-category">Категория</th>
              <th className="table-col-num">
                <abbr title="Цена на начало периода">
                  Цена,
                  <br />
                  начало
                </abbr>
              </th>
              <th className="table-col-num">
                <abbr title="Цена на конец периода">Цена, конец</abbr>
              </th>
              <th className="table-col-num">
                <abbr title="Изменение цены">Δ цена</abbr>
              </th>
              <th className="table-col-pct">
                <abbr title="Процентное изменение">Δ %</abbr>
              </th>
              <th className="table-col-num landing-table-demo-col-discount">До скидки</th>
              <th className="table-col-pct landing-table-demo-col-discount">Скидка %</th>
              <th className="sort-th--narrow" aria-label="Удалить" />
            </tr>
          </thead>
          <tbody>
            {DEMO_ROWS.map((row) => (
              <tr key={row.product}>
                <td className="table-col-product" title={row.product}>
                  {row.product}
                </td>
                <td className="cell-wrap table-col-shop">{row.shop}</td>
                <td className="cell-wrap table-col-category">{row.category}</td>
                <td className="table-col-num">{row.priceStart}</td>
                <td className="table-col-num">{row.priceEnd}</td>
                <td className={deltaClass(row.deltaPriceDir, 'price')}>{row.deltaPrice}</td>
                <td className={deltaClass(row.deltaPctDir, 'pct')}>{row.deltaPct}</td>
                <td className="table-col-num landing-table-demo-col-discount">{row.beforeDiscount}</td>
                <td className="table-col-pct landing-table-demo-col-discount">{row.discountPct}</td>
                <td>
                  <button type="button" className="btn-remove" tabIndex={-1} aria-hidden>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
