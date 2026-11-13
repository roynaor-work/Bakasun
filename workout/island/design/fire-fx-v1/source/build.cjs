// SPDX-License-Identifier: CC0-1.0
// Original vector artwork and deterministic animation, authored for Bakasun.
// Run: npm install --prefix /tmp/fire-fx-build sharp@0.35.4
// NODE_PATH=/tmp/fire-fx-build/node_modules node source/build.cjs
'use strict';
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const tau = Math.PI * 2;
const sin = Math.sin, cos = Math.cos;
const f = x => Number(x.toFixed(3));
const ellipse = (x, y, rx, ry, fill, opacity = 1, extra = '') =>
  `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" opacity="${f(opacity)}" ${extra}/>`;
const curve = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const stroke = (d, color, width, opacity = 1) => curve(d, 'none',
  `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${f(opacity)}"`);
const wrap = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
 <linearGradient id="fire" x1="0" y1="1" x2="0.2" y2="0"><stop stop-color="#ffb315"/><stop offset=".45" stop-color="#ff9b0a"/><stop offset="1" stop-color="#ff5022"/></linearGradient>
 <linearGradient id="gold" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#fff5a0"/><stop offset=".5" stop-color="#ffdd32"/><stop offset="1" stop-color="#ffbd16"/></linearGradient>
 <radialGradient id="heat"><stop stop-color="#ffbf16" stop-opacity=".48"/><stop offset=".5" stop-color="#ff7b12" stop-opacity=".17"/><stop offset="1" stop-color="#ff5514" stop-opacity="0"/></radialGradient>
 <radialGradient id="soot" cx=".32" cy=".22" r=".85"><stop stop-color="#5e6070"/><stop offset=".56" stop-color="#333442"/><stop offset="1" stop-color="#151722"/></radialGradient>
 <radialGradient id="steam" cx=".32" cy=".24" r=".85"><stop stop-color="#fff"/><stop offset=".55" stop-color="#f2f9fc"/><stop offset="1" stop-color="#bcd7e2"/></radialGradient>
 <linearGradient id="water" x1="0" y1="1" x2=".3" y2="0"><stop stop-color="#168fce" stop-opacity=".75"/><stop offset=".45" stop-color="#31c8ed" stop-opacity=".85"/><stop offset="1" stop-color="#b9f9ff" stop-opacity=".95"/></linearGradient>
 <radialGradient id="bubble" cx=".32" cy=".2" r=".85"><stop stop-color="#fff" stop-opacity=".96"/><stop offset=".55" stop-color="#effcff" stop-opacity=".8"/><stop offset="1" stop-color="#a8dae8" stop-opacity=".65"/></radialGradient>
