// ---------------------------------------------------------------------------
// App shell: routing, header pickers, global keys, appearance.
// ---------------------------------------------------------------------------
function applyAppearance() {
  const s = Store.settings, root = document.documentElement;
  if (s.skin === 'auto') root.removeAttribute('data-skin'); else root.setAttribute('data-skin', s.skin);
  loadSkinFonts([s.skin]);
  root.setAttribute('data-tfont', s.timerFont === 'lcd' ? 'martian' : s.timerFont);
  root.setAttribute('data-tsize', s.timerSize);
}

function openShortcuts() {
  const rows = [
    [['Space'], 'Hold until green, release to start. Any key stops.'],
    [['Esc'], 'Cancel the timer or inspection without saving'],
    [['→'], 'Next scramble'], [['←'], 'Previous scramble'],
    [['Alt', '1'], 'Last solve: no penalty'], [['Alt', '2'], 'Last solve: +2'], [['Alt', '3'], 'Last solve: DNF'],
    [['Alt', 'Z'], 'Delete the last solve'],
    [['?'], 'Show these shortcuts'],
  ];
  const grid = h('div', { class: 'shortcuts' });
  for (const [keys, label] of rows) grid.append(h('div', { class: 'keys' }, keys.map(k => h('kbd', { text: k }))), h('span', { text: label }));
  openModal({ title: 'Keyboard shortcuts', body: [grid, h('div', { class: 'sd-meta', text: 'On a Mac, Alt is the Option key. On a phone, touch and hold the timer area.' })] });
}

// The guide is static HTML (readable without JavaScript, and by search crawlers).
const GuideView = { init() {}, activate() {} };

const App = {
  view: 'timer',
  views: null,

  init() {
    Store.load();
    applyAppearance();
    this.views = { timer: TimerView, solves: SolvesView, stats: StatsView, trainer: TrainerView, prefs: PrefsView, guide: GuideView };
    Preview.cube = new Cube3D();
    Scrambler.init();
    for (const v of Object.values(this.views)) v.init();
    this.bindHeader();
    this.bindKeys();
    Store.on(what => this.onStore(what));
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    const v = location.hash.slice(1);
    this.show(this.views[v] ? v : 'timer');
  },
  show(view) {
    for (const v of [TimerView, TrainerView]) if (v.engine.busy) v.engine.cancel();
    document.body.classList.remove('focus');
    closeMenu();
    this.view = view;
    $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + view));
    $$('#nav a').forEach(a => { a.classList.toggle('on', a.dataset.view === view); a.setAttribute('aria-current', a.dataset.view === view ? 'page' : 'false'); });
    this.views[view].activate();
  },

  onStore(what) {
    if (['event', 'session', 'solves'].includes(what)) this.renderHeader();
    if (what.startsWith('settings:')) {
      applyAppearance();
      if (what === 'settings:cubeStyle') Preview.cube.setStyle(Store.settings.cubeStyle);
      if (what === 'settings:colors') Preview.cube.refreshColors();
      if (what === 'settings:skin' && this.view === 'stats') StatsView.render();
      if (what === 'settings:timerFont' || what === 'settings:precision') { TimerView.renderIdle(); }
    }
    if ((what === 'event' || what === 'session') && this.view !== 'timer' && this.view !== 'prefs' && this.view !== 'trainer') this.views[this.view].activate();
  },

  renderHeader() {
    const ev = EVENT_BY_ID[Store.event], s = Store.session;
    $('#eventGlyph').innerHTML = eventGlyph(ev.id);
    $('#eventName').textContent = ev.name;
    $('#sessionName').textContent = s.name;
    $('#sessionCount').textContent = s.solves.length;
  },

  bindHeader() {
    $('#eventBtn').onclick = e => openMenu(e.currentTarget, close => {
      const grid = h('div', { class: 'ev-grid' });
      for (const ev of EVENTS) {
        grid.append(menuItem(ev.name, () => { close(); Store.setEvent(ev.id); }, { html: eventGlyph(ev.id), cls: ev.id === Store.event ? 'on' : '' }));
      }
      return grid;
    });
    $('#sessionBtn').onclick = e => openMenu(e.currentTarget, close => {
      const box = h('div');
      box.append(h('div', { class: 'mh', text: `${EVENT_BY_ID[Store.event].long} sessions` }));
      for (const s of Store.sessionsFor(Store.event)) {
        box.append(menuItem(s.name, () => { close(); Store.setSession(s.id); }, { right: s.solves.length, cls: s.id === Store.session.id ? 'on' : '' }));
      }
      box.append(h('hr'),
        menuItem('New session', async () => {
          close();
          const name = await promptDialog('New session', `Session ${Store.sessionsFor(Store.event).length + 1}`, { ok: 'Create' });
          if (name && name.trim()) Store.createSession(name.trim());
        }, { html: icon('plus') }),
        menuItem('Rename session', async () => {
          close();
          const s = Store.session, name = await promptDialog('Rename session', s.name, { ok: 'Rename' });
          if (name && name.trim()) Store.renameSession(s.id, name.trim());
        }, { html: icon('edit') }),
        menuItem('Delete session', async () => {
          close();
          const s = Store.session;
          if (await confirmDialog(`Delete “${s.name}”?`, `Its ${s.solves.length} solve${s.solves.length === 1 ? '' : 's'} will be removed. This cannot be undone.`, { ok: 'Delete session', danger: true })) {
            Store.deleteSession(s.id); toast('Session deleted');
          }
        }, { html: icon('trash'), cls: 'danger' }));
      return box;
    });
    $('#skinBtn').onclick = e => openMenu(e.currentTarget, close => {
      const box = h('div');
      box.append(h('div', { class: 'mh', text: 'Theme' }));
      for (const sk of SKINS) {
        box.append(menuItem(sk.name, () => { close(); Store.set('skin', sk.id); if (this.view === 'prefs') PrefsView.render(); }, {
          cls: Store.settings.skin === sk.id ? 'on' : '',
          html: `<span style="display:inline-block;width:16px;height:16px;border-radius:5px;background:${sk.bg};box-shadow:inset 0 0 0 1px rgba(127,127,127,.35)"></span>`,
        }));
      }
      return box;
    });
    $('#keysBtn').onclick = () => openShortcuts();
    this.renderHeader();
  },

  bindKeys() {
    const isField = t => t && t.matches && (t.matches('input, textarea, select') || t.isContentEditable);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (closeMenu()) { e.preventDefault(); return; }
        if (modalStack.length) { e.preventDefault(); closeTopModal(); return; }
      }
      if (modalStack.length || menuState) return;
      if (isField(e.target)) return;
      if (e.code === 'Space' && e.target.matches && e.target.matches('button, a')) e.target.blur();
      if (e.key === '?' && !this.views[this.view].engine?.busy) { openShortcuts(); return; }
      const v = this.views[this.view];
      v.keydown && v.keydown(e);
    });
    document.addEventListener('keyup', e => {
      if (modalStack.length || isField(e.target)) return;
      if (e.code === 'Space') e.preventDefault();
      const v = this.views[this.view];
      v.keyup && v.keyup(e);
    });
    document.addEventListener('pointerdown', e => {
      const eng = this.views[this.view].engine;
      if (eng && eng.state === 'running' && !e.target.closest('.stage, .drill-stage')) eng.press();
    }, true);
    window.addEventListener('blur', () => {
      for (const v of [TimerView, TrainerView]) if (['holding', 'ready'].includes(v.engine.state)) v.engine.cancel();
    });
  },
};

window.parity = { App, Store, Preview, Scrambler, CubeState };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
else App.init();
