import { useState } from "react";
import { writeLS, auditLog } from "../utils/storage";
import { isPharmacist, isAdmin, isAdminUser } from "../utils/roles";
import { gestationalAgeInfo, calcAge } from "../utils/clinical";
import { initials, fmtDate, formatCouncil } from "../utils/formatting";
import { PHARMA_USERS } from "../config/constants";
import PageHeader from "../components/layout/PageHeader";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Modal from "../components/ui/Modal";
import { Tabs, Tab } from "../components/ui/Tabs";

const PHARMACY_KEY   = "saudeubs_pharmacy_v1";
const PHARMA_LOG_KEY = "saudeubs_pharmalog_v1";
const PHARMA_AUTH_KEY = "saudeubs_pharmaauth_v1";

const DEFAULT_STOCK = [
  // Analgésicos / Antitérmicos
  { id:"s01", name:"Paracetamol 500mg",          category:"Analgésico",       unit:"comprimido", qty:1200, minQty:200, location:"Prateleira A1" },
  { id:"s02", name:"Dipirona 500mg",              category:"Analgésico",       unit:"comprimido", qty:800,  minQty:150, location:"Prateleira A1" },
  { id:"s03", name:"Ibuprofeno 600mg",            category:"Anti-inflamatório",unit:"comprimido", qty:500,  minQty:100, location:"Prateleira A2" },
  // Antibióticos
  { id:"s04", name:"Amoxicilina 500mg",           category:"Antibiótico",      unit:"cápsula",    qty:400,  minQty:80,  location:"Prateleira B1" },
  { id:"s05", name:"Azitromicina 500mg",          category:"Antibiótico",      unit:"comprimido", qty:200,  minQty:50,  location:"Prateleira B1" },
  { id:"s06", name:"Ciprofloxacino 500mg",        category:"Antibiótico",      unit:"comprimido", qty:180,  minQty:40,  location:"Prateleira B2" },
  // Cardiovascular / HAS
  { id:"s07", name:"Enalapril 10mg",              category:"Cardiovascular",   unit:"comprimido", qty:900,  minQty:200, location:"Prateleira C1" },
  { id:"s08", name:"Losartana 50mg",              category:"Cardiovascular",   unit:"comprimido", qty:900,  minQty:200, location:"Prateleira C1" },
  { id:"s09", name:"Atenolol 25mg",               category:"Cardiovascular",   unit:"comprimido", qty:600,  minQty:100, location:"Prateleira C2" },
  { id:"s10", name:"Hidroclorotiazida 25mg",      category:"Cardiovascular",   unit:"comprimido", qty:700,  minQty:150, location:"Prateleira C2" },
  { id:"s11", name:"Amlodipino 5mg",              category:"Cardiovascular",   unit:"comprimido", qty:500,  minQty:100, location:"Prateleira C3" },
  // Diabetes
  { id:"s12", name:"Metformina 850mg",            category:"Diabetes",         unit:"comprimido", qty:1000, minQty:200, location:"Prateleira D1" },
  { id:"s13", name:"Glibenclamida 5mg",           category:"Diabetes",         unit:"comprimido", qty:500,  minQty:100, location:"Prateleira D1" },
  { id:"s14", name:"Insulina NPH 100UI/mL",       category:"Diabetes",         unit:"frasco",     qty:80,   minQty:20,  location:"Geladeira G1"  },
  { id:"s15", name:"Insulina Regular 100UI/mL",   category:"Diabetes",         unit:"frasco",     qty:40,   minQty:10,  location:"Geladeira G1"  },
  // Saúde Mental
  { id:"s16", name:"Fluoxetina 20mg",             category:"Saúde Mental",     unit:"comprimido", qty:400,  minQty:80,  location:"Prateleira E1" },
  { id:"s17", name:"Amitriptilina 25mg",          category:"Saúde Mental",     unit:"comprimido", qty:300,  minQty:60,  location:"Prateleira E1" },
  { id:"s18", name:"Haloperidol 5mg",             category:"Saúde Mental",     unit:"comprimido", qty:150,  minQty:30,  location:"Prateleira E2" },
  { id:"s19", name:"Diazepam 5mg",                category:"Saúde Mental",     unit:"comprimido", qty:200,  minQty:40,  location:"Prateleira E2" },
  // Respiratório
  { id:"s20", name:"Salbutamol spray 100mcg",     category:"Respiratório",     unit:"frasco",     qty:60,   minQty:15,  location:"Prateleira F1" },
  { id:"s21", name:"Budesonida spray 200mcg",     category:"Respiratório",     unit:"frasco",     qty:40,   minQty:10,  location:"Prateleira F1" },
  { id:"s22", name:"Loratadina 10mg",             category:"Alergia",          unit:"comprimido", qty:400,  minQty:80,  location:"Prateleira F2" },
  // Gestantes
  { id:"s23", name:"Sulfato Ferroso 40mg",        category:"Gestante",         unit:"comprimido", qty:600,  minQty:120, location:"Prateleira G2" },
  { id:"s24", name:"Ácido Fólico 5mg",            category:"Gestante",         unit:"comprimido", qty:600,  minQty:120, location:"Prateleira G2" },
  // Gastrointestinal
  { id:"s25", name:"Omeprazol 20mg",              category:"Gastrointestinal", unit:"cápsula",    qty:500,  minQty:100, location:"Prateleira A3" },
  { id:"s26", name:"Metoclopramida 10mg",         category:"Gastrointestinal", unit:"comprimido", qty:300,  minQty:60,  location:"Prateleira A3" },
  { id:"s27", name:"Soro Fisiológico 0,9% 500mL", category:"Soros",           unit:"bolsa",      qty:50,   minQty:10,  location:"Armário S1"   },
  // Outros
  { id:"s28", name:"Vitamina D3 1000UI",          category:"Suplemento",       unit:"comprimido", qty:300,  minQty:60,  location:"Prateleira H1" },
  { id:"s29", name:"Clonazepam 2mg",              category:"Saúde Mental",     unit:"comprimido", qty:180,  minQty:30,  location:"Prateleira E3" },
  { id:"s30", name:"Sinvastatina 20mg",           category:"Cardiovascular",   unit:"comprimido", qty:700,  minQty:150, location:"Prateleira C4" },
];

