import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icons';

interface ModalProps {
  open?: boolean;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  labelledBy?: string;
}

export function Modal({ open = true, children, onClose, className = '', labelledBy }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal-shell ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

interface ModalHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  onClose: () => void;
  id?: string;
}

export function ModalHeader({ eyebrow, title, description, onClose, id }: ModalHeaderProps) {
  return (
    <header className="modal-head">
      <div>
        <span className="micro-label">{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
        <Icon name="close" size={18} />
      </button>
    </header>
  );
}
