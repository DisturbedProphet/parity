// ---------------------------------------------------------------------------
// DOM helpers, formatting, overlays.
// ---------------------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

const ICONS = {
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  note: '<path d="M5 5h14v10H9l-4 4V5Z"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  net: '<rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/><rect x="15" y="9" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  up: '<path d="M6 12h12"/>',
  open: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
};
const icon = name => `<svg class="i" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

// ---------- time formatting ----------
function fmtMs(ms, prec = 2, round = false) {
  if (ms == null) return '–';
  if (!isFinite(ms)) return 'DNF';
  const unit = prec === 3 ? 1 : 10, per = prec === 3 ? 1000 : 100;
  const total = round ? Math.round(ms / unit) : Math.floor(ms / unit);
  const frac = String(total % per).padStart(prec, '0');
  const secs = Math.floor(total / per);
  const hh = Math.floor(secs / 3600), mm = Math.floor(secs / 60) % 60, ss = secs % 60;
  const p2 = v => String(v).padStart(2, '0');
  if (hh) return `${hh}:${p2(mm)}:${p2(ss)}.${frac}`;
  if (mm) return `${mm}:${p2(ss)}.${frac}`;
  return `${ss}.${frac}`;
}
const prec = () => Store.settings.precision;
const fmtAvg = v => fmtMs(v, prec(), true);
function fmtSolve(s) {
  if (s.p === -1) return 'DNF';
  return fmtMs(s.t + (s.p === 2 ? 2000 : 0), prec()) + (s.p === 2 ? '+' : '');
}
function fmtSolveLong(s) {
  if (s.p === -1) return `DNF (${fmtMs(s.t, prec())})`;
  return fmtSolve(s);
}
function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const hr = Math.floor(m / 60);
  return `${hr} h ${m % 60} min`;
}
const fmtDate = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// Typed entry: "1234" -> 12.34, "1:02.5", "12.3+", "dnf"
function parseTyped(str) {
  let s = str.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let p = 0;
  if (s.startsWith('dnf')) { p = -1; s = s.replace(/^dnf\(?/, '').replace(/\)$/, ''); if (!s) return { t: 0, p }; }
  if (s.endsWith('+')) { p = p || 2; s = s.slice(0, -1); }
  let ms;
  if (/^\d+$/.test(s)) {
    const d = s.padStart(3, '0'), cs = +d.slice(-2), rest = d.slice(0, -2);
    ms = ((+rest.slice(0, -2) || 0) * 60 + +rest.slice(-2)) * 1000 + cs * 10;
  } else if (/^(\d+:){0,2}\d+(\.\d+)?$/.test(s)) {
    ms = Math.round(s.split(':').reduce((acc, x) => acc * 60 + parseFloat(x), 0) * 1000);
  } else return null;
  if (!(ms > 0)) return null;
  return { t: ms, p };
}

// ---------- overlays ----------
const modalStack = [];
function openModal({ title, body, foot, wide, onClose, cls }) {
  const layer = $('#layer');
  const veil = h('div', { class: 'veil' });
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close', html: icon('x') });
  const modal = h('div', { class: `modal${wide ? ' wide' : ''}${cls ? ' ' + cls : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h3', { text: title }), closeBtn),
    h('div', { class: 'modal-body' }, body),
    foot ? h('div', { class: 'modal-foot' }, foot) : null);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    veil.remove(); modal.remove();
    const i = modalStack.indexOf(close); if (i >= 0) modalStack.splice(i, 1);
    onClose && onClose();
  };
  veil.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  layer.append(veil, modal);
  modalStack.push(close);
  const focusable = modal.querySelector('[autofocus], textarea, input:not([type=hidden])');
  (focusable || closeBtn).focus({ preventScroll: true });
  return close;
}
const closeTopModal = () => { const c = modalStack[modalStack.length - 1]; if (c) { c(); return true; } return false; };

function confirmDialog(title, text, { ok = 'Confirm', danger = false } = {}) {
  return new Promise(res => {
    let result = false;
    const okBtn = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, text: ok, onclick: () => { result = true; close(); } });
    const close = openModal({
      title, body: h('p', { style: 'margin:0;color:var(--ink-2)', text }),
      foot: [h('button', { class: 'btn ghost', text: 'Cancel', onclick: () => close() }), okBtn],
      onClose: () => res(result),
    });
    okBtn.focus();
  });
}

function promptDialog(title, value = '', { ok = 'Save', placeholder = '', multiline = false } = {}) {
  return new Promise(res => {
    let result = null;
    const input = multiline
      ? h('textarea', { class: 'field', rows: 4, placeholder, autofocus: true, id: 'prompt-' + uid() })
      : h('input', { class: 'field', placeholder, autofocus: true, id: 'prompt-' + uid() });
    input.value = value;
    const submit = () => { result = input.value; close(); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } });
    const close = openModal({
      title, body: input,
      foot: [h('button', { class: 'btn ghost', text: 'Cancel', onclick: () => close() }), h('button', { class: 'btn primary', text: ok, onclick: submit })],
      onClose: () => res(result),
    });
    input.select && input.select();
  });
}

let menuState = null;
function closeMenu() {
  if (!menuState) return false;
  menuState.menu.remove();
  document.removeEventListener('pointerdown', menuState.outside, true);
  menuState = null;
  return true;
}
function openMenu(anchor, build, { align = 'right' } = {}) {
  if (menuState && menuState.anchor === anchor) { closeMenu(); return; }
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu' });
  menu.append(build(closeMenu));
  $('#layer').append(menu);
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, hgt = menu.offsetHeight;
  let left = align === 'right' ? r.right - w : r.left;
  left = clamp(left, 12, window.innerWidth - w - 12);
  let top = r.bottom + 6;
  if (top + hgt > window.innerHeight - 12) top = Math.max(12, r.top - hgt - 6);
  menu.style.left = left + 'px'; menu.style.top = top + 'px';
  const outside = e => { if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  document.addEventListener('pointerdown', outside, true);
  menuState = { menu, anchor, outside };
  const first = menu.querySelector('.mi.on, .mi'); first && first.focus({ preventScroll: true });
}
function menuItem(label, onClick, { right, cls, html } = {}) {
  return h('button', { class: 'mi' + (cls ? ' ' + cls : ''), role: 'menuitem', onclick: onClick },
    html ? h('span', { html }) : null, h('span', { text: label }), right != null ? h('span', { class: 'r', text: right }) : null);
}

function toast(msg, action) {
  const t = h('div', { class: 'toast', role: 'status' }, h('span', { text: msg }));
  if (action) t.append(h('button', { text: action.label, onclick: () => { action.fn(); t.remove(); } }));
  $('#toasts').append(t);
  setTimeout(() => t.remove(), action ? 6500 : 2400);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); return; } catch (e) { /* fall through */ }
  const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' }); ta.value = text;
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (ok) toast('Copied to clipboard');
  else openModal({ title: 'Copy', body: h('textarea', { class: 'field', rows: 6, readonly: true, html: esc(text) }) });
}

// Offer a file. Inside claude.ai this goes through the downloads capability;
// as a standalone page it falls back to a normal browser download.
async function saveFile(filename, data) {
  let dl = null;
  try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (dl) {
    try { await dl.save({ filename, data }); toast('Saved ' + filename); }
    catch (e) { if (e && e.code !== 'declined') toast('The file could not be saved here'); }
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
