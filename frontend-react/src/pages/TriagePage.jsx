import { useState, useEffect } from "react";
import { readLS, writeLS } from "../utils/storage";
import { QUEUE_KEY, NOTIFS_KEY, TRIAGE_VITALS_KEY, PRIORITY_COLORS } from "../config/constants";
import PageHero from "../components/layout/PageHero";
import { initials } from "../utils/formatting";

function shortName(n) { return n ? n.trim().split(" ")[0] : n; }

function TriagePage({ patients, users, user }) {
  const [queue, setQueue]       = useState(()=>readLS(QUEUE_KEY,[]));
  const [selected, setSelected] = useState(null);
  const [vitals, setVitals]     = useState({ bp:"", bpD:"", weight:"", height:"", temp:"", spo2:"", hr:"", glucose:"", pain:"", notes:"" });
  const [saving, setSaving]     = useState(false);

  useEffect(()=>{
    const iv = setInterval(()=>setQueue(readLS(QUEUE_KEY,[])), 15000);
    return ()=>clearInterval(iv);
  },[]);

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY,q); }
  const pendingTriage = queue.filter(q=>q.status==="waiting"||q.status==="triage");

  function startTriage(entry) {
    saveQueue(queue.map(q=>q.id===entry.id?{...q,status:"triage",triageBy:user?.id,triageStart:new Date().toISOString()}:q));
    setSelected(entry);
    setVitals({ bp:"", bpD:"", weight:"", height:"", temp:"", spo2:"", hr:"", glucose:"", pain:"", notes:"" });
  }

  function finishTriage(e) {
    e.preventDefault(); setSaving(true);
    try {
      const allVitals = readLS(TRIAGE_VITALS_KEY,{});
      allVitals[selected.id] = { ...vitals, by:user?.name||"Téc. Enf.", at:new Date().toISOString(), patientId:selected.patientId };
      writeLS(TRIAGE_VITALS_KEY, allVitals);
      saveQueue(queue.map(q=>q.id===selected.id?{...q,status:"ready",triageBy:user?.id,triageDone:new Date().toISOString(),vitals}:q));
      const notif = { id:"triage_done_"+Date.now(), type:"info", icon:"check",
        title:`Triagem concluída: ${selected.patientName}`,
        detail:`Sinais vitais registrados. Paciente pronto.${vitals.bp?` PA: ${vitals.bp}/${vitals.bpD} mmHg`:""}${vitals.weight?` · Peso: ${vitals.weight}kg`:""}`,
        patientId:selected.patientId, dest:"all", ts:new Date().toISOString(), read:false };
      writeLS(NOTIFS_KEY, [notif,...readLS(NOTIFS_KEY,[])].slice(0,50));
      setSelected(null);
    } finally { setSaving(false); }
  }

  function fmtTime(iso) { if(!iso)return""; return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
  function waitMins(iso) { const m=Math.floor((new Date()-new Date(iso))/60000); return m<1?"agora":m<60?`${m}min`:`${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}`; }
  const onlineTechs = users.filter(u=>u.role==="nursing_tech"&&u.online);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Téc. de Enfermagem"
        title="Monitoramento e Triagem"
        subtitle="Aferição de sinais vitais antes do atendimento."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <div style={{display:"flex",alignItems:"center",gap:".5rem",flexShrink:0}}>
            <span style={{fontSize:".72rem",color:"var(--text-3)"}}>Online:</span>
            {onlineTechs.length===0?<span style={{fontSize:".72rem",color:"var(--text-3)"}}>nenhum</span>:onlineTechs.map(u=>(
              <span key={u.id} style={{fontSize:".72rem",padding:".18rem .5rem",borderRadius:999,background:"var(--green-100)",color:"var(--green-700)",fontWeight:600,display:"flex",alignItems:"center",gap:".25rem"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"var(--green-600)",display:"inline-block"}}/>
                {shortName(u.name)}
              </span>
            ))}
          </div>
        }
      />
      <div style={{display:"flex",gap:"1.25rem",padding:"0 1.5rem 1.5rem",flex:1,minHeight:0}}>
        {/* Left: waiting list */}
        <div style={{flex:"0 0 300px",display:"flex",flexDirection:"column",gap:".5rem",overflowY:"auto"}}>
          <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".25rem"}}>Aguardando triagem ({pendingTriage.length})</div>
          {pendingTriage.length===0?(
            <div style={{textAlign:"center",padding:"3rem 1rem",color:"var(--text-3)",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px dashed var(--border)"}}>
              <div style={{fontSize:"2rem",marginBottom:".5rem"}}>🏥</div><div style={{fontSize:".83rem"}}>Nenhum paciente aguardando</div>
            </div>
          ):pendingTriage.map(entry=>{
            const pc=PRIORITY_COLORS[entry.priority]||PRIORITY_COLORS.normal;
            const isMe=entry.status==="triage"&&entry.triageBy===user?.id;
            const isBusy=entry.status==="triage"&&entry.triageBy!==user?.id;
            const techName=isBusy?users.find(u=>u.id===entry.triageBy)?.name:null;
            return(
              <div key={entry.id} style={{padding:".7rem .9rem",borderRadius:"var(--r-md)",cursor:entry.status==="triage"?"default":"pointer",
                border:`2px solid ${isMe?"var(--teal-400)":isBusy?"var(--amber-200)":pc.border}`,
                background:isMe?"var(--teal-50)":isBusy?"var(--amber-50)":pc.bg}}
                onClick={()=>{if(!isBusy&&entry.status!=="triage")startTriage(entry);}}>
                <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)"}}>{entry.patientName}</div>
                <div style={{fontSize:".71rem",color:"var(--text-3)",marginTop:".2rem"}}>Chegou {fmtTime(entry.arrivedAt)} · há {waitMins(entry.arrivedAt)}</div>
                {isMe&&<div style={{fontSize:".72rem",fontWeight:700,color:"var(--teal-600)",marginTop:".3rem"}}>→ Em triagem por você</div>}
                {isBusy&&<div style={{fontSize:".72rem",color:"var(--amber-700)",marginTop:".3rem"}}>Em triagem: {shortName(techName||"outro técnico")}</div>}
                {!isMe&&!isBusy&&<div style={{fontSize:".73rem",color:"var(--teal-600)",fontWeight:600,marginTop:".3rem"}}>Clique para iniciar →</div>}
              </div>
            );
          })}
          {(()=>{const ready=queue.filter(q=>q.status==="ready");if(!ready.length)return null;return(
            <div style={{marginTop:".75rem"}}>
              <div style={{fontSize:".75rem",fontWeight:700,color:"var(--green-700)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".35rem"}}>Prontos ({ready.length})</div>
              {ready.map(e=><div key={e.id} style={{padding:".55rem .8rem",borderRadius:"var(--r-md)",border:"1px solid #bbf7d0",background:"var(--green-50)",marginBottom:".3rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{fontWeight:600,fontSize:".82rem",color:"var(--green-700)"}}>{e.patientName}</div><div style={{fontSize:".7rem",color:"var(--green-600)"}}>Concluído · {fmtTime(e.triageDone)}</div></div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--green-600)" strokeWidth="1.4"/><path d="M5 8l2 2 4-4" stroke="var(--green-600)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>)}
            </div>
          );})()}
        </div>
        {/* Right: vitals form */}
        <div style={{flex:1,minWidth:0}}>
          {!selected?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-3)",textAlign:"center",padding:"3rem"}}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{opacity:.2,marginBottom:"1rem"}}><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p style={{fontSize:".9rem"}}>Selecione um paciente para iniciar a triagem.</p>
            </div>
          ):(
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"1rem 1.25rem",borderBottom:"1px solid var(--border)",background:"var(--teal-50)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"var(--teal-500)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1rem"}}>{initials(selected.patientName)}</div>
                  <div><div style={{fontWeight:700,fontSize:".95rem",color:"var(--ink)"}}>{selected.patientName}</div><div style={{fontSize:".73rem",color:"var(--teal-600)"}}>Triagem iniciada às {fmtTime(selected.triageStart||new Date().toISOString())}</div></div>
                </div>
                <button className="icon-btn" onClick={()=>{saveQueue(queue.map(q=>q.id===selected.id?{...q,status:"waiting",triageBy:null,triageStart:null}:q));setSelected(null);}}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
              <form onSubmit={finishTriage} style={{padding:"1.25rem",display:"flex",flexDirection:"column",gap:"1rem",overflowY:"auto",maxHeight:"calc(100vh - 280px)"}}>
                <div>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>Pressão Arterial e FC</div>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                      PA (mmHg)
                      <div style={{display:"flex",alignItems:"center",gap:".3rem"}}>
                        <input value={vitals.bp} onChange={e=>setVitals(s=>({...s,bp:e.target.value}))} placeholder="120" inputMode="numeric" style={{flex:1}}/>
                        <span style={{color:"var(--text-3)",fontWeight:700}}>/</span>
                        <input value={vitals.bpD} onChange={e=>setVitals(s=>({...s,bpD:e.target.value}))} placeholder="80" inputMode="numeric" style={{flex:1}}/>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>FC (bpm)<input value={vitals.hr} onChange={e=>setVitals(s=>({...s,hr:e.target.value}))} placeholder="72" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>SpO₂ (%)<input value={vitals.spo2} onChange={e=>setVitals(s=>({...s,spo2:e.target.value}))} placeholder="98" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Temp (°C)<input value={vitals.temp} onChange={e=>setVitals(s=>({...s,temp:e.target.value}))} placeholder="36.5" inputMode="decimal"/></label>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>Antropometria</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Peso (kg)<input value={vitals.weight} onChange={e=>setVitals(s=>({...s,weight:e.target.value}))} placeholder="70.0" inputMode="decimal"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Altura (cm)<input value={vitals.height} onChange={e=>setVitals(s=>({...s,height:e.target.value}))} placeholder="170" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Glicemia (mg/dL)<input value={vitals.glucose} onChange={e=>setVitals(s=>({...s,glucose:e.target.value}))} placeholder="100" inputMode="numeric"/></label>
                  </div>
                  {vitals.weight&&vitals.height&&(()=>{const bmi=(parseFloat(vitals.weight)/Math.pow(parseFloat(vitals.height)/100,2)).toFixed(1);const cat=bmi<18.5?["Abaixo do peso","var(--blue-700)"]:bmi<25?["Normal","var(--green-700)"]:bmi<30?["Sobrepeso","var(--amber-700)"]:["Obesidade","var(--rose-700)"];return !isNaN(bmi)?<div style={{marginTop:".3rem",fontSize:".75rem",color:cat[1],fontWeight:600}}>IMC: {bmi} — {cat[0]}</div>:null;})()}
                </div>
                <div>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>Dor (0–10)</div>
                  <div style={{display:"flex",gap:".3rem",flexWrap:"wrap"}}>
                    {[0,1,2,3,4,5,6,7,8,9,10].map(n=>(
                      <button key={n} type="button" onClick={()=>setVitals(s=>({...s,pain:String(n)}))}
                        style={{width:36,height:36,borderRadius:"var(--r-md)",fontWeight:700,fontSize:".85rem",cursor:"pointer",
                          border:`2px solid ${vitals.pain===String(n)?(n<=3?"var(--green-700)":n<=6?"var(--amber-700)":"var(--rose-700)"):"var(--border)"}`,
                          background:vitals.pain===String(n)?(n<=3?"var(--green-100)":n<=6?"var(--amber-100)":"var(--red-100)"):"var(--surface)",
                          color:vitals.pain===String(n)?(n<=3?"var(--green-700)":n<=6?"var(--amber-700)":"var(--rose-700)"):"var(--text-2)"}}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <label style={{display:"flex",flexDirection:"column",gap:".3rem",fontSize:".78rem",fontWeight:600}}>
                  Observações
                  <textarea value={vitals.notes} onChange={e=>setVitals(s=>({...s,notes:e.target.value}))} placeholder="Queixas, histórico relevante..." style={{minHeight:64,resize:"vertical"}}/>
                </label>
                <div style={{display:"flex",gap:".5rem",paddingTop:".25rem",borderTop:"1px solid var(--border)"}}>
                  <button type="button" onClick={()=>{saveQueue(queue.map(q=>q.id===selected.id?{...q,status:"waiting",triageBy:null}:q));setSelected(null);}}
                    style={{flex:1,background:"var(--surface-2)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:500,cursor:"pointer"}}>Cancelar</button>
                  <button type="submit" disabled={saving}
                    style={{flex:2,background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:600,cursor:"pointer"}}>
                    {saving?"Finalizando...":"✓ Finalizar triagem e notificar"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TriagePage;
