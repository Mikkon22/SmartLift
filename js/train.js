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

export function leaveTrain() { stopTick(); setInSession(false); }

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
  setInSession(false);
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
  setInSession(false);
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
// Layout follows the Figma frame "Exercise-first carousel": one big card per exercise, swipe
// between them, an editable set table (Goal / Reps / RPE / ✓) and a bottom bar with the rest timer.
function setInSession(on) { document.body.classList.toggle("in-session", on); }

function renderSession() {
  const a = store.getActive();
  if (!a) { renderHome(); return; }
  setInSession(true);
  const phase = phaseById(a.phase);

  const view = h("main", { class: "view session" });
  view.append(h("header", { class: "page-h" },
    h("button", { class: "round-btn", "aria-label": "Wróć do planu", onclick: renderHome }, icon("back")),
    h("div", { class: "t", style: { flex: 1, paddingLeft: "6px" } },
      h("span", { class: "eyebrow" }, phase.name + (a.deload ? " · deload" : "") + " · widok ćwiczenia"),
      h("h1", null, a.sessionName)),
    h("button", { class: "round-btn", "aria-label": "Opcje treningu", onclick: () => sessionMenu(a) }, icon("more"))));

  const count = h("p", { class: "ex-count num" });
  const track = h("div", { class: "seg-track" });
  view.append(h("div", { class: "orient" }, count, track));

  const rail = h("div", { class: "rail" });
  a.exercises.forEach((e, i) => rail.append(exerciseCard(a, e, i)));
  view.append(rail);

  function paintOrientation() {
    count.textContent = (a.cur + 1) + " / " + a.exercises.length + " " + pl(a.exercises.length, "ćwiczenie", "ćwiczeń", "ćwiczeń");
    track.replaceChildren();
    a.exercises.forEach((x, i) => {
      const full = x.done.length && x.plan.length === 0;
      track.append(h("button", { class: full ? "done" : i === a.cur ? "cur" : "", "aria-label": "Ćwiczenie " + (i + 1), onclick: () => scrollToCard(i, true) }));
    });
  }
  function scrollToCard(i, smooth) {
    const card = rail.children[i];
    if (card) rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft, behavior: smooth ? "smooth" : "instant" });
  }

  let t = null;
  rail.addEventListener("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const i = Math.round(rail.scrollLeft / rail.clientWidth);
      if (i !== a.cur && i >= 0 && i < a.exercises.length) {
        a.cur = i; store.saveActive(a); paintOrientation();
      }
    }, 90);
  }, { passive: true });

  const bar = h("div", { class: "session-bar", id: "sessBar" });
  root.replaceChildren(view, bar);
  paintOrientation();
  requestAnimationFrame(() => scrollToCard(a.cur, false));
  renderRest();
  startTick();
}

