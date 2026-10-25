// ---------------------------------------------------------------------------
// Scramble service (random-state worker with prefetch) and the Timer view.
// ---------------------------------------------------------------------------
// Random-state Pyraminx (tips added after) and Skewb: move sets and WCA minimum lengths.
const PZ_SPECS = {
  pyram: { tokens: ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"], ignore: ['u', 'l', 'r', 'b'], min: 6 },
  skewb: { tokens: ['R', "R'", 'U', "U'", 'L', "L'", 'B', "B'"], ignore: [], min: 7 },
};
const pzModels = {};
const pzModel = id => pzModels[id] || (pzModels[id] = pieceModel(id, PZ_SPECS[id].tokens, PZ_SPECS[id].ignore));

const Scrambler = {
  worker: null, local: null, seq: 0, pending: new Map(), queue: {}, heard: false,

  init() {
    try {
      const src = `(${solverMain.toString()})(self);`;
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = e => { this.heard = true; this._done(e.data); };
      this.worker.onerror = () => this._fallback();
      setTimeout(() => { if (!this.heard && this.pending.size) this._fallback(); }, 9000);
    } catch (e) { this._fallback(); }
  },
  _fallback() {
    if (!this.worker && this.local) return;
    if (this.worker) { try { this.worker.terminate(); } catch (e) { /* ignore */ } }
    this.worker = null;
    for (const p of this.pending.values()) this._runLocal(p.msg);
  },
  _runLocal(msg) {
    setTimeout(() => {
      this.local = this.local || solverMain(null);
      this._done(this.local.handle(msg));
    }, 40);
  },
  _done(d) {
    const p = this.pending.get(d.id);
    if (!p) return;
    this.pending.delete(d.id);
    d.ok ? p.res(d.result) : p.rej(new Error(d.error));
  },
  call(msg) {
    return new Promise((res, rej) => {
      msg.id = ++this.seq;
      this.pending.set(msg.id, { res, rej, msg });
      if (this.worker) this.worker.postMessage(msg); else this._runLocal(msg);
    });
  },
  async generate(eventId) {
    const ev = EVENT_BY_ID[eventId];
    if (ev.rs === 'pz') {
      try {
        let text = await this.call({ type: 'pz', key: eventId, model: pzModel(eventId), min: PZ_SPECS[eventId].min });
        if (eventId === 'pyram') text = (text + ' ' + pyraTips()).trim();
        return { text, kind: 'random state' };
      } catch (e) { console.warn('random-state scramble failed', e); }
    } else if (ev.rs) {
      try {
        let text = await this.call({ type: ev.rs });
        if (ev.bld) text = (text + ' ' + bldSuffix()).trim();
        return { text, kind: 'random state' };
      } catch (e) { console.warn('random-state scramble failed', e); }
    }
    // Clock's 14 scramble amounts map one-to-one onto its 14 independent dials, so random amounts are a random state.
    return { text: localScramble(eventId), kind: eventId === 'clock' ? 'random state' : 'random move' };
  },
  next(eventId) {
    const p = this.queue[eventId] || this.generate(eventId);
    delete this.queue[eventId];
    p.then(() => { if (!this.queue[eventId]) this.queue[eventId] = this.generate(eventId); });
    return p;
  },
  solveFacelets(facelets) { return this.call({ type: 'solve', facelets }); },
};

const Preview = { cube: null };
const puzzleKind = ev => (ev.n ? 'nxn' : ev.id);

function scrambleTokens(text) { return text.split('\n').map(l => l.split(/\s+/).filter(Boolean)); }

function renderScrambleText(el, text) {
  const lines = scrambleTokens(text);
  el.innerHTML = lines.map(l => l.map(t => `<span class="mv">${esc(t)}</span>`).join(' ')).join('<span class="br"></span>');
  const len = text.length;
  el.dataset.size = len > 420 ? 'xs' : len > 230 ? 's' : len > 120 ? 'm' : '';
  el.classList.remove('playing');
  return $$('.mv', el);
}

function highlightMoves(el, spans, i) {
  if (i === Infinity || i >= spans.length) {
    el.classList.remove('playing');
    for (const s of spans) s.classList.remove('done', 'cur');
    return;
  }
  el.classList.add('playing');
  spans.forEach((s, k) => { s.classList.toggle('done', k < i); s.classList.toggle('cur', k === i); });
}

function moveCountLabel(eventId, text) {
  if (eventId === 'sq1') return `${(text.match(/\//g) || []).length} slices`;
  if (eventId === 'clock') return 'pins and dials';
  return `${text.split(/\s+/).filter(Boolean).length} moves`;
}

function openBigCube({ kind = 'nxn', n, alg, faceMap, title }) {
  const cube = Preview.cube, prevHost = cube.el.parentNode, prevReq = cube.req;
  const host = h('div', { class: 'big-cube' });
  const scr = h('div', { class: 'scramble' });
  host.append(scr);
  const spans = renderScrambleText(scr, alg);
  scr.dataset.size = 's';
  const play = animate => cube.show({ kind, n, alg, faceMap, animate, onMove: i => highlightMoves(scr, spans, i) });
  openModal({
    title: title || 'Scramble', body: host, wide: true,
    foot: [
      h('span', { class: 'sd-meta', style: 'margin-right:auto', text: 'Drag to turn the cube. Double-click to reset the view.' }),
      h('button', { class: 'btn', text: 'Reset view', onclick: () => cube.goHome() }),
      h('button', { class: 'btn primary', text: 'Replay', onclick: () => play(true) }),
    ],
    onClose: () => {
      if (prevHost) cube.mount(prevHost);
      if (prevReq) cube.show(Object.assign({}, prevReq, { animate: false }));
    },
  });
  cube.mount(host);
  play(true);
}

const TimerView = {
  hist: {},
  pending: null,
  lastId: null,

  init() {
    this.timerEl = $('#timer'); this.padsEl = $('#pads'); this.scrEl = $('#scramble');
    this.engine = new TimerEngine({
      inspection: () => Store.settings.inspection && !EVENT_BY_ID[Store.event].bld,
      holdMs: () => Store.settings.holdMs,
      onState: s => this.onState(s),
      onTick: (ms, insp) => this.renderTime(insp ? inspectionText(ms) : this.liveText(ms)),
      onFinish: r => this.finish(r),
    });
    $('#scrPrev').onclick = () => this.prev();
    $('#scrNext').onclick = () => this.next();
    $('#scrCopy').onclick = () => this.cur && copyText(this.cur.text);
    $('#scrEdit').onclick = () => this.editScramble();
    $('#pvMode').onclick = () => Store.set('previewMode', Store.settings.previewMode === '3d' ? 'net' : '3d');
    $('#pvReplay').onclick = () => this.playPreview(true);
    $('#pvExpand').onclick = () => {
      const ev = EVENT_BY_ID[Store.event];
      if (this.cur) openBigCube({ kind: puzzleKind(ev), n: ev.n, alg: this.cur.text, title: `${ev.long} scramble` });
    };
    $('#pvHide').onclick = () => Store.set('previewCollapsed', !Store.settings.previewCollapsed);

    const stage = $('#stage');
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.preview, button, input, .last-actions') || Store.settings.input === 'type') return;
      if (e.button > 0) return;
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.engine.press();
    });
    stage.addEventListener('pointerup', () => this.engine.release());
    stage.addEventListener('pointercancel', () => { if (['holding', 'ready'].includes(this.engine.state)) this.engine.release(); });

    const input = $('#timerInput');
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const r = parseTyped(input.value);
      if (!r) { toast('Type a time like 1234, 12.34 or 1:02.50. Add + for +2, or type DNF.'); return; }
      input.value = '';
      this.finish(r, true);
    });

    $('#solveList').addEventListener('scroll', () => { if (!this.listRaf) this.listRaf = requestAnimationFrame(() => { this.listRaf = 0; this.renderList(); }); });
    $('#solveList').addEventListener('click', e => { const row = e.target.closest('.srow'); if (row) openSolveDetail(row.dataset.id); });
    $('#statTable').addEventListener('click', e => {
      const td = e.target.closest('td[data-k]'); if (!td) return;
      const row = STAT_ROWS.find(r => r[0] === td.dataset.k), st = statsFor(Store.session);
      const end = td.dataset.w === 'best' ? st.rows[row[0]].bestIdx : Store.session.solves.length - 1;
      if (row[1] === 1) { const s = Store.session.solves[end]; s && openSolveDetail(s.id); }
      else openAverageDetail(Store.session.solves, end, row[1], `${td.dataset.w === 'best' ? 'Best' : 'Current'} ${row[0]}`);
    });
    window.addEventListener('resize', () => this.renderList());

    Store.on(what => {
      if (what === 'event') { this.lastId = null; this.syncPreviewChrome(); this.loadScramble(); }
      if (what === 'event' || what === 'session' || what === 'solves') { this.renderSide(); this.renderLastActions(); if (!this.engine.busy && what !== 'solves') this.renderIdle(); }
      if (what === 'settings:previewMode') { Preview.cube.setMode(Store.settings.previewMode); this.syncPreviewChrome(); }
      if (what === 'settings:previewCollapsed' || what === 'settings:preview') { this.syncPreviewChrome(); if (App.view === 'timer') this.playPreview(false); }
      if (what === 'settings:input') this.syncInput();
      if (what === 'settings:precision' || what === 'settings:timerFont') { this.renderSide(); this.renderIdle(); }
      if (what === 'settings:inspection' || what === 'settings:holdMs') this.renderHint();
    });
    this.syncPreviewChrome();
    this.syncInput();
    this.renderHint();
  },

  activate() {
    Preview.cube.mount($('#previewBody'));
    this.renderSide();
    this.renderLastActions();
    const h0 = this.histFor(Store.event);
    if (h0.i < 0) this.next(); else this.showScramble(false);
    this.renderIdle();
  },

  // ---------- scrambles ----------
  histFor(ev) { return this.hist[ev] || (this.hist[ev] = { list: [], i: -1 }); },
  get cur() { const hh = this.histFor(Store.event); return hh.list[hh.i]; },
  async next() {
    if (this.engine.busy) return;
    const ev = Store.event, hh = this.histFor(ev);
    if (hh.i < hh.list.length - 1) { hh.i++; this.showScramble(true); return; }
    const token = this.pending = {};
    if (!this.cur || this.scrEl.dataset.ev !== ev) this.showWaiting();
    else this.scrEl.style.opacity = '.45';
    const scr = await Scrambler.next(ev);
    if (this.pending !== token || Store.event !== ev) return;
    this.pending = null;
    this.scrEl.style.opacity = '';
    hh.list.push(scr);
    if (hh.list.length > 50) hh.list.shift();
    hh.i = hh.list.length - 1;
    if (App.view === 'timer') this.showScramble(true);
  },
  prev() {
    const hh = this.histFor(Store.event);
    if (hh.i > 0 && !this.engine.busy) { hh.i--; this.showScramble(true); }
  },
  loadScramble() {
    const hh = this.histFor(Store.event);
    if (hh.i >= 0) this.showScramble(false); else this.next();
  },
  showWaiting() {
    const ev = EVENT_BY_ID[Store.event];
    this.scrEl.dataset.ev = Store.event;
    this.scrEl.innerHTML = `<span class="wait">${ev.rs ? 'Generating a random-state scramble…' : 'Generating…'}</span>`;
    $('#scrLabel').innerHTML = `<b>${esc(ev.long)}</b>`;
  },
  showScramble(animate) {
    const cur = this.cur, ev = EVENT_BY_ID[Store.event];
    if (!cur) return;
    this.scrEl.dataset.ev = Store.event;
    $('#scrLabel').innerHTML = `<b>${esc(ev.long)}</b><span class="dot"></span><span>${esc(cur.kind)}</span><span class="dot"></span><span>${moveCountLabel(Store.event, cur.text)}</span>`;
    this.spans = renderScrambleText(this.scrEl, cur.text);
    this.playPreview(animate);
  },
  playPreview(animate) {
    const ev = EVENT_BY_ID[Store.event], cur = this.cur, s = Store.settings;
    if (!s.preview || s.previewCollapsed) return;
    Preview.cube.mount($('#previewBody'));
    if (!cur) return;
    const spans = this.spans || [];
    Preview.cube.show({
      kind: puzzleKind(ev), n: ev.n, alg: cur.text, faceMap: null,
      animate: animate && s.animSpeed !== 'off',
      onMove: i => highlightMoves(this.scrEl, spans, i),
    });
  },
  async editScramble() {
    if (this.engine.busy) return;
    const text = await promptDialog('Use your own scramble', '', { ok: 'Use scramble', placeholder: "R U R' U' …", multiline: true });
    if (!text || !text.trim()) return;
    const hh = this.histFor(Store.event);
    hh.list.push({ text: text.trim().replace(/[ \t]+/g, ' '), kind: 'custom' });
    hh.i = hh.list.length - 1;
    this.showScramble(true);
  },
  syncPreviewChrome() {
    const s = Store.settings, pv = $('#preview');
    pv.hidden = !s.preview;
    pv.classList.toggle('collapsed', s.previewCollapsed);
    $('#pvHide').innerHTML = s.previewCollapsed ? icon('plus') : icon('up');
    $('#pvHide').title = s.previewCollapsed ? 'Expand' : 'Collapse';
    $('#pvMode').hidden = !EVENT_BY_ID[Store.event].n;
    $('#pvMode').innerHTML = s.previewMode === '3d' ? icon('net') : icon('cube');
    $('#pvMode').title = s.previewMode === '3d' ? 'Show flat net' : 'Show 3D cube';
  },
  syncInput() {
    const typed = Store.settings.input === 'type';
    $('#timerInput').hidden = !typed;
    this.timerEl.hidden = typed;
    this.padsEl.hidden = typed;
    this.renderHint();
  },
  renderHint() {
    const s = Store.settings, el = $('#stageHint');
    if (s.input === 'type') el.innerHTML = 'Type a time and press <kbd>enter</kbd>';
    else if (s.inspection) el.innerHTML = 'Tap <kbd>space</kbd> to inspect, hold to arm';
    else el.innerHTML = s.holdMs > 0 ? 'Hold <kbd>space</kbd>, release to start' : 'Press <kbd>space</kbd> to start';
  },

  // ---------- timing ----------
  liveText(ms) {
    const u = Store.settings.update;
    if (u === 'seconds') return String(Math.floor(ms / 1000));
    if (u === 'hidden') return Store.settings.timerFont === 'lcd' ? '-.--' : 'solving';
    return fmtMs(ms, prec());
  },
  renderTime(text) {
    const lcd = Store.settings.timerFont === 'lcd';
    this.timerEl.classList.toggle('lcd', lcd);
    if (lcd) this.timerEl.innerHTML = LCD(text); else this.timerEl.textContent = text;
  },
  renderIdle() {
    const f = this.lastId && Store.findSolve(this.lastId);
    const s = f && f.session.id === Store.session.id ? f.solve : Store.session.solves[Store.session.solves.length - 1];
    this.renderTime(s ? fmtSolve(s) : fmtMs(0, prec()));
  },
  onState(s) {
    this.timerEl.dataset.state = s;
    this.padsEl.dataset.state = s;
    const insp = !!this.engine.inspectAt;
    document.body.classList.toggle('focus', Store.settings.focus && (s === 'running' || insp));
    if ((s === 'holding' || s === 'ready') && !insp) this.renderTime(fmtMs(0, prec()));
    if (s === 'holding' || s === 'ready' || s === 'inspecting' || s === 'running') Preview.cube.finish();
    if (s === 'idle') this.renderIdle();
    if (s === 'inspecting') this.renderTime('15');
    this.renderLastActions();
  },
  finish(r, typed) {
    const session = Store.session, before = statsFor(session);
    const solve = { id: uid(), t: r.t, p: r.p, s: this.cur ? this.cur.text : '', d: Date.now() };
    if (typed) solve.m = 1;
    Store.addSolve(solve);
    this.lastId = solve.id;
    this.renderTime(fmtSolve(solve));
    this.checkPB(before, statsFor(session), solve);
    this.renderLastActions();
    this.next();
  },
  checkPB(before, after, solve) {
    if (!before.count) return;
    let msg = null;
    for (const [k] of STAT_ROWS) {
      if (k === 'mo3') continue;
      const b = before.rows[k].best, a = after.rows[k].best;
      if (b != null && a != null && Number.isFinite(a) && a < b && after.rows[k].bestIdx === after.count - 1) msg = `New best ${k === 'single' ? 'single' : k} · ${k === 'single' ? fmtSolve(solve) : fmtAvg(a)}`;
    }
    $('.pb-tag', $('#stage'))?.remove();
    if (!msg) return;
    const tag = h('div', { class: 'pb-tag', text: msg });
    $('#stage').append(tag);
    setTimeout(() => tag.remove(), 3800);
  },
  renderLastActions() {
    const box = $('#lastActions');
    const f = this.lastId && Store.findSolve(this.lastId);
    box.innerHTML = '';
    if (!f || this.engine.busy || f.session.id !== Store.session.id) return;
    const s = f.solve, id = s.id;
    const pen = (label, p, title) => h('button', { class: 'btn sm ghost' + (s.p === p ? ' on' : ''), text: label, title, onclick: () => { Store.updateSolve(id, { p }); this.renderTime(fmtSolve(s)); } });
    box.append(
      pen('OK', 0, 'No penalty (Alt+1)'), pen('+2', 2, '+2 penalty (Alt+2)'), pen('DNF', -1, 'Did not finish (Alt+3)'),
      h('button', { class: 'btn sm ghost' + (s.c ? ' on' : ''), html: icon('note'), title: s.c ? 'Note: ' + s.c : 'Add a note', 'aria-label': 'Note', onclick: () => this.noteLast() }),
      h('button', { class: 'btn sm ghost', html: icon('trash'), title: 'Delete solve (Alt+Z)', 'aria-label': 'Delete', onclick: () => this.deleteLast() }),
    );
  },
  async noteLast() {
    const f = this.lastId && Store.findSolve(this.lastId); if (!f) return;
    const text = await promptDialog('Note for this solve', f.solve.c || '', { multiline: true, placeholder: 'Lockup on the last layer, skipped OLL…' });
    if (text != null) { Store.updateSolve(f.solve.id, { c: text.trim() }); this.renderLastActions(); }
  },
  deleteLast() {
    const f = this.lastId ? Store.findSolve(this.lastId) : null;
    const s = f ? f.solve : Store.session.solves[Store.session.solves.length - 1];
    if (!s) return;
    const removed = Store.deleteSolves([s.id]);
    this.lastId = null;
    this.renderIdle(); this.renderLastActions();
    toast('Solve deleted', { label: 'Undo', fn: () => { Store.restoreSolves(removed); this.lastId = s.id; this.renderIdle(); this.renderLastActions(); } });
  },
  setPenaltyLast(p) {
    const s = Store.session.solves[Store.session.solves.length - 1];
    if (!s) return;
    Store.updateSolve(s.id, { p });
    this.lastId = s.id;
    this.renderTime(fmtSolve(s)); this.renderLastActions();
  },

  keydown(e) {
    const eng = this.engine;
    if (e.key === 'Escape' && eng.busy) { e.preventDefault(); eng.cancel(); document.body.classList.remove('focus'); return; }
    if (eng.state === 'running') { e.preventDefault(); eng.press(); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && Store.settings.input !== 'type') eng.press();
      return;
    }
    if (eng.busy) return;
    if (e.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { e.preventDefault(); this.setPenaltyLast({ Digit1: 0, Digit2: 2, Digit3: -1 }[e.code]); return; }
    if (e.altKey && e.code === 'KeyZ') { e.preventDefault(); this.deleteLast(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
  },
  keyup(e) {
    if (e.code === 'Space' || this.engine.state === 'stopped') this.engine.release();
  },

  // ---------- side column ----------
  renderSide() {
    const session = Store.session, st = statsFor(session), solves = session.solves;
    const last5 = solves.slice(-5), det = solves.length >= 5 ? windowDetail(solves, solves.length - 1, 5) : null;
    let sc = '';
    for (let i = 0; i < 5; i++) {
      const s = last5[i], trimmed = det && det.trimmed.has(i);
      const v = s ? (trimmed ? `(${fmtSolve(s)})` : fmtSolve(s)) : '–';
      sc += `<div><span class="k">${i + 1}</span><span class="v${trimmed ? ' trim' : ''}${s ? '' : ' empty'}">${v}</span></div>`;
    }
    $('#scorecard').innerHTML = sc;
    const note = $('#scoreNote');
    note.innerHTML = solves.length >= 5 ? `<b class="num">${fmtAvg(st.rows.ao5.cur)}</b>` : `${5 - solves.length} more to an average`;
    note.title = solves.length >= 5 ? `Solves ${solves.length - 4} to ${solves.length}` : '';

    let t = '<thead><tr><th></th><th>Current</th><th>Best</th></tr></thead><tbody>';
    for (const [k] of STAT_ROWS) {
      const r = st.rows[k], has = r.best != null;
      t += `<tr class="${has ? 'click' : ''}"><td>${k}</td><td ${has ? `data-k="${k}" data-w="cur"` : ''}>${k === 'single' ? (solves.length ? fmtSolve(solves[solves.length - 1]) : '–') : fmtAvg(r.cur)}</td><td class="best" ${has ? `data-k="${k}" data-w="best"` : ''}>${k === 'single' ? fmtMs(r.best, prec()) : fmtAvg(r.best)}</td></tr>`;
    }
    $('#statTable').innerHTML = t + '</tbody>';
    $('#statFoot').innerHTML = `<span>Solves<b>${st.count - st.dnf}/${st.count}</b></span><span>Mean<b>${fmtAvg(st.mean)}</b></span><span>σ<b>${st.sd == null ? '–' : (st.sd / 1000).toFixed(2)}</b></span>`;
    $('#timerSub').innerHTML = solves.length ? `<span><b>ao5</b>${fmtAvg(st.rows.ao5.cur)}</span><span><b>ao12</b>${fmtAvg(st.rows.ao12.cur)}</span>` : '';
    this.renderList();
  },
  renderList() {
    const box = $('#solveList'), spacer = $('#solveSpacer'), session = Store.session, solves = session.solves;
    const n = solves.length, RH = 30;
    if (!n) {
      spacer.style.height = 'auto';
      spacer.innerHTML = '<div class="empty-note">No solves in this session yet. Scramble your cube with the moves above, then hold space and let go to start.</div>';
      return;
    }
    const st = statsFor(session);
    spacer.style.height = n * RH + 'px';
    const top = box.scrollTop, hgt = box.clientHeight || 400;
    const first = Math.max(0, Math.floor(top / RH) - 6), last = Math.min(n, Math.ceil((top + hgt) / RH) + 6);
    let html = '';
    for (let r = first; r < last; r++) {
      const i = n - 1 - r, s = solves[i];
      html += `<div class="srow" style="top:${r * RH}px" data-id="${s.id}"><span class="ix">${i + 1}</span><span class="t${i === st.rows.single.bestIdx ? ' best' : ''}">${fmtSolve(s)}${s.c ? ' <span style="color:var(--ink-3)">•</span>' : ''}</span><span class="a">${fmtAvg(st.rows.ao5.roll[i])}</span><span class="a">${fmtAvg(st.rows.ao12.roll[i])}</span></div>`;
    }
    spacer.innerHTML = html;
  },
};
