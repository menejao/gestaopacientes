import { useState } from "react";
import { readAuditLog, exportAuditLog } from "../utils/storage";
import Button from "../components/ui/Button";

const ACTION_LABELS = {
  LOGIN:                   { label: "Login",                 tone: "success" },
  LOGIN_FAILED:            { label: "Tentativa falha",       tone: "danger"  },
  LOGOUT:                  { label: "Logout",                tone: "neutral" },
  USUARIO_CADASTRADO:      { label: "Usuário cadastrado",    tone: "info"    },
  USUARIO_EDITADO:         { label: "Usuário editado",       tone: "warning" },
  USUARIO_EXCLUIDO:        { label: "Usuário excluído",      tone: "danger"  },
  PACIENTE_CADASTRADO:     { label: "Paciente cadastrado",   tone: "accent"  },
  PACIENTE_EDITADO:        { label: "Paciente editado",      tone: "accent"  },
  PACIENTE_EXCLUIDO:       { label: "Paciente excluído",     tone: "danger"  },
  ATENDIMENTO_REGISTRADO:  { label: "Atendimento",           tone: "info"    },
  TAREFA_CRIADA:           { label: "Tarefa criada",         tone: "warning" },
  MENSAGEM_ENVIADA:        { label: "Mensagem",              tone: "info"    },
  REGISTRO_INATIVADO:      { label: "Registro inativado",    tone: "warning" },
  ATENDIMENTO_EXCLUIDO:    { label: "Atendimento excluído",  tone: "danger"  },
  ACESSO_PRONTUARIO:       { label: "Acesso prontuário",     tone: "info"    },
  LANCAMENTO_REGISTRO:     { label: "Lançamento prontuário", tone: "info"    },
  INATIVACAO_REGISTRO:     { label: "Inativação prontuário", tone: "warning" },
  PEDIDO_EXAME:            { label: "Pedido de exame",       tone: "accent"  },
  PRESCRICAO_EMITIDA:      { label: "Prescrição emitida",    tone: "success" },
  ENCAMINHAMENTO_INTERNO:  { label: "Encaminhamento",        tone: "info"    },
  EXAME_POSTO_REGISTRADO:  { label: "Exame (posto)",         tone: "accent"  },
  EXAME_EXTERNO_INSERIDO:  { label: "Exame externo",         tone: "info"    },
  RESET_SENHA_SOLICITADO:  { label: "Reset de senha",        tone: "warning" },
  DISPENSACAO_FARMACIA:    { label: "Dispensação",           tone: "accent"  },
  ESTOQUE_AJUSTADO:        { label: "Ajuste de estoque",     tone: "warning" },
  MEDICAMENTO_CADASTRADO:  { label: "Medicamento cadastrado",tone: "success" },
  MEDICAMENTO_EDITADO:     { label: "Medicamento editado",   tone: "warning" },
  EXAME_EXCLUIDO:          { label: "Exame excluído",        tone: "danger"  },
};

function AuditLogPanel() {
  const [log]           = useState(() => readAuditLog());
  const [search, setSearch]       = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 50;

  const filtered = log.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (e.tsDisplay || "").includes(q)
        || (e.action || "").toLowerCase().includes(q)
        || (e.user?.name || "").toLowerCase().includes(q)
        || (e.user?.email || "").toLowerCase().includes(q)
        || JSON.stringify(e).toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const actions    = [...new Set(log.map(e => e.action))].sort();

  return (
    <div>
      <div className="audit-header">
        <div>
          <div className="audit-header__title">Trilha de Auditoria</div>
          <div className="audit-header__sub">{log.length} eventos registrados · Imutável · Exportável</div>
        </div>
        <Button variant="primary" size="sm" onClick={exportAuditLog}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Exportar CSV
        </Button>
      </div>

      <div className="audit-notice">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span>Esta trilha é <strong>somente leitura</strong>. Nenhum registro pode ser alterado ou excluído. Todos os eventos do sistema são gravados automaticamente com data, hora e usuário responsável.</span>
      </div>

      <div className="audit-toolbar">
        <input
          className="input"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por usuário, ação, detalhe..."
          style={{ flex: 1, minWidth: 200 }}
        />
        <select
          className="select"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          style={{ minWidth: 180 }}
        >
          <option value="">Todas as ações</option>
          {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th className="audit-table__th" style={{ width: 150 }}>Data / Hora</th>
              <th className="audit-table__th" style={{ width: 160 }}>Ação</th>
              <th className="audit-table__th" style={{ width: 160 }}>Usuário</th>
              <th className="audit-table__th">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {!paged.length && (
              <tr>
                <td colSpan={4} className="audit-table__td" style={{ textAlign: "center", padding: "var(--s-8)" }}>
                  Nenhum evento encontrado.
                </td>
              </tr>
            )}
            {paged.map(e => {
              const meta = ACTION_LABELS[e.action] || { label: e.action, tone: "neutral" };
              const details = Object.entries(e)
                .filter(([k]) => !["id", "ts", "tsDisplay", "action", "user"].includes(k))
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                .join(" · ");
              return (
                <tr key={e.id}>
                  <td className="audit-table__td audit-table__td--mono">
                    {e.tsDisplay || e.ts?.slice(0, 19).replace("T", " ") || "—"}
                  </td>
                  <td className="audit-table__td">
                    <span className={`audit-badge audit-badge--${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="audit-table__td">
                    {e.user ? (
                      <div>
                        <div className="audit-table__td--user-name">{e.user.name || "—"}</div>
                        <div className="audit-table__td--user-sub">{e.user.email} · {e.user.role}</div>
                      </div>
                    ) : <span style={{ color: "var(--text-dim)" }}>—</span>}
                  </td>
                  <td className="audit-table__td audit-table__td--details" title={details}>
                    {details || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="audit-pagination">
          <span>Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}</span>
          <div className="audit-pagination__btns">
            <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</Button>
            <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditLogPanel;
