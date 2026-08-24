import type { Database } from "bun:sqlite";

function tableColumns(db: Database, name: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info(${name})`)
    .all()
    .map((c) => c.name);
}

/**
 * Schema for Anchor's multi-user data model. Every table (except none — there is no
 * shared/global data in this app) is scoped by `user_id`, resolved from Authentik's
 * `X-authentik-uid` header by `auth/currentUser.ts`. No route should ever accept a bare
 * row id without also filtering on the requesting user's id — see each routes/*.ts file.
 *
 * Fresh app, no legacy data to migrate — CREATE TABLE IF NOT EXISTS is enough for now.
 * Future schema changes should follow Anime-Recomender's pattern (rename-aside + copy
 * forward) rather than destructive ALTERs, once real user data exists to preserve.
 */
export function runMigrations(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

-- Pasted images are stored as files under APP_DIR/uploads (see paths.ts), not as BLOBs
-- here — this table just indexes them by note and carries enough metadata to serve them
-- back with the right Content-Type.
CREATE TABLE IF NOT EXISTS note_images (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_note_images_note ON note_images(note_id);

CREATE TABLE IF NOT EXISTS todo_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todo_lists_user ON todo_lists(user_id);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(list_id);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL,
  recurrence_interval_days INTEGER,
  last_completed_at TEXT,
  next_due_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user ON recurring_tasks(user_id);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id);

CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shopping_items_user ON shopping_items(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_list ON shopping_items(list_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  autopay INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  recurrence TEXT NOT NULL,
  recurrence_interval_days INTEGER,
  last_paid_at TEXT,
  next_due_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);

CREATE TABLE IF NOT EXISTS investment_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_accounts_user ON investment_accounts(user_id);

CREATE TABLE IF NOT EXISTS investment_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  balance_cents INTEGER NOT NULL,
  contribution_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_entries_user ON investment_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_investment_entries_account ON investment_entries(account_id);

CREATE TABLE IF NOT EXISTS investment_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_amount_cents INTEGER NOT NULL,
  target_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_investment_goals_user ON investment_goals(user_id);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workout_date TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);

-- sets/reps/weight here are legacy (pre-per-set-logging) — a new exercise row no longer
-- writes them; see workout_sets below, which is what the per-set UI (Hevy-style: Set /
-- Previous / Lbs / Reps / done-checkbox rows, "+ Add Set") actually reads and writes.
-- Left in place rather than dropped so old data isn't destroyed by a column removal.
CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workout_id TEXT NOT NULL,
  name TEXT NOT NULL,
  exercise_type TEXT NOT NULL DEFAULT 'strength', -- 'strength' | 'cardio'
  sets INTEGER,
  reps INTEGER,
  weight REAL,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_user ON workout_exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);

-- weight/reps are used for a 'strength' exercise's sets; distance_miles/duration_seconds
-- for a 'cardio' one (see exercise_type above) — one set row always leaves the other
-- pair null rather than this being two separate tables, since a set is still fundamentally
-- "one unit of this exercise, done, on this date" either way.
CREATE TABLE IF NOT EXISTS workout_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_index INTEGER NOT NULL DEFAULT 0,
  weight REAL,
  reps INTEGER,
  distance_miles REAL,
  duration_seconds INTEGER,
  completed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workout_sets_user ON workout_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(exercise_id);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  meal_date TEXT NOT NULL,
  name TEXT NOT NULL,
  calories INTEGER,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meals_user ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(meal_date);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  calorie_target INTEGER,
  protein_target_g REAL,
  carbs_target_g REAL,
  fat_target_g REAL,
  goal_weight_lbs REAL,
  notes_pin_hash TEXT,
  theme TEXT NOT NULL DEFAULT 'dark'
);

CREATE TABLE IF NOT EXISTS saved_foods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  calories INTEGER,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_foods_user ON saved_foods(user_id);

CREATE TABLE IF NOT EXISTS workout_routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workout_routines_user ON workout_routines(user_id);

CREATE TABLE IF NOT EXISTS workout_routine_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  routine_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight REAL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workout_routine_exercises_user ON workout_routine_exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_routine_exercises_routine ON workout_routine_exercises(routine_id);

CREATE TABLE IF NOT EXISTS weight_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  weight_lbs REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weight_entries_user ON weight_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_weight_entries_date ON weight_entries(entry_date);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  target_per_day INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);

-- log_date is a plain "YYYY-MM-DD" string, written by the client via
-- calendarUtils.ts's todayISO() — same local-date convention as
-- weight_entries.entry_date/workout_date/meal_date, so no server-side
-- timezone logic is needed. count cycles 0..target_per_day (see habits.ts).
CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(habit_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, log_date);

-- Tracks one-time data-repair passes that can't be expressed as an idempotent
-- ADD COLUMN/backfill (e.g. re-deriving values from data that's already been
-- transformed once) — run exactly once, ever, per key, rather than on every boot.
CREATE TABLE IF NOT EXISTS migration_flags (
  key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- One row per user who's connected their Google Calendar (read-only import only — this
-- app never writes back to Google). refresh_token is long-lived; access_token/expiry are
-- refreshed on demand when a request needs one and the cached one has expired.
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  user_id TEXT PRIMARY KEY,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TEXT,
  connected_at TEXT NOT NULL
);
`);

  // sort_order was added to `todos` after the initial schema (drag-to-reorder within a
  // list) — backfill it for any DB created before this column existed. No-ops on a fresh
  // install, since the CREATE TABLE above already includes the column there.
  if (!tableColumns(db, "todos").includes("sort_order")) {
    db.exec("ALTER TABLE todos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      UPDATE todos SET sort_order = (
        SELECT COUNT(*) FROM todos t2
        WHERE t2.list_id = todos.list_id AND t2.user_id = todos.user_id AND t2.created_at < todos.created_at
      )
    `);
  }

  backfillWorkoutSets(db);

  // exercise_type / distance_miles / duration_seconds were added after per-set logging
  // shipped — ADD COLUMN for any DB from before that, then reclassify + backfill cardio
  // exercises (see backfillCardioExercises below). No-ops on a fresh install, since the
  // CREATE TABLE statements above already include these columns there.
  if (!tableColumns(db, "workout_exercises").includes("exercise_type")) {
    db.exec("ALTER TABLE workout_exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'");
  }
  if (!tableColumns(db, "workout_sets").includes("distance_miles")) {
    db.exec("ALTER TABLE workout_sets ADD COLUMN distance_miles REAL");
  }
  if (!tableColumns(db, "workout_sets").includes("duration_seconds")) {
    db.exec("ALTER TABLE workout_sets ADD COLUMN duration_seconds INTEGER");
  }
  backfillCardioExercises(db);

  if (!tableColumns(db, "user_settings").includes("goal_weight_lbs")) {
    db.exec("ALTER TABLE user_settings ADD COLUMN goal_weight_lbs REAL");
  }
  if (!tableColumns(db, "user_settings").includes("notes_pin_hash")) {
    db.exec("ALTER TABLE user_settings ADD COLUMN notes_pin_hash TEXT");
  }

  // locked / sort_order were added to `notes` after the initial schema (per-note PIN
  // lock + drag-to-reorder) — backfill for any DB from before either existed. No-ops on
  // a fresh install, since the CREATE TABLE above already includes both columns there.
  if (!tableColumns(db, "notes").includes("locked")) {
    db.exec("ALTER TABLE notes ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
  }
  if (!tableColumns(db, "notes").includes("sort_order")) {
    db.exec("ALTER TABLE notes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      UPDATE notes SET sort_order = (
        SELECT COUNT(*) FROM notes n2
        WHERE n2.user_id = notes.user_id AND n2.pinned = notes.pinned AND n2.updated_at < notes.updated_at
      )
    `);
  }

  // Which of the user's Google calendars (their own + any they've subscribed to, e.g. a
  // shared calendar with friends) to pull events from — defaults to just their primary
  // calendar, since that's what the very first version of this feature always fetched.
  if (!tableColumns(db, "google_calendar_connections").includes("selected_calendar_ids")) {
    db.exec(`ALTER TABLE google_calendar_connections ADD COLUMN selected_calendar_ids TEXT NOT NULL DEFAULT '["primary"]'`);
  }

  // The first shipped version of the distance-parsing regex (`/mi/` with no boundary)
  // matched inside "min" too, so any cardio exercise logged as duration-only (e.g. "30
  // min", no "X mi" segment) got its duration value copied into distance_miles as well.
  // That's already landed in some databases via backfillCardioExercises above before this
  // fix — a real correction pass, not just a regex tweak, so it needs to run once against
  // already-cardio rows too (which the exercise_type = 'strength' guard above skips on
  // every run after the first). Gated by migration_flags so it never re-runs and clobbers
  // a distance/duration a user has since corrected by hand in the UI.
  if (!hasMigrationFlag(db, "cardio_distance_regex_fix_v1")) {
    fixCardioDistanceRegexBug(db);
    setMigrationFlag(db, "cardio_distance_regex_fix_v1");
  }
}

