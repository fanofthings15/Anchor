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
