import type { MovementPattern } from "./exerciseLibrary";

// A small looping stick-figure diagram per movement pattern (not per exercise — see
// exerciseLibrary.ts's comment on why). Each figure shares the same static head/torso/
// limb baseline; only the moving part gets an animated CSS class (see styles.css's
// "Movement animations" section) whose keyframes rotate/translate it around a pivot set
// via inline transform-origin (SVG user-unit coordinates, matching this 100x100 viewBox).
//
// Arms are drawn as two segments — a fixed upper arm (shoulder to elbow) and an animated
// forearm (elbow to hand) — with the shoulder/elbow points offset well out from the
// body's centerline. An earlier version pivoted arms from the centerline itself, which
// visually collapsed them into a short mark under the chin instead of a recognizable arm.

const STROKE = "var(--text)";
const ACCENT = "var(--accent)";

const SHOULDER_L = { x: 36, y: 30 };
const SHOULDER_R = { x: 64, y: 30 };
const ELBOW_L = { x: 24, y: 46 };
const ELBOW_R = { x: 76, y: 46 };
const HAND_DOWN_L = { x: 20, y: 66 };
const HAND_DOWN_R = { x: 80, y: 66 };

function Head() {
  return <circle cx={50} cy={16} r={8} fill="none" stroke={STROKE} strokeWidth={3} />;
}

function StaticTorso() {
  return <line x1={50} y1={24} x2={50} y2={58} stroke={STROKE} strokeWidth={3} strokeLinecap="round" />;
}

function StaticLegs() {
  return (
    <>
      <line x1={50} y1={58} x2={40} y2={90} stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
      <line x1={50} y1={58} x2={60} y2={90} stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

// Upper arms (shoulder-to-elbow), used as-is by every pattern that doesn't animate the
// whole arm from the shoulder — the forearm below is what moves.
function UpperArms({ color = STROKE }: { color?: string }) {
  return (
    <>
      <line x1={SHOULDER_L.x} y1={SHOULDER_L.y} x2={ELBOW_L.x} y2={ELBOW_L.y} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <line x1={SHOULDER_R.x} y1={SHOULDER_R.y} x2={ELBOW_R.x} y2={ELBOW_R.y} stroke={color} strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

// Full resting arms (shoulder to hand, hanging straight down) — used by patterns that
// don't animate the arms at all (squat, hinge, core, cardio), just to complete the figure.
function StaticArms() {
  return (
    <>
      <UpperArms />
      <line x1={ELBOW_L.x} y1={ELBOW_L.y} x2={HAND_DOWN_L.x} y2={HAND_DOWN_L.y} stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
      <line x1={ELBOW_R.x} y1={ELBOW_R.y} x2={HAND_DOWN_R.x} y2={HAND_DOWN_R.y} stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
    </>
  );
}

function Diagram({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 100" className="movement-animation" role="img" aria-label="Exercise movement animation">
      {children}
    </svg>
  );
}

export default function MovementAnimation({ pattern }: { pattern: MovementPattern }) {
  switch (pattern) {
    case "press":
      return (
        <Diagram>
          <Head />
          <StaticTorso />
          <StaticLegs />
          <UpperArms color={ACCENT} />
          <g className="mv-anim-press" style={{ transformOrigin: `${ELBOW_L.x}px ${ELBOW_L.y}px` }}>
            <line x1={ELBOW_L.x} y1={ELBOW_L.y} x2={HAND_DOWN_L.x} y2={HAND_DOWN_L.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
          <g className="mv-anim-press-mirror" style={{ transformOrigin: `${ELBOW_R.x}px ${ELBOW_R.y}px` }}>
            <line x1={ELBOW_R.x} y1={ELBOW_R.y} x2={HAND_DOWN_R.x} y2={HAND_DOWN_R.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
        </Diagram>
      );
    case "pull":
      return (
        <Diagram>
          <Head />
          <StaticTorso />
          <StaticLegs />
          <UpperArms color={ACCENT} />
          <g className="mv-anim-pull" style={{ transformOrigin: `${ELBOW_L.x}px ${ELBOW_L.y}px` }}>
            <line x1={ELBOW_L.x} y1={ELBOW_L.y} x2={HAND_DOWN_L.x} y2={HAND_DOWN_L.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
          <g className="mv-anim-pull-mirror" style={{ transformOrigin: `${ELBOW_R.x}px ${ELBOW_R.y}px` }}>
            <line x1={ELBOW_R.x} y1={ELBOW_R.y} x2={HAND_DOWN_R.x} y2={HAND_DOWN_R.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
        </Diagram>
      );
    case "squat":
      return (
        <Diagram>
          <StaticLegs />
          <g className="mv-anim-squat">
            <Head />
            <line x1={50} y1={24} x2={50} y2={58} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
            <StaticArms />
          </g>
        </Diagram>
      );
    case "hinge":
      return (
        <Diagram>
          <StaticLegs />
          <g className="mv-anim-hinge" style={{ transformOrigin: "50px 58px" }}>
            <Head />
            <line x1={50} y1={24} x2={50} y2={58} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
            <StaticArms />
          </g>
        </Diagram>
      );
    case "curl":
      return (
        <Diagram>
          <Head />
          <StaticTorso />
          <StaticLegs />
          <UpperArms />
          <g className="mv-anim-curl" style={{ transformOrigin: `${ELBOW_L.x}px ${ELBOW_L.y}px` }}>
            <line x1={ELBOW_L.x} y1={ELBOW_L.y} x2={HAND_DOWN_L.x} y2={HAND_DOWN_L.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
          <g className="mv-anim-curl-mirror" style={{ transformOrigin: `${ELBOW_R.x}px ${ELBOW_R.y}px` }}>
            <line x1={ELBOW_R.x} y1={ELBOW_R.y} x2={HAND_DOWN_R.x} y2={HAND_DOWN_R.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
        </Diagram>
      );
    case "raise":
      return (
        <Diagram>
          <Head />
          <StaticTorso />
          <StaticLegs />
          <g className="mv-anim-raise" style={{ transformOrigin: `${SHOULDER_L.x}px ${SHOULDER_L.y}px` }}>
            <line x1={SHOULDER_L.x} y1={SHOULDER_L.y} x2={HAND_DOWN_L.x} y2={HAND_DOWN_L.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
          <g className="mv-anim-raise-mirror" style={{ transformOrigin: `${SHOULDER_R.x}px ${SHOULDER_R.y}px` }}>
            <line x1={SHOULDER_R.x} y1={SHOULDER_R.y} x2={HAND_DOWN_R.x} y2={HAND_DOWN_R.y} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
        </Diagram>
      );
    case "core":
      return (
        <Diagram>
          <g className="mv-anim-core" style={{ transformOrigin: "50px 58px" }}>
            <Head />
            <StaticTorso />
            <StaticArms />
          </g>
          <g className="mv-anim-core-legs" style={{ transformOrigin: "50px 58px" }}>
            <line x1={50} y1={58} x2={40} y2={90} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
            <line x1={50} y1={58} x2={60} y2={90} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
        </Diagram>
      );
    case "cardio":
      return (
        <Diagram>
          <Head />
          <StaticTorso />
          <StaticArms />
          <g className="mv-anim-cardio-front" style={{ transformOrigin: "50px 58px" }}>
            <line x1={50} y1={58} x2={40} y2={90} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
          <g className="mv-anim-cardio-back" style={{ transformOrigin: "50px 58px" }}>
            <line x1={50} y1={58} x2={60} y2={90} stroke={ACCENT} strokeWidth={3} strokeLinecap="round" />
          </g>
        </Diagram>
      );
  }
}
