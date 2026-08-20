import { Route, Routes } from "react-router-dom";
import Nav from "./components/Nav";
import Today from "./pages/Today";
import Notes from "./pages/Notes";
import Todos from "./pages/Todos";
import Cleaning from "./pages/Cleaning";
import Shopping from "./pages/Shopping";
import Calendar from "./pages/Calendar";
import Bills from "./pages/Bills";
import Investments from "./pages/Investments";
import Workouts from "./pages/Workouts";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app">
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/notes" element={<Notes />} />
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
