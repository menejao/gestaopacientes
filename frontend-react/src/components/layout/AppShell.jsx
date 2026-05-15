function AppShell({ sidebar, topbar, children, mobileNavOpen = false, onCloseMobileNav }) {
  return (
    <div className="app-shell">
      {mobileNavOpen ? <button className="app-shell__scrim" type="button" onClick={onCloseMobileNav} aria-label="Fechar navegação" /> : null}
      {sidebar}
      <div className="app-shell__main">
        {topbar}
        {children}
      </div>
    </div>
  );
}

export default AppShell;
