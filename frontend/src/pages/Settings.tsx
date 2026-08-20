import { useEffect, useState } from "react";
import { api, NOTES_UNLOCK_KEY } from "../api/client";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calorieTarget, setCalorieTarget] = useState("");
  const [proteinTarget, setProteinTarget] = useState("");
  const [carbsTarget, setCarbsTarget] = useState("");
  const [fatTarget, setFatTarget] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [hasNotesPin, setHasNotesPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pinValue, setPinValue] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const [hasApiToken, setHasApiToken] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleResult, setGoogleResult] = useState<"connected" | "error" | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [pendingRestore, setPendingRestore] = useState<{ data: unknown; exportedAt: string; fileName: string } | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [restoreDone, setRestoreDone] = useState(false);

  useEffect(() => {
    load();
    loadGoogleStatus();

    const params = new URLSearchParams(window.location.search);
    const result = params.get("google_calendar");
    if (result === "connected" || result === "error") {
      setGoogleResult(result);
      params.delete("google_calendar");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
  }, []);

  async function load() {
    setLoading(true);
    try {
      const s = await api.getSettings();
      setCalorieTarget(s.calorie_target != null ? String(s.calorie_target) : "");
      setProteinTarget(s.protein_target_g != null ? String(s.protein_target_g) : "");
      setCarbsTarget(s.carbs_target_g != null ? String(s.carbs_target_g) : "");
      setFatTarget(s.fat_target_g != null ? String(s.fat_target_g) : "");
      setGoalWeight(s.goal_weight_lbs != null ? String(s.goal_weight_lbs) : "");
      setHasNotesPin(s.has_notes_pin);
      setHasApiToken(s.has_api_token);
      setTheme(s.theme);
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleStatus() {
    const s = await api.getGoogleCalendarStatus();
    setGoogleConnected(s.connected);
    setGoogleConfigured(s.configured);
  }

  async function disconnectGoogle() {
    setGoogleBusy(true);
    try {
      await api.disconnectGoogleCalendar();
      setGoogleConnected(false);
      setGoogleResult(null);
    } finally {
      setGoogleBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        calorie_target: calorieTarget ? Number(calorieTarget) : null,
        protein_target_g: proteinTarget ? Number(proteinTarget) : null,
        carbs_target_g: carbsTarget ? Number(carbsTarget) : null,
        fat_target_g: fatTarget ? Number(fatTarget) : null,
        goal_weight_lbs: goalWeight ? Number(goalWeight) : null,
        theme,
      });
      setCalorieTarget(updated.calorie_target != null ? String(updated.calorie_target) : "");
      setProteinTarget(updated.protein_target_g != null ? String(updated.protein_target_g) : "");
      setCarbsTarget(updated.carbs_target_g != null ? String(updated.carbs_target_g) : "");
      setFatTarget(updated.fat_target_g != null ? String(updated.fat_target_g) : "");
      setGoalWeight(updated.goal_weight_lbs != null ? String(updated.goal_weight_lbs) : "");
      setTheme(updated.theme);
    } finally {
      setSaving(false);
    }
  }

  async function savePin(e: React.FormEvent) {
    e.preventDefault();
    setPinError("");
    if (hasNotesPin && !/^\d{4}$/.test(currentPin)) {
      setPinError("Enter your current PIN");
      return;
    }
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError("New PIN must be exactly 4 digits");
      return;
    }
    if (pinValue !== pinConfirm) {
      setPinError("New PINs don't match");
      return;
    }
    setPinSaving(true);
    try {
      const updated = await api.setNotesPin(pinValue, hasNotesPin ? currentPin : undefined);
      setHasNotesPin(updated.has_notes_pin);
      setCurrentPin("");
      setPinValue("");
      setPinConfirm("");
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Failed to save PIN");
    } finally {
      setPinSaving(false);
    }
  }

  async function clearPin() {
    setPinError("");
    if (!/^\d{4}$/.test(currentPin)) {
      setPinError("Enter your current PIN to clear it");
      return;
    }
    setPinSaving(true);
    try {
      const updated = await api.clearNotesPin(currentPin);
      setHasNotesPin(updated.has_notes_pin);
      setCurrentPin("");
      sessionStorage.removeItem(NOTES_UNLOCK_KEY);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Failed to clear PIN");
    } finally {
      setPinSaving(false);
    }
  }

  async function generateToken() {
    setTokenBusy(true);
    setTokenCopied(false);
    try {
      const { token } = await api.generateApiToken();
      setNewToken(token);
      setHasApiToken(true);
    } finally {
      setTokenBusy(false);
    }
  }

  async function revokeToken() {
    setTokenBusy(true);
    try {
      await api.revokeApiToken();
      setHasApiToken(false);
      setNewToken(null);
    } finally {
      setTokenBusy(false);
    }
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setTokenCopied(true);
  }

  async function downloadBackup() {
    setExportError("");
    setExporting(true);
    try {
      await api.downloadBackup();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Backup download failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleBackupFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again after a cancel
    if (!file) return;
    setRestoreError("");
    setRestoreDone(false);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data !== "object" || data === null || typeof data.exported_at !== "string") {
        throw new Error("Doesn't look like an Anchor backup file");
      }
      setPendingRestore({ data, exportedAt: data.exported_at, fileName: file.name });
      setRestoreConfirmText("");
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Couldn't read that file");
    }
  }

  async function confirmRestore() {
    if (!pendingRestore || restoreConfirmText !== "RESTORE") return;
    setRestoring(true);
    setRestoreError("");
    try {
      await api.restoreBackup(pendingRestore.data);
      setPendingRestore(null);
      setRestoreConfirmText("");
      setRestoreDone(true);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Restore failed — your data was not changed");
    } finally {
      setRestoring(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1>Settings</h1>
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <h1>Settings</h1>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="calorie-target">Daily calorie target</label>
          <input
            id="calorie-target"
            type="number"
            value={calorieTarget}
            onChange={(e) => setCalorieTarget(e.target.value)}
            placeholder="e.g. 2200"
          />
        </div>
        <div className="field">
          <label htmlFor="protein-target">Protein target (g)</label>
          <input
            id="protein-target"
            type="number"
            value={proteinTarget}
            onChange={(e) => setProteinTarget(e.target.value)}
            placeholder="e.g. 150"
          />
        </div>
        <div className="field">
          <label htmlFor="carbs-target">Carbs target (g)</label>
          <input
            id="carbs-target"
            type="number"
            value={carbsTarget}
            onChange={(e) => setCarbsTarget(e.target.value)}
            placeholder="e.g. 220"
          />
        </div>
        <div className="field">
          <label htmlFor="fat-target">Fat target (g)</label>
          <input
            id="fat-target"
            type="number"
            value={fatTarget}
            onChange={(e) => setFatTarget(e.target.value)}
            placeholder="e.g. 70"
          />
        </div>
        <div className="field">
          <label htmlFor="goal-weight">Goal weight (lb)</label>
          <input
            id="goal-weight"
            type="number"
            step="0.1"
            value={goalWeight}
            onChange={(e) => setGoalWeight(e.target.value)}
            placeholder="e.g. 180"
          />
        </div>
        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select id="theme" value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <h2 style={{ marginTop: 24 }}>Notes PIN</h2>
      <form className="card" onSubmit={savePin}>
        {hasNotesPin && (
          <div className="field">
            <label htmlFor="notes-pin-current">Current PIN</label>
            <input
              id="notes-pin-current"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="notes-pin">{hasNotesPin ? "New PIN" : "Set a 4-digit PIN"}</label>
          <input
            id="notes-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinValue}
            onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
        </div>
        <div className="field">
          <label htmlFor="notes-pin-confirm">Confirm {hasNotesPin ? "New " : ""}PIN</label>
          <input
            id="notes-pin-confirm"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
          />
        </div>
        {pinError && (
          <div className="text-danger" style={{ fontSize: 13, marginBottom: 10 }}>
            {pinError}
          </div>
        )}
        <div className="form-actions">
          {hasNotesPin && (
            <button type="button" className="btn text-danger" onClick={clearPin} disabled={pinSaving}>
              Clear PIN
            </button>
          )}
          <button className="btn btn-primary" type="submit" disabled={pinSaving}>
            {pinSaving ? "Saving…" : hasNotesPin ? "Change PIN" : "Set PIN"}
          </button>
        </div>
      </form>

      <h2 style={{ marginTop: 24 }}>API Token</h2>
      <div className="card">
        <div className="text-dim" style={{ fontSize: 13, marginBottom: 12 }}>
          Lets an iOS Shortcut (or other script) start a workout routine without logging
          in through the browser. Anyone with this token can act as you through the API —
          treat it like a password.
        </div>
        {newToken ? (
          <>
            <div className="text-danger" style={{ fontSize: 13, marginBottom: 8 }}>
              Copy this now — it won't be shown again.
            </div>
            <div className="field">
              <input type="text" readOnly value={newToken} onFocus={(e) => e.target.select()} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setNewToken(null)}>
                Done
              </button>
              <button type="button" className="btn btn-primary" onClick={copyToken}>
                {tokenCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </>
        ) : (
          <div className="form-actions">
            {hasApiToken && (
              <button type="button" className="btn text-danger" onClick={revokeToken} disabled={tokenBusy}>
                Revoke token
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={generateToken} disabled={tokenBusy}>
              {tokenBusy ? "Working…" : hasApiToken ? "Regenerate token" : "Generate token"}
            </button>
          </div>
        )}
      </div>

      <h2 style={{ marginTop: 24 }}>Google Calendar</h2>
      <div className="card">
        {googleResult === "connected" && (
          <div className="text-dim" style={{ fontSize: 13, marginBottom: 12 }}>
            Connected — your Google Calendar events now show up alongside Anchor's on the Calendar page.
          </div>
        )}
        {googleResult === "error" && (
          <div className="text-danger" style={{ fontSize: 13, marginBottom: 12 }}>
            Couldn't connect — try again from the button below.
          </div>
        )}
        {!googleConfigured ? (
          <div className="text-dim" style={{ fontSize: 13 }}>Google Calendar isn't configured on this server yet.</div>
        ) : googleConnected ? (
          <div className="form-actions">
            <span className="chip chip-accent">Connected</span>
            <button type="button" className="btn text-danger" onClick={disconnectGoogle} disabled={googleBusy}>
              {googleBusy ? "Working…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="form-actions">
            <a className="btn btn-primary" href="/api/calendar/google/connect">
              Connect Google Calendar
            </a>
          </div>
        )}
      </div>

      <h2 style={{ marginTop: 24 }}>Data Backup</h2>
      <div className="card">
        <div className="text-dim" style={{ fontSize: 13, marginBottom: 12 }}>
          Downloads everything — notes, todos, bills, workouts, meals, all of it — as one
          file you can keep somewhere offsite. Locked notes are only included in full if
          you've unlocked them in this browser session first; otherwise their content is
          left out, same as anywhere else in the app.
        </div>
        <div className="form-actions" style={{ marginBottom: exportError ? 8 : 0 }}>
          <button type="button" className="btn btn-primary" onClick={downloadBackup} disabled={exporting}>
            {exporting ? "Preparing…" : "Download backup"}
          </button>
        </div>
        {exportError && (
          <div className="text-danger" style={{ fontSize: 13 }}>
            {exportError}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", marginTop: 16, paddingTop: 16 }}>
          <div className="text-danger" style={{ fontSize: 13, marginBottom: 12 }}>
            Restoring replaces ALL of your current data with the contents of the backup
            file — this can't be undone. Only use this to recover from real data loss.
          </div>
          {!pendingRestore ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="restore-file">Choose a backup file</label>
              <input id="restore-file" type="file" accept="application/json" onChange={handleBackupFileChosen} />
            </div>
          ) : (
            <div className="card" style={{ background: "var(--bg-card)" }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>{pendingRestore.fileName}</strong>
                <div className="text-dim" style={{ marginTop: 2 }}>
                  Exported {new Date(pendingRestore.exportedAt).toLocaleString()}
                </div>
              </div>
              <div className="field">
                <label htmlFor="restore-confirm">Type RESTORE to confirm replacing all your data</label>
                <input
                  id="restore-confirm"
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="RESTORE"
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setPendingRestore(null)} disabled={restoring}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={confirmRestore}
                  disabled={restoring || restoreConfirmText !== "RESTORE"}
                >
                  {restoring ? "Restoring…" : "Restore and replace my data"}
                </button>
              </div>
            </div>
          )}
          {restoreError && (
            <div className="text-danger" style={{ fontSize: 13, marginTop: 8 }}>
              {restoreError}
            </div>
          )}
          {restoreDone && (
            <div className="text-dim" style={{ fontSize: 13, marginTop: 8 }}>
              Restore complete — your data has been replaced with the backup.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
