import { useState, useEffect } from "react";
import GlobalSearch from "../ui/GlobalSearch";
import NotificationBell from "../ui/NotificationBell";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { readLS } from "../../utils/storage";
import { AGENDA_KEY } from "../../config/constants";
import { catLabel } from "../../utils/clinical";
import { roleLabel } from "../../utils/roles";

const IconSignOut = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M10 11l4-4-4-4M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function Topbar({ user, selectedPatient, templates, mobileOpen, setMobileOpen, onLogout, onOpenProfile, patients, protocolByPatient, onNavigatePatient, apiHealth }) {
  const [dropOpen, setDropOpen] = useState(false);

  useEffect(() => {
    if (!dropOpen) return;
    const handler = () => setDropOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [dropOpen]);

  const statusTone = apiHealth?.status === "ok" ? "success" : apiHealth?.status === "checking" ? "warning" : "danger";

  return (
    <header className="topbar topbar--valens">
      <div className="topbar__brand">
        <button className="mobile-menu-btn" type="button" onClick={() => setMobileOpen((v) => !v)} aria-label="Abrir navegação">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d={mobileOpen ? "M2 2l12 12M2 14L14 2" : "M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="topbar__brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="7.5" y="2.5" width="3" height="13" rx="1.5" fill="white" opacity="0.95"/>
            <rect x="2.5" y="7.5" width="13" height="3" rx="1.5" fill="white" opacity="0.95"/>
          </svg>
        </div>
        <div className="topbar__brand-copy">
          <strong>VALENS</strong>
          <span>Plataforma integrada para gestão da saúde pública</span>
        </div>
      </div>

      <div className="topbar__center" />

      <div className="topbar__right">
        <Badge tone={statusTone} className="topbar__status">
          API {apiHealth?.label || "Verificando..."}
        </Badge>
        <GlobalSearch patients={patients || []} templates={templates || []} onNavigate={onNavigatePatient || (() => {})} />
        <NotificationBell
          patients={patients || []}
          protocolByPatient={protocolByPatient || {}}
          pharmacyStock={readLS("saudeubs_pharmacy_v1", [])}
          agenda={readLS(AGENDA_KEY, [])}
          onNavigate={onNavigatePatient || (() => {})}
        />

        {selectedPatient ? (
          <div className="topbar__patient-pill">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="topbar__patient-icon">
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span className="topbar__patient-name">{selectedPatient.name}</span>
            <span className="topbar__patient-meta">· {catLabel(templates, selectedPatient.careCategory)}</span>
          </div>
        ) : null}

        {selectedPatient ? <div className="topbar__divider" /> : null}

        <div className="topbar__account" onClick={(e) => e.stopPropagation()}>
          <button className="topbar__account-trigger" type="button" onClick={() => setDropOpen((v) => !v)}>
            <Avatar name={user?.name} />
            <div className="topbar__account-copy">
              <span>{user?.name || "-"}</span>
              <span>{roleLabel(user?.role)}{user?.teamName ? ` · ${user.teamName}` : ""}</span>
            </div>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="topbar__account-caret">
              <path d={dropOpen ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {dropOpen ? (
            <div className="topbar__account-menu">
              <div className="topbar__account-head">
                <div className="topbar__account-head-row">
                  <Avatar name={user?.name} size="lg" />
                  <div>
                    <div className="topbar__account-name">{user?.name || "-"}</div>
                    <div className="topbar__account-email">{user?.email || ""}</div>
                  </div>
                </div>
              </div>

              <div className="topbar__account-actions">
                <Button onClick={() => { setDropOpen(false); onOpenProfile(); }} variant="ghost" className="topbar__menu-button">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Editar perfil
                </Button>
                <div className="topbar__menu-divider" />
                <Button onClick={() => { setDropOpen(false); onLogout(); }} variant="ghost" className="topbar__menu-button topbar__menu-button--danger">
                  <IconSignOut />
                  Sair
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default Topbar;
