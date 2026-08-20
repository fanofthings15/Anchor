import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import "./db"; // runs migrations on import
import { currentUser } from "./auth/currentUser";
import { notesRouter } from "./routes/notes";
import { todosRouter } from "./routes/todos";
import { cleaningRouter } from "./routes/cleaning";
import { shoppingRouter } from "./routes/shopping";
import { calendarRouter } from "./routes/calendar";
import { billsRouter } from "./routes/bills";
import { investmentsRouter } from "./routes/investments";
import { workoutsRouter } from "./routes/workouts";
import { routinesRouter } from "./routes/routines";
import { weightRouter } from "./routes/weight";
import { mealsRouter } from "./routes/meals";
import { settingsRouter } from "./routes/settings";
import { todayRouter } from "./routes/today";

const app = express();
// Raised from Express's 100kb default so pasted note images (sent as base64 JSON, ~33%
// larger than the raw file) fit — notes.ts separately caps the decoded image at 8MB.
app.use(express.json({ limit: "12mb" }));

// Exempt from currentUser: a container/orchestrator health check hits this directly,
// not through Traefik+Authentik, so it never carries an X-authentik-uid header.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Resolves req.uid for every other route from Authentik's forward-auth header (or a
// fixed dev fallback when there's no proxy in front of us at all — see currentUser.ts).
app.use(currentUser);

app.use("/api/notes", notesRouter);
app.use("/api/todos", todosRouter);
app.use("/api/cleaning", cleaningRouter);
app.use("/api/shopping", shoppingRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/bills", billsRouter);
app.use("/api/investments", investmentsRouter);
app.use("/api/workouts", workoutsRouter);
app.use("/api/routines", routinesRouter);
app.use("/api/weight", weightRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/today", todayRouter);

// Serves the built frontend on the same port as the API — production is a single
// process/single origin, same shape as Anime Recomender and Event Dashboard. Only
// kicks in once frontend/dist exists; in dev, run the Vite dev server separately.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(__dirname, "../../frontend/dist");
if (fs.existsSync(uiDir)) {
  app.use(express.static(uiDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(uiDir, "index.html"));
  });
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3320;
app.listen(PORT, () => {
  console.log(`[anchor] backend listening on http://localhost:${PORT}`);
});
