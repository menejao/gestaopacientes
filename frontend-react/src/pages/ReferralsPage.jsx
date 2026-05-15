import { useState } from "react";
import PageHero from "../components/layout/PageHero";
import { readLS, writeLS } from "../utils/storage";
import { REFERRALS_KEY } from "../config/constants";
import { fmtDate } from "../utils/formatting";

const SPECIALTIES = ["Cardiologia","Ortopedia","Neurologia","Psiquiatria","Ginecologia","Urologia","Dermatologia","Oftalmologia","Otorrinolaringologia","Endocrinologia","Nefrologia","Pneumologia","Reumatologia","Gastroenterologia","Oncologia","Fisioterapia","Nutrição","Psicologia","Serviço Social","Pronto-Socorro","Hospital"];

function ReferralsPage({ patients, users, user }) {
  const [referrals, setReferrals]   = useState(()=>readLS(REFERRALS_KEY,[]));
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState({ patientId:"", specialty:"Cardiologia", reason:"", priority:"routine", date:"", notes:"", status:"pending" });
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");
  const [showDoc, setShowDoc]       = useState(null); // referral to print

  function saveReferrals(r) { setReferrals(r); writeLS(REFERRALS_KEY,r); }

  function openNew() {
    setForm({ patientId:"", specialty:"Cardiologia", reason:"", priority:"routine", date:new Date().toISOString().slice(0,10), notes:"", status:"pending" });
    setEditId(null); setShowForm(true);
  }
  function openEdit(ref) {
    setForm({ patientId:ref.patientId, specialty:ref.specialty, reason:ref.reason, priority:ref.priority, date:ref.date, notes:ref.notes||"", status:ref.status });
    setEditId(ref.id); setShowForm(true);
  }
  function submit(e) {
    e.preventDefault();
    if (!form.patientId||!form.reason) return;
    const pat=patients.find(p=>p.id===form.patientId);
    const doc=users.find(u=>u.id===user?.id);
    const entry={ ...form, id:editId||("ref"+Date.now()), patientName:pat?.name||"?", doctorName:doc?.name||user?.name||"?", createdAt:new Date().toISOString() };
    const base=editId?referrals.filter(r=>r.id!==editId):referrals;
    saveReferrals([entry,...base]);
    setShowForm(false);
  }
  function updateStatus(id,status) { saveReferrals(referrals.map(r=>r.id===id?{...r,status,updatedAt:new Date().toISOString()}:r)); }
  function remove(id) { saveReferrals(referrals.filter(r=>r.id!==id)); }

  const filtered = referrals.filter(r=>{
    if(filterStatus!=="all"&&r.status!==filterStatus)return false;
    if(search.trim()&&!r.patientName.toLowerCase().includes(search.toLowerCase())&&!r.specialty.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });

  const statusMap={ pending:{label:"Aguardando",bg:"var(--orange-50)",color:"var(--orange-700)",border:"var(--orange-200)"}, scheduled:{label:"Agendado",bg:"var(--blue-50)",color:"var(--blue-700)",border:"var(--blue-200)"}, done:{label:"Realizado",bg:"var(--green-50)",color:"var(--green-700)",border:"var(--green-200)"}, cancelled:{label:"Cancelado",bg:"var(--surface-2)",color:"var(--text-3)",border:"var(--border)"} };
  const priorityMap={ urgent:{label:"Urgente",color:"var(--rose-700)"}, priority:{label:"Prioritário",color:"var(--orange-700)"}, routine:{label:"Rotina",color:"var(--text-3)"} };

  const counts={ all:referrals.length, pending:referrals.filter(r=>r.status==="pending").length, scheduled:referrals.filter(r=>r.status==="scheduled").length, done:referrals.filter(r=>r.status==="done").length };

  function fmtDateLocal(d){if(!d)return"-";try{return new Date(d+"T12:00:00").toLocaleDateString("pt-BR");}catch{return d;}}

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Referência e Contrarreferência"
        title="Encaminhamentos"
        subtitle="Controle de encaminhamentos para especialistas e serviços."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <button onClick={openNew} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Novo encaminhamento
          </button>
        }
      />

      {/* Status filter tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:"1rem"}}>
        {[["all","Todos"],["pending","Aguardando"],["scheduled","Agendado"],["done","Realizado"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilterStatus(k)}
            style={{padding:".5rem .9rem",fontSize:".78rem",fontWeight:600,border:"none",background:"transparent",cursor:"pointer",
              color:filterStatus===k?"var(--teal-600)":"var(--text-3)",
              borderBottom:filterStatus===k?"2px solid var(--teal-500)":"2px solid transparent"}}>
            {l} <span style={{fontSize:".68rem",opacity:.7}}>({counts[k]})</span>
          </button>
        ))}
      </div>

      <div style={{padding:"0 1.5rem",marginBottom:".75rem"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por paciente ou especialidade..." style={{width:"100%",maxWidth:380,boxSizing:"border-box"}}/>
      </div>

      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {!filtered.length?(
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>📋</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>Nenhum encaminhamento encontrado</div>
          </div>
        ):(
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <table className="patients-table" style={{width:"100%"}}>
              <thead><tr>
                <th>Paciente</th><th>Especialidade</th><th>Prioridade</th>
                <th>Data</th><th>Status</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {filtered.map(r=>{
                  const ss=statusMap[r.status]||statusMap.pending;
                  const pp=priorityMap[r.priority]||priorityMap.routine;
                  return(
                    <tr key={r.id}>
                      <td>
                        <div style={{fontWeight:600,fontSize:".84rem"}}>{r.patientName}</div>
                        <div style={{fontSize:".71rem",color:"var(--text-3)"}}>{r.doctorName}</div>
                      </td>
                      <td style={{fontWeight:600,fontSize:".84rem"}}>{r.specialty}</td>
                      <td><span style={{fontSize:".71rem",fontWeight:700,color:pp.color}}>{pp.label}</span></td>
                      <td style={{fontSize:".8rem",color:"var(--text-3)"}}>{fmtDateLocal(r.date)}</td>
                      <td>
                        <select value={r.status} onChange={e=>updateStatus(r.id,e.target.value)}
                          style={{fontSize:".71rem",padding:".2rem .4rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700}}>
                          {Object.entries(statusMap).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{display:"flex",gap:".3rem",justifyContent:"center"}}>
                          <button onClick={()=>setShowDoc(r)} title="Ver documento" style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)",borderRadius:"var(--r-md)"}}>📄</button>
                          <button onClick={()=>openEdit(r)} style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>✏️</button>
                          <button onClick={()=>remove(r.id)} style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"var(--rose-700)"}}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>setShowForm(false)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>{editId?"Editar encaminhamento":"Novo encaminhamento"}</h3>
              <button className="icon-btn" onClick={()=>setShowForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Paciente *
                <select value={form.patientId} onChange={e=>setForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Especialidade
                <select value={form.specialty} onChange={e=>setForm(s=>({...s,specialty:e.target.value}))}>
                  {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Prioridade
                <select value={form.priority} onChange={e=>setForm(s=>({...s,priority:e.target.value}))}>
                  <option value="routine">Rotina</option><option value="priority">Prioritário</option><option value="urgent">Urgente</option>
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Data
                <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Status
                <select value={form.status} onChange={e=>setForm(s=>({...s,status:e.target.value}))}>
                  <option value="pending">Aguardando</option><option value="scheduled">Agendado</option><option value="done">Realizado</option><option value="cancelled">Cancelado</option>
                </select>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Motivo / hipótese diagnóstica *
                <textarea value={form.reason} onChange={e=>setForm(s=>({...s,reason:e.target.value}))} style={{minHeight:64}} placeholder="Descreva o motivo do encaminhamento..."/>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Observações adicionais
                <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Informações relevantes para o especialista..."/>
              </label>
              <div style={{gridColumn:"span 2",display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowForm(false)} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document preview / print */}
      {showDoc&&(
        <div className="modal-backdrop" onClick={()=>setShowDoc(null)}>
          <div className="modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>Guia de Encaminhamento</h3>
              <div style={{display:"flex",gap:".5rem"}}>
                <button onClick={()=>window.print()} style={{fontSize:".78rem",padding:".3rem .65rem"}}>🖨️ Imprimir</button>
                <button className="icon-btn" onClick={()=>setShowDoc(null)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
              </div>
            </div>
            <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"1.25rem",fontFamily:"serif",lineHeight:1.7}}>
              <div style={{textAlign:"center",borderBottom:"2px solid var(--border)",paddingBottom:".75rem",marginBottom:".75rem"}}>
                <div style={{fontWeight:800,fontSize:"1.05rem"}}>GUIA DE ENCAMINHAMENTO</div>
                <div style={{fontSize:".8rem",color:"var(--text-3)"}}>Unidade Básica de Saúde</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem",fontSize:".82rem"}}>
                <div><strong>Paciente:</strong> {showDoc.patientName}</div>
                <div><strong>Data:</strong> {fmtDateLocal(showDoc.date)}</div>
                <div><strong>Especialidade:</strong> {showDoc.specialty}</div>
                <div><strong>Prioridade:</strong> {priorityMap[showDoc.priority]?.label||showDoc.priority}</div>
              </div>
              <div style={{marginTop:".75rem",fontSize:".82rem"}}><strong>Motivo:</strong><br/><span style={{whiteSpace:"pre-wrap"}}>{showDoc.reason}</span></div>
              {showDoc.notes&&<div style={{marginTop:".5rem",fontSize:".82rem"}}><strong>Observações:</strong><br/>{showDoc.notes}</div>}
              <div style={{marginTop:"1.5rem",paddingTop:".75rem",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",fontSize:".78rem",color:"var(--text-3)"}}>
                <span>Profissional: {showDoc.doctorName}</span>
                <span>Emitido em: {showDoc.createdAt?new Date(showDoc.createdAt).toLocaleDateString("pt-BR"):"-"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferralsPage;
