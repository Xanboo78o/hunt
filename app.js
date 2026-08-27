/* ============================================================
   THE WHEEL  —  a hunt randomizer that only works outside
   chain: OBJECT -> SPECIES -> MODE
   ============================================================ */

const CFG = {
  OBJECTS: ['PLANT', 'TREE', 'ROCK', 'CREATURE'],

  // weights are drawn as real slice sizes. CATCH is 60% of the wheel.
  MODES: [
    { name: 'CATCH',       w: 60 },
    { name: 'PHOTOGRAPHY', w: 25 },
    { name: 'SPEEDRUN',    w: 15 },
  ],

  SLICES: 12,            // species wheel slices — 400 names is unfilmable
  RADIUS_KM: 200,        // iNat caps a single query here
  UNION_OFFSET_KM: 180,  // + 4 offset queries ≈ 200 mile reach
  INDOOR_LOCK_M: 60,
};

// genus list decides TREE vs PLANT (iNat has no "tree" flag). Extend it any time.
const TREE_GENERA = new Set(('Acer Quercus Pinus Betula Populus Fagus Fraxinus Tsuga Picea Abies Thuja ' +
  'Ulmus Tilia Prunus Malus Salix Carya Juglans Platanus Robinia Larix Juniperus Castanea Ostrya ' +
  'Carpinus Nyssa Liriodendron Sassafras Amelanchier Hamamelis Rhus Cornus Sorbus Pyrus Crataegus ' +
  'Alnus Chamaecyparis Catalpa Gleditsia Celtis Magnolia Aesculus Ailanthus Morus Ginkgo Cercis Ilex'
).split(' '));

const CATCHABLE_TAXA = new Set(['Insecta', 'Arachnida', 'Mollusca', 'Amphibia', 'Actinopterygii', 'Animalia', 'Plantae', 'Fungi', 'Rock']);

/* ---------------- storage ---------------- */
const DB = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('wheel.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wheel.' + k, JSON.stringify(v)); } catch {} },
};

let S = {
  loc: DB.get('loc', null),          // {lat,lng,label}
  hunts: DB.get('hunts', []),
  active: DB.get('active', null),    // in-progress hunt
  stage: 0,
  picked: {},
  pool: null,
  moved: 0,
  unlocked: false,
};

/* ---------------- tiny helpers ---------------- */
const $ = s => document.querySelector(s);
const show = (...ids) => { ['#setup', '#chain', '#brief', '#log'].forEach(i => $(i).classList.add('hidden')); ids.forEach(i => $(i).classList.remove('hidden')); };
const pad = n => String(n).padStart(2, '0');
const fmtTime = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

function dayNumber() {
  const days = new Set(S.hunts.map(h => h.date));
  days.add(todayKey());
  return days.size;
}

/* ---------------- sound (real samples — see tools/make-sounds.mjs) ---------------- */
const SND_DEFAULTS = {
  tick: [1, 2, 3, 4, 5, 6].map(i => `snd/tick${i}.wav`),
  thunk: ['snd/thunk.wav'], unlock: ['snd/unlock.wav'],
  win: ['snd/win.wav'], lose: ['snd/lose.wav'],
};
const SND_PICK = DB.get('sndPick', null);   // set by sounds.html; null = the defaults
const SND_FILES = SND_PICK && SND_PICK.tick && SND_PICK.tick.length
  ? { tick: SND_PICK.tick, thunk: [SND_PICK.thunk], unlock: [SND_PICK.unlock],
      win: [SND_PICK.win || 'snd/win.wav'], lose: [SND_PICK.lose || 'snd/lose.wav'] }
  : SND_DEFAULTS;
const SND = { tick: [], thunk: [], unlock: [], win: [], lose: [] };
let AC = null, rawSnd = null, decoded = false;

// grab the bytes at boot; decoding waits for the first gesture (iOS)
function prefetchSounds() {
  const one = u => fetch(u).then(r => r.arrayBuffer()).catch(() => null);
  rawSnd = {};
  for (const k in SND_FILES) rawSnd[k] = Promise.all(SND_FILES[k].map(one));
}

