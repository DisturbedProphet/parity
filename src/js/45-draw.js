// ---------------------------------------------------------------------------
// SVG drawings: cube nets, last-layer case diagrams, puzzle glyphs, and the
// seven-segment "stackmat" timer face.
// ---------------------------------------------------------------------------
function paletteFor(faceMap) {
  const cols = Store.settings.colors;
  return (faceMap || [0, 1, 2, 3, 4, 5]).map(i => cols[i]);
}

function netSVG(state, palette) {
  const n = state.n, faces = state.faces(), cell = 10, gap = 4, fs = n * cell;
  const pos = [[1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [3, 1]];
  const W = 4 * fs + 3 * gap, H = 3 * fs + 2 * gap;
  const r = Math.max(.6, 2.2 - n * .25), inset = n > 5 ? .45 : .6;
  let out = `<svg viewBox="-1 -1 ${W + 2} ${H + 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cube net">`;
  for (let f = 0; f < 6; f++) {
    const ox = pos[f][0] * (fs + gap), oy = pos[f][1] * (fs + gap);
    for (let i = 0; i < n * n; i++) {
      const x = ox + (i % n) * cell + inset, y = oy + Math.floor(i / n) * cell + inset;
      out += `<rect x="${x}" y="${y}" width="${cell - inset * 2}" height="${cell - inset * 2}" rx="${r}" fill="${palette[faces[f][i]]}"/>`;
    }
  }
  return out + '</svg>';
}

// Top view of the last layer with the side stickers around it. Modes: pll (all
// colours), oll (yellow or grey), eo (edges only), cp (corners and top only).
function llSVG(state, palette, mode) {
  const f = state.faces(), S = 22, T = 7, G = 3, O = T + G, W = O * 2 + 3 * S, grey = 'var(--line)';
  const col = (c, part, top) => {
    if (mode === 'oll') return c === 0 ? palette[0] : grey;
    if (mode === 'eo') return part === 'corner' ? grey : c === 0 ? palette[0] : grey;
    if (mode === 'cp') return top || part === 'corner' ? palette[c] : grey;
    return palette[c];
  };
  const rect = (x, y, w, hh, fill, rx = 3) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="${rx}" fill="${fill}"/>`;
  let out = `<svg viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const part = r !== 1 && c !== 1 ? 'corner' : r === 1 && c === 1 ? 'centre' : 'edge';
    out += rect(O + c * S + 1, O + r * S + 1, S - 2, S - 2, col(f[0][r * 3 + c], part, true));
  }
  for (let i = 0; i < 3; i++) {
    const part = i === 1 ? 'edge' : 'corner';
    out += rect(O + i * S + 1, 0, S - 2, T, col(f[5][2 - i], part), 2);
    out += rect(O + i * S + 1, O + 3 * S + G, S - 2, T, col(f[2][i], part), 2);
    out += rect(O + 3 * S + G, O + i * S + 1, T, S - 2, col(f[1][2 - i], part), 2);
    out += rect(0, O + i * S + 1, T, S - 2, col(f[4][i], part), 2);
  }
  return out + '</svg>';
}

// Isometric view of U, F and R for F2L cases: last-layer pieces are grey.
function f2lSVG(state, palette) {
  const idx = state.faceStickers(), m = state.n - 1, K = 10, cs = Math.cos(Math.PI / 6);
  const P = (x, y, z) => `${((x - z) * cs * K).toFixed(2)},${((x + z) * .5 * K - y * K).toFixed(2)}`;
  const fill = i => (state.p0[i * 3 + 1] === m ? 'var(--line)' : palette[state.c[i]]);
  const quad = (pts, i) => {
    const c = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
    const q = pts.map(p => P(...p.map((v, k) => c[k] + (v - c[k]) * .86)));
    return `<polygon points="${q.join(' ')}" fill="${fill(i)}" stroke-linejoin="round"/>`;
  };
  let out = `<svg viewBox="${(-2.65 * K).toFixed(1)} ${-3.05 * K} ${(5.3 * K).toFixed(1)} ${6.1 * K}" xmlns="http://www.w3.org/2000/svg">`;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x0 = -1.5 + c, z0 = -1.5 + r, y0 = 1.5 - r, zr = 1.5 - c;
    out += quad([[x0, 1.5, z0], [x0 + 1, 1.5, z0], [x0 + 1, 1.5, z0 + 1], [x0, 1.5, z0 + 1]], idx[0][r * 3 + c]);
    out += quad([[x0, y0, 1.5], [x0 + 1, y0, 1.5], [x0 + 1, y0 - 1, 1.5], [x0, y0 - 1, 1.5]], idx[2][r * 3 + c]);
    out += quad([[1.5, y0, zr], [1.5, y0, zr - 1], [1.5, y0 - 1, zr - 1], [1.5, y0 - 1, zr]], idx[1][r * 3 + c]);
  }
  return out + '</svg>';
}

