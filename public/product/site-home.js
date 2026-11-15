/* Botdom home page interactions. Everything here is a sample illustration: no models are called, nothing is sent.
   Without this script every message and panel is visible. Reduced motion shows the finished state and never autoplays.
   The page pauses when the app hides it (luna-product-paused from guide-integration.js) or the tab is hidden. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
  // Sound cues go to site-fx.js, which plays them only when the reader has turned sound on.
  const sfx = (name, detail = {}) => dispatchEvent(new CustomEvent('hm:sfx', { detail: { name, ...detail } }));

  /* ---------- Nav: shadow once scrolled, highlight the section in view ---------- */
  const nav = $('#hmNav');
  const onScroll = () => nav && nav.classList.toggle('is-stuck', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const links = new Map($$('.hm-links a').map(a => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window && links.size) {
    const seen = new Map();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = '', ratio = 0;
      seen.forEach((r, id) => { if (r > ratio) { ratio = r; best = id; } });
      links.forEach((a, id) => { const on = id === best; a.classList.toggle('is-here', on); on ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current'); });
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0, .25, .5, 1] });
    links.forEach((a, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  /* ---------- Live preview: a six-message sample session ---------- */
  const thread = $('#hmThread');
  if (thread) {
    const items = $$('[data-step]', thread);
    const typing = $('#hmTyping');
    const roster = new Map($$('#hmRoster li').map(li => [li.dataset.who, li]));
    const files = $$('#hmFiles li');
    const stepButtons = $$('.hm-steps button');
    const playBtn = $('#hmPlay'), replayBtn = $('#hmReplay'), unread = $('#hmUnread');
    const STATUS = [
      null,
      { lead: 'work' },
      { lead: 'done', research: 'work' },
      { lead: 'done', research: 'done', writer: 'work' },
      { lead: 'done', research: 'done', writer: 'done', review: 'work' },
      { lead: 'work', research: 'done', writer: 'done', review: 'done' },
      { lead: 'done', research: 'done', writer: 'done', review: 'done' }
    ];
    // Who speaks at each step, and who the message is for (for the hop, the perch and the handoff spark).
    const WHO = [null, 'you', 'lead', 'research', 'writer', 'review', 'lead'];
    const TO = [null, 'lead', 'research', 'writer', 'review', 'lead', 'you'];
    const perch = new Map($$('#hmPerch .hm-bot').map(b => [b.dataset.who, b]));
    const members = $('.hm-members'), composer = $('.hm-composer'), composerText = $('.hm-composer-text'), sendBtn = $('.hm-composer .hm-send');
    const placeholder = composerText ? composerText.textContent : '';
    items.forEach(el => { el.dataset.who = WHO[+el.dataset.step]; });
    let step = 0, timer = 0, playing = !reduce(), inView = false, hiddenByApp = false;

    const hop = el => { if (!el || reduce()) return; el.classList.remove('is-hop'); void el.offsetWidth; el.classList.add('is-hop'); };
    // A gold spark travels down the member list from sender to receiver.
    function spark(from, to) {
      const a = roster.get(from), b = roster.get(to);
      if (!a || !b || !members || reduce() || !members.offsetParent || !a.animate) return;
      const box = members.getBoundingClientRect(), ra = a.querySelector('.hm-bot').getBoundingClientRect(), rb = b.querySelector('.hm-bot').getBoundingClientRect();
      const dot = document.createElement('span'); dot.className = 'hm-packet'; members.appendChild(dot);
      const x1 = ra.left + ra.width / 2 - box.left, y1 = ra.top + ra.height / 2 - box.top, x2 = rb.left + rb.width / 2 - box.left, y2 = rb.top + rb.height / 2 - box.top;
      const bend = Math.max(36, Math.abs(y2 - y1) * .35);
      dot.animate([
        { transform: `translate(${x1}px,${y1}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${x1 - bend}px,${(y1 + y2) / 2}px) scale(1)`, opacity: 1, offset: .5 },
        { transform: `translate(${x2}px,${y2}px) scale(.6)`, opacity: 0 }
      ], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)' });
      sfx('handoff');
      dot.getAnimations()[0].onfinish = () => { dot.parentNode && dot.parentNode.removeChild(dot); hop(b.querySelector('.hm-bot')); };
    }
    // Step 1 starts with the brief being typed into the composer, then sent.
    function typeBrief(done) {
      const text = items.find(el => el.dataset.step === '1')?.querySelector('.hm-msg-body > p:last-child')?.textContent.trim() || '';
      if (!composer || !text || reduce()) { done(); return; }
      composer.classList.add('is-typing'); composerText.textContent = '';
      let i = 0;
      const tick = () => {
        if (!playing || !inView) { composer.classList.remove('is-typing'); composerText.textContent = placeholder; return; }
        i += Math.max(1, Math.round(text.length / 40));
        composerText.textContent = text.slice(0, i);
        if (i % 3 === 0) sfx('key');
        if (i < text.length) timer = setTimeout(tick, 32);
        else timer = setTimeout(() => {
          if (sendBtn) { sendBtn.classList.remove('is-pulse'); void sendBtn.offsetWidth; sendBtn.classList.add('is-pulse'); }
          composer.classList.remove('is-typing'); composerText.textContent = placeholder; done();
        }, 380);
      };
      tick();
    }

    function render(next, animate) {
      const prev = step; step = next;
      items.forEach(el => {
        const n = +el.dataset.step, show = n <= step;
        el.classList.toggle('is-hidden', !show);
        el.classList.toggle('is-new', animate && show && n > prev);
      });
      const st = STATUS[step] || {};
      roster.forEach((li, who) => { li.dataset.status = st[who] || 'idle'; li.classList.toggle('is-active', st[who] === 'work'); });
      files.forEach(li => li.classList.toggle('is-pending', step < +li.dataset.from));
      stepButtons.forEach((b, i) => { b.classList.toggle('is-now', i + 1 === step); b.classList.toggle('is-seen', i + 1 < step); b.setAttribute('aria-current', i + 1 === step ? 'step' : 'false'); });
      if (unread) unread.classList.toggle('is-read', step >= 6);
      typing.classList.remove('is-on');
      perch.forEach((b, who) => b.classList.toggle('is-up', st[who] === 'work' || (who === 'you' && (step === 6 || (animate && step === 1)))));
      if (animate && step > prev) {
        hop(perch.get(WHO[step])); hop(roster.get(WHO[step])?.querySelector('.hm-bot'));
        if (step - prev === 1) spark(WHO[step], TO[step]);
        sfx(step === 5 ? 'stamp' : step === 6 ? 'done' : 'message', { who: WHO[step] });
      }
      follow(animate);
    }
    // Keep the newest message in view; the reader can still scroll back up inside the window.
    function follow(smooth) { thread.scrollTo({ top: thread.scrollHeight, behavior: smooth && !reduce() ? 'smooth' : 'auto' }); }
    function stop() { clearTimeout(timer); timer = 0; typing.classList.remove('is-on'); if (composer && composer.classList.contains('is-typing')) { composer.classList.remove('is-typing'); composerText.textContent = placeholder; } }
    // Hovering a member highlights their messages.
    const focus = who => {
      thread.classList.toggle('is-focus', !!who);
      items.forEach(el => el.classList.toggle('is-match', el.dataset.who === who));
    };
    roster.forEach((li, who) => { li.addEventListener('pointerenter', () => focus(who)); li.addEventListener('pointerleave', () => focus('')); });
    function schedule() {
      stop();
      if (!playing || !inView || hiddenByApp || document.hidden) return;
      const wait = step >= 6 ? 4200 : step === 0 ? 500 : 2300;
      timer = setTimeout(() => {
        if (step >= 6) { render(0, false); schedule(); return; }
        if (step === 0) { typeBrief(() => { render(1, true); schedule(); }); return; }
        typing.classList.add('is-on'); follow(true);
        timer = setTimeout(() => { render(step + 1, true); schedule(); }, 900);
      }, wait);
    }
    function setPlaying(on) { playing = on; playBtn.setAttribute('aria-pressed', String(on)); schedule(); }

    playBtn.addEventListener('click', () => setPlaying(!playing));
    replayBtn.addEventListener('click', () => { render(0, false); setPlaying(!reduce()); if (reduce()) render(6, false); });
    stepButtons.forEach(b => b.addEventListener('click', () => { setPlaying(false); render(+b.dataset.go, true); }));
    addEventListener('luna-product-paused', () => { hiddenByApp = true; stop(); });
    addEventListener('focus', () => { hiddenByApp = false; schedule(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) hiddenByApp = false; schedule(); });

    if (reduce()) { playing = false; playBtn.setAttribute('aria-pressed', 'false'); render(6, false); }
    else render(0, false);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) hiddenByApp = false; schedule(); }, { threshold: .3 }).observe($('#hmWindow'));
    } else { inView = true; schedule(); }
  }

  /* ---------- Tabs helper (arrow keys, Home/End) ---------- */
  function tabs(list, onSelect) {
    const tabsEls = $$('[role=tab]', list);
    function select(tab, focus) {
      tabsEls.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      onSelect?.(tabsEls.indexOf(tab));
    }
    tabsEls.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', e => {
        const k = e.key, last = tabsEls.length - 1;
        const map = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: last };
        if (!(k in map)) return;
        e.preventDefault(); select(tabsEls[(map[k] + tabsEls.length) % tabsEls.length], true);
      });
    });
    return { select: i => select(tabsEls[i], false), count: tabsEls.length };
  }

  /* ---------- Flow: four steps that advance on their own until the reader takes over ---------- */
  const flowList = $('#hmFlow .hm-flow-tabs'), bar = $('#hmFlowBar');
  if (flowList) {
    let index = 0, auto = !reduce(), flowTimer = 0, flowInView = false;
    const DURATION = 5200;
    const ctl = tabs(flowList, i => { index = i; });
    const run = () => {
      clearTimeout(flowTimer);
      if (bar) { bar.style.transition = 'none'; bar.style.width = '0'; }
      if (!auto || !flowInView || document.hidden) return;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (bar) { bar.style.transition = `width ${DURATION}ms linear`; bar.style.width = '100%'; } }));
      flowTimer = setTimeout(() => { ctl.select((index + 1) % ctl.count); run(); }, DURATION);
    };
    const takeOver = () => { auto = false; run(); };
    flowList.addEventListener('pointerdown', takeOver); flowList.addEventListener('keydown', takeOver);
    document.addEventListener('visibilitychange', run);
    addEventListener('luna-product-paused', () => { flowInView = false; run(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { flowInView = e.isIntersecting; run(); }, { threshold: .4 }).observe($('#hmFlow'));
  }

  /* ---------- Review labels ---------- */
  const seg = $('.hm-seg'); if (seg) tabs(seg);

  /* ---------- Registered versions ---------- */
  const edit = $('#hmEdit'), working = $('#hmWorking'), state = $('#hmWorkingState'), editLabel = $('#hmEditLabel');
  edit?.addEventListener('click', () => {
    const on = edit.getAttribute('aria-pressed') !== 'true';
    edit.setAttribute('aria-pressed', String(on));
    working.classList.toggle('is-edited', on);
    state.textContent = on ? state.dataset.msgEdited : state.dataset.msgOriginal;
    editLabel.textContent = on ? edit.dataset.msgOn : edit.dataset.msgOff;
  });

  /* ---------- Queue: pause, stop, cancel ---------- */
  const queue = $('#hmQueue'), list = $('#hmQueueList');
  if (queue && list) {
    const original = list.innerHTML;
    const bindCancel = () => $$('.hm-x', list).forEach(x => x.addEventListener('click', () => {
      const li = x.closest('li'); li.classList.add('is-gone');
      setTimeout(() => li.remove(), reduce() ? 0 : 280);
    }));
    bindCancel();
    $('#hmPause').addEventListener('click', e => {
      if (queue.dataset.state === 'stop') return;
      const paused = queue.dataset.state !== 'pause';
      queue.dataset.state = paused ? 'pause' : 'run'; e.currentTarget.setAttribute('aria-pressed', String(paused));
    });
    $('#hmStop').addEventListener('click', () => {
      if (queue.dataset.state === 'stop') { queue.dataset.state = 'run'; list.innerHTML = original; bindCancel(); $('#hmPause').setAttribute('aria-pressed', 'false'); }
      else queue.dataset.state = 'stop';
    });
  }

  /* ---------- Light & gaze: pointer-driven, fine pointers only, off under reduced motion ---------- */
  const finePointer = matchMedia('(pointer: fine)').matches;
  if (finePointer && !reduce()) {
    const hero = $('.hm-hero'), preview = $('#preview'), win = $('#hmWindow');
    const bots = $$('.hm-bot');
    let px = innerWidth / 2, py = innerHeight / 3, queued = false;
    const frame = () => {
      queued = false;
      // Eyes look toward the pointer (clamped to a small offset so faces stay calm).
      for (const b of bots) {
        const r = b.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
        const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, m = r.width * .07 * Math.min(1, d / 260);
        b.style.setProperty('--lx', (dx / d * m).toFixed(1) + 'px'); b.style.setProperty('--ly', (dy / d * m * .7).toFixed(1) + 'px');
      }
    };
    addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!queued) { queued = true; requestAnimationFrame(frame); } }, { passive: true });
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(frame); } }, { passive: true });

    // Hero spotlight
    hero?.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); hero.style.setProperty('--mx', (e.clientX - r.left) + 'px'); hero.style.setProperty('--my', (e.clientY - r.top + 120) + 'px'); hero.classList.add('is-lit'); });
    hero?.addEventListener('pointerleave', () => hero.classList.remove('is-lit'));

    // Preview window: a small tilt toward the pointer and a sheen where the light falls
    if (preview && win) {
      win.addEventListener('pointermove', e => {
        const r = win.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        preview.classList.add('is-tilting');
        win.style.setProperty('--ry', ((x - .5) * 4).toFixed(2) + 'deg'); win.style.setProperty('--rx', ((.5 - y) * 3).toFixed(2) + 'deg');
        win.style.setProperty('--sx', (x * 100).toFixed(1) + '%'); win.style.setProperty('--sy', (y * 100).toFixed(1) + '%');
      });
      win.addEventListener('pointerleave', () => { preview.classList.remove('is-tilting'); win.style.setProperty('--rx', '0deg'); win.style.setProperty('--ry', '0deg'); });
    }

    // Tiles: the spotlight follows the pointer
    $$('.hm-tile').forEach(t => t.addEventListener('pointermove', e => { const r = t.getBoundingClientRect(); t.style.setProperty('--tx', (e.clientX - r.left) + 'px'); t.style.setProperty('--ty', (e.clientY - r.top) + 'px'); }));

    // Primary buttons lean a little toward the pointer
    $$('.hm-hero .hm-btn--royal, .hm-band .hm-btn--gold').forEach(btn => {
      btn.classList.add('is-magnet');
      btn.addEventListener('pointermove', e => { const r = btn.getBoundingClientRect(); btn.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 8}px,${((e.clientY - r.top) / r.height - .5) * 6 - 2}px)`; });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* ---------- Sections fade up as they enter ---------- */
  if ('IntersectionObserver' in window && !reduce()) {
    const groups = [['.hm-head', 0], ['.hm-flow-tabs [role=tab]', 70], ['.hm-flow-stage', 0], ['.hm-tile', 90], ['.hm-band', 0], ['.hm-faq-head', 0], ['.hm-accordion details', 60], ['.hm-finale > *', 70]];
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    groups.forEach(([sel, gap]) => $$(sel).forEach((el, i) => {
      const r = el.getBoundingClientRect(); if (r.top < innerHeight) return; // already on screen: leave it alone
      el.classList.add('hm-reveal'); el.style.setProperty('--d', Math.min(i % 6, 5) * gap + 'ms'); io.observe(el);
    }));
  }

  /* ---------- Crew: click a Bot to say hello; idle Bots hop now and then ---------- */
  const crew = $('#hmCrew');
  if (crew) {
    const members = $$('li', crew);
    const talk = li => {
      members.forEach(m => m !== li && m.classList.remove('is-talking'));
      li.classList.add('is-talking');
      const bot = li.querySelector('.hm-bot');
      sfx('hello', { index: members.indexOf(li) });
      if (bot && !reduce()) { bot.classList.remove('is-hop'); void bot.offsetWidth; bot.classList.add('is-hop'); }
      clearTimeout(li._t); li._t = setTimeout(() => li.classList.remove('is-talking'), 2600);
    };
    members.forEach(li => li.querySelector('.hm-crew-btn')?.addEventListener('click', () => talk(li)));
    if (!reduce() && 'IntersectionObserver' in window) {
      let idle = 0;
      const tickIdle = () => { const li = members[Math.floor(Math.random() * members.length)]; const bot = li.querySelector('.hm-bot'); bot.classList.remove('is-hop'); void bot.offsetWidth; bot.classList.add('is-hop'); };
      new IntersectionObserver(([e]) => { clearInterval(idle); if (e.isIntersecting) idle = setInterval(tickIdle, 2400); }, { threshold: .4 }).observe(crew);
    }
  }

  /* ---------- Copy the first brief ---------- */
  const toastEl = $('#notice'); let toastTimer = 0;
  const toast = msg => { if (!toastEl) return; toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400); };
  const copyButton = $('#copyBrief'), brief = $('#briefText');
  copyButton?.addEventListener('click', async () => {
    const text = brief?.textContent.trim() || '';
    try { await navigator.clipboard.writeText(text); toast(copyButton.dataset.msgCopied); }
    catch {
      const range = document.createRange(); range.selectNodeContents(brief);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      toast(copyButton.dataset.msgBlocked);
    }
  });
})();
