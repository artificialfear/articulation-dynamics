# Changelog

## 2.4.3 — 2026-11-20
- New sound option in ⚙ Settings → Sound: **Synth (octaves)**. Each note plays with the octave below it. Articulations, dynamics, hairpins, and fp all shape it the same way.

## 2.4.2 — 2026-11-20
- **fp** now plays as two events: it holds forte for about half a beat (0.25–0.45 s, depending on tempo), then drops quickly to piano. A crescendo after it starts from that piano.

## 2.4.1 — 2026-11-20
- Dynamics Warm-up now plays in time, with no fermatas:
  - **#1 Dynamic ladder** (top two lines): each level is a half note followed by a half rest, pp → ff → pp, ending on a pp whole note.
  - **#2 Dynamic shapes** (bottom two lines): fp < f, f > p, p < f > p.
- Choose **#1, #2, or Both** in the warm-up panel or on the Presentation bar (and the agenda board). Play plays what's shown.
- **ff** is drawn with the two f's closer together.
- The "loudness" label sits above the lane so it never covers a bar.

## 2.4.0 — 2026-11-20
- **Dynamics Warm-up** (Dynamics tab → 🎯 Warm-up, built from Mat's example):
  - **Dynamic ladder:** fermata half notes pp → p → mp → mf → f → ff → f → mf → mp → p → pp.
  - **Dynamic shapes:** fp < f, f > p, and p < f > p on tied whole notes.
- Play the whole warm-up or just one section. Fermata hold: +0 / 1 / 2 / 4 beats.
- The metronome pauses during holds, and the cursor moves through all four lines.
- Pitch: concert F (or B♭ when Settings is on single B♭), in each student's written key.
- On the agenda board and in Presentation mode, Dynamics has a 🎯 Warm-up / 🎲 Random button.
- New marking **fp** (forte-piano): a loud attack, then soft right away. It's in the dynamics palette and the symbol guide.

## 2.3.0 — 2026-11-20
- **Agenda board mode** (`?board=1&mode=art|dyn&lvl=6beg|6int|7th|8th&seed=…`): opens straight into Presentation mode as "Articulation of the Day" or "Dynamics of the Day."
  - Uses the class's level and the same example all day for that class.
  - Whole band on the middle line, played on concert F.
  - Saves nothing on the board.
  - The bar adds an Articulation ⇄ Dynamics switch, tempo − / +, and "Back to agenda."
- **Class levels:**
  - 6 Beg: four quarters; staccato, tenuto, and accent; dynamics p–f with no eighths.
  - 6 Int: adds marcato and rests.
  - 7th: adds ties and pp–ff.
  - 8th: adds Long Lifted.
- Presentation mode now has tempo − / + for everyone.

## 2.2.0 — 2026-11-19
- **🎤 Check my playing** (Articulation mode):
  - After a count-off, play the measure into the mic. The app measures how long each note sounded and compares it to the Note Shapes guide.
  - Each note gets "In shape" (within ±15%), "Too long", "Too short", or "Not heard". A blue bar under each green shape shows how long the note actually sounded.
  - It measures note length only, not attack weight.

## 2.1.0 — 2026-11-19
- **Listening Quiz** tab (Articulations or Dynamics):
  - **Name it:** markings are hidden behind "?" marks. Listen and name each note's articulation.
  - **Spot the mistake:** one note (or one dynamic spot) is played differently than written. Find it.
  - **Which one?** Three versions are shown as A/B/C; pick the one being played. The dynamics versions always differ in shape (louder vs. softer, gradual vs. sudden), not just starting level.
- Each question type has two modes:
  - **Whole class:** answers out loud, then Reveal (R, or the Present bar). Works in Presentation mode.
  - **On my own:** tap answers on your device, with a running score and streak.

## 2.0.0 — 2026-11-19
- **Instrument picker:** each student picks their instrument and sees the music in their written key, while playback sounds in concert pitch. Concert-pitch treble and bass options are there for the viewboard, plus Percussion (snare) and Mallets.
- **Pitch patterns** (⚙ Settings): single concert F or B♭, the concert B♭, F, and E♭ scales, and Remington long tones. Scales show the written key signature, and every instrument stays in a normal middle school range.
- **Rests, slurs, and ties:**
  - Random examples can include them; turn each on or off in Settings.
  - The rhythm builder has rest buttons.
  - Any note can get "Slur to next" or "Tie to next" (keys S / T) and can be moved up or down with ▲▼ or the arrow keys.
  - In playback, slurred notes connect with no new attack, and tied notes sound as one note.
- **Real instrument sounds** for every instrument, with Simple synth available in Settings.
- **Loudness lane** in Dynamics mode: a green shape under the music shows how loud each note should be.
- **Share links:** 🔗 Share copies a link to the exact example, and it opens in each student's own key. Good for Brightspace.
- **Presentation mode** (📽 Present or P): only the music fills the screen, with a floating Play / New / Reveal bar. Reveal (R) shows the shape bars and names.
- **New look:**
  - Raven Band logo and a dark header.
  - Settings moved into a ⚙ drawer.
  - The symbol guide is collapsed by default and adds slur, tie, and loudness cards.

## 1.4.0 — 2026-11-19
- New Full Screen button (top right) or press F. In full screen the music stretches to the full width of the screen. Press Esc, F, or "Exit Full Screen" to leave.

## 1.3.0 — 2026-11-19
- Dynamics mode: every note now sustains for 95% of its value.
- New Metronome option: clicks on every beat during playback, with a stronger click on beat 1 of each measure. It's softer than the count-off.
- New Cursor option: a pink line sweeps through the music in time with playback and lands on each note as it sounds.
- Both are on by default and can be turned off with checkboxes next to Count-off. The setting is saved on each device.

## 1.2.1 — 2026-11-19
- Dynamics mode: whole notes now sustain for 95% of their length. Other notes stay at 75%.

## 1.2.0 — 2026-11-19
- New "Build your own rhythm" panel in both modes.
  - Articulation mode: quarter, eighth, and eighth pair. Dynamics mode adds whole and half.
  - Empty beats show as grey rests. A note value that won't fit is greyed out.
  - Undo and Start over buttons.
  - When the measure is full, tap notes or press Randomize to add markings.
- Notes with no marking now play at 75% sound / 25% space (same as Long Lifted). This includes every note in Dynamics mode.

## 1.1.0 — 2026-11-19
- Playback now defaults to concert F, with a Pitch menu to switch to concert B♭.
- Articulations now follow the Raven Band "Note Shapes and Note Lengths" guide. Tenuto is 100% sound, Long Lifted 75%, Staccato 50%. Accent is 100% with weight + decay, and Marcato is 50% with weight + decay. Playback matches each shape.
- New articulation: Long Lifted (dot + line). It's off in random mode until you check it.
- "Show note shapes" draws the guide's green sound/space bar under every note. The notes are spaced to match the rhythm so the bars line up.
- The reference cards show each shape bar, and there's a new Note Shapes card (beginning, middle, end).

## 1.0.0 — 2026-11-19
- Articulation mode: one 4/4 measure of quarters and eighths with staccato, tenuto, accent, and marcato. Tap a note to set its articulation, or randomize. Random examples always use every articulation turned on under "Random mode uses."
- Dynamics mode: two measures of whole, half, quarter, and eighth notes with random dynamics (pp to ff) plus crescendos and decrescendos. Tap a note to set its dynamic or start a hairpin there.
- Playback on concert Bb with a tempo slider and an optional count-off. The note being played lights up.
- Treble, bass, and percussion clef. "Show names" labels. Reference cards. Light and dark themes.
