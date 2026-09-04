import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, Broom, Dumbbell, Flame, Utensils } from "lucide-react";
import {
  api,
  type Bill,
  type CalendarEvent,
  type Habit,
  type HabitLog,
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
// calendar-date basis workout_date/meal_date/habit_logs.log_date use (see todayISO() in
// calendarUtils.ts, used further below for the food/workout/habit logged-today checks).
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

function habitLogKey(habitId: string, date: string): string {
  return `${habitId}|${date}`;
}

const UNDATED_TODO_LIMIT = 3;

export default function Today() {
  const [todosDue, setTodosDue] = useState<Todo[]>([]);
  const [undatedTodos, setUndatedTodos] = useState<Todo[]>([]);
  const [billsDue, setBillsDue] = useState<Bill[]>([]);
  const [tasksDue, setTasksDue] = useState<RecurringTask[]>([]);
  const [eventsToday, setEventsToday] = useState<CalendarEvent[]>([]);
  const [weekRecap, setWeekRecap] = useState<WeekRecap | null>(null);
  const [loggedFoodToday, setLoggedFoodToday] = useState(true);
  const [loggedWorkoutToday, setLoggedWorkoutToday] = useState(true);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitCounts, setHabitCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([]);
  const [quickTodoTitle, setQuickTodoTitle] = useState("");
  const [quickShoppingItem, setQuickShoppingItem] = useState("");

  const today = todayISO();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [data, allTodos, mealDates, workoutData, shopping, habitData] = await Promise.all([
        api.getToday(),
        api.getTodos(),
        api.listMealDates(),
        api.getWorkouts(),
        api.getShopping(),
        api.getHabits(),
      ]);
      setTodosDue(data.todosDue);
      setUndatedTodos(allTodos.todos.filter((t) => !t.completed && !t.due_at));
      setTodoLists(allTodos.lists);
      setShoppingLists(shopping.lists);
      setBillsDue(data.billsDue);
      setTasksDue(data.tasksDue);
      setEventsToday(data.eventsToday);
      setWeekRecap(data.weekRecap);
      setLoggedFoodToday(mealDates.includes(today));
      setLoggedWorkoutToday(workoutData.workouts.some((w) => w.workout_date === today));
      setHabits(habitData.habits);
      setHabitCounts(new Map(habitData.logs.map((l: HabitLog) => [habitLogKey(l.habit_id, l.log_date), l.count])));
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

  async function logHabitToday(habit: Habit) {
    const { count } = await api.logHabit(habit.id, today);
    setHabitCounts((prev) => new Map(prev).set(habitLogKey(habit.id, today), count));
  }

  const overdueTodos = todosDue.filter((t) => t.due_at && isOverdue(t.due_at));
  const dueTodayTodos = todosDue.filter((t) => !t.due_at || !isOverdue(t.due_at));
  const overdueBills = billsDue.filter((b) => isOverdue(b.next_due_at));
  const dueSoonBills = billsDue.filter((b) => !isOverdue(b.next_due_at));
  const overdueTasks = tasksDue.filter((t) => isOverdue(t.next_due_at));
  const dueSoonTasks = tasksDue.filter((t) => !isOverdue(t.next_due_at));
  const hasOverdue = overdueTodos.length > 0 || overdueBills.length > 0 || overdueTasks.length > 0;

  const incompleteHabits = habits.filter((h) => (habitCounts.get(habitLogKey(h.id, today)) ?? 0) < h.target_per_day);
  const hasMissedTracking = !loggedFoodToday || !loggedWorkoutToday || incompleteHabits.length > 0;

  const nothingDue =
    !loading &&
    !hasOverdue &&
    dueTodayTodos.length === 0 &&
    undatedTodos.length === 0 &&
    dueSoonBills.length === 0 &&
    dueSoonTasks.length === 0 &&
    eventsToday.length === 0 &&
    !hasMissedTracking;

  return (
    <div className="today-page">
      <h1>Today</h1>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : nothingDue ? (
        <div className="empty-state">Nothing due — you're all caught up.</div>
      ) : (
        <>
          {hasOverdue && (
            <section>
              <h2>Overdue</h2>
              <div className="list list-compact">
                {overdueTodos.map((todo) => (
                  <div className="card card-compact row-between" key={`todo-${todo.id}`}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 8 }}>
                      <button type="button" className="checkbox-btn" onClick={() => completeTodo(todo.id)} aria-label="Mark complete" />
                      <span className="ellipsis">{todo.title}</span>
                    </div>
                    <span className="chip chip-danger">{formatDate(todo.due_at!)}</span>
                  </div>
                ))}
                {overdueBills.map((bill) => (
                  <div className="card card-compact row-between" key={`bill-${bill.id}`}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Banknote size={16} className="icon-inline text-dim" aria-hidden="true" />
                      <span className="ellipsis">{bill.name}</span>
                      <span style={{ flexShrink: 0 }}>· {formatCents(bill.amount_cents)}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="chip chip-danger">{formatDate(bill.next_due_at)}</span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => markBillPaid(bill.id)}>
                        Paid
                      </button>
                    </div>
                  </div>
                ))}
                {overdueTasks.map((task) => (
                  <div className="card card-compact row-between" key={`task-${task.id}`}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Broom size={16} className="icon-inline text-dim" aria-hidden="true" />
                      <span className="ellipsis">{task.name}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="chip chip-danger">{formatDate(task.next_due_at)}</span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => completeTask(task.id)}>
                        Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasMissedTracking && (
            <section>
              <h2>Missed Today</h2>
              <div className="list list-compact">
                {!loggedFoodToday && (
                  <div className="card card-compact row-between">
                    <div className="row" style={{ gap: 6 }}>
                      <Utensils size={16} className="icon-inline text-dim" aria-hidden="true" />
                      <span>Food not logged</span>
                    </div>
                    <Link to="/workouts?tab=food" className="btn btn-primary btn-sm">
                      Log
                    </Link>
                  </div>
                )}
                {!loggedWorkoutToday && (
                  <div className="card card-compact row-between">
                    <div className="row" style={{ gap: 6 }}>
                      <Dumbbell size={16} className="icon-inline text-dim" aria-hidden="true" />
                      <span>Workout not logged</span>
                    </div>
                    <Link to="/workouts?tab=workouts" className="btn btn-primary btn-sm">
                      Log
                    </Link>
                  </div>
                )}
                {incompleteHabits.map((habit) => {
                  const count = habitCounts.get(habitLogKey(habit.id, today)) ?? 0;
                  return (
                    <div className="card card-compact row-between" key={habit.id}>
                      <div className="row" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <Flame size={16} className="icon-inline text-dim" aria-hidden="true" />
                        <span className="ellipsis">
                          {habit.name} {habit.target_per_day > 1 && `(${count}/${habit.target_per_day})`}
                        </span>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => logHabitToday(habit)}>
                        Log
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {eventsToday.length > 0 && (
            <section>
              <h2>Calendar</h2>
              <div className="list list-compact">
                {eventsToday.map((event) => (
                  <div className="card card-compact row-between" key={event.id}>
                    <span className="ellipsis">
                      {event.title}
                      {event.location && <span className="text-dim"> · {event.location}</span>}
                    </span>
                    <span className="chip">{event.all_day ? "All day" : formatTime(event.start_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(dueTodayTodos.length > 0 || undatedTodos.length > 0 || todoLists.length > 0 || shoppingLists.length > 0) && (
            <section>
              <h2>To-Dos</h2>
              <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {todoLists.length > 0 && (
                  <form className="row" style={{ flex: "1 1 160px", gap: 8 }} onSubmit={quickAddTodo}>
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
                  <form className="row" style={{ flex: "1 1 160px", gap: 8 }} onSubmit={quickAddShoppingItem}>
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
              <div className="list list-compact">
                {dueTodayTodos.map((todo) => (
                  <div className="card card-compact row-between" key={todo.id}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 8 }}>
                      <button type="button" className="checkbox-btn" onClick={() => completeTodo(todo.id)} aria-label="Mark complete" />
                      <span className="ellipsis">{todo.title}</span>
                    </div>
                    {todo.due_at && <span className="chip chip-warning">Today</span>}
                  </div>
                ))}
                {undatedTodos.slice(0, UNDATED_TODO_LIMIT).map((todo) => (
                  <div className="card card-compact row-between" key={todo.id}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 8 }}>
                      <button type="button" className="checkbox-btn" onClick={() => completeTodo(todo.id)} aria-label="Mark complete" />
                      <span className="ellipsis">{todo.title}</span>
                    </div>
                  </div>
                ))}
              </div>
              {undatedTodos.length > UNDATED_TODO_LIMIT && (
                <Link to="/todos" className="text-dim" style={{ display: "inline-block", marginTop: 6, fontSize: 13 }}>
                  +{undatedTodos.length - UNDATED_TODO_LIMIT} more on your todo list
                </Link>
              )}
            </section>
          )}

          {(dueSoonBills.length > 0 || dueSoonTasks.length > 0) && (
            <section>
              <h2>Due Soon</h2>
              <div className="list list-compact">
                {dueSoonBills.map((bill) => (
                  <div className="card card-compact row-between" key={bill.id}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Banknote size={16} className="icon-inline text-dim" aria-hidden="true" />
                      <span className="ellipsis">{bill.name}</span>
                      <span style={{ flexShrink: 0 }}>· {formatCents(bill.amount_cents)}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="chip chip-warning">{formatDate(bill.next_due_at)}</span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => markBillPaid(bill.id)}>
                        Paid
                      </button>
                    </div>
                  </div>
                ))}
                {dueSoonTasks.map((task) => (
                  <div className="card card-compact row-between" key={task.id}>
                    <div className="row" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Broom size={16} className="icon-inline text-dim" aria-hidden="true" />
                      <span className="ellipsis">{task.name}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="chip chip-warning">{formatDate(task.next_due_at)}</span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => completeTask(task.id)}>
                        Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
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
    </div>
  );
}
