import { useState, useEffect, useMemo, useRef } from "react";
import { matchesPatientSearch, gestationalAgeInfo } from "../../utils/clinical";
import { initials } from "../../utils/formatting";

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

function GlobalSearch({ patients, templates, onNavigate }) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState("");
  const ref               = useRef(null);
  const inputRef          = useRef(null);

  useEffect(()=>{
    function handler(e) {
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){ e.preventDefault(); setOpen(v=>!v); }
      if(e.key==="Escape") setOpen(false);
    }
    document.addEventListener("keydown",handler);
    return ()=>document.removeEventListener("keydown",handler);
  },[]);

  useEffect(()=>{ if(open&&inputRef.current) inputRef.current.focus(); },[open]);

  const results = useMemo(()=>{
    if(!q.trim()||q.length<2) return [];
    return patients.filter(p => matchesPatientSearch(p, q)).slice(0,8);
  },[q,patients]);

  function select(p) { onNavigate(p.id); setOpen(false); setQ(""); }

  return (
    <>
      <button onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".35rem .75rem",borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--border)",cursor:"pointer",color:"var(--text-3)",fontSize:".78rem",minWidth:160}}>
        <IconSearch/> Buscar paciente...
        <span style={{marginLeft:"auto",fontSize:".65rem",background:"var(--surface-3)",padding:".1rem .3rem",borderRadius:4,color:"var(--text-3)"}}>Ctrl+K</span>
      </button>
      {open&&(
        <div style={{position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"10vh",background:"rgba(15,23,42,.45)",backdropFilter:"blur(3px)"}} onClick={()=>setOpen(false)}>
          <div ref={ref} style={{width:"100%",maxWidth:520,background:"var(--surface)",borderRadius:"var(--r-lg)",boxShadow:"0 20px 60px rgba(0,0,0,.2)",border:"1px solid var(--border)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".85rem 1rem",borderBottom:"1px solid var(--border)"}}>
              <IconSearch/>
              <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Nome, CPF, CNS ou telefone..." style={{flex:1,border:"none",outline:"none",background:"transparent",fontSize:".92rem",color:"var(--ink)"}}/>
              <button className="icon-btn" onClick={()=>setOpen(false)}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            {q.length>=2&&!results.length&&<p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum paciente encontrado.</p>}
            {results.map(p=>{
              const g=gestationalAgeInfo(p);
              return(
                <button key={p.id} onClick={()=>select(p)} style={{display:"flex",alignItems:"center",gap:".75rem",width:"100%",padding:".75rem 1rem",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",borderBottom:"1px solid var(--border-soft)",color:"var(--text-1)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div className="user-avatar" style={{width:34,height:34,fontSize:".8rem",flexShrink:0}}>{initials(p.name)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)"}}>{p.name}</div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".1rem"}}>
                      {p.cpf&&<span>CPF {p.cpf} · </span>}
                      <span>{templates.find(t=>t.category===p.careCategory)?.label||p.careCategory||"Geral"}</span>
                      {g&&String(p.careCategory||"").toLowerCase()==="pregnant"&&<span> · IG {g.weeks}s{g.days}d</span>}
                    </div>
                  </div>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              );
            })}
            {!q&&<p style={{padding:"1.25rem",textAlign:"center",color:"var(--text-3)",fontSize:".8rem"}}>Digite para buscar por nome, CPF, CNS ou telefone.</p>}
          </div>
        </div>
      )}
    </>
  );
}

export default GlobalSearch;
