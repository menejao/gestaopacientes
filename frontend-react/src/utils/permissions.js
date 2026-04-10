export function canManage(user) {
  return ["nurse_manager", "doctor", "dentist"].includes(String(user.role || ""));
}

export function isManager(user) {
  return String(user.role || "") === "nurse_manager";
}

export function isAcs(user) {
  return String(user.role || "") === "acs";
}

export function canWriteRecords(user) {
  return ["nurse_manager", "doctor", "dentist", "nursing_tech", "acs"].includes(String(user.role || ""));
}

export function roleLabel(role) {
  return {
    nurse_manager: "Enfermeira",
    doctor: "Medico(a)",
    acs: "ACS",
    pharmacist: "Farmaceutico(a)",
    pharmacy_tech: "Tec. de Farmacia",
    nursing_tech: "Tec. Enfermagem",
    receptionist: "Recepcionista",
    dentist: "Dentista",
    gestor: "Gestor(a) UBS",
  }[String(role || "").toLowerCase()] || role || "-";
}
