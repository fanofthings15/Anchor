import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "./exerciseLibrary";

// Two simple stylized silhouettes (front/back) with one shape per muscle group region —
// not anatomically precise, just enough to place a region in roughly the right spot.
// Region fill opacity scales with that muscle's score (0-1, already normalized by the
// caller). A muscle with no visible surface from a given angle (e.g. forearms only shown
// front, calves only shown back) just isn't drawn on the other view.

interface Region {
  muscle: MuscleGroup;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
}

const FRONT_REGIONS: Region[] = [
  { muscle: "shoulders", x: 16, y: 38, w: 20, h: 13, rx: 6 },
  { muscle: "shoulders", x: 64, y: 38, w: 20, h: 13, rx: 6 },
  { muscle: "chest", x: 32, y: 44, w: 36, h: 24, rx: 6 },
  { muscle: "biceps", x: 12, y: 52, w: 14, h: 28, rx: 6 },
  { muscle: "biceps", x: 74, y: 52, w: 14, h: 28, rx: 6 },
  { muscle: "forearms", x: 8, y: 82, w: 12, h: 26, rx: 5 },
  { muscle: "forearms", x: 80, y: 82, w: 12, h: 26, rx: 5 },
  { muscle: "abs", x: 36, y: 70, w: 28, h: 24, rx: 5 },
  { muscle: "obliques", x: 27, y: 72, w: 9, h: 22, rx: 4 },
  { muscle: "obliques", x: 64, y: 72, w: 9, h: 22, rx: 4 },
  { muscle: "quads", x: 30, y: 108, w: 17, h: 46, rx: 6 },
  { muscle: "quads", x: 53, y: 108, w: 17, h: 46, rx: 6 },
];

const BACK_REGIONS: Region[] = [
  { muscle: "shoulders", x: 16, y: 38, w: 20, h: 13, rx: 6 },
  { muscle: "shoulders", x: 64, y: 38, w: 20, h: 13, rx: 6 },
  { muscle: "back", x: 30, y: 44, w: 40, h: 28, rx: 6 },
  { muscle: "triceps", x: 12, y: 52, w: 14, h: 28, rx: 6 },
  { muscle: "triceps", x: 74, y: 52, w: 14, h: 28, rx: 6 },
  { muscle: "glutes", x: 32, y: 96, w: 36, h: 18, rx: 8 },
  { muscle: "hamstrings", x: 30, y: 116, w: 17, h: 32, rx: 6 },
  { muscle: "hamstrings", x: 53, y: 116, w: 17, h: 32, rx: 6 },
  { muscle: "calves", x: 30, y: 150, w: 17, h: 28, rx: 6 },
  { muscle: "calves", x: 53, y: 150, w: 17, h: 28, rx: 6 },
];

function opacityFor(score: number | undefined): number {
  return 0.1 + (score ?? 0) * 0.75;
}

function Silhouette({ label, regions, scores }: { label: string; regions: Region[]; scores: Record<MuscleGroup, number> }) {
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 100 190" style={{ width: "100%", maxWidth: 140 }} role="img" aria-label={`${label} view muscle diagram`}>
        <circle cx={50} cy={20} r={15} fill="none" stroke="var(--border)" strokeWidth={2} />
        {regions.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx={r.rx ?? 4}
            fill="var(--accent)"
            fillOpacity={opacityFor(scores[r.muscle])}
            stroke="var(--border)"
            strokeWidth={1}
          >
            <title>{MUSCLE_GROUP_LABELS[r.muscle]}</title>
          </rect>
        ))}
      </svg>
      <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

export default function BodyDiagram({ scores }: { scores: Record<MuscleGroup, number> }) {
  const worked = (Object.entries(scores) as [MuscleGroup, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
        <Silhouette label="Front" regions={FRONT_REGIONS} scores={scores} />
        <Silhouette label="Back" regions={BACK_REGIONS} scores={scores} />
      </div>
      {worked.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 14, justifyContent: "center" }}>
          {worked.map(([muscle, score]) => (
            <span key={muscle} className={score >= 0.6 ? "chip chip-accent" : "chip"}>
              {MUSCLE_GROUP_LABELS[muscle]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
