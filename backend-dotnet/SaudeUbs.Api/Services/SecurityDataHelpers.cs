namespace SaudeUbs.Api.Services;

public static class SecurityDataHelpers
{
    public static string DigitsOnly(string? value)
    {
        return new string((value ?? "").Where(char.IsDigit).ToArray());
    }

    public static bool IsValidPhoneBr(string? value)
    {
        var digits = DigitsOnly(value);
        return digits.Length is 10 or 11;
    }

    public static bool IsValidCpf(string? value)
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

    public static bool IsValidCns(string? value)
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

    public static string? MaskCpf(string? value)
    {
        var digits = DigitsOnly(value);
        if (digits.Length != 11) return string.IsNullOrWhiteSpace(value) ? value : "***";
        return $"***.***.***-{digits[^2..]}";
    }

    public static string? MaskCns(string? value)
    {
        var digits = DigitsOnly(value);
        if (digits.Length != 15) return string.IsNullOrWhiteSpace(value) ? value : $"***{digits[^4..]}";
        return $"*** *** *** **{digits[^4..]}";
    }

    public static string? MaskPhone(string? value)
    {
        var digits = DigitsOnly(value);
        if (digits.Length < 8) return string.IsNullOrWhiteSpace(value) ? value : "***";
        var suffix = digits[^4..];
        return digits.Length switch
        {
            10 => $"(**) ****-{suffix}",
            11 => $"(**) *****-{suffix}",
            _ => $"***{suffix}"
        };
    }

    public static string? MaskDocumentPreference(string? preferred, string? cpf, string? cns)
    {
        var preferredDigits = DigitsOnly(preferred);
        if (!string.IsNullOrWhiteSpace(preferredDigits))
        {
            return preferredDigits.Length == 11 ? MaskCpf(preferredDigits) : MaskCns(preferredDigits);
        }
        if (!string.IsNullOrWhiteSpace(cns)) return MaskCns(cns);
        return MaskCpf(cpf);
    }

    public static bool IsAllowedUploadExtension(string? extension)
    {
        return extension?.ToLowerInvariant() is ".pdf" or ".jpg" or ".jpeg" or ".png";
    }

    public static bool IsAllowedUploadContentType(string? contentType, string extension)
    {
        var normalized = (contentType ?? "").Trim().ToLowerInvariant();
        return extension.ToLowerInvariant() switch
        {
            ".pdf" => normalized is "application/pdf",
            ".jpg" or ".jpeg" => normalized is "image/jpeg" or "image/pjpeg",
            ".png" => normalized is "image/png",
            _ => false
        };
    }

    public static string SanitizeUploadFileName(string? fileName)
    {
        var originalName = Path.GetFileNameWithoutExtension(fileName ?? "");
        var safeName = new string(originalName
            .Select(c => char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_')
            .ToArray())
            .Trim('_');
        if (string.IsNullOrWhiteSpace(safeName)) safeName = "arquivo";
        return safeName;
    }

    public static bool LooksLikeSafeFileSignature(byte[] bytes, string extension)
    {
        if (bytes.Length < 4) return false;
        extension = extension.ToLowerInvariant();
        return extension switch
        {
            ".pdf" => bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46,
            ".png" => bytes.Length >= 8 &&
                      bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 &&
                      bytes[4] == 0x0D && bytes[5] == 0x0A && bytes[6] == 0x1A && bytes[7] == 0x0A,
            ".jpg" or ".jpeg" => bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[^2] == 0xFF && bytes[^1] == 0xD9,
            _ => false
        };
    }
}
