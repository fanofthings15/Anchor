import { Router } from "express";
import { createHmac, randomBytes } from "crypto";
import { db } from "../db";

export const googleCalendarRouter = Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI = "https://life.omurray.me/api/calendar/google/callback";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

// Signs the OAuth "state" param so the callback (a plain top-level browser redirect from
// Google, not an API call this app's own frontend controls) can be tied back to whichever
// user actually started the connect flow, and rejected if tampered with or stale. A
// per-boot secret is fine here — the whole round trip through Google's consent screen
// only takes a few minutes, well inside any redeploy gap.
const STATE_SECRET = randomBytes(32);
const STATE_TTL_MS = 10 * 60 * 1000;

function signState(uid: string): string {
  const payload = `${uid}.${Date.now() + STATE_TTL_MS}`;
  const sig = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

function verifyState(state: string): string | null {
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString();
  } catch {
    return null;
  }
  const expected = createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  if (expected !== sig) return null;
  const [uid, expiresAtStr] = payload.split(".");
  if (!uid || Date.now() > Number(expiresAtStr)) return null;
  return uid;
}

interface ConnectionRow {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  connected_at: string;
  selected_calendar_ids: string;
}

function getSelectedCalendarIds(row: ConnectionRow): string[] {
  try {
    const parsed = JSON.parse(row.selected_calendar_ids);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : ["primary"];
  } catch {
    return ["primary"];
  }
}

googleCalendarRouter.get("/status", (req, res) => {
  const row = db
    .query<ConnectionRow, [string]>("SELECT * FROM google_calendar_connections WHERE user_id = ?")
    .get(req.uid);
  res.json({ connected: !!row, configured: !!CLIENT_ID });
});

interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

// GET /api/calendar/google/calendars — every calendar this Google account can see
// (their own primary, secondary calendars, and anything shared/subscribed to — e.g. a
// calendar a friend shares events on), each flagged with whether it's currently one of
// the ones this app pulls events from.
googleCalendarRouter.get("/calendars", async (req, res) => {
  const row = db
    .query<ConnectionRow, [string]>("SELECT * FROM google_calendar_connections WHERE user_id = ?")
    .get(req.uid);
  if (!row) {
    res.json([]);
    return;
  }
  const accessToken = await getValidAccessToken(req.uid);
  if (!accessToken) {
    res.json([]);
    return;
  }
  try {
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      res.json([]);
      return;
    }
    const data = (await listRes.json()) as { items?: GoogleCalendarListEntry[] };
    const selected = new Set(getSelectedCalendarIds(row));
    const calendars = (data.items ?? []).map((item) => ({
      id: item.id,
      name: item.summary,
      primary: !!item.primary,
      selected: selected.has(item.id) || (item.primary && selected.has("primary")),
    }));
    res.json(calendars);
  } catch {
    res.json([]);
  }
});

// PATCH /api/calendar/google/calendars — which calendars from the list above to actually
// pull events from (e.g. adding a friend's shared calendar alongside the user's own).
googleCalendarRouter.patch("/calendars", (req, res) => {
  const { calendar_ids } = req.body as { calendar_ids?: unknown };
  if (!Array.isArray(calendar_ids) || calendar_ids.length === 0 || !calendar_ids.every((id) => typeof id === "string")) {
    res.status(400).json({ error: "calendar_ids must be a non-empty array of strings" });
    return;
  }
  const result = db
    .query("UPDATE google_calendar_connections SET selected_calendar_ids = ? WHERE user_id = ?")
    .run(JSON.stringify(calendar_ids), req.uid);
  if (result.changes === 0) {
    res.status(404).json({ error: "not connected" });
    return;
  }
  res.json({ calendar_ids });
});

googleCalendarRouter.get("/connect", (req, res) => {
  if (!CLIENT_ID) {
    res.status(500).send("Google Calendar isn't configured on this server yet.");
    return;
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  // Forces Google to hand back a refresh_token even if this user granted access before —
  // without it, a re-connect after a disconnect could silently fail to yield one.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", signState(req.uid));
  res.redirect(url.toString());
});

googleCalendarRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error || typeof code !== "string" || typeof state !== "string") {
    res.redirect("/settings?google_calendar=error");
    return;
  }
  const uid = verifyState(state);
  if (!uid || uid !== req.uid) {
    res.status(400).send("That link has expired or is invalid — go back to Settings and try connecting again.");
    return;
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await tokenRes.json()) as {
      refresh_token?: string;
      access_token?: string;
      expires_in?: number;
    };
    if (!tokenRes.ok || !tokens.refresh_token || !tokens.access_token || !tokens.expires_in) {
      res.redirect("/settings?google_calendar=error");
      return;
    }
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    db.query(
      `INSERT INTO google_calendar_connections (user_id, refresh_token, access_token, access_token_expires_at, connected_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         refresh_token = excluded.refresh_token,
         access_token = excluded.access_token,
         access_token_expires_at = excluded.access_token_expires_at`
    ).run(uid, tokens.refresh_token, tokens.access_token, expiresAt, new Date().toISOString());
    res.redirect("/settings?google_calendar=connected");
  } catch {
    res.redirect("/settings?google_calendar=error");
  }
});

