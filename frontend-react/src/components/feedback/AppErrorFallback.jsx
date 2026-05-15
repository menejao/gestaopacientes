function AppErrorFallback({ message }) {
  return (
    <div className="error-screen">
      <div className="error-screen__card">
        <div className="error-screen__icon">⚠</div>
        <h2>Ocorreu um erro inesperado</h2>
        <p>{message || "Erro desconhecido"}</p>
        <div className="error-screen__actions">
          <button className="btn btn--primary btn--lg" onClick={() => { sessionStorage.clear(); window.location.reload(); }}>
            Recarregar
          </button>
          <button className="btn btn--secondary btn--lg" onClick={() => { sessionStorage.clear(); localStorage.removeItem("saudeubs_react_session"); window.location.reload(); }}>
            Limpar sessão e recarregar
          </button>
        </div>
      </div>
    </div>
  );
}

export default AppErrorFallback;
