import { Router } from "express";
import { db } from "../db";
import { computeNextDue, RECURRENCE_VALUES, type Recurrence } from "../recurrence";

export const cleaningRouter = Router();

interface RecurringTaskRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  notes: string;
  recurrence: string;
  recurrence_interval_days: number | null;
  last_completed_at: string | null;
  next_due_at: string;
  created_at: string;
}

function serialize(row: RecurringTaskRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category as "cleaning" | "maintenance",
    notes: row.notes,
    recurrence: row.recurrence as Recurrence,
    recurrence_interval_days: row.recurrence_interval_days,
    last_completed_at: row.last_completed_at,
    next_due_at: row.next_due_at,
    created_at: row.created_at,
  };
}

cleaningRouter.get("/", (req, res) => {
  const rows = db
    .query<RecurringTaskRow, [string]>("SELECT * FROM recurring_tasks WHERE user_id = ? ORDER BY next_due_at ASC")
    .all(req.uid);
  res.json(rows.map(serialize));
});

cleaningRouter.post("/", (req, res) => {
  const { name, category, notes = "", recurrence, recurrence_interval_days = null, next_due_at } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (category !== "cleaning" && category !== "maintenance") {
    res.status(400).json({ error: "category must be 'cleaning' or 'maintenance'" });
    return;
  }
  if (typeof recurrence !== "string" || !RECURRENCE_VALUES.includes(recurrence as Recurrence)) {
    res.status(400).json({ error: "invalid recurrence" });
    return;
  }
  if (typeof next_due_at !== "string" || !next_due_at) {
    res.status(400).json({ error: "next_due_at is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO recurring_tasks
      (id, user_id, name, category, notes, recurrence, recurrence_interval_days, last_completed_at, next_due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    req.uid,
    name.trim(),
    category,
    notes,
    recurrence,
    typeof recurrence_interval_days === "number" ? recurrence_interval_days : null,
    next_due_at,
    now
  );
  const row = db.query<RecurringTaskRow, [string]>("SELECT * FROM recurring_tasks WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row));
});

cleaningRouter.patch("/:id", (req, res) => {
  const existing = db
    .query<RecurringTaskRow, [string, string]>("SELECT * FROM recurring_tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { name, category, notes, recurrence, recurrence_interval_days, next_due_at } = req.body ?? {};
  const next: RecurringTaskRow = {
    ...existing,
    name: typeof name === "string" && name.trim() ? name.trim() : existing.name,
    category: category === "cleaning" || category === "maintenance" ? category : existing.category,
    notes: typeof notes === "string" ? notes : existing.notes,
    recurrence:
      typeof recurrence === "string" && RECURRENCE_VALUES.includes(recurrence as Recurrence)
        ? recurrence
        : existing.recurrence,
    recurrence_interval_days:
      recurrence_interval_days === null || typeof recurrence_interval_days === "number"
        ? recurrence_interval_days
        : existing.recurrence_interval_days,
    next_due_at: typeof next_due_at === "string" && next_due_at ? next_due_at : existing.next_due_at,
  };
  db.query(
    `UPDATE recurring_tasks
     SET name = ?, category = ?, notes = ?, recurrence = ?, recurrence_interval_days = ?, next_due_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    next.name,
    next.category,
    next.notes,
    next.recurrence,
    next.recurrence_interval_days,
    next.next_due_at,
    req.params.id,
    req.uid
  );
  res.json(serialize(next));
});

cleaningRouter.post("/:id/complete", (req, res) => {
  const existing = db
    .query<RecurringTaskRow, [string, string]>("SELECT * FROM recurring_tasks WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const nextDue = computeNextDue(existing.recurrence as Recurrence, existing.recurrence_interval_days, now);
  const next: RecurringTaskRow = {
    ...existing,
    last_completed_at: nowIso,
    next_due_at: nextDue ?? existing.next_due_at,
  };
  db.query("UPDATE recurring_tasks SET last_completed_at = ?, next_due_at = ? WHERE id = ? AND user_id = ?").run(
    next.last_completed_at,
    next.next_due_at,
    req.params.id,
    req.uid
  );
  res.json(serialize(next));
});

cleaningRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM recurring_tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
