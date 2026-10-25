// ---------------------------------------------------------------------------
// Preferences: appearance, timer behaviour, scramble cube, data.
// ---------------------------------------------------------------------------
const SKINS = [
  { id: 'auto', name: 'Auto', bg: 'linear-gradient(90deg,#F2F3F0 50%,#12151B 50%)', ink: '#7A808A', accent: '#2147D6' },
  { id: 'scorecard', name: 'Scorecard', bg: '#F2F3F0', ink: '#15171A', accent: '#2147D6' },
  { id: 'stackmat', name: 'Stackmat', bg: '#12151B', ink: '#E8EBF0', accent: '#F4C430' },
  { id: 'carbon', name: 'Carbon', bg: '#141414', ink: '#F1F1F1', accent: '#9A9A9A' },
  { id: 'cobalt', name: 'Cobalt', bg: '#102C9B', ink: '#F5F7FF', accent: '#FFD54A' },
  { id: 'amber', name: 'Amber', bg: '#14100A', ink: '#FFB547', accent: '#FFD593' },
  { id: 'mint', name: 'Mint', bg: '#E7F0EB', ink: '#10241B', accent: '#0D7656' },
  { id: 'sakura', name: 'Sakura', bg: '#F6ECEF', ink: '#2A1720', accent: '#C8336A' },
  { id: 'dusk', name: 'Dusk', bg: '#1B1922', ink: '#ECE8F3', accent: '#FFB28A' },
  { id: 'terminal', name: 'Terminal', bg: 'repeating-linear-gradient(#030803 0 2px,#000 2px 3px)', ink: '#7DFF8F', accent: '#C6FF4A', font: "'VT323', monospace", deco: 'text-shadow:0 0 8px rgba(125,255,143,.7)' },
  { id: 'gameboy', name: 'Game Boy', bg: '#9BBC0F', ink: '#0F380F', accent: '#306230', font: "'Press Start 2P', monospace", deco: 'font-size:11px' },
  { id: 'blueprint', name: 'Blueprint', bg: 'linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px) 0 0/12px 12px,linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px) 0 0/12px 12px,#0B3A7E', ink: '#EEF6FF', accent: '#FFFFFF', font: "'IBM Plex Mono', monospace" },
  { id: 'brutalist', name: 'Brutalist', bg: '#FFFFFF', ink: '#111111', accent: '#FFE500', font: "'Archivo', sans-serif", deco: 'font-weight:900' },
  { id: 'retro', name: 'Retro OS', bg: 'linear-gradient(#000080,#1084d0) 0 0/100% 12px no-repeat,#C0C0C0', ink: '#000000', accent: '#008080', font: "'VT323', monospace" },
  { id: 'neon', name: 'Neon', bg: 'radial-gradient(ellipse at 50% 120%,rgba(255,46,166,.6),transparent 60%),#0C0420', ink: '#FFFFFF', accent: '#2DE2E6', font: "'Orbitron', sans-serif", deco: 'text-shadow:0 0 8px #ff2ea6' },
  { id: 'notebook', name: 'Notebook', bg: 'linear-gradient(90deg,transparent 14px,rgba(220,70,70,.6) 14px 15px,transparent 15px),repeating-linear-gradient(transparent 0 11px,rgba(70,120,200,.3) 11px 12px),#FBFBF8', ink: '#1B2A4A', accent: '#2156D9', font: "'Courier Prime', monospace" },
  { id: 'faces', name: 'Cube Faces', bg: 'linear-gradient(90deg,#FFD21F 33%,#FF8A10 33% 66%,#16CC4E 66%)', ink: '#141414', accent: '#1F6BFF', font: "'Rubik Mono One', sans-serif", deco: 'font-size:15px' },
  { id: 'soft', name: 'Soft', bg: '#E3E7ED', ink: '#2B3240', accent: '#1F8F8A', font: "'Nunito', sans-serif", deco: 'text-shadow:3px 3px 6px #C2C8D1,-3px -3px 6px #fff' },
  { id: 'darkroom', name: 'Darkroom', bg: 'radial-gradient(ellipse at 50% 0%,rgba(255,40,20,.35),transparent 70%),#090000', ink: '#FF5440', accent: '#FF8A6E', font: "'DM Mono', monospace" },
  { id: 'chalkboard', name: 'Chalkboard', bg: '#24362C', ink: '#F2F1EA', accent: '#FFE48A', font: "'Patrick Hand', cursive" },
  { id: 'contrast', name: 'High Contrast', bg: '#000000', ink: '#FFFFFF', accent: '#FFE600', font: "'Atkinson Hyperlegible', sans-serif", deco: 'font-weight:700' },
];
// Fonts each character skin needs, loaded from Google Fonts when the skin is used.
const SKIN_FONTS = {
  terminal: ['VT323'], gameboy: ['Press+Start+2P', 'Silkscreen:wght@400;700'], blueprint: ['IBM+Plex+Mono:wght@400;500;600'],
  brutalist: ['Archivo:wght@400;600;800;900'], retro: ['VT323'],
  neon: ['Orbitron:wght@500..800', 'Exo+2:wght@400..700', 'Share+Tech+Mono'], notebook: ['Kalam:wght@400;700', 'Courier+Prime:wght@400;700'],
  faces: ['Rubik:wght@400..800', 'Rubik+Mono+One'], soft: ['Nunito:wght@400..800'], darkroom: ['DM+Mono:wght@400;500'],
  chalkboard: ['Patrick+Hand', 'Courier+Prime:wght@400;700'], contrast: ['Atkinson+Hyperlegible:wght@400;700'],
};
function loadSkinFonts(ids) {
  const fams = [...new Set(ids.flatMap(id => SKIN_FONTS[id] || []))];
  const key = 'skinfonts-' + ids.join('-');
  if (!fams.length || document.getElementById(key)) return;
  document.head.append(h('link', { id: key, rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${fams.map(f => 'family=' + f).join('&')}&display=swap` }));
}

function segControl(id, options, value, onChange) {
  const seg = h('div', { class: 'seg', id, role: 'group' });
  for (const [v, label] of options) {
    seg.append(h('button', {
      class: String(v) === String(value) ? 'on' : '', text: label, 'data-v': v,
      onclick: e => { $$('button', seg).forEach(b => b.classList.toggle('on', b === e.currentTarget)); onChange(v); },
    }));
  }
  return seg;
}
function switchControl(id, checked, onChange) {
  const input = h('input', { type: 'checkbox', id, role: 'switch' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, input, h('span'));
}
function prefRow(title, desc, ...controls) {
  return h('div', { class: 'pref-row' },
    h('div', { class: 'lbl' }, h('b', { text: title }), desc ? h('small', { text: desc }) : null),
    h('div', { class: 'ctl' }, ...controls));
}

const PrefsView = {
  init() { this.render(); },
  activate() { this.render(); },

  render() {
    const s = Store.settings, set = (k, v) => Store.set(k, v);
    const page = $('#prefsPage');
    page.innerHTML = '';
    page.append(h('div', { class: 'page-head' }, h('h1', { text: 'Settings' }), h('span', { class: 'sub', text: 'Saved in this browser as you change them' })));

    const skins = h('div', { class: 'skins' });
    loadSkinFonts(Object.keys(SKIN_FONTS));
    for (const sk of SKINS) {
      skins.append(h('button', {
        class: 'skin' + (s.skin === sk.id ? ' on' : ''), 'aria-pressed': s.skin === sk.id, onclick: e => {
          $$('.skin', skins).forEach(b => b.classList.toggle('on', b === e.currentTarget)); set('skin', sk.id);
        },
      },
      h('span', { class: 'sw', style: `background:${sk.bg};color:${sk.ink}` }, h('span', { class: 'digits', text: '9.87', style: `${sk.font ? `--sw-font:${sk.font};` : ''}${sk.deco || ''}` }), h('span', { class: 'chip', style: `background:${sk.accent}` })),
      h('span', { class: 'nm', text: sk.name })));
    }
    page.append(h('section', { class: 'pref-group' },
      h('h2', { text: 'Appearance' }),
      skins,
      prefRow('Timer typeface', 'Stackmat LCD draws the digits like a competition display.',
        segControl('pf-font', [['martian', 'Martian'], ['plex', 'Plex Mono'], ['grotesk', 'Grotesk'], ['lcd', 'Stackmat LCD']], s.timerFont, v => set('timerFont', v))),
      prefRow('Timer size', null, segControl('pf-size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], s.timerSize, v => set('timerSize', v))),
      prefRow('Focus while solving', 'Hide everything except the time while the timer runs.', switchControl('pf-focus', s.focus, v => set('focus', v))),
    ));

    const holdLabel = h('span', { class: 'num', style: 'min-width:52px;text-align:right', text: (s.holdMs / 1000).toFixed(2) + ' s' });
    const hold = h('input', { type: 'range', min: 0, max: 1000, step: 50, id: 'pf-hold', 'aria-label': 'Hold time' });
    hold.value = s.holdMs;
    hold.addEventListener('input', () => { holdLabel.textContent = (hold.value / 1000).toFixed(2) + ' s'; });
    hold.addEventListener('change', () => set('holdMs', +hold.value));
    page.append(h('section', { class: 'pref-group' },
      h('h2', { text: 'Timer' }),
      prefRow('Inspection', '15 seconds, WCA rules: +2 after 15 s and DNF after 17 s. Skipped for blindfolded.', switchControl('pf-insp', s.inspection, v => set('inspection', v))),
      prefRow('Inspection calls', 'Announced at 8 and 12 seconds.', segControl('pf-calls', [['voice', 'Voice'], ['beep', 'Beep'], ['off', 'Off']], s.inspectAlerts, v => set('inspectAlerts', v))),
      prefRow('Hold to start', 'How long space must be held before the timer turns green.', hold, holdLabel),
      prefRow('While solving show', null, segControl('pf-update', [['live', 'Live time'], ['seconds', 'Seconds'], ['hidden', 'Nothing']], s.update, v => set('update', v))),
      prefRow('Precision', null, segControl('pf-prec', [[2, '0.01'], [3, '0.001']], s.precision, v => set('precision', +v))),
      prefRow('Time entry', 'Typing is for times from a stackmat or another timer.', segControl('pf-input', [['keys', 'Keyboard timer'], ['type', 'Type times']], s.input, v => set('input', v))),
    ));

    const colors = h('div', { class: 'colors' });
    s.colors.forEach((c, i) => {
      const inp = h('input', { type: 'color', id: 'pf-col-' + i, 'aria-label': FACES[i] + ' face colour' });
      inp.value = c;
      inp.addEventListener('input', () => { const next = Store.settings.colors.slice(); next[i] = inp.value; set('colors', next); });
      colors.append(h('label', null, inp, FACES[i]));
    });
    page.append(h('section', { class: 'pref-group' },
      h('h2', { text: 'Scramble preview' }),
      prefRow('Show scramble preview', 'The puzzle in the corner of the timer that scrambles itself. Works for every event.', switchControl('pf-pv', s.preview, v => set('preview', v))),
      prefRow('Cube view', 'The flat net is available for cubes.', segControl('pf-pvmode', [['3d', '3D'], ['net', 'Flat net']], s.previewMode, v => set('previewMode', v))),
      prefRow('Puzzle style', 'Stickerless has bright matte tiles and white internals.', segControl('pf-style', [['stickerless', 'Stickerless'], ['black', 'Black stickers'], ['white', 'White stickers']], s.cubeStyle, v => set('cubeStyle', v))),
      prefRow('Scramble animation', null, segControl('pf-anim', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['off', 'Off']], s.animSpeed, v => set('animSpeed', v))),
      prefRow('Sticker colours', 'Up, right, front, down, left, back.', colors,
        h('button', { class: 'btn sm ghost', text: 'Reset', onclick: () => { set('colors', DEFAULT_COLORS.slice()); this.render(); } })),
    ));

    const file = h('input', { type: 'file', accept: '.json,.txt,application/json', id: 'pf-import', hidden: true });
    file.addEventListener('change', async () => { const f = file.files[0]; if (f) importData(await f.text()); file.value = ''; });
    const total = Store.d.sessions.reduce((a, x) => a + x.solves.length, 0);
    page.append(h('section', { class: 'pref-group' },
      h('h2', { text: 'Data' }),
      prefRow('Backup', `${total} solves in ${Store.d.sessions.length} sessions are stored in this browser only. Export a backup to keep them safe or move them.`,
        h('button', { class: 'btn', html: icon('download') + 'Export', onclick: exportData })),
      prefRow('Import', 'A parity backup or a csTimer export. Imported sessions are added next to yours.',
        file, h('button', { class: 'btn', html: icon('upload') + 'Choose file', onclick: () => file.click() })),
      prefRow('Sample session', 'Adds a session of example solves so you can explore the stats.',
        h('button', { class: 'btn', text: 'Add sample', onclick: () => { addSampleSession(); toast('Sample session added to 3×3'); } })),
      prefRow('Erase everything', 'Deletes every session and solve. Settings stay.',
        h('button', { class: 'btn danger', text: 'Erase data', onclick: eraseData })),
    ));
  },
};

function exportData() {
  const stamp = new Date().toISOString().slice(0, 10);
  saveFile(`parity-backup-${stamp}.json`, JSON.stringify({ app: 'parity', v: 1, exported: Date.now(), data: Store.d }, (k, v) => (k === 'rev' ? undefined : v)));
}

const CSTIMER_EVENTS = { 333: '333', '222so': '222', '444wca': '444', '555wca': '555', '666wca': '666', '777wca': '777', '333oh': '333oh', '333ni': '333bf', pyrso: 'pyram', skbso: 'skewb', mgmp: 'minx', clkwca: 'clock', sqrs: 'sq1' };
function importData(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { toast('That file is not a JSON export.'); return; }
  let added = 0, solves = 0;
  if (obj && obj.app === 'parity' && obj.data && Array.isArray(obj.data.sessions)) {
    for (const s of obj.data.sessions) {
      if (!EVENT_BY_ID[s.event] || !Array.isArray(s.solves) || Store.sessionById(s.id)) continue;
      Store.d.sessions.push({ id: s.id, name: s.name, event: s.event, created: s.created || Date.now(), solves: s.solves, rev: 0 });
      added++; solves += s.solves.length;
    }
  } else if (obj && Object.keys(obj).some(k => /^session\d+$/.test(k))) {
    let meta = {};
    try { const sd = obj.properties && obj.properties.sessionData; meta = typeof sd === 'string' ? JSON.parse(sd) : (sd || {}); } catch (e) { meta = {}; }
    for (const key of Object.keys(obj).filter(k => /^session\d+$/.test(k))) {
      const arr = obj[key], num = key.slice(7), m = meta[num] || {};
      if (!Array.isArray(arr) || !arr.length) continue;
      const ev = CSTIMER_EVENTS[m.opt && m.opt.scrType] || '333';
      const list = arr.filter(x => Array.isArray(x) && Array.isArray(x[0])).map(x => ({
        id: uid(), t: Math.max(0, +x[0][1] || 0), p: x[0][0] === -1 ? -1 : x[0][0] === 2000 ? 2 : 0,
        s: String(x[1] || ''), c: String(x[2] || ''), d: (+x[3] || Date.now() / 1000) * 1000,
      }));
      Store.d.sessions.push({ id: uid(), name: `csTimer ${m.name != null ? m.name : num}`, event: ev, created: Date.now(), solves: list, rev: 0 });
      added++; solves += list.length;
    }
  } else { toast('This file is not a parity backup or a csTimer export.'); return; }
  Store.emit('session');
  PrefsView.render();
  toast(added ? `Imported ${solves} solves in ${added} session${added > 1 ? 's' : ''}` : 'Nothing new to import');
}

async function eraseData() {
  if (!(await confirmDialog('Erase all sessions and solves?', 'This cannot be undone. Export a backup first if you might want them back.', { ok: 'Erase everything', danger: true }))) return;
  Store.d.sessions = []; Store.d.active = {}; Store.d.trainer = { set: 'pll', sel: {}, times: {} };
  TimerView.lastId = null;
  Store.ensureSession(Store.event);
  Store.emit('session');
  PrefsView.render();
  toast('All solves erased');
}

function addSampleSession() {
  const now = Date.now(), solves = [], N = 140;
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let i = 0; i < N; i++) {
    const base = 17200 - i * 22, t = Math.max(8200, Math.round(base + gauss() * 1700 + (Math.random() < .06 ? 4000 : 0)));
    const r = Math.random();
    solves.push({ id: uid(), t, p: r < .025 ? -1 : r < .07 ? 2 : 0, s: nxnScramble(3, 20), d: now - (N - i) * 3.6 * 3600 * 1000, c: i === 61 ? 'PLL skip' : '' });
  }
  const s = Store.newSession('333', 'Sample session'); s.solves = solves;
  Store.d.sessions.push(s);
  if (Store.event === '333') Store.d.active['333'] = s.id;
  Store.emit('session');
}
