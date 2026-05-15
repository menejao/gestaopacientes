import PageHero from "./layout/PageHero";
import EmptyState from "./ui/EmptyState";

function ProtocolsTab({ templates, canManageUser, onEdit, onDelete }) {
  return (
    <div className="workspace-home">
      <PageHero badge="Protocolos Clínicos" title="Protocolos" subtitle="Metas e etapas de acompanhamento por categoria de paciente." actions={canManageUser&&<button onClick={onEdit(null)}>+ Novo protocolo</button>} />
      <div className="card">
        {!templates.length
          ? <EmptyState message="Nenhum protocolo cadastrado."/>
          : <div style={{padding:"0 1.25rem"}}>
              {templates.map(tpl=>(
                <div key={tpl.category} style={{padding:".85rem 0",borderBottom:"1px solid var(--border-soft)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".3rem"}}>
                      <strong style={{fontSize:".88rem"}}>{tpl.label}</strong>
                      <span style={{fontSize:".7rem",color:"var(--text-3)",background:"var(--slate-100)",padding:".1em .5em",borderRadius:99}}>{tpl.category}</span>
                    </div>
                    <div style={{display:"flex",gap:".85rem",fontSize:".75rem",color:"var(--text-2)",flexWrap:"wrap"}}>
                      <span>Visitas: <strong>{Number(tpl?.targets?.visits||0)}</strong></span>
                      <span>Consultas: <strong>{Number(tpl?.targets?.consultations||0)}</strong></span>
                      <span>Vacinas: <strong>{Number(tpl?.targets?.vaccines||0)}</strong></span>
                    </div>
                    {Array.isArray(tpl?.vaccines)&&tpl.vaccines.length>0&&(
                      <div style={{marginTop:".25rem",fontSize:".72rem",color:"var(--text-3)"}}>Vacinas: {tpl.vaccines.join(", ")}</div>
                    )}
                  </div>
                  {canManageUser&&(
                    <div className="actions">
                      <button className="secondary" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onEdit(tpl)()}>Editar</button>
                      <button className="danger-btn" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onDelete(tpl)}>Excluir</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

export default ProtocolsTab;
