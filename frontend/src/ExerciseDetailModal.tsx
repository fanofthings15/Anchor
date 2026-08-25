import { useEffect } from "react";
import { findExercise, MUSCLE_GROUP_LABELS } from "./exerciseLibrary";
import MovementAnimation from "./MovementAnimation";

export default function ExerciseDetailModal({ name, onClose }: { name: string; onClose: () => void }) {
  const def = findExercise(name);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="exercise-modal-backdrop" onClick={onClose}>
      <div className="exercise-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 17 }}>{name}</strong>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!def ? (
          <div className="empty-state">Custom exercise — no form guide available.</div>
        ) : (
          <>
            <MovementAnimation pattern={def.pattern} />

            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 14, marginBottom: 14 }}>
              {def.primary.map((m) => (
                <span key={m} className="chip chip-accent">
                  {MUSCLE_GROUP_LABELS[m]}
                </span>
              ))}
              {def.secondary.map((m) => (
                <span key={m} className="chip">
                  {MUSCLE_GROUP_LABELS[m]}
                </span>
              ))}
            </div>

            <ol className="exercise-modal-instructions">
              {def.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
