export interface DayCell {
  date: Date;
  inMonth: boolean;
}

// Sunday-first weeks covering the full month plus leading/trailing days from adjacent
// months to fill out the grid. Shared by Calendar.tsx and the workout streak calendar.
export function buildMonthGrid(year: number, month: number): DayCell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cursor = new Date(year, month, 1 - startOffset);
  const weeks: DayCell[][] = [];
  for (let i = 0; i < totalCells; i += 7) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local calendar date, not UTC. Every "did I do X today" check (workout streaks, food
// streaks, the Today page's log-reminders) must use this same local-date convention as
// how workout_date/meal_date get written — a UTC-based date string can land on the wrong
// side of midnight versus the browser's local "today" and silently miscount a streak or
// misfire a reminder. See Workouts.tsx's original todayISO() bug for the concrete case
// this fixed (a workout logged for "today" failed to register as extending the streak).
export function todayISO(): string {
  return fmtLocal(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + days);
  return fmtLocal(d);
}

// Counts backward from today (or from yesterday, if today just hasn't happened yet —
// logging nothing so far this morning shouldn't zero out an otherwise-live streak).
// `dates` is any set of "YYYY-MM-DD" strings — workout_date, meal_date, whatever the
// caller is tracking a streak over.
export function computeStreaks(dates: Set<string>): { current: number } {
  let current = 0;
  const cursor = new Date();
  if (!dates.has(fmtLocal(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(fmtLocal(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current };
}
