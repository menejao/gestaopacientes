import { useState } from "react";
import { API_URL } from "../api";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Textarea from "../components/ui/Textarea";
import Alert from "../components/ui/Alert";
import Badge from "../components/ui/Badge";
import KPI from "../components/ui/KPI";
import { Tabs, Tab } from "../components/ui/Tabs";

const VALENS_SUBTITLE = "Plataforma integrada para gestão da saúde pública";

const IconMark = () => (
  <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="7.25" y="1.75" width="3.5" height="14.5" rx="1.75" fill="white" />
    <rect x="1.75" y="7.25" width="14.5" height="3.5" rx="1.75" fill="white" />
  </svg>
);

async function requestPasswordReset(email) {
  const res = await fetch(`${API_URL}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erro ao solicitar redefinição.");
  return data;
}

async function confirmPasswordReset(token, newPassword) {
  const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.trim(), newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Erro ao redefinir senha.");
  return data;
}

function ResetPasswordForm() {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    if (!email.trim()) return setErr("Informe e-mail institucional.");
    setBusy(true);
    setErr("");
    try {
      const data = await requestPasswordReset(email);
      setMsg(data.message || "Verifique seu e-mail para continuar.");
      if (data.resetToken) {
        setToken(data.resetToken);
        setStep("confirm");
      }
    } catch (error) {
      setErr(error.message || "Erro de conexão.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    if (!token.trim()) return setErr("Informe token válido.");
    if (newPw.length < 8) return setErr("Senha deve ter pelo menos 8 caracteres.");
    if (newPw !== newPw2) return setErr("Senhas não coincidem.");
    setBusy(true);
    setErr("");
    try {
      await confirmPasswordReset(token, newPw);
      setMsg("Senha redefinida com sucesso. Faça login com nova senha.");
      setStep("done");
    } catch (error) {
      setErr(error.message || "Falha ao redefinir senha.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="auth-reset-done">
        <div className="auth-reset-done__icon">✓</div>
        <h3>Credencial atualizada</h3>
        <p>{msg}</p>
      </div>
    );
  }

  return (
    <form className="auth-form auth-form--stacked" onSubmit={step === "request" ? handleRequest : handleConfirm}>
      <p className="auth-form__intro">
        {step === "request"
          ? "Informe e-mail institucional. Fluxo protegido no backend, sem exposição de senha ou token em tela pública."
          : "Defina nova senha forte. Sessões antigas serão invalidadas pelo backend após troca."}
      </p>
      {step === "request" ? (
        <Input
          label="E-mail institucional"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@organizacao.gov.br"
          autoFocus
          autoComplete="email"
        />
      ) : (
        <>
          <Input
            label="Token de redefinição"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole token recebido"
          />
          <Input
            label="Nova senha"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            hint="Mínimo 8 caracteres, com maiúscula, número e símbolo."
            placeholder="********"
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={newPw2}
            onChange={(e) => setNewPw2(e.target.value)}
            placeholder="********"
          />
        </>
      )}
      {err ? <Alert tone="danger">{err}</Alert> : null}
      {msg && step === "request" ? <Alert tone="success">{msg}</Alert> : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy}>
        {busy ? (step === "request" ? "Enviando..." : "Redefinindo...") : (step === "request" ? "Solicitar redefinição" : "Redefinir senha")}
      </Button>
    </form>
  );
}

function GestorAccessPanel({ onBackToClinical, error, busy, email, password, setEmail, setPassword, onLogin, requestNotes, setRequestNotes }) {
  return (
    <main className="auth auth--gestor">
      <section className="auth__left auth__left--gestor">
        <div className="auth__brand">
          <div className="auth-brand-lockup">
            <div className="auth-brand-lockup__icon"><IconMark /></div>
            <div className="auth-brand-lockup__copy">
              <strong>VALENS</strong>
              <span>{VALENS_SUBTITLE}</span>
            </div>
          </div>
          <Badge tone="info" className="auth-brand-badge">Painel executivo</Badge>
        </div>

        <div className="auth__hero">
          <span className="auth-eyebrow">Gestão institucional</span>
          <h1>Indicadores assistenciais, operacionais e regulatórios em visão única.</h1>
          <p>Leitura rápida, hierarquia clara, navegação segura e visibilidade abrangente para gestão da rede de saúde.</p>
        </div>

        <div className="auth-kpi-grid">
          <KPI className="auth-info-card">
            <strong className="auth-info-card__title">Perfil</strong>
            <span className="auth-info-card__desc">Gestor com MFA obrigatório</span>
          </KPI>
          <KPI className="auth-info-card">
            <strong className="auth-info-card__title">Acesso</strong>
            <span className="auth-info-card__desc">Fluxo administrativo</span>
          </KPI>
          <KPI className="auth-info-card">
            <strong className="auth-info-card__title">Cobertura</strong>
            <span className="auth-info-card__desc">Multi-módulo por contexto</span>
          </KPI>
        </div>
      </section>

      <section className="auth__right auth__right--institutional">
        <Card className="auth-card auth-card--wide">
          <Button className="auth-back-link" variant="ghost" onClick={onBackToClinical}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Voltar ao acesso padrão
          </Button>

          <div className="auth-card__header">
            <h2>Acesso institucional</h2>
            <p>VALENS para coordenação, indicadores, metas e governança da rede assistencial.</p>
          </div>

          <Tabs className="auth-tabs">
            <Tab active>Entrar</Tab>
            <Tab>Solicitar acesso</Tab>
          </Tabs>

          <form className="auth-form auth-form--stacked" onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}>
            <Input label="E-mail institucional" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="gestor@organizacao.gov.br" autoComplete="email" />
            <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" autoComplete="current-password" />
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? "Entrando..." : "Acessar painel de gestão"}</Button>
          </form>

          <div className="auth-divider" />

          <div className="auth-request-box">
            <div className="auth-request-box__copy">
              <h3>Solicitar acesso institucional</h3>
              <p>Cadastro público sensível bloqueado. Solicitação segue fluxo administrativo autorizado.</p>
            </div>
            <Textarea
              label="Contexto da solicitação"
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
              rows={4}
              placeholder="Informe organização, cargo, jurisdição e motivo do acesso."
            />
            <Button variant="secondary" size="lg" disabled>Fluxo administrativo obrigatório</Button>
          </div>
        </Card>
      </section>
    </main>
  );
}

function AuthScreen({ onLogin, onRegister, error, busy }) {
  const [authTab, setAuthTab] = useState("login");
  const [loginMode, setLoginMode] = useState("clinical");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [reg, setReg] = useState({
    name: "",
    email: "",
    password: "",
    role: "receptionist",
    teamId: "",
    councilNumber: "",
    councilUf: "SP",
  });

  if (loginMode === "gestor") {
    return (
      <GestorAccessPanel
        onBackToClinical={() => setLoginMode("clinical")}
        error={error}
        busy={busy}
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        onLogin={onLogin}
        requestNotes={requestNotes}
        setRequestNotes={setRequestNotes}
      />
    );
  }

  return (
    <main className="auth auth--clinical">
      <section className="auth__left">
        <div className="auth__brand">
          <div className="auth-brand-lockup">
            <div className="auth-brand-lockup__icon"><IconMark /></div>
            <div className="auth-brand-lockup__copy">
              <strong>VALENS</strong>
              <span>{VALENS_SUBTITLE}</span>
            </div>
          </div>
        </div>

        <div className="auth__hero">
          <span className="auth-eyebrow">Acesso à plataforma</span>
          <h1>Infraestrutura centralizada para gestão integrada da saúde pública.</h1>
          <p>Segurança enterprise, rastreabilidade completa e módulos adaptados a cada contexto assistencial.</p>
        </div>

        <button className="auth-context-card" onClick={() => setLoginMode("gestor")}>
          <strong className="auth-context-card__title">Ambiente institucional</strong>
          <p className="auth-context-card__desc">Gestão, módulos e indicadores conforme o perfil de acesso.</p>
          <span className="auth-context-card__cta">Acessar painel →</span>
        </button>

        <div className="auth-kpi-grid">
          <KPI className="auth-info-card">
            <strong className="auth-info-card__title">Segurança</strong>
            <span className="auth-info-card__desc">MFA e controle de acesso</span>
          </KPI>
          <KPI className="auth-info-card">
            <strong className="auth-info-card__title">Conformidade</strong>
            <span className="auth-info-card__desc">LGPD e rastreabilidade</span>
          </KPI>
          <KPI className="auth-info-card">
            <strong className="auth-info-card__title">Multi-tenant</strong>
            <span className="auth-info-card__desc">Módulos por organização</span>
          </KPI>
        </div>
      </section>

      <section className="auth__right">
        <Card className="auth-card">
          <div className="auth-card__header">
            <h2>{authTab === "login" ? "Entrar na plataforma" : authTab === "register" ? "Criar acesso operacional" : "Recuperar credencial"}</h2>
            <p>{authTab === "login" ? VALENS_SUBTITLE : authTab === "register" ? "Fluxo público restrito a perfis operacionais permitidos." : "Fluxo seguro de redefinição de senha com backend como fonte de verdade."}</p>
          </div>

          <Tabs className="auth-tabs">
            <Tab active={authTab === "login"} onClick={() => setAuthTab("login")}>Entrar</Tab>
            <Tab active={authTab === "register"} onClick={() => setAuthTab("register")}>Novo acesso</Tab>
            <Tab active={authTab === "reset"} onClick={() => setAuthTab("reset")}>Recuperar senha</Tab>
          </Tabs>

          {authTab === "login" ? (
            <form className="auth-form auth-form--stacked" onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}>
              <Input label="E-mail institucional" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@organizacao.gov.br" autoComplete="email" />
              <Input label="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" autoComplete="current-password" />
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? "Entrando..." : "Acessar plataforma"}</Button>
            </form>
          ) : authTab === "register" ? (
            <form className="auth-form auth-form--stacked" onSubmit={(e) => { e.preventDefault(); onRegister(reg); }}>
              <Alert tone="warning">Cadastro público restrito a perfis operacionais autorizados. Perfis de gestão seguem fluxo administrativo.</Alert>
              <Input label="Nome completo" value={reg.name} onChange={(e) => setReg((s) => ({ ...s, name: e.target.value }))} placeholder="Maria da Silva" />
              <Input label="E-mail institucional" type="email" value={reg.email} onChange={(e) => setReg((s) => ({ ...s, email: e.target.value }))} placeholder="usuario@organizacao.gov.br" />
              <Input label="Senha" type="password" value={reg.password} onChange={(e) => setReg((s) => ({ ...s, password: e.target.value }))} placeholder="Mínimo 8 caracteres" hint="Use senha forte. Sessão passa a ser controlada por cookie seguro." />
              <Select label="Perfil" value={reg.role} onChange={(e) => setReg((s) => ({ ...s, role: e.target.value }))}>
                <option value="receptionist">Recepcionista</option>
              </Select>
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Button type="submit" variant="primary" size="lg" disabled={busy}>{busy ? "Criando..." : "Criar acesso operacional"}</Button>
            </form>
          ) : (
            <ResetPasswordForm />
          )}
        </Card>
      </section>
    </main>
  );
}

export default AuthScreen;
