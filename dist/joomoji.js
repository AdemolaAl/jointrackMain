/*! Joomoji v1 — Joinvoo's avatar renderer. No dependencies. © Zedapex company.
 *
 * API (stable):
 *   Joomoji.svg(avatar, {size=96, animate=true, title=''})  -> SVG markup string (inline it with innerHTML)
 *   Joomoji.random(gender='other', seed)                    -> avatar object (seed: any string/number for a repeatable face)
 *   Joomoji.normalize(avatar, gender)                       -> avatar with every key clamped to a valid value
 *   Joomoji.joe({size=120, animate=true, talking=false, mood='good'|'calm'|'warn'|'bad'}) -> Joe the mascot, SVG string
 *   Joomoji.parts                                           -> option lists for building editors (labels, swatches, counts)
 *
 * Avatar JSON (≤ 400 bytes, stored by the server as-is):
 *   {v:1, g:'f'|'m'|'o', skin:0-5, hair:0-9, hairColor:0-6, eyes:0-3, brows:0-2, mouth:0-3,
 *    outfit:0-5, outfitColor:0-6, acc:0-5 (none, glasses, sunglasses, headset, cap, earrings), bg:0-7}
 *
 * Animation is CSS inside the SVG (blink, head bob, hair sway) and switches off under prefers-reduced-motion.
 */
