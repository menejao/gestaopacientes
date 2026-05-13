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
    private const string Pbkdf2Prefix = "pbkdf2$";
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
            "gestor"                                => "gestor",
            _                                       => ""
        };
    }

    public bool IsGestor(User user)       => CanonicalRole(user.Role) == "gestor";
    public bool IsManager(User user)      => CanonicalRole(user.Role) is "nurse_manager" or "gestor";
    public bool IsDoctor(User user)       => CanonicalRole(user.Role) == "doctor";
    public bool IsDentist(User user)      => CanonicalRole(user.Role) == "dentist";
    public bool IsAcs(User user)          => CanonicalRole(user.Role) == "acs";
    public bool IsNursingTech(User user)  => CanonicalRole(user.Role) == "nursing_tech";
    public bool IsPharmacist(User user)   => CanonicalRole(user.Role) is "pharmacist" or "pharmacy_tech";
    public bool IsReceptionist(User user) => CanonicalRole(user.Role) == "receptionist";
    public bool IsFullClinical(User user) => IsManager(user) || IsDoctor(user) || IsDentist(user);
    public bool IsPrivilegedRole(string? role) => CanonicalRole(role) is "gestor" or "nurse_manager";
    public bool RequiresMandatoryMfa(string? role) => CanonicalRole(role) is
        "gestor" or
        "nurse_manager" or
        "doctor" or
        "dentist" or
        "pharmacist" or
        "pharmacy_tech";

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
        var salt = RandomNumberGenerator.GetBytes(16);
        const int iterations = 210_000;
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(plainPassword),
            salt,
            iterations,
            HashAlgorithmName.SHA512,
            32);
        return $"{Pbkdf2Prefix}{iterations}${Convert.ToHexString(salt)}${Convert.ToHexString(hash)}";
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

        if (value.StartsWith(Pbkdf2Prefix, StringComparison.OrdinalIgnoreCase))
        {
            try { return VerifyPbkdf2Hash(input, value); }
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
        var known = new HashSet<string>(StringComparer.Ordinal)
        {
            "hypertension", "diabetes", "asthma", "obesity", "ckd",
            "heart_failure", "copd", "mental_health", "cancer", "stroke",
            "hypothyroidism", "hyperthyroidism", "epilepsy", "aids_hiv"
        };
        return (values ?? Array.Empty<string>())
            .Select(v => (v ?? "").Trim().ToLowerInvariant())
            .Where(v => known.Contains(v))
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
    public string CreateToken(User user, string? sessionId = null)
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
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            claims.Add(new Claim("sid", sessionId));
        }
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

    public string GenerateRefreshToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    public string HashOpaqueToken(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value ?? ""));
        return Convert.ToHexString(bytes);
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

    private static bool VerifyPbkdf2Hash(string password, string stored)
    {
        var parts = stored.Split('$', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 4 || !string.Equals(parts[0], "pbkdf2", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!int.TryParse(parts[1], out var iterations) || iterations < 100_000)
        {
            return false;
        }

        var salt = Convert.FromHexString(parts[2]);
        var expected = Convert.FromHexString(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password ?? ""),
            salt,
            iterations,
            HashAlgorithmName.SHA512,
            expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    public bool VerifyTotpCode(string? secret, string? code, DateTime? utcNow = null)
    {
        var normalizedCode = (code ?? "").Trim();
        if (string.IsNullOrWhiteSpace(secret) || normalizedCode.Length != 6 || !normalizedCode.All(char.IsDigit))
        {
            return false;
        }

        byte[] secretBytes;
        try
        {
            secretBytes = DecodeBase32(secret);
        }
        catch
        {
            return false;
        }

        var now = utcNow ?? DateTime.UtcNow;
        var timestep = GetCurrentTotpTimestepNumber(now);
        for (var offset = -1; offset <= 1; offset += 1)
        {
            var candidate = GenerateTotpCode(secretBytes, timestep + offset);
            if (CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(candidate),
                Encoding.ASCII.GetBytes(normalizedCode)))
            {
                return true;
            }
        }

        return false;
    }

    private static long GetCurrentTotpTimestepNumber(DateTime utcNow)
    {
        var unixTime = new DateTimeOffset(utcNow).ToUnixTimeSeconds();
        return unixTime / 30L;
    }

    private static string GenerateTotpCode(byte[] secretBytes, long timestepNumber)
    {
        Span<byte> timestepAsBytes = stackalloc byte[8];
        for (var i = 7; i >= 0; i -= 1)
        {
            timestepAsBytes[i] = (byte)(timestepNumber & 0xFF);
            timestepNumber >>= 8;
        }

        using var hmac = new HMACSHA1(secretBytes);
        var hash = hmac.ComputeHash(timestepAsBytes.ToArray());
        var offset = hash[^1] & 0x0F;
        var binaryCode =
            ((hash[offset] & 0x7F) << 24) |
            ((hash[offset + 1] & 0xFF) << 16) |
            ((hash[offset + 2] & 0xFF) << 8) |
            (hash[offset + 3] & 0xFF);

        var otp = binaryCode % 1_000_000;
        return otp.ToString("D6");
    }

    private static byte[] DecodeBase32(string secret)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var sanitized = new string((secret ?? "")
            .Trim()
            .ToUpperInvariant()
            .Where(c => !char.IsWhiteSpace(c) && c != '=')
            .ToArray());

        if (sanitized.Length == 0)
        {
            return Array.Empty<byte>();
        }

        var output = new List<byte>((sanitized.Length * 5) / 8);
        var buffer = 0;
        var bitsLeft = 0;

        foreach (var c in sanitized)
        {
            var value = alphabet.IndexOf(c);
            if (value < 0)
            {
                throw new FormatException("Base32 inválido.");
            }

            buffer = (buffer << 5) | value;
            bitsLeft += 5;

            if (bitsLeft >= 8)
            {
                output.Add((byte)((buffer >> (bitsLeft - 8)) & 0xFF));
                bitsLeft -= 8;
            }
        }

        return output.ToArray();
    }
}
