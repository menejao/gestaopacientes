using System.Security.Claims;
using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using SaudeUbs.Api.Models;
using SaudeUbs.Api.Persistence;
using SaudeUbs.Api.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var jwtSecret = (Environment.GetEnvironmentVariable("JWT_SECRET") ?? "").Trim();
if (string.IsNullOrWhiteSpace(jwtSecret))
{
    // Em desenvolvimento, usa valor padrÃ£o com aviso. Em produÃ§Ã£o, deve sempre definir JWT_SECRET.
    var isDevelopment = builder.Environment.IsDevelopment();
    if (!isDevelopment)
        throw new InvalidOperationException("JWT_SECRET nÃ£o definido. Configure a variÃ¡vel de ambiente antes de iniciar em produÃ§Ã£o.");
    jwtSecret = "dev-only-secret-nao-usar-em-producao-32chars!!";
    Console.WriteLine("[AVISO] JWT_SECRET nÃ£o configurado. Usando valor de desenvolvimento inseguro.");
}
var jwtIssuer = (Environment.GetEnvironmentVariable("JWT_ISSUER") ?? "saudeubs-backend").Trim();
var jwtAudience = (Environment.GetEnvironmentVariable("JWT_AUDIENCE") ?? "saudeubs-client").Trim();
var jwtExpiresHours = int.TryParse(Environment.GetEnvironmentVariable("JWT_EXPIRES_HOURS"), out var h) ? Math.Max(1, h) : 8; // 8h padrÃ£o â€” desloga automaticamente
var databaseUrl = (Environment.GetEnvironmentVariable("DATABASE_URL") ?? "").Trim();

// â”€â”€ Criptografia de dados sensÃ­veis (LGPD) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ENCRYPT_KEY: base64 de 32 bytes aleatÃ³rios. Gere com:
//   python3 -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
// Guarde em 3 lugares seguros. Sem a chave, dados cifrados sÃ£o ilegÃ­veis.
// EXPOSE_RESET_TOKEN: true apenas em dev para facilitar testes locais.
// Nunca expor token em produção — o token deve ser enviado por e-mail.
var exposeResetTokenInResponse = builder.Environment.IsDevelopment()
    && string.Equals(Environment.GetEnvironmentVariable("EXPOSE_RESET_TOKEN"), "true", StringComparison.OrdinalIgnoreCase);

// ALLOW_INSECURE_JWT_SECRET: permite segredo curto apenas em dev.
var allowInsecureJwtSecret = builder.Environment.IsDevelopment()
    && string.Equals(Environment.GetEnvironmentVariable("ALLOW_INSECURE_JWT_SECRET"), "true", StringComparison.OrdinalIgnoreCase);

var encryptKeyB64 = (Environment.GetEnvironmentVariable("ENCRYPT_KEY") ?? "").Trim();
byte[]? encryptKey = null;
if (!string.IsNullOrWhiteSpace(encryptKeyB64))
{
    try
    {
        encryptKey = Convert.FromBase64String(encryptKeyB64);
        if (encryptKey.Length != 32)
        {
            Console.WriteLine("[AVISO] ENCRYPT_KEY deve ter exatamente 32 bytes (256 bits). Criptografia desativada.");
            encryptKey = null;
        }
        else
        {
            Console.WriteLine("[INFO] Criptografia de dados sensÃ­veis: ATIVADA (AES-256-GCM)");
        }
    }
    catch
    {
        Console.WriteLine("[AVISO] ENCRYPT_KEY invÃ¡lida (nÃ£o Ã© base64 vÃ¡lido). Criptografia desativada.");
        encryptKey = null;
    }
}
else
{
    Console.WriteLine("[AVISO] ENCRYPT_KEY nÃ£o definida. Dados sensÃ­veis (CPF, CNS) serÃ£o armazenados sem criptografia.");
}

// FunÃ§Ãµes de criptografia AES-256-GCM
string EncryptField(string? value)
{
    if (encryptKey is null || string.IsNullOrWhiteSpace(value)) return value ?? "";
    try
    {
        using var aes = new System.Security.Cryptography.AesGcm(encryptKey, 16);
        var nonce = new byte[System.Security.Cryptography.AesGcm.NonceByteSizes.MaxSize];
        System.Security.Cryptography.RandomNumberGenerator.Fill(nonce);
        var plaintext = System.Text.Encoding.UTF8.GetBytes(value);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];
        aes.Encrypt(nonce, plaintext, ciphertext, tag);
        // Formato: "ENC:" + base64(nonce + ciphertext + tag)
        var combined = new byte[nonce.Length + ciphertext.Length + tag.Length];
        nonce.CopyTo(combined, 0);
        ciphertext.CopyTo(combined, nonce.Length);
        tag.CopyTo(combined, nonce.Length + ciphertext.Length);
        return "ENC:" + Convert.ToBase64String(combined);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[ENCRYPT] Falha ao cifrar campo: {ex.Message}");
        throw;
    }
}

string DecryptField(string? value)
{
    if (encryptKey is null || string.IsNullOrWhiteSpace(value)) return value ?? "";
    if (!value.StartsWith("ENC:")) return value; // dado nÃ£o cifrado (migraÃ§Ã£o)
    try
    {
        var combined = Convert.FromBase64String(value[4..]);
        var nonceSize = System.Security.Cryptography.AesGcm.NonceByteSizes.MaxSize;
        var tagSize = 16;
        var nonce      = combined[..nonceSize];
        var ciphertext = combined[nonceSize..(combined.Length - tagSize)];
        var tag        = combined[(combined.Length - tagSize)..];
        using var aes  = new System.Security.Cryptography.AesGcm(encryptKey, tagSize);
        var plaintext  = new byte[ciphertext.Length];
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return System.Text.Encoding.UTF8.GetString(plaintext);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[DECRYPT] Falha ao decifrar campo (chave incorreta ou dado corrompido): {ex.Message}");
        return ""; // retorna vazio — não expõe formato cifrado ao cliente
    }
}

builder.Services.AddSingleton(new AppConfig
{
    JwtSecret = jwtSecret,
    JwtIssuer = jwtIssuer,
    JwtAudience = jwtAudience,
    JwtExpiresHours = jwtExpiresHours,
    ExposeResetTokenInResponse = exposeResetTokenInResponse,
    AllowInsecureJwtSecret = allowInsecureJwtSecret
});
builder.Services.AddSingleton<JsonDbStore>();
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<ProtocolSummaryService>();
if (!string.IsNullOrWhiteSpace(databaseUrl))
{
    var npgsqlConn = new Npgsql.NpgsqlConnectionStringBuilder(databaseUrl)
    {
        SslMode = Npgsql.SslMode.Require,
        Pooling = false // Neon pooler handles pooling externally
    }.ConnectionString;
    builder.Services.AddDbContextFactory<AppPgDbContext>(options =>
        options.UseNpgsql(npgsqlConn));
    builder.Services.AddSingleton<PgDbStore>();
}
builder.Services.AddSingleton<AppStateStore>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (string.IsNullOrWhiteSpace(context.Token)
                    && context.Request.Cookies.TryGetValue("saudeubs_session", out var cookieToken)
                    && !string.IsNullOrWhiteSpace(cookieToken))
                {
                    context.Token = cookieToken;
                }

                return Task.CompletedTask;
            },
            OnTokenValidated = async context =>
            {
                var sessionId = context.Principal?.FindFirstValue("sid");
                var userId = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? context.Principal?.FindFirstValue("id");
                if (string.IsNullOrWhiteSpace(sessionId) || string.IsNullOrWhiteSpace(userId))
                {
                    context.Fail("Sessão inválida.");
                    return;
                }

                var store = context.HttpContext.RequestServices.GetRequiredService<AppStateStore>();
                var state = await store.ReadAsync();
                var session = state.RefreshSessions.FirstOrDefault(s =>
                    string.Equals(s.Id, sessionId, StringComparison.Ordinal) &&
                    string.Equals(s.UserId, userId, StringComparison.Ordinal));

                if (session is null || !string.IsNullOrWhiteSpace(session.RevokedAt))
                {
                    context.Fail("Sessão revogada.");
                }
            }
        };
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

