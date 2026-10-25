// ---------------------------------------------------------------------------
// Statistics: WCA-style averages (trim 5% each side, ao5/ao12 trim one),
// rolling windows, bests, mean and deviation.
// ---------------------------------------------------------------------------
const effT = s => (s.p === -1 ? Infinity : s.t + (s.p === 2 ? 2000 : 0));
const trimCount = n => (n < 5 ? 0 : Math.ceil(n * .05));

function trimmedAvg(arr) {
  const n = arr.length, k = trimCount(n), sorted = arr.slice().sort((a, b) => a - b);
  let sum = 0;
  for (let i = k; i < n - k; i++) { if (sorted[i] === Infinity) return Infinity; sum += sorted[i]; }
  return sum / (n - 2 * k);
}
function meanOf(arr) {
  let s = 0;
  for (const v of arr) { if (v === Infinity) return Infinity; s += v; }
  return s / arr.length;
}

const STAT_ROWS = [['single', 1], ['mo3', 3], ['ao5', 5], ['ao12', 12], ['ao50', 50], ['ao100', 100]];

function rolling(times, n) {
  const out = new Array(times.length).fill(null);
  if (n === 1) return times.slice();
  for (let i = n - 1; i < times.length; i++) {
    const w = times.slice(i - n + 1, i + 1);
    out[i] = n === 3 ? meanOf(w) : trimmedAvg(w);
  }
  return out;
}

function computeStats(solves) {
  const times = solves.map(effT), rows = {};
  for (const [k, n] of STAT_ROWS) {
    const roll = rolling(times, n);
    let best = null, bestIdx = -1;
    for (let i = 0; i < roll.length; i++) {
      const v = roll[i];
      if (v == null) continue;
      if (best == null || v < best) { best = v; bestIdx = i; }
    }
    rows[k] = { n, roll, cur: roll.length ? roll[roll.length - 1] : null, best, bestIdx };
  }
  const finite = times.filter(Number.isFinite);
  const mean = finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null;
  const sd = finite.length > 1 ? Math.sqrt(finite.reduce((a, v) => a + (v - mean) ** 2, 0) / (finite.length - 1)) : null;
  return { times, rows, count: solves.length, dnf: times.length - finite.length, mean, sd, total: solves.reduce((a, s) => a + s.t, 0) };
}

const statCache = new Map();
function statsFor(session) {
  const c = statCache.get(session.id);
  if (c && c.rev === session.rev && c.len === session.solves.length) return c.data;
  const data = computeStats(session.solves);
  statCache.set(session.id, { rev: session.rev, len: session.solves.length, data });
  return data;
}

// The solves in a window ending at `end`, with the trimmed ones marked.
function windowDetail(solves, end, n) {
  const w = solves.slice(end - n + 1, end + 1), k = trimCount(n);
  const order = w.map((s, i) => [effT(s), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const trimmed = new Set([...order.slice(0, k), ...order.slice(n - k)].map(x => x[1]));
  return { w, trimmed };
}

function openAverageDetail(solves, end, n, label) {
  if (end < n - 1 || end < 0) return;
  const { w, trimmed } = windowDetail(solves, end, n);
  const value = n === 3 ? meanOf(w.map(effT)) : trimmedAvg(w.map(effT));
  const list = h('div', { class: 'avg-list' });
  w.forEach((s, i) => list.append(h('span', { class: trimmed.has(i) ? 'trim' : '', text: trimmed.has(i) ? `(${fmtSolve(s)})` : fmtSolve(s) })));
  const text = `${label}: ${fmtAvg(value)}\n` + w.map((s, i) => `${end - n + i + 2}. ${trimmed.has(i) ? '(' + fmtSolve(s) + ')' : fmtSolve(s)}   ${s.s.replace(/\n/g, ' ')}`).join('\n');
  openModal({
    title: `${label} · ${fmtAvg(value)}`,
    body: [h('div', { class: 'sd-meta', text: `Solves ${end - n + 2} to ${end + 1}. Trimmed times are in parentheses.` }), list],
    foot: [h('button', { class: 'btn', html: icon('copy') + 'Copy with scrambles', onclick: () => copyText(text) })],
  });
}
