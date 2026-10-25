// ---------------------------------------------------------------------------
// Solves view: searchable, sortable log with bulk actions, and solve detail.
// ---------------------------------------------------------------------------
function openSolveDetail(id) {
  const f = Store.findSolve(id);
  if (!f) return;
  const { solve: s, session } = f, ev = EVENT_BY_ID[session.event];
  const timeEl = h('div', { class: 'sd-time num' });
  const seg = h('div', { class: 'seg' });
  const pens = [['No penalty', 0], ['+2', 2], ['DNF', -1]].map(([label, p]) =>
    h('button', { text: label, onclick: () => { Store.updateSolve(id, { p }); refresh(); } }));
  seg.append(...pens);
  const refresh = () => {
    timeEl.textContent = fmtSolveLong(s);
    pens.forEach((b, i) => b.classList.toggle('on', [0, 2, -1][i] === s.p));
  };
  const note = h('textarea', { class: 'field', rows: 2, placeholder: 'Add a note about this solve', id: 'sd-note-' + id });
  note.value = s.c || '';
  note.addEventListener('change', () => Store.updateSolve(id, { c: note.value.trim() }));
  const idx = session.solves.indexOf(s);
  const body = h('div', { class: 'solve-detail' },
    h('div', { class: 'sd-top' }, timeEl, seg),
    h('div', { class: 'sd-meta', text: `Solve ${idx + 1} in ${session.name} · ${ev.long} · ${new Date(s.d).toLocaleString()}${s.m ? ' · typed in' : ''}` }),
    h('div', { class: 'sd-scr', text: s.s || 'No scramble was recorded for this solve.' }),
    ev.n && s.s ? h('div', { class: 'sd-net', html: netSVG(new CubeState(ev.n).apply(s.s), paletteFor()) }) : null,
    note);
  refresh();
  const close = openModal({
    title: 'Solve', body,
    foot: [
      h('div', { class: 'left' }, h('button', {
        class: 'btn danger', html: icon('trash') + 'Delete', onclick: () => {
          const removed = Store.deleteSolves([id]); close();
          toast('Solve deleted', { label: 'Undo', fn: () => Store.restoreSolves(removed) });
        },
      })),
      s.s ? h('button', { class: 'btn', html: icon('copy') + 'Copy scramble', onclick: () => copyText(s.s) }) : null,
      s.s ? h('button', { class: 'btn', html: icon('cube') + 'View in 3D', onclick: () => { close(); openBigCube({ kind: puzzleKind(ev), n: ev.n, alg: s.s, title: `Solve ${idx + 1} scramble` }); } }) : null,
      h('button', { class: 'btn primary', text: 'Done', onclick: () => close() }),
    ],
  });
}

