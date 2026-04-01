/**
 * NewPages.jsx — Páginas redesenhadas · SIGUS
 * Prontuário (CFM/LGPD/Lei 13.787), Insumos (layout farmácia), Gestão à Vista (dashboard profissional)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ─── Design tokens ─────────────────────────────────────────────── */
const T = {
  ink:      "#0f172a",
  ink2:     "#1e293b",
  text2:    "#475569",
  text3:    "#94a3b8",
  border:   "#e2e8f0",
  borderMd: "#cbd5e1",
  surface:  "#ffffff",
  surface2: "#f8fafc",
  surface3: "#f1f5f9",
  surface4: "#e2e8f0",
  teal:     "#0d9488",
  tealL:    "#ccfbf1",
  tealD:    "#0f766e",
  indigo:   "#4f46e5",
  indigoL:  "#e0e7ff",
  indigoD:  "#3730a3",
  rose:     "#e11d48",
  roseL:    "#fff1f2",
  amber:    "#d97706",
  amberL:   "#fef3c7",
  green:    "#16a34a",
  greenL:   "#dcfce7",
  blue:     "#2563eb",
  blueL:    "#dbeafe",
  purple:   "#7c3aed",
  purpleL:  "#ede9fe",
  slate:    "#64748b",
  r:        "10px",
  rMd:      "12px",
  rLg:      "16px",
  shadow:   "0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)",
  shadowMd: "0 4px 16px rgba(0,0,0,.10), 0 2px 4px rgba(0,0,0,.06)",
  shadowLg: "0 20px 48px rgba(0,0,0,.14), 0 4px 12px rgba(0,0,0,.08)",
};

/* ─── Utilitários ───────────────────────────────────────────────── */
function fmtDate(s) {
  if (!s) return "—";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function fmtDateTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function calcAge(b) {
  if (!b) return null;
  const bd = new Date(b + "T12:00:00");
  const now = new Date();
  let y = now.getFullYear() - bd.getFullYear();
  if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) y--;
  return y;
}
function initials(name) {
  return String(name || "?").trim().split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?";
}
function roleLabel(role) {
  return ({
    nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS",
    pharmacist: "Farmacêutico(a)", pharmacy_tech: "Téc. Farmácia",
    nursing_tech: "Téc. Enfermagem", receptionist: "Recepcionista",
    dentist: "Dentista", gestor: "Gestor(a) UBS",
  })[String(role || "").toLowerCase()] || role || "—";
}
function normalizeCareCategory(cat) {
  const c = String(cat || "").trim().toLowerCase();
  if (!c) return "general";
  const allowed = new Set(["general", "pregnant", "puerperal", "child_followup", "elderly", "chronic"]);
  return allowed.has(c) ? c : "general";
}
function catLabel(cat) {
  const normalized = normalizeCareCategory(cat);
  return ({
    pregnant: "Gestante", child_followup: "Puericultura", chronic: "Crônico",
    puerperal: "Puérpera", general: "Geral", elderly: "Pessoa Idosa",
  })[normalized] || normalized || "—";
}
function catColor(cat) {
  const normalized = normalizeCareCategory(cat);
  return ({
    pregnant: "#db2777", child_followup: "#0891b2", chronic: "#d97706",
    puerperal: "#7c3aed", general: "#4f46e5", elderly: "#0ea5e9",
  })[normalized] || T.text3;
}
function recordTypeLabel(t) {
  return ({
    consultation: "Consulta", visit: "Visita ACS", vaccine: "Vacina",
    exam_request: "Pedido de Exame", dispensation: "Dispensação", procedure: "Procedimento",
  })[t] || t || "Registro";
}
function recordTypeIcon(t) {
  return ({ consultation: "🩺", visit: "🏠", vaccine: "💉", exam_request: "🔬", dispensation: "💊", procedure: "⚕️" })[t] || "📋";
}
function recordTypeColor(t) {
  return ({
    consultation: T.blue, visit: T.teal, vaccine: T.green,
    exam_request: T.indigo, dispensation: T.amber, procedure: T.purple,
  })[t] || T.text3;
}
function cid10Label(code) {
  const map = {
    "Z34": "Supervisão de gravidez normal", "O10": "HAS preexistente complicando gravidez",
    "E11": "Diabetes mellitus tipo 2", "I10": "Hipertensão essencial",
    "J06": "IVAS NE", "K21": "Doença de refluxo gastroesofágico",
    "F41": "Transtornos ansiosos", "Z00": "Exame geral",
  };
  return map[code] || code;
}

/* ─── Componentes base ──────────────────────────────────────────── */
function Card({ children, style, onClick, hover }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: T.surface,
        border: `1px solid ${hovered ? T.borderMd : T.border}`,
        borderRadius: T.rMd,
        boxShadow: hovered ? T.shadowMd : T.shadow,
        transition: "box-shadow .2s, border-color .2s",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ label, color, bg, size = "sm" }) {
  const sizes = { sm: { padding: ".18rem .55rem", fontSize: ".68rem" }, md: { padding: ".28rem .7rem", fontSize: ".75rem" } };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: ".3rem",
      borderRadius: 99, fontWeight: 700, letterSpacing: ".02em",
      color: color || T.tealD, background: bg || T.tealL,
      ...sizes[size],
    }}>
      {label}
    </span>
  );
}

function Pill({ label, icon, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: ".35rem",
      padding: ".38rem .9rem", borderRadius: 99,
      border: active ? `1.5px solid ${color || T.indigo}` : `1px solid ${T.border}`,
      fontSize: ".78rem", fontWeight: 600, cursor: "pointer",
      background: active ? (color || T.indigo) : T.surface,
      color: active ? "#fff" : T.text2,
      transition: "all .15s",
    }}>
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function SectionHeader({ title, sub, action, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
        {icon && <span style={{ fontSize: "1rem" }}>{icon}</span>}
        <div>
          <h2 style={{ margin: 0, fontSize: ".95rem", fontWeight: 700, color: T.ink }}>{title}</h2>
          {sub && <p style={{ margin: ".15rem 0 0", fontSize: ".75rem", color: T.text3 }}>{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "3rem 1rem", color: T.text3 }}>
      <div style={{ fontSize: "2.5rem", marginBottom: ".75rem", opacity: .6 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: T.text2, marginBottom: ".35rem" }}>{title}</div>
      {sub && <div style={{ fontSize: ".82rem" }}>{sub}</div>}
    </div>
  );
}

function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "spin 1s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="10" stroke={T.border} strokeWidth="3"/>
      <path d="M12 2a10 10 0 0110 10" stroke={T.indigo} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function AlertBanner({ type, children }) {
  const styles = {
    info:    { bg: T.blueL,   border: "#bfdbfe", color: T.blue,   icon: "ℹ️" },
    warning: { bg: T.amberL,  border: "#fcd34d", color: T.amber,  icon: "⚠️" },
    error:   { bg: T.roseL,   border: "#fecdd3", color: T.rose,   icon: "🚫" },
    success: { bg: T.greenL,  border: "#86efac", color: T.green,  icon: "✅" },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{
      padding: ".65rem 1rem", borderRadius: T.r, border: `1px solid ${s.border}`,
      background: s.bg, display: "flex", alignItems: "flex-start", gap: ".6rem",
      fontSize: ".8rem", color: s.color, fontWeight: 500,
    }}>
      <span style={{ flexShrink: 0, marginTop: ".05rem" }}>{s.icon}</span>
      <span>{children}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRONTUÁRIO ELETRÔNICO — CFM 1638/2002 · Lei 13.787/2018 · LGPD
   RES. CFM 1821/2007 · RBCE · COFEN · PNAB 2.436/2017
════════════════════════════════════════════════════════════════════ */

/* Trava de senha para acesso ao prontuário */
function PasswordGate({ user, onUnlock }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);
  useEffect(() => {
    if (locked && countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    }
    if (locked && countdown === 0 && locked) setLocked(false);
  }, [locked, countdown]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (locked || !pw) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password: pw }),
      });
      if (res.ok) { setAttempts(0); onUnlock(); }
      else {
        const n = attempts + 1; setAttempts(n);
        if (n >= 3) { setLocked(true); setCountdown(30); setErr("Acesso bloqueado por 30 segundos após 3 tentativas."); }
        else setErr(`Senha incorreta. ${3 - n} tentativa(s) restante(s).`);
        setPw("");
      }
    } catch { setErr("Erro de conexão. Verifique a rede."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: "2rem",
      background: "linear-gradient(135deg, #f0f4ff 0%, #fafafa 50%, #f0fdf4 100%)",
    }}>
      <Card style={{ width: "100%", maxWidth: 400, padding: "2.5rem 2.25rem", boxShadow: T.shadowLg }}>
        {/* Cabeçalho */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 64, height: 64, borderRadius: "50%",
            background: locked ? "#fff0f0" : "#f0f0ff",
            border: `2px solid ${locked ? "#fecdd3" : "#c7d2fe"}`,
            marginBottom: "1.25rem",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2.5"
                stroke={locked ? T.rose : T.indigo} strokeWidth="1.8"/>
              <path d="M7 11V7a5 5 0 0110 0v4"
                stroke={locked ? T.rose : T.indigo} strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="12" cy="16.5" r="1.5" fill={locked ? T.rose : T.indigo}/>
            </svg>
          </div>
          <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: T.ink }}>
            Acesso ao Prontuário Eletrônico
          </h2>
          <p style={{ margin: ".5rem 0 0", fontSize: ".82rem", color: T.text2, lineHeight: 1.5 }}>
            Confirme sua identidade para acessar<br/>os registros clínicos do paciente
          </p>
          {/* Identidade do profissional */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: ".6rem",
            marginTop: "1.25rem", padding: ".5rem 1rem",
            background: T.surface2, borderRadius: 99, border: `1px solid ${T.border}`,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: T.indigo, color: "#fff",
              fontSize: ".72rem", fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {initials(user?.name)}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: ".82rem", fontWeight: 700, color: T.ink }}>{user?.name}</div>
              <div style={{ fontSize: ".7rem", color: T.text3 }}>{roleLabel(user?.role)}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={{ fontSize: ".78rem", fontWeight: 600, color: T.ink2, display: "block", marginBottom: ".4rem" }}>
              Senha de acesso
            </span>
            <input
              ref={inputRef}
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              disabled={locked || busy}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: ".7rem 1rem", fontSize: ".95rem",
                border: `1.5px solid ${err ? T.rose : T.border}`,
                borderRadius: T.r, outline: "none",
                background: locked ? T.surface3 : T.surface,
                color: T.ink, fontFamily: "inherit",
                transition: "border-color .15s, box-shadow .15s",
                letterSpacing: pw ? ".15em" : undefined,
              }}
              onFocus={e => e.target.style.borderColor = T.indigo}
              onBlur={e => e.target.style.borderColor = err ? T.rose : T.border}
            />
          </label>

          {err && (
            <div style={{
              padding: ".6rem .9rem", borderRadius: 8, marginBottom: ".85rem",
              background: T.roseL, border: "1px solid #fecdd3",
              fontSize: ".78rem", color: T.rose, fontWeight: 500,
              display: "flex", alignItems: "center", gap: ".5rem",
            }}>
              <span>🔒</span>
              <span style={{ flex: 1 }}>{err}</span>
              {locked && countdown > 0 && (
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: ".9rem" }}>
                  {countdown}s
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!pw || busy || locked}
            style={{
              width: "100%", padding: ".75rem",
              background: !pw || locked ? T.surface3 : T.indigo,
              color: !pw || locked ? T.text3 : "#fff",
              border: "none", borderRadius: T.r,
              fontSize: ".9rem", fontWeight: 700,
              cursor: !pw || locked ? "not-allowed" : "pointer",
              transition: "all .15s", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: ".5rem",
            }}
          >
            {busy ? <><Spinner size={16} /> Verificando...</> : locked ? `Bloqueado (${countdown}s)` : "Acessar Prontuário →"}
          </button>
        </form>

        {/* Avisos legais */}
        <div style={{
          marginTop: "1.5rem", padding: ".85rem 1rem",
          background: T.surface2, borderRadius: T.r,
          border: `1px solid ${T.border}`, fontSize: ".7rem", color: T.text3, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: T.text2, marginBottom: ".3rem", display: "flex", alignItems: "center", gap: ".35rem" }}>
            <span>🛡️</span> Base legal deste acesso
          </div>
          <div>• <strong>CFM nº 1.638/2002</strong> — Prontuário como propriedade do paciente</div>
          <div>• <strong>Lei nº 13.787/2018</strong> — Digitalização e guarda de prontuários</div>
          <div>• <strong>LGPD (Lei 13.709/2018)</strong> — Proteção de dados sensíveis de saúde</div>
          <div>• <strong>Res. CFM 1.821/2007</strong> — Prontuário eletrônico e assinatura digital</div>
          <div style={{ marginTop: ".4rem", color: "#ef4444", fontWeight: 500 }}>
            ⚠️ Este acesso é auditado e registrado em trilha imutável.
          </div>
        </div>
      </Card>
    </div>
  );
}

