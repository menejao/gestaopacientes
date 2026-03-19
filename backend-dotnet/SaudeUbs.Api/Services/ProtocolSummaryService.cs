using SaudeUbs.Api.Models;
using static SaudeUbs.Api.Services.AuthService;

namespace SaudeUbs.Api.Services;

public sealed class ProtocolSummaryService
{
    private static readonly Dictionary<string, ProtocolTemplate> DefaultProtocols = new(StringComparer.OrdinalIgnoreCase)
    {
        ["general"] = new() { Category = "general", Label = "Geral", Targets = new ProtocolTargets { Visits = 2, Consultations = 2, Vaccines = 1 }, Deadlines = new ProtocolTargets(), Vaccines = new List<string> { "Influenza" } },
        ["pregnant"] = new() { Category = "pregnant", Label = "Gestante", Targets = new ProtocolTargets { Visits = 3, Consultations = 7, Vaccines = 4 }, Deadlines = new ProtocolTargets(), Vaccines = new List<string> { "dTpa", "Influenza", "COVID-19", "Hepatite B" } },
        ["puerperal"] = new() { Category = "puerperal", Label = "Puérpera", Targets = new ProtocolTargets { Visits = 1, Consultations = 1, Vaccines = 0 }, Deadlines = new ProtocolTargets() },
        ["pap_only"] = new() { Category = "pap_only", Label = "Rastreamento Feminino/Trans", Targets = new ProtocolTargets { Visits = 0, Consultations = 1, Vaccines = 1 }, Deadlines = new ProtocolTargets(), Vaccines = new List<string> { "HPV" } },
        ["child_followup"] = new() { Category = "child_followup", Label = "Puericultura", Targets = new ProtocolTargets { Visits = 2, Consultations = 9, Vaccines = 0 }, Deadlines = new ProtocolTargets() },
        ["chronic"] = new() { Category = "chronic", Label = "Condição Crônica", Targets = new ProtocolTargets { Visits = 3, Consultations = 3, Vaccines = 2 }, Deadlines = new ProtocolTargets(), Vaccines = new List<string> { "Influenza", "COVID-19" } },
        ["elderly"] = new() { Category = "elderly", Label = "Pessoa Idosa", Targets = new ProtocolTargets { Visits = 2, Consultations = 1, Vaccines = 1 }, Deadlines = new ProtocolTargets(), Vaccines = new List<string> { "Influenza" } }
    };

    public List<HistoryItem> BuildPatientHistory(AppDb db, string patientId)
    {
        var appointments = db.Appointments
            .Where(a => a.PatientId == patientId)
            .Select(a => new HistoryItem
            {
                Id = a.Id,
                PatientId = patientId,
                Date = a.Date ?? "",
                Type = "appointment",
                Title = a.Summary ?? "",
                Details = string.Join(" | ", new[] { a.Conduct, a.NextStep }.Where(x => !string.IsNullOrWhiteSpace(x))),
                Source = "appointment"
            });

        var records = db.ClinicalRecords
            .Where(r => r.PatientId == patientId)
            .Select(r => new HistoryItem
            {
                Id = r.Id,
                PatientId = patientId,
                Date = r.Date ?? "",
                Type = r.Type ?? "",
                Title = r.Title ?? "",
                Details = r.Details ?? "",
                Source = "clinicalRecord"
            });

        return appointments
            .Concat(records)
            .OrderByDescending(x => ParseDate(x.Date) ?? DateTime.MinValue)
            .ToList();
    }

    public object BuildProtocolSummary(AppDb db, User authUser, Patient patient)
    {
        var templateMap = BuildTemplateMap(db, authUser.TeamId);
        var category = NormalizeCategory(patient.CareCategory, templateMap);
        var template = templateMap[category];
        var history = BuildPatientHistory(db, patient.Id);

        var completedVisits = history.Count(h => string.Equals(h.Type, "visit", StringComparison.OrdinalIgnoreCase));
        var completedConsultations = history.Count(IsClinicalConsultation);
        var completedVaccines = history.Count(h => string.Equals(h.Type, "vaccine", StringComparison.OrdinalIgnoreCase));

        var pendingVisits = Math.Max(template.Targets.Visits - completedVisits, 0);
        var pendingConsultations = Math.Max(template.Targets.Consultations - completedConsultations, 0);
        var pendingVaccines = Math.Max(template.Targets.Vaccines - completedVaccines, 0);

        var lastVisit = history.FirstOrDefault(h => string.Equals(h.Type, "visit", StringComparison.OrdinalIgnoreCase))?.Date ?? "";
        var lastConsult = history.FirstOrDefault(IsClinicalConsultation)?.Date ?? "";
        var lastVaccine = history.FirstOrDefault(h => string.Equals(h.Type, "vaccine", StringComparison.OrdinalIgnoreCase))?.Date ?? "";

        var specialAlerts = new List<object>();
        if (category == "chronic")
        {
            specialAlerts.AddRange(EvaluateChronic(patient, history));
        }
        else if (category == "elderly")
        {
            specialAlerts.AddRange(EvaluateElderly(history));
            specialAlerts.AddRange(EvaluateChronic(patient, history));
        }

