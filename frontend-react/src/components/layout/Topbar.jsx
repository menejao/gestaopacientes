import React, { useEffect, useState } from "react";

function IconSignOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10 2h3a1 1 0 011 1v10a1 1 0 01-1 1h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 12L2 8l4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Topbar({
  mobileOpen,
  onToggleMobile,
  apiHealth,
  searchNode,
  notificationsNode,
  selectedPatient,
  selectedPatientCategoryLabel,
  user,
  initials,
  roleLabel,
  onOpenProfile,
  onLogout,
}) {
  const [dropOpen, setDropOpen] = useState(false);

  useEffect(() => {
    if (!dropOpen) return;
    const handler = () => setDropOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [dropOpen]);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button className="mobile-menu-btn" type="button" onClick={onToggleMobile}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d={mobileOpen  "M2 2l12 12M2 14L14 2" : "M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="topbar-brand-icon" style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#14b8a6,#0d9488)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="7.5" y="2.5" width="3" height="13" rx="1.5" fill="white" opacity="0.95" />
            <rect x="2.5" y="7.5" width="13" height="3" rx="1.5" fill="white" opacity="0.95" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, gap: 0 }}>
          <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--teal-600)", letterSpacing: "0.08em", fontFamily: "Georgia,serif" }}>SIGUS</span>
          <span style={{ fontSize: "0.52rem", fontWeight: 400, color: "var(--text-3)", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Gestao Unica de Saude</span>
        </div>
      </div>

      <div className="topbar-center" />

      <div className="topbar-right">
        <div style={{ display: "flex", alignItems: "center", gap: ".35rem", padding: ".22rem .5rem", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: apiHealth.status === "ok"  "var(--green-600)" : apiHealth.status === "checking"  "var(--amber-600)" : "var(--red-600,#dc2626)",
            }}
          />
          <span style={{ fontSize: ".72rem", color: "var(--text-2)", fontWeight: 600 }}>API {apiHealth.label || "Verificando..."}</span>
        </div>

        {searchNode}
        {notificationsNode}

        {selectedPatient && (
          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", padding: ".28rem .65rem", borderRadius: "var(--r-md)", background: "var(--surface-2)", border: "1px solid var(--border)", maxWidth: 220, overflow: "hidden" }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-3)", flexShrink: 0 }}>
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: ".75rem", fontWeight: 500, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedPatient.name}</span>
            <span style={{ fontSize: ".72rem", color: "var(--text-3)", flexShrink: 0 }}>· {selectedPatientCategoryLabel}</span>
          </div>
        )}

        {selectedPatient && <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />}

        <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setDropOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: ".6rem", background: "none", border: "none", cursor: "pointer", padding: ".3rem .5rem", borderRadius: "var(--r-md)", transition: "background .12s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            <div className="user-avatar">{initials(user.name)}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.3 }}>
              <span style={{ fontSize: ".83rem", fontWeight: 600, color: "var(--text-1)", whiteSpace: "nowrap" }}>{user.name || "-"}</span>
              <span style={{ fontSize: ".71rem", color: "var(--text-3)", whiteSpace: "nowrap" }}>{roleLabel(user.role)}{user.teamName  ` · ${user.teamName}` : ""}</span>
            </div>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-3)", flexShrink: 0 }}>
              <path d={dropOpen  "M4 10l4-4 4 4" : "M4 6l4 4 4-4"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {dropOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", boxShadow: "var(--sh-lg)", minWidth: 220, zIndex: 500, overflow: "hidden", animation: "modal-in .15s ease" }}>
              <div style={{ padding: "1rem 1.1rem .75rem", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                  <div className="user-avatar" style={{ width: 36, height: 36, fontSize: ".88rem", flexShrink: 0 }}>{initials(user.name)}</div>
                  <div>
                    <div style={{ fontSize: ".85rem", fontWeight: 600, color: "var(--ink)" }}>{user.name || "-"}</div>
                    <div style={{ fontSize: ".72rem", color: "var(--text-3)" }}>{user.email || ""}</div>
                  </div>
                </div>
              </div>
              <div style={{ padding: ".4rem" }}>
                <button
                  onClick={() => { setDropOpen(false); onOpenProfile(); }}
                  style={{ display: "flex", alignItems: "center", gap: ".6rem", width: "100%", padding: ".6rem .75rem", borderRadius: "var(--r-md)", background: "none", border: "none", cursor: "pointer", fontSize: ".83rem", color: "var(--text-1)", fontFamily: "inherit", transition: "background .1s", textAlign: "left" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Editar perfil
                </button>
                <div style={{ height: 1, background: "var(--border)", margin: ".35rem .5rem" }} />
                <button
                  onClick={() => { setDropOpen(false); onLogout(); }}
                  style={{ display: "flex", alignItems: "center", gap: ".6rem", width: "100%", padding: ".6rem .75rem", borderRadius: "var(--r-md)", background: "none", border: "none", cursor: "pointer", fontSize: ".83rem", color: "var(--red-600,#dc2626)", fontFamily: "inherit", transition: "background .1s", textAlign: "left" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--red-50,#fef2f2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <IconSignOut />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Topbar;
