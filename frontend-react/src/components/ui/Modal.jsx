import React from "react";

export function Modal({ title, subtitle, onClose, children, maxWidth = 520 }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        {(title || subtitle) && (
          <div style={{ marginBottom: ".85rem" }}>
            {title  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>{title}</h3> : null}
            {subtitle  <p style={{ margin: ".25rem 0 0", color: "var(--text-3)", fontSize: ".8rem" }}>{subtitle}</p> : null}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
