import { useState, useMemo } from "react";
import { AGENDA_KEY, QUEUE_KEY, RECEPTION_USERS } from "../config/constants";
import { readLS, writeLS } from "../utils/storage";
import { matchesPatientSearch, gestationalAgeInfo, ageInMonths } from "../utils/clinical";
import { isUnavailableDay, unavailableReason, parseLocalDate } from "../utils/dates";
import { initials, fmtDate } from "../utils/formatting";

const IconLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2v14M2 9h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

function ReceptionLoginModal({ onLogin, onClose }) {
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw })
      });
      if (!res.ok) { setErr("E-mail ou senha incorretos."); return; }
      const data = await res.json();
      // Monta objeto de usuário compatível com RECEPTION_USERS
      const meta = RECEPTION_USERS.find(r => r.email.toLowerCase()===email.trim().toLowerCase());
      const u = { ...(meta||{}), ...data.user, _token: data.token };
      onLogin(u);
    } catch { setErr("Erro de conexão. Tente novamente."); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:380,padding:"2rem"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:"1.5rem"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"var(--teal-600)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="white" strokeWidth="1.4"/>
              <path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M5 10h2M9 10h2M5 12.5h2" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:".95rem",color:"var(--ink)"}}>Acesso — Recepção</div>
            <div style={{fontSize:".72rem",color:"var(--text-3)"}}>Entre com suas credenciais de recepção</div>
          </div>
          <button className="icon-btn" style={{marginLeft:"auto"}} onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            E-mail
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="recepcao@ubs.local" autoFocus/>
          </label>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            Senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢"/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <button type="submit" style={{marginTop:".25rem"}}>Entrar na Recepção</button>
        </form>
      </div>
    </div>
  );
}

