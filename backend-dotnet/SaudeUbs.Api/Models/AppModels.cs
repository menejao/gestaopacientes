using System.Text.Json;
using System.Text.Json.Serialization;
using SaudeUbs.Api.Services;

namespace SaudeUbs.Api.Models;

public sealed class AppConfig
{
    public string JwtSecret { get; init; } = "dev-only-jwt-secret-change-me";
    public string JwtIssuer { get; init; } = "saudeubs-backend";
    public string JwtAudience { get; init; } = "saudeubs-client";
    public int JwtExpiresHours { get; init; } = 12;
}

public sealed class AppDb
{
    [JsonPropertyName("teams")]
    public List<Team> Teams { get; set; } = new();

    [JsonPropertyName("users")]
    public List<User> Users { get; set; } = new();

    [JsonPropertyName("patients")]
    public List<Patient> Patients { get; set; } = new();

    [JsonPropertyName("appointments")]
    public List<Appointment> Appointments { get; set; } = new();

    [JsonPropertyName("clinicalRecords")]
    public List<ClinicalRecord> ClinicalRecords { get; set; } = new();

    [JsonPropertyName("protocolTemplates")]
    public List<ProtocolTemplate> ProtocolTemplates { get; set; } = new();
}

public sealed class Team
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("managerUserId")] public string? ManagerUserId { get; set; }
}

public sealed class User
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("role")] public string Role { get; set; } = "";
    [JsonPropertyName("email")] public string Email { get; set; } = "";
    [JsonPropertyName("password")] public string Password { get; set; } = "";
    [JsonPropertyName("teamId")] public string TeamId { get; set; } = "";
    [JsonPropertyName("lastLoginAt")] public string? LastLoginAt { get; set; }
    [JsonPropertyName("lastSeenAt")] public string? LastSeenAt { get; set; }
    [JsonPropertyName("updatedAt")] public string? UpdatedAt { get; set; }
    [JsonPropertyName("twoFactorEnabled")] public bool TwoFactorEnabled { get; set; }
    [JsonPropertyName("twoFactorSecret")] public string? TwoFactorSecret { get; set; }
}

public sealed class Patient
{
    [JsonPropertyName("id")] public string Id { get; set; } = Guid.NewGuid().ToString("N");
    [JsonPropertyName("teamId")] public string TeamId { get; set; } = "";
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("motherName")] public string? MotherName { get; set; }
    [JsonPropertyName("cpf")] public string? Cpf { get; set; }
    [JsonPropertyName("cns")] public string? Cns { get; set; }
    [JsonPropertyName("cnsCpf")] public string? CnsCpf { get; set; }
    [JsonPropertyName("address")] public string? Address { get; set; }
    [JsonPropertyName("phone")] public string Phone { get; set; } = "";
    [JsonPropertyName("phoneAlt")] public string? PhoneAlt { get; set; }
    [JsonPropertyName("microArea")] public string? MicroArea { get; set; }
    [JsonPropertyName("assignedAcsId")] public string? AssignedAcsId { get; set; }
    [JsonPropertyName("careCategory")] public string? CareCategory { get; set; }
    [JsonPropertyName("chronicConditions")] public List<string>? ChronicConditions { get; set; }
    [JsonPropertyName("birthDate")] public string? BirthDate { get; set; }
    [JsonPropertyName("createdAt")] public string? CreatedAt { get; set; }
    [JsonPropertyName("createdBy")] public string? CreatedBy { get; set; }
    [JsonPropertyName("updatedAt")] public string? UpdatedAt { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }
}

public sealed class Appointment
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("patientId")] public string PatientId { get; set; } = "";
    [JsonPropertyName("date")] public string? Date { get; set; }
    [JsonPropertyName("summary")] public string? Summary { get; set; }
    [JsonPropertyName("conduct")] public string? Conduct { get; set; }
    [JsonPropertyName("nextStep")] public string? NextStep { get; set; }
    [JsonPropertyName("demandType")] public string? DemandType { get; set; }
    [JsonPropertyName("createdBy")] public string? CreatedBy { get; set; }
    [JsonPropertyName("createdAt")] public string? CreatedAt { get; set; }
}

public sealed class ClinicalRecord
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("patientId")] public string PatientId { get; set; } = "";
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    [JsonPropertyName("title")] public string? Title { get; set; }
    [JsonPropertyName("details")] public string? Details { get; set; }
    [JsonPropertyName("date")] public string? Date { get; set; }
    [JsonPropertyName("createdBy")] public string? CreatedBy { get; set; }
    [JsonPropertyName("createdAt")] public string? CreatedAt { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, JsonElement>? Metadata { get; set; }
}

