import { useState } from "react";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import { Tabs, Tab } from "../components/ui/Tabs";
import { readLS, auditLog } from "../utils/storage";
import { AGENDA_KEY, REFERRALS_KEY, AUDIT_KEY } from "../config/constants";
import { ageInMonths, protocolChip } from "../utils/clinical";
import { roleLabel } from "../utils/roles";

// Semantic token aliases for data-viz colors
const C_ACCENT  = "var(--accent)";
const C_DANGER  = "var(--danger)";
const C_WARNING = "var(--warning)";
const C_SUCCESS = "var(--success)";
const C_INFO    = "var(--info)";
const C_MUTED   = "var(--text-muted)";

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
  const auditData = readLS(AUDIT_KEY, []);

  const [period, setPeriod] = useState("month");
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === "quarter") { const q = Math.floor(now.getMonth() / 3); return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear(); }
    return d.getFullYear() === now.getFullYear();
  }
  const periodLabel = { month:"Mês atual", quarter:"Trimestre atual", year:"Ano atual" }[period];

  // ── Pacientes
  const totalPacientes = patients.length;
  const comAcs  = patients.filter(p => p.assignedAcsId).length;
  const semAcs  = totalPacientes - comAcs;
  const gestantes = patients.filter(p => String(p.careCategory || "").toLowerCase() === "pregnant").length;
  const criancas  = patients.filter(p => { const am = ageInMonths(p.birthDate); return am !== null && am < 120; }).length;
  const cronicos  = patients.filter(p => Array.isArray(p.chronicConditions) && p.chronicConditions.length > 0).length;
  const idosos    = patients.filter(p => { const am = ageInMonths(p.birthDate); return am !== null && am >= 720; }).length;

  // ── Protocolo
  const criticos  = patients.filter(p => protocolChip(protocolByPatient[p.id]).tone === "danger").length;
  const atencao   = patients.filter(p => protocolChip(protocolByPatient[p.id]).tone === "warn").length;
  const emDia     = patients.filter(p => protocolChip(protocolByPatient[p.id]).tone === "ok").length;
  const cobertura = totalPacientes > 0 ? Math.round(emDia / totalPacientes * 100) : 0;

  // ── Produção
  const agendaPeriod  = agenda.filter(a => inPeriod(a.date));
  const consultDone   = agendaPeriod.filter(a => a.status === "done").length;
  const consultAbsent = agendaPeriod.filter(a => a.status === "absent").length;
  const consultTotal  = agendaPeriod.length;
  const taxaComp      = consultTotal > 0 ? Math.round(consultDone / consultTotal * 100) : null;

  // ── Encaminhamentos
  const refPeriod     = referrals.filter(r => inPeriod(r.createdAt));
  const refPendentes  = refPeriod.filter(r => r.status === "pending").length;
  const refConcluidos = refPeriod.filter(r => r.status === "done").length;

  // ── Farmácia
  const dispensas   = pharmaLog.filter(l => l.type === "dispensa" && inPeriod(l.ts)).length;
  const lowStock    = (stock || []).filter(s => Number(s.qty || 0) <= Number(s.minQty || 0)).length;
  const estoqueCrit = (stock || []).filter(s => Number(s.qty || 0) === 0).length;

  // ── Equipe
  const acsCount  = users.filter(u => u.role === "acs").length;
  const docCount  = users.filter(u => ["doctor","nurse_manager"].includes(u.role)).length;
  const dentCount = users.filter(u => u.role === "dentist").length;
  const techCount = users.filter(u => ["nursing_tech","pharmacy_tech"].includes(u.role)).length;

  // ── ACS performance
  const acsPerf = users.filter(u => u.role === "acs").map(u => {
    const mine = patients.filter(p => p.assignedAcsId === u.id);
    const crit = mine.filter(p => protocolChip(protocolByPatient[p.id]).tone === "danger").length;
    const ok   = mine.filter(p => protocolChip(protocolByPatient[p.id]).tone === "ok").length;
    return { name:u.name, total:mine.length, criticos:crit, emDia:ok };
  }).sort((a, b) => b.criticos - a.criticos);

  // ── Categoria breakdown
  const catBreak = {};
  patients.forEach(p => { const c = p.careCategory || "general"; catBreak[c] = (catBreak[c] || 0) + 1; });
  const catEntries = Object.entries(catBreak).sort((a, b) => b[1] - a[1]);

  // ── Presença da equipe
  const userPresence = [...users].map(u => {
    const lastSeenAt = String(u?.lastSeenAt || u?.lastLoginAt || "");
    const lastSeenTs = Date.parse(lastSeenAt);
    const online = Number.isFinite(lastSeenTs) ? (Date.now() - lastSeenTs <= ONLINE_WINDOW_MS) : false;
    return { ...u, online, lastSeenAt };
  }).sort((a, b) => Number(b.online) - Number(a.online) || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

  const userRoleOptions = [...new Set(userPresence.map(u => String(u.role || "")).filter(Boolean))];
  const userTeamOptions = [...new Set(userPresence.map(u => String(u.teamName || "")).filter(Boolean))];

  const filteredUsersGlobal = userPresence.filter(u => {
    const q = String(globalUserSearch || "").trim().toLowerCase();
    const matchesText = !q || String(u.name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q);
    const matchesRole = globalUserRoleFilter === "all" || String(u.role || "") === globalUserRoleFilter;
    const matchesStatus = globalUserStatusFilter === "all"
      || (globalUserStatusFilter === "online" && u.online)
      || (globalUserStatusFilter === "offline" && !u.online);
    const matchesTeam = globalUserTeamFilter === "all" || String(u.teamName || "") === globalUserTeamFilter;
    return matchesText && matchesRole && matchesStatus && matchesTeam;
  });

  const auditRecent = [...(auditData || [])].reverse().slice(0, 8);

  // ── Sub-components for data visualization ──

  function StatKPI({ label, value, sub, color = C_ACCENT, icon, trend }) {
    return (
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:"var(--r-lg)", padding:"var(--s-4) var(--s-5)", boxShadow:"var(--shadow-xs)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color, borderRadius:"var(--r-lg) var(--r-lg) 0 0" }}/>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"var(--s-2)" }}>
          <div>
            <div style={{ font:`700 var(--t-xs) var(--font-sans)`, textTransform:"uppercase", letterSpacing:".08em", color:"var(--text-dim)", marginBottom:"var(--s-2)" }}>{label}</div>
            <div style={{ font:`800 2rem var(--font-mono)`, color, lineHeight:1, letterSpacing:"-.02em" }}>{value}</div>
            {sub && <div style={{ font:`400 var(--t-xs) var(--font-sans)`, color:"var(--text-dim)", marginTop:"var(--s-1)" }}>{sub}</div>}
          </div>
          {icon && <div style={{ font:`400 1.4rem var(--font-sans)`, opacity:.18, flexShrink:0 }}>{icon}</div>}
        </div>
        {trend != null && (
          <div style={{ marginTop:"var(--s-2)", display:"flex", alignItems:"center", gap:"var(--s-1)", font:`600 var(--t-xs) var(--font-sans)`, color:trend >= 0 ? C_SUCCESS : C_DANGER }}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs período anterior
          </div>
        )}
      </div>
    );
  }

  function SectionTitle({ children, icon }) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:"var(--s-2)", margin:"var(--s-6) 0 var(--s-3)" }}>
        {icon && <span style={{ font:`400 1rem var(--font-sans)` }}>{icon}</span>}
        <h3 style={{ font:`700 var(--t-xs) var(--font-sans)`, textTransform:"uppercase", letterSpacing:".1em", color:"var(--text-dim)", margin:0 }}>{children}</h3>
        <div style={{ flex:1, height:1, background:"var(--border)" }}/>
      </div>
    );
  }

  function Bar({ value, max, color = C_ACCENT }) {
    const pct = max > 0 ? Math.min(100, Math.round(value / max * 100)) : 0;
    return (
      <div style={{ height:6, background:"var(--surface-2)", borderRadius:99, overflow:"hidden", flex:1 }}>
        <div style={{ height:"100%", width:pct + "%", background:color, borderRadius:99, transition:"width .4s ease" }}/>
      </div>
    );
  }

  function GaugePie({ value, max, color = C_ACCENT, label, size = 80 }) {
    const pct = max > 0 ? Math.min(1, value / max) : 0;
    const r = 30, circ = 2 * Math.PI * r;
    const dash = circ * pct, gap = circ - dash;
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"var(--s-1)" }}>
        <svg width={size} height={size} viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8"/>
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
            transform="rotate(-90 36 36)" style={{ transition:"stroke-dasharray .5s ease" }}/>
          <text x="36" y="40" textAnchor="middle" style={{ fontSize:13, fontWeight:800, fill:color, fontFamily:"var(--font-mono)" }}>
            {Math.round(pct * 100)}%
          </text>
        </svg>
        <div style={{ font:`600 var(--t-xs) var(--font-sans)`, color:"var(--text-muted)", textAlign:"center" }}>{label}</div>
      </div>
    );
  }

  return (
    <PageLayout className="gestor-page">

      <PageHeader
        eyebrow="Painel de Gestão"
        title="Indicadores à Vista"
        subtitle="Visão executiva da UBS, atualizada em tempo real com os dados da equipe."
        actions={
          <div style={{ display:"flex", gap:"var(--s-1)", flexWrap:"wrap", flexShrink:0 }}>
            {[["month","Mês"],["quarter","Trimestre"],["year","Ano"]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setPeriod(k)}
                className={`btn btn--sm${period === k ? " btn--primary" : " btn--ghost"}`}
              >
                {l}
              </button>
            ))}
            <button onClick={() => window.print()} className="btn btn--ghost btn--sm">Exportar</button>
          </div>
        }
      />

      {/* User list */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:"var(--s-4)" }}>
        <div className="card card--noPad">
          <div className="card__header">
            <span className="card__title">Logins cadastrados (todas as funções)</span>
            <span className="muted small">
              {filteredUsersGlobal.filter(u => u.online).length} online · {filteredUsersGlobal.length} visíveis
            </span>
          </div>
          <div className="card__body" style={{ paddingBottom:"var(--s-2)" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 120px 170px", gap:"var(--s-2)" }}>
              <input className="input" value={globalUserSearch} onChange={e => setGlobalUserSearch(e.target.value)} placeholder="Buscar por nome ou e-mail..."/>
              <select className="select" value={globalUserRoleFilter} onChange={e => setGlobalUserRoleFilter(e.target.value)}>
                <option value="all">Todas as funções</option>
                {userRoleOptions.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
              <select className="select" value={globalUserStatusFilter} onChange={e => setGlobalUserStatusFilter(e.target.value)}>
                <option value="all">Todos status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
              <select className="select" value={globalUserTeamFilter} onChange={e => setGlobalUserTeamFilter(e.target.value)}>
                <option value="all">Todas equipes</option>
                {userTeamOptions.map(team => <option key={team} value={team}>{team}</option>)}
              </select>
            </div>
          </div>
          <div className="card__body" style={{ maxHeight:320, overflow:"auto" }}>
            {!filteredUsersGlobal.length ? (
              <p className="muted small">Nenhum login cadastrado.</p>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-2)" }}>
                {filteredUsersGlobal.map(u => (
                  <div key={u.id} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"var(--s-2)", padding:"var(--s-2) var(--s-3)", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:"var(--r-md)" }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ font:`600 var(--t-sm) var(--font-sans)`, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{u.name}</div>
                      <div className="muted" style={{ font:`400 var(--t-xs) var(--font-sans)` }}>
                        {u.email} · {roleLabel(u.role)} · {u.teamName || "Sem equipe"}
                      </div>
                    </div>
                    <span style={{ alignSelf:"center", font:`700 var(--t-xs) var(--font-sans)`, padding:"2px var(--s-2)", borderRadius:"var(--r-pill)", background:u.online ? "var(--success-soft)" : "var(--surface-2)", border:`1px solid ${u.online ? "var(--success-bd)" : "var(--border)"}`, color:u.online ? "var(--success)" : "var(--text-dim)" }}>
                      {u.online ? "Online" : "Offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))", gap:"var(--s-3)" }}>
        <StatKPI label="Pacientes cadastrados" value={totalPacientes} sub={`Com ACS: ${comAcs} · Sem ACS: ${semAcs}`} icon="P" color={C_ACCENT}/>
        <StatKPI label="Protocolos críticos" value={criticos} sub={`Atenção: ${atencao} · Em dia: ${emDia}`} icon="!" color={criticos > 0 ? C_DANGER : C_SUCCESS}/>
        <StatKPI label="Cobertura protocolar" value={cobertura + "%"} sub={`${emDia} de ${totalPacientes} pacientes em dia`} icon="OK" color={cobertura >= 80 ? C_SUCCESS : cobertura >= 50 ? C_WARNING : C_DANGER}/>
        <StatKPI label="Consultas realizadas" value={consultDone} sub={`Faltas: ${consultAbsent} · Taxa: ${taxaComp != null ? taxaComp + "%" : "-"}`} icon="C" color={C_INFO}/>
        <StatKPI label="Encaminhamentos" value={refPeriod.length} sub={`Pendentes: ${refPendentes} · Concluídos: ${refConcluidos}`} icon="E" color={C_MUTED}/>
        <StatKPI label="Estoque crítico" value={lowStock} sub={`${estoqueCrit} item(s) zerado(s)`} icon="S" color={lowStock > 0 ? C_DANGER : C_SUCCESS}/>
      </div>

      {/* Gauges protocolo */}
      <div className="card card--noPad">
        <div className="card__header"><span className="card__title">Desempenho Protocolar</span></div>
        <div className="card__body" style={{ display:"flex", alignItems:"center", gap:"var(--s-8)", flexWrap:"wrap" }}>
          <GaugePie value={emDia} max={totalPacientes} color={C_SUCCESS} label="Em dia"/>
          <GaugePie value={atencao} max={totalPacientes} color={C_WARNING} label="Atenção"/>
          <GaugePie value={criticos} max={totalPacientes} color={C_DANGER} label="Crítico"/>
          {taxaComp != null && <GaugePie value={consultDone} max={consultTotal} color={C_INFO} label="Comparecimento"/>}
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-3)" }}>
              {[
                { label:"Gestantes",           count:gestantes, color:C_DANGER },
                { label:"Crianças (puericultura)", count:criancas, color:C_ACCENT },
                { label:"Crônicos",            count:cronicos,  color:C_WARNING },
                { label:"Idosos",              count:idosos,    color:C_MUTED },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div style={{ display:"flex", justifyContent:"space-between", font:`400 var(--t-xs) var(--font-sans)`, marginBottom:"var(--s-1)" }}>
                    <span style={{ color:"var(--text-muted)", fontWeight:500 }}>{label}</span>
                    <span style={{ font:`700 var(--t-xs) var(--font-mono)`, color }}>{count}</span>
                  </div>
                  <Bar value={count} max={totalPacientes} color={color}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Equipe e ACS */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"var(--s-4)" }}>
        <div className="card card--noPad">
          <div className="card__header">
            <span className="card__title">Composição da equipe</span>
            <span className="muted small">{users.length} membros</span>
          </div>
          <div className="card__body">
            {[
              { label:"ACS",                   count:acsCount,  color:C_WARNING, icon:"A" },
              { label:"Médicos / Enfermeiros",  count:docCount,  color:C_INFO,    icon:"M" },
              { label:"Dentistas",             count:dentCount, color:C_MUTED,   icon:"D" },
              { label:"Técnicos",              count:techCount, color:C_ACCENT,  icon:"T" },
            ].map(({ label, count, color, icon }) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:"var(--s-3)", padding:"var(--s-2) 0", borderBottom:"1px solid var(--border-subtle)" }}>
                <span style={{ font:`400 1rem var(--font-sans)` }}>{icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", font:`400 var(--t-sm) var(--font-sans)`, marginBottom:"var(--s-1)" }}>
                    <span style={{ fontWeight:500, color:"var(--text)" }}>{label}</span>
                    <span style={{ font:`700 var(--t-sm) var(--font-mono)`, color }}>{count}</span>
                  </div>
                  <Bar value={count} max={users.length} color={color}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card--noPad">
          <div className="card__header"><span className="card__title">Performance por ACS</span></div>
          <div className="card__body">
            {!acsPerf.length
              ? <p className="muted small">Nenhum ACS cadastrado.</p>
              : (
                <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-2)" }}>
                  {acsPerf.map(a => (
                    <div key={a.name} style={{ padding:"var(--s-2) var(--s-3)", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:"var(--r-md)" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"var(--s-1)" }}>
                        <span style={{ font:`600 var(--t-sm) var(--font-sans)`, color:"var(--text)" }}>{a.name}</span>
                        <div style={{ display:"flex", gap:"var(--s-1)" }}>
                          <span style={{ font:`700 var(--t-xs) var(--font-sans)`, padding:"2px var(--s-2)", borderRadius:"var(--r-pill)", background:a.criticos > 0 ? "var(--danger-soft)" : "var(--success-soft)", color:a.criticos > 0 ? C_DANGER : C_SUCCESS, border:`1px solid ${a.criticos > 0 ? "var(--danger-bd)" : "var(--success-bd)"}` }}>
                            {a.criticos} crítico{a.criticos !== 1 ? "s" : ""}
                          </span>
                          <span style={{ font:`700 var(--t-xs) var(--font-sans)`, padding:"2px var(--s-2)", borderRadius:"var(--r-pill)", background:"var(--surface)", color:"var(--text-dim)", border:"1px solid var(--border)" }}>
                            {a.total} pac.
                          </span>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:"var(--s-2)" }}>
                        <Bar value={a.emDia} max={a.total} color={C_SUCCESS}/>
                        <span style={{ font:`400 var(--t-xs) var(--font-sans)`, color:"var(--text-dim)", flexShrink:0, minWidth:32 }}>
                          {a.total > 0 ? Math.round(a.emDia / a.total * 100) : 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* Produção */}
      <SectionTitle>Produção — {periodLabel}</SectionTitle>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))", gap:"var(--s-3)" }}>
        <StatKPI label="Consultas agendadas"      value={consultTotal}  icon="C" color={C_INFO}/>
        <StatKPI label="Consultas realizadas"     value={consultDone}   icon="R" color={C_SUCCESS}/>
        <StatKPI label="Faltas / ausências"       value={consultAbsent} icon="F" color={consultAbsent > 0 ? C_WARNING : C_MUTED}/>
        <StatKPI label="Taxa de comparecimento"   value={taxaComp != null ? taxaComp + "%" : "—"} icon="%" color={taxaComp != null ? (taxaComp >= 80 ? C_SUCCESS : taxaComp >= 60 ? C_WARNING : C_DANGER) : C_ACCENT}/>
        <StatKPI label="Encaminhamentos emitidos" value={refPeriod.length} icon="E" color={C_MUTED}/>
        <StatKPI label="Dispensações farmácia"    value={dispensas}     icon="D" color={C_ACCENT}/>
      </div>

      {/* Farmácia + Encaminhamentos */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"var(--s-4)" }}>
        <div className="card card--noPad">
          <div className="card__header"><span className="card__title">Estoque — Situação Atual</span></div>
          <div className="card__body">
            {!stock?.length
              ? <p className="muted small">Sem itens cadastrados.</p>
              : (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"var(--s-2)", marginBottom:"var(--s-4)" }}>
                    {[
                      { label:"Total de itens", v:stock.length, color:C_ACCENT },
                      { label:"Estoque baixo",  v:lowStock,     color:C_WARNING },
                      { label:"Zerados",        v:estoqueCrit,  color:C_DANGER },
                    ].map(({ label, v, color }) => (
                      <div key={label} style={{ textAlign:"center", background:"var(--surface-2)", borderRadius:"var(--r-md)", padding:"var(--s-3) var(--s-2)", border:"1px solid var(--border)" }}>
                        <div style={{ font:`800 1.4rem var(--font-mono)`, color }}>{v}</div>
                        <div className="muted" style={{ font:`400 var(--t-xs) var(--font-sans)`, marginTop:"var(--s-1)" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {stock.filter(s => Number(s.qty || 0) <= Number(s.minQty || 0)).slice(0, 5).map(s => (
                    <div key={s.id || s.name} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"var(--s-1) 0", borderBottom:"1px solid var(--border-subtle)", font:`400 var(--t-sm) var(--font-sans)` }}>
                      <span style={{ color:"var(--text)", fontWeight:500 }}>{s.name}</span>
                      <span style={{ font:`700 var(--t-sm) var(--font-mono)`, color:Number(s.qty || 0) === 0 ? C_DANGER : C_WARNING }}>{s.qty || 0} un.</span>
                    </div>
                  ))}
                  {lowStock > 5 && <p className="muted" style={{ font:`400 var(--t-xs) var(--font-sans)`, marginTop:"var(--s-2)" }}>+{lowStock - 5} itens abaixo do mínimo</p>}
                </>
              )
            }
          </div>
        </div>

        <div className="card card--noPad">
          <div className="card__header">
            <span className="card__title">Encaminhamentos por Especialidade</span>
            <span className="muted small">{refPeriod.length} total</span>
          </div>
          <div className="card__body">
            {!refPeriod.length
              ? <p className="muted small">Nenhum encaminhamento no período.</p>
              : (() => {
                  const specMap = {};
                  refPeriod.forEach(r => { specMap[r.specialty || "Outros"] = (specMap[r.specialty || "Outros"] || 0) + 1; });
                  return Object.entries(specMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([s, c]) => (
                    <div key={s} style={{ display:"flex", alignItems:"center", gap:"var(--s-2)", padding:"var(--s-1) 0", borderBottom:"1px solid var(--border-subtle)" }}>
                      <span style={{ flex:1, font:`500 var(--t-sm) var(--font-sans)`, color:"var(--text)" }}>{s}</span>
                      <Bar value={c} max={refPeriod.length} color={C_MUTED}/>
                      <span style={{ font:`700 var(--t-sm) var(--font-mono)`, color:C_MUTED, minWidth:24, textAlign:"right" }}>{c}</span>
                    </div>
                  ));
                })()
            }
          </div>
        </div>
      </div>

      {/* Distribuição de pacientes */}
      <div className="card card--noPad">
        <div className="card__header"><span className="card__title">Distribuição de Pacientes por Categoria</span></div>
        <div className="card__body">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:"var(--s-2)" }}>
            {catEntries.map(([cat, count]) => {
              const label = templates.find(t => t.category === cat)?.label || cat;
              const pct = totalPacientes > 0 ? Math.round(count / totalPacientes * 100) : 0;
              const catCrit = patients.filter(p => p.careCategory === cat && protocolChip(protocolByPatient[p.id]).tone === "danger").length;
              return (
                <div key={cat} style={{ background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", padding:"var(--s-3)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"var(--s-2)" }}>
                    <span style={{ font:`600 var(--t-sm) var(--font-sans)`, color:"var(--text)" }}>{label}</span>
                    <span style={{ font:`800 var(--t-md) var(--font-mono)`, color:C_ACCENT }}>{count}</span>
                  </div>
                  <Bar value={count} max={totalPacientes} color={C_ACCENT}/>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:"var(--s-1)", font:`400 var(--t-xs) var(--font-sans)`, color:"var(--text-dim)" }}>
                    <span>{pct}% do total</span>
                    {catCrit > 0 && <span style={{ color:C_DANGER, fontWeight:700 }}>{catCrit} crítico{catCrit !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Auditoria recente */}
      <div className="card card--noPad">
        <div className="card__header">
          <span className="card__title">Trilha de Auditoria — Ações Recentes</span>
          <span className="muted small">{auditData?.length || 0} registros totais</span>
        </div>
        <div className="card__body">
          {!auditRecent.length
            ? <p className="muted small">Nenhuma ação registrada ainda.</p>
            : (
              <div style={{ display:"flex", flexDirection:"column", gap:"var(--s-2)" }}>
                {auditRecent.map((a, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:"var(--s-3)", padding:"var(--s-2) var(--s-3)", background:"var(--surface-2)", border:"1px solid var(--border)", borderRadius:"var(--r-md)", font:`400 var(--t-sm) var(--font-sans)` }}>
                    <span style={{ flexShrink:0, width:8, height:8, borderRadius:"50%", background:C_ACCENT, marginTop:4, display:"block" }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={{ fontWeight:600, color:"var(--text)" }}>{a.action || a.event || "Ação"}</span>
                      {a.user && (
                        <span className="muted"> por {typeof a.user === "object" ? (a.user.name || a.user.email || "usuário") : a.user}</span>
                      )}
                    </div>
                    <span style={{ flexShrink:0, color:"var(--text-dim)", font:`400 var(--t-xs) var(--font-mono)` }}>
                      {a.ts || a.createdAt ? new Date(a.ts || a.createdAt).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

    </PageLayout>
  );
}

export default GestorPage;
