// ---------------------------------------------------------------------------
// Random-state scrambler. A compact Kociemba two-phase solver for 3x3 and a
// full distance table for 2x2. This function is stringified into a Web Worker
// (falls back to the main thread), so it must not reference outer scope.
// ---------------------------------------------------------------------------
function solverMain(self) {
  const CP = [[3,0,1,2,4,5,6,7],[4,1,2,0,7,5,6,3],[1,5,2,3,0,4,6,7],[0,1,2,3,5,6,7,4],[0,2,6,3,4,1,5,7],[0,1,3,7,4,5,2,6]];
  const CO = [[0,0,0,0,0,0,0,0],[2,0,0,1,1,0,0,2],[1,2,0,0,2,1,0,0],[0,0,0,0,0,0,0,0],[0,1,2,0,0,2,1,0],[0,0,1,2,0,0,2,1]];
  const EP = [[3,0,1,2,4,5,6,7,8,9,10,11],[8,1,2,3,11,5,6,7,4,9,10,0],[0,9,2,3,4,8,6,7,1,5,10,11],[0,1,2,3,5,6,7,4,8,9,10,11],[0,1,10,3,4,5,9,7,8,2,6,11],[0,1,2,11,4,5,6,10,8,9,3,7]];
  const EO = [[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0],[0,1,0,0,0,1,0,0,1,1,0,0],[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,1,0,0,1,1]];
  const FN = 'URFDLB', SUF = ['', '2', "'"];

  const rand = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };

  function cornMove(cp, co, f) {
    const p = CP[f], o = CO[f], a = cp.slice(), b = co.slice();
    for (let i = 0; i < 8; i++) { cp[i] = a[p[i]]; co[i] = (b[p[i]] + o[i]) % 3; }
  }
  function edgeMove(ep, eo, f) {
    const p = EP[f], o = EO[f], a = ep.slice(), b = eo.slice();
    for (let i = 0; i < 12; i++) { ep[i] = a[p[i]]; eo[i] = (b[p[i]] + o[i]) % 2; }
  }

  const Cnk = [];
  for (let i = 0; i < 13; i++) {
    Cnk[i] = [];
    for (let j = 0; j < 13; j++) Cnk[i][j] = j > i ? 0 : (j === 0 || j === i) ? 1 : Cnk[i - 1][j - 1] + Cnk[i - 1][j];
  }

  const getTwist = co => { let t = 0; for (let i = 0; i < 7; i++) t = t * 3 + co[i]; return t; };
  function setTwist(t) {
    const co = new Array(8); let s = 0;
    for (let i = 6; i >= 0; i--) { co[i] = t % 3; s += co[i]; t = (t / 3) | 0; }
    co[7] = (3 - s % 3) % 3; return co;
  }
  const getFlip = eo => { let t = 0; for (let i = 0; i < 11; i++) t = t * 2 + eo[i]; return t; };
  function setFlip(t) {
    const eo = new Array(12); let s = 0;
    for (let i = 10; i >= 0; i--) { eo[i] = t & 1; s += eo[i]; t >>= 1; }
    eo[11] = s & 1; return eo;
  }
  function getSlice(ep) {
    let s = 0, k = 4;
    for (let i = 11; i >= 0; i--) if (ep[i] >= 8) { s += Cnk[i][k]; k--; }
    return s;
  }
  function setSlice(s) {
    const ep = new Array(12); let k = 4, a = 8, b = 0;
    for (let i = 11; i >= 0; i--) {
      if (k > 0 && Cnk[i][k] <= s) { s -= Cnk[i][k]; k--; ep[i] = a++; }
      else ep[i] = b++;
    }
    return ep;
  }
  function permIdx(a, n, off) {
    let idx = 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = i + 1; j < n; j++) if (a[off + j] < a[off + i]) c++;
      idx = idx * (n - i) + c;
    }
    return idx;
  }
  function idxPerm(idx, n) {
    const c = new Array(n);
    for (let i = n - 1; i >= 0; i--) { c[i] = idx % (n - i); idx = Math.floor(idx / (n - i)); }
    const avail = []; for (let i = 0; i < n; i++) avail.push(i);
    return c.map(ci => avail.splice(ci, 1)[0]);
  }
  function parity(a) {
    let p = 0;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[j] < a[i]) p ^= 1;
    return p;
  }

  // BFS distance table over a product of two coordinates.
  function bfs(nA, mA, nB, mB, nm, goal) {
    const size = nA * nB, t = new Int8Array(size).fill(-1);
    t[goal] = 0; let d = 0, filled = 1;
    while (filled < size) {
      let changed = 0;
      for (let i = 0; i < size; i++) {
        if (t[i] !== d) continue;
        const a = (i / nB) | 0, b = i - a * nB;
        for (let m = 0; m < nm; m++) {
          const j = mA[a * nm + m] * nB + mB[b * nm + m];
          if (t[j] === -1) { t[j] = d + 1; filled++; changed++; }
        }
      }
      if (!changed) break;
      d++;
    }
    return t;
  }

  const fmt = moves => moves.map(m => FN[(m / 3) | 0] + SUF[m % 3]).join(' ');
  const invert = moves => moves.slice().reverse().map(m => ((m / 3) | 0) * 3 + (2 - m % 3));

  // ---------------- 3x3 two-phase ----------------
  const SLICE_SOLVED = 494;
  const P2 = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];
  let T = null;

  function init333() {
    if (T) return T;
    const twM = new Uint16Array(2187 * 18), flM = new Uint16Array(2048 * 18), slM = new Uint16Array(495 * 18);
    for (let i = 0; i < 2187; i++) for (let f = 0; f < 6; f++) {
      const cp = [0,1,2,3,4,5,6,7], co = setTwist(i);
      for (let p = 0; p < 3; p++) { cornMove(cp, co, f); twM[i * 18 + f * 3 + p] = getTwist(co); }
    }
    for (let i = 0; i < 2048; i++) for (let f = 0; f < 6; f++) {
      const ep = [0,1,2,3,4,5,6,7,8,9,10,11], eo = setFlip(i);
      for (let p = 0; p < 3; p++) { edgeMove(ep, eo, f); flM[i * 18 + f * 3 + p] = getFlip(eo); }
    }
    for (let i = 0; i < 495; i++) for (let f = 0; f < 6; f++) {
      const ep = setSlice(i), eo = new Array(12).fill(0);
      for (let p = 0; p < 3; p++) { edgeMove(ep, eo, f); slM[i * 18 + f * 3 + p] = getSlice(ep); }
    }
    const cpM = new Uint16Array(40320 * 10), epM = new Uint16Array(40320 * 10), spM = new Uint16Array(24 * 10);
    for (let i = 0; i < 40320; i++) {
      const base = idxPerm(i, 8);
      for (let k = 0; k < 10; k++) {
        const m = P2[k], f = (m / 3) | 0;
        const cp = base.slice(), co = [0,0,0,0,0,0,0,0];
        const ep = base.concat([8, 9, 10, 11]), eo = new Array(12).fill(0);
        for (let p = 0; p <= m % 3; p++) { cornMove(cp, co, f); edgeMove(ep, eo, f); }
        cpM[i * 10 + k] = permIdx(cp, 8, 0);
        epM[i * 10 + k] = permIdx(ep, 8, 0);
      }
    }
    for (let i = 0; i < 24; i++) {
      const base = [0,1,2,3,4,5,6,7].concat(idxPerm(i, 4).map(x => x + 8));
      for (let k = 0; k < 10; k++) {
        const m = P2[k], f = (m / 3) | 0, ep = base.slice(), eo = new Array(12).fill(0);
        for (let p = 0; p <= m % 3; p++) edgeMove(ep, eo, f);
        spM[i * 10 + k] = permIdx(ep, 4, 8);
      }
    }
    T = {
      twM, flM, slM, cpM, epM, spM,
      p1t: bfs(495, slM, 2187, twM, 18, SLICE_SOLVED * 2187),
      p1f: bfs(495, slM, 2048, flM, 18, SLICE_SOLVED * 2048),
      p2c: bfs(24, spM, 40320, cpM, 10, 0),
      p2e: bfs(24, spM, 40320, epM, 10, 0),
    };
    return T;
  }

  function applyMoves(c, moves) {
    const cp = c.cp.slice(), co = c.co.slice(), ep = c.ep.slice(), eo = c.eo.slice();
    for (const m of moves) {
      const f = (m / 3) | 0;
      for (let p = 0; p <= m % 3; p++) { cornMove(cp, co, f); edgeMove(ep, eo, f); }
    }
    return { cp, co, ep, eo };
  }

  function solve333(cube, maxLen, nodeLimit) {
    const { twM, flM, slM, cpM, epM, spM, p1t, p1f, p2c, p2e } = init333();
    const sol1 = [], sol2 = [];
    let nodes = 0, result = null, aborted = false;

    function ph2(cp, ep, sp, depth, last) {
      if (depth === 0) return cp === 0 && ep === 0 && sp === 0;
      if (++nodes > nodeLimit) { aborted = true; return false; }
      for (let k = 0; k < 10; k++) {
        const m = P2[k], f = (m / 3) | 0;
        if (f === last || f === last - 3) continue;
        const ncp = cpM[cp * 10 + k], nep = epM[ep * 10 + k], nsp = spM[sp * 10 + k];
        const h = Math.max(p2c[nsp * 40320 + ncp], p2e[nsp * 40320 + nep]);
        if (h >= depth) continue;
        sol2.push(m);
        if (ph2(ncp, nep, nsp, depth - 1, f)) return true;
        sol2.pop();
        if (aborted) return false;
      }
      return false;
    }

    function startPh2() {
      const c = applyMoves(cube, sol1);
      const cp = permIdx(c.cp, 8, 0), ep = permIdx(c.ep, 8, 0), sp = permIdx(c.ep, 4, 8);
      const last = sol1.length ? (sol1[sol1.length - 1] / 3) | 0 : -1;
      const h = Math.max(p2c[sp * 40320 + cp], p2e[sp * 40320 + ep]);
      const max2 = Math.min(maxLen - sol1.length, 18);
      for (let d = h; d <= max2; d++) {
        sol2.length = 0;
        if (ph2(cp, ep, sp, d, last)) { result = sol1.concat(sol2); return true; }
        if (aborted) return false;
      }
      return false;
    }

    function ph1(tw, fl, sl, depth, last) {
      if (depth === 0) {
        if (tw !== 0 || fl !== 0 || sl !== SLICE_SOLVED) return false;
        if (sol1.length) {
          const lm = sol1[sol1.length - 1], f = (lm / 3) | 0;
          if (f === 0 || f === 3 || lm % 3 === 1) return false;
        }
        return startPh2();
      }
      if (++nodes > nodeLimit) { aborted = true; return false; }
      for (let f = 0; f < 6; f++) {
        if (f === last || f === last - 3) continue;
        for (let p = 0; p < 3; p++) {
          const m = f * 3 + p;
          const ntw = twM[tw * 18 + m], nfl = flM[fl * 18 + m], nsl = slM[sl * 18 + m];
          const h = Math.max(p1t[nsl * 2187 + ntw], p1f[nsl * 2048 + nfl]);
          if (h >= depth) continue;
          sol1.push(m);
          if (ph1(ntw, nfl, nsl, depth - 1, f)) return true;
          sol1.pop();
          if (aborted) return false;
        }
      }
      return false;
    }

    const tw = getTwist(cube.co), fl = getFlip(cube.eo), sl = getSlice(cube.ep);
    for (let d = 0; d <= maxLen; d++) {
      sol1.length = 0;
      if (ph1(tw, fl, sl, d, -1)) return result;
      if (aborted) return null;
    }
    return null;
  }

  function solveBudget(c) {
    return solve333(c, 21, 60000) || solve333(c, 22, 400000) || solve333(c, 30, Infinity);
  }

  function randomCube() {
    const cp = idxPerm(rand(40320), 8), ep = idxPerm(rand(479001600), 12);
    if (parity(cp) !== parity(ep)) { const t = ep[0]; ep[0] = ep[1]; ep[1] = t; }
    return { cp, co: setTwist(rand(2187)), ep, eo: setFlip(rand(2048)) };
  }

  function scramble333() {
    for (;;) {
      const sol = solveBudget(randomCube());
      if (sol && sol.length >= 2) return fmt(invert(sol));
    }
  }

  // Facelet string (URFDLB, 54 chars) -> cubie cube.
  const CF = [[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
  const EF = [[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
  const CC = ['URF','UFL','ULB','UBR','DFR','DLF','DBL','DRB'];
  const EC = ['UR','UF','UL','UB','DR','DF','DL','DB','FR','FL','BL','BR'];
  function fromFacelets(s) {
    const cp = [], co = [], ep = [], eo = [];
    for (let i = 0; i < 8; i++) {
      let ori = 0;
      for (; ori < 3; ori++) { const ch = s[CF[i][ori]]; if (ch === 'U' || ch === 'D') break; }
      const c1 = s[CF[i][(ori + 1) % 3]], c2 = s[CF[i][(ori + 2) % 3]];
      for (let j = 0; j < 8; j++) if (CC[j][1] === c1 && CC[j][2] === c2) { cp[i] = j; co[i] = ori % 3; }
    }
    for (let i = 0; i < 12; i++) {
      const a = s[EF[i][0]], b = s[EF[i][1]];
      for (let j = 0; j < 12; j++) {
        if (EC[j][0] === a && EC[j][1] === b) { ep[i] = j; eo[i] = 0; }
        else if (EC[j][0] === b && EC[j][1] === a) { ep[i] = j; eo[i] = 1; }
      }
    }
    return { cp, co, ep, eo };
  }

  function solveFacelets(s) {
    const sol = solveBudget(fromFacelets(s));
    return sol ? fmt(invert(sol)) : '';
  }

  // ---------------- 2x2 (DBL corner fixed, moves U R F) ----------------
  const POS = [0, 1, 2, 3, 4, 5, 7];
  let T2 = null;
  const get2p = cp => permIdx(POS.map(p => POS.indexOf(cp[p])), 7, 0);
  function set2p(i) {
    const a = idxPerm(i, 7), cp = new Array(8); cp[6] = 6;
    for (let k = 0; k < 7; k++) cp[POS[k]] = POS[a[k]];
    return cp;
  }
  const get2t = co => { let t = 0; for (let k = 0; k < 6; k++) t = t * 3 + co[POS[k]]; return t; };
  function set2t(t) {
    const co = new Array(8).fill(0); let s = 0;
    for (let k = 5; k >= 0; k--) { co[POS[k]] = t % 3; s += co[POS[k]]; t = (t / 3) | 0; }
    co[7] = (3 - s % 3) % 3; return co;
  }
  function init222() {
    if (T2) return T2;
    const pM = new Uint16Array(5040 * 9), tM = new Uint16Array(729 * 9);
    for (let i = 0; i < 5040; i++) for (let f = 0; f < 3; f++) {
      const cp = set2p(i), co = new Array(8).fill(0);
      for (let p = 0; p < 3; p++) { cornMove(cp, co, f); pM[i * 9 + f * 3 + p] = get2p(cp); }
    }
    for (let i = 0; i < 729; i++) for (let f = 0; f < 3; f++) {
      const cp = [0,1,2,3,4,5,6,7], co = set2t(i);
      for (let p = 0; p < 3; p++) { cornMove(cp, co, f); tM[i * 9 + f * 3 + p] = get2t(co); }
    }
    T2 = { pM, tM, dist: bfs(5040, pM, 729, tM, 9, 0) };
    return T2;
  }
  function scramble222() {
    const { pM, tM, dist } = init222();
    for (;;) {
      const idx = rand(5040 * 729);
      if (dist[idx] < 4) continue;
      let p = (idx / 729) | 0, t = idx % 729, last = -1;
      const sol = [];
      while (dist[p * 729 + t] > 0) {
        const d = dist[p * 729 + t];
        for (let m = 0; m < 9; m++) {
          if (((m / 3) | 0) === last) continue;
          const np = pM[p * 9 + m], nt = tM[t * 9 + m];
          if (dist[np * 729 + nt] === d - 1) { sol.push(m); p = np; t = nt; last = (m / 3) | 0; break; }
        }
      }
      return fmt(invert(sol));
    }
  }

  // ---------------- piece puzzles (Pyraminx, Skewb) ----------------
  // The model (from the puzzle geometry) gives each move's piece cycles and
  // twists. Orbits of pieces become coordinates, pruning tables cover pairs of
  // coordinates, and random states come from a long lazy random walk.
  const fact = [1];
  for (let i = 1; i < 13; i++) fact.push(fact[i - 1] * i);
  const PZ = {};
  function initPz(key, model) {
    if (PZ[key]) return PZ[key];
    const P = model.ori.length, nm = model.moves.length, parent = [];
    for (let i = 0; i < P; i++) parent.push(i);
    const root = x => (parent[x] === x ? x : (parent[x] = root(parent[x])));
    for (const m of model.moves) m.to.forEach((j, i) => { parent[root(i)] = root(j); });
    const orbits = {}, fixed = {}, groups = [];
    for (let i = 0; i < P; i++) (orbits[root(i)] = orbits[root(i)] || []).push(i);
    for (const list of Object.values(orbits)) {
      const o = model.ori[list[0]];
      if (list.length > 1) groups.push({ pcs: list, moving: true });
      else if (o > 1) (fixed[o] = fixed[o] || []).push(list[0]);
    }
    for (const list of Object.values(fixed)) groups.push({ pcs: list, moving: false });
    for (const g of groups) {
      const k = g.pcs.length, o = model.ori[g.pcs[0]], nO = o ** k, local = {};
      g.pcs.forEach((p, i) => { local[p] = i; });
      g.size = (g.moving ? fact[k] : 1) * nO;
      g.mt = new Uint32Array(g.size * nm);
      for (let c = 0; c < g.size; c++) {
        const perm = g.moving ? idxPerm(Math.floor(c / nO), k) : g.pcs.map((x, i) => i), ori = new Array(k);
        for (let i = k - 1, oc = c % nO; i >= 0; i--) { ori[i] = oc % o; oc = Math.floor(oc / o); }
        model.moves.forEach((m, mi) => {
          const np = new Array(k), no = new Array(k);
          for (let sl = 0; sl < k; sl++) { const gs = g.pcs[sl], t = local[m.to[gs]]; np[t] = perm[sl]; no[t] = (ori[sl] + m.tw[gs]) % o; }
          let oi = 0;
          for (let i = 0; i < k; i++) oi = oi * o + no[i];
          g.mt[c * nm + mi] = (g.moving ? permIdx(np, k, 0) : 0) * nO + oi;
        });
      }
    }
    const tables = [], zero = new Uint32Array(nm);
    if (groups.length === 1) tables.push({ i: -1, j: 0, nb: groups[0].size, t: bfs(1, zero, groups[0].size, groups[0].mt, nm, 0) });
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (groups[i].size * groups[j].size > 4e6) continue;
      tables.push({ i, j, nb: groups[j].size, t: bfs(groups[i].size, groups[i].mt, groups[j].size, groups[j].mt, nm, 0) });
    }
    const heur = cs => {
      let v = 0;
      for (const tb of tables) { const d = tb.t[(tb.i < 0 ? 0 : cs[tb.i]) * tb.nb + cs[tb.j]]; if (d > v) v = d; }
      return v;
    };
    const step = (cs, m) => cs.map((c, gi) => groups[gi].mt[c * nm + m]);
    function solve(cs) {
      const sol = [];
      const search = (st, depth, lastAxis) => {
        const hv = heur(st);
        if (hv === 0) return true;
        if (hv > depth) return false;
        for (let m = 0; m < nm; m++) {
          if (model.moves[m].axis === lastAxis) continue;
          sol.push(m);
          if (search(step(st, m), depth - 1, model.moves[m].axis)) return true;
          sol.pop();
        }
        return false;
      };
      for (let d = 0; d <= 30; d++) { sol.length = 0; if (search(cs, d, -1)) return sol.slice(); }
      return null;
    }
    function randomCoords() {
      let cs = groups.map(() => 0);
      for (let i = 0; i < 800; i++) if (rand(2)) cs = step(cs, rand(nm));
      return cs;
    }
    return (PZ[key] = { groups, tables, solve, randomCoords, step });
  }
  function scramblePz(msg) {
    const T = initPz(msg.key, msg.model), toks = msg.model.moves.map(m => m.tok);
    const inv = t => (t.endsWith("'") ? t.slice(0, -1) : t + "'");
    for (;;) {
      const sol = T.solve(T.randomCoords());
      if (sol && sol.length >= (msg.min || 0)) return sol.slice().reverse().map(m => inv(toks[m])).join(' ');
    }
  }

  function handle(msg) {
    try {
      let result;
      if (msg.type === '333') result = scramble333();
      else if (msg.type === '222') result = scramble222();
      else if (msg.type === 'solve') result = solveFacelets(msg.facelets);
      else if (msg.type === 'pz') result = scramblePz(msg);
      else if (msg.type === 'init') { init333(); result = 'ok'; }
      return { id: msg.id, ok: true, result };
    } catch (e) {
      return { id: msg.id, ok: false, error: String(e && e.message || e) };
    }
  }
  if (self) self.onmessage = e => self.postMessage(handle(e.data));
  return { handle, initPz, scramblePz, solve333, solveBudget, randomCube, applyMoves, fromFacelets, init333, init222, scramble333, scramble222, fmt, invert };
}
