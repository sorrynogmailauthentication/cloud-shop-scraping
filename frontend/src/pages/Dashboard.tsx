import { useAuth } from '../context/AuthContext';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { user } = useAuth();

  const hasAccess =
    user?.isPaid &&
    (!user.accessUntil || user.accessUntil >= todayStr());

  if (!user?.isPaid) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Please wait for admin confirmation</h2>
        <p className="muted">
          Your account (<strong>{user?.displayName || user?.login}</strong>
          {user?.email && ` — ${user.email}`}) is pending. You will see the dashboard once an admin has confirmed access.
        </p>
      </main>
    );
  }

  if (!hasAccess && user.accessUntil) {
    return (
      <main className="dashboard dashboard-waiting">
        <h2>Access expired</h2>
        <p className="muted">
          Your dashboard access ended on <strong>{user.accessUntil}</strong>. Contact an admin to extend access.
        </p>
      </main>
    );
  }

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
