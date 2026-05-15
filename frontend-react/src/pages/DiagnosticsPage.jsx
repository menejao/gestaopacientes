import { useMemo } from "react";
import PageHero from "../components/layout/PageHero";
import { roleLabel } from "../utils/roles";

function DiagnosticsPage({ apiHealth, token, user, patients, users, templates, lastLoadAt, demandMonthly }) {
  const sessionAgeMin = useMemo(() => {
    const issuedAt = Number(user?.iat || 0) * 1000;
    if (!issuedAt) return null;
    return Math.max(0, Math.round((Date.now() - issuedAt) / 60000));
  }, [user?.iat]);

  const updatedAt = apiHealth?.checkedAt
    ? new Date(apiHealth.checkedAt).toLocaleString("pt-BR")
    : "-";

  const healthColor = apiHealth?.status === "ok"
    ? "var(--green-600)"
    : apiHealth?.status === "degraded"
      ? "var(--amber-600)"
      : "var(--red-600,#dc2626)";

  const latency = Number(apiHealth?.latencyMs || 0);
  const totalRecords = useMemo(() => {
    try {
      return (patients || []).reduce((sum, p) => sum + Number(p?.historyCount || 0), 0);
    } catch {
      return 0;
    }
  }, [patients]);

  return (
    <div className="workspace-home">
      <PageHero
        badge="Sistema"
        title="Diagnósticos"
        subtitle="Visão técnica: conectividade, sessão, carga e consistência básica."
        actions={
          <div style={{display:"flex",flexDirection:"column",gap:".35rem",alignItems:"flex-end",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:".5rem",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:"var(--r-md)",padding:".4rem .85rem"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:healthColor,flexShrink:0}}/>
              <span style={{fontSize:".78rem",fontWeight:700,color:"var(--slate-200)"}}>{apiHealth?.label || "Verificando..."}</span>
            </div>
            {latency>0&&<span style={{fontSize:".7rem",color:"var(--slate-400)"}}>Latência: {latency} ms</span>}
          </div>
        }
      />

      {/* KPIs */}
      <div className="home-kpi-grid">
        <div className="home-kpi-card">
          <p className="home-kpi-label">API</p>
          <p className="home-kpi-value" style={{color:healthColor}}>{apiHealth?.label||"—"}</p>
          <p className="home-kpi-foot">Verificado: {updatedAt}</p>
        </div>
        <div className="home-kpi-card">
          <p className="home-kpi-label">Sessão</p>
          <p className="home-kpi-value">{token?"Ativa":"—"}</p>
          <p className="home-kpi-foot">{roleLabel(user?.role)} · {sessionAgeMin===null?"—":`${sessionAgeMin} min`}</p>
        </div>
        <div className="home-kpi-card">
          <p className="home-kpi-label">Carga local</p>
          <p className="home-kpi-value">{patients?.length||0}</p>
          <p className="home-kpi-foot">{users?.length||0} usuários · {templates?.length||0} protocolos · {totalRecords} registros</p>
        </div>
        <div className="home-kpi-card">
          <p className="home-kpi-label">Última carga</p>
          <p className="home-kpi-value" style={{fontSize:"1.25rem"}}>{lastLoadAt?new Date(lastLoadAt).toLocaleTimeString("pt-BR"):"—"}</p>
          <p className="home-kpi-foot">Demanda: {Number(demandMonthly?.totals?.total??0)} · Agend. {Number(demandMonthly?.totals?.scheduled??0)} · Esp. {Number(demandMonthly?.totals?.walkin??0)}</p>
        </div>
      </div>

      {/* Detalhes */}
      <div className="card">
        <div className="card-header"><span className="card-title">Detalhes da sessão</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:".75rem 2rem"}}>
            {[
              ["Perfil",roleLabel(user?.role)],
              ["Usuário",user?.name||"—"],
              ["Tempo de sessão",sessionAgeMin===null?"—":`${sessionAgeMin} min`],
              ["API URL",apiHealth?.url||"—"],
              ["Latência",latency?`${latency} ms`:"—"],
              ["Verificado em",updatedAt],
            ].map(([label,value])=>(
              <div key={label}>
                <p style={{fontSize:".7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:"var(--text-3)",marginBottom:".2rem"}}>{label}</p>
                <p style={{fontSize:".88rem",fontWeight:600,color:"var(--text-1)",wordBreak:"break-all"}}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiagnosticsPage;
