import { useState, useEffect, useMemo, useRef } from "react";
import { readLS, writeLS } from "../../utils/storage";
import { buildProactiveAlerts } from "../../utils/clinical";

const NOTIF_SEEN_KEY = "saudeubs_notif_seen_v1";
const NOTIF_CLEARED_AT_KEY = "saudeubs_notif_cleared_at_v1";

function NotificationBell({ patients, protocolByPatient, pharmacyStock, agenda, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => new Set(readLS(NOTIF_SEEN_KEY, [])));
  const [clearedAt, setClearedAt] = useState(() => String(readLS(NOTIF_CLEARED_AT_KEY, "")));
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allAlerts = useMemo(() =>
    buildProactiveAlerts(patients, protocolByPatient, pharmacyStock, agenda),
    [patients, protocolByPatient, pharmacyStock, agenda]
  );

  useEffect(() => {
    if (!allAlerts.length) return;
    const activeIds = new Set(allAlerts.map(a => a.id));
    setSeenIds(prev => {
      const pruned = new Set([...prev].filter(id => activeIds.has(id)));
      if (pruned.size !== prev.size) {
        writeLS(NOTIF_SEEN_KEY, [...pruned]);
        return pruned;
      }
      return prev;
    });
  }, [allAlerts]);

  const unseenAlerts = useMemo(() => {
    const watermark = Date.parse(clearedAt || "");
    return allAlerts.filter((a) => {
      if (seenIds.has(a.id)) return false;
      if (!Number.isFinite(watermark)) return true;
      const createdAt = Date.parse(String(a.createdAt || ""));
      if (!Number.isFinite(createdAt)) return true;
      return createdAt > watermark;
    });
  }, [allAlerts, seenIds, clearedAt]);

  function markSeen(id, e) {
    e.stopPropagation();
    setSeenIds(prev => {
      const next = new Set(prev);
      next.add(id);
      writeLS(NOTIF_SEEN_KEY, [...next]);
      return next;
    });
  }

  function clearAllSeen() {
    const allIds = new Set(allAlerts.map(a => a.id));
    setSeenIds(allIds);
    writeLS(NOTIF_SEEN_KEY, [...allIds]);
    const nowIso = new Date().toISOString();
    setClearedAt(nowIso);
    writeLS(NOTIF_CLEARED_AT_KEY, nowIso);
  }

  const unseenCount = unseenAlerts.length;
  const hasDanger = unseenAlerts.some(a => a.type === "danger");

  return (
    <div ref={ref} style={{position:"relative",flexShrink:0,overflow:"visible"}}>
      <button onClick={()=>setOpen(v=>!v)}
        style={{position:"relative",width:34,height:34,borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,overflow:"visible",padding:0}}>
        <svg viewBox="0 0 20 20" fill="none" style={{width:20,height:20,color:"var(--text-1)",display:"block",flexShrink:0}}>
          <path d="M10 2a6 6 0 00-6 6v3.5L2.5 14h15L16 11.5V8a6 6 0 00-6-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M8 14.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        {unseenCount > 0 && (
          <span style={{position:"absolute",top:-4,right:-4,minWidth:16,height:16,borderRadius:999,background:hasDanger?"var(--red-600)":"var(--amber-500)",color:"#fff",fontSize:".6rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",lineHeight:1}}>
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:330,maxHeight:440,overflowY:"auto",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-lg)",boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:600}}>
          <div style={{padding:".7rem 1rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:".5rem",position:"sticky",top:0,background:"var(--surface)",zIndex:1}}>
            <span style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>Alertas do sistema</span>
            <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
              {unseenCount > 0 && (
                <span style={{fontSize:".7rem",color:"var(--text-3)"}}>{unseenCount} não visto{unseenCount!==1?"s":""}</span>
              )}
              {unseenCount > 1 && (
                <button onClick={clearAllSeen}
                  style={{fontSize:".68rem",color:"var(--teal-600)",background:"none",border:"none",cursor:"pointer",padding:"0 .25rem",fontWeight:600,whiteSpace:"nowrap"}}
                  title="Marcar todos como vistos">
                  Limpar todos
                </button>
              )}
            </div>
          </div>
          {!unseenCount && (
            <p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".82rem"}}>
              {allAlerts.length > 0 ? "Todos os alertas foram vistos ✓" : "Nenhum alerta no momento ✓"}
            </p>
          )}
          {unseenAlerts.map(a => (
            <div key={a.id}
              style={{padding:".65rem 1rem",borderBottom:"1px solid var(--border-soft)",display:"flex",gap:".65rem",alignItems:"flex-start",
                background:a.type==="danger"?"#fff5f5":a.type==="warn"?"var(--amber-50)":"var(--surface)",
                cursor:a.patientId?"pointer":"default",transition:"filter .1s"}}
              onMouseEnter={e=>{ if(a.patientId) e.currentTarget.style.filter="brightness(.97)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.filter="none"; }}>
              <span
                style={{flex:1,display:"flex",gap:".65rem",alignItems:"flex-start",minWidth:0}}
                onClick={()=>{ if(a.patientId&&onNavigate) onNavigate(a.patientId); setOpen(false); }}>
                <span style={{fontSize:"1rem",flexShrink:0,marginTop:".1rem"}}>
                  {a.type==="danger"?"⛔":a.type==="warn"?"⚠️":"ℹ️"}
                </span>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:".76rem",color:a.type==="danger"?"var(--rose-700)":a.type==="warn"?"var(--amber-700)":"var(--teal-700)"}}>{a.title}</div>
                  <div style={{fontSize:".73rem",color:"var(--text-2)",marginTop:".1rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.detail}</div>
                </div>
              </span>
              <button
                onClick={e => markSeen(a.id, e)}
                title="Marcar como visto"
                style={{flexShrink:0,width:20,height:20,borderRadius:4,background:"none",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",marginTop:".05rem",color:"var(--text-3)",lineHeight:1,padding:0}}>
                <svg viewBox="0 0 12 12" fill="none" width="9" height="9">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
