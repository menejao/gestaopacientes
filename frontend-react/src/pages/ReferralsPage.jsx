import { useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import Button from "../components/ui/Button";
import { Tabs, Tab } from "../components/ui/Tabs";
import Modal from "../components/ui/Modal";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Textarea from "../components/ui/Textarea";
import EmptyState from "../components/ui/EmptyState";
import { readLS, writeLS } from "../utils/storage";
import { REFERRALS_KEY } from "../config/constants";

const SPECIALTIES = ["Cardiologia","Ortopedia","Neurologia","Psiquiatria","Ginecologia","Urologia","Dermatologia","Oftalmologia","Otorrinolaringologia","Endocrinologia","Nefrologia","Pneumologia","Reumatologia","Gastroenterologia","Oncologia","Fisioterapia","Nutrição","Psicologia","Serviço Social","Pronto-Socorro","Hospital"];

const STATUS_LABEL = { pending: "Aguardando", scheduled: "Agendado", done: "Realizado", cancelled: "Cancelado" };
const PRIORITY_LABEL = { urgent: "Urgente", priority: "Prioritário", routine: "Rotina" };

function fmtDateLocal(d) {
  if (!d) return "-";
  try { return new Date(d + "T12:00:00").toLocaleDateString("pt-BR"); } catch { return d; }
}

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconPrint = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M4 5V3h8v2M4 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconEdit = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M11 2l3 3-8 8H3v-3L11 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);
const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

