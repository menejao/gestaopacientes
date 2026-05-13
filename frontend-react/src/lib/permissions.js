export function isReceptionist(user)  { return String(user?.role||"")==="receptionist"; }
export function isPharmacist(user)    { return ["pharmacist","pharmacy_tech","admin"].includes(String(user?.role||"")); }
export function isNursingTech(user)   { return String(user?.role||"")==="nursing_tech"; }
export function isAdmin(user)         { return String(user?.role||"")==="admin"; }
export function isAcs(user)           { return String(user?.role||"")==="acs"; }
export function isManager(user)       { return String(user?.role||"")==="nurse_manager"; }
export function isGestor(user)        { return String(user?.role||"")==="gestor"; }

export function canManage(user) { return["nurse_manager","doctor","dentist","admin"].includes(String(user?.role||"")); }
export function canWriteRecords(user)  { return ["nurse_manager","doctor","dentist","nursing_tech","acs","admin"].includes(String(user?.role||"")); }
export function canAccessAI(user)      { return ["nurse_manager","doctor","dentist"].includes(String(user?.role||"")) || isAdmin(user) || isGestor(user); }
export function canAccessChart(user)   { return ["nurse_manager","doctor","dentist","nursing_tech","admin"].includes(String(user?.role||"")); }

export function getScopedUsersByFilter(list, currentUser, predicate) {
  const all = Array.isArray(list) ? list : [];
  const filtered = all.filter((u) => predicate(u));
  if (isGestor(currentUser) || isAdmin(currentUser)) return filtered;
  const teamId = String(currentUser?.teamId || "").trim();
  const teamName = String(currentUser?.teamName || "").trim();
  if (teamId || teamName) {
    return filtered.filter((u) => {
      const sameTeamId = teamId && String(u?.teamId || "").trim() === teamId;
      const sameTeamName = teamName && String(u?.teamName || "").trim() === teamName;
      return sameTeamId || sameTeamName;
    });
  }
  return filtered.filter((u) => String(u?.id || "") === String(currentUser?.id || ""));
}

export function getScopedTeamUsers(list, currentUser, roles) {
  const roleSet = new Set((roles || []).map(String));
  return getScopedUsersByFilter(list, currentUser, (u) => roleSet.has(String(u?.role || "")));
}

export function buildNavItems(user, canManageUser, tenantModules) {
  const admin = isAdmin(user);
  const role = String(user?.role||"");
  const items = [];

  if (isGestor(user) && !admin) {
    items.push({ id:"gestor",      label:"Gestão à Vista", section:"" });
    items.push({ id:"reports",     label:"Relatórios",     section:"" });
    items.push({ id:"ai",          label:"IA Assistida",   section:"" });
    items.push({ id:"team",        label:"Equipe",         section:"Equipe" });
    items.push({ id:"pharmacy",    label:"Farmácia",       section:"Suprimentos" });
    items.push({ id:"insumos",     label:"Insumos",        section:"" });
    return items;
  }

  if (isReceptionist(user) && !admin) {
    items.push({ id:"queue",  label:"Fila / Recepção", section:"Atendimento" });
    items.push({ id:"agenda", label:"Agenda",           section:"" });
    return items;
  }

  if (!isPharmacist(user) || admin) items.push({ id:"dashboard", label:"Painel", section:"" });
  if (!isPharmacist(user) || admin) items.push({ id:"queue",  label:"Fila / Recepção", section:"Atendimento" });
  if (!isPharmacist(user) || admin) items.push({ id:"agenda", label:"Agenda", section:"" });
  if (isNursingTech(user) || isManager(user) || admin) items.push({ id:"triage", label:"Monitoramento", section:"" });

  if (!isPharmacist(user) || admin) items.push({ id:"patients",  label:"Pacientes", section:"Clínico" });
  if (!isPharmacist(user) || admin) items.push({ id:"exams_page", label:"Exames", section:"" });
  if (canManageUser && !isNursingTech(user)) items.push({ id:"protocols", label:"Protocolos", section:"" });
  if (canAccessChart(user) || admin) items.push({ id:"chart", label:"Prontuário", section:"" });
  if (!isPharmacist(user) || admin) items.push({ id:"referrals", label:"Encaminhamentos",  section:"" });
  if (role === "acs") items.push({ id:"acs_tasks", label:"Minhas tarefas", section:"" });

  if (!isPharmacist(user) || admin) items.push({ id:"vaccines",  label:"Vacinas", section:"Preventivo" });
  items.push({ id:"pharmacy", label:"Farmácia", section:"" });
  if (["nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(role) || admin)
    items.push({ id:"insumos", label:"Insumos", section:"" });

  if (!isReceptionist(user)) {
    items.push({ id:"team", label:"Equipe", section:"Equipe" });
  }

  if (canManageUser || admin) items.push({ id:"gestor", label:"Gestão à Vista", section:"Gestão" });
  if (canManageUser || admin) items.push({ id:"reports", label:"Relatórios", section:"" });
  if (admin) items.push({ id:"diagnostics", label:"Diagnósticos", section:"" });
  if (canAccessAI(user)) items.push({ id:"ai", label:"IA Assistida", section:"" });

  if (Array.isArray(tenantModules) && tenantModules.length > 0) {
    return items.filter(item => tenantModules.includes(item.id));
  }
  return items;
}
