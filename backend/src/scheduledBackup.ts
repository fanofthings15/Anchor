import fs from "fs";
import path from "path";
import { db } from "./db";
import { APP_DIR, DB_PATH, UPLOADS_DIR } from "./paths";

// Lives inside the same persistent volume as the live database (APP_DIR is the Coolify
// bind mount) — this protects against application-level mistakes (a bad migration, an
// accidental mass-delete, a "Restore" import gone wrong) but NOT against losing that
// whole volume/disk. The in-browser "Download backup" in Settings is what covers an
// actual offsite copy; this is the automatic safety net underneath it.
const BACKUPS_DIR = path.join(APP_DIR, "backups");
const MARKER_PATH = path.join(BACKUPS_DIR, ".last-backup");
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check hourly, only actually run once/24h
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS = 14; // ~2 weeks of daily snapshots at this cadence

function runBackup(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUPS_DIR, stamp);
  fs.mkdirSync(dest, { recursive: true });

  // Forces any pending WAL contents into the main file first, so the copy alone is a
  // complete, consistent snapshot rather than needing the -wal/-shm files alongside it.
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  fs.copyFileSync(DB_PATH, path.join(dest, "data.sqlite"));
  if (fs.existsSync(UPLOADS_DIR)) {
    fs.cpSync(UPLOADS_DIR, path.join(dest, "uploads"), { recursive: true });
  }

  pruneOldSnapshots();
  console.log(`[anchor] scheduled backup written to ${dest}`);
}

function pruneOldSnapshots(): void {
  const entries = fs
    .readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // ISO-shaped names sort chronologically
  for (const name of entries.slice(0, Math.max(0, entries.length - MAX_SNAPSHOTS))) {
    fs.rmSync(path.join(BACKUPS_DIR, name), { recursive: true, force: true });
  }
}

function isDue(): boolean {
  if (!fs.existsSync(MARKER_PATH)) return true;
  const last = Number(fs.readFileSync(MARKER_PATH, "utf8").trim() || 0);
  return Date.now() - last > BACKUP_INTERVAL_MS;
}

function runIfDue(): void {
  if (!isDue()) return;
  try {
    runBackup();
    fs.writeFileSync(MARKER_PATH, String(Date.now()));
  } catch (err) {
    console.error("[anchor] scheduled backup failed:", err);
  }
}

// Checked hourly rather than scheduled exactly 24h out, so a container restart (a
// redeploy, a crash) never leaves the interval permanently drifted or skipped — worst
// case a snapshot is up to an hour late, not silently stopped forever.
export function startScheduledBackups(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  runIfDue();
  setInterval(runIfDue, CHECK_INTERVAL_MS);
}
