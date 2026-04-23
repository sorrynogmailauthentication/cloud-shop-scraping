import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  
  const { user, loading, loginWithYandex, error } = useAuth();
  const [consentAccepted, setConsentAccepted] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryError = searchParams.get('error');

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  const err = queryError || error;
  const displayError = err ? (queryError ? decodeURIComponent(err) : err) : null;

  if (loading && !err) return <div className="login-loading">Загрузка...</div>;

 return (
    <div className="login-page">
      <div className="login-card">
        <h1>Ценалитика</h1>
        <p className="login-sub">Войдите через Яндекс ID, чтобы продолжить</p>
        {displayError && (
          <div className="login-error" role="alert">
            {displayError}
          </div>
        )}
        <button
          type="button"
          className="btn-yandex"
          onClick={loginWithYandex}
          disabled={!consentAccepted}
        >
          <span className="btn-yandex-icon" aria-hidden>Я</span>
          Войти через Яндекс
        </button>
        <label className="login-consent">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
          />
          <span>
            Нажимая кнопку входа на сайт, вы даёте согласие на обработку персональных данных в соответствии с{' '}
            <a
              href={encodeURI('/Политика персональные данные.pdf')}
              target="_blank"
              rel="noopener noreferrer"
            >
              политикой организации
            </a>
            .
          </span>
        </label>
      </div>
    </div>
  );
}
