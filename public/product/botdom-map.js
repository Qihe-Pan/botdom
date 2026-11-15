'use strict';
// Botdom map page. Every visible string comes from the HTML (text or data-msg-* attributes),
// so the Chinese copy table translates it before this script runs. No network, storage or new windows.
(() => {
  const root = document.documentElement;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motionQuery?.matches || root.classList.contains('reduce-motion'));
  const fill = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));

  /* ---------- Pausing: the in-app guide hides this page, or the tab is hidden ---------- */
  const pausers = new Set();
  const pause = () => { root.classList.add('is-paused'); pausers.forEach(fn => fn()); };
  const resume = () => root.classList.remove('is-paused');
  window.addEventListener('luna-product-paused', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  ['pointerdown', 'keydown', 'focusin', 'wheel', 'touchstart'].forEach(type =>
    window.addEventListener(type, () => { if (root.classList.contains('is-paused')) resume(); }, {passive: true, capture: true}));

  /* ---------- Toast ---------- */
  const notice = $('#notice');
  let noticeTimer = 0;
  /* Pop-ups animate in via CSS (the [hidden] attribute going away) and out via .is-leaving */
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const showPop = el => { el.classList.remove('is-leaving'); el.hidden = false; };
  const hidePop = (el, done) => {
    if (el.hidden) return;
    if (calm.matches) { el.hidden = true; done?.(); return; }
    el.classList.add('is-leaving');
    let over = false;
    const end = () => { if (over || !el.classList.contains('is-leaving')) return; over = true; el.classList.remove('is-leaving'); el.hidden = true; done?.(); };
    el.addEventListener('animationend', end, {once: true}); setTimeout(end, 320);
  };
  const toast = text => {
    if (!notice) return;
    notice.textContent = text; showPop(notice);
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => hidePop(notice, () => { notice.textContent = ''; }), 4000);
  };

  /* ---------- The map legend (places menu) ---------- */
  const mapButton = $('#bdMapBtn'), legend = $('#bdLegend'), bar = $('.bd-bar');
  const setLegend = open => {
    if (!mapButton || !legend) return;
    if (open) showPop(legend); else hidePop(legend);
    mapButton.setAttribute('aria-expanded', String(open));
    if (open) legend.querySelector('a[aria-current="true"], a')?.focus({preventScroll: true});
  };
  mapButton?.addEventListener('click', () => setLegend(legend.hidden || legend.classList.contains('is-leaving')));
  legend?.addEventListener('click', event => { if (event.target.closest('a')) setLegend(false); });
  bar?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && legend && !legend.hidden) { event.stopPropagation(); setLegend(false); mapButton.focus(); }
  });
  document.addEventListener('click', event => {
    if (legend && !legend.hidden && !event.target.closest('#bdLegend, #bdMapBtn')) setLegend(false);
  });

  /* ---------- The road, the traveller and "you are at" ---------- */
  const map = $('#bdMap'), road = $('#bdRoad'), traveller = $('#bdTraveller'), here = $('#bdHere');
  const stops = $$('[data-landmark]');
  const sections = $$('main > section[data-msg-place]');
  const legendLinks = legend ? $$('a[href^="#"]', legend) : [];
  let points = [], pathLength = 0, walkedPath = null, measurePath = null, walkTimer = 0, lastY = -1;
  const centreOf = element => {
    const box = element.getBoundingClientRect(), frame = map.getBoundingClientRect();
    return {x: box.left - frame.left + box.width / 2, y: box.top - frame.top + box.height * 0.62};
  };
  const buildRoad = () => {
    if (!map || !road || stops.length < 2) return;
    const width = map.clientWidth, height = map.scrollHeight;
    road.setAttribute('viewBox', `0 0 ${width} ${height}`);
    points = stops.map(stop => centreOf(stop.querySelector('.bd-lm') || stop));
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], bend = (b.y - a.y) * 0.5;
      d += ` C ${a.x.toFixed(1)} ${(a.y + bend).toFixed(1)} ${b.x.toFixed(1)} ${(b.y - bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    $$('path', road).forEach(path => path.setAttribute('d', d));
    walkedPath = $('.bd-road-walked', road); measurePath = walkedPath;
    pathLength = measurePath.getTotalLength();
    walkedPath.style.strokeDasharray = `${pathLength} ${pathLength}`;
    lastY = -1; place();
  };
  const lengthAtY = y => {
    // The road always moves downwards, so a binary search on length finds the point at a given height.
    let low = 0, high = pathLength;
    for (let i = 0; i < 22; i++) {
      const mid = (low + high) / 2;
      if (measurePath.getPointAtLength(mid).y < y) low = mid; else high = mid;
    }
    return (low + high) / 2;
  };
  const setHere = section => {
    if (!section) return;
    const name = section.dataset.msgPlace;
    if (here && name && here.textContent !== name) here.textContent = name;
    legendLinks.forEach(link => {
      if (link.getAttribute('href') === '#' + section.id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };
  const place = () => {
    if (!measurePath || !pathLength) return;
    const frame = map.getBoundingClientRect();
    const target = Math.min(points.at(-1).y, Math.max(points[0].y, innerHeight * 0.58 - frame.top));
    if (Math.abs(target - lastY) < 0.5) return;
    const moving = lastY >= 0; lastY = target;
    const length = lengthAtY(target), point = measurePath.getPointAtLength(length);
    traveller.style.transform = `translate(${(point.x - 29).toFixed(1)}px, ${(point.y - 52).toFixed(1)}px)`;
    walkedPath.style.strokeDashoffset = String(pathLength - length);
    stops.forEach((stop, index) => stop.classList.toggle('is-visited', points[index] && points[index].y <= target + 4));
    const current = sections.filter(section => section.getBoundingClientRect().top < innerHeight * 0.5).at(-1) || sections[0];
    setHere(current);
    if (moving) {
      traveller.classList.add('is-walking');
      clearTimeout(walkTimer); walkTimer = setTimeout(() => traveller.classList.remove('is-walking'), 180);
    }
  };
  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; place(); }); } };
  if (map && road && traveller) {
    addEventListener('scroll', queue, {passive: true});
    let resizeTimer = 0;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(buildRoad, 120); }, {passive: true});
    if ('ResizeObserver' in window) new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(buildRoad, 120); }).observe(map);
    const start = () => buildRoad();
    if (document.readyState === 'complete') start(); else addEventListener('load', start, {once: true});
    document.fonts?.ready?.then(buildRoad);
    $$('details').forEach(detail => detail.addEventListener('toggle', () => setTimeout(buildRoad, 30)));
  }

  /* ---------- The throne room: a sample court session ---------- */
  const throne = $('#throne');
  if (throne) {
    const hall = $('.bd-hall', throne), arcs = $('.bd-hall-arcs', throne), arc = $('.bd-arc', throne), spark = $('.bd-spark', throne);
    const items = $$('.bd-steps li', throne), total = items.length;
    const seats = new Map($$('[data-seat]', throne).map(seat => [seat.dataset.seat, seat]));
    const card = $('.bd-decree-card', throne), routeEl = $('#decreeRoute'), messageEl = $('#decreeMsg');
    const fileProp = $('#propFile'), sealProp = $('#propSeal');
    const counter = $('#throneCounter'), live = $('#throneLive');
    const playButton = $('[data-act="play"]', throne), playLabel = $('.bd-play-label', throne);
    let step = 1, timer = 0, frame = 0, playing = false, started = false;

    const seatPoint = name => {
      const seat = seats.get(name), avatar = seat?.querySelector('.bd-bot, .bd-you');
      if (!avatar) return null;
      const a = avatar.getBoundingClientRect(), h = hall.getBoundingClientRect();
      return {x: a.left - h.left + a.width / 2, y: a.top - h.top + a.height / 2};
    };
    const fly = (from, to) => {
      cancelAnimationFrame(frame);
      const h = hall.getBoundingClientRect();
      arcs.setAttribute('viewBox', `0 0 ${h.width.toFixed(0)} ${h.height.toFixed(0)}`);
      const a = seatPoint(from), b = seatPoint(to);
      if (!a || !b) return;
      const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, centre = {x: h.width / 2, y: h.height / 2};
      const control = {x: mid.x + (centre.x - mid.x) * 0.9, y: mid.y + (centre.y - mid.y) * 0.9 - h.height * 0.08};
      arc.setAttribute('d', `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`);
      arc.classList.add('is-on');
      if (reduced()) { spark.setAttribute('cx', -50); return; }
      const length = arc.getTotalLength(); let begin = null;
      const tick = time => {
        if (begin === null) begin = time;
        const t = Math.min(1, (time - begin) / 900), eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const p = arc.getPointAtLength(length * eased);
        spark.setAttribute('cx', p.x.toFixed(1)); spark.setAttribute('cy', p.y.toFixed(1));
        if (t < 1) frame = requestAnimationFrame(tick); else { spark.setAttribute('cx', -50); }
      };
      frame = requestAnimationFrame(tick);
    };
    const render = (animate = true) => {
      const item = items[step - 1], route = $('.bd-step-route', item).textContent.trim(), message = $('.bd-step-msg', item).textContent.trim();
      throne.dataset.step = String(step);
      items.forEach((li, index) => {
        li.classList.toggle('is-current', index === step - 1);
        li.classList.toggle('is-past', index < step - 1);
        const button = $('button', li);
        if (index === step - 1) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
      });
      seats.forEach((seat, name) => {
        seat.classList.toggle('is-speaking', name === item.dataset.from);
        seat.classList.toggle('is-listening', name === item.dataset.to);
      });
      routeEl.textContent = route; messageEl.textContent = message;
      card.classList.remove('is-new'); if (animate && !reduced()) { void card.offsetWidth; card.classList.add('is-new'); }
      fileProp.textContent = item.dataset.file || ''; fileProp.classList.toggle('is-on', Boolean(item.dataset.file));
      sealProp.classList.toggle('is-on', item.dataset.seal === 'true');
      if (counter) counter.textContent = fill(throne.dataset.msgCounter, {n: step, total});
      if (live && animate) live.textContent = fill(throne.dataset.msgAnnounce, {n: step, total, route, message});
      if (animate) fly(item.dataset.from, item.dataset.to); else arc.classList.remove('is-on');
    };
    const setPlaying = on => {
      playing = on; clearInterval(timer);
      playButton.setAttribute('aria-pressed', String(on));
      if (playLabel) playLabel.textContent = on ? throne.dataset.msgPause : throne.dataset.msgPlay;
      if (on) timer = setInterval(() => { if (step >= total) { setPlaying(false); return; } step += 1; render(); }, 3400);
    };
    const go = target => { step = Math.min(total, Math.max(1, target)); render(); };
    throne.addEventListener('click', event => {
      const control = event.target.closest('[data-act]'), stepButton = event.target.closest('.bd-steps button');
      if (control || stepButton) started = true; // once the reader takes over, autoplay never starts by itself
      if (stepButton) { setPlaying(false); go(items.indexOf(stepButton.closest('li')) + 1); return; }
      if (!control) return;
      const act = control.dataset.act;
      if (act === 'play') { if (!playing && step >= total) { step = 1; render(); } setPlaying(!playing); }
      if (act === 'next') { setPlaying(false); go(step + 1); }
      if (act === 'back') { setPlaying(false); go(step - 1); }
    });
    pausers.add(() => setPlaying(false));
    render(false);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting && !started && !reduced() && !root.classList.contains('is-paused')) { started = true; render(); setPlaying(true); }
        if (!entry.isIntersecting && playing) setPlaying(false);
      }), {threshold: 0.45}).observe(throne);
    }
    addEventListener('resize', () => arc.classList.remove('is-on'), {passive: true});
  }

  /* ---------- Archive: the working file changes, version 1 doesn't ---------- */
  const toggle = $('#versionToggle');
  if (toggle) {
    const versions = $('#bdVersions'), state = $('#workingState'), live = $('#versionLive');
    toggle.addEventListener('click', () => {
      const edited = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(edited));
      if (versions) versions.dataset.edited = String(edited);
      if (state) state.textContent = edited ? toggle.dataset.msgEdited : toggle.dataset.msgOriginal;
      if (live) live.textContent = edited ? toggle.dataset.msgOn : toggle.dataset.msgOff;
    });
  }

  /* ---------- Copy the first brief ---------- */
  const copyButton = $('#copyBrief'), brief = $('#briefText');
  copyButton?.addEventListener('click', async () => {
    const text = brief?.textContent.trim() || '';
    try { await navigator.clipboard.writeText(text); toast(copyButton.dataset.msgCopied); }
    catch {
      const range = document.createRange(); range.selectNodeContents(brief);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      toast(copyButton.dataset.msgBlocked);
    }
  });
})();
