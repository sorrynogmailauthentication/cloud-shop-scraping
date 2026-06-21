import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LandingProductSearchDemo from '../components/LandingProductSearchDemo';
import LandingTableDemo from '../components/LandingTableDemo';
import LandingGraphDemo, { LandingFormatsSidebar } from '../components/LandingGraphDemo';

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <span className="logo">Ценалитика</span>
          {!loading &&
            (user ? (
              <Link to="/table" className="landing-btn landing-btn-primary">
                Открыть таблицу
              </Link>
            ) : (
              <Link to="/login" className="landing-btn landing-btn-primary">
                Войти
              </Link>
            ))}
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero-card">
          <div className="landing-hero-visual" aria-hidden="true">
            <img className="landing-hero-image" src="/landing-hero.png" alt="" />
          </div>
          <div className="landing-hero-content-container">
          <div className="landing-hero-content">
            <div className="landing-hero-title-box">
              <h1>Ценалитика</h1>
              <p>Безлимитный анализ продовольственного ритейла</p>
            </div>

            <div className="landing-hero-arrow-bar" aria-hidden="true">
              <span className="landing-hero-arrow-line" />
              <span className="landing-hero-arrow-head" />
            </div>

            <div className="landing-hero-actions">
              {user ? (
                <Link to="/table" className="landing-btn landing-btn-primary landing-btn-lg">
                  Перейти к таблице
                </Link>
              ) : (
                <Link to="/login" className="landing-btn landing-btn-primary landing-btn-lg">
                  Начать работу
                </Link>
              )}
              <a href="#features" className="landing-btn landing-btn-ghost landing-btn-lg">
                Подробнее
              </a>
            </div>
          </div></div>

          <a href="#features" className="landing-hero-corner-btn" aria-label="Подробнее">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M14 14L4 4M4 4H12M4 4V12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </section>

        <section className="landing-monitor-section" id="features">
          <div className="landing-monitor-head">
            <h2 className="landing-monitor-title">
              Современный бизнес требует{' '}
              <span className="landing-monitor-title-accent">регулярного мониторинга</span>{' '}
              конкурентной среды
            </h2>
            <a href="#integration" className="landing-monitor-corner-btn" aria-label="Следующий раздел">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M14 14L4 4M4 4H12M4 4V12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>

          <div className="landing-monitor-cards">
            <div className="landing-monitor-card">
              <p>
                «Ценалитика» — мощный аналитический инструмент, предоставляющий безлимитный анализ
                продовольственного ритейла.
              </p>
            </div>
            <div className="landing-monitor-card">
              <p>
                Обрабатывает данные по более чем 70&nbsp;000 товарным позициям 6 крупнейших торговых сетей.
              </p>
            </div>
          </div>

          <div className="landing-monitor-table-wrap">
            <span className="landing-monitor-table-label">Таблица</span>
            <div className="landing-monitor-table-inner">
              <LandingProductSearchDemo />
            </div>
          </div>
        </section>

        <section className="landing-integration-section" id="integration">
          <div className="landing-monitor-head">
            <h2 className="landing-monitor-title">
              <span className="landing-monitor-title-accent">Легко</span> интегрируется в бизнес процессы
            </h2>
            <a href="#formats" className="landing-monitor-corner-btn" aria-label="Следующий раздел">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M14 14L4 4M4 4H12M4 4V12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>

          <div className="landing-monitor-cards landing-monitor-cards--quad">
            <div className="landing-monitor-card landing-monitor-card--compact">
              <p>Мгновенная выгрузка</p>
            </div>
            <div className="landing-monitor-card landing-monitor-card--compact">
              <p>Форматы: Excel, PowerPoint</p>
            </div>
            <div className="landing-monitor-card landing-monitor-card--compact">
              <p>Нет ограничений на объем запросов</p>
            </div>
            <div className="landing-monitor-card landing-monitor-card--compact">
              <p>Нужен только Яндекс ID + действующая подписка</p>
            </div>
          </div>

          <div className="landing-monitor-table-wrap landing-monitor-table-wrap--plain">
            <div className="landing-monitor-table-inner">
              <LandingTableDemo />
            </div>
          </div>
        </section>

        <section className="landing-formats-section" id="formats">
          <div className="landing-monitor-head">
            <h2 className="landing-monitor-title landing-formats-title">
              Оптимизированные <span className="landing-monitor-title-accent">форматы</span>
            </h2>
            <a href="#start" className="landing-monitor-corner-btn" aria-label="Следующий раздел">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path
                  d="M14 14L4 4M4 4H12M4 4V12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>

          <div className="landing-formats-layout">
            <LandingFormatsSidebar />

            <div className="landing-formats-chart-wrap">
              <LandingGraphDemo />
            </div>
          </div>
        </section>

        <section className="landing-cta-card" id="start">
          <div className="landing-cta-card-inner">
            <div className="landing-hero-title-box landing-cta-title-box">
              <h2>Ценалитика</h2>
              <p>Начните анализ цен уже сегодня</p>
            </div>

            <div className="landing-hero-arrow-bar landing-cta-arrow-bar" aria-hidden="true">
              <span className="landing-hero-arrow-line" />
              <span className="landing-hero-arrow-head" />
            </div>

            <div className="landing-hero-actions">
              {!loading &&
                (user ? (
                  <Link to="/table" className="landing-btn landing-btn-primary landing-btn-lg">
                    Открыть таблицу
                  </Link>
                ) : (
                  <Link to="/login" className="landing-btn landing-btn-primary landing-btn-lg">
                    Войти через Яндекс
                  </Link>
                ))}
            </div>
          </div>

          {!loading &&
            (user ? (
              <Link to="/table" className="landing-hero-corner-btn" aria-label="Открыть таблицу">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 14L14 4M14 4H6M14 4V12"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ) : (
              <Link to="/login" className="landing-hero-corner-btn" aria-label="Войти">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 14L14 4M14 4H6M14 4V12"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ))}
        </section>
      </main>

      <footer className="landing-footer">
        <p>
          <a href={encodeURI('/Политика персональные данные.pdf')} target="_blank" rel="noopener noreferrer">
            Политика обработки персональных данных
          </a>
        </p>
      </footer>
    </div>
  );
}
