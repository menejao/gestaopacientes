function Alert({ tone = "info", className = "", children, ...props }) {
  return (
    <div className={["alert", tone !== "info" ? `alert--${tone}` : "", className].filter(Boolean).join(" ")} role="alert" {...props}>
      {children}
    </div>
  );
}

export default Alert;
