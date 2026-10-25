// Node checks for the non-cube puzzle geometry, notation and Square-1 legality.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src', 'js');
const code = ['10-cube.js', '30-scramble.js', '48-puzzles.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') +
  '\n;globalThis.__x = { Vx, puzzleDef, buildMegaminx, localScramble, parseClock, clockStep, clockSolved, SQ1, sq1Dir };';
const ctx = { crypto: globalThis.crypto, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
const { Vx, puzzleDef, buildMegaminx, localScramble, parseClock, clockStep, clockSolved, sq1Dir } = ctx.__x;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

const summary = def => {
  const withSt = def.pieces.filter(p => p.stickers.length);
  const perColor = {};
  for (const p of withSt) for (const s of p.stickers) perColor[s.color] = (perColor[s.color] || 0) + 1;
  return { cells: def.pieces.length, pieces: withSt.length, perColor, byCount: withSt.reduce((m, p) => (m[p.stickers.length] = (m[p.stickers.length] || 0) + 1, m), {}) };
};

// Expected: pyraminx 4 tips + 4 axials + 6 edges, 9 stickers per face
const py = summary(puzzleDef('pyram'));
console.log('pyraminx', JSON.stringify(py));
ok(py.pieces === 14 && Object.values(py.perColor).every(v => v === 9), 'pyraminx pieces');
const sk = summary(puzzleDef('skewb'));
console.log('skewb', JSON.stringify(sk));
ok(sk.pieces === 14 && Object.values(sk.perColor).every(v => v === 5), 'skewb pieces');
for (const dpt of [.72]) {
  const m = summary(buildMegaminx(dpt));
  console.log('megaminx depth', dpt, JSON.stringify(m.byCount), 'stickers/face', [...new Set(Object.values(m.perColor))]);
}
const mx = summary(puzzleDef('minx'));
ok(mx.pieces === 62 && Object.values(mx.perColor).every(v => v === 11), 'megaminx pieces');
const sq = summary(puzzleDef('sq1'));
console.log('sq1', JSON.stringify(sq));
ok(sq.pieces === 18, 'sq1 pieces');

// Moves select the right number of pieces
const count = (def, mv) => def.pieces.filter(p => p.stickers.length && Vx.dot(mv.n, p.c) > mv.d).length;
const pyd = puzzleDef('pyram');
ok(count(pyd, pyd.parse('U')[0]) === 5 && count(pyd, pyd.parse('u')[0]) === 1, 'pyraminx layer/tip sizes');
const skd = puzzleDef('skewb');
ok(count(skd, skd.parse('R')[0]) === 7, 'skewb half has 4 corners + 3 centres');
const mxd = puzzleDef('minx');
ok(count(mxd, mxd.parse('U')[0]) === 11 && count(mxd, mxd.parse('R++')[0]) === 51 && count(mxd, mxd.parse('D--')[0]) === 51, 'megaminx move sizes');

// Every move turns the puzzle into itself: rotated piece centres land on piece centres.
function closed(def, alg) {
  const cs = def.pieces.map(p => p.c);
  for (const mv of def.parse(alg)) {
    const moved = cs.map(c => (Vx.dot(mv.n, c) > mv.d ? Vx.rot(c, mv.axis, mv.angle) : c));
    for (const c of moved) if (!def.pieces.some(p => Vx.len(Vx.sub(p.c, c)) < 1e-4)) return false;
  }
  return true;
}
ok(closed(pyd, "U L' R B u l' r b"), 'pyraminx moves map pieces to pieces');
ok(closed(skd, "R U' L B"), 'skewb moves map pieces to pieces');
ok(closed(mxd, "R++ D-- U U'"), 'megaminx moves map pieces to pieces');

// Square-1: generated scrambles never slash through a piece.
function sq1Legal(text) {
  const def = puzzleDef('sq1');
  let pcs = def.pieces.map(p => ({ v: p.faces.flat(), c: p.c, layer: p.c[1] > .1 ? 't' : p.c[1] < -.1 ? 'b' : 'm' }));
  const n = sq1Dir(-15);
  for (const mv of def.parse(text)) {
    if (mv.angle === Math.PI) {
      for (const p of pcs) {
        const ds = p.v.map(v => Vx.dot(n, v));
        if (Math.max(...ds) > 1e-6 && Math.min(...ds) < -1e-6) return false;
      }
    }
    pcs = pcs.map(p => (Vx.dot(mv.n, p.c) > mv.d ? { v: p.v.map(v => Vx.rot(v, mv.axis, mv.angle)), c: Vx.rot(p.c, mv.axis, mv.angle) } : p));
  }
  return true;
}
let legal = 0;
for (let i = 0; i < 300; i++) if (sq1Legal(localScramble('sq1'))) legal++;
console.log('sq1 legal scrambles', legal, '/ 300');
ok(sq1Legal('(1,0) /') && !sq1Legal('(-1,0) /') && sq1Legal('(0,-1) /') && !sq1Legal('(0,1) /'), 'sq1 conventions from solved');
ok(legal === 300, 'sq1 generator legal');

// Clock: a scramble keeps dials in 0..11, and UR1+ then UR1- returns to solved.
const st = clockSolved();
for (const mv of parseClock('UR1+ UR1-')) clockStep(st, mv);
ok(st.a.every(v => v === 0) && st.b.every(v => v === 0), 'clock inverse');
const st2 = clockSolved();
for (const mv of parseClock(localScramble('clock'))) clockStep(st2, mv);
console.log('clock', st2.a.join(','), '|', st2.b.join(','), 'flipped', st2.flipped, 'pins', [...st2.pins].join(' '));
const st3 = clockSolved();
for (const mv of parseClock('ALL1+')) clockStep(st3, mv);
ok(st3.a.every(v => v === 1) && [0, 2, 6, 8].every(i => st3.b[i] === 11) && st3.b[4] === 0, 'clock ALL1+');

console.log(fails ? fails + ' failures' : 'all puzzle checks passed');

// ---- random-state piece puzzles and clock ----
{
  const code2 = ['10-cube.js', '20-solver.js', '30-scramble.js', '48-puzzles.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') +
    '\n;globalThis.__y = { solverMain, pieceModel, puzzleDef, parseClock, clockStep, clockSolved, Vx };';
  const c2 = { crypto: globalThis.crypto, console }; vm.createContext(c2); vm.runInContext(code2, c2);
  const { solverMain, pieceModel, parseClock: pc, clockStep: cstep, clockSolved: csolved } = c2.__y;
  const api = solverMain(null);
  const specs = {
    pyram: { tokens: ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"], ignore: ['u', 'l', 'r', 'b'], min: 6 },
    skewb: { tokens: ['R', "R'", 'U', "U'", 'L', "L'", 'B', "B'"], ignore: [], min: 7 },
  };
  for (const [kind, sp] of Object.entries(specs)) {
    const model = pieceModel(kind, sp.tokens, sp.ignore);
    ok(model.moves.every(m => m.to.every(x => x >= 0) && m.tw.every(x => x >= 0)), kind + ' model complete');
    const t0 = Date.now(); const T = api.initPz(kind, model); const tInit = Date.now() - t0;
    const lens = [];
    for (let i = 0; i < 40; i++) {
      const cs = T.randomCoords(), sol = T.solve(cs);
      let st = cs; for (const m of sol) st = T.step(st, m);
      ok(st.every(x => x === 0), kind + ' solution solves');
      lens.push(sol.length);
    }
    const t1 = Date.now(); const scr = api.scramblePz({ key: kind, model, min: sp.min }); const tScr = Date.now() - t1;
    console.log(kind, 'groups', T.groups.map(g => g.size).join('x'), '| init', tInit, 'ms | avg optimal', (lens.reduce((a, b) => a + b) / lens.length).toFixed(2), 'max', Math.max(...lens), '| scramble', tScr, 'ms:', scr);
  }
  // Clock: the 14 scramble amounts map one-to-one onto the 14 independent dials (mod 12).
  const moves = ['UR', 'DR', 'DL', 'UL', 'U', 'R', 'D', 'L', 'ALL'].map(x => x + '1+').concat(['y2']).concat(['U', 'R', 'D', 'L', 'ALL'].map(x => x + '1+'));
  const rows = [];
  for (let i = 0; i < moves.length; i++) {
    if (moves[i] === 'y2') continue;
    const st = csolved(); const pre = moves.slice(0, i).includes('y2');
    for (const mv of pc((pre ? 'y2 ' : '') + moves[i] + (pre ? ' y2' : ''))) cstep(st, mv);
    rows.push([...st.a, st.b[1], st.b[3], st.b[4], st.b[5], st.b[7]]);
  }
  const rank = p => { const M = rows.map(r => r.map(x => ((x % p) + p) % p)); let rk = 0;
    for (let c = 0; c < 14 && rk < 14; c++) { const piv = M.findIndex((r, i) => i >= rk && r[c] % p); if (piv < 0) continue; [M[rk], M[piv]] = [M[piv], M[rk]];
      const inv = [...Array(p).keys()].find(x => (M[rk][c] * x) % p === 1); M[rk] = M[rk].map(x => (x * inv) % p);
      for (let i = 0; i < 14; i++) if (i !== rk && M[i][c]) { const f = M[i][c]; M[i] = M[i].map((x, k) => ((x - f * M[rk][k]) % p + p) % p); } rk++; }
    return rk; };
  console.log('clock matrix rank mod 2:', rank(2), 'mod 3:', rank(3));
  ok(rows.length === 14 && rank(2) === 14 && rank(3) === 14, 'clock scramble amounts are a basis');
  console.log(fails ? fails + ' failures' : 'random-state checks passed');
}
