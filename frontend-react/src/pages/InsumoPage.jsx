import { useState, useMemo } from "react";
import { writeLS } from "../utils/storage";
import { isPharmacist, isAdmin, roleLabel } from "../utils/roles";
import { matchesPatientSearch } from "../utils/clinical";
import { fmtDate } from "../utils/formatting";
import PageHeader from "../components/layout/PageHeader";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";
import { Tabs, Tab } from "../components/ui/Tabs";
import KPI from "../components/ui/KPI";
import Modal from "../components/ui/Modal";

const INSUMOS_STOCK_KEY     = "saudeubs_insumos_stock_v1";
const INSUMOS_DISPENSA_KEY  = "saudeubs_insumos_dispensa_v1";
const INSUMOS_CONTINUO_KEY  = "saudeubs_insumos_continuo_v1";

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

const INSUMO_CATEGORIAS = ["Todas", ...[...new Set(CATALOGO_INSUMOS.map(i => i.categoria))]];

function readInsumoStock() {
  try {
    const s = localStorage.getItem(INSUMOS_STOCK_KEY);
    if (s) return JSON.parse(s);
    return CATALOGO_INSUMOS.map(i => ({ id: i.id, qty: 0 }));
  } catch { return CATALOGO_INSUMOS.map(i => ({ id: i.id, qty: 0 })); }
}
function saveInsumoStock(s) { writeLS(INSUMOS_STOCK_KEY, s); }
function readInsumoDispensas() { try { return JSON.parse(localStorage.getItem(INSUMOS_DISPENSA_KEY) || "[]"); } catch { return []; } }
function saveInsumoDispensas(d) { writeLS(INSUMOS_DISPENSA_KEY, d); }
function readInsumosContinuos() { try { return JSON.parse(localStorage.getItem(INSUMOS_CONTINUO_KEY) || "[]"); } catch { return []; } }
function saveInsumosContinuos(c) { writeLS(INSUMOS_CONTINUO_KEY, c); }

function sitClass(st, pct) {
  if (st === 0) return "danger";
  if (pct <= 20) return "low";
  if (pct <= 60) return "info";
  return "ok";
}

function sitLabel(st, pct) {
  if (st === 0) return "Sem estoque";
  if (pct <= 20) return "Estoque baixo";
  if (pct <= 60) return "Regular";
  return "Adequado";
}

function stkClass(semEstoque, estq) {
  if (semEstoque) return "empty";
  if (estq <= 5) return "low";
  return "ok";
}

