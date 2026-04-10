import React from "react";

export function Select({ style, children, ...props }) {
  return (
    <select style={style} {...props}>
      {children}
    </select>
  );
}

export default Select;
