# HANDOFF: Articulation & Dynamics Trainer

Single-page static app for Raven Band students (Chromebooks and the classroom viewboard). Repo: artificialfear/articulation-dynamics, served from GitHub Pages (main branch, root).

## Files
- `index.html`: the whole app (CSS and JS inline, so students' devices can't serve a stale cached copy of the app code). Version constant is `VERSION`.
- `lib/vexflow-4.2.5.js`: bundled locally (no CDN). The filename includes the version, which acts as its cache key.
- `tests/smoke.py`: Playwright smoke test (`python3 tests/smoke.py . shots`). It stress-tests random generation, checks invariants, takes screenshots, and fails on console errors.

## How it works
- Notation: VexFlow 4. Every note sits on the middle line (treble B4, bass D3, percussion B4) with stems down, and articulations are placed ABOVE, which is the notehead side.
- Articulation random: each beat is a quarter or two eighths (never all quarters or all eighths). Every articulation in the random pool appears at least once.
- Dynamics random: markings fall on beats at least 2 beats apart. There are 3 to 4 markings when the rhythm allows, always one in measure 2, and at least one hairpin. A hairpin always heads toward a louder (crescendo) or softer (decrescendo) next marking. `dynWarnings()` flags any hairpin a user sets manually that goes the wrong direction.
- Hairpins and dynamic glyphs are drawn by hand (VexFlow Glyph plus lines) below the staff. A hairpin runs from its note to the next marked note, or to the end of the example if nothing follows.
- Audio: Web Audio, two detuned saws through a lowpass whose cutoff follows loudness. Approximate lengths: plain 86%, staccato about 42% (max 0.22 s), tenuto full length, accent has a 2.2x attack spike, marcato has a 2.9x spike and 62% length. Dynamics come from `DYN_GAIN`, and hairpins ramp gain inside each note.
- Settings (mode, clef, tempo, count-off, labels, random pool, theme) are saved in localStorage, so they are per device.

## Open items / ideas for later
- Harder levels: dotted rhythms, sixteenths, rests, ties, slurs, sfz/fp, ppp/fff.
- Quiz mode (name the symbol, or hear it and pick the right one).
- Multiple pitches, or the scale of the day.