function hasMigrationFlag(db: Database, key: string): boolean {
  return db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM migration_flags WHERE key = ?").get(key)!.n > 0;
}

function setMigrationFlag(db: Database, key: string): void {
  db.query("INSERT OR IGNORE INTO migration_flags (key, applied_at) VALUES (?, ?)").run(key, new Date().toISOString());
}

interface LegacyCardioExerciseRow {
  id: string;
  name: string;
  exercise_type: string;
  notes: string;
}

// Cardio exercises (currently just Treadmill/Walking — the only ones this app has ever
// seen, from the workout CSV import) were logged with null weight/reps and their real
// distance/duration folded into the exercise's notes text as "X mi, Y min". Reclassifies
// them as 'cardio' and parses that text back into the new structured columns on their
// existing set row(s), rather than leaving distance/duration as free text forever.
// Future cardio exercises are typed explicitly at creation time — this is purely a
// one-time correction for data that predates exercise_type existing at all.
const CARDIO_EXERCISE_NAMES = new Set(["treadmill", "walking"]);

function backfillCardioExercises(db: Database): void {
  const candidates = db
    .query<LegacyCardioExerciseRow, []>(
      "SELECT id, name, exercise_type, notes FROM workout_exercises WHERE exercise_type = 'strength'"
    )
    .all()
    .filter((ex) => CARDIO_EXERCISE_NAMES.has(ex.name.trim().toLowerCase()));
  if (candidates.length === 0) return;

  const markCardio = db.query("UPDATE workout_exercises SET exercise_type = 'cardio' WHERE id = ?");
  const updateSet = db.query(
    "UPDATE workout_sets SET distance_miles = ?, duration_seconds = ?, weight = NULL, reps = NULL WHERE id = ?"
  );
  const setsForExercise = db.query<{ id: string }, [string]>(
    "SELECT id FROM workout_sets WHERE exercise_id = ? ORDER BY set_index ASC"
  );

  for (const ex of candidates) {
    markCardio.run(ex.id);
    const { distance, duration } = parseCardioNotes(ex.notes);
    for (const row of setsForExercise.all(ex.id)) {
      updateSet.run(distance, duration, row.id);
    }
  }
}

