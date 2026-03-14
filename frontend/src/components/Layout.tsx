import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <span className="logo">Cloud Shop</span>
          <div className="header-user">
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
