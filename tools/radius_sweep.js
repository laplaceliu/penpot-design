// One-shot radius sweep over the engines. Three stages, each guarded:
//   A  the generic writers coerce (plate/ring/clip/build/bubble + NL + storage primitives) — this is the guarantee
//      that no orphan number can reach the file;
//   B  every derived-pill expression (`x / 2`) and off-ladder literal at a call site is named by ROLE instead, so the
//      coercion in A snaps it to `full` rather than to the nearest small step;
//   C  a residual scan prints any radius argument still not going through the ladder, so nothing is silently missed.
// Idempotent: a rule that matches 0 times is reported as already-applied; an `expect` count that disagrees throws.
// Run with:  node tools/radius_sweep.js          (apply)
//            node tools/radius_sweep.js --dry    (report only)
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const CF = 'skills/penpot-design/scripts/component_factory.js';
const NL = 'skills/penpot-design/scripts/native_layout.js';
const SS = 'skills/penpot-design/scripts/seed_storage.js';

const RULES = [
  [CF, [
    // ---- A · the four writers inside CF + the bubble path
    { from: "sh.borderRadius = o.shape === 'ellipse' ? 0 : (o.radius || 0);",
      to: "sh.borderRadius = o.shape === 'ellipse' ? 0 : RZ(o.radius);", expect: 1 },
    { from: "var off = o.offset === undefined ? 2 : o.offset, w = o.width || 2, r = (o.radius === undefined ? 8 : o.radius) + off;",
      to: "var off = o.offset === undefined ? 2 : o.offset, w = o.width || 2, r = RZ(o.radius === undefined ? 'sm' : o.radius);", expect: 1 },
    // a ring is drawn OUTSIDE the host, so its corner must be the host's LADDER step, not host+2 (which would be an
    // orphan 28 around a 26 card, or 18 around a pill). The renderer clamps an over-large radius itself.
    { from: "var ir = Math.min(r, Math.round(Math.min(iw.w, iw.h) / 2));", to: "var ir = r;", expect: 1 },
    { from: "      r = Math.min(r, Math.round(Math.min(rb.w, rb.h) / 2));\n", to: "", expect: 1 },
    { from: "var c = storage.mkAbsBoard(o.name || ('clip·' + (++this._n)), box.x, box.y, box.w, box.h, o.fill || null, o.radius || 0);",
      to: "var c = storage.mkAbsBoard(o.name || ('clip·' + (++this._n)), box.x, box.y, box.w, box.h, o.fill || null, RZ(o.radius));", expect: 1 },
    { from: "ctx.host = storage.mkAbsBoard(name, box.x, box.y, box.w, box.h, o.fill === undefined ? null : o.fill, o.radius || 0);",
      to: "ctx.host = storage.mkAbsBoard(name, box.x, box.y, box.w, box.h, o.fill === undefined ? null : o.fill, RZ(o.radius));", expect: 1 },
    // bubble is PATH geometry (it draws its own arcs), so the clamp stays — but the value it clamps is the ladder's.
    { from: "var r = min(o.radius === undefined ? 8 : o.radius, w / 2, h / 2);",
      to: "var r = min(RZ(o.radius === undefined ? 'card' : o.radius), w / 2, h / 2);", expect: 1 },

    // ---- B · derived pills: the arithmetic that used to mint one-off radii now names the CONTROL role
    { from: "radius: L.radius + 4", to: "radius: 'control'", expect: 2 },
    { from: "var rad = o.shape === 'square' ? 0 : (round ? (iconOnly ? w / 2 : w / 2) : L.radius);",
      to: "var rad = o.shape === 'square' ? 0 : CF.radius('control');", expect: 1 },
    { from: "{ radius: o.shape === 'circle' ? final.w / 2 : L2r(o.size), color: C('primary') }",
      to: "{ radius: o.shape === 'circle' ? 'control' : L2r(o.size), color: C('primary') }", expect: 1 },
    { from: "{ parent: o.parent, radius: d / 2 }", to: "{ parent: o.parent, radius: 'control' }", expect: 1 },
    { from: "{ radius: ctx.host.height / 2 }", to: "{ radius: 'control' }", expect: 1 },
    { from: "strokeW: 1, radius: cb.h / 2 }", to: "strokeW: 1, radius: 'control' }", expect: 1 },
    { from: "ctx.host.borderRadius = h / 2;", to: "ctx.host.borderRadius = CF.radius('control');", expect: 1 },
    { from: "{ parent: o.parent, radius: kind === 'tag' ? CF.radius('sm') : h / 2 }",
      to: "{ parent: o.parent, radius: kind === 'tag' ? 'sm' : 'control' }", expect: 1 },
    { from: "ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: h / 2 });",
      to: "ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: 'control' });", expect: 1 },
    { from: "radius: o.shape === 'square' ? 0 : (o.shape === 'rounded' ? CF.radius('md') : s / 2), clip: s < 999 }",
      to: "radius: o.shape === 'square' ? 'none' : (o.shape === 'rounded' ? 'sm' : 'control'), clip: s < 999 }", expect: 1 },
    { from: "ctx.ring(box, { radius: box._r || s / 2, offset: 2, width: 2 });",
      to: "ctx.ring(box, { radius: 'control', offset: 2, width: 2 });", expect: 1 },
    { from: "{ parent: o.parent, radius: rail ? h / 2 : CF.radius('md') }",
      to: "{ parent: o.parent, radius: rail ? 'control' : 'md' }", expect: 1 },
    { from: "{ parent: o.parent, radius: type === 'pill' ? h / 2 : (type === 'card' ? CF.radius('sm') : 0) }",
      to: "{ parent: o.parent, radius: type === 'pill' ? 'control' : (type === 'card' ? 'sm' : 'none') }", expect: 1 },
    { from: "ctx.ring(rb, { radius: rs / 2 });", to: "ctx.ring(rb, { radius: 'control' });", expect: 1 },
    { from: "ctx.ring(B(b.x - 10, b.y - 10, hs + 20, hs + 20), { offset: 0, radius: (hs + 20) / 2, color: C('primary') });",
      to: "ctx.ring(B(b.x - 10, b.y - 10, hs + 20, hs + 20), { offset: 0, radius: 'control', color: C('primary') });", expect: 1 },
    { from: "ctx.ring(focusBox, { radius: (focusBox.w || 32) / 2 });",
      to: "ctx.ring(focusBox, { radius: 'control' });", expect: 1 },
    // regex: the remaining `x / 2` pill arguments (switch/slider/progress tracks, avatar + calendar circles)
    { re: /radius: [A-Za-z_$][\w.$]*(?:\.[A-Za-z_$][\w.$]*)* \/ 2(?=\s*[,}\)])/g, to: "radius: 'control'", expect: -1 },
    // circle-ish literals that are really pills: 16 on a 32px day, 20 on a 40px state layer, 9/13 on an 18px count
    { re: /radius: (16|20|9|13)(?=\s*[,}\)])/g, to: "radius: 'control'", expect: -1 },
    // every remaining literal is a small mark: name the nearest ladder step instead of writing the number
    { re: /radius: (?:0(?=\s*[,}\)]))/g, to: "radius: 'none'", expect: -1 },
    { re: /radius: (?:1|1\.5|2|3|4|5)(?=\s*[,}\)])/g, to: "radius: 'xs'", expect: -1 },
    { re: /radius: (?:6|7|8)(?=\s*[,}\)])/g, to: "radius: 'sm'", expect: -1 },
    { re: /radius: (?:12)(?=\s*[,}\)])/g, to: "radius: 'sm'", expect: -1 },
  ]],
  [NL, [
    { from: "if (o.radius) b.borderRadius = o.radius;",
      to: "if (o.radius) b.borderRadius = storage.CF.radius(o.radius);", expect: 2 },
    { from: "if (o.radius && r.borderRadius !== undefined) r.borderRadius = o.radius;",
      to: "if (o.radius && r.borderRadius !== undefined) r.borderRadius = storage.CF.radius(o.radius);", expect: 1 },
    { re: /radius: o\.radius \|\| 0,/g, to: "radius: o.radius || 'none',", expect: -1 },
  ]],
  [SS, [
    { from: "b.borderRadius = radius || 0;",
      to: "b.borderRadius = storage.CF ? storage.CF.radius(radius === undefined ? 0 : radius) : (radius || 0);", expect: 1 },
    { from: "r.borderRadius = radius || 0;",
      to: "r.borderRadius = storage.CF ? storage.CF.radius(radius === undefined ? 0 : radius) : (radius || 0);", expect: 1 },
  ]],
];

