import { useState, useRef } from "react";
import { auditLog } from "../utils/storage";
import { catLabel, matchesPatientSearch } from "../utils/clinical";
import { fmtDate } from "../utils/formatting";
import PageHeader from "../components/layout/PageHeader";
import Avatar from "../components/ui/Avatar";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

const EXAM_TYPES = ["Hemograma completo","Glicemia em jejum","HbA1c","Colesterol total e frações","Triglicerídeos","Creatinina","Ureia","TGO/TGP","TSH/T4 livre","Urina rotina (EAS)","Urocultura","Raio-X tórax","Ultrassonografia abdominal","Ultrassonografia obstétrica","ECG","Espirometria","Mamografia","Papanicolau","PSA","Ferritina/Ferro sérico","Vitamina D","Coagulograma","Outros"];

function isImg(t) { return String(t || "").startsWith("image/"); }

function ExamCard({ exam, canManage, onDelete, onPreview }) {
  const isExternal = String(exam.details || "").includes("[EXAME EXTERNO");
  const details = exam.details?.replace(/^\[EXAME.*?\]\n?/, "") || "";
  return (
    <div className={`exams-card${isExternal ? " exams-card--externo" : ""}`}>
      <div className="exams-card__head">
        <div>
          <div className="exams-card__title">{exam.title}</div>
          <div className="exams-card__date">{fmtDate(exam.date)}</div>
        </div>
        <div className="exams-card__actions">
          {Array.isArray(exam.attachments) && exam.attachments.length > 0 && (
            <span className="exams-card__badge">
              {exam.attachments.length} anexo{exam.attachments.length > 1 ? "s" : ""}
            </span>
          )}
          {canManage && (
            <button className="icon-btn" title="Excluir" onClick={() => onDelete(exam.id)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
      </div>
      {details && <pre className="exams-card__details">{details}</pre>}
      {Array.isArray(exam.attachments) && exam.attachments.length > 0 && (
        <div className="exams-card__attachments">
          {exam.attachments.map((att, i) => (
            <button key={i} type="button" className="exams-card__att-btn" onClick={() => onPreview(att)}>
              {isImg(att.contentType)
                ? <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 11l3.5-3 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3"/></svg>}
              {att.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamsPage({ patients, users, user, token, onNavigatePatient }) {
  const [search, setSearch]         = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [exams, setExams]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [addMode, setAddMode]       = useState(null);
  const [form, setForm]             = useState({ type: "Hemograma completo", name: "", date: "", result: "", notes: "" });
  const [files, setFiles]           = useState([]);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState("");
  const [preview, setPreview]       = useState(null);
  const fileRef = useRef(null);
  const authHeader = { Authorization: `Bearer ${token}` };

  const canManage = ["doctor", "dentist", "nurse_manager", "nursing_tech"].includes(user?.role);

  const filteredPats    = patients.filter(p => matchesPatientSearch(p, search)).slice(0, 60);
  const selectedPatient = patients.find(p => p.id === selectedId) || null;

  async function loadExams(pid) {
    if (!pid) { setExams([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/patients/${pid}/exams`, { headers: authHeader });
      if (res.ok) setExams(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  function selectPatient(p) {
    if (selectedId === p.id) { setSelectedId(null); setExams([]); return; }
    setSelectedId(p.id); loadExams(p.id); setAddMode(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.type === "Outros" ? form.name.trim() : form.type;
    if (!title || !form.date) { setError("Preencha tipo e data."); return; }
    setBusy(true); setError("");
    try {
      const tag   = addMode === "externo" ? "[EXAME EXTERNO — trazido pelo paciente]" : "[EXAME REALIZADO NO POSTO]";
      const notes = [tag, form.result.trim() ? `Resultado: ${form.result}` : "", form.notes.trim() ? `Obs: ${form.notes}` : ""].filter(Boolean).join("\n");
      const res = await fetch(`/patients/${selectedId}/exams`, {
        method: "POST", headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ title, date: form.date, notes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro");
      const created = await res.json();
      for (const file of files) {
        const fd = new FormData(); fd.append("file", file);
        await fetch(`/patients/${selectedId}/exams/${created.id}/attachments`, { method: "POST", headers: authHeader, body: fd });
      }
      auditLog(addMode === "externo" ? "EXAME_EXTERNO_INSERIDO" : "EXAME_POSTO_REGISTRADO", { patientId: selectedId, title, date: form.date }, user);
      setForm({ type: "Hemograma completo", name: "", date: "", result: "", notes: "" });
      setFiles([]); if (fileRef.current) fileRef.current.value = "";
      setAddMode(null); await loadExams(selectedId);
    } catch (err) { setError(err.message || "Erro."); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Excluir este exame?")) return;
    try {
      await fetch(`/patients/${selectedId}/exams/${id}`, { method: "DELETE", headers: authHeader });
      auditLog("EXAME_EXCLUIDO", { patientId: selectedId, examId: id }, user);
      await loadExams(selectedId);
    } catch { setError("Erro ao excluir."); }
  }

  function fmtSize(b) { return b > 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`; }

  const posto   = exams.filter(e => !String(e.details || "").includes("[EXAME EXTERNO"));
  const externo = exams.filter(e => String(e.details || "").includes("[EXAME EXTERNO"));

  return (
    <div className="exams-page">
      <PageHeader eyebrow="VALENS" title="Exames" subtitle="Exames realizados na unidade e exames externos trazidos pelos pacientes." />

      <div className="exams-body">
        <div className="exams-sidebar">
          <div className="exams-sidebar__search">
            <span className="exams-sidebar__search-icon">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            </span>
            <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente..." />
          </div>
          <div className="exams-pat-list">
            {filteredPats.length === 0 && <p className="exams-pat-empty">Nenhum paciente encontrado.</p>}
            {filteredPats.map(p => (
              <button key={p.id} className={`exams-pat-item${selectedId === p.id ? " is-active" : ""}`} onClick={() => selectPatient(p)}>
                <Avatar name={p.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="exams-pat-item__name">{p.name}</div>
                  <div className="exams-pat-item__sub">{catLabel([], p.careCategory)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="exams-panel">
          {!selectedPatient ? (
            <div className="exams-panel-empty">
              <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{ opacity: .25 }}>
                <path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="8" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M10 11.5l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              <span>Selecione um paciente para ver os exames</span>
            </div>
          ) : (
            <>
              <div className="exams-pat-header">
                <div>
                  <h2>{selectedPatient.name}</h2>
                  <div className="exams-pat-header__sub">{catLabel([], selectedPatient.careCategory)}</div>
                </div>
                {onNavigatePatient && (
                  <Button variant="secondary" size="sm" onClick={() => onNavigatePatient(selectedPatient.id)}>
                    Ver ficha →
                  </Button>
                )}
              </div>

              {canManage && (
                <div className="exams-add-bar">
                  <button
                    type="button"
                    className={`exams-add-btn exams-add-btn--posto${addMode === "posto" ? " is-active" : ""}`}
                    onClick={() => setAddMode(addMode === "posto" ? null : "posto")}
                  >
                    + Exame do posto
                  </button>
                  <button
                    type="button"
                    className={`exams-add-btn exams-add-btn--externo${addMode === "externo" ? " is-active" : ""}`}
                    onClick={() => setAddMode(addMode === "externo" ? null : "externo")}
                  >
                    + Exame externo
                  </button>
                </div>
              )}

              {addMode && (
                <div className={`exams-add-form exams-add-form--${addMode}`}>
                  <div className="exams-add-form__title">
                    {addMode === "externo" ? "Exame externo — trazido pelo paciente" : "Exame realizado na unidade"}
                  </div>
                  <form onSubmit={handleSubmit} className="exams-add-form__fields">
                    <div className="exams-add-form__grid">
                      <label className="exams-add-form__field">
                        Tipo de exame
                        <select className="select" value={form.type} onChange={e => setForm(s => ({ ...s, type: e.target.value }))}>
                          {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label className="exams-add-form__field">
                        Data *
                        <input className="input" type="date" value={form.date} onChange={e => setForm(s => ({ ...s, date: e.target.value }))} />
                      </label>
                    </div>
                    {form.type === "Outros" && (
                      <input className="input" value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))} placeholder="Nome do exame" />
                    )}
                    <label className="exams-add-form__field">
                      Resultado / laudo
                      <textarea className="input" value={form.result} onChange={e => setForm(s => ({ ...s, result: e.target.value }))} placeholder="Descreva o resultado..." style={{ minHeight: 52 }} />
                    </label>
                    <label className="exams-add-form__field">
                      Observações
                      <input className="input" value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} placeholder="Conduta, comparação..." />
                    </label>
                    <label className="exams-add-form__field">
                      Anexar arquivo (imagem ou PDF, máx 15MB)
                      <input type="file" ref={fileRef} accept="image/*,application/pdf" multiple onChange={e => {
                        const f = Array.from(e.target.files || []);
                        if (f.some(x => x.size > 15 * 1024 * 1024)) { setError("Arquivo muito grande"); return; }
                        setError(""); setFiles(f);
                      }} style={{ fontSize: "var(--t-xs)", padding: "var(--s-1) 0" }} />
                    </label>
                    {files.length > 0 && (
                      <div className="exams-add-form__tags">
                        {files.map((f, i) => <span key={i} className="exams-add-form__tag">{f.name} · {fmtSize(f.size)}</span>)}
                      </div>
                    )}
                    {error && <div className="alert alert--danger">{error}</div>}
                    <div className="exams-add-form__actions">
                      <Button type="submit" variant="primary" size="sm" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setAddMode(null)}>Cancelar</Button>
                    </div>
                  </form>
                </div>
              )}

              <div className="exams-section exams-section--posto">
                <div className="exams-section-label">
                  <span className="exams-section-label__dot" />
                  Realizados na unidade ({posto.length})
                </div>
                {loading
                  ? <p style={{ font: "400 var(--t-sm) var(--font-sans)", color: "var(--text-dim)" }}>Carregando...</p>
                  : !posto.length
                    ? <p style={{ font: "400 var(--t-sm) var(--font-sans)", color: "var(--text-dim)" }}>Nenhum exame registrado.</p>
                    : posto.map(exam => <ExamCard key={exam.id} exam={exam} canManage={canManage} onDelete={handleDelete} onPreview={setPreview} />)
                }
              </div>

              <div className="exams-section exams-section--externo">
                <div className="exams-section-label">
                  <span className="exams-section-label__dot" />
                  Trazidos pelo paciente ({externo.length})
                </div>
                {!externo.length
                  ? <p style={{ font: "400 var(--t-sm) var(--font-sans)", color: "var(--text-dim)" }}>Nenhum exame externo registrado.</p>
                  : externo.map(exam => <ExamCard key={exam.id} exam={exam} canManage={canManage} onDelete={handleDelete} onPreview={setPreview} />)
                }
              </div>
            </>
          )}
        </div>
      </div>

      {preview && (
        <Modal
          title={preview.name}
          onClose={() => setPreview(null)}
          actions={
            <a
              href={preview.url}
              download={preview.name}
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "var(--s-1)", font: "400 var(--t-sm) var(--font-sans)", padding: "var(--s-1) var(--s-3)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text-muted)", textDecoration: "none" }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              Baixar
            </a>
          }
        >
          <div className="exams-preview">
            {isImg(preview.contentType)
              ? <img className="exams-preview__img" src={preview.url} alt={preview.name} />
              : <iframe className="exams-preview__frame" src={preview.url} title={preview.name} />}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default ExamsPage;
