using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Org.BouncyCastle.Crypto.Generators;
using SaudeUbs.Api.Models;

namespace SaudeUbs.Api.Services;

public sealed class AuthService
{
    private readonly AppConfig _config;
    private const string BcryptPrefix = "$2a$";
    private const string ScryptPrefix = "s1$";

    public AuthService(AppConfig config) => _config = config;

    // ── Roles ─────────────────────────────────────────────────────
    public string CanonicalRole(string? role)
    {
        var input = (role ?? "").Trim().ToLowerInvariant();
        return input switch
        {
            "nurse" or "enfermeiro" or "enfermeira" => "nurse_manager",
            "medica" or "medico"                    => "doctor",
            "nurse_manager"                         => "nurse_manager",
            "doctor"                                => "doctor",
            "dentist"                               => "dentist",
            "acs"                                   => "acs",
            "nursing_tech"                          => "nursing_tech",
            "pharmacist"                            => "pharmacist",
            "pharmacy_tech"                         => "pharmacy_tech",
            "receptionist"                          => "receptionist",
            _                                       => input
        };
    }

    public bool IsManager(User user)      => CanonicalRole(user.Role) == "nurse_manager";
    public bool IsDoctor(User user)       => CanonicalRole(user.Role) == "doctor";
    public bool IsDentist(User user)      => CanonicalRole(user.Role) == "dentist";
    public bool IsAcs(User user)          => CanonicalRole(user.Role) == "acs";
    public bool IsNursingTech(User user)  => CanonicalRole(user.Role) == "nursing_tech";
    public bool IsPharmacist(User user)   => CanonicalRole(user.Role) is "pharmacist" or "pharmacy_tech";
    public bool IsReceptionist(User user) => CanonicalRole(user.Role) == "receptionist";
    public bool IsFullClinical(User user) => IsManager(user) || IsDoctor(user) || IsDentist(user);

    // ── Acesso a pacientes ────────────────────────────────────────
    public bool CanAccessPatient(User user, Patient patient)
    {
        if (!string.Equals(patient.TeamId, user.TeamId, StringComparison.Ordinal)) return false;
        if (IsFullClinical(user) || IsNursingTech(user)) return true;
        if (IsAcs(user))
            return string.Equals(patient.AssignedAcsId ?? "", user.Id, StringComparison.Ordinal);
        return false;
    }

    // ── Senhas ────────────────────────────────────────────────────

    /// <summary>
    /// Hash BCrypt work factor 12. NUNCA armazena texto puro.
    /// </summary>
    public string HashPassword(string plainPassword)
    {
        if (string.IsNullOrWhiteSpace(plainPassword))
            throw new ArgumentException("Senha não pode ser vazia");
        return BCrypt.Net.BCrypt.HashPassword(plainPassword, workFactor: 12);
    }

    /// <summary>
    /// Verifica senha. Aceita BCrypt (novo) e scrypt legado Node.js.
    /// NUNCA aceita texto puro — senhas sem hash são rejeitadas.
    /// </summary>
    public bool VerifyPassword(string candidate, string stored)
    {
        var input = candidate ?? "";
        var value = stored ?? "";
        if (string.IsNullOrWhiteSpace(value)) return false;

        if (value.StartsWith(BcryptPrefix, StringComparison.OrdinalIgnoreCase))
        {
            try { return BCrypt.Net.BCrypt.Verify(input, value); }
            catch { return false; }
        }

        if (value.StartsWith(ScryptPrefix, StringComparison.OrdinalIgnoreCase))
            return VerifyNodeScryptHash(input, value);

        // Sem prefixo = sem hash = acesso negado.
        // Usuário deve usar "Esqueci minha senha" para gerar hash novo.
        return false;
    }

    // ── Dados clínicos ────────────────────────────────────────────
    public static List<string> NormalizeChronicConditions(IEnumerable<string>? values)
    {
        return (values ?? Array.Empty<string>())
            .Select(v => (v ?? "").Trim().ToLowerInvariant())
            .Where(v => v is "hypertension" or "diabetes")
            .Distinct().ToList();
    }

