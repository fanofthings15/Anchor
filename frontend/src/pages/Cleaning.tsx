import { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { api, type Recurrence, type RecurringTask } from "../api/client";

type Category = "cleaning" | "maintenance";

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "One-off",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
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

// next_due_at is stored as UTC midnight of the intended calendar day (created from a bare
// "YYYY-MM-DD" date-input value via `new Date(str).toISOString()`), so the first 10
// characters of the ISO string already are that date — no timezone conversion needed, and
// applying one (as this used to, via getTimezoneOffset) shifts the day backward in any
// timezone behind UTC.
function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

// Compares UTC calendar days on both sides, matching the backend's own `date('now')`
// (UTC) definition of overdue in cleaning.ts — a local-timezone comparison would make a
// task appear due/overdue up to a day early or late depending on the viewer's offset.
function daysUntil(iso: string): number {
  const due = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<Category>("cleaning");
  const [editRecurrence, setEditRecurrence] = useState<Recurrence>("weekly");
  const [editIntervalDays, setEditIntervalDays] = useState("30");
  const [editNextDueAt, setEditNextDueAt] = useState(todayDateInput());

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

  function startEdit(task: RecurringTask) {
    setEditingId(task.id);
    setEditName(task.name);
    setEditCategory(task.category);
    setEditRecurrence(task.recurrence);
    setEditIntervalDays(task.recurrence_interval_days != null ? String(task.recurrence_interval_days) : "30");
    setEditNextDueAt(toDateInput(task.next_due_at));
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) return;
    const updated = await api.updateRecurringTask(id, {
      name: trimmed,
      category: editCategory,
      recurrence: editRecurrence,
      recurrence_interval_days: editRecurrence === "custom" ? Number(editIntervalDays) || 30 : null,
      next_due_at: new Date(editNextDueAt).toISOString(),
    });
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingId(null);
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
              <option value="biweekly">Biweekly</option>
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
            if (editingId === task.id) {
              return (
                <form className="card" key={task.id} onSubmit={(e) => saveEdit(e, task.id)}>
                  <div className="field">
                    <label htmlFor={`edit-name-${task.id}`}>Name</label>
                    <input
                      id={`edit-name-${task.id}`}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`edit-category-${task.id}`}>Category</label>
                    <select
                      id={`edit-category-${task.id}`}
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as Category)}
                    >
                      <option value="cleaning">Cleaning</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`edit-recurrence-${task.id}`}>Repeats</label>
                    <select
                      id={`edit-recurrence-${task.id}`}
                      value={editRecurrence}
                      onChange={(e) => setEditRecurrence(e.target.value as Recurrence)}
                    >
                      <option value="none">Never (one-off)</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  {editRecurrence === "custom" && (
                    <div className="field">
                      <label htmlFor={`edit-interval-${task.id}`}>Every N days</label>
                      <input
                        id={`edit-interval-${task.id}`}
                        type="number"
                        min={1}
                        value={editIntervalDays}
                        onChange={(e) => setEditIntervalDays(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor={`edit-next-due-${task.id}`}>Next due</label>
                    <input
                      id={`edit-next-due-${task.id}`}
                      type="date"
                      value={editNextDueAt}
                      onChange={(e) => setEditNextDueAt(e.target.value)}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Save
                    </button>
                  </div>
                </form>
              );
            }

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
                  <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn-icon" onClick={() => startEdit(task)} aria-label="Edit task">
                      <Pencil size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn-icon text-danger" onClick={() => remove(task.id)} aria-label="Delete task">
                      <X size={18} aria-hidden="true" />
                    </button>
                  </div>
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