// "mi" must not be immediately followed by "n" — otherwise it matches inside "min" too
// (e.g. "30 min" would wrongly parse a 30-mile distance out of a duration-only entry).
function parseCardioNotes(notes: string): { distance: number | null; duration: number | null } {
  const milesMatch = notes.match(/([\d.]+)\s*mi(?!n)/);
  const minutesMatch = notes.match(/(\d+)\s*min/);
  return {
    distance: milesMatch ? parseFloat(milesMatch[1]) : null,
    duration: minutesMatch ? parseInt(minutesMatch[1], 10) * 60 : null,
  };
}

// One-time repair for data already corrupted by the pre-fix regex above (see the
// migration_flags gate in runMigrations) — re-derives distance/duration for every cardio
// exercise still carrying its original import notes, regardless of current exercise_type,
// since backfillCardioExercises already reclassified everything to 'cardio' by the time
// this runs.
function fixCardioDistanceRegexBug(db: Database): void {
  const candidates = db
    .query<LegacyCardioExerciseRow, []>(
      "SELECT id, name, exercise_type, notes FROM workout_exercises WHERE exercise_type = 'cardio' AND notes LIKE 'Imported from workout export%'"
    )
    .all();
  if (candidates.length === 0) return;

  const updateSet = db.query("UPDATE workout_sets SET distance_miles = ?, duration_seconds = ? WHERE id = ?");
  const setsForExercise = db.query<{ id: string }, [string]>("SELECT id FROM workout_sets WHERE exercise_id = ?");

  for (const ex of candidates) {
    const { distance, duration } = parseCardioNotes(ex.notes);
    for (const row of setsForExercise.all(ex.id)) {
      updateSet.run(distance, duration, row.id);
    }
  }
}

