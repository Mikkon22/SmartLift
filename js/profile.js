// Profile tab: progression %, AI key for the food photos, backup, workout history.
import * as store from "./store.js";
import { PHASES, displayName } from "./plan.js";
import { h, icon, openSheet, toast, fmtDate, pl } from "./ui.js";
import { sum } from "./engine.js";

let root;
export function mountProfile(container) { root = container; render(); }

export function pctControl(value, onChange) {
  let v = value;
  const out = h("div", { class: "v num" }, String(v), h("small", null, "%"));
  const minus = h("button", { "aria-label": "Mniej o 1%" }, "−");
  const plus = h("button", { class: "plus", "aria-label": "Więcej o 1%" }, "+");
  function paint() {
    out.firstChild.textContent = String(v);
    minus.disabled = v <= 1; plus.disabled = v >= 20;
    onChange(v);
  }
  minus.onclick = () => { v = Math.max(1, v - 1); paint(); };
  plus.onclick = () => { v = Math.min(20, v + 1); paint(); };
  minus.disabled = v <= 1;
  return h("div", { class: "pct" }, minus, out, plus);
}

export function pctExample(v) {
  const base = 21, next = Math.max(Math.ceil(base * (1 + v / 100) - 1e-9), base + 1);
  return h("div", { class: "example" },
    "Przykład: ostatnio ", h("b", null, "7 · 7 · 7 = 21"), " powtórzeń. Przy +" + v + "% następny cel to ",
    h("b", null, next), ". Gdy seria wyjdzie gorzej, apka dorzuci serię, żeby i tak dobić do celu.");
}

function render() {
  const st = store.getSettings();
  const view = h("main", { class: "view" });
  view.append(h("header", { class: "page-h" },
    h("div", { class: "t" }, h("span", { class: "eyebrow" }, "Ustawienia"), h("h1", null, "Profil"))));

  // progression
  const ex = h("div");
  const paintEx = (v) => ex.replaceChildren(pctExample(v));
  view.append(h("section", { class: "card" },
    h("div", { class: "set-h" }, h("h2", null, "Progres na trening")),
    pctControl(st.pct, (v) => { store.saveSettings({ pct: v }); paintEx(v); }),
    ex));
  paintEx(st.pct);

  // phase
  const seg = h("div", { class: "seg" });
  PHASES.forEach((p) => seg.append(h("button", { "aria-pressed": String(p.id === st.phase),
    onclick: () => { store.saveSettings({ phase: p.id }); render(); } }, p.name)));
  view.append(h("section", { class: "card" }, h("div", { class: "set-h" }, h("h2", null, "Aktualna faza")), seg,
    h("p", { class: "hint-text" }, "Każda faza: min. 5 tygodni + tydzień deload. Powtórzenie fazy jest OK, jeśli dalej robisz postęp.")));

  // AI
  const ai = st.ai;
  const provSeg = h("div", { class: "seg" });
  const keyIn = h("input", { type: "password", value: ai.key, placeholder: "Wklej klucz API", autocomplete: "off", "aria-label": "Klucz API" });
  const modelIn = h("input", { type: "text", value: ai.model, placeholder: ai.provider === "anthropic" ? "claude-haiku-5-5" : "gemini-2.5-flash", "aria-label": "Model" });
  [["gemini", "Gemini (darmowy)"], ["anthropic", "Claude"]].forEach(([id, l]) => provSeg.append(h("button", {
    "aria-pressed": String(ai.provider === id),
    onclick: () => { store.saveSettings({ ai: { ...store.getSettings().ai, provider: id, model: "" } }); render(); },
  }, l)));
  view.append(h("section", { class: "card" },
    h("div", { class: "set-h" }, h("h2", null, "Analiza zdjęć jedzenia"), ai.key ? h("span", { class: "badge" }, "Klucz zapisany") : h("span", { class: "badge grey" }, "Brak klucza")),
    provSeg,
    h("div", { class: "field" }, h("label", null, "Klucz API"), keyIn),
    h("div", { class: "field" }, h("label", null, "Model (puste = domyślny)"), modelIn),
    h("button", { class: "btn primary", onclick: () => {
      store.saveSettings({ ai: { ...store.getSettings().ai, key: keyIn.value.trim(), model: modelIn.value.trim() } });
      toast("Zapisane"); render();
    } }, "Zapisz"),
    h("p", { class: "hint-text", html: ai.provider === "anthropic"
      ? 'Klucz z <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> (płatny, grosze za zdjęcie).'
      : 'Darmowy klucz: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → „Create API key”. Na darmowym planie Google może używać zdjęć do ulepszania modeli.' }),
    h("p", { class: "hint-text" }, "Klucz zostaje tylko w tym telefonie i nie trafia do kopii zapasowej.")));

  // backup
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    try { store.importAll(JSON.parse(await f.text())); toast("Wczytano kopię"); render(); }
    catch (e) { toast(e.message || "Nie udało się wczytać pliku"); }
  };
  view.append(h("section", { class: "card" },
    h("div", { class: "set-h" }, h("h2", null, "Kopia zapasowa")),
    h("p", { class: "hint-text" }, "Wszystko (treningi i jedzenie) jest zapisane tylko w tym telefonie. Raz na jakiś czas zrób kopię do Plików."),
    h("div", { class: "actions" },
      h("button", { class: "btn", onclick: exportBackup }, "Eksportuj"),
      h("button", { class: "btn", onclick: () => file.click() }, "Importuj")), file));

  // history
  const ws = store.getWorkouts().slice().reverse();
  const ul = h("ul", { class: "hist" });
  ws.slice(0, 40).forEach((w) => ul.append(h("li", { onclick: () => workoutSheet(w), style: { cursor: "pointer" } },
    h("span", null, w.sessionName + (w.deload ? " · deload" : ""), h("small", null, fmtDate(w.date) + " · Faza " + w.phase)),
    h("span", { class: "hint-text" }, w.entries.length + " " + pl(w.entries.length, "ćwiczenie", "ćwiczenia", "ćwiczeń")))));
  view.append(h("section", { class: "card" }, h("div", { class: "set-h" }, h("h2", null, "Historia treningów"), h("span", { class: "hint-text" }, ws.length)),
    ws.length ? ul : h("p", { class: "hint-text" }, "Jeszcze pusto.")));

  view.append(h("p", { class: "foot" }, "Smart Lift · plan Body by Rings (bodybyrings.com), do użytku prywatnego."));
  root.replaceChildren(view);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: "application/json" });
  const name = "smart-lift-" + new Date().toISOString().slice(0, 10) + ".json";
  const f = new File([blob], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    navigator.share({ files: [f], title: name }).catch(() => {});
    return;
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove();
}

function workoutSheet(w) {
  openSheet(w.sessionName + " · " + fmtDate(w.date), (sheet, close) => {
    const ul = h("ul", { class: "hist" });
    w.entries.forEach((e) => ul.append(h("li", null,
      h("span", null, displayName(e.ex, e.variation), h("small", null, e.sets.join(" · "))),
      h("b", { class: "num" }, sum(e.sets)))));
    sheet.append(ul, h("button", { class: "btn danger", onclick: () => { store.deleteWorkout(w.id); close(); render(); toast("Usunięto"); } }, "Usuń ten trening"));
  });
}
