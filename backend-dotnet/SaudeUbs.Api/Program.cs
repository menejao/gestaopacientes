using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SaudeUbs.Api.Models;
using SaudeUbs.Api.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

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

app.Run();
