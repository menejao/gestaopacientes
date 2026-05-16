import { SESSION_KEY, UI_STATE_KEY, AUDIT_KEY, AUDIT_MAX } from "../config/constants";

export function readLS(key, def) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}

export function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export function readSession() {
  try {
    const r = sessionStorage.getItem(SESSION_KEY);
    const p = r ? JSON.parse(r) : null;
    if (p && p.mode === "cookie" && p.user) return p;
    if (p && typeof p.token === "string" && p.user) return p;
    return null;
  } catch { return null; }
}

export function readUiState() {
  try { const r = localStorage.getItem(UI_STATE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

export function auditLog(action, details = {}, user = null) {
  try {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; }
    })();
    const entry = {
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts:        new Date().toISOString(),
      tsDisplay: new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }),
      action,
      user: user ? { id: user.id, name: user.name, role: user.role, email: user.email } : null,
      ...details,
    };
    const updated = [entry, ...existing].slice(0, AUDIT_MAX);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(updated));
  } catch {}
}

export function readAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; }
}

export function exportAuditLog() {
  const log = readAuditLog();
  const csv = [
    "ID;Data/Hora;Ação;Usuário;Perfil;E-mail;Detalhes",
    ...log.map(e => [
      e.id, e.tsDisplay, e.action,
      e.user?.name || "", e.user?.role || "", e.user?.email || "",
      JSON.stringify(Object.fromEntries(
        Object.entries(e).filter(([k]) => !["id","ts","tsDisplay","action","user"].includes(k))
      )).replace(/;/g, ","),
    ].join(";")),
  ].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `auditoria_saudeubs_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
