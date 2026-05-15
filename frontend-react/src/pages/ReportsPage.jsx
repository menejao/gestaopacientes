import { useState } from "react";
import PageHero from "../components/layout/PageHero";
import { readLS } from "../utils/storage";
import { AGENDA_KEY, REFERRALS_KEY } from "../config/constants";
import { ageInMonths, protocolChip } from "../utils/clinical";
import AuditLogPanel from "./AuditLogPanel";
import EsusMirror from "./EsusMirror";

function ReportsPage({ patients, users, templates, protocolByPatient }) {
  const [period, setPeriod] = useState("month"); // month | quarter | year
  const [tab, setTab]       = useState("overview");

  const agenda  = readLS(AGENDA_KEY, []);
  const referrals = readLS(REFERRALS_KEY, []);
  const pharmaLog = readLS("saudeubs_pharmalog_v1", []);
  const stock     = readLS("saudeubs_pharmacy_v1", []);

  const now = new Date();
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === "quarter") { const q=Math.floor(now.getMonth()/3); return Math.floor(d.getMonth()/3)===q && d.getFullYear()===now.getFullYear(); }
    return d.getFullYear()===now.getFullYear();
  }

  // Stats
  const totalPatients    = patients.length;
  const gestantes        = patients.filter(p=>String(p.careCategory||"").toLowerCase()==="pregnant").length;
  const criancas         = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am<120; }).length;
  const protCritical     = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger").length;
  const agendaPeriod     = agenda.filter(a=>inPeriod(a.date));
  const consultDone      = agendaPeriod.filter(a=>a.status==="done").length;
  const consultAbsent    = agendaPeriod.filter(a=>a.status==="absent").length;
  const referralsPeriod  = referrals.filter(r=>inPeriod(r.createdAt));
  const dispensasPeriod  = pharmaLog.filter(l=>l.type==="dispensa"&&inPeriod(l.ts));
  const lowStock         = (stock||[]).filter(s=>s.qty<=s.minQty).length;
  const acsCount         = users.filter(u=>u.role==="acs").length;
  const docCount         = users.filter(u=>["doctor","nurse_manager"].includes(u.role)).length;

  // Category breakdown
  const catBreak = {};
  patients.forEach(p=>{ const c=p.careCategory||"general"; catBreak[c]=(catBreak[c]||0)+1; });

  // Specialty breakdown for referrals
  const specBreak = {};
  referralsPeriod.forEach(r=>{ specBreak[r.specialty]=(specBreak[r.specialty]||0)+1; });
  const topSpecs = Object.entries(specBreak).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const periodLabel = { month:"Mês atual", quarter:"Trimestre atual", year:"Ano atual" }[period];

  function StatBox({ label, value, sub, color="var(--blue-700)", bg="var(--blue-50)" }) {
    return (
      <div style={{background:bg,borderRadius:"var(--r-md)",padding:"1rem",border:`1px solid ${bg.replace("ff)","cc)")}`}}>
        <div style={{fontSize:"1.8rem",fontWeight:900,color,lineHeight:1}}>{value}</div>
        <div style={{fontWeight:700,fontSize:".78rem",color,marginTop:".3rem"}}>{label}</div>
        {sub&&<div style={{fontSize:".71rem",color:"var(--text-3)",marginTop:".2rem"}}>{sub}</div>}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Gestão e Monitoramento"
        title="Relatórios"
        subtitle="Indicadores operacionais e de saúde para prestação de contas."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
            {[["month","Mês"],["quarter","Trimestre"],["year","Ano"]].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriod(k)} style={{fontSize:".75rem",padding:".3rem .65rem",background:period===k?"var(--teal-600)":"var(--surface-2)",color:period===k?"#fff":"var(--text-2)",border:period===k?"none":"1px solid var(--border)"}}>
                {l}
              </button>
            ))}
            <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".3rem .65rem",marginLeft:".25rem"}}>🖨️ Exportar</button>
          </div>
        }
      />

      {/* Sub tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:"1rem"}}>
        {[["overview","Visão Geral"],["patients","Pacientes"],["production","Produção"],["pharmacy","Farmácia"],["esus","e-SUS / RNDS"],["audit","Trilha de Auditoria"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:".5rem .9rem",fontSize:".78rem",fontWeight:600,border:"none",background:"transparent",cursor:"pointer",color:tab===k?"var(--teal-600)":"var(--text-3)",borderBottom:tab===k?"2px solid var(--teal-500)":"2px solid transparent"}}>
            {l}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {tab==="overview"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Período: {periodLabel}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:".75rem",marginBottom:"1.5rem"}}>
              <StatBox label="Total de pacientes" value={totalPatients} sub={`Gestantes: ${gestantes} · Crianças: ${criancas}`}/>
              <StatBox label="Protocolos críticos" value={protCritical} color="var(--rose-700)" bg="var(--rose-50)" sub="Precisam de atenção"/>
              <StatBox label="Consultas realizadas" value={consultDone} color="var(--green-700)" bg="var(--green-50)" sub={`Faltas: ${consultAbsent}`}/>
              <StatBox label="📤 Encaminhamentos" value={referralsPeriod.length} color="var(--purple-800)" bg="var(--purple-50)" sub={`Pendentes: ${referralsPeriod.filter(r=>r.status==="pending").length}`}/>
              <StatBox label="Dispensações" value={dispensasPeriod.length} color="var(--orange-700)" bg="var(--orange-50)" sub="Medicamentos entregues"/>
              <StatBox label="Estoque crítico" value={lowStock} color={lowStock>0?"var(--rose-700)":"var(--green-700)"} bg={lowStock>0?"var(--rose-50)":"var(--green-50)"} sub="Abaixo do mínimo"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
              <div className="card">
                <div className="card-header"><span className="card-title">Equipe</span></div>
                <div className="card-body" style={{fontSize:".82rem"}}>
                  {[["ACS",acsCount],["Médicos/Enf.",docCount],["Total",users.length]].map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:".35rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                      <span style={{color:"var(--text-2)"}}>{l}</span><strong>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Top especialidades encaminhadas</span></div>
                <div className="card-body" style={{fontSize:".82rem"}}>
                  {!topSpecs.length?<p className="muted">Nenhum encaminhamento no período.</p>:topSpecs.map(([s,c])=>(
                    <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".3rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                      <span style={{color:"var(--text-2)"}}>{s}</span>
                      <span style={{fontWeight:700,color:"var(--teal-700)"}}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
        {tab==="patients"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Distribuição por categoria de cuidado</p>
            <div className="card">
              <div style={{padding:"1rem"}}>
                {Object.entries(catBreak).sort((a,b)=>b[1]-a[1]).map(([cat,count])=>{
                  const pct=Math.round(count/totalPatients*100);
                  return(
                    <div key={cat} style={{marginBottom:".75rem"}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:".8rem",marginBottom:".25rem"}}>
                        <span style={{fontWeight:600}}>{templates.find(t=>t.category===cat)?.label||cat}</span>
                        <span style={{color:"var(--text-3)"}}>{count} ({pct}%)</span>
                      </div>
                      <div style={{height:8,background:"var(--surface-2)",borderRadius:999}}>
                        <div style={{height:8,background:"var(--teal-500)",borderRadius:999,width:pct+"%",transition:"width .4s"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {tab==="production"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Produção — {periodLabel}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:".75rem"}}>
              <StatBox label="Consultas agendadas" value={agendaPeriod.length} color="var(--blue-700)" bg="var(--blue-50)"/>
              <StatBox label="Consultas realizadas" value={consultDone} color="var(--green-700)" bg="var(--green-50)"/>
              <StatBox label="Faltas" value={consultAbsent} color="var(--orange-700)" bg="var(--orange-50)"/>
              <StatBox label="Taxa de comparecimento" value={agendaPeriod.length>0?Math.round(consultDone/agendaPeriod.length*100)+"%":"—"} color="var(--purple-800)" bg="var(--purple-50)"/>
              <StatBox label="Encaminhamentos emitidos" value={referralsPeriod.length} color="var(--blue-700)" bg="var(--blue-50)"/>
              <StatBox label="Encaminhamentos concluídos" value={referralsPeriod.filter(r=>r.status==="done").length} color="var(--green-700)" bg="var(--green-50)"/>
            </div>
          </>
        )}
        {tab==="pharmacy"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Farmácia — {periodLabel}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:".75rem",marginBottom:"1.5rem"}}>
              <StatBox label="Dispensações" value={dispensasPeriod.length} color="var(--orange-700)" bg="var(--orange-50)"/>
              <StatBox label="Itens em estoque" value={(stock||[]).length} color="var(--blue-700)" bg="var(--blue-50)"/>
              <StatBox label="Estoque zerado" value={(stock||[]).filter(s=>s.qty===0).length} color="var(--rose-700)" bg="var(--rose-50)"/>
              <StatBox label="Estoque baixo" value={lowStock} color="var(--orange-700)" bg="var(--orange-50)"/>
            </div>
            {dispensasPeriod.length>0&&(
              <div className="card">
                <div className="card-header"><span className="card-title">Medicamentos mais dispensados</span></div>
                <div style={{padding:"0 1rem .75rem"}}>
                  {Object.entries(dispensasPeriod.reduce((a,d)=>{ a[d.itemName]=(a[d.itemName]||0)+Number(d.qty||1); return a; },{}))
                    .sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,qty])=>(
                      <div key={name} style={{display:"flex",justifyContent:"space-between",padding:".35rem 0",borderBottom:"1px solid var(--border-soft)",fontSize:".82rem"}}>
                        <span>{name}</span><strong style={{color:"var(--teal-700)"}}>{qty}</strong>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </>
        )}
        {tab==="esus"&&(
          <EsusMirror patients={patients} users={users} period={period} periodLabel={periodLabel}/>
        )}

        {tab==="audit"&&(
          <AuditLogPanel/>
        )}
      </div>
    </div>
  );
}

export default ReportsPage;
