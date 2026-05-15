import { useState, useMemo } from "react";
import { writeLS } from "../utils/storage";
import { isPharmacist, isAdmin, roleLabel } from "../utils/roles";
import { matchesPatientSearch } from "../utils/clinical";
import { initials, fmtDate } from "../utils/formatting";
import PageHero from "../components/layout/PageHero";

const INSUMOS_STOCK_KEY     = "saudeubs_insumos_stock_v1";
const INSUMOS_DISPENSA_KEY  = "saudeubs_insumos_dispensa_v1";
const INSUMOS_CONTINUO_KEY  = "saudeubs_insumos_continuo_v1";

// Catálogo de insumos com quantidades máximas do PDF (Osasco DAF)
const CATALOGO_INSUMOS = [
  // ── Curativos e bandagens ─────────────────────────────────────
  { id:"i01",  nome:"Atadura de Crepe 6 cm",           categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i02",  nome:"Atadura de Crepe 10 cm",          categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i03",  nome:"Atadura de Crepe 15 cm",          categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i04",  nome:"Atadura de Crepe 20 cm",          categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i05",  nome:"Atadura de Rayon",                categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i06",  nome:"Cadarço",                         categoria:"Curativo",         unidade:"rolo",     qtdMax:1   },
  { id:"i07",  nome:"Clorexidina Degermante",          categoria:"Antisséptico",     unidade:"frasco",   qtdMax:3   },
  { id:"i08",  nome:"Compressa Gaze",                  categoria:"Curativo",         unidade:"unidade",  qtdMax:180 },
  { id:"i09",  nome:"Esparadrapo Impermeável P",       categoria:"Curativo",         unidade:"rolo",     qtdMax:4   },
  { id:"i10",  nome:"Esparadrapo Impermeável G",       categoria:"Curativo",         unidade:"rolo",     qtdMax:2   },
  { id:"i11",  nome:"Micropore Pequeno",               categoria:"Curativo",         unidade:"rolo",     qtdMax:4   },
  { id:"i12",  nome:"Micropore Grande",                categoria:"Curativo",         unidade:"rolo",     qtdMax:2   },
  { id:"i13",  nome:"Fita Adesiva Hospitalar",         categoria:"Curativo",         unidade:"rolo",     qtdMax:2   },
  // ── Nutrição enteral ─────────────────────────────────────────
  { id:"i14",  nome:"Equipo p/ Nutrição Enteral",      categoria:"Nutrição Enteral", unidade:"unidade",  qtdMax:60  },
  { id:"i15",  nome:"Frasco p/ Nutrição Enteral",      categoria:"Nutrição Enteral", unidade:"unidade",  qtdMax:60  },
  // ── Luvas e seringas ─────────────────────────────────────────
  { id:"i16",  nome:"Luva P (caixa 100 un)",           categoria:"EPI",              unidade:"caixa",    qtdMax:2   },
  { id:"i17",  nome:"Luva M (caixa 100 un)",           categoria:"EPI",              unidade:"caixa",    qtdMax:2   },
  { id:"i18",  nome:"Luva G (caixa 100 un)",           categoria:"EPI",              unidade:"caixa",    qtdMax:2   },
  { id:"i19",  nome:"Seringa 20 mL",                   categoria:"Seringa",          unidade:"unidade",  qtdMax:60  },
  { id:"i20",  nome:"Seringa 60 mL",                   categoria:"Seringa",          unidade:"unidade",  qtdMax:30  },
  // ── Sondas ───────────────────────────────────────────────────
  { id:"i21",  nome:"Sonda Aspiração Traqueal c/ Válvula nº 08", categoria:"Sonda", unidade:"unidade",  qtdMax:180 },
  { id:"i22",  nome:"Sonda Aspiração Traqueal c/ Válvula nº 10", categoria:"Sonda", unidade:"unidade",  qtdMax:180 },
  { id:"i23",  nome:"Sonda Aspiração Traqueal c/ Válvula nº 12", categoria:"Sonda", unidade:"unidade",  qtdMax:180 },
  { id:"i24",  nome:"Sonda Uretral nº 04",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i25",  nome:"Sonda Uretral nº 06",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i26",  nome:"Sonda Uretral nº 08",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i27",  nome:"Sonda Uretral nº 10",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i28",  nome:"Sonda Uretral nº 12",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i29",  nome:"Sonda Uretral nº 14",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i30",  nome:"Sonda Uretral nº 16",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  // ── Uso tópico ───────────────────────────────────────────────
  { id:"i31",  nome:"Vaselina",                        categoria:"Tópico",           unidade:"frasco",   qtdMax:3   },
  { id:"i32",  nome:"Cloreto de Sódio 0,9% p/ Curativo 500 mL", categoria:"Soro/Curativo", unidade:"frasco", qtdMax:10 },
  { id:"i33",  nome:"Dersani (Ácidos Graxos Essenciais)", categoria:"Tópico",        unidade:"frasco",   qtdMax:3   },
  { id:"i34",  nome:"Colagenase + Cloranfenicol",      categoria:"Tópico",           unidade:"bisnaga",  qtdMax:3   },
  { id:"i35",  nome:"Lidocaína",                       categoria:"Tópico",           unidade:"bisnaga",  qtdMax:3   },
  { id:"i36",  nome:"Alginato",                        categoria:"Tópico",           unidade:"bisnaga",  qtdMax:1   },
  { id:"i37",  nome:"Sulfadiazina de Prata",           categoria:"Tópico",           unidade:"bisnaga",  qtdMax:3   },
  // ── Diabetes / Hemoanálise ───────────────────────────────────
  { id:"i38",  nome:"Tiras Reagentes Hemoanálise (cx 50 tiras)", categoria:"Diabetes", unidade:"caixa", qtdMax:100, obs:"Exclusivo usuários de insulina ou gestante diabética. Máx 100/mês. Acima necessita justificativa médica." },
  { id:"i39",  nome:"Micro Lancetas (cx 100 unidades)", categoria:"Diabetes",        unidade:"caixa",    qtdMax:2,  obs:"Exclusivo usuários de insulina ou gestante diabética." },
  { id:"i40",  nome:"Aparelho para Hemoanálise (Glicosímetro)", categoria:"Diabetes", unidade:"aparelho", qtdMax:1, obs:"Retirada única para usuário de insulina ou gestante diabética." },
  { id:"i41",  nome:"Agulha para Caneta de Insulina",  categoria:"Diabetes",         unidade:"unidade",  qtdMax:30, obs:"1 agulha/dia — 30 agulhas/mês por tipo de insulina." },
  { id:"i42",  nome:"Seringa 1 mL para Insulina",      categoria:"Diabetes",         unidade:"unidade",  qtdMax:60, obs:"Liberado para aplicação de insulina frasco ou somatropina. 1 seringa por aplicação." },
];

const INSUMO_CATEGORIAS = ["Todas",...[...new Set(CATALOGO_INSUMOS.map(i=>i.categoria))]];

function readInsumoStock() {
  try {
    const s = localStorage.getItem(INSUMOS_STOCK_KEY);
    if (s) return JSON.parse(s);
    return CATALOGO_INSUMOS.map(i=>({ id:i.id, qty:0 }));
  } catch { return CATALOGO_INSUMOS.map(i=>({ id:i.id, qty:0 })); }
}
function saveInsumoStock(s) { writeLS(INSUMOS_STOCK_KEY, s); }
function readInsumoDispensas() { try { return JSON.parse(localStorage.getItem(INSUMOS_DISPENSA_KEY)||"[]"); } catch { return []; } }
function saveInsumoDispensas(d) { writeLS(INSUMOS_DISPENSA_KEY, d); }
function readInsumosContinuos() { try { return JSON.parse(localStorage.getItem(INSUMOS_CONTINUO_KEY)||"[]"); } catch { return []; } }
function saveInsumosContinuos(c) { writeLS(INSUMOS_CONTINUO_KEY, c); }

function InsumoPage({ patients, users, user }) {
  const isNurse = ["nurse_manager","nursing_tech"].includes(String(user?.role||""));
  const isPharma = isPharmacist(user) || isAdmin(user);
  const canDispense = isNurse || isAdmin(user);
  const canViewAll = isPharma || isAdmin(user);

  const [insumoTab, setInsumoTab] = useState(canDispense ? "dispensar" : "estoque");
  const [stock, setStock]         = useState(readInsumoStock);
  const [dispensas, setDispensas] = useState(readInsumoDispensas);
  const [continuos, setContinuos] = useState(readInsumosContinuos);

  // ── Aba Dispensar ──
  const [patSearch, setPatSearch]     = useState("");
  const [patSelected, setPatSelected] = useState(null);
  const [patResults, setPatResults]   = useState([]);
  const [isContinuo, setIsContinuo]   = useState(false);
  const [catFilter, setCatFilter]     = useState("Todas");
  const [itens, setItens]             = useState({}); // { id: qtd }
  const [obsDispensa, setObsDispensa] = useState("");
  const [dispErr, setDispErr]         = useState("");
  const [dispOk, setDispOk]           = useState(false);

  // ── Aba Estoque ──
  const [stockCat, setStockCat]   = useState("Todas");
  const [stockSearch, setStockSearch] = useState("");
  const [editStockItem, setEditStockItem] = useState(null);
  const [editQty, setEditQty]     = useState("");

  // ── Aba Log ──
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all"); // all | continuo | normal

  // Busca paciente
  useMemo(()=>{
    const q = patSearch.trim();
    if (q.length < 2) { setPatResults([]); return; }
    setPatResults(patients.filter(p => matchesPatientSearch(p, q)).slice(0,8));
  },[patSearch, patients]);

  function selectPat(p) {
    setPatSelected(p); setPatSearch(p.name); setPatResults([]);
    setItens({}); setDispErr(""); setDispOk(false);
    // Pré-carrega se for contínuo
    const cont = continuos.find(c=>c.patientId===p.id&&c.ativo);
    if (cont) {
      setIsContinuo(true);
      setItens(Object.fromEntries(cont.itens.map(i=>[i.id, i.qtd])));
    } else {
      setIsContinuo(false);
    }
  }

  function setItem(id, val) {
    const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
    const max = cat?.qtdMax || 999;
    const n = Math.max(0, Math.min(max, Number(val)||0));
    setItens(prev=>({ ...prev, [id]: n || undefined }));
    setDispErr(""); setDispOk(false);
  }

  // Verifica se paciente é contínuo e valida contra quantidades definidas
  function validarDispensa() {
    const cont = continuos.find(c=>c.patientId===patSelected?.id&&c.ativo);
    const selecionados = Object.entries(itens).filter(([,v])=>v>0);
    if (!selecionados.length) return { ok:false, err:"Selecione ao menos um insumo com quantidade." };
    if (cont) {
      for (const [id, qtd] of selecionados) {
        const limite = cont.itens.find(i=>i.id===id);
        if (!limite) continue; // Item extra permitido
        if (qtd > limite.qtd) {
          const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
          return { ok:false, err:`"${cat?.nome}" excede o limite definido para este paciente contínuo (máx: ${limite.qtd} ${cat?.unidade}). Para aumentar, abra nova dispensação.` };
        }
      }
    }
    // Valida contra qtdMax do catálogo
    for (const [id, qtd] of selecionados) {
      const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
      if (cat && qtd > cat.qtdMax) {
        return { ok:false, err:`"${cat.nome}" excede a quantidade máxima permitida (${cat.qtdMax} ${cat.unidade}).` };
      }
    }
    return { ok:true };
  }

  function confirmarDispensa() {
    if (!patSelected) { setDispErr("Selecione um paciente."); return; }
    const v = validarDispensa();
    if (!v.ok) { setDispErr(v.err); return; }

    const selecionados = Object.entries(itens).filter(([,v])=>v>0).map(([id,qtd])=>({ id, qtd: Number(qtd) }));
    const agora = new Date().toISOString();
    const dispensa = {
      id: "d" + Date.now(),
      patientId: patSelected.id,
      patientName: patSelected.name,
      profissional: user?.name || "Enfermagem",
      profRole: roleLabel(user?.role),
      continuo: isContinuo,
      itens: selecionados,
      obs: obsDispensa,
      ts: agora,
      date: agora.slice(0,10),
    };

    // Debita do estoque
    const newStock = stock.map(s => {
      const item = selecionados.find(i=>i.id===s.id);
      if (!item) return s;
      return { ...s, qty: Math.max(0, s.qty - item.qtd) };
    });
    setStock(newStock); saveInsumoStock(newStock);

    // Salva dispensação
    const newDispensas = [dispensa, ...dispensas];
    setDispensas(newDispensas); saveInsumoDispensas(newDispensas);

    // Se marcado como contínuo, registra ou atualiza
    if (isContinuo) {
      const existente = continuos.find(c=>c.patientId===patSelected.id&&c.ativo);
      if (!existente) {
        const novoCont = {
          id: "c" + Date.now(),
          patientId: patSelected.id,
          patientName: patSelected.name,
          itens: selecionados,
          profissional: user?.name,
          dtInicio: agora.slice(0,10),
          dtFim: null,
          ativo: true,
          obs: obsDispensa,
        };
        const newC = [novoCont, ...continuos];
        setContinuos(newC); saveInsumosContinuos(newC);
      }
      // Se já existe, mantém (a qtd do contínuo não muda, só registra a saída)
    }

    setDispOk(true); setDispErr("");
    setItens({}); setObsDispensa("");
    setTimeout(()=>{ setDispOk(false); setPatSelected(null); setPatSearch(""); setIsContinuo(false); }, 2500);
  }

  function encerrarContinuo(id) {
    if (!confirm("Encerrar o acompanhamento contínuo deste paciente? Ele não terá mais retirada automática registrada.")) return;
    const newC = continuos.map(c=>c.id===id?{...c,ativo:false,dtFim:new Date().toISOString().slice(0,10)}:c);
    setContinuos(newC); saveInsumosContinuos(newC);
  }

  const filteredStock = CATALOGO_INSUMOS.filter(i=>{
    if (stockCat!=="Todas" && i.categoria!==stockCat) return false;
    if (stockSearch && !i.nome.toLowerCase().includes(stockSearch.toLowerCase())) return false;
    return true;
  });

  const filteredLog = dispensas.filter(d=>{
    if (logFilter==="continuo" && !d.continuo) return false;
    if (logFilter==="normal" && d.continuo) return false;
    if (logSearch && !d.patientName?.toLowerCase().includes(logSearch.toLowerCase()) && !d.profissional?.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const continuosAtivos = continuos.filter(c=>c.ativo);
  const totalSaidasHoje = dispensas.filter(d=>d.date===new Date().toISOString().slice(0,10)).length;

  const TABS = [
    canDispense && ["dispensar","💊 Nova Dispensação"],
    ["estoque","📦 Estoque de Insumos"],
    (canDispense||canViewAll) && ["log","🗂️ Histórico de Saídas"],
    ["continuos","🔄 Pacientes Contínuos"],
  ].filter(Boolean);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>

      {/* Header */}
      <PageHero
        badge="Gestão de Insumos"
        title="Dispensação de Insumos ao Paciente"
        subtitle="Controle de saída, estoque e pacientes contínuos — baseado no formulário DAF/Osasco."
        style={{margin:"1.5rem 1.5rem .75rem",flexShrink:0}}
        actions={
          <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:".75rem",fontWeight:700,color:"var(--teal-700)"}}>{user?.name}</div>
              <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{roleLabel(user?.role)}</div>
            </div>
          </div>
        }
      />

      {/* KPIs */}
      <div style={{display:"flex",gap:".65rem",padding:"0 1.5rem .75rem",flexWrap:"wrap",flexShrink:0}}>
        {[
          { label:"Pacientes contínuos ativos", value:continuosAtivos.length, icon:"🔄", color:"var(--teal-600)" },
          { label:"Dispensações hoje",           value:totalSaidasHoje,        icon:"📋", color:"var(--indigo-500)" },
          { label:"Total de dispensações",       value:dispensas.length,       icon:"📦", color:"var(--cyan-600)" },
          { label:"Itens sem estoque",           value:stock.filter(s=>s.qty===0).length, icon:"⚠️", color:"var(--rose-700)", warn:true },
        ].map(k=>(
          <div key={k.label} className="card" style={{flex:"1 1 140px",padding:".75rem 1rem",minWidth:120,background:k.warn&&k.value>0?"var(--rose-50)":"var(--surface)",border:`1px solid ${k.warn&&k.value>0?"var(--rose-200)":"var(--border)"}`}}>
            <div style={{fontSize:"1.2rem"}}>{k.icon}</div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color:k.color,lineHeight:1.1,marginTop:".25rem"}}>{k.value}</div>
            <div style={{fontSize:".7rem",color:"var(--text-3)",marginTop:".15rem"}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",padding:"0 1.5rem",borderBottom:"1px solid var(--border)",flexShrink:0,overflowX:"auto"}}>
        {TABS.map(([id,label])=>(
          <button key={id} onClick={()=>setInsumoTab(id)}
            style={{padding:".55rem 1rem",fontSize:".8rem",fontWeight:600,border:"none",background:"transparent",
              cursor:"pointer",color:insumoTab===id?"var(--teal-600)":"var(--text-3)",whiteSpace:"nowrap",
              borderBottom:insumoTab===id?"2px solid var(--teal-500)":"2px solid transparent"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"1.25rem 1.5rem"}}>

        {/* ── ABA: NOVA DISPENSAÇÃO ── */}
        {insumoTab==="dispensar"&&canDispense&&(
          <div style={{display:"flex",gap:"1.25rem",alignItems:"flex-start",flexWrap:"wrap"}}>

            {/* Coluna esquerda: seleção de paciente */}
            <div style={{flex:"0 0 300px",minWidth:260}}>
              <div className="card" style={{padding:"1rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",marginBottom:".75rem"}}>📋 Paciente</div>
                <div style={{position:"relative"}}>
                  <div style={{position:"absolute",left:".65rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",pointerEvents:"none"}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </div>
                  <input value={patSearch}
                    onChange={e=>{ setPatSearch(e.target.value); if(patSelected&&e.target.value!==patSelected.name){setPatSelected(null);setItens({});setIsContinuo(false);} }}
                    placeholder="Buscar por nome ou CPF..."
                    style={{paddingLeft:"1.9rem",width:"100%",boxSizing:"border-box",border:patSelected?"2px solid var(--teal-500)":"1px solid var(--border)",borderRadius:"var(--r-md)"}}/>
                  {patResults.length>0&&!patSelected&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:40,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"0 0 var(--r-md) var(--r-md)",boxShadow:"0 4px 12px rgba(0,0,0,.08)",maxHeight:200,overflowY:"auto"}}>
                      {patResults.map(p=>{
                        const cont = continuos.find(c=>c.patientId===p.id&&c.ativo);
                        return (
                          <button key={p.id} type="button" onClick={()=>selectPat(p)}
                            style={{display:"flex",alignItems:"center",gap:".6rem",width:"100%",padding:".5rem .8rem",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:cont?"var(--green-100)":"var(--teal-100)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".7rem",fontWeight:700,color:cont?"var(--green-700)":"var(--teal-700)",flexShrink:0}}>{initials(p.name)}</div>
                            <div style={{minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:".83rem",color:"var(--ink)"}}>{p.name}</div>
                              <div style={{fontSize:".7rem",color:"var(--text-3)"}}>{p.cpf||""}{cont?" · 🔄 Contínuo":""}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {patSelected&&(
                  <div style={{marginTop:".75rem",padding:".65rem .8rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)"}}>
                    <div style={{fontWeight:700,fontSize:".85rem",color:"var(--teal-800)"}}>{patSelected.name}</div>
                    <div style={{fontSize:".72rem",color:"var(--teal-600)",marginTop:".2rem"}}>
                      {patSelected.birthDate&&`Nasc.: ${fmtDate(patSelected.birthDate)}`}
                      {patSelected.cpf&&` · CPF: ${patSelected.cpf}`}
                    </div>
                    {continuos.find(c=>c.patientId===patSelected.id&&c.ativo)&&(
                      <div style={{marginTop:".4rem",fontSize:".72rem",fontWeight:700,color:"var(--green-700)",display:"flex",alignItems:"center",gap:".3rem"}}>
                        🔄 Paciente contínuo ativo
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Marcar como contínuo */}
              {patSelected&&(
                <div className="card" style={{padding:"1rem",marginBottom:"1rem"}}>
                  <label style={{display:"flex",alignItems:"flex-start",gap:".65rem",cursor:"pointer"}}>
                    <input type="checkbox" checked={isContinuo} onChange={e=>setIsContinuo(e.target.checked)}
                      style={{width:16,height:16,marginTop:2,cursor:"pointer",accentColor:"var(--teal-600)"}}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>🔄 Paciente contínuo</div>
                      <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".2rem",lineHeight:1.5}}>
                        Marca este paciente para retirada mensal recorrente. A quantidade definida agora será o limite máximo nas próximas retiradas. Para encerrar, use a aba "Pacientes Contínuos".
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {patSelected&&(
                <div className="card" style={{padding:"1rem"}}>
                  <div style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",marginBottom:".5rem"}}>Observações</div>
                  <textarea value={obsDispensa} onChange={e=>setObsDispensa(e.target.value)}
                    placeholder="Motivo, diagnóstico, orientações ao paciente..."
                    style={{width:"100%",boxSizing:"border-box",minHeight:70,resize:"vertical",fontSize:".8rem"}}/>
                </div>
              )}
            </div>

            {/* Coluna direita: seleção de insumos */}
            <div style={{flex:1,minWidth:0}}>
              {/* Aviso máximos */}
              <div style={{marginBottom:".85rem",padding:".6rem .9rem",background:"var(--blue-50)",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",fontSize:".75rem",color:"var(--blue-700)",display:"flex",gap:".4rem"}}>
                <span style={{flexShrink:0}}>ℹ️</span>
                <span>As quantidades máximas por insumo seguem o formulário DAF/Secretaria de Saúde de Osasco. Nenhum campo pode ultrapassar o limite definido.</span>
              </div>

              {/* Filtro por categoria */}
              <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",marginBottom:".85rem"}}>
                {INSUMO_CATEGORIAS.map(c=>(
                  <button key={c} type="button" onClick={()=>setCatFilter(c)}
                    style={{fontSize:".72rem",padding:".28rem .65rem",borderRadius:4,border:`1px solid ${catFilter===c?"var(--teal-500)":"var(--border)"}`,background:catFilter===c?"var(--teal-50)":"var(--surface)",color:catFilter===c?"var(--teal-700)":"var(--text-2)",cursor:"pointer",fontWeight:catFilter===c?700:500}}>
                    {c}
                  </button>
                ))}
              </div>

              {/* Grid de insumos */}
              <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {CATALOGO_INSUMOS.filter(i=>catFilter==="Todas"||i.categoria===catFilter).map(insumo=>{
                  const qtd = itens[insumo.id] || 0;
                  const estq = stock.find(s=>s.id===insumo.id)?.qty ?? 0;
                  const semEstoque = estq === 0;
                  const contItem = continuos.find(c=>c.patientId===patSelected?.id&&c.ativo)?.itens?.find(i=>i.id===insumo.id);
                  const limite = contItem ? contItem.qtd : insumo.qtdMax;
                  return (
                    <div key={insumo.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".55rem .85rem",background:qtd>0?"var(--teal-50)":"var(--surface)",border:`1px solid ${qtd>0?"var(--teal-300)":semEstoque?"var(--rose-200)":"var(--border)"}`,borderRadius:"var(--r-md)",opacity:semEstoque?0.6:1}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:".82rem",color:"var(--ink)"}}>{insumo.nome}</div>
                        <div style={{display:"flex",gap:".5rem",marginTop:".1rem",flexWrap:"wrap"}}>
                          <span style={{fontSize:".68rem",color:"var(--text-3)"}}>{insumo.categoria}</span>
                          <span style={{fontSize:".68rem",color:"var(--text-3)"}}>Máx: {limite} {insumo.unidade}</span>
                          <span style={{fontSize:".68rem",fontWeight:600,color:semEstoque?"var(--rose-700)":estq<=5?"var(--amber-700)":"var(--green-700)"}}>
                            Estoque: {estq} {insumo.unidade}
                          </span>
                        </div>
                        {insumo.obs&&<div style={{fontSize:".68rem",color:"var(--blue-700)",marginTop:".15rem"}}>ℹ️ {insumo.obs}</div>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".3rem",flexShrink:0}}>
                        <button type="button" onClick={()=>setItem(insumo.id, qtd-1)} disabled={!patSelected||qtd<=0}
                          style={{width:26,height:26,borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface-2)",cursor:"pointer",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-1)"}}>−</button>
                        <input type="number" min={0} max={limite} value={qtd||""}
                          onChange={e=>setItem(insumo.id, e.target.value)}
                          disabled={!patSelected||semEstoque}
                          placeholder="0"
                          style={{width:52,textAlign:"center",fontWeight:700,fontSize:".85rem",padding:".2rem .3rem",border:`1px solid ${qtd>0?"var(--teal-400)":"var(--border)"}`,borderRadius:"var(--r-md)"}}/>
                        <button type="button" onClick={()=>setItem(insumo.id, qtd+1)} disabled={!patSelected||qtd>=limite||semEstoque}
                          style={{width:26,height:26,borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface-2)",cursor:"pointer",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-1)"}}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Resumo e confirmar */}
              {Object.values(itens).some(v=>v>0)&&(
                <div style={{marginTop:"1rem",padding:".85rem 1rem",background:"var(--surface)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
                  <div style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)",marginBottom:".5rem"}}>📋 Resumo da dispensação</div>
                  {Object.entries(itens).filter(([,v])=>v>0).map(([id,qtd])=>{
                    const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
                    return <div key={id} style={{display:"flex",justifyContent:"space-between",fontSize:".78rem",color:"var(--text-1)",marginBottom:".2rem"}}>
                      <span>{cat?.nome}</span><span style={{fontWeight:700}}>{qtd} {cat?.unidade}</span>
                    </div>;
                  })}
                  {dispErr&&<div style={{marginTop:".65rem",padding:".45rem .65rem",background:"var(--rose-50)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",fontSize:".76rem",color:"var(--rose-700)"}}>{dispErr}</div>}
                  {dispOk&&<div style={{marginTop:".65rem",padding:".45rem .65rem",background:"var(--green-50)",border:"1px solid #bbf7d0",borderRadius:"var(--r-md)",fontSize:".76rem",color:"var(--green-700)",fontWeight:700}}>✓ Dispensação registrada com sucesso!</div>}
                  <button type="button" onClick={confirmarDispensa} disabled={!patSelected||dispOk}
                    style={{marginTop:".75rem",width:"100%",padding:".55rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,fontSize:".85rem"}}>
                    ✓ Confirmar dispensação{isContinuo?" (contínuo)":""}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA: ESTOQUE ── */}
        {insumoTab==="estoque"&&(
          <div>
            <div style={{display:"flex",gap:".65rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <input value={stockSearch} onChange={e=>setStockSearch(e.target.value)}
                placeholder="Buscar insumo..." style={{flex:"1 1 200px",maxWidth:320}}/>
              <select value={stockCat} onChange={e=>setStockCat(e.target.value)} style={{flex:"0 0 auto"}}>
                {INSUMO_CATEGORIAS.map(c=><option key={c}>{c}</option>)}
              </select>
              {(isPharma)&&(
                <button type="button" onClick={()=>setEditStockItem("new")}
                  style={{fontSize:".78rem",padding:".4rem .85rem",display:"flex",alignItems:"center",gap:".35rem"}}>
                  + Entrada de estoque
                </button>
              )}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Insumo","Categoria","Unidade","Qtd Máx","Estoque atual","Situação",""].map((h,i)=>(
                      <th key={i} style={{padding:".5rem .85rem",textAlign:"left",fontWeight:700,color:"var(--text-3)",fontSize:".72rem",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map(insumo=>{
                    const st = stock.find(s=>s.id===insumo.id)?.qty ?? 0;
                    const pct = insumo.qtdMax > 0 ? Math.round(st/insumo.qtdMax*100) : 0;
                    const sit = st===0?"Sem estoque":pct<=20?"Estoque baixo":pct<=60?"Regular":"Adequado";
                    const sitColor = st===0?"var(--rose-700)":pct<=20?"var(--amber-700)":pct<=60?"var(--blue-700)":"var(--green-700)";
                    const sitBg = st===0?"var(--rose-50)":pct<=20?"var(--amber-50)":pct<=60?"var(--blue-50)":"var(--green-50)";
                    return (
                      <tr key={insumo.id} style={{borderBottom:"1px solid var(--border)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                        <td style={{padding:".55rem .85rem",fontWeight:600,color:"var(--ink)"}}>
                          {insumo.nome}
                          {insumo.obs&&<div style={{fontSize:".66rem",color:"var(--blue-700)",marginTop:".1rem"}}>ℹ️ {insumo.obs}</div>}
                        </td>
                        <td style={{padding:".55rem .85rem",color:"var(--text-2)"}}>{insumo.categoria}</td>
                        <td style={{padding:".55rem .85rem",color:"var(--text-2)"}}>{insumo.unidade}</td>
                        <td style={{padding:".55rem .85rem",fontFamily:"IBM Plex Mono",fontSize:".78rem"}}>{insumo.qtdMax}</td>
                        <td style={{padding:".55rem .85rem"}}>
                          <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                            <span style={{fontFamily:"IBM Plex Mono",fontWeight:700,fontSize:".85rem",color:sitColor}}>{st}</span>
                            <div style={{flex:1,height:5,background:"var(--slate-100)",borderRadius:99,minWidth:60,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:sitColor,borderRadius:99}}/>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:".55rem .85rem"}}>
                          <span style={{fontSize:".7rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:sitBg,color:sitColor}}>{sit}</span>
                        </td>
                        <td style={{padding:".55rem .85rem"}}>
                          {(isPharma)&&(
                            <button type="button" onClick={()=>{ setEditStockItem(insumo); setEditQty(""); }}
                              style={{fontSize:".72rem",padding:".2rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",color:"var(--text-1)"}}>
                              + Entrada
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA: LOG DE SAÍDAS ── */}
        {insumoTab==="log"&&(canDispense||canViewAll)&&(
          <div>
            <div style={{display:"flex",gap:".65rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <input value={logSearch} onChange={e=>setLogSearch(e.target.value)} placeholder="Buscar por paciente ou profissional..." style={{flex:"1 1 220px",maxWidth:360}}/>
              <div style={{display:"flex",gap:".35rem"}}>
                {[["all","Todas"],["continuo","🔄 Contínuo"],["normal","Normal"]].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>setLogFilter(v)}
                    style={{fontSize:".73rem",padding:".3rem .65rem",borderRadius:4,border:`1px solid ${logFilter===v?"var(--teal-500)":"var(--border)"}`,background:logFilter===v?"var(--teal-50)":"var(--surface)",color:logFilter===v?"var(--teal-700)":"var(--text-2)",cursor:"pointer",fontWeight:logFilter===v?700:500}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {!filteredLog.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>📭 Nenhuma dispensação registrada.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                {filteredLog.map(d=>(
                  <div key={d.id} style={{background:"var(--surface)",border:`1px solid ${d.continuo?"var(--teal-200)":"var(--border)"}`,borderLeft:`4px solid ${d.continuo?"var(--teal-500)":"var(--border)"}`,borderRadius:"var(--r-md)",padding:".75rem 1rem"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem",flexWrap:"wrap"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)",display:"flex",alignItems:"center",gap:".5rem"}}>
                          {d.patientName}
                          {d.continuo&&<span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"var(--green-100)",color:"var(--green-700)",border:"1px solid #bbf7d0"}}>🔄 Contínuo</span>}
                        </div>
                        <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>
                          {d.profissional} ({d.profRole}) · {new Date(d.ts).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                        </div>
                      </div>
                      <span style={{fontSize:".7rem",fontFamily:"IBM Plex Mono",color:"var(--text-3)"}}>{d.date}</span>
                    </div>
                    <div style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".5rem"}}>
                      {d.itens.map(item=>{
                        const cat = CATALOGO_INSUMOS.find(i=>i.id===item.id);
                        return <span key={item.id} style={{fontSize:".72rem",padding:".15rem .45rem",borderRadius:999,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)",fontWeight:600}}>
                          {cat?.nome||item.id}: {item.qtd} {cat?.unidade||""}
                        </span>;
                      })}
                    </div>
                    {d.obs&&<div style={{marginTop:".4rem",fontSize:".73rem",color:"var(--text-2)",fontStyle:"italic"}}>Obs: {d.obs}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA: PACIENTES CONTÍNUOS ── */}
        {insumoTab==="continuos"&&(
          <div>
            <div style={{marginBottom:"1rem",padding:".65rem .9rem",background:"var(--blue-50)",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",fontSize:".76rem",color:"var(--blue-700)",display:"flex",gap:".4rem"}}>
              <span>🔄</span>
              <span>Pacientes contínuos têm lesão ativa e retornam mensalmente para retirada de insumos. A quantidade máxima foi definida na primeira dispensação e não pode ser ultrapassada. Para encerrar, clique em "Encerrar".</span>
            </div>
            {!continuosAtivos.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"2rem",marginBottom:".5rem"}}>🔄</div>
                <div style={{fontWeight:600}}>Nenhum paciente contínuo ativo</div>
                <div style={{fontSize:".8rem",marginTop:".5rem"}}>Ao dispensar insumos, marque "Paciente contínuo" para registrá-lo aqui.</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                {continuosAtivos.map(c=>{
                  const retiradas = dispensas.filter(d=>d.patientId===c.patientId&&d.continuo).length;
                  const ultima = dispensas.filter(d=>d.patientId===c.patientId).sort((a,b)=>b.ts.localeCompare(a.ts))[0];
                  return (
                    <div key={c.id} style={{background:"var(--surface)",border:"1px solid var(--teal-200)",borderLeft:"4px solid var(--teal-500)",borderRadius:"var(--r-md)",padding:"1rem 1.1rem"}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".75rem",flexWrap:"wrap"}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:".9rem",color:"var(--ink)",display:"flex",alignItems:"center",gap:".5rem"}}>
                            {c.patientName}
                            <span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"var(--green-100)",color:"var(--green-700)",border:"1px solid #bbf7d0"}}>🔄 Ativo</span>
                          </div>
                          <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".2rem"}}>
                            Desde {fmtDate(c.dtInicio)} · {retiradas} retirada(s) registrada(s) · Por: {c.profissional}
                          </div>
                          {ultima&&<div style={{fontSize:".72rem",color:"var(--text-3)"}}>Última retirada: {fmtDate(ultima.date)}</div>}
                        </div>
                        {canDispense&&(
                          <button type="button" onClick={()=>encerrarContinuo(c.id)}
                            style={{fontSize:".73rem",padding:".3rem .7rem",background:"var(--rose-50)",color:"var(--rose-700)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,flexShrink:0}}>
                            Encerrar
                          </button>
                        )}
                      </div>
                      <div style={{marginTop:".75rem"}}>
                        <div style={{fontSize:".7rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Insumos desta prescrição (limites)</div>
                        <div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
                          {c.itens.map(item=>{
                            const cat = CATALOGO_INSUMOS.find(i=>i.id===item.id);
                            return <span key={item.id} style={{fontSize:".73rem",padding:".2rem .5rem",borderRadius:999,background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)",fontWeight:600}}>
                              {cat?.nome||item.id}: até {item.qtd} {cat?.unidade}
                            </span>;
                          })}
                        </div>
                      </div>
                      {c.obs&&<div style={{marginTop:".5rem",fontSize:".73rem",color:"var(--text-2)",fontStyle:"italic"}}>Obs.: {c.obs}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Contínuos encerrados */}
            {continuos.filter(c=>!c.ativo).length>0&&(
              <div style={{marginTop:"1.5rem"}}>
                <div style={{fontWeight:700,fontSize:".78rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".6rem"}}>Encerrados</div>
                <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                  {continuos.filter(c=>!c.ativo).map(c=>(
                    <div key={c.id} style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderLeft:"4px solid var(--border)",borderRadius:"var(--r-md)",padding:".65rem .9rem",opacity:.75}}>
                      <div style={{fontWeight:600,fontSize:".82rem",color:"var(--text-2)"}}>{c.patientName}</div>
                      <div style={{fontSize:".7rem",color:"var(--text-3)"}}>
                        {fmtDate(c.dtInicio)} → {fmtDate(c.dtFim)} · {dispensas.filter(d=>d.patientId===c.patientId&&d.continuo).length} retirada(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal entrada de estoque */}
      {editStockItem&&(
        <div className="modal-backdrop" onClick={()=>setEditStockItem(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 1rem"}}>{editStockItem==="new"?"Nova entrada de estoque":"+ Entrada: "+editStockItem.nome}</h3>
            {editStockItem==="new" ? (
              <div style={{color:"var(--text-3)",fontSize:".85rem"}}>Para entrada em item específico, clique em "+ Entrada" na linha do insumo na tabela.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
                <div style={{fontSize:".82rem",color:"var(--text-2)"}}>Insumo: <strong>{editStockItem.nome}</strong></div>
                  <div style={{fontSize:".82rem",color:"var(--text-2)"}}>Estoque atual: <strong>{stock.find(s=>s.id===editStockItem.id)?.qty ?? 0} {editStockItem.unidade}</strong></div>
                <label style={{display:"flex",flexDirection:"column",gap:".3rem",fontSize:".8rem",fontWeight:600}}>
                  Quantidade a adicionar *
                  <input type="number" min="1" value={editQty} onChange={e=>setEditQty(e.target.value)} placeholder="Ex: 50" autoFocus/>
                </label>
                <div style={{display:"flex",gap:".5rem"}}>
                  <button type="button" onClick={()=>setEditStockItem(null)} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
                  <button type="button" onClick={()=>{
                    const n = Number(editQty); if(!n||n<=0) return;
                    const newStock = stock.map(s=>s.id===editStockItem.id?{...s,qty:s.qty+n}:s);
                    // Se item ainda não existe no array de stock, adiciona
                    if (!stock.find(s=>s.id===editStockItem.id)) newStock.push({id:editStockItem.id,qty:n});
                    setStock(newStock); saveInsumoStock(newStock);
                    setEditStockItem(null);
                  }} style={{flex:2}}>✓ Confirmar entrada</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InsumoPage;
