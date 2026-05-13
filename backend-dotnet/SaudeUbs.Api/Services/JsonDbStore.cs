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

            var tempPath = $"{_dbPath}.tmp";
            var backupPath = $"{_dbPath}.bak";

            await using (var fs = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(fs, state, JsonOptions);
            }

            if (File.Exists(_dbPath))
            {
                File.Copy(_dbPath, backupPath, overwrite: true);
            }

            File.Move(tempPath, _dbPath, overwrite: true);
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

        try
        {
            await using var fs = File.OpenRead(_dbPath);
            return EnsureCollections(await JsonSerializer.DeserializeAsync<AppDb>(fs, JsonOptions) ?? new AppDb());
        }
        catch (Exception ex)
        {
            var corruptedPath = $"{_dbPath}.corrupt-{DateTime.UtcNow:yyyyMMddHHmmss}.json";
            try
            {
                File.Copy(_dbPath, corruptedPath, overwrite: true);
            }
            catch
            {
                // Mantém o erro original como aviso no console e segue com base vazia.
            }

            Console.Error.WriteLine($"[ERRO] Falha ao ler JSON de persistência em '{_dbPath}': {ex.Message}");
            return new AppDb();
        }
    }

    private static AppDb EnsureCollections(AppDb state)
    {
        state.Teams ??= new();
        state.Users ??= new();
        state.Patients ??= new();
        state.Appointments ??= new();
        state.Tasks ??= new();
        state.Messages ??= new();
        state.AuditLogs ??= new();
        state.ClinicalRecords ??= new();
        state.ProtocolTemplates ??= new();
        return state;
    }
}
