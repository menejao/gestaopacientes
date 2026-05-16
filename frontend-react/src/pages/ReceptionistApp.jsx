import { useState, useMemo } from "react";
import { AGENDA_KEY, QUEUE_KEY, RECEPTION_USERS } from "../config/constants";
import { readLS, writeLS } from "../utils/storage";
import { matchesPatientSearch, gestationalAgeInfo, ageInMonths } from "../utils/clinical";
import { isUnavailableDay, unavailableReason, parseLocalDate } from "../utils/dates";
import { fmtDate } from "../utils/formatting";
import Avatar from "../components/ui/Avatar";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

const IconLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2v14M2 9h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

function ReceptionLoginModal({ onLogin, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw]       = useState("");
  const [err, setErr]     = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !pw.trim()) { setErr("Informe e-mail e senha."); return; }
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw }),
      });
      if (!res.ok) { setErr("E-mail ou senha incorretos."); return; }
      const data = await res.json();
      const meta = RECEPTION_USERS.find(r => r.email.toLowerCase() === email.trim().toLowerCase());
      const u = { ...(meta || {}), ...data.user, _token: data.token };
      onLogin(u);
    } catch { setErr("Erro de conexão. Tente novamente."); }
  }

  return (
    <Modal
      title={
        <div className="rcpt-login-header">
          <div className="rcpt-login-icon">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="white" strokeWidth="1.4"/>
              <path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M5 10h2M9 10h2M5 12.5h2" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="rcpt-login-title">Acesso — Recepção</div>
            <div className="rcpt-login-sub">Entre com suas credenciais de recepção</div>
          </div>
        </div>
      }
      onClose={onClose}
      actions={<Button form="rcpt-login-form" type="submit" variant="primary">Entrar na Recepção</Button>}
    >
      <form id="rcpt-login-form" onSubmit={submit} className="rcpt-modal-form">
        <label className="rcpt-field">
          E-mail
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="recepcao@ubs.local" autoFocus />
        </label>
        <label className="rcpt-field">
          Senha
          <input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢" />
        </label>
        {err && <div className="alert alert--danger">{err}</div>}
      </form>
    </Modal>
  );
}

