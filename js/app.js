import * as store from "./store.js";
import { PHASES } from "./plan.js";
import { h, icon } from "./ui.js";
import { mountTrain, leaveTrain } from "./train.js";
import { mountLibrary } from "./library.js";
import { mountFood } from "./food.js";
import { mountProfile, pctControl, pctExample } from "./profile.js";

const app = document.getElementById("app");
const content = h("div", { id: "content" });
const TABS = [
  ["train", "Trening", "dumbbell"],
  ["library", "Ćwiczenia", "list"],
  ["food", "Jedzenie", "food"],
  ["profile", "Profil", "user"],
];
let current = null;
const tabbar = h("div", { class: "tabbar" }, h("nav", { "aria-label": "Główne" },
  TABS.map(([id, label, ic]) => h("button", { "data-tab": id, onclick: () => navigate(id) }, icon(ic), label))));

function navigate(id) {
  if (current === "train" && id !== "train") leaveTrain();
  current = id;
  tabbar.querySelectorAll("button").forEach((b) => { if (b.dataset.tab === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  window.scrollTo(0, 0);
  if (id === "train") mountTrain(content, navigate);
  else if (id === "library") mountLibrary(content);
  else if (id === "food") mountFood(content, navigate);
  else mountProfile(content);
  try { sessionStorage.setItem("sl.tab", id); } catch {}
}

function onboarding() {
  let pct = 3, phase = 1, step = 0;
  const wrap = h("main", { class: "onb" });
  function paint() {
    wrap.replaceChildren();
    if (step === 0) {
      const ex = h("div");
      wrap.append(
        h("span", { class: "eyebrow" }, "Smart Lift · 1 / 2"),
        h("h1", null, "Ile chcesz progresować co trening?"),
        h("p", { class: "lead" }, "Apka pamięta ostatni wynik każdego ćwiczenia i na tej podstawie ustawia następny cel: łączna liczba powtórzeń (albo sekund) + tyle procent."),
        pctControl(pct, (v) => { pct = v; ex.replaceChildren(pctExample(v)); }),
        ex,
        h("div", { class: "spacer" }),
        h("p", { class: "hint-text" }, "3% to dobry start. Zmienisz to w każdej chwili w Profilu."),
        h("button", { class: "btn primary", onclick: () => { step = 1; paint(); } }, "Dalej", icon("arrow", "i sm")));
      ex.append(pctExample(pct));
    } else {
      const list = h("div", { class: "ex-list" });
      PHASES.forEach((p) => list.append(h("button", {
        class: "ex-row" + (p.id === phase ? " cur" : ""), onclick: () => { phase = p.id; paint(); },
      }, h("span", { class: "ph s40" }, String(p.id)),
        h("div", { class: "body" }, h("div", { class: "nm" }, p.name + " · " + p.subtitle),
          h("div", { class: "sub" }, "Przerwy " + p.rest + " · " + p.sessions.map((s) => s.items.length).reduce((a, b) => a + b, 0) + " ćwiczeń w 4 treningach")),
        p.id === phase ? h("span", { class: "badge" }, "✓") : null)));
      wrap.append(
        h("span", { class: "eyebrow" }, "Smart Lift · 2 / 2"),
        h("h1", null, "Od której fazy zaczynasz?"),
        h("p", { class: "lead" }, "Body by Rings: Push 1 → Pull 1 → Push 2 → Pull 2 w tygodniu, 5 tygodni + tydzień deload na fazę."),
        list,
        h("div", { class: "spacer" }),
        h("button", { class: "btn primary", onclick: () => { store.saveSettings({ onboarded: true, pct, phase }); start(); } }, "Zaczynamy"),
        h("button", { class: "btn ghost", onclick: () => { step = 0; paint(); } }, "Wstecz"));
    }
  }
  paint();
  app.replaceChildren(wrap);
}

function start() {
  app.replaceChildren(content, tabbar);
  let tab = "train";
  try { tab = sessionStorage.getItem("sl.tab") || "train"; } catch {}
  navigate(tab);
}

if (store.getSettings().onboarded) start(); else onboarding();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
