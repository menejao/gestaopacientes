import { useState, useEffect } from "react";
import PageHero from "../components/layout/PageHero";
import { parseLocalDate } from "../utils/dates";
import { fmtDate } from "../utils/formatting";

function AcsTasksPage({ patients, users, user, token, onNavigatePatient }) {
  const [allTasks, setAllTasks]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("pending"); // "all" | "pending" | "done"

  // Carrega as tarefas de todos os pacientes atribuídos ao ACS logado
  useEffect(() => {
    if (!token) return;
    const myPatients = patients.filter(p => p.assignedAcsId === user?.id);
    if (!myPatients.length) { setAllTasks([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(myPatients.map(p =>
      fetch(`/patients/${p.id}/tasks`, { headers:{ Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(tasks => (Array.isArray(tasks) ? tasks : []).map(t => ({ ...t, patientId:p.id, patientName:p.name, patientBirth:p.birthDate, patientCareCategory:p.careCategory })))
        .catch(() => [])
    ))
    .then(results => { setAllTasks(results.flat()); setLoading(false); })
    .catch(() => setLoading(false));
  }, [token, patients, user?.id]);

  // Filtra tarefas do ACS logado (atribuídas a ele ou sem responsável definido)
  const myTasks = allTasks.filter(t =>
    !t.assigneeId || t.assigneeId === user?.id
  );

  const filtered = myTasks.filter(t => {
    if (filter === "pending") return t.status !== "done";
    if (filter === "done")    return t.status === "done";
    return true;
  });

  // Ordena: tarefas com data mais próxima primeiro, depois sem data, depois atrasadas no fim
  const today = new Date(); today.setHours(0,0,0,0);
  const sorted = [...filtered].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate + "T00:00:00") : null;
    const db = b.dueDate ? new Date(b.dueDate + "T00:00:00") : null;
    if (!da && !db) return 0;
    if (!da) return 1;   // sem data vai pro fim
    if (!db) return -1;
    return da - db;      // mais próxima primeiro
  });

  const overdueCount  = myTasks.filter(t => t.status !== "done" && t.dueDate && parseLocalDate(t.dueDate) < today).length;
  const pendingCount  = myTasks.filter(t => t.status !== "done").length;

  async function changeStatus(task, status) {
    try {
      await fetch(`/patients/${task.patientId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ status }),
      });
      setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    } catch {}
  }

  function urgencyStyle(dueDate, status) {
    if (status === "done") return { bg:"var(--surface-2)", border:"var(--border)", label:"", labelColor:"" };
    if (!dueDate) return { bg:"var(--surface-2)", border:"var(--border)", label:"", labelColor:"" };
    const d = new Date(dueDate + "T00:00:00");
    const diff = Math.ceil((d - today) / 86400000);
    if (diff < 0)  return { bg:"var(--rose-50)", border:"var(--rose-200)", label:`Atrasada ${Math.abs(diff)}d`, labelColor:"var(--rose-700)" };
    if (diff === 0) return { bg:"var(--orange-50)", border:"var(--orange-200)", label:"Hoje",                       labelColor:"var(--orange-700)" };
    if (diff <= 3)  return { bg:"var(--amber-50)", border:"var(--amber-200)", label:`${diff}d`,                   labelColor:"var(--amber-700)" };
    return { bg:"var(--surface-2)", border:"var(--border)", label:`${diff}d`, labelColor:"var(--text-3)" };
  }

  return (
    <div style={{padding:"1.5rem",maxWidth:760,margin:"0 auto"}}>
      <PageHero badge="Minha área" title="Tarefas" subtitle="Atividades atribuídas a você pela equipe de enfermagem" />

      {/* KPIs rápidos */}
      <div style={{display:"flex",gap:".75rem",marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {[
          { label:"Pendentes",   value:pendingCount,  color:"var(--blue-700)", bg:"var(--blue-50)", border:"var(--blue-200)" },
          { label:"Em atraso",   value:overdueCount,  color:"var(--rose-700)", bg:"var(--rose-50)", border:"var(--rose-200)" },
          { label:"Concluídas",  value:myTasks.filter(t=>t.status==="done").length, color:"var(--green-700)", bg:"var(--green-50)", border:"var(--green-200)" },
        ].map(k=>(
          <div key={k.label} style={{flex:"1 1 120px",padding:".65rem .9rem",background:k.bg,border:`1px solid ${k.border}`,borderRadius:"var(--r-md)"}}>
            <div style={{fontSize:"1.4rem",fontWeight:800,color:k.color,lineHeight:1}}>{k.value}</div>
            <div style={{fontSize:".72rem",color:k.color,marginTop:".2rem",fontWeight:600}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:".4rem",marginBottom:"1rem"}}>
        {[["pending","Pendentes"],["done","Concluídas"],["all","Todas"]].map(([val,lbl])=>(
          <button key={val} type="button" onClick={()=>setFilter(val)}
            style={{fontSize:".78rem",padding:".35rem .8rem",borderRadius:"var(--r-md)",border:"1px solid",
              borderColor:filter===val?"var(--teal-600)":"var(--border)",
              background:filter===val?"var(--teal-600)":"var(--surface)",
              color:filter===val?"#fff":"var(--text-1)",fontWeight:filter===val?700:400,cursor:"pointer"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".85rem"}}>Carregando tarefas...</div>
      ) : !sorted.length ? (
        <div style={{textAlign:"center",padding:"2.5rem 1rem",color:"var(--text-3)"}}>
          <svg width="32" height="32" viewBox="0 0 16 16" fill="none" style={{marginBottom:".5rem",opacity:.4}}><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{fontWeight:600,fontSize:".85rem"}}>{filter==="done"?"Nenhuma tarefa concluída":"Nenhuma tarefa pendente"}</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:".6rem"}}>
          {sorted.map(t => {
            const urg = urgencyStyle(t.dueDate, t.status);
            const done = t.status === "done";
            return (
              <div key={t.id} style={{padding:".85rem 1rem",background:urg.bg,border:`1px solid ${urg.border}`,borderRadius:"var(--r-md)",opacity:done?.65:1}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".75rem"}}>
                  <div style={{flex:1,minWidth:0}}>
                    {/* Título + urgência */}
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap",marginBottom:".25rem"}}>
                      <span style={{fontWeight:700,fontSize:".88rem",color:done?"var(--text-3)":"var(--ink)",textDecoration:done?"line-through":"none"}}>{t.title}</span>
                      {urg.label&&!done&&<span style={{fontSize:".68rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"white",border:`1px solid ${urg.border}`,color:urg.labelColor,flexShrink:0}}>{urg.label}</span>}
                    </div>
                    {/* Notas */}
                    {t.notes&&<p style={{fontSize:".78rem",color:"var(--text-2)",margin:"0 0 .35rem"}}>{t.notes}</p>}
                    {/* Meta-info */}
                    <div style={{display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap"}}>
                      {/* Paciente */}
                      <button type="button" onClick={()=>onNavigatePatient&&onNavigatePatient(t.patientId)}
                        style={{display:"inline-flex",alignItems:"center",gap:".35rem",fontSize:".72rem",color:"var(--teal-700)",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:999,padding:".1rem .5rem",cursor:"pointer",fontWeight:600}}>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {t.patientName}
                      </button>
                      {/* Prazo */}
                      {t.dueDate&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>Prazo: {fmtDate(t.dueDate)}</span>}
                    </div>
                  </div>
                  {/* Controle de status */}
                  <select value={t.status||"pending"} onChange={e=>changeStatus(t,e.target.value)}
                    style={{fontSize:".75rem",padding:".3rem .55rem",borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text-1)",cursor:"pointer",flexShrink:0}}>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AcsTasksPage;