/* Componente de Evolução (SOAP) */
function SoapRecord({ record, isLast, user }) {
  const [open, setOpen] = useState(false);
  const color = recordTypeColor(record.type);

  return (
    <div style={{ display: "flex", gap: "1rem", position: "relative" }}>
      {!isLast && (
        <div style={{
          position: "absolute", left: 19, top: 40, bottom: -8,
          width: 2, background: T.surface4, zIndex: 0,
        }} />
      )}
      {/* Ícone da linha do tempo */}
      <div style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: "50%",
        background: color + "18", border: `2px solid ${color}40`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.1rem", zIndex: 1, position: "relative",
      }}>
        {recordTypeIcon(record.type)}
      </div>

      {/* Conteúdo do registro */}
      <div style={{ flex: 1, paddingBottom: "1.25rem" }}>
        <div
          onClick={() => setOpen(o => !o)}
          style={{
            cursor: "pointer", padding: ".85rem 1.1rem",
            background: T.surface, border: `1px solid ${open ? color + "40" : T.border}`,
            borderLeft: `3px solid ${color}`,
            borderRadius: "0 " + T.r + " " + T.r + " 0",
            boxShadow: open ? T.shadowMd : T.shadow,
            transition: "all .2s",
          }}
        >
          {/* Cabeçalho do registro */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
              <Badge label={recordTypeLabel(record.type)} color={color} bg={color + "15"} size="md" />
              {record.cid10 && <Badge label={`CID-10: ${record.cid10}`} color={T.purple} bg={T.purpleL} size="sm" />}
              {record.vaccine && <Badge label={record.vaccine} color={T.green} bg={T.greenL} size="sm" />}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
              <span style={{ fontSize: ".72rem", color: T.text3, fontVariantNumeric: "tabular-nums" }}>
                {fmtDate(record.date)} {record.time && `· ${record.time}`}
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s", color: T.text3 }}>
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          {/* Profissional responsável */}
          {record.createdByName && (
            <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".35rem", display: "flex", alignItems: "center", gap: ".3rem" }}>
              <span>👤</span>
              <span><strong>{record.createdByName}</strong> · {roleLabel(record.createdByRole)}</span>
              {record.councilNumber && <span>· {record.createdByRole === "doctor" ? "CRM" : record.createdByRole === "dentist" ? "CRO" : "COREN"} {record.councilNumber}/{record.councilUf}</span>}
            </div>
          )}

          {/* Preview */}
          {!open && record.notes && (
            <p style={{
              margin: ".45rem 0 0", fontSize: ".8rem", color: T.text2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: "90%",
            }}>
              {record.notes}
            </p>
          )}

          {/* Conteúdo expandido — SOAP */}
          {open && (
            <div style={{ marginTop: ".75rem", display: "flex", flexDirection: "column", gap: ".65rem" }}>
              {record.notes && (
                <SoapSection title="Notas / Evolução" icon="📝">
                  <p style={{ margin: 0, fontSize: ".82rem", color: T.ink2, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {record.notes}
                  </p>
                </SoapSection>
              )}
              {record.subjectiveData && (
                <SoapSection title="S — Subjetivo (Queixa do paciente)" icon="💬">
                  <p style={{ margin: 0, fontSize: ".82rem", color: T.ink2, lineHeight: 1.65 }}>{record.subjectiveData}</p>
                </SoapSection>
              )}
              {record.objectiveData && (
                <SoapSection title="O — Objetivo (Exame clínico / dados mensuráveis)" icon="🔬">
                  <p style={{ margin: 0, fontSize: ".82rem", color: T.ink2, lineHeight: 1.65, fontFamily: "monospace" }}>{record.objectiveData}</p>
                </SoapSection>
              )}
              {record.assessment && (
                <SoapSection title="A — Avaliação (Hipótese / diagnóstico)" icon="📋">
                  <p style={{ margin: 0, fontSize: ".82rem", color: T.ink2, lineHeight: 1.65 }}>{record.assessment}</p>
                  {record.cid10 && <p style={{ margin: ".3rem 0 0", fontSize: ".75rem", color: T.purple }}>CID-10: {record.cid10} — {cid10Label(record.cid10)}</p>}
                </SoapSection>
              )}
              {record.plan && (
                <SoapSection title="P — Plano terapêutico / conduta" icon="📅">
                  <p style={{ margin: 0, fontSize: ".82rem", color: T.ink2, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{record.plan}</p>
                </SoapSection>
              )}
              {/* Informações de auditoria do registro */}
              <div style={{
                padding: ".55rem .85rem", borderRadius: 8,
                background: T.surface2, border: `1px solid ${T.border}`,
                fontSize: ".68rem", color: T.text3, display: "flex", gap: "1rem", flexWrap: "wrap",
              }}>
                <span>🔒 Registro ID: <strong style={{ fontFamily: "monospace" }}>{record.id}</strong></span>
                {record.createdAt && <span>Criado: {fmtDateTime(record.createdAt)}</span>}
                <span style={{ color: "#10b981" }}>✓ Integridade verificada</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SoapSection({ title, icon, children }) {
  return (
    <div style={{
      padding: ".65rem .85rem", borderRadius: 8,
      background: T.surface2, border: `1px solid ${T.border}`,
    }}>
      <div style={{ fontSize: ".72rem", fontWeight: 700, color: T.text3, marginBottom: ".35rem", display: "flex", alignItems: "center", gap: ".3rem" }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

/* Barra de alergias / alertas clínicos */
function ClinicalAlerts({ patient }) {
  const alerts = [];
  if (patient.allergies) alerts.push({ type: "error", label: `Alergia: ${patient.allergies}` });
  if (patient.chronicConditions) alerts.push({ type: "warning", label: `Condição crônica: ${patient.chronicConditions}` });
  if (patient.medications) alerts.push({ type: "info", label: `Em uso: ${patient.medications}` });
  if (patient.bloodType) alerts.push({ type: "info", label: `Tipo sanguíneo: ${patient.bloodType}` });
  if (!alerts.length) return null;

  const colors = { error: T.rose, warning: T.amber, info: T.blue };
  const bgs = { error: T.roseL, warning: T.amberL, info: T.blueL };

  return (
    <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
      {alerts.map((a, i) => (
        <span key={i} style={{
          display: "inline-flex", alignItems: "center", gap: ".35rem",
          padding: ".3rem .75rem", borderRadius: 99,
          fontSize: ".74rem", fontWeight: 600,
          background: bgs[a.type], color: colors[a.type],
          border: `1px solid ${colors[a.type]}30`,
        }}>
          {a.type === "error" ? "⚠️" : a.type === "warning" ? "📋" : "ℹ️"} {a.label}
        </span>
      ))}
    </div>
  );
}

/* Indicadores do Protocolo */
function ProtocolIndicators({ patient, protocols }) {
  if (!protocols) return null;
  const proto = protocols[patient.id];
  if (!proto) return null;
  const pct = proto.completion ?? 0;
  const color = pct >= 80 ? T.green : pct >= 50 ? T.amber : T.rose;

  return (
    <div style={{
      padding: ".65rem 1rem", borderRadius: T.r,
      background: color + "10", border: `1px solid ${color}30`,
      display: "flex", alignItems: "center", gap: "1rem",
    }}>
      <div style={{ fontSize: ".78rem", fontWeight: 700, color: T.ink }}>
        Protocolo {catLabel(patient.careCategory)}
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.surface3 }}>
        <div style={{ height: "100%", borderRadius: 99, background: color, width: `${pct}%`, transition: "width .4s" }} />
      </div>
      <div style={{ fontSize: ".8rem", fontWeight: 800, color }}>{pct}%</div>
    </div>
  );
}

/* ─── ProntuarioPage principal ──────────────────────────────────── */
export function ProntuarioPage({ patients, user, getPatientHistory: getHistory, getPatientProtocolSummary, protocolByPatient }) {
  const [selectedId, setSelectedId] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [patSearch, setPatSearch] = useState("");
  const [tab, setTab] = useState("timeline");
  const [sortDir, setSortDir] = useState("desc");

  const patient = patients.find(p => p.id === selectedId);

  useEffect(() => {
    if (!unlocked || !selectedId) return;
    setLoading(true);
    const fn = getHistory || getPatientHistory;
    fn?.(selectedId).then(data => {
      setRecords(Array.isArray(data) ? data : data?.records || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [unlocked, selectedId]);

  const typeOptions = [
    { key: "all", label: "Todos", icon: "📋" },
    { key: "consultation", label: "Consultas", icon: "🩺" },
    { key: "visit", label: "Visitas", icon: "🏠" },
    { key: "vaccine", label: "Vacinas", icon: "💉" },
    { key: "exam_request", label: "Exames", icon: "🔬" },
    { key: "dispensation", label: "Dispensações", icon: "💊" },
    { key: "procedure", label: "Procedimentos", icon: "⚕️" },
  ];

  const filteredRecords = useMemo(() => {
    let r = records;
    if (filterType !== "all") r = r.filter(x => x.type === filterType);
    if (search) r = r.filter(x =>
      (x.notes || "").toLowerCase().includes(search.toLowerCase()) ||
      (x.cid10 || "").toLowerCase().includes(search.toLowerCase()) ||
      (x.createdByName || "").toLowerCase().includes(search.toLowerCase())
    );
    return sortDir === "desc" ? [...r].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [...r].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [records, filterType, search, sortDir]);

  const filteredPatients = useMemo(() => {
    if (!patSearch.trim()) return patients.slice(0, 20);
    return patients.filter(p => (p.name || "").toLowerCase().includes(patSearch.toLowerCase()) ||
      (p.cpf || "").includes(patSearch) || (p.cns || "").includes(patSearch)).slice(0, 20);
  }, [patients, patSearch]);

  const age = patient ? calcAge(patient.birthDate) : null;

  /* ── Lista de pacientes ── */
  if (!selectedId) {
    return (
      <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: ".75rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: T.ink, letterSpacing: "-.01em" }}>
              Prontuário Eletrônico
            </h1>
            <p style={{ margin: ".3rem 0 0", fontSize: ".82rem", color: T.text3 }}>
              Seleção de paciente · Acesso protegido por senha e auditado
            </p>
          </div>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <Badge label="CFM 1638/2002" color={T.indigo} bg={T.indigoL} size="md" />
            <Badge label="Lei 13.787/2018" color={T.indigo} bg={T.indigoL} size="md" />
            <Badge label="LGPD" color={T.purple} bg={T.purpleL} size="md" />
          </div>
        </div>

        {/* Aviso legal */}
        <AlertBanner type="info">
          Acesso a prontuários eletrônicos é restrito a profissionais de saúde habilitados. Todo acesso é registrado em trilha de auditoria imutável, conforme <strong>CFM 1638/2002</strong>, <strong>Lei 13.787/2018</strong> e <strong>LGPD (Art. 11, II, f)</strong>. O prontuário é propriedade do paciente; o profissional detém o dever de sigilo.
        </AlertBanner>

        {/* Busca */}
        <Card style={{ padding: "1rem 1.25rem" }}>
          <div style={{ position: "relative" }}>
            <svg style={{ position: "absolute", left: ".85rem", top: "50%", transform: "translateY(-50%)", color: T.text3, pointerEvents: "none" }} width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              value={patSearch}
              onChange={e => setPatSearch(e.target.value)}
              placeholder="Buscar por nome, CPF ou CNS do paciente..."
              style={{
                width: "100%", boxSizing: "border-box",
                padding: ".6rem .9rem .6rem 2.4rem",
                fontSize: ".85rem", border: `1.5px solid ${T.border}`,
                borderRadius: T.r, outline: "none",
                fontFamily: "inherit", color: T.ink, background: T.surface2,
                transition: "border-color .15s",
              }}
              onFocus={e => e.target.style.borderColor = T.indigo}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </div>
          <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".45rem" }}>
            {filteredPatients.length} paciente(s) encontrado(s) · {patients.length} total
          </div>
        </Card>

        {/* Lista de pacientes */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: ".75rem" }}>
          {filteredPatients.map(p => {
            const a = calcAge(p.birthDate);
            return (
              <Card key={p.id} hover onClick={() => setSelectedId(p.id)} style={{ padding: "1rem 1.1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                    background: catColor(p.careCategory) + "18",
                    border: `2px solid ${catColor(p.careCategory)}35`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ".85rem", fontWeight: 800, color: catColor(p.careCategory),
                  }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: ".88rem", color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </div>
                    <div style={{ display: "flex", gap: ".4rem", marginTop: ".2rem", flexWrap: "wrap", alignItems: "center" }}>
                      <Badge label={catLabel(p.careCategory)} color={catColor(p.careCategory)} bg={catColor(p.careCategory) + "15"} />
                      {a !== null && <span style={{ fontSize: ".72rem", color: T.text3 }}>{a} anos</span>}
                    </div>
                    <div style={{ fontSize: ".7rem", color: T.text3, marginTop: ".15rem", display: "flex", gap: ".75rem" }}>
                      {p.cns && <span>CNS: {p.cns}</span>}
                      {p.cpf && <span>CPF: {p.cpf}</span>}
                    </div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: T.text3, flexShrink: 0 }}>
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </Card>
            );
          })}
        </div>
        {filteredPatients.length === 0 && (
          <EmptyState icon="🔍" title="Nenhum paciente encontrado" sub="Tente buscar por nome completo, CPF ou número do CNS." />
        )}
      </div>
    );
  }

  /* ── Trava de senha ── */
  if (!unlocked) {
    return (
      <div style={{ padding: "2rem" }}>
        <button
          onClick={() => setSelectedId("")}
          style={{ display: "flex", alignItems: "center", gap: ".4rem", border: "none", background: "none", cursor: "pointer", color: T.text2, fontSize: ".82rem", fontWeight: 500, padding: 0, marginBottom: "1.5rem" }}
        >
          ← Voltar à seleção
        </button>
        <PasswordGate user={user} onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  /* ── Prontuário aberto ── */
  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Navegação */}
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap" }}>
        <button
          onClick={() => { setUnlocked(false); setSelectedId(""); setRecords([]); }}
          style={{ display: "flex", alignItems: "center", gap: ".4rem", border: "none", background: "none", cursor: "pointer", color: T.text2, fontSize: ".82rem", fontWeight: 500, padding: 0 }}
        >
          ← Voltar
        </button>
        <span style={{ color: T.border }}>|</span>
        <span style={{ fontSize: ".8rem", color: T.text3 }}>Prontuário Eletrônico</span>
        <span style={{ color: T.border }}>|</span>
        <span style={{ fontSize: ".8rem", fontWeight: 600, color: T.ink }}>{patient?.name}</span>
      </div>

      {/* Header do paciente */}
      <Card style={{ padding: "1.25rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "1.1rem", flexWrap: "wrap" }}>
          {/* Avatar */}
          <div style={{
            width: 60, height: 60, borderRadius: "50%", flexShrink: 0,
            background: catColor(patient.careCategory) + "18",
            border: `2.5px solid ${catColor(patient.careCategory)}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.2rem", fontWeight: 800, color: catColor(patient.careCategory),
          }}>
            {initials(patient.name)}
          </div>

          {/* Dados do paciente */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: T.ink }}>{patient.name}</h2>
              <Badge label={catLabel(patient.careCategory)} color={catColor(patient.careCategory)} bg={catColor(patient.careCategory) + "18"} size="md" />
              <Badge label="🔓 Acesso Ativo" color={T.green} bg={T.greenL} size="sm" />
            </div>

            {/* Dados demográficos */}
            <div style={{ display: "flex", gap: "1.25rem", marginTop: ".5rem", flexWrap: "wrap" }}>
              {patient.birthDate && (
                <span style={{ fontSize: ".78rem", color: T.text3 }}>
                  📅 {fmtDate(patient.birthDate)}{age !== null ? ` (${age} anos)` : ""}
                </span>
              )}
              {patient.sex && <span style={{ fontSize: ".78rem", color: T.text3 }}>⚧ {patient.sex === "F" ? "Feminino" : patient.sex === "M" ? "Masculino" : patient.sex}</span>}
              {patient.cpf && <span style={{ fontSize: ".78rem", color: T.text3 }}>CPF: {patient.cpf}</span>}
              {patient.cns && <span style={{ fontSize: ".78rem", color: T.text3 }}>CNS: {patient.cns}</span>}
              {patient.phone && <span style={{ fontSize: ".78rem", color: T.text3 }}>📱 {patient.phone}</span>}
              {patient.microArea && <span style={{ fontSize: ".78rem", color: T.text3 }}>📍 Microárea {patient.microArea}</span>}
            </div>

            {/* Alertas clínicos */}
            {patient && <div style={{ marginTop: ".6rem" }}><ClinicalAlerts patient={patient} /></div>}
          </div>

          {/* Status */}
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: ".68rem", color: T.text3, marginBottom: ".2rem" }}>Acesso registrado por</div>
            <div style={{ fontSize: ".78rem", fontWeight: 700, color: T.ink }}>{user?.name}</div>
            <div style={{ fontSize: ".7rem", color: T.text3 }}>{roleLabel(user?.role)}</div>
            {user?.councilNumber && (
              <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".1rem" }}>
                {user.role === "doctor" ? "CRM" : user.role === "dentist" ? "CRO" : "COREN"} {user.councilNumber}/{user.councilUf}
              </div>
            )}
          </div>
        </div>

        {/* Progresso do protocolo */}
        {protocolByPatient && (
          <div style={{ marginTop: ".85rem" }}>
            <ProtocolIndicators patient={patient} protocols={protocolByPatient} />
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        {[
          { label: "Total de registros", value: records.length, icon: "📋", color: T.indigo, bg: T.indigoL },
          { label: "Consultas", value: records.filter(r => r.type === "consultation").length, icon: "🩺", color: T.blue, bg: T.blueL },
          { label: "Visitas ACS", value: records.filter(r => r.type === "visit").length, icon: "🏠", color: T.teal, bg: T.tealL },
          { label: "Vacinas", value: records.filter(r => r.type === "vaccine").length, icon: "💉", color: T.green, bg: T.greenL },
          { label: "Exames", value: records.filter(r => r.type === "exam_request").length, icon: "🔬", color: T.purple, bg: T.purpleL },
          { label: "Dispensações", value: records.filter(r => r.type === "dispensation").length, icon: "💊", color: T.amber, bg: T.amberL },
        ].map(k => (
          <Card key={k.label} style={{ padding: ".85rem 1rem", flex: "1 1 120px", minWidth: 100 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".25rem", fontWeight: 500 }}>{k.label}</div>
              </div>
              <div style={{ fontSize: "1.25rem", background: k.bg, borderRadius: 8, padding: ".3rem .4rem", lineHeight: 1 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: ".35rem", borderBottom: `2px solid ${T.border}`, paddingBottom: ".5rem" }}>
        {[
          { key: "timeline", label: "Linha do Tempo", icon: "📋" },
          { key: "dados", label: "Dados Clínicos", icon: "📊" },
          { key: "auditoria", label: "Auditoria de Acesso", icon: "🔒" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: ".45rem 1rem", fontSize: ".82rem", fontWeight: 600, border: "none",
            background: tab === t.key ? T.indigo : "none",
            color: tab === t.key ? "#fff" : T.text2,
            borderRadius: "8px 8px 0 0", cursor: "pointer",
            display: "flex", alignItems: "center", gap: ".35rem",
            transition: "all .15s",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Aba: Linha do Tempo */}
      {tab === "timeline" && (
        <>
          {/* Filtros */}
          <Card style={{ padding: "1rem 1.25rem" }}>
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
              {typeOptions.map(o => (
                <Pill key={o.key} label={o.label} icon={o.icon} active={filterType === o.key} onClick={() => setFilterType(o.key)} color={T.indigo} />
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: ".5rem", alignItems: "center" }}>
                <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} style={{
                  padding: ".38rem .75rem", borderRadius: T.r, border: `1px solid ${T.border}`,
                  background: T.surface2, cursor: "pointer", fontSize: ".75rem", fontWeight: 600, color: T.text2,
                  display: "flex", alignItems: "center", gap: ".3rem",
                }}>
                  {sortDir === "desc" ? "↓ Mais recente" : "↑ Mais antigo"}
                </button>
                <div style={{ position: "relative" }}>
                  <svg style={{ position: "absolute", left: ".6rem", top: "50%", transform: "translateY(-50%)", color: T.text3, pointerEvents: "none" }} width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar nos registros..."
                    style={{
                      padding: ".38rem .8rem .38rem 1.8rem", fontSize: ".78rem",
                      border: `1px solid ${T.border}`, borderRadius: 99,
                      outline: "none", fontFamily: "inherit", color: T.ink,
                      background: T.surface2, minWidth: 190,
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Timeline */}
          <Card style={{ padding: "1.5rem" }}>
            <SectionHeader
              title="Histórico Clínico"
              sub={`${filteredRecords.length} registro(s) · ordenado por ${sortDir === "desc" ? "mais recente" : "mais antigo"}`}
              icon="📋"
            />
            {loading ? (
              <div style={{ padding: "3rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: ".75rem" }}>
                <Spinner size={28} />
                <span style={{ fontSize: ".82rem", color: T.text3 }}>Carregando registros clínicos...</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <EmptyState icon="📋" title="Nenhum registro encontrado" sub="Os registros clínicos do paciente aparecem aqui conforme são criados." />
            ) : (
              <div>
                {filteredRecords.map((r, i) => (
                  <SoapRecord key={r.id || i} record={r} isLast={i === filteredRecords.length - 1} user={user} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Aba: Dados Clínicos */}
      {tab === "dados" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <Card style={{ padding: "1.25rem" }}>
            <SectionHeader title="Dados Pessoais" icon="👤" />
            <DataGrid items={[
              { label: "Nome completo", value: patient.name },
              { label: "Data de nascimento", value: `${fmtDate(patient.birthDate)}${age !== null ? ` (${age} anos)` : ""}` },
              { label: "Sexo", value: patient.sex === "F" ? "Feminino" : patient.sex === "M" ? "Masculino" : patient.sex || "—" },
              { label: "CPF", value: patient.cpf || "—" },
              { label: "CNS", value: patient.cns || "—" },
              { label: "RG", value: patient.rg || "—" },
              { label: "Telefone", value: patient.phone || "—" },
              { label: "E-mail", value: patient.email || "—" },
            ]} />
          </Card>
          <Card style={{ padding: "1.25rem" }}>
            <SectionHeader title="Endereço e Vinculação" icon="📍" />
            <DataGrid items={[
              { label: "Endereço", value: patient.address || "—" },
              { label: "Bairro", value: patient.neighborhood || "—" },
              { label: "Microárea", value: patient.microArea ? `Microárea ${patient.microArea}` : "—" },
              { label: "Categoria de cuidado", value: catLabel(patient.careCategory) },
              { label: "Status", value: patient.status === "risk" ? "⚠️ Em risco" : patient.status === "inactive" ? "Inativo" : "✅ Ativo" },
              { label: "Responsável (ACS)", value: patient.assignedAcsName || "—" },
            ]} />
          </Card>
          {(patient.allergies || patient.chronicConditions || patient.medications || patient.bloodType) && (
            <Card style={{ padding: "1.25rem", gridColumn: "1 / -1" }}>
              <SectionHeader title="Alertas Clínicos" icon="⚠️" />
              <DataGrid items={[
                { label: "Alergias", value: patient.allergies || "Nenhuma registrada" },
                { label: "Condições crônicas", value: patient.chronicConditions || "—" },
                { label: "Medicações em uso", value: patient.medications || "—" },
                { label: "Tipo sanguíneo", value: patient.bloodType || "—" },
                { label: "Observações", value: patient.observations || "—" },
              ]} />
            </Card>
          )}
        </div>
      )}

      {/* Aba: Auditoria */}
      {tab === "auditoria" && (
        <Card style={{ padding: "1.25rem" }}>
          <SectionHeader title="Registro de Acesso" icon="🔒"
            sub="Trilha de auditoria imutável · CFM 1638/2002 · LGPD Art. 37" />
          <AlertBanner type="info">
            Todos os acessos ao prontuário eletrônico são registrados de forma imutável conforme exigido pela <strong>Resolução CFM nº 1.638/2002</strong> e <strong>Lei nº 13.787/2018</strong>. O registro inclui identidade do profissional, data/hora, ação realizada e identificação do terminal.
          </AlertBanner>
          <div style={{ marginTop: "1rem", padding: ".85rem 1rem", background: T.surface2, borderRadius: T.r, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: ".78rem", fontWeight: 700, color: T.ink, marginBottom: ".6rem" }}>Acesso atual</div>
            <DataGrid items={[
              { label: "Profissional", value: user?.name || "—" },
              { label: "Perfil", value: roleLabel(user?.role) },
              { label: "Conselho profissional", value: user?.councilNumber ? `${user.role === "doctor" ? "CRM" : user.role === "dentist" ? "CRO" : "COREN"} ${user.councilNumber}/${user.councilUf}` : "N/A" },
              { label: "Data/hora de acesso", value: new Date().toLocaleString("pt-BR") },
              { label: "Paciente acessado", value: patient?.name },
              { label: "ID do paciente", value: patient?.id },
              { label: "Finalidade declarada", value: "Assistência direta ao paciente" },
              { label: "Base legal LGPD", value: "Art. 7º, III — execução de contrato; Art. 11, II, f — tutela da saúde" },
            ]} />
          </div>
        </Card>
      )}

      {/* Rodapé de auditoria */}
      <div style={{
        padding: ".65rem 1rem", borderRadius: T.r,
        background: T.ink, display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem",
      }}>
        <span style={{ fontSize: ".68rem", color: "#94a3b8" }}>
          🔒 Acesso registrado em <strong style={{ color: "#e2e8f0" }}>{new Date().toLocaleString("pt-BR")}</strong> por <strong style={{ color: "#e2e8f0" }}>{user?.name}</strong> ({roleLabel(user?.role)})
        </span>
        <span style={{ fontSize: ".65rem", color: "#64748b" }}>CFM 1638/2002 · Lei 13.787/2018 · LGPD · RBCE · PNAB 2.436/2017</span>
      </div>
    </div>
  );
}

function DataGrid({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          padding: ".5rem .75rem", borderRadius: 8, background: i % 2 === 0 ? T.surface2 : T.surface,
          border: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: ".75rem", color: T.text3, fontWeight: 600, minWidth: 120 }}>{item.label}</span>
          <span style={{ fontSize: ".78rem", color: T.ink, fontWeight: 500, textAlign: "right", maxWidth: "55%" }}>{item.value || "—"}</span>
        </div>
      ))}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   PÁGINA DE INSUMOS — Layout similar à Farmácia
════════════════════════════════════════════════════════════════════ */

const CATALOGO = [
  // Medicamentos Essenciais (RENAME 2023 / REMUNE)
  { id:"acido_folico",    nome:"Ácido Fólico 5mg",        categoria:"Medicamento", subcategoria:"Gestante/Puérpera", unidade:"cp",  qtdMax:30,  alerta:5,  anvisa:"RDC 18/2023" },
  { id:"sulfato_ferroso", nome:"Sulfato Ferroso 40mg",     categoria:"Medicamento", subcategoria:"Gestante/Puérpera", unidade:"cp",  qtdMax:60,  alerta:10, anvisa:"RDC 18/2023" },
  { id:"metformina",      nome:"Metformina 500mg",         categoria:"Medicamento", subcategoria:"Crônico",           unidade:"cp",  qtdMax:60,  alerta:10, anvisa:"RDC 18/2023" },
  { id:"losartana",       nome:"Losartana 50mg",           categoria:"Medicamento", subcategoria:"Crônico",           unidade:"cp",  qtdMax:30,  alerta:5,  anvisa:"RDC 18/2023" },
  { id:"atenolol",        nome:"Atenolol 25mg",            categoria:"Medicamento", subcategoria:"Crônico",           unidade:"cp",  qtdMax:30,  alerta:5,  anvisa:"RDC 18/2023" },
  { id:"omeprazol",       nome:"Omeprazol 20mg",           categoria:"Medicamento", subcategoria:"Geral",             unidade:"cp",  qtdMax:30,  alerta:5,  anvisa:"RDC 18/2023" },
  { id:"amoxicilina",     nome:"Amoxicilina 500mg",        categoria:"Medicamento", subcategoria:"Antibiótico",       unidade:"cp",  qtdMax:21,  alerta:5,  anvisa:"RDC 20/2011" },
  { id:"dipirona",        nome:"Dipirona 500mg",           categoria:"Medicamento", subcategoria:"Geral",             unidade:"cp",  qtdMax:30,  alerta:5,  anvisa:"RDC 18/2023" },
  { id:"vitamina_d",      nome:"Vitamina D 1000UI",        categoria:"Suplemento",  subcategoria:"Suplemento",        unidade:"cp",  qtdMax:30,  alerta:5,  anvisa:"RDC 18/2023" },
  // Insumos de Prevenção
  { id:"preservativo_m",  nome:"Preservativo Masculino",   categoria:"Prevenção",   subcategoria:"IST/HIV",           unidade:"un",  qtdMax:12,  alerta:20, anvisa:"—" },
  { id:"preservativo_f",  nome:"Preservativo Feminino",    categoria:"Prevenção",   subcategoria:"IST/HIV",           unidade:"un",  qtdMax:6,   alerta:10, anvisa:"—" },
  { id:"absorvente",      nome:"Absorvente Higiênico",     categoria:"Higiene",     subcategoria:"Saúde da Mulher",   unidade:"un",  qtdMax:10,  alerta:20, anvisa:"—" },
  // Material de Procedimento
  { id:"curativo_simples",nome:"Curativo Simples",         categoria:"Material",    subcategoria:"Procedimento",      unidade:"un",  qtdMax:5,   alerta:10, anvisa:"ANVISA" },
  { id:"luva_proc",       nome:"Luva Procedimento (par)",  categoria:"Material",    subcategoria:"EPI",               unidade:"par", qtdMax:10,  alerta:20, anvisa:"ANVISA" },
  { id:"seringa_3ml",     nome:"Seringa 3ml c/ agulha",   categoria:"Material",    subcategoria:"Imunização",        unidade:"un",  qtdMax:5,   alerta:15, anvisa:"ANVISA" },
  { id:"algodao",         nome:"Algodão (rolo 500g)",      categoria:"Material",    subcategoria:"Procedimento",      unidade:"rl",  qtdMax:2,   alerta:2,  anvisa:"ANVISA" },
];

const INS_STOCK_KEY = "sigus_insumos_stock_v3";
const INS_LOG_KEY   = "sigus_insumos_log_v3";

export function InsumoPageNew({ patients, user }) {
  const [tab, setTab] = useState("dispensar");
  const [stock, setStock] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INS_STOCK_KEY) || "{}"); } catch { return {}; }
  });
  const [log, setLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INS_LOG_KEY) || "[]"); } catch { return []; }
  });
  const [patSearch, setPatSearch] = useState("");
  const [selPat, setSelPat] = useState(null);
  const [showPatList, setShowPatList] = useState(false);
  const [itens, setItens] = useState({});
  const [catFilter, setCatFilter] = useState("Todas");
  const [stockSearch, setStockSearch] = useState("");
  const [histSearch, setHistSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [entradaModal, setEntradaModal] = useState(false);
  const [entradaItem, setEntradaItem] = useState(null);
  const [entradaQty, setEntradaQty] = useState("");
  const [entradaLote, setEntradaLote] = useState("");
  const [entradaVal, setEntradaVal] = useState("");
  const patRef = useRef(null);

  const canDispense = ["nurse_manager","pharmacy_tech","pharmacist","nursing_tech","doctor"].includes(user?.role);
  const canEntrada  = ["pharmacist","pharmacy_tech","nurse_manager"].includes(user?.role);

  function saveStock(s) { setStock(s); localStorage.setItem(INS_STOCK_KEY, JSON.stringify(s)); }
  function saveLog(l)   { setLog(l);   localStorage.setItem(INS_LOG_KEY, JSON.stringify(l)); }
  function getQty(id)   { return Number(stock[id] ?? 50); }
  function setItem(id, v) { setItens(s => ({ ...s, [id]: Math.max(0, Math.min(v, CATALOGO.find(c=>c.id===id)?.qtdMax||999)) })); }

  function showToast(msg, type="success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function dispense(e) {
    e.preventDefault();
    if (!selPat) return;
    const selected = Object.entries(itens).filter(([, v]) => v > 0);
    if (!selected.length) return;
    setBusy(true);
    await new Promise(r => setTimeout(r, 400));
    const newStock = { ...stock };
    selected.forEach(([id, qty]) => { newStock[id] = Math.max(0, getQty(id) - qty); });
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      tipo: "saida",
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      ts:   new Date().toISOString(),
      patientName: selPat.name, patientId: selPat.id,
      user: user?.name, userRole: user?.role,
      itens: selected.map(([id, qty]) => ({
        nome: CATALOGO.find(c => c.id === id)?.nome || id,
        id, qty, unidade: CATALOGO.find(c => c.id === id)?.unidade || "un",
      })),
    };
    saveStock(newStock);
    saveLog([entry, ...log].slice(0, 500));
    setItens({}); setSelPat(null); setPatSearch(""); setBusy(false);
    showToast(`Dispensação registrada para ${entry.patientName}`, "success");
  }

  function registrarEntrada() {
    if (!entradaItem || !entradaQty || Number(entradaQty) <= 0) return;
    const newStock = { ...stock, [entradaItem.id]: getQty(entradaItem.id) + Number(entradaQty) };
    const entry = {
      id: Date.now().toString(36),
      tipo: "entrada",
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      ts:   new Date().toISOString(),
      user: user?.name,
      lote: entradaLote, validade: entradaVal,
      itens: [{ nome: entradaItem.nome, id: entradaItem.id, qty: Number(entradaQty), unidade: entradaItem.unidade }],
    };
    saveStock(newStock);
    saveLog([entry, ...log].slice(0, 500));
    setEntradaModal(false); setEntradaItem(null); setEntradaQty(""); setEntradaLote(""); setEntradaVal("");
    showToast(`Entrada de ${Number(entradaQty)} ${entradaItem.unidade} de ${entradaItem.nome} registrada`, "success");
  }

  const filteredPats = useMemo(() =>
    patients.filter(p => (p.name||"").toLowerCase().includes(patSearch.toLowerCase())).slice(0,8),
    [patients, patSearch]
  );

  const categorias = ["Todas", ...new Set(CATALOGO.map(c => c.categoria))];
  const catalogoFiltrado = useMemo(() =>
    CATALOGO.filter(c => catFilter === "Todas" || c.categoria === catFilter),
    [catFilter]
  );

  const hoje = new Date().toISOString().slice(0,10);
  const dispensacoesHoje = log.filter(l => l.date === hoje && l.tipo === "saida").length;
  const entradasHoje     = log.filter(l => l.date === hoje && l.tipo === "entrada").length;
  const saldoBaixo       = CATALOGO.filter(c => getQty(c.id) <= c.alerta && getQty(c.id) > 0).length;
  const semEstoque       = CATALOGO.filter(c => getQty(c.id) === 0).length;

  const filteredStock = useMemo(() =>
    CATALOGO.filter(c => !stockSearch || c.nome.toLowerCase().includes(stockSearch.toLowerCase()) || c.categoria.toLowerCase().includes(stockSearch.toLowerCase())),
    [stockSearch]
  );

  const filteredLog = useMemo(() =>
    log.filter(l => !histSearch || (l.patientName||"").toLowerCase().includes(histSearch.toLowerCase()) || (l.user||"").toLowerCase().includes(histSearch.toLowerCase())),
    [log, histSearch]
  );

  return (
    <div style={{ padding: "1.5rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "1rem", right: "1.5rem", zIndex: 9999,
          padding: ".7rem 1.25rem", borderRadius: T.rMd, boxShadow: T.shadowLg,
          background: toast.type === "success" ? T.green : T.rose,
          color: "#fff", fontSize: ".82rem", fontWeight: 700,
          display: "flex", alignItems: "center", gap: ".5rem",
          animation: "slideIn .2s ease",
        }}>
          <style>{`@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
          {toast.type === "success" ? "✅" : "❌"} {toast.msg}
        </div>
      )}

      {/* Modal de Entrada de Estoque */}
      {entradaModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          onClick={() => setEntradaModal(false)}>
          <Card style={{ width: "100%", maxWidth: 440, padding: "1.75rem", boxShadow: T.shadowLg }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: T.ink }}>Registrar Entrada de Estoque</h3>
              <button onClick={() => setEntradaModal(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "1.2rem", color: T.text3 }}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".85rem" }}>
              <div>
                <label style={{ fontSize: ".78rem", fontWeight: 600, color: T.text2, display: "block", marginBottom: ".3rem" }}>Insumo *</label>
                <select value={entradaItem?.id || ""} onChange={e => setEntradaItem(CATALOGO.find(c => c.id === e.target.value) || null)}
                  style={{ width: "100%", padding: ".55rem .75rem", border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: ".82rem", fontFamily: "inherit", background: T.surface2 }}>
                  <option value="">Selecione o insumo...</option>
                  {CATALOGO.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.categoria})</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
                <div>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: T.text2, display: "block", marginBottom: ".3rem" }}>Quantidade *</label>
                  <input type="number" min="1" value={entradaQty} onChange={e => setEntradaQty(e.target.value)}
                    placeholder="0" style={{ width: "100%", boxSizing: "border-box", padding: ".55rem .75rem", border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: ".88rem", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: T.text2, display: "block", marginBottom: ".3rem" }}>Unidade</label>
                  <input value={entradaItem?.unidade || "—"} disabled
                    style={{ width: "100%", boxSizing: "border-box", padding: ".55rem .75rem", border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: ".88rem", fontFamily: "inherit", background: T.surface3, color: T.text3 }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
                <div>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: T.text2, display: "block", marginBottom: ".3rem" }}>Lote</label>
                  <input value={entradaLote} onChange={e => setEntradaLote(e.target.value)} placeholder="Ex: L2024001"
                    style={{ width: "100%", boxSizing: "border-box", padding: ".55rem .75rem", border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: ".82rem", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={{ fontSize: ".78rem", fontWeight: 600, color: T.text2, display: "block", marginBottom: ".3rem" }}>Validade</label>
                  <input type="date" value={entradaVal} onChange={e => setEntradaVal(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: ".55rem .75rem", border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: ".82rem", fontFamily: "inherit" }} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button onClick={() => setEntradaModal(false)} style={{ padding: ".55rem 1.1rem", borderRadius: T.r, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", fontSize: ".82rem", fontWeight: 600, color: T.text2 }}>
                Cancelar
              </button>
              <button onClick={registrarEntrada} disabled={!entradaItem || !entradaQty || Number(entradaQty) <= 0}
                style={{
                  padding: ".55rem 1.25rem", borderRadius: T.r, border: "none",
                  background: !entradaItem || !entradaQty ? T.surface3 : T.teal,
                  color: !entradaItem || !entradaQty ? T.text3 : "#fff",
                  cursor: "pointer", fontSize: ".82rem", fontWeight: 700, fontFamily: "inherit",
                }}>
                Confirmar Entrada
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: T.ink, letterSpacing: "-.01em" }}>
            Insumos e Dispensação
          </h1>
          <p style={{ margin: ".3rem 0 0", fontSize: ".82rem", color: T.text3 }}>
            Controle de estoque · RENAME · ANVISA RDC 20/2011 · DAF/MS
          </p>
        </div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          {canEntrada && (
            <button onClick={() => setEntradaModal(true)} style={{
              display: "flex", alignItems: "center", gap: ".4rem",
              padding: ".5rem 1.1rem", borderRadius: T.r, border: `1px solid ${T.teal}`,
              background: T.tealL, color: T.tealD, fontWeight: 700, fontSize: ".82rem",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              📥 Registrar Entrada
            </button>
          )}
        </div>
      </div>

      {/* Alertas de estoque */}
      {semEstoque > 0 && (
        <AlertBanner type="error">
          <strong>{semEstoque} item(ns) sem estoque.</strong> Solicite reposição imediata junto à central de abastecimento farmacêutico.
        </AlertBanner>
      )}
      {saldoBaixo > 0 && semEstoque === 0 && (
        <AlertBanner type="warning">
          <strong>{saldoBaixo} item(ns) com estoque abaixo do mínimo.</strong> Verifique a necessidade de reposição.
        </AlertBanner>
      )}

      {/* KPIs */}
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
        {[
          { label: "Dispensações hoje",   value: dispensacoesHoje, icon: "📤", color: T.indigo, bg: T.indigoL },
          { label: "Entradas hoje",       value: entradasHoje,     icon: "📥", color: T.teal,   bg: T.tealL   },
          { label: "Total dispensações",  value: log.filter(l=>l.tipo==="saida").length, icon: "📋", color: T.blue, bg: T.blueL },
          { label: "Sem estoque",         value: semEstoque,       icon: "🚨", color: semEstoque>0?T.rose:T.green, bg: semEstoque>0?T.roseL:T.greenL },
          { label: "Estoque baixo",       value: saldoBaixo,       icon: "⚡", color: saldoBaixo>0?T.amber:T.green, bg: saldoBaixo>0?T.amberL:T.greenL },
          { label: "Itens no catálogo",   value: CATALOGO.length,  icon: "📦", color: T.text2,  bg: T.surface3 },
        ].map(k => (
          <Card key={k.label} style={{ padding: ".85rem 1rem", flex: "1 1 120px", minWidth: 100 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".25rem", fontWeight: 500 }}>{k.label}</div>
              </div>
              <div style={{ fontSize: "1.2rem", background: k.bg, borderRadius: 8, padding: ".3rem .4rem", lineHeight: 1 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: `2px solid ${T.border}` }}>
        {[
          canDispense && { key: "dispensar", label: "Nova Dispensação", icon: "💊" },
          { key: "estoque", label: "Controle de Estoque", icon: "📦" },
          { key: "historico", label: "Histórico", icon: "📋" },
        ].filter(Boolean).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: ".55rem 1.2rem", fontSize: ".82rem", fontWeight: 600, border: "none",
            borderBottom: tab === t.key ? `2px solid ${T.teal}` : "2px solid transparent",
            marginBottom: "-2px",
            background: tab === t.key ? T.tealL : "none",
            color: tab === t.key ? T.tealD : T.text2,
            cursor: "pointer", display: "flex", alignItems: "center", gap: ".4rem",
            transition: "all .15s", fontFamily: "inherit",
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* === Tab: Dispensar === */}
      {tab === "dispensar" && canDispense && (
        <form onSubmit={dispense}>
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.25rem", alignItems: "flex-start" }}>

            {/* Painel: Paciente */}
            <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
              <Card style={{ padding: "1.1rem" }}>
                <SectionHeader title="Paciente" icon="👤" sub="Buscar por nome" />
                <div style={{ position: "relative" }} ref={patRef}>
                  <svg style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: T.text3 }} width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <input
                    value={patSearch}
                    onChange={e => { setPatSearch(e.target.value); setSelPat(null); setShowPatList(true); }}
                    onFocus={() => setShowPatList(true)}
                    placeholder="Buscar paciente..."
                    style={{ width: "100%", boxSizing: "border-box", padding: ".5rem .75rem .5rem 2.1rem", fontSize: ".82rem", border: `1px solid ${T.border}`, borderRadius: T.r, fontFamily: "inherit", outline: "none" }}
                  />
                </div>

                {/* Dropdown de resultados */}
                {!selPat && patSearch && showPatList && (
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: ".35rem", overflow: "hidden", boxShadow: T.shadowMd }}>
                    {filteredPats.length === 0
                      ? <div style={{ padding: ".75rem", fontSize: ".8rem", color: T.text3 }}>Nenhum paciente encontrado</div>
                      : filteredPats.map(p => (
                        <div key={p.id}
                          onClick={() => { setSelPat(p); setPatSearch(p.name); setShowPatList(false); }}
                          style={{ padding: ".6rem .85rem", cursor: "pointer", borderBottom: `1px solid ${T.border}`, background: T.surface, transition: "background .1s" }}
                          onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                          onMouseLeave={e => e.currentTarget.style.background = T.surface}
                        >
                          <div style={{ fontWeight: 600, fontSize: ".82rem", color: T.ink }}>{p.name}</div>
                          <div style={{ fontSize: ".7rem", color: T.text3 }}>{catLabel(p.careCategory)}</div>
                        </div>
                      ))
                    }
                  </div>
                )}

                {selPat && (
                  <div style={{ marginTop: ".5rem", padding: ".75rem", background: T.greenL, borderRadius: T.r, border: "1px solid #86efac" }}>
                    <div style={{ fontWeight: 700, color: T.green, fontSize: ".82rem" }}>✓ {selPat.name}</div>
                    <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".15rem" }}>{catLabel(selPat.careCategory)}</div>
                    <button type="button" onClick={() => { setSelPat(null); setPatSearch(""); }}
                      style={{ marginTop: ".4rem", fontSize: ".72rem", color: T.rose, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Trocar paciente
                    </button>
                  </div>
                )}
              </Card>

              {/* Resumo do carrinho */}
              {Object.entries(itens).filter(([,v])=>v>0).length > 0 && (
                <Card style={{ padding: "1.1rem", border: `1px solid ${T.teal}30` }}>
                  <SectionHeader title="Carrinho" icon="🛒"
                    sub={`${Object.entries(itens).filter(([,v])=>v>0).length} item(ns)`} />
                  {Object.entries(itens).filter(([,v])=>v>0).map(([id,qty]) => {
                    const ins = CATALOGO.find(c=>c.id===id);
                    return (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".35rem 0", borderBottom: `1px solid ${T.border}`, fontSize: ".78rem" }}>
                        <span style={{ color: T.ink, fontWeight: 500 }}>{ins?.nome}</span>
                        <span style={{ fontWeight: 700, color: T.tealD }}>{qty} {ins?.unidade}</span>
                      </div>
                    );
                  })}
                  <button type="submit" disabled={!selPat || busy}
                    style={{
                      width: "100%", marginTop: ".85rem",
                      padding: ".65rem", borderRadius: T.r, border: "none",
                      background: !selPat ? T.surface3 : T.teal,
                      color: !selPat ? T.text3 : "#fff",
                      fontWeight: 700, fontSize: ".85rem", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
                    }}>
                    {busy ? <><Spinner size={15} /> Registrando...</> : "✓ Confirmar Dispensação"}
                  </button>
                </Card>
              )}
            </div>

            {/* Painel: Catálogo de insumos */}
            <Card style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: ".5rem" }}>
                <SectionHeader title="Catálogo de Insumos" icon="📦" sub="RENAME / DAF-MS" />
                <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                  {categorias.map(c => (
                    <Pill key={c} label={c} active={catFilter===c} onClick={() => setCatFilter(c)} color={T.teal} />
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px,1fr))", gap: ".65rem" }}>
                {catalogoFiltrado.map(insumo => {
                  const qty = itens[insumo.id] || 0;
                  const est = getQty(insumo.id);
                  const semEst = est === 0;
                  const baixo  = est > 0 && est <= insumo.alerta;
                  const status = semEst ? "empty" : baixo ? "low" : "ok";
                  const statusColors = { empty: T.rose, low: T.amber, ok: T.green };

                  return (
                    <div key={insumo.id} style={{
                      padding: ".85rem 1rem", borderRadius: T.r,
                      border: `1.5px solid ${qty>0 ? T.teal : semEst ? "#fca5a5" : T.border}`,
                      background: qty>0 ? T.tealL : semEst ? T.roseL : T.surface,
                      opacity: semEst ? .7 : 1, transition: "all .15s",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".5rem" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: ".82rem", fontWeight: 700, color: T.ink, lineHeight: 1.3 }}>{insumo.nome}</div>
                          <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".2rem" }}>{insumo.categoria} · {insumo.subcategoria}</div>
                          {insumo.anvisa !== "—" && <div style={{ fontSize: ".65rem", color: T.indigo, marginTop: ".1rem" }}>{insumo.anvisa}</div>}
                        </div>
                      </div>

                      {/* Estoque */}
                      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".5rem" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColors[status], flexShrink: 0 }} />
                        <span style={{ fontSize: ".72rem", color: statusColors[status], fontWeight: 600 }}>
                          {semEst ? "Sem estoque" : baixo ? `Baixo: ${est} ${insumo.unidade}` : `${est} ${insumo.unidade}`}
                        </span>
                        {!semEst && (
                          <div style={{ flex: 1, height: 3, borderRadius: 99, background: T.surface3 }}>
                            <div style={{ height: "100%", borderRadius: 99, background: statusColors[status], width: `${Math.min(100,(est/60)*100)}%`, transition: "width .3s" }} />
                          </div>
                        )}
                      </div>

                      {/* Controle de quantidade */}
                      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                        <button type="button" disabled={semEst||qty<=0} onClick={() => setItem(insumo.id, qty-1)}
                          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, cursor: semEst||qty<=0?"not-allowed":"pointer", fontWeight: 800, fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, flexShrink: 0 }}>−</button>
                        <span style={{ minWidth: 32, textAlign: "center", fontWeight: 800, fontSize: ".95rem", color: qty>0?T.tealD:T.text3 }}>{qty}</span>
                        <button type="button" disabled={semEst||qty>=insumo.qtdMax||qty>=est} onClick={() => setItem(insumo.id, qty+1)}
                          style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, cursor: semEst||qty>=insumo.qtdMax?"not-allowed":"pointer", fontWeight: 800, fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", color: T.ink2, flexShrink: 0 }}>+</button>
                        <span style={{ fontSize: ".72rem", color: T.text3 }}>{insumo.unidade} · máx {insumo.qtdMax}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Botão de dispensar (mobile / sem paciente selecionado) */}
              {!selPat && (
                <div style={{ marginTop: "1rem", padding: ".65rem 1rem", background: T.amberL, borderRadius: T.r, border: `1px solid #fcd34d`, fontSize: ".78rem", color: T.amber, fontWeight: 600 }}>
                  ⚠️ Selecione um paciente no painel à esquerda antes de confirmar a dispensação.
                </div>
              )}
            </Card>
          </div>
        </form>
      )}

      {/* === Tab: Estoque === */}
      {tab === "estoque" && (
        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: ".5rem" }}>
            <SectionHeader title="Controle de Estoque" icon="📦" sub="Baseado em RENAME / DAF-MS" />
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: ".65rem", top: "50%", transform: "translateY(-50%)", color: T.text3, pointerEvents: "none" }} width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Filtrar insumos..."
                style={{ padding: ".38rem .75rem .38rem 1.85rem", fontSize: ".78rem", border: `1px solid ${T.border}`, borderRadius: T.r, outline: "none", fontFamily: "inherit", minWidth: 200, background: T.surface2 }} />
            </div>
          </div>

          {/* Tabela de estoque */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
              <thead>
                <tr style={{ background: T.surface2 }}>
                  {["Insumo", "Categoria", "Estoque atual", "Mín.", "Status", "Regulação"].map(h => (
                    <th key={h} style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", fontSize: ".75rem" }}>{h}</th>
                  ))}
                  {canEntrada && <th style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}` }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filteredStock.map((ins, i) => {
                  const qty = getQty(ins.id);
                  const semEst = qty === 0;
                  const baixo  = qty > 0 && qty <= ins.alerta;
                  const statusLabel = semEst ? "Sem estoque" : baixo ? "Estoque baixo" : "Normal";
                  const statusColor = semEst ? T.rose : baixo ? T.amber : T.green;
                  const statusBg    = semEst ? T.roseL : baixo ? T.amberL : T.greenL;

                  return (
                    <tr key={ins.id} style={{ background: i % 2 === 0 ? T.surface : T.surface2, borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: ".65rem .85rem", fontWeight: 600, color: T.ink }}>{ins.nome}</td>
                      <td style={{ padding: ".65rem .85rem", color: T.text2 }}>
                        <Badge label={ins.categoria} color={T.indigo} bg={T.indigoL} size="sm" />
                      </td>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                          <span style={{ fontWeight: 800, color: statusColor, fontSize: ".9rem" }}>{qty}</span>
                          <span style={{ color: T.text3, fontSize: ".75rem" }}>{ins.unidade}</span>
                          <div style={{ width: 60, height: 5, borderRadius: 99, background: T.surface4 }}>
                            <div style={{ height: "100%", borderRadius: 99, background: statusColor, width: `${Math.min(100,(qty/60)*100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: ".65rem .85rem", color: T.text3, fontVariantNumeric: "tabular-nums" }}>{ins.alerta} {ins.unidade}</td>
                      <td style={{ padding: ".65rem .85rem" }}>
                        <Badge label={statusLabel} color={statusColor} bg={statusBg} size="sm" />
                      </td>
                      <td style={{ padding: ".65rem .85rem", fontSize: ".72rem", color: T.text3 }}>{ins.anvisa}</td>
                      {canEntrada && (
                        <td style={{ padding: ".65rem .85rem" }}>
                          <button onClick={() => { setEntradaItem(ins); setEntradaModal(true); }} style={{
                            padding: ".3rem .65rem", borderRadius: 6, border: `1px solid ${T.teal}`,
                            background: T.tealL, color: T.tealD, cursor: "pointer", fontSize: ".72rem", fontWeight: 700,
                          }}>
                            + Entrada
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* === Tab: Histórico === */}
      {tab === "historico" && (
        <Card style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: ".5rem" }}>
            <SectionHeader title="Histórico de Movimentações" icon="📋" sub={`${filteredLog.length} registro(s)`} />
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: ".65rem", top: "50%", transform: "translateY(-50%)", color: T.text3, pointerEvents: "none" }} width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="Filtrar histórico..."
                style={{ padding: ".38rem .75rem .38rem 1.85rem", fontSize: ".78rem", border: `1px solid ${T.border}`, borderRadius: T.r, outline: "none", fontFamily: "inherit", minWidth: 220, background: T.surface2 }} />
            </div>
          </div>

          {filteredLog.length === 0
            ? <EmptyState icon="📋" title="Nenhuma movimentação registrada" sub="As entradas e saídas de insumos aparecerão aqui." />
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                {filteredLog.slice(0, 100).map(entry => (
                  <div key={entry.id} style={{
                    padding: ".85rem 1rem", border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${entry.tipo === "entrada" ? T.green : T.indigo}`,
                    borderRadius: "0 " + T.r + " " + T.r + " 0",
                    background: T.surface,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: ".25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                        <Badge
                          label={entry.tipo === "entrada" ? "📥 Entrada" : "📤 Saída"}
                          color={entry.tipo === "entrada" ? T.green : T.indigo}
                          bg={entry.tipo === "entrada" ? T.greenL : T.indigoL}
                          size="sm"
                        />
                        {entry.patientName && (
                          <span style={{ fontWeight: 700, fontSize: ".85rem", color: T.ink }}>{entry.patientName}</span>
                        )}
                        <span style={{ fontSize: ".75rem", color: T.text3 }}>por <strong>{entry.user}</strong></span>
                      </div>
                      <span style={{ fontSize: ".72rem", color: T.text3, fontVariantNumeric: "tabular-nums" }}>
                        {fmtDate(entry.date)} {entry.time}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: ".35rem", marginTop: ".45rem", flexWrap: "wrap" }}>
                      {entry.itens?.map((it, i) => (
                        <Badge key={i} label={`${it.nome}: ${it.qty} ${it.unidade}`} color={entry.tipo==="entrada"?T.tealD:T.indigoD} bg={entry.tipo==="entrada"?T.tealL:T.indigoL} size="sm" />
                      ))}
                    </div>
                    {entry.lote && <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".3rem" }}>Lote: {entry.lote} · Validade: {fmtDate(entry.validade)}</div>}
                  </div>
                ))}
              </div>
            )
          }
        </Card>
      )}

      {/* Rodapé */}
      <div style={{ fontSize: ".7rem", color: T.text3, textAlign: "center" }}>
        RENAME 2023 · ANVISA RDC 20/2011 · DAF/MS · Portaria GM/MS 3.916/1998 · PNAF
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   GESTÃO À VISTA — Dashboard Gerencial Profissional
════════════════════════════════════════════════════════════════════ */

function MiniBarChart({ data, color, height = 40 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value}`} style={{
          flex: 1, borderRadius: "3px 3px 0 0",
          background: color,
          height: `${Math.max(4, (d.value / max) * height)}px`,
          transition: "height .4s ease",
          cursor: "default",
          opacity: i === data.length - 1 ? 1 : 0.5 + (i / data.length) * 0.5,
        }} />
      ))}
    </div>
  );
}

function DonutChart({ segments, size = 80 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return <div style={{ width: size, height: size, borderRadius: "50%", background: T.surface3 }} />;

  let offset = 0;
  const r = 28, cx = size/2, cy = size/2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dashArray = `${pct * circumference} ${circumference}`;
        const rotation = offset * 360 / total - 90;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="12"
            strokeDasharray={dashArray}
            strokeDashoffset="0"
            transform={`rotate(${rotation} ${cx} ${cy})`}
            style={{ transition: "all .5s ease" }}
          />
        );
        offset += seg.value;
        return el;
      })}
      <circle cx={cx} cy={cy} r={22} fill="white"/>
      <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle"
        fontSize="10" fontWeight="800" fill={T.ink}>
        {total}
      </text>
    </svg>
  );
}

