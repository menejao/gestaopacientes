import { useState, useMemo, useRef } from "react";
import { readLS, writeLS } from "../utils/storage";
import { QUEUE_KEY, NOTIFS_KEY, AGENDA_KEY, PRIORITY_LABELS, PRIORITY_COLORS } from "../config/constants";
import { matchesPatientSearch, isChildCategory, ageInMonths } from "../utils/clinical";
import { initials, formatCpf, formatCns, formatPhone, formatCep } from "../utils/formatting";
import { parseLocalDate } from "../utils/dates";
import { createPatient } from "../api";
import PageHeader from "../components/layout/PageHeader";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Avatar from "../components/ui/Avatar";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";

const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IconWarning = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <path d="M8 1.5a5 5 0 00-5 5v3l-1.5 2h13L13 9.5v-3a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

function QueuePage({ patients, users, user, token, onNewPatient }) {
  const [queue, setQueue]             = useState(() => readLS(QUEUE_KEY, []));
  const [showForm, setShowForm]       = useState(false);
  const [step, setStep]               = useState("select");
  const [demandType, setDemandType]   = useState("scheduled");
  const [destination, setDestination] = useState("doctor");
  const [priority, setPriority]       = useState("normal");
  const [reason, setReason]           = useState("");
  const [agendaRef, setAgendaRef]     = useState(null);
  const [searchQ, setSearchQ]         = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const searchRef = useRef(null);

  const emptyNew = () => ({
    name: "", cpf: "", cns: "", birthDate: "", sex: "", maritalStatus: "", motherName: "",
    phone: "", phoneAlt: "", zipCode: "", address: "", number: "", complement: "",
    neighborhood: "", city: "", state: "", careCategory: "general", assignedAcsId: "",
    pregnancyStartDate: "", expectedDeliveryDate: "",
    gestationalAgeDumWeeks: "", gestationalAgeDumDays: "",
    gestationalAgeUsgWeeks: "", gestationalAgeUsgDays: "",
    usgDate1: "", usgDate2: "", usgDate3: "",
    allergies: "", comorbidities: "", medications: "",
    microarea: "", familyCode: "", homeVisitFreq: "",
    housingType: "", waterSupply: "", sewage: "", garbage: "", electricity: "",
  });
  const [newPat, setNewPat]     = useState(emptyNew());
  const [savingNew, setSavingNew] = useState(false);
  const [newPatErr, setNewPatErr] = useState("");

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY, q); }

  const searchResults = useMemo(() => {
    const q = searchQ.trim();
    if (q.length < 2) return [];
    const inQueue = queue.filter(e => e.status !== "done").map(e => e.patientId);
    return patients.filter(p => !inQueue.includes(p.id) && matchesPatientSearch(p, q)).slice(0, 8);
  }, [searchQ, patients, queue]);

  function selectPatient(p) {
    setSelectedPatient(p);
    setSearchQ(p.name);
    const cat = String(p.careCategory || "").toLowerCase();
    let prio = "normal";
    if (cat === "pregnant") prio = "pregnant";
    else {
      const age = p.birthDate ? Math.floor((new Date() - (parseLocalDate(p.birthDate) || new Date())) / 31557600000) : null;
      if (age !== null && age >= 60) prio = "elderly";
      else if (age !== null && age < 12) prio = "child";
    }
    setPriority(prio);
    const today = new Date().toISOString().slice(0, 10);
    const agenda = readLS(AGENDA_KEY, []);
    const ref = agenda.find(a => a.patientId === p.id && a.date === today && a.status !== "done");
    setAgendaRef(ref || null);
    if (ref) setDemandType("scheduled");
  }

  function resetForm() {
    setStep("select"); setSearchQ(""); setSelectedPatient(null);
    setDemandType("scheduled"); setDestination("doctor");
    setPriority("normal"); setReason(""); setAgendaRef(null);
    setNewPat(emptyNew()); setNewPatErr("");
  }

  function addToQueue() {
    if (!selectedPatient) return;
    const notif = {
      id: "q" + Date.now(), type: demandType === "scheduled" ? "info" : "warn",
      icon: "check",
      title: demandType === "scheduled"
        ? `Paciente chegou: ${selectedPatient.name}`
        : `Paciente espontâneo: ${selectedPatient.name}`,
      detail: demandType === "scheduled"
        ? `Consulta confirmada. Prioridade: ${PRIORITY_LABELS[priority]}.`
        : `Encaminhar para: ${destination === "doctor" ? "Médico(a)" : "Enfermagem"}. ${reason || ""}`,
      patientId: selectedPatient.id, dest: demandType === "spontaneous" ? destination : null,
      ts: new Date().toISOString(), read: false,
    };
    const prev = readLS(NOTIFS_KEY, []);
    writeLS(NOTIFS_KEY, [notif, ...prev].slice(0, 50));
    const entry = {
      id: "q" + Date.now(), patientId: selectedPatient.id, patientName: selectedPatient.name,
      priority, reason, demandType, destination: demandType === "spontaneous" ? destination : null,
      agendaRef: agendaRef?.id || null, arrivedAt: new Date().toISOString(), status: "waiting",
    };
    saveQueue([...queue, entry]);
    resetForm(); setShowForm(false);
  }

  async function saveNewPatient(e) {
    e.preventDefault();
    if (!newPat.name.trim()) { setNewPatErr("Nome é obrigatório."); return; }
    setSavingNew(true); setNewPatErr("");
    try {
      const territorial = [
        newPat.microarea     ? `Microárea: ${newPat.microarea}`       : "",
        newPat.familyCode    ? `Cód.família: ${newPat.familyCode}`    : "",
        newPat.homeVisitFreq ? `Freq.visita: ${newPat.homeVisitFreq}` : "",
        newPat.housingType   ? `Moradia: ${newPat.housingType}`       : "",
        newPat.waterSupply   ? `Água: ${newPat.waterSupply}`          : "",
        newPat.sewage        ? `Esgoto: ${newPat.sewage}`             : "",
        newPat.garbage       ? `Lixo: ${newPat.garbage}`              : "",
        newPat.electricity   ? `Energia: ${newPat.electricity}`       : "",
      ].filter(Boolean).join(" | ");
      const payload = {
        name: newPat.name.trim(), motherName: newPat.motherName.trim(),
        cpf: newPat.cpf.trim(), cns: newPat.cns.trim(), birthDate: newPat.birthDate,
        phone: newPat.phone.trim(), phoneAlt: newPat.phoneAlt.trim(),
        sex: newPat.sex, maritalStatus: newPat.maritalStatus,
        careCategory: newPat.careCategory || "general", assignedAcsId: "",
        zipCode: newPat.zipCode.trim(), address: newPat.address.trim(),
        number: newPat.number.trim(), complement: newPat.complement.trim(),
        neighborhood: newPat.neighborhood.trim(), city: newPat.city.trim(),
        state: newPat.state.trim().toUpperCase(),
        allergies: newPat.allergies.trim(), comorbidities: newPat.comorbidities.trim(),
        medications: newPat.medications.trim() + (territorial ? (" | [Territorial] " + territorial) : ""),
        pregnancyStartDate: newPat.pregnancyStartDate || "",
        expectedDeliveryDate: newPat.expectedDeliveryDate || "",
        gestationalAgeDumWeeks: newPat.gestationalAgeDumWeeks === "" ? null : Number(newPat.gestationalAgeDumWeeks),
        gestationalAgeDumDays: newPat.gestationalAgeDumDays === "" ? null : Number(newPat.gestationalAgeDumDays),
        gestationalAgeUsgWeeks: newPat.gestationalAgeUsgWeeks === "" ? null : Number(newPat.gestationalAgeUsgWeeks),
        gestationalAgeUsgDays: newPat.gestationalAgeUsgDays === "" ? null : Number(newPat.gestationalAgeUsgDays),
        usgDate1: newPat.usgDate1 || "", usgDate2: newPat.usgDate2 || "", usgDate3: newPat.usgDate3 || "",
      };
      let created;
      if (token && !String(token).startsWith("local_")) {
        created = await createPatient(token, payload);
      } else {
        created = { ...payload, id: "local_" + Date.now() };
        if (onNewPatient) onNewPatient(created);
      }
      if (onNewPatient && created?.id) onNewPatient(created);
      setSelectedPatient({ ...created, name: newPat.name.trim() });
      setSearchQ(newPat.name.trim());
      setStep("select");
    } catch (err) { setNewPatErr(err.message || "Erro ao cadastrar paciente."); }
    finally { setSavingNew(false); }
  }

  function updateStatus(id, status) { saveQueue(queue.map(q => q.id === id ? { ...q, status, updatedAt: new Date().toISOString() } : q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q => q.id !== id)); }
  function clearDone() { saveQueue(queue.filter(q => q.status === "waiting" || q.status === "attending" || q.status === "triage" || q.status === "ready")); }

  const sorted = [...queue].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const pa = PRIORITY_COLORS[a.priority]?.order ?? 4;
    const pb = PRIORITY_COLORS[b.priority]?.order ?? 4;
    if (pa !== pb) return pa - pb;
    return a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting   = sorted.filter(q => q.status === "waiting").length;
  const attending = sorted.filter(q => q.status === "attending").length;

  function fmtTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  function waitMins(iso) {
    const mins = Math.floor((new Date() - new Date(iso)) / 60000);
    return mins < 1 ? "agora" : mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  }

  return (
    <div className="queue-page">
      <PageHeader
        eyebrow="Recepção"
        title="Fila de Atendimento"
        subtitle="Triagem, prioridade e fluxo de pacientes no dia."
        actions={
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <IconPlus /> Dar entrada
          </Button>
        }
      />

      <div className="queue-kpis">
        <div className="kpi card kpi--info">
          <span className="kpi__label">Aguardando</span>
          <strong className="kpi__value">{waiting}</strong>
          <span className="kpi__helper">na fila</span>
        </div>
        <div className="kpi card kpi--warning">
          <span className="kpi__label">Em atendimento</span>
          <strong className="kpi__value">{attending}</strong>
          <span className="kpi__helper">consultas ativas</span>
        </div>
        <div className="kpi card">
          <span className="kpi__label">Total hoje</span>
          <strong className="kpi__value">{sorted.length}</strong>
          <span className="kpi__helper">entradas</span>
        </div>
        {sorted.some(q => q.status === "done") && (
          <Button variant="ghost" size="sm" className="queue-kpis__clear-btn" onClick={clearDone}>
            Limpar concluídos
          </Button>
        )}
      </div>

      <div className="queue-list">
        {!sorted.length ? (
          <EmptyState
            title="Nenhum paciente na fila"
            description="Clique em «Dar entrada» para registrar a chegada de um paciente."
          />
        ) : (
          sorted.map((q, i) => {
            const isDone = q.status === "done";
            const priorityClass = `queue-entry--${q.priority || "normal"}`;
            return (
              <div key={q.id} className={`queue-entry ${isDone ? "queue-entry--done" : priorityClass}`}>
                <div className="queue-entry__rank">{i + 1}</div>
                <div className="queue-entry__copy">
                  <div className="queue-entry__name">{q.patientName}</div>
                  <div className="queue-entry__meta">
                    Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}{q.reason && " · " + q.reason}
                  </div>
                  <div className="queue-entry__badges">
                    <span className={`queue-badge ${isDone ? "" : priorityClass}`}>{PRIORITY_LABELS[q.priority]}</span>
                    {q.demandType === "spontaneous" && (
                      <span className="queue-badge queue-badge--spontaneous">
                        Espontâneo → {q.destination === "nurse" ? "Enfermagem" : "Médico(a)"}
                      </span>
                    )}
                    {q.demandType === "scheduled" && (
                      <span className="queue-badge queue-badge--scheduled">Agendado</span>
                    )}
                  </div>
                </div>
                {!isDone && (
                  <div className="queue-entry__actions">
                    {q.status === "waiting" && (
                      <span className="queue-badge queue-badge--waiting">Aguardando triagem</span>
                    )}
                    {q.status === "triage" && (
                      <span className="queue-badge queue-badge--triage">Em triagem</span>
                    )}
                    {q.status === "ready" && (
                      <Button size="sm" onClick={() => updateStatus(q.id, "attending")}>Chamar</Button>
                    )}
                    {q.status === "attending" && (
                      <Button size="sm" variant="primary" onClick={() => updateStatus(q.id, "done")}>Concluir</Button>
                    )}
                    <button
                      className="btn btn--ghost btn--sm btn--icon agenda-appt__remove-btn"
                      onClick={() => removeFromQueue(q.id)}
                      title="Remover da fila"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showForm && (
        <Modal
          title="Dar entrada na fila"
          onClose={() => { setShowForm(false); resetForm(); }}
        >
          {step === "select" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
              {/* Patient search */}
              <div className="field">
                <label className="field__label">Paciente *</label>
                <div className="agenda-pat-wrap">
                  <div className={`input${selectedPatient ? " input--success" : ""}`}>
                    <span className="input__icon"><IconSearch /></span>
                    <input
                      ref={searchRef}
                      value={searchQ}
                      onChange={e => {
                        setSearchQ(e.target.value);
                        if (selectedPatient && e.target.value !== selectedPatient.name) {
                          setSelectedPatient(null);
                          setAgendaRef(null);
                        }
                      }}
                      placeholder="Nome, CPF ou telefone..."
                      autoFocus
                    />
                    {selectedPatient && (
                      <span className="agenda-pat-check">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  {searchQ.length >= 2 && !selectedPatient && (
                    <div className="agenda-pat-dropdown">
                      {searchResults.length === 0 ? (
                        <div className="agenda-pat-empty">
                          <span>Nenhum paciente encontrado.</span>
                          <div className="agenda-pat-footer">
                            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setStep("new-patient")}>
                              + Cadastrar novo paciente
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {searchResults.map(p => {
                            const am = ageInMonths(p.birthDate);
                            return (
                              <button key={p.id} type="button" className="agenda-pat-opt" onClick={() => selectPatient(p)}>
                                <div className="agenda-pat-opt__avatar">{initials(p.name)}</div>
                                <div>
                                  <div className="agenda-pat-opt__name">{p.name}</div>
                                  <div className="agenda-pat-opt__meta">
                                    {p.careCategory || "general"}{am !== null ? ` · ${am < 24 ? am + "m" : Math.floor(am / 12) + "a"}` : ""}{p.phone ? ` · ${p.phone}` : ""}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                          <div className="agenda-pat-footer">
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep("new-patient")}>
                              + Cadastrar novo paciente
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!selectedPatient && searchQ.length < 2 && (
                <p className="muted small" style={{ textAlign: "center" }}>
                  Digite 2+ caracteres para buscar ·{" "}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep("new-patient")} style={{ display: "inline" }}>
                    ou cadastre um novo paciente
                  </button>
                </p>
              )}

              {selectedPatient && (
                <div className="queue-selected-pat">
                  <div className="queue-selected-pat__avatar">{initials(selectedPatient.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="queue-selected-pat__name">{selectedPatient.name}</div>
                    {agendaRef && (
                      <div className="queue-selected-pat__agenda">
                        Consulta agendada — {agendaRef.time || "sem horário"}{agendaRef.doctorName ? ` · ${agendaRef.doctorName}` : ""}
                      </div>
                    )}
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm btn--icon" onClick={() => { setSelectedPatient(null); setSearchQ(""); setAgendaRef(null); }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              )}

              {selectedPatient && (
                <>
                  {/* Demand type */}
                  <div className="field">
                    <label className="field__label">Tipo de demanda *</label>
                    <div className="queue-toggle">
                      {[["scheduled", "Agendado", "Consulta marcada"], ["spontaneous", "Espontâneo", "Sem agendamento"]].map(([val, label, desc]) => (
                        <button key={val} type="button"
                          className={`queue-toggle-btn${demandType === val ? " is-active" : ""}`}
                          onClick={() => setDemandType(val)}>
                          <div className="queue-toggle-btn__label">{label}</div>
                          <div className="queue-toggle-btn__desc">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {demandType === "spontaneous" && (
                    <div className="field">
                      <label className="field__label">Encaminhar para *</label>
                      <div className="queue-toggle">
                        {[["doctor", "Médico(a)"], ["nurse", "Enfermagem"]].map(([val, label]) => (
                          <button key={val} type="button"
                            className={`queue-toggle-btn${destination === val ? " is-active" : ""}`}
                            onClick={() => setDestination(val)}>
                            <div className="queue-toggle-btn__label">{label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Select
                    label="Prioridade"
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </Select>

                  <Input
                    label="Motivo / queixa principal"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Dor, retorno, renovação de receita..."
                  />

                  <div className={`queue-demand-notice queue-demand-notice--${demandType}`}>
                    <IconWarning />
                    <span>
                      <strong>Aviso:</strong>{" "}
                      {demandType === "scheduled"
                        ? `Profissional será notificado que ${selectedPatient.name} chegou.`
                        : `${destination === "doctor" ? "Médico(a)" : "Enfermagem"} receberá aviso de paciente espontâneo.`}
                    </span>
                  </div>

                  <div className="queue-form-footer">
                    <Button variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
                    <Button variant="primary" onClick={addToQueue}>Confirmar entrada</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "new-patient" && (
            <form onSubmit={saveNewPatient} style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
              {/* Identificação */}
              <div className="queue-form-section">
                <p className="queue-form-section__title">Identificação</p>
                <div className="field-grid field-grid--no-pad">
                  <Input className="field--span-2" label="Nome completo *" value={newPat.name} onChange={e => setNewPat(s => ({ ...s, name: e.target.value }))} placeholder="Nome do paciente" autoFocus />
                  {isChildCategory(newPat.careCategory) && (
                    <Input className="field--span-2" label="Nome do responsável" value={newPat.motherName} onChange={e => setNewPat(s => ({ ...s, motherName: e.target.value }))} />
                  )}
                  <Input label="Data de nascimento" type="date" value={newPat.birthDate} onChange={e => setNewPat(s => ({ ...s, birthDate: e.target.value }))} />
                  <Select label="Sexo" value={newPat.sex} onChange={e => setNewPat(s => ({ ...s, sex: e.target.value }))}>
                    <option value="">Não informado</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                  </Select>
                  {!isChildCategory(newPat.careCategory) && (
                    <Select label="Estado civil" value={newPat.maritalStatus} onChange={e => setNewPat(s => ({ ...s, maritalStatus: e.target.value }))}>
                      <option value="">Não informado</option>
                      <option value="solteiro">Solteiro(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="uniao_estavel">União estável</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="viuvo">Viúvo(a)</option>
                    </Select>
                  )}
                  <Input label="CPF" value={newPat.cpf} onChange={e => setNewPat(s => ({ ...s, cpf: formatCpf(e.target.value) }))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                  <Input label="CNS" value={newPat.cns} onChange={e => setNewPat(s => ({ ...s, cns: formatCns(e.target.value) }))} placeholder="000 0000 0000 0000" inputMode="numeric" />
                  <Input label="Telefone" value={newPat.phone} onChange={e => setNewPat(s => ({ ...s, phone: formatPhone(e.target.value) }))} placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15} />
                  <Input label="Telefone 2" value={newPat.phoneAlt} onChange={e => setNewPat(s => ({ ...s, phoneAlt: formatPhone(e.target.value) }))} placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15} />
                  <Select label="Categoria" value={newPat.careCategory} onChange={e => setNewPat(s => ({ ...s, careCategory: e.target.value }))}>
                    <option value="general">Geral</option>
                    <option value="pregnant">Gestante</option>
                    <option value="child_followup">Puericultura</option>
                    <option value="elderly">Pessoa Idosa</option>
                    <option value="puerperal">Puérpera</option>
                  </Select>
                </div>
              </div>

              {/* Endereço */}
              <div className="queue-form-section">
                <p className="queue-form-section__title">Endereço</p>
                <div className="field-grid field-grid--no-pad">
                  <Input label="CEP" value={newPat.zipCode} onChange={e => setNewPat(s => ({ ...s, zipCode: formatCep(e.target.value) }))} placeholder="00000-000" inputMode="numeric" maxLength={9} />
                  <Input label="UF" value={newPat.state} onChange={e => setNewPat(s => ({ ...s, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="SP" maxLength={2} />
                  <Input className="field--span-2" label="Rua" value={newPat.address} onChange={e => setNewPat(s => ({ ...s, address: e.target.value }))} />
                  <Input label="Número" value={newPat.number} onChange={e => setNewPat(s => ({ ...s, number: e.target.value }))} />
                  <Input label="Complemento" value={newPat.complement} onChange={e => setNewPat(s => ({ ...s, complement: e.target.value }))} />
                  <Input label="Bairro" value={newPat.neighborhood} onChange={e => setNewPat(s => ({ ...s, neighborhood: e.target.value }))} />
                  <Input label="Cidade" value={newPat.city} onChange={e => setNewPat(s => ({ ...s, city: e.target.value }))} />
                </div>
              </div>

              {/* Gestação */}
              {String(newPat.careCategory || "").toLowerCase() === "pregnant" && (
                <div className="queue-form-section">
                  <p className="queue-form-section__title queue-form-section__title--accent">Dados gestacionais</p>
                  <div className="field-grid field-grid--no-pad">
                    <Input label="DUM" type="date" value={newPat.pregnancyStartDate} onChange={e => setNewPat(s => ({ ...s, pregnancyStartDate: e.target.value }))} />
                    <Input label="DPP" type="date" value={newPat.expectedDeliveryDate} onChange={e => setNewPat(s => ({ ...s, expectedDeliveryDate: e.target.value }))} />
                    <Input label="IG DUM (sem)" type="number" min="0" max="45" value={newPat.gestationalAgeDumWeeks} onChange={e => setNewPat(s => ({ ...s, gestationalAgeDumWeeks: e.target.value }))} />
                    <Input label="IG DUM (dias)" type="number" min="0" max="6" value={newPat.gestationalAgeDumDays} onChange={e => setNewPat(s => ({ ...s, gestationalAgeDumDays: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* Clínico */}
              <div className="queue-form-section">
                <p className="queue-form-section__title">Informações clínicas</p>
                <div className="field-grid field-grid--no-pad">
                  <Input className="field--span-2" label="Alergias" value={newPat.allergies} onChange={e => setNewPat(s => ({ ...s, allergies: e.target.value }))} placeholder="Medicamentos, alimentos..." />
                  <Input className="field--span-2" label="Comorbidades" value={newPat.comorbidities} onChange={e => setNewPat(s => ({ ...s, comorbidities: e.target.value }))} placeholder="Hipertensão, diabetes..." />
                  <Input className="field--span-2" label="Medicamentos em uso" value={newPat.medications} onChange={e => setNewPat(s => ({ ...s, medications: e.target.value }))} placeholder="Nome, dose, frequência..." />
                </div>
              </div>

              {newPatErr && <p className="field__error">{newPatErr}</p>}

              <div className="queue-form-footer">
                <Button variant="secondary" type="button" onClick={() => setStep("select")}>← Voltar</Button>
                <Button variant="primary" type="submit" disabled={savingNew}>{savingNew ? "Cadastrando..." : "Cadastrar e continuar →"}</Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

export default QueuePage;
