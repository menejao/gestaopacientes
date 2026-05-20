const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px 40px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
  .doc-header__brand { font-size: 18px; font-weight: 700; letter-spacing: -.5px; }
  .doc-header__meta { text-align: right; font-size: 11px; color: #555; }
  .doc-title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 16px; }
  .doc-section { margin-bottom: 16px; }
  .doc-section__label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #666; margin-bottom: 4px; }
  .doc-section__value { font-size: 13px; color: #111; }
  .doc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 32px; margin-bottom: 16px; }
  .doc-divider { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
  .doc-items { margin: 0; padding: 0; list-style: none; }
  .doc-items li { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  .doc-items li:last-child { border-bottom: none; }
  .doc-items__name { font-weight: 600; }
  .doc-items__detail { color: #555; font-size: 12px; margin-top: 2px; }
  .doc-footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
  .doc-footer__sig { text-align: center; }
  .doc-footer__sig-line { border-top: 1px solid #333; width: 220px; margin: 0 auto 6px; }
  .doc-footer__sig-name { font-size: 12px; font-weight: 600; }
  .doc-footer__sig-sub { font-size: 11px; color: #555; }
  .doc-footer__stamp { font-size: 11px; color: #555; text-align: right; }
  .doc-watermark { font-size: 10px; color: #aaa; margin-top: 8px; }
  @media print { body { padding: 0; } }
`;

function openPrintWindow(html) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 400);
}

function header(title, { unitName = "Unidade de Saúde", teamName = "", date = new Date().toLocaleDateString("pt-BR") } = {}) {
  return `
    <div class="doc-header">
      <div>
        <div class="doc-header__brand">Vitras · Saúde Pública</div>
        <div style="font-size:11px;color:#555;margin-top:2px;">${unitName}${teamName ? ` · ${teamName}` : ""}</div>
      </div>
      <div class="doc-header__meta">
        Data: ${date}<br/>Documento gerado por sistema informatizado
      </div>
    </div>
    <div class="doc-title">${title}</div>
  `;
}

function footer({ professionalName, councilLabel, councilNumber, councilUf, unitName } = {}) {
  const council = councilNumber ? `${councilLabel || "CRM"} ${councilNumber}${councilUf ? `/${councilUf}` : ""}` : "";
  return `
    <div class="doc-footer">
      <div class="doc-footer__sig">
        <div class="doc-footer__sig-line"></div>
        <div class="doc-footer__sig-name">${professionalName || "_________________________"}</div>
        ${council ? `<div class="doc-footer__sig-sub">${council}</div>` : ""}
      </div>
      <div class="doc-footer__stamp">
        ${unitName || ""}<br/>
        <span class="doc-watermark">Gerado por Vitras · ${new Date().toLocaleString("pt-BR")}</span>
      </div>
    </div>
  `;
}

export function printExamRequest({ patient, items = [], justification, professional, unit, team }) {
  const itemsHtml = items.length
    ? `<ul class="doc-items">${items.map(item => `<li><span class="doc-items__name">${item.name || item}</span>${item.detail ? `<div class="doc-items__detail">${item.detail}</div>` : ""}</li>`).join("")}</ul>`
    : `<p style="color:#555;">Nenhum exame especificado.</p>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido de Exame</title><style>${CSS}</style></head><body>
    ${header("Pedido de Exame", { unitName: unit?.name, teamName: team?.name })}
    <div class="doc-grid">
      <div class="doc-section">
        <div class="doc-section__label">Paciente</div>
        <div class="doc-section__value" style="font-weight:600;">${patient?.name || "—"}</div>
      </div>
      <div class="doc-section">
        <div class="doc-section__label">CNS</div>
        <div class="doc-section__value">${patient?.cns || "—"}</div>
      </div>
      <div class="doc-section">
        <div class="doc-section__label">Data de Nascimento</div>
        <div class="doc-section__value">${patient?.birthDate ? new Date(patient.birthDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
      </div>
      <div class="doc-section">
        <div class="doc-section__label">CPF</div>
        <div class="doc-section__value">${patient?.cpf || "—"}</div>
      </div>
    </div>
    <hr class="doc-divider"/>
    <div class="doc-section">
      <div class="doc-section__label">Exames Solicitados</div>
      ${itemsHtml}
    </div>
    ${justification ? `<div class="doc-section"><div class="doc-section__label">Justificativa / Hipótese Diagnóstica</div><div class="doc-section__value">${justification}</div></div>` : ""}
    ${footer({ professionalName: professional?.name, councilLabel: professional?.councilType, councilNumber: professional?.councilNumber, councilUf: professional?.councilUf, unitName: unit?.name })}
  </body></html>`;

  openPrintWindow(html);
}

export function printPrescription({ patient, medications = [], notes, professional, unit, team }) {
  const medsHtml = medications.length
    ? `<ul class="doc-items">${medications.map(m => {
        const name = m.name || m;
        const dosage = m.dosage ? ` — ${m.dosage}` : "";
        const instructions = m.instructions || m.detail || "";
        return `<li><span class="doc-items__name">${name}${dosage}</span>${instructions ? `<div class="doc-items__detail">${instructions}</div>` : ""}</li>`;
      }).join("")}</ul>`
    : `<p style="color:#555;">Nenhum medicamento especificado.</p>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Prescrição Médica</title><style>${CSS}</style></head><body>
    ${header("Prescrição Médica", { unitName: unit?.name, teamName: team?.name })}
    <div class="doc-grid">
      <div class="doc-section">
        <div class="doc-section__label">Paciente</div>
        <div class="doc-section__value" style="font-weight:600;">${patient?.name || "—"}</div>
      </div>
      <div class="doc-section">
        <div class="doc-section__label">CNS</div>
        <div class="doc-section__value">${patient?.cns || "—"}</div>
      </div>
      <div class="doc-section">
        <div class="doc-section__label">Data de Nascimento</div>
        <div class="doc-section__value">${patient?.birthDate ? new Date(patient.birthDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div>
      </div>
      <div class="doc-section">
        <div class="doc-section__label">CPF</div>
        <div class="doc-section__value">${patient?.cpf || "—"}</div>
      </div>
    </div>
    <hr class="doc-divider"/>
    <div class="doc-section">
      <div class="doc-section__label">Medicamentos Prescritos</div>
      ${medsHtml}
    </div>
    ${notes ? `<div class="doc-section"><div class="doc-section__label">Observações</div><div class="doc-section__value">${notes}</div></div>` : ""}
    <div style="margin-top:24px;padding:12px;border:1px solid #ddd;border-radius:4px;font-size:11px;color:#666;">
      Este documento tem validade de 30 dias a partir da data de emissão. Dispensação sujeita à apresentação de documento de identificação.
    </div>
    ${footer({ professionalName: professional?.name, councilLabel: professional?.councilType, councilNumber: professional?.councilNumber, councilUf: professional?.councilUf, unitName: unit?.name })}
  </body></html>`;

  openPrintWindow(html);
}
