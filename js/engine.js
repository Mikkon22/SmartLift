// Progression engine — pure functions, no DOM. Tested by test/engine.test.mjs.
//
// Two jobs:
//  1. suggest(): before a workout, turn the last result for an exercise into today's target
//     (last total volume + X %), split into sets the way the plan prescribes: when a set would
//     go over the top of the rep range, add a set and drop the reps (3×15 → 4×12).
//  2. adapt(): during a workout, after each logged set, re-split what is left of the target
//     over the remaining sets so the total still gets done. If a set falls short, the remaining
//     sets are capped at what the user just managed and extra sets are added (7·7·7 planned,
//     5 done → 4·4·4·4 to finish the 21).

export const MAX_SETS = 12;

export function tri(n) { return (n * (n + 1)) / 2; }
export function sum(a) { return a.reduce((s, x) => s + (Number(x) || 0), 0); }

export function stepFor(item) {
  if (item.kind === "time") return 5;
  if (item.kind === "accum" && item.accum.unit === "sec") return 5;
  return 1;
}

export function unitFor(item) {
  if (item.kind === "time") return "sec";
  if (item.kind === "accum") return item.accum.unit;
  return "reps";
}

function roundUp(v, step) { return Math.ceil(v / step - 1e-9) * step; }

// Split `total` into `n` sets, multiples of `step`, larger sets first.
export function distribute(total, n, step = 1) {
  n = Math.max(1, Math.floor(n));
  const units = Math.max(0, Math.ceil(total / step - 1e-9));
  const base = Math.floor(units / n), extra = units % n;
  const out = [];
  for (let i = 0; i < n; i++) out.push((base + (i < extra ? 1 : 0)) * step);
  return out.map((v) => Math.max(v, step));
}

// Progress the previous total by pct, always at least one step more.
export function progressTotal(lastTotal, pct, step = 1) {
  const raw = roundUp(lastTotal * (1 + pct / 100), step);
  return Math.max(raw, lastTotal + step);
}

// last: { sets: number[], total: number, top?: number } — most recent NON-deload result.
// opts: { pct: number, deload: boolean }
export function suggest(item, last, opts = {}) {
  const pct = opts.pct == null ? 3 : opts.pct;
  const deload = !!opts.deload;
  const step = stepFor(item);
  const unit = unitFor(item);
  const notes = [];
  const has = last && Array.isArray(last.sets) && last.sets.length && sum(last.sets) > 0;
  const lastTotal = has ? sum(last.sets) : 0;

  if (item.kind === "reps" || item.kind === "time") {
    const [sMin, sMax] = deload ? item.deload : item.sets;
    if (!has) {
      const sets = new Array(item.sets[0]).fill(item.min);
      if (deload) sets.length = item.deload[1];
      return { unit, step, sets, target: sum(sets), basis: "first", notes };
    }
    if (deload) {
      // Same reps, roughly half the sets, no progression.
      const avg = clamp(roundUp(lastTotal / last.sets.length, step), item.min, item.max);
      const sets = new Array(sMax).fill(avg);
      return { unit, step, sets, target: sum(sets), basis: "deload", notes };
    }
    const target = progressTotal(lastTotal, pct, step);
    let n = Math.max(sMin, Math.ceil(target / item.max - 1e-9));
    if (n > sMax) notes.push("intensity");
    n = Math.min(n, MAX_SETS);
    const sets = distribute(target, n, step);
    return { unit, step, sets, target, basis: "progress", notes, lastTotal };
  }

  if (item.kind === "down") {
    const series = deload ? item.deload[1] : item.sets[0];
    let top;
    if (!has) top = item.min;
    else {
      const lastTop = last.top || item.min;
      const completed = lastTotal >= tri(lastTop) * last.sets.length;
      if (deload) top = lastTop;
      else if (completed && lastTop < item.max) top = lastTop + 1;
      else {
        top = lastTop;
        if (completed) notes.push("intensity");
      }
    }
    const sets = new Array(series).fill(tri(top));
    return { unit, step, sets, target: sum(sets), top, basis: !has ? "first" : deload ? "deload" : "progress", notes, lastTotal };
  }

  if (item.kind === "accum") {
    const a = item.accum;
    if (a.unit === "reps") {
      if (!has) {
        // Week 1 sets the baseline: a soft proposal, the user beats it later.
        const sets = new Array(5).fill(3);
        notes.push("baseline");
        return { unit, step, sets, target: sum(sets), basis: "first", notes, window: deload ? a.deloadWindow : a.window };
      }
      const chunk = Math.max(1, Math.round(lastTotal / last.sets.length));
      const target = deload ? Math.max(1, Math.round(lastTotal / 2)) : progressTotal(lastTotal, pct, step);
      const sets = distribute(target, Math.min(MAX_SETS * 2, Math.ceil(target / chunk)), step);
      return { unit, step, sets, target, basis: deload ? "deload" : "progress", notes, lastTotal, window: deload ? a.deloadWindow : a.window };
    }
    // seconds
    const lo = deload ? a.deloadMin : a.min;
    const hi = deload ? a.deloadMax : a.max;
    let target;
    let chunk = 30;
    if (!has) target = lo;
    else {
      chunk = Math.max(10, roundUp(lastTotal / last.sets.length, step));
      target = deload ? clamp(roundUp(lastTotal / 2, step), lo, hi) : progressTotal(lastTotal, pct, step);
    }
    if (!deload && has && target > hi) notes.push("accumTop");
    const sets = distribute(target, Math.min(MAX_SETS * 2, Math.ceil(target / chunk - 1e-9)), step);
    return { unit, step, sets, target, basis: !has ? "first" : deload ? "deload" : "progress", notes, lastTotal };
  }

  throw new Error("Unknown kind " + item.kind);
}

// Re-plan the sets that are still ahead.
//   target        total volume to reach today
//   done          values of the sets already logged
//   pendingCount  how many sets were still planned before this re-plan
//   step          rounding step (1 rep, 5 s)
export function adapt(target, done, pendingCount, step = 1, maxSets = MAX_SETS) {
  const remaining = target - sum(done);
  if (remaining <= 0) return [];
  let n = Math.max(1, pendingCount);
  const cap = done.length ? Number(done[done.length - 1]) : Infinity;
  if (isFinite(cap) && cap > 0) n = Math.max(n, Math.ceil(remaining / cap - 1e-9));
  n = Math.max(1, Math.min(n, maxSets - done.length));
  return distribute(remaining, n, step);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Week-of-phase helper: 4 sessions = one week. Week 6 is the deload.
export function weekInfo(sessionsDoneInPhase, weeks = 5) {
  const week = Math.floor(sessionsDoneInPhase / 4) + 1;
  return { week, isDeload: week === weeks + 1, beyond: week > weeks + 1 };
}
