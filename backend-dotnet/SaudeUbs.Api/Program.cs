using System.Security.Claims;
using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SaudeUbs.Api.Models;
using SaudeUbs.Api.Persistence;
using SaudeUbs.Api.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var jwtSecret = (Environment.GetEnvironmentVariable("JWT_SECRET") ?? "dev-only-jwt-secret-change-me").Trim();
var jwtIssuer = (Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "saudeubs-backend").Trim();
var jwtAudience = (Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "saudeubs-client").Trim();
var jwtExpiresHours = int.TryParse(Environment.GetEnvironmentVariable("JWT_EXPIRES_HOURS"), out var h) ? Math.Max(1, h) : 12;
var databaseUrl = (Environment.GetEnvironmentVariable("DATABASE_URL") ?? "").Trim();

builder.Services.AddSingleton(new AppConfig
{
    JwtSecret = jwtSecret,
    JwtIssuer = jwtIssuer,
    JwtAudience = jwtAudience,
    JwtExpiresHours = jwtExpiresHours
});
builder.Services.AddSingleton<JsonDbStore>();
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<ProtocolSummaryService>();
if (!string.IsNullOrWhiteSpace(databaseUrl))
{
    builder.Services.AddDbContextFactory<AppPgDbContext>(options =>
        options.UseNpgsql(databaseUrl));
    builder.Services.AddSingleton<PgDbStore>();
}
builder.Services.AddSingleton<AppStateStore>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();
var loginChallenges = new ConcurrentDictionary<string, (string UserId, DateTime ExpiresAt)>(StringComparer.Ordinal);

app.MapGet("/health", () => Results.Ok(new { ok = true, timestamp = DateTime.UtcNow }));
app.MapGet("/health/persistence", async (AppStateStore store) =>
{
    var (mode, connected) = await store.GetPersistenceStatusAsync();
    return Results.Ok(new { mode, connected });
});

app.MapGet("/teams/public", async (AppStateStore store) =>
{
    var state = await store.ReadAsync();
    var teams = state.Teams
        .Select(t => new { id = t.Id, name = t.Name })
        .OrderBy(t => t.name, StringComparer.OrdinalIgnoreCase)
        .ToList();
    return Results.Ok(teams);
});

app.MapGet("/integrations/council/status", () =>
{
    return Results.Ok(new { enabled = false, mode = "local" });
});

app.MapPost("/auth/register", async (Dictionary<string, JsonElement> req, AppStateStore store, AuthService auth) =>
{
    var name = ReadJsonString(req, "name");
    var email = ReadJsonString(req, "email").ToLowerInvariant();
    var password = ReadJsonString(req, "password");
    var teamId = ReadJsonString(req, "teamId");
    var role = auth.CanonicalRole(ReadJsonString(req, "role"));
    var councilNumber = ReadJsonString(req, "councilNumber");
    var councilUf = ReadJsonString(req, "councilUf").ToUpperInvariant();

    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
    {
        return Results.BadRequest(new { error = "name, email e password são obrigatórios" });
    }

    if (string.IsNullOrWhiteSpace(teamId))
    {
        return Results.BadRequest(new { error = "teamId é obrigatório" });
    }

    if (role is not ("nurse_manager" or "doctor" or "acs"))
    {
        return Results.BadRequest(new { error = "Perfil inválido" });
    }

    var state = await store.ReadAsync();
    var team = state.Teams.FirstOrDefault(t => string.Equals(t.Id, teamId, StringComparison.Ordinal));
    if (team is null) return Results.BadRequest(new { error = "Equipe inválida" });

    if (state.Users.Any(u => string.Equals((u.Email ?? "").Trim(), email, StringComparison.OrdinalIgnoreCase)))
    {
        return Results.BadRequest(new { error = "E-mail já cadastrado" });
    }

    var user = new User
    {
        Id = Guid.NewGuid().ToString("N"),
        Name = name,
        Email = email,
        Password = password,
        Role = role,
        TeamId = teamId
    };
    user.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber))
    {
        user.Extra["councilNumber"] = JsonDocument.Parse($"\"{councilNumber}\"").RootElement.Clone();
    }
    if (!string.IsNullOrWhiteSpace(councilUf))
    {
        user.Extra["councilUf"] = JsonDocument.Parse($"\"{councilUf}\"").RootElement.Clone();
    }

    state.Users.Add(user);
    await store.WriteAsync(state);

    var safeUser = auth.SanitizeUser(state, user);
    var token = auth.CreateToken(user);
    return Results.Ok(new { user = safeUser, token });
});

app.MapPost("/auth/register/request-code", () =>
{
    return Results.BadRequest(new { error = "Fluxo de código desativado. Use /auth/register." });
});

app.MapPost("/auth/register/confirm", () =>
{
    return Results.BadRequest(new { error = "Fluxo de código desativado. Use /auth/register." });
});

app.MapPost("/auth/login", async (LoginRequest req, AppStateStore store, AuthService auth) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
    {
        return Results.BadRequest(new { error = "email e password sÃ£o obrigatÃ³rios" });
    }

    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u =>
        string.Equals((u.Email ?? "").Trim(), req.Email.Trim(), StringComparison.OrdinalIgnoreCase)
        && auth.VerifyPassword(req.Password, u.Password ?? ""));

    if (user is null && auth.IsDemoAnaCredential(req.Email, req.Password))
    {
        user = state.Users.FirstOrDefault(u =>
            string.Equals((u.Email ?? "").Trim(), "ana@clinica.local", StringComparison.OrdinalIgnoreCase));
    }

    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (user.TwoFactorEnabled)
    {
        var challengeId = Guid.NewGuid().ToString("N");
        loginChallenges[challengeId] = (user.Id, DateTime.UtcNow.AddMinutes(5));
        return Results.Ok(new { twoFactorRequired = true, challengeId });
    }

    user.LastLoginAt = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = user.LastLoginAt;
    user.UpdatedAt = user.LastLoginAt;

    await store.WriteAsync(state);

    var safeUser = auth.SanitizeUser(state, user);
    var token = auth.CreateToken(user);
    return Results.Ok(new { user = safeUser, token });
});

app.MapPost("/auth/login/verify", async (Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth) =>
{
    var challengeId = ReadJsonString(payload, "challengeId");
    var code = ReadJsonString(payload, "code");
    if (string.IsNullOrWhiteSpace(challengeId) || string.IsNullOrWhiteSpace(code))
    {
        return Results.BadRequest(new { error = "challengeId e code são obrigatórios" });
    }
    if (!loginChallenges.TryGetValue(challengeId, out var challenge))
    {
        return Results.BadRequest(new { error = "Desafio inválido ou expirado" });
    }
    if (challenge.ExpiresAt < DateTime.UtcNow)
    {
        loginChallenges.TryRemove(challengeId, out _);
        return Results.BadRequest(new { error = "Desafio expirado" });
    }
    if (code.Length != 6 || !code.All(char.IsDigit))
    {
        return Results.BadRequest(new { error = "Código 2FA inválido" });
    }

    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == challenge.UserId);
    if (user is null) return Results.BadRequest(new { error = "Usuário do desafio não encontrado" });

    user.LastLoginAt = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = user.LastLoginAt;
    user.UpdatedAt = user.LastLoginAt;
    await store.WriteAsync(state);
    loginChallenges.TryRemove(challengeId, out _);

    var safeUser = auth.SanitizeUser(state, user);
    var token = auth.CreateToken(user);
    return Results.Ok(new { user = safeUser, token });
});

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/me", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
    return Results.Ok(auth.SanitizeUser(state, user));
}).RequireAuthorization();