public sealed class ClinicalRecordRequest
{
    [JsonPropertyName("type")] public string Type { get; set; } = "";
    [JsonPropertyName("title")] public string Title { get; set; } = "";
    [JsonPropertyName("details")] public string? Details { get; set; }
    [JsonPropertyName("date")] public string Date { get; set; } = "";
    [JsonPropertyName("protocolTag")] public string? ProtocolTag { get; set; }
    [JsonPropertyName("metadata")] public Dictionary<string, JsonElement>? Metadata { get; set; }
}

public sealed class ProtocolTemplate
{
    [JsonPropertyName("category")] public string Category { get; set; } = "";
    [JsonPropertyName("label")] public string Label { get; set; } = "";
    [JsonPropertyName("teamId")] public string? TeamId { get; set; }
    [JsonPropertyName("deleted")] public bool Deleted { get; set; }
    [JsonPropertyName("targets")] public ProtocolTargets Targets { get; set; } = new();
    [JsonPropertyName("deadlines")] public ProtocolTargets Deadlines { get; set; } = new();
    [JsonPropertyName("vaccines")] public List<string> Vaccines { get; set; } = new();
}

public sealed class ProtocolTargets
{
    [JsonPropertyName("visits")] public int Visits { get; set; }
    [JsonPropertyName("consultations")] public int Consultations { get; set; }
    [JsonPropertyName("vaccines")] public int Vaccines { get; set; }
}

public sealed class LoginRequest
{
    [JsonPropertyName("email")] public string Email { get; set; } = "";
    [JsonPropertyName("password")] public string Password { get; set; } = "";
}

public sealed class PatientUpsertRequest
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("motherName")] public string? MotherName { get; set; }
    [JsonPropertyName("cpf")] public string? Cpf { get; set; }
    [JsonPropertyName("cns")] public string? Cns { get; set; }
    [JsonPropertyName("cnsCpf")] public string? CnsCpf { get; set; }
    [JsonPropertyName("address")] public string? Address { get; set; }
    [JsonPropertyName("phone")] public string Phone { get; set; } = "";
    [JsonPropertyName("phoneAlt")] public string? PhoneAlt { get; set; }
    [JsonPropertyName("microArea")] public string? MicroArea { get; set; }
    [JsonPropertyName("assignedAcsId")] public string? AssignedAcsId { get; set; }
    [JsonPropertyName("careCategory")] public string? CareCategory { get; set; }
    [JsonPropertyName("chronicConditions")] public List<string>? ChronicConditions { get; set; }
    [JsonPropertyName("birthDate")] public string? BirthDate { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }

    public Patient ToPatient(string teamId)
    {
        var patient = new Patient
        {
            Id = Guid.NewGuid().ToString("N"),
            TeamId = teamId,
            Name = (Name ?? "").Trim(),
            MotherName = (MotherName ?? "").Trim(),
            Cpf = (Cpf ?? "").Trim(),
            Cns = (Cns ?? "").Trim(),
            CnsCpf = !string.IsNullOrWhiteSpace(CnsCpf) ? CnsCpf.Trim() : (!string.IsNullOrWhiteSpace(Cpf) ? Cpf.Trim() : (Cns ?? "").Trim()),
            Address = (Address ?? "").Trim(),
            Phone = (Phone ?? "").Trim(),
            PhoneAlt = (PhoneAlt ?? "").Trim(),
            MicroArea = (MicroArea ?? "").Trim(),
            AssignedAcsId = (AssignedAcsId ?? "").Trim(),
            CareCategory = string.IsNullOrWhiteSpace(CareCategory) ? "general" : CareCategory.Trim().ToLowerInvariant(),
            ChronicConditions = AuthService.NormalizeChronicConditions(ChronicConditions),
            BirthDate = (BirthDate ?? "").Trim(),
            CreatedAt = DateTime.UtcNow.ToString("O")
        };

        if (Extra is not null)
        {
            patient.Extra = new Dictionary<string, JsonElement>(Extra);
        }
        return patient;
    }
}

public sealed class HistoryItem
{
    public string Id { get; set; } = "";
    public string PatientId { get; set; } = "";
    public string Date { get; set; } = "";
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string Details { get; set; } = "";
    public string Source { get; set; } = "";
}
