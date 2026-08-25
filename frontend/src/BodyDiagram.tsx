import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "./exerciseLibrary";

// Real anatomical front/back muscle illustrations (not a hand-drawn silhouette) as the
// base image, with a transparent SVG overlay on top holding one highlight shape per
// muscle group, positioned to match that image's own proportions (both images share a
// 1000x1400 viewBox, so the overlay uses the same coordinate space with no conversion).
// The base image is desaturated via CSS so the colored overlay is what actually reads as
// "worked this week" — full color there, muted reference everywhere else.
//
// Images: "Muscular system.svg" / "Muscular system-back.svg" by Termininja, Wikimedia
// Commons, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:Muscular_system.svg).
// Re-optimized with svgo for file size; not otherwise altered. Excluded from the PWA's
// precache (see vite.config.ts) since they're large — loaded on demand instead.

interface Region {
  muscle: MuscleGroup;
  shape: "ellipse" | "path";
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  d?: string;
}

const FRONT_REGIONS: Region[] = [
  { muscle: "shoulders", shape: "ellipse", cx: 330, cy: 320, rx: 70, ry: 65 },
  { muscle: "shoulders", shape: "ellipse", cx: 670, cy: 320, rx: 70, ry: 65 },
  { muscle: "chest", shape: "ellipse", cx: 440, cy: 390, rx: 75, ry: 85 },
  { muscle: "chest", shape: "ellipse", cx: 560, cy: 390, rx: 75, ry: 85 },
  { muscle: "biceps", shape: "ellipse", cx: 300, cy: 480, rx: 55, ry: 95 },
  { muscle: "biceps", shape: "ellipse", cx: 700, cy: 480, rx: 55, ry: 95 },
  { muscle: "forearms", shape: "ellipse", cx: 245, cy: 650, rx: 50, ry: 95 },
  { muscle: "forearms", shape: "ellipse", cx: 755, cy: 650, rx: 50, ry: 95 },
  { muscle: "abs", shape: "ellipse", cx: 500, cy: 545, rx: 85, ry: 90 },
  { muscle: "obliques", shape: "ellipse", cx: 390, cy: 550, rx: 35, ry: 90 },
  { muscle: "obliques", shape: "ellipse", cx: 610, cy: 550, rx: 35, ry: 90 },
  { muscle: "quads", shape: "ellipse", cx: 430, cy: 790, rx: 60, ry: 150 },
  { muscle: "quads", shape: "ellipse", cx: 570, cy: 790, rx: 60, ry: 150 },
];

const BACK_REGIONS: Region[] = [
  { muscle: "shoulders", shape: "ellipse", cx: 330, cy: 320, rx: 70, ry: 65 },
  { muscle: "shoulders", shape: "ellipse", cx: 670, cy: 320, rx: 70, ry: 65 },
  { muscle: "back", shape: "path", d: "M500,260 L650,340 L622,560 L500,655 L378,560 L350,340 Z" },
  { muscle: "triceps", shape: "ellipse", cx: 300, cy: 480, rx: 55, ry: 95 },
  { muscle: "triceps", shape: "ellipse", cx: 700, cy: 480, rx: 55, ry: 95 },
  {
    muscle: "glutes",
    shape: "path",
    d: "M370,660 C370,628 450,618 500,618 C550,618 630,628 630,660 C630,722 560,782 500,782 C440,782 370,722 370,660 Z",
  },
  { muscle: "hamstrings", shape: "ellipse", cx: 430, cy: 890, rx: 60, ry: 110 },
  { muscle: "hamstrings", shape: "ellipse", cx: 570, cy: 890, rx: 60, ry: 110 },
  { muscle: "calves", shape: "ellipse", cx: 435, cy: 1120, rx: 45, ry: 90 },
  { muscle: "calves", shape: "ellipse", cx: 565, cy: 1120, rx: 45, ry: 90 },
];

// Unworked regions (score 0) stay fully transparent — the underlying image already
// reads fine as a plain anatomical reference on its own, so only actually-worked
// muscles should pick up any color; a nonzero baseline here washed the whole body in a
// faint blue tint regardless of what was worked, which defeated the point of the map.
function opacityFor(score: number | undefined): number {
  if (!score) return 0;
  return 0.25 + score * 0.6;
}

function RegionShape({ region, score }: { region: Region; score: number | undefined }) {
  const opacity = opacityFor(score);
  const common = {
    fill: "var(--accent)",
    fillOpacity: opacity,
    stroke: "var(--accent)",
    strokeOpacity: opacity > 0 ? Math.min(1, opacity + 0.15) : 0,
    strokeWidth: 2,
  };
  return region.shape === "ellipse" ? (
    <ellipse cx={region.cx} cy={region.cy} rx={region.rx} ry={region.ry} {...common} />
  ) : (
    <path d={region.d} {...common} />
  );
}

function Silhouette({
  label,
  src,
  regions,
  scores,
}: {
  label: string;
  src: string;
  regions: Region[];
  scores: Record<MuscleGroup, number>;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 170, margin: "0 auto" }}>
        <img
          src={src}
          alt={`${label} view muscle anatomy`}
          style={{ width: "100%", display: "block", filter: "grayscale(1) brightness(1.35) contrast(0.9)" }}
        />
        <svg
          viewBox="0 0 1000 1400"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          role="img"
          aria-label={`${label} view muscle diagram`}
        >
          {regions.map((r, i) => (
            <g key={i}>
              <title>{MUSCLE_GROUP_LABELS[r.muscle]}</title>
              <RegionShape region={r} score={scores[r.muscle]} />
            </g>
          ))}
        </svg>
      </div>
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
        <Silhouette label="Front" src="/muscle-front.svg" regions={FRONT_REGIONS} scores={scores} />
        <Silhouette label="Back" src="/muscle-back.svg" regions={BACK_REGIONS} scores={scores} />
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
      <div className="text-faint" style={{ fontSize: 10, marginTop: 10, textAlign: "center" }}>
        Muscle diagram by Termininja, Wikimedia Commons (
        <a
          href="https://creativecommons.org/licenses/by-sa/3.0/"
          target="_blank"
          rel="noreferrer"
          style={{ color: "inherit" }}
        >
          CC BY-SA 3.0
        </a>
        )
      </div>
    </div>
  );
}
