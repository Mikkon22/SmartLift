// Body By Rings — Push & Pull, Phases 1-3 (source: bodybyrings.com, reformatted for personal use).
//
// Prescription shape (one row of the plan):
//   code       "A1"…"F1"
//   ex         exercise id from EXERCISES
//   variation  string shown under the name; `variations` = list the user can choose from
//   sets       [min, max]            deload [min, max]
//   kind       "reps" | "time" | "down" | "accum"
//   min/max    reps per set (reps), seconds per set (time), top number (down)
//   accum      { unit: "reps"|"sec", window: minutes } or { unit: "sec", min, max } total seconds
//   side       true → numbers are per side (L&R)
//   tempo      tempo code or text
//   rest       seconds (lower bound of the prescribed rest); restText = original wording

export const EXERCISES = {
  "ring-dip":          { name: "Ring Dip",              group: "push" },
  "archer-pushup":     { name: "Archer Pushup",         group: "push" },
  "chest-fly":         { name: "Chest Fly",             group: "push" },
  "tricep-dip":        { name: "Tricep Dip",            group: "push" },
  "tricep-extension":  { name: "Tricep Extension",      group: "push" },
  "shoulder-pushup":   { name: "Shoulder Pushup",       group: "push" },
  "bulgarian-pushup":  { name: "Bulgarian Pushup",      group: "push" },
  "shoulder-shrug":    { name: "Shoulder Shrug",        group: "push" },
  "diamond-pushup":    { name: "Diamond Pushup",        group: "push" },
  "shoulder-tap":      { name: "Shoulder Tap",          group: "push" },
  "waist-tap":         { name: "Waist Tap",             group: "push" },
  "handstand-pushup":  { name: "Handstand Pushup",      group: "push" },
  "chinup":            { name: "Chinup",                group: "pull" },
  "bodyweight-row":    { name: "Bodyweight Row",        group: "pull" },
  "pelican-curl":      { name: "Pelican Curl",          group: "pull" },
  "face-pull":         { name: "Face Pull",             group: "pull" },
  "ring-rollout":      { name: "Ring Rollout",          group: "core" },
  "mantle-chinup":     { name: "Mantle Chinup",         group: "pull" },
  "archer-bw-row":     { name: "Archer Bodyweight Row", group: "pull" },
  "bw-bicep-curl":     { name: "Bodyweight Bicep Curl", group: "pull" },
  "wide-pullup":       { name: "Wide Pullup",           group: "pull" },
  "rear-delt-fly":     { name: "Rear Delt Fly",         group: "pull" },
  "archer-chinup":     { name: "Archer Chinup",         group: "pull" },
  "single-arm-row":    { name: "Single Arm Row",        group: "pull" },
  "two-arm-hang":      { name: "Two Arm Hang",          group: "pull" },
  "l-row":             { name: "L-Row",                 group: "pull" },
  "one-arm-hang":      { name: "One Arm Hang",          group: "pull" },
};