app.MapPost("/me/presence", async (ClaimsPrincipal principal, AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    var now = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = now;
    user.UpdatedAt = now;
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true, lastSeenAt = now });
}).RequireAuthorization();

app.MapPatch("/me", async (
    ClaimsPrincipal principal,
    Dictionary<string, JsonElement> payload,
    AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });

    var nextName = ReadJsonString(payload, "name");
    var nextEmail = ReadJsonString(payload, "email");
    var nextPassword = ReadJsonString(payload, "password");
    var councilNumber = ReadJsonString(payload, "councilNumber");
    var councilUf = ReadJsonString(payload, "councilUf").ToUpperInvariant();

    if (!string.IsNullOrWhiteSpace(nextName)) user.Name = nextName;
    if (!string.IsNullOrWhiteSpace(nextEmail))
    {
        var normalized = nextEmail.ToLowerInvariant();
        if (state.Users.Any(u => u.Id != user.Id && string.Equals((u.Email ?? "").Trim(), normalized, StringComparison.OrdinalIgnoreCase)))
        {
            return Results.BadRequest(new { error = "E-mail já utilizado por outro usuário" });
        }
        user.Email = normalized;
    }
    if (!string.IsNullOrWhiteSpace(nextPassword)) user.Password = nextPassword;

    user.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber))
    {
        user.Extra["councilNumber"] = JsonDocument.Parse($"\"{councilNumber}\"").RootElement.Clone();
    }
    if (!string.IsNullOrWhiteSpace(councilUf))
    {
        user.Extra["councilUf"] = JsonDocument.Parse($"\"{councilUf}\"").RootElement.Clone();
    }

    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapGet("/me/2fa/status", async (ClaimsPrincipal principal, AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    return Results.Ok(new { enabled = user.TwoFactorEnabled });
}).RequireAuthorization();

app.MapPost("/me/2fa/setup", async (ClaimsPrincipal principal, AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    user.TwoFactorEnabled = false;
    user.TwoFactorSecret = GenerateTotpSecret();
    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    await store.WriteAsync(state);
    var issuer = Uri.EscapeDataString("SaudeUBS");
    var account = Uri.EscapeDataString(user.Email ?? user.Name ?? "usuario");
    var secret = user.TwoFactorSecret ?? "";
    var otpauthUrl = $"otpauth://totp/{issuer}:{account}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";
    return Results.Ok(new { secret, otpauthUrl });
}).RequireAuthorization();

app.MapPost("/me/2fa/enable", async (ClaimsPrincipal principal, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var code = ReadJsonString(payload, "code");
    if (code.Length != 6 || !code.All(char.IsDigit))
    {
        return Results.BadRequest(new { error = "Código 2FA inválido" });
    }
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    if (string.IsNullOrWhiteSpace(user.TwoFactorSecret))
    {
        return Results.BadRequest(new { error = "Inicie o setup do 2FA antes de ativar." });
    }
    user.TwoFactorEnabled = true;
    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    await store.WriteAsync(state);
    return Results.Ok(new { user = auth.SanitizeUser(state, user), token = auth.CreateToken(user) });
}).RequireAuthorization();

app.MapPost("/me/2fa/disable", async (ClaimsPrincipal principal, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth) =>
{
    var code = ReadJsonString(payload, "code");
    if (code.Length != 6 || !code.All(char.IsDigit))
    {
        return Results.BadRequest(new { error = "Código 2FA inválido" });
    }
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    user.TwoFactorEnabled = false;
    user.TwoFactorSecret = null;
    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    await store.WriteAsync(state);
    return Results.Ok(new { user = auth.SanitizeUser(state, user), token = auth.CreateToken(user) });
}).RequireAuthorization();

app.MapGet("/bootstrap", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var state = await store.ReadAsync();
    var teamUsers = state.Users
        .Where(u => string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal))
        .Select(u => ToUserDto(state, u))
        .ToList();

    var patients = state.Patients
        .Where(p => auth.CanAccessPatient(authUser, p))
        .ToList();

    var visiblePatientIds = patients.Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
    var tasks = state.Tasks
        .Where(t => visiblePatientIds.Contains(t.PatientId))
        .ToList();

    var templates = protocol.GetTemplatesForTeam(state, authUser.TeamId ?? "");
    var demandMonthly = BuildDemandMonthly(state, authUser, visiblePatientIds);
    var dataQuality = BuildDataQuality(state, authUser, visiblePatientIds);

    return Results.Ok(new
    {
        users = teamUsers,
        patients,
        tasks,
        protocolTemplates = templates,
        demandMonthly,
        dataQuality
    });
}).RequireAuthorization();

app.MapGet("/users", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var state = await store.ReadAsync();
    var users = state.Users
        .Where(u => string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal))
        .Select(u => ToUserDto(state, u))
        .OrderBy(u => u.Name, StringComparer.OrdinalIgnoreCase)
        .ToList();
    return Results.Ok(users);
}).RequireAuthorization();

app.MapGet("/users/activity-log", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var users = state.Users
        .Where(u => string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal))
        .Select(u => ToUserDto(state, u))
        .OrderBy(u => u.Name, StringComparer.OrdinalIgnoreCase)
        .ToList();

    return Results.Ok(new { onlineWindowSeconds = 120, users });
}).RequireAuthorization();

app.MapPost("/users", async (
    ClaimsPrincipal principal,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var role = auth.CanonicalRole(ReadJsonString(payload, "role"));
    if (role is not ("acs" or "doctor" or "nurse_manager")) return Results.BadRequest(new { error = "Perfil inválido" });

    var name = ReadJsonString(payload, "name");
    var email = ReadJsonString(payload, "email").ToLowerInvariant();
    var password = ReadJsonString(payload, "password");
    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
    {
        return Results.BadRequest(new { error = "name, email e password são obrigatórios" });
    }

    var state = await store.ReadAsync();
    if (state.Users.Any(u => string.Equals((u.Email ?? "").Trim(), email, StringComparison.OrdinalIgnoreCase)))
    {
        return Results.BadRequest(new { error = "E-mail já cadastrado" });
    }

    var councilNumber = ReadJsonString(payload, "councilNumber");
    var councilUf = ReadJsonString(payload, "councilUf").ToUpperInvariant();
    var created = new User
    {
        Id = Guid.NewGuid().ToString("N"),
        Name = name,
        Role = role,
        Email = email,
        Password = password,
        TeamId = authUser.TeamId ?? "",
        LastSeenAt = DateTime.UtcNow.ToString("O"),
        UpdatedAt = DateTime.UtcNow.ToString("O")
    };
    created.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber)) created.Extra["councilNumber"] = JsonDocument.Parse($"\"{councilNumber}\"").RootElement.Clone();
    if (!string.IsNullOrWhiteSpace(councilUf)) created.Extra["councilUf"] = JsonDocument.Parse($"\"{councilUf}\"").RootElement.Clone();

    state.Users.Add(created);
    await store.WriteAsync(state);
    return Results.Created($"/users/{created.Id}", ToUserDto(state, created));
}).RequireAuthorization();

