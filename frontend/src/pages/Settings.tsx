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

  useEffect(() => {
    load();
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
      setTheme(s.theme);
    } finally {
      setLoading(false);
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
    </div>
  );
}
