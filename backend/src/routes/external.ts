import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { db } from "../db";
import { resolveUserByApiToken } from "../auth/apiToken";

export const externalRouter = Router();

// This whole router sits outside currentUser (mounted before it in index.ts, and outside
// Authentik entirely at the Traefik layer — see Home-Wiki's coolify-apps.yml) since its
// callers (an iOS Shortcut) can't carry a browser SSO session. Resolves req.uid from a
// personal API token instead, generated in Settings.
function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const auth = req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Missing Authorization: Bearer <token> header" });
    return;
  }
  const uid = resolveUserByApiToken(token);
  if (!uid) {
    res.status(401).json({ error: "Invalid API token" });
    return;
  }
  req.uid = uid;
  next();
}

externalRouter.use(requireApiToken);

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

// Routine templates don't carry an exercise_type column (that's a per-logged-exercise
// concept) — inferred here from the name instead, same heuristic the frontend's exercise
// combobox uses to auto-select cardio when typing a known cardio exercise name.
const CARDIO_EXERCISE_NAMES = new Set(["treadmill", "walking"]);

function suggestedActivity(exerciseNames: string[]): "strength" | "cardio" {
  if (exerciseNames.length === 0) return "strength";
  return exerciseNames.every((n) => CARDIO_EXERCISE_NAMES.has(n.trim().toLowerCase())) ? "cardio" : "strength";
}

// GET /api/external/routines — routine names plus a suggested Watch activity type, so a
// Shortcut can start the right kind of workout session without hardcoding per-routine
// logic that would go stale the moment a routine's exercises change.
externalRouter.get("/routines", (req, res) => {
  const routines = db
    .query<RoutineRow, [string]>("SELECT * FROM workout_routines WHERE user_id = ? ORDER BY name ASC")
    .all(req.uid);
  const exercises = db
    .query<RoutineExerciseRow, [string]>("SELECT * FROM workout_routine_exercises WHERE user_id = ?")
    .all(req.uid);
  res.json(
    routines.map((r) => ({
      id: r.id,
      name: r.name,
      exercise_count: exercises.filter((ex) => ex.routine_id === r.id).length,
      suggested_activity: suggestedActivity(exercises.filter((ex) => ex.routine_id === r.id).map((ex) => ex.name)),
    }))
  );
});

// POST /api/external/routines/:id/start — server-side equivalent of the frontend's
// startFromRoutine: creates a workout + exercises + prefilled sets in one call, so a
// Shortcut doesn't need to make N+1 requests itself. workout_date must be supplied by
// the caller (the phone's own local date) rather than guessed from the server's clock —
// same local-calendar-day convention the rest of the workout data uses.
externalRouter.post("/routines/:id/start", (req, res) => {
  const routine = db
    .query<RoutineRow, [string, string]>("SELECT * FROM workout_routines WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!routine) {
    res.status(404).json({ error: "routine not found" });
    return;
  }
  const { workout_date } = req.body ?? {};
  if (typeof workout_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(workout_date)) {
    res.status(400).json({ error: "workout_date is required as YYYY-MM-DD" });
    return;
  }

  const workoutId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.query("INSERT INTO workouts (id, user_id, workout_date, name, notes, created_at) VALUES (?, ?, ?, ?, '', ?)").run(
    workoutId,
    req.uid,
    workout_date,
    routine.name,
    createdAt
  );

  const templateExercises = db
    .query<RoutineExerciseRow, [string]>("SELECT * FROM workout_routine_exercises WHERE routine_id = ? ORDER BY sort_order ASC")
    .all(req.params.id);

  for (const tmpl of templateExercises) {
    const exerciseId = crypto.randomUUID();
    const exerciseType = CARDIO_EXERCISE_NAMES.has(tmpl.name.trim().toLowerCase()) ? "cardio" : "strength";
    db.query(
      "INSERT INTO workout_exercises (id, user_id, workout_id, name, exercise_type, notes, sort_order) VALUES (?, ?, ?, ?, ?, '', ?)"
    ).run(exerciseId, req.uid, workoutId, tmpl.name, exerciseType, tmpl.sort_order);
    const setCount = tmpl.sets && tmpl.sets > 0 ? tmpl.sets : 1;
    for (let i = 0; i < setCount; i++) {
      db.query(
        "INSERT INTO workout_sets (id, user_id, exercise_id, set_index, weight, reps, completed) VALUES (?, ?, ?, ?, ?, ?, 0)"
      ).run(crypto.randomUUID(), req.uid, exerciseId, i, tmpl.weight, tmpl.reps);
    }
  }

  res.status(201).json({
    workout_id: workoutId,
    suggested_activity: suggestedActivity(templateExercises.map((e) => e.name)),
  });
});
