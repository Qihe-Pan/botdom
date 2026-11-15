/* Stop rail: a text-free row of buttons at the foot of every stop card: previous, the ten stops as numerals, next.
   Built from the map legend so it follows the page language and never adds copy of its own. */
(function () {
  'use strict';
  var legend = document.querySelectorAll('#bdLegend li a[href^="#"]');
  var stops = [].map.call(legend, function (a) {
    return { id: a.getAttribute('href').slice(1), num: (a.querySelector('.bd-num') || {}).textContent || '', a: a };
  });
  if (stops.length < 2) return;

  function label(s) {
    var span = s.a.querySelector('span:not(.bd-num)');
    return (span && span.textContent.trim()) || s.id;
  }
  function link(s, cls, text) {
    var el = document.createElement('a');
    el.className = 'bd-rail-btn ' + cls;
    el.href = '#' + s.id;
    el.textContent = text;
    el.setAttribute('aria-label', label(s));
    el.title = label(s);
    return el;
  }

  stops.forEach(function (stop, i) {
    var card = document.querySelector('#' + stop.id + ' .bd-content');
    if (!card || card.querySelector('.bd-rail')) return;
    var rail = document.createElement('nav');
    rail.className = 'bd-rail';
    rail.setAttribute('aria-label', document.querySelector('#bdLegend .bd-legend-title') ? document.querySelector('#bdLegend .bd-legend-title').textContent : 'Stops');

    var prev = stops[i - 1], next = stops[i + 1];
    if (prev) rail.appendChild(link(prev, 'bd-rail-step', '‹'));
    else rail.appendChild(Object.assign(document.createElement('span'), { className: 'bd-rail-btn bd-rail-step is-off', textContent: '‹' }));

    var dots = document.createElement('span');
    dots.className = 'bd-rail-dots';
    stops.forEach(function (s, j) {
      var d = link(s, 'bd-rail-dot', s.num);
      if (j === i) { d.classList.add('is-here'); d.setAttribute('aria-current', 'location'); }
      dots.appendChild(d);
    });
    rail.appendChild(dots);

    if (next) rail.appendChild(link(next, 'bd-rail-step', '›'));
    else rail.appendChild(Object.assign(document.createElement('span'), { className: 'bd-rail-btn bd-rail-step is-off', textContent: '›' }));
    card.appendChild(rail);
  });
})();
