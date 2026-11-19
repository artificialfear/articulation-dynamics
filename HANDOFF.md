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
- Articulation lengths and shapes come from Mat's "Note Shapes and Note Lengths" guide (Drive file 15h38mqMMwmSdELsZKgRq--Cfatd0Lpe4) and live in `SHAPE`: tenuto 100% flat, long lifted 75% flat, staccato 50% flat, accent 100% weight+decay, marcato 50% weight+decay. Plain (unmarked) notes use 75%, which Mat chose to match Long Lifted. This also applies to Dynamics mode, except whole notes there sustain 95% (Mat's request). `shapeMarkup()` draws the green bars for both the score and the reference cards.
- Articulation mode uses a VexFlow Formatter with softmaxFactor 150 so note spacing is close to proportional and the shape bars line up with the rhythm.
- Audio: Web Audio, two detuned saws through a lowpass whose cutoff follows loudness. The default pitch is concert F (F4, 349.23 Hz), and the Pitch menu also offers concert B♭ (B♭3). Weight + decay means an attack spike (accent 2.2x, marcato 2.8x) that ramps down to 20% by the end of the sound. Dynamics come from `DYN_GAIN`, and hairpins ramp gain inside each note.
- Settings (mode, clef, tempo, count-off, labels, random pool, theme) are saved in localStorage, so they are per device.

- Rhythm builder (`BUILD`, `canAdd`, `addRhythm`): notes are appended in order. Whole notes must start a measure; half notes and eighth pairs must start on a beat; nothing may cross a barline. A single eighth followed by a quarter allows syncopation. `padRests()` fills unfilled beats with grey rests (a whole rest if the measure is empty). Rests are formatted with the notes but aren't part of the data. Note SVG elements are looked up per note with `getSVGElement()` so rests don't throw off the indexing.

## Open items / ideas for later
- Harder levels: dotted rhythms, sixteenths, rests, ties, slurs, sfz/fp, ppp/fff.
- Quiz mode (name the symbol, or hear it and pick the right one).
- Multiple pitches, or the scale of the day.
