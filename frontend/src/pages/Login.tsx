import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  
  const { user, loading, loginWithYandex, error } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryError = searchParams.get('error');

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  const err = queryError || error;
  const displayError = err ? (queryError ? decodeURIComponent(err) : err) : null;

  if (loading && !err) return <div className="login-loading">Loading...</div>;

 return (
    <div className="login-page">
      <div className="login-card">
        <h1>Cloud Shop Dashboard</h1>
        <p className="login-sub">Sign in with Yandex ID to continue</p>
        {displayError && (
          <div className="login-error" role="alert">
            {displayError}
          </div>
        )}
        <button type="button" className="btn-yandex" onClick={loginWithYandex}>
          <span className="btn-yandex-icon" aria-hidden>Я</span>
          Sign in with Yandex
        </button>
      </div>
    </div>
  );
}
