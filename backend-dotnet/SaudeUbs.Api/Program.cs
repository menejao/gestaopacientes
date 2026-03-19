using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SaudeUbs.Api.Models;
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

app.MapGet("/health", () => Results.Ok(new { ok = true, timestamp = DateTime.UtcNow }));

app.MapPost("/auth/login", async (LoginRequest req, JsonDbStore db, AuthService auth) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
    {
        return Results.BadRequest(new { error = "email e password são obrigatórios" });
    }

    var state = await db.ReadAsync();
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

    user.LastLoginAt = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = user.LastLoginAt;
    user.UpdatedAt = user.LastLoginAt;

    await db.WriteAsync(state);

    var safeUser = auth.SanitizeUser(state, user);
    var token = auth.CreateToken(user);
    return Results.Ok(new { user = safeUser, token });
});

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/me", async (ClaimsPrincipal principal, JsonDbStore db, AuthService auth) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await db.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "Usuário não encontrado" });
    return Results.Ok(auth.SanitizeUser(state, user));
}).RequireAuthorization();

app.MapGet("/patients", async (
    ClaimsPrincipal principal,
    HttpRequest request,
    JsonDbStore db,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    var state = await db.ReadAsync();

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
    JsonDbStore db,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsManager(authUser) || auth.IsDoctor(authUser)))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Phone))
    {
        return Results.BadRequest(new { error = "Nome e telefone são obrigatórios" });
    }

    var state = await db.ReadAsync();
    var patient = req.ToPatient(authUser.TeamId ?? "");
    state.Patients.Add(patient);
    await db.WriteAsync(state);
    return Results.Created($"/patients/{patient.Id}", patient);
}).RequireAuthorization();

app.MapPut("/patients/{id}", async (
    ClaimsPrincipal principal,
    string id,
    HttpRequest request,
    JsonDbStore db,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
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
        return Results.BadRequest(new { error = "Payload inválido" });
    }
    payload ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);

    var state = await db.ReadAsync();
    var index = state.Patients.FindIndex(p => p.Id == id && p.TeamId == authUser.TeamId);
    if (index < 0) return Results.NotFound(new { error = "Paciente não encontrado" });
    var current = state.Patients[index];

    var doctorAllowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
      "phone","phoneAlt","address","comorbidities","medications","allergies","birthDate",
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
      "usgDate1","usgDate2","usgDate3","prenatalStartDate","postpartumStartDate","comorbidities","medications","allergies"
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
    await db.WriteAsync(state);
    return Results.Ok(current);
}).RequireAuthorization();

app.MapGet("/patients/{id}/history", async (
    ClaimsPrincipal principal,
    string id,
    JsonDbStore db,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    var state = await db.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var history = protocol.BuildPatientHistory(state, patient.Id);
    return Results.Ok(history);
}).RequireAuthorization();

app.MapGet("/patients/{id}/protocol-summary", async (
    ClaimsPrincipal principal,
    string id,
    JsonDbStore db,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    var state = await db.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(summary);
}).RequireAuthorization();

app.MapGet("/patients/protocol-summaries", async (
    ClaimsPrincipal principal,
    HttpRequest request,
    JsonDbStore db,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    var state = await db.ReadAsync();

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
    JsonDbStore db,
    AuthService auth,
    ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    var state = await db.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var type = (req.Type ?? "").Trim().ToLowerInvariant();
    var title = (req.Title ?? "").Trim();
    var dateText = (req.Date ?? "").Trim();
    if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(dateText))
    {
        return Results.BadRequest(new { error = "type, date e title são obrigatórios" });
    }

    var allowedTypes = new HashSet<string>(StringComparer.Ordinal) { "visit", "consultation", "vaccine", "procedure", "note" };
    if (!allowedTypes.Contains(type)) return Results.BadRequest(new { error = "Tipo de registro inválido" });

    if (auth.IsAcs(authUser))
    {
        if (type != "visit") return Results.BadRequest(new { error = "ACS pode registrar apenas visita domiciliar" });
        if (!string.Equals(AuthService.NormalizeText(title), "visita acs", StringComparison.Ordinal))
        {
            return Results.BadRequest(new { error = "ACS deve registrar o título padrão 'Visita ACS'" });
        }
    }
    if (auth.IsDoctor(authUser) && type == "visit")
    {
        return Results.BadRequest(new { error = "Médica não registra visita domiciliar" });
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
    await db.WriteAsync(state);
    return Results.Created($"/patients/{id}/records/{record.Id}", record);
}).RequireAuthorization();

app.MapDelete("/patients/{id}/records/{recordId}", async (
    ClaimsPrincipal principal,
    string id,
    string recordId,
    JsonDbStore db,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, db);
    if (authUser is null) return Results.Unauthorized();
    var state = await db.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var index = state.ClinicalRecords.FindIndex(r => r.Id == recordId && r.PatientId == id);
    if (index < 0) return Results.NotFound(new { error = "Registro não encontrado" });
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
    await db.WriteAsync(state);
    return Results.Ok(new { ok = true });
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
    if (specialty == "medical") return "Consulta médica";
    if (specialty == "nursing") return "Consulta de enfermagem";
    if (specialty == "dental") return "Consulta odontológica";
    return string.IsNullOrWhiteSpace(title) ? "Consulta" : title.Trim();
}
