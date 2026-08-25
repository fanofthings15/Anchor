import { Router } from "express";
import { db } from "../db";

export const routinesRouter = Router();

interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

interface RoutineExerciseRow {
  id: string;
  user_id: string;
  routine_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  sort_order: number;
}

function serializeRoutine(row: RoutineRow) {
  return { id: row.id, name: row.name, created_at: row.created_at };
}

function serializeExercise(row: RoutineExerciseRow) {
  return {
    id: row.id,
    routine_id: row.routine_id,
    name: row.name,
    sets: row.sets,
    reps: row.reps,
    weight: row.weight,
    sort_order: row.sort_order,
  };
}

// GET /api/routines — every saved workout routine (a reusable template of exercises),
// so a new workout can be pre-filled from one instead of retyping exercises each time.
routinesRouter.get("/", (req, res) => {
  const routines = db
    .query<RoutineRow, [string]>("SELECT * FROM workout_routines WHERE user_id = ? ORDER BY name ASC")
    .all(req.uid);
  const exercises = db
    .query<RoutineExerciseRow, [string]>("SELECT * FROM workout_routine_exercises WHERE user_id = ? ORDER BY sort_order ASC")
    .all(req.uid);
  res.json({ routines: routines.map(serializeRoutine), exercises: exercises.map(serializeExercise) });
});

routinesRouter.post("/", (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.query("INSERT INTO workout_routines (id, user_id, name, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    req.uid,
    name.trim(),
    created_at
  );
  const row = db.query<RoutineRow, [string]>("SELECT * FROM workout_routines WHERE id = ?").get(id)!;
  res.status(201).json(serializeRoutine(row));
});

routinesRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM workout_routine_exercises WHERE routine_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM workout_routines WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

routinesRouter.post("/:routineId/exercises", (req, res) => {
  const routine = db
    .query<RoutineRow, [string, string]>("SELECT * FROM workout_routines WHERE id = ? AND user_id = ?")
    .get(req.params.routineId, req.uid);
  if (!routine) {
    res.status(404).json({ error: "routine not found" });
    return;
  }
  const { name, sets = null, reps = null, weight = null } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const maxOrderRow = db
    .query<{ m: number | null }, [string]>("SELECT MAX(sort_order) as m FROM workout_routine_exercises WHERE routine_id = ?")
    .get(req.params.routineId);
  const sort_order = (maxOrderRow?.m ?? -1) + 1;
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO workout_routine_exercises (id, user_id, routine_id, name, sets, reps, weight, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    req.uid,
    req.params.routineId,
    name.trim(),
    typeof sets === "number" ? sets : null,
    typeof reps === "number" ? reps : null,
    typeof weight === "number" ? weight : null,
    sort_order
  );
  const row = db.query<RoutineExerciseRow, [string]>("SELECT * FROM workout_routine_exercises WHERE id = ?").get(id)!;
  res.status(201).json(serializeExercise(row));
});

// PATCH /api/routines/:routineId/exercises/reorder — persist a new exercise order
// within one routine template (drag-and-drop).
routinesRouter.patch("/:routineId/exercises/reorder", (req, res) => {
  const { ordered_ids } = req.body ?? {};
  if (!Array.isArray(ordered_ids) || ordered_ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ordered_ids must be an array of exercise ids" });
    return;
  }
  const update = db.query(
    "UPDATE workout_routine_exercises SET sort_order = ? WHERE id = ? AND user_id = ? AND routine_id = ?"
  );
  ordered_ids.forEach((id: string, index: number) => update.run(index, id, req.uid, req.params.routineId));
  const exercises = db
    .query<RoutineExerciseRow, [string, string]>(
      "SELECT * FROM workout_routine_exercises WHERE user_id = ? AND routine_id = ? ORDER BY sort_order ASC"
    )
    .all(req.uid, req.params.routineId);
  res.json(exercises.map(serializeExercise));
});

routinesRouter.delete("/exercises/:id", (req, res) => {
  db.query("DELETE FROM workout_routine_exercises WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
