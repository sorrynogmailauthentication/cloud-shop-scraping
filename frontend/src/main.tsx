import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppDialogProvider } from './context/AppDialogContext';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppDialogProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AppDialogProvider>
    </BrowserRouter>
  </React.StrictMode>
);
