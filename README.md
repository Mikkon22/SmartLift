# Smart Lift

Personal workout PWA for the **Body by Rings — Push & Pull, Phases 1-3** plan, with automatic progression and the food log (ported from the "Talerz" prototype).

No build step: plain HTML/CSS/ES modules. Everything is stored locally on the phone (`localStorage`).

## What it does

- **Remembers the last result of every exercise + variation** (Ring Dip · Elbows in ≠ Ring Dip · Bulgarian).
- **Suggests the next session**: last total volume (reps or seconds) + your progression % (default 3 %, set on first launch, ±1 in Profil). It is always at least +1 rep / +5 s.
  - When a set would go above the top of the rep range, it adds a set and drops the reps (3×15 → 4×12), as the plan's rules say.
  - When it goes past the plan's max sets, it tells you to make the exercise harder (lower rings, slower tempo, load).
- **Adapts during the workout**: after each logged set it re-splits what is left of the target. Planned 7·7·7 = 21, first set only 5 → the rest becomes 4·4·4·4 so the total still gets done. A better set lightens the remaining ones.
- Down series (8! = 36), timed sets (5 s steps + stopwatch), accumulation (handstand pushups in 20 min, hangs 2-4 min), L&R per side, deload week (half the sets, same reps, not used as the base for progression).
- Week counter per phase (5 weeks + deload), session rotation Push 1 → Pull 1 → Push 2 → Pull 2.
- Rest timer with +15 s / pause / skip and a beep.
- Exercise library with history, next suggestion and manual entry of a result (for numbers from before the app).
- **Food tab** = Talerz: photo → items in natural units (eggs, teaspoons, slices), day log by meal, favourites, 7-day chart. Photo analysis needs your own API key (Profil → Analiza zdjęć): free Gemini key from https://aistudio.google.com/apikey, or an Anthropic key. The key never leaves the phone and is excluded from backups.
- Backup export/import (JSON) in Profil.

Video placeholders show the exercise initials (one word → 1 letter, two+ words → first letters of the first two).

## Run it

### On the Mac (quick test)
```bash
cd ~/Desktop/"Smart Lift"
python3 -m http.server 8000
```
Open http://localhost:8000. On the iPhone (same Wi-Fi): `http://<your-mac-name>.local:8000` → Share → **Add to Home Screen**.
Over plain http the offline cache is off and the Mac must be running.

### On the iPhone for real (offline, no Mac needed)
Host the folder on any HTTPS static host, then Safari → Share → **Add to Home Screen**:
- **GitHub Pages**: repo Settings → Pages → Deploy from branch `main` / root. (Free accounts: the repo must be public. Nothing secret is in the repo.)
- Or **Netlify / Cloudflare Pages**: connect the private repo, no build command, publish directory `/`.

Data is tied to the address you open, so pick one and stick to it (or move with Export/Import).

When you change files, bump `VERSION` in `sw.js` so the phone picks up the update.

## Structure

```
index.html            shell
css/app.css           tokens from the Figma file (Smart Lift / Mobile) + components
js/plan.js            the Body by Rings plan as data
js/engine.js          progression + in-workout adaptation (pure, tested)
js/store.js           localStorage
js/train.js           plan overview + guided workout
js/library.js         exercise list + history
js/profile.js         progression %, AI key, backup, history
js/food.js, js/ai.js  food log (Talerz) + photo analysis
test/engine.test.mjs  node test/engine.test.mjs
```

## Next: native (Xcode)

`engine.js` and `plan.js` are pure logic with tests — port them 1:1 to Swift (e.g. `ProgressionEngine.swift`, `Plan.swift`) and keep the same test cases.

Plan source: bodybyrings.com — reformatted for personal use.
