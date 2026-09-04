import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Broom,
  Calendar,
  Check,
  Dumbbell,
  Ellipsis,
  Flame,
  type LucideIcon,
  PenLine,
  Receipt,
  Settings,
  ShoppingCart,
  Sun,
  TrendingUp,
} from "lucide-react";
import { getLastNote } from "../api/client";

const PRIMARY: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Today", icon: Sun },
  { to: "/notes", label: "Notes", icon: PenLine },
  { to: "/workouts", label: "Workouts", icon: Dumbbell },
  { to: "/habits", label: "Habits", icon: Flame },
];

const MORE: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/todos", label: "Todos", icon: Check },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/cleaning", label: "Cleaning & Maintenance", icon: Broom },
  { to: "/shopping", label: "Shopping", icon: ShoppingCart },
  { to: "/bills", label: "Bills", icon: Receipt },
  { to: "/investments", label: "Investments", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: Settings },
];

// One responsive component, not two separate implementations: CSS handles whether this
// renders as a left sidebar (desktop) or a bottom tab bar (mobile) — see styles.css's
// `.app-nav` rules. The "More" sheet only ever opens from the mobile tab bar (the
// desktop sidebar just lists every link, so its trigger is hidden there via CSS), but
// the sheet markup itself stays in the tree either way for simplicity.
// Threshold (px) a downward drag on the sheet's handle must clear before it counts as
// "dismiss" rather than snapping back — matches the feel of a native bottom sheet.
const DISMISS_THRESHOLD = 80;

export default function Nav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();

  // Tapping the Notes tab from elsewhere in the app jumps straight back into whichever
  // note was open last (if it isn't locked), instead of always landing on the list —
  // but only when actually switching into the notes section from somewhere else, so it
  // never fights the editor's own "back to list" button or in-app note-to-note links.
  function handleNotesClick(e: React.MouseEvent) {
    if (location.pathname.startsWith("/notes")) return;
    const last = getLastNote();
    if (last && !last.locked) {
      e.preventDefault();
      navigate(`/notes/${last.id}`);
    }
  }

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  function closeSheet() {
    setMoreOpen(false);
    setDragY(0);
    setDragging(false);
  }

  function handleHandlePointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handleHandlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setDragY(Math.max(0, e.clientY - dragStartY.current));
  }

  function handleHandlePointerUp() {
    if (dragging && dragY > DISMISS_THRESHOLD) {
      closeSheet();
    } else {
      setDragging(false);
      setDragY(0);
    }
  }

  return (
    <>
      <nav className="app-nav" aria-label="Primary">
        <div className="app-nav-links">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="app-nav-link app-nav-link-primary"
              onClick={item.to === "/notes" ? handleNotesClick : undefined}
            >
              <item.icon className="app-nav-icon" size={20} aria-hidden="true" />
              <span className="app-nav-label">{item.label}</span>
            </NavLink>
          ))}
          {MORE.map((item) => (
            <NavLink key={item.to} to={item.to} className="app-nav-link app-nav-link-desktop-only">
              <item.icon className="app-nav-icon" size={20} aria-hidden="true" />
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
          <Ellipsis className="app-nav-icon" size={20} aria-hidden="true" />
          <span className="app-nav-label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={closeSheet}>
          <div
            className="more-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `translateY(${dragY}px)`, transition: dragging ? "none" : "transform 0.2s ease" }}
          >
            <div
              className="more-sheet-handle-area"
              onPointerDown={handleHandlePointerDown}
              onPointerMove={handleHandlePointerMove}
              onPointerUp={handleHandlePointerUp}
              onPointerCancel={handleHandlePointerUp}
            >
              <div className="more-sheet-handle" />
            </div>
            {MORE.map((item) => (
              <NavLink key={item.to} to={item.to} className="more-sheet-link" onClick={closeSheet}>
                <item.icon size={20} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
