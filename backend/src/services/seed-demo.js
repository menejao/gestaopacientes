import { withDb } from "../db.js";
import { ensureDbShape } from "../utils/domain.js";
import { hashPassword } from "./crypto.js";

const TEAM_ID = "team-rosa";
const TEAM_NAME = "Equipe Rosa";
const JOAO_ID = "seed-user-joao";
const DRA_ID = "seed-user-dra";
const ACS_ID = "seed-user-acs";

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
  { idx: "21", name: "Camila Rodrigues Soares",     birthDate: "1992-03-11", sexAtBirth: "female", phone: "(11) 98765-0021", address: "Rua das Acácias, 500",            cpf: "333.333.021-21", cat: "pap_only" },
  { idx: "22", name: "Thiago de Oliveira Braga",    birthDate: "1988-08-23", sexAtBirth: "male",   phone: "(11) 98765-0022", address: "Rua Henrique, 214",               cpf: "333.333.022-22", cat: "general" },
  { idx: "23", name: "Amanda Cristina Lopes",       birthDate: "1995-01-07", sexAtBirth: "female", phone: "(11) 98765-0023", address: "Rua Clementina, 38",              cpf: "333.333.023-23", cat: "general" },
  { idx: "24", name: "Rafael Augusto Teixeira",     birthDate: "1990-05-30", sexAtBirth: "male",   phone: "(11) 98765-0024", address: "Av. Brasil, 1980",                cpf: "333.333.024-24", cat: "general" },
  { idx: "25", name: "Juliana Meireles Costa",      birthDate: "1993-11-15", sexAtBirth: "female", phone: "(11) 98765-0025", address: "Rua Camargo, 71",                 cpf: "333.333.025-25", cat: "pap_only" },
  { idx: "26", name: "Lucas Gabriel Santos",        birthDate: "1997-04-02", sexAtBirth: "male",   phone: "(11) 98765-0026", address: "Rua Floresta, 4",                 cpf: "333.333.026-26", cat: "general" },
  { idx: "27", name: "Beatriz Alves Duarte",        birthDate: "1991-09-18", sexAtBirth: "female", phone: "(11) 98765-0027", address: "Rua do Sol, 127",                 cpf: "333.333.027-27", cat: "general" },
  { idx: "28", name: "Mateus Rodrigo Freitas",      birthDate: "1989-07-04", sexAtBirth: "male",   phone: "(11) 98765-0028", address: "Rua Alegre, 66",                  cpf: "333.333.028-28", cat: "general" },
  { idx: "29", name: "Fernanda Cristina Araújo",   birthDate: "1994-12-22", sexAtBirth: "female", phone: "(11) 98765-0029", address: "Rua Santos Dumont, 310",           cpf: "333.333.029-29", cat: "pap_only" },
  { idx: "30", name: "Diego Henrique Monteiro",     birthDate: "1986-02-14", sexAtBirth: "male",   phone: "(11) 98765-0030", address: "Rua Panorâmica, 19",              cpf: "333.333.030-30", cat: "general" },
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

    // ── Patients ─────────────────────────────────────────────────────────
    for (const def of ALTO_DEFS) {
      upsert(db.patients, buildPatient(def, "chronic", ["hypertension", "diabetes"]));
    }
    for (const def of MEDIO_DEFS) {
      const cat = def.cond?.length ? "chronic" : "elderly";
      upsert(db.patients, buildPatient(def, cat, def.cond || []));
    }
    for (const def of BAIXO_DEFS) {
      upsert(db.patients, buildPatient(def, def.cat || "general", []));
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
    ];

    for (const appt of apptDefs) {
      if (!hasId(db.appointments, appt.id)) {
        db.appointments.push({ ...appt, nextStep: "", createdAt: `${appt.date}T09:00:00.000Z` });
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
