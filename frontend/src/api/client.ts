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
async function reauthRedirectDetected() {
  const last = Number(sessionStorage.getItem(REAUTH_RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < REAUTH_RELOAD_GUARD_COOLDOWN_MS) return;
  sessionStorage.setItem(REAUTH_RELOAD_GUARD_KEY, String(Date.now()));
  // The service worker's navigateFallback answers every navigation — including this
  // reload — from its own cached app shell, never touching the network (confirmed: a
  // plain reload() gets `fromServiceWorker: true`). Without unregistering first, this
  // "force a real navigation" recovery never actually reaches Authentik at all — it
  // just re-runs the same stale, still-unauthenticated session against the cached
  // shell, forever, since the 30s guard above stops it from retrying again. A fresh
  // service worker registers itself again on the next load (see main.tsx).
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  window.location.reload();
}

export const NOTES_UNLOCK_KEY = "anchor-notes-unlock";
const NOTES_LAST_ACTIVITY_KEY = "anchor-notes-last-activity";
const NOTES_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

// Throttled to avoid a sessionStorage write on every scroll/mousemove tick — activity
// tracking only needs roughly-current, not exact-to-the-millisecond.
let lastActivityWrite = 0;
export function recordNotesActivity() {
  const now = Date.now();
  if (now - lastActivityWrite < 1000) return;
  lastActivityWrite = now;
  sessionStorage.setItem(NOTES_LAST_ACTIVITY_KEY, String(now));
}

// Deliberately NOT gated on whether an unlock token currently exists — a note locked
// just now, in this same view, has visible content on screen with no token to expire
// (locking doesn't require a PIN-proven token in the first place), so this has to answer
// "has it been idle too long" on its own, independent of token bookkeeping. Exported so
// pages holding locked-note content on screen can proactively re-gate themselves on a
// timer, not just fail the next request that happens to fire.
export function isNotesUnlockStale(): boolean {
  const last = Number(sessionStorage.getItem(NOTES_LAST_ACTIVITY_KEY) ?? 0);
  return Date.now() - last > NOTES_INACTIVITY_TIMEOUT_MS;
}

function currentlyUnlocked(): boolean {
  return !isNotesUnlockStale() && !!sessionStorage.getItem(NOTES_UNLOCK_KEY);
}

// The server only redacts a locked note's body/tags based on whether *that specific
// request* proved PIN knowledge — correct for a live network call, but a response can
// also come from the offline service-worker cache (see vite.config.ts), fetched at some
// earlier moment when the note genuinely was unlocked. Replayed later — after the idle
// timer should have re-locked it, or in a context that was never unlocked at all — that
// stale response would still carry the real content. This re-derives the lock decision
// from the *current* client-side unlock state on every read, regardless of where the
// response came from, so a stale cached payload can never show more than it should.
function enforceNoteLock(note: Note): Note {
  if (!note.locked || currentlyUnlocked()) return note;
  return { ...note, requires_unlock: true, body: "", tags: [] };
}

// Remembers which note was open last so tapping the Notes tab can jump straight back into
// it instead of always landing on the list — localStorage (not sessionStorage) since this
// should survive fully closing and reopening the app, same as a native notes app would.
// Only the id and lock flag are cached, never note content.
const LAST_NOTE_KEY = "anchor-last-note";

export function recordLastNote(id: string, locked: boolean) {
  localStorage.setItem(LAST_NOTE_KEY, JSON.stringify({ id, locked }));
}

export function getLastNote(): { id: string; locked: boolean } | null {
  try {
    const raw = localStorage.getItem(LAST_NOTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === "string" && typeof parsed?.locked === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearLastNote(id?: string) {
  if (id && getLastNote()?.id !== id) return;
  localStorage.removeItem(LAST_NOTE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (isNotesUnlockStale()) sessionStorage.removeItem(NOTES_UNLOCK_KEY);
  const unlockToken = sessionStorage.getItem(NOTES_UNLOCK_KEY);
  const res = await fetch(`/api${path}`, {
    ...init,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(unlockToken ? { "X-notes-unlock": unlockToken } : {}),
      ...init?.headers,
    },
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
  locked: boolean;
  requires_unlock: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoteImage {
  id: string;
  note_id: string;
  mime_type: string;
  created_at: string;
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
  created_at?: string;
  // Present (and "google") only on events read in from a connected Google Calendar —
  // those are display-only imports, never editable/deletable from this app.
  source?: "google";
  // The source Google calendar's own color (hex), when known — lets a friend's shared
  // calendar visually stand apart from the user's own. Absent for Anchor's own events.
  color?: string | null;
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
export type ExerciseType = "strength" | "cardio";
export interface WorkoutExercise {
  id: string;
  workout_id: string;
  name: string;
  exercise_type: ExerciseType;
  notes: string;
  sort_order: number;
}
export interface WorkoutSet {
  id: string;
  exercise_id: string;
  set_index: number;
  weight: number | null;
  reps: number | null;
  distance_miles: number | null;
  duration_seconds: number | null;
  completed: boolean;
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

export interface Habit {
  id: string;
  name: string;
  target_per_day: number;
  sort_order: number;
  created_at: string;
}
export interface HabitLog {
  habit_id: string;
  log_date: string;
  count: number;
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
  goal_weight_lbs: number | null;
  has_notes_pin: boolean;
  has_api_token: boolean;
  theme: "dark" | "light";
}

export interface WeekRecap {
  todosCompleted: number;
  workoutsLogged: number;
  billsPaid: number;
  billsPaidCents: number;
  tasksCompleted: number;
}

export interface TodayResponse {
  todosDue: Todo[];
  billsDue: Bill[];
  tasksDue: RecurringTask[];
  eventsToday: CalendarEvent[];
  weekRecap: WeekRecap;
}

export const api = {
  // Notes
  listNotes: () => request<Note[]>("/notes").then((notes) => notes.map(enforceNoteLock)),
  getNote: (id: string) => request<Note>(`/notes/${id}`).then(enforceNoteLock),
  createNote: (data: { title: string; body?: string; tags?: string[] }) =>
    request<Note>("/notes", { method: "POST", body: JSON.stringify(data) }),
  updateNote: (id: string, data: Partial<Pick<Note, "title" | "body" | "tags" | "pinned" | "locked">>) =>
    request<Note>(`/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) }).then(enforceNoteLock),
  deleteNote: (id: string) => request<{ ok: true }>(`/notes/${id}`, { method: "DELETE" }),
  reorderNotes: (orderedIds: string[]) =>
    request<Note[]>("/notes/reorder", { method: "PATCH", body: JSON.stringify({ ordered_ids: orderedIds }) }).then((notes) =>
      notes.map(enforceNoteLock)
    ),
  unlockNotes: (pin: string) => request<{ token: string }>("/notes/unlock", { method: "POST", body: JSON.stringify({ pin }) }),

  // Note images (pasted screenshots/photos attached to a note)
  listNoteImages: (noteId: string) => request<NoteImage[]>(`/notes/${noteId}/images`),
  uploadNoteImage: (noteId: string, dataUrl: string) =>
    request<NoteImage>(`/notes/${noteId}/images`, { method: "POST", body: JSON.stringify({ data_url: dataUrl }) }),
  deleteNoteImage: (id: string) => request<{ ok: true }>(`/notes/images/${id}`, { method: "DELETE" }),

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

  // Google Calendar — read-only import, never writes back to Google. "Connect" is a real
  // page navigation (through Google's own consent screen), not a fetch, so it isn't
  // exposed here as a request()-based call.
  getGoogleCalendarStatus: () => request<{ connected: boolean; configured: boolean }>("/calendar/google/status"),
  listGoogleCalendarEvents: (from: string, to: string) =>
    request<CalendarEvent[]>(`/calendar/google/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  disconnectGoogleCalendar: () => request<{ connected: false }>("/calendar/google/disconnect", { method: "DELETE" }),
  listGoogleCalendars: () =>
    request<{ id: string; name: string; primary: boolean; color: string | null; selected: boolean }[]>(
      "/calendar/google/calendars"
    ),
  updateGoogleCalendars: (calendarIds: string[]) =>
    request<{ calendar_ids: string[] }>("/calendar/google/calendars", {
      method: "PATCH",
      body: JSON.stringify({ calendar_ids: calendarIds }),
    }),

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
  getWorkouts: () =>
    request<{ workouts: Workout[]; exercises: WorkoutExercise[]; sets: WorkoutSet[] }>("/workouts"),
  createWorkout: (data: { workout_date: string; name?: string; notes?: string }) =>
    request<Workout>("/workouts", { method: "POST", body: JSON.stringify(data) }),
  updateWorkout: (id: string, data: Partial<Pick<Workout, "name" | "notes">>) =>
    request<Workout>(`/workouts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWorkout: (id: string) => request<{ ok: true }>(`/workouts/${id}`, { method: "DELETE" }),
  createWorkoutExercise: (workoutId: string, data: { name: string; notes?: string; exercise_type?: ExerciseType }) =>
    request<WorkoutExercise>(`/workouts/${workoutId}/exercises`, { method: "POST", body: JSON.stringify(data) }),
  deleteWorkoutExercise: (id: string) => request<{ ok: true }>(`/workouts/exercises/${id}`, { method: "DELETE" }),
  createWorkoutSet: (
    exerciseId: string,
    data: {
      weight?: number | null;
      reps?: number | null;
      distance_miles?: number | null;
      duration_seconds?: number | null;
      completed?: boolean;
    }
  ) => request<WorkoutSet>(`/workouts/exercises/${exerciseId}/sets`, { method: "POST", body: JSON.stringify(data) }),
  updateWorkoutSet: (
    id: string,
    data: Partial<{
      weight: number | null;
      reps: number | null;
      distance_miles: number | null;
      duration_seconds: number | null;
      completed: boolean;
    }>
  ) => request<WorkoutSet>(`/workouts/sets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteWorkoutSet: (id: string) => request<{ ok: true }>(`/workouts/sets/${id}`, { method: "DELETE" }),

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
  updateMeal: (
    id: string,
    data: Partial<Pick<Meal, "name" | "calories" | "protein_g" | "carbs_g" | "fat_g" | "notes" | "meal_date">>
  ) => request<Meal>(`/meals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
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

  // Habits
  getHabits: () => request<{ habits: Habit[]; logs: HabitLog[] }>("/habits"),
  createHabit: (data: { name: string; target_per_day?: number }) =>
    request<Habit>("/habits", { method: "POST", body: JSON.stringify(data) }),
  updateHabit: (id: string, data: Partial<Pick<Habit, "name" | "target_per_day" | "sort_order">>) =>
    request<Habit>(`/habits/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteHabit: (id: string) => request<{ ok: true }>(`/habits/${id}`, { method: "DELETE" }),
  logHabit: (id: string, date: string) =>
    request<HabitLog>(`/habits/${id}/log`, { method: "POST", body: JSON.stringify({ date }) }),

  // Settings
  getSettings: () => request<UserSettings>("/settings"),
  updateSettings: (data: Partial<UserSettings>) =>
    request<UserSettings>("/settings", { method: "PATCH", body: JSON.stringify(data) }),
  setNotesPin: (pin: string, currentPin?: string) =>
    request<{ has_notes_pin: boolean }>("/settings/notes-pin", {
      method: "POST",
      body: JSON.stringify({ pin, current_pin: currentPin }),
    }),
  clearNotesPin: (currentPin: string) =>
    request<{ has_notes_pin: boolean }>("/settings/notes-pin", {
      method: "DELETE",
      body: JSON.stringify({ current_pin: currentPin }),
    }),
  generateApiToken: () => request<{ token: string }>("/settings/api-token", { method: "POST" }),
  revokeApiToken: () => request<{ has_api_token: boolean }>("/settings/api-token", { method: "DELETE" }),

  // Today dashboard
  getToday: () => request<TodayResponse>("/today"),

  // Full data export/restore — export triggers a real browser file download rather than
  // going through the JSON-parsing request() helper above, since the point is to hand
  // the user back a file, not a parsed object.
  downloadBackup: async (): Promise<void> => {
    const unlockToken = sessionStorage.getItem(NOTES_UNLOCK_KEY);
    const res = await fetch("/api/backup/export", {
      redirect: "manual",
      headers: unlockToken ? { "X-notes-unlock": unlockToken } : {},
    });
    if (res.type === "opaqueredirect") {
      reauthRedirectDetected();
      throw new Error("Session expired, reloading…");
    }
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition");
    const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? "anchor-backup.json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  restoreBackup: (data: unknown) => request<{ ok: true }>("/backup/import", { method: "POST", body: JSON.stringify(data) }),
};
