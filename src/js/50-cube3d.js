// ---------------------------------------------------------------------------
// 3D scramble preview (Three.js). Cube3D owns the renderer, camera, drag and
// the move animation loop; a puzzle view (NxN cube, cut-plane puzzle or clock)
// builds the meshes and knows how a move turns them. The render loop only runs
// while something moves. One instance is shared and re-mounted between the
// timer, the trainer and the large viewer.
// ---------------------------------------------------------------------------
let THREE = null;
const threeLib = (async () => {
  try {
    THREE = await import('three');
    const [rb, re] = await Promise.all([
      import('three/addons/geometries/RoundedBoxGeometry.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]);
    return { RoundedBoxGeometry: rb.RoundedBoxGeometry, RoomEnvironment: re.RoomEnvironment };
  } catch (e) {
    console.warn('3D preview unavailable, using the flat net instead.', e);
    return null;
  }
})();

const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// stickerless: moulded matte colour that wraps round each piece's edges, a
// smoothly rounded overall cube and white internals, like a stickerless GAN
// (the other puzzles use bevelled tiles sized by size, depth and bevel).
// black and white: stickers on a plastic body.
const CUBE_STYLES = {
  stickerless: { smooth: true, body: '#E9E9E3', bodyRough: .72, size: .955, radius: .11, depth: .03, bevel: .024, rough: .66, env: .45, glow: .1 },
  black: { body: '#0E0E10', bodyRough: .42, size: .84, radius: .13, depth: 0, rough: .32, env: 1, glow: 0 },
  white: { body: '#E7E7E2', bodyRough: .5, size: .84, radius: .13, depth: 0, rough: .32, env: 1, glow: 0 },
};
const styleOf = name => CUBE_STYLES[name] || CUBE_STYLES.stickerless;
const DEFAULT_HOME = [.5, -.66];

// Frosted plastic grain: soft value noise as a normal map and a roughness map.
function grainTextures(aniso) {
  const N = 256, h = new Float32Array(N * N);
  for (let i = 0; i < h.length; i++) h[i] = Math.random();
  const blur = src => {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy + N) % N) * N + ((x + dx + N) % N)];
      out[y * N + x] = s / 9;
    }
    return out;
  };
  const a = blur(blur(h)), nd = new Uint8Array(N * N * 4), rd = new Uint8Array(N * N * 4);
  const at = (x, y) => a[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 6, dy = (at(x, y + 1) - at(x, y - 1)) * 6, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    nd[i] = (-dx / l * .5 + .5) * 255; nd[i + 1] = (-dy / l * .5 + .5) * 255; nd[i + 2] = (1 / l * .5 + .5) * 255; nd[i + 3] = 255;
    const g = clamp(215 + (at(x, y) - .5) * 160, 0, 255);
    rd[i] = rd[i + 1] = rd[i + 2] = g; rd[i + 3] = 255;
  }
  const tex = data => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = Math.min(8, aniso || 1);
    t.needsUpdate = true;
    return t;
  };
  return { normal: tex(nd), rough: tex(rd) };
}

// ---------- NxN cube ----------
// One moulded stickerless piece. Its core is a box whose edges can each have
// their own rounding (larger where a centre meets its edges, like a GAN),
// grown by a small radius for soft seams, then cut by the whole cube's rounded
// edges and corners. Each face of the piece is a grid whose colour runs to the
// 45-degree line of every rounding, so colours meet on the curve.
// Material index = face (outer) or 6 (internals).
const SEAM_R = .07, GAN_R = .2, GAN_CORNER_R = .11;
const PIECE_AX = [[1, 2], [2, 0], [0, 1]];

// Radii of the piece's edges parallel to each axis, indexed (b-/b+) + 2 * (c-/c+).
// An edge gets the GAN radius at a face junction where a centre meets an edge.
function pieceRadii(n, p) {
  const m = n - 1, kind = q => q.filter(x => Math.abs(x) === m).length;
  const radii = [0, 1, 2].map(() => [SEAM_R, SEAM_R, SEAM_R, SEAM_R]);
  if (n < 3) return radii;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(p[a]) !== m) continue;
    const [b, c] = PIECE_AX[a];
    for (let k = 0; k < 4; k++) {
      const jb = p[b] + (k & 1 ? 1 : -1), jc = p[c] + (k & 2 ? 1 : -1);
      if (Math.abs(jb) >= m || Math.abs(jc) >= m) continue;
      const kinds = new Set();
      for (const ob of [-1, 1]) for (const oc of [-1, 1]) { const q = p.slice(); q[b] = jb + ob; q[c] = jc + oc; kinds.add(kind(q)); }
      if (kinds.has(1) && kinds.has(2)) radii[a][k] = kind(p) === 3 ? GAN_CORNER_R : GAN_R;
    }
  }
  return radii;
}
function projRoundRect(x, y, e, rr) {
  const sx = x >= 0 ? 1 : -1, sy = y >= 0 ? 1 : -1, R = rr[(sx > 0 ? 1 : 0) + (sy > 0 ? 2 : 0)];
  if (R > 0) {
    const cx = sx * (e - R), cy = sy * (e - R);
    if ((x - cx) * sx > 0 && (y - cy) * sy > 0) {
      const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy);
      return L > R ? [cx + dx / L * R, cy + dy / L * R] : [x, y];
    }
  }
  return [clamp(x, -e, e), clamp(y, -e, e)];
}
// Nearest point on the core: the intersection of three rounded prisms (Dykstra's projection).
function projCore(v, rr, e) {
  let x = v.slice();
  const inc = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let it = 0; it < 60; it++) {
    let moved = 0;
    for (let a = 0; a < 3; a++) {
      const [b, c] = PIECE_AX[a], t = [x[0] + inc[a][0], x[1] + inc[a][1], x[2] + inc[a][2]];
      const z = t.slice();
      [z[b], z[c]] = projRoundRect(t[b], t[c], e, rr[a]);
      inc[a] = [t[0] - z[0], t[1] - z[1], t[2] - z[2]];
      moved += Math.abs(z[0] - x[0]) + Math.abs(z[1] - x[1]) + Math.abs(z[2] - x[2]);
      x = z;
    }
    if (it > 0 && moved < 1e-8) break;
  }
  return x;
}

