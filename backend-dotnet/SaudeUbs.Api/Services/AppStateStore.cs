using SaudeUbs.Api.Models;

namespace SaudeUbs.Api.Services;

public sealed class AppStateStore
{
    private readonly JsonDbStore _jsonStore;
    private readonly PgDbStore? _pgStore;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private bool _isPgAvailableChecked;
    private bool _isPgAvailable;
    private bool _initialSyncChecked;

    public AppStateStore(JsonDbStore jsonStore, PgDbStore? pgStore = null)
    {
        _jsonStore = jsonStore;
        _pgStore = pgStore;
    }

    public async Task<(string mode, bool connected)> GetPersistenceStatusAsync()
    {
        if (_pgStore is null) return ("json", true);
        var ok = await IsPgAvailableAsync();
        return ("postgres", ok);
    }

    public async Task<AppDb> ReadAsync()
    {
        if (await IsPgAvailableAsync())
        {
            return await _pgStore!.ReadAsync();
        }
        return await _jsonStore.ReadAsync();
    }

    public async Task WriteAsync(AppDb state)
    {
        await _gate.WaitAsync();
        try
        {
            // Purge stale sessions to prevent unbounded JSON/DB growth.
            // Keep sessions that are active OR revoked/rotated within the last 7 days (audit window).
            var cutoff = DateTime.UtcNow.AddDays(-7);
            state.RefreshSessions?.RemoveAll(s =>
            {
                if (!DateTime.TryParse(s.ExpiresAt, null, System.Globalization.DateTimeStyles.RoundtripKind, out var exp))
                    return true; // malformed — remove
                if (exp < DateTime.UtcNow)
                {
                    // Expired: keep briefly for audit, then remove
                    if (!string.IsNullOrWhiteSpace(s.RevokedAt) || !string.IsNullOrWhiteSpace(s.RotatedAt))
                        return exp < cutoff;
                    return exp < cutoff;
                }
                return false;
            });

            if (await IsPgAvailableAsync())
            {
                await _pgStore!.WriteAsync(state);
                return;
            }
            await _jsonStore.WriteAsync(state);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<bool> IsPgAvailableAsync()
    {
        if (_pgStore is null) return false;
        if (_isPgAvailableChecked) return _isPgAvailable;

        try
        {
            await _pgStore.EnsureCreatedAsync();
            _isPgAvailable = await _pgStore.CanConnectAsync();
            if (_isPgAvailable)
            {
                await EnsureInitialSyncAsync();
            }
        }
        catch
        {
            _isPgAvailable = false;
        }
        _isPgAvailableChecked = true;
        return _isPgAvailable;
    }

    private async Task EnsureInitialSyncAsync()
    {
        if (_initialSyncChecked || _pgStore is null) return;
        var isEmpty = await _pgStore.IsEmptyAsync();
        if (!isEmpty)
        {
            _initialSyncChecked = true;
            return;
        }

        var jsonState = await _jsonStore.ReadAsync();
        var hasData = jsonState.Users.Count > 0
            || jsonState.Patients.Count > 0
            || jsonState.Teams.Count > 0
            || jsonState.Appointments.Count > 0
            || jsonState.ClinicalRecords.Count > 0
            || jsonState.ProtocolTemplates.Count > 0;

        if (hasData)
        {
            await _pgStore.WriteAsync(jsonState);
        }
        _initialSyncChecked = true;
    }
}
