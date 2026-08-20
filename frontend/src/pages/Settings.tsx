import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calorieTarget, setCalorieTarget] = useState("");
  const [proteinTarget, setProteinTarget] = useState("");
  const [carbsTarget, setCarbsTarget] = useState("");
  const [fatTarget, setFatTarget] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

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
    </div>
  );
}
