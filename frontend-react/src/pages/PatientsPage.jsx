import { useMemo, useState, useEffect } from "react";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import PatientsToolbar from "../components/patients/PatientsToolbar";
import PatientFilters from "../components/patients/PatientFilters";
import PatientSummaryCards from "../components/patients/PatientSummaryCards";
import PatientsTable from "../components/patients/PatientsTable";
import PatientEmptyState from "../components/patients/PatientEmptyState";
import PatientDetailsPanel from "../components/patients/PatientDetailsPanel";
import { calcAge, catLabel } from "../utils/clinical";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function PatientsPage(props) {
  const {
    patients, users, query, setQuery, categoryFilter, setCategoryFilter, acsFilter, setAcsFilter,
    conditionFilter, setConditionFilter, selectedPatientId, setSelectedPatientId, onEdit, onDelete, onView,
    selectedPatient,
  } = props;

  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function handleCreatePatient() {
    const openCreate = onEdit(null);
    if (typeof openCreate === "function") openCreate();
  }

  const categories = useMemo(() => {
    const unique = new Map();
    patients.forEach((patient) => {
      const key = patient.careCategory || "general";
      if (!unique.has(key)) unique.set(key, { value: key, label: catLabel([], key) });
    });
    return [...unique.values()];
  }, [patients]);

  const acsUsers = useMemo(() => users.filter((user) => user.role === "acs"), [users]);

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const haystack = `${patient.name || ""} ${patient.cpf || ""} ${patient.cns || ""} ${patient.phone || ""}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query.toLowerCase());
      const matchesCategory = !categoryFilter || patient.careCategory === categoryFilter;
      const matchesAcs = !acsFilter || patient.assignedAcsId === acsFilter;
      const conditions = patient.chronicConditions || [];
      const matchesCondition =
        !conditionFilter ||
        (conditionFilter === "hypertension" && conditions.includes("hypertension")) ||
        (conditionFilter === "diabetes" && conditions.includes("diabetes")) ||
        (conditionFilter === "both" && conditions.includes("hypertension") && conditions.includes("diabetes"));
      return matchesQuery && matchesCategory && matchesAcs && matchesCondition;
    });
  }, [patients, query, categoryFilter, acsFilter, conditionFilter]);

  useEffect(() => {
    setPage(1);
  }, [filteredPatients.length, pageSize, query, categoryFilter, acsFilter, conditionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedPatients = filteredPatients.slice((safePage - 1) * pageSize, safePage * pageSize);

  const activeFilterCount = [categoryFilter, acsFilter, conditionFilter].filter(Boolean).length;

  const rangeStart = filteredPatients.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredPatients.length);

  return (
    <PageLayout className="patients-page">
      <PageHeader
        eyebrow="VALENS"
        title="Pacientes"
        subtitle="Acompanhe cadastros, filtros operacionais e contexto clínico da equipe."
      />

      <PatientsToolbar
        query={query}
        setQuery={setQuery}
        onCreate={handleCreatePatient}
        selectedCount={filteredPatients.length}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        activeFilterCount={activeFilterCount}
      />

      {showFilters && (
        <PatientFilters
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          acsFilter={acsFilter}
          setAcsFilter={setAcsFilter}
          conditionFilter={conditionFilter}
          setConditionFilter={setConditionFilter}
          categories={categories}
          acsUsers={acsUsers}
        />
      )}

      <PatientSummaryCards patients={patients} filteredPatients={filteredPatients} selectedPatient={selectedPatient} />

      <div className="patients-page__content">
        <Card className="patients-page__table card--noPad">
          <div className="card__header">
            <div>
              <div className="card__title">Lista de pacientes</div>
              <div className="card__subtitle">{filteredPatients.length} registro(s) visíveis na consulta atual</div>
            </div>
          </div>
          <div className="card__body" style={{ padding: 0 }}>
            {paginatedPatients.length ? (
              <PatientsTable
                patients={paginatedPatients}
                selectedPatientId={selectedPatientId}
                catLabel={catLabel}
                calcAge={calcAge}
                users={users}
                onSelect={setSelectedPatientId}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : (
              <div style={{ padding: "var(--s-5)" }}>
                <PatientEmptyState />
              </div>
            )}
          </div>
          {filteredPatients.length > 0 && (
            <div className="pagination">
              <div className="pagination__page-size">
                <label className="pagination__page-size-label" htmlFor="patients-page-size">Por página</label>
                <select
                  id="patients-page-size"
                  className="patients-page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  {PAGE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <span className="pagination__info">
                {rangeStart}–{rangeEnd} de {filteredPatients.length}
              </span>
              <div className="pagination__controls">
                <button
                  type="button"
                  className="pagination__btn"
                  onClick={() => setPage(1)}
                  disabled={safePage <= 1}
                  aria-label="Primeira página"
                >
                  «
                </button>
                <button
                  type="button"
                  className="pagination__btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Página anterior"
                >
                  ‹
                </button>
                <span className="pagination__current">{safePage} / {totalPages}</span>
                <button
                  type="button"
                  className="pagination__btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Próxima página"
                >
                  ›
                </button>
                <button
                  type="button"
                  className="pagination__btn"
                  onClick={() => setPage(totalPages)}
                  disabled={safePage >= totalPages}
                  aria-label="Última página"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card className="patients-page__details card--noPad">
          <div className="card__header">
            <div>
              <div className="card__title">Detalhes do paciente</div>
              <div className="card__subtitle">Ficha operacional e dados clínicos consolidados</div>
            </div>
          </div>
          <div className="card__body">
            {selectedPatient ? (
              <PatientDetailsPanel
                patient={selectedPatient}
                users={users}
                templates={[]}
                catLabel={catLabel}
                displayText={(value) => value || "-"}
                isChildCategory={(value) => ["child", "infant"].includes(String(value || "").toLowerCase())}
                fmtDate={(value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-"}
                calcAge={calcAge}
              />
            ) : (
              <Alert tone="info">Selecione um paciente na tabela para visualizar os dados completos.</Alert>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
}
