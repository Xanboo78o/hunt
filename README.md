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
Real sample files in `snd/`, not runtime synthesis. They're baked offline by
`node tools/make-sounds.mjs` (modal synthesis → WAV, fixed seed so rebuilds are
identical). Six round-robin takes of the tick so it never repeats back to back, and the
tick gets brighter and thinner the faster the wheel is going. Edit the mode tables in
that script to change the character of anything, then re-run it.

Note: `navigator.vibrate` is a no-op in iOS Safari, so on the iPad the sound is
carrying all of the feel on its own.

### Tuning
Everything lives in `CFG` at the top of `app.js` — rules, mode weights, slice count,
radius, lock distance. `TREE_GENERA` decides tree vs plant (iNat has no "tree" flag),
so add genera as you notice gaps.

### Needs HTTPS
Geolocation is blocked on plain `http://` except on `localhost`. On your iPad this has
to be served over https, or the location button and the indoor lock both do nothing.
