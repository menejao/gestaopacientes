import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  listAppointments, createAppointment, deleteAppointment,
  listTasks, createTask, updateTaskStatus,
  listMessages, sendMessage,
  createPatient, listPatients,
  createRecord, getPatientHistory,
} from "./api";

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DESIGN SYSTEM â€” SIGUS v2
   Paleta: slate-dark + teal + tokens refinados
   Tipografia: 'DM Sans' + 'IBM Plex Mono' (jÃ¡ carregados no App)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const DS = {
  // Cores base (lidas como CSS vars quando disponÃ­veis, fallback aqui)
  teal: { 50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 400: "#2dd4bf", 500: "#14b8a6", 600: "#0d9488", 700: "#0f766e" },
  slate: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" },
  red:   { 50: "#fef2f2", 100: "#fee2e2", 300: "#fca5a5", 500: "#ef4444", 700: "#b91c1c" },
  amber: { 50: "#fffbeb", 100: "#fef3c7", 300: "#fcd34d", 500: "#f59e0b", 700: "#b45309" },
  green: { 50: "#f0fdf4", 100: "#dcfce7", 300: "#86efac", 500: "#22c55e", 600: "#16a34a", 700: "#15803d" },
  blue:  { 50: "#eff6ff", 100: "#dbeafe", 300: "#93c5fd", 500: "#3b82f6", 700: "#1d4ed8" },
  purple:{ 50: "#faf5ff", 100: "#ede9fe", 300: "#c4b5fd", 500: "#8b5cf6", 700: "#7c3aed" },
};

const css = {
  // Componentes reutilizÃ¡veis como objetos de estilo
  card: {
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 16,
    boxShadow: "0 1px 4px rgba(15,23,42,.06)",
  },
  cardHover: {
    transition: "box-shadow .18s, transform .18s, border-color .18s",
  },
  badge: (color, bg, border) => ({
    display: "inline-flex", alignItems: "center",
    padding: "2px 10px", borderRadius: 999,
    fontSize: ".68rem", fontWeight: 700, letterSpacing: ".03em",
    color, background: bg, border: `1px solid ${border}`,
  }),
  btnPrimary: {
    display: "inline-flex", alignItems: "center", gap: ".4rem",
    padding: ".5rem 1.1rem",
    background: "var(--teal-600, #0d9488)", color: "#fff",
    border: "none", borderRadius: 10, cursor: "pointer",
    fontSize: ".82rem", fontWeight: 700,
    boxShadow: "0 2px 8px rgba(13,148,136,.25)",
    transition: "background .15s, box-shadow .15s, transform .1s",
    whiteSpace: "nowrap",
  },
  btnSecondary: {
    display: "inline-flex", alignItems: "center", gap: ".4rem",
    padding: ".5rem 1rem",
    background: "var(--surface-2, #f8fafc)", color: "var(--text-2, #334155)",
    border: "1px solid var(--border, #e2e8f0)", borderRadius: 10, cursor: "pointer",
    fontSize: ".82rem", fontWeight: 600,
    transition: "background .15s, border-color .15s",
  },
  btnGhost: {
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-3, #64748b)", borderRadius: 8, padding: ".3rem .5rem",
    transition: "background .15s, color .15s",
  },
  input: {
    width: "100%", boxSizing: "border-box",
    padding: ".55rem .85rem",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 10,
    background: "var(--surface, #fff)",
    color: "var(--ink, #0f172a)",
    fontSize: ".84rem",
    outline: "none",
    transition: "border-color .15s, box-shadow .15s",
  },
  label: {
    display: "flex", flexDirection: "column", gap: ".3rem",
    fontSize: ".75rem", fontWeight: 600, color: "var(--slate-700, #334155)",
  },
  sectionTitle: {
    fontSize: ".65rem", fontWeight: 800, letterSpacing: ".08em",
    textTransform: "uppercase", color: "var(--text-3, #64748b)",
  },
  modal: {
    position: "fixed", inset: 0,
    background: "rgba(15,23,42,.5)",
    backdropFilter: "blur(3px)",
    zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "1rem",
  },
  modalBox: {
    background: "var(--surface, #fff)",
    borderRadius: 20,
    padding: "1.75rem",
    width: "100%", maxWidth: 500,
    boxShadow: "0 24px 80px rgba(0,0,0,.18)",
    maxHeight: "90vh", overflowY: "auto",
  },
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HELPERS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function fmtDate(v) {
  if (!v) return "-";
  try {
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
    }
    return new Date(v).toLocaleDateString("pt-BR");
  } catch { return String(v); }
}
function onlyDigits(v) { return String(v || "").replace(/\D/g, ""); }
function formatCpf(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}
function formatPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d.length <= 10
    ? d.replace(/^(\d{2})(\d)/g, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
    : d.replace(/^(\d{2})(\d)/g, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
function initials(name) {
  return String(name || "?").trim().split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
}
function calcAge(birthDate) {
  if (!birthDate) return null;
  try {
    const b = new Date(birthDate + "T12:00:00");
    const now = new Date();
    let ay = now.getFullYear() - b.getFullYear();
    let am = now.getMonth() - b.getMonth();
    if (am < 0) { ay--; am += 12; }
    if (ay < 0) return null;
    return ay < 2 ? `${ay}a ${am}m` : `${ay}a`;
  } catch { return null; }
}
function roleLabel(role) {
  return {
    nurse_manager: "Enfermeira", doctor: "MÃ©dico(a)", acs: "ACS",
    pharmacist: "FarmacÃªutico(a)", pharmacy_tech: "TÃ©c. de FarmÃ¡cia",
    nursing_tech: "TÃ©c. Enfermagem", receptionist: "Recepcionista",
    dentist: "Dentista", gestor: "Gestor(a) UBS",
  }[String(role || "").toLowerCase()] || role || "-";
}
function catLabel(templates, category) {
  return templates?.find(t => t.category === category)?.label || category || "Geral";
}
function isAcs(user) { return String(user?.role || "") === "acs"; }
function isManager(user) { return String(user?.role || "") === "nurse_manager"; }
function isPharmacist(user) { return ["pharmacist", "pharmacy_tech"].includes(String(user?.role || "")); }
function canManage(user) { return ["nurse_manager", "doctor", "dentist"].includes(String(user?.role || "")); }
function normalizeSearch(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
function matchesSearch(p, q) {
  if (!q) return true;
  const nq = normalizeSearch(q);
  return normalizeSearch(p.name || "").includes(nq) ||
    (p.cpf || "").replace(/\D/g, "").includes(nq.replace(/\D/g, "")) ||
    (p.phone || "").replace(/\D/g, "").includes(nq.replace(/\D/g, ""));
}

const readLS = (key, def) => { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; } };
const writeLS = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ATOMIC UI COMPONENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function Avatar({ name, size = 36, color = "var(--teal-600, #0d9488)" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * .28 + "rem", fontWeight: 800, letterSpacing: "-.01em",
    }}>
      {initials(name)}
    </div>
  );
}

function Badge({ children, color = DS.slate[500], bg = DS.slate[100], border = DS.slate[200] }) {
  return <span style={css.badge(color, bg, border)}>{children}</span>;
}

function PriorityBadge({ priority }) {
  const map = {
    urgent: { label: "Urgente", color: DS.red[700], bg: DS.red[50], border: DS.red[100] },
    high:   { label: "PrioritÃ¡rio", color: DS.amber[700], bg: DS.amber[50], border: DS.amber[100] },
    normal: { label: "Normal", color: DS.blue[700], bg: DS.blue[50], border: DS.blue[100] },
    elective:{ label: "Eletivo", color: DS.slate[600], bg: DS.slate[50], border: DS.slate[200] },
  };
  const m = map[priority] || map.normal;
  return <Badge color={m.color} bg={m.bg} border={m.border}>{m.label}</Badge>;
}

function StatusBadge({ status }) {
  const map = {
    pending:   { label: "Pendente",   color: DS.amber[700], bg: DS.amber[50],  border: DS.amber[100] },
    scheduled: { label: "Agendado",   color: DS.blue[700],  bg: DS.blue[50],   border: DS.blue[100] },
    completed: { label: "Realizado",  color: DS.green[700], bg: DS.green[50],  border: DS.green[100] },
    cancelled: { label: "Cancelado",  color: DS.slate[500], bg: DS.slate[100], border: DS.slate[200] },
    in_progress:{ label: "Em andamento", color: DS.purple[700], bg: DS.purple[50], border: DS.purple[100] },
    done:      { label: "ConcluÃ­do",  color: DS.green[700], bg: DS.green[50],  border: DS.green[100] },
    waiting:   { label: "Aguardando", color: DS.blue[700],  bg: DS.blue[50],   border: DS.blue[100] },
    called:    { label: "Em atendimento", color: DS.green[700], bg: DS.green[50], border: DS.green[100] },
  };
  const m = map[status] || { label: status, color: DS.slate[500], bg: DS.slate[100], border: DS.slate[200] };
  return <Badge color={m.color} bg={m.bg} border={m.border}>{m.label}</Badge>;
}

function IconBtn({ onClick, title, children, danger }) {
  return (
    <button onClick={onClick} title={title}
      style={{ ...css.btnGhost, color: danger ? DS.red[500] : undefined }}>
      {children}
    </button>
  );
}

function Modal({ title, subtitle, onClose, children, maxWidth = 500 }) {
  useEffect(() => {
    const esc = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div style={css.modal} onClick={onClose}>
      <div style={{ ...css.modalBox, maxWidth }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--ink, #0f172a)" }}>{title}</h3>
            {subtitle && <p style={{ margin: ".25rem 0 0", fontSize: ".78rem", color: "var(--text-3, #64748b)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ ...css.btnGhost, marginLeft: ".5rem", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <label style={css.label}>
      {label}{required && <span style={{ color: DS.red[500] }}> *</span>}
      {children}
    </label>
  );
}

function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ padding: "3.5rem 1rem", textAlign: "center", background: "var(--surface-2, #f8fafc)", border: "1px dashed var(--border, #e2e8f0)", borderRadius: 16 }}>
      <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: ".95rem", fontWeight: 700, color: "var(--ink, #0f172a)", marginBottom: ".35rem" }}>{title}</div>
      {subtitle && <div style={{ fontSize: ".8rem", color: "var(--text-3, #64748b)", maxWidth: 280, margin: "0 auto .75rem" }}>{subtitle}</div>}
      {action}
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: ".25rem", padding: ".3rem", background: "var(--surface-2, #f8fafc)", borderRadius: 12, border: "1px solid var(--border, #e2e8f0)" }}>
      {tabs.map(([v, l, count]) => (
        <button key={v} onClick={() => onChange(v)}
          style={{
            flex: 1, padding: ".4rem .75rem", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: ".78rem", fontWeight: 700, transition: "all .15s",
            background: value === v ? "var(--surface, #fff)" : "transparent",
            color: value === v ? "var(--ink, #0f172a)" : "var(--text-3, #64748b)",
            boxShadow: value === v ? "0 1px 3px rgba(0,0,0,.1)" : "none",
            whiteSpace: "nowrap",
          }}>
          {l}{count !== undefined ? <span style={{ marginLeft: ".4rem", fontSize: ".65rem", opacity: .7 }}>({count})</span> : null}
        </button>
      ))}
    </div>
  );
}

