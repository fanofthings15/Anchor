import { Router } from "express";
import { db } from "../db";

export const weightRouter = Router();

interface WeightEntryRow {
  id: string;
  user_id: string;
  entry_date: string;
  weight_lbs: number;
  notes: string;
  created_at: string;
}

function serialize(row: WeightEntryRow) {
  return {
    id: row.id,
    entry_date: row.entry_date,
    weight_lbs: row.weight_lbs,
    notes: row.notes,
    created_at: row.created_at,
  };
}

// GET /api/weight — every logged weight entry, oldest first (chart-ready order). No
// date-range scoping, unlike meals — a weight trend is most useful viewed over its full
// history, same reasoning as the investments chart's unscoped GET.
weightRouter.get("/", (req, res) => {
  const rows = db
    .query<WeightEntryRow, [string]>("SELECT * FROM weight_entries WHERE user_id = ? ORDER BY entry_date ASC, created_at ASC")
    .all(req.uid);
  res.json(rows.map(serialize));
});

weightRouter.post("/", (req, res) => {
  const { entry_date, weight_lbs, notes = "" } = req.body ?? {};
  if (typeof entry_date !== "string" || !entry_date.trim()) {
    res.status(400).json({ error: "entry_date is required" });
    return;
  }
  if (typeof weight_lbs !== "number" || !Number.isFinite(weight_lbs) || weight_lbs <= 0) {
    res.status(400).json({ error: "weight_lbs must be a positive number" });
    return;
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  db.query(
    "INSERT INTO weight_entries (id, user_id, entry_date, weight_lbs, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, req.uid, entry_date, weight_lbs, typeof notes === "string" ? notes : "", created_at);
  const row = db.query<WeightEntryRow, [string]>("SELECT * FROM weight_entries WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row));
});

weightRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM weight_entries WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