(function (root) {
  'use strict';
  var SKIN = ['#FCE3CF', '#F4CBA8', '#E3AD82', '#C78B62', '#9C6644', '#6A4330'];
  var SKIN_SH = ['#EFC9AE', '#E3B08A', '#CF9468', '#AD744E', '#845336', '#553425'];
  var HAIRC = ['#1D1714', '#3B2416', '#6B4226', '#A0522D', '#D8B068', '#A3A7AD', '#7A5CFF'];
  var OUTC = ['#5B3DF5', '#2E9D6A', '#E08A2B', '#3D5AD6', '#C2463F', '#1E1E22', '#F2F1EC'];
  var BG = [['#EFEBFF', '#D7CDFF'], ['#E6F4EC', '#C5EBD4'], ['#FBF2DF', '#F5DDAA'], ['#EAF0FE', '#C9D7FF'], ['#FBEAE8', '#F5C7C1'], ['#EEF6DC', '#D3EC99'], ['#3A24C4', '#8D78FF'], ['#1E1E22', '#45454C']];
  var parts = {
    counts: { skin: 6, hair: 10, hairColor: 7, eyes: 4, brows: 3, mouth: 4, outfit: 6, outfitColor: 7, acc: 6, bg: 8 },
    skin: SKIN, hairColor: HAIRC, outfitColor: OUTC, bg: BG.map(function (b) { return b[0]; }),
    labels: {
      hair: ['Short crop', 'Side part', 'Curly top', 'Buzz', 'Long', 'Bob', 'Bun', 'Afro', 'Ponytail', 'Locs'],
      eyes: ['Round', 'Bright', 'Almond', 'Sparkle'], brows: ['Straight', 'Arched', 'Bold'], mouth: ['Smile', 'Grin', 'Happy', 'Smirk'],
      outfit: ['Tee', 'Hoodie', 'Shirt', 'Blazer', 'Turtleneck', 'Sweater'], acc: ['None', 'Glasses', 'Sunglasses', 'Headset', 'Cap', 'Earrings']
    },
    hairFor: { f: [4, 5, 6, 8, 9, 2, 7], m: [0, 1, 3, 2, 7, 9], o: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }
  };
  var uid = 0;
  function clamp(v, n, d) { v = parseInt(v, 10); return v >= 0 && v < n ? v : d; }
  function normalize(a, g) {
    a = a && typeof a === 'object' ? a : {}; var c = parts.counts;
    var gg = a.g === 'f' || a.g === 'm' || a.g === 'o' ? a.g : (g === 'female' || g === 'f' ? 'f' : g === 'male' || g === 'm' ? 'm' : 'o');
    return { v: 1, g: gg, skin: clamp(a.skin, c.skin, 2), hair: clamp(a.hair, c.hair, gg === 'f' ? 4 : 0), hairColor: clamp(a.hairColor, c.hairColor, 1),
      eyes: clamp(a.eyes, c.eyes, 0), brows: clamp(a.brows, c.brows, 0), mouth: clamp(a.mouth, c.mouth, 0), outfit: clamp(a.outfit, c.outfit, 0),
      outfitColor: clamp(a.outfitColor, c.outfitColor, 0), acc: clamp(a.acc, c.acc, 0), bg: clamp(a.bg, c.bg, 0) };
  }
  function rng(seed) {
    var s = 2166136261; seed = String(seed == null ? Math.random() : seed);
    for (var i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
    return function () { s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function random(gender, seed) {
    var r = rng(seed), g = gender === 'female' || gender === 'f' ? 'f' : gender === 'male' || gender === 'm' ? 'm' : 'o', pick = function (n) { return Math.floor(r() * n); };
    var hs = parts.hairFor[g], acc = r() < 0.55 ? 0 : [1, 2, 3, 4, 5][pick(5)];
    if (g === 'm' && acc === 5) acc = 1;
    return { v: 1, g: g, skin: pick(6), hair: hs[pick(hs.length)], hairColor: r() < 0.08 ? 6 : pick(6), eyes: g === 'f' ? [1, 2, 3][pick(3)] : pick(4), brows: pick(3), mouth: pick(4),
      outfit: pick(6), outfitColor: pick(7), acc: acc, bg: pick(6) };
  }

  /* ---------- drawing ---------- */
  function hairBack(h, c) {
    switch (h) {
      case 4: return '<path class="jm-sway" d="M29 52C26 25 43 13 60 13s34 12 31 39l3 44c-8 6-17 5-22-2H50c-5 7-14 8-22 2z" fill="' + c + '"/>';
      case 5: return '<path class="jm-sway" d="M30 54C27 27 43 15 60 15s33 12 30 39l1 22c-6 5-13 4-16-1H45c-3 5-10 6-16 1z" fill="' + c + '"/>';
      case 7: return '<circle cx="60" cy="42" r="33" fill="' + c + '"/><circle cx="33" cy="56" r="11" fill="' + c + '"/><circle cx="87" cy="56" r="11" fill="' + c + '"/>';
      case 8: return '<path class="jm-sway" d="M80 34c16 2 22 20 17 38-2 9-6 15-11 18 2-12 1-25-4-36z" fill="' + c + '"/><circle cx="83" cy="35" r="4.5" fill="' + c + '" stroke="rgba(0,0,0,.18)"/>';
      case 9: var o = ''; [31, 37, 43, 77, 83, 89].forEach(function (x, i) { o += '<rect class="jm-sway" x="' + (x - 3) + '" y="34" width="6" height="' + (50 + (i % 3) * 6) + '" rx="3" fill="' + c + '"/>'; }); return o;
      case 6: return '<circle cx="60" cy="15" r="10.5" fill="' + c + '"/><path d="M52 16q8-5 16 0" stroke="rgba(255,255,255,.18)" stroke-width="1.6" fill="none"/>';
      default: return '';
    }
  }
  function hairFront(h, c) {
    var hi = '<path d="M47 24q9-5 20-2" stroke="rgba(255,255,255,.22)" stroke-width="2" fill="none" stroke-linecap="round"/>';
    switch (h) {
      case 0: return '<path d="M34 49C33 27 45 18 60 18s27 9 26 31c-3-9-9-14-16-14-6-4-18-4-24 0-6 0-10 6-12 14z" fill="' + c + '"/>' + hi;
      case 1: return '<path d="M34 51C31 27 46 16 62 17s26 13 24 34c-2-10-7-16-15-18-10 3-22-1-28-6-4 6-8 13-9 24z" fill="' + c + '"/><path d="M43 27q14 8 32 5" stroke="rgba(0,0,0,.15)" stroke-width="1.4" fill="none"/>' + hi;
      case 2: return '<path d="M35 47C34 30 46 22 60 22s26 8 25 25c-6-7-14-9-25-9s-19 2-25 9z" fill="' + c + '"/>' + [[39, 36, 8], [47, 27, 9], [58, 23, 10], [69, 25, 9], [78, 31, 8], [83, 41, 5.5], [36, 44, 5.5]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" fill="' + c + '"/>'; }).join('') + '<circle cx="55" cy="22" r="3" fill="rgba(255,255,255,.18)"/>';
      case 3: return '<path d="M35.5 45C36 28 47 20 60 20s24 8 24.5 25c-6-8-14-12-24.5-12s-18.5 4-24.5 12z" fill="' + c + '" opacity=".88"/>';
      case 4: return '<path d="M35 52C34 30 46 19 60 19s26 11 25 33c-4-12-11-20-21-23-3 7-13 14-29 23z" fill="' + c + '"/>' + hi;
      case 5: return '<path d="M35 47C35 27 47 19 60 19s25 8 25 28l-6-3H41z" fill="' + c + '"/><path d="M44 30v12M52 27v15M60 26v16M68 27v15M76 30v12" stroke="rgba(0,0,0,.08)" stroke-width="1.2"/>';
      case 6: case 8: return '<path d="M35 49C34 28 46 20 60 20s26 8 25 29c-5-12-14-18-25-18s-20 6-25 18z" fill="' + c + '"/><path d="M47 25q13-6 26 0" stroke="rgba(255,255,255,.2)" stroke-width="1.8" fill="none"/>';
      case 7: return [[38, 34, 10], [48, 25, 11], [60, 21, 12], [72, 25, 11], [82, 34, 10], [35, 46, 7], [85, 46, 7]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" fill="' + c + '"/>'; }).join('') + '<circle cx="54" cy="19" r="3.4" fill="rgba(255,255,255,.16)"/>';
      case 9: return '<path d="M34 49C33 27 45 18 60 18s27 9 26 31c-4-9-11-15-20-16-4 3-9 3-13 0-9 1-15 7-19 16z" fill="' + c + '"/>' + hi;
      default: return '';
    }
  }
  function eyes(e, g) {
    var o = '', xs = [50, 70];
    xs.forEach(function (x, i) {
      var inner;
      if (e === 0) inner = '<circle cx="' + x + '" cy="53" r="3.3" fill="#231815"/><circle cx="' + (x + 1.1) + '" cy="51.9" r="1.1" fill="#fff"/>';
      else if (e === 1) inner = '<ellipse cx="' + x + '" cy="53" rx="3.4" ry="4.1" fill="#231815"/><circle cx="' + (x + 1.2) + '" cy="51.6" r="1.3" fill="#fff"/><circle cx="' + (x - 1) + '" cy="54.6" r=".6" fill="#fff"/>';
      else if (e === 2) inner = '<path d="M' + (x - 5.5) + ' 53q5.5-5 11 0q-5.5 4.5-11 0z" fill="#fff"/><circle cx="' + x + '" cy="53" r="2.7" fill="#3A2416"/><circle cx="' + x + '" cy="53" r="1.3" fill="#120c09"/><circle cx="' + (x + .9) + '" cy="52.1" r=".8" fill="#fff"/>';
      else inner = '<circle cx="' + x + '" cy="53" r="3.9" fill="#231815"/><circle cx="' + (x + 1.3) + '" cy="51.6" r="1.4" fill="#fff"/><circle cx="' + (x - 1.4) + '" cy="54.8" r=".7" fill="#fff"/>';
      var lash = g === 'f' && e !== 2 ? '<path d="M' + (x + (i ? 3 : -3)) + ' 49.4l' + (i ? 1.8 : -1.8) + ' -1.6" stroke="#231815" stroke-width="1.1" stroke-linecap="round"/>' : '';
      o += '<g class="jm-eye">' + inner + lash + '</g>';
    });
    return o;
  }
  function brows(b, hc) {
    var w = b === 2 ? 2.8 : 1.9, c = hc;
    if (b === 1) return '<path d="M45 45.5q5-3.4 10-.4M65 45.1q5-3 10 .4" stroke="' + c + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"/>';
    return '<path d="M45 45.2q5-1.6 10 0M65 45.2q5-1.6 10 0" stroke="' + c + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"/>';
  }
  function mouth(m) {
    switch (m) {
      case 1: return '<path d="M52 65.6q8 10 16 0z" fill="#7B2D33"/><path d="M53.3 66h13.4q-.6 2-1.4 2.6H54.7q-.8-.6-1.4-2.6z" fill="#fff"/><path d="M56 70.5q4 2 8 0" stroke="#F08A8A" stroke-width="2" stroke-linecap="round" fill="none"/>';
      case 2: return '<ellipse cx="60" cy="67.6" rx="4.2" ry="3.4" fill="#7B2D33"/><path d="M57 69.4q3 1.6 6 0" stroke="#F08A8A" stroke-width="1.6" stroke-linecap="round" fill="none"/>';
      case 3: return '<path d="M54 67.5q7 3.6 13-1.6" stroke="#7B2D33" stroke-width="2.3" fill="none" stroke-linecap="round"/>';
      default: return '<path d="M53 66.2q7 6.4 14 0" stroke="#7B2D33" stroke-width="2.3" fill="none" stroke-linecap="round"/>';
    }
  }
  function outfit(o, c, skin, sh) {
    var light = c === '#F2F1EC', ink = light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.22)';
    var base = '<path d="M16 120c2-21 18-32 44-32s42 11 44 32z" fill="' + c + '"/>';
    switch (o) {
      case 1: return '<path d="M36 92c4-8 14-12 24-12s20 4 24 12c-6 8-14 11-24 11s-18-3-24-11z" fill="' + c + '" opacity=".92"/>' + base + '<path d="M44 92q16 14 32 0" stroke="' + ink + '" stroke-width="2.4" fill="none"/><path d="M55 98v12M65 98v12" stroke="' + (light ? '#9b9b9b' : '#fff') + '" stroke-width="1.8" stroke-linecap="round"/><circle cx="55" cy="111" r="1.6" fill="' + (light ? '#9b9b9b' : '#fff') + '"/><circle cx="65" cy="111" r="1.6" fill="' + (light ? '#9b9b9b' : '#fff') + '"/>';
      case 2: return base + '<path d="M48 89l12 12 12-12" fill="' + skin + '"/><path d="M47 88l8 14 5-6 5 6 8-14-6-2-7 8-7-8z" fill="#fff"/><path d="M60 102v18" stroke="' + ink + '" stroke-width="1.4"/><circle cx="60" cy="108" r="1.1" fill="' + ink + '"/><circle cx="60" cy="115" r="1.1" fill="' + ink + '"/>';
      case 3: return '<path d="M16 120c2-21 18-32 44-32s42 11 44 32z" fill="#F2F1EC"/><path d="M16 120c2-21 18-32 44-32l-8 32zM104 120c-2-21-18-32-44-32l8 32z" fill="' + c + '"/><path d="M52 88l-7 10 9 4-2 18M68 88l7 10-9 4 2 18" stroke="' + ink + '" stroke-width="1.6" fill="none"/>';
      case 4: return base + '<path d="M47 82h26v14q-13 5-26 0z" fill="' + c + '"/><path d="M47 87q13 4 26 0M47 91q13 4 26 0" stroke="' + ink + '" stroke-width="1.3" fill="none"/>';
      case 5: return base + '<path d="M49 89l11 15 11-15" fill="' + skin + '"/><path d="M48 88l12 17 12-17" stroke="' + ink + '" stroke-width="2.2" fill="none"/><path d="M30 106v14M90 106v14" stroke="' + ink + '" stroke-width="1.4"/>';
      default: return base + '<path d="M48 89q12 9 24 0" fill="' + sh + '"/><path d="M47 88.5q13 10 26 0" stroke="' + ink + '" stroke-width="2" fill="none"/>';
    }
  }
  function acc(a, g, id) {
    switch (a) {
      case 1: return '<g fill="none" stroke="#231815" stroke-width="1.7"><rect x="42.5" y="47.5" width="15" height="11.5" rx="4.5" fill="rgba(255,255,255,.18)"/><rect x="62.5" y="47.5" width="15" height="11.5" rx="4.5" fill="rgba(255,255,255,.18)"/><path d="M57.5 52q2.5-1.6 5 0M42.5 51.5l-6-2M77.5 51.5l6-2"/></g>';
      case 2: return '<g><rect x="42" y="47" width="16" height="11.5" rx="5" fill="#1d1d24"/><rect x="62" y="47" width="16" height="11.5" rx="5" fill="#1d1d24"/><path d="M58 51.5q2-1.4 4 0M42 50.5l-6-2M78 50.5l6-2" stroke="#1d1d24" stroke-width="1.8" fill="none"/><path d="M45 50l5-1.6M65 50l5-1.6" stroke="#8D78FF" stroke-width="1.6" stroke-linecap="round" opacity=".9"/></g>';
      case 3: return '<path d="M33 52c-1-22 12-34 27-34s28 12 27 34" stroke="#2A2A33" stroke-width="3.4" fill="none"/><rect x="28" y="47" width="9" height="15" rx="4.5" fill="#2A2A33"/><rect x="83" y="47" width="9" height="15" rx="4.5" fill="#2A2A33"/><rect x="29.5" y="49" width="3" height="11" rx="1.5" fill="#8D78FF"/><path d="M33 61q2 9 15 9" stroke="#2A2A33" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="49" cy="70" r="2.4" fill="#C8F169"/>';
      case 4: return '<path d="M33 41C33 24 45 15 60 15s27 9 27 26z" fill="#5B3DF5"/><path d="M60 15v26" stroke="rgba(255,255,255,.25)" stroke-width="1.4"/><circle cx="60" cy="15.5" r="2" fill="#C8F169"/><path d="M30 41h45q14 0 20 5-6 2-20 1H30z" fill="#3A24C4"/>';
      case 5: return g === 'm' ? '' : '<circle cx="35.5" cy="63" r="2.2" fill="#F2C14E" stroke="#B88A12" stroke-width=".6"/><circle cx="84.5" cy="63" r="2.2" fill="#F2C14E" stroke="#B88A12" stroke-width=".6"/>';
      default: return '';
    }
  }
  function svg(avatar, opt) {
    opt = opt || {}; var a = normalize(avatar), size = opt.size || 96, anim = opt.animate !== false, id = 'jm' + (++uid).toString(36);
    var sk = SKIN[a.skin], sh = SKIN_SH[a.skin], hc = HAIRC[a.hairColor], oc = OUTC[a.outfitColor], bg = BG[a.bg], m = a.g === 'm';
    var face = m ? 'M35 50C35 29 47 22 60 22s25 7 25 28c0 14-6 24-14 28-5 2-17 2-22 0-8-4-14-14-14-28z' : 'M36 50c0-20 11-28 24-28s24 8 24 28c0 18-11 30-24 30S36 68 36 50z';
    var capHair = a.acc === 4 && [4, 5, 7, 8, 9].indexOf(a.hair) < 0;
    var css = anim ? '<style>@keyframes ' + id + 'b{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}@keyframes ' + id + 'h{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1.3px) rotate(-1.4deg)}}@keyframes ' + id + 's{0%,100%{transform:rotate(0)}50%{transform:rotate(1.8deg)}}' +
      '#' + id + ' .jm-eye{transform-box:fill-box;transform-origin:center;animation:' + id + 'b 4.6s infinite}#' + id + ' .jm-eye+.jm-eye{animation-delay:.02s}#' + id + ' .jm-head{transform-origin:60px 86px;animation:' + id + 'h 5.2s ease-in-out infinite}#' + id + ' .jm-sway{transform-box:fill-box;transform-origin:50% 0;animation:' + id + 's 4.2s ease-in-out infinite}' +
      '@media (prefers-reduced-motion:reduce){#' + id + ' *{animation:none!important}}</style>' : '';
    return '<svg id="' + id + '" class="joomoji" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="' + (opt.title ? String(opt.title).replace(/[<>"&]/g, '') : 'Joomoji avatar') + '">' + css +
      '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bg[0] + '"/><stop offset="1" stop-color="' + bg[1] + '"/></linearGradient><clipPath id="' + id + 'c"><circle cx="60" cy="60" r="60"/></clipPath>' +
      '<radialGradient id="' + id + 'f" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<g clip-path="url(#' + id + 'c)"><rect width="120" height="120" fill="url(#' + id + 'g)"/><circle cx="96" cy="22" r="16" fill="#fff" opacity=".18"/><circle cx="20" cy="96" r="22" fill="#fff" opacity=".12"/>' +
      '<g transform="translate(-4.8 -1) scale(1.08)"><g class="jm-head">' + (capHair ? '' : hairBack(a.hair, hc)) +
      '<rect x="51.5" y="70" width="17" height="20" rx="7" fill="' + sh + '"/>' + outfit(a.outfit, oc, sk, sh) +
      '<ellipse cx="35.5" cy="55" rx="4.3" ry="6.2" fill="' + sk + '"/><ellipse cx="84.5" cy="55" rx="4.3" ry="6.2" fill="' + sk + '"/><ellipse cx="35.8" cy="55.5" rx="1.8" ry="3" fill="' + sh + '"/><ellipse cx="84.2" cy="55.5" rx="1.8" ry="3" fill="' + sh + '"/>' +
      '<path d="' + face + '" fill="' + sk + '"/><path d="' + face + '" fill="url(#' + id + 'f)"/>' +
      '<circle cx="45" cy="62" r="4.6" fill="#FF7A7A" opacity=".2"/><circle cx="75" cy="62" r="4.6" fill="#FF7A7A" opacity=".2"/>' +
      eyes(a.eyes, a.g) + brows(a.brows, hc) + '<path d="M58.6 57.6q1.6 4.4 2.8 2.4" stroke="' + sh + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' + mouth(a.mouth) +
      (capHair ? '<path d="M35 49C34 33 45 26 60 26s26 7 25 23c-5-9-14-13-25-13s-20 4-25 13z" fill="' + hc + '"/>' : hairFront(a.hair, hc)) + acc(a.acc, a.g, id) + '</g></g></g></svg>';
  }

  /* ---------- Joe, the Joinvoo assistant ---------- */
  function joe(opt) {
    opt = opt || {}; var size = opt.size || 120, anim = opt.animate !== false, id = 'joe' + (++uid).toString(36), mood = opt.mood || 'good';
    var bodyA = { good: '#9A86FF', calm: '#9A86FF', warn: '#A58BFF', bad: '#8F7BFF' }[mood] || '#9A86FF';
    var brow = mood === 'warn' ? '<path d="M38 40q5-4 10-1M72 37q5-3 10 0" stroke="#2B1A8F" stroke-width="2.6" stroke-linecap="round"/>' : mood === 'bad' ? '<path d="M38 43l9-2M82 43l-9-2" stroke="#2B1A8F" stroke-width="2.6" stroke-linecap="round"/>' : '';
    var mouthOpen = '<g class="joe-talk"><ellipse cx="60" cy="72" rx="7" ry="5" fill="#2B1036"/><ellipse cx="60" cy="74.2" rx="4.2" ry="2.2" fill="#FF8FA3"/></g>';
    var mouthSmile = mood === 'bad' ? '<path d="M51 75q9-6 18 0" stroke="#2B1036" stroke-width="3" fill="none" stroke-linecap="round"/>' : mood === 'warn' ? '<path d="M52 73q8 2 16 0" stroke="#2B1036" stroke-width="3" fill="none" stroke-linecap="round"/>' : '<path d="M50 69q10 11 20 0z" fill="#2B1036"/><path d="M54 73.6q6 3 12 0" stroke="#FF8FA3" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    var css = anim ? '<style>@keyframes ' + id + 'b{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.08)}}@keyframes ' + id + 'o{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes ' + id + 'g{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.25)}}@keyframes ' + id + 't{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}@keyframes ' + id + 'w{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}@keyframes ' + id + 'p{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.82)}}' +
      '#' + id + ' .joe-eye{transform-box:fill-box;transform-origin:center;animation:' + id + 'b 4s infinite}#' + id + ' .joe-body{animation:' + id + 'o 3.2s ease-in-out infinite}#' + id + ' .joe-glow{transform-box:fill-box;transform-origin:center;animation:' + id + 'g 1.8s ease-in-out infinite}' +
      '#' + id + ' .joe-talk{transform-box:fill-box;transform-origin:center;animation:' + id + 't .32s ease-in-out infinite}#' + id + ' .joe-arm{transform-box:fill-box;transform-origin:90% 20%;animation:' + id + 'w 2.6s ease-in-out infinite}#' + id + ' .joe-sh{transform-box:fill-box;transform-origin:center;animation:' + id + 'p 3.2s ease-in-out infinite}' +
      '@media (prefers-reduced-motion:reduce){#' + id + ' *{animation:none!important}}</style>' : '';
    return '<svg id="' + id + '" class="joe" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="' + size + '" height="' + size + '" role="img" aria-label="Joe, the Joinvoo assistant">' + css +
      '<defs><radialGradient id="' + id + 'b1" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#C3B6FF"/><stop offset=".45" stop-color="' + bodyA + '"/><stop offset="1" stop-color="#4A2FD8"/></radialGradient>' +
      '<radialGradient id="' + id + 'sp" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#E7FFB0"/><stop offset=".6" stop-color="#C8F169"/><stop offset="1" stop-color="#C8F169" stop-opacity="0"/></radialGradient></defs>' +
      '<ellipse class="joe-sh" cx="60" cy="112" rx="26" ry="4.5" fill="#2B1A8F" opacity=".18"/>' +
      '<g class="joe-body"><path d="M60 22v-8" stroke="#3A24C4" stroke-width="2.6" stroke-linecap="round"/><circle class="joe-glow" cx="60" cy="11" r="9" fill="url(#' + id + 'sp)"/><path d="M60 4.5l1.9 4.4 4.6.6-3.4 3.1 1 4.6L60 15l-4.1 2.2 1-4.6-3.4-3.1 4.6-.6z" fill="#C8F169" stroke="#7FA82C" stroke-width=".6"/>' +
      '<path class="joe-arm" d="M22 74c-8-2-12-8-10-14" stroke="#5B3DF5" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M98 74c6 2 9 7 8 12" stroke="#5B3DF5" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<circle cx="60" cy="62" r="40" fill="url(#' + id + 'b1)"/><ellipse cx="46" cy="38" rx="13" ry="7" fill="#fff" opacity=".22" transform="rotate(-22 46 38)"/>' +
      '<path d="M24 58C24 34 40 22 60 22s36 12 36 36" stroke="#2A2A33" stroke-width="4" fill="none"/><rect x="16" y="52" width="12" height="20" rx="6" fill="#2A2A33"/><rect x="92" y="52" width="12" height="20" rx="6" fill="#2A2A33"/><rect x="18.5" y="55" width="3.6" height="14" rx="1.8" fill="#C8F169"/>' +
      '<path d="M22 70q2 14 22 13" stroke="#2A2A33" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="45" cy="83" r="3.2" fill="#C8F169"/>' +
      '<ellipse cx="60" cy="57" rx="30" ry="22" fill="#fff" opacity=".1"/>' +
      '<g class="joe-eye"><ellipse cx="46" cy="53" rx="8.5" ry="10" fill="#fff"/><circle cx="47.5" cy="54.5" r="5.2" fill="#1E1440"/><circle cx="49.5" cy="51.5" r="2" fill="#fff"/></g>' +
      '<g class="joe-eye"><ellipse cx="74" cy="53" rx="8.5" ry="10" fill="#fff"/><circle cx="75.5" cy="54.5" r="5.2" fill="#1E1440"/><circle cx="77.5" cy="51.5" r="2" fill="#fff"/></g>' + brow +
      '<circle cx="36" cy="67" r="5" fill="#FF8FA3" opacity=".45"/><circle cx="84" cy="67" r="5" fill="#FF8FA3" opacity=".45"/>' +
      (opt.talking ? mouthOpen : mouthSmile) + '</g></svg>';
  }

  root.Joomoji = { svg: svg, random: random, normalize: normalize, joe: joe, parts: parts, version: 1 };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
