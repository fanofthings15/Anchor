import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Bill,
  type CalendarEvent,
  type RecurringTask,
  type ShoppingList,
  type Todo,
  type TodoList,
  type WeekRecap,
} from "../api/client";
import { todayISO } from "../calendarUtils";

// UTC-based — matches how todos/bills/recurring-task dates are stored (full ISO
// timestamps via toISOString()) and how the backend's /api/today aggregation decides
// what counts as due, so this has to stay on the same UTC basis as those, not the local
// calendar-date basis workout_date/meal_date use (see todayISO() in calendarUtils.ts,
// used further below only for the separate food/workout logged-today check).
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

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const UNDATED_TODO_LIMIT = 5;

export default function Today() {
  const [todosDue, setTodosDue] = useState<Todo[]>([]);
  const [undatedTodos, setUndatedTodos] = useState<Todo[]>([]);
  const [billsDue, setBillsDue] = useState<Bill[]>([]);
  const [tasksDue, setTasksDue] = useState<RecurringTask[]>([]);
  const [eventsToday, setEventsToday] = useState<CalendarEvent[]>([]);
  const [weekRecap, setWeekRecap] = useState<WeekRecap | null>(null);
  const [loggedFoodToday, setLoggedFoodToday] = useState(true);
  const [loggedWorkoutToday, setLoggedWorkoutToday] = useState(true);
  const [loading, setLoading] = useState(true);

  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [quickTodoTitle, setQuickTodoTitle] = useState("");
  const [quickShoppingItem, setQuickShoppingItem] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [data, allTodos, mealDates, workoutData, shopping] = await Promise.all([
        api.getToday(),
        api.getTodos(),
        api.listMealDates(),
        api.getWorkouts(),
        api.getShopping(),
      ]);
      setTodosDue(data.todosDue);
      setUndatedTodos(allTodos.todos.filter((t) => !t.completed && !t.due_at));
      setTodoLists(allTodos.lists);
      setShoppingLists(shopping.lists);
      setBillsDue(data.billsDue);
      setTasksDue(data.tasksDue);
      setEventsToday(data.eventsToday);
      setWeekRecap(data.weekRecap);
      const today = todayISO();
      setLoggedFoodToday(mealDates.includes(today));
      setLoggedWorkoutToday(workoutData.workouts.some((w) => w.workout_date === today));
    } finally {
      setLoading(false);
    }
  }

  async function quickAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTodoTitle.trim();
    if (!title || todoLists.length === 0) return;
    setQuickTodoTitle("");
    const todo = await api.createTodo({ list_id: todoLists[0].id, title });
    setUndatedTodos((prev) => [...prev, todo]);
  }

  async function quickAddShoppingItem(e: React.FormEvent) {
    e.preventDefault();
    const name = quickShoppingItem.trim();
    if (!name || shoppingLists.length === 0) return;
    setQuickShoppingItem("");
    await api.createShoppingItem({ list_id: shoppingLists[0].id, name });
  }

  async function completeTodo(id: string) {
    setTodosDue((prev) => prev.filter((t) => t.id !== id));
    setUndatedTodos((prev) => prev.filter((t) => t.id !== id));
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
    !loading &&
    todosDue.length === 0 &&
    undatedTodos.length === 0 &&
    billsDue.length === 0 &&
    tasksDue.length === 0 &&
    eventsToday.length === 0 &&
    loggedFoodToday &&
    loggedWorkoutToday;

  return (
    <div>
      <h1>Today</h1>

      {!loading && (todoLists.length > 0 || shoppingLists.length > 0) && (
        <section>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {todoLists.length > 0 && (
              <form className="row" style={{ flex: "1 1 200px", gap: 8 }} onSubmit={quickAddTodo}>
                <input
                  type="text"
                  placeholder="+ Add a to-do…"
                  value={quickTodoTitle}
                  onChange={(e) => setQuickTodoTitle(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" type="submit">
                  Add
                </button>
              </form>
            )}
            {shoppingLists.length > 0 && (
              <form className="row" style={{ flex: "1 1 200px", gap: 8 }} onSubmit={quickAddShoppingItem}>
                <input
                  type="text"
                  placeholder="+ Add to shopping list…"
                  value={quickShoppingItem}
                  onChange={(e) => setQuickShoppingItem(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" type="submit">
                  Add
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {!loading && weekRecap && (
        <section>
          <h2>This Week</h2>
          {weekRecap.thisWeek.todosCompleted === 0 &&
          weekRecap.thisWeek.workoutsLogged === 0 &&
          weekRecap.thisWeek.billsPaid === 0 &&
          weekRecap.thisWeek.tasksCompleted === 0 ? (
            <div className="card text-dim">Nothing logged yet this week — plenty of time.</div>
          ) : (
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {weekRecap.thisWeek.todosCompleted > 0 && (
                <div className="card" style={{ flex: "1 1 140px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{weekRecap.thisWeek.todosCompleted}</div>
                  <div className="text-dim" style={{ fontSize: 13 }}>{pluralize(weekRecap.thisWeek.todosCompleted, "todo")} done</div>
                </div>
              )}
              {weekRecap.thisWeek.workoutsLogged > 0 && (
                <div className="card" style={{ flex: "1 1 140px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{weekRecap.thisWeek.workoutsLogged}</div>
                  <div className="text-dim" style={{ fontSize: 13 }}>{pluralize(weekRecap.thisWeek.workoutsLogged, "workout")}</div>
                </div>
              )}
              {weekRecap.thisWeek.tasksCompleted > 0 && (
                <div className="card" style={{ flex: "1 1 140px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{weekRecap.thisWeek.tasksCompleted}</div>
                  <div className="text-dim" style={{ fontSize: 13 }}>{pluralize(weekRecap.thisWeek.tasksCompleted, "chore")} done</div>
                </div>
              )}
              {weekRecap.thisWeek.billsPaid > 0 && (
                <div className="card" style={{ flex: "1 1 140px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{formatCents(weekRecap.thisWeek.billsPaidCents)}</div>
                  <div className="text-dim" style={{ fontSize: 13 }}>{pluralize(weekRecap.thisWeek.billsPaid, "bill")} paid</div>
                </div>
              )}
            </div>
          )}
          {(weekRecap.lastWeek.todosCompleted > 0 ||
            weekRecap.lastWeek.workoutsLogged > 0 ||
            weekRecap.lastWeek.billsPaid > 0 ||
            weekRecap.lastWeek.tasksCompleted > 0) && (
            <div className="text-dim" style={{ fontSize: 13, marginTop: 8 }}>
              Last week: {[
                weekRecap.lastWeek.todosCompleted > 0 && pluralize(weekRecap.lastWeek.todosCompleted, "todo"),
                weekRecap.lastWeek.workoutsLogged > 0 && pluralize(weekRecap.lastWeek.workoutsLogged, "workout"),
                weekRecap.lastWeek.tasksCompleted > 0 && pluralize(weekRecap.lastWeek.tasksCompleted, "chore"),
                weekRecap.lastWeek.billsPaid > 0 && `${formatCents(weekRecap.lastWeek.billsPaidCents)} in bills`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </section>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : nothingDue ? (
        <div className="empty-state">Nothing due — you're all caught up.</div>
      ) : (
        <>
          {(!loggedFoodToday || !loggedWorkoutToday) && (
            <section>
              <h2>Log Today</h2>
              <div className="list">
                {!loggedFoodToday && (
                  <div className="card row-between">
                    <span>🍽 No food logged today</span>
                    <Link to="/workouts?tab=food" className="btn btn-primary">
                      Log food
                    </Link>
                  </div>
                )}
                {!loggedWorkoutToday && (
                  <div className="card row-between">
                    <span>No workout logged today</span>
                    <Link to="/workouts?tab=workouts" className="btn">
                      Log workout
                    </Link>
                  </div>
                )}
              </div>
            </section>
          )}

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

          {undatedTodos.length > 0 && (
            <section>
              <h2>On Your List</h2>
              <div className="list">
                {undatedTodos.slice(0, UNDATED_TODO_LIMIT).map((todo) => (
                  <div className="card" key={todo.id}>
                    <div className="row" style={{ flex: 1 }}>
                      <button
                        type="button"
                        className="checkbox-btn"
                        onClick={() => completeTodo(todo.id)}
                        aria-label="Mark complete"
                      />
                      <span>{todo.title}</span>
                    </div>
                  </div>
                ))}
              </div>
              {undatedTodos.length > UNDATED_TODO_LIMIT && (
                <Link to="/todos" className="text-dim" style={{ display: "inline-block", marginTop: 8 }}>
                  +{undatedTodos.length - UNDATED_TODO_LIMIT} more on your todo list
                </Link>
              )}
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