function smoothCubie(n, p, S) {
  const h = .496, r = SEAM_R, R = n <= 2 ? .3 : .25 + .05 * (n - 3);
  const H = n / 2 - .004, c = [p[0] / 2, p[1] / 2, p[2] / 2];
  const rr = pieceRadii(n, p).map(row => row.map(x => Math.max(0, x - r))), gan = rr.some(row => row.some(x => x > 0));
  const t = [];
  for (let i = 0; i <= S; i++) t.push(-.55 * Math.cos(Math.PI * i / S) + .45 * (2 * i / S - 1));
  const pos = [], nor = [], idx = [], groups = [], uv = [], col = [];
  const inner = [];
  for (let f = 0; f < 6; f++) if (p[FACE_AXIS[f]] !== FACE_SIGN[f] * (n - 1)) { const v = [0, 0, 0]; v[FACE_AXIS[f]] = FACE_SIGN[f]; inner.push(v); }
  for (let f = 0; f < 6; f++) {
    const a = FACE_AXIS[f], s = FACE_SIGN[f], [b, e] = PIECE_AX[a], base = pos.length / 3, start = idx.length;
    for (let i = 0; i <= S; i++) for (let j = 0; j <= S; j++) {
      const v = [0, 0, 0]; v[a] = s * h; v[b] = t[i] * h; v[e] = t[j] * h;
      const q = gan ? projCore(v, rr, h - r) : v.map(x => clamp(x, r - h, h - r)), d = [v[0] - q[0], v[1] - q[1], v[2] - q[2]], dl = Math.hypot(d[0], d[1], d[2]);
      let w = v, nm = [0, 0, 0];
      nm[a] = s;
      if (dl > 1e-9) { w = [q[0] + d[0] / dl * r, q[1] + d[1] / dl * r, q[2] + d[2] / dl * r]; nm = [d[0] / dl, d[1] / dl, d[2] / dl]; }
      const P = [w[0] + c[0], w[1] + c[1], w[2] + c[2]], Q = P.map(x => clamp(x, R - H, H - R));
      const D = [P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]], Dl = Math.hypot(D[0], D[1], D[2]);
      if (Dl > R) {
        w = [Q[0] + D[0] / Dl * R - c[0], Q[1] + D[1] / Dl * R - c[1], Q[2] + D[2] / Dl * R - c[2]];
        nm = [D[0] / Dl, D[1] / Dl, D[2] / Dl];
      }
      pos.push(w[0], w[1], w[2]); nor.push(nm[0], nm[1], nm[2]);
      uv.push((t[i] + 1) / 2, (t[j] + 1) / 2);
      const sh = seamShade(nm, inner); col.push(sh, sh, sh);
    }
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const k = base + i * (S + 1) + j, k2 = k + S + 1;
      if (s > 0) idx.push(k, k2, k2 + 1, k, k2 + 1, k + 1);
      else idx.push(k, k2 + 1, k2, k, k + 1, k2 + 1);
    }
    groups.push([start, idx.length - start, p[a] === s * (n - 1) ? f : 6]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  for (const [st, count, mi] of groups) g.addGroup(st, count, mi);
  return g;
}
// Baked shading: surfaces turning towards a neighbouring piece sit in a seam and get darker.
function seamShade(nm, dirs) {
  let m = 0;
  for (const d of dirs) { const v = nm[0] * d[0] + nm[1] * d[1] + nm[2] * d[2]; if (v > m) m = v; }
  return 1 - .34 * Math.pow(m, 1.3);
}

