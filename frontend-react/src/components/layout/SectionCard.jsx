import React from "react";

export function SectionCard({ title, action, children, style }) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--sh-sm)",
        overflow: "hidden",
        ...style,
      }}
    >
      {title  (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: ".5rem",
            padding: ".85rem 1rem",
            borderBottom: "1px solid var(--border)",
            fontWeight: 700,
            fontSize: ".85rem",
            color: "var(--text-1)",
          }}
        >
          <span>{title}</span>
          {action}
        </header>
      ) : null}
      <div style={{ padding: "1rem" }}>{children}</div>
    </section>
  );
}

export default SectionCard;
