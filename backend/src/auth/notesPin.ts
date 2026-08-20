import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request } from "express";

// Generated fresh per process boot rather than a persisted secret — a redeploy simply
// invalidates any outstanding unlock tokens (the user re-enters their PIN), which is an
// acceptable cost for not having to provision/rotate a real secret for what is a casual
// "don't let someone glancing at my phone read this" gate, not a high-security boundary.
const UNLOCK_SECRET = randomBytes(32);
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", UNLOCK_SECRET).update(payload).digest("hex");
}

export function issueUnlockToken(uid: string): string {
  const payload = `${uid}.${Date.now() + UNLOCK_TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function verifyUnlockToken(token: string, uid: string): boolean {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;
  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString();
  } catch {
    return false;
  }
  const expected = sign(payload);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return false;
  }
  const [payloadUid, expiresAtStr] = payload.split(".");
  if (payloadUid !== uid) return false;
  const expiresAt = Number(expiresAtStr);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

// Whether this request is allowed to see locked-note content — checked per-request
// (not cached on req.uid) since the header is the only thing carrying that proof.
export function hasNotesUnlock(req: Request): boolean {
  const token = req.header("X-notes-unlock");
  if (!token) return false;
  return verifyUnlockToken(token, req.uid);
}