class NxnView {
  constructor(cube, n) {
    this.cube = cube; this.n = n; this.key = 'nxn' + n + cube.style;
    const m = n - 1, smooth = styleOf(cube.style).smooth, sg = smooth ? null : cube.cubeTile();
    const S = n <= 3 ? 20 : n === 4 ? 14 : n === 5 ? 11 : 9;
    const geos = smooth ? (cube.geoCache['smooth' + n] || (cube.geoCache['smooth' + n] = [])) : null;
    let gi = 0;
    cube.puzzle.scale.setScalar(3 / n);
    if (n > 2) {
      const core = new THREE.Mesh(cube.coreGeo, cube.bodyMat);
      core.scale.setScalar(n - 2.06);
      cube.puzzle.add(core);
    }
    this.cubies = [];
    for (let x = -m; x <= m; x += 2) for (let y = -m; y <= m; y += 2) for (let z = -m; z <= m; z += 2) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== m) continue;
      const p = [x, y, z], g = new THREE.Group();
      if (smooth) {
        g.add(new THREE.Mesh(geos[gi] || (geos[gi] = smoothCubie(n, p, S)), cube.smoothMats));
        gi++;
      } else {
        g.add(new THREE.Mesh(cube.bodyGeo, cube.bodyMat));
        for (let f = 0; f < 6; f++) {
          const a = FACE_AXIS[f], s = FACE_SIGN[f];
          if (p[a] !== s * m) continue;
          const tile = new THREE.Mesh(sg, cube.stickerMats[f]);
          if (a === 0) tile.rotation.y = s * Math.PI / 2;
          else if (a === 1) tile.rotation.x = -s * Math.PI / 2;
          else if (s < 0) tile.rotation.y = Math.PI;
          g.add(tile);
        }
      }
      g.position.set(x / 2, y / 2, z / 2);
      cube.puzzle.add(g);
      this.cubies.push({ g, p: p.slice(), p0: p, q: new THREE.Quaternion() });
    }
  }
  parse(alg) {
    return puzzleTokens(alg).flatMap((t, ti) => {
      const mv = parseMove(t.replace(/[()\[\],]/g, ''), this.n);
      return mv ? [Object.assign(mv, { ti })] : [];
    });
  }
  reset() {
    for (const c of this.cubies) {
      c.p = c.p0.slice(); c.q.identity();
      c.g.position.set(c.p[0] / 2, c.p[1] / 2, c.p[2] / 2); c.g.quaternion.identity();
    }
  }
  dur(mv) { return Math.abs(mv.q) === 2 ? 1.45 : 1; }
  select(mv) { const a = mv.axis; return this.cubies.filter(c => c.p[a] >= mv.lo && c.p[a] <= mv.hi); }
  pose(mv, sel, e) {
    const q = this.cube._q.setFromAxisAngle(this.cube.axes[mv.axis], e * mv.q * Math.PI / 2);
    for (const c of sel) {
      c.g.position.set(c.p[0] / 2, c.p[1] / 2, c.p[2] / 2).applyQuaternion(q);
      c.g.quaternion.copy(q).multiply(c.q);
    }
  }
  commit(mv, sel) {
    const cube = this.cube, q = cube._qa.setFromAxisAngle(cube.axes[mv.axis], mv.q * Math.PI / 2);
    const k = ((mv.q % 4) + 4) % 4, e = cube._m.elements;
    for (const c of sel) {
      for (let i = 0; i < k; i++) rot90(c.p, 0, mv.axis);
      c.q.premultiply(q);
      cube._m.makeRotationFromQuaternion(c.q);
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) e[i] = Math.round(e[i]);
      c.q.setFromRotationMatrix(cube._m);
      c.g.position.set(c.p[0] / 2, c.p[1] / 2, c.p[2] / 2);
      c.g.quaternion.copy(c.q);
    }
  }
}

