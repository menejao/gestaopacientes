using Microsoft.EntityFrameworkCore;

namespace SaudeUbs.Api.Persistence;

public sealed class AppPgDbContext : DbContext
{
    public AppPgDbContext(DbContextOptions<AppPgDbContext> options) : base(options)
    {
    }

    public DbSet<TeamEntity> Teams => Set<TeamEntity>();
    public DbSet<UserEntity> Users => Set<UserEntity>();
    public DbSet<PatientEntity> Patients => Set<PatientEntity>();
    public DbSet<AppointmentEntity> Appointments => Set<AppointmentEntity>();
    public DbSet<TaskEntity> Tasks => Set<TaskEntity>();
    public DbSet<MessageEntity> Messages => Set<MessageEntity>();
    public DbSet<AuditLogEntity> AuditLogs => Set<AuditLogEntity>();
    public DbSet<ClinicalRecordEntity> ClinicalRecords => Set<ClinicalRecordEntity>();
    public DbSet<ProtocolTemplateEntity> ProtocolTemplates => Set<ProtocolTemplateEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<UserEntity>()
            .HasIndex(x => x.Email)
            .IsUnique();
        modelBuilder.Entity<PatientEntity>()
            .HasIndex(x => x.TeamId);
        modelBuilder.Entity<UserEntity>()
            .HasIndex(x => x.TeamId);
        modelBuilder.Entity<ClinicalRecordEntity>()
            .HasIndex(x => x.PatientId);
        modelBuilder.Entity<AppointmentEntity>()
            .HasIndex(x => x.PatientId);
        modelBuilder.Entity<TaskEntity>()
            .HasIndex(x => x.PatientId);
        modelBuilder.Entity<MessageEntity>()
            .HasIndex(x => x.PatientId);
        modelBuilder.Entity<AuditLogEntity>()
            .HasIndex(x => x.PatientId);
        modelBuilder.Entity<ProtocolTemplateEntity>()
            .HasIndex(x => new { x.TeamId, x.Category });
    }
}
