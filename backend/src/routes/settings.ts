import { Router } from "express";
import { db } from "../db";
import { hashPin } from "../auth/notesPin";

export const settingsRouter = Router();

interface SettingsRow {
  user_id: string;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  goal_weight_lbs: number | null;
  notes_pin_hash: string | null;
  theme: "dark" | "light";
}

const DEFAULT_SETTINGS = {
  calorie_target: null as number | null,
  protein_target_g: null as number | null,
  carbs_target_g: null as number | null,
  fat_target_g: null as number | null,
  goal_weight_lbs: null as number | null,
  has_notes_pin: false,
  theme: "dark" as "dark" | "light",
};

function serialize(row: SettingsRow) {
  return {
    calorie_target: row.calorie_target,
    protein_target_g: row.protein_target_g,
    carbs_target_g: row.carbs_target_g,
    fat_target_g: row.fat_target_g,
    goal_weight_lbs: row.goal_weight_lbs,
    has_notes_pin: row.notes_pin_hash !== null,
    theme: row.theme,
  };
}

settingsRouter.get("/", (req, res) => {
  const row = db.query<SettingsRow, [string]>("SELECT * FROM user_settings WHERE user_id = ?").get(req.uid);
  if (!row) {
    res.json(DEFAULT_SETTINGS);
    return;
  }
  res.json(serialize(row));
});

settingsRouter.patch("/", (req, res) => {
  const existing = db.query<SettingsRow, [string]>("SELECT * FROM user_settings WHERE user_id = ?").get(req.uid);
  const base = existing ? serialize(existing) : DEFAULT_SETTINGS;
  const { calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal_weight_lbs, theme } = req.body ?? {};

  const next = {
    calorie_target: calorie_target === undefined ? base.calorie_target : calorie_target,
    protein_target_g: protein_target_g === undefined ? base.protein_target_g : protein_target_g,
    carbs_target_g: carbs_target_g === undefined ? base.carbs_target_g : carbs_target_g,
    fat_target_g: fat_target_g === undefined ? base.fat_target_g : fat_target_g,
    goal_weight_lbs: goal_weight_lbs === undefined ? base.goal_weight_lbs : goal_weight_lbs,
    theme: theme === "light" || theme === "dark" ? theme : base.theme,
  };

  db.query(
    `INSERT INTO user_settings (user_id, calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal_weight_lbs, theme)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       calorie_target = excluded.calorie_target,
       protein_target_g = excluded.protein_target_g,
       carbs_target_g = excluded.carbs_target_g,
       fat_target_g = excluded.fat_target_g,
       goal_weight_lbs = excluded.goal_weight_lbs,
       theme = excluded.theme`
  ).run(req.uid, next.calorie_target, next.protein_target_g, next.carbs_target_g, next.fat_target_g, next.goal_weight_lbs, next.theme);

  res.json({ ...next, has_notes_pin: base.has_notes_pin });
});

// Set or change the notes PIN — a plain 4-digit code, stored only as a hash. Upserts the
// user_settings row since a brand-new user may not have one yet (same pattern as the
// main PATCH above).
settingsRouter.post("/notes-pin", (req, res) => {
  const { pin } = req.body ?? {};
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "pin must be exactly 4 digits" });
    return;
  }
  db.query(
    `INSERT INTO user_settings (user_id, notes_pin_hash) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET notes_pin_hash = excluded.notes_pin_hash`
  ).run(req.uid, hashPin(pin));
  res.json({ has_notes_pin: true });
});

// Clearing the PIN also unlocks every note — otherwise they'd be permanently stuck
// behind a PIN that no longer exists to unlock them with.
settingsRouter.delete("/notes-pin", (req, res) => {
  db.query("UPDATE user_settings SET notes_pin_hash = NULL WHERE user_id = ?").run(req.uid);
  db.query("UPDATE notes SET locked = 0 WHERE user_id = ?").run(req.uid);
  res.json({ has_notes_pin: false });
});
