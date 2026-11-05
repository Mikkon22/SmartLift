// Training tab: plan overview + the guided workout screen.
import { PHASES, EXERCISES, SESSION_ORDER, WEEKS_PER_PHASE, initials, resultKey, displayName } from "./plan.js";
import { suggest, adapt, sum, tri, stepFor, unitFor, weekInfo } from "./engine.js";
import * as store from "./store.js";
import { h, icon, openSheet, toast, fmtSec, fmtVal, fmtDate, pl, beep, unlockAudio } from "./ui.js";

let root, nav;
let tick = null;

export function mountTrain(container, navigate) {
  root = container; nav = navigate;
  const a = store.getActive();
  if (a && a.open) renderSession(); else renderHome();
}

export function leaveTrain() { stopTick(); }

// ------------------------------------------------------------------ helpers
function phaseById(id) { return PHASES.find((p) => p.id === id) || PHASES[0]; }
function sessionOf(phase, sid) { return phaseById(phase).sessions.find((s) => s.id === sid); }

function nextSessionId(phase) {
  const done = store.getWorkouts().filter((w) => w.phase === phase && !w.manual);
  if (!done.length) return SESSION_ORDER[0];
  const last = done[done.length - 1].sessionId;
  return SESSION_ORDER[(SESSION_ORDER.indexOf(last) + 1) % SESSION_ORDER.length];
}

function rangeText(item) {
  const sets = item.sets ? (item.sets[0] === item.sets[1] ? item.sets[0] : item.sets[0] + "-" + item.sets[1]) : "";
  const side = item.side ? " L&R" : "";
  if (item.kind === "reps") return sets + " × " + item.min + "-" + item.max + side;
  if (item.kind === "time") return sets + " × " + item.min + "-" + item.max + " s";
  if (item.kind === "down") return (item.sets[0] > 1 ? item.sets[0] + " × " : "") + item.min + "-" + item.max + "! seria w dół";
  if (item.kind === "accum") return item.accum.unit === "reps"
    ? "akumulacja " + item.accum.window + " min"
    : "akumulacja " + item.accum.min / 60 + "-" + item.accum.max / 60 + " min" + side;
  return "";
}

function unitWord(unit, n) {
  return unit === "sec" ? "s" : pl(n, "powtórzenie", "powtórzenia", "powtórzeń");
}

function joinSets(sets, unit) { return sets.map((v) => fmtVal(v, unit)).join(" · "); }

// ------------------------------------------------------------------ home
function renderHome() {
  stopTick();
  const st = store.getSettings();
  const phase = phaseById(st.phase);
  const doneCount = store.sessionsDoneInPhase(phase.id);
  const wk = weekInfo(doneCount, WEEKS_PER_PHASE);
  const nextId = nextSessionId(phase.id);
  const active = store.getActive();

  const view = h("main", { class: "view" });
  view.append(
    h("header", { class: "page-h" },
      h("div", { class: "t" }, h("span", { class: "eyebrow" }, "Body by Rings · Push & Pull"), h("h1", null, "Twój plan")),
    ),
  );

  // phase picker
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Faza" });
  PHASES.forEach((p) => seg.append(h("button", {
    "aria-pressed": String(p.id === phase.id),
    onclick: () => { store.saveSettings({ phase: p.id }); renderHome(); },
  }, p.name)));
  view.append(seg);

  // week card
  const strip = h("div", { class: "week-strip", "aria-hidden": "true" });
  const wkNum = Math.min(wk.week, WEEKS_PER_PHASE + 1);
  for (let i = 1; i <= WEEKS_PER_PHASE + 1; i++) {
    strip.append(h("i", { class: (i <= wkNum ? "on" : "") + (i === WEEKS_PER_PHASE + 1 ? " deload" : "") }));
  }
  const weekLabel = wk.beyond ? "Faza zrobiona" : wk.isDeload ? "Tydzień 6 · deload" : "Tydzień " + wk.week + " z " + WEEKS_PER_PHASE;
  view.append(h("section", { class: "card" },
    h("div", { class: "set-h" },
      h("div", null, h("div", { class: "eyebrow" }, phase.name + " · " + phase.subtitle), h("h2", null, weekLabel)),
      h("button", { class: "badge", onclick: () => nav("profile") }, "+" + st.pct + "% / trening")),
    strip,
    h("div", { class: "stat-row" },
      h("span", null, doneCount + " " + pl(doneCount, "trening", "treningi", "treningów") + " w tej fazie"),
      h("span", null, "Następny: ", h("b", null, sessionOf(phase.id, nextId).name))),
  ));

  if (wk.isDeload) view.append(h("div", { class: "banner" }, icon("info", "i sm"),
    h("span", null, "Tydzień deload: ok. połowa serii, te same powtórzenia, bez dobijania do upadku. Włącz go w treningu (menu ⋯).")));
  if (wk.beyond) view.append(h("div", { class: "banner green" }, icon("info", "i sm"),
    h("span", null, "5 tygodni + deload za Tobą. Możesz powtórzyć fazę albo przejść do następnej — wybór fazy jest u góry.")));

  if (active && active.open) {
    view.append(h("button", { class: "banner green", style: { textAlign: "left" }, onclick: renderSession },
      icon("play", "i sm"), h("span", null, h("b", null, "Trening w toku: " + active.sessionName), " — wróć do niego")));
  }

  view.append(h("div", { class: "section-label" }, h("span", null, "Treningi"), h("span", null, "Push 1 → Pull 1 → Push 2 → Pull 2")));
  for (const s of phase.sessions) {
    const last = store.lastWorkoutFor(phase.id, s.id);
    const isNext = s.id === nextId;
    view.append(h("button", { class: "glass plan-card" + (isNext ? " next" : ""), onclick: () => startSession(phase.id, s.id) },
      h("div", { class: "body" },
        h("div", { class: "row" }, h("span", { class: "nm" }, s.name), isNext ? h("span", { class: "badge" }, "Następny") : null),
        h("span", { class: "sub" }, s.items.map((it) => EXERCISES[it.ex].name).join(", ")),
        h("span", { class: "meta" }, s.items.length + " " + pl(s.items.length, "ćwiczenie", "ćwiczenia", "ćwiczeń") + (last ? " · ostatnio " + fmtDate(last.date) : " · jeszcze nie robiony"))),
      h("span", { class: "play", "aria-hidden": "true" }, icon("play"))));
  }

  root.replaceChildren(view);
}

