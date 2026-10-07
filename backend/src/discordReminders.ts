import fs from "fs";
import path from "path";
import { db } from "./db";
import { APP_DIR } from "./paths";

// Set via the DISCORD_WEBHOOK_URL env var in Coolify — deliberately never committed to
// source, since this repo is public and the URL alone is enough for anyone to post into
// the channel. Reminders are silently skipped (just a console warning) if it's unset.
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

// Marker files record the ET date (YYYY-MM-DD) each reminder last actually fired, so a
// once-a-minute tick only ever runs each check once per day even though it observes the
// target minute for the full 60s it's true, and a restart mid-day doesn't re-fire
// something already sent. Same pattern as scheduledBackup.ts's own marker file.
const HABIT_MARKER = path.join(APP_DIR, ".last-habit-streak-reminder");
const CHORE_MARKER = path.join(APP_DIR, ".last-chore-reminder");

const HABIT_CHECK_HOUR = 23; // 11:00 PM ET — last call before the day's log locks in
const HABIT_CHECK_MINUTE = 0;
const CHORE_CHECK_HOUR = 18; // 6:00 PM ET — evening, leaves tomorrow's full day to plan around it
const CHORE_CHECK_MINUTE = 0;

const TICK_INTERVAL_MS = 60 * 1000;

interface HabitRow {
  id: string;
  name: string;
  target_per_day: number;
}

interface HabitLogRow {
  count: number;
}

interface RecurringTaskRow {
  id: string;
  name: string;
  category: string;
}

// America/New_York wall-clock time — habit_logs.log_date is written by the client in
// its own local calendar date (see calendarUtils.ts's todayISO()), and the user's
// confirmed local timezone is America/New_York, so this is the same "today" the app
// itself already uses for logging, not an arbitrary separate clock.
function getEasternParts(): { hour: number; minute: number; dateStr: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  // hour12: false renders midnight as "24" rather than "00" in some ICU versions.
  const hour = Number(parts.hour) % 24;
  return { hour, minute: Number(parts.minute), dateStr: `${parts.year}-${parts.month}-${parts.day}` };
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function sendDiscordMessage(content: string): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn("[anchor] DISCORD_WEBHOOK_URL not set — skipping reminder:", content);
    return;
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error("[anchor] Discord webhook returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[anchor] Discord webhook request failed:", err);
  }
}

function readMarkerDate(markerPath: string): string | null {
  try {
    return fs.readFileSync(markerPath, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function writeMarkerDate(markerPath: string, dateStr: string): void {
  fs.writeFileSync(markerPath, dateStr);
}

function habitLogCount(habitId: string, logDate: string): number {
  const row = db.query<HabitLogRow, [string, string]>("SELECT count FROM habit_logs WHERE habit_id = ? AND log_date = ?").get(
    habitId,
    logDate
  );
  return row?.count ?? 0;
}

// Only habits with an active streak genuinely at risk tonight: already done today means
// nothing to warn about, and a streak that was already broken before today (yesterday
// not done) isn't "about to" break — it already did, with nothing new to say about it.
export async function checkHabitStreaksAtRisk(todayStr: string): Promise<void> {
  const habits = db.query<HabitRow, []>("SELECT id, name, target_per_day FROM habits").all();
  const yesterdayStr = addDaysToDateStr(todayStr, -1);

  for (const habit of habits) {
    if (habitLogCount(habit.id, todayStr) >= habit.target_per_day) continue;
    if (habitLogCount(habit.id, yesterdayStr) < habit.target_per_day) continue;

    let streak = 0;
    let cursor = yesterdayStr;
    while (habitLogCount(habit.id, cursor) >= habit.target_per_day) {
      streak += 1;
      cursor = addDaysToDateStr(cursor, -1);
    }

    await sendDiscordMessage(
      `🔥 **${habit.name}** — you're about to lose your ${streak}-day streak! Log it before midnight to keep it going.`
    );
  }
}

export async function checkChoresDueTomorrow(todayStr: string): Promise<void> {
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const tasks = db
    .query<RecurringTaskRow, [string]>(
      "SELECT id, name, category FROM recurring_tasks WHERE substr(next_due_at, 1, 10) = ?"
    )
    .all(tomorrowStr);

  for (const task of tasks) {
    const label = task.category === "maintenance" ? "Maintenance" : "Chore";
    await sendDiscordMessage(`🧹 **${task.name}** (${label}) is due tomorrow.`);
  }
}

// Ticks every minute rather than scheduling exact 24h-out timeouts, matching
// scheduledBackup.ts's own approach — a redeploy or restart never leaves a timer
// permanently drifted or silently dropped, just observes the next tick as usual.
export function startDiscordReminders(): void {
  setInterval(() => {
    const { hour, minute, dateStr } = getEasternParts();

    if (hour === HABIT_CHECK_HOUR && minute === HABIT_CHECK_MINUTE && readMarkerDate(HABIT_MARKER) !== dateStr) {
      writeMarkerDate(HABIT_MARKER, dateStr);
      checkHabitStreaksAtRisk(dateStr).catch((err) => console.error("[anchor] habit streak reminder failed:", err));
    }

    if (hour === CHORE_CHECK_HOUR && minute === CHORE_CHECK_MINUTE && readMarkerDate(CHORE_MARKER) !== dateStr) {
      writeMarkerDate(CHORE_MARKER, dateStr);
      checkChoresDueTomorrow(dateStr).catch((err) => console.error("[anchor] chore reminder failed:", err));
    }
  }, TICK_INTERVAL_MS);
}