// CORS â€” permite o frontend (Cloudflare + localhost dev)
var allowedOrigins = (Environment.GetEnvironmentVariable("ALLOWED_ORIGINS") ?? "")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AppPolicy", policy =>
    {
        var origins = new[]
        {
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://localhost:4173",
            "https://gestaopacientes.meneguccijao.workers.dev"
        }.Concat(allowedOrigins).Distinct().ToArray();

        policy
            .WithOrigins(origins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();
var loginChallenges = new ConcurrentDictionary<string, (string UserId, DateTime ExpiresAt)>(StringComparer.Ordinal);
// Rate limiting: mÃ¡x 10 tentativas de login por IP em 5 minutos
var loginAttempts = new ConcurrentDictionary<string, (int Count, DateTime WindowStart)>(StringComparer.Ordinal);

var accessCookieName = "saudeubs_session";
var refreshCookieName = "saudeubs_refresh";
var csrfCookieName = "saudeubs_csrf";
var refreshExpiresDays = 14;

void WriteAuthCookie(HttpContext httpContext, string token)
{
    httpContext.Response.Cookies.Append(accessCookieName, token, new CookieOptions
    {
        HttpOnly = true,
        Secure = !app.Environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Expires = DateTimeOffset.UtcNow.AddHours(jwtExpiresHours),
        IsEssential = true,
        Path = "/"
    });
}

void WriteRefreshCookie(HttpContext httpContext, string token)
{
    httpContext.Response.Cookies.Append(refreshCookieName, token, new CookieOptions
    {
        HttpOnly = true,
        Secure = !app.Environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Expires = DateTimeOffset.UtcNow.AddDays(refreshExpiresDays),
        IsEssential = true,
        Path = "/"
    });
}

void WriteCsrfCookie(HttpContext httpContext, string token)
{
    httpContext.Response.Cookies.Append(csrfCookieName, token, new CookieOptions
    {
        HttpOnly = false,
        Secure = !app.Environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Expires = DateTimeOffset.UtcNow.AddDays(refreshExpiresDays),
        IsEssential = true,
        Path = "/"
    });
}

void ClearAuthCookie(HttpContext httpContext)
{
    httpContext.Response.Cookies.Delete(accessCookieName, new CookieOptions
    {
        HttpOnly = true,
        Secure = !app.Environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = "/"
    });
}

void ClearRefreshCookie(HttpContext httpContext)
{
    httpContext.Response.Cookies.Delete(refreshCookieName, new CookieOptions
    {
        HttpOnly = true,
        Secure = !app.Environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = "/"
    });
}

void ClearCsrfCookie(HttpContext httpContext)
{
    httpContext.Response.Cookies.Delete(csrfCookieName, new CookieOptions
    {
        HttpOnly = false,
        Secure = !app.Environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        IsEssential = true,
        Path = "/"
    });
}

bool RequestUsesCookieAuth(HttpContext httpContext)
{
    return string.IsNullOrWhiteSpace(httpContext.Request.Headers.Authorization)
        && httpContext.Request.Cookies.ContainsKey(accessCookieName);
}

IResult? ValidateCsrf(HttpContext httpContext)
{
    if (HttpMethods.IsGet(httpContext.Request.Method)
        || HttpMethods.IsHead(httpContext.Request.Method)
        || HttpMethods.IsOptions(httpContext.Request.Method))
    {
        return null;
    }

    if (!RequestUsesCookieAuth(httpContext))
    {
        return null;
    }

    var cookieToken = httpContext.Request.Cookies[csrfCookieName];
    var headerToken = httpContext.Request.Headers["X-CSRF-Token"].ToString();
    if (string.IsNullOrWhiteSpace(cookieToken)
        || string.IsNullOrWhiteSpace(headerToken)
        || !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(cookieToken),
            Encoding.UTF8.GetBytes(headerToken)))
    {
        return Results.Json(new { error = "Falha na validação CSRF." }, statusCode: StatusCodes.Status403Forbidden);
    }

    return null;
}

RefreshSession CreateRefreshSession(User user, AuthService auth, HttpContext httpContext, out string rawRefreshToken)
{
    rawRefreshToken = auth.GenerateRefreshToken();
    return new RefreshSession
    {
        Id = Guid.NewGuid().ToString("N"),
        UserId = user.Id,
        TokenHash = auth.HashOpaqueToken(rawRefreshToken),
        CreatedAt = DateTime.UtcNow.ToString("O"),
        ExpiresAt = DateTime.UtcNow.AddDays(refreshExpiresDays).ToString("O"),
        CreatedByIp = httpContext.Connection.RemoteIpAddress?.ToString(),
        UserAgent = httpContext.Request.Headers.UserAgent.ToString()
    };
}

object IssueAuthSession(HttpContext httpContext, AppDb state, User user, AuthService auth)
{
    var csrfToken = auth.GenerateRefreshToken();
    var refreshSession = CreateRefreshSession(user, auth, httpContext, out var rawRefreshToken);
    state.RefreshSessions.Add(refreshSession);
    var accessToken = auth.CreateToken(user, refreshSession.Id);
    WriteAuthCookie(httpContext, accessToken);
    WriteRefreshCookie(httpContext, rawRefreshToken);
    WriteCsrfCookie(httpContext, csrfToken);
    return new { user = auth.SanitizeUser(state, user), token = accessToken, csrfToken };
}

bool RequireMfaEnrollment(AuthService auth, User user)
{
    return auth.RequiresMandatoryMfa(user.Role) && !user.TwoFactorEnabled;
}

IResult? EnsureMfaSatisfied(AuthService auth, User user, Dictionary<string, JsonElement> payload, string fieldName = "mfaCode")
{
    if (!auth.RequiresMandatoryMfa(user.Role))
    {
        return null;
    }

    if (!user.TwoFactorEnabled || string.IsNullOrWhiteSpace(user.TwoFactorSecret))
    {
        return Results.Json(new { error = "MFA obrigatório para este perfil." }, statusCode: StatusCodes.Status403Forbidden);
    }

    var code = ReadJsonString(payload, fieldName);
    if (code.Length != 6 || !code.All(char.IsDigit) || !auth.VerifyTotpCode(user.TwoFactorSecret, code))
    {
        return Results.Json(new { error = "Código MFA inválido." }, statusCode: StatusCodes.Status403Forbidden);
    }

    return null;
}

void RevokeAllUserSessions(AppDb state, string userId)
{
    var now = DateTime.UtcNow.ToString("O");
    foreach (var session in state.RefreshSessions.Where(s =>
                 string.Equals(s.UserId, userId, StringComparison.Ordinal)
                 && string.IsNullOrWhiteSpace(s.RevokedAt)))
    {
        session.RevokedAt = now;
    }
}

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

app.MapPost("/auth/register", async (Dictionary<string, JsonElement> req, HttpContext ctx, AppStateStore store, AuthService auth) =>
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
        return Results.BadRequest(new { error = "name, email e password sÃ£o obrigatÃ³rios" });
    }

    if (password.Length < 12)
    {
        return Results.BadRequest(new { error = "A senha deve ter pelo menos 12 caracteres" });
    }

    var validRoles = new HashSet<string>(StringComparer.Ordinal)
        { "receptionist", "gestor" };
    if (!validRoles.Contains(role))
    {
        return Results.Json(new { error = "Cadastro público permitido apenas para recepção." }, statusCode: StatusCodes.Status403Forbidden);
    }

    var requiresTeam = role is not "receptionist" && role is not "gestor";
    if (requiresTeam && string.IsNullOrWhiteSpace(teamId))
    {
        return Results.BadRequest(new { error = "teamId Ã© obrigatÃ³rio para este perfil" });
    }

    var state = await store.ReadAsync();
    if (requiresTeam)
    {
        var team = state.Teams.FirstOrDefault(t => string.Equals(t.Id, teamId, StringComparison.Ordinal));
        if (team is null) return Results.BadRequest(new { error = "Equipe invÃ¡lida" });
    }

    var privilegedRole = auth.IsPrivilegedRole(role);
    var alreadyHasPrivilegedUser = state.Users.Any(u => auth.IsPrivilegedRole(u.Role));
    if (privilegedRole && alreadyHasPrivilegedUser)
    {
        return Results.Json(new { error = "Cadastro pÃºblico de perfis privilegiados estÃ¡ bloqueado. Use a Ã¡rea de gestÃ£o para criar novos gestores." }, statusCode: StatusCodes.Status403Forbidden);
    }
    if (privilegedRole && !builder.Environment.IsDevelopment() && !string.Equals(Environment.GetEnvironmentVariable("ALLOW_INITIAL_PRIVILEGED_BOOTSTRAP"), "true", StringComparison.OrdinalIgnoreCase))
    {
        return Results.Json(new { error = "Bootstrap inicial de gestor bloqueado. Defina ALLOW_INITIAL_PRIVILEGED_BOOTSTRAP=true apenas durante a configuraÃ§Ã£o inicial local." }, statusCode: StatusCodes.Status403Forbidden);
    }

    if (state.Users.Any(u => string.Equals((u.Email ?? "").Trim(), email, StringComparison.OrdinalIgnoreCase)))
    {
        return Results.BadRequest(new { error = "E-mail jÃ¡ cadastrado" });
    }

    var user = new User
    {
        Id = Guid.NewGuid().ToString("N"),
        Name = name,
        Email = email,
        Password = auth.HashPassword(password),
        Role = role,
        TeamId = teamId
    };
    user.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber))
    {
        user.Extra["councilNumber"] = JsonSerializer.SerializeToElement(councilNumber);
    }
    if (!string.IsNullOrWhiteSpace(councilUf))
    {
        user.Extra["councilUf"] = JsonSerializer.SerializeToElement(councilUf);
    }

    state.Users.Add(user);
    AppendAuditToState(state, user.Id, user.Name, user.Role, "user_registered", "user", user.Id, $"UsuÃ¡rio cadastrado: {user.Email}");
    await store.WriteAsync(state);

    var issued = IssueAuthSession(ctx, state, user, auth);
    return Results.Ok(issued);
});

app.MapPost("/auth/register/request-code", () =>
{
    return Results.BadRequest(new { error = "Fluxo de cÃ³digo desativado. Use /auth/register." });
});

app.MapPost("/auth/register/confirm", () =>
{
    return Results.BadRequest(new { error = "Fluxo de cÃ³digo desativado. Use /auth/register." });
});

app.MapPost("/auth/login", async (LoginRequest req, HttpContext ctx, AppStateStore store, AuthService auth) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
    {
        return Results.BadRequest(new { error = "email e password sÃ£o obrigatÃ³rios" });
    }

    // Rate limiting: bloqueia apÃ³s 10 tentativas em 5 minutos por IP
    var clientIp = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    var now = DateTime.UtcNow;

    // Sweep stale IP windows (attacks from unique IPs that never logged in successfully)
    if (loginAttempts.Count > 500)
    {
        var staleIps = loginAttempts
            .Where(kv => kv.Value.WindowStart.AddMinutes(10) < now)
            .Select(kv => kv.Key).ToList();
        foreach (var ip in staleIps) loginAttempts.TryRemove(ip, out _);
    }

    loginAttempts.AddOrUpdate(clientIp,
        _ => (1, now),
        (_, old) => old.WindowStart.AddMinutes(5) < now ? (1, now) : (old.Count + 1, old.WindowStart));
    if (loginAttempts.TryGetValue(clientIp, out var attempts) && attempts.Count > 10)
    {
        await WriteAuditAsync(store, "", req.Email ?? "", "", "login_blocked", "session", "", $"Bloqueado por rate limit (IP: {clientIp})", null, ctx);
        return Results.StatusCode(429); // Too Many Requests
    }

    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u =>
        string.Equals((u.Email ?? "").Trim(), req.Email.Trim(), StringComparison.OrdinalIgnoreCase)
        && auth.VerifyPassword(req.Password, u.Password ?? ""));

    if (user is null)
    {
        await WriteAuditAsync(store, "", req.Email ?? "", "", "login_failed", "session", "", $"Credenciais invÃ¡lidas (IP: {clientIp})", null, ctx);
        return Results.Unauthorized();
    }

    if (RequireMfaEnrollment(auth, user))
    {
        await WriteAuditAsync(store, user.Id, user.Name, user.Role, "login_blocked_mfa_setup_required", "session", user.Id, "Login bloqueado até ativação de MFA", null, ctx);
        return Results.Json(new
        {
            error = "MFA obrigatório para este perfil.",
            mfaSetupRequired = true
        }, statusCode: StatusCodes.Status403Forbidden);
    }

    if (user.TwoFactorEnabled)
    {
        // Sweep expired challenges to prevent unbounded memory growth
        var expiredChallengeKeys = loginChallenges
            .Where(kv => kv.Value.ExpiresAt < DateTime.UtcNow)
            .Select(kv => kv.Key).ToList();
        foreach (var k in expiredChallengeKeys) loginChallenges.TryRemove(k, out _);

        var challengeId = Guid.NewGuid().ToString("N");
        loginChallenges[challengeId] = (user.Id, DateTime.UtcNow.AddMinutes(5));
        return Results.Ok(new { twoFactorRequired = true, challengeId });
    }

    user.LastLoginAt = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = user.LastLoginAt;
    user.UpdatedAt = user.LastLoginAt;
    AppendAuditToState(state, user.Id, user.Name, user.Role, "login", "session", user.Id, "Login realizado com sucesso", null, ctx);

    await store.WriteAsync(state);

    loginAttempts.TryRemove(clientIp, out _); // reset apÃ³s login bem-sucedido
    var issued = IssueAuthSession(ctx, state, user, auth);
    return Results.Ok(issued);
});

