import { useMemo } from "react";
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

export default function PatientsPage(props) {
  const {
    patients, users, query, setQuery, categoryFilter, setCategoryFilter, acsFilter, setAcsFilter,
    conditionFilter, setConditionFilter, selectedPatientId, setSelectedPatientId, onEdit, onDelete, onView,
    selectedPatient,
  } = props;

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

  return (
    <PageLayout className="patients-page">
      <PageHeader
        eyebrow="VALENS"
        title="Pacientes"
        subtitle="Acompanhe cadastros, filtros operacionais e contexto clínico da equipe."
      />

      <PatientsToolbar query={query} setQuery={setQuery} onCreate={handleCreatePatient} selectedCount={filteredPatients.length} />
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
      <PatientSummaryCards patients={patients} filteredPatients={filteredPatients} selectedPatient={selectedPatient} />

      <div className="patients-page__content">
        <Card className="patients-page__table">
          {filteredPatients.length ? (
            <PatientsTable
              patients={filteredPatients}
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
            <PatientEmptyState />
          )}
        </Card>

        <Card className="patients-page__details">
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
        </Card>
      </div>
    </PageLayout>
  );
}
