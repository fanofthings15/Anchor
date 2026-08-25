import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "./exerciseLibrary";

// A stylized muscular front/back silhouette — built from overlapping rounded shapes
// (a torso outline path, capsule-ish ellipses for limbs) rather than axis-aligned boxes,
// so it actually reads as a body. Muscle groups are shapes layered on top of that
// silhouette; fill-opacity scales with that muscle's score (0-1, normalized by the
// caller). Both views share the same outline geometry, only the muscle layer differs.

const OUTLINE = "var(--border)";
const MUSCLE_COLOR = "var(--accent)";

function opacityFor(score: number | undefined): number {
  return 0.12 + (score ?? 0) * 0.72;
}

function BodyOutline() {
  return (
    <>
      <ellipse cx={50} cy={15} rx={10.5} ry={12.5} fill={OUTLINE} />
      <path d="M 44,25 L 56,25 L 54,33 L 46,33 Z" fill={OUTLINE} />
      <path
        fill={OUTLINE}
        d="M 44,32 L 21,35 C 23,45 27,50 31,53 C 35,68 39,80 43,90
           C 39,96 35,100 35,104 C 35,108 41,110 50,110 C 59,110 65,108 65,104
           C 65,100 61,96 57,90 C 61,80 65,68 69,53 C 73,50 77,45 79,35
           L 56,32 C 54,30 46,30 44,32 Z"
      />
      <ellipse cx={24} cy={55} rx={9} ry={18} fill={OUTLINE} transform="rotate(6 24 55)" />
      <ellipse cx={17} cy={95} rx={7} ry={22} fill={OUTLINE} transform="rotate(10 17 95)" />
      <ellipse cx={14} cy={135} rx={5.5} ry={10} fill={OUTLINE} />
      <ellipse cx={76} cy={55} rx={9} ry={18} fill={OUTLINE} transform="rotate(-6 76 55)" />
      <ellipse cx={83} cy={95} rx={7} ry={22} fill={OUTLINE} transform="rotate(-10 83 95)" />
      <ellipse cx={86} cy={135} rx={5.5} ry={10} fill={OUTLINE} />
      <ellipse cx={41} cy={130} rx={11} ry={26} fill={OUTLINE} />
      <ellipse cx={40} cy={178} rx={7} ry={24} fill={OUTLINE} />
      <ellipse cx={39} cy={206} rx={8} ry={7} fill={OUTLINE} />
      <ellipse cx={59} cy={130} rx={11} ry={26} fill={OUTLINE} />
      <ellipse cx={60} cy={178} rx={7} ry={24} fill={OUTLINE} />
      <ellipse cx={61} cy={206} rx={8} ry={7} fill={OUTLINE} />
    </>
  );
}

function Muscle({ muscle, score, children }: { muscle: MuscleGroup; score: number | undefined; children: React.ReactNode }) {
  return (
    <g fill={MUSCLE_COLOR} fillOpacity={opacityFor(score)} stroke="var(--bg-card)" strokeWidth={0.5}>
      <title>{MUSCLE_GROUP_LABELS[muscle]}</title>
      {children}
    </g>
  );
}

function FrontMuscles({ scores }: { scores: Record<MuscleGroup, number> }) {
  return (
    <>
      <Muscle muscle="shoulders" score={scores.shoulders}>
        <ellipse cx={26} cy={42} rx={9} ry={8} />
        <ellipse cx={74} cy={42} rx={9} ry={8} />
      </Muscle>
      <Muscle muscle="chest" score={scores.chest}>
        <path d="M 34,45 C 34,42 40,40 47,42 C 49,50 48,58 45,63 C 38,63 33,56 34,45 Z" />
        <path d="M 66,45 C 66,42 60,40 53,42 C 51,50 52,58 55,63 C 62,63 67,56 66,45 Z" />
      </Muscle>
      <Muscle muscle="biceps" score={scores.biceps}>
        <ellipse cx={23} cy={58} rx={6} ry={12} />
        <ellipse cx={77} cy={58} rx={6} ry={12} />
      </Muscle>
      <Muscle muscle="forearms" score={scores.forearms}>
        <ellipse cx={17} cy={98} rx={5} ry={16} />
        <ellipse cx={83} cy={98} rx={5} ry={16} />
      </Muscle>
      <Muscle muscle="abs" score={scores.abs}>
        <rect x={44} y={66} width={6} height={7} rx={2} />
        <rect x={51} y={66} width={6} height={7} rx={2} />
        <rect x={44} y={75} width={6} height={7} rx={2} />
        <rect x={51} y={75} width={6} height={7} rx={2} />
        <rect x={44} y={84} width={6} height={7} rx={2} />
        <rect x={51} y={84} width={6} height={7} rx={2} />
      </Muscle>
      <Muscle muscle="obliques" score={scores.obliques}>
        <ellipse cx={38} cy={80} rx={4} ry={12} />
        <ellipse cx={63} cy={80} rx={4} ry={12} />
      </Muscle>
      <Muscle muscle="quads" score={scores.quads}>
        <ellipse cx={41} cy={128} rx={8} ry={22} />
        <ellipse cx={59} cy={128} rx={8} ry={22} />
      </Muscle>
    </>
  );
}

function BackMuscles({ scores }: { scores: Record<MuscleGroup, number> }) {
  return (
    <>
      <Muscle muscle="shoulders" score={scores.shoulders}>
        <ellipse cx={26} cy={42} rx={9} ry={8} />
        <ellipse cx={74} cy={42} rx={9} ry={8} />
      </Muscle>
      <Muscle muscle="back" score={scores.back}>
        <path d="M 36,44 C 34,55 34,66 40,78 C 44,84 56,84 60,78 C 66,66 66,55 64,44 C 58,50 42,50 36,44 Z" />
      </Muscle>
      <Muscle muscle="triceps" score={scores.triceps}>
        <ellipse cx={23} cy={58} rx={6} ry={12} />
        <ellipse cx={77} cy={58} rx={6} ry={12} />
      </Muscle>
      <Muscle muscle="glutes" score={scores.glutes}>
        <path d="M 33,96 C 33,90 41,88 50,88 C 59,88 67,90 67,96 C 67,104 59,108 50,108 C 41,108 33,104 33,96 Z" />
      </Muscle>
      <Muscle muscle="hamstrings" score={scores.hamstrings}>
        <ellipse cx={41} cy={128} rx={8} ry={20} />
        <ellipse cx={59} cy={128} rx={8} ry={20} />
      </Muscle>
      <Muscle muscle="calves" score={scores.calves}>
        <ellipse cx={40} cy={178} rx={6} ry={18} />
        <ellipse cx={60} cy={178} rx={6} ry={18} />
      </Muscle>
    </>
  );
}

function Silhouette({
  label,
  scores,
  children,
}: {
  label: string;
  scores: Record<MuscleGroup, number>;
  children: (scores: Record<MuscleGroup, number>) => React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 100 220" style={{ width: "100%", maxWidth: 140 }} role="img" aria-label={`${label} view muscle diagram`}>
        <BodyOutline />
        {children(scores)}
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
        <Silhouette label="Front" scores={scores}>
          {(s) => <FrontMuscles scores={s} />}
        </Silhouette>
        <Silhouette label="Back" scores={scores}>
          {(s) => <BackMuscles scores={s} />}
        </Silhouette>
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
