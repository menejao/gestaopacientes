import React from "react";

export function Badge({ children, tone = "muted", style }) {
  const palette = {
    muted: { bg: "var(--surface-2)", color: "var(--text-2)", border: "var(--border)" },
    ok: { bg: "var(--green-50)", color: "var(--green-700)", border: "var(--green-100)" },
    warn: { bg: "var(--amber-50)", color: "var(--amber-700)", border: "var(--amber-100)" },
    danger: { bg: "var(--red-50)", color: "var(--red-700)", border: "var(--red-100)" },
    info: { bg: "var(--teal-50)", color: "var(--teal-700)", border: "var(--teal-200)" },
  };
  const p = palette[tone] || palette.muted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: ".25rem",
        fontSize: ".72rem",
        padding: ".18rem .55rem",
        borderRadius: 999,
        border: `1px solid ${p.border}`,
        background: p.bg,
        color: p.color,
        fontWeight: 700,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export default Badge;