app.MapGet("/users/{id}/usage", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var target = state.Users.FirstOrDefault(u => u.Id == id && string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal));
    if (target is null) return Results.NotFound(new { error = "Usuário não encontrado" });

    var assignedPatients = state.Patients.Count(p => string.Equals((p.AssignedAcsId ?? ""), target.Id, StringComparison.Ordinal));
    var openTasksAssigned = state.Tasks.Count(t =>
        string.Equals((t.AssigneeId ?? ""), target.Id, StringComparison.Ordinal)
        && !string.Equals((t.Status ?? "pending"), "done", StringComparison.OrdinalIgnoreCase));
    var appointmentsAuthored = state.Appointments.Count(a => string.Equals((a.CreatedBy ?? ""), target.Id, StringComparison.Ordinal));
    var messagesAuthored = state.Messages.Count(m => string.Equals((m.AuthorId ?? ""), target.Id, StringComparison.Ordinal));
    var clinicalRecordsAuthored = state.ClinicalRecords.Count(r => string.Equals((r.CreatedBy ?? ""), target.Id, StringComparison.Ordinal));
    var totalLinks = assignedPatients + openTasksAssigned + appointmentsAuthored + messagesAuthored + clinicalRecordsAuthored;

    return Results.Ok(new
    {
        canDelete = totalLinks == 0,
        assignedPatients,
        openTasksAssigned,
        appointmentsAuthored,
        messagesAuthored,
        clinicalRecordsAuthored
    });
}).RequireAuthorization();

app.MapPut("/users/{id}", async (
    ClaimsPrincipal principal,
    string id,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var target = state.Users.FirstOrDefault(u => u.Id == id && string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal));
    if (target is null) return Results.NotFound(new { error = "Usuário não encontrado" });

    var role = ReadJsonString(payload, "role");
    if (!string.IsNullOrWhiteSpace(role))
    {
        var canonical = auth.CanonicalRole(role);
        if (canonical is not ("acs" or "doctor" or "nurse_manager")) return Results.BadRequest(new { error = "Perfil inválido" });
        target.Role = canonical;
    }

    var name = ReadJsonString(payload, "name");
    var email = ReadJsonString(payload, "email");
    var password = ReadJsonString(payload, "password");
    if (!string.IsNullOrWhiteSpace(name)) target.Name = name;
    if (!string.IsNullOrWhiteSpace(email))
    {
        var normalized = email.ToLowerInvariant();
        if (state.Users.Any(u => u.Id != target.Id && string.Equals((u.Email ?? "").Trim(), normalized, StringComparison.OrdinalIgnoreCase)))
        {
            return Results.BadRequest(new { error = "E-mail já cadastrado por outro usuário" });
        }
        target.Email = normalized;
    }
    if (!string.IsNullOrWhiteSpace(password)) target.Password = password;

    var councilNumber = ReadJsonString(payload, "councilNumber");
    var councilUf = ReadJsonString(payload, "councilUf").ToUpperInvariant();
    target.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber))
    {
        target.Extra["councilNumber"] = JsonDocument.Parse($"\"{councilNumber}\"").RootElement.Clone();
    }
    if (!string.IsNullOrWhiteSpace(councilUf))
    {
        target.Extra["councilUf"] = JsonDocument.Parse($"\"{councilUf}\"").RootElement.Clone();
    }

    target.UpdatedAt = DateTime.UtcNow.ToString("O");
    await store.WriteAsync(state);
    return Results.Ok(ToUserDto(state, target));
}).RequireAuthorization();

app.MapDelete("/users/{id}", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var target = state.Users.FirstOrDefault(u => u.Id == id && string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal));
    if (target is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    if (string.Equals(target.Id, authUser.Id, StringComparison.Ordinal))
    {
        return Results.BadRequest(new { error = "Não é permitido excluir a própria conta" });
    }

    var hasLinks =
        state.Patients.Any(p => string.Equals((p.AssignedAcsId ?? ""), target.Id, StringComparison.Ordinal)) ||
        state.Tasks.Any(t => string.Equals((t.AssigneeId ?? ""), target.Id, StringComparison.Ordinal) && !string.Equals((t.Status ?? "pending"), "done", StringComparison.OrdinalIgnoreCase)) ||
        state.Appointments.Any(a => string.Equals((a.CreatedBy ?? ""), target.Id, StringComparison.Ordinal)) ||
        state.Messages.Any(m => string.Equals((m.AuthorId ?? ""), target.Id, StringComparison.Ordinal)) ||
        state.ClinicalRecords.Any(r => string.Equals((r.CreatedBy ?? ""), target.Id, StringComparison.Ordinal));

    if (hasLinks)
    {
        return Results.BadRequest(new { error = "Ação bloqueada: usuário possui vínculos ativos no sistema." });
    }

    state.Users.Remove(target);
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapGet("/patients", async (
    ClaimsPrincipal principal,
    HttpRequest request,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();

    var microArea = (request.Query["microArea"].ToString() ?? "").Trim();
    var acsId = (request.Query["acsId"].ToString() ?? "").Trim();
    var careCategory = (request.Query["careCategory"].ToString() ?? "").Trim();

    var list = state.Patients
        .Where(p => auth.CanAccessPatient(authUser, p))
        .Where(p => string.IsNullOrWhiteSpace(microArea) || string.Equals((p.MicroArea ?? "").Trim(), microArea, StringComparison.OrdinalIgnoreCase))
        .Where(p => string.IsNullOrWhiteSpace(acsId) || string.Equals((p.AssignedAcsId ?? "").Trim(), acsId, StringComparison.Ordinal))
        .Where(p => string.IsNullOrWhiteSpace(careCategory) || string.Equals((p.CareCategory ?? "").Trim(), careCategory, StringComparison.OrdinalIgnoreCase))
        .ToList();

    return Results.Ok(list);
}).RequireAuthorization();

app.MapPost("/patients", async (
    ClaimsPrincipal principal,
    PatientUpsertRequest req,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser)))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Phone))
    {
        return Results.BadRequest(new { error = "Nome e telefone sÃ£o obrigatÃ³rios" });
    }

    var state = await store.ReadAsync();
    var patient = req.ToPatient(authUser.TeamId ?? "");
    state.Patients.Add(patient);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{patient.Id}", patient);
}).RequireAuthorization();

