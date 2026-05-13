import { useEffect, useMemo, useState } from "react";
import { listAuditLogs } from "../api";

export function AuditLogPanel({ token, actionLabels, exportAuditLog }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    let active = true;
    async function loadAuditRows() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listAuditLogs(token, { limit: 1000 });
        if (!active) return;
        const normalized = Array.isArray(rows) ? rows.map((row) => ({
          id: row.id,
          ts: row.timestamp || "",
          tsDisplay: row.timestamp ? new Date(row.timestamp).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }) : "",
          action: String(row.action || ""),
          user: row.userId || row.userName || row.userRole ? {
            id: row.userId || "",
            name: row.userName || "",
            role: row.userRole || ""
          } : null,
          entity: row.entity || "",
          entityId: row.entityId || "",
          detail: row.detail || "",
          patientId: row.patientId || ""
        })) : [];
        setLog(normalized);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[audit-log-panel]", err?.message);
        if (active) { setLog([]); setError(err?.message || "Erro ao carregar auditoria"); }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadAuditRows();
    return () => { active = false; };
  }, [token, reloadTick]);

  const filtered = useMemo(() => log.filter((e) => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (e.tsDisplay || "").toLowerCase().includes(q)
        || (e.action || "").toLowerCase().includes(q)
        || (e.user?.name || "").toLowerCase().includes(q)
        || String(e.detail || "").toLowerCase().includes(q)
        || String(e.entity || "").toLowerCase().includes(q)
        || String(e.entityId || "").toLowerCase().includes(q)
        || String(e.patientId || "").toLowerCase().includes(q);
    }
    return true;
  }), [log, search, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const actions = [...new Set(log.map((e) => e.action).filter(Boolean))].sort();

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".65rem"}}>
        <div>
          <div style={{fontWeight:700,fontSize:"1rem",color:"var(--ink)"}}>Trilha de Auditoria</div>
          <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>
            {loading ? "Carregando..." : error ? `Erro: ${error}` : `${log.length} eventos persistentes · somente leitura · exportáveis`}
          </div>
        </div>
        <button
          onClick={() => exportAuditLog(log)}
          style={{fontSize:".78rem",padding:".4rem .85rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:".4rem"}}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Exportar CSV
        </button>
        {!loading && error && (
          <button onClick={() => setReloadTick(t => t + 1)} style={{fontSize:".78rem",padding:".4rem .85rem",background:"var(--surface-2)",color:"var(--ink)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
            Tentar novamente
          </button>
        )}
      </div>

      <div style={{padding:".55rem .85rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".73rem",color:"#92400e",marginBottom:"1rem",display:"flex",gap:".5rem",alignItems:"center"}}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span>Fonte: backend persistente. Sem dependência de localStorage para consulta confiável.</span>
      </div>

      <div style={{display:"flex",gap:".5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Buscar por ação, usuário, entidade ou detalhe..." style={{flex:1,minWidth:200}}/>
        <select value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(1);}} style={{minWidth:180}}>
          <option value="">Todas as ações</option>
          {actions.map(a=><option key={a} value={a}>{actionLabels[a]?.label||a}</option>)}
        </select>
      </div>

      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <table className="patients-table" style={{width:"100%"}}>
          <thead>
            <tr>
              <th style={{width:150}}>Data / Hora</th>
              <th style={{width:160}}>Ação</th>
              <th style={{width:160}}>Usuário</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Carregando...</td></tr>}
            {!loading && error && <tr><td colSpan={4} style={{textAlign:"center",padding:"2rem",color:"var(--red-600)",fontSize:".84rem"}}>{error}</td></tr>}
            {!loading && !error && !paged.length && <tr><td colSpan={4} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum evento encontrado.</td></tr>}
            {paged.map((e) => {
              const meta = actionLabels[e.action] || { label: e.action, color: "var(--text-3)", bg: "var(--surface-2)" };
              const details = [
                e.entity ? `entidade: ${e.entity}` : "",
                e.entityId ? `id: ${e.entityId}` : "",
                e.patientId ? `paciente: ${e.patientId}` : "",
                e.detail ? `detalhe: ${e.detail}` : ""
              ].filter(Boolean).join(" · ");
              return (
                <tr key={e.id}>
                  <td style={{fontSize:".72rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono",whiteSpace:"nowrap"}}>{e.tsDisplay||e.ts?.slice(0,19).replace("T"," ")||"—"}</td>
                  <td><span style={{fontSize:".71rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:meta.bg,color:meta.color,border:`1px solid ${meta.color}22`,whiteSpace:"nowrap"}}>{meta.label}</span></td>
                  <td style={{fontSize:".78rem"}}>{e.user ? <div><div style={{fontWeight:600,color:"var(--ink)"}}>{e.user.name||"—"}</div><div style={{fontSize:".68rem",color:"var(--text-3)"}}>{e.user.role||"—"}</div></div> : <span style={{color:"var(--text-3)"}}>—</span>}</td>
                  <td style={{fontSize:".74rem",color:"var(--text-2)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={details}>{details||"—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages>1&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:".75rem",fontSize:".78rem",color:"var(--text-3)"}}>
          <span>Mostrando {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)} de {filtered.length}</span>
          <div style={{display:"flex",gap:".4rem"}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".78rem"}}>Anterior</button>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={{padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".78rem"}}>Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
