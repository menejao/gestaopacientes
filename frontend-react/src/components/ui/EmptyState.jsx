import React from "react";

export function EmptyState({ title = "Sem dados", subtitle, action, icon = "•" }) {
  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-lg)",
        background: "var(--surface-2)",
        padding: "1.6rem 1rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "1.2rem", marginBottom: ".45rem", color: "var(--text-3)" }}>{icon}</div>
      <div style={{ fontWeight: 700, color: "var(--text-1)", marginBottom: ".25rem" }}>{title}</div>
      {subtitle  <div style={{ fontSize: ".8rem", color: "var(--text-3)" }}>{subtitle}</div> : null}
      {action  <div style={{ marginTop: ".75rem" }}>{action}</div> : null}
    </div>
  );
}

export default EmptyState;