const SolvesView = {
  limit: 150, sort: { key: 'i', dir: -1 }, sel: new Set(),

  init() {
    $('#solvesSearch').addEventListener('input', () => { this.limit = 150; this.render(); });
    $('#solvesFilter').addEventListener('change', () => { this.limit = 150; this.render(); });
    $('#solvesMoreBtn').onclick = () => { this.limit += 300; this.render(); };
    $('#bulkClear').onclick = () => { this.sel.clear(); this.render(); };
    $('#bulkDelete').onclick = async () => {
      const ids = [...this.sel];
      if (!(await confirmDialog(`Delete ${ids.length} solve${ids.length > 1 ? 's' : ''}?`, 'You can undo this right after.', { ok: 'Delete', danger: true }))) return;
      const removed = Store.deleteSolves(ids); this.sel.clear();
      toast(`${ids.length} deleted`, { label: 'Undo', fn: () => Store.restoreSolves(removed) });
    };
    $('#bulkMove').onclick = e => {
      const others = Store.sessionsFor(Store.event).filter(s => s.id !== Store.session.id);
      openMenu(e.currentTarget, close => {
        const box = h('div');
        if (!others.length) box.append(h('div', { class: 'mh', text: 'No other sessions for this puzzle' }));
        for (const s of others) box.append(menuItem(s.name, () => { close(); Store.moveSolves([...this.sel], s.id); this.sel.clear(); toast(`Moved to ${s.name}`); }, { right: s.solves.length }));
        box.append(h('hr'), menuItem('New session…', async () => {
          close();
          const name = await promptDialog('New session', `Session ${Store.sessionsFor(Store.event).length + 1}`, { ok: 'Create and move' });
          if (!name) return;
          const cur = Store.session.id, ids = [...this.sel];
          const t = Store.newSession(Store.event, name.trim()); Store.d.sessions.push(t);
          Store.moveSolves(ids, t.id); Store.d.active[Store.event] = cur; this.sel.clear(); Store.emit('session');
          toast(`Moved to ${t.name}`);
        }, { html: icon('plus') }));
        return box;
      }, { align: 'left' });
    };
    $('#solvesTable').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (th) { const k = th.dataset.sort; this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : (k === 'i' || k === 'd' ? -1 : 1) }; this.render(); return; }
      const cb = e.target.closest('input[type="checkbox"]');
      if (cb) {
        if (cb.dataset.all != null) { const rows = this.rows(); if (cb.checked) rows.forEach(r => this.sel.add(r.s.id)); else this.sel.clear(); this.render(); }
        else { cb.checked ? this.sel.add(cb.dataset.id) : this.sel.delete(cb.dataset.id); this.renderBulk(); }
        return;
      }
      const tr = e.target.closest('tr[data-id]');
      if (tr) openSolveDetail(tr.dataset.id);
    });
    Store.on(what => { if (['solves', 'session', 'event'].includes(what) && App.view === 'solves') { if (what !== 'solves') this.sel.clear(); this.render(); } });
  },
  activate() { this.render(); },

  rows() {
    const session = Store.session, st = statsFor(session);
    const q = $('#solvesSearch').value.trim().toLowerCase(), filt = $('#solvesFilter').value;
    let rows = session.solves.map((s, i) => ({ s, i, e: st.times[i], a5: st.rows.ao5.roll[i], a12: st.rows.ao12.roll[i] }));
    if (filt === 'ok') rows = rows.filter(r => r.s.p === 0);
    else if (filt === 'p2') rows = rows.filter(r => r.s.p === 2);
    else if (filt === 'dnf') rows = rows.filter(r => r.s.p === -1);
    else if (filt === 'note') rows = rows.filter(r => r.s.c);
    if (q) rows = rows.filter(r => (r.s.c || '').toLowerCase().includes(q) || (r.s.s || '').toLowerCase().includes(q));
    const { key, dir } = this.sort, val = r => key === 't' ? r.e : key === 'ao5' ? r.a5 : key === 'ao12' ? r.a12 : key === 'd' ? r.s.d : r.i;
    rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return (va === vb ? 0 : va < vb ? -1 : 1) * dir || (b.i - a.i);
    });
    return rows;
  },

  render() {
    const session = Store.session, rows = this.rows();
    $('#solvesSub').textContent = `${session.name} · ${EVENT_BY_ID[session.event].long} · ${session.solves.length} solve${session.solves.length === 1 ? '' : 's'}`;
    const col = (k, label) => `<th class="sort" data-sort="${k}">${label}${this.sort.key === k ? `<span class="arr">${this.sort.dir < 0 ? '▼' : '▲'}</span>` : ''}</th>`;
    const allOn = rows.length && rows.every(r => this.sel.has(r.s.id));
    let html = `<thead><tr><th style="width:36px"><input type="checkbox" data-all aria-label="Select all" ${allOn ? 'checked' : ''}></th>${col('i', '#')}${col('t', 'Time')}${col('ao5', 'ao5')}${col('ao12', 'ao12')}<th>Scramble</th><th>Note</th>${col('d', 'Date')}</tr></thead><tbody>`;
    if (!rows.length) html += `<tr><td colspan="8" class="dim" style="padding:28px 12px;text-align:center;cursor:default">${session.solves.length ? 'No solves match this filter.' : 'Solves you time in this session show up here.'}</td></tr>`;
    for (const r of rows.slice(0, this.limit)) {
      const s = r.s;
      html += `<tr data-id="${s.id}"><td><input type="checkbox" data-id="${s.id}" aria-label="Select solve ${r.i + 1}" ${this.sel.has(s.id) ? 'checked' : ''}></td>`
        + `<td class="n dim">${r.i + 1}</td><td class="n">${fmtSolve(s)}${s.p === -1 ? ' <span class="pen dnf">DNF</span>' : s.p === 2 ? ' <span class="pen">+2</span>' : ''}</td>`
        + `<td class="n">${fmtAvg(r.a5)}</td><td class="n">${fmtAvg(r.a12)}</td>`
        + `<td class="scr">${esc((s.s || '').replace(/\n/g, ' '))}</td><td class="note">${esc(s.c || '')}</td><td class="dim">${fmtDate(s.d)}</td></tr>`;
    }
    $('#solvesTable').innerHTML = html + '</tbody>';
    $('#solvesMore').hidden = rows.length <= this.limit;
    this.renderBulk();
  },
  renderBulk() {
    $('#bulkBar').hidden = !this.sel.size;
    $('#bulkCount').textContent = `${this.sel.size} selected`;
  },
};