app.MapPut("/patients/{id}", async (
    ClaimsPrincipal principal,
    string id,
    HttpRequest request,
    AppStateStore store,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser)))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    Dictionary<string, JsonElement>? payload;
    try
    {
        payload = await JsonSerializer.DeserializeAsync<Dictionary<string, JsonElement>>(request.Body);
    }
    catch
    {
        return Results.BadRequest(new { error = "Payload invÃ¡lido" });
    }
    payload ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);

    var state = await store.ReadAsync();
    var index = state.Patients.FindIndex(p => p.Id == id && p.TeamId == authUser.TeamId);
    if (index < 0) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    var current = state.Patients[index];

    var doctorAllowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
      "phone","phoneAlt","address","complement","comorbidities","medications","allergies","birthDate",
      "pregnancyStartDate","expectedDeliveryDate","gestationalAgeDumWeeks","gestationalAgeDumDays",
      "gestationalAgeUsgWeeks","gestationalAgeUsgDays","usgDate1","usgDate2","usgDate3",
      "prenatalStartDate","postpartumStartDate"
    };

    var effective = auth.IsDoctor(authUser)
        ? payload.Where(kv => doctorAllowed.Contains(kv.Key)).ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase)
        : new Dictionary<string, JsonElement>(payload, StringComparer.OrdinalIgnoreCase);

    string ReadStr(string key, string fallback = "")
    {
        if (!effective.TryGetValue(key, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.String => (value.GetString() ?? "").Trim(),
            JsonValueKind.Null => "",
            _ => value.ToString().Trim()
        };
    }

    int? ReadBoundedInt(string key, int min, int max)
    {
        if (!effective.TryGetValue(key, out var value)) return null;
        int parsed;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out parsed))
        {
            return Math.Max(min, Math.Min(max, parsed));
        }
        if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out parsed))
        {
            return Math.Max(min, Math.Min(max, parsed));
        }
        return null;
    }

    List<string>? ReadConditions(string key)
    {
        if (!effective.TryGetValue(key, out var value)) return null;
        if (value.ValueKind != JsonValueKind.Array) return new List<string>();
        var list = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String) list.Add(item.GetString() ?? "");
        }
        return AuthService.NormalizeChronicConditions(list);
    }

    if (effective.ContainsKey("name")) current.Name = ReadStr("name", current.Name);
    if (effective.ContainsKey("motherName")) current.MotherName = ReadStr("motherName", current.MotherName ?? "");
    if (effective.ContainsKey("phone")) current.Phone = ReadStr("phone", current.Phone);
    if (effective.ContainsKey("phoneAlt")) current.PhoneAlt = ReadStr("phoneAlt", current.PhoneAlt ?? "");
    if (effective.ContainsKey("cpf")) current.Cpf = ReadStr("cpf", current.Cpf ?? "");
    if (effective.ContainsKey("cns")) current.Cns = ReadStr("cns", current.Cns ?? "");
    if (effective.ContainsKey("cnsCpf")) current.CnsCpf = ReadStr("cnsCpf", current.CnsCpf ?? "");
    if (effective.ContainsKey("address")) current.Address = ReadStr("address", current.Address ?? "");
    if (effective.ContainsKey("microArea")) current.MicroArea = ReadStr("microArea", current.MicroArea ?? "");
    if (effective.ContainsKey("assignedAcsId")) current.AssignedAcsId = ReadStr("assignedAcsId", current.AssignedAcsId ?? "");
    if (effective.ContainsKey("careCategory"))
    {
        current.CareCategory = protocol.NormalizeCategoryForTeam(state, authUser.TeamId, ReadStr("careCategory", current.CareCategory ?? "general"));
    }
    if (effective.ContainsKey("birthDate")) current.BirthDate = ReadStr("birthDate", current.BirthDate ?? "");

    if (effective.ContainsKey("chronicConditions"))
    {
        current.ChronicConditions = ReadConditions("chronicConditions") ?? current.ChronicConditions ?? new List<string>();
    }

    if (current.Extra is null) current.Extra = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);

    var passthroughKeys = new[]
    {
      "maritalStatus","sexAtBirth","genderIdentity","pregnancyStartDate","expectedDeliveryDate",
      "gestationalAgeDumWeeks","gestationalAgeDumDays","gestationalAgeUsgWeeks","gestationalAgeUsgDays",
      "usgDate1","usgDate2","usgDate3","prenatalStartDate","postpartumStartDate","complement","comorbidities","medications","allergies"
    };

    foreach (var key in passthroughKeys)
    {
        if (!effective.TryGetValue(key, out var value)) continue;
        current.Extra[key] = value;
    }

    var dumWeeks = ReadBoundedInt("gestationalAgeDumWeeks", 0, 45);
    var dumDays = ReadBoundedInt("gestationalAgeDumDays", 0, 6);
    var usgWeeks = ReadBoundedInt("gestationalAgeUsgWeeks", 0, 45);
    var usgDays = ReadBoundedInt("gestationalAgeUsgDays", 0, 6);

    if (dumWeeks is not null) current.Extra["gestationalAgeDumWeeks"] = JsonDocument.Parse(dumWeeks.Value.ToString()).RootElement.Clone();
    if (dumDays is not null) current.Extra["gestationalAgeDumDays"] = JsonDocument.Parse(dumDays.Value.ToString()).RootElement.Clone();
    if (usgWeeks is not null) current.Extra["gestationalAgeUsgWeeks"] = JsonDocument.Parse(usgWeeks.Value.ToString()).RootElement.Clone();
    if (usgDays is not null) current.Extra["gestationalAgeUsgDays"] = JsonDocument.Parse(usgDays.Value.ToString()).RootElement.Clone();

    if (effective.ContainsKey("cpf") && !effective.ContainsKey("cnsCpf"))
    {
        current.CnsCpf = current.Cpf ?? current.CnsCpf;
    }
    if (effective.ContainsKey("cns") && !effective.ContainsKey("cnsCpf") && string.IsNullOrWhiteSpace(current.CnsCpf))
    {
        current.CnsCpf = current.Cns;
    }

    current.UpdatedAt = DateTime.UtcNow.ToString("O");
    state.Patients[index] = current;
    await store.WriteAsync(state);
    return Results.Ok(current);
}).RequireAuthorization();

app.MapGet("/patients/{id}/history", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var history = protocol.BuildPatientHistory(state, patient.Id);
    return Results.Ok(history);
}).RequireAuthorization();

app.MapGet("/patients/{id}/protocol-summary", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(summary);
}).RequireAuthorization();

app.MapGet("/patients/protocol-summaries", async (
    ClaimsPrincipal principal,
    HttpRequest request,
    AppStateStore store,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();

    var ids = (request.Query["ids"].ToString() ?? "")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .ToHashSet(StringComparer.Ordinal);
    var hasFilter = ids.Count > 0;

    var allowed = state.Patients
        .Where(p => auth.CanAccessPatient(authUser, p))
        .Where(p => !hasFilter || ids.Contains(p.Id))
        .ToList();

    var summaries = new Dictionary<string, object>(StringComparer.Ordinal);
    foreach (var patient in allowed)
    {
        summaries[patient.Id] = protocol.BuildProtocolSummary(state, authUser, patient);
    }

    return Results.Ok(new { count = summaries.Count, summaries });
}).RequireAuthorization();

