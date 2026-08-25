import Body, { type ExtendedBodyPart, type Slug } from "react-muscle-highlighter";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "./exerciseLibrary";

// A real precisely-segmented muscle map (react-muscle-highlighter, MIT-licensed — each
// muscle is its own anatomically-shaped SVG region, not an approximated blob) instead of
// hand-placed highlight shapes over a reference image. Same Hevy-style idea: flat gray
// body, worked muscles picked out in accent blue at an opacity that scales with score.
//
// Limb muscles (biceps/triceps/forearms) are modeled as separate left/right regions in
// this library and need an explicit side to pick up a color at all — torso/leg muscles
// don't. One known cosmetic quirk: the back view's right triceps renders a visibly
// duller shade than the left for the same color/style props — a rendering quirk in the
// library itself, not something reachable from this component's props.

const ACCENT_RGB = "77, 163, 255"; // matches --accent in styles.css

function opacityFor(score: number | undefined): number {
  if (!score) return 0;
  return 0.35 + score * 0.65;
}

function colorFor(score: number | undefined): string | undefined {
  const opacity = opacityFor(score);
  return opacity > 0 ? `rgba(${ACCENT_RGB}, ${opacity})` : undefined;
}

// One or more slugs per muscle group, since a couple of groups (the back) map to more
// than one region in this library's more granular taxonomy — all colored the same.
const FRONT_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  chest: ["chest"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  forearms: ["forearm"],
  abs: ["abs"],
  obliques: ["obliques"],
  quads: ["quadriceps"],
};

const BACK_SLUGS: Partial<Record<MuscleGroup, Slug[]>> = {
  shoulders: ["deltoids"],
  back: ["trapezius", "upper-back", "lower-back"],
  triceps: ["triceps"],
  glutes: ["gluteal"],
  hamstrings: ["hamstring"],
  calves: ["calves"],
};

// These need an explicit side (both, since a workout doesn't track single-arm data) or
// this library's arm regions don't take a fill at all.
const SIDED_SLUGS = new Set<Slug>(["biceps", "triceps", "forearm"]);

function bodyData(slugMap: Partial<Record<MuscleGroup, Slug[]>>, scores: Record<MuscleGroup, number>): ExtendedBodyPart[] {
  const parts: ExtendedBodyPart[] = [];
  for (const [muscle, slugs] of Object.entries(slugMap) as [MuscleGroup, Slug[]][]) {
    const color = colorFor(scores[muscle]);
    if (!color) continue;
    for (const slug of slugs) {
      if (SIDED_SLUGS.has(slug)) {
        parts.push({ slug, side: "left", styles: { fill: color } });
        parts.push({ slug, side: "right", styles: { fill: color } });
      } else {
        parts.push({ slug, styles: { fill: color } });
      }
    }
  }
  return parts;
}

export default function BodyDiagram({ scores }: { scores: Record<MuscleGroup, number> }) {
  const worked = (Object.entries(scores) as [MuscleGroup, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ textAlign: "center" }}>
          <Body data={bodyData(FRONT_SLUGS, scores)} side="front" gender="male" defaultFill="#3a4152" border="none" scale={1.1} />
          <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>
            Front
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <Body data={bodyData(BACK_SLUGS, scores)} side="back" gender="male" defaultFill="#3a4152" border="none" scale={1.1} />
          <div className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>
            Back
          </div>
        </div>
      </div>
      {worked.length > 0 && (
        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 14, justifyContent: "center" }}>
          {worked.map(([muscle]) => (
            <span key={muscle} className="chip chip-accent">
              {MUSCLE_GROUP_LABELS[muscle]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
