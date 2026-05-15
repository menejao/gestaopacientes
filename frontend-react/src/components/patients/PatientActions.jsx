import Button from "../ui/Button";

export default function PatientActions({ patient, onSelect, onView, onEdit, onDelete }) {
  return (
    <div className="patient-actions">
      <Button variant="secondary" size="sm" onClick={() => onSelect(patient.id)}>Abrir</Button>
      <Button variant="ghost" size="sm" onClick={() => onView(patient)}>Ver</Button>
      <Button variant="ghost" size="sm" onClick={() => onEdit(patient)}>Editar</Button>
      <Button variant="danger" size="sm" onClick={() => onDelete(patient)}>Excluir</Button>
    </div>
  );
}
