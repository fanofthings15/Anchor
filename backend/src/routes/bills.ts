import { Router } from "express";
import { db } from "../db";
import { computeNextDue, type Recurrence } from "../recurrence";

export const billsRouter = Router();

interface BillRow {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  category: string;
  autopay: number;
  notes: string;
  recurrence: Recurrence;
  recurrence_interval_days: number | null;
  last_paid_at: string | null;
  next_due_at: string;
  created_at: string;
}

function serialize(row: BillRow) {
  return {
    id: row.id,
    name: row.name,
    amount_cents: row.amount_cents,
    category: row.category,
    autopay: row.autopay === 1,
    notes: row.notes,
    recurrence: row.recurrence,
    recurrence_interval_days: row.recurrence_interval_days,
    last_paid_at: row.last_paid_at,
    next_due_at: row.next_due_at,
    created_at: row.created_at,
  };
}

billsRouter.get("/", (req, res) => {
  const rows = db
    .query<BillRow, [string]>("SELECT * FROM bills WHERE user_id = ? ORDER BY next_due_at ASC")
    .all(req.uid);
  res.json(rows.map(serialize));
});

billsRouter.post("/", (req, res) => {
  const {
    name,
    amount_cents,
    category = "",
    autopay = false,
    notes = "",
    recurrence,
    recurrence_interval_days = null,
    next_due_at,
  } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof amount_cents !== "number" || !Number.isFinite(amount_cents)) {
    res.status(400).json({ error: "amount_cents is required" });
    return;
  }
  if (typeof recurrence !== "string") {
    res.status(400).json({ error: "recurrence is required" });
    return;
  }
  if (typeof next_due_at !== "string" || !next_due_at) {
    res.status(400).json({ error: "next_due_at is required" });
    return;
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    `INSERT INTO bills (id, user_id, name, amount_cents, category, autopay, notes, recurrence, recurrence_interval_days, last_paid_at, next_due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    req.uid,
    name.trim(),
    amount_cents,
    category,
    autopay ? 1 : 0,
    notes,
    recurrence,
    recurrence_interval_days,
    next_due_at,
    now
  );
  const row = db.query<BillRow, [string]>("SELECT * FROM bills WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row));
});

billsRouter.patch("/:id", (req, res) => {
  const existing = db
    .query<BillRow, [string, string]>("SELECT * FROM bills WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { name, amount_cents, category, autopay, notes, recurrence, recurrence_interval_days, next_due_at } =
    req.body ?? {};

  const next: BillRow = {
    ...existing,
    name: typeof name === "string" ? name : existing.name,
    amount_cents: typeof amount_cents === "number" ? amount_cents : existing.amount_cents,
    category: typeof category === "string" ? category : existing.category,
    autopay: typeof autopay === "boolean" ? (autopay ? 1 : 0) : existing.autopay,
    notes: typeof notes === "string" ? notes : existing.notes,
    recurrence: typeof recurrence === "string" ? (recurrence as Recurrence) : existing.recurrence,
    recurrence_interval_days:
      recurrence_interval_days === undefined ? existing.recurrence_interval_days : recurrence_interval_days,
    next_due_at: typeof next_due_at === "string" ? next_due_at : existing.next_due_at,
  };

  db.query(
    `UPDATE bills SET name = ?, amount_cents = ?, category = ?, autopay = ?, notes = ?, recurrence = ?, recurrence_interval_days = ?, next_due_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    next.name,
    next.amount_cents,
    next.category,
    next.autopay,
    next.notes,
    next.recurrence,
    next.recurrence_interval_days,
    next.next_due_at,
    req.params.id,
    req.uid
  );
  res.json(serialize(next));
});

billsRouter.post("/:id/pay", (req, res) => {
  const existing = db
    .query<BillRow, [string, string]>("SELECT * FROM bills WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const computedNext = computeNextDue(existing.recurrence, existing.recurrence_interval_days, now);
  const next: BillRow = {
    ...existing,
    last_paid_at: nowIso,
    next_due_at: computedNext ?? existing.next_due_at,
  };

  db.query("UPDATE bills SET last_paid_at = ?, next_due_at = ? WHERE id = ? AND user_id = ?").run(
    next.last_paid_at,
    next.next_due_at,
    req.params.id,
    req.uid
  );
  res.json(serialize(next));
});

billsRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM bills WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
