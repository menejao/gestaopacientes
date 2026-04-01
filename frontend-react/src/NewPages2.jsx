/**
 * NewPages2.jsx — Revolução UI/UX · SIGUS
 * Fila/Recepção · Agendamentos · Prontuário · Encaminhamentos · Relatórios · Insumos com recorrentes
 *
 * Design: refinado, clínico, confiável — azul-ardósia como cor dominante,
 * teal como acento, tipografia DM Sans + IBM Plex Mono para dados.
 * Cada página tem identidade visual própria dentro da paleta coesa.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ─── Injeção de fontes ─────────────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("sigus-fonts-v2")) {
  const link = document.createElement("link");
  link.id = "sigus-fonts-v2";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=DM+Serif+Display:ital@0;1&display=swap";
  document.head.appendChild(link);
}

/* ─── Design tokens ─────────────────────────────────────────────── */
const T = {
  /* cores base */
  ink:       "#0d1b2a",
  ink2:      "#1b2d42",
  text2:     "#4a5568",
  text3:     "#8fa3b1",
  border:    "#dce5ed",
  borderMd:  "#b8ccd8",
  surface:   "#ffffff",
  surface2:  "#f5f8fb",
  surface3:  "#edf2f7",
  surface4:  "#e2eaf2",

  /* teal — acento primário */
  teal:      "#0d9488",
  tealL:     "#ccfbf1",
  tealD:     "#0f766e",
  teal50:    "#f0fdfa",
  teal100:   "#ccfbf1",
  teal600:   "#0d9488",
  teal700:   "#0f766e",

  /* slate-blue — identidade do sistema */
  blue:      "#1d4ed8",
  blueL:     "#dbeafe",
  blue50:    "#eff6ff",
  blue600:   "#2563eb",
  navy:      "#1e3a5f",
  navyL:     "#e8f0fb",

  /* semânticos */
  green:     "#16a34a",
  greenL:    "#dcfce7",
  green50:   "#f0fdf4",
  amber:     "#d97706",
  amberL:    "#fef3c7",
  amber50:   "#fffbeb",
  rose:      "#e11d48",
  roseL:     "#fff1f2",
  rose50:    "#fff1f2",
  indigo:    "#4f46e5",
  indigoL:   "#e0e7ff",
  purple:    "#7c3aed",
  purpleL:   "#ede9fe",
  cyan:      "#0891b2",
  cyanL:     "#cffafe",
  pink:      "#db2777",
  pinkL:     "#fce7f3",

  /* layout */
  r:         "8px",
  rMd:       "12px",
  rLg:       "16px",
  rXl:       "20px",

  /* sombras */
  shadow:    "0 1px 3px rgba(13,27,42,.07), 0 1px 2px rgba(13,27,42,.04)",
  shadowMd:  "0 4px 16px rgba(13,27,42,.10), 0 2px 6px rgba(13,27,42,.05)",
  shadowLg:  "0 20px 48px rgba(13,27,42,.14), 0 4px 12px rgba(13,27,42,.06)",

  /* tipografia */
  fontSans:  "'DM Sans', system-ui, sans-serif",
  fontMono:  "'IBM Plex Mono', monospace",
  fontSerif: "'DM Serif Display', Georgia, serif",
};

/* ─── Animações CSS globais ─────────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("sigus-anims-v2")) {
  const s = document.createElement("style");
  s.id = "sigus-anims-v2";
  s.textContent = `
    @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
    @keyframes pulse2 { 0%,100%{opacity:1} 50%{opacity:.45} }
    @keyframes spin2 { to { transform:rotate(360deg); } }
    @keyframes shimmer { 0%{background-position:-200px 0} 100%{background-position:calc(200px + 100%) 0} }
    @keyframes popIn { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .sig-fade { animation: fadeUp .25s ease both; }
    .sig-slide { animation: slideIn .2s ease both; }
    .sig-pop { animation: popIn .18s cubic-bezier(.34,1.56,.64,1) both; }
    .sig-btn:hover { filter: brightness(.94); transform: translateY(-1px); }
    .sig-btn { transition: filter .15s, transform .15s, box-shadow .15s; }
    .sig-card { transition: box-shadow .2s, border-color .2s, transform .15s; }
    .sig-card:hover { transform: translateY(-1px); }
    .sig-row:hover { background: ${T.surface2} !important; }
    .sig-chip { transition: all .15s; }
    .sig-chip:hover { filter: brightness(.92); transform: scale(1.03); }
    * { font-family: 'DM Sans', system-ui, sans-serif; box-sizing: border-box; }
    ::-webkit-scrollbar { width:6px; height:6px; }
    ::-webkit-scrollbar-track { background:#f5f8fb; }
    ::-webkit-scrollbar-thumb { background:#b8ccd8; border-radius:3px; }
    ::-webkit-scrollbar-thumb:hover { background:#8fa3b1; }
  `;
  document.head.appendChild(s);
}

/* ─── Utilitários ───────────────────────────────────────────────── */
function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtDateTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function fmtTime(s) {
  if (!s) return "—";
  return String(s).slice(11, 16) || s;
}
function calcAge(b) {
  if (!b) return null;
  const bd = new Date(b + "T12:00:00");
  const now = new Date();
  let y = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) y--;
  return y;
}
function initials(name) {
  return String(name || "?").trim().split(" ").filter(Boolean).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
}
function roleLabel(role) {
  return ({
    nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS",
    pharmacist: "Farmacêutico(a)", pharmacy_tech: "Téc. Farmácia",
    nursing_tech: "Téc. Enfermagem", receptionist: "Recepcionista",
    dentist: "Dentista", gestor: "Gestor(a) UBS",
  })[String(role || "").toLowerCase()] || role || "—";
}
function catLabel(cat) {
  const c = String(cat || "").toLowerCase();
  const allowed = new Set(["general", "pregnant", "puerperal", "child_followup", "elderly", "chronic"]);
  const normalized = allowed.has(c) ? c : "general";
  return ({
    pregnant: "Gestante", child_followup: "Puericultura", chronic: "Crônico",
    puerperal: "Puérpera", general: "Geral", elderly: "Pessoa Idosa",
  })[normalized] || normalized || "Geral";
}
function catColor(cat) {
  const c = String(cat || "").toLowerCase();
  const allowed = new Set(["general", "pregnant", "puerperal", "child_followup", "elderly", "chronic"]);
  const normalized = allowed.has(c) ? c : "general";
  return ({
    pregnant: "#db2777", child_followup: "#0891b2", chronic: "#d97706",
    puerperal: "#7c3aed", general: "#4f46e5", elderly: "#0ea5e9",
  })[normalized] || T.text3;
}

/* ─── Componentes base ──────────────────────────────────────────── */

function Avatar({ name, size = 40, color, style: s = {} }) {
  const bg = color || T.teal;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: bg + "18", border: `2px solid ${bg}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.32, fontWeight: 800, color: bg, letterSpacing: "-.01em",
      fontFamily: T.fontSans, ...s,
    }}>
      {initials(name)}
    </div>
  );
}

function Chip({ label, color = T.teal, bg, dot, onClick, style: s = {} }) {
  return (
    <span
      onClick={onClick}
      className={onClick ? "sig-chip" : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: ".3rem",
        padding: ".2rem .6rem", borderRadius: 99, fontSize: ".7rem", fontWeight: 700,
        letterSpacing: ".025em", color, background: bg || color + "18",
        border: `1px solid ${color}28`, cursor: onClick ? "pointer" : undefined,
        userSelect: "none", ...s,
      }}
    >
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />}
      {label}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled, style: s = {}, type = "button", fullWidth }) {
  const sizes = {
    sm: { padding: ".3rem .75rem", fontSize: ".75rem" },
    md: { padding: ".5rem 1.1rem", fontSize: ".82rem" },
    lg: { padding: ".65rem 1.5rem", fontSize: ".88rem" },
  };
  const variants = {
    primary: { background: T.teal, color: "#fff", border: "none" },
    secondary: { background: T.surface, color: T.text2, border: `1px solid ${T.border}` },
    danger:  { background: T.rose, color: "#fff", border: "none" },
    ghost:   { background: "transparent", color: T.text2, border: "none" },
    navy:    { background: T.navy, color: "#fff", border: "none" },
    outline: { background: "transparent", color: T.teal, border: `1.5px solid ${T.teal}` },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="sig-btn"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: ".4rem", borderRadius: T.r, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .55 : 1,
        fontFamily: T.fontSans, width: fullWidth ? "100%" : undefined,
        ...sizes[size], ...variants[variant], ...s,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style: s = {}, hover, onClick, className }) {
  return (
    <div
      onClick={onClick}
      className={`sig-card${hover ? "" : ""} ${className || ""}`}
      style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: T.rMd, boxShadow: T.shadow,
        cursor: onClick ? "pointer" : undefined, ...s,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, color = T.teal, bg, sub, style: s = {} }) {
  return (
    <Card style={{ padding: "1rem 1.15rem", flex: "1 1 120px", minWidth: 100, ...s }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".5rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1.75rem", fontWeight: 900, color, lineHeight: 1, fontFamily: T.fontSans }}>
            {value}
          </div>
          <div style={{ fontSize: ".7rem", color: T.text3, marginTop: ".25rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
          {sub && <div style={{ fontSize: ".72rem", color: T.text2, marginTop: ".2rem" }}>{sub}</div>}
        </div>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: bg || color + "18",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1rem", flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

function PageHeader({ title, sub, badge, actions, icon, color = T.teal }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      flexWrap: "wrap", gap: "1rem", marginBottom: ".25rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
        {icon && (
          <div style={{
            width: 40, height: 40, borderRadius: 12, background: color + "18",
            border: `1.5px solid ${color}30`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
          }}>
            {icon}
          </div>
        )}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900, color: T.ink, letterSpacing: "-.02em", fontFamily: T.fontSans }}>
              {title}
            </h1>
            {badge}
          </div>
          {sub && <p style={{ margin: ".2rem 0 0", fontSize: ".78rem", color: T.text3, fontWeight: 400 }}>{sub}</p>}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          {actions}
        </div>
      )}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder, style: s = {} }) {
  return (
    <div style={{ position: "relative", ...s }}>
      <svg style={{ position: "absolute", left: ".85rem", top: "50%", transform: "translateY(-50%)", color: T.text3, pointerEvents: "none" }}
        width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: ".55rem .9rem .55rem 2.35rem",
          fontSize: ".83rem", border: `1.5px solid ${T.border}`,
          borderRadius: T.r, outline: "none", fontFamily: T.fontSans,
          color: T.ink, background: T.surface2,
          transition: "border-color .15s, box-shadow .15s",
        }}
        onFocus={e => { e.target.style.borderColor = T.teal; e.target.style.boxShadow = `0 0 0 3px ${T.teal}18`; }}
        onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}

function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: "spin2 1s linear infinite" }}>
      <circle cx="12" cy="12" r="10" stroke={T.border} strokeWidth="3"/>
      <path d="M12 2a10 10 0 0110 10" stroke={T.teal} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function EmptyState({ icon, title, sub, action }) {
  return (
    <div style={{ textAlign: "center", padding: "3rem 1.5rem", color: T.text3 }} className="sig-fade">
      <div style={{ fontSize: "2.5rem", marginBottom: ".75rem", opacity: .5 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: T.text2, fontSize: ".9rem", marginBottom: ".35rem" }}>{title}</div>
      {sub && <div style={{ fontSize: ".8rem", maxWidth: 320, margin: "0 auto .75rem" }}>{sub}</div>}
      {action}
    </div>
  );
}

function Divider({ label, style: s = {} }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".75rem", ...s }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      {label && <span style={{ fontSize: ".7rem", fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: ".06em", flexShrink: 0 }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );
}

function Modal({ title, sub, onClose, children, maxWidth = 520 }) {
  useEffect(() => {
    const esc = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(13,27,42,.45)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem",
        animation: "fadeUp .18s ease",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="sig-pop"
        style={{
          background: T.surface, borderRadius: T.rLg, boxShadow: T.shadowLg,
          width: "100%", maxWidth, padding: "1.75rem",
          border: `1px solid ${T.border}`, maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.35rem" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: T.ink }}>{title}</h2>
            {sub && <p style={{ margin: ".2rem 0 0", fontSize: ".78rem", color: T.text3 }}>{sub}</p>}
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: ".2rem", color: T.text3, borderRadius: 6, marginTop: "-.1rem" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <span style={{ fontSize: ".75rem", fontWeight: 700, color: T.text2, display: "block", marginBottom: ".3rem", letterSpacing: ".015em" }}>{children}</span>;
}

function InputField({ label, children, style: s = {} }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", ...s }}>
      {label && <FieldLabel>{label}</FieldLabel>}
      {children}
    </label>
  );
}

function styledInput(extra = {}) {
  return {
    width: "100%", padding: ".55rem .85rem", fontSize: ".83rem",
    border: `1.5px solid ${T.border}`, borderRadius: T.r,
    outline: "none", fontFamily: T.fontSans, color: T.ink,
    background: T.surface, ...extra,
  };
}

function StatusBadge({ status }) {
  const map = {
    waiting:    { label: "Aguardando", color: T.amber, bg: T.amber50 },
    triage:     { label: "Triagem", color: T.indigo, bg: T.indigoL },
    in_care:    { label: "Em atendimento", color: T.teal, bg: T.teal100 },
    done:       { label: "Concluído", color: T.green, bg: T.greenL },
    missed:     { label: "Faltou", color: T.rose, bg: T.roseL },
    scheduled:  { label: "Agendado", color: T.blue, bg: T.blueL },
    canceled:   { label: "Cancelado", color: T.text3, bg: T.surface3 },
    confirmed:  { label: "Confirmado", color: T.green, bg: T.greenL },
    pending:    { label: "Pendente", color: T.amber, bg: T.amber50 },
    active:     { label: "Ativo", color: T.green, bg: T.greenL },
    inactive:   { label: "Inativo", color: T.text3, bg: T.surface3 },
    risk:       { label: "Risco", color: T.rose, bg: T.roseL },
  };
  const m = map[status] || { label: status || "—", color: T.text3, bg: T.surface3 };
  return <Chip label={m.label} color={m.color} bg={m.bg} dot />;
}

function ProgressBar({ value, max, color = T.teal, height = 6 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height, borderRadius: 99, background: T.surface3, overflow: "hidden" }}>
      <div style={{ height: "100%", borderRadius: 99, background: color, width: `${pct}%`, transition: "width .5s" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FILA / RECEPÇÃO
═══════════════════════════════════════════════════════════════════ */

const QUEUE_LS_KEY = "sigus_queue_v2";

const PRIORITIES = [
  { key: "emergency", label: "Emergência", color: T.rose, icon: "🚨", order: 0 },
  { key: "urgent",    label: "Urgente",    color: T.amber, icon: "⚡", order: 1 },
  { key: "routine",   label: "Rotina",     color: T.teal,  icon: "📋", order: 2 },
  { key: "return",    label: "Retorno",    color: T.blue,  icon: "🔄", order: 3 },
];

const DEMAND_TYPES = [
  { key: "spontaneous", label: "Demanda Espontânea" },
  { key: "scheduled",   label: "Demanda Programada" },
  { key: "emergency",   label: "Emergência/Urgência" },
];

function formatQueueTime(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${(mins % 60).toString().padStart(2, "0")}`;
}