app.MapPost("/auth/login/verify", async (Dictionary<string, JsonElement> payload, HttpContext ctx, AppStateStore store, AuthService auth) =>
{
    var challengeId = ReadJsonString(payload, "challengeId");
    var code = ReadJsonString(payload, "code");
    if (string.IsNullOrWhiteSpace(challengeId) || string.IsNullOrWhiteSpace(code))
    {
        return Results.BadRequest(new { error = "challengeId e code sÃ£o obrigatÃ³rios" });
    }
    // TryRemove is atomic — prevents race condition where two parallel requests
    // could both validate the same challenge
    if (!loginChallenges.TryRemove(challengeId, out var challenge))
    {
        return Results.BadRequest(new { error = "Desafio invÃ¡lido ou expirado" });
    }
    if (challenge.ExpiresAt < DateTime.UtcNow)
    {
        return Results.BadRequest(new { error = "Desafio expirado" });
    }
    if (code.Length != 6 || !code.All(char.IsDigit))
    {
        return Results.BadRequest(new { error = "CÃ³digo 2FA invÃ¡lido" });
    }

    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == challenge.UserId);
    if (user is null) return Results.BadRequest(new { error = "UsuÃ¡rio do desafio nÃ£o encontrado" });
    if (string.IsNullOrWhiteSpace(user.TwoFactorSecret) || !auth.VerifyTotpCode(user.TwoFactorSecret, code))
    {
        await WriteAuditAsync(store, user.Id, user.Name, user.Role, "login_2fa_failed", "session", user.Id, "Falha na validaÃ§Ã£o do cÃ³digo 2FA");
        return Results.BadRequest(new { error = "CÃ³digo 2FA invÃ¡lido" });
    }

    user.LastLoginAt = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = user.LastLoginAt;
    user.UpdatedAt = user.LastLoginAt;
    AppendAuditToState(state, user.Id, user.Name, user.Role, "login_2fa_success", "session", user.Id, "Login concluÃ­do com 2FA");
    await store.WriteAsync(state);

    var issued = IssueAuthSession(ctx, state, user, auth);
    return Results.Ok(issued);
});

app.MapPost("/auth/logout", async (ClaimsPrincipal principal, HttpContext ctx, AppStateStore store) =>
{
    var sessionId = principal.FindFirstValue("sid");
    if (!string.IsNullOrWhiteSpace(sessionId))
    {
        var state = await store.ReadAsync();
        var session = state.RefreshSessions.FirstOrDefault(s => string.Equals(s.Id, sessionId, StringComparison.Ordinal));
        if (session is not null && string.IsNullOrWhiteSpace(session.RevokedAt))
        {
            session.RevokedAt = DateTime.UtcNow.ToString("O");
            await store.WriteAsync(state);
        }
    }
    ClearAuthCookie(ctx);
    ClearRefreshCookie(ctx);
    ClearCsrfCookie(ctx);
    return Results.Ok(new { ok = true });
});

app.MapPost("/auth/refresh", async (HttpContext ctx, AppStateStore store, AuthService auth) =>
{
    if (!ctx.Request.Cookies.TryGetValue(refreshCookieName, out var refreshToken) || string.IsNullOrWhiteSpace(refreshToken))
    {
        ClearAuthCookie(ctx);
        ClearRefreshCookie(ctx);
        ClearCsrfCookie(ctx);
        return Results.Unauthorized();
    }

    var state = await store.ReadAsync();
    var tokenHash = auth.HashOpaqueToken(refreshToken);
    var session = state.RefreshSessions.FirstOrDefault(s => string.Equals(s.TokenHash, tokenHash, StringComparison.Ordinal));
    if (session is null
        || !string.IsNullOrWhiteSpace(session.RevokedAt)
        || !string.IsNullOrWhiteSpace(session.RotatedAt)
        || !DateTime.TryParse(session.ExpiresAt, out var expiresAt)
        || expiresAt <= DateTime.UtcNow)
    {
        ClearAuthCookie(ctx);
        ClearRefreshCookie(ctx);
        ClearCsrfCookie(ctx);
        return Results.Unauthorized();
    }

    var user = state.Users.FirstOrDefault(u => string.Equals(u.Id, session.UserId, StringComparison.Ordinal));
    if (user is null)
    {
        ClearAuthCookie(ctx);
        ClearRefreshCookie(ctx);
        ClearCsrfCookie(ctx);
        return Results.Unauthorized();
    }

    session.RotatedAt = DateTime.UtcNow.ToString("O");
    var replacement = CreateRefreshSession(user, auth, ctx, out var rawRefreshToken);
    session.ReplacedBySessionId = replacement.Id;
    state.RefreshSessions.Add(replacement);
    await store.WriteAsync(state);

    var csrfToken = auth.GenerateRefreshToken();
    var accessToken = auth.CreateToken(user, replacement.Id);
    WriteAuthCookie(ctx, accessToken);
    WriteRefreshCookie(ctx, rawRefreshToken);
    WriteCsrfCookie(ctx, csrfToken);
    return Results.Ok(new { user = auth.SanitizeUser(state, user), token = accessToken, csrfToken });
});

// â”€â”€ Reset de senha: o prÃ³prio usuÃ¡rio redefine com token temporÃ¡rio â”€â”€
// Etapa 1: solicita reset (gera token e retorna ao caller â€” em prod, enviaria por email)
var resetTokens = new ConcurrentDictionary<string, (string UserId, DateTime ExpiresAt)>(StringComparer.Ordinal);
var endpointRateLimits = new ConcurrentDictionary<string, Queue<DateTime>>(StringComparer.Ordinal);

app.MapPost("/auth/password-reset/request", async (Dictionary<string, JsonElement> payload, AppStateStore store) =>
{
    var email = ReadJsonString(payload, "email").ToLowerInvariant().Trim();
    if (string.IsNullOrWhiteSpace(email))
        return Results.BadRequest(new { error = "email Ã© obrigatÃ³rio" });

    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u =>
        string.Equals((u.Email ?? "").Trim(), email, StringComparison.OrdinalIgnoreCase));

    // Sweep expired reset tokens to prevent unbounded memory growth
    var expiredResetKeys = resetTokens
        .Where(kv => kv.Value.ExpiresAt < DateTime.UtcNow)
        .Select(kv => kv.Key).ToList();
    foreach (var k in expiredResetKeys) resetTokens.TryRemove(k, out _);

    // Resposta igual independente de o usuÃ¡rio existir (evita user enumeration)
    var token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    if (user is not null)
    {
        resetTokens[token] = (user.Id, DateTime.UtcNow.AddMinutes(30));
    }

    if (user is not null)
    {
        AppendAuditToState(state, user.Id, user.Name, user.Role, "password_reset_requested", "user", user.Id, "SolicitaÃ§Ã£o de redefiniÃ§Ã£o de senha");
        await store.WriteAsync(state);
    }

    return Results.Ok(new
    {
        ok = true,
        message = "Se o e-mail existir no sistema, um link de redefiniÃ§Ã£o serÃ¡ enviado.",
        resetToken = (builder.Environment.IsDevelopment() && exposeResetTokenInResponse && user is not null) ? token : (string?)null
    });
});

// Etapa 2: define nova senha com o token
app.MapPost("/auth/password-reset/confirm", async (
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var token = ReadJsonString(payload, "token");
    var newPassword = ReadJsonString(payload, "newPassword");

    if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(newPassword))
        return Results.BadRequest(new { error = "token e newPassword sÃ£o obrigatÃ³rios" });

    if (newPassword.Length < 8)
        return Results.BadRequest(new { error = "A senha deve ter pelo menos 8 caracteres" });

    if (!resetTokens.TryGetValue(token, out var entry))
        return Results.BadRequest(new { error = "Token invÃ¡lido ou expirado" });

    if (entry.ExpiresAt < DateTime.UtcNow)
    {
        resetTokens.TryRemove(token, out _);
        return Results.BadRequest(new { error = "Token expirado. Solicite um novo link." });
    }

    resetTokens.TryRemove(token, out _);

    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == entry.UserId);
    if (user is null) return Results.BadRequest(new { error = "UsuÃ¡rio nÃ£o encontrado" });

    user.Password = auth.HashPassword(newPassword);
    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    RevokeAllUserSessions(state, user.Id);
    AppendAuditToState(state, user.Id, user.Name, user.Role, "password_reset_confirmed", "user", user.Id, "Senha redefinida com sucesso");
    await store.WriteAsync(state);

    return Results.Ok(new { ok = true, message = "Senha redefinida com sucesso. FaÃ§a login com a nova senha." });
});

// HTTPS redirect em produÃ§Ã£o
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

// CORS â€” deve vir antes de Authentication/Authorization
app.UseCors("AppPolicy");

// Serve static files (wwwroot/)
app.UseStaticFiles();

// Ensure uploads directory exists at startup
var uploadsRoot = Path.Combine(
    app.Environment.ContentRootPath,
    "App_Data",
    "uploads");
Directory.CreateDirectory(uploadsRoot);

// Security headers â€” proteÃ§Ã£o contra XSS, clickjacking, MIME sniffing
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()";
    ctx.Response.Headers["Content-Security-Policy"] = string.Join("; ",
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "script-src 'self'",
        "connect-src 'self' http://localhost:5030 https://viacep.com.br",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'");
    if (!app.Environment.IsDevelopment())
    {
        ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }
    await next();
});

app.Use(async (ctx, next) =>
{
    if (TryEnforceRateLimit(ctx, endpointRateLimits, out var retryAfterSeconds))
    {
        ctx.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        ctx.Response.Headers["Retry-After"] = retryAfterSeconds.ToString(CultureInfo.InvariantCulture);
        await ctx.Response.WriteAsJsonAsync(new { error = "Muitas tentativas. Aguarde antes de tentar novamente." });
        return;
    }

    await next();
});

app.UseAuthentication();
app.Use(async (context, next) =>
{
    var csrfError = ValidateCsrf(context);
    if (csrfError is not null)
    {
        await csrfError.ExecuteAsync(context);
        return;
    }

    await next();
});
app.UseAuthorization();

app.MapGet("/me", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃƒÂ¡rio nÃƒÂ£o encontrado" });
    return Results.Ok(auth.SanitizeUser(state, user));
}).RequireAuthorization();

app.MapPost("/me/presence", async (ClaimsPrincipal principal, AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
    var now = DateTime.UtcNow.ToString("O");
    user.LastSeenAt = now;
    user.UpdatedAt = now;
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true, lastSeenAt = now });
}).RequireAuthorization();

