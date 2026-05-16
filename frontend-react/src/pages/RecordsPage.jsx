import { useEffect, useMemo, useState } from "react";
import { deleteRecord, getPatientHistory, login } from "../api";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import RecordEmptyState from "../components/records/RecordEmptyState";
import RecordFilters from "../components/records/RecordFilters";
import RecordHeader from "../components/records/RecordHeader";
import RecordTimeline from "../components/records/RecordTimeline";
import { canAccessChart, canWriteRecords } from "../utils/roles";

export default function RecordsPage({ patients, users, user, token, onNavigatePatient, selectedPatientId: controlledPatientId = "", onSelectPatientId }) {
  const [query, setQuery] = useState("");
  const [localSelectedPatientId, setLocalSelectedPatientId] = useState(controlledPatientId || "");
  const [records, setRecords] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [chartLocked, setChartLocked] = useState(true);
  const [lockPassword, setLockPassword] = useState("");
  const [lockError, setLockError] = useState("");
  const [lockBusy, setLockBusy] = useState(false);

  const canAccess = canAccessChart(user);
  const canWrite = canWriteRecords(user);

  useEffect(() => {
    if (controlledPatientId && controlledPatientId !== localSelectedPatientId) {
      setLocalSelectedPatientId(controlledPatientId);
    }
  }, [controlledPatientId, localSelectedPatientId]);

  useEffect(() => {
    setChartLocked(true);
    setLockPassword("");
    setLockError("");
  }, [localSelectedPatientId]);

  function handleSelectPatient(patientId) {
    setLocalSelectedPatientId(patientId);
    if (typeof onSelectPatientId === "function") onSelectPatientId(patientId);
  }

  async function handleUnlock(event) {
    event.preventDefault();
    if (!lockPassword.trim()) {
      setLockError("Informe sua senha para liberar o acesso.");
      return;
    }
    setLockBusy(true);
    setLockError("");
    try {
      await login(user?.email, lockPassword);
      setChartLocked(false);
      setLockPassword("");
    } catch {
      setLockError("Senha incorreta. Acesso negado.");
    } finally {
      setLockBusy(false);
    }
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
    if (!localSelectedPatientId || !token || chartLocked) {
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
  }, [localSelectedPatientId, token, chartLocked]);

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
      />

      {selectedPatient && chartLocked ? (
        <Card>
          <div className="records-security-gate">
            <div className="records-security-gate__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1.2" fill="currentColor"/>
              </svg>
            </div>
            <div className="records-security-gate__content">
              <p className="records-security-gate__title">Confirmação de identidade obrigatória</p>
              <p className="records-security-gate__desc">
                O acesso ao prontuário de <strong>{selectedPatient.name}</strong> exige reautenticação por exigência da LGPD e das diretrizes de segurança clínica. Informe sua senha de acesso ao sistema para liberar a visualização.
              </p>
              <form className="records-security-gate__form" onSubmit={handleUnlock}>
                <input
                  type="password"
                  className="input"
                  placeholder="Senha de acesso"
                  value={lockPassword}
                  onChange={(e) => { setLockPassword(e.target.value); setLockError(""); }}
                  autoComplete="current-password"
                  disabled={lockBusy}
                  style={{ maxWidth: 280 }}
                />
                {lockError && <span className="field__error">{lockError}</span>}
                <Button variant="primary" type="submit" disabled={lockBusy}>
                  {lockBusy ? "Verificando..." : "Liberar acesso"}
                </Button>
              </form>
              <p className="records-security-gate__lgpd">
                Esta ação é registrada no log de auditoria com data, hora e identidade do responsável, conforme a Lei 13.709/2018 (LGPD).
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <RecordFilters typeFilter={typeFilter} setTypeFilter={setTypeFilter} />

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Card className="card--noPad">
            <div className="card__header">
              <div>
                <div className="card__title">Linha do tempo clínica</div>
                <div className="card__subtitle">
                  {selectedPatient ? `${visibleRecords.length} registro(s) filtrados para ${selectedPatient.name}` : "Selecione um paciente para iniciar a leitura"}
                </div>
              </div>
            </div>
            <div className="card__body">
              {busy && selectedPatient ? <Alert tone="info">Carregando registros clínicos...</Alert> : null}
              {visibleRecords.length ? (
                <RecordTimeline records={visibleRecords} fmtDate={(value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-"} onDelete={handleDelete} canDelete={canWrite} />
              ) : (
                <RecordEmptyState hasPatient={Boolean(selectedPatient)} />
              )}
            </div>
          </Card>
        </>
      )}
    </PageLayout>
  );
}
