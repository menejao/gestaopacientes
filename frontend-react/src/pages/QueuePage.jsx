import { useState, useMemo, useRef } from "react";
import { readLS, writeLS } from "../utils/storage";
import { QUEUE_KEY, NOTIFS_KEY, AGENDA_KEY, PRIORITY_LABELS, PRIORITY_COLORS } from "../config/constants";
import { matchesPatientSearch, isChildCategory, ageInMonths } from "../utils/clinical";
import { initials, formatCpf, formatCns, formatPhone, formatCep } from "../utils/formatting";
import { parseLocalDate } from "../utils/dates";
import { createPatient } from "../api";
import PageHero from "../components/layout/PageHero";

function QueuePage({ patients, users, user, token, onNewPatient }) {
  const [queue, setQueue]         = useState(()=>readLS(QUEUE_KEY,[]));
  const [showForm, setShowForm]   = useState(false);
  const [step, setStep]           = useState("select"); // select | new-patient
  const [demandType, setDemandType] = useState("scheduled");
  const [destination, setDestination] = useState("doctor");
  const [priority, setPriority]   = useState("normal");
  const [reason, setReason]       = useState("");
  const [agendaRef, setAgendaRef] = useState(null);
  // Patient search
  const [searchQ, setSearchQ]     = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const searchRef = useRef(null);
  // New patient form
  const emptyNew = () => ({
    name:"", cpf:"", cns:"", birthDate:"", sex:"", maritalStatus:"", motherName:"",
    phone:"", phoneAlt:"", zipCode:"", address:"", number:"", complement:"",
    neighborhood:"", city:"", state:"", careCategory:"general", assignedAcsId:"",
    pregnancyStartDate:"", expectedDeliveryDate:"",
    gestationalAgeDumWeeks:"", gestationalAgeDumDays:"",
    gestationalAgeUsgWeeks:"", gestationalAgeUsgDays:"",
    usgDate1:"", usgDate2:"", usgDate3:"",
    allergies:"", comorbidities:"", medications:"",
    microarea:"", familyCode:"", homeVisitFreq:"",
    housingType:"", waterSupply:"", sewage:"", garbage:"", electricity:"",
  });
  const [newPat, setNewPat]       = useState(emptyNew());
  const [savingNew, setSavingNew] = useState(false);
  const [newPatErr, setNewPatErr] = useState("");

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY,q); }

  // Search results — min 2 chars
  const searchResults = useMemo(() => {
    const q = searchQ.trim();
    if (q.length < 2) return [];
    const inQueue = queue.filter(e=>e.status!=="done").map(e=>e.patientId);
    return patients.filter(p => !inQueue.includes(p.id) && matchesPatientSearch(p, q)).slice(0, 8);
  }, [searchQ, patients, queue]);

  function selectPatient(p) {
    setSelectedPatient(p);
    setSearchQ(p.name);
    // Auto priority
    const cat = String(p.careCategory||"").toLowerCase();
    let prio = "normal";
    if (cat==="pregnant") prio="pregnant";
    else {
      const age = p.birthDate ? Math.floor((new Date()-(parseLocalDate(p.birthDate)||new Date()))/31557600000) : null;
      if (age!==null && age>=60) prio="elderly";
      else if (age!==null && age<12) prio="child";
    }
    setPriority(prio);
    // Check agenda today
    const today = new Date().toISOString().slice(0,10);
    const agenda = readLS(AGENDA_KEY,[]);
    const ref = agenda.find(a=>a.patientId===p.id&&a.date===today&&a.status!=="done");
    setAgendaRef(ref||null);
    if (ref) setDemandType("scheduled");
  }

  function resetForm() {
    setStep("select"); setSearchQ(""); setSelectedPatient(null);
    setDemandType("scheduled"); setDestination("doctor");
    setPriority("normal"); setReason(""); setAgendaRef(null);
    setNewPat(emptyNew()); setNewPatErr("");
  }

  function addToQueue() {
    if (!selectedPatient) return;
    const notif = {
      id:"q"+Date.now(), type:demandType==="scheduled"?"info":"warn",
      icon:"check",
      title: demandType==="scheduled"
        ? `Paciente chegou: ${selectedPatient.name}`
        : `Paciente espontâneo: ${selectedPatient.name}`,
      detail: demandType==="scheduled"
        ? `Consulta confirmada. Prioridade: ${PRIORITY_LABELS[priority]}.`
        : `Encaminhar para: ${destination==="doctor"?"Médico(a)":"Enfermagem"}. ${reason||""}`,
      patientId:selectedPatient.id, dest:demandType==="spontaneous"?destination:null,
      ts:new Date().toISOString(), read:false,
    };
    const prev = readLS(NOTIFS_KEY,[]);
    writeLS(NOTIFS_KEY, [notif,...prev].slice(0,50));

    const entry = {
      id:"q"+Date.now(), patientId:selectedPatient.id, patientName:selectedPatient.name,
      priority, reason, demandType, destination:demandType==="spontaneous"?destination:null,
      agendaRef:agendaRef?.id||null, arrivedAt:new Date().toISOString(), status:"waiting",
    };
    saveQueue([...queue, entry]);
    resetForm(); setShowForm(false);
  }

  async function saveNewPatient(e) {
    e.preventDefault();
    if (!newPat.name.trim()) { setNewPatErr("Nome é obrigatório."); return; }
    setSavingNew(true); setNewPatErr("");
    try {
      const territorial = [
        newPat.microarea    ? `Microárea: ${newPat.microarea}`        : "",
        newPat.familyCode   ? `Cód.família: ${newPat.familyCode}`     : "",
        newPat.homeVisitFreq? `Freq.visita: ${newPat.homeVisitFreq}`  : "",
        newPat.housingType  ? `Moradia: ${newPat.housingType}`        : "",
        newPat.waterSupply  ? `Água: ${newPat.waterSupply}`           : "",
        newPat.sewage       ? `Esgoto: ${newPat.sewage}`              : "",
        newPat.garbage      ? `Lixo: ${newPat.garbage}`               : "",
        newPat.electricity  ? `Energia: ${newPat.electricity}`        : "",
      ].filter(Boolean).join(" | ");

      const payload = {
        name:newPat.name.trim(), motherName:newPat.motherName.trim(),
        cpf:newPat.cpf.trim(), cns:newPat.cns.trim(), birthDate:newPat.birthDate,
        phone:newPat.phone.trim(), phoneAlt:newPat.phoneAlt.trim(),
        sex:newPat.sex, maritalStatus:newPat.maritalStatus,
        careCategory:newPat.careCategory||"general", assignedAcsId:"",
        zipCode:newPat.zipCode.trim(), address:newPat.address.trim(),
        number:newPat.number.trim(), complement:newPat.complement.trim(),
        neighborhood:newPat.neighborhood.trim(), city:newPat.city.trim(),
        state:newPat.state.trim().toUpperCase(),
        allergies:newPat.allergies.trim(), comorbidities:newPat.comorbidities.trim(),
        medications:newPat.medications.trim()+(territorial?(" | [Territorial] "+territorial):""),
        pregnancyStartDate:newPat.pregnancyStartDate||"",
        expectedDeliveryDate:newPat.expectedDeliveryDate||"",
        gestationalAgeDumWeeks:newPat.gestationalAgeDumWeeks===""?null:Number(newPat.gestationalAgeDumWeeks),
        gestationalAgeDumDays:newPat.gestationalAgeDumDays===""?null:Number(newPat.gestationalAgeDumDays),
        gestationalAgeUsgWeeks:newPat.gestationalAgeUsgWeeks===""?null:Number(newPat.gestationalAgeUsgWeeks),
        gestationalAgeUsgDays:newPat.gestationalAgeUsgDays===""?null:Number(newPat.gestationalAgeUsgDays),
        usgDate1:newPat.usgDate1||"", usgDate2:newPat.usgDate2||"", usgDate3:newPat.usgDate3||"",
      };
      let created;
      if (token && !String(token).startsWith("local_")) {
        created = await createPatient(token, payload);
      } else {
        created = { ...payload, id:"local_"+Date.now() };
        if (onNewPatient) onNewPatient(created);
      }
      if (onNewPatient && created?.id) onNewPatient(created);
      setSelectedPatient({ ...created, name:newPat.name.trim() });
      setSearchQ(newPat.name.trim());
      setStep("select");
    } catch(err) { setNewPatErr(err.message||"Erro ao cadastrar paciente."); }
    finally { setSavingNew(false); }
  }

  function updateStatus(id, status) { saveQueue(queue.map(q=>q.id===id?{...q,status,updatedAt:new Date().toISOString()}:q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q=>q.id!==id)); }
  function clearDone() { saveQueue(queue.filter(q=>q.status==="waiting"||q.status==="attending"||q.status==="triage"||q.status==="ready")); }

  const sorted = [...queue].sort((a,b)=>{
    if (a.status==="done"&&b.status!=="done") return 1;
    if (b.status==="done"&&a.status!=="done") return -1;
    const po=PRIORITY_COLORS,pa=po[a.priority]?.order ?? 4,pb=po[b.priority]?.order ?? 4;
    if(pa!==pb) return pa-pb;
    return a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting   = sorted.filter(q=>q.status==="waiting").length;
  const attending = sorted.filter(q=>q.status==="attending").length;
  const alreadyInQueue = queue.filter(q=>q.status!=="done").map(q=>q.patientId);

  function fmtTime(iso) {
    if(!iso)return"";
    return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }
  function waitMins(iso) {
    const mins = Math.floor((new Date()-new Date(iso))/60000);
    return mins<1?"agora":mins<60?`${mins}min`:`${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}`;
  }

  const BTN_CANCEL = {flex:1,background:"var(--surface-2)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:500,cursor:"pointer"};
  const BTN_PRIMARY = {flex:1,background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:600,cursor:"pointer"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Recepção"
        title="Fila de Atendimento"
        subtitle="Triagem, prioridade e fluxo de pacientes no dia."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <button onClick={()=>{resetForm();setShowForm(true);}} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Dar entrada
          </button>
        }
      />

      {/* KPIs */}
      <div style={{display:"flex",gap:".75rem",padding:"0 1.5rem .75rem"}}>
        {[["Aguardando","⏳",waiting,"var(--blue-700)","var(--blue-50)"],["Em atendimento","🩺",attending,"var(--orange-700)","var(--orange-50)"],["Total hoje","📋",sorted.length,"var(--text-2)","var(--surface-2)"]].map(([l,ic,v,color,bg])=>(
          <div key={l} className="card" style={{flex:"1 1 120px",padding:".75rem 1rem",background:bg,border:`1px solid ${bg==="var(--surface-2)"?"var(--border)":bg.replace("ff)","dd)")}`}}>
            <div style={{fontSize:"1.2rem"}}>{ic}</div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color,lineHeight:1.1,marginTop:".25rem"}}>{v}</div>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{l}</div>
          </div>
        ))}
        {sorted.some(q=>q.status==="done")&&<button onClick={clearDone} style={{alignSelf:"center",fontSize:".75rem",padding:".4rem .8rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>Limpar concluídos</button>}
      </div>

      {/* Queue list */}
      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {!sorted.length?(
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>🏥</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>🏥 Nenhum paciente na fila</div>
            <button onClick={()=>{resetForm();setShowForm(true);}} style={{marginTop:"1rem",fontSize:".8rem"}}>+ Dar entrada</button>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
            {sorted.map((q,i)=>{
              const pc=PRIORITY_COLORS[q.priority]||PRIORITY_COLORS.normal;
              const isDone=q.status==="done";
              return(
                <div key={q.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".7rem 1rem",borderRadius:"var(--r-md)",
                  background:isDone?"var(--surface-2)":pc.bg,border:`1px solid ${isDone?"var(--border)":pc.border}`,opacity:isDone?.6:1}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:isDone?"var(--border)":pc.border,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:".72rem",fontWeight:800,color:isDone?"var(--text-3)":pc.text}}>{i+1}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:".88rem",color:isDone?"var(--text-3)":"var(--ink)"}}>{q.patientName}</span>
                      <span style={{fontSize:".68rem",padding:".08rem .4rem",borderRadius:999,background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`,fontWeight:700}}>{PRIORITY_LABELS[q.priority]}</span>
                      {q.demandType==="spontaneous"&&<span style={{fontSize:".68rem",padding:".08rem .4rem",borderRadius:999,background:"var(--orange-50)",color:"var(--orange-700)",border:"1px solid #fed7aa",fontWeight:700}}>Espontâneo → {q.destination==="nurse"?"Enfermagem":"Médico(a)"}</span>}
                      {q.demandType==="scheduled"&&<span style={{fontSize:".68rem",padding:".08rem .4rem",borderRadius:999,background:"var(--blue-50)",color:"var(--blue-700)",border:"1px solid #bfdbfe",fontWeight:700}}>Agendado</span>}
                    </div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>
                      Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}{q.reason&&" · "+q.reason}
                    </div>
                  </div>
                  {!isDone&&(
                    <div style={{display:"flex",gap:".35rem",flexShrink:0}}>
                      {q.status==="waiting"&&<span style={{fontSize:".72rem",padding:".25rem .55rem",borderRadius:999,background:"var(--blue-50)",color:"var(--blue-700)",border:"1px solid #bfdbfe",fontWeight:600}}>Aguardando triagem</span>}
                      {q.status==="triage"&&<span style={{fontSize:".72rem",padding:".25rem .55rem",borderRadius:999,background:"var(--amber-100)",color:"var(--amber-700)",border:"1px solid #fde68a",fontWeight:600}}>Em triagem</span>}
                      {q.status==="ready"&&<button onClick={()=>updateStatus(q.id,"attending")} style={{fontSize:".78rem",padding:".35rem .75rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer"}}>🩺 Chamar</button>}
                      {q.status==="attending"&&<button onClick={()=>updateStatus(q.id,"done")} style={{fontSize:".78rem",padding:".35rem .75rem",background:"var(--green-700)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer"}}>✓ Concluir</button>}
                      <button onClick={()=>removeFromQueue(q.id)} style={{fontSize:".78rem",padding:".35rem .6rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"var(--rose-700)",cursor:"pointer"}}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>{setShowForm(false);resetForm();}}>
          <div className="modal" style={{maxWidth:500,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
              <div>
                <h3 style={{margin:0,fontSize:"1rem"}}>Dar entrada na fila</h3>
                <p style={{margin:".2rem 0 0",fontSize:".74rem",color:"var(--text-3)"}}>
                  {step==="select"?"Busque o paciente ou cadastre um novo":"Cadastro de novo paciente"}
                </p>
              </div>
              <button className="icon-btn" onClick={()=>{setShowForm(false);resetForm();}}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>

            {/* ── STEP: SELECT ── */}
            {step==="select"&&(
              <div style={{display:"flex",flexDirection:"column",gap:".85rem"}}>
                {/* Search */}
                <div>
                  <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".3rem"}}>Paciente *</label>
                  <div style={{position:"relative"}}>
                    <div style={{position:"absolute",left:".75rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",pointerEvents:"none"}}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    </div>
                    <input ref={searchRef} value={searchQ}
                      onChange={e=>{setSearchQ(e.target.value);if(selectedPatient&&e.target.value!==selectedPatient.name){setSelectedPatient(null);setAgendaRef(null);}}}
                      placeholder="Nome, CPF ou telefone..." autoFocus
                      style={{paddingLeft:"2.2rem",width:"100%",boxSizing:"border-box",
                        border:selectedPatient?"2px solid var(--teal-500)":"1px solid var(--border)",borderRadius:"var(--r-md)"}}/>
                    {selectedPatient&&(
                      <div style={{position:"absolute",right:".6rem",top:"50%",transform:"translateY(-50%)",
                        width:18,height:18,borderRadius:"50%",background:"var(--teal-500)",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </div>

                  {/* Dropdown */}
                  {searchQ.length>=2&&!selectedPatient&&(
                    <div style={{border:"1px solid var(--border)",borderTop:"none",borderRadius:"0 0 var(--r-md) var(--r-md)",
                      background:"var(--surface)",boxShadow:"0 4px 12px rgba(0,0,0,.08)",maxHeight:220,overflowY:"auto"}}>
                      {searchResults.length===0?(
                        <div style={{padding:".65rem .9rem"}}>
                          <div style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:".5rem"}}>Nenhum paciente encontrado.</div>
                          <button type="button" onClick={()=>setStep("new-patient")}
                            style={{fontSize:".78rem",padding:".35rem .75rem",background:"var(--teal-50)",color:"var(--teal-700)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                            + Cadastrar novo paciente
                          </button>
                        </div>
                      ):(
                        <>
                          {searchResults.map(p=>{
                            const am=ageInMonths(p.birthDate);
                            const catName=p.careCategory||"general";
                            return(
                              <button key={p.id} type="button" onClick={()=>selectPatient(p)}
                                style={{display:"flex",alignItems:"center",gap:".65rem",width:"100%",padding:".55rem .9rem",
                                  background:"none",border:"none",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}
                                onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                                <div style={{width:30,height:30,borderRadius:"50%",background:"var(--teal-100)",
                                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                                  fontSize:".72rem",fontWeight:700,color:"var(--teal-700)"}}>
                                  {initials(p.name)}
                                </div>
                                <div style={{minWidth:0}}>
                                  <div style={{fontWeight:600,fontSize:".83rem",color:"var(--ink)"}}>{p.name}</div>
                                  <div style={{fontSize:".71rem",color:"var(--text-3)"}}>
                                    {catName}{am!==null?` · ${am<24?am+"m":Math.floor(am/12)+"a"}`:""}
                                    {p.phone?` · ${p.phone}`:""}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                          <div style={{padding:".5rem .9rem",borderTop:"1px solid var(--border)"}}>
                            <button type="button" onClick={()=>setStep("new-patient")}
                              style={{fontSize:".75rem",padding:".28rem .6rem",background:"none",color:"var(--teal-600)",border:"1px dashed var(--teal-300)",borderRadius:"var(--r-md)",cursor:"pointer"}}>
                              + Cadastrar novo paciente
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Selected card */}
                  {selectedPatient&&(
                    <div style={{marginTop:".5rem",padding:".6rem .85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",display:"flex",alignItems:"center",gap:".75rem"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"var(--teal-500)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:".85rem",fontWeight:700,color:"white"}}>{initials(selectedPatient.name)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--teal-800)"}}>{selectedPatient.name}</div>
                        {agendaRef&&<div style={{fontSize:".73rem",color:"var(--teal-600)",marginTop:".1rem"}}>📅 Consulta agendada — {agendaRef.time||"sem horário"}{agendaRef.doctorName?` · ${agendaRef.doctorName}`:""}</div>}
                      </div>
                      <button type="button" onClick={()=>{setSelectedPatient(null);setSearchQ("");setAgendaRef(null);}} className="icon-btn">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  )}
                </div>

                {!selectedPatient&&searchQ.length<2&&(
                  <p style={{fontSize:".78rem",color:"var(--text-3)",textAlign:"center",padding:".25rem 0"}}>
                    Digite 2+ caracteres para buscar · ou{" "}
                    <button type="button" onClick={()=>setStep("new-patient")} style={{background:"none",border:"none",color:"var(--teal-600)",cursor:"pointer",fontWeight:600,fontSize:".78rem",padding:0}}>cadastre um novo paciente</button>
                  </p>
                )}

                {/* Demand type + destination + priority + reason */}
                {selectedPatient&&(<>
                  <div>
                    <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".4rem"}}>Tipo de demanda *</label>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                      {[["scheduled","Agendado","Consulta marcada","var(--blue-50)","var(--blue-700)","var(--blue-200)"],["spontaneous","Espontâneo","Sem agendamento","var(--orange-50)","var(--orange-700)","var(--orange-200)"]].map(([val,label,desc,bg,color,border])=>(
                        <button key={val} type="button" onClick={()=>setDemandType(val)}
                          style={{padding:".65rem .85rem",borderRadius:"var(--r-md)",border:`2px solid ${demandType===val?color:border}`,background:demandType===val?bg:"var(--surface)",cursor:"pointer",textAlign:"left"}}>
                          <div style={{fontWeight:700,fontSize:".82rem",color:demandType===val?color:"var(--text-1)"}}>{label}</div>
                          <div style={{fontSize:".71rem",color:"var(--text-3)",marginTop:".15rem"}}>{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {demandType==="spontaneous"&&(
                    <div>
                      <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".4rem"}}>Encaminhar para *</label>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                        {[["doctor","Médico(a)"],["nurse","Enfermagem"]].map(([val,label])=>(
                          <button key={val} type="button" onClick={()=>setDestination(val)}
                            style={{padding:".55rem .75rem",borderRadius:"var(--r-md)",fontWeight:600,fontSize:".82rem",cursor:"pointer",
                              border:`2px solid ${destination===val?"var(--teal-500)":"var(--border)"}`,
                              background:destination===val?"var(--teal-50)":"var(--surface)",
                              color:destination===val?"var(--teal-700)":"var(--text-2)"}}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".3rem"}}>Prioridade</label>
                    <select value={priority} onChange={e=>setPriority(e.target.value)}>
                      {Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".3rem"}}>Motivo / queixa principal</label>
                    <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Dor, retorno, renovação de receita..."/>
                  </div>

                  <div style={{padding:".6rem .85rem",background:demandType==="scheduled"?"var(--blue-50)":"var(--orange-50)",
                    border:`1px solid ${demandType==="scheduled"?"var(--blue-200)":"var(--orange-200)"}`,borderRadius:"var(--r-md)",
                    fontSize:".75rem",color:demandType==="scheduled"?"var(--blue-700)":"var(--orange-700)",display:"flex",alignItems:"flex-start",gap:".5rem"}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:".1rem"}}><path d="M8 1.5a5 5 0 00-5 5v3l-1.5 2h13L13 9.5v-3a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <span><strong>Aviso:</strong> {demandType==="scheduled"?`Profissional será notificado que ${selectedPatient.name} chegou.`:`${destination==="doctor"?"Médico(a)":"Enfermagem"} receberá aviso de paciente espontâneo.`}</span>
                  </div>

                  <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
                    <button type="button" onClick={()=>{setShowForm(false);resetForm();}} style={BTN_CANCEL}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                      onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}>Cancelar</button>
                    <button type="button" onClick={addToQueue} style={BTN_PRIMARY}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--teal-700)"}
                      onMouseLeave={e=>e.currentTarget.style.background="var(--teal-600)"}>Confirmar entrada</button>
                  </div>
                </>)}
              </div>
            )}

            {/* ── STEP: NEW PATIENT ── */}
            {step==="new-patient"&&(
              <form onSubmit={saveNewPatient} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
                {/* Identificação */}
                <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                  <p style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",margin:"0 0 .6rem"}}>Identificação</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Nome completo *<input value={newPat.name} onChange={e=>setNewPat(s=>({...s,name:e.target.value}))} placeholder="Nome do paciente" autoFocus/></label>
                    {isChildCategory(newPat.careCategory)&&<label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Nome do responsável<input value={newPat.motherName} onChange={e=>setNewPat(s=>({...s,motherName:e.target.value}))}/></label>}
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Data de nascimento<input type="date" value={newPat.birthDate} onChange={e=>setNewPat(s=>({...s,birthDate:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Sexo<select value={newPat.sex} onChange={e=>setNewPat(s=>({...s,sex:e.target.value}))}><option value="">Não informado</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
                    {!isChildCategory(newPat.careCategory)&&<label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Estado civil<select value={newPat.maritalStatus} onChange={e=>setNewPat(s=>({...s,maritalStatus:e.target.value}))}><option value="">Não informado</option><option value="solteiro">Solteiro(a)</option><option value="casado">Casado(a)</option><option value="uniao_estavel">União estável</option><option value="divorciado">Divorciado(a)</option><option value="viuvo">Viúvo(a)</option></select></label>}
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>CPF<input value={newPat.cpf} onChange={e=>setNewPat(s=>({...s,cpf:formatCpf(e.target.value)}))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>CNS<input value={newPat.cns} onChange={e=>setNewPat(s=>({...s,cns:formatCns(e.target.value)}))} placeholder="000 0000 0000 0000" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Telefone<input value={newPat.phone} onChange={e=>setNewPat(s=>({...s,phone:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Telefone 2<input value={newPat.phoneAlt} onChange={e=>setNewPat(s=>({...s,phoneAlt:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Categoria<select value={newPat.careCategory} onChange={e=>setNewPat(s=>({...s,careCategory:e.target.value}))}><option value="general">Geral</option><option value="pregnant">Gestante</option><option value="child_followup">Puericultura</option><option value="elderly">Pessoa Idosa</option><option value="puerperal">Puérpera</option></select></label>
                  </div>
                </div>
                {/* Endereço */}
                <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                  <p style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",margin:"0 0 .6rem"}}>Endereço</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>CEP<input value={newPat.zipCode} onChange={e=>setNewPat(s=>({...s,zipCode:formatCep(e.target.value)}))} placeholder="00000-000" inputMode="numeric" maxLength={9}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>UF<input value={newPat.state} onChange={e=>setNewPat(s=>({...s,state:e.target.value.toUpperCase().slice(0,2)}))} placeholder="SP" maxLength={2}/></label>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Rua<input value={newPat.address} onChange={e=>setNewPat(s=>({...s,address:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Número<input value={newPat.number} onChange={e=>setNewPat(s=>({...s,number:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Complemento<input value={newPat.complement} onChange={e=>setNewPat(s=>({...s,complement:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Bairro<input value={newPat.neighborhood} onChange={e=>setNewPat(s=>({...s,neighborhood:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Cidade<input value={newPat.city} onChange={e=>setNewPat(s=>({...s,city:e.target.value}))}/></label>
                  </div>
                </div>
                {/* Gestação */}
                {String(newPat.careCategory||"").toLowerCase()==="pregnant"&&(
                  <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                    <p style={{fontWeight:700,fontSize:".8rem",color:"var(--teal-700)",margin:"0 0 .6rem"}}>Dados gestacionais</p>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>DUM<input type="date" value={newPat.pregnancyStartDate} onChange={e=>setNewPat(s=>({...s,pregnancyStartDate:e.target.value}))}/></label>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>DPP<input type="date" value={newPat.expectedDeliveryDate} onChange={e=>setNewPat(s=>({...s,expectedDeliveryDate:e.target.value}))}/></label>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>IG DUM (sem)<input type="number" min="0" max="45" value={newPat.gestationalAgeDumWeeks} onChange={e=>setNewPat(s=>({...s,gestationalAgeDumWeeks:e.target.value}))}/></label>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>IG DUM (dias)<input type="number" min="0" max="6" value={newPat.gestationalAgeDumDays} onChange={e=>setNewPat(s=>({...s,gestationalAgeDumDays:e.target.value}))}/></label>
                    </div>
                  </div>
                )}
                {/* Clínico */}
                <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                  <p style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",margin:"0 0 .6rem"}}>Informações clínicas</p>
                  <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Alergias<textarea value={newPat.allergies} onChange={e=>setNewPat(s=>({...s,allergies:e.target.value}))} placeholder="Medicamentos, alimentos..." style={{minHeight:44,resize:"vertical"}}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Comorbidades<textarea value={newPat.comorbidities} onChange={e=>setNewPat(s=>({...s,comorbidities:e.target.value}))} placeholder="Hipertensão, diabetes..." style={{minHeight:44,resize:"vertical"}}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Medicamentos em uso<textarea value={newPat.medications} onChange={e=>setNewPat(s=>({...s,medications:e.target.value}))} placeholder="Nome, dose, frequência..." style={{minHeight:44,resize:"vertical"}}/></label>
                  </div>
                </div>
                {/* Territorial */}
                <details style={{borderRadius:"var(--r-md)",border:"1px solid var(--border)"}}>
                  <summary style={{padding:".6rem .85rem",cursor:"pointer",fontWeight:700,fontSize:".8rem",color:"var(--text-2)",listStyle:"none",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>📍 Cadastro territorial</span>
                    <span style={{fontSize:".71rem",color:"var(--text-3)",fontWeight:400}}>Opcional — ACS preenche depois</span>
                  </summary>
                  <div style={{padding:".75rem .85rem",borderTop:"1px solid var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Microárea<input value={newPat.microarea} onChange={e=>setNewPat(s=>({...s,microarea:e.target.value}))} placeholder="Ex: 01"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Código de família<input value={newPat.familyCode} onChange={e=>setNewPat(s=>({...s,familyCode:e.target.value}))} placeholder="Ex: 0010001"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Freq. visita ACS<input value={newPat.homeVisitFreq} onChange={e=>setNewPat(s=>({...s,homeVisitFreq:e.target.value}))} placeholder="Mensal, quinzenal..."/></label>
                    {[["Tipo de moradia","housingType",["Alvenaria","Madeira","Taipa","Improvisada","Outro"]],["Abastecimento de água","waterSupply",["Rede pública","Poço/nascente","Outros"]],["Esgotamento sanitário","sewage",["Rede pública","Fossa séptica","Fossa rudimentar","Céu aberto","Outro"]],["Destino do lixo","garbage",["Coletado","Queimado","Enterrado","Céu aberto","Outro"]],["Energia elétrica","electricity",["Sim","Não","Irregular"]]].map(([label,field,opts])=>(
                      <label key={field} style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>{label}<select value={newPat[field]} onChange={e=>setNewPat(s=>({...s,[field]:e.target.value}))}><option value="">Não informado</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></label>
                    ))}
                  </div>
                </details>

                {newPatErr&&<p className="error" style={{margin:0}}>{newPatErr}</p>}
                <div style={{display:"flex",gap:".5rem"}}>
                  <button type="button" onClick={()=>setStep("select")} style={BTN_CANCEL}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                    onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}>← Voltar</button>
                  <button type="submit" disabled={savingNew} style={BTN_PRIMARY}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--teal-700)"}
                    onMouseLeave={e=>e.currentTarget.style.background="var(--teal-600)"}>{savingNew?"Cadastrando...":"Cadastrar e continuar →"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default QueuePage;
