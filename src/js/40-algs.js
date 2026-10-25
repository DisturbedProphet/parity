// ---------------------------------------------------------------------------
// Last-layer algorithm sets for the trainer. Case diagrams are generated from
// the algorithm itself, so a picture always matches its alg.
// ---------------------------------------------------------------------------
const PLL = [
  ['Aa', 'x R\' U R\' D2 R U\' R\' D2 R2 x\''],
  ['Ab', 'x R2 D2 R U R\' D2 R U\' R x\''],
  ['E', 'x\' R U\' R\' D R U R\' D\' R U R\' D R U\' R\' D\' x'],
  ['F', 'R\' U\' F\' R U R\' U\' R\' F R2 U\' R\' U\' R U R\' U R'],
  ['Ga', 'R2 U R\' U R\' U\' R U\' R2 U\' D R\' U R D\''],
  ['Gb', 'R\' U\' R U D\' R2 U R\' U R U\' R U\' R2 D'],
  ['Gc', 'R2 U\' R U\' R U R\' U R2 U D\' R U\' R\' D'],
  ['Gd', 'R U R\' U\' D R2 U\' R U\' R\' U R\' U R2 D\''],
  ['H', 'M2 U M2 U2 M2 U M2'],
  ['Ja', 'x R2 F R F\' R U2 r\' U r U2 x\''],
  ['Jb', 'R U R\' F\' R U R\' U\' R\' F R2 U\' R\''],
  ['Na', 'R U R\' U R U R\' F\' R U R\' U\' R\' F R2 U\' R\' U2 R U\' R\''],
  ['Nb', 'R\' U R U\' R\' F\' U\' F R U R\' F R\' F\' R U\' R'],
  ['Ra', 'R U\' R\' U\' R U R D R\' U\' R D\' R\' U2 R\''],
  ['Rb', 'R2 F R U R U\' R\' F\' R U2 R\' U2 R'],
  ['T', 'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\''],
  ['Ua', 'M2 U M U2 M\' U M2'],
  ['Ub', 'M2 U\' M U2 M\' U\' M2'],
  ['V', 'R\' U R\' U\' y R\' F\' R2 U\' R\' U R\' F R F'],
  ['Y', 'F R U\' R\' U\' R U R\' F\' R U R\' U\' R\' F R F\''],
  ['Z', 'M\' U M2 U M2 U M\' U2 M2'],
];

