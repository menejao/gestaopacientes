import { useState } from "react";
import { writeLS, auditLog } from "../utils/storage";
import { isPharmacist, isAdmin, isAdminUser } from "../utils/roles";
import { gestationalAgeInfo, calcAge } from "../utils/clinical";
import { initials, fmtDate, formatCouncil } from "../utils/formatting";
import { PHARMA_USERS } from "../config/constants";
import PageHero from "../components/layout/PageHero";

const PHARMACY_KEY  = "saudeubs_pharmacy_v1";
const PHARMA_LOG_KEY = "saudeubs_pharmalog_v1";
const PHARMA_AUTH_KEY = "saudeubs_pharmaauth_v1";

// Estoque inicial padrão UBS — Rename (Rename of Farmácia Básica Municipal)
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
  try { if(s) localStorage.setItem(PHARMA_AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(PHARMA_AUTH_KEY); } catch {}
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

/* ══════════════════════════════════════════════════════════════════
   CARTÃO DO PACIENTE — Resumo imprimível
══════════════════════════════════════════════════════════════════ */
function PatientCardModal({ patient, users, templates, history, onClose }) {
  const acsName  = users.find(u=>u.id===patient.assignedAcsId)?.name||"Não atribuído";
  const g        = gestationalAgeInfo(patient);
  const vaccines = (history||[]).filter(h=>String(h.type||"").toLowerCase()==="vaccine");
  const meds     = String(patient.medications||"").trim();
  const allergies= String(patient.allergies||"").trim();
  const comorbid = String(patient.comorbidities||"").trim();
  const today    = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const catName  = templates.find(t=>t.category===patient.careCategory)?.label||patient.careCategory||"Geral";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:620,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {/* Toolbar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0}}>Cartão do Paciente</h3>
          <div style={{display:"flex",gap:".5rem"}}>
            <button onClick={()=>window.print()} style={{fontSize:".78rem",padding:".3rem .65rem",display:"flex",alignItems:"center",gap:".35rem"}}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 5V2h8v3M2 5h12v7H2z" stroke="currentColor" strokeWidth="1.3"/><path d="M4 10h8M4 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M4 5h8" stroke="currentColor" strokeWidth="1.2"/></svg>
              Imprimir
            </button>
            <button className="icon-btn" onClick={onClose}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Card content */}
        <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"1.5rem",fontFamily:"system-ui,sans-serif",lineHeight:1.6}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:"1rem",borderBottom:"2px solid var(--teal-500)",paddingBottom:"1rem",marginBottom:"1rem"}}>
            <div className="user-avatar" style={{width:52,height:52,fontSize:"1.25rem",flexShrink:0,background:"var(--teal-600)",color:"#fff"}}>{initials(patient.name)}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:"1.1rem",color:"var(--ink)"}}>{patient.name}</div>
              <div style={{fontSize:".78rem",color:"var(--text-2)",marginTop:".2rem",display:"flex",gap:"1rem",flexWrap:"wrap"}}>
                {patient.birthDate&&<span>Nasc.: {fmtDate(patient.birthDate)}{calcAge(patient.birthDate)?" · "+calcAge(patient.birthDate):""}</span>}
                {patient.cpf&&<span>CPF: {patient.cpf}</span>}
                {patient.cns&&<span>CNS: {patient.cns}</span>}
                {patient.sex&&<span>Sexo: {patient.sex}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",fontSize:".72rem",color:"var(--text-3)"}}>
              <div style={{fontWeight:700,color:"var(--teal-600)",fontSize:".8rem"}}>{catName}</div>
              <div>ACS: {acsName}</div>
              {g&&String(patient.careCategory||"").toLowerCase()==="pregnant"&&<div style={{color:"var(--teal-700)",fontWeight:600}}>IG: {g.weeks}s{g.days}d ({g.source})</div>}
            </div>
          </div>

          {/* Grid de info */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>

            {/* Contato */}
            <div>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Contato</div>
              <div style={{fontSize:".8rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".2rem"}}>
                {patient.phone&&<span>📱 {patient.phone}</span>}
                {patient.phoneAlt&&<span>☎️ {patient.phoneAlt}</span>}
                {(patient.address||patient.city)&&<span>📍 {[patient.address,patient.number,patient.neighborhood,patient.city,patient.state].filter(Boolean).join(", ")}</span>}
              </div>
            </div>

            {/* Clínico */}
            <div>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Dados Clínicos</div>
              <div style={{fontSize:".8rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".2rem"}}>
                {allergies
                  ? <span style={{color:"var(--rose-700)",fontWeight:600}}>⚠️ Alergias: {allergies}</span>
                  : <span style={{color:"var(--text-3)"}}>Sem alergias registradas</span>}
                {comorbid&&<span>🏥 {comorbid}</span>}
              </div>
            </div>
          </div>

          {/* Medicamentos */}
          {meds&&(
            <div style={{marginBottom:"1rem",padding:".65rem .85rem",background:"var(--amber-50)",border:"1px solid #fde68a",borderRadius:"var(--r-md)"}}>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--amber-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".35rem"}}>💊 Medicamentos em uso</div>
              <div style={{fontSize:".8rem",color:"#78350f",whiteSpace:"pre-wrap"}}>{meds}</div>
            </div>
          )}

          {/* Vacinas aplicadas */}
          {vaccines.length>0&&(
            <div style={{marginBottom:"1rem"}}>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>💉 Vacinas registradas</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:".3rem"}}>
                {vaccines.slice(0,12).map((v,i)=>(
                  <span key={i} style={{fontSize:".72rem",padding:".15rem .5rem",borderRadius:999,background:"var(--green-50)",color:"var(--green-700)",border:"1px solid #bbf7d0",fontWeight:600}}>
                    {v.title} {v.date?`(${fmtDate(v.date)})`:""}</span>
                ))}
                {vaccines.length>12&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>+{vaccines.length-12} mais</span>}
              </div>
            </div>
          )}

          {/* Gestação */}
          {String(patient.careCategory||"").toLowerCase()==="pregnant"&&(
            <div style={{padding:".65rem .85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",marginBottom:"1rem"}}>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".35rem"}}>🤰 Gestação</div>
              <div style={{display:"flex",gap:"1.5rem",fontSize:".8rem",color:"var(--teal-800)",flexWrap:"wrap"}}>
                {patient.pregnancyStartDate&&<span>DUM: {fmtDate(patient.pregnancyStartDate)}</span>}
                {patient.expectedDeliveryDate&&<span>DPP: {fmtDate(patient.expectedDeliveryDate)}</span>}
                {g&&<span style={{fontWeight:700}}>IG estimada: {g.weeks}s {g.days}d</span>}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div style={{borderTop:"1px solid var(--border)",paddingTop:".75rem",display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"var(--text-3)"}}>
            <span>Unidade Básica de Saúde</span>
            <span>Emitido em {today}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pharmacy Login Modal ── */
function PharmaLoginModal({ onLogin, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !pw.trim()) { setErr("Informe e-mail e senha."); return; }
    try {
      const res = await fetch("/auth/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw })
      });
      if (!res.ok) { setErr("E-mail ou senha incorretos."); return; }
      const data = await res.json();
      const meta = PHARMA_USERS.find(p => p.email.toLowerCase()===email.trim().toLowerCase());
      const u = { ...(meta||{}), ...data.user, _token: data.token };
      onLogin(u);
    } catch { setErr("Erro de conexão. Tente novamente."); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:360,padding:"1.75rem"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
            <div style={{width:34,height:34,borderRadius:8,background:"var(--teal-600)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3h3l-2.5 2 1 3L8 7.5 5 9l1-3L3.5 4h3L8 1z" stroke="white" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 12h10M5 14h6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:".92rem",color:"var(--ink)"}}>Farmácia — Acesso Restrito</div>
              <div style={{fontSize:".72rem",color:"var(--text-3)"}}>Farmacêutico(a) ou Téc. de Farmácia</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".7rem"}}>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            E-mail
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="farmacia@ubs.local" autoFocus/>
          </label>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            Senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢"/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <button type="submit" style={{marginTop:".25rem"}}>Entrar na Farmácia</button>
        </form>
      </div>
    </div>
  );
}

