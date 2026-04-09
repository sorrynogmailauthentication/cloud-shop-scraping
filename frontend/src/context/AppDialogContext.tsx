import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type AppDialogConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red styling for the confirm action (e.g. delete). */
  destructive?: boolean;
};

export type AppDialogAlertOptions = {
  title?: string;
  okLabel?: string;
};

type Pending =
  | {
      kind: 'alert';
      title?: string;
      message: string;
      okLabel: string;
      resolve: () => void;
    }
  | {
      kind: 'confirm';
      title?: string;
      message: string;
      confirmLabel: string;
      cancelLabel: string;
      destructive: boolean;
      resolve: (ok: boolean) => void;
    };

const AppDialogContext = createContext<{
  showAlert: (message: string, options?: AppDialogAlertOptions) => Promise<void>;
  showConfirm: (message: string, options?: AppDialogConfirmOptions) => Promise<boolean>;
} | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const showAlert = useCallback((message: string, options?: AppDialogAlertOptions) => {
    return new Promise<void>((resolve) => {
      setPending({
        kind: 'alert',
        message,
        title: options?.title,
        okLabel: options?.okLabel ?? 'OK',
        resolve,
      });
    });
  }, []);

  const showConfirm = useCallback((message: string, options?: AppDialogConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        kind: 'confirm',
        message,
        title: options?.title,
        confirmLabel: options?.confirmLabel ?? 'OK',
        cancelLabel: options?.cancelLabel ?? 'Отмена',
        destructive: options?.destructive ?? false,
        resolve,
      });
    });
  }, []);

  const dismissAlert = useCallback(() => {
    setPending((s) => {
      if (s?.kind !== 'alert') return s;
      s.resolve();
      return null;
    });
  }, []);

  const resolveConfirm = useCallback((ok: boolean) => {
    setPending((s) => {
      if (s?.kind !== 'confirm') return s;
      s.resolve(ok);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPending((s) => {
          if (!s) return s;
          if (s.kind === 'confirm') {
            s.resolve(false);
            return null;
          }
          s.resolve();
          return null;
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        setPending((s) => {
          if (!s) return s;
          if (s.kind === 'confirm') {
            s.resolve(true);
            return null;
          }
          s.resolve();
          return null;
        });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending]);

  const value = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm]);

  const dialogNode =
    pending &&
    createPortal(
      <div
        className="app-dialog-backdrop"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && pending.kind === 'alert') dismissAlert();
        }}
      >
        <div
          className="app-dialog-panel"
          role={pending.kind === 'alert' ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby={pending.title || pending.kind === 'confirm' ? 'app-dialog-title' : undefined}
          aria-describedby="app-dialog-desc"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(pending.title || pending.kind === 'confirm') && (
            <h2 id="app-dialog-title" className="app-dialog-title">
              {pending.title ?? 'Подтверждение'}
            </h2>
          )}
          <p id="app-dialog-desc" className="app-dialog-message">
            {pending.message}
          </p>
          <div className="app-dialog-actions">
            {pending.kind === 'confirm' ? (
              <>
                <button
                  type="button"
                  className="app-dialog-btn app-dialog-btn--secondary"
                  onClick={() => resolveConfirm(false)}
                >
                  {pending.cancelLabel}
                </button>
                <button
                  type="button"
                  className={
                    pending.destructive
                      ? 'app-dialog-btn app-dialog-btn--danger'
                      : 'app-dialog-btn app-dialog-btn--primary'
                  }
                  onClick={() => resolveConfirm(true)}
                >
                  {pending.confirmLabel}
                </button>
              </>
            ) : (
              <button type="button" className="app-dialog-btn app-dialog-btn--primary" onClick={dismissAlert}>
                {pending.okLabel}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {dialogNode}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error('useAppDialog must be used within AppDialogProvider');
  }
  return ctx;
}
