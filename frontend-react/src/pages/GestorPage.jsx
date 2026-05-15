import { useState } from "react";
import PageHero from "../components/layout/PageHero";
import { readLS, auditLog } from "../utils/storage";
import { AGENDA_KEY, REFERRALS_KEY, AUDIT_KEY } from "../config/constants";
import { ageInMonths, protocolChip } from "../utils/clinical";
import { roleLabel } from "../utils/roles";
function GestorPage({ patients, users, templates, protocolByPatient }) {
  const now = new Date();
  const ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const [globalUserSearch, setGlobalUserSearch] = useState("");
  const [globalUserRoleFilter, setGlobalUserRoleFilter] = useState("all");
  const [globalUserStatusFilter, setGlobalUserStatusFilter] = useState("all");
  const [globalUserTeamFilter, setGlobalUserTeamFilter] = useState("all");
  const agenda    = readLS(AGENDA_KEY, []);
  const referrals = readLS(REFERRALS_KEY, []);
  const pharmaLog = readLS("saudeubs_pharmalog_v1", []);
  const stock     = readLS("saudeubs_pharmacy_v1", []);
  const auditLog  = readLS(AUDIT_KEY, []);

  // ── Período ──────────────────────────────────────────────────
  const [period, setPeriod] = useState("month");
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === "quarter") { const q=Math.floor(now.getMonth()/3); return Math.floor(d.getMonth()/3)===q && d.getFullYear()===now.getFullYear(); }
    return d.getFullYear()===now.getFullYear();
  }
  const periodLabel = { month:"Mes atual", quarter:"Trimestre atual", year:"Ano atual" }[period];

  // ── Pacientes ─────────────────────────────────────────────────
  const totalPacientes   = patients.length;
  const comAcs           = patients.filter(p=>p.assignedAcsId).length;
  const semAcs           = totalPacientes - comAcs;
  const gestantes        = patients.filter(p=>String(p.careCategory||"").toLowerCase()==="pregnant").length;
  const criancas         = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am<120; }).length;
  const cronicos         = patients.filter(p=>Array.isArray(p.chronicConditions) && p.chronicConditions.length>0).length;
  const idosos           = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am>=720; }).length;

  // ── Protocolo ────────────────────────────────────────────────
  const criticos  = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger").length;
  const atencao   = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="warn").length;
  const emDia     = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="ok").length;
  const cobertura = totalPacientes>0 ? Math.round(emDia/totalPacientes*100) : 0;

  // ── Produção ─────────────────────────────────────────────────
  const agendaPeriod  = agenda.filter(a=>inPeriod(a.date));
  const consultDone   = agendaPeriod.filter(a=>a.status==="done").length;
  const consultAbsent = agendaPeriod.filter(a=>a.status==="absent").length;
  const consultTotal  = agendaPeriod.length;
  const taxaComp      = consultTotal>0 ? Math.round(consultDone/consultTotal*100) : null;

  // ── Encaminhamentos ───────────────────────────────────────────
  const refPeriod     = referrals.filter(r=>inPeriod(r.createdAt));
  const refPendentes  = refPeriod.filter(r=>r.status==="pending").length;
  const refConcluidos = refPeriod.filter(r=>r.status==="done").length;

  // ── Farmácia ──────────────────────────────────────────────────
  const dispensas  = pharmaLog.filter(l=>l.type==="dispensa"&&inPeriod(l.ts)).length;
  const lowStock   = (stock||[]).filter(s=>Number(s.qty||0)<=Number(s.minQty||0)).length;
  const estoqueCrit= (stock||[]).filter(s=>Number(s.qty||0)===0).length;

  // ── Equipe ───────────────────────────────────────────────────
  const acsCount   = users.filter(u=>u.role==="acs").length;
  const docCount   = users.filter(u=>["doctor","nurse_manager"].includes(u.role)).length;
  const dentCount  = users.filter(u=>u.role==="dentist").length;
  const techCount  = users.filter(u=>["nursing_tech","pharmacy_tech"].includes(u.role)).length;

  // ── ACS performance ──────────────────────────────────────────
  const acsPerf = users.filter(u=>u.role==="acs").map(u=>{
    const mine = patients.filter(p=>p.assignedAcsId===u.id);
    const crit = mine.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger").length;
    const ok   = mine.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="ok").length;
    return { name:u.name, total:mine.length, criticos:crit, emDia:ok };
  }).sort((a,b)=>b.criticos-a.criticos);

  // ── Categoria breakdown ───────────────────────────────────────
  const catBreak = {};
  patients.forEach(p=>{ const c=p.careCategory||"general"; catBreak[c]=(catBreak[c]||0)+1; });
  const catEntries = Object.entries(catBreak).sort((a,b)=>b[1]-a[1]);
  const userPresence = [...users]
    .map((u) => {
      const lastSeenAt = String(u?.lastSeenAt || u?.lastLoginAt || "");
      const lastSeenTs = Date.parse(lastSeenAt);
      const online = Number.isFinite(lastSeenTs) ? (Date.now() - lastSeenTs <= ONLINE_WINDOW_MS) : false;
      return { ...u, online, lastSeenAt };
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

  const userRoleOptions = [...new Set(userPresence.map((u) => String(u.role || "")).filter(Boolean))];
  const userTeamOptions = [...new Set(userPresence.map((u) => String(u.teamName || "")).filter(Boolean))];

  const filteredUsersGlobal = userPresence.filter((u) => {
    const q = String(globalUserSearch || "").trim().toLowerCase();
    const matchesText = !q
      || String(u.name || "").toLowerCase().includes(q)
      || String(u.email || "").toLowerCase().includes(q);
    const matchesRole = globalUserRoleFilter === "all" || String(u.role || "") === globalUserRoleFilter;
    const matchesStatus = globalUserStatusFilter === "all"
      || (globalUserStatusFilter === "online" && u.online)
      || (globalUserStatusFilter === "offline" && !u.online);
    const matchesTeam = globalUserTeamFilter === "all" || String(u.teamName || "") === globalUserTeamFilter;
    return matchesText && matchesRole && matchesStatus && matchesTeam;
  });

  // ── Auditoria recente ─────────────────────────────────────────
  const auditRecent = [...(auditLog||[])].reverse().slice(0,8);

  // ── Helpers visuais ──────────────────────────────────────────
  const TEAL="var(--teal-600)", RED="var(--red-600)", AMBER="var(--amber-600)", GREEN="var(--green-600)", BLUE="var(--blue-700)", VIOLET="var(--violet-600)";

  function KPI({ label, value, sub, color=TEAL, icon, trend }) {
    return (
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-lg)",padding:"1.1rem 1.25rem",boxShadow:"var(--sh-xs)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:color,borderRadius:"var(--r-lg) var(--r-lg) 0 0"}}/>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem"}}>
          <div>
            <div style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--text-3)",marginBottom:".5rem"}}>{label}</div>
            <div style={{fontSize:"2rem",fontWeight:800,color,lineHeight:1,fontFamily:"IBM Plex Mono,monospace",letterSpacing:"-.02em"}}>{value}</div>
            {sub&&<div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".3rem"}}>{sub}</div>}
          </div>
          {icon&&<div style={{fontSize:"1.4rem",opacity:.18,flexShrink:0}}>{icon}</div>}
        </div>
        {trend!=null&&(
          <div style={{marginTop:".6rem",display:"flex",alignItems:"center",gap:".3rem",fontSize:".72rem",color:trend>=0?GREEN:RED,fontWeight:600}}>
            {trend>=0?"↑":"↓"} {Math.abs(trend)}% vs período anterior
          </div>
        )}
      </div>
    );
  }

  function SectionTitle({ children, icon }) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:".5rem",margin:"1.5rem 0 .75rem"}}>
        {icon&&<span style={{fontSize:"1rem"}}>{icon}</span>}
        <h3 style={{fontSize:".82rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--text-3)"}}>{children}</h3>
        <div style={{flex:1,height:1,background:"var(--border)"}}/>
      </div>
    );
  }

  function Bar({ value, max, color=TEAL }) {
    const pct = max>0 ? Math.min(100,Math.round(value/max*100)) : 0;
    return (
      <div style={{height:6,background:"var(--surface-2)",borderRadius:99,overflow:"hidden",flex:1}}>
        <div style={{height:"100%",width:pct+"%",background:color,borderRadius:99,transition:"width .4s ease"}}/>
      </div>
    );
  }

  function GaugePie({ value, max, color=TEAL, label, size=80 }) {
    const pct = max>0?Math.min(1,value/max):0;
    const r=30, circ=2*Math.PI*r;
    const dash=circ*pct, gap=circ-dash;
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".3rem"}}>
        <svg width={size} height={size} viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8"/>
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
            transform="rotate(-90 36 36)" style={{transition:"stroke-dasharray .5s ease"}}/>
          <text x="36" y="40" textAnchor="middle" style={{fontSize:13,fontWeight:800,fill:color,fontFamily:"IBM Plex Mono,monospace"}}>{Math.round(pct*100)}%</text>
        </svg>
        <div style={{fontSize:".72rem",fontWeight:600,color:"var(--text-2)",textAlign:"center"}}>{label}</div>
      </div>
    );
  }

  return (
    <div style={{padding:"1.5rem 2rem",display:"flex",flexDirection:"column",gap:"1.25rem",maxWidth:1200}}>

      <PageHero
        badge="Painel de Gestão"
        title="Indicadores à Vista"
        subtitle="Visão executiva da UBS, atualizada em tempo real com os dados da equipe."
        actions={
          <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",flexShrink:0}}>
            {[["month","Mês"],["quarter","Trimestre"],["year","Ano"]].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriod(k)} style={{fontSize:".75rem",padding:".35rem .8rem",background:period===k?TEAL:"rgba(255,255,255,.1)",color:period===k?"var(--teal-900)":"var(--slate-200)",border:period===k?"none":"1px solid rgba(255,255,255,.2)",borderRadius:"var(--r-md)",fontWeight:600,cursor:"pointer"}}>
                {l}
              </button>
            ))}
            <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".35rem .8rem",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:"var(--r-md)",color:"var(--slate-200)",cursor:"pointer"}}>
              Exportar
            </button>
          </div>
        }
      />

      {/* KPIs principais */}
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"1rem"}}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Logins cadastrados (todas as funções)</span>
            <span style={{fontSize:".75rem",color:"var(--text-3)"}}>
              {filteredUsersGlobal.filter((u)=>u.online).length} online · {filteredUsersGlobal.length} visíveis
            </span>
          </div>
          <div className="card-body" style={{paddingBottom:".55rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 140px 120px 170px",gap:".5rem"}}>
              <input
                value={globalUserSearch}
                onChange={(e)=>setGlobalUserSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .6rem",fontSize:".78rem",fontFamily:"inherit"}}
              />
              <select
                value={globalUserRoleFilter}
                onChange={(e)=>setGlobalUserRoleFilter(e.target.value)}
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .5rem",fontSize:".78rem",fontFamily:"inherit"}}
              >
                <option value="all">Todas as funções</option>
                {userRoleOptions.map((role)=><option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
              <select
                value={globalUserStatusFilter}
                onChange={(e)=>setGlobalUserStatusFilter(e.target.value)}
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .5rem",fontSize:".78rem",fontFamily:"inherit"}}
              >
                <option value="all">Todos status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
              <select
                value={globalUserTeamFilter}
                onChange={(e)=>setGlobalUserTeamFilter(e.target.value)}
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .5rem",fontSize:".78rem",fontFamily:"inherit"}}
              >
                <option value="all">Todas equipes</option>
                {userTeamOptions.map((team)=><option key={team} value={team}>{team}</option>)}
              </select>
            </div>
          </div>
          <div className="card-body" style={{maxHeight:320,overflow:"auto"}}>
            {!filteredUsersGlobal.length ? (
              <p className="muted" style={{fontSize:".84rem"}}>Nenhum login cadastrado.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                {filteredUsersGlobal.map((u) => (
                  <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:".5rem",padding:".5rem .6rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:".8rem",fontWeight:600,color:"var(--text-1)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                      <div style={{fontSize:".72rem",color:"var(--text-3)"}}>
                        {u.email} · {roleLabel(u.role)} · {u.teamName || "Sem equipe"}
                      </div>
                    </div>
                    <span style={{alignSelf:"center",fontSize:".68rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:u.online?"var(--green-100)":"var(--slate-100)",border:`1px solid ${u.online?"var(--green-200)":"var(--slate-300)"}`,color:u.online?"var(--green-800)":"var(--slate-600)"}}>
                      {u.online ? "Online" : "Offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:".85rem"}}>
        <KPI label="Pacientes cadastrados" value={totalPacientes} sub={`Com ACS: ${comAcs} · Sem ACS: ${semAcs}`} icon="P" color={TEAL}/>
        <KPI label="Protocolos criticos" value={criticos} sub={`Aten?o: ${atencao} · Em dia: ${emDia}`} icon="!" color={criticos>0?RED:GREEN}/>
        <KPI label="Cobertura protocolar" value={cobertura+"%"} sub={`${emDia} de ${totalPacientes} pacientes em dia`} icon="OK" color={cobertura>=80?GREEN:cobertura>=50?AMBER:RED}/>
        <KPI label="Consultas realizadas" value={consultDone} sub={`Faltas: ${consultAbsent} · Taxa: ${taxaComp!=null?taxaComp+"%":"-"}`} icon="C" color={BLUE}/>
        <KPI label="📤 Encaminhamentos" value={refPeriod.length} sub={`Pendentes: ${refPendentes} · Concluidos: ${refConcluidos}`} icon="E" color={VIOLET}/>
        <KPI label="Estoque critico" value={lowStock} sub={`${estoqueCrit} item(s) zerado(s)`} icon="S" color={lowStock>0?RED:GREEN}/>
      </div>

      {/* ── Gauges protocolo ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">📈 Desempenho Protocolar</span></div>
        <div className="card-body" style={{display:"flex",alignItems:"center",gap:"2rem",flexWrap:"wrap"}}>
          <GaugePie value={emDia} max={totalPacientes} color={GREEN} label="Em dia"/>
          <GaugePie value={atencao} max={totalPacientes} color={AMBER} label="Aten?o"/>
          <GaugePie value={criticos} max={totalPacientes} color={RED} label="Critico"/>
          {taxaComp!=null&&<GaugePie value={consultDone} max={consultTotal} color={BLUE} label="Comparecimento"/>}
          <div style={{flex:1,minWidth:200}}>
            <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
              {[
                {label:"Gestantes",count:gestantes,color:"#ec4899"},
                {label:"Criancas (puericultura)",count:criancas,color:TEAL},
                {label:"Cronicos",count:cronicos,color:AMBER},
                {label:"Idosos",count:idosos,color:VIOLET},
              ].map(({label,count,color})=>(
                <div key={label}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:".75rem",marginBottom:".2rem"}}>
                    <span style={{color:"var(--text-2)",fontWeight:500}}>{label}</span>
                    <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:700,color}}>{count}</span>
                  </div>
                  <Bar value={count} max={totalPacientes} color={color}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Equipe e ACS ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>

        {/* Composição da equipe */}
        <div className="card">
          <div className="card-header"><span className="card-title">Composi?o da equipe</span><span style={{fontSize:".75rem",color:"var(--text-3)"}}>{users.length} membros</span></div>
          <div className="card-body">
            {[
              {label:"ACS",count:acsCount,color:AMBER,icon:"🏘️"},
              {label:"Medicos / Enfermeiros",count:docCount,color:BLUE,icon:"M"},
              {label:"Dentistas",count:dentCount,color:VIOLET,icon:"D"},
              {label:"Tecnicos",count:techCount,color:TEAL,icon:"T"},
            ].map(({label,count,color,icon})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".55rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                <span style={{fontSize:"1rem"}}>{icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:".82rem",marginBottom:".2rem"}}>
                    <span style={{fontWeight:500,color:"var(--text-1)"}}>{label}</span>
                    <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:700,color}}>{count}</span>
                  </div>
                  <Bar value={count} max={users.length} color={color}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance ACS */}
        <div className="card">
          <div className="card-header"><span className="card-title">🏘️ Performance por ACS</span></div>
          <div className="card-body">
            {!acsPerf.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum ACS cadastrado.</p>
              : <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                  {acsPerf.map(a=>(
                    <div key={a.name} style={{padding:".6rem .75rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".35rem"}}>
                        <span style={{fontWeight:600,fontSize:".83rem",color:"var(--text-1)"}}>{a.name}</span>
                        <div style={{display:"flex",gap:".35rem"}}>
                          <span style={{fontSize:".68rem",fontWeight:700,padding:".1em .45em",borderRadius:99,background:a.criticos>0?"var(--red-50)":"var(--green-50)",color:a.criticos>0?RED:GREEN,border:`1px solid ${a.criticos>0?"var(--red-200)":"var(--green-200)"}`}}>
                            {a.criticos} critico{a.criticos!==1?"s":""}
                          </span>
                          <span style={{fontSize:".68rem",fontWeight:700,padding:".1em .45em",borderRadius:99,background:"var(--surface)",color:"var(--text-3)",border:"1px solid var(--border)"}}>
                            {a.total} pac.
                          </span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                        <Bar value={a.emDia} max={a.total} color={GREEN}/>
                        <span style={{fontSize:".7rem",color:"var(--text-3)",flexShrink:0,minWidth:32}}>{a.total>0?Math.round(a.emDia/a.total*100):0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>

      {/* ── Produção ── */}
      <SectionTitle icon="📅">Produção — {periodLabel}</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:".85rem"}}>
        <KPI label="Consultas agendadas" value={consultTotal} icon="📅" color={BLUE}/>
        <KPI label="Consultas realizadas" value={consultDone} icon="✔️" color={GREEN}/>
        <KPI label="Faltas / ausências" value={consultAbsent} icon="❌" color={consultAbsent>0?AMBER:"var(--text-3)"}/>
        <KPI label="Taxa de comparecimento" value={taxaComp!=null?taxaComp+"%":"—"} icon="📊" color={taxaComp!=null?(taxaComp>=80?GREEN:taxaComp>=60?AMBER:RED):TEAL}/>
        <KPI label="Encaminhamentos emitidos" value={refPeriod.length} icon="📤" color={VIOLET}/>
        <KPI label="Dispensações farmácia" value={dispensas} icon="💊" color={TEAL}/>
      </div>

      {/* ── Farmácia ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <div className="card">
          <div className="card-header"><span className="card-title">💊 Estoque — Situação Atual</span></div>
          <div className="card-body">
            {!stock?.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Sem itens cadastrados.</p>
              : <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".5rem",marginBottom:"1rem"}}>
                    {[
                      {label:"Total de itens",v:stock.length,color:TEAL},
                      {label:"Estoque baixo",v:lowStock,color:AMBER},
                      {label:"Zerados",v:estoqueCrit,color:RED},
                    ].map(({label,v,color})=>(
                      <div key={label} style={{textAlign:"center",background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:".65rem .5rem",border:"1px solid var(--border)"}}>
                        <div style={{fontSize:"1.4rem",fontWeight:800,color,fontFamily:"IBM Plex Mono,monospace"}}>{v}</div>
                        <div style={{fontSize:".68rem",color:"var(--text-3)",marginTop:".15rem"}}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {stock.filter(s=>Number(s.qty||0)<=Number(s.minQty||0)).slice(0,5).map(s=>(
                    <div key={s.id||s.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".4rem 0",borderBottom:"1px solid var(--border-soft)",fontSize:".8rem"}}>
                      <span style={{color:"var(--text-1)",fontWeight:500}}>{s.name}</span>
                      <span style={{fontWeight:700,color:Number(s.qty||0)===0?RED:AMBER,fontFamily:"IBM Plex Mono,monospace"}}>{s.qty||0} un.</span>
                    </div>
                  ))}
                  {lowStock>5&&<p style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".5rem"}}>+{lowStock-5} itens abaixo do mínimo</p>}
                </>
            }
          </div>
        </div>

        {/* Encaminhamentos por especialidade */}
        <div className="card">
          <div className="card-header"><span className="card-title">📋 Encaminhamentos por Especialidade</span><span style={{fontSize:".75rem",color:"var(--text-3)"}}>{refPeriod.length} total</span></div>
          <div className="card-body">
            {!refPeriod.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum encaminhamento no período.</p>
              : (() => {
                  const specMap = {};
                  refPeriod.forEach(r=>{ specMap[r.specialty||"Outros"]=(specMap[r.specialty||"Outros"]||0)+1; });
                  return Object.entries(specMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([s,c])=>(
                    <div key={s} style={{display:"flex",alignItems:"center",gap:".6rem",padding:".4rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                      <span style={{flex:1,fontSize:".8rem",color:"var(--text-1)",fontWeight:500}}>{s}</span>
                      <Bar value={c} max={refPeriod.length} color={VIOLET}/>
                      <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:700,color:VIOLET,fontSize:".78rem",minWidth:24,textAlign:"right"}}>{c}</span>
                    </div>
                  ));
                })()
            }
          </div>
        </div>
      </div>

      {/* ── Distribuição de pacientes ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">👥 Distribuição de Pacientes por Categoria</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:".6rem"}}>
            {catEntries.map(([cat,count])=>{
              const label=templates.find(t=>t.category===cat)?.label||cat;
              const pct=totalPacientes>0?Math.round(count/totalPacientes*100):0;
              const chip=protocolChip;
              const catCrit=patients.filter(p=>p.careCategory===cat&&chip(protocolByPatient[p.id]).tone==="danger").length;
              return (
                <div key={cat} style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".75rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:".4rem"}}>
                    <span style={{fontWeight:600,fontSize:".83rem",color:"var(--text-1)"}}>{label}</span>
                    <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:800,fontSize:".95rem",color:TEAL}}>{count}</span>
                  </div>
                  <Bar value={count} max={totalPacientes} color={TEAL}/>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:".3rem",fontSize:".7rem",color:"var(--text-3)"}}>
                    <span>{pct}% do total</span>
                    {catCrit>0&&<span style={{color:RED,fontWeight:700}}>{catCrit} crítico{catCrit!==1?"s":""}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Auditoria recente ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔍 Trilha de Auditoria — Ações Recentes</span>
          <span style={{fontSize:".72rem",color:"var(--text-3)"}}>{auditLog?.length||0} registros totais</span>
        </div>
        <div className="card-body">
          {!auditRecent.length
            ? <p className="muted" style={{fontSize:".84rem"}}>Nenhuma ação registrada ainda.</p>
            : <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {auditRecent.map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:".75rem",padding:".55rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",fontSize:".78rem"}}>
                    <span style={{flexShrink:0,width:8,height:8,borderRadius:"50%",background:TEAL,marginTop:4,display:"block"}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontWeight:600,color:"var(--text-1)"}}>{a.action||a.event||"Ação"}</span>
                      {a.user && (
                        <span style={{ color:"var(--text-3)", marginLeft:".4rem" }}>
                          por {typeof a.user === "object" ? (a.user.name || a.user.email || "usuário") : a.user}
                        </span>
                      )}
                    </div>
                    <span style={{flexShrink:0,color:"var(--text-3)",fontFamily:"IBM Plex Mono,monospace",fontSize:".7rem"}}>
                      {a.ts||a.createdAt ? new Date(a.ts||a.createdAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

    </div>
  );
}
export default GestorPage;