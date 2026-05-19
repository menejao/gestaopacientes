import { withDb } from "../db.js";
import { ensureDbShape } from "../utils/domain.js";
import { hashPassword } from "./crypto.js";

const TEAM_ID = "team-rosa";
const TEAM_NAME = "Equipe Rosa";
const JOAO_ID = "seed-user-joao";
const DRA_ID = "seed-user-dra";
const ACS_ID = "seed-user-acs";
const ENF_ID = "seed-user-enf";

function upsert(arr, item) {
  const idx = arr.findIndex((x) => x.id === item.id);
  if (idx >= 0) arr[idx] = { ...arr[idx], ...item };
  else arr.push(item);
}

function hasId(arr, id) {
  return arr.some((x) => x.id === id);
}

function dAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function dAhead(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function tsAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const NOW = new Date().toISOString();

// ── Pharmacy stock defaults ────────────────────────────────────────────────

const PHARMACY_ITEMS = [
  { key: "seed-pharm-01", name: "Paracetamol 500mg", category: "Analgésico", unit: "comprimido", qty: 1200, minQty: 200, location: "Prateleira A1" },
  { key: "seed-pharm-02", name: "Dipirona 500mg", category: "Analgésico", unit: "comprimido", qty: 800, minQty: 150, location: "Prateleira A1" },
  { key: "seed-pharm-03", name: "Ibuprofeno 600mg", category: "Anti-inflamatorio", unit: "comprimido", qty: 500, minQty: 100, location: "Prateleira A2" },
  { key: "seed-pharm-04", name: "Amoxicilina 500mg", category: "Antibiotico", unit: "capsula", qty: 400, minQty: 80, location: "Prateleira B1" },
  { key: "seed-pharm-05", name: "Enalapril 10mg", category: "Cardiovascular", unit: "comprimido", qty: 900, minQty: 200, location: "Prateleira C1" },
  { key: "seed-pharm-06", name: "Losartana 50mg", category: "Cardiovascular", unit: "comprimido", qty: 900, minQty: 200, location: "Prateleira C1" },
  { key: "seed-pharm-07", name: "Metformina 850mg", category: "Diabetes", unit: "comprimido", qty: 1000, minQty: 200, location: "Prateleira D1" },
  { key: "seed-pharm-08", name: "Insulina NPH 100UI/mL", category: "Diabetes", unit: "frasco", qty: 80, minQty: 20, location: "Geladeira G1" },
  { key: "seed-pharm-09", name: "Fluoxetina 20mg", category: "Saude Mental", unit: "comprimido", qty: 400, minQty: 80, location: "Prateleira E1" },
  { key: "seed-pharm-10", name: "Salbutamol spray 100mcg", category: "Respiratorio", unit: "frasco", qty: 60, minQty: 15, location: "Prateleira F1" },
  { key: "seed-pharm-11", name: "Sulfato Ferroso 40mg", category: "Gestante", unit: "comprimido", qty: 600, minQty: 120, location: "Prateleira G2" },
  { key: "seed-pharm-12", name: "Omeprazol 20mg", category: "Gastrointestinal", unit: "capsula", qty: 500, minQty: 100, location: "Prateleira A3" },
];

// ── Supplies stock defaults ────────────────────────────────────────────────

const SUPPLIES_ITEMS = [
  { id: "i01", name: "Atadura de Crepe 6 cm", category: "Curativo", unit: "unidade", maxQty: 30, qty: 20 },
  { id: "i02", name: "Atadura de Crepe 10 cm", category: "Curativo", unit: "unidade", maxQty: 30, qty: 15 },
  { id: "i07", name: "Clorexidina Degermante", category: "Antisseptico", unit: "frasco", maxQty: 3, qty: 2 },
  { id: "i08", name: "Compressa Gaze", category: "Curativo", unit: "unidade", maxQty: 180, qty: 120 },
  { id: "i09", name: "Esparadrapo Impermeavel P", category: "Curativo", unit: "rolo", maxQty: 4, qty: 3 },
  { id: "i11", name: "Micropore Pequeno", category: "Curativo", unit: "rolo", maxQty: 4, qty: 4 },
  { id: "i16", name: "Luva P (caixa 100 un)", category: "EPI", unit: "caixa", maxQty: 2, qty: 2 },
  { id: "i17", name: "Luva M (caixa 100 un)", category: "EPI", unit: "caixa", maxQty: 2, qty: 1 },
  { id: "i19", name: "Seringa 20 mL", category: "Seringa", unit: "unidade", maxQty: 60, qty: 40 },
  { id: "i38", name: "Tiras Reagentes Hemoanalise (cx 50 tiras)", category: "Diabetes", unit: "caixa", maxQty: 100, qty: 60 },
  { id: "i39", name: "Micro Lancetas (cx 100 unidades)", category: "Diabetes", unit: "caixa", maxQty: 2, qty: 2 },
  { id: "i41", name: "Agulha para Caneta de Insulina", category: "Diabetes", unit: "unidade", maxQty: 30, qty: 25 },
  { id: "i42", name: "Seringa 1 mL para Insulina", category: "Diabetes", unit: "unidade", maxQty: 60, qty: 50 },
  { id: "i32", name: "Cloreto de Sodio 0,9% para Curativo 500 mL", category: "Soro/Curativo", unit: "frasco", maxQty: 10, qty: 8 },
];

// ── Patient definitions ────────────────────────────────────────────────────

const ALTO_DEFS = [
  { idx: "01", name: "João Carlos Oliveira Santos", birthDate: "1952-03-14", sexAtBirth: "male",   phone: "(11) 98765-0001", address: "Rua das Acácias, 142, apto 3",    cpf: "111.111.001-01" },
  { idx: "02", name: "Maria das Graças Ferreira",   birthDate: "1948-07-22", sexAtBirth: "female", phone: "(11) 98765-0002", address: "Rua dos Ipês, 87",                 cpf: "111.111.002-02" },
  { idx: "03", name: "Antônio Rodrigues da Silva",  birthDate: "1945-11-05", sexAtBirth: "male",   phone: "(11) 98765-0003", address: "Av. Principal, 1450, casa 2",      cpf: "111.111.003-03" },
  { idx: "04", name: "Aparecida Gonçalves Martins", birthDate: "1950-02-18", sexAtBirth: "female", phone: "(11) 98765-0004", address: "Rua da Paz, 33",                   cpf: "111.111.004-04" },
  { idx: "05", name: "José Mendes Carvalho",        birthDate: "1943-09-30", sexAtBirth: "male",   phone: "(11) 98765-0005", address: "Rua São João, 210",                cpf: "111.111.005-05" },
  { idx: "06", name: "Francisca Alves Pereira",     birthDate: "1955-04-07", sexAtBirth: "female", phone: "(11) 98765-0006", address: "Travessa das Flores, 9",           cpf: "111.111.006-06" },
  { idx: "07", name: "Raimundo Nascimento Costa",   birthDate: "1940-12-25", sexAtBirth: "male",   phone: "(11) 98765-0007", address: "Rua do Progresso, 78, casa 1",     cpf: "111.111.007-07" },
  { idx: "08", name: "Maria José Lima Souza",       birthDate: "1953-06-11", sexAtBirth: "female", phone: "(11) 98765-0008", address: "Alameda das Palmeiras, 55",        cpf: "111.111.008-08" },
  { idx: "09", name: "Pedro Henrique Barbosa",      birthDate: "1947-08-03", sexAtBirth: "male",   phone: "(11) 98765-0009", address: "Rua Nova, 320, apto 12",           cpf: "111.111.009-09" },
  { idx: "10", name: "Luiza Fernanda Rocha",        birthDate: "1951-01-19", sexAtBirth: "female", phone: "(11) 98765-0010", address: "Rua das Mangueiras, 41",           cpf: "111.111.010-10" },
];

const MEDIO_DEFS = [
  { idx: "11", name: "Silvio Roberto Araújo",       birthDate: "1945-05-20", sexAtBirth: "male",   phone: "(11) 98765-0011", address: "Rua Antônio Carlos, 99",          cpf: "222.222.011-11", cond: ["hypertension"] },
  { idx: "12", name: "Benedita Conceição Santos",   birthDate: "1948-10-14", sexAtBirth: "female", phone: "(11) 98765-0012", address: "Rua do Horto, 7",                 cpf: "222.222.012-12", cond: ["diabetes"] },
  { idx: "13", name: "Carlos Eduardo Dias",          birthDate: "1952-03-08", sexAtBirth: "male",   phone: "(11) 98765-0013", address: "Av. das Nações, 2100",            cpf: "222.222.013-13", cond: ["hypertension"] },
  { idx: "14", name: "Tereza Cristina Nunes",       birthDate: "1949-07-27", sexAtBirth: "female", phone: "(11) 98765-0014", address: "Rua Primavera, 64",               cpf: "222.222.014-14", cond: ["diabetes"] },
  { idx: "15", name: "Gilberto Ferreira Pinto",     birthDate: "1944-12-02", sexAtBirth: "male",   phone: "(11) 98765-0015", address: "Beco do Moinho, 13",              cpf: "222.222.015-15", cond: ["hypertension"] },
  { idx: "16", name: "Rosa Maria da Silva Cunha",   birthDate: "1953-09-16", sexAtBirth: "female", phone: "(11) 98765-0016", address: "Rua Esperança, 29",               cpf: "222.222.016-16", cond: [] },
  { idx: "17", name: "Arnaldo Borges Moreira",      birthDate: "1941-01-31", sexAtBirth: "male",   phone: "(11) 98765-0017", address: "Rua Vilarinho, 155",              cpf: "222.222.017-17", cond: ["hypertension"] },
  { idx: "18", name: "Lúcia Fátima Cardoso",        birthDate: "1946-04-19", sexAtBirth: "female", phone: "(11) 98765-0018", address: "Av. Getúlio Vargas, 876",         cpf: "222.222.018-18", cond: [] },
  { idx: "19", name: "Nelson Ribeiro Assis",        birthDate: "1944-11-08", sexAtBirth: "male",   phone: "(11) 98765-0019", address: "Rua Marechal, 47",                cpf: "222.222.019-19", cond: ["hypertension"] },
  { idx: "20", name: "Eunice Batista Medeiros",     birthDate: "1950-06-25", sexAtBirth: "female", phone: "(11) 98765-0020", address: "Estrada da Serrinha, 300",        cpf: "222.222.020-20", cond: [] },
];

const BAIXO_DEFS = [
  { idx: "21", name: "Camila Rodrigues Soares",     birthDate: "1992-03-11", sexAtBirth: "female", phone: "(11) 98765-0021", address: "Rua das Acácias, 500",            cpf: "333.333.021-21", cat: "general" },
  { idx: "22", name: "Thiago de Oliveira Braga",    birthDate: "1988-08-23", sexAtBirth: "male",   phone: "(11) 98765-0022", address: "Rua Henrique, 214",               cpf: "333.333.022-22", cat: "general" },
  { idx: "23", name: "Amanda Cristina Lopes",       birthDate: "1995-01-07", sexAtBirth: "female", phone: "(11) 98765-0023", address: "Rua Clementina, 38",              cpf: "333.333.023-23", cat: "general" },
  { idx: "24", name: "Rafael Augusto Teixeira",     birthDate: "1990-05-30", sexAtBirth: "male",   phone: "(11) 98765-0024", address: "Av. Brasil, 1980",                cpf: "333.333.024-24", cat: "general" },
  { idx: "25", name: "Juliana Meireles Costa",      birthDate: "1993-11-15", sexAtBirth: "female", phone: "(11) 98765-0025", address: "Rua Camargo, 71",                 cpf: "333.333.025-25", cat: "general" },
  { idx: "26", name: "Lucas Gabriel Santos",        birthDate: "1997-04-02", sexAtBirth: "male",   phone: "(11) 98765-0026", address: "Rua Floresta, 4",                 cpf: "333.333.026-26", cat: "general" },
  { idx: "27", name: "Beatriz Alves Duarte",        birthDate: "1991-09-18", sexAtBirth: "female", phone: "(11) 98765-0027", address: "Rua do Sol, 127",                 cpf: "333.333.027-27", cat: "general" },
  { idx: "28", name: "Mateus Rodrigo Freitas",      birthDate: "1989-07-04", sexAtBirth: "male",   phone: "(11) 98765-0028", address: "Rua Alegre, 66",                  cpf: "333.333.028-28", cat: "general" },
  { idx: "29", name: "Fernanda Cristina Araújo",   birthDate: "1994-12-22", sexAtBirth: "female", phone: "(11) 98765-0029", address: "Rua Santos Dumont, 310",           cpf: "333.333.029-29", cat: "general" },
  { idx: "30", name: "Diego Henrique Monteiro",     birthDate: "1986-02-14", sexAtBirth: "male",   phone: "(11) 98765-0030", address: "Rua Panorâmica, 19",              cpf: "333.333.030-30", cat: "general" },
];

// Categorias operacionais adicionais
const EXTRA_DEFS = [
  // Gestante
  {
    idx: "preg-01", id: "seed-p-preg-01",
    name: "Ana Beatriz Ferreira Campos", birthDate: "1996-08-14", sexAtBirth: "female",
    phone: "(11) 98765-0101", address: "Rua das Violetas, 52, apto 8", cpf: "444.444.101-01",
    careCategory: "pregnant",
    pregnancyStartDate: (() => { const d = new Date(); d.setDate(d.getDate() - 189); return d.toISOString().slice(0, 10); })(),
    expectedDeliveryDate: (() => { const d = new Date(); d.setDate(d.getDate() + 91); return d.toISOString().slice(0, 10); })(),
    gestationalAgeDumWeeks: 27, gestationalAgeDumDays: 0,
    chronicConditions: [],
  },
  // Puérpera
  {
    idx: "puer-01", id: "seed-p-puer-01",
    name: "Claudia Mendes Rocha", birthDate: "1993-03-22", sexAtBirth: "female",
    phone: "(11) 98765-0102", address: "Rua Dom Pedro II, 118", cpf: "444.444.102-02",
    careCategory: "puerperal",
    chronicConditions: [],
  },
  // Criança em acompanhamento
  {
    idx: "child-01", id: "seed-p-child-01",
    name: "Miguel Oliveira Barbosa", birthDate: (() => { const d = new Date(); d.setDate(d.getDate() - 115); return d.toISOString().slice(0, 10); })(),
    sexAtBirth: "male",
    phone: "(11) 98765-0103", address: "Rua Esperança, 74", cpf: "444.444.103-03",
    motherName: "Juliana Oliveira Barbosa",
    careCategory: "child_followup",
    chronicConditions: [],
  },
];

function buildPatient(def, careCategory, chronicConditions) {
  return {
    id: `seed-p-${def.idx}`,
    teamId: TEAM_ID,
    name: def.name,
    motherName: "",
    cpf: def.cpf,
    cns: "",
    cnsCpf: def.cpf,
    address: def.address,
    phone: def.phone,
    phoneAlt: "",
    microArea: `MA-${Math.ceil(Number(def.idx) / 5)}`,
    assignedAcsId: ACS_ID,
    careCategory,
    chronicConditions,
    maritalStatus: "",
    incompleteProfile: false,
    inactive: false,
    inactivationReason: "",
    sexAtBirth: def.sexAtBirth,
    genderIdentity: "",
    birthDate: def.birthDate,
    comorbidities: chronicConditions.length
      ? chronicConditions.map((c) => (c === "hypertension" ? "Hipertensão Arterial" : "Diabetes Mellitus")).join(", ")
      : "",
    medications: "",
    allergies: "",
    createdAt: tsAgo(180),
    createdBy: JOAO_ID,
    updatedAt: tsAgo(30),
    updatedBy: JOAO_ID,
  };
}

// ── Main seed function ────────────────────────────────────────────────────

export async function seedDemoTeamRosa() {
  if (process.env.SEED_DEMO_DATA !== "true") return { skipped: true };

  console.log("[seed-demo] starting idempotent seed for team-rosa");

  await withDb((db) => {
    ensureDbShape(db);

    // ── Team ─────────────────────────────────────────────────────────────
    if (!db.teams.some((t) => t.id === TEAM_ID)) {
      db.teams.push({ id: TEAM_ID, name: TEAM_NAME, managerUserId: JOAO_ID, createdAt: NOW });
    }

    // ── Users ────────────────────────────────────────────────────────────
    const baseUser = {
      councilType: "", councilNumber: "", councilUf: "",
      twoFactorEnabled: false, twoFactorSecret: "",
      twoFactorPendingSecret: "", twoFactorPendingCreatedAt: "",
      lastLoginAt: "", lastSeenAt: "", lastSeenIp: "",
      createdAt: tsAgo(180), updatedAt: NOW,
    };

    upsert(db.users, {
      ...baseUser,
      id: JOAO_ID,
      name: "João Dev",
      email: "joao@vitras.com.br",
      role: "break_glass_admin",
      teamId: TEAM_ID,
      teamName: TEAM_NAME,
      password: hashPassword("Demo@2026"),
    });

    upsert(db.users, {
      ...baseUser,
      id: DRA_ID,
      name: "Dra. Maria Rosa",
      email: "dra.rosa@vitras.com.br",
      role: "doctor",
      teamId: TEAM_ID,
      teamName: TEAM_NAME,
      password: hashPassword("Demo@2026"),
      councilType: "CRM",
      councilNumber: "88001",
      councilUf: "SP",
    });

    upsert(db.users, {
      ...baseUser,
      id: ACS_ID,
      name: "Lucas ACS",
      email: "lucas.acs@vitras.com.br",
      role: "acs",
      teamId: TEAM_ID,
      teamName: TEAM_NAME,
      password: hashPassword("Demo@2026"),
    });

    upsert(db.users, {
      ...baseUser,
      id: ENF_ID,
      name: "Enf. Patrícia Lima",
      email: "patricia.enf@vitras.com.br",
      role: "nurse_manager",
      teamId: TEAM_ID,
      teamName: TEAM_NAME,
      password: hashPassword("Demo@2026"),
      councilType: "COREN",
      councilNumber: "12345",
      councilUf: "SP",
    });

    // ── Patients ─────────────────────────────────────────────────────────
    for (const def of ALTO_DEFS) {
      upsert(db.patients, buildPatient(def, "elderly", ["hypertension", "diabetes"]));
    }
    for (const def of MEDIO_DEFS) {
      upsert(db.patients, buildPatient(def, "elderly", def.cond || []));
    }
    for (const def of BAIXO_DEFS) {
      upsert(db.patients, buildPatient(def, def.cat || "general", []));
    }
    // Extra: gestante, puérpera, criança
    for (const def of EXTRA_DEFS) {
      upsert(db.patients, {
        ...buildPatient(def, def.careCategory, def.chronicConditions || []),
        ...(def.pregnancyStartDate ? { pregnancyStartDate: def.pregnancyStartDate } : {}),
        ...(def.expectedDeliveryDate ? { expectedDeliveryDate: def.expectedDeliveryDate } : {}),
        ...(def.gestationalAgeDumWeeks != null ? { gestationalAgeDumWeeks: def.gestationalAgeDumWeeks } : {}),
        ...(def.gestationalAgeDumDays != null ? { gestationalAgeDumDays: def.gestationalAgeDumDays } : {}),
        ...(def.motherName ? { motherName: def.motherName } : {}),
      });
    }

    // ── Clinical records ─────────────────────────────────────────────────
    const recDefs = [
      // Alto risco: 2 consultations + 2 visits + 1 vaccine each
      ...ALTO_DEFS.flatMap((def) => [
        { id: `seed-rec-${def.idx}-c1`, patientId: `seed-p-${def.idx}`, type: "consultation", title: "Consulta Médica", details: "Verificação de PA e glicemia. Ajuste de dose de metformina e losartana.", date: dAgo(90), protocolTag: "chronic", createdBy: DRA_ID },
        { id: `seed-rec-${def.idx}-c2`, patientId: `seed-p-${def.idx}`, type: "consultation", title: "Consulta Médica", details: "Paciente refere melhora. Exames solicitados.", date: dAgo(30), protocolTag: "chronic", createdBy: DRA_ID },
        { id: `seed-rec-${def.idx}-v1`, patientId: `seed-p-${def.idx}`, type: "visit", title: "Visita ACS", details: "Visita domiciliar. Paciente em uso regular das medicações.", date: dAgo(60), protocolTag: "chronic", createdBy: ACS_ID },
        { id: `seed-rec-${def.idx}-v2`, patientId: `seed-p-${def.idx}`, type: "visit", title: "Visita ACS", details: "Paciente orientado sobre dieta e exercício.", date: dAgo(15), protocolTag: "chronic", createdBy: ACS_ID },
        { id: `seed-rec-${def.idx}-vc`, patientId: `seed-p-${def.idx}`, type: "vaccine", title: "Influenza", details: "Vacina aplicada sem intercorrências.", date: dAgo(45), protocolTag: "chronic", createdBy: DRA_ID, metadata: { vaccineName: "Influenza" } },
      ]),
      // Médio risco: 1 consultation + 1 visit each
      ...MEDIO_DEFS.flatMap((def) => [
        { id: `seed-rec-${def.idx}-c1`, patientId: `seed-p-${def.idx}`, type: "consultation", title: "Consulta Médica", details: "Avaliação de saúde do idoso. Orientações gerais.", date: dAgo(75), protocolTag: def.cond?.length ? "chronic" : "elderly", createdBy: DRA_ID },
        { id: `seed-rec-${def.idx}-v1`, patientId: `seed-p-${def.idx}`, type: "visit", title: "Visita ACS", details: "Visita domiciliar realizada.", date: dAgo(40), protocolTag: def.cond?.length ? "chronic" : "elderly", createdBy: ACS_ID },
      ]),
      // Baixo risco: 1 record each
      ...BAIXO_DEFS.map((def) => ({
        id: `seed-rec-${def.idx}-c1`, patientId: `seed-p-${def.idx}`, type: "consultation", title: "Consulta Médica", details: "Consulta de rotina. Paciente sem queixas.", date: dAgo(50), protocolTag: def.cat || "general", createdBy: DRA_ID,
      })),
      // Gestante
      { id: "seed-rec-preg-01-c1", patientId: "seed-p-preg-01", type: "consultation", title: "1ª Consulta Pré-natal", details: "Paciente em 8ª semana gestacional. Solicitado painel pré-natal completo. Iniciado ácido fólico 5mg.", date: dAgo(133), protocolTag: "pregnant", createdBy: DRA_ID },
      { id: "seed-rec-preg-01-c2", patientId: "seed-p-preg-01", type: "consultation", title: "Consulta Pré-natal — 2ª consulta", details: "16ª semana. PA 110/70, BCF 142bpm. Morfológico de 1º trimestre normal. Orientações nutricionais.", date: dAgo(77), protocolTag: "pregnant", createdBy: DRA_ID },
      { id: "seed-rec-preg-01-c3", patientId: "seed-p-preg-01", type: "consultation", title: "Consulta Pré-natal — 3ª consulta", details: "24ª semana. PA 115/75, AU 24cm, BCF 138bpm. Teste de tolerância à glicose normal. Movimentos fetais presentes.", date: dAgo(21), protocolTag: "pregnant", createdBy: DRA_ID },
      { id: "seed-rec-preg-01-v1", patientId: "seed-p-preg-01", type: "visit", title: "Visita ACS", details: "Gestante orientada sobre sinais de alerta, caderneta da gestante atualizada.", date: dAgo(56), protocolTag: "pregnant", createdBy: ACS_ID },
      { id: "seed-rec-preg-01-v2", patientId: "seed-p-preg-01", type: "visit", title: "Visita ACS", details: "Verificação de adesão ao pré-natal. Gestante realizando consultas regulares.", date: dAgo(14), protocolTag: "pregnant", createdBy: ACS_ID },
      { id: "seed-rec-preg-01-vac", patientId: "seed-p-preg-01", type: "vaccine", title: "dTpa (gestante)", details: "Vacina antitetânica/pertussis — dose gestante. Sem intercorrências.", date: dAgo(42), protocolTag: "pregnant", createdBy: ENF_ID },
      { id: "seed-rec-preg-01-exam", patientId: "seed-p-preg-01", type: "exam_request", title: "Pedido de exame: USG obstétrica morfológica 2º trim.", details: "USG obstétrica morfológica 2º trimestre + Doppler. Justificativa: acompanhamento pré-natal rotineiro.", date: dAgo(21), protocolTag: "pregnant", createdBy: DRA_ID },
      // Puérpera
      { id: "seed-rec-puer-01-c1", patientId: "seed-p-puer-01", type: "consultation", title: "Consulta Puerperal — 1ª semana", details: "Parto vaginal sem intercorrências. Puérpera com lóquios normais. Amamentação estabelecida. Ferida perineal cicatrizando.", date: dAgo(20), protocolTag: "puerperal", createdBy: DRA_ID },
      { id: "seed-rec-puer-01-c2", patientId: "seed-p-puer-01", type: "consultation", title: "Consulta Puerperal — enfermagem", details: "Avaliação de mama. Amamentação exclusiva. Orientações sobre cuidados com o bebê e coto umbilical.", date: dAgo(14), protocolTag: "puerperal", createdBy: ENF_ID },
      { id: "seed-rec-puer-01-v1", patientId: "seed-p-puer-01", type: "visit", title: "Visita ACS — puerpério", details: "Visita domiciliar no puerpério imediato. Mãe e bebê bem. Orientações sobre sinais de alerta.", date: dAgo(18), protocolTag: "puerperal", createdBy: ACS_ID },
      { id: "seed-rec-puer-01-v2", patientId: "seed-p-puer-01", type: "visit", title: "Visita ACS — puerpério", details: "Confirmação de consulta puerperal agendada. Vacinação do RN verificada.", date: dAgo(10), protocolTag: "puerperal", createdBy: ACS_ID },
      // Criança
      { id: "seed-rec-child-01-c1", patientId: "seed-p-child-01", type: "consultation", title: "Consulta Puericultura — 1ª semana de vida", details: "Triagem neonatal solicitada. Peso 3,250 kg, comprimento 50 cm. Orientações ao responsável sobre amamentação.", date: dAgo(108), protocolTag: "child_followup", createdBy: DRA_ID },
      { id: "seed-rec-child-01-c2", patientId: "seed-p-child-01", type: "consultation", title: "Consulta Puericultura — 1 mês", details: "Peso 4,1 kg. Ganho adequado. BCF, reflexos, fontanela normais. Introdução do banho de sol orientada.", date: dAgo(85), protocolTag: "child_followup", createdBy: DRA_ID },
      { id: "seed-rec-child-01-c3", patientId: "seed-p-child-01", type: "consultation", title: "Consulta Puericultura — 2 meses", details: "Peso 5,2 kg, comprimento 58 cm. Desenvolvimento neurológico dentro do esperado. Sorriso social presente.", date: dAgo(55), protocolTag: "child_followup", createdBy: DRA_ID },
      { id: "seed-rec-child-01-v1", patientId: "seed-p-child-01", type: "visit", title: "Visita ACS — recém-nascido", details: "Visita puerperal. Bebê sendo amamentado exclusivamente. Ambiente domiciliar adequado.", date: dAgo(105), protocolTag: "child_followup", createdBy: ACS_ID },
      { id: "seed-rec-child-01-v2", patientId: "seed-p-child-01", type: "visit", title: "Visita ACS — acompanhamento", details: "Criança ganhando peso. Mãe orientada sobre consulta dos 3 meses e vacinação.", date: dAgo(28), protocolTag: "child_followup", createdBy: ACS_ID },
      { id: "seed-rec-child-01-vac1", patientId: "seed-p-child-01", type: "vaccine", title: "Vacinas 2 meses: Penta + VIP + Pneumo 10 + Rotavirus", details: "Penta (1ª dose), VIP (1ª dose), Pneumo 10 (1ª dose), Rotavírus (1ª dose). Sem intercorrências.", date: dAgo(55), protocolTag: "child_followup", createdBy: ENF_ID },
      { id: "seed-rec-child-01-vac2", patientId: "seed-p-child-01", type: "vaccine", title: "BCG + Hepatite B", details: "BCG (dose única) e Hepatite B (dose ao nascer). Aplicadas na maternidade.", date: dAgo(113), protocolTag: "child_followup", createdBy: ENF_ID },
    ];

    for (const rec of recDefs) {
      if (!hasId(db.clinicalRecords, rec.id)) {
        db.clinicalRecords.push({
          metadata: {},
          ...rec,
          createdAt: `${rec.date}T10:00:00.000Z`,
        });
      }
    }

    // ── Appointments ─────────────────────────────────────────────────────
    const apptDefs = [
      ...ALTO_DEFS.flatMap((def) => [
        { id: `seed-appt-${def.idx}-1`, patientId: `seed-p-${def.idx}`, date: dAgo(90), summary: "Consulta de rotina — HAS e DM", demandType: "scheduled", conduct: "Ajuste de medicação. Retorno em 60 dias.", createdBy: DRA_ID },
        { id: `seed-appt-${def.idx}-2`, patientId: `seed-p-${def.idx}`, date: dAgo(30), summary: "Retorno — resultado de exames", demandType: "scheduled", conduct: "Glicemia controlada. Manter tratamento.", createdBy: DRA_ID },
      ]),
      ...MEDIO_DEFS.map((def) => ({
        id: `seed-appt-${def.idx}-1`, patientId: `seed-p-${def.idx}`, date: dAgo(60), summary: "Consulta de acompanhamento", demandType: "scheduled", conduct: "Paciente estável.", createdBy: DRA_ID,
      })),
      ...BAIXO_DEFS.map((def) => ({
        id: `seed-appt-${def.idx}-1`, patientId: `seed-p-${def.idx}`, date: dAgo(45), summary: "Consulta preventiva", demandType: "spontaneous", conduct: "Sem alterações.", createdBy: DRA_ID,
      })),
      { id: "seed-appt-preg-01-1", patientId: "seed-p-preg-01", date: dAgo(77), summary: "Pré-natal 2ª consulta", demandType: "scheduled", conduct: "Morfológico normal. Continuar suplementação.", nextStep: "Retorno com 24 semanas para TOTG.", createdBy: DRA_ID },
      { id: "seed-appt-preg-01-2", patientId: "seed-p-preg-01", date: dAgo(21), summary: "Pré-natal 3ª consulta", demandType: "scheduled", conduct: "TOTG normal. Ganho de peso adequado.", nextStep: "Retorno com 32 semanas.", createdBy: DRA_ID },
      { id: "seed-appt-puer-01-1", patientId: "seed-p-puer-01", date: dAgo(20), summary: "Consulta puerperal precoce", demandType: "scheduled", conduct: "Puerpério normal. Amamentação exclusiva mantida.", nextStep: "Retorno em 30 dias para consulta puerperal tardia.", createdBy: DRA_ID },
      { id: "seed-appt-child-01-1", patientId: "seed-p-child-01", date: dAgo(85), summary: "Puericultura 1 mês", demandType: "scheduled", conduct: "Desenvolvimento normal. Vacinas em dia.", nextStep: "Consulta dos 2 meses + vacinas.", createdBy: DRA_ID },
      { id: "seed-appt-child-01-2", patientId: "seed-p-child-01", date: dAgo(55), summary: "Puericultura 2 meses + vacinas", demandType: "scheduled", conduct: "Criança saudável. Vacinas 2 meses aplicadas.", nextStep: "Consulta dos 4 meses em breve.", createdBy: DRA_ID },
    ];

    for (const appt of apptDefs) {
      if (!hasId(db.appointments, appt.id)) {
        db.appointments.push({ nextStep: "", ...appt, createdAt: `${appt.date}T09:00:00.000Z` });
      }
    }

    // ── Agenda entries ────────────────────────────────────────────────────
    const agendaDefs = [
      ...ALTO_DEFS.flatMap((def, i) => [
        { id: `seed-ag-${def.idx}-1`, patientId: `seed-p-${def.idx}`, patientName: def.name, date: dAhead(7 + i), time: "08:30", type: "return", status: "scheduled", notes: "Retorno HAS/DM" },
        { id: `seed-ag-${def.idx}-2`, patientId: `seed-p-${def.idx}`, patientName: def.name, date: dAhead(30 + i * 2), time: "09:00", type: "consultation", status: "scheduled", notes: "Consulta periódica" },
      ]),
      ...MEDIO_DEFS.slice(0, 5).map((def, i) => ({
        id: `seed-ag-${def.idx}-1`, patientId: `seed-p-${def.idx}`, patientName: def.name, date: dAhead(14 + i * 3), time: "10:00", type: "return", status: "scheduled", notes: "Retorno idoso",
      })),
    ];

    for (const ag of agendaDefs) {
      if (!hasId(db.agendaEntries, ag.id)) {
        db.agendaEntries.push({
          ...ag,
          teamId: TEAM_ID,
          doctorId: DRA_ID,
          doctorName: "Dra. Maria Rosa",
          incompletePatient: false,
          summary: ag.notes || "Consulta agendada",
          createdAt: NOW,
          createdBy: DRA_ID,
          updatedAt: NOW,
          updatedBy: DRA_ID,
        });
      }
    }

    // ── Referrals ─────────────────────────────────────────────────────────
    const specialties = ["Cardiologia", "Endocrinologia", "Nefrologia", "Oftalmologia"];
    const referralDefs = [
      ...ALTO_DEFS.flatMap((def, i) => [
        { id: `seed-ref-${def.idx}-1`, patientId: `seed-p-${def.idx}`, patientName: def.name, specialty: specialties[i % 4], priority: "priority", status: "pending", date: dAgo(20), reason: "Controle inadequado da pressão arterial. Necessita avaliação especializada." },
        { id: `seed-ref-${def.idx}-2`, patientId: `seed-p-${def.idx}`, patientName: def.name, specialty: "Endocrinologia", priority: "routine", status: i < 5 ? "scheduled" : "pending", date: dAgo(40), reason: "Acompanhamento do diabetes mellitus." },
      ]),
      ...MEDIO_DEFS.slice(0, 5).map((def) => ({
        id: `seed-ref-${def.idx}-1`, patientId: `seed-p-${def.idx}`, patientName: def.name, specialty: "Cardiologia", priority: "routine", status: "pending", date: dAgo(15), reason: "Avaliação cardiológica de rotina.",
      })),
    ];

    for (const ref of referralDefs) {
      if (!hasId(db.referrals, ref.id)) {
        db.referrals.push({
          ...ref,
          teamId: TEAM_ID,
          notes: "",
          doctorId: DRA_ID,
          doctorName: "Dra. Maria Rosa",
          createdAt: `${ref.date}T11:00:00.000Z`,
          createdBy: DRA_ID,
          updatedAt: `${ref.date}T11:00:00.000Z`,
          updatedBy: DRA_ID,
        });
      }
    }

    // ── Exams ─────────────────────────────────────────────────────────────
    const examDefs = [
      ...ALTO_DEFS.flatMap((def) => [
        { id: `seed-exam-${def.idx}-1`, patientId: `seed-p-${def.idx}`, title: "Hemograma Completo", date: dAgo(45), details: "Resultado dentro dos parâmetros normais." },
        { id: `seed-exam-${def.idx}-2`, patientId: `seed-p-${def.idx}`, title: "Glicemia de Jejum", date: dAgo(45), details: "Glicemia: 145 mg/dL. Controle inadequado." },
      ]),
      ...MEDIO_DEFS.slice(0, 5).map((def) => ({
        id: `seed-exam-${def.idx}-1`, patientId: `seed-p-${def.idx}`, title: "Hemograma Completo", date: dAgo(60), details: "Sem alterações relevantes.",
      })),
    ];

    for (const exam of examDefs) {
      if (!hasId(db.exams, exam.id)) {
        db.exams.push({
          ...exam,
          teamId: TEAM_ID,
          attachments: [],
          createdAt: `${exam.date}T08:00:00.000Z`,
          createdBy: DRA_ID,
          updatedAt: `${exam.date}T08:00:00.000Z`,
          updatedBy: DRA_ID,
        });
      }
    }

    // ── Pharmacy stock ────────────────────────────────────────────────────
    if (!db.pharmacyStock.some((i) => i.teamId === TEAM_ID)) {
      for (const item of PHARMACY_ITEMS) {
        db.pharmacyStock.push({
          id: `${item.key}-${TEAM_ID}`,
          teamId: TEAM_ID,
          name: item.name,
          category: item.category,
          unit: item.unit,
          qty: item.qty,
          minQty: item.minQty,
          location: item.location,
          createdAt: tsAgo(60),
          createdBy: JOAO_ID,
          updatedAt: tsAgo(7),
          updatedBy: JOAO_ID,
        });
      }
    }

    // Sample pharmacy dispense logs (idempotent by fixed id)
    const pharmaLogDefs = [
      { id: "seed-pharma-log-1", ts: tsAgo(10), type: "dispensa", itemId: `seed-pharm-06-${TEAM_ID}`, itemName: "Losartana 50mg", patientId: "seed-p-01", patient: "João Carlos Oliveira Santos", prescriberId: DRA_ID, prescriber: "Dra. Maria Rosa", qty: 30, numReceita: "RCP-001", lote: "L2026A" },
      { id: "seed-pharma-log-2", ts: tsAgo(8),  type: "dispensa", itemId: `seed-pharm-07-${TEAM_ID}`, itemName: "Metformina 850mg", patientId: "seed-p-02", patient: "Maria das Graças Ferreira", prescriberId: DRA_ID, prescriber: "Dra. Maria Rosa", qty: 60, numReceita: "RCP-002", lote: "L2026B" },
      { id: "seed-pharma-log-3", ts: tsAgo(5),  type: "dispensa", itemId: `seed-pharm-05-${TEAM_ID}`, itemName: "Enalapril 10mg", patientId: "seed-p-03", patient: "Antônio Rodrigues da Silva", prescriberId: DRA_ID, prescriber: "Dra. Maria Rosa", qty: 30, numReceita: "RCP-003", lote: "L2026A" },
    ];

    for (const log of pharmaLogDefs) {
      if (!hasId(db.pharmacyLogs, log.id)) {
        db.pharmacyLogs.unshift({
          ...log,
          teamId: TEAM_ID,
          pharma: "João Dev",
          pharmaId: JOAO_ID,
          dtReceita: dAgo(12),
        });
      }
    }

    // ── Supplies stock ────────────────────────────────────────────────────
    if (!db.suppliesStock.some((i) => i.teamId === TEAM_ID)) {
      for (const item of SUPPLIES_ITEMS) {
        db.suppliesStock.push({
          id: item.id,
          teamId: TEAM_ID,
          name: item.name,
          category: item.category,
          unit: item.unit,
          maxQty: item.maxQty,
          qty: item.qty,
          notes: item.notes || "",
          createdAt: tsAgo(60),
          createdBy: JOAO_ID,
          updatedAt: tsAgo(7),
          updatedBy: JOAO_ID,
        });
      }
    }

    // Sample supplies dispense log
    const supplyLogDefs = [
      { id: "seed-supply-log-1", type: "dispensa", patientId: "seed-p-01", patientName: "João Carlos Oliveira Santos", continuo: true, items: [{ id: "i41", qty: 30 }, { id: "i42", qty: 30 }], obs: "Uso contínuo de insulina.", date: dAgo(14) },
      { id: "seed-supply-log-2", type: "entrada", itemId: "i38", itemName: "Tiras Reagentes Hemoanalise (cx 50 tiras)", qty: 60, date: dAgo(20) },
    ];

    for (const log of supplyLogDefs) {
      if (!hasId(db.suppliesLogs, log.id)) {
        db.suppliesLogs.unshift({
          ...log,
          id: log.id,
          ts: `${log.date}T14:00:00.000Z`,
          professionalId: JOAO_ID,
          professionalName: "João Dev",
          professionalRole: "break_glass_admin",
          teamId: TEAM_ID,
        });
      }
    }

    // Active continuous supply for patient seed-p-01
    if (!hasId(db.suppliesContinuous, "seed-cont-01")) {
      db.suppliesContinuous.unshift({
        id: "seed-cont-01",
        patientId: "seed-p-01",
        patientName: "João Carlos Oliveira Santos",
        teamId: TEAM_ID,
        items: [{ id: "i41", qty: 30 }, { id: "i42", qty: 30 }],
        profissional: "João Dev",
        dtInicio: dAgo(14),
        dtFim: "",
        ativo: true,
        obs: "Insulinoterapia contínua.",
      });
    }
  });

  console.log("[seed-demo] done");
  return { ok: true };
}
