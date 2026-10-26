import React, { useEffect } from 'react';
import { Icon } from './Icons.jsx';

export function Modal({ children, onClose, className = '', labelledBy }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal-shell ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ eyebrow, title, description, onClose, id }) {
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
