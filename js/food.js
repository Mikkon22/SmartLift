// Food tab — ported from the "Talerz" artifact (photo → meal estimate, day log, favourites,
// 7-day chart). Logic is unchanged; storage is local (talerz.* keys) and the photo analysis
// goes through ai.js with the user's own API key instead of the claude.ai artifact bridge.
import { sample, aiReady } from "./ai.js";
import { h, icon, openSheet } from "./ui.js";

let nav;

export function mountFood(container, navigate) {
  nav = navigate;
  container.innerHTML = TEMPLATE;
  init(container);
}

const TEMPLATE = `
<main class="view">
  <header class="page-h">
    <div class="t"><span class="eyebrow">Dziennik</span><h1>Jedzenie</h1></div>
    <button class="round-btn" id="settingsBtn" aria-label="Cele i ustawienia"></button>
  </header>
  <nav class="datebar">
    <button id="prevDay" aria-label="Poprzedni dzień"></button>
    <div class="label" id="dateLabel">Dziś<small>&nbsp;</small></div>
    <button id="nextDay" aria-label="Następny dzień"></button>
  </nav>
  <section class="hero">
    <div class="ring">
      <svg viewBox="0 0 132 132" width="132" height="132" aria-hidden="true">
        <circle class="track" cx="66" cy="66" r="58" stroke-width="11" fill="none"></circle>
        <circle class="fill" id="ringFill" cx="66" cy="66" r="58" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="364.4" stroke-dashoffset="364.4"></circle>
      </svg>
      <div class="readout"><div class="big num" id="kcalLeft">—</div><div class="cap" id="kcalCap">kcal zostało</div></div>
    </div>
    <div class="macros">
      <div class="macro"><div class="row"><b>Białko</b><span class="num" id="pVal">0 g</span></div><div class="bar"><i id="pBar" style="width:0;background:var(--accent)"></i></div></div>
      <div class="macro"><div class="row"><b>Węglowodany</b><span class="num" id="cVal">0 g</span></div><div class="bar"><i id="cBar" style="width:0;background:var(--amber)"></i></div></div>
      <div class="macro"><div class="row"><b>Tłuszcz</b><span class="num" id="fVal">0 g</span></div><div class="bar"><i id="fBar" style="width:0;background:var(--blue)"></i></div></div>
    </div>
    <p class="hint">Zjedzone <span class="num" id="eaten">0</span> z <span class="num" id="goalTxt">2000</span> kcal.</p>
  </section>
  <div class="actions">
    <button class="btn primary" id="photoBtn"></button>
    <button class="btn" id="favBtn"></button>
  </div>
  <input type="file" id="fileInput" accept="image/*" hidden>
  <div id="keyBanner"></div>
  <section>
    <div class="section-label" style="margin-bottom:8px"><span>Posiłki</span><span id="mealCount"></span></div>
    <div class="slots" id="slots"></div>
  </section>
  <section class="week"><h2>Ostatnie 7 dni</h2><div class="chart" id="chart"></div></section>
  <p class="foot">Szacunki są orientacyjne — wielkość porcji ze zdjęcia to zawsze przybliżenie.</p>
</main>`;

