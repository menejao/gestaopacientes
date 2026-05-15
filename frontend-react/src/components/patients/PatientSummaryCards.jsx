import Card from "../ui/Card";
import Badge from "../ui/Badge";

export default function PatientSummaryCards({ patients, filteredPatients, selectedPatient }) {
  const incompleteCount = filteredPatients.filter((patient) => patient.incompleteProfile).length;
  const chronicCount = filteredPatients.filter((patient) => (patient.chronicConditions || []).length > 0).length;

  return (
    <div className="patients-summary">
      <Card>
        <span className="patients-summary__label">Base total</span>
        <strong className="patients-summary__value">{patients.length}</strong>
        <span className="patients-summary__hint">cadastros carregados</span>
      </Card>
      <Card>
        <span className="patients-summary__label">Resultado filtrado</span>
        <strong className="patients-summary__value">{filteredPatients.length}</strong>
        <span className="patients-summary__hint">prontos para triagem e acompanhamento</span>
      </Card>
      <Card>
        <span className="patients-summary__label">Cadastros incompletos</span>
        <strong className="patients-summary__value">{incompleteCount}</strong>
        <Badge tone={incompleteCount ? "warning" : "success"}>{incompleteCount ? "Atenção" : "Em dia"}</Badge>
      </Card>
      <Card>
        <span className="patients-summary__label">Paciente selecionado</span>
        <strong className="patients-summary__value patients-summary__value--name">{selectedPatient?.name || "Nenhum selecionado"}</strong>
        <span className="patients-summary__hint">{selectedPatient?.careCategory || "Selecione um paciente na lista"}</span>
      </Card>
      <Card>
        <span className="patients-summary__label">Condições crônicas</span>
        <strong className="patients-summary__value">{chronicCount}</strong>
        <span className="patients-summary__hint">pacientes com regra ativa</span>
      </Card>
    </div>
  );
}
