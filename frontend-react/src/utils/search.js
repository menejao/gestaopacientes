export function normalizeSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function matchesPatientSearch(patient, rawQuery) {
  const q = normalizeSearch(rawQuery);
  if (!q) return true;
  const qDigits = q.replace(/\D/g, "");
  const name = normalizeSearch(patient.name);
  const cpf = String(patient.cpf || "").replace(/\D/g, "");
  const phone = String(patient.phone || "").replace(/\D/g, "");
  return (
    name.includes(q) ||
    (qDigits.length >= 3 && cpf.includes(qDigits)) ||
    (qDigits.length >= 3 && phone.includes(qDigits))
  );
}
