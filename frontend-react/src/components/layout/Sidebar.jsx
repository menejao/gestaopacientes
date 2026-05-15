import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { NAV_ICON, buildNavItems } from "../../config/nav";

function Sidebar({ tab, setTab, mobileOpen, setMobileOpen, query, setQuery, user, canManageUser, onClearPatient }) {
  const navItems = buildNavItems(user, canManageUser);

  return (
    <aside className={`sidebar${mobileOpen?" is-open":""}`}>
      <div className="sidebar-inner">
        <div className="sidebar__brand">
          <div className="sidebar__brand-lockup">
            <div className="sidebar__brand-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <rect x="7.25" y="1.75" width="3.5" height="14.5" rx="1.75" fill="white" />
                <rect x="1.75" y="7.25" width="14.5" height="3.5" rx="1.75" fill="white" />
              </svg>
            </div>
            <div className="sidebar__brand-copy">
              <strong>VALENS</strong>
              <span>Plataforma integrada para gestão da saúde pública</span>
            </div>
          </div>
          <Badge className="sidebar__brand-badge">Navy + Teal</Badge>
        </div>

        <div className="nav__label">Navegação</div>

        <nav className="nav">
          {navItems.map((item, i) => {
            const prevSection = i > 0 ? navItems[i-1].section : null;
            const showSection = item.section && item.section !== prevSection;
            return [
              showSection ? <div key={"sec-"+item.id} className="nav__label">{item.section}</div> : null,
              <button key={item.id}
                className={`nav__item${tab===item.id?" is-active":""}`}
                onClick={()=>{ setTab(item.id); setMobileOpen(false); if(item.id!=="patients" && onClearPatient) onClearPatient(); }}>
                {NAV_ICON[item.id]}
                {item.label}
              </button>
            ];
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__footer-copy">
            <strong>{user?.name || "Usuário"}</strong>
            <span>{user?.teamName || "Unidade ativa"}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setQuery(""); if (onClearPatient) onClearPatient(); }}>
            Limpar foco
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