function DashKpi({ label, value, sub, trend, icon, color, bg, size = "normal", sparkData }) {
  const trendColor = trend > 0 ? T.green : trend < 0 ? T.rose : T.text3;
  const trendIcon  = trend > 0 ? "▲" : trend < 0 ? "▼" : "—";
  const isLarge    = size === "large";

  return (
    <Card style={{ padding: isLarge ? "1.35rem 1.5rem" : "1rem 1.15rem", position: "relative", overflow: "hidden" }}>
      {/* Fundo decorativo */}
      <div style={{
        position: "absolute", top: "-8px", right: "-8px",
        width: 60, height: 60, borderRadius: "50%",
        background: (color || T.indigo) + "12",
      }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: ".75rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: isLarge ? "2.2rem" : "1.75rem", fontWeight: 900, color: color || T.ink, lineHeight: 1, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </div>
          <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".3rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
            {label}
          </div>
          {sub && <div style={{ fontSize: ".7rem", color: T.text3, marginTop: ".15rem" }}>{sub}</div>}
          {trend !== undefined && (
            <div style={{ fontSize: ".7rem", color: trendColor, marginTop: ".3rem", fontWeight: 700, display: "flex", alignItems: "center", gap: ".2rem" }}>
              <span>{trendIcon}</span>
              <span>{Math.abs(trend)}% vs. mês anterior</span>
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: isLarge ? "1.75rem" : "1.35rem", background: bg || T.surface3, borderRadius: 10, padding: ".4rem .5rem", lineHeight: 1 }}>
            {icon}
          </div>
        </div>
      </div>
      {sparkData && (
        <div style={{ marginTop: ".65rem" }}>
          <MiniBarChart data={sparkData} color={color || T.indigo} height={30} />
        </div>
      )}
    </Card>
  );
}

function ProgressBar({ label, value, max, color, showPct = true }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: ".75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".3rem" }}>
        <span style={{ fontSize: ".78rem", fontWeight: 500, color: T.ink2 }}>{label}</span>
        <span style={{ fontSize: ".75rem", color: T.text3, fontVariantNumeric: "tabular-nums" }}>
          {showPct ? `${value} (${pct.toFixed(0)}%)` : value}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: T.surface3 }}>
        <div style={{ height: "100%", borderRadius: 99, background: color || T.indigo, width: `${pct}%`, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

export function GestorPageNew({ patients, users, templates, protocolByPatient }) {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("month");

  /* ── Métricas computadas ── */
  const total = patients.length;

  const byStatus = useMemo(() => {
    const m = { active: 0, inactive: 0, risk: 0, other: 0 };
    patients.forEach(p => {
      if      (p.status === "active")   m.active++;
      else if (p.status === "inactive") m.inactive++;
      else if (p.status === "risk")     m.risk++;
      else                               m.other++;
    });
    return m;
  }, [patients]);

  const byCategory = useMemo(() => {
    const m = {};
    patients.forEach(p => {
      const normalized = normalizeCareCategory(p.careCategory);
      m[normalized] = (m[normalized] || 0) + 1;
    });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  }, [patients]);

  const byMicroArea = useMemo(() => {
    const m = {};
    patients.forEach(p => { if (p.microArea) m[p.microArea] = (m[p.microArea]||0)+1; });
    return Object.entries(m).sort((a,b)=>Number(a[0])-Number(b[0]));
  }, [patients]);

  const byAcs = useMemo(() => {
    const m = {};
    patients.forEach(p => {
      const acs = users.find(u => u.id === p.assignedAcsId);
      const name = acs?.name || "Sem ACS";
      if (!m[name]) m[name] = { total:0, active:0, risk:0, id: acs?.id };
      m[name].total++;
      if (p.status === "active" || !p.status) m[name].active++;
      if (p.status === "risk") m[name].risk++;
    });
    return Object.entries(m).map(([name, d]) => ({ name, ...d })).sort((a,b)=>b.total-a.total);
  }, [patients, users]);

  const byRole = useMemo(() => {
    const m = {};
    users.forEach(u => { m[u.role] = (m[u.role]||0)+1; });
    return Object.entries(m);
  }, [users]);

  // Dados de qualidade
  const withPhone   = patients.filter(p=>p.phone).length;
  const withCpf     = patients.filter(p=>p.cpf).length;
  const withAddress = patients.filter(p=>p.address).length;
  const withCns     = patients.filter(p=>p.cns).length;
  const withAcs     = patients.filter(p=>p.assignedAcsId).length;
  const incomplete  = patients.filter(p=>p.incompleteProfile).length;
  const dataScore   = total ? Math.round(((withPhone+withCpf+withAddress+withCns+withAcs)/(total*5))*100) : 0;
  const missingIdentification = patients.filter(p => !p.cpf || !p.cns).length;
  const withoutTeamReference = patients.filter(p => !p.microArea || !p.assignedAcsId).length;
  const legacyCategoryNormalizedCount = patients.filter(p => normalizeCareCategory(p.careCategory) !== String(p.careCategory || "").toLowerCase()).length;

  const protocolOverview = useMemo(() => {
    let withSummary = 0;
    let patientsWithPending = 0;
    let totalPending = 0;
    const ranked = [];
    patients.forEach((p) => {
      const summary = protocolByPatient?.[p.id];
      if (!summary) return;
      withSummary++;
      const pendingVisits = Number(summary?.pending?.visits || 0);
      const pendingConsultations = Number(summary?.pending?.consultations || 0);
      const pendingVaccines = Number(summary?.pending?.vaccines || 0);
      const pending = pendingVisits + pendingConsultations + pendingVaccines;
      if (pending > 0) {
        patientsWithPending++;
        totalPending += pending;
        ranked.push({
          id: p.id,
          name: p.name,
          risk: p.status === "risk" ? 2 : 0,
          pending,
          pendingVisits,
          pendingConsultations,
          pendingVaccines,
        });
      }
    });
    ranked.sort((a, b) => (b.risk - a.risk) || (b.pending - a.pending) || a.name.localeCompare(b.name));
    return {
      withSummary,
      withoutSummary: Math.max(0, total - withSummary),
      patientsWithPending,
      totalPending,
      topPending: ranked.slice(0, 8),
    };
  }, [patients, protocolByPatient, total]);

  const complianceScore = total
    ? Math.max(0, Math.min(100, Math.round(
      (
        ((total - incomplete) / total) * 0.30 +
        ((total - missingIdentification) / total) * 0.30 +
        ((total - withoutTeamReference) / total) * 0.20 +
        ((total - protocolOverview.patientsWithPending) / total) * 0.20
      ) * 100
    )))
    : 100;

  // Metas PNAB / pactuação
  const metaCobertura   = 3500;
  const metaVulneraveis = Math.round(total * 0.2);

  // Simular novos cadastros no mês (criados no mês atual)
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const newThisMonth = patients.filter(p=>p.createdAt && new Date(p.createdAt)>=monthStart).length;

  const acsUsers = users.filter(u=>u.role==="acs");
  const docUsers = users.filter(u=>["doctor","dentist"].includes(u.role));

  // Sparkline simulada (últimos 7 meses com base nos dados reais)
  const sparkPatients = Array.from({length:7},(_,i)=>({ label:`M${i+1}`, value: Math.max(0,total-Math.round(Math.random()*15)+(i*3)) }));

  const TABS = [
    { key:"overview",      label:"Visão Geral",          icon:"📊" },
    { key:"equipe",        label:"Equipe & Cobertura",   icon:"👥" },
    { key:"qualidade",     label:"Qualidade dos Dados",  icon:"✅" },
    { key:"conformidade",  label:"Conformidade",         icon:"🛡️" },
    { key:"metas",         label:"Metas e Indicadores",  icon:"🎯" },
  ];

  const scoreColor = dataScore>=80?T.green:dataScore>=60?T.amber:T.rose;
  const coberturaColor = (total/metaCobertura)>=0.8?T.green:(total/metaCobertura)>=0.5?T.amber:T.rose;

  return (
    <div style={{ background: T.surface2, minHeight: "100vh" }}>
      <div style={{ padding: "1.75rem 2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Header do Dashboard */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexWrap: "wrap", gap: "1rem",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: T.indigo,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem",
              }}>📊</div>
              <div>
                <h1 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 900, color: T.ink, letterSpacing: "-.02em" }}>
                  Gestão à Vista
                </h1>
                <p style={{ margin: ".15rem 0 0", fontSize: ".78rem", color: T.text3 }}>
                  Painel gerencial · UBS · PNAB 2.436/2017
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: ".65rem", flexWrap: "wrap" }}>
            {/* Status geral */}
            <div style={{
              display: "flex", alignItems: "center", gap: ".5rem",
              padding: ".45rem .85rem", borderRadius: 99,
              background: "#f0fdf4", border: "1px solid #86efac",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, animation: "pulse 2s infinite" }} />
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
              <span style={{ fontSize: ".75rem", fontWeight: 700, color: T.green }}>Sistema Operacional</span>
            </div>
            <div style={{ fontSize: ".72rem", color: T.text3 }}>
              Atualizado em {new Date().toLocaleString("pt-BR")}
            </div>
          </div>
        </div>

        {/* Barra de Alertas */}
        {(byStatus.risk > 0 || incomplete > 0 || protocolOverview.patientsWithPending > 0 || missingIdentification > 0) && (
          <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap" }}>
            {byStatus.risk > 0 && (
              <AlertBanner type="warning">
                <strong>{byStatus.risk} paciente(s) em situação de risco</strong> precisam de atenção prioritária da equipe.
              </AlertBanner>
            )}
            {incomplete > 0 && (
              <AlertBanner type="info">
                <strong>{incomplete} cadastro(s) incompletos</strong> afetam a qualidade dos dados. Priorize a completude.
              </AlertBanner>
            )}
            {protocolOverview.patientsWithPending > 0 && (
              <AlertBanner type="warning">
                <strong>{protocolOverview.patientsWithPending} paciente(s) com protocolo pendente</strong> ({protocolOverview.totalPending} pendência(s) total).
              </AlertBanner>
            )}
            {missingIdentification > 0 && (
              <AlertBanner type="error">
                <strong>{missingIdentification} paciente(s) sem CPF/CNS completo</strong>. Corrija para rastreabilidade e conformidade regulatória.
              </AlertBanner>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0", borderBottom: `2px solid ${T.border}`, background: T.surface, borderRadius: `${T.rMd} ${T.rMd} 0 0`, padding: "0 .25rem" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: ".65rem 1.25rem", fontSize: ".82rem", fontWeight: 600,
              border: "none", background: "none",
              borderBottom: tab===t.key ? `3px solid ${T.indigo}` : "3px solid transparent",
              marginBottom: "-2px",
              color: tab===t.key ? T.indigo : T.text2,
              cursor: "pointer", display: "flex", alignItems: "center", gap: ".4rem",
              transition: "all .15s", fontFamily: "inherit",
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            {/* KPIs principais — Linha 1 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: ".85rem" }}>
              <DashKpi label="Total de Pacientes" value={total} icon="👥" color={T.indigo} bg={T.indigoL}
                sub="Carteira ativa da UBS" trend={newThisMonth>0?8:0}
                sparkData={sparkPatients} />
              <DashKpi label="Pacientes Ativos"   value={byStatus.active||0} icon="✅" color={T.green} bg={T.greenL}
                sub={`${total?Math.round(((byStatus.active||0)/total)*100):0}% do total`} />
              <DashKpi label="Em Situação de Risco" value={byStatus.risk||0} icon="⚠️" color={T.amber} bg={T.amberL}
                sub="Requer atenção prioritária" />
              <DashKpi label="Inativos" value={byStatus.inactive||0} icon="💤" color={T.text3} bg={T.surface3}
                sub="Sem contato recente" />
              <DashKpi label="Novos este mês" value={newThisMonth} icon="🆕" color={T.blue} bg={T.blueL}
                sub="Cadastros do mês atual" />
              <DashKpi label="Score de Dados" value={`${dataScore}%`} icon="🏆" color={scoreColor} bg={scoreColor+"18"}
                sub="Qualidade dos cadastros" />
              <DashKpi label="Score de Conformidade" value={`${complianceScore}%`} icon="🛡️" color={complianceScore >= 80 ? T.green : complianceScore >= 60 ? T.amber : T.rose} bg={T.surface3}
                sub="LGPD · CFM · Lei 13.787" />
              <DashKpi label="Pendências de Protocolo" value={protocolOverview.totalPending} icon="📌" color={protocolOverview.totalPending > 0 ? T.amber : T.green} bg={protocolOverview.totalPending > 0 ? T.amberL : T.greenL}
                sub={`${protocolOverview.patientsWithPending} paciente(s)`} />
            </div>

            {/* Linha 2: Distribuição por categoria + Microárea */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <Card style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <SectionHeader title="Distribuição por Programa" icon="📋" sub={`${byCategory.length} categoria(s)`} />
                  <DonutChart segments={byCategory.map(([cat,v])=>({ value:v, color:catColor(cat) }))} size={64} />
                </div>
                {byCategory.map(([cat, count]) => (
                  <ProgressBar key={cat} label={catLabel(cat)} value={count} max={total} color={catColor(cat)} />
                ))}
              </Card>

              <Card style={{ padding: "1.25rem" }}>
                <SectionHeader title="Distribuição por Microárea" icon="📍" sub="Densidade populacional" />
                {byMicroArea.length === 0
                  ? <EmptyState icon="📍" title="Sem dados de microárea" sub="Configure as microáreas nos cadastros." />
                  : byMicroArea.map(([area, count]) => (
                    <ProgressBar key={area} label={`Microárea ${area}`} value={count} max={total} color={T.blue} />
                  ))
                }
              </Card>
            </div>

            {/* Linha 3: Equipe resumida + Status */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <Card style={{ padding: "1.25rem" }}>
                <SectionHeader title="Composição da Equipe" icon="👩‍⚕️" />
                {byRole.map(([role, count]) => (
                  <div key={role} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".45rem 0", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: ".8rem", color: T.text2, fontWeight: 500 }}>{roleLabel(role)}</span>
                    <Badge label={count} color={T.indigo} bg={T.indigoL} size="sm" />
                  </div>
                ))}
                <div style={{ marginTop: ".75rem", padding: ".6rem .85rem", background: T.indigoL, borderRadius: T.r }}>
                  <div style={{ fontSize: ".72rem", color: T.indigoD, fontWeight: 600 }}>Total de profissionais</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: T.indigo }}>{users.length}</div>
                </div>
              </Card>

              <Card style={{ padding: "1.25rem" }}>
                <SectionHeader title="Status dos Pacientes" icon="📊" />
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
                  <DonutChart
                    segments={[
                      { value: byStatus.active||0,   color: T.green  },
                      { value: byStatus.risk||0,     color: T.amber  },
                      { value: byStatus.inactive||0, color: T.text3  },
                    ]}
                    size={90}
                  />
                </div>
                {[
                  { label: "Ativos",   value: byStatus.active||0,   color: T.green },
                  { label: "Em Risco", value: byStatus.risk||0,     color: T.amber },
                  { label: "Inativos", value: byStatus.inactive||0, color: T.text3 },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".45rem" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: ".78rem", color: T.text2, flex: 1 }}>{s.label}</span>
                    <span style={{ fontWeight: 700, fontSize: ".85rem", color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </Card>

              <Card style={{ padding: "1.25rem" }}>
                <SectionHeader title="Cobertura Territorial" icon="🗺️" />
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: "1.8rem", fontWeight: 900, color: coberturaColor, lineHeight: 1 }}>
                    {total.toLocaleString("pt-BR")}
                  </div>
                  <div style={{ fontSize: ".72rem", color: T.text3, marginTop: ".2rem" }}>de {metaCobertura.toLocaleString("pt-BR")} (meta PNAB)</div>
                  <div style={{ marginTop: ".6rem", height: 8, borderRadius: 99, background: T.surface3 }}>
                    <div style={{ height: "100%", borderRadius: 99, background: coberturaColor, width: `${Math.min(100,(total/metaCobertura)*100)}%`, transition: "width .5s" }} />
                  </div>
                  <div style={{ fontSize: ".72rem", color: coberturaColor, fontWeight: 600, marginTop: ".3rem" }}>
                    {((total/metaCobertura)*100).toFixed(1)}% de cobertura
                  </div>
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <div style={{ flex: 1, padding: ".6rem .75rem", background: T.greenL, borderRadius: T.r, textAlign: "center" }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: T.green }}>{acsUsers.length}</div>
                    <div style={{ fontSize: ".65rem", color: T.tealD, fontWeight: 600 }}>ACS</div>
                  </div>
                  <div style={{ flex: 1, padding: ".6rem .75rem", background: T.blueL, borderRadius: T.r, textAlign: "center" }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: T.blue }}>{docUsers.length}</div>
                    <div style={{ fontSize: ".65rem", color: T.blue, fontWeight: 600 }}>Médicos</div>
                  </div>
                  <div style={{ flex: 1, padding: ".6rem .75rem", background: T.indigoL, borderRadius: T.r, textAlign: "center" }}>
                    <div style={{ fontSize: "1.2rem", fontWeight: 800, color: T.indigo }}>{templates.length}</div>
                    <div style={{ fontSize: ".65rem", color: T.indigo, fontWeight: 600 }}>Protocolos</div>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ── EQUIPE & COBERTURA ── */}
        {tab === "equipe" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: ".75rem" }}>
              <DashKpi label="Total Profissionais" value={users.length} icon="👩‍⚕️" color={T.indigo} bg={T.indigoL} />
              <DashKpi label="Agentes Comunitários" value={acsUsers.length} icon="🏃" color={T.teal} bg={T.tealL} sub="Cobertura domiciliar" />
              <DashKpi label="Médicos / Dentistas" value={docUsers.length} icon="👨‍⚕️" color={T.blue} bg={T.blueL} />
              <DashKpi label="Pac. por ACS (média)" value={acsUsers.length>0?Math.round(total/acsUsers.length):0} icon="📋" color={T.amber} bg={T.amberL} sub="Meta PNAB: ≤750" />
            </div>

            <Card style={{ padding: "1.25rem" }}>
              <SectionHeader title="Carteira por Agente Comunitário de Saúde" icon="🏃"
                sub={`${acsUsers.length} ACS · ${total} pacientes vinculados`} />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
                  <thead>
                    <tr style={{ background: T.surface2 }}>
                      {["ACS", "Pacientes", "Ativos", "Em Risco", "% Ativo", "Carga"].map(h => (
                        <th key={h} style={{ padding: ".65rem .9rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", fontSize: ".75rem" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byAcs.map((row, i) => {
                      const pctActive = row.total ? (row.active / row.total) * 100 : 0;
                      const cargaColor = row.total > 750 ? T.rose : row.total > 500 ? T.amber : T.green;
                      return (
                        <tr key={row.name} style={{ background: i%2===0?T.surface:T.surface2, transition: "background .1s" }}
                          onMouseEnter={e=>e.currentTarget.style.background=T.blueL+"40"}
                          onMouseLeave={e=>e.currentTarget.style.background=i%2===0?T.surface:T.surface2}>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.tealL, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem", fontWeight: 800, color: T.tealD, flexShrink: 0 }}>
                                {initials(row.name)}
                              </div>
                              <span style={{ fontWeight: 600, color: T.ink }}>{row.name}</span>
                            </div>
                          </td>
                          <td style={{ padding: ".65rem .9rem", fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{row.total}</td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <Badge label={row.active} color={T.green} bg={T.greenL} size="sm" />
                          </td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <Badge label={row.risk} color={row.risk>0?T.amber:T.text3} bg={row.risk>0?T.amberL:T.surface3} size="sm" />
                          </td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                              <div style={{ width: 50, height: 5, borderRadius: 99, background: T.surface3 }}>
                                <div style={{ height: "100%", borderRadius: 99, background: T.green, width: `${pctActive}%` }} />
                              </div>
                              <span style={{ fontSize: ".75rem", color: T.text3, fontVariantNumeric: "tabular-nums" }}>{pctActive.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <Badge label={row.total>750?"Sobrecarga":row.total>500?"Alta":"Normal"} color={cargaColor} bg={cargaColor+"15"} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {byAcs.length === 0 && <EmptyState icon="🏃" title="Nenhum ACS cadastrado" sub="Cadastre agentes comunitários para ver a distribuição." />}
            </Card>

            <Card style={{ padding: "1.25rem" }}>
              <SectionHeader title="Composição da Equipe por Perfil" icon="👥" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: ".65rem" }}>
                {byRole.map(([role, count]) => (
                  <div key={role} style={{ padding: "1rem", border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface }}>
                    <div style={{ fontSize: "1.6rem", fontWeight: 900, color: T.indigo }}>{count}</div>
                    <div style={{ fontSize: ".82rem", fontWeight: 600, color: T.ink, marginTop: ".15rem" }}>{roleLabel(role)}</div>
                    <div style={{ marginTop: ".5rem", height: 4, borderRadius: 99, background: T.surface3 }}>
                      <div style={{ height: "100%", borderRadius: 99, background: T.indigo, width: `${(count/users.length)*100}%` }} />
                    </div>
                    <div style={{ fontSize: ".7rem", color: T.text3, marginTop: ".2rem" }}>{((count/users.length)*100).toFixed(0)}% da equipe</div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* ── QUALIDADE DOS DADOS ── */}
        {tab === "qualidade" && (
          <>
            {/* Score global */}
            <Card style={{
              padding: "1.5rem", background: `linear-gradient(135deg, ${scoreColor}12 0%, white 100%)`,
              border: `1px solid ${scoreColor}30`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: `conic-gradient(${scoreColor} ${dataScore*3.6}deg, ${T.surface3} 0deg)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, position: "relative",
                }}>
                  <div style={{ width: 62, height: 62, borderRadius: "50%", background: T.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{dataScore}%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: T.ink }}>
                    Score de Qualidade dos Dados
                  </div>
                  <div style={{ fontSize: ".82rem", color: T.text3, marginTop: ".25rem" }}>
                    {dataScore >= 80 ? "✅ Excelente — dados bem completados." :
                     dataScore >= 60 ? "⚡ Bom — há espaço para melhoria." :
                     "⚠️ Atenção — cadastros precisam ser completados."}
                  </div>
                  <div style={{ display: "flex", gap: ".5rem", marginTop: ".5rem" }}>
                    <Badge label={`${total} pacientes`} color={T.indigo} bg={T.indigoL} size="md" />
                    <Badge label={`${incomplete} incompletos`} color={incomplete>0?T.amber:T.green} bg={incomplete>0?T.amberL:T.greenL} size="md" />
                  </div>
                </div>
              </div>
            </Card>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <Card style={{ padding: "1.25rem" }}>
                <SectionHeader title="Completude por Campo" icon="📝" sub="% de cadastros com o campo preenchido" />
                {[
                  { label: "Telefone",         value: withPhone,   color: T.teal    },
                  { label: "CPF",              value: withCpf,     color: T.blue    },
                  { label: "Endereço",         value: withAddress, color: T.indigo  },
                  { label: "CNS (Cart. SUS)",  value: withCns,     color: T.purple  },
                  { label: "ACS Responsável",  value: withAcs,     color: T.green   },
                ].map(f => <ProgressBar key={f.label} label={f.label} value={f.value} max={total} color={f.color} />)}
              </Card>

              <Card style={{ padding: "1.25rem" }}>
                <SectionHeader title="Indicadores de Vínculo" icon="🔗" sub="Pacientes vinculados corretamente" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
                  {[
                    { label: "Com ACS",       value: withAcs,     total, color: T.green },
                    { label: "Com Telefone",   value: withPhone,   total, color: T.teal  },
                    { label: "Com Endereço",   value: withAddress, total, color: T.blue  },
                    { label: "Com CNS",        value: withCns,     total, color: T.purple},
                  ].map(k => (
                    <div key={k.label} style={{ padding: ".85rem", border: `1px solid ${k.color}30`, borderRadius: T.r, background: k.color+"0D" }}>
                      <div style={{ fontSize: "1.3rem", fontWeight: 900, color: k.color }}>{k.value}</div>
                      <div style={{ fontSize: ".72rem", color: T.text3, fontWeight: 500 }}>{k.label}</div>
                      <div style={{ fontSize: ".7rem", color: k.color, fontWeight: 600 }}>
                        {total ? Math.round((k.value/total)*100) : 0}%
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: "1rem" }}>
                  <SectionHeader title="Ações Recomendadas" />
                  {withAcs < total && (
                    <AlertBanner type="warning">{total-withAcs} paciente(s) sem ACS vinculado. Completar territorialização.</AlertBanner>
                  )}
                  {withCpf < total && (
                    <div style={{ marginTop: ".4rem" }}>
                      <AlertBanner type="info">{total-withCpf} cadastro(s) sem CPF registrado. Solicitar na próxima consulta.</AlertBanner>
                    </div>
                  )}
                  {dataScore >= 90 && (
                    <div style={{ marginTop: ".4rem" }}>
                      <AlertBanner type="success">Excelente completude dos dados! Manter a qualidade dos novos cadastros.</AlertBanner>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ── METAS E INDICADORES ── */}
        {tab === "conformidade" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: ".85rem" }}>
              <DashKpi label="Score de Conformidade" value={`${complianceScore}%`} icon="🛡️" color={complianceScore >= 80 ? T.green : complianceScore >= 60 ? T.amber : T.rose} bg={T.surface3}
                sub="Consolidado da unidade" />
              <DashKpi label="Sem CPF/CNS completo" value={missingIdentification} icon="🪪" color={missingIdentification > 0 ? T.rose : T.green} bg={missingIdentification > 0 ? T.roseL : T.greenL}
                sub="Identificação obrigatória" />
              <DashKpi label="Sem microárea/ACS" value={withoutTeamReference} icon="🗺️" color={withoutTeamReference > 0 ? T.amber : T.green} bg={withoutTeamReference > 0 ? T.amberL : T.greenL}
                sub="Territorialização" />
              <DashKpi label="Sem resumo de protocolo" value={protocolOverview.withoutSummary} icon="📄" color={protocolOverview.withoutSummary > 0 ? T.amber : T.green} bg={protocolOverview.withoutSummary > 0 ? T.amberL : T.greenL}
                sub="Pacientes sem monitoramento" />
            </div>

            <Card style={{ padding: "1.25rem" }}>
              <SectionHeader title="Checklist Regulatório Operacional" icon="📚"
                sub="Acompanhamento assistencial e de governança para gestão da UBS" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".65rem" }}>
                {[
                  { label: "Identificação mínima (CPF/CNS)", ok: missingIdentification === 0, detail: `${missingIdentification} pendente(s)` },
                  { label: "Completude de cadastro", ok: incomplete === 0, detail: `${incomplete} incompleto(s)` },
                  { label: "Territorialização (ACS + microárea)", ok: withoutTeamReference === 0, detail: `${withoutTeamReference} sem vínculo` },
                  { label: "Pendências de protocolo", ok: protocolOverview.totalPending === 0, detail: `${protocolOverview.totalPending} pendência(s)` },
                  { label: "Categorias legadas não normalizadas", ok: legacyCategoryNormalizedCount === 0, detail: `${legacyCategoryNormalizedCount} registro(s)` },
                  { label: "Cobertura de dados (score ≥ 80%)", ok: dataScore >= 80, detail: `${dataScore}%` },
                ].map(item => (
                  <div key={item.label} style={{ padding: ".75rem .85rem", borderRadius: T.r, border: `1px solid ${item.ok ? "#86efac" : "#fecaca"}`, background: item.ok ? "#f0fdf4" : "#fff1f2" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".78rem", fontWeight: 700, color: item.ok ? T.green : T.rose }}>
                      <span>{item.ok ? "✓" : "!"}</span>
                      <span>{item.label}</span>
                    </div>
                    <div style={{ fontSize: ".72rem", color: T.text2, marginTop: ".25rem" }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card style={{ padding: "1.25rem" }}>
              <SectionHeader title="Fila de Ação do Gestor" icon="🧭" sub="Pacientes com maior prioridade operacional (risco e pendências)" />
              {protocolOverview.topPending.length === 0 ? (
                <EmptyState icon="✅" title="Sem pendências de protocolo" sub="A unidade está sem pendências assistenciais registradas." />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
                    <thead>
                      <tr style={{ background: T.surface2 }}>
                        {["Paciente", "Risco", "Visitas", "Consultas", "Vacinas", "Total"].map(h => (
                          <th key={h} style={{ padding: ".6rem .85rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {protocolOverview.topPending.map((row, idx) => (
                        <tr key={row.id} style={{ background: idx % 2 === 0 ? T.surface : T.surface2 }}>
                          <td style={{ padding: ".6rem .85rem", fontWeight: 700, color: T.ink }}>{row.name}</td>
                          <td style={{ padding: ".6rem .85rem" }}>
                            <Badge label={row.risk ? "Alto" : "Moderado"} color={row.risk ? T.rose : T.amber} bg={row.risk ? T.roseL : T.amberL} />
                          </td>
                          <td style={{ padding: ".6rem .85rem", color: T.text2 }}>{row.pendingVisits}</td>
                          <td style={{ padding: ".6rem .85rem", color: T.text2 }}>{row.pendingConsultations}</td>
                          <td style={{ padding: ".6rem .85rem", color: T.text2 }}>{row.pendingVaccines}</td>
                          <td style={{ padding: ".6rem .85rem", fontWeight: 800, color: T.indigo }}>{row.pending}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {tab === "metas" && (
          <>
            <AlertBanner type="info">
              Indicadores baseados na <strong>PNAB (Política Nacional de Atenção Básica) — Portaria 2.436/2017</strong> e diretrizes do <strong>Ministério da Saúde / DAB</strong>.
            </AlertBanner>

            {/* Metas principais */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: ".85rem" }}>
              {[
                {
                  label: "Cobertura Territorial",
                  value: total, meta: metaCobertura, unit: "pacientes",
                  icon: "🗺️", color: coberturaColor,
                  desc: "Meta PNAB: até 3.500 por equipe ESF",
                },
                {
                  label: "Cobertura eSF",
                  value: Math.min(100, Math.round((total/metaCobertura)*100)), meta: 80, unit: "%",
                  icon: "🏥", color: T.blue,
                  desc: "Meta: ≥80% de cobertura",
                },
                {
                  label: "Pac. Vulneráveis",
                  value: byStatus.risk||0, meta: metaVulneraveis, unit: "pacientes",
                  icon: "⚠️", color: T.amber,
                  desc: "Estimativa: 20% do total",
                },
                {
                  label: "Qualidade de Dados",
                  value: dataScore, meta: 80, unit: "%",
                  icon: "📊", color: scoreColor,
                  desc: "Meta interna: ≥80% de completude",
                },
                {
                  label: "Pac. por ACS",
                  value: acsUsers.length>0?Math.round(total/acsUsers.length):0, meta: 750, unit: "pac.",
                  icon: "🏃", color: acsUsers.length>0&&(total/acsUsers.length)>750?T.rose:T.green,
                  desc: "Meta PNAB: máx 750 por ACS",
                },
                {
                  label: "Protocolos Ativos",
                  value: templates.length, meta: 6, unit: "protocolos",
                  icon: "📋", color: T.purple,
                  desc: "Mínimo recomendado: 6 protocolos",
                },
              ].map(m => {
                const pct = Math.min(100, m.unit==="%"? m.value : (m.value/m.meta)*100);
                const ok  = m.unit==="%" ? m.value>=m.meta : pct>=80;
                return (
                  <Card key={m.label} style={{ padding: "1.15rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: ".6rem" }}>
                      <div style={{ fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: T.text3 }}>{m.icon} {m.label}</div>
                      <Badge label={ok?"✓ Meta":"Abaixo"} color={ok?T.green:T.amber} bg={ok?T.greenL:T.amberL} size="sm" />
                    </div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 900, color: m.color, lineHeight: 1 }}>
                      {m.value.toLocaleString("pt-BR")}<span style={{ fontSize: ".85rem", fontWeight: 600 }}> {m.unit}</span>
                    </div>
                    <div style={{ margin: ".5rem 0", height: 8, borderRadius: 99, background: T.surface3 }}>
                      <div style={{ height: "100%", borderRadius: 99, background: m.color, width: `${pct}%`, transition: "width .5s" }} />
                    </div>
                    <div style={{ fontSize: ".7rem", color: T.text3 }}>
                      Meta: {m.unit==="%" ? `${m.meta}${m.unit}` : `${m.meta.toLocaleString("pt-BR")} ${m.unit}`} · {pct.toFixed(0)}% atingido
                    </div>
                    <div style={{ fontSize: ".68rem", color: T.text3, marginTop: ".2rem" }}>{m.desc}</div>
                  </Card>
                );
              })}
            </div>

            {/* Tabela de metas detalhada */}
            <Card style={{ padding: "1.25rem" }}>
              <SectionHeader title="Indicadores por Categoria de Cuidado" icon="🎯"
                sub="Distribuição de pacientes vs. metas programáticas" />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".8rem" }}>
                  <thead>
                    <tr style={{ background: T.surface2 }}>
                      {["Programa", "Pacientes", "% do total", "Status", "Prioridade"].map(h => (
                        <th key={h} style={{ padding: ".65rem .9rem", textAlign: "left", fontWeight: 700, color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", fontSize: ".75rem" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map(([cat, count], i) => {
                      const pct = total ? (count/total)*100 : 0;
                      const prioridade = cat==="pregnant"||cat==="child_followup" ? "Alta" : cat==="chronic" ? "Alta" : "Média";
                      const priorColor = prioridade==="Alta" ? T.rose : T.amber;
                      return (
                        <tr key={cat} style={{ background: i%2===0?T.surface:T.surface2 }}>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: catColor(cat), flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, color: T.ink }}>{catLabel(cat)}</span>
                            </div>
                          </td>
                          <td style={{ padding: ".65rem .9rem", fontWeight: 800, color: catColor(cat), fontVariantNumeric: "tabular-nums" }}>{count}</td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                              <div style={{ width: 60, height: 5, borderRadius: 99, background: T.surface3 }}>
                                <div style={{ height: "100%", borderRadius: 99, background: catColor(cat), width: `${pct}%` }} />
                              </div>
                              <span style={{ fontSize: ".75rem", color: T.text3 }}>{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <Badge label={count>0?"Ativo":"Sem pacientes"} color={count>0?T.green:T.text3} bg={count>0?T.greenL:T.surface3} size="sm" />
                          </td>
                          <td style={{ padding: ".65rem .9rem" }}>
                            <Badge label={prioridade} color={priorColor} bg={priorColor+"15"} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: T.surface2, borderTop: `2px solid ${T.border}` }}>
                      <td style={{ padding: ".65rem .9rem", fontWeight: 800, color: T.ink }}>TOTAL</td>
                      <td style={{ padding: ".65rem .9rem", fontWeight: 900, color: T.indigo, fontSize: ".9rem" }}>{total}</td>
                      <td style={{ padding: ".65rem .9rem", color: T.text3 }}>100%</td>
                      <td colSpan="2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            {/* Rodapé regulatório */}
            <div style={{
              padding: ".85rem 1.25rem", borderRadius: T.r,
              background: T.ink2, display: "flex", alignItems: "center",
              justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem",
            }}>
              <span style={{ fontSize: ".72rem", color: "#94a3b8" }}>
                📋 Relatório gerado em <strong style={{ color: "#e2e8f0" }}>{new Date().toLocaleString("pt-BR")}</strong>
              </span>
              <span style={{ fontSize: ".68rem", color: "#64748b" }}>
                PNAB 2.436/2017 · DAB/MS · CFM 1638/2002 · LGPD · e-SUS APS
              </span>
            </div>
          </>
        )}

      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   RELATÓRIOS & DIAGNÓSTICOS (re-exportados sem alteração)
════════════════════════════════════════════════════════════════════ */

export function ReportsPageNew({ patients, users, templates, protocolByPatient }) {
  const [period, setPeriod] = useState("month");
  const [category, setCategory] = useState("all");

  const filtered = useMemo(() =>
    category === "all"
      ? patients
      : patients.filter(p => normalizeCareCategory(p.careCategory) === category),
    [patients, category]
  );
  const total  = filtered.length;
  const active = filtered.filter(p => p.status === "active" || !p.status).length;
  const risk   = filtered.filter(p => p.status === "risk").length;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = patients.filter(p => p.createdAt && new Date(p.createdAt) >= monthStart).length;

  const catOptions = [
    { key:"all",          label:"Todas"       },
    { key:"pregnant",     label:"Gestantes"   },
    { key:"child_followup",label:"Puericultura"},
    { key:"chronic",      label:"Crônicos"    },
    { key:"puerperal",    label:"Puérperas"   },
    { key:"elderly",      label:"Pessoa Idosa"},
    { key:"general",      label:"Geral"       },
  ];

  const acsReport = useMemo(() =>
    users.filter(u => u.role === "acs").map(acs => ({
      name: acs.name,
      total:  patients.filter(p => p.assignedAcsId === acs.id).length,
      active: patients.filter(p => p.assignedAcsId === acs.id && (p.status==="active"||!p.status)).length,
      risk:   patients.filter(p => p.assignedAcsId === acs.id && p.status==="risk").length,
    })).sort((a,b)=>b.total-a.total),
    [patients, users]
  );

  const protocolReport = useMemo(() => {
    let withSummary = 0;
    let pendingPatients = 0;
    let totalPending = 0;
    filtered.forEach((p) => {
      const s = protocolByPatient?.[p.id];
      if (!s) return;
      withSummary++;
      const pending = Number(s?.pending?.visits || 0) + Number(s?.pending?.consultations || 0) + Number(s?.pending?.vaccines || 0);
      if (pending > 0) {
        pendingPatients++;
        totalPending += pending;
      }
    });
    return {
      withSummary,
      withoutSummary: Math.max(0, filtered.length - withSummary),
      pendingPatients,
      totalPending,
    };
  }, [filtered, protocolByPatient]);

  const reportActions = useMemo(() => {
    const actions = [];
    if (protocolReport.pendingPatients > 0) actions.push(`Priorizar ${protocolReport.pendingPatients} paciente(s) com pendências de protocolo.`);
    if (protocolReport.withoutSummary > 0) actions.push(`Gerar resumo de protocolo para ${protocolReport.withoutSummary} paciente(s) sem monitoramento.`);
    const missingId = filtered.filter(p => !p.cpf || !p.cns).length;
    if (missingId > 0) actions.push(`Completar CPF/CNS de ${missingId} paciente(s) para rastreabilidade e auditoria.`);
    const withoutAcs = filtered.filter(p => !p.assignedAcsId).length;
    if (withoutAcs > 0) actions.push(`Vincular ACS para ${withoutAcs} paciente(s) sem responsável territorial.`);
    return actions;
  }, [filtered, protocolReport]);

  const esusReport = useMemo(() => {
    const fields = [
      { key: "name", label: "Nome completo", check: (p) => String(p?.name || "").trim().length > 0 },
      { key: "birthDate", label: "Data nascimento", check: (p) => String(p?.birthDate || "").trim().length > 0 },
      { key: "sexAtBirth", label: "Sexo", check: (p) => String(p?.sexAtBirth || "").trim().length > 0 },
      { key: "cpfOrCns", label: "CPF/CNS", check: (p) => String(p?.cpf || "").trim().length > 0 || String(p?.cns || "").trim().length > 0 },
      { key: "address", label: "Endereco", check: (p) => String(p?.address || "").trim().length > 0 },
      { key: "microArea", label: "Microarea", check: (p) => String(p?.microArea || "").trim().length > 0 },
      { key: "teamId", label: "Equipe", check: (p) => String(p?.teamId || "").trim().length > 0 },
      { key: "assignedAcsId", label: "ACS", check: (p) => String(p?.assignedAcsId || "").trim().length > 0 },
    ];
    const pendingByField = fields.reduce((acc, field) => ({ ...acc, [field.key]: 0 }), {});
    const rows = filtered.map((p) => {
      const missing = fields.filter((f) => !f.check(p)).map((f) => f.label);
      fields.forEach((f) => { if (!f.check(p)) pendingByField[f.key] += 1; });
      return {
        id: p.id,
        name: p.name || "Paciente sem nome",
        cpf: p.cpf || "-",
        cns: p.cns || "-",
        missing,
        missingCount: missing.length,
      };
    }).sort((a, b) => b.missingCount - a.missingCount || a.name.localeCompare(b.name));
    const incompleteRows = rows.filter((row) => row.missingCount > 0);
    return {
      fields,
      rows,
      incompleteRows,
      completeCount: rows.length - incompleteRows.length,
      incompleteCount: incompleteRows.length,
      totalMissing: rows.reduce((sum, row) => sum + row.missingCount, 0),
      pendingByField,
      topPending: incompleteRows.slice(0, 12),
    };
  }, [filtered]);

  return (
    <div style={{ padding:"1.5rem 2rem", display:"flex", flexDirection:"column", gap:"1.25rem" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:".75rem" }}>
        <div>
          <h1 style={{ margin:0, fontSize:"1.35rem", fontWeight:800, color:T.ink }}>Relatórios</h1>
          <p style={{ margin:".3rem 0 0", fontSize:".82rem", color:T.text3 }}>Produção e indicadores da equipe · PNAB 2.436/2017</p>
        </div>
        <div style={{ display:"flex", gap:".35rem", flexWrap:"wrap" }}>
          {catOptions.map(o => <Pill key={o.key} label={o.label} active={category===o.key} onClick={()=>setCategory(o.key)} color={T.indigo} />)}
        </div>
      </div>

      <div style={{ display:"flex", gap:".65rem", flexWrap:"wrap" }}>
        {[
          { label:"Total", value:total, icon:"👥", color:T.indigo, bg:T.indigoL },
          { label:"Ativos", value:active, icon:"✅", color:T.green, bg:T.greenL },
          { label:"Em risco", value:risk, icon:"⚠️", color:T.amber, bg:T.amberL },
          { label:"Novos este mês", value:newThisMonth, icon:"🆕", color:T.blue, bg:T.blueL },
          { label:"ACS", value:users.filter(u=>u.role==="acs").length, icon:"🏃", color:T.teal, bg:T.tealL },
          { label:"Pendências protocolo", value:protocolReport.totalPending, icon:"📌", color:protocolReport.totalPending ? T.amber : T.green, bg:protocolReport.totalPending ? T.amberL : T.greenL },
          { label:"Sem resumo", value:protocolReport.withoutSummary, icon:"📄", color:protocolReport.withoutSummary ? T.amber : T.green, bg:protocolReport.withoutSummary ? T.amberL : T.greenL },
          { label:"Cadastro e-SUS completo", value:esusReport.completeCount, icon:"ES", color:T.green, bg:T.greenL },
          { label:"Pendencias e-SUS", value:esusReport.totalMissing, icon:"!", color:esusReport.totalMissing ? T.rose : T.green, bg:esusReport.totalMissing ? T.roseL : T.greenL },
        ].map(k => (
          <Card key={k.label} style={{ padding:".85rem 1rem", flex:"1 1 120px", minWidth:100 }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:"1.6rem", fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:".68rem", color:T.text3, marginTop:".25rem", fontWeight:500 }}>{k.label}</div>
              </div>
              <div style={{ fontSize:"1.2rem", background:k.bg, borderRadius:8, padding:".3rem .4rem", lineHeight:1 }}>{k.icon}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ padding:"1.25rem" }}>
        <SectionHeader title="Distribuição por Categoria" sub="Pacientes por programa de cuidado" icon="📊" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:".65rem" }}>
          {catOptions.filter(o=>o.key!=="all").map(o=>{
            const count = patients.filter(p=>normalizeCareCategory(p.careCategory)===o.key).length;
            return (
              <div key={o.key} style={{ padding:".85rem 1rem", border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface }}>
                <div style={{ fontSize:"1.5rem", fontWeight:800, color:catColor(o.key) }}>{count}</div>
                <div style={{ fontSize:".78rem", fontWeight:600, color:T.ink, marginTop:".1rem" }}>{o.label}</div>
                <div style={{ fontSize:".68rem", color:T.text3 }}>{patients.length?((count/patients.length)*100).toFixed(1):0}% do total</div>
                <div style={{ marginTop:".4rem", height:4, borderRadius:99, background:T.surface3 }}>
                  <div style={{ height:"100%", borderRadius:99, background:catColor(o.key), width:`${patients.length?(count/patients.length)*100:0}%` }}/>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card style={{ padding:"1.25rem" }}>
        <SectionHeader title="Conformidade e Protocolo (Gestão)" sub="Panorama operacional para auditoria interna e tomada de decisão" icon="🛡️" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:".7rem" }}>
          {[
            { label:"Pacientes com resumo", value:protocolReport.withSummary, color:T.green, bg:T.greenL },
            { label:"Pacientes sem resumo", value:protocolReport.withoutSummary, color:protocolReport.withoutSummary?T.amber:T.green, bg:protocolReport.withoutSummary?T.amberL:T.greenL },
            { label:"Pacientes com pendência", value:protocolReport.pendingPatients, color:protocolReport.pendingPatients?T.amber:T.green, bg:protocolReport.pendingPatients?T.amberL:T.greenL },
            { label:"Pendências totais", value:protocolReport.totalPending, color:protocolReport.totalPending?T.rose:T.green, bg:protocolReport.totalPending?T.roseL:T.greenL },
          ].map(item => (
            <div key={item.label} style={{ padding:".75rem .85rem", borderRadius:T.r, border:`1px solid ${item.color}40`, background:item.bg }}>
              <div style={{ fontSize:"1.25rem", fontWeight:900, color:item.color }}>{item.value}</div>
              <div style={{ fontSize:".72rem", color:T.text2 }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: ".85rem", display:"flex", flexDirection:"column", gap:".4rem" }}>
          {reportActions.length === 0 ? (
            <AlertBanner type="success">Sem pendências críticas no recorte atual. Manter monitoramento de rotina.</AlertBanner>
          ) : reportActions.map((text, i) => (
            <AlertBanner key={i} type={i === 0 ? "warning" : "info"}>{text}</AlertBanner>
          ))}
        </div>
      </Card>

      <Card style={{ padding:"1.25rem" }}>
        <SectionHeader title="Preenchimento e-SUS APS" sub="Pendencias de cadastro para facilitar envio e consolidacao no e-SUS" icon="ESUS" />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:".7rem" }}>
          {[
            { label:"Cadastros completos", value:esusReport.completeCount, color:T.green, bg:T.greenL },
            { label:"Cadastros com pendencia", value:esusReport.incompleteCount, color:esusReport.incompleteCount?T.amber:T.green, bg:esusReport.incompleteCount?T.amberL:T.greenL },
            { label:"Pendencias totais", value:esusReport.totalMissing, color:esusReport.totalMissing?T.rose:T.green, bg:esusReport.totalMissing?T.roseL:T.greenL },
          ].map(item => (
            <div key={item.label} style={{ padding:".75rem .85rem", borderRadius:T.r, border:`1px solid ${item.color}40`, background:item.bg }}>
              <div style={{ fontSize:"1.25rem", fontWeight:900, color:item.color }}>{item.value}</div>
              <div style={{ fontSize:".72rem", color:T.text2 }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:".85rem", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:".5rem" }}>
          {esusReport.fields.map((field) => (
            <div key={field.key} style={{ padding:".5rem .65rem", borderRadius:T.r, border:`1px solid ${T.border}`, background:T.surface2 }}>
              <div style={{ fontSize:".7rem", color:T.text3 }}>{field.label}</div>
              <div style={{ fontSize:".95rem", fontWeight:800, color: esusReport.pendingByField[field.key] ? T.amber : T.green }}>
                {esusReport.pendingByField[field.key]} pendencia(s)
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:".9rem", overflowX:"auto" }}>
          {esusReport.topPending.length === 0 ? (
            <AlertBanner type="success">Todos os pacientes do recorte atual estao com cadastro essencial preenchido para e-SUS.</AlertBanner>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:".8rem" }}>
              <thead>
                <tr style={{ background:T.surface2 }}>
                  {["Paciente","CPF","CNS","Pendencias"].map((h)=>(
                    <th key={h} style={{ padding:".55rem .7rem", textAlign:"left", fontWeight:700, color:T.text2, borderBottom:`1px solid ${T.border}`, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {esusReport.topPending.map((row, i) => (
                  <tr key={row.id} style={{ background:i%2===0?T.surface:T.surface2 }}>
                    <td style={{ padding:".55rem .7rem", fontWeight:700, color:T.ink }}>{row.name}</td>
                    <td style={{ padding:".55rem .7rem", color:T.text2 }}>{row.cpf}</td>
                    <td style={{ padding:".55rem .7rem", color:T.text2 }}>{row.cns}</td>
                    <td style={{ padding:".55rem .7rem", color:T.text3 }}>{row.missing.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {acsReport.length > 0 && (
        <Card style={{ padding:"1.25rem" }}>
          <SectionHeader title="Produção por ACS" sub="Carteira de pacientes por agente comunitário" icon="🏃" />
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:".82rem" }}>
              <thead>
                <tr style={{ background:T.surface2 }}>
                  {["ACS","Total","Ativos","Em Risco","% Ativo"].map(h=>(
                    <th key={h} style={{ padding:".6rem .85rem", textAlign:"left", fontWeight:700, color:T.text2, borderBottom:`1px solid ${T.border}`, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acsReport.map((row,i)=>(
                  <tr key={row.name} style={{ background:i%2===0?T.surface:T.surface2 }}>
                    <td style={{ padding:".6rem .85rem", fontWeight:600, color:T.ink }}>{row.name}</td>
                    <td style={{ padding:".6rem .85rem", color:T.text2 }}>{row.total}</td>
                    <td style={{ padding:".6rem .85rem" }}><Badge label={row.active} color={T.green} bg={T.greenL}/></td>
                    <td style={{ padding:".6rem .85rem" }}><Badge label={row.risk} color={row.risk>0?T.amber:T.text3} bg={row.risk>0?T.amberL:T.surface3}/></td>
                    <td style={{ padding:".6rem .85rem", color:T.text3 }}>{row.total?Math.round((row.active/row.total)*100):0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div style={{ fontSize:".72rem", color:T.text3, textAlign:"center", padding:".5rem" }}>
        Relatório gerado em {new Date().toLocaleString("pt-BR")} · Dados conforme PNAB 2.436/2017
      </div>
    </div>
  );
}

/* ─── DiagnosticsPageNew ────────────────────────────────────────── */
export function DiagnosticsPageNew({ apiHealth, token, user, patients, users, templates, lastLoadAt, demandMonthly }) {
  const [ping, setPing] = useState(null);
  const [checking, setChecking] = useState(false);

  async function checkHealth() {
    setChecking(true);
    const t0 = Date.now();
    try { await fetch("/health"); setPing(Date.now()-t0); }
    catch { setPing(-1); }
    finally { setChecking(false); }
  }

  useEffect(() => { checkHealth(); }, []);

  const healthy = apiHealth?.ok === true;
  const total = patients.length;
  const withTeam = patients.filter(p=>p.teamId).length;
  const withAcs  = patients.filter(p=>p.assignedAcsId).length;

  const checks = [
    { label:"API Backend",          ok:healthy,           detail:healthy?`Online · ${ping!=null&&ping>=0?`${ping}ms`:""}` :"Offline ou sem resposta" },
    { label:"Banco de dados",       ok:total>0,           detail:total>0?`${total} pacientes carregados`:"Nenhum paciente no banco" },
    { label:"Vinculação de equipe", ok:withTeam===total,  detail:withTeam===total?"Todos vinculados":`${total-withTeam} paciente(s) sem equipe` },
    { label:"Vinculação de ACS",    ok:withAcs===total,   detail:withAcs===total?"Todos com ACS":`${total-withAcs} paciente(s) sem ACS` },
    { label:"Usuários ativos",      ok:users.length>0,    detail:`${users.length} usuário(s) na equipe` },
    { label:"Protocolos",           ok:templates.length>0,detail:`${templates.length} protocolo(s) ativo(s)` },
    { label:"Sessão válida",        ok:Boolean(token),    detail:token?"Token JWT presente":"Sem token de sessão" },
  ];

  const score = Math.round((checks.filter(c=>c.ok).length/checks.length)*100);

  return (
    <div style={{ padding:"1.5rem 2rem", display:"flex", flexDirection:"column", gap:"1.25rem" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:".75rem" }}>
        <div>
          <h1 style={{ margin:0, fontSize:"1.3rem", fontWeight:800, color:T.ink }}>Diagnóstico do Sistema</h1>
          <p style={{ margin:".3rem 0 0", fontSize:".82rem", color:T.text3 }}>Verificação de saúde e integridade dos dados</p>
        </div>
        <button onClick={checkHealth} disabled={checking} style={{ padding:".5rem 1.25rem", borderRadius:T.r, border:`1px solid ${T.border}`, background:T.surface, fontSize:".82rem", fontWeight:600, cursor:"pointer", color:T.text2, display:"flex", alignItems:"center", gap:".4rem" }}>
          {checking?<><Spinner size={14}/> Verificando...</>:"🔄 Re-verificar"}
        </button>
      </div>

      <Card style={{ padding:"1.5rem", background:score===100?T.greenL:score>=70?T.amberL:T.roseL, border:`1px solid ${score===100?"#86efac":score>=70?"#fcd34d":"#fca5a5"}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:"1.25rem", flexWrap:"wrap" }}>
          <div style={{ fontSize:"3rem", lineHeight:1 }}>{score===100?"✅":score>=70?"⚠️":"❌"}</div>
          <div>
            <div style={{ fontSize:"2rem", fontWeight:800, color:T.ink, lineHeight:1 }}>{score}%</div>
            <div style={{ fontSize:".88rem", fontWeight:600, color:T.ink2, marginTop:".2rem" }}>
              {score===100?"Sistema funcionando perfeitamente":score>=70?"Sistema operacional com alertas":"Atenção: problemas encontrados"}
            </div>
            <div style={{ fontSize:".75rem", color:T.text3, marginTop:".1rem" }}>{checks.filter(c=>c.ok).length}/{checks.length} verificações OK</div>
          </div>
        </div>
      </Card>

      <Card style={{ padding:"1.25rem" }}>
        <SectionHeader title="Verificações do Sistema" />
        <div style={{ display:"flex", flexDirection:"column", gap:".5rem" }}>
          {checks.map(check=>(
            <div key={check.label} style={{ display:"flex", alignItems:"center", gap:".85rem", padding:".75rem 1rem", borderRadius:T.r, background:check.ok?T.greenL:T.roseL, border:`1px solid ${check.ok?"#86efac":"#fca5a5"}` }}>
              <span style={{ fontSize:"1.15rem", flexShrink:0 }}>{check.ok?"✅":"❌"}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:".85rem", fontWeight:600, color:T.ink }}>{check.label}</div>
                <div style={{ fontSize:".75rem", color:T.text3 }}>{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

