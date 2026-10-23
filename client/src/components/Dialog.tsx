import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DialogProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export function Dialog({ title, children, footer, onClose, wide }: DialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog${wide ? ' dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
