import { Router } from "express";
import { db } from "../db";

export const settingsRouter = Router();

interface SettingsRow {
  user_id: string;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  theme: "dark" | "light";
}

const DEFAULT_SETTINGS = {
  calorie_target: null as number | null,
  protein_target_g: null as number | null,
  carbs_target_g: null as number | null,
  fat_target_g: null as number | null,
  theme: "dark" as "dark" | "light",
};

function serialize(row: SettingsRow) {
  return {
    calorie_target: row.calorie_target,
    protein_target_g: row.protein_target_g,
    carbs_target_g: row.carbs_target_g,
    fat_target_g: row.fat_target_g,
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
  const { calorie_target, protein_target_g, carbs_target_g, fat_target_g, theme } = req.body ?? {};

  const next = {
    calorie_target: calorie_target === undefined ? base.calorie_target : calorie_target,
    protein_target_g: protein_target_g === undefined ? base.protein_target_g : protein_target_g,
    carbs_target_g: carbs_target_g === undefined ? base.carbs_target_g : carbs_target_g,
    fat_target_g: fat_target_g === undefined ? base.fat_target_g : fat_target_g,
    theme: theme === "light" || theme === "dark" ? theme : base.theme,
  };

  db.query(
    `INSERT INTO user_settings (user_id, calorie_target, protein_target_g, carbs_target_g, fat_target_g, theme)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       calorie_target = excluded.calorie_target,
       protein_target_g = excluded.protein_target_g,
       carbs_target_g = excluded.carbs_target_g,
       fat_target_g = excluded.fat_target_g,
       theme = excluded.theme`
  ).run(req.uid, next.calorie_target, next.protein_target_g, next.carbs_target_g, next.fat_target_g, next.theme);

  res.json(next);
});