// Placeholder "video" label: one word → first letter, two+ words → first letters of the first two.
export function initials(name) {
  const words = String(name).split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const R = (code, ex, variation, sets, deload, min, max, tempo, rest, extra = {}) =>
  ({ code, ex, variation, sets, deload, kind: "reps", min, max, tempo, rest, restText: fmtRest(rest), ...extra });
const T = (code, ex, variation, sets, deload, min, max, tempo, rest, extra = {}) =>
  ({ code, ex, variation, sets, deload, kind: "time", min, max, tempo, rest, restText: fmtRest(rest), ...extra });
const D = (code, ex, variation, sets, deload, min, max, tempo) =>
  ({ code, ex, variation, sets, deload, kind: "down", min, max, tempo, rest: 0, restText: "wg uznania" });

function fmtRest(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

const CHINUP_VARIANTS = ["Regular", "Tuck L", "L-Sit"];

export const PHASES = [
  {
    id: 1, name: "Faza 1", subtitle: "Foundation", rest: "1:30",
    sessions: [
      { id: "push1", name: "Push 1", items: [
        R("A1", "ring-dip", "Elbows in", [3,4], [1,2], 6, 8, "30X1", 90),
        R("B1", "archer-pushup", "Alternating", [3,4], [1,2], 4, 6, "20X0", 90, { side: true }),
        R("C1", "chest-fly", "", [3,3], [1,2], 8, 10, "30X0", 90),
        R("D1", "tricep-dip", "", [3,3], [1,2], 6, 10, "20X0", 90),
        R("E1", "tricep-extension", "", [3,3], [1,2], 8, 10, "30X1", 90),
      ]},
      { id: "pull1", name: "Pull 1", items: [
        R("A1", "chinup", "Regular", [3,5], [2,3], 6, 8, "30X2", 120, { variations: CHINUP_VARIANTS, restText: "2:00-3:00" }),
        R("B1", "bodyweight-row", "Two arms", [3,4], [1,2], 10, 15, "20X1", 90, { side: true }),
        R("C1", "pelican-curl", "", [3,3], [1,2], 5, 8, "30X0", 90),
        R("D1", "face-pull", "", [3,3], [1,2], 8, 10, "30X0", 90),
        R("E1", "ring-rollout", "", [3,3], [1,2], 8, 10, "40X0", 90),
      ]},
      { id: "push2", name: "Push 2", items: [
        R("A1", "ring-dip", "Elbows in", [3,4], [1,2], 6, 8, "30X1", 90),
        R("B1", "shoulder-pushup", "Feet on floor", [3,4], [1,2], 4, 8, "30X1", 90),
        R("C1", "bulgarian-pushup", "", [3,4], [1,2], 6, 10, "20X0", 90),
        R("D1", "shoulder-shrug", "Back to wall", [3,4], [1,2], 8, 12, "2s izometria", 90),
        R("E1", "tricep-dip", "", [3,3], [1,2], 6, 10, "20X0", 90),
      ]},
      { id: "pull2", name: "Pull 2", items: [
        R("A1", "mantle-chinup", "", [3,5], [1,2], 4, 6, "30X2", 90, { side: true }),
        R("B1", "archer-bw-row", "", [3,4], [1,2], 4, 8, "20X0", 90, { side: true }),
        R("C1", "face-pull", "", [3,3], [1,2], 8, 10, "20X0", 90),
        R("D1", "bw-bicep-curl", "", [3,4], [1,2], 8, 10, "30X1", 90),
      ]},
    ],
  },
  {
    id: 2, name: "Faza 2", subtitle: "Build", rest: "1:30",
    sessions: [
      { id: "push1", name: "Push 1", items: [
        R("A1", "ring-dip", "Elbows in", [3,4], [1,2], 8, 10, "30X1", 90),
        R("B1", "archer-pushup", "Alternating", [3,4], [1,2], 6, 8, "20X0", 90, { side: true }),
        R("C1", "chest-fly", "", [3,3], [1,2], 8, 12, "30X0", 90),
        R("D1", "tricep-dip", "", [3,3], [1,2], 8, 15, "30X0", 90),
        R("E1", "tricep-extension", "", [3,4], [1,2], 8, 12, "30X1", 90),
        D("F1", "diamond-pushup", "Feet elevated", [1,1], [1,1], 8, 15, "30X1"),
      ]},
      { id: "pull1", name: "Pull 1", items: [
        R("A1", "wide-pullup", "Tuck L", [3,4], [1,2], 6, 12, "30X0", 120, { restText: "2:00-3:00" }),
        R("B1", "archer-bw-row", "", [3,4], [1,2], 6, 8, "20X0", 90, { side: true }),
        R("C1", "pelican-curl", "", [3,3], [1,2], 6, 10, "30X0", 90),
        R("D1", "rear-delt-fly", "", [3,3], [1,2], 8, 12, "30X0", 90),
        R("E1", "ring-rollout", "", [3,3], [1,2], 10, 12, "40X0", 90),
      ]},
      { id: "push2", name: "Push 2", items: [
        R("A1", "ring-dip", "Bulgarian", [3,4], [1,2], 5, 8, "30X1", 90),
        R("B1", "shoulder-pushup", "Feet elevated", [3,4], [1,2], 6, 10, "40X1", 90),
        R("C1", "bulgarian-pushup", "", [3,4], [1,2], 8, 10, "30X1", 90),
        T("D1", "shoulder-tap", "Chest to wall", [3,4], [1,2], 30, 45, "—", 90),
        R("E1", "tricep-dip", "", [3,4], [1,2], 6, 10, "20X0", 90),
      ]},
      { id: "pull2", name: "Pull 2", items: [
        R("A1", "archer-chinup", "Alternating", [4,6], [1,3], 3, 5, "30X0", 90, { side: true }),
        R("B1", "single-arm-row", "", [3,4], [1,2], 4, 8, "30X0", 90, { side: true }),
        R("C1", "face-pull", "", [3,4], [1,2], 8, 12, "20X0", 90),
        R("D1", "bw-bicep-curl", "", [3,4], [1,2], 8, 12, "30X1", 90),
        { code: "E1", ex: "two-arm-hang", variation: "", kind: "accum", accum: { unit: "sec", min: 120, max: 240, deloadMin: 60, deloadMax: 120 },
          sets: null, deload: null, tempo: "—", rest: 60, restText: "wg uznania" },
      ]},
    ],
  },
  {
    id: 3, name: "Faza 3", subtitle: "Peak", rest: "2:00",
    sessions: [
      { id: "push1", name: "Push 1", items: [
        { code: "A1", ex: "handstand-pushup", variation: "Chest to wall", kind: "accum", accum: { unit: "reps", window: 20, deloadWindow: 10 },
          sets: null, deload: null, tempo: "30X1", rest: 60, restText: "wg uznania" },
        R("B1", "ring-dip", "Bulgarian", [3,5], [1,3], 5, 8, "30X1", 120),
        R("C1", "archer-pushup", "Same side", [3,5], [2,3], 6, 8, "30X1", 120, { side: true }),
        R("D1", "chest-fly", "", [4,5], [2,3], 6, 8, "30X0", 120),
        R("E1", "tricep-extension", "", [5,6], [2,3], 5, 6, "30X1", 120),
        R("F1", "tricep-dip", "", [3,4], [1,2], 8, 12, "30X0", 120),
      ]},
      { id: "pull1", name: "Pull 1", items: [
        R("A1", "wide-pullup", "L-Sit", [3,5], [1,2], 5, 8, "30X0", 120, { restText: "2:00-3:00" }),
        R("B1", "l-row", "", [3,5], [1,2], 3, 8, "30X0", 120),
        R("C1", "pelican-curl", "", [3,4], [1,2], 6, 10, "40X0", 120),
        R("D1", "rear-delt-fly", "", [3,4], [1,2], 8, 15, "30X0", 120),
        R("E1", "ring-rollout", "", [3,3], [1,1], 10, 15, "40X1", 120),
      ]},
      { id: "push2", name: "Push 2", items: [
        R("A1", "ring-dip", "Elbows in", [3,5], [1,2], 8, 12, "30X1", 120),
        R("B1", "shoulder-pushup", "Feet elevated", [3,5], [1,2], 6, 10, "30X1", 120),
        R("C1", "bulgarian-pushup", "", [3,5], [1,2], 10, 15, "30X1", 120),
        T("D1", "waist-tap", "Chest to wall", [3,5], [1,2], 30, 45, "—", 120),
        R("E1", "tricep-dip", "", [3,4], [1,2], 10, 12, "30X1", 120),
        D("F1", "diamond-pushup", "Feet elevated", [2,2], [1,1], 8, 12, "30X1"),
      ]},
      { id: "pull2", name: "Pull 2", items: [
        R("A1", "archer-chinup", "Same side", [3,5], [1,2], 4, 8, "30X1", 90, { side: true }),
        R("B1", "single-arm-row", "", [3,5], [1,2], 6, 10, "30X0", 120, { side: true }),
        R("C1", "face-pull", "", [3,4], [1,2], 8, 12, "20X0", 120),
        R("D1", "pelican-curl", "Negative", [3,3], [1,2], 3, 4, "6-8 s opuszczanie", 120),
        R("E1", "bw-bicep-curl", "", [3,4], [1,2], 6, 10, "30X1", 120),
        { code: "F1", ex: "one-arm-hang", variation: "", kind: "accum", side: true, accum: { unit: "sec", min: 120, max: 240, deloadMin: 60, deloadMax: 120 },
          sets: null, deload: null, tempo: "—", rest: 60, restText: "wg uznania" },
      ]},
    ],
  },
];

export const SESSION_ORDER = ["push1", "pull1", "push2", "pull2"];
export const WEEKS_PER_PHASE = 5; // + 1 deload week

// Results are remembered per exercise + variation: "Ring Dip · Bulgarian" is a different
// intensity than "Ring Dip · Elbows in", so mixing them would make the suggestion meaningless.
export function resultKey(ex, variation) {
  return variation ? ex + "|" + variation : ex;
}

export function displayName(ex, variation) {
  const n = EXERCISES[ex] ? EXERCISES[ex].name : ex;
  return variation ? n + " · " + variation : n;
}

// Every distinct exercise+variation in the plan, for the exercise library.
export function allEntries() {
  const map = new Map();
  for (const ph of PHASES) for (const s of ph.sessions) for (const it of s.items) {
    const vars = it.variations || [it.variation];
    for (const v of vars) {
      const k = resultKey(it.ex, v);
      if (!map.has(k)) map.set(k, { key: k, ex: it.ex, variation: v, uses: [] });
      map.get(k).uses.push({ phase: ph.id, session: s.name, code: it.code, item: it });
    }
  }
  return [...map.values()];
}