function audioUnlock() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (!AC) return;
  if (AC.state === 'suspended') AC.resume();
  if (decoded || !rawSnd) return;
  decoded = true;
  const decode = list => Promise.all(list.map(b => b ? AC.decodeAudioData(b).catch(() => null) : null));
  for (const k of Object.keys(rawSnd)) {
    rawSnd[k].then(decode).then(async bufs => {
      SND[k] = bufs.filter(Boolean);
      if (SND[k].length) return;
      // a saved pick can point at a file that no longer exists — fall back rather than go silent
      const raw = await Promise.all(SND_DEFAULTS[k].map(u => fetch(u).then(r => r.arrayBuffer()).catch(() => null)));
      SND[k] = (await decode(raw)).filter(Boolean);
    });
  }
}

const lastTake = {};
function play(bank, rate = 1, gain = 1) {
  const list = SND[bank];
  if (!AC || !list || !list.length) return;
  let i = 0;
  if (list.length > 1) {                      // round-robin, never the same take twice running
    do { i = Math.floor(Math.random() * list.length); } while (i === lastTake[bank]);
    lastTake[bank] = i;
  }
  const src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = list[i];
  src.playbackRate.value = rate;
  g.gain.value = gain;
  src.connect(g); g.connect(AC.destination);
  src.start();
}

// a real wheel ticks brighter and thinner the faster it goes
let lastTickAt = 0;
function playTick(speed) {
  const now = performance.now();
  if (now - lastTickAt < 9) return;      // don't let it turn to mush
  lastTickAt = now;
  const fast = Math.min(1, speed / 20);
  play('tick', 0.94 + Math.random() * 0.12 + fast * 0.16, 0.78 - fast * 0.34);
}

const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

/* ============================================================
   WHEEL
   ============================================================ */
const cv = $('#wheel'), ctx = cv.getContext('2d');
const PALETTE = ['#ff4d1c', '#22d3ee', '#c8ff2e', '#ffc233', '#f45d9e', '#7c5cff', '#25c26a', '#ff8a3d', '#4aa8ff', '#e5e0d5', '#b8ff8a', '#ff6b6b'];

function darker(hex, amt = 0.24) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

const W = { items: [], arcs: [], rot: 0, vel: 0, spinning: false, done: false, lastSlice: -1, onDone: null };

function loadWheel(items, onDone) {
  W.items = items;
  const total = items.reduce((a, i) => a + (i.w || 1), 0);
  let acc = 0;
  W.arcs = items.map(i => {
    const start = acc / total * Math.PI * 2;
    acc += (i.w || 1);
    return { start, end: acc / total * Math.PI * 2 };
  });
  W.rot = Math.random() * Math.PI * 2;
  W.vel = 0; W.spinning = false; W.done = false; W.lastSlice = -1; W.onDone = onDone;
  $('#spinHint').classList.remove('hidden');
  drawWheel();
}

function drawWheel() {
  const D = cv.width, R = D / 2, cx = R, cy = R;
  ctx.clearRect(0, 0, D, D);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(W.rot);

  W.arcs.forEach((a, i) => {
    const col = PALETTE[i % PALETTE.length];
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, R - 8, a.start, a.end); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = darker(col); ctx.stroke();

    // label — skip slivers that can't hold text
    const span = a.end - a.start;
    if (span > 0.075) {
      const mid = (a.start + a.end) / 2;
      let abs = (mid + W.rot) % (Math.PI * 2);
      if (abs < 0) abs += Math.PI * 2;
      const flip = abs > Math.PI / 2 && abs < Math.PI * 1.5;   // left half — read it the other way

      ctx.save();
      ctx.rotate(mid);
      if (flip) ctx.rotate(Math.PI);
      ctx.textAlign = flip ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = darker(col, 0.72);
      const size = Math.max(15, Math.min(34, span * 150 + 15));
      ctx.font = `${size}px Anton, Impact, sans-serif`;
      const full = W.items[i].label.toUpperCase();
      let t = full;
      const max = R - 104;   // stop clear of the hub
      while (ctx.measureText(t).width > max && t.length > 4) t = t.slice(0, -2);
      if (t !== full) t += '…';
      ctx.fillText(t, flip ? -(R - 30) : R - 30, 0);
      ctx.restore();
    }
  });

  ctx.restore();
  // hub
  ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = '#f4ede1'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#b8ada0'; ctx.stroke();
}

function sliceAtPointer() {
  let a = (-Math.PI / 2 - W.rot) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  for (let i = 0; i < W.arcs.length; i++) if (a >= W.arcs[i].start && a < W.arcs[i].end) return i;
  return W.arcs.length - 1;
}

