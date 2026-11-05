// Exercise library: every exercise+variation from the plan, its last result and history.
import { EXERCISES, PHASES, allEntries, initials, displayName } from "./plan.js";
import { suggest, sum, unitFor } from "./engine.js";
import * as store from "./store.js";
import { h, icon, openSheet, toast, fmtVal, fmtDate } from "./ui.js";

let root, query = "";

export function mountLibrary(container) { root = container; render(); }

function render() {
  const entries = allEntries();
  const view = h("main", { class: "view" });
  view.append(h("header", { class: "page-h" },
    h("div", { class: "t" }, h("span", { class: "eyebrow" }, entries.length + " pozycji z planu"), h("h1", null, "Ćwiczenia"))));

  const input = h("input", { type: "text", placeholder: "Szukaj ćwiczenia", value: query, "aria-label": "Szukaj ćwiczenia" });
  const list = h("div", { class: "ex-list" });
  input.oninput = () => { query = input.value; fill(); };
  view.append(h("div", { class: "search" }, icon("search", "i sm"), input), list);

  function fill() {
    const q = query.trim().toLowerCase();
    list.replaceChildren();
    for (const en of entries) {
      const name = displayName(en.ex, en.variation);
      if (q && !name.toLowerCase().includes(q)) continue;
      const hist = store.historyFor(en.key);
      const unit = unitFor(en.uses[0].item);
      const last = hist[0];
      list.append(h("button", { class: "ex-row", onclick: () => detail(en) },
        h("span", { class: "ph s40 " + EXERCISES[en.ex].group }, initials(EXERCISES[en.ex].name)),
        h("div", { class: "body" },
          h("div", { class: "nm" }, EXERCISES[en.ex].name, en.variation ? h("span", { style: { color: "var(--muted)", fontWeight: 400 } }, " · " + en.variation) : null),
          h("div", { class: "sub num" }, last
            ? last.sets.map((v) => fmtVal(v, unit)).join(" · ") + " = " + fmtVal(sum(last.sets), unit) + " · " + fmtDate(last.date)
            : "Faza " + [...new Set(en.uses.map((u) => u.phase))].join(", ") + " · brak wyniku")),
        icon("next", "i sm")));
    }
    if (!list.children.length) list.append(h("div", { class: "empty" }, h("strong", null, "Nic nie pasuje"), "Spróbuj innej nazwy."));
  }
  fill();
  root.replaceChildren(view);
}

function detail(en) {
  const meta = EXERCISES[en.ex];
  const item = en.uses[0].item;
  const unit = unitFor(item);
  const hist = store.historyFor(en.key);
  const st = store.getSettings();
  const { last } = store.lastResult(en.ex, en.variation);
  const sug = suggest(item, last, { pct: st.pct });

  openSheet(displayName(en.ex, en.variation), (sheet, close) => {
    sheet.append(h("div", { class: "ph big " + meta.group }, initials(meta.name)));

    const uses = h("div", { class: "chips" });
    en.uses.forEach((u) => uses.append(h("span", { class: "chip" }, "Faza " + u.phase + " · " + u.session + " · " + u.code)));
    sheet.append(uses);

    sheet.append(h("section", { class: "card" },
      h("div", { class: "lastline" }, h("span", null, "Ostatni wynik"),
        h("b", { class: "num" }, last ? last.sets.map((v) => fmtVal(v, unit)).join(" · ") + " = " + fmtVal(sum(last.sets), unit) : "—")),
      h("div", { class: "lastline" }, h("span", null, "Następnym razem (+" + st.pct + "%)"),
        h("b", { class: "num" }, sug.top ? sug.top + "! = " + sug.target : sug.sets.map((v) => fmtVal(v, unit)).join(" · ") + " = " + fmtVal(sug.target, unit)))));

    if (hist.length > 1) {
      const vals = hist.slice(0, 12).reverse().map((x) => sum(x.sets));
      const max = Math.max(...vals);
      const sp = h("div", { class: "spark", "aria-label": "Objętość z ostatnich treningów" });
      vals.forEach((v) => sp.append(h("i", { style: { height: Math.max(4, (v / max) * 100) + "%" } })));
      sheet.append(h("div", { class: "field" }, h("label", null, "Objętość — ostatnie treningi"), sp));
    }

    const ul = h("ul", { class: "hist" });
    hist.slice(0, 20).forEach((x) => ul.append(h("li", null,
      h("span", null, x.sets.map((v) => fmtVal(v, unit)).join(" · "), h("small", null, fmtDate(x.date) + (x.session ? " · " + x.session : "") + (x.deload ? " · deload" : ""))),
      h("b", { class: "num" }, fmtVal(sum(x.sets), unit)))));
    if (hist.length) sheet.append(h("div", { class: "field" }, h("label", null, "Historia"), ul));

    // Seed or correct the last result by hand (e.g. numbers from before the app).
    const inp = h("input", { type: "text", inputmode: "numeric", placeholder: unit === "sec" ? "np. 30 30 25 (sekundy)" : "np. 7 7 6" });
    sheet.append(h("div", { class: "field" },
      h("label", null, "Wpisz wynik ręcznie (serie oddzielone spacją)"), inp,
      h("button", { class: "btn", onclick: () => {
        const sets = inp.value.split(/[\s,;·]+/).map(Number).filter((n) => n > 0);
        if (!sets.length) { toast("Wpisz liczby, np. 7 7 6"); return; }
        store.saveWorkout({
          id: "m" + Date.now().toString(36), date: new Date().toISOString(), manual: true,
          phase: en.uses[0].phase, sessionId: "manual", sessionName: "Wpis ręczny", deload: false,
          entries: [{ key: en.key, ex: en.ex, variation: en.variation, unit, sets, rpe: [], target: sum(sets),
            top: item.kind === "down" ? topFromTotal(sum(sets)) : null }],
        });
        toast("Zapisane — to teraz ostatni wynik");
        close(); render();
      } }, "Zapisz jako ostatni wynik")));
  });
}

function topFromTotal(t) { let n = 1; while ((n * (n + 1)) / 2 < t) n++; return n; }
