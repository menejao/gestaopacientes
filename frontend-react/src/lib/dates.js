export function parseLocalDate(s) {
  if (!s) return null;
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y,m,d] = str.split("-").map(Number);
    const dt = new Date(y, m-1, d, 12, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

export function parseDateSafe(t) { return parseLocalDate(t); }

export function normalizeSearch(s) {
  return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
}

export function matchesPatientSearch(p, rawQuery) {
  const q = normalizeSearch(rawQuery);
  if (!q) return true;
  const name  = normalizeSearch(p.name);
  const cpf   = (p.cpf||"").replace(/\D/g,"");
  const phone = (p.phone||"").replace(/\D/g,"");
  const qd    = q.replace(/\D/g,"");
  return name.includes(q) || (qd.length>=3 && cpf.includes(qd)) || (qd.length>=3 && phone.includes(qd));
}

export function calcAge(birthDate) {
  if(!birthDate) return null;
  const b=parseLocalDate(birthDate); if(!b||isNaN(b)) return null;
  const now=new Date();
  let ay=now.getFullYear()-b.getFullYear();
  let am=now.getMonth()-b.getMonth();
  let ad=now.getDate()-b.getDate();
  if(ad<0){ am--; ad+=new Date(now.getFullYear(),now.getMonth(),0).getDate(); }
  if(am<0){ ay--; am+=12; }
  if(ay<0) return null;
  const totalDays=Math.floor((now-b)/86400000);
  if(ay===0&&am===0) return `${totalDays}d`;
  if(ay<2){
    const parts=[];
    if(ay>0) parts.push(`${ay}a`);
    if(am>0) parts.push(`${am}m`);
    if(ad>0) parts.push(`${ad}d`);
    return parts.join(" ")||"0d";
  }
  return `${ay}a`;
}

export function fmtDate(v) {
  if(!v) return "-";
  try {
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(Number);
      return new Date(y, m-1, d).toLocaleDateString("pt-BR");
    }
    return new Date(v).toLocaleDateString("pt-BR");
  } catch { return String(v); }
}
