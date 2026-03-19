using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SaudeUbs.Api.Models;

namespace SaudeUbs.Api.Services;

public sealed class AuthService
{
    private readonly AppConfig _config;

    public AuthService(AppConfig config)
    {
        _config = config;
    }

    public string CanonicalRole(string? role)
    {
        var input = (role ?? "").Trim().ToLowerInvariant();
        if (input == "nurse" || input == "enfermeiro") return "nurse_manager";
        if (input == "medica") return "doctor";
        return input;
    }

    public bool IsManager(User user) => CanonicalRole(user.Role) == "nurse_manager";
    public bool IsDoctor(User user) => CanonicalRole(user.Role) == "doctor";
    public bool IsAcs(User user) => CanonicalRole(user.Role) == "acs";

    public bool CanAccessPatient(User user, Patient patient)
    {
        if (!string.Equals(patient.TeamId, user.TeamId, StringComparison.Ordinal)) return false;
        if (IsManager(user) || IsDoctor(user)) return true;
        if (IsAcs(user)) return string.Equals(patient.AssignedAcsId ?? "", user.Id, StringComparison.Ordinal);
        return false;
    }

    public bool VerifyPassword(string candidate, string stored)
    {
        var input = candidate ?? "";
        var value = stored ?? "";
        if (string.IsNullOrWhiteSpace(value)) return false;
        if (value.StartsWith("s1$", StringComparison.OrdinalIgnoreCase))
        {
            // Compatibilidade scrypt do Node será portada no próximo bloco.
            return false;
        }
        return string.Equals(input, value, StringComparison.Ordinal);
    }

    public bool IsDemoAnaCredential(string email, string password)
    {
        return string.Equals((email ?? "").Trim(), "ana@clinica.local", StringComparison.OrdinalIgnoreCase)
            && string.Equals(password ?? "", "123456", StringComparison.Ordinal);
    }

    public static List<string> NormalizeChronicConditions(IEnumerable<string>? values)
    {
        return (values ?? Array.Empty<string>())
            .Select(v => (v ?? "").Trim().ToLowerInvariant())
            .Where(v => v is "hypertension" or "diabetes")
            .Distinct()
            .ToList();
    }

    public object SanitizeUser(AppDb db, User user)
    {
        var teamName = db.Teams.FirstOrDefault(t => t.Id == user.TeamId)?.Name ?? "Sem equipe";
        return new
        {
            id = user.Id,
            name = user.Name,
            role = CanonicalRole(user.Role),
            email = user.Email,
            teamId = user.TeamId,
            teamName,
            twoFactorEnabled = bool.TryParse(user.TwoFactorEnabled.ToString(), out var enabled) && enabled
        };
    }

    public string CreateToken(User user)
    {
        var now = DateTime.UtcNow;
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new("id", user.Id),
            new("name", user.Name ?? ""),
            new("role", CanonicalRole(user.Role)),
            new("email", user.Email ?? ""),
            new("teamId", user.TeamId ?? "")
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config.JwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            issuer: _config.JwtIssuer,
            audience: _config.JwtAudience,
            claims: claims,
            notBefore: now,
            expires: now.AddHours(_config.JwtExpiresHours),
            signingCredentials: creds
        );
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    public async Task<User?> GetAuthUserAsync(ClaimsPrincipal principal, JsonDbStore db)
    {
        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("id") ?? "";
        if (string.IsNullOrWhiteSpace(userId)) return null;
        var state = await db.ReadAsync();
        return state.Users.FirstOrDefault(u => u.Id == userId);
    }

    public static DateTime? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateTime.TryParse(value, out var dt))
        {
            return dt.Date;
        }
        return null;
    }

    public static int? DaysDiff(DateTime? from, DateTime? to = null)
    {
        if (from is null) return null;
        var right = (to ?? DateTime.UtcNow).Date;
        return (int)(right - from.Value.Date).TotalDays;
    }

    public static string NormalizeText(string? value)
    {
        var raw = (value ?? "").Trim().ToLowerInvariant();
        var normalized = raw
            .Replace("á", "a").Replace("à", "a").Replace("ã", "a").Replace("â", "a")
            .Replace("é", "e").Replace("ê", "e")
            .Replace("í", "i")
            .Replace("ó", "o").Replace("ô", "o").Replace("õ", "o")
            .Replace("ú", "u")
            .Replace("ç", "c");
        return normalized;
    }

    public static bool IsDentalText(string? value)
    {
        var text = NormalizeText(value);
        return text.Contains("dent") || text.Contains("odont") || text.Contains("bucal");
    }

}