function ReceptionistApp({ recUser, patients, users, templates, onLogout }) {
  const [tab, setTab]               = useState("queue");
  const [search, setSearch]         = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Agenda state
  const [agenda, setAgenda]         = useState(()=>readLS(AGENDA_KEY,[]));
  const [selectedDate, setSelectedDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaEditId, setAgendaEditId] = useState(null);
  const [agendaForm, setAgendaForm] = useState({patientId:"",doctorId:"",date:"",time:"",type:"consultation",notes:"",status:"scheduled"});

  // Queue state
  const [queue, setQueue]           = useState(()=>readLS(QUEUE_KEY,[]));
  const [showQueueForm, setShowQueueForm] = useState(false);
  const [queueForm, setQueueForm]   = useState({patientId:"",priority:"normal",reason:""});

  const saveAgenda = (a) => { setAgenda(a); writeLS(AGENDA_KEY,a); };
  const saveQueue  = (q) => { setQueue(q);  writeLS(QUEUE_KEY,q);  };

  const doctors = users.filter(u=>["doctor","nurse_manager","nursing_tech"].includes(u.role));
  const today   = new Date().toISOString().slice(0,10);

  // ── Search ──
  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return [];
    return patients.filter(p => matchesPatientSearch(p, search)).slice(0,8);
  }, [search, patients]);

  // ── Queue helpers ──
  const PRIORITY_LABELS = { urgent:"Urgente", elderly:"Idoso/PCD", pregnant:"Gestante", child:"Criança", normal:"Normal" };
  const PRIORITY_COLORS = {
    urgent:   {bg:"var(--rose-50)",border:"var(--rose-200)",text:"var(--rose-700)",order:0},
    elderly:  {bg:"var(--orange-50)",border:"var(--orange-200)",text:"var(--orange-700)",order:1},
    pregnant: {bg:"#fdf4ff",border:"var(--purple-200)",text:"var(--purple-800)",order:2},
    child:    {bg:"var(--blue-50)",border:"var(--blue-200)",text:"var(--blue-700)",order:3},
    normal:   {bg:"var(--surface-2)",border:"var(--border)",text:"var(--text-2)",order:4},
  };

  function addToQueue(e) {
    e.preventDefault();
    if (!queueForm.patientId) return;
    const pat = patients.find(p=>p.id===queueForm.patientId);
    let prio = queueForm.priority;
    if (prio==="normal") {
      const cat = String(pat?.careCategory||"").toLowerCase();
      if (cat==="pregnant") prio="pregnant";
      else {
        const age = pat?.birthDate ? Math.floor((new Date()-(parseLocalDate(pat.birthDate)||new Date()))/31557600000) : null;
        if (age!==null && age>=60) prio="elderly";
        else if (age!==null && age<12) prio="child";
      }
    }
    const entry = {
      id:"q"+Date.now(), patientId:queueForm.patientId, patientName:pat?.name||"?",
      priority:prio, reason:queueForm.reason, arrivedAt:new Date().toISOString(), status:"waiting"
    };
    saveQueue([...queue, entry]);
    setQueueForm({patientId:"",priority:"normal",reason:""});
    setShowQueueForm(false);
  }

  function updateQueueStatus(id, status) { saveQueue(queue.map(q=>q.id===id?{...q,status,updatedAt:new Date().toISOString()}:q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q=>q.id!==id)); }
  function clearDone() { saveQueue(queue.filter(q=>q.status==="waiting"||q.status==="attending")); }

  const sortedQueue = [...queue].sort((a,b) => {
    if(a.status==="done"&&b.status!=="done") return 1;
    if(b.status==="done"&&a.status!=="done") return -1;
    const pa=PRIORITY_COLORS[a.priority]?.order ?? 4, pb=PRIORITY_COLORS[b.priority]?.order ?? 4;
    return pa!==pb ? pa-pb : a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting   = sortedQueue.filter(q=>q.status==="waiting").length;
  const attending = sortedQueue.filter(q=>q.status==="attending").length;
  const alreadyInQueue = queue.filter(q=>q.status!=="done").map(q=>q.patientId);

  // ── Agenda helpers ──
  const AGENDA_HOURS = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];
  const STATUS_STYLE = {
    scheduled:{bg:"var(--blue-50)",color:"var(--blue-700)",border:"var(--blue-200)",label:"Agendado"},
    arrived:  {bg:"var(--green-50)",color:"var(--green-700)",border:"var(--green-200)",label:"Chegou"},
    attending:{bg:"var(--orange-50)",color:"var(--orange-700)",border:"var(--orange-200)",label:"Em atend."},
    done:     {bg:"var(--surface-2)",color:"var(--text-3)",border:"var(--border)",label:"Concluído"},
    absent:   {bg:"var(--rose-50)",color:"var(--rose-700)",border:"var(--rose-200)",label:"Faltou"},
  };

  const selD     = new Date(selectedDate+"T12:00:00");
  const weekDays = Array.from({length:7},(_,i)=>{
    const d=new Date(selD); d.setDate(d.getDate()-d.getDay()+i);
    return d.toISOString().slice(0,10);
  });
  const countByDay = {};
  weekDays.forEach(d=>{ countByDay[d]=agenda.filter(a=>a.date===d).length; });

  const dayAppts = agenda
    .filter(a=>a.date===selectedDate)
    .sort((a,b)=>a.time.localeCompare(b.time));

  function openAgendaNew(time="") {
    setAgendaForm({patientId:"",doctorId:"",date:selectedDate,time,type:"consultation",notes:"",status:"scheduled"});
    setAgendaEditId(null); setShowAgendaForm(true);
  }
  function openAgendaEdit(appt) {
    setAgendaForm({patientId:appt.patientId,doctorId:appt.doctorId,date:appt.date,time:appt.time,type:appt.type,notes:appt.notes||"",status:appt.status});
    setAgendaEditId(appt.id); setShowAgendaForm(true);
  }
  function submitAgenda(e) {
    e.preventDefault();
    if (!agendaForm.patientId||!agendaForm.date||!agendaForm.time) return;
    const pat = patients.find(p=>p.id===agendaForm.patientId);
    const doc = users.find(u=>u.id===agendaForm.doctorId);
    const entry = {...agendaForm, id:agendaEditId||("ag"+Date.now()), patientName:pat?.name||"?", doctorName:doc?.name||"", createdAt:new Date().toISOString()};
    const base  = agendaEditId ? agenda.filter(a=>a.id!==agendaEditId) : agenda;
    saveAgenda([...base,entry].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)));
    setShowAgendaForm(false);
  }
  function removeAgenda(id) { saveAgenda(agenda.filter(a=>a.id!==id)); }
  function updateAgendaStatus(id, status) { saveAgenda(agenda.map(a=>a.id===id?{...a,status}:a)); }

  function waitMins(iso) {
    const mins=Math.floor((new Date()-new Date(iso))/60000);
    return mins<60?`${mins}min`:`${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}`;
  }
  function fmtTime(iso){ if(!iso)return""; const d=new Date(iso); return d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }

  const NAV_TABS = [
    { id:"queue",   label:"Fila",    icon:"🏥" },
    { id:"agenda",  label:"📅 Agenda",  icon:"📅" },
    { id:"search",  label:"Pacientes", icon:"🔍" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column"}}>

      {/* ── Topbar recepção ── */}
      <header style={{height:56,background:"var(--surface)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 1.5rem",gap:"1rem",flexShrink:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
          <div style={{width:30,height:30,borderRadius:8,background:"var(--teal-600)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <IconLogo/>
          </div>
          <span style={{fontWeight:800,fontSize:".9rem",color:"var(--ink)"}}>VALENS</span>
          <span style={{fontSize:".72rem",padding:".15rem .55rem",borderRadius:999,background:"var(--teal-50)",color:"var(--teal-700)",border:"1px solid var(--teal-200)",fontWeight:700,marginLeft:".25rem"}}>Recepção</span>
        </div>

        {/* Nav tabs inline */}
        <div style={{display:"flex",gap:".25rem",marginLeft:"1rem"}}>
          {NAV_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:".35rem .85rem",borderRadius:"var(--r-md)",border:"none",
                background:tab===t.id?"var(--teal-600)":"transparent",
                color:tab===t.id?"#fff":"var(--text-2)",cursor:"pointer",
                fontSize:".8rem",fontWeight:600,display:"flex",alignItems:"center",gap:".35rem",transition:"all .12s"}}>
              <span>{t.icon}</span>{t.label}
              {t.id==="queue"&&waiting>0&&<span style={{background:"var(--red-600)",color:"#fff",borderRadius:999,fontSize:".6rem",padding:"0 5px",fontWeight:800,minWidth:16,textAlign:"center"}}>{waiting}</span>}
            </button>
          ))}
        </div>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:".75rem"}}>
          {/* Quick add buttons */}
          <button onClick={()=>setShowQueueForm(true)} style={{fontSize:".76rem",padding:".3rem .7rem",display:"flex",alignItems:"center",gap:".35rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)"}}>
            + Dar entrada
          </button>
          <button onClick={()=>openAgendaNew()} style={{fontSize:".76rem",padding:".3rem .7rem",display:"flex",alignItems:"center",gap:".35rem"}}>
            + Agendar
          </button>
          {/* User info + logout */}
          <div style={{display:"flex",alignItems:"center",gap:".5rem",borderLeft:"1px solid var(--border)",paddingLeft:".75rem"}}>
            <div className="user-avatar" style={{width:28,height:28,fontSize:".7rem",flexShrink:0}}>{initials(recUser.name)}</div>
            <div style={{fontSize:".75rem"}}>
              <div style={{fontWeight:700,color:"var(--ink)",lineHeight:1.2}}>{recUser.name}</div>
              <div style={{color:"var(--text-3)",fontSize:".68rem"}}>Recepção</div>
            </div>
            <button onClick={onLogout} title="Sair" style={{marginLeft:".25rem",padding:".25rem .5rem",fontSize:".72rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>Sair</button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div style={{flex:1,overflow:"auto",padding:"1.5rem"}}>

        {/* ════ FILA ════ */}
        {tab==="queue"&&(
          <div style={{maxWidth:820,margin:"0 auto"}}>
            {/* KPIs */}
            <div style={{display:"flex",gap:".75rem",marginBottom:"1.25rem",flexWrap:"wrap"}}>
              {[["⏳","Aguardando",waiting,"var(--blue-700)","var(--blue-50)"],["🩺","Em atendimento",attending,"var(--orange-700)","var(--orange-50)"],["📋","Total hoje",sortedQueue.length,"var(--text-2)","var(--surface-2)"]].map(([ic,l,v,color,bg])=>(
                <div key={l} style={{flex:"1 1 140px",background:bg,border:`1px solid ${bg==="var(--surface-2)"?"var(--border)":bg.replace("ff","cc")}`,borderRadius:"var(--r-md)",padding:".85rem 1rem",display:"flex",alignItems:"center",gap:".75rem"}}>
                  <span style={{fontSize:"1.6rem"}}>{ic}</span>
                  <div>
                    <div style={{fontSize:"1.6rem",fontWeight:900,color,lineHeight:1}}>{v}</div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{l}</div>
                  </div>
                </div>
              ))}
              {sortedQueue.some(q=>q.status==="done")&&(
                <button onClick={clearDone} style={{alignSelf:"center",fontSize:".75rem",padding:".4rem .8rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                  Limpar concluídos
                </button>
              )}
            </div>

            {/* Queue list */}
            {!sortedQueue.length ? (
              <div style={{textAlign:"center",padding:"5rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"3rem",marginBottom:"1rem"}}>🏥</div>
                <div style={{fontWeight:700,fontSize:".95rem",marginBottom:"1rem"}}>🏥 Nenhum paciente na fila</div>
                <button onClick={()=>setShowQueueForm(true)}>+ Dar entrada no primeiro paciente</button>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                {sortedQueue.map((q,i)=>{
                  const pc=PRIORITY_COLORS[q.priority]||PRIORITY_COLORS.normal;
                  const isDone=q.status==="done";
                  return(
                    <div key={q.id} style={{display:"flex",alignItems:"center",gap:"1rem",padding:".8rem 1.1rem",borderRadius:"var(--r-md)",
                      background:isDone?"var(--surface-2)":pc.bg, border:`1px solid ${isDone?"var(--border)":pc.border}`,
                      opacity:isDone?.55:1,transition:"opacity .2s"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:isDone?"var(--border)":pc.border,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:".78rem",fontWeight:800,color:isDone?"var(--text-3)":pc.text}}>{i+1}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,fontSize:".92rem",color:isDone?"var(--text-3)":"var(--ink)"}}>{q.patientName}</span>
                          <span style={{fontSize:".7rem",padding:".1rem .45rem",borderRadius:999,background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`,fontWeight:700}}>{PRIORITY_LABELS[q.priority]}</span>
                          {q.reason&&<span style={{fontSize:".74rem",color:"var(--text-3)"}}>· {q.reason}</span>}
                        </div>
                        <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".2rem"}}>
                          Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}
                        </div>
                      </div>
                      {!isDone&&(
                        <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                          {q.status==="waiting"&&(
                            <button onClick={()=>updateQueueStatus(q.id,"attending")}
                              style={{fontSize:".78rem",padding:".3rem .75rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)"}}>
                              🩺 Chamar
                            </button>
                          )}
                          {q.status==="attending"&&(
                            <button onClick={()=>updateQueueStatus(q.id,"done")}
                              style={{fontSize:".78rem",padding:".3rem .75rem",background:"var(--green-700)",color:"#fff",border:"none",borderRadius:"var(--r-md)"}}>
                              ✓ Concluir
                            </button>
                          )}
                          <button onClick={()=>removeFromQueue(q.id)}
                            style={{fontSize:".78rem",padding:".3rem .6rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"var(--rose-700)"}}>
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ AGENDA ════ */}
        {tab==="agenda"&&(
          <div style={{maxWidth:900,margin:"0 auto"}}>
            {/* Week strip */}
            <div style={{display:"flex",gap:".35rem",marginBottom:".85rem",overflowX:"auto",paddingBottom:".25rem"}}>
              {weekDays.map(d=>{
                const dt=new Date(d+"T12:00:00");
                const isToday=d===today;
                const isSel=d===selectedDate;
                const unavailable=isUnavailableDay(d);
                return(
                  <button key={d} onClick={()=>setSelectedDate(d)}
                    style={{flex:"1 0 70px",minWidth:70,padding:".6rem .4rem",borderRadius:"var(--r-md)",
                      border:`2px solid ${isSel?"var(--teal-500)":unavailable?"var(--slate-200)":"var(--border)"}`,
                      background:isSel?"var(--teal-600)":unavailable?"var(--slate-50)":isToday?"var(--teal-50)":"var(--surface)",
                      color:isSel?"#fff":unavailable?"var(--slate-400)":isToday?"var(--teal-700)":"var(--text-2)",cursor:"pointer",textAlign:"center",opacity:unavailable&&!isSel?.7:1}}>
                    <div style={{fontSize:".65rem",fontWeight:600,textTransform:"uppercase",opacity:.8}}>{dt.toLocaleDateString("pt-BR",{weekday:"short"})}</div>
                    <div style={{fontSize:"1.15rem",fontWeight:900,lineHeight:1.2}}>{dt.getDate()}</div>
                    {unavailable&&!isSel&&<div style={{fontSize:".55rem",marginTop:".1rem",color:"var(--slate-400)"}}>fechado</div>}
                    {!unavailable&&countByDay[d]>0&&<div style={{fontSize:".62rem",marginTop:".1rem",opacity:.85,fontWeight:600}}>{countByDay[d]} aptos.</div>}
                  </button>
                );
              })}
            </div>

            {/* Day header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <span style={{fontWeight:700,fontSize:".9rem",color:"var(--ink)"}}>
                {new Date(selectedDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
                <span style={{marginLeft:".5rem",fontSize:".78rem",color:"var(--text-3)",fontWeight:400}}>{dayAppts.length} agendamento{dayAppts.length!==1?"s":""}</span>
              </span>
              {!isUnavailableDay(selectedDate)&&<button onClick={()=>openAgendaNew()} style={{fontSize:".8rem",display:"flex",alignItems:"center",gap:".35rem"}}>
                + Novo agendamento
              </button>}
            </div>
            {isUnavailableDay(selectedDate)&&(
              <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".65rem 1rem",marginBottom:".75rem",background:"var(--slate-50)",border:"1px solid #e2e8f0",borderRadius:"var(--r-md)",fontSize:".8rem",color:"var(--slate-500)"}}>
                <span style={{fontSize:"1.1rem"}}>🔒</span>
                <span style={{fontWeight:600,color:"var(--slate-600)"}}>{unavailableReason(selectedDate)}</span>
              </div>
            )}

            {/* Appointments */}
            {!dayAppts.length ? (
              <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>{isUnavailableDay(selectedDate)?"🔒":"📅"}</div>
                <div style={{fontWeight:600,fontSize:".9rem",marginBottom:"1rem"}}>{isUnavailableDay(selectedDate)?"Unidade fechada neste dia":"Nenhum agendamento neste dia"}</div>
                {!isUnavailableDay(selectedDate)&&<button onClick={()=>openAgendaNew()}>+ Agendar consulta</button>}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                {dayAppts.map(appt=>{
                  const ss=STATUS_STYLE[appt.status]||STATUS_STYLE.scheduled;
                  return(
                    <div key={appt.id} style={{display:"flex",alignItems:"center",gap:".85rem",padding:".8rem 1.1rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${ss.border}`}}>
                      <div style={{fontFamily:"IBM Plex Mono",fontSize:".9rem",fontWeight:800,color:ss.color,flexShrink:0,width:52}}>{appt.time}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".9rem",color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{appt.patientName}</div>
                        <div style={{fontSize:".74rem",color:"var(--text-3)",marginTop:".1rem"}}>
                          {appt.type==="consultation"?"Consulta":appt.type==="return"?"Retorno":appt.type==="procedure"?"Procedimento":"Outro"}
                          {appt.doctorName&&" · "+appt.doctorName}
                          {appt.notes&&" · "+appt.notes}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".4rem",flexShrink:0}}>
                        <select value={appt.status} onChange={e=>updateAgendaStatus(appt.id,e.target.value)}
                          style={{fontSize:".73rem",padding:".25rem .45rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700,cursor:"pointer"}}>
                          {Object.entries(STATUS_STYLE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button onClick={()=>openAgendaEdit(appt)} style={{padding:".3rem .55rem",fontSize:".72rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)"}}>✏️</button>
                        <button onClick={()=>removeAgenda(appt.id)} style={{padding:".3rem .55rem",fontSize:".72rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"var(--rose-700)"}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ PACIENTES (busca + info) ════ */}
        {tab==="search"&&(
          <div style={{maxWidth:860,margin:"0 auto"}}>
            <div style={{position:"relative",marginBottom:"1.25rem"}}>
              <span style={{position:"absolute",left:".85rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                <IconSearch/>
              </span>
              <input value={search} onChange={e=>setSearch(e.target.value)} autoFocus
                placeholder="Buscar paciente por nome, CPF ou CNS⬦"
                style={{paddingLeft:"2.2rem",width:"100%",boxSizing:"border-box",fontSize:".92rem",padding:".7rem .9rem .7rem 2.2rem",borderRadius:"var(--r-md)"}}/>
            </div>

            {/* Results */}
            {search.length>=2&&!searchResults.length&&(
              <p style={{textAlign:"center",color:"var(--text-3)",padding:"2rem",fontSize:".84rem"}}>Nenhum paciente encontrado.</p>
            )}
            {searchResults.length>0&&!selectedPatient&&(
              <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {searchResults.map(p=>{
                  const am=ageInMonths(p.birthDate);
                  const g=gestationalAgeInfo(p);
                  const catName=templates.find(t=>t.category===p.careCategory)?.label||"Geral";
                  return(
                    <button key={p.id} onClick={()=>setSelectedPatient(p)}
                      style={{display:"flex",alignItems:"center",gap:"1rem",padding:".85rem 1.1rem",borderRadius:"var(--r-md)",background:"var(--surface)",border:"1px solid var(--border)",cursor:"pointer",textAlign:"left",transition:"border-color .12s,background .12s",color:"var(--text-1)"}}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor="var(--teal-400)"; e.currentTarget.style.background="var(--teal-50)"; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.background="var(--surface)"; }}>
                      <div className="user-avatar" style={{width:42,height:42,fontSize:".95rem",flexShrink:0}}>{initials(p.name)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".92rem",color:"var(--ink)"}}>{p.name}</div>
                        <div style={{fontSize:".75rem",color:"var(--text-3)",marginTop:".2rem",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                          {p.cpf&&<span>CPF: {p.cpf}</span>}
                          {p.cns&&<span>CNS: {p.cns}</span>}
                          {am!==null&&<span>{am<24?`${am}m`:`${Math.floor(am/12)}a`}</span>}
                          <span>{catName}</span>
                          {g&&String(p.careCategory||"").toLowerCase()==="pregnant"&&<span style={{color:"var(--teal-700)",fontWeight:600}}>IG {g.weeks}s{g.days}d</span>}
                        </div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Patient detail card (read-only for receptionist) */}
            {selectedPatient&&(
              <div>
                <button onClick={()=>{ setSelectedPatient(null); }}
                  style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".78rem",color:"var(--teal-600)",background:"none",border:"none",cursor:"pointer",marginBottom:"1rem",padding:0,fontWeight:600}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Voltar à busca
                </button>
                <div className="card" style={{padding:0,overflow:"hidden"}}>
                  {/* Header */}
                  <div style={{padding:"1.1rem 1.25rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:".85rem"}}>
                    <div className="user-avatar" style={{width:46,height:46,fontSize:"1.1rem",flexShrink:0,background:"var(--teal-600)",color:"#fff"}}>{initials(selectedPatient.name)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:"1rem",color:"var(--ink)"}}>{selectedPatient.name}</div>
                      <div style={{fontSize:".75rem",color:"var(--text-3)",marginTop:".25rem",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                        {selectedPatient.cpf&&<span>CPF: {selectedPatient.cpf}</span>}
                        {selectedPatient.cns&&<span>CNS: {selectedPatient.cns}</span>}
                        {selectedPatient.birthDate&&<span>Nasc.: {fmtDate(selectedPatient.birthDate)}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                      <button onClick={()=>{ setQueueForm(s=>({...s,patientId:selectedPatient.id})); setShowQueueForm(true); }}
                        style={{fontSize:".76rem",padding:".3rem .65rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)"}}>
                        🏥 Dar entrada
                      </button>
                      <button onClick={()=>{ setAgendaForm(s=>({...s,patientId:selectedPatient.id})); setShowAgendaForm(true); }}
                        style={{fontSize:".76rem",padding:".3rem .65rem"}}>
                        📅 Agendar
                      </button>
                    </div>
                  </div>
                  {/* Info grid */}
                  <div style={{padding:"1rem 1.25rem",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:".72rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>Contato</div>
                      <div style={{fontSize:".82rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".3rem"}}>
                        {selectedPatient.phone&&<span>📱 {selectedPatient.phone}</span>}
                        {selectedPatient.phoneAlt&&<span>📞 {selectedPatient.phoneAlt}</span>}
                        {selectedPatient.address&&<span>📍 {[selectedPatient.address,selectedPatient.number,selectedPatient.neighborhood,selectedPatient.city].filter(Boolean).join(", ")}</span>}
                        {!selectedPatient.phone&&!selectedPatient.address&&<span style={{color:"var(--text-3)"}}>Sem contato cadastrado</span>}
                      </div>
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:".72rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>Alertas clínicos</div>
                      <div style={{fontSize:".82rem",display:"flex",flexDirection:"column",gap:".3rem"}}>
                        {String(selectedPatient.allergies||"").trim()&&(
                          <span style={{color:"var(--rose-700)",fontWeight:600,background:"var(--rose-50)",padding:".2rem .5rem",borderRadius:"var(--r-md)",border:"1px solid #fecdd3"}}>⚠️ Alergias: {selectedPatient.allergies}</span>
                        )}
                        {gestationalAgeInfo(selectedPatient)&&String(selectedPatient.careCategory||"").toLowerCase()==="pregnant"&&(()=>{
                          const g=gestationalAgeInfo(selectedPatient);
                          return <span style={{color:"var(--teal-700)",fontWeight:600,background:"var(--teal-50)",padding:".2rem .5rem",borderRadius:"var(--r-md)",border:"1px solid var(--teal-200)"}}>🤰 IG: {g.weeks}s {g.days}d</span>;
                        })()}
                        {!String(selectedPatient.allergies||"").trim()&&!(gestationalAgeInfo(selectedPatient)&&String(selectedPatient.careCategory||"").toLowerCase()==="pregnant")&&<span style={{color:"var(--text-3)"}}>Nenhum alerta</span>}
                      </div>
                    </div>
                  </div>
                  {/* Próximos agendamentos */}
                  {(()=>{
                    const upcoming = agenda.filter(a=>a.patientId===selectedPatient.id&&a.date>=today&&a.status!=="done"&&a.status!=="absent").sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,3);
                    if(!upcoming.length) return null;
                    return(
                      <div style={{padding:"0 1.25rem 1rem"}}>
                        <div style={{fontWeight:700,fontSize:".72rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>Próximos agendamentos</div>
                        {upcoming.map(a=>{
                          const ss=STATUS_STYLE[a.status]||STATUS_STYLE.scheduled;
                          return(
                            <div key={a.id} style={{display:"flex",alignItems:"center",gap:".65rem",padding:".45rem .75rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${ss.border}`,marginBottom:".3rem"}}>
                              <span style={{fontFamily:"IBM Plex Mono",fontSize:".78rem",fontWeight:700,color:ss.color,flexShrink:0}}>{new Date(a.date+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} {a.time}</span>
                              <span style={{fontSize:".78rem",color:"var(--text-2)"}}>{a.type==="consultation"?"Consulta":a.type==="return"?"Retorno":"Outro"}{a.doctorName&&" · "+a.doctorName}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {!search&&!selectedPatient&&(
              <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"3rem",marginBottom:"1rem"}}>🔍</div>
                <div style={{fontWeight:600,fontSize:".9rem"}}>Digite para buscar um paciente</div>
                <div style={{fontSize:".8rem",marginTop:".5rem"}}>Nome, CPF ou CNS</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════ MODAIS ════ */}

      {/* Add to queue modal */}
      {showQueueForm&&(
        <div className="modal-backdrop" onClick={()=>setShowQueueForm(false)}>
          <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>Dar entrada na fila</h3>
              <button className="icon-btn" onClick={()=>setShowQueueForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={addToQueue} style={{display:"flex",flexDirection:"column",gap:".7rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Paciente *
                <select value={queueForm.patientId} onChange={e=>setQueueForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar paciente...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=>(
                    <option key={p.id} value={p.id} disabled={alreadyInQueue.includes(p.id)}>{p.name}{alreadyInQueue.includes(p.id)?" (já na fila)":""}</option>
                  ))}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Prioridade
                <select value={queueForm.priority} onChange={e=>setQueueForm(s=>({...s,priority:e.target.value}))}>
                  {Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Motivo / queixa
                <input value={queueForm.reason} onChange={e=>setQueueForm(s=>({...s,reason:e.target.value}))} placeholder="Dor, retorno, renovação de receita..."/>
              </label>
              <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowQueueForm(false)} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Confirmar entrada</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agenda form modal */}
      {showAgendaForm&&(
        <div className="modal-backdrop" onClick={()=>setShowAgendaForm(false)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>{agendaEditId?"Editar agendamento":"Novo agendamento"}</h3>
              <button className="icon-btn" onClick={()=>setShowAgendaForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={submitAgenda} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Paciente *
                <select value={agendaForm.patientId} onChange={e=>setAgendaForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Data *
                <input type="date" value={agendaForm.date} onChange={e=>setAgendaForm(s=>({...s,date:e.target.value}))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Horário *
                <select value={agendaForm.time} onChange={e=>setAgendaForm(s=>({...s,time:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {AGENDA_HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Profissional
                <select value={agendaForm.doctorId} onChange={e=>setAgendaForm(s=>({...s,doctorId:e.target.value}))}>
                  <option value="">Sem preferência</option>
                  {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Tipo
                <select value={agendaForm.type} onChange={e=>setAgendaForm(s=>({...s,type:e.target.value}))}>
                  <option value="consultation">Consulta</option>
                  <option value="return">Retorno</option>
                  <option value="procedure">Procedimento</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Observações
                <input value={agendaForm.notes} onChange={e=>setAgendaForm(s=>({...s,notes:e.target.value}))} placeholder="Motivo, solicitações especiais..."/>
              </label>
              <div style={{gridColumn:"span 2",display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowAgendaForm(false)} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Salvar agendamento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export { ReceptionistApp as default, ReceptionLoginModal };