function exerciseCard(a, e, i) {
  const item = itemOf(a, i);
  const meta = EXERCISES[e.ex];
  const total = e.done.length + e.plan.length;
  const totalDone = sum(e.done.map((d) => d.v));
  const card = h("section", { class: "ex-card", "aria-label": meta.name });

  card.append(h("div", { class: "ex-status" },
    h("span", { class: i === a.cur ? "now" : "" }, i === a.cur ? "Aktualne ćwiczenie" : e.code + " · " + (i < a.cur ? "wcześniej" : "dalej")),
    h("button", { class: "x-btn", "aria-label": "Szczegóły ćwiczenia", onclick: () => exerciseSheet(item, e) }, icon("info", "i sm"))));

  card.append(h("div", { class: "ph hero-ph " + meta.group, "aria-hidden": "true" }, initials(meta.name)));

  card.append(h("div", { class: "ex-title" },
    h("h2", null, meta.name),
    h("span", { class: "num" }, Math.min(e.done.length, total) + " / " + total + " " + pl(total, "seria", "serie", "serii"))));
  card.append(h("p", { class: "ex-sub" }, [e.variation, item.side ? "na stronę (L&R)" : "", "plan " + rangeText(item)].filter(Boolean).join(" · ")));

  if (item.variations && !e.done.length) {
    const vs = h("div", { class: "seg" });
    item.variations.forEach((v) => vs.append(h("button", {
      "aria-pressed": String(v === e.variation),
      onclick: () => { a.exercises[i] = buildExercise(item, a.deload, a.pct, v); store.saveActive(a); renderSession(); },
    }, v)));
    card.append(vs);
  }

  card.append(h("div", { class: "ex-note" }, icon("info", "i sm"),
    h("span", null, tempoText(item) + " · przerwa " + item.restText)));

  card.append(h("div", { class: "ex-goal" },
    h("span", null, "Ostatnio ", h("b", { class: "num" }, e.last ? joinSets(e.last.sets, e.unit) + " = " + fmtVal(sum(e.last.sets), e.unit) : "—")),
    h("span", null, "Cel ", h("b", { class: "num" }, targetText(e, a)))));

  card.append(setTable(a, e, i, item));

  if (e.unit === "sec" && e.plan.length) card.append(stopwatch((sec) => {
    const inp = card.querySelector("tr.cur input.v");
    if (inp) inp.value = String(sec);
  }));

  const notes = [];
  if (e.notes.includes("intensity")) notes.push(["warn", "Dobiłeś górę zakresu serii. Wg planu: utrudnij (niżej kółka, wolniejsze tempo, obciążenie) i zacznij od dołu zakresu."]);
  if (e.notes.includes("accumTop")) notes.push(["warn", "Przekraczasz górę akumulacji z planu — zbieraj ten czas w mniejszej liczbie serii."]);
  if (e.notes.includes("baseline")) notes.push(["", "Tydzień 1 ustala bazę: zbierz ile się da w " + item.accum.window + " min, każdą serię 2-3 powt. przed upadkiem."]);
  if (item.side && !e.done.length) notes.push(["", "Najpierw słabsza strona, 30-60 s przerwy, potem mocniejsza — tyle samo powtórzeń. Wpisz wynik słabszej strony."]);
  if (e.note) notes.push([e.noteWarn ? "warn" : "", e.note]);
  notes.forEach(([cls, txt]) => card.append(h("div", { class: "adapt-note " + cls }, txt)));

  if (totalDone >= e.target && !e.plan.length) {
    card.append(i < a.exercises.length - 1
      ? h("button", { class: "btn primary", onclick: () => { a.cur = i + 1; store.saveActive(a); renderSession(); } }, "Następne ćwiczenie", icon("arrow", "i sm"))
      : h("button", { class: "btn primary", onclick: finishSession }, "Zakończ trening", icon("check", "i sm")));
  }
  return card;
}

function tempoText(item) {
  const m = /^(\d)(\d)(\d|X)(\d)$/.exec(item.tempo || "");
  if (!m) return "Tempo " + item.tempo;
  return "Tempo " + item.tempo + ": " + m[1] + " s w dół, " + (m[2] === "0" ? "bez pauzy" : m[2] + " s pauzy") + ", " +
    (m[3] === "X" ? "w górę dynamicznie" : m[3] + " s w górę") + (m[4] === "0" ? "" : ", " + m[4] + " s na górze");
}

function targetText(e, a) {
  if (e.top) return e.top + "! = " + e.target + " powt.";
  const base = fmtVal(e.target, e.unit) + (e.unit === "sec" ? "" : " powt.");
  if (e.basis === "progress") return base + " (+" + a.pct + "%)";
  if (e.basis === "deload") return base + " (deload)";
  return base + " (start)";
}

