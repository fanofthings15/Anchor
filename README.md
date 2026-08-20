# Anchor

A personal life-organizer dashboard: notes, todo lists, cleaning &amp; maintenance
schedules, shopping lists, a calendar, bill tracking, a manual investment
timeline, and workout/calorie tracking — plus a "Today" view that pulls
together what actually needs attention right now. Built mobile-first, since
most real use happens on a phone.

Multi-user from day one: each person's data is fully isolated by their
Authentik identity, so friends can use the same deployment without seeing or
touching the owner's data (or each other's).

## Stack

Bun monorepo — `backend/` (Express + TypeScript, `bun:sqlite`) and
`frontend/` (React + TypeScript + Vite, `recharts` for the investment/
workout/calorie charts).

## Multi-user model

Every request resolves to a stable identity via `backend/src/auth/currentUser.ts`,
reading Authentik's forward-auth `X-authentik-uid` header (set by Traefik in
production, stripped and re-set after verifying the session — never trusted
from an untrusted client directly). In production (`PUBLIC_URL` env var set)
a missing header is a hard 401, since this app only ever runs behind
Traefik+Authentik there. In local dev, a missing header falls back to a fixed
`dev-local-user` pseudo-account — unless explicitly supplied, e.g.
`curl -H "X-authentik-uid: alice"`, which is how to simulate a second user
locally without real SSO.

Every table is scoped by `user_id`; every route filters on it explicitly.

## Running it

```
bun install
bun run dev
```

- Backend: http://localhost:3320
- Frontend: http://localhost:5590

All data lives in `bun:sqlite` at `~/.anchor/data.sqlite`, outside the repo —
nothing sensitive is ever committed.

## Production

`bun run build` builds the frontend and typechecks the backend; `bun run start`
runs the backend, which serves the built frontend directly on the same port
(single process, single origin — no separate static host).
