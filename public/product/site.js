'use strict';
// Botdom product page behaviour. All visible strings come from the HTML
// (data-i18n text or data-msg-* attributes), so a translated copy table can
// replace them without touching this file. No network, storage or new windows.
(() => {
  const root = document.documentElement;
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motionQuery?.matches || window.LunaReadingMotion?.reduced?.() || root.classList.contains('reduce-motion'));
  const fill = (template, values) => String(template || '').replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));

  /* (a) Sample meeting replay */
  const replay = document.getElementById('replay');
  const replayApi = (() => {
    if (!replay) return null;
    const stage = replay.querySelector('.mu-stage');
    const lines = Array.from(replay.querySelectorAll('.mu-transcript li'));
    const controls = replay.querySelector('.mu-controls');
    if (!stage || !lines.length) return null;
    const total = lines.length;
    const seats = new Map(Array.from(replay.querySelectorAll('[data-seat]')).map(seat => [seat.dataset.seat, seat]));
    const playButton = replay.querySelector('[data-act="play"]');
    const counter = replay.querySelector('.mu-counter');
    const live = replay.querySelector('[data-replay-live]');
    const minute = replay.querySelector('.mu-minute');
    const minuteRoute = minute?.querySelector('.mu-minute-route');
    const minuteMessage = minute?.querySelector('.mu-minute-msg');
    const chip = replay.querySelector('.mu-chip');
    const pass = replay.querySelector('.mu-pass');
    const receipt = replay.querySelector('.mu-receipt');
    const wire = replay.querySelector('.mu-wire-line');
    let step = 1;
    let playing = false;
    let inView = false;
    let timer = 0;

    const anchor = name => {
      const seat = seats.get(name), face = seat?.querySelector('.mu-face, .mu-you');
      if (!face) return null;
      // Use unanimated layout coordinates so floating faces don't tug the path.
      const box = seat.getBoundingClientRect(), frame = stage.getBoundingClientRect();
      return {x:box.left-frame.left+face.offsetLeft+face.offsetWidth/2,
        y:box.top-frame.top+face.offsetTop+face.offsetHeight/2};
    };
    const obstacle = (element, padding) => {
      const box=element.getBoundingClientRect(),frame=stage.getBoundingClientRect();
      return {left:box.left-frame.left-padding,right:box.right-frame.left+padding,
        top:box.top-frame.top-padding,bottom:box.bottom-frame.top+padding};
    };
    const moveWire = window.createReplayWire({wire,packet:stage.querySelector('.mu-wire-packet'),
      reduced,request:requestAnimationFrame,cancel:cancelAnimationFrame});
    const layout = animate => {
      const line=lines[step-1],from=anchor(line.dataset.from),to=anchor(line.dataset.to);
      const obstacles=[obstacle(minute,10)];
      seats.forEach((seat,name)=>{
        const tag=seat.querySelector('.mu-seat-tag');
        if(tag)obstacles.push(obstacle(tag,9));
        if(name!==line.dataset.from&&name!==line.dataset.to){
          const face=seat.querySelector('.mu-face, .mu-you');
          if(face)obstacles.push(obstacle(face,8));
        }
      });
      moveWire(from,to,{obstacles,width:stage.clientWidth,height:stage.clientHeight,
        onComplete:()=>{if(receipt&&step===total)receipt.hidden=false}},animate);
      if(chip){chip.hidden=!line.dataset.chip||step===total;if(line.dataset.chip)chip.textContent=line.dataset.chip}
    };
    const render = (next, announce) => {
      step = Math.min(total, Math.max(1, next));
      const line = lines[step - 1];
      replay.dataset.step = String(step);
      lines.forEach((item, index) => {
        item.classList.toggle('is-current', index === step - 1);
        item.classList.toggle('is-past', index < step - 1);
        if (index === step - 1) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
      seats.forEach((seat, name) => {
        seat.classList.remove('is-speaking');
        seat.classList.toggle('is-listening', name === line.dataset.to);
      });
      const speaker = seats.get(line.dataset.from);
      if (speaker) {
        void speaker.offsetWidth;
        speaker.classList.add('is-speaking');
      }
      const route = line.querySelector('.mu-route')?.textContent.trim() || '';
      const message = line.querySelector('.mu-msg')?.textContent.trim() || '';
      if (minuteRoute) minuteRoute.textContent = route;
      if (minuteMessage) minuteMessage.textContent = message;
      if (minute) {
        minute.classList.remove('is-new');
        void minute.offsetWidth;
        minute.classList.add('is-new');
      }
      if (pass) pass.hidden = step < 5;
      if (receipt) receipt.hidden = true;
      layout(true);
      if (counter) counter.textContent = fill(replay.dataset.msgCounter, {n: step, total});
      if (announce && live) live.textContent = fill(replay.dataset.msgAnnounce, {n: step, total, route, message});
    };
    const clear = () => { window.clearTimeout(timer); timer = 0; };
    const schedule = () => {
      clear();
      if (!playing || !inView || document.hidden || reduced()) return;
      timer = window.setTimeout(() => {
        render(step >= total ? 1 : step + 1, false);
        schedule();
      }, step >= total ? 4000 : 2600);
    };
    const setPlaying = value => {
      playing = Boolean(value);
      playButton?.setAttribute('aria-pressed', String(playing));
      schedule();
    };
    if (controls) controls.hidden = false;
    replay.addEventListener('click', event => {
      const button = event.target.closest('[data-act]');
      if (!button || !replay.contains(button)) return;
      const act = button.dataset.act;
      if (act === 'play') { setPlaying(!playing); return; }
      setPlaying(false);
      render(act === 'next' ? (step >= total ? 1 : step + 1) : (step <= 1 ? total : step - 1), true);
    });
    replay.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      if (event.target.closest('input, textarea, select')) return;
      event.preventDefault();
      setPlaying(false);
      render(event.key === 'ArrowRight' ? (step >= total ? 1 : step + 1) : (step <= 1 ? total : step - 1), true);
    });
    if ('IntersectionObserver' in window) {
      // Autoplay only while at least 40% of the meeting table is on screen.
      new IntersectionObserver(entries => {
        inView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.4);
        schedule();
      }, {threshold: [0, 0.4, 0.6, 1]}).observe(stage);
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => layout(false)).observe(stage);
    motionQuery?.addEventListener?.('change', () => { if (reduced()) setPlaying(false); });
    render(1, false);
    setPlaying(!reduced());
    return {stop: () => setPlaying(false)};
  })();

  /* (b) Agenda scrollspy */
  const agenda = document.querySelector('.mu-agenda');
  if (agenda && 'IntersectionObserver' in window) {
    const links = new Map();
    agenda.querySelectorAll('a[href^="#"]').forEach(link => {
      const section = document.getElementById(link.getAttribute('href').slice(1));
      if (section) links.set(section, link);
    });
    const list = agenda.querySelector('ol');
    const mark = section => {
      links.forEach((link, owner) => {
        if (owner === section) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
      const link = links.get(section);
      if (link && agenda.scrollWidth > agenda.clientWidth) {
        const left = link.offsetLeft - (agenda.clientWidth - link.offsetWidth) / 2 - (list?.offsetLeft || 0);
        agenda.scrollTo({left: Math.max(0, left), behavior: reduced() ? 'auto' : 'smooth'});
      }
    };
    const visible = new Set();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
      const sections = Array.from(links.keys());
      const current = sections.find(section => visible.has(section));
      if (current) mark(current);
    }, {rootMargin: '-35% 0px -60% 0px'});
    links.forEach((link, section) => spy.observe(section));
    const closing = document.getElementById('start-now');
    if (closing) {
      spy.observe(closing);
      links.set(closing, links.get(document.getElementById('faq')));
    }
    agenda.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      const section = link && document.getElementById(link.getAttribute('href').slice(1));
      if (section) mark(section);
    });
  }

  /* (c) Frozen copy toggle */
  const toggle = document.getElementById('versionToggle');
  if (toggle) {
    const freeze = toggle.closest('.mu-check')?.querySelector('.mu-freeze');
    const state = document.getElementById('workingState');
    const live = document.getElementById('versionLive');
    toggle.addEventListener('click', () => {
      const edited = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(edited));
      if (freeze) freeze.dataset.edited = String(edited);
      if (state) state.textContent = edited ? toggle.dataset.msgEdited : toggle.dataset.msgOriginal;
      if (live) live.textContent = edited ? toggle.dataset.msgOn : toggle.dataset.msgOff;
    });
  }

  /* (d) Copy brief */
  const copyButton = document.getElementById('copyBrief');
  const brief = document.getElementById('briefText');
  const notice = document.getElementById('notice');
  let noticeTimer = 0;
  const showNotice = text => {
    if (!notice) return;
    window.clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.textContent = '';
    window.setTimeout(() => { notice.textContent = text; }, 30);
    noticeTimer = window.setTimeout(() => { notice.hidden = true; notice.textContent = ''; }, 5000);
  };
  if (copyButton && brief) {
    copyButton.addEventListener('click', async () => {
      const text = brief.textContent.replace(/\s+/g, ' ').trim();
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard');
        await navigator.clipboard.writeText(text);
        showNotice(copyButton.dataset.msgCopied);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(brief);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        showNotice(copyButton.dataset.msgBlocked);
      }
    });
  }

  /* (e) Pausing: the guide hides this frame, or the tab goes to the background */
  const pause = () => {
    replayApi?.stop();
    root.classList.add('is-paused');
  };
  const resume = () => root.classList.remove('is-paused');
  const ready = () => window.setTimeout(() => root.classList.add('is-ready'), 400);
  if (document.readyState === 'complete') ready();
  else window.addEventListener('load', ready, {once: true});
  window.addEventListener('luna-product-paused', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  ['pointerdown', 'keydown', 'focusin', 'scroll'].forEach(type => {
    window.addEventListener(type, () => { if (root.classList.contains('is-paused')) resume(); }, {passive: true, capture: true});
  });
})();
