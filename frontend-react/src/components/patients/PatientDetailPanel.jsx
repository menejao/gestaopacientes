import { useState } from "react";
import { createRecord } from "../../api";
import { parseLocalDate } from "../../utils/dates";
import { initials } from "../../utils/formatting";
import { calcAge, catLabel, gestationalAgeInfo, isProfileIncomplete } from "../../utils/clinical";
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

function demandTypeLabel(value) {
  return {
    scheduled: "Programada",
    spontaneous: "Espontanea",
    referred: "Encaminhada",
    retroactive: "Retroativo",
  }[String(value || "").toLowerCase()] || "Nao informado";
}

function typeLabel(type) {
  const map = {
    consultation: "Consulta",
    visit: "Visita ACS",
    vaccine: "Vacina",
    procedure: "Procedimento",
    note: "Anotacao",
    appointment: "Atendimento",
    exam_request: "Pedido de exame",
    prescription: "Prescricao",
    referral: "Encaminhamento",
    message: "Mensagem interna",
    task: "Tarefa",
  };
  return map[String(type || "").toLowerCase()] || String(type || "") || "Registro";
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

function getLostIndicators(patient, protocolSummary) {
  const cat = String(patient?.careCategory || "").toLowerCase();
  if (cat !== "child_followup" || !patient?.birthDate || !protocolSummary) {
    return [];
  }

  const birth = parseLocalDate(patient.birthDate);
  if (!birth) return [];
  const now = new Date();
  const ageDays = Math.floor((now - birth) / 86400000);
  const visitsDone = Number(protocolSummary.completed?.visits ?? protocolSummary.visitsCompleted ?? 0);
  const consultsDone = Number(protocolSummary.completed?.consultations ?? 0);
  const consultsTarget = Number(protocolSummary.targets?.consultations ?? 0);
  const lost = [];

  if (visitsDone === 0 && ageDays >= 31) {
    lost.push("1a visita ACS - ate o 1o mes de vida (prazo encerrado)");
  }
  if (ageDays >= 181 && visitsDone < 2) {
    lost.push("2a visita ACS - do 2o ao 6o mes de vida (prazo encerrado)");
  }
  if (consultsTarget >= 1 && consultsDone === 0 && ageDays >= 31) {
    lost.push("1a consulta de puericultura - ate o 1o mes de vida (prazo encerrado)");
  }
  if (consultsTarget >= 2 && consultsDone < 2 && ageDays >= 181) {
    lost.push("2a consulta de puericultura - do 2o ao 6o mes de vida (prazo encerrado)");
  }
  return lost;
}

function formatExactAge(birthDate) {
  const birth = parseLocalDate(birthDate);
  if (!birth) return "";
  const now = new Date();
  let ay = now.getFullYear() - birth.getFullYear();
  let am = now.getMonth() - birth.getMonth();
  let ad = now.getDate() - birth.getDate();
  if (ad < 0) {
    am -= 1;
    ad += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (am < 0) {
    ay -= 1;
    am += 12;
  }
  return [ay > 0 ? `${ay}a` : null, am > 0 ? `${am}m` : null, ad > 0 ? `${ad}d` : null].filter(Boolean).join(" ") || "0d";
}

function ProgressBar({ label, done, goal }) {
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const color = pct >= 100 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="protocol-progress">
      <div className="protocol-progress__head">
        <span className="protocol-progress__label">{label}</span>
        <span className="protocol-progress__count">{done}/{goal}</span>
      </div>
      <div className="protocol-progress__track">
        <div className="protocol-progress__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function ProtocolTab({ patient, alerts, protocolSummary }) {
  const lostIndicators = getLostIndicators(patient, protocolSummary);
  const ageLabel = patient?.birthDate ? formatExactAge(patient.birthDate) : "";

  return (
    <div className="pat-protocol">
      {lostIndicators.length > 0 ? (
        <div className="patients-panel-stack" style={{ marginBottom: "var(--s-3)" }}>
          <div className="field__hint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Indicadores perdidos{ageLabel ? ` - Idade atual: ${ageLabel}` : ""}
          </div>
          {lostIndicators.map((item) => (
            <Alert key={item} tone="warning">
              {item} — nao recuperavel
            </Alert>
          ))}
        </div>
      ) : null}

      {protocolSummary ? (
        <div className="pat-protocol__bars">
          <ProgressBar label="Visitas" done={protocolSummary.completed?.visits || 0} goal={protocolSummary.targets?.visits || 0} />
          <ProgressBar label="Consultas" done={protocolSummary.completed?.consultations || 0} goal={protocolSummary.targets?.consultations || 0} />
          <ProgressBar label="Vacinas" done={protocolSummary.completed?.vaccines || 0} goal={protocolSummary.targets?.vaccines || 0} />
        </div>
      ) : null}

      {alerts?.length > 0 ? (
        <div className="pat-alerts">
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
      ) : null}

      {!protocolSummary && !alerts?.length && !lostIndicators.length ? (
        <Alert tone="info">Nenhum dado de protocolo disponivel para este paciente.</Alert>
      ) : null}
    </div>
  );
}

function HistoricoTab({ history, appointments, tasks, messages, onDeleteRecord, canWriteRecords }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const historyDates = new Set((history || []).map((h) => h.date).filter(Boolean));

  const timeline = [
    ...(history || []).map((h) => ({
      id: `h-${h.id}`,
      rawId: h.id,
      entryType: "history",
      typeLabel: typeLabel(h.type),
      title: h.title || typeLabel(h.type),
      date: h.date,
      meta: [h.professionalName, h.source].filter(Boolean).join(" - "),
      immutable: Boolean(h.immutable),
    })),
    ...(appointments || [])
      .filter((a) => !historyDates.has(a.date))
      .map((a) => ({
        id: `a-${a.id}`,
        rawId: a.id,
        entryType: "appointment",
        typeLabel: "Atendimento",
        title: a.summary || "Atendimento registrado",
        date: a.date,
        meta: demandTypeLabel(a.demandType),
        immutable: true,
      })),
    ...(tasks || []).map((t) => ({
      id: `t-${t.id}`,
      rawId: t.id,
      entryType: "task",
      typeLabel: "Tarefa",
      title: t.title || "Tarefa",
      date: t.dueDate || (t.createdAt || "").slice(0, 10),
      meta: t.status === "done" ? "Concluida" : t.status === "in_progress" ? "Em andamento" : "Pendente",
      immutable: true,
    })),
    ...(messages || []).map((m) => ({
      id: `m-${m.id}`,
      rawId: m.id,
      entryType: "message",
      typeLabel: "Mensagem interna",
      title: m.text || "Mensagem",
      date: (m.createdAt || "").slice(0, 10),
      meta: m.authorName || "Equipe",
      immutable: true,
    })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const filtered = typeFilter === "all" ? timeline : timeline.filter((item) => item.entryType === typeFilter);

  async function confirmDelete() {
    if (!pendingDelete?.rawId) return;
    if (String(deleteReason || "").trim().length < 8) {
      setDeleteError("Informe justificativa com ao menos 8 caracteres.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await onDeleteRecord?.(pendingDelete.rawId, String(deleteReason || "").trim());
      setPendingDelete(null);
      setDeleteReason("");
    } catch (e) {
      setDeleteError(e?.message || "Erro ao remover registro.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="patients-panel-stack">
      <div className="input" style={{ marginBottom: "var(--s-3)" }}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Todos os tipos</option>
          <option value="history">Registros clinicos</option>
          <option value="appointment">Atendimentos</option>
          <option value="task">Tarefas</option>
          <option value="message">Mensagens internas</option>
        </select>
      </div>

      {!filtered.length ? (
        <Alert tone="info">Sem historico registrado para este paciente.</Alert>
      ) : (
        <div className="pat-timeline">
          {filtered.map((item) => (
            <div key={item.id} className="pat-timeline-item">
              <span className="pat-timeline-item__type">{item.typeLabel}</span>
              <div className="pat-timeline-item__title">{item.title}</div>
              {(item.meta || item.date) ? (
                <div className="pat-timeline-item__meta">
                  {item.meta ? <span>{item.meta}</span> : null}
                  {item.meta && item.date ? <span> - </span> : null}
                  {item.date ? <span>{fmtDate(item.date)}</span> : null}
                </div>
              ) : null}
              {canWriteRecords && !item.immutable && onDeleteRecord ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Remover"
                  aria-label="Remover registro"
                  onClick={() => { setPendingDelete(item); setDeleteReason(""); setDeleteError(""); }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {pendingDelete ? (
        <Modal
          title="Remover registro"
          onClose={() => { setPendingDelete(null); setDeleteReason(""); setDeleteError(""); }}
          actions={
            <>
              <Button variant="secondary" type="button" onClick={() => { setPendingDelete(null); setDeleteReason(""); setDeleteError(""); }}>
                Cancelar
              </Button>
              <Button variant="danger" type="button" onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? "Removendo..." : "Remover registro"}
              </Button>
            </>
          }
        >
          <div className="field-grid">
            <Input className="field field--span-2" label="Registro" value={pendingDelete.title} readOnly />
            <Textarea className="field field--span-2 patients-textarea" label="Justificativa *" rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Motivo institucional para remocao do registro..." />
            {deleteError ? <Alert tone="danger" className="field--span-2">{deleteError}</Alert> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function FollowupTab({ recordForm, setRecordForm, onSubmitRecord, canWriteRecords }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await onSubmitRecord?.(event);
    } catch (e) {
      setErr(e?.message || "Erro ao registrar.");
    } finally {
      setBusy(false);
    }
  }

  if (!canWriteRecords) {
    return <Alert tone="warning">Sem permissao para registrar atendimentos.</Alert>;
  }

  const recordType = recordForm?.type || "visit";

  return (
    <div className="patients-panel-stack">
      <form onSubmit={handleSubmit} className="field-grid">
        <Select className="field" label="Tipo" value={recordType} onChange={(e) => setRecordForm?.((s) => ({ ...s, type: e.target.value }))}>
          <option value="visit">Visita ACS</option>
          <option value="consultation">Consulta</option>
          <option value="note">Anotacao</option>
        </Select>
        <Input className="field" label="Data *" type="date" value={recordForm?.date ?? ""} onChange={(e) => setRecordForm?.((s) => ({ ...s, date: e.target.value }))} />
        <Input className="field field--span-2" label="Titulo *" value={recordForm?.title ?? ""} onChange={(e) => setRecordForm?.((s) => ({ ...s, title: e.target.value }))} placeholder="Resumo do registro..." />
        <Textarea className="field field--span-2 patients-textarea" label="Detalhes" rows={3} value={recordForm?.details ?? ""} onChange={(e) => setRecordForm?.((s) => ({ ...s, details: e.target.value }))} placeholder="Observacoes, conduta, orientacoes..." />
        {err ? <Alert tone="danger" className="field--span-2">{err}</Alert> : null}
        <div className="field--span-2 patients-form-actions">
          <Button type="submit" disabled={busy}>{busy ? "Registrando..." : "Registrar"}</Button>
        </div>
      </form>
    </div>
  );
}

function AtendimentosTab({ appointments, appointmentForm, setAppointmentForm, onSubmitAppointment, onDeleteAppointment, canWriteRecords }) {
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmitAppointment?.(event);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete?.id) return;
    if (String(deleteReason || "").trim().length < 8) {
      setDeleteError("Informe justificativa com ao menos 8 caracteres.");
      return;
    }
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await onDeleteAppointment?.(pendingDelete.id, String(deleteReason || "").trim());
      setPendingDelete(null);
      setDeleteReason("");
    } catch (err) {
      setDeleteError(err?.message || "Erro ao remover atendimento.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="patients-panel-stack">
      {canWriteRecords ? (
        <form onSubmit={handleSubmit} className="field-grid">
          <Input className="field" label="Data *" type="date" value={appointmentForm?.date ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, date: e.target.value }))} />
          <Select className="field" label="Tipo de demanda" value={appointmentForm?.demandType ?? "scheduled"} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, demandType: e.target.value }))}>
            <option value="scheduled">Programada</option>
            <option value="spontaneous">Espontanea</option>
            <option value="referred">Encaminhada</option>
            <option value="retroactive">Retroativo</option>
          </Select>
          <Input className="field field--span-2" label="Resumo *" value={appointmentForm?.summary ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, summary: e.target.value }))} placeholder="Motivo e resumo do atendimento..." />
          <Textarea className="field field--span-2 patients-textarea" label="Conduta" rows={2} value={appointmentForm?.conduct ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, conduct: e.target.value }))} placeholder="Conduta adotada, prescricoes, orientacoes..." />
          <Textarea className="field field--span-2 patients-textarea" label="Proximos passos" rows={2} value={appointmentForm?.nextStep ?? appointmentForm?.nextSteps ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, nextStep: e.target.value, nextSteps: e.target.value }))} placeholder="Retorno, encaminhamentos, acompanhamento..." />
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy}>{busy ? "Registrando..." : "Registrar atendimento"}</Button>
          </div>
        </form>
      ) : null}

      {!appointments?.length ? (
        <Alert tone="info">Sem atendimentos registrados para este paciente.</Alert>
      ) : (
        <div className="pat-list">
          {[...(appointments || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((apt) => (
            <div key={apt.id} className="pat-list-item">
              <div className="pat-list-item__main">
                <div className="pat-list-item__title">{apt.summary || "Atendimento registrado"}</div>
                <div className="pat-list-item__meta">
                  {demandTypeLabel(apt.demandType)}{apt.date ? ` - ${fmtDate(apt.date)}` : ""}
                </div>
                {apt.conduct ? <div className="pat-list-item__detail">{apt.conduct}</div> : null}
              </div>
              {canWriteRecords ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  title="Remover"
                  aria-label="Remover atendimento"
                  onClick={() => {
                    setPendingDelete(apt);
                    setDeleteReason("");
                    setDeleteError("");
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {pendingDelete ? (
        <Modal
          title="Excluir atendimento"
          onClose={() => { setPendingDelete(null); setDeleteReason(""); setDeleteError(""); }}
          actions={
            <>
              <Button variant="secondary" type="button" onClick={() => { setPendingDelete(null); setDeleteReason(""); setDeleteError(""); }}>
                Cancelar
              </Button>
              <Button variant="danger" type="button" onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? "Excluindo..." : "Excluir atendimento"}
              </Button>
            </>
          }
        >
          <div className="field-grid">
            <Input className="field field--span-2" label="Atendimento" value={pendingDelete.summary || "Atendimento registrado"} readOnly />
            <Textarea className="field field--span-2 patients-textarea" label="Justificativa *" rows={3} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Motivo institucional para exclusao do atendimento..." />
            {deleteError ? <Alert tone="danger" className="field--span-2">{deleteError}</Alert> : null}
          </div>
        </Modal>
      ) : null}
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

  function addExam() {
    setExams((state) => [...state, { type: "Hemograma completo", name: "", urgency: "routine", notes: "" }]);
  }

  function removeExam(index) {
    setExams((state) => state.filter((_, idx) => idx !== index));
  }

  function updateExam(index, key, value) {
    setExams((state) => state.map((item, idx) => idx === index ? { ...item, [key]: value } : item));
  }

  async function submit(event) {
    event.preventDefault();
    const valid = exams.filter((exam) => exam.type && (exam.type !== "Outros" || exam.name.trim()));
    if (!valid.length) {
      setErr("Adicione ao menos um exame.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const title = valid.map((exam) => exam.type === "Outros" ? exam.name.trim() : exam.type).join(", ");
      const details = [
        `PEDIDO DE EXAME - emitido em ${new Date().toLocaleDateString("pt-BR")}`,
        `Profissional: ${user?.name || ""}${getCouncilLabel(user) ? ` (${getCouncilLabel(user)})` : ""}`,
        `Paciente: ${patient.name}`,
        "",
        ...valid.map((exam, index) => `${index + 1}. ${exam.type === "Outros" ? exam.name.trim() : exam.type}${exam.urgency === "urgent" ? " - URGENTE" : exam.urgency === "priority" ? " - PRIORITARIO" : ""}${exam.notes ? `\n   Observacao: ${exam.notes}` : ""}`),
        justification ? `\nJustificativa clinica: ${justification}` : "",
      ].filter(Boolean).join("\n");

      await createRecord(token, patient.id, {
        type: "exam_request",
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        title: `Pedido de exame: ${title}`,
        details,
        immutable: true,
        professionalName: user?.name || "",
        professionalCouncil: getCouncilLabel(user),
      });
      onClose(true);
    } catch (error) {
      setErr(error?.message || "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Pedido de exame"
      onClose={() => onClose(false)}
      className="modal--lg"
      actions={
        <>
          <Button variant="secondary" type="button" onClick={() => onClose(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={busy}>{busy ? "Registrando..." : "Emitir pedido"}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="patients-panel-stack">
        {exams.map((exam, index) => (
          <div key={`${exam.type}-${index}`} className="field-grid card card--soft">
            <Select className="field field--span-2" label="Exame" value={exam.type} onChange={(e) => updateExam(index, "type", e.target.value)}>
              {EXAM_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select className="field" label="Prioridade" value={exam.urgency} onChange={(e) => updateExam(index, "urgency", e.target.value)}>
              <option value="routine">Rotina</option>
              <option value="priority">Prioritario</option>
              <option value="urgent">Urgente</option>
            </Select>
            {exams.length > 1 ? (
              <div className="field patients-form-actions">
                <Button variant="ghost" type="button" onClick={() => removeExam(index)}>Remover</Button>
              </div>
            ) : null}
            {exam.type === "Outros" ? (
              <Input className="field field--span-2" label="Nome do exame" value={exam.name} onChange={(e) => updateExam(index, "name", e.target.value)} />
            ) : null}
            <Textarea className="field field--span-3 patients-textarea" label="Observacao" rows={2} value={exam.notes} onChange={(e) => updateExam(index, "notes", e.target.value)} placeholder="Observacao especifica (opcional)" />
          </div>
        ))}
        <div className="patients-form-actions">
          <Button variant="secondary" type="button" onClick={addExam}>Adicionar exame</Button>
        </div>
        <Textarea className="field field--span-2 patients-textarea" label="Justificativa clinica" rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Hipotese diagnostica ou motivo do pedido..." />
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

  function addMed() {
    setMeds((state) => [...state, { name: "", custom: "", dosage: "", frequency: "", duration: "", route: "", notes: "" }]);
  }

  function removeMed(index) {
    setMeds((state) => state.filter((_, idx) => idx !== index));
  }

  function updateMed(index, key, value) {
    setMeds((state) => state.map((item, idx) => idx === index ? { ...item, [key]: value } : item));
  }

  async function submit(event) {
    event.preventDefault();
    const valid = meds.filter((med) => (med.name && med.name !== "Outros (digitar)") || med.custom.trim());
    if (!valid.length) {
      setErr("Adicione ao menos um medicamento.");
      return;
    }
    if (valid.find((med) => !med.dosage.trim() || !med.frequency.trim())) {
      setErr("Preencha dose e frequencia para todos os medicamentos.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const title = valid.map((med) => med.name === "Outros (digitar)" ? med.custom.trim() : med.name).join(", ");
      const details = [
        `PRESCRICAO MEDICA - emitida em ${new Date().toLocaleDateString("pt-BR")}`,
        `Validade: ${validity} dias`,
        `Profissional: ${user?.name || ""}${getCouncilLabel(user) ? ` (${getCouncilLabel(user)})` : ""}`,
        `Paciente: ${patient.name}`,
        "",
        ...valid.map((med, index) => {
          const name = med.name === "Outros (digitar)" ? med.custom.trim() : med.name;
          return `${index + 1}. ${name} ${med.dosage}${med.route ? ` - Via: ${med.route}` : ""}\n   Frequencia: ${med.frequency}${med.duration ? ` por ${med.duration}` : ""}${med.notes ? `\n   Observacao: ${med.notes}` : ""}`;
        }),
      ].join("\n");

      await createRecord(token, patient.id, {
        type: "prescription",
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        title: `Prescricao: ${title}`,
        details,
        immutable: true,
        professionalName: user?.name || "",
        professionalCouncil: getCouncilLabel(user),
      });
      onClose(true);
    } catch (error) {
      setErr(error?.message || "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Prescricao de medicamentos"
      onClose={() => onClose(false)}
      className="modal--lg"
      actions={
        <>
          <Button variant="secondary" type="button" onClick={() => onClose(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={busy}>{busy ? "Registrando..." : "Emitir prescricao"}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="patients-panel-stack">
        {meds.map((med, index) => (
          <div key={`${med.name}-${index}`} className="field-grid card card--soft">
            <Select className="field field--span-2" label="Medicamento" value={med.name} onChange={(e) => updateMed(index, "name", e.target.value)}>
              <option value="">Selecione...</option>
              {MEDICATIONS_COMMON.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            {meds.length > 1 ? (
              <div className="field patients-form-actions">
                <Button variant="ghost" type="button" onClick={() => removeMed(index)}>Remover</Button>
              </div>
            ) : null}
            {med.name === "Outros (digitar)" ? (
              <Input className="field field--span-3" label="Nome do medicamento" value={med.custom} onChange={(e) => updateMed(index, "custom", e.target.value)} />
            ) : null}
            <Input className="field" label="Dose *" value={med.dosage} onChange={(e) => updateMed(index, "dosage", e.target.value)} placeholder="Ex: 500mg" />
            <Input className="field" label="Frequencia *" value={med.frequency} onChange={(e) => updateMed(index, "frequency", e.target.value)} placeholder="Ex: 1x ao dia" />
            <Input className="field" label="Duracao" value={med.duration} onChange={(e) => updateMed(index, "duration", e.target.value)} placeholder="Ex: 7 dias" />
            <Select className="field" label="Via" value={med.route} onChange={(e) => updateMed(index, "route", e.target.value)}>
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
            <Textarea className="field field--span-2 patients-textarea" label="Observacao" rows={2} value={med.notes} onChange={(e) => updateMed(index, "notes", e.target.value)} placeholder="Tomar em jejum, com alimentos..." />
          </div>
        ))}
        <div className="field-grid">
          <div className="field patients-form-actions">
            <Button variant="secondary" type="button" onClick={addMed}>Adicionar medicamento</Button>
          </div>
          <Select className="field" label="Validade da receita" value={validity} onChange={(e) => setValidity(e.target.value)}>
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
  const doctors = (users || []).filter((item) => ["doctor", "dentist"].includes(String(item.role || "")));
  const [targetId, setTargetId] = useState(doctors[0]?.id || "");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("routine");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!reason.trim()) {
      setErr("Informe o motivo do encaminhamento.");
      return;
    }
    const target = doctors.find((item) => item.id === targetId);
    if (!target) {
      setErr("Selecione o profissional.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const details = [
        `ENCAMINHAMENTO INTERNO - ${new Date().toLocaleDateString("pt-BR")}`,
        `De: ${user?.name || ""} (${String(user?.role || "").replace(/_/g, " ")})`,
        `Para: ${target.name} (${String(target.role || "").replace(/_/g, " ")})`,
        `Prioridade: ${priority === "urgent" ? "Urgente" : priority === "priority" ? "Prioritario" : "Rotina"}`,
        "",
        "Motivo / hipotese diagnostica:",
        reason.trim(),
      ].join("\n");

      await createRecord(token, patient.id, {
        type: "referral",
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        title: `Encaminhamento p/ ${target.name}`,
        details,
        immutable: true,
        professionalName: user?.name || "",
        professionalCouncil: getCouncilLabel(user),
      });
      onClose(true);
    } catch (error) {
      setErr(error?.message || "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Encaminhamento interno"
      onClose={() => onClose(false)}
      className="modal--lg"
      actions={
        doctors.length ? (
          <>
            <Button variant="secondary" type="button" onClick={() => onClose(false)}>Cancelar</Button>
            <Button type="button" onClick={submit} disabled={busy}>{busy ? "Registrando..." : "Encaminhar"}</Button>
          </>
        ) : null
      }
    >
      {!doctors.length ? (
        <Alert tone="warning">Nenhum medico/dentista cadastrado na equipe para encaminhar.</Alert>
      ) : (
        <form onSubmit={submit} className="field-grid">
          <Select className="field field--span-2" label="Encaminhar para" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} - {doctor.role === "dentist" ? "Dentista" : "Medico(a)"}
              </option>
            ))}
          </Select>
          <Select className="field" label="Prioridade" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="routine">Rotina</option>
            <option value="priority">Prioritario</option>
            <option value="urgent">Urgente - ver hoje</option>
          </Select>
          <Textarea className="field field--span-3 patients-textarea" label="Motivo / hipotese diagnostica *" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo do encaminhamento, sinais e sintomas relevantes..." />
          {err ? <Alert tone="danger" className="field--span-3">{err}</Alert> : null}
        </form>
      )}
    </Modal>
  );
}

function AssistencialTab({ patient, user, users, token, canManageUser, canWriteRecords }) {
  const [modal, setModal] = useState(null);
  const [done, setDone] = useState([]);

  function handleClose(type, ok) {
    setModal(null);
    if (ok) {
      setDone((state) => [{ type, ts: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }, ...state]);
    }
  }

  if (!canWriteRecords) {
    return <Alert tone="warning">Sem permissao para registrar acoes assistenciais neste paciente.</Alert>;
  }

  const canPrescribe = canManageUser || ["doctor", "dentist", "nurse_manager"].includes(String(user?.role || ""));
  const canRefer = String(user?.role || "") === "nurse_manager";
  const canExam = canManageUser || canWriteRecords;

  const actions = [
    canExam ? {
      id: "exam",
      title: "Pedir exame",
      desc: "Solicite exames laboratoriais ou de imagem com prioridade e justificativa.",
    } : null,
    canPrescribe ? {
      id: "prescription",
      title: "Prescrever medicamento",
      desc: "Emita prescricao com medicamentos, dosagem, frequencia e via.",
    } : null,
    canRefer ? {
      id: "referral",
      title: "Encaminhar ao medico",
      desc: "Encaminhe o paciente a medico ou dentista da unidade com justificativa.",
    } : null,
  ].filter(Boolean);

  return (
    <div className="patients-panel-stack">
      <div className="assistencial-launcher">
        {actions.map((action) => (
          <Button key={action.id} type="button" variant="secondary" className="assistencial-card" onClick={() => setModal(action.id)}>
            <span className="assistencial-card__body">
              <span className="assistencial-card__title">{action.title}</span>
              <span className="assistencial-card__desc">{action.desc}</span>
            </span>
          </Button>
        ))}
      </div>

      {done.length > 0 ? (
        <div className="card card--soft">
          <div className="field__hint" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: "var(--s-2)" }}>
            Registrado nesta sessao
          </div>
          <div className="patients-panel-stack">
            {done.map((item, index) => (
              <div key={`${item.type}-${index}`} className="pat-list-item">
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
      ) : null}

      {modal === "exam" ? (
        <ExamRequestModal patient={patient} user={user} token={token} onClose={(ok) => handleClose("exam", ok)} />
      ) : null}
      {modal === "prescription" ? (
        <PrescriptionModal patient={patient} user={user} token={token} onClose={(ok) => handleClose("prescription", ok)} />
      ) : null}
      {modal === "referral" ? (
        <InternalReferralModal patient={patient} user={user} users={users} token={token} onClose={(ok) => handleClose("referral", ok)} />
      ) : null}
    </div>
  );
}

function TasksTab({ tasks, users, taskForm, setTaskForm, onSubmitTask, onStatusChange, canWriteRecords }) {
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmitTask?.(event);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="patients-panel-stack">
      {canWriteRecords ? (
        <form onSubmit={handleSubmit} className="field-grid">
          <Input className="field field--span-2" label="Nova tarefa" value={taskForm?.title ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, title: e.target.value }))} placeholder="Ex.: retorno, busca ativa, atualizacao cadastral..." />
          <Input className="field" label="Prazo" type="date" value={taskForm?.dueDate ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, dueDate: e.target.value }))} />
          <Select className="field" label="Responsavel" value={taskForm?.assigneeId ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, assigneeId: e.target.value }))}>
            <option value="">Sem responsavel</option>
            {(users || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Textarea className="field field--span-2 patients-textarea" label="Observacoes" rows={2} value={taskForm?.notes ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, notes: e.target.value }))} placeholder="Contexto operacional para equipe." />
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar tarefa"}</Button>
          </div>
        </form>
      ) : null}

      {!tasks?.length ? (
        <Alert tone="info">Sem tarefas para este paciente.</Alert>
      ) : (
        <div className="pat-list">
          {tasks.map((task) => (
            <div key={task.id} className="pat-list-item">
              <div className="pat-list-item__main">
                <div className="pat-list-item__title">{task.title}</div>
                <div className="pat-list-item__meta">
                  {task.dueDate ? `Prazo: ${fmtDate(task.dueDate)}` : "Sem prazo"}
                  {task.assigneeId ? ` - ${(users || []).find((item) => item.id === task.assigneeId)?.name || ""}` : ""}
                </div>
                {task.notes ? <div className="pat-list-item__detail">{task.notes}</div> : null}
              </div>
              <Select className="patients-task-status" value={task.status || "pending"} onChange={(e) => onStatusChange?.(task.id, e.target.value)}>
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
    try {
      await onSubmitMessage?.(event);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="patients-panel-stack">
      {canReply ? (
        <form onSubmit={handleSubmit} className="field-grid">
          <Textarea className="field field--span-2 patients-textarea" label="Mensagem interna" rows={3} value={messageText ?? ""} onChange={(e) => setMessageText?.(e.target.value)} placeholder="Registrar orientacao ou recado interno da equipe." />
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
          {messages.map((message) => (
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

const DETAIL_TABS = [
  { id: "protocol", label: "Protocolo" },
  { id: "followup", label: "Atendimento" },
  { id: "appointments", label: "Atendimentos" },
  { id: "history", label: "Historico" },
  { id: "assistencial", label: "Assistencial" },
  { id: "tasks", label: "Tarefas" },
  { id: "messages", label: "Mensagens" },
];

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
  const activeTab = patientTab || "protocol";
  const g = gestationalAgeInfo(patient);
  const acsName = (users || []).find((item) => item.id === patient.assignedAcsId)?.name || "Nao atribuido";
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

      <div className="tabs small-tabs">
        {DETAIL_TABS.map((tab) => (
          <button key={tab.id} className={`tab${activeTab === tab.id ? " active" : ""}`} onClick={() => setPatientTab?.(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-block">
        {activeTab === "protocol" ? (
          <ProtocolTab patient={patient} alerts={sortedSpecialAlerts} protocolSummary={patientProtocolSummary} />
        ) : null}
        {activeTab === "appointments" ? (
          <AtendimentosTab
            appointments={appointments}
            appointmentForm={appointmentForm}
            setAppointmentForm={setAppointmentForm}
            onSubmitAppointment={onSubmitAppointment}
            onDeleteAppointment={onDeleteAppointment}
            canWriteRecords={canWriteRecords}
          />
        ) : null}
        {activeTab === "followup" ? (
          <FollowupTab
            recordForm={recordForm}
            setRecordForm={setRecordForm}
            onSubmitRecord={onSubmitRecord}
            canWriteRecords={canWriteRecords}
          />
        ) : null}
        {activeTab === "history" ? (
          <HistoricoTab
            history={history}
            appointments={appointments}
            tasks={tasks}
            messages={messages}
            onDeleteRecord={onDeleteRecord}
            canWriteRecords={canWriteRecords}
          />
        ) : null}
        {activeTab === "assistencial" ? (
          <AssistencialTab
            patient={patient}
            user={userObj}
            users={users}
            token={token}
            canManageUser={canManageUser}
            canWriteRecords={canWriteRecords}
          />
        ) : null}
        {activeTab === "tasks" ? (
          <TasksTab
            tasks={tasks}
            users={users}
            taskForm={taskForm}
            setTaskForm={setTaskForm}
            onSubmitTask={onSubmitTask}
            onStatusChange={onStatusChange}
            canWriteRecords={canWriteRecords}
          />
        ) : null}
        {activeTab === "messages" ? (
          <MessagesTab
            messages={messages}
            messageText={messageText}
            setMessageText={setMessageText}
            onSubmitMessage={onSubmitMessage}
            canReply={String(userObj?.role || "").toLowerCase() !== "acs"}
          />
        ) : null}
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