</defs>${body}</svg>`;

function flameShape(p) {
  const a = f(7 * sin(p)), b = f(9 * cos(p)), c = f(5 * sin(p + 1.2));
  return `M 0 0 C -29 0 -49 -16 -43 -43 C -53 -69 -28 -91 -31 ${-117 + b} C -13 -105 -10 -85 -13 -76 C 9 -110 -15 -141 ${11 + a} ${-194 + c} C 35 -166 42 -140 25 -109 C 17 -89 25 -79 32 -85 C 41 -91 44 -108 39 ${-123 + b} C 60 -93 44 -70 47 -46 C 52 -18 31 0 0 0 Z`;
}
function fireFrame(i, scale, extinguish = false) {
  const t = i / 7, p = i / 8 * tau;
  if (extinguish && i === 7) return '';
  const shrink = extinguish ? (1 - t) ** .9 : 1;
  const opacity = extinguish ? (1 - t) ** .55 : 1;
  const sx = scale * shrink * (1 + .04 * sin(p));
  const sy = scale * shrink * (1 + .035 * cos(p));
  let body = ellipse(64, 222, 59 * scale * shrink, 31 * scale * shrink, 'url(#heat)', opacity);
  body += `<g transform="translate(64 238) scale(${f(sx)} ${f(sy)})" opacity="${f(opacity)}">`;
  body += curve(flameShape(p), 'url(#fire)');
  body += `<g transform="translate(-2 -3) scale(.67 .74)">${curve(flameShape(p + .65), 'url(#gold)')}</g>`;
  body += `<g transform="translate(0 -6) scale(.32 .42)">${curve(flameShape(p + 1.2), '#fff9ce')}</g>`;
  for (let j = 0; j < 3; j++) {
    const q = (i / 8 + j / 3) % 1;
    const alpha = sin(Math.PI * q) ** 2 * .75;
    body += ellipse(-29 + j * 29 + 7 * sin(p + j), -84 - 119 * q, 2.6, 5, '#ffcd44', alpha);
  }
  return body + '</g>';
}

function smokeFrame(i, white) {
  const p = i / 16;
  let body = '';
  // Three staggered puffs cross-fade through their lifetimes, including 15 -> 0.
  for (let j = 0; j < 3; j++) {
    const age = (p + j / 3) % 1;
    const alpha = sin(Math.PI * age) ** 1.4 * (white ? .7 : .84);
    const x = 64 + 10 * sin(age * 4 + j * 1.7);
    const y = 110 - age * 64;
    const r = 9 + age * 19;
    const fill = white ? 'url(#steam)' : 'url(#soot)';
    body += `<g opacity="${f(alpha)}">`;
    body += ellipse(x - .62 * r, y, r * .73, r * .72, fill);
    body += ellipse(x + .62 * r, y - r * .12, r * .78, r * .79, fill);
    body += ellipse(x, y - r * .43, r * .83, r, fill);
    body += ellipse(x, y + r * .3, r * .93, r * .64, fill);
    body += stroke(`M ${f(x - .62 * r)} ${f(y - .32 * r)} Q ${f(x - .7 * r)} ${f(y - r)} ${f(x - .12 * r)} ${f(y - 1.1 * r)}`, white ? '#fff' : '#92939d', f(r * .08), .16);
    body += '</g>';
  }
  return body;
}

function drop(x, y, r, angle, alpha = 1) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(angle)}) scale(${f(r / 6)})" opacity="${f(alpha)}">` +
    curve('M -9 0 C -4 -1 -1 -5 3 -5 C 11 -5 11 5 3 5 C -1 5 -4 1 -9 0 Z', 'url(#water)') +
    stroke('M 1 -2 Q 4 -4 6 -1', '#e3feff', 1.6, .9) + '</g>';
}
function jetFrame(i, dropletsOnly = false) {
  const p = i / 8 * tau;
  let body = '';
  if (!dropletsOnly) {
    const up = f(53 + 2 * sin(p)), down = f(75 + 2 * cos(p));
    body += curve(`M 8 64 C 57 58 117 47 198 ${up} C 222 51 236 57 235 63 C 235 73 215 80 196 ${down} C 122 80 57 67 8 64 Z`, 'url(#water)');
    body += stroke(`M 10 64 C 87 63 160 ${f(54 + 2 * cos(p))} 219 61`, '#d5fcff', 3.8, .85);
    for (let j = 0; j < 4; j++) {
      const q = (i / 8 + j / 4) % 1, x = 18 + q * 197;
      body += stroke(`M ${f(x)} ${f(67 + 3 * sin(q * tau))} l 17 -1`, '#ecffff', 2.2, sin(Math.PI * q) ** 2 * .8);
    }
  }
  const w = dropletsOnly ? 128 : 256;
  for (let j = 0; j < 9; j++) {
    const q = (i / 8 + j * .173) % 1;
    const x = 14 + q * (w - 28);
    const side = j % 2 ? -1 : 1;
    const y = 64 + side * (10 + 27 * q) + 4 * sin(p + j);
    body += drop(x, y, 1.7 + q * 2.4, side * 10, sin(Math.PI * q) ** 2 * .87);
  }
  return body;
}

function splashFrame(i) {
  if (i === 5) return '';
  const t = i / 5, expand = .35 + t * .9, alpha = (1 - t) ** .7;
  let body = `<g opacity="${f(alpha)}" transform="translate(64 102) scale(${f(expand)})">`;
  body += ellipse(0, 0, 39, 9, 'url(#water)', .65);
  body += curve('M -38 -1 Q -32 -7 -35 -23 Q -40 -42 -32 -36 Q -19 -27 -16 -14 Q -11 -10 -9 -30 Q -7 -55 0 -48 Q 4 -41 7 -22 Q 9 -9 15 -13 Q 23 -29 31 -34 Q 39 -38 33 -19 Q 29 -7 38 -1 Q 0 15 -38 -1 Z', 'url(#water)');
  body += stroke('M -31 -3 Q 0 8 31 -3', '#d5fbff', 2.5, .95);
  body += '</g>';
  for (let j = 0; j < 9; j++) {
    const a = Math.PI * (1.07 + j / 10 * .86);
    const dist = 16 + 55 * t;
    body += drop(64 + cos(a) * dist, 96 + sin(a) * dist - 28 * sin(Math.PI * t), 3 - t,
      a * 180 / Math.PI, alpha);
  }
  return body;
}

function puddleFrame() {
  return curve('M 21 61 C 12 46 46 30 74 34 C 94 15 127 24 143 34 C 177 27 204 41 211 52 C 240 59 231 79 211 82 C 183 100 145 92 124 96 C 89 107 59 91 48 85 C 25 87 10 75 21 61 Z', 'url(#water)', 'opacity=".68"') +
    stroke('M 42 50 Q 66 35 89 40 M 150 43 Q 182 36 200 52 M 62 83 Q 89 94 114 86', '#d7fbff', 3, .8) +
    ellipse(128, 63, 62, 18, 'none', .45, 'stroke="#c2f7ff" stroke-width="1.7"');
}

