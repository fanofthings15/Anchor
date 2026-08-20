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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

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

CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workout_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight REAL,
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_user ON workout_exercises(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);

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
}
