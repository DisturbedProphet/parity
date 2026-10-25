// ---------------------------------------------------------------------------
// Timer state machine. idle -> (inspecting) -> holding -> ready -> running -> stopped
// Press/release come from the space bar, any key (to stop) or touch.
// ---------------------------------------------------------------------------
const Sound = {
  ctx: null,
  beep(freq = 880, dur = .12) {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + .02);
    } catch (e) { /* audio unavailable */ }
  },
  say(text) {
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.1; speechSynthesis.cancel(); speechSynthesis.speak(u); }
    catch (e) { this.beep(); }
  },
};

class TimerEngine {
  constructor({ inspection = () => false, holdMs = () => 300, onState, onTick, onFinish }) {
    Object.assign(this, { inspection, holdMs, onState, onTick, onFinish });
    this.state = 'idle'; this.armed = false; this.inspectAt = 0; this.startAt = 0; this.raf = 0; this.holdT = 0;
  }
  get busy() { return this.state !== 'idle' && this.state !== 'stopped'; }
  set(s) { this.state = s; this.onState && this.onState(s); }

  press() {
    const s = this.state;
    if (s === 'running') return this.stop();
    if (s === 'idle') { if (this.inspection()) { this.armed = true; return; } return this.hold(); }
    if (s === 'inspecting') return this.hold();
  }
  release() {
    const s = this.state;
    if (s === 'idle' && this.armed) { this.armed = false; return this.inspect(); }
    if (s === 'holding') { clearTimeout(this.holdT); return this.set(this.inspectAt ? 'inspecting' : 'idle'); }
    if (s === 'ready') return this.start();
    if (s === 'stopped') return this.set('idle');
  }
  hold() {
    const ms = this.holdMs();
    if (ms <= 0) return this.set('ready');
    this.set('holding');
    clearTimeout(this.holdT);
    this.holdT = setTimeout(() => { if (this.state === 'holding') this.set('ready'); }, ms);
  }
  inspect() {
    this.inspectAt = performance.now(); this.called = {};
    this.set('inspecting'); this.loop();
  }
  start() {
    const el = this.inspectAt ? performance.now() - this.inspectAt : 0;
    this.penalty = el > 17000 ? -1 : el > 15000 ? 2 : 0;
    this.inspectAt = 0;
    this.startAt = performance.now();
    this.set('running'); this.loop();
  }
  stop() {
    const t = Math.round(performance.now() - this.startAt);
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.set('stopped');
    this.onFinish({ t, p: this.penalty || 0 });
  }
  cancel() {
    clearTimeout(this.holdT); cancelAnimationFrame(this.raf); this.raf = 0;
    this.inspectAt = 0; this.armed = false;
    if (this.state !== 'idle') this.set('idle');
  }
  loop() {
    if (this.raf) return;
    const step = () => {
      this.raf = 0;
      const now = performance.now();
      if (this.state === 'running') this.onTick(now - this.startAt, false);
      else if (this.inspectAt && ['inspecting', 'holding', 'ready'].includes(this.state)) {
        const el = now - this.inspectAt;
        this.alerts(el);
        this.onTick(el, true);
      } else return;
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  alerts(el) {
    const mode = Store.settings.inspectAlerts;
    if (mode === 'off') return;
    for (const s of [8, 12]) {
      if (el >= s * 1000 && !this.called[s]) {
        this.called[s] = true;
        if (mode === 'voice') Sound.say(s === 8 ? 'Eight seconds' : 'Twelve seconds');
        else Sound.beep(s === 8 ? 660 : 990);
      }
    }
  }
}

function inspectionText(el) {
  if (el < 15000) return String(Math.ceil(15 - el / 1000));
  return el < 17000 ? '+2' : 'DNF';
}
