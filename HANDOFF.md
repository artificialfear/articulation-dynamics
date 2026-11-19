# HANDOFF: Articulation & Dynamics Trainer

Static GitHub Pages app for Raven Band students (Chromebooks and the classroom viewboard).
Repo: artificialfear/articulation-dynamics. Live at https://artificialfear.github.io/articulation-dynamics/

## Files
- `index.html`: markup and CSS. Each script tag has `?v=<VERSION>` so students' devices never run stale code. Bump the version in `js/ui.js` and all the script tags together; the smoke test enforces that they match.
- `js/theory.js`: instruments (transposition `tr`, warm-up register `bb`, scale tonics `f`/`eb`, Remington/single-F tonic `rf`), pitch patterns, note spelling (`spell`, `noteKey`, `writtenKey`).
- `js/model.js`: data model, random generation, articulation and dynamics randomizers, `levelFn` (loudness over time), `playPlan` (sound events shared by audio and mic), rhythm builder, share-link encode/decode.
- `js/render.js`: VexFlow drawing of one example (`renderScore`) plus the icon helpers.
- `js/audio.js`: Web Audio playback, with samples, synth, snare, metronome, cursor, and highlight.
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

## Notes
- Slurs are only generated with a pattern that moves (a slur over one repeated pitch would look like a tie). The Slur button is disabled when the next note has the same pitch.
- Articulations go on the notehead side; marcato always goes above.
- Slurs: VexFlow Curve, with the direction picked from the first note's stem.
- Settings live in localStorage, so they are per device.

## Open items / ideas
- Harder rhythms (dotted notes, sixteenths), sfz/fp, ppp/fff.
