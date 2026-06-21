import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isDashboard = location.pathname === '/table' || location.pathname === '/graph';
  const scrollByPath = useRef<Record<string, number>>({});

  useLayoutEffect(() => {
    const y = scrollByPath.current[location.pathname];
    if (y != null) window.scrollTo(0, y);
  }, [location.pathname]);

  useEffect(() => {
    const path = location.pathname;
    const onScroll = () => {
      scrollByPath.current[path] = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollByPath.current[path] = window.scrollY;
      window.removeEventListener('scroll', onScroll);
    };
  }, [location.pathname]);

  const hasAccess =
    user?.isPaid &&
    (!user.accessUntil || user.accessUntil >= todayStr());

  const subscriptionLabel = hasAccess
    ? !user?.accessUntil
      ? 'Подписка без ограничений'
      : `Подписка до ${user.accessUntil}`
    : null;

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <span className="logo"><NavLink to="/landing" className="logo-link">Ценалитика</NavLink></span>
          <nav className="header-nav">
            <NavLink to="/table" className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')} end>
              Таблица
            </NavLink>
            <NavLink to="/graph" className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}>
              График
            </NavLink>
          </nav>
          <div className="header-user">
            {subscriptionLabel && (
              <span className="subscription-badge">{subscriptionLabel}</span>
            )}
            <span className="user-name">{user?.displayName || user?.login}</span>
            <button type="button" className="btn-logout" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      </header>
      <div className={`content ${isDashboard ? 'content--wide' : ''}`}>
        <Outlet />
      </div>
    </div>
  );
}