app.MapPatch("/me", async (
    ClaimsPrincipal principal,
    Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });

    var nextName = ReadJsonString(payload, "name");
    var nextEmail = ReadJsonString(payload, "email");
    var nextPassword = ReadJsonString(payload, "password");
    var currentPassword = ReadJsonString(payload, "currentPassword");
    var councilNumber = ReadJsonString(payload, "councilNumber");
    var councilUf = ReadJsonString(payload, "councilUf").ToUpperInvariant();
    var changingSensitiveCredentials = !string.IsNullOrWhiteSpace(nextPassword) || !string.IsNullOrWhiteSpace(nextEmail);

    if (changingSensitiveCredentials)
    {
        if (string.IsNullOrWhiteSpace(currentPassword) || !auth.VerifyPassword(currentPassword, user.Password))
        {
            AppendAuditToState(state, user.Id, user.Name, user.Role, "profile_update_blocked_invalid_current_password", "user", user.Id, "Alteração de credenciais bloqueada por senha atual inválida");
            await store.WriteAsync(state);
            return Results.Json(new { error = "Senha atual inválida." }, statusCode: StatusCodes.Status403Forbidden);
        }

        var mfaError = EnsureMfaSatisfied(auth, user, payload);
        if (mfaError is not null)
        {
            AppendAuditToState(state, user.Id, user.Name, user.Role, "profile_update_blocked_mfa", "user", user.Id, "Alteração de credenciais bloqueada por MFA");
            await store.WriteAsync(state);
            return mfaError;
        }
    }

    if (!string.IsNullOrWhiteSpace(nextName)) user.Name = nextName;
    if (!string.IsNullOrWhiteSpace(nextEmail))
    {
        var normalized = nextEmail.ToLowerInvariant();
        if (state.Users.Any(u => u.Id != user.Id && string.Equals((u.Email ?? "").Trim(), normalized, StringComparison.OrdinalIgnoreCase)))
        {
            return Results.BadRequest(new { error = "E-mail jÃ¡ utilizado por outro usuÃ¡rio" });
        }
        user.Email = normalized;
    }
    if (!string.IsNullOrWhiteSpace(nextPassword))
    {
        if (nextPassword.Length < 8)
            return Results.BadRequest(new { error = "A senha deve ter pelo menos 8 caracteres" });
        user.Password = auth.HashPassword(nextPassword);
        RevokeAllUserSessions(state, user.Id);
    }

    user.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber))
    {
        user.Extra["councilNumber"] = JsonSerializer.SerializeToElement(councilNumber);
    }
    if (!string.IsNullOrWhiteSpace(councilUf))
    {
        user.Extra["councilUf"] = JsonSerializer.SerializeToElement(councilUf);
    }

    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    AppendAuditToState(state, user.Id, user.Name, user.Role, "profile_updated", "user", user.Id, changingSensitiveCredentials ? "Perfil atualizado com credenciais sensíveis" : "Perfil atualizado");
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapGet("/me/2fa/status", async (ClaimsPrincipal principal, AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
    return Results.Ok(new { enabled = user.TwoFactorEnabled });
}).RequireAuthorization();

app.MapPost("/me/2fa/setup", async (ClaimsPrincipal principal, AppStateStore store) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
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

app.MapPost("/me/2fa/enable", async (ClaimsPrincipal principal, HttpContext ctx, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth) =>
{
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var code = ReadJsonString(payload, "code");
    if (code.Length != 6 || !code.All(char.IsDigit))
    {
        return Results.BadRequest(new { error = "CÃ³digo 2FA invÃ¡lido" });
    }
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
    if (string.IsNullOrWhiteSpace(user.TwoFactorSecret))
    {
        return Results.BadRequest(new { error = "Inicie o setup do 2FA antes de ativar." });
    }
    if (!auth.VerifyTotpCode(user.TwoFactorSecret, code))
    {
        return Results.BadRequest(new { error = "CÃ³digo 2FA invÃ¡lido" });
    }
    user.TwoFactorEnabled = true;
    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    AppendAuditToState(state, user.Id, user.Name, user.Role, "two_factor_enabled", "user", user.Id, "2FA ativado com sucesso");
    await store.WriteAsync(state);
    var issued = IssueAuthSession(ctx, state, user, auth);
    return Results.Ok(issued);
}).RequireAuthorization();

app.MapPost("/me/2fa/disable", async (ClaimsPrincipal principal, HttpContext ctx, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth) =>
{
    var code = ReadJsonString(payload, "code");
    if (code.Length != 6 || !code.All(char.IsDigit))
    {
        return Results.BadRequest(new { error = "CÃ³digo 2FA invÃ¡lido" });
    }
    var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = await store.ReadAsync();
    var user = state.Users.FirstOrDefault(u => u.Id == userId);
    if (user is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
    if (string.IsNullOrWhiteSpace(user.TwoFactorSecret) || !auth.VerifyTotpCode(user.TwoFactorSecret, code))
    {
        return Results.BadRequest(new { error = "CÃ³digo 2FA invÃ¡lido" });
    }
    user.TwoFactorEnabled = false;
    user.TwoFactorSecret = null;
    user.UpdatedAt = DateTime.UtcNow.ToString("O");
    AppendAuditToState(state, user.Id, user.Name, user.Role, "two_factor_disabled", "user", user.Id, "2FA desativado");
    await store.WriteAsync(state);
    var issued = IssueAuthSession(ctx, state, user, auth);
    return Results.Ok(issued);
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
        .Where(p => !IsPatientInactive(p) && auth.CanAccessPatient(authUser, p))
        .ToList();
    var patientSummaries = patients.Select(ToPatientListItemDto).ToList();

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
        patients = patientSummaries,
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
    var validRolesPost = new HashSet<string>(StringComparer.Ordinal)
        { "nurse_manager", "doctor", "dentist", "acs", "nursing_tech", "pharmacist", "pharmacy_tech", "receptionist", "gestor" };
    if (!validRolesPost.Contains(role)) return Results.BadRequest(new { error = "Perfil invÃ¡lido" });
    if (auth.IsPrivilegedRole(role) && !auth.IsGestor(authUser))
    {
        return Results.Json(new { error = "Somente gestor pode criar perfis privilegiados." }, statusCode: StatusCodes.Status403Forbidden);
    }

    var name = ReadJsonString(payload, "name");
    var email = ReadJsonString(payload, "email").ToLowerInvariant();
    var password = ReadJsonString(payload, "password");
    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
    {
        return Results.BadRequest(new { error = "name, email e password sÃ£o obrigatÃ³rios" });
    }

    var state = await store.ReadAsync();
    if (state.Users.Any(u => string.Equals((u.Email ?? "").Trim(), email, StringComparison.OrdinalIgnoreCase)))
    {
        return Results.BadRequest(new { error = "E-mail jÃ¡ cadastrado" });
    }

    if (password.Length < 12) return Results.BadRequest(new { error = "A senha deve ter pelo menos 12 caracteres" });

    var councilNumber = ReadJsonString(payload, "councilNumber");
    var councilUf = ReadJsonString(payload, "councilUf").ToUpperInvariant();
    var created = new User
    {
        Id = Guid.NewGuid().ToString("N"),
        Name = name,
        Role = role,
        Email = email,
        Password = auth.HashPassword(password),
        TeamId = authUser.TeamId ?? "",
        LastSeenAt = DateTime.UtcNow.ToString("O"),
        UpdatedAt = DateTime.UtcNow.ToString("O")
    };
    created.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber)) created.Extra["councilNumber"] = JsonSerializer.SerializeToElement(councilNumber);
    if (!string.IsNullOrWhiteSpace(councilUf)) created.Extra["councilUf"] = JsonSerializer.SerializeToElement(councilUf);

    state.Users.Add(created);
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "user_created", "user", created.Id, $"UsuÃ¡rio criado: {created.Email}");
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
    if (target is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });

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
    if (target is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });

    var role = ReadJsonString(payload, "role");
    if (!string.IsNullOrWhiteSpace(role))
    {
        var canonical = auth.CanonicalRole(role);
        var validRolesPut = new HashSet<string>(StringComparer.Ordinal)
            { "nurse_manager", "doctor", "dentist", "acs", "nursing_tech", "pharmacist", "pharmacy_tech", "receptionist", "gestor" };
        if (!validRolesPut.Contains(canonical)) return Results.BadRequest(new { error = "Perfil invÃ¡lido" });
        if (auth.IsPrivilegedRole(canonical) && !auth.IsGestor(authUser))
        {
            return Results.Json(new { error = "Somente gestor pode promover usuÃ¡rios para perfil privilegiado." }, statusCode: StatusCodes.Status403Forbidden);
        }
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
            return Results.BadRequest(new { error = "E-mail jÃ¡ cadastrado por outro usuÃ¡rio" });
        }
        target.Email = normalized;
    }
    if (!string.IsNullOrWhiteSpace(password))
    {
        if (password.Length < 12) return Results.BadRequest(new { error = "A senha deve ter pelo menos 12 caracteres" });
        target.Password = auth.HashPassword(password);
        RevokeAllUserSessions(state, target.Id);
    }

    var councilNumber = ReadJsonString(payload, "councilNumber");
    var councilUf = ReadJsonString(payload, "councilUf").ToUpperInvariant();
    target.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(councilNumber))
    {
        target.Extra["councilNumber"] = JsonSerializer.SerializeToElement(councilNumber);
    }
    if (!string.IsNullOrWhiteSpace(councilUf))
    {
        target.Extra["councilUf"] = JsonSerializer.SerializeToElement(councilUf);
    }

    target.UpdatedAt = DateTime.UtcNow.ToString("O");
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "user_updated", "user", target.Id, $"UsuÃ¡rio atualizado: {target.Email}");
    await store.WriteAsync(state);
    return Results.Ok(ToUserDto(state, target));
}).RequireAuthorization();

app.MapDelete("/users/{id}", async (
    ClaimsPrincipal principal,
    string id,
    [FromBody] Dictionary<string, JsonElement> payload,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var mfaError = EnsureMfaSatisfied(auth, authUser, payload);
    if (mfaError is not null) return mfaError;

    var state = await store.ReadAsync();
    var target = state.Users.FirstOrDefault(u => u.Id == id && string.Equals(u.TeamId, authUser.TeamId, StringComparison.Ordinal));
    if (target is null) return Results.NotFound(new { error = "UsuÃ¡rio nÃ£o encontrado" });
    if (string.Equals(target.Id, authUser.Id, StringComparison.Ordinal))
    {
        return Results.BadRequest(new { error = "NÃ£o Ã© permitido excluir a prÃ³pria conta" });
    }

    var hasLinks =
        state.Patients.Any(p => string.Equals((p.AssignedAcsId ?? ""), target.Id, StringComparison.Ordinal)) ||
        state.Tasks.Any(t => string.Equals((t.AssigneeId ?? ""), target.Id, StringComparison.Ordinal) && !string.Equals((t.Status ?? "pending"), "done", StringComparison.OrdinalIgnoreCase)) ||
        state.Appointments.Any(a => string.Equals((a.CreatedBy ?? ""), target.Id, StringComparison.Ordinal)) ||
        state.Messages.Any(m => string.Equals((m.AuthorId ?? ""), target.Id, StringComparison.Ordinal)) ||
        state.ClinicalRecords.Any(r => string.Equals((r.CreatedBy ?? ""), target.Id, StringComparison.Ordinal));

    if (hasLinks)
    {
        return Results.BadRequest(new { error = "AÃ§Ã£o bloqueada: usuÃ¡rio possui vÃ­nculos ativos no sistema." });
    }

    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "user_deleted", "user", target.Id, $"UsuÃ¡rio excluÃ­do: {target.Name} ({target.Role})");
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
        .Where(p => !IsPatientInactive(p) && auth.CanAccessPatient(authUser, p))
        .Where(p => string.IsNullOrWhiteSpace(microArea) || string.Equals((p.MicroArea ?? "").Trim(), microArea, StringComparison.OrdinalIgnoreCase))
        .Where(p => string.IsNullOrWhiteSpace(acsId) || string.Equals((p.AssignedAcsId ?? "").Trim(), acsId, StringComparison.Ordinal))
        .Where(p => string.IsNullOrWhiteSpace(careCategory) || string.Equals((p.CareCategory ?? "").Trim(), careCategory, StringComparison.OrdinalIgnoreCase))
        .ToList();
    return Results.Ok(list.Select(ToPatientListItemDto).ToList());
}).RequireAuthorization();

