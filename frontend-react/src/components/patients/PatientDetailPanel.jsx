import { useState } from "react";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import DocumentModal from "../DocumentModal";
import { PatientCardModal } from "./PatientCardModal";
import { calcAge, catLabel, gestationalAgeInfo, isProfileIncomplete } from "../../utils/clinical";
import { initials } from "../../utils/formatting";

// Helpers

function fmtDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

function demandTypeLabel(value) {
  return {
    scheduled: "Programada",
    spontaneous: "Espontânea",
    referred: "Encaminhada",
    retroactive: "Retroativo",
  }[String(value || "").toLowerCase()] || "Não informado";
}

function typeLabel(type) {
  const map = {
    consultation: "Consulta",
    visit: "Visita ACS",
    vaccine: "Vacina",
    procedure: "Procedimento",
    note: "Anotação",
    appointment: "Atendimento",
  };
  return map[String(type || "").toLowerCase()] || String(type || "") || "Registro";
}

// Sub-components

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

function ProtocolTab({ alerts, protocolSummary }) {
  return (
    <div className="pat-protocol">
      {protocolSummary && (
        <div className="pat-protocol__bars">
          <ProgressBar label="Visitas" done={protocolSummary.completed?.visits || 0} goal={protocolSummary.targets?.visits || 0} />
          <ProgressBar label="Consultas" done={protocolSummary.completed?.consultations || 0} goal={protocolSummary.targets?.consultations || 0} />
          <ProgressBar label="Vacinas" done={protocolSummary.completed?.vaccines || 0} goal={protocolSummary.targets?.vaccines || 0} />
        </div>
      )}
      {alerts?.length > 0 && (
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
      )}
      {!protocolSummary && !alerts?.length && (
        <Alert tone="info">Nenhum dado de protocolo disponível para este paciente.</Alert>
      )}
    </div>
  );
}

