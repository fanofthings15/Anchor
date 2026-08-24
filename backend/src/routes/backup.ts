import { Router } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { UPLOADS_DIR } from "../paths";
import { hasNotesUnlock } from "../auth/notesPin";

export const backupRouter = Router();

const BACKUP_VERSION = 1;

// Every user-scoped table except migration_flags (global, not per-user data). Order
// matters for import: parents before children, so a foreign-key-shaped restore never
// references a row that doesn't exist yet.
const TABLES = [
  "notes",
  "todo_lists",
  "todos",
  "recurring_tasks",
  "shopping_lists",
  "shopping_items",
  "calendar_events",
  "bills",
  "investment_accounts",
  "investment_entries",
  "investment_goals",
  "workouts",
  "workout_exercises",
  "workout_sets",
  "workout_routines",
  "workout_routine_exercises",
  "weight_entries",
  "meals",
  "saved_foods",
] as const;

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function imageFilePath(id: string, mimeType: string): string {
  return path.join(UPLOADS_DIR, `${id}.${ALLOWED_IMAGE_MIME[mimeType] ?? "bin"}`);
}

function tableColumns(table: string): string[] {
  return db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

// GET /api/backup/export — every table this user owns, as one self-contained JSON file
// (note images embedded as base64, not referenced by URL, so the download works fully
// offline/offsite with nothing left behind on this server). Settings only exports the
// non-secret preference fields — notes_pin_hash is deliberately never included, so a
// downloaded backup can't itself be used to bypass it.
backupRouter.get("/export", (req, res) => {
  const uid = req.uid;
  const data: Record<string, unknown> = {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
  };

  for (const table of TABLES) {
    data[table] = db.query(`SELECT * FROM ${table} WHERE user_id = ?`).all(uid);
  }

  // Locked notes are redacted here exactly the way the regular notes API redacts them —
  // without a valid unlock token this request carries, a backup can't be used as a
  // side-door around the notes PIN. Unlock notes first (in the app) if you want locked
  // content included in the download.
  const unlocked = hasNotesUnlock(req);
  data.notes = (data.notes as { id: string; locked: number; body: string; tags: string }[]).map((n) => {
    const redact = n.locked === 1 && !unlocked;
    return { ...n, body: redact ? "" : n.body, tags: redact ? "[]" : n.tags };
  });

  const noteIds = new Set((data.notes as { id: string }[]).map((n) => n.id));
  const images = db
    .query<{ id: string; user_id: string; note_id: string; mime_type: string; created_at: string }, [string]>(
      "SELECT * FROM note_images WHERE user_id = ?"
    )
    .all(uid)
    .filter((img) => noteIds.has(img.note_id));
  data.note_images = images.map((img) => {
    let data_url: string | null = null;
    try {
      const buf = fs.readFileSync(imageFilePath(img.id, img.mime_type));
      data_url = `data:${img.mime_type};base64,${buf.toString("base64")}`;
    } catch {
      data_url = null; // file missing on disk — export the row anyway, just without pixels
    }
    return { ...img, data_url };
  });

  const settingsRow = db
    .query<Record<string, unknown> | undefined, [string]>("SELECT * FROM user_settings WHERE user_id = ?")
    .get(uid);
  data.settings = settingsRow
    ? {
        calorie_target: settingsRow.calorie_target,
        protein_target_g: settingsRow.protein_target_g,
        carbs_target_g: settingsRow.carbs_target_g,
        fat_target_g: settingsRow.fat_target_g,
        goal_weight_lbs: settingsRow.goal_weight_lbs,
        theme: settingsRow.theme,
      }
    : null;

  res.setHeader("Content-Disposition", `attachment; filename="anchor-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
});

// POST /api/backup/import — restores every table from a previously exported file,
// scoped entirely to the requesting user (a backup can only ever be restored into the
// account of whoever uploads it — the file's own row-level user_id values are ignored
// on the way back in and overwritten with req.uid). This REPLACES the user's current
// data table-by-table: each table is fully cleared for this user, then every row from
// the backup is reinserted, before moving to the next table — not merged. Rejects
// anything that isn't shaped like an export this same version of the app produced,
// rather than guessing at a looser format.
backupRouter.post("/import", (req, res) => {
  const body = req.body ?? {};
  if (body.version !== BACKUP_VERSION) {
    res.status(400).json({ error: `Unsupported backup version (expected ${BACKUP_VERSION})` });
    return;
  }
  for (const table of TABLES) {
    if (!Array.isArray(body[table])) {
      res.status(400).json({ error: `Backup file is missing or malformed "${table}"` });
      return;
    }
  }
  if (!Array.isArray(body.note_images)) {
    res.status(400).json({ error: `Backup file is missing or malformed "note_images"` });
    return;
  }

  const uid = req.uid;

  db.exec("BEGIN TRANSACTION");
  try {
    for (const table of TABLES) {
      db.query(`DELETE FROM ${table} WHERE user_id = ?`).run(uid);
      const rows = body[table] as Record<string, unknown>[];
      if (rows.length === 0) continue;
      const cols = tableColumns(table);
      const insert = db.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`);
      for (const row of rows) {
        // Values come from arbitrary uploaded JSON spanning every table's differently-
        // shaped columns — bun:sqlite's binding type can't be usefully narrowed here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (insert.run as (...args: any[]) => unknown)(...cols.map((c) => (c === "user_id" ? uid : (row[c] ?? null))));
      }
    }

    db.query("DELETE FROM note_images WHERE user_id = ?").run(uid);
    const restoredNoteIds = new Set((body.notes as { id: string }[]).map((n) => n.id));
    const imageCols = ["id", "user_id", "note_id", "mime_type", "created_at"];
    const insertImage = db.query(
      `INSERT INTO note_images (${imageCols.join(", ")}) VALUES (${imageCols.map(() => "?").join(", ")})`
    );
    for (const img of body.note_images as Record<string, unknown>[]) {
      if (!restoredNoteIds.has(img.note_id as string)) continue; // orphaned image, note wasn't in this backup
      insertImage.run(img.id as string, uid, img.note_id as string, img.mime_type as string, img.created_at as string);
      const dataUrl = img.data_url as string | null;
      if (typeof dataUrl === "string") {
        const match = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
        if (match) fs.writeFileSync(imageFilePath(img.id as string, match[1]), Buffer.from(match[2], "base64"));
      }
    }

    if (body.settings && typeof body.settings === "object") {
      const s = body.settings as Record<string, unknown>;
      // Only the non-secret preference fields — never touches notes_pin_hash, which isn't
      // in the export in the first place, so a restore can never silently clear a PIN the
      // user has set since making the backup.
      db.query(
        `INSERT INTO user_settings (user_id, calorie_target, protein_target_g, carbs_target_g, fat_target_g, goal_weight_lbs, theme)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           calorie_target = excluded.calorie_target,
           protein_target_g = excluded.protein_target_g,
           carbs_target_g = excluded.carbs_target_g,
           fat_target_g = excluded.fat_target_g,
           goal_weight_lbs = excluded.goal_weight_lbs,
           theme = excluded.theme`
      ).run(
        uid,
        (s.calorie_target as number | null) ?? null,
        (s.protein_target_g as number | null) ?? null,
        (s.carbs_target_g as number | null) ?? null,
        (s.fat_target_g as number | null) ?? null,
        (s.goal_weight_lbs as number | null) ?? null,
        s.theme === "light" ? "light" : "dark"
      );
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    res.status(500).json({ error: err instanceof Error ? err.message : "Import failed, no changes were made" });
    return;
  }

  res.json({ ok: true });
});
