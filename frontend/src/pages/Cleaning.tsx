import { useEffect, useMemo, useState } from "react";
import { api, type Recurrence, type RecurringTask } from "../api/client";

type Category = "cleaning" | "maintenance";

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "One-off",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

function todayDateInput(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function daysUntil(iso: string): number {
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Cleaning() {
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category>("cleaning");
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [formCategory, setFormCategory] = useState<Category>("cleaning");
  const [recurrence, setRecurrence] = useState<Recurrence>("weekly");
  const [intervalDays, setIntervalDays] = useState("30");
  const [nextDueAt, setNextDueAt] = useState(todayDateInput());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setTasks(await api.listRecurringTasks());
    } finally {
      setLoading(false);
    }
  }

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.category === category)
        .sort((a, b) => a.next_due_at.localeCompare(b.next_due_at)),
    [tasks, category]
  );

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const task = await api.createRecurringTask({
      name: trimmed,
      category: formCategory,
      recurrence,
      recurrence_interval_days: recurrence === "custom" ? Number(intervalDays) || 30 : null,
      next_due_at: new Date(nextDueAt).toISOString(),
    });
    setTasks((prev) => [...prev, task]);
    setName("");
    setFormCategory(category);
    setRecurrence("weekly");
    setIntervalDays("30");
    setNextDueAt(todayDateInput());
    setShowForm(false);
  }

  async function markDone(task: RecurringTask) {
    const updated = await api.completeRecurringTask(task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  async function remove(id: string) {
    await api.deleteRecurringTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div>
      <h1>Cleaning &amp; Maintenance</h1>

      <div className="tabs">
        <button type="button" className={`tab ${category === "cleaning" ? "active" : ""}`} onClick={() => setCategory("cleaning")}>
          Cleaning
        </button>
        <button
          type="button"
          className={`tab ${category === "maintenance" ? "active" : ""}`}
          onClick={() => setCategory("maintenance")}
        >
          Maintenance
        </button>
      </div>

      {!showForm ? (
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginBottom: 16 }}
          onClick={() => {
            setFormCategory(category);
            setShowForm(true);
          }}
        >
          + Add task
        </button>
      ) : (
        <form className="card" onSubmit={createTask} style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="task-name">Name</label>
            <input id="task-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vacuum living room" />
          </div>
          <div className="field">
            <label htmlFor="task-category">Category</label>
            <select id="task-category" value={formCategory} onChange={(e) => setFormCategory(e.target.value as Category)}>
              <option value="cleaning">Cleaning</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="task-recurrence">Repeats</label>
            <select id="task-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              <option value="none">Never (one-off)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {recurrence === "custom" && (
            <div className="field">
              <label htmlFor="task-interval">Every N days</label>
              <input
                id="task-interval"
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="task-next-due">First due</label>
            <input id="task-next-due" type="date" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add task
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : visibleTasks.length === 0 ? (
        <div className="empty-state">No {category} tasks yet — add one above.</div>
      ) : (
        <div className="list">
          {visibleTasks.map((task) => {
            const diff = daysUntil(task.next_due_at);
            return (
              <div className="card" key={task.id}>
                <div className="row-between">
                  <div>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <strong>{task.name}</strong>
                      {diff < 0 && <span className="chip chip-danger">Overdue</span>}
                      {diff === 0 && <span className="chip chip-warning">Due today</span>}
                      <span className="chip">{RECURRENCE_LABELS[task.recurrence]}</span>
                    </div>
                    <div className="text-dim" style={{ marginTop: 4, fontSize: 13 }}>
                      Next due {formatDate(task.next_due_at)}
                    </div>
                  </div>
                  <button type="button" className="btn-icon text-danger" onClick={() => remove(task.id)} aria-label="Delete task">
                    ✕
                  </button>
                </div>
                <div className="form-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-primary" onClick={() => markDone(task)}>
                    Mark done
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
