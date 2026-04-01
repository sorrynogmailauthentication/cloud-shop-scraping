import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLogin';

const API_BASE = import.meta.env.VITE_API_URL as string || '';

interface AdminUser {
  id: string;
  email: string | null;
  login: string;
  display_name: string | null;
  is_paid: number;
  access_until: string | null;
  created_at: string;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [updatingAccessId, setUpdatingAccessId] = useState<string | null>(null);
  const navigate = useNavigate();
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);

  useEffect(() => {
    if (!token) {
      navigate('/admin/login', { replace: true });
      return;
    }
    fetchUsers();
  }, [token, navigate]);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        navigate('/admin/login', { replace: true });
        return;
      }
      if (!res.ok) {
        setError('Не удалось загрузить пользователей');
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }

  async function togglePaid(user: AdminUser) {
    if (togglingId) return;
    setTogglingId(user.id);
    const newPaid = !user.is_paid;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/set-paid`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: user.id, isPaid: newPaid }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        navigate('/admin/login', { replace: true });
        return;
      }
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, is_paid: newPaid ? 1 : 0 } : u))
        );
      }
    } finally {
      setTogglingId(null);
    }
  }

  async function setAccessUntil(user: AdminUser, accessUntil: string | null) {
    setUpdatingAccessId(user.id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/set-access`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: user.id, accessUntil: accessUntil || null }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        navigate('/admin/login', { replace: true });
        return;
      }
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, access_until: accessUntil } : u))
        );
      }
    } finally {
      setUpdatingAccessId(null);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    navigate('/admin/login', { replace: true });
  }

  if (!token) return null;

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <span className="logo">Админ</span>
        <div className="admin-header-actions">
          <Link to="/" className="btn-home">На главную</Link>
          <button type="button" className="btn-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>
      <main className="admin-content">
        <h2>Пользователи</h2>
        {error && <div className="login-error">{error}</div>}
        {loading ? (
          <p className="muted">Загрузка…</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Почта</th>
                  <th>Дата создания</th>
                  <th>Имя</th>
                  <th>Оплачено</th>
                  <th>Доступ до</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email ?? '—'}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                    <td>{u.display_name ?? '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(u.is_paid)}
                        onChange={() => togglePaid(u)}
                        disabled={togglingId === u.id}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="admin-date-input"
                        value={u.access_until ?? ''}
                        onChange={(e) => setAccessUntil(u, e.target.value || null)}
                        onKeyDown={(e) => e.preventDefault()}
                        disabled={updatingAccessId === u.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