// ---------- cut-plane puzzles: Pyraminx, Skewb, Megaminx, Square-1 ----------
function bodyGeometry(pc, shrink = .994) {
  const pos = [];
  for (const f of pc.faces) {
    const v = f.map(p => Vx.add(pc.c, Vx.mul(Vx.sub(p, pc.c), shrink)));
    for (let i = 1; i + 1 < v.length; i++) pos.push(...v[0], ...v[i], ...v[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function insetPoly(p, d) {
  const n = p.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    lines.push([a[0] - dy / L * d, a[1] + dx / L * d, dx, dy]);
  }
  return lines.map((l2, i) => {
    const l1 = lines[(i + n - 1) % n], det = l1[2] * l2[3] - l1[3] * l2[2];
    if (Math.abs(det) < 1e-12) return [l2[0], l2[1]];
    const t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / det;
    return [l1[0] + l1[2] * t, l1[1] + l1[3] * t];
  });
}
function tileGeometry(s, st) {
  const o = Vx.avg(s.v), n = s.n, u = Vx.norm(Vx.sub(s.v[0], o)), w = Vx.cross(n, u);
  let p = s.v.map(q => { const d = Vx.sub(q, o); return [Vx.dot(d, u), Vx.dot(d, w)]; });
  p = p.filter((q, i) => {
    const a = p[(i + p.length - 1) % p.length], b = p[(i + 1) % p.length];
    return Math.abs((q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0])) > 1e-7;
  });
  let inr = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    inr = Math.min(inr, Math.abs(a[0] * (b[1] - a[1]) - a[1] * (b[0] - a[0])) / L);
  }
  const gap = Math.min((1 - st.size) / 2, inr * .2), bevel = st.depth ? Math.min(st.bevel, inr * .18) : 0;
  const q = insetPoly(p, gap + bevel), sh = new THREE.Shape();
  q.forEach((pt, i) => {
    const a = q[(i + q.length - 1) % q.length], b = q[(i + 1) % q.length];
    const la = Math.hypot(a[0] - pt[0], a[1] - pt[1]), lb = Math.hypot(b[0] - pt[0], b[1] - pt[1]);
    const r = Math.min(st.radius * .8, la * .42, lb * .42);
    const p1 = [pt[0] + (a[0] - pt[0]) / la * r, pt[1] + (a[1] - pt[1]) / la * r];
    const p2 = [pt[0] + (b[0] - pt[0]) / lb * r, pt[1] + (b[1] - pt[1]) / lb * r];
    if (i === 0) sh.moveTo(p1[0], p1[1]); else sh.lineTo(p1[0], p1[1]);
    sh.quadraticCurveTo(pt[0], pt[1], p2[0], p2[1]);
  });
  sh.closePath();
  let g;
  if (st.depth) {
    g = new THREE.ExtrudeGeometry(sh, { depth: st.depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, .012 - st.depth - bevel);
  } else {
    g = new THREE.ShapeGeometry(sh, 4);
    g.translate(0, 0, .003);
  }
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(...w), new THREE.Vector3(...n));
  m.setPosition(...o);
  return g.applyMatrix4(m);
}

// Nearest point to v on the polytope { x : n·x <= d - off } (Dykstra's projection).
function projPlanes(v, planes, off) {
  let x = v.slice();
  const inc = planes.map(() => [0, 0, 0]);
  for (let it = 0; it < 80; it++) {
    let moved = 0;
    for (let k = 0; k < planes.length; k++) {
      const pl = planes[k], t = [x[0] + inc[k][0], x[1] + inc[k][1], x[2] + inc[k][2]];
      const s = pl.n[0] * t[0] + pl.n[1] * t[1] + pl.n[2] * t[2] - (pl.d - off);
      const z = s > 0 ? [t[0] - pl.n[0] * s, t[1] - pl.n[1] * s, t[2] - pl.n[2] * s] : t;
      inc[k] = [t[0] - z[0], t[1] - z[1], t[2] - z[2]];
      moved += Math.abs(z[0] - x[0]) + Math.abs(z[1] - x[1]) + Math.abs(z[2] - x[2]);
      x = z;
    }
    if (it > 0 && moved < 1e-9) break;
  }
  return x;
}
// A moulded stickerless piece: the cell rounded by r on every edge, cut by the
// whole puzzle rounded by R, coloured face by face (body index for cut faces).
function mouldPiece(pc, def, S, bodyIndex) {
  const { r, R } = def.mould, sym = j => { const x = j / S; return .55 * (1 - Math.cos(Math.PI * x)) / 2 + .45 * x; };
  const planes = pc.faces.map(f => { const n = Vx.norm(newell(f)); return { n, d: Vx.dot(n, f[0]) }; });
  const cut = planes.filter((pl, i) => pc.tags[i] == null).map(pl => pl.n);
  const pos = [], nor = [], uv = [], col = [], idx = [], groups = [];
  pc.faces.forEach((f, fi) => {
    const start = idx.length, o = Vx.avg(f), n0 = planes[fi].n, u = Vx.norm(Vx.sub(f[0], o)), w0 = Vx.cross(n0, u);
    for (let e = 0; e < f.length; e++) {
      const a = f[e], b = f[(e + 1) % f.length], row = pos.length / 3;
      for (let kr = 0; kr <= S; kr++) {
        const tr = Math.sin(Math.PI / 2 * kr / S);
        for (let j = 0; j <= S; j++) {
          const v = Vx.add(o, Vx.mul(Vx.sub(Vx.lerp(a, b, sym(j)), o), tr));
          const x = projPlanes(v, planes, r), d = Vx.sub(v, x), dl = Vx.len(d);
          let w = v, nm = n0;
          if (dl > 1e-9) { nm = Vx.mul(d, 1 / dl); w = Vx.add(x, Vx.mul(nm, r)); }
          if (def.base) {
            const X = projPlanes(w, def.base, R), D = Vx.sub(w, X), Dl = Vx.len(D);
            if (Dl > R) { nm = Vx.mul(D, 1 / Dl); w = Vx.add(X, Vx.mul(nm, R)); }
          }
          const dv = Vx.sub(v, o), sh = seamShade(nm, cut);
          pos.push(...w); nor.push(...nm); uv.push(Vx.dot(dv, u), Vx.dot(dv, w0)); col.push(sh, sh, sh);
        }
      }
      for (let kr = 0; kr < S; kr++) for (let j = 0; j < S; j++) {
        const k = row + kr * (S + 1) + j, k2 = k + S + 1;
        idx.push(k, k2, k2 + 1, k, k2 + 1, k + 1);
      }
    }
    groups.push([start, idx.length - start, pc.tags[fi] == null ? bodyIndex : pc.tags[fi]]);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  for (const [st, count, mi] of groups) g.addGroup(st, count, mi);
  return g;
}

class PieceView {
  constructor(cube, kind) {
    this.cube = cube; this.kind = kind; this.key = kind + cube.style;
    const def = this.def = puzzleDef(kind), st = styleOf(cube.style), mould = st.smooth && def.mould;
    const ownPalette = def.palette !== 'cube';
    this.home = def.home;
    cube.puzzle.scale.setScalar(1);
    if (mould) {
      const colours = ownPalette ? def.palette.map(() => cube.plastic({ vertexColors: true })) : cube.moldMats;
      if (ownPalette) { cube.styleMats(colours); cube.tint(colours, def.palette); }
      const mats = [...colours, cube.moldBody], S = kind === 'minx' ? 5 : 7;
      const geos = cube.geoCache[this.key] || (cube.geoCache[this.key] = def.pieces.map(pc => (pc.stickers.length ? mouldPiece(pc, def, S, colours.length) : bodyGeometry(pc))));
      this.pieces = def.pieces.map((pc, i) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(geos[i], pc.stickers.length ? mats : cube.bodyMat));
        cube.puzzle.add(g);
        return { g, c0: pc.c, c: pc.c, q: new THREE.Quaternion() };
      });
      return;
    }
    this.mats = ownPalette ? def.palette.map(c => new THREE.MeshStandardMaterial({ metalness: 0, color: c })) : cube.stickerMats;
    cube.styleMats(this.mats);
    if (ownPalette) cube.tint(this.mats, def.palette);
    const geos = cube.geoCache[this.key] || (cube.geoCache[this.key] = def.pieces.map(pc => ({ body: bodyGeometry(pc), tiles: pc.stickers.map(s => tileGeometry(s, st)) })));
    this.pieces = def.pieces.map((pc, i) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geos[i].body, cube.bodyMat));
      pc.stickers.forEach((s, k) => g.add(new THREE.Mesh(geos[i].tiles[k], this.mats[s.color])));
      cube.puzzle.add(g);
      return { g, c0: pc.c, c: pc.c, q: new THREE.Quaternion() };
    });
  }
  parse(alg) { return this.def.parse(alg); }
  reset() { for (const p of this.pieces) { p.c = p.c0; p.q.identity(); p.g.quaternion.identity(); } }
  dur(mv) { return clamp(Math.abs(mv.angle) / (Math.PI / 2), .75, 1.5); }
  select(mv) { return this.pieces.filter(p => Vx.dot(mv.n, p.c) > mv.d); }
  axis(mv) { return mv._ax || (mv._ax = new THREE.Vector3(...mv.axis)); }
  pose(mv, sel, e) {
    const q = this.cube._q.setFromAxisAngle(this.axis(mv), e * mv.angle);
    for (const p of sel) p.g.quaternion.copy(q).multiply(p.q);
  }
  commit(mv, sel) {
    const q = this.cube._qa.setFromAxisAngle(this.axis(mv), mv.angle);
    for (const p of sel) {
      p.q.premultiply(q).normalize();
      p.c = Vx.rot(p.c, mv.axis, mv.angle);
      p.g.quaternion.copy(p.q);
    }
  }
}

