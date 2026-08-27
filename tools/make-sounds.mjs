/* Bakes the app's sounds to real WAV files (modal synthesis, offline).
   Run: node tools/make-sounds.mjs   -> writes snd/*.wav
   Tweak the MODES tables to change the character of anything. */
import fs from 'fs';

const FS = 44100;

/* ---------- deterministic RNG so rebuilds are identical ---------- */
let seed = 20260826;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const jit = a => 1 + (rnd() * 2 - 1) * a;

/* ---------- primitives ---------- */
function modes(buf, table, t0 = 0, pitchDrop = 0, dropTau = 0.05) {
  table.forEach(([f, tau, amp]) => {
    const ph = rnd() * Math.PI * 2;
    let phase = ph;
    for (let n = Math.round(t0 * FS); n < buf.length; n++) {
      const t = (n / FS) - t0;
      const bend = 1 + pitchDrop * Math.exp(-t / dropTau);
      phase += (2 * Math.PI * f * bend) / FS;
      buf[n] += amp * Math.exp(-t / tau) * Math.sin(phase);
    }
  });
}

function noiseBurst(buf, { t0 = 0, tau = 0.003, amp = 1, lp = 6000, hp = 400 }) {
  let ylp = 0, yhp = 0, prev = 0;
  const alp = 1 - Math.exp(-2 * Math.PI * lp / FS);
  const ahp = Math.exp(-2 * Math.PI * hp / FS);
  for (let n = Math.round(t0 * FS); n < buf.length; n++) {
    const t = (n / FS) - t0;
    const x = rnd() * 2 - 1;
    ylp += alp * (x - ylp);                 // one-pole lowpass
    yhp = ahp * (yhp + ylp - prev); prev = ylp;   // one-pole highpass
    buf[n] += amp * Math.exp(-t / tau) * yhp;
  }
}

function finish(buf, peak = 0.92) {
  // de-DC, normalize, soft-clip, 2 ms fade out
  let dc = 0; for (const v of buf) dc += v; dc /= buf.length;
  let mx = 0; for (let i = 0; i < buf.length; i++) { buf[i] -= dc; mx = Math.max(mx, Math.abs(buf[i])); }
  const g = mx > 0 ? peak / mx : 1;
  const fade = Math.round(0.002 * FS);
  for (let i = 0; i < buf.length; i++) {
    let v = Math.tanh(buf[i] * g * 1.1);
    if (i > buf.length - fade) v *= (buf.length - i) / fade;
    buf[i] = v;
  }
  return buf;
}

function wav(buf, path) {
  const d = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) d.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(FS, 24); h.writeUInt32LE(FS * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(d.length, 40);
  fs.writeFileSync(path, Buffer.concat([h, d]));
  return d.length + 44;
}

const blank = sec => new Float64Array(Math.round(sec * FS));

/* ---------- 1. TICK — plastic flapper over a peg, 6 round-robin takes ---------- */
for (let v = 0; v < 6; v++) {
  const b = blank(0.11);          // long enough to decay instead of being cut
  const w = jit(0.07);
  noiseBurst(b, { tau: 0.0018 * jit(0.25), amp: 1.05 * jit(0.15), lp: 7600 * w, hp: 1200 });
  modes(b, [
    [ 232 * w, 0.011 * jit(0.2), 0.55 ],   // the little thump of contact
    [1180 * w, 0.028 * jit(0.2), 1.00 ],
    [2350 * w, 0.019 * jit(0.2), 0.68 ],
    [3810 * w, 0.012 * jit(0.2), 0.42 ],
    [5600 * w, 0.007 * jit(0.2), 0.22 ],
  ]);
  wav(finish(b, 0.80), `snd/tick${v + 1}.wav`);
}

/* ---------- 2. THUNK — the wheel stops dead ---------- */
{
  const b = blank(0.50);
  noiseBurst(b, { tau: 0.006, amp: 0.7, lp: 2600, hp: 120 });
  modes(b, [
    [  78, 0.30, 1.00 ],
    [ 128, 0.22, 0.62 ],
    [ 214, 0.13, 0.38 ],
    [ 393, 0.065, 0.24 ],
    [ 742, 0.028, 0.12 ],
  ], 0, 0.16, 0.045);           // slight pitch drop = weight
  wav(finish(b, 0.95), 'snd/thunk.wav');
}

/* ---------- 3. UNLOCK — a latch letting go ---------- */
{
  const b = blank(0.60);
  noiseBurst(b, { tau: 0.004, amp: 0.5, lp: 5000, hp: 700 });
  modes(b, [[520, 0.05, 0.6], [812, 0.035, 0.4], [1310, 0.02, 0.25]]);       // the latch
  noiseBurst(b, { t0: 0.085, tau: 0.010, amp: 0.55, lp: 3200, hp: 300 });     // the release
  modes(b, [                                                                  // and the body behind it
    [ 110, 0.34, 0.9 ], [ 176, 0.24, 0.5 ], [ 293, 0.14, 0.3 ],
  ], 0.085, 0.10, 0.05);
  wav(finish(b, 0.95), 'snd/unlock.wav');
}

console.log('baked:', fs.readdirSync('snd').sort().join(' '));
