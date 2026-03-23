using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SaudeUbs.Api.Models;
using SaudeUbs.Api.Persistence;

namespace SaudeUbs.Api.Services;

public sealed class PgDbStore
{
    private readonly IDbContextFactory<AppPgDbContext> _ctxFactory;

    public PgDbStore(IDbContextFactory<AppPgDbContext> ctxFactory)
    {
        _ctxFactory = ctxFactory;
    }

    public async Task<bool> CanConnectAsync()
    {
        await using var ctx = await _ctxFactory.CreateDbContextAsync();
        return await ctx.Database.CanConnectAsync();
    }

    public async Task EnsureCreatedAsync()
    {
        await using var ctx = await _ctxFactory.CreateDbContextAsync();
        await ctx.Database.EnsureCreatedAsync();
    }

    public async Task<bool> IsEmptyAsync()
    {
        await using var ctx = await _ctxFactory.CreateDbContextAsync();
        var hasAny = await ctx.Teams.AnyAsync()
            || await ctx.Users.AnyAsync()
            || await ctx.Patients.AnyAsync()
            || await ctx.Appointments.AnyAsync()
            || await ctx.Tasks.AnyAsync()
            || await ctx.Messages.AnyAsync()
            || await ctx.AuditLogs.AnyAsync()
            || await ctx.ClinicalRecords.AnyAsync()
            || await ctx.ProtocolTemplates.AnyAsync();
        return !hasAny;
    }

    public async Task<AppDb> ReadAsync()
    {
        await using var ctx = await _ctxFactory.CreateDbContextAsync();

        var teams = await ctx.Teams.AsNoTracking().ToListAsync();
        var users = await ctx.Users.AsNoTracking().ToListAsync();
        var patients = await ctx.Patients.AsNoTracking().ToListAsync();
        var appointments = await ctx.Appointments.AsNoTracking().ToListAsync();
        var tasks = await ctx.Tasks.AsNoTracking().ToListAsync();
        var messages = await ctx.Messages.AsNoTracking().ToListAsync();
        var auditLogs = await ctx.AuditLogs.AsNoTracking().ToListAsync();
        var clinicalRecords = await ctx.ClinicalRecords.AsNoTracking().ToListAsync();
        var protocolTemplates = await ctx.ProtocolTemplates.AsNoTracking().ToListAsync();

        return new AppDb
        {
            Teams = teams.Select(ToModel).ToList(),
            Users = users.Select(ToModel).ToList(),
            Patients = patients.Select(ToModel).ToList(),
            Appointments = appointments.Select(ToModel).ToList(),
            Tasks = tasks.Select(ToModel).ToList(),
            Messages = messages.Select(ToModel).ToList(),
            AuditLogs = auditLogs.Select(ToModel).ToList(),
            ClinicalRecords = clinicalRecords.Select(ToModel).ToList(),
            ProtocolTemplates = protocolTemplates.Select(ToModel).ToList()
        };
    }

    public async Task WriteAsync(AppDb state)
    {
        await using var ctx = await _ctxFactory.CreateDbContextAsync();

        await using var tx = await ctx.Database.BeginTransactionAsync();

        await ctx.ClinicalRecords.ExecuteDeleteAsync();
        await ctx.Tasks.ExecuteDeleteAsync();
        await ctx.Messages.ExecuteDeleteAsync();
        await ctx.AuditLogs.ExecuteDeleteAsync();
        await ctx.Appointments.ExecuteDeleteAsync();
        await ctx.ProtocolTemplates.ExecuteDeleteAsync();
        await ctx.Patients.ExecuteDeleteAsync();
        await ctx.Users.ExecuteDeleteAsync();
        await ctx.Teams.ExecuteDeleteAsync();

        await ctx.Teams.AddRangeAsync(state.Teams.Select(ToEntity));
        await ctx.Users.AddRangeAsync(state.Users.Select(ToEntity));
        await ctx.Patients.AddRangeAsync(state.Patients.Select(ToEntity));
        await ctx.Appointments.AddRangeAsync(state.Appointments.Select(ToEntity));
        await ctx.Tasks.AddRangeAsync(state.Tasks.Select(ToEntity));
        await ctx.Messages.AddRangeAsync(state.Messages.Select(ToEntity));
        await ctx.AuditLogs.AddRangeAsync(state.AuditLogs.Select(ToEntity));
        await ctx.ClinicalRecords.AddRangeAsync(state.ClinicalRecords.Select(ToEntity));
        await ctx.ProtocolTemplates.AddRangeAsync(state.ProtocolTemplates.Select(ToEntity));

        await ctx.SaveChangesAsync();
        await tx.CommitAsync();
    }