// ---------- Clock ----------
class ClockView {
  constructor(cube) {
    this.cube = cube; this.key = 'clock';
    this.home = [.16, -.32];
    const T = THREE, S = 1.22, t = .2;
    const mat = (color, rough = .6) => new T.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    const frame = mat('#24272E', .55), faceA = mat('#E6E9EE', .7), faceB = mat('#2E323A', .7);
    const dialA = mat('#FFFFFF', .55), dialB = mat('#1B1E24', .55), handA = mat('#15171B', .5), handB = mat('#F3F3EF', .5), mark = mat('#F0213A', .5), pinM = mat('#C9CDD4', .35);
    this.group = new T.Group(); cube.puzzle.add(this.group); cube.puzzle.scale.setScalar(1);
    const body = new T.Mesh(new T.CylinderGeometry(2.3, 2.3, t * 2, 64), frame);
    body.rotation.x = Math.PI / 2; this.group.add(body);
    for (const [z, m] of [[t + .005, faceA], [-t - .005, faceB]]) {
      const disc = new T.Mesh(new T.CircleGeometry(2.15, 64), m);
      disc.position.z = z; if (z < 0) disc.rotation.y = Math.PI;
      this.group.add(disc);
    }
    const dialGeo = new T.CylinderGeometry(.46, .46, .05, 40), handShape = new T.Shape();
    handShape.moveTo(-.07, -.08); handShape.lineTo(.07, -.08); handShape.lineTo(.03, .36); handShape.lineTo(0, .42); handShape.lineTo(-.03, .36); handShape.closePath();
    const handGeo = new T.ExtrudeGeometry(handShape, { depth: .03, bevelEnabled: false });
    const markGeo = new T.CircleGeometry(.045, 16), hubGeo = new T.CylinderGeometry(.08, .08, .06, 20);
    const makeDial = (x, y, back) => {
      const g = new T.Group(); g.position.set(x, y, back ? -t : t); if (back) g.rotation.y = Math.PI;
      const d = new T.Mesh(dialGeo, back ? dialB : dialA); d.rotation.x = Math.PI / 2; d.position.z = .03; g.add(d);
      const mk = new T.Mesh(markGeo, mark); mk.position.set(0, .37, .061); g.add(mk);
      const pivot = new T.Group(); pivot.position.z = .06; g.add(pivot);
      pivot.add(new T.Mesh(handGeo, back ? handB : handA));
      const hub = new T.Mesh(hubGeo, back ? handB : handA); hub.rotation.x = Math.PI / 2; hub.position.z = .02; pivot.add(hub);
      this.group.add(g);
      return pivot;
    };
    this.pivA = []; this.pivB = [];
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      this.pivA.push(makeDial((c - 1) * S, (1 - r) * S, false));
      this.pivB.push(makeDial(-(c - 1) * S, (1 - r) * S, true));
    }
    const pinGeo = new T.CylinderGeometry(.1, .1, .62, 20);
    this.pins = {};
    for (const [name, x, y] of [['UL', -S / 2, S / 2], ['UR', S / 2, S / 2], ['DL', -S / 2, -S / 2], ['DR', S / 2, -S / 2]]) {
      const pin = new T.Mesh(pinGeo, pinM); pin.rotation.x = Math.PI / 2; pin.position.set(x, y, 0);
      this.group.add(pin); this.pins[name] = pin;
    }
    const wheelGeo = new T.CylinderGeometry(.36, .36, .5, 40), wheelM = mat('#F0213A', .55), ridgeGeo = new T.TorusGeometry(.36, .025, 8, 40);
    for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const wh = new T.Mesh(wheelGeo, wheelM); wh.rotation.x = Math.PI / 2; wh.position.set(x * 1.6, y * 1.6, 0); this.group.add(wh);
      for (const z of [-.12, 0, .12]) { const rg = new T.Mesh(ridgeGeo, wheelM); rg.position.set(x * 1.6, y * 1.6, z); this.group.add(rg); }
    }
    this.reset();
  }
  parse(alg) { return parseClock(alg); }
  reset() {
    this.st = clockSolved(); this.flipBase = 0; this.group.rotation.y = 0; this.pinsSet = false;
    for (const p of [...this.pivA, ...this.pivB]) { p.ang = 0; p.rotation.z = 0; }
    this.upOnA = { UL: false, UR: false, DL: false, DR: false };
    for (const k in this.pins) this.pins[k].position.z = this.pinZ(false);
  }
  pinZ(upA) { return upA ? .33 : -.33; }
  physPin(name) { return this.st.flipped ? { UL: 'UR', UR: 'UL', DL: 'DR', DR: 'DL' }[name] : name; }
  dur(mv) { return mv.type === 'flip' ? 1.8 : mv.type === 'pin' ? .6 : 1 + Math.abs(mv.amt) / 5; }
  select(mv) {
    const front = this.st.flipped ? this.pivB : this.pivA, back = this.st.flipped ? this.pivA : this.pivB;
    if (mv.type === 'flip') return { from: this.flipBase };
    const pinTarget = {};
    if (mv.type === 'pin') {
      if (!this.pinsSet) for (const k of ['UL', 'UR', 'DL', 'DR']) pinTarget[this.physPin(k)] = !this.st.flipped ? false : true;
      const ph = this.physPin(mv.pin); pinTarget[ph] = !this.st.flipped;
      return { pins: this.pinMoves(pinTarget), hands: [] };
    }
    for (const k of ['UL', 'UR', 'DL', 'DR']) { const up = mv.pins.includes(k); pinTarget[this.physPin(k)] = this.st.flipped ? !up : up; }
    const hit = new Set(), hands = [];
    for (const p of mv.pins) for (const i of CLOCK_BLOCK[p]) hit.add(i);
    for (const i of hit) hands.push({ piv: front[i], to: front[i].ang - mv.amt * Math.PI / 6 });
    for (const p of mv.pins) { const j = CLOCK_MIRROR[CLOCK_CORNER[p]]; hands.push({ piv: back[j], to: back[j].ang + mv.amt * Math.PI / 6 }); }
    for (const hd of hands) hd.from = hd.piv.ang;
    return { pins: this.pinMoves(pinTarget), hands };
  }
  pinMoves(target) {
    return Object.entries(target).map(([k, up]) => ({ mesh: this.pins[k], k, up, from: this.pins[k].position.z, to: this.pinZ(up) }));
  }
  pose(mv, sel, e) {
    if (mv.type === 'flip') { this.group.rotation.y = sel.from + Math.PI * e; return; }
    const ep = clamp(e / .3, 0, 1), eh = clamp((e - .3) / .7, 0, 1);
    for (const p of sel.pins) p.mesh.position.z = p.from + (p.to - p.from) * ep;
    for (const hd of sel.hands) hd.piv.rotation.z = hd.from + (hd.to - hd.from) * eh;
  }
  commit(mv, sel) {
    if (mv.type === 'flip') { this.flipBase += Math.PI; this.group.rotation.y = this.flipBase; clockStep(this.st, mv); return; }
    for (const p of sel.pins) { p.mesh.position.z = p.to; this.upOnA[p.k] = p.up; }
    for (const hd of sel.hands) { hd.piv.ang = hd.to; hd.piv.rotation.z = hd.to; }
    if (mv.type === 'pin') this.pinsSet = true;
    clockStep(this.st, mv);
  }
}

