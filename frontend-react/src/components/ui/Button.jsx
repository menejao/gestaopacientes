import React from "react";

export function Button({ variant = "primary", style, className = "", ...props }) {
  const base =
    variant === "secondary"
       "btn-secondary"
      : variant === "ghost"
         "btn-ghost"
        : "btn-primary";
  return <button className={`${base} ${className}`.trim()} style={style} {...props} />;
}

export default Button;
