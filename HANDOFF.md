# HANDOFF: Articulation & Dynamics Trainer

Static GitHub Pages app for Raven Band students (Chromebooks and the classroom viewboard).
Repo: artificialfear/articulation-dynamics. Live at https://artificialfear.github.io/articulation-dynamics/

## Files
- `index.html`: markup and CSS. Each script tag has `?v=<VERSION>` so students' devices never run stale code. Bump the version in `js/ui.js` and all the script tags together; the smoke test enforces that they match.
- `js/theory.js`: instruments (transposition `tr`, warm-up register `bb`, scale tonics `f`/`eb`, Remington/single-F tonic `rf`), pitch patterns, note spelling (`spell`, `noteKey`, `writtenKey`).
- `js/model.js`: data model, random generation, articulation and dynamics randomizers, `levelFn` (loudness over time), `playPlan` (sound events shared by audio and mic), rhythm builder, share-link encode/decode.
- `js/render.js`: VexFlow drawing of one example (`renderScore`) plus the icon helpers.
- `js/audio.js`: Web Audio playback, with samples, synth, snare, metronome, cursor, and highlight. Sound options: `inst` (samples), `synth`, and `octaves` (2.4.3: `octaveVoice` plays two `synthVoice`s, midi and midi−12, each at 0.62 gain). Board mode always uses `octaves` (Mat 11/20, 2.4.4).
- `js/ui.js`: state, panels, settings drawer, share popover, presentation and full screen, keyboard.
- `js/quiz.js`, `js/mic.js`: Listening Quiz and mic check (see below).
- `lib/vexflow-4.2.5.js`: bundled locally (no CDN).
- `assets/raven-logo.png`, `assets/raven-icon.png`: from Mat's Drive ("RAVEN-LOGO-NEW-cropped.png").
- `assets/sounds/<instrument>/<Note>.mp3`: FluidR3 GM samples (CC BY 3.0, credited in the footer), one every minor 3rd across each instrument's needed range. The app pitch-shifts to the nearest sample and loops 0.6–2.8 s for long notes.
- `tests/smoke.py`: Playwright test (`python3 tests/smoke.py . shots`). It must print OK before every commit.

## Data model
Note: `{dur:'w'|'h'|'q'|'8', start, rest, p, art, dyn, hp, sl, tie}`.
- `p` is a **concert** semitone offset from the pattern's tonic, so one example reads correctly on every instrument and a share link transposes automatically.
- `sl` means slurred to the next note; `tie` means tied to the next note (same `p`).
- Articulation mode is 1 measure; Dynamics mode is 2.

## Decisions Mat made
- Lengths come from his "Note Shapes and Note Lengths" guide (Drive file 15h38mqMMwmSdELsZKgRq--Cfatd0Lpe4): tenuto 100%, long lifted 75%, staccato 50%, accent 100% weight+decay, marcato 50% weight+decay, unmarked notes 75%.
- Dynamics mode sustains every note 95%.
- Default playback pitch is concert F. The metronome and cursor are on by default, and each can be turned off.
- Long Lifted is off in random mode until checked.
- Quiz: both whole-class (Reveal) and individual (score).
- Multiple pitches: instrument selector with written transposition.
- Patterns: single pitch, the B♭/F/E♭ scales, and Remington.
- Mic feedback measures note length only.

## Quiz (js/quiz.js)
- State is in `Q`; the topic, type, and mode are saved per device. A question is `Q.q`.
- **Name it:** `targets` = artEligible notes. Solo answers go in `answers`. `check()` scores per note, and the streak counts only perfect questions.
- **Spot the mistake:** `played` is an altered copy used only for audio. `wrong` is the list of note indexes that count as correct taps. Articulation mistakes use the `CONTRAST` map. Dynamics mistakes (`spotDyn`) either change one marking by 2+ levels or turn a hairpin the wrong way; the smoke test checks that every mistake changes the loudness curve audibly.
- **Which one?:** the options must differ (articulations: different patterns; dynamics: different contour first). Playback for "which" never highlights notes or shows the cursor, because that would give the answer away.
- Quiz messages show in `#banner` inside the score card so they're visible in Presentation mode.

