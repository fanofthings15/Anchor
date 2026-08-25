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
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  api,
  type ExerciseType,
  type Meal,
  type SavedFood,
  type UserSettings,
  type WeightEntry,
  type Workout,
  type WorkoutExercise,
  type WorkoutRoutine,
  type WorkoutRoutineExercise,
  type WorkoutSet,
} from "../api/client";
import { addDaysISO, buildMonthGrid, computeStreaks, sameDay, todayISO } from "../calendarUtils";
import { EXERCISE_LIBRARY_NAMES, findExercise, type MuscleGroup } from "../exerciseLibrary";
import ExerciseDetailModal from "../ExerciseDetailModal";
import BodyDiagram from "../BodyDiagram";
import ExercisePicker from "../ExercisePicker";

type Tab = "workouts" | "food" | "weight" | "stats";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A dedicated drag-affordance element with its own dnd-kit listeners — so a drag never
// fires from a tap on the exercise name (which opens the detail modal) or delete button,
// and `touch-action: none` (see .drag-handle in styles.css) keeps mobile from trying to
// scroll the page mid-drag.
function DragHandle(props: Record<string, unknown>) {
  return (
    <button type="button" className="btn-icon drag-handle" aria-label="Drag to reorder" {...props}>
      ⠿
    </button>
  );
}

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
  return value === "workouts" || value === "food" || value === "weight" || value === "stats";
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
        <button type="button" className={`tab ${tab === "stats" ? "active" : ""}`} onClick={() => selectTab("stats")}>
          Stats
        </button>
      </div>
      {tab === "workouts" ? (
        <WorkoutsTab />
      ) : tab === "food" ? (
        <FoodTab />
      ) : tab === "weight" ? (
        <WeightTab />
      ) : (
        <StatsTab />
      )}
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

  const { current } = useMemo(() => computeStreaks(activeDates), [activeDates]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "center", gap: 32, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: current > 0 ? "var(--success)" : "var(--text)" }}>{current}</div>
          <div className="text-dim" style={{ fontSize: 12 }}>
            Day streak
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
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([]);
  const [routineExercises, setRoutineExercises] = useState<WorkoutRoutineExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState(() => todayISO());
  const [quickName, setQuickName] = useState("");
  const [startRoutineId, setStartRoutineId] = useState("");
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
      setSets(workoutData.sets);
      setRoutines(routineData.routines);
      setRoutineExercises(routineData.exercises);
    } finally {
      setLoading(false);
    }
  }

  const workoutDateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) m.set(w.id, w.workout_date);
    return m;
  }, [workouts]);

  // Every past instance of "this exercise name", oldest first, so the per-set table can
  // show what was actually done last time (Hevy's "Previous" column) — the whole point
  // of logging sets individually rather than one aggregate number per exercise.
  const exerciseHistoryByName = useMemo(() => {
    const map = new Map<string, { workoutId: string; date: string; sets: WorkoutSet[] }[]>();
    for (const ex of exercises) {
      const key = ex.name.trim().toLowerCase();
      if (!key) continue;
      const exSets = sets.filter((s) => s.exercise_id === ex.id).sort((a, b) => a.set_index - b.set_index);
      const date = workoutDateById.get(ex.workout_id) ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ workoutId: ex.workout_id, date, sets: exSets });
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [exercises, sets, workoutDateById]);

  function getPreviousSets(exerciseName: string, currentWorkoutId: string): WorkoutSet[] {
    const history = exerciseHistoryByName.get(exerciseName.trim().toLowerCase()) ?? [];
    const others = history.filter((h) => h.workoutId !== currentWorkoutId);
    return others.length > 0 ? others[others.length - 1].sets : [];
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
  // every exercise from the routine template with that many sets pre-filled from the
  // template's target weight/reps (unchecked — matches Hevy's "start routine" behavior:
  // the sets are ready to confirm/edit, not already marked done).
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

    const newExercises: WorkoutExercise[] = [];
    const newSets: WorkoutSet[] = [];
    for (const tmpl of templateExercises) {
      const exercise = await api.createWorkoutExercise(workout.id, { name: tmpl.name });
      newExercises.push(exercise);
      const count = tmpl.sets && tmpl.sets > 0 ? tmpl.sets : 1;
      for (let i = 0; i < count; i++) {
        const set = await api.createWorkoutSet(exercise.id, {
          weight: tmpl.weight ?? undefined,
          reps: tmpl.reps ?? undefined,
          completed: false,
        });
        newSets.push(set);
      }
    }
    setExercises((prev) => [...prev, ...newExercises]);
    setSets((prev) => [...prev, ...newSets]);
    setExpandedId(workout.id);
  }

  async function remove(id: string) {
    const exerciseIds = new Set(exercises.filter((ex) => ex.workout_id === id).map((ex) => ex.id));
    await api.deleteWorkout(id);
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    setExercises((prev) => prev.filter((ex) => ex.workout_id !== id));
    setSets((prev) => prev.filter((s) => !exerciseIds.has(s.exercise_id)));
  }

  // Adding an exercise also seeds it with one set, pre-filled from the last time this
  // exercise was logged (if ever) — an empty exercise with no sets to fill in isn't a
  // useful starting point, and this is what Hevy actually does too.
  async function addExercise(workoutId: string, name: string, exerciseType: ExerciseType) {
    const exercise = await api.createWorkoutExercise(workoutId, { name, exercise_type: exerciseType });
    setExercises((prev) => [...prev, exercise]);
    const previous = getPreviousSets(name, workoutId)[0];
    const set = await api.createWorkoutSet(
      exercise.id,
      exerciseType === "cardio"
        ? {
            distance_miles: previous?.distance_miles ?? undefined,
            duration_seconds: previous?.duration_seconds ?? undefined,
            completed: false,
          }
        : { weight: previous?.weight ?? undefined, reps: previous?.reps ?? undefined, completed: false }
    );
    setSets((prev) => [...prev, set]);
  }

  async function removeExercise(id: string) {
    await api.deleteWorkoutExercise(id);
    setExercises((prev) => prev.filter((ex) => ex.id !== id));
    setSets((prev) => prev.filter((s) => s.exercise_id !== id));
  }

  async function updateExerciseNotes(id: string, notes: string) {
    setExercises((prev) => prev.map((ex) => (ex.id === id ? { ...ex, notes } : ex)));
    try {
      await api.updateWorkoutExerciseNotes(id, notes);
    } catch {
      load();
    }
  }

  async function reorderExercises(workoutId: string, orderedIds: string[]) {
    setExercises((prev) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map((ex) => (ex.workout_id === workoutId && order.has(ex.id) ? { ...ex, sort_order: order.get(ex.id)! } : ex));
    });
    try {
      await api.reorderWorkoutExercises(workoutId, orderedIds);
    } catch {
      load();
    }
  }

  async function addSet(
    exerciseId: string,
    data: { weight?: number | null; reps?: number | null; distance_miles?: number | null; duration_seconds?: number | null }
  ) {
    const set = await api.createWorkoutSet(exerciseId, { ...data, completed: false });
    setSets((prev) => [...prev, set]);
  }

  async function updateSet(
    id: string,
    data: Partial<{
      weight: number | null;
      reps: number | null;
      distance_miles: number | null;
      duration_seconds: number | null;
      completed: boolean;
    }>
  ) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    try {
      await api.updateWorkoutSet(id, data);
    } catch {
      load();
    }
  }

  async function deleteSet(id: string) {
    await api.deleteWorkoutSet(id);
    setSets((prev) => prev.filter((s) => s.id !== id));
  }

  // Routine templates still keep one aggregate sets/reps/weight per exercise (they're a
  // target plan, not a logged performance) — summarized from the workout's real sets: set
  // count as-is, and the top (heaviest) set's weight/reps as the target, same heuristic
  // the CSV import used.
  async function saveAsRoutine(workoutId: string, name: string) {
    const routine = await api.createRoutine(name);
    setRoutines((prev) => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)));
    const workoutExercises = exercises.filter((ex) => ex.workout_id === workoutId).sort((a, b) => a.sort_order - b.sort_order);
    // Sequential, not Promise.all — each POST assigns its sort_order server-side from
    // the current max, so firing them concurrently raced and could hand out duplicate
    // values, scrambling the routine's exercise order (and everything started from it).
    const created: WorkoutRoutineExercise[] = [];
    for (const ex of workoutExercises) {
      const exSets = sets.filter((s) => s.exercise_id === ex.id);
      const top = exSets.reduce<WorkoutSet | null>(
        (best, s) => (s.weight != null && (best?.weight ?? -Infinity) < s.weight ? s : best),
        null
      );
      const routineExercise = await api.createRoutineExercise(routine.id, {
        name: ex.name,
        sets: exSets.length || undefined,
        reps: top?.reps ?? undefined,
        weight: top?.weight ?? undefined,
      });
      created.push(routineExercise);
    }
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

  async function reorderRoutineExercises(routineId: string, orderedIds: string[]) {
    setRoutineExercises((prev) => {
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      return prev.map((ex) => (ex.routine_id === routineId && order.has(ex.id) ? { ...ex, sort_order: order.get(ex.id)! } : ex));
    });
    try {
      await api.reorderRoutineExercises(routineId, orderedIds);
    } catch {
      load();
    }
  }

  // Datalist source for the "add exercise" name field — the curated library first, plus
  // any previously-logged custom name so old free-typed data keeps autocompleting too.
  const exerciseNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const n of EXERCISE_LIBRARY_NAMES) names.set(n.toLowerCase(), n);
    for (const ex of exercises) {
      const key = ex.name.trim().toLowerCase();
      if (key && !names.has(key)) names.set(key, ex.name.trim());
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [exercises]);

  // Switches the whole tab's date context — the list below already reacts to quickDate
  // and auto-expands whatever's there (see the effect above), so a day with an existing
  // workout just needs a scroll into view; an empty day scrolls to the log form instead.
  function selectCalendarDay(dateStr: string) {
    setQuickDate(dateStr);
    const hasWorkout = workouts.some((w) => w.workout_date === dateStr);
    const targetId = hasWorkout ? "workout-day-list" : "workout-quick-add";
    setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const workoutDates = useMemo(() => new Set(workouts.map((w) => w.workout_date)), [workouts]);

  // Only the selected day's workouts are listed below — a lifetime history isn't useful
  // to scroll through day to day; the calendar above is what full history is for.
  const dayWorkouts = useMemo(() => workouts.filter((w) => w.workout_date === quickDate), [workouts, quickDate]);

  useEffect(() => {
    setExpandedId(dayWorkouts.length > 0 ? dayWorkouts[0].id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickDate, workouts]);

  return (
    <div>
      <StreakCalendar activeDates={workoutDates} selectedDate={quickDate} onSelectDay={selectCalendarDay} />

      <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <form id="workout-quick-add" className="row" style={{ flex: "1 1 220px", gap: 8 }} onSubmit={quickAdd}>
          <input
            type="text"
            placeholder="Workout name (optional)"
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            style={{ flex: 1, minWidth: 120 }}
          />
          <button className="btn btn-primary" type="submit">
            Start Workout
          </button>
        </form>

        {routines.length > 0 && (
          <form className="row" style={{ flex: "1 1 220px", gap: 8 }} onSubmit={startFromRoutine}>
            <select
              value={startRoutineId}
              onChange={(e) => setStartRoutineId(e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            >
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
      </div>

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
                  exerciseNames={exerciseNames}
                  onAddExercise={(data) => addRoutineExercise(r.id, data)}
                  onDeleteExercise={deleteRoutineExercise}
                  onReorderExercises={(orderedIds) => reorderRoutineExercises(r.id, orderedIds)}
                  onDelete={() => deleteRoutine(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div id="workout-day-list">
      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : dayWorkouts.length === 0 ? (
        <div className="empty-state">No workouts logged for this day yet.</div>
      ) : (
        <div className="list">
          {dayWorkouts.map((w) => (
            <WorkoutCard
              key={w.id}
              workout={w}
              exercises={exercises.filter((ex) => ex.workout_id === w.id).sort((a, b) => a.sort_order - b.sort_order)}
              exerciseNames={exerciseNames}
              sets={sets}
              getPreviousSets={(exerciseName) => getPreviousSets(exerciseName, w.id)}
              expanded={expandedId === w.id}
              onToggle={() => setExpandedId(expandedId === w.id ? null : w.id)}
              onDelete={() => remove(w.id)}
              onAddExercise={(name, exerciseType) => addExercise(w.id, name, exerciseType)}
              onDeleteExercise={removeExercise}
              onReorderExercises={(orderedIds) => reorderExercises(w.id, orderedIds)}
              onAddSet={addSet}
              onUpdateSet={updateSet}
              onDeleteSet={deleteSet}
              onUpdateNotes={updateExerciseNotes}
              onSaveAsRoutine={(name) => saveAsRoutine(w.id, name)}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function SortableRoutineExerciseRow({ ex, onDeleteExercise }: { ex: WorkoutRoutineExercise; onDeleteExercise: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div className="row-between" ref={setNodeRef} style={style}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <DragHandle {...attributes} {...listeners} />
        <strong>{ex.name}</strong>
        {ex.sets != null && <span className="chip">{ex.sets} sets</span>}
        {ex.reps != null && <span className="chip">{ex.reps} reps</span>}
        {ex.weight != null && <span className="chip">{ex.weight} lb</span>}
      </div>
      <button type="button" className="btn-icon text-danger" onClick={() => onDeleteExercise(ex.id)} aria-label="Delete exercise">
        ✕
      </button>
    </div>
  );
}

function RoutineCard({
  routine,
  exercises,
  exerciseNames,
  onAddExercise,
  onDeleteExercise,
  onReorderExercises,
  onDelete,
}: {
  routine: WorkoutRoutine;
  exercises: WorkoutRoutineExercise[];
  exerciseNames: string[];
  onAddExercise: (data: { name: string; sets?: number; reps?: number; weight?: number }) => void;
  onDeleteExercise: (id: string) => void;
  onReorderExercises: (orderedIds: string[]) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = exercises.findIndex((ex) => ex.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderExercises(arrayMove(exercises, oldIndex, newIndex).map((ex) => ex.id));
  }

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
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={exercises.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
                <div className="list">
                  {exercises.map((ex) => (
                    <SortableRoutineExerciseRow key={ex.id} ex={ex} onDeleteExercise={onDeleteExercise} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <form className="row" style={{ flexWrap: "wrap", marginTop: 10, gap: 8 }} onSubmit={submit}>
            <ExercisePicker value={name} onChange={setName} options={exerciseNames} placeholder="Exercise name" style={{ flex: "1 1 140px" }} />
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

// One row of the Hevy-style Set / Previous / Lbs / Reps / done table. Weight and reps
// are uncontrolled (defaultValue + onBlur) rather than controlled-on-every-keystroke —
// with a real PATCH round-trip per change, committing on blur avoids firing a request
// per keystroke while typing a number.
type SetUpdate = Partial<{
  weight: number | null;
  reps: number | null;
  distance_miles: number | null;
  duration_seconds: number | null;
  completed: boolean;
}>;

function SetRow({
  index,
  set,
  previous,
  exerciseType,
  onUpdate,
  onDelete,
}: {
  index: number;
  set: WorkoutSet;
  previous: WorkoutSet | undefined;
  exerciseType: ExerciseType;
  onUpdate: (data: SetUpdate) => void;
  onDelete: () => void;
}) {
  const isCardio = exerciseType === "cardio";
  const previousText = isCardio
    ? previous && (previous.distance_miles != null || previous.duration_seconds != null)
      ? `${previous.distance_miles ?? "-"}mi / ${previous.duration_seconds != null ? round1(previous.duration_seconds / 60) : "-"}min`
      : "-"
    : previous && (previous.weight != null || previous.reps != null)
      ? `${previous.weight ?? "-"}x${previous.reps ?? "-"}`
      : "-";

  return (
    <div className="set-row">
      <span className="set-row-index">{index + 1}</span>
      <span className="set-row-previous text-dim">{previousText}</span>
      {isCardio ? (
        <>
          <input
            type="number"
            className="set-input"
            inputMode="decimal"
            step="0.01"
            defaultValue={set.distance_miles ?? ""}
            placeholder="-"
            onBlur={(e) => {
              const v = e.target.value.trim();
              const next = v ? Number(v) : null;
              if (next !== set.distance_miles) onUpdate({ distance_miles: next });
            }}
            aria-label={`Set ${index + 1} distance in miles`}
          />
          <input
            type="number"
            className="set-input"
            inputMode="decimal"
            step="0.1"
            defaultValue={set.duration_seconds != null ? round1(set.duration_seconds / 60) : ""}
            placeholder="-"
            onBlur={(e) => {
              const v = e.target.value.trim();
              const minutes = v ? Number(v) : null;
              const next = minutes != null ? Math.round(minutes * 60) : null;
              if (next !== set.duration_seconds) onUpdate({ duration_seconds: next });
            }}
            aria-label={`Set ${index + 1} duration in minutes`}
          />
        </>
      ) : (
        <>
          <input
            type="number"
            className="set-input"
            inputMode="decimal"
            defaultValue={set.weight ?? ""}
            placeholder="-"
            onBlur={(e) => {
              const v = e.target.value.trim();
              const next = v ? Number(v) : null;
              if (next !== set.weight) onUpdate({ weight: next });
            }}
            aria-label={`Set ${index + 1} weight`}
          />
          <input
            type="number"
            className="set-input"
            inputMode="numeric"
            defaultValue={set.reps ?? ""}
            placeholder="-"
            onBlur={(e) => {
              const v = e.target.value.trim();
              const next = v ? Number(v) : null;
              if (next !== set.reps) onUpdate({ reps: next });
            }}
            aria-label={`Set ${index + 1} reps`}
          />
        </>
      )}
      <button
        type="button"
        className={`checkbox-btn${set.completed ? " checked" : ""}`}
        onClick={() => onUpdate({ completed: !set.completed })}
        aria-label={`Mark set ${index + 1} ${set.completed ? "not done" : "done"}`}
      />
      <button type="button" className="set-row-delete" onClick={onDelete} aria-label={`Delete set ${index + 1}`}>
        ✕
      </button>
    </div>
  );
}

function ExerciseBlock({
  exercise,
  sets,
  previousSets,
  onDelete,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onUpdateNotes,
}: {
  exercise: WorkoutExercise;
  sets: WorkoutSet[];
  previousSets: WorkoutSet[];
  onDelete: () => void;
  onAddSet: (data: {
    weight?: number | null;
    reps?: number | null;
    distance_miles?: number | null;
    duration_seconds?: number | null;
  }) => void;
  onUpdateSet: (id: string, data: SetUpdate) => void;
  onDeleteSet: (id: string) => void;
  onUpdateNotes: (notes: string) => void;
}) {
  const isCardio = exercise.exercise_type === "cardio";
  const [showDetail, setShowDetail] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: exercise.id });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  // A new set starts from whatever the last set in this exercise already has — if this
  // is the very first set, it falls back to the same slot from the previous time this
  // exercise was logged, so a familiar exercise never starts from a blank row.
  function handleAddSet() {
    const last = sets[sets.length - 1];
    const prev = previousSets[sets.length];
    if (isCardio) {
      onAddSet({
        distance_miles: last?.distance_miles ?? prev?.distance_miles ?? null,
        duration_seconds: last?.duration_seconds ?? prev?.duration_seconds ?? null,
      });
    } else {
      onAddSet({ weight: last?.weight ?? prev?.weight ?? null, reps: last?.reps ?? prev?.reps ?? null });
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10, ...dragStyle }} ref={setNodeRef}>
      <div className="row-between" style={{ marginBottom: sets.length > 0 ? 10 : 0 }}>
        <div className="row" style={{ flex: 1, minWidth: 0 }}>
          <DragHandle {...attributes} {...listeners} />
          <button
            type="button"
            style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, textAlign: "left" }}
            onClick={() => setShowDetail(true)}
          >
            {exercise.name}
          </button>
        </div>
        <button type="button" className="btn-icon text-danger" onClick={onDelete} aria-label={`Delete ${exercise.name}`}>
          ✕
        </button>
      </div>

      {showDetail && <ExerciseDetailModal name={exercise.name} onClose={() => setShowDetail(false)} />}

      <input
        type="text"
        placeholder="Notes (optional)"
        defaultValue={exercise.notes}
        style={{ width: "100%", marginBottom: sets.length > 0 ? 10 : 0, fontSize: 13 }}
        onBlur={(e) => {
          if (e.target.value !== exercise.notes) onUpdateNotes(e.target.value);
        }}
      />

      {sets.length > 0 && (
        <div className="sets-table">
          <div className="set-row set-row-header text-dim">
            <span>Set</span>
            <span>Previous</span>
            <span>{isCardio ? "Mi" : "Lbs"}</span>
            <span>{isCardio ? "Min" : "Reps"}</span>
            <span />
            <span />
          </div>
          {sets.map((s, i) => (
            <SetRow
              key={s.id}
              index={i}
              set={s}
              previous={previousSets[i]}
              exerciseType={exercise.exercise_type}
              onUpdate={(data) => onUpdateSet(s.id, data)}
              onDelete={() => onDeleteSet(s.id)}
            />
          ))}
        </div>
      )}

      <button type="button" className="btn" style={{ width: "100%", marginTop: 10 }} onClick={handleAddSet}>
        + Add Set
      </button>
    </div>
  );
}

function WorkoutCard({
  workout,
  exercises,
  exerciseNames,
  sets,
  getPreviousSets,
  expanded,
  onToggle,
  onDelete,
  onAddExercise,
  onDeleteExercise,
  onReorderExercises,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onUpdateNotes,
  onSaveAsRoutine,
}: {
  workout: Workout;
  exercises: WorkoutExercise[];
  exerciseNames: string[];
  sets: WorkoutSet[];
  getPreviousSets: (exerciseName: string) => WorkoutSet[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddExercise: (name: string, exerciseType: ExerciseType) => void;
  onDeleteExercise: (id: string) => void;
  onReorderExercises: (orderedIds: string[]) => void;
  onAddSet: (
    exerciseId: string,
    data: { weight?: number | null; reps?: number | null; distance_miles?: number | null; duration_seconds?: number | null }
  ) => void;
  onUpdateSet: (id: string, data: SetUpdate) => void;
  onDeleteSet: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onSaveAsRoutine: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [exerciseType, setExerciseType] = useState<ExerciseType>("strength");
  const [typeTouched, setTypeTouched] = useState(false);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleExerciseDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = exercises.findIndex((ex) => ex.id === active.id);
    const newIndex = exercises.findIndex((ex) => ex.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderExercises(arrayMove(exercises, oldIndex, newIndex).map((ex) => ex.id));
  }

  // Typing a known cardio exercise name auto-switches the type — same names the backend
  // reclassifies existing data for — but a manual override always wins, so re-typing the
  // name afterward doesn't clobber a deliberate choice.
  function handleNameChange(v: string) {
    setName(v);
    if (!typeTouched) {
      setExerciseType(findExercise(v)?.type === "cardio" ? "cardio" : "strength");
    }
  }

  const exerciseIds = new Set(exercises.map((ex) => ex.id));
  const workoutSets = sets.filter((s) => exerciseIds.has(s.exercise_id));
  const totalSets = workoutSets.length;
  const volume = workoutSets.reduce((sum, s) => sum + (s.weight != null && s.reps != null ? s.weight * s.reps : 0), 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddExercise(trimmed, exerciseType);
    setName("");
    setExerciseType("strength");
    setTypeTouched(false);
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
          {totalSets > 0 && (
            <div className="row" style={{ gap: 24, marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{Math.round(volume).toLocaleString()} lbs</div>
                <div className="text-dim" style={{ fontSize: 12 }}>
                  Volume
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{totalSets}</div>
                <div className="text-dim" style={{ fontSize: 12 }}>
                  Sets
                </div>
              </div>
            </div>
          )}

          {exercises.length === 0 ? (
            <div className="empty-state">No exercises yet — add one below.</div>
          ) : (
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleExerciseDragEnd}>
              <SortableContext items={exercises.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
                {exercises.map((ex) => (
                  <ExerciseBlock
                    key={ex.id}
                    exercise={ex}
                    sets={sets.filter((s) => s.exercise_id === ex.id).sort((a, b) => a.set_index - b.set_index)}
                    previousSets={getPreviousSets(ex.name)}
                    onDelete={() => onDeleteExercise(ex.id)}
                    onAddSet={(data) => onAddSet(ex.id, data)}
                    onUpdateSet={onUpdateSet}
                    onDeleteSet={onDeleteSet}
                    onUpdateNotes={(notes) => onUpdateNotes(ex.id, notes)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          <form className="quick-add" onSubmit={submit} style={{ flexWrap: "wrap" }}>
            <ExercisePicker value={name} onChange={handleNameChange} options={exerciseNames} placeholder="Exercise name" style={{ flex: "1 1 140px" }} />
            <select
              value={exerciseType}
              onChange={(e) => {
                setExerciseType(e.target.value as ExerciseType);
                setTypeTouched(true);
              }}
              style={{ width: 110 }}
              aria-label="Exercise type"
            >
              <option value="strength">Strength</option>
              <option value="cardio">Cardio</option>
            </select>
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
  const [selectedDayMeals, setSelectedDayMeals] = useState<Meal[]>([]);
  const [mealDates, setMealDates] = useState<string[]>([]);
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [calorieTarget, setCalorieTarget] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saveAsFood, setSaveAsFood] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCalories, setEditCalories] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");

  useEffect(() => {
    load();
  }, []);

  // The day being viewed can be backdated arbitrarily far, so it's fetched separately,
  // scoped to exactly that one date, every time the selected date changes.
  useEffect(() => {
    loadSelectedDay();
  }, [selectedDate]);

  async function load() {
    setLoading(true);
    try {
      const [foods, dates, settings] = await Promise.all([api.listSavedFoods(), api.listMealDates(), api.getSettings()]);
      setSavedFoods(foods);
      setMealDates(dates);
      setCalorieTarget(settings.calorie_target);
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
    refreshMealDates();
  }

  async function removeSavedFood(id: string) {
    await api.deleteSavedFood(id);
    setSavedFoods((prev) => prev.filter((f) => f.id !== id));
  }

  async function remove(id: string) {
    await api.deleteMeal(id);
    setSelectedDayMeals((prev) => prev.filter((m) => m.id !== id));
    refreshMealDates();
  }

  // "Log again" for a meal already on this day — e.g. a second hot dog — reuses its exact
  // name/macros as a brand-new entry rather than bumping some quantity field on the
  // original, so each hot dog still shows up as its own removable/editable row.
  async function logAgain(m: Meal) {
    const meal = await api.createMeal({
      meal_date: selectedDate,
      name: m.name,
      calories: m.calories ?? undefined,
      protein_g: m.protein_g ?? undefined,
      carbs_g: m.carbs_g ?? undefined,
      fat_g: m.fat_g ?? undefined,
    });
    setSelectedDayMeals((prev) => [meal, ...prev]);
    refreshMealDates();
  }

  function startEdit(m: Meal) {
    setEditingId(m.id);
    setEditName(m.name);
    setEditCalories(m.calories != null ? String(m.calories) : "");
    setEditProtein(m.protein_g != null ? String(m.protein_g) : "");
    setEditCarbs(m.carbs_g != null ? String(m.carbs_g) : "");
    setEditFat(m.fat_g != null ? String(m.fat_g) : "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) return;
    const updated = await api.updateMeal(id, {
      name: trimmed,
      calories: editCalories ? Number(editCalories) : null,
      protein_g: editProtein ? Number(editProtein) : null,
      carbs_g: editCarbs ? Number(editCarbs) : null,
      fat_g: editFat ? Number(editFat) : null,
    });
    setSelectedDayMeals((prev) => prev.map((m) => (m.id === id ? updated : m)));
    setEditingId(null);
  }

  const mealDateSet = useMemo(() => new Set(mealDates), [mealDates]);
  const dayCalories = useMemo(
    () => selectedDayMeals.reduce((sum, m) => sum + (m.calories ?? 0), 0),
    [selectedDayMeals]
  );
  const caloriesRemaining = calorieTarget != null ? calorieTarget - dayCalories : null;

  // A day with meals already logged just switches the whole page's date context to it
  // (the meal list/add form below already react to selectedDate); an empty day does the
  // same thing, which is exactly "let me add for this day" here.
  function selectCalendarDay(dateStr: string) {
    setSelectedDate(dateStr);
    document.getElementById("food-day-view")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const dayMeals = useMemo(
    () => [...selectedDayMeals].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [selectedDayMeals]
  );

  return (
    <div>
      <StreakCalendar activeDates={mealDateSet} selectedDate={selectedDate} onSelectDay={selectCalendarDay} />

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

      <form id="food-day-view" className="quick-add" onSubmit={quickAdd} style={{ flexWrap: "wrap" }}>
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

      {calorieTarget != null && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row-between">
            <span className="text-dim" style={{ fontSize: 13 }}>
              {dayCalories} / {calorieTarget} kcal
            </span>
            <strong className={caloriesRemaining != null && caloriesRemaining < 0 ? "text-danger" : ""}>
              {caloriesRemaining != null && caloriesRemaining < 0
                ? `${Math.abs(caloriesRemaining)} over`
                : `${caloriesRemaining} remaining`}
            </strong>
          </div>
        </div>
      )}

      {loading || dayLoading ? (
        <div className="empty-state">Loading…</div>
      ) : dayMeals.length === 0 ? (
        <div className="empty-state">No meals logged for this day yet.</div>
      ) : (
        <div className="list">
          {dayMeals.map((m) =>
            editingId === m.id ? (
              <form className="card" key={m.id} onSubmit={(e) => saveEdit(e, m.id)}>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    style={{ flex: "1 1 140px" }}
                    autoFocus
                  />
                  <input
                    type="number"
                    placeholder="Calories"
                    value={editCalories}
                    onChange={(e) => setEditCalories(e.target.value)}
                    style={{ width: 96 }}
                  />
                  <input
                    type="number"
                    placeholder="Protein g"
                    value={editProtein}
                    onChange={(e) => setEditProtein(e.target.value)}
                    style={{ width: 96 }}
                  />
                  <input
                    type="number"
                    placeholder="Carbs g"
                    value={editCarbs}
                    onChange={(e) => setEditCarbs(e.target.value)}
                    style={{ width: 96 }}
                  />
                  <input
                    type="number"
                    placeholder="Fat g"
                    value={editFat}
                    onChange={(e) => setEditFat(e.target.value)}
                    style={{ width: 96 }}
                  />
                </div>
                <div className="form-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save
                  </button>
                </div>
              </form>
            ) : (
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
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => logAgain(m)}
                      aria-label={`Log another ${m.name}`}
                      title="Log another"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => startEdit(m)}
                      aria-label={`Edit ${m.name}`}
                    >
                      ✎
                    </button>
                    <button type="button" className="btn-icon text-danger" onClick={() => remove(m.id)} aria-label="Delete meal">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Combines the workout progress chart and the food calorie/macro trend in one place —
// these previously lived on the Workouts and Food tabs, but the date on each of those
// tabs is now driven entirely by the streak calendar, so a separate glance-at-trends
// page made more sense than cluttering the day-logging tabs with charts.
function StatsTab() {
  const [loading, setLoading] = useState(true);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);
  const [trendMeals, setTrendMeals] = useState<Meal[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const rangeStart = useMemo(() => addDaysISO(todayISO(), -13), []);
  const rangeEnd = useMemo(() => todayISO(), []);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [workoutData, mealList, userSettings] = await Promise.all([
        api.getWorkouts(),
        api.listMeals(rangeStart, rangeEnd),
        api.getSettings(),
      ]);
      setWorkouts(workoutData.workouts);
      setExercises(workoutData.exercises);
      setSets(workoutData.sets);
      setTrendMeals(mealList);
      setSettings(userSettings);
    } finally {
      setLoading(false);
    }
  }

  const workoutDateById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) m.set(w.id, w.workout_date);
    return m;
  }, [workouts]);

  // This calendar week (Sunday-Saturday, matching the convention already established in
  // backend/src/routes/today.ts's recap), scored per muscle group from every completed
  // set logged in that window: full weight to an exercise's primary muscles, half weight
  // to its secondary ones, then normalized 0-1 against the week's most-worked muscle so
  // the diagram's shading is always relative rather than tied to an absolute volume
  // number that means nothing on its own. A logged exercise with no library match (a
  // custom typed name) simply contributes nothing, same tradeoff as the detail modal.
  const weekMuscleScores = useMemo(() => {
    const today = todayISO();
    const weekStart = addDaysISO(today, -new Date(`${today}T00:00:00`).getDay());
    const weekWorkoutIds = new Set(
      workouts.filter((w) => w.workout_date >= weekStart && w.workout_date <= today).map((w) => w.id)
    );

    const raw = {
      chest: 0,
      back: 0,
      shoulders: 0,
      biceps: 0,
      triceps: 0,
      forearms: 0,
      abs: 0,
      obliques: 0,
      quads: 0,
      hamstrings: 0,
      glutes: 0,
      calves: 0,
    } as Record<MuscleGroup, number>;

    for (const ex of exercises) {
      if (!weekWorkoutIds.has(ex.workout_id)) continue;
      const def = findExercise(ex.name);
      if (!def) continue;
      for (const s of sets) {
        if (s.exercise_id !== ex.id || !s.completed) continue;
        const volume = s.weight != null && s.reps != null ? s.weight * s.reps : 1;
        for (const m of def.primary) raw[m] += volume;
        for (const m of def.secondary) raw[m] += volume * 0.5;
      }
    }

    const max = Math.max(1, ...Object.values(raw));
    const scores = {} as Record<MuscleGroup, number>;
    for (const m of Object.keys(raw) as MuscleGroup[]) scores[m] = raw[m] / max;
    return scores;
  }, [workouts, exercises, sets]);

  const hasWeekMuscleData = Object.values(weekMuscleScores).some((v) => v > 0);

  // Weight-over-time only makes sense for strength exercises — cardio ones track
  // distance/duration instead, so they're left out of this dropdown.
  const exerciseNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const ex of exercises) {
      if (ex.exercise_type !== "strength") continue;
      const key = ex.name.trim().toLowerCase();
      if (key && !names.has(key)) names.set(key, ex.name.trim());
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
  }, [exercises]);

  // Plots the heaviest set logged for this exercise on each date it appears — a per-set
  // model has no single "the" weight for a given day, so the top set is the meaningful
  // number for a progress trend.
  const progressData = useMemo(() => {
    if (!selectedExerciseName) return [];
    const key = selectedExerciseName.toLowerCase();
    const points: { date: string; weight: number }[] = [];
    for (const ex of exercises) {
      if (ex.name.trim().toLowerCase() !== key) continue;
      const date = workoutDateById.get(ex.workout_id);
      if (!date) continue;
      const weights = sets.filter((s) => s.exercise_id === ex.id && s.weight != null).map((s) => s.weight as number);
      if (weights.length === 0) continue;
      points.push({ date, weight: Math.max(...weights) });
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [exercises, sets, selectedExerciseName, workoutDateById]);

  const dailyTotals = useMemo(() => {
    const days: { date: string; calories: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDaysISO(rangeEnd, -i);
      const total = trendMeals.filter((m) => m.meal_date === date).reduce((sum, m) => sum + (m.calories ?? 0), 0);
      days.push({ date, calories: total });
    }
    return days;
  }, [trendMeals, rangeEnd]);

  const todayMacros = useMemo(
    () =>
      trendMeals
        .filter((m) => m.meal_date === rangeEnd)
        .reduce(
          (acc, m) => ({
            protein: acc.protein + (m.protein_g ?? 0),
            carbs: acc.carbs + (m.carbs_g ?? 0),
            fat: acc.fat + (m.fat_g ?? 0),
          }),
          { protein: 0, carbs: 0, fat: 0 }
        ),
    [trendMeals, rangeEnd]
  );

  const calorieTarget = settings?.calorie_target ?? null;

  if (loading) {
    return <div className="empty-state">Loading…</div>;
  }

  return (
    <div>
      <h2>Muscles worked this week</h2>
      <div className="card" style={{ marginBottom: 24 }}>
        {hasWeekMuscleData ? (
          <BodyDiagram scores={weekMuscleScores} />
        ) : (
          <div className="empty-state">No workouts logged this week yet.</div>
        )}
      </div>

      <h2>Workout Progress</h2>
      {exerciseNames.length === 0 ? (
        <div className="empty-state">No strength exercises logged yet.</div>
      ) : (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="field" style={{ marginBottom: selectedExerciseName ? 12 : 0 }}>
            <label htmlFor="exercise-select">Exercise</label>
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

      <h2>Macros today</h2>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="chip chip-accent">Protein {round1(todayMacros.protein)}g</span>
        <span className="chip">Carbs {round1(todayMacros.carbs)}g</span>
        <span className="chip">Fat {round1(todayMacros.fat)}g</span>
      </div>
    </div>
  );
}

function WeightTab() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [goalWeight, setGoalWeight] = useState<number | null>(null);
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
      const [weightEntries, settings] = await Promise.all([api.listWeightEntries(), api.getSettings()]);
      setEntries(weightEntries);
      setGoalWeight(settings.goal_weight_lbs);
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

  // Includes the goal weight in the axis range — otherwise the goal reference line can
  // fall outside a domain sized only to the logged data and never render.
  const chartYDomain = useMemo((): [number, number] => {
    const values = entries.map((e) => e.weight_lbs);
    if (goalWeight != null) values.push(goalWeight);
    if (values.length === 0) return [0, 100];
    return [Math.floor(Math.min(...values) - 3), Math.ceil(Math.max(...values) + 3)];
  }, [entries, goalWeight]);

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

      {(latest || goalWeight != null) && (
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {latest && <span className="chip chip-accent">Latest: {latest.weight_lbs} lb</span>}
          {delta != null && (
            <span className={`chip ${delta > 0 ? "chip-warning" : delta < 0 ? "" : ""}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "–"} {Math.abs(delta)} lb since last entry
            </span>
          )}
          {goalWeight != null && (
            <span className="chip">
              Goal: {goalWeight} lb
              {latest && ` (${round1(Math.abs(latest.weight_lbs - goalWeight))} lb to go)`}
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
                  domain={chartYDomain}
                />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} formatter={(v: number) => [`${v} lb`, "Weight"]} />
                {goalWeight != null && (
                  <ReferenceLine
                    y={goalWeight}
                    stroke="var(--success)"
                    strokeDasharray="4 4"
                    label={{ value: "Goal", fill: "var(--text-dim)", fontSize: 11, position: "insideTopRight" }}
                  />
                )}
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