// Editable set table. Done rows: fix a number and the rest re-plans. Current row: type the
// result (prefilled with the goal) and tap ✓. Pending rows: goals can be retyped too.
function setTable(a, e, i, item) {
  const isCur = i === a.cur;
  const tb = h("tbody");
  const repHead = e.unit === "sec" ? "Czas" : "Powt.";

  e.done.forEach((d, k) => {
    const v = numInput("v", d.v, e.step, "Seria " + (k + 1) + " wynik");
    v.onchange = () => {
      const n = Number(v.value);
      if (!(n > 0)) { v.value = d.v; return; }
      d.v = n;
      e.plan = adapt(e.target, e.done.map((x) => x.v), Math.max(0, e.planned - e.done.length), e.step);
      e.note = ""; store.saveActive(a); renderSession();
    };
    const r = numInput("r", d.rpe ?? "", 0.5, "Seria " + (k + 1) + " RPE", "—");
    r.onchange = () => { d.rpe = r.value === "" ? null : Number(r.value); store.saveActive(a); };
    const undo = k === e.done.length - 1;
    tb.append(h("tr", { class: "done" },
      h("td", null, k + 1), h("td", { class: "num" }, d.planned != null ? fmtVal(d.planned, e.unit) : "—"),
      h("td", null, v), h("td", null, r),
      h("td", null, h("button", { class: "tick on", "aria-label": undo ? "Cofnij serię " + (k + 1) : "Seria zrobiona", disabled: !undo, onclick: () => {
        e.done.pop();
        e.plan = adapt(e.target, e.done.map((x) => x.v), Math.max(1, e.planned - e.done.length), e.step);
        e.note = ""; a.rest = null; store.saveActive(a); renderSession();
      } }, icon("check", "i sm")))));
  });

  e.plan.forEach((goal, k) => {
    const idx = e.done.length + k + 1;
    const cur = k === 0;
    const g = numInput("g", goal, e.step, "Seria " + idx + " cel");
    g.onchange = () => { const n = Number(g.value); if (n > 0) { e.plan[k] = n; store.saveActive(a); renderSession(); } else g.value = goal; };
    const v = numInput("v", cur ? goal : "", e.step, "Seria " + idx + " wynik", fmtVal(goal, e.unit));
    const r = numInput("r", "", 0.5, "Seria " + idx + " RPE", "—");
    const tick = h("button", { class: "tick" + (cur ? " cur" : ""), "aria-label": "Zakończ serię " + idx, onclick: () => {
      unlockAudio();
      // Ticking a later row first logs the rows before it at their goal values.
      for (let j = 0; j < k; j++) e.plan.length && pushDone(a, e, e.plan[0], null);
      const val = v.value === "" ? goal : Number(v.value);
      logSet(a, e, item, { v: val, rpe: r.value === "" ? null : Number(r.value) }, i);
    } }, icon("check", "i sm"));
    tb.append(h("tr", { class: (cur ? "cur" : "") + (idx > e.planned ? " added" : "") },
      h("td", null, idx), h("td", null, g), h("td", null, v), h("td", null, r), h("td", null, tick)));
  });

  const add = h("button", { class: "add-set", "aria-label": "Dodaj serię", onclick: () => {
    e.plan.push(e.plan[e.plan.length - 1] || (e.done.length ? e.done[e.done.length - 1].v : e.step));
    store.saveActive(a); renderSession();
  } }, icon("plus"));
  const remove = e.plan.length > 1 ? h("button", { class: "link", style: { color: "var(--muted)" }, onclick: () => { e.plan.pop(); store.saveActive(a); renderSession(); } }, "Usuń ostatnią serię") : null;

  return h("div", { class: "set-wrap" },
    h("table", { class: "set-grid" },
      h("thead", null, h("tr", null, h("th", null, "Seria"), h("th", null, "Cel"), h("th", null, repHead), h("th", null, "RPE"), h("th", null, icon("check", "i sm")))),
      tb),
    h("div", { class: "row" }, add, h("span", { class: "hint-text num" }, fmtVal(sum(e.done.map((d) => d.v)), e.unit) + " / " + fmtVal(e.target, e.unit)), h("span", { class: "spacer" }), remove));
}

function numInput(cls, value, step, label, placeholder) {
  const el = h("input", { class: cls, type: "number", inputmode: step % 1 ? "decimal" : "numeric", step: String(step), min: "0",
    value: value === "" || value == null ? "" : String(value), placeholder: placeholder || "", "aria-label": label });
  el.addEventListener("focus", () => el.select());
  return el;
}

