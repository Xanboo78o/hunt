# THE WHEEL

A hunt randomizer that only works outside.

**OBJECT → SPECIES → RULE → MODE**

- **OBJECT** — plant / tree / rock / creature
- **SPECIES** — 12 slices sampled from what actually lives within ~200 miles of you.
  Slice size = real local sighting counts, so the common thing really is the fat slice.
  Plants + creatures from the **iNaturalist** API. Rocks from **Macrostrat** — your real bedrock.
- **RULE** — NIGHT TIME / MORNING / RUN / GOLDEN HOUR / OFF THE PATH / ONE MILE OUT
- **MODE** — CATCH 60% / PHOTOGRAPHY 25% / SPEEDRUN 15%.
  If CATCH lands on something you shouldn't grab (a bird, a mammal, a reptile, or a
  protected species) the app **force-downgrades it to PHOTOGRAPHY on screen.**

Timer runs in the corner from the moment MODE locks, and gets logged with the result.

### The indoor lock
The first wheel won't spin until GPS says you've moved 60 m. There's an override.
Toggle it off in setup if it's ever in your way.

### Sound
Real recordings, not synthesis. Everything comes from **Kenney's CC0 packs** — public
domain, commercial use fine, no attribution required. Provenance is in `snd/CREDITS.txt`.

Only **Casino Audio** and **Impact Sounds** are used: real recorded objects (plastic
chips, cards, wood and metal impacts). Kenney's *Interface Sounds* pack was tried and
pulled — those are synthesized UI blips and the melodic ones sounded fake next to the
rest.

Converted with ffmpeg to mono 44.1 kHz **WAV**, because iOS Safari can't be trusted to
decode Ogg Vorbis. Head silence trimmed, peak-normalised to -1.5 dBFS. Ticks are
hard-trimmed to 140 ms with an 18 ms fade — a longer tick turns to mush once the wheel
is throwing 40 of them a second.

In use: `snd/tick1-6.wav` (round-robin, never the same take twice running),
`snd/thunk.wav`, `snd/unlock.wav`. The tick also gets brighter and thinner the faster
the wheel is going, which is what makes the slowdown feel physical.

**Don't like one? Open `sounds.html`.** Every alternate take is in `snd/lib/` — tap to
hear it, hit SPIN TEST to hear the ticks at real wheel speed (a click that's fine alone
can be awful at 40/sec), then SAVE. Your pick lands in localStorage and the app reads
it on next load. DEFAULTS puts it back.

Note: `navigator.vibrate` is a no-op in iOS Safari, so on the iPad the sound is
carrying all of the feel on its own.

### Tuning
Everything lives in `CFG` at the top of `app.js` — rules, mode weights, slice count,
radius, lock distance. `TREE_GENERA` decides tree vs plant (iNat has no "tree" flag),
so add genera as you notice gaps.

### Needs HTTPS
Geolocation is blocked on plain `http://` except on `localhost`. On your iPad this has
to be served over https, or the location button and the indoor lock both do nothing.
