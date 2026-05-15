export function roleLabel(role) {
  return {
    nurse_manager: "Enfermeira",
    doctor: "Médico(a)",
    acs: "ACS",
    pharmacist: "Farmacêutico(a)",
    pharmacy_tech: "Téc. de Farmácia",
    nursing_tech: "Téc. Enfermagem",
    receptionist: "Recepcionista",
    dentist: "Dentista",
    gestor: "Gestor(a)",
  }[String(role || "").toLowerCase()] || role || "-";
}

export function isReceptionist(user) { return String(user?.role || "") === "receptionist"; }
export function isPharmacist(user)   { return ["pharmacist","pharmacy_tech"].includes(String(user?.role || "")); }
export function isNursingTech(user)  { return String(user?.role || "") === "nursing_tech"; }
export function isAdmin(user)        { try { return String(user?.email || "").toLowerCase() === "ana@clinica.local"; } catch { return false; } }
export const isAdminUser = isAdmin;
export function isAcs(user)          { return String(user?.role || "") === "acs"; }
export function canManage(user)      { return ["nurse_manager","doctor","dentist"].includes(String(user?.role || "")); }
export function isManager(user)      { return String(user?.role || "") === "nurse_manager"; }
export function isGestor(user)       { return String(user?.role || "") === "gestor"; }
export function canWriteRecords(user) { return ["nurse_manager","doctor","dentist","nursing_tech","acs"].includes(String(user?.role || "")); }
export function canAccessAI(user)    { return ["nurse_manager","doctor","dentist"].includes(String(user?.role || "")) || isAdmin(user); }
export function canAccessChart(user) { return ["nurse_manager","doctor","dentist"].includes(String(user?.role || "")); }