function ReferralsPage({ patients, users, user }) {
  const [referrals, setReferrals]   = useState(() => readLS(REFERRALS_KEY, []));
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState({ patientId: "", specialty: "Cardiologia", reason: "", priority: "routine", date: "", notes: "", status: "pending" });
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");
  const [showDoc, setShowDoc]       = useState(null);

  function saveReferrals(r) { setReferrals(r); writeLS(REFERRALS_KEY, r); }

  function openNew() {
    setForm({ patientId: "", specialty: "Cardiologia", reason: "", priority: "routine", date: new Date().toISOString().slice(0, 10), notes: "", status: "pending" });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(ref) {
    setForm({ patientId: ref.patientId, specialty: ref.specialty, reason: ref.reason, priority: ref.priority, date: ref.date, notes: ref.notes || "", status: ref.status });
    setEditId(ref.id);
    setShowForm(true);
  }

  function submit(e) {
    e.preventDefault();
    if (!form.patientId || !form.reason) return;
    const pat = patients.find(p => p.id === form.patientId);
    const doc = users.find(u => u.id === user?.id);
    const entry = { ...form, id: editId || ("ref" + Date.now()), patientName: pat?.name || "?", doctorName: doc?.name || user?.name || "?", createdAt: new Date().toISOString() };
    const base = editId ? referrals.filter(r => r.id !== editId) : referrals;
    saveReferrals([entry, ...base]);
    setShowForm(false);
  }

  function updateStatus(id, status) {
    saveReferrals(referrals.map(r => r.id === id ? { ...r, status, updatedAt: new Date().toISOString() } : r));
  }

  function remove(id) { saveReferrals(referrals.filter(r => r.id !== id)); }

  const filtered = referrals.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search.trim() && !r.patientName.toLowerCase().includes(search.toLowerCase()) && !r.specialty.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: referrals.length,
    pending: referrals.filter(r => r.status === "pending").length,
    scheduled: referrals.filter(r => r.status === "scheduled").length,
    done: referrals.filter(r => r.status === "done").length,
  };

  return (
    <div className="referrals-page">
      <PageHeader
        eyebrow="Referência e Contrarreferência"
        title="Encaminhamentos"
        subtitle="Controle de encaminhamentos para especialistas e serviços."
        actions={
          <Button onClick={openNew}>
            <IconPlus /> Novo encaminhamento
          </Button>
        }
      />

      <Tabs>
        {[["all", "Todos"], ["pending", "Aguardando"], ["scheduled", "Agendado"], ["done", "Realizado"]].map(([k, l]) => (
          <Tab key={k} active={filterStatus === k} onClick={() => setFilterStatus(k)}>
            {l} <span className="tab__count">{counts[k]}</span>
          </Tab>
        ))}
      </Tabs>

      <div className="referrals-toolbar">
        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por paciente ou especialidade..."
        />
      </div>

      <div className="referrals-list">
        {!filtered.length ? (
          <EmptyState title="Nenhum encaminhamento encontrado" />
        ) : (
          <div className="card card--noPad overflow-hidden">
            <table className="patients-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Especialidade</th>
                  <th>Prioridade</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="referrals-table__patient-name">{r.patientName}</div>
                      <div className="referrals-table__patient-meta">{r.doctorName}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.specialty}</td>
                    <td>
                      <span className={`referrals-priority referrals-priority--${r.priority}`}>
                        {PRIORITY_LABEL[r.priority] || r.priority}
                      </span>
                    </td>
                    <td className="muted small">{fmtDateLocal(r.date)}</td>
                    <td>
                      <select
                        className={`referrals-status-sel referrals-status-sel--${r.status}`}
                        value={r.status}
                        onChange={e => updateStatus(r.id, e.target.value)}
                      >
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="referrals-action-row">
                        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => setShowDoc(r)} title="Ver documento">
                          <IconPrint />
                        </button>
                        <button className="btn btn--ghost btn--sm btn--icon" onClick={() => openEdit(r)} title="Editar">
                          <IconEdit />
                        </button>
                        <button className="btn btn--ghost btn--sm btn--icon agenda-appt__remove-btn" onClick={() => remove(r.id)} title="Excluir">
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Modal
          title={editId ? "Editar encaminhamento" : "Novo encaminhamento"}
          onClose={() => setShowForm(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" form="referral-form">Salvar</Button>
            </>
          }
        >
          <form id="referral-form" onSubmit={submit} className="field-grid field-grid--no-pad">
            <Select
              className="field--span-2"
              label="Paciente *"
              value={form.patientId}
              onChange={e => setForm(s => ({ ...s, patientId: e.target.value }))}
            >
              <option value="">Selecionar...</option>
              {[...patients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Select label="Especialidade" value={form.specialty} onChange={e => setForm(s => ({ ...s, specialty: e.target.value }))}>
              {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
            </Select>
            <Select label="Prioridade" value={form.priority} onChange={e => setForm(s => ({ ...s, priority: e.target.value }))}>
              <option value="routine">Rotina</option>
              <option value="priority">Prioritário</option>
              <option value="urgent">Urgente</option>
            </Select>
            <Input label="Data" type="date" value={form.date} onChange={e => setForm(s => ({ ...s, date: e.target.value }))} />
            <Select label="Status" value={form.status} onChange={e => setForm(s => ({ ...s, status: e.target.value }))}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Textarea
              className="field--span-2"
              label="Motivo / hipótese diagnóstica *"
              value={form.reason}
              onChange={e => setForm(s => ({ ...s, reason: e.target.value }))}
              rows={3}
              placeholder="Descreva o motivo do encaminhamento..."
            />
            <Input
              className="field--span-2"
              label="Observações adicionais"
              value={form.notes}
              onChange={e => setForm(s => ({ ...s, notes: e.target.value }))}
              placeholder="Informações relevantes para o especialista..."
            />
          </form>
        </Modal>
      )}

      {showDoc && (
        <Modal
          title="Guia de Encaminhamento"
          onClose={() => setShowDoc(null)}
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()}>
                <IconPrint /> Imprimir
              </Button>
              <Button onClick={() => setShowDoc(null)}>Fechar</Button>
            </>
          }
        >
          <div className="referrals-doc">
            <div className="referrals-doc__title-block">
              <div className="referrals-doc__title">GUIA DE ENCAMINHAMENTO</div>
              <div className="referrals-doc__subtitle">Unidade Básica de Saúde</div>
            </div>
            <div className="referrals-doc__grid">
              <div><strong>Paciente:</strong> {showDoc.patientName}</div>
              <div><strong>Data:</strong> {fmtDateLocal(showDoc.date)}</div>
              <div><strong>Especialidade:</strong> {showDoc.specialty}</div>
              <div><strong>Prioridade:</strong> {PRIORITY_LABEL[showDoc.priority] || showDoc.priority}</div>
            </div>
            <div className="referrals-doc__field">
              <strong>Motivo:</strong><br />
              <span style={{ whiteSpace: "pre-wrap" }}>{showDoc.reason}</span>
            </div>
            {showDoc.notes && (
              <div className="referrals-doc__field">
                <strong>Observações:</strong><br />
                {showDoc.notes}
              </div>
            )}
            <div className="referrals-doc__footer">
              <span>Profissional: {showDoc.doctorName}</span>
              <span>Emitido em: {showDoc.createdAt ? new Date(showDoc.createdAt).toLocaleDateString("pt-BR") : "-"}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ReferralsPage;
