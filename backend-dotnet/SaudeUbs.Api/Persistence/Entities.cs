using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SaudeUbs.Api.Persistence;

[Table("teams")]
public sealed class TeamEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("name")]
    [MaxLength(200)]
    public string Name { get; set; } = "";

    [Column("manager_user_id")]
    [MaxLength(64)]
    public string? ManagerUserId { get; set; }

    [Column("created_at")]
    public DateTime? CreatedAt { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("users")]
public sealed class UserEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("name")]
    [MaxLength(200)]
    public string Name { get; set; } = "";

    [Column("role")]
    [MaxLength(40)]
    public string Role { get; set; } = "";

    [Column("email")]
    [MaxLength(255)]
    public string Email { get; set; } = "";

    [Column("password")]
    [MaxLength(300)]
    public string Password { get; set; } = "";

    [Column("team_id")]
    [MaxLength(64)]
    public string TeamId { get; set; } = "";

    [Column("last_login_at")]
    public DateTime? LastLoginAt { get; set; }

    [Column("last_seen_at")]
    public DateTime? LastSeenAt { get; set; }

    [Column("updated_at")]
    public DateTime? UpdatedAt { get; set; }

    [Column("two_factor_enabled")]
    public bool TwoFactorEnabled { get; set; }

    [Column("two_factor_secret")]
    [MaxLength(255)]
    public string? TwoFactorSecret { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("patients")]
public sealed class PatientEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("team_id")]
    [MaxLength(64)]
    public string TeamId { get; set; } = "";

    [Column("name")]
    [MaxLength(240)]
    public string Name { get; set; } = "";

    [Column("phone")]
    [MaxLength(32)]
    public string Phone { get; set; } = "";

    [Column("phone_alt")]
    [MaxLength(32)]
    public string? PhoneAlt { get; set; }

    [Column("cpf")]
    [MaxLength(24)]
    public string? Cpf { get; set; }

    [Column("cns")]
    [MaxLength(32)]
    public string? Cns { get; set; }

    [Column("cns_cpf")]
    [MaxLength(64)]
    public string? CnsCpf { get; set; }

    [Column("mother_name")]
    [MaxLength(240)]
    public string? MotherName { get; set; }

    [Column("address")]
    [MaxLength(500)]
    public string? Address { get; set; }

    [Column("micro_area")]
    [MaxLength(120)]
    public string? MicroArea { get; set; }

    [Column("assigned_acs_id")]
    [MaxLength(64)]
    public string? AssignedAcsId { get; set; }

    [Column("care_category")]
    [MaxLength(64)]
    public string? CareCategory { get; set; }

    [Column("chronic_conditions_json")]
    public string? ChronicConditionsJson { get; set; }

    [Column("birth_date")]
    [MaxLength(40)]
    public string? BirthDate { get; set; }

    [Column("created_at")]
    [MaxLength(40)]
    public string? CreatedAt { get; set; }

    [Column("created_by")]
    [MaxLength(64)]
    public string? CreatedBy { get; set; }

    [Column("updated_at")]
    [MaxLength(40)]
    public string? UpdatedAt { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("appointments")]
public sealed class AppointmentEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("patient_id")]
    [MaxLength(64)]
    public string PatientId { get; set; } = "";

    [Column("date")]
    [MaxLength(40)]
    public string? Date { get; set; }

    [Column("summary")]
    [MaxLength(4000)]
    public string? Summary { get; set; }

    [Column("conduct")]
    [MaxLength(4000)]
    public string? Conduct { get; set; }

    [Column("next_step")]
    [MaxLength(4000)]
    public string? NextStep { get; set; }

    [Column("demand_type")]
    [MaxLength(80)]
    public string? DemandType { get; set; }

    [Column("created_by")]
    [MaxLength(64)]
    public string? CreatedBy { get; set; }

    [Column("created_at")]
    [MaxLength(40)]
    public string? CreatedAt { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("clinical_records")]
public sealed class ClinicalRecordEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("patient_id")]
    [MaxLength(64)]
    public string PatientId { get; set; } = "";

    [Column("type")]
    [MaxLength(64)]
    public string Type { get; set; } = "";

    [Column("title")]
    [MaxLength(4000)]
    public string? Title { get; set; }

    [Column("details")]
    [MaxLength(8000)]
    public string? Details { get; set; }

    [Column("date")]
    [MaxLength(40)]
    public string? Date { get; set; }

    [Column("created_by")]
    [MaxLength(64)]
    public string? CreatedBy { get; set; }

    [Column("created_at")]
    [MaxLength(40)]
    public string? CreatedAt { get; set; }

    [Column("metadata_json")]
    public string? MetadataJson { get; set; }
}

[Table("tasks")]
public sealed class TaskEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("patient_id")]
    [MaxLength(64)]
    public string PatientId { get; set; } = "";

    [Column("title")]
    [MaxLength(500)]
    public string Title { get; set; } = "";

    [Column("notes")]
    [MaxLength(4000)]
    public string? Notes { get; set; }

    [Column("due_date")]
    [MaxLength(40)]
    public string? DueDate { get; set; }

    [Column("assignee_id")]
    [MaxLength(64)]
    public string? AssigneeId { get; set; }

    [Column("status")]
    [MaxLength(32)]
    public string Status { get; set; } = "pending";

    [Column("created_by")]
    [MaxLength(64)]
    public string? CreatedBy { get; set; }

    [Column("created_at")]
    [MaxLength(40)]
    public string? CreatedAt { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("messages")]
public sealed class MessageEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("patient_id")]
    [MaxLength(64)]
    public string PatientId { get; set; } = "";

    [Column("author_id")]
    [MaxLength(64)]
    public string? AuthorId { get; set; }

    [Column("author_name")]
    [MaxLength(240)]
    public string? AuthorName { get; set; }

    [Column("text")]
    [MaxLength(4000)]
    public string Text { get; set; } = "";

    [Column("created_at")]
    [MaxLength(40)]
    public string? CreatedAt { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("audit_logs")]
public sealed class AuditLogEntity
{
    [Key]
    [Column("id")]
    [MaxLength(64)]
    public string Id { get; set; } = "";

    [Column("patient_id")]
    [MaxLength(64)]
    public string? PatientId { get; set; }

    [Column("user_id")]
    [MaxLength(64)]
    public string? UserId { get; set; }

    [Column("user_name")]
    [MaxLength(240)]
    public string? UserName { get; set; }

    [Column("user_role")]
    [MaxLength(64)]
    public string? UserRole { get; set; }

    [Column("action")]
    [MaxLength(500)]
    public string Action { get; set; } = "";

    [Column("created_at")]
    [MaxLength(40)]
    public string? CreatedAt { get; set; }

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}

[Table("protocol_templates")]
public sealed class ProtocolTemplateEntity
{
    [Key]
    [Column("id")]
    [MaxLength(80)]
    public string Id { get; set; } = "";

    [Column("category")]
    [MaxLength(64)]
    public string Category { get; set; } = "";

    [Column("label")]
    [MaxLength(240)]
    public string Label { get; set; } = "";

    [Column("team_id")]
    [MaxLength(64)]
    public string? TeamId { get; set; }

    [Column("deleted")]
    public bool Deleted { get; set; }

    [Column("targets_json")]
    public string TargetsJson { get; set; } = "";

    [Column("deadlines_json")]
    public string DeadlinesJson { get; set; } = "";

    [Column("vaccines_json")]
    public string VaccinesJson { get; set; } = "";

    [Column("extra_json")]
    public string? ExtraJson { get; set; }
}