// ---------- shared renderer ----------
class Cube3D {
  constructor() {
    this.el = h('div', { class: 'cube3d' });
    this.netEl = h('div', { class: 'net', hidden: true });
    this.msgEl = h('div', { class: 'preview-empty', hidden: true });
    this.el.append(this.netEl, this.msgEl);
    this.view = null; this.moves = []; this.index = 0; this.anim = null; this.req = null;
    this.mode = Store.settings.previewMode; this.style = Store.settings.cubeStyle;
    this.gl = false; this.failed = false; this.raf = 0; this.vel = [0, 0]; this.geoCache = {};
    threeLib.then(lib => {
      if (lib) { try { this._init(lib); } catch (e) { console.warn(e); this.failed = true; } }
      else this.failed = true;
      if (this.req) this._apply(this.req.animate);
    });
  }

  // req: { kind: 'nxn' | 'pyram' | 'skewb' | 'minx' | 'sq1' | 'clock', n, alg, faceMap, animate, onMove(tokenIndex | Infinity) }
  show(req) { this.req = Object.assign({ kind: 'nxn' }, req); this._apply(req.animate); }
  replay() { if (this.req) this._apply(true); }
  setMode(mode) { this.mode = mode; if (this.req) this._apply(false); }
  setStyle(style) {
    this.style = style;
    if (!this.gl) return;
    this.styleMats(this.stickerMats);
    this.styleMats(this.moldMats);
    this._styleBody();
    this.view = null;
    if (this.req) this._apply(false);
  }
  refreshColors() { if (this.req) { this._colors(this.req.faceMap); if (!this.netEl.hidden) this._apply(false); this._kick(); } }
  mount(host) { if (this.el.parentNode !== host) host.append(this.el); if (this.gl) this._resize(); }
  get playing() { return !!this.anim; }