function foamFrame(i) {
  const p = i / 6 * tau;
  let body = ellipse(64, 105, 47, 11, '#a8dce6', .3);
  for (let j = 0; j < 15; j++) {
    const row = j < 7 ? 0 : j < 12 ? 1 : 2;
    const index = row === 0 ? j : row === 1 ? j - 7 : j - 12;
    const n = row === 0 ? 7 : row === 1 ? 5 : 3;
    const x = 64 + (index - (n - 1) / 2) * 12.3;
    const r = (row === 2 ? 13 : 10) + 1.8 * sin(p + j * 1.7);
    const y = 101 - row * 15 + 1.5 * cos(p + j);
    body += ellipse(x, y, r, r * .85, 'url(#bubble)', 1, 'stroke="#a9dce8" stroke-width=".65"');
    body += stroke(`M ${f(x - r * .55)} ${f(y - r * .2)} Q ${f(x - r * .3)} ${f(y - r * .65)} ${f(x + r * .1)} ${f(y - r * .6)}`, '#fff', 1.7, .9);
  }
  for (let j = 0; j < 4; j++) {
    const age = (i / 6 + j / 4) % 1;
    const r = 3 + age * 3;
    body += ellipse(31 + j * 21 + 3 * sin(p + j), 71 - age * 42, r, r, 'url(#bubble)', sin(Math.PI * age) ** 2);
  }
  return body;
}

function sparksFrame(i) {
  const p = i / 16;
  let body = '';
  for (let j = 0; j < 11; j++) {
    const age = (p + j * .137) % 1;
    const alpha = sin(Math.PI * age) ** 1.5;
    const x = 64 + (j - 5) * 5.4 * (.3 + age) + sin(age * 7 + j) * 5;
    const y = 112 - age * (65 + (j % 3) * 13);
    const r = 1.7 + (j % 3) * .35;
    body += ellipse(x, y, r * 3, r * 4, 'url(#heat)', alpha * .6);
    body += stroke(`M ${f(x)} ${f(y)} l ${f(-1.4 * cos(j))} ${f(3 + age * 3)}`, j % 2 ? '#ffce46' : '#fff1ad', r, alpha);
  }
  return body;
}

function pressureFrame() {
  let body = '';
  for (const [base, amp, color, width, opacity, phase] of [
    [16, 3, '#1b9cda', 11, .4, 0], [16, 3, '#54dcf4', 5, .86, 0],
    [12, 2, '#dbfdff', 1.6, .95, .4], [20, 2, '#79e8ff', 1.4, .8, 1.8]]) {
    // Extend past both edges so round line caps cannot create a tile seam.
    const pts = Array.from({length: 289}, (_, k) => {
      const x = k - 16;
      return `${k ? 'L' : 'M'}${x} ${f(base + amp * sin(x / 255 * tau * 2 + phase))}`;
    }).join(' ');
    body += stroke(pts, color, width, opacity);
  }
  return body;
}

const specs = [
  ['flame-small', 'להבה קטנה', 128, 256, 4, 2, 8, 12, true, 'AdditiveBlending', [64,238], i => fireFrame(i,.48)],
  ['flame-medium', 'להבה בינונית', 128, 256, 4, 2, 8, 12, true, 'AdditiveBlending', [64,238], i => fireFrame(i,.72)],
  ['flame-large', 'להבה גדולה', 128, 256, 4, 2, 8, 12, true, 'AdditiveBlending', [64,238], i => fireFrame(i,1)],
  ['flame-extinguish', 'כיבוי להבה', 128, 256, 4, 2, 8, 14, false, 'AdditiveBlending', [64,238], i => fireFrame(i,1,true)],
  ['smoke-black', 'עשן שחור עולה', 128, 128, 4, 4, 16, 12, true, 'NormalBlending', [64,116], i => smokeFrame(i,false)],
  ['steam-white', 'אדים לבנים', 128, 128, 4, 4, 16, 12, true, 'NormalBlending', [64,116], i => smokeFrame(i,true)],
  ['water-jet', 'סילון מים', 256, 128, 4, 2, 8, 16, true, 'NormalBlending', [8,64], i => jetFrame(i)],
  ['water-droplets', 'טיפות מים', 128, 128, 4, 2, 8, 16, true, 'NormalBlending', [8,64], i => jetFrame(i,true)],
  ['water-impact', 'נתז פגיעה', 128, 128, 3, 2, 6, 15, false, 'NormalBlending', [64,102], splashFrame],
  ['water-puddle', 'שלולית', 256, 128, 1, 1, 1, 0, false, 'NormalBlending', [128,64], puddleFrame],
  ['foam-bubbles', 'בועות קצף', 128, 128, 3, 2, 6, 10, true, 'NormalBlending', [64,112], foamFrame],
  ['sparks', 'ניצוצות', 128, 128, 4, 4, 16, 16, true, 'AdditiveBlending', [64,116], sparksFrame],
  ['water-pressure-line', 'קו לחץ מים', 256, 32, 1, 1, 1, 0, false, 'NormalBlending', [0,16], pressureFrame]
];

