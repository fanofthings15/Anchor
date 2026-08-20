import { Router } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { UPLOADS_DIR } from "../paths";

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

interface NoteImageRow {
  id: string;
  user_id: string;
  note_id: string;
  mime_type: string;
  created_at: string;
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

function serializeImage(row: NoteImageRow) {
  return { id: row.id, note_id: row.note_id, mime_type: row.mime_type, created_at: row.created_at };
}

// Pasted images are validated against this allowlist (both for the upload's declared
// mime type and to pick a file extension) — anything else is rejected outright rather
// than stored with a guessed/untrusted type.
const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function imageFilePath(id: string, mimeType: string): string {
  return path.join(UPLOADS_DIR, `${id}.${ALLOWED_IMAGE_MIME[mimeType] ?? "bin"}`);
}

function deleteImageFile(row: NoteImageRow): void {
  fs.rm(imageFilePath(row.id, row.mime_type), { force: true }, () => {});
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

// GET /api/notes/images/:id — declared before GET /:id so a fixed "images" first segment
// never gets swallowed by the :id param (Express matches by segment shape, but keeping
// the more specific route first reads more safely regardless).
notesRouter.get("/images/:id", (req, res) => {
  const row = db
    .query<NoteImageRow, [string, string]>("SELECT * FROM note_images WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (!row) {
    res.status(404).end();
    return;
  }
  const filePath = imageFilePath(row.id, row.mime_type);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", row.mime_type);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  fs.createReadStream(filePath).pipe(res);
});

notesRouter.delete("/images/:id", (req, res) => {
  const row = db
    .query<NoteImageRow, [string, string]>("SELECT * FROM note_images WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.uid);
  if (row) {
    deleteImageFile(row);
    db.query("DELETE FROM note_images WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  }
  res.json({ ok: true });
});

notesRouter.get("/:id", (req, res) => {
  const row = db.query<NoteRow, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(serialize(row));
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
  const images = db
    .query<NoteImageRow, [string, string]>("SELECT * FROM note_images WHERE note_id = ? AND user_id = ?")
    .all(req.params.id, req.uid);
  for (const image of images) deleteImageFile(image);
  db.query("DELETE FROM note_images WHERE note_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM notes WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

notesRouter.get("/:id/images", (req, res) => {
  const note = db.query<{ id: string }, [string, string]>("SELECT id FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!note) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rows = db
    .query<NoteImageRow, [string, string]>("SELECT * FROM note_images WHERE note_id = ? AND user_id = ? ORDER BY created_at ASC")
    .all(req.params.id, req.uid);
  res.json(rows.map(serializeImage));
});

// Accepts a base64 data URI (what FileReader.readAsDataURL gives the frontend's paste
// handler) rather than multipart — avoids adding a multipart-parsing dependency for what
// is, in practice, one pasted screenshot at a time.
notesRouter.post("/:id/images", (req, res) => {
  const note = db.query<{ id: string }, [string, string]>("SELECT id FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!note) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { data_url } = req.body ?? {};
  if (typeof data_url !== "string") {
    res.status(400).json({ error: "data_url is required" });
    return;
  }
  const match = data_url.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "data_url must be a base64 data URI" });
    return;
  }
  const mimeType = match[1];
  if (!ALLOWED_IMAGE_MIME[mimeType]) {
    res.status(400).json({ error: `unsupported image type ${mimeType}` });
    return;
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    res.status(400).json({ error: "image must be under 8MB" });
    return;
  }
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  fs.writeFileSync(imageFilePath(id, mimeType), buffer);
  db.query("INSERT INTO note_images (id, user_id, note_id, mime_type, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    req.uid,
    req.params.id,
    mimeType,
    created_at
  );
  res.status(201).json({ id, note_id: req.params.id, mime_type: mimeType, created_at });
});
