export function AttachmentPreviewModal({ preview, setPreview, isImg }) {
  if (!preview) return null;

  return (
    <div className="modal-backdrop preview-backdrop" onClick={() => setPreview(null)}>
      <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <span className="preview-modal-title">{preview.name}</span>
          <div className="preview-modal-actions">
            <a href={preview.url} download={preview.name} target="_blank" rel="noreferrer" className="preview-download-link">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Baixar
            </a>
            <button className="icon-btn" onClick={() => setPreview(null)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="preview-modal-body">
          {isImg(preview.contentType) ? (
            <img src={preview.url} alt={preview.name} className="preview-media preview-media--image" />
          ) : (
            <iframe src={preview.url} title={preview.name} className="preview-media preview-media--frame" sandbox="allow-scripts allow-same-origin" />
          )}
        </div>
      </div>
    </div>
  );
}