function eventGlyph(id) {
  const ev = EVENT_BY_ID[id];
  const wrap = inner => `<svg class="ev-glyph" viewBox="0 0 18 18" aria-hidden="true" stroke-width="1.3" stroke-linejoin="round">${inner}</svg>`;
  const grid = n => {
    let s = '<rect x="1.5" y="1.5" width="15" height="15" rx="3"/>';
    for (let i = 1; i < n; i++) { const p = 1.5 + i * 15 / n; s += `<path d="M${p} 1.5V16.5M1.5 ${p}H16.5" stroke-width="${n > 5 ? .7 : 1}"/>`; }
    return s;
  };
  if (id === '333oh') return wrap(grid(3) + '<rect class="f" x="11.5" y="11.5" width="5" height="5" rx="1"/>');
  if (id === '333bf') return wrap(grid(3) + '<rect class="f" x="1.5" y="6.5" width="15" height="5"/>');
  if (ev.n) return wrap(grid(ev.n));
  switch (id) {
    case 'pyram': return wrap('<path d="M9 1.8 16.6 15.6H1.4Z"/><path d="M5.2 8.7h7.6M9 15.6 5.2 8.7M9 15.6l3.8-6.9" stroke-width="1"/>');
    case 'skewb': return wrap('<rect x="1.5" y="1.5" width="15" height="15" rx="3"/><path d="M9 1.5 16.5 9 9 16.5 1.5 9Z" stroke-width="1"/>');
    case 'minx': return wrap('<path d="M9 1.4 16.6 6.9 13.7 15.8H4.3L1.4 6.9Z"/><path d="M9 5.4l4 2.9-1.5 4.7h-5L5 8.3Z" stroke-width="1"/>');
    case 'clock': return wrap('<circle cx="9" cy="9" r="7.5"/><path d="M9 9V5.2" stroke-width="1.4"/><circle class="f" cx="5" cy="5" r="1"/><circle class="f" cx="13" cy="5" r="1"/><circle class="f" cx="5" cy="13" r="1"/><circle class="f" cx="13" cy="13" r="1"/>');
    case 'sq1': return wrap('<rect x="1.5" y="1.5" width="15" height="15" rx="3"/><path d="M9 9 1.5 6.2M9 9l7.5 2.8M9 9l2-7.5M9 9 7 16.5" stroke-width="1"/>');
  }
  return wrap(grid(3));
}

// ---------- seven-segment timer face ----------
const LCD = (() => {
  const H = (y, x1, x2) => `${x1},${y} ${x1 + 5},${y - 5} ${x2 - 5},${y - 5} ${x2},${y} ${x2 - 5},${y + 5} ${x1 + 5},${y + 5}`;
  const V = (x, y1, y2) => `${x},${y1} ${x + 5},${y1 + 5} ${x + 5},${y2 - 5} ${x},${y2} ${x - 5},${y2 - 5} ${x - 5},${y1 + 5}`;
  const seg = { a: H(6, 10, 50), g: H(50, 10, 50), d: H(94, 10, 50), f: V(6, 9, 47), b: V(54, 9, 47), e: V(6, 53, 91), c: V(54, 53, 91) };
  const map = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    '-': 'g', D: 'bcdeg', N: 'ceg', F: 'aefg', ' ': '',
  };
  const digit = ch => {
    const on = map[ch] || '';
    let s = '<svg viewBox="0 0 60 100" aria-hidden="true"><g transform="skewX(-5) translate(5 0)">';
    for (const k of 'abcdefg') s += `<polygon points="${seg[k]}" class="${on.includes(k) ? 'seg-on' : 'seg-off'}"/>`;
    return s + '</g></svg>';
  };
  const cache = {};
  return text => {
    let out = '';
    for (const ch of String(text).toUpperCase()) {
      if (ch === '.') out += '<svg viewBox="0 0 16 100" aria-hidden="true"><rect x="2" y="86" width="10" height="10" rx="1" class="seg-on"/></svg>';
      else if (ch === ':') out += '<svg viewBox="0 0 16 100" aria-hidden="true"><rect x="3" y="26" width="10" height="10" rx="1" class="seg-on"/><rect x="2" y="64" width="10" height="10" rx="1" class="seg-on"/></svg>';
      else if (ch === '+') out += '<svg viewBox="0 0 50 100" aria-hidden="true"><path d="M20 30h10v15h15v10H30v15H20V55H5V45h15Z" class="seg-on"/></svg>';
      else out += cache[ch] || (cache[ch] = digit(ch));
    }
    return out;
  };
})();