googleCalendarRouter.delete("/disconnect", async (req, res) => {
  const row = db
    .query<ConnectionRow, [string]>("SELECT * FROM google_calendar_connections WHERE user_id = ?")
    .get(req.uid);
  if (row) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(row.refresh_token)}`, { method: "POST" });
    } catch {
      // best-effort — the local row is deleted regardless, so this app stops reading
      // from Google either way even if the revoke call itself fails
    }
  }
  db.query("DELETE FROM google_calendar_connections WHERE user_id = ?").run(req.uid);
  res.json({ connected: false });
});

// Returns a fresh access token for this user, refreshing it first if the cached one has
// expired (or is about to, within the next minute) — null if never connected, or if
// Google rejects the refresh (e.g. access was revoked from Google's side instead of
// this app's Disconnect button).
async function getValidAccessToken(uid: string): Promise<string | null> {
  const row = db
    .query<ConnectionRow, [string]>("SELECT * FROM google_calendar_connections WHERE user_id = ?")
    .get(uid);
  if (!row) return null;
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (row.access_token && Date.now() < expiresAt - 60_000) {
    return row.access_token;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokens = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
  if (!tokens.access_token || !tokens.expires_in) return null;
  const expiresAtIso = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  db.query("UPDATE google_calendar_connections SET access_token = ?, access_token_expires_at = ? WHERE user_id = ?").run(
    tokens.access_token,
    expiresAtIso,
    uid
  );
  return tokens.access_token;
}

// "2026-08-23" -> "2026-08-22". Pure date-string arithmetic (via a UTC-anchored Date, so
// it's never affected by the server's own local timezone) — used to undo Google's
// exclusive end.date convention for all-day events.
function dateMinusOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface GoogleEventItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

// GET /api/calendar/google/events?from=&to= — read-only, live-fetched (not cached) from
// the user's primary Google Calendar. Never connected, or Google rejects the token? Both
// quietly return an empty list rather than erroring — a Calendar page shouldn't break
// just because this one extra source is unavailable.
googleCalendarRouter.get("/events", async (req, res) => {
  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") {
    res.status(400).json({ error: "from and to query params are required" });
    return;
  }
  const accessToken = await getValidAccessToken(req.uid);
  if (!accessToken) {
    res.json([]);
    return;
  }
  const row = db
    .query<ConnectionRow, [string]>("SELECT * FROM google_calendar_connections WHERE user_id = ?")
    .get(req.uid);
  const calendarIds = row ? getSelectedCalendarIds(row) : ["primary"];
  try {
    const perCalendar = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("timeMin", new Date(from).toISOString());
        url.searchParams.set("timeMax", new Date(to).toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "250");
        const evRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!evRes.ok) return [];
        const data = (await evRes.json()) as { items?: GoogleEventItem[] };
        return (data.items ?? []).map((item) => ({
          id: `google-${calendarId}-${item.id}`,
          title: item.summary ?? "(untitled)",
          notes: item.description ?? "",
          // All-day dates from Google are plain calendar dates with no timezone attached
          // (e.g. "2026-08-20") — appending a "Z" would anchor them to UTC midnight, which
          // renders as the day before in any timezone behind UTC once a browser reads it
          // back with new Date(...). Emitting a bare local datetime (no "Z"/offset) instead
          // means each viewer's own browser parses it as their own local midnight, matching
          // how Anchor's own all-day events already round-trip.
          // end.date is also exclusive of the last day per Google's convention (an event
          // spanning Aug 20-22 has end.date = Aug 23) — subtracted back to inclusive here.
          start_at: item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00` : ""),
          end_at:
            item.end?.dateTime ??
            (item.end?.date ? `${dateMinusOneDay(item.end.date)}T00:00:00` : null),
          all_day: !item.start?.dateTime,
          location: item.location ?? "",
          source: "google" as const,
        }));
      })
    );
    const events = perCalendar.flat().sort((a, b) => a.start_at.localeCompare(b.start_at));
    res.json(events);
  } catch {
    res.json([]);
  }
});
