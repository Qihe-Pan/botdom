/* Botdom home page effects: page-wide light, per-block shine, a branded cursor and optional sound.
   - Light and cursor run only for fine pointers and are off under reduced motion; the native cursor returns then.
   - Sound is off by default and only starts after the reader turns it on (a click), so nothing plays unasked.
     All sounds are synthesized with Web Audio; there are no audio files. The choice is remembered on this device. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
  const fine = matchMedia('(pointer: fine)').matches;
  const motion = fine && !reduce();

  /* ---------- No ghost-dragging of Bots or artwork (it made clicks feel sticky) ---------- */
  document.addEventListener('dragstart', e => { if (e.target.closest?.('img, .hm-bot, .hm-crew, .hm-perch, .hm-brand')) e.preventDefault(); });
  $$('img').forEach(img => img.setAttribute('draggable', 'false'));

  /* ---------- Scroll progress in the nav ---------- */
  const nav = $('#hmNav');
  if (nav) {
    const bar = document.createElement('span'); bar.className = 'hm-progress'; bar.setAttribute('aria-hidden', 'true'); nav.appendChild(bar);
    const upd = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.setProperty('--p', h > 0 ? (scrollY / h).toFixed(4) : 0); };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  }

  /* ---------- Shine on every block: a pointer spotlight plus a glowing edge ---------- */
  const SHINE = ['.hm-links', '.hm-flow-tabs [role=tab]', '.hm-flow-stage', '.hm-mini', '.hm-tile', '.hm-band', '.hm-accordion summary', '.hm-brief',
    '.hm-btn--plain', '.hm-tool-row li', '.hm-badge', '.hm-sheet', '.hm-queue', '.hm-vault', '.hm-rooms li', '.hm-fog li', '.hm-result'];
  if (motion) {
    $$(SHINE.join(',')).forEach(el => {
      if (el.querySelector(':scope > .hm-shine')) return;
      const s = document.createElement('span'); s.className = 'hm-shine'; s.setAttribute('aria-hidden', 'true');
      el.classList.add('hm-has-shine'); el.prepend(s);
    });
    let last = null;
    document.addEventListener('pointermove', e => {
      const host = e.target.closest?.('.hm-has-shine');
      if (last && last !== host) last.classList.remove('is-shine');
      if (!host) { last = null; return; }
      const r = host.getBoundingClientRect();
      host.style.setProperty('--gx', (e.clientX - r.left) + 'px'); host.style.setProperty('--gy', (e.clientY - r.top) + 'px');
      host.classList.add('is-shine'); last = host;
      // Nested hosts (a card inside a tile) light their parent too.
      const parent = host.parentElement?.closest('.hm-has-shine');
      if (parent) { const pr = parent.getBoundingClientRect(); parent.style.setProperty('--gx', (e.clientX - pr.left) + 'px'); parent.style.setProperty('--gy', (e.clientY - pr.top) + 'px'); }
    }, { passive: true });
  }

  /* ---------- Page-wide ambient light (eased) ---------- */
  if (motion) {
    const amb = document.createElement('div'); amb.className = 'hm-ambient'; amb.setAttribute('aria-hidden', 'true'); document.body.prepend(amb);
    let tx = innerWidth / 2, ty = innerHeight * .3, x = tx, y = ty, running = false;
    const step = () => {
      x += (tx - x) * .08; y += (ty - y) * .08;
      amb.style.setProperty('--ax', x.toFixed(1) + 'px'); amb.style.setProperty('--ay', y.toFixed(1) + 'px');
      if (Math.abs(tx - x) + Math.abs(ty - y) > .5) requestAnimationFrame(step); else running = false;
    };
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; amb.classList.add('is-on'); if (!running) { running = true; requestAnimationFrame(step); } }, { passive: true });
    document.addEventListener('pointerleave', () => amb.classList.remove('is-on'));
  }

  /* ---------- Branded cursor ---------- */
  if (motion) {
    const dot = document.createElement('div'), ring = document.createElement('div');
    dot.className = 'hm-cursor-dot'; ring.className = 'hm-cursor-ring';
    dot.setAttribute('aria-hidden', 'true'); ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<span class="hm-cursor-wave">👋</span>';
    document.body.append(ring, dot);
    document.documentElement.classList.add('hm-cursor-on');
    let mx = -100, my = -100, rx = -100, ry = -100, raf = 0;
    const loop = () => {
      rx += (mx - rx) * .2; ry += (my - ry) * .2;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      raf = Math.abs(mx - rx) + Math.abs(my - ry) > .3 ? requestAnimationFrame(loop) : 0;
    };
    const INTERACTIVE = 'a,button,summary,[role=tab],label,select';
    document.addEventListener('pointermove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px,${my}px)`;
      document.documentElement.classList.add('hm-cursor-visible');
      const t = e.target;
      const bot = t.closest?.('.hm-crew-btn, .hm-roster li');
      ring.classList.toggle('is-bot', !!bot);
      ring.classList.toggle('is-link', !bot && !!t.closest?.(INTERACTIVE));
      ring.classList.toggle('is-window', !bot && !t.closest?.(INTERACTIVE) && !!t.closest?.('#hmWindow'));
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('pointerdown', e => {
      ring.classList.add('is-down');
      const rip = document.createElement('span'); rip.className = 'hm-ripple'; rip.style.left = e.clientX + 'px'; rip.style.top = e.clientY + 'px';
      document.body.appendChild(rip);
      const a = rip.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: .7 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      a.onfinish = () => rip.parentNode && rip.parentNode.removeChild(rip);
    });
    document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
    document.documentElement.addEventListener('pointerleave', () => document.documentElement.classList.remove('hm-cursor-visible'));
    // Keyboard users get the native focus ring and no custom cursor in the way.
    addEventListener('keydown', e => { if (e.key === 'Tab') document.documentElement.classList.remove('hm-cursor-visible'); });
  }

  /* ---------- Sound ---------- */
  const KEY = 'botdom.home.sound';
  const toggle = $('#hmSound');
  let ctx = null, master = null, on = false;
  try { on = localStorage.getItem(KEY) === 'on'; } catch {}
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = .16;
    // A short, soft echo makes the blips feel less clinical.
    const delay = ctx.createDelay(), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = .12; fb.gain.value = .22; wet.gain.value = .25;
    master.connect(ctx.destination); master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
    return ctx;
  }
  function tone(freq, { at = 0, dur = .12, type = 'sine', gain = .5, to = 0, attack = .006 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function noise({ at = 0, dur = .05, gain = .2, freq = 1800 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at, len = Math.max(1, Math.floor(ctx.sampleRate * dur)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = gain;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  const VOICE = { you: 440, lead: 523.25, research: 659.25, writer: 587.33, review: 698.46 };
  const HELLO = [659.25, 587.33, 523.25, 698.46, 783.99];
  const SOUNDS = {
    tick: () => tone(1320, { dur: .05, type: 'triangle', gain: .22 }),
    // Hover: a short, airy "tink", a little higher on Bots; quieter than a click.
    hover: ({ bot }) => tone(bot ? 1567.98 : 1975.53, { dur: .045, gain: .07, attack: .003, to: bot ? 1760 : 2093 }),
    key: () => noise({ dur: .02, gain: .08, freq: 2600 + Math.random() * 900 }),
    message: ({ who }) => { const f = VOICE[who] || 587.33; tone(f, { dur: .14, gain: .4 }); tone(f * 1.5, { at: .08, dur: .18, gain: .3 }); },
    handoff: () => { tone(520, { dur: .38, type: 'triangle', gain: .25, to: 1040 }); tone(1560, { at: .3, dur: .25, gain: .12 }); },
    stamp: () => { tone(150, { dur: .22, gain: .7, to: 55 }); noise({ dur: .06, gain: .35, freq: 900 }); },
    done: () => [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, { at: i * .075, dur: .32, gain: .28 })),
    hello: ({ index = 0 }) => { const f = HELLO[index % HELLO.length]; tone(f, { dur: .1, gain: .35, to: f * 1.12 }); tone(f * 1.26, { at: .09, dur: .16, gain: .3, to: f * 1.4 }); },
    on: () => [523.25, 659.25, 783.99].forEach((f, i) => tone(f, { at: i * .06, dur: .28, gain: .3 }))
  };
  function play(name, detail) {
    if (!on || document.hidden) return;
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    SOUNDS[name]?.(detail || {});
  }
  addEventListener('hm:sfx', e => play(e.detail.name, e.detail));
  // A soft cue each time the pointer reaches a new control or Bot, whether or not it does anything.
  const HOVERABLE = 'a, button, summary, [role=tab], .hm-roster li, .hm-tool-row li, .hm-rooms li';
  let hovered = null, lastHover = 0;
  document.addEventListener('pointerover', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = e.target.closest?.(HOVERABLE);
    if (el === hovered) return;
    hovered = el;
    if (!el || el === toggle) return;
    const now = performance.now();
    if (now - lastHover < 70) return; // sweeping across a row stays a light patter, not a buzz
    lastHover = now;
    play('hover', { bot: !!el.closest('.hm-crew-btn, .hm-roster li') });
  });
  // Light clicks for controls (the preview, tabs, queue, FAQ). Links that leave the page stay quiet.
  document.addEventListener('click', e => {
    const el = e.target.closest?.('button, summary, [role=tab]');
    if (!el || el === toggle || el.closest('#hmCrew')) return;
    play('tick');
  });
  function setOn(v, announce) {
    on = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch {}
    if (toggle) toggle.setAttribute('aria-pressed', String(v));
    if (v && announce) play('on');
    if (!v && ctx && ctx.state === 'running') ctx.suspend();
  }
  if (toggle) {
    toggle.hidden = !(window.AudioContext || window.webkitAudioContext);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.addEventListener('click', () => setOn(!on, true));
  }
  // The app hides this page in its frame: stop sound right away.
  addEventListener('luna-product-paused', () => { if (ctx && ctx.state === 'running') ctx.suspend(); });
})();
