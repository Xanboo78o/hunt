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

Every target carries a **catalogue number** — `#001` is the most-sighted thing of its
kind within range, counting down from there. Numbered per object type, so there's a
CREATURE #001 and a TREE #001. In Concord NH: creature #001 is the Common Eastern
Bumble Bee, #003 is the American Robin; tree #001 is eastern white pine; rock #001 is
sandstone.

The brief shows **3 photos you can swipe through** (iNaturalist `taxon_photos`), with the
photographer's credit under them — the photos are CC-licensed, so the credit stays on
screen. Rocks have no photos and the strip just hides.

Timer runs in the corner from the moment MODE locks, and gets logged with the result.
Tapping GOT IT or FAILED plays its own sound.

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
`snd/thunk.wav`, `snd/unlock.wav`, `snd/win.wav` (a real bell), `snd/lose.wav`. The tick also gets brighter and thinner the faster
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
