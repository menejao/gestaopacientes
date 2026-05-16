import Chip from "../components/ui/Chip";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import KPI from "../components/ui/KPI";
import Table from "../components/ui/Table";
import Avatar from "../components/ui/Avatar";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import { readLS } from "../utils/storage";
import { AGENDA_KEY, RECEPTION_USERS, PHARMA_USERS } from "../config/constants";
import { buildProactiveAlerts, protocolChip, catLabel } from "../utils/clinical";
import { isAdmin, roleLabel } from "../utils/roles";

function Dashboard({ patients, users, allUsers, templates, protocolByPatient, demandMonthly, currentUser, onNavigate }) {
  const assigned = patients.filter((p) => String(p.assignedAcsId || "").trim()).length;
  const unassigned = Math.max(patients.length - assigned, 0);
  const acsCount = users.filter((u) => u.role === "acs").length;
  const docCount = users.filter((u) => u.role === "doctor").length;
  const pc = Object.values(protocolByPatient || {}).reduce((a, s) => {
    const chip = protocolChip(s);
    if (chip.tone === "danger") a.critical += 1;
    else if (chip.tone === "warn") a.attention += 1;
    else if (chip.tone === "ok") a.ok += 1;
    return a;
  }, { critical: 0, attention: 0, ok: 0 });

  const critical = patients.filter((p) => protocolChip(protocolByPatient[p.id]).tone === "danger").slice(0, 6);
  const dmTotal = demandMonthly?.totals?.total ?? 0;
  const dmSched = demandMonthly?.totals?.scheduled ?? 0;
  const dmSpont = demandMonthly?.totals?.spontaneous ?? 0;
  const dmPct = dmTotal > 0 ? Math.round((dmSched / dmTotal) * 100) : null;
  const dmInRange = dmPct !== null && dmPct >= 50 && dmPct <= 70;
  const dmStatus = dmPct === null ? "Sem dados" : dmInRange ? "Na meta" : dmPct < 50 ? "Abaixo da meta" : "Acima da meta";
  const dmTone = dmPct === null ? "neutral" : dmInRange ? "success" : dmPct < 50 ? "warning" : "danger";
  const isAna = isAdmin(currentUser);

  const localExtras = [...RECEPTION_USERS, ...PHARMA_USERS]
    .filter((lu) => !allUsers.some((au) => au.email?.toLowerCase() === lu.email?.toLowerCase()) && !users.some((u) => u.email?.toLowerCase() === lu.email?.toLowerCase()))
    .map((lu) => ({ ...lu, online: lu.id === currentUser?.id }));

  const adminUserList = [
    ...(allUsers.length ? allUsers : users).map((u) => (u.id === currentUser?.id ? { ...u, online: true } : u)),
    ...localExtras,
  ];

  const alerts = buildProactiveAlerts(
    patients,
    protocolByPatient,
    readLS("saudeubs_pharmacy_v1", []),
    readLS(AGENDA_KEY, []),
  ).slice(0, 6);

  return (
    <PageLayout className="dashboard dashboard--valens">
      <PageHeader
        eyebrow="VALENS"
        title="Visão operacional da unidade"
        subtitle="Plataforma integrada para gestão da saúde pública. Monitore pacientes, equipe, protocolos e alertas clínicos com densidade institucional."
        actions={
          <div className="dashboard__header-actions">
            <Chip tone={pc.critical > 0 ? "danger" : pc.attention > 0 ? "warn" : "ok"}>
              {pc.critical} crítico{pc.critical !== 1 ? "s" : ""}
            </Chip>
            <Chip tone="muted">{pc.ok} em dia</Chip>
          </div>
        }
      />

      <section className="dashboard__kpis">
        <KPI label="Pacientes ativos" value={patients.length} helper="Total cadastrado" className="card" />
        <KPI label="Com ACS definido" value={assigned} helper={`Sem ACS: ${unassigned}`} className="card" />
        <KPI
          label="Protocolos críticos"
          value={pc.critical}
          helper={`Atenção: ${pc.attention} · Em dia: ${pc.ok}`}
          className={`card ${pc.critical ? "kpi--danger" : pc.attention ? "kpi--warning" : "kpi--success"}`}
        />
        <KPI label="Profissionais" value={users.length} helper={`ACS: ${acsCount} · Médicos: ${docCount}`} className="card" />
      </section>

      {currentUser?.role === "nurse_manager" ? (
        <Card className={`dashboard__demand-card card--noPad ${dmTone !== "neutral" ? `kpi--${dmTone}` : ""}`}>
          <div className="card__header">
            <span className="card__title">Demanda programada</span>
            <Badge tone={dmTone}>{dmStatus}</Badge>
          </div>
          <div className="card__body">
            <div className="dashboard__demand-value-row">
              <strong className="dashboard__demand-value">{dmPct === null ? "—" : `${dmPct}%`}</strong>
            </div>
            {dmPct !== null ? (
              <div className="dashboard__meter" aria-hidden="true">
                <span className="dashboard__meter-target" />
                <span className={`dashboard__meter-fill dashboard__meter-fill--${dmTone}`} style={{ "--dashboard-meter": `${Math.min(dmPct, 100)}%` }} />
              </div>
            ) : null}
            <p className="dashboard__demand-foot">
              {dmPct === null ? "Nenhum atendimento registrado." : `${dmSched} programados · ${dmSpont} espontâneos · meta 50–70%`}
            </p>
          </div>
        </Card>
      ) : null}

      {isAna ? (
        <Card className="card--noPad">
          <div className="card__header">
            <div>
              <div className="card__title">Painel de contas</div>
              <div className="card__subtitle">
                {adminUserList.length} conta{adminUserList.length !== 1 ? "s" : ""} · {adminUserList.filter((u) => u.online).length} online
              </div>
            </div>
          </div>
          <Table className="table--dense">
            <thead>
              <tr>
                <th />
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...adminUserList]
                .sort((a, b) => {
                  const order = { nurse_manager: 0, doctor: 1, dentist: 2, nursing_tech: 3, pharmacist: 4, pharmacy_tech: 5, acs: 6, receptionist: 7 };
                  return (order[a.role] ?? 9) - (order[b.role] ?? 9);
                })
                .map((u) => {
                  const online = u.online === true;
                  return (
                    <tr key={u.id}>
                      <td><Avatar name={u.name} size="sm" /></td>
                      <td>{u.name}</td>
                      <td className="mono">{u.email || "-"}</td>
                      <td><Badge>{roleLabel(u.role)}</Badge></td>
                      <td>
                        <span className={`dashboard__presence ${online ? "is-online" : ""}`}>
                          <span className="dot" />
                          {online ? "Online" : "Offline"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {alerts.length ? (
        <section className="dashboard__alerts">
          <div className="dashboard__section-head">
            <div>
              <h2>Alertas proativos</h2>
              <p>{alerts.length} aviso{alerts.length !== 1 ? "s" : ""} priorizado{alerts.length !== 1 ? "s" : ""} por contexto clínico e operacional.</p>
            </div>
          </div>
          <div className="dashboard__alerts-grid">
            {alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`dashboard__alert-card dashboard__alert-card--${a.type}`}
                onClick={() => a.patientId && onNavigate && onNavigate(a.patientId)}
                disabled={!a.patientId}
              >
                <span className="dashboard__alert-icon">{a.icon}</span>
                <span className="dashboard__alert-copy">
                  <strong>{a.title}</strong>
                  <span>{a.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard__grid">
        <Card>
          <div className="card__header">
            <span className="card__title">Pacientes prioritários</span>
            <Chip tone="danger">{pc.critical} crítico{pc.critical !== 1 ? "s" : ""}</Chip>
          </div>
          <div className="card__body">
            {!critical.length ? (
              <p className="muted dashboard__empty-copy">Nenhum paciente com protocolo crítico.</p>
            ) : (
              <ul className="stack-list">
                {critical.map((p) => {
                  const chip = protocolChip(protocolByPatient[p.id]);
                  const acsName = users.find((u) => u.id === p.assignedAcsId)?.name || "Sem ACS";
                  return (
                    <li key={p.id}>
                      <div>
                        <p><strong>{p.name}</strong></p>
                        <p className="muted small">{catLabel(templates, p.careCategory)} · {acsName}</p>
                      </div>
                      <Chip tone={chip.tone}>{chip.text}</Chip>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="card__header">
            <span className="card__title">Equipe ativa</span>
            <Chip tone="muted">{users.length} membros</Chip>
          </div>
          <div className="card__body">
            {!users.length ? (
              <p className="muted dashboard__empty-copy">Nenhum membro na equipe.</p>
            ) : (
              <ul className="stack-list">
                {users.slice(0, 6).map((u) => (
                  <li key={u.id}>
                    <div className="dashboard__team-user">
                      <Avatar name={u.name} size="sm" />
                      <div>
                        <p><strong>{u.name}</strong></p>
                        <p className="muted small">{roleLabel(u.role)}</p>
                      </div>
                    </div>
                    <Chip tone="muted">
                      {u.role === "acs" ? "ACS" : u.role === "doctor" ? "Médico" : u.role === "nursing_tech" ? "Téc. Enf." : u.role === "pharmacist" ? "Farmac." : "Enf."}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>
    </PageLayout>
  );
}

export default Dashboard;
