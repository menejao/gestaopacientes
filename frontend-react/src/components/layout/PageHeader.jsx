import React from "react";

export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <div className="page-header">
      <div>
        <div className="page-title" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          {icon  <span>{icon}</span> : null}
          <span>{title}</span>
        </div>
        {subtitle  <div className="page-subtitle">{subtitle}</div> : null}
      </div>
      {actions  <div>{actions}</div> : null}
    </div>
  );
}

export default PageHeader;