  finish() {
    if (!this.gl || !this.view || (!this.anim && this.index >= this.moves.length)) return;
    if (this.anim) { this.view.commit(this.anim.mv, this.anim.sel); this.index++; this.anim = null; }
    while (this.index < this.moves.length) { const mv = this.moves[this.index++]; this.view.commit(mv, this.view.select(mv)); }
    this.req && this.req.onMove && this.req.onMove(Infinity);
    this._kick();
  }

  goHome() { if (!this.gl) return; this.spin = false; this.homeAnim = { from: this.root.quaternion.clone(), t0: performance.now() }; this._kick(); }

  _apply(animate) {
    const r = this.req, done = () => r.onMove && r.onMove(Infinity);
    const isCube = r.kind === 'nxn';
    this.msgEl.hidden = true;
    if (isCube && !r.n) { this.netEl.hidden = true; if (this.canvas) this.canvas.style.visibility = 'hidden'; done(); return; }
    if (isCube && (this.mode === 'net' || this.failed || !this.gl)) {
      this.netEl.innerHTML = netSVG(new CubeState(r.n).apply(r.alg), paletteFor(r.faceMap));
      this.netEl.hidden = false;
      if (this.canvas) this.canvas.style.visibility = 'hidden';
      this.anim = null;
      done();
      return;
    }
    this.netEl.hidden = true;
    if (!this.gl) {
      if (this.failed) { this.msgEl.textContent = 'The 3D preview could not load in this browser.'; this.msgEl.hidden = false; }
      done();
      return;
    }
    this.canvas.style.visibility = '';
    const key = (isCube ? 'nxn' + r.n : r.kind) + this.style;
    if (!this.view || this.view.key !== key) {
      this.puzzle.clear();
      this.view = isCube ? new NxnView(this, r.n) : r.kind === 'clock' ? new ClockView(this) : new PieceView(this, r.kind);
      this.puzzle.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const hm = this.view.home || DEFAULT_HOME;
      this.home = new THREE.Quaternion().setFromEuler(new THREE.Euler(hm[0], hm[1], 0, 'XYZ'));
      this.root.quaternion.copy(this.home);
    } else this.view.reset();
    this._colors(r.faceMap);
    this.moves = this.view.parse(r.alg); this.index = 0; this.anim = null;
    if (!animate || !this.moves.length) {
      for (const mv of this.moves) this.view.commit(mv, this.view.select(mv));
      this.index = this.moves.length;
      done();
    } else {
      const speed = { slow: 1.7, normal: 1, fast: .55 }[Store.settings.animSpeed] || 1;
      const base = r.kind === 'clock' ? 3200 : 2300;
      this.moveDur = clamp(base / this.moves.length, 26, r.kind === 'clock' ? 260 : 125) * speed;
      this._startMove(performance.now());
      if (this.root.quaternion.angleTo(this.home) > .02 && !this.homeAnim) this.goHome();
      r.onMove && r.onMove(this.moves[0].ti);
    }
    this._kick();
  }

