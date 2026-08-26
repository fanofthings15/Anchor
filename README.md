# Anchor

A personal life-organizer dashboard: notes, todo lists, cleaning &amp; maintenance
schedules, shopping lists, a calendar, bill tracking, a manual investment
timeline, and workout/calorie tracking — plus a "Today" view that pulls
together what actually needs attention right now. B

## Stack

Bun monorepo — `backend/` (Express + TypeScript, `bun:sqlite`) and
`frontend/` (React + TypeScript + Vite, `recharts` for the investment/
workout/calorie charts).

## Running it

```
bun install
bun run dev
```

- Backend: http://localhost:3320
- Frontend: http://localhost:5590

## Production

`bun run build` builds the frontend and typechecks the backend; `bun run start`
runs the backend, which serves the built frontend directly on the same port
(single process, single origin — no separate static host).
