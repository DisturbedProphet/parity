// ---------------------------------------------------------------------------
// Stats view: bests, progression, distribution, milestones, practice calendar.
// ---------------------------------------------------------------------------
const StatsView = {
  scope: 'session', hoverLine: null, hoverHist: null, geo: null, hgeo: null,

  init() {
    $('#statsScope').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      this.scope = b.dataset.v;
      $$('#statsScope button').forEach(x => x.classList.toggle('on', x === b));
      this.render();
    });
    const lineBox = $('#lineBox'), histBox = $('#histBox');
    lineBox.addEventListener('pointermove', e => this.lineHover(e));
    lineBox.addEventListener('pointerleave', () => { this.hoverLine = null; this.drawLine(); this.tip(lineBox, null); });
    lineBox.addEventListener('click', () => { const s = this.hoverLine != null && this.data.solves[this.hoverLine]; s && openSolveDetail(s.id); });
    histBox.addEventListener('pointermove', e => this.histHover(e));
    histBox.addEventListener('pointerleave', () => { this.hoverHist = null; this.drawHist(); this.tip(histBox, null); });
    window.addEventListener('resize', () => { if (App.view === 'stats') { this.drawLine(); this.drawHist(); } });
    Store.on(what => { if (App.view === 'stats' && (['solves', 'session', 'event'].includes(what) || what.startsWith('settings:skin') || what === 'settings:precision')) this.render(); });
  },
  activate() { this.render(); },

  solves() {
    if (this.scope === 'session') return Store.session.solves;
    return Store.sessionsFor(Store.event).flatMap(s => s.solves).sort((a, b) => a.d - b.d);
  },

  render() {
    const solves = this.solves(), st = computeStats(solves);
    this.data = { solves, st };
    const ev = EVENT_BY_ID[Store.event];
    $('#statsSub').textContent = `${ev.long} · ${this.scope === 'session' ? Store.session.name : `${Store.sessionsFor(Store.event).length} sessions`}`;
    const r = st.rows, bestSolve = r.single.bestIdx >= 0 ? solves[r.single.bestIdx] : null;
    const bigAvg = r.ao100.best != null ? ['Best ao100', r.ao100] : ['Best ao50', r.ao50];
    const kpi = (k, v, d) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d || '&nbsp;'}</div></div>`;
    $('#kpis').innerHTML = [
      kpi('Best single', bestSolve ? fmtSolve(bestSolve) : '–', bestSolve ? new Date(bestSolve.d).toLocaleDateString() : ''),
      kpi('Best ao5', fmtAvg(r.ao5.best), r.ao5.best != null ? `solves ${r.ao5.bestIdx - 3}–${r.ao5.bestIdx + 1}` : 'needs 5 solves'),
      kpi('Best ao12', fmtAvg(r.ao12.best), r.ao12.best != null ? `solves ${r.ao12.bestIdx - 10}–${r.ao12.bestIdx + 1}` : 'needs 12 solves'),
      kpi(bigAvg[0], fmtAvg(bigAvg[1].best), bigAvg[1].best != null ? `solves ${bigAvg[1].bestIdx - bigAvg[1].n + 2}–${bigAvg[1].bestIdx + 1}` : 'needs 50 solves'),
      kpi('Mean', fmtAvg(st.mean), st.sd != null ? `σ ${(st.sd / 1000).toFixed(2)} s` : ''),
      kpi('Solves', String(st.count), st.count ? `${st.dnf} DNF · ${solves.filter(s => s.p === 2).length} +2` : ''),
      kpi('Time solving', fmtDuration(st.total), st.count ? `since ${new Date(solves[0].d).toLocaleDateString()}` : ''),
    ].join('');
    this.drawLine(); this.drawHist();
    this.renderMilestones(st);
    this.renderCalendar(solves);
  },

  drawLine() {
    if (!this.data) return;
    const { st } = this.data;
    this.geo = drawLineChart($('#lineChart'), { times: st.times, ao5: st.rows.ao5.roll, ao12: st.rows.ao12.roll }, this.hoverLine);
  },
  drawHist() {
    if (!this.data) return;
    this.hgeo = drawHistogram($('#histChart'), this.data.st.times, this.hoverHist);
    $('#histNote').textContent = this.hgeo ? `bins of ${(this.hgeo.bw / 1000).toFixed(this.hgeo.bw < 1000 ? 1 : 0)} s` : '';
  },
  lineHover(e) {
    const g = this.geo; if (!g) return;
    const box = $('#lineBox'), rect = box.getBoundingClientRect(), x = e.clientX - rect.left;
    const i = clamp(Math.round((x - g.pad.l) / g.iw * (g.n - 1)), 0, g.n - 1);
    if (i === this.hoverLine) return;
    this.hoverLine = i; this.drawLine();
    const { st, solves } = this.data;
    this.tip(box, `Solve ${i + 1}<br>Single <b>${fmtSolve(solves[i])}</b><br>ao5 <b>${fmtAvg(st.rows.ao5.roll[i])}</b> · ao12 <b>${fmtAvg(st.rows.ao12.roll[i])}</b>`, g.X(i), 8);
  },
  histHover(e) {
    const g = this.hgeo; if (!g) return;
    const box = $('#histBox'), rect = box.getBoundingClientRect(), x = e.clientX - rect.left;
    const i = Math.floor((x - g.pad.l) / g.bwPx);
    if (i < 0 || i >= g.nb) { if (this.hoverHist != null) { this.hoverHist = null; this.drawHist(); this.tip(box, null); } return; }
    if (i === this.hoverHist) return;
    this.hoverHist = i; this.drawHist();
    const a = g.start + i * g.bw, b = a + g.bw;
    this.tip(box, `${axisLabel(a, g.bw)}–${axisLabel(b, g.bw)} s<br><b>${g.counts[i]}</b> solves · ${Math.round(g.counts[i] / g.total * 100)}%`, g.pad.l + (i + .5) * g.bwPx, 8);
  },
  tip(box, html, x, y) {
    let t = $('.tip', box);
    if (!html) { t && t.remove(); return; }
    if (!t) { t = h('div', { class: 'tip' }); box.append(t); }
    t.innerHTML = html;
    const w = t.offsetWidth;
    t.style.left = clamp(x + 12, 0, box.clientWidth - w) + 'px';
    t.style.top = y + 'px';
  },

  renderMilestones(st) {
    const fin = st.times.filter(Number.isFinite), total = st.count;
    const el = $('#milestones');
    if (!fin.length) { el.innerHTML = '<tr><td class="dim" style="color:var(--ink-3)">Milestones appear once you have finished solves.</td></tr>'; return; }
    const marks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300, 360, 420, 480, 600, 900, 1200, 1800, 2700, 3600].map(s => s * 1000);
    const under = m => fin.filter(v => v < m).length;
    let pickd = marks.filter(m => { const u = under(m); return u > 0 && u < fin.length; });
    if (!pickd.length) { const worst = Math.max(...fin); pickd = [marks.find(m => m > worst) || marks[marks.length - 1]]; }
    if (pickd.length > 6) { const step = (pickd.length - 1) / 5; pickd = [0, 1, 2, 3, 4, 5].map(i => pickd[Math.round(i * step)]); }
    el.innerHTML = pickd.map(m => {
      const u = under(m), pct = total ? u / total * 100 : 0;
      return `<tr><td style="width:84px">sub-${m >= 60000 ? fmtMs(m).replace(/\.00$/, '') : m / 1000}</td><td><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div></td><td class="n" style="width:110px">${u} · ${pct.toFixed(pct < 10 ? 1 : 0)}%</td></tr>`;
    }).join('');
  },

  renderCalendar(solves) {
    const days = 182, perDay = new Map(), today = new Date(); today.setHours(0, 0, 0, 0);
    const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    for (const s of solves) { const k = key(new Date(s.d)); perDay.set(k, (perDay.get(k) || 0) + 1); }
    const start = new Date(today); start.setDate(start.getDate() - days + 1);
    start.setDate(start.getDate() - start.getDay());
    const max = Math.max(1, ...perDay.values());
    let html = '', d = new Date(start), active = 0, streak = 0, best = 0, run = 0;
    while (d <= today) {
      const c = perDay.get(key(d)) || 0;
      if (c) { active++; run++; best = Math.max(best, run); } else run = 0;
      const lvl = c ? Math.ceil(c / max * 4) : 0;
      const bg = lvl ? `color-mix(in srgb, var(--accent) ${[0, 30, 55, 78, 100][lvl]}%, var(--sunk))` : '';
      html += `<i title="${d.toLocaleDateString()}: ${c} solve${c === 1 ? '' : 's'}"${bg ? ` style="background:${bg}"` : ''}></i>`;
      d.setDate(d.getDate() + 1);
    }
    const back = new Date(today);
    if (!perDay.get(key(back))) back.setDate(back.getDate() - 1);
    while (perDay.get(key(back))) { streak++; back.setDate(back.getDate() - 1); }
    $('#calendar').innerHTML = html;
    const todayCount = perDay.get(key(today)) || 0;
    $('#calFoot').innerHTML = `<span>Today<b>${todayCount}</b></span><span>Active days<b>${active}</b></span><span>Current streak<b>${streak} d</b></span><span>Longest streak<b>${best} d</b></span>`;
  },
};
