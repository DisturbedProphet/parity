// ---------------------------------------------------------------------------
// Geometry and notation for the non-cube puzzles. Each puzzle is a convex
// solid cut by planes: every cell of the arrangement is a piece, its outer
// faces are its stickers, and a move turns every piece whose centre lies on
// one side of a plane. Plain math with no Three.js, so it can be checked in Node.
// ---------------------------------------------------------------------------
const Vx = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => Vx.mul(a, 1 / Vx.len(a)),
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  avg: pts => Vx.mul(pts.reduce((s, p) => Vx.add(s, p), [0, 0, 0]), 1 / pts.length),
  rot(v, k, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), kv = Vx.cross(k, v), kd = Vx.dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  },
};
const GEPS = 1e-7;

function newell(v) {
  const n = [0, 0, 0];
  for (let i = 0; i < v.length; i++) {
    const a = v[i], b = v[(i + 1) % v.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}
// Orient every face counter-clockwise seen from outside.
function solid(faces) {
  const c = Vx.avg(faces.flatMap(f => f.v));
  return faces.map(f => ({ v: Vx.dot(newell(f.v), Vx.sub(Vx.avg(f.v), c)) < 0 ? f.v.slice().reverse() : f.v, tag: f.tag ?? null }));
}
function cleanPoly(pts) {
  const out = [];
  for (const p of pts) if (!out.length || Vx.len(Vx.sub(p, out[out.length - 1])) > 1e-6) out.push(p);
  while (out.length > 1 && Vx.len(Vx.sub(out[0], out[out.length - 1])) <= 1e-6) out.pop();
  return out;
}
function uniquePts(pts) {
  const out = [];
  for (const p of pts) if (!out.some(q => Vx.len(Vx.sub(p, q)) < 1e-6)) out.push(p);
  return out;
}
function orderAround(pts, n) {
  const c = Vx.avg(pts), u = Vx.norm(Vx.sub(pts[0], c)), w = Vx.cross(n, u);
  return pts.map(p => { const d = Vx.sub(p, c); return [Math.atan2(Vx.dot(d, w), Vx.dot(d, u)), p]; })
    .sort((a, b) => a[0] - b[0]).map(x => x[1]);
}

// Keep the part of a convex solid where s * (n·x - d) <= 0; the new face gets capTag.
function clipSolid(faces, n, d, s, capTag = null) {
  const side = p => s * (Vx.dot(n, p) - d);
  let inside = false, outside = false;
  for (const f of faces) for (const p of f.v) { const k = side(p); if (k < -GEPS) inside = true; else if (k > GEPS) outside = true; }
  if (!inside) return null;
  if (!outside) return faces;
  const out = [], cap = [];
  for (const f of faces) {
    const v = f.v, res = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], da = side(a), db = side(b);
      if (da <= GEPS) res.push(a);
      if (Math.abs(da) <= GEPS) cap.push(a);
      if ((da < -GEPS && db > GEPS) || (da > GEPS && db < -GEPS)) { const p = Vx.lerp(a, b, da / (da - db)); res.push(p); cap.push(p); }
    }
    const r = cleanPoly(res);
    if (r.length >= 3) out.push({ v: r, tag: f.tag });
  }
  const c = uniquePts(cap);
  if (c.length >= 3) out.push({ v: orderAround(c, Vx.mul(n, s)), tag: capTag });
  return out;
}
function solidVolume(faces) {
  let v = 0;
  for (const f of faces) for (let i = 1; i + 1 < f.v.length; i++) v += Vx.dot(f.v[0], Vx.cross(f.v[i], f.v[i + 1]));
  return v / 6;
}
function cutCells(base, planes) {
  const res = [];
  const rec = (faces, i) => {
    if (i === planes.length) { res.push(faces); return; }
    for (const s of [1, -1]) {
      const part = clipSolid(faces, planes[i].n, planes[i].d, s);
      if (part && solidVolume(part) > 1e-5) rec(part, i + 1);
    }
  };
  rec(base, 0);
  return res;
}
function toPiece(faces) {
  return {
    faces: faces.map(f => f.v),
    tags: faces.map(f => f.tag),
    c: Vx.avg(uniquePts(faces.flatMap(f => f.v))),
    stickers: faces.filter(f => f.tag != null).map(f => ({ v: f.v, color: f.tag, n: Vx.norm(newell(f.v)) })),
  };
}
function boxSolid([x0, y0, z0], [x1, y1, z1], t) {
  return solid([
    { v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], tag: t.px },
    { v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], tag: t.nx },
    { v: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], tag: t.py },
    { v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], tag: t.ny },
    { v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], tag: t.pz },
    { v: [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], tag: t.nz },
  ]);
}
const puzzleTokens = text => String(text || '').split(/\s+/).filter(Boolean);
// Outer planes of a solid (n·x <= d), used to round the whole puzzle's edges.
const solidPlanes = faces => faces.filter(f => f.tag != null).map(f => { const n = Vx.norm(newell(f.v)); return { n, d: Vx.dot(n, f.v[0]) }; });