        var appliedVaccineNames = history
            .Where(h => string.Equals(h.Type, "vaccine", StringComparison.OrdinalIgnoreCase))
            .Select(h => h.Title ?? "")
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();

        var normalizedApplied = appliedVaccineNames.Select(NormalizeText).ToList();
        var recommended = template.Vaccines.Select(v => new
        {
            name = v,
            done = normalizedApplied.Any(a => a.Contains(NormalizeText(v)))
        });

        return new
        {
            category = template.Category,
            categoryLabel = template.Label,
            targets = new
            {
                visits = template.Targets.Visits,
                consultations = template.Targets.Consultations,
                vaccines = template.Targets.Vaccines
            },
            completed = new
            {
                visits = completedVisits,
                consultations = completedConsultations,
                vaccines = completedVaccines
            },
            pending = new
            {
                visits = pendingVisits,
                consultations = pendingConsultations,
                vaccines = pendingVaccines
            },
            lastDates = new
            {
                visits = lastVisit,
                consultations = lastConsult,
                vaccines = lastVaccine
            },
            schedule = new
            {
                visits = BuildSchedule(lastVisit, template.Deadlines.Visits, pendingVisits),
                consultations = BuildSchedule(lastConsult, template.Deadlines.Consultations, pendingConsultations),
                vaccines = BuildSchedule(lastVaccine, template.Deadlines.Vaccines, pendingVaccines)
            },
            specialAlerts,
            vaccines = new
            {
                recommended,
                appliedNames = appliedVaccineNames.Distinct().ToList()
            }
        };
    }

    public string NormalizeCategoryForTeam(AppDb db, string teamId, string? inputCategory)
    {
        var map = BuildTemplateMap(db, teamId);
        return NormalizeCategory(inputCategory, map);
    }

    private static Dictionary<string, ProtocolTemplate> BuildTemplateMap(AppDb db, string teamId)
    {
        var map = DefaultProtocols.ToDictionary(k => k.Key, v => CloneTemplate(v.Value), StringComparer.OrdinalIgnoreCase);
        foreach (var t in db.ProtocolTemplates.Where(t => !t.Deleted && string.IsNullOrWhiteSpace(t.TeamId)))
        {
            map[t.Category] = CloneTemplate(t);
        }

        foreach (var t in db.ProtocolTemplates.Where(t => !t.Deleted && string.Equals(t.TeamId ?? "", teamId, StringComparison.Ordinal)))
        {
            map[t.Category] = CloneTemplate(t);
        }

        if (!map.ContainsKey("general")) map["general"] = CloneTemplate(DefaultProtocols["general"]);
        return map;
    }

    private static ProtocolTemplate CloneTemplate(ProtocolTemplate source) => new()
    {
        Category = source.Category,
        Label = source.Label,
        TeamId = source.TeamId,
        Deleted = source.Deleted,
        Targets = new ProtocolTargets
        {
            Visits = source.Targets.Visits,
            Consultations = source.Targets.Consultations,
            Vaccines = source.Targets.Vaccines
        },
        Deadlines = new ProtocolTargets
        {
            Visits = source.Deadlines.Visits,
            Consultations = source.Deadlines.Consultations,
            Vaccines = source.Deadlines.Vaccines
        },
        Vaccines = source.Vaccines?.ToList() ?? new List<string>()
    };