// stage C: anything that still writes a radius without going through the ladder
let applied = 0;
for (const [rel, edits] of RULES) {
  const file = path.join(root, rel);
  let src = fs.readFileSync(file, 'utf8');
  for (const e of edits) {
    const label = (e.from || e.re).toString().slice(0, 72);
    const hits = e.re ? (src.match(e.re) || []).length : src.split(e.from).length - 1;
    if (hits) {
      if (e.expect >= 0 && hits !== e.expect) throw new Error(rel + ': expected ' + e.expect + ' hit(s), found ' + hits + ' for ' + label);
      src = e.re ? src.replace(e.re, e.to) : src.split(e.from).join(e.to);
      applied += hits;
      continue;
    }
    // nothing matched: acceptable only when the rule has ALREADY been applied, so a stale rule can never no-op silently
    if (!e.re && !src.includes(e.to)) throw new Error(rel + ': rule matched nothing and its replacement is absent — ' + label);
  }
  if (!DRY) fs.writeFileSync(file, src);
}

const bad = [];
for (const rel of [CF, NL, SS]) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  src.split('\n').forEach(function (line, i) {
    if (!/\bradius\b|\bborderRadius\b/.test(line)) return;
    if (/RAD|ROLE|TOKEN_OF|VALUE_OF|CF\.radius\b|radiusToken|radiusSteps|\bRZ\b|L2r|CF\.ladder|\/\/|^\s*\*/.test(line)) return;
    const m = line.match(/\b(?:radius|borderRadius)(?::|\s*=)\s*([^,;{}\n]*)/g);
    if (!m) return;
    m.forEach(function (seg) {
      const val = seg.split(/[:=]/).slice(1).join('=').trim();
      if (!val || /^'?(none|xs|sm|md|lg|xl|full|control|box|tile|badge|card|field|panel|slab|inverse|hero|flat|host|card)'?/.test(val)) return;
      if (/^'(radius\.|none|xs|sm|md|lg|xl|full|control|box|card|tile|badge|field|panel|slab|inverse|hero|flat)/.test(val)) return;
      bad.push(rel + ':' + (i + 1) + '  ' + seg.trim());
    });
  });
}

console.log((DRY ? 'dry: ' : '') + applied + ' replacements applied');
console.log('residual radius arguments not routed through the ladder (' + bad.length + '):');
bad.forEach(function (b) { console.log('  ' + b); });
