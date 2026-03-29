import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isDashboard = location.pathname === '/' || location.pathname === '/graph';
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
      ? 'Unlimited subscription'
      : `Subscription ends ${user.accessUntil}`
    : null;

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <span className="logo">Cloud Shop</span>
          <nav className="header-nav">
            <NavLink to="/" className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')} end>
              Table
            </NavLink>
            <NavLink to="/graph" className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}>
              Graph
            </NavLink>
          </nav>
          <div className="header-user">
            {subscriptionLabel && (
              <span className="subscription-badge">{subscriptionLabel}</span>
            )}
            <span className="user-name">{user?.displayName || user?.login}</span>
            <button type="button" className="btn-logout" onClick={logout}>
              Log out
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
