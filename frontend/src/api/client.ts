const REAUTH_RELOAD_GUARD_KEY = "anchor-auth-reload-at";
const REAUTH_RELOAD_GUARD_COOLDOWN_MS = 30_000;

// Authentik's forward-auth session expires after the provider's access_token_validity —
// the next request to a protected router gets redirected to auth.${DOMAIN} instead of
// reaching the app. A top-level navigation follows that redirect fine (silent re-auth via
// the still-live SSO session); a fetch() can't, since the redirect target is a different
// origin with no CORS headers for it. `redirect: "manual"` lets us detect that case (an
// opaque "opaqueredirect" response instead of a thrown error) and force a real navigation
// instead of surfacing a confusing "Request failed" error for what's really an expired
// session. Same pattern as Anime-Recomender/Event-Dashboard's frontends.
function reauthRedirectDetected() {
  const last = Number(sessionStorage.getItem(REAUTH_RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < REAUTH_RELOAD_GUARD_COOLDOWN_MS) return;
  sessionStorage.setItem(REAUTH_RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    redirect: "manual",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.type === "opaqueredirect") {
    reauthRedirectDetected();
    throw new Error("Session expired, reloading…");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
export type Priority = "low" | "normal" | "high";

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface TodoList {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}
export interface Todo {
  id: string;
  list_id: string;
  title: string;
  notes: string;
  due_at: string | null;
  priority: Priority;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface RecurringTask {
  id: string;
  name: string;
  category: "cleaning" | "maintenance";
  notes: string;
  recurrence: Recurrence;
  recurrence_interval_days: number | null;
  last_completed_at: string | null;
  next_due_at: string;
  created_at: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  created_at: string;
}
export interface ShoppingItem {
  id: string;
  list_id: string;
  name: string;
  quantity: string;
  checked: boolean;
  sort_order: number;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  notes: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string;
  created_at: string;
}

export interface Bill {
  id: string;
  name: string;
  amount_cents: number;
  category: string;
  autopay: boolean;
  notes: string;
  recurrence: Recurrence;
  recurrence_interval_days: number | null;
  last_paid_at: string | null;
  next_due_at: string;
  created_at: string;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  account_type: string;
  notes: string;
  created_at: string;
}
export interface InvestmentEntry {
  id: string;
  account_id: string;
  entry_date: string;
  balance_cents: number;
  contribution_cents: number;
  notes: string;
  created_at: string;
}
export interface InvestmentGoal {
  id: string;
  name: string;
  target_amount_cents: number;
  target_date: string | null;
  notes: string;
  created_at: string;
}

export interface Workout {
  id: string;
  workout_date: string;
  name: string;
  notes: string;
  created_at: string;
}
export interface WorkoutExercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes: string;
  sort_order: number;
}

export interface Meal {
  id: string;
  meal_date: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string;
  created_at: string;
}

export interface WeightEntry {
  id: string;
  entry_date: string;
  weight_lbs: number;
  notes: string;
  created_at: string;
}

export interface SavedFood {
  id: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
}

export interface WorkoutRoutine {
  id: string;
  name: string;
  created_at: string;
}
export interface WorkoutRoutineExercise {
  id: string;
  routine_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  sort_order: number;
}

export interface UserSettings {
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  theme: "dark" | "light";
}

export interface TodayResponse {
  todosDue: Todo[];
  billsDue: Bill[];
  tasksDue: RecurringTask[];
  eventsToday: CalendarEvent[];
}

export const api = {
  // Notes
  listNotes: () => request<Note[]>("/notes"),
  createNote: (data: { title: string; body?: string; tags?: string[] }) =>
    request<Note>("/notes", { method: "POST", body: JSON.stringify(data) }),
  updateNote: (id: string, data: Partial<Pick<Note, "title" | "body" | "tags" | "pinned">>) =>
    request<Note>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteNote: (id: string) => request<{ ok: true }>(`/notes/${id}`, { method: "DELETE" }),

  // Todos
  getTodos: () => request<{ lists: TodoList[]; todos: Todo[] }>("/todos"),
  createTodoList: (name: string) => request<TodoList>("/todos/lists", { method: "POST", body: JSON.stringify({ name }) }),
  deleteTodoList: (id: string) => request<{ ok: true }>(`/todos/lists/${id}`, { method: "DELETE" }),
  reorderTodoLists: (orderedIds: string[]) =>
    request<TodoList[]>("/todos/lists/reorder", { method: "PATCH", body: JSON.stringify({ ordered_ids: orderedIds }) }),
  reorderTodos: (listId: string, orderedIds: string[]) =>
    request<Todo[]>("/todos/reorder", {
      method: "PATCH",
      body: JSON.stringify({ list_id: listId, ordered_ids: orderedIds }),
    }),
  createTodo: (data: { list_id: string; title: string; notes?: string; due_at?: string | null; priority?: Priority }) =>
    request<Todo>("/todos", { method: "POST", body: JSON.stringify(data) }),
  updateTodo: (id: string, data: Partial<Pick<Todo, "title" | "notes" | "due_at" | "priority" | "list_id">>) =>
    request<Todo>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  completeTodo: (id: string, completed: boolean) =>
    request<Todo>(`/todos/${id}/complete`, { method: "PATCH", body: JSON.stringify({ completed }) }),
  deleteTodo: (id: string) => request<{ ok: true }>(`/todos/${id}`, { method: "DELETE" }),

  // Cleaning & maintenance
  listRecurringTasks: () => request<RecurringTask[]>("/cleaning"),
  createRecurringTask: (data: {
    name: string;
    category: "cleaning" | "maintenance";
    notes?: string;
    recurrence: Recurrence;
    recurrence_interval_days?: number | null;
    next_due_at: string;
  }) => request<RecurringTask>("/cleaning", { method: "POST", body: JSON.stringify(data) }),
  updateRecurringTask: (
    id: string,
    data: Partial<Pick<RecurringTask, "name" | "category" | "notes" | "recurrence" | "recurrence_interval_days" | "next_due_at">>
  ) => request<RecurringTask>(`/cleaning/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  completeRecurringTask: (id: string) => request<RecurringTask>(`/cleaning/${id}/complete`, { method: "POST" }),
  deleteRecurringTask: (id: string) => request<{ ok: true }>(`/cleaning/${id}`, { method: "DELETE" }),

  // Shopping
  getShopping: () => request<{ lists: ShoppingList[]; items: ShoppingItem[] }>("/shopping"),
  createShoppingList: (name: string) =>
    request<ShoppingList>("/shopping/lists", { method: "POST", body: JSON.stringify({ name }) }),
  deleteShoppingList: (id: string) => request<{ ok: true }>(`/shopping/lists/${id}`, { method: "DELETE" }),
  createShoppingItem: (data: { list_id: string; name: string; quantity?: string }) =>
    request<ShoppingItem>("/shopping/items", { method: "POST", body: JSON.stringify(data) }),
  updateShoppingItem: (id: string, data: Partial<Pick<ShoppingItem, "name" | "quantity" | "checked">>) =>
    request<ShoppingItem>(`/shopping/items/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  checkShoppingItem: (id: string, checked: boolean) =>
    request<ShoppingItem>(`/shopping/items/${id}/check`, { method: "PATCH", body: JSON.stringify({ checked }) }),
  deleteShoppingItem: (id: string) => request<{ ok: true }>(`/shopping/items/${id}`, { method: "DELETE" }),

  // Calendar
  listCalendarEvents: (from: string, to: string) =>
    request<CalendarEvent[]>(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createCalendarEvent: (data: {
    title: string;
    notes?: string;
    start_at: string;
    end_at?: string | null;
    all_day?: boolean;
    location?: string;
  }) => request<CalendarEvent>("/calendar", { method: "POST", body: JSON.stringify(data) }),
  updateCalendarEvent: (
    id: string,
    data: Partial<Pick<CalendarEvent, "title" | "notes" | "start_at" | "end_at" | "all_day" | "location">>
  ) => request<CalendarEvent>(`/calendar/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCalendarEvent: (id: string) => request<{ ok: true }>(`/calendar/${id}`, { method: "DELETE" }),

  // Bills
  listBills: () => request<Bill[]>("/bills"),
  createBill: (data: {
    name: string;
    amount_cents: number;
    category?: string;
    autopay?: boolean;
    notes?: string;
    recurrence: Recurrence;
    recurrence_interval_days?: number | null;
    next_due_at: string;
  }) => request<Bill>("/bills", { method: "POST", body: JSON.stringify(data) }),
  updateBill: (
    id: string,
    data: Partial<Pick<Bill, "name" | "amount_cents" | "category" | "autopay" | "notes" | "recurrence" | "recurrence_interval_days" | "next_due_at">>
  ) => request<Bill>(`/bills/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  payBill: (id: string) => request<Bill>(`/bills/${id}/pay`, { method: "POST" }),
  deleteBill: (id: string) => request<{ ok: true }>(`/bills/${id}`, { method: "DELETE" }),

  // Investments
  getInvestments: () =>
    request<{ accounts: InvestmentAccount[]; entries: InvestmentEntry[]; goals: InvestmentGoal[] }>("/investments"),
  createInvestmentAccount: (data: { name: string; account_type?: string; notes?: string }) =>
    request<InvestmentAccount>("/investments/accounts", { method: "POST", body: JSON.stringify(data) }),
  deleteInvestmentAccount: (id: string) => request<{ ok: true }>(`/investments/accounts/${id}`, { method: "DELETE" }),
  createInvestmentEntry: (data: {
    account_id: string;
    entry_date: string;
    balance_cents: number;
    contribution_cents?: number;
    notes?: string;
  }) => request<InvestmentEntry>("/investments/entries", { method: "POST", body: JSON.stringify(data) }),
  deleteInvestmentEntry: (id: string) => request<{ ok: true }>(`/investments/entries/${id}`, { method: "DELETE" }),
  createInvestmentGoal: (data: { name: string; target_amount_cents: number; target_date?: string | null; notes?: string }) =>
    request<InvestmentGoal>("/investments/goals", { method: "POST", body: JSON.stringify(data) }),
  deleteInvestmentGoal: (id: string) => request<{ ok: true }>(`/investments/goals/${id}`, { method: "DELETE" }),

  // Workouts
  getWorkouts: () => request<{ workouts: Workout[]; exercises: WorkoutExercise[] }>("/workouts"),
  createWorkout: (data: { workout_date: string; name?: string; notes?: string }) =>
    request<Workout>("/workouts", { method: "POST", body: JSON.stringify(data) }),
  updateWorkout: (id: string, data: Partial<Pick<Workout, "name" | "notes">>) =>
    request<Workout>(`/workouts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWorkout: (id: string) => request<{ ok: true }>(`/workouts/${id}`, { method: "DELETE" }),
  createWorkoutExercise: (
    workoutId: string,
    data: { name: string; sets?: number; reps?: number; weight?: number; notes?: string }
  ) => request<WorkoutExercise>(`/workouts/${workoutId}/exercises`, { method: "POST", body: JSON.stringify(data) }),
  deleteWorkoutExercise: (id: string) => request<{ ok: true }>(`/workouts/exercises/${id}`, { method: "DELETE" }),

  // Workout routines
  getRoutines: () => request<{ routines: WorkoutRoutine[]; exercises: WorkoutRoutineExercise[] }>("/routines"),
  createRoutine: (name: string) => request<WorkoutRoutine>("/routines", { method: "POST", body: JSON.stringify({ name }) }),
  deleteRoutine: (id: string) => request<{ ok: true }>(`/routines/${id}`, { method: "DELETE" }),
  createRoutineExercise: (routineId: string, data: { name: string; sets?: number; reps?: number; weight?: number }) =>
    request<WorkoutRoutineExercise>(`/routines/${routineId}/exercises`, { method: "POST", body: JSON.stringify(data) }),
  deleteRoutineExercise: (id: string) => request<{ ok: true }>(`/routines/exercises/${id}`, { method: "DELETE" }),

  // Meals
  listMeals: (from: string, to: string) =>
    request<Meal[]>(`/meals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createMeal: (data: {
    meal_date: string;
    name: string;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    notes?: string;
  }) => request<Meal>("/meals", { method: "POST", body: JSON.stringify(data) }),
  deleteMeal: (id: string) => request<{ ok: true }>(`/meals/${id}`, { method: "DELETE" }),

  // Every distinct day a meal was logged — for the food streak.
  listMealDates: () => request<string[]>("/meals/dates"),

  // Saved foods — for one-tap re-logging of things eaten often
  listSavedFoods: () => request<SavedFood[]>("/meals/saved"),
  createSavedFood: (data: { name: string; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }) =>
    request<SavedFood>("/meals/saved", { method: "POST", body: JSON.stringify(data) }),
  deleteSavedFood: (id: string) => request<{ ok: true }>(`/meals/saved/${id}`, { method: "DELETE" }),

  // Weight tracker
  listWeightEntries: () => request<WeightEntry[]>("/weight"),
  createWeightEntry: (data: { entry_date: string; weight_lbs: number; notes?: string }) =>
    request<WeightEntry>("/weight", { method: "POST", body: JSON.stringify(data) }),
  deleteWeightEntry: (id: string) => request<{ ok: true }>(`/weight/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<UserSettings>("/settings"),
  updateSettings: (data: Partial<UserSettings>) =>
    request<UserSettings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),

  // Today dashboard
  getToday: () => request<TodayResponse>("/today"),
};
