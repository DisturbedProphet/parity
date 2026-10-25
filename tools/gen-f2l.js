// Generates the 41 F2L cases for the front-right slot and an optimal <R, U, F>
// algorithm for each (preferring R and U moves). Prints JSON for 40-algs.js.
const CP = [[3,0,1,2,4,5,6,7],[4,1,2,0,7,5,6,3],[1,5,2,3,0,4,6,7]];
const CO = [[0,0,0,0,0,0,0,0],[2,0,0,1,1,0,0,2],[1,2,0,0,2,1,0,0]];
const EP = [[3,0,1,2,4,5,6,7,8,9,10,11],[8,1,2,3,11,5,6,7,4,9,10,0],[0,9,2,3,4,8,6,7,1,5,10,11]];
const EO = [[0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0],[0,1,0,0,0,1,0,0,1,1,0,0]];
const FACE = 'URF', SUF = ['', '2', "'"];

// Where a piece at position j goes under one turn of face f, and the twist it picks up.
const cTo = [], cAdd = [], eTo = [], eAdd = [];
for (let f = 0; f < 3; f++) {
  cTo[f] = []; cAdd[f] = []; eTo[f] = []; eAdd[f] = [];
  for (let i = 0; i < 8; i++) { cTo[f][CP[f][i]] = i; cAdd[f][CP[f][i]] = CO[f][i]; }
  for (let i = 0; i < 12; i++) { eTo[f][EP[f][i]] = i; eAdd[f][EP[f][i]] = EO[f][i]; }
}
const C_TRACK = [4, 5, 7], E_TRACK = [4, 5, 8, 9, 11];
// state: corners [pos, ori] per tracked corner, edges [pos, ori] per tracked edge
function turn(st, m) {
  const f = Math.floor(m / 3), n = m % 3 + 1, c = st.c.map(x => x.slice()), e = st.e.map(x => x.slice());
  for (let k = 0; k < n; k++) {
    for (const x of c) { const p = x[0]; x[0] = cTo[f][p]; x[1] = (x[1] + cAdd[f][p]) % 3; }
    for (const x of e) { const p = x[0]; x[0] = eTo[f][p]; x[1] = (x[1] + eAdd[f][p]) % 2; }
  }
  return { c, e };
}
const cIdx = c => c.reduce((a, [p, o]) => a * 24 + p * 3 + o, 0);
const eIdx = e => e.reduce((a, [p, o]) => a * 24 + p * 2 + o, 0);
function decode(idx, k, base) {
  const out = [];
  for (let i = k - 1; i >= 0; i--) { const v = idx % 24; idx = Math.floor(idx / 24); out[i] = base === 3 ? [Math.floor(v / 3), v % 3] : [Math.floor(v / 2), v % 2]; }
  return out;
}
function table(k, base, isCorner, goal) {
  const size = 24 ** k, t = new Int8Array(size).fill(-1);
  t[goal] = 0;
  let d = 0, changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < size; i++) {
      if (t[i] !== d) continue;
      const pcs = decode(i, k, base);
      for (let m = 0; m < 9; m++) {
        const st = turn(isCorner ? { c: pcs, e: [] } : { c: [], e: pcs }, m);
        const j = isCorner ? cIdx(st.c) : eIdx(st.e);
        if (t[j] < 0) { t[j] = d + 1; changed = true; }
      }
    }
    d++;
  }
  return t;
}
const solvedC = C_TRACK.map(p => [p, 0]), solvedE = E_TRACK.map(p => [p, 0]);
console.error('building tables…');
const TC = table(3, 3, true, cIdx(solvedC)), TE = table(5, 2, false, eIdx(solvedE));
const h = st => Math.max(TC[cIdx(st.c)], TE[eIdx(st.e)]);

// Every solution up to two moves longer than optimal, so the friendliest can be chosen.
function solveAll(start) {
  if (h(start) < 0) return [];
  const found = [];
  let opt = -1;
  for (let depth = 0; depth <= 14 && (opt < 0 || depth <= opt + 2); depth++) {
    const sol = [];
    const dfs = (st, d, lastF) => {
      const hv = h(st);
      if (d === 0) { if (hv === 0) found.push(sol.slice()); return; }
      if (hv === 0 || hv > d) return;
      for (let m = 0; m < 9; m++) {
        const f = Math.floor(m / 3);
        if (f === lastF) continue;
        sol.push(m); dfs(turn(st, m), d - 1, f); sol.pop();
      }
    };
    dfs(start, depth, -1);
    if (found.length && opt < 0) opt = depth;
  }
  return found;
}
// Finger-friendliness: R and U are easy, F is harder, F2 and R2 cost more.
const COST = { U: 0.9, "U'": 0.9, U2: 1.15, R: 1, "R'": 1, R2: 1.6, F: 1.5, "F'": 1.4, F2: 2.6 };
const fmt = sol => sol.map(m => FACE[Math.floor(m / 3)] + SUF[m % 3]).join(' ');
const score = sol => fmt(sol).split(' ').reduce((a, t) => a + COST[t], 0) + (sol[sol.length - 1] % 3 === 1 ? .3 : 0);
// The case: target corner (piece 4) and edge (piece 8) placed, everything else home.
const caseState = (cp, co, ep, eo) => ({
  c: [[cp, co], [5, 0], [7, 0]],
  e: [[4, 0], [5, 0], [ep, eo], [9, 0], [11, 0]],
});
const U_CORNERS = [0, 1, 2, 3], U_EDGES = [0, 1, 2, 3];
const rotU = (pos, k, isCorner) => (pos < 4 ? (isCorner ? [0, 1, 2, 3] : [0, 1, 2, 3])[(pos + k) % 4] : pos);
// Choose, for each class of cases equal up to AUF, the representative with the best alg.
function best(variants) {
  let pick = null;
  for (const v of variants) for (const sol of solveAll(caseState(...v))) {
    if (!pick || score(sol) < score(pick.sol)) pick = { v, sol };
  }
  return pick;
}
const out = [];
const add = (group, pick) => out.push({ group, alg: fmt(pick.sol), len: pick.sol.length, at: pick.v });
for (let co = 0; co < 3; co++) for (let ep = 0; ep < 4; ep++) for (let eo = 0; eo < 2; eo++)
  add('top', best([0, 1, 2, 3].map(k => [rotU(0, k, true), co, rotU(ep, k, false), eo])));
for (let co = 0; co < 3; co++) for (let eo = 0; eo < 2; eo++)
  add('corner-slot', best([0, 1, 2, 3].map(k => [4, co, k, eo])));
for (let co = 0; co < 3; co++) for (let eo = 0; eo < 2; eo++)
  add('edge-slot', best([0, 1, 2, 3].map(k => [k, co, 8, eo])));
for (let co = 0; co < 3; co++) for (let eo = 0; eo < 2; eo++) {
  if (!co && !eo) continue;
  add('both-slot', best([[4, co, 8, eo]]));
}
console.error(out.length, 'cases, longest', Math.max(...out.map(x => x.len)));
console.log(JSON.stringify(out.map(x => [x.group, x.alg])));
