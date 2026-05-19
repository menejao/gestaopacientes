import { useState } from "react";
import { createRecord } from "../../api";
import { parseLocalDate } from "../../utils/dates";
import { googleCalendarUrl } from "../../utils/dates";
import { initials } from "../../utils/formatting";
import { calcAge, catLabel, gestationalAgeInfo, isProfileIncomplete, suggestNextVisitDate } from "../../utils/clinical";
import { isAcs } from "../../utils/roles";
import { VACCINE_OPTIONS } from "../../config/constants";
import { inferVaccineDoseTitle } from "../../pages/VaccinesPage";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import Select from "../ui/Select";
import Textarea from "../ui/Textarea";
import DocumentModal from "../DocumentModal";
import { PatientCardModal } from "./PatientCardModal";

function fmtDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-";
}

function getCouncilLabel(user) {
  if (!user?.councilNumber) return "";
  const council = user.role === "doctor"
    ? "CRM"
    : user.role === "dentist"
    ? "CRO"
    : ["pharmacist", "pharmacy_tech"].includes(String(user.role || ""))
    ? "CFF"
    : "COREN";
  return `${council} ${user.councilNumber}/${user.councilUf || ""}`;
}

function formatExactAge(birthDate) {
  const birth = parseLocalDate(birthDate);
  if (!birth) return "";
  const now = new Date();
  let ay = now.getFullYear() - birth.getFullYear();
  let am = now.getMonth() - birth.getMonth();
  let ad = now.getDate() - birth.getDate();
  if (ad < 0) { am -= 1; ad += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (am < 0) { ay -= 1; am += 12; }
  return [ay > 0 ? `${ay}a` : null, am > 0 ? `${am}m` : null, ad > 0 ? `${ad}d` : null].filter(Boolean).join(" ") || "0d";
}

function ProgressBar({ label, done, goal }) {
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const color = pct >= 100 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="protocol-progress">
      <div className="protocol-progress__head">
        <span className="protocol-progress__label">{label}</span>
        <span className="protocol-progress__count">{done}/{goal} · <span style={{ color, fontWeight: 700 }}>{pct}%</span></span>
      </div>
      <div className="protocol-progress__track">
        <div className="protocol-progress__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ProtocolTab({ patient, alerts, protocolSummary }) {
  if (!protocolSummary) {
    return <Alert tone="info">Nenhum dado de protocolo disponivel para este paciente.</Alert>;
  }

  const cat = String(patient?.careCategory || "").toLowerCase();
  const lostIndicators = [];
  if (cat === "child_followup" && patient?.birthDate) {
    const birth = parseLocalDate(patient.birthDate);
    const now = new Date();
    const agedays = Math.floor((now - birth) / 86400000);
    const visits = Number(protocolSummary.completed?.visits ?? protocolSummary.visitsCompleted ?? 0);
    let ay = now.getFullYear() - birth.getFullYear();
    let am = now.getMonth() - birth.getMonth();
    let ad = now.getDate() - birth.getDate();
    if (ad < 0) { am--; ad += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
    if (am < 0) { ay--; am += 12; }
    const idadeFmt = [ay > 0 ? `${ay}a` : null, am > 0 ? `${am}m` : null, ad > 0 ? `${ad}d` : null].filter(Boolean).join(" ") || "0d";
    const consultsDone = Number(protocolSummary.completed?.consultations ?? 0);
    const consultsTarget = Number(protocolSummary.targets?.consultations ?? 0);
    if (visits === 0 && agedays >= 31)
      lostIndicators.push({ msg: "1ª visita ACS — até o 1º mês de vida (prazo encerrado)", age: idadeFmt });
    if (agedays >= 181 && visits < 2)
      lostIndicators.push({ msg: "2ª visita ACS — do 2º ao 6º mês de vida (prazo encerrado)", age: idadeFmt });
    if (consultsTarget >= 1 && consultsDone === 0 && agedays >= 31)
      lostIndicators.push({ msg: "1ª consulta de puericultura — até o 1º mês de vida (prazo encerrado)", age: idadeFmt });
    if (consultsTarget >= 2 && consultsDone < 2 && agedays >= 181)
      lostIndicators.push({ msg: "2ª consulta de puericultura — do 2º ao 6º mês de vida (prazo encerrado)", age: idadeFmt });
  }

  return (
    <div className="pat-protocol">
      {lostIndicators.length > 0 && (
        <div className="patients-panel-stack" style={{ marginBottom: "var(--s-3)" }}>
          <div className="field__hint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Indicadores perdidos — Idade atual: {lostIndicators[0].age}
          </div>
          {lostIndicators.map((item) => (
            <Alert key={item.msg} tone="warning">
              {item.msg} — nao recuperavel
            </Alert>
          ))}
        </div>
      )}

      <div className="pat-protocol__bars">
        <div className="panel-block-label">Métricas de acompanhamento</div>
        <ProgressBar label="Visitas" done={protocolSummary.completed?.visits || 0} goal={protocolSummary.targets?.visits || 0} />
        <ProgressBar label="Consultas" done={protocolSummary.completed?.consultations || 0} goal={protocolSummary.targets?.consultations || 0} />
        <ProgressBar label="Vacinas" done={protocolSummary.completed?.vaccines || 0} goal={protocolSummary.targets?.vaccines || 0} />
      </div>

      {alerts?.length > 0 && (
        <div className="pat-alerts">
          <div className="panel-block-label">Alertas clínicos</div>
          {alerts.map((alert, index) => (
            <div
              key={alert.id || index}
              className={`pat-alert pat-alert--${
                alert.severity === "high" ? "danger" : alert.severity === "medium" ? "warning" : "info"
              }`}
            >
              <div className="pat-alert__title">{alert.title}</div>
              {alert.detail ? <div className="pat-alert__detail">{alert.detail}</div> : null}
            </div>
          ))}
        </div>
      )}

      {alerts?.length === 0 && protocolSummary?.alertsRestricted && (
        <Alert tone="info">Alertas e avisos deste paciente ficam visiveis apenas para a equipe responsavel.</Alert>
      )}
    </div>
  );
}

// ── TYPE_LABELS e TYPE_COLORS do monolito original (58ae55c)
const HIST_TYPE_LABELS = {
  consultation: "Consulta", visit: "Visita domiciliar", vaccine: "Vacina",
  procedure: "Procedimento", note: "Observação clínica", task: "Tarefa interna",
  message: "Mensagem interna", exam: "Exame", exam_request: "Pedido de exame",
  prescription: "Prescrição", referral: "Encaminhamento",
  nursing: "Evolução de enfermagem", evolution: "Evolução clínica", home_visit: "Visita domiciliar",
};
const HIST_TYPE_COLORS = {
  consultation:  ["#1d4ed8", "#eff6ff", "#bfdbfe"],
  visit:         ["#15803d", "#f0fdf4", "#bbf7d0"],
  home_visit:    ["#15803d", "#f0fdf4", "#bbf7d0"],
  vaccine:       ["#7c3aed", "#f5f3ff", "#ddd6fe"],
  procedure:     ["#c2410c", "#fff7ed", "#fed7aa"],
  note:          ["#475569", "var(--surface-2)", "var(--border)"],
  task:          ["#d97706", "#fffbeb", "#fde68a"],
  message:       ["#0891b2", "#ecfeff", "#a5f3fc"],
  exam:          ["#0f766e", "var(--surface-2)", "var(--border)"],
  exam_request:  ["#0f766e", "var(--surface-2)", "var(--border)"],
  prescription:  ["#15803d", "#f0fdf4", "#bbf7d0"],
  referral:      ["#6366f1", "#eff6ff", "#c7d2fe"],
  nursing:       ["#0d9488", "#f0fdfa", "#99f6e4"],
  evolution:     ["#0891b2", "#ecfeff", "#a5f3fc"],
};
const HIST_INTERNAL_TYPES = new Set(["task", "message"]);
const HIST_FILTER_TYPES = ["all","consultation","visit","vaccine","procedure","exam","exam_request","prescription","referral","note","task","message"];

function HistoricoTab({ history, appointments, tasks, messages, canManageUser, onDeleteAppointment }) {
  const [filter, setFilter] = useState("all");
  const [showInternal, setShowInternal] = useState(true);

  const allEvents = [
    ...(Array.isArray(history) ? history.map(h => ({
      id: h.id, source: "record", type: h.type || "note",
      date: h.date, time: h.metadata?.time || h.createdAt?.slice(11, 16) || "",
      title: h.title, details: h.details,
      professional: h.metadata?.professionalName || h.createdByName || h.professionalName || "",
      council: h.metadata?.professionalCouncil || h.professionalCouncil || "",
      internalOnly: h.internalOnly || HIST_INTERNAL_TYPES.has(h.type) || false,
      createdAt: h.createdAt,
    })) : []),
    ...(Array.isArray(appointments) ? appointments.map(a => ({
      id: a.id, source: "appointment", type: "consultation",
      date: a.date, time: "",
      title: a.summary || "Consulta",
      details: [
        a.demandType ? `Demanda: ${a.demandType === "scheduled" ? "Programada" : a.demandType === "spontaneous" ? "Espontânea" : "Retroativo"}` : "",
        a.conduct ? `Conduta: ${a.conduct}` : "",
        a.nextStep ? `Próximo: ${a.nextStep}` : "",
      ].filter(Boolean).join("\n"),
      professional: "", internalOnly: false, createdAt: a.createdAt,
      _apptObj: a,
    })) : []),
    ...(Array.isArray(tasks) ? tasks.map(t => ({
      id: t.id, source: "task", type: "task",
      date: t.dueDate || t.createdAt?.slice(0, 10) || "", time: "",
      title: t.title, details: t.notes || "",
      professional: "", status: t.status, internalOnly: true, createdAt: t.createdAt,
    })) : []),
    ...(Array.isArray(messages) ? messages.map(m => ({
      id: m.id, source: "message", type: "message",
      date: m.createdAt?.slice(0, 10) || "", time: m.createdAt?.slice(11, 16) || "",
      title: "Comunicação interna", details: m.text || m.body || "",
      professional: m.authorName || "", internalOnly: true, createdAt: m.createdAt,
    })) : []),
  ]
    .filter((e, _, arr) =>
      e.source !== "appointment" ||
      !arr.some(r => r.source === "record" && r.date === e.date && (r.title || "").toLowerCase().includes((e.title || "").toLowerCase().slice(0, 10)))
    )
    .filter(e => showInternal ? true : !e.internalOnly)
    .filter(e => filter === "all" || e.type === filter)
    .sort((a, b) => {
      const da = (a.date || "") + (a.time || "") + (a.createdAt || "");
      const db = (b.date || "") + (b.time || "") + (b.createdAt || "");
      return db.localeCompare(da);
    });

  return (
    <div className="panel-block">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem", flexWrap: "wrap", gap: ".5rem" }}>
        <div style={{ fontSize: ".72rem", color: "var(--text-3)" }}>
          {allEvents.length} {filter === "all" ? "eventos" : "registros"} · {allEvents.filter(e => !e.internalOnly).length} clínicos
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: ".35rem", fontSize: ".72rem", color: "var(--text-3)", cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={showInternal} onChange={e => setShowInternal(e.target.checked)}
            style={{ width: 12, height: 12, accentColor: "var(--teal-600)" }} />
          Mostrar registros internos (tarefas e mensagens)
        </label>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: ".35rem", marginBottom: ".75rem", padding: ".5rem .65rem", background: "var(--surface-2)", borderRadius: "var(--r-md)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: ".3rem", fontSize: ".68rem", color: "var(--text-3)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal-500)", display: "inline-block" }} />
          Clínico — entra no prontuário legal
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: ".3rem", fontSize: ".68rem", color: "var(--text-3)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#d97706", display: "inline-block" }} />
          Interno — só visível aqui
        </span>
      </div>

      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {HIST_FILTER_TYPES.map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            style={{
              fontSize: ".71rem", padding: ".2rem .55rem", borderRadius: 999, cursor: "pointer",
              fontWeight: filter === f ? 700 : 400,
              background: filter === f ? "var(--teal-600)" : "var(--surface-2)",
              color: filter === f ? "#fff" : "var(--text-2)",
              border: `1px solid ${filter === f ? "var(--teal-500)" : "var(--border)"}`,
            }}>
            {f === "all" ? "Todos" : HIST_TYPE_LABELS[f] || f}
          </button>
        ))}
      </div>

      {!allEvents.length ? (
        <p style={{ fontSize: ".84rem", color: "var(--text-3)" }}>Nenhum registro encontrado.</p>
      ) : allEvents.map(ev => {
        const [color, bg, border] = HIST_TYPE_COLORS[ev.type] || ["var(--text-3)", "var(--surface-2)", "var(--border)"];
        const label = HIST_TYPE_LABELS[ev.type] || ev.type;
        const isInternal = ev.internalOnly;
        return (
          <div key={ev.id + ev.source} style={{ display: "flex", gap: ".75rem", marginBottom: ".65rem", opacity: isInternal ? .8 : 1 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: ".35rem" }}>
              <div style={{ width: 10, height: 10, borderRadius: isInternal ? 2 : "50%", background: color, flexShrink: 0 }} />
              <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: ".25rem" }} />
            </div>
            <div style={{
              flex: 1, background: bg, border: `1px solid ${border}`,
              borderLeft: `3px solid ${color}`,
              borderRadius: "var(--r-md)", padding: ".6rem .85rem", marginBottom: ".1rem",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".5rem", marginBottom: ".2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--ink)" }}>{ev.title}</span>
                  <span style={{ fontSize: ".65rem", fontWeight: 700, padding: ".1rem .4rem", borderRadius: 999, background: color, color: "#fff", flexShrink: 0 }}>{label}</span>
                  {isInternal && <span style={{ fontSize: ".62rem", padding: ".08rem .35rem", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", flexShrink: 0 }}>somente interno</span>}
                  {ev.status && <span style={{ fontSize: ".65rem", padding: ".1rem .4rem", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-3)" }}>{ev.status}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: ".35rem", flexShrink: 0 }}>
                  <span style={{ fontSize: ".7rem", color: "var(--text-3)", fontFamily: "IBM Plex Mono, monospace", whiteSpace: "nowrap" }}>
                    {fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ""}
                  </span>
                  {canManageUser && ev.source === "appointment" && (
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", opacity: .6, padding: ".1rem", display: "flex", alignItems: "center" }}
                      title="Excluir" onClick={() => onDeleteAppointment?.(ev.id)}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {ev.professional && (
                <div style={{ fontSize: ".7rem", color: "var(--text-3)", marginBottom: ".2rem" }}>
                  {ev.professional}{ev.council ? ` · ${ev.council}` : ""}
                </div>
              )}
              {ev.details && (
                <pre style={{ margin: ".25rem 0 0", fontFamily: "inherit", fontSize: ".77rem", color: "var(--text-2)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{ev.details}</pre>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FollowupTab({ patient, users, recordForm, setRecordForm, recordVaccines, setRecordVaccines, onSubmitRecord, canWriteRecords, userObj }) {
  if (!canWriteRecords) {
    return <Alert tone="warning">Sem permissao para registrar atendimentos.</Alert>;
  }

  const acsMode = isAcs(userObj);

  return (
    <div className="panel-block">
      <div style={{ marginBottom: "1rem", padding: ".6rem .85rem", background: "var(--teal-50)", border: "1px solid var(--teal-100)", borderRadius: "var(--r-md)", fontSize: ".75rem", color: "var(--teal-700)" }}>
        <strong>Registrar atendimento</strong> — o que foi feito com o paciente agora ou retroativamente.
        Tudo que for registrado aqui aparece automaticamente no prontuário.
      </div>

      <form className="field-grid" onSubmit={onSubmitRecord}>
        <div className="field">
          <label style={{ fontSize: ".78rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>
            Tipo de atendimento
            {acsMode ? (
              <input className="input" value="Visita domiciliar" disabled />
            ) : (
              <div className="input">
                <select value={recordForm.type || "consultation"} onChange={e => {
                  const t = e.target.value;
                  const defaultTitle = t === "consultation"
                    ? (userObj?.role === "doctor" ? "Consulta médica" : userObj?.role === "dentist" ? "Consulta odontológica" : "Consulta de enfermagem")
                    : t === "visit" ? "Visita ACS" : "";
                  setRecordForm(s => ({ ...s, type: t, title: defaultTitle, consultKind: "medica", consultDoctor: "", consultSpecialty: "" }));
                  setRecordVaccines([]);
                }}>
                  <option value="consultation">Consulta</option>
                  <option value="visit">Visita domiciliar</option>
                  <option value="vaccine">Vacina</option>
                  <option value="procedure">Procedimento</option>
                  <option value="note">Observação / nota</option>
                </select>
              </div>
            )}
          </label>
        </div>

        <div className="field">
          <Input label="Data" type="date" value={recordForm.date || ""} max={new Date().toISOString().slice(0, 10)} onChange={e => setRecordForm(s => ({ ...s, date: e.target.value }))} />
        </div>

        {!acsMode && recordForm.type === "consultation" && (
          <div className="field field--span-2" style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            <label style={{ fontSize: ".78rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>
              Tipo de consulta
              <div className="input">
                <select value={recordForm.consultKind || "medica"} onChange={e => {
                  const k = e.target.value;
                  const titleMap = { medica: "Consulta médica", enfermagem: "Consulta de enfermagem", dentista: "Consulta odontológica" };
                  setRecordForm(s => ({ ...s, consultKind: k, title: titleMap[k] || "Consulta médica", consultDoctor: "", consultSpecialty: "" }));
                }}>
                  <option value="medica">Consulta médica</option>
                  <option value="enfermagem">Consulta de enfermagem</option>
                  <option value="dentista">Consulta odontológica (Dentista)</option>
                </select>
              </div>
            </label>
            {(recordForm.consultKind === "medica" || !recordForm.consultKind) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
                <label style={{ fontSize: ".78rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>
                  Médico(a) responsável
                  <div className="input">
                    <select value={recordForm.consultDoctor || ""} onChange={e => setRecordForm(s => ({ ...s, consultDoctor: e.target.value }))}>
                      <option value="">— Selecionar —</option>
                      {(users || []).filter(u => u.role === "doctor").map(u => (
                        <option key={u.id} value={u.name}>{u.name}{u.teamName ? ` (${u.teamName})` : ""}</option>
                      ))}
                      {!(users || []).some(u => u.role === "doctor") && (
                        <>
                          <option value="Dr. Carlos Mendes">Dr. Carlos Mendes</option>
                          <option value="Dra. Fernanda Costa">Dra. Fernanda Costa</option>
                        </>
                      )}
                    </select>
                  </div>
                </label>
                <label style={{ fontSize: ".78rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>
                  Especialidade
                  <div className="input">
                    <select value={recordForm.consultSpecialty || ""} onChange={e => setRecordForm(s => ({ ...s, consultSpecialty: e.target.value }))}>
                      <option value="">— Selecionar —</option>
                      <option value="Ginecologia">Ginecologia</option>
                      <option value="Médico da família">Médico da família</option>
                      <option value="Médico geral">Médico geral</option>
                      <option value="Pediatria">Pediatria</option>
                    </select>
                  </div>
                </label>
              </div>
            )}
            {recordForm.consultKind === "enfermagem" && (
              <label style={{ fontSize: ".78rem", fontWeight: 600, display: "flex", flexDirection: "column", gap: ".25rem" }}>
                Profissional de enfermagem
                <div className="input">
                  <select value={recordForm.consultDoctor || ""} onChange={e => setRecordForm(s => ({ ...s, consultDoctor: e.target.value }))}>
                    <option value="">— Selecionar —</option>
                    {(users || []).filter(u => ["nurse_manager", "nursing_tech"].includes(u.role)).map(u => (
                      <option key={u.id} value={u.name}>{u.name} — {u.role === "nurse_manager" ? "Enfermeira" : "Téc. Enfermagem"}{u.teamName ? ` (${u.teamName})` : ""}</option>
                    ))}
                  </select>
                </div>
              </label>
            )}
          </div>
        )}

        {!acsMode && (recordForm.type === "procedure" || recordForm.type === "note") && (
          <div className="field field--span-2">
            <Input
              label={recordForm.type === "procedure" ? "Procedimento realizado" : "Assunto da nota"}
              placeholder={recordForm.type === "procedure" ? "Ex: Curativo, aferição PA..." : "Ex: Orientação nutricional..."}
              value={recordForm.title || ""}
              onChange={e => setRecordForm(s => ({ ...s, title: e.target.value }))}
            />
          </div>
        )}

        {!acsMode && recordForm.type === "vaccine" && (
          <div className="field field--span-2" style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
            <span style={{ fontSize: ".75rem", fontWeight: 600 }}>Vacinas aplicadas</span>
            {(() => {
              const birthDate = patient?.birthDate;
              const am = birthDate
                ? Math.floor((Date.now() - (parseLocalDate(birthDate) || new Date()).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
                : null;
              const isCrianca = am !== null && am < 120;
              return isCrianca && recordForm.date && recordVaccines.length > 0 ? (
                <div style={{ padding: ".4rem .6rem", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "var(--r-md)", fontSize: ".72rem", color: "#1d4ed8", display: "flex", flexDirection: "column", gap: ".2rem" }}>
                  <strong>Doses que serão registradas:</strong>
                  {recordVaccines.map(v => {
                    const resolved = inferVaccineDoseTitle(v, recordForm.date, patient.birthDate);
                    return <span key={v}>💉 {resolved !== v ? resolved : `${v} (dose não inferida — verifique a data)`}</span>;
                  })}
                </div>
              ) : null;
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".3rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: ".65rem .75rem", maxHeight: 200, overflowY: "auto" }}>
              {VACCINE_OPTIONS.map(v => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: ".4rem", fontSize: ".8rem", cursor: "pointer", padding: ".25rem .35rem", borderRadius: "var(--r-sm)", background: recordVaccines.includes(v) ? "var(--teal-50)" : "transparent", border: recordVaccines.includes(v) ? "1px solid var(--teal-200)" : "1px solid transparent" }}>
                  <input type="checkbox" checked={recordVaccines.includes(v)}
                    onChange={e => setRecordVaccines(prev => e.target.checked ? [...prev, v] : prev.filter(x => x !== v))}
                    style={{ accentColor: "var(--teal-600)", width: 13, height: 13, cursor: "pointer", flexShrink: 0 }} />
                  {v}
                </label>
              ))}
            </div>
          </div>
        )}

        {recordForm.type === "consultation" && (
          <div className="field field--span-2">
            <Select label="Tipo de demanda" value={recordForm.demandType || "scheduled"} onChange={e => setRecordForm(s => ({ ...s, demandType: e.target.value }))}>
              <option value="scheduled">Programada</option>
              <option value="spontaneous">Espontânea</option>
              <option value="retroactive">Retroativo</option>
            </Select>
          </div>
        )}

        {(recordForm.type === "consultation" || recordForm.type === "procedure") && (
          <div className="field field--span-2">
            <Textarea className="patients-textarea" label="Conduta / resultado" rows={2} placeholder="O que foi feito, orientações dadas, conduta adotada..." value={recordForm.conduct || ""} onChange={e => setRecordForm(s => ({ ...s, conduct: e.target.value }))} />
          </div>
        )}

        {recordForm.type === "consultation" && (
          <div className="field field--span-2">
            <Input label="Próximo passo / retorno" placeholder="Ex: Retorno em 30 dias, aguardar resultado de exame..." value={recordForm.nextStep || ""} onChange={e => setRecordForm(s => ({ ...s, nextStep: e.target.value }))} />
          </div>
        )}

        <div className="field field--span-2">
          <Textarea className="patients-textarea" label="Observações adicionais" rows={2} placeholder="Informações complementares..." value={recordForm.details || ""} onChange={e => setRecordForm(s => ({ ...s, details: e.target.value }))} />
        </div>

        <div className="field field--span-2" style={{ padding: ".5rem .65rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "var(--r-md)", fontSize: ".72rem", color: "#15803d" }}>
          Este registro será salvo automaticamente no prontuário com data, hora e profissional responsável.
        </div>

        <div className="field--span-2 patients-form-actions">
          <Button type="submit">Registrar atendimento</Button>
        </div>
      </form>
    </div>
  );
}

const EXAM_TYPES = [
  "Hemograma completo", "Glicemia em jejum", "HbA1c", "Colesterol total e fracoes", "Triglicerideos",
  "Creatinina", "Ureia", "TGO/TGP", "TSH/T4 livre", "Urina rotina (EAS)", "Urocultura", "Raio-X torax",
  "Ultrassonografia abdominal", "Ultrassonografia obstetrica", "ECG", "Espirometria", "Mamografia",
  "Papanicolau", "PSA", "Ferritina/Ferro serico", "Vitamina D", "Coagulograma", "Outros"
];

const MEDICATIONS_COMMON = [
  "Acido folico 5mg", "Amlodipino 5mg", "Amlodipino 10mg", "Atenolol 25mg", "Atenolol 50mg",
  "Atorvastatina 20mg", "Atorvastatina 40mg", "Captopril 25mg", "Captopril 50mg", "Carvedilol 6,25mg",
  "Carvedilol 12,5mg", "Enalapril 5mg", "Enalapril 10mg", "Espironolactona 25mg", "Furosemida 40mg",
  "Glibenclamida 5mg", "Glicazida 30mg", "Hidroclorotiazida 25mg", "Insulina NPH", "Insulina Regular",
  "Levotiroxina 25mcg", "Levotiroxina 50mcg", "Levotiroxina 100mcg", "Losartana 50mg", "Losartana 100mg",
  "Metformina 500mg", "Metformina 850mg", "Metformina 1g", "Metoprolol 25mg", "Metoprolol 50mg",
  "Nifedipino 10mg", "Omeprazol 20mg", "Omeprazol 40mg", "Rosuvastatina 10mg", "Rosuvastatina 20mg",
  "Sinvastatina 20mg", "Sinvastatina 40mg", "Sulfato ferroso 40mg", "Valsartana 80mg", "Valsartana 160mg",
  "Outros (digitar)"
];

function ExamRequestModal({ patient, user, token, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [exams, setExams] = useState([{ type: "Hemograma completo", name: "", urgency: "routine", notes: "" }]);
  const [justification, setJustification] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function addExam() { setExams(s => [...s, { type: "Hemograma completo", name: "", urgency: "routine", notes: "" }]); }
  function removeExam(i) { setExams(s => s.filter((_, idx) => idx !== i)); }
  function updateExam(i, k, v) { setExams(s => s.map((e, idx) => idx === i ? { ...e, [k]: v } : e)); }

  async function submit(e) {
    e.preventDefault();
    const valid = exams.filter(exam => exam.type && (exam.type !== "Outros" || exam.name.trim()));
    if (!valid.length) { setErr("Adicione ao menos um exame."); return; }
    setBusy(true); setErr("");
    try {
      const title = valid.map(exam => exam.type === "Outros" ? exam.name.trim() : exam.type).join(", ");
      const details = [
        `PEDIDO DE EXAME - emitido em ${new Date().toLocaleDateString("pt-BR")}`,
        `Profissional: ${user?.name || ""}${getCouncilLabel(user) ? ` (${getCouncilLabel(user)})` : ""}`,
        `Paciente: ${patient.name}`, "",
        ...valid.map((exam, idx) => `${idx + 1}. ${exam.type === "Outros" ? exam.name.trim() : exam.type}${exam.urgency === "urgent" ? " - URGENTE" : exam.urgency === "priority" ? " - PRIORITARIO" : ""}${exam.notes ? `\n   Observacao: ${exam.notes}` : ""}`),
        justification ? `\nJustificativa clinica: ${justification}` : "",
      ].filter(Boolean).join("\n");
      await createRecord(token, patient.id, { type: "exam_request", date: today, time: new Date().toTimeString().slice(0, 5), title: `Pedido de exame: ${title}`, details, immutable: true, professionalName: user?.name || "", professionalCouncil: getCouncilLabel(user) });
      onClose(true);
    } catch (error) { setErr(error?.message || "Erro ao salvar."); } finally { setBusy(false); }
  }

  return (
    <Modal title="Pedido de exame" onClose={() => onClose(false)} className="modal--lg"
      actions={<><Button variant="secondary" type="button" onClick={() => onClose(false)}>Cancelar</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Registrando..." : "Emitir pedido"}</Button></>}>
      <form onSubmit={submit} className="patients-panel-stack">
        {exams.map((exam, idx) => (
          <div key={`${exam.type}-${idx}`} className="field-grid card card--soft">
            <Select className="field field--span-2" label="Exame" value={exam.type} onChange={e => updateExam(idx, "type", e.target.value)}>
              {EXAM_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
            </Select>
            <div className="field" style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
              <Select label="Prioridade" value={exam.urgency} onChange={e => updateExam(idx, "urgency", e.target.value)}>
                <option value="routine">Rotina</option>
                <option value="priority">Prioritario</option>
                <option value="urgent">Urgente</option>
              </Select>
              {exams.length > 1 ? <Button variant="ghost" size="sm" type="button" onClick={() => removeExam(idx)}>Remover</Button> : null}
            </div>
            {exam.type === "Outros" ? <Input className="field field--span-3" label="Nome do exame" value={exam.name} onChange={e => updateExam(idx, "name", e.target.value)} /> : null}
            <Textarea className="field field--span-3 patients-textarea" label="Observacao" rows={2} value={exam.notes} onChange={e => updateExam(idx, "notes", e.target.value)} placeholder="Observacao especifica (opcional)" />
          </div>
        ))}
        <div className="patients-form-actions"><Button variant="secondary" type="button" onClick={addExam}>Adicionar exame</Button></div>
        <Textarea className="field field--span-2 patients-textarea" label="Justificativa clinica" rows={3} value={justification} onChange={e => setJustification(e.target.value)} placeholder="Hipotese diagnostica ou motivo do pedido..." />
        {err ? <Alert tone="danger">{err}</Alert> : null}
      </form>
    </Modal>
  );
}

function PrescriptionModal({ patient, user, token, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [meds, setMeds] = useState([{ name: "", custom: "", dosage: "", frequency: "", duration: "", route: "", notes: "" }]);
  const [validity, setValidity] = useState("30");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function addMed() { setMeds(s => [...s, { name: "", custom: "", dosage: "", frequency: "", duration: "", route: "", notes: "" }]); }
  function removeMed(i) { setMeds(s => s.filter((_, idx) => idx !== i)); }
  function updateMed(i, k, v) { setMeds(s => s.map((m, idx) => idx === i ? { ...m, [k]: v } : m)); }

  async function submit(e) {
    e.preventDefault();
    const valid = meds.filter(med => (med.name && med.name !== "Outros (digitar)") || med.custom.trim());
    if (!valid.length) { setErr("Adicione ao menos um medicamento."); return; }
    if (valid.find(med => !med.dosage.trim() || !med.frequency.trim())) { setErr("Preencha dose e frequencia para todos os medicamentos."); return; }
    setBusy(true); setErr("");
    try {
      const title = valid.map(med => med.name === "Outros (digitar)" ? med.custom.trim() : med.name).join(", ");
      const details = [
        `PRESCRICAO MEDICA - emitida em ${new Date().toLocaleDateString("pt-BR")}`,
        `Validade: ${validity} dias`,
        `Profissional: ${user?.name || ""}${getCouncilLabel(user) ? ` (${getCouncilLabel(user)})` : ""}`,
        `Paciente: ${patient.name}`, "",
        ...valid.map((med, idx) => {
          const name = med.name === "Outros (digitar)" ? med.custom.trim() : med.name;
          return `${idx + 1}. ${name} ${med.dosage}${med.route ? ` - Via: ${med.route}` : ""}\n   Frequencia: ${med.frequency}${med.duration ? ` por ${med.duration}` : ""}${med.notes ? `\n   Observacao: ${med.notes}` : ""}`;
        }),
      ].join("\n");
      await createRecord(token, patient.id, { type: "prescription", date: today, time: new Date().toTimeString().slice(0, 5), title: `Prescricao: ${title}`, details, immutable: true, professionalName: user?.name || "", professionalCouncil: getCouncilLabel(user) });
      onClose(true);
    } catch (error) { setErr(error?.message || "Erro ao salvar."); } finally { setBusy(false); }
  }

  return (
    <Modal title="Prescricao de medicamentos" onClose={() => onClose(false)} className="modal--lg"
      actions={<><Button variant="secondary" type="button" onClick={() => onClose(false)}>Cancelar</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Registrando..." : "Emitir prescricao"}</Button></>}>
      <form onSubmit={submit} className="patients-panel-stack">
        {meds.map((med, idx) => (
          <div key={`${med.name}-${idx}`} className="field-grid card card--soft">
            <Select className="field field--span-2" label="Medicamento" value={med.name} onChange={e => updateMed(idx, "name", e.target.value)}>
              <option value="">Selecione...</option>
              {MEDICATIONS_COMMON.map(item => <option key={item} value={item}>{item}</option>)}
            </Select>
            {meds.length > 1 ? <div className="field patients-form-actions"><Button variant="ghost" type="button" onClick={() => removeMed(idx)}>Remover</Button></div> : null}
            {med.name === "Outros (digitar)" ? <Input className="field field--span-3" label="Nome do medicamento" value={med.custom} onChange={e => updateMed(idx, "custom", e.target.value)} /> : null}
            <Input className="field" label="Dose *" value={med.dosage} onChange={e => updateMed(idx, "dosage", e.target.value)} placeholder="Ex: 500mg" />
            <Input className="field" label="Frequencia *" value={med.frequency} onChange={e => updateMed(idx, "frequency", e.target.value)} placeholder="Ex: 1x ao dia" />
            <Select className="field" label="Via" value={med.route} onChange={e => updateMed(idx, "route", e.target.value)}>
              <option value="">-</option>
              <option value="Oral">Oral</option>
              <option value="Sublingual">Sublingual</option>
              <option value="Inalatoria">Inalatoria</option>
              <option value="Topica">Topica</option>
              <option value="Intramuscular">Intramuscular</option>
              <option value="Subcutanea">Subcutanea</option>
              <option value="Intravenosa">Intravenosa</option>
              <option value="Retal">Retal</option>
              <option value="Ocular">Ocular</option>
            </Select>
            <Input className="field field--span-3" label="Duracao" value={med.duration} onChange={e => updateMed(idx, "duration", e.target.value)} placeholder="Ex: 7 dias, uso continuo..." />
            <Textarea className="field field--span-3 patients-textarea" label="Observacao" rows={2} value={med.notes} onChange={e => updateMed(idx, "notes", e.target.value)} placeholder="Tomar em jejum, com alimentos..." />
          </div>
        ))}
        <div className="field-grid">
          <div className="field patients-form-actions"><Button variant="secondary" type="button" onClick={addMed}>Adicionar medicamento</Button></div>
          <Select className="field" label="Validade da receita" value={validity} onChange={e => setValidity(e.target.value)}>
            <option value="10">10 dias</option>
            <option value="30">30 dias</option>
            <option value="60">60 dias</option>
            <option value="90">90 dias</option>
            <option value="180">180 dias</option>
          </Select>
        </div>
        {err ? <Alert tone="danger">{err}</Alert> : null}
      </form>
    </Modal>
  );
}

function InternalReferralModal({ patient, user, users, token, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const doctors = (users || []).filter(item => ["doctor", "dentist"].includes(String(item.role || "")));
  const [targetId, setTargetId] = useState(doctors[0]?.id || "");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("routine");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr("Informe o motivo do encaminhamento."); return; }
    const target = doctors.find(item => item.id === targetId);
    if (!target) { setErr("Selecione o profissional."); return; }
    setBusy(true); setErr("");
    try {
      const details = [
        `ENCAMINHAMENTO INTERNO - ${new Date().toLocaleDateString("pt-BR")}`,
        `De: ${user?.name || ""} (${String(user?.role || "").replace(/_/g, " ")})`,
        `Para: ${target.name} (${String(target.role || "").replace(/_/g, " ")})`,
        `Prioridade: ${priority === "urgent" ? "Urgente" : priority === "priority" ? "Prioritario" : "Rotina"}`,
        "", "Motivo / hipotese diagnostica:", reason.trim(),
      ].join("\n");
      await createRecord(token, patient.id, { type: "referral", date: today, time: new Date().toTimeString().slice(0, 5), title: `Encaminhamento p/ ${target.name}`, details, immutable: true, professionalName: user?.name || "", professionalCouncil: getCouncilLabel(user) });
      onClose(true);
    } catch (error) { setErr(error?.message || "Erro ao salvar."); } finally { setBusy(false); }
  }

  return (
    <Modal title="Encaminhamento interno" onClose={() => onClose(false)} className="modal--lg"
      actions={doctors.length ? <><Button variant="secondary" type="button" onClick={() => onClose(false)}>Cancelar</Button><Button type="button" onClick={submit} disabled={busy}>{busy ? "Registrando..." : "Encaminhar"}</Button></> : null}>
      {!doctors.length ? (
        <Alert tone="warning">Nenhum medico/dentista cadastrado na equipe para encaminhar.</Alert>
      ) : (
        <form onSubmit={submit} className="field-grid">
          <Select className="field field--span-2" label="Encaminhar para" value={targetId} onChange={e => setTargetId(e.target.value)}>
            {doctors.map(doctor => (
              <option key={doctor.id} value={doctor.id}>{doctor.name} - {doctor.role === "dentist" ? "Dentista" : "Medico(a)"}</option>
            ))}
          </Select>
          <Select className="field" label="Prioridade" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="routine">Rotina</option>
            <option value="priority">Prioritario</option>
            <option value="urgent">Urgente - ver hoje</option>
          </Select>
          <Textarea className="field field--span-3 patients-textarea" label="Motivo / hipotese diagnostica *" rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Descreva o motivo do encaminhamento, sinais e sintomas relevantes..." />
          {err ? <Alert tone="danger" className="field--span-3">{err}</Alert> : null}
        </form>
      )}
    </Modal>
  );
}

function AcoesClinicasTab({ patient, user, users, token, canManageUser, canWriteRecords }) {
  const [modal, setModal] = useState(null);
  const [done, setDone] = useState([]);

  function handleClose(type, ok) {
    setModal(null);
    if (ok) setDone(s => [{ type, ts: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }, ...s]);
  }

  if (!canWriteRecords) {
    return <Alert tone="warning">Sem permissao para registrar acoes assistenciais neste paciente.</Alert>;
  }

  const canPrescribe = canManageUser || ["doctor", "dentist", "nurse_manager"].includes(String(user?.role || ""));
  const canRefer = String(user?.role || "") === "nurse_manager";
  const canExam = canManageUser || canWriteRecords;

  const actions = [
    canExam ? {
      id: "exam", title: "Pedir exame", desc: "Solicite exames laboratoriais ou de imagem com prioridade e justificativa.",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M9 3v10l-4 7h14l-4-7V3"/><circle cx="12" cy="17.5" r=".75" fill="currentColor" stroke="none"/></svg>,
    } : null,
    canPrescribe ? {
      id: "prescription", title: "Prescrever medicamento", desc: "Emita prescricao com medicamentos, dosagem, frequencia e via.",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="9" width="16" height="6" rx="3"/><line x1="12" y1="9" x2="12" y2="15"/></svg>,
    } : null,
    canRefer ? {
      id: "referral", title: "Encaminhar ao medico", desc: "Encaminhe o paciente a medico ou dentista da unidade com justificativa.",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
    } : null,
  ].filter(Boolean);

  return (
    <div className="patients-panel-stack">
      <div className="assistencial-launcher">
        {actions.map(action => (
          <Button key={action.id} type="button" variant="secondary" className="assistencial-card" onClick={() => setModal(action.id)}>
            <span className="assistencial-card__icon">{action.icon}</span>
            <span className="assistencial-card__body">
              <span className="assistencial-card__title">{action.title}</span>
              <span className="assistencial-card__desc">{action.desc}</span>
            </span>
          </Button>
        ))}
      </div>

      {done.length > 0 && (
        <div className="card card--soft">
          <div className="field__hint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "var(--s-2)" }}>
            Registrado nesta sessao
          </div>
          <div className="patients-panel-stack">
            {done.map((item, idx) => (
              <div key={`${item.type}-${idx}`} className="pat-list-item">
                <div className="pat-list-item__main">
                  <div className="pat-list-item__title">
                    {item.type === "exam" ? "Pedido de exame" : item.type === "prescription" ? "Prescricao" : "Encaminhamento interno"}
                  </div>
                </div>
                <div className="pat-list-item__meta">{item.ts}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal === "exam" && <ExamRequestModal patient={patient} user={user} token={token} onClose={ok => handleClose("exam", ok)} />}
      {modal === "prescription" && <PrescriptionModal patient={patient} user={user} token={token} onClose={ok => handleClose("prescription", ok)} />}
      {modal === "referral" && <InternalReferralModal patient={patient} user={user} users={users} token={token} onClose={ok => handleClose("referral", ok)} />}
    </div>
  );
}

function TasksTab({ patient, users, templates, history, tasks, taskForm, setTaskForm, onSubmitTask, onStatusChange, canWriteRecords }) {
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try { await onSubmitTask?.(event); } finally { setBusy(false); }
  }

  const tmpl = (templates || []).find(t => t.category === patient?.careCategory);
  const suggestion = suggestNextVisitDate(history, tmpl);
  const acsUser = (users || []).find(u => u.id === patient?.assignedAcsId);
  const acsName = acsUser?.name || "ACS";

  return (
    <div className="patients-panel-stack">
      {suggestion && (
        <div style={{
          marginBottom: "1rem", padding: ".75rem .9rem",
          background: suggestion.overdue ? "var(--rose-50, #fff1f2)" : "var(--teal-50)",
          border: `1px solid ${suggestion.overdue ? "var(--rose-200, #fecdd3)" : "var(--teal-100)"}`,
          borderRadius: "var(--r-md)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".25rem" }}>
                <span style={{ fontWeight: 600, fontSize: ".82rem", color: suggestion.overdue ? "var(--danger)" : "var(--teal-700)" }}>
                  {suggestion.overdue ? "Visita atrasada" : "Próxima visita sugerida"}
                </span>
                <span style={{ fontSize: ".78rem", fontFamily: "IBM Plex Mono, monospace", color: suggestion.overdue ? "var(--danger)" : "var(--teal-600)", fontWeight: 700 }}>
                  {fmtDate(suggestion.date)}
                </span>
              </div>
              <p style={{ fontSize: ".75rem", color: suggestion.overdue ? "var(--danger)" : "var(--teal-600)", margin: 0 }}>
                {suggestion.reason}
              </p>
            </div>
            <div style={{ display: "flex", gap: ".4rem", flexShrink: 0, flexWrap: "wrap" }}>
              {canWriteRecords && (
                <Button variant="secondary" size="sm" type="button"
                  onClick={() => setTaskForm?.(s => ({
                    ...s,
                    title: `Visita ACS — ${patient?.name || ""}`,
                    dueDate: suggestion.date,
                    assigneeId: patient?.assignedAcsId || "",
                    notes: suggestion.reason,
                  }))}>
                  Criar tarefa
                </Button>
              )}
              {suggestion.date && patient && (
                <a href={googleCalendarUrl({
                  title: `Visita ACS — ${patient.name}`,
                  date: suggestion.date,
                  description: `${suggestion.reason}\nPaciente: ${patient.name}\nACS: ${acsName}`,
                  location: [patient.address, patient.number, patient.neighborhood, patient.city].filter(Boolean).join(", "),
                })} target="_blank" rel="noreferrer"
                  style={{ fontSize: ".75rem", padding: ".3rem .65rem", background: "white", border: "1px solid var(--teal-200)", borderRadius: "var(--r-md)", cursor: "pointer", color: "var(--teal-700)", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  Google Calendar
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {canWriteRecords && (
        <form onSubmit={handleSubmit} className="field-grid">
          <Input className="field field--span-2" label="Nova tarefa" value={taskForm?.title ?? ""} onChange={e => setTaskForm?.(s => ({ ...s, title: e.target.value }))} placeholder="Ex.: retorno, busca ativa, atualizacao cadastral..." />
          <Input className="field" label="Prazo" type="date" value={taskForm?.dueDate ?? ""} onChange={e => setTaskForm?.(s => ({ ...s, dueDate: e.target.value }))} />
          <Select className="field" label="Responsavel" value={taskForm?.assigneeId ?? ""} onChange={e => setTaskForm?.(s => ({ ...s, assigneeId: e.target.value }))}>
            <option value="">Sem responsavel</option>
            {(users || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Textarea className="field field--span-2 patients-textarea" label="Observacoes" rows={2} value={taskForm?.notes ?? ""} onChange={e => setTaskForm?.(s => ({ ...s, notes: e.target.value }))} placeholder="Contexto operacional para equipe." />
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar tarefa"}</Button>
          </div>
        </form>
      )}

      {!tasks?.length ? (
        <Alert tone="info">Sem tarefas para este paciente.</Alert>
      ) : (
        <div className="pat-list">
          {tasks.map(task => (
            <div key={task.id} className="pat-list-item">
              <div className="pat-list-item__main">
                <div className="pat-list-item__title">{task.title}</div>
                <div className="pat-list-item__meta">
                  {task.dueDate ? `Prazo: ${fmtDate(task.dueDate)}` : "Sem prazo"}
                  {task.assigneeId ? ` - ${(users || []).find(item => item.id === task.assigneeId)?.name || ""}` : ""}
                </div>
                {task.notes ? <div className="pat-list-item__detail">{task.notes}</div> : null}
              </div>
              <Select className="patients-task-status" value={task.status || "pending"} onChange={e => onStatusChange?.(task.id, e.target.value)}>
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluida</option>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessagesTab({ messages, messageText, setMessageText, onSubmitMessage, canReply }) {
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try { await onSubmitMessage?.(event); } finally { setBusy(false); }
  }

  return (
    <div className="patients-panel-stack">
      {canReply ? (
        <form onSubmit={handleSubmit} className="field-grid">
          <Textarea className="field field--span-2 patients-textarea" label="Mensagem interna" rows={3} value={messageText ?? ""} onChange={e => setMessageText?.(e.target.value)} placeholder="Registrar orientacao ou recado interno da equipe." />
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy || !String(messageText || "").trim()}>
              {busy ? "Enviando..." : "Registrar mensagem"}
            </Button>
          </div>
        </form>
      ) : (
        <Alert tone="warning">Sem permissao para enviar mensagens neste paciente.</Alert>
      )}

      {!messages?.length ? (
        <Alert tone="info">Sem mensagens internas associadas a este paciente.</Alert>
      ) : (
        <div className="pat-list">
          {messages.map(message => (
            <div key={message.id} className="pat-list-item">
              <div className="pat-list-item__main">
                <div className="pat-list-item__title">{message.authorName || "Equipe clinica"}</div>
                <div className="pat-list-item__meta">{new Date(message.createdAt).toLocaleString("pt-BR")}</div>
                <div className="pat-list-item__detail">{message.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tab IDs válidos — igual ao monolito 58ae55c
const DETAIL_TABS = [
  { id: "protocol",     label: "Protocolo" },
  { id: "followup",     label: "Atendimento" },
  { id: "appointments", label: "Histórico" },
  { id: "tasks",        label: "Tarefas" },
  { id: "exams",        label: "Ações clínicas" },
  { id: "messages",     label: "Mensagens" },
];
const VALID_TAB_IDS = new Set(DETAIL_TABS.map(t => t.id));

export default function PatientDetailPanel({
  patient,
  users,
  templates,
  patientTab,
  setPatientTab,
  appointments,
  tasks,
  messages,
  history,
  sortedSpecialAlerts,
  patientProtocolSummary,
  recordForm,
  setRecordForm,
  recordVaccines,
  setRecordVaccines,
  onSubmitRecord,
  appointmentForm,
  setAppointmentForm,
  onSubmitAppointment,
  taskForm,
  setTaskForm,
  onSubmitTask,
  messageText,
  setMessageText,
  onSubmitMessage,
  onDeleteAppointment,
  onDeleteRecord,
  onStatusChange,
  canManageUser,
  canWriteRecords,
  userObj,
  token,
  onClose,
}) {
  const [docType, setDocType] = useState(null);
  const [showPatientCard, setShowPatientCard] = useState(false);

  // Fallback: se tab salva não existe mais (ex: "assistencial", "history"), volta para protocol
  const activeTab = VALID_TAB_IDS.has(patientTab) ? patientTab : "protocol";

  const g = gestationalAgeInfo(patient);
  const acsName = (users || []).find(item => item.id === patient.assignedAcsId)?.name || "Nao atribuido";
  const age = calcAge(patient.birthDate);

  return (
    <>
      <div className="panel-patient-header">
        <div className="panel-patient-avatar">{initials(patient.name)}</div>
        <div className="panel-patient-info">
          <div className="panel-patient-name">
            {patient.name}
            {age ? <span className="panel-patient-age">{age}</span> : null}
            {isProfileIncomplete(patient) ? (
              <span className="panel-patient-incomplete">Cadastro incompleto</span>
            ) : null}
            <div className="panel-patient-doc-actions">
              <Button size="sm" onClick={() => setShowPatientCard(true)}>Cartao SUS</Button>
              <Button variant="secondary" size="sm" onClick={() => setDocType("comparecimento")}>Declaracao</Button>
              {canManageUser ? <Button variant="secondary" size="sm" onClick={() => setDocType("atestado")}>Atestado</Button> : null}
            </div>
          </div>
          <div className="panel-patient-meta">
            <span>{catLabel(templates, patient.careCategory)}</span>
            <span>-</span>
            <span>ACS: {acsName}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" iconOnly title="Fechar painel" aria-label="Fechar painel" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Button>
      </div>

      {isProfileIncomplete(patient) ? (
        <div className="panel-banner panel-banner--warn">
          Este paciente foi cadastrado rapidamente. <strong>Complete o perfil</strong> para liberar atendimentos.
        </div>
      ) : null}

      {g && String(patient.careCategory || "").toLowerCase() === "pregnant" ? (
        <div className="panel-banner panel-banner--info">
          IG estimada: <strong>{g.weeks}s {g.days}d</strong> (ref: {g.source})
        </div>
      ) : null}

      <div className="tabs small-tabs" style={{ flexWrap: "nowrap", overflowX: "auto", whiteSpace: "nowrap", scrollbarWidth: "thin" }}>
        {DETAIL_TABS.map(tab => (
          <button key={tab.id} className={`tab${activeTab === tab.id ? " active" : ""}`}
            style={{ flexShrink: 0, whiteSpace: "nowrap" }}
            onClick={() => setPatientTab?.(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-block">
        {activeTab === "protocol" && (
          <ProtocolTab patient={patient} alerts={sortedSpecialAlerts} protocolSummary={patientProtocolSummary} />
        )}

        {activeTab === "followup" && (
          <FollowupTab
            patient={patient}
            users={users}
            recordForm={recordForm}
            setRecordForm={setRecordForm}
            recordVaccines={recordVaccines}
            setRecordVaccines={setRecordVaccines}
            onSubmitRecord={onSubmitRecord}
            canWriteRecords={canWriteRecords}
            userObj={userObj}
          />
        )}

        {activeTab === "appointments" && (
          <HistoricoTab
            history={history}
            appointments={appointments}
            tasks={tasks}
            messages={messages}
            canManageUser={canManageUser}
            onDeleteAppointment={onDeleteAppointment}
          />
        )}

        {activeTab === "tasks" && (
          <TasksTab
            patient={patient}
            users={users}
            templates={templates}
            history={history}
            tasks={tasks}
            taskForm={taskForm}
            setTaskForm={setTaskForm}
            onSubmitTask={onSubmitTask}
            onStatusChange={onStatusChange}
            canWriteRecords={canWriteRecords}
          />
        )}

        {activeTab === "exams" && (
          <AcoesClinicasTab
            patient={patient}
            user={userObj}
            users={users}
            token={token}
            canManageUser={canManageUser}
            canWriteRecords={canWriteRecords}
          />
        )}

        {activeTab === "messages" && (
          <MessagesTab
            messages={messages}
            messageText={messageText}
            setMessageText={setMessageText}
            onSubmitMessage={onSubmitMessage}
            canReply={!isAcs(userObj)}
          />
        )}
      </div>

      {docType ? (
        <DocumentModal patient={patient} user={userObj} type={docType} onClose={() => setDocType(null)} />
      ) : null}
      {showPatientCard ? (
        <PatientCardModal patient={patient} users={users || []} templates={templates || []} history={history} onClose={() => setShowPatientCard(false)} />
      ) : null}
    </>
  );
}