app.MapPost("/patients/{id}/records", async (
    ClaimsPrincipal principal,
    string id,
    ClinicalRecordRequest req,
    AppStateStore store,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var type = (req.Type ?? "").Trim().ToLowerInvariant();
    var title = (req.Title ?? "").Trim();
    var dateText = (req.Date ?? "").Trim();
    if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(dateText))
    {
        return Results.BadRequest(new { error = "type, date e title sÃ£o obrigatÃ³rios" });
    }

    var allowedTypes = new HashSet<string>(StringComparer.Ordinal) { "visit", "consultation", "vaccine", "procedure", "note" };
    if (!allowedTypes.Contains(type)) return Results.BadRequest(new { error = "Tipo de registro invÃ¡lido" });

    if (auth.IsAcs(authUser))
    {
        if (type != "visit") return Results.BadRequest(new { error = "ACS pode registrar apenas visita domiciliar" });
        if (!string.Equals(AuthService.NormalizeText(title), "visita acs", StringComparison.Ordinal))
        {
            return Results.BadRequest(new { error = "ACS deve registrar o tÃ­tulo padrÃ£o 'Visita ACS'" });
        }
    }
    if (auth.IsDoctor(authUser) && type == "visit")
    {
        return Results.BadRequest(new { error = "MÃ©dica nÃ£o registra visita domiciliar" });
    }

    var normalizedTitle = title;
    if (type == "consultation")
    {
        var specialty = DetectConsultationSpecialty(title);
        normalizedTitle = NormalizeConsultationTitle(title, specialty);
        req.Metadata ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        req.Metadata["specialty"] = JsonDocument.Parse($"\"{specialty}\"").RootElement.Clone();
    }

    var record = new ClinicalRecord
    {
        Id = Guid.NewGuid().ToString("N"),
        PatientId = id,
        Type = type,
        Title = normalizedTitle,
        Details = (req.Details ?? "").Trim(),
        Date = dateText,
        CreatedBy = authUser.Id,
        CreatedAt = DateTime.UtcNow.ToString("O"),
        Metadata = req.Metadata ?? new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
    };

    state.ClinicalRecords.Add(record);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{id}/records/{record.Id}", record);
}).RequireAuthorization();

app.MapDelete("/patients/{id}/records/{recordId}", async (
    ClaimsPrincipal principal,
    string id,
    string recordId,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var index = state.ClinicalRecords.FindIndex(r => r.Id == recordId && r.PatientId == id);
    if (index < 0) return Results.NotFound(new { error = "Registro nÃ£o encontrado" });
    var current = state.ClinicalRecords[index];

    if (auth.IsAcs(authUser))
    {
        var canDeleteOwnVisit = string.Equals(current.Type, "visit", StringComparison.OrdinalIgnoreCase)
            && string.Equals(current.CreatedBy ?? "", authUser.Id, StringComparison.Ordinal);
        if (!canDeleteOwnVisit)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }
    }
    else if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser)))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    state.ClinicalRecords.RemoveAt(index);
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapDelete("/patients/{id}", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    state.Patients.Remove(patient);
    state.Appointments.RemoveAll(a => string.Equals(a.PatientId, id, StringComparison.Ordinal));
    state.Tasks.RemoveAll(t => string.Equals(t.PatientId, id, StringComparison.Ordinal));
    state.Messages.RemoveAll(m => string.Equals(m.PatientId, id, StringComparison.Ordinal));
    state.ClinicalRecords.RemoveAll(r => string.Equals(r.PatientId, id, StringComparison.Ordinal));
    state.AuditLogs.RemoveAll(a => string.Equals(a.PatientId ?? "", id, StringComparison.Ordinal));
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapGet("/patients/{id}/appointments", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var list = state.Appointments
        .Where(a => string.Equals(a.PatientId, id, StringComparison.Ordinal))
        .OrderByDescending(a => AuthService.ParseDate(a.Date) ?? DateTime.MinValue)
        .ToList();
    return Results.Ok(list);
}).RequireAuthorization();

app.MapPost("/patients/{id}/appointments", async (
    ClaimsPrincipal principal,
    string id,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var date = ReadJsonString(payload, "date");
    var summary = ReadJsonString(payload, "summary");
    if (string.IsNullOrWhiteSpace(date) || string.IsNullOrWhiteSpace(summary))
    {
        return Results.BadRequest(new { error = "date e summary são obrigatórios" });
    }

    var appt = new Appointment
    {
        Id = Guid.NewGuid().ToString("N"),
        PatientId = id,
        Date = date,
        Summary = summary,
        Conduct = ReadJsonString(payload, "conduct"),
        NextStep = ReadJsonString(payload, "nextStep"),
        DemandType = ReadJsonString(payload, "demandType"),
        CreatedBy = authUser.Id,
        CreatedAt = DateTime.UtcNow.ToString("O")
    };
    state.Appointments.Add(appt);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{id}/appointments/{appt.Id}", appt);
}).RequireAuthorization();