const OLL = [
  'R U2 R2 F R F\' U2 R\' F R F\'',
  'F R U R\' U\' F\' f R U R\' U\' f\'',
  'f R U R\' U\' f\' U\' F R U R\' U\' F\'',
  'f R U R\' U\' f\' U F R U R\' U\' F\'',
  'r\' U2 R U R\' U r',
  'r U2 R\' U\' R U\' r\'',
  'r U R\' U R U2 r\'',
  'l\' U\' L U\' L\' U2 l',
  'R U R\' U\' R\' F R2 U R\' U\' F\'',
  'R U R\' U R\' F R F\' R U2 R\'',
  'r U R\' U R\' F R F\' R U2 r\'',
  'M\' R\' U\' R U\' R\' U2 R U\' R r\'',
  'F U R U\' R2 F\' R U R U\' R\'',
  'R\' F R U R\' F\' R F U\' F\'',
  'l\' U\' l L\' U\' L U l\' U l',
  'r U r\' R U R\' U\' r U\' r\'',
  'F R\' F\' R2 r\' U R U\' R\' U\' M\'',
  'r U R\' U R U2 r2 U\' R U\' R\' U2 r',
  'r\' R U R U R\' U\' M\' R\' F R F\'',
  'r U R\' U\' M2 U R U\' R\' U\' M\'',
  'R U2 R\' U\' R U R\' U\' R U\' R\'',
  'R U2 R2 U\' R2 U\' R2 U2 R',
  'R2 D\' R U2 R\' D R U2 R',
  'r U R\' U\' r\' F R F\'',
  'F\' r U R\' U\' r\' F R',
  'R U2 R\' U\' R U\' R\'',
  'R U R\' U R U2 R\'',
  'r U R\' U\' r\' R U R U\' R\'',
  'R U R\' U\' R U\' R\' F\' U\' F R U R\'',
  'F R\' F R2 U\' R\' U\' R U R\' F2',
  'R\' U\' F U R U\' R\' F\' R',
  'L U F\' U\' L\' U L F L\'',
  'R U R\' U\' R\' F R F\'',
  'R U R2 U\' R\' F R U R U\' F\'',
  'R U2 R2 F R F\' R U2 R\'',
  'L\' U\' L U\' L\' U L U L F\' L\' F',
  'F R\' F\' R U R U\' R\'',
  'R U R\' U R U\' R\' U\' R\' F R F\'',
  'L F\' L\' U\' L U F U\' L\'',
  'R\' F R U R\' U\' F\' U R',
  'R U R\' U R U2 R\' F R U R\' U\' F\'',
  'R\' U\' R U\' R\' U2 R F R U R\' U\' F\'',
  'F\' U\' L\' U L F',
  'F U R U\' R\' F\'',
  'F R U R\' U\' F\'',
  'R\' U\' R\' F R F\' U R',
  'R\' U\' R\' F R F\' R\' F R F\' U R',
  'F R U R\' U\' R U R\' U\' F\'',
  'r U\' r2 U r2 U r2 U\' r',
  'r\' U r2 U\' r2 U\' r2 U r\'',
  'F U R U\' R\' U R U\' R\' F\'',
  'R U R\' U R U\' B U\' B\' R\'',
  'l\' U2 L U L\' U\' L U L\' U l',
  'r U2 R\' U\' R U R\' U\' R U\' r\'',
  'R\' F R U R U\' R2 F\' R2 U\' R\' U R U R\'',
  'r\' U\' r U\' R\' U R U\' R\' U R r\' U r',
  'R U R\' U\' M\' U R U\' r\'',
].map((alg, i) => [String(i + 1), alg]);

// F2L for the front-right slot: optimal <R, U, F> algorithms chosen for easy
// fingertricks by tools/gen-f2l.js.
const F2L = [
  ['top', "R U2 R' U' R U R'"],
  ['top', "F U R U' R' F' R U' R'"],
  ['top', "R2 U2 R' U' R U' R2"],
  ['top', "F' U2 F U F' U' F"],
  ['top', "F' U' F R U R'"],
  ['top', "F' U2 F2 R' F' R"],
  ['top', "R U2 R' U R U' R'"],
  ['top', "R U R' F' U' F"],
  ['top', "R U' R' U R U R'"],
  ['top', "R U' R' U2 F' U' F"],
  ['top', "F' U2 F U' R U R'"],
  ['top', "F' U F"],
  ['top', "R U' R' U' R U R'"],
  ['top', "R' U' R F R' F' U R"],
  ['top', "R U R'"],
  ['top', "F' U2 F U F' U2 F"],
  ['top', "R U' R'"],
  ['top', "R U2 R' U F' U' F"],
  ['top', "F' U F U2 R U R'"],
  ['top', "F' U F U' F' U' F"],
  ['top', "R U2 R' U' R U2 R'"],
  ['top', "F' U' F"],
  ['top', "R U R' U' R U2 R'"],
  ['top', "R U' R' U F' U' F"],
  ['corner-slot', "F' U F U R U' R'"],
  ['corner-slot', "R U R' U' F' U' F"],
  ['corner-slot', "R U' R' U R U' R'"],
  ['corner-slot', "R U' R' F' U' F"],
  ['corner-slot', "R U R' U' R U R'"],
  ['corner-slot', "R U2 R' F' U2 F"],
  ['edge-slot', "F R' F' R U' R U R'"],
  ['edge-slot', "R U' R' F' U2 F"],
  ['edge-slot', "R U R' U2 R U R'"],
  ['edge-slot', "F' U' F U' R U R'"],
  ['edge-slot', "R U' R' U' R U2 R'"],
  ['edge-slot', "R U R' U' F' U F"],
  ['both-slot', "R2 U2 F R2 F' U2 R' U R'"],
  ['both-slot', "R2 U2 R' U' R U' R' U2 R'"],
  ['both-slot', "R F U R U' R' F' U' R'"],
  ['both-slot', "R U2 R U R' U R U2 R2"],
  ['both-slot', "R U F R U R' U' F' R'"],
];
const F2L_GROUPS = { top: 'Both pieces on top', 'corner-slot': 'Corner in the slot', 'edge-slot': 'Edge in the slot', 'both-slot': 'Both in the slot' };