## Mic check (js/mic.js)
- `getUserMedia` with echo cancellation, noise suppression, and auto gain off. A ScriptProcessor collects RMS every 256 samples, timestamped on the AudioContext clock.
- Only the count-off clicks play during a take; the cursor runs as a visual guide.
- `analyzeTake()` is pure and covered by the smoke test's synthetic takes (noise, count-off click bleed, 20–140 ms mic lag, 50 ms room-echo tail, 60–140 bpm). Mean error is about 1.5 points, worst under 10; the tolerance is ±15.
  - The noise floor comes from the count-off bar, skipping the clicks.
  - The take is lined up using the first attack.
  - Per event (from `playPlan`), the onset is the first rising edge, or the expected start when a tenuto or slur runs in.
  - The release is where the level drops below 60% of the note's body (30% for weight+decay notes) for 40 ms. The echo tail is then subtracted, using how fast the tail halves.
  - A note that never goes quiet before the next note counts as full length.
- Chromium's fake microphone exercises the whole UI flow in the test.

## Agenda board mode (2.3.0)
- `?board=1&mode=art|dyn&lvl=…&seed=…`. The agenda board (artificialfear/agenda-board, same origin artificialfear.github.io) opens it in an iframe.
- `LEVELS` in ui.js holds each class level's pool, rhythm options, dynamic range, and tempo.
- `withSeed()` makes the example repeatable. The board sends `seed=<date>|<level>`, so 3rd and 4th Block (both 7th) share an example.
- The hidden instrument `neutral` puts every note on b/4 and plays concert F. Since 2.4.4 the board plays it with the octave synth, so no samples load.
- `store` is read and write disabled on the board.
- "Back to agenda" and Esc post `{artDyn:"close"}` to the parent.
- Must run on the ViewBoard's Chrome ~87: no :is/:where/:has, aspect-ratio, `.at()`, `??=`, or emoji newer than Unicode 9. (🎚 rendered as a box in testing, so Dynamics uses 🔊.)

## Dynamics Warm-up (2.4.0, changed in 2.4.1)
- `warmupNotes()`, `WARMUP_LINES` ({m:[m0,m1], ex}) and `WARMUP_EX` live in model.js, built from Mat's screenshot (11/20).
  - 2.4.1 (Mat): no fermatas. Each ladder note is a half note + half rest, so it plays in time.
  - #1 = the top two lines (beats 0–44); #2 = shapes fp<f, f>p, p<f>p (beats 44–72).
  - `S.warmSel` = "1" | "2" | "both" (warm-up panel + Presentation bar `#pWarmSel`).
- Fermata support is still in the engine (`n.ferm`, `timeMap`) but nothing uses it now.
- **fp:** `DYNS[6]` / `FP`. Its level is p (`dynLevel`).
  - 2.4.2 (Mat: "two separate events, loud then soft"): `envelope(..., fp={g, hold, drop})` holds the f gain for hold = 0.5 beat (clamped 0.25–0.45 s), then ramps to p over 0.06 s. The synth filter follows.
  - The smoke test renders the envelope offline and checks that the forte part is more than 3x the piano part.
- **ff kerning:** `DYN_KERN` in render.js; `dynWidth` and `drawDyn` share `dynAdvance`.
- **Multi-line rendering:** `renderScore` takes `measures`, `noTime`, `noEnd`, `L`, and `tieIn`. `renderWarmup()` adds "#1 / #2" labels and returns `{lines, els}` for a cursor that hops between lines.
- Pitch is always concert F (concert B♭ if the pattern is single B♭): `warmPattern()`.

## Notes
- Slurs are only generated with a pattern that moves (a slur over one repeated pitch would look like a tie). The Slur button is disabled when the next note has the same pitch.
- Articulations go on the notehead side; marcato always goes above.
- Slurs: VexFlow Curve, with the direction picked from the first note's stem.
- Settings live in localStorage, so they are per device.

## Open items / ideas
- Harder rhythms (dotted notes, sixteenths), sfz/fp, ppp/fff.