interface LegacyExerciseRow {
  id: string;
  user_id: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes: string;
}

// The import script that first populated real workout history recorded each set's exact
// weight/reps in the exercise's notes as "Sets: 80x8, 90x7" (or "Sets: 15, 15" for
// reps-only, bodyweight-style exercises) precisely so this migration could reconstruct
// real per-set rows instead of just duplicating one aggregate value. Falls back to
// duplicating weight/reps across `sets` count rows when notes don't match that shape —
// still correct in aggregate, just without the set-to-set variation.
function parseSetsFromNotes(notes: string, count: number): { weight: number | null; reps: number | null }[] | null {
  const match = notes.match(/Sets: ([^;]+)/);
  if (!match) return null;
  const parts = match[1].split(",").map((s) => s.trim());
  if (parts.length !== count) return null;
  const result: { weight: number | null; reps: number | null }[] = [];
  for (const p of parts) {
    const withWeight = p.match(/^([\d.]+)x([\d.]+)$/);
    if (withWeight) {
      result.push({ weight: parseFloat(withWeight[1]), reps: parseFloat(withWeight[2]) });
      continue;
    }
    const repsOnly = p.match(/^([\d.]+)$/);
    if (repsOnly) {
      result.push({ weight: null, reps: parseFloat(repsOnly[1]) });
      continue;
    }
    return null; // unrecognized shape — bail to the duplicate-fallback for this exercise
  }
  return result;
}

// One-time backfill from the pre-per-set schema (a single aggregate sets/reps/weight per
// exercise) into real workout_sets rows. Idempotent: skips any exercise that already has
// set rows, so it's safe to run on every boot.
function backfillWorkoutSets(db: Database): void {
  const exercises = db
    .query<LegacyExerciseRow, []>("SELECT id, user_id, sets, reps, weight, notes FROM workout_exercises WHERE sets IS NOT NULL AND sets > 0")
    .all();
  if (exercises.length === 0) return;

  const insertSet = db.query(
    "INSERT INTO workout_sets (id, user_id, exercise_id, set_index, weight, reps, completed) VALUES (?, ?, ?, ?, ?, ?, 1)"
  );
  const hasSetsQuery = db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM workout_sets WHERE exercise_id = ?");

  for (const ex of exercises) {
    if ((hasSetsQuery.get(ex.id)?.n ?? 0) > 0) continue;
    const count = ex.sets ?? 1;
    const parsed = parseSetsFromNotes(ex.notes, count);
    const sets = parsed ?? Array.from({ length: count }, () => ({ weight: ex.weight, reps: ex.reps }));
    sets.forEach((s, i) => insertSet.run(crypto.randomUUID(), ex.user_id, ex.id, i, s.weight, s.reps));
  }
}
