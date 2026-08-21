import { useEffect, useMemo, useState } from "react";
import { api, type Habit, type HabitLog } from "../api/client";
import { addDaysISO, computeStreaks, todayISO } from "../calendarUtils";

const WINDOW_DAYS = 91;

function logKey(habitId: string, date: string): string {
  return `${habitId}|${date}`;
}

// Oldest -> newest, ending on today, matching the fixed-length window the backend's
// GET /habits window is scoped to (see habits.ts's LOG_WINDOW_DAYS). Rendered as a
// GitHub-style grid via CSS `grid-auto-flow: column` (see .habit-graph in styles.css) —
// every 7 consecutive dates become one column, so no manual chunking is needed here.
function buildWindowDates(): string[] {
  const today = todayISO();
  const dates: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    dates.push(addDaysISO(today, -i));
  }
  return dates;
}

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [targetPerDay, setTargetPerDay] = useState<1 | 2>(1);

  const dates = useMemo(buildWindowDates, []);
  const today = dates[dates.length - 1];

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { habits, logs } = await api.getHabits();
      setHabits(habits);
      setCounts(new Map(logs.map((l: HabitLog) => [logKey(l.habit_id, l.log_date), l.count])));
    } finally {
      setLoading(false);
    }
  }

  async function createHabit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const habit = await api.createHabit({ name: trimmed, target_per_day: targetPerDay });
    setHabits((prev) => [...prev, habit]);
    setName("");
    setTargetPerDay(1);
    setShowForm(false);
  }

  async function remove(id: string) {
    await api.deleteHabit(id);
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }

  async function logToday(habit: Habit) {
    const { count } = await api.logHabit(habit.id, today);
    setCounts((prev) => new Map(prev).set(logKey(habit.id, today), count));
  }

  return (
    <div>
      <h1>Habits</h1>

      {!showForm ? (
        <button type="button" className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(true)}>
          + Add habit
        </button>
      ) : (
        <form className="card" onSubmit={createHabit} style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="habit-name">Name</label>
            <input
              id="habit-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Drink water"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="habit-target">Frequency</label>
            <select id="habit-target" value={targetPerDay} onChange={(e) => setTargetPerDay(Number(e.target.value) as 1 | 2)}>
              <option value={1}>Once a day</option>
              <option value={2}>Twice a day</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add habit
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : habits.length === 0 ? (
        <div className="empty-state">No habits yet — add one above.</div>
      ) : (
        <div className="list">
          {habits.map((habit) => {
            const doneDates = new Set(dates.filter((date) => (counts.get(logKey(habit.id, date)) ?? 0) >= habit.target_per_day));
            const { current, longest } = computeStreaks(doneDates);
            const todayCount = counts.get(logKey(habit.id, today)) ?? 0;
            const isDoneToday = todayCount >= habit.target_per_day;
            return (
              <div className="card habit-row" key={habit.id}>
                <div className="row-between">
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{habit.name}</strong>
                    {current > 0 && <span className="habit-streak">🔥 {current}</span>}
                    {longest > current && <span className="habit-streak-best">best {longest}</span>}
                  </div>
                  <button type="button" className="btn-icon text-danger" onClick={() => remove(habit.id)} aria-label="Delete habit">
                    ✕
                  </button>
                </div>
                <div className="habit-graph">
                  {dates.map((date) => {
                    const count = counts.get(logKey(habit.id, date)) ?? 0;
                    const isToday = date === today;
                    const state = count === 0 ? "empty" : count >= habit.target_per_day ? "full" : "partial";
                    const cellClass = `habit-cell habit-cell-${state}` + (isToday ? " habit-cell-today" : "");
                    return <div key={date} className={cellClass} />;
                  })}
                </div>
                <button type="button" className="btn btn-primary habit-log-btn" onClick={() => logToday(habit)}>
                  {isDoneToday ? "Done ✓" : `Log (${todayCount}/${habit.target_per_day})`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