app.MapDelete("/patients/{id}/appointments/{appointmentId}", async (
    ClaimsPrincipal principal,
    string id,
    string appointmentId,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var idx = state.Appointments.FindIndex(a => a.Id == appointmentId && a.PatientId == id);
    if (idx < 0) return Results.NotFound(new { error = "Atendimento não encontrado" });
    state.Appointments.RemoveAt(idx);
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapGet("/tasks", async (
    ClaimsPrincipal principal,
    HttpRequest request,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();

    var patientId = (request.Query["patientId"].ToString() ?? "").Trim();
    var visiblePatientIds = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
    var list = state.Tasks
        .Where(t => visiblePatientIds.Contains(t.PatientId))
        .Where(t => string.IsNullOrWhiteSpace(patientId) || string.Equals(t.PatientId, patientId, StringComparison.Ordinal))
        .ToList();
    return Results.Ok(list);
}).RequireAuthorization();

app.MapPost("/tasks", async (
    ClaimsPrincipal principal,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var patientId = ReadJsonString(payload, "patientId");
    var title = ReadJsonString(payload, "title");
    if (string.IsNullOrWhiteSpace(patientId) || string.IsNullOrWhiteSpace(title))
    {
        return Results.BadRequest(new { error = "patientId e title são obrigatórios" });
    }

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == patientId);
    if (patient is null) return Results.BadRequest(new { error = "Paciente inválido" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var task = new TaskItem
    {
        Id = Guid.NewGuid().ToString("N"),
        PatientId = patientId,
        Title = title,
        Notes = ReadJsonString(payload, "notes"),
        DueDate = ReadJsonString(payload, "dueDate"),
        AssigneeId = ReadJsonString(payload, "assigneeId"),
        Status = "pending",
        CreatedBy = authUser.Id,
        CreatedAt = DateTime.UtcNow.ToString("O")
    };
    state.Tasks.Add(task);
    await store.WriteAsync(state);
    return Results.Created($"/tasks/{task.Id}", task);
}).RequireAuthorization();

app.MapPatch("/tasks/{id}", async (
    ClaimsPrincipal principal,
    string id,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var task = state.Tasks.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.Ordinal));
    if (task is null) return Results.NotFound(new { error = "Tarefa não encontrada" });
    var patient = state.Patients.FirstOrDefault(p => p.Id == task.PatientId);
    if (patient is null || !auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var status = ReadJsonString(payload, "status").ToLowerInvariant();
    if (status is "pending" or "in_progress" or "done")
    {
        task.Status = status;
    }

    await store.WriteAsync(state);
    return Results.Ok(task);
}).RequireAuthorization();

app.MapGet("/patients/{id}/messages", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var list = state.Messages
        .Where(m => string.Equals(m.PatientId, id, StringComparison.Ordinal))
        .OrderBy(m => AuthService.ParseDate(m.CreatedAt) ?? DateTime.MinValue)
        .ToList();
    return Results.Ok(list);
}).RequireAuthorization();

app.MapPost("/patients/{id}/messages", async (
    ClaimsPrincipal principal,
    string id,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var text = ReadJsonString(payload, "text");
    if (string.IsNullOrWhiteSpace(text)) return Results.BadRequest(new { error = "Mensagem vazia" });

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var item = new MessageItem
    {
        Id = Guid.NewGuid().ToString("N"),
        PatientId = id,
        AuthorId = authUser.Id,
        AuthorName = authUser.Name,
        Text = text,
        CreatedAt = DateTime.UtcNow.ToString("O")
    };
    state.Messages.Add(item);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{id}/messages/{item.Id}", item);
}).RequireAuthorization();

app.MapGet("/audit-logs", async (
    ClaimsPrincipal principal,
    HttpRequest request,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var patientId = (request.Query["patientId"].ToString() ?? "").Trim();
    var state = await store.ReadAsync();
    var visiblePatientIds = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).Select(p => p.Id).ToHashSet(StringComparer.Ordinal);

    var logs = state.AuditLogs
        .Where(a => string.IsNullOrWhiteSpace(patientId) || string.Equals(a.PatientId ?? "", patientId, StringComparison.Ordinal))
        .Where(a => string.IsNullOrWhiteSpace(a.PatientId) || visiblePatientIds.Contains(a.PatientId))
        .OrderByDescending(a => AuthService.ParseDate(a.CreatedAt) ?? DateTime.MinValue)
        .ToList();
    return Results.Ok(logs);
}).RequireAuthorization();

app.MapGet("/metrics/demand/monthly", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var visiblePatientIds = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
    return Results.Ok(BuildDemandMonthly(state, authUser, visiblePatientIds));
}).RequireAuthorization();

app.MapGet("/metrics/data-quality", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var visiblePatientIds = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
    return Results.Ok(BuildDataQuality(state, authUser, visiblePatientIds));
}).RequireAuthorization();

app.MapGet("/protocol/templates", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    return Results.Ok(protocol.GetTemplatesForTeam(state, authUser.TeamId ?? ""));
}).RequireAuthorization();

