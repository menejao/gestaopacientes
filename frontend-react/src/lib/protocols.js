import { parseDateSafe, parseLocalDate } from "./dates";
import { toBoundedInt } from "./formatters";
import { nextBusinessDay } from "./calendar";

export function gestationalAgeInfo(patient) {
  if(!patient) return null;
  const today=new Date(), usgRef=parseDateSafe(patient.usgDate1), usgW=toBoundedInt(patient.gestationalAgeUsgWeeks,0,45), usgD=toBoundedInt(patient.gestationalAgeUsgDays,0,6) ?? 0;
  if(usgRef&&usgW!==null){const base=usgW*7+usgD,elapsed=Math.max(0,Math.floor((today-usgRef)/86400000)),total=base+elapsed;return{weeks:Math.floor(total/7),days:total%7,source:"1ª USG"};}
  const dum=parseDateSafe(patient.pregnancyStartDate);
  if(dum){const elapsed=Math.max(0,Math.floor((today-dum)/86400000));return{weeks:Math.floor(elapsed/7),days:elapsed%7,source:"DUM"};}
  const dumW=toBoundedInt(patient.gestationalAgeDumWeeks,0,45),dumD=toBoundedInt(patient.gestationalAgeDumDays,0,6) ?? 0;
  if(dumW!==null) return{weeks:dumW,days:dumD,source:"DUM"};
  return null;
}

export function deriveProtocolAlerts(summary) {
  if(!summary) return [];
  const special=Array.isArray(summary.specialAlerts)?summary.specialAlerts:[];
  if(special.length) return special.map((a,i)=>({id:a?.id||`s-${i}`,title:a?.title||"Alerta clínico",detail:a?.detail||"",severity:String(a?.severity||"low").toLowerCase()}));
  const schedule=summary.schedule||{},out=[];
  for(const[key,label] of[["visits","visitas"],["consultations","consultas"],["vaccines","vacinas"]]){
    const s=schedule?.[key];
    if(!s||Number(s.pending||0)<=0) continue;
    const overdue=Number(s.overdueDays||0),daysLeft=typeof s.daysLeft==="number"?Number(s.daysLeft):null;
    let computedDaysLeft = daysLeft;
    let detail = "";
    let severity = "low";
    if (overdue >= 1) {
      severity = "high";
      detail = `Atrasado ${overdue} dia(s)`;
    } else if (computedDaysLeft !== null) {
      severity = computedDaysLeft <= 7 ? "medium" : "low";
      detail = `${Math.max(computedDaysLeft,0)} dia(s) para o prazo`;
    } else if (key === "visits" || key === "consultations") {
      const now = new Date();
      const endOfYear = new Date(now.getFullYear(), 11, 31);
      endOfYear.setHours(23, 59, 59, 999);
      computedDaysLeft = Math.max(0, Math.ceil((endOfYear.getTime() - now.getTime()) / 86400000));
      severity = computedDaysLeft <= 7 ? "high" : (computedDaysLeft <= 30 ? "medium" : "low");
      const limitDate = endOfYear.toLocaleDateString("pt-BR");
      detail = `Prazo anual até ${limitDate} (${computedDaysLeft} dia(s) restantes)`;
    } else {
      detail = "Sem prazo";
    }
    out.push({id:`sch-${key}`,title:`${label}: ${Number(s.pending||0)} pendente(s)`,detail,severity});
  }
  return out;
}

export function normalizeSeverity(value) {
  const v = String(value || "").toLowerCase();
  if (["high", "alto", "crítico", "critico", "vencido", "atrasado"].includes(v)) return "high";
  if (["medium", "médio", "medio", "atenção", "atencao"].includes(v)) return "medium";
  return "low";
}

export function alertWeight(alert) {
  const title = String(alert?.title || "").toLowerCase();
  const match = title.match(/(\d+)\s+pendente/);
  if (match) return Math.max(1, Number(match[1] || 1));
  return 1;
}