function readPharmacyStock() {
  try { const r = localStorage.getItem(PHARMACY_KEY); return r ? JSON.parse(r) : DEFAULT_STOCK.map(i=>({...i})); } catch { return DEFAULT_STOCK.map(i=>({...i})); }
}
function savePharmacyStock(stock) { writeLS(PHARMACY_KEY, stock); }
function readPharmaLog() {
  try { const r = localStorage.getItem(PHARMA_LOG_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function savePharmaLog(log) { writeLS(PHARMA_LOG_KEY, log); }
function readPharmaSession() {
  try { const r = localStorage.getItem(PHARMA_AUTH_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function savePharmaSession(s) {
  try { if (s) localStorage.setItem(PHARMA_AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(PHARMA_AUTH_KEY); } catch {}
}

const PHARMA_CATEGORIES = [
  "Todas","Analgésico","Anti-inflamatório","Antibiótico","Cardiovascular",
  "Diabetes","Saúde Mental","Respiratório","Alergia","Gestante",
  "Gastrointestinal","Soros","Suplemento",
];

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconPrint = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M4 5V2h8v3M2 5h12v7H2z" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M4 10h8M4 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M4 5h8" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

const IconPharmacy = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1l1.5 3h3l-2.5 2 1 3L8 7.5 5 9l1-3L3.5 4h3L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M3 12h10M5 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconWarning = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <path d="M8 1l6.5 13H1.5L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

function stockStatusClass(item) {
  if (item.qty === 0) return "zero";
  if (item.qty <= item.minQty) return "low";
  return "ok";
}

function logTypeBadge(type) {
  const labels = { dispensa:"Dispensação", ajuste:"Ajuste", cadastro:"Cadastro", edicao:"Edição" };
  return (
    <span className={`pharma-log-badge pharma-log-badge--${type || "default"}`}>
      {labels[type] || type}
    </span>
  );
}

function fmtTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
}

/* ══════════════════════════════════════════════════════════════
   CARTÃO DO PACIENTE — Resumo imprimível
══════════════════════════════════════════════════════════════ */
function PatientCardModal({ patient, users, templates, history, onClose }) {
  const acsName  = users.find(u => u.id === patient.assignedAcsId)?.name || "Não atribuído";
  const g        = gestationalAgeInfo(patient);
  const vaccines = (history || []).filter(h => String(h.type || "").toLowerCase() === "vaccine");
  const meds     = String(patient.medications || "").trim();
  const allergies = String(patient.allergies || "").trim();
  const comorbid = String(patient.comorbidities || "").trim();
  const today    = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });
  const catName  = templates.find(t => t.category === patient.careCategory)?.label || patient.careCategory || "Geral";

  return (
    <Modal
      title="Cartão do Paciente"
      onClose={onClose}
      className="modal--wide"
      actions={
        <>
          <Button variant="secondary" onClick={() => window.print()}>
            <IconPrint /> Imprimir
          </Button>
          <Button onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <div className="pharma-pat-card">

        {/* Header */}
        <div className="pharma-pat-card__header">
          <Avatar name={patient.name} size="lg" />
          <div style={{ flex: 1 }}>
            <div className="pharma-pat-card__name">{patient.name}</div>
            <div className="pharma-pat-card__meta-row">
              {patient.birthDate && <span>Nasc.: {fmtDate(patient.birthDate)}{calcAge(patient.birthDate) ? " · " + calcAge(patient.birthDate) : ""}</span>}
              {patient.cpf && <span>CPF: {patient.cpf}</span>}
              {patient.cns && <span>CNS: {patient.cns}</span>}
              {patient.sex && <span>Sexo: {patient.sex}</span>}
            </div>
          </div>
          <div className="pharma-pat-card__aside">
            <div className="pharma-pat-card__aside-cat">{catName}</div>
            <div>ACS: {acsName}</div>
            {g && String(patient.careCategory || "").toLowerCase() === "pregnant" && (
              <div className="pharma-pat-card__aside-ig">IG: {g.weeks}s{g.days}d ({g.source})</div>
            )}
          </div>
        </div>

        {/* Grid de info */}
        <div className="pharma-pat-card__grid">
          <div>
            <div className="pharma-pat-card__section-title">Contato</div>
            <div className="pharma-pat-card__section-body">
              {patient.phone && <span>{patient.phone}</span>}
              {patient.phoneAlt && <span>{patient.phoneAlt}</span>}
              {(patient.address || patient.city) && (
                <span>{[patient.address, patient.number, patient.neighborhood, patient.city, patient.state].filter(Boolean).join(", ")}</span>
              )}
            </div>
          </div>
          <div>
            <div className="pharma-pat-card__section-title">Dados Clínicos</div>
            <div className="pharma-pat-card__section-body">
              {allergies
                ? <span className="pharma-pat-card__allergy">Alergias: {allergies}</span>
                : <span className="pharma-pat-card__no-data">Sem alergias registradas</span>}
              {comorbid && <span>{comorbid}</span>}
            </div>
          </div>
        </div>

        {/* Medicamentos */}
        {meds && (
          <div className="pharma-pat-card__meds">
            <div className="pharma-pat-card__meds-title">Medicamentos em uso</div>
            <div className="pharma-pat-card__meds-body">{meds}</div>
          </div>
        )}

        {/* Vacinas aplicadas */}
        {vaccines.length > 0 && (
          <div className="pharma-pat-card__vaccines">
            <div className="pharma-pat-card__vacc-title">Vacinas registradas</div>
            <div className="pharma-pat-card__vacc-list">
              {vaccines.slice(0, 12).map((v, i) => (
                <span key={i} className="pharma-pat-card__vacc-pill">
                  {v.title}{v.date ? ` (${fmtDate(v.date)})` : ""}
                </span>
              ))}
              {vaccines.length > 12 && (
                <span className="pharma-pat-card__vacc-more">+{vaccines.length - 12} mais</span>
              )}
            </div>
          </div>
        )}

        {/* Gestação */}
        {String(patient.careCategory || "").toLowerCase() === "pregnant" && (
          <div className="pharma-pat-card__pregnancy">
            <div className="pharma-pat-card__pregnancy-title">Gestação</div>
            <div className="pharma-pat-card__pregnancy-data">
              {patient.pregnancyStartDate && <span>DUM: {fmtDate(patient.pregnancyStartDate)}</span>}
              {patient.expectedDeliveryDate && <span>DPP: {fmtDate(patient.expectedDeliveryDate)}</span>}
              {g && <strong>IG estimada: {g.weeks}s {g.days}d</strong>}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="pharma-pat-card__footer">
          <span>Unidade Básica de Saúde</span>
          <span>Emitido em {today}</span>
        </div>

      </div>
    </Modal>
  );
}

/* ── Pharmacy Login Modal ── */
function PharmaLoginModal({ onLogin, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw]       = useState("");
  const [err, setErr]     = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !pw.trim()) { setErr("Informe e-mail e senha."); return; }
    try {
      const res = await fetch("/auth/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw }),
      });
      if (!res.ok) { setErr("E-mail ou senha incorretos."); return; }
      const data = await res.json();
      const meta = PHARMA_USERS.find(p => p.email.toLowerCase() === email.trim().toLowerCase());
      onLogin({ ...(meta || {}), ...data.user, _token: data.token });
    } catch { setErr("Erro de conexão. Tente novamente."); }
  }

  return (
    <Modal
      title={
        <div className="pharma-login-brand">
          <div className="pharma-login-brand__icon"><IconPharmacy /></div>
          <div>
            <div className="pharma-login-brand__title">Farmácia — Acesso Restrito</div>
            <div className="pharma-login-brand__sub">Farmacêutico(a) ou Téc. de Farmácia</div>
          </div>
        </div>
      }
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="pharma-login-form">Entrar na Farmácia</Button>
        </>
      }
    >
      <form id="pharma-login-form" onSubmit={submit} className="field-grid field-grid--no-pad">
        <Input
          className="field--span-2"
          label="E-mail"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="farmacia@ubs.local"
          autoFocus
        />
        <Input
          className="field--span-2"
          label="Senha"
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="••••••••"
        />
        {err && <p className="error field--span-2">{err}</p>}
      </form>
    </Modal>
  );
}

/* ── Dispense Modal ── */
function DispenseModal({ item, pharmaUser, onConfirm, onClose }) {
  const [pw, setPw]                       = useState("");
  const [qty, setQty]                     = useState(1);
  const [patient, setPatient]             = useState("");
  const [prescriber, setPrescriber]       = useState("");
  const [prescriberCouncil, setPrescriberCouncil] = useState("");
  const [numReceita, setNumReceita]       = useState("");
  const [lote, setLote]                   = useState("");
  const [dtReceita, setDtReceita]         = useState("");
  const [notes, setNotes]                 = useState("");
  const [err, setErr]                     = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Digite sua senha para confirmar."); return; }
    let pwValid = false;
    try {
      const res = await fetch("/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email:pharmaUser.email, password:pw }) });
      pwValid = res.ok;
    } catch { pwValid = false; }
    if (!pwValid) { setErr("Senha incorreta."); return; }
    if (qty < 1 || qty > item.qty) { setErr(`Quantidade inválida (máx. ${item.qty}).`); return; }
    if (!patient.trim()) { setErr("Informe o nome do paciente."); return; }
    if (!prescriber.trim()) { setErr("Informe o nome do prescritor."); return; }
    if (!prescriberCouncil.trim()) { setErr("Informe o número do conselho do prescritor (ANVISA RDC 20/2011)."); return; }
    const councilDigits = prescriberCouncil.replace(/\D/g,"");
    if (councilDigits.length < 4 || councilDigits.length > 7) { setErr("Número do conselho inválido."); return; }
    if (!numReceita.trim()) { setErr("Número da receita é obrigatório (ANVISA RDC 20/2011)."); return; }
    if (!dtReceita) { setErr("Data da receita é obrigatória."); return; }
    onConfirm({ qty:Number(qty), patient:patient.trim(), prescriber:prescriber.trim(), prescriberCouncil:prescriberCouncil.trim(), numReceita:numReceita.trim(), lote:lote.trim(), dtReceita, notes:notes.trim() });
  }

  return (
    <Modal
      title="Dispensar medicamento"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="dispense-form">Confirmar Dispensação</Button>
        </>
      }
    >
      <div className="pharma-modal-item">
        <div className="pharma-modal-item__name">{item.name}</div>
        <div className="pharma-modal-item__meta">
          Estoque atual: <strong>{item.qty} {item.unit}(s)</strong> · {item.location}
        </div>
      </div>
      <form id="dispense-form" onSubmit={submit} className="field-grid field-grid--no-pad">
        <span className="pharma-form-section">Paciente e Quantidade</span>
        <Input
          className="field--span-2"
          label="Paciente *"
          value={patient}
          onChange={e => setPatient(e.target.value)}
          placeholder="Nome completo do paciente"
        />
        <Input
          label="Quantidade *"
          type="number"
          min={1}
          max={item.qty}
          value={qty}
          onChange={e => setQty(e.target.value)}
        />
        <Input
          label="Lote do produto"
          value={lote}
          onChange={e => setLote(e.target.value)}
          placeholder="Ex: A1234"
          title="ANVISA — rastreabilidade"
        />
        <span className="pharma-form-section">Receita — ANVISA RDC 20/2011</span>
        <Input
          label="Nº da Receita *"
          value={numReceita}
          onChange={e => setNumReceita(e.target.value)}
          placeholder="Ex: 000123"
        />
        <Input
          label="Data da Receita *"
          type="date"
          value={dtReceita}
          onChange={e => setDtReceita(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
        />
        <Input
          label="Prescritor *"
          value={prescriber}
          onChange={e => setPrescriber(e.target.value)}
          placeholder="Nome do profissional prescritor"
        />
        <Input
          label="Nº Conselho *"
          value={prescriberCouncil}
          onChange={e => setPrescriberCouncil(formatCouncil(e.target.value))}
          placeholder="CRM 00000"
          inputMode="numeric"
          maxLength={10}
        />
        <Input
          className="field--span-2"
          label="Observações / Posologia"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Posologia, orientações..."
        />
        <Input
          className="field--span-2"
          label="Confirmar com sua senha"
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Senha do farmacêutico"
          autoFocus
        />
        {err && <p className="error field--span-2">{err}</p>}
      </form>
    </Modal>
  );
}

/* ── Stock Edit Modal ── */
function StockEditModal({ item, pharmaUser, mode, onConfirm, onClose }) {
  const isNew = mode === "add";
  const [form, setForm] = useState(item ? { ...item } : { name:"", category:"Analgésico", unit:"comprimido", qty:0, minQty:50, location:"" });
  const [pw, setPw]     = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [err, setErr]   = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Senha obrigatória para alterar estoque."); return; }
    let pwValid2 = false;
    try {
      const res = await fetch("/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email:pharmaUser.email, password:pw }) });
      pwValid2 = res.ok;
    } catch { pwValid2 = false; }
    if (!pwValid2) { setErr("Senha incorreta."); return; }
    if (mode === "adjust") {
      if (!reason.trim()) { setErr("Informe o motivo do ajuste."); return; }
      onConfirm({ mode:"adjust", delta:Number(delta), reason:reason.trim() });
    } else {
      if (!form.name.trim()) { setErr("Nome obrigatório."); return; }
      onConfirm({ mode, form });
    }
  }

  const sf = (k, v) => setForm(s => ({ ...s, [k]: v }));
  const title = mode === "add" ? "Novo medicamento" : mode === "adjust" ? "Ajustar estoque" : "Editar medicamento";

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="stock-edit-form">
            {mode === "add" ? "Adicionar ao estoque" : mode === "adjust" ? "Registrar ajuste" : "Salvar alterações"}
          </Button>
        </>
      }
    >
      {mode === "adjust" && (
        <div className="pharma-modal-item">
          <div className="pharma-modal-item__name">{item.name}</div>
          <div className="pharma-modal-item__meta">Estoque atual: {item.qty} {item.unit}(s)</div>
        </div>
      )}
      <form id="stock-edit-form" onSubmit={submit} className="field-grid field-grid--no-pad">
        {mode === "adjust" ? (
          <>
            <Input
              className="field--span-2"
              label="Ajuste (positivo = entrada, negativo = saída)"
              type="number"
              value={delta}
              onChange={e => setDelta(e.target.value)}
              placeholder="Ex: 100 ou -20"
            />
            <Input
              className="field--span-2"
              label="Motivo do ajuste *"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: recebimento de lote, vencimento, inventário..."
            />
          </>
        ) : (
          <>
            <Input
              className="field--span-2"
              label="Nome do medicamento *"
              value={form.name}
              onChange={e => sf("name", e.target.value)}
              placeholder="Ex: Paracetamol 500mg"
            />
            <Select label="Categoria" value={form.category} onChange={e => sf("category", e.target.value)}>
              {PHARMA_CATEGORIES.filter(c => c !== "Todas").map(c => <option key={c}>{c}</option>)}
            </Select>
            <Select label="Unidade" value={form.unit} onChange={e => sf("unit", e.target.value)}>
              {["comprimido","cápsula","frasco","bolsa","ampola","sachê","bisnaga"].map(u => <option key={u}>{u}</option>)}
            </Select>
            <Input
              label="Quantidade inicial"
              type="number"
              min={0}
              value={form.qty}
              onChange={e => sf("qty", Number(e.target.value))}
            />
            <Input
              label="Estoque mínimo alerta"
              type="number"
              min={0}
              value={form.minQty}
              onChange={e => sf("minQty", Number(e.target.value))}
            />
            <Input
              className="field--span-2"
              label="Localização (prateleira/geladeira)"
              value={form.location}
              onChange={e => sf("location", e.target.value)}
              placeholder="Ex: Prateleira A1"
            />
          </>
        )}
        <Input
          className="field--span-2"
          label="Confirmar com sua senha"
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Senha do farmacêutico"
        />
        {err && <p className="error field--span-2">{err}</p>}
      </form>
    </Modal>
  );
}

/* ── Main Pharmacy Page ── */
function PharmacyPage({ user }) {
  const autoUser = isAdminUser(user) ? PHARMA_USERS[0]
                 : (isPharmacist(user) ? (PHARMA_USERS.find(p => p.email === user.email) || PHARMA_USERS[1]) : null);
  const [pharmaUser, setPharmaUser] = useState(() => {
    const s = readPharmaSession();
    if (s) return s;
    if (autoUser) return autoUser;
    return null;
  });
  const [showLogin,    setShowLogin]    = useState(false);
  const [stock,        setStock]        = useState(readPharmacyStock);
  const [log,          setLog]          = useState(readPharmaLog);
  const [pharmaTab,    setPharmaTab]    = useState("stock");
  const [catFilter,    setCatFilter]    = useState("Todas");
  const [search,       setSearch]       = useState("");
  const [dispenseItem, setDispenseItem] = useState(null);
  const [editItem,     setEditItem]     = useState(null);
  const [showLowOnly,  setShowLowOnly]  = useState(false);
  const [logSearch,    setLogSearch]    = useState("");

  const isAuthenticated = !!pharmaUser;

  function doLogin(u) { setPharmaUser(u); savePharmaSession(u); setShowLogin(false); }
  function doLogout()  { setPharmaUser(null); savePharmaSession(null); }

  function addLogEntry(entry) {
    const now = new Date();
    const newLog = [{
      ...entry,
      id: Date.now().toString(),
      ts: now.toISOString(),
      tsDisplay: now.toLocaleString("pt-BR", { timeZone:"America/Sao_Paulo" }),
      pharma: pharmaUser?.name || "?",
      pharmaId: pharmaUser?.id || "?",
    }, ...log];
    setLog(newLog);
    savePharmaLog(newLog);
  }

  function handleDispense({ qty, patient, prescriber, prescriberCouncil, numReceita, lote, dtReceita, notes }) {
    const newStock = stock.map(s => s.id === dispenseItem.id ? { ...s, qty: s.qty - qty } : s);
    setStock(newStock);
    savePharmacyStock(newStock);
    addLogEntry({ type:"dispensa", itemId:dispenseItem.id, itemName:dispenseItem.name, qty, patient, prescriber, prescriberCouncil, numReceita, lote, dtReceita, notes });
    auditLog("DISPENSACAO_FARMACIA", { medicamento:dispenseItem.name, qty, patient, prescriber, numReceita, lote });
    setDispenseItem(null);
  }

  function handleStockConfirm({ mode, form, delta, reason }) {
    if (mode === "adjust") {
      const newStock = stock.map(s => s.id === editItem.item.id ? { ...s, qty: Math.max(0, s.qty + Number(delta)) } : s);
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"ajuste", itemId:editItem.item.id, itemName:editItem.item.name, delta:Number(delta), reason });
      auditLog("ESTOQUE_AJUSTADO", { medicamento:editItem.item.name, delta:Number(delta), reason });
    } else if (mode === "add") {
      const newItem = { ...form, id:"s"+Date.now(), qty:Number(form.qty), minQty:Number(form.minQty) };
      const newStock = [...stock, newItem];
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"cadastro", itemName:form.name, qty:Number(form.qty) });
      auditLog("MEDICAMENTO_CADASTRADO", { medicamento:form.name, qty:Number(form.qty) });
    } else {
      const newStock = stock.map(s => s.id === editItem.item.id ? { ...s, ...form, qty:Number(form.qty), minQty:Number(form.minQty) } : s);
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"edicao", itemName:form.name });
      auditLog("MEDICAMENTO_EDITADO", { medicamento:form.name });
    }
    setEditItem(null);
  }

  const lowStock   = stock.filter(s => s.qty <= s.minQty);
  const outStock   = stock.filter(s => s.qty === 0);
  const dispensasHoje = log.filter(l => l.type === "dispensa" && l.ts?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  const filtered = stock.filter(s => {
    if (catFilter !== "Todas" && s.category !== catFilter) return false;
    if (showLowOnly && s.qty > s.minQty) return false;
    if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase()) &&
        !s.category.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const score = s => s.qty === 0 ? 0 : s.qty <= s.minQty ? 1 : 2;
    return score(a) - score(b) || a.name.localeCompare(b.name, "pt-BR");
  });

  const filteredLog = log.filter(l => {
    if (!logSearch.trim()) return true;
    return (l.itemName || "").toLowerCase().includes(logSearch.toLowerCase()) ||
           (l.patient || "").toLowerCase().includes(logSearch.toLowerCase()) ||
           (l.pharma || "").toLowerCase().includes(logSearch.toLowerCase());
  });

  return (
    <div className="pharmacy-page">

      <PageHeader
        eyebrow="Gestão de Medicamentos"
        title="Farmácia UBS"
        subtitle="Controle de estoque, dispensação e rastreabilidade de medicamentos."
        actions={
          isAuthenticated ? (
            <div className="pharma-session">
              <div className="pharma-session__info">
                <div className="pharma-session__name">{pharmaUser.name}</div>
                <div className="pharma-session__sub">Farmacêutico(a) · sessão ativa</div>
              </div>
              <Button variant="ghost" size="sm" onClick={doLogout}>Sair</Button>
            </div>
          ) : (
            <Button onClick={() => setShowLogin(true)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 7v3M8 5.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              Entrar como Farmacêutico
            </Button>
          )
        }
      />

      {/* KPI Cards */}
      <div className="pharma-kpis">
        <div className="kpi card">
          <strong className="kpi__value">{stock.length}</strong>
          <span className="kpi__label">Total de itens</span>
        </div>
        <div className={`kpi card${lowStock.length > 0 ? " kpi--warning" : ""}`}>
          <strong className="kpi__value">{lowStock.length}</strong>
          <span className="kpi__label">Estoque baixo</span>
        </div>
        <div className={`kpi card${outStock.length > 0 ? " kpi--danger" : ""}`}>
          <strong className="kpi__value">{outStock.length}</strong>
          <span className="kpi__label">Sem estoque</span>
        </div>
        <div className="kpi card kpi--info">
          <strong className="kpi__value">{dispensasHoje}</strong>
          <span className="kpi__label">Dispensações hoje</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs>
        <Tab active={pharmaTab === "stock"} onClick={() => setPharmaTab("stock")}>Estoque</Tab>
        <Tab active={pharmaTab === "log"} onClick={() => setPharmaTab("log")}>Log de Movimentações</Tab>
      </Tabs>

      <div className="pharma-body">

        {pharmaTab === "stock" && (
          <>
            {/* Toolbar */}
            <div className="pharma-toolbar">
              <div className="pharma-search">
                <span className="pharma-search__icon"><IconSearch /></span>
                <input
                  className="input pharma-search__input"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar medicamento ou categoria..."
                />
              </div>
              <select className="select" value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ minWidth: 160 }}>
                {PHARMA_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <Button
                variant="ghost"
                size="sm"
                className={showLowOnly ? "is-active" : ""}
                onClick={() => setShowLowOnly(v => !v)}
              >
                {showLowOnly ? "Só baixo" : "Filtrar baixo"}
              </Button>
              {isAuthenticated && (
                <Button size="sm" onClick={() => setEditItem({ item:null, mode:"add" })}>
                  + Novo medicamento
                </Button>
              )}
            </div>

            {/* Table */}
            <div className="card card--noPad overflow-hidden">
              <table className="patients-table" style={{ width:"100%" }}>
                <thead>
                  <tr>
                    <th style={{ width:40, textAlign:"center" }}>Status</th>
                    <th>Medicamento</th>
                    <th>Categoria</th>
                    <th style={{ textAlign:"center" }}>Estoque</th>
                    <th style={{ textAlign:"center" }}>Mínimo</th>
                    <th>Localização</th>
                    {isAuthenticated && <th style={{ textAlign:"center" }}>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={isAuthenticated ? 7 : 6} className="muted small" style={{ textAlign:"center", padding:"2rem" }}>
                        Nenhum medicamento encontrado.
                      </td>
                    </tr>
                  )}
                  {filtered.map(item => {
                    const sc = stockStatusClass(item);
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign:"center" }}>
                          <span className={`pharma-dot pharma-dot--${sc === "ok" ? "ok" : sc}`} title={sc === "zero" ? "Zerado" : sc === "low" ? "Baixo" : "OK"} />
                        </td>
                        <td>
                          <div style={{ fontWeight:600, fontSize:"var(--t-sm)" }}>{item.name}</div>
                          <div className="muted" style={{ fontSize:"var(--t-xs)" }}>{item.unit}</div>
                        </td>
                        <td>
                          <span className="pharma-cat">{item.category}</span>
                        </td>
                        <td style={{ textAlign:"center" }}>
                          <span className={`pharma-qty pharma-qty--${sc}`}>{item.qty}</span>
                        </td>
                        <td className="muted small" style={{ textAlign:"center" }}>{item.minQty}</td>
                        <td className="muted small">{item.location}</td>
                        {isAuthenticated && (
                          <td style={{ textAlign:"center" }}>
                            <div style={{ display:"flex", gap:"var(--s-1)", justifyContent:"center" }}>
                              <Button
                                size="sm"
                                onClick={() => setDispenseItem(item)}
                                disabled={item.qty === 0}
                                title="Dispensar"
                              >
                                Dispensar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditItem({ item, mode:"adjust" })}
                                title="Ajustar estoque"
                              >
                                ± Ajustar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                iconOnly
                                onClick={() => setEditItem({ item, mode:"edit" })}
                                title="Editar"
                              >
                                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!isAuthenticated && (
              <div className="pharma-auth-notice">
                <IconWarning />
                Faça login como farmacêutico para dispensar medicamentos e ajustar o estoque.
              </div>
            )}
          </>
        )}

        {pharmaTab === "log" && (
          <>
            {/* ANVISA RDC 20/2011 notice */}
            <div className="pharma-anvisa-notice">
              <span>
                <strong>ANVISA RDC 20/2011:</strong> A escrituração de dispensação deve ser conservada por no mínimo{" "}
                <strong>5 anos</strong>. Este histórico não pode ser deletado. Para fins de auditoria, todos os registros devem ser exportados e arquivados fisicamente.
              </span>
            </div>

            <div className="pharma-toolbar">
              <div className="pharma-search" style={{ maxWidth: 380 }}>
                <span className="pharma-search__icon"><IconSearch /></span>
                <input
                  className="input pharma-search__input"
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  placeholder="Buscar por medicamento, paciente, nº receita..."
                />
              </div>
              <Button
                onClick={() => {
                  const csv = [
                    "Data/Hora;Tipo;Medicamento;Qtd;Paciente;Prescritor;Conselho;Nº Receita;Data Receita;Lote;Farmacêutico;Obs",
                    ...log.map(l => [l.tsDisplay||l.ts,l.type,l.itemName,l.qty||"",l.patient||"",l.prescriber||"",l.prescriberCouncil||"",l.numReceita||"",l.dtReceita||"",l.lote||"",l.pharma||"",l.notes||""].map(v=>String(v).replace(/;/g,",")).join(";"))
                  ].join("\n");
                  const a = document.createElement("a");
                  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
                  a.download = `dispensacoes_${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                }}
              >
                ⬇️ Exportar CSV (ANVISA)
              </Button>
            </div>

            <div className="card card--noPad overflow-hidden">
              <table className="patients-table" style={{ width:"100%" }}>
                <thead>
                  <tr>
                    <th style={{ width:130 }}>Data / hora</th>
                    <th style={{ width:90 }}>Tipo</th>
                    <th>Medicamento</th>
                    <th>Detalhe / Rastreabilidade</th>
                    <th style={{ width:110 }}>Farmacêutico</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted small" style={{ textAlign:"center", padding:"2rem" }}>
                        Nenhuma movimentação registrada.
                      </td>
                    </tr>
                  )}
                  {filteredLog.map(l => (
                    <tr key={l.id}>
                      <td className="muted" style={{ fontSize:"var(--t-xs)", whiteSpace:"nowrap" }}>{fmtTs(l.ts)}</td>
                      <td>{logTypeBadge(l.type)}</td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:"var(--t-sm)" }}>{l.itemName}</div>
                        {l.lote && <div className="muted" style={{ fontSize:"var(--t-xs)" }}>Lote: {l.lote}</div>}
                      </td>
                      <td style={{ fontSize:"var(--t-xs)", color:"var(--text-muted)" }}>
                        {l.type === "dispensa" && (
                          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                            <span><strong>{l.qty}x</strong> → <strong>{l.patient}</strong></span>
                            {l.prescriber && <span className="muted">Prescritor: {l.prescriber}{l.prescriberCouncil ? ` (${l.prescriberCouncil})` : ""}</span>}
                            {l.numReceita && <span className="muted">Receita nº {l.numReceita}{l.dtReceita ? ` — ${new Date(l.dtReceita+"T12:00:00").toLocaleDateString("pt-BR")}` : ""}</span>}
                            {l.notes && <span className="muted" style={{ fontStyle:"italic" }}>{l.notes}</span>}
                          </div>
                        )}
                        {l.type === "ajuste" && (
                          <>
                            <span style={{ fontWeight:600, color:l.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                              {l.delta >= 0 ? "+" : ""}{l.delta}
                            </span>
                            {l.reason && <span className="muted"> · {l.reason}</span>}
                          </>
                        )}
                        {l.type === "cadastro" && <span>Estoque inicial: {l.qty}</span>}
                        {l.type === "edicao" && <span>Dados atualizados</span>}
                      </td>
                      <td className="muted small">{l.pharma}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showLogin && <PharmaLoginModal onLogin={doLogin} onClose={() => setShowLogin(false)} />}
      {dispenseItem && isAuthenticated && (
        <DispenseModal item={dispenseItem} pharmaUser={pharmaUser} onConfirm={handleDispense} onClose={() => setDispenseItem(null)} />
      )}
      {editItem && isAuthenticated && (
        <StockEditModal item={editItem.item} mode={editItem.mode} pharmaUser={pharmaUser} onConfirm={handleStockConfirm} onClose={() => setEditItem(null)} />
      )}
    </div>
  );
}

export { PharmacyPage as default, PatientCardModal };