export function QueuePageNew({ patients = [], user }) {
  const [queue, setQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(QUEUE_LS_KEY) || "[]"); } catch { return []; }
  });
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [filterPriority, setFilterPriority] = useState("all");
  const [form, setForm] = useState({ patientId: "", patientName: "", priority: "routine", demand: "spontaneous", complaint: "", notes: "" });
  const [tick, setTick] = useState(0);
  const [calledId, setCalledId] = useState(null);

  // Atualiza o timer a cada minuto
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  function saveQueue(q) { setQueue(q); localStorage.setItem(QUEUE_LS_KEY, JSON.stringify(q)); }

  function addToQueue() {
    if (!form.patientName.trim()) return;
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      ...form,
      patientName: form.patientName || patients.find(p => p.id === form.patientId)?.name || "Paciente",
      status: "waiting",
      arrivedAt: new Date().toISOString(),
      seq: queue.length + 1,
    };
    saveQueue([...queue, entry]);
    setForm({ patientId: "", patientName: "", priority: "routine", demand: "spontaneous", complaint: "", notes: "" });
    setShowModal(false);
  }

  function updateStatus(id, status) {
    saveQueue(queue.map(q => q.id === id ? { ...q, status, updatedAt: new Date().toISOString() } : q));
    if (status === "in_care") setCalledId(id);
  }

  function removeEntry(id) {
    saveQueue(queue.filter(q => q.id !== id));
  }

  const priorityMap = Object.fromEntries(PRIORITIES.map(p => [p.key, p]));

  const filtered = useMemo(() => {
    let q = [...queue];
    if (filterPriority !== "all") q = q.filter(x => x.priority === filterPriority);
    if (search) q = q.filter(x => (x.patientName || "").toLowerCase().includes(search.toLowerCase()));
    return q.sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;
      const pa = priorityMap[a.priority]?.order ?? 99;
      const pb = priorityMap[b.priority]?.order ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(a.arrivedAt) - new Date(b.arrivedAt);
    });
  }, [queue, filterPriority, search, tick]);

  const waiting    = queue.filter(q => q.status === "waiting").length;
  const inCare     = queue.filter(q => q.status === "in_care").length;
  const done       = queue.filter(q => q.status === "done").length;
  const emergency  = queue.filter(q => q.priority === "emergency" && q.status !== "done").length;

  const filtPats = useMemo(() => {
    if (!form.patientName.trim()) return patients.slice(0, 8);
    return patients.filter(p => (p.name || "").toLowerCase().includes(form.patientName.toLowerCase())).slice(0, 8);
  }, [patients, form.patientName]);

  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", fontFamily: T.fontSans }} className="sig-fade">
      <PageHeader
        title="Fila de Atendimento"
        sub="Controle de chegadas e fluxo da recepção · PNAB 2.436/2017"
        icon="🪑"
        color={T.navy}
        actions={
          <Btn onClick={() => setShowModal(true)} variant="navy" size="md">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Registrar Chegada
          </Btn>
        }
      />

      {/* KPIs */}
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <StatCard label="Aguardando" value={waiting} icon="⏳" color={T.amber} />
        <StatCard label="Em Atendimento" value={inCare} icon="🩺" color={T.teal} />
        <StatCard label="Concluídos" value={done} icon="✅" color={T.green} />
        {emergency > 0 && (
          <StatCard label="Emergências" value={emergency} icon="🚨" color={T.rose}
            style={{ border: `2px solid ${T.rose}40`, animation: "pulse2 2s infinite" }} />
        )}
      </div>

      {/* Filtros */}
      <Card style={{ padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", gap: ".85rem", flexWrap: "wrap", alignItems: "center" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar paciente na fila..." style={{ flex: "1 1 200px" }} />
          <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
            {[{ key: "all", label: "Todos" }, ...PRIORITIES].map(p => (
              <button key={p.key} onClick={() => setFilterPriority(p.key)}
                className="sig-btn"
                style={{
                  padding: ".35rem .85rem", borderRadius: 99, fontSize: ".75rem", fontWeight: 700,
                  border: filterPriority === p.key ? `1.5px solid ${p.color || T.navy}` : `1px solid ${T.border}`,
                  background: filterPriority === p.key ? (p.color || T.navy) : T.surface,
                  color: filterPriority === p.key ? "#fff" : T.text2, cursor: "pointer",
                }}>
                {p.icon && `${p.icon} `}{p.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState icon="🪑" title="Fila vazia" sub="Registre a chegada de pacientes usando o botão acima."
          action={<Btn onClick={() => setShowModal(true)} variant="outline">Registrar Chegada</Btn>} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
          {filtered.map((entry, i) => {
            const pr = priorityMap[entry.priority] || PRIORITIES[2];
            const isDone = entry.status === "done";
            const isInCare = entry.status === "in_care";
            return (
              <Card key={entry.id}
                className="sig-card sig-slide"
                style={{
                  padding: "1rem 1.25rem",
                  borderLeft: `4px solid ${isDone ? T.border : pr.color}`,
                  opacity: isDone ? .65 : 1,
                  animationDelay: `${i * .04}s`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  {/* Posição + Avatar */}
                  <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flex: "1 1 200px" }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: isDone ? T.surface3 : pr.color + "18",
                      border: `1.5px solid ${isDone ? T.border : pr.color + "40"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: ".78rem", fontWeight: 900, color: isDone ? T.text3 : pr.color, flexShrink: 0,
                    }}>
                      {isDone ? "✓" : i + 1}
                    </div>
                    <Avatar name={entry.patientName} size={38} color={isDone ? T.text3 : pr.color} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: ".88rem", color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.patientName}
                      </div>
                      <div style={{ display: "flex", gap: ".4rem", marginTop: ".2rem", flexWrap: "wrap", alignItems: "center" }}>
                        <Chip label={pr.icon + " " + pr.label} color={pr.color} />
                        <StatusBadge status={entry.status} />
                        {entry.demand && <Chip label={DEMAND_TYPES.find(d => d.key === entry.demand)?.label || entry.demand} color={T.text2} bg={T.surface3} />}
                      </div>
                      {entry.complaint && (
                        <div style={{ fontSize: ".73rem", color: T.text2, marginTop: ".25rem", fontStyle: "italic" }}>
                          "{entry.complaint}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tempo + Ações */}
                  <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexShrink: 0 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: T.fontMono, fontSize: ".82rem", fontWeight: 600, color: isDone ? T.text3 : T.ink2 }}>
                        {formatQueueTime(entry.arrivedAt)}
                      </div>
                      <div style={{ fontSize: ".68rem", color: T.text3 }}>desde {new Date(entry.arrivedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>

                    {!isDone && (
                      <div style={{ display: "flex", gap: ".35rem" }}>
                        {entry.status === "waiting" && (
                          <Btn size="sm" onClick={() => updateStatus(entry.id, "in_care")} variant="navy">
                            Chamar
                          </Btn>
                        )}
                        {isInCare && (
                          <Btn size="sm" onClick={() => updateStatus(entry.id, "done")} variant="primary">
                            Concluir
                          </Btn>
                        )}
                        <Btn size="sm" onClick={() => removeEntry(entry.id)} variant="ghost" style={{ color: T.rose }}>
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                        </Btn>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de registro */}
      {showModal && (
        <Modal title="Registrar Chegada" sub="Adicione o paciente à fila de atendimento" onClose={() => setShowModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            <InputField label="Paciente">
              <input
                style={styledInput()}
                placeholder="Nome do paciente..."
                value={form.patientName}
                onChange={e => setForm(f => ({ ...f, patientName: e.target.value, patientId: "" }))}
                onFocus={e => { e.target.style.borderColor = T.teal; e.target.style.boxShadow = `0 0 0 3px ${T.teal}18`; }}
                onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = "none"; }}
              />
              {filtPats.length > 0 && form.patientName && (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: ".25rem", boxShadow: T.shadowMd, background: T.surface, maxHeight: 180, overflowY: "auto" }}>
                  {filtPats.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => setForm(f => ({ ...f, patientId: p.id, patientName: p.name }))}
                      style={{ width: "100%", padding: ".55rem .85rem", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: ".82rem", color: T.ink, display: "flex", alignItems: "center", gap: ".6rem", borderBottom: `1px solid ${T.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <Avatar name={p.name} size={26} color={catColor(p.careCategory)} />
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      <span style={{ color: T.text3, fontSize: ".72rem" }}>{calcAge(p.birthDate)} anos</span>
                    </button>
                  ))}
                </div>
              )}
            </InputField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <InputField label="Prioridade">
                <select style={styledInput()} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
                </select>
              </InputField>
              <InputField label="Tipo de demanda">
                <select style={styledInput()} value={form.demand} onChange={e => setForm(f => ({ ...f, demand: e.target.value }))}>
                  {DEMAND_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </InputField>
            </div>

            <InputField label="Queixa principal (opcional)">
              <input style={styledInput()} placeholder="Ex: dor abdominal, febre há 2 dias..."
                value={form.complaint} onChange={e => setForm(f => ({ ...f, complaint: e.target.value }))}
                onFocus={e => { e.target.style.borderColor = T.teal; }}
                onBlur={e => { e.target.style.borderColor = T.border; }} />
            </InputField>

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginTop: ".5rem" }}>
              <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
              <Btn variant="navy" onClick={addToQueue} disabled={!form.patientName.trim()}>
                ✓ Adicionar à Fila
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   AGENDAMENTOS
═══════════════════════════════════════════════════════════════════ */

const AGENDA_LS_KEY2 = "sigus_agenda_v2";

const APPT_TYPES = [
  { key: "consultation",  label: "Consulta Médica",   color: T.blue,   icon: "🩺" },
  { key: "nursing",       label: "Enfermagem",         color: T.teal,   icon: "💊" },
  { key: "dental",        label: "Odontológica",       color: T.cyan,   icon: "🦷" },
  { key: "vaccine",       label: "Vacinação",          color: T.green,  icon: "💉" },
  { key: "exam",          label: "Coleta/Exame",       color: T.indigo, icon: "🔬" },
  { key: "return",        label: "Retorno",            color: T.purple, icon: "🔄" },
  { key: "home_visit",    label: "Visita Domiciliar",  color: T.amber,  icon: "🏠" },
];

function genCalendar(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = [];
  let day = 1 - firstDay;
  while (day <= daysInMonth) {
    const week = [];
    for (let d = 0; d < 7; d++, day++) {
      week.push(day >= 1 && day <= daysInMonth ? day : null);
    }
    rows.push(week);
  }
  return rows;
}

function isWeekendDay(year, month, day) {
  const wd = new Date(year, month, day).getDay();
  return wd === 0 || wd === 6;
}

export function AgendaPageNew({ patients = [], user, appointments = [], onCreateAppointment, onDeleteAppointment }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [view, setView] = useState("calendar"); // calendar | list
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ patientId: "", patientName: "", type: "consultation", date: today.toISOString().slice(0, 10), time: "08:00", notes: "", professional: "", status: "scheduled" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [patSearch, setPatSearch] = useState("");

  const calendar = genCalendar(year, month);
  const selectedStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;

  const allAppts = useMemo(() => {
    const base = [...appointments];
    return base.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  }, [appointments]);

  const dayAppts = useMemo(() => allAppts.filter(a => a.date === selectedStr), [allAppts, selectedStr]);

  const filtered = useMemo(() => {
    let a = allAppts;
    if (filter !== "all") a = a.filter(x => x.type === filter);
    if (search) a = a.filter(x => (x.patientName || x.summary || "").toLowerCase().includes(search.toLowerCase()));
    return a;
  }, [allAppts, filter, search]);

  const countsByDay = useMemo(() => {
    const m = {};
    allAppts.forEach(a => { m[a.date] = (m[a.date] || 0) + 1; });
    return m;
  }, [allAppts]);

  const filtPats = useMemo(() => {
    if (!patSearch.trim()) return patients.slice(0, 6);
    return patients.filter(p => (p.name || "").toLowerCase().includes(patSearch.toLowerCase())).slice(0, 6);
  }, [patients, patSearch]);

  async function submit() {
    if (!form.patientName || !form.date) { setError("Preencha paciente e data."); return; }
    setBusy(true); setError("");
    try {
      if (onCreateAppointment) {
        await onCreateAppointment({ ...form, summary: form.patientName, demandType: "scheduled" });
      }
      setShowModal(false);
      setForm({ patientId: "", patientName: "", type: "consultation", date: today.toISOString().slice(0, 10), time: "08:00", notes: "", professional: "", status: "scheduled" });
    } catch (e) {
      setError(e.message || "Erro ao criar agendamento.");
    } finally {
      setBusy(false);
    }
  }

  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const typeMap = Object.fromEntries(APPT_TYPES.map(t => [t.key, t]));

  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", fontFamily: T.fontSans }} className="sig-fade">
      <PageHeader
        title="Agendamentos"
        sub="Gestão de consultas e procedimentos · PNAB 2.436/2017"
        icon="📅"
        color={T.blue}
        actions={
          <>
            <div style={{ display: "flex", gap: ".3rem" }}>
              {["calendar", "list"].map(v => (
                <Btn key={v} size="sm" variant={view === v ? "navy" : "secondary"} onClick={() => setView(v)}>
                  {v === "calendar" ? "📆 Calendário" : "📋 Lista"}
                </Btn>
              ))}
            </div>
            <Btn onClick={() => setShowModal(true)} variant="primary">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Novo Agendamento
            </Btn>
          </>
        }
      />

      {view === "calendar" ? (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.25rem" }}>
          {/* Calendário */}
          <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <Card style={{ padding: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".85rem" }}>
                <Btn size="sm" variant="ghost" onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </Btn>
                <div style={{ fontSize: ".9rem", fontWeight: 800, color: T.ink }}>{monthNames[month]} {year}</div>
                <Btn size="sm" variant="ghost" onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px" }}>
                {["D","S","T","Q","Q","S","S"].map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: ".65rem", fontWeight: 800, color: T.text3, padding: ".25rem 0", textTransform: "uppercase" }}>{d}</div>
                ))}
                {calendar.map((week, wi) => week.map((day, di) => {
                  if (!day) return <div key={`${wi}-${di}`} />;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
                  const isSel = day === selectedDay && month === today.getMonth() || day === selectedDay;
                  const count = countsByDay[dateStr] || 0;
                  const isWeekend = isWeekendDay(year, month, day);
                  return (
                    <button key={`${wi}-${di}`} onClick={() => setSelectedDay(day)}
                      style={{
                        padding: ".35rem .2rem", borderRadius: T.r, border: "none", cursor: isWeekend ? "default" : "pointer",
                        background: isSel ? T.blue : isToday ? T.blueL : "none",
                        color: isSel ? "#fff" : isWeekend ? T.text3 : T.ink,
                        fontWeight: isToday || isSel ? 800 : 400, fontSize: ".82rem",
                        position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                        opacity: isWeekend ? .5 : 1,
                      }}>
                      {day}
                      {count > 0 && (
                        <div style={{ width: count > 1 ? 14 : 6, height: 4, borderRadius: 99, background: isSel ? "rgba(255,255,255,.7)" : T.teal, fontSize: "0" }} />
                      )}
                    </button>
                  );
                }))}
              </div>
            </Card>

            {/* Tipos de atendimento legenda */}
            <Card style={{ padding: ".85rem 1rem" }}>
              <div style={{ fontSize: ".7rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".6rem" }}>Tipos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                {APPT_TYPES.map(t => (
                  <div key={t.key} style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".75rem" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                    <span style={{ color: T.text2, fontWeight: 500 }}>{t.label}</span>
                    <span style={{ marginLeft: "auto", fontFamily: T.fontMono, fontSize: ".68rem", color: T.text3 }}>
                      {allAppts.filter(a => a.type === t.key).length}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Agendamentos do dia */}
          <Card style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: T.ink }}>
                  {selectedDay} de {monthNames[month]}
                </div>
                <div style={{ fontSize: ".75rem", color: T.text3, marginTop: ".1rem" }}>
                  {dayAppts.length} agendamento(s)
                </div>
              </div>
              <Btn size="sm" variant="outline" onClick={() => { setForm(f => ({ ...f, date: selectedStr })); setShowModal(true); }}>
                + Agendar neste dia
              </Btn>
            </div>

            {dayAppts.length === 0 ? (
              <EmptyState icon="📅" title="Nenhum agendamento" sub="Este dia está livre. Clique em '+ Agendar neste dia' para adicionar." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {dayAppts.map(appt => {
                  const t = typeMap[appt.type] || APPT_TYPES[0];
                  return (
                    <div key={appt.id} style={{
                      padding: ".85rem 1rem", borderRadius: T.r,
                      borderLeft: `4px solid ${t.color}`,
                      background: t.color + "0a",
                      border: `1px solid ${t.color}25`,
                      borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: t.color,
                      display: "flex", alignItems: "center", gap: "1rem",
                    }}>
                      <div style={{ fontSize: "1.2rem" }}>{t.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: ".88rem", color: T.ink }}>{appt.patientName || appt.summary}</div>
                        <div style={{ display: "flex", gap: ".5rem", marginTop: ".2rem", flexWrap: "wrap", alignItems: "center" }}>
                          <Chip label={t.label} color={t.color} />
                          {appt.time && <span style={{ fontFamily: T.fontMono, fontSize: ".72rem", color: T.text3 }}>{appt.time}</span>}
                          <StatusBadge status={appt.status || "scheduled"} />
                        </div>
                        {appt.notes && <div style={{ fontSize: ".72rem", color: T.text2, marginTop: ".2rem" }}>{appt.notes}</div>}
                      </div>
                      {onDeleteAppointment && (
                        <Btn size="sm" variant="ghost" style={{ color: T.rose }} onClick={() => onDeleteAppointment(appt.id)}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        </Btn>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* Vista de lista */
        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar agendamento..." style={{ flex: "1 1 200px" }} />
            <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
              {[{ key: "all", label: "Todos" }, ...APPT_TYPES].map(t => (
                <button key={t.key} onClick={() => setFilter(t.key)}
                  className="sig-btn"
                  style={{
                    padding: ".3rem .7rem", borderRadius: 99, fontSize: ".72rem", fontWeight: 700,
                    border: filter === t.key ? `1.5px solid ${t.color || T.navy}` : `1px solid ${T.border}`,
                    background: filter === t.key ? (t.color || T.navy) : T.surface,
                    color: filter === t.key ? "#fff" : T.text2, cursor: "pointer",
                  }}>
                  {t.icon ? `${t.icon} ` : ""}{t.label}
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? <EmptyState icon="📅" title="Nenhum agendamento encontrado" /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: T.surface2 }}>
                    {["Data", "Hora", "Paciente", "Tipo", "Status", "Notas", ""].map(h => (
                      <th key={h} style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((appt, i) => {
                    const t = typeMap[appt.type] || APPT_TYPES[0];
                    return (
                      <tr key={appt.id} className="sig-row" style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.surface : T.surface2 }}>
                        <td style={{ padding: ".65rem .85rem", fontFamily: T.fontMono, fontWeight: 600, color: T.ink, whiteSpace: "nowrap" }}>{fmtDate(appt.date)}</td>
                        <td style={{ padding: ".65rem .85rem", fontFamily: T.fontMono, color: T.text2 }}>{appt.time || "—"}</td>
                        <td style={{ padding: ".65rem .85rem", fontWeight: 700, color: T.ink }}>{appt.patientName || appt.summary}</td>
                        <td style={{ padding: ".65rem .85rem" }}><Chip label={`${t.icon} ${t.label}`} color={t.color} /></td>
                        <td style={{ padding: ".65rem .85rem" }}><StatusBadge status={appt.status || "scheduled"} /></td>
                        <td style={{ padding: ".65rem .85rem", color: T.text2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{appt.notes || "—"}</td>
                        <td style={{ padding: ".65rem .85rem" }}>
                          {onDeleteAppointment && (
                            <Btn size="sm" variant="ghost" style={{ color: T.rose }} onClick={() => onDeleteAppointment(appt.id)}>
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                            </Btn>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modal */}
      {showModal && (
        <Modal title="Novo Agendamento" onClose={() => { setShowModal(false); setError(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            <InputField label="Paciente">
              <input
                style={styledInput()}
                placeholder="Nome do paciente..."
                value={patSearch || form.patientName}
                onChange={e => { setPatSearch(e.target.value); setForm(f => ({ ...f, patientName: e.target.value, patientId: "" })); }}
                onFocus={e => { e.target.style.borderColor = T.teal; }}
                onBlur={e => { e.target.style.borderColor = T.border; }}
              />
              {filtPats.length > 0 && (patSearch || form.patientName) && !form.patientId && (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: ".25rem", boxShadow: T.shadowMd, background: T.surface, maxHeight: 160, overflowY: "auto" }}>
                  {filtPats.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, patientId: p.id, patientName: p.name })); setPatSearch(""); }}
                      style={{ width: "100%", padding: ".5rem .85rem", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: ".82rem", color: T.ink, display: "flex", alignItems: "center", gap: ".6rem" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <Avatar name={p.name} size={24} color={catColor(p.careCategory)} />
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </InputField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <InputField label="Data">
                <input type="date" style={styledInput()} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </InputField>
              <InputField label="Horário">
                <input type="time" style={styledInput()} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </InputField>
            </div>

            <InputField label="Tipo de atendimento">
              <select style={styledInput()} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {APPT_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
              </select>
            </InputField>

            <InputField label="Profissional responsável (opcional)">
              <input style={styledInput()} placeholder="Nome do profissional..." value={form.professional} onChange={e => setForm(f => ({ ...f, professional: e.target.value }))} />
            </InputField>

            <InputField label="Observações (opcional)">
              <textarea style={{ ...styledInput(), minHeight: 72, resize: "vertical" }} placeholder="Informações adicionais..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </InputField>

            {error && <div style={{ padding: ".55rem .85rem", borderRadius: T.r, background: T.roseL, color: T.rose, fontSize: ".8rem", fontWeight: 600 }}>⚠️ {error}</div>}

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={submit} disabled={busy}>
                {busy ? <><Spinner size={14} /> Salvando...</> : "✓ Confirmar Agendamento"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ENCAMINHAMENTOS
═══════════════════════════════════════════════════════════════════ */

const REFERRALS_LS_KEY2 = "sigus_referrals_v2";

const REFERRAL_TYPES = [
  { key: "specialist",  label: "Especialista",       color: T.indigo, icon: "🏥" },
  { key: "urgent_care", label: "Urgência/Emergência", color: T.rose,   icon: "🚨" },
  { key: "exam",        label: "Exame",               color: T.cyan,   icon: "🔬" },
  { key: "therapy",     label: "Terapia/Reabilitação",color: T.teal,   icon: "🧘" },
  { key: "social",      label: "Serviço Social",      color: T.purple, icon: "🤝" },
  { key: "mental",      label: "Saúde Mental",        color: T.pink,   icon: "🧠" },
];

const REFERRAL_STATUS = [
  { key: "open",      label: "Aberto",    color: T.amber },
  { key: "sent",      label: "Enviado",   color: T.blue },
  { key: "scheduled", label: "Agendado",  color: T.indigo },
  { key: "done",      label: "Realizado", color: T.green },
  { key: "canceled",  label: "Cancelado", color: T.text3 },
];

const PRIORITIES_REF = [
  { key: "elective",  label: "Eletivo",    color: T.teal },
  { key: "priority",  label: "Prioritário",color: T.amber },
  { key: "urgent",    label: "Urgente",    color: T.rose },
];

export function ReferralsPageNew({ patients = [], user }) {
  const [referrals, setReferrals] = useState(() => {
    try { return JSON.parse(localStorage.getItem(REFERRALS_LS_KEY2) || "[]"); } catch { return []; }
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ patientId: "", patientName: "", type: "specialist", specialty: "", destination: "", priority: "elective", reason: "", notes: "", cid10: "", status: "open" });
  const [patSearch, setPatSearch] = useState("");

  function saveReferrals(r) { setReferrals(r); localStorage.setItem(REFERRALS_LS_KEY2, JSON.stringify(r)); }

  function addReferral() {
    if (!form.patientName || !form.type) return;
    const r = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      ...form,
      createdAt: new Date().toISOString(),
      createdBy: user?.name || "Profissional",
    };
    saveReferrals([r, ...referrals]);
    setShowModal(false);
    setForm({ patientId: "", patientName: "", type: "specialist", specialty: "", destination: "", priority: "elective", reason: "", notes: "", cid10: "", status: "open" });
    setPatSearch("");
  }

  function updateStatus(id, status) {
    saveReferrals(referrals.map(r => r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r));
  }

  function deleteReferral(id) { saveReferrals(referrals.filter(r => r.id !== id)); setSelected(null); }

  const typeMap = Object.fromEntries(REFERRAL_TYPES.map(t => [t.key, t]));
  const statusMap = Object.fromEntries(REFERRAL_STATUS.map(s => [s.key, s]));
  const prioMap = Object.fromEntries(PRIORITIES_REF.map(p => [p.key, p]));

  const filtered = useMemo(() => {
    let r = [...referrals];
    if (filter !== "all") r = r.filter(x => x.status === filter);
    if (search) r = r.filter(x => (x.patientName || "").toLowerCase().includes(search.toLowerCase()) || (x.specialty || "").toLowerCase().includes(search.toLowerCase()) || (x.destination || "").toLowerCase().includes(search.toLowerCase()));
    return r.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [referrals, filter, search]);

  const filtPats = useMemo(() => {
    if (!patSearch.trim()) return patients.slice(0, 6);
    return patients.filter(p => (p.name || "").toLowerCase().includes(patSearch.toLowerCase())).slice(0, 6);
  }, [patients, patSearch]);

  const open   = referrals.filter(r => r.status === "open").length;
  const sent   = referrals.filter(r => r.status === "sent").length;
  const done   = referrals.filter(r => r.status === "done").length;
  const urgent = referrals.filter(r => r.priority === "urgent" && r.status !== "done").length;

  const canCreate = ["nurse_manager", "doctor", "dentist"].includes(user?.role);

  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", fontFamily: T.fontSans }} className="sig-fade">
      <PageHeader
        title="Encaminhamentos"
        sub="Gestão de referências e contrarreferências · RAS · PNAB"
        icon="➡️"
        color={T.indigo}
        actions={canCreate && (
          <Btn onClick={() => setShowModal(true)} variant="primary">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Novo Encaminhamento
          </Btn>
        )}
      />

      {/* Stats */}
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <StatCard label="Abertos" value={open} icon="📋" color={T.amber} />
        <StatCard label="Enviados" value={sent} icon="📤" color={T.blue} />
        <StatCard label="Realizados" value={done} icon="✅" color={T.green} />
        {urgent > 0 && <StatCard label="Urgentes" value={urgent} icon="🚨" color={T.rose} />}
      </div>

      {/* Filtros + busca */}
      <Card style={{ padding: "1rem 1.25rem" }}>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente, especialidade..." style={{ flex: "1 1 200px" }} />
          <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
            {[{ key: "all", label: "Todos" }, ...REFERRAL_STATUS].map(s => (
              <button key={s.key} onClick={() => setFilter(s.key)}
                className="sig-btn"
                style={{
                  padding: ".3rem .75rem", borderRadius: 99, fontSize: ".72rem", fontWeight: 700,
                  border: filter === s.key ? `1.5px solid ${s.color || T.navy}` : `1px solid ${T.border}`,
                  background: filter === s.key ? (s.color || T.navy) : T.surface,
                  color: filter === s.key ? "#fff" : T.text2, cursor: "pointer",
                }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState icon="➡️" title="Nenhum encaminhamento" sub="Crie encaminhamentos a partir do prontuário ou usando o botão acima."
          action={canCreate && <Btn onClick={() => setShowModal(true)} variant="outline">Novo Encaminhamento</Btn>} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
          {filtered.map(ref => {
            const t = typeMap[ref.type] || REFERRAL_TYPES[0];
            const s = statusMap[ref.status] || REFERRAL_STATUS[0];
            const p = prioMap[ref.priority] || PRIORITIES_REF[0];
            return (
              <Card key={ref.id} hover onClick={() => setSelected(selected?.id === ref.id ? null : ref)}
                style={{ padding: "1rem 1.25rem", borderLeft: `4px solid ${t.color}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: t.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>
                    {t.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: ".9rem", color: T.ink }}>{ref.patientName}</div>
                    <div style={{ display: "flex", gap: ".4rem", marginTop: ".25rem", flexWrap: "wrap", alignItems: "center" }}>
                      <Chip label={t.label} color={t.color} />
                      {ref.specialty && <Chip label={ref.specialty} color={T.text2} bg={T.surface3} />}
                      <Chip label={p.label} color={p.color} dot />
                      <Chip label={s.label} color={s.color} bg={s.color + "18"} dot />
                    </div>
                    {ref.reason && <div style={{ fontSize: ".73rem", color: T.text2, marginTop: ".25rem" }}>{ref.reason}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: T.fontMono, fontSize: ".72rem", color: T.text3 }}>{fmtDate(ref.createdAt?.slice(0, 10))}</div>
                    {ref.destination && <div style={{ fontSize: ".72rem", color: T.text2, marginTop: ".1rem" }}>{ref.destination}</div>}
                  </div>
                </div>

                {selected?.id === ref.id && (
                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: `1px solid ${T.border}` }} className="sig-fade">
                    {ref.cid10 && <div style={{ fontSize: ".8rem", color: T.text2, marginBottom: ".5rem" }}><strong>CID-10:</strong> {ref.cid10}</div>}
                    {ref.notes && <div style={{ fontSize: ".8rem", color: T.text2, marginBottom: ".75rem", fontStyle: "italic" }}>{ref.notes}</div>}
                    <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                      {REFERRAL_STATUS.filter(st => st.key !== ref.status).map(st => (
                        <Btn key={st.key} size="sm" variant="secondary"
                          style={{ borderColor: st.color, color: st.color }}
                          onClick={e => { e.stopPropagation(); updateStatus(ref.id, st.key); }}>
                          → {st.label}
                        </Btn>
                      ))}
                      <Btn size="sm" variant="ghost" style={{ color: T.rose, marginLeft: "auto" }}
                        onClick={e => { e.stopPropagation(); deleteReferral(ref.id); }}>
                        Excluir
                      </Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <Modal title="Novo Encaminhamento" sub="Registre a referência para serviço especializado" onClose={() => setShowModal(false)} maxWidth={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            <InputField label="Paciente">
              <input style={styledInput()} placeholder="Nome do paciente..."
                value={patSearch || form.patientName}
                onChange={e => { setPatSearch(e.target.value); setForm(f => ({ ...f, patientName: e.target.value, patientId: "" })); }}
                onFocus={e => { e.target.style.borderColor = T.teal; }}
                onBlur={e => { e.target.style.borderColor = T.border; }} />
              {filtPats.length > 0 && (patSearch || form.patientName) && !form.patientId && (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: ".25rem", boxShadow: T.shadowMd, background: T.surface, maxHeight: 150, overflowY: "auto" }}>
                  {filtPats.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, patientId: p.id, patientName: p.name })); setPatSearch(""); }}
                      style={{ width: "100%", padding: ".5rem .85rem", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: ".82rem", color: T.ink, display: "flex", alignItems: "center", gap: ".6rem" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <Avatar name={p.name} size={24} color={catColor(p.careCategory)} />
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </InputField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <InputField label="Tipo">
                <select style={styledInput()} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {REFERRAL_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </InputField>
              <InputField label="Prioridade">
                <select style={styledInput()} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES_REF.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </InputField>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <InputField label="Especialidade">
                <input style={styledInput()} placeholder="Ex: Cardiologia, Ortopedia..." value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} />
              </InputField>
              <InputField label="CID-10 (opcional)">
                <input style={styledInput()} placeholder="Ex: I10, E11..." value={form.cid10} onChange={e => setForm(f => ({ ...f, cid10: e.target.value }))} />
              </InputField>
            </div>

            <InputField label="Destino / Serviço">
              <input style={styledInput()} placeholder="Nome do hospital, clínica ou serviço..." value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} />
            </InputField>

            <InputField label="Motivo do encaminhamento *">
              <textarea style={{ ...styledInput(), minHeight: 80, resize: "vertical" }} placeholder="Descreva o motivo clínico..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </InputField>

            <InputField label="Observações adicionais">
              <textarea style={{ ...styledInput(), minHeight: 56, resize: "vertical" }} placeholder="Informações complementares..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </InputField>

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Btn>
              <Btn variant="primary" onClick={addReferral} disabled={!form.patientName || !form.reason}>
                ✓ Registrar Encaminhamento
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   RELATÓRIOS
═══════════════════════════════════════════════════════════════════ */

export function ReportsPageNew2({ patients = [], users = [], appointments = [], templates = [] }) {
  const [period, setPeriod] = useState("month");
  const [category, setCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart  = new Date(today.getFullYear(), 0, 1);
  const periodStart = period === "month" ? monthStart : period === "year" ? yearStart : new Date(today.getTime() - 7 * 86400000);

  const filterPats = useMemo(() => {
    return category === "all" ? patients : patients.filter(p => p.careCategory === category);
  }, [patients, category]);

  const total        = filterPats.length;
  const active       = filterPats.filter(p => p.status === "active" || !p.status).length;
  const risk         = filterPats.filter(p => p.status === "risk").length;
  const inactive     = filterPats.filter(p => p.status === "inactive").length;
  const newThisMonth = filterPats.filter(p => p.createdAt && new Date(p.createdAt) >= periodStart).length;
  const withCpf      = filterPats.filter(p => p.cpf).length;
  const withCns      = filterPats.filter(p => p.cns).length;
  const withPhone    = filterPats.filter(p => p.phone).length;
  const withAddress  = filterPats.filter(p => p.address).length;
  const withAcs      = filterPats.filter(p => p.assignedAcsId).length;

  const dataQuality = total ? Math.round(((withCpf + withCns + withPhone + withAddress + withAcs) / (total * 5)) * 100) : 0;
  const coverageRate = total ? Math.round((active / total) * 100) : 0;
  const riskRate     = total ? Math.round((risk / total) * 100) : 0;

  const CAT_OPTIONS = [
    { key: "all",          label: "Todos" },
    { key: "pregnant",     label: "Gestantes" },
    { key: "child_followup", label: "Puericultura" },
    { key: "chronic",      label: "Crônicos" },
    { key: "puerperal",    label: "Puérperas" },
    { key: "elderly",      label: "Pessoa Idosa" },
    { key: "general",      label: "Geral" },
  ];

  const acsReport = useMemo(() =>
    users.filter(u => u.role === "acs").map(acs => {
      const pats = filterPats.filter(p => p.assignedAcsId === acs.id);
      return {
        id: acs.id,
        name: acs.name,
        total:  pats.length,
        active: pats.filter(p => p.status === "active" || !p.status).length,
        risk:   pats.filter(p => p.status === "risk").length,
        inactive: pats.filter(p => p.status === "inactive").length,
      };
    }).sort((a, b) => b.total - a.total),
    [filterPats, users]
  );

  const catBreakdown = useMemo(() =>
    CAT_OPTIONS.filter(o => o.key !== "all").map(o => ({
      ...o,
      count: patients.filter(p => p.careCategory === o.key).length,
      color: catColor(o.key),
    })).sort((a, b) => b.count - a.count),
    [patients]
  );

  const maxCat = Math.max(...catBreakdown.map(c => c.count), 1);

  const TABS = [
    { key: "overview", label: "Visão Geral", icon: "📊" },
    { key: "acs",      label: "Por ACS",     icon: "🏃" },
    { key: "quality",  label: "Qualidade",   icon: "✅" },
    { key: "appts",    label: "Consultas",   icon: "📅" },
  ];

  function exportCSV() {
    const rows = [
      ["Nome","Categoria","Status","CPF","CNS","Telefone","ACS","Micro-área"],
      ...filterPats.map(p => [
        p.name, catLabel(p.careCategory), p.status || "active",
        p.cpf || "", p.cns || "", p.phone || "",
        users.find(u => u.id === p.assignedAcsId)?.name || "",
        p.microArea || "",
      ]),
    ].map(r => r.join(";")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(rows);
    a.download = `relatorio_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", fontFamily: T.fontSans }} className="sig-fade">
      <PageHeader
        title="Relatórios"
        sub="Produção e indicadores da equipe · PNAB 2.436/2017"
        icon="📊"
        color={T.purple}
        badge={<Chip label="PNAB 2.436/2017" color={T.purple} bg={T.purpleL} />}
        actions={
          <>
            <div style={{ display: "flex", gap: ".3rem" }}>
              {[{ k: "week", l: "7 dias" }, { k: "month", l: "Mês" }, { k: "year", l: "Ano" }].map(p => (
                <Btn key={p.k} size="sm" variant={period === p.k ? "navy" : "secondary"} onClick={() => setPeriod(p.k)}>{p.l}</Btn>
              ))}
            </div>
            <Btn size="sm" variant="outline" onClick={exportCSV}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 12h10M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Exportar CSV
            </Btn>
          </>
        }
      />

      {/* Filtro de categoria */}
      <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
        {CAT_OPTIONS.map(o => (
          <button key={o.key} onClick={() => setCategory(o.key)}
            className="sig-btn"
            style={{
              padding: ".35rem .85rem", borderRadius: 99, fontSize: ".75rem", fontWeight: 700,
              border: category === o.key ? `1.5px solid ${catColor(o.key) || T.purple}` : `1px solid ${T.border}`,
              background: category === o.key ? (catColor(o.key) || T.purple) : T.surface,
              color: category === o.key ? "#fff" : T.text2, cursor: "pointer",
            }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        <StatCard label="Total" value={total} icon="👥" color={T.indigo} />
        <StatCard label="Ativos" value={active} icon="✅" color={T.green}
          sub={`${coverageRate}% cobertura`} />
        <StatCard label="Em Risco" value={risk} icon="⚠️" color={T.amber}
          sub={`${riskRate}% da carteira`} />
        <StatCard label="Inativos" value={inactive} icon="⏸️" color={T.text3} />
        <StatCard label="Novos (período)" value={newThisMonth} icon="🆕" color={T.blue} />
        <StatCard label="ACS" value={users.filter(u => u.role === "acs").length} icon="🏃" color={T.teal} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: ".35rem", borderBottom: `2px solid ${T.border}`, paddingBottom: "0" }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: ".55rem 1.1rem", border: "none", background: "none",
              fontWeight: 700, fontSize: ".82rem", cursor: "pointer",
              color: activeTab === tab.key ? T.teal : T.text2,
              borderBottom: activeTab === tab.key ? `2.5px solid ${T.teal}` : "2.5px solid transparent",
              marginBottom: "-2px",
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Visão Geral */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }} className="sig-fade">
          <Card style={{ padding: "1.25rem" }}>
            <div style={{ fontSize: ".75rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "1rem" }}>
              Distribuição por Categoria de Cuidado
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              {catBreakdown.map(c => (
                <div key={c.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                      <span style={{ fontSize: ".82rem", fontWeight: 600, color: T.ink }}>{c.label}</span>
                    </div>
                    <div style={{ display: "flex", gap: ".65rem", alignItems: "center" }}>
                      <span style={{ fontFamily: T.fontMono, fontSize: ".82rem", fontWeight: 800, color: c.color }}>{c.count}</span>
                      <span style={{ fontSize: ".72rem", color: T.text3 }}>{patients.length ? ((c.count / patients.length) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                  <ProgressBar value={c.count} max={maxCat} color={c.color} height={7} />
                </div>
              ))}
            </div>
          </Card>

          {/* Status breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: ".75rem" }}>
            {[
              { label: "Cobertura", value: coverageRate, max: 100, color: T.green, icon: "✅", desc: `${active} de ${total} ativos` },
              { label: "Qualidade de Dados", value: dataQuality, max: 100, color: T.teal, icon: "📋", desc: "CPF, CNS, tel, endereço, ACS" },
              { label: "Taxa de Risco", value: riskRate, max: 100, color: T.rose, icon: "⚠️", desc: `${risk} pacientes em risco` },
            ].map(m => (
              <Card key={m.label} style={{ padding: "1.1rem 1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".65rem" }}>
                  <span style={{ fontSize: ".75rem", fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: ".04em" }}>{m.label}</span>
                  <span>{m.icon}</span>
                </div>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: m.color, marginBottom: ".35rem" }}>{m.value}%</div>
                <ProgressBar value={m.value} max={m.max} color={m.color} height={6} />
                <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".4rem" }}>{m.desc}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab: ACS */}
      {activeTab === "acs" && (
        <Card style={{ padding: "1.25rem" }} className="sig-fade">
          {acsReport.length === 0 ? (
            <EmptyState icon="🏃" title="Nenhum ACS cadastrado" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: T.surface2 }}>
                    {["ACS", "Carteira Total", "Ativos", "Em Risco", "Inativos", "% Ativo"].map(h => (
                      <th key={h} style={{ padding: ".65rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {acsReport.map((row, i) => (
                    <tr key={row.id} className="sig-row" style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                          <Avatar name={row.name} size={30} color={T.teal} />
                          <span style={{ fontWeight: 700, color: T.ink }}>{row.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: ".65rem .85rem", fontFamily: T.fontMono, fontWeight: 800, color: T.ink2 }}>{row.total}</td>
                      <td style={{ padding: ".65rem .85rem" }}><Chip label={row.active} color={T.green} bg={T.greenL} dot /></td>
                      <td style={{ padding: ".65rem .85rem" }}><Chip label={row.risk} color={row.risk > 0 ? T.amber : T.text3} bg={row.risk > 0 ? T.amberL : T.surface3} dot /></td>
                      <td style={{ padding: ".65rem .85rem" }}><Chip label={row.inactive} color={T.text3} bg={T.surface3} /></td>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                          <ProgressBar value={row.active} max={row.total} color={T.teal} height={5} />
                          <span style={{ fontFamily: T.fontMono, fontSize: ".75rem", color: T.text2, flexShrink: 0 }}>
                            {row.total ? Math.round((row.active / row.total) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab: Qualidade */}
      {activeTab === "quality" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: ".75rem" }} className="sig-fade">
          {[
            { label: "Com CPF",      count: withCpf,      icon: "🪪", color: T.blue },
            { label: "Com CNS",      count: withCns,      icon: "🏥", color: T.teal },
            { label: "Com Telefone", count: withPhone,     icon: "📱", color: T.green },
            { label: "Com Endereço", count: withAddress,   icon: "🏠", color: T.indigo },
            { label: "Com ACS",      count: withAcs,       icon: "🏃", color: T.purple },
          ].map(q => (
            <Card key={q.label} style={{ padding: "1.1rem 1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".5rem" }}>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 900, color: q.color }}>{q.count}</div>
                  <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".1rem", fontWeight: 600 }}>{q.label}</div>
                </div>
                <span style={{ fontSize: "1.2rem" }}>{q.icon}</span>
              </div>
              <ProgressBar value={q.count} max={total} color={q.color} />
              <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".35rem" }}>
                {total ? ((q.count / total) * 100).toFixed(1) : 0}% do total · {total - q.count} sem preenchimento
              </div>
            </Card>
          ))}
          <Card style={{ padding: "1.1rem 1.25rem", background: `linear-gradient(135deg, ${T.teal}0a, ${T.indigo}0a)`, borderColor: T.teal + "40" }}>
            <div style={{ fontSize: "2rem", fontWeight: 900, color: dataQuality >= 80 ? T.green : dataQuality >= 60 ? T.amber : T.rose }}>{dataQuality}%</div>
            <div style={{ fontSize: ".72rem", color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginTop: ".1rem" }}>Score de qualidade</div>
            <ProgressBar value={dataQuality} max={100} color={dataQuality >= 80 ? T.green : dataQuality >= 60 ? T.amber : T.rose} height={8} />
            <div style={{ fontSize: ".72rem", color: T.text2, marginTop: ".4rem" }}>Meta: ≥ 80% · {dataQuality >= 80 ? "✅ Atingido" : "⚠️ Abaixo da meta"}</div>
          </Card>
        </div>
      )}

      {/* Tab: Consultas */}
      {activeTab === "appts" && (
        <Card style={{ padding: "1.25rem" }} className="sig-fade">
          <div style={{ fontSize: ".75rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "1rem" }}>
            Agendamentos ({appointments.length} total)
          </div>
          {appointments.length === 0 ? (
            <EmptyState icon="📅" title="Nenhum agendamento encontrado" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: T.surface2 }}>
                    {["Data", "Paciente", "Tipo", "Status"].map(h => (
                      <th key={h} style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.slice(0, 50).map((a, i) => (
                    <tr key={a.id} className="sig-row" style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: ".6rem .85rem", fontFamily: T.fontMono, fontSize: ".75rem", color: T.text2 }}>{fmtDate(a.date)}</td>
                      <td style={{ padding: ".6rem .85rem", fontWeight: 600, color: T.ink }}>{a.patientName || a.summary}</td>
                      <td style={{ padding: ".6rem .85rem" }}><Chip label={a.type || "Consulta"} color={T.blue} /></td>
                      <td style={{ padding: ".6rem .85rem" }}><StatusBadge status={a.status || "scheduled"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {appointments.length > 50 && (
                <div style={{ padding: ".65rem .85rem", fontSize: ".75rem", color: T.text3, textAlign: "center" }}>
                  Exibindo 50 de {appointments.length} registros · Exporte CSV para ver todos
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <div style={{ fontSize: ".72rem", color: T.text3, textAlign: "center", padding: ".5rem" }}>
        Relatório gerado em {new Date().toLocaleString("pt-BR")} · PNAB 2.436/2017 · CFM 1638/2002
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   INSUMOS — com Pacientes Recorrentes
═══════════════════════════════════════════════════════════════════ */

const INSUMOS_LS_KEY2  = "sigus_insumos_v2";
const RECORRENTES_KEY  = "sigus_recorrentes_v1";
const STOCK_LS_KEY2    = "sigus_stock_v2";

/* Catálogo RENAME/DAF-MS simplificado */
const CATALOGO = [
  { id:"i01", nome:"Agulha 40x12mm",         categoria:"Materiais",   unidade:"un",     alerta:50,  qtdMax:10 },
  { id:"i02", nome:"Agulha 25x7mm",           categoria:"Materiais",   unidade:"un",     alerta:50,  qtdMax:10 },
  { id:"i03", nome:"Seringa 10ml",             categoria:"Materiais",   unidade:"un",     alerta:30,  qtdMax:5  },
  { id:"i04", nome:"Seringa 5ml",              categoria:"Materiais",   unidade:"un",     alerta:30,  qtdMax:5  },
  { id:"i05", nome:"Luva P",                   categoria:"EPI",         unidade:"par",    alerta:20,  qtdMax:20 },
  { id:"i06", nome:"Luva M",                   categoria:"EPI",         unidade:"par",    alerta:20,  qtdMax:20 },
  { id:"i07", nome:"Luva G",                   categoria:"EPI",         unidade:"par",    alerta:20,  qtdMax:20 },
  { id:"i08", nome:"Máscara cirúrgica",        categoria:"EPI",         unidade:"un",     alerta:30,  qtdMax:30 },
  { id:"i09", nome:"Fraldas tamanho M",        categoria:"Estomia",     unidade:"un",     alerta:10,  qtdMax:60 },
  { id:"i10", nome:"Fraldas tamanho G",        categoria:"Estomia",     unidade:"un",     alerta:10,  qtdMax:60 },
  { id:"i11", nome:"Coletor urinário 2000ml",  categoria:"Estomia",     unidade:"un",     alerta:5,   qtdMax:4  },
  { id:"i12", nome:"Sonda vesical 14fr",       categoria:"Estomia",     unidade:"un",     alerta:5,   qtdMax:4  },
  { id:"i13", nome:"Atadura crepom 10cm",      categoria:"Curativos",   unidade:"rolo",   alerta:10,  qtdMax:10 },
  { id:"i14", nome:"Gaze estéril",             categoria:"Curativos",   unidade:"pacote", alerta:15,  qtdMax:10 },
  { id:"i15", nome:"Esparadrapo 5cm",          categoria:"Curativos",   unidade:"rolo",   alerta:5,   qtdMax:3  },
  { id:"i16", nome:"Micropore 2,5cm",          categoria:"Curativos",   unidade:"rolo",   alerta:5,   qtdMax:3  },
  { id:"i17", nome:"Glicosímetro tiras",       categoria:"Diagnóstico", unidade:"tira",   alerta:20,  qtdMax:50 },
  { id:"i18", nome:"Lanceta",                  categoria:"Diagnóstico", unidade:"un",     alerta:20,  qtdMax:30 },
  { id:"i19", nome:"Preservativo masculino",   categoria:"Prevenção",   unidade:"un",     alerta:50,  qtdMax:30 },
  { id:"i20", nome:"Preservativo feminino",    categoria:"Prevenção",   unidade:"un",     alerta:20,  qtdMax:10 },
  { id:"i21", nome:"Misoprostol 25mcg",        categoria:"Gestação",    unidade:"cp",     alerta:5,   qtdMax:4  },
  { id:"i22", nome:"Ácido fólico 5mg",         categoria:"Gestação",    unidade:"cp",     alerta:20,  qtdMax:60 },
  { id:"i23", nome:"Sulfato ferroso 40mg",     categoria:"Gestação",    unidade:"cp",     alerta:20,  qtdMax:60 },
  { id:"i24", nome:"Curativo hidrocoloide",    categoria:"Curativos",   unidade:"un",     alerta:5,   qtdMax:5  },
];

const CATEGORIAS_INSUMO = ["Todos", ...new Set(CATALOGO.map(c => c.categoria))];

function useInsumoStock() {
  const [stock, setStockRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STOCK_LS_KEY2) || "[]"); } catch { return []; }
  });

  function getQty(id) {
    return Number(stock.find(s => s.id === id)?.qty ?? 0);
  }

  function setStock(newStock) {
    setStockRaw(newStock);
    localStorage.setItem(STOCK_LS_KEY2, JSON.stringify(newStock));
  }

  function adjustStock(id, delta) {
    setStock(stock.map(s => s.id === id ? { ...s, qty: Math.max(0, (s.qty || 0) + delta) } : s).concat(
      stock.find(s => s.id === id) ? [] : [{ id, qty: Math.max(0, delta), minQty: 5 }]
    ).filter((s, i, a) => a.findIndex(x => x.id === s.id) === i));
  }

  return { stock, getQty, setStock, adjustStock };
}

export function InsumoPageNew2({ patients = [], user }) {
  const { stock, getQty, setStock, adjustStock } = useInsumoStock();
  const [tab, setTab] = useState("dispensar"); // dispensar | recorrentes | estoque | historico
  const [catFilter, setCatFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [patSearch, setPatSearch] = useState("");
  const [selPat, setSelPat] = useState(null);
  const [itens, setItens] = useState({});
  const [dispensas, setDispensas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INSUMOS_LS_KEY2) || "[]"); } catch { return []; }
  });
  const [recorrentes, setRecorrentes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(RECORRENTES_KEY) || "[]"); } catch { return []; }
  });
  const [stockSearch, setStockSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  /* Modais */
  const [showRecorrenteModal, setShowRecorrenteModal] = useState(false);
  const [editRecorrente, setEditRecorrente] = useState(null); // paciente recorrente em edição
  const [recForm, setRecForm] = useState({ patientId: "", patientName: "", itens: {}, obs: "", periodicidade: "monthly" });
  const [showStockModal, setShowStockModal] = useState(null); // insumo selecionado para entrada de estoque
  const [entradaQty, setEntradaQty] = useState("");

  const isNurse = ["nurse_manager"].includes(user?.role);
  const isPharm = ["pharmacist", "pharmacy_tech"].includes(user?.role);
  const canDispense = isNurse;      // enfermeira libera
  const canStock    = isPharm;       // farmacêutico controla estoque

  function saveDispensas(d) { setDispensas(d); localStorage.setItem(INSUMOS_LS_KEY2, JSON.stringify(d)); }
  function saveRecorrentes(r) { setRecorrentes(r); localStorage.setItem(RECORRENTES_KEY, JSON.stringify(r)); }

  function setItem(id, qty) {
    setItens(s => ({ ...s, [id]: Math.max(0, qty) }));
  }

  async function confirmar() {
    if (!selPat) return;
    const itemList = Object.entries(itens).filter(([, v]) => v > 0);
    if (!itemList.length) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 400));

    const newDisp = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      patientId: selPat.id,
      patientName: selPat.name,
      itens: itemList.map(([id, qty]) => ({ id, qty })),
      date: new Date().toISOString().slice(0, 10),
      ts: new Date().toISOString(),
      by: user?.name || "Profissional",
      byId: user?.id,
    };

    // Deduz do estoque
    const newStock = [...stock];
    itemList.forEach(([id, qty]) => {
      const idx = newStock.findIndex(s => s.id === id);
      if (idx >= 0) newStock[idx] = { ...newStock[idx], qty: Math.max(0, (newStock[idx].qty || 0) - qty) };
    });
    setStock(newStock);
    saveDispensas([newDisp, ...dispensas]);
    setItens({});
    setSuccessMsg(`Dispensação confirmada para ${selPat.name}!`);
    setTimeout(() => setSuccessMsg(""), 4000);
    setBusy(false);
  }

  /* Recorrentes */
  function marcarRecorrente(pat, itensPadrao = {}) {
    const novo = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      patientId: pat.id,
      patientName: pat.name,
      itens: itensPadrao,
      obs: "",
      periodicidade: "monthly",
      ativo: true,
      criadoEm: new Date().toISOString(),
      criadoPor: user?.name || "Profissional",
    };
    saveRecorrentes([novo, ...recorrentes]);
  }

  function atualizarRecorrente(id, updates) {
    saveRecorrentes(recorrentes.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function encerrarRecorrente(id) {
    saveRecorrentes(recorrentes.map(r => r.id === id ? { ...r, ativo: false, encerradoEm: new Date().toISOString(), encerradoPor: user?.name } : r));
  }

  function reativarRecorrente(id) {
    saveRecorrentes(recorrentes.map(r => r.id === id ? { ...r, ativo: true, encerradoEm: undefined } : r));
  }

  function removerRecorrente(id) {
    saveRecorrentes(recorrentes.filter(r => r.id !== id));
  }

  const catalogoFiltrado = useMemo(() => {
    let c = CATALOGO;
    if (catFilter !== "Todos") c = c.filter(i => i.categoria === catFilter);
    if (search) c = c.filter(i => i.nome.toLowerCase().includes(search.toLowerCase()));
    return c;
  }, [catFilter, search]);

  const filtPats = useMemo(() => {
    if (!patSearch.trim()) return patients.slice(0, 8);
    return patients.filter(p => (p.name || "").toLowerCase().includes(patSearch.toLowerCase())).slice(0, 8);
  }, [patients, patSearch]);

  const filtStock = useMemo(() => {
    return CATALOGO.filter(i => !stockSearch || i.nome.toLowerCase().includes(stockSearch.toLowerCase()));
  }, [stockSearch]);

  const totalItens = Object.values(itens).reduce((a, b) => a + b, 0);
  const recActivosCount = recorrentes.filter(r => r.ativo).length;

  const PERIODICIDADE = [
    { key: "weekly",  label: "Semanal" },
    { key: "biweekly",label: "Quinzenal" },
    { key: "monthly", label: "Mensal" },
    { key: "bimonthly",label:"Bimestral" },
  ];

  const TABS_INSUMO = [
    { key: "dispensar",   label: "Dispensar",   icon: "💊" },
    { key: "recorrentes", label: `Recorrentes ${recActivosCount > 0 ? `(${recActivosCount})` : ""}`, icon: "🔄" },
    { key: "estoque",     label: "Estoque",      icon: "📦" },
    { key: "historico",   label: "Histórico",    icon: "📋" },
  ];

  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem", fontFamily: T.fontSans }} className="sig-fade">
      <PageHeader
        title="Insumos"
        sub="Dispensação · RENAME/DAF-MS · ANVISA RDC 20/2011"
        icon="📦"
        color={T.teal}
        badge={<Chip label="ANVISA RDC 20/2011" color={T.teal} bg={T.teal50} />}
        actions={
          <>
            {isNurse && (
              <Btn size="sm" variant="outline" onClick={() => { setShowRecorrenteModal(true); setEditRecorrente(null); setRecForm({ patientId: "", patientName: "", itens: {}, obs: "", periodicidade: "monthly" }); }}>
                🔄 Marcar Recorrente
              </Btn>
            )}
          </>
        }
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: `2px solid ${T.border}` }}>
        {TABS_INSUMO.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: ".55rem 1.25rem", border: "none", background: "none",
              fontWeight: 700, fontSize: ".82rem", cursor: "pointer",
              color: tab === t.key ? T.teal : T.text2,
              borderBottom: tab === t.key ? `2.5px solid ${T.teal}` : "2.5px solid transparent",
              marginBottom: "-2px",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {successMsg && (
        <div style={{ padding: ".75rem 1rem", borderRadius: T.r, background: T.greenL, border: `1px solid #86efac`, color: T.green, fontWeight: 700, fontSize: ".85rem", display: "flex", alignItems: "center", gap: ".5rem" }} className="sig-pop">
          ✅ {successMsg}
        </div>
      )}

      {/* ── Tab: Dispensar ── */}
      {tab === "dispensar" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.25rem" }}>
          {/* Painel esquerdo: paciente + carrinho */}
          <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            {/* Seleção de paciente */}
            <Card style={{ padding: "1rem" }}>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".6rem" }}>Paciente</div>
              <SearchBar value={patSearch} onChange={setPatSearch} placeholder="Buscar paciente..." />
              {patSearch && (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: ".4rem", boxShadow: T.shadowMd, background: T.surface, maxHeight: 200, overflowY: "auto" }}>
                  {filtPats.map(p => {
                    const isRec = recorrentes.some(r => r.patientId === p.id && r.ativo);
                    return (
                      <button key={p.id} type="button"
                        onClick={() => { setSelPat(p); setPatSearch(""); }}
                        style={{ width: "100%", padding: ".55rem .85rem", border: "none", borderBottom: `1px solid ${T.border}`, background: selPat?.id === p.id ? T.teal50 : "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: ".6rem" }}
                        onMouseEnter={e => { if (selPat?.id !== p.id) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { if (selPat?.id !== p.id) e.currentTarget.style.background = "none"; }}>
                        <Avatar name={p.name} size={32} color={catColor(p.careCategory)} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: ".82rem", color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                          <div style={{ display: "flex", gap: ".3rem", marginTop: ".1rem", flexWrap: "wrap" }}>
                            <Chip label={catLabel(p.careCategory)} color={catColor(p.careCategory)} style={{ fontSize: ".62rem", padding: ".1rem .4rem" }} />
                            {isRec && <Chip label="🔄 Recorrente" color={T.teal} bg={T.teal50} style={{ fontSize: ".62rem", padding: ".1rem .4rem" }} />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filtPats.length === 0 && <div style={{ padding: ".75rem", fontSize: ".78rem", color: T.text3, textAlign: "center" }}>Nenhum paciente encontrado</div>}
                </div>
              )}

              {selPat && (
                <div style={{ marginTop: ".5rem", padding: ".75rem", background: T.teal50, borderRadius: T.r, border: `1px solid ${T.teal}25` }} className="sig-fade">
                  <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                    <Avatar name={selPat.name} size={36} color={catColor(selPat.careCategory)} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: ".85rem", color: T.ink }}>{selPat.name}</div>
                      <div style={{ fontSize: ".72rem", color: T.text3 }}>{calcAge(selPat.birthDate)} anos · {catLabel(selPat.careCategory)}</div>
                      {recorrentes.some(r => r.patientId === selPat.id && r.ativo) && (
                        <Chip label="🔄 Paciente Recorrente" color={T.teal} bg={T.teal50} style={{ marginTop: ".2rem", fontSize: ".62rem" }} />
                      )}
                    </div>
                    <button onClick={() => setSelPat(null)} style={{ border: "none", background: "none", cursor: "pointer", color: T.text3, marginLeft: "auto", padding: ".1rem" }}>✕</button>
                  </div>

                  {/* Se é recorrente, mostra prescrição padrão */}
                  {(() => {
                    const rec = recorrentes.find(r => r.patientId === selPat.id && r.ativo);
                    if (!rec) return null;
                    return (
                      <div style={{ marginTop: ".65rem", padding: ".6rem .75rem", background: T.surface, borderRadius: T.r, border: `1px solid ${T.teal}30` }}>
                        <div style={{ fontSize: ".68rem", fontWeight: 800, color: T.teal, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".4rem" }}>
                          Prescrição recorrente ({PERIODICIDADE.find(p => p.key === rec.periodicidade)?.label || "Mensal"})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
                          {Object.entries(rec.itens).filter(([, v]) => v > 0).map(([id, qty]) => {
                            const ins = CATALOGO.find(c => c.id === id);
                            return (
                              <Chip key={id} label={`${ins?.nome}: ${qty} ${ins?.unidade}`} color={T.teal}
                                style={{ fontSize: ".65rem", padding: ".15rem .5rem", cursor: "pointer" }}
                                onClick={() => setItem(id, qty)} />
                            );
                          })}
                        </div>
                        <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".35rem" }}>
                          ↑ Clique para preencher automaticamente
                        </div>
                        <Btn size="sm" variant="outline" style={{ marginTop: ".5rem", fontSize: ".7rem" }}
                          onClick={() => {
                            Object.entries(rec.itens).filter(([, v]) => v > 0).forEach(([id, qty]) => setItem(id, qty));
                          }}>
                          📋 Aplicar prescrição completa
                        </Btn>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>

            {/* Carrinho */}
            {totalItens > 0 && (
              <Card style={{ padding: "1rem" }} className="sig-fade">
                <div style={{ fontSize: ".72rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".6rem" }}>
                  Itens selecionados · {totalItens} unidade(s)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: ".3rem", maxHeight: 200, overflowY: "auto" }}>
                  {Object.entries(itens).filter(([, v]) => v > 0).map(([id, qty]) => {
                    const ins = CATALOGO.find(c => c.id === id);
                    return (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".3rem 0", borderBottom: `1px solid ${T.border}`, fontSize: ".78rem" }}>
                        <span style={{ color: T.ink, fontWeight: 500, flex: 1 }}>{ins?.nome}</span>
                        <span style={{ fontWeight: 800, color: T.tealD, fontFamily: T.fontMono }}>{qty} {ins?.unidade}</span>
                      </div>
                    );
                  })}
                </div>
                {canDispense ? (
                  <Btn fullWidth variant="primary" onClick={confirmar} disabled={!selPat || busy} style={{ marginTop: ".85rem" }}>
                    {busy ? <><Spinner size={14} /> Registrando...</> : "✓ Confirmar Dispensação"}
                  </Btn>
                ) : (
                  <div style={{ marginTop: ".6rem", padding: ".5rem .75rem", background: T.amberL, borderRadius: T.r, fontSize: ".75rem", color: T.amber, fontWeight: 600 }}>
                    ⚠️ Somente enfermeira pode confirmar dispensação.
                  </div>
                )}
              </Card>
            )}

            {!selPat && !patSearch && (
              <div style={{ padding: "1rem", background: T.amber50, border: `1px solid ${T.amber}30`, borderRadius: T.r, fontSize: ".78rem", color: T.amber, fontWeight: 600 }}>
                ⚠️ Selecione um paciente para iniciar a dispensação.
              </div>
            )}
          </div>

          {/* Catálogo */}
          <Card style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar insumo..." style={{ flex: "1 1 160px" }} />
              <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap" }}>
                {CATEGORIAS_INSUMO.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className="sig-btn"
                    style={{
                      padding: ".28rem .7rem", borderRadius: 99, fontSize: ".72rem", fontWeight: 700,
                      border: catFilter === c ? `1.5px solid ${T.teal}` : `1px solid ${T.border}`,
                      background: catFilter === c ? T.teal : T.surface,
                      color: catFilter === c ? "#fff" : T.text2, cursor: "pointer",
                    }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: ".6rem" }}>
              {catalogoFiltrado.map(insumo => {
                const qty = itens[insumo.id] || 0;
                const est = getQty(insumo.id);
                const semEst = est === 0;
                const baixo = est > 0 && est <= insumo.alerta;
                const statusColor = semEst ? T.rose : baixo ? T.amber : T.green;
                const statusLabel = semEst ? "Sem estoque" : baixo ? `Baixo: ${est}` : `${est}`;

                return (
                  <div key={insumo.id} style={{
                    padding: ".85rem 1rem", borderRadius: T.r,
                    border: `1.5px solid ${qty > 0 ? T.teal : semEst ? T.rose + "50" : T.border}`,
                    background: qty > 0 ? T.teal50 : semEst ? T.roseL : T.surface,
                    opacity: semEst ? .7 : 1, transition: "all .15s",
                  }}>
                    <div style={{ marginBottom: ".5rem" }}>
                      <div style={{ fontSize: ".82rem", fontWeight: 700, color: T.ink, lineHeight: 1.3 }}>{insumo.nome}</div>
                      <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".15rem" }}>{insumo.categoria}</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".5rem" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                      <span style={{ fontSize: ".7rem", color: statusColor, fontWeight: 700, fontFamily: T.fontMono }}>{statusLabel} {insumo.unidade}</span>
                      {!semEst && (
                        <div style={{ flex: 1, height: 3, borderRadius: 99, background: T.surface3 }}>
                          <div style={{ height: "100%", borderRadius: 99, background: statusColor, width: `${Math.min(100, (est / 60) * 100)}%`, transition: "width .3s" }} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                      <button type="button" disabled={semEst || qty <= 0} onClick={() => setItem(insumo.id, qty - 1)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, cursor: semEst || qty <= 0 ? "not-allowed" : "pointer", fontWeight: 800, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, flexShrink: 0, opacity: qty <= 0 ? .4 : 1 }}>−</button>
                      <span style={{ minWidth: 28, textAlign: "center", fontWeight: 900, fontSize: ".9rem", color: qty > 0 ? T.tealD : T.text3, fontFamily: T.fontMono }}>{qty}</span>
                      <button type="button" disabled={semEst || qty >= insumo.qtdMax || qty >= est} onClick={() => setItem(insumo.id, qty + 1)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, cursor: semEst || qty >= insumo.qtdMax ? "not-allowed" : "pointer", fontWeight: 800, fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, flexShrink: 0, opacity: (semEst || qty >= insumo.qtdMax) ? .4 : 1 }}>+</button>
                      <span style={{ fontSize: ".68rem", color: T.text3 }}>máx {insumo.qtdMax}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Tab: Recorrentes ── */}
      {tab === "recorrentes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }} className="sig-fade">
          {/* Banner informativo */}
          <div style={{ padding: "1rem 1.25rem", borderRadius: T.rMd, background: T.teal50, border: `1px solid ${T.teal}30`, display: "flex", gap: "1rem", alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T.teal, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem", flexShrink: 0 }}>🔄</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: ".9rem", color: T.ink, marginBottom: ".2rem" }}>Pacientes Recorrentes de Insumos</div>
              <div style={{ fontSize: ".8rem", color: T.text2, lineHeight: 1.5 }}>
                Pacientes recorrentes retornam periodicamente para retirada de insumos em quantidade pré-determinada. 
                A <strong>enfermeira</strong> marca e encerra o status de recorrente. O <strong>farmacêutico</strong> controla o estoque. 
                O paciente permanece ativo até que a enfermeira encerre o vínculo.
              </div>
            </div>
          </div>

          {/* Lista de recorrentes ativos */}
          <div>
            <Divider label={`Ativos · ${recorrentes.filter(r => r.ativo).length}`} style={{ marginBottom: ".75rem" }} />
            {recorrentes.filter(r => r.ativo).length === 0 ? (
              <EmptyState icon="🔄" title="Nenhum paciente recorrente ativo"
                sub="Pacientes que retiram insumos periodicamente aparecerão aqui."
                action={isNurse && <Btn variant="outline" onClick={() => { setShowRecorrenteModal(true); setEditRecorrente(null); setRecForm({ patientId: "", patientName: "", itens: {}, obs: "", periodicidade: "monthly" }); }}>Marcar Primeiro Recorrente</Btn>} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
                {recorrentes.filter(r => r.ativo).map(rec => {
                  const lastDisp = dispensas.filter(d => d.patientId === rec.patientId).sort((a, b) => b.ts?.localeCompare(a.ts))[0];
                  return (
                    <Card key={rec.id} style={{ padding: "1.1rem 1.25rem", borderLeft: `4px solid ${T.teal}` }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flex: "1 1 240px" }}>
                          <div style={{ position: "relative" }}>
                            <Avatar name={rec.patientName} size={44} color={T.teal} />
                            <div style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: "50%", background: T.teal, border: `2px solid ${T.surface}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".55rem" }}>🔄</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: ".9rem", color: T.ink, display: "flex", alignItems: "center", gap: ".5rem" }}>
                              {rec.patientName}
                              <Chip label="Ativo" color={T.green} bg={T.greenL} dot />
                            </div>
                            <div style={{ fontSize: ".73rem", color: T.text3, marginTop: ".2rem" }}>
                              {PERIODICIDADE.find(p => p.key === rec.periodicidade)?.label || "Mensal"} · desde {fmtDate(rec.criadoEm?.slice(0, 10))} · por {rec.criadoPor}
                            </div>
                            {lastDisp && (
                              <div style={{ fontSize: ".72rem", color: T.text2, marginTop: ".1rem" }}>
                                Última retirada: {fmtDate(lastDisp.date)}
                              </div>
                            )}
                            {rec.obs && <div style={{ fontSize: ".73rem", color: T.text2, marginTop: ".15rem", fontStyle: "italic" }}>{rec.obs}</div>}
                          </div>
                        </div>

                        {/* Insumos */}
                        <div style={{ flex: "1 1 200px" }}>
                          <div style={{ fontSize: ".68rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".4rem" }}>Insumos periódicos</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
                            {Object.entries(rec.itens).filter(([, v]) => v > 0).map(([id, qty]) => {
                              const ins = CATALOGO.find(c => c.id === id);
                              return <Chip key={id} label={`${ins?.nome}: ${qty} ${ins?.unidade}`} color={T.teal} style={{ fontSize: ".65rem" }} />;
                            })}
                            {Object.values(rec.itens).every(v => !v) && <span style={{ fontSize: ".75rem", color: T.text3 }}>Sem itens definidos</span>}
                          </div>
                        </div>

                        {/* Ações */}
                        <div style={{ display: "flex", gap: ".4rem", flexShrink: 0, flexWrap: "wrap" }}>
                          {isNurse && (
                            <>
                              <Btn size="sm" variant="secondary" onClick={() => {
                                setEditRecorrente(rec);
                                setRecForm({ patientId: rec.patientId, patientName: rec.patientName, itens: { ...rec.itens }, obs: rec.obs || "", periodicidade: rec.periodicidade || "monthly" });
                                setShowRecorrenteModal(true);
                              }}>
                                ✏️ Editar
                              </Btn>
                              <Btn size="sm" variant="ghost" style={{ color: T.rose, border: `1px solid ${T.rose}30` }}
                                onClick={() => {
                                  if (confirm(`Encerrar status recorrente de ${rec.patientName}? O paciente precisará ser marcado novamente pela enfermeira.`)) {
                                    encerrarRecorrente(rec.id);
                                  }
                                }}>
                                Encerrar
                              </Btn>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Histórico de encerrados */}
          {recorrentes.filter(r => !r.ativo).length > 0 && (
            <div>
              <Divider label={`Encerrados · ${recorrentes.filter(r => !r.ativo).length}`} style={{ marginTop: ".5rem", marginBottom: ".75rem" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
                {recorrentes.filter(r => !r.ativo).map(rec => (
                  <Card key={rec.id} style={{ padding: ".85rem 1.1rem", opacity: .65, borderLeft: `4px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
                      <Avatar name={rec.patientName} size={34} color={T.text3} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: ".85rem", color: T.text2 }}>{rec.patientName}</div>
                        <div style={{ fontSize: ".72rem", color: T.text3 }}>
                          {fmtDate(rec.criadoEm?.slice(0, 10))} → {fmtDate(rec.encerradoEm?.slice(0, 10))} · encerrado por {rec.encerradoPor || "Profissional"}
                        </div>
                      </div>
                      {isNurse && (
                        <div style={{ display: "flex", gap: ".35rem" }}>
                          <Btn size="sm" variant="outline" onClick={() => reativarRecorrente(rec.id)}>Reativar</Btn>
                          <Btn size="sm" variant="ghost" style={{ color: T.rose }} onClick={() => { if (confirm("Remover permanentemente este registro?")) removerRecorrente(rec.id); }}>Remover</Btn>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Estoque ── */}
      {tab === "estoque" && (
        <Card style={{ padding: "1.25rem" }} className="sig-fade">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: ".5rem" }}>
            <div>
              <div style={{ fontSize: ".75rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em" }}>Controle de Estoque</div>
              <div style={{ fontSize: ".78rem", color: T.text2, marginTop: ".15rem" }}>RENAME / DAF-MS · {canStock ? "Modo edição" : "Somente visualização"}</div>
            </div>
            <SearchBar value={stockSearch} onChange={setStockSearch} placeholder="Filtrar insumos..." style={{ minWidth: 200 }} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
              <thead>
                <tr style={{ background: T.surface2 }}>
                  {["Insumo","Categoria","Estoque","Mín. alerta","Status","Regulação",canStock ? "Ações" : ""].filter(Boolean).map(h => (
                    <th key={h} style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtStock.map((ins, i) => {
                  const qty = getQty(ins.id);
                  const semEst = qty === 0;
                  const baixo = qty > 0 && qty <= ins.alerta;
                  const statusColor = semEst ? T.rose : baixo ? T.amber : T.green;
                  const statusLabel = semEst ? "Sem estoque" : baixo ? "Baixo" : "Normal";
                  const statusBg = semEst ? T.roseL : baixo ? T.amberL : T.greenL;
                  return (
                    <tr key={ins.id} className="sig-row" style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? T.surface : T.surface2 }}>
                      <td style={{ padding: ".65rem .85rem", fontWeight: 700, color: T.ink }}>{ins.nome}</td>
                      <td style={{ padding: ".65rem .85rem" }}><Chip label={ins.categoria} color={T.indigo} bg={T.indigoL} /></td>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                          <span style={{ fontFamily: T.fontMono, fontWeight: 800, fontSize: ".9rem", color: statusColor }}>{qty}</span>
                          <span style={{ color: T.text3, fontSize: ".72rem" }}>{ins.unidade}</span>
                          <div style={{ width: 60, height: 4, borderRadius: 99, background: T.surface3 }}>
                            <div style={{ height: "100%", borderRadius: 99, background: statusColor, width: `${Math.min(100, (qty / 60) * 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: ".65rem .85rem", fontFamily: T.fontMono, color: T.text3 }}>{ins.alerta}</td>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", padding: ".2rem .6rem", borderRadius: 99, fontSize: ".7rem", fontWeight: 700, color: statusColor, background: statusBg }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor }} /> {statusLabel}
                        </span>
                      </td>
                      <td style={{ padding: ".65rem .85rem", fontSize: ".72rem", color: T.text3 }}>RENAME/DAF</td>
                      {canStock && (
                        <td style={{ padding: ".65rem .85rem" }}>
                          <Btn size="sm" variant="outline" onClick={() => { setShowStockModal(ins); setEntradaQty(""); }}>
                            + Entrada
                          </Btn>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Tab: Histórico ── */}
      {tab === "historico" && (
        <Card style={{ padding: "1.25rem" }} className="sig-fade">
          <div style={{ fontSize: ".75rem", fontWeight: 800, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "1rem" }}>
            Histórico de Dispensações · {dispensas.length} registro(s)
          </div>
          {dispensas.length === 0 ? (
            <EmptyState icon="📋" title="Nenhuma dispensação registrada" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
                <thead>
                  <tr style={{ background: T.surface2 }}>
                    {["Data","Paciente","Itens","Profissional"].map(h => (
                      <th key={h} style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, fontSize: ".72rem", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dispensas.slice(0, 50).map((d, i) => (
                    <tr key={d.id} className="sig-row" style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: ".65rem .85rem", fontFamily: T.fontMono, color: T.text2 }}>{fmtDate(d.date)}</td>
                      <td style={{ padding: ".65rem .85rem", fontWeight: 700, color: T.ink }}>{d.patientName}</td>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
                          {(d.itens || []).map(it => {
                            const ins = CATALOGO.find(c => c.id === it.id);
                            return <Chip key={it.id} label={`${ins?.nome}: ${it.qty}`} color={T.teal} style={{ fontSize: ".65rem" }} />;
                          })}
                        </div>
                      </td>
                      <td style={{ padding: ".65rem .85rem", color: T.text3, fontSize: ".78rem" }}>{d.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modal: Marcar/Editar Recorrente */}
      {showRecorrenteModal && (
        <Modal
          title={editRecorrente ? "Editar Recorrente" : "Marcar como Recorrente"}
          sub="Define a prescrição periódica de insumos para este paciente"
          onClose={() => { setShowRecorrenteModal(false); setEditRecorrente(null); }}
          maxWidth={600}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            {/* Aviso de quem tem permissão */}
            <div style={{ padding: ".65rem 1rem", borderRadius: T.r, background: T.teal50, border: `1px solid ${T.teal}30`, fontSize: ".78rem", color: T.tealD, fontWeight: 600 }}>
              🛡️ Somente a <strong>enfermeira</strong> pode marcar, editar e encerrar o status de recorrente. O farmacêutico acessa para controle de estoque.
            </div>

            {!editRecorrente && (
              <InputField label="Paciente">
                <input style={styledInput()} placeholder="Nome do paciente..."
                  value={recForm.patientName}
                  onChange={e => setRecForm(f => ({ ...f, patientName: e.target.value, patientId: "" }))}
                  onFocus={e => { e.target.style.borderColor = T.teal; }}
                  onBlur={e => { e.target.style.borderColor = T.border; }} />
                {recForm.patientName && !recForm.patientId && (
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: ".25rem", boxShadow: T.shadowMd, background: T.surface, maxHeight: 150, overflowY: "auto" }}>
                    {patients.filter(p => p.name.toLowerCase().includes(recForm.patientName.toLowerCase())).slice(0, 6).map(p => (
                      <button key={p.id} type="button"
                        onClick={() => setRecForm(f => ({ ...f, patientId: p.id, patientName: p.name }))}
                        style={{ width: "100%", padding: ".5rem .85rem", border: "none", borderBottom: `1px solid ${T.border}`, background: "none", cursor: "pointer", textAlign: "left", fontSize: ".82rem", color: T.ink, display: "flex", alignItems: "center", gap: ".6rem" }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        <Avatar name={p.name} size={24} color={catColor(p.careCategory)} />
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </InputField>
            )}

            {editRecorrente && (
              <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".75rem", background: T.surface2, borderRadius: T.r }}>
                <Avatar name={editRecorrente.patientName} size={36} color={T.teal} />
                <div>
                  <div style={{ fontWeight: 800, color: T.ink }}>{editRecorrente.patientName}</div>
                  <div style={{ fontSize: ".72rem", color: T.text3 }}>Paciente recorrente desde {fmtDate(editRecorrente.criadoEm?.slice(0,10))}</div>
                </div>
              </div>
            )}

            <InputField label="Periodicidade">
              <select style={styledInput()} value={recForm.periodicidade} onChange={e => setRecForm(f => ({ ...f, periodicidade: e.target.value }))}>
                {PERIODICIDADE.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </InputField>

            {/* Seleção de insumos padrão */}
            <div>
              <FieldLabel>Insumos periódicos (prescrição padrão)</FieldLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: ".4rem", marginTop: ".3rem" }}>
                {CATALOGO.map(ins => {
                  const qty = recForm.itens[ins.id] || 0;
                  return (
                    <div key={ins.id} style={{
                      padding: ".6rem .75rem", borderRadius: T.r,
                      border: `1.5px solid ${qty > 0 ? T.teal : T.border}`,
                      background: qty > 0 ? T.teal50 : T.surface, transition: "all .15s",
                    }}>
                      <div style={{ fontSize: ".75rem", fontWeight: 700, color: T.ink, marginBottom: ".3rem" }}>{ins.nome}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: ".35rem" }}>
                        <button type="button" onClick={() => setRecForm(f => ({ ...f, itens: { ...f.itens, [ins.id]: Math.max(0, qty - 1) } }))}
                          style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", fontWeight: 800, fontSize: ".9rem", display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2 }}>−</button>
                        <span style={{ minWidth: 24, textAlign: "center", fontWeight: 900, fontSize: ".82rem", color: qty > 0 ? T.tealD : T.text3, fontFamily: T.fontMono }}>{qty}</span>
                        <button type="button" onClick={() => setRecForm(f => ({ ...f, itens: { ...f.itens, [ins.id]: Math.min(ins.qtdMax, qty + 1) } }))}
                          style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", fontWeight: 800, fontSize: ".9rem", display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2 }}>+</button>
                        <span style={{ fontSize: ".65rem", color: T.text3 }}>{ins.unidade}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <InputField label="Observações (opcional)">
              <textarea style={{ ...styledInput(), minHeight: 60, resize: "vertical" }} placeholder="Ex: paciente em cuidados paliativos, usar fraldas G..."
                value={recForm.obs} onChange={e => setRecForm(f => ({ ...f, obs: e.target.value }))} />
            </InputField>

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => { setShowRecorrenteModal(false); setEditRecorrente(null); }}>Cancelar</Btn>
              <Btn variant="primary"
                disabled={!recForm.patientName && !editRecorrente}
                onClick={() => {
                  if (editRecorrente) {
                    atualizarRecorrente(editRecorrente.id, { itens: recForm.itens, obs: recForm.obs, periodicidade: recForm.periodicidade });
                  } else {
                    const pat = patients.find(p => p.id === recForm.patientId) || { id: recForm.patientId || "ext", name: recForm.patientName };
                    marcarRecorrente(pat, recForm.itens);
                  }
                  setShowRecorrenteModal(false);
                  setEditRecorrente(null);
                }}>
                ✓ {editRecorrente ? "Salvar alterações" : "Marcar como Recorrente"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Entrada de Estoque */}
      {showStockModal && (
        <Modal title={`Entrada de Estoque`} sub={showStockModal.nome} onClose={() => setShowStockModal(null)} maxWidth={400}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
            <div style={{ padding: ".75rem", background: T.surface2, borderRadius: T.r, fontSize: ".82rem" }}>
              <strong>Estoque atual:</strong> <span style={{ fontFamily: T.fontMono, fontWeight: 800, color: T.teal }}>{getQty(showStockModal.id)} {showStockModal.unidade}</span>
            </div>
            <InputField label="Quantidade a adicionar *">
              <input type="number" min="1" autoFocus style={styledInput()} placeholder="Ex: 50" value={entradaQty}
                onChange={e => setEntradaQty(e.target.value)}
                onFocus={e => { e.target.style.borderColor = T.teal; }}
                onBlur={e => { e.target.style.borderColor = T.border; }} />
            </InputField>
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowStockModal(null)}>Cancelar</Btn>
              <Btn variant="primary" onClick={() => {
                const n = Number(entradaQty);
                if (!n || n <= 0) return;
                const curr = stock.find(s => s.id === showStockModal.id);
                const newStock = curr
                  ? stock.map(s => s.id === showStockModal.id ? { ...s, qty: (s.qty || 0) + n } : s)
                  : [...stock, { id: showStockModal.id, qty: n, minQty: showStockModal.alerta }];
                setStock(newStock);
                setShowStockModal(null);
              }} disabled={!entradaQty || Number(entradaQty) <= 0}>
                ✓ Confirmar Entrada
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRONTUÁRIO — versão elevada (re-exportando com melhorias visuais)
   A lógica existente em NewPages.jsx (ProntuarioPage) permanece.
   Este wrapper adiciona uma camada visual superior.
═══════════════════════════════════════════════════════════════════ */

/**
 * ProntuarioPageWrapper — apenas exporta o componente com os tokens visuais
 * para uso em AppInner sem quebrar a lógica existente.
 * O AppInner deve continuar usando ProntuarioPage de NewPages.jsx
 * mas pode opcionalmente usar este wrapper que aplica a mesma paleta.
 */
export { T as SigusTokens };