function KpiCard({ icon, label, value, color, trend }) {
  return (
    <div style={{ ...css.card, padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: ".5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "1.1rem" }}>{icon}</span>
        {trend && <span style={{ fontSize: ".7rem", fontWeight: 700, color: trend > 0 ? DS.green[600] : DS.red[500], background: trend > 0 ? DS.green[50] : DS.red[50], padding: "1px 6px", borderRadius: 999 }}>{trend > 0 ? "â†‘" : "â†“"} {Math.abs(trend)}%</span>}
      </div>
      <div style={{ fontSize: "1.85rem", fontWeight: 900, color: color || "var(--ink, #0f172a)", letterSpacing: "-.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: ".72rem", fontWeight: 600, color: "var(--text-3, #64748b)", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder = "Buscarâ€¦" }) {
  return (
    <div style={{ position: "relative" }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", left: ".85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-3, #64748b)", pointerEvents: "none" }}>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
      <input value={value} onChange={onChange} placeholder={placeholder}
        style={{ ...css.input, paddingLeft: "2.5rem" }} />
    </div>
  );
}

function PatientAutocompleteField({ patients, search, setSearch, selectedId, onSelect, placeholder = "Nome, CPF ou telefone…", required }) {
  const selectedPatient = (patients || []).find(p => p.id === selectedId) || null;
  const options = useMemo(() => (patients || []).filter(p => matchesSearch(p, search)).slice(0, 30), [patients, search]);
  const showResults = search.trim().length > 0 &&
    (!selectedPatient || normalizeSearch(search) !== normalizeSearch(selectedPatient.name || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>
      <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder={placeholder} />
      {selectedPatient && (
        <div style={{ display: "flex", alignItems: "center", gap: ".55rem", padding: ".45rem .65rem", borderRadius: 10, border: "1px solid var(--teal-200, #99f6e4)", background: "var(--teal-50, #f0fdfa)" }}>
          <Avatar name={selectedPatient.name} size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--teal-700, #0f766e)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedPatient.name}</div>
            <div style={{ fontSize: ".68rem", color: "var(--text-3, #64748b)" }}>{selectedPatient.phone || "—"}</div>
          </div>
          <button type="button" onClick={() => { onSelect(""); setSearch(""); }} style={{ ...css.btnGhost, fontSize: ".72rem", padding: ".2rem .4rem" }}>
            Limpar
          </button>
        </div>
      )}
      {showResults && (
        <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--border, #e2e8f0)", borderRadius: 10, background: "var(--surface, #fff)" }}>
          {options.length === 0 ? (
            <div style={{ padding: ".55rem .85rem", fontSize: ".76rem", color: "var(--text-3, #64748b)" }}>Nenhum paciente encontrado.</div>
          ) : options.map(p => (
            <button key={p.id} type="button" onClick={() => { onSelect(p.id); setSearch(p.name); }}
              style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid var(--border, #e2e8f0)", padding: ".52rem .8rem", cursor: "pointer", display: "flex", alignItems: "center", gap: ".6rem" }}>
              <Avatar name={p.name} size={26} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--ink, #0f172a)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: ".68rem", color: "var(--text-3, #64748b)" }}>{p.phone || "—"}{p.cpf ? ` · ${p.cpf}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {required && <input type="hidden" value={selectedId || ""} required readOnly />}
    </div>
  );
}
function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".85rem" }}>
        {icon && <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--teal-600, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>{icon}</div>}
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 900, color: "var(--ink, #0f172a)", letterSpacing: "-.02em" }}>{title}</h2>
          {subtitle && <p style={{ margin: ".2rem 0 0", fontSize: ".78rem", color: "var(--text-3, #64748b)" }}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   1. NOTIFICATION BELL
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function NotificationBell({ patients, protocolByPatient, pharmacyStock, agenda, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

  const alerts = useMemo(() => {
    const out = [];
    (patients || []).forEach(p => {
      const s = protocolByPatient?.[p.id];
      if (!s) return;
      const pending = (s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0);
      if (pending > 0) {
        out.push({ id: "prot-" + p.id, type: "danger", title: "Protocolo pendente", detail: p.name + " â€“ " + pending + " item(s)", patientId: p.id });
      }
    });
    (pharmacyStock || []).forEach(s => {
      if (Number(s.qty ?? 0) <= Number(s.minQty ?? 0)) {
        out.push({ id: "stk-" + s.id, type: s.qty === 0 ? "danger" : "warn", title: s.qty === 0 ? "Estoque zerado" : "Estoque baixo", detail: s.name || s.id, patientId: null });
      }
    });
    (agenda || []).filter(a => a.date === todayStr).slice(0, 5).forEach(a => {
      out.push({ id: "ag-" + (a.id || a.date), type: "info", title: "Agendamento hoje", detail: a.patientName || a.title || "Consulta", patientId: a.patientId || null });
    });
    return out.slice(0, 30);
  }, [patients, protocolByPatient, pharmacyStock, agenda]);

  const count = alerts.length;
  const danger = alerts.filter(a => a.type === "danger").length;
  const badgeColor = danger > 0 ? DS.red[500] : count > 0 ? DS.amber[500] : "transparent";

  const typeStyle = {
    danger: { border: DS.red[300], dot: DS.red[500] },
    warn:   { border: DS.amber[300], dot: DS.amber[500] },
    info:   { border: DS.blue[300], dot: DS.blue[500] },
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ position: "relative", background: open ? "var(--surface-2, #f8fafc)" : "none", border: "1px solid " + (open ? "var(--border, #e2e8f0)" : "transparent"), cursor: "pointer", padding: ".4rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, color: "var(--text-2, #334155)", transition: "all .15s" }}
        title="NotificaÃ§Ãµes">
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
          <path d="M8 1a5 5 0 015 5v2.5l1 2H2l1-2V6a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {count > 0 && (
          <span style={{ position: "absolute", top: -2, right: -2, minWidth: 17, height: 17, borderRadius: 999, background: badgeColor, color: "#fff", fontSize: ".58rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", lineHeight: 1, border: "2px solid var(--surface, #fff)" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 340, background: "var(--surface, #fff)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,.13)", zIndex: 1000, overflow: "hidden" }}>
          <div style={{ padding: ".75rem 1.1rem", borderBottom: "1px solid var(--border, #e2e8f0)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>NotificaÃ§Ãµes</span>
            <Badge color={DS.slate[500]} bg={DS.slate[100]} border={DS.slate[200]}>{count}</Badge>
          </div>
          {count === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-3, #64748b)", fontSize: ".82rem" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: ".5rem" }}>ðŸ””</div>
              Nenhuma notificaÃ§Ã£o pendente
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: ".3rem 0", maxHeight: 360, overflowY: "auto" }}>
              {alerts.map(a => {
                const s = typeStyle[a.type] || typeStyle.info;
                return (
                  <li key={a.id}
                    onClick={() => { if (a.patientId) { onNavigate(a.patientId); setOpen(false); } }}
                    style={{ display: "flex", alignItems: "flex-start", gap: ".7rem", padding: ".6rem 1.1rem", cursor: a.patientId ? "pointer" : "default", borderLeft: `3px solid ${s.dot}`, transition: "background .12s" }}
                    onMouseEnter={e => { if (a.patientId) e.currentTarget.style.background = "var(--surface-2, #f8fafc)"; }}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: ".8rem", color: "var(--ink, #0f172a)" }}>{a.title}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.detail}</div>
                    </div>
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   2. QUEUE PAGE â€” Fila de Espera / RecepÃ§Ã£o
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const QUEUE_KEY = "saudeubs_queue_v1";

function QueueCard({ entry, onCall, onFinish, onRemove, position, priorityColor, priorityLabel }) {
  const elapsed = Math.floor((Date.now() - new Date(entry.arrivedAt).getTime()) / 60000);
  const isOverdue = elapsed > 30 && entry.status === "waiting";
  const pc = priorityColor[entry.priority] || DS.blue[500];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: ".85rem",
      padding: ".85rem 1rem",
      background: entry.status === "called" ? DS.green[50] : "var(--surface, #fff)",
      border: `1px solid ${entry.status === "called" ? DS.green[200] : isOverdue ? DS.amber[200] : "var(--border, #e2e8f0)"}`,
      borderLeft: `4px solid ${entry.status === "called" ? DS.green[500] : pc}`,
      borderRadius: 12, marginBottom: ".4rem",
      transition: "box-shadow .15s",
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,.07)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      {position !== undefined && (
        <span style={{ fontSize: ".88rem", fontWeight: 900, color: "var(--text-3, #64748b)", minWidth: 22, textAlign: "center" }}>
          {entry.status === "called" ? "â†’" : position + 1}
        </span>
      )}
      <Avatar name={entry.patientName} size={36} color={entry.status === "called" ? DS.green[600] : "var(--teal-600, #0d9488)"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>{entry.patientName}</div>
        <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".1rem" }}>
          <span>{entry.reason}</span>
          <span>Â·</span>
          <span style={{ color: isOverdue ? DS.amber[700] : undefined, fontWeight: isOverdue ? 700 : 400 }}>{elapsed}min</span>
          {entry.incompletePatient && <Badge color={DS.amber[700]} bg={DS.amber[50]} border={DS.amber[100]}>Cadastro incompleto</Badge>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexShrink: 0 }}>
        <PriorityBadge priority={entry.priority} />
        {entry.status === "waiting" && onCall && (
          <button onClick={onCall} style={{ ...css.btnPrimary, padding: ".35rem .8rem", fontSize: ".75rem" }}>
            Chamar
          </button>
        )}
        {entry.status === "called" && onFinish && (
          <button onClick={onFinish} style={{ ...css.btnPrimary, padding: ".35rem .8rem", fontSize: ".75rem", background: DS.green[600] }}>
            Finalizar
          </button>
        )}
        {onRemove && (
          <IconBtn onClick={onRemove} title="Remover" danger>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </IconBtn>
        )}
      </div>
    </div>
  );
}

export function QueuePage({ patients, users, user, token, onNewPatient }) {
  const [queue, setQueue] = useState(() => readLS(QUEUE_KEY, []));
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ patientId: "", reason: "", priority: "normal" });
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState("existing");
  const [busy, setBusy] = useState(false);

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY, q); }

  function addToQueue(e) {
    e.preventDefault();
    if (addMode === "existing" && !form.patientId) return;
    if (addMode === "quick" && !quickName.trim()) return;
    let patient = null;
    if (addMode === "existing") patient = patients.find(p => p.id === form.patientId);
    const entry = {
      id: Date.now().toString(36),
      patientId: patient?.id || null,
      patientName: patient?.name || quickName.trim(),
      phone: patient?.phone || quickPhone.trim(),
      reason: form.reason.trim() || "Atendimento",
      priority: form.priority,
      arrivedAt: new Date().toISOString(),
      status: "waiting",
      incompletePatient: addMode === "quick",
    };
    saveQueue([...queue, entry]);
    setForm({ patientId: "", reason: "", priority: "normal" });
    setQuickName(""); setQuickPhone(""); setAdding(false);
  }

  const waiting = queue.filter(e => e.status === "waiting");
  const called = queue.filter(e => e.status === "called");
  const filtered = patients.filter(p => matchesSearch(p, search));
  const priorityColor = { urgent: DS.red[500], high: DS.amber[500], normal: DS.blue[500] };
  const priorityLabel = { urgent: "Urgente", high: "PrioritÃ¡rio", normal: "Normal" };

  const stats = [
    { icon: "â³", label: "Aguardando", value: waiting.length, color: DS.blue[500] },
    { icon: "ðŸ©º", label: "Em atendimento", value: called.length, color: DS.green[600] },
    { icon: "ðŸ‘¥", label: "Total hoje", value: queue.length, color: DS.slate[500] },
  ];

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        icon="ðŸ¥"
        title="Fila de Espera"
        subtitle={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        actions={
          <button onClick={() => setAdding(true)} style={css.btnPrimary}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Registrar chegada
          </button>
        }
      />

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".65rem", marginBottom: "1.5rem" }}>
        {stats.map(s => (
          <div key={s.label} style={{ ...css.card, padding: ".9rem 1.1rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
            <span style={{ fontSize: "1.25rem" }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: ".68rem", fontWeight: 600, color: "var(--text-3, #64748b)", textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Em atendimento */}
      {called.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ ...css.sectionTitle, marginBottom: ".65rem" }}>Em atendimento ({called.length})</div>
          {called.map(entry => (
            <QueueCard key={entry.id} entry={entry} priorityColor={priorityColor} priorityLabel={priorityLabel}
              onFinish={() => saveQueue(queue.filter(q => q.id !== entry.id))}
              onRemove={() => saveQueue(queue.filter(q => q.id !== entry.id))} />
          ))}
        </div>
      )}

      {/* Aguardando */}
      <div style={{ ...css.sectionTitle, marginBottom: ".65rem" }}>Aguardando ({waiting.length})</div>
      {waiting.length === 0
        ? <EmptyState icon="ðŸŽ‰" title="Fila vazia" subtitle="Nenhum paciente aguardando no momento" />
        : waiting.map((entry, idx) => (
          <QueueCard key={entry.id} entry={entry} position={idx} priorityColor={priorityColor} priorityLabel={priorityLabel}
            onCall={() => saveQueue(queue.map(q => q.id === entry.id ? { ...q, status: "called" } : q))}
            onRemove={() => saveQueue(queue.filter(q => q.id !== entry.id))} />
        ))
      }

      {/* Modal de registro de chegada */}
      {adding && (
        <Modal title="Registrar chegada" subtitle="Adicione um paciente Ã  fila de atendimento" onClose={() => setAdding(false)}>
          <Tabs
            tabs={[["existing", "Paciente cadastrado"], ["quick", "Cadastro rÃ¡pido"]]}
            value={addMode}
            onChange={setAddMode}
          />
          <form onSubmit={addToQueue} style={{ display: "flex", flexDirection: "column", gap: ".75rem", marginTop: "1rem" }}>
            {addMode === "existing" ? (
              <>
                <FormField label="Paciente" required>
              <PatientAutocompleteField
                patients={patients}
                search={search}
                setSearch={setSearch}
                selectedId={form.patientId}
                onSelect={(id)=>setForm(s=>({...s, patientId:id}))}
                required
              />
            </FormField>
              </>
            ) : (
              <>
                <FormField label="Nome completo" required>
                  <input value={quickName} onChange={e => setQuickName(e.target.value)} required style={css.input} placeholder="Nome do paciente" />
                </FormField>
                <FormField label="Telefone">
                  <input value={quickPhone} onChange={e => setQuickPhone(e.target.value)} style={css.input} placeholder="(00) 00000-0000" />
                </FormField>
              </>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
              <FormField label="Motivo">
                <input value={form.reason} onChange={e => setForm(s => ({ ...s, reason: e.target.value }))} style={css.input} placeholder="Ex: consulta, exameâ€¦" />
              </FormField>
              <FormField label="Prioridade">
                <select value={form.priority} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))} style={css.input}>
                  <option value="normal">Normal</option>
                  <option value="high">PrioritÃ¡rio</option>
                  <option value="urgent">Urgente</option>
                </select>
              </FormField>
            </div>
            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end", paddingTop: ".5rem" }}>
              <button type="button" onClick={() => setAdding(false)} style={css.btnSecondary}>Cancelar</button>
              <button type="submit" style={css.btnPrimary} disabled={busy}>{busy ? "Adicionandoâ€¦" : "Adicionar Ã  fila"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   4. AGENDA PAGE â€” Agendamentos
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const AGENDA_KEY = "saudeubs_agenda_v1";

export function AgendaPage({ patients, users, user, token, teams, onNewPatient, onPatientCreated, onNavigatePatient }) {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState(() => readLS(AGENDA_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: "", time: "", type: "consultation", notes: "", professional: "" });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("week");

  const daysWithAppts = useMemo(() => {
    const s = new Set();
    appointments.forEach(a => s.add(a.date));
    return s;
  }, [appointments]);

  const weekDays = useMemo(() => {
    const start = new Date(selectedDate + "T12:00:00");
    const dow = start.getDay();
    const monday = new Date(start);
    monday.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [selectedDate]);

  const dayAppointments = appointments
    .filter(a => a.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  async function submitForm(e) {
    e.preventDefault();
    setError("");
    if (!form.patientId || !form.time) { setError("Selecione paciente e horÃ¡rio."); return; }
    setBusy(true);
    try {
      const patient = patients.find(p => p.id === form.patientId);
      const entry = {
        id: Date.now().toString(36),
        patientId: form.patientId,
        patientName: patient?.name || "",
        date: selectedDate,
        time: form.time,
        type: form.type,
        notes: form.notes,
        professional: form.professional || user?.name || "",
        createdBy: user?.id,
      };
      const updated = [...appointments, entry];
      setAppointments(updated);
      writeLS(AGENDA_KEY, updated);
      try { await createAppointment(token, form.patientId, { date: selectedDate, demandType: "scheduled", summary: form.type === "consultation" ? "Consulta agendada" : form.type, conduct: "", nextStep: form.notes }); } catch {}
      setShowForm(false);
      setForm({ patientId: "", time: "", type: "consultation", notes: "", professional: "" });
    } catch (err) { setError(err.message || "Erro ao agendar."); }
    finally { setBusy(false); }
  }

  function removeAppt(id) {
    const updated = appointments.filter(a => a.id !== id);
    setAppointments(updated); writeLS(AGENDA_KEY, updated);
  }

  const filteredPatients = patients.filter(p => matchesSearch(p, search));
  const typeLabel = { consultation: "Consulta", return: "Retorno", exam: "Exame", procedure: "Procedimento", visit: "Visita domiciliar" };
  const typeColor = { consultation: DS.blue[500], return: DS.purple[500], exam: DS.amber[500], procedure: DS.red[500], visit: DS.green[600] };
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "SÃ¡b"];

  const hours = Array.from({ length: 10 }, (_, i) => `${(7 + i).toString().padStart(2, "0")}:00`);

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        icon="ðŸ“…"
        title="Agenda"
        subtitle={fmtDate(selectedDate)}
        actions={
          <button onClick={() => setShowForm(true)} style={css.btnPrimary}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Novo agendamento
          </button>
        }
      />

      {/* Week navigator */}
      <div style={{ ...css.card, padding: ".6rem", marginBottom: "1.25rem", display: "flex", gap: ".3rem" }}>
        <button onClick={() => {
          const d = new Date(weekDays[0] + "T12:00:00");
          d.setDate(d.getDate() - 7);
          setSelectedDate(d.toISOString().slice(0, 10));
        }} style={{ ...css.btnGhost, padding: ".4rem .7rem" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ flex: 1, display: "flex", gap: ".25rem" }}>
          {weekDays.map(d => {
            const dt = new Date(d + "T12:00:00");
            const isToday = d === today;
            const isSel = d === selectedDate;
            const hasAppt = daysWithAppts.has(d);
            const apptCount = appointments.filter(a => a.date === d).length;
            return (
              <button key={d} onClick={() => setSelectedDate(d)}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: ".2rem",
                  padding: ".5rem .2rem", borderRadius: 10,
                  border: isSel ? `2px solid var(--teal-600, #0d9488)` : `2px solid transparent`,
                  background: isSel ? "var(--teal-600, #0d9488)" : isToday ? "var(--surface-2, #f8fafc)" : "transparent",
                  cursor: "pointer", transition: "all .15s",
                }}>
                <span style={{ fontSize: ".62rem", fontWeight: 700, textTransform: "uppercase", color: isSel ? "rgba(255,255,255,.75)" : "var(--text-3, #64748b)" }}>
                  {dayNames[dt.getDay()]}
                </span>
                <span style={{ fontSize: ".95rem", fontWeight: 900, color: isSel ? "#fff" : isToday ? "var(--teal-600, #0d9488)" : "var(--ink, #0f172a)" }}>
                  {dt.getDate()}
                </span>
                {hasAppt ? (
                  <span style={{ fontSize: ".58rem", fontWeight: 700, padding: "0 5px", borderRadius: 999, background: isSel ? "rgba(255,255,255,.25)" : "var(--teal-600, #0d9488)", color: isSel ? "#fff" : "#fff", minWidth: 16, textAlign: "center" }}>
                    {apptCount}
                  </span>
                ) : <span style={{ height: 14 }} />}
              </button>
            );
          })}
        </div>
        <button onClick={() => {
          const d = new Date(weekDays[0] + "T12:00:00");
          d.setDate(d.getDate() + 7);
          setSelectedDate(d.toISOString().slice(0, 10));
        }} style={{ ...css.btnGhost, padding: ".4rem .7rem" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Appointment list */}
      <div style={css.card}>
        {dayAppointments.length === 0 ? (
          <EmptyState icon="ðŸ“­" title="Nenhum agendamento" subtitle={`Nenhum evento marcado para ${fmtDate(selectedDate)}`}
            action={<button onClick={() => setShowForm(true)} style={{ ...css.btnPrimary, margin: "0 auto" }}>+ Agendar</button>} />
        ) : (
          <div>
            <div style={{ padding: ".75rem 1.25rem", borderBottom: "1px solid var(--border, #e2e8f0)", display: "grid", gridTemplateColumns: "56px 40px 1fr 180px auto", gap: ".75rem", alignItems: "center" }}>
              <span style={css.sectionTitle}>Hora</span>
              <span />
              <span style={css.sectionTitle}>Paciente</span>
              <span style={css.sectionTitle}>Tipo Â· Profissional</span>
              <span />
            </div>
            {dayAppointments.map((a, idx) => {
              const tc = typeColor[a.type] || DS.slate[400];
              return (
                <div key={a.id}
                  style={{ display: "grid", gridTemplateColumns: "56px 40px 1fr 180px auto", gap: ".75rem", alignItems: "center", padding: ".8rem 1.25rem", borderBottom: idx < dayAppointments.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", borderLeft: `4px solid ${tc}`, transition: "background .12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2, #f8fafc)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: ".78rem", fontWeight: 700, color: "var(--text-2, #334155)" }}>{a.time || "--:--"}</span>
                  <Avatar name={a.patientName} size={32} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>{a.patientName}</div>
                    {a.notes && <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", marginTop: ".1rem" }}>{a.notes}</div>}
                  </div>
                  <div>
                    <Badge color={tc} bg={tc + "15"} border={tc + "30"}>{typeLabel[a.type] || a.type}</Badge>
                    {a.professional && <div style={{ fontSize: ".7rem", color: "var(--text-3, #64748b)", marginTop: ".25rem" }}>{a.professional}</div>}
                  </div>
                  <div style={{ display: "flex", gap: ".35rem" }}>
                    {a.patientId && <button onClick={() => onNavigatePatient(a.patientId)} style={{ ...css.btnSecondary, padding: ".3rem .65rem", fontSize: ".72rem" }}>Ver</button>}
                    <IconBtn onClick={() => removeAppt(a.id)} danger>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </IconBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <Modal title="Novo agendamento" subtitle={`Para ${fmtDate(selectedDate)}`} onClose={() => setShowForm(false)}>
          <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <FormField label="Paciente" required>
              <PatientAutocompleteField
                patients={patients}
                search={search}
                setSearch={setSearch}
                selectedId={form.patientId}
                onSelect={(id)=>setForm(s=>({...s, patientId:id}))}
                required
              />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
              <FormField label="HorÃ¡rio" required>
                <input type="time" value={form.time} onChange={e => setForm(s => ({ ...s, time: e.target.value }))} required style={css.input} />
              </FormField>
              <FormField label="Tipo">
                <select value={form.type} onChange={e => setForm(s => ({ ...s, type: e.target.value }))} style={css.input}>
                  {Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Profissional responsável">
              <select value={form.professional} onChange={e => setForm(s => ({ ...s, professional: e.target.value }))} style={css.input}>
                <option value="">Selecionar profissional…</option>
                {users
                  .filter(u => ["doctor","dentist","nurse_manager","nursing_tech","acs","pharmacist","pharmacy_tech"].includes(String(u.role||"")))
                  .map(u => <option key={u.id} value={u.name}>{u.name} — {roleLabel(u.role)}</option>)
                }
              </select>
            </FormField>
            <FormField label="ObservaÃ§Ãµes">
              <textarea value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={2} style={{ ...css.input, resize: "vertical" }} placeholder="InstruÃ§Ãµes, preparo, observaÃ§Ãµesâ€¦" />
            </FormField>
            {error && <p style={{ color: DS.red[500], fontSize: ".8rem", margin: 0, padding: ".5rem .75rem", background: DS.red[50], borderRadius: 8, border: `1px solid ${DS.red[100]}` }}>{error}</p>}
            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowForm(false)} style={css.btnSecondary}>Cancelar</button>
              <button type="submit" disabled={busy} style={css.btnPrimary}>{busy ? "Agendandoâ€¦" : "Confirmar agendamento"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   7. CHART PAGE â€” ProntuÃ¡rio centralizado
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function ChartPage({ patients, users, user, token, onNavigatePatient }) {
  const authHeader = { "Authorization": `Bearer ${token}` };
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [filterType, setFilterType] = useState("all");

  const selectedPatient = patients.find(p => p.id === selectedId) || null;

  async function openPatient(p) {
    if (selectedId === p.id) { setSelectedId(null); setHistory([]); return; }
    setSelectedId(p.id);
    setHistory([]);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/patients/${p.id}/history`, { headers: authHeader });
      const data = res.ok ? await res.json() : [];
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
    finally { setLoadingHistory(false); }
  }

  const filtered = patients.filter(p => matchesSearch(p, search));
  const filteredHistory = history.filter(h => filterType === "all" || h.type === filterType);

  const typeInfo = {
    consultation: { label: "Consulta",  color: DS.blue[500],   icon: "ðŸ©º" },
    visit:        { label: "Visita",    color: DS.green[600],  icon: "ðŸ " },
    vaccine:      { label: "Vacina",    color: DS.purple[500], icon: "ðŸ’‰" },
    exam:         { label: "Exame",     color: DS.amber[500],  icon: "ðŸ”¬" },
    task:         { label: "Tarefa",    color: DS.slate[500],  icon: "ðŸ“‹" },
    message:      { label: "Mensagem",  color: DS.slate[400],  icon: "ðŸ’¬" },
  };

  const typeCounts = useMemo(() => {
    const c = {};
    history.forEach(h => { c[h.type] = (c[h.type] || 0) + 1; });
    return c;
  }, [history]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.25rem", padding: "1.75rem", maxWidth: 1200, margin: "0 auto", minHeight: "calc(100vh - 80px)" }}>
      {/* Sidebar â€” lista de pacientes */}
      <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
        <div style={{ ...css.card, padding: "1rem" }}>
          <div style={{ fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)", marginBottom: ".75rem", display: "flex", alignItems: "center", gap: ".5rem" }}>
            <span>ðŸ“‹</span> ProntuÃ¡rio
          </div>
          <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pacienteâ€¦" />
        </div>
        <div style={{ ...css.card, overflow: "hidden", flex: 1 }}>
          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {filtered.slice(0, 50).map(p => (
              <div key={p.id} onClick={() => openPatient(p)}
                style={{
                  display: "flex", alignItems: "center", gap: ".65rem",
                  padding: ".65rem .9rem",
                  background: selectedId === p.id ? DS.teal[50] : "transparent",
                  borderLeft: `3px solid ${selectedId === p.id ? "var(--teal-600, #0d9488)" : "transparent"}`,
                  cursor: "pointer", transition: "all .12s",
                }}
                onMouseEnter={e => { if (selectedId !== p.id) e.currentTarget.style.background = "var(--surface-2, #f8fafc)"; }}
                onMouseLeave={e => { if (selectedId !== p.id) e.currentTarget.style.background = "transparent"; }}>
                <Avatar name={p.name} size={32} color={selectedId === p.id ? "var(--teal-600, #0d9488)" : DS.slate[600]} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--ink, #0f172a)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: ".68rem", color: "var(--text-3, #64748b)" }}>{calcAge(p.birthDate) || "â€”"}{p.phone ? " Â· " + p.phone : ""}</div>
                </div>
                {selectedId === p.id && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "var(--teal-600, #0d9488)", flexShrink: 0 }}>
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--text-3, #64748b)", fontSize: ".8rem", padding: "2rem" }}>Nenhum paciente encontrado</div>}
          </div>
        </div>
      </div>

      {/* Painel principal â€” prontuÃ¡rio */}
      {selectedPatient ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* CabeÃ§alho do paciente */}
          <div style={{ ...css.card, padding: "1.25rem 1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <Avatar name={selectedPatient.name} size={52} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "var(--ink, #0f172a)", letterSpacing: "-.01em" }}>{selectedPatient.name}</div>
                <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", fontSize: ".78rem", color: "var(--text-3, #64748b)", marginTop: ".3rem" }}>
                  {calcAge(selectedPatient.birthDate) && <span>ðŸŽ‚ {calcAge(selectedPatient.birthDate)}</span>}
                  {selectedPatient.cpf && <span>CPF: {selectedPatient.cpf}</span>}
                  {selectedPatient.phone && <span>ðŸ“± {selectedPatient.phone}</span>}
                  {selectedPatient.careCategory && <Badge color={DS.teal[700]} bg={DS.teal[50]} border={DS.teal[200]}>{selectedPatient.careCategory}</Badge>}
                </div>
              </div>
              <button onClick={() => onNavigatePatient(selectedPatient.id)} style={css.btnPrimary}>
                Ver ficha completa
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Contadores de histÃ³rico */}
            {history.length > 0 && (
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border, #e2e8f0)" }}>
                <button onClick={() => setFilterType("all")}
                  style={{ ...css.btnSecondary, padding: ".25rem .65rem", fontSize: ".72rem", background: filterType === "all" ? "var(--teal-600, #0d9488)" : undefined, color: filterType === "all" ? "#fff" : undefined, borderColor: filterType === "all" ? "var(--teal-600, #0d9488)" : undefined }}>
                  Todos ({history.length})
                </button>
                {Object.entries(typeCounts).map(([type, count]) => {
                  const ti = typeInfo[type] || { label: type, color: DS.slate[500] };
                  return (
                    <button key={type} onClick={() => setFilterType(f => f === type ? "all" : type)}
                      style={{ ...css.btnSecondary, padding: ".25rem .65rem", fontSize: ".72rem", borderColor: filterType === type ? ti.color : undefined, color: filterType === type ? ti.color : undefined, background: filterType === type ? ti.color + "12" : undefined }}>
                      {ti.icon} {ti.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline de registros */}
          {loadingHistory ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3, #64748b)", fontSize: ".84rem" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: ".5rem", animation: "spin 1s linear infinite" }}>â³</div>
              Carregando prontuÃ¡rioâ€¦
            </div>
          ) : filteredHistory.length === 0 ? (
            <EmptyState icon="ðŸ“„" title={history.length === 0 ? "ProntuÃ¡rio vazio" : "Nenhum registro para este filtro"} subtitle={history.length === 0 ? "Este paciente ainda nÃ£o possui registros clÃ­nicos" : "Remova o filtro para ver todos os registros"} />
          ) : (
            <div style={{ position: "relative" }}>
              {/* Linha de timeline */}
              <div style={{ position: "absolute", left: "calc(1.5rem + 15px)", top: 0, bottom: 0, width: 2, background: "var(--border, #e2e8f0)", zIndex: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
                {filteredHistory.map((h, i) => {
                  const ti = typeInfo[h.type] || { label: h.type, color: DS.slate[500], icon: "ðŸ“„" };
                  return (
                    <div key={h.id || i} style={{ display: "flex", gap: "1rem", position: "relative", zIndex: 1 }}>
                      {/* Ãcone na timeline */}
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: ti.color + "18", border: `2px solid ${ti.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".8rem", flexShrink: 0, marginLeft: ".5rem", marginTop: ".35rem" }}>
                        {ti.icon}
                      </div>
                      <div style={{ ...css.card, padding: ".9rem 1.1rem", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".5rem", marginBottom: ".3rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>{h.title || ti.label}</span>
                            <Badge color={ti.color} bg={ti.color + "12"} border={ti.color + "25"}>{ti.label}</Badge>
                          </div>
                          <span style={{ fontSize: ".7rem", color: "var(--text-3, #64748b)", flexShrink: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
                            {fmtDate(h.date)}{h.time ? " " + h.time : ""}
                          </span>
                        </div>
                        {h.details && <div style={{ fontSize: ".8rem", color: "var(--text-2, #334155)", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{h.details}</div>}
                        {h.professionalName && (
                          <div style={{ fontSize: ".7rem", color: "var(--text-3, #64748b)", marginTop: ".4rem", display: "flex", gap: ".5rem" }}>
                            <span>Por: {h.professionalName}</span>
                            {h.professionalCouncil && <span>Â· {h.professionalCouncil}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState icon="ðŸ©º" title="Selecione um paciente" subtitle="Clique em um paciente na lista lateral para visualizar seu prontuÃ¡rio completo" />
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   5. REFERRALS PAGE â€” Encaminhamentos
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const REFERRALS_KEY = "saudeubs_referrals_v1";
const SPECIALTIES = ["Cardiologia","Neurologia","Ortopedia","Ginecologia","Urologia","Oftalmologia","Dermatologia","Psiquiatria","Endocrinologia","Gastroenterologia","Pneumologia","Nefrologia","Oncologia","Infectologia","Reumatologia","Fisioterapia","NutriÃ§Ã£o","Psicologia","Fonoaudiologia","Outro"];

export function ReferralsPage({ patients, users, user }) {
  const [referrals, setReferrals] = useState(() => readLS(REFERRALS_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: "", specialty: "", reason: "", priority: "normal", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [listSearch, setListSearch] = useState("");

  function saveReferrals(r) { setReferrals(r); writeLS(REFERRALS_KEY, r); }

  function submitForm(e) {
    e.preventDefault();
    const patient = patients.find(p => p.id === form.patientId);
    const entry = {
      id: Date.now().toString(36),
      patientId: form.patientId,
      patientName: patient?.name || "",
      specialty: form.specialty,
      reason: form.reason,
      priority: form.priority,
      notes: form.notes,
      status: "pending",
      createdAt: new Date().toISOString(),
      createdBy: user?.name || "",
    };
    saveReferrals([entry, ...referrals]);
    setForm({ patientId: "", specialty: "", reason: "", priority: "normal", notes: "" });
    setSearch(""); setShowForm(false);
  }

  function updateStatus(id, status) { saveReferrals(referrals.map(r => r.id === id ? { ...r, status } : r)); }
  function removeReferral(id) { saveReferrals(referrals.filter(r => r.id !== id)); }

  const filteredPatients = patients.filter(p => matchesSearch(p, search));

  const byStatus = {
    all: referrals.length,
    pending: referrals.filter(r => r.status === "pending").length,
    scheduled: referrals.filter(r => r.status === "scheduled").length,
    completed: referrals.filter(r => r.status === "completed").length,
    cancelled: referrals.filter(r => r.status === "cancelled").length,
  };

  const filtered = referrals.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (listSearch) {
      const q = normalizeSearch(listSearch);
      if (!normalizeSearch(r.patientName).includes(q) && !normalizeSearch(r.specialty).includes(q) && !normalizeSearch(r.reason).includes(q)) return false;
    }
    return true;
  });

  const specialtyColors = { Cardiologia: DS.red[500], Neurologia: DS.purple[500], Ortopedia: DS.amber[500], Psiquiatria: DS.blue[500], Oncologia: DS.red[700] };

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        icon="ðŸ“¤"
        title="Encaminhamentos"
        subtitle={`${referrals.length} encaminhamento(s) registrado(s)`}
        actions={
          <button onClick={() => setShowForm(true)} style={css.btnPrimary}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Novo encaminhamento
          </button>
        }
      />

      {/* Filtros + busca */}
      <div style={{ display: "flex", gap: ".75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchInput value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Buscar por paciente, especialidadeâ€¦" />
        </div>
        <div style={{ display: "flex", gap: ".3rem", padding: ".3rem", background: "var(--surface-2, #f8fafc)", borderRadius: 12, border: "1px solid var(--border, #e2e8f0)", flexWrap: "wrap" }}>
          {[["all","Todos"],["pending","Pendentes"],["scheduled","Agendados"],["completed","Realizados"],["cancelled","Cancelados"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ padding: ".35rem .75rem", borderRadius: 9, border: "none", cursor: "pointer", fontSize: ".75rem", fontWeight: 700, transition: "all .15s", background: filterStatus === v ? "var(--teal-600, #0d9488)" : "transparent", color: filterStatus === v ? "#fff" : "var(--text-3, #64748b)" }}>
              {l} <span style={{ opacity: .7 }}>({byStatus[v]})</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="ðŸ“­" title="Nenhum encaminhamento" subtitle={filterStatus === "all" ? "Clique em 'Novo encaminhamento' para registrar" : `Nenhum encaminhamento com status '${filterStatus}'`}
          action={filterStatus !== "all" && <button onClick={() => setFilterStatus("all")} style={css.btnSecondary}>Ver todos</button>} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {filtered.map(r => {
            const specColor = specialtyColors[r.specialty] || DS.teal[600];
            return (
              <div key={r.id} style={{ ...css.card, ...css.cardHover, padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,.06)"; e.currentTarget.style.transform = ""; }}>
                <Avatar name={r.patientName} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".3rem" }}>
                    <span style={{ fontWeight: 800, fontSize: ".92rem", color: "var(--ink, #0f172a)" }}>{r.patientName}</span>
                    <Badge color={specColor} bg={specColor + "12"} border={specColor + "25"}>{r.specialty}</Badge>
                    <StatusBadge status={r.status} />
                    <PriorityBadge priority={r.priority} />
                  </div>
                  <div style={{ fontSize: ".82rem", color: "var(--text-2, #334155)", marginBottom: ".2rem" }}>{r.reason}</div>
                  {r.notes && <div style={{ fontSize: ".75rem", color: "var(--text-3, #64748b)", fontStyle: "italic" }}>{r.notes}</div>}
                  <div style={{ fontSize: ".68rem", color: "var(--text-3, #64748b)", marginTop: ".35rem" }}>Por {r.createdBy} Â· {fmtDate(r.createdAt?.slice(0, 10))}</div>
                </div>
                <div style={{ display: "flex", gap: ".3rem", flexShrink: 0, flexWrap: "wrap" }}>
                  {r.status === "pending" && (
                    <button onClick={() => updateStatus(r.id, "scheduled")} style={{ ...css.btnSecondary, padding: ".3rem .7rem", fontSize: ".72rem", color: DS.blue[700], borderColor: DS.blue[200] }}>
                      Agendar
                    </button>
                  )}
                  {r.status === "scheduled" && (
                    <button onClick={() => updateStatus(r.id, "completed")} style={{ ...css.btnSecondary, padding: ".3rem .7rem", fontSize: ".72rem", color: DS.green[700], borderColor: DS.green[200] }}>
                      âœ“ Realizado
                    </button>
                  )}
                  {r.status !== "cancelled" && (
                    <button onClick={() => updateStatus(r.id, "cancelled")} style={{ ...css.btnGhost, padding: ".3rem .6rem", fontSize: ".72rem" }}>
                      Cancelar
                    </button>
                  )}
                  <IconBtn onClick={() => removeReferral(r.id)} danger>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title="Novo encaminhamento" onClose={() => setShowForm(false)}>
          <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <FormField label="Paciente" required>
              <PatientAutocompleteField
                patients={patients}
                search={search}
                setSearch={setSearch}
                selectedId={form.patientId}
                onSelect={(id)=>setForm(s=>({...s, patientId:id}))}
                required
              />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
              <FormField label="Especialidade" required>
                <select value={form.specialty} onChange={e => setForm(s => ({ ...s, specialty: e.target.value }))} required style={css.input}>
                  <option value="">Selecionarâ€¦</option>
                  {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Prioridade">
                <select value={form.priority} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))} style={css.input}>
                  <option value="elective">Eletivo</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta prioridade</option>
                  <option value="urgent">Urgente</option>
                </select>
              </FormField>
            </div>
            <FormField label="Motivo do encaminhamento" required>
              <input value={form.reason} onChange={e => setForm(s => ({ ...s, reason: e.target.value }))} required style={css.input} placeholder="Descreva o motivoâ€¦" />
            </FormField>
            <FormField label="ObservaÃ§Ãµes clÃ­nicas">
              <textarea value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={3} style={{ ...css.input, resize: "vertical" }} placeholder="HistÃ³rico relevante, exames, medicaÃ§Ãµes em usoâ€¦" />
            </FormField>
            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowForm(false)} style={css.btnSecondary}>Cancelar</button>
              <button type="submit" style={css.btnPrimary}>Registrar encaminhamento</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   10. REPORTS PAGE â€” RelatÃ³rios
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function ReportsPage({ patients, users, templates, protocolByPatient }) {
  const [reportType, setReportType] = useState("protocol");
  const [filterCat, setFilterCat] = useState("");
  const now = new Date();

  const protocolReport = useMemo(() => {
    return patients.map(p => {
      const s = protocolByPatient?.[p.id];
      const pending = s ? (s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0) : 0;
      const completed = s ? (s.completed?.visits || 0) + (s.completed?.consultations || 0) + (s.completed?.vaccines || 0) : 0;
      const acs = users.find(u => u.id === p.assignedAcsId);
      return { ...p, pending, completed, acsName: acs?.name || "Sem ACS" };
    }).filter(p => !filterCat || p.careCategory === filterCat)
      .sort((a, b) => b.pending - a.pending);
  }, [patients, protocolByPatient, users, filterCat]);

  const coverageReport = useMemo(() => {
    const acsMap = {};
    patients.forEach(p => {
      const acsId = p.assignedAcsId || "__none";
      if (!acsMap[acsId]) {
        const u = users.find(u => u.id === acsId);
        acsMap[acsId] = { name: u?.name || "Sem ACS", patients: 0, pendingTotal: 0 };
      }
      acsMap[acsId].patients++;
      const s = protocolByPatient?.[p.id];
      if (s) acsMap[acsId].pendingTotal += (s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0);
    });
    return Object.values(acsMap).sort((a, b) => b.pendingTotal - a.pendingTotal);
  }, [patients, users, protocolByPatient]);

  function exportCSV() {
    let rows = ["Nome;Categoria;ACS;PendÃªncias;Realizados"];
    protocolReport.forEach(p => rows.push([p.name, p.careCategory, p.acsName, p.pending, p.completed].join(";")));
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
    a.download = `relatorio_protocolos_${now.toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const totalPending = protocolReport.reduce((s, p) => s + p.pending, 0);
  const totalCompleted = protocolReport.reduce((s, p) => s + p.completed, 0);
  const criticalCount = protocolReport.filter(p => p.pending > 0).length;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        icon="ðŸ“Š"
        title="RelatÃ³rios"
        subtitle={`Gerado em ${now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}`}
        actions={
          <button onClick={exportCSV} style={{ ...css.btnSecondary, gap: ".4rem" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Exportar CSV
          </button>
        }
      />

      {/* KPIs de relatÃ³rio */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: ".65rem", marginBottom: "1.5rem" }}>
        <KpiCard icon="ðŸ‘¥" label="Total de pacientes" value={patients.length} color={DS.blue[500]} />
        <KpiCard icon="âš ï¸" label="Com pendÃªncias" value={criticalCount} color={criticalCount > 10 ? DS.red[500] : DS.amber[500]} />
        <KpiCard icon="âœ…" label="Realizados (total)" value={totalCompleted} color={DS.green[600]} />
        <KpiCard icon="ðŸ“‹" label="PendÃªncias (total)" value={totalPending} color={totalPending > 20 ? DS.red[500] : DS.amber[500]} />
      </div>

      {/* Tabs + filtros */}
      <div style={{ display: "flex", gap: ".75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
        <Tabs tabs={[["protocol", "Protocolos"], ["coverage", "Cobertura ACS"]]} value={reportType} onChange={setReportType} />
        {reportType === "protocol" && (
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...css.input, width: "auto", minWidth: 180 }}>
            <option value="">Todas as categorias</option>
            {templates.map(t => <option key={t.category} value={t.category}>{t.label}</option>)}
          </select>
        )}
      </div>

      {reportType === "protocol" && (
        <div style={css.card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 100px 100px", padding: ".65rem 1.25rem", background: "var(--surface-2, #f8fafc)", borderBottom: "1px solid var(--border, #e2e8f0)", gap: ".75rem" }}>
            {["Paciente", "Categoria", "ACS", "PendÃªncias", "Realizados"].map((h, i) => (
              <span key={h} style={{ ...css.sectionTitle, textAlign: i > 2 ? "right" : undefined }}>{h}</span>
            ))}
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {protocolReport.map((p, idx) => (
              <div key={p.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 100px 100px", padding: ".65rem 1.25rem", borderBottom: idx < protocolReport.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", gap: ".75rem", alignItems: "center", transition: "background .12s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2, #f8fafc)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", alignItems: "center", gap: ".55rem" }}>
                  <Avatar name={p.name} size={28} color={DS.slate[600]} />
                  <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink, #0f172a)" }}>{p.name}</span>
                </div>
                <span style={{ fontSize: ".78rem", color: "var(--text-3, #64748b)" }}>{catLabel(templates, p.careCategory)}</span>
                <span style={{ fontSize: ".78rem", color: "var(--text-3, #64748b)" }}>{p.acsName}</span>
                <div style={{ textAlign: "right" }}>
                  {p.pending > 0 ? (
                    <Badge color={DS.red[700]} bg={DS.red[50]} border={DS.red[100]}>{p.pending}</Badge>
                  ) : (
                    <Badge color={DS.green[700]} bg={DS.green[50]} border={DS.green[100]}>0</Badge>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--text-2, #334155)" }}>{p.completed}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: ".65rem 1.25rem", background: "var(--surface-2, #f8fafc)", borderTop: "1px solid var(--border, #e2e8f0)", display: "flex", gap: "1.5rem", fontSize: ".78rem" }}>
            <span>Total: <strong style={{ color: "var(--ink, #0f172a)" }}>{protocolReport.length}</strong> pacientes</span>
            <span>PendÃªncias: <strong style={{ color: DS.red[500] }}>{totalPending}</strong></span>
            <span>Realizados: <strong style={{ color: DS.green[600] }}>{totalCompleted}</strong></span>
          </div>
        </div>
      )}

      {reportType === "coverage" && (
        <div style={css.card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", padding: ".65rem 1.25rem", background: "var(--surface-2, #f8fafc)", borderBottom: "1px solid var(--border, #e2e8f0)", gap: ".75rem" }}>
            {["ACS", "Pacientes", "PendÃªncias total"].map((h, i) => (
              <span key={h} style={{ ...css.sectionTitle, textAlign: i > 0 ? "right" : undefined }}>{h}</span>
            ))}
          </div>
          {coverageReport.map((row, i) => {
            const maxPatients = Math.max(...coverageReport.map(r => r.patients), 1);
            const pct = (row.patients / maxPatients) * 100;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 140px", padding: ".75rem 1.25rem", borderBottom: i < coverageReport.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", gap: ".75rem", alignItems: "center", transition: "background .12s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2, #f8fafc)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ display: "flex", alignItems: "center", gap: ".65rem" }}>
                  <Avatar name={row.name} size={30} color={DS.teal[600]} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink, #0f172a)" }}>{row.name}</div>
                    <div style={{ width: 100, height: 5, background: "var(--surface-2, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 999, marginTop: ".3rem", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: "var(--teal-600, #0d9488)", borderRadius: 999 }} />
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 700, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>{row.patients}</div>
                <div style={{ textAlign: "right" }}>
                  {row.pendingTotal > 0 ? (
                    <Badge color={DS.red[700]} bg={DS.red[50]} border={DS.red[100]}>{row.pendingTotal}</Badge>
                  ) : (
                    <Badge color={DS.green[700]} bg={DS.green[50]} border={DS.green[100]}>0</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   8. INSUMO PAGE â€” Materiais e Insumos
   LÃ³gica de recorrÃªncia: enfermeira libera, farmacÃªutico controla estoque
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const INSUMOS_KEY     = "saudeubs_insumos_v1";
const RECURRING_KEY   = "saudeubs_recurring_v1";    // { patientId: [{insumoId, qty, notes, addedBy, addedAt}] }
const DELIVERIES_KEY  = "saudeubs_deliveries_v1";   // histÃ³rico de entregas

const DEFAULT_INSUMOS = [
  { id: "i1", name: "Luvas descartÃ¡veis (caixa)", unit: "cx", qty: 10, minQty: 3, category: "EPI" },
  { id: "i2", name: "MÃ¡scara cirÃºrgica (caixa)", unit: "cx", qty: 5, minQty: 2, category: "EPI" },
  { id: "i3", name: "Seringa 3mL", unit: "un", qty: 200, minQty: 50, category: "Material clÃ­nico" },
  { id: "i4", name: "Agulha 25x7", unit: "un", qty: 150, minQty: 50, category: "Material clÃ­nico" },
  { id: "i5", name: "AlgodÃ£o (rolo)", unit: "un", qty: 8, minQty: 3, category: "Material clÃ­nico" },
  { id: "i6", name: "Esparadrapo", unit: "un", qty: 4, minQty: 2, category: "Material clÃ­nico" },
  { id: "i7", name: "Ãlcool 70Â° (litro)", unit: "L", qty: 6, minQty: 2, category: "Higiene" },
  { id: "i8", name: "SabÃ£o lÃ­quido (L)", unit: "L", qty: 3, minQty: 1, category: "Higiene" },
];
const CATEGORIES_OPTIONS = ["EPI", "Material clÃ­nico", "Higiene", "Medicamento", "Equipamento", "Outro"];

export function InsumoPage({ patients, users, user }) {
  const [items, setItems]         = useState(() => readLS(INSUMOS_KEY, DEFAULT_INSUMOS));
  const [recurring, setRecurring] = useState(() => readLS(RECURRING_KEY, {}));   // { patientId: [{insumoId, qty, notes}] }
  const [deliveries, setDeliveries] = useState(() => readLS(DELIVERIES_KEY, []));
  const [activeTab, setActiveTab] = useState("stock");
  const [search, setSearch]       = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [form, setForm]           = useState({ name: "", unit: "un", qty: 0, minQty: 0, category: "Material clÃ­nico" });
  const [showAdjust, setShowAdjust] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  // Modal de paciente recorrente (enfermeira apenas)
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringPatient, setRecurringPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [recurringForm, setRecurringForm] = useState({ insumoId: "", qty: 1, notes: "" });

  // Modal de entrega mensal (enfermeira)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryPatient, setDeliveryPatient] = useState(null);

  function saveItems(i) { setItems(i); writeLS(INSUMOS_KEY, i); }
  function saveRecurring(r) { setRecurring(r); writeLS(RECURRING_KEY, r); }
  function saveDeliveries(d) { setDeliveries(d); writeLS(DELIVERIES_KEY, d); }

  function submitForm(e) {
    e.preventDefault();
    if (editItem) {
      saveItems(items.map(i => i.id === editItem.id ? { ...i, ...form, qty: Number(form.qty), minQty: Number(form.minQty) } : i));
    } else {
      saveItems([...items, { ...form, id: Date.now().toString(36), qty: Number(form.qty), minQty: Number(form.minQty) }]);
    }
    setShowForm(false); setEditItem(null);
    setForm({ name: "", unit: "un", qty: 0, minQty: 0, category: "Material clÃ­nico" });
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({ name: item.name, unit: item.unit, qty: item.qty, minQty: item.minQty, category: item.category });
    setShowForm(true);
  }

  function applyAdjust() {
    if (!showAdjust) return;
    const newQty = Math.max(0, Number(showAdjust.qty) + Number(adjustDelta));
    saveItems(items.map(i => i.id === showAdjust.id ? { ...i, qty: newQty } : i));
    setShowAdjust(null); setAdjustDelta(0); setAdjustReason("");
  }

  // Adicionar insumo ao paciente recorrente (sÃ³ enfermeira)
  function addRecurringItem(e) {
    e.preventDefault();
    if (!recurringPatient || !recurringForm.insumoId) return;
    const pid = recurringPatient.id;
    const existing = recurring[pid] || [];
    // Evita duplicar insumo
    if (existing.find(r => r.insumoId === recurringForm.insumoId)) {
      const updated = existing.map(r => r.insumoId === recurringForm.insumoId ? { ...r, qty: Number(recurringForm.qty), notes: recurringForm.notes } : r);
      saveRecurring({ ...recurring, [pid]: updated });
    } else {
      saveRecurring({ ...recurring, [pid]: [...existing, { insumoId: recurringForm.insumoId, qty: Number(recurringForm.qty), notes: recurringForm.notes, addedBy: user?.name, addedAt: new Date().toISOString() }] });
    }
    setRecurringForm({ insumoId: "", qty: 1, notes: "" });
  }

  // Remover insumo do paciente recorrente
  function removeRecurringItem(patientId, insumoId) {
    const existing = (recurring[patientId] || []).filter(r => r.insumoId !== insumoId);
    if (existing.length === 0) {
      const { [patientId]: _, ...rest } = recurring;
      saveRecurring(rest);
    } else {
      saveRecurring({ ...recurring, [patientId]: existing });
    }
  }

  // Desmarcar paciente como recorrente completamente
  function removeAllRecurring(patientId) {
    const { [patientId]: _, ...rest } = recurring;
    saveRecurring(rest);
  }

  // Registrar entrega mensal de insumos ao paciente
  function registerDelivery(patient) {
    const items_to_deliver = recurring[patient.id] || [];
    if (items_to_deliver.length === 0) return;
    const delivery = {
      id: Date.now().toString(36),
      patientId: patient.id,
      patientName: patient.name,
      items: items_to_deliver.map(r => {
        const insumo = items.find(i => i.id === r.insumoId);
        return { insumoId: r.insumoId, name: insumo?.name || r.insumoId, qty: r.qty, unit: insumo?.unit || "un" };
      }),
      deliveredAt: new Date().toISOString(),
      deliveredBy: user?.name || "",
    };
    // Baixar do estoque
    const newItems = items.map(item => {
      const delivered = items_to_deliver.find(r => r.insumoId === item.id);
      if (delivered) return { ...item, qty: Math.max(0, item.qty - Number(delivered.qty)) };
      return item;
    });
    saveItems(newItems);
    saveDeliveries([delivery, ...deliveries]);
    setShowDeliveryModal(false); setDeliveryPatient(null);
  }

  const categories = [...new Set(items.map(i => i.category))];
  const filtered = items.filter(i => {
    if (filterCat !== "all" && i.category !== filterCat) return false;
    if (search && !normalizeSearch(i.name).includes(normalizeSearch(search))) return false;
    return true;
  });
  const critical = items.filter(i => Number(i.qty) <= Number(i.minQty));
  const low = items.filter(i => Number(i.qty) > Number(i.minQty) && Number(i.qty) <= Number(i.minQty) * 1.5);

  const recurringPatients = Object.keys(recurring)
    .map(pid => ({ patient: patients.find(p => p.id === pid), items: recurring[pid] }))
    .filter(r => r.patient);

  const filteredPatients = patients.filter(p => matchesSearch(p, patientSearch));

  const canNurse = isManager(user) || canManage(user);
  const canPharm = isPharmacist(user) || canNurse;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        icon="ðŸ“¦"
        title="Insumos e Materiais"
        subtitle="Controle de estoque e dispensaÃ§Ã£o"
        actions={
          <div style={{ display: "flex", gap: ".5rem" }}>
            {canPharm && (
              <button onClick={() => { setEditItem(null); setForm({ name: "", unit: "un", qty: 0, minQty: 0, category: "Material clÃ­nico" }); setShowForm(true); }}
                style={css.btnPrimary}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Novo insumo
              </button>
            )}
          </div>
        }
      />

      {/* Alertas crÃ­ticos */}
      {critical.length > 0 && (
        <div style={{ background: DS.red[50], border: `1px solid ${DS.red[100]}`, borderRadius: 14, padding: "1rem 1.25rem", marginBottom: "1.25rem", display: "flex", alignItems: "flex-start", gap: ".85rem" }}>
          <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>ðŸš¨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: ".88rem", color: DS.red[700], marginBottom: ".25rem" }}>Estoque crÃ­tico â€” {critical.length} item(s)</div>
            <div style={{ fontSize: ".8rem", color: DS.red[700] }}>{critical.map(i => i.name).join(" Â· ")}</div>
          </div>
        </div>
      )}
      {low.length > 0 && critical.length === 0 && (
        <div style={{ background: DS.amber[50], border: `1px solid ${DS.amber[100]}`, borderRadius: 14, padding: ".85rem 1.25rem", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
          <span>âš ï¸</span>
          <span style={{ fontSize: ".82rem", fontWeight: 700, color: DS.amber[700] }}>{low.length} item(s) com estoque baixo: {low.map(i => i.name).join(", ")}</span>
        </div>
      )}

      {/* Tabs principais */}
      <div style={{ marginBottom: "1.25rem" }}>
        <Tabs
          tabs={[
            ["stock", "Estoque", items.length],
            ["recurring", "Pacientes Recorrentes", recurringPatients.length],
            ["history", "HistÃ³rico de Entregas", deliveries.length],
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* â”€â”€ ABA: ESTOQUE â”€â”€ */}
      {activeTab === "stock" && (
        <>
          {/* Busca + filtros */}
          <div style={{ display: "flex", gap: ".75rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar por nome do insumoâ€¦" />
            </div>
            <div style={{ display: "flex", gap: ".3rem", padding: ".3rem", background: "var(--surface-2, #f8fafc)", borderRadius: 12, border: "1px solid var(--border, #e2e8f0)", flexWrap: "wrap" }}>
              <button onClick={() => setFilterCat("all")} style={{ padding: ".35rem .75rem", borderRadius: 9, border: "none", cursor: "pointer", fontSize: ".75rem", fontWeight: 700, background: filterCat === "all" ? "var(--teal-600, #0d9488)" : "transparent", color: filterCat === "all" ? "#fff" : "var(--text-3, #64748b)" }}>Todos</button>
              {categories.map(c => (
                <button key={c} onClick={() => setFilterCat(c)} style={{ padding: ".35rem .75rem", borderRadius: 9, border: "none", cursor: "pointer", fontSize: ".75rem", fontWeight: 700, background: filterCat === c ? "var(--teal-600, #0d9488)" : "transparent", color: filterCat === c ? "#fff" : "var(--text-3, #64748b)" }}>{c}</button>
              ))}
            </div>
          </div>

          {/* Grid de insumos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: ".75rem" }}>
            {filtered.map(item => {
              const qty = Number(item.qty);
              const min = Number(item.minQty);
              const pct = min > 0 ? Math.min(100, (qty / (min * 3)) * 100) : 100;
              const isCrit = qty <= min;
              const isLow = qty <= min * 1.5 && qty > min;
              const barColor = isCrit ? DS.red[500] : isLow ? DS.amber[500] : DS.green[600];
              const statusLabel = isCrit ? (qty === 0 ? "Zerado" : "CrÃ­tico") : isLow ? "Baixo" : "OK";

              return (
                <div key={item.id} style={{ ...css.card, ...css.cardHover, padding: "1.1rem 1.2rem" }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,.09)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,.06)"; e.currentTarget.style.transform = ""; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: ".75rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: ".9rem", color: "var(--ink, #0f172a)", marginBottom: ".2rem", lineHeight: 1.3 }}>{item.name}</div>
                      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                        <Badge color={DS.slate[600]} bg={DS.slate[100]} border={DS.slate[200]}>{item.category}</Badge>
                        <Badge
                          color={isCrit ? DS.red[700] : isLow ? DS.amber[700] : DS.green[700]}
                          bg={isCrit ? DS.red[50] : isLow ? DS.amber[50] : DS.green[50]}
                          border={isCrit ? DS.red[100] : isLow ? DS.amber[100] : DS.green[100]}>
                          {statusLabel}
                        </Badge>
                      </div>
                    </div>
                    {canPharm && (
                      <div style={{ display: "flex", gap: ".2rem", marginLeft: ".5rem" }}>
                        <IconBtn onClick={() => openEdit(item)} title="Editar">
                          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                            <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                          </svg>
                        </IconBtn>
                      </div>
                    )}
                  </div>

                  {/* Quantidade */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: ".4rem", marginBottom: ".65rem" }}>
                    <span style={{ fontSize: "2rem", fontWeight: 900, color: barColor, letterSpacing: "-.02em", lineHeight: 1 }}>{qty}</span>
                    <span style={{ fontSize: ".78rem", color: "var(--text-3, #64748b)", fontWeight: 600 }}>{item.unit}</span>
                    <span style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", marginLeft: ".25rem" }}>/ mÃ­n {min} {item.unit}</span>
                  </div>

                  {/* Barra de progresso */}
                  <div style={{ height: 6, background: "var(--surface-2, #f8fafc)", borderRadius: 999, overflow: "hidden", marginBottom: ".85rem" }}>
                    <div style={{ height: "100%", width: pct + "%", background: barColor, borderRadius: 999, transition: "width .3s" }} />
                  </div>

                  {/* AÃ§Ãµes */}
                  {canPharm && (
                    <div style={{ display: "flex", gap: ".4rem" }}>
                      <button onClick={() => { setAdjustDelta(0); setShowAdjust(item); }}
                        style={{ ...css.btnSecondary, flex: 1, fontSize: ".75rem", padding: ".38rem .6rem", justifyContent: "center" }}>
                        Ajustar estoque
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* â”€â”€ ABA: PACIENTES RECORRENTES â”€â”€ */}
      {activeTab === "recurring" && (
        <div>
          {/* DescriÃ§Ã£o da funcionalidade */}
          <div style={{ background: DS.teal[50], border: `1px solid ${DS.teal[200]}`, borderRadius: 14, padding: "1rem 1.25rem", marginBottom: "1.25rem", display: "flex", gap: ".85rem" }}>
            <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>â„¹ï¸</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: ".88rem", color: DS.teal[700], marginBottom: ".2rem" }}>Pacientes com retirada mensal de insumos</div>
              <div style={{ fontSize: ".78rem", color: DS.teal[700], lineHeight: 1.5 }}>
                Pacientes recorrentes retiram os mesmos insumos todo mÃªs. A <strong>enfermeira</strong> configura os itens e quantidades, e pode desmarcar o paciente quando necessÃ¡rio. O <strong>farmacÃªutico</strong> registra a entrega e o estoque Ã© baixado automaticamente.
              </div>
            </div>
          </div>

          {/* BotÃ£o adicionar (sÃ³ enfermeira) */}
          {canNurse && (
            <div style={{ marginBottom: "1.25rem" }}>
              <button onClick={() => { setRecurringPatient(null); setPatientSearch(""); setRecurringForm({ insumoId: "", qty: 1, notes: "" }); setShowRecurringModal(true); }}
                style={css.btnPrimary}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Adicionar paciente recorrente
              </button>
            </div>
          )}

          {/* Lista de pacientes recorrentes */}
          {recurringPatients.length === 0 ? (
            <EmptyState icon="ðŸ”„" title="Nenhum paciente recorrente" subtitle="Pacientes com retirada mensal de insumos aparecerÃ£o aqui." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              {recurringPatients.map(({ patient, items: ritems }) => {
                const lastDelivery = deliveries.filter(d => d.patientId === patient.id)[0];
                const lastDate = lastDelivery ? fmtDate(lastDelivery.deliveredAt.slice(0, 10)) : null;
                return (
                  <div key={patient.id} style={{ ...css.card, padding: "1.1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                      <Avatar name={patient.name} size={42} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".3rem" }}>
                          <span style={{ fontWeight: 900, fontSize: ".95rem", color: "var(--ink, #0f172a)" }}>{patient.name}</span>
                          <Badge color={DS.teal[700]} bg={DS.teal[50]} border={DS.teal[200]}>Recorrente</Badge>
                          {lastDate && <span style={{ fontSize: ".7rem", color: "var(--text-3, #64748b)" }}>Ãšltima entrega: {lastDate}</span>}
                        </div>

                        {/* Itens do paciente */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".4rem" }}>
                          {ritems.map(r => {
                            const insumo = items.find(i => i.id === r.insumoId);
                            return (
                              <div key={r.insumoId} style={{ display: "inline-flex", alignItems: "center", gap: ".4rem", padding: ".3rem .65rem .3rem .5rem", background: "var(--surface-2, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, fontSize: ".78rem" }}>
                                <span style={{ fontWeight: 700, color: "var(--ink, #0f172a)" }}>{insumo?.name || r.insumoId}</span>
                                <span style={{ color: "var(--text-3, #64748b)" }}>Ã—{r.qty} {insumo?.unit || ""}</span>
                                {r.notes && <span style={{ color: "var(--text-3, #64748b)", fontStyle: "italic" }}>â€” {r.notes}</span>}
                                {canNurse && (
                                  <button onClick={() => removeRecurringItem(patient.id, r.insumoId)} title="Remover este insumo"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: DS.red[400], padding: "0 0 0 .2rem", fontSize: ".7rem", lineHeight: 1 }}>âœ•</button>
                                )}
                              </div>
                            );
                          })}
                          {canNurse && (
                            <button onClick={() => { setRecurringPatient(patient); setRecurringForm({ insumoId: "", qty: 1, notes: "" }); setShowRecurringModal(true); }}
                              style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", padding: ".3rem .65rem", background: "none", border: `1px dashed var(--border, #e2e8f0)`, borderRadius: 8, cursor: "pointer", fontSize: ".75rem", color: "var(--text-3, #64748b)", fontWeight: 600 }}>
                              + Insumo
                            </button>
                          )}
                        </div>
                      </div>

                      {/* AÃ§Ãµes */}
                      <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", alignItems: "flex-end" }}>
                        {/* Enfermeira pode dispensar */}
                        {canNurse && (
                          <button onClick={() => { setDeliveryPatient(patient); setShowDeliveryModal(true); }}
                            style={{ ...css.btnPrimary, fontSize: ".78rem", padding: ".4rem .85rem" }}>
                            Registrar entrega
                          </button>
                        )}
                        {/* FarmacÃªutico tambÃ©m pode dispensar */}
                        {isPharmacist(user) && !canNurse && (
                          <button onClick={() => { setDeliveryPatient(patient); setShowDeliveryModal(true); }}
                            style={{ ...css.btnSecondary, fontSize: ".78rem", padding: ".4rem .85rem" }}>
                            Dispensar
                          </button>
                        )}
                        {/* Enfermeira pode desmarcar como recorrente */}
                        {canNurse && (
                          <button onClick={() => { if (window.confirm(`Desmarcar ${patient.name} como paciente recorrente?`)) removeAllRecurring(patient.id); }}
                            style={{ ...css.btnGhost, fontSize: ".72rem", color: DS.red[400] }}>
                            Desmarcar recorrente
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ ABA: HISTÃ“RICO DE ENTREGAS â”€â”€ */}
      {activeTab === "history" && (
        <div>
          {deliveries.length === 0 ? (
            <EmptyState icon="ðŸ“œ" title="Nenhuma entrega registrada" subtitle="O histÃ³rico de dispensaÃ§Ãµes aparecerÃ¡ aqui." />
          ) : (
            <div style={css.card}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 200px 120px", padding: ".65rem 1.25rem", background: "var(--surface-2, #f8fafc)", borderBottom: "1px solid var(--border, #e2e8f0)", gap: ".75rem" }}>
                {["Paciente", "Insumos entregues", "Data", "Por"].map((h, i) => (
                  <span key={h} style={{ ...css.sectionTitle, textAlign: i > 1 ? "right" : undefined }}>{h}</span>
                ))}
              </div>
              <div style={{ maxHeight: 520, overflowY: "auto" }}>
                {deliveries.map((d, idx) => (
                  <div key={d.id}
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr 200px 120px", padding: ".75rem 1.25rem", borderBottom: idx < deliveries.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", gap: ".75rem", alignItems: "center", transition: "background .12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2, #f8fafc)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".55rem" }}>
                      <Avatar name={d.patientName} size={30} color={DS.teal[600]} />
                      <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink, #0f172a)" }}>{d.patientName}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
                      {d.items.map((it, ii) => (
                        <Badge key={ii} color={DS.teal[700]} bg={DS.teal[50]} border={DS.teal[200]}>{it.name} Ã—{it.qty}</Badge>
                      ))}
                    </div>
                    <div style={{ textAlign: "right", fontSize: ".78rem", color: "var(--text-3, #64748b)", fontFamily: "'IBM Plex Mono', monospace" }}>
                      {fmtDate(d.deliveredAt.slice(0, 10))} {d.deliveredAt.slice(11, 16)}
                    </div>
                    <div style={{ textAlign: "right", fontSize: ".78rem", color: "var(--text-3, #64748b)" }}>{d.deliveredBy || "â€”"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ MODAL: Adicionar/editar insumo â”€â”€ */}
      {showForm && (
        <Modal title={editItem ? "Editar insumo" : "Novo insumo"} onClose={() => { setShowForm(false); setEditItem(null); }}>
          <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <FormField label="Nome do insumo" required>
              <input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))} required style={css.input} placeholder="Ex: Seringa 3mL" />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
              <FormField label="Unidade">
                <input value={form.unit} onChange={e => setForm(s => ({ ...s, unit: e.target.value }))} style={css.input} placeholder="un, cx, Lâ€¦" />
              </FormField>
              <FormField label="Categoria">
                <select value={form.category} onChange={e => setForm(s => ({ ...s, category: e.target.value }))} style={css.input}>
                  {CATEGORIES_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormField>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
              <FormField label="Quantidade atual">
                <input type="number" min="0" value={form.qty} onChange={e => setForm(s => ({ ...s, qty: e.target.value }))} style={css.input} />
              </FormField>
              <FormField label="Quantidade mÃ­nima">
                <input type="number" min="0" value={form.minQty} onChange={e => setForm(s => ({ ...s, minQty: e.target.value }))} style={css.input} />
              </FormField>
            </div>
            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }} style={css.btnSecondary}>Cancelar</button>
              <button type="submit" style={css.btnPrimary}>{editItem ? "Salvar alteraÃ§Ãµes" : "Adicionar insumo"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* â”€â”€ MODAL: Ajuste de estoque â”€â”€ */}
      {showAdjust && (
        <Modal title="Ajuste de estoque" subtitle={showAdjust.name} onClose={() => { setShowAdjust(null); setAdjustDelta(0); setAdjustReason(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem", background: "var(--surface-2, #f8fafc)", borderRadius: 12 }}>
              <div>
                <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", fontWeight: 600, textTransform: "uppercase" }}>Estoque atual</div>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: "var(--ink, #0f172a)" }}>{showAdjust.qty} <span style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--text-3, #64748b)" }}>{showAdjust.unit}</span></div>
              </div>
              <div style={{ fontSize: "1.5rem", color: "var(--text-3, #64748b)" }}>â†’</div>
              <div>
                <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", fontWeight: 600, textTransform: "uppercase" }}>Novo estoque</div>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: Number(adjustDelta) < 0 ? DS.red[500] : DS.green[600] }}>
                  {Math.max(0, Number(showAdjust.qty) + Number(adjustDelta))} <span style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--text-3, #64748b)" }}>{showAdjust.unit}</span>
                </div>
              </div>
            </div>
            <FormField label="Ajuste (use nÃºmero negativo para retirada)">
              <input type="number" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)} style={css.input} placeholder="Ex: 50 (entrada) ou -10 (saÃ­da)" />
            </FormField>
            <FormField label="Motivo">
              <input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} style={css.input} placeholder="Recebimento, vencimento, usoâ€¦" />
            </FormField>
            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
              <button onClick={() => { setShowAdjust(null); setAdjustDelta(0); setAdjustReason(""); }} style={css.btnSecondary}>Cancelar</button>
              <button onClick={applyAdjust} style={css.btnPrimary}>Confirmar ajuste</button>
            </div>
          </div>
        </Modal>
      )}

      {/* â”€â”€ MODAL: Configurar insumos de paciente recorrente (ENFERMEIRA) â”€â”€ */}
      {showRecurringModal && (
        <Modal title={recurringPatient ? `Insumos de ${recurringPatient.name}` : "Adicionar paciente recorrente"} subtitle="Defina os insumos que este paciente retira mensalmente" onClose={() => setShowRecurringModal(false)} maxWidth={520}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            {/* SeleÃ§Ã£o de paciente (se nÃ£o veio prÃ©-selecionado) */}
            {!recurringPatient && (
              <>
                <FormField label="Buscar paciente">
                  <SearchInput value={patientSearch} onChange={e => setPatientSearch(e.target.value)} placeholder="Nome, CPF ou telefoneâ€¦" />
                </FormField>
                <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border, #e2e8f0)", borderRadius: 10 }}>
                  {filteredPatients.slice(0, 20).map(p => (
                    <div key={p.id} onClick={() => setRecurringPatient(p)}
                      style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".55rem .9rem", cursor: "pointer", background: recurringPatient?.id === p.id ? DS.teal[50] : "transparent", transition: "background .12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2, #f8fafc)"}
                      onMouseLeave={e => { if (recurringPatient?.id !== p.id) e.currentTarget.style.background = "transparent"; }}>
                      <Avatar name={p.name} size={28} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--ink, #0f172a)" }}>{p.name}</div>
                        <div style={{ fontSize: ".68rem", color: "var(--text-3, #64748b)" }}>{calcAge(p.birthDate) || "â€”"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {recurringPatient && (
              <>
                {/* Info do paciente selecionado */}
                <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".75rem 1rem", background: DS.teal[50], border: `1px solid ${DS.teal[200]}`, borderRadius: 10 }}>
                  <Avatar name={recurringPatient.name} size={36} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: ".9rem", color: DS.teal[700] }}>{recurringPatient.name}</div>
                    <div style={{ fontSize: ".72rem", color: DS.teal[600] }}>{calcAge(recurringPatient.birthDate) || "â€”"}</div>
                  </div>
                  {!recurring[recurringPatient.id] && (
                    <button onClick={() => setRecurringPatient(null)} style={{ ...css.btnGhost, marginLeft: "auto", fontSize: ".72rem" }}>Trocar</button>
                  )}
                </div>

                {/* Insumos jÃ¡ configurados */}
                {(recurring[recurringPatient.id] || []).length > 0 && (
                  <div>
                    <div style={{ ...css.sectionTitle, marginBottom: ".5rem" }}>Insumos configurados</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                      {(recurring[recurringPatient.id] || []).map(r => {
                        const insumo = items.find(i => i.id === r.insumoId);
                        return (
                          <div key={r.insumoId} style={{ display: "flex", alignItems: "center", gap: ".65rem", padding: ".5rem .85rem", background: "var(--surface-2, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 9 }}>
                            <div style={{ flex: 1, fontSize: ".82rem", fontWeight: 700, color: "var(--ink, #0f172a)" }}>{insumo?.name || r.insumoId}</div>
                            <span style={{ fontSize: ".78rem", color: "var(--text-3, #64748b)" }}>Ã—{r.qty} {insumo?.unit || ""}</span>
                            <button onClick={() => removeRecurringItem(recurringPatient.id, r.insumoId)} style={{ ...css.btnGhost, color: DS.red[400], padding: ".2rem .4rem" }}>âœ•</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Adicionar insumo */}
                <div style={{ borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: ".85rem" }}>
                  <div style={{ ...css.sectionTitle, marginBottom: ".5rem" }}>Adicionar insumo</div>
                  <form onSubmit={addRecurringItem} style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
                    <FormField label="Insumo" required>
                      <select value={recurringForm.insumoId} onChange={e => setRecurringForm(s => ({ ...s, insumoId: e.target.value }))} required style={css.input}>
                        <option value="">Selecionar insumoâ€¦</option>
                        {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.qty} {i.unit} em estoque)</option>)}
                      </select>
                    </FormField>
                    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: ".65rem" }}>
                      <FormField label="Qtd/mÃªs">
                        <input type="number" min="1" value={recurringForm.qty} onChange={e => setRecurringForm(s => ({ ...s, qty: Number(e.target.value) }))} style={css.input} />
                      </FormField>
                      <FormField label="ObservaÃ§Ã£o">
                        <input value={recurringForm.notes} onChange={e => setRecurringForm(s => ({ ...s, notes: e.target.value }))} style={css.input} placeholder="Ex: uso contÃ­nuo, fracionadoâ€¦" />
                      </FormField>
                    </div>
                    <button type="submit" style={{ ...css.btnPrimary, alignSelf: "flex-start" }}>+ Adicionar</button>
                  </form>
                </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowRecurringModal(false)} style={css.btnSecondary}>Fechar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* â”€â”€ MODAL: Confirmar entrega â”€â”€ */}
      {showDeliveryModal && deliveryPatient && (
        <Modal title="Confirmar entrega de insumos" subtitle={`Paciente: ${deliveryPatient.name}`} onClose={() => { setShowDeliveryModal(false); setDeliveryPatient(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ background: "var(--surface-2, #f8fafc)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: ".55rem 1rem", background: "var(--surface, #fff)", borderBottom: "1px solid var(--border, #e2e8f0)", ...css.sectionTitle }}>
                Itens a dispensar
              </div>
              {(recurring[deliveryPatient.id] || []).map(r => {
                const insumo = items.find(i => i.id === r.insumoId);
                const available = insumo ? Number(insumo.qty) : 0;
                const insufficiente = available < r.qty;
                return (
                  <div key={r.insumoId} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".65rem 1rem", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink, #0f172a)" }}>{insumo?.name || r.insumoId}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)" }}>Estoque atual: {available} {insumo?.unit || ""}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                      <span style={{ fontWeight: 800, fontSize: ".92rem", color: insufficiente ? DS.red[500] : "var(--ink, #0f172a)" }}>Ã—{r.qty}</span>
                      {insufficiente && <Badge color={DS.red[700]} bg={DS.red[50]} border={DS.red[100]}>Insuficiente</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>

            {(recurring[deliveryPatient.id] || []).some(r => { const insumo = items.find(i => i.id === r.insumoId); return insumo && Number(insumo.qty) < r.qty; }) && (
              <div style={{ background: DS.amber[50], border: `1px solid ${DS.amber[200]}`, borderRadius: 10, padding: ".75rem 1rem", fontSize: ".8rem", color: DS.amber[700], fontWeight: 600 }}>
                âš ï¸ Alguns itens podem ficar abaixo do estoque mÃ­nimo apÃ³s esta entrega.
              </div>
            )}

            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
              <button onClick={() => { setShowDeliveryModal(false); setDeliveryPatient(null); }} style={css.btnSecondary}>Cancelar</button>
              <button onClick={() => registerDelivery(deliveryPatient)} style={{ ...css.btnPrimary, background: DS.green[600] }}>
                âœ“ Confirmar entrega
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   3. TRIAGE PAGE â€” (mantida, mas com novo visual)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function TriagePage({ patients, user, token }) {
  const authHeader = { "Authorization": `Bearer ${token}` };
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ bp: "", temp: "", heartRate: "", weight: "", height: "", glucose: "", spo2: "", pain: "0", priority: "green", notes: "" });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const filtered = patients.filter(p => matchesSearch(p, search));

  const vitalsFields = [
    { key: "bp", label: "PressÃ£o arterial", placeholder: "120/80 mmHg", icon: "ðŸ©¸" },
    { key: "temp", label: "Temperatura", placeholder: "36.5 Â°C", icon: "ðŸŒ¡ï¸" },
    { key: "heartRate", label: "Freq. cardÃ­aca", placeholder: "70 bpm", icon: "ðŸ’—" },
    { key: "weight", label: "Peso", placeholder: "70 kg", icon: "âš–ï¸" },
    { key: "height", label: "Altura", placeholder: "170 cm", icon: "ðŸ“" },
    { key: "glucose", label: "Glicemia", placeholder: "mg/dL", icon: "ðŸ©¸" },
    { key: "spo2", label: "SpOâ‚‚", placeholder: "99%", icon: "ðŸ«" },
  ];

  const priorityColors = {
    red:    { label: "Vermelho â€” EmergÃªncia", text: DS.red[700], bg: DS.red[50], border: DS.red[300] },
    orange: { label: "Laranja â€” Muito urgente", text: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
    yellow: { label: "Amarelo â€” Urgente", text: DS.amber[700], bg: DS.amber[50], border: DS.amber[300] },
    green:  { label: "Verde â€” Pouco urgente", text: DS.green[700], bg: DS.green[50], border: DS.green[300] },
    blue:   { label: "Azul â€” NÃ£o urgente", text: DS.blue[700], bg: DS.blue[50], border: DS.blue[300] },
  };

  async function submitTriage(e) {
    e.preventDefault();
    if (!selectedPatient) return;
    setBusy(true);
    try {
      const details = [
        form.bp && `PA: ${form.bp}`, form.temp && `Temp: ${form.temp}`,
        form.heartRate && `FC: ${form.heartRate}`, form.weight && `Peso: ${form.weight}`,
        form.height && `Altura: ${form.height}`, form.glucose && `Glicemia: ${form.glucose}`,
        form.spo2 && `SpOâ‚‚: ${form.spo2}`, `Dor: ${form.pain}/10`,
        form.notes && `Obs: ${form.notes}`,
      ].filter(Boolean).join(" Â· ");
      await createRecord(token, selectedPatient.id, {
        type: "visit", date: new Date().toISOString().slice(0, 10),
        title: `Triagem â€” ${priorityColors[form.priority]?.label}`,
        details, conductedBy: user?.id,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setForm({ bp: "", temp: "", heartRate: "", weight: "", height: "", glucose: "", spo2: "", pain: "0", priority: "green", notes: "" });
    } catch {}
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.25rem", padding: "1.75rem", maxWidth: 1100, margin: "0 auto" }}>
      {/* Lista de pacientes */}
      <div style={{ ...css.card, padding: "1rem", display: "flex", flexDirection: "column", gap: ".75rem" }}>
        <div style={{ fontWeight: 800, fontSize: ".9rem", color: "var(--ink, #0f172a)" }}>ðŸ©º Triagem</div>
        <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pacienteâ€¦" />
        <div style={{ flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 240px)", display: "flex", flexDirection: "column", gap: ".25rem" }}>
          {filtered.slice(0, 40).map(p => (
            <div key={p.id} onClick={() => { setSelectedPatient(p); setSaved(false); }}
              style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".55rem .75rem", borderRadius: 10, cursor: "pointer", background: selectedPatient?.id === p.id ? DS.teal[50] : "transparent", borderLeft: `3px solid ${selectedPatient?.id === p.id ? "var(--teal-600, #0d9488)" : "transparent"}`, transition: "all .12s" }}
              onMouseEnter={e => { if (selectedPatient?.id !== p.id) e.currentTarget.style.background = "var(--surface-2, #f8fafc)"; }}
              onMouseLeave={e => { if (selectedPatient?.id !== p.id) e.currentTarget.style.background = "transparent"; }}>
              <Avatar name={p.name} size={30} color={selectedPatient?.id === p.id ? "var(--teal-600, #0d9488)" : DS.slate[500]} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: ".8rem", color: "var(--ink, #0f172a)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontSize: ".65rem", color: "var(--text-3, #64748b)" }}>{calcAge(p.birthDate) || "â€”"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FormulÃ¡rio de triagem */}
      {selectedPatient ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Header do paciente */}
          <div style={{ ...css.card, padding: "1.1rem 1.4rem", display: "flex", alignItems: "center", gap: "1rem" }}>
            <Avatar name={selectedPatient.name} size={44} />
            <div>
              <div style={{ fontWeight: 900, fontSize: "1.05rem", color: "var(--ink, #0f172a)" }}>{selectedPatient.name}</div>
              <div style={{ fontSize: ".75rem", color: "var(--text-3, #64748b)", display: "flex", gap: ".65rem" }}>
                {calcAge(selectedPatient.birthDate) && <span>ðŸŽ‚ {calcAge(selectedPatient.birthDate)}</span>}
                {selectedPatient.phone && <span>ðŸ“± {selectedPatient.phone}</span>}
              </div>
            </div>
            {saved && <div style={{ marginLeft: "auto", fontSize: ".8rem", color: DS.green[700], fontWeight: 700, background: DS.green[50], padding: ".3rem .75rem", borderRadius: 8, border: `1px solid ${DS.green[200]}` }}>âœ“ Triagem registrada!</div>}
          </div>

          <form onSubmit={submitTriage} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Sinais vitais */}
            <div style={{ ...css.card, padding: "1.25rem" }}>
              <div style={{ ...css.sectionTitle, marginBottom: ".9rem" }}>Sinais vitais</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: ".65rem" }}>
                {vitalsFields.map(({ key, label, placeholder, icon }) => (
                  <label key={key} style={css.label}>
                    {icon} {label}
                    <input value={form[key]} onChange={e => setForm(s => ({ ...s, [key]: e.target.value }))} placeholder={placeholder} style={css.input} />
                  </label>
                ))}
              </div>
            </div>

            {/* Dor e classificaÃ§Ã£o */}
            <div style={{ ...css.card, padding: "1.25rem" }}>
              <div style={{ ...css.sectionTitle, marginBottom: ".9rem" }}>AvaliaÃ§Ã£o</div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={css.label}>
                  Escala de dor (0â€“10): <strong style={{ fontSize: "1.1rem", color: "var(--ink, #0f172a)" }}>{form.pain}</strong>
                  <input type="range" min="0" max="10" value={form.pain} onChange={e => setForm(s => ({ ...s, pain: e.target.value }))} style={{ width: "100%", accentColor: "var(--teal-600, #0d9488)" }} />
                </label>
              </div>
              <div>
                <div style={{ ...css.label, marginBottom: ".5rem" }}>ClassificaÃ§Ã£o de risco (Manchester)</div>
                <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                  {Object.entries(priorityColors).map(([key, c]) => (
                    <button key={key} type="button" onClick={() => setForm(s => ({ ...s, priority: key }))}
                      style={{ padding: ".4rem .85rem", borderRadius: 9, border: `2px solid ${form.priority === key ? c.text : c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: ".75rem", fontWeight: 800, opacity: form.priority === key ? 1 : .7, transition: "all .15s" }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{ ...css.label, marginTop: "1rem" }}>
                Queixa principal / observaÃ§Ãµes
                <textarea value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={3} placeholder="Motivo da consulta, alergias, medicaÃ§Ãµes em usoâ€¦" style={{ ...css.input, resize: "vertical" }} />
              </label>
            </div>

            <button type="submit" disabled={busy} style={{ ...css.btnPrimary, alignSelf: "flex-start", fontSize: ".88rem", padding: ".6rem 1.4rem" }}>
              {busy ? "Salvandoâ€¦" : "âœ“ Salvar triagem"}
            </button>
          </form>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState icon="ðŸ©º" title="Selecione um paciente" subtitle="Clique em um paciente na lista para iniciar a triagem" />
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   6. ACS TASKS PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function AcsTasksPage({ patients, users, user, token, onNavigatePatient }) {
  const authHeader = { "Authorization": `Bearer ${token}` };
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: "", title: "", notes: "", dueDate: "", assigneeId: "" });
  const [patientSearch, setPatientSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const myPatients = isAcs(user) ? patients.filter(p => p.assignedAcsId === user?.id) : patients;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const data = await listTasks(token); setTasks(Array.isArray(data) ? data : []); } catch { setTasks([]); }
      setLoading(false);
    })();
  }, [token]);

  async function submitForm(e) {
    e.preventDefault();
    if (!form.patientId || !form.title) { setError("Preencha paciente e tÃ­tulo."); return; }
    setBusy(true); setError("");
    try {
      const patient = patients.find(p => p.id === form.patientId);
      const newTask = await createTask(token, form.patientId, {
        title: form.title, notes: form.notes, dueDate: form.dueDate,
        assigneeId: form.assigneeId || user?.id,
      });
      const enriched = { ...newTask, patientName: patient?.name || "", status: "pending" };
      setTasks(prev => [enriched, ...prev]);
      setShowForm(false);
      setForm({ patientId: "", title: "", notes: "", dueDate: "", assigneeId: "" });
      setPatientSearch("");
    } catch (err) { setError(err.message || "Erro ao criar tarefa."); }
    finally { setBusy(false); }
  }

  async function changeStatus(task, status) {
    try {
      await updateTaskStatus(token, task.id, status);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    } catch {}
  }

  const filtered = tasks.filter(t => {
    if (filterStatus === "all") return true;
    return t.status === filterStatus;
  });

  const counts = { all: tasks.length, pending: tasks.filter(t => t.status === "pending").length, in_progress: tasks.filter(t => t.status === "in_progress").length, done: tasks.filter(t => t.status === "done").length };

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader
        icon="âœ…"
        title="Tarefas ACS"
        subtitle={`${counts.pending} pendentes Â· ${counts.in_progress} em andamento`}
        actions={
          <button onClick={() => setShowForm(true)} style={css.btnPrimary}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Nova tarefa
          </button>
        }
      />

      <div style={{ marginBottom: "1.25rem" }}>
        <Tabs tabs={[["all","Todas",counts.all],["pending","Pendentes",counts.pending],["in_progress","Em andamento",counts.in_progress],["done","ConcluÃ­das",counts.done]]} value={filterStatus} onChange={setFilterStatus} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3, #64748b)" }}>â³ Carregando tarefasâ€¦</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="ðŸ“‹" title="Nenhuma tarefa" subtitle={filterStatus === "all" ? "Crie a primeira tarefa clicando em 'Nova tarefa'" : `Nenhuma tarefa com status '${filterStatus}'`} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {filtered.map(t => {
            const overdue = t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status !== "done";
            return (
              <div key={t.id} style={{ ...css.card, ...css.cardHover, padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", gap: ".85rem", borderLeft: `4px solid ${t.status === "done" ? DS.green[500] : overdue ? DS.red[400] : DS.teal[500]}` }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(15,23,42,.06)"; }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".25rem" }}>
                    <span style={{ fontWeight: 800, fontSize: ".9rem", color: "var(--ink, #0f172a)", textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span>
                    <StatusBadge status={t.status} />
                    {overdue && <Badge color={DS.red[700]} bg={DS.red[50]} border={DS.red[100]}>âš  Atrasada</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: ".65rem", fontSize: ".75rem", color: "var(--text-3, #64748b)", flexWrap: "wrap" }}>
                    {t.patientId && <button onClick={() => onNavigatePatient(t.patientId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--teal-600, #0d9488)", fontWeight: 700, fontSize: ".75rem", padding: 0 }}>{t.patientName}</button>}
                    {t.dueDate && <span>ðŸ“… {fmtDate(t.dueDate)}</span>}
                    {t.notes && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{t.notes}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: ".35rem", flexShrink: 0 }}>
                  {t.status === "pending" && <button onClick={() => changeStatus(t, "in_progress")} style={{ ...css.btnSecondary, padding: ".3rem .7rem", fontSize: ".72rem", color: DS.blue[700], borderColor: DS.blue[200] }}>Iniciar</button>}
                  {(t.status === "pending" || t.status === "in_progress") && <button onClick={() => changeStatus(t, "done")} style={{ ...css.btnSecondary, padding: ".3rem .7rem", fontSize: ".72rem", color: DS.green[700], borderColor: DS.green[200] }}>âœ“ Concluir</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal title="Nova tarefa" onClose={() => { setShowForm(false); setPatientSearch(""); }}>
          <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <FormField label="Paciente" required>
              <PatientAutocompleteField
                patients={myPatients}
                search={patientSearch}
                setSearch={setPatientSearch}
                selectedId={form.patientId}
                onSelect={(id) => setForm(s => ({ ...s, patientId: id }))}
                required
              />
            </FormField>
            <FormField label="TÃ­tulo da tarefa" required>
              <input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} required style={css.input} placeholder="Descreva a tarefaâ€¦" />
            </FormField>
            <FormField label="ObservaÃ§Ãµes">
              <textarea value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={2} style={{ ...css.input, resize: "vertical" }} placeholder="Detalhes adicionaisâ€¦" />
            </FormField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
              <FormField label="Prazo">
                <input type="date" value={form.dueDate} onChange={e => setForm(s => ({ ...s, dueDate: e.target.value }))} style={css.input} />
              </FormField>
              <FormField label="ResponsÃ¡vel">
                <select value={form.assigneeId} onChange={e => setForm(s => ({ ...s, assigneeId: e.target.value }))} style={css.input}>
                  <option value="">Minha tarefa</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} â€“ {roleLabel(u.role)}</option>)}
                </select>
              </FormField>
            </div>
            {error && <p style={{ color: DS.red[500], fontSize: ".8rem", margin: 0, padding: ".5rem .75rem", background: DS.red[50], borderRadius: 8 }}>{error}</p>}
            <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowForm(false); setPatientSearch(""); }} style={css.btnSecondary}>Cancelar</button>
              <button type="submit" disabled={busy} style={css.btnPrimary}>{busy ? "Criandoâ€¦" : "Criar tarefa"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   9. GESTOR PAGE (stub â€” mantido funcional)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function GestorPage({ patients, users, user, templates, protocolByPatient }) {
  const [activeTab, setActiveTab] = useState("overview");

  const totalPatients = patients.length;
  const criticalPatients = useMemo(() => {
    return patients.filter(p => {
      const s = protocolByPatient?.[p.id];
      if (!s) return false;
      return ((s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0)) > 0;
    });
  }, [patients, protocolByPatient]);

  const byCategory = useMemo(() => {
    const map = {};
    patients.forEach(p => { const cat = p.careCategory || "general"; map[cat] = (map[cat] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [patients]);

  const byAcs = useMemo(() => {
    const map = {};
    patients.forEach(p => {
      const acsId = p.assignedAcsId || "__none";
      if (!map[acsId]) { const u = users.find(u => u.id === acsId); map[acsId] = { name: u?.name || "Sem ACS", count: 0, critical: 0 }; }
      map[acsId].count++;
      const s = protocolByPatient?.[p.id];
      if (s && ((s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0)) > 0) map[acsId].critical++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [patients, users, protocolByPatient]);

  const kpis = [
    { icon: "ðŸ‘¥", label: "Total de pacientes", value: totalPatients, color: DS.blue[500] },
    { icon: "âš ï¸", label: "Protocolos pendentes", value: criticalPatients.length, color: criticalPatients.length > 10 ? DS.red[500] : DS.amber[500] },
    { icon: "ðŸ‘¤", label: "UsuÃ¡rios ativos", value: users.length, color: DS.purple[500] },
    { icon: "ðŸ“‹", label: "Protocolos cadastrados", value: templates.length, color: DS.green[600] },
  ];

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader icon="ðŸ›ï¸" title="Painel do Gestor" subtitle="VisÃ£o gerencial da unidade de saÃºde" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: ".65rem", marginBottom: "1.5rem" }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <Tabs tabs={[["overview","VisÃ£o geral"],["coverage","Cobertura ACS"],["categories","Categorias"]]} value={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div style={css.card}>
            <div style={{ padding: ".85rem 1.25rem", borderBottom: "1px solid var(--border, #e2e8f0)", fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>Pacientes com protocolos pendentes</div>
            <div style={{ padding: ".5rem", maxHeight: 300, overflowY: "auto" }}>
              {criticalPatients.length === 0 ? (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-3, #64748b)", fontSize: ".8rem" }}>âœ… Nenhum protocolo pendente</div>
              ) : criticalPatients.slice(0, 15).map(p => {
                const s = protocolByPatient?.[p.id];
                const pending = (s?.pending?.visits || 0) + (s?.pending?.consultations || 0) + (s?.pending?.vaccines || 0);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".5rem .75rem", borderRadius: 9, transition: "background .12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2, #f8fafc)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".55rem" }}>
                      <Avatar name={p.name} size={26} color={DS.slate[500]} />
                      <span style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--ink, #0f172a)" }}>{p.name}</span>
                    </div>
                    <Badge color={DS.red[700]} bg={DS.red[50]} border={DS.red[100]}>{pending} pend.</Badge>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={css.card}>
            <div style={{ padding: ".85rem 1.25rem", borderBottom: "1px solid var(--border, #e2e8f0)", fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>Equipe</div>
            <div style={{ padding: ".5rem" }}>
              {users.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".45rem .75rem", borderRadius: 9 }}>
                  <Avatar name={u.name} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--ink, #0f172a)" }}>{u.name}</div>
                    <div style={{ fontSize: ".68rem", color: "var(--text-3, #64748b)" }}>{roleLabel(u.role)}</div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: u.online ? DS.green[500] : DS.slate[300] }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "coverage" && (
        <div style={css.card}>
          <div style={{ padding: ".85rem 1.25rem", borderBottom: "1px solid var(--border, #e2e8f0)", fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>Cobertura por ACS</div>
          {byAcs.map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".75rem 1.25rem", borderBottom: i < byAcs.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none" }}>
              <Avatar name={row.name} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink, #0f172a)", marginBottom: ".3rem" }}>{row.name}</div>
                <div style={{ height: 6, background: "var(--surface-2, #f8fafc)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.min(100, (row.count / Math.max(...byAcs.map(r => r.count), 1)) * 100) + "%", background: "var(--teal-600, #0d9488)", borderRadius: 999 }} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 900, fontSize: ".92rem", color: "var(--ink, #0f172a)" }}>{row.count}</div>
                {row.critical > 0 && <div style={{ fontSize: ".65rem", color: DS.red[500], fontWeight: 700 }}>{row.critical} crÃ­tico(s)</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "categories" && (
        <div style={css.card}>
          <div style={{ padding: ".85rem 1.25rem", borderBottom: "1px solid var(--border, #e2e8f0)", fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)" }}>DistribuiÃ§Ã£o por categoria</div>
          {byCategory.map(([cat, count]) => {
            const tpl = templates.find(t => t.category === cat);
            const pct = totalPatients > 0 ? (count / totalPatients) * 100 : 0;
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                <div style={{ width: 130, fontSize: ".82rem", fontWeight: 700, color: "var(--ink, #0f172a)", flexShrink: 0 }}>{tpl?.label || cat}</div>
                <div style={{ flex: 1, height: 8, background: "var(--surface-2, #f8fafc)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: pct + "%", background: "var(--teal-600, #0d9488)", borderRadius: 999 }} />
                </div>
                <div style={{ minWidth: 80, textAlign: "right", fontWeight: 700, fontSize: ".82rem", color: "var(--ink, #0f172a)" }}>
                  {count} <span style={{ fontWeight: 400, color: "var(--text-3, #64748b)", fontSize: ".72rem" }}>({pct.toFixed(0)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   11. RECEPTIONIST APP â€” App dedicado de recepÃ§Ã£o (redesenhado)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function ReceptionistApp({ recUser, patients, users, templates, onLogout }) {
  const [activeTab, setActiveTab] = useState("queue");
  const [queue, setQueue] = useState(() => readLS(QUEUE_KEY, []));
  const [search, setSearch] = useState("");
  const [showQuickReg, setShowQuickReg] = useState(false);
  const [quickForm, setQuickForm] = useState({ name: "", cpf: "", phone: "", birthDate: "" });
  const [queueForm, setQueueForm] = useState({ patientId: "", reason: "", priority: "normal" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY, q); }

  const waiting = queue.filter(e => e.status === "waiting");
  const called = queue.filter(e => e.status === "called");
  const filtered = patients.filter(p => matchesSearch(p, search));

  function addToQueue(e) {
    e.preventDefault();
    if (!queueForm.patientId) { setError("Selecione um paciente."); return; }
    const patient = patients.find(p => p.id === queueForm.patientId);
    const entry = {
      id: Date.now().toString(36),
      patientId: queueForm.patientId,
      patientName: patient?.name || "",
      phone: patient?.phone || "",
      reason: queueForm.reason || "Atendimento",
      priority: queueForm.priority,
      arrivedAt: new Date().toISOString(),
      status: "waiting",
    };
    saveQueue([...queue, entry]);
    setQueueForm({ patientId: "", reason: "", priority: "normal" });
    setSearch(""); setError("");
  }

  async function registerQuick(e) {
    e.preventDefault();
    if (!quickForm.name.trim() || !quickForm.phone.trim()) { setError("Nome e telefone obrigatÃ³rios."); return; }
    setBusy(true); setError("");
    try {
      const localId = "local_" + Date.now().toString(36);
      const entry = { id: Date.now().toString(36), patientId: localId, patientName: quickForm.name.trim(), phone: quickForm.phone.trim(), reason: "Cadastro rÃ¡pido", priority: "normal", arrivedAt: new Date().toISOString(), status: "waiting", incompletePatient: true };
      saveQueue([...queue, entry]);
      setShowQuickReg(false);
      setQuickForm({ name: "", cpf: "", phone: "", birthDate: "" });
    } catch (err) { setError(err.message || "Erro ao cadastrar."); }
    finally { setBusy(false); }
  }

  const priorityColor = { urgent: DS.red[500], high: DS.amber[500], normal: DS.blue[500] };
  const priorityLabel = { urgent: "Urgente", high: "PrioritÃ¡rio", normal: "Normal" };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface, #f8fafc)", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ background: DS.slate[900], color: "#fff", padding: ".85rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `3px solid var(--teal-600, #0d9488)` }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: "1rem", letterSpacing: "-.01em" }}>SIGUS Â· RecepÃ§Ã£o</div>
          <div style={{ fontSize: ".72rem", color: DS.slate[400] }}>{recUser?.name} Â· {waiting.length} aguardando</div>
        </div>
        <button onClick={onLogout} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", color: "#fff", padding: ".35rem .85rem", borderRadius: 8, cursor: "pointer", fontSize: ".75rem", fontWeight: 600 }}>Sair</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid var(--border, #e2e8f0)", padding: "0 .5rem" }}>
        {[["queue", "Fila", waiting.length], ["patients", "Pacientes", null], ["register", "Cadastrar", null]].map(([v, l, cnt]) => (
          <button key={v} onClick={() => setActiveTab(v)}
            style={{ flex: 1, padding: ".75rem .5rem", border: "none", cursor: "pointer", fontSize: ".82rem", fontWeight: 700, background: "transparent", color: activeTab === v ? "var(--teal-600, #0d9488)" : DS.slate[400], borderBottom: `2px solid ${activeTab === v ? "var(--teal-600, #0d9488)" : "transparent"}`, transition: "all .15s" }}>
            {l}{cnt !== null && cnt !== undefined ? <span style={{ marginLeft: ".35rem", fontSize: ".65rem", background: activeTab === v ? "var(--teal-600, #0d9488)" : DS.slate[200], color: activeTab === v ? "#fff" : DS.slate[500], padding: "1px 6px", borderRadius: 999, fontWeight: 800 }}>{cnt}</span> : null}
          </button>
        ))}
      </div>

      {/* ConteÃºdo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {error && <div style={{ background: DS.red[50], border: `1px solid ${DS.red[100]}`, borderRadius: 9, padding: ".5rem .85rem", color: DS.red[700], fontSize: ".8rem", marginBottom: ".75rem", fontWeight: 600 }}>{error}</div>}

        {activeTab === "queue" && (
          <div>
            {/* Form de registro de chegada */}
            <div style={{ ...css.card, padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 800, fontSize: ".88rem", color: "var(--ink, #0f172a)", marginBottom: ".75rem" }}>Registrar chegada</div>
              <form onSubmit={addToQueue} style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                <PatientAutocompleteField
                  patients={patients}
                  search={search}
                  setSearch={setSearch}
                  selectedId={queueForm.patientId}
                  onSelect={(id)=>setQueueForm(s=>({...s, patientId:id}))}
                  required
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: ".5rem" }}>
                  <input placeholder="Motivo" value={queueForm.reason} onChange={e => setQueueForm(s => ({ ...s, reason: e.target.value }))} style={css.input} />
                  <select value={queueForm.priority} onChange={e => setQueueForm(s => ({ ...s, priority: e.target.value }))} style={{ ...css.input, width: "auto" }}>
                    <option value="normal">Normal</option><option value="high">PrioritÃ¡rio</option><option value="urgent">Urgente</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button type="submit" style={{ ...css.btnPrimary, flex: 1, justifyContent: "center" }}>+ Adicionar Ã  fila</button>
                  <button type="button" onClick={() => setShowQuickReg(true)} style={css.btnSecondary}>Novo paciente</button>
                </div>
              </form>
            </div>

            {/* Em atendimento */}
            {called.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ ...css.sectionTitle, marginBottom: ".5rem" }}>Em atendimento ({called.length})</div>
                {called.map(entry => (
                  <QueueCard key={entry.id} entry={entry} priorityColor={priorityColor} priorityLabel={priorityLabel}
                    onFinish={() => saveQueue(queue.filter(q => q.id !== entry.id))} />
                ))}
              </div>
            )}

            {/* Aguardando */}
            <div style={{ ...css.sectionTitle, marginBottom: ".5rem" }}>Aguardando ({waiting.length})</div>
            {waiting.length === 0
              ? <EmptyState icon="âœ¨" title="Fila vazia" subtitle="Nenhum paciente aguardando" />
              : waiting.map((entry, idx) => (
                <QueueCard key={entry.id} entry={entry} position={idx} priorityColor={priorityColor} priorityLabel={priorityLabel}
                  onCall={() => saveQueue(queue.map(q => q.id === entry.id ? { ...q, status: "called" } : q))}
                  onRemove={() => saveQueue(queue.filter(q => q.id !== entry.id))} />
              ))
            }
          </div>
        )}

        {activeTab === "patients" && (
          <div>
            <SearchInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar pacienteâ€¦" />
            <div style={{ marginTop: ".75rem", display: "flex", flexDirection: "column", gap: ".35rem" }}>
              {filtered.slice(0, 25).map(p => (
                <div key={p.id} style={{ ...css.card, padding: ".7rem .9rem", display: "flex", alignItems: "center", gap: ".65rem" }}>
                  <Avatar name={p.name} size={34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: ".84rem" }}>{p.name}</div>
                    <div style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)" }}>{p.phone || "â€”"} Â· {calcAge(p.birthDate) || "â€”"}</div>
                  </div>
                  <button onClick={() => { setQueueForm(s => ({ ...s, patientId: p.id })); setSearch(p.name); setActiveTab("queue"); }} style={{ ...css.btnPrimary, padding: ".3rem .7rem", fontSize: ".72rem" }}>+ Fila</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "register" && (
          <div style={{ ...css.card, padding: "1.25rem" }}>
            <div style={{ fontWeight: 800, fontSize: ".92rem", marginBottom: "1rem" }}>Cadastro rÃ¡pido de paciente</div>
            <form onSubmit={registerQuick} style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              <FormField label="Nome completo" required>
                <input value={quickForm.name} onChange={e => setQuickForm(s => ({ ...s, name: e.target.value }))} required style={css.input} placeholder="Nome completo" />
              </FormField>
              <FormField label="CPF">
                <input value={quickForm.cpf} onChange={e => setQuickForm(s => ({ ...s, cpf: formatCpf(e.target.value) }))} style={css.input} placeholder="000.000.000-00" />
              </FormField>
              <FormField label="Telefone" required>
                <input value={quickForm.phone} onChange={e => setQuickForm(s => ({ ...s, phone: e.target.value }))} required style={css.input} placeholder="(00) 00000-0000" />
              </FormField>
              <FormField label="Data de nascimento">
                <input type="date" value={quickForm.birthDate} onChange={e => setQuickForm(s => ({ ...s, birthDate: e.target.value }))} style={css.input} />
              </FormField>
              <p style={{ fontSize: ".72rem", color: "var(--text-3, #64748b)", margin: 0, lineHeight: 1.5 }}>âš  Cadastro simplificado â€” perfil deverÃ¡ ser completado pela equipe clÃ­nica.</p>
              <button type="submit" disabled={busy} style={{ ...css.btnPrimary, justifyContent: "center" }}>{busy ? "Salvandoâ€¦" : "Cadastrar e adicionar Ã  fila"}</button>
            </form>
          </div>
        )}
      </div>

      {/* Quick register modal (bottom sheet) */}
      {showQuickReg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 500, display: "flex", alignItems: "flex-end" }} onClick={() => setShowQuickReg(false)}>
          <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "1.5rem", width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.1rem" }}>
              <strong style={{ fontSize: ".95rem", fontWeight: 800 }}>Novo paciente</strong>
              <button onClick={() => setShowQuickReg(false)} style={{ ...css.btnGhost, padding: ".2rem .5rem" }}>âœ•</button>
            </div>
            <form onSubmit={registerQuick} style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
              <input placeholder="Nome *" value={quickForm.name} onChange={e => setQuickForm(s => ({ ...s, name: e.target.value }))} required style={css.input} />
              <input placeholder="Telefone *" value={quickForm.phone} onChange={e => setQuickForm(s => ({ ...s, phone: e.target.value }))} required style={css.input} />
              <button type="submit" disabled={busy} style={{ ...css.btnPrimary, justifyContent: "center" }}>{busy ? "â€¦" : "Cadastrar"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}



