// ---------------------------------------------------------------------------
// Persistent state: settings, sessions and solves (browser storage).
// A solve is { id, t: ms, p: 0 | 2 | -1 (DNF), s: scramble, d: timestamp, c: note }.
// ---------------------------------------------------------------------------
const STORE_KEY = 'parity:v1';
const DEFAULT_COLORS = ['#FAFAF6', '#F0213A', '#16CC4E', '#FFE418', '#FF8A10', '#1F6BFF'];
const DEFAULTS = {
  skin: 'auto', timerFont: 'martian', timerSize: 'm',
  inspection: false, inspectAlerts: 'voice', holdMs: 300, precision: 2, update: 'live',
  input: 'keys', focus: true,
  preview: true, previewMode: '3d', previewCollapsed: false, cubeStyle: 'stickerless', animSpeed: 'normal',
  colors: DEFAULT_COLORS,
};

const Store = {
  d: null,
  subs: new Set(),
  saveFailed: false,

  load() {
    let d = null;
    try { d = JSON.parse(storageGet(STORE_KEY)); } catch (e) { d = null; }
    this.fresh = !d;
    if (!d || !Array.isArray(d.sessions)) d = { v: 1, event: '333', sessions: [], active: {} };
    d.settings = Object.assign({}, DEFAULTS, d.settings || {});
    d.settings.colors = Array.isArray(d.settings.colors) && d.settings.colors.length === 6 ? d.settings.colors.slice() : DEFAULT_COLORS.slice();
    d.trainer = Object.assign({ set: 'pll', sel: {}, times: {} }, d.trainer || {});
    d.active = d.active || {};
    if (!EVENT_BY_ID[d.event]) d.event = '333';
    d.sessions = d.sessions.filter(s => EVENT_BY_ID[s.event]);
    for (const s of d.sessions) { s.rev = 0; s.solves = Array.isArray(s.solves) ? s.solves : []; }
    this.d = d;
    this.ensureSession(d.event);
  },

  save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      const ok = storageSet(STORE_KEY, JSON.stringify(this.d, (k, v) => (k === 'rev' ? undefined : v)));
      if (!ok && !this.saveFailed) { this.saveFailed = true; toast('This browser is not keeping data. Export your solves from Settings.'); }
    }, 250);
  },
  emit(what) { this.save(); for (const fn of this.subs) fn(what); },
  on(fn) { this.subs.add(fn); },

  get settings() { return this.d.settings; },
  set(key, value) { this.d.settings[key] = value; this.emit('settings:' + key); },

  get event() { return this.d.event; },
  sessionsFor(ev) { return this.d.sessions.filter(s => s.event === ev); },
  sessionById(id) { return this.d.sessions.find(s => s.id === id); },
  newSession(ev, name) { return { id: uid(), name, event: ev, created: Date.now(), solves: [], rev: 0 }; },
  ensureSession(ev) {
    let list = this.sessionsFor(ev);
    if (!list.length) { const s = this.newSession(ev, 'Session 1'); this.d.sessions.push(s); list = [s]; }
    if (!list.some(s => s.id === this.d.active[ev])) this.d.active[ev] = list[0].id;
    return this.sessionById(this.d.active[ev]);
  },
  get session() { return this.ensureSession(this.d.event); },

  setEvent(ev) { if (ev === this.d.event) return; this.d.event = ev; this.ensureSession(ev); this.emit('event'); },
  setSession(id) { this.d.active[this.d.event] = id; this.emit('session'); },
  createSession(name) {
    const s = this.newSession(this.d.event, name);
    this.d.sessions.push(s); this.d.active[this.d.event] = s.id; this.emit('session');
    return s;
  },
  renameSession(id, name) { const s = this.sessionById(id); if (s) { s.name = name; this.emit('session'); } },
  deleteSession(id) {
    this.d.sessions = this.d.sessions.filter(s => s.id !== id);
    this.ensureSession(this.d.event); this.emit('session');
  },

  addSolve(solve) { const s = this.session; s.solves.push(solve); s.rev++; this.emit('solves'); },
  findSolve(id) {
    for (const session of this.d.sessions) {
      const index = session.solves.findIndex(x => x.id === id);
      if (index >= 0) return { session, index, solve: session.solves[index] };
    }
    return null;
  },
  updateSolve(id, patch) {
    const f = this.findSolve(id); if (!f) return;
    Object.assign(f.solve, patch); f.session.rev++; this.emit('solves');
  },
  deleteSolves(ids) {
    const set = new Set(ids), removed = [];
    for (const session of this.d.sessions) {
      if (!session.solves.some(x => set.has(x.id))) continue;
      session.solves.forEach((solve, index) => { if (set.has(solve.id)) removed.push({ sid: session.id, index, solve }); });
      session.solves = session.solves.filter(x => !set.has(x.id));
      session.rev++;
    }
    this.emit('solves');
    return removed;
  },
  restoreSolves(removed) {
    for (const r of removed.slice().sort((a, b) => a.index - b.index)) {
      const s = this.sessionById(r.sid); if (!s) continue;
      s.solves.splice(Math.min(r.index, s.solves.length), 0, r.solve); s.rev++;
    }
    this.emit('solves');
  },
  moveSolves(ids, targetId) {
    const target = this.sessionById(targetId); if (!target) return;
    const removed = this.deleteSolves(ids);
    target.solves.push(...removed.map(r => r.solve));
    target.solves.sort((a, b) => a.d - b.d); target.rev++;
    this.emit('solves');
  },
};
