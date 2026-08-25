// A curated reference catalog of common exercises — muscle targets, a movement pattern
// (used to pick which built-in animation to show), and short form cues. Purely static
// data, not user data: no backend table, no migration. Logging still accepts any free-
// typed name (see EXERCISE_NAME_LIST_ID usage in pages/Workouts.tsx) — a name that isn't
// in here just has no muscle/animation data, which is an accepted tradeoff, not a bug.

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves";

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
};

export type MovementPattern = "press" | "pull" | "squat" | "hinge" | "curl" | "raise" | "core" | "cardio";

export interface ExerciseDef {
  name: string;
  type: "strength" | "cardio";
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  pattern: MovementPattern;
  instructions: string[];
}

export const EXERCISE_LIBRARY: ExerciseDef[] = [
  // Chest / press
  {
    name: "Bench Press",
    type: "strength",
    primary: ["chest"],
    secondary: ["triceps", "shoulders"],
    pattern: "press",
    instructions: [
      "Lie on the bench with the bar over your eyes, feet flat on the floor.",
      "Lower the bar to mid-chest with control, elbows at roughly 45°.",
      "Press back up to full arm extension without bouncing off your chest.",
    ],
  },
  {
    name: "Incline Bench Press",
    type: "strength",
    primary: ["chest"],
    secondary: ["shoulders", "triceps"],
    pattern: "press",
    instructions: [
      "Set the bench to a 30-45° incline.",
      "Lower the bar to your upper chest, elbows at roughly 45°.",
      "Press back up to full extension.",
    ],
  },
  {
    name: "Push-Up",
    type: "strength",
    primary: ["chest"],
    secondary: ["triceps", "shoulders", "abs"],
    pattern: "press",
    instructions: [
      "Hands slightly wider than shoulders, body in a straight line.",
      "Lower your chest toward the floor, elbows at roughly 45°.",
      "Press back up without letting your hips sag.",
    ],
  },
  {
    name: "Chest Fly",
    type: "strength",
    primary: ["chest"],
    secondary: ["shoulders"],
    pattern: "raise",
    instructions: [
      "Lie on a bench holding dumbbells above your chest, slight elbow bend.",
      "Lower your arms out to the sides in an arc until you feel a chest stretch.",
      "Bring the dumbbells back together over your chest.",
    ],
  },
  {
    name: "Dips",
    type: "strength",
    primary: ["chest", "triceps"],
    secondary: ["shoulders"],
    pattern: "press",
    instructions: [
      "Support yourself on parallel bars, arms straight.",
      "Lower your body by bending your elbows, leaning slightly forward.",
      "Press back up to full arm extension.",
    ],
  },

  // Shoulders
  {
    name: "Overhead Press",
    type: "strength",
    primary: ["shoulders"],
    secondary: ["triceps"],
    pattern: "press",
    instructions: [
      "Stand with the bar at shoulder height, core braced.",
      "Press the bar straight overhead until your arms are locked out.",
      "Lower with control back to shoulder height.",
    ],
  },
  {
    name: "Lateral Raise",
    type: "strength",
    primary: ["shoulders"],
    secondary: [],
    pattern: "raise",
    instructions: [
      "Hold a dumbbell in each hand at your sides, slight elbow bend.",
      "Raise both arms out to the sides until roughly shoulder height.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Front Raise",
    type: "strength",
    primary: ["shoulders"],
    secondary: [],
    pattern: "raise",
    instructions: [
      "Hold a dumbbell in each hand in front of your thighs.",
      "Raise one or both arms straight out in front to shoulder height.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Rear Delt Fly",
    type: "strength",
    primary: ["shoulders"],
    secondary: ["back"],
    pattern: "raise",
    instructions: [
      "Hinge forward at the hips holding dumbbells, slight elbow bend.",
      "Raise both arms out to the sides, squeezing your shoulder blades together.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Arnold Press",
    type: "strength",
    primary: ["shoulders"],
    secondary: ["triceps"],
    pattern: "press",
    instructions: [
      "Start with dumbbells at shoulder height, palms facing you.",
      "Press overhead while rotating your palms to face forward.",
      "Reverse the rotation on the way back down.",
    ],
  },

  // Back / pull
  {
    name: "Pull-Up",
    type: "strength",
    primary: ["back"],
    secondary: ["biceps", "forearms"],
    pattern: "pull",
    instructions: [
      "Hang from the bar with an overhand grip, wider than shoulders.",
      "Pull yourself up until your chin clears the bar.",
      "Lower back down under control to a full hang.",
    ],
  },
  {
    name: "Chin-Up",
    type: "strength",
    primary: ["back", "biceps"],
    secondary: ["forearms"],
    pattern: "pull",
    instructions: [
      "Hang from the bar with an underhand grip, shoulder-width.",
      "Pull yourself up until your chin clears the bar.",
      "Lower back down under control to a full hang.",
    ],
  },
  {
    name: "Lat Pulldown",
    type: "strength",
    primary: ["back"],
    secondary: ["biceps"],
    pattern: "pull",
    instructions: [
      "Grip the bar wider than shoulders, sit with thighs braced.",
      "Pull the bar down to your upper chest, leading with your elbows.",
      "Let the bar rise back up under control to full arm extension.",
    ],
  },
  {
    name: "Seated Row",
    type: "strength",
    primary: ["back"],
    secondary: ["biceps"],
    pattern: "pull",
    instructions: [
      "Sit with knees slightly bent, grip the handle with arms extended.",
      "Pull the handle to your torso, squeezing your shoulder blades together.",
      "Extend your arms back out with control.",
    ],
  },
  {
    name: "Bent-Over Row",
    type: "strength",
    primary: ["back"],
    secondary: ["biceps", "forearms"],
    pattern: "pull",
    instructions: [
      "Hinge forward at the hips, back flat, holding the bar with arms extended.",
      "Pull the bar to your lower ribs, elbows close to your body.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Single-Arm Dumbbell Row",
    type: "strength",
    primary: ["back"],
    secondary: ["biceps"],
    pattern: "pull",
    instructions: [
      "Support yourself on a bench with one hand and knee, back flat.",
      "Pull the dumbbell up to your hip, elbow close to your body.",
      "Lower back down with control.",
    ],
  },

  // Arms
  {
    name: "Bicep Curl",
    type: "strength",
    primary: ["biceps"],
    secondary: ["forearms"],
    pattern: "curl",
    instructions: [
      "Stand holding dumbbells at your sides, palms facing forward.",
      "Curl the weights up toward your shoulders, keeping elbows still.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Hammer Curl",
    type: "strength",
    primary: ["biceps", "forearms"],
    secondary: [],
    pattern: "curl",
    instructions: [
      "Stand holding dumbbells at your sides, palms facing your body.",
      "Curl the weights up toward your shoulders, keeping palms facing in.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Tricep Pushdown",
    type: "strength",
    primary: ["triceps"],
    secondary: [],
    pattern: "press",
    instructions: [
      "Stand at the cable stack, elbows tucked at your sides.",
      "Push the bar down until your arms are fully extended.",
      "Let it rise back up with control, elbows staying still.",
    ],
  },
  {
    name: "Skull Crushers",
    type: "strength",
    primary: ["triceps"],
    secondary: [],
    pattern: "curl",
    instructions: [
      "Lie on a bench holding a bar above your chest, arms extended.",
      "Bend your elbows to lower the bar toward your forehead.",
      "Extend back up without moving your upper arms.",
    ],
  },
  {
    name: "Wrist Curl",
    type: "strength",
    primary: ["forearms"],
    secondary: [],
    pattern: "curl",
    instructions: [
      "Rest your forearms on your thighs or a bench, palms up, holding a bar.",
      "Curl the bar up using only your wrists.",
      "Lower back down with control.",
    ],
  },

  // Legs
  {
    name: "Back Squat",
    type: "strength",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    pattern: "squat",
    instructions: [
      "Bar across your upper back, feet shoulder-width apart.",
      "Bend your hips and knees to lower until thighs are at least parallel.",
      "Drive back up through your heels to standing.",
    ],
  },
  {
    name: "Front Squat",
    type: "strength",
    primary: ["quads"],
    secondary: ["glutes", "abs"],
    pattern: "squat",
    instructions: [
      "Bar racked across the front of your shoulders, elbows high.",
      "Bend your hips and knees to lower until thighs are at least parallel.",
      "Drive back up through your heels to standing.",
    ],
  },
  {
    name: "Leg Press",
    type: "strength",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    pattern: "squat",
    instructions: [
      "Feet shoulder-width on the platform, back flat against the pad.",
      "Lower the platform by bending your knees toward your chest.",
      "Press back up without locking your knees out hard.",
    ],
  },
  {
    name: "Walking Lunge",
    type: "strength",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    pattern: "squat",
    instructions: [
      "Step forward into a long stride, lowering your back knee toward the floor.",
      "Push off your front foot to step into the next lunge.",
      "Keep your torso upright throughout.",
    ],
  },
  {
    name: "Bulgarian Split Squat",
    type: "strength",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    pattern: "squat",
    instructions: [
      "Rear foot elevated on a bench, front foot planted well ahead of you.",
      "Lower your back knee toward the floor, front knee tracking over your foot.",
      "Push back up through your front heel.",
    ],
  },
  {
    name: "Deadlift",
    type: "strength",
    primary: ["hamstrings", "glutes", "back"],
    secondary: ["forearms"],
    pattern: "hinge",
    instructions: [
      "Bar over mid-foot, grip just outside your shins, back flat.",
      "Drive through your heels, keeping the bar close to your legs as you stand.",
      "Lock out your hips at the top, then reverse the motion to lower it.",
    ],
  },
  {
    name: "Romanian Deadlift",
    type: "strength",
    primary: ["hamstrings", "glutes"],
    secondary: ["back"],
    pattern: "hinge",
    instructions: [
      "Hold the bar at hip height, slight knee bend.",
      "Hinge at the hips, sliding the bar down your legs until you feel a hamstring stretch.",
      "Drive your hips forward to return to standing.",
    ],
  },
  {
    name: "Hip Thrust",
    type: "strength",
    primary: ["glutes"],
    secondary: ["hamstrings"],
    pattern: "hinge",
    instructions: [
      "Upper back against a bench, bar over your hips, feet flat.",
      "Drive through your heels to raise your hips until your torso is level.",
      "Squeeze your glutes at the top, then lower with control.",
    ],
  },
  {
    name: "Leg Curl",
    type: "strength",
    primary: ["hamstrings"],
    secondary: [],
    pattern: "curl",
    instructions: [
      "Lie face down on the machine, pad against your lower calves.",
      "Curl your heels toward your glutes.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Leg Extension",
    type: "strength",
    primary: ["quads"],
    secondary: [],
    pattern: "curl",
    instructions: [
      "Sit on the machine, pad against your lower shins.",
      "Extend your legs until they're straight.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Calf Raise",
    type: "strength",
    primary: ["calves"],
    secondary: [],
    pattern: "raise",
    instructions: [
      "Stand with the balls of your feet on a raised edge.",
      "Rise up onto your toes as high as you can.",
      "Lower your heels back down below the edge for a full stretch.",
    ],
  },

  // Core
  {
    name: "Plank",
    type: "strength",
    primary: ["abs"],
    secondary: ["obliques"],
    pattern: "core",
    instructions: [
      "Forearms on the floor, elbows under shoulders, body in a straight line.",
      "Brace your core and squeeze your glutes.",
      "Hold the position without letting your hips sag or pike.",
    ],
  },
  {
    name: "Crunch",
    type: "strength",
    primary: ["abs"],
    secondary: [],
    pattern: "core",
    instructions: [
      "Lie on your back, knees bent, hands lightly behind your head.",
      "Curl your shoulders up off the floor, exhaling as you go.",
      "Lower back down with control.",
    ],
  },
  {
    name: "Hanging Leg Raise",
    type: "strength",
    primary: ["abs"],
    secondary: ["forearms"],
    pattern: "core",
    instructions: [
      "Hang from a bar with arms extended.",
      "Raise your legs until they're at least parallel to the floor.",
      "Lower back down with control, avoiding swinging.",
    ],
  },
  {
    name: "Russian Twist",
    type: "strength",
    primary: ["obliques"],
    secondary: ["abs"],
    pattern: "core",
    instructions: [
      "Sit with knees bent, torso leaned back slightly, feet lifted or planted.",
      "Rotate your torso to tap the floor on one side.",
      "Rotate to the other side and repeat.",
    ],
  },
  {
    name: "Side Plank",
    type: "strength",
    primary: ["obliques"],
    secondary: ["abs"],
    pattern: "core",
    instructions: [
      "Lie on your side, propped up on one forearm, body in a straight line.",
      "Raise your hips off the floor.",
      "Hold the position without letting your hips drop.",
    ],
  },
  {
    name: "Farmer's Carry",
    type: "strength",
    primary: ["forearms", "abs"],
    secondary: ["shoulders", "back"],
    pattern: "core",
    instructions: [
      "Hold a heavy dumbbell or kettlebell in each hand at your sides.",
      "Walk forward with a tall posture and braced core.",
      "Set the weights down with control at the end.",
    ],
  },

  // Cardio
  {
    name: "Treadmill Run",
    type: "cardio",
    primary: ["quads", "hamstrings", "calves"],
    secondary: ["glutes"],
    pattern: "cardio",
    instructions: [
      "Warm up with a few minutes of walking.",
      "Run at a steady pace you can sustain for the session.",
      "Cool down with walking for a few minutes at the end.",
    ],
  },
  {
    name: "Treadmill",
    type: "cardio",
    primary: ["quads", "hamstrings", "calves"],
    secondary: ["glutes"],
    pattern: "cardio",
    instructions: [
      "Warm up with a few minutes of walking.",
      "Walk or run at a steady, sustainable pace.",
      "Cool down with slower walking at the end.",
    ],
  },
  {
    name: "Walking",
    type: "cardio",
    primary: ["quads", "hamstrings", "calves"],
    secondary: ["glutes"],
    pattern: "cardio",
    instructions: ["Maintain an upright posture.", "Walk at a brisk, steady pace.", "Swing your arms naturally as you go."],
  },
  {
    name: "Cycling",
    type: "cardio",
    primary: ["quads", "hamstrings"],
    secondary: ["calves", "glutes"],
    pattern: "cardio",
    instructions: [
      "Set the seat height so your knee has a slight bend at full extension.",
      "Pedal at a steady cadence for the session.",
      "Cool down with easy pedaling at the end.",
    ],
  },
  {
    name: "Rowing Machine",
    type: "cardio",
    primary: ["back", "hamstrings"],
    secondary: ["biceps", "quads", "abs"],
    pattern: "cardio",
    instructions: [
      "Drive with your legs first, then lean back and pull the handle to your ribs.",
      "Reverse the order on the way back: arms, then torso, then legs.",
      "Keep a steady rhythm for the session.",
    ],
  },
  {
    name: "Stair Climber",
    type: "cardio",
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "calves"],
    pattern: "cardio",
    instructions: [
      "Stand upright, avoid leaning heavily on the rails.",
      "Step at a steady, sustainable pace.",
      "Cool down by slowing the pace toward the end.",
    ],
  },
  {
    name: "Elliptical",
    type: "cardio",
    primary: ["quads", "hamstrings"],
    secondary: ["glutes", "calves"],
    pattern: "cardio",
    instructions: [
      "Stand tall, engage the handles for a full-body effort if available.",
      "Maintain a steady, sustainable pace.",
      "Cool down with a slower pace at the end.",
    ],
  },
];

const LIBRARY_BY_KEY = new Map<string, ExerciseDef>(EXERCISE_LIBRARY.map((ex) => [normalizeKey(ex.name), ex]));

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

export function findExercise(name: string): ExerciseDef | undefined {
  return LIBRARY_BY_KEY.get(normalizeKey(name));
}

export const EXERCISE_LIBRARY_NAMES: string[] = EXERCISE_LIBRARY.map((ex) => ex.name).sort((a, b) => a.localeCompare(b));
