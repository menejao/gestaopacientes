import Table from "../ui/Table";
import PatientRow from "./PatientRow";

export default function PatientsTable({
  patients,
  selectedPatientId,
  catLabel,
  calcAge,
  users,
  onSelect,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <Table className="patients-table">
      <thead>
        <tr>
          <th>Paciente</th>
          <th>Categoria</th>
          <th>Idade</th>
          <th>ACS</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {patients.map((patient) => (
          <PatientRow
            key={patient.id}
            patient={patient}
            selected={selectedPatientId === patient.id}
            catLabel={catLabel}
            calcAge={calcAge}
            assignedAcsName={users.find((user) => user.id === patient.assignedAcsId)?.name}
            onSelect={onSelect}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </tbody>
    </Table>
  );
}
