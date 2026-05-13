import { TENANT_CONFIGS, resolveTenantType } from "./tenant";

export function onlyDigits(v) { return String(v||"").replace(/\D/g,""); }
export function formatCpf(v)  { const d=onlyDigits(v).slice(0,11); return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2"); }
export function formatPhone(v) { const d=onlyDigits(v).slice(0,11); return d.length<=10 ? d.replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d{4})(\d)/,"$1-$2") : d.replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d{5})(\d)/,"$1-$2"); }
export function formatCep(v)  { const d=onlyDigits(v).slice(0,8); return d.replace(/^(\d{5})(\d)/,"$1-$2"); }
export function formatCns(v)  { return onlyDigits(v).slice(0,15); }
export function formatCouncil(v) {
  const d = onlyDigits(v).slice(0,6);
  if (d.length <= 3) return d;
  if (d.length === 5) return d.slice(0,2)+"."+d.slice(2);
  if (d.length === 6) return d.slice(0,3)+"."+d.slice(3);
  return d.slice(0,2)+"."+d.slice(2);
}

export function roleLabel(role) {
  return { nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS", pharmacist: "Farmacêutico(a)", pharmacy_tech: "Téc. de Farmácia", nursing_tech: "Téc. Enfermagem", receptionist: "Recepcionista", dentist: "Dentista", gestor: TENANT_CONFIGS[resolveTenantType()]?.texts?.gestorLabel ?? "Gestor(a)" }[String(role||"").toLowerCase()] || role || "-";
}

export function initials(name) { return String(name||"—").trim().split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"—"; }

export function toBoundedInt(v,min,max) { if(v===undefined||v===null||v==="") return null; const n=parseInt(String(v),10); return isNaN(n)?null:Math.min(max,Math.max(min,n)); }

export function displayText(value, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

export function isProfileIncomplete(p) {
  if (!p) return false;
  if (p.incompleteProfile === true) return true;
  if (String(p.id||"").startsWith("local_")) return true;
  return false;
}
