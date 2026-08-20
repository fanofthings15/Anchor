import { Router } from "express";
import { db } from "../db";
import { hashPin } from "../auth/notesPin";
import { generateApiToken, hashApiToken } from "../auth/apiToken";

export const settingsRouter = Router();

interface SettingsRow {
  user_id: string;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  goal_weight_lbs: number | null;
  notes_pin_hash: string | null;
  api_token_hash: string | null;
  theme: "dark" | "light";
}

const DEFAULT_SETTINGS = {
  calorie_target: null as number | null,
  protein_target_g: null as number | null,
  carbs_target_g: null as number | null,
  fat_target_g: null as number | null,
  goal_weight_lbs: null as number | null,
  has_notes_pin: false,
  has_api_token: false,
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
    has_api_token: row.api_token_hash !== null,
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

  res.json({ ...next, has_notes_pin: base.has_notes_pin, has_api_token: base.has_api_token });
});

// Generates (or regenerates) a personal API token for programmatic access — e.g. an iOS
// Shortcut that can't carry a browser SSO session. Only the hash is ever stored; the raw
// token is returned exactly once here and can't be recovered later, only replaced.
settingsRouter.post("/api-token", (req, res) => {
  const token = generateApiToken();
  db.query(
    `INSERT INTO user_settings (user_id, api_token_hash, api_token_created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET api_token_hash = excluded.api_token_hash, api_token_created_at = excluded.api_token_created_at`
  ).run(req.uid, hashApiToken(token), new Date().toISOString());
  res.json({ token });
});

settingsRouter.delete("/api-token", (req, res) => {
  db.query("UPDATE user_settings SET api_token_hash = NULL, api_token_created_at = NULL WHERE user_id = ?").run(req.uid);
  res.json({ has_api_token: false });
});

// Set or change the notes PIN — a plain 4-digit code, stored only as a hash. Changing an
// existing PIN requires the current one (otherwise anyone with the phone unlocked to the
// Settings page — exactly who the PIN is meant to keep out — could just set a new one
// and read every locked note). Setting one for the first time needs no current_pin.
settingsRouter.post("/notes-pin", (req, res) => {
  const { pin, current_pin } = req.body ?? {};
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "pin must be exactly 4 digits" });
    return;
  }
  const existing = db
    .query<{ notes_pin_hash: string | null }, [string]>("SELECT notes_pin_hash FROM user_settings WHERE user_id = ?")
    .get(req.uid);
  if (existing?.notes_pin_hash) {
    if (typeof current_pin !== "string" || hashPin(current_pin) !== existing.notes_pin_hash) {
      res.status(401).json({ error: "current PIN is incorrect" });
      return;
    }
  }
  db.query(
    `INSERT INTO user_settings (user_id, notes_pin_hash) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET notes_pin_hash = excluded.notes_pin_hash`
  ).run(req.uid, hashPin(pin));
  res.json({ has_notes_pin: true });
});

// Clearing the PIN also unlocks every note — otherwise they'd be permanently stuck
// behind a PIN that no longer exists to unlock them with. Requires the current PIN for
// the same reason changing it does: without that, the PIN protects nothing, since anyone
// with the phone open to Settings could just clear it and read every locked note.
settingsRouter.delete("/notes-pin", (req, res) => {
  const { current_pin } = req.body ?? {};
  const existing = db
    .query<{ notes_pin_hash: string | null }, [string]>("SELECT notes_pin_hash FROM user_settings WHERE user_id = ?")
    .get(req.uid);
  if (existing?.notes_pin_hash) {
    if (typeof current_pin !== "string" || hashPin(current_pin) !== existing.notes_pin_hash) {
      res.status(401).json({ error: "current PIN is incorrect" });
      return;
    }
  }
  db.query("UPDATE user_settings SET notes_pin_hash = NULL WHERE user_id = ?").run(req.uid);
  db.query("UPDATE notes SET locked = 0 WHERE user_id = ?").run(req.uid);
  res.json({ has_notes_pin: false });
});
