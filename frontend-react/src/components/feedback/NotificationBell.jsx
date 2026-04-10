import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function CountBadge({ children }) {
  return (
    <span style={{ fontSize: ".68rem", padding: ".1rem .45rem", borderRadius: 999, background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", fontWeight: 700, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function NotificationBell({ patients, protocolByPatient, pharmacyStock, agenda, onNavigate }) {
  const notifReadKey = "saudeubs_notifications_read_v1";
  const [open, setOpen] = useState(false);
  const [readMap, setReadMap] = useState(() => readLS(notifReadKey, {}));
  const ref = useRef(null);

  useEffect(() => {
    function onClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    writeLS(notifReadKey, readMap);
  }, [readMap]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const alerts = useMemo(() => {
    const out = [];

    (patients || []).forEach((patient) => {
      const summary = protocolByPatient?.[patient.id];
      if (!summary) return;
      const pending = (summary.pending?.visits || 0) + (summary.pending?.consultations || 0) + (summary.pending?.vaccines || 0);
      if (pending > 0) {
        out.push({ id: `prot-${patient.id}`, type: "danger", title: "Protocolo pendente", detail: `${patient.name} - ${pending} item(s)`, patientId: patient.id });
      }
    });

    (pharmacyStock || []).forEach((item) => {
      if (Number(item.qty ?? 0) <= Number(item.minQty ?? 0)) {
        out.push({ id: `stk-${item.id}`, type: Number(item.qty ?? 0) === 0 ? "danger" : "warn", title: Number(item.qty ?? 0) === 0 ? "Estoque zerado" : "Estoque baixo", detail: item.name || item.id, patientId: null });
      }
    });

    (agenda || []).filter((item) => item.date === todayStr).slice(0, 5).forEach((item) => {
      out.push({ id: `ag-${item.id || item.date}`, type: "info", title: "Agendamento hoje", detail: item.patientName || item.title || "Consulta", patientId: item.patientId || null });
    });

    return out.slice(0, 30);
  }, [patients, protocolByPatient, pharmacyStock, agenda, todayStr]);

  useEffect(() => {
    setReadMap((prev) => {
      const activeIds = new Set(alerts.map((alert) => alert.id));
      const next = {};
      let changed = false;
      Object.entries(prev || {}).forEach(([id, read]) => {
        if (activeIds.has(id)) next[id] = read;
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [alerts]);

  const markRead = useCallback((id) => {
    setReadMap((prev) => (prev?.[id] ? prev : { ...(prev || {}), [id]: true }));
  }, []);

  const clearNotifications = useCallback(() => {
    setReadMap((prev) => {
      const next = { ...(prev || {}) };
      alerts.forEach((alert) => {
        next[alert.id] = true;
      });
      return next;
    });
  }, [alerts]);

  const unreadAlerts = alerts.filter((alert) => !readMap?.[alert.id]);
  const count = unreadAlerts.length;
  const danger = unreadAlerts.filter((alert) => alert.type === "danger").length;
  const badgeColor = danger > 0 ? "#ef4444" : count > 0 ? "#f59e0b" : "transparent";
  const typeStyle = { danger: { dot: "#ef4444" }, warn: { dot: "#f59e0b" }, info: { dot: "#3b82f6" } };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((value) => !value)} style={{ position: "relative", background: open ? "var(--surface-2, #f8fafc)" : "none", border: `1px solid ${open ? "var(--border, #e2e8f0)" : "transparent"}`, cursor: "pointer", padding: ".4rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, color: "var(--text-2, #334155)", transition: "all .15s" }} title="Notificações">
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
          <path d="M8 1a5 5 0 015 5v2.5l1 2H2l1-2V6a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {count > 0 && <span style={{ position: "absolute", top: -2, right: -2, minWidth: 17, height: 17, borderRadius: 999, background: badgeColor, color: "#fff", fontSize: ".58rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", lineHeight: 1, border: "2px solid var(--surface, #fff)" }}>{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 340, background: "var(--surface, #fff)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,.13)", zIndex: 1000, overflow: "hidden" }}>
          <div style={{ padding: ".75rem 1.1rem", borderBottom: "1px solid var(--border, #e2e8f0)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>Notificações</span>
            <div style={{ display: "flex", alignItems: "center", gap: ".45rem" }}>
              {unreadAlerts.length > 0 && <button type="button" onClick={clearNotifications} style={{ fontSize: ".72rem", padding: ".2rem .45rem", borderRadius: 8, border: "1px solid #e2e8f0", background: "transparent", cursor: "pointer", color: "#475569" }}>Limpar todas</button>}
              <CountBadge>{count}</CountBadge>
            </div>
          </div>

          {unreadAlerts.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-3, #64748b)", fontSize: ".82rem" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>🔔</div>
              Nenhuma notificação pendente
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: ".3rem 0", maxHeight: 360, overflowY: "auto" }}>
              {unreadAlerts.map((alert) => {
                const style = typeStyle[alert.type] || typeStyle.info;
                return (
                  <li key={alert.id} onClick={() => { markRead(alert.id); if (alert.patientId) { onNavigate(alert.patientId); setOpen(false); } }} style={{ display: "flex", alignItems: "flex-start", gap: ".7rem", padding: ".6rem 1.1rem", cursor: alert.patientId ? "pointer" : "default", borderLeft: `3px solid ${style.dot}`, transition: "background .12s" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: style.dot, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: ".8rem", color: "var(--ink, #0f172a)" }}>{alert.title}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{alert.detail}</div>
                    </div>
                    <button type="button" onClick={(event) => { event.stopPropagation(); markRead(alert.id); }} style={{ fontSize: ".68rem", padding: ".2rem .4rem", borderRadius: 8, border: "1px solid #e2e8f0", background: "transparent", cursor: "pointer", color: "#475569", flexShrink: 0 }}>Limpar</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
