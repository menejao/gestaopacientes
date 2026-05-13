export function ExamCard({ exam, canManageUser, handleDelete, setPreview, isImg, fmtDate }) {
  const isExternal = String(exam.details || "").includes("[EXAME EXTERNO");
  const examCardClassName = `exam-card${isExternal ? " exam-card--external" : ""}`;
  const attachmentBadgeClassName = `exam-attachment-count${isExternal ? " exam-attachment-count--external" : ""}`;

  return (
    <div className={examCardClassName}>
      <div className="exam-card-header">
        <div>
          <div className="exam-card-title">{exam.title}</div>
          <div className="exam-card-date">{fmtDate(exam.date)}</div>
        </div>
        <div className="exam-card-actions">
          {Array.isArray(exam.attachments) && exam.attachments.length > 0 && (
            <span className={attachmentBadgeClassName}>
              {exam.attachments.length} anexo{exam.attachments.length > 1 ? "s" : ""}
            </span>
          )}
          {canManageUser && (
            <button className="icon-btn" title="Excluir" onClick={() => handleDelete(exam.id)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {exam.details && <pre className="exam-card-details">{exam.details.replace(/^\[EXAME.*?\]\n?/, "")}</pre>}
      {Array.isArray(exam.attachments) && exam.attachments.length > 0 && (
        <div className="exam-attachments">
          {exam.attachments.map((att, i) => (
            <button key={att.id || att.name || i} type="button" onClick={() => setPreview(att)} className="attachment-chip">
              {isImg(att.contentType) ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1.5 11l3.5-3 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              )}
              {att.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