app.MapGet("/patients/{id}", async (
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
    return Results.Ok(ToPatientDetailDto(patient));
}).RequireAuthorization();

app.MapPost("/patients", async (
    ClaimsPrincipal principal,
    PatientUpsertRequest req,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsFullClinical(authUser) || auth.IsDentist(authUser)))
    {
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    }

    var state = await store.ReadAsync();
    var patient = req.ToPatient(authUser.TeamId ?? "");
    if (string.IsNullOrWhiteSpace(patient.Name))
    {
        return Results.BadRequest(new { error = "Nome do paciente Ã© obrigatÃ³rio" });
    }
    if (IsFutureDateString(patient.BirthDate))
    {
        return Results.BadRequest(new { error = "Data de nascimento nÃ£o pode ser futura" });
    }
    if (!string.IsNullOrWhiteSpace(patient.Phone) && !IsValidPhoneBr(patient.Phone))
    {
        return Results.BadRequest(new { error = "Telefone informado Ã© invÃ¡lido" });
    }
    if (!string.IsNullOrWhiteSpace(patient.Cpf) && !IsValidCpf(patient.Cpf))
    {
        return Results.BadRequest(new { error = "CPF informado Ã© invÃ¡lido" });
    }
    if (!string.IsNullOrWhiteSpace(patient.Cns) && !IsValidCns(patient.Cns))
    {
        return Results.BadRequest(new { error = "CNS informado Ã© invÃ¡lido" });
    }

    var incomingCpf = SecurityDataHelpers.DigitsOnly(patient.Cpf);
    var incomingCns = SecurityDataHelpers.DigitsOnly(patient.Cns);
    foreach (var existing in state.Patients)
    {
        var existingCpf = SecurityDataHelpers.DigitsOnly(DecryptField(existing.Cpf));
        var existingCns = SecurityDataHelpers.DigitsOnly(DecryptField(existing.Cns));
        if (!string.IsNullOrWhiteSpace(incomingCpf) && incomingCpf == existingCpf)
        {
            return Results.Conflict(new { error = "JÃ¡ existe paciente com este CPF" });
        }
        if (!string.IsNullOrWhiteSpace(incomingCns) && incomingCns == existingCns)
        {
            return Results.Conflict(new { error = "JÃ¡ existe paciente com este CNS" });
        }
    }

    var responsePatient = new Patient
    {
        Id = patient.Id,
        TeamId = patient.TeamId,
        Name = patient.Name,
        MotherName = patient.MotherName,
        Cpf = patient.Cpf,
        Cns = patient.Cns,
        CnsCpf = patient.CnsCpf,
        Address = patient.Address,
        Phone = patient.Phone,
        PhoneAlt = patient.PhoneAlt,
        MicroArea = patient.MicroArea,
        AssignedAcsId = patient.AssignedAcsId,
        CareCategory = patient.CareCategory,
        ChronicConditions = patient.ChronicConditions,
        BirthDate = patient.BirthDate,
        CreatedAt = patient.CreatedAt,
        CreatedBy = patient.CreatedBy,
        UpdatedAt = patient.UpdatedAt,
        Extra = patient.Extra is null ? null : new Dictionary<string, JsonElement>(patient.Extra, StringComparer.OrdinalIgnoreCase)
    };
    // Criptografar campos sensÃ­veis antes de persistir
    patient.Cpf = EncryptField(patient.Cpf);
    patient.Cns = EncryptField(patient.Cns);
    patient.Phone = EncryptField(patient.Phone);
    patient.PhoneAlt = EncryptField(patient.PhoneAlt);
    state.Patients.Add(patient);
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "patient_created", "patient", patient.Id, $"Paciente cadastrado: {patient.Name}", patient.Id);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{patient.Id}", responsePatient);
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
    if (!(auth.IsFullClinical(authUser)))
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
        return Results.BadRequest(new { error = "Payload invÃƒÂ¡lido" });
    }
    payload ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);

    var state = await store.ReadAsync();
    // Isolamento por equipe (equivalente ao RLS do PostgreSQL na camada de aplicaÃ§Ã£o)
    var index = state.Patients.FindIndex(p =>
        p.Id == id &&
        string.Equals(p.TeamId, authUser.TeamId, StringComparison.Ordinal));
    if (index < 0) return Results.NotFound(new { error = "Paciente nÃ£o encontrado ou sem permissÃ£o" });
    var current = state.Patients[index];
    current.Cpf = DecryptField(current.Cpf);
    current.Cns = DecryptField(current.Cns);
    current.Phone = DecryptField(current.Phone);
    current.PhoneAlt = DecryptField(current.PhoneAlt);

    var doctorAllowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
      "phone","phoneAlt","address","complement","comorbidities","medications","allergies","birthDate",
      "pregnancyStartDate","expectedDeliveryDate","gestationalAgeDumWeeks","gestationalAgeDumDays",
      "gestationalAgeUsgWeeks","gestationalAgeUsgDays","usgDate1","usgDate2","usgDate3",
      "prenatalStartDate","postpartumStartDate"
    };

    var effective = (auth.IsDoctor(authUser) || auth.IsDentist(authUser))
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
    if (string.IsNullOrWhiteSpace(current.Name))
    {
        return Results.BadRequest(new { error = "Nome do paciente Ã© obrigatÃ³rio" });
    }
    if (IsFutureDateString(current.BirthDate))
    {
        return Results.BadRequest(new { error = "Data de nascimento nÃ£o pode ser futura" });
    }
    if (!string.IsNullOrWhiteSpace(current.Phone) && !IsValidPhoneBr(current.Phone))
    {
        return Results.BadRequest(new { error = "Telefone informado Ã© invÃ¡lido" });
    }
    if (!string.IsNullOrWhiteSpace(current.Cpf) && !IsValidCpf(current.Cpf))
    {
        return Results.BadRequest(new { error = "CPF informado Ã© invÃ¡lido" });
    }
    if (!string.IsNullOrWhiteSpace(current.Cns) && !IsValidCns(current.Cns))
    {
        return Results.BadRequest(new { error = "CNS informado Ã© invÃ¡lido" });
    }

    var currentCpfDigits = SecurityDataHelpers.DigitsOnly(current.Cpf);
    var currentCnsDigits = SecurityDataHelpers.DigitsOnly(current.Cns);
    foreach (var other in state.Patients.Where(p => !string.Equals(p.Id, current.Id, StringComparison.Ordinal)))
    {
        var otherCpfDigits = SecurityDataHelpers.DigitsOnly(DecryptField(other.Cpf));
        var otherCnsDigits = SecurityDataHelpers.DigitsOnly(DecryptField(other.Cns));
        if (!string.IsNullOrWhiteSpace(currentCpfDigits) && currentCpfDigits == otherCpfDigits)
        {
            return Results.Conflict(new { error = "JÃ¡ existe paciente com este CPF" });
        }
        if (!string.IsNullOrWhiteSpace(currentCnsDigits) && currentCnsDigits == otherCnsDigits)
        {
            return Results.Conflict(new { error = "JÃ¡ existe paciente com este CNS" });
        }
    }

    var responsePatient = new Patient
    {
        Id = current.Id,
        TeamId = current.TeamId,
        Name = current.Name,
        MotherName = current.MotherName,
        Cpf = current.Cpf,
        Cns = current.Cns,
        CnsCpf = current.CnsCpf,
        Address = current.Address,
        Phone = current.Phone,
        PhoneAlt = current.PhoneAlt,
        MicroArea = current.MicroArea,
        AssignedAcsId = current.AssignedAcsId,
        CareCategory = current.CareCategory,
        ChronicConditions = current.ChronicConditions,
        BirthDate = current.BirthDate,
        CreatedAt = current.CreatedAt,
        CreatedBy = current.CreatedBy,
        UpdatedAt = current.UpdatedAt,
        Extra = current.Extra is null ? null : new Dictionary<string, JsonElement>(current.Extra, StringComparer.OrdinalIgnoreCase)
    };
    current.Cpf = EncryptField(current.Cpf);
    current.Cns = EncryptField(current.Cns);
    current.Phone = EncryptField(current.Phone);
    current.PhoneAlt = EncryptField(current.PhoneAlt);
    state.Patients[index] = current;
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "patient_updated", "patient", current.Id, $"Paciente atualizado: {current.Name}", current.Id);
    await store.WriteAsync(state);
    return Results.Ok(responsePatient);
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃƒÂ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var history = protocol.BuildPatientHistory(state, patient.Id);
    return Results.Ok(history);
}).RequireAuthorization();

app.MapGet("/patients/{id}/records", async (
    ClaimsPrincipal principal,
    string id,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var usersById = state.Users.ToDictionary(u => u.Id, u => u, StringComparer.Ordinal);
    static DateTime? ParseDateSafe(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        return DateTime.TryParse(raw, out var parsed) ? parsed : null;
    }

    var records = state.ClinicalRecords
        .Where(r => string.Equals(r.PatientId, id, StringComparison.Ordinal))
        .OrderByDescending(r => ParseDateSafe(r.Date) ?? DateTime.MinValue)
        .ThenByDescending(r => ParseDateSafe(r.CreatedAt) ?? DateTime.MinValue)
        .Select(r => new
        {
            r.Id,
            r.PatientId,
            r.Type,
            r.Title,
            r.Details,
            r.Date,
            r.CreatedBy,
            r.CreatedAt,
            createdByName = (!string.IsNullOrWhiteSpace(r.CreatedBy) && usersById.TryGetValue(r.CreatedBy, out var u)) ? u.Name : "",
            metadata = r.Metadata ?? new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
        })
        .ToList();

    return Results.Ok(records);
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃƒÂ£o encontrado" });
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃƒÂ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var type = (req.Type ?? "").Trim().ToLowerInvariant();
    var title = (req.Title ?? "").Trim();
    var dateText = (req.Date ?? "").Trim();
    if (string.IsNullOrWhiteSpace(type) || string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(dateText))
    {
        return Results.BadRequest(new { error = "type, date e title sÃƒÂ£o obrigatÃƒÂ³rios" });
    }

    // Tipos vÃ¡lidos â€” alinhados com ENTRY_TYPE do frontend e CFM 1638/2002
    var allowedTypes = new HashSet<string>(StringComparer.Ordinal) { "visit", "consultation", "vaccine", "procedure", "note", "exam", "nursing", "evolution", "prescription", "referral", "home_visit" };
    if (!allowedTypes.Contains(type)) return Results.BadRequest(new { error = "Tipo de registro invÃƒÂ¡lido" });

    if (auth.IsAcs(authUser))
    {
        if (type != "visit") return Results.BadRequest(new { error = "ACS pode registrar apenas visita domiciliar" });
        // TÃ­tulo livre mas deve conter "visita" para ACS
        if (!AuthService.NormalizeText(title).Contains("visita"))
        {
            return Results.BadRequest(new { error = "ACS deve registrar visita domiciliar â€” inclua 'visita' no tÃ­tulo" });
        }
    }
    if (auth.IsDoctor(authUser) && type == "visit")
    {
        return Results.BadRequest(new { error = "MÃƒÂ©dica nÃƒÂ£o registra visita domiciliar" });
    }

    var normalizedTitle = title;
    if (type == "consultation")
    {
        var specialty = DetectConsultationSpecialty(title);
        normalizedTitle = NormalizeConsultationTitle(title, specialty);
        req.Metadata ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
        req.Metadata["specialty"] = JsonSerializer.SerializeToElement(specialty);
    }

    // CFM 1638/2002: validar que hora foi informada
    var timeText = (req.Time ?? "").Trim();
    if (string.IsNullOrWhiteSpace(timeText))
    {
        return Results.BadRequest(new { error = "Hora do evento Ã© obrigatÃ³ria (CFM 1638/2002, art. 1Âº)" });
    }
    // CFM 1638/2002: validar nÃºmero de conselho profissional
    var council = (req.ProfessionalCouncil ?? "").Trim();
    if (string.IsNullOrWhiteSpace(council) && !auth.IsAcs(authUser))
    {
        return Results.BadRequest(new { error = "NÃºmero do conselho profissional Ã© obrigatÃ³rio (CFM 1638/2002)" });
    }

    var meta = req.Metadata ?? new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    // Armazena hora, conselho e flag de imutabilidade nos metadados
    meta["time"] = JsonSerializer.SerializeToElement(timeText);
    if (!string.IsNullOrWhiteSpace(council))
        meta["professionalCouncil"] = JsonSerializer.SerializeToElement(council);
    if (!string.IsNullOrWhiteSpace(req.ProfessionalName ?? ""))
        meta["professionalName"] = JsonSerializer.SerializeToElement((req.ProfessionalName ?? "").Trim());
    if (!string.IsNullOrWhiteSpace(req.Cid ?? ""))
        meta["cid"] = JsonSerializer.SerializeToElement((req.Cid ?? "").Trim().ToUpperInvariant());
    // Lei 13.787/2018: marcar como imutÃ¡vel
    meta["immutable"] = JsonDocument.Parse("true").RootElement.Clone();

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
        Metadata = meta
    };

    state.ClinicalRecords.Add(record);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{id}/records/{record.Id}", record);
}).RequireAuthorization();