/* flick physics */
let drag = null;
function angleOf(e) {
  const r = cv.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
}
cv.addEventListener('pointerdown', e => {
  audioUnlock();
  if (W.done || !S.unlocked) return;
  cv.setPointerCapture(e.pointerId);
  drag = { a: angleOf(e), t: performance.now(), v: 0 };
  W.vel = 0; W.spinning = false;
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const a = angleOf(e), now = performance.now();
  let d = a - drag.a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const dt = Math.max(1, now - drag.t) / 1000;
  drag.v = drag.v * 0.55 + (d / dt) * 0.45;
  W.rot += d; drag.a = a; drag.t = now;
  tickCheck(); drawWheel();
});
cv.addEventListener('pointerup', () => {
  if (!drag) return;
  let v = drag.v;
  drag = null;
  if (Math.abs(v) < 3) v = (Math.random() < 0.5 ? -1 : 1) * (11 + Math.random() * 8); // a tap still throws it
  W.vel = Math.max(-26, Math.min(26, v));
  W.spinning = true;
  $('#spinHint').classList.add('hidden');
});

function tickCheck() {
  const s = sliceAtPointer();
  if (s !== W.lastSlice) { W.lastSlice = s; playTick(Math.abs(W.vel)); buzz(8); }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (W.spinning) {
    W.rot += W.vel * dt;
    W.vel *= Math.pow(0.32, dt);          // friction
    if (Math.abs(W.vel) < 0.22) {
      W.vel = 0; W.spinning = false; W.done = true;
      play('thunk', 0.97 + Math.random() * 0.06, 0.95); buzz([30, 40, 90]);
      const i = sliceAtPointer();
      setTimeout(() => W.onDone && W.onDone(W.items[i], i), 520);
    }
    tickCheck(); drawWheel();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ============================================================
   DATA — real species, real bedrock
   ============================================================ */
const CREATURE_TAXA = 'Aves,Mammalia,Reptilia,Amphibia,Actinopterygii,Mollusca,Arachnida,Insecta,Animalia';

async function jget(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}

function offsets(lat, lng) {
  const dLat = CFG.UNION_OFFSET_KM / 111;
  const dLng = CFG.UNION_OFFSET_KM / (111 * Math.cos(lat * Math.PI / 180) || 1);
  return [[lat, lng], [lat + dLat, lng], [lat - dLat, lng], [lat, lng + dLng], [lat, lng - dLng]];
}

async function fetchLife(lat, lng, taxa) {
  const key = `pool.${lat.toFixed(2)},${lng.toFixed(2)}.${taxa}`;
  const cached = DB.get(key, null);
  if (cached) return cached;

  const map = new Map();
  const jobs = offsets(lat, lng).map(([a, b]) =>
    jget(`https://api.inaturalist.org/v1/observations/species_counts?lat=${a.toFixed(4)}&lng=${b.toFixed(4)}` +
         `&radius=${CFG.RADIUS_KM}&iconic_taxa=${taxa}&per_page=200&quality_grade=research&captive=false`)
      .catch(() => null));

  for (const res of await Promise.all(jobs)) {
    if (!res) continue;
    for (const r of res.results) {
      const t = r.taxon; if (!t || !t.name) continue;
      const prev = map.get(t.id);
      if (prev) { prev.w += r.count; continue; }
      map.set(t.id, {
        id: t.id,
        w: r.count,
        sci: t.name,
        label: t.preferred_common_name || t.name,
        taxon: t.iconic_taxon_name || 'Animalia',
        threatened: !!t.threatened,
        photo: t.default_photo ? t.default_photo.medium_url : null,
      });
    }
  }
  const out = [...map.values()].sort((a, b) => b.w - a.w);
  if (out.length) DB.set(key, out);
  return out;
}

function ringPoints(lat, lng) {
  const pts = [[lat, lng]];
  const push = (km, n, phase) => {
    for (let i = 0; i < n; i++) {
      const a = phase + i * (Math.PI * 2 / n);
      const dLat = (km * Math.cos(a)) / 111;
      const dLng = (km * Math.sin(a)) / (111 * Math.cos(lat * Math.PI / 180) || 1);
      pts.push([lat + dLat, lng + dLng]);
    }
  };
  push(160, 8, 0);
  push(300, 4, Math.PI / 8);
  return pts;
}

async function fetchRock(lat, lng) {
  const key = `rock.${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = DB.get(key, null);
  if (cached) return cached;

  const jobs = ringPoints(lat, lng).map(([a, b]) =>
    jget(`https://macrostrat.org/api/v2/geologic_units/map?lat=${a.toFixed(4)}&lng=${b.toFixed(4)}`).catch(() => null));

  const map = new Map();
  for (const res of await Promise.all(jobs)) {
    const units = (res && res.success && res.success.data) || [];
    units.forEach(u => {
      // "Major:{granofels,biotite schist}, Incidental:{calc silicate rock}"
      const re = /(Major|Minor|Incidental):\{([^}]*)\}/g;
      let m;
      while ((m = re.exec(u.lith || '')) !== null) {
        const w = m[1] === 'Major' ? 6 : m[1] === 'Minor' ? 3 : 1;
        m[2].split(',').map(x => x.trim()).filter(Boolean).forEach(name => {
          const k = name.toLowerCase();
          const prev = map.get(k);
          if (prev) { prev.w += w; return; }
          map.set(k, { w, label: name, sci: u.strat_name || u.name || '', taxon: 'Rock',
                       note: u.t_int_name || '' });
        });
      }
    });
  }

  const out = [...map.values()].sort((a, b) => b.w - a.w);
  if (out.length) DB.set(key, out);
  return out;
}

async function getPool(object) {
  const { lat, lng } = S.loc;
  if (object === 'ROCK') return fetchRock(lat, lng);
  if (object === 'CREATURE') return fetchLife(lat, lng, CREATURE_TAXA);
  const plants = await fetchLife(lat, lng, 'Plantae');
  const isTree = p => TREE_GENERA.has((p.sci || '').split(' ')[0]);
  return object === 'TREE' ? plants.filter(isTree) : plants.filter(p => !isTree(p));
}

/* ============================================================
   THE DEX — Pokedex rules. An ID is handed out the first time you
   meet something and is yours forever, in the order you met it.
   Nothing ever renumbers. Lives in localStorage under wheel.dex.
   ============================================================ */
const DEX_SEED = [
  { key: 'inat:12727', no: 1, name: 'American Robin', sci: 'Turdus migratorius', object: 'CREATURE' },
];

const catNo = n => '#' + String(n || 0).padStart(3, '0');
const dexKey = item => (item.id ? 'inat:' + item.id : 'rock:' + (item.label || '').toLowerCase());

function getDex() {
  let dex = DB.get('dex', null);
  if (!dex) {
    dex = {};
    DEX_SEED.forEach(e => { dex[e.key] = { no: e.no, name: e.name, sci: e.sci, object: e.object, got: false, first: null }; });
    DB.set('dex', dex);
  }
  return dex;
}

// first sighting claims the next free number
function dexAssign(item, object) {
  const dex = getDex(), key = dexKey(item);
  if (dex[key]) return { ...dex[key], isNew: false };
  const next = Object.values(dex).reduce((m, e) => Math.max(m, e.no), 0) + 1;
  dex[key] = { no: next, name: item.label, sci: item.sci || '', object, got: false, first: todayKey() };
  DB.set('dex', dex);
  return { ...dex[key], isNew: true };
}

function dexCaught(key) {
  const dex = getDex();
  if (!dex[key]) return;
  dex[key].got = true;
  DB.set('dex', dex);
}

const dexCount = () => Object.keys(getDex()).length;
const dexCaughtCount = () => Object.values(getDex()).filter(e => e.got).length;

/* weighted sample without replacement — sqrt weighting lets rarities onto the wheel */
function sample(pool, n) {
  const src = pool.map(p => ({ ...p, raw: p.w, k: Math.pow(p.w, 0.5) * (0.35 + Math.random()) }));
  src.sort((a, b) => b.k - a.k);
  const picked = src.slice(0, Math.min(n, src.length));
  picked.forEach(p => { p.w = Math.pow(p.raw, 0.55); });   // fat stays fat, sliver stays visible
  // shuffle so the fat slice isn't always first
  for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
  return picked;
}

function rarityTier(item, pool) {
  if (!pool || !pool.length || item.taxon === 'Rock') return '';
  const rank = pool.findIndex(p => p.sci === item.sci && p.label === item.label);
  const pct = Math.max(0, rank) / pool.length;
  const tier = pct < 0.1 ? 'COMMON' : pct < 0.4 ? 'UNCOMMON' : pct < 0.8 ? 'RARE' : 'NEEDLE IN A HAYSTACK';
  return `${(item.raw ?? item.w).toLocaleString()} sightings in range · ${tier}`;
}

/* ============================================================
   THE CHAIN
   ============================================================ */
const STAGES = ['OBJECT', 'SPECIES', 'MODE'];

function crumbs() {
  const b = $('#breadcrumb'); b.innerHTML = '';
  STAGES.forEach(s => {
    if (S.picked[s] === undefined) return;
    const d = document.createElement('div');
    d.className = 'crumb';
    d.innerHTML = `${s} <b>${S.picked[s].label.toUpperCase()}</b>`;
    b.appendChild(d);
  });
}

async function runStage() {
  const stage = STAGES[S.stage];
  $('#stageLabel').textContent = stage;
  $('#loadNote').textContent = '';
  crumbs();

  if (stage === 'OBJECT') {
    loadWheel(CFG.OBJECTS.map(o => ({ label: o, w: 1 })), pick);

  } else if (stage === 'SPECIES') {
    $('#loadNote').textContent = 'reading the last 200 miles…';
    loadWheel([{ label: '…', w: 1 }], () => {});
    try {
      S.pool = await getPool(S.picked.OBJECT.label);
    } catch (e) {
      $('#loadNote').textContent = 'no signal — retrying in 4s…';
      setTimeout(runStage, 4000);
      return;
    }
    if (!S.pool.length) {
      $('#loadNote').textContent = `nothing on record for ${S.picked.OBJECT.label} here. respinning OBJECT.`;
      S.stage = 0; setTimeout(runStage, 1600); return;
    }
    $('#loadNote').textContent = `${S.pool.length} on record here · showing ${Math.min(CFG.SLICES, S.pool.length)}`;
    loadWheel(sample(S.pool, CFG.SLICES), pick);

  } else {
    loadWheel(CFG.MODES.map(m => ({ label: m.name, w: m.w })), pick);
  }
}

const PROTECTED = /endangered|threatened|special concern|protected|vulnerable|imperiled|rare/i;

// one call gets both the photo set and the conservation status
async function taxonDetail(taxonId) {
  const empty = { photos: [], protected: false };
  if (!taxonId) return empty;
  try {
    const j = await jget(`https://api.inaturalist.org/v1/taxa/${taxonId}`);
    const t = j.results && j.results[0];
    if (!t) return empty;
    const names = (t.conservation_statuses || []).map(c => c.status_name || '').join(' ');
    const codes = (t.conservation_statuses || []).map(c => (c.status || '').toUpperCase());
    const photos = (t.taxon_photos || []).slice(0, 3).map(p => ({
      url: p.photo.medium_url,
      credit: p.photo.attribution || '',
    }));
    if (!photos.length && t.default_photo) photos.push({ url: t.default_photo.medium_url, credit: t.default_photo.attribution || '' });
    return {
      photos,
      protected: PROTECTED.test(names) || codes.some(c => /^S[12]|^N[12]|^G[12]|^EN$|^CR$|^VU$|^T$|^E$/.test(c)),
    };
  } catch { return empty; }
}

function pick(item) {
  S.picked[STAGES[S.stage]] = item;
  crumbs();
  S.stage++;
  if (S.stage < STAGES.length) setTimeout(runStage, 420);
  else setTimeout(startHunt, 500);
}

/* ---------------- the brief ---------------- */
async function startHunt() {
  const sp = S.picked.SPECIES, mode = S.picked.MODE.label;
  let final = mode, why = '';

  const detail = await taxonDetail(sp.id);
  const dex = dexAssign(sp, S.picked.OBJECT.label);
  if (mode === 'CATCH') {
    if (!CATCHABLE_TAXA.has(sp.taxon)) {
      final = 'PHOTOGRAPHY'; why = `${sp.taxon.toLowerCase()} — not something you catch with hands`;
    } else if (detail.protected) {
      final = 'PHOTOGRAPHY'; why = 'protected species — you do not touch this one';
    }
  }

  S.active = {
    date: todayKey(),
    day: dayNumber(),
    started: Date.now(),
    object: S.picked.OBJECT.label,
    name: sp.label, sci: sp.sci, taxon: sp.taxon,
    no: dex.no, isNew: dex.isNew, dexKey: dexKey(sp),
    photos: detail.photos.length ? detail.photos : (sp.photo ? [{ url: sp.photo, credit: '' }] : []),
    rarity: rarityTier(sp, S.pool),
    mode: final, rolled: mode, downgraded: final !== mode, why,
  };
  DB.set('active', S.active);
  renderBrief();
}

function renderBrief() {
  const h = S.active;
  $('#briefKind').textContent = h.object;
  $('#briefNo').innerHTML = catNo(h.no) + (h.isNew ? ' <span class="newtag">NEW</span>' : '');
  $('#briefName').textContent = h.name.toUpperCase();
  $('#briefSci').textContent = h.sci || '';
  $('#briefRarity').textContent = h.rarity || '';
  buildStrip(h.photos || []);
  $('#briefMode').textContent = h.mode;

  const dg = $('#downgrade');
  if (h.downgraded) { dg.classList.remove('hidden'); dg.querySelector('.dg-why').textContent = h.why; }
  else dg.classList.add('hidden');

  show('#brief');
  startTimer();
}

/* swipeable photo strip — iNat photos are CC, so the credit stays on screen */
function buildStrip(photos) {
  const strip = $('#strip'), scroll = $('#stripScroll'), dots = $('#stripDots'), credit = $('#stripCredit');
  scroll.innerHTML = ''; dots.innerHTML = '';
  if (!photos.length) { strip.classList.add('hidden'); return; }
  strip.classList.remove('hidden');

  photos.forEach((p, i) => {
    const img = document.createElement('img');
    img.src = p.url; img.alt = ''; img.loading = i ? 'lazy' : 'eager';
    scroll.appendChild(img);
    const d = document.createElement('div');
    d.className = 'dot' + (i ? '' : ' on');
    dots.appendChild(d);
  });
  dots.classList.toggle('hidden', photos.length < 2);
  credit.textContent = photos[0].credit;

  let raf = 0;
  scroll.onscroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.max(0, Math.min(photos.length - 1, Math.round(scroll.scrollLeft / scroll.clientWidth)));
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
      credit.textContent = photos[i].credit;
    });
  };
}