function init(scope) {
  const $ = (id) => scope.querySelector("#" + id);
  $("settingsBtn").append(icon("gear"));
  $("prevDay").append(icon("back", "i sm"));
  $("nextDay").append(icon("next", "i sm"));
  $("photoBtn").append(icon("camera", "i sm"), "Zdjęcie");
  $("favBtn").append(icon("heart", "i sm"), "Ulubione");

  const DAY_MS = 86400000;
  const PL_DAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];
  const PL_MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const keyOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : (d || 0); };
  const rnd = (n) => Math.round(num(n));
  const uid = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s == null ? "" : s);

  const SLOTS = [
    { id: "breakfast", label: "Śniadanie", until: 10 },
    { id: "brunch", label: "Drugie śniadanie", until: 12 },
    { id: "lunch", label: "Obiad", until: 16 },
    { id: "snack", label: "Podwieczorek", until: 18.5 },
    { id: "dinner", label: "Kolacja", until: 99 },
  ];
  const slotForHour = (hr) => { for (const s of SLOTS) if (hr < s.until) return s.id; return "dinner"; };
  const slotForNow = () => { const d = new Date(); return slotForHour(d.getHours() + d.getMinutes() / 60); };
  const slotLabel = (id) => (SLOTS.find((s) => s.id === id) || SLOTS[0]).label;
  function normalizeSlot(m) {
    if (SLOTS.some((s) => s.id === m.slot)) return m.slot;
    if (m.time && /^\d{1,2}:\d{2}$/.test(m.time)) { const p = m.time.split(":"); return slotForHour(num(p[0]) + num(p[1]) / 60); }
    return "lunch";
  }

  // ---------- storage (same keys as Talerz's local mode) ----------
  const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const store = {
    loadProfile: () => read("talerz.profile", null),
    saveProfile: (p) => write("talerz.profile", p),
    loadDay: (k) => read("talerz.day." + k, null),
    saveDay: (k, meals) => write("talerz.day." + k, { date: k, meals }),
    loadFavs: () => read("talerz.favs", []),
    saveFavs: (list) => write("talerz.favs", list),
    loadRange(keys) {
      const out = {};
      keys.forEach((k) => { const d = read("talerz.day." + k, null); if (d && d.meals) out[k] = d.meals.reduce((s, m) => s + num(m.kcal), 0); });
      return out;
    },
  };

  const state = { cur: new Date(), goal: 2000, pGoal: 130, meals: [], favs: [], history: {} };
  const p = store.loadProfile();
  if (p) { if (num(p.goal)) state.goal = num(p.goal); if (num(p.pGoal)) state.pGoal = num(p.pGoal); }
  state.favs = store.loadFavs() || [];

  const el = {};
  ["kcalLeft", "kcalCap", "ringFill", "pVal", "cVal", "fVal", "pBar", "cBar", "fBar", "eaten", "goalTxt", "slots", "mealCount",
    "chart", "dateLabel", "prevDay", "nextDay", "photoBtn", "favBtn", "fileInput", "settingsBtn", "keyBanner"].forEach((id) => { el[id] = $(id); });

  function totals() {
    return state.meals.reduce((a, m) => { a.kcal += num(m.kcal); a.p += num(m.protein); a.c += num(m.carbs); a.f += num(m.fat); return a; }, { kcal: 0, p: 0, c: 0, f: 0 });
  }

  function renderDate() {
    const d = state.cur, today = keyOf(new Date()), k = keyOf(d), yest = keyOf(new Date(Date.now() - DAY_MS));
    const name = k === today ? "Dziś" : k === yest ? "Wczoraj" : PL_DAYS[d.getDay()];
    el.dateLabel.innerHTML = esc(name) + "<small>" + d.getDate() + " " + PL_MONTHS[d.getMonth()] + "</small>";
    el.nextDay.disabled = k >= today;
  }

  function renderHero() {
    const t = totals();
    const left = state.goal - t.kcal;
    const pct = state.goal > 0 ? Math.min(t.kcal / state.goal, 1) : 0;
    const C = 2 * Math.PI * 58;
    el.ringFill.setAttribute("stroke-dasharray", C.toFixed(1));
    el.ringFill.setAttribute("stroke-dashoffset", (C * (1 - pct)).toFixed(1));
    el.ringFill.style.stroke = t.kcal > state.goal ? "var(--amber)" : "var(--accent)";
    el.kcalLeft.textContent = Math.abs(rnd(left));
    el.kcalCap.textContent = left < 0 ? "kcal ponad" : "kcal zostało";
    el.eaten.textContent = rnd(t.kcal);
    el.goalTxt.textContent = rnd(state.goal);
    el.pVal.textContent = rnd(t.p) + " g";
    el.cVal.textContent = rnd(t.c) + " g";
    el.fVal.textContent = rnd(t.f) + " g";
    const pTarget = state.pGoal || 130;
    const cTarget = Math.max(1, (state.goal * 0.45) / 4);
    const fTarget = Math.max(1, (state.goal * 0.3) / 9);
    el.pBar.style.width = Math.min(100, (t.p / pTarget) * 100) + "%";
    el.cBar.style.width = Math.min(100, (t.c / cTarget) * 100) + "%";
    el.fBar.style.width = Math.min(100, (t.f / fTarget) * 100) + "%";
  }

  function renderKeyBanner() {
    el.keyBanner.replaceChildren();
    if (aiReady()) return;
    el.keyBanner.append(h("button", { class: "banner", style: { width: "100%", textAlign: "left" }, onclick: () => nav("profile") },
      icon("info", "i sm"), h("span", null, h("b", null, "Zdjęcia wymagają klucza API. "), "Dodaj darmowy klucz Gemini w Profilu — ręczne wpisy i ulubione działają bez niego.")));
  }

  function renderMeals() {
    el.slots.innerHTML = "";
    const n = state.meals.length;
    el.mealCount.textContent = n ? n + (n === 1 ? " pozycja" : n < 5 ? " pozycje" : " pozycji") : "";
    SLOTS.forEach((s) => {
      const mine = state.meals.filter((m) => normalizeSlot(m) === s.id);
      const box = h("div", { class: "slot" });
      const sum = mine.reduce((a, m) => a + num(m.kcal), 0);
      box.append(h("div", { class: "slot-h" }, h("h3", null, s.label), h("div", { class: "rule" }),
        h("span", { class: "kc num" }, mine.length ? rnd(sum) + " kcal" : ""),
        h("button", { class: "add", type: "button", "aria-label": "Dodaj do: " + s.label, onclick: () => openChooser(s.id) }, "+")));
      if (!mine.length) {
        box.append(h("button", { class: "slot-empty", type: "button", onclick: () => openChooser(s.id) }, "Dodaj posiłek"));
      } else {
        const ul = h("ul", { class: "meals" });
        mine.forEach((m) => {
          const bits = [];
          if (m.qty) bits.push(m.qty); else if (num(m.grams)) bits.push(rnd(m.grams) + " g");
          bits.push("B " + rnd(m.protein) + " · W " + rnd(m.carbs) + " · T " + rnd(m.fat));
          if (m.time) bits.push(m.time);
          const li = h("li", { class: "meal", tabindex: "0", role: "button", "aria-label": "Edytuj: " + (esc(m.name) || "posiłek"),
            onclick: () => openEdit(m), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(m); } } },
          h("div", { class: "body" }, h("div", { class: "nm" }, esc(m.name) || "Posiłek"), h("div", { class: "sub num" }, bits.join("  ·  "))),
          h("div", { class: "kc num" }, rnd(m.kcal)));
          ul.append(li);
        });
        box.append(ul);
      }
      el.slots.append(box);
    });
  }

  function renderChart() {
    el.chart.innerHTML = "";
    const vals = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(state.cur.getTime() - i * DAY_MS), k = keyOf(d);
      vals.push({ k, d, v: k === keyOf(state.cur) ? totals().kcal : num(state.history[k]) });
    }
    const max = Math.max(state.goal, vals.reduce((m, x) => Math.max(m, x.v), 0)) * 1.08;
    vals.forEach((x) => {
      let cls = "b";
      if (x.k === keyOf(state.cur)) cls += " today"; else if (x.v > state.goal) cls += " over";
      el.chart.append(h("div", { class: "col" },
        h("div", { class: "stack" }, h("div", { class: cls, title: rnd(x.v) + " kcal", style: { height: (max > 0 ? Math.max(3, (x.v / max) * 100) : 3) + "%" } })),
        h("div", { class: "d" }, PL_DAYS[x.d.getDay()])));
    });
  }

  const renderAll = () => { renderDate(); renderHero(); renderMeals(); renderChart(); renderKeyBanner(); };
  const persistDay = () => store.saveDay(keyOf(state.cur), state.meals.slice());
  const persistProfile = () => store.saveProfile({ goal: state.goal, pGoal: state.pGoal });
  const persistFavs = () => store.saveFavs(state.favs.slice());

  function loadDay() { const d = store.loadDay(keyOf(state.cur)); state.meals = d && d.meals ? d.meals.slice() : []; renderAll(); }
  function refreshWeek() {
    const keys = []; for (let i = 0; i < 7; i++) keys.push(keyOf(new Date(state.cur.getTime() - i * DAY_MS)));
    state.history = store.loadRange(keys); renderChart();
  }

  function addMeals(items, slot) {
    const now = new Date(), time = pad(now.getHours()) + ":" + pad(now.getMinutes()), s = slot || slotForNow();
    items.forEach((it) => state.meals.push({
      id: uid(), name: it.name, grams: rnd(it.grams), kcal: rnd(it.kcal), protein: rnd(it.protein), carbs: rnd(it.carbs), fat: rnd(it.fat),
      qty: it.qtyLabel || it.qty || "", time, slot: s,
    }));
    persistDay(); renderHero(); renderMeals(); renderChart();
  }

  function saveFav(m) {
    const fav = { id: uid(), name: esc(m.name) || "Posiłek", qty: m.qty || "", grams: rnd(m.grams), kcal: rnd(m.kcal),
      protein: rnd(m.protein), carbs: rnd(m.carbs), fat: rnd(m.fat), slot: m.slot || slotForNow(), uses: 0, saved: new Date().toISOString() };
    state.favs = state.favs.filter((f) => !(f.name === fav.name && rnd(f.kcal) === fav.kcal));
    state.favs.unshift(fav);
    if (state.favs.length > 60) state.favs.length = 60;
    persistFavs();
    return fav;
  }

  function slotPicker(current, onPick) {
    const seg = h("div", { class: "seg wrap" });
    SLOTS.forEach((s) => {
      const b = h("button", { type: "button", "aria-pressed": String(s.id === current) }, s.label);
      b.onclick = () => { [...seg.children].forEach((x) => x.setAttribute("aria-pressed", String(x === b))); onPick(s.id); };
      seg.append(b);
    });
    return h("div", { class: "field" }, h("label", null, "Posiłek"), seg);
  }

  function field(label, type, value, id) {
    const i = h("input", { type, id, value: value == null ? "" : String(value) });
    if (type === "number") { i.min = "0"; i.inputMode = "decimal"; }
    return { wrap: h("div", { class: "field" }, h("label", { for: id }, label), i), input: i };
  }

  // ---------- manual entry & editing ----------
  function openMealSheet(mode, seed) {
    openSheet(mode === "edit" ? "Edytuj posiłek" : "Dodaj ręcznie", (sheet, close) => {
      let slot = seed.slot || slotForNow();
      sheet.append(slotPicker(slot, (id) => { slot = id; }));
      const name = field("Nazwa", "text", seed.name || "", "fName");
      const qty = field("Ilość (opis)", "text", seed.qty || "", "fQty");
      qty.input.placeholder = "np. 3 jajka, 2 kromki";
      const kcal = field("Kcal", "number", seed.kcal != null ? rnd(seed.kcal) : "", "fKcal");
      const p = field("Białko g", "number", seed.protein != null ? rnd(seed.protein) : "", "fP");
      const c = field("Węgl. g", "number", seed.carbs != null ? rnd(seed.carbs) : "", "fC");
      const f = field("Tłuszcz g", "number", seed.fat != null ? rnd(seed.fat) : "", "fF");
      sheet.append(name.wrap, qty.wrap, kcal.wrap, h("div", { class: "grid3" }, p.wrap, c.wrap, f.wrap));

      const collect = () => ({ name: name.input.value.trim() || "Posiłek", qty: qty.input.value.trim(), grams: num(seed.grams),
        kcal: num(kcal.input.value), protein: num(p.input.value), carbs: num(c.input.value), fat: num(f.input.value), slot });
      const valid = () => { if (!name.input.value.trim() && !kcal.input.value) { name.input.focus(); return false; } return true; };

      sheet.append(h("button", { class: "btn primary", onclick: () => {
        if (!valid()) return;
        const v = collect();
        if (mode === "edit") {
          const m = state.meals.find((x) => x.id === seed.id);
          if (m) Object.assign(m, { name: v.name, qty: v.qty, kcal: rnd(v.kcal), protein: rnd(v.protein), carbs: rnd(v.carbs), fat: rnd(v.fat), slot: v.slot });
          persistDay(); renderHero(); renderMeals(); refreshWeek();
        } else addMeals([v], v.slot);
        close();
      } }, mode === "edit" ? "Zapisz zmiany" : "Dodaj do dnia"));

      const favBtn = h("button", { class: "btn" }, "Zapisz jako ulubione");
      favBtn.onclick = () => { if (!valid()) return; saveFav(collect()); favBtn.textContent = "Zapisane w ulubionych"; favBtn.disabled = true; };
      sheet.append(favBtn);

      if (mode === "edit") sheet.append(h("button", { class: "btn danger", onclick: () => {
        state.meals = state.meals.filter((x) => x.id !== seed.id);
        persistDay(); renderHero(); renderMeals(); refreshWeek(); close();
      } }, "Usuń z dnia"));
      if (mode !== "edit") setTimeout(() => name.input.focus(), 60);
    });
  }
  const openManual = (slot) => openMealSheet("new", { slot });
  const openEdit = (m) => openMealSheet("edit", m);

  // ---------- favourites ----------
  function openFavs(slot) {
    openSheet("Ulubione", (sheet, close) => {
      let target = slot || slotForNow();
      sheet.append(slotPicker(target, (id) => { target = id; }));
      if (!state.favs.length) {
        sheet.append(h("div", { class: "empty" }, h("strong", null, "Nic tu jeszcze nie ma"), "Przy dodawaniu posiłku tapnij „Zapisz jako ulubione” — wróci tu jednym kliknięciem, bez zdjęcia."));
        return;
      }
      const ul = h("ul", { class: "favs" });
      function paint() {
        ul.replaceChildren();
        state.favs.forEach((fv) => {
          const bits = []; if (fv.qty) bits.push(fv.qty);
          bits.push("B " + rnd(fv.protein) + " · W " + rnd(fv.carbs) + " · T " + rnd(fv.fat));
          const row = h("button", { class: "fav", type: "button", onclick: () => {
            fv.uses = num(fv.uses) + 1; fv.lastUsed = new Date().toISOString(); persistFavs();
            addMeals([{ name: fv.name, qty: fv.qty, grams: fv.grams, kcal: fv.kcal, protein: fv.protein, carbs: fv.carbs, fat: fv.fat }], target);
            close();
          } }, h("div", { class: "body" }, h("div", { class: "nm" }, fv.name), h("div", { class: "sub num" }, bits.join("  ·  "))),
          h("div", { class: "kc num" }, rnd(fv.kcal)));
          const rm = h("button", { class: "x-btn", type: "button", "aria-label": "Usuń z ulubionych: " + fv.name, onclick: () => {
            state.favs = state.favs.filter((x) => x.id !== fv.id); persistFavs();
            if (!state.favs.length) { close(); openFavs(target); return; }
            paint();
          } }, icon("x", "i sm"));
          ul.append(h("li", null, h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, row, rm)));
        });
      }
      paint();
      sheet.append(ul, h("p", { class: "foot" }, "Tapnij pozycję, żeby dopisać ją do wybranego posiłku."));
    });
  }

  // ---------- add chooser ----------
  let pendingSlot = null;
  function openChooser(slot) {
    openSheet(slotLabel(slot), (sheet, close) => {
      sheet.append(h("div", { class: "chooser" },
        h("button", { class: "btn primary", onclick: () => { pendingSlot = slot; close(); el.fileInput.click(); } }, icon("camera", "i sm"), "Zdjęcie posiłku"),
        h("button", { class: "btn", onclick: () => { close(); openFavs(slot); } }, "Z ulubionych" + (state.favs.length ? " (" + state.favs.length + ")" : "")),
        h("button", { class: "btn", onclick: () => { close(); openManual(slot); } }, "Wpisz ręcznie")));
    });
  }

  // ---------- settings ----------
  function openSettings() {
    openSheet("Cele", (sheet, close) => {
      const g = field("Dzienny cel kcal", "number", state.goal, "sGoal");
      const p = field("Cel białka (g)", "number", state.pGoal, "sProt");
      sheet.append(g.wrap, p.wrap,
        h("button", { class: "btn primary", onclick: () => {
          state.goal = Math.max(800, Math.min(8000, rnd(g.input.value) || 2000));
          state.pGoal = Math.max(20, Math.min(400, rnd(p.input.value) || 130));
          persistProfile(); renderHero(); renderChart(); close();
        } }, "Zapisz"),
        h("button", { class: "btn ghost", onclick: () => { close(); nav("profile"); } }, "Klucz API do zdjęć → Profil"),
        h("p", { class: "foot" }, "Dane zapisują się tylko w tym telefonie."));
    });
  }

  // ---------- photo flow ----------
  const PROMPT = [
    "Jesteś asystentem żywieniowym. Na załączonym zdjęciu jest posiłek.",
    "Rozpoznaj poszczególne potrawy i składniki, oszacuj ilość każdego i wartości odżywcze.",
    "",
    "Dla każdej pozycji wybierz jednostkę, w której człowiek naturalnie liczy ten produkt:",
    "- jajka: jajko, unitGrams ok. 56 (rozmiar M);",
    "- smarowidła (masło orzechowe, nutella, serek kanapkowy, dżem, majonez, masło, hummus): łyżeczka 5 g albo łyżka 15 g;",
    "- chleb, tost, bułka: kromka ok. 35 g, bułka jako sztuka;",
    "- owoce i warzywa liczone w sztukach: sztuka, z realną masą jednej;",
    "- wędlina, ser żółty: plasterek;",
    "- napoje i zupy: szklanka 250 g;",
    "- pierogi, krokiety, naleśniki, kotlety, klopsy: sztuka;",
    "- olej i oliwa do smażenia: łyżka 10 g;",
    "- rzeczy sypkie i mięso w kawałku (ryż, kasza, makaron, pierś z kurczaka): jednostką jest gram, wtedy unitGrams=1 i unitForms to [\"g\",\"g\",\"g\"].",
    "",
    "Odpowiedz wyłącznie obiektem JSON w tym kształcie:",
    '{"items":[{"name":"jajecznica","unitForms":["jajko","jajka","jajek"],"unitGrams":56,"units":3,"kcalPerUnit":78,"proteinPerUnit":6,"carbsPerUnit":1,"fatPerUnit":6,"confidence":"wysoka"}],"note":"krótka uwaga"}',
    "",
    "Zasady:",
    "- unitForms to trzy polskie formy liczebnikowe tej jednostki: dla 1, dla 2-4, dla 5 i więcej (łyżeczka, łyżeczki, łyżeczek);",
    "- pola kcalPerUnit, proteinPerUnit, carbsPerUnit i fatPerUnit dotyczą JEDNEJ jednostki, nigdy całej porcji;",
    "- units to liczba jednostek, którą widzisz na zdjęciu;",
    "- przy unitGrams=1 podaj wartości per unit z dokładnością do dwóch miejsc po przecinku, w pozostałych przypadkach liczby całkowite;",
    "- nazwa pozycji bez liczebnika: \"jajecznica\", nie \"jajecznica z 3 jaj\";",
    "- tłuszcz ze smażenia, sosy i dressing dopisz jako osobną pozycję w łyżkach lub łyżeczkach;",
    "- confidence to jedno ze słów: wysoka, srednia, niska;",
    "- w note napisz po polsku jedną rzecz, której nie da się ocenić ze zdjęcia (np. ile oleju zostało na patelni);",
    '- jeśli na zdjęciu nie ma jedzenia, zwróć {"items":[],"note":"Nie widzę tu jedzenia."}.',
  ].join("\n");

  function plForm(n, forms) {
    const f = forms && forms.length === 3 ? forms : ["g", "g", "g"];
    const a = Math.abs(n);
    if (a === 1) return f[0];
    if (!Number.isInteger(a)) return f[1];
    const last = a % 10, last2 = a % 100;
    if (last >= 2 && last <= 4 && !(last2 >= 12 && last2 <= 14)) return f[1];
    return f[2];
  }
  const fmtQty = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");

  function confChip(c) {
    const s = String(c || "").toLowerCase();
    if (s.startsWith("wys") || s.startsWith("hig")) return ["high", "pewne"];
    if (s.startsWith("nis") || s.startsWith("low")) return ["low", "zgadywane"];
    return ["mid", "przybliżone"];
  }

  function errorCopy(code) {
    switch (code) {
      case "no_key": return "Brak klucza API. Dodaj go w Profilu → Analiza zdjęć jedzenia.";
      case "bad_key": return "Klucz API został odrzucony. Sprawdź go w Profilu.";
      case "bad_request": return "Model odrzucił zapytanie — sprawdź nazwę modelu w Profilu albo zostaw pole puste.";
      case "network": return "Brak połączenia z internetem albo serwer nie odpowiada.";
      case "image_rejected": return "Nie udało się odczytać tego pliku. Wybierz inne zdjęcie.";
      case "rate_limited": return "Limit zapytań na kluczu. Spróbuj za minutę.";
      case "invalid_json": return "Odpowiedź przyszła w złym formacie. Spróbuj jeszcze raz albo dopisz podpowiedź, co jest na zdjęciu.";
      case "refused": return "Model nie przeanalizował tego zdjęcia. Spróbuj z innym ujęciem talerza.";
      case "empty_completion": return "Brak odpowiedzi. Spróbuj z wyraźniejszym zdjęciem.";
      case "cancelled": return "";
      default: return "Coś poszło nie tak przy analizie. Spróbuj jeszcze raz.";
    }
  }

  function openPhoto(file, slot) {
    let ctl = null;
    const url = URL.createObjectURL(file);
    const closeAll = openSheet("Analiza zdjęcia", (sheet) => {
      let target = slot || slotForNow();
      sheet.append(slotPicker(target, (id) => { target = id; }));
      sheet.append(h("img", { class: "preview", alt: "Zdjęcie posiłku", src: url }));
      const ta = h("textarea", { id: "hintTa", placeholder: "np. kurczak smażony na łyżce oliwy, ryż ok. 200 g" });
      sheet.append(h("div", { class: "field" }, h("label", { for: "hintTa" }, "Podpowiedź (opcjonalnie)"), ta));
      const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "11px" } });
      const footer = h("div", { style: { display: "flex", flexDirection: "column", gap: "9px" } });
      sheet.append(body, footer);
      const runBtn = h("button", { class: "btn primary", onclick: () => run(false) }, "Przeanalizuj");
      footer.append(runBtn);
      let items = [];
      let totalRow = null, addBtn = null;

      const setStatus = (text) => body.replaceChildren(h("div", { class: "status" }, h("div", { class: "spin" }), h("span", null, text)));
      const setError = (msg) => { body.replaceChildren(); if (msg) body.append(h("div", { class: "err" }, msg)); };

      function updateTotal() {
        if (!totalRow) return;
        totalRow.textContent = "Razem " + rnd(items.reduce((s, x) => s + num(x.kcal), 0)) + " kcal";
        if (addBtn) addBtn.disabled = items.length === 0;
      }

      function renderItems(note) {
        body.replaceChildren();
        if (note) body.append(h("div", { class: "note" }, note));
        if (!items.length) { body.append(h("div", { class: "err" }, "Nie rozpoznano żadnej potrawy. Dopisz podpowiedź i spróbuj jeszcze raz.")); return; }
        items.forEach((it) => {
          const ci = confChip(it.confidence);
          const nameIn = h("input", { type: "text", value: it.name });
          nameIn.oninput = () => { it.name = nameIn.value; };
          const card = h("div", { class: "item" }, h("div", { class: "hd" }, nameIn, h("span", { class: "conf " + ci[0] }, ci[1]),
            h("button", { class: "x-btn", "aria-label": "Usuń pozycję", onclick: () => { items = items.filter((x) => x !== it); renderItems(note); updateTotal(); } }, icon("x", "i sm"))));

          const byGram = it.unitGrams <= 1, step = byGram ? 10 : 1, minUnits = step;
          const qtyB = h("b", { class: "num" }), qtyS = h("span", { class: "num" });
          const minus = h("button", { type: "button", "aria-label": "Mniej: " + it.name }, "−");
          const plus = h("button", { type: "button", "aria-label": "Więcej: " + it.name }, "+");
          card.append(h("div", { class: "stepper" }, minus, h("div", { class: "qty" }, qtyB, qtyS), plus));
          const range = h("input", { type: "range", min: String(Math.max(5, Math.round(it.unitGrams))), max: String(Math.max(120, Math.round(it.baseGrams * 3))), step: "5", "aria-label": "Dokładna masa: " + it.name });
          range.hidden = !byGram;
          card.append(range);
          if (!byGram) {
            const fine = h("button", { type: "button", class: "fine" }, "Ustaw dokładnie w gramach");
            fine.onclick = () => {
              range.hidden = !range.hidden;
              fine.textContent = range.hidden ? "Ustaw dokładnie w gramach" : "Licz na sztuki";
              if (!range.hidden) range.value = String(Math.round(it.units * it.unitGrams));
            };
            card.append(fine);
          }
          const macros = () => rnd(it.kcal) + " kcal · B " + rnd(it.protein) + " W " + rnd(it.carbs) + " T " + rnd(it.fat);
          function paint() {
            if (byGram) { qtyB.textContent = Math.round(it.units) + " g"; qtyS.textContent = macros(); }
            else { qtyB.textContent = fmtQty(it.units) + " " + plForm(it.units, it.unitForms); qtyS.textContent = Math.round(it.units * it.unitGrams) + " g · " + macros(); }
            minus.disabled = it.units <= minUnits;
            updateTotal();
          }
          function apply() {
            it.kcal = it.units * it.perKcal; it.protein = it.units * it.perP; it.carbs = it.units * it.perC; it.fat = it.units * it.perF;
            it.qtyLabel = byGram ? Math.round(it.grams) + " g" : fmtQty(it.units) + " " + plForm(it.units, it.unitForms);
            paint();
          }
          function setUnits(u) { it.units = Math.max(minUnits, Math.round(u / step) * step); it.grams = it.units * it.unitGrams; apply(); }
          minus.onclick = () => setUnits(it.units - step);
          plus.onclick = () => setUnits(it.units + step);
          range.oninput = () => { const g = num(range.value); it.units = it.unitGrams > 0 ? g / it.unitGrams : g; it.grams = g; apply(); };
          body.append(card);
          setUnits(it.units);
          if (byGram) range.value = String(Math.round(it.grams));
        });
      }

      function showAddControls() {
        footer.replaceChildren();
        totalRow = h("div", { class: "status num", style: { justifyContent: "center" } });
        addBtn = h("button", { class: "btn primary", onclick: () => { addMeals(items, target); closeAll(); } }, "Dodaj do dnia");
        const favBtn = h("button", { class: "btn" }, "Zapisz jako ulubione");
        favBtn.onclick = () => {
          if (!items.length) return;
          const s = items.reduce((a, x) => { a.kcal += num(x.kcal); a.protein += num(x.protein); a.carbs += num(x.carbs); a.fat += num(x.fat); a.grams += num(x.grams); return a; },
            { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 });
          s.name = items.map((x) => x.name).join(" + ");
          s.qty = items.map((x) => x.qtyLabel || "").filter(Boolean).join(" + ");
          s.slot = target;
          saveFav(s); favBtn.textContent = "Zapisane w ulubionych"; favBtn.disabled = true;
        };
        footer.append(totalRow, addBtn, favBtn, h("button", { class: "btn", onclick: () => run(true) }, "Przeanalizuj jeszcze raz"));
        updateTotal();
      }

      function run() {
        footer.replaceChildren(h("button", { class: "btn", onclick: () => { if (ctl) ctl.abort(); } }, "Przerwij"));
        setStatus("Analizuję zdjęcie…");
        ctl = new AbortController();
        let prompt = PROMPT;
        if (ta.value.trim()) prompt += "\n\nPodpowiedź od użytkownika: " + ta.value.trim();
        sample.json(prompt, { images: [file], signal: ctl.signal }).then((data) => {
          ctl = null;
          items = ((data && data.items) || []).map(normalizeItem);
          renderItems(data && data.note ? String(data.note) : "");
          showAddControls();
        }).catch((e) => {
          ctl = null;
          const code = e && e.code ? e.code : "upstream_error";
          if (code === "cancelled") { body.replaceChildren(); footer.replaceChildren(runBtn); return; }
          setError(errorCopy(code));
          footer.replaceChildren(
            code === "no_key" || code === "bad_key"
              ? h("button", { class: "btn primary", onclick: () => { closeAll(); nav("profile"); } }, "Dodaj klucz w Profilu")
              : h("button", { class: "btn", onclick: () => run(true) }, "Spróbuj ponownie"),
            h("button", { class: "btn", onclick: () => { closeAll(); openManual(target); } }, "Wpisz ręcznie"));
        });
      }
      run(false);
    });
    // revoke the preview URL when the sheet goes away
    const obs = new MutationObserver(() => { if (!document.querySelector(".preview")) { if (ctl) ctl.abort(); URL.revokeObjectURL(url); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
  }

  function normalizeItem(x) {
    const forms = Array.isArray(x.unitForms) && x.unitForms.length === 3 ? x.unitForms.map(String) : ["g", "g", "g"];
    let ug = num(x.unitGrams, 0), units = num(x.units, 0), perKcal = num(x.kcalPerUnit, NaN);
    if (!isFinite(perKcal)) {
      // fallback for a reply that gave totals instead of per-unit values
      const totGrams = Math.max(1, rnd(x.grams) || 100);
      ug = ug > 0 ? ug : 1; units = totGrams / ug;
      perKcal = units > 0 ? num(x.kcal) / units : 0;
      x = { proteinPerUnit: units > 0 ? num(x.protein) / units : 0, carbsPerUnit: units > 0 ? num(x.carbs) / units : 0,
        fatPerUnit: units > 0 ? num(x.fat) / units : 0, name: x.name, confidence: x.confidence };
    }
    if (!(ug > 0)) ug = 1;
    if (!(units > 0)) units = ug > 1 ? 1 : 100;
    const o = { name: String(x.name || "Posiłek"), confidence: x.confidence, unitForms: forms, unitGrams: ug, units, perKcal,
      perP: num(x.proteinPerUnit), perC: num(x.carbsPerUnit), perF: num(x.fatPerUnit), baseGrams: Math.max(1, units * ug) };
    o.grams = o.baseGrams; o.kcal = units * o.perKcal; o.protein = units * o.perP; o.carbs = units * o.perC; o.fat = units * o.perF;
    return o;
  }

  // ---------- events ----------
  el.prevDay.onclick = () => { state.cur = new Date(state.cur.getTime() - DAY_MS); loadDay(); refreshWeek(); };
  el.nextDay.onclick = () => { if (keyOf(state.cur) >= keyOf(new Date())) return; state.cur = new Date(state.cur.getTime() + DAY_MS); loadDay(); refreshWeek(); };
  el.favBtn.onclick = () => openFavs(slotForNow());
  el.settingsBtn.onclick = openSettings;
  el.photoBtn.onclick = () => { pendingSlot = null; el.fileInput.click(); };
  el.fileInput.onchange = () => {
    const f = el.fileInput.files && el.fileInput.files[0];
    el.fileInput.value = "";
    const s = pendingSlot; pendingSlot = null;
    if (f) openPhoto(f, s || slotForNow());
  };

  loadDay();
  refreshWeek();
}