function ReceptionistApp({ recUser, patients, users, templates, onLogout }) {
  const [tab, setTab]               = useState("queue");
  const [search, setSearch]         = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);

  const [agenda, setAgenda]         = useState(() => readLS(AGENDA_KEY, []));
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaEditId, setAgendaEditId] = useState(null);
  const [agendaForm, setAgendaForm] = useState({ patientId: "", doctorId: "", date: "", time: "", type: "consultation", notes: "", status: "scheduled" });

  const [queue, setQueue]           = useState(() => readLS(QUEUE_KEY, []));
  const [showQueueForm, setShowQueueForm] = useState(false);
  const [queueForm, setQueueForm]   = useState({ patientId: "", priority: "normal", reason: "" });

  const saveAgenda = (a) => { setAgenda(a); writeLS(AGENDA_KEY, a); };
  const saveQueue  = (q) => { setQueue(q);  writeLS(QUEUE_KEY, q);  };

  const doctors = users.filter(u => ["doctor", "nurse_manager", "nursing_tech"].includes(u.role));
  const today   = new Date().toISOString().slice(0, 10);

  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return [];
    return patients.filter(p => matchesPatientSearch(p, search)).slice(0, 8);
  }, [search, patients]);

  const PRIORITY_LABELS = { urgent: "Urgente", elderly: "Idoso/PCD", pregnant: "Gestante", child: "Criança", normal: "Normal" };
  const PRIORITY_ORDER  = { urgent: 0, elderly: 1, pregnant: 2, child: 3, normal: 4 };

  const STATUS_LABELS = {
    scheduled: "Agendado",
    arrived:   "Chegou",
    attending: "Em atend.",
    done:      "Concluído",
    absent:    "Faltou",
  };

  function addToQueue(e) {
    e.preventDefault();
    if (!queueForm.patientId) return;
    const pat = patients.find(p => p.id === queueForm.patientId);
    let prio = queueForm.priority;
    if (prio === "normal") {
      const cat = String(pat?.careCategory || "").toLowerCase();
      if (cat === "pregnant") prio = "pregnant";
      else {
        const age = pat?.birthDate ? Math.floor((new Date() - (parseLocalDate(pat.birthDate) || new Date())) / 31557600000) : null;
        if (age !== null && age >= 60) prio = "elderly";
        else if (age !== null && age < 12) prio = "child";
      }
    }
    const entry = {
      id: "q" + Date.now(), patientId: queueForm.patientId, patientName: pat?.name || "?",
      priority: prio, reason: queueForm.reason, arrivedAt: new Date().toISOString(), status: "waiting",
    };
    saveQueue([...queue, entry]);
    setQueueForm({ patientId: "", priority: "normal", reason: "" });
    setShowQueueForm(false);
  }

  function updateQueueStatus(id, status) { saveQueue(queue.map(q => q.id === id ? { ...q, status, updatedAt: new Date().toISOString() } : q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q => q.id !== id)); }
  function clearDone() { saveQueue(queue.filter(q => q.status === "waiting" || q.status === "attending")); }

  const sortedQueue = [...queue].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const pa = PRIORITY_ORDER[a.priority] ?? 4, pb = PRIORITY_ORDER[b.priority] ?? 4;
    return pa !== pb ? pa - pb : a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting   = sortedQueue.filter(q => q.status === "waiting").length;
  const attending = sortedQueue.filter(q => q.status === "attending").length;
  const alreadyInQueue = queue.filter(q => q.status !== "done").map(q => q.patientId);

  const AGENDA_HOURS = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

  const selD     = new Date(selectedDate + "T12:00:00");
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selD); d.setDate(d.getDate() - d.getDay() + i);
    return d.toISOString().slice(0, 10);
  });
  const countByDay = {};
  weekDays.forEach(d => { countByDay[d] = agenda.filter(a => a.date === d).length; });

  const dayAppts = agenda
    .filter(a => a.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  function openAgendaNew(time = "") {
    setAgendaForm({ patientId: "", doctorId: "", date: selectedDate, time, type: "consultation", notes: "", status: "scheduled" });
    setAgendaEditId(null); setShowAgendaForm(true);
  }
  function openAgendaEdit(appt) {
    setAgendaForm({ patientId: appt.patientId, doctorId: appt.doctorId, date: appt.date, time: appt.time, type: appt.type, notes: appt.notes || "", status: appt.status });
    setAgendaEditId(appt.id); setShowAgendaForm(true);
  }
  function submitAgenda(e) {
    e.preventDefault();
    if (!agendaForm.patientId || !agendaForm.date || !agendaForm.time) return;
    const pat = patients.find(p => p.id === agendaForm.patientId);
    const doc = users.find(u => u.id === agendaForm.doctorId);
    const entry = { ...agendaForm, id: agendaEditId || ("ag" + Date.now()), patientName: pat?.name || "?", doctorName: doc?.name || "", createdAt: new Date().toISOString() };
    const base  = agendaEditId ? agenda.filter(a => a.id !== agendaEditId) : agenda;
    saveAgenda([...base, entry].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
    setShowAgendaForm(false);
  }
  function removeAgenda(id) { saveAgenda(agenda.filter(a => a.id !== id)); }
  function updateAgendaStatus(id, status) { saveAgenda(agenda.map(a => a.id === id ? { ...a, status } : a)); }

  function waitMins(iso) {
    const mins = Math.floor((new Date() - new Date(iso)) / 60000);
    return mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  }
  function fmtTime(iso) { if (!iso) return ""; return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

  const NAV_TABS = [
    { id: "queue",  label: "🏥 Fila" },
    { id: "agenda", label: "📅 Agenda" },
    { id: "search", label: "🔍 Pacientes" },
  ];

  return (
    <div className="rcpt-app">

      <header className="rcpt-topbar">
        <div className="rcpt-topbar__logo-wrap">
          <div className="rcpt-topbar__logo"><IconLogo /></div>
          <span className="rcpt-topbar__brand">VALENS</span>
          <span className="rcpt-topbar__badge">Recepção</span>
        </div>

        <nav className="rcpt-nav">
          {NAV_TABS.map(t => (
            <button key={t.id} className={`rcpt-nav-btn${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "queue" && waiting > 0 && <span className="rcpt-nav-badge">{waiting}</span>}
            </button>
          ))}
        </nav>

        <div className="rcpt-topbar__actions">
          <button className="rcpt-topbar__entry-btn" onClick={() => setShowQueueForm(true)}>
            + Dar entrada
          </button>
          <Button variant="secondary" size="sm" onClick={() => openAgendaNew()}>
            + Agendar
          </Button>
          <div className="rcpt-topbar__user">
            <Avatar name={recUser.name} size="sm" />
            <div>
              <div className="rcpt-topbar__user-name">{recUser.name}</div>
              <div className="rcpt-topbar__user-role">Recepção</div>
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout}>Sair</Button>
          </div>
        </div>
      </header>

      <div className="rcpt-main">

        {/* ── FILA ── */}
        {tab === "queue" && (
          <div className="rcpt-section">
            <div className="rcpt-kpis">
              <div className="rcpt-kpi rcpt-kpi--waiting">
                <span className="rcpt-kpi__icon">⏳</span>
                <div>
                  <div className="rcpt-kpi__value">{waiting}</div>
                  <div className="rcpt-kpi__label">Aguardando</div>
                </div>
              </div>
              <div className="rcpt-kpi rcpt-kpi--attending">
                <span className="rcpt-kpi__icon">🩺</span>
                <div>
                  <div className="rcpt-kpi__value">{attending}</div>
                  <div className="rcpt-kpi__label">Em atendimento</div>
                </div>
              </div>
              <div className="rcpt-kpi rcpt-kpi--total">
                <span className="rcpt-kpi__icon">📋</span>
                <div>
                  <div className="rcpt-kpi__value">{sortedQueue.length}</div>
                  <div className="rcpt-kpi__label">Total hoje</div>
                </div>
              </div>
              {sortedQueue.some(q => q.status === "done") && (
                <Button variant="secondary" size="sm" onClick={clearDone} style={{ alignSelf: "center" }}>
                  Limpar concluídos
                </Button>
              )}
            </div>

            {!sortedQueue.length ? (
              <div className="rcpt-queue-empty">
                <div className="rcpt-queue-empty__icon">🏥</div>
                <div className="rcpt-queue-empty__title">Nenhum paciente na fila</div>
                <Button variant="primary" onClick={() => setShowQueueForm(true)}>+ Dar entrada no primeiro paciente</Button>
              </div>
            ) : (
              <div className="rcpt-queue-list">
                {sortedQueue.map((q, i) => {
                  const isDone = q.status === "done";
                  const prio   = isDone ? "done" : (q.priority || "normal");
                  return (
                    <div key={q.id} className={`rcpt-queue-item rcpt-queue-item--${prio}`}>
                      <div className="rcpt-queue-item__num">
                        <span className="rcpt-queue-item__num-text">{i + 1}</span>
                      </div>
                      <div className="rcpt-queue-item__body">
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", flexWrap: "wrap" }}>
                          <span className="rcpt-queue-item__name">{q.patientName}</span>
                          <span className="rcpt-queue-item__prio-tag">{PRIORITY_LABELS[q.priority]}</span>
                          {q.reason && <span className="rcpt-queue-item__reason">· {q.reason}</span>}
                        </div>
                        <div className="rcpt-queue-item__time">
                          Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}
                        </div>
                      </div>
                      {!isDone && (
                        <div className="rcpt-queue-item__actions">
                          {q.status === "waiting" && (
                            <Button variant="primary" size="sm" onClick={() => updateQueueStatus(q.id, "attending")}>
                              🩺 Chamar
                            </Button>
                          )}
                          {q.status === "attending" && (
                            <Button variant="primary" size="sm" onClick={() => updateQueueStatus(q.id, "done")}>
                              ✓ Concluir
                            </Button>
                          )}
                          <button className="rcpt-queue-item__remove-btn" onClick={() => removeFromQueue(q.id)}>✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── AGENDA ── */}
        {tab === "agenda" && (
          <div className="rcpt-section--wide">
            <div className="rcpt-week-strip">
              {weekDays.map(d => {
                const dt         = new Date(d + "T12:00:00");
                const isToday    = d === today;
                const isSel      = d === selectedDate;
                const unavailable = isUnavailableDay(d);
                return (
                  <button
                    key={d}
                    className={`rcpt-week-day${isSel ? " is-selected" : unavailable ? " is-unavailable" : isToday ? " is-today" : ""}`}
                    onClick={() => setSelectedDate(d)}
                  >
                    <div className="rcpt-week-day__dow">{dt.toLocaleDateString("pt-BR", { weekday: "short" })}</div>
                    <div className="rcpt-week-day__num">{dt.getDate()}</div>
                    {unavailable && !isSel && <div className="rcpt-week-day__closed">fechado</div>}
                    {!unavailable && countByDay[d] > 0 && <div className="rcpt-week-day__count">{countByDay[d]} apts.</div>}
                  </button>
                );
              })}
            </div>

            <div className="rcpt-day-header">
              <span className="rcpt-day-header__title">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                <span className="rcpt-day-header__count">{dayAppts.length} agendamento{dayAppts.length !== 1 ? "s" : ""}</span>
              </span>
              {!isUnavailableDay(selectedDate) && (
                <Button variant="primary" size="sm" onClick={() => openAgendaNew()}>
                  + Novo agendamento
                </Button>
              )}
            </div>

            {isUnavailableDay(selectedDate) && (
              <div className="rcpt-unavail-notice">
                <span style={{ fontSize: "1.1rem" }}>🔒</span>
                <strong>{unavailableReason(selectedDate)}</strong>
              </div>
            )}

            {!dayAppts.length ? (
              <div className="rcpt-empty">
                <div className="rcpt-empty__icon">{isUnavailableDay(selectedDate) ? "🔒" : "📅"}</div>
                <div className="rcpt-empty__title">{isUnavailableDay(selectedDate) ? "Unidade fechada neste dia" : "Nenhum agendamento neste dia"}</div>
                {!isUnavailableDay(selectedDate) && (
                  <Button variant="primary" style={{ marginTop: "var(--s-4)" }} onClick={() => openAgendaNew()}>+ Agendar consulta</Button>
                )}
              </div>
            ) : (
              <div className="rcpt-appt-list">
                {dayAppts.map(appt => (
                  <div key={appt.id} className={`rcpt-appt rcpt-appt--${appt.status || "scheduled"}`}>
                    <div className="rcpt-appt__time">{appt.time}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="rcpt-appt__name">{appt.patientName}</div>
                      <div className="rcpt-appt__sub">
                        {appt.type === "consultation" ? "Consulta" : appt.type === "return" ? "Retorno" : appt.type === "procedure" ? "Procedimento" : "Outro"}
                        {appt.doctorName && " · " + appt.doctorName}
                        {appt.notes && " · " + appt.notes}
                      </div>
                    </div>
                    <div className="rcpt-appt__controls">
                      <select
                        className="rcpt-appt__status-select"
                        value={appt.status}
                        onChange={e => updateAgendaStatus(appt.id, e.target.value)}
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <button className="icon-btn" title="Editar" onClick={() => openAgendaEdit(appt)}>✏️</button>
                      <button className="rcpt-appt__remove-btn" onClick={() => removeAgenda(appt.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PACIENTES ── */}
        {tab === "search" && (
          <div className="rcpt-section--wide">
            <div className="rcpt-search-wrap">
              <span className="rcpt-search-icon">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              </span>
              <input
                className="input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                placeholder="Buscar paciente por nome, CPF ou CNS⬦"
              />
            </div>

            {search.length >= 2 && !searchResults.length && (
              <p style={{ textAlign: "center", color: "var(--text-dim)", padding: "var(--s-8)", font: "400 var(--t-sm) var(--font-sans)" }}>
                Nenhum paciente encontrado.
              </p>
            )}

            {searchResults.length > 0 && !selectedPatient && (
              <div className="rcpt-pat-results">
                {searchResults.map(p => {
                  const am      = ageInMonths(p.birthDate);
                  const g       = gestationalAgeInfo(p);
                  const catName = templates.find(t => t.category === p.careCategory)?.label || "Geral";
                  return (
                    <button key={p.id} className="rcpt-pat-result" onClick={() => setSelectedPatient(p)}>
                      <Avatar name={p.name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="rcpt-pat-result__name">{p.name}</div>
                        <div className="rcpt-pat-result__meta">
                          {p.cpf && <span>CPF: {p.cpf}</span>}
                          {p.cns && <span>CNS: {p.cns}</span>}
                          {am !== null && <span>{am < 24 ? `${am}m` : `${Math.floor(am / 12)}a`}</span>}
                          <span>{catName}</span>
                          {g && String(p.careCategory || "").toLowerCase() === "pregnant" && (
                            <span className="rcpt-pat-result__gest">IG {g.weeks}s{g.days}d</span>
                          )}
                        </div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                        <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedPatient && (
              <div>
                <button className="rcpt-back-btn" onClick={() => setSelectedPatient(null)}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Voltar à busca
                </button>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="rcpt-pat-header">
                    <Avatar name={selectedPatient.name} />
                    <div className="rcpt-pat-header__info">
                      <div className="rcpt-pat-header__name">{selectedPatient.name}</div>
                      <div className="rcpt-pat-header__sub">
                        {selectedPatient.cpf && <span>CPF: {selectedPatient.cpf}</span>}
                        {selectedPatient.cns && <span>CNS: {selectedPatient.cns}</span>}
                        {selectedPatient.birthDate && <span>Nasc.: {fmtDate(selectedPatient.birthDate)}</span>}
                      </div>
                    </div>
                    <div className="rcpt-pat-header__actions">
                      <Button variant="secondary" size="sm" onClick={() => { setQueueForm(s => ({ ...s, patientId: selectedPatient.id })); setShowQueueForm(true); }}>
                        🏥 Dar entrada
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => { setAgendaForm(s => ({ ...s, patientId: selectedPatient.id })); setShowAgendaForm(true); }}>
                        📅 Agendar
                      </Button>
                    </div>
                  </div>

                  <div className="rcpt-pat-grid">
                    <div>
                      <div className="rcpt-pat-section-label">Contato</div>
                      <div className="rcpt-pat-info-list">
                        {selectedPatient.phone && <span>📱 {selectedPatient.phone}</span>}
                        {selectedPatient.phoneAlt && <span>📞 {selectedPatient.phoneAlt}</span>}
                        {selectedPatient.address && <span>📍 {[selectedPatient.address, selectedPatient.number, selectedPatient.neighborhood, selectedPatient.city].filter(Boolean).join(", ")}</span>}
                        {!selectedPatient.phone && !selectedPatient.address && <span style={{ color: "var(--text-dim)" }}>Sem contato cadastrado</span>}
                      </div>
                    </div>
                    <div>
                      <div className="rcpt-pat-section-label">Alertas clínicos</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                        {String(selectedPatient.allergies || "").trim() && (
                          <span className="rcpt-allergy-badge">⚠️ Alergias: {selectedPatient.allergies}</span>
                        )}
                        {gestationalAgeInfo(selectedPatient) && String(selectedPatient.careCategory || "").toLowerCase() === "pregnant" && (() => {
                          const g = gestationalAgeInfo(selectedPatient);
                          return <span className="rcpt-gest-badge">🤰 IG: {g.weeks}s {g.days}d</span>;
                        })()}
                        {!String(selectedPatient.allergies || "").trim() && !(gestationalAgeInfo(selectedPatient) && String(selectedPatient.careCategory || "").toLowerCase() === "pregnant") && (
                          <span style={{ color: "var(--text-dim)" }}>Nenhum alerta</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const upcoming = agenda
                      .filter(a => a.patientId === selectedPatient.id && a.date >= today && a.status !== "done" && a.status !== "absent")
                      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                      .slice(0, 3);
                    if (!upcoming.length) return null;
                    return (
                      <div className="rcpt-upcoming-appts">
                        <div className="rcpt-pat-section-label">Próximos agendamentos</div>
                        {upcoming.map(a => (
                          <div key={a.id} className={`rcpt-appt-mini rcpt-appt-mini--${a.status || "scheduled"}`}>
                            <span className="rcpt-appt-mini__time">
                              {new Date(a.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} {a.time}
                            </span>
                            <span className="rcpt-appt-mini__label">
                              {a.type === "consultation" ? "Consulta" : a.type === "return" ? "Retorno" : "Outro"}
                              {a.doctorName && " · " + a.doctorName}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {!search && !selectedPatient && (
              <div className="rcpt-empty">
                <div className="rcpt-empty__icon">🔍</div>
                <div className="rcpt-empty__title">Digite para buscar um paciente</div>
                <div className="rcpt-empty__sub">Nome, CPF ou CNS</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: dar entrada na fila ── */}
      {showQueueForm && (
        <Modal
          title="Dar entrada na fila"
          onClose={() => setShowQueueForm(false)}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setShowQueueForm(false)}>Cancelar</Button>
              <Button form="rcpt-queue-form" type="submit" variant="primary">Confirmar entrada</Button>
            </>
          }
        >
          <form id="rcpt-queue-form" onSubmit={addToQueue} className="rcpt-modal-form">
            <label className="rcpt-field">
              Paciente *
              <select className="select" value={queueForm.patientId} onChange={e => setQueueForm(s => ({ ...s, patientId: e.target.value }))}>
                <option value="">Selecionar paciente...</option>
                {[...patients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(p => (
                  <option key={p.id} value={p.id} disabled={alreadyInQueue.includes(p.id)}>
                    {p.name}{alreadyInQueue.includes(p.id) ? " (já na fila)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="rcpt-field">
              Prioridade
              <select className="select" value={queueForm.priority} onChange={e => setQueueForm(s => ({ ...s, priority: e.target.value }))}>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="rcpt-field">
              Motivo / queixa
              <input className="input" value={queueForm.reason} onChange={e => setQueueForm(s => ({ ...s, reason: e.target.value }))} placeholder="Dor, retorno, renovação de receita..." />
            </label>
          </form>
        </Modal>
      )}

      {/* ── Modal: agendar ── */}
      {showAgendaForm && (
        <Modal
          title={agendaEditId ? "Editar agendamento" : "Novo agendamento"}
          onClose={() => setShowAgendaForm(false)}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setShowAgendaForm(false)}>Cancelar</Button>
              <Button form="rcpt-agenda-form" type="submit" variant="primary">Salvar agendamento</Button>
            </>
          }
        >
          <form id="rcpt-agenda-form" onSubmit={submitAgenda} className="rcpt-modal-form">
            <div className="rcpt-modal-grid">
              <label className="rcpt-field rcpt-modal-grid--full">
                Paciente *
                <select className="select" value={agendaForm.patientId} onChange={e => setAgendaForm(s => ({ ...s, patientId: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {[...patients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="rcpt-field">
                Data *
                <input className="input" type="date" value={agendaForm.date} onChange={e => setAgendaForm(s => ({ ...s, date: e.target.value }))} />
              </label>
              <label className="rcpt-field">
                Horário *
                <select className="select" value={agendaForm.time} onChange={e => setAgendaForm(s => ({ ...s, time: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {AGENDA_HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label className="rcpt-field">
                Profissional
                <select className="select" value={agendaForm.doctorId} onChange={e => setAgendaForm(s => ({ ...s, doctorId: e.target.value }))}>
                  <option value="">Sem preferência</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="rcpt-field">
                Tipo
                <select className="select" value={agendaForm.type} onChange={e => setAgendaForm(s => ({ ...s, type: e.target.value }))}>
                  <option value="consultation">Consulta</option>
                  <option value="return">Retorno</option>
                  <option value="procedure">Procedimento</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label className="rcpt-field rcpt-modal-grid--full">
                Observações
                <input className="input" value={agendaForm.notes} onChange={e => setAgendaForm(s => ({ ...s, notes: e.target.value }))} placeholder="Motivo, solicitações especiais..." />
              </label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export { ReceptionistApp as default, ReceptionLoginModal };
