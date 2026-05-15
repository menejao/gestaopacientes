import Badge from "../ui/Badge";
import PatientActions from "./PatientActions";

export default function PatientRow({
  patient,
  selected,
  catLabel,
  calcAge,
  assignedAcsName,
  onSelect,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <tr className={selected ? "is-selected" : ""}>
      <td>
        <button type="button" className="patient-row__link" onClick={() => onSelect(patient.id)}>
          {patient.name}
        </button>
      </td>
      <td>{catLabel([], patient.careCategory)}</td>
      <td>{calcAge(patient.birthDate) || "-"}</td>
      <td>{assignedAcsName || "Não atribuído"}</td>
      <td>
        <div className="patient-row__badges">
          {patient.incompleteProfile ? <Badge tone="warning">Incompleto</Badge> : <Badge tone="success">Completo</Badge>}
          {(patient.chronicConditions || []).includes("diabetes") ? <Badge tone="info">Diabetes</Badge> : null}
          {(patient.chronicConditions || []).includes("hypertension") ? <Badge tone="danger">Hipertensão</Badge> : null}
        </div>
      </td>
      <td>
        <PatientActions patient={patient} onSelect={onSelect} onView={onView} onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
}
