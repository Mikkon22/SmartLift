// Tiny DOM helpers shared by every screen.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const PATHS = {
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  food: '<path d="M4 3v8a3 3 0 0 0 3 3v7M10 3v8M7 3v6M17 21V3c-2.2 1-4 3.5-4 7v4h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 10"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  heart: '<path d="M12 21s-7-4.35-9.33-8.5C.9 9.3 2.4 5.5 5.9 4.6 8.1 4.03 10.5 5 12 7c1.5-2 3.9-2.97 6.1-2.4 3.5.9 5 4.7 3.23 7.9C19 16.65 12 21 12 21z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};

export function icon(name, cls = "i") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = PATHS[name] || "";
  return s;
}

let closeCurrent = null;
export function openSheet(title, build) {
  if (closeCurrent) closeCurrent();
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title });
  const scrim = h("div", { class: "scrim" }, sheet);
  document.body.appendChild(scrim);
  document.body.style.overflow = "hidden";
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  function close() {
    document.removeEventListener("keydown", onKey);
    scrim.remove();
    document.body.style.overflow = "";
    closeCurrent = null;
  }
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  sheet.appendChild(h("div", { class: "sheet-h" }, h("h2", null, title),
    h("button", { class: "round-btn", "aria-label": "Zamknij", onclick: close }, icon("x"))));
  closeCurrent = close;
  build(sheet, close);
  return close;
}

export function toast(msg) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

export function fmtSec(s) {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

export function fmtVal(v, unit) {
  if (unit === "sec") return v >= 60 ? Math.floor(v / 60) + ":" + String(v % 60).padStart(2, "0") : v + " s";
  return String(v);
}

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
export function fmtDate(iso) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days === 0) return "dziś";
  if (days === 1) return "wczoraj";
  if (days < 7) return days + " dni temu";
  return d.getDate() + " " + MONTHS[d.getMonth()];
}
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

// Polish plural: 1 seria / 2-4 serie / 5+ serii
export function pl(n, one, few, many) {
  const a = Math.abs(n), l = a % 10, l2 = a % 100;
  if (a === 1) return one;
  if (l >= 2 && l <= 4 && !(l2 >= 12 && l2 <= 14)) return few;
  return many;
}

export function beep() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = beep.ctx || (beep.ctx = new C());
    [0, 0.18, 0.36].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.14);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch {}
}
// iOS only lets audio start after a user gesture — call this from a tap.
export function unlockAudio() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = beep.ctx || (beep.ctx = new C());
    if (ctx.state === "suspended") ctx.resume();
  } catch {}
}