// ------------------------------------------------------------------ session lifecycle
function buildExercise(item, deload, pct, variation) {
  const v = variation != null ? variation : item.variation;
  const { last, latest } = store.lastResult(item.ex, v);
  const s = suggest(item, last, { pct, deload });
  return {
    code: item.code, ex: item.ex, variation: v, key: resultKey(item.ex, v),
    unit: s.unit, step: s.step, target: s.target, top: s.top, basis: s.basis, notes: s.notes,
    lastTotal: last ? sum(last.sets) : 0, last: last ? { sets: last.sets, date: last.date, top: last.top } : null,
    latestDate: latest ? latest.date : null,
    plan: s.sets.slice(), planned: s.sets.length, done: [], note: "",
  };
}

function startSession(phase, sid) {
  const cur = store.getActive();
  if (cur && cur.open && !(cur.phase === phase && cur.sessionId === sid)) {
    openSheet("Masz trening w toku", (sheet, close) => {
      sheet.append(
        h("p", { class: "hint-text" }, "„" + cur.sessionName + "” nie jest zakończony. Co z nim zrobić?"),
        h("button", { class: "btn primary", onclick: () => { close(); renderSession(); } }, "Wróć do " + cur.sessionName),
        h("button", { class: "btn danger", onclick: () => { close(); store.saveActive(null); startSession(phase, sid); } }, "Porzuć i zacznij " + sessionOf(phase, sid).name),
      );
    });
    return;
  }
  if (cur && cur.open) { renderSession(); return; }
  const st = store.getSettings();
  const s = sessionOf(phase, sid);
  const wk = weekInfo(store.sessionsDoneInPhase(phase), WEEKS_PER_PHASE);
  const deload = wk.isDeload;
  const a = {
    open: true, id: "w" + Date.now().toString(36), phase, sessionId: sid, sessionName: s.name,
    deload, pct: st.pct, startedAt: new Date().toISOString(), cur: 0, rest: null,
    exercises: s.items.map((it) => buildExercise(it, deload, st.pct)),
  };
  store.saveActive(a);
  unlockAudio();
  renderSession();
}

function itemOf(a, i) { return sessionOf(a.phase, a.sessionId).items[i]; }

function rebuildPlans(a) {
  // Deload switched or variation changed: re-suggest every exercise that has no logged sets yet.
  a.exercises = a.exercises.map((e, i) => e.done.length ? e : buildExercise(itemOf(a, i), a.deload, a.pct, e.variation));
}

