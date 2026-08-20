import { useEffect, useState } from "react";
import { api, type Bill, type CalendarEvent, type RecurringTask, type Todo } from "../api/client";

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(dateIso: string): boolean {
  return dateIso.slice(0, 10) < todayDateStr();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Today() {
  const [todosDue, setTodosDue] = useState<Todo[]>([]);
  const [billsDue, setBillsDue] = useState<Bill[]>([]);
  const [tasksDue, setTasksDue] = useState<RecurringTask[]>([]);
  const [eventsToday, setEventsToday] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getToday();
      setTodosDue(data.todosDue);
      setBillsDue(data.billsDue);
      setTasksDue(data.tasksDue);
      setEventsToday(data.eventsToday);
    } finally {
      setLoading(false);
    }
  }

  async function completeTodo(id: string) {
    setTodosDue((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.completeTodo(id, true);
    } catch {
      load();
    }
  }

  async function markBillPaid(id: string) {
    setBillsDue((prev) => prev.filter((b) => b.id !== id));
    try {
      await api.payBill(id);
    } catch {
      load();
    }
  }

  async function completeTask(id: string) {
    setTasksDue((prev) => prev.filter((t) => t.id !== id));
    try {
      await api.completeRecurringTask(id);
    } catch {
      load();
    }
  }

  const nothingDue =
    !loading && todosDue.length === 0 && billsDue.length === 0 && tasksDue.length === 0 && eventsToday.length === 0;

  return (
    <div>
      <h1>Today</h1>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : nothingDue ? (
        <div className="empty-state">Nothing due — you're all caught up.</div>
      ) : (
        <>
          {todosDue.length > 0 && (
            <section>
              <h2>Due Today</h2>
              <div className="list">
                {todosDue.map((todo) => (
                  <div className="card" key={todo.id}>
                    <div className="row-between">
                      <div className="row" style={{ flex: 1 }}>
                        <button
                          type="button"
                          className="checkbox-btn"
                          onClick={() => completeTodo(todo.id)}
                          aria-label="Mark complete"
                        />
                        <span>{todo.title}</span>
                      </div>
                      {todo.due_at && (
                        <span className={`chip ${isOverdue(todo.due_at) ? "chip-danger" : "chip-warning"}`}>
                          {isOverdue(todo.due_at) ? "Overdue" : "Today"} · {formatDate(todo.due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {billsDue.length > 0 && (
            <section>
              <h2>Bills Due Soon</h2>
              <div className="list">
                {billsDue.map((bill) => (
                  <div className="card" key={bill.id}>
                    <div className="row-between">
                      <strong>{bill.name}</strong>
                      <span>{formatCents(bill.amount_cents)}</span>
                    </div>
                    <div className="row-between" style={{ marginTop: 10 }}>
                      <span className={`chip ${isOverdue(bill.next_due_at) ? "chip-danger" : "chip-warning"}`}>
                        {isOverdue(bill.next_due_at) ? "Overdue" : "Due"} {formatDate(bill.next_due_at)}
                      </span>
                      <button type="button" className="btn btn-primary" onClick={() => markBillPaid(bill.id)}>
                        Mark paid
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tasksDue.length > 0 && (
            <section>
              <h2>Cleaning & Maintenance Due</h2>
              <div className="list">
                {tasksDue.map((task) => (
                  <div className="card" key={task.id}>
                    <div className="row-between">
                      <div>
                        <div>{task.name}</div>
                        <span className={`chip ${isOverdue(task.next_due_at) ? "chip-danger" : "chip-warning"}`}>
                          {isOverdue(task.next_due_at) ? "Overdue" : "Today"} · {formatDate(task.next_due_at)}
                        </span>
                      </div>
                      <button type="button" className="btn" onClick={() => completeTask(task.id)}>
                        Mark done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {eventsToday.length > 0 && (
            <section>
              <h2>Today's Events</h2>
              <div className="list">
                {eventsToday.map((event) => (
                  <div className="card" key={event.id}>
                    <div className="row-between">
                      <strong>{event.title}</strong>
                      <span className="chip">{event.all_day ? "All day" : formatTime(event.start_at)}</span>
                    </div>
                    {event.location && <div className="text-dim" style={{ marginTop: 6 }}>{event.location}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