async function main() {
  const assets = [];
  for (const [id, name, fw, fh, columns, rows, frames, fps, loop, blending, anchor, draw] of specs) {
    const tiles = [];
    for (let i = 0; i < frames; i++) {
      const tile = await sharp(Buffer.from(wrap(fw, fh, draw(i))), {density:144})
        .resize(fw, fh).png().toBuffer();
      tiles.push({input:tile, left:(i % columns) * fw, top:Math.floor(i / columns) * fh});
    }
    const buffer = await sharp({create:{width:fw*columns, height:fh*rows, channels:4, background:'#0000'}})
      .composite(tiles).png({palette:true, colours:128, dither:0, effort:10, compressionLevel:9}).toBuffer();
    const file = `${id}.png`;
    await fs.writeFile(path.join(root, file), buffer);
    assets.push({id, name, file, sheetWidth:fw*columns, sheetHeight:fh*rows,
      frameWidth:fw, frameHeight:fh, columns, rows, frameCount:frames, recommendedFps:fps,
      loop, playback:frames === 1 ? 'static' : loop ? 'loop' : 'once',
      endBehavior:frames > 1 && !loop ? 'hold-transparent-last-frame' : null,
      blending, anchorPixels:{x:anchor[0], y:anchor[1]},
      ...(id.startsWith('water-') && ['water-jet','water-droplets'].includes(id) ? {direction:'+X', nozzleAnchorPixels:{x:8,y:64}} : {}),
      ...(id === 'water-pressure-line' ? {repeatX:true, repeatY:false, recommendedScrollPixelsPerSecond:160, sampling:'linear-repeat', mipmaps:false} : {}),
      bytes:buffer.length, sha256:crypto.createHash('sha256').update(buffer).digest('hex'), license:'CC0-1.0'});
    console.log(`${file}: ${buffer.length} bytes`);
  }
  const manifest = {schemaVersion:1, package:'fire-fx-v1', license:'CC0-1.0',
    format:'PNG with indexed RGBA palette and 8-bit transparency', colorSpace:'sRGB', alphaMode:'straight',
    premultipliedAlpha:false, frameOrder:'row-major, left-to-right then top-to-bottom',
    coordinateOrigin:'top-left', anchorUnits:'pixels within an untrimmed frame',
    grid:{margin:0, spacing:0, trim:false, transparentGutterPixels:2},
    textureSettings:{wrapS:'ClampToEdgeWrapping (except pressure line: RepeatWrapping)', wrapT:'ClampToEdgeWrapping',
      minFilter:'LinearFilter', magFilter:'LinearFilter', generateMipmaps:false, depthWrite:false, transparent:true},
    uv:{frame:'column = frame % columns; row = floor(frame / columns)',
      rectPixels:'[column * frameWidth, row * frameHeight, frameWidth, frameHeight]',
      threeJsFlipYTrue:'repeat=(1/columns,1/rows); offset=(column/columns,1-(row+1)/rows)',
      sampling:'Inset frame UV bounds by half a texel; no atlas mipmaps.'},
    notes:['No text is baked into any PNG.',
      'Small/medium/large flames share a fixed canvas and ground anchor; do not trim or normalize their occupied bounds.',
      'Extinguish begins with flame-large frame 0 and ends fully transparent. Play once on the same anchor.',
      'Impact ends fully transparent; play once. Smoke and steam are staggered rising puff loops.',
      'AdditiveBlending uses RGB * source alpha + destination RGB with premultipliedAlpha=false.',
      'Jet and droplets point right from nozzleAnchorPixels. Rotate around that anchor when aiming.',
      'Pressure line fills X edge-to-edge and repeats horizontally; scroll its U coordinate.',
      'White steam and additive fire naturally have less contrast over a near-white background.'],
    pngBytes:assets.reduce((sum,a) => sum + a.bytes,0), maxPackageBytes:600000, assets};
  await fs.writeFile(path.join(root,'manifest.json'), JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(root,'preview-data.js'), '// SPDX-License-Identifier: CC0-1.0\n// Generated from manifest.json by source/build.cjs.\nwindow.FIRE_FX_PREVIEW = '+JSON.stringify(assets)+';\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
