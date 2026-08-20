import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { recordNotesActivity } from "./api/client";
import { useOnlineStatus } from "./useOnlineStatus";
import Nav from "./components/Nav";
import Today from "./pages/Today";
import Notes from "./pages/Notes";
import NoteEditor from "./pages/NoteEditor";
import Todos from "./pages/Todos";
import Cleaning from "./pages/Cleaning";
import Shopping from "./pages/Shopping";
import Calendar from "./pages/Calendar";
import Bills from "./pages/Bills";
import Investments from "./pages/Investments";
import Workouts from "./pages/Workouts";
import Settings from "./pages/Settings";

export default function App() {
  // Any interaction anywhere in the app counts as activity, not just within Notes —
  // resets the 5-minute idle clock that locked notes re-gate against (see
  // isNotesUnlockStale in api/client.ts).
  useEffect(() => {
    const events: (keyof WindowEventMap)[] = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, recordNotesActivity, { passive: true }));
    recordNotesActivity();
    return () => events.forEach((e) => window.removeEventListener(e, recordNotesActivity));
  }, []);

  const online = useOnlineStatus();

  return (
    <div className="app">
      <Nav />
      <main className="app-main">
        {!online && (
          <div className="offline-banner">You're offline — showing last-loaded data. Changes won't save until you're back online.</div>
        )}
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/notes/:id" element={<NoteEditor />} />
          <Route path="/todos" element={<Todos />} />
          <Route path="/cleaning" element={<Cleaning />} />
          <Route path="/shopping" element={<Shopping />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/investments" element={<Investments />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
