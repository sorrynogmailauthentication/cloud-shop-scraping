import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <main className="dashboard">
      <h2>Dashboard</h2>
      <p className="muted">
        Logged in as <strong>{user?.displayName || user?.login}</strong>
        {user?.email && ` (${user.email})`}.
      </p>
      <p className="muted">Dashboard charts and data will go here.</p>
    </main>
  );
}