    // ── Sanitização — NUNCA expõe senha ou secret ─────────────────
    public object SanitizeUser(AppDb db, User user)
    {
        var teamName = db.Teams.FirstOrDefault(t => t.Id == user.TeamId)?.Name ?? "Sem equipe";
        var councilNumber = "";
        var councilUf = "";
        if (user.Extra?.TryGetValue("councilNumber", out var cNum) == true
            && cNum.ValueKind == System.Text.Json.JsonValueKind.String)
            councilNumber = cNum.GetString() ?? "";
        if (user.Extra?.TryGetValue("councilUf", out var cUf) == true
            && cUf.ValueKind == System.Text.Json.JsonValueKind.String)
            councilUf = cUf.GetString() ?? "";

        return new
        {
            id               = user.Id,
            name             = user.Name,
            role             = CanonicalRole(user.Role),
            email            = user.Email,
            teamId           = user.TeamId,
            teamName,
            councilNumber,
            councilUf,
            twoFactorEnabled = user.TwoFactorEnabled
            // Password, TwoFactorSecret e Extra NUNCA são retornados
        };
    }

    // ── JWT ───────────────────────────────────────────────────────
    public string CreateToken(User user)
    {
        var now    = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new("id",     user.Id),
            new("name",   user.Name ?? ""),
            new("role",   CanonicalRole(user.Role)),
            new("email",  user.Email ?? ""),
            new("teamId", user.TeamId ?? "")
        };
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config.JwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var jwt   = new JwtSecurityToken(
            issuer:             _config.JwtIssuer,
            audience:           _config.JwtAudience,
            claims:             claims,
            notBefore:          now,
            expires:            now.AddHours(_config.JwtExpiresHours),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    public async Task<User?> GetAuthUserAsync(ClaimsPrincipal principal, AppStateStore store)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? principal.FindFirstValue("id") ?? "";
        if (string.IsNullOrWhiteSpace(userId)) return null;
        var state = await store.ReadAsync();
        return state.Users.FirstOrDefault(u => u.Id == userId);
    }

    // ── Helpers ───────────────────────────────────────────────────
    public static DateTime? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return DateTime.TryParse(value, out var dt) ? dt.Date : null;
    }

    public static int? DaysDiff(DateTime? from, DateTime? to = null)
    {
        if (from is null) return null;
        return (int)((to ?? DateTime.UtcNow).Date - from.Value.Date).TotalDays;
    }

    public static string NormalizeText(string? value)
    {
        var raw = (value ?? "").Trim().ToLowerInvariant();
        return raw
            .Replace("á","a").Replace("à","a").Replace("ã","a").Replace("â","a")
            .Replace("é","e").Replace("ê","e").Replace("í","i")
            .Replace("ó","o").Replace("ô","o").Replace("õ","o")
            .Replace("ú","u").Replace("ç","c");
    }

    public static bool IsDentalText(string? value)
    {
        var text = NormalizeText(value);
        return text.Contains("dent") || text.Contains("odont") || text.Contains("bucal");
    }

    private static bool VerifyNodeScryptHash(string password, string stored)
    {
        try
        {
            var parts = stored.Split('$');
            if (parts.Length != 3) return false;
            var saltHex     = parts[1];
            var expectedHex = parts[2];
            if (string.IsNullOrWhiteSpace(saltHex) || string.IsNullOrWhiteSpace(expectedHex)) return false;
            if (expectedHex.Length != 128) return false;
            var keyBytes  = Encoding.UTF8.GetBytes(password ?? "");
            var saltBytes = Encoding.UTF8.GetBytes(saltHex);
            var derived   = SCrypt.Generate(keyBytes, saltBytes, 16384, 8, 1, 64);
            var expected  = Convert.FromHexString(expectedHex);
            if (derived.Length != expected.Length) return false;
            return CryptographicOperations.FixedTimeEquals(derived, expected);
        }
        catch { return false; }
    }
}
