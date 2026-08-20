import { Router } from "express";
import { db } from "../db";

export const mealsRouter = Router();

interface MealRow {
  id: string;
  user_id: string;
  meal_date: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string;
  created_at: string;
}

function serialize(row: MealRow) {
  return {
    id: row.id,
    meal_date: row.meal_date,
    name: row.name,
    calories: row.calories,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    notes: row.notes,
    created_at: row.created_at,
  };
}

interface SavedFoodRow {
  id: string;
  user_id: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
}

function serializeSavedFood(row: SavedFoodRow) {
  return {
    id: row.id,
    name: row.name,
    calories: row.calories,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    created_at: row.created_at,
  };
}

// GET /api/meals/dates — every distinct day the user has logged a meal, for a food streak
// (computed client-side against local "today", same reasoning as workout streaks — see
// calendarUtils.ts). Deliberately returns just dates, not full meal rows, since a streak
// only needs to know which days happened, however large the real history gets.
mealsRouter.get("/dates", (req, res) => {
  const rows = db
    .query<{ meal_date: string }, [string]>("SELECT DISTINCT meal_date FROM meals WHERE user_id = ?")
    .all(req.uid);
  res.json(rows.map((r) => r.meal_date));
});

// GET /api/meals/saved — the user's saved/frequent foods, for one-tap re-logging.
// Registered before the "/:id"-shaped routes below would exist... there are none here,
// but kept grouped at the top for clarity.
mealsRouter.get("/saved", (req, res) => {
  const rows = db
    .query<SavedFoodRow, [string]>("SELECT * FROM saved_foods WHERE user_id = ? ORDER BY name ASC")
    .all(req.uid);
  res.json(rows.map(serializeSavedFood));
});

mealsRouter.post("/saved", (req, res) => {
  const { name, calories = null, protein_g = null, carbs_g = null, fat_g = null } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.query(
    "INSERT INTO saved_foods (id, user_id, name, calories, protein_g, carbs_g, fat_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    name.trim(),
    typeof calories === "number" ? calories : null,
    typeof protein_g === "number" ? protein_g : null,
    typeof carbs_g === "number" ? carbs_g : null,
    typeof fat_g === "number" ? fat_g : null,
    created_at
  );
  const row = db.query<SavedFoodRow, [string]>("SELECT * FROM saved_foods WHERE id = ?").get(id)!;
  res.status(201).json(serializeSavedFood(row));
});

mealsRouter.delete("/saved/:id", (req, res) => {
  db.query("DELETE FROM saved_foods WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

mealsRouter.get("/", (req, res) => {
  const { from, to } = req.query;
  if (typeof from !== "string" || !from || typeof to !== "string" || !to) {
    res.status(400).json({ error: "from and to query params are required" });
    return;
  }
  const rows = db
    .query<MealRow, [string, string, string]>(
      "SELECT * FROM meals WHERE user_id = ? AND meal_date >= ? AND meal_date <= ? ORDER BY meal_date DESC, created_at DESC"
    )
    .all(req.uid, from, to);
  res.json(rows.map(serialize));
});

mealsRouter.post("/", (req, res) => {
  const { meal_date, name, calories = null, protein_g = null, carbs_g = null, fat_g = null, notes = "" } = req.body ?? {};
  if (typeof meal_date !== "string" || !meal_date.trim()) {
    res.status(400).json({ error: "meal_date is required" });
    return;
  }
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.query(
    "INSERT INTO meals (id, user_id, meal_date, name, calories, protein_g, carbs_g, fat_g, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    meal_date,
    name.trim(),
    typeof calories === "number" ? calories : null,
    typeof protein_g === "number" ? protein_g : null,
    typeof carbs_g === "number" ? carbs_g : null,
    typeof fat_g === "number" ? fat_g : null,
    typeof notes === "string" ? notes : "",
    created_at
  );
  const row = db.query<MealRow, [string]>("SELECT * FROM meals WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row));
});

mealsRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM meals WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
