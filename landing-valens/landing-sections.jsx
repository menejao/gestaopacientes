// landing-sections.jsx — Top of landing (Nav, Hero, ValueProp, Transformation)

// ─── NAV ──────────────────────────────────────────────────────
function LNav() {
  const [open, setOpen] = React.useState(false);
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(248,250,252,0.82)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      borderBottom: "1px solid var(--border-subtle)",
    }}>
      <div style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
      }}>
        <BrandLockup size={28} mode="light" layout="horizontal"/>
        <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
          {["Produto", "Módulos", "Segurança", "Implantação", "Contato"].map((t) => (
            <a key={t} href={`#${t.toLowerCase()}`} style={{ font: "500 13.5px Inter", color: "var(--text-muted)", textDecoration: "none", letterSpacing: "-0.005em" }}>
              {t}
            </a>
          ))}
          <a href="#login" style={{
            font: "500 13.5px Inter", color: "var(--text)", textDecoration: "none",
            padding: "8px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)",
          }}>Entrar</a>
          <button className="btn btn--primary">Falar com a equipe</button>
        </div>
      </div>
    </nav>
  );
}

// ─── HERO ─────────────────────────────────────────────────────
function LHero() {
  return (
    <section style={{
      position: "relative",
      background: "linear-gradient(135deg, #060F1B 0%, #0F1F35 55%, #133756 100%)",
      color: "#fff",
      padding: "100px 32px 120px",
      overflow: "hidden",
      isolation: "isolate",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: -1,
        background: "radial-gradient(620px 460px at 82% -10%, rgba(20,184,166,0.30), transparent 55%), radial-gradient(420px 340px at -5% 110%, rgba(34,211,238,0.14), transparent 65%)" }}/>

      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 72, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "rgba(20,184,166,0.12)", border: "1px solid rgba(20,184,166,0.25)" }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#14B8A6", boxShadow: "0 0 10px rgba(20,184,166,0.7)" }}/>
            <span style={{ font: "500 11.5px 'IBM Plex Mono', monospace", letterSpacing: "0.1em", color: "#5EEAD4", textTransform: "uppercase" }}>PLATAFORMA INSTITUCIONAL</span>
          </div>
          <h1 style={{ margin: "28px 0 0", font: "800 76px Inter", letterSpacing: "-0.04em", lineHeight: 1.0, color: "#fff" }}>
            Gestão pública de saúde, <span style={{ color: "#5EEAD4" }}>integrada.</span>
          </h1>
          <p style={{ margin: "28px 0 0", maxWidth: "54ch", color: "rgba(255,255,255,0.72)", lineHeight: 1.65, fontSize: 17 }}>
            SIGUS unifica prontuário eletrônico, agenda, farmácia, dashboards e auditoria em uma única plataforma — operada por médicos, gestores e secretarias municipais de saúde.
          </p>
          <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn--primary" style={{ height: 46, padding: "0 24px", fontSize: 15 }}>
              Agendar demonstração <LIcon name="arrow"/>
            </button>
            <button style={{
              height: 46, padding: "0 24px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              color: "#fff", font: "500 15px Inter", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
              Ver a plataforma
            </button>
          </div>

          <div style={{ marginTop: 64, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28 }}>
            {[
              ["Light-first",   "Interface clara e legível para uso clínico contínuo"],
              ["Modular",       "Prontuário · agenda · farmácia · auditoria"],
              ["Institucional", "Gestão municipal · UBS · clínicas · secretarias"],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ font: "600 11px 'IBM Plex Mono', monospace", letterSpacing: "0.1em", color: "#5EEAD4", textTransform: "uppercase" }}>● {k}</div>
                <div style={{ marginTop: 8, font: "400 13px Inter", color: "rgba(255,255,255,0.62)", lineHeight: 1.5 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview do dashboard com placeholders */}
        <div style={{ position: "relative" }}>
          <div style={{
            padding: 20, borderRadius: 14,
            background: "rgba(8,18,28,0.6)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {[0,1,2].map(i => <span key={i} style={{ width: 10, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.15)" }}/>)}
              </div>
              <div style={{ marginLeft: 8, font: "500 11px 'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.45)" }}>sigus.app/dashboard</div>
              <div style={{ marginLeft: "auto", padding: "3px 8px", borderRadius: 4, background: "rgba(20,184,166,0.18)", font: "500 9.5px 'IBM Plex Mono', monospace", color: "#5EEAD4", letterSpacing: "0.06em" }}>PREVIEW</div>
            </div>
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
              {[
                ["Atendimentos · 30d", "—"],
                ["Em espera",          "—"],
                ["Críticos",           "—"],
                ["Cobertura ESF",      "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
                  <div style={{ font: "600 9.5px 'IBM Plex Mono', monospace", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>{k}</div>
                  <div style={{ marginTop: 6, font: "700 22px 'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.55)" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
              <div style={{ font: "600 10.5px 'IBM Plex Mono', monospace", letterSpacing: "0.06em", color: "rgba(255,255,255,0.5)" }}>ATENDIMENTOS · 30D</div>
              <svg width="100%" height="56" viewBox="0 0 360 56" preserveAspectRatio="none" style={{ marginTop: 8 }}>
                <defs>
                  <linearGradient id="lh-a" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5EEAD4" stopOpacity="0.25"/>
                    <stop offset="1" stopColor="#5EEAD4" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d="M0 40 Q40 32 80 36 T160 28 T240 20 T360 18 L360 56 L0 56 Z" fill="url(#lh-a)"/>
                <path d="M0 40 Q40 32 80 36 T160 28 T240 20 T360 18" fill="none" stroke="#5EEAD4" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <div style={{ marginTop: 6, font: "500 9.5px 'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.32)", letterSpacing: "0.08em" }}>
                PREVIEW · SEM DADOS REAIS
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── VALUE PROP ───────────────────────────────────────────────
function LValueProp() {
  return (
    <section id="produto" style={{ padding: "120px 32px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div className="eyebrow">PROPOSTA DE VALOR</div>
        <h2 style={{ margin: "16px 0 0", font: "700 48px Inter", letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text)", maxWidth: "22ch" }}>
          A operação clínica e administrativa de uma cidade em uma única plataforma.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: "62ch", color: "var(--text-muted)", lineHeight: 1.65, fontSize: 16 }}>
          Hoje, secretarias lidam com sistemas paralelos para prontuário, agenda, farmácia, vacinação, e-SUS, RNDS e auditoria. O SIGUS substitui essa fragmentação por um sistema único, integrado, conforme LGPD, operado por quem está na ponta.
        </p>

        <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {[
            ["Para profissionais clínicos",   "Médicos, enfermeiros e ACS encontram o paciente certo, com histórico completo, em segundos.",       "users"],
            ["Para gestores e secretarias",   "Indicadores operacionais consolidados — atendimento, espera, cobertura — em tempo quase real.",     "chart"],
            ["Para auditoria e conformidade", "Logs imutáveis, exportação para e-SUS APS e RNDS, padrões LGPD em todas as camadas.",               "shield"],
          ].map(([title, body, icon]) => (
            <div key={title} className="card" style={{ padding: 24 }}>
              <div style={{ width: 40, height: 40, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <LIcon name={icon} size={20}/>
              </div>
              <h3 style={{ margin: 0, font: "600 17px Inter", letterSpacing: "-0.015em", color: "var(--text)" }}>{title}</h3>
              <p style={{ margin: "10px 0 0", font: "400 14px Inter", color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── TRANSFORMAÇÃO ────────────────────────────────────────────
function LTransformation() {
  return (
    <section style={{ padding: "120px 32px", background: "var(--surface-2)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div className="eyebrow">TRANSFORMAÇÃO DIGITAL</div>
        <h2 style={{ margin: "16px 0 0", font: "700 44px Inter", letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text)", maxWidth: "20ch" }}>
          Atenção básica que opera em ritmo de plantão.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: "62ch", color: "var(--text-muted)", lineHeight: 1.65, fontSize: 16 }}>
          O atendimento em UBS, ESF e clínicas municipais tem ritmo próprio. Plantões longos, filas mistas, demanda variável, ACS em campo, vacinação programada, exames de rotina. SIGUS foi desenhado em conjunto com profissionais reais — não em comitê de TI.
        </p>

        <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          {[
            ["Triagem",   "Manchester aplicado, prioridade clínica visível, fila em tempo real."],
            ["Anamnese",  "Estrutura unificada por linha de cuidado, importação de exames externos."],
            ["Conduta",   "Prescrição com CID, receita eletrônica, encaminhamentos integrados."],
            ["Auditoria", "Log imutável de cada acesso · exportação para sistemas federais."],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>{k}</div>
              <p style={{ margin: "8px 0 0", font: "400 13px Inter", color: "var(--text-muted)", lineHeight: 1.55 }}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { LNav, LHero, LValueProp, LTransformation });
