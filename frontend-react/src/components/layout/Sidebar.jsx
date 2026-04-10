import React from "react";

export function Sidebar({
  tab,
  mobileOpen,
  navItems,
  onNavigate,
}) {
  return (
    <aside className={`sidebar${mobileOpen  " mobile-open" : ""}`}>
      <div className="sidebar-inner">
        <div className="sidebar-section-label">Menu</div>
        <nav className="nav-links">
          {navItems.map((item, i) => {
            const prevSection = i > 0  navItems[i - 1].section : null;
            const showSection = item.section && item.section !== prevSection;
            return (
              <React.Fragment key={item.id}>
                {showSection  (
                  <div className="sidebar-section-label" style={{ marginTop: ".75rem" }}>
                    {item.section}
                  </div>
                ) : null}
                <button
                  className={`nav-link${tab === item.id  " active" : ""}`}
                  onClick={() => onNavigate(item.id)}
                >
                  {item.icon}
                  {item.label}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