const OCLL = [
  ['Sune', "R U R' U R U2 R'"], ['Antisune', "R U2 R' U' R U' R'"], ['H', "R U2 R' U' R U R' U' R U' R'"],
  ['Pi', "R U2 R2 U' R2 U' R2 U2 R"], ['Headlights', "R2 D' R U2 R' D R U2 R"], ['Chameleon', "r U R' U' r' F R F'"],
  ['Bowtie', "F' r U R' U' r' F R"],
];
const pllAlg = name => PLL.find(x => x[0] === name)[1];

// Each case: diagram mode (pll, oll, eo, cp, f2l) and the random state set up
// before it (pre), so the rest of the cube looks like a real solve.
const ALG_SETS = {
  pll: { id: 'pll', name: 'PLL', cases: PLL.map(([name, alg]) => ({ id: name, name, alg, mode: 'pll', pre: '' })) },
  oll: { id: 'oll', name: 'OLL', cases: OLL.map(([name, alg]) => ({ id: name, name: 'OLL ' + name, alg, mode: 'oll', pre: 'pll' })) },
  oll2: {
    id: 'oll2', name: '2-look OLL', cases: [
      { id: 'dot', name: 'Dot', alg: "F R U R' U' F' f R U R' U' f'", mode: 'eo', pre: 'pll+ocll' },
      { id: 'L', name: 'L shape', alg: "f R U R' U' f'", mode: 'eo', pre: 'pll+ocll' },
      { id: 'line', name: 'Line', alg: "F R U R' U' F'", mode: 'eo', pre: 'pll+ocll' },
      ...OCLL.map(([name, alg]) => ({ id: name, name, alg, mode: 'oll', pre: 'pll' })),
    ],
  },
  pll2: {
    id: 'pll2', name: '2-look PLL', cases: [
      { id: 'adj', name: 'Adjacent corners', alg: pllAlg('T'), mode: 'cp', pre: 'epll' },
      { id: 'diag', name: 'Diagonal corners', alg: pllAlg('Y'), mode: 'cp', pre: 'epll' },
      ...['Ua', 'Ub', 'H', 'Z'].map(name => ({ id: name, name: name + ' perm', alg: pllAlg(name), mode: 'pll', pre: '' })),
    ],
  },
  f2l: { id: 'f2l', name: 'F2L', cases: F2L.map(([group, alg], i) => ({ id: String(i + 1), name: 'F2L ' + (i + 1), group: F2L_GROUPS[group], alg, mode: 'f2l', pre: 'll' })) },
};

// Random setup placed before a case so the rest of the last layer is scrambled.
function caseSetup(pre) {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const inv = alg => (alg ? invertAlg(alg) : '');
  const auf = () => pick(['', 'U', 'U2', "U'"]);
  if (pre === 'pll') return inv(pick(PLL)[1]);
  if (pre === 'pll+ocll') return `${inv(pick(PLL)[1])} ${auf()} ${inv(pick([...OCLL.map(x => x[1]), '']))}`;
  if (pre === 'epll') return inv(pick(['Ua', 'Ub', 'H', 'Z', ''].map(n => (n ? pllAlg(n) : ''))));
  if (pre === 'll') return `${inv(pick(PLL)[1])} ${auf()} ${inv(pick([...OLL.map(x => x[1]), '']))}`;
  return '';
}

// Trainer cubes are held yellow-up, green-front (a z2 of the standard scheme).
const TRAINER_FACE_MAP = [3, 4, 2, 0, 1, 5];

function caseState(alg) {
  return new CubeState(3).apply(invertAlg(alg)).normalize();
}
