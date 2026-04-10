import React from "react";

export function AppShell({
  mobileNavOpen,
  onCloseMobileNav,
  topbar,
  sidebar,
  error,
  onClearError,
  children,
}) {
  return (
    <main className="app">
      {topbar}
      <div className="app-body">
        {mobileNavOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,.5)",
              zIndex: 190,
              backdropFilter: "blur(2px)",
            }}
            onClick={onCloseMobileNav}
          />
        )}

        {sidebar}

        <section className="main-area">
          {error && (
            <div className="error" style={{ margin: "1rem 2rem 0" }}>
              {error}
              <button className="icon-btn" style={{ marginLeft: ".5rem" }} onClick={onClearError}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          <div className="unit-page">
            <div className="unit-body">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default AppShell;
