# Ere Long — re-add per-event colour (+ future Thine feed)

*Written 2026-07-19 from the Thine session, for the next Ere Long session. Terri asked for
colour to be re-added to Ere Long; Thine-side display wiring is already done (see below).*

## What Thine already has (done, do not redo)
Thine's calendar now shows its countdowns either as full label chips or as a **coloured ★ per
countdown** (Settings → "Countdowns & Ere Long": `showCountdowns` + `countdownStars` toggles).
Each Thine countdown has a colour from this 8-colour palette (`COUNTDOWN_PALETTE` in
`Thine/js/app.js`) — **reuse these exact hexes in Ere Long so the two apps match**:

```
#7B3F7D violet   #3F6E7B slate teal   #7B5A3F sienna   #3F7B5A forest
#7B3F4F rose     #4F3F7B indigo       #7B6E3F gold     #3F7B6E seafoam
```

## Ere Long architecture truth (verified in public/app.js 2026-07-19)
- 4 faces (events) in `state.faces`, persisted to **localStorage `erelong_v1`** — client-side
  only. The tutorial (~line 541) explicitly promises "no database of your countdowns exists".
  **Do not add any server-side storage of events — that promise is a feature.**
- Face schema (`blankFace`, ~line 51): `{ name, targetDate, mood, createdAt, arrivedAt }`.
- **Gotcha:** `sanitizeFace()` (~line 58) coerces to the exact expected shape and **silently
  strips unknown keys** on every hydrate/import. A `color` field is dropped until sanitizeFace
  itself accepts it — add it there FIRST or the feature will mysteriously not persist.
- Dial colours are hard-coded gold: ring `#c9a84c` / bright `#d4b455` (~line 241),
  `shadowColor 'rgba(201,168,76,.38)'` (~line 265), plus a gold gradient stop (~line 231).

## What to do here
1. **Schema:** add `color: ''` to `blankFace()`; in `sanitizeFace()` accept it with
   `if (typeof f.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(f.color)) b.color = f.color;`
   Empty/absent → fall back to the classic gold (existing look stays the default).
2. **Rendering:** where the ring/glow uses `#c9a84c`/`#d4b455`/gold rgba, use the face's colour
   when set (derive the bright variant by lightening, and the glow rgba from the same hex).
3. **UI:** a small swatch picker per face (the 8 hexes above) near the name/date form; picking
   one sets `face.color` + `persist()`.
4. **Export/Import:** nothing extra — once sanitizeFace accepts `color`, the existing
   Export/Import Events JSON carries it automatically. Verify with an export→import round trip.
5. Deploy: commit first, then wrangler deploy **with `NODE_OPTIONS="--use-system-ca"`**
   (Norton intercepts HTTPS). Verify the live page after.

## Future (out of scope now): feeding Thine countdowns into Ere Long
Thine's `countdowns` table (`{date, title, color}`) was designed to feed Ere Long, but Ere Long
is deliberately serverless-per-user (localStorage). Options that keep the privacy promise:
- **Import file:** Thine adds "Export for Ere Long" producing the `erelong-events.json` shape
  (array of 4 faces); user imports it in Ere Long. Simplest, zero Ere Long changes beyond colour.
- **Electron injection:** Thine opens Ere Long in its own BrowserWindow (main.js
  `openCompanionApp`), so Thine could write `erelong_v1` into that window's localStorage via
  `webContents.executeJavaScript` before load. More magical, more fragile.
- Constraint either way: Ere Long has exactly **4 faces**; Thine countdowns are unlimited —
  the user must pick which 4 (e.g. the 4 soonest).