function pushDone(a, e, v, rpe) {
  const planned = e.plan[0];
  e.done.push({ v, planned, rpe, at: new Date().toISOString() });
  e.plan = e.plan.slice(1);
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

function logSet(a, e, item, state, i) {
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
    e.note = "Brakuje " + fmtVal(planned - v, e.unit) + " — rozkładam na pozostałe serie: " + joinSets(e.plan, e.unit) + ".";
  } else if (v > planned && e.plan.length) {
    e.note = "Ponad plan o " + fmtVal(v - planned, e.unit) + " — kolejne serie lżejsze: " + joinSets(e.plan, e.unit) + ".";
  } else if (remaining <= 0 && v > planned) {
    e.note = "Cel dobity z nawiązką.";
  }

  a.cur = i;
  const lastOverall = i === a.exercises.length - 1 && !e.plan.length;
  if (item.rest && !lastOverall) a.rest = { endsAt: Date.now() + item.rest * 1000, total: item.rest, paused: null, beeped: false };
  else a.rest = null;
  store.saveActive(a);
  renderSession();
}

function go(a, i) {
  a.cur = Math.max(0, Math.min(a.exercises.length - 1, i));
  store.saveActive(a);
  renderSession();
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

// ------------------------------------------------------------------ bottom bar: rest timer
function renderRest() {
  const bar = document.getElementById("sessBar");
  if (!bar) return;
  const a = store.getActive();
  if (!a) return;
  const r = a.rest;
  if (!r) {
    const mins = Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 60000);
    if (bar.dataset.mode === "idle" + mins) return;
    bar.dataset.mode = "idle" + mins;
    bar.replaceChildren(h("div", { class: "bar-in" },
      h("div", { class: "lbl" }, icon("timer"), h("span", { class: "time num" }, mins + " min"), h("span", { class: "hint-text" }, "treningu")),
      h("div", { class: "ctl" }, h("button", { class: "skip", onclick: finishSession }, "Zakończ trening"))));
    return;
  }
  const left = r.paused != null ? r.paused : (r.endsAt - Date.now()) / 1000;
  const over = left <= 0;
  if (over && !r.beeped) { r.beeped = true; store.saveActive(a); beep(); }
  const pct = Math.max(0, Math.min(100, (1 - left / r.total) * 100));
  const mode = (over ? "over" : "run") + (r.paused != null);
  const timeEl = bar.querySelector(".time");
  if (timeEl && bar.dataset.mode === mode) {
    timeEl.textContent = over ? "+" + fmtSec(-left) : fmtSec(left);
    bar.querySelector(".prog i").style.width = pct + "%";
    return;
  }
  bar.dataset.mode = mode;
  const repaint = () => { store.saveActive(a); bar.dataset.mode = ""; renderRest(); };
  bar.replaceChildren(
    h("div", { class: "prog" }, h("i", { style: { width: pct + "%" } })),
    h("div", { class: "bar-in" + (over ? " over" : "") },
      h("div", { class: "lbl" }, icon("timer"), h("span", { class: "time num" }, over ? "+" + fmtSec(-left) : fmtSec(left)),
        h("span", { class: "hint-text" }, over ? "czas na serię" : r.paused != null ? "pauza" : "przerwa")),
      h("div", { class: "ctl" },
        h("button", { class: "b", onclick: () => { if (r.paused != null) r.paused += 15; else r.endsAt += 15000; r.total += 15; r.beeped = false; repaint(); } }, "+15s"),
        h("button", { class: "b", "aria-label": r.paused != null ? "Wznów" : "Pauza", onclick: () => {
          if (r.paused != null) { r.endsAt = Date.now() + r.paused * 1000; r.paused = null; }
          else r.paused = Math.max(0, (r.endsAt - Date.now()) / 1000);
          repaint();
        } }, icon(r.paused != null ? "play" : "pause", "i sm")),
        h("button", { class: "skip", onclick: () => { a.rest = null; repaint(); } }, over ? "OK" : "Pomiń"))));
}

function startTick() { stopTick(); tick = setInterval(renderRest, 250); }
function stopTick() { if (tick) clearInterval(tick); tick = null; }
