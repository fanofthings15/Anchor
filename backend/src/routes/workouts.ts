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
  exercise_type: string;
  notes: string;
  sort_order: number;
}

interface WorkoutSetRow {
  id: string;
  user_id: string;
  exercise_id: string;
  set_index: number;
  weight: number | null;
  reps: number | null;
  distance_miles: number | null;
  duration_seconds: number | null;
  completed: number;
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
    exercise_type: row.exercise_type,
    notes: row.notes,
    sort_order: row.sort_order,
  };
}

function serializeSet(row: WorkoutSetRow) {
  return {
    id: row.id,
    exercise_id: row.exercise_id,
    set_index: row.set_index,
    weight: row.weight,
    reps: row.reps,
    distance_miles: row.distance_miles,
    duration_seconds: row.duration_seconds,
    completed: row.completed === 1,
  };
}

// Per-set logging (Hevy-style: Set / Previous / Lbs / Reps / done-checkbox rows) means
// every screen that needs a workout also needs its exercises' actual sets, so all three
// are fetched together here rather than requiring a separate round-trip per exercise.
workoutsRouter.get("/", (req, res) => {
  const workouts = db
    .query<WorkoutRow, [string]>("SELECT * FROM workouts WHERE user_id = ? ORDER BY workout_date DESC, created_at DESC")
    .all(req.uid);
  const exercises = db
    .query<WorkoutExerciseRow, [string]>(
      "SELECT id, user_id, workout_id, name, exercise_type, notes, sort_order FROM workout_exercises WHERE user_id = ? ORDER BY sort_order ASC"
    )
    .all(req.uid);
  const sets = db
    .query<WorkoutSetRow, [string]>("SELECT * FROM workout_sets WHERE user_id = ? ORDER BY set_index ASC")
    .all(req.uid);
  res.json({
    workouts: workouts.map(serializeWorkout),
    exercises: exercises.map(serializeExercise),
    sets: sets.map(serializeSet),
  });
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

workoutsRouter.patch("/:id", (req, res) => {
  const existing = db
    .query<WorkoutRow, [string, string]>("SELECT * FROM workouts WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { name, notes } = req.body ?? {};
  const next = {
    name: typeof name === "string" ? name : existing.name,
    notes: typeof notes === "string" ? notes : existing.notes,
  };
  db.query("UPDATE workouts SET name = ?, notes = ? WHERE id = ? AND user_id = ?").run(
    next.name,
    next.notes,
    req.params.id,
    req.uid
  );
  res.json(serializeWorkout({ ...existing, ...next }));
});

workoutsRouter.delete("/:id", (req, res) => {
  const exerciseIds = db
    .query<{ id: string }, [string, string]>("SELECT id FROM workout_exercises WHERE workout_id = ? AND user_id = ?")
    .all(req.params.id, req.uid)
    .map((r) => r.id);
  const deleteSets = db.query("DELETE FROM workout_sets WHERE exercise_id = ? AND user_id = ?");
  for (const exerciseId of exerciseIds) deleteSets.run(exerciseId, req.uid);
  db.query("DELETE FROM workout_exercises WHERE workout_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM workouts WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// Just the exercise shell (name) — its sets are added separately below, one row per set,
// matching how the per-set UI actually builds one up (name it, then "+ Add Set" repeatedly).
workoutsRouter.post("/:workoutId/exercises", (req, res) => {
  const workout = db
    .query<WorkoutRow, [string, string]>("SELECT * FROM workouts WHERE id = ? AND user_id = ?")
    .get(req.params.workoutId, req.uid);
  if (!workout) {
    res.status(404).json({ error: "workout not found" });
    return;
  }
  const { name, notes = "", exercise_type = "strength" } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const type = exercise_type === "cardio" ? "cardio" : "strength";
  const maxOrderRow = db
    .query<{ m: number | null }, [string]>("SELECT MAX(sort_order) as m FROM workout_exercises WHERE workout_id = ?")
    .get(req.params.workoutId);
  const sort_order = (maxOrderRow?.m ?? -1) + 1;
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO workout_exercises (id, user_id, workout_id, name, exercise_type, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, req.uid, req.params.workoutId, name.trim(), type, typeof notes === "string" ? notes : "", sort_order);
  const row = db
    .query<WorkoutExerciseRow, [string]>(
      "SELECT id, user_id, workout_id, name, exercise_type, notes, sort_order FROM workout_exercises WHERE id = ?"
    )
    .get(id)!;
  res.status(201).json(serializeExercise(row));
});

workoutsRouter.delete("/exercises/:id", (req, res) => {
  db.query("DELETE FROM workout_sets WHERE exercise_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM workout_exercises WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// POST /api/workouts/exercises/:exerciseId/sets — append a set (weight/reps come from
// the client, which prefills them from the previous set for a fast "+ Add Set" flow).
workoutsRouter.post("/exercises/:exerciseId/sets", (req, res) => {
  const exercise = db
    .query<WorkoutExerciseRow, [string, string]>("SELECT * FROM workout_exercises WHERE id = ? AND user_id = ?")
    .get(req.params.exerciseId, req.uid);
  if (!exercise) {
    res.status(404).json({ error: "exercise not found" });
    return;
  }
  const { weight = null, reps = null, distance_miles = null, duration_seconds = null, completed = false } = req.body ?? {};
  const maxOrderRow = db
    .query<{ m: number | null }, [string]>("SELECT MAX(set_index) as m FROM workout_sets WHERE exercise_id = ?")
    .get(req.params.exerciseId);
  const set_index = (maxOrderRow?.m ?? -1) + 1;
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO workout_sets (id, user_id, exercise_id, set_index, weight, reps, distance_miles, duration_seconds, completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    req.params.exerciseId,
    set_index,
    typeof weight === "number" ? weight : null,
    typeof reps === "number" ? reps : null,
    typeof distance_miles === "number" ? distance_miles : null,
    typeof duration_seconds === "number" ? duration_seconds : null,
    completed ? 1 : 0
  );
  const row = db.query<WorkoutSetRow, [string]>("SELECT * FROM workout_sets WHERE id = ?").get(id)!;
  res.status(201).json(serializeSet(row));
});

workoutsRouter.patch("/sets/:id", (req, res) => {
  const existing = db
    .query<WorkoutSetRow, [string, string]>("SELECT * FROM workout_sets WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { weight, reps, distance_miles, duration_seconds, completed } = req.body ?? {};
  const next = {
    weight: weight === undefined ? existing.weight : typeof weight === "number" ? weight : null,
    reps: reps === undefined ? existing.reps : typeof reps === "number" ? reps : null,
    distance_miles:
      distance_miles === undefined ? existing.distance_miles : typeof distance_miles === "number" ? distance_miles : null,
    duration_seconds:
      duration_seconds === undefined
        ? existing.duration_seconds
        : typeof duration_seconds === "number"
          ? duration_seconds
          : null,
    completed: completed === undefined ? existing.completed : completed ? 1 : 0,
  };
  db.query(
    "UPDATE workout_sets SET weight = ?, reps = ?, distance_miles = ?, duration_seconds = ?, completed = ? WHERE id = ? AND user_id = ?"
  ).run(
    next.weight,
    next.reps,
    next.distance_miles,
    next.duration_seconds,
    next.completed,
    req.params.id,
    req.uid
  );
  res.json(serializeSet({ ...existing, ...next }));
});

workoutsRouter.delete("/sets/:id", (req, res) => {
  db.query("DELETE FROM workout_sets WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
