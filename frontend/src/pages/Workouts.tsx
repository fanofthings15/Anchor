import { useEffect, useMemo, useState } from "react";
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
import { api, type Meal, type UserSettings, type Workout, type WorkoutExercise } from "../api/client";

type Tab = "workouts" | "food";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

export default function Workouts() {
  const [tab, setTab] = useState<Tab>("workouts");

  return (
    <div>
      <h1>Workouts</h1>
      <div className="tabs">
        <button type="button" className={`tab ${tab === "workouts" ? "active" : ""}`} onClick={() => setTab("workouts")}>
          Workouts
        </button>
        <button type="button" className={`tab ${tab === "food" ? "active" : ""}`} onClick={() => setTab("food")}>
          Food
        </button>
      </div>
      {tab === "workouts" ? <WorkoutsTab /> : <FoodTab />}
    </div>
  );
}

function WorkoutsTab() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState(() => todayISO());
  const [quickName, setQuickName] = useState("");
  const [selectedExerciseName, setSelectedExerciseName] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getWorkouts();
      setWorkouts(data.workouts);
      setExercises(data.exercises);
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

  return (
    <div>
      <form className="quick-add" onSubmit={quickAdd} style={{ flexWrap: "wrap" }}>
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
            />
          ))}
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
}: {
  workout: Workout;
  exercises: WorkoutExercise[];
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddExercise: (data: { name: string; sets?: number; reps?: number; weight?: number }) => void;
  onDeleteExercise: (id: string) => void;
}) {
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
        </div>
      )}
    </div>
  );
}

function FoodTab() {
  const [selectedDate, setSelectedDate] = useState(() => todayISO());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const rangeStart = useMemo(() => addDaysISO(todayISO(), -13), []);
  const rangeEnd = useMemo(() => todayISO(), []);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [mealList, userSettings] = await Promise.all([api.listMeals(rangeStart, rangeEnd), api.getSettings()]);
      setMeals(mealList);
      setSettings(userSettings);
    } finally {
      setLoading(false);
    }
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const meal = await api.createMeal({
      meal_date: selectedDate,
      name: trimmed,
      calories: calories ? Number(calories) : undefined,
      protein_g: protein ? Number(protein) : undefined,
      carbs_g: carbs ? Number(carbs) : undefined,
      fat_g: fat ? Number(fat) : undefined,
    });
    setMeals((prev) => [meal, ...prev]);
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
  }

  async function remove(id: string) {
    await api.deleteMeal(id);
    setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  const dayMeals = useMemo(
    () => meals.filter((m) => m.meal_date === selectedDate).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [meals, selectedDate]
  );

  const dailyTotals = useMemo(() => {
    const days: { date: string; calories: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = addDaysISO(rangeEnd, -i);
      const total = meals.filter((m) => m.meal_date === date).reduce((sum, m) => sum + (m.calories ?? 0), 0);
      days.push({ date, calories: total });
    }
    return days;
  }, [meals, rangeEnd]);

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
      <div className="field">
        <label htmlFor="meal-date">Date</label>
        <input id="meal-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
      </div>

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

      {loading ? (
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
