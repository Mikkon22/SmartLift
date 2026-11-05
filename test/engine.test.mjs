import assert from "node:assert/strict";
import { suggest, adapt, distribute, progressTotal, tri, sum } from "../js/engine.js";
import { PHASES, allEntries, initials } from "../js/plan.js";

const dip = PHASES[0].sessions[0].items[0]; // 3-4 × 6-8
const row = { kind: "reps", sets: [3, 4], deload: [1, 2], min: 10, max: 15 };

// first time → plan minimum
assert.deepEqual(suggest(dip, null).sets, [6, 6, 6]);

// +3 % on 7·7·7 = 21 → 22 (min +1), stays 3 sets ≤ 8
let s = suggest(dip, { sets: [7, 7, 7] }, { pct: 3 });
assert.equal(s.target, 22); assert.deepEqual(s.sets, [8, 7, 7]);

// top of range reached → add a set, drop reps (3×15 → 4 sets)
s = suggest(row, { sets: [15, 15, 15] }, { pct: 3 });
assert.equal(s.target, 47); assert.deepEqual(s.sets, [12, 12, 12, 11]);

// beyond max sets → intensity note
s = suggest(dip, { sets: [8, 8, 8, 8] }, { pct: 3 });
assert.ok(s.notes.includes("intensity"));

// 10 % progression
assert.equal(progressTotal(40, 10), 44);

// deload: same reps, fewer sets
s = suggest(dip, { sets: [8, 7, 7] }, { pct: 3, deload: true });
assert.deepEqual(s.sets, [8, 8]);

// adapt: user's example — 7·7·7 planned, first set only 5
assert.deepEqual(adapt(21, [5], 2), [4, 4, 4, 4]);
assert.equal(5 + sum(adapt(21, [5], 2)), 21);
// better than planned → fewer reps left, same number of sets
assert.deepEqual(adapt(21, [9], 2), [6, 6]);
// target reached → nothing left
assert.deepEqual(adapt(21, [8, 8, 6], 0), []);
// last set exactly matches → keep
assert.deepEqual(adapt(22, [8], 2), [7, 7]);

// time: 5 s steps
const tap = PHASES[1].sessions[2].items[3];
s = suggest(tap, { sets: [30, 30, 30] }, { pct: 3 });
assert.equal(s.target, 95); assert.ok(s.sets.every((v) => v % 5 === 0));

// down series
const dia = PHASES[1].sessions[0].items[5];
assert.equal(suggest(dia, null).top, 8);
assert.equal(suggest(dia, { sets: [36], top: 8 }).top, 9);
assert.equal(suggest(dia, { sets: [30], top: 8 }).top, 8);
assert.equal(tri(10), 55);

// accumulation
const hang = PHASES[1].sessions[3].items[4];
s = suggest(hang, null);
assert.equal(s.target, 120);
s = suggest(hang, { sets: [40, 40, 40] }, { pct: 3 });
assert.equal(s.target, 125);
const hspu = PHASES[2].sessions[0].items[0];
s = suggest(hspu, { sets: [5, 5, 4, 4, 3] }, { pct: 3 });
assert.equal(s.target, 22); assert.equal(sum(s.sets), 22);

assert.deepEqual(distribute(16, 3), [6, 5, 5]);

assert.equal(initials("Chinup"), "C");
assert.equal(initials("Ring Dip"), "RD");
assert.equal(initials("Archer Bodyweight Row"), "AB");
assert.equal(initials("L-Row"), "LR");

console.log("entries:", allEntries().length, "— all engine tests passed");
