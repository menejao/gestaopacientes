import { useState } from "react";
import { readAuditLog, exportAuditLog } from "../utils/storage";

const ACTION_LABELS = {
  LOGIN:                   { label:"Login",                color:"var(--green-700)", bg:"var(--green-50)" },
  LOGIN_FAILED:            { label:"Tentativa falha",      color:"var(--rose-700)", bg:"var(--rose-50)" },
  LOGOUT:                  { label:"Logout",               color:"var(--slate-500)", bg:"var(--surface-2)" },
  USUARIO_CADASTRADO:      { label:"Usuário cadastrado",   color:"var(--blue-700)", bg:"var(--blue-50)" },
  USUARIO_EDITADO:         { label:"Usuário editado",      color:"var(--orange-700)", bg:"var(--orange-50)" },
  USUARIO_EXCLUIDO:        { label:"Usuário excluído",     color:"var(--rose-700)", bg:"var(--rose-50)" },
  PACIENTE_CADASTRADO:     { label:"Paciente cadastrado",  color:"var(--teal-700)", bg:"var(--teal-50)" },
  PACIENTE_EDITADO:        { label:"Paciente editado",     color:"var(--cyan-600)", bg:"var(--cyan-50)" },
  PACIENTE_EXCLUIDO:       { label:"Paciente excluído",    color:"var(--rose-700)", bg:"var(--rose-50)" },
  ATENDIMENTO_REGISTRADO:  { label:"Atendimento",          color:"var(--indigo-500)", bg:"var(--blue-50)" },
  TAREFA_CRIADA:           { label:"Tarefa criada",        color:"var(--amber-600)", bg:"var(--amber-50)" },
  MENSAGEM_ENVIADA:        { label:"Mensagem",             color:"var(--cyan-600)", bg:"var(--cyan-50)" },
  REGISTRO_INATIVADO:      { label:"Registro inativado",   color:"var(--amber-700)", bg:"var(--amber-50)" },
  ATENDIMENTO_EXCLUIDO:    { label:"Atendimento excluído", color:"var(--rose-700)", bg:"var(--rose-50)" },
  ACESSO_PRONTUARIO:       { label:"Acesso prontuário",    color:"var(--violet-600)", bg:"var(--violet-50)" },
  LANCAMENTO_REGISTRO:     { label:"Lançamento prontuário",color:"var(--indigo-500)", bg:"var(--blue-50)" },
  INATIVACAO_REGISTRO:     { label:"Inativação prontuário",color:"var(--amber-700)", bg:"var(--amber-50)" },
  PEDIDO_EXAME:            { label:"Pedido de exame",      color:"var(--teal-700)", bg:"var(--teal-50)" },
  PRESCRICAO_EMITIDA:      { label:"Prescrição emitida",   color:"var(--green-700)", bg:"var(--green-50)" },
  ENCAMINHAMENTO_INTERNO:  { label:"Encaminhamento",       color:"var(--blue-700)", bg:"var(--blue-50)" },
  EXAME_POSTO_REGISTRADO:  { label:"Exame (posto)",        color:"var(--teal-700)", bg:"var(--teal-50)" },
  EXAME_EXTERNO_INSERIDO:  { label:"Exame externo",        color:"var(--indigo-500)", bg:"var(--blue-50)" },
  RESET_SENHA_SOLICITADO:  { label:"Reset de senha",       color:"var(--orange-700)", bg:"var(--orange-50)" },
  DISPENSACAO_FARMACIA:    { label:"Dispensação",           color:"var(--violet-600)", bg:"var(--violet-50)" },
  ESTOQUE_AJUSTADO:        { label:"Ajuste de estoque",     color:"var(--orange-700)", bg:"var(--orange-50)" },
  MEDICAMENTO_CADASTRADO:  { label:"Medicamento cadastrado",color:"var(--green-700)", bg:"var(--green-50)" },
  MEDICAMENTO_EDITADO:     { label:"Medicamento editado",   color:"var(--cyan-600)", bg:"var(--cyan-50)" },
  EXAME_EXCLUIDO:          { label:"Exame excluído",        color:"var(--rose-700)", bg:"var(--rose-50)" },
};

function AuditLogPanel() {
  const [log]         = useState(()=>readAuditLog());
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const filtered = log.filter(e=>{
    if(actionFilter && e.action !== actionFilter) return false;
    if(search.trim()) {
      const q = search.toLowerCase();
      return (e.tsDisplay||"").includes(q)
        || (e.action||"").toLowerCase().includes(q)
        || (e.user?.name||"").toLowerCase().includes(q)
        || (e.user?.email||"").toLowerCase().includes(q)
        || JSON.stringify(e).toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const actions = [...new Set(log.map(e=>e.action))].sort();

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".65rem"}}>
        <div>
          <div style={{fontWeight:700,fontSize:"1rem",color:"var(--ink)"}}>Trilha de Auditoria</div>
          <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>
            {log.length} eventos registrados · Imutável · Exportável
          </div>
        </div>
        <button onClick={exportAuditLog}
          style={{fontSize:".78rem",padding:".4rem .85rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Exportar CSV
        </button>
      </div>

      {/* Aviso de imutabilidade */}
      <div style={{padding:".55rem .85rem",background:"var(--amber-50)",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".73rem",color:"var(--amber-700)",marginBottom:"1rem",display:"flex",gap:".5rem",alignItems:"center"}}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span>Esta trilha é <strong>somente leitura</strong>. Nenhum registro pode ser alterado ou excluído. Todos os eventos do sistema são gravados automaticamente com data, hora e usuário responsável.</span>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:".5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
          placeholder="Buscar por usuário, ação, detalhe..."
          style={{flex:1,minWidth:200}}/>
        <select value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(1);}}
          style={{minWidth:180}}>
          <option value="">Todas as ações</option>
          {actions.map(a=><option key={a} value={a}>{ACTION_LABELS[a]?.label||a}</option>)}
        </select>
      </div>

      {/* Tabela */}
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
            {!paged.length&&(
              <tr><td colSpan={4} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum evento encontrado.</td></tr>
            )}
            {paged.map(e=>{
              const meta = ACTION_LABELS[e.action]||{label:e.action,color:"var(--text-3)",bg:"var(--surface-2)"};
              const details = Object.entries(e)
                .filter(([k])=>!["id","ts","tsDisplay","action","user"].includes(k))
                .map(([k,v])=>`${k}: ${typeof v==="object"?JSON.stringify(v):v}`)
                .join(" · ");
              return (
                <tr key={e.id}>
                  <td style={{fontSize:".72rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono",whiteSpace:"nowrap"}}>{e.tsDisplay||e.ts?.slice(0,19).replace("T"," ")||"—"}</td>
                  <td>
                    <span style={{fontSize:".71rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:meta.bg,color:meta.color,border:`1px solid ${meta.color}22`,whiteSpace:"nowrap"}}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{fontSize:".78rem"}}>
                    {e.user ? (
                      <div>
                        <div style={{fontWeight:600,color:"var(--ink)"}}>{e.user.name||"—"}</div>
                        <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{e.user.email} · {e.user.role}</div>
                      </div>
                    ) : <span style={{color:"var(--text-3)"}}>—</span>}
                  </td>
                  <td style={{fontSize:".74rem",color:"var(--text-2)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={details}>
                    {details||"—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages>1&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:".75rem",fontSize:".78rem",color:"var(--text-3)"}}>
          <span>Mostrando {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)} de {filtered.length}</span>
          <div style={{display:"flex",gap:".4rem"}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
              style={{padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".78rem"}}>
              Anterior
            </button>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
              style={{padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".78rem"}}>
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLogPanel;