function finishSession() {
  const a = store.getActive();
  if (!a) return;
  const entries = a.exercises.filter((e) => e.done.length).map((e) => ({
    key: e.key, ex: e.ex, variation: e.variation, unit: e.unit, code: e.code,
    sets: e.done.map((d) => d.v), rpe: e.done.map((d) => d.rpe || null),
    target: e.target, top: e.top || null,
  }));
  if (!entries.length) {
    openSheet("Pusty trening", (sheet, close) => {
      sheet.append(h("p", { class: "hint-text" }, "Nie zapisałeś żadnej serii. Porzucić ten trening?"),
        h("button", { class: "btn danger", onclick: () => { close(); store.saveActive(null); stopTick(); renderHome(); } }, "Porzuć"),
        h("button", { class: "btn", onclick: close }, "Wróć do treningu"));
    });
    return;
  }
  const w = {
    id: a.id, date: new Date().toISOString(), startedAt: a.startedAt, phase: a.phase,
    sessionId: a.sessionId, sessionName: a.sessionName, deload: a.deload, pct: a.pct, entries,
  };
  store.saveWorkout(w);
  store.saveActive(null);
  stopTick();
  showSummary(w, a);
}

function showSummary(w, a) {
  const view = h("main", { class: "view" });
  view.append(h("header", { class: "page-h" },
    h("div", { class: "t" }, h("span", { class: "eyebrow" }, "Zapisano · " + phaseById(w.phase).name), h("h1", null, w.sessionName + " zrobiony"))));
  const list = h("div", { class: "ex-list" });
  let hit = 0;
  for (const e of a.exercises.filter((x) => x.done.length)) {
    const total = sum(e.done.map((d) => d.v));
    const ok = total >= e.target;
    if (ok) hit++;
    const delta = e.lastTotal ? Math.round((total / e.lastTotal - 1) * 100) : null;
    list.append(h("div", { class: "ex-row" },
      h("span", { class: "ph s40 " + EXERCISES[e.ex].group }, initials(EXERCISES[e.ex].name)),
      h("div", { class: "body" },
        h("div", { class: "nm" }, displayName(e.ex, e.variation)),
        h("div", { class: "sub num" }, joinSets(e.done.map((d) => d.v), e.unit) + " = " + fmtVal(total, e.unit) + " · cel " + fmtVal(e.target, e.unit))),
      delta != null ? h("span", { class: "delta num" + (delta < 0 ? " neg" : "") }, (delta >= 0 ? "+" : "") + delta + "%")
        : h("span", { class: "badge grey" }, "baza")));
  }
  const n = a.exercises.filter((x) => x.done.length).length;
  view.append(h("section", { class: "card" },
    h("div", { class: "eyebrow" }, "Cel objętości"),
    h("div", { class: "big-num num" }, hit + " / " + n),
    h("p", { class: "hint-text" }, hit === n
      ? "Wszystkie cele dobite. Następnym razem apka doliczy kolejne " + w.pct + "%."
      : "Tam, gdzie zabrakło, następny cel liczy się od tego, co realnie zrobiłeś — bez kary.")), list,
    h("button", { class: "btn primary", onclick: renderHome }, "Gotowe"));
  root.replaceChildren(view);
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ session screen
function renderSession() {
  const a = store.getActive();
  if (!a) { renderHome(); return; }
  const e = a.exercises[a.cur];
  const item = itemOf(a, a.cur);
  const meta = EXERCISES[e.ex];
  const phase = phaseById(a.phase);
  const totalDone = sum(e.done.map((d) => d.v));
  const reached = totalDone >= e.target && e.plan.length === 0;

  const view = h("main", { class: "view" });

  // header
  view.append(h("header", { class: "page-h" },
    h("button", { class: "round-btn", "aria-label": "Wróć do planu", onclick: renderHome }, icon("back")),
    h("div", { class: "t", style: { flex: 1, paddingLeft: "6px" } },
      h("span", { class: "eyebrow" }, phase.name + (a.deload ? " · deload" : "")),
      h("h1", null, a.sessionName)),
    h("button", { class: "round-btn", "aria-label": "Opcje treningu", onclick: () => sessionMenu(a) }, icon("more"))));

  // exercise progress
  const track = h("div", { class: "progress-track", "aria-hidden": "true" });
  a.exercises.forEach((x, i) => {
    const t = sum(x.done.map((d) => d.v));
    const full = x.done.length && x.plan.length === 0;
    const el = h("i", { class: full ? "done" : i === a.cur ? "cur" : "" });
    if (!full && x.target) el.style.setProperty("--p", Math.min(100, (t / x.target) * 100) + "%");
    track.append(el);
  });
  view.append(h("div", { class: "row", style: { padding: "0 10px" } }, track,
    h("span", { class: "hint-text num", style: { color: "var(--muted)", fontSize: "11px" } }, "Ćwiczenie " + (a.cur + 1) + " / " + a.exercises.length)));

  // exercise card
  const head = h("section", { class: "glass" },
    h("div", { class: "ex-head" },
      h("span", { class: "ph s50 " + meta.group, "aria-hidden": "true" }, initials(meta.name)),
      h("div", { class: "body" },
        h("div", { class: "nm" }, h("span", { class: "eyebrow", style: { marginRight: "6px" } }, e.code), meta.name),
        h("div", { class: "sub" }, [e.variation, item.side ? "na stronę (L&R)" : ""].filter(Boolean).join(" · ") || "—")),
      h("button", { class: "round-btn", "aria-label": "Podgląd ćwiczenia", onclick: () => exerciseSheet(item, e) }, icon("info"))));
  const inner = h("div", { style: { padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "10px" } });
  inner.append(h("div", { class: "chips" },
    h("span", { class: "chip" }, "Plan ", h("b", null, rangeText(item))),
    h("span", { class: "chip" }, "Tempo ", h("b", null, item.tempo)),
    h("span", { class: "chip" }, "Przerwa ", h("b", null, item.restText))));
  if (item.variations && !e.done.length) {
    const vs = h("div", { class: "seg" });
    item.variations.forEach((v) => vs.append(h("button", {
      "aria-pressed": String(v === e.variation),
      onclick: () => { a.exercises[a.cur] = buildExercise(item, a.deload, a.pct, v); store.saveActive(a); renderSession(); },
    }, v)));
    inner.append(vs);
  }
  inner.append(h("div", { class: "lastline" },
    h("span", null, "Ostatnio"),
    e.last ? h("b", { class: "num" }, joinSets(e.last.sets, e.unit) + " = " + fmtVal(sum(e.last.sets), e.unit) + " · " + fmtDate(e.last.date))
      : h("b", null, "brak — pierwszy raz")));
  inner.append(h("div", { class: "lastline" },
    h("span", null, "Cel dziś"),
    h("b", { class: "num" }, targetText(e, a))));
  head.append(inner);
  view.append(head);

  if (e.notes.includes("intensity")) view.append(h("div", { class: "adapt-note warn" },
    "Dobiłeś górę zakresu serii. Wg planu: utrudnij (niżej kółka, dłuższe tempo, obciążenie) i zacznij od dołu zakresu — albo zostań, jeśli forma jeszcze nie ta."));
  if (e.notes.includes("accumTop")) view.append(h("div", { class: "adapt-note warn" },
    "Przekraczasz górę akumulacji z planu (" + fmtVal(item.accum.max, "sec") + "). Zbieraj ten czas w mniejszej liczbie serii."));
  if (e.notes.includes("baseline")) view.append(h("div", { class: "adapt-note" },
    "Tydzień 1 ustala bazę: zbierz ile się da w " + item.accum.window + " min, każdą serię 2-3 powt. przed upadkiem. Od następnego razu apka będzie celować w więcej."));

  // active set
  if (!reached) view.append(activeSetCard(a, e, item));
  else view.append(h("section", { class: "card" },
    h("div", { class: "set-h" }, h("h2", null, "Cel dobity"), h("span", { class: "badge" }, "✓ " + fmtVal(totalDone, e.unit) + " / " + fmtVal(e.target, e.unit))),
    h("p", { class: "hint-text" }, "Wszystkie serie tego ćwiczenia są zapisane."),
    a.cur < a.exercises.length - 1
      ? h("button", { class: "btn primary", onclick: () => go(a, a.cur + 1) }, "Następne ćwiczenie", icon("arrow", "i sm"))
      : h("button", { class: "btn primary", onclick: finishSession }, "Zakończ trening", icon("check", "i sm")),
    h("button", { class: "btn ghost", onclick: () => { e.plan.push(e.done[e.done.length - 1].v); store.saveActive(a); renderSession(); } }, "Dodatkowa seria")));

  view.append(h("div", { id: "restSlot" }));
  if (e.note) view.append(h("div", { class: "adapt-note" + (e.noteWarn ? " warn" : "") }, e.note));

  // set context mini-cards
  if (e.done.length || e.plan.length > 1) {
    const lastDone = e.done[e.done.length - 1];
    const mini = h("div", { class: "mini-cards" });
    if (lastDone) mini.append(h("div", { class: "mini" },
      h("div", { class: "h ok" }, icon("checkCircle", "i sm"), "Seria " + e.done.length + " · zrobiona"),
      h("span", { class: "num" }, fmtVal(lastDone.v, e.unit) + " " + (e.unit === "sec" ? "" : unitWord(e.unit, lastDone.v)) + (lastDone.rpe ? " · RPE " + lastDone.rpe : ""))));
    if (e.plan.length > 1) mini.append(h("div", { class: "mini" },
      h("div", { class: "h" }, "Seria " + (e.done.length + 2) + " · następna"),
      h("span", { class: "num" }, "Cel " + fmtVal(e.plan[1], e.unit))));
    view.append(mini);
  }


  // sets table
  view.append(setsTable(a, e));

  // next exercise
  const nextE = a.exercises[a.cur + 1];
  view.append(h("div", { class: "next-ex" },
    h("button", { class: "sq-btn", "aria-label": "Poprzednie ćwiczenie", disabled: a.cur === 0, onclick: () => go(a, a.cur - 1) }, icon("back")),
    h("div", { class: "t", style: { textAlign: "center", flex: 1 } },
      h("small", null, nextE ? "Dalej" : "To ostatnie ćwiczenie"),
      h("b", null, nextE ? displayName(nextE.ex, nextE.variation) + " · " + nextE.plan.length + " " + pl(nextE.plan.length, "seria", "serie", "serii") : "Zakończ, gdy skończysz")),
    nextE ? h("button", { class: "sq-btn", "aria-label": "Następne ćwiczenie", onclick: () => go(a, a.cur + 1) }, icon("arrow"))
      : h("button", { class: "sq-btn", "aria-label": "Zakończ trening", onclick: finishSession, style: { background: "var(--accent)", color: "var(--on-accent)" } }, icon("check"))));

  // full list
  const list = h("div", { class: "ex-list" });
  a.exercises.forEach((x, i) => {
    const t = sum(x.done.map((d) => d.v));
    list.append(h("button", { class: "ex-row" + (i === a.cur ? " cur" : ""), onclick: () => go(a, i) },
      h("span", { class: "code" }, x.code),
      h("span", { class: "ph s40 " + EXERCISES[x.ex].group }, initials(EXERCISES[x.ex].name)),
      h("div", { class: "body" }, h("div", { class: "nm" }, displayName(x.ex, x.variation)),
        h("div", { class: "sub num" }, x.done.length ? fmtVal(t, x.unit) + " / " + fmtVal(x.target, x.unit) : "cel " + fmtVal(x.target, x.unit))),
      x.done.length && !x.plan.length ? h("span", { class: "badge" }, "✓") : null));
  });
  view.append(h("div", { class: "section-label" }, h("span", null, "Cały trening"), h("span", null, "")), list,
    h("button", { class: "btn ghost", onclick: finishSession }, "Zakończ trening"));

  root.replaceChildren(view);
  renderRest();
  startTick();
}

function targetText(e, a) {
  if (e.top) return e.top + "! = " + e.target + " powt." + (e.plan.length > 1 || e.done.length > 1 ? " łącznie" : "");
  const base = fmtVal(e.target, e.unit) + (e.unit === "sec" ? " łącznie" : " " + unitWord(e.unit, e.target) + " łącznie");
  if (e.basis === "progress") return base + " (+" + a.pct + "%)";
  if (e.basis === "deload") return base + " (deload)";
  return base + " (start)";
}

function activeSetCard(a, e, item) {
  const idx = e.done.length + 1;
  const total = e.done.length + e.plan.length;
  const planned = e.plan[0];
  const added = idx > e.planned;
  const card = h("section", { class: "card" });
  card.append(h("div", { class: "set-h" },
    h("h2", null, "Seria " + idx + " / " + total),
    added ? h("span", { class: "badge amber" }, "Dodana") : h("span", { class: "badge" }, "Aktywna")));

  let goal;
  if (e.top) goal = e.top + "! (" + e.top + "+" + (e.top - 1) + "+…+1)";
  else goal = fmtVal(planned, e.unit) + (e.unit === "sec" ? "" : " " + unitWord(e.unit, planned)) + (item.side ? " na stronę" : "");
  card.append(h("div", { class: "goal-row" }, h("span", null, "Cel serii"), h("b", { class: "num" }, goal)));

  const state = { v: planned, rpe: null };
  const valLabel = e.unit === "sec" ? "Czas (s)" : item.side ? "Powt. / stronę" : e.top ? "Powtórzeń w serii" : "Powtórzenia";
  const vWell = well(valLabel, state.v, e.step, (v) => { state.v = v; }, e.unit === "sec" ? "s" : "");
  const rWell = well("RPE (opcjonalnie)", "", 0.5, (v) => { state.rpe = v || null; }, "", { min: 0, max: 10, placeholder: "—" });
  card.append(h("div", { class: "wells" }, vWell, rWell));

  if (e.unit === "sec") card.append(stopwatch((sec) => { vWell.set(sec); state.v = sec; }));
  if (item.side) card.append(h("p", { class: "hint-text" }, "Najpierw słabsza strona, 30-60 s przerwy, potem mocniejsza — tyle samo powtórzeń. Wpisz liczbę ze słabszej strony."));

  card.append(h("button", {
    class: "btn primary",
    onclick: () => { unlockAudio(); logSet(a, e, item, state); },
  }, "Zakończ serię " + idx + (item.rest ? " i odpocznij" : ""), icon("check", "i sm")));

  const tools = h("div", { class: "row", style: { justifyContent: "center", gap: "18px" } },
    h("button", { class: "link", onclick: () => { e.plan.push(e.plan[e.plan.length - 1] || planned); store.saveActive(a); renderSession(); } }, icon("plus", "i sm"), "Seria"),
    e.plan.length > 1 ? h("button", { class: "link", style: { color: "var(--muted)" }, onclick: () => { e.plan.pop(); store.saveActive(a); renderSession(); } }, icon("minus", "i sm"), "Seria") : null,
    h("button", { class: "link", style: { color: "var(--muted)" }, onclick: () => { e.plan = []; store.saveActive(a); if (e.done.length) renderSession(); else go(a, Math.min(a.cur + 1, a.exercises.length - 1)); } }, "Pomiń resztę"));
  card.append(tools);
  return card;
}

function well(label, value, step, onChange, unit, opt = {}) {
  const min = opt.min != null ? opt.min : step;
  const input = h("input", { type: "number", inputmode: step % 1 ? "decimal" : "numeric", value: value === "" ? "" : String(value), placeholder: opt.placeholder || "", "aria-label": label, min: String(min), step: String(step) });
  const minus = h("button", { type: "button", "aria-label": "Mniej" }, icon("minus", "i sm"));
  const plus = h("button", { type: "button", "aria-label": "Więcej" }, icon("plus", "i sm"));
  function set(v) {
    if (v === "" || v == null) { input.value = ""; onChange(""); return; }
    v = Math.max(min, Math.round(v / step) * step);
    if (opt.max != null) v = Math.min(opt.max, v);
    input.value = String(v); onChange(v);
  }
  minus.onclick = () => { const c = Number(input.value); set(input.value === "" ? "" : c - step); };
  plus.onclick = () => { const c = Number(input.value); set(input.value === "" ? (opt.min != null && opt.max ? 7 : step) : c + step); };
  input.oninput = () => onChange(input.value === "" ? "" : Number(input.value));
  input.onfocus = () => input.select();
  const el = h("div", { class: "well" }, h("span", { class: "label" }, label),
    h("div", { class: "box" }, h("div", { class: "val" }, input, unit ? h("span", { class: "unit" }, unit) : null),
      h("div", { class: "adj" }, minus, plus)));
  el.set = set;
  return el;
}

function stopwatch(onStop) {
  let t0 = null, iv = null;
  const label = h("span", { class: "num" }, "00:00");
  const btn = h("button", { class: "btn sm" }, icon("timer", "i sm"), "Stoper");
  btn.onclick = () => {
    if (!t0) {
      unlockAudio();
      t0 = Date.now();
      btn.lastChild.textContent = "Stop";
      iv = setInterval(() => { label.textContent = fmtSec((Date.now() - t0) / 1000); }, 250);
    } else {
      clearInterval(iv);
      const s = Math.round((Date.now() - t0) / 1000);
      t0 = null; btn.lastChild.textContent = "Stoper";
      onStop(Math.max(5, Math.round(s / 5) * 5));
    }
  };
  return h("div", { class: "stopwatch" }, btn, label);
}

function logSet(a, e, item, state) {
  const v = Number(state.v);
  if (!(v > 0)) { toast("Wpisz wynik serii"); return; }
  const planned = e.plan[0];
  const pendingAfter = e.plan.length - 1;
  e.done.push({ v, planned, rpe: state.rpe || null, at: new Date().toISOString() });
  const before = e.plan.slice(1);
  e.plan = adapt(e.target, e.done.map((d) => d.v), pendingAfter, e.step);
  const remaining = e.target - sum(e.done.map((d) => d.v));

  e.note = ""; e.noteWarn = false;
  if (remaining > 0 && e.plan.length > before.length) {
    e.note = "Seria " + e.done.length + ": " + fmtVal(v, e.unit) + " zamiast " + fmtVal(planned, e.unit) +
      ". Do celu brakuje " + fmtVal(remaining, e.unit) + ", więc dzielę to na " + e.plan.length + " " + pl(e.plan.length, "serię", "serie", "serii") +
      " (" + joinSets(e.plan, e.unit) + ") — objętość zostaje ta sama.";
    e.noteWarn = true;
  } else if (remaining > 0 && v < planned) {
    e.note = "Brakuje " + fmtVal(planned - v, e.unit) + " — rozkładam je na pozostałe serie: " + joinSets(e.plan, e.unit) + ".";
  } else if (v > planned && e.plan.length) {
    e.note = "Ponad plan o " + fmtVal(v - planned, e.unit) + " — kolejne serie lżejsze: " + joinSets(e.plan, e.unit) + ".";
  } else if (remaining <= 0 && v > planned) {
    e.note = "Cel dobity z nawiązką.";
  }

  const lastOverall = a.cur === a.exercises.length - 1 && !e.plan.length;
  if (item.rest && !lastOverall) a.rest = { endsAt: Date.now() + item.rest * 1000, total: item.rest, paused: null, beeped: false };
  else a.rest = null;
  store.saveActive(a);
  renderSession();
  const slot = document.getElementById("restSlot");
  if (slot && a.rest) slot.scrollIntoView({ block: "center", behavior: "smooth" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

function setsTable(a, e) {
  const tb = h("tbody");
  e.done.forEach((d, i) => {
    tb.append(h("tr", { class: "done", onclick: () => editDone(a, e, i) },
      h("td", null, i + 1), h("td", { class: "num" }, d.planned != null ? fmtVal(d.planned, e.unit) : "—"),
      h("td", { class: "num" }, fmtVal(d.v, e.unit)), h("td", null, d.rpe || ""), h("td", null, icon("check", "i sm"))));
  });
  e.plan.forEach((v, i) => {
    const idx = e.done.length + i + 1;
    tb.append(h("tr", { class: (i === 0 ? "cur" : "") + (idx > e.planned ? " added" : "") },
      h("td", null, idx), h("td", { class: "num" }, fmtVal(v, e.unit)), h("td", null, "—"), h("td", null, ""), h("td", null, h("span", { class: "dot" }))));
  });
  return h("section", { class: "card", style: { gap: "6px" } },
    h("div", { class: "set-h" }, h("span", { class: "eyebrow" }, "Serie"),
      h("span", { class: "hint-text num" }, fmtVal(sum(e.done.map((d) => d.v)), e.unit) + " / " + fmtVal(e.target, e.unit))),
    h("table", { class: "sets-table" },
      h("thead", null, h("tr", null, h("th", null, "Seria"), h("th", null, "Cel"), h("th", null, e.unit === "sec" ? "Czas" : "Powt."), h("th", null, "RPE"), h("th", null, icon("check", "i sm")))),
      tb),
    e.done.length ? h("p", { class: "hint-text", style: { textAlign: "center" } }, "Tapnij zrobioną serię, żeby ją poprawić.") : null);
}

function editDone(a, e, i) {
  openSheet("Seria " + (i + 1), (sheet, close) => {
    let val = e.done[i].v;
    const w = well(e.unit === "sec" ? "Czas (s)" : "Powtórzenia", val, e.step, (v) => { val = v; }, e.unit === "sec" ? "s" : "");
    sheet.append(w,
      h("button", { class: "btn primary", onclick: () => {
        if (!(Number(val) > 0)) return;
        e.done[i].v = Number(val);
        e.plan = adapt(e.target, e.done.map((d) => d.v), e.plan.length, e.step);
        e.note = "";
        store.saveActive(a); close(); renderSession();
      } }, "Zapisz"),
      h("button", { class: "btn danger", onclick: () => {
        e.done.splice(i, 1);
        e.plan = adapt(e.target, e.done.map((d) => d.v), e.plan.length + 1, e.step);
        e.note = "";
        store.saveActive(a); close(); renderSession();
      } }, "Usuń serię"));
  });
}

function go(a, i) {
  a.cur = Math.max(0, Math.min(a.exercises.length - 1, i));
  store.saveActive(a);
  renderSession();
  window.scrollTo(0, 0);
}

function sessionMenu(a) {
  openSheet(a.sessionName, (sheet, close) => {
    const seg = h("div", { class: "seg" });
    [[false, "Normalny tydzień"], [true, "Deload"]].forEach(([v, l]) => seg.append(h("button", {
      "aria-pressed": String(a.deload === v),
      onclick: () => { a.deload = v; rebuildPlans(a); store.saveActive(a); close(); renderSession(); },
    }, l)));
    sheet.append(h("div", { class: "field" }, h("label", null, "Tryb"), seg),
      h("p", { class: "hint-text" }, "Deload: ok. połowa serii, te same powtórzenia, bez progresji. Wynik z deloadu nie jest bazą dla kolejnej progresji. Zmiana dotyczy ćwiczeń, w których nie zapisałeś jeszcze serii."),
      h("button", { class: "btn primary", onclick: () => { close(); finishSession(); } }, "Zakończ i zapisz trening"),
      h("button", { class: "btn danger", onclick: () => { close(); confirmDiscard(); } }, "Porzuć trening"));
  });
}

function confirmDiscard() {
  openSheet("Porzucić trening?", (sheet, close) => {
    sheet.append(h("p", { class: "hint-text" }, "Zapisane serie z tego treningu przepadną."),
      h("button", { class: "btn danger", onclick: () => { close(); store.saveActive(null); stopTick(); renderHome(); } }, "Porzuć"),
      h("button", { class: "btn", onclick: close }, "Wróć"));
  });
}

export function exerciseSheet(item, e) {
  const meta = EXERCISES[item.ex];
  openSheet(meta.name, (sheet) => {
    sheet.append(h("div", { class: "ph big " + meta.group }, initials(meta.name)),
      h("div", { class: "chips" },
        e.variation ? h("span", { class: "chip" }, "Wariant ", h("b", null, e.variation)) : null,
        h("span", { class: "chip" }, "Plan ", h("b", null, rangeText(item))),
        h("span", { class: "chip" }, "Tempo ", h("b", null, item.tempo)),
        h("span", { class: "chip" }, "Przerwa ", h("b", null, item.restText))),
      tempoHelp(item.tempo));
  });
}

function tempoHelp(t) {
  const m = /^(\d)(\d)(\d|X)(\d)$/.exec(t || "");
  if (!m) return null;
  return h("p", { class: "hint-text" }, "Tempo " + t + ": " + m[1] + " s opuszczanie, " + m[2] + " s pauzy na dole, " +
    (m[3] === "X" ? "w górę eksplozywnie" : m[3] + " s w górę") + ", " + m[4] + " s pauzy na górze.");
}

// ------------------------------------------------------------------ rest timer
function renderRest() {
  const slot = document.getElementById("restSlot");
  if (!slot) return;
  const a = store.getActive();
  if (!a || !a.rest) { slot.replaceChildren(); return; }
  const r = a.rest;
  const left = r.paused != null ? r.paused : (r.endsAt - Date.now()) / 1000;
  const over = left <= 0;
  if (over && !r.beeped) { r.beeped = true; store.saveActive(a); beep(); }
  const pct = Math.max(0, Math.min(100, (1 - left / r.total) * 100));
  const timeEl = slot.querySelector(".time");
  if (timeEl && slot.dataset.mode === (over ? "over" : "run") + (r.paused != null)) {
    timeEl.textContent = over ? "+" + fmtSec(-left) : fmtSec(left);
    slot.querySelector(".bar i").style.width = pct + "%";
    return;
  }
  slot.dataset.mode = (over ? "over" : "run") + (r.paused != null);
  const pauseBtn = h("button", { class: "b", "aria-label": r.paused != null ? "Wznów" : "Pauza", onclick: () => {
    if (r.paused != null) { r.endsAt = Date.now() + r.paused * 1000; r.paused = null; }
    else r.paused = Math.max(0, (r.endsAt - Date.now()) / 1000);
    store.saveActive(a); slot.dataset.mode = ""; renderRest();
  } }, icon(r.paused != null ? "play" : "pause", "i sm"));
  slot.replaceChildren(
    h("div", { class: "section-label", style: { marginBottom: "7px" } }, h("span", null, "Przerwa między seriami"), h("span", null, over ? "Czas na serię" : r.paused != null ? "Pauza" : "Odliczam")),
    h("div", { class: "rest" + (over ? " over" : "") },
      h("div", { class: "r1" },
        h("div", { class: "lbl" }, icon("timer"), h("span", null, "Przerwa"), h("span", { class: "time num" }, over ? "+" + fmtSec(-left) : fmtSec(left))),
        h("div", { class: "ctl" },
          h("button", { class: "b", onclick: () => { if (r.paused != null) r.paused += 15; else r.endsAt += 15000; r.total += 15; r.beeped = false; store.saveActive(a); slot.dataset.mode = ""; renderRest(); } }, "+15s"),
          pauseBtn,
          h("button", { class: "skip", onclick: () => { a.rest = null; store.saveActive(a); renderRest(); } }, over ? "OK" : "Pomiń"))),
      h("div", { class: "bar" }, h("i", { style: { width: pct + "%" } }))));
}

function startTick() { stopTick(); tick = setInterval(renderRest, 250); }
function stopTick() { if (tick) clearInterval(tick); tick = null; }
