import { useState, useEffect, useRef, useMemo } from "react";
import {
  listAppointments, createAppointment, deleteAppointment,
  listTasks, createTask, updateTaskStatus,
  listMessages, sendMessage,
  createPatient, listPatients,
  createRecord, getPatientHistory,
} from "./api";

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS (locais – duplicados do App.jsx para manter este arquivo autônomo)
───────────────────────────────────────────────────────────────────────────── */
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
    nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS",
    pharmacist: "Farmacêutico(a)", pharmacy_tech: "Téc. de Farmácia",
    nursing_tech: "Téc. Enfermagem", receptionist: "Recepcionista",
    dentist: "Dentista", gestor: "Gestor(a) UBS",
  }[String(role || "").toLowerCase()] || role || "-";
}
function catLabel(templates, category) {
  return templates?.find(t => t.category === category)?.label || category || "Geral";
}
function isAcs(user) { return String(user?.role || "") === "acs"; }
function isManager(user) { return String(user?.role || "") === "nurse_manager"; }
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

/* ─────────────────────────────────────────────────────────────────────────────
   1. NOTIFICATION BELL
   Usado em: Topbar (linha 1308 do App.jsx)
   Props: patients, protocolByPatient, pharmacyStock, agenda, onNavigate
───────────────────────────────────────────────────────────────────────────── */
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
    // Protocolos críticos
    (patients || []).forEach(p => {
      const s = protocolByPatient?.[p.id];
      if (!s) return;
      const pending = (s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0);
      if (pending > 0) {
        out.push({ id: "prot-" + p.id, type: "danger", title: "Protocolo pendente", detail: p.name + " – " + pending + " item(s)", patientId: p.id });
      }
    });
    // Estoque baixo
    (pharmacyStock || []).forEach(s => {
      if (Number(s.qty ?? 0) <= Number(s.minQty ?? 0)) {
        out.push({ id: "stk-" + s.id, type: s.qty === 0 ? "danger" : "warn", title: s.qty === 0 ? "Estoque zerado" : "Estoque baixo", detail: s.name || s.id, patientId: null });
      }
    });
    // Agendamentos hoje
    (agenda || []).filter(a => a.date === todayStr).slice(0, 5).forEach(a => {
      out.push({ id: "ag-" + (a.id || a.date), type: "info", title: "Agendamento hoje", detail: a.patientName || a.title || "Consulta", patientId: a.patientId || null });
    });
    return out.slice(0, 30);
  }, [patients, protocolByPatient, pharmacyStock, agenda]);

  const count = alerts.length;
  const danger = alerts.filter(a => a.type === "danger").length;
  const badgeColor = danger > 0 ? "#ef4444" : count > 0 ? "#f59e0b" : "transparent";

  const typeStyle = { danger: { bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" }, warn: { bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" }, info: { bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" } };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: ".3rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r-md)", color: "var(--text-2)" }}
        title="Notificações"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
          <path d="M8 1a5 5 0 015 5v2.5l1 2H2l1-2V6a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span style={{ position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 999, background: badgeColor, color: "#fff", fontSize: ".62rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1, border: "2px solid var(--surface)" }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 320, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", boxShadow: "0 8px 32px rgba(0,0,0,.12)", zIndex: 1000, overflow: "hidden" }}>
          <div style={{ padding: ".65rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)" }}>Notificações</span>
            <span style={{ fontSize: ".72rem", color: "var(--text-3)", background: "var(--surface-2)", padding: ".1rem .45rem", borderRadius: 999 }}>{count}</span>
          </div>
          {count === 0 ? (
            <div style={{ padding: "1.5rem 1rem", textAlign: "center", color: "var(--text-3)", fontSize: ".82rem" }}>Nenhuma notificação pendente</div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: ".35rem 0", maxHeight: 340, overflowY: "auto" }}>
              {alerts.map(a => {
                const s = typeStyle[a.type] || typeStyle.info;
                return (
                  <li key={a.id}
                    onClick={() => { if (a.patientId) { onNavigate(a.patientId); setOpen(false); } }}
                    style={{ display: "flex", alignItems: "flex-start", gap: ".6rem", padding: ".55rem 1rem", cursor: a.patientId ? "pointer" : "default", transition: "background .1s", borderLeft: `3px solid ${s.dot}` }}
                    onMouseEnter={e => { if (a.patientId) e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, marginTop: 5, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: ".78rem", color: "var(--ink)" }}>{a.title}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.detail}</div>
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

/* ─────────────────────────────────────────────────────────────────────────────
   2. QUEUE PAGE – Fila de Espera / Recepção
   Props: patients, users, user, token, onNewPatient
───────────────────────────────────────────────────────────────────────────── */
const QUEUE_KEY = "saudeubs_queue_v1";

export function QueuePage({ patients, users, user, token, onNewPatient }) {
  const [queue, setQueue] = useState(() => readLS(QUEUE_KEY, []));
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ patientId: "", reason: "", priority: "normal" });
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState("existing"); // "existing" | "quick"
  const [busy, setBusy] = useState(false);

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY, q); }

  function addToQueue(e) {
    e.preventDefault();
    if (addMode === "existing" && !form.patientId) return;
    if (addMode === "quick" && !quickName.trim()) return;

    let patient = null;
    if (addMode === "existing") {
      patient = patients.find(p => p.id === form.patientId);
    }

    const entry = {
      id: Date.now().toString(36),
      patientId: patient?.id || null,
      patientName: patient?.name || quickName.trim(),
      phone: patient?.phone || quickPhone.trim(),
      reason: form.reason.trim() || "Atendimento",
      priority: form.priority,
      arrivedAt: new Date().toISOString(),
      status: "waiting",
    };
    saveQueue([...queue, entry]);
    setForm({ patientId: "", reason: "", priority: "normal" });
    setQuickName(""); setQuickPhone(""); setAdding(false);
  }

  function removeEntry(id) { saveQueue(queue.filter(e => e.id !== id)); }
  function callNext(id) { saveQueue(queue.map(e => e.id === id ? { ...e, status: "called" } : e)); }
  function finishEntry(id) { saveQueue(queue.filter(e => e.id !== id)); }

  const waiting = queue.filter(e => e.status === "waiting");
  const called = queue.filter(e => e.status === "called");
  const filtered = patients.filter(p => matchesSearch(p, search));

  const priorityColor = { urgent: "#ef4444", high: "#f59e0b", normal: "#3b82f6" };
  const priorityLabel = { urgent: "Urgente", high: "Prioritário", normal: "Normal" };

  return (
    <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.25rem", alignItems: "start" }}>
      {/* Fila principal */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Fila de Espera</h2>
            <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>{waiting.length} aguardando · {called.length} em atendimento</p>
          </div>
          <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: ".4rem", padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".82rem", fontWeight: 600 }}>
            + Adicionar à fila
          </button>
        </div>

        {/* Em atendimento */}
        {called.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".5rem" }}>Em atendimento</div>
            {called.map(entry => (
              <QueueCard key={entry.id} entry={entry} onFinish={() => finishEntry(entry.id)} status="called" priorityColor={priorityColor} priorityLabel={priorityLabel} />
            ))}
          </div>
        )}

        {/* Aguardando */}
        <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".5rem" }}>Aguardando ({waiting.length})</div>
        {waiting.length === 0
          ? <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-3)", fontSize: ".84rem" }}>Fila vazia – nenhum paciente aguardando</div>
          : waiting.map((entry, idx) => (
            <QueueCard key={entry.id} entry={entry} position={idx + 1} onCall={() => callNext(entry.id)} onRemove={() => removeEntry(entry.id)} status="waiting" priorityColor={priorityColor} priorityLabel={priorityLabel} />
          ))
        }
      </div>

      {/* Painel lateral – adicionar à fila */}
      <div style={{ position: "sticky", top: "1.5rem" }}>
        {adding ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: ".9rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Adicionar à fila</h3>
              <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            <div style={{ display: "flex", gap: ".4rem", marginBottom: "1rem" }}>
              {["existing", "quick"].map(m => (
                <button key={m} onClick={() => setAddMode(m)}
                  style={{ flex: 1, padding: ".35rem", fontSize: ".75rem", fontWeight: 600, borderRadius: "var(--r-md)", border: "1px solid var(--border)", cursor: "pointer", background: addMode === m ? "var(--teal-600)" : "var(--surface-2)", color: addMode === m ? "#fff" : "var(--text-2)" }}>
                  {m === "existing" ? "Paciente cadastrado" : "Cadastro rápido"}
                </button>
              ))}
            </div>

            <form onSubmit={addToQueue} style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              {addMode === "existing" ? (
                <>
                  <input placeholder="Buscar paciente..." value={search} onChange={e => setSearch(e.target.value)} />
                  <select value={form.patientId} onChange={e => setForm(s => ({ ...s, patientId: e.target.value }))} required>
                    <option value="">Selecionar paciente…</option>
                    {filtered.slice(0, 20).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <input placeholder="Nome do paciente *" value={quickName} onChange={e => setQuickName(e.target.value)} required />
                  <input placeholder="Telefone" value={quickPhone} onChange={e => setQuickPhone(formatPhone(e.target.value))} />
                </>
              )}
              <input placeholder="Motivo do atendimento" value={form.reason} onChange={e => setForm(s => ({ ...s, reason: e.target.value }))} />
              <select value={form.priority} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))}>
                <option value="normal">Normal</option>
                <option value="high">Prioritário</option>
                <option value="urgent">Urgente</option>
              </select>
              <button type="submit" disabled={busy} style={{ padding: ".5rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", fontWeight: 600, cursor: "pointer", fontSize: ".84rem" }}>
                Adicionar à fila
              </button>
            </form>
          </div>
        ) : (
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.75rem", marginBottom: ".5rem" }}>👥</div>
            <div style={{ fontSize: ".84rem", fontWeight: 600, color: "var(--ink)", marginBottom: ".25rem" }}>Fila de espera</div>
            <div style={{ fontSize: ".75rem", color: "var(--text-3)" }}>Gerencie a chegada dos pacientes na unidade</div>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({ entry, position, onCall, onRemove, onFinish, status, priorityColor, priorityLabel }) {
  const elapsed = Math.floor((Date.now() - new Date(entry.arrivedAt).getTime()) / 60000);
  const pColor = priorityColor[entry.priority] || "#3b82f6";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".7rem .9rem", background: status === "called" ? "#f0fdf4" : "var(--surface)", border: `1px solid ${status === "called" ? "#bbf7d0" : "var(--border)"}`, borderRadius: "var(--r-md)", marginBottom: ".4rem", borderLeft: `4px solid ${pColor}` }}>
      {position && <span style={{ fontSize: ".9rem", fontWeight: 800, color: "var(--text-3)", minWidth: 24, textAlign: "center" }}>{position}</span>}
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".75rem", fontWeight: 700, flexShrink: 0 }}>
        {initials(entry.patientName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: ".84rem", color: "var(--ink)" }}>{entry.patientName}</div>
        <div style={{ fontSize: ".72rem", color: "var(--text-3)" }}>{entry.reason} · {elapsed}min</div>
      </div>
      <span style={{ fontSize: ".68rem", fontWeight: 700, padding: ".12rem .45rem", borderRadius: 999, background: pColor + "1a", color: pColor, border: `1px solid ${pColor}33`, flexShrink: 0 }}>
        {priorityLabel[entry.priority]}
      </span>
      <div style={{ display: "flex", gap: ".35rem" }}>
        {status === "waiting" && (
          <>
            <button onClick={onCall} style={{ padding: ".28rem .65rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>Chamar</button>
            <button onClick={onRemove} style={{ padding: ".28rem .65rem", background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".72rem" }}>✕</button>
          </>
        )}
        {status === "called" && (
          <button onClick={onFinish} style={{ padding: ".28rem .65rem", background: "#16a34a", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>Finalizar</button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. TRIAGE PAGE – Triagem
   Props: patients, users, user
───────────────────────────────────────────────────────────────────────────── */
const TRIAGE_KEY = "saudeubs_triage_v1";

export function TriagePage({ patients, users, user }) {
  const [records, setRecords] = useState(() => readLS(TRIAGE_KEY, []));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ bp: "", temp: "", weight: "", height: "", spo2: "", hr: "", rr: "", pain: "0", glicemia: "", notes: "", priority: "green" });
  const [saved, setSaved] = useState(false);

  function saveRecords(r) { setRecords(r); writeLS(TRIAGE_KEY, r); }

  function openTriage(p) {
    const existing = records.find(r => r.patientId === p.id && r.date === new Date().toISOString().slice(0, 10));
    setSelected(p);
    if (existing) {
      setForm({ bp: existing.bp || "", temp: existing.temp || "", weight: existing.weight || "", height: existing.height || "", spo2: existing.spo2 || "", hr: existing.hr || "", rr: existing.rr || "", pain: existing.pain || "0", glicemia: existing.glicemia || "", notes: existing.notes || "", priority: existing.priority || "green" });
    } else {
      setForm({ bp: "", temp: "", weight: "", height: "", spo2: "", hr: "", rr: "", pain: "0", glicemia: "", notes: "", priority: "green" });
    }
    setSaved(false);
  }

  function submitTriage(e) {
    e.preventDefault();
    if (!selected) return;
    const entry = {
      id: Date.now().toString(36),
      patientId: selected.id,
      patientName: selected.name,
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      ...form,
      createdBy: user?.id,
      createdByName: user?.name,
    };
    saveRecords([entry, ...records.filter(r => !(r.patientId === selected.id && r.date === entry.date))]);
    setSaved(true);
  }

  const priorityColors = {
    red: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", label: "Emergência (Vermelho)" },
    orange: { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", label: "Urgente (Laranja)" },
    yellow: { bg: "#fefce8", border: "#fef08a", text: "#a16207", label: "Pouco urgente (Amarelo)" },
    green: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", label: "Não urgente (Verde)" },
    blue: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "Observação (Azul)" },
  };

  const filtered = patients.filter(p => matchesSearch(p, search));
  const todayRecords = records.filter(r => r.date === new Date().toISOString().slice(0, 10));

  return (
    <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.25rem", alignItems: "start" }}>
      {/* Lista de pacientes */}
      <div>
        <div style={{ marginBottom: ".75rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ink)", margin: "0 0 .5rem" }}>Triagem</h2>
          <input placeholder="Buscar paciente…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: ".3rem", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {filtered.slice(0, 30).map(p => {
            const triaged = todayRecords.find(r => r.patientId === p.id);
            const pc = triaged ? priorityColors[triaged.priority] || priorityColors.green : null;
            return (
              <div key={p.id} onClick={() => openTriage(p)}
                style={{ display: "flex", alignItems: "center", gap: ".6rem", padding: ".55rem .75rem", background: selected?.id === p.id ? "var(--teal-50, #f0fdfa)" : "var(--surface)", border: `1px solid ${selected?.id === p.id ? "var(--teal-200, #99f6e4)" : "var(--border)"}`, borderRadius: "var(--r-md)", cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 700, flexShrink: 0 }}>{initials(p.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: ".8rem", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  {triaged && <div style={{ fontSize: ".65rem", fontWeight: 600, color: pc.text }}>{pc.label}</div>}
                </div>
                {triaged && <div style={{ width: 10, height: 10, borderRadius: "50%", background: pc.text, flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Formulário de triagem */}
      {selected ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: "1.25rem" }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{initials(selected.name)}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--ink)" }}>{selected.name}</div>
              <div style={{ fontSize: ".75rem", color: "var(--text-3)" }}>{calcAge(selected.birthDate) || "Idade não informada"} · {selected.phone || "Sem telefone"}</div>
            </div>
          </div>

          {saved && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "var(--r-md)", padding: ".65rem 1rem", color: "#15803d", fontSize: ".82rem", fontWeight: 600, marginBottom: "1rem" }}>✓ Triagem salva com sucesso</div>}

          <form onSubmit={submitTriage}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: ".65rem", marginBottom: "1rem" }}>
              {[["bp", "PA (mmHg)", "ex: 120/80"], ["hr", "FC (bpm)", "ex: 72"], ["rr", "FR (irpm)", "ex: 16"], ["temp", "Temp (°C)", "ex: 36.5"], ["spo2", "SpO₂ (%)", "ex: 98"], ["weight", "Peso (kg)", "ex: 70"], ["height", "Altura (cm)", "ex: 170"], ["glicemia", "Glicemia", "ex: 95"]].map(([field, label, placeholder]) => (
                <label key={field} style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".75rem", fontWeight: 600, color: "var(--slate-700)" }}>
                  {label}
                  <input value={form[field]} onChange={e => setForm(s => ({ ...s, [field]: e.target.value }))} placeholder={placeholder} style={{ fontSize: ".82rem" }} />
                </label>
              ))}
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".75rem", fontWeight: 600, color: "var(--slate-700)", marginBottom: ".65rem" }}>
              Escala de dor (0–10): <strong style={{ fontSize: "1rem", color: "var(--ink)" }}>{form.pain}</strong>
              <input type="range" min="0" max="10" value={form.pain} onChange={e => setForm(s => ({ ...s, pain: e.target.value }))} />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".75rem", fontWeight: 600, color: "var(--slate-700)", marginBottom: ".65rem" }}>
              Classificação de risco
              <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                {Object.entries(priorityColors).map(([key, c]) => (
                  <button key={key} type="button" onClick={() => setForm(s => ({ ...s, priority: key }))}
                    style={{ padding: ".3rem .7rem", borderRadius: "var(--r-md)", border: `2px solid ${form.priority === key ? c.text : c.border}`, background: c.bg, color: c.text, cursor: "pointer", fontSize: ".72rem", fontWeight: 700 }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".75rem", fontWeight: 600, color: "var(--slate-700)", marginBottom: "1rem" }}>
              Observações
              <textarea value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={3} placeholder="Queixa principal, alergias, observações…" />
            </label>

            <button type="submit" style={{ padding: ".55rem 1.25rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", fontWeight: 700, cursor: "pointer", fontSize: ".84rem" }}>
              Salvar triagem
            </button>
          </form>
        </div>
      ) : (
        <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "3rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".75rem" }}>🩺</div>
          <div style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--ink)", marginBottom: ".35rem" }}>Selecione um paciente</div>
          <div style={{ fontSize: ".78rem", color: "var(--text-3)" }}>Clique em um paciente na lista para iniciar a triagem</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   4. AGENDA PAGE – Agendamentos
   Props: patients, users, user, token, teams, onNewPatient, onPatientCreated, onNavigatePatient
───────────────────────────────────────────────────────────────────────────── */
const AGENDA_KEY = "saudeubs_agenda_v1";

export function AgendaPage({ patients, users, user, token, teams, onNewPatient, onPatientCreated, onNavigatePatient }) {
  const authHeader = { "Authorization": `Bearer ${token}` };
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState(() => readLS(AGENDA_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: "", time: "", type: "consultation", notes: "", professional: "" });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Days with appointments for the mini-calendar header
  const daysWithAppts = useMemo(() => {
    const s = new Set();
    appointments.forEach(a => s.add(a.date));
    return s;
  }, [appointments]);

  // Build week view
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

  const dayAppointments = appointments.filter(a => a.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  async function submitForm(e) {
    e.preventDefault();
    setError("");
    if (!form.patientId || !form.time) { setError("Selecione paciente e horário."); return; }
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
      // Try to also persist to API
      try {
        await createAppointment(token, form.patientId, { date: selectedDate, demandType: "scheduled", summary: form.type === "consultation" ? "Consulta agendada" : form.type, conduct: "", nextStep: form.notes });
      } catch {}
      setShowForm(false);
      setForm({ patientId: "", time: "", type: "consultation", notes: "", professional: "" });
    } catch (err) { setError(err.message || "Erro ao agendar."); }
    finally { setBusy(false); }
  }

  function removeAppt(id) {
    const updated = appointments.filter(a => a.id !== id);
    setAppointments(updated);
    writeLS(AGENDA_KEY, updated);
  }

  const filteredPatients = patients.filter(p => matchesSearch(p, search));
  const typeLabel = { consultation: "Consulta", return: "Retorno", exam: "Exame", procedure: "Procedimento", visit: "Visita domiciliar" };
  const typeColor = { consultation: "#0ea5e9", return: "#8b5cf6", exam: "#f59e0b", procedure: "#ef4444", visit: "#10b981" };
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Agenda</h2>
          <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>{fmtDate(selectedDate)}</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".82rem", fontWeight: 600 }}>
          + Novo agendamento
        </button>
      </div>

      {/* Week strip */}
      <div style={{ display: "flex", gap: ".4rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: ".5rem" }}>
        {weekDays.map(d => {
          const dt = new Date(d + "T12:00:00");
          const isToday = d === today;
          const isSel = d === selectedDate;
          const hasAppt = daysWithAppts.has(d);
          return (
            <button key={d} onClick={() => setSelectedDate(d)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: ".2rem", padding: ".4rem .2rem", borderRadius: "var(--r-md)", border: `2px solid ${isSel ? "var(--teal-600)" : "transparent"}`, background: isSel ? "var(--teal-600)" : isToday ? "var(--surface-2)" : "transparent", cursor: "pointer" }}>
              <span style={{ fontSize: ".65rem", color: isSel ? "#fff" : "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>{dayNames[dt.getDay()]}</span>
              <span style={{ fontSize: ".9rem", fontWeight: 700, color: isSel ? "#fff" : "var(--ink)" }}>{dt.getDate()}</span>
              {hasAppt && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? "#fff" : "var(--teal-600)" }} />}
            </button>
          );
        })}
      </div>

      {/* Day appointments */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
        {dayAppointments.length === 0 ? (
          <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-3)", fontSize: ".84rem" }}>
            Nenhum agendamento para {fmtDate(selectedDate)}
          </div>
        ) : (
          dayAppointments.map(a => {
            const tc = typeColor[a.type] || "#64748b";
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".7rem 1.1rem", borderBottom: "1px solid var(--border)", borderLeft: `4px solid ${tc}` }}>
                <div style={{ fontSize: ".78rem", fontFamily: "IBM Plex Mono", fontWeight: 600, color: "var(--text-2)", minWidth: 40 }}>{a.time || "--:--"}</div>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 700, flexShrink: 0 }}>{initials(a.patientName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: ".84rem", color: "var(--ink)" }}>{a.patientName}</div>
                  <div style={{ fontSize: ".72rem", color: "var(--text-3)" }}>{typeLabel[a.type] || a.type} {a.professional ? "· " + a.professional : ""}</div>
                </div>
                {a.notes && <div style={{ fontSize: ".72rem", color: "var(--text-3)", maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.notes}</div>}
                <div style={{ display: "flex", gap: ".35rem" }}>
                  {a.patientId && <button onClick={() => onNavigatePatient(a.patientId)} style={{ padding: ".25rem .55rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem" }}>Ver</button>}
                  <button onClick={() => removeAppt(a.id)} style={{ padding: ".25rem .55rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem", color: "#ef4444" }}>✕</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New appointment modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "1.5rem", width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,.15)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Novo agendamento – {fmtDate(selectedDate)}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>
            <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              <input placeholder="Buscar paciente…" value={search} onChange={e => setSearch(e.target.value)} />
              <select value={form.patientId} onChange={e => setForm(s => ({ ...s, patientId: e.target.value }))} required>
                <option value="">Selecionar paciente…</option>
                {filteredPatients.slice(0, 25).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".75rem", fontWeight: 600 }}>
                  Horário *<input type="time" value={form.time} onChange={e => setForm(s => ({ ...s, time: e.target.value }))} required />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".75rem", fontWeight: 600 }}>
                  Tipo
                  <select value={form.type} onChange={e => setForm(s => ({ ...s, type: e.target.value }))}>
                    {Object.entries(typeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <input placeholder="Profissional responsável" value={form.professional} onChange={e => setForm(s => ({ ...s, professional: e.target.value }))} />
              <textarea placeholder="Observações" value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={2} />
              {error && <p style={{ color: "#ef4444", fontSize: ".8rem", margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: ".45rem .9rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer" }}>Cancelar</button>
                <button type="submit" disabled={busy} style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontWeight: 600 }}>{busy ? "Salvando…" : "Agendar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. REFERRALS PAGE – Encaminhamentos
   Props: patients, users, user
───────────────────────────────────────────────────────────────────────────── */
const REFERRALS_KEY = "saudeubs_referrals_v1";

export function ReferralsPage({ patients, users, user }) {
  const [referrals, setReferrals] = useState(() => readLS(REFERRALS_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: "", specialty: "", reason: "", priority: "normal", notes: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

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

  const filtered = referrals.filter(r => filterStatus === "all" || r.status === filterStatus);
  const filteredPatients = patients.filter(p => matchesSearch(p, search));
  const statusInfo = { pending: { label: "Pendente", color: "#f59e0b", bg: "#fffbeb" }, scheduled: { label: "Agendado", color: "#3b82f6", bg: "#eff6ff" }, completed: { label: "Realizado", color: "#16a34a", bg: "#f0fdf4" }, cancelled: { label: "Cancelado", color: "#6b7280", bg: "#f9fafb" } };
  const priorityInfo = { urgent: { label: "Urgente", color: "#ef4444" }, high: { label: "Alta", color: "#f97316" }, normal: { label: "Normal", color: "#3b82f6" }, elective: { label: "Eletivo", color: "#6b7280" } };

  const SPECIALTIES = ["Cardiologia", "Neurologia", "Ortopedia", "Ginecologia", "Urologia", "Oftalmologia", "Dermatologia", "Psiquiatria", "Endocrinologia", "Gastroenterologia", "Pneumologia", "Nefrologia", "Oncologia", "Infectologia", "Reumatologia", "Fisioterapia", "Nutrição", "Psicologia", "Fonoaudiologia", "Outro"];

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Encaminhamentos</h2>
          <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>{referrals.length} encaminhamento(s) registrado(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".82rem", fontWeight: 600 }}>
          + Novo encaminhamento
        </button>
      </div>

      <div style={{ display: "flex", gap: ".4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {[["all", "Todos"], ["pending", "Pendentes"], ["scheduled", "Agendados"], ["completed", "Realizados"], ["cancelled", "Cancelados"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilterStatus(v)}
            style={{ padding: ".3rem .65rem", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontSize: ".75rem", fontWeight: 600, background: filterStatus === v ? "var(--teal-600)" : "var(--surface-2)", color: filterStatus === v ? "#fff" : "var(--text-2)" }}>
            {l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-3)", fontSize: ".84rem" }}>
          Nenhum encaminhamento encontrado
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
          {filtered.map(r => {
            const si = statusInfo[r.status] || statusInfo.pending;
            const pi = priorityInfo[r.priority] || priorityInfo.normal;
            return (
              <div key={r.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: ".85rem 1rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".75rem", flexShrink: 0 }}>{initials(r.patientName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap", marginBottom: ".25rem" }}>
                    <span style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--ink)" }}>{r.patientName}</span>
                    <span style={{ fontSize: ".75rem", fontWeight: 700, color: "#0ea5e9" }}>{r.specialty}</span>
                    <span style={{ fontSize: ".68rem", fontWeight: 600, padding: ".1rem .4rem", borderRadius: 999, background: si.bg, color: si.color }}>{si.label}</span>
                    <span style={{ fontSize: ".68rem", fontWeight: 600, color: pi.color }}>{pi.label}</span>
                  </div>
                  <div style={{ fontSize: ".78rem", color: "var(--text-2)", marginBottom: ".15rem" }}>{r.reason}</div>
                  {r.notes && <div style={{ fontSize: ".72rem", color: "var(--text-3)" }}>{r.notes}</div>}
                  <div style={{ fontSize: ".68rem", color: "var(--text-3)", marginTop: ".25rem" }}>Por {r.createdBy} · {fmtDate(r.createdAt?.slice(0, 10))}</div>
                </div>
                <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", flexShrink: 0 }}>
                  {r.status === "pending" && <button onClick={() => updateStatus(r.id, "scheduled")} style={{ padding: ".25rem .55rem", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem", fontWeight: 600 }}>Agendar</button>}
                  {r.status === "scheduled" && <button onClick={() => updateStatus(r.id, "completed")} style={{ padding: ".25rem .55rem", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem", fontWeight: 600 }}>Marcar como feito</button>}
                  {r.status !== "cancelled" && <button onClick={() => updateStatus(r.id, "cancelled")} style={{ padding: ".25rem .55rem", background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem" }}>Cancelar</button>}
                  <button onClick={() => removeReferral(r.id)} style={{ padding: ".25rem .55rem", background: "var(--surface-2)", color: "#ef4444", border: "1px solid #fecaca", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem" }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "1.5rem", width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,.15)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Novo encaminhamento</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>
            <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              <input placeholder="Buscar paciente…" value={search} onChange={e => setSearch(e.target.value)} />
              <select value={form.patientId} onChange={e => setForm(s => ({ ...s, patientId: e.target.value }))} required>
                <option value="">Selecionar paciente *</option>
                {filteredPatients.slice(0, 25).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={form.specialty} onChange={e => setForm(s => ({ ...s, specialty: e.target.value }))} required>
                <option value="">Especialidade *</option>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input placeholder="Motivo do encaminhamento *" value={form.reason} onChange={e => setForm(s => ({ ...s, reason: e.target.value }))} required />
              <select value={form.priority} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))}>
                <option value="elective">Eletivo</option><option value="normal">Normal</option><option value="high">Alta prioridade</option><option value="urgent">Urgente</option>
              </select>
              <textarea placeholder="Observações clínicas" value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={3} />
              <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: ".45rem .9rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer" }}>Cancelar</button>
                <button type="submit" style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontWeight: 600 }}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. ACS TASKS PAGE – Tarefas do ACS
   Props: patients, users, user, token, onNavigatePatient
───────────────────────────────────────────────────────────────────────────── */
export function AcsTasksPage({ patients, users, user, token, onNavigatePatient }) {
  const authHeader = { "Authorization": `Bearer ${token}` };
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patientId: "", title: "", notes: "", dueDate: "", assigneeId: user?.id || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    // Load tasks for visible patients (ACS sees their patients)
    const myPatients = isAcs(user)
      ? patients.filter(p => p.assignedAcsId === user?.id)
      : patients;

    Promise.all(
      myPatients.slice(0, 30).map(p =>
        fetch(`/patients/${p.id}/tasks`, { headers: authHeader })
          .then(r => r.ok ? r.json() : [])
          .then(ts => ts.map(t => ({ ...t, patientId: p.id, patientName: p.name })))
          .catch(() => [])
      )
    ).then(results => {
      setTasks(results.flat().sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")));
      setLoading(false);
    });
  }, [token, patients.length]);

  async function submitForm(e) {
    e.preventDefault();
    if (!form.patientId || !form.title) { setError("Paciente e título são obrigatórios."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/patients/${form.patientId}/tasks`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, notes: form.notes, dueDate: form.dueDate, assigneeId: form.assigneeId }),
      });
      if (!res.ok) throw new Error("Erro ao criar tarefa");
      const patient = patients.find(p => p.id === form.patientId);
      const created = await res.json();
      setTasks(prev => [{ ...created, patientId: form.patientId, patientName: patient?.name || "" }, ...prev]);
      setShowForm(false);
      setForm({ patientId: "", title: "", notes: "", dueDate: "", assigneeId: user?.id || "" });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function changeStatus(task, status) {
    try {
      await fetch(`/tasks/${task.id}/status`, { method: "PATCH", headers: { ...authHeader, "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    } catch {}
  }

  const myPatients = isAcs(user) ? patients.filter(p => p.assignedAcsId === user?.id) : patients;
  const filtered = tasks.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (search && !normalizeSearch(t.patientName || "").includes(normalizeSearch(search)) && !normalizeSearch(t.title || "").includes(normalizeSearch(search))) return false;
    return true;
  });

  const statusInfo = { pending: { label: "Pendente", color: "#f59e0b" }, in_progress: { label: "Em andamento", color: "#3b82f6" }, done: { label: "Concluída", color: "#16a34a" }, cancelled: { label: "Cancelada", color: "#6b7280" } };

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Tarefas ACS</h2>
          <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>{myPatients.length} paciente(s) vinculado(s) · {tasks.filter(t => t.status === "pending").length} tarefa(s) pendente(s)</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".82rem", fontWeight: 600 }}>
          + Nova tarefa
        </button>
      </div>

      <div style={{ display: "flex", gap: ".65rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input placeholder="Buscar por paciente ou título…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <div style={{ display: "flex", gap: ".35rem" }}>
          {[["all", "Todas"], ["pending", "Pendentes"], ["in_progress", "Em andamento"], ["done", "Concluídas"]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              style={{ padding: ".3rem .6rem", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontSize: ".73rem", fontWeight: 600, background: filterStatus === v ? "var(--teal-600)" : "var(--surface-2)", color: filterStatus === v ? "#fff" : "var(--text-2)" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-3)", fontSize: ".84rem" }}>Carregando tarefas…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "2.5rem", textAlign: "center", color: "var(--text-3)", fontSize: ".84rem" }}>Nenhuma tarefa encontrada</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
          {filtered.map(t => {
            const si = statusInfo[t.status] || statusInfo.pending;
            const overdue = t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && t.status === "pending";
            return (
              <div key={t.id} style={{ background: "var(--surface)", border: `1px solid ${overdue ? "#fecaca" : "var(--border)"}`, borderRadius: "var(--r-md)", padding: ".75rem 1rem", display: "flex", alignItems: "flex-start", gap: ".75rem", borderLeft: `4px solid ${overdue ? "#ef4444" : si.color}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".2rem" }}>
                    <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)" }}>{t.title}</span>
                    <span style={{ fontSize: ".68rem", fontWeight: 600, padding: ".1rem .4rem", borderRadius: 999, color: si.color, background: si.color + "15" }}>{si.label}</span>
                    {overdue && <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#ef4444" }}>⚠ Atrasada</span>}
                  </div>
                  <div style={{ display: "flex", gap: ".75rem", fontSize: ".72rem", color: "var(--text-3)", flexWrap: "wrap" }}>
                    <button onClick={() => onNavigatePatient(t.patientId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--teal-600)", fontWeight: 600, fontSize: ".72rem", padding: 0 }}>{t.patientName}</button>
                    {t.dueDate && <span>Prazo: {fmtDate(t.dueDate)}</span>}
                    {t.notes && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{t.notes}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: ".3rem", flexShrink: 0 }}>
                  {t.status === "pending" && <button onClick={() => changeStatus(t, "in_progress")} style={{ padding: ".25rem .55rem", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem", fontWeight: 600 }}>Iniciar</button>}
                  {(t.status === "pending" || t.status === "in_progress") && <button onClick={() => changeStatus(t, "done")} style={{ padding: ".25rem .55rem", background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".7rem", fontWeight: 600 }}>✓ Concluir</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "1.5rem", width: "100%", maxWidth: 460, boxShadow: "0 8px 40px rgba(0,0,0,.15)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Nova tarefa</h3>
              <button onClick={() => setShowForm(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>
            <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              <select value={form.patientId} onChange={e => setForm(s => ({ ...s, patientId: e.target.value }))} required>
                <option value="">Selecionar paciente *</option>
                {myPatients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input placeholder="Título da tarefa *" value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} required />
              <textarea placeholder="Descrição / observações" value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} rows={2} />
              <input type="date" value={form.dueDate} onChange={e => setForm(s => ({ ...s, dueDate: e.target.value }))} />
              <select value={form.assigneeId} onChange={e => setForm(s => ({ ...s, assigneeId: e.target.value }))}>
                <option value="">Responsável (opcional)</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} – {roleLabel(u.role)}</option>)}
              </select>
              {error && <p style={{ color: "#ef4444", fontSize: ".78rem", margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: ".45rem .9rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer" }}>Cancelar</button>
                <button type="submit" disabled={busy} style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontWeight: 600 }}>{busy ? "Salvando…" : "Criar tarefa"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   7. CHART PAGE – Prontuário centralizado (todas as consultas)
   Props: patients, users, user, token, onNavigatePatient
───────────────────────────────────────────────────────────────────────────── */
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
    consultation: { label: "Consulta", color: "#0ea5e9", icon: "🩺" },
    visit:        { label: "Visita", color: "#10b981", icon: "🏠" },
    vaccine:      { label: "Vacina", color: "#8b5cf6", icon: "💉" },
    exam:         { label: "Exame", color: "#f59e0b", icon: "🔬" },
    task:         { label: "Tarefa", color: "#6b7280", icon: "📋" },
    message:      { label: "Mensagem", color: "#64748b", icon: "💬" },
  };

  const typeCounts = useMemo(() => {
    const c = {};
    history.forEach(h => { c[h.type] = (c[h.type] || 0) + 1; });
    return c;
  }, [history]);

  return (
    <div style={{ padding: "1.5rem", display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.25rem", alignItems: "start", minHeight: 0 }}>
      {/* Patient list */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--ink)", margin: "0 0 .75rem" }}>Prontuário</h2>
        <input placeholder="Buscar paciente…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: ".5rem" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: ".25rem", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {filtered.slice(0, 40).map(p => (
            <div key={p.id} onClick={() => openPatient(p)}
              style={{ display: "flex", alignItems: "center", gap: ".55rem", padding: ".5rem .65rem", background: selectedId === p.id ? "var(--teal-50, #f0fdfa)" : "var(--surface)", border: `1px solid ${selectedId === p.id ? "var(--teal-200, #99f6e4)" : "var(--border)"}`, borderRadius: "var(--r-md)", cursor: "pointer" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".65rem", fontWeight: 700, flexShrink: 0 }}>{initials(p.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: ".78rem", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: ".65rem", color: "var(--text-3)" }}>{calcAge(p.birthDate) || "—"}</div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: ".8rem", padding: "1rem" }}>Nenhum paciente encontrado</div>}
        </div>
      </div>

      {/* History panel */}
      {selectedPatient ? (
        <div>
          {/* Patient header */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1.1rem 1.25rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: ".85rem" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: ".9rem", flexShrink: 0 }}>{initials(selectedPatient.name)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--ink)" }}>{selectedPatient.name}</div>
              <div style={{ fontSize: ".75rem", color: "var(--text-3)", display: "flex", gap: ".85rem", flexWrap: "wrap" }}>
                <span>{calcAge(selectedPatient.birthDate) || "Idade não informada"}</span>
                {selectedPatient.cpf && <span>CPF: {selectedPatient.cpf}</span>}
                {selectedPatient.phone && <span>{selectedPatient.phone}</span>}
              </div>
            </div>
            <button onClick={() => onNavigatePatient(selectedPatient.id)} style={{ padding: ".4rem .85rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".78rem", fontWeight: 600 }}>
              Ver ficha completa
            </button>
          </div>

          {/* Stats bar */}
          {history.length > 0 && (
            <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: ".75rem" }}>
              {Object.entries(typeCounts).map(([type, count]) => {
                const ti = typeInfo[type] || { label: type, color: "#64748b" };
                return (
                  <button key={type} onClick={() => setFilterType(f => f === type ? "all" : type)}
                    style={{ padding: ".28rem .6rem", borderRadius: 999, border: `1px solid ${filterType === type ? ti.color : "var(--border)"}`, background: filterType === type ? ti.color + "15" : "var(--surface-2)", color: filterType === type ? ti.color : "var(--text-3)", cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>
                    {ti.label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Records */}
          {loadingHistory ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-3)", fontSize: ".84rem" }}>Carregando prontuário…</div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "2.5rem", textAlign: "center", color: "var(--text-3)", fontSize: ".84rem" }}>
              {history.length === 0 ? "Nenhum registro no prontuário" : "Nenhum registro para o filtro selecionado"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
              {filteredHistory.map((h, i) => {
                const ti = typeInfo[h.type] || { label: h.type, color: "#64748b", icon: "📄" };
                return (
                  <div key={h.id || i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: ".8rem 1rem", borderLeft: `4px solid ${ti.color}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: ".75rem" }}>
                      <span style={{ fontSize: "1rem", flexShrink: 0 }}>{ti.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".2rem", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: ".85rem", color: "var(--ink)" }}>{h.title || ti.label}</span>
                          <span style={{ fontSize: ".68rem", fontWeight: 600, padding: ".1rem .4rem", borderRadius: 999, background: ti.color + "15", color: ti.color }}>{ti.label}</span>
                        </div>
                        {h.details && <div style={{ fontSize: ".75rem", color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{h.details}</div>}
                        <div style={{ display: "flex", gap: ".75rem", fontSize: ".68rem", color: "var(--text-3)", marginTop: ".3rem", flexWrap: "wrap" }}>
                          <span>{fmtDate(h.date)}{h.time ? " " + h.time : ""}</span>
                          {h.professionalName && <span>Por: {h.professionalName}</span>}
                          {h.professionalCouncil && <span>{h.professionalCouncil}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: "var(--r-lg)", padding: "3rem 1rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".75rem" }}>📋</div>
          <div style={{ fontSize: ".9rem", fontWeight: 600, color: "var(--ink)", marginBottom: ".35rem" }}>Prontuário</div>
          <div style={{ fontSize: ".78rem", color: "var(--text-3)" }}>Selecione um paciente para visualizar seu prontuário completo</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   8. INSUMO PAGE – Materiais e Insumos
   Props: patients, users, user
───────────────────────────────────────────────────────────────────────────── */
const INSUMOS_KEY = "saudeubs_insumos_v1";
const DEFAULT_INSUMOS = [
  { id: "i1", name: "Luvas descartáveis (caixa)", unit: "cx", qty: 10, minQty: 3, category: "EPI" },
  { id: "i2", name: "Máscara cirúrgica (caixa)", unit: "cx", qty: 5, minQty: 2, category: "EPI" },
  { id: "i3", name: "Seringa 3mL", unit: "un", qty: 200, minQty: 50, category: "Material clínico" },
  { id: "i4", name: "Agulha 25x7", unit: "un", qty: 150, minQty: 50, category: "Material clínico" },
  { id: "i5", name: "Algodão (rolo)", unit: "un", qty: 8, minQty: 3, category: "Material clínico" },
  { id: "i6", name: "Esparadrapo", unit: "un", qty: 4, minQty: 2, category: "Material clínico" },
  { id: "i7", name: "Álcool 70° (litro)", unit: "L", qty: 6, minQty: 2, category: "Higiene" },
  { id: "i8", name: "Sabão líquido (L)", unit: "L", qty: 3, minQty: 1, category: "Higiene" },
];

export function InsumoPage({ patients, users, user }) {
  const [items, setItems] = useState(() => readLS(INSUMOS_KEY, DEFAULT_INSUMOS));
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: "", unit: "un", qty: 0, minQty: 0, category: "Material clínico" });
  const [showAdjust, setShowAdjust] = useState(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  function saveItems(i) { setItems(i); writeLS(INSUMOS_KEY, i); }

  function submitForm(e) {
    e.preventDefault();
    if (editItem) {
      saveItems(items.map(i => i.id === editItem.id ? { ...i, ...form, qty: Number(form.qty), minQty: Number(form.minQty) } : i));
    } else {
      saveItems([...items, { ...form, id: Date.now().toString(36), qty: Number(form.qty), minQty: Number(form.minQty) }]);
    }
    setShowForm(false); setEditItem(null);
    setForm({ name: "", unit: "un", qty: 0, minQty: 0, category: "Material clínico" });
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({ name: item.name, unit: item.unit, qty: item.qty, minQty: item.minQty, category: item.category });
    setShowForm(true);
  }

  function applyAdjust(item, delta) {
    const newQty = Math.max(0, Number(item.qty) + delta);
    saveItems(items.map(i => i.id === item.id ? { ...i, qty: newQty } : i));
    setShowAdjust(null); setAdjustQty(0); setAdjustReason("");
  }

  const categories = [...new Set(items.map(i => i.category))];
  const filtered = items.filter(i => {
    if (filterCat !== "all" && i.category !== filterCat) return false;
    if (search && !normalizeSearch(i.name).includes(normalizeSearch(search))) return false;
    return true;
  });

  const critical = items.filter(i => Number(i.qty) <= Number(i.minQty));
  const CATEGORIES_OPTIONS = ["EPI", "Material clínico", "Higiene", "Medicamento", "Equipamento", "Outro"];

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Insumos e Materiais</h2>
          <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>{items.length} item(s) · {critical.length} com estoque crítico</p>
        </div>
        {canManage(user) && (
          <button onClick={() => { setEditItem(null); setForm({ name: "", unit: "un", qty: 0, minQty: 0, category: "Material clínico" }); setShowForm(true); }}
            style={{ padding: ".45rem .9rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".82rem", fontWeight: 600 }}>
            + Novo insumo
          </button>
        )}
      </div>

      {critical.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "var(--r-md)", padding: ".65rem 1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: ".6rem" }}>
          <span style={{ fontSize: ".88rem" }}>⚠️</span>
          <span style={{ fontSize: ".8rem", fontWeight: 600, color: "#b91c1c" }}>{critical.length} item(s) com estoque abaixo do mínimo: {critical.map(i => i.name).join(", ")}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: ".65rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <input placeholder="Buscar insumo…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
          <button onClick={() => setFilterCat("all")} style={{ padding: ".3rem .6rem", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontSize: ".73rem", fontWeight: 600, background: filterCat === "all" ? "var(--teal-600)" : "var(--surface-2)", color: filterCat === "all" ? "#fff" : "var(--text-2)" }}>Todos</button>
          {categories.map(c => (
            <button key={c} onClick={() => setFilterCat(c)} style={{ padding: ".3rem .6rem", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontSize: ".73rem", fontWeight: 600, background: filterCat === c ? "var(--teal-600)" : "var(--surface-2)", color: filterCat === c ? "#fff" : "var(--text-2)" }}>{c}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: ".65rem" }}>
        {filtered.map(item => {
          const qty = Number(item.qty);
          const min = Number(item.minQty);
          const pct = min > 0 ? Math.min(100, (qty / (min * 3)) * 100) : 100;
          const isCrit = qty <= min;
          const isLow = qty <= min * 1.5 && qty > min;
          const barColor = isCrit ? "#ef4444" : isLow ? "#f59e0b" : "#16a34a";
          return (
            <div key={item.id} style={{ background: "var(--surface)", border: `1px solid ${isCrit ? "#fecaca" : "var(--border)"}`, borderRadius: "var(--r-md)", padding: ".85rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".5rem", marginBottom: ".5rem" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)" }}>{item.name}</div>
                  <div style={{ fontSize: ".68rem", color: "var(--text-3)" }}>{item.category}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, color: barColor }}>{qty}</div>
                  <div style={{ fontSize: ".65rem", color: "var(--text-3)" }}>{item.unit} (min {min})</div>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden", marginBottom: ".65rem" }}>
                <div style={{ height: "100%", width: pct + "%", background: barColor, borderRadius: 999, transition: "width .3s" }} />
              </div>
              <div style={{ display: "flex", gap: ".35rem" }}>
                <button onClick={() => setShowAdjust(item)} style={{ flex: 1, padding: ".28rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>Ajustar</button>
                {canManage(user) && <button onClick={() => openEdit(item)} style={{ padding: ".28rem .55rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".72rem" }}>Editar</button>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Adjust modal */}
      {showAdjust && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "1.5rem", width: "100%", maxWidth: 360 }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700 }}>Ajustar: {showAdjust.name}</h3>
            <p style={{ fontSize: ".82rem", color: "var(--text-3)", margin: "0 0 .75rem" }}>Estoque atual: <strong>{showAdjust.qty}</strong> {showAdjust.unit}</p>
            <div style={{ display: "flex", gap: ".5rem", marginBottom: ".65rem" }}>
              <input type="number" placeholder="Qtd. (+/-)" value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))} style={{ flex: 1 }} />
              <input placeholder="Motivo" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} style={{ flex: 2 }} />
            </div>
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdjust(null)} style={{ padding: ".4rem .8rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => applyAdjust(showAdjust, adjustQty)} style={{ padding: ".4rem .8rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontWeight: 600 }}>Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/edit form modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "var(--surface)", borderRadius: "var(--r-lg)", padding: "1.5rem", width: "100%", maxWidth: 420 }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 700 }}>{editItem ? "Editar insumo" : "Novo insumo"}</h3>
            <form onSubmit={submitForm} style={{ display: "flex", flexDirection: "column", gap: ".65rem" }}>
              <input placeholder="Nome do insumo *" value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))} required />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
                <label style={{ fontSize: ".75rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>Quantidade<input type="number" min="0" value={form.qty} onChange={e => setForm(s => ({ ...s, qty: e.target.value }))} /></label>
                <label style={{ fontSize: ".75rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>Qtd mínima<input type="number" min="0" value={form.minQty} onChange={e => setForm(s => ({ ...s, minQty: e.target.value }))} /></label>
                <label style={{ fontSize: ".75rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>Unidade<input value={form.unit} onChange={e => setForm(s => ({ ...s, unit: e.target.value }))} /></label>
                <label style={{ fontSize: ".75rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>Categoria
                  <select value={form.category} onChange={e => setForm(s => ({ ...s, category: e.target.value }))}>
                    {CATEGORIES_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: ".65rem", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: ".4rem .8rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer" }}>Cancelar</button>
                <button type="submit" style={{ padding: ".4rem .8rem", background: "var(--teal-600)", color: "#fff", border: "none", borderRadius: "var(--r-md)", cursor: "pointer", fontWeight: 600 }}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   9. GESTOR PAGE – Painel do Gestor UBS
   Props: patients, users, templates, protocolByPatient
───────────────────────────────────────────────────────────────────────────── */
export function GestorPage({ patients, users, templates, protocolByPatient }) {
  const [activeTab, setActiveTab] = useState("overview");

  const totalPatients = patients.length;
  const totalUsers = users.length;
  const criticalPatients = useMemo(() => {
    return patients.filter(p => {
      const s = protocolByPatient?.[p.id];
      if (!s) return false;
      const pending = (s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0);
      return pending > 0;
    });
  }, [patients, protocolByPatient]);

  const byCategory = useMemo(() => {
    const map = {};
    patients.forEach(p => {
      const cat = p.careCategory || "general";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [patients]);

  const byAcs = useMemo(() => {
    const map = {};
    patients.forEach(p => {
      const acsId = p.assignedAcsId || "__none";
      if (!map[acsId]) {
        const acsUser = users.find(u => u.id === acsId);
        map[acsId] = { name: acsUser?.name || "Sem ACS", count: 0, critical: 0 };
      }
      map[acsId].count++;
      const s = protocolByPatient?.[p.id];
      if (s && ((s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0)) > 0) {
        map[acsId].critical++;
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [patients, users, protocolByPatient]);

  const kpis = [
    { label: "Total de pacientes", value: totalPatients, icon: "👥", color: "#0ea5e9" },
    { label: "Protocolos pendentes", value: criticalPatients.length, icon: "⚠️", color: criticalPatients.length > 10 ? "#ef4444" : "#f59e0b" },
    { label: "Usuários ativos", value: totalUsers, icon: "👤", color: "#8b5cf6" },
    { label: "Protocolos cadastrados", value: templates.length, icon: "📋", color: "#10b981" },
  ];

  const tabs = [["overview", "Visão geral"], ["coverage", "Cobertura ACS"], ["categories", "Categorias"]];

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Painel do Gestor</h2>
        <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>Visão gerencial da unidade de saúde</p>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: ".65rem", marginBottom: "1.25rem" }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1rem 1.1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".4rem" }}>
              <span style={{ fontSize: "1.2rem" }}>{k.icon}</span>
              <span style={{ fontSize: ".72rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{k.label}</span>
            </div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: ".35rem", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: ".5rem" }}>
        {tabs.map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v)}
            style={{ padding: ".4rem .85rem", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", fontSize: ".8rem", fontWeight: 600, background: activeTab === v ? "var(--teal-600)" : "transparent", color: activeTab === v ? "#fff" : "var(--text-2)" }}>
            {l}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1.1rem" }}>
            <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)", marginBottom: ".75rem" }}>Pacientes com protocolos pendentes</div>
            {criticalPatients.length === 0
              ? <div style={{ color: "var(--text-3)", fontSize: ".8rem" }}>Nenhum protocolo pendente</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: ".3rem", maxHeight: 300, overflowY: "auto" }}>
                {criticalPatients.slice(0, 15).map(p => {
                  const s = protocolByPatient?.[p.id];
                  const pending = (s?.pending?.visits || 0) + (s?.pending?.consultations || 0) + (s?.pending?.vaccines || 0);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".4rem .5rem", background: "var(--surface-2)", borderRadius: "var(--r-md)", fontSize: ".78rem" }}>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{p.name}</span>
                      <span style={{ fontWeight: 700, color: "#ef4444", background: "#fef2f2", padding: ".1rem .4rem", borderRadius: 999, border: "1px solid #fecaca" }}>{pending} pendente(s)</span>
                    </div>
                  );
                })}
              </div>
            }
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "1.1rem" }}>
            <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)", marginBottom: ".75rem" }}>Equipe</div>
            {users.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: ".55rem", padding: ".35rem 0", borderBottom: "1px solid var(--border-soft, #f1f5f9)" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".65rem", fontWeight: 700 }}>{initials(u.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: ".78rem", color: "var(--ink)" }}>{u.name}</div>
                  <div style={{ fontSize: ".65rem", color: "var(--text-3)" }}>{roleLabel(u.role)}</div>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: u.online ? "#16a34a" : "#cbd5e1" }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "coverage" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
          <div style={{ padding: ".75rem 1.1rem", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: ".84rem", color: "var(--ink)" }}>Cobertura por ACS</div>
          {byAcs.map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".65rem 1.1rem", borderBottom: "1px solid var(--border-soft, #f1f5f9)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--teal-600)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 700 }}>{initials(row.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: ".82rem", color: "var(--ink)" }}>{row.name}</div>
                <div style={{ height: 5, background: "var(--surface-2)", borderRadius: 999, marginTop: ".3rem", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.min(100, (row.count / Math.max(...byAcs.map(r => r.count), 1)) * 100) + "%", background: "var(--teal-600)", borderRadius: 999 }} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--ink)" }}>{row.count}</div>
                {row.critical > 0 && <div style={{ fontSize: ".65rem", color: "#ef4444", fontWeight: 600 }}>{row.critical} crítico(s)</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "categories" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
          <div style={{ padding: ".75rem 1.1rem", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: ".84rem", color: "var(--ink)" }}>Distribuição por categoria de cuidado</div>
          {byCategory.map(([cat, count]) => {
            const tpl = templates.find(t => t.category === cat);
            const pct = totalPatients > 0 ? (count / totalPatients) * 100 : 0;
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".65rem 1.1rem", borderBottom: "1px solid var(--border-soft, #f1f5f9)" }}>
                <div style={{ width: 120, fontSize: ".78rem", fontWeight: 600, color: "var(--ink)" }}>{tpl?.label || cat}</div>
                <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: pct + "%", background: "var(--teal-600)", borderRadius: 999 }} />
                </div>
                <div style={{ minWidth: 60, textAlign: "right", fontSize: ".78rem", fontWeight: 700, color: "var(--ink)" }}>{count} <span style={{ fontWeight: 400, color: "var(--text-3)", fontSize: ".68rem" }}>({pct.toFixed(0)}%)</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   10. REPORTS PAGE – Relatórios
   Props: patients, users, templates, protocolByPatient
───────────────────────────────────────────────────────────────────────────── */
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
      if (!acsMap[acsId]) { const u = users.find(u => u.id === acsId); acsMap[acsId] = { name: u?.name || "Sem ACS", patients: 0, pendingTotal: 0 }; }
      acsMap[acsId].patients++;
      const s = protocolByPatient?.[p.id];
      if (s) acsMap[acsId].pendingTotal += (s.pending?.visits || 0) + (s.pending?.consultations || 0) + (s.pending?.vaccines || 0);
    });
    return Object.values(acsMap).sort((a, b) => b.pendingTotal - a.pendingTotal);
  }, [patients, users, protocolByPatient]);

  function exportCSV() {
    let rows = ["Nome;Categoria;ACS;Pendências;Realizados"];
    protocolReport.forEach(p => {
      rows.push([p.name, p.careCategory, p.acsName, p.pending, p.completed].join(";"));
    });
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
    a.download = `relatorio_protocolos_${now.toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const reportTabs = [["protocol", "Protocolos"], ["coverage", "Cobertura ACS"]];

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)", margin: 0 }}>Relatórios</h2>
          <p style={{ fontSize: ".78rem", color: "var(--text-3)", margin: ".2rem 0 0" }}>Gerado em {now.toLocaleDateString("pt-BR")}</p>
        </div>
        <button onClick={exportCSV} style={{ padding: ".45rem .9rem", background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: ".4rem" }}>
          ⬇ Exportar CSV
        </button>
      </div>

      <div style={{ display: "flex", gap: ".35rem", marginBottom: "1rem" }}>
        {reportTabs.map(([v, l]) => (
          <button key={v} onClick={() => setReportType(v)}
            style={{ padding: ".4rem .85rem", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", fontSize: ".8rem", fontWeight: 600, background: reportType === v ? "var(--teal-600)" : "var(--surface-2)", color: reportType === v ? "#fff" : "var(--text-2)" }}>
            {l}
          </button>
        ))}
        {reportType === "protocol" && (
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ marginLeft: "auto", fontSize: ".78rem" }}>
            <option value="">Todas as categorias</option>
            {templates.map(t => <option key={t.category} value={t.category}>{t.label}</option>)}
          </select>
        )}
      </div>

      {reportType === "protocol" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 90px 90px", padding: ".55rem 1rem", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: ".72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
            <span>Paciente</span><span>Categoria</span><span>ACS</span><span style={{ textAlign: "right" }}>Pendências</span><span style={{ textAlign: "right" }}>Realizados</span>
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {protocolReport.map(p => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 120px 90px 90px", padding: ".55rem 1rem", borderBottom: "1px solid var(--border-soft, #f1f5f9)", alignItems: "center", fontSize: ".8rem" }}>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{p.name}</span>
                <span style={{ color: "var(--text-3)" }}>{catLabel(templates, p.careCategory)}</span>
                <span style={{ color: "var(--text-3)" }}>{p.acsName}</span>
                <span style={{ textAlign: "right", fontWeight: 700, color: p.pending > 0 ? "#ef4444" : "#16a34a" }}>{p.pending}</span>
                <span style={{ textAlign: "right", color: "var(--text-2)" }}>{p.completed}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: ".55rem 1rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", gap: "1.5rem", fontSize: ".78rem", color: "var(--text-3)" }}>
            <span>Total: <strong style={{ color: "var(--ink)" }}>{protocolReport.length}</strong> pacientes</span>
            <span>Pendências: <strong style={{ color: "#ef4444" }}>{protocolReport.reduce((s, p) => s + p.pending, 0)}</strong></span>
            <span>Realizados: <strong style={{ color: "#16a34a" }}>{protocolReport.reduce((s, p) => s + p.completed, 0)}</strong></span>
          </div>
        </div>
      )}

      {reportType === "coverage" && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", padding: ".55rem 1rem", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: ".72rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
            <span>ACS</span><span style={{ textAlign: "right" }}>Pacientes</span><span style={{ textAlign: "right" }}>Pendências total</span>
          </div>
          {coverageReport.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px", padding: ".6rem 1rem", borderBottom: "1px solid var(--border-soft, #f1f5f9)", fontSize: ".8rem", alignItems: "center" }}>
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{row.name}</span>
              <span style={{ textAlign: "right", color: "var(--text-2)" }}>{row.patients}</span>
              <span style={{ textAlign: "right", fontWeight: 700, color: row.pendingTotal > 0 ? "#ef4444" : "#16a34a" }}>{row.pendingTotal}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   11. RECEPTIONIST APP – App dedicado de recepção
   Props: recUser, patients, users, templates, onLogout
───────────────────────────────────────────────────────────────────────────── */
const RECEPTION_KEY = "saudeubs_reception_v1";

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
    if (!quickForm.name.trim() || !quickForm.phone.trim()) { setError("Nome e telefone obrigatórios."); return; }
    setBusy(true); setError("");
    try {
      // Locally add a patient to the queue even without API
      const localId = "local_" + Date.now().toString(36);
      const entry = {
        id: Date.now().toString(36),
        patientId: localId,
        patientName: quickForm.name.trim(),
        phone: quickForm.phone.trim(),
        reason: "Cadastro rápido",
        priority: "normal",
        arrivedAt: new Date().toISOString(),
        status: "waiting",
        incompletePatient: true,
      };
      saveQueue([...queue, entry]);
      setShowQuickReg(false);
      setQuickForm({ name: "", cpf: "", phone: "", birthDate: "" });
    } catch (err) { setError(err.message || "Erro ao cadastrar."); }
    finally { setBusy(false); }
  }

  const priorityColor = { urgent: "#ef4444", high: "#f59e0b", normal: "#3b82f6" };
  const priorityLabel = { urgent: "Urgente", high: "Prioritário", normal: "Normal" };
  const tabs = [["queue", "Fila"], ["patients", "Pacientes"], ["register", "Cadastrar"]];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface, #f8fafc)", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", color: "#fff", padding: ".75rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: ".95rem" }}>SIGUS · Recepção</div>
          <div style={{ fontSize: ".72rem", color: "#94a3b8" }}>{recUser?.name} · {waiting.length} aguardando</div>
        </div>
        <button onClick={onLogout} style={{ background: "rgba(255,255,255,.1)", border: "none", color: "#fff", padding: ".35rem .75rem", borderRadius: 6, cursor: "pointer", fontSize: ".75rem" }}>Sair</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        {tabs.map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v)}
            style={{ flex: 1, padding: ".7rem", border: "none", cursor: "pointer", fontSize: ".82rem", fontWeight: 600, background: "transparent", color: activeTab === v ? "#0f172a" : "#94a3b8", borderBottom: `2px solid ${activeTab === v ? "#0f172a" : "transparent"}` }}>
            {l}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: ".5rem .75rem", color: "#b91c1c", fontSize: ".8rem", marginBottom: ".75rem" }}>{error}</div>}

        {activeTab === "queue" && (
          <div>
            {/* Add to queue form */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ fontWeight: 700, fontSize: ".84rem", color: "#0f172a", marginBottom: ".65rem" }}>Registrar chegada</div>
              <form onSubmit={addToQueue} style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                <input placeholder="Buscar paciente…" value={search} onChange={e => setSearch(e.target.value)} style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".4rem .65rem", fontSize: ".82rem" }} />
                <select value={queueForm.patientId} onChange={e => setQueueForm(s => ({ ...s, patientId: e.target.value }))} required style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".4rem .65rem", fontSize: ".82rem" }}>
                  <option value="">Selecionar paciente…</option>
                  {filtered.slice(0, 20).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: ".5rem" }}>
                  <input placeholder="Motivo" value={queueForm.reason} onChange={e => setQueueForm(s => ({ ...s, reason: e.target.value }))} style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".4rem .65rem", fontSize: ".82rem" }} />
                  <select value={queueForm.priority} onChange={e => setQueueForm(s => ({ ...s, priority: e.target.value }))} style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".4rem .65rem", fontSize: ".82rem" }}>
                    <option value="normal">Normal</option><option value="high">Prioritário</option><option value="urgent">Urgente</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button type="submit" style={{ flex: 1, padding: ".45rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: ".82rem" }}>+ Adicionar à fila</button>
                  <button type="button" onClick={() => setShowQuickReg(true)} style={{ padding: ".45rem .85rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: ".78rem", color: "#64748b" }}>Novo paciente</button>
                </div>
              </form>
            </div>

            {/* Called */}
            {called.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".4rem" }}>Em atendimento ({called.length})</div>
                {called.map(e => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: ".65rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: ".6rem .85rem", marginBottom: ".3rem" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 700 }}>{initials(e.patientName)}</div>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: ".82rem" }}>{e.patientName}</div><div style={{ fontSize: ".68rem", color: "#6b7280" }}>{e.reason}</div></div>
                    <button onClick={() => saveQueue(queue.filter(q => q.id !== e.id))} style={{ padding: ".3rem .6rem", background: "#16a34a", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>Finalizar</button>
                  </div>
                ))}
              </div>
            )}

            {/* Waiting */}
            <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: ".4rem" }}>Aguardando ({waiting.length})</div>
            {waiting.length === 0
              ? <div style={{ background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 8, padding: "2rem", textAlign: "center", color: "#94a3b8", fontSize: ".82rem" }}>Fila vazia</div>
              : waiting.map((e, idx) => {
                const pc = priorityColor[e.priority] || "#3b82f6";
                const elapsed = Math.floor((Date.now() - new Date(e.arrivedAt).getTime()) / 60000);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: ".65rem", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: ".6rem .85rem", marginBottom: ".3rem", borderLeft: `4px solid ${pc}` }}>
                    <span style={{ fontSize: ".9rem", fontWeight: 800, color: "#94a3b8", minWidth: 20 }}>{idx + 1}</span>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0f172a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 700 }}>{initials(e.patientName)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: ".82rem" }}>{e.patientName}</div>
                      <div style={{ fontSize: ".68rem", color: "#6b7280" }}>{e.reason} · {elapsed}min</div>
                    </div>
                    <button onClick={() => saveQueue(queue.map(q => q.id === e.id ? { ...q, status: "called" } : q))} style={{ padding: ".3rem .6rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>Chamar</button>
                  </div>
                );
              })
            }
          </div>
        )}

        {activeTab === "patients" && (
          <div>
            <input placeholder="Buscar paciente…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", boxSizing: "border-box", borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem", marginBottom: ".75rem" }} />
            {filtered.slice(0, 20).map(p => (
              <div key={p.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: ".7rem .9rem", marginBottom: ".35rem", display: "flex", alignItems: "center", gap: ".65rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0f172a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".75rem", fontWeight: 700 }}>{initials(p.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: ".84rem" }}>{p.name}</div>
                  <div style={{ fontSize: ".72rem", color: "#64748b" }}>{p.phone || "Sem telefone"} · {calcAge(p.birthDate) || "—"}</div>
                </div>
                <button onClick={() => { setQueueForm(s => ({ ...s, patientId: p.id })); setSearch(p.name); setActiveTab("queue"); }}
                  style={{ padding: ".3rem .65rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", fontSize: ".72rem", fontWeight: 600 }}>+ Fila</button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "register" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#0f172a", marginBottom: "1rem" }}>Cadastro rápido de paciente</div>
            <form onSubmit={registerQuick} style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
              <input placeholder="Nome completo *" value={quickForm.name} onChange={e => setQuickForm(s => ({ ...s, name: e.target.value }))} required style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem" }} />
              <input placeholder="CPF" value={quickForm.cpf} onChange={e => setQuickForm(s => ({ ...s, cpf: formatCpf(e.target.value) }))} style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem" }} />
              <input placeholder="Telefone *" value={quickForm.phone} onChange={e => setQuickForm(s => ({ ...s, phone: e.target.value }))} required style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem" }} />
              <label style={{ fontSize: ".75rem", fontWeight: 600, color: "#334155" }}>Data de nascimento<input type="date" value={quickForm.birthDate} onChange={e => setQuickForm(s => ({ ...s, birthDate: e.target.value }))} style={{ display: "block", width: "100%", borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem", marginTop: ".25rem" }} /></label>
              <p style={{ fontSize: ".73rem", color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>⚠ Cadastro simplificado — o perfil deverá ser completado pela equipe clínica.</p>
              <button type="submit" disabled={busy} style={{ padding: ".5rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: ".84rem" }}>{busy ? "Salvando…" : "Cadastrar e adicionar à fila"}</button>
            </form>
          </div>
        )}
      </div>

      {/* Quick register modal */}
      {showQuickReg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "12px 12px 0 0", padding: "1.25rem", width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <strong style={{ fontSize: ".9rem" }}>Novo paciente</strong>
              <button onClick={() => setShowQuickReg(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>✕</button>
            </div>
            <form onSubmit={registerQuick} style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
              <input placeholder="Nome *" value={quickForm.name} onChange={e => setQuickForm(s => ({ ...s, name: e.target.value }))} required style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem" }} />
              <input placeholder="Telefone *" value={quickForm.phone} onChange={e => setQuickForm(s => ({ ...s, phone: e.target.value }))} required style={{ borderRadius: 6, border: "1px solid #e2e8f0", padding: ".45rem .75rem", fontSize: ".84rem" }} />
              <button type="submit" disabled={busy} style={{ padding: ".5rem", background: "#0f172a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>{busy ? "…" : "Cadastrar"}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
