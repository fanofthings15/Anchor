import { createHash, randomBytes } from "crypto";
import { db } from "../db";

export function generateApiToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Resolves a personal API token (from an Authorization: Bearer header) back to the user
// it belongs to — the /api/external counterpart to how currentUser.ts resolves req.uid
// from Authentik's header, for callers (like an iOS Shortcut) that can't carry a browser
// SSO session. A direct indexed lookup on the hash is fine here (unlike a password check)
// since the thing being matched is already a 256-bit hash, not a guessable secret.
export function resolveUserByApiToken(token: string): string | null {
  const row = db
    .query<{ user_id: string }, [string]>("SELECT user_id FROM user_settings WHERE api_token_hash = ?")
    .get(hashApiToken(token));
  return row?.user_id ?? null;
}