function InsumoPage({ patients, users, user }) {
  const isNurse   = ["nurse_manager", "nursing_tech"].includes(String(user?.role || ""));
  const isPharma  = isPharmacist(user) || isAdmin(user);
  const canDispense = isNurse || isAdmin(user);
  const canViewAll  = isPharma || isAdmin(user);

  const [insumoTab, setInsumoTab] = useState(canDispense ? "dispensar" : "estoque");
  const [stock, setStock]         = useState(readInsumoStock);
  const [dispensas, setDispensas] = useState(readInsumoDispensas);
  const [continuos, setContinuos] = useState(readInsumosContinuos);

  // ── Aba Dispensar ──────────────────────────────────────────────
  const [patSearch, setPatSearch]     = useState("");
  const [patSelected, setPatSelected] = useState(null);
  const [patResults, setPatResults]   = useState([]);
  const [isContinuo, setIsContinuo]   = useState(false);
  const [catFilter, setCatFilter]     = useState("Todas");
  const [itens, setItens]             = useState({});
  const [obsDispensa, setObsDispensa] = useState("");
  const [dispErr, setDispErr]         = useState("");
  const [dispOk, setDispOk]           = useState(false);

  // ── Aba Estoque ────────────────────────────────────────────────
  const [stockCat, setStockCat]           = useState("Todas");
  const [stockSearch, setStockSearch]     = useState("");
  const [editStockItem, setEditStockItem] = useState(null);
  const [editQty, setEditQty]             = useState("");

  // ── Aba Log ────────────────────────────────────────────────────
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all");

  useMemo(() => {
    const q = patSearch.trim();
    if (q.length < 2) { setPatResults([]); return; }
    setPatResults(patients.filter(p => matchesPatientSearch(p, q)).slice(0, 8));
  }, [patSearch, patients]);

  function selectPat(p) {
    setPatSelected(p);
    setPatSearch(p.name);
    setPatResults([]);
    setItens({});
    setDispErr("");
    setDispOk(false);
    const cont = continuos.find(c => c.patientId === p.id && c.ativo);
    if (cont) {
      setIsContinuo(true);
      setItens(Object.fromEntries(cont.itens.map(i => [i.id, i.qtd])));
    } else {
      setIsContinuo(false);
    }
  }

  function setItem(id, val) {
    const cat = CATALOGO_INSUMOS.find(i => i.id === id);
    const max = cat?.qtdMax || 999;
    const n = Math.max(0, Math.min(max, Number(val) || 0));
    setItens(prev => ({ ...prev, [id]: n || undefined }));
    setDispErr("");
    setDispOk(false);
  }

  function validarDispensa() {
    const cont = continuos.find(c => c.patientId === patSelected?.id && c.ativo);
    const selecionados = Object.entries(itens).filter(([, v]) => v > 0);
    if (!selecionados.length) return { ok: false, err: "Selecione ao menos um insumo com quantidade." };
    if (cont) {
      for (const [id, qtd] of selecionados) {
        const limite = cont.itens.find(i => i.id === id);
        if (!limite) continue;
        if (qtd > limite.qtd) {
          const cat = CATALOGO_INSUMOS.find(i => i.id === id);
          return { ok: false, err: `"${cat?.nome}" excede o limite definido para este paciente contínuo (máx: ${limite.qtd} ${cat?.unidade}). Para aumentar, abra nova dispensação.` };
        }
      }
    }
    for (const [id, qtd] of selecionados) {
      const cat = CATALOGO_INSUMOS.find(i => i.id === id);
      if (cat && qtd > cat.qtdMax) {
        return { ok: false, err: `"${cat.nome}" excede a quantidade máxima permitida (${cat.qtdMax} ${cat.unidade}).` };
      }
    }
    return { ok: true };
  }

  function confirmarDispensa() {
    if (!patSelected) { setDispErr("Selecione um paciente."); return; }
    const v = validarDispensa();
    if (!v.ok) { setDispErr(v.err); return; }

    const selecionados = Object.entries(itens).filter(([, v]) => v > 0).map(([id, qtd]) => ({ id, qtd: Number(qtd) }));
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
      date: agora.slice(0, 10),
    };

    const newStock = stock.map(s => {
      const item = selecionados.find(i => i.id === s.id);
      if (!item) return s;
      return { ...s, qty: Math.max(0, s.qty - item.qtd) };
    });
    setStock(newStock);
    saveInsumoStock(newStock);

    const newDispensas = [dispensa, ...dispensas];
    setDispensas(newDispensas);
    saveInsumoDispensas(newDispensas);

    if (isContinuo) {
      const existente = continuos.find(c => c.patientId === patSelected.id && c.ativo);
      if (!existente) {
        const novoCont = {
          id: "c" + Date.now(),
          patientId: patSelected.id,
          patientName: patSelected.name,
          itens: selecionados,
          profissional: user?.name,
          dtInicio: agora.slice(0, 10),
          dtFim: null,
          ativo: true,
          obs: obsDispensa,
        };
        const newC = [novoCont, ...continuos];
        setContinuos(newC);
        saveInsumosContinuos(newC);
      }
    }

    setDispOk(true);
    setDispErr("");
    setItens({});
    setObsDispensa("");
    setTimeout(() => {
      setDispOk(false);
      setPatSelected(null);
      setPatSearch("");
      setIsContinuo(false);
    }, 2500);
  }

  function encerrarContinuo(id) {
    if (!confirm("Encerrar o acompanhamento contínuo deste paciente? Ele não terá mais retirada automática registrada.")) return;
    const newC = continuos.map(c => c.id === id ? { ...c, ativo: false, dtFim: new Date().toISOString().slice(0, 10) } : c);
    setContinuos(newC);
    saveInsumosContinuos(newC);
  }

  function confirmarEntrada() {
    const n = Number(editQty);
    if (!n || n <= 0) return;
    const newStock = stock.map(s => s.id === editStockItem.id ? { ...s, qty: s.qty + n } : s);
    if (!stock.find(s => s.id === editStockItem.id)) newStock.push({ id: editStockItem.id, qty: n });
    setStock(newStock);
    saveInsumoStock(newStock);
    setEditStockItem(null);
  }

  const filteredStock = CATALOGO_INSUMOS.filter(i => {
    if (stockCat !== "Todas" && i.categoria !== stockCat) return false;
    if (stockSearch && !i.nome.toLowerCase().includes(stockSearch.toLowerCase())) return false;
    return true;
  });

  const filteredLog = dispensas.filter(d => {
    if (logFilter === "continuo" && !d.continuo) return false;
    if (logFilter === "normal" && d.continuo) return false;
    if (logSearch && !d.patientName?.toLowerCase().includes(logSearch.toLowerCase()) && !d.profissional?.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const continuosAtivos  = continuos.filter(c => c.ativo);
  const semEstoqueCount  = stock.filter(s => s.qty === 0).length;
  const totalSaidasHoje  = dispensas.filter(d => d.date === new Date().toISOString().slice(0, 10)).length;

  const TABS = [
    canDispense && ["dispensar", "💊 Nova Dispensação"],
    ["estoque", "📦 Estoque de Insumos"],
    (canDispense || canViewAll) && ["log", "🗂️ Histórico de Saídas"],
    ["continuos", "🔄 Pacientes Contínuos"],
  ].filter(Boolean);

  return (
    <div className="insumos-page">

      <PageHeader
        badge="Gestão de Insumos"
        title="Dispensação de Insumos ao Paciente"
        subtitle="Controle de saída, estoque e pacientes contínuos — baseado no formulário DAF/Osasco."
        actions={
          <div className="insumos-session">
            <div className="insumos-session__name">{user?.name}</div>
            <div className="insumos-session__role">{roleLabel(user?.role)}</div>
          </div>
        }
      />

      {/* KPIs */}
      <div className="insumos-kpis">
        <KPI label="Pacientes contínuos ativos" value={continuosAtivos.length} className="card" />
        <KPI label="Dispensações hoje" value={totalSaidasHoje} className="card" />
        <KPI label="Total de dispensações" value={dispensas.length} className="card" />
        <KPI
          label="Itens sem estoque"
          value={semEstoqueCount}
          className={`card${semEstoqueCount > 0 ? " kpi--warning" : ""}`}
        />
      </div>

      {/* Tabs */}
      <div className="insumos-tabs">
        <Tabs>
          {TABS.map(([id, label]) => (
            <Tab key={id} active={insumoTab === id} onClick={() => setInsumoTab(id)}>{label}</Tab>
          ))}
        </Tabs>
      </div>

      <div className="insumos-body">

        {/* ── ABA: NOVA DISPENSAÇÃO ───────────────────────────── */}
        {insumoTab === "dispensar" && canDispense && (
          <div className="ins-disp-layout">

            {/* Sidebar: paciente + opções */}
            <div className="ins-disp-sidebar">

              {/* Busca de paciente */}
              <div className="card" style={{ padding: "var(--s-4)" }}>
                <div className="ins-pat-section">📋 Paciente</div>
                <div className="ins-pat-wrap">
                  <span className="ins-pat-icon">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </span>
                  <input
                    className={`input ins-pat-input${patSelected ? " is-selected" : ""}`}
                    value={patSearch}
                    onChange={e => {
                      setPatSearch(e.target.value);
                      if (patSelected && e.target.value !== patSelected.name) {
                        setPatSelected(null);
                        setItens({});
                        setIsContinuo(false);
                      }
                    }}
                    placeholder="Buscar por nome ou CPF..."
                  />
                  {patResults.length > 0 && !patSelected && (
                    <div className="ins-pat-dropdown">
                      {patResults.map(p => {
                        const cont = continuos.find(c => c.patientId === p.id && c.ativo);
                        return (
                          <button key={p.id} type="button" className="ins-pat-opt" onClick={() => selectPat(p)}>
                            <Avatar name={p.name} size="sm" />
                            <div style={{ minWidth: 0 }}>
                              <div className="ins-pat-opt__name">{p.name}</div>
                              <div className="ins-pat-opt__sub">{p.cpf || ""}{cont ? " · 🔄 Contínuo" : ""}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {patSelected && (
                  <div className="ins-pat-card">
                    <div className="ins-pat-card__name">{patSelected.name}</div>
                    <div className="ins-pat-card__meta">
                      {patSelected.birthDate && `Nasc.: ${fmtDate(patSelected.birthDate)}`}
                      {patSelected.cpf && ` · CPF: ${patSelected.cpf}`}
                    </div>
                    {continuos.find(c => c.patientId === patSelected.id && c.ativo) && (
                      <div className="ins-pat-card__cont">🔄 Paciente contínuo ativo</div>
                    )}
                  </div>
                )}
              </div>

              {/* Marcar como contínuo */}
              {patSelected && (
                <div className="card" style={{ padding: "var(--s-4)" }}>
                  <label className="ins-cont-label">
                    <input type="checkbox" checked={isContinuo} onChange={e => setIsContinuo(e.target.checked)} />
                    <div>
                      <div className="ins-cont-label__title">🔄 Paciente contínuo</div>
                      <div className="ins-cont-label__desc">
                        Marca este paciente para retirada mensal recorrente. A quantidade definida agora será o limite máximo nas próximas retiradas. Para encerrar, use a aba "Pacientes Contínuos".
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {/* Observações */}
              {patSelected && (
                <div className="card" style={{ padding: "var(--s-4)" }}>
                  <div className="ins-obs-title">Observações</div>
                  <textarea
                    className="textarea"
                    value={obsDispensa}
                    onChange={e => setObsDispensa(e.target.value)}
                    placeholder="Motivo, diagnóstico, orientações ao paciente..."
                    style={{ minHeight: 70 }}
                  />
                </div>
              )}
            </div>

            {/* Main: grid de insumos */}
            <div className="ins-disp-main">
              <div className="ins-notice">
                <span style={{ flexShrink: 0 }}>ℹ️</span>
                <span>As quantidades máximas por insumo seguem o formulário DAF/Secretaria de Saúde de Osasco. Nenhum campo pode ultrapassar o limite definido.</span>
              </div>

              <div className="ins-cat-filters">
                {INSUMO_CATEGORIAS.map(c => (
                  <button key={c} type="button" className={`ins-cat-btn${catFilter === c ? " is-active" : ""}`} onClick={() => setCatFilter(c)}>
                    {c}
                  </button>
                ))}
              </div>

              <div className="ins-grid">
                {CATALOGO_INSUMOS.filter(i => catFilter === "Todas" || i.categoria === catFilter).map(insumo => {
                  const qtd = itens[insumo.id] || 0;
                  const estq = stock.find(s => s.id === insumo.id)?.qty ?? 0;
                  const semEstoque = estq === 0;
                  const contItem = continuos.find(c => c.patientId === patSelected?.id && c.ativo)?.itens?.find(i => i.id === insumo.id);
                  const limite = contItem ? contItem.qtd : insumo.qtdMax;
                  return (
                    <div key={insumo.id} className={`ins-item${qtd > 0 ? " is-selected" : ""}${semEstoque ? " is-empty" : ""}`}>
                      <div className="ins-item__body">
                        <div className="ins-item__name">{insumo.nome}</div>
                        <div className="ins-item__meta">
                          <span className="ins-item__tag">{insumo.categoria}</span>
                          <span className="ins-item__tag">Máx: {limite} {insumo.unidade}</span>
                          <span className={`ins-item__stk ins-item__stk--${stkClass(semEstoque, estq)}`}>
                            Estoque: {estq} {insumo.unidade}
                          </span>
                        </div>
                        {insumo.obs && <div className="ins-item__obs">ℹ️ {insumo.obs}</div>}
                      </div>
                      <div className="ins-qty-ctrl">
                        <button type="button" className="ins-qty-btn" onClick={() => setItem(insumo.id, qtd - 1)} disabled={!patSelected || qtd <= 0}>−</button>
                        <input
                          type="number"
                          min={0}
                          max={limite}
                          value={qtd || ""}
                          onChange={e => setItem(insumo.id, e.target.value)}
                          disabled={!patSelected || semEstoque}
                          placeholder="0"
                          className={`ins-qty-input${qtd > 0 ? " is-selected" : ""}`}
                        />
                        <button type="button" className="ins-qty-btn" onClick={() => setItem(insumo.id, qtd + 1)} disabled={!patSelected || qtd >= limite || semEstoque}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Resumo + confirmar */}
              {Object.values(itens).some(v => v > 0) && (
                <div className="ins-summary">
                  <div className="ins-summary__title">📋 Resumo da dispensação</div>
                  {Object.entries(itens).filter(([, v]) => v > 0).map(([id, qtd]) => {
                    const cat = CATALOGO_INSUMOS.find(i => i.id === id);
                    return (
                      <div key={id} className="ins-summary__row">
                        <span>{cat?.nome}</span>
                        <span>{qtd} {cat?.unidade}</span>
                      </div>
                    );
                  })}
                  {dispErr && (
                    <div className="alert alert--danger" style={{ marginTop: "var(--s-2)" }}>{dispErr}</div>
                  )}
                  {dispOk && (
                    <div className="alert alert--success" style={{ marginTop: "var(--s-2)" }}>✓ Dispensação registrada com sucesso!</div>
                  )}
                  <Button
                    variant="primary"
                    onClick={confirmarDispensa}
                    disabled={!patSelected || dispOk}
                    style={{ marginTop: "var(--s-3)", width: "100%" }}
                  >
                    ✓ Confirmar dispensação{isContinuo ? " (contínuo)" : ""}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA: ESTOQUE ─────────────────────────────────────── */}
        {insumoTab === "estoque" && (
          <div>
            <div className="ins-toolbar">
              <input
                className="input"
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
                placeholder="Buscar insumo..."
                style={{ flex: "1 1 200px", maxWidth: 320 }}
              />
              <select className="select" value={stockCat} onChange={e => setStockCat(e.target.value)} style={{ flex: "0 0 auto" }}>
                {INSUMO_CATEGORIAS.map(c => <option key={c}>{c}</option>)}
              </select>
              {isPharma && (
                <Button variant="secondary" size="sm" onClick={() => setEditStockItem("new")}>
                  + Entrada de estoque
                </Button>
              )}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="ins-table">
                <thead>
                  <tr>
                    {["Insumo", "Categoria", "Unidade", "Qtd Máx", "Estoque atual", "Situação", ""].map((h, i) => (
                      <th key={i} className="ins-table__th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map(insumo => {
                    const st  = stock.find(s => s.id === insumo.id)?.qty ?? 0;
                    const pct = insumo.qtdMax > 0 ? Math.round(st / insumo.qtdMax * 100) : 0;
                    const sc  = sitClass(st, pct);
                    return (
                      <tr key={insumo.id}>
                        <td className="ins-table__td ins-table__td--name">
                          {insumo.nome}
                          {insumo.obs && <div className="ins-table__td--obs">ℹ️ {insumo.obs}</div>}
                        </td>
                        <td className="ins-table__td">{insumo.categoria}</td>
                        <td className="ins-table__td">{insumo.unidade}</td>
                        <td className={`ins-table__td ins-table__td--mono`}>{insumo.qtdMax}</td>
                        <td className="ins-table__td">
                          <div className="ins-stk-qty">
                            <span className={`ins-stk-num ins-stk-num--${sc}`}>{st}</span>
                            <div className="ins-stk-bar">
                              <div className={`ins-stk-bar__fill ins-stk-bar__fill--${sc}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="ins-table__td">
                          <span className={`ins-sit ins-sit--${sc}`}>{sitLabel(st, pct)}</span>
                        </td>
                        <td className="ins-table__td">
                          {isPharma && (
                            <Button variant="ghost" size="sm" onClick={() => { setEditStockItem(insumo); setEditQty(""); }}>
                              + Entrada
                            </Button>
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

        {/* ── ABA: LOG DE SAÍDAS ───────────────────────────────── */}
        {insumoTab === "log" && (canDispense || canViewAll) && (
          <div>
            <div className="ins-toolbar">
              <input
                className="input"
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Buscar por paciente ou profissional..."
                style={{ flex: "1 1 220px", maxWidth: 360 }}
              />
              <div className="ins-log-filters">
                {[["all", "Todas"], ["continuo", "🔄 Contínuo"], ["normal", "Normal"]].map(([v, l]) => (
                  <button key={v} type="button" className={`ins-cat-btn${logFilter === v ? " is-active" : ""}`} onClick={() => setLogFilter(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {!filteredLog.length ? (
              <div className="empty-state">📭 Nenhuma dispensação registrada.</div>
            ) : (
              <div className="ins-log-list">
                {filteredLog.map(d => (
                  <div key={d.id} className={`ins-log-entry${d.continuo ? " ins-log-entry--continuo" : ""}`}>
                    <div className="ins-log-entry__head">
                      <div>
                        <div className="ins-log-entry__name">
                          {d.patientName}
                          {d.continuo && <span className="ins-cont-tag">🔄 Contínuo</span>}
                        </div>
                        <div className="ins-log-entry__sub">
                          {d.profissional} ({d.profRole}) · {new Date(d.ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <span className="ins-log-entry__date">{d.date}</span>
                    </div>
                    <div className="ins-log-entry__items">
                      {d.itens.map(item => {
                        const cat = CATALOGO_INSUMOS.find(i => i.id === item.id);
                        return (
                          <span key={item.id} className="ins-log-entry__pill">
                            {cat?.nome || item.id}: {item.qtd} {cat?.unidade || ""}
                          </span>
                        );
                      })}
                    </div>
                    {d.obs && <div className="ins-log-entry__obs">Obs: {d.obs}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ABA: PACIENTES CONTÍNUOS ─────────────────────────── */}
        {insumoTab === "continuos" && (
          <div>
            <div className="ins-notice" style={{ marginBottom: "var(--s-4)" }}>
              <span>🔄</span>
              <span>Pacientes contínuos têm lesão ativa e retornam mensalmente para retirada de insumos. A quantidade máxima foi definida na primeira dispensação e não pode ser ultrapassada. Para encerrar, clique em "Encerrar".</span>
            </div>

            {!continuosAtivos.length ? (
              <div className="empty-state">
                <div className="empty-state__icon">🔄</div>
                <div className="empty-state__title">Nenhum paciente contínuo ativo</div>
                <div className="empty-state__body">Ao dispensar insumos, marque "Paciente contínuo" para registrá-lo aqui.</div>
              </div>
            ) : (
              <div className="ins-cont-list">
                {continuosAtivos.map(c => {
                  const retiradas = dispensas.filter(d => d.patientId === c.patientId && d.continuo).length;
                  const ultima = dispensas.filter(d => d.patientId === c.patientId).sort((a, b) => b.ts.localeCompare(a.ts))[0];
                  return (
                    <div key={c.id} className="ins-cont-card">
                      <div className="ins-cont-card__head">
                        <div>
                          <div className="ins-cont-card__name">
                            {c.patientName}
                            <span className="ins-cont-tag">🔄 Ativo</span>
                          </div>
                          <div className="ins-cont-card__meta">
                            Desde {fmtDate(c.dtInicio)} · {retiradas} retirada(s) registrada(s) · Por: {c.profissional}
                          </div>
                          {ultima && (
                            <div className="ins-cont-card__meta">Última retirada: {fmtDate(ultima.date)}</div>
                          )}
                        </div>
                        {canDispense && (
                          <button type="button" className="ins-btn-encerrar" onClick={() => encerrarContinuo(c.id)}>
                            Encerrar
                          </button>
                        )}
                      </div>
                      <div className="ins-cont-card__items-label">Insumos desta prescrição (limites)</div>
                      <div className="ins-cont-card__pills">
                        {c.itens.map(item => {
                          const cat = CATALOGO_INSUMOS.find(i => i.id === item.id);
                          return (
                            <span key={item.id} className="ins-cont-card__pill">
                              {cat?.nome || item.id}: até {item.qtd} {cat?.unidade}
                            </span>
                          );
                        })}
                      </div>
                      {c.obs && <div className="ins-cont-card__obs">Obs.: {c.obs}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Encerrados */}
            {continuos.filter(c => !c.ativo).length > 0 && (
              <div className="ins-cont-done-list">
                <div className="ins-cont-done-title">Encerrados</div>
                {continuos.filter(c => !c.ativo).map(c => (
                  <div key={c.id} className="ins-cont-done">
                    <div className="ins-cont-done__name">{c.patientName}</div>
                    <div className="ins-cont-done__meta">
                      {fmtDate(c.dtInicio)} → {fmtDate(c.dtFim)} · {dispensas.filter(d => d.patientId === c.patientId && d.continuo).length} retirada(s)
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: entrada de estoque */}
      {editStockItem && (
        <Modal
          title={editStockItem === "new" ? "Nova entrada de estoque" : `+ Entrada: ${editStockItem.nome}`}
          onClose={() => setEditStockItem(null)}
          actions={
            editStockItem !== "new" ? (
              <>
                <Button variant="secondary" onClick={() => setEditStockItem(null)}>Cancelar</Button>
                <Button variant="primary" onClick={confirmarEntrada}>✓ Confirmar entrada</Button>
              </>
            ) : null
          }
        >
          {editStockItem === "new" ? (
            <p className="ins-modal-info">Para entrada em item específico, clique em "+ Entrada" na linha do insumo na tabela.</p>
          ) : (
            <div className="field-grid">
              <div className="field-grid__full">
                <p className="ins-modal-info">Insumo: <strong>{editStockItem.nome}</strong></p>
                <p className="ins-modal-info">Estoque atual: <strong>{stock.find(s => s.id === editStockItem.id)?.qty ?? 0} {editStockItem.unidade}</strong></p>
              </div>
              <label className="label field-grid__full">
                Quantidade a adicionar *
                <input type="number" min="1" className="input" value={editQty} onChange={e => setEditQty(e.target.value)} placeholder="Ex: 50" autoFocus />
              </label>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default InsumoPage;
