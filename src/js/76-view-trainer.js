// ---------------------------------------------------------------------------
// Trainer: drill selected PLL, OLL, 2-look and F2L cases with random-state setup scrambles.
// The cube is held yellow-up, green-front.
// ---------------------------------------------------------------------------
const TrainerView = {
  current: null, token: null, last: null, svgCache: {},

  init() {
    this.timerEl = $('#trTimer'); this.padsEl = $('#trPads'); this.scrEl = $('#trScramble');
    this.engine = new TimerEngine({
      inspection: () => false,
      holdMs: () => Store.settings.holdMs,
      onState: s => this.onState(s),
      onTick: ms => this.renderTime(TimerView.liveText(ms)),
      onFinish: r => this.finish(r),
    });
    $('#trSet').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || this.engine.busy) return;
      Store.d.trainer.set = b.dataset.v; Store.save();
      this.last = null; this.renderCases(); this.nextCase();
    });
    $('#trAll').onclick = () => { Store.d.trainer.sel[this.set.id] = this.set.cases.map(c => c.id); Store.save(); this.renderCases(); if (!this.current) this.nextCase(); };
    $('#trNone').onclick = () => { Store.d.trainer.sel[this.set.id] = []; Store.save(); this.renderCases(); };
    $('#trCases').addEventListener('click', e => {
      const card = e.target.closest('.case'); if (!card) return;
      const ids = new Set(this.selIds()), id = card.dataset.id;
      ids.has(id) ? ids.delete(id) : ids.add(id);
      Store.d.trainer.sel[this.set.id] = this.set.cases.map(c => c.id).filter(x => ids.has(x)); Store.save();
      this.renderCases();
      if (!this.current || !ids.has(this.current.case.id)) this.nextCase();
    });
    $('#trSkip').onclick = () => this.nextCase();
    $('#trCopy').onclick = () => this.current && copyText(this.current.scramble);
    $('#trReplay').onclick = () => this.playPreview(true);
    $('#trPeek').onclick = () => { Store.d.trainer.hideCube = !Store.d.trainer.hideCube; Store.save(); this.syncPeek(); };
    const stage = $('#trStage');
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.preview, button') || e.button > 0) return;
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.engine.press();
    });
    stage.addEventListener('pointerup', () => this.engine.release());
    Store.on(what => {
      if (what === 'settings:colors' && App.view === 'trainer') { this.svgCache = {}; this.renderCases(); }
      if (what === 'settings:precision' && App.view === 'trainer') this.renderCases();
    });
  },

  get set() { return ALG_SETS[Store.d.trainer.set] || ALG_SETS.pll; },
  selIds() { const s = Store.d.trainer.sel[this.set.id]; return Array.isArray(s) ? s : this.set.cases.map(c => c.id); },
  timesFor(id) { return Store.d.trainer.times[`${this.set.id}:${id}`] || []; },

  activate() {
    $$('#trSet button').forEach(b => b.classList.toggle('on', b.dataset.v === this.set.id));
    Preview.cube.mount($('#trPreviewBody'));
    this.renderCases();
    this.syncPeek();
    if (!this.current || this.current.set !== this.set.id) this.nextCase();
    else { this.showCase(false); this.renderReveal(); }
    this.renderTime(fmtMs(0, prec()));
  },

  renderCases() {
    const set = this.set, sel = new Set(this.selIds()), pal = paletteFor(TRAINER_FACE_MAP);
    $$('#trSet button').forEach(b => b.classList.toggle('on', b.dataset.v === set.id));
    $('#trCases').innerHTML = set.cases.map(cs => {
      const key = set.id + cs.id;
      const svg = this.svgCache[key] || (this.svgCache[key] = cs.mode === 'f2l' ? f2lSVG(caseState(cs.alg), pal) : llSVG(caseState(cs.alg), pal, cs.mode));
      const t = this.timesFor(cs.id), recent = t.slice(-5);
      const stat = t.length ? `${fmtAvg(meanOf(recent))} · ${t.length}×` : 'not drilled';
      return `<button class="case${sel.has(cs.id) ? ' sel' : ''}" data-id="${esc(cs.id)}" title="${esc((cs.group ? cs.group + ': ' : '') + cs.alg)}" aria-pressed="${sel.has(cs.id)}">${svg}<span class="nm">${esc(cs.name)}</span><span class="st">${stat}</span></button>`;
    }).join('');
    $('#trCount').textContent = `${sel.size} of ${set.cases.length} in the drill`;
  },

  async nextCase() {
    if (this.engine.busy) return;
    const set = this.set, ids = this.selIds();
    if (!ids.length) {
      this.current = null;
      this.scrEl.innerHTML = '<span class="wait">Pick at least one case on the right to start drilling.</span>';
      $('#trLabel').innerHTML = `<b>${set.name} trainer</b>`;
      return;
    }
    let id = pick(ids);
    if (ids.length > 1) while (this.current && id === this.current.case.id) id = pick(ids);
    const cs = set.cases.find(c => c.id === id);
    const auf = () => pick(['', 'U', 'U2', "U'"]);
    const setup = `${caseSetup(cs.pre)} ${auf()} ${invertAlg(cs.alg)} ${auf()}`;
    const state = new CubeState(3).apply(setup).normalize();
    const token = this.token = {};
    this.scrEl.style.opacity = '.45';
    let scramble = '';
    try { scramble = await Scrambler.solveFacelets(state.faceletString()); } catch (e) { scramble = ''; }
    if (this.token !== token) return;
    this.scrEl.style.opacity = '';
    if (!scramble) scramble = tokenize(setup).join(' ');
    this.current = { set: set.id, case: cs, scramble };
    if (App.view === 'trainer') this.showCase(true);
  },

  showCase(animate) {
    const c = this.current; if (!c) return;
    $('#trLabel').innerHTML = `<b>${this.set.name} trainer</b><span class="dot"></span><span>yellow top, green front</span><span class="dot"></span><span>${moveCountLabel('333', c.scramble)}</span>`;
    this.spans = renderScrambleText(this.scrEl, c.scramble);
    this.playPreview(animate);
  },
  playPreview(animate) {
    const c = this.current; if (!c) return;
    Preview.cube.mount($('#trPreviewBody'));
    Preview.cube.show({
      n: 3, alg: c.scramble, faceMap: TRAINER_FACE_MAP,
      animate: animate && Store.settings.animSpeed !== 'off',
      onMove: i => highlightMoves(this.scrEl, this.spans || [], i),
    });
  },
  syncPeek() {
    const hide = !!Store.d.trainer.hideCube;
    $('#trPreview').classList.toggle('collapsed', hide);
    $('#trPeek').classList.toggle('on', hide);
  },

  renderTime(text) {
    const lcd = Store.settings.timerFont === 'lcd';
    this.timerEl.classList.toggle('lcd', lcd);
    if (lcd) this.timerEl.innerHTML = LCD(text); else this.timerEl.textContent = text;
  },
  renderReveal() {
    const el = $('#trReveal'), l = this.last;
    if (!l) { el.innerHTML = '<span class="hint">Recognise the case on your cube, then solve it. The answer shows after each solve.</span>'; return; }
    const t = this.timesFor(l.case.id);
    el.innerHTML = `<span class="name">${esc(l.case.name)}${l.set === 'pll' ? ' perm' : ''}</span><span class="alg">${esc(l.case.alg)}</span><span class="hint">${fmtMs(l.t, prec())} this time · ${fmtAvg(meanOf(t.slice(-5)))} recent average · ${t.length} drilled</span>`;
  },
  onState(s) {
    this.timerEl.dataset.state = s; this.padsEl.dataset.state = s;
    if (s === 'holding' || s === 'ready') { this.renderTime(fmtMs(0, prec())); Preview.cube.finish(); }
    document.body.classList.toggle('focus', Store.settings.focus && s === 'running');
  },
  finish(r) {
    const c = this.current; if (!c) return;
    const key = `${c.set}:${c.case.id}`, arr = Store.d.trainer.times[key] || (Store.d.trainer.times[key] = []);
    arr.push(r.t); if (arr.length > 60) arr.shift();
    Store.save();
    this.last = { set: c.set, case: c.case, t: r.t };
    this.renderTime(fmtMs(r.t, prec()));
    this.renderReveal();
    this.renderCases();
    this.nextCase();
  },

  keydown(e) {
    const eng = this.engine;
    if (e.key === 'Escape' && eng.busy) { e.preventDefault(); eng.cancel(); document.body.classList.remove('focus'); return; }
    if (eng.state === 'running') { e.preventDefault(); eng.press(); return; }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && this.current) eng.press(); return; }
    if (!eng.busy && e.key === 'ArrowRight' && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); this.nextCase(); }
  },
  keyup(e) { if (e.code === 'Space' || this.engine.state === 'stopped') this.engine.release(); },
};
