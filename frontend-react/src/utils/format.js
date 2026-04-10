export function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

export function formatCpf(v) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatPhone(v) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/g, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/g, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function formatCep(v) {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

export function formatCns(v) {
  return onlyDigits(v).slice(0, 15);
}

export function initials(name) {
  return String(name || "").trim().split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "";
}
