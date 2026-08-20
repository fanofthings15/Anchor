import { Router } from "express";
import { db } from "../db";

export const notesRouter = Router();

interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  tags: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

function serialize(row: NoteRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: JSON.parse(row.tags) as string[],
    pinned: row.pinned === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

notesRouter.get("/", (req, res) => {
  const rows = db
    .query<NoteRow, [string]>("SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC")
    .all(req.uid);
  res.json(rows.map(serialize));
});

notesRouter.post("/", (req, res) => {
  const { title, body = "", tags = [] } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO notes (id, user_id, title, body, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
  ).run(id, req.uid, title.trim(), body, JSON.stringify(tags), now, now);
  const row = db.query<NoteRow, [string]>("SELECT * FROM notes WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row));
});

notesRouter.patch("/:id", (req, res) => {
  const existing = db.query<NoteRow, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { title, body, tags, pinned } = req.body ?? {};
  const next: NoteRow = {
    ...existing,
    title: typeof title === "string" ? title : existing.title,
    body: typeof body === "string" ? body : existing.body,
    tags: Array.isArray(tags) ? JSON.stringify(tags) : existing.tags,
    pinned: typeof pinned === "boolean" ? (pinned ? 1 : 0) : existing.pinned,
    updated_at: new Date().toISOString(),
  };
  db.query("UPDATE notes SET title = ?, body = ?, tags = ?, pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
    next.title,
    next.body,
    next.tags,
    next.pinned,
    next.updated_at,
    req.params.id,
    req.uid
  );
  res.json(serialize(next));
});

notesRouter.delete("/:id", (req, res) => {
  db.query("DELETE FROM notes WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});
