import { useEffect, useMemo, useState } from "react";
import { api, type CalendarEvent, type RecurringTask } from "../api/client";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_EVENTS_PER_CELL = 3;

function taskIcon(category: RecurringTask["category"]): string {
  return category === "cleaning" ? "🧹" : "🔧";
}

interface DayCell {
  date: Date;
  inMonth: boolean;
}

// Sunday-first weeks covering the full month plus leading/trailing days from
// adjacent months to fill out the grid.
function buildMonthGrid(year: number, month: number): DayCell[][] {
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

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Compact form for inside a day cell — "9:00am" rather than "9:00 AM", since cells only
// have a few pixels of width to work with.
function formatShortTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(" ", "")
    .toLowerCase();
}

export default function Calendar() {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("09:00");
  const [formEndTime, setFormEndTime] = useState("");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formLocation, setFormLocation] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = new Date();

  useEffect(() => {
    load();
  }, [year, month]);

  // Recurring cleaning/maintenance tasks aren't range-scoped like events — each one just
  // carries a single next_due_at, and the full list is small for a personal app — so it's
  // loaded once (and again after "mark done" shifts a task's due date) rather than
  // refetched on every month change.
  useEffect(() => {
    loadTasks();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const from = new Date(year, month, 1).toISOString();
      const to = new Date(year, month + 1, 1).toISOString();
      setEvents(await api.listCalendarEvents(from, to));
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks() {
    setTasks(await api.listRecurringTasks());
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = new Date(e.start_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    return map;
  }, [events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, RecurringTask[]>();
    for (const t of tasks) {
      const key = new Date(t.next_due_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const selectedDayEvents = selectedDate ? eventsByDay.get(selectedDate.toDateString()) ?? [] : [];
  const selectedDayTasks = selectedDate ? tasksByDay.get(selectedDate.toDateString()) ?? [] : [];

  async function completeTask(id: string) {
    await api.completeRecurringTask(id);
    loadTasks();
  }

  function goToMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
    setSelectedDate(null);
    setShowForm(false);
  }

  function goToday() {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
    setShowForm(false);
  }

  function selectDay(date: Date) {
    setSelectedDate(sameDay(date, selectedDate ?? new Date(0)) ? null : date);
    setShowForm(false);
  }

  function openAddForm() {
    const base = selectedDate ?? today;
    setFormTitle("");
    setFormDate(dateInputValue(base));
    setFormStartTime("09:00");
    setFormEndTime("");
    setFormAllDay(false);
    setFormLocation("");
    setFormNotes("");
    setShowForm(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title || !formDate) return;

    const start_at = new Date(`${formDate}T${formAllDay ? "00:00" : formStartTime || "00:00"}`).toISOString();
    const end_at = !formAllDay && formEndTime ? new Date(`${formDate}T${formEndTime}`).toISOString() : null;

    const created = await api.createCalendarEvent({
      title,
      notes: formNotes,
      start_at,
      end_at,
      all_day: formAllDay,
      location: formLocation,
    });

    const createdDate = new Date(created.start_at);
    if (createdDate.getFullYear() === year && createdDate.getMonth() === month) {
      setEvents((prev) => [...prev, created]);
    }
    setSelectedDate(createdDate);
    setShowForm(false);
  }

  async function removeEvent(id: string) {
    await api.deleteCalendarEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <h1>Calendar</h1>

      <div className="calendar-nav">
        <button type="button" className="btn" onClick={() => goToMonth(-1)} aria-label="Previous month">
          ‹
        </button>
        <span className="calendar-title">{viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button type="button" className="btn" onClick={() => goToMonth(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <button type="button" className="btn" style={{ width: "100%", marginBottom: 12 }} onClick={goToday}>
        Today
      </button>

      {loading ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <div className="calendar-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="calendar-weekday">
              {w}
            </div>
          ))}

          {weeks.flat().map((cell, i) => {
            const dayEvents = eventsByDay.get(cell.date.toDateString()) ?? [];
            const dayTasks = tasksByDay.get(cell.date.toDateString()) ?? [];
            const isToday = sameDay(cell.date, today);
            const isSelected = selectedDate !== null && sameDay(cell.date, selectedDate);
            const shownEvents = dayEvents.slice(0, MAX_EVENTS_PER_CELL);
            const shownTasks = dayTasks.slice(0, Math.max(0, MAX_EVENTS_PER_CELL - shownEvents.length));
            const extra = dayEvents.length - shownEvents.length + (dayTasks.length - shownTasks.length);
            return (
              <button
                key={i}
                type="button"
                className={`calendar-cell${cell.inMonth ? "" : " outside"}${isToday ? " is-today" : ""}${
                  isSelected ? " is-selected" : ""
                }`}
                onClick={() => selectDay(cell.date)}
              >
                <div className="calendar-date">{cell.date.getDate()}</div>
                <div className="calendar-events">
                  {shownEvents.map((ev) => (
                    <div className="calendar-event" key={ev.id} title={ev.title}>
                      {!ev.all_day && <span className="calendar-event-time">{formatShortTime(ev.start_at)} </span>}
                      {ev.title}
                    </div>
                  ))}
                  {shownTasks.map((t) => (
                    <div className="calendar-event calendar-task" key={t.id} title={t.name}>
                      {taskIcon(t.category)} {t.name}
                    </div>
                  ))}
                  {extra > 0 && <div className="calendar-more">+{extra} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row-between">
            <strong>
              {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </strong>
            <button type="button" className="btn-icon" onClick={() => setSelectedDate(null)} aria-label="Close day">
              ✕
            </button>
          </div>

          {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 ? (
            <div className="empty-state">Nothing this day.</div>
          ) : (
            <div className="list" style={{ marginTop: 10 }}>
              {selectedDayEvents.map((ev) => (
                <div className="card" key={ev.id} style={{ marginBottom: 0 }}>
                  <div className="row-between">
                    <div>
                      <div className="row">
                        <span className="chip">{ev.all_day ? "All day" : formatTime(ev.start_at)}</span>
                        {!ev.all_day && ev.end_at && <span className="text-dim">– {formatTime(ev.end_at)}</span>}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <strong>{ev.title}</strong>
                      </div>
                      {ev.location && <div className="text-dim" style={{ fontSize: 13 }}>{ev.location}</div>}
                      {ev.notes && <div className="text-dim" style={{ fontSize: 13, marginTop: 4 }}>{ev.notes}</div>}
                    </div>
                    <button
                      type="button"
                      className="btn-icon text-danger"
                      onClick={() => removeEvent(ev.id)}
                      aria-label="Delete event"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {selectedDayTasks.map((t) => (
                <div className="card" key={t.id} style={{ marginBottom: 0 }}>
                  <div className="row-between">
                    <div>
                      <span className="chip chip-warning">
                        {taskIcon(t.category)} {t.category === "cleaning" ? "Cleaning" : "Maintenance"}
                      </span>
                      <div style={{ marginTop: 6 }}>
                        <strong>{t.name}</strong>
                      </div>
                      {t.notes && <div className="text-dim" style={{ fontSize: 13, marginTop: 4 }}>{t.notes}</div>}
                    </div>
                    <button type="button" className="btn btn-primary" onClick={() => completeTask(t.id)}>
                      Mark done
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showForm ? (
            <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={openAddForm}>
              Add event
            </button>
          ) : (
            <form onSubmit={submitForm} style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="cal-title">Title</label>
                <input
                  id="cal-title"
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="cal-date">Date</label>
                <input id="cal-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>

              <div className="field">
                <label className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={formAllDay} onChange={(e) => setFormAllDay(e.target.checked)} />
                  All day
                </label>
              </div>

              {!formAllDay && (
                <>
                  <div className="field">
                    <label htmlFor="cal-start">Start time</label>
                    <input
                      id="cal-start"
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="cal-end">End time (optional)</label>
                    <input id="cal-end" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
                  </div>
                </>
              )}

              <div className="field">
                <label htmlFor="cal-location">Location (optional)</label>
                <input
                  id="cal-location"
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="cal-notes">Notes (optional)</label>
                <textarea id="cal-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </div>

              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
