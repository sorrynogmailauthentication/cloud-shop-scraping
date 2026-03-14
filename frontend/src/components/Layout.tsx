import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Layout() {
  const { user, logout } = useAuth();

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
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