// Lei 13.787/2018 + CFM 1638/2002: prontuÃ¡rio eletrÃ´nico Ã© IMUTÃVEL.
// DELETE fÃ­sico nÃ£o Ã© permitido. Mantemos o endpoint por compatibilidade
// mas ele nÃ£o remove â€” apenas inativa com registro de auditoria.
app.MapDelete("/patients/{id}/records/{recordId}", async (
    ClaimsPrincipal principal,
    string id, string recordId,
    HttpRequest request,
    AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsFullClinical(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var index = state.ClinicalRecords.FindIndex(r => r.Id == recordId && r.PatientId == id);
    if (index < 0) return Results.NotFound(new { error = "Registro nÃ£o encontrado" });
    // Inativa em vez de deletar
    var rec = state.ClinicalRecords[index];
    rec.Metadata ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    var legacyReason = (request.Query["reason"].ToString() ?? "").Trim();
    if (string.IsNullOrWhiteSpace(legacyReason))
    {
        legacyReason = "InativaÃ§Ã£o via rota DELETE legada";
    }
    rec.Metadata["inactive"] = JsonDocument.Parse("true").RootElement.Clone();
    rec.Metadata["inactivationReason"] = JsonSerializer.SerializeToElement(legacyReason);
    rec.Metadata["inactivatedBy"] = JsonSerializer.SerializeToElement(authUser.Name ?? authUser.Id);
    rec.Metadata["inactivatedAt"] = JsonSerializer.SerializeToElement($"{DateTime.UtcNow:O}");
    state.ClinicalRecords[index] = rec;
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "clinical_record_inactivated", "record", rec.Id, legacyReason, id);
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true, inactivated = true, message = "Registro inativado (Lei 13.787/2018 â€” exclusÃ£o fÃ­sica nÃ£o permitida)" });
}).RequireAuthorization();

// PATCH /patients/{id}/records/{recordId} â€” inativaÃ§Ã£o com justificativa
app.MapPatch("/patients/{id}/records/{recordId}", async (
    ClaimsPrincipal principal,
    string id, string recordId,
    Dictionary<string, JsonElement> payload,
    AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsFullClinical(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var index = state.ClinicalRecords.FindIndex(r => r.Id == recordId && r.PatientId == id);
    if (index < 0) return Results.NotFound(new { error = "Registro nÃ£o encontrado" });
    var rec = state.ClinicalRecords[index];
    rec.Metadata ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    // Aplicar inativaÃ§Ã£o com justificativa obrigatÃ³ria
    if (payload.TryGetValue("inactive", out var inactiveEl) && inactiveEl.ValueKind == JsonValueKind.True)
    {
        var reason = ReadJsonString(payload, "inactivationReason");
        if (string.IsNullOrWhiteSpace(reason))
            return Results.BadRequest(new { error = "Justificativa de inativaÃ§Ã£o obrigatÃ³ria (Lei 13.787/2018)" });
        rec.Metadata["inactive"] = JsonDocument.Parse("true").RootElement.Clone();
        rec.Metadata["inactivationReason"] = JsonSerializer.SerializeToElement(reason);
        rec.Metadata["inactivatedBy"] = JsonSerializer.SerializeToElement(authUser.Name ?? authUser.Id);
        rec.Metadata["inactivatedAt"] = JsonSerializer.SerializeToElement($"{DateTime.UtcNow:O}");
        AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "clinical_record_inactivated", "record", rec.Id, reason, id);
    }
    state.ClinicalRecords[index] = rec;
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true });
}).RequireAuthorization();

app.MapDelete("/patients/{id}", async (
    ClaimsPrincipal principal,
    string id,
    HttpRequest request,
    [FromBody] Dictionary<string, JsonElement> body,
    AppStateStore store,
    AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var reason = ReadJsonString(body, "reason").Trim();
    if (string.IsNullOrWhiteSpace(reason))
        reason = (request.Query["reason"].ToString() ?? "").Trim(); // fallback para compatibilidade
    if (string.IsNullOrWhiteSpace(reason))
    {
        return Results.BadRequest(new { error = "Justificativa obrigatÃ³ria para inativar paciente" });
    }

    patient.Extra ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    patient.Extra["inactive"] = JsonSerializer.SerializeToElement(true);
    patient.Extra["inactivationReason"] = JsonSerializer.SerializeToElement(reason);
    patient.Extra["inactivatedAt"] = JsonSerializer.SerializeToElement(DateTime.UtcNow.ToString("O"));
    patient.Extra["inactivatedBy"] = JsonSerializer.SerializeToElement(authUser.Name ?? authUser.Id);
    patient.UpdatedAt = DateTime.UtcNow.ToString("O");
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "patient_inactivated", "patient", patient.Id, reason, patient.Id);
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true, inactive = true });
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var date = ReadJsonString(payload, "date");
    var summary = ReadJsonString(payload, "summary");
    if (string.IsNullOrWhiteSpace(date) || string.IsNullOrWhiteSpace(summary))
    {
        return Results.BadRequest(new { error = "date e summary sÃ£o obrigatÃ³rios" });
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var idx = state.Appointments.FindIndex(a => a.Id == appointmentId && a.PatientId == id);
    if (idx < 0) return Results.NotFound(new { error = "Atendimento nÃ£o encontrado" });
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var patientId = ReadJsonString(payload, "patientId");
    var title = ReadJsonString(payload, "title");
    if (string.IsNullOrWhiteSpace(patientId) || string.IsNullOrWhiteSpace(title))
    {
        return Results.BadRequest(new { error = "patientId e title sÃ£o obrigatÃ³rios" });
    }

    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == patientId);
    if (patient is null) return Results.BadRequest(new { error = "Paciente invÃ¡lido" });
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var task = state.Tasks.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.Ordinal));
    if (task is null) return Results.NotFound(new { error = "Tarefa nÃ£o encontrada" });
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var state = await store.ReadAsync();
    var visiblePatientIds = state.Patients.Where(p => auth.CanAccessPatient(authUser, p)).Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
    return Results.Ok(BuildDemandMonthly(state, authUser, visiblePatientIds));
}).RequireAuthorization();