  _init(lib) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.el.prepend(this.canvas);

    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new lib.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(24, 1, .1, 100);
    this.camera.position.set(0, 0, 12.4);
    // Key light casts soft shadows (layers shade each other mid-turn), fill
    // lifts the shadow side, and a rim light from behind catches the sheen.
    const key = new THREE.DirectionalLight(0xffffff, 1.65); key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3.6, right: 3.6, top: 3.6, bottom: -3.6, near: 1, far: 18 });
    key.shadow.bias = -.0004; key.shadow.normalBias = .025; key.shadow.radius = 3;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, .7); fill.position.set(-5, -1, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, .55); rim.position.set(-2, 4, -6); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, .75));

    this.root = new THREE.Group(); scene.add(this.root);
    this.home = new THREE.Quaternion().setFromEuler(new THREE.Euler(DEFAULT_HOME[0], DEFAULT_HOME[1], 0, 'XYZ'));
    this.root.quaternion.copy(this.home);
    this.puzzle = new THREE.Group(); this.root.add(this.puzzle);

    this.bodyGeo = new lib.RoundedBoxGeometry(1, 1, 1, 3, .11);
    this.coreGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tileGeos = {};
    // Plastic: a fine noise normal and roughness map for a frosted matte grain,
    // plus a soft white sheen at grazing angles. Stickers stay smooth vinyl.
    this.grain = grainTextures(renderer.capabilities.getMaxAnisotropy());
    this.plastic = (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
      metalness: 0, roughness: .62, sheen: .2, sheenRoughness: .5, sheenColor: new THREE.Color(1, 1, 1),
      normalMap: this.grain.normal, normalScale: new THREE.Vector2(.45, .45), roughnessMap: this.grain.rough,
    }, o));
    this.bodyMat = this.plastic();
    this.stickerMats = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ metalness: 0 }));
    this.moldMats = Array.from({ length: 6 }, () => this.plastic({ vertexColors: true }));
    this.moldBody = this.plastic({ vertexColors: true });
    this.smoothMats = [...this.moldMats, this.moldBody];
    this.styleMats(this.moldMats);
    this.axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    this._q = new THREE.Quaternion(); this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this.styleMats(this.stickerMats);
    this._styleBody();
    this.gl = true;
    this._bindPointer();
    new ResizeObserver(() => this._resize()).observe(this.el);
    this._resize();
  }

  _styleBody() {
    const st = styleOf(this.style);
    this.bodyMat.color.set(st.body);
    this.bodyMat.roughness = st.bodyRough;
    this.moldBody.color.set(st.body);
    this.moldBody.roughness = st.bodyRough;
  }
  styleMats(mats) {
    const st = styleOf(this.style);
    for (const m of mats) { m.roughness = st.rough; m.envMapIntensity = st.env; }
  }
  tint(mats, colors) {
    const glow = styleOf(this.style).glow;
    mats.forEach((mat, i) => { mat.color.set(colors[i]); mat.emissive.copy(mat.color).multiplyScalar(glow); });
  }

  // Rounded square tile for cubies (one shared geometry per style).
  cubeTile() {
    const st = styleOf(this.style), key = this.style;
    if (this.tileGeos[key]) return this.tileGeos[key];
    const s = st.size / 2 - (st.depth ? st.bevel : 0), r = Math.max(.02, st.radius - (st.depth ? st.bevel : 0)), sh = new THREE.Shape();
    sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r);
    sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s);
    sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r);
    sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
    let geo;
    if (st.depth) {
      geo = new THREE.ExtrudeGeometry(sh, { depth: st.depth, bevelEnabled: true, bevelThickness: st.bevel, bevelSize: st.bevel, bevelSegments: 3, curveSegments: 6 });
      geo.translate(0, 0, .512 - st.depth - st.bevel);
    } else {
      geo = new THREE.ShapeGeometry(sh, 5);
      geo.translate(0, 0, .502);
    }
    return (this.tileGeos[key] = geo);
  }

  _colors(faceMap) {
    if (!this.gl) return;
    const pal = paletteFor(faceMap);
    this.tint(this.stickerMats, pal);
    this.tint(this.moldMats, pal);
  }

  _startMove(t0) {
    const mv = this.moves[this.index];
    this.anim = { mv, sel: this.view.select(mv), t0, dur: this.moveDur * this.view.dur(mv) };
  }

  _kick() { if (this.gl && !this.raf) this.raf = requestAnimationFrame(t => this._frame(t)); }

  _frame(now) {
    this.raf = 0;
    if (this.anim) {
      const a = this.anim, t = (now - a.t0) / a.dur;
      if (t >= 1) {
        this.view.commit(a.mv, a.sel);
        this.index++;
        this.anim = null;
        if (this.index < this.moves.length) {
          const end = a.t0 + a.dur;
          this._startMove(now - end < 40 ? end : now);
          this.view.pose(this.anim.mv, this.anim.sel, easeInOut(clamp((now - this.anim.t0) / this.anim.dur, 0, 1)));
        }
        const cb = this.req && this.req.onMove;
        cb && cb(this.index < this.moves.length ? this.moves[this.index].ti : Infinity);
      } else this.view.pose(a.mv, a.sel, easeInOut(clamp(t, 0, 1)));
    }
    if (this.spin) {
      this._rotate(this.vel[0], this.vel[1]);
      this.vel[0] *= .93; this.vel[1] *= .93;
      if (Math.hypot(this.vel[0], this.vel[1]) < .04) this.spin = false;
    }
    if (this.homeAnim) {
      const t = Math.min(1, (now - this.homeAnim.t0) / 420);
      this.root.quaternion.slerpQuaternions(this.homeAnim.from, this.home, easeInOut(t));
      if (t >= 1) this.homeAnim = null;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.anim || this.spin || this.homeAnim) this._kick();
  }

  _rotate(dx, dy) {
    const k = .0085;
    this._qa.setFromAxisAngle(this.axes[1], dx * k);
    this._qb.setFromAxisAngle(this.axes[0], dy * k);
    this.root.quaternion.premultiply(this._qa).premultiply(this._qb);
  }

  _bindPointer() {
    const el = this.el;
    let last = null;
    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.stopPropagation();
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.vel = [0, 0]; this.spin = false; this.homeAnim = null;
      el.setPointerCapture(e.pointerId);
      el.classList.add('grabbing');
    });
    el.addEventListener('pointermove', e => {
      if (!last) return;
      const now = performance.now(), dx = e.clientX - last.x, dy = e.clientY - last.y, dt = Math.max(8, now - last.t);
      last = { x: e.clientX, y: e.clientY, t: now };
      this._rotate(dx, dy);
      this.vel = [dx / dt * 16, dy / dt * 16];
      this._kick();
    });
    const end = () => {
      if (!last) return;
      if (performance.now() - last.t > 80) this.vel = [0, 0];
      last = null;
      el.classList.remove('grabbing');
      if (Math.hypot(this.vel[0], this.vel[1]) > .5) { this.spin = true; this._kick(); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', e => { e.stopPropagation(); this.goHome(); });
  }

  _resize() {
    const w = this.el.clientWidth, hh = this.el.clientHeight;
    if (!w || !hh) return;
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh;
    this.camera.position.z = (this.el.clientWidth > 420 ? 14 : 12.4) * Math.max(1, 1 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this._kick();
  }
}
