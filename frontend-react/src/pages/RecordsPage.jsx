import { useEffect, useMemo, useState } from "react";
import { createRecord, deleteRecord, getPatientHistory } from "../api";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import RecordEmptyState from "../components/records/RecordEmptyState";
import RecordFilters from "../components/records/RecordFilters";
import RecordForm from "../components/records/RecordForm";
import RecordHeader from "../components/records/RecordHeader";
import RecordTimeline from "../components/records/RecordTimeline";
import { canAccessChart, canWriteRecords } from "../utils/roles";

const EMPTY_FORM = {
  type: "consultation",
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  title: "",
  details: "",
};

export default function RecordsPage({ patients, users, user, token, onNavigatePatient, selectedPatientId: controlledPatientId = "", onSelectPatientId }) {
  const [query, setQuery] = useState("");
  const [localSelectedPatientId, setLocalSelectedPatientId] = useState(controlledPatientId || "");
  const [records, setRecords] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const canAccess = canAccessChart(user);
  const canWrite = canWriteRecords(user);

  useEffect(() => {
    if (controlledPatientId && controlledPatientId !== localSelectedPatientId) {
      setLocalSelectedPatientId(controlledPatientId);
    }
  }, [controlledPatientId, localSelectedPatientId]);

  function handleSelectPatient(patientId) {
    setLocalSelectedPatientId(patientId);
    if (typeof onSelectPatientId === "function") onSelectPatientId(patientId);
  }

  const filteredPatients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) => `${patient.name || ""} ${patient.cpf || ""} ${patient.cns || ""}`.toLowerCase().includes(term));
  }, [patients, query]);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === localSelectedPatientId) || null,
    [patients, localSelectedPatientId],
  );

  const visibleRecords = useMemo(
    () => records.filter((record) => !typeFilter || record.type === typeFilter),
    [records, typeFilter],
  );

  useEffect(() => {
    if (!localSelectedPatientId || !token) {
      setRecords([]);
      return;
    }

    let active = true;
    setBusy(true);
    setError("");
    getPatientHistory(token, localSelectedPatientId)
      .then((data) => { if (active) setRecords(Array.isArray(data) ? data : []); })
      .catch((err) => { if (active) setError(err.message || "Erro ao carregar prontuário."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [localSelectedPatientId, token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!localSelectedPatientId) return;
    if (!form.date || !form.title.trim()) {
      setError("Preencha data e título do registro.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await createRecord(token, localSelectedPatientId, { ...form, title: form.title.trim(), details: form.details.trim() });
      const data = await getPatientHistory(token, localSelectedPatientId);
      setRecords(Array.isArray(data) ? data : []);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      setError(err.message || "Erro ao salvar registro.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(recordId) {
    if (!localSelectedPatientId) return;
    setBusy(true);
    setError("");
    try {
      await deleteRecord(token, localSelectedPatientId, recordId);
      const data = await getPatientHistory(token, localSelectedPatientId);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Erro ao excluir registro.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAccess) {
    return (
      <PageLayout className="records-page">
        <PageHeader eyebrow="VALENS" title="Prontuário" subtitle="Acesso restrito a perfis com autorização clínica." />
        <Alert tone="danger">O prontuário eletrônico é acessível apenas por perfis autorizados da equipe clínica.</Alert>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="records-page">
      <PageHeader
        eyebrow="VALENS"
        title="Prontuário"
        subtitle="Linha do tempo clínica com registros estruturados por paciente."
        actions={selectedPatient ? <Button variant="secondary" onClick={() => onNavigatePatient(selectedPatient.id)}>Abrir paciente</Button> : null}
      />

      <RecordHeader
        query={query}
        setQuery={setQuery}
        patientOptions={filteredPatients}
        selectedPatientId={localSelectedPatientId}
        onSelectPatient={handleSelectPatient}
        onOpenForm={() => setShowForm(true)}
        canWrite={canWrite}
      />

      <RecordFilters typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        {busy && selectedPatient ? <Alert tone="info">Carregando registros clínicos...</Alert> : null}
        {visibleRecords.length ? (
          <RecordTimeline records={visibleRecords} fmtDate={(value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-"} onDelete={handleDelete} canDelete={canWrite} />
        ) : (
          <RecordEmptyState hasPatient={Boolean(selectedPatient)} />
        )}
      </Card>

      {showForm ? (
        <Modal title={selectedPatient ? `Novo registro · ${selectedPatient.name}` : "Novo registro"} onClose={() => setShowForm(false)}>
          <RecordForm form={form} setForm={setForm} onSubmit={handleSubmit} busy={busy} error={error} onCancel={() => setShowForm(false)} />
        </Modal>
      ) : null}
    </PageLayout>
  );
}
