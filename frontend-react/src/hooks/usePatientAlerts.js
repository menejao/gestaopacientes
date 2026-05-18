import { useMemo } from "react";
import { gestationalAgeInfo, deriveProtocolAlerts } from "../utils/clinical";
import { parseLocalDate } from "../utils/dates";
import {
  vaccineApplied,
  getRosaIndicatorVaccines, getRosaGestanteVaccines,
  getRosaIdosoVaccines, getRosaHpvVaccines,
} from "../pages/VaccinesPage";

export function usePatientAlerts({ selectedPatient, patientProtocolSummary, history, isEquipeRosaUser }) {
  const rosaAdjustedSummary = useMemo(() => {
    try {
      if (!isEquipeRosaUser || !patientProtocolSummary || !selectedPatient) return patientProtocolSummary;
      const cat   = String(selectedPatient.careCategory || "").toLowerCase();
      const ageMs = selectedPatient.birthDate ? (Date.now() - (parseLocalDate(selectedPatient.birthDate) || new Date()).getTime()) : null;
      const ageMon = ageMs !== null ? ageMs / (1000 * 60 * 60 * 24 * 30.44) : null;
      const sex   = String(selectedPatient.sex || "").toLowerCase();

      let indicatorVaccines = [];
      if (cat === "child_followup" || (ageMon !== null && ageMon < 120)) {
        indicatorVaccines = getRosaIndicatorVaccines();
      } else if (cat === "pregnant") {
        const gi = gestationalAgeInfo(selectedPatient);
        indicatorVaccines = getRosaGestanteVaccines(gi ? gi.weeks : null);
      } else if (ageMon !== null && ageMon >= 720) {
        indicatorVaccines = getRosaIdosoVaccines();
      } else if (ageMon !== null && ageMon >= 108 && ageMon < 240) {
        const hpvVaccines = getRosaHpvVaccines(ageMon, sex);
        if (!hpvVaccines.length) return patientProtocolSummary;
        indicatorVaccines = hpvVaccines;
        const appliedVaccines = (history || []).filter(h => String(h.type || "").toLowerCase() === "vaccine");
        const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
        const hpvDone = hpvVaccines.filter(v =>
          v.aliases.some(alias => appliedVaccines.some(a => norm(a.title).includes(norm(alias))))
        ).length;
        return {
          ...patientProtocolSummary,
          completed: { ...(patientProtocolSummary.completed || {}), vaccines: (patientProtocolSummary.completed?.vaccines || 0) + hpvDone },
          targets:   { ...(patientProtocolSummary.targets   || {}), vaccines: (patientProtocolSummary.targets?.vaccines   || 0) + hpvVaccines.length },
          pending:   { ...(patientProtocolSummary.pending   || {}), vaccines: Math.max(0, (patientProtocolSummary.pending?.vaccines || 0) + (hpvVaccines.length - hpvDone)) },
        };
      }

      if (!indicatorVaccines.length) return patientProtocolSummary;

      const appliedVaccines = (history || []).filter(h => String(h.type || "").toLowerCase() === "vaccine");
      const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      const done   = indicatorVaccines.filter(v => v.aliases.some(alias => appliedVaccines.some(a => norm(a.title).includes(norm(alias))))).length;
      const target = indicatorVaccines.length;
      return {
        ...patientProtocolSummary,
        completed: { ...(patientProtocolSummary.completed || {}), vaccines: done },
        targets:   { ...(patientProtocolSummary.targets   || {}), vaccines: target },
        pending:   { ...(patientProtocolSummary.pending   || {}), vaccines: Math.max(0, target - done) },
      };
    } catch (e) { console.error("rosaAdjustedSummary error:", e); return patientProtocolSummary; }
  }, [isEquipeRosaUser, patientProtocolSummary, selectedPatient, history]);

  const sortedSpecialAlerts = useMemo(() => {
    try {
      if (rosaAdjustedSummary?.alertsRestricted) return [];
      const rank = { high: 0, medium: 1, low: 2 };
      let alerts = deriveProtocolAlerts(rosaAdjustedSummary);

      if (selectedPatient &&
          String(selectedPatient.careCategory || "").toLowerCase() === "child_followup" &&
          selectedPatient.birthDate) {
        const agedays = Math.floor((Date.now() - (parseLocalDate(selectedPatient.birthDate) || new Date()).getTime()) / 86400000);
        const visitsCompleted = Number(rosaAdjustedSummary?.completed?.visits ?? 0);
        const lost1st = agedays >= 31 && visitsCompleted === 0;
        const lost2nd = agedays >= 181 && visitsCompleted < 2;

        alerts = alerts.filter(a => {
          const t = String(a.title || "").toLowerCase();
          return !t.includes("visit") && !t.includes("visita");
        });

        if (!lost1st && visitsCompleted === 0) {
          const daysLeft = Math.max(30 - agedays, 0);
          alerts.push({ id: "puer-1a-visita", title: "1ª visita ACS pendente", detail: `Realizar até os 30 dias de vida. Restam ${daysLeft} dia(s).`, severity: daysLeft <= 5 ? "high" : "medium" });
        }
        if (!lost2nd && visitsCompleted < 2 && agedays >= 31) {
          const daysLeft = Math.max(180 - agedays, 0);
          alerts.push({ id: "puer-2a-visita", title: "2ª visita ACS pendente", detail: `Realizar do 2º ao 6º mês de vida. Restam ${daysLeft} dia(s).`, severity: daysLeft <= 15 ? "high" : "medium" });
        }

        const _consultsDone   = Number(rosaAdjustedSummary?.completed?.consultations ?? 0);
        const _consultsTarget = Number(rosaAdjustedSummary?.targets?.consultations ?? 0);
        const lostConsult1st  = _consultsTarget >= 1 && _consultsDone === 0 && agedays >= 31;
        const lostConsult2nd  = _consultsTarget >= 2 && _consultsDone < 2  && agedays >= 181;
        if (lostConsult1st || lostConsult2nd) {
          alerts = alerts.filter(a => {
            const t = String(a.title || "").toLowerCase();
            return !t.includes("consult") && !t.includes("consulta");
          });
        }
      }

      if (selectedPatient) {
        const cat    = String(selectedPatient.careCategory || "").toLowerCase();
        const ageMs  = selectedPatient.birthDate ? (Date.now() - (parseLocalDate(selectedPatient.birthDate) || new Date()).getTime()) : null;
        const ageMon = ageMs !== null ? ageMs / (1000 * 60 * 60 * 24 * 30.44) : null;
        const sex    = String(selectedPatient.sex || "").toLowerCase();
        const isCrianca = cat === "child_followup" || (ageMon !== null && ageMon < 120);

        alerts = alerts.filter(a => {
          const t = String(a.title || "").toLowerCase();
          return !(t.includes("vacina") || t.includes("vaccine") || t.includes("pendente:"));
        });

        let indicatorVaccines = [];
        if (isEquipeRosaUser) {
          if (isCrianca)
            indicatorVaccines = getRosaIndicatorVaccines();
          else if (cat === "pregnant") {
            const gi = gestationalAgeInfo(selectedPatient);
            indicatorVaccines = getRosaGestanteVaccines(gi ? gi.weeks : null);
          } else if (ageMon !== null && ageMon >= 720)
            indicatorVaccines = getRosaIdosoVaccines();
          else if (ageMon !== null && ageMon >= 108 && ageMon < 240)
            indicatorVaccines = getRosaHpvVaccines(ageMon, sex);
        } else if (isCrianca) {
          indicatorVaccines = getRosaIndicatorVaccines();
        }

        if (indicatorVaccines.length > 0) {
          const appliedVaccines = (history || []).filter(h => String(h.type || "").toLowerCase() === "vaccine");
          const pendingIndicator = indicatorVaccines.filter(v => !vaccineApplied(v, appliedVaccines, selectedPatient.birthDate));
          const vaccineAlerts = pendingIndicator
            .filter(v => { if (v.ageGroup !== "Criança" || ageMon === null) return true; return v.windowMin <= (ageMon + 2); })
            .map(v => {
              let dueDate = null;
              if (selectedPatient.birthDate && v.windowMin !== undefined) {
                const birth = parseLocalDate(selectedPatient.birthDate);
                dueDate = new Date(birth.getTime() + v.windowMin * 30.44 * 86400000);
              }
              const isOverdue  = dueDate && dueDate < new Date();
              const severity   = isOverdue ? "high" : "medium";
              const dueDateStr = dueDate ? dueDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
              const winLabel   = v.windowMin >= 12 ? `${Math.floor(v.windowMin / 12)}a` : `${v.windowMin}m`;
              return {
                id: `rosa-vac-${v.id}`,
                title: `Vacina pendente: ${v.name} (${winLabel})`,
                detail: dueDateStr
                  ? (isOverdue ? `Dose prevista aos ${winLabel} de vida (${dueDateStr}) — atrasada` : `Dose prevista aos ${winLabel} de vida (${dueDateStr}) — ainda não registrada`)
                  : `Dose prevista aos ${winLabel} de vida — ainda não identificada no histórico`,
                severity,
              };
            });
          alerts = [...alerts, ...vaccineAlerts];
        }
      }

      return [...alerts].sort((a, b) => {
        const ra = rank[String(a?.severity || "").toLowerCase()] ?? 3, rb = rank[String(b?.severity || "").toLowerCase()] ?? 3;
        return ra !== rb ? ra - rb : String(a?.title || "").localeCompare(String(b?.title || ""), "pt-BR");
      });
    } catch (e) { console.error("sortedSpecialAlerts error:", e); return []; }
  }, [rosaAdjustedSummary, selectedPatient, isEquipeRosaUser, history]);

  return { rosaAdjustedSummary, sortedSpecialAlerts };
}