/* ---------------- timer ---------------- */
let tick = null;
function startTimer() {
  $('#timer').classList.remove('hidden');
  clearInterval(tick);
  tick = setInterval(() => {
    if (!S.active) return;
    $('#timer').textContent = fmtTime((Date.now() - S.active.started) / 1000);
  }, 250);
}
function stopTimer() { clearInterval(tick); $('#timer').classList.add('hidden'); }

function endHunt(outcome) {
  if (!S.active) return;
  if (outcome === 'got') dexCaught(S.active.dexKey);
  play(outcome === 'got' ? 'win' : 'lose', 1, 0.95);
  buzz(outcome === 'got' ? [40, 50, 40, 50, 160] : [180]);
  const h = { ...S.active, outcome, seconds: Math.round((Date.now() - S.active.started) / 1000) };
  S.hunts.unshift(h);
  DB.set('hunts', S.hunts);
  S.active = null; DB.set('active', null);
  stopTimer();
  renderLog();
  show('#log');
}

/* ---------------- field log ---------------- */
function renderLog() {
  $('#dayCount').textContent = 'DAY ' + dayNumber();
  const got = S.hunts.filter(h => h.outcome === 'got').length;
  const days = new Set(S.hunts.map(h => h.date)).size;
  $('#logStats').innerHTML = `
    <div class="stat"><b>${dexCount()}</b><span>IN THE DEX</span></div>
    <div class="stat"><b>${dexCaughtCount()}</b><span>GOT</span></div>
    <div class="stat"><b>${days}</b><span>DAYS OUT</span></div>
    <div class="stat"><b>${S.hunts.length}</b><span>HUNTS</span></div>`;

  const list = $('#logList');
  if (!S.hunts.length) { list.innerHTML = `<div class="empty">nothing yet.<br>day one is you walking out the door.</div>`; return; }
  list.innerHTML = S.hunts.map(h => `
    <div class="entry">
      <div class="e-day">D${h.day}</div>
      <div class="e-mid">
        <div class="e-name"><span class="e-no">${catNo(h.no)}</span> ${h.name}</div>
        <div class="e-meta">${h.mode}${h.downgraded ? ' (dgr)' : ''} · ${h.object || ''} · ${fmtTime(h.seconds || 0)}</div>
      </div>
      <div class="e-res ${h.outcome === 'got' ? 'ok' : 'no'}">${h.outcome === 'got' ? 'GOT' : 'MISS'}</div>
    </div>`).join('');
}

