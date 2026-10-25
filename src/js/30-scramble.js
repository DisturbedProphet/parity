// ---------------------------------------------------------------------------
// Events and random-move scramblers (3x3 and 2x2 use the random-state worker).
// ---------------------------------------------------------------------------
const EVENTS = [
  { id: '333', name: '3×3', long: '3×3×3 Cube', n: 3, rs: '333' },
  { id: '222', name: '2×2', long: '2×2×2 Cube', n: 2, rs: '222' },
  { id: '444', name: '4×4', long: '4×4×4 Cube', n: 4, len: 40 },
  { id: '555', name: '5×5', long: '5×5×5 Cube', n: 5, len: 60 },
  { id: '666', name: '6×6', long: '6×6×6 Cube', n: 6, len: 80 },
  { id: '777', name: '7×7', long: '7×7×7 Cube', n: 7, len: 100 },
  { id: '333oh', name: '3×3 OH', long: '3×3 One-Handed', n: 3, rs: '333' },
  { id: '333bf', name: '3×3 BLD', long: '3×3 Blindfolded', n: 3, rs: '333', bld: true },
  { id: 'pyram', name: 'Pyraminx', long: 'Pyraminx', rs: 'pz' },
  { id: 'skewb', name: 'Skewb', long: 'Skewb', rs: 'pz' },
  { id: 'minx', name: 'Megaminx', long: 'Megaminx' },
  { id: 'clock', name: 'Clock', long: 'Clock' },
  { id: 'sq1', name: 'Square-1', long: 'Square-1' },
];
const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
const pick = arr => arr[rnd(arr.length)];

function nxnScramble(n, len) {
  const maxW = Math.max(1, Math.floor(n / 2));
  const out = [];
  let lastAxis = -1, run = [];
  while (out.length < len) {
    const f = rnd(6), w = 1 + rnd(maxW), axis = FACE_AXIS[f];
    if (n % 2 === 0 && w === n / 2 && f >= 3) continue;
    if (axis === lastAxis) {
      if (run.some(u => (u.f === f && u.w === w) || (u.f !== f && u.w + w >= n))) continue;
    } else run = [];
    run.push({ f, w }); lastAxis = axis;
    const face = FACES[f];
    const base = w === 1 ? face : w === 2 ? face + 'w' : w + face + 'w';
    out.push(base + ['', '2', "'"][rnd(3)]);
  }
  return out.join(' ');
}

const BLD_ORIENT_A = ['', 'Rw', 'Rw2', "Rw'", 'Fw', "Fw'"];
const BLD_ORIENT_B = ['', 'Uw', 'Uw2', "Uw'"];
function bldSuffix() { return [pick(BLD_ORIENT_A), pick(BLD_ORIENT_B)].filter(Boolean).join(' '); }

function letterScramble(letters, len, tips, sufs = ['', "'"]) {
  const out = []; let last = -1;
  while (out.length < len) {
    const f = rnd(letters.length);
    if (f === last) continue;
    last = f;
    out.push(letters[f] + pick(sufs));
  }
  if (tips) for (const t of tips) { const r = rnd(3); if (r) out.push(t + (r === 2 ? "'" : '')); }
  return out.join(' ');
}

function pyraTips() {
  const out = [];
  for (const t of 'ulrb') { const r = rnd(3); if (r) out.push(t + (r === 2 ? "'" : '')); }
  return out.join(' ');
}

function minxScramble() {
  const lines = [];
  for (let l = 0; l < 7; l++) {
    const mv = [];
    for (let i = 0; i < 10; i++) mv.push((i % 2 ? 'D' : 'R') + (rnd(2) ? '++' : '--'));
    mv.push(rnd(2) ? 'U' : "U'");
    lines.push(mv.join(' '));
  }
  return lines.join('\n');
}

function clockScramble() {
  const dial = p => { const v = rnd(12) - 5; return p + (v >= 0 ? v + '+' : -v + '-'); };
  const out = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'].map(dial);
  out.push('y2', ...['U', 'R', 'D', 'L', 'ALL'].map(dial));
  out.push(...['UR', 'DR', 'DL', 'UL'].filter(() => rnd(2)));
  return out.join(' ');
}

function sq1Scramble() {
  let top = [0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 7], bot = [8, 9, 9, 10, 11, 11, 12, 13, 13, 14, 15, 15];
  const rot = (l, k) => l.map((_, i) => l[(i - k + 24) % 12]);
  const cuttable = l => l[0] !== l[11] && l[6] !== l[5];
  const out = [];
  while (out.length < 12) {
    const u = rnd(12) - 5, d = rnd(12) - 5;
    if (u === 0 && d === 0) continue;
    const nt = rot(top, u), nb = rot(bot, d);
    if (!cuttable(nt) || !cuttable(nb)) continue;
    top = nt.slice(); bot = nb.slice();
    for (let i = 0; i < 6; i++) { top[i] = nb[5 - i]; bot[i] = nt[5 - i]; }
    // The model turns the top the opposite way to WCA notation (clockwise from above).
    out.push(`(${-u},${d})`);
  }
  return out.join(' / ') + ' /';
}

// Random-move fallback for everything; 3x3-family and 2x2 prefer random-state.
function localScramble(eventId) {
  const ev = EVENT_BY_ID[eventId];
  switch (eventId) {
    case 'pyram': return letterScramble('ULRB', 11, 'ulrb');
    case 'skewb': return letterScramble('RULB', 11);
    case 'minx': return minxScramble();
    case 'clock': return clockScramble();
    case 'sq1': return sq1Scramble();
    case '222': return letterScramble('RUF', 11, null, ['', '2', "'"]);
    default: {
      const s = nxnScramble(ev.n, ev.len || 25);
      return ev.bld ? (s + ' ' + bldSuffix()).trim() : s;
    }
  }
}