    private static Team ToModel(TeamEntity e) => new()
    {
        Id = e.Id,
        Name = e.Name,
        ManagerUserId = e.ManagerUserId,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static TeamEntity ToEntity(Team m) => new()
    {
        Id = m.Id,
        Name = m.Name ?? "",
        ManagerUserId = m.ManagerUserId,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static User ToModel(UserEntity e) => new()
    {
        Id = e.Id,
        Name = e.Name,
        Role = e.Role,
        Email = e.Email,
        Password = e.Password,
        TeamId = e.TeamId,
        LastLoginAt = e.LastLoginAt?.ToString("O"),
        LastSeenAt = e.LastSeenAt?.ToString("O"),
        UpdatedAt = e.UpdatedAt?.ToString("O"),
        TwoFactorEnabled = e.TwoFactorEnabled,
        TwoFactorSecret = e.TwoFactorSecret,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static UserEntity ToEntity(User m) => new()
    {
        Id = m.Id,
        Name = m.Name ?? "",
        Role = m.Role ?? "",
        Email = m.Email ?? "",
        Password = m.Password ?? "",
        TeamId = m.TeamId ?? "",
        LastLoginAt = ParseDateTime(m.LastLoginAt),
        LastSeenAt = ParseDateTime(m.LastSeenAt),
        UpdatedAt = ParseDateTime(m.UpdatedAt),
        TwoFactorEnabled = m.TwoFactorEnabled,
        TwoFactorSecret = m.TwoFactorSecret,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static Patient ToModel(PatientEntity e) => new()
    {
        Id = e.Id,
        TeamId = e.TeamId,
        Name = e.Name,
        MotherName = e.MotherName,
        Cpf = e.Cpf,
        Cns = e.Cns,
        CnsCpf = e.CnsCpf,
        Address = e.Address,
        Phone = e.Phone,
        PhoneAlt = e.PhoneAlt,
        MicroArea = e.MicroArea,
        AssignedAcsId = e.AssignedAcsId,
        CareCategory = e.CareCategory,
        ChronicConditions = ParseJson<List<string>>(e.ChronicConditionsJson) ?? new List<string>(),
        BirthDate = e.BirthDate,
        CreatedAt = e.CreatedAt,
        CreatedBy = e.CreatedBy,
        UpdatedAt = e.UpdatedAt,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static PatientEntity ToEntity(Patient m) => new()
    {
        Id = m.Id,
        TeamId = m.TeamId ?? "",
        Name = m.Name ?? "",
        MotherName = m.MotherName,
        Cpf = m.Cpf,
        Cns = m.Cns,
        CnsCpf = m.CnsCpf,
        Address = m.Address,
        Phone = m.Phone ?? "",
        PhoneAlt = m.PhoneAlt,
        MicroArea = m.MicroArea,
        AssignedAcsId = m.AssignedAcsId,
        CareCategory = m.CareCategory,
        ChronicConditionsJson = SerializeJson(m.ChronicConditions ?? new List<string>()),
        BirthDate = m.BirthDate,
        CreatedAt = m.CreatedAt,
        CreatedBy = m.CreatedBy,
        UpdatedAt = m.UpdatedAt,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static Appointment ToModel(AppointmentEntity e) => new()
    {
        Id = e.Id,
        PatientId = e.PatientId,
        Date = e.Date,
        Summary = e.Summary,
        Conduct = e.Conduct,
        NextStep = e.NextStep,
        DemandType = e.DemandType,
        CreatedBy = e.CreatedBy,
        CreatedAt = e.CreatedAt,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static AppointmentEntity ToEntity(Appointment m) => new()
    {
        Id = m.Id,
        PatientId = m.PatientId,
        Date = m.Date,
        Summary = m.Summary,
        Conduct = m.Conduct,
        NextStep = m.NextStep,
        DemandType = m.DemandType,
        CreatedBy = m.CreatedBy,
        CreatedAt = m.CreatedAt,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static TaskItem ToModel(TaskEntity e) => new()
    {
        Id = e.Id,
        PatientId = e.PatientId,
        Title = e.Title,
        Notes = e.Notes,
        DueDate = e.DueDate,
        AssigneeId = e.AssigneeId,
        Status = string.IsNullOrWhiteSpace(e.Status) ? "pending" : e.Status,
        CreatedBy = e.CreatedBy,
        CreatedAt = e.CreatedAt,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static TaskEntity ToEntity(TaskItem m) => new()
    {
        Id = m.Id,
        PatientId = m.PatientId,
        Title = m.Title,
        Notes = m.Notes,
        DueDate = m.DueDate,
        AssigneeId = m.AssigneeId,
        Status = string.IsNullOrWhiteSpace(m.Status) ? "pending" : m.Status,
        CreatedBy = m.CreatedBy,
        CreatedAt = m.CreatedAt,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static MessageItem ToModel(MessageEntity e) => new()
    {
        Id = e.Id,
        PatientId = e.PatientId,
        AuthorId = e.AuthorId,
        AuthorName = e.AuthorName,
        Text = e.Text,
        CreatedAt = e.CreatedAt,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static MessageEntity ToEntity(MessageItem m) => new()
    {
        Id = m.Id,
        PatientId = m.PatientId,
        AuthorId = m.AuthorId,
        AuthorName = m.AuthorName,
        Text = m.Text,
        CreatedAt = m.CreatedAt,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static AuditLogItem ToModel(AuditLogEntity e) => new()
    {
        Id = e.Id,
        PatientId = e.PatientId,
        UserId = e.UserId,
        UserName = e.UserName,
        UserRole = e.UserRole,
        Action = e.Action,
        CreatedAt = e.CreatedAt,
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static AuditLogEntity ToEntity(AuditLogItem m) => new()
    {
        Id = m.Id,
        PatientId = m.PatientId,
        UserId = m.UserId,
        UserName = m.UserName,
        UserRole = m.UserRole,
        Action = m.Action,
        CreatedAt = m.CreatedAt,
        ExtraJson = SerializeJson(m.Extra)
    };

    private static ClinicalRecord ToModel(ClinicalRecordEntity e) => new()
    {
        Id = e.Id,
        PatientId = e.PatientId,
        Type = e.Type,
        Title = e.Title,
        Details = e.Details,
        Date = e.Date,
        CreatedBy = e.CreatedBy,
        CreatedAt = e.CreatedAt,
        Metadata = ParseJson<Dictionary<string, JsonElement>>(e.MetadataJson)
    };

    private static ClinicalRecordEntity ToEntity(ClinicalRecord m) => new()
    {
        Id = m.Id,
        PatientId = m.PatientId,
        Type = m.Type,
        Title = m.Title,
        Details = m.Details,
        Date = m.Date,
        CreatedBy = m.CreatedBy,
        CreatedAt = m.CreatedAt,
        MetadataJson = SerializeJson(m.Metadata)
    };

    private static ProtocolTemplate ToModel(ProtocolTemplateEntity e) => new()
    {
        Category = e.Category,
        Label = e.Label,
        TeamId = e.TeamId,
        Deleted = e.Deleted,
        Targets = ParseJson<ProtocolTargets>(e.TargetsJson) ?? new ProtocolTargets(),
        Deadlines = ParseJson<ProtocolTargets>(e.DeadlinesJson) ?? new ProtocolTargets(),
        Vaccines = ParseJson<List<string>>(e.VaccinesJson) ?? new List<string>(),
        Extra = ParseJson<Dictionary<string, JsonElement>>(e.ExtraJson)
    };

    private static ProtocolTemplateEntity ToEntity(ProtocolTemplate m)
    {
        var teamScope = string.IsNullOrWhiteSpace(m.TeamId) ? "global" : m.TeamId.Trim();
        var key = $"{teamScope}:{(m.Category ?? "").Trim().ToLowerInvariant()}";
        return new ProtocolTemplateEntity
        {
            Id = key,
            Category = m.Category ?? "",
            Label = m.Label ?? "",
            TeamId = string.IsNullOrWhiteSpace(m.TeamId) ? null : m.TeamId.Trim(),
            Deleted = m.Deleted,
            TargetsJson = SerializeJson(m.Targets ?? new ProtocolTargets()) ?? "{}",
            DeadlinesJson = SerializeJson(m.Deadlines ?? new ProtocolTargets()) ?? "{}",
            VaccinesJson = SerializeJson(m.Vaccines ?? new List<string>()) ?? "[]",
            ExtraJson = SerializeJson(m.Extra)
        };
    }

    private static DateTime? ParseDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return DateTime.TryParse(value, out var dt) ? dt : null;
    }

    private static string? SerializeJson<T>(T value)
    {
        return value is null ? null : JsonSerializer.Serialize(value);
    }

    private static T? ParseJson<T>(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return default;
        try
        {
            return JsonSerializer.Deserialize<T>(value);
        }
        catch
        {
            return default;
        }
    }
}
