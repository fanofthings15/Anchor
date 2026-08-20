import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      /** The requesting user's stable identity — Authentik's `X-authentik-uid`. */
      uid: string;
    }
  }
}

// Used only when there's no reverse proxy in front of us at all (local dev — no
// PUBLIC_URL). Never used in production: see below.
export const DEV_FALLBACK_UID = "dev-local-user";

/**
 * Resolves the per-user identity from Authentik's forward-auth header, set on `req.uid`
 * for every downstream route.
 *
 * In production (PUBLIC_URL is set) this app only ever runs behind Traefik+Authentik
 * forward-auth, which strips any client-supplied `X-authentik-*` headers and re-sets
 * them itself after verifying the session — so every request that reaches us here is
 * already authenticated and the header is guaranteed present. If it's ever missing in
 * that mode, that's a proxy misconfiguration, not something to paper over: fail closed
 * with 401 rather than silently pooling everyone into one account.
 *
 * In local dev (no PUBLIC_URL, no proxy in front of us) there's no Authentik at all, so
 * we fall back to a fixed pseudo-user — UNLESS the header is explicitly supplied (e.g.
 * `curl -H "X-authentik-uid: alice"`), which is exactly how two separate users are
 * simulated against a local dev server without real SSO.
 */
export function currentUser(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("X-authentik-uid")?.trim();
  if (header) {
    req.uid = header;
    next();
    return;
  }
  if (process.env.PUBLIC_URL) {
    res.status(401).json({
      error: "Missing X-authentik-uid header — this app must run behind Authentik forward-auth.",
    });
    return;
  }
  req.uid = DEV_FALLBACK_UID;
  next();
}
