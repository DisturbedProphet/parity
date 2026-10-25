// Node checks for the cube model, solver, scramblers and alg sets.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src', 'js');
const code = ['10-cube.js', '20-solver.js', '30-scramble.js', '40-algs.js']
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') +
  '\n;globalThis.__x = { CubeState, parseAlg, invertAlg, solverMain, localScramble, EVENTS, ALG_SETS, caseState };';
const ctx = { crypto: globalThis.crypto, console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { CubeState, invertAlg, solverMain, localScramble, EVENTS, ALG_SETS, caseState } = ctx.__x;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. Every move repeated 4x is identity, for all sizes.
for (let n = 2; n <= 7; n++) {
  for (const t of ['R', 'U', 'F', 'L', 'D', 'B', 'Rw', '3Rw', 'x', 'y', 'z', 'M', 'E', 'S', 'r']) {
    if (n < 3 && 'MES'.includes(t)) continue;
    const c = new CubeState(n).apply(`${t} ${t} ${t} ${t}`);
    ok(c.isSolved(), `n=${n} ${t}^4`);
  }
  const s = new CubeState(n).apply(localScramble(EVENTS.find(e => e.n === n).id));
  ok(!s.isSolved(), `scramble n=${n} not solved`);
}

// 2. Sticker model matches the solver's cubie moves.
const api = solverMain(null);
const t0 = Date.now(); api.init333(); console.log('3x3 tables', Date.now() - t0, 'ms');
const solved = { cp: [0,1,2,3,4,5,6,7], co: [0,0,0,0,0,0,0,0], ep: [0,1,2,3,4,5,6,7,8,9,10,11], eo: new Array(12).fill(0) };
for (let m = 0; m < 18; m++) {
  const fromStickers = api.fromFacelets(new CubeState(3).apply(api.fmt([m])).faceletString());
  const fromCubies = api.applyMoves(solved, [m]);
  ok(same(fromStickers, fromCubies), 'cubie/sticker move ' + api.fmt([m]));
}

// 3. Random-state scrambles reproduce the generated state, timing.
let lens = [], times = [];
for (let i = 0; i < 60; i++) {
  const c = api.randomCube();
  const a = Date.now();
  const sol = api.solveBudget(c);
  times.push(Date.now() - a);
  lens.push(sol.length);
  const scr = api.fmt(api.invert(sol));
  const back = api.fromFacelets(new CubeState(3).apply(scr).faceletString());
  ok(same(back, c), 'scramble reproduces state #' + i);
}
times.sort((a, b) => a - b);
console.log('333 len avg', (lens.reduce((a, b) => a + b) / lens.length).toFixed(2), 'max', Math.max(...lens),
  '| ms median', times[times.length >> 1], 'p90', times[Math.floor(times.length * .9)], 'max', times[times.length - 1]);

const t1 = Date.now(); api.init222(); console.log('2x2 tables', Date.now() - t1, 'ms');
for (let i = 0; i < 5; i++) console.log('  222:', api.scramble222());
for (let i = 0; i < 2; i++) console.log('  333:', api.scramble333());

// 4. Alg sets keep F2L, finish the right layer, and give distinct cases.
function f2lSolved(st) {
  const f = st.faces();
  if (!f[3].every(c => c === 3)) return false;
  for (const face of [1, 2, 4, 5]) for (let i = 3; i < 9; i++) if (f[face][i] !== face) return false;
  return true;
}
const SOLVED = new CubeState(3);
// Stickers whose home position passes `keep` are back home and facing the right way.
function piecesHome(st, keep) {
  for (let i = 0; i < st.count; i++) {
    const o = i * 3, hp = [SOLVED.p[o], SOLVED.p[o + 1], SOLVED.p[o + 2]];
    if (!keep(hp)) continue;
    for (let k = 0; k < 3; k++) if (st.p[o + k] !== SOLVED.p[o + k] || st.nr[o + k] !== SOLVED.nr[o + k]) return false;
  }
  return true;
}
const isFR = hp => hp[0] === 2 && hp[2] === 2 && hp[1] < 2;
for (const set of Object.values(ALG_SETS)) {
  const seen = new Map();
  for (const cs of set.cases) {
    const st = new CubeState(3).apply(cs.alg).normalize();
    ok(new CubeState(3).apply(invertAlg(cs.alg)).apply(cs.alg).isSolved(), `${cs.name} inverse round trip`);
    if (cs.mode === 'f2l') {
      const c = caseState(cs.alg);
      ok(piecesHome(c, hp => hp[1] < 2 && !isFR(hp)), `${cs.name} keeps cross and other slots`);
      ok(!piecesHome(c, isFR), `${cs.name} is not already solved`);
    } else {
      ok(f2lSolved(st), `${set.id} ${cs.name} keeps F2L`);
      if (cs.mode === 'pll' || cs.mode === 'cp') ok(st.faces()[0].every(c => c === 0), `${cs.name} keeps OLL`);
    }
    if (cs.mode === 'eo') {
      const f = caseState(cs.alg).faces();
      ok([1, 3, 5, 7].some(i => f[0][i] !== 0), `${cs.name} has misoriented edges`);
    }
    // signature of the case up to AUF
    const sigs = [];
    for (let k = 0; k < 4; k++) {
      const s2 = caseState(cs.alg); s2.apply('U '.repeat(k));
      const f = s2.faces();
      let top;
      if (cs.mode === 'f2l') {
        const ids = s2.faceStickers().flat(), at = [];
        ids.forEach((id, pos) => { if (isFR([SOLVED.p[id * 3], SOLVED.p[id * 3 + 1], SOLVED.p[id * 3 + 2]])) at.push(pos + ':' + id); });
        top = at.sort().join(',');
      } else if (cs.mode === 'oll' || cs.mode === 'eo') {
        top = [f[0], f[1].slice(0, 3), f[2].slice(0, 3), f[4].slice(0, 3), f[5].slice(0, 3)].flat().map(c => c === 0 ? 1 : 0).join('');
      } else top = [f[1].slice(0, 3), f[2].slice(0, 3), f[4].slice(0, 3), f[5].slice(0, 3)].flat().join('');
      sigs.push(top);
    }
    const key = sigs.sort()[0];
    if (seen.has(key)) ok(false, `${set.id} ${cs.name} duplicates ${seen.get(key)}`);
    seen.set(key, cs.name);
  }
  console.log(set.id, 'cases', set.cases.length, 'distinct', seen.size);
}

for (const e of EVENTS) console.log(e.id.padEnd(6), localScramble(e.id).replace(/\n/g, ' | ').slice(0, 110));
console.log(fails ? `${fails} failures` : 'all checks passed');
