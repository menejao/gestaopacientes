import { useState, useEffect } from "react";
import PageHeader from "../components/layout/PageHeader";
import KPI from "../components/ui/KPI";
import { parseLocalDate } from "../utils/dates";
import { fmtDate } from "../utils/formatting";

function urgencyClass(dueDate, status, today) {
  if (status === "done") return "done";
  if (!dueDate) return "ok";
  const diff = Math.ceil((new Date(dueDate + "T00:00:00") - today) / 86400000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 3) return "soon";
  return "ok";
}

function urgencyLabel(dueDate, status, today) {
  if (status === "done" || !dueDate) return "";
  const diff = Math.ceil((new Date(dueDate + "T00:00:00") - today) / 86400000);
  if (diff < 0) return `Atrasada ${Math.abs(diff)}d`;
  if (diff === 0) return "Hoje";
  if (diff <= 3) return `${diff}d`;
  return `${diff}d`;
}

function AcsTasksPage({ patients, users, user, token, onNavigatePatient }) {
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("pending");

  useEffect(() => {
    if (!token) return;
    const myPatients = patients.filter(p => p.assignedAcsId === user?.id);
    if (!myPatients.length) { setAllTasks([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(myPatients.map(p =>
      fetch(`/patients/${p.id}/tasks`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(tasks => (Array.isArray(tasks) ? tasks : []).map(t => ({ ...t, patientId: p.id, patientName: p.name, patientBirth: p.birthDate, patientCareCategory: p.careCategory })))
        .catch(() => [])
    ))
      .then(results => { setAllTasks(results.flat()); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, patients, user?.id]);

  const myTasks = allTasks.filter(t => !t.assigneeId || t.assigneeId === user?.id);

  const filtered = myTasks.filter(t => {
    if (filter === "pending") return t.status !== "done";
    if (filter === "done")    return t.status === "done";
    return true;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const sorted = [...filtered].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate + "T00:00:00") : null;
    const db = b.dueDate ? new Date(b.dueDate + "T00:00:00") : null;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  });

  const overdueCount = myTasks.filter(t => t.status !== "done" && t.dueDate && parseLocalDate(t.dueDate) < today).length;
  const pendingCount = myTasks.filter(t => t.status !== "done").length;
  const doneCount    = myTasks.filter(t => t.status === "done").length;

  async function changeStatus(task, status) {
    try {
      await fetch(`/patients/${task.patientId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    } catch {}
  }

  return (
    <div className="acs-page">
      <PageHeader
        badge="Minha área"
        title="Tarefas"
        subtitle="Atividades atribuídas a você pela equipe de enfermagem"
      />

      <div className="acs-kpis">
        <KPI label="Pendentes" value={pendingCount} className="card" />
        <KPI label="Em atraso" value={overdueCount} className={`card${overdueCount > 0 ? " kpi--danger" : ""}`} />
        <KPI label="Concluídas" value={doneCount} className="card kpi--success" />
      </div>

      <div className="acs-filters">
        {[["pending", "Pendentes"], ["done", "Concluídas"], ["all", "Todas"]].map(([val, lbl]) => (
          <button key={val} type="button" className={`acs-filter-btn${filter === val ? " is-active" : ""}`} onClick={() => setFilter(val)}>
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="acs-loading">Carregando tarefas...</div>
      ) : !sorted.length ? (
        <div className="acs-empty">
          <div className="acs-empty__icon">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="acs-empty__title">{filter === "done" ? "Nenhuma tarefa concluída" : "Nenhuma tarefa pendente"}</div>
        </div>
      ) : (
        <div className="acs-task-list">
          {sorted.map(t => {
            const uc = urgencyClass(t.dueDate, t.status, today);
            const ul = urgencyLabel(t.dueDate, t.status, today);
            const done = t.status === "done";
            return (
              <div key={t.id} className={`acs-task acs-task--${uc}`}>
                <div className="acs-task__head">
                  <div className="acs-task__body">
                    <div className="acs-task__title-row">
                      <span className="acs-task__title">{t.title}</span>
                      {ul && !done && <span className="acs-task__urgency">{ul}</span>}
                    </div>
                    {t.notes && <p className="acs-task__notes">{t.notes}</p>}
                    <div className="acs-task__meta">
                      <button type="button" className="acs-task__pat-btn" onClick={() => onNavigatePatient && onNavigatePatient(t.patientId)}>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {t.patientName}
                      </button>
                      {t.dueDate && <span className="acs-task__due">Prazo: {fmtDate(t.dueDate)}</span>}
                    </div>
                  </div>
                  <select
                    className="acs-task__status"
                    value={t.status || "pending"}
                    onChange={e => changeStatus(t, e.target.value)}
                  >
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AcsTasksPage;
