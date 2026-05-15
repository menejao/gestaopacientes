// landing-sections-2.jsx — Modules, Security, Interop, Implantation, Benefits, CTA, Footer

// ─── MÓDULOS ──────────────────────────────────────────────────
function LModules() {
  return (
    <section id="módulos" style={{ padding: "120px 32px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="eyebrow">MÓDULOS</div>
        <h2 style={{ margin: "16px 0 0", font: "700 48px Inter", letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text)", maxWidth: "20ch" }}>
          Um sistema. Seis frentes integradas.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: "62ch", color: "var(--text-muted)", lineHeight: 1.65, fontSize: 16 }}>
          Cada módulo funciona isolado e funciona melhor junto. Implantação pode ser modular, faseada ou completa — definida pela secretaria.
        </p>

        <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {[
            { icon: "file",     title: "Prontuário Eletrônico",  body: "Histórico clínico unificado, linhas de cuidado, anamnese estruturada, prescrição digital, importação de exames externos." },
            { icon: "calendar", title: "Agenda & Triagem",       body: "Agenda multi-profissional, encaixes, retornos automáticos, triagem Manchester com prioridade visível." },
            { icon: "pill",     title: "Farmácia Municipal",     body: "Estoque por unidade, dispensação rastreada, alertas de medicamento contínuo, integração com receita." },
            { icon: "chart",    title: "Dashboards Gerenciais",  body: "Indicadores operacionais e clínicos consolidados — atendimento, espera, cobertura ESF, protocolos críticos." },
            { icon: "audit",    title: "Auditoria & Conformidade", body: "Log imutável, exportação automática para e-SUS APS e RNDS, espelhamento para sistemas federais." },
            { icon: "users",    title: "Gestão Municipal",       body: "Visão consolidada da rede — múltiplas UBS, equipes ESF, ACS em campo, indicadores comparativos." },
          ].map(({ icon, title, body }) => (
            <div key={title} className="card" style={{ padding: 24 }}>
              <div style={{ width: 44, height: 44, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <LIcon name={icon} size={22}/>
              </div>
              <h3 style={{ margin: 0, font: "600 17px Inter", letterSpacing: "-0.015em", color: "var(--text)" }}>{title}</h3>
              <p style={{ margin: "10px 0 0", font: "400 13.5px Inter", color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
              <a href="#" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, font: "500 13px Inter", color: "var(--accent-text)", textDecoration: "none" }}>
                Conhecer módulo <LIcon name="arrow" size={12}/>
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── SEGURANÇA & LGPD ────────────────────────────────────────
function LSecurity() {
  return (
    <section id="segurança" style={{
      padding: "120px 32px",
      background: "var(--hero-grad)",
      color: "#fff",
      position: "relative", overflow: "hidden", isolation: "isolate",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "var(--hero-glow-1)" }}/>
      <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "var(--hero-glow-2)" }}/>

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ font: "600 10.5px 'IBM Plex Mono', monospace", letterSpacing: "0.14em", color: "#5EEAD4", textTransform: "uppercase" }}>
          ● SEGURANÇA & LGPD
        </div>
        <h2 style={{ margin: "16px 0 0", font: "700 44px Inter", letterSpacing: "-0.035em", lineHeight: 1.05, color: "#fff", maxWidth: "22ch" }}>
          Dado clínico é dado sensível. Tratado como tal — em cada camada.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: "62ch", color: "rgba(255,255,255,0.72)", lineHeight: 1.65, fontSize: 16 }}>
          SIGUS opera sob LGPD desde o desenho. Criptografia em repouso e em trânsito, isolamento por tenant municipal, controle granular de acesso, auditoria de cada operação.
        </p>

        <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
          {[
            ["LGPD by design",      "Base legal documentada por finalidade · DPO · canal do titular · DPIA disponível para secretarias."],
            ["Criptografia",        "TLS 1.3 em trânsito · AES-256 em repouso · backups criptografados · KMS gerenciado."],
            ["Controle de acesso",  "Perfis por função clínica · MFA opcional · sessão limitada · revogação imediata."],
            ["Auditoria imutável",  "Cada acesso, cada alteração, cada exportação — log com timestamp e identidade."],
            ["Tenancy",             "Cada município opera em isolamento lógico · dados não atravessam fronteiras municipais."],
            ["Conformidade",        "Aderente a CFM nº 1.821/2007 · CFM 2.299/2021 (teleconsulta) · Manual SBIS."],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, background: "rgba(20,184,166,0.15)", color: "#5EEAD4", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LIcon name="shield" size={16}/>
                </div>
                <h3 style={{ margin: 0, font: "600 16px Inter", color: "#fff" }}>{k}</h3>
              </div>
              <p style={{ margin: "12px 0 0", font: "400 13.5px Inter", color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── INTEROPERABILIDADE ───────────────────────────────────────
function LInterop() {
  return (
    <section style={{ padding: "120px 32px", background: "var(--surface-2)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div className="eyebrow">INTEROPERABILIDADE</div>
        <h2 style={{ margin: "16px 0 0", font: "700 44px Inter", letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text)", maxWidth: "22ch" }}>
          Integrado com a rede pública de saúde do Brasil.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: "62ch", color: "var(--text-muted)", lineHeight: 1.65, fontSize: 16 }}>
          Espelhamento contínuo para os sistemas federais — sem dupla entrada, sem retrabalho. Integração via FHIR e padrões oficiais.
        </p>

        <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
          {[
            ["e-SUS APS",      "Atenção primária"],
            ["RNDS",           "Rede Nacional de Dados em Saúde"],
            ["SINAN",          "Notificações compulsórias"],
            ["SI-PNI",         "Imunizações"],
            ["SISAB",          "Atenção básica · indicadores"],
            ["HORUS",          "Assistência farmacêutica"],
            ["e-SUS Notifica", "Doenças e agravos"],
            ["FHIR R4",        "Padrão internacional"],
          ].map(([n, d]) => (
            <div key={n} style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-xs)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
                <LIcon name="sync" size={14}/>
                <span style={{ font: "600 14px Inter", color: "var(--text)" }}>{n}</span>
              </div>
              <div style={{ marginTop: 6, font: "400 12px Inter", color: "var(--text-muted)" }}>{d}</div>
            </div>
          ))}
        </div>

        <div className="alert alert--info" style={{ marginTop: 28, maxWidth: "60ch" }}>
          <LIcon name="check" size={16}/>
          <div>
            <strong>Aderência</strong> · integrações federais sob padrões do Ministério da Saúde · DATASUS · ANS. Cada nova rotina é homologada antes de produção.
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── IMPLANTAÇÃO ──────────────────────────────────────────────
function LImplantation() {
  return (
    <section id="implantação" style={{ padding: "120px 32px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div className="eyebrow">IMPLANTAÇÃO</div>
        <h2 style={{ margin: "16px 0 0", font: "700 44px Inter", letterSpacing: "-0.035em", lineHeight: 1.05, color: "var(--text)", maxWidth: "20ch" }}>
          Do contrato à operação plena — em fases controladas.
        </h2>
        <p style={{ margin: "20px 0 0", maxWidth: "62ch", color: "var(--text-muted)", lineHeight: 1.65, fontSize: 16 }}>
          Implantação faseada com squads de campo, treinamento presencial e suporte dedicado. Sem big-bang.
        </p>

        <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
          {[
            ["01", "Diagnóstico",   "Levantamento de processos, sistemas legados, equipes. Plano de migração por unidade."],
            ["02", "Piloto",        "Uma UBS, 4 semanas. Configuração tenant, treinamento, ajustes finos."],
            ["03", "Onda 1",        "Replicação para conjunto de 4–6 unidades. Migração de dados históricos."],
            ["04", "Rede completa", "Rollout para toda a rede municipal. Operação plena com suporte dedicado."],
          ].map(([n, t, d]) => (
            <div key={n} style={{ padding: 22, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, position: "relative" }}>
              <div style={{ font: "700 28px 'IBM Plex Mono', monospace", color: "var(--accent)", letterSpacing: "-0.015em" }}>{n}</div>
              <h3 style={{ margin: "10px 0 0", font: "600 16px Inter", color: "var(--text)", letterSpacing: "-0.015em" }}>{t}</h3>
              <p style={{ margin: "8px 0 0", font: "400 13px Inter", color: "var(--text-muted)", lineHeight: 1.55 }}>{d}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 64 }}>
          <div className="eyebrow">SUPORTE</div>
          <h3 style={{ margin: "12px 0 0", font: "700 28px Inter", letterSpacing: "-0.025em", color: "var(--text)" }}>
            Suporte humano, em horário de saúde pública.
          </h3>
          <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {[
              ["Suporte clínico",        "Atendimento direto a profissionais de saúde — pelo próprio app."],
              ["Suporte administrativo", "Para gestores e secretarias · canal dedicado · SLA acordado em contrato."],
              ["Suporte técnico",        "Equipe de engenharia · monitoramento 24/7 · status público em sigus.app/status."],
            ].map(([k, v]) => (
              <div key={k} className="card" style={{ padding: 20 }}>
                <h4 style={{ margin: 0, font: "600 15px Inter", color: "var(--text)" }}>{k}</h4>
                <p style={{ margin: "8px 0 0", font: "400 13px Inter", color: "var(--text-muted)", lineHeight: 1.55 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── BENEFÍCIOS ───────────────────────────────────────────────
function LBenefits() {
  return (
    <section style={{ padding: "100px 32px", background: "var(--surface-2)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
        <div>
          <div className="eyebrow">BENEFÍCIOS</div>
          <h2 style={{ margin: "12px 0 0", font: "700 36px Inter", letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--text)" }}>
            Por que secretarias migram para SIGUS.
          </h2>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            "Substitui 3+ sistemas paralelos por uma plataforma única",
            "Cadastro de paciente com estrutura unificada por linha de cuidado",
            "Auditoria contínua sem sobrecarga operacional",
            "Espelhamento automático para e-SUS APS e RNDS",
            "Treinamento presencial incluído na implantação",
            "Contrato sob lei pública · pregão eletrônico · ata de registro",
          ].map((t) => (
            <li key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
              <span style={{ flex: "0 0 auto", color: "var(--accent)", marginTop: 1 }}><LIcon name="check" size={16}/></span>
              <span style={{ font: "400 14px Inter", color: "var(--text)", lineHeight: 1.5 }}>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────
const ctaInputDark = {
  height: 38, padding: "0 12px",
  background: "rgba(0,0,0,0.32)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#fff",
  font: "400 13.5px Inter",
  outline: "none",
  width: "100%",
};

function LCTA() {
  return (
    <section id="contato" style={{ padding: "120px 32px", background: "var(--bg)" }}>
      <div style={{
        maxWidth: 1080, margin: "0 auto",
        padding: "72px 64px",
        background: "var(--hero-grad)",
        color: "#fff",
        borderRadius: 20,
        position: "relative", overflow: "hidden", isolation: "isolate",
      }}>
        <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "var(--hero-glow-1)" }}/>
        <div style={{ position: "absolute", inset: 0, zIndex: -1, background: "var(--hero-glow-2)" }}/>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 64, alignItems: "center" }}>
          <div>
            <div style={{ font: "600 11px 'IBM Plex Mono', monospace", letterSpacing: "0.14em", color: "#5EEAD4", textTransform: "uppercase" }}>
              ● CONVERSA INSTITUCIONAL
            </div>
            <h2 style={{ margin: "16px 0 0", font: "700 40px Inter", letterSpacing: "-0.035em", lineHeight: 1.1, color: "#fff" }}>
              Conversamos sobre a sua rede municipal de saúde?
            </h2>
            <p style={{ margin: "16px 0 0", maxWidth: "50ch", color: "rgba(255,255,255,0.72)", lineHeight: 1.6, fontSize: 16 }}>
              Apresentamos a plataforma, levantamos seus processos atuais e desenhamos um plano de implantação faseado em conjunto. Sem compromisso na primeira conversa.
            </p>
            <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="btn btn--primary" style={{ height: 44, padding: "0 22px", fontSize: 14 }}>
                Agendar demonstração <LIcon name="arrow"/>
              </button>
              <button style={{
                height: 44, padding: "0 22px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8, color: "#fff",
                font: "500 14px Inter", cursor: "pointer",
              }}>
                Receber proposta institucional
              </button>
            </div>
          </div>

          <div style={{
            padding: 24,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{ font: "600 11px 'IBM Plex Mono', monospace", letterSpacing: "0.1em", color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>FORMULÁRIO RÁPIDO</div>
            <input placeholder="Município / Secretaria" style={ctaInputDark}/>
            <input placeholder="Responsável" style={ctaInputDark}/>
            <input placeholder="E-mail institucional" style={ctaInputDark}/>
            <button className="btn btn--primary" style={{ marginTop: 4 }}>Enviar</button>
            <div style={{ font: "400 11px Inter", color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
              Retornamos em até 1 dia útil. Conforme LGPD, dados usados exclusivamente para resposta institucional.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── FOOTER ───────────────────────────────────────────────────
function LFooter() {
  return (
    <footer style={{
      padding: "64px 32px 36px",
      background: "var(--navy)",
      color: "rgba(255,255,255,0.7)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr repeat(4, 1fr)", gap: 48 }}>
          <div>
            <BrandLockup size={32} mode="primary" layout="horizontal"/>
            <p style={{ marginTop: 20, font: "400 13.5px Inter", color: "rgba(255,255,255,0.55)", lineHeight: 1.6, maxWidth: "32ch" }}>
              Plataforma institucional para gestão pública de saúde — prontuário, agenda, farmácia e auditoria municipal.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              {["twitter","linkedin","github"].map((s) => (
                <a key={s} href="#" style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  color: "rgba(255,255,255,0.6)",
                }}><LIcon name={s} size={14}/></a>
              ))}
            </div>
          </div>

          {[
            ["Produto",  ["Prontuário","Agenda","Farmácia","Dashboards","Auditoria","Gestão municipal"]],
            ["Empresa",  ["Sobre","Time","Clientes","Carreiras","Imprensa"]],
            ["Recursos", ["Documentação","API","Status","Blog","Brand assets"]],
            ["Legal",    ["LGPD","Privacidade","Termos","DPO","Status"]],
          ].map(([title, items]) => (
            <div key={title}>
              <div style={{ font: "600 11px 'IBM Plex Mono', monospace", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 16 }}>
                {title}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((it) => (
                  <li key={it}>
                    <a href="#" style={{ font: "400 13px Inter", color: "rgba(255,255,255,0.7)", textDecoration: "none" }}>{it}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 56, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 18, font: "400 12px Inter", color: "rgba(255,255,255,0.45)", flexWrap: "wrap" }}>
            <span>© 2026 SIGUS · Sistema Integrado de Gestão de Unidade de Saúde</span>
          </div>
          <div style={{ font: "500 11px 'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em" }}>
            CONFORME LGPD · ISO 27001 (EM PROCESSO)
          </div>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { LModules, LSecurity, LInterop, LImplantation, LBenefits, LCTA, LFooter });
