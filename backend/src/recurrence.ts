export type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom";

export const RECURRENCE_VALUES: Recurrence[] = ["none", "daily", "weekly", "biweekly", "monthly", "yearly", "custom"];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/**
 * Computes the next due date for a recurring item (cleaning/maintenance task or bill)
 * from the date it was just completed/paid. Shared by cleaning.ts and bills.ts so the
 * recurrence rule only has one implementation. `none` has no next occurrence — callers
 * should treat a null return as "done, don't reschedule" (clear next_due_at, or leave
 * the item marked complete with no future date).
 */
export function computeNextDue(recurrence: Recurrence, intervalDays: number | null, fromDate: Date = new Date()): string | null {
  switch (recurrence) {
    case "none":
      return null;
    case "daily":
      return addDays(fromDate, 1).toISOString();
    case "weekly":
      return addDays(fromDate, 7).toISOString();
    case "biweekly":
      return addDays(fromDate, 14).toISOString();
    case "monthly":
      return addMonths(fromDate, 1).toISOString();
    case "yearly":
      return addYears(fromDate, 1).toISOString();
    case "custom":
      return addDays(fromDate, intervalDays && intervalDays > 0 ? intervalDays : 30).toISOString();
  }
}
