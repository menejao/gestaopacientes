export function parseLocalDate(s) {
  if (!s) return null;
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return Number.isNaN(dt.getTime())  null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime())  null : dt;
}

export function fmtDate(value) {
  if (!value) return "-";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString("pt-BR");
}

export function calcAge(birthDate) {
  if (!birthDate) return null;
  const b = parseLocalDate(birthDate);
  if (!b) return null;
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  let days = now.getDate() - b.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  if (years === 0 && months === 0) {
    const totalDays = Math.floor((now - b) / 86400000);
    return `${totalDays}d`;
  }
  if (years < 2) {
    const parts = [];
    if (years > 0) parts.push(`${years}a`);
    if (months > 0) parts.push(`${months}m`);
    if (days > 0) parts.push(`${days}d`);
    return parts.join(" ") || "0d";
  }
  return `${years}a`;
}
