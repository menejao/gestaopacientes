import { useState, useEffect } from "react";
import { readLS, writeLS } from "../utils/storage";
import { QUEUE_KEY, NOTIFS_KEY, TRIAGE_VITALS_KEY } from "../config/constants";
import PageHeader from "../components/layout/PageHeader";
import Button from "../components/ui/Button";
import Avatar from "../components/ui/Avatar";

function shortName(n) { return n ? n.trim().split(" ")[0] : n; }

function bmiClass(bmi) {
  if (bmi < 18.5) return "low";
  if (bmi < 25)   return "normal";
  if (bmi < 30)   return "over";
  return "obese";
}

function bmiLabel(bmi) {
  if (bmi < 18.5) return "Abaixo do peso";
  if (bmi < 25)   return "Normal";
  if (bmi < 30)   return "Sobrepeso";
  return "Obesidade";
}

function painClass(n) {
  if (n <= 3) return "is-selected-low";
  if (n <= 6) return "is-selected-mid";
  return "is-selected-high";
}

function TriagePage({ patients, users, user }) {
  const [queue, setQueue]       = useState(() => readLS(QUEUE_KEY, []));
  const [selected, setSelected] = useState(null);
  const [vitals, setVitals]     = useState({ bp: "", bpD: "", weight: "", height: "", temp: "", spo2: "", hr: "", glucose: "", pain: "", notes: "" });
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setQueue(readLS(QUEUE_KEY, [])), 15000);
    return () => clearInterval(iv);
  }, []);

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY, q); }
  const pendingTriage = queue.filter(q => q.status === "waiting" || q.status === "triage");

  function startTriage(entry) {
    saveQueue(queue.map(q => q.id === entry.id
      ? { ...q, status: "triage", triageBy: user?.id, triageStart: new Date().toISOString() }
      : q));
    setSelected(entry);
    setVitals({ bp: "", bpD: "", weight: "", height: "", temp: "", spo2: "", hr: "", glucose: "", pain: "", notes: "" });
  }

  function cancelTriage() {
    saveQueue(queue.map(q => q.id === selected.id
      ? { ...q, status: "waiting", triageBy: null, triageStart: null }
      : q));
    setSelected(null);
  }

  function finishTriage(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const allVitals = readLS(TRIAGE_VITALS_KEY, {});
      allVitals[selected.id] = { ...vitals, by: user?.name || "Téc. Enf.", at: new Date().toISOString(), patientId: selected.patientId };
      writeLS(TRIAGE_VITALS_KEY, allVitals);
      saveQueue(queue.map(q => q.id === selected.id
        ? { ...q, status: "ready", triageBy: user?.id, triageDone: new Date().toISOString(), vitals }
        : q));
      const notif = {
        id: "triage_done_" + Date.now(), type: "info", icon: "check",
        title: `Triagem concluída: ${selected.patientName}`,
        detail: `Sinais vitais registrados. Paciente pronto.${vitals.bp ? ` PA: ${vitals.bp}/${vitals.bpD} mmHg` : ""}${vitals.weight ? ` · Peso: ${vitals.weight}kg` : ""}`,
        patientId: selected.patientId, dest: "all", ts: new Date().toISOString(), read: false,
      };
      writeLS(NOTIFS_KEY, [notif, ...readLS(NOTIFS_KEY, [])].slice(0, 50));
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  function fmtTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function waitMins(iso) {
    const m = Math.floor((new Date() - new Date(iso)) / 60000);
    return m < 1 ? "agora" : m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  }

  const onlineTechs = users.filter(u => u.role === "nursing_tech" && u.online);
  const readyQueue  = queue.filter(q => q.status === "ready");
  const bmiRaw      = vitals.weight && vitals.height
    ? parseFloat(vitals.weight) / Math.pow(parseFloat(vitals.height) / 100, 2)
    : null;
  const bmiValue = bmiRaw !== null && !isNaN(bmiRaw) ? parseFloat(bmiRaw.toFixed(1)) : null;

  return (
    <div className="triage-page">
      <PageHeader
        eyebrow="Téc. de Enfermagem"
        title="Monitoramento e Triagem"
        subtitle="Aferição de sinais vitais antes do atendimento."
        actions={
          <div className="triage-online">
            <span className="triage-online__label">Online:</span>
            {onlineTechs.length === 0
              ? <span className="triage-online__label">nenhum</span>
              : onlineTechs.map(u => (
                <span key={u.id} className="triage-online__badge">
                  <span className="triage-online__dot" />
                  {shortName(u.name)}
                </span>
              ))
            }
          </div>
        }
      />

      <div className="triage-body">
        <div className="triage-queue">
          <div className="triage-queue__label">Aguardando triagem ({pendingTriage.length})</div>

          {pendingTriage.length === 0 ? (
            <div className="triage-queue__empty">
              <div className="triage-queue__empty-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <div>Nenhum paciente aguardando</div>
            </div>
          ) : pendingTriage.map(entry => {
            const isMe   = entry.status === "triage" && entry.triageBy === user?.id;
            const isBusy = entry.status === "triage" && entry.triageBy !== user?.id;
            const techName = isBusy ? users.find(u => u.id === entry.triageBy)?.name : null;
            return (
              <div
                key={entry.id}
                className={`triage-entry${isMe ? " triage-entry--me" : isBusy ? " triage-entry--busy" : ""}`}
                onClick={() => { if (!isBusy && entry.status !== "triage") startTriage(entry); }}
              >
                <div className="triage-entry__name">{entry.patientName}</div>
                <div className="triage-entry__sub">Chegou {fmtTime(entry.arrivedAt)} · há {waitMins(entry.arrivedAt)}</div>
                {isMe   && <div className="triage-entry__status">→ Em triagem por você</div>}
                {isBusy && <div className="triage-entry__status">Em triagem: {shortName(techName || "outro técnico")}</div>}
                {!isMe && !isBusy && <div className="triage-entry__cta">Clique para iniciar →</div>}
              </div>
            );
          })}

          {readyQueue.length > 0 && (
            <div className="triage-ready">
              <div className="triage-ready__label">Prontos ({readyQueue.length})</div>
              {readyQueue.map(e => (
                <div key={e.id} className="triage-ready__entry">
                  <div>
                    <div className="triage-ready__name">{e.patientName}</div>
                    <div className="triage-ready__time">Concluído · {fmtTime(e.triageDone)}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="triage-form-panel">
          {!selected ? (
            <div className="triage-form-empty">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{ opacity: .2, marginBottom: "var(--s-4)" }}>
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>Selecione um paciente para iniciar a triagem.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="triage-pat-header">
                <div className="triage-pat-info">
                  <Avatar name={selected.patientName} />
                  <div>
                    <div className="triage-pat-name">{selected.patientName}</div>
                    <div className="triage-pat-sub">Triagem iniciada às {fmtTime(selected.triageStart || new Date().toISOString())}</div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" iconOnly type="button" onClick={cancelTriage}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Button>
              </div>

              <form className="triage-form" onSubmit={finishTriage}>
                <div>
                  <div className="triage-form__section-title">Pressão Arterial e FC</div>
                  <div className="triage-form__grid-4">
                    <label className="triage-form__field">
                      PA (mmHg)
                      <div className="triage-form__bp-row">
                        <input className="input" value={vitals.bp} onChange={e => setVitals(s => ({ ...s, bp: e.target.value }))} placeholder="120" inputMode="numeric" />
                        <span className="triage-form__bp-sep">/</span>
                        <input className="input" value={vitals.bpD} onChange={e => setVitals(s => ({ ...s, bpD: e.target.value }))} placeholder="80" inputMode="numeric" />
                      </div>
                    </label>
                    <label className="triage-form__field">
                      FC (bpm)
                      <input className="input" value={vitals.hr} onChange={e => setVitals(s => ({ ...s, hr: e.target.value }))} placeholder="72" inputMode="numeric" />
                    </label>
                    <label className="triage-form__field">
                      SpO₂ (%)
                      <input className="input" value={vitals.spo2} onChange={e => setVitals(s => ({ ...s, spo2: e.target.value }))} placeholder="98" inputMode="numeric" />
                    </label>
                    <label className="triage-form__field">
                      Temp (°C)
                      <input className="input" value={vitals.temp} onChange={e => setVitals(s => ({ ...s, temp: e.target.value }))} placeholder="36.5" inputMode="decimal" />
                    </label>
                  </div>
                </div>

                <div>
                  <div className="triage-form__section-title">Antropometria</div>
                  <div className="triage-form__grid-3">
                    <label className="triage-form__field">
                      Peso (kg)
                      <input className="input" value={vitals.weight} onChange={e => setVitals(s => ({ ...s, weight: e.target.value }))} placeholder="70.0" inputMode="decimal" />
                    </label>
                    <label className="triage-form__field">
                      Altura (cm)
                      <input className="input" value={vitals.height} onChange={e => setVitals(s => ({ ...s, height: e.target.value }))} placeholder="170" inputMode="numeric" />
                    </label>
                    <label className="triage-form__field">
                      Glicemia (mg/dL)
                      <input className="input" value={vitals.glucose} onChange={e => setVitals(s => ({ ...s, glucose: e.target.value }))} placeholder="100" inputMode="numeric" />
                    </label>
                  </div>
                  {bmiValue !== null && (
                    <div className={`triage-bmi triage-bmi--${bmiClass(bmiValue)}`}>
                      IMC: {bmiValue} — {bmiLabel(bmiValue)}
                    </div>
                  )}
                </div>

                <div>
                  <div className="triage-form__section-title">Dor (0–10)</div>
                  <div className="triage-pain">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setVitals(s => ({ ...s, pain: String(n) }))}
                        className={`triage-pain__btn${vitals.pain === String(n) ? ` ${painClass(n)}` : ""}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="triage-form__field">
                  Observações
                  <textarea
                    className="input"
                    value={vitals.notes}
                    onChange={e => setVitals(s => ({ ...s, notes: e.target.value }))}
                    placeholder="Queixas, histórico relevante..."
                    style={{ minHeight: 64, resize: "vertical" }}
                  />
                </label>

                <div className="triage-form__footer">
                  <Button type="button" variant="secondary" onClick={cancelTriage} style={{ flex: 1 }}>Cancelar</Button>
                  <Button type="submit" variant="primary" disabled={saving} style={{ flex: 2 }}>
                    {saving ? "Finalizando..." : "Finalizar triagem e notificar"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TriagePage;
