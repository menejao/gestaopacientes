export function Tabs({ className = "", children, ...props }) {
  return <div className={["tabs", className].filter(Boolean).join(" ")} {...props}>{children}</div>;
}

export function Tab({ active = false, className = "", children, ...props }) {
  return (
    <button
      className={["tab", active ? "is-active" : "", className].filter(Boolean).join(" ")}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
