using SaudeUbs.Api.Services;

namespace SaudeUbs.Api.Tests;

public sealed class SecurityDataHelpersTests
{
    [Theory]
    [InlineData("529.982.247-25", true)]
    [InlineData("111.111.111-11", false)]
    [InlineData("52998224724", false)]
    public void IsValidCpf_ValidatesExpectedCases(string cpf, bool expected)
    {
        Assert.Equal(expected, SecurityDataHelpers.IsValidCpf(cpf));
    }

    [Theory]
    [InlineData("898001160444649", true)]
    [InlineData("898001160444648", false)]
    [InlineData("123", false)]
    public void IsValidCns_ValidatesExpectedCases(string cns, bool expected)
    {
        Assert.Equal(expected, SecurityDataHelpers.IsValidCns(cns));
    }

    [Theory]
    [InlineData("(11) 99876-1234", true)]
    [InlineData("(11) 3456-7890", true)]
    [InlineData("12345", false)]
    public void IsValidPhoneBr_ValidatesExpectedCases(string phone, bool expected)
    {
        Assert.Equal(expected, SecurityDataHelpers.IsValidPhoneBr(phone));
    }

    [Fact]
    public void Masking_HidesSensitiveSuffixOnly()
    {
        Assert.Equal("***.***.***-25", SecurityDataHelpers.MaskCpf("52998224725"));
        Assert.Equal("*** *** *** **4649", SecurityDataHelpers.MaskCns("898001160444649"));
        Assert.Equal("(**) *****-1234", SecurityDataHelpers.MaskPhone("11998761234"));
    }

    [Theory]
    [InlineData("application/pdf", ".pdf", true)]
    [InlineData("image/png", ".png", true)]
    [InlineData("image/jpeg", ".jpg", true)]
    [InlineData("text/plain", ".pdf", false)]
    [InlineData("application/pdf", ".png", false)]
    public void IsAllowedUploadContentType_ValidatesMimeAgainstExtension(string mime, string ext, bool expected)
    {
        Assert.Equal(expected, SecurityDataHelpers.IsAllowedUploadContentType(mime, ext));
    }

    [Fact]
    public void SanitizeUploadFileName_RemovesUnsafeCharacters()
    {
        Assert.Equal("meu_arquivo_final", SecurityDataHelpers.SanitizeUploadFileName("meu arquivo/final?.pdf"));
    }

    [Fact]
    public void LooksLikeSafeFileSignature_AcceptsKnownPdf()
    {
        var bytes = new byte[] { 0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34 };
        Assert.True(SecurityDataHelpers.LooksLikeSafeFileSignature(bytes, ".pdf"));
    }

    [Fact]
    public void LooksLikeSafeFileSignature_RejectsMismatchedPdf()
    {
        var bytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x00, 0x00, 0x00, 0x00 };
        Assert.False(SecurityDataHelpers.LooksLikeSafeFileSignature(bytes, ".pdf"));
    }
}