app.MapGet("/metrics/data-quality", async (ClaimsPrincipal principal, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var cat = (template.Category ?? "").Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(cat)) return Results.BadRequest(new { error = "Categoria obrigatÃ³ria" });

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
            ["category"] = JsonSerializer.SerializeToElement(cat),
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var cat = (category ?? "").Trim().ToLowerInvariant();
    var state = await store.ReadAsync();
    var idx = state.ProtocolTemplates.FindIndex(t => string.Equals((t.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal) && string.Equals((t.Category ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal));
    if (idx < 0) return Results.NotFound(new { error = "Protocolo nÃ£o encontrado" });
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
            ["category"] = JsonSerializer.SerializeToElement(cat),
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
    if (!(auth.IsFullClinical(authUser))) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var cat = (category ?? "").Trim().ToLowerInvariant();
    var state = await store.ReadAsync();
    var patientCount = state.Patients.Count(p => string.Equals((p.TeamId ?? ""), authUser.TeamId, StringComparison.Ordinal) && string.Equals((p.CareCategory ?? "").Trim().ToLowerInvariant(), cat, StringComparison.Ordinal));
    if (patientCount > 0)
    {
        return Results.BadRequest(new { error = "AÃ§Ã£o bloqueada: existem pacientes usando esta categoria." });
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
            ["category"] = JsonSerializer.SerializeToElement(cat),
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(new
    {
        headline = $"{patient.Name} | Categoria {patient.CareCategory}",
        resumoClinico = $"Paciente da equipe {authUser.TeamId}. Acompanhar pendÃªncias do protocolo.",
        protocolo = summary
    });
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/protocol-highlights", async (ClaimsPrincipal principal, string id, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
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

app.MapPost("/ai/patients/{id}/evolution-draft", async (ClaimsPrincipal principal, string id, Dictionary<string, JsonElement> payload, AppStateStore store, AuthService auth, ProtocolSummaryService protocol) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var freeText = ReadJsonString(payload, "freeText");
    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(new
    {
        model = "assistente-local-dotnet",
        soap = new
        {
            s = string.IsNullOrWhiteSpace(freeText) ? "Paciente sem novas queixas registradas no momento." : freeText,
            o = "Registros recentes revisados no prontuÃ¡rio.",
            a = $"Paciente em seguimento de {patient.CareCategory}.",
            p = "Manter acompanhamento conforme protocolo da categoria e registrar evoluÃ§Ã£o clÃ­nica."
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
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var summary = protocol.BuildProtocolSummary(state, authUser, patient);
    return Results.Ok(new
    {
        shortMessage = $"ACS, acompanhar {patient.Name}.",
        detailed = $"Paciente {patient.Name}. Revisar pendÃªncias do protocolo e registrar retorno apÃ³s visita.",
        protocolo = summary
    });
}).RequireAuthorization();

app.MapPost("/ai/patients/{id}/suggest-category", async (ClaimsPrincipal principal, string id, AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    return Results.Ok(new
    {
        suggestedCategory = patient.CareCategory ?? "general",
        confidence = 0.8,
        rationale = new[] { "SugestÃ£o baseada na categoria atual e no histÃ³rico registrado." }
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
                topAction = "Revisar pendÃªncias do protocolo e contato ativo."
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
        if (string.IsNullOrWhiteSpace(p.Address)) findings.Add(new { patientId = p.Id, patientName = p.Name, issue = "EndereÃ§o ausente", severity = "medium" });
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
            "Priorizar pacientes com maior pendÃªncia de protocolo.",
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
            ? "NÃ£o encontrei pacientes para essa equipe."
            : $"SugestÃ£o de foco do dia: {string.Join(", ", patients)}.",
        references = patients
    });
}).RequireAuthorization();

// â”€â”€ EXAMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /patients/{id}/exams
app.MapGet("/patients/{id}/exams", async (
    ClaimsPrincipal principal, string id,
    AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var exams = state.ClinicalRecords
        .Where(r => r.PatientId == id && string.Equals(r.Type, "exam", StringComparison.OrdinalIgnoreCase))
        .OrderByDescending(r => r.Date)
        .Select(r =>
        {
            object attachments = Array.Empty<object>();
            if (r.Metadata is not null && r.Metadata.TryGetValue("attachments", out var attEl))
                attachments = attEl;
            return new { r.Id, r.Title, r.Date, r.Details, r.CreatedAt, attachments };
        })
        .ToList();

    return Results.Ok(exams);
}).RequireAuthorization();

// POST /patients/{id}/exams â€” create exam record (no file)
app.MapPost("/patients/{id}/exams", async (
    ClaimsPrincipal principal, string id,
    Dictionary<string, JsonElement> payload,
    AppStateStore store, AuthService auth) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (auth.IsAcs(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var title = ReadJsonString(payload, "title");
    var date  = ReadJsonString(payload, "date");
    var notes = ReadJsonString(payload, "notes");
    if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(date))
        return Results.BadRequest(new { error = "title e date sÃ£o obrigatÃ³rios" });

    var record = new ClinicalRecord
    {
        Id        = Guid.NewGuid().ToString("N"),
        PatientId = id,
        Type      = "exam",
        Title     = title,
        Details   = notes,
        Date      = date,
        CreatedBy = authUser.Id,
        CreatedAt = DateTime.UtcNow.ToString("O"),
        Metadata  = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
        {
            ["attachments"] = JsonDocument.Parse("[]").RootElement.Clone()
        }
    };

    state.ClinicalRecords.Add(record);
    await store.WriteAsync(state);
    return Results.Created($"/patients/{id}/exams/{record.Id}",
        new { record.Id, record.Title, record.Date, record.Details, record.CreatedAt,
              attachments = Array.Empty<object>() });
}).RequireAuthorization();

// POST /patients/{id}/exams/{examId}/attachments â€” upload file
app.MapPost("/patients/{id}/exams/{examId}/attachments", async (
    ClaimsPrincipal principal, string id, string examId,
    HttpRequest request,
    AppStateStore store, AuthService auth,
    IWebHostEnvironment env) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (auth.IsAcs(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var record = state.ClinicalRecords.FirstOrDefault(r =>
        r.Id == examId && r.PatientId == id &&
        string.Equals(r.Type, "exam", StringComparison.OrdinalIgnoreCase));
    if (record is null) return Results.NotFound(new { error = "Exame nÃ£o encontrado" });

    if (!request.HasFormContentType)
        return Results.BadRequest(new { error = "Envie multipart/form-data" });

    var form = await request.ReadFormAsync();
    if (form.Files.Count > 1)
        return Results.BadRequest(new { error = "Envie apenas um arquivo por vez" });
    var file = form.Files.GetFile("file");
    if (file is null || file.Length == 0)
        return Results.BadRequest(new { error = "Nenhum arquivo enviado" });
    if (file.Length > 10 * 1024 * 1024)
        return Results.BadRequest(new { error = "Arquivo muito grande (mÃ¡x 10MB)" });

    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
    if (!SecurityDataHelpers.IsAllowedUploadExtension(ext))
        return Results.BadRequest(new { error = "Tipo nÃ£o permitido. Envie apenas PDF, JPG ou PNG." });
    if (!SecurityDataHelpers.IsAllowedUploadContentType(file.ContentType, ext))
        return Results.BadRequest(new { error = "MIME declarado incompatÃ­vel com o arquivo enviado." });

    var existingJson = record.Metadata is not null && record.Metadata.TryGetValue("attachments", out var currentAttEl)
        ? currentAttEl.GetRawText() : "[]";
    var currentList = System.Text.Json.JsonSerializer.Deserialize<List<JsonElement>>(existingJson) ?? new();
    if (currentList.Count >= 5)
        return Results.BadRequest(new { error = "Limite de 5 anexos por exame atingido" });

    var dir = Path.Combine(uploadsRoot, id, examId);
    Directory.CreateDirectory(dir);

    byte[] fileBytes;
    await using (var sourceStream = file.OpenReadStream())
    await using (var memory = new MemoryStream())
    {
        await sourceStream.CopyToAsync(memory);
        fileBytes = memory.ToArray();
    }

    if (!SecurityDataHelpers.LooksLikeSafeFileSignature(fileBytes, ext))
        return Results.BadRequest(new { error = "Arquivo invÃ¡lido ou com assinatura incompatÃ­vel com a extensÃ£o." });

    var safeOriginalName = $"{SecurityDataHelpers.SanitizeUploadFileName(file.FileName)}{ext}";
    var storedName = $"{Guid.NewGuid():N}{ext}";
    await File.WriteAllBytesAsync(Path.Combine(dir, storedName), fileBytes);

    var url = $"/patients/{id}/exams/{examId}/attachments/{storedName}";
    var attObj = new { id = storedName, url, name = safeOriginalName, contentType = file.ContentType, size = file.Length };

    record.Metadata ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    currentList.Add(JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(attObj)).RootElement.Clone());
    record.Metadata["attachments"] = JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(currentList)).RootElement.Clone();

    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "exam_attachment_uploaded", "exam", examId, $"Arquivo anexado ao exame: {safeOriginalName}", id);
    await store.WriteAsync(state);
    return Results.Ok(attObj);
}).RequireAuthorization();

app.MapGet("/patients/{id}/exams/{examId}/attachments/{attachmentId}", async (
    ClaimsPrincipal principal, string id, string examId, string attachmentId,
    AppStateStore store, AuthService auth,
    IWebHostEnvironment env) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente não encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var record = state.ClinicalRecords.FirstOrDefault(r =>
        r.Id == examId && r.PatientId == id &&
        string.Equals(r.Type, "exam", StringComparison.OrdinalIgnoreCase));
    if (record is null) return Results.NotFound(new { error = "Exame não encontrado" });

    var attachmentsJson = record.Metadata is not null && record.Metadata.TryGetValue("attachments", out var attEl)
        ? attEl.GetRawText() : "[]";
    using var attachmentsDoc = JsonDocument.Parse(attachmentsJson);
    if (attachmentsDoc.RootElement.ValueKind != JsonValueKind.Array)
        return Results.NotFound(new { error = "Anexo não encontrado" });

    var attachment = attachmentsDoc.RootElement.EnumerateArray().FirstOrDefault(att =>
        string.Equals(att.TryGetProperty("id", out var idEl) ? idEl.GetString() : null, attachmentId, StringComparison.Ordinal)
        || string.Equals(Path.GetFileName(att.TryGetProperty("url", out var urlEl) ? urlEl.GetString() : ""), attachmentId, StringComparison.Ordinal));
    if (attachment.ValueKind == JsonValueKind.Undefined)
        return Results.NotFound(new { error = "Anexo não encontrado" });

    var fileName = attachment.TryGetProperty("name", out var nameEl) ? (nameEl.GetString() ?? "anexo") : "anexo";
    var contentType = attachment.TryGetProperty("contentType", out var typeEl) ? (typeEl.GetString() ?? "application/octet-stream") : "application/octet-stream";
    var path = ResolveAttachmentPath(env, id, examId, attachmentId);
    if (!System.IO.File.Exists(path))
        return Results.NotFound(new { error = "Arquivo do anexo não encontrado" });

    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "exam_attachment_downloaded", "exam", examId, $"Download de anexo: {fileName}", id);
    await store.WriteAsync(state);
    return Results.File(path, contentType, fileName, enableRangeProcessing: true);
}).RequireAuthorization();

// DELETE /patients/{id}/exams/{examId}
app.MapDelete("/patients/{id}/exams/{examId}", async (
    ClaimsPrincipal principal, string id, string examId,
    HttpRequest request,
    [FromBody] Dictionary<string, JsonElement> body,
    AppStateStore store, AuthService auth,
    IWebHostEnvironment env) =>
{
    var authUser = await auth.GetAuthUserAsync(principal, store);
    if (authUser is null) return Results.Unauthorized();
    if (!(auth.IsFullClinical(authUser)))
        return Results.StatusCode(StatusCodes.Status403Forbidden);
    var state = await store.ReadAsync();
    var patient = state.Patients.FirstOrDefault(p => p.Id == id);
    if (patient is null) return Results.NotFound(new { error = "Paciente nÃ£o encontrado" });
    if (!auth.CanAccessPatient(authUser, patient)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var idx = state.ClinicalRecords.FindIndex(r =>
        r.Id == examId && r.PatientId == id &&
        string.Equals(r.Type, "exam", StringComparison.OrdinalIgnoreCase));
    if (idx < 0) return Results.NotFound(new { error = "Exame nÃ£o encontrado" });

    var record = state.ClinicalRecords[idx];
    var reason = ReadJsonString(body, "reason").Trim();
    if (string.IsNullOrWhiteSpace(reason))
        reason = (request.Query["reason"].ToString() ?? "").Trim(); // fallback para compatibilidade
    if (string.IsNullOrWhiteSpace(reason))
    {
        return Results.BadRequest(new { error = "Justificativa obrigatÃ³ria para inativar exame" });
    }
    record.Metadata ??= new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase);
    record.Metadata["inactive"] = JsonSerializer.SerializeToElement(true);
    record.Metadata["inactivationReason"] = JsonSerializer.SerializeToElement(reason);
    record.Metadata["inactivatedAt"] = JsonSerializer.SerializeToElement(DateTime.UtcNow.ToString("O"));
    record.Metadata["inactivatedBy"] = JsonSerializer.SerializeToElement(authUser.Name ?? authUser.Id);
    state.ClinicalRecords[idx] = record;
    AppendAuditToState(state, authUser.Id, authUser.Name, authUser.Role, "exam_inactivated", "exam", examId, reason, id);
    await store.WriteAsync(state);
    return Results.Ok(new { ok = true, inactive = true });
}).RequireAuthorization();


// â”€â”€ Audit log endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.MapGet("/audit/logs", (
    ClaimsPrincipal principal,
    HttpContext ctx,
    AppStateStore store,
    AuthService auth,
    int? limit,
    string? entity,
    string? action,
    string? userId) =>
{
    var authUserId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var state = store.ReadAsync().GetAwaiter().GetResult();
    var authUser = state.Users.FirstOrDefault(u => u.Id == authUserId);
    if (authUser is null) return Results.Unauthorized();
    if (!auth.IsManager(authUser)) return Results.StatusCode(StatusCodes.Status403Forbidden);

    var logs = state.AuditLogs.AsEnumerable();
    if (!string.IsNullOrWhiteSpace(entity))
        logs = logs.Where(l => string.Equals(l.Extra is not null && l.Extra.TryGetValue("entity", out var entityValue) ? entityValue.GetString() : "", entity, StringComparison.OrdinalIgnoreCase));
    if (!string.IsNullOrWhiteSpace(action))
        logs = logs.Where(l => string.Equals(l.Action, action, StringComparison.OrdinalIgnoreCase));
    if (!string.IsNullOrWhiteSpace(userId))
        logs = logs.Where(l => string.Equals(l.UserId ?? "", userId, StringComparison.Ordinal));

    var result = logs
        .OrderByDescending(l => AuthService.ParseDate(l.CreatedAt) ?? DateTime.MinValue)
        .Take(Math.Min(limit ?? 200, 1000))
        .Select(l => new
        {
            id = l.Id,
            timestamp = l.CreatedAt,
            userId = l.UserId,
            userName = l.UserName,
            userRole = l.UserRole,
            action = l.Action,
            entity = l.Extra is not null && l.Extra.TryGetValue("entity", out var entityValue) ? entityValue.GetString() : "",
            entityId = l.Extra is not null && l.Extra.TryGetValue("entityId", out var entityIdValue) ? entityIdValue.GetString() : "",
            detail = l.Extra is not null && l.Extra.TryGetValue("detail", out var detailValue) ? detailValue.GetString() : "",
            ip = l.Extra is not null && l.Extra.TryGetValue("ip", out var ipValue) ? ipValue.GetString() : "",
            patientId = l.PatientId
        })
        .ToList();
    return Results.Ok(result);
}).RequireAuthorization();

