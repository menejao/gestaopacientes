using System.Text.Json;
using SaudeUbs.Api.Models;

namespace SaudeUbs.Api.Services;

public sealed class JsonDbStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _dbPath;

    public JsonDbStore()
    {
        var envPath = (Environment.GetEnvironmentVariable("DB_JSON_PATH") ?? "").Trim();
        _dbPath = !string.IsNullOrWhiteSpace(envPath)
            ? envPath
            : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "backend", "data", "db.json"));
    }

    public async Task<AppDb> ReadAsync()
    {
        await _gate.WaitAsync();
        try
        {
            return await ReadNoLockAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task WriteAsync(AppDb state)
    {
        await _gate.WaitAsync();
        try
        {
            var dir = Path.GetDirectoryName(_dbPath);
            if (!string.IsNullOrWhiteSpace(dir))
            {
                Directory.CreateDirectory(dir);
            }

            await using var fs = File.Create(_dbPath);
            await JsonSerializer.SerializeAsync(fs, state, JsonOptions);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<AppDb> ReadNoLockAsync()
    {
        if (!File.Exists(_dbPath))
        {
            return new AppDb();
        }

        await using var fs = File.OpenRead(_dbPath);
        var state = await JsonSerializer.DeserializeAsync<AppDb>(fs, JsonOptions) ?? new AppDb();
        state.Teams ??= new();
        state.Users ??= new();
        state.Patients ??= new();
        state.Appointments ??= new();
        state.ClinicalRecords ??= new();
        state.ProtocolTemplates ??= new();
        return state;
    }
}
