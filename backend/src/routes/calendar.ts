import { Router } from "express";
import { db } from "../db";

export const calendarRouter = Router();

interface CalendarEventRow {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  start_at: string;
  end_at: string | null;
  all_day: number;
  location: string;
  created_at: string;
}

function serialize(row: CalendarEventRow) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    start_at: row.start_at,
    end_at: row.end_at,
    all_day: row.all_day === 1,
    location: row.location,
    created_at: row.created_at,
  };
}

calendarRouter.get("/", (req, res) => {
  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    res.status(400).json({ error: "from and to query params are required" });
    return;
  }
  const rows = db
    .query<CalendarEventRow, [string, string, string]>(
      "SELECT * FROM calendar_events WHERE user_id = ? AND start_at >= ? AND start_at < ? ORDER BY start_at ASC"
    )
    .all(req.uid, from, to);
  res.json(rows.map(serialize));
});

calendarRouter.post("/", (req, res) => {
  const { title, notes = "", start_at, end_at = null, all_day = false, location = "" } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (typeof start_at !== "string" || !start_at) {
    res.status(400).json({ error: "start_at is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO calendar_events (id, user_id, title, notes, start_at, end_at, all_day, location, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, req.uid, title.trim(), notes, start_at, end_at, all_day ? 1 : 0, location, now);
  const row = db.query<CalendarEventRow, [string]>("SELECT * FROM calendar_events WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row));
});

calendarRouter.patch("/:id", (req, res) => {
  const existing = db
    .query<CalendarEventRow, [string, string]>("SELECT * FROM calendar_events WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { title, notes, start_at, end_at, all_day, location } = req.body ?? {};
  const next: CalendarEventRow = {
    ...existing,
    title: typeof title === "string" ? title : existing.title,
    notes: typeof notes === "string" ? notes : existing.notes,
    start_at: typeof start_at === "string" ? start_at : existing.start_at,
    end_at: end_at === null || typeof end_at === "string" ? end_at : existing.end_at,
    all_day: typeof all_day === "boolean" ? (all_day ? 1 : 0) : existing.all_day,
    location: typeof location === "string" ? location : existing.location,
  };
  db.query(
    "UPDATE calendar_events SET title = ?, notes = ?, start_at = ?, end_at = ?, all_day = ?, location = ? WHERE id = ? AND user_id = ?"
  ).run(next.title, next.notes, next.start_at, next.end_at, next.all_day, next.location, req.params.id, req.uid);
  res.json(serialize(next));
});

calendarRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM calendar_events WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
