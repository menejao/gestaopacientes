import { useEffect, useState } from "react";

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function OfflineBanner({ brandLabel }) {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="offline-banner">
      <div className="offline-banner-content">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M1 1l14 14M10.5 5A5 5 0 0114 9M6 3a7 7 0 018 8M3 6a5 5 0 011 7" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="13" r="1" fill="#f59e0b" />
        </svg>
        <span>Modo offline - dados locais disponiveis. Alteracoes serao sincronizadas ao reconectar.</span>
      </div>
      <span className="offline-brand-tag">{brandLabel}</span>
    </div>
  );
}