/* ── Dispense Modal — senha obrigatória ── */
function DispenseModal({ item, pharmaUser, onConfirm, onClose }) {
  const [pw, setPw]            = useState("");
  const [qty, setQty]          = useState(1);
  const [patient, setPatient]  = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [prescriberCouncil, setPrescriberCouncil] = useState("");
  const [numReceita, setNumReceita] = useState("");   // ANVISA RDC 20/2011
  const [lote, setLote]        = useState("");         // ANVISA — rastreabilidade por lote
  const [dtReceita, setDtReceita] = useState("");      // Data da receita
  const [notes, setNotes]      = useState("");
  const [err, setErr]          = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Digite sua senha para confirmar."); return; }
    // Verifica senha via backend para operações sensíveis
    let pwValid = false;
    try {
      const res = await fetch("/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:pharmaUser.email, password:pw}) });
      pwValid = res.ok;
    } catch { pwValid = false; }
    const u = pwValid ? pharmaUser : null;
    if (!u) { setErr("Senha incorreta."); return; }
    if (qty < 1 || qty > item.qty) { setErr(`Quantidade inválida (máx. ${item.qty}).`); return; }
    if (!patient.trim()) { setErr("Informe o nome do paciente."); return; }
    if (!prescriber.trim()) { setErr("Informe o nome do prescritor."); return; }
    if (!prescriberCouncil.trim()) { setErr("Informe o número do conselho do prescritor (ANVISA RDC 20/2011)."); return; }
    const councilDigits = prescriberCouncil.replace(/\D/g,"");
    if (councilDigits.length < 4 || councilDigits.length > 7) { setErr("Número do conselho inválido."); return; }
    if (!numReceita.trim()) { setErr("Número da receita é obrigatório (ANVISA RDC 20/2011)."); return; }
    if (!dtReceita) { setErr("Data da receita é obrigatória."); return; }
    onConfirm({ qty: Number(qty), patient: patient.trim(), prescriber: prescriber.trim(), prescriberCouncil: prescriberCouncil.trim(), numReceita: numReceita.trim(), lote: lote.trim(), dtReceita, notes: notes.trim() });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0,fontSize:".95rem"}}>Dispensar medicamento</h3>
          <button className="icon-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",padding:".65rem .85rem",marginBottom:"1rem"}}>
          <div style={{fontWeight:700,fontSize:".88rem",color:"var(--teal-800)"}}>{item.name}</div>
          <div style={{fontSize:".75rem",color:"var(--teal-700)",marginTop:".15rem"}}>
            Estoque atual: <strong>{item.qty} {item.unit}(s)</strong> · {item.location}
          </div>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".6rem"}}>
          <div style={{fontSize:".67rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",padding:".3rem 0 .1rem"}}>Paciente e Quantidade</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
              Paciente *
              <input value={patient} onChange={e=>setPatient(e.target.value)} placeholder="Nome completo do paciente"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Quantidade *
              <input type="number" min={1} max={item.qty} value={qty} onChange={e=>setQty(e.target.value)}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Lote do produto
              <input value={lote} onChange={e=>setLote(e.target.value)} placeholder="Ex: A1234" title="ANVISA — rastreabilidade"/>
            </label>
          </div>
          <div style={{fontSize:".67rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",padding:".3rem 0 .1rem"}}>Receita — ANVISA RDC 20/2011</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Nº da Receita *
              <input value={numReceita} onChange={e=>setNumReceita(e.target.value)} placeholder="Ex: 000123"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Data da Receita *
              <input type="date" value={dtReceita} onChange={e=>setDtReceita(e.target.value)} max={new Date().toISOString().slice(0,10)}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Prescritor *
              <input value={prescriber} onChange={e=>setPrescriber(e.target.value)} placeholder="Nome do profissional prescritor"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Nº Conselho *
              <input value={prescriberCouncil} onChange={e=>setPrescriberCouncil(formatCouncil(e.target.value))} placeholder="CRM 00000" inputMode="numeric" maxLength={10}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
              Observações / Posologia
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Posologia, orientações..."/>
            </label>
          </div>
          <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:700,color:"var(--text-1)"}}>
            🔐 Confirmar com sua senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Senha do farmacêutico" autoFocus/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
            <button type="button" onClick={onClose} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
            <button type="submit" style={{flex:2}}>Confirmar Dispensação</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Stock Edit Modal ── */
