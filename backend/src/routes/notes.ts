import { Router } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { UPLOADS_DIR } from "../paths";
import { hashPin, hasNotesUnlock, issueUnlockToken } from "../auth/notesPin";

export const notesRouter = Router();

interface NoteRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  tags: string;
  pinned: number;
  locked: number;
  sort_order: number;
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

// `unlocked` reflects whether *this request* proved PIN knowledge (via the
// X-notes-unlock header) — body/tags are redacted for a locked note when it didn't.
// `requires_unlock` tells the frontend explicitly when to show the PIN-gate screen
// instead of guessing from an empty body (a genuinely empty unlocked note looks the
// same as a redacted one otherwise).
function serialize(row: NoteRow, unlocked: boolean) {
  const isLocked = row.locked === 1;
  const redact = isLocked && !unlocked;
  return {
    id: row.id,
    title: row.title,
    body: redact ? "" : row.body,
    tags: redact ? [] : (JSON.parse(row.tags) as string[]),
    pinned: row.pinned === 1,
    locked: isLocked,
    requires_unlock: redact,
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
  const unlocked = hasNotesUnlock(req);
  const rows = db
    .query<NoteRow, [string]>("SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, sort_order ASC")
    .all(req.uid);
  res.json(rows.map((row) => serialize(row, unlocked)));
});

notesRouter.post("/", (req, res) => {
  const { title, body = "", tags = [] } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const maxOrderRow = db
    .query<{ m: number | null }, [string]>("SELECT MAX(sort_order) as m FROM notes WHERE user_id = ? AND pinned = 0")
    .get(req.uid);
  const sort_order = (maxOrderRow?.m ?? -1) + 1;
  db.query(
    "INSERT INTO notes (id, user_id, title, body, tags, pinned, locked, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)"
  ).run(id, req.uid, title.trim(), body, JSON.stringify(tags), sort_order, now, now);
  const row = db.query<NoteRow, [string]>("SELECT * FROM notes WHERE id = ?").get(id)!;
  res.status(201).json(serialize(row, true));
});

// PATCH /api/notes/reorder — persist a new note order (drag-and-drop). Declared before
// PATCH /:id so the literal "reorder" path segment can't be swallowed by the :id param.
// Not gated on unlock — dragging only changes position, never reveals content, so locked
// notes (visible as title-only rows in the list) stay draggable without entering the PIN.
notesRouter.patch("/reorder", (req, res) => {
  const { ordered_ids } = req.body ?? {};
  if (!Array.isArray(ordered_ids) || ordered_ids.some((id) => typeof id !== "string")) {
    res.status(400).json({ error: "ordered_ids must be an array of note ids" });
    return;
  }
  const unlocked = hasNotesUnlock(req);
  const update = db.query("UPDATE notes SET sort_order = ? WHERE id = ? AND user_id = ?");
  ordered_ids.forEach((id: string, index: number) => update.run(index, id, req.uid));
  const rows = db
    .query<NoteRow, [string]>("SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, sort_order ASC")
    .all(req.uid);
  res.json(rows.map((row) => serialize(row, unlocked)));
});

// POST /api/notes/unlock — verifies the notes PIN and, on success, issues a signed
// token the frontend attaches (via X-notes-unlock) to subsequent requests for the rest
// of the browser session to reveal locked notes' content.
notesRouter.post("/unlock", (req, res) => {
  const { pin } = req.body ?? {};
  if (typeof pin !== "string") {
    res.status(400).json({ error: "pin is required" });
    return;
  }
  const settings = db
    .query<{ notes_pin_hash: string | null }, [string]>("SELECT notes_pin_hash FROM user_settings WHERE user_id = ?")
    .get(req.uid);
  if (!settings?.notes_pin_hash) {
    res.status(400).json({ error: "no PIN configured" });
    return;
  }
  if (hashPin(pin) !== settings.notes_pin_hash) {
    res.status(401).json({ error: "incorrect pin" });
    return;
  }
  res.json({ token: issueUnlockToken(req.uid) });
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
  const note = db.query<{ locked: number }, [string, string]>("SELECT locked FROM notes WHERE id = ? AND user_id = ?").get(row.note_id, req.uid);
  if (note?.locked === 1 && !hasNotesUnlock(req)) {
    res.status(403).end();
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
    const note = db.query<{ locked: number }, [string, string]>("SELECT locked FROM notes WHERE id = ? AND user_id = ?").get(row.note_id, req.uid);
    if (note?.locked === 1 && !hasNotesUnlock(req)) {
      res.status(403).json({ error: "locked" });
      return;
    }
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
  res.json(serialize(row, hasNotesUnlock(req)));
});

notesRouter.patch("/:id", (req, res) => {
  const existing = db.query<NoteRow, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const unlocked = hasNotesUnlock(req);
  if (existing.locked === 1 && !unlocked) {
    res.status(403).json({ error: "locked" });
    return;
  }
  const { title, body, tags, pinned, locked } = req.body ?? {};
  const next: NoteRow = {
    ...existing,
    title: typeof title === "string" ? title : existing.title,
    body: typeof body === "string" ? body : existing.body,
    tags: Array.isArray(tags) ? JSON.stringify(tags) : existing.tags,
    pinned: typeof pinned === "boolean" ? (pinned ? 1 : 0) : existing.pinned,
    locked: typeof locked === "boolean" ? (locked ? 1 : 0) : existing.locked,
    updated_at: new Date().toISOString(),
  };
  db.query(
    "UPDATE notes SET title = ?, body = ?, tags = ?, pinned = ?, locked = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).run(next.title, next.body, next.tags, next.pinned, next.locked, next.updated_at, req.params.id, req.uid);
  // Reaching this point already proves access (either the note wasn't locked, or the
  // gate above required a valid unlock token) — always return the real content, not a
  // redacted view of the edit the caller just made.
  res.json(serialize(next, true));
});

notesRouter.delete("/:id", (req, res) => {
  const existing = db.query<NoteRow, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (existing.locked === 1 && !hasNotesUnlock(req)) {
    res.status(403).json({ error: "locked" });
    return;
  }
  const images = db
    .query<NoteImageRow, [string, string]>("SELECT * FROM note_images WHERE note_id = ? AND user_id = ?")
    .all(req.params.id, req.uid);
  for (const image of images) deleteImageFile(image);
  db.query("DELETE FROM note_images WHERE note_id = ? AND user_id = ?").run(req.params.id, req.uid);
  db.query("DELETE FROM notes WHERE id = ? AND user_id = ?").run(req.params.id, req.uid);
  res.json({ ok: true });
});

notesRouter.get("/:id/images", (req, res) => {
  const note = db.query<NoteRow, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!note) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (note.locked === 1 && !hasNotesUnlock(req)) {
    res.status(403).json({ error: "locked" });
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
  const note = db.query<NoteRow, [string, string]>("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, req.uid);
  if (!note) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (note.locked === 1 && !hasNotesUnlock(req)) {
    res.status(403).json({ error: "locked" });
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
