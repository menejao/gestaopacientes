import { forwardRef } from "react";

const Input = forwardRef(function Input({ label, hint, error, inputClassName = "", className = "", ...props }, ref) {
  return (
    <label className={["field", className].filter(Boolean).join(" ")}>
      {label ? <span className="field__label">{label}</span> : null}
      <span className={["input", error ? "input--error" : "", inputClassName].filter(Boolean).join(" ")}>
        <input ref={ref} {...props} />
      </span>
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
});

export default Input;
