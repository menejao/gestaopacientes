import Badge from "../ui/Badge";
import KPI from "../ui/KPI";

export default function PatientSummaryCards({ patients, filteredPatients, selectedPatient }) {
  const incompleteCount = filteredPatients.filter((patient) => patient.incompleteProfile).length;
  const chronicCount = filteredPatients.filter((patient) => (patient.chronicConditions || []).length > 0).length;
  const selectedCategory = selectedPatient?.careCategory || "Selecione um paciente na lista";

  return (
    <div className="patients-summary">
      <KPI className="card" label="Base total" value={patients.length} helper="cadastros carregados" />
      <KPI className="card" label="Resultado filtrado" value={filteredPatients.length} helper="prontos para triagem e acompanhamento" />
      <KPI className={`card ${incompleteCount ? "kpi--warning" : "kpi--success"}`}>
        <span className="kpi__label">Cadastros incompletos</span>
        <strong className="kpi__value">{incompleteCount}</strong>
        <span className="kpi__helper">
          <Badge tone={incompleteCount ? "warning" : "success"}>{incompleteCount ? "Atenção" : "Em dia"}</Badge>
        </span>
      </KPI>
      <KPI className="card">
        <span className="kpi__label">Paciente selecionado</span>
        <strong className="kpi__value patients-summary__value--name">{selectedPatient?.name || "Nenhum selecionado"}</strong>
        <span className="kpi__helper">{selectedCategory}</span>
      </KPI>
      <KPI className="card" label="Condições crônicas" value={chronicCount} helper="pacientes com regra ativa" />
    </div>
  );
}
