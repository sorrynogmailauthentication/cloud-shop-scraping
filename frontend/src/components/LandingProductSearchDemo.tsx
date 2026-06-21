const DEMO_RESULTS = [
  {
    name: 'Яйцо «Kinder» сюрприз Maxi в ассортименте, 100 г',
    shop: 'Дикси',
    category: 'Кондитерские изделия, торты',
    price: '149.90',
    was: '169.80',
    pct: '-12%',
  },
  {
    name: 'Яйцо куриное С0 Пятёрочка, 10 шт',
    shop: 'Пятёрочка',
    category: 'Яйцо',
    price: '119.60',
  },
  {
    name: 'Яйцо куриное С0 Белое, 10 шт',
    shop: 'Перекрёсток',
    category: 'Яйцо',
    price: '119.99',
  },
  {
    name: 'Яйцо куриное С1, 10 шт',
    shop: 'Дикси',
    category: 'Яйцо',
    price: '109.99',
  },
  {
    name: 'Яйцо куриное С0 10 шт',
    shop: 'Ашан',
    category: 'Яйцо',
    price: '119.00',
    was: '125.00',
    pct: '-5%',
  },
] as const;

export default function LandingProductSearchDemo() {
  return (
    <div className="landing-search-demo" aria-label="Демонстрация поиска товаров">
      <section className="search-panel search-panel-open">
        <button type="button" className="search-panel-toggle" tabIndex={-1} aria-expanded>
          ▼ Скрыть поиск
        </button>
        <div className="search-panel-inner">
          <div className="search-form">
            <div className="search-field-with-clear search-field-with-clear--name">
              <input
                type="text"
                className="search-input search-input-name"
                defaultValue="яйцо"
                readOnly
                tabIndex={-1}
                aria-readonly
              />
              <button type="button" className="search-field-clear" tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--shop">
              <div className="search-dropdown-wrap search-dropdown-wrap--shop">
                <button type="button" className="search-dropdown-trigger" tabIndex={-1}>
                  3 магаз.
                </button>
              </div>
              <button type="button" className="search-field-clear" tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--categories">
              <div className="search-dropdown-wrap search-dropdown-wrap--categories">
                <button type="button" className="search-dropdown-trigger search-dropdown-trigger--categories" tabIndex={-1}>
                  Все категории
                </button>
              </div>
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--url">
              <input
                type="text"
                className="search-input search-input-url"
                placeholder="Ссылка (часть)"
                readOnly
                tabIndex={-1}
                aria-readonly
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <button type="button" className="btn-primary btn-search" tabIndex={-1}>
              <span className="btn-search-inner">
                <span className="btn-search-label">Поиск</span>
              </span>
            </button>
          </div>

          <div className="search-filter-block">
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                type="text"
                className="search-input search-filter-text"
                placeholder="Название содержит (1)"
                readOnly
                tabIndex={-1}
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                type="text"
                className="search-input search-filter-text"
                placeholder="Название содержит (2)"
                readOnly
                tabIndex={-1}
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                type="text"
                className="search-input search-filter-text"
                placeholder="Название содержит (3)"
                readOnly
                tabIndex={-1}
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-text">
              <input
                type="text"
                className="search-input search-filter-text"
                placeholder="Название не содержит (1)"
                readOnly
                tabIndex={-1}
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-num">
              <input
                type="number"
                className="search-input search-input-num"
                placeholder="Цена от (мин.)"
                readOnly
                tabIndex={-1}
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
            <div className="search-field-with-clear search-field-with-clear--filter-num">
              <input
                type="number"
                className="search-input search-input-num"
                placeholder="Цена до (макс.)"
                readOnly
                tabIndex={-1}
              />
              <button type="button" className="search-field-clear" disabled tabIndex={-1} aria-hidden>
                ✕
              </button>
            </div>
          </div>

          <div className="search-selection-wrap">
            <div className="search-actions search-actions--row">
              <button type="button" className="btn-search-select-all" tabIndex={-1}>
                Выбрать всё
              </button>
              <button type="button" className="btn-add-all" tabIndex={-1}>
                Добавить выбранные в таблицу
              </button>
            </div>
            <div className="search-results-height-selector" role="group" aria-label="Сколько строк списка показывать">
              <span className="search-results-height-selector-label">Строк:</span>
              <div className="search-results-height-selector-btns">
                <button type="button" className="search-results-height-btn" tabIndex={-1}>
                  5
                </button>
                <button type="button" className="search-results-height-btn is-active" tabIndex={-1}>
                  10
                </button>
              </div>
            </div>
            <div className="search-results-stack">
              <div className="search-results search-results--selectable search-results--cap-5">
                {DEMO_RESULTS.map((row) => (
                  <div key={row.name} className="search-result-row search-result-row--table">
                    <span className="result-name">{row.name}</span>
                    <div className="result-shop-stack">
                      <span className="result-shop-main">{row.shop}</span>
                      <span className="result-shop-category">{row.category}</span>
                    </div>
                    <div className="result-price-stack">
                      <span className="result-price-main">{row.price}</span>
                      {(row.was || row.pct) && (
                        <span className="result-price-sub">
                          {row.was && <span className="result-price-was">{row.was}</span>}
                          {row.pct && <span className="result-price-pct">{row.was ? ' ' : ''}({row.pct})</span>}
                        </span>
                      )}
                    </div>
                    <button type="button" className="btn-add-one" tabIndex={-1}>
                      + Добавить
                    </button>
                  </div>
                ))}
              </div>
              <div className="search-results-stack-footer">
                <div className="search-result-load-more-slot" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