app.MapGet("/protocol/templates/{category}/usage", async (
    ClaimsPrincipal principal,
    string category,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var cat = (category ?? "").Trim().ToLowerInvariant();
    var patientIds = state.Patients
        .Where(p => string.Equals((p.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal)
            && string.Equals((p.CareCategory ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal))
        .Select(p => p.Id)
        .ToHashSet(StringComparer.Ordinal);
    var patientCount = patientIds.Count;
    var recordsCount = state.ClinicalRecords.Count(r => patientIds.Contains(r.PatientId));
    return Results.Ok(new { canDelete = patientCount == 0 && recordsCount == 0, patientCount, recordsCount });
}).RequireAuthorization();

app.MapGet("/protocol/templates/{category}/history", async (
    ClaimsPrincipal principal,
    string category,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var cat = (category ?? "").Trim().ToLowerInvariant();
    var logs = state.AuditLogs
        .Where(a => string.Equals(
            (a.Extra is not null && a.Extra.TryGetValue("category", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : ""),
            cat,
            StringComparison.OrdinalIgnoreCase))
        .OrderByDescending(a => AuthService.ParseDate(a.CreatedAt) ?? DateTime.MinValue)
        .Take(30)
        .Select(a => new
        {
            id = a.Id,
            action = a.Action,
            createdAt = a.CreatedAt,
            actorUserName = a.UserName,
            payload = a.Extra is not null && a.Extra.TryGetValue("payload", out var payloadValue) ? payloadValue : default
        })
        .ToList();
    return Results.Ok(new { items = logs });
}).RequireAuthorization();

app.MapPost("/protocol/templates", async (
    ClaimsPrincipal principal,
    ProtocolTemplate template,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var cat = (template.Category ?? "").Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(cat)) return Results.BadRequest(new { error = "Categoria obrigatória" });

    var state = await store.ReadAsync();
    var idx = state.ProtocolTemplates.FindIndex(t => string.Equals((t.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal) && string.Equals((t.Category ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal));
    template.Category = cat;
    template.TeamId = authUser.TeamId;
    template.Deleted = false;
    if (idx >= 0) state.ProtocolTemplates[idx] = template;
    else state.ProtocolTemplates.Add(template);

    state.AuditLogs.Add(new AuditLogItem
    {
        Id = Guid.NewGuid().ToString("N"),
        UserId = authUser.Id,
        UserName = authUser.Name,
        UserRole = authUser.Role,
        Action = "protocol_template_created_or_updated",
        CreatedAt = DateTime.UtcNow.ToString("O"),
        Extra = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
        {
            ["category"] = JsonDocument.Parse($"\"{cat}\"").RootElement.Clone(),
            ["payload"] = JsonDocument.Parse("{\"version\":\"1.0\"}").RootElement.Clone()
        }
    });

    await store.WriteAsync(state);
    return Results.Ok(template);
}).RequireAuthorization();

app.MapPut("/protocol/templates/{category}", async (
    ClaimsPrincipal principal,
    string category,
    ProtocolTemplate template,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var cat = (category ?? "").Trim().ToLowerInvariant();
    var state = await store.ReadAsync();
    var idx = state.ProtocolTemplates.FindIndex(t => string.Equals((t.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal) && string.Equals((t.Category ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal));
    if (idx < 0) return Results.NotFound(new { error = "Protocolo não encontrado" });
    template.Category = cat;
    template.TeamId = authUser.TeamId;
    template.Deleted = false;
    state.ProtocolTemplates[idx] = template;

    state.AuditLogs.Add(new AuditLogItem
    {
        Id = Guid.NewGuid().ToString("N"),
        UserId = authUser.Id,
        UserName = authUser.Name,
        UserRole = authUser.Role,
        Action = "protocol_template_updated",
        CreatedAt = DateTime.UtcNow.ToString("O"),
        Extra = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
        {
            ["category"] = JsonDocument.Parse($"\"{cat}\"").RootElement.Clone(),
            ["payload"] = JsonDocument.Parse("{\"version\":\"1.0\"}").RootElement.Clone()
        }
    });

    await store.WriteAsync(state);
    return Results.Ok(template);
}).RequireAuthorization();

app.MapDelete("/protocol/templates/{category}", async (
    ClaimsPrincipal principal,
    string category,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var cat = (category ?? "").Trim().ToLowerInvariant();
    var state = await store.ReadAsync();
    var patientCount = state.Patients.Count(p => string.Equals((p.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal) && string.Equals((p.CareCategory ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal));
    if (patientCount > 0)
    {
        return Results.BadRequest(new { error = "Ação bloqueada: existem pacientes usando esta categoria." });
    }

    state.ProtocolTemplates.RemoveAll(t => string.Equals((t.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal) && string.Equals((t.Category ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal));
    state.AuditLogs.Add(new AuditLogItem
    {
        Id = Guid.NewGuid().ToString("N"),
        UserId = authUser.Id,
        UserName = authUser.Name,
        UserRole = authUser.Role,
        Action = "protocol_template_deleted",
        CreatedAt = DateTime.UtcNow.ToString("O"),
        Extra = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
        {
            ["category"] = JsonDocument.Parse($"\"{cat}\"").RootElement.Clone(),
            ["payload"] = JsonDocument.Parse("{\"version\":\"1.0\"}").RootElement.Clone()
        }
    });
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapGet("/ai/status", () => Results.Ok(new { provider = "assistente-local-dotnet", available = true })).RequireAuthorization();

app.MapPost("/ai/patients/{id}/summary", async (ClaimsPrincipal principal, string id, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(new
    {
        headline = $"{patient.Name} | Categoria {patient.CareCategory}",
        resumoClinico = $"Paciente da equipe {authUser.TeamId}. Acompanhar pendências do protocolo.",
        protocolo = summary
    });
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/protocol-highlights", async (ClaimsPrincipal principal, string id, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(summary);
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/evolution-draft", async (ClaimsPrincipal principal, string id, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var freeText = ReadJsonString(payload, "freeText");
    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(new
    {
        model = "assistente-local-dotnet",
        soap = new
        {
            s = string.IsNullOrWhiteSpace(freeText) ? "Paciente sem novas queixas registradas no momento." : freeText,
            o = "Registros recentes revisados no prontuário.",
            a = $"Paciente em seguimento de {patient.CareCategory}.",
            p = "Manter acompanhamento conforme protocolo da categoria e registrar evolução clínica."
        },
        protocolo = summary
    });
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/acs-message", async (ClaimsPrincipal principal, string id, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(new
    {
        shortMessage = $"ACS, acompanhar {patient.Name}.",
        detailed = $"Paciente {patient.Name}. Revisar pendências do protocolo e registrar retorno após visita.",
        protocolo = summary
    });
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/suggest-category", async (ClaimsPrincipal principal, string id, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    return Results.Ok(new
    {
        suggestedCategory = patient.CareCategory ?? "general",
        confidence = 0.8,
        rationale = new[] { "Sugestão baseada na categoria atual e no histórico registrado." }
    });
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/transcribe", (Dictionary<string, JsonElement> payload) =>
{
    var transcript = ReadJsonString(payload, "transcript");
    if (string.IsNullOrWhiteSpace(transcript))
    {
        transcript = ReadJsonString(payload, "text");
    }
    if (string.IsNullOrWhiteSpace(transcript))
    {
        return Results.Ok(new { transcript = "", warning = "Envie texto para estruturar automaticamente." });
    }

    var words = transcript.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(w => AuthService.NormalizeText(w))
        .Where(w => w.Length > 3)
        .Distinct()
        .Take(10)
        .ToList();

    return Results.Ok(new
    {
        transcript,
        structured = new
        {
            summary = transcript.Length > 200 ? transcript[..200] : transcript,
            suggestedRecordType = transcript.Contains("vacina", StringComparison.OrdinalIgnoreCase) ? "vaccine" : "note",
            keywords = words
        }
    });
}).RequireAuthorization();

app.MapPost("/ai/team/priorities", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var state = await store.ReadAsync();
    var patients = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).ToList();
    var items = patients
        .Select(p =>
        {
            var summary = protocol.BuildProtocolSummary(state, authUser, p);
            var json = JsonSerializer.SerializeToElement(summary);
            var pending = json.TryGetProperty("pending", out var pendingObj) ? pendingObj : default;
            var pVisits = pending.ValueKind == JsonValueKind.Object && pending.TryGetProperty("visits", out var v) ? v.GetInt32() : 0;
            var pCons = pending.ValueKind == JsonValueKind.Object && pending.TryGetProperty("consultations", out var c) ? c.GetInt32() : 0;
            var pVac = pending.ValueKind == JsonValueKind.Object && pending.TryGetProperty("vaccines", out var vac) ? vac.GetInt32() : 0;
            var score = pVisits * 10 + pCons * 12 + pVac * 9;
            var level = score >= 80 ? "alto" : (score >= 40 ? "moderado" : "baixo");
            return new
            {
                patientId = p.Id,
                patientName = p.Name,
                microArea = p.MicroArea ?? "-",
                acsId = p.AssignedAcsId ?? "",
                risk = new { score, level },
                protocol = new { visits = pVisits, consultations = pCons, vaccines = pVac },
                topAction = "Revisar pendências do protocolo e contato ativo."
            };
        })
        .OrderByDescending(i => i.risk.score)
        .Take(20)
        .ToList();

    return Results.Ok(new { items });
}).RequireAuthorization();

app.MapPost("/ai/team/data-quality", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patients = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).ToList();
    var findings = new List<object>();

    foreach (var p in patients)
    {
        if (string.IsNullOrWhiteSpace(p.Phone)) findings.Add(new { patientId = p.Id, patientName = p.Name, issue = "Telefone ausente", severity = "high" });
        if (string.IsNullOrWhiteSpace(p.Address)) findings.Add(new { patientId = p.Id, patientName = p.Name, issue = "Endereço ausente", severity = "medium" });
        if (string.IsNullOrWhiteSpace(p.AssignedAcsId)) findings.Add(new { patientId = p.Id, patientName = p.Name, issue = "Paciente sem ACS vinculado", severity = "high" });
    }

    return Results.Ok(new { findings });
}).RequireAuthorization();

app.MapPost("/ai/team/report", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var state = await store.ReadAsync();
    var patients = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).ToList();
    var byCategory = patients
        .GroupBy(p => p.CareCategory ?? "general")
        .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

    return Results.Ok(new
    {
        generatedAt = DateTime.UtcNow.ToString("O"),
        totals = new { patients = patients.Count, highRiskPatients = 0, overdueTasks = 0 },
        byCategory,
        executiveSummary = $"Equipe com {patients.Count} paciente(s) acompanhados.",
        recommendations = new[]
        {
            "Priorizar pacientes com maior pendência de protocolo.",
            "Revisar qualidade cadastral semanalmente.",
            "Atualizar registros de atendimento no mesmo dia."
        }
    });
}).RequireAuthorization();

app.MapPost("/ai/chat", async (ClaimsPrincipal principal, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();

    var question = ReadJsonString(payload, "question");
    if (string.IsNullOrWhiteSpace(question)) return Results.Ok(new { answer = "Envie uma pergunta para o assistente.", references = Array.Empty<string>() });
    var state = await store.ReadAsync();
    var patients = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).Select(p => p.Name).Take(5).ToList();
    return Results.Ok(new
    {
        answer = patients.Count == 0
            ? "Não encontrei pacientes para essa equipe."
            : $"Sugestão de foco do dia: {string.Join(", ", patients)}.",
        references = patients
    });
}).RequireAuthorization();

app.Run();

static string DetectConsultationSpecialty(string title)
{
    var text = AuthService.NormalizeText(title);
    if (text.Contains("odont") || text.Contains("dent") || text.Contains("bucal")) return "dental";
    if (text.Contains("enferm")) return "nursing";
    if (text.Contains("medic") || text.Contains("prenatal") || text.Contains("pre natal")) return "medical";
    return "general";
}

static string NormalizeConsultationTitle(string title, string specialty)
{
    if (specialty == "medical") return "Consulta mÃ©dica";
    if (specialty == "nursing") return "Consulta de enfermagem";
    if (specialty == "dental") return "Consulta odontolÃ³gica";
    return string.IsNullOrWhiteSpace(title) ? "Consulta" : title.Trim();
}

static string ReadJsonString(Dictionary<string, JsonElement>? payload, string key)
{
    if (payload is null || !payload.TryGetValue(key, out var value)) return "";
    return value.ValueKind switch
    {
        JsonValueKind.String => (value.GetString() ?? "").Trim(),
        JsonValueKind.Null => "",
        _ => value.ToString().Trim()
    };
}

static UserView ToUserDto(AppDb state, User user)
{
    var teamName = state.Teams.FirstOrDefault(t => t.Id == user.TeamId)?.Name ?? "Sem equipe";
    var lastSeenAt = user.LastSeenAt ?? "";
    var online = false;
    if (DateTime.TryParse(lastSeenAt, out var seenAt))
    {
        online = (DateTime.UtcNow - seenAt).TotalSeconds <= 120;
    }

    string councilNumber = "";
    string councilUf = "";
    if (user.Extra is not null && user.Extra.TryGetValue("councilNumber", out var cNum) && cNum.ValueKind == JsonValueKind.String)
    {
        councilNumber = cNum.GetString() ?? "";
    }
    if (user.Extra is not null && user.Extra.TryGetValue("councilUf", out var cUf) && cUf.ValueKind == JsonValueKind.String)
    {
        councilUf = cUf.GetString() ?? "";
    }

    return new UserView(
        user.Id,
        user.Name,
        user.Role,
        user.Email,
        user.TeamId,
        teamName,
        councilNumber,
        councilUf,
        lastSeenAt,
        online,
        user.TwoFactorEnabled
    );
}

static object BuildDemandMonthly(AppDb state, User authUser, HashSet<string> visiblePatientIds)
{
    var now = DateTime.UtcNow;
    var monthStart = new DateTime(now.Year, now.Month, 1);
    var monthAppointments = state.Appointments
        .Where(a => visiblePatientIds.Contains(a.PatientId))
        .Where(a =>
        {
            var dt = AuthService.ParseDate(a.Date);
            return dt is not null && dt.Value >= monthStart && dt.Value <= now.Date;
        })
        .ToList();

    var scheduled = monthAppointments.Count(a => string.Equals((a.DemandType ?? "").Trim(), "scheduled", StringComparison.OrdinalIgnoreCase));
    var spontaneous = monthAppointments.Count(a => string.Equals((a.DemandType ?? "").Trim(), "spontaneous", StringComparison.OrdinalIgnoreCase));
    var total = scheduled + spontaneous;
    var ratio = total > 0 ? (scheduled * 100.0 / total) : 0;
    var status = total == 0 ? "no_data" : (ratio >= 50 && ratio <= 70 ? "in_range" : "out_of_range");

    return new
    {
        month = $"{now:yyyy-MM}",
        ratioScheduled = ratio,
        status,
        totals = new { scheduled, spontaneous, total }
    };
}

static object BuildDataQuality(AppDb state, User authUser, HashSet<string> visiblePatientIds)
{
    var patients = state.Patients
        .Where(p => visiblePatientIds.Contains(p.Id))
        .ToList();

    var missingPhone = patients.Count(p => string.IsNullOrWhiteSpace((p.Phone ?? "").Trim()));
    var missingAcs = patients.Count(p => string.IsNullOrWhiteSpace((p.AssignedAcsId ?? "").Trim()));
    var missingAddress = patients.Count(p => string.IsNullOrWhiteSpace((p.Address ?? "").Trim()));
    var missingCpf = patients.Count(p => string.IsNullOrWhiteSpace((p.Cpf ?? "").Trim()));
    var missingCns = patients.Count(p => string.IsNullOrWhiteSpace((p.Cns ?? "").Trim()));

    var duplicatedCpfPatients = patients
        .Where(p => !string.IsNullOrWhiteSpace((p.Cpf ?? "").Trim()))
        .GroupBy(p => p.Cpf!.Trim(), StringComparer.OrdinalIgnoreCase)
        .Where(g => g.Count() > 1)
        .SelectMany(g => g)
        .Count();

    var duplicatedCnsPatients = patients
        .Where(p => !string.IsNullOrWhiteSpace((p.Cns ?? "").Trim()))
        .GroupBy(p => p.Cns!.Trim(), StringComparer.OrdinalIgnoreCase)
        .Where(g => g.Count() > 1)
        .SelectMany(g => g)
        .Count();

    var problems = missingPhone + missingAcs + missingAddress + missingCpf + missingCns + duplicatedCpfPatients + duplicatedCnsPatients;
    var total = Math.Max(patients.Count, 1);
    var penalty = Math.Min(100, (int)Math.Round(problems * 100.0 / total));
    var score = Math.Max(0, 100 - penalty);

    return new
    {
        score,
        summary = $"Qualidade de dados: {score}/100",
        stats = new
        {
            missingPhone,
            missingAcs,
            duplicatedCpfPatients,
            duplicatedCnsPatients,
            missingAddress,
            missingCpf,
            missingCns
        }
    };
}

static string GenerateTotpSecret()
{
    const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    Span<byte> bytes = stackalloc byte[20];
    Random.Shared.NextBytes(bytes);
    var chars = new char[32];
    for (var i = 0; i < chars.Length; i++)
    {
        chars[i] = alphabet[bytes[i % bytes.Length] % alphabet.Length];
    }
    return new string(chars);
}

record UserView(
    string Id,
    string Name,
    string Role,
    string Email,
    string TeamId,
    string TeamName,
    string CouncilNumber,
    string CouncilUf,
    string LastSeenAt,
    bool Online,
    bool TwoFactorEnabled
);



