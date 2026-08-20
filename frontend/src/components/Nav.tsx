import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect } from "react";

const PRIMARY = [
  { to: "/", label: "Today", icon: "☀" },
  { to: "/todos", label: "Todos", icon: "✓" },
  { to: "/notes", label: "Notes", icon: "✎" },
  { to: "/calendar", label: "Calendar", icon: "▦" },
];

const MORE = [
  { to: "/cleaning", label: "Cleaning & Maintenance" },
  { to: "/shopping", label: "Shopping" },
  { to: "/bills", label: "Bills" },
  { to: "/investments", label: "Investments" },
  { to: "/workouts", label: "Workouts & Food" },
  { to: "/settings", label: "Settings" },
];

// One responsive component, not two separate implementations: CSS handles whether this
// renders as a left sidebar (desktop) or a bottom tab bar (mobile) — see styles.css's
// `.app-nav` rules. The "More" sheet only ever opens from the mobile tab bar (the
// desktop sidebar just lists every link, so its trigger is hidden there via CSS), but
// the sheet markup itself stays in the tree either way for simplicity.
export default function Nav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  return (
    <>
      <nav className="app-nav" aria-label="Primary">
        <div className="app-nav-links">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className="app-nav-link">
              <span className="app-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="app-nav-label">{item.label}</span>
            </NavLink>
          ))}
          {MORE.map((item) => (
            <NavLink key={item.to} to={item.to} className="app-nav-link app-nav-link-desktop-only">
              <span className="app-nav-label">{item.label}</span>
            </NavLink>
          ))}
        </div>
        <button
          type="button"
          className="app-nav-link app-nav-more-trigger"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="app-nav-icon" aria-hidden="true">
            …
          </span>
          <span className="app-nav-label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-handle" />
            {MORE.map((item) => (
              <NavLink key={item.to} to={item.to} className="more-sheet-link" onClick={() => setMoreOpen(false)}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
