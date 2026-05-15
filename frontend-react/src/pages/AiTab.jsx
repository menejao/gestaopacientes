import PageHero from "../components/layout/PageHero";
import Chip from "../components/ui/Chip";

function AiTab({ aiView, aiData, aiQuestion, setAiQuestion, onPriorities, onQuality, onReport, onAsk, busy }) {
  return (
    <div className="workspace-home">
      <PageHero
        badge="IA Assistida"
        title="Assistente da Equipe"
        subtitle="Prioridades do dia, qualidade de dados e perguntas operacionais em linguagem natural."
      />

      <div className="card">
        <div className="card-header">
          <span className="card-title">Ações rápidas</span>
        </div>
        <div className="card-body">
          <div className="actions" style={{marginBottom:"1rem"}}>
            <button onClick={onPriorities} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              Prioridades do dia
            </button>
            <button onClick={onQuality} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
              Qualidade de dados
            </button>
            <button onClick={onReport} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.3"/><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Relatório executivo
            </button>
          </div>

          <form onSubmit={onAsk} style={{display:"flex",gap:".6rem"}}>
            <input
              style={{flex:1}}
              placeholder="Pergunte ao assistente... Ex: Quais pacientes estão com protocolo atrasado?"
              value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)}
            />
            <button type="submit" disabled={busy||!aiQuestion.trim()}>Perguntar</button>
          </form>
        </div>

        {aiData&&(
          <div style={{borderTop:"1px solid var(--border)",padding:"1.25rem"}}>
            {aiView==="priorities"&&(
              <>
                <h4 style={{marginBottom:".75rem",fontWeight:700,fontSize:".85rem"}}>Prioridades do dia</h4>
                {!Array.isArray(aiData?.items)||!aiData.items.length
                  ? <p className="muted">Nenhum paciente priorizado.</p>
                  : <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                      {aiData.items.map((item,idx)=>(
                        <div key={item.patientId||idx} style={{padding:".75rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:".25rem"}}>
                            <strong style={{fontSize:".85rem"}}>{idx+1}. {item.patientName}</strong>
                            <Chip tone={item?.risk?.level==="high"?"danger":"warn"}>{String(item?.risk?.level||"-").toUpperCase()} ⬢ {item?.risk?.score||0}pts</Chip>
                          </div>
                          <p style={{fontSize:".78rem",color:"var(--text-2)"}}>{item.topAction||"Revisar pendências"}</p>
                        </div>
                      ))}
                    </div>
                }
              </>
            )}

            {aiView==="quality"&&(
              <>
                <h4 style={{marginBottom:".75rem",fontWeight:700,fontSize:".85rem"}}>Qualidade de dados</h4>
                {!Array.isArray(aiData?.findings)||!aiData.findings.length
                  ? <p className="muted">Nenhuma inconsistência encontrada. ✓</p>
                  : aiData.findings.map((f,idx)=>(
                      <div key={idx} style={{padding:".65rem .85rem",borderLeft:"3px solid var(--amber-400)",background:"var(--amber-50)",borderRadius:"0 var(--r-md) var(--r-md) 0",marginBottom:".4rem"}}>
                        <strong style={{fontSize:".83rem",color:"var(--amber-800)"}}>{f.patientName||"Paciente"}</strong>
                        <p style={{fontSize:".78rem",color:"var(--amber-700)",marginTop:".15rem"}}>{f.issue||"Inconsistência"}</p>
                      </div>
                    ))
                }
              </>
            )}

            {aiView==="report"&&(
              <>
                <h4 style={{marginBottom:".5rem",fontWeight:700,fontSize:".85rem"}}>Relatório executivo</h4>
                <div style={{padding:".85rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",marginBottom:".75rem",fontSize:".84rem",color:"var(--text-2)",lineHeight:1.6}}>
                  {aiData?.executiveSummary||"Resumo não disponível."}
                </div>
                <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"1rem"}}>
                  {[["Pacientes",aiData?.totals?.patients],["Alto risco",aiData?.totals?.highRiskPatients],["Tarefas vencidas",aiData?.totals?.overdueTasks]].map(([label,val])=>(
                    <div key={label} style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".75rem 1rem",flex:1,minWidth:100}}>
                      <div style={{fontSize:"1.4rem",fontWeight:700,fontFamily:"IBM Plex Mono"}}>{val||0}</div>
                      <div style={{fontSize:".72rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em"}}>{label}</div>
                    </div>
                  ))}
                </div>
                {aiData?.recommendations?.length>0&&(
                  <>
                    <h4 style={{fontWeight:700,fontSize:".8rem",marginBottom:".4rem"}}>Recomendações</h4>
                    {aiData.recommendations.map((rec,i)=>(
                      <div key={i} style={{padding:".5rem .75rem",borderLeft:"2px solid var(--teal-400)",marginBottom:".3rem",fontSize:".82rem",color:"var(--text-2)"}}>{rec}</div>
                    ))}
                  </>
                )}
              </>
            )}

            {aiView==="chat"&&(
              <div style={{padding:".85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",fontSize:".84rem",color:"var(--teal-900)",lineHeight:1.6}}>
                {aiData?.answer||"Sem resposta."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AiTab;
