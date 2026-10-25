// ---------------------------------------------------------------------------
// NxN sticker model. Every sticker keeps a position and an outward normal in
// doubled integer coordinates (-(n-1) .. n-1, step 2), so one rotation routine
// handles face turns, wide turns, slices and whole-cube rotations for any n.
// Face order follows Kociemba: U R F D L B.
// ---------------------------------------------------------------------------
const FACES = 'URFDLB';
const FACE_AXIS = [1, 0, 2, 1, 0, 2];
const FACE_SIGN = [1, 1, 1, -1, -1, -1];

function rot90(a, o, axis) {
  const x = a[o], y = a[o + 1], z = a[o + 2];
  if (axis === 0) { a[o + 1] = -z; a[o + 2] = y; }
  else if (axis === 1) { a[o] = z; a[o + 2] = -x; }
  else { a[o] = -y; a[o + 1] = x; }
}

// Parse one move token for an n-cube. Returns {axis, lo, hi, q, tok}
// where q is the signed number of quarter turns about the +axis.
function parseMove(raw, n) {
  const tok = raw.replace(/[’`]/g, "'");
  const mt = /^(\d*)([URFDLBurfdlbMESxyz])(w?)(\d*)('?)$/.exec(tok);
  if (!mt) return null;
  const [, pre, letter, wide, amtStr, prime] = mt;
  const m = n - 1;
  let amount = amtStr ? parseInt(amtStr, 10) : 1;
  if (prime) amount = -amount;
  let axis, side, lo, hi;
  const depthRange = (s, d1, d2) => {
    d2 = Math.min(d2, n); d1 = Math.min(d1, d2);
    if (s > 0) return [m - 2 * (d2 - 1), m - 2 * (d1 - 1)];
    return [-(m - 2 * (d1 - 1)), -(m - 2 * (d2 - 1))];
  };
  const up = letter.toUpperCase();
  if ('URFDLB'.includes(up) && letter === up) {
    const f = FACES.indexOf(up); axis = FACE_AXIS[f]; side = FACE_SIGN[f];
    if (wide) [lo, hi] = depthRange(side, 1, pre ? +pre : 2);
    else if (pre) [lo, hi] = depthRange(side, +pre, +pre);
    else [lo, hi] = depthRange(side, 1, 1);
  } else if ('urfdlb'.includes(letter)) {
    const f = FACES.indexOf(up); axis = FACE_AXIS[f]; side = FACE_SIGN[f];
    [lo, hi] = depthRange(side, 1, pre ? +pre : 2);
  } else if (letter === 'M' || letter === 'E' || letter === 'S') {
    axis = letter === 'M' ? 0 : letter === 'E' ? 1 : 2;
    side = letter === 'S' ? 1 : -1;
    if (n < 3) return null;
    lo = -(m - 2); hi = m - 2;
  } else {
    axis = letter === 'x' ? 0 : letter === 'y' ? 1 : 2;
    side = 1; lo = -m; hi = m;
  }
  return { axis, lo, hi, q: -side * amount, tok };
}

function tokenize(alg) {
  return String(alg || '').replace(/[()\[\],]/g, ' ').split(/\s+/).filter(Boolean);
}

function parseAlg(alg, n) {
  const out = [];
  for (const t of tokenize(alg)) { const mv = parseMove(t, n); if (mv) out.push(mv); }
  return out;
}

function invertAlg(alg) {
  return tokenize(alg).reverse().map(t => {
    if (/2'$/.test(t)) return t.slice(0, -1);
    if (/2$/.test(t)) return t;
    return t.endsWith("'") ? t.slice(0, -1) : t + "'";
  }).join(' ');
}

class CubeState {
  constructor(n) { this.n = n; this.reset(); }

  reset() {
    const n = this.n, m = n - 1, P = [], N = [], C = [];
    for (let x = -m; x <= m; x += 2)
      for (let y = -m; y <= m; y += 2)
        for (let z = -m; z <= m; z += 2) {
          const c = [x, y, z];
          for (let f = 0; f < 6; f++) {
            const a = FACE_AXIS[f], s = FACE_SIGN[f];
            if (c[a] !== s * m) continue;
            const nn = [0, 0, 0]; nn[a] = s;
            P.push(x, y, z); N.push(nn[0], nn[1], nn[2]); C.push(f);
          }
        }
    this.p = Int8Array.from(P); this.nr = Int8Array.from(N); this.c = Uint8Array.from(C);
    this.p0 = Int8Array.from(P);
    this.count = C.length;
    return this;
  }

  turn(axis, lo, hi, q) {
    q = ((q % 4) + 4) % 4;
    if (!q) return;
    const p = this.p, nr = this.nr;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3, v = p[o + axis];
      if (v < lo || v > hi) continue;
      for (let k = 0; k < q; k++) { rot90(p, o, axis); rot90(nr, o, axis); }
    }
  }

  move(mv) { this.turn(mv.axis, mv.lo, mv.hi, mv.q); }
  apply(alg) { for (const mv of parseAlg(alg, this.n)) this.move(mv); return this; }

  // Rotate the whole cube so the U and F centres are home (odd n only).
  normalize() {
    const n = this.n, m = n - 1;
    if (n % 2 === 0) return this;
    const findCentre = col => {
      for (let i = 0; i < this.count; i++) {
        if (this.c[i] !== col) continue;
        const o = i * 3, p = this.p;
        const zeros = (p[o] === 0) + (p[o + 1] === 0) + (p[o + 2] === 0);
        if (zeros === 2) return [this.nr[o], this.nr[o + 1], this.nr[o + 2]];
      }
      return null;
    };
    let u = findCentre(0);
    if (u[0] === 1) this.turn(2, -m, m, 1);
    else if (u[0] === -1) this.turn(2, -m, m, -1);
    else if (u[2] === 1) this.turn(0, -m, m, -1);
    else if (u[2] === -1) this.turn(0, -m, m, 1);
    else if (u[1] === -1) this.turn(0, -m, m, 2);
    const f = findCentre(2);
    if (f[0] === 1) this.turn(1, -m, m, -1);
    else if (f[0] === -1) this.turn(1, -m, m, 1);
    else if (f[2] === -1) this.turn(1, -m, m, 2);
    return this;
  }

  // 6 faces (URFDLB) of sticker indices in standard net reading order; p0 holds
  // each sticker's home position.
  faceStickers() {
    const n = this.n, m = n - 1, out = [];
    for (let f = 0; f < 6; f++) out.push(new Array(n * n));
    const p = this.p, nr = this.nr;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3, x = p[o], y = p[o + 1], z = p[o + 2];
      let f, r, c;
      if (nr[o + 1] === 1) { f = 0; c = (x + m) / 2; r = (z + m) / 2; }
      else if (nr[o] === 1) { f = 1; c = (m - z) / 2; r = (m - y) / 2; }
      else if (nr[o + 2] === 1) { f = 2; c = (x + m) / 2; r = (m - y) / 2; }
      else if (nr[o + 1] === -1) { f = 3; c = (x + m) / 2; r = (m - z) / 2; }
      else if (nr[o] === -1) { f = 4; c = (z + m) / 2; r = (m - y) / 2; }
      else { f = 5; c = (m - x) / 2; r = (m - y) / 2; }
      out[f][r * n + c] = i;
    }
    return out;
  }

  // 6 faces (URFDLB) of n*n colour indices in standard net reading order.
  faces() { return this.faceStickers().map(face => face.map(i => this.c[i])); }

  faceletString() {
    return this.faces().map(face => face.map(c => FACES[c]).join('')).join('');
  }

  isSolved() {
    return this.faces().every(face => face.every(c => c === face[0]));
  }
}
