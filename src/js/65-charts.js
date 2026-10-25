// ---------------------------------------------------------------------------
// Canvas charts drawn from theme tokens: progression line and distribution.
// ---------------------------------------------------------------------------
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function niceStep(range, target) {
  const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function axisLabel(ms, step) {
  if (step >= 60000 || ms >= 60000) return fmtMs(ms, 2).replace(/\.\d+$/, '');
  return step >= 1000 ? String(Math.round(ms / 1000)) : (ms / 1000).toFixed(step >= 100 ? 1 : 2);
}
function chartColors() {
  return { ink: cssVar('--ink'), ink2: cssVar('--ink-2'), ink3: cssVar('--ink-3'), line: cssVar('--line'), accent: cssVar('--accent'), hold: cssVar('--hold'), panel: cssVar('--panel'), font: cssVar('--font-num') };
}
function emptyChart(ctx, w, h, c, text) {
  ctx.fillStyle = c.ink3; ctx.font = `13px ${cssVar('--font-ui')}`; ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2);
}

// data: { times, ao5, ao12 }  returns geometry for hover lookups
function drawLineChart(canvas, data, hover) {
  const { ctx, w, h } = setupCanvas(canvas), c = chartColors();
  const n = data.times.length, pad = { l: 46, r: 12, t: 12, b: 26 };
  ctx.clearRect(0, 0, w, h);
  if (n < 2) { emptyChart(ctx, w, h, c, 'Your progression appears after a couple of solves.'); return null; }
  const vals = data.times.concat(data.ao5, data.ao12).filter(v => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!vals.length) { emptyChart(ctx, w, h, c, 'No finished solves yet.'); return null; }
  let lo = vals[0], hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * .985))];
  if (hi - lo < 200) { hi += 300; lo -= 300; }
  const span = hi - lo; lo = Math.max(0, lo - span * .06); hi += span * .08;
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const X = i => pad.l + (i / (n - 1)) * iw;
  const Y = v => pad.t + (1 - (Math.min(v, hi) - lo) / (hi - lo)) * ih;

  const step = niceStep(hi - lo, 5);
  ctx.font = `11px ${c.font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    const y = Math.round(Y(v)) + .5;
    ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = c.ink3; ctx.fillText(axisLabel(v, step), pad.l - 8, y);
  }
  const xs = niceStep(n, Math.max(2, Math.floor(iw / 90)));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < n; i += Math.max(1, xs)) ctx.fillText(String(i + 1), X(i), h - pad.b + 8);

  const r = n > 400 ? 1.2 : n > 120 ? 1.8 : 2.4;
  ctx.fillStyle = c.ink3;
  data.times.forEach((v, i) => {
    if (Number.isFinite(v)) { ctx.globalAlpha = v > hi ? .35 : .7; ctx.beginPath(); ctx.arc(X(i), Y(v), r, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.globalAlpha = .9; ctx.strokeStyle = c.hold; ctx.lineWidth = 1.2; const x = X(i), y = pad.t + 4; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke(); }
  });
  ctx.globalAlpha = 1;
  const line = (arr, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.beginPath();
    let pen = false;
    arr.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { pen = false; return; }
      if (!pen) { ctx.moveTo(X(i), Y(v)); pen = true; } else ctx.lineTo(X(i), Y(v));
    });
    ctx.stroke();
  };
  line(data.ao12, c.ink, 1.5);
  line(data.ao5, c.accent, 2);

  if (hover != null && hover >= 0 && hover < n) {
    const x = Math.round(X(hover)) + .5;
    ctx.strokeStyle = c.ink2; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
    for (const [arr, col] of [[data.times, c.ink2], [data.ao5, c.accent], [data.ao12, c.ink]]) {
      const v = arr[hover];
      if (v == null || !Number.isFinite(v)) continue;
      ctx.fillStyle = c.panel; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(hover), Y(v), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  return { n, X, pad, w, iw };
}

function drawHistogram(canvas, times, hover) {
  const { ctx, w, h } = setupCanvas(canvas), c = chartColors();
  ctx.clearRect(0, 0, w, h);
  const fin = times.filter(Number.isFinite).sort((a, b) => a - b);
  if (fin.length < 3) { emptyChart(ctx, w, h, c, 'Not enough finished solves yet.'); return null; }
  const lo0 = fin[Math.floor(fin.length * .01)], hi0 = fin[Math.min(fin.length - 1, Math.floor(fin.length * .99))];
  const bw = Math.max(100, niceStep(Math.max(hi0 - lo0, 500), 12));
  const start = Math.floor(lo0 / bw) * bw, nb = Math.max(1, Math.floor((hi0 - start) / bw) + 1);
  const counts = new Array(nb).fill(0);
  for (const v of fin) { const b = Math.floor((v - start) / bw); if (b >= 0 && b < nb) counts[b]++; }
  const pad = { l: 34, r: 8, t: 10, b: 26 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...counts), ys = niceStep(max, 4);
  ctx.font = `11px ${c.font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let v = 0; v <= max; v += ys) {
    const y = Math.round(pad.t + ih - (v / max) * ih) + .5;
    ctx.strokeStyle = c.line; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = c.ink3; ctx.fillText(String(v), pad.l - 6, y);
  }
  const bwPx = iw / nb, gap = Math.min(4, bwPx * .18);
  counts.forEach((cnt, i) => {
    const x = pad.l + i * bwPx + gap / 2, bh = (cnt / max) * ih;
    ctx.fillStyle = i === hover ? c.accent : c.ink3;
    ctx.globalAlpha = i === hover ? 1 : .55;
    const y = pad.t + ih - bh, rr = Math.min(3, (bwPx - gap) / 2, bh);
    ctx.beginPath();
    ctx.moveTo(x, pad.t + ih); ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.lineTo(x + bwPx - gap - rr, y); ctx.quadraticCurveTo(x + bwPx - gap, y, x + bwPx - gap, y + rr);
    ctx.lineTo(x + bwPx - gap, pad.t + ih); ctx.closePath(); ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.fillStyle = c.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const every = Math.ceil(nb / Math.max(2, Math.floor(iw / 60)));
  for (let i = 0; i <= nb; i += every) ctx.fillText(axisLabel(start + i * bw, bw), pad.l + i * bwPx, h - pad.b + 8);
  return { pad, bwPx, nb, counts, start, bw, total: fin.length };
}
