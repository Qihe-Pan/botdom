import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { MASCOT_BODIES } from '../shared/mascot-bodies.ts';

const presets = [
  ['blue', 'circle', ['#e8f0fc', '#c3d5ed', '#98adc8']],
  ['purple', 'squircle', ['#eee5f6', '#d6c0e8', '#ad94c1']],
  ['green', 'blob', ['#e2f1e8', '#b7d6c5', '#8bb09b']],
  ['pink', 'capsule', ['#f9e4ee', '#e7bfd1', '#c792aa']],
  ['yellow', 'star', ['#faf0d6', '#e7d7ad', '#c2ae83']],
  ['teal', 'diamond', ['#def2ed', '#b0d7ce', '#81ada4']],
];

for (const [name, shape, palette] of presets) {
  const body = MASCOT_BODIES[shape];
  const { x, y } = body.anchor;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -15 258.541 258.541" width="512" height="512">
    <defs><linearGradient id="body" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette[0]}"/><stop offset=".55" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/>
    </linearGradient></defs>
    <g transform="${body.fit}">${body.body.replaceAll('{{GRADIENT}}', 'url(#body)')}</g>
    <g fill="#6b6390">
      <rect x="${x - 34}" y="${y - 24}" width="15" height="27" rx="7.5"/>
      <rect x="${x + 19}" y="${y - 24}" width="15" height="27" rx="7.5"/>
      <path d="M${x - 19} ${y + 19}h38a19 19 0 0 1-38 0Z"/>
    </g>
  </svg>`;
  const png = new Resvg(svg).render().asPng();
  writeFileSync(new URL(`../public/avatars/person-${name}.png`, import.meta.url), png);
  console.log(name, png.length);
}
