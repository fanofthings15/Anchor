import { Router } from "express";
import { db } from "../db";

export const workoutsRouter = Router();

interface WorkoutRow {
  id: string;
  user_id: string;
  workout_date: string;
  name: string;
  notes: string;
  created_at: string;
}

interface WorkoutExerciseRow {
  id: string;
  user_id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes: string;
  sort_order: number;
}

function serializeWorkout(row: WorkoutRow) {
  return {
    id: row.id,
    workout_date: row.workout_date,
    name: row.name,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function serializeExercise(row: WorkoutExerciseRow) {
  return {
    id: row.id,
    workout_id: row.workout_id,
    name: row.name,
    sets: row.sets,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    sort_order: row.sort_order,
  };
}

workoutsRouter.get("/", (req, res) => {
  const workouts = db
    .query<WorkoutRow, [string]>("SELECT * FROM workouts WHERE user_id = ? ORDER BY workout_date DESC, created_at DESC")
    .all(req.uid);
  const exercises = db
    .query<WorkoutExerciseRow, [string]>("SELECT * FROM workout_exercises WHERE user_id = ? ORDER BY sort_order ASC")
    .all(req.uid);
  res.json({ workouts: workouts.map(serializeWorkout), exercises: exercises.map(serializeExercise) });
});

workoutsRouter.post("/", (req, res) => {
  const { workout_date, name = "", notes = "" } = req.body ?? {};
  if (typeof workout_date !== "string" || !workout_date.trim()) {
    res.status(400).json({ error: "workout_date is required" });
    return;
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.query(
    "INSERT INTO workouts (id, user_id, workout_date, name, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, req.uid, workout_date, typeof name === "string" ? name : "", typeof notes === "string" ? notes : "", created_at);
  const row = db.query<WorkoutRow, [string]>("SELECT * FROM workouts WHERE id = ?").get(id)!;
  res.status(201).json(serializeWorkout(row));
});

workoutsRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM workout_exercises WHERE workout_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

workoutsRouter.post("/:workoutId/exercises", (req, res) => {
  const workout = db
    .query<WorkoutRow, [string, string]>("SELECT * FROM workouts WHERE id = ? AND user_id = ?")
    .get(req.params.workoutId, req.uid);
  if (!workout) {
    res.status(404).json({ error: "workout not found" });
    return;
  }
  const { name, sets = null, reps = null, weight = null, notes = "" } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const maxOrderRow = db
    .query<{ m: number | null }, [string]>("SELECT MAX(sort_order) as m FROM workout_exercises WHERE workout_id = ?")
    .get(req.params.workoutId);
  const sort_order = (maxOrderRow?.m ?? -1) + 1;
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO workout_exercises (id, user_id, workout_id, name, sets, reps, weight, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    req.params.workoutId,
    name.trim(),
    typeof sets === "number" ? sets : null,
    typeof reps === "number" ? reps : null,
    typeof weight === "number" ? weight : null,
    typeof notes === "string" ? notes : "",
    sort_order
  );
  const row = db.query<WorkoutExerciseRow, [string]>("SELECT * FROM workout_exercises WHERE id = ?").get(id)!;
  res.status(201).json(serializeExercise(row));
});

workoutsRouter.delete("/exercises/:id", (req, res) => {
  db.query("DELETE FROM workout_exercises WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
