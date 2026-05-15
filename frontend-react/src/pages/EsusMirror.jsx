import { useState } from "react";
import { readLS } from "../utils/storage";
import { AGENDA_KEY, REFERRALS_KEY } from "../config/constants";
import { ageInMonths } from "../utils/clinical";

function EsusMirror({ patients, users, period, periodLabel }) {
  const agenda    = readLS(AGENDA_KEY, []);
  const referrals = readLS(REFERRALS_KEY, []);
  const pharmaLog = readLS("saudeubs_pharmalog_v1", []);
  const [copied, setCopied] = useState("");

  const now = new Date();
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === "quarter") { const q=Math.floor(now.getMonth()/3); return Math.floor(d.getMonth()/3)===q && d.getFullYear()===now.getFullYear(); }
    return d.getFullYear()===now.getFullYear();
  }

  const monthNum   = String(now.getMonth()+1).padStart(2,"0");
  const yearNum    = now.getFullYear();
  const competencia = `${monthNum}/${yearNum}`;

  const consultasDone   = agenda.filter(a=>inPeriod(a.date)&&a.status==="done"&&a.type==="consultation").length;
  const retornosDone    = agenda.filter(a=>inPeriod(a.date)&&a.status==="done"&&a.type==="return").length;
  const procedimentos   = agenda.filter(a=>inPeriod(a.date)&&a.status==="done"&&a.type==="procedure").length;

  const doctors  = users.filter(u=>["doctor"].includes(u.role));
  const nurses   = users.filter(u=>["nurse_manager","nursing_tech"].includes(u.role));
  const acs      = users.filter(u=>u.role==="acs");

  const patientsPeriod = patients.length;
  const faiTotal = consultasDone + retornosDone + procedimentos;
  const visitasACS = 0;
  const encTotal = referrals.filter(r=>inPeriod(r.createdAt)).length;
  const dispensas = pharmaLog.filter(l=>l.type==="dispensa"&&inPeriod(l.ts)).length;
  const gestantes = patients.filter(p=>String(p.careCategory||"").toLowerCase()==="pregnant").length;
  const criancas = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am<60; }).length;

  function copyToClipboard(text, key) {
    navigator.clipboard?.writeText(text).then(()=>{ setCopied(key); setTimeout(()=>setCopied(""),1500); });
  }

  function CopyBtn({ value, k }) {
    return (
      <button onClick={()=>copyToClipboard(String(value), k)}
        style={{fontSize:".65rem",padding:".15rem .45rem",borderRadius:4,background:copied===k?"var(--green-50)":"var(--surface-2)",border:`1px solid ${copied===k?"var(--green-200)":"var(--border)"}`,color:copied===k?"var(--green-700)":"var(--text-3)",cursor:"pointer",transition:"all .15s",fontWeight:600}}>
        {copied===k?"✓ Copiado":"Copiar"}
      </button>
    );
  }

  function Row({ label, value, code, hint, k }) {
    return (
      <tr>
        <td style={{padding:".5rem .75rem",fontSize:".78rem",color:"var(--text-2)",borderBottom:"1px solid var(--border-soft)"}}>{label}</td>
        {code&&<td style={{padding:".5rem .75rem",fontSize:".72rem",fontFamily:"IBM Plex Mono",color:"var(--text-3)",borderBottom:"1px solid var(--border-soft)"}}>{code}</td>}
        <td style={{padding:".5rem .75rem",fontWeight:700,fontSize:".9rem",color:"var(--teal-700)",borderBottom:"1px solid var(--border-soft)",textAlign:"center"}}>{value}</td>
        <td style={{padding:".5rem .75rem",borderBottom:"1px solid var(--border-soft)"}}>
          <CopyBtn value={value} k={k||label}/>
        </td>
        {hint&&<td style={{padding:".5rem .75rem",fontSize:".7rem",color:"var(--text-3)",borderBottom:"1px solid var(--border-soft)"}}>{hint}</td>}
      </tr>
    );
  }

  const fullReport = `ESPELHO e-SUS/RNDS — ${periodLabel.toUpperCase()}
Competência: ${competencia}
Gerado em: ${new Date().toLocaleString("pt-BR")}

=== CADASTROS ===
Total de pacientes cadastrados: ${patientsPeriod}
Gestantes acompanhadas: ${gestantes}
Crianças < 5 anos: ${criancas}

=== PRODUÇÃO AMBULATORIAL ===
Consultas médicas realizadas: ${consultasDone}
Retornos realizados: ${retornosDone}
Procedimentos: ${procedimentos}
Total FAI: ${faiTotal}
Encaminhamentos emitidos: ${encTotal}

=== EQUIPE ===
Médicos: ${doctors.length}
Enfermeiros/Téc.: ${nurses.length}
ACS: ${acs.length}

=== FARMÁCIA ===
Dispensações: ${dispensas}
`;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".5rem"}}>
        <div>
          <p style={{fontSize:".82rem",fontWeight:700,color:"var(--ink)",margin:0}}>Espelho de Produção — e-SUS APS / RNDS</p>
          <p style={{fontSize:".73rem",color:"var(--text-3)",margin:".2rem 0 0"}}>Competência: <strong>{competencia}</strong> · {periodLabel} · Use os valores abaixo para lançar no sistema federal.</p>
        </div>
        <div style={{display:"flex",gap:".4rem"}}>
          <button onClick={()=>copyToClipboard(fullReport,"full")} style={{fontSize:".75rem",padding:".35rem .75rem",display:"flex",alignItems:"center",gap:".3rem"}}>
            {copied==="full"?"✓ Copiado":"📋 Copiar relatório completo"}
          </button>
          <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".35rem .75rem"}}>🖨️ Imprimir</button>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>

        {/* Cadastros */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"var(--blue-50)",borderBottom:"1px solid #bfdbfe",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"var(--blue-700)"}}>📋 Ficha de Cadastro Individual (FCI)</span>
            <span style={{fontSize:".7rem",color:"var(--blue-500)",marginLeft:"auto"}}>Módulo CDS / e-SUS APS</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Total de indivíduos cadastrados" code="FCI-001" value={patientsPeriod} k="fci001" hint="Campo: Fichas de cadastro"/>
              <Row label="Gestantes em acompanhamento"     code="FCI-002" value={gestantes}     k="fci002" hint="Condição: Gestante"/>
              <Row label="Crianças < 5 anos"               code="FCI-003" value={criancas}      k="fci003" hint="Faixa etária 0–59 meses"/>
              <Row label="Total ACS cadastradores"         code="FCI-004" value={acs.length}    k="fci004"/>
            </tbody>
          </table>
        </div>

        {/* Atendimento */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"var(--green-50)",borderBottom:"1px solid #bbf7d0",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"var(--green-700)"}}>🩺 Ficha de Atendimento Individual (FAI)</span>
            <span style={{fontSize:".7rem",color:"var(--green-500)",marginLeft:"auto"}}>Módulo CDS / e-SUS APS</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Consultas médicas realizadas"    code="FAI-001" value={consultasDone}  k="fai001" hint="Tipo: Consulta · Status: Concluído"/>
              <Row label="Retornos realizados"             code="FAI-002" value={retornosDone}   k="fai002" hint="Tipo: Retorno · Status: Concluído"/>
              <Row label="Procedimentos"                   code="FAI-003" value={procedimentos}  k="fai003" hint="Tipo: Procedimento"/>
              <Row label="Total de atendimentos (FAI)"     code="FAI-TOT" value={faiTotal}       k="faitot"/>
              <Row label="Encaminhamentos emitidos"        code="ENC-001" value={encTotal}       k="enc001" hint="Referência p/ especialista"/>
            </tbody>
          </table>
        </div>

        {/* Equipe */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"var(--purple-50)",borderBottom:"1px solid #e9d5ff",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"var(--purple-800)"}}>👥 Composição da Equipe</span>
            <span style={{fontSize:".7rem",color:"#a855f7",marginLeft:"auto"}}>CNES / e-Gestor AB</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Médicos"                         code="EQ-001" value={doctors.length} k="eq001"/>
              <Row label="Enfermeiros / Técnicos"          code="EQ-002" value={nurses.length}  k="eq002"/>
              <Row label="Agentes Comunitários de Saúde"   code="EQ-003" value={acs.length}     k="eq003"/>
              <Row label="Total equipe"                    code="EQ-TOT" value={users.length}   k="eqtot"/>
            </tbody>
          </table>
        </div>

        {/* Farmácia */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"var(--orange-50)",borderBottom:"1px solid #fed7aa",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"var(--orange-700)"}}>💊 Dispensação de Medicamentos</span>
            <span style={{fontSize:".7rem",color:"#f97316",marginLeft:"auto"}}>RNDS / HÓRUS</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Total de dispensações"           code="FARM-01" value={dispensas}     k="farm01" hint="Registro HÓRUS / RNDS"/>
            </tbody>
          </table>
        </div>

        {/* Aviso */}
        <div style={{padding:".75rem 1rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",fontSize:".75rem",color:"var(--text-3)",lineHeight:1.6}}>
          <strong style={{color:"var(--text-2)"}}>⚠️ Importante:</strong> Este espelho é gerado automaticamente a partir dos dados registrados no VALENS e serve como <strong>referência de apoio</strong> para o lançamento no e-SUS APS, RNDS e outros sistemas federais. Sempre confira os dados com a equipe antes do envio oficial.
        </div>
      </div>
    </div>
  );
}

export default EsusMirror;
