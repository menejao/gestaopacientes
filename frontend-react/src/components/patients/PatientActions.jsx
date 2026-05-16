import { useState } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

const IconDeactivate = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

export default function PatientActions({ patient, onEdit, onDelete }) {
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [justification, setJustification] = useState("");
  const [err, setErr] = useState("");

  function handleConfirm() {
    if (!justification.trim()) {
      setErr("Justificativa é obrigatória para registrar a desativação.");
      return;
    }
    onDelete && onDelete({ ...patient, _deactivate: true, _justification: justification.trim() });
    setShowDeactivate(false);
    setJustification("");
    setErr("");
  }

  function handleClose() {
    setShowDeactivate(false);
    setJustification("");
    setErr("");
  }

  return (
    <>
      <div className="patient-actions">
        <Button variant="ghost" size="sm" onClick={() => onEdit && onEdit(patient)}>
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="patient-actions__deactivate"
          onClick={() => setShowDeactivate(true)}
        >
          <IconDeactivate />
          Desativar
        </Button>
      </div>

      {showDeactivate && (
        <Modal title="Desativar paciente" onClose={handleClose}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <div
              style={{
                display: "flex",
                gap: "var(--s-3)",
                padding: "var(--s-3) var(--s-4)",
                background: "var(--warning-soft)",
                border: "1px solid var(--warning-bd)",
                borderRadius: "var(--r-md)",
                fontSize: "var(--t-sm)",
                color: "var(--text)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1, color: "var(--warning)" }}>
                <path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <span>
                <strong>{patient.name}</strong> será desativado e removido da operação ativa. O registro permanece para fins de auditoria. Ação irreversível sem intervenção do administrador.
              </span>
            </div>

            <div className="field">
              <label className="field__label">Justificativa obrigatória *</label>
              <textarea
                className="input"
                style={{
                  height: "auto",
                  padding: "10px 12px",
                  minHeight: "80px",
                  resize: "vertical",
                  width: "100%",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
                placeholder="Ex.: Transferência para outro município, óbito registrado, solicitação do paciente..."
                value={justification}
                onChange={(e) => { setJustification(e.target.value); setErr(""); }}
                rows={3}
              />
              {err && <span className="field__error">{err}</span>}
            </div>

            <p style={{ fontSize: "var(--t-xs)", color: "var(--text-dim)", margin: 0 }}>
              Esta ação será registrada no log de auditoria com data, hora e identidade do responsável, conforme exigência da LGPD.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-3)" }}>
              <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
              <Button variant="danger" onClick={handleConfirm}>Confirmar desativação</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
