const fs = require("fs");

const path = "frontend-react/src/App.jsx";
let raw = fs.readFileSync(path, "utf8");

const start = raw.indexOf("function buildNavItems(user, canManageUser) {");
const end = raw.indexOf("function isChildCategory(category) {");
if (start !== -1 && end !== -1 && end > start) {
  const replacement = `function buildNavItems(user, canManageUser) {
  const admin = isAdmin(user);
  const role = String(user?.role||"");
  const items = [];

  if (isGestor(user) && !admin) {
    items.push({ id:"gestor", label:"Gestão à Vista", section:"" });
    items.push({ id:"reports", label:"Relatórios", section:"" });
    items.push({ id:"diagnostics", label:"Diagnósticos", section:"" });
    items.push({ id:"patients", label:"Pacientes", section:"Visualização" });
    items.push({ id:"ai", label:"IA Assistida", section:"" });
    return items;
  }

  if (isReceptionist(user) && !admin) return items;

  if (!isPharmacist(user) || admin) items.push({ id:"dashboard", label:"Painel", section:"" });

  if (admin) items.push({ id:"queue", label:"Fila / Recepção", section:"Atendimento" });
  if (admin) items.push({ id:"agenda", label:"Agenda", section:"Atendimento" });
  if (isNursingTech(user) || admin) items.push({ id:"triage", label:"Monitoramento", section:"Atendimento" });

  if (!isPharmacist(user) || admin) items.push({ id:"patients", label:"Pacientes", section:"Clínico" });
  if (!isPharmacist(user) || admin) items.push({ id:"exams_page", label:"Exames", section:"" });
  if (canManageUser && !isNursingTech(user)) items.push({ id:"protocols", label:"Protocolos", section:"" });
  if (canAccessChart(user) || admin) items.push({ id:"chart", label:"Prontuário", section:"" });
  if (!isPharmacist(user) || admin) items.push({ id:"referrals", label:"Encaminhamentos", section:"" });
  if (role === "acs") items.push({ id:"acs_tasks", label:"Minhas tarefas", section:"" });

  if (!isPharmacist(user) || admin) items.push({ id:"vaccines", label:"Vacinas", section:"Preventivo" });
  items.push({ id:"pharmacy", label:"Farmácia", section:"" });
  if (["nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(role) || admin) {
    items.push({ id:"insumos", label:"Insumos", section:"" });
  }

  if (canManageUser && !isNursingTech(user)) {
    items.push({ id:"acs", label:"ACS", section:"Equipe" });
    items.push({ id:"doctors", label:"Médicos", section:"" });
  }

  if (canManageUser || admin) items.push({ id:"gestor", label:"Gestão à Vista", section:"Gestão" });
  if (canManageUser || admin) items.push({ id:"reports", label:"Relatórios", section:"" });
  if (canManageUser || admin || isGestor(user)) items.push({ id:"diagnostics", label:"Diagnósticos", section:"" });
  if (canAccessAI(user)) items.push({ id:"ai", label:"IA Assistida", section:"" });

  return items;
}
`;
  raw = raw.slice(0, start) + replacement + raw.slice(end);
}

raw = raw.replace(/const TABS = \[[\s\S]*?\]\.filter\(Boolean\);/m, `const TABS = [
    canDispense && ["dispensar","Nova dispensação"],
    ["estoque","Estoque de insumos"],
    (canDispense||canViewAll) && ["log","Histórico de saídas"],
    ["continuos","Pacientes contínuos"],
  ].filter(Boolean);`);

const replacements = [
  ["GestÃ£o de Insumos", "Gestão de insumos"],
  ["DispensaÃ§Ã£o de Insumos ao Paciente", "Dispensação de insumos ao paciente"],
  ["Controle de saÃ­da, estoque e pacientes contÃ­nuos â€” baseado no formulÃ¡rio DAF/Osasco.", "Controle de saída, estoque e pacientes contínuos — baseado no formulário DAF/Osasco."],
  ["Pacientes contÃ­nuos ativos", "Pacientes contínuos ativos"],
  ["DispensaÃ§Ãµes hoje", "Dispensações hoje"],
  ["Total de dispensaÃ§Ãµes", "Total de dispensações"],
  ['icon:"ðŸ”„"', 'icon:"↻"'],
  ['icon:"ðŸ“‹"', 'icon:"🧾"'],
  ['icon:"ðŸ“¦"', 'icon:"📦"'],
  ['icon:"Ã¢Å¡Â Ã¯Â¸Â"', 'icon:"⚠"']
];

for (const [a, b] of replacements) raw = raw.split(a).join(b);

fs.writeFileSync(path, raw, "utf8");
console.log("ok");

