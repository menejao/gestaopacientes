import Button from "../ui/Button";
import Input from "../ui/Input";

export default function PatientsToolbar({ query, setQuery, onCreate, selectedCount }) {
  return (
    <div className="patients-toolbar">
      <Input
        label="Busca rápida"
        placeholder="Buscar por nome, CPF, CNS ou telefone"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="patients-toolbar__actions">
        <span className="patients-toolbar__meta">{selectedCount} paciente(s)</span>
        <Button variant="primary" onClick={onCreate}>Novo paciente</Button>
      </div>
    </div>
  );
}
