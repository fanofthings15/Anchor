import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type Meal,
  type SavedFood,
  type UserSettings,
  type WeightEntry,
  type Workout,
  type WorkoutExercise,
  type WorkoutRoutine,
  type WorkoutRoutineExercise,
} from "../api/client";
import { addDaysISO, buildMonthGrid, computeStreaks, sameDay, todayISO } from "../calendarUtils";

type Tab = "workouts" | "food" | "weight";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const tooltipStyle = {
  background: "var(--bg-raised)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
};

const axisTick = { fill: "var(--text-dim)", fontSize: 11 };

function isTab(value: string | null): value is Tab {
  return value === "workouts" || value === "food" || value === "weight";
}

export default function Workouts() {
  // Reads the initial tab from ?tab=food (etc.) so a link from elsewhere in the app — the
  // Today page's "Log food"/"Log workout" reminders — can land directly on the right tab
  // instead of always dropping onto the default "Workouts" one.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : "workouts");

  function selectTab(next: Tab) {
    setTab(next);
    setSearchParams(next === "workouts" ? {} : { tab: next }, { replace: true });
  }

  return (
    <div>
      <h1>Workouts</h1>
      <div className="tabs">
        <button type="button" className={`tab ${tab === "workouts" ? "active" : ""}`} onClick={() => selectTab("workouts")}>
          Workouts
        </button>
        <button type="button" className={`tab ${tab === "food" ? "active" : ""}`} onClick={() => selectTab("food")}>
          Food
        </button>
        <button type="button" className={`tab ${tab === "weight" ? "active" : ""}`} onClick={() => selectTab("weight")}>
          Weight
        </button>
      </div>
      {tab === "workouts" ? <WorkoutsTab /> : tab === "food" ? <FoodTab /> : <WeightTab />}
    </div>
  );
}

function cellDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Shared by the Workouts and Food tabs — a streak stat header plus a month grid where
// every day is clickable (not just ones with data): pick an empty day to log something
// for it, or a filled one to see what's already there. `onSelectDay` is responsible for
// deciding which of those two things happens, since that differs per caller.
function StreakCalendar({
  activeDates,
  selectedDate,
  onSelectDay,
}: {
  activeDates: Set<string>;
  selectedDate?: string;
  onSelectDay: (dateStr: string) => void;
}) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = new Date();

  const { current, longest } = useMemo(() => computeStreaks(activeDates), [activeDates]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "center", gap: 32, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: current > 0 ? "var(--success)" : "var(--text)" }}>
            {current > 0 ? "🔥 " : ""}
            {current}
          </div>
          <div className="text-dim" style={{ fontSize: 12 }}>
            Day streak
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{longest}</div>
          <div className="text-dim" style={{ fontSize: 12 }}>
            Longest streak
          </div>
        </div>
      </div>

      <div className="calendar-nav" style={{ marginBottom: 10 }}>
        <button type="button" className="btn" onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month">
          ‹
        </button>
        <span className="calendar-title">{viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button type="button" className="btn" onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {weeks.flat().map((cell, i) => {
          const dateStr = cellDateStr(cell.date);
          const hasData = activeDates.has(dateStr);
          const isToday = sameDay(cell.date, today);
          const isSelected = selectedDate === dateStr;
          return (
            <button
              key={i}
              type="button"
              className={`calendar-cell workout-cal-cell${cell.inMonth ? "" : " outside"}${isToday ? " is-today" : ""}${
                hasData ? " has-workout" : ""
              }${isSelected ? " is-selected" : ""}`}
              onClick={() => onSelectDay(dateStr)}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorkoutsTab() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([]);
  const [routineExercises, setRoutineExercises] = useState<WorkoutRoutineExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState(() => todayISO());
  const [quickName, setQuickName] = useState("");
  const [startRoutineId, setStartRoutineId] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [showRoutines, setShowRoutines] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [workoutData, routineData] = await Promise.all([api.getWorkouts(), api.getRoutines()]);
      setWorkouts(workoutData.workouts);
      setExercises(workoutData.exercises);
      setRoutines(routineData.routines);
      setRoutineExercises(routineData.exercises);
    } finally {
      setLoading(false);
    }
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickDate) return;
    const workout = await api.createWorkout({ workout_date: quickDate, name: quickName.trim() || undefined });
    setWorkouts((prev) => [workout, ...prev].sort((a, b) => b.workout_date.localeCompare(a.workout_date)));
    setQuickName("");
    setExpandedId(workout.id);
  }

  // Applies a saved routine to a brand-new workout — creates the workout, then bulk-adds
  // every exercise from the routine template so nothing needs retyping.
  async function startFromRoutine(e: React.FormEvent) {
    e.preventDefault();
    if (!quickDate || !startRoutineId) return;
    const routine = routines.find((r) => r.id === startRoutineId);
    if (!routine) return;
    const workout = await api.createWorkout({ workout_date: quickDate, name: routine.name });
    setWorkouts((prev) => [workout, ...prev].sort((a, b) => b.workout_date.localeCompare(a.workout_date)));
    const templateExercises = routineExercises
      .filter((ex) => ex.routine_id === startRoutineId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const created = await Promise.all(
      templateExercises.map((ex) =>
        api.createWorkoutExercise(workout.id, {
          name: ex.name,
          sets: ex.sets ?? undefined,
          reps: ex.reps ?? undefined,
          weight: ex.weight ?? undefined,
        })
      )
    );
    setExercises((prev) => [...prev, ...created]);
    setExpandedId(workout.id);
  }

  async function remove(id: string) {
    await api.deleteWorkout(id);
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    setExercises((prev) => prev.filter((ex) => ex.workout_id !== id));
  }

  async function addExercise(workoutId: string, data: { name: string; sets?: number; reps?: number; weight?: number }) {
    const exercise = await api.createWorkoutExercise(workoutId, data);
    setExercises((prev) => [...prev, exercise]);
  }

  async function removeExercise(id: string) {
    await api.deleteWorkoutExercise(id);
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
  }

  async function saveAsRoutine(workoutId: string, name: string) {
    const routine = await api.createRoutine(name);
    setRoutines((prev) => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)));
    const workoutExercises = exercises.filter((ex) => ex.workout_id === workoutId).sort((a, b) => a.sort_order - b.sort_order);
    const created = await Promise.all(
      workoutExercises.map((ex) =>
        api.createRoutineExercise(routine.id, {
          name: ex.name,
          sets: ex.sets ?? undefined,
          reps: ex.reps ?? undefined,
          weight: ex.weight ?? undefined,
        })
      )
    );
    setRoutineExercises((prev) => [...prev, ...created]);
  }

  async function createRoutine(e: React.FormEvent) {
    e.preventDefault();
    const name = newRoutineName.trim();
    if (!name) return;
    setNewRoutineName("");
    const routine = await api.createRoutine(name);
    setRoutines((prev) => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function deleteRoutine(id: string) {
    await api.deleteRoutine(id);
    setRoutines((prev) => prev.filter((r) => r.id !== id));
    setRoutineExercises((prev) => prev.filter((ex) => ex.routine_id !== id));
    if (startRoutineId === id) setStartRoutineId("");
  }

  async function addRoutineExercise(routineId: string, data: { name: string; sets?: number; reps?: number; weight?: number }) {
    const exercise = await api.createRoutineExercise(routineId, data);
    setRoutineExercises((prev) => [...prev, exercise]);
  }

  async function deleteRoutineExercise(id: string) {
    await api.deleteRoutineExercise(id);
    setRoutineExercises((prev) => prev.filter((ex) => ex.id !== id));
  }

  const exerciseNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const ex of exercises) {
      const key = ex.name.trim().toLowerCase();
      if (key && !names.has(key)) names.set(key, ex.name.trim());
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [exercises]);

  const workoutDateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) m.set(w.id, w.workout_date);
    return m;
  }, [workouts]);

  const progressData = useMemo(() => {
    if (!selectedExerciseName) return [];
    const key = selectedExerciseName.toLowerCase();
    return exercises
      .filter((ex) => ex.name.trim().toLowerCase() === key && ex.weight != null)
      .map((ex) => ({ date: workoutDateById.get(ex.workout_id) ?? "", weight: ex.weight as number }))
      .filter((p) => p.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [exercises, selectedExerciseName, workoutDateById]);

  // A day with an existing workout expands and scrolls to it (view what happened); an
  // empty day just sets the log form's date and scrolls there instead (add something).
  function selectCalendarDay(dateStr: string) {
    setQuickDate(dateStr);
    const match = workouts.find((w) => w.workout_date === dateStr);
    if (match) {
      setExpandedId(match.id);
      document.getElementById(`workout-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      document.getElementById("workout-quick-add")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const workoutDates = useMemo(() => new Set(workouts.map((w) => w.workout_date)), [workouts]);

  return (
    <div>
      <StreakCalendar activeDates={workoutDates} selectedDate={quickDate} onSelectDay={selectCalendarDay} />

      <form id="workout-quick-add" className="quick-add" onSubmit={quickAdd} style={{ flexWrap: "wrap" }}>
        <input type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} required />
        <input
          type="text"
          placeholder="Workout name (optional)"
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <button className="btn btn-primary" type="submit">
          Log workout
        </button>
      </form>

      {routines.length > 0 && (
        <form className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }} onSubmit={startFromRoutine}>
          <select value={startRoutineId} onChange={(e) => setStartRoutineId(e.target.value)} style={{ flex: "1 1 160px" }}>
            <option value="">Start from a routine…</option>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button className="btn" type="submit" disabled={!startRoutineId}>
            Start
          </button>
        </form>
      )}

      <div className="row-between" style={{ marginBottom: showRoutines ? 10 : 16 }}>
        <h2 style={{ margin: 0 }}>Routines</h2>
        <button type="button" className="btn-icon" onClick={() => setShowRoutines((v) => !v)} aria-label="Toggle routines">
          {showRoutines ? "▾" : "▸"}
        </button>
      </div>

      {showRoutines && (
        <div style={{ marginBottom: 16 }}>
          <form className="quick-add" onSubmit={createRoutine}>
            <input
              type="text"
              placeholder="New routine name…"
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">
              Create
            </button>
          </form>
          {routines.length === 0 ? (
            <div className="empty-state">No routines yet — create one above, or save an existing workout as one below.</div>
          ) : (
            <div className="list">
              {routines.map((r) => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  exercises={routineExercises.filter((ex) => ex.routine_id === r.id).sort((a, b) => a.sort_order - b.sort_order)}
                  onAddExercise={(data) => addRoutineExercise(r.id, data)}
                  onDeleteExercise={deleteRoutineExercise}
                  onDelete={() => deleteRoutine(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {exerciseNames.length > 0 && (
        <div className="card">
          <div className="field" style={{ marginBottom: selectedExerciseName ? 12 : 0 }}>
            <label htmlFor="exercise-select">Progress chart</label>
            <select
              id="exercise-select"
              value={selectedExerciseName ?? ""}
              onChange={(e) => setSelectedExerciseName(e.target.value || null)}
            >
              <option value="">Select an exercise…</option>
              {exerciseNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {selectedExerciseName &&
            (progressData.length === 0 ? (
              <div className="empty-state">No weight data logged for {selectedExerciseName} yet.</div>
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={progressData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--border)" tick={axisTick} tickFormatter={shortDate} />
                    <YAxis stroke="var(--border)" tick={axisTick} width={40} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="Weight"
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--accent)", stroke: "var(--bg-card)", strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--bg-card)", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : workouts.length === 0 ? (
        <div className="empty-state">No workouts logged yet — add one above.</div>
      ) : (
        <div className="list">
          {workouts.map((w) => (
            <WorkoutCard
              key={w.id}
              workout={w}
              exercises={exercises.filter((ex) => ex.workout_id === w.id).sort((a, b) => a.sort_order - b.sort_order)}
              expanded={expandedId === w.id}
              onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)}
              onDelete={() => remove(w.id)}
              onAddExercise={(data) => addExercise(w.id, data)}
              onDeleteExercise={removeExercise}
              onSaveAsRoutine={(name) => saveAsRoutine(w.id, name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoutineCard({
  routine,
  exercises,
  onAddExercise,
  onDeleteExercise,
  onDelete,
}: {
  routine: WorkoutRoutine;
  exercises: WorkoutRoutineExercise[];
  onAddExercise: (data: { name: string; sets?: number; reps?: number; weight?: number }) => void;
  onDeleteExercise: (id: string) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddExercise({
      name: trimmed,
      sets: sets ? Number(sets) : undefined,
      reps: reps ? Number(reps) : undefined,
      weight: weight ? Number(weight) : undefined,
    });
    setName("");
    setSets("");
    setReps("");
    setWeight("");
  }

  return (
    <div className="card">
      <div className="row-between">
        <button
          type="button"
          className="row"
          style={{ background: "none", border: "none", padding: 0, flex: 1, textAlign: "left" }}
          onClick={() => setExpanded((v) => !v)}
        >
          <strong>{routine.name}</strong>
          <span className="chip">{exercises.length} exercises</span>
        </button>
        <button type="button" className="btn-icon text-danger" onClick={onDelete} aria-label={`Delete routine ${routine.name}`}>
          ✕
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {exercises.length === 0 ? (
            <div className="empty-state">No exercises yet.</div>
          ) : (
            <div className="list">
              {exercises.map((ex) => (
                <div className="row-between" key={ex.id}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <strong>{ex.name}</strong>
                    {ex.sets != null && <span className="chip">{ex.sets} sets</span>}
                    {ex.reps != null && <span className="chip">{ex.reps} reps</span>}
                    {ex.weight != null && <span className="chip">{ex.weight} lb</span>}
                  </div>
                  <button
                    type="button"
                    className="btn-icon text-danger"
                    onClick={() => onDeleteExercise(ex.id)}
                    aria-label="Delete exercise"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <form className="row" style={{ flexWrap: "wrap", marginTop: 10, gap: 8 }} onSubmit={submit}>
            <input
              type="text"
              placeholder="Exercise name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: "1 1 140px" }}
            />
            <input type="number" placeholder="Sets" value={sets} onChange={(e) => setSets(e.target.value)} style={{ width: 72 }} />
            <input type="number" placeholder="Reps" value={reps} onChange={(e) => setReps(e.target.value)} style={{ width: 72 }} />
            <input
              type="number"
              placeholder="Weight"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              style={{ width: 84 }}
            />
            <button className="btn btn-primary" type="submit">
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function WorkoutCard({
  workout,
  exercises,
  expanded,
  onToggle,
  onDelete,
  onAddExercise,
  onDeleteExercise,
  onSaveAsRoutine,
}: {
  workout: Workout;
  exercises: WorkoutExercise[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddExercise: (data: { name: string; sets?: number; reps?: number; weight?: number }) => void;
  onDeleteExercise: (id: string) => void;
  onSaveAsRoutine: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [routineName, setRoutineName] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddExercise({
      name: trimmed,
      sets: sets ? Number(sets) : undefined,
      reps: reps ? Number(reps) : undefined,
      weight: weight ? Number(weight) : undefined,
    });
    setName("");
    setSets("");
    setReps("");
    setWeight("");
  }

  function openSaveAsRoutine() {
    setRoutineName(workout.name || "Routine");
    setSavingRoutine(true);
  }

  function submitSaveAsRoutine(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = routineName.trim();
    if (!trimmed) return;
    onSaveAsRoutine(trimmed);
    setSavingRoutine(false);
  }

  return (
    <div className="card" id={`workout-${workout.id}`}>
      <div className="row-between">
        <button
          type="button"
          className="row"
          style={{ background: "none", border: "none", padding: 0, flex: 1, textAlign: "left" }}
          onClick={onToggle}
        >
          <strong>{workout.name || "Workout"}</strong>
          <span className="chip">{workout.workout_date}</span>
        </button>
        <button type="button" className="btn-icon text-danger" onClick={onDelete} aria-label="Delete workout">
          ✕
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {exercises.length === 0 ? (
            <div className="empty-state">No exercises yet.</div>
          ) : (
            <div className="list">
              {exercises.map((ex) => (
                <div className="row-between" key={ex.id}>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <strong>{ex.name}</strong>
                    {ex.sets != null && <span className="chip">{ex.sets} sets</span>}
                    {ex.reps != null && <span className="chip">{ex.reps} reps</span>}
                    {ex.weight != null && <span className="chip">{ex.weight} lb</span>}
                  </div>
                  <button
                    type="button"
                    className="btn-icon text-danger"
                    onClick={() => onDeleteExercise(ex.id)}
                    aria-label="Delete exercise"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <form className="row" style={{ flexWrap: "wrap", marginTop: 10, gap: 8 }} onSubmit={submit}>
            <input
              type="text"
              placeholder="Exercise name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ flex: "1 1 140px" }}
            />
            <input type="number" placeholder="Sets" value={sets} onChange={(e) => setSets(e.target.value)} style={{ width: 72 }} />
            <input type="number" placeholder="Reps" value={reps} onChange={(e) => setReps(e.target.value)} style={{ width: 72 }} />
            <input
              type="number"
              placeholder="Weight"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              style={{ width: 84 }}
            />
            <button className="btn btn-primary" type="submit">
              Add
            </button>
          </form>

          {exercises.length > 0 &&
            (savingRoutine ? (
              <form className="quick-add" style={{ marginTop: 10 }} onSubmit={submitSaveAsRoutine}>
                <input
                  type="text"
                  placeholder="Routine name…"
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-primary" type="submit">
                  Save
                </button>
              </form>
            ) : (
              <button type="button" className="btn" style={{ marginTop: 10 }} onClick={openSaveAsRoutine}>
                Save as routine
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function FoodTab() {
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [trendMeals, setTrendMeals] = useState<Meal[]>([]);
  const [selectedDayMeals, setSelectedDayMeals] = useState<Meal[]>([]);
  const [mealDates, setMealDates] = useState<string[]>([]);
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saveAsFood, setSaveAsFood] = useState(false);

  const rangeStart = useMemo(() => addDaysISO(todayISO(), -13), []);
  const rangeEnd = useMemo(() => todayISO(), []);

  useEffect(() => {
    load();
  }, []);

  // The day being viewed can be backdated arbitrarily far — well outside the fixed
  // 14-day trend window above — so it's fetched separately, scoped to exactly that one
  // date, every time the date picker changes. Without this, picking anything older than
  // 14 days would silently show nothing (and lose the entry entirely on next reload).
  useEffect(() => {
    loadSelectedDay();
  }, [selectedDate]);

  async function load() {
    setLoading(true);
    try {
      const [mealList, userSettings, foods, dates] = await Promise.all([
        api.listMeals(rangeStart, rangeEnd),
        api.getSettings(),
        api.listSavedFoods(),
        api.listMealDates(),
      ]);
      setTrendMeals(mealList);
      setSettings(userSettings);
      setSavedFoods(foods);
      setMealDates(dates);
    } finally {
      setLoading(false);
    }
  }

  // Refetched (rather than patched locally) after any add/remove — the streak only cares
  // about distinct days, and correctly dropping a day when its last meal is deleted needs
  // knowing whether any other meal still exists on that date.
  function refreshMealDates() {
    api.listMealDates().then(setMealDates);
  }

  async function loadSelectedDay() {
    setDayLoading(true);
    try {
      setSelectedDayMeals(await api.listMeals(selectedDate, selectedDate));
    } finally {
      setDayLoading(false);
    }
  }

  // Keeps the 14-day trend chart in sync too, but only when the affected date actually
  // falls inside that window — no need to refetch it for an old backdated entry.
  function refreshTrendIfInRange(date: string) {
    if (date >= rangeStart && date <= rangeEnd) {
      api.listMeals(rangeStart, rangeEnd).then(setTrendMeals);
    }
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const data = {
      calories: calories ? Number(calories) : undefined,
      protein_g: protein ? Number(protein) : undefined,
      carbs_g: carbs ? Number(carbs) : undefined,
      fat_g: fat ? Number(fat) : undefined,
    };
    const meal = await api.createMeal({ meal_date: selectedDate, name: trimmed, ...data });
    setSelectedDayMeals((prev) => [meal, ...prev]);
    refreshTrendIfInRange(selectedDate);
    refreshMealDates();
    if (saveAsFood) {
      const food = await api.createSavedFood({ name: trimmed, ...data });
      setSavedFoods((prev) => [...prev, food].sort((a, b) => a.name.localeCompare(b.name)));
    }
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setSaveAsFood(false);
  }

  async function quickLogSavedFood(food: SavedFood) {
    const meal = await api.createMeal({
      meal_date: selectedDate,
      name: food.name,
      calories: food.calories ?? undefined,
      protein_g: food.protein_g ?? undefined,
      carbs_g: food.carbs_g ?? undefined,
      fat_g: food.fat_g ?? undefined,
    });
    setSelectedDayMeals((prev) => [meal, ...prev]);
    refreshTrendIfInRange(selectedDate);
    refreshMealDates();
  }

  async function removeSavedFood(id: string) {
    await api.deleteSavedFood(id);
    setSavedFoods((prev) => prev.filter((f) => f.id !== id));
  }

  async function remove(id: string) {
    await api.deleteMeal(id);
    setSelectedDayMeals((prev) => prev.filter((m) => m.id !== id));
    refreshTrendIfInRange(selectedDate);
    refreshMealDates();
  }

  const mealDateSet = useMemo(() => new Set(mealDates), [mealDates]);

  // A day with meals already logged just switches the whole page's date context to it
  // (the existing Date field/meal list/add form below all already react to selectedDate);
  // an empty day does the same thing, which is exactly "let me add for this day" here.
  function selectCalendarDay(dateStr: string) {
    setSelectedDate(dateStr);
    document.getElementById("food-day-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const dayMeals = useMemo(
    () => [...selectedDayMeals].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [selectedDayMeals]
  );

  const dailyTotals = useMemo(() => {
    const days: { date: string; calories: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDaysISO(rangeEnd, -i);
      const total = trendMeals.filter((m) => m.meal_date === date).reduce((sum, m) => sum + (m.calories ?? 0), 0);
      days.push({ date, calories: total });
    }
    return days;
  }, [trendMeals, rangeEnd]);

  const macroTotals = useMemo(
    () =>
      dayMeals.reduce(
        (acc, m) => ({
          protein: acc.protein + (m.protein_g ?? 0),
          carbs: acc.carbs + (m.carbs_g ?? 0),
          fat: acc.fat + (m.fat_g ?? 0),
        }),
        { protein: 0, carbs: 0, fat: 0 }
      ),
    [dayMeals]
  );

  const calorieTarget = settings?.calorie_target ?? null;

  return (
    <div>
      <StreakCalendar activeDates={mealDateSet} selectedDate={selectedDate} onSelectDay={selectCalendarDay} />

      <div id="food-day-view" className="field">
        <label htmlFor="meal-date">Date</label>
        <input id="meal-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
      </div>

      {savedFoods.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="text-dim" style={{ fontSize: 12, marginBottom: 6 }}>
            Tap to log
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {savedFoods.map((f) => (
              <div key={f.id} className="row" style={{ gap: 2 }}>
                <button
                  type="button"
                  className="chip chip-accent"
                  style={{ cursor: "pointer" }}
                  onClick={() => quickLogSavedFood(f)}
                >
                  {f.name}
                  {f.calories != null && ` · ${f.calories} kcal`}
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedFood(f.id)}
                  aria-label={`Remove saved food ${f.name}`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-faint)",
                    fontSize: 14,
                    padding: "0 4px",
                    minHeight: 28,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="quick-add" onSubmit={quickAdd} style={{ flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Meal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: "1 1 140px" }}
        />
        <input
          type="number"
          placeholder="Calories"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          style={{ width: 96 }}
        />
        <input
          type="number"
          placeholder="Protein g"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          style={{ width: 96 }}
        />
        <input
          type="number"
          placeholder="Carbs g"
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
          style={{ width: 96 }}
        />
        <input type="number" placeholder="Fat g" value={fat} onChange={(e) => setFat(e.target.value)} style={{ width: 96 }} />
        <button className="btn btn-primary" type="submit">
          Add meal
        </button>
      </form>
      <label className="row" style={{ gap: 6, marginTop: -8, marginBottom: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={saveAsFood} onChange={(e) => setSaveAsFood(e.target.checked)} />
        <span className="text-dim" style={{ fontSize: 13 }}>
          Save as a food I eat often
        </span>
      </label>

      <h2>Calorie trend (14 days)</h2>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyTotals} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--border)" tick={axisTick} tickFormatter={shortDate} />
            <YAxis stroke="var(--border)" tick={axisTick} width={40} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
            <Bar dataKey="calories" name="Calories" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={20} />
            {calorieTarget != null && (
              <ReferenceLine
                y={calorieTarget}
                stroke="var(--text-faint)"
                strokeDasharray="4 4"
                label={{ value: "Target", fill: "var(--text-dim)", fontSize: 11, position: "insideTopRight" }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2>Macros — {selectedDate}</h2>
      <div className="row" style={{ flexWrap: "wrap", marginBottom: 16, gap: 8 }}>
        <span className="chip chip-accent">Protein {round1(macroTotals.protein)}g</span>
        <span className="chip">Carbs {round1(macroTotals.carbs)}g</span>
        <span className="chip">Fat {round1(macroTotals.fat)}g</span>
      </div>

      {loading || dayLoading ? (
        <div className="empty-state">Loading…</div>
      ) : dayMeals.length === 0 ? (
        <div className="empty-state">No meals logged for this day yet.</div>
      ) : (
        <div className="list">
          {dayMeals.map((m) => (
            <div className="card" key={m.id}>
              <div className="row-between">
                <div>
                  <strong>{m.name}</strong>
                  <div className="row" style={{ flexWrap: "wrap", marginTop: 4, gap: 6 }}>
                    {m.calories != null && <span className="chip">{m.calories} kcal</span>}
                    {m.protein_g != null && <span className="chip">{m.protein_g}g P</span>}
                    {m.carbs_g != null && <span className="chip">{m.carbs_g}g C</span>}
                    {m.fat_g != null && <span className="chip">{m.fat_g}g F</span>}
                  </div>
                </div>
                <button type="button" className="btn-icon text-danger" onClick={() => remove(m.id)} aria-label="Delete meal">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeightTab() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => todayISO());
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setEntries(await api.listWeightEntries());
    } finally {
      setLoading(false);
    }
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const lbs = Number(weight);
    if (!date || !weight || !Number.isFinite(lbs) || lbs <= 0) return;
    const entry = await api.createWeightEntry({ entry_date: date, weight_lbs: lbs, notes: notes.trim() || undefined });
    setEntries((prev) => [...prev, entry].sort((a, b) => a.entry_date.localeCompare(b.entry_date)));
    setWeight("");
    setNotes("");
  }

  async function remove(id: string) {
    await api.deleteWeightEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const chartData = useMemo(() => entries.map((e) => ({ date: e.entry_date, weight: e.weight_lbs })), [entries]);

  const latest = entries.length > 0 ? entries[entries.length - 1] : null;
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const delta = latest && previous ? round1(latest.weight_lbs - previous.weight_lbs) : null;

  const sortedForList = useMemo(() => [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date)), [entries]);

  return (
    <div>
      <form className="quick-add" onSubmit={quickAdd} style={{ flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <input
          type="number"
          step="0.1"
          placeholder="Weight (lb)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          style={{ width: 110 }}
          required
        />
        <input
          type="text"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ flex: "1 1 140px" }}
        />
        <button className="btn btn-primary" type="submit">
          Log weight
        </button>
      </form>

      {latest && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <span className="chip chip-accent">Latest: {latest.weight_lbs} lb</span>
          {delta != null && (
            <span className={`chip ${delta > 0 ? "chip-warning" : delta < 0 ? "" : ""}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "–"} {Math.abs(delta)} lb since last entry
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">No weight logged yet — add your first entry above.</div>
      ) : (
        <>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--border)" tick={axisTick} tickFormatter={shortDate} />
                <YAxis
                  stroke="var(--border)"
                  tick={axisTick}
                  width={40}
                  domain={[(min: number) => Math.floor(min - 3), (max: number) => Math.ceil(max + 3)]}
                />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} formatter={(v: number) => [`${v} lb`, "Weight"]} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  name="Weight"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--accent)", stroke: "var(--bg-card)", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--bg-card)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="list">
            {sortedForList.map((e) => (
              <div className="card" key={e.id}>
                <div className="row-between">
                  <div>
                    <strong>{e.weight_lbs} lb</strong>
                    <span className="chip" style={{ marginLeft: 8 }}>
                      {e.entry_date}
                    </span>
                    {e.notes && <div className="text-dim" style={{ fontSize: 13, marginTop: 4 }}>{e.notes}</div>}
                  </div>
                  <button type="button" className="btn-icon text-danger" onClick={() => remove(e.id)} aria-label="Delete entry">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
