import { useState, useMemo } from "react";
import { createPatient } from "../api";
import { AGENDA_KEY } from "../config/constants";
import { readLS, writeLS } from "../utils/storage";
import { matchesPatientSearch, emptyPatientForm, isProfileIncomplete, ageInMonths } from "../utils/clinical";
import { isUnavailableDay, unavailableReason } from "../utils/dates";
import { formatCpf, formatPhone, initials } from "../utils/formatting";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import PageHeader from "../components/layout/PageHeader";

const AGENDA_HOURS = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

const STATUS_LABEL = {
  scheduled: "Agendado",
  arrived:   "Chegou",
  attending: "Em atend.",
  done:      "Concluído",
  absent:    "Faltou",
};

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M13 4l-1 9a1 1 0 01-1 1H5a1 1 0 01-1-1L3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconCheck = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
    <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconWarning = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

function AgendaPage({ patients, users, user, token, onNewPatient, onPatientCreated, onNavigatePatient, teams = [] }) {
  const [agenda, setAgenda]             = useState(() => readLS(AGENDA_KEY, []));
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState({ patientId: "", doctorId: "", date: "", time: "", type: "consultation", notes: "", status: "scheduled" });
  const [editId, setEditId]             = useState(null);
  const [filterDoc, setFilterDoc]       = useState("");
  const [patSearch, setPatSearch]       = useState("");
  const [patSelected, setPatSelected]   = useState(null);
  const [showNewPat, setShowNewPat]     = useState(false);
  const [newPatForm, setNewPatForm]     = useState({ name: "", cpf: "", phone: "", careCategory: "general", birthDate: "", teamId: String(user?.teamId || "") });
  const [newPatErr, setNewPatErr]       = useState("");

  const patResults = useMemo(() => {
    const q = patSearch.trim();
    if (q.length < 2) return [];
    return patients.filter(p => matchesPatientSearch(p, q)).slice(0, 8);
  }, [patSearch, patients]);

  const doctors = users.filter(u => ["doctor", "nurse_manager", "nursing_tech"].includes(u.role));

  function saveAgenda(newA) { setAgenda(newA); writeLS(AGENDA_KEY, newA); }

  function openNew(time = "", date = selectedDate) {
    setForm({ patientId: "", doctorId: "", date, time, type: "consultation", notes: "", status: "scheduled" });
    setPatSearch(""); setPatSelected(null);
    setEditId(null); setShowForm(true);
  }

  function openEdit(appt) {
    const pat = patients.find(p => p.id === appt.patientId) || null;
    setForm({ patientId: appt.patientId, doctorId: appt.doctorId, date: appt.date, time: appt.time, type: appt.type, notes: appt.notes || "", status: appt.status });
    setPatSearch(pat?.name || ""); setPatSelected(pat);
    setEditId(appt.id); setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.patientId || !form.date || !form.time) return;

    let resolvedPatientId = form.patientId;

    if (patSelected && String(form.patientId).startsWith("local_") && !patients.find(p => p.id === form.patientId)) {
      const payload = {
        name: patSelected.name,
        cpf: patSelected.cpf || "",
        phone: patSelected.phone || "",
        birthDate: patSelected.birthDate || "",
        careCategory: patSelected.careCategory || "general",
        teamId: String(patSelected.teamId || user?.teamId || "").trim(),
        incompleteProfile: true,
        motherName: "", cns: "", phoneAlt: "", zipCode: "", address: "", number: "",
        complement: "", neighborhood: "", city: "", state: "", sex: "", maritalStatus: "",
        assignedAcsId: "", allergies: "", comorbidities: "", medications: "",
        pregnancyStartDate: "", expectedDeliveryDate: "",
      };

      if (token && !String(token).startsWith("local_")) {
        try {
          const created = await createPatient(token, payload);
          resolvedPatientId = created?.id || form.patientId;
          if (onNewPatient) onNewPatient({ ...payload, id: resolvedPatientId });
          if (onPatientCreated) onPatientCreated();
        } catch {
          const quickPat = { ...payload, id: form.patientId };
          if (onNewPatient) onNewPatient(quickPat);
          resolvedPatientId = form.patientId;
        }
      } else {
        const quickPat = { ...payload, id: form.patientId };
        if (onNewPatient) onNewPatient(quickPat);
      }
    }

    const pat = patients.find(p => p.id === resolvedPatientId) || patSelected;
    const doc = users.find(u => u.id === form.doctorId);
    const wasQuickCreated = String(form.patientId).startsWith("local_");
    const isIncomplete = pat?.incompleteProfile === true || wasQuickCreated;
    const entry = {
      ...form,
      patientId: resolvedPatientId,
      id: editId || ("ag" + Date.now()),
      patientName: pat?.name || "?",
      doctorName: doc?.name || "",
      incompletePatient: isIncomplete,
      createdAt: new Date().toISOString(),
    };
    const base = editId ? agenda.filter(a => a.id !== editId) : agenda;
    saveAgenda([...base, entry].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
    setShowForm(false);
  }

  function remove(id) { saveAgenda(agenda.filter(a => a.id !== id)); }
  function updateStatus(id, status) { saveAgenda(agenda.map(a => a.id === id ? { ...a, status } : a)); }

  const dayAppts = agenda
    .filter(a => a.date === selectedDate && (!filterDoc || a.doctorId === filterDoc))
    .sort((a, b) => a.time.localeCompare(b.time));

  const todayStr = new Date().toISOString().slice(0, 10);
  const selD = new Date(selectedDate + "T12:00:00");
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selD);
    d.setDate(d.getDate() - d.getDay() + i);
    return d.toISOString().slice(0, 10);
  });
  const countByDay = {};
  weekDays.forEach(d => { countByDay[d] = agenda.filter(a => a.date === d).length; });

  return (
    <div className="agenda-page">
      <PageHeader
        eyebrow="Gestão de Horários"
        title="Agenda"
        subtitle="Agendamentos, confirmações e controle de presença."
        actions={
          <Button onClick={() => openNew()}>
            <IconPlus />
            Novo agendamento
          </Button>
        }
      />

      {/* Tira semanal */}
      <div className="agenda-week-strip">
        {weekDays.map(d => {
          const dt = new Date(d + "T12:00:00");
          const isToday    = d === todayStr;
          const isSel      = d === selectedDate;
          const unavailable = isUnavailableDay(d);
          return (
            <button
              key={d}
              type="button"
              className={[
                "agenda-day-btn",
                isSel                    ? "is-sel"     : "",
                isToday && !isSel        ? "is-today"   : "",
                unavailable && !isSel   ? "is-unavail" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setSelectedDate(d)}
            >
              <span className="agenda-day-btn__weekday">
                {dt.toLocaleDateString("pt-BR", { weekday: "short" })}
              </span>
              <span className="agenda-day-btn__num">{dt.getDate()}</span>
              {unavailable && !isSel ? (
                <span className="agenda-day-btn__tag">fechado</span>
              ) : !unavailable && countByDay[d] > 0 ? (
                <span className="agenda-day-btn__tag">{countByDay[d]}×</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="agenda-filters">
        <Select value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="">Todos os profissionais</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <span className="agenda-filters__count">
          {dayAppts.length} agendamento{dayAppts.length !== 1 ? "s" : ""} em{" "}
          {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
      </div>

      {/* Timeline */}
      <div className="agenda-timeline">
        {isUnavailableDay(selectedDate) && (
          <div className="agenda-unavail-banner">
            <span className="agenda-unavail-banner__icon"><IconLock /></span>
            <div>
              <div className="agenda-unavail-banner__title">{unavailableReason(selectedDate)}</div>
              <div className="agenda-unavail-banner__desc">
                Agendamentos não são realizados nesta data. Caso haja um agendamento existente, foi criado manualmente.
              </div>
            </div>
          </div>
        )}

        {!dayAppts.length ? (
          <EmptyState
            title={isUnavailableDay(selectedDate) ? "Unidade fechada neste dia" : "Nenhum agendamento neste dia"}
            description={
              isUnavailableDay(selectedDate)
                ? "Esta data está bloqueada para agendamentos."
                : "Clique em Novo agendamento para adicionar uma consulta neste dia."
            }
            action={!isUnavailableDay(selectedDate) ? (
              <Button onClick={() => openNew()}>
                <IconPlus />
                Agendar consulta
              </Button>
            ) : null}
          />
        ) : (
          dayAppts.map(appt => {
            const patObj = patients.find(p => p.id === appt.patientId);
            const incomplete =
              appt.incompletePatient === true ||
              isProfileIncomplete(patObj) ||
              String(appt.patientId).startsWith("local_");
            const status = appt.status || "scheduled";

            return (
              <div
                key={appt.id}
                className={[
                  "agenda-appt",
                  `agenda-appt--${status}`,
                  incomplete ? "agenda-appt--incomplete" : "",
                ].filter(Boolean).join(" ")}
              >
                {incomplete && (
                  <div className="agenda-incomplete-warn">
                    <IconWarning />
                    <span>Cadastro incompleto — consulta bloqueada até completar o perfil.</span>
                    {onNavigatePatient && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="agenda-incomplete-warn__action"
                        onClick={() => onNavigatePatient(appt.patientId)}
                      >
                        Completar →
                      </Button>
                    )}
                  </div>
                )}

                <div className="agenda-appt__row">
                  <span className="agenda-appt__time">{appt.time}</span>

                  <div className="agenda-appt__copy">
                    <div className="agenda-appt__name">{appt.patientName}</div>
                    <div className="agenda-appt__meta">
                      {appt.type === "consultation" ? "Consulta"
                        : appt.type === "return" ? "Retorno"
                        : appt.type === "procedure" ? "Procedimento"
                        : "Outro"}
                      {appt.doctorName && ` · ${appt.doctorName}`}
                      {appt.notes && ` · ${appt.notes}`}
                    </div>
                  </div>

                  <div className="agenda-appt__actions">
                    <select
                      className="agenda-status-sel"
                      value={appt.status}
                      onChange={e => {
                        if (incomplete && (e.target.value === "attending" || e.target.value === "done")) {
                          alert("Cadastro incompleto. Complete o perfil do paciente antes de iniciar a consulta.");
                          return;
                        }
                        updateStatus(appt.id, e.target.value);
                      }}
                    >
                      {Object.entries(STATUS_LABEL).map(([k, v]) => {
                        const blocked = incomplete && (k === "attending" || k === "done");
                        return (
                          <option key={k} value={k} disabled={blocked}>
                            {v}{blocked ? " (bloqueado)" : ""}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--icon"
                      onClick={() => openEdit(appt)}
                      aria-label="Editar agendamento"
                    >
                      <IconPencil />
                    </button>

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--icon agenda-appt__remove-btn"
                      onClick={() => remove(appt.id)}
                      aria-label="Remover agendamento"
                    >
                      <IconTrash />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de agendamento */}
      {showForm && (
        <Modal
          title={editId ? "Editar agendamento" : "Novo agendamento"}
          onClose={() => setShowForm(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" form="agenda-form">Salvar</Button>
            </>
          }
        >
          <form id="agenda-form" onSubmit={submit} className="field-grid field-grid--no-pad">

            {/* Busca de paciente */}
            <label className="field field--span-2">
              <span className="field__label">Paciente *</span>
              <div className="agenda-pat-wrap">
                <div className="input">
                  <span className="input__icon"><IconSearch /></span>
                  <input
                    value={patSearch}
                    onChange={e => {
                      setPatSearch(e.target.value);
                      if (patSelected && e.target.value !== patSelected.name) {
                        setPatSelected(null);
                        setForm(s => ({ ...s, patientId: "" }));
                      }
                    }}
                    placeholder="Buscar por nome, CPF ou telefone..."
                    autoComplete="off"
                  />
                  {patSelected && (
                    <span className="agenda-pat-check"><IconCheck /></span>
                  )}
                </div>

                {patSearch.length >= 2 && !patSelected && (
                  <div className="agenda-pat-dropdown">
                    {patResults.length === 0 ? (
                      <div className="agenda-pat-empty">
                        <span>Nenhum paciente encontrado.</span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const n = patSearch;
                            setPatSearch("");
                            setNewPatForm({ name: n, cpf: "", phone: "", careCategory: "general", birthDate: "", teamId: String(user?.teamId || "") });
                            setNewPatErr("");
                            setShowNewPat(true);
                          }}
                        >
                          + Cadastrar novo paciente
                        </Button>
                      </div>
                    ) : (
                      <>
                        {patResults.map(p => {
                          const am = ageInMonths(p.birthDate);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className="agenda-pat-opt"
                              onClick={() => { setPatSelected(p); setPatSearch(p.name); setForm(s => ({ ...s, patientId: p.id })); }}
                            >
                              <span className="agenda-pat-opt__avatar">{initials(p.name)}</span>
                              <span>
                                <div className="agenda-pat-opt__name">{p.name}</div>
                                <div className="agenda-pat-opt__meta">
                                  {p.careCategory || "Geral"}
                                  {am !== null ? ` · ${am < 24 ? am + "m" : Math.floor(am / 12) + "a"}` : ""}
                                  {p.cpf ? ` · CPF ${p.cpf}` : ""}
                                </div>
                              </span>
                            </button>
                          );
                        })}
                        <div className="agenda-pat-footer">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const n = patSearch;
                              setPatSearch("");
                              setNewPatForm({ name: n, cpf: "", phone: "", careCategory: "general", birthDate: "", teamId: String(user?.teamId || "") });
                              setNewPatErr("");
                              setShowNewPat(true);
                            }}
                          >
                            + Cadastrar novo paciente
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </label>

            {/* Cadastro rápido */}
            {showNewPat && (
              <div className="field--span-2 agenda-quick-patient">
                <div className="agenda-quick-patient__header">
                  <span className="agenda-quick-patient__title">+ Cadastro rápido de paciente</span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setShowNewPat(false)}
                    aria-label="Fechar cadastro rápido"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                <div className="agenda-quick-patient__grid">
                  <Input
                    label="Nome completo *"
                    className="field--span-2"
                    value={newPatForm.name}
                    onChange={e => setNewPatForm(s => ({ ...s, name: e.target.value }))}
                    placeholder="Nome do paciente"
                  />
                  <Input
                    label="CPF"
                    value={newPatForm.cpf}
                    onChange={e => setNewPatForm(s => ({ ...s, cpf: formatCpf(e.target.value) }))}
                    placeholder="000.000.000-00"
                  />
                  <Input
                    label="Telefone"
                    value={newPatForm.phone}
                    onChange={e => setNewPatForm(s => ({ ...s, phone: formatPhone(e.target.value) }))}
                    placeholder="(00) 00000-0000"
                  />
                  <Input
                    label="Nascimento"
                    type="date"
                    value={newPatForm.birthDate}
                    onChange={e => setNewPatForm(s => ({ ...s, birthDate: e.target.value }))}
                  />
                  <Select
                    label="Categoria"
                    value={newPatForm.careCategory}
                    onChange={e => setNewPatForm(s => ({ ...s, careCategory: e.target.value }))}
                  >
                    <option value="general">Geral</option>
                    <option value="pregnant">Gestante</option>
                    <option value="hypertension">Hipertensão</option>
                    <option value="diabetes">Diabetes</option>
                    <option value="elderly">Idoso</option>
                    <option value="child_followup">Puericultura</option>
                  </Select>
                  <Select
                    label="Equipe responsável"
                    className="field--span-2"
                    value={newPatForm.teamId}
                    onChange={e => setNewPatForm(s => ({ ...s, teamId: e.target.value }))}
                  >
                    <option value="">Selecione...</option>
                    {(teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </div>

                {newPatErr && <span className="field__error">{newPatErr}</span>}

                <div className="agenda-quick-patient__footer">
                  <Button
                    type="button"
                    onClick={() => {
                      if (!newPatForm.name.trim()) { setNewPatErr("Nome obrigatório."); return; }
                      if (!String(newPatForm.teamId || "").trim()) { setNewPatErr("Selecione a equipe responsável."); return; }
                      const np = {
                        ...emptyPatientForm(),
                        name: newPatForm.name.trim(),
                        cpf: newPatForm.cpf,
                        phone: newPatForm.phone,
                        birthDate: newPatForm.birthDate,
                        careCategory: newPatForm.careCategory,
                        teamId: newPatForm.teamId,
                        id: "local_" + Date.now(),
                        incompleteProfile: true,
                      };
                      setPatSelected(np);
                      setPatSearch(np.name);
                      setForm(s => ({ ...s, patientId: np.id }));
                      setShowNewPat(false);
                      setNewPatErr("");
                    }}
                  >
                    <IconCheck />
                    Usar este paciente
                  </Button>
                </div>
              </div>
            )}

            {/* Data */}
            <Input
              label="Data *"
              type="date"
              value={form.date}
              onChange={e => setForm(s => ({ ...s, date: e.target.value }))}
              hint={
                form.date && isUnavailableDay(form.date)
                  ? `${unavailableReason(form.date)} — confirme se necessário`
                  : undefined
              }
            />

            {/* Horário */}
            <Select
              label="Horário *"
              value={form.time}
              onChange={e => setForm(s => ({ ...s, time: e.target.value }))}
            >
              <option value="">Selecionar...</option>
              {AGENDA_HOURS.map(h => <option key={h} value={h}>{h}</option>)}
            </Select>

            {/* Profissional */}
            <Select
              label="Profissional"
              value={form.doctorId}
              onChange={e => setForm(s => ({ ...s, doctorId: e.target.value }))}
            >
              <option value="">Sem preferência</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>

            {/* Tipo */}
            <Select
              label="Tipo"
              value={form.type}
              onChange={e => setForm(s => ({ ...s, type: e.target.value }))}
            >
              <option value="consultation">Consulta</option>
              <option value="return">Retorno</option>
              <option value="procedure">Procedimento</option>
              <option value="other">Outro</option>
            </Select>

            {/* Observações */}
            <Input
              label="Observações"
              className="field--span-2"
              value={form.notes}
              onChange={e => setForm(s => ({ ...s, notes: e.target.value }))}
              placeholder="Motivo, solicitações especiais..."
            />

          </form>
        </Modal>
      )}
    </div>
  );
}

export default AgendaPage;
