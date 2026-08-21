import { Router } from "express";
import { db } from "../db";

export const habitsRouter = Router();

// Fixed grid instead of infinite scroll — the UI shows no dates/tooltips on any cell
// (user's call: "just the green box vs grey box"), so there's nothing for a user to
// scroll toward. 91 days (13 whole weeks) is "the last 3 months", rendered as a
// GitHub-style 7-row x 13-column grid (see Habits.tsx) — streaks are also computed
// from this same window, so a streak longer than 91 days would under-count, which
// matches the display window's own scope.
const LOG_WINDOW_DAYS = 91;

interface HabitRow {
  id: string;
  user_id: string;
  name: string;
  target_per_day: number;
  sort_order: number;
  created_at: string;
}

interface HabitLogRow {
  id: string;
  user_id: string;
  habit_id: string;
  log_date: string;
  count: number;
}

function serializeHabit(row: HabitRow) {
  return {
    id: row.id,
    name: row.name,
    target_per_day: row.target_per_day,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

function serializeLog(row: HabitLogRow) {
  return { habit_id: row.habit_id, log_date: row.log_date, count: row.count };
}

function windowStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - LOG_WINDOW_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET /api/habits — every habit plus its logs within the fixed display window. Only
// count > 0 rows are sent (the frontend fills every other day in the window as empty),
// keeping the payload small regardless of how long a habit has existed.
habitsRouter.get("/", (req, res) => {
  const habits = db
    .query<HabitRow, [string]>("SELECT * FROM habits WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC")
    .all(req.uid);
  const logs = db
    .query<HabitLogRow, [string, string]>(
      "SELECT * FROM habit_logs WHERE user_id = ? AND log_date >= ? AND count > 0 ORDER BY log_date ASC"
    )
    .all(req.uid, windowStartDate());
  res.json({ habits: habits.map(serializeHabit), logs: logs.map(serializeLog) });
});

habitsRouter.post("/", (req, res) => {
  const { name, target_per_day = 1 } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const target = Number.isInteger(target_per_day) && target_per_day > 0 ? target_per_day : 1;
  const maxOrderRow = db.query<{ m: number | null }, [string]>("SELECT MAX(sort_order) as m FROM habits WHERE user_id = ?").get(req.uid);
  const sort_order = (maxOrderRow?.m ?? -1) + 1;
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.query("INSERT INTO habits (id, user_id, name, target_per_day, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    req.uid,
    name.trim(),
    target,
    sort_order,
    created_at
  );
  const row = db.query<HabitRow, [string]>("SELECT * FROM habits WHERE id = ?").get(id)!;
  res.status(201).json(serializeHabit(row));
});

habitsRouter.patch("/:id", (req, res) => {
  const existing = db.query<HabitRow, [string, string]>("SELECT * FROM habits WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { name, target_per_day, sort_order } = req.body ?? {};
  const next: HabitRow = {
    ...existing,
    name: typeof name === "string" && name.trim() ? name.trim() : existing.name,
    target_per_day: Number.isInteger(target_per_day) && target_per_day > 0 ? target_per_day : existing.target_per_day,
    sort_order: Number.isInteger(sort_order) ? sort_order : existing.sort_order,
  };
  db.query("UPDATE habits SET name = ?, target_per_day = ?, sort_order = ? WHERE id = ? AND user_id = ?").run(
    next.name,
    next.target_per_day,
    next.sort_order,
    req.params.id,
    req.uid
  );
  res.json(serializeHabit(next));
});

habitsRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM habit_logs WHERE habit_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM habits WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

// POST /api/habits/:id/log — client sends the local "today" date (calendarUtils.ts's
// todayISO()), never computed server-side, same reasoning as weight/workout/meal dates.
// Cycles count 0 -> 1 -> ... -> target_per_day -> 0 so a mis-tap can be undone by tapping
// again, with no separate undo UI needed.
habitsRouter.post("/:id/log", (req, res) => {
  const habit = db.query<HabitRow, [string, string]>("SELECT * FROM habits WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!habit) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { date } = req.body ?? {};
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be a YYYY-MM-DD string" });
    return;
  }
  const existing = db
    .query<HabitLogRow, [string, string]>("SELECT * FROM habit_logs WHERE habit_id = ? AND log_date = ?")
    .get(req.params.id, date);
  const nextCount = ((existing?.count ?? 0) + 1) % (habit.target_per_day + 1);
  if (existing) {
    db.query("UPDATE habit_logs SET count = ? WHERE id = ?").run(nextCount, existing.id);
  } else {
    db.query("INSERT INTO habit_logs (id, user_id, habit_id, log_date, count) VALUES (?, ?, ?, ?, ?)").run(
      crypto.randomUUID(),
      req.uid,
      req.params.id,
      date,
      nextCount
    );
  }
  res.json({ habit_id: req.params.id, log_date: date, count: nextCount });
});