export function protocolChip(summary) {
  if(!summary) return{text:"Sem status",tone:"muted"};
  if(summary.alertsRestricted) return{text:"Sem alertas (outra equipe)",tone:"muted"};
  const pending=summary.pending||{};
  const total=Number(pending.visits||0)+Number(pending.consultations||0)+Number(pending.vaccines||0);
  const targets=summary.targets||{},completed=summary.completed||{};
  const doneTotal=Number(completed.visits||0)+Number(completed.consultations||0)+Number(completed.vaccines||0);
  const targetTotal=Number(targets.visits||0)+Number(targets.consultations||0)+Number(targets.vaccines||0);

  const allAlerts = deriveProtocolAlerts(summary);
  let criticalCount=0, nearCount=0;
  for(const a of allAlerts){
    const sev=normalizeSeverity(a?.severity);
    const overdue=Number.isFinite(Number(a?.overdueDays)) ? Number(a.overdueDays) : 0;
    const daysLeft=Number.isFinite(Number(a?.daysLeft))?Number(a.daysLeft):null;
    const weight = alertWeight(a);
    if (overdue >= 1 || (daysLeft !== null && daysLeft <= 2) || sev === "high") {
      criticalCount += weight;
    } else if (sev === "medium") {
      nearCount += weight;
    }
  }
  if(criticalCount>0) return{text:`Crítico (${criticalCount} item${criticalCount>1?"s":""} crítico${criticalCount>1?"s":""})`,tone:"danger"};
  if(nearCount>0) return{text:`Atenção (${nearCount} próximo${nearCount>1?"s":""})`,tone:"warn"};
  if(total<=0) return{text:`Em dia`,tone:"ok"};
  return{text:`No prazo (${doneTotal}/${targetTotal})`,tone:"muted"};
}

export const CAT_LABEL_PTBR = {
  general:       "Geral",
  pregnant:      "Gestante",
  puerperal:     "Puérpera",
  child_followup:"Puericultura",
  puericulture:  "Puericultura",
  elderly:       "Pessoa Idosa",
  chronic:       "Doença Crônica",
};

export function catLabel(templates, category) {
  return templates.find(t=>t.category===category)?.label
    || CAT_LABEL_PTBR[String(category||"").toLowerCase()]
    || category
    || "Geral";
}

export function suggestNextVisitDate(history, template) {
  const visits = (history||[])
    .filter(h => String(h.type||"").toLowerCase() === "visit")
    .map(h => ({ date: parseDateSafe(h.date), raw: h.date }))
    .filter(v => v.date)
    .sort((a, b) => b.date - a.date);

  const pendingVisits = Math.max((template?.targets?.visits||0) - visits.length, 0);
  if (pendingVisits <= 0) return null;

  const intervalDays = template?.deadlines?.visits || 30;
  const today = new Date(); today.setHours(0,0,0,0);

  if (!visits.length) {
    return { date: today.toISOString().slice(0,10), reason: "Nenhuma visita registrada ainda.", overdue: false, pendingVisits };
  }

  const lastVisit = parseLocalDate(visits[0].date); if(!lastVisit) return null; lastVisit.setHours(0,0,0,0);
  const daysSince = Math.floor((today - lastVisit) / 86400000);
  const nextDate = new Date(lastVisit);
  nextDate.setDate(nextDate.getDate() + Math.max(intervalDays, 30));
  const daysUntil = Math.floor((nextDate - today) / 86400000);
  const overdue = daysUntil < -1;

  return {
    date: nextBusinessDay((overdue ? today : nextDate).toISOString().slice(0,10)),
    reason: overdue
      ? `Última visita há ${daysSince} dias. Próxima está atrasada ${Math.abs(daysUntil)} dia(s).`
      : `Última visita há ${daysSince} dias. Próxima sugerida em ${daysUntil} dia(s).`,
    overdue,
    lastVisitDate: visits[0].raw,
    pendingVisits,
  };
}
