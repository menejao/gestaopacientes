import { useState, useMemo } from "react";
import { createPatient } from "../api";
import { AGENDA_KEY } from "../config/constants";
import { readLS, writeLS } from "../utils/storage";
import { matchesPatientSearch, emptyPatientForm, isProfileIncomplete, ageInMonths } from "../utils/clinical";
import { isUnavailableDay, unavailableReason } from "../utils/dates";
import { formatCpf, formatPhone, initials } from "../utils/formatting";
import PageHero from "../components/layout/PageHero";

const AGENDA_HOURS = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

function AgendaPage({ patients, users, user, token, onNewPatient, onPatientCreated, onNavigatePatient, teams = [] }) {
  const [agenda, setAgenda]         = useState(()=>readLS(AGENDA_KEY,[]));
  const [selectedDate, setSelectedDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ patientId:"", doctorId:"", date:"", time:"", type:"consultation", notes:"", status:"scheduled" });
  const [editId, setEditId]         = useState(null);
  const [filterDoc, setFilterDoc]   = useState("");
  // Patient search in form
  const [patSearch, setPatSearch]   = useState("");
  const [patSelected, setPatSelected] = useState(null);
  const [showNewPat, setShowNewPat] = useState(false);
  const [newPatForm, setNewPatForm] = useState({name:"",cpf:"",phone:"",careCategory:"general",birthDate:"",teamId:String(user?.teamId||"")});
  const [newPatErr, setNewPatErr]   = useState("");

  const patResults = useMemo(() => {
    const q = patSearch.trim();
    if (q.length < 2) return [];
    return patients.filter(p => matchesPatientSearch(p, q)).slice(0, 8);
  }, [patSearch, patients]);

  const doctors = users.filter(u=>["doctor","nurse_manager","nursing_tech"].includes(u.role));

  function saveAgenda(newA) { setAgenda(newA); writeLS(AGENDA_KEY, newA); }

  function openNew(time="", date=selectedDate) {
    setForm({ patientId:"", doctorId:"", date, time, type:"consultation", notes:"", status:"scheduled" });
    setPatSearch(""); setPatSelected(null);
    setEditId(null); setShowForm(true);
  }
  function openEdit(appt) {
    const pat = patients.find(p=>p.id===appt.patientId)||null;
    setForm({ patientId:appt.patientId, doctorId:appt.doctorId, date:appt.date, time:appt.time, type:appt.type, notes:appt.notes||"", status:appt.status });
    setPatSearch(pat?.name||""); setPatSelected(pat);
    setEditId(appt.id); setShowForm(true);
  }
  async function submit(e) {
    e.preventDefault();
    if (!form.patientId || !form.date || !form.time) return;

    let resolvedPatientId = form.patientId;

    // Se paciente foi criado rapidamente (id local_), persiste via API ou estado local
    if (patSelected && String(form.patientId).startsWith("local_") && !patients.find(p=>p.id===form.patientId)) {
      const payload = {
        name: patSelected.name,
        cpf: patSelected.cpf||"",
        phone: patSelected.phone||"",
        birthDate: patSelected.birthDate||"",
        careCategory: patSelected.careCategory||"general",
        teamId: String(patSelected.teamId || user?.teamId || "").trim(),
        incompleteProfile: true,
        // Campos mínimos obrigatórios vazios — serão completados depois
        motherName:"", cns:"", phoneAlt:"", zipCode:"", address:"", number:"",
        complement:"", neighborhood:"", city:"", state:"", sex:"", maritalStatus:"",
        assignedAcsId:"", allergies:"", comorbidities:"", medications:"",
        pregnancyStartDate:"", expectedDeliveryDate:"",
      };

      if (token && !String(token).startsWith("local_")) {
        // Cria via API
        try {
          const created = await createPatient(token, payload);
          resolvedPatientId = created?.id || form.patientId;
          if (onNewPatient) onNewPatient({...payload, id: resolvedPatientId});
          if (onPatientCreated) onPatientCreated(); // recarrega lista
        } catch {
          // Fallback: só no estado local
          const quickPat = { ...payload, id: form.patientId };
          if (onNewPatient) onNewPatient(quickPat);
          resolvedPatientId = form.patientId;
        }
      } else {
        // Token local: só estado React
        const quickPat = { ...payload, id: form.patientId };
        if (onNewPatient) onNewPatient(quickPat);
      }
    }

    const pat = patients.find(p=>p.id===resolvedPatientId) || patSelected;
    const doc = users.find(u=>u.id===form.doctorId);
    // Determina se o paciente tem cadastro incompleto:
    // - flag já vem do banco (pat.incompleteProfile)
    // - OU o id original era local_ (criado agora no cadastro rápido)
    const wasQuickCreated = String(form.patientId).startsWith("local_");
    const isIncomplete = pat?.incompleteProfile === true || wasQuickCreated;
    const entry = {
      ...form,
      patientId: resolvedPatientId,
      id: editId||("ag"+Date.now()),
      patientName: pat?.name||"?",
      doctorName: doc?.name||"",
      incompletePatient: isIncomplete,
      createdAt: new Date().toISOString(),
    };
    const base = editId ? agenda.filter(a=>a.id!==editId) : agenda;
    saveAgenda([...base, entry].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)));
    setShowForm(false);
  }
  function remove(id) { saveAgenda(agenda.filter(a=>a.id!==id)); }
  function updateStatus(id, status) { saveAgenda(agenda.map(a=>a.id===id?{...a,status}:a)); }

  const dayAppts = agenda.filter(a => a.date===selectedDate && (!filterDoc||a.doctorId===filterDoc))
    .sort((a,b)=>a.time.localeCompare(b.time));

  const statusStyle = { scheduled:{bg:"var(--blue-50)",color:"var(--blue-700)",border:"var(--blue-200)",label:"Agendado"}, arrived:{bg:"var(--green-50)",color:"var(--green-700)",border:"var(--green-200)",label:"Chegou"}, attending:{bg:"var(--orange-50)",color:"var(--orange-700)",border:"var(--orange-200)",label:"Em atend."}, done:{bg:"var(--surface-2)",color:"var(--text-3)",border:"var(--border)",label:"Concluído"}, absent:{bg:"var(--rose-50)",color:"var(--rose-700)",border:"var(--rose-200)",label:"Faltou"} };

  // Week navigation
  const selD = new Date(selectedDate+"T12:00:00");
  const weekDays = Array.from({length:7},(_,i)=>{
    const d=new Date(selD); d.setDate(d.getDate()-d.getDay()+i);
    return d.toISOString().slice(0,10);
  });

  // Count per day for week view
  const countByDay = {};
  weekDays.forEach(d=>{ countByDay[d]=agenda.filter(a=>a.date===d).length; });

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Gestão de Horários"
        title="Agenda"
        subtitle="Agendamentos, confirmações e controle de presença."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <button onClick={()=>openNew()} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Novo agendamento
          </button>
        }
      />

      {/* Week strip */}
      <div style={{display:"flex",gap:".3rem",padding:"0 1.5rem .75rem",overflowX:"auto"}}>
        {weekDays.map(d=>{
          const dt=new Date(d+"T12:00:00");
          const isToday=d===new Date().toISOString().slice(0,10);
          const isSel=d===selectedDate;
          const unavailable=isUnavailableDay(d);
          return (
            <button key={d} onClick={()=>setSelectedDate(d)}
              style={{flex:"1 0 60px",padding:".55rem .4rem",borderRadius:"var(--r-md)",border:`1px solid ${isSel?"var(--teal-500)":unavailable?"var(--slate-200)":"var(--border)"}`,
                background:isSel?"var(--teal-600)":unavailable?"var(--slate-50)":"var(--surface)",
                color:isSel?"#fff":unavailable?"var(--slate-400)":isToday?"var(--teal-600)":"var(--text-2)",
                cursor:"pointer",textAlign:"center",minWidth:60,opacity:unavailable&&!isSel?.7:1}}>
              <div style={{fontSize:".65rem",fontWeight:600,textTransform:"uppercase",opacity:.8}}>{dt.toLocaleDateString("pt-BR",{weekday:"short"})}</div>
              <div style={{fontSize:"1.05rem",fontWeight:800,lineHeight:1.2}}>{dt.getDate()}</div>
              {unavailable&&!isSel&&<div style={{fontSize:".55rem",marginTop:".1rem",color:"var(--slate-400)"}}>fechado</div>}
              {!unavailable&&countByDay[d]>0&&<div style={{fontSize:".6rem",marginTop:".1rem",opacity:.85}}>{countByDay[d]}×</div>}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:".6rem",padding:"0 1.5rem .6rem",alignItems:"center"}}>
        <select value={filterDoc} onChange={e=>setFilterDoc(e.target.value)} style={{minWidth:180}}>
          <option value="">Todos os profissionais</option>
          {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span style={{fontSize:".8rem",color:"var(--text-3)"}}>{dayAppts.length} agendamento{dayAppts.length!==1?"s":""} em {new Date(selectedDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</span>
      </div>

      {/* Timeline */}
      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {isUnavailableDay(selectedDate)&&(
          <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".75rem 1rem",marginBottom:".75rem",background:"var(--slate-50)",border:"1px solid #e2e8f0",borderRadius:"var(--r-md)",fontSize:".82rem",color:"var(--slate-500)"}}>
            <span style={{fontSize:"1.2rem"}}>🔒</span>
            <div>
              <div style={{fontWeight:700,color:"var(--slate-600)"}}>{unavailableReason(selectedDate)}</div>
              <div style={{fontSize:".75rem",marginTop:".1rem"}}>Agendamentos não são realizados nesta data. Caso haja um agendamento existente, ele foi criado manualmente.</div>
            </div>
          </div>
        )}
        {!dayAppts.length ? (
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>{isUnavailableDay(selectedDate)?"🔒":"📅"}</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>{isUnavailableDay(selectedDate)?"Unidade fechada neste dia":"Nenhum agendamento neste dia"}</div>
            {!isUnavailableDay(selectedDate)&&<button onClick={()=>openNew()} style={{marginTop:"1rem",fontSize:".8rem"}}>+ Agendar consulta</button>}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
            {dayAppts.map(appt=>{
              const ss=statusStyle[appt.status]||statusStyle.scheduled;
              // Verifica cadastro incompleto:
              // 1. flag no agendamento (salva no momento do cadastro rápido)
              // 2. flag no paciente atualizado (após loadAll)
              // 3. id ainda começa com local_ (não foi para o backend)
              const patObj = patients.find(p=>p.id===appt.patientId);
              const incomplete = appt.incompletePatient === true
                || isProfileIncomplete(patObj)
                || String(appt.patientId).startsWith("local_");
              return (
                <div key={appt.id} style={{display:"flex",flexDirection:"column",gap:".4rem",padding:".75rem 1rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${incomplete?"var(--amber-500)":ss.border}`}}>
                  {incomplete&&(
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",padding:".3rem .6rem",background:"var(--amber-50)",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".72rem",color:"var(--amber-700)",fontWeight:600}}>
                      <span>⚠️</span>
                      <span>Cadastro incompleto — consulta bloqueada até completar o perfil.</span>
                      {onNavigatePatient&&<button type="button" onClick={()=>onNavigatePatient(appt.patientId)}
                        style={{marginLeft:"auto",fontSize:".7rem",padding:".15rem .5rem",background:"var(--amber-500)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,flexShrink:0}}>
                        Completar →
                      </button>}
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                    <div style={{fontFamily:"IBM Plex Mono",fontSize:".85rem",fontWeight:700,color:ss.color,flexShrink:0,width:50}}>{appt.time}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{appt.patientName}</div>
                      <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>
                        {appt.type==="consultation"?"Consulta":appt.type==="return"?"Retorno":appt.type==="procedure"?"Procedimento":"Outro"}
                        {appt.doctorName&&" · "+appt.doctorName}
                        {appt.notes&&" · "+appt.notes}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:".4rem",flexShrink:0}}>
                      <select value={appt.status}
                        onChange={e=>{
                          if(incomplete&&(e.target.value==="attending"||e.target.value==="done")){
                            alert("Cadastro incompleto. Complete o perfil do paciente antes de iniciar a consulta.");
                            return;
                          }
                          updateStatus(appt.id,e.target.value);
                        }}
                        style={{fontSize:".72rem",padding:".2rem .4rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700,cursor:"pointer"}}>
                        {Object.entries(statusStyle).map(([k,v])=>{
                          const blocked=incomplete&&(k==="attending"||k==="done");
                          return <option key={k} value={k} disabled={blocked}>{v.label}{blocked?" 🔒":""}</option>;
                        })}
                      </select>
                      <button onClick={()=>openEdit(appt)} style={{padding:".25rem .5rem",fontSize:".71rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)"}}>✏️</button>
                      <button onClick={()=>remove(appt.id)} style={{padding:".25rem .5rem",fontSize:".71rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"var(--rose-700)"}}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>setShowForm(false)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>{editId?"Editar agendamento":"Novo agendamento"}</h3>
              <button className="icon-btn" onClick={()=>setShowForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Paciente *
                <div style={{position:"relative"}}>
                  <div style={{position:"absolute",left:".75rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",pointerEvents:"none"}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </div>
                  <input
                    value={patSearch}
                    onChange={e=>{ setPatSearch(e.target.value); if(patSelected&&e.target.value!==patSelected.name){ setPatSelected(null); setForm(s=>({...s,patientId:""})); } }}
                    placeholder="Buscar por nome, CPF ou telefone..."
                    autoComplete="off"
                    style={{paddingLeft:"2.2rem",width:"100%",boxSizing:"border-box",fontWeight:400,
                      border:patSelected?"2px solid var(--teal-500)":"1px solid var(--border)",borderRadius:"var(--r-md)"}}/>
                  {patSelected&&(
                    <div style={{position:"absolute",right:".6rem",top:"50%",transform:"translateY(-50%)",
                      width:18,height:18,borderRadius:"50%",background:"var(--teal-500)",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                  {patSearch.length>=2&&!patSelected&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
                      border:"1px solid var(--border)",borderTop:"none",borderRadius:"0 0 var(--r-md) var(--r-md)",
                      background:"var(--surface)",boxShadow:"0 4px 12px rgba(0,0,0,.08)",maxHeight:200,overflowY:"auto"}}>
                      {patResults.length===0?(
                        <div style={{padding:".65rem .9rem",fontSize:".8rem"}}>
                          <div style={{color:"var(--text-3)",marginBottom:".5rem"}}>Nenhum paciente encontrado.</div>
                          <button type="button" onClick={()=>{ const n=patSearch; setPatSearch(""); setNewPatForm({name:n,cpf:"",phone:"",careCategory:"general",birthDate:"",teamId:String(user?.teamId||"")}); setNewPatErr(""); setShowNewPat(true); }}
                            style={{fontSize:".78rem",padding:".3rem .65rem",background:"var(--teal-50)",color:"var(--teal-700)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                            + Cadastrar novo paciente
                          </button>
                        </div>
                      ):patResults.map(p=>{
                        const am=ageInMonths(p.birthDate);
                        return(
                          <button key={p.id} type="button"
                            onClick={()=>{ setPatSelected(p); setPatSearch(p.name); setForm(s=>({...s,patientId:p.id})); }}
                            style={{display:"flex",alignItems:"center",gap:".65rem",width:"100%",padding:".5rem .9rem",
                              background:"none",border:"none",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--teal-100)",
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                              fontSize:".7rem",fontWeight:700,color:"var(--teal-700)"}}>
                              {initials(p.name)}
                            </div>
                            <div style={{minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:".83rem",color:"var(--ink)"}}>{p.name}</div>
                              <div style={{fontSize:".71rem",color:"var(--text-3)"}}>
                                {p.careCategory||"Geral"}{am!==null?` · ${am<24?am+"m":Math.floor(am/12)+"a"}`:""}
                                {p.cpf?` · CPF ${p.cpf}`:""}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {patResults.length>0&&(
                        <div style={{padding:".4rem .9rem",borderTop:"1px solid var(--border)"}}>
                          <button type="button" onClick={()=>{ const n=patSearch; setPatSearch(""); setNewPatForm({name:n,cpf:"",phone:"",careCategory:"general",birthDate:"",teamId:String(user?.teamId||"")}); setNewPatErr(""); setShowNewPat(true); }}
                            style={{fontSize:".75rem",padding:".25rem .55rem",background:"none",color:"var(--teal-600)",border:"1px dashed var(--teal-300)",borderRadius:"var(--r-md)",cursor:"pointer"}}>
                            + Cadastrar novo paciente
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </label>

              {/* Cadastro rápido de novo paciente */}
              {showNewPat&&(
                <div style={{gridColumn:"span 2",background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",padding:".85rem",display:"flex",flexDirection:"column",gap:".6rem"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontWeight:700,fontSize:".78rem",color:"var(--teal-700)"}}>+ Cadastro rápido de paciente</span>
                    <button type="button" onClick={()=>setShowNewPat(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-3)",fontSize:"1rem",lineHeight:1,padding:0}}>×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Nome completo *
                      <input value={newPatForm.name} onChange={e=>setNewPatForm(s=>({...s,name:e.target.value}))} placeholder="Nome do paciente" style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      CPF
                      <input value={newPatForm.cpf} onChange={e=>setNewPatForm(s=>({...s,cpf:formatCpf(e.target.value)}))} placeholder="000.000.000-00" style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Telefone
                      <input value={newPatForm.phone} onChange={e=>setNewPatForm(s=>({...s,phone:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Nascimento
                      <input type="date" value={newPatForm.birthDate} onChange={e=>setNewPatForm(s=>({...s,birthDate:e.target.value}))} style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Categoria
                      <select value={newPatForm.careCategory} onChange={e=>setNewPatForm(s=>({...s,careCategory:e.target.value}))} style={{fontSize:".8rem"}}>
                        <option value="general">Geral</option>
                        <option value="pregnant">Gestante</option>
                        <option value="hypertension">Hipertensão</option>
                        <option value="diabetes">Diabetes</option>
                        <option value="elderly">Idoso</option>
                        <option value="child_followup">Puericultura</option>
                      </select>
                    </label>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Equipe responsável
                      <select value={newPatForm.teamId} onChange={e=>setNewPatForm(s=>({...s,teamId:e.target.value}))} style={{fontSize:".8rem"}}>
                        <option value="">Selecione...</option>
                        {(teams||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {newPatErr&&<div style={{fontSize:".75rem",color:"var(--rose-700)"}}>{newPatErr}</div>}
                  <button type="button"
                    onClick={()=>{
                      if(!newPatForm.name.trim()){setNewPatErr("Nome obrigatório.");return;}
                      if(!String(newPatForm.teamId||"").trim()){setNewPatErr("Selecione a equipe responsável.");return;}
                      const np={...emptyPatientForm(),name:newPatForm.name.trim(),cpf:newPatForm.cpf,phone:newPatForm.phone,birthDate:newPatForm.birthDate,careCategory:newPatForm.careCategory,teamId:newPatForm.teamId,id:"local_"+Date.now(),incompleteProfile:true};
                      setPatSelected(np); setPatSearch(np.name); setForm(s=>({...s,patientId:np.id}));
                      setShowNewPat(false); setNewPatErr("");
                    }}
                    style={{alignSelf:"flex-end",fontSize:".78rem",padding:".35rem .8rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                    ✓ Usar este paciente
                  </button>
                </div>
              )}
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Data *
                <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))}/>
                {form.date&&isUnavailableDay(form.date)&&(
                  <span style={{fontSize:".72rem",color:"var(--orange-700)",fontWeight:600,display:"flex",alignItems:"center",gap:".3rem"}}>
                    ⚠️ {unavailableReason(form.date)} — confirme se necessário
                  </span>
                )}
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Horário *
                <select value={form.time} onChange={e=>setForm(s=>({...s,time:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {AGENDA_HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Profissional
                <select value={form.doctorId} onChange={e=>setForm(s=>({...s,doctorId:e.target.value}))}>
                  <option value="">Sem preferência</option>
                  {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Tipo
                <select value={form.type} onChange={e=>setForm(s=>({...s,type:e.target.value}))}>
                  <option value="consultation">Consulta</option>
                  <option value="return">Retorno</option>
                  <option value="procedure">Procedimento</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Observações
                <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Motivo, solicitações especiais..."/>
              </label>
              <div style={{gridColumn:"span 2",display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowForm(false)} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AgendaPage;
