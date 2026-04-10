import React from "react";

export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
      {tabs.map(([id, label, count]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          style={{
            border: "1px solid var(--border)",
            background: value === id  "var(--teal-50)" : "var(--surface)",
            color: value === id  "var(--teal-700)" : "var(--text-2)",
            borderRadius: 999,
            padding: ".32rem .72rem",
            fontSize: ".76rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {label}
          {typeof count === "number"  ` (${count})` : ""}
        </button>
      ))}
    </div>
  );
}

export default Tabs;
