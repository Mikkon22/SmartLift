// Local persistence. Everything lives in this phone's localStorage (home-screen web apps on iOS
// keep it; Settings → Kopia zapasowa exports/imports a JSON file just in case).
import { resultKey } from "./plan.js";

const K = { settings: "sl.settings", workouts: "sl.workouts", active: "sl.active" };

function read(k, fb) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function write(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("save failed", e); }
}

export const DEFAULT_SETTINGS = {
  onboarded: false,
  pct: 3,
  phase: 1,
  ai: { provider: "gemini", key: "", model: "" },
};

export function getSettings() {
  const s = read(K.settings, {});
  return { ...DEFAULT_SETTINGS, ...s, ai: { ...DEFAULT_SETTINGS.ai, ...(s.ai || {}) } };
}
export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  write(K.settings, next);
  return next;
}

export function getWorkouts() { return read(K.workouts, []); }
export function saveWorkout(w) {
  const list = getWorkouts().filter((x) => x.id !== w.id);
  list.push(w);
  list.sort((a, b) => a.date.localeCompare(b.date));
  write(K.workouts, list);
}
export function deleteWorkout(id) { write(K.workouts, getWorkouts().filter((x) => x.id !== id)); }

export function getActive() { return read(K.active, null); }
export function saveActive(a) { if (a) write(K.active, a); else localStorage.removeItem(K.active); }

// Every logged result for an exercise+variation, newest first.
export function historyFor(key) {
  const out = [];
  for (const w of getWorkouts()) for (const e of w.entries || []) {
    if (e.key === key && e.sets && e.sets.length) out.push({ ...e, date: w.date, deload: !!w.deload, phase: w.phase, session: w.sessionName });
  }
  return out.reverse();
}

// Progression is based on the last normal (non-deload) session.
export function lastResult(ex, variation) {
  const h = historyFor(resultKey(ex, variation));
  const normal = h.find((x) => !x.deload);
  return { last: normal || null, latest: h[0] || null };
}

export function sessionsDoneInPhase(phase) {
  return getWorkouts().filter((w) => w.phase === phase && !w.manual).length;
}

export function lastWorkoutFor(phase, sessionId) {
  const l = getWorkouts().filter((w) => w.phase === phase && w.sessionId === sessionId && !w.manual);
  return l[l.length - 1] || null;
}

export function exportAll() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("sl.") || k.startsWith("talerz.")) data[k] = localStorage.getItem(k);
  }
  // Never put the API key into a file that might get shared.
  if (data[K.settings]) {
    const s = JSON.parse(data[K.settings]);
    if (s.ai) s.ai.key = "";
    data[K.settings] = JSON.stringify(s);
  }
  return { app: "smart-lift", version: 1, exported: new Date().toISOString(), data };
}

export function importAll(obj) {
  if (!obj || obj.app !== "smart-lift" || !obj.data) throw new Error("To nie jest kopia Smart Lift.");
  const keepKey = getSettings().ai.key;
  for (const [k, v] of Object.entries(obj.data)) {
    if (k.startsWith("sl.") || k.startsWith("talerz.")) localStorage.setItem(k, v);
  }
  if (keepKey) { const s = getSettings(); s.ai.key = keepKey; write(K.settings, s); }
}
