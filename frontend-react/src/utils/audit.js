const AUDIT_KEY = "saudeubs_audit_v1";
const AUDIT_MAX = 5000;

export function auditLog(action, details = {}, user = null) {
  try {
    const existing = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: new Date().toISOString(),
      action,
      user: user  { id: user.id, name: user.name, role: user.role, email: user.email } : null,
      ...details,
    };
    localStorage.setItem(AUDIT_KEY, JSON.stringify([entry, ...existing].slice(0, AUDIT_MAX)));
  } catch {}
}

export function readAuditLog() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]");
  } catch {
    return [];
  }
}