// SPA fallback: qualquer rota nÃ£o encontrada devolve index.html
// Isso permite que o React Router funcione corretamente
app.MapFallbackToFile("index.html");

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
    if (specialty == "medical") return "Consulta mÃƒÂ©dica";
    if (specialty == "nursing") return "Consulta de enfermagem";
    if (specialty == "dental") return "Consulta odontolÃƒÂ³gica";
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

static string DigitsOnly(string? value)
{
    return new string((value ?? "").Where(char.IsDigit).ToArray());
}

static bool IsFutureDateString(string? value)
{
    return DateTime.TryParse(value, out var parsed) && parsed.Date > DateTime.UtcNow.Date;
}

static bool IsValidPhoneBr(string? value)
{
    var digits = DigitsOnly(value);
    return digits.Length is 10 or 11;
}

static bool IsValidCpf(string? value)
{
    var digits = DigitsOnly(value);
    if (digits.Length != 11) return false;
    if (digits.Distinct().Count() == 1) return false;

    static int CalculateDigit(ReadOnlySpan<char> digits, int factor)
    {
        var sum = 0;
        for (var i = 0; i < digits.Length; i += 1)
        {
            sum += (digits[i] - '0') * factor--;
        }

        var remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    }

    var firstDigit = CalculateDigit(digits.AsSpan(0, 9), 10);
    var secondDigit = CalculateDigit(digits.AsSpan(0, 10), 11);
    return digits[9] - '0' == firstDigit && digits[10] - '0' == secondDigit;
}

static bool IsValidCns(string? value)
{
    var digits = DigitsOnly(value);
    if (digits.Length != 15 || !digits.All(char.IsDigit)) return false;

    long sum = 0;
    for (var i = 0; i < 15; i += 1)
    {
        sum += (digits[i] - '0') * (15 - i);
    }

    return sum % 11 == 0;
}

static bool IsPatientInactive(Patient patient)
{
    return patient.Extra is not null
        && patient.Extra.TryGetValue("inactive", out var inactive)
        && inactive.ValueKind == JsonValueKind.True;
}

PatientListItemDto ToPatientListItemDto(Patient patient)
{
    var cpf = DecryptField(patient.Cpf);
    var cns = DecryptField(patient.Cns);
    var phone = DecryptField(patient.Phone);
    var phoneAlt = DecryptField(patient.PhoneAlt);
    return new PatientListItemDto
    {
        Id = patient.Id,
        TeamId = patient.TeamId,
        Name = patient.Name,
        MotherName = patient.MotherName,
        Cpf = SecurityDataHelpers.MaskCpf(cpf),
        Cns = SecurityDataHelpers.MaskCns(cns),
        CnsCpf = SecurityDataHelpers.MaskDocumentPreference(patient.CnsCpf, cpf, cns),
        Phone = SecurityDataHelpers.MaskPhone(phone),
        PhoneAlt = SecurityDataHelpers.MaskPhone(phoneAlt),
        MicroArea = patient.MicroArea,
        AssignedAcsId = patient.AssignedAcsId,
        CareCategory = patient.CareCategory,
        ChronicConditions = patient.ChronicConditions,
        BirthDate = patient.BirthDate,
        CreatedAt = patient.CreatedAt,
        CreatedBy = patient.CreatedBy,
        UpdatedAt = patient.UpdatedAt
    };
}

PatientDetailDto ToPatientDetailDto(Patient patient)
{
    var detail = new PatientDetailDto
    {
        Id = patient.Id,
        TeamId = patient.TeamId,
        Name = patient.Name,
        MotherName = patient.MotherName,
        Cpf = DecryptField(patient.Cpf),
        Cns = DecryptField(patient.Cns),
        CnsCpf = patient.CnsCpf,
        Address = patient.Address,
        Phone = DecryptField(patient.Phone) ?? "",
        PhoneAlt = DecryptField(patient.PhoneAlt),
        MicroArea = patient.MicroArea,
        AssignedAcsId = patient.AssignedAcsId,
        CareCategory = patient.CareCategory,
        ChronicConditions = patient.ChronicConditions,
        BirthDate = patient.BirthDate,
        CreatedAt = patient.CreatedAt,
        CreatedBy = patient.CreatedBy,
        UpdatedAt = patient.UpdatedAt,
        Extra = patient.Extra is null ? null : new Dictionary<string, JsonElement>(patient.Extra, StringComparer.OrdinalIgnoreCase)
    };
    return detail;
}

string ResolveAttachmentPath(IWebHostEnvironment env, string patientId, string examId, string attachmentId)
{
    var privatePath = Path.Combine(uploadsRoot, patientId, examId, attachmentId);
    if (System.IO.File.Exists(privatePath)) return privatePath;

    var legacyWebRoot = env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    return Path.Combine(legacyWebRoot, "uploads", patientId, attachmentId);
}

static bool TryEnforceRateLimit(HttpContext ctx, ConcurrentDictionary<string, Queue<DateTime>> store, out int retryAfterSeconds)
{
    retryAfterSeconds = 0;
    var policy = GetRateLimitPolicy(ctx.Request.Path);
    if (policy is null) return false;

    var identifier = GetRateLimitIdentifier(ctx);
    var key = $"{policy.Value.Key}:{identifier}";
    var now = DateTime.UtcNow;
    var windowStart = now.Add(policy.Value.Window.Negate());
    var queue = store.GetOrAdd(key, _ => new Queue<DateTime>());

    lock (queue)
    {
        while (queue.Count > 0 && queue.Peek() < windowStart)
        {
            queue.Dequeue();
        }

        if (queue.Count >= policy.Value.Limit)
        {
            retryAfterSeconds = queue.Count > 0
                ? Math.Max(1, (int)Math.Ceiling((queue.Peek().Add(policy.Value.Window) - now).TotalSeconds))
                : (int)policy.Value.Window.TotalSeconds;
            return true;
        }

        queue.Enqueue(now);
        return false;
    }
}

static (string Key, int Limit, TimeSpan Window)? GetRateLimitPolicy(PathString path)
{
    var value = path.Value ?? "";
    if (value.Equals("/auth/login", StringComparison.OrdinalIgnoreCase)) return ("login", 5, TimeSpan.FromMinutes(5));
    if (value.Equals("/auth/login/verify", StringComparison.OrdinalIgnoreCase)) return ("login-verify", 6, TimeSpan.FromMinutes(5));
    if (value.Equals("/auth/password-reset/request", StringComparison.OrdinalIgnoreCase)) return ("password-reset-request", 4, TimeSpan.FromMinutes(15));
    if (value.Equals("/auth/password-reset/confirm", StringComparison.OrdinalIgnoreCase)) return ("password-reset-confirm", 5, TimeSpan.FromMinutes(15));
    if (value.Contains("/attachments", StringComparison.OrdinalIgnoreCase) && value.Contains("/exams/", StringComparison.OrdinalIgnoreCase)) return ("exam-attachment", 20, TimeSpan.FromMinutes(10));
    return null;
}

static string GetRateLimitIdentifier(HttpContext ctx)
{
    var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown-ip";
    var bodyHint = "";

    if (ctx.Request.Method.Equals("POST", StringComparison.OrdinalIgnoreCase))
    {
        var email = ctx.Request.Query["email"].ToString();
        if (!string.IsNullOrWhiteSpace(email)) bodyHint = email.Trim().ToLowerInvariant();
    }

    var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    return $"{ip}|{userId}|{bodyHint}";
}

static void AppendAuditToState(
    AppDb state,
    string? userId,
    string? userName,
    string? userRole,
    string action,
    string entity,
    string entityId,
    string detail,
    string? patientId = null,
    HttpContext? ctx = null)
{
    state.AuditLogs ??= new List<AuditLogItem>();
    state.AuditLogs.Add(new AuditLogItem
    {
        Id = Guid.NewGuid().ToString("N"),
        PatientId = patientId,
        UserId = userId,
        UserName = userName,
        UserRole = userRole,
        Action = action,
        CreatedAt = DateTime.UtcNow.ToString("O"),
        Extra = new Dictionary<string, JsonElement>(StringComparer.OrdinalIgnoreCase)
        {
            ["entity"] = JsonSerializer.SerializeToElement(entity),
            ["entityId"] = JsonSerializer.SerializeToElement(entityId),
            ["detail"] = JsonSerializer.SerializeToElement(detail),
            ["ip"] = JsonSerializer.SerializeToElement(ctx?.Connection.RemoteIpAddress?.ToString() ?? "unknown")
        }
    });
}

static async Task WriteAuditAsync(
    AppStateStore store,
    string? userId,
    string? userName,
    string? userRole,
    string action,
    string entity,
    string entityId,
    string detail,
    string? patientId = null,
    HttpContext? ctx = null)
{
    var state = await store.ReadAsync();
    AppendAuditToState(state, userId, userName, userRole, action, entity, entityId, detail, patientId, ctx);
    await store.WriteAsync(state);
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

    var scheduled = monthAppointments.Count(a => {
        var dt = (a.DemandType ?? "").Trim().ToLowerInvariant();
        return dt == "scheduled" || dt == "retroactive";
    });
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

record AuditEntry(
    string Id,
    string Timestamp,
    string UserId,
    string UserName,
    string Action,
    string Entity,
    string EntityId,
    string Detail,
    string Ip
);