// Twelve stickerless megaminx colours: U, F, R, BR, BL, L, then the lower half.
const MINX_COLORS = ['#FAFAF6', '#0F9A40', '#F0213A', '#1F5BE8', '#FFE418', '#8E3FD1', '#9EA2A8', '#8BE04E', '#FF8A10', '#5BC8F5', '#F2DFA8', '#FF7EB6'];

function buildSkewb() {
  const a = 1.5;
  const base = boxSolid([-a, -a, -a], [a, a, a], { py: 0, px: 1, pz: 2, ny: 3, nx: 4, nz: 5 });
  const planes = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => ({ n: Vx.norm(v), d: 0 }));
  const corner = { R: [1, -1, -1], U: [-1, 1, -1], L: [-1, -1, 1], B: [-1, -1, -1] };
  return {
    pieces: cutCells(base, planes).map(toPiece), palette: 'cube', base: solidPlanes(base), mould: { r: .07, R: .26 },
    parse: text => puzzleTokens(text).flatMap((t, ti) => {
      const m = /^([RULB])('?)$/.exec(t); if (!m) return [];
      const n = Vx.norm(corner[m[1]]);
      return [{ axis: n, n, d: 0, angle: (m[2] ? 1 : -1) * 2 * Math.PI / 3, ti }];
    }),
  };
}

