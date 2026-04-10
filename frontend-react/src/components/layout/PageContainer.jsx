import React from "react";

export function PageContainer({ children, style }) {
  return (
    <div style={{ width: "100%", padding: "1.25rem 1.5rem", ...style }}>
      {children}
    </div>
  );
}

export default PageContainer;