function HistoricoTab({ history, appointments }) {
  const timeline = [
    ...(history || []).map((h) => ({
      id: `h-${h.id}`,
      type: typeLabel(h.type),
      title: h.title || typeLabel(h.type),
      date: h.date,
      meta: h.source || "",
    })),
    ...(appointments || []).map((a) => ({
      id: `a-${a.id}`,
      type: "Atendimento",
      title: a.summary || "Atendimento registrado",
      date: a.date,
      meta: demandTypeLabel(a.demandType),
    })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (!timeline.length) {
    return <Alert tone="info">Sem histórico registrado para este paciente.</Alert>;
  }

  return (
    <div className="pat-timeline">
      {timeline.map((item) => (
        <div key={item.id} className="pat-timeline-item">
          <span className="pat-timeline-item__type">{item.type}</span>
          <div className="pat-timeline-item__title">{item.title}</div>
          {(item.meta || item.date) && (
            <div className="pat-timeline-item__meta">
              {item.meta && <span>{item.meta}</span>}
              {item.meta && item.date && <span> · </span>}
              {item.date && <span>{fmtDate(item.date)}</span>}
            </div>
          )}
        </div>
      ))}
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
    try { await onSubmitAppointment?.(event); } finally { setBusy(false); }
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
      {canWriteRecords && (
        <form onSubmit={handleSubmit} className="field-grid">
          <label className="field">
            <span className="field__label">Data *</span>
            <input className="input" type="date" value={appointmentForm?.date ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, date: e.target.value }))} />
          </label>
          <label className="field">
            <span className="field__label">Tipo de demanda</span>
            <select className="input" value={appointmentForm?.demandType ?? "scheduled"} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, demandType: e.target.value }))}>
              <option value="scheduled">Programada</option>
              <option value="spontaneous">Espontânea</option>
              <option value="referred">Encaminhada</option>
              <option value="retroactive">Retroativo</option>
            </select>
          </label>
          <label className="field field--span-2">
            <span className="field__label">Resumo *</span>
            <input className="input" value={appointmentForm?.summary ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, summary: e.target.value }))} placeholder="Motivo e resumo do atendimento..." />
          </label>
          <label className="field field--span-2">
            <span className="field__label">Conduta</span>
            <textarea className="input patients-textarea" rows={2} value={appointmentForm?.conduct ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, conduct: e.target.value }))} placeholder="Conduta adotada, prescrições, orientações..." />
          </label>
          <label className="field field--span-2">
            <span className="field__label">Próximos passos</span>
            <textarea className="input patients-textarea" rows={2} value={appointmentForm?.nextSteps ?? ""} onChange={(e) => setAppointmentForm?.((s) => ({ ...s, nextSteps: e.target.value }))} placeholder="Retorno, encaminhamentos, acompanhamento..." />
          </label>
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy}>{busy ? "Registrando..." : "Registrar atendimento"}</Button>
          </div>
        </form>
      )}
      {!appointments?.length ? (
        <Alert tone="info">Sem atendimentos registrados para este paciente.</Alert>
      ) : (
        <div className="pat-list">
          {[...(appointments || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((apt) => (
            <div key={apt.id} className="pat-list-item">
              <div className="pat-list-item__main">
                <div className="pat-list-item__title">{apt.summary || "Atendimento registrado"}</div>
                <div className="pat-list-item__meta">
                  {demandTypeLabel(apt.demandType)}{apt.date ? ` · ${fmtDate(apt.date)}` : ""}
                </div>
                {apt.conduct ? <div className="pat-list-item__detail">{apt.conduct}</div> : null}
              </div>
              {canWriteRecords && (
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
              )}
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
            <div className="field field--span-2">
              <span className="field__label">Atendimento</span>
              <div className="input input--readonly">
                <input value={pendingDelete.summary || "Atendimento registrado"} readOnly />
              </div>
            </div>
            <label className="field field--span-2">
              <span className="field__label">Justificativa *</span>
              <textarea
                className="input patients-textarea"
                rows={3}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Motivo institucional para exclusão do atendimento..."
              />
            </label>
            {deleteError ? <Alert tone="danger" className="field--span-2">{deleteError}</Alert> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function ExamRequestModal({ onClose, users }) {
  const [form, setForm] = useState({ examType: "", priority: "normal", observation: "", requesterId: "" });

  function set(field) { return (e) => setForm((s) => ({ ...s, [field]: e.target.value })); }

  const clinicians = (users || []).filter((u) => ["doctor", "nurse", "dentist"].includes(String(u.role || "").toLowerCase()));

  return (
    <Modal title="Solicitar Exame" onClose={onClose} className="modal--lg">
      <form onSubmit={(e) => { e.preventDefault(); onClose(); }} className="patient-modal-form">
        <label className="field">
          <span className="field__label">Tipo de exame *</span>
          <input className="input" required value={form.examType} onChange={set("examType")} placeholder="Ex.: Hemograma, Glicemia em jejum, ECG..." />
        </label>
        <label className="field">
          <span className="field__label">Prioridade</span>
          <select className="input" value={form.priority} onChange={set("priority")}>
            <option value="elective">Eletivo</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Profissional solicitante</span>
          <select className="input" value={form.requesterId} onChange={set("requesterId")}>
            <option value="">Selecionar profissional</option>
            {clinicians.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Observação</span>
          <textarea className="input" rows={3} value={form.observation} onChange={set("observation")} placeholder="Contexto clínico, justificativa..." />
        </label>
        <footer>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!form.examType.trim()}>Solicitar exame</Button>
        </footer>
      </form>
    </Modal>
  );
}

function ReferralModal({ onClose }) {
  const [form, setForm] = useState({ destination: "", priority: "normal", reason: "", observation: "" });

  function set(field) { return (e) => setForm((s) => ({ ...s, [field]: e.target.value })); }

  return (
    <Modal title="Encaminhar Paciente" onClose={onClose} className="modal--lg">
      <form onSubmit={(e) => { e.preventDefault(); onClose(); }} className="patient-modal-form">
        <label className="field">
          <span className="field__label">Destino *</span>
          <input className="input" required value={form.destination} onChange={set("destination")} placeholder="Ex.: Cardiologia, CAPS, UPA, Hospital de referência..." />
        </label>
        <label className="field">
          <span className="field__label">Prioridade</span>
          <select className="input" value={form.priority} onChange={set("priority")}>
            <option value="elective">Eletivo</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Motivo *</span>
          <input className="input" required value={form.reason} onChange={set("reason")} placeholder="Motivo do encaminhamento..." />
        </label>
        <label className="field">
          <span className="field__label">Observação</span>
          <textarea className="input" rows={3} value={form.observation} onChange={set("observation")} placeholder="Informações adicionais para o serviço de destino..." />
        </label>
        <footer>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!form.destination.trim() || !form.reason.trim()}>Encaminhar</Button>
        </footer>
      </form>
    </Modal>
  );
}

function PrescriptionModal({ onClose }) {
  const [form, setForm] = useState({ medication: "", posology: "", frequency: "", duration: "", observation: "" });

  function set(field) { return (e) => setForm((s) => ({ ...s, [field]: e.target.value })); }

  return (
    <Modal title="Prescrever Medicamento" onClose={onClose} className="modal--lg">
      <form onSubmit={(e) => { e.preventDefault(); onClose(); }} className="patient-modal-form">
        <label className="field">
          <span className="field__label">Medicamento *</span>
          <input className="input" required value={form.medication} onChange={set("medication")} placeholder="Nome e concentração..." />
        </label>
        <label className="field">
          <span className="field__label">Posologia</span>
          <input className="input" value={form.posology} onChange={set("posology")} placeholder="Ex.: 1 comprimido" />
        </label>
        <label className="field">
          <span className="field__label">Frequência</span>
          <input className="input" value={form.frequency} onChange={set("frequency")} placeholder="Ex.: 2x ao dia, a cada 8h..." />
        </label>
        <label className="field">
          <span className="field__label">Duração</span>
          <input className="input" value={form.duration} onChange={set("duration")} placeholder="Ex.: 7 dias, uso contínuo..." />
        </label>
        <label className="field">
          <span className="field__label">Observação</span>
          <textarea className="input" rows={3} value={form.observation} onChange={set("observation")} placeholder="Orientações adicionais ao paciente..." />
        </label>
        <footer>
          <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!form.medication.trim()}>Prescrever</Button>
        </footer>
      </form>
    </Modal>
  );
}

function AssistencialTab({ users, canWriteRecords }) {
  const [openModal, setOpenModal] = useState(null);

  if (!canWriteRecords) {
    return <Alert tone="warning">Sem permissão para registrar ações assistenciais neste paciente.</Alert>;
  }

  return (
    <>
      <div className="assistencial-launcher">
        <button type="button" className="assistencial-card" onClick={() => setOpenModal("exam")}>
          <div className="assistencial-card__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <line x1="12" y1="18" x2="12" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="assistencial-card__body">
            <div className="assistencial-card__title">Solicitar Exame</div>
            <div className="assistencial-card__desc">Solicitar exame laboratorial, de imagem ou especialidade.</div>
          </div>
        </button>

        <button type="button" className="assistencial-card" onClick={() => setOpenModal("referral")}>
          <div className="assistencial-card__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="assistencial-card__body">
            <div className="assistencial-card__title">Encaminhar Paciente</div>
            <div className="assistencial-card__desc">Encaminhar para especialidade, serviço de referência ou urgência.</div>
          </div>
        </button>

        <button type="button" className="assistencial-card" onClick={() => setOpenModal("prescription")}>
          <div className="assistencial-card__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="assistencial-card__body">
            <div className="assistencial-card__title">Prescrever Medicamento</div>
            <div className="assistencial-card__desc">Registrar prescrição com posologia, frequência e duração.</div>
          </div>
        </button>
      </div>

      {openModal === "exam"         && <ExamRequestModal onClose={() => setOpenModal(null)} users={users} />}
      {openModal === "referral"     && <ReferralModal    onClose={() => setOpenModal(null)} />}
      {openModal === "prescription" && <PrescriptionModal onClose={() => setOpenModal(null)} />}
    </>
  );
}

function TasksTab({ tasks, users, taskForm, setTaskForm, onSubmitTask, onStatusChange, canWriteRecords }) {
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    setBusy(true);
    try { await onSubmitTask?.(event); } finally { setBusy(false); }
  }

  return (
    <div className="patients-panel-stack">
      {canWriteRecords && (
        <form onSubmit={handleSubmit} className="field-grid">
          <label className="field field--span-2">
            <span className="field__label">Nova tarefa</span>
            <input className="input" value={taskForm?.title ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, title: e.target.value }))} placeholder="Ex.: retorno, busca ativa, atualização cadastral..." />
          </label>
          <label className="field">
            <span className="field__label">Prazo</span>
            <input className="input" type="date" value={taskForm?.dueDate ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, dueDate: e.target.value }))} />
          </label>
          <label className="field">
            <span className="field__label">Responsável</span>
            <select className="input" value={taskForm?.assigneeId ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, assigneeId: e.target.value }))}>
              <option value="">Sem responsável</option>
              {(users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label className="field field--span-2">
            <span className="field__label">Observações</span>
            <textarea className="input patients-textarea" rows={2} value={taskForm?.notes ?? ""} onChange={(e) => setTaskForm?.((s) => ({ ...s, notes: e.target.value }))} placeholder="Contexto operacional para a equipe." />
          </label>
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar tarefa"}</Button>
          </div>
        </form>
      )}
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
                  {task.assigneeId ? ` · ${(users || []).find((u) => u.id === task.assigneeId)?.name || ""}` : ""}
                </div>
                {task.notes ? <div className="pat-list-item__detail">{task.notes}</div> : null}
              </div>
              <select
                className="input patients-task-status"
                value={task.status || "pending"}
                onChange={(e) => onStatusChange?.(task.id, e.target.value)}
              >
                <option value="pending">Pendente</option>
                <option value="in_progress">Em andamento</option>
                <option value="done">Concluída</option>
              </select>
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
    setBusy(true);
    try { await onSubmitMessage?.(event); } finally { setBusy(false); }
  }

  return (
    <div className="patients-panel-stack">
      {canReply ? (
        <form onSubmit={handleSubmit} className="field-grid">
          <label className="field field--span-2">
            <span className="field__label">Mensagem interna</span>
            <textarea className="input patients-textarea" rows={3} value={messageText ?? ""} onChange={(e) => setMessageText?.(e.target.value)} placeholder="Registrar orientação ou recado interno da equipe." />
          </label>
          <div className="field--span-2 patients-form-actions">
            <Button type="submit" disabled={busy || !String(messageText || "").trim()}>
              {busy ? "Enviando..." : "Registrar mensagem"}
            </Button>
          </div>
        </form>
      ) : (
        <Alert tone="warning">Sem permissão para enviar mensagens neste paciente.</Alert>
      )}
      {!messages?.length ? (
        <Alert tone="info">Sem mensagens internas associadas a este paciente.</Alert>
      ) : (
        <div className="pat-list">
          {messages.map((m) => (
            <div key={m.id} className="pat-list-item">
              <div className="pat-list-item__main">
                <div className="pat-list-item__title">{m.authorName || "Equipe clínica"}</div>
                <div className="pat-list-item__meta">{new Date(m.createdAt).toLocaleString("pt-BR")}</div>
                <div className="pat-list-item__detail">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DETAIL_TABS = [
  { id: "protocol",     label: "Protocolo"    },
  { id: "appointments", label: "Atendimentos" },
  { id: "history",      label: "Histórico"    },
  { id: "assistencial", label: "Assistencial" },
  { id: "tasks",        label: "Tarefas"      },
  { id: "messages",     label: "Mensagens"    },
];

export default function PatientDetailPanel({
  patient, users, templates, patientTab, setPatientTab,
  appointments, tasks, messages, history, sortedSpecialAlerts,
  patientProtocolSummary,
  recordForm, setRecordForm, recordVaccines, setRecordVaccines, onSubmitRecord,
  appointmentForm, setAppointmentForm, onSubmitAppointment,
  taskForm, setTaskForm, onSubmitTask,
  messageText, setMessageText, onSubmitMessage,
  onDeleteAppointment, onStatusChange,
  canManageUser, canWriteRecords,
  userObj, onClose,
}) {
  const [docType, setDocType] = useState(null);
  const [showPatientCard, setShowPatientCard] = useState(false);
  const activeTab = patientTab || "protocol";
  const g = gestationalAgeInfo(patient);
  const acsName = (users || []).find((u) => u.id === patient.assignedAcsId)?.name || "Não atribuído";
  const age = calcAge(patient.birthDate);

  return (
    <>
      <div className="panel-patient-header">
        <div className="panel-patient-avatar">{initials(patient.name)}</div>
        <div className="panel-patient-info">
          <div className="panel-patient-name">
            {patient.name}
            {age && <span className="panel-patient-age">{age}</span>}
            {isProfileIncomplete(patient) && (
              <span className="panel-patient-incomplete">Cadastro incompleto</span>
            )}
            <div className="panel-patient-doc-actions">
              <Button size="sm" onClick={() => setShowPatientCard(true)}>Cartão SUS</Button>
              <Button variant="secondary" size="sm" onClick={() => setDocType("comparecimento")}>Declaração</Button>
              {canManageUser && (
                <Button variant="secondary" size="sm" onClick={() => setDocType("atestado")}>Atestado</Button>
              )}
            </div>
          </div>
          <div className="panel-patient-meta">
            <span>{catLabel(templates, patient.careCategory)}</span>
            <span>·</span>
            <span>ACS: {acsName}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          title="Fechar painel"
          aria-label="Fechar painel"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </Button>
      </div>

      {isProfileIncomplete(patient) && (
        <div className="panel-banner panel-banner--warn">
          Este paciente foi cadastrado rapidamente. <strong>Complete o perfil</strong> para liberar atendimentos.
        </div>
      )}

      {g && String(patient.careCategory || "").toLowerCase() === "pregnant" && (
        <div className="panel-banner panel-banner--info">
          IG estimada: <strong>{g.weeks}s {g.days}d</strong> (ref: {g.source})
        </div>
      )}

      <div className="tabs small-tabs">
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${activeTab === t.id ? " active" : ""}`}
            onClick={() => setPatientTab?.(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-block">
        {activeTab === "protocol" && (
          <ProtocolTab alerts={sortedSpecialAlerts} protocolSummary={patientProtocolSummary} />
        )}
        {activeTab === "appointments" && (
          <AtendimentosTab
            appointments={appointments}
            appointmentForm={appointmentForm} setAppointmentForm={setAppointmentForm}
            onSubmitAppointment={onSubmitAppointment} onDeleteAppointment={onDeleteAppointment}
            canWriteRecords={canWriteRecords}
          />
        )}
        {activeTab === "history" && (
          <HistoricoTab history={history} appointments={appointments} />
        )}
        {activeTab === "assistencial" && (
          <AssistencialTab users={users} canWriteRecords={canWriteRecords} />
        )}
        {activeTab === "tasks" && (
          <TasksTab
            tasks={tasks} users={users}
            taskForm={taskForm} setTaskForm={setTaskForm}
            onSubmitTask={onSubmitTask} onStatusChange={onStatusChange}
            canWriteRecords={canWriteRecords}
          />
        )}
        {activeTab === "messages" && (
          <MessagesTab
            messages={messages} messageText={messageText} setMessageText={setMessageText}
            onSubmitMessage={onSubmitMessage}
            canReply={String(userObj?.role || "").toLowerCase() !== "acs"}
          />
        )}
      </div>

      {docType && (
        <DocumentModal patient={patient} user={userObj} type={docType} onClose={() => setDocType(null)} />
      )}
      {showPatientCard && (
        <PatientCardModal
          patient={patient} users={users || []} templates={templates || []}
          history={history} onClose={() => setShowPatientCard(false)}
        />
      )}
    </>
  );
}