function buildPyraminx() {
  const R = 2.8, rb = R * 2 * Math.SQRT2 / 3, yb = -R / 3, s60 = Math.sin(Math.PI / 3);
  const V = { U: [0, R, 0], L: [-rb * s60, yb, rb / 2], R: [rb * s60, yb, rb / 2], B: [0, yb, -rb] };
  const base = solid([
    { v: [V.U, V.L, V.R], tag: 2 }, { v: [V.U, V.B, V.L], tag: 1 },
    { v: [V.U, V.R, V.B], tag: 5 }, { v: [V.L, V.B, V.R], tag: 3 },
  ]);
  const planes = [];
  for (const k of 'ULRB') { const n = Vx.norm(V[k]); planes.push({ n, d: R / 9 }, { n, d: 5 * R / 9 }); }
  return {
    pieces: cutCells(base, planes).map(toPiece), palette: 'cube', home: [.24, -.8], base: solidPlanes(base), mould: { r: .07, R: .42 },
    parse: text => puzzleTokens(text).flatMap((t, ti) => {
      const m = /^([ULRBulrb])('?)$/.exec(t); if (!m) return [];
      const n = Vx.norm(V[m[1].toUpperCase()]), tip = m[1] === m[1].toLowerCase();
      return [{ axis: n, n, d: tip ? 5 * R / 9 : R / 9, angle: (m[2] ? 1 : -1) * 2 * Math.PI / 3, ti }];
    }),
  };
}

function minxFrame() {
  const phi = (1 + Math.sqrt(5)) / 2;
  let N = [];
  for (const a of [1, -1]) for (const b of [1, -1]) N.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
  N = N.map(Vx.norm);
  const up = N.find(v => v[1] > 0 && v[0] === 0 && v[2] > 0);
  const nb = N.find(v => Math.abs(Vx.dot(v, up) - 1 / Math.sqrt(5)) < 1e-6);
  const z = Vx.norm(Vx.sub(nb, Vx.mul(up, Vx.dot(nb, up)))), x = Vx.cross(up, z);
  N = N.map(v => [Vx.dot(v, x), Vx.dot(v, up), Vx.dot(v, z)]);
  // Name faces by ring and azimuth (0 = front, clockwise seen from above).
  const az = v => Math.atan2(v[0], v[2]) * 180 / Math.PI;
  const faces = {};
  const near = (a, b) => Math.abs(((a - b + 540) % 360) - 180) < 1;
  for (const v of N) {
    if (v[1] > .99) faces.U = v;
    else if (v[1] < -.99) faces.D = v;
    else if (v[1] > 0) faces[['F', 'R', 'BR', 'BL', 'L'].find((k, i) => near(az(v), [0, 72, 144, -144, -72][i]))] = v;
    else faces[['DR', 'DBR', 'DB', 'DBL', 'DL'].find((k, i) => near(az(v), [36, 108, 180, -108, -36][i]))] = v;
  }
  return faces;
}

function buildMegaminx(depth = .72) {
  const faces = minxFrame(), names = ['U', 'F', 'R', 'BR', 'BL', 'L', 'D', 'DB', 'DBL', 'DL', 'DR', 'DBR'];
  const r = 2.05, d = r * depth;
  let base = boxSolid([-5, -5, -5], [5, 5, 5], {});
  names.forEach((k, i) => { base = clipSolid(base, faces[k], r, 1, i); });
  const planes = names.map(k => ({ n: faces[k], d }));
  return {
    pieces: cutCells(base, planes).map(toPiece), palette: MINX_COLORS, home: [.42, -.2], base: solidPlanes(base), mould: { r: .05, R: .2 },
    parse: text => puzzleTokens(text).flatMap((t, ti) => {
      let m = /^([RD])(\+\+|--)$/.exec(t);
      if (m) { const n = faces[m[1]]; return [{ axis: n, n, d: -d, angle: (m[2] === '++' ? -1 : 1) * 4 * Math.PI / 5, ti }]; }
      m = /^U('?)$/.exec(t);
      if (m) return [{ axis: faces.U, n: faces.U, d, angle: (m[1] ? 1 : -1) * 2 * Math.PI / 5, ti }];
      return [];
    }),
  };
}

// Square-1: top and bottom layers of 30-degree slots, a two-piece middle, and a
// cut plane through slot boundaries at 75 and 255 degrees (seen from above,
// counter-clockwise from the right). (x, y) turns the top x/12 clockwise seen
// from above and the bottom y/12 clockwise seen from below; / flips the right half.
const SQ1 = { a: 1.5, H: 1.5, h: .42, cut: -15 };
const sq1Dir = t => [Math.cos(t * Math.PI / 180), 0, -Math.sin(t * Math.PI / 180)];
function buildSq1() {
  const { a, H, h } = SQ1, side = { px: 1, nx: 4, pz: 2, nz: 5 };
  const wedge = (faces, t1, t2) => {
    const f = clipSolid(faces, sq1Dir(t1 + 90), 0, -1);
    return f && clipSolid(f, sq1Dir(t2 + 90), 0, 1);
  };
  const top = boxSolid([-a, h, -a], [a, H, a], { py: 0, ...side });
  const bot = boxSolid([-a, -H, -a], [a, -h, a], { ny: 3, ...side });
  const mid = boxSolid([-a, -h, -a], [a, h, a], side);
  const spans = [[-15, 15], [15, 75], [75, 105], [105, 165], [165, 195], [195, 255], [255, 285], [285, 345]];
  const pieces = [];
  for (const layer of [top, bot]) for (const [t1, t2] of spans) pieces.push(toPiece(wedge(layer, t1, t2)));
  const n = sq1Dir(SQ1.cut);
  pieces.push(toPiece(clipSolid(mid, n, 0, -1)), toPiece(clipSolid(mid, n, 0, 1)));
  const Y = [0, 1, 0];
  return {
    pieces, palette: 'cube', home: [.48, -.5], mould: { r: .07, R: .26 },
    base: solidPlanes(boxSolid([-a, -H, -a], [a, H, a], { px: 1, nx: 1, py: 1, ny: 1, pz: 1, nz: 1 })),
    parse: text => puzzleTokens(text).flatMap((t, ti) => {
      if (t === '/') return [{ axis: n, n, d: 0, angle: Math.PI, ti }];
      const m = /^\((-?\d+),(-?\d+)\)$/.exec(t);
      if (!m) return [];
      const out = [];
      if (+m[1]) out.push({ axis: Y, n: Y, d: h, angle: -m[1] * Math.PI / 6, ti });
      if (+m[2]) out.push({ axis: Y, n: [0, -1, 0], d: h, angle: +m[2] * Math.PI / 6, ti });
      return out;
    }),
  };
}

// Clock: two sides of nine dials. A turn with pins P up adds the amount to the
// front dials around those pins and takes it from the matching back corners.
const CLOCK_PINS = { UR: ['UR'], DR: ['DR'], DL: ['DL'], UL: ['UL'], U: ['UL', 'UR'], R: ['UR', 'DR'], D: ['DL', 'DR'], L: ['UL', 'DL'], ALL: ['UL', 'UR', 'DL', 'DR'] };
const CLOCK_BLOCK = { UL: [0, 1, 3, 4], UR: [1, 2, 4, 5], DL: [3, 4, 6, 7], DR: [4, 5, 7, 8] };
const CLOCK_CORNER = { UL: 0, UR: 2, DL: 6, DR: 8 };
const CLOCK_MIRROR = { 0: 2, 2: 0, 6: 8, 8: 6 };
function parseClock(text) {
  return puzzleTokens(text).flatMap((t, ti) => {
    let m = /^(UR|DR|DL|UL|U|R|D|L|ALL)(\d)([+-])$/.exec(t);
    if (m) return [{ type: 'turn', pins: CLOCK_PINS[m[1]], amt: (m[3] === '+' ? 1 : -1) * +m[2], ti }];
    if (t === 'y2') return [{ type: 'flip', ti }];
    if (/^(UR|DR|DL|UL)$/.test(t)) return [{ type: 'pin', pin: t, ti }];
    return [];
  });
}
function clockStep(st, mv) {
  if (mv.type === 'flip') { st.flipped = !st.flipped; return st; }
  if (mv.type === 'pin') { st.pins.add(mv.pin); return st; }
  const F = st.flipped ? st.b : st.a, K = st.flipped ? st.a : st.b, hit = new Set();
  for (const p of mv.pins) for (const i of CLOCK_BLOCK[p]) hit.add(i);
  for (const i of hit) F[i] = (F[i] + mv.amt + 120) % 12;
  for (const p of mv.pins) { const j = CLOCK_MIRROR[CLOCK_CORNER[p]]; K[j] = (K[j] - mv.amt + 120) % 12; }
  return st;
}
const clockSolved = () => ({ a: new Array(9).fill(0), b: new Array(9).fill(0), flipped: false, pins: new Set() });

// Piece-level model of a puzzle derived from its geometry, for the random-state
// solver: each move sends piece i to slot to[i], turning it by tw[i] (stickers are
// ordered counter-clockwise round the piece, so twists add up mod sticker count).
function pieceModel(kind, tokens, ignoreTokens = []) {
  const def = puzzleDef(kind), skip = new Set();
  for (const t of ignoreTokens) {
    const mv = def.parse(t)[0];
    def.pieces.forEach((p, i) => { if (Vx.dot(mv.n, p.c) > mv.d) skip.add(i); });
  }
  const pcs = def.pieces.filter((p, i) => p.stickers.length && !skip.has(i));
  const ordered = pcs.map(p => {
    const cs = p.stickers.map(s => Vx.avg(s.v));
    if (cs.length < 3) return cs;
    const out = Vx.norm(p.c), d0 = Vx.sub(cs[0], p.c);
    const u = Vx.norm(Vx.sub(d0, Vx.mul(out, Vx.dot(d0, out)))), w = Vx.cross(out, u);
    return cs.map(c => { const d = Vx.sub(c, p.c); return [Math.atan2(Vx.dot(d, w), Vx.dot(d, u)), c]; })
      .sort((x, y) => x[0] - y[0]).map(x => x[1]);
  });
  const at = (list, c) => list.findIndex(q => Vx.len(Vx.sub(q, c)) < 1e-3);
  const centres = pcs.map(p => p.c), letters = [...new Set(tokens.map(t => t.replace("'", '')))];
  const moves = tokens.map(tok => {
    const mv = def.parse(tok)[0], to = [], tw = [];
    pcs.forEach((p, i) => {
      if (Vx.dot(mv.n, p.c) <= mv.d) { to.push(i); tw.push(0); return; }
      const j = at(centres, Vx.rot(p.c, mv.axis, mv.angle));
      to.push(j); tw.push(at(ordered[j], Vx.rot(ordered[i][0], mv.axis, mv.angle)));
    });
    return { tok, to, tw, axis: letters.indexOf(tok.replace("'", '')) };
  });
  return { ori: pcs.map((p, i) => ordered[i].length), moves };
}

const PUZZLE_DEFS = {};
function puzzleDef(kind) {
  if (!PUZZLE_DEFS[kind]) PUZZLE_DEFS[kind] = { pyram: buildPyraminx, skewb: buildSkewb, minx: buildMegaminx, sq1: buildSq1 }[kind]();
  return PUZZLE_DEFS[kind];
}