    private static string NormalizeCategory(string? category, Dictionary<string, ProtocolTemplate> map)
    {
        var key = (category ?? "").Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(key) && map.ContainsKey(key)) return key;
        return "general";
    }

    private static bool IsClinicalConsultation(HistoryItem item)
    {
        if (!string.Equals(item.Type, "consultation", StringComparison.OrdinalIgnoreCase)) return false;
        return !IsDentalText($"{item.Title} {item.Details}");
    }

    private static object BuildSchedule(string? lastDateText, int intervalDays, int pending)
    {
        var lastDate = ParseDate(lastDateText);
        var daysSince = DaysDiff(lastDate);
        int? daysLeft = null;
        var overdueDays = 0;

        if (intervalDays > 0)
        {
            daysLeft = daysSince is null ? intervalDays : intervalDays - daysSince.Value;
            overdueDays = daysSince is null ? 0 : Math.Max(daysSince.Value - intervalDays, 0);
        }

        return new
        {
            intervalDays,
            lastDate = lastDateText ?? "",
            daysSinceLast = daysSince,
            daysLeft,
            overdueDays,
            pending
        };
    }

    private static IEnumerable<object> EvaluateElderly(List<HistoryItem> history)
    {
        var now = DateTime.UtcNow.Date;
        var windowStart = now.AddDays(-365);
        var period = history.Where(h => (ParseDate(h.Date) ?? DateTime.MinValue) >= windowStart).ToList();
        var consultations = period.Count(IsClinicalConsultation);
        var visits = period.Where(h => h.Type == "visit").Select(h => ParseDate(h.Date)).Where(d => d is not null).Select(d => d!.Value).OrderBy(d => d).ToList();
        var hasFlu = period.Any(h => h.Type == "vaccine" && NormalizeText($"{h.Title} {h.Details}").Contains("influenza"));

        var alerts = new List<object>();
        if (consultations < 1)
        {
            alerts.Add(new { id = "elderly-consult-12m", activity = "consulta em 12 meses", title = "Consulta anual pendente", detail = "Necessária pelo menos 1 consulta médica ou de enfermagem em 12 meses.", severity = "high", categoryLabel = "Pessoa Idosa" });
        }
        var hasVisitsWith30DaysGap = false;
        for (var i = 1; i < visits.Count; i++)
        {
            if ((visits[i] - visits[i - 1]).TotalDays >= 30) { hasVisitsWith30DaysGap = true; break; }
        }
        if (!hasVisitsWith30DaysGap)
        {
            alerts.Add(new { id = "elderly-visits-12m", activity = "visitas ACS em 12 meses", title = "Visitas domiciliares pendentes", detail = "Necessárias 2 visitas do ACS com intervalo mínimo de 30 dias em 12 meses.", severity = "high", categoryLabel = "Pessoa Idosa" });
        }
        if (!hasFlu)
        {
            alerts.Add(new { id = "elderly-flu-12m", activity = "vacina influenza", title = "Vacina influenza pendente", detail = "Necessária 1 dose de influenza em 12 meses.", severity = "medium", categoryLabel = "Pessoa Idosa" });
        }
        return alerts;
    }

    private static IEnumerable<object> EvaluateChronic(Patient patient, List<HistoryItem> history)
    {
        var conditions = (patient.ChronicConditions ?? new List<string>())
            .Select(c => (c ?? "").Trim().ToLowerInvariant())
            .Where(c => c is "hypertension" or "diabetes")
            .Distinct()
            .ToList();

        if (conditions.Count == 0)
        {
            return Enumerable.Empty<object>();
        }

        var now = DateTime.UtcNow.Date;
        var h6 = history.Where(h => (ParseDate(h.Date) ?? DateTime.MinValue) >= now.AddDays(-183)).ToList();
        var h12 = history.Where(h => (ParseDate(h.Date) ?? DateTime.MinValue) >= now.AddDays(-365)).ToList();

        var consultDone = h6.Any(IsClinicalConsultation);
        var visits = h12.Where(h => h.Type == "visit").Select(h => ParseDate(h.Date)).Where(d => d is not null).Select(d => d!.Value).OrderBy(d => d).ToList();
        var visitsGap = false;
        for (var i = 1; i < visits.Count; i++)
        {
            if ((visits[i] - visits[i - 1]).TotalDays >= 30) { visitsGap = true; break; }
        }

        var outAlerts = new List<object>();
        foreach (var c in conditions)
        {
            var label = c == "diabetes" ? "Diabetes" : "Hipertensão";
            if (!consultDone)
            {
                outAlerts.Add(new { id = $"chronic-{c}-consult-6m", activity = "consulta em 6 meses", title = $"{label}: consulta semestral pendente", detail = "Necessária pelo menos 1 consulta médica ou de enfermagem nos últimos 6 meses.", severity = "high", categoryLabel = "Condição crônica" });
            }
            if (!visitsGap)
            {
                outAlerts.Add(new { id = $"chronic-{c}-visits-12m", activity = "visitas ACS em 12 meses", title = $"{label}: visitas domiciliares pendentes", detail = "Necessárias pelo menos 2 visitas do ACS com intervalo mínimo de 30 dias em 12 meses.", severity = "high", categoryLabel = "Condição crônica" });
            }

            if (c == "diabetes")
            {
                var texts = h12
                    .Where(h => h.Type is "consultation" or "procedure" or "note")
                    .Select(h => NormalizeText($"{h.Title} {h.Details}"))
                    .ToList();
                var hasHbA1c = texts.Any(t => t.Contains("hemoglobina glicada") || t.Contains("hba1c") || t.Contains("glicada"));
                var hasFoot = texts.Any(t => t.Contains("avaliacao dos pes") || t.Contains("avaliac") && t.Contains("pe"));
                if (!hasHbA1c)
                {
                    outAlerts.Add(new { id = "chronic-diabetes-hba1c-12m", activity = "hemoglobina glicada", title = "Diabetes: hemoglobina glicada pendente", detail = "Registrar solicitação/realização/avaliação de hemoglobina glicada em 12 meses.", severity = "high", categoryLabel = "Condição crônica" });
                }
                if (!hasFoot)
                {
                    outAlerts.Add(new { id = "chronic-diabetes-foot-12m", activity = "avaliação dos pés", title = "Diabetes: avaliação dos pés pendente", detail = "Registrar pelo menos 1 avaliação dos pés em 12 meses.", severity = "medium", categoryLabel = "Condição crônica" });
                }
            }
        }
        return outAlerts;
    }
}