/* ============================================================
   LOCATION + THE INDOOR LOCK
   ============================================================ */
async function reverseName(lat, lng) {
  try {
    const j = await jget(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    return [j.city || j.locality, j.principalSubdivisionCode || j.principalSubdivision].filter(Boolean).join(', ');
  } catch { return `${lat.toFixed(2)}, ${lng.toFixed(2)}`; }
}

function setLoc(lat, lng, label) {
  S.loc = { lat, lng, label };
  DB.set('loc', S.loc);
  $('#place').textContent = label;
}

$('#useGps').onclick = () => {
  $('#setupStatus').textContent = 'asking for your location…';
  navigator.geolocation.getCurrentPosition(async p => {
    const { latitude: lat, longitude: lng } = p.coords;
    setLoc(lat, lng, await reverseName(lat, lng));
    beginChain();
  }, e => { $('#setupStatus').textContent = 'location denied — type a town instead'; }, { enableHighAccuracy: true, timeout: 15000 });
};

$('#useManual').onclick = async () => {
  const q = $('#manualPlace').value.trim();
  if (!q) return;
  $('#setupStatus').textContent = 'finding it…';
  try {
    const j = await jget(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
    if (!j.length) { $('#setupStatus').textContent = "couldn't find that place"; return; }
    setLoc(parseFloat(j[0].lat), parseFloat(j[0].lon), j[0].display_name.split(',').slice(0, 2).join(',').trim());
    beginChain();
  } catch { $('#setupStatus').textContent = 'lookup failed — try again'; }
};

$('#indoorLock').onchange = e => DB.set('lockOn', e.target.checked);
$('#killLock').onclick = () => unlock(true);

let watchId = null, anchor = null;
function haversine(a, b, c, d) {
  const R = 6371000, p = Math.PI / 180;
  const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function armLock() {
  S.unlocked = false;
  $('#lockNotice').classList.remove('hidden');
  $('#wheelWrap').style.opacity = .25;
  $('#lockNeed').textContent = CFG.INDOOR_LOCK_M;
  if (!navigator.geolocation) return unlock(true);
  watchId = navigator.geolocation.watchPosition(p => {
    const { latitude: la, longitude: lo, accuracy } = p.coords;
    if (accuracy > 60) return;                 // ignore garbage fixes
    if (!anchor) { anchor = [la, lo]; return; }
    S.moved = Math.max(S.moved, haversine(anchor[0], anchor[1], la, lo));
    const pct = Math.min(1, S.moved / CFG.INDOOR_LOCK_M);
    $('#lockFill').style.width = (pct * 100) + '%';
    $('#lockNow').textContent = Math.round(S.moved);
    if (pct >= 1) unlock();
  }, () => unlock(true), { enableHighAccuracy: true, maximumAge: 0 });
}

function unlock(forced) {
  if (S.unlocked) return;
  S.unlocked = true;
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  $('#lockNotice').classList.add('hidden');
  $('#wheelWrap').style.opacity = 1;
  if (!forced) { play('unlock', 1, 0.95); buzz([40, 60, 40, 60, 120]); }
}

/* ============================================================
   FLOW
   ============================================================ */
function beginChain() {
  S.stage = 0; S.picked = {}; S.pool = null; S.moved = 0; anchor = null;
  show('#chain');
  renderLog();
  runStage();
  if (DB.get('lockOn', true)) armLock(); else unlock(true);
}

$('#logBtn').onclick = () => { renderLog(); show('#log'); };
$('#closeLog').onclick = () => { if (S.active) renderBrief(); else if (S.loc) beginChain(); else show('#setup'); };
$('#newHunt').onclick = () => S.loc ? beginChain() : show('#setup');
$('#foundIt').onclick = () => endHunt('got');
$('#missedIt').onclick = () => endHunt('missed');
$('#abandon').onclick = () => { S.active = null; DB.set('active', null); stopTimer(); beginChain(); };
$('#wipe').onclick = () => { if (confirm('erase every hunt?')) { localStorage.clear(); location.reload(); } };
document.addEventListener('pointerdown', audioUnlock, { once: true });

/* boot */
prefetchSounds();
$('#lockMeters').textContent = CFG.INDOOR_LOCK_M;
$('#indoorLock').checked = DB.get('lockOn', true);
renderLog();
if (S.loc) $('#place').textContent = S.loc.label;
if (S.active) renderBrief();
else if (S.loc) beginChain();
else show('#setup');
