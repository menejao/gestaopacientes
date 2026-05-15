function Select({ label, hint, error, className = "", children, ...props }) {
  return (
    <label className={["field", className].filter(Boolean).join(" ")}>
      {label ? <span className="field__label">{label}</span> : null}
      <span className={["input", error ? "input--error" : ""].filter(Boolean).join(" ")}>
        <select {...props}>{children}</select>
      </span>
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export default Select;
