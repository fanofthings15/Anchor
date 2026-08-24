import { Router } from "express";
import { db } from "../db";

export const todayRouter = Router();

interface TodoRow {
  id: string;
  user_id: string;
  list_id: string;
  title: string;
  notes: string;
  due_at: string | null;
  priority: string;
  completed: number;
  completed_at: string | null;
  created_at: string;
}

interface BillRow {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  category: string;
  autopay: number;
  notes: string;
  recurrence: string;
  recurrence_interval_days: number | null;
  last_paid_at: string | null;
  next_due_at: string;
  created_at: string;
}

interface RecurringTaskRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  notes: string;
  recurrence: string;
  recurrence_interval_days: number | null;
  last_completed_at: string | null;
  next_due_at: string;
  created_at: string;
}

interface CalendarEventRow {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  start_at: string;
  end_at: string | null;
  all_day: number;
  location: string;
  created_at: string;
}

function serializeTodo(row: TodoRow) {
  return {
    id: row.id,
    list_id: row.list_id,
    title: row.title,
    notes: row.notes,
    due_at: row.due_at,
    priority: row.priority,
    completed: row.completed === 1,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}

function serializeBill(row: BillRow) {
  return {
    id: row.id,
    name: row.name,
    amount_cents: row.amount_cents,
    category: row.category,
    autopay: row.autopay === 1,
    notes: row.notes,
    recurrence: row.recurrence,
    recurrence_interval_days: row.recurrence_interval_days,
    last_paid_at: row.last_paid_at,
    next_due_at: row.next_due_at,
    created_at: row.created_at,
  };
}

function serializeRecurringTask(row: RecurringTaskRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    notes: row.notes,
    recurrence: row.recurrence,
    recurrence_interval_days: row.recurrence_interval_days,
    last_completed_at: row.last_completed_at,
    next_due_at: row.next_due_at,
    created_at: row.created_at,
  };
}

function serializeCalendarEvent(row: CalendarEventRow) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    start_at: row.start_at,
    end_at: row.end_at,
    all_day: row.all_day === 1,
    location: row.location,
    created_at: row.created_at,
  };
}

// All comparisons use SQLite's date('now') (UTC, date-only) against the date portion
// (first 10 chars) of stored ISO timestamps — there's no per-user timezone setting yet,
// so "today" is simply today's UTC calendar date. Ordering by the raw date/timestamp
// column ascending already yields "overdue first, then ascending": overdue rows have an
// earlier (lexicographically smaller) date than today's, so they naturally sort first.
todayRouter.get("/", (req, res) => {
  const todosDue = db
    .query<TodoRow, [string]>(
      `SELECT * FROM todos
       WHERE user_id = ? AND completed = 0 AND due_at IS NOT NULL
         AND substr(due_at, 1, 10) <= date('now')
       ORDER BY due_at ASC`
    )
    .all(req.uid)
    .map(serializeTodo);

  const billsDue = db
    .query<BillRow, [string]>(
      `SELECT * FROM bills
       WHERE user_id = ? AND autopay = 0 AND substr(next_due_at, 1, 10) <= date('now', '+3 days')
       ORDER BY next_due_at ASC`
    )
    .all(req.uid)
    .map(serializeBill);

  const tasksDue = db
    .query<RecurringTaskRow, [string]>(
      `SELECT * FROM recurring_tasks
       WHERE user_id = ? AND substr(next_due_at, 1, 10) <= date('now')
       ORDER BY next_due_at ASC`
    )
    .all(req.uid)
    .map(serializeRecurringTask);

  const eventsToday = db
    .query<CalendarEventRow, [string]>(
      `SELECT * FROM calendar_events
       WHERE user_id = ? AND substr(start_at, 1, 10) = date('now')
       ORDER BY start_at ASC`
    )
    .all(req.uid)
    .map(serializeCalendarEvent);

  res.json({ todosDue, billsDue, tasksDue, eventsToday, weekRecap: getWeekRecap(req.uid) });
});

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Calendar week (Sunday-Saturday, UTC — matching the "today" convention used everywhere
// else in this file) rather than a rolling 7 days, so "this week" and "last week" line up
// with the Sunday-first weeks the Calendar page already shows. Trades away the rolling
// window's "always something in progress" feel for a real week-over-week comparison.
function getWeekRecap(uid: string) {
  const now = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setUTCDate(thisWeekStart.getUTCDate() - 1);

  return {
    thisWeek: computeRecap(uid, isoUTC(thisWeekStart), isoUTC(now)),
    lastWeek: computeRecap(uid, isoUTC(lastWeekStart), isoUTC(lastWeekEnd)),
  };
}

function computeRecap(uid: string, start: string, end: string) {
  // Reads from todo_completions, not todos directly — a completed todo that's since been
  // deleted (a normal way to tidy up a list) still counts toward the week it was done in.
  const todosCompleted = db
    .query<{ n: number }, [string, string, string]>(
      `SELECT COUNT(*) as n FROM todo_completions
       WHERE user_id = ? AND substr(completed_at, 1, 10) BETWEEN ? AND ?`
    )
    .get(uid, start, end)!.n;

  const workoutsLogged = db
    .query<{ n: number }, [string, string, string]>(
      `SELECT COUNT(*) as n FROM workouts
       WHERE user_id = ? AND substr(workout_date, 1, 10) BETWEEN ? AND ?`
    )
    .get(uid, start, end)!.n;

  const bills = db
    .query<{ n: number; total: number | null }, [string, string, string]>(
      `SELECT COUNT(*) as n, SUM(amount_cents) as total FROM bills
       WHERE user_id = ? AND last_paid_at IS NOT NULL
         AND substr(last_paid_at, 1, 10) BETWEEN ? AND ?`
    )
    .get(uid, start, end)!;

  const tasksCompleted = db
    .query<{ n: number }, [string, string, string]>(
      `SELECT COUNT(*) as n FROM recurring_tasks
       WHERE user_id = ? AND last_completed_at IS NOT NULL
         AND substr(last_completed_at, 1, 10) BETWEEN ? AND ?`
    )
    .get(uid, start, end)!.n;

  return {
    todosCompleted,
    workoutsLogged,
    billsPaid: bills.n,
    billsPaidCents: bills.total ?? 0,
    tasksCompleted,
  };
}
