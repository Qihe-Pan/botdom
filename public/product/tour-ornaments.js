/* Per-stop emblem bands: a text-free, mirror-symmetric row of badges for every stop card.
   Purely decorative (aria-hidden); adds no copy, so it needs no translations. Styles live in tour-redesign.css. */
(function () {
  'use strict';
  var BOT = 'shared/bot-3d/assets/';
  var V = '?v=20261103-2';
  var imgs = { lead: 'captain-supervisor.png', research: 'research-sage.png', writer: 'writer-peach.png', review: 'review-blue.png' };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bot(role, big) { return '<span class="orn-tile orn-bot' + (big ? ' is-big' : '') + '" style="--c:var(--' + role + ')"><span class="bd-bot bd-bot--' + role + '"><img src="' + BOT + imgs[role] + V + '" alt="" width="256" height="256"><i class="bd-eyes"></i></span></span>'; }
  function glyph(g, color, big) { return '<span class="orn-tile orn-glyph' + (big ? ' is-big' : '') + '" style="--c:' + color + '">' + g + '</span>'; }
  function link(g) { return '<span class="orn-link" aria-hidden="true">' + (g || '') + '</span>'; }
  function icon(kind, name, big) { return '<span class="orn-tile orn-icon' + (big ? ' is-big' : '') + '"><span class="bd-' + kind + '-icon" data-icon="' + name + '"></span></span>'; }

  var specs = {
    /* You -> two members -> Lead (centre) -> reviewer -> back to you: a relay that mirrors around the lead */
    meeting: function () { return ['orn-relay',
      glyph('☺', 'var(--gold)') + link('›') + bot('research') + link('›') + bot('writer') + link('›') + bot('lead', true) + link('‹') + bot('review') + link('‹') + bot('research') + link('‹') + glyph('☺', 'var(--gold)')]; },
    /* A garland of nine pennants in the five tool colours, mirrored about the middle */
    harnesses: function () {
      var c = ['--lead', '--research', '--writer', '--review', '--gold', '--review', '--writer', '--research', '--lead'];
      return ['orn-garland', c.map(function (v) { return '<i class="orn-flag" style="--c:var(' + v + ')"></i>'; }).join('')];
    },
    /* Three sheets, the middle one sealed with wax */
    checks: function () {
      function sheet(sealed) { return '<span class="orn-tile orn-sheet' + (sealed ? ' is-big' : '') + '"><b></b><b></b><b></b>' + (sealed ? '<span class="orn-wax"></span>' : '') + '</span>'; }
      return ['orn-sheets', sheet() + link('') + sheet() + link('') + sheet(true) + link('') + sheet() + link('') + sheet()];
    },
    /* The five controls as big round keys, Stop in the centre (same order as the cards below) */
    controls: function () { return ['orn-keys',
      icon('seal', 'queue') + icon('seal', 'pause') + icon('seal', 'stop', true) + icon('seal', 'restart') + icon('seal', 'approve')]; },
    /* Six workshop badges, 3 + 3 around a centre line */
    more: function () { return ['orn-badges',
      ['models', 'skills', 'schedule', 'backup', 'usage', 'search'].map(function (n) { return icon('room', n); }).join('')]; },
    /* A battlement: eleven merlons across the wall */
    local: function () { return ['orn-wall', new Array(11).join('<i></i>') + '<i></i>']; },
    /* Fog clouds fading out toward both edges */
    limits: function () { return ['orn-fog', ['.3', '.55', '.8', '1', '.8', '.55', '.3'].map(function (o) { return '<span style="--o:' + o + '"><i></i></span>'; }).join('')]; },
    /* Six message dots with a play key in the centre */
    collaboration: function () { return ['orn-steps',
      [1, 2, 3].map(function (n) { return '<span class="orn-dot">' + n + '</span>'; }).join(link('')) + link('') + '<span class="orn-play"><i></i></span>' + link('') + [4, 5, 6].map(function (n) { return '<span class="orn-dot">' + n + '</span>'; }).join(link(''))]; },
    /* Six pinned notes, each marked with a question glyph */
    faq: function () {
      var c = ['--research', '--writer', '--lead', '--lead', '--writer', '--research'];
      return ['orn-notes', c.map(function (v) { return '<span class="orn-note" style="--c:var(' + v + ')"><i></i><b>?</b></span>'; }).join('')];
    }
  };

  Object.keys(specs).forEach(function (id) {
    var card = document.querySelector('#' + id + ' .bd-content');
    if (!card || card.querySelector('.bd-orn')) return;
    var s = specs[id](), band = el('div', 'bd-orn ' + s[0], s[1]);
    band.setAttribute('aria-hidden', 'true');
    var anchor = null;
    [].some.call(card.children, function (ch) {
      if (ch.tagName === 'H2' || ch.classList.contains('bd-intro')) return false;
      anchor = ch; return true;
    });
    card.insertBefore(band, anchor);
  });
})();