function StockEditModal({ item, pharmaUser, mode, onConfirm, onClose }) {
  // mode: "edit" | "add" | "adjust"
  const isNew = mode === "add";
  const [form, setForm] = useState(item ? {...item} : { name:"", category:"Analgésico", unit:"comprimido", qty:0, minQty:50, location:"" });
  const [pw, setPw]     = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [err, setErr]   = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Senha obrigatória para alterar estoque."); return; }
    let pwValid2 = false;
    try {
      const res = await fetch("/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:pharmaUser.email, password:pw}) });
      pwValid2 = res.ok;
    } catch { pwValid2 = false; }
    const u = pwValid2 ? pharmaUser : null;
    if (!u) { setErr("Senha incorreta."); return; }
    if (mode === "adjust") {
      if (!reason.trim()) { setErr("Informe o motivo do ajuste."); return; }
      onConfirm({ mode:"adjust", delta: Number(delta), reason: reason.trim() });
    } else {
      if (!form.name.trim()) { setErr("Nome obrigatório."); return; }
      onConfirm({ mode, form });
    }
  }

  const sf = (k,v) => setForm(s=>({...s,[k]:v}));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0,fontSize:".95rem"}}>
            {mode==="add"?"Novo medicamento":mode==="adjust"?"Ajustar estoque":"Editar medicamento"}
          </h3>
          <button className="icon-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
          {mode === "adjust" ? (
            <>
              <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:".65rem .85rem",marginBottom:".25rem"}}>
                <div style={{fontWeight:700,fontSize:".88rem"}}>{item.name}</div>
                <div style={{fontSize:".75rem",color:"var(--text-3)"}}>Estoque atual: {item.qty} {item.unit}(s)</div>
              </div>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Ajuste (positivo = entrada, negativo = saída)
                <input type="number" value={delta} onChange={e=>setDelta(e.target.value)} placeholder="Ex: 100 ou -20"/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Motivo do ajuste *
                <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex: recebimento de lote, vencimento, inventário..."/>
              </label>
            </>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
                Nome do medicamento *
                <input value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="Ex: Paracetamol 500mg"/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Categoria
                <select value={form.category} onChange={e=>sf("category",e.target.value)}>
                  {PHARMA_CATEGORIES.filter(c=>c!=="Todas").map(c=><option key={c}>{c}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Unidade
                <select value={form.unit} onChange={e=>sf("unit",e.target.value)}>
                  {["comprimido","cápsula","frasco","bolsa","ampola","sachê","bisnaga"].map(u=><option key={u}>{u}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Quantidade inicial
                <input type="number" min={0} value={form.qty} onChange={e=>sf("qty",Number(e.target.value))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Estoque mínimo alerta
                <input type="number" min={0} value={form.minQty} onChange={e=>sf("minQty",Number(e.target.value))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
                Localização (prateleira/geladeira)
                <input value={form.location} onChange={e=>sf("location",e.target.value)} placeholder="Ex: Prateleira A1"/>
              </label>
            </div>
          )}
          <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:700,color:"var(--text-1)"}}>
            🔐 Confirmar com sua senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Senha do farmacêutico"/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
            <button type="button" onClick={onClose} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
            <button type="submit" style={{flex:2}}>
              {mode==="add"?"Adicionar ao estoque":mode==="adjust"?"Registrar ajuste":"Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Pharmacy Page ── */
function PharmacyPage({ user }) {
  // Se o usuário logado já é farmacêutico, téc. de farmácia ou admin, entra direto
  const autoUser = isAdminUser(user) ? PHARMA_USERS[0]
                 : (isPharmacist(user) ? (PHARMA_USERS.find(p=>p.email===user.email)||PHARMA_USERS[1]) : null);
  const [pharmaUser, setPharmaUser] = useState(()=> {
    const s = readPharmaSession();
    if (s) return s;
    if (autoUser) return autoUser;
    return null;
  });
  // Outros perfis veem tela de acesso negado
  const isBlockedRole = !isAdminUser(user) && !isPharmacist(user);
  const [showLogin,    setShowLogin]    = useState(false);
  const [stock,        setStock]        = useState(readPharmacyStock);
  const [log,          setLog]          = useState(readPharmaLog);
  const [pharmaTab,    setPharmaTab]    = useState("stock"); // stock | log
  const [catFilter,    setCatFilter]    = useState("Todas");
  const [search,       setSearch]       = useState("");
  const [dispenseItem, setDispenseItem] = useState(null);
  const [editItem,     setEditItem]     = useState(null);   // {item, mode}
  const [showLowOnly,  setShowLowOnly]  = useState(false);
  const [logSearch,    setLogSearch]    = useState("");

  const isAuthenticated = !!pharmaUser;

  function doLogin(u) {
    setPharmaUser(u);
    savePharmaSession(u);
    setShowLogin(false);
  }
  function doLogout() {
    setPharmaUser(null);
    savePharmaSession(null);
  }

  function addLogEntry(entry) {
    const now = new Date();
    const newLog = [{
      ...entry,
      id: Date.now().toString(),
      ts: now.toISOString(),
      tsDisplay: now.toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}),
      pharma: pharmaUser?.name || "?",
      pharmaId: pharmaUser?.id || "?",
      // ANVISA — escrituração deve ser rastreável por profissional responsável
    }, ...log];
    setLog(newLog);
    savePharmaLog(newLog);
  }

  function handleDispense({ qty, patient, prescriber, prescriberCouncil, numReceita, lote, dtReceita, notes }) {
    const newStock = stock.map(s =>
      s.id === dispenseItem.id ? { ...s, qty: s.qty - qty } : s
    );
    setStock(newStock);
    savePharmacyStock(newStock);
    addLogEntry({
      type: "dispensa",
      itemId: dispenseItem.id,
      itemName: dispenseItem.name,
      qty, patient, prescriber, prescriberCouncil,
      // ANVISA RDC 20/2011 — campos de rastreabilidade obrigatórios
      numReceita, lote, dtReceita, notes,
    });
    auditLog("DISPENSACAO_FARMACIA", { medicamento:dispenseItem.name, qty, patient, prescriber, numReceita, lote });
    setDispenseItem(null);
  }

  function handleStockConfirm({ mode, form, delta, reason }) {
    if (mode === "adjust") {
      const newStock = stock.map(s =>
        s.id === editItem.item.id ? { ...s, qty: Math.max(0, s.qty + Number(delta)) } : s
      );
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"ajuste", itemId:editItem.item.id, itemName:editItem.item.name, delta:Number(delta), reason });
      auditLog("ESTOQUE_AJUSTADO", { medicamento:editItem.item.name, delta:Number(delta), reason });
    } else if (mode === "add") {
      const newItem = { ...form, id: "s" + Date.now(), qty: Number(form.qty), minQty: Number(form.minQty) };
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
  const totalItems = stock.length;

  const filtered = stock.filter(s => {
    if (catFilter !== "Todas" && s.category !== catFilter) return false;
    if (showLowOnly && s.qty > s.minQty) return false;
    if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase()) &&
        !s.category.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }).sort((a,b) => {
    // Critical (zero) first, then low, then ok
    const score = s => s.qty === 0 ? 0 : s.qty <= s.minQty ? 1 : 2;
    return score(a) - score(b) || a.name.localeCompare(b.name,"pt-BR");
  });

  const filteredLog = log.filter(l => {
    if (!logSearch.trim()) return true;
    return (l.itemName||"").toLowerCase().includes(logSearch.toLowerCase()) ||
           (l.patient||"").toLowerCase().includes(logSearch.toLowerCase()) ||
           (l.pharma||"").toLowerCase().includes(logSearch.toLowerCase());
  });

  function logTypeBadge(type) {
    const map = {
      dispensa: { label:"Dispensação", bg:"var(--blue-50)",  color:"var(--blue-700)", border:"var(--blue-200)" },
      ajuste:   { label:"Ajuste",      bg:"var(--orange-50)",  color:"var(--orange-700)", border:"var(--orange-200)" },
      cadastro: { label:"Cadastro",    bg:"var(--green-50)",  color:"var(--green-700)", border:"var(--green-200)" },
      edicao:   { label:"Edição",      bg:"var(--purple-50)",  color:"var(--purple-800)", border:"var(--purple-200)" },
    };
    const s = map[type] || { label:type, bg:"var(--surface-2)", color:"var(--text-2)", border:"var(--border)" };
    return <span style={{fontSize:".68rem",padding:".1rem .45rem",borderRadius:999,background:s.bg,color:s.color,border:`1px solid ${s.border}`,fontWeight:700,whiteSpace:"nowrap"}}>{s.label}</span>;
  }

  function stockStatusColor(item) {
    if (item.qty === 0) return { bg:"var(--rose-50)", border:"var(--rose-200)", text:"var(--rose-700)", label:"Zerado" };
    if (item.qty <= item.minQty) return { bg:"var(--orange-50)", border:"var(--orange-200)", text:"var(--orange-700)", label:"Baixo" };
    return { bg:"var(--green-50)", border:"var(--green-200)", text:"var(--green-700)", label:"OK" };
  }

  function fmtTs(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <PageHero
        badge="Gestão de Medicamentos"
        title="Farmácia UBS"
        subtitle="Controle de estoque, dispensação e rastreabilidade de medicamentos."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <div style={{display:"flex",alignItems:"center",gap:".75rem",flexShrink:0}}>
            {isAuthenticated ? (
              <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--teal-700)"}}>{pharmaUser.name}</div>
                  <div style={{fontSize:".68rem",color:"var(--text-3)"}}>Farmacêutico(a) · sessão ativa</div>
                </div>
                <button onClick={doLogout} style={{fontSize:".75rem",padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                  Sair
                </button>
              </div>
            ) : (
              <button onClick={()=>setShowLogin(true)} style={{display:"flex",alignItems:"center",gap:".4rem"}}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 7v3M8 5.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                Entrar como Farmacêutico
              </button>
            )}
          </div>
        }
      />

      {/* KPI Cards */}
      <div style={{display:"flex",gap:".75rem",padding:"0 1.5rem .75rem",flexWrap:"wrap"}}>
        {[
          { label:"Total de itens", value:totalItems, icon:"📦", color:"var(--teal-600)" },
          { label:"Estoque baixo",  value:lowStock.length, icon:"⚠️", color:lowStock.length>0?"var(--amber-600)":"var(--text-3)", warn:lowStock.length>0 },
          { label:"Sem estoque",    value:outStock.length, icon:"🚫", color:outStock.length>0?"var(--rose-700)":"var(--text-3)", danger:outStock.length>0 },
          { label:"Dispensações hoje", value:log.filter(l=>l.type==="dispensa"&&l.ts?.slice(0,10)===new Date().toISOString().slice(0,10)).length, icon:"💊", color:"var(--teal-600)" },
        ].map(k => (
          <div key={k.label} className="card" style={{
            flex:"1 1 150px",padding:".85rem 1rem",minWidth:130,
            background:k.danger?"var(--rose-50)":k.warn?"var(--orange-50)":"var(--surface)",
            border:`1px solid ${k.danger?"var(--rose-200)":k.warn?"var(--orange-200)":"var(--border)"}`,
          }}>
            <div style={{fontSize:"1.25rem",lineHeight:1}}>{k.icon}</div>
            <div style={{fontSize:"1.55rem",fontWeight:800,color:k.color,lineHeight:1.1,marginTop:".3rem"}}>{k.value}</div>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".2rem"}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:0}}>
        {[["stock","📋 Estoque"],["log","🗂️ Log de Movimentações"]].map(([id,label])=>(
          <button key={id} onClick={()=>setPharmaTab(id)}
            style={{padding:".55rem 1rem",fontSize:".8rem",fontWeight:600,border:"none",
              background:"transparent",cursor:"pointer",color:pharmaTab===id?"var(--teal-600)":"var(--text-3)",
              borderBottom:pharmaTab===id?"2px solid var(--teal-500)":"2px solid transparent",
              transition:"all .12s"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"1rem 1.5rem 1.5rem"}}>

        {pharmaTab === "stock" && (
          <>
            {/* Toolbar */}
            <div style={{display:"flex",gap:".6rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 200px"}}>
                <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                  <IconSearch/>
                </span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Buscar medicamento ou categoria..."
                  style={{paddingLeft:"1.8rem",width:"100%",boxSizing:"border-box"}}/>
              </div>
              <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{minWidth:160}}>
                {PHARMA_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <button
                onClick={()=>setShowLowOnly(v=>!v)}
                style={{fontSize:".78rem",padding:".38rem .75rem",
                  background:showLowOnly?"var(--orange-50)":"var(--surface-2)",
                  border:`1px solid ${showLowOnly?"var(--orange-200)":"var(--border)"}`,
                  color:showLowOnly?"var(--orange-700)":"var(--text-2)"}}>
                {showLowOnly?"⚠️ Só baixo":"⚠️ Filtrar baixo"}
              </button>
              {isAuthenticated && (
                <button onClick={()=>setEditItem({item:null,mode:"add"})} style={{fontSize:".78rem",padding:".38rem .8rem",flexShrink:0}}>
                  + Novo medicamento
                </button>
              )}
            </div>

            {/* Table */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table className="patients-table" style={{width:"100%"}}>
                <thead>
                  <tr>
                    <th style={{width:40,textAlign:"center"}}>Status</th>
                    <th>Medicamento</th>
                    <th>Categoria</th>
                    <th style={{textAlign:"center"}}>Estoque</th>
                    <th style={{textAlign:"center"}}>Mínimo</th>
                    <th>Localização</th>
                    {isAuthenticated && <th style={{textAlign:"center"}}>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={isAuthenticated?7:6} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum medicamento encontrado.</td></tr>
                  )}
                  {filtered.map(item => {
                    const sc = stockStatusColor(item);
                    return (
                      <tr key={item.id}>
                        <td style={{textAlign:"center"}}>
                          <span title={sc.label} style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:sc.text}}/>
                        </td>
                        <td>
                          <div style={{fontWeight:600,fontSize:".84rem",color:"var(--ink)"}}>{item.name}</div>
                          <div style={{fontSize:".7rem",color:"var(--text-3)"}}>{item.unit}</div>
                        </td>
                        <td>
                          <span style={{fontSize:".71rem",padding:".1rem .4rem",borderRadius:999,background:"var(--surface-2)",color:"var(--text-2)",border:"1px solid var(--border)"}}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{textAlign:"center"}}>
                          <span style={{fontWeight:700,fontSize:".9rem",color:sc.text,
                            background:sc.bg,border:`1px solid ${sc.border}`,
                            padding:".1rem .55rem",borderRadius:999,display:"inline-block"}}>
                            {item.qty}
                          </span>
                        </td>
                        <td style={{textAlign:"center",fontSize:".8rem",color:"var(--text-3)"}}>{item.minQty}</td>
                        <td style={{fontSize:".78rem",color:"var(--text-3)"}}>{item.location}</td>
                        {isAuthenticated && (
                          <td style={{textAlign:"center"}}>
                            <div style={{display:"flex",gap:".3rem",justifyContent:"center",flexWrap:"nowrap"}}>
                              <button onClick={()=>setDispenseItem(item)}
                                disabled={item.qty===0}
                                title="💊 Dispensar"
                                style={{fontSize:".71rem",padding:".25rem .55rem",flexShrink:0,
                                  background:"var(--teal-600)",color:"#fff",border:"none",
                                  opacity:item.qty===0?.4:1}}>
                                💊 Dispensar
                              </button>
                              <button onClick={()=>setEditItem({item,mode:"adjust"})}
                                title="Ajustar estoque"
                                style={{fontSize:".71rem",padding:".25rem .5rem",flexShrink:0,
                                  background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                                ± Ajustar
                              </button>
                              <button onClick={()=>setEditItem({item,mode:"edit"})}
                                title="Editar"
                                style={{fontSize:".71rem",padding:".25rem .5rem",flexShrink:0,
                                  background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                                ✏️
                              </button>
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
              <div style={{marginTop:".75rem",padding:".65rem 1rem",background:"var(--orange-50)",border:"1px solid #fed7aa",borderRadius:"var(--r-md)",fontSize:".78rem",color:"var(--amber-700)",display:"flex",alignItems:"center",gap:".5rem"}}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l6.5 13H1.5L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Faça login como farmacêutico para dispensar medicamentos e ajustar o estoque.
              </div>
            )}
          </>
        )}

        {pharmaTab === "log" && (
          <>
            {/* ANVISA RDC 20/2011 — aviso de retenção obrigatória */}
            <div style={{marginBottom:"1rem",padding:".6rem .85rem",background:"var(--amber-50)",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".73rem",color:"var(--amber-700)",display:"flex",gap:".5rem",alignItems:"flex-start"}}>
              <span style={{flexShrink:0}}>⚖️</span>
              <span><strong>ANVISA RDC 20/2011:</strong> A escrituração de dispensação deve ser conservada por no mínimo <strong>5 anos</strong>. Este histórico não pode ser deletado. Para fins de auditoria, todos os registros devem ser exportados e arquivados fisicamente.</span>
            </div>
            <div style={{marginBottom:"1rem",display:"flex",gap:".65rem",alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,maxWidth:380}}>
                <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                  <IconSearch/>
                </span>
                <input value={logSearch} onChange={e=>setLogSearch(e.target.value)}
                  placeholder="Buscar por medicamento, paciente, nº receita..."
                  style={{paddingLeft:"1.8rem",width:"100%",boxSizing:"border-box"}}/>
              </div>
              <button type="button" onClick={()=>{
                const csv = ["Data/Hora;Tipo;Medicamento;Qtd;Paciente;Prescritor;Conselho;Nº Receita;Data Receita;Lote;Farmacêutico;Obs",
                  ...log.map(l=>[l.tsDisplay||l.ts,l.type,l.itemName,l.qty||"",l.patient||"",l.prescriber||"",l.prescriberCouncil||"",l.numReceita||"",l.dtReceita||"",l.lote||"",l.pharma||"",l.notes||""].map(v=>String(v).replace(/;/g,",")).join(";"))
                ].join("\n");
                const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
                a.download=`dispensacoes_${new Date().toISOString().slice(0,10)}.csv`; a.click();
              }} style={{fontSize:".76rem",padding:".4rem .85rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
                ⬇️ Exportar CSV (ANVISA)
              </button>
            </div>
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table className="patients-table" style={{width:"100%"}}>
                <thead>
                  <tr>
                    <th style={{width:130}}>Data / hora</th>
                    <th style={{width:90}}>Tipo</th>
                    <th>Medicamento</th>
                    <th>Detalhe / Rastreabilidade</th>
                    <th style={{width:110}}>Farmacêutico</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.length === 0 && (
                    <tr><td colSpan={5} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhuma movimentação registrada.</td></tr>
                  )}
                  {filteredLog.map(l => (
                    <tr key={l.id}>
                      <td style={{fontSize:".72rem",color:"var(--text-3)",whiteSpace:"nowrap"}}>{fmtTs(l.ts)}</td>
                      <td>{logTypeBadge(l.type)}</td>
                      <td>
                        <div style={{fontWeight:600,fontSize:".82rem"}}>{l.itemName}</div>
                        {l.lote&&<div style={{fontSize:".68rem",color:"var(--text-3)"}}>Lote: {l.lote}</div>}
                      </td>
                      <td style={{fontSize:".76rem",color:"var(--text-2)"}}>
                        {l.type==="dispensa" && <div style={{display:"flex",flexDirection:"column",gap:".1rem"}}>
                          <span><strong>{l.qty}x</strong> → <strong>{l.patient}</strong></span>
                          {l.prescriber && <span style={{color:"var(--text-3)"}}>Prescritor: {l.prescriber}{l.prescriberCouncil?` (${l.prescriberCouncil})`:""}</span>}
                          {l.numReceita && <span style={{color:"var(--text-3)"}}>Receita nº {l.numReceita}{l.dtReceita?` — ${new Date(l.dtReceita+"T12:00:00").toLocaleDateString("pt-BR")}`:""}</span>}
                          {l.notes && <span style={{color:"var(--text-3)",fontStyle:"italic"}}>{l.notes}</span>}
                        </div>}
                        {l.type==="ajuste" && <>
                          <span style={{fontWeight:600,color:l.delta>=0?"var(--green-700)":"var(--rose-700)"}}>{l.delta>=0?"+":""}{l.delta}</span>
                          {l.reason && <span style={{color:"var(--text-3)"}}> · {l.reason}</span>}
                        </>}
                        {l.type==="cadastro" && <span>Estoque inicial: {l.qty}</span>}
                        {l.type==="edicao" && <span>Dados atualizados</span>}
                      </td>
                      <td style={{fontSize:".75rem",color:"var(--text-3)"}}>{l.pharma}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showLogin && <PharmaLoginModal onLogin={doLogin} onClose={()=>setShowLogin(false)}/>}
      {dispenseItem && isAuthenticated && (
        <DispenseModal item={dispenseItem} pharmaUser={pharmaUser} onConfirm={handleDispense} onClose={()=>setDispenseItem(null)}/>
      )}
      {editItem && isAuthenticated && (
        <StockEditModal item={editItem.item} mode={editItem.mode} pharmaUser={pharmaUser} onConfirm={handleStockConfirm} onClose={()=>setEditItem(null)}/>
      )}
    </div>
  );
}

export { PharmacyPage as default, PatientCardModal };
