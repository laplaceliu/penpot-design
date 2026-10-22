// component_factory.js — storage.CF: every component variant in component-library.md, produced from numbers.
//
// WHY THIS FILE EXISTS: the component-library §3 tables say what a control must contain; this file makes those
// numbers executable, so a spec board is never "one resting rectangle" again. Each `CF.*` factory returns exactly
// ONE host shape with every layer mounted inside it (gate G12 / §0.3 assembly ownership) and takes its geometry
// from `CF.ladder()` (§2), `CF.STATE` (§1.1) and `LY.slots.*` (§F chrome) — never from a typed-in coordinate.
//
// Usage: seed_storage.js → layout_engine.js → this file, once per session (storage is volatile).
//   const b = await storage.CF.button({ x: 80, y: 240, label: 'Save', type: 'primary', size: 'md', state: 'hover' });
//   const p = await storage.CF.matrix('Button', { x: 80, y: 240 });   // whole variant×state spec board
//
// HARD rules this file encodes:
//  · **Place at final coordinates at build time.** Assigning x/y to a built board does not carry its absolute
//    children (api-pitfalls §10 / §12.2) — every factory takes o.x/o.y. `CF.move()` exists for the rare bulk move
//    and compensates the whole subtree itself.
//  · Text width/height is transient at creation (api-pitfalls §5): labels are created, `await ctx.settle()`
//    measures them once, then `ctx.place()` centers by real width. No `(w-1)/2` stale-center can survive here.
//  · State is a **tint over the same base color** (§1.2) — `CF.fills()` never invents a hover hex.
//  · Focus is its own 2px ring layer at 2px offset, never a 1px border recolor (WCAG 2.4.11, §1.1 HARD).
//  · `path.d` is in **world coordinates** and SVG `A` does not render (api-pitfalls §2) — arcs come from `CF.arc()`
//    (cubic bezier) and glyph paths are generated already translated.
//  · Closed shapes stroke `'inner'`, open paths `'center'` (api-pitfalls §3).

return (function () {
  if (!storage.mkAbsBoard || !storage.absMount) return { err: 'run seed_storage.js first' };
  var LY = storage.LY || null;
  var T = storage.T || {};

  // ---------------------------------------------------------------- palette (DESIGN.md overrides via CF.theme)
  var P = {
    primary: T.primary || '#2563EB', onPrimary: T.onPrimary || '#FFFFFF',
    ink: T.onSurface || '#0F172A', surface: T.surface || '#FFFFFF',
    surfaceAlt: T.neutral || '#F8FAFC', muted: T.secondary || '#475569',
    border: T.border || '#E2E8F0', borderStrong: '#CBD5E1',
    error: T.error || '#DC2626', success: T.success || '#16A34A',
    warning: T.warning || '#D97706', info: T.info || '#0284C7',
    // soft tint pairs (§4.1 triple): the wash is the background the matching `*Ink` copy sits on.
    primarySoft: T.primarySoft || '#DBEAFE', infoSoft: T.infoSoft || '#E0F2FE', successSoft: T.successSoft || '#DCFCE7',
    warningSoft: T.warningSoft || '#FEF3C7', errorSoft: T.errorSoft || '#FEE2E2',
    // the dark step of each tone (§4 ramp, 7–8 level): the ONLY tone allowed to carry copy — text on a `*Soft`
    // wash (6.4–7.2:1) and the surface under white copy (7.1–8.7:1). The 6-level base above is for graphics.
    primaryInk: T.primaryInk || '#1E40AF', infoInk: T.infoInk || '#075985', successInk: T.successInk || '#166534',
    warningInk: T.warningInk || '#92400E', errorInk: T.errorInk || '#991B1B',
    // §4.1 on an ink surface the *muted* step has to lift: #585858 on #161616 reads 2.54:1, so a shell that wants a
    // quieter group label must use a lighter grey, not a lower opacity (which the audit treats as a state layer).
    mutedOnInk: T.mutedOnInk || '#A3A3A3',
    line: '#0F172A'
  };
  var CF = {};
  CF.P = P;
  CF.theme = function (map) { Object.assign(P, map || {}); C._res = null; return Object.keys(P).length; };

  // ---------------------------------------------------------------- brand copy for shell previews
  /** Product name the shell factories print when the caller passes no `name`. Set it once per design system
      (`CF.brandName = DESIGN.name`); a shared kit must not ship a sample product's name as a silent default. */
  CF.brandName = 'Brand';
  CF.brandLegal = function () { return '© ' + new Date().getFullYear() + ' ' + CF.brandName + ' · Privacy · Terms · Status'; };

  // ---------------------------------------------------------------- §1.1 state model
  CF.STATE = { hover: 0.08, focus: 0.12, pressed: 0.12, dragged: 0.16, selected: 0.12,
               disabledContainer: 0.12, disabledContent: 0.38 };
  CF.AXES = ['default', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'loading'];

  // ---------------------------------------------------------------- §1.3 the two focus expressions
  // A focus indicator is HARD (§1.1, WCAG 2.4.7) — the state must be perceivable. Its FORM is not fixed, and the choice
  // is made once here so no factory decides it locally:
  //   `outline`  — the keyboard lands ON a plate the control owns (a button, a field, a checkbox, one OTP digit, one
  //                page cell). The ring is drawn TIGHT on that unit: 2px, ≥3:1 against the surface, the unit's corner.
  //   `reserved` — the control is a COMPOSITION whose rows/nodes are bands of copy with no plate of their own (a step
  //                timeline, a menu, an anchor rail, a table row, an accordion header). A rectangle around such a band
  //                reads as a crop mark, so the boundary is authored but painted at alpha 0: the slot, the 2px width and
  //                the corner all exist in the layer tree (a runtime only has to raise the alpha), and what the eye
  //                reads is the 12% brand state wash on the focused unit — the same layer hover/selected use (§1.2).
  // `audit_design` rule 44 (`focus_invisible`) is what keeps `reserved` honest: a near-zero-alpha boundary with no
  // visible wash in the same control is a HARD finding, so an invisible box can never satisfy the focus gate.
  CF.FOCUS = {
    reserved: /^(Steps|Anchor|Menu|Breadcrumb|Tree|Table|TableRow|TableHeader|TableState|Accordion|ListItem|Descriptions|Transfer|MiniCalendar|CommandPalette)(·|$)/,
    wash: CF.STATE.focus, ghost: 0
  };
  CF.focusRole = function (nm) { return CF.FOCUS.reserved.test(String(nm || '')) ? 'reserved' : 'outline'; };

  // ---------------------------------------------------------------- §6 touch floor
  /** The tier the page builder is currently drawing for. Set it once per screen (`CF.tier = 'mobile'`) before calling
      the factories: it drives the invisible hit pads, so the same factory output meets 32 on web and 44 on touch. */
  CF.tier = 'web';
  CF.minHit = function () { var t = LY && LY.TIERS[CF.tier]; return t ? t.touch : 32; };
  /** Families a person aims at with a pointer or a finger. Display widgets (badge, tooltip, kpi) get no pad. */
  var TOUCHY = /^(Button|IconButton|ButtonGroup|SplitButton|FAB|Link|Segmented|Switch|Checkbox|Radio|Slider|Rating|ColorPicker|Pagination|Steps|Anchor|Breadcrumb|Menu|Tabs|NavItem|Chip|Upload|Transfer|Tree|Input|Textarea|Search|Password|MaskedInput|NumberField|OTP|Select|MultiSelect|Combobox|DatePicker|TimePicker|Field|TableRow|ListItem|Accordion|MiniCalendar)(·|$)/;
  CF.interactive = function (nm) { return TOUCHY.test(String(nm || '')); };

  /** fills for a surface in a given state: base + overlay tint, never a new hex (§1.2).
      On a dark brand fill the state overlay is a **shade**, not M3's white overlay: white 8% over #2563EB lifts it to
      #3F76ED, where a white label falls to 4.18:1 and breaks §3.3. Darkening keeps both rules true (Fluent's brand
      hover is a darker step too). Disabled keeps the lightening overlay — a disabled control should recede. */
  CF.fills = function (bg, state, o) {
    o = o || {};
    // `tint`: bg is not a surface to paint, it is the hue to wash with. A selected row/option/card is a 12% wash of the
    // brand, never solid brand — otherwise its own label drops to 2.9:1 and §3.3 breaks at the factory.
    if (o.tint) return [{ fillColor: bg || P.primary, fillOpacity: CF.STATE[state] === undefined ? CF.STATE.selected : CF.STATE[state] }];
    var f = [];
    if (bg) f.push({ fillColor: bg, fillOpacity: 1 });
    var overlay = o.onDark && state !== 'disabled' ? '#000000' : (o.onDark ? '#FFFFFF' : (o.overlay || P.ink));
    if (state === 'disabled') f.push({ fillColor: overlay, fillOpacity: CF.STATE.disabledContainer });
    else if (state && CF.STATE[state] !== undefined) f.push({ fillColor: overlay, fillOpacity: CF.STATE[state] });
    return f;
  };
  CF.inkAlpha = function (state, base) {
    base = base === undefined ? 1 : base;
    return state === 'disabled' ? CF.STATE.disabledContent : (state === 'placeholder' ? base * 0.6 : base);
  };

  // ---------------------------------------------------------------- §2 geometry ladder
  // `radius` is the CONTROL role: every control of one system takes the same corner token at every size, because the
  // size axis changes height, type and padding, not the shape. Which step that is (a pill, a 3px rectangle, anything
  // else) is the source ladder's decision, recorded in ROLE below. A factory that needs a different corner (a checkbox
  // box, a card) asks for that ROLE, not for `L.radius`.
  var LADDER = {
    xs:   { h: 24, fs: 12, padX: 8,  icon: 16, radius: 'control', gap: 4 },
    sm:   { h: 28, fs: 13, padX: 12, icon: 16, radius: 'control', gap: 6 },
    md:   { h: 32, fs: 14, padX: 12, icon: 18, radius: 'control', gap: 8 },
    lg:   { h: 40, fs: 14, padX: 16, icon: 20, radius: 'control', gap: 8 },
    xl:   { h: 48, fs: 16, padX: 24, icon: 20, radius: 'control', gap: 8 },
    '2xl':{ h: 56, fs: 16, padX: 24, icon: 24, radius: 'control', gap: 12 }
  };
  var ICONSQ = { xs: { s: 28, icon: 16 }, sm: { s: 28, icon: 16 }, md: { s: 40, icon: 24 },
                 lg: { s: 40, icon: 24 }, xl: { s: 52, icon: 28 }, '2xl': { s: 52, icon: 28 } };
  CF.ladder = function (size) {
    var k = LADDER[size] ? size : 'md';
    var out = Object.assign({ key: k }, LADDER[k]);
    return out;
  };
  /** A count sits one step under its label, but §3.2 puts the floor of readable copy at 12 — never a 10px badge. */
  CF.countFs = function (L) { return Math.max(12, (L ? L.fs : 14) - 2); };
  CF.sizes = Object.keys(LADDER);
  CF.iconSquare = function (size) { return (ICONSQ[size] || ICONSQ.md).s; };
  CF.iconInSquare = function (size) { return (ICONSQ[size] || ICONSQ.md).icon; };

  // elevation → Penpot shadow objects (color MUST be an object, string hex silently turns black)
  var ELEV = [null, { y: 1, b: 2, o: 0.06 }, { y: 2, b: 4, o: 0.08 }, { y: 6, b: 16, o: 0.12 },
              { y: 12, b: 28, o: 0.18 }, { y: 20, b: 44, o: 0.26 }];
  CF.ELEV = ELEV;
  CF.shadow = function (level) {
    if (!level) return [];
    var e = ELEV[Math.min(5, Math.max(1, level))] || ELEV[1];
    return [{ style: 'drop-shadow', offsetX: 0, offsetY: e.y, blur: e.b, spread: 0,
             color: { color: P.ink, opacity: e.o } }];
  };
  // ---------------------------------------------------------------- §2.1 radius = the token ladder, and nothing else
  // The ladder is the source site's own `border-radius` steps (DESIGN.md §Shapes), measured off its stylesheet and
  // nothing else: `0` (flat bands and section plates), `2` (small inner boxes), `3` (the dominant control step —
  // buttons, tags, chips, segmented nav), `5` (the dominant surface step — cards, work items, image plates, hero
  // cards) and `100` (dots, ornaments and avatars — the circle step).
  // `full` (9999) is the pill the radius FORGE needs and a source may not declare: `TK.radiusFor` reads it to bind a
  // corner that is `min(w,h)/2` or larger, and the renderer clamps it to a clean pill (measured 2026-10-21: a 320×32
  // and a 320×8 at 9999 both export as clean pills). It is a forge affordance, labelled as such — every DRAWN corner
  // in this file comes from the five source steps above.
  var RAD = { none: 0, xs: 2, sm: 3, md: 5, lg: 100, full: 9999 };
  CF.RAD = RAD;
  // role → ladder key. A factory asks for the ROLE it is drawing; the number and the token name both come from here,
  // so "which radius is legal where" has exactly one answer in the file.
  // The default ladder's controls are 3px RECTANGLES, not pills: `control` is `sm`, and `TK.CONTROL_FAMS`'s repair pass reads
  // `CF.radius('control')`, so the sweep and the factories agree on the same number.
  // A background plate (a spec sheet, a modal, a command palette) holds a GROUP; it is not a control and not a card.
  // It defaults to square because a large corner CLIPS the group at the plate's own corners — measured 2026-10-22 on
  // `FAB·Spec`, where the ladder's `lg` (the source's 100px avatar/pill step) cut the corner cells. Rounding belongs to
  // controls and cards; `spec` is the plate role, and audit_design rule 42 (`plate_rounded`) gates it.
  var ROLE = { control: 'sm', box: 'xs', tile: 'sm', badge: 'sm', card: 'md', field: 'md', panel: 'md',
               spec: 'none', slab: 'none', inverse: 'none', hero: 'md', flat: 'none', ring: 'host', clip: 'host' };
  CF.ROLE = ROLE;
  var TOKEN_OF = { none: 'radius.none', xs: 'radius.xs', sm: 'radius.sm', md: 'radius.md', lg: 'radius.lg',
                   full: 'radius.full' };
  var VALUE_OF = { 0: 'radius.none', 2: 'radius.xs', 3: 'radius.sm', 5: 'radius.md', 100: 'radius.lg',
                   9999: 'radius.full' };
  /** The token name a radius value belongs to, read from the LIVE set when the token engine is seeded (so a file that
      renamed its ladder still resolves), falling back to the table above. null = the value is not the ladder. */
  CF.radiusToken = function (v) {
    var n = Math.round(Number(v) * 100) / 100;
    if (storage.TK && storage.TK.declared) {
      var r = storage.TK.declared().radii;
      for (var i = 0; i < r.length; i++) if (Math.abs(r[i].value - n) < 0.05) return r[i].name;
      return null;
    }
    return VALUE_OF[n] || null;
  };
  /** Ask for a radius by role or by ladder key; anything else is COERCED to the nearest ladder step and recorded, so
      no factory can emit an orphan number. `CF.coerced` is the build-time report of what asked to be off-ladder. */
  CF.coerced = [];
  CF.radius = function (key) {
    if (key === 'host' || key === null || key === undefined) return null;
    if (typeof key === 'number') {
      var t = CF.radiusToken(key);
      if (t) return key;
      var steps = Object.keys(RAD).map(function (k) { return RAD[k]; }).sort(function (a, b) { return a - b; });
      var best = steps[0];
      steps.forEach(function (s) { if (Math.abs(s - key) < Math.abs(best - key)) best = s; });
      CF.coerced.push({ from: key, to: best });
      return best;
    }
    var k = String(key);
    if (ROLE[k]) k = ROLE[k];
    if (RAD[k] !== undefined) return RAD[k];
    if (/^radius\./.test(k)) { var kk = k.slice(7); if (RAD[kk] !== undefined) return RAD[kk]; }
    return CF.radius(Number(k));
  };
  /** The token name for the same question `CF.radius` answers with a number — the binder's input. */
  CF.radiusTokenFor = function (key) { return CF.radiusToken(CF.radius(key)); };
  CF.radiusSteps = function () { return Object.keys(RAD).map(function (k) { return { key: k, value: RAD[k], token: TOKEN_OF[k] }; }); };
  /** The one way a shape's `borderRadius` gets written: undefined/null is the FLAT step (0), never an orphan number. */
  var RZ = function (v) { return (v === undefined || v === null) ? 0 : CF.radius(v); };

  /** Readable ink for a filled surface, from its relative luminance: a wash or a pale tone takes the dark ink,
      only a genuinely dark surface takes white. Hardcoding #FFFFFF is what makes a lime cover fail §4. */
  CF.onTone = function (fill) {
    var h = String(C(fill, fill) || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    if (h.length !== 6 || !Number.isFinite(v)) return C('ink');
    var c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(function (x) {
      var s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) >= 0.20 ? C('ink') : '#FFFFFF';
  };

  // ---------------------------------------------------------------- math helpers
  CF._warn = [];
  function warn(m) { CF._warn.push(m); }
  CF.warnings = function () { return CF._warn.slice(); }
  var N = function (v) { return Math.round(v); };
  /** Ceil onto the 4px grid. Used wherever CF *grows* a box: rounding a derived length can leave an edge off-grid,
      and design-guide §1 forbids that. Excess becomes invisible trailing padding. */
  var C4 = function (v) { return Math.ceil(Math.max(0, v) / 4) * 4; };
  var B = function (x, y, w, h) {
    if (!Number.isFinite(w) || w < 1) { warn('CF width ' + w + ' clamped to 1'); w = Math.max(1, w || 1); }
    if (!Number.isFinite(h) || h < 1) { warn('CF height ' + h + ' clamped to 1'); h = Math.max(1, h || 1); }
    return { x: N(x), y: N(y), w: N(w), h: N(h) };
  };
  CF.B = B;
  /** greedy word wrap into at most maxW px lines (used wherever copy can outgrow a panel). */
  CF.wrap = function (str, maxW, fs) {
    var words = String(str === undefined ? '' : str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (wd) {
      var t = cur ? cur + ' ' + wd : wd;
      if (CF.estW(t, fs) > maxW && cur) { lines.push(cur); cur = wd; } else { cur = t; }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };
  var min = function () { return Math.min.apply(null, Array.prototype.slice.call(arguments)); };
  var max = function () { return Math.max.apply(null, Array.prototype.slice.call(arguments)); };

  /** Label width estimate (Nunito ~0.52em latin, CJK 1em) — used to size a control BEFORE the text is measured. */
  CF.estW = function (str, fs) {
    var s = String(str === undefined ? '' : str), w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), ch = s[i];
      if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef)) w += fs;
      else if (ch >= '0' && ch <= '9') w += fs * 0.62;
      else if (ch >= 'A' && ch <= 'Z') w += fs * 0.66;
      else if ('ilj.,;:\'\`- |!()[]{}'.indexOf(ch) >= 0) w += fs * 0.3;
      else w += fs * 0.52;
    }
    return Math.round(w);
  };

  /** Width a beside-control label needs: gap + the estimate + 4. estW is a metric estimate, not a measurement, and a
      host sized to the bare estimate lets the rendered run escape its right edge by ~2px (audit S2 out_of_bounds). */
  CF.labelW = function (text, fs, gap) { return CF.estW(String(text), fs || 14) + (gap === undefined ? 8 : gap) + 4; };

  /** The vertical twin of `labelW`: the rendered line-box height of a ramp step, read from the step's OWN leading.
      A factory that stacks labels must reserve `lineH(fs)`, never `fs`: `mkText` writes the token's leading onto the
      layer (body 1.5, display 1.15), so a box measured in em is a third short (measured 2026-10-20 on Steps·Bottom:
      reserved 78, two label lines render 82 → `out_of_bounds`, and a caption that escapes its host is the same defect
      that makes a tall control sit on top of the row below it). */
  CF.lineH = function (fs, weight, family) {
    var lh = 1.5;
    try {
      if (storage.TK && storage.TK.snapType) {
        var st = storage.TK.snapType(family || (storage.T && storage.T.bodyFont) || 'Funnel Sans', fs, weight || 400, null);
        if (st && st.leading) lh = st.leading;
      }
    } catch (e) {}
    return Math.ceil(Number(fs) * lh);
  };

  /** arc → cubic bezier, degrees, y-down. SVG `A` does not render in Penpot paths. */
  CF.arc = function (cx, cy, r, a0deg, a1deg) {
    var segs = max(1, Math.ceil(Math.abs(a1deg - a0deg) / 90));
    var a0 = a0deg * Math.PI / 180, total = (a1deg - a0deg) * Math.PI / 180;
    var f = function (v) { return v.toFixed(2); };
    var d = 'M ' + f(cx + r * Math.cos(a0)) + ' ' + f(cy + r * Math.sin(a0));
    var prev = a0;
    for (var i = 1; i <= segs; i++) {
      var next = a0 + total * i / segs;
      var k = 4 / 3 * Math.tan((next - prev) / 4);
      var p0x = cx + r * Math.cos(prev), p0y = cy + r * Math.sin(prev);
      var p1x = cx + r * Math.cos(next), p1y = cy + r * Math.sin(next);
      d += ' C ' + f(p0x - k * r * Math.sin(prev)) + ' ' + f(p0y + k * r * Math.cos(prev)) +
        ' ' + f(p1x + k * r * Math.sin(next)) + ' ' + f(p1y - k * r * Math.cos(next)) +
        ' ' + f(p1x) + ' ' + f(p1y);
      prev = next;
    }
    return d;
  };
  var circleD = function (cx, cy, r) {
    var k = 0.5523 * r, f = function (v) { return v.toFixed(2); };
    return 'M ' + f(cx + r) + ' ' + f(cy) +
      ' C ' + f(cx + r) + ' ' + f(cy + k) + ' ' + f(cx + k) + ' ' + f(cy + r) + ' ' + f(cx) + ' ' + f(cy + r) +
      ' C ' + f(cx - k) + ' ' + f(cy + r) + ' ' + f(cx - r) + ' ' + f(cy + k) + ' ' + f(cx - r) + ' ' + f(cy) +
      ' C ' + f(cx - r) + ' ' + f(cy - k) + ' ' + f(cx - k) + ' ' + f(cy - r) + ' ' + f(cx) + ' ' + f(cy - r) +
      ' C ' + f(cx + k) + ' ' + f(cy - r) + ' ' + f(cx + r) + ' ' + f(cy - k) + ' ' + f(cx + r) + ' ' + f(cy) + ' Z';
  };
  CF.circleD = circleD;

  /** Rounded panel + V-shaped arrow in ONE continuous path (api-pitfalls §2: never a rotated square against the edge). */
  CF.bubble = function (box, o) {
    o = o || {};
    var x = box.x, y = box.y, w = box.w, h = box.h;
    var r = min(RZ(o.radius === undefined ? 'card' : o.radius), w / 2, h / 2);
    var f = function (v) { return v.toFixed(1); };
    var C = function (p1x, p1y, p2x, p2y, px, py) { return ' C ' + f(p1x) + ' ' + f(p1y) + ' ' + f(p2x) + ' ' + f(p2y) + ' ' + f(px) + ' ' + f(py); };
    var L = function (px, py) { return ' L ' + f(px) + ' ' + f(py); };
    var ar = o.arrow, aw = ar && (ar.size || 12), ah = ar && (ar.depth || 6);
    var at = ar ? ar.at : 0;
    var d = 'M ' + f(x + r) + ' ' + f(y);
    // top edge (left→right)
    var topArrow = ar && ar.side === 'top';
    d += L(x + w - r, y);
    d += C(x + w - r + 0.5523 * r, y, x + w, y + r - 0.5523 * r, x + w, y + r);
    // right edge (top→bottom)
    var rightArrow = ar && ar.side === 'right';
    if (rightArrow) { d += L(x + w, at - aw / 2); d += L(x + w + ah, at); d += L(x + w, at + aw / 2); }
    d += L(x + w, y + h - r);
    d += C(x + w, y + h - r + 0.5523 * r, x + w - r + 0.5523 * r, y + h, x + w - r, y + h);
    // bottom edge (right→left)
    var bottomArrow = ar && ar.side === 'bottom';
    if (bottomArrow) { d += L(at + aw / 2, y + h); d += L(at, y + h + ah); d += L(at - aw / 2, y + h); }
    d += L(x + r, y + h);
    d += C(x + r - 0.5523 * r, y + h, x, y + h - r + 0.5523 * r, x, y + h - r);
    // left edge (bottom→top)
    var leftArrow = ar && ar.side === 'left';
    if (leftArrow) { d += L(x, at + aw / 2); d += L(x - ah, at); d += L(x, at - aw / 2); }
    if (topArrow) { d += L(x + r, y); d += L(at + aw / 2, y); d += L(at, y - ah); d += L(at - aw / 2, y); }
    else d += L(x, y + r);
    d += C(x, y + r - 0.5523 * r, x + r - 0.5523 * r, y, x + r, y);
    return d + ' Z';
  };

  // ---------------------------------------------------------------- naming (§0.4, G12)
  var CAP = { default: 'Default', hover: 'Hover', focus: 'Focus', pressed: 'Pressed', selected: 'Selected',
              disabled: 'Disabled', loading: 'Loading', error: 'Error', success: 'Success', warning: 'Warning',
              readonly: 'Readonly', filled: 'Filled', open: 'Open', closed: 'Closed', checked: 'Checked',
              unchecked: 'Unchecked', indeterminate: 'Indeterminate', on: 'On', off: 'Off', active: 'Active' };
  var cap = function (v) { if (v === undefined || v === null) return null; var s = String(v); return CAP[s] || (s.charAt(0).toUpperCase() + s.slice(1)); };
  /** `Button·Primary·Md·Hover` — '/' is illegal in a component name (silently fails), so everything joins with '·'. */
  CF.name = function (family, o) {
    o = o || {};
    var parts = [family];
    ['type', 'size', 'state', 'slot', 'variant', 'tone', 'extra'].forEach(function (k) {
      var v = o[k];
      if (v === undefined || v === null || v === false || v === 'default') return;
      parts.push(v === true ? cap(k) : (String(v).length <= 2 ? String(v).toUpperCase() : cap(v)));
    });
    return parts.join('·').replace(/[\/\n]/g, '-');
  };
  /** The raster-slot grammar, in ONE place: `media_engine.js` (MD.isSlot) and the auditor's `placeholder_media` rule
      must agree, or a plate can be a slot for one and invisible to the other. A slot is a shape that *claims* to hold
      a source image, so on a screen page a slot without an image fill is a defect (gate G17), not a style choice. */
  CF.isMediaSlot = function (name) {
    return /^(img·|image·|media$|media·|thumb$|thumb·|photo|hero·media|cover·|avatar·|og:)/i.test(String(name || ''));
  };
  CF.props = function (o) {    return { Type: cap(o.type) || 'Default', Size: cap(o.size) || 'Md',
             State: cap(o.state) || 'Default', Slot: cap(o.slot) || 'None' };
  };
  /** Shrink a box by `w` on every side. Any plate drawn *over* a bordered box (state layer, label tint, selection
      fill) must use this: Penpot paints a shape's own stroke under its children, so a flush overlay covers the
      1px border for its whole length and the control reads as "border missing on three sides". */
  CF.inset = function (box, w) {
    w = w === undefined ? 1 : w;
    return B(box.x + w, box.y + w, max(0, box.w - w * 2), max(0, box.h - w * 2));
  };

  // ---------------------------------------------------------------- builder context
  var ctxProto = {
    _stroke: function (sh, color, w, alpha) {
      sh.strokes = [{ strokeColor: color, strokeOpacity: alpha === undefined ? 1 : alpha,
                      strokeWidth: w || 1, strokeAlignment: 'inner', strokeStyle: 'solid' }];
      return sh;
    },
    /** closed plate: rect (or ellipse) with fill/radius/stroke/shadow, mounted absolute at its world box. */
    plate: function (box, o) {
      o = o || {};
      box = B(box.x, box.y, box.w, box.h);
      var sh = o.shape === 'ellipse' ? penpot.createEllipse() : penpot.createRectangle();
      sh.name = o.name || ('plate·' + (++this._n));
      sh.x = box.x; sh.y = box.y;
      try { sh.resize(box.w, box.h); } catch (e) {}
      sh.borderRadius = o.shape === 'ellipse' ? 0 : RZ(o.radius);
      sh.fills = o.fills || (o.fill ? [{ fillColor: o.fill, fillOpacity: o.opacity === undefined ? 1 : o.opacity }] : []);
      if (o.stroke) this._stroke(sh, o.stroke, o.strokeW || 1, o.strokeOpacity);
      if (o.dashed && o.stroke) sh.strokes = [Object.assign({}, sh.strokes[0], { strokeStyle: 'dashed' })];
      if (o.shadow) sh.shadows = CF.shadow(o.shadow);
      this.add(sh, box);
      return sh;
    },
    ellipse: function (box, o) { return this.plate(box, Object.assign({ shape: 'ellipse' }, o || {})); },
    /** open/closed path. `d` MUST already be world coordinates (api-pitfalls §2). */
    path: function (d, o) {
      o = o || {};
      var p = penpot.createPath();
      p.name = o.name || ('path·' + (++this._n));
      try { p.d = d; } catch (e) { warn('CF path.d rejected: ' + (o.name || 'path')); return null; }
      p.fills = o.fill ? [{ fillColor: o.fill, fillOpacity: o.opacity === undefined ? 1 : o.opacity }] : [];
      if (o.stroke) {
        p.strokes = [{ strokeColor: o.stroke, strokeOpacity: o.strokeOpacity === undefined ? 1 : o.strokeOpacity,
                       strokeWidth: o.strokeW || 2, strokeAlignment: 'center', strokeStyle: 'solid' }];
        if (o.cap) p.strokes = [Object.assign({}, p.strokes[0], { strokeCapStart: o.cap, strokeCapEnd: o.cap })];
      }
      this.host.appendChild(p);
      try { p.layoutChild.absolute = true; } catch (e) {}
      this.kids.push(p);
      return p;
    },
    add: function (sh, box) {
      storage.absMount(this.host, sh, box.x, box.y);
      this.kids.push(sh);
      return sh;
    },
    /** remember a plate's glue so ctx.refit() can move it with the host instead of leaving it stranded. */
    _anchor: function (sh, box, anchor) {
      if (anchor) { this.anch = this.anch || []; this.anch.push({ sh: sh, box: box, anchor: anchor }); }
      return sh;
    },
    /** deferred label: created now, placed after ctx.settle() measured the real width/height. */
    text: function (str, box, o) {
      o = o || {};
      var t = storage.mkText(str, 0, 0, o.size || 14, o.color || P.ink, o.weight || 400, o.role);
      // An empty label is not a shape: mkText returns null for it (createText('') is null in 2.17), and pushing that
      // into `pend` would crash the settle pass that measures `t.width`.
      if (!t) return null;
      // §3.2: 11px is legal only for declared typographic roles (axis / overline / kbd). Naming the node is what makes
      // that decidable by the lint instead of by reading the copy back.
      if (o.role) { try { t.name = String(o.role); } catch (e) {} }
      var h = { t: t, str: str, box: B(box.x, box.y, box.w, box.h), o: o };
      if (o.opacity !== undefined) h.opacity = o.opacity;
      this.pend.push(h);
      return h;
    },
    settle: async function () {
      // A second `settle()` after a factory already placed once (search button, select panel, chip row) used to return
      // immediately, so every label pushed later was centred from the 1×1 transient. Gate on the pending count instead.
      if (this.pend.length > (this._settledN || 0)) {
        await storage.sleep(140);
        // A cell row creates dozens of shapes in one render pass, so a freshly pushed label can still read 1×1 after
        // 140ms. Placing from that transient is the stale-center fingerprint (and pushes a right-aligned box off the
        // board), so poll a bounded number of extra frames before measuring.
        for (var tries = 0, from = this._settledN || 0; tries < 3; tries++) {
          var tiny = false;
          for (var i = from; i < this.pend.length; i++) { if ((this.pend[i].t.width || 0) <= 2) { tiny = true; break; } }
          if (!tiny) break;
          await storage.sleep(160);
        }
        this._settledN = this.pend.length;
      }
      return this;
    },
    place: function () {
      // §5.2 "disabled is the whole control receding": a host named ·Disabled — or any host mounted inside one, which is
      // how a nested avatar/checkbox/badge ends up in a disabled row — fades every piece of copy it owns. An explicit
      // alpha is taken further down, never up, so a factory that already dimmed stays correct.
      var dis = /·Disabled/.test(String(this.host.name || '')), anc = this.host.parent, guard = 0;
      while (!dis && anc && guard++ < 16) { if (/·Disabled/.test(String(anc.name || ''))) dis = true; else anc = anc.parent || null; }
      this.pend.forEach(function (h) {
        var t = h.t, box = h.box, o = h.o;
        // §5 the box's HEIGHT is a transient default, the LEADING is the truth. `createText` lays the text out at the
        // transient 1px width, so the height it computes is the 1px-WRAPPED height (measured 2026-10-22: a 16px
        // one-line label read h=384 while its textBounds read 20). Placing from `t.height` therefore lands the label
        // ~180px above its host, and Penpot draws the glyphs at the VERTICAL CENTRE of the box, so the label leaves
        // the host entirely (an export showed the button with no label at all). The ramp's own leading is what the
        // text occupies, so the placement uses it; `storage.fitTexts` then shrinks the box to the rendered height.
        var th = 0, tw = t.width || 0;
        try { th = parseFloat(t.lineHeight) || 0; } catch (e) {}
        if (!th) th = t.height || 0;
        h.w = tw; h.h = th;
        var x = o.align === 'left' ? box.x : (o.align === 'right' ? box.x + box.w - tw : box.x + (box.w - tw) / 2);
        var y = o.valign === 'top' ? box.y : (o.valign === 'bottom' ? box.y + box.h - th : box.y + (box.h - th) / 2);
        x += o.dx || 0; y += o.dy || 0;
        storage.absMount(this.host, t, N(x), N(y));
        var al = h.opacity === undefined ? 1 : h.opacity;
        if (dis) al = Math.min(al, CF.STATE.disabledContent);
        if (al !== 1) t.fills = [{ fillColor: o.color || P.ink, fillOpacity: al }];
        if (o.growType) { try { t.growType = o.growType; } catch (e) {} }
        if (o.align) { try { t.align = o.align; } catch (e) {} }   // `align`, never horizontalAlign (§12.1)
        h.x = N(x); h.y = N(y);
        if (o.underline) {
          var u = o.underline === true ? (o.color || P.ink) : o.underline;
          if (!h._ul) h._ul = this.plate(B(h.x, h.y + th - 1, max(1, tw), 1), { name: 'underline', fill: u });
          else { try { h._ul.resize(max(1, tw), 1); } catch (e) {} storage.absMount(this.host, h._ul, h.x, h.y + th - 1); }
        }
      }, this);
      this.autoHit();
      return this;
    },
    /** §6: a control smaller than the tier floor gets an invisible hit pad, never a fatter box. Idempotent — refit()
        re-runs place(), so the pad is re-centred and resized instead of stacked. */
    autoHit: function () {
      var min = CF.minHit(), b = B(this.host.x, this.host.y, this.host.width, this.host.height);
      if (!CF.interactive(this.host.name) || (b.w >= min && b.h >= min)) return this;
      var m = max(min, b.w), mh = max(min, b.h), px = b.x + (b.w - m) / 2, py = b.y + (b.h - mh) / 2;
      if (this._hit) { try { this._hit.resize(m, mh); } catch (e) {} storage.absMount(this.host, this._hit, N(px), N(py)); }
      else this._hit = this.hitPad(b, min);
      return this;
    },
    /** after settle+place: grow the host so no label can overflow its pad-X (kills measure_overflow at the source).
        A centered label that is wider than its box pokes out on BOTH sides, so the host moves left as well as grows. */
    refit: function (padX) {
      var pad = padX === undefined ? 0 : padX, left = 0, right = 0;
      this.pend.forEach(function (h) {
        if (h.o.refit === false || !h.w) return;
        left = max(left, (this.host.x + pad) - h.x);
        right = max(right, h.x + h.w + pad - (this.host.x + this.host.width));
      }, this);
      // C4, not N: refit moves the host's *left edge* and resizes it, and design-guide §1 makes that edge a design
      // coordinate. Rounding 1.4px of overflow to 1 would park the control at x=31 — an off-grid placement the
      // composed-layout audit is right to reject. Overshoot by at most 3px of padding instead.
      var ls = C4(max(0, left)), delta = C4(ls + max(0, right));
      if (delta > 0) {
        if (ls > 0) { try { this.host.x = N(this.host.x - ls); } catch (e) {} }
        try { this.host.resize(N(this.host.width + delta), this.host.height); } catch (e) {}
        this.w = N(this.host.width);
        (this.anch || []).forEach(function (a) {
          var dx = a.anchor === 'right' ? delta - ls : a.anchor === 'center' ? (delta - ls * 2) / 2 : -ls;
          storage.absMount(this.host, a.sh, N(a.box.x + dx), N(a.box.y));
        }, this);
        this.pend.forEach(function (h) {
          if (h.o.refit !== false) h.box = B(h.box.x - ls, h.box.y, h.box.w + delta, h.box.h);
        });
        this.place();
      }
      return this;
    },
    /** focus ring: its own 2px layer at 2px offset, ≥3:1 against the surface (§1.1 HARD, signature focus_ring_missing).
        A ring is authored to sit OUTSIDE the control, but a board clips by default (api-pitfalls §4) — drawn inside a
        clipped host its outer band is cut and the focus state shows two line segments instead of a ring (measured
        2026-10-20: 56 cropped `ring·focus` layers on page 03). `CF.fitToClip` releases the host clip, or pulls the
        box inside a clip that must stay.
        THE CALLER'S BOX WINS. It is the unit the keyboard is actually on — `CF.steps` passes the active node, `CF.menu`
        the highlighted row, `CF.otp` the digit being typed, `CF.anchor` the active line. Taking the host box instead
        (the old behaviour, measured 2026-10-22 on `08 · Navigation`: 20 of 20 rings were host+2) drew one rectangle
        around the whole composition: a 775×24 lime band over a five-node step timeline, a 224×152 box around a menu
        whose focused item is 32px. A matrix refit CAN move the host after the factory computed its box — which is why
        the host box was used at all — so the unit now travels by the host's own delta instead of being discarded.
        §1.3: for a `reserved` family the boundary is authored at alpha 0 and the unit gets the state wash. */
    ring: function (box, o) {
      o = o || {};
      var off = o.offset === undefined ? 2 : o.offset, w = o.width || 2, r = RZ(o.radius === undefined ? 'sm' : o.radius);
      var hb = this.host ? B(this.host.x, this.host.y, this.host.width, this.host.height) : null;
      var src = box ? B(box.x, box.y, box.w, box.h) : (hb ? B(hb.x, hb.y, hb.w, hb.h) : null);
      if (!src) return null;
      if (hb && this.box) {
        src = B(src.x + (hb.x - this.box.x), src.y + (hb.y - this.box.y), src.w, src.h);
        // a caller that asked for (nearly) the whole host follows the host through a resize refit as well
        if (Math.abs(src.w - hb.w) <= 6 && Math.abs(src.h - hb.h) <= 6) src = B(hb.x, hb.y, hb.w, hb.h);
        else {
          // A unit may legitimately overhang its host by its own halo (a 3px ring around a node at the host's edge) and
          // the clip is released, so a small escape is left alone. A LARGE escape means the box was authored before a
          // refit moved the host further than the delta shows — then it is pulled back inside, which is what the old
          // host-box shortcut was really protecting against.
          var ox = src.x - hb.x, oy = src.y - hb.y, or = hb.x + hb.w - (src.x + src.w), ob = hb.y + hb.h - (src.y + src.h);
          if (ox < -6 || oy < -6 || or < -6 || ob < -6) {
            src = B(Math.max(hb.x, Math.min(src.x, hb.x + hb.w - src.w)),
                    Math.max(hb.y, Math.min(src.y, hb.y + hb.h - src.h)),
                    Math.min(src.w, hb.w), Math.min(src.h, hb.h));
          }
        }
      }
      var role = o.role || CF.focusRole(this.host && this.host.name);
      var alpha = o.strokeOpacity === undefined ? (role === 'reserved' ? CF.FOCUS.ghost : 1) : o.strokeOpacity;
      var want = B(src.x - off, src.y - off, src.w + off * 2, src.h + off * 2);
      // CONTROL host (not a `clip·` crop): the ring is the host's own state, so lift the pill clip and draw it
      // INSIDE the host, where the audit looks (`focus_ring_missing`). Deliberate crops (`clip·` media, avatars,
      // half-stars) keep the full fitToClip path below.
      var mount = null, mk = want;
      if (this.host && !/^clip·/.test(String(this.host.name || ''))) {
        try { if (this.host.clipContent) this.host.clipContent = false; } catch (e) {}
        mount = 'inside';
      } else {
        var fit = CF.fitToClip(this.host, want, w, { refuseClamp: true });
        if (fit.mountOutside && this.host && this.host.parent) mount = 'outside';
        mk = fit.box;
      }
      // the perceivable half of a `reserved` focus state: the unit's 12% brand wash, under the row's own copy.
      // A FILLED plate belongs inside its control — an outline may overhang at its offset, a background may not
      // (audit_layout `out_of_bounds`), so the wash is clamped to the host box while the boundary keeps the halo.
      if (mount !== 'outside' && role === 'reserved' && alpha < 0.05 && hb) {
        var wb = B(Math.max(src.x, hb.x), Math.max(src.y, hb.y),
                   Math.max(4, Math.min(src.x + src.w, hb.x + hb.w) - Math.max(src.x, hb.x)),
                   Math.max(4, Math.min(src.y + src.h, hb.y + hb.h) - Math.max(src.y, hb.y)));
        var wp = this.plate(wb, { name: 'wash·focus', fills: CF.fills(null, 'focus', { tint: true }), radius: r });
        if (wp) { try { wp.sendToBack(); } catch (e) {} }
      }
      var opts = { name: 'ring·focus', fill: null, stroke: o.color || P.primary, strokeW: w, strokeOpacity: alpha, radius: r };
      if (mount === 'outside') {
        var sh = this.plate(mk, opts);
        // one level up: the crop must stay a crop, so the ring belongs to the host's container, not inside it
        if (sh) { try { storage.absMount(this.host.parent, sh, mk.x, mk.y); } catch (e) {} }
        return sh;
      }
      return this.plate(mk, opts);
    },
    /** empty hit pad so a 24px control still meets the touch floor (§2 HARD, signature touch_target). It is invisible,
        so it must keep its real size: only the clip is released, the box is never clamped (a 24px pad fails the floor). */
    hitPad: function (box, minSide) {
      var m = max(minSide || 32, box.w), mh = max(minSide || 32, box.h);
      CF.fitToClip(this.host, box, 0, { clamp: false });
      return this.plate(B(box.x + (box.w - m) / 2, box.y + (box.h - mh) / 2, m, mh),
        { name: 'hitpad·' + m + '×' + mh, fill: null });
    },
    glyph: function (kind, box, o) { return CF.glyph(this, kind, box, o); },
    /** clip box: a board with clipContent=true crops what is mounted inside (half stars, avatars, cover media). */
    clip: function (box, o) {
      o = o || {};
      var self = this;
      var c = storage.mkAbsBoard(o.name || ('clip·' + (++this._n)), box.x, box.y, box.w, box.h, o.fill || null, RZ(o.radius));
      c.clipContent = true;
      CF.keepClip(c);
      storage.absMount(this.host, c, box.x, box.y);
      this.kids.push(c);
      var sub = Object.create(ctxProto);
      sub.host = c; sub.pend = []; sub.kids = []; sub._n = 0; sub._settled = false; sub.box = box;
      sub.parent = self;
      return sub;
    }
  };

  /**
   * Registry of deliberately-authored crops (`clip·*` frames, compact button groups, avatars). The repair chain's
   * `unclip` releases clipping so glow/shadow layers stay visible — it must never clear these, because a crop's
   * purpose *is* to cut its overflow (clearing it makes the half-star's other half visible).
   */
  CF.keepClip = function (s) { try { (storage._clipKeep || (storage._clipKeep = {}))[s.id] = 1; } catch (e) {} return s; };

  /** The clip that will crop a layer mounted in `node`: `node` itself when it clips, else the nearest clipping
      ancestor (a board clips by default, api-pitfalls §4), as a world box; null when nothing upstream crops.
      A 0×0 ancestor is not a clip — the page root reports clipContent:true with no geometry, and treating it as a
      clipper would crop every board in the file. */
  CF.clipBoxOf = function (node) {
    var p = node, d = 0;
    while (p && d++ < 24) {
      try { if (p.clipContent && p.width > 1 && p.height > 1) return B(p.x, p.y, p.width, p.height); } catch (e) { return null; }
      p = p.parent;
    }
    return null;
  };

  /**
   * Make an outside-sitting layer (focus ring, hit pad, glow plate) survive the clip chain.
   *   1. a host that was never asked to clip is released (`clipContent = false`) — the ring is the host's own state;
   *   2. a host registered by `CF.keepClip` is a deliberate crop (cover media, avatar, compact group): the clip stays
   *      and the box is pulled inside it, so the border is drawn at the clip edge instead of vanishing.
   * Limitation, stated: the clip is resolved against what is mounted NOW. A host whose parent is attached later
   * (`ctx.place()`) can still meet a tighter clip; `audit_layout`'s `stroke_clipped` and `storage.fixClippedStrokes`
   * are the backstop for that case, not a silent pass.
   */
  CF.fitToClip = function (host, box, sw, o) {
    o = o || {};
    if (!host) return { box: box, clamped: false, released: false };
    var cb = CF.clipBoxOf(host);
    var released = false;
    if (cb && o.release !== false && !(storage._clipKeep || {})[host.id] && !/^clip·/.test(String(host.name || ''))) {
      try { host.clipContent = false; released = true; cb = CF.clipBoxOf(host); } catch (e) {}
    }
    if (!cb || o.clamp === false) return { box: box, clamped: false, released: released };
    // `clipBoxOf` returns a CF box ({x,y,w,h}), NOT a shape: reading `cb.width` here made every bound NaN, the guard at
    // the bottom of this function silently never fired, and the caller resized the plate to NaN — Penpot keeps 1×1, so
    // every `ring·focus` drawn into a clipped spec board degenerated (measured 2026-10-20 on the Steps rebuild).
    var cw = cb.w, ch = cb.h;
    var x = Math.max(box.x, cb.x), y = Math.max(box.y, cb.y);
    var r = Math.min(box.x + box.w, cb.x + cw), b = Math.min(box.y + box.h, cb.y + ch);
    var t = Math.max(sw || 0, 0);                    // an inner stroke needs its own thickness inside the clip
    if (!isFinite(r - x) || !isFinite(b - y) || r - x < 4 + t || b - y < 4 + t) return { box: box, clamped: false, released: released };
    if (box.x < cb.x - 0.5 || box.y < cb.y - 0.5 || box.x + box.w > cb.x + cw + 0.5 || box.y + box.h > cb.y + ch + 0.5) {
      // The clip here is a **deliberate crop** (CF.keepClip: cover media, avatar, compact group), so it cannot be
      // released and the ring cannot be clamped into it either — a clamped ring would sit on the crop's own edge and
      // read as a border, not as a focus state. Say so: the caller re-mounts the layer one level up, in the crop's
      // parent, where the authored offset survives. (audit_layout `stroke_clipped` is the gate that catches it.)
      if (o.refuseClamp) return { box: box, clamped: false, mountOutside: true, released: released };
    }
    return { box: B(x, y, r - x, b - y), clamped: true, released: released };
  };

  /**
   * Start a control. `box` = final world bounds (never moved afterwards).
   * o: {fill, radius, stroke, strokeW, shadow, clip, parent, name}
   */
  CF.build = function (name, box, o) {
    o = o || {};
    box = B(box.x, box.y, box.w, box.h);
    var ctx = Object.create(ctxProto);
    ctx.host = storage.mkAbsBoard(name, box.x, box.y, box.w, box.h, o.fill === undefined ? null : o.fill, RZ(o.radius));
    if (o.stroke) ctx._stroke(ctx.host, o.stroke, o.strokeW || 1, o.strokeOpacity);
    if (o.shadow) ctx.host.shadows = CF.shadow(o.shadow);
    // A control host clips for PILL CORNERS, not to crop content — so it must NOT join the keep-clip registry:
    // ctx.ring's release path (fitToClip) has to be allowed to lift the clip and draw the focus ring inside the
    // host, where the audit looks for it. Registering here made every pill host a "deliberate crop", the ring
    // mounted OUTSIDE, and the board failed `focus_ring_missing` + `stroke_covered` (measured 2026-10-21 on
    // 03.03 ButtonGroup). Deliberate crops — media, avatars, half-stars — still register via ctx.clip().
    if (o.clip) ctx.host.clipContent = true;
    if (o.parent) storage.absMount(o.parent, ctx.host, box.x, box.y);
    ctx.box = box; ctx.w = box.w; ctx.h = box.h; ctx.pend = []; ctx.kids = []; ctx._n = 0; ctx._settled = false; ctx.o = o;
    return ctx;
  };

  // ---------------------------------------------------------------- glyphs (§6 icon slots)
  // Each glyph = an array of parts on a 24×24 grid. A part is {p:[segments], f:1?}; segments are
  // ['M'|'L',x,y] | ['C',x1,y1,x2,y2,x,y] | ['O',cx,cy,r] (circle) | 'Z'. A **closed** part (Z or O) is filled,
  // an open part is stroked — one path for the filled parts, one for the stroked parts, never loose siblings.
  var G = {
    chevronDown: [{ p: [['M', 7, 10], ['L', 12, 15], ['L', 17, 10]] }],
    chevronUp: [{ p: [['M', 7, 14], ['L', 12, 9], ['L', 17, 14]] }],
    chevronRight: [{ p: [['M', 10, 7], ['L', 15, 12], ['L', 10, 17]] }],
    chevronLeft: [{ p: [['M', 14, 7], ['L', 9, 12], ['L', 14, 17]] }],
    caretDown: [{ p: [['M', 7, 10], ['L', 17, 10], ['L', 12, 15], 'Z'], f: 1 }],
    caretUp: [{ p: [['M', 7, 14], ['L', 17, 14], ['L', 12, 9], 'Z'], f: 1 }],
    check: [{ p: [['M', 5, 13], ['L', 10, 18], ['L', 19, 6]] }],
    close: [{ p: [['M', 6, 6], ['L', 18, 18]] }, { p: [['M', 18, 6], ['L', 6, 18]] }],
    plus: [{ p: [['M', 12, 5], ['L', 12, 19]] }, { p: [['M', 5, 12], ['L', 19, 12]] }],
    minus: [{ p: [['M', 5, 12], ['L', 19, 12]] }],
    search: [{ p: [['O', 10.5, 10.5, 5.5]] }, { p: [['M', 14.6, 14.6], ['L', 19, 19]] }],
    arrowUp: [{ p: [['M', 12, 19], ['L', 12, 5]] }, { p: [['M', 6, 11], ['L', 12, 5], ['L', 18, 11]] }],
    arrowDown: [{ p: [['M', 12, 5], ['L', 12, 19]] }, { p: [['M', 6, 13], ['L', 12, 19], ['L', 18, 13]] }],
    arrowRight: [{ p: [['M', 4, 12], ['L', 19, 12]] }, { p: [['M', 13, 6], ['L', 19, 12], ['L', 13, 18]] }],
    arrowLeft: [{ p: [['M', 20, 12], ['L', 5, 12]] }, { p: [['M', 11, 6], ['L', 5, 12], ['L', 11, 18]] }],
    dots: [{ p: [['O', 5, 12, 1.7], ['O', 12, 12, 1.7], ['O', 19, 12, 1.7]], f: 1 }],
    dotsV: [{ p: [['O', 12, 5, 1.7], ['O', 12, 12, 1.7], ['O', 12, 19, 1.7]], f: 1 }],
    menu: [{ p: [['M', 5, 7], ['L', 19, 7]] }, { p: [['M', 5, 12], ['L', 19, 12]] }, { p: [['M', 5, 17], ['L', 19, 17]] }],
    star: [{ p: [['M', 12, 3], ['L', 14.6, 9.2], ['L', 21, 9.8], ['L', 16.2, 14.2], ['L', 17.6, 20.5], ['L', 12, 17.2], ['L', 6.4, 20.5], ['L', 7.8, 14.2], ['L', 3, 9.8], ['L', 9.4, 9.2], 'Z'], f: 1 }],
    starOutline: [{ p: [['M', 12, 3], ['L', 14.6, 9.2], ['L', 21, 9.8], ['L', 16.2, 14.2], ['L', 17.6, 20.5], ['L', 12, 17.2], ['L', 6.4, 20.5], ['L', 7.8, 14.2], ['L', 3, 9.8], ['L', 9.4, 9.2], 'Z'] }],
    eye: [{ p: [['M', 3, 12], ['C', 7, 5, 17, 5, 21, 12], ['C', 17, 19, 7, 19, 3, 12]] }, { p: [['O', 12, 12, 2.8]], f: 1 }],
    eyeOff: [{ p: [['M', 3, 12], ['C', 7, 5, 17, 5, 21, 12], ['C', 17, 19, 7, 19, 3, 12]] }, { p: [['O', 12, 12, 2.8]], f: 1 }, { p: [['M', 4, 20], ['L', 20, 4]], o: 0.5 }],
    calendar: [{ p: [['M', 4, 7], ['L', 20, 7], ['L', 20, 20], ['L', 4, 20], ['L', 4, 7]] }, { p: [['M', 4, 11], ['L', 20, 11]] }, { p: [['M', 8, 4], ['L', 8, 8]] }, { p: [['M', 16, 4], ['L', 16, 8]] }],
    clock: [{ p: [['O', 12, 12, 8]] }, { p: [['M', 12, 7], ['L', 12, 12], ['L', 16, 14]] }],
    mail: [{ p: [['M', 3, 6], ['L', 21, 6], ['L', 21, 18], ['L', 3, 18], ['L', 3, 6]] }, { p: [['M', 3.5, 7], ['L', 12, 14], ['L', 20.5, 7]] }],
    user: [{ p: [['O', 12, 8.6, 3.6]] }, { p: [['M', 5, 20], ['C', 5, 14.5, 19, 14.5, 19, 20]] }],
    camera: [{ p: [['M', 3, 8.5], ['L', 8, 8.5], ['L', 10, 6], ['L', 14, 6], ['L', 16, 8.5], ['L', 21, 8.5], ['L', 21, 19], ['L', 3, 19], ['L', 3, 8.5]] }, { p: [['O', 12, 13.5, 3.2]] }],
    lock: [{ p: [['M', 5.5, 11], ['L', 18.5, 11], ['L', 18.5, 20], ['L', 5.5, 20], ['L', 5.5, 11]] }, { p: [['M', 8.5, 11], ['C', 8.5, 4, 15.5, 4, 15.5, 11]] }],
    trash: [{ p: [['M', 5, 7], ['L', 19, 7]] }, { p: [['M', 9, 7], ['L', 9, 4], ['L', 15, 4], ['L', 15, 7]] }, { p: [['M', 6.5, 7], ['L', 7.5, 20], ['L', 16.5, 20], ['L', 17.5, 7]] }, { p: [['M', 10, 10], ['L', 10, 17]] }, { p: [['M', 14, 10], ['L', 14, 17]] }],
    edit: [{ p: [['M', 4, 20], ['L', 4, 16], ['L', 16, 4], ['L', 20, 8], ['L', 8, 20], ['L', 4, 20]] }],
    download: [{ p: [['M', 12, 4], ['L', 12, 15]] }, { p: [['M', 7, 10], ['L', 12, 15], ['L', 17, 10]] }, { p: [['M', 4, 20], ['L', 20, 20]] }],
    upload: [{ p: [['M', 12, 20], ['L', 12, 9]] }, { p: [['M', 7, 14], ['L', 12, 9], ['L', 17, 14]] }, { p: [['M', 4, 4], ['L', 20, 4]] }],
    warning: [{ p: [['M', 12, 3], ['L', 21, 19.5], ['L', 3, 19.5], ['L', 12, 3]] }, { p: [['M', 12, 9], ['L', 12, 14]] }, { p: [['O', 12, 17, 0.9]], f: 1 }],
    info: [{ p: [['O', 12, 12, 9]] }, { p: [['M', 12, 11.5], ['L', 12, 16.5]] }, { p: [['O', 12, 8, 1]], f: 1 }],
    error: [{ p: [['O', 12, 12, 9]] }, { p: [['M', 9, 9], ['L', 15, 15]] }, { p: [['M', 15, 9], ['L', 9, 15]] }],
    success: [{ p: [['O', 12, 12, 9]] }, { p: [['M', 8, 12.5], ['L', 11, 15.5], ['L', 16.5, 9]] }],
    image: [{ p: [['M', 3, 5], ['L', 21, 5], ['L', 21, 19], ['L', 3, 19], ['L', 3, 5]] }, { p: [['O', 8.4, 10, 1.8]], f: 1 }, { p: [['M', 5, 17], ['L', 10, 12], ['L', 13.5, 15.5], ['L', 16, 13.5], ['L', 19, 16.5]] }],
    file: [{ p: [['M', 6, 3], ['L', 14, 3], ['L', 19, 8], ['L', 19, 21], ['L', 6, 21], ['L', 6, 3]] }, { p: [['M', 14, 3], ['L', 14, 8], ['L', 19, 8]] }],
    folder: [{ p: [['M', 3, 7], ['L', 9, 7], ['L', 11, 5], ['L', 21, 5], ['L', 21, 18], ['L', 3, 18], ['L', 3, 7]] }],
    filter: [{ p: [['M', 4, 6], ['L', 20, 6], ['L', 14, 12.5], ['L', 14, 19], ['L', 10, 17], ['L', 10, 12.5], ['L', 4, 6]] }],
    sort: [{ p: [['M', 8, 10], ['L', 12, 6], ['L', 16, 10]] }, { p: [['M', 8, 14], ['L', 12, 18], ['L', 16, 14]] }],
    grip: [{ p: [['O', 9, 7, 1.3], ['O', 15, 7, 1.3], ['O', 9, 12, 1.3], ['O', 15, 12, 1.3], ['O', 9, 17, 1.3], ['O', 15, 17, 1.3]], f: 1 }],
    chat: [{ p: [['M', 4, 5], ['L', 20, 5], ['L', 20, 16], ['L', 11, 16], ['L', 6, 20], ['L', 6, 16], ['L', 4, 16], ['L', 4, 5]] }],
    play: [{ p: [['M', 8, 5], ['L', 19, 12], ['L', 8, 19], ['L', 8, 5]], f: 1 }],
    pause: [{ p: [['M', 8, 5], ['L', 8, 19]] }, { p: [['M', 16, 5], ['L', 16, 19]] }],
    card: [{ p: [['M', 3, 6], ['L', 21, 6], ['L', 21, 18], ['L', 3, 18], ['L', 3, 6]] }, { p: [['M', 3, 10], ['L', 21, 10]] }, { p: [['M', 6, 15], ['L', 11, 15]] }],
    globe: [{ p: [['O', 12, 12, 8.5]] }, { p: [['M', 3.5, 12], ['L', 20.5, 12]] }, { p: [['M', 12, 3.5], ['C', 16, 8, 16, 16, 12, 20.5]] }, { p: [['M', 12, 3.5], ['C', 8, 8, 8, 16, 12, 20.5]] }],
    home: [{ p: [['M', 4, 11], ['L', 12, 4], ['L', 20, 11]] }, { p: [['M', 6.5, 10], ['L', 6.5, 20], ['L', 17.5, 20], ['L', 17.5, 10]] }],
    bell: [{ p: [['M', 6, 17], ['C', 6, 9, 7, 6, 12, 6], ['C', 17, 6, 18, 9, 18, 17]] }, { p: [['M', 10, 19.5], ['L', 14, 19.5]] }, { p: [['O', 12, 4.6, 1.4]], f: 1 }],
    undo: [{ p: [['M', 5, 13], ['L', 5, 8], ['C', 5, 4, 16, 4, 16, 10], ['C', 16, 14, 10, 14, 9, 12]] }, { p: [['M', 9, 8], ['L', 5, 12], ['L', 1, 10]] }],
    redo: [{ p: [['M', 19, 13], ['L', 19, 8], ['C', 19, 4, 8, 4, 8, 10], ['C', 8, 14, 14, 14, 15, 12]] }, { p: [['M', 15, 8], ['L', 19, 12], ['L', 23, 10]] }],
    minusBox: [{ p: [['M', 5, 12], ['L', 19, 12]] }],
    dot: [{ p: [['O', 12, 12, 5]], f: 1 }],
    ring: [{ p: [['O', 12, 12, 8.5]] }],
    grid: [{ p: [['M', 4, 4], ['L', 10.5, 4], ['L', 10.5, 10.5], ['L', 4, 10.5], ['L', 4, 4]] },
           { p: [['M', 13.5, 4], ['L', 20, 4], ['L', 20, 10.5], ['L', 13.5, 10.5], ['L', 13.5, 4]] },
           { p: [['M', 4, 13.5], ['L', 10.5, 13.5], ['L', 10.5, 20], ['L', 4, 20], ['L', 4, 13.5]] },
           { p: [['M', 13.5, 13.5], ['L', 20, 13.5], ['L', 20, 20], ['L', 13.5, 20], ['L', 13.5, 13.5]] }],
    list: [{ p: [['O', 5, 7, 1.4], ['O', 5, 12, 1.4], ['O', 5, 17, 1.4]], f: 1 },
           { p: [['M', 9.5, 7], ['L', 19.5, 7]] }, { p: [['M', 9.5, 12], ['L', 19.5, 12]] }, { p: [['M', 9.5, 17], ['L', 19.5, 17]] }],
    kanban: [{ p: [['M', 5, 4], ['L', 5, 20]] }, { p: [['M', 12, 4], ['L', 12, 14]] }, { p: [['M', 19, 4], ['L', 19, 18]] }],
    refresh: [{ p: [['M', 19, 12], ['C', 19, 16.1, 16.1, 19, 12, 19], ['C', 7.9, 19, 5, 16.1, 5, 12], ['C', 5, 7.9, 7.9, 5, 12, 5], ['C', 14.7, 5, 17, 6.4, 18.4, 8.6]] },
              { p: [['M', 19.6, 4.4], ['L', 19.6, 10], ['L', 14, 10]] }],
    link: [{ p: [['M', 10, 14], ['L', 14, 10]] },
           { p: [['M', 8.6, 10.6], ['C', 6.2, 13, 6.2, 16.4, 8.6, 18.4], ['C', 11, 20.4, 13.4, 18.6, 13.4, 15.8]] },
           { p: [['M', 15.4, 13.4], ['C', 17.8, 11, 17.8, 7.6, 15.4, 5.6], ['C', 13, 3.6, 10.6, 5.4, 10.6, 8.2]] }],
    external: [{ p: [['M', 14, 5], ['L', 19.5, 5], ['L', 19.5, 10.5]] }, { p: [['M', 19.5, 5], ['L', 11, 13.5]] },
               { p: [['M', 17, 13], ['L', 17, 19.5], ['L', 4.5, 19.5], ['L', 4.5, 7], ['L', 11, 7]] }],
    heart: [{ p: [['M', 12, 19.8], ['C', 4.6, 14.4, 4.4, 8.6, 8.1, 6.7], ['C', 10.6, 5.5, 12, 8.2, 12, 8.2], ['C', 12, 8.2, 13.4, 5.5, 15.9, 6.7], ['C', 19.6, 8.6, 19.4, 14.4, 12, 19.8]] }],
    flag: [{ p: [['M', 6, 4], ['L', 6, 20]] }, { p: [['M', 6, 5.2], ['L', 18, 5.2], ['L', 15.4, 9], ['L', 18, 12.8], ['L', 6, 12.8], ['L', 6, 5.2]] }],
    tag: [{ p: [['M', 4, 4], ['L', 13, 4], ['L', 20, 11], ['L', 11, 20], ['L', 4, 13], ['L', 4, 4]] }, { p: [['O', 8.6, 8.6, 1.6]] }],
    pin: [{ p: [['O', 12, 8.5, 4.6]] }, { p: [['M', 12, 13.2], ['L', 12, 20.5]] }, { p: [['M', 8.5, 20.5], ['L', 15.5, 20.5]] }],
    share: [{ p: [['O', 18, 6, 2.6], ['O', 6, 12, 2.6], ['O', 18, 18, 2.6]] }, { p: [['M', 8.3, 10.7], ['L', 15.7, 7.2]] }, { p: [['M', 8.3, 13.3], ['L', 15.7, 16.8]] }],
    chart: [{ p: [['M', 4, 20], ['L', 20, 20]] }, { p: [['R', 6, 12, 3, 7]] }, { p: [['R', 11, 8, 3, 11]] }, { p: [['R', 16, 14, 3, 5]] }],
    layers: [{ p: [['M', 12, 3.5], ['L', 20.5, 8], ['L', 12, 12.5], ['L', 3.5, 8], ['L', 12, 3.5]] },
             { p: [['M', 4, 12.6], ['L', 12, 16.9], ['L', 20, 12.6]] }, { p: [['M', 4, 17], ['L', 12, 21.2], ['L', 20, 17]] }],
    command: [{ p: [['M', 7, 9], ['L', 7, 15], ['L', 17, 15], ['L', 17, 9], ['L', 7, 9]] },
              { p: [['O', 5.6, 7.4, 1.7], ['O', 18.4, 7.4, 1.7], ['O', 5.6, 18.4, 1.7], ['O', 18.4, 18.4, 1.7]], f: 1 }],
    help: [{ p: [['O', 12, 12, 8.6]] }, { p: [['M', 9.6, 9.6], ['C', 9.6, 7.4, 14.4, 7.2, 14.2, 10], ['C', 14.1, 11.9, 12, 12.2, 12, 14.2]] }, { p: [['O', 12, 17.4, 1.1]], f: 1 }],
    settings: [{ p: [['O', 12, 12, 3.4]] }, { p: [['O', 12, 12, 7.6]] },
               { p: [['M', 12, 2.6], ['L', 12, 4.4]] }, { p: [['M', 12, 19.6], ['L', 12, 21.4]] },
               { p: [['M', 2.6, 12], ['L', 4.4, 12]] }, { p: [['M', 19.6, 12], ['L', 21.4, 12]] },
               { p: [['M', 5.4, 5.4], ['L', 6.7, 6.7]] }, { p: [['M', 17.3, 17.3], ['L', 18.6, 18.6]] },
               { p: [['M', 18.6, 5.4], ['L', 17.3, 6.7]] }, { p: [['M', 6.7, 17.3], ['L', 5.4, 18.6]] }],
    sun: [{ p: [['O', 12, 12, 4.6]] }, { p: [['M', 12, 2.8], ['L', 12, 5]] }, { p: [['M', 12, 19], ['L', 12, 21.2]] },
          { p: [['M', 2.8, 12], ['L', 5, 12]] }, { p: [['M', 19, 12], ['L', 21.2, 12]] },
          { p: [['M', 5.6, 5.6], ['L', 7.2, 7.2]] }, { p: [['M', 16.8, 16.8], ['L', 18.4, 18.4]] },
          { p: [['M', 18.4, 5.6], ['L', 16.8, 7.2]] }, { p: [['M', 7.2, 16.8], ['L', 5.6, 18.4]] }],
    moon: [{ p: [['M', 15.6, 4.4], ['C', 10.4, 4.4, 6.4, 8.2, 6.4, 12.6], ['C', 6.4, 17.2, 10.4, 20.4, 15.2, 20.4], ['C', 17.4, 20.4, 19.4, 19.6, 20.6, 18.2], ['C', 15.6, 18.6, 11.6, 15.4, 11.8, 10.4], ['C', 11.9, 7.6, 13.6, 5.4, 15.6, 4.4]] }],
    logout: [{ p: [['M', 10, 4.5], ['L', 4.5, 4.5], ['L', 4.5, 19.5], ['L', 10, 19.5]] }, { p: [['M', 14, 8.5], ['L', 19.5, 12], ['L', 14, 15.5]] }, { p: [['M', 19, 12], ['L', 9.5, 12]] }],
    shield: [{ p: [['M', 12, 3.4], ['L', 19.5, 6], ['L', 19.5, 12], ['C', 19.5, 17, 16, 20, 12, 21], ['C', 8, 20, 4.5, 17, 4.5, 12], ['L', 4.5, 6], ['L', 12, 3.4]] }, { p: [['M', 9, 12], ['L', 11.4, 14.4], ['L', 15.4, 9.8]] }],
    copy: [{ p: [['M', 8.5, 8.5], ['L', 19, 8.5], ['L', 19, 19], ['L', 8.5, 19], ['L', 8.5, 8.5]] }, { p: [['M', 5, 15.5], ['L', 5, 5], ['L', 15.5, 5], ['L', 15.5, 6.5]] }],
    print: [{ p: [['M', 7, 8.5], ['L', 7, 4], ['L', 17, 4], ['L', 17, 8.5]] }, { p: [['M', 4, 8.5], ['L', 20, 8.5], ['L', 20, 15.5], ['L', 4, 15.5], ['L', 4, 8.5]] }, { p: [['M', 7, 13], ['L', 17, 13], ['L', 17, 20], ['L', 7, 20], ['L', 7, 13]] }],
    archive: [{ p: [['M', 3.5, 4], ['L', 20.5, 4], ['L', 20.5, 8], ['L', 3.5, 8], ['L', 3.5, 4]] }, { p: [['M', 5, 8], ['L', 5, 20], ['L', 19, 20], ['L', 19, 8]] }, { p: [['M', 9.5, 12.5], ['L', 14.5, 12.5]] }],
    expand: [{ p: [['M', 4, 9], ['L', 4, 4], ['L', 9, 4]] }, { p: [['M', 20, 15], ['L', 20, 20], ['L', 15, 20]] }, { p: [['M', 4.6, 4.6], ['L', 10, 10]] }, { p: [['M', 19.4, 19.4], ['L', 14, 14]] }],
    collapse: [{ p: [['M', 9, 4], ['L', 9, 9], ['L', 4, 9]] }, { p: [['M', 15, 20], ['L', 15, 15], ['L', 20, 15]] }, { p: [['M', 9.4, 9.4], ['L', 4.6, 4.6]] }, { p: [['M', 14.6, 14.6], ['L', 19.4, 19.4]] }],
    wifi: [{ p: [['M', 4.6, 9.4], ['C', 9, 5.4, 15, 5.4, 19.4, 9.4]] }, { p: [['M', 7.6, 13], ['C', 10.2, 10.6, 13.8, 10.6, 16.4, 13]] }, { p: [['O', 12, 17.4, 1.7]], f: 1 }],
    inbox: [{ p: [['M', 3.5, 13], ['L', 8.5, 5], ['L', 15.5, 5], ['L', 20.5, 13], ['L', 20.5, 19], ['L', 3.5, 19], ['L', 3.5, 13]] }, { p: [['M', 3.5, 13], ['L', 9, 13], ['L', 10.4, 15.6], ['L', 13.6, 15.6], ['L', 15, 13], ['L', 20.5, 13]] }],
    send: [{ p: [['M', 20.5, 3.5], ['L', 20.5, 20.5], ['L', 3.5, 12], ['L', 20.5, 3.5]], f: 1 }, { p: [['M', 8.5, 12], ['L', 20.5, 3.5]] }],
    reply: [{ p: [['M', 9, 5], ['L', 3.5, 11], ['L', 9, 17]] }, { p: [['M', 3.8, 11], ['L', 14, 11], ['C', 19, 11, 20.5, 14, 20.5, 18]] }],
    attachment: [{ p: [['M', 15.5, 7.5], ['L', 8.6, 14.4], ['C', 6.4, 16.6, 9.6, 19.6, 11.8, 17.4], ['L', 18.4, 10.6], ['C', 20.6, 8.4, 17.4, 5.2, 15.2, 7.4], ['L', 9.4, 13.2]] }],
    smile: [{ p: [['O', 12, 12, 8.6]] }, { p: [['M', 8.8, 14.4], ['C', 10.4, 16.4, 13.6, 16.4, 15.2, 14.4]] }, { p: [['O', 9.2, 9.8, 1.1], ['O', 14.8, 9.8, 1.1]], f: 1 }]
  };
  /** Semantic aliases callers use in item arrays (`prev`/`next` in a toolbar) → the catalog's canonical kind.
      Without this an unknown kind draws the 25%-muted placeholder square, which read as two empty buttons on both
      calendar toolbars (calMonth/calWeek, 2026-10-21) instead of the previous/next chevrons. */
  var GLYPH_ALIAS = { prev: 'chevronLeft', next: 'chevronRight', back: 'arrowLeft', forward: 'arrowRight',
    up: 'arrowUp', down: 'arrowDown', add: 'plus', remove: 'minus', more: 'dots', settings: 'dots',
    delete: 'trash', close: 'close', search: 'search' };
  /** §7 The ARTWORK bbox of every glyph, in 24-grid units. The table is hand-authored, so the drawings are NOT
      uniformly centred in their cell: `home`/`check`/`search` sit at (12,12), but `undo` spans [1,4]–[16,14] (centre
      8.5,9), `redo` (15.5,9), `chart` (12,14), `bell` (12,11.35). `CF.glyph` used to centre the GRID in the slot, so
      any off-centre artwork arrived at the row visibly displaced — measured on a side-nav `NavItem`: the icon centre
      sat 1.7px above its label (and `undo`'s is 2.5px high + 2.9px left). Centring the ARTWORK fixes the whole table
      at once and keeps working for glyphs added later. `o.rawGrid` opts out for a caller that wants the cell aligned. */
  var G_BOX = (function () {
    var out = {};
    Object.keys(G).forEach(function (kind) {
      var xs = [], ys = [];
      var P = function (x, y) { xs.push(x); ys.push(y); };
      (G[kind] || []).forEach(function (part) {
        (part.p || []).forEach(function (s) {
          if (typeof s === 'string') return;
          if (s[0] === 'M' || s[0] === 'L') P(s[1], s[2]);
          else if (s[0] === 'C') { P(s[3], s[4]); P(s[5], s[6]); }          // control points are not ink
          else if (s[0] === 'O') { P(s[1] - s[3], s[2] - s[3]); P(s[1] + s[3], s[2] + s[3]); }
          else if (s[0] === 'R') { P(s[1], s[2]); P(s[1] + s[3], s[2] + s[4]); }
        });
      });
      if (!xs.length) return;
      out[kind] = { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
                    y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
    });
    return out;
  })();
  CF.glyphBox = G_BOX;
  /** Draw an icon mark at a world box → at most 2 path shapes (one filled group, one stroked group). */
  CF.glyph = function (ctx, kind, box, o) {
    o = o || {};
    box = B(box.x, box.y, box.w, box.h);
    var resolved = G[kind] ? kind : (GLYPH_ALIAS[kind] || kind);
    var def = G[resolved];
    if (!def) { warn('CF.glyph unknown kind "' + kind + '" (placeholder square drawn — add it to G)'); return ctx.plate(box, { name: 'glyph·' + kind, fill: o.color || P.muted, opacity: 0.25, radius: 'xs' }); }
    var size = min(box.w, box.h), k = size / 24;
    var ox = box.x + (box.w - 24 * k) / 2, oy = box.y + (box.h - 24 * k) / 2;
    // §7 shift the grid so the INK is centred in the slot, not the cell
    var gb = G_BOX[resolved];
    if (gb && !o.rawGrid) { ox += (12 - (gb.x0 + gb.x1) / 2) * k; oy += (12 - (gb.y0 + gb.y1) / 2) * k; }
    var f = function (v) { return v.toFixed(2); };
    var dFill = '', dLine = '';
    def.forEach(function (part) {
      var d = '';
      part.p.forEach(function (s) {
        if (s === 'Z') { d += ' Z'; return; }
        if (s[0] === 'O') { d += circleD(ox + s[1] * k, oy + s[2] * k, s[3] * k); return; }
        if (s[0] === 'R') { d += ' M ' + f(ox + s[1] * k) + ' ' + f(oy + s[2] * k) + ' L ' + f(ox + (s[1] + s[3]) * k) + ' ' + f(oy + s[2] * k) + ' L ' + f(ox + (s[1] + s[3]) * k) + ' ' + f(oy + (s[2] + s[4]) * k) + ' L ' + f(ox + s[1] * k) + ' ' + f(oy + (s[2] + s[4]) * k) + ' Z'; return; }
        var out = s[0] + ' ';
        for (var i = 1; i < s.length; i++) out += f((i % 2 === 1 ? ox : oy) + s[i] * k) + ' ';
        d += out;
      });
      if (part.f) dFill += d; else dLine += d;
    });
    var color = o.color || P.muted, alpha = o.opacity === undefined ? 1 : o.opacity;
    var out = [];
    if (dFill) out.push(ctx.path(dFill, { name: o.name || ('glyph·' + resolved + '·fill'), fill: o.fill || color, opacity: alpha }));
    if (dLine) out.push(ctx.path(dLine, { name: o.name || ('glyph·' + resolved + '·line'), stroke: color, strokeW: o.strokeW || max(1.5, size * 0.085), strokeOpacity: alpha, cap: o.cap || 'round' }));
    if (o.anchor) out.forEach(function (sh) { if (sh) ctx._anchor(sh, box, o.anchor); });
    return out.length === 1 ? out[0] : out;
  };
  CF.glyphKinds = Object.keys(G);

  // ---------------------------------------------------------------- icon slots (the glyph must never fill its host)
  // `CF.glyph` scales the 24-unit drawing to `min(box.w, box.h)`, so passing a CONTROL box (a 32px stepper, a 56px FAB,
  // a 64px upload tile) silently inflates the mark: measured 2026-10-22 on `NumberField` — a 19×19 plus with a 2.72
  // stroke beside 14px value copy, i.e. an icon larger and heavier than the text it sits next to. A control owns an
  // ICON SLOT, not an icon: size it from the host and centre it, and pass THAT box to `CF.glyph`.
  CF.iconSize = function (host) {
    var h = min(host.w, host.h);
    return h >= 80 ? 32 : (h >= 48 ? 24 : (h >= 36 ? 20 : 16));
  };
  CF.iconBox = function (box, size) {
    box = B(box.x, box.y, box.w, box.h);
    var s = size || CF.iconSize(box);
    return B(box.x + (box.w - s) / 2, box.y + (box.h - s) / 2, s, s);
  };

  // ---------------------------------------------------------------- subtree move (compensates "board shell moves, content stays")
  /** Move a host together with everything inside it. Measured (2026-10-20): writing `host.x/y` in world coordinates
      already drags the whole subtree, so the children must **not** be offset first — doing both applies the delta
      twice, and every label inside a moved host ends up one half-host above its control (audit_layout S1
      `out_of_bounds` on every cell of a `Family·Spec` matrix). The loop below only *verifies* the move and repairs a
      child that the parent write left behind. */
  CF.move = function (host, x, y) {
    var dx = N(x - host.x), dy = N(y - host.y);
    var kids = Array.from(host.children || []).map(function (c) { try { return { c: c, x: c.x, y: c.y }; } catch (e) { return null; } }).filter(Boolean);
    try { host.x = x; host.y = y; } catch (e) {}
    var stranded = 0;
    kids.forEach(function (k) {
      try {
        if (Math.abs(k.c.x - (k.x + dx)) > 0.5 || Math.abs(k.c.y - (k.y + dy)) > 0.5) {
          k.c.x = N(k.x + dx); k.c.y = N(k.y + dy);
          stranded++;
        }
      } catch (e) {}
    });
    return { dx: dx, dy: dy, moved: kids.length, stranded: stranded };
  };

  // ================================================================ A · Actions (component-library §3.1)
  /** Palette keys, not hex: so CF.theme()/DESIGN.md can re-skin every control without touching a factory. */
  var TONE = {
    // §4.1: a solid tone surface carries white copy only at its **ink** step (white on the 6-level hue is 3.19–5.17:1
    // — success/warning/info fail AA). The hue stays for graphics, rings, bars and borders.
    primary: { bg: 'primaryInk', ink: 'onPrimary', onDark: 1 },
    danger: { bg: 'errorInk', ink: 'onPrimary', onDark: 1 },
    success: { bg: 'successInk', ink: 'onPrimary', onDark: 1 },
    default: { bg: 'surface', ink: 'ink', line: 'border' },
    outlined: { bg: 'surface', ink: 'ink', line: 'border' },
    dashed: { bg: 'surface', ink: 'ink', line: 'borderStrong', dashed: 1 },
    solid: { bg: 'surfaceAlt', ink: 'ink' },
    filled: { bg: 'surfaceAlt', ink: 'ink' },
    ghost: { bg: null, ink: 'ink' },
    text: { bg: null, ink: 'ink' },
    link: { bg: null, ink: 'primary' },
    neutral: { bg: 'surfaceAlt', ink: 'muted' },
    accent: { bg: null, ink: 'primary' },
    // shells (§3.6) mount controls on ink surfaces; the palette ink would vanish there, so carry an explicit on-dark tone.
    onDark: { bg: null, ink: '#FFFFFF' },
    onPrimary: { bg: null, ink: '#FFFFFF' }
  };
  var C = function (v, dflt) {
    if (v === undefined || v === null) return dflt;
    if (P[v] !== undefined) return P[v];
    // Returning the key itself would silently paint a hex-shaped-on-paper-but-garbage fill; surface it instead.
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) { warn('CF palette key missing: ' + v); return v; }
    return CF.tokenHex(v);
  };
  /** The palette chokepoint for a literal hex: `TK.colorIndex` says whether the token set names it. A near miss
      (≤ 12/255 on a channel) is snapped onto the declared colour, so a typo'd hex cannot create an unbindable paint;
      a genuinely different colour is kept (data-visualisation hues are content, not palette) and reported in
      `CF.offPalette`, which is what the `paint_off_palette` gate then reads on the canvas.
      `CF.theme()` clears the memo — a re-skin changes which hexes are in the set. */
  CF.tokenHex = function (hex) {
    var h = String(hex).toLowerCase();
    var TK = storage.TK;
    if (!TK || !TK.colorIndex || !TK.colorIndex().hexes) return h;
    var memo = C._res || (C._res = {});
    if (memo[h] !== undefined) return memo[h];
    if (TK.colorIndex().byHex[h]) { memo[h] = h; return h; }
    var n = TK.nearestHex(h);
    if (n && n.near) {
      CF.paletteDrift = CF.paletteDrift || {};
      CF.paletteDrift[h] = n.name + ' (' + n.hex + ')';
      memo[h] = n.hex; return n.hex;
    }
    CF.offPalette = CF.offPalette || {};
    CF.offPalette[h] = n ? 'nearest ' + n.hex + ' Δ' + n.d : 'no index';
    memo[h] = h; return h;
  };
  CF.TONE = TONE;
  CF.tone = function (k) { return TONE[k] || TONE.default; };
  var slotName = function (o) {
    var s = [], push = function (t) { if (t && s.indexOf(t) < 0) s.push(t); };
    if (o.iconOnly || o.onlyIcon) push('IconOnly');
    else { if (o.lead) push('IconStart'); if (o.trail || o.submenu) push('IconEnd'); }
    if (o.clear || o.removable || o.closable) push('Clear');
    if (o.addonBefore || o.addonAfter) push('Addon');
    if (o.count || o.badge) push('Count');
    if (o.block) push('Block');
    if (o.loading) push('Loading');
    if (o.dot) push('Dot');
    if (o.avatar) push('Avatar');
    return s.length ? s.join('-') : null;
  };
  /** Arc spinner: 260° open path, round caps (SVG `A` is unavailable, so the arc is bezier kappa). */
  CF.spinner = function (ctx, box, color, w) {
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2, sw = w || max(2, N(box.w * 0.1));
    var r = max(2, box.w / 2 - sw / 2);
    return ctx.path(CF.arc(cx, cy, r, -90, 170), { name: 'spinner', stroke: color, strokeW: sw, cap: 'round' });
  };
  var stateAlpha = function (S, base) { return S === 'disabled' ? CF.STATE.disabledContent : (base === undefined ? 1 : base); };
  /** `lead: true` and `lead: 1` both mean "use the default icon" — JS `=== true` would miss the number. */
  var iconOf = function (v, dflt) { return (v === undefined || v === null || v === false || v === true || v === 1) ? dflt : v; };
  var L2r = function (size) { return CF.ladder(size).radius; };

  /**
   * CF.button — type(primary·default·dashed·text·link·ghost·danger) × size(xs…2xl) × slot(icon start/end/only,
   * loading, block) × state(§1.1 seven axes). Width comes from label + pad-X, never typed (except block / fixed spec).
   */
  CF.button = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), type = o.type || 'default', S = o.state || 'default';
    var tn = CF.tone(o.tone || type);
    var label = o.label === undefined ? (type === 'primary' ? 'Continue' : 'Button') : String(o.label);
    var iconOnly = o.iconOnly || (!label && !!o.lead);
    var lead = (o.lead && !iconOnly ? L.icon : 0) || (iconOnly ? L.icon : 0);
    var leadW = (o.lead || o.loading) && !iconOnly ? L.icon + L.gap : 0;
    var trailW = o.trail ? L.icon + L.gap : 0;
    var lw = label && !iconOnly ? CF.estW(label, L.fs) : 0;
    var w = o.block ? (o.w || 240) : (o.w || (iconOnly ? L.h : L.padX * 2 + leadW + trailW + lw));
    w = max(w, iconOnly ? L.h : L.h + 8);
    var round = o.shape === 'circle' || o.shape === 'round' || o.shape === 'pill';
    var rad = o.shape === 'square' ? 0 : CF.radius('control');
    var box = B(o.x || 0, o.y || 0, w, o.h || L.h);
    // `shape` is a real axis in this kit (a source may draw every CTA as a pill), so it belongs in the name: without it a
    // pill and a radius-6 button of the same type/size/state would share one name and the size axis would lie.
    var shapeV = o.shape === 'pill' || o.shape === 'round' || o.shape === 'circle' ? 'Pill' : (o.shape === 'square' ? 'Square' : null);
    var ctx = CF.build(CF.name('Button', { type: type, size: o.size, state: S, variant: shapeV, slot: slotName(o) }), box, { parent: o.parent });
    ctx.host.fills = CF.fills(tn.bg ? C(tn.bg) : null, S, { onDark: tn.onDark });
    if (tn.line) ctx._stroke(ctx.host, C(tn.line), 1, S === 'disabled' ? 0.4 : 1);
    if (tn.dashed && tn.line) ctx.host.strokes = [Object.assign({}, ctx.host.strokes[0], { strokeStyle: 'dashed' })];
    if (type === 'text' || type === 'link' || type === 'ghost') { /* no border, fill only carries the state tint */ }
    if (o.elevated) ctx.host.shadows = CF.shadow(1);
    var ink = C(tn.ink, P.ink), al = stateAlpha(S);
    if (iconOnly) ctx.glyph(o.glyph || 'search', B(box.x, box.y, box.w, box.h), { color: ink, opacity: al, anchor: 'center' });
    else {
      if (o.lead && !o.loading) ctx.glyph(o.glyph || 'download', B(box.x + L.padX, box.y + (box.h - L.icon) / 2, L.icon, L.icon), { color: ink, opacity: al, anchor: 'left' });
      if (o.loading) CF.spinner(ctx, B(box.x + L.padX, box.y + (box.h - L.icon) / 2, L.icon, L.icon), ink);
      if (label) ctx.text(label, B(box.x + L.padX + leadW, box.y, max(8, box.w - L.padX * 2 - leadW - trailW), box.h),
        { size: L.fs, color: ink, weight: o.weight || 500, opacity: al, underline: (type === 'link' && (S === 'hover' || S === 'focus')) ? ink : false });
      if (o.trail) ctx.glyph(o.glyphEnd || 'chevronDown', B(box.x + box.w - L.padX - L.icon, box.y + (box.h - L.icon) / 2, L.icon, L.icon), { color: ink, opacity: al, anchor: 'right' });
    }
    await ctx.settle(); ctx.place(); if (!o.noRefit) ctx.refit(L.padX);
    var final = B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height);
    if (S === 'focus' || S === 'selected') ctx.ring(final, { radius: rad, color: o.ring ? C(o.ring) : C('primary') });
    if (S === 'selected' && !tn.bg) ctx.host.fills = CF.fills(C('primary'), 'selected', { tint: 1 });
    if (o.hit) ctx.hitPad(final, o.hit);
    return ctx.host;
  };

  /** Icon-only square button: 28 / 40 / 52 with icon 16 / 24 / 28 (§2 HARD), optional badge dot and toggle state. */
  CF.iconButton = async function (o) {
    o = o || {};
    var sq = CF.iconSquare(o.size), ic = CF.iconInSquare(o.size), S = o.state || 'default';
    var tn = TONE[o.tone] || TONE.ghost;
    var box = B(o.x || 0, o.y || 0, o.w || sq, o.h || sq);
    var ctx = CF.build(CF.name('IconButton', { type: o.type || 'ghost', size: o.size, state: S, slot: o.badge ? 'Badge' : (o.shape === 'circle' ? 'Circle' : null) }), box, { parent: o.parent });
    ctx.host.fills = CF.fills(C(tn.bg), S, { onDark: tn.onDark });
    if (o.outlined) ctx._stroke(ctx.host, C('border'), 1, S === 'disabled' ? 0.4 : 1);
    ctx.glyph(o.glyph || 'dots', CF.iconBox(box), { color: C(o.tone === 'danger' ? 'error' : (tn.ink || 'muted')), opacity: stateAlpha(S) });
    await ctx.settle(); ctx.place();
    var final = B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height);
    if (S === 'focus' || S === 'selected') ctx.ring(final, { radius: o.shape === 'circle' ? 'control' : L2r(o.size), color: C('primary') });
    // The dot is pinned to the corner **inside** the square: a board clips its own export box, so a badge that
    // overhangs is cut in half the moment the control is exported or turned into a component.
    if (o.badge) CF.badge({ parent: ctx.host, x: final.x + final.w - 8, y: final.y, dot: true, tone: o.badgeTone || 'error' });
    ctx.hitPad(final, o.hit || (o.tier === 'web' ? 32 : 44));
    return ctx.host;
  };
  /** Attached buttons (Space.Compact): ONE rounded host with clipContent, square-cornered segments inside. */
  CF.buttonGroup = async function (o) {
    o = o || {};
    var items = o.items || [{ label: 'Save', type: 'primary' }, { label: 'Cancel' }, { glyph: 'chevronDown' }];
    var L = CF.ladder(o.size), S = o.state || 'default', vert = o.direction === 'vertical';
    var ws = items.map(function (it) { return it.w || (it.label ? L.padX * 2 + CF.estW(it.label, L.fs) : L.h + 4); });
    var hs = items.map(function () { return L.h; });
    var box = vert ? B(o.x || 0, o.y || 0, max.apply(null, ws) + 2, L.h * items.length + items.length - 1)
      : B(o.x || 0, o.y || 0, ws.reduce(function (a, b) { return a + b; }, 0) + 1, L.h + 1);
    // A group of icon segments and a group of labels are two different controls (a toolbar vs a paired action), and a
    // group whose leading segment carries the brand tone is the attached-primary form — all three must be nameable.
    var glyphSeg = items.filter(function (it) { return it.glyph && !it.label; }).length;
    var gslot = [vert ? 'Vertical' : null,
      glyphSeg === items.length ? 'IconOnly' : (glyphSeg ? 'WithIcon' : null)].filter(Boolean).join('-') || null;
    var ctx = CF.build(CF.name('ButtonGroup', { type: o.type || (items[0] && items[0].type), size: o.size, state: S, slot: gslot }), box, {
      parent: o.parent, fill: C('surface'), stroke: C('border'), strokeW: 1, radius: L.radius, clip: true
    });
    var off = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], tn = CF.tone(it.type || 'default');
      var seg = vert ? B(box.x + 1, box.y + 1 + off, box.w - 2, hs[i] - (i ? 1 : 0)) : B(box.x + 1 + off, box.y + 1, ws[i] - (i ? 1 : 0), box.h - 2);
      if (tn.bg) ctx.plate(seg, { name: 'segment·' + (i + 1), fill: C(tn.bg), fills: CF.fills(C(tn.bg), S, { onDark: tn.onDark }) });
      else if (i && (S === 'hover' || S === 'pressed')) ctx.plate(seg, { name: 'segment·' + (i + 1), fills: CF.fills(null, S) });
      if (i) ctx.plate(vert ? B(seg.x, seg.y, seg.w, 1) : B(seg.x, seg.y, 1, seg.h), { name: 'boundary·segment', fill: C('border'), opacity: 0.6 });
      if (it.label) ctx.text(it.label, seg, { size: L.fs, color: C(tn.ink, P.ink), weight: 500, opacity: stateAlpha(S) });
      else if (it.glyph) ctx.glyph(it.glyph, seg, { color: C(tn.ink, P.ink), opacity: stateAlpha(S) });
      off += (vert ? hs[i] : ws[i]);
    }
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(B(box.x + 1, box.y + 1, box.w - 2, box.h - 2), { radius: L.radius });
    return ctx.host;
  };

  /** Split button: action zone + fixed 40 chevron zone divided by a 1px rule (M3/AntD both draw it this way). */
  CF.splitButton = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), tn = CF.tone(o.type || 'primary'), S = o.state || 'default';
    var cw = o.chevronW || 40;
    var lw = CF.estW(o.label || 'Publish', L.fs);
    var box = B(o.x || 0, o.y || 0, o.w || (L.padX * 2 + lw + cw + 1), L.h);
    var ctx = CF.build(CF.name('SplitButton', { type: o.type, size: o.size, state: S }), box, { parent: o.parent, radius: L.radius });
    ctx.host.fills = CF.fills(tn.bg ? C(tn.bg) : C('surface'), S, { onDark: !!tn.bg && tn.onDark });
    if (!tn.bg) ctx._stroke(ctx.host, C('border'), 1);
    ctx.plate(B(box.x + box.w - cw, box.y, cw, box.h), { name: 'chevron-zone', fill: tn.bg ? '#000000' : C('border'), opacity: tn.bg ? 0.12 : 0.001 });
    ctx.plate(B(box.x + box.w - cw, box.y + 6, 1, box.h - 12), { name: 'boundary·zone', fill: C(tn.ink, P.ink), opacity: tn.bg ? 0.35 : 1 });
    ctx.text(o.label || 'Publish', B(box.x, box.y, box.w - cw, box.h), { size: L.fs, color: C(tn.ink, P.ink), weight: 500, opacity: stateAlpha(S) });
    ctx.glyph('chevronDown', B(box.x + box.w - cw, box.y, cw, box.h), { color: C(tn.ink, P.ink), opacity: stateAlpha(S) });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(box, { radius: L.radius });
    return ctx.host;
  };

  /** FAB 56 / small 40 / large 96 (M3 [spec]), elevation 3, extended = label + pad-X 16-20. */
  CF.fab = async function (o) {
    o = o || {};
    var d = o.size === 'sm' ? 40 : (o.size === 'lg' ? 96 : 56);
    var tn = o.tone === 'surface' ? TONE.filled : (o.tone === 'branded' ? { bg: 'primary', ink: 'onPrimary', onDark: 1 } : { bg: 'primary', ink: 'onPrimary', onDark: 1 });
    var S = o.state || 'default', label = o.extended ? String(o.label === undefined ? 'New note' : o.label) : null;
    var w = label ? max(d, 16 + (o.iconOnly ? 0 : 24) + 8 + CF.estW(label, 14) + 16 + 2) : d;
    var box = B(o.x || 0, o.y || 0, w, d);
    var ctx = CF.build(CF.name('FAB', { size: o.size === 'sm' ? 'Sm' : (o.size === 'lg' ? 'Lg' : 'Md'), tone: o.tone,
      state: S, slot: [label ? 'Extended' : null, label && o.iconOnly ? 'IconOnly' : null].filter(Boolean).join('-') || null }), box, { parent: o.parent, radius: 'control' });
    ctx.host.fills = CF.fills(C(tn.bg), S, { onDark: tn.onDark });
    ctx.host.shadows = CF.shadow(S === 'pressed' ? 2 : 3);
    if (label) {
      if (!o.iconOnly) ctx.glyph(o.glyph || 'plus', B(box.x + 16, box.y + (d - 24) / 2, 24, 24), { color: C(tn.ink), opacity: stateAlpha(S) });
      ctx.text(label, B(box.x + (o.iconOnly ? 16 : 48), box.y, w - (o.iconOnly ? 32 : 64), d), { size: 14, color: C(tn.ink), weight: 600, opacity: stateAlpha(S) });
    } else ctx.glyph(o.glyph || 'plus', CF.iconBox(box), { color: C(tn.ink), opacity: stateAlpha(S) });
    await ctx.settle(); ctx.place(); ctx.refit(16);
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height), { radius: 'control' });
    return ctx.host;
  };

  /** Link: 14-15, underline appears on hover ONLY (§3.1), optional trailing icon, disabled = .38 content. */
  CF.link = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), fs = o.fs || L.fs;
    var label = String(o.label === undefined ? 'Read the docs' : o.label), S = o.state || 'default';
    // pressed = the ink step of the same hue (§1.2: a state is a step on the ramp, never a new hex)
    var color = C(S === 'pressed' ? (o.tone === 'neutral' ? 'ink' : 'primaryInk') : (o.tone === 'neutral' ? 'ink' : 'primary'));
    var w = CF.estW(label, fs) + (o.trail ? fs + 4 : 0) + 2;
    var box = B(o.x || 0, o.y || 0, o.w || w, o.h || max(L.h, fs + 10));
    var ctx = CF.build(CF.name('Link', { size: o.size, state: S, variant: o.underline ? 'Underline' : null, slot: slotName(o) }), box, { parent: o.parent });
    ctx.text(label, B(box.x, box.y, max(8, box.w - (o.trail ? fs + 4 : 0)), box.h), { size: fs, color: color, weight: o.weight || 500,
      opacity: stateAlpha(S), align: 'left', underline: (o.underline || S === 'hover' || S === 'focus' || S === 'pressed') ? (o.underline === true ? color : o.underline) : false });
    if (o.trail) ctx.glyph(iconOf(o.trail, 'arrowRight'), B(box.x + box.w - fs, box.y + (box.h - fs) / 2, fs, fs), { color: color, opacity: stateAlpha(S), anchor: 'right' });
    await ctx.settle(); ctx.place(); ctx.refit(0);
    if (S === 'focus') ctx.ring(B(box.x - 2, box.y + 2, ctx.host.width + 4, box.h - 4), { radius: 'xs', offset: 2, width: 2 });
    return ctx.host;
  };

  /** Segmented control / toggle group: container pad 4, active segment filled + radius, optional icon-only. */
  CF.segmented = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), items = o.items || ['List', 'Grid', 'Board'], S = o.state || 'default';
    var active = o.active === undefined ? 0 : o.active;
    var iw = o.itemW || max(64, L.padX * 2 + max.apply(null, items.map(function (t) { return CF.estW(String(t), L.fs); })) + (o.iconOnly ? L.icon : 0));
    var box = B(o.x || 0, o.y || 0, o.w || (iw * items.length + 8), o.h || L.h + 8);
    var ctx = CF.build(CF.name('Segmented', { size: o.size, state: S, variant: o.dark ? 'Ink' : null, slot: slotName(o) }), box,
      { parent: o.parent, fill: C('surfaceAlt'), radius: 'control' });
    ctx.host.fills = CF.fills(C('surfaceAlt'), S === 'disabled' ? 'disabled' : null);
    items.forEach(function (t, i) {
      var seg = B(box.x + 4 + i * iw, box.y + 4, iw, box.h - 8);
      var on = i === active;
      // A toggle group's `selected` is the chosen segment, so it is drawn as the active pill carrying a 12% brand wash
      // (§1.2: a state layer, not a new hex); `hover`/`pressed` tint the segments the pointer can still reach.
      if (on) {
        ctx.plate(seg, { name: 'segment·active', fill: o.dark ? C('ink') : C('surface'),
          fills: S === 'selected' && !o.dark ? CF.fills(C('surface'), 'selected', { overlay: C('primary') }) : null,
          radius: L.radius, shadow: o.dark ? 0 : 1 });
      } else if (S === 'hover' || S === 'pressed') {
        ctx.plate(seg, { name: 'segment·' + (i + 1), fills: CF.fills(null, S) });
      }
      if (o.iconOnly) ctx.glyph(o.glyphs ? o.glyphs[i] : 'grid', seg, { color: on ? (o.dark ? C('surface') : C('ink')) : C('muted'), opacity: stateAlpha(S) });
      else ctx.text(String(t), seg, { size: L.fs, color: on ? (o.dark ? C('surface') : C('ink')) : C('muted'), weight: on ? 600 : 400,
        opacity: (S === 'disabled' || i === o.disabled) ? CF.STATE.disabledContent : 1 });
    });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(box, { radius: 'control' });
    return ctx.host;
  };

  // ================================================================ B · Text fields (component-library §3.2)
  var FIELD = {
    outlined: { bg: 'surface', line: 'border' },
    filled: { bg: 'surfaceAlt', line: null },
    borderless: { bg: null, line: null },
    underlined: { bg: null, line: 'border' }
  };
  function fieldGeom(box, o) {
    var L = CF.ladder(o.size);
    var padX = o.padX === undefined ? max(12, L.padX) : o.padX;
    var ic = o.icon || L.icon;
    var leadW = o.lead ? ic + 8 : 0;
    var suffixW = o.suffix ? CF.estW(String(o.suffix), L.fs) + 8 : 0;
    var clearW = o.clear ? ic + 4 : 0;
    var trailW = (o.trail ? ic + 6 : 0) + clearW + suffixW;
    return {
      L: L, padX: padX, ic: ic,
      text: B(box.x + padX + leadW, box.y, max(8, box.w - padX * 2 - leadW - trailW), box.h),
      lead: o.lead ? B(box.x + padX, box.y + (box.h - ic) / 2, ic, ic) : null,
      clear: o.clear ? B(box.x + box.w - padX - ic - (o.trail ? ic + 6 : 0) - suffixW, box.y + (box.h - ic) / 2, ic, ic) : null,
      trail: o.trail ? B(box.x + box.w - padX - ic - suffixW, box.y + (box.h - ic) / 2, ic, ic) : null,
      suffix: o.suffix ? B(box.x + box.w - padX - suffixW, box.y, suffixW, box.h) : null
    };
  }
  /**
   * Shared field shell. Host = outer bounds (addons + counter row included), the visible box is a plate, so
   * outlined/filled/borderless/underlined are four draws of one geometry and `focus` is always a real ring layer.
   * o: {variant,size,state,status,lead,trail,clear,value,placeholder,addonBefore,addonAfter,count,readonly,disabled,hit}
   */
  CF.fieldBox = async function (family, o) {
    o = o || {};
    var L = CF.ladder(o.size), variant = o.variant || 'outlined', S = o.state || (o.disabled ? 'disabled' : (o.readonly ? 'readonly' : 'default'));
    if (o.status === 'error' && S === 'default') S = 'error';
    var fv = FIELD[variant] || FIELD.outlined;
    var fh = o.h || L.h;
    var aB = o.addonBefore ? L.padX * 2 + CF.estW(String(o.addonBefore), L.fs) : (o.insetLeft ? Number(o.insetLeft) : 0);
    var aA = o.addonAfter ? L.padX * 2 + CF.estW(String(o.addonAfter), L.fs) : (o.insetRight ? Number(o.insetRight) : 0);
    var fieldW = o.w || 240;
    var totalW = aB + fieldW + aA;
    // Foot area BELOW the plate: the counter and the strength readout are status copy, not field content — inside the
    // plate they sit on the hover/focus wash, where a tone hue drops under its contrast floor.
    var extra = (o.count ? 20 : 0) + (o.footH ? Number(o.footH) : 0);
    var box = B(o.x || 0, o.y || 0, totalW, fh + extra);
    var ctx = CF.build(CF.name(family, { type: variant, size: o.size, state: S, slot: slotName(o) }), box, { parent: o.parent });
    var fb = B(box.x + aB, box.y, fieldW, fh);
    var g = fieldGeom(fb, o);
    var line = C(fv.line), lineAlpha = 1, lw = 1;
    if (o.status === 'error') { line = C('error'); lw = variant === 'underlined' ? 2 : 1; }
    else if (o.status === 'success') { line = C('success'); }
    else if (o.status === 'warning') { line = C('warning'); }
    if (S === 'hover' && variant === 'outlined') line = C('borderStrong');
    if (S === 'disabled') lineAlpha = 0.4;
    ctx.plate(fb, { name: 'field', fill: C(fv.bg), fills: CF.fills(C(fv.bg), S === 'readonly' ? null : (S === 'error' || S === 'success' || S === 'warning' ? null : S)),
      stroke: variant === 'underlined' ? null : line, strokeW: lw, strokeOpacity: lineAlpha,
      radius: variant === 'outlined' || variant === 'filled' ? L.radius : 'none' });
    if (variant === 'underlined') ctx.plate(B(fb.x, fb.y + fb.h - (S === 'focus' ? 2 : 1), fb.w, S === 'focus' ? 2 : 1), { name: S === 'focus' ? 'underline·focus' : 'underline', fill: S === 'focus' ? C('primary') : line, opacity: lineAlpha });
    if (S === 'disabled') ctx.plate(fb, { name: 'disabled-overlay', fills: [{ fillColor: C('ink'), fillOpacity: CF.STATE.disabledContainer }], radius: L.radius });
    [o.addonBefore ? B(box.x, box.y, aB, fh) : null, o.addonAfter ? B(box.x + aB + fieldW, box.y, aA, fh) : null].forEach(function (ab, i) {
      if (!ab) return;
      ctx.plate(ab, { name: i ? 'addon·after' : 'addon·before', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1,
        radius: i ? 'none' : L.radius });
      ctx.text(String(i ? o.addonAfter : o.addonBefore), ab, { size: L.fs, color: C('muted') });
    });
    var txt = o.value === undefined ? (o.placeholder === undefined ? null : o.placeholder) : String(o.value);
    if (txt !== null) {
      var isPh = o.value === undefined;
      ctx.text(txt, g.text, { size: L.fs, color: isPh ? C('muted') : (o.status === 'error' ? C('error') : C('ink')),
        opacity: isPh ? (S === 'disabled' ? CF.STATE.disabledContent : 0.75) : stateAlpha(S === 'disabled' ? 'disabled' : null), align: o.align || 'left', valign: o.valign || 'middle' });
    }
    if (o.caret) ctx.plate(B(g.text.x + (o.value ? CF.estW(String(o.value), L.fs) : 0), fb.y + (fh - L.fs * 1.25) / 2, 1.5, N(L.fs * 1.25)), { name: 'caret', fill: C('primary') });
    if (g.lead) ctx.glyph(iconOf(o.lead, 'search'), g.lead, { color: o.status === 'error' ? C('error') : C('muted'), opacity: stateAlpha(S === 'disabled' ? 'disabled' : null) });
    if (g.trail) ctx.glyph(iconOf(o.trail, 'info'), g.trail, { color: C('muted') });
    if (g.clear && (S === 'focus' || S === 'hover' || o.value !== undefined)) ctx.glyph('close', g.clear, { color: C('muted'), name: 'icon·clear' });
    if (g.suffix) ctx.text(String(o.suffix), g.suffix, { size: L.fs, color: C('muted'), align: 'right' });
    if (o.count) {
      var over = Number(o.count.v) > Number(o.count.max);
      ctx.text(o.count.v + ' / ' + o.count.max, B(box.x, box.y + fh + 4, box.w, 16), { size: 12, color: over ? C('error') : C('muted'), align: 'right', valign: 'top' });
    }
    await ctx.settle(); ctx.place();
    if (S === 'focus' && variant !== 'underlined') ctx.ring(fb, { radius: L.radius });
    if (o.hit) ctx.hitPad(fb, o.hit);
    return { ctx: ctx, host: ctx.host, geom: g, field: fb, box: box, L: L, state: S };
  };
  CF.input = async function (o) { var r = await CF.fieldBox('Input', o); return r.host; };

  /** Multi-line field: min-h = rows × lineHeight + pad-Y, resize handle, counter below (never inside the scroll area). */
  CF.textarea = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), rows = o.rows || 3, lh = N(L.fs * 1.45), padY = 8;
    var h = o.h || (rows * lh + padY * 2);
    var r = await CF.fieldBox('Textarea', Object.assign({}, o, { h: h, valign: 'top', align: 'left', trail: o.trail || false }));
    if (o.resize !== 'none') {
      var f = r.field;
      r.ctx.path(' M ' + (f.x + f.w - 13) + ' ' + (f.y + f.h - 5) + ' L ' + (f.x + f.w - 5) + ' ' + (f.y + f.h - 5) + ' L ' + (f.x + f.w - 5) + ' ' + (f.y + f.h - 13) + ' Z',
        { name: 'resize-handle', stroke: C('muted'), strokeW: 1, strokeOpacity: 0.8 });
    }
    return r.host;
  };

  /** Search: leading magnifier, optional clear, optional attached primary button (AntD style), optional ⌘K kbd chip. */
  CF.searchField = async function (o) {
    o = o || {};
    o = Object.assign({ lead: 'search', clear: o.clear !== false, placeholder: o.placeholder === undefined ? 'Search' : o.placeholder }, o);
    if (o.withButton) {
      var bw = 0;
      var r = await CF.fieldBox('Search', Object.assign({}, o, { clear: false, trail: false }));
      var f = r.field, host = r.host, ctx = r.ctx;
      var btn = B(f.x + f.w + 8, f.y, o.buttonW || 72, f.h);
      ctx.plate(btn, { name: 'button·primary', fill: C('primary'), radius: CF.ladder(o.size).radius });
      ctx.text(o.buttonLabel || 'Search', btn, { size: CF.ladder(o.size).fs, color: C('onPrimary'), weight: 500 });
      await ctx.settle(); ctx.place();
      ctx.host.resize(N(btn.x + btn.w - ctx.host.x + 1), ctx.host.height);
      return ctx.host;
    }
    if (o.kbd) {
      var r2 = await CF.fieldBox('Search', Object.assign({}, o, { clear: false }));
      var kw = CF.estW(o.kbd, 11) + 12;
      r2.ctx.plate(B(r2.field.x + r2.field.w - kw - 8, r2.field.y + (r2.field.h - 22) / 2, kw, 22), { name: 'kbd', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1, radius: 'xs' });
      r2.ctx.text(o.kbd, B(r2.field.x + r2.field.w - kw - 8, r2.field.y, kw, r2.field.h), { size: 11, role: 'kbd', color: C('muted'), weight: 500 });
      await r2.ctx.settle(); r2.ctx.place();
      return r2.host;
    }
    return (await CF.fieldBox('Search', o)).host;
  };

  /** Password: masked dots vs revealed text, eye toggle in a 32 hit pad, optional 4-segment strength bar. */
  CF.passwordField = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), revealed = !!o.revealed, v = o.value === undefined ? 'hunter2pass' : String(o.value);
    var shown = revealed ? v : new Array(min(12, v.length) + 1).join('•');
    var extra = o.strength ? 28 : 0;
    var r = await CF.fieldBox('Password', Object.assign({}, o, { trail: revealed ? 'eyeOff' : 'eye', value: shown, h: L.h, footH: extra, caret: o.caret }));
    if (o.caret === undefined) { /* caret handled by fieldBox */ }
    if (o.strength) {
      var n = 4, segW = (r.field.w - (n - 1) * 4) / n, lvl = Number(o.strength) || 2;
      var colr = lvl <= 1 ? C('error') : (lvl === 2 ? C('warning') : C('success'));
      var footY = r.field.y + r.field.h + 4;
      for (var i = 0; i < n; i++) r.ctx.plate(B(r.field.x + i * (segW + 4), footY, segW, 4),
        { name: 'strength·' + (i + 1), fill: i < lvl ? colr : C('border'), radius: 'xs' });
      r.ctx.text(['Weak', 'Fair', 'Good', 'Strong'][lvl - 1] || '', B(r.field.x, footY + 8, r.field.w, 14),
        { size: 12, color: colr, align: 'left', valign: 'top', refit: false });
      await r.ctx.settle(); r.ctx.place();
    }
    return r.host;
  };

  /** Masked / formatted input: the placeholder IS the mask, digits grouped by it; card shows brand marks. */
  CF.maskedInput = async function (o) {
    o = o || {};
    var masks = { phone: '(555) 123-4567', card: '4242 4242 4242 4242', date: '12/31/24', ssn: '•••-••-••••',
      ipv4: '192.168.0.1', time: '14:30', plate: 'AA-0000-AA', currency: '$ 0.00' };
    var kind = o.mask || 'phone', ph = o.placeholder || masks[kind] || masks.phone;
    var v = o.value === undefined ? null : String(o.value);
    var extra = {};
    if (kind === 'card') { extra.trail = 'card'; extra.w = o.w || 260; }
    if (kind === 'currency') { extra.addonBefore = '$'; extra.w = o.w || 200; }
    var r = await CF.fieldBox('MaskedInput', Object.assign({ placeholder: ph, value: v, size: o.size, state: o.state, variant: o.variant, lead: extra.lead || o.lead, trail: extra.trail || o.trail, w: extra.w || o.w }, o, extra));
    if (kind === 'phone' || kind === 'date') { if (!r.geom.trail) r.ctx.glyph('calendar', B(r.field.x + r.field.w - 12 - r.geom.ic, r.field.y + (r.field.h - r.geom.ic) / 2, r.geom.ic, r.geom.ic), { color: C('muted') }); await r.ctx.settle(); r.ctx.place(); }
    return r.host;
  };

  /** OTP: 6 boxes 44-48 × 56-64 gap 8-12 + a wider break after the 3rd; active box = 2px accent; error = all red. */
  CF.otpInput = async function (o) {
    o = o || {};
    var n = o.length || 6, bw = o.boxW || 44, bh = o.boxH || 52, gap = o.gap || 10, groupAfter = o.grouped === false ? 0 : 3;
    // Error/resend lines are 13px type → a 20px rendered line; a 20px slot left the error's bottom 4px outside the
    // host (audit_layout out_of_bounds). Each slot is 24 = 4px gap + the real line.
    var extra = (o.error ? 24 : 0) + (o.resend ? 24 : 0);
    var boxW = n * bw + (n - 1) * gap + (groupAfter && groupAfter < n ? 8 : 0);
    var box = B(o.x || 0, o.y || 0, max(boxW, o.w || boxW), bh + extra);
    var ctx = CF.build(CF.name('OTP', { size: n + 'D', state: o.error ? 'Error' : (o.state || 'default'), slot: o.resend ? 'Resend' : null }), box, { parent: o.parent });
    var filled = o.filled === undefined ? 3 : Number(o.filled);
    for (var i = 0; i < n; i++) {
      var x = box.x + i * (bw + gap) + (groupAfter && i >= groupAfter ? 8 : 0);
      var b = B(x, box.y, bw, bh);
      // A disabled code cannot be typed into: no caret, no accent border. The host name carries ·Disabled, so
      // `place()` already fades the digits to .38; leaving the active cell lit drew a second, contradictory state.
      var active = !o.error && o.state !== 'disabled' && i === filled;
      ctx.plate(b, { name: 'box·' + (i + 1), fill: C('surface'), stroke: o.error ? C('error') : (active ? C('primary') : C('border')),
        strokeW: active || o.error ? 2 : 1, radius: CF.radius('md') });
      // 16, not 20: a ≥20px text at the top of its own host board reads as a board header to audit_layout S4, and the
      // digit boxes behind it then report header_collision. The ramp has no 18 step, so the digit sits on body-lg.
      if (i < filled) ctx.text(o.hidden ? '•' : String(o.digits ? o.digits[i] : (i + 1) % 10), B(b.x, b.y, b.w, b.h - 2), { size: o.fs || 16, weight: 600, color: C('ink') });
      // An idle OTP cell shows a caret, not a loading spinner: the spinner's arc on the cell border read as a
      // broken ring in the exported screen. Loading is an explicit state (o.loading), and its spinner replaces the
      // caret at the cell centre — a 10px spinner parked in the top-right corner read as a trailing icon and sat on
      // the active cell's 2px border. The 16px glyph matches the md icon step; 2px stroke keeps the 260° arc legible.
      if (active && !o.error) {
        if (o.loading) {
          var sp = Math.min(16, bh - 20);
          CF.spinner(ctx, B(b.x + (b.w - sp) / 2, b.y + (bh - sp) / 2, sp, sp), C('primary'), 2);
        } else {
          ctx.plate(B(b.x + b.w / 2 - 1, b.y + (bh - 20) / 2, 2, 20), { name: 'caret', fill: C('ink'), radius: 'xs' });
        }
      }
    }
    if (o.error) ctx.text(o.message || 'Code doesn’t match', B(box.x, box.y + bh + 4, box.w, 20), { size: 13, color: C('error'), align: 'left', valign: 'top' });
    if (o.resend) ctx.text(iconOf(o.resend, 'Resend code in 0:30'), B(box.x, box.y + bh + (o.error ? 28 : 4), box.w, 20), { size: 13, color: C('muted'), align: 'left', valign: 'top' });
    // The focus ring belongs to the cell the caret sits in, not to box 1: a ring around the first cell while box 4 is
    // active reads as two unrelated states (measured on `OTP·Spec`, row Focus).
    if (o.state === 'focus') {
      var fi = min(filled, n - 1);
      ctx.ring(B(box.x + fi * (bw + gap) + (groupAfter && fi >= groupAfter ? 8 : 0), box.y, bw, bh), { radius: CF.radius('md') });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Number stepper: attached −/+ (or hover-revealed arrows in a 24 gutter), value right-aligned, unit addon, clamps. */
  CF.numberField = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), v = o.value === undefined ? 12 : Number(o.value), minv = o.min === undefined ? 0 : o.min, maxv = o.max === undefined ? 99 : o.max;
    var attached = o.style !== 'hover';
    var btnW = attached ? L.h : 24;
    var r = await CF.fieldBox('NumberField', Object.assign({}, o, {
      align: o.align || 'right', value: String(v) + (o.unit ? '' : ''),
      trail: attached ? false : (o.step === 'up' || v >= maxv ? false : true),
      lead: attached ? false : o.lead, w: o.w || 140, suffix: o.unit,
      // The steppers live in reserved gutters of the host, not outside it: a board's x-assignment carries its
      // children in this Penpot build, so growing the frame leftwards cannot be done after the fact.
      insetLeft: attached ? btnW : 0, insetRight: attached ? btnW : 0
    }));
    var f = r.field, ctx = r.ctx;
    if (attached) {
      var dn = B(f.x - btnW, f.y, btnW, f.h), up = B(f.x + f.w, f.y, btnW, f.h);
      [[dn, 'minus', v <= minv], [up, 'plus', v >= maxv]].forEach(function (t) {
        ctx.plate(t[0], { name: 'stepper', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1, radius: L.radius });
        ctx.glyph(t[1], CF.iconBox(t[0], 20), { color: t[2] ? C('muted') : C('ink'), opacity: t[2] ? CF.STATE.disabledContent : 1, strokeW: 1.7 });
      });
    } else {
      var gh = B(f.x + f.w - 12 - 16, f.y + f.h / 2 - 16, 16, 16);
      ctx.glyph('chevronUp', gh, { color: C('muted') });
      ctx.glyph('chevronDown', B(gh.x, gh.y + 16, gh.w, gh.h), { color: v <= minv ? C('muted') : C('muted'), opacity: v <= minv ? CF.STATE.disabledContent : 1 });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  // ---- dropdown panel shared by select / combobox / date / menu / multi-select
  function panelPlate(ctx, box, o) {
    return ctx.plate(box, { name: o.name || 'panel', fill: C('surface'), radius: CF.radius('md'), shadow: o.shadow === undefined ? 3 : o.shadow, stroke: o.outline ? C('border') : null, strokeW: 1 });
  }
  function optionRow(ctx, r, o) {
    var L = CF.ladder(o.size || 'md'), padX = 12, icon = L.icon;
    if (o.group) { ctx.text(String(o.label).toUpperCase(), B(r.x + padX, r.y, r.w - padX * 2, r.h), { size: 11, role: 'overline', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false }); return; }
    // The keyboard-active row is a wash of the brand, never solid brand: a system whose primary is a dark neutral
    // (a dark neutral such as #161616) would paint an invisible plate under its own ink label and fail §3.3 at the factory.
    if (o.active) ctx.plate(r, { name: 'row·tint', fills: CF.fills(C('primary'), 'focus', { tint: 1 }), radius: 'xs' });
    if (o.selected) ctx.plate(r, { name: 'row·selected', fills: CF.fills(C('primary'), 'selected', { tint: 1 }), radius: 'xs' });
    if (o.hover) ctx.plate(r, { name: 'row·hover', fills: CF.fills(null, 'hover'), radius: 'xs' });
    if (o.lead) ctx.glyph(o.lead, B(r.x + padX, r.y + (r.h - icon) / 2, icon, icon), { color: o.selected ? C('primary') : C('muted') });
    ctx.text(String(o.label), B(r.x + padX + (o.lead ? icon + 8 : 0), r.y, r.w - padX * 2 - (o.lead ? icon + 8 : 0) - (o.selected ? icon + 4 : 0) - (o.right ? CF.estW(String(o.right), 12) + 12 : 0), r.h),
      { size: L.fs, color: o.selected ? C('primary') : C('ink'), weight: o.selected ? 600 : 400, opacity: o.disabled ? CF.STATE.disabledContent : 1, align: 'left', valign: 'middle' });
    if (o.right) ctx.text(String(o.right), B(r.x + r.w - padX - CF.estW(String(o.right), 12) - 4, r.y, CF.estW(String(o.right), 12) + 4, r.h), { size: 12, color: C('muted'), align: 'right', valign: 'middle' });
    if (o.selected) ctx.glyph('check', B(r.x + r.w - padX - icon, r.y + (r.h - icon) / 2, icon, icon), { color: C('primary') });
    if (o.skeleton) ctx.plate(B(r.x + padX, r.y + (r.h - 12) / 2, r.w * 0.6, 12), { name: 'skeleton·bar', fill: C('surfaceAlt'), radius: 'xs' });
    /* content separation is a spacing-token gap; a row divider plate is not drawn */
  }
  /** A menu/select option list inside a host. `rows` = [{label,selected,hover,disabled,group,right,lead,divider,skeleton}]. */
  CF.optionList = async function (ctx, box, rows, o) {
    o = o || {};
    var L = CF.ladder(o.size), rowH = o.rowH || max(32, L.h);
    var y = box.y + 4, n = 0;
    rows.forEach(function (r) {
      var h = r.group ? 24 : rowH;
      optionRow(ctx, B(box.x + 4, y, box.w - 8, h), Object.assign({ size: o.size }, r));
      y += h + (r.group ? 2 : 0);
      n++;
    });
    return { rows: n, usedH: y - box.y };
  };

  /** Select: closed field + open panel (hover, selected, disabled, group headers, no-results, loading). */
  CF.select = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), rowH = o.rowH || 36, opts = o.options || ['Draft', 'Published', 'Archived', { label: 'Team', group: true }, 'Shared with team', { label: 'Locked', disabled: true }];
    if (!o.open) return (await CF.fieldBox('Select', Object.assign({ trail: 'caretDown', value: o.value, placeholder: o.placeholder === undefined ? 'Select…' : o.placeholder }, o))).host;
    var pw = o.panelW || max(o.w || 240, 220);
    var list = opts.filter(function (r) { return typeof r === 'string' ? true : !r.group; }).length;
    var heads = opts.length - list;
    // 8 top + 8 bottom, plus the 40px filter strip when the panel is searchable — leaving the search row out of `ph`
    // is what pushed the last option label below the panel and the host.
    var ph = 16 + list * rowH + heads * 26 + (o.search ? 40 : 0);
    var base = await CF.fieldBox('Select', Object.assign({ trail: 'caretDown', state: 'focus', value: o.value, placeholder: o.placeholder }, o));
    var ctx = base.ctx, f = base.field, host = base.host;
    var pbox = B(f.x, f.y + f.h + 4, pw, ph);
    // Growth is a SIZE, not a world coordinate: `pbox.bottom - host.bottom` (the DatePicker form). Reading it as
    // `panelTop + panelHeight - hostHeight` inflates every open panel by however far down the page the cell sits.
    var nb = N(pbox.x + pbox.w - (host.x + host.width));
    var hb = N(pbox.y + pbox.h - (host.y + host.height));
    if (nb > 0 || hb > 0) { host.resize(N(host.width + max(0, nb)), N(host.height + max(0, hb))); base.box = B(host.x, host.y, host.width, host.height); }
    panelPlate(ctx, pbox, {});
    if (o.search) ctx.plate(B(pbox.x + 4, pbox.y + 4, pbox.w - 8, 32), { name: 'panel·search', fill: C('surfaceAlt'), radius: 'xs' });
    var y0 = pbox.y + 4 + (o.search ? 40 : 4);
    var avail = pbox.h - (y0 - pbox.y) - 4;
    var rows = opts.map(function (r) { return typeof r === 'string' ? { label: r } : r; });
    if (o.maxRows && rows.length > o.maxRows) rows = rows.slice(0, o.maxRows);   // a capped panel scrolls; it never spills
    var res = await CF.optionList(ctx, B(pbox.x, y0, pbox.w, avail), rows, { size: o.size, rowH: rowH });
    if (o.empty) { ctx.text('No matches', B(pbox.x + 12, y0, pbox.w - 24, 40), { size: 13, color: C('muted') }); await ctx.settle(); ctx.place(); return host; }
    if (o.loading) CF.spinner(ctx, B(pbox.x + pbox.w - 28, y0, 16, 16), C('muted'));
    await ctx.settle(); ctx.place();
    return host;
  };

  /** Combobox: editable text + filtered suggestions, keyboard-highlighted row, free-solo "Create …", async skeleton row. */
  CF.combobox = async function (o) {
    o = o || {};
    var rows = (o.options || ['Figma', 'Penpot', 'Sketch']).map(function (r, i) {
      return typeof r === 'string' ? { label: r, active: i === (o.active === undefined ? 0 : o.active), selected: o.value === r } : r;
    });
    if (o.freeSolo !== false) rows.push({ label: 'Create “' + (o.value || 'new') + '”', lead: 'plus' });
    if (o.async) rows.push({ skeleton: true });
    return CF.select(Object.assign({ open: true, options: rows, trail: 'caretDown' }, o, { }));
  };

  /** Multi-select with chips inside the field; chips wrap so the field grows, +N overflow chip, per-chip ✕. */
  CF.multiSelect = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), vals = o.values || ['Design', 'Research'], maxTag = o.maxTagCount;
    var overflow = 0;
    if (maxTag !== undefined && vals.length > maxTag) { overflow = vals.length - maxTag; vals = vals.slice(0, maxTag); }
    var chipH = min(28, L.h - 8), rowsN = 1;
    var fieldW = o.w || 300, usable = fieldW - 24 - (L.icon + 8);
    var xs = [], x = 0;
    vals.concat(overflow ? ['+' + overflow] : []).forEach(function (v) {
      var cw = CF.estW(v, L.fs - 1) + (v[0] === '+' ? 12 : (o.removable === false ? 16 : 16 + L.icon + 4));
      if (x + cw > usable) { rowsN++; x = 0; }
      xs.push({ v: v, x: x, w: cw, row: rowsN - 1 }); x += cw + 4;
    });
    var fh = max(L.h, rowsN * (chipH + 4) + 8);
    // The placeholder is the empty-field affordance: with chips already inside, fieldBox's left-aligned placeholder
    // painted straight through them (audit_layout text_overlap).
    var base = await CF.fieldBox('MultiSelect', Object.assign({ h: fh, value: undefined, placeholder: vals.length ? null : (o.placeholder || 'Add tags…'), trail: 'caretDown' }, o));
    var ctx = base.ctx, f = base.field;
    var yOff = (f.h - rowsN * (chipH + 4)) / 2;
    xs.forEach(function (c) {
      var cb = B(f.x + 12 + c.x, f.y + yOff + c.row * (chipH + 4), c.w, chipH);
      var isMore = c.v[0] === '+';
      ctx.plate(cb, { name: isMore ? 'chip·overflow' : 'chip', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1, radius: 'control' });
      // Only a removable chip reserves a right zone for the ✕; a read-only chip centers its label in the full pill
      // (insetting it by the fixed 4px left pad leaves a 2.5px off-center residue against the plate).
      var inset = !isMore && o.removable !== false;
      ctx.text(c.v, B(inset ? cb.x + 4 : cb.x, cb.y, inset ? cb.w - 18 : cb.w, cb.h), { size: L.fs - 1, color: C('ink') });
      if (!isMore && o.removable !== false) ctx.glyph('close', B(cb.x + cb.w - 16, cb.y + (cb.h - 12) / 2, 12, 12), { color: C('muted'), strokeW: 1.5 });
    });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Date/time picker: field + panel 280-360 with header 40, weekday 28, **40×40 day cells** (M3 [spec]), footer presets. */
  CF.datePicker = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), day = 40, cols = 7, pad = 8;
    var pw = o.panelW || max(cols * day + pad * 2, 280), cw = (pw - pad * 2) / cols;
    var weeks = o.weeks || 5, headerH = 40, weekdayH = 28, footerH = o.presets ? 76 : (o.time ? 0 : 44);
    var ph = headerH + weekdayH + weeks * day + footerH + pad;
    if (!o.open) return (await CF.fieldBox('DatePicker', Object.assign({ trail: 'calendar', value: o.value, placeholder: o.placeholder === undefined ? 'mm/dd/yyyy' : o.placeholder }, o))).host;
    var base = await CF.fieldBox('DatePicker', { trail: 'calendar', state: 'focus', size: o.size, variant: o.variant, value: o.value, w: o.w || pw, x: o.x, y: o.y, parent: o.parent });
    var ctx = base.ctx, f = base.field, host = base.host;
    var pbox = B(f.x, f.y + f.h + 4, pw, ph);
    var nb = N(pbox.x + pbox.w - (host.x + host.width)), hb = N(pbox.y + pbox.h - (host.y + host.height));
    if (nb > 0 || hb > 0) host.resize(N(host.width + max(0, nb)), N(host.height + max(0, hb)));
    panelPlate(ctx, pbox, {});
    ctx.text(o.month || 'October 2026', B(pbox.x + pad, pbox.y, pw * 0.5, headerH), { size: 14, weight: 600, color: C('ink'), align: 'left' });
    ctx.glyph('chevronLeft', B(pbox.x + pw - pad - 64, pbox.y, 28, headerH), { color: C('muted') });
    ctx.glyph('chevronRight', B(pbox.x + pw - pad - 32, pbox.y, 28, headerH), { color: C('muted') });
    var wd = o.weekStart === 'mon' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    for (var c = 0; c < cols; c++) ctx.text(wd[c], B(pbox.x + pad + c * cw, pbox.y + headerH, cw, weekdayH), { size: 11, role: 'axis', color: C('muted'), weight: 500 });
    var gy = pbox.y + headerH + weekdayH, first = o.first || 4, today = o.today || 19;
    var rng = o.range;   // {start,end,hoverEnd}
    for (var i = 0; i < cols * weeks; i++) {
      var cc = i % cols, rr = Math.floor(i / cols);
      var cell = B(pbox.x + pad + cc * cw, gy + rr * day, cw, day);
      var dnum = i - first + 1, out = dnum < 1 || dnum > (o.daysInMonth || 31);
      var shown = out ? (dnum < 1 ? (o.daysInMonth || 31) + dnum : dnum - (o.daysInMonth || 31)) : dnum;
      var inRange = rng && dnum >= rng.start && dnum <= (rng.hoverEnd || rng.end);
      if (inRange) ctx.plate(B(cell.x, cell.y + 4, cell.w, cell.h - 8), { name: 'range·fill', fill: C('primary'), opacity: CF.STATE.selected, radius: 'none' });
      var isSel = rng ? (dnum === rng.start || dnum === (rng.hoverEnd || rng.end)) : dnum === o.selected;
      if (isSel) ctx.ellipse(B(cell.x + (cell.w - 32) / 2, cell.y + (cell.h - 32) / 2, 32, 32), { name: 'day·selected', fill: C('primary') });
      else if (dnum === today) ctx.plate(B(cell.x + (cell.w - 32) / 2, cell.y + (cell.h - 32) / 2, 32, 32), { name: 'day·today', stroke: C('primary'), strokeW: 1.5, radius: 'control' });
      ctx.text(String(shown), B(cell.x, cell.y, cell.w, cell.h), { size: 14, color: out ? C('muted') : (isSel ? '#FFFFFF' : C('ink')),
        opacity: (o.min && dnum < o.min && !out) ? CF.STATE.disabledContent : 1, weight: isSel ? 600 : 400 });
    }
    if (footerH && !o.presets) {
      var fy = gy + weeks * day;
      ctx.text('Clear', B(pbox.x + pad, fy, 60, 40), { size: 13, color: C('primary'), align: 'left' });
      var okb = B(pbox.x + pw - pad - 64, fy + 4, 64, 32);
      ctx.plate(okb, { name: 'button·ok', fill: C('primary'), radius: L.radius });
      ctx.text('OK', okb, { size: L.fs, color: C('onPrimary'), weight: 500 });
    } else if (o.presets) {
      var fy2 = gy + weeks * day;
      ['Today', '7 days', '30 days'].forEach(function (p, i) {
        var pb = B(pbox.x + pad + i * 74, fy2 + 4, 70, 26);
        ctx.plate(pb, { name: 'preset', fill: C('surfaceAlt'), radius: 'control' });
        ctx.text(p, pb, { size: 12, color: C('ink') });
      });
      ctx.text('Cancel', B(pbox.x + pad, fy2 + 38, 60, 30), { size: 13, color: C('muted'), align: 'left' });
      var ok2 = B(pbox.x + pw - pad - 64, fy2 + 38, 64, 30);
      ctx.plate(ok2, { name: 'button·ok', fill: C('primary'), radius: L.radius });
      ctx.text('OK', ok2, { size: 13, color: C('onPrimary'), weight: 500 });
    }
    await ctx.settle(); ctx.place();
    return host;
  };

  /** Time-of-day column list is the datetime mode of the same panel. */
  CF.timePicker = async function (o) {
    o = o || {};
    var rows = [];
    for (var h = 0; h < (o.hourly ? 24 : 6); h++) rows.push({ label: (o.hourly ? (h < 10 ? '0' + h : h) : (h + 8)) + ':00', selected: h === (o.selected || 0), active: h === (o.hover || 1) });
    return CF.select(Object.assign({ open: true, options: rows, panelW: o.panelW || 160, trail: 'clock', w: o.w || 160 }, o));
  };

  /** Form-field wrapper: label above (or beside at 240-280), 6-8 gap, control, helper/error 4 below — uses LY.slots.field. */
  CF.field = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size || 'md'), label = String(o.label === undefined ? 'Field label' : o.label);
    var helper = o.error ? String(o.error) : (o.success ? String(o.success) : (o.helper ? String(o.helper) : null));
    var beside = o.labelPlacement === 'beside';
    var labelH = beside ? 0 : 20, helpH = helper ? 18 : 0, gap = 6;
    var total = L.h + labelH + helpH + (labelH ? gap : 0) + (helpH ? 4 : 0);
    var box = B(o.x || 0, o.y || 0, o.w || max(240, CF.estW(label, 14) + 24), total);
    // §G12: the icon/addon/counter slots below the label are the *field's* slots — the sub-control inherits them, so
    // the wrapper host must carry them in its own name or `variant_sparse` reads a composed Field as one flat variant.
    var slot = [beside ? 'LabelBeside' : null, slotName(o)].filter(Boolean).join('-') || null;
    var ctx = CF.build(CF.name('Field', { state: o.error ? 'Error' : (o.success ? 'Success' : (o.state || 'default')), slot: slot }), box, { parent: o.parent });
    var labBox = beside ? B(box.x, box.y, min(280, box.w * 0.3), L.h) : B(box.x, box.y, box.w, labelH);
    var labAl = (o.state === 'disabled') ? CF.STATE.disabledContent : 1;
    ctx.text(label, labBox, { size: 13, color: C(o.state === 'disabled' ? 'muted' : 'ink'), weight: 500, opacity: labAl,
      align: beside ? 'right' : 'left', valign: beside ? 'middle' : 'top', refit: false });
    if (o.required) ctx.text('*', B(labBox.x + (beside ? labBox.w + 4 : CF.estW(label, 13) + 4), beside ? labBox.y : box.y, 12, labBox.h),
      { size: 13, color: C('error'), opacity: labAl, align: 'left', valign: beside ? 'middle' : 'top', refit: false });
    var ctlBox = beside ? B(labBox.x + labBox.w + 24, box.y, box.w - labBox.w - 24, L.h) : B(box.x, box.y + labelH + gap, min(o.controlW || 360, box.w), L.h);
    var factory = o.factory || 'input';
    var sub = await (CF[factory] || CF.input)(Object.assign({}, o, { x: ctlBox.x, y: ctlBox.y, w: ctlBox.w, h: ctlBox.h, parent: ctx.host,
      status: o.error ? 'error' : (o.success ? 'success' : o.status), label: undefined }));
    var helpBox = B(ctlBox.x, ctlBox.y + ctlBox.h + 4, ctlBox.w, max(1, helpH));
    if (helper) {
      if (o.error || o.success) ctx.glyph(o.error ? 'error' : 'success', B(helpBox.x, helpBox.y + 2, 12, 12), { color: o.error ? C('error') : C('success'), strokeW: 1.4 });
      ctx.text(helper, B(helpBox.x + (o.error || o.success ? 16 : 0), helpBox.y, helpBox.w - 16, helpH), { size: 12, color: o.error ? C('error') : (o.state === 'disabled' ? C('muted') : C('muted')), opacity: o.state === 'disabled' ? CF.STATE.disabledContent : 1, align: 'left', valign: 'top', refit: false });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Switch — AntD 44×22 / handle 18, or M3 52×32 / handle 16→24→28 pressed [spec]; inner icon, loading, destructive. */
  CF.switch = async function (o) {
    o = o || {};
    var m3 = o.system === 'm3', sm = o.size === 'sm';
    var tw = o.trackW || (m3 ? (sm ? 44 : 52) : (sm ? 28 : 44)), th = o.trackH || (m3 ? (sm ? 24 : 32) : (sm ? 16 : 22));
    var on = !!o.checked, S = o.state || 'default';
    var pressed = S === 'pressed';
    var hw = m3 ? (on ? (pressed ? 28 : 24) : 16) : (m3 ? 24 : (pressed ? th - 2 : th - 4));
    var box = B(o.x || 0, o.y || 0, tw + (o.label ? CF.labelW(o.label, 14) : 0), max(th, 20));
    var swSlot = [on ? 'On' : 'Off', slotName({ lead: o.innerIcon ? true : null, loading: o.loading }), o.label ? 'Label' : null].filter(Boolean).join('-');
    var ctx = CF.build(CF.name('Switch', { size: sm ? 'Sm' : 'Md', state: S, slot: swSlot }), box, { parent: o.parent });
    var tr = B(box.x, box.y + (box.h - th) / 2, tw, th);
    ctx.hitPad(tr, o.hit || (m3 ? 40 : 32));                    // bottom-most: the 40dp state layer / touch target
    var tfill = on ? C('primary') : (m3 ? C('surface') : C('ink'));
    var tf = [{ fillColor: tfill, fillOpacity: on ? 1 : (m3 ? 1 : 0.28) }];
    var ov = (S === 'hover' || S === 'pressed' || S === 'selected') ? CF.STATE[S] : (S === 'disabled' ? CF.STATE.disabledContainer : 0);
    if (ov) tf.push({ fillColor: on ? '#FFFFFF' : C('ink'), fillOpacity: ov });
    var tplate = ctx.plate(tr, { name: 'track', radius: 'control', fills: tf });
    if (!on && m3) ctx._stroke(tplate, C('borderStrong'), 2);
    var hx = on ? tr.x + tr.w - hw - (m3 ? 4 : 2) : (m3 ? tr.x + (tr.w - hw) / 2 : tr.x + 2);
    var hy = tr.y + (tr.h - hw) / 2;
    ctx.ellipse(B(hx, hy, hw, hw), { name: 'handle', fill: on ? C('onPrimary') : (m3 ? C('ink') : C('surface')),
      opacity: stateAlpha(S), shadow: m3 ? 0 : 1 });
    if (o.innerIcon && on) ctx.glyph('check', B(hx, hy, hw, hw), { color: C('primary'), strokeW: 2 });
    if (o.loading) CF.spinner(ctx, B(hx, hy, hw, hw), on ? C('primary') : C('muted'), 2);
    if (o.label) ctx.text(String(o.label), B(tr.x + tr.w + 8, box.y, box.w - tr.w - 8, box.h),
      { size: 14, color: S === 'disabled' ? C('muted') : C('ink'), opacity: stateAlpha(S), align: 'left' });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(tr, { radius: 'control' });
    return ctx.host;
  };

  /** Checkbox: box 18-20 radius 3-4 border 2, check stroke 2, indeterminate bar, 40×40 state layer, select-all header. */
  CF.checkbox = async function (o) {
    o = o || {};
    var bs = o.boxSize || 18, S = o.state || 'default', on = o.indeterminate ? 'mixed' : (o.checked ? 'on' : 'off');
    var labelW = o.label === undefined ? 0 : CF.labelW(o.label, 14);
    // The label's rendered line is taller than the 18px box (14px type → 21px line): sizing the host to max(bs,20)
    // clipped the label's bottom 2px out of the host — the large-height-overlap class, seen by auditPage as out_of_bounds.
    var lh = o.label ? CF.lineH(14) : 0;
    var box = B(o.x || 0, o.y || 0, max(bs + labelW, bs), o.h || max(bs, 20, lh));
    // A label is a slot, not a decoration: a bare Checkbox master has no text child, and a component copy refuses
    // structural edits. Naming the labelled composition `…·Label` gives it its own master, so instances can carry copy.
    var cbsSlot = [on === 'mixed' ? 'Indeterminate' : (on === 'on' ? 'Checked' : null), o.label ? 'Label' : null].filter(Boolean).join('-');
    var ctx = CF.build(CF.name('Checkbox', { size: o.size, state: S, slot: cbsSlot }), box, { parent: o.parent });
    var bb = B(box.x, box.y + (box.h - bs) / 2, bs, bs);
    if (S === 'hover' || S === 'focus' || o.layer) ctx.plate(B(bb.x - (40 - bs) / 2, bb.y - (40 - bs) / 2, 40, 40), { name: 'state·layer', fills: CF.fills(null, S === 'hover' ? 'hover' : 'focus'), radius: 'control' });
    ctx.plate(bb, { name: 'box', fill: (on === 'off') ? C('surface') : (S === 'disabled' ? C('ink') : C('primary')),
      fills: on === 'off' ? CF.fills(C('surface'), S === 'hover' ? 'hover' : null) : CF.fills(on === 'off' ? C('surface') : C('primary'), S === 'disabled' ? 'disabled' : null, { onDark: on !== 'off' }),
      stroke: on === 'off' ? (S === 'disabled' ? C('ink') : C('borderStrong')) : null, strokeW: 2, radius: 'xs', strokeOpacity: 1 });
    if (on === 'off') ctx._stroke(ctx.host.children[ctx.host.children.length - 1], o.checked ? C('primary') : C('borderStrong'), 2);
    if (o.checked || o.indeterminate) {
      if (o.indeterminate) ctx.plate(B(bb.x + 3, bb.y + bs / 2 - 1, bs - 6, 2.5), { name: 'dash', fill: '#FFFFFF', radius: 'xs' });
      else ctx.glyph('check', B(bb.x - 2, bb.y - 2, bs + 4, bs + 4), { color: '#FFFFFF', strokeW: max(2, bs * 0.16) });
    }
    if (o.label) ctx.text(String(o.label), B(bb.x + bs + 8, box.y, labelW, box.h), { size: 14, color: C('ink'), opacity: stateAlpha(S), align: 'left' });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(bb, { radius: 'xs' });
    ctx.hitPad(bb, o.hit || 32);
    return ctx.host;
  };

  /** Radio: ring 20 + dot 10-12; asButton = segment; card = full card with 2px accent border when selected. */
  CF.radio = async function (o) {
    o = o || {};
    var S = o.state || 'default', on = !!o.checked;
    if (o.asButton) return CF.segmented({ x: o.x, y: o.y, size: o.size, items: o.options || ['A', 'B', 'C'], active: o.checkedIndex || 0, state: S, parent: o.parent, itemW: o.itemW });
    if (o.card) return CF.card(Object.assign({ x: o.x, y: o.y, w: o.w || 240, h: o.h || 96, selectable: true, checked: on, state: S, parent: o.parent,
      title: o.title || 'Card option', body: o.meta || 'Supporting line, one line, ellipsised' }));
    var rs = o.ring || 20, labelW = o.label === undefined ? 0 : CF.labelW(o.label, 14);
    var box = B(o.x || 0, o.y || 0, max(rs + labelW, rs), o.h || 24);
    var rdoSlot = [on ? 'Checked' : null, o.label ? 'Label' : null].filter(Boolean).join('-') || null;
    var ctx = CF.build(CF.name('Radio', { state: S, slot: rdoSlot }), box, { parent: o.parent });
    var rb = B(box.x, box.y + (box.h - rs) / 2, rs, rs);
    if (S === 'hover' || S === 'focus') ctx.plate(B(rb.x - (40 - rs) / 2, rb.y - (40 - rs) / 2, 40, 40), { name: 'state·layer', fills: CF.fills(null, S === 'hover' ? 'hover' : 'focus'), radius: 'control' });
    ctx.ellipse(rb, { name: 'ring', fill: C('surface'), stroke: on ? C('primary') : (S === 'disabled' ? C('muted') : C('borderStrong')), strokeW: on ? 2 : 1.5 });
    if (on) ctx.ellipse(B(rb.x + (rs - 10) / 2, rb.y + (rs - 10) / 2, 10, 10), { name: 'dot', fill: S === 'disabled' ? C('muted') : C('primary') });
    if (o.label) ctx.text(String(o.label), B(rb.x + rs + 8, box.y, labelW, box.h), { size: 14, color: C('ink'), opacity: stateAlpha(S), align: 'left' });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(rb, { radius: 'control' });
    ctx.hitPad(rb, o.hit || 32);
    return ctx.host;
  };

  /** Slider: track 4-6, handle 20 (+40 state layer), marks 2px ticks + 11px labels, range = two handles, value label on drag. */
  CF.slider = async function (o) {
    o = o || {};
    var vert = o.direction === 'vertical';
    var len = (vert ? o.h || 200 : o.w || 240), th = o.trackH || 4, hs = o.handle || 20;
    var lo = o.min === undefined ? 0 : Number(o.min), hi = o.max === undefined ? 100 : Number(o.max);
    var raw2 = o.value2 === undefined ? lo + (hi - lo) * 0.7 : Number(o.value2);
    var raw = o.value === undefined ? lo + (hi - lo) * 0.4 : Number(o.value);
    var norm = function (x) { return hi > lo ? max(0, min(1, (Number(x) - lo) / (hi - lo))) : 0; };
    var v = norm(raw), v2 = norm(raw2);
    var labels = !!(o.marks && o.labels);
    var bub = (o.valueLabel || o.state === 'dragged');
    var botPad = (!vert && labels) ? 20 : 0;
    var bubW = (vert && bub) ? 46 : 0;
    var topPad = bub ? 26 : 0;
    var box = vert ? B(o.x || 0, o.y || 0, hs + 24 + (labels ? 40 : 0) + bubW, len)
                   : B(o.x || 0, o.y || 0, len, (bub ? 26 : 0) + 40 + botPad);
    var ctx = CF.build(CF.name('Slider', { state: o.state || 'default', slot: o.range ? 'Range' : (o.marks ? 'Marks' : null) }), box, { parent: o.parent });
    var railY = vert ? box.y + len / 2 : box.y + topPad + 20;
    var trackBox = vert ? B(box.x + (box.w - bubW - th) / 2, box.y + hs / 2, th, len - hs)
      : B(box.x + hs / 2, railY - th / 2, len - hs, th);
    ctx.plate(trackBox, { name: 'track', fills: [{ fillColor: C('ink'), fillOpacity: 0.12 }], radius: 'control' });
    var span = vert ? { a: trackBox.y, b: trackBox.y + trackBox.h, axis: 'y' } : { a: trackBox.x, b: trackBox.x + trackBox.w, axis: 'x' };
    var posOf = function (p) { return span.a + (span.b - span.a) * p; };
    var seg = function (pa, pb) {
      var a0 = posOf(min(pa, pb)), a1 = posOf(max(pa, pb));
      return vert ? B(trackBox.x, a0, trackBox.w, a1 - a0) : B(a0, trackBox.y, a1 - a0, trackBox.h);
    };
    ctx.plate(o.range ? seg(v, v2) : seg(0, v), { name: 'track·active', fill: o.state === 'disabled' ? C('muted') : C('primary'), radius: 'control' });
    var handle = function (p) {
      var c = posOf(p);
      var b = vert ? B(trackBox.x + trackBox.w / 2 - hs / 2, c - hs / 2, hs, hs) : B(c - hs / 2, railY - hs / 2, hs, hs);
      if (o.state === 'hover' || o.state === 'dragged' || o.state === 'focus' || o.state === 'pressed')
        ctx.ellipse(B(b.x - 10, b.y - 10, hs + 20, hs + 20), { name: 'state·layer', fill: C('primary'), opacity: CF.STATE[o.state] });
      if (o.state === 'focus') ctx.ring(B(b.x - 10, b.y - 10, hs + 20, hs + 20), { offset: 0, radius: 'control', color: C('primary') });
      ctx.ellipse(b, { name: 'handle', fill: o.state === 'disabled' ? C('muted') : C('surface'), stroke: o.state === 'disabled' ? C('border') : C('primary'), strokeW: 2, shadow: 1 });
      return b;
    };
    var h1 = handle(v);
    if (o.range) handle(v2);
    if (o.marks) {
      var ms = o.marks === true ? [lo, lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.75, hi] : o.marks;
      ms.forEach(function (m, i) {
        var p = norm(m);
        var c = posOf(p);
        var t = vert ? B(trackBox.x + trackBox.w + 4, c - 1.5, 8, 3) : B(c - 1.5, railY + th / 2 + 5, 3, 8);
        // An 11px label is drawn with its box **bottom** on the requested y (Penpot auto-height anchoring), so a labelled
        // tick puts the 3×8 stub straight through the glyph — and the stub then *is* the label's background: #585858 on
        // #7C7C7C measures 1.70:1. The number already carries the position, so when labels are on, the stub is dropped.
        if (!labels) ctx.plate(t, { name: 'mark', fill: C('borderStrong') });
        if (labels) ctx.text(String(o.labels ? o.labels[i] : Math.round(m)), vert ? B(t.x + 12, c - 7, 36, 14) : B(c - 18, railY + th / 2 + 15, 36, 14),
          { size: 11, role: 'axis', color: C('muted'), refit: false });
      });
    }
    if (o.state === 'dragged' || o.valueLabel) {
      var lb = vert ? B(h1.x + hs + 6, h1.y - 11, 40, 22) : B(h1.x + hs / 2 - 20, box.y, 40, 22);
      ctx.plate(lb, { name: 'value·bubble', fill: C('ink'), radius: 'xs' });
      ctx.text(String(Math.round(raw)), lb, { size: 12, color: '#FFFFFF', weight: 600, refit: false });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Rating: stars 16-20 gap 2-4, half star drawn by clipping a filled star to 50% width, readonly adds the value. */
  CF.rating = async function (o) {
    o = o || {};
    var n = o.count || 5, sz = o.star || 18, gap = o.gap === undefined ? 4 : o.gap, val = o.value === undefined ? 3.5 : Number(o.value);
    // §G12: hover/pressed preview the next whole star (that is what a click would commit), disabled dims the glyphs.
    var S = o.state || 'default';
    var shown = (S === 'hover' || S === 'pressed') ? Math.ceil(val) : val;
    var dim = stateAlpha(S === 'disabled' ? 'disabled' : null);
    var box = B(o.x || 0, o.y || 0, n * sz + (n - 1) * gap + (o.readonly ? 8 + CF.estW(String(val), 12) : 0), max(sz, 20));
    var ctx = CF.build(CF.name('Rating', { size: o.size, state: S,
      slot: [o.readonly ? 'Readonly' : (val % 1 ? 'Half' : null), o.character ? 'Character' : null].filter(Boolean).join('-') || null }), box, { parent: o.parent });
    for (var i = 0; i < n; i++) {
      var sb = B(box.x + i * (sz + gap), box.y + (box.h - sz) / 2, sz, sz);
      var full = shown >= i + 1, half = !full && shown > i;
      // §G12: a custom character (AntD `character`) has no outline sibling in the glyph set, so the empty state is the
      // same glyph faded — that is the third variant axis the coverage audit needs besides Half and base.
      var emptyKind = o.character || 'starOutline', fillKind = o.character || 'star';
      ctx.glyph(emptyKind, sb, { color: C('warning'), opacity: ((full || half) ? 1 : 0.45) * dim });
      if (full) ctx.glyph(fillKind, sb, { color: C('warning'), opacity: dim });
      if (half) {
        var cl = ctx.clip(B(sb.x, sb.y, sz / 2, sz), { name: 'clip·half' });
        cl.glyph(fillKind, sb, { color: C('warning') });
      }
    }
    if (o.readonly) ctx.text(String(val), B(box.x + box.w - CF.estW(String(val), 12) - 4, box.y, CF.estW(String(val), 12) + 4, box.h), { size: 12, color: C('muted'), align: 'right', opacity: dim });
    if (o.state === 'focus') ctx.ring(B(box.x - 4, box.y - 4, box.w + 8, box.h + 8), { radius: 'sm' });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Color picker: swatch trigger + hex field; panel = 8×6 preset grid of 24px swatches + 12×200 hue bar + input row. */
  CF.colorPicker = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size || 'md'), sw = 20, S = o.state || 'default';
    // §G12: the trigger is a control (hover/focus/disabled) and the open panel is a third draw of the same family, so the
    // host names both — without these tokens a ColorPicker sheet reads as one flat variant to the coverage audit.
    if (!o.open) {
      var box = B(o.x || 0, o.y || 0, o.w || (o.showHex === false ? 44 : 180), L.h);
      var ctx = CF.build(CF.name('ColorPicker', { size: o.size, state: S, slot: o.showHex === false ? 'Swatch' : 'Hex' }), box, { parent: o.parent, fill: C('surface'), stroke: S === 'hover' ? C('borderStrong') : C('border'), strokeW: 1, radius: L.radius });
      ctx.plate(B(box.x + 4, box.y + (L.h - sw) / 2, sw, sw), { name: 'swatch', fill: o.color || '#2563EB', radius: 'xs',
        opacity: S === 'disabled' ? CF.STATE.disabledContent : 1 });
      if (S === 'pressed') ctx.plate(CF.inset(box, 1), { name: 'state·layer', fills: CF.fills(null, 'pressed'), radius: L.radius });
      if (o.showHex !== false) ctx.text((o.color || '#2563EB').toUpperCase(), B(box.x + 4 + sw + 8, box.y, box.w - sw - 20, box.h), { size: 13, color: C('ink'), align: 'left' });
      await ctx.settle(); ctx.place();
      if (S === 'focus') ctx.ring(box, { radius: L.radius });
      return ctx.host;
    }
    var pw = o.panelW || 216, gridH = 6 * (sw + 4) + 4;
    var box2 = B(o.x || 0, o.y || 0, pw, gridH + 268);
    var ctx2 = CF.build(CF.name('ColorPicker', { size: o.size, state: 'open', slot: 'Panel' }), box2, { parent: o.parent });
    panelPlate(ctx2, box2, { name: 'panel' });
    var hues = ['#EF4444', '#F97316', '#FACC15', '#22C55E', '#14B8A6', '#3B82F6'];
    for (var i = 0; i < 42; i++) {
      var cx2 = i % 7, cy2 = Math.floor(i / 7);
      ctx2.plate(B(box2.x + 8 + cx2 * (sw + 4), box2.y + 8 + cy2 * (sw + 4), sw, sw), { name: 'swatch·' + i, fill: hues[cx2], opacity: 1 - cy2 * 0.13, radius: 'xs', stroke: i === 0 ? C('ink') : null, strokeW: 2 });
    }
    var hy = box2.y + 8 + 6 * (sw + 4) + 8;
    ctx2.path(' M ' + (box2.x + 8) + ' ' + (hy + 4) + ' L ' + (box2.x + 8) + ' ' + (hy + 200) + ' L ' + (box2.x + 20) + ' ' + (hy + 200) + ' L ' + (box2.x + 20) + ' ' + (hy + 4) + ' Z', { name: 'hue·bar', fill: C('primary'), opacity: 0.2 });
    for (var k = 0; k < 6; k++) ctx2.plate(B(box2.x + 8, hy + k * 34, 12, 34), { name: 'hue·step·' + k, fill: hues[k], radius: 'none' });
    ctx2.ellipse(B(box2.x + 6, hy + 60, 16, 16), { name: 'hue·handle', fill: C('surface'), stroke: C('ink'), strokeW: 2 });
    var hb = B(box2.x + 32, hy, pw - 40, 32);
    ctx2.plate(hb, { name: 'hex·field', fill: C('surface'), stroke: C('border'), strokeW: 1, radius: 'sm' });
    ctx2.text((o.color || '#2563EB').toUpperCase(), B(hb.x + 8, hb.y, hb.w - 16, hb.h), { size: 13, color: C('ink'), align: 'left' });
    await ctx2.settle(); ctx2.place();
    if (o.state === 'focus') ctx2.ring(box2, { radius: 'sm' });
    return ctx2.host;
  };

  /** Upload: dashed dropzone 160-200 h (idle vs dragging) + file rows 48-56 (progress 4h, status, retry) + 64 thumbs. */
  CF.upload = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size || 'md');
    if (o.dropzone !== false && !(o.files || []).length && !o.grid) {
      var box = B(o.x || 0, o.y || 0, o.w || 360, o.h || 168);
      // §G12: every state the ladder names must be drawn — the wash used to be hard-coded to `hover`, so a Default
      // dropzone looked pressed and a Disabled one looked live.
      var US = o.dragging ? 'pressed' : (o.state || 'default');
      var wash = o.dragging ? 'selected' : (US === 'hover' ? 'hover' : (US === 'disabled' ? 'disabled' : null));
      var ctx = CF.build(CF.name('Upload', { state: o.dragging ? 'Pressed' : (o.state || 'default'), slot: 'Dropzone' }), box, { parent: o.parent, radius: 'sm', dashed: true, stroke: o.dragging ? C('primary') : C('borderStrong'), strokeW: 2 });
      ctx.host.fills = CF.fills(C('surface'), wash);
      var dim = stateAlpha(US === 'disabled' ? 'disabled' : null);
      ctx.glyph('upload', B(box.x + box.w / 2 - 20, box.y + 32, 40, 40), { color: o.dragging ? C('primary') : C('muted'), opacity: dim });
      ctx.text(o.dragging ? 'Drop to upload' : 'Drag files here or browse', B(box.x + 16, box.y + 88, box.w - 32, 22), { size: 14, weight: 500, color: C('ink'), opacity: dim });
      ctx.text('PNG, JPG or PDF up to 20 MB', B(box.x + 16, box.y + 112, box.w - 32, 18), { size: 12, color: C('muted'), opacity: dim });
      await ctx.settle(); ctx.place();
      if (o.state === 'focus') ctx.ring(box, { radius: 'sm' });
      return ctx.host;
    }
    if (o.grid) {
      var cols = o.cols || 6, ts = o.thumb || 64, gp = 8;
      var gb = B(o.x || 0, o.y || 0, o.w || (cols * (ts + gp) - gp), (o.rows || 2) * (ts + gp) - gp + 28);
      var gc = CF.build(CF.name('Upload', { slot: 'ImageGrid' }), gb, { parent: o.parent });
      for (var i = 0; i < cols * (o.rows || 2); i++) {
        var c2 = i % cols, r2 = Math.floor(i / cols);
        var tb = B(gb.x + c2 * (ts + gp), gb.y + r2 * (ts + gp), ts, ts);
        var add = i >= ((o.filled || 5));
        gc.plate(tb, { name: add ? 'thumb·add' : 'thumb', fill: add ? null : C('surfaceAlt'), stroke: C('border'), strokeW: 1, radius: 'sm', clip: true });
        if (add) gc.glyph('plus', CF.iconBox(tb, 20), { color: C('muted') });
        else gc.glyph('image', B(tb.x + 8, tb.y + 8, ts - 16, ts - 16), { color: C('muted') });
      }
      gc.text((o.filled || 5) + ' of ' + (cols * (o.rows || 2)) + ' files', B(gb.x, gb.y + (o.rows || 2) * (ts + gp), gb.w, 20), { size: 12, color: C('muted'), align: 'left', valign: 'top' });
      await gc.settle(); gc.place();
      return gc.host;
    }
    var files = o.files || [{ name: 'brand-kit.pdf', size: '2.4 MB', status: 'done' }, { name: 'hero@2x.png', size: '812 KB', pct: 0.62, status: 'up' }, { name: 'scan.pdf', size: '1.1 MB', status: 'error' }];
    var rowH = 56, fb = B(o.x || 0, o.y || 0, o.w || 400, files.length * rowH + 8);
    var fc = CF.build(CF.name('Upload', { slot: 'FileList' }), fb, { parent: o.parent });
    files.forEach(function (f, i) {
      var rb = B(fb.x + 4, fb.y + 4 + i * rowH, fb.w - 8, rowH - 8);
      fc.plate(rb, { name: 'row·' + (i + 1), fill: C('surfaceAlt'), radius: 'sm' });
      fc.glyph('file', B(rb.x + 12, rb.y + (rb.h - 24) / 2, 24, 24), { color: f.status === 'error' ? C('error') : C('muted') });
      fc.text(f.name, B(rb.x + 48, rb.y + 8, rb.w - 120, 18), { size: 14, color: C('ink'), align: 'left', valign: 'top', refit: false });
      fc.text(f.size || '', B(rb.x + 48, rb.y + 26, 100, 16), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
      if (f.status === 'up') {
        var pw2 = rb.w - 160;
        fc.plate(B(rb.x + 48, rb.y + rb.h - 10, pw2, 4), { name: 'progress·track', fills: [{ fillColor: C('ink'), fillOpacity: 0.12 }], radius: 'xs' });
        fc.plate(B(rb.x + 48, rb.y + rb.h - 10, pw2 * (f.pct || 0.5), 4), { name: 'progress·fill', fill: C('primary'), radius: 'xs' });
      }
      var st = f.status === 'error' ? 'error' : (f.status === 'done' ? 'success' : null);
      if (st) fc.glyph(st, B(rb.x + rb.w - 92, rb.y + (rb.h - 18) / 2, 18, 18), { color: f.status === 'error' ? C('error') : C('success') });
      if (f.status === 'error') fc.text('Retry', B(rb.x + rb.w - 70, rb.y, 44, rb.h), { size: 12, color: C('primary') });
      fc.glyph('close', B(rb.x + rb.w - 24, rb.y + (rb.h - 14) / 2, 14, 14), { color: C('muted'), strokeW: 1.5 });
    });
    await fc.settle(); fc.place();
    return fc.host;
  };

  /** Transfer: two 240-280×320 panels, header 40 (count + select-all), rows 36-40, 32-40 middle buttons vertical. */
  CF.transfer = async function (o) {
    o = o || {};
    // §G12: a transfer panel is focusable/hoverable/disabled as a whole (the row it points at lights up), so the host
    // carries the state token — a spec ladder must be able to show all five without inventing a second factory.
    var S = o.state || 'default';
    var pw = o.panelW || 260, ph = o.panelH || 320, mid = 48;
    var rowH = o.rowH || (o.size === 'sm' ? 32 : (o.size === 'lg' ? 44 : 38));
    var showCheck = o.checkable !== false;
    var box = B(o.x || 0, o.y || 0, pw * 2 + mid, ph);
    var ctx = CF.build(CF.name('Transfer', { size: o.size, state: S,
      slot: [o.withSearch ? 'Search' : null, o.oneWay ? 'OneWay' : null, showCheck ? null : 'NoCheck'].filter(Boolean).join('-') || null }), box, { parent: o.parent });
    var left = o.left || ['Ann', 'Bo', 'Cy'], right = o.right || ['Di', 'Ed'];
    var subs = [];
    [[0, left], [1, right]].forEach(function (pair) {
      var px = box.x + pair[0] * (pw + mid), pb = B(px, box.y, pw, ph);
      panelPlate(ctx, pb, { name: 'panel·' + (pair[0] ? 'right' : 'left'), shadow: 0, outline: true });
      ctx.plate(B(pb.x + 1, pb.y + 1, pb.w - 2, 40), { name: 'header·' + pair[0], fill: C('surfaceAlt'), radius: 'sm' });
      if (showCheck) subs.push(CF.checkbox({ x: pb.x + 12, y: pb.y + 12, h: 16, size: 'xs', parent: ctx.host,
        indeterminate: pair[0] ? false : true, checked: pair[0] === 1 }));
      ctx.text(pair[1].length + ' / ' + (o.total || 12), B(pb.x + (showCheck ? 40 : 12), pb.y, 90, 40), { size: 12, color: C('muted') });
      var y = pb.y + 40 + (o.withSearch ? 44 : 4);
      if (o.withSearch) ctx.plate(B(pb.x + 8, pb.y + 44, pb.w - 16, 32), { name: 'search', fill: C('surfaceAlt'), radius: 'sm' });
      pair[1].forEach(function (nm, i) {
        var rb = B(pb.x + 4, y + i * rowH, pb.w - 8, rowH - 2);
        if (i === 0 && (S === 'hover' || S === 'pressed')) ctx.plate(rb, { name: 'row·' + (S === 'pressed' ? 'pressed' : 'hover'), fills: CF.fills(null, S), radius: 'xs' });
        if (i === (pair[0] ? 1 : 1) && o.selected !== false) ctx.plate(rb, { name: 'row·selected', fills: CF.fills(C('primary'), 'selected', { tint: 1 }), radius: 'xs' });
        if (showCheck) subs.push(CF.checkbox({ x: rb.x + 8, y: rb.y + (rb.h - 16) / 2, h: 16, size: 'xs', boxSize: 16, checked: i === 1, parent: ctx.host }));
        ctx.text(nm, B(rb.x + (showCheck ? 34 : 12), rb.y, rb.w - (showCheck ? 42 : 20), rb.h), { size: 14, color: i === 3 ? C('muted') : C('ink'), opacity: i === 3 ? CF.STATE.disabledContent : 1, align: 'left', valign: 'middle' });
      });
    });
    [['chevronRight', box.x + pw + 8, box.y + ph / 2 - 40], ['chevronLeft', box.x + pw + 8, box.y + ph / 2 + 4]].forEach(function (b, i) {
      if (i && o.oneWay) return;                                  // one-way transfer moves left → right only
      var bb2 = B(b[1], b[2], 32, 32);
      ctx.plate(bb2, { name: 'button·' + i, fill: i ? C('surface') : C('primary'), stroke: i ? C('border') : null, strokeW: 1, radius: 'sm' });
      if (i && S === 'pressed') ctx.plate(bb2, { name: 'button·pressed', fills: CF.fills(null, 'pressed'), radius: 'sm' });
      ctx.glyph(b[0], bb2, { color: i ? C('ink') : C('onPrimary') });
    });
    await ctx.settle(); ctx.place(); await Promise.all(subs);
    if (S === 'focus') ctx.ring(B(box.x, box.y, pw, ph), { radius: 'sm' });
    return ctx.host;
  };

  /** Tree / tree-select: row 32-36, indent 16/level, chevron 16, checkbox 18, guide lines, parent indeterminate. */
  CF.tree = async function (o) {
    o = o || {};
    var S = o.state || 'default';
    var rowH = o.rowH || (o.size === 'sm' ? 28 : (o.size === 'lg' ? 40 : 32));
    var nodes = o.nodes || [
      { label: 'src', level: 0, expanded: true, checkable: o.checkable, indeterminate: true },
      { label: 'core', level: 1, expanded: true, checkable: o.checkable, checked: true },
      { label: 'layout.cljs', level: 2, checkable: o.checkable, checked: true, leaf: true },
      { label: 'flex.cljs', level: 2, checkable: o.checkable, leaf: true, loading: o.async },
      { label: 'dist', level: 0, collapsed: true, checkable: o.checkable }
    ];
    var box = B(o.x || 0, o.y || 0, o.w || 260, nodes.length * rowH + 4);
    var ctx = CF.build(CF.name('Tree', { size: o.size, state: S,
      slot: [o.checkable ? 'Checkable' : null, o.async ? 'Async' : null, o.guides ? 'Guides' : null].filter(Boolean).join('-') || null }), box, { parent: o.parent });
    var subs = [];
    nodes.forEach(function (n, i) {
      var gut = 6 + n.level * 16;                       // gutter grows with depth, chevron always inside the host
      var rb = B(box.x, box.y + 2 + i * rowH, box.w, rowH - 2);
      var cur = i === (o.cursor === undefined ? 0 : Number(o.cursor));
      if (n.active) ctx.plate(B(rb.x + 4, rb.y, rb.w - 8, rb.h), { name: 'row·active', fills: CF.fills(C('primary'), 'selected', { tint: 1 }), radius: 'xs' });
      else if (n.hover || (cur && (S === 'hover' || S === 'pressed'))) ctx.plate(B(rb.x + 4, rb.y, rb.w - 8, rb.h),
        { name: 'row·' + (S === 'pressed' && !n.hover ? 'pressed' : 'hover'), fills: CF.fills(null, S === 'pressed' && !n.hover ? 'pressed' : 'hover'), radius: 'xs' });
      else if (cur && S === 'selected') ctx.plate(B(rb.x + 4, rb.y, rb.w - 8, rb.h), { name: 'row·selected', fills: CF.fills(C('primary'), 'selected', { tint: 1 }), radius: 'xs' });
      if (!n.leaf) ctx.glyph(n.expanded ? 'chevronDown' : 'chevronRight', B(rb.x + gut, rb.y + (rb.h - 14) / 2, 14, 14), { color: C('muted'), strokeW: 1.6 });
      var tx = rb.x + gut + 18;
      if (o.checkable || n.checkable) {
        subs.push(CF.checkbox({ x: tx, y: rb.y + (rb.h - 16) / 2, h: 16, size: 'xs', boxSize: 16, parent: ctx.host,
          checked: n.checked, indeterminate: n.indeterminate }));
        tx += 24;
      }
      if (n.loading) CF.spinner(ctx, B(tx, rb.y + (rb.h - 14) / 2, 14, 14), C('muted'), 1.5);
      else ctx.glyph(n.leaf ? 'file' : 'folder', B(tx, rb.y + (rb.h - 16) / 2, 16, 16), { color: C('muted') });
      tx += 22;
      ctx.text(n.label, B(tx, rb.y, max(20, rb.x + rb.w - tx - 8), rb.h), { size: 14, color: C('ink'), align: 'left', valign: 'middle', refit: false, opacity: stateAlpha(S === 'disabled' ? 'disabled' : null) });
      if (o.guides && n.level) ctx.plate(B(rb.x + 6 + (n.level - 1) * 16 + 6, rb.y, 1, rb.h), { name: 'guide', fill: C('border') });
    });
    await ctx.settle(); ctx.place(); await Promise.all(subs);
    if (S === 'focus') {
      var fr = B(box.x + 4, box.y + 2 + (o.cursor === undefined ? 0 : Number(o.cursor)) * rowH, box.w - 8, rowH - 2);
      ctx.ring(fr, { radius: 'xs' });
    }
    return ctx.host;
  };

  // ================================================================ C · Data display (§3.3)
  // [wash, graphic hue, ink] — §4: the base hue is for icons/dots/borders; only `ink` may carry copy (on the wash, or
  // as the solid surface under white). Everything that paints a *label* in a tone reads t[2].
  var TONEMAP = { neutral: ['surfaceAlt', 'ink', 'ink'], accent: ['primarySoft', 'primary', 'primaryInk'],
    info: ['infoSoft', 'info', 'infoInk'],
    success: ['successSoft', 'success', 'successInk'], warning: ['warningSoft', 'warning', 'warningInk'],
    danger: ['errorSoft', 'error', 'errorInk'], error: ['errorSoft', 'error', 'errorInk'],
    processing: ['infoSoft', 'info', 'infoInk'] };
  CF.tintOf = function (tone) { return TONEMAP[tone] || TONEMAP.neutral; };
  CF.toneText = function (tone) { return C((TONEMAP[tone] || TONEMAP.neutral)[2]); };

  /** Badge — dot 6 / label pill h16, count min-w 16 pad-X 4 (10-11/700), overflow 99+, offset -4…-8 [spec M3]. */
  CF.badge = async function (o) {
    o = o || {};
    var dot = o.dot || o.value === undefined && !o.text;
    var tone = o.tone || 'danger';
    var soft = TONEMAP[tone] ? TONEMAP[tone][0] : 'errorSoft';
    // §4: a tone may carry copy only at its ink step — as text on the wash, or as the solid surface under white.
    var deep = TONEMAP[tone] ? C(TONEMAP[tone][2]) : C(tone);
    var bg = o.soft ? C(soft) : deep;
    var ink = o.soft ? deep : C('onPrimary');
    var h = dot ? 6 : 20, w = dot ? 6 : max(20, CF.estW(String(o.text === undefined ? (o.value === undefined ? '' : String(o.value)) : o.text), 12) + 12);
    var txt = dot ? null : (o.text === undefined ? (o.value === undefined ? '' : (Number(o.value) > (o.max || 99) ? (o.max || 99) + '+' : String(o.value))) : String(o.text));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Badge', { type: dot ? 'Dot' : (o.status ? 'Status' : 'Count'), tone: tone, state: o.state }), box, { parent: o.parent });
    ctx.host.fills = [{ fillColor: bg, fillOpacity: 1 }];
    ctx.host.borderRadius = CF.radius('control');
    if (o.standalone || o.ring) ctx.host.strokes = [{ strokeColor: C('surface'), strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner', strokeStyle: 'solid' }];
    if (txt) ctx.text(txt, box, { size: 12, color: ink, weight: 700 });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Status dot + text pair (M3 "status text+dot"), used by badge status list, timeline nodes, table state cells. */
  CF.statusText = async function (o) {
    o = o || {};
    var tone = o.tone || 'success', fs = o.fs || 13;
    var lw = CF.estW(String(o.label || ''), fs), box = B(o.x || 0, o.y || 0, 12 + lw, max(16, fs + 4));
    var ctx = CF.build(CF.name('Status', { tone: tone }), box, { parent: o.parent });
    ctx.ellipse(B(box.x, box.y + (box.h - 8) / 2, 8, 8), { name: 'dot', fill: C(TONEMAP[tone] ? TONEMAP[tone][1] : (tone === 'neutral' ? 'muted' : tone)) });
    ctx.text(String(o.label || ''), B(box.x + 12, box.y, lw, box.h), { size: fs, color: C('ink'), align: 'left' });
    await ctx.settle(); ctx.place(); ctx.refit(0);
    return ctx.host;
  };

  /** Chip / tag — h 24 (sm) · 32 (md), radius 4 (tag) or full (chip), leading dot 6-8 · icon 14-16 · avatar 24, ✕ 14-16. */
  CF.chip = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size || 'sm'), kind = o.kind || 'chip', S = o.state || 'default';
    var tone = o.tone || 'neutral', on = kind === 'filter' ? (o.selected !== false) : true;
    var h = o.h || (o.size === 'md' ? 32 : 24), padX = o.padX || (kind === 'tag' ? 8 : 12), ic = h >= 28 ? 18 : 14;
    var label = String(o.label === undefined ? 'Chip' : o.label);
    var leadW = (o.dot ? 8 : 0) + (o.lead ? ic + 6 : 0) + (o.avatar ? h - 8 + 6 : 0);
    var trailW = (o.removable ? ic + 4 : 0) + (o.trail ? ic + 4 : 0) + (o.count ? CF.estW(String(o.count), CF.countFs(L)) + 6 : 0);
    var box = B(o.x || 0, o.y || 0, o.w || (padX * 2 + leadW + CF.estW(label, L.fs) + trailW), h);
    var ctx = CF.build(CF.name('Chip', { type: kind, size: o.size, state: S, slot: slotName(o), tone: tone }), box,
      { parent: o.parent, radius: kind === 'tag' ? 'sm' : 'control' });
    var soft = TONEMAP[tone] || TONEMAP.neutral;
    // A link chip is CF.link with a pill outline, not a filled pill: its hue lives in the copy + underline, so the
    // host stays empty at rest. Giving it the base fill too made the copy primary-on-primary — invisible whenever the
    // brand hue is dark (a primary such as #161616), and §3.3 fails on the drawing, not on paper.
    var bgc = kind === 'link' ? null
      : kind === 'actionable' ? (on ? C('primary') : C('surface'))
      : (on ? C(soft[0]) : C('surface'));
    ctx.host.fills = CF.fills(bgc, S === 'default' ? null : (S === 'disabled' ? 'disabled' : S), { onDark: kind !== 'link' && on && tone === 'accent' });
    if (kind !== 'chip' && kind !== 'link') ctx._stroke(ctx.host, on ? C(soft[1]) : C('border'), tone === 'neutral' ? 1 : 1, S === 'disabled' ? 0.4 : (on ? 0.5 : 1));
    else if (kind === 'chip' && !on) ctx._stroke(ctx.host, C('borderStrong'), 1);
    var solidBrand = (kind === 'actionable') && on;                 // a filled brand chip: white copy on the base hue (5.17:1)
    var ink = kind === 'link' ? C('primary') : (solidBrand ? C('onPrimary')
      : (tone === 'neutral' ? C('ink') : C(soft[2])));               // §4 ink step on a wash
    ink = S === 'disabled' ? C('muted') : ink;
    var x = box.x + padX;
    if (o.dot) { ctx.ellipse(B(x, box.y + (h - 8) / 2, 8, 8), { name: 'dot', fill: ink }); x += 8 + 6; }
    if (o.avatar) { ctx.ellipse(B(x, box.y + 4, h - 8, h - 8), { name: 'avatar', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1 }); x += h - 8 + 6; }
    if (o.lead) { ctx.glyph(iconOf(o.lead, 'check'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, anchor: 'left' }); x += ic + 6; }
    ctx.text(label, B(x, box.y, box.w - (x - box.x) - padX - trailW + 4, h), { size: L.fs, color: ink, weight: kind === 'tag' ? 500 : 400,
      opacity: stateAlpha(S), align: 'left', underline: kind === 'link' ? ink : false });
    x = box.x + box.w - padX;
    if (o.count) { x -= CF.estW(String(o.count), CF.countFs(L)) + 6; ctx.text(String(o.count), B(x, box.y, CF.estW(String(o.count), CF.countFs(L)), h), { size: CF.countFs(L), color: ink, align: 'left' }); }
    if (o.trail) { x -= ic + 4; ctx.glyph(iconOf(o.trail, 'chevronDown'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, anchor: 'right' }); }
    if (o.removable) { x -= ic + 4; ctx.glyph('close', B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 1.6, anchor: 'right' }); }
    await ctx.settle(); ctx.place(); ctx.refit(padX);
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: 'control' });
    if (o.hit) ctx.hitPad(B(ctx.host.x, ctx.host.y, ctx.host.width, h), o.hit);
    return ctx.host;
  };

  /** Avatar — 24/32/40/48/64/96, circle·rounded·square, image·initials·icon, presence dot 8-10 with a 2px surface ring. */
  CF.avatar = async function (o) {
    o = o || {};
    var SCALE = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64, '2xl': 96 };
    var s = o.size !== undefined && SCALE[o.size] !== undefined ? SCALE[o.size] : (Number(o.size) || 40);
    var fs = s >= 64 ? 20 : (s >= 48 ? 16 : (s >= 32 ? 13 : 12));   // §3.2 ramp: an avatar's initials are copy, not a glyph
    var box = B(o.x || 0, o.y || 0, s, s);
    var ctx = CF.build(CF.name('Avatar', { size: o.size || s, slot: o.status ? ('Status·' + o.status) : (o.content === 'initials' ? 'Initials' : (o.editable ? 'Editable' : null)) }), box,
      { parent: o.parent, radius: o.shape === 'square' ? 'none' : (o.shape === 'rounded' ? 'sm' : 'control'), clip: s < 999 });
    ctx.host.fills = [{ fillColor: C('surfaceAlt'), fillOpacity: 1 }];
    if (o.image) {
      ctx.host.fills = [{ fillColor: C('border'), fillOpacity: 1 }];
      ctx.glyph('image', B(box.x + s * 0.22, box.y + s * 0.22, s * 0.56, s * 0.56), { color: C('muted') });
    } else if (o.content === 'icon' || (!o.initials && !o.name)) {
      ctx.glyph(o.glyph || 'user', B(box.x + s * 0.24, box.y + s * 0.24, s * 0.52, s * 0.52), { color: C('muted') });
    } else {
      var ini = String(o.initials !== undefined ? o.initials : (o.name || '').split(/\s+/).map(function (p) { return p[0]; }).join('').slice(0, 2).toUpperCase());
      ctx.host.fills = CF.fills(C(o.tone === 'accent' ? 'primary' : 'surfaceAlt'), null);
      ctx.text(ini, box, { size: fs, color: o.tone === 'accent' ? C('onPrimary') : C('ink'), weight: 600 });
    }
    if (o.status) {
      var d = max(8, s * 0.28), sb = B(box.x + s - d - 2, box.y + s - d - 2, d, d);
      ctx.ellipse(B(sb.x - 2, sb.y - 2, d + 4, d + 4), { name: 'presence·ring', fill: C('surface') });
      ctx.ellipse(sb, { name: 'presence', fill: C(o.status === 'online' ? 'success' : (o.status === 'busy' ? 'error' : (o.status === 'away' ? 'warning' : 'muted'))) });
    }
    if (o.editable) {
      ctx.plate(B(box.x, box.y + s - s * 0.4, s, s * 0.4), { name: 'editable·scrim', fill: C('ink'), opacity: 0.55 });
      ctx.glyph('camera', B(box.x + s / 2 - s * 0.15, box.y + s - s * 0.32, s * 0.3, s * 0.3), { color: '#FFFFFF' });
    }
    if (o.ring) ctx.ring(box, { radius: 'control', offset: 2, width: 2 });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Avatar/group stack — ≤5 visible then +N overflow, 8px overlap (M3 16dp), z-order right→left. */
  CF.avatarGroup = async function (o) {
    o = o || {};
    var s = o.size || 32, n = (o.members || 5).length, over = max(0, (o.total || n) - n), ov = s * 0.3;
    var box = B(o.x || 0, o.y || 0, s + (n - 1) * (s - ov) + (over ? s - ov + 6 : 0), s);
    var ctx = CF.build(CF.name('Avatar', { slot: 'Group' }), box, { parent: o.parent });
    for (var i = 0; i < n; i++) await CF.avatar({ parent: ctx.host, x: box.x + i * (s - ov), y: box.y, size: s, initials: (o.members[i] || '').slice(0, 2), name: o.members[i] });
    if (over) {
      var xb = B(box.x + n * (s - ov), box.y, s, s);
      ctx.ellipse(xb, { name: 'overflow·bg', fill: C('surfaceAlt'), stroke: C('surface'), strokeW: 2 });
      ctx.text('+' + over, xb, { size: s >= 40 ? 13 : 12, color: C('ink'), weight: 600 });
      await ctx.settle(); ctx.place();
    }
    return ctx.host;
  };

  /** Card — pad 24 (16 compact) · header 56 · body · footer 64 · cover full-bleed · action row · selectable · skeleton. */
  CF.card = async function (o) {
    o = o || {};
    var tone = o.tone || 'outlined', S = o.state || 'default', pad = o.pad || (tone === 'elevated' ? 24 : 20);
    var w = o.w || 320, headerH = o.title ? 56 : 0, coverH = o.cover ? (o.coverH || Math.round(w * 0.5)) : 0;
    var bodyH = o.h ? 0 : (o.bodyH || (o.body ? max(28, Math.ceil(CF.estW(String(o.body), 13) / max(80, w - pad * 2)) * 20 + 8) : 24));
    var footerH = (o.actions || o.footer) ? 56 : 0;
    var box = B(o.x || 0, o.y || 0, w, coverH + headerH + bodyH + footerH + pad * (coverH ? 1 : 2));
    var ctx = CF.build(CF.name('Card', { type: tone, state: S, slot: o.cover ? 'Cover' : (o.selectable ? 'Selectable' : null) }), box,
      { parent: o.parent, radius: CF.radius(o.radius || 'md'), stroke: tone === 'outlined' ? C('border') : null, strokeW: 1, shadow: tone === 'elevated' ? (o.elev || 1) : 0, clip: true });
    if (tone !== 'outlined') ctx.host.fills = [{ fillColor: C(tone === 'filled' ? 'surfaceAlt' : 'surface'), fillOpacity: 1 }];
    else ctx.host.fills = [{ fillColor: C('surface'), fillOpacity: 1 }];
    if (S === 'hover' && tone === 'elevated') ctx.host.shadows = CF.shadow((o.elev || 1) + 1);
    if (S === 'hover' && tone !== 'elevated') ctx.host.fills = CF.fills(C('surface'), 'hover');
    var y = box.y;
    if (o.cover) {
      // the outlined host carries its border on its own box, and a board paints children over that stroke: a flush cover
      // plate erases the card's L/T/R border (stroke_covered). Inset it on the three bordered sides only — the cover's
      // bottom edge is interior, so it may run to the full height.
      var ci = tone === 'outlined' ? 1 : 0;
      ctx.plate(B(box.x + ci, y + ci, box.w - ci * 2, coverH - ci), { name: 'cover', fill: C(o.coverTone || 'border'), stroke: null });
      ctx.glyph('image', B(box.x + box.w / 2 - 24, y + coverH / 2 - 24, 48, 48), { color: C('muted') });
      if (o.coverLabel) ctx.text(String(o.coverLabel), B(box.x + 12, y + coverH - 32, box.w - 24, 24), { size: 12, color: CF.onTone(o.coverTone || 'border'), align: 'left' });
      y += coverH;
    }
    if (o.selectable) {
      var sel = S === 'selected' || o.checked;
      if (sel) { ctx.host.fills = CF.fills(C('primary'), 'selected', { tint: 1 }); ctx._stroke(ctx.host, C('primary'), 2); }
      ctx.hitPad(B(box.x + pad, y + pad - 4, 20, 20), 32);
      await CF.checkbox({ parent: ctx.host, x: box.x + pad, y: y + (o.title ? pad - 2 : 12), checked: sel, size: 'sm', state: S === 'disabled' ? 'disabled' : 'default' });
    }
    var contentX = box.x + pad + (o.selectable ? 36 : 0), contentW = box.w - pad * 2 - (o.selectable ? 36 : 0);
    if (o.title) {
      ctx.text(String(o.title), B(contentX, y + pad - 4, contentW - (o.extra ? 60 : 0), 24), { size: o.titleFs || 16, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false });
      if (o.subtitle) ctx.text(String(o.subtitle), B(contentX, y + pad + 20, contentW, 18), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
      if (o.extra) {
        if (typeof o.extra === 'string') ctx.text(o.extra, B(box.x + box.w - pad - 60, y + pad - 2, 60, 20), { size: 12, color: C('muted'), align: 'right' });
        else await CF.iconButton({ parent: ctx.host, x: box.x + box.w - pad - 28, y: y + pad - 4, size: 'xs', glyph: 'dots' });
      }
      y += headerH;
    }
    if (o.body) ctx.text(String(o.body), B(contentX, y, contentW, bodyH), { size: 13, color: C('ink'), opacity: 0.85, align: 'left', valign: 'top', refit: false });
    if (o.mediaLeft) { ctx.plate(B(box.x + pad, y + 2, o.mediaW || 88, bodyH - 6), { name: 'media', fill: C('border'), radius: 'sm' }); }
    y += bodyH;
    if (footerH) {
      ctx.plate(B(box.x + pad, y + 8, box.w - pad * 2, 1), { name: 'boundary·footer', fill: C('border') });
      if (o.actions) {
        // `actions: true` is the shorthand the spec tables use for "show me an action row"; only an array of labels can
        // be rendered, and reading `.length` off a boolean threw mid-factory, leaving a host that no row owned (the
        // orphan was never centred, so it sat on top of the next row).
        var acts = o.actions === true ? ['Details', 'Share'] : o.actions;
        var aw = (box.w - pad * 2) / acts.length;
        acts.forEach(function (a, i) {
          if (i) ctx.plate(B(box.x + pad + i * aw, y + 8, 1, footerH - 8), { name: 'boundary·action', fill: C('border'), opacity: 0.7 });
          ctx.text(String(a), B(box.x + pad + i * aw, y + 8, aw, footerH - 8), { size: 14, color: C('primary'), weight: 500 });
        });
      } else if (o.footer) {
        var fx = box.x + box.w - pad;
        var btns = o.footer;
        for (var k = btns.length - 1; k >= 0; k--) {
          var bw = CF.estW(btns[k], 14) + 24;
          fx -= bw;
          await CF.button({ parent: ctx.host, x: fx, y: y + (footerH - (o.size === 'sm' ? 28 : 32)) / 2 + 4, label: btns[k], size: o.btnSize || 'sm', type: k === btns.length - 1 ? 'primary' : 'default' });
          fx -= 8;
        }
      }
    }
    if (o.loading) { ctx.plate(B(contentX, box.y + pad + (coverH || 0) + 4, contentW, 12), { name: 'skeleton·line', fill: C('border'), radius: 'xs' }); }
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(box, { radius: CF.radius(o.radius || 'md') });
    return ctx.host;
  };

  /** KPI / statistic — label 12-13 muted · value 28-36 tabular · delta 13 + arrow (colour AND sign) · sparkline 60-80×24. */
  CF.kpi = async function (o) {
    o = o || {};
    var pad = o.pad || 20, w = o.w || 240, vs = o.valueFs || 32;
    var delta = o.delta === undefined ? null : Number(o.delta);
    var h = o.h || (pad * 2 + 18 + vs + (delta !== null ? 20 : 0) + (o.spark ? 26 : 0));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('KPI', { type: o.spark ? 'Sparkline' : (delta !== null ? 'Delta' : 'Compact'), state: o.state }), box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), stroke: o.bordered === false ? null : C('border'), strokeW: 1 });
    ctx.text(String(o.label === undefined ? 'Active users' : o.label), B(box.x + pad, box.y + pad - 2, w - pad * 2, 18),
      { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
    var value = String(o.value === undefined ? '1,284' : o.value);
    ctx.text(value, B(box.x + pad, box.y + pad + 16, w - pad * 2, vs + 6), { size: vs, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false });
    var yy = box.y + pad + 16 + vs + 6;
    if (delta !== null) {
      var up = delta >= 0, good = o.inverse ? !up : up;
      var dcol = C(good ? 'success' : 'error');
      ctx.glyph(up ? 'arrowUp' : 'arrowDown', B(box.x + pad, yy + 2, 14, 14), { color: dcol, strokeW: 1.8 });
      ctx.text((up ? '+' : '') + delta + (o.deltaUnit === undefined ? '%' : o.deltaUnit), B(box.x + pad + 18, yy, 70, 18),
        { size: 13, color: dcol, weight: 500, align: 'left', valign: 'top' });
      if (o.deltaNote) ctx.text(String(o.deltaNote), B(box.x + pad + 92, yy, w - pad - 92, 18), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
    }
    if (o.spark) {
      var data = (Array.isArray(o.spark) && o.spark.length > 1) ? o.spark.map(Number) : [8, 12, 9, 14, 13, 18, 16, 22, 19, 24];
      var sw = min(120, w - pad * 2), sh = 24, sx = box.x + w - pad - sw, sy = box.y + h - pad - sh;
      var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), rng = (mx - mn) || 1;
      var f = function (v) { return v.toFixed(1); };
      var pts = data.map(function (v, i) { return [sx + sw * i / (data.length - 1), sy + sh - sh * (v - mn) / rng]; });
      var d = 'M ' + f(pts[0][0]) + ' ' + f(pts[0][1]);
      pts.forEach(function (p, i) { if (i) d += ' L ' + f(p[0]) + ' ' + f(p[1]); });
      // area first, line second: ctx.path appends, so a later sibling paints over the earlier one and an area drawn
      // on top of its own polyline flattens the spark into a tint block (stroke_covered).
      ctx.path(d + ' L ' + f(pts[pts.length - 1][0]) + ' ' + f(sy + sh) + ' L ' + f(pts[0][0]) + ' ' + f(sy + sh) + ' Z',
        { name: 'sparkline·area', fill: C('primary'), opacity: 0.10 });
      ctx.path(d, { name: 'sparkline', stroke: C('primary'), strokeW: 2 });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Progress — line h4-8 · circle 48 stroke 4 · dashboard 270° arc · segmented steps; normal/success/exception, indeterminate. */
  CF.progress = async function (o) {
    o = o || {};
    var type = o.type || 'line', p = o.value === undefined ? 0.62 : (Number(o.value) > 1 ? Number(o.value) / 100 : Number(o.value));
    p = max(0, min(1, p));
    var st = o.status || (p >= 1 ? 'success' : 'normal'), L = CF.ladder(o.size || 'md');
    var th = o.thick || (type === 'line' ? (o.size === 'lg' ? 8 : 4) : 4);
    var col = st === 'exception' || st === 'error' ? C('error') : (st === 'success' ? C('success') : C('primary'));
    if (type === 'circle' || type === 'dashboard') {
      var d = o.diameter || 48, cx = (o.x || 0) + d / 2, cy = (o.y || 0) + d / 2, r = d / 2 - th;
      var a0 = type === 'dashboard' ? 135 : -90, sweep = type === 'dashboard' ? 270 : 360;
      var box = B(o.x || 0, o.y || 0, d, d);
      var ctx = CF.build(CF.name('Progress', { type: type, state: st }), box, { parent: o.parent });
      ctx.path(CF.arc(cx, cy, r, a0, a0 + sweep), { name: 'track', stroke: C('ink'), strokeW: th, opacity: 0.12 });
      if (o.indeterminate) ctx.path(CF.arc(cx, cy, r, a0, a0 + sweep * 0.28), { name: 'fill', stroke: col, strokeW: th });
      else ctx.path(CF.arc(cx, cy, r, a0, a0 + sweep * p), { name: 'fill', stroke: col, strokeW: th });
      ctx.text(Math.round(p * 100) + '%', box, { size: o.labelFs || 13, color: C('ink'), weight: 600 });
      await ctx.settle(); ctx.place();
      return ctx.host;
    }
    if (type === 'steps') {
      var n = o.steps || 5, cellW = 20, box2 = B(o.x || 0, o.y || 0, n * cellW + (n - 1) * 2, th + 4);
      var c2 = CF.build(CF.name('Progress', { type: 'steps', state: st }), box2, { parent: o.parent });
      for (var i = 0; i < n; i++) c2.plate(B(box2.x + i * (cellW + 2), box2.y + 2, cellW, th), { name: 'cell·' + (i + 1), fill: i < p * n ? col : C('ink'), opacity: i < p * n ? 1 : 0.12, radius: 'control' });
      return c2.host;
    }
    var w = o.w || 240, showLabel = o.format !== false && !o.hideLabel, labW = showLabel ? 42 : 0;
    var box3 = B(o.x || 0, o.y || 0, w, max(th, 16));
    var ctx3 = CF.build(CF.name('Progress', { type: 'line', state: st, slot: o.indeterminate ? 'Indeterminate' : null }), box3, { parent: o.parent });
    ctx3.plate(B(box3.x, box3.y + (box3.h - th) / 2, box3.w - labW, th), { name: 'track', fill: C('ink'), opacity: 0.12, radius: 'control' });
    var fw = o.indeterminate ? (box3.w - labW) * 0.34 : (box3.w - labW) * p;
    ctx3.plate(B(box3.x, box3.y + (box3.h - th) / 2, max(2, fw), th), { name: 'bar', fill: col, radius: 'control' });
    if (o.indeterminate) ctx3.plate(B(box3.x + max(2, fw) - 12, box3.y + (box3.h - th) / 2, 12, th), { name: 'bar·shimmer', fill: '#FFFFFF', opacity: 0.55, radius: 'xs' });
    if (showLabel) ctx3.text(st === 'success' ? 'Done' : Math.round(p * 100) + '%', B(box3.x + box3.w - labW, box3.y, labW, box3.h),
      { size: 12, color: st === 'normal' ? C('ink') : col, align: 'right' });
    await ctx3.settle(); ctx3.place();
    return ctx3.host;
  };

  /** Skeleton — bar h12 radius 4 gap 8, block tint + 8% shimmer; geometry MUST mirror the real component. */
  CF.skeleton = async function (o) {
    o = o || {};
    var v = o.variant || 'paragraph', w = o.w || 240, bh = o.barH || 12, gap = o.gap || 8, tint = C('border');
    var lines = o.lines || 3, rows = o.rows || 3;
    var box, ctx;
    if (v === 'circle' || v === 'avatar') {
      var d = o.size || 40; box = B(o.x || 0, o.y || 0, d, d);
      ctx = CF.build(CF.name('Skeleton', { type: 'circle' }), box, { parent: o.parent });
      ctx.ellipse(box, { name: 'sk·circle', fill: tint });
      if (o.withText) { ctx.plate(B(box.x + d + 12, box.y + 4, w - d, bh), { name: 'sk·line', fill: tint, radius: 'xs' }); ctx.plate(B(box.x + d + 12, box.y + 4 + bh + 6, (w - d) * 0.6, bh), { name: 'sk·line', fill: tint, radius: 'xs' }); box = B(box.x, box.y, w + d + 12, box.h); ctx.host.resize(N(w + d + 12), box.h); }
    } else if (v === 'rect' || v === 'image') {
      box = B(o.x || 0, o.y || 0, w, o.h || 120);
      ctx = CF.build(CF.name('Skeleton', { type: 'rect' }), box, { parent: o.parent, radius: CF.radius('sm') });
      ctx.plate(box, { name: 'sk·rect', fill: tint, radius: CF.radius('sm') });
    } else if (v === 'button') {
      box = B(o.x || 0, o.y || 0, o.btnW || 100, CF.ladder(o.size).h);
      ctx = CF.build(CF.name('Skeleton', { type: 'button' }), box, { parent: o.parent, radius: L2r(o.size) });
      ctx.plate(box, { name: 'sk·button', fill: tint, radius: L2r(o.size) });
    } else if (v === 'list' || v === 'row') {
      var rowH = o.rowH || 48; box = B(o.x || 0, o.y || 0, w, rows * rowH);
      ctx = CF.build(CF.name('Skeleton', { type: 'list' }), box, { parent: o.parent });
      for (var r = 0; r < rows; r++) {
        var yy = box.y + r * rowH + (rowH - bh * 2 - 6) / 2;
        ctx.ellipse(B(box.x, yy, 32, 32 > rowH - 8 ? rowH - 8 : 32), { name: 'sk·media', fill: tint });
        ctx.plate(B(box.x + 44, yy + 2, w * (r % 2 ? 0.5 : 0.68), bh), { name: 'sk·title', fill: tint, radius: 'xs' });
        ctx.plate(B(box.x + 44, yy + 2 + bh + 6, w * 0.4, bh), { name: 'sk·sub', fill: tint, opacity: 0.7, radius: 'xs' });
        if (r) ctx.plate(B(box.x + 44, box.y + r * rowH - 1, w - 44, 1), { name: 'sk·divider', fill: C('border'), opacity: 0.6 });
      }
    } else {
      box = B(o.x || 0, o.y || 0, w, lines * bh + (lines - 1) * gap);
      ctx = CF.build(CF.name('Skeleton', { type: 'text' }), box, { parent: o.parent });
      for (var i = 0; i < lines; i++)
        ctx.plate(B(box.x, box.y + i * (bh + gap), i === lines - 1 ? w * 0.62 : w, bh), { name: 'sk·line·' + (i + 1), fill: tint, radius: 'xs' });
    }
    if (o.animated !== false) {
      var sh = B(box.x + box.w * 0.28, box.y, box.w * 0.24, box.h);
      ctx.plate(sh, { name: 'sk·shimmer', fill: '#FFFFFF', opacity: 0.35, radius: 'xs' });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Table header cell — h 40-48 · 12-13/600 muted · sort chevron 16 · filter icon (accent) · resize handle · pad-X 16. */
  CF.tableHeader = async function (o) {
    o = o || {};
    var L = CF.ladder(o.density === 'dense' ? 'sm' : (o.size || 'md'));
    var h = o.h || (o.density === 'dense' ? 32 : 40), padX = o.padX || (o.density === 'dense' ? 8 : 16);
    var label = String(o.label === undefined ? 'Column' : o.label);
    var sortW = o.sort ? 16 + 4 : 0, filtW = o.filter ? 16 + 4 : 0, resW = o.resizable ? 6 : 0;
    var w = o.w || max(80, padX * 2 + CF.estW(label, 12) + sortW + filtW + resW);
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('TableHeader', { state: o.sort ? 'Sorted·' + o.sort : (o.filter ? 'FilterActive' : 'Default'), slot: o.align === 'right' ? 'Numeric' : null }), box, { parent: o.parent });
    ctx.host.fills = CF.fills(C('surfaceAlt'), o.state === 'hover' ? 'hover' : null);
    var right = o.align === 'right';
    ctx.text(label, B(box.x + padX, box.y, box.w - padX * 2 - sortW - filtW - resW, box.h),
      { size: 12, color: o.sort || o.filter ? C('primary') : C('muted'), weight: 600, align: right ? 'right' : 'left', refit: false });
    var x = box.x + box.w - padX - resW;
    if (o.filter) { x -= filtW; ctx.glyph('filter', B(x, box.y + (box.h - 16) / 2, 16, 16), { color: C('primary'), strokeW: 1.6 }); }
    if (o.sort) { x -= sortW; ctx.glyph(o.sort === 'asc' ? 'caretUp' : 'caretDown', B(x, box.y + (box.h - 16) / 2, 16, 16), { color: C('primary'), fill: C('primary') }); }
    if (o.resizable) ctx.plate(B(box.x + box.w - 1, box.y + 8, 1, box.h - 16), { name: 'resize·handle', fill: C('borderStrong') });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Table row — 48/40/32 by density · cells pad 16/12/8 · hairline · hover 8% · selected 12% + 2px accent bar · checkbox col 44. */
  CF.tableRow = async function (o) {
    o = o || {};
    var dens = o.density || 'default';
    var h = o.h || ({ dense: 32, middle: 40, default: 48 }[dens] || 48);
    var padX = { dense: 8, middle: 12, default: 16 }[dens] || 16;
    var cells = o.cells || ['Row label', '1,024', 'Active', '—'];
    var widths = o.widths || cells.map(function (c, i) { return i === 0 ? max(160, (o.w || 720) * 0.34) : Math.floor(((o.w || 720) - (o.selectable ? 44 : 0) - max(160, (o.w || 720) * 0.34)) / (cells.length - 1)); });
    var w = o.w || widths.reduce(function (a, b) { return a + b; }, 0) + (o.selectable ? 44 : 0) + padX;
    var box = B(o.x || 0, o.y || 0, w, h);
    var S = o.state || 'default';
    var ctx = CF.build(CF.name('TableRow', { size: dens, state: S, slot: o.expandable ? 'Expandable' : (o.editing ? 'Editing' : null) }), box, { parent: o.parent });
    ctx.host.fills = S === 'selected' ? CF.fills(C('primary'), 'selected', { tint: 1 }) : (o.zebra ? CF.fills(C('surfaceAlt'), S === 'hover' ? 'hover' : null) : CF.fills(C('surface'), S === 'hover' ? 'hover' : (S === 'disabled' ? 'disabled' : null)));
    if (S === 'selected') ctx.plate(B(box.x, box.y, 2, box.h), { name: 'accent·bar', fill: C('primary') });
    var x = box.x + (o.selectable ? 44 : 0);
    var al = S === 'disabled' ? CF.STATE.disabledContent : 1;
    if (o.expandable) { ctx.glyph(o.expanded ? 'chevronDown' : 'chevronRight', B(box.x + 10, box.y + (h - 14) / 2, 14, 14), { color: C('muted') }); x += 4; }
    for (var ci = 0; ci < cells.length; ci++) {
      var c = cells[ci], cw = widths[ci] || 120,
          algn = (o.aligns && o.aligns[ci]) || (typeof c === 'number' || /^[\d.,%$–—-]/.test(String(c)) ? 'right' : 'left');
      if (o.editing && ci === (o.editIndex === undefined ? 0 : o.editIndex)) {
        await CF.input({ parent: ctx.host, x: x, y: box.y + (h - (dens === 'dense' ? 24 : 28)) / 2, w: cw - 8,
                         size: dens === 'dense' ? 'xs' : 'sm', value: String(c), state: 'focus' });
      } else if (c && typeof c === 'object') {
        if (c.tone) await CF.chip({ parent: ctx.host, x: algn === 'right' ? x + cw - padX - (c.w || 76) : x,
                                    y: box.y + (h - 24) / 2, label: c.label || '', size: 'sm', kind: 'tag', tone: c.tone });
        else if (c.progress !== undefined) await CF.progress({ parent: ctx.host, x: x, y: box.y + (h - 4) / 2, w: cw - padX, value: c.progress, hideLabel: true });
        else if (c.avatar) await CF.avatar({ parent: ctx.host, x: x, y: box.y + (h - 32) / 2, size: 32, name: c.avatar });
        else if (c.action) await CF.button({ parent: ctx.host, x: x, y: box.y + (h - 28) / 2, label: c.action, size: 'xs', type: c.type || 'link' });
        else if (c.badge) await CF.badge({ parent: ctx.host, x: x + (algn === 'right' ? cw - padX - 24 : 0), y: box.y + (h - 20) / 2, value: c.badge, tone: c.tone });
        else if (c.text !== undefined) ctx.text(String(c.text), B(x, box.y, cw - padX, h), { size: ci === 0 ? 14 : 13, color: C('ink'), opacity: al, align: algn, refit: false });
      } else {
        ctx.text(String(c), B(x, box.y, cw - padX, h), { size: ci === 0 ? 14 : 13, color: al < 1 ? C('muted') : C('ink'), weight: ci === 0 ? 500 : 400,
          opacity: al, align: algn, valign: 'middle', refit: false });
      }
      x += cw;
    }
    if (o.actions) {
      var ax = box.x + box.w - padX - o.actions.length * 32;
      for (var ai = 0; ai < o.actions.length; ai++)
        await CF.iconButton({ parent: ctx.host, x: ax + ai * 32, y: box.y + (h - 28) / 2, size: 'xs', glyph: o.actions[ai], tone: o.actions[ai] === 'trash' ? 'danger' : undefined });
    }
    if (o.selectable) await CF.checkbox({ parent: ctx.host, x: box.x + 14, y: box.y + (h - 18) / 2, size: 'xs', checked: S === 'selected', state: S === 'disabled' ? 'disabled' : 'default' });
    if (S === 'expanded' || (o.expandable && o.expanded)) {
      var childH = o.childH || 64;
      ctx.plate(B(box.x + 44, box.y + box.h, box.w - 44, childH), { name: 'expanded·panel', fills: CF.fills(C('surfaceAlt'), null), radius: CF.radius('sm') });
      ctx.text(String(o.childText || 'Expanded detail region'), B(box.x + 60, box.y + box.h + 8, box.w - 76, childH - 16), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
      try { ctx.host.resize(box.w, box.h + childH); } catch (e) {}
    }
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(B(box.x, box.y, box.w, box.h), { radius: 'none', offset: 0, width: 2 });
    return ctx.host;
  };

  /** Table container state — skeleton rows (same geometry as real rows) · empty · error with retry · no-permission. */
  CF.tableState = async function (o) {
    o = o || {};
    var kind = o.kind || 'skeleton', w = o.w || 720, rowH = o.rowH || 48, n = o.rows || 4;
    if (kind === 'error') {
      var box = B(o.x || 0, o.y || 0, w, 140);
      var c = CF.build(CF.name('Table', { slot: 'Error' }), box, { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), stroke: C('border') });
      c.glyph('warning', B(box.x + box.w / 2 - 18, box.y + 24, 36, 36), { color: C('error') });
      c.text(String(o.message || 'Could not load rows'), B(box.x, box.y + 68, box.w, 20), { size: 14, color: C('ink'), weight: 500 });
      await CF.button({ parent: c.host, x: box.x + box.w / 2 - 48, y: box.y + 94, label: 'Retry', size: 'sm', type: 'default' });
      await c.settle(); c.place();
      return c.host;
    }
    if (kind === 'empty' || kind === 'noPermission')
      return CF.emptyState(Object.assign({ x: o.x, y: o.y, w: w, h: o.h || 220, kind: kind === 'noPermission' ? '403' : 'no-data' }, o));
    var box2 = B(o.x || 0, o.y || 0, w, n * rowH + 40);
    var c2 = CF.build(CF.name('Table', { slot: 'Loading' }), box2, { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), stroke: C('border') });
    c2.plate(B(box2.x + 1, box2.y + 1, box2.w - 2, 40), { name: 'header', fill: C('surfaceAlt'), radius: 'none' });
    [0.16, 0.28, 0.2, 0.2].forEach(function (f, i) {
      var xx = box2.x + 16 + [0, 0.34, 0.6, 0.8][i] * (box2.w - 32);
      c2.plate(B(xx, box2.y + 14, (box2.w - 32) * f * (i ? 0.6 : 1), 12), { name: 'sk·head', fill: C('border'), radius: 'xs' });
    });
    for (var r = 0; r < n; r++) {
      var yy = box2.y + 40 + r * rowH;
      c2.plate(B(box2.x + 16, yy + (rowH - 12) / 2, (box2.w - 32) * 0.3, 12), { name: 'sk·cell', fill: C('border'), radius: 'xs' });
      c2.plate(B(box2.x + 16 + (box2.w - 32) * 0.36, yy + (rowH - 12) / 2, (box2.w - 32) * 0.16, 12), { name: 'sk·cell', fill: C('border'), radius: 'xs' });
      c2.plate(B(box2.x + 16 + (box2.w - 32) * 0.6, yy + (rowH - 12) / 2, (box2.w - 32) * 0.12, 12), { name: 'sk·cell', fill: C('border'), opacity: 0.7, radius: 'xs' });
    }
    return c2.host;
  };

  /** List item — 1/2/3 lines (40-48 / 64 / 88) · leading media 24/40/48/56 · trailing meta/action/chevron/switch/menu · divider indented to the text. */
  CF.listItem = async function (o) {
    o = o || {};
    var lines = o.lines || (o.sub ? 2 : 1);
    var media = (!o.leading || o.leading === 'none') ? 0 : (o.mediaSize || ({ 1: 24, 2: 40, 3: 48 }[lines] || 40));
    var h = o.h || ({ 1: 48, 2: 64, 3: 88 }[lines] || 48);
    var padX = o.padX || 16, padY = 12, gap = o.gap === undefined ? 12 : o.gap;
    var w = o.w || 360, trailW = o.trailing ? (o.trailing === 'meta' ? 90 : o.trailing === 'chevron' ? 24 : o.trailing === 'switch' ? 48 : 32) : 0;
    var S = o.state || 'default';
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('ListItem', { size: lines + 'line', state: S, slot: o.trailing ? ('Trail·' + o.trailing) : null }), box, { parent: o.parent });
    ctx.host.fills = S === 'selected' ? CF.fills(C('primary'), 'selected', { tint: 1 }) : CF.fills(C('surface'), S === 'hover' ? 'hover' : null);
    var tx = box.x + padX + (media ? media + gap : 0);
    if (o.leading === 'avatar') await CF.avatar({ parent: ctx.host, x: box.x + padX, y: box.y + (h - media) / 2, size: media, name: o.title, tone: o.tone });
    else if (o.leading === 'icon' || o.leading === 'checkbox') {
      if (o.leading === 'checkbox') await CF.checkbox({ parent: ctx.host, x: box.x + padX + 4, y: box.y + (h - 18) / 2, size: 'sm', checked: o.checked, state: S === 'disabled' ? 'disabled' : 'default' });
      else ctx.plate(B(box.x + padX, box.y + (h - media) / 2, media, media), { name: 'icon·wrap', fill: C('surfaceAlt'), radius: CF.radius('sm') }, 'left'),
        ctx.glyph(iconOf(o.glyph, 'file'), B(box.x + padX + media * 0.2, box.y + (h - media) / 2 + media * 0.2, media * 0.6, media * 0.6), { color: C('muted') });
    } else if (o.leading === 'thumb') {
      ctx.plate(B(box.x + padX, box.y + (h - media) / 2, media, media), { name: 'thumb', fill: C('border'), radius: CF.radius('sm') }, 'left');
      ctx.glyph('image', B(box.x + padX + media * 0.25, box.y + (h - media) / 2 + media * 0.25, media * 0.5, media * 0.5), { color: C('muted') });
    }
    var textW = box.w - (tx - box.x) - padX - trailW;
    // The copy block (title + optional sub/meta) is centred as a whole inside the row. A one-line row used to start at
    // `box.y`, so its 14/1.4 title sat at the TOP of a 48px row while the leading icon and trailing chevron were
    // vertically centred — measured 2026-10-22 on `ListItem·1line·Trail·chevron` (title centre 14px above the host's).
    var blockH = lines === 1 ? 22 : (lines === 2 ? 38 : 56);
    var titleY = box.y + (h - blockH) / 2;
    ctx.text(String(o.title === undefined ? 'List item' : o.title), B(tx, titleY, textW, 22),
      { size: 14, color: S === 'disabled' ? C('muted') : C('ink'), weight: 500, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
    if (lines >= 2) ctx.text(String(o.sub === undefined ? 'Secondary line, one row only' : o.sub), B(tx, titleY + 20, textW, 18),
      { size: 13, color: C('muted'), opacity: stateAlpha(S), align: 'left', valign: 'top', refit: false });
    if (lines >= 3) ctx.text(String(o.meta || 'Tertiary detail'), B(tx, titleY + 40, textW, 16),
      { size: 12, color: C('muted'), opacity: stateAlpha(S, 0.8), align: 'left', valign: 'top', refit: false });
    if (o.trailing === 'meta') ctx.text(String(o.metaRight || '2h'), B(box.x + box.w - padX - trailW, box.y, trailW, h),
      { size: 12, color: C('muted'), align: 'right', valign: 'middle', refit: false });
    else if (o.trailing === 'chevron') ctx.glyph('chevronRight', B(box.x + box.w - padX - 16, box.y + (h - 16) / 2, 16, 16), { color: C('muted') });
    else if (o.trailing === 'menu') await CF.iconButton({ parent: ctx.host, x: box.x + box.w - padX - 28, y: box.y + (h - 28) / 2, size: 'xs', glyph: 'dotsV' });
    else if (o.trailing === 'switch') await CF.switch({ parent: ctx.host, x: box.x + box.w - padX - 44, y: box.y + (h - 22) / 2, size: 'sm', checked: o.on });
    else if (o.trailing === 'action') await CF.button({ parent: ctx.host, x: box.x + box.w - padX - 72, y: box.y + (h - 28) / 2, label: String(o.action || 'Open'), size: 'sm', type: 'default' });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(box, { radius: CF.radius('sm'), offset: 0 });
    return ctx.host;
  };

  /** Descriptions — label 13 muted w160-200 · value 14 · row 40-48 · column gap 24-32 · bordered grid · span. */
  CF.descriptions = async function (o) {
    o = o || {};
    var items = o.items || [{ label: 'Owner', value: 'Ada Liu' }, { label: 'Created', value: '2026-10-12 09:14' },
                           { label: 'Status', value: 'Published' }, { label: 'Region', value: 'eu-central-1' }];
    var cols = o.columns || 2, lw = o.labelW || 160, padX = 16, rowH = o.rowH || 44, cgap = 28;
    // §G12: a column must hold its label + the widest single-span value it is given, or the value runs into the next
    // column's label (the audit's text_overlap). A container narrower than that shrinks the LABEL column, never the
    // value: truncated copy is a defect, a tight gutter is not.
    var valW = items.reduce(function (a, it) {
      return (it.span || 1) === 1 ? max(a, CF.estW(String(it.value === undefined ? '—' : it.value), 14) + 4) : a;
    }, 0);
    // The bordered label plate ends at `cx + lw + 8`; the value used to start exactly on that edge (0 gap, the copy
    // seemed glued to the label cell). Give it one row-level breath from the ladder — 12 on web, `space.md`. The plain
    // variant has no plate, so its existing 8px column gap stays.
    var VGAP = LY && LY.breath ? LY.breath('row') : 12;
    var valueDx = o.bordered ? lw + 8 + VGAP : lw + 8;
    var need = valueDx + valW;
    var w = o.w || (padX * 2 + cols * need + cgap * (cols - 1));
    var cw = (w - padX * 2 - cgap * (cols - 1)) / cols;
    if (cw < need) lw = max(56, cw - 8 - (o.bordered ? VGAP : 0) - valW);
    var rowsUsed = items.reduce(function (a, it) { return a + (it.span || 1); }, 0);
    var rowCount = 0, acc = 0;
    items.forEach(function (it) { acc += (it.span || 1); if (acc >= cols) { rowCount++; acc = 0; } });
    if (acc) rowCount++;
    var h = rowCount * rowH + (o.bordered ? 0 : 8);
    var box = B(o.x || 0, o.y || 0, w, max(rowH, h));
    var ctx = CF.build(CF.name('Descriptions', { type: o.bordered ? 'Bordered' : 'Plain', size: cols + 'col' }), box,
      { parent: o.parent, fill: o.bordered ? C('surface') : null, radius: CF.radius('sm'), stroke: o.bordered ? C('border') : null });
    var col = 0, ry = box.y + 4;
    items.forEach(function (it, i) {
      var span = it.span || 1;
      if (col + span > cols) { col = 0; ry += rowH; }
      var cx = box.x + padX + col * (cw + cgap);
      var cellW = cw * span + (span > 1 ? cgap * (span - 1) : 0);
      if (o.bordered) {
        ctx.plate(B(cx - 8, ry, cellW + 16, rowH - 4), { name: 'cell·' + i, fill: null, stroke: C('border'), strokeW: 1, radius: 'none' });
        // the tint is drawn after the bordered cell, so a flush box would paint over its 1px border (stroke_covered).
        ctx.plate(CF.inset(B(cx - 8, ry, lw + 16, rowH - 4), 1), { name: 'cell·label·' + i, fill: C('surfaceAlt'), radius: 'none' });
      }
      // The text box is `rowH-12` tall, starting 4 below the cell top: its centre is the cell's centre, so the copy
      // must be `middle`, not `top`. Measured 2026-10-22 on `Descriptions·Bordered·2col`: label/value centres sat 6px
      // above the 40px cell centre because both were top-aligned.
      ctx.text(String(it.label), B(cx, ry + 4, lw, rowH - 12), { size: 13, color: C('muted'), align: 'left', valign: 'middle', refit: false });
      ctx.text(String(it.value === undefined ? '—' : it.value), B(cx + valueDx, ry + 4, max(valW, cellW - valueDx), rowH - 12),
        { size: 14, color: C('ink'), align: 'left', valign: 'middle', refit: false });
      col += span;
      if (col >= cols) { col = 0; ry += rowH; }
    });
    if (o.bordered) { try { ctx.host.resize(w, ry - box.y + 4); } catch (e) {} }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Timeline — node 10-12 dot (or icon 20) · connector 1-2px · row 40-72 · content right, gap 16 · pending = dashed tail. */
  CF.timeline = async function (o) {
    o = o || {};
    var items = o.items || [
      { title: 'Deployed to production', time: '10:24', tone: 'success' },
      { title: 'Review approved', time: '09:58', tone: 'primary' },
      { title: 'Pipeline failed', time: '09:12', tone: 'error', icon: 'error' },
      { title: 'Changes pushed', time: '08:40' }
    ];
    var rowH = o.rowH || 56, nodeW = o.node || 20, padL = nodeW + 16, w = o.w || 320;
    var h = items.length * rowH + (o.pending ? rowH : 0);
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Timeline', { slot: o.alternate ? 'Alternate' : (o.labelLeft ? 'LabelLeft' : null) }), box, { parent: o.parent });
    var nx = box.x + (o.labelLeft ? 92 : 0);
    items.forEach(function (it, i) {
      var cy = box.y + i * rowH + 12, cx = nx + nodeW / 2;
      if (i < items.length - 1 || o.pending) ctx.plate(B(cx - (o.width || 2) / 2, cy + nodeW, o.width || 2, rowH - nodeW + 6),
        { name: 'connector' + (i === items.length - 1 ? '·pending' : ''), fill: C('border'), dashed: i === items.length - 1 });
      if (it.dot === false || it.icon || it.avatar) {
        ctx.ellipse(B(nx, cy, nodeW, nodeW), { name: 'node·' + i, fill: it.icon ? C(it.tone || 'primary') : C('surface'), stroke: C(it.tone || 'border'), strokeW: 1 });
        if (it.icon) ctx.glyph(iconOf(it.icon, 'check'), B(nx + 2, cy + 2, nodeW - 4, nodeW - 4), { color: C('onPrimary'), strokeW: 1.6 });
      } else {
        var d = o.dot || 10;
        ctx.ellipse(B(cx - d / 2, cy + nodeW / 2 - d / 2, d, d), { name: 'node·' + i, fill: C(it.tone || (i === 0 ? 'primary' : 'border')), stroke: it.hollow ? C(it.tone || 'primary') : null, strokeW: 2 });
      }
      var tx = nx + nodeW + 16;
      ctx.text(String(it.title), B(tx, cy - 2, box.w - (tx - box.x) - 8, 20), { size: 14, color: C('ink'), weight: 500, align: 'left', valign: 'top', refit: false });
      if (it.body) ctx.text(String(it.body), B(tx, cy + 18, box.w - (tx - box.x) - 8, 18), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
      if (o.labelLeft) ctx.text(String(it.time || ''), B(box.x, cy, 80, 20), { size: 12, color: C('muted'), align: 'right', valign: 'top', refit: false });
      else if (it.time) ctx.text(String(it.time), B(tx, cy + (it.body ? 38 : 20), 120, 16), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
    });
    if (o.pending) {
      var py = box.y + items.length * rowH + 12, cxp = nx + nodeW / 2;
      ctx.ellipse(B(cxp - 5, py + 5, 10, 10), { name: 'node·pending', fill: C('border') });
      ctx.text(String(o.pending === true ? 'Pending…' : o.pending), B(nx + nodeW + 16, py - 2, box.w - nodeW - 24, 20), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Accordion / collapse — header 48-56 + chevron 16 · body pad 16-24 (top 0) · divider 1px · ghost · disabled. */
  CF.accordion = async function (o) {
    o = o || {};
    var items = o.items || [{ title: 'Shipping', body: 'Free on orders over 80.', open: true }, { title: 'Returns', body: '30 days, unworn.' }, { title: 'Support', disabled: true }];
    var headH = o.headH || 48, padX = o.padX || 16, bodyH = o.bodyH || 44;
    // Items separate with a row breath (12, `space.md`), NOT a 1px divider: the gap is a layout amount that survives
    // resizing, while a line plate is absolute geometry that drifts when the host refits.
    var itemGap = LY && LY.breath ? LY.breath('row') : 12;
    var w = o.w || 360, h = 0;
    items.forEach(function (it, i) { h += headH + (it.open && !o.collapsedAll ? bodyH : 0) + (i < items.length - 1 ? itemGap : 0); });
    var box = B(o.x || 0, o.y || 0, w, max(headH, h));
    var ST = o.state || 'default';
    // `name` lets a screen ship a content-specific composition (Accordion·FAQ·Multi) instead of drawing the registered
    // master's anatomy again under the master's name, which the design gate reads as not_component.
    var ctx = CF.build(o.name || CF.name('Accordion', { type: o.ghost ? 'Ghost' : 'Bordered', state: ST, slot: o.accordion ? 'Single' : 'Multi' }), box,
      { parent: o.parent, fill: o.ghost ? null : C('surface'), radius: CF.radius('md'), stroke: o.ghost ? null : C('border') });
    var y = box.y;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], S = it.disabled ? 'disabled' : (it.open ? 'open' : 'default');
      if (i === (o.cursor === undefined ? 0 : Number(o.cursor)) && (ST === 'hover' || ST === 'pressed'))
        ctx.plate(B(box.x + 1, y, w - 2, headH), { name: 'header·' + (ST === 'pressed' ? 'pressed' : 'hover'), fills: CF.fills(null, ST), radius: CF.radius('sm') });
      ctx.text(String(it.title), B(box.x + padX + (o.icon ? 24 : 0), y, w - padX * 2 - 24 - (o.chip ? 90 : 0) - (o.icon ? 24 : 0), headH),
        { size: 14, color: it.disabled ? C('muted') : C('ink'), weight: 500, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
      ctx.glyph(it.open ? 'chevronUp' : 'chevronDown', B(box.x + w - padX - 16, y + (headH - 16) / 2, 16, 16), { color: it.disabled ? C('muted') : C('ink'), opacity: stateAlpha(S) });
      if (o.icon) ctx.glyph(iconOf(o.icon, 'tag'), B(box.x + padX, y + (headH - 18) / 2, 18, 18), { color: C('muted') });
      if (o.chip && it.chip) await CF.chip({ parent: ctx.host, x: box.x + w - padX - 96, y: y + (headH - 24) / 2, label: it.chip, size: 'sm', kind: 'tag', tone: it.chipTone || 'success' });
      if (it.open) {
        // A Penpot text grows to its measured width — it does not reflow inside the box — so an unwrapped answer
        // paints one 700px line and the host crops it mid-sentence. Wrap to the body width and mark the overflow.
        var bws = CF.wrap(String(it.body || ''), w - padX * 2 - 24, 13), blh = 20;
        var maxLines = Math.max(1, Math.floor((bodyH - 4) / blh));
        if (bws.length > maxLines) {
          bws = bws.slice(0, maxLines);
          bws[bws.length - 1] = bws[bws.length - 1].replace(/[\s,.;:]+$/, '') + ' …';
        }
        // The body block is centred in its band, not glued to the header divider: a one-line answer in a 44px band
        // starts 12 below the header (and leaves 12 below), so the copy breathes on both sides. Measured 2026-10-22 on
        // `Accordion·Bordered·Hover·Multi`, where the first body line sat exactly on the header's bottom edge.
        var textH = Math.min(bws.length, maxLines) * blh;
        var bodyPad = Math.max(4, Math.round((bodyH - textH) / 2));
        bws.forEach(function (ln, li) {
          ctx.text(ln, B(box.x + padX + (o.icon ? 24 : 0), y + headH + bodyPad + li * blh, w - padX * 2 - 24, blh),
            { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
        });
      }
      y += headH + (it.open ? bodyH : 0) + (i < items.length - 1 ? itemGap : 0);
    }
    try { ctx.host.resize(w, N(y - box.y)); } catch (e) {}
    await ctx.settle(); ctx.place();
    if (ST === 'focus') ctx.ring(B(box.x, box.y, w, headH), { radius: CF.radius('md') });
    return ctx.host;
  };

  /** Empty state — illustration 120-160 · headline 18-20 · body 14/1.5 ≤400 · primary 40-44 min-w 140 · ≤3 actions. */
  CF.emptyState = async function (o) {
    o = o || {};
    var kind = o.kind || 'no-data';
    var ill = o.illustration || ({ 'no-data': 'inbox', 'no-results': 'search', error: 'warning', '403': 'lock', '404': 'globe', '500': 'error' }[kind] || 'inbox');
    var title = o.title || ({ 'no-data': 'Nothing here yet', 'no-results': 'No results', error: 'Something went wrong', '403': 'You do not have access', '404': 'Page not found', '500': 'Server error' }[kind]);
    var body = o.body || ({ 'no-results': o.query ? 'No matches for “' + o.query + '”.' : 'Try a different term.', error: 'We could not reach the server.', '403': 'Ask an admin for a seat.', '404': 'The link may be outdated.', '500': 'Try again in a moment.', 'no-data': 'Create your first item to get going.' }[kind]);
    var pw = max(140, o.actionW || 140);
    var sLabel = o.action === false ? null : (o.secondary ? String(o.secondary) : null);
    var pairW = pw + (sLabel ? 12 + max(88, CF.estW(sLabel, 14) + 24) : 0);
    var w = max(o.w || 360, pairW + 48), ih = o.illH || 120;
    var h = o.h || (24 + ih + 12 + 24 + (body ? 40 : 0) + (o.action === false ? 0 : 56));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('EmptyState', { type: kind, slot: o.firstRun ? 'FirstRun' : null }), box, { parent: o.parent });
    var cx = box.x + box.w / 2;
    ctx.plate(B(cx - ih / 2, box.y + 20, ih, ih), { name: 'illustration', fill: C('surfaceAlt'), radius: CF.radius('spec') });
    ctx.glyph(ill, B(cx - 32, box.y + 20 + ih / 2 - 32, 64, 64), { color: C('muted'), strokeW: 3 });
    ctx.text(String(title), B(box.x, box.y + 20 + ih + 10, box.w, 26), { size: 20, color: C('ink'), weight: 600 });
    if (body) { var bw = min(400, box.w - 32); ctx.text(String(body), B(cx - bw / 2, box.y + 20 + ih + 40, bw, 36), { size: 14, color: C('muted') }); }
    if (o.action !== false) {
      var yy = box.y + h - 48;
      var b1 = await CF.button({ parent: ctx.host, x: box.x + 6, y: yy, label: String(o.action || (kind === 'error' ? 'Retry' : 'Create')), size: 'lg', type: 'primary', w: pw });
      var b2 = sLabel ? await CF.button({ parent: ctx.host, x: box.x + 6, y: yy, label: sLabel, size: 'lg', type: 'text' }) : null;
      // the pair is centred only once both buttons report their measured width
      var w1 = b1 ? b1.width : pw, w2 = b2 ? b2.width : 0, sx = box.x + (box.w - (w1 + (w2 ? 12 + w2 : 0))) / 2;
      if (b1) CF.move(b1, N(sx), yy);
      if (b2) CF.move(b2, N(sx + w1 + 12), yy);
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Carousel / gallery — 4:3 tiles, 2-3 visible + 16-24 edge peek, dots 8 (active 16 pill), arrows 40-48 on hover only. */
  CF.carousel = async function (o) {
    o = o || {};
    var tiles = o.tiles || 3, tw = o.tileW || 260, ratio = o.ratio || '4:3';
    var th = ratio === '1:1' ? tw : Math.round(tw * 3 / 4);
    var peek = o.peek === undefined ? 24 : o.peek, gap = o.gap || 16, dotsH = 28;
    var visible = tw * tiles + gap * (tiles - 1) + peek;
    var box = B(o.x || 0, o.y || 0, visible, th + dotsH + 8);
    var ST = o.state || 'default';
    var ctx = CF.build(CF.name('Carousel', { state: ST, slot: [o.arrows ? 'Arrows' : 'Dots', o.captions ? 'Caption' : null].filter(Boolean).join('-') }), box, { parent: o.parent });
    var active = o.active === undefined ? 0 : o.active;
    var hov = o.hover === undefined ? ((ST === 'hover' || ST === 'pressed') ? active : -1) : o.hover;
    for (var i = 0; i < tiles + 1; i++) {
      var x = box.x + i * (tw + gap), visW = min(tw, box.x + box.w - x);
      // a peek tile is drawn as the sliver that would survive clipContent, so nothing escapes the host
      if (visW < 8) continue;
      if (visW < tw - 2) { ctx.plate(B(x, box.y, visW, th), { name: 'tile·peek', fill: C(i === active ? 'primarySoft' : 'surfaceAlt'), radius: 'none' }); continue; }
      var st = i === hov ? 'hover' : 'default';
      ctx.plate(B(x, box.y, tw, th), { name: 'tile·' + (i + 1), fill: C(i === active ? 'primarySoft' : 'surfaceAlt'),
        radius: CF.radius('md'), stroke: st === 'hover' ? C('borderStrong') : null, strokeW: 1, shadow: st === 'hover' ? 2 : 0 });
      ctx.glyph('image', B(x + tw / 2 - 20, box.y + th / 2 - 20, 40, 40), { color: C('muted') });
      if (ST === 'pressed' && i === hov) ctx.plate(B(x, box.y, tw, th), { name: 'tile·pressed', fills: CF.fills(null, 'pressed'), radius: CF.radius('md') });
      if (o.captions) ctx.text(String(o.captions[i]), B(x + 12, box.y + th - 30, tw - 24, 20), { size: 13, color: C('ink'), weight: 500, align: 'left', valign: 'bottom', refit: false });
    }
    var dy = box.y + th + 10, n = o.count || tiles + 2, act = o.active === undefined ? 0 : o.active;
    var dw = 8, totalW = (n - 1) * (dw + 8) + (act >= 0 ? 16 : 0) + dw;
    var dx0 = box.x + (visible - totalW) / 2;
    for (var d = 0; d < n; d++) {
      var isOn = d === act;
      ctx.plate(B(dx0, dy, isOn ? 16 : 8, 8), { name: 'dot·' + (d + 1), fill: isOn ? C('primary') : C('borderStrong'), radius: 'xs' });
      dx0 += (isOn ? 16 : 8) + 8;
    }
    if (o.arrows) {
      var ay = box.y + th / 2 - 20;
      ctx.ellipse(B(box.x + 8, ay, 40, 40), { name: 'arrow·prev', fill: C('surface'), stroke: C('border'), strokeW: 1, shadow: 2 });
      ctx.glyph('chevronLeft', B(box.x + 16, ay + 8, 24, 24), { color: C('ink') });
      ctx.ellipse(B(box.x + visible - peek - 48, ay, 40, 40), { name: 'arrow·next', fill: C('surface'), stroke: C('border'), strokeW: 1, shadow: 2 });
      ctx.glyph('chevronRight', B(box.x + visible - peek - 40, ay + 8, 24, 24), { color: C('ink') });
      if (ST === 'pressed') ctx.ellipse(B(box.x + visible - peek - 48, ay, 40, 40), { name: 'arrow·pressed', fills: CF.fills(null, 'pressed') });
    }
    await ctx.settle(); ctx.place();
    if (ST === 'focus') ctx.ring(box, { radius: CF.radius('md') });
    return ctx.host;
  };

  /** Mini calendar (sidebar `calMini`) — header 32 (‹ Month ›) · weekday row 20 · 7×n day cells 32 · today ring ·
      selected disc · range wash · 4px event dots. 238 wide fits a 240–300 panel. */
  CF.miniCalendar = async function (o) {
    o = o || {};
    var cell = o.cell || 32, gap = o.gap === undefined ? 2 : o.gap;
    var headH = o.headH || 32, weekH = o.weekH || 20, padX = 8, padB = 8;
    var dim = o.days || 31, first = o.firstWeekday || 0;
    var today = o.today === undefined ? 14 : o.today, sel = o.selected === undefined ? 18 : o.selected;
    // §3.3 `range` is not a label, it is a DRAWING: the soft band only exists when the selection has two ends, so a
    // host named `·Range` that was handed a single day painted nothing but carried the name (measured on the exported
    // `MiniCalendar·Spec` RANGE row). An explicit `selected` array always wins; `range` supplies the in-progress one.
    if (o.range && !Array.isArray(sel)) sel = [today, today + 4];
    var events = o.events || [3, 8, 14, 18, 22, 27];
    // §3.3 the frame is DERIVED from the month it draws. `rows` is a declared axis (5 · 6), but a 31-day month that
    // starts on the first column occupies 5 rows, and a hardcoded 6 drew a 252×262 sheet around 252×228 of calendar —
    // a whole empty band inside the border (measured 2026-10-22: content inset bottom 49px vs top 7px). An explicit
    // `rows` still wins (that is how the 6-row variant is drawn), it just never shrinks below what the month needs.
    var need = Math.max(1, Math.ceil((first + dim) / 7));
    var rows = o.rows === undefined ? need : Math.max(need, Number(o.rows) || need);
    // The leading/trailing slots of the grid belong to the previous/next month. They are PAINTED (muted, no state,
    // no event dot) — an unfilled slot is exactly the dead band the border was blamed for.
    var adj = o.adjacent !== false;
    var w = o.w || (7 * (cell + gap) - gap + padX * 2);
    var h = o.h || (headH + weekH + rows * (cell + gap) - gap + padB);
    var box = B(o.x || 0, o.y || 0, w, h);
    var ST = o.state || 'default';
    var ctx = CF.build(CF.name('MiniCalendar', { size: cell + 'cell', state: ST,
      slot: [o.range ? 'Range' : null, o.events === false ? 'NoEvents' : null, rows + 'row'].filter(Boolean).join('-') }), box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), stroke: C('border'), strokeW: 1 });
    if (!LY) return ctx.host;
    var grid = LY.grid(B(box.x + padX, box.y + headH + weekH, w - padX * 2, rows * (cell + gap) - gap), 7, gap);
    ctx.glyph('chevronLeft', B(box.x + 8, box.y + (headH - 16) / 2, 16, 16), { color: C('muted'), strokeW: 2 });
    ctx.glyph('chevronRight', B(box.x + w - 24, box.y + (headH - 16) / 2, 16, 16), { color: C('muted'), strokeW: 2 });
    ctx.text(String(o.month || 'March 2026'), B(box.x + 32, box.y, w - 64, headH),
      { size: 13, color: C('ink'), weight: 600, align: 'center', valign: 'middle', refit: false });
    var wd = o.weekdays || ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    wd.forEach(function (d, i) {
      ctx.text(String(d), B(grid[i].x, box.y + headH, grid[i].w, weekH),
        { size: 11, role: 'axis', color: C('muted'), weight: 500, align: 'center', valign: 'middle', refit: false });
    });
    var fcell = null;
    for (var i = 0; i < rows * 7; i++) {
      var dnum = i - first + 1;
      var col = i % 7, r = B(grid[col].x, box.y + headH + weekH + Math.floor(i / 7) * (cell + gap), cell, cell);
      if (dnum < 1 || dnum > dim) {
        if (!adj) continue;
        ctx.text(String(dnum < 1 ? dim + dnum : dnum - dim), r,
          { size: 12, color: C('muted'), weight: 400, opacity: 0.62, align: 'center', valign: 'middle', refit: false });
        continue;
      }
      var muted = o.weekendMuted && col >= 5;
      var isSel = Array.isArray(sel) ? (dnum === sel[0] || dnum === sel[1]) : dnum === sel;
      var inRange = Array.isArray(sel) && dnum > sel[0] && dnum < sel[1];
      // §1.3 the keyboard lands on ONE day cell, so that cell is the focus unit — not the 238×250 calendar.
      if (!fcell && (isSel || dnum === today)) fcell = r;
      if (inRange) ctx.plate(B(r.x, r.y + (cell - 24) / 2, cell, 24), { name: 'range·' + dnum, fills: CF.fills(C('primarySoft'), null), radius: 'none' });
      if (isSel) ctx.plate(B(r.x, r.y, cell, cell), { name: 'sel·' + dnum, fill: C('primary'), radius: 'control' });
      else if (dnum === today) ctx.plate(B(r.x + 1, r.y + 1, cell - 2, cell - 2), { name: 'today·' + dnum, fill: null, stroke: C('primary'), strokeW: 1.5, radius: 'control' });
      if (!isSel && dnum === (o.hoverDay === undefined ? today : o.hoverDay) && (ST === 'hover' || ST === 'pressed'))
        ctx.plate(B(r.x, r.y, cell, cell), { name: 'day·' + (ST === 'pressed' ? 'pressed' : 'hover'), fills: CF.fills(null, ST), radius: 'control' });
      ctx.text(String(dnum), r, { size: 12, weight: isSel || dnum === today ? 600 : 400,
        color: isSel ? C('onPrimary') : (dnum === today ? C('primary') : (muted ? C('muted') : C('ink'))), align: 'center', valign: 'middle', refit: false });
      if (events.indexOf(dnum) >= 0 && !isSel) ctx.plate(B(r.x + cell / 2 - 2, r.y + cell - 6, 4, 4), { name: 'dot·' + dnum, fill: C('primary'), radius: 'xs' });
      if (o.hit) ctx.hitPad(r, o.hit);                          // 32 cells are a desktop sidebar affordance; touch tiers pass 44
      if (o.marks && o.marks[dnum]) ctx.text(String(o.marks[dnum]), B(r.x, r.y + 1, cell, 12), { size: 11, role: 'axis', color: C('muted'), align: 'center', valign: 'top', refit: false });
    }
    await ctx.settle(); ctx.place();
    if (ST === 'focus') ctx.ring(fcell || box, { radius: CF.radius('control') });
    return ctx.host;
  };

  // ================================================================ D · Navigation (§3.4)

  /** Nav item — row 40 · icon 20 + 12 gap · collapsed rail 48 square · selected = soft container + 3px bar · group label 32 · count · submenu. */
  CF.navItem = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size || 'md'), S = o.state || 'default';
    var rail = !!o.rail, group = !!o.group;
    var h = o.h || (group ? 32 : (rail ? 48 : (o.size === 'sm' ? 32 : 40)));
    var padX = group || rail ? (rail ? 0 : 12) : (o.padX === undefined ? 12 : o.padX);
    var ic = o.iconSize || (rail ? 22 : 20);
    var label = String(o.label === undefined ? (group ? 'Workspace' : 'Overview') : o.label);
    var badge = o.badge === undefined || o.badge === false ? null : String(o.badge);
    var badgeW = badge ? CF.estW(badge, 12) + 10 : 0;
    var subW = o.submenu ? 24 : 0;
    var hasIcon = !group && o.icon !== false;
    var w = o.w || (rail ? 48 : max(88, padX * 2 + (hasIcon ? ic + 12 : 0) + CF.estW(label, group ? 11 : L.fs) + badgeW + subW + 4));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('NavItem', { type: group ? 'Group' : (rail ? 'Rail' : null), size: o.size, state: S,
             slot: [o.selected ? 'Selected' : null, slotName({ lead: hasIcon ? true : null, badge: badge ? true : null, submenu: o.submenu })].filter(Boolean).join('-') || null }), box,
      { parent: o.parent, radius: rail ? 'control' : 'md' });
    if (group) {
      ctx.text(label.toUpperCase(), B(box.x + padX, box.y, box.w - padX * 2, box.h),
        { size: 12, color: o.onDark ? C('mutedOnInk') : C('muted'), weight: 600, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
      await ctx.settle(); ctx.place();
      return ctx.host;
    }
    var sel = !!o.selected;
    // A nav row mounted on an ink shell (`o.onDark`, set by CF.sideNav for its dark variant) has to lift its copy: the
    // palette ink is the same #161616 as the panel (1.00:1) and the palette muted is 2.54:1. The light `primarySoft`
    // selection wash would also invert the panel polarity, so a dark row selects with a white state layer instead and
    // lets the accent bar carry the brand.
    ctx.host.fills = sel && !o.onDark ? CF.fills(C('primarySoft'), S === 'default' ? null : S)
      : CF.fills(null, S === 'default' ? null : S, o.onDark ? { onDark: true } : undefined);
    var ink = o.onDark ? (S === 'disabled' ? C('mutedOnInk') : TONE.onDark.ink)
      : (S === 'disabled' ? C('muted') : (sel ? C('primary') : C('ink')));
    var x = box.x + padX;
    if (hasIcon) {
      if (rail) ctx.glyph(iconOf(o.icon, 'home'), B(box.x + (w - ic) / 2, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 2 });
      else { ctx.glyph(iconOf(o.icon, 'home'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 1.8 }); x += ic + 12; }
    }
    if (sel && o.indicator !== false)
      ctx.plate(rail ? B(box.x + w - 3, box.y + (h - 20) / 2, 3, 20) : B(box.x, box.y + (h - 20) / 2, 3, 20),
        { name: 'accent·bar', fill: C('primary'), radius: 'xs' });
    if (!rail) {
      ctx.text(label, B(x, box.y, box.w - (x - box.x) - padX - badgeW - subW, h),
        { size: L.fs, color: ink, weight: sel ? 500 : 400, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
      var rx = box.x + box.w - padX;
      if (o.submenu) { rx -= 16; ctx.glyph(o.expanded ? 'chevronUp' : 'chevronRight', B(rx, box.y + (h - 16) / 2, 16, 16), { color: o.onDark ? C('mutedOnInk') : C('muted'), anchor: 'right' }); rx -= 8; }
      if (badge) {
        ctx.plate(B(rx - badgeW, box.y + (h - 18) / 2, badgeW, 18), { name: 'count', fill: sel ? C('primary') : C('surfaceAlt'), radius: 'control' });
        ctx.text(badge, B(rx - badgeW, box.y, badgeW, h), { size: 12, color: sel ? C('onPrimary') : C('muted'), weight: 600, refit: false });
      }
    }
    await ctx.settle(); ctx.place();
    if (!rail && !group) ctx.refit(padX);
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: CF.radius('md') });
    if (rail) ctx.hitPad(B(box.x, box.y, w, h), 44);
    return ctx.host;
  };

  /** One tab — line (2px ink bar) · enclosed · card · pill · vertical · icon · count · closable · disabled. */
  CF.tabs = async function (o) {
    o = o || {};
    var type = o.type || 'line', S = o.state || 'default', L = CF.ladder(o.size || 'md');
    var vert = o.direction === 'vertical';
    var h = o.h || (type === 'pill' ? (o.size === 'sm' ? 28 : 32) : (o.size === 'sm' ? 32 : 40));
    var padX = o.padX === undefined ? (type === 'pill' ? 14 : 16) : o.padX;
    var ic = o.icon === false ? 0 : (o.iconSize || 16);
    var label = String(o.label === undefined ? 'Tab' : o.label);
    var countW = o.count === undefined || o.count === false ? 0 : CF.estW(String(o.count), 12) + 8;
    var closeW = o.closable ? 20 : 0;
    var sel = !!o.selected;
    var w = o.w || (padX * 2 + (ic ? ic + 8 : 0) + CF.estW(label, L.fs) + countW + closeW);
    var box = B(o.x || 0, o.y || 0, vert ? (o.w || 140) : w, h);
    var ctx = CF.build(CF.name('Tabs', { type: type, size: o.size, state: S,
             slot: [sel ? 'Selected' : null, slotName({ lead: ic ? true : null, count: countW ? true : null, closable: o.closable })].filter(Boolean).join('-') || null }), box,
      { parent: o.parent, radius: type === 'pill' ? 'control' : (type === 'card' ? 'sm' : 'none') });
    if (type === 'pill') ctx.host.fills = sel ? CF.fills(C('primarySoft'), S === 'default' ? null : S) : CF.fills(null, S === 'default' ? null : S);
    else if (type === 'enclosed' || type === 'card') ctx.host.fills = CF.fills(sel && type === 'enclosed' ? C('surface') : null, S === 'default' ? null : S);
    else ctx.host.fills = CF.fills(null, S === 'default' ? null : S);
    if (type === 'enclosed' || type === 'card') {
      var blH = (type === 'card' && !sel) ? 1 : 2;
      ctx.plate(B(box.x, box.y + box.h - blH, box.w, blH), { name: 'base·line', fill: sel ? C('primary') : C('border') });
    }
    else if (sel) ctx.plate(vert ? B(box.x, box.y + 6, 3, box.h - 12) : B(box.x + (type === 'line' ? padX * 0.4 : 0), box.y + box.h - 2, box.w - (type === 'line' ? padX * 0.8 : 0), 2),
      { name: 'ink·bar', fill: C('primary'), radius: 'xs' });
    var ink = S === 'disabled' ? C('muted') : (sel ? C('primary') : C('ink'));
    var x = box.x + padX;
    if (ic) { ctx.glyph(iconOf(o.icon, 'grid'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 1.8 }); x += ic + 8; }
    ctx.text(label, B(x, box.y, box.w - (x - box.x) - padX - countW - closeW + 4, h),
      { size: L.fs, color: ink, weight: sel ? 500 : 400, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
    var rx = box.x + box.w - padX;
    if (o.closable) { rx -= 14; ctx.glyph('close', B(rx, box.y + (h - 14) / 2, 14, 14), { color: C('muted'), strokeW: 1.6, anchor: 'right' }); }
    if (countW) { rx -= countW; ctx.plate(B(rx, box.y + (h - 18) / 2, countW, 18), { name: 'count', fill: C('surfaceAlt'), radius: 'control' });
      ctx.text(String(o.count), B(rx, box.y, countW, h), { size: 12, color: C('muted'), weight: 600, refit: false }); }
    await ctx.settle(); ctx.place();
    if (!o.w) ctx.refit(padX);
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: CF.radius('sm') });
    return ctx.host;
  };

  /** Tab band — a strip of CF.tabs over a region; region maths comes from LY.slots.tabs (gate G11). */
  CF.tabBand = async function (o) {
    o = o || {};
    var rect = o.rect || B(o.x || 0, o.y || 0, o.w || 640, o.h || 44);
    var items = o.items || ['Overview', 'Activity', 'Members', 'Settings'];
    var slot = LY && LY.slots.tabs ? LY.slots.tabs(rect, { count: items.length }) : null;
    var box = B(rect.x, rect.y, rect.w, rect.h);
    var ctx = CF.build(CF.name('Tabs', { type: o.type || 'line', slot: o.add ? 'Add' : (o.scrollable ? 'Scrollable' : 'Band') }), box, { parent: o.parent });
    var act = o.active === undefined ? 0 : Number(o.active);
    if ((o.type || 'line') === 'line') ctx.plate(B(box.x, box.y + box.h - 1, box.w, 1), { name: 'underline·band', fill: C('border') });
    var x = box.x + (o.padX || 0);
    for (var i = 0; i < items.length; i++) {
      var it = typeof items[i] === 'string' ? { label: items[i] } : items[i];
      var sr = slot && slot.items[i];
      await CF.tabs({ parent: ctx.host, x: sr ? sr.x : x, y: box.y + (box.h - (o.h2 || 40)) / 2,
        w: o.equal && sr ? sr.w : it.w, h: o.h2 || box.h, label: it.label, icon: it.icon, count: it.count,
        closable: it.closable || o.closable, type: o.type, size: o.size, state: it.disabled ? 'disabled' : (i === act ? 'default' : 'default'),
        selected: i === act, direction: o.direction });
      if (!o.equal) x += (it.w || max(88, 32 + CF.estW(String(it.label), 14))) + (o.gap === undefined ? 4 : o.gap);
    }
    if (o.add) {
      await CF.iconButton({ parent: ctx.host, x: box.x + box.w - 32, y: box.y + (box.h - 28) / 2, size: 'xs', glyph: 'plus', tone: 'ghost' });
    } else if (o.scrollable) {
      await CF.iconButton({ parent: ctx.host, x: box.x + box.w - 32, y: box.y + (box.h - 28) / 2, size: 'xs', glyph: 'chevronRight', tone: 'ghost' });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Breadcrumb — 13-14 · chevron or slash separator 16 · links tint on hover · last = current (ink 500, not a link) · truncation menu. */
  CF.breadcrumb = async function (o) {
    o = o || {};
    var items = o.items || ['Workspace', 'Projects', CF.brandName + ' design'];
    var fs = o.fs || 13, sepKind = o.sep || 'chevron', h = o.h || max(22, fs + 8);
    var sepW = sepKind === 'slash' ? 10 : 16 + 8;
    var backW = o.back ? 24 + 8 : 0;
    var cells = items.map(function (it, i) {
      var t = typeof it === 'string' ? { label: it } : it;
      return { label: String(t.label === undefined ? '…' : t.label), glyph: t.glyph, menu: !!t.menu, last: i === items.length - 1 };
    });
    var total = backW;
    cells.forEach(function (c, i) { total += CF.estW(c.menu ? '…' : c.label, fs) + (c.glyph ? 18 : 0) + (c.menu ? 16 : 0) + (i < cells.length - 1 ? sepW : 0); });
    var box = B(o.x || 0, o.y || 0, o.w || max(64, total), h);
    var ctx = CF.build(CF.name('Breadcrumb', { type: o.back ? 'Back' : null, size: o.size, state: o.state, slot: o.truncated ? 'Truncated' : null }), box, { parent: o.parent });
    var x = box.x, focusB = null;
    if (o.back) { ctx.glyph('arrowLeft', B(x, box.y + (h - 16) / 2, 16, 16), { color: C('ink'), strokeW: 1.8 }); x += 24 + 8; }
    cells.forEach(function (c, i) {
      var txt = c.menu ? '…' : c.label;
      var tw = CF.estW(txt, fs) + (c.menu ? 16 : 0);
      var cellBox = B(x, box.y, max(8, tw), h);
      var isLink = !c.last && !c.menu;
      if (isLink && !focusB) focusB = cellBox;
      var tint = c.menu ? 'selected' : (i === o.hover ? 'hover' : null);
      if (tint) ctx.plate(B(cellBox.x, cellBox.y, cellBox.w, cellBox.h), { name: 'tint·' + i, fills: CF.fills(C('surfaceAlt'), tint), radius: CF.radius('xs') });
      else if (i === o.hover) ctx.plate(B(cellBox.x, cellBox.y, cellBox.w, cellBox.h), { name: 'tint·' + i, fills: CF.fills(null, 'hover'), radius: CF.radius('xs') });
      if (c.glyph) { ctx.glyph(iconOf(c.glyph, 'folder'), B(x + 2, box.y + (h - 14) / 2, 14, 14), { color: C('muted') }); x += 18; }
      ctx.text(txt, B(x + (tint ? 2 : 0), box.y, max(8, cellBox.w - (tint ? 4 : 0)), h),
        { size: fs, color: c.last ? C('ink') : C(o.onDark ? 'onPrimary' : 'muted'), weight: c.last ? 500 : 400,
          opacity: o.state === 'disabled' ? CF.STATE.disabledContent : 1, align: 'left', valign: 'middle', refit: false });
      x += tw;
      if (c.menu) { ctx.glyph('dots', B(x - 14, box.y + (h - 12) / 2, 12, 12), { color: C('muted'), fill: C('muted'), anchor: 'right' }); }
      if (i < cells.length - 1) {
        // A slash is copy, so it owes 4.5:1; borderStrong is a line tone and only graphics may wear it.
        if (sepKind === 'slash') ctx.text('/', B(x + 1, box.y, 8, h), { size: fs, color: o.onDark ? C('onPrimary') : C('muted'), align: 'left', valign: 'middle', refit: false });
        else ctx.glyph('chevronRight', B(x + 4, box.y + (h - 16) / 2, 16, 16), { color: C('borderStrong'), strokeW: 1.6 });
        x += sepW;
      }
    });
    await ctx.settle(); ctx.place();
    if (o.state === 'focus') ctx.ring(focusB || B(box.x, box.y, box.w, h), { radius: CF.radius('xs') });
    return ctx.host;
  };

  /** Pagination — cell 32 (24 sm / 40 lg) · prev/next chevron with disabled ends · boundary+sibling window · ellipsis · quick jump · size changer · total. */
  CF.pagination = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size || 'md');
    var cell = o.cell || (o.size === 'sm' ? 24 : (o.size === 'lg' ? 40 : 32));
    var cur = o.current === undefined ? 3 : Number(o.current), total = o.total === undefined ? 10 : Number(o.total);
    var sib = o.siblings === undefined ? 1 : Number(o.siblings), bound = o.boundary === undefined ? 1 : Number(o.boundary);
    var jumpW = o.quickJumper ? 56 : 0, sizeW = o.showSizeChanger ? 96 : 0, totalW = o.showTotal ? CF.estW(String(o.showTotal === true ? '92 items' : o.showTotal), 13) + 8 : 0;
    var tokens = [];
    var pages = [];
    for (var p = 1; p <= total; p++) {
      if (p <= bound || p > total - bound || (p >= cur - sib && p <= cur + sib)) pages.push(p);
    }
    var prevShown = 0;
    pages.forEach(function (p) {
      if (prevShown && p - prevShown > 1) tokens.push({ t: 'ellipsis', v: '•••' });
      tokens.push({ t: 'num', v: p }); prevShown = p;
    });
    var H = max(cell, jumpW || sizeW ? L.h : 0);
    var seqW = tokens.length * cell + (tokens.length - 1) * 4;
    var w = seqW + 8 + cell * 2 + 4 + (totalW ? totalW + 16 : 0) + (jumpW ? jumpW + 16 + CF.estW('Go to', 13) : 0) + (sizeW ? sizeW + 8 : 0);
    var box = B(o.x || 0, o.y || 0, w, H);
    var ctx = CF.build(CF.name('Pagination', { size: o.size, type: o.simple ? 'Simple' : null, state: o.state,
             slot: o.quickJumper ? 'QuickJumper' : (o.showSizeChanger ? 'SizeChanger' : null) }), box, { parent: o.parent });
    var S = o.state || 'default';
    var cy = box.y + (H - cell) / 2, x = box.x;
    var disabled = S === 'disabled', al = disabled ? CF.STATE.disabledContent : 1;
    var fxB = null;
    var cellBtn = function (bx, kind, sel) {
      var st = disabled ? 'disabled' : (sel ? 'selected' : (kind === 'num' && i === o.hover ? 'hover' : 'default'));
      ctx.plate(B(bx, cy, cell, cell), { name: 'cell·' + (sel ? 'active' : kind), fills: sel ? CF.fills(C('primary'), null) : CF.fills(null, st === 'hover' ? 'hover' : null),
        radius: CF.radius('sm'), stroke: !sel && !disabled && o.outlined ? C('border') : null, strokeW: 1 });
      if (S === 'focus' && sel && !fxB) fxB = B(bx, cy, cell, cell);
    };
    var prevOff = disabled || cur <= 1, nextOff = disabled || cur >= total;
    cellBtn(x, 'prev'); ctx.glyph('chevronLeft', B(x + (cell - 16) / 2, cy + (cell - 16) / 2, 16, 16), { color: prevOff ? C('muted') : C('ink'), opacity: prevOff ? CF.STATE.disabledContent : 1, strokeW: 1.8 });
    if (cell < 32) ctx.hitPad(B(x, cy, cell, cell), 32);
    x += cell + 4;
    if (o.simple) {
      ctx.plate(B(x, cy, cell * 2 + 8, cell), { name: 'cell·pager', fills: CF.fills(C('surfaceAlt'), null), radius: CF.radius('sm') });
      ctx.text(cur + ' / ' + total, B(x, cy, cell * 2 + 8, cell), { size: L.fs, color: disabled ? C('muted') : C('ink'), weight: 500, opacity: al });
      if (S === 'focus') fxB = B(x, cy, cell * 2 + 8, cell);
      x += cell * 2 + 8 + 4;
    } else {
      for (var i = 0; i < tokens.length; i++) {
        var tk = tokens[i], sel = tk.t === 'num' && tk.v === cur;
        cellBtn(x, tk.t, sel);
        if (tk.t === 'ellipsis') ctx.text('•••', B(x, cy, cell, cell), { size: L.fs, color: C('muted'), opacity: al, refit: false });
        else ctx.text(String(tk.v), B(x, cy, cell, cell), { size: L.fs, color: sel && !disabled ? C('onPrimary') : (disabled ? C('muted') : C('ink')),
          weight: sel ? 600 : 400, opacity: al });
        x += cell + 4;
      }
    }
    cellBtn(x, 'next'); ctx.glyph('chevronRight', B(x + (cell - 16) / 2, cy + (cell - 16) / 2, 16, 16), { color: nextOff ? C('muted') : C('ink'), opacity: nextOff ? CF.STATE.disabledContent : 1, strokeW: 1.8 });
    x += cell + 4;
    if (totalW) { ctx.text(String(o.showTotal === true ? '92 items' : o.showTotal), B(x, box.y, totalW, H), { size: 13, color: C('muted'), opacity: al, align: 'left', valign: 'middle', refit: false }); x += totalW + 16; }
    if (sizeW) { await CF.select({ parent: ctx.host, x: x, y: box.y + (H - L.h) / 2, w: sizeW, size: o.size, value: (o.pageSize || 20) + ' / page' }); x += sizeW + 8; }
    if (jumpW) {
      ctx.text('Go to', B(x, box.y, CF.estW('Go to', 13), H), { size: 13, color: C('muted'), opacity: al, align: 'left', valign: 'middle', refit: false });
      x += CF.estW('Go to', 13) + 8;
      await CF.input({ parent: ctx.host, x: x, y: box.y + (H - L.h) / 2, w: jumpW, size: o.size, placeholder: String(cur) });
    }
    if (S === 'focus') ctx.ring(fxB || B(box.x, cy, cell, cell), { radius: CF.radius('sm') });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Steps — circle 32 (24 sm) · finish ✓ / process ● / error ! / wait ○ · tail 1-2px · label bottom (with description) or right · dot style · vertical. */
  CF.steps = async function (o) {
    o = o || {};
    var items = o.items || ['Cart', 'Address', 'Payment', 'Review', 'Done'];
    var cur = o.current === undefined ? 2 : Number(o.current);
    var errAt = o.error === undefined ? -1 : Number(o.error);
    var vert = o.direction === 'vertical', dot = !!o.dot, labelRight = o.labelPlacement ? o.labelPlacement === 'right' : !o.description;
    var cs = dot ? 12 : (o.iconSize || (o.size === 'sm' ? 24 : 32));
    var fs = o.size === 'sm' ? 13 : 14, dfs = 12;
    var gap = 8, tailGap = 8, stepGap = o.gap === undefined ? 24 : o.gap;
    var cells = items.map(function (it, i) {
      var t = typeof it === 'string' ? { title: it } : it;
      return { title: String(t.title === undefined ? 'Step' : t.title), desc: t.description ? String(t.description) : (o.description ? 'Optional supporting line' : null),
               icon: t.icon, status: i < cur ? 'finish' : (i === errAt ? 'error' : (i === cur ? 'process' : 'wait')) };
    });
    var titleW = function (c) { return max(cs + 8, CF.estW(c.title, fs) + 8); };
    var descW = function (c) { return c.desc ? CF.estW(c.desc, dfs) + 8 : 0; };
    var contentW = function (c) { return labelRight ? titleW(c) + (c.desc ? 8 + descW(c) : 0) : max(titleW(c), descW(c)); };
    var colW = function (c) { return max((labelRight ? cs + 12 : 0) + contentW(c), 40); };
    var tail = o.tail === undefined ? 56 : Number(o.tail);
    var hasDesc = cells.some(function (c) { return !!c.desc; });
    var bodyH = labelRight ? max(cs, CF.lineH(fs)) : cs + 8 + CF.lineH(fs) + (hasDesc ? 8 + CF.lineH(dfs) : 0);
    var vrow = o.vRowH || max(48, bodyH + (labelRight ? 8 : 12));
    var padX = vert ? 0 : 8;
    var h = vert ? cells.length * vrow : max(bodyH, cs + 8);
    var w = vert ? (cs + 16 + cells.reduce(function (a, c) { return max(a, contentW(c)); }, 0) + 8)
                 : (cells.reduce(function (a, c, i) { return a + colW(c) + (i ? tail + tailGap * 2 : 0); }, 0) + stepGap * (cells.length - 1) + padX * 2);
    if (o.w) w = o.w;
    var box = B(o.x || 0, o.y || 0, max(cs + 8, w), h);
    var ST = o.state || 'default';
    var ctx = CF.build(CF.name('Steps', { type: dot ? 'Dot' : (vert ? 'Vertical' : (labelRight ? 'Horizontal' : 'Bottom')), size: o.size,
             state: errAt >= 0 ? 'Error' : ST, slot: o.progressLine ? 'Progress' : null }), box, { parent: o.parent });
    var cursor = o.cursor === undefined ? (ST === 'focus' ? cur : -1) : Number(o.cursor), focusBox = null;
    var node = function (nx, ny, c, idx) {
      var st = c.status, active = st === 'process' || st === 'finish';
      // §G12: a clickable stepper lights the node the pointer is on, so hover/pressed/disabled are drawn on the node, not invented.
      if (idx === cursor && (ST === 'hover' || ST === 'pressed')) ctx.ellipse(B(nx - 5, ny - 5, cs + 10, cs + 10), { name: 'node·' + ST, fills: CF.fills(null, ST) });
      if (idx === cursor) focusBox = B(nx - 3, ny - 3, cs + 6, cs + 6);
      if (dot) {
        ctx.ellipse(B(nx, ny, cs, cs), { name: 'node·' + st, fill: st === 'process' ? C('primary') : (st === 'error' ? C('error') : (st === 'finish' ? C('primary') : C('surface'))),
          stroke: st === 'wait' ? C('borderStrong') : null, strokeW: 2 });
        if (st === 'process') ctx.ellipse(B(nx + cs / 2 - 2, ny + cs / 2 - 2, 4, 4), { name: 'node·inner', fill: C('surface') });
        return;
      }
      ctx.ellipse(B(nx, ny, cs, cs), { name: 'node·' + st, fill: st === 'process' ? C('primary') : (st === 'error' ? C('surface') : (st === 'finish' ? C('surface') : C('surfaceAlt'))),
        stroke: st === 'wait' ? C('borderStrong') : (st === 'error' ? C('error') : (st === 'finish' ? C('primary') : null)), strokeW: 2 });
      var icn = Math.round(cs * 0.5);
      if (c.icon) ctx.glyph(iconOf(c.icon, 'flag'), B(nx + (cs - icn) / 2, ny + (cs - icn) / 2, icn, icn), { color: active ? C('onPrimary') : C('muted'), strokeW: 1.8 });
      else if (st === 'finish') ctx.glyph('check', B(nx + (cs - icn) / 2, ny + (cs - icn) / 2, icn, icn), { color: C('primary'), strokeW: 2 });
      else if (st === 'error') ctx.glyph('close', B(nx + (cs - icn) / 2, ny + (cs - icn) / 2, icn, icn), { color: C('error'), strokeW: 2 });
      else ctx.text(String(idx + 1), B(nx, ny, cs, cs),
        { size: cs >= 28 ? 14 : 12, color: st === 'process' ? C('onPrimary') : C('muted'), weight: 600, refit: false });
    };
    if (vert) {
      cells.forEach(function (c, i) {
        var ny = box.y + i * vrow + (labelRight ? (vrow - cs) / 2 : 0);
        node(box.x, ny, c, i);
        if (i < cells.length - 1) {
          ctx.plate(B(box.x + cs / 2 - 1, ny + cs + 4, 2, max(4, vrow - cs - 12)),
            { name: 'tail·' + i, fill: c.status === 'finish' ? C('primary') : C('border') });
        }
        var tx = box.x + cs + 12;
        var tLH = CF.lineH(fs, c.status === 'process' ? 600 : 400), dLH = CF.lineH(dfs);
        var ty = labelRight ? ny + (cs - tLH) / 2 : ny;
        ctx.text(c.title, B(tx, ty, box.w - cs - 16, tLH),
          { size: fs, color: c.status === 'wait' ? C('muted') : C('ink'), weight: c.status === 'process' ? 600 : 400, align: 'left', valign: 'top', refit: false });
        if (c.desc) ctx.text(c.desc, B(tx, labelRight ? ty : ny + tLH + 8, box.w - cs - 16, dLH), { size: dfs, color: C('muted'), align: 'left', valign: 'top', refit: false });
      });
    } else {
      var xx = box.x + padX, ny0 = box.y + max(0, (h - bodyH) / 2);
      cells.forEach(function (c, i) {
        var cw2 = colW(c), nx = labelRight ? xx : xx + (cw2 - cs) / 2, ny = ny0;
        var tLH = CF.lineH(fs, c.status === 'process' ? 600 : 400), dLH = CF.lineH(dfs);
        // §2.3 ONE axis per row: the node, its connector and its label are centred on the same line. The band is
        // `max(cs, tLH)` tall, so drawing the node at the band's TOP puts it above the line whenever the node is
        // smaller than the copy — measured on `Steps·Dot·LG` (a 12px dot under a 20px label): node centres sat at 6
        // while every `tail·bg` and label centre sat at 10, so the timeline read as a row of dots that had slipped out
        // of its own connector.
        var nyNode = labelRight ? N(ny + (max(cs, tLH) - cs) / 2) : ny;
        node(nx, nyNode, c, i);
        var inkc = c.status === 'wait' ? C('muted') : C('ink');
        if (labelRight) {
          ctx.text(c.title, B(xx + cs + 12, ny, titleW(c), max(cs, tLH)), { size: fs, color: inkc,
            weight: c.status === 'process' ? 600 : 400, align: 'left', valign: 'middle', refit: false });
          if (c.desc) ctx.text(c.desc, B(xx + cs + 12 + titleW(c), ny, descW(c), max(cs, dLH)), { size: dfs, color: C('muted'), align: 'left', valign: 'middle', refit: false });
        } else {
          ctx.text(c.title, B(xx, ny + cs + 8, cw2, tLH), { size: fs, color: inkc,
            weight: c.status === 'process' ? 600 : 400, valign: 'top', refit: false });
          if (c.desc) ctx.text(c.desc, B(xx, ny + cs + 8 + tLH + 8, cw2, dLH), { size: dfs, color: C('muted'), valign: 'top', refit: false });
        }
        if (i < cells.length - 1) {
          var tStart = xx + cw2 + tailGap, ty2 = labelRight ? ny + max(cs, tLH) / 2 : ny + cs / 2;
          var th2 = o.progressLine ? 4 : 2;
          ctx.plate(B(tStart, N(ty2 - th2 / 2), max(8, tail), th2), { name: 'tail·bg·' + i, fill: C('border'), radius: 'xs' });
          if (o.progressLine && c.status === 'finish') ctx.plate(B(tStart, N(ty2 - 2), max(8, tail), 4), { name: 'tail·fill·' + i, fill: C('primary'), radius: 'xs' });
          else if (o.progressLine && c.status === 'process') ctx.plate(B(tStart, N(ty2 - 2), max(8, tail) * 0.5, 4), { name: 'tail·fill·half', fill: C('primary'), radius: 'xs' });
        }
        xx += cw2 + (i < cells.length - 1 ? tail + tailGap * 2 + stepGap : 0);
      });
    }
    await ctx.settle(); ctx.place();
    // §1.3 reserved: the boundary is authored around the node the keyboard is on (a circle → the ladder's circle step),
    // the perceivable cue is the 12% wash ctx.ring draws under it.
    if (ST === 'focus' && focusBox) ctx.ring(focusBox, { radius: 'lg' });
    return ctx.host;
  };

  /** Dropdown menu — panel 200-280 pad 4-8 · item 32 · icon 16 + label + shortcut (muted, right) + submenu chevron · group label · divider · danger · selectable. */
  CF.menu = async function (o) {
    o = o || {};
    var raw = o.items || ['Edit', 'Duplicate', '-', 'Share', 'Delete'];
    var w = o.w || 220, itemH = o.itemH || 32, padX = o.padX === undefined ? 12 : o.padX, padV = o.padV === undefined ? 4 : o.padV;
    // §2.1 A `'-'` in the items list is a SEMANTIC group boundary, not a spacer: it draws nothing and takes no
    // vertical space, so every command row keeps the same rhythm. Measured on `Menu·IconStart`, giving it a
    // `space.md` gap made the label gaps 12 / 24 / 12 — the owner read that as uneven padding, and with rule 43
    // having removed the line there is no marker left to justify the hole. When a break must be SEEN, use the
    // `group` row (a 24px label) or a functional `boundary·group` line, which rule 43 exempts.
    var hasIcons = o.icon !== false, hasKeys = !!o.keys;
    var rows = raw.map(function (it) {
      if (it === '-' || it === null) return { kind: 'divider' };
      if (typeof it === 'string') return { kind: 'item', label: it };
      if (it.label === undefined && it.group !== undefined) return { kind: 'group', label: String(it.group) };
      return Object.assign({ kind: 'item' }, it);
    });
    var h = padV * 2;
    rows.forEach(function (r) { h += r.kind === 'divider' ? 0 : (r.kind === 'group' ? 24 : itemH); });
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Menu', { type: o.variant === 'submenu' ? 'Submenu' : (o.selectable ? 'Selectable' : null), state: o.state,
      // the leading 16px glyph column IS the menu's icon slot, so the host name has to say so (§4 coverage reads names).
      slot: [hasKeys ? 'Shortcuts' : null, hasIcons ? 'IconStart' : 'NoIcon'].filter(Boolean).join('-') || null }), box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), stroke: C('border'), strokeW: 1, shadow: o.flat ? 0 : 3 });
    var y = box.y + padV;
    var firstItem = -1;
    for (var fi = 0; fi < rows.length; fi++) { if (rows[fi].kind === 'item') { firstItem = fi; break; } }
    var act = o.active === undefined ? (o.state === 'focus' || o.state === 'hover' || o.state === 'pressed' ? firstItem : -1) : Number(o.active);
    var rowB = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.kind === 'divider') { continue; }   // no spacer, no plate — see the §2.1 note above
      if (r.kind === 'group') {
        ctx.text(String(r.label).toUpperCase(), B(box.x + padX, y, box.w - padX * 2, 24),
          { size: 11, role: 'overline', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false });
        y += 24; continue;
      }
      var dis = !!r.disabled, S = dis ? 'disabled' : (i === act ? (o.state === 'focus' ? 'focus' : 'hover') : (r.selected || o.selected === i ? 'selected' : 'default'));
      var on = S === 'hover' || S === 'selected' || S === 'focus';
      if (i === act) rowB = B(box.x + 4, y, box.w - 8, itemH);
      if (on) ctx.plate(B(box.x + 4, y, box.w - 8, itemH), { name: 'row·' + i, fills: CF.fills(S === 'selected' ? C('primarySoft') : null, S), radius: CF.radius('sm') });
      var ink = r.danger ? C('error') : (S === 'selected' ? C('primary') : C('ink'));
      var x = box.x + padX;
      if (hasIcons || o.selectable) {
        if (o.selectable && !r.glyph) {
          ctx.plate(B(x, y + (itemH - 16) / 2, 16, 16), { name: 'check·box', fill: null, stroke: r.selected ? C('primary') : C('borderStrong'), strokeW: 1.5, radius: 'xs' });
          if (r.selected) ctx.glyph('check', B(x + 2, y + (itemH - 12) / 2, 12, 12), { color: C('primary'), strokeW: 2 });
        } else if (hasIcons) ctx.glyph(iconOf(r.glyph, 'edit'), B(x, y + (itemH - 16) / 2, 16, 16), { color: dis ? C('muted') : ink, strokeW: 1.6 });
        x += 16 + 10;
      }
      var keyW = hasKeys && r.key ? CF.estW(String(r.key), 12) + 12 : 0;
      var subW = r.submenu ? 16 : 0;
      ctx.text(String(r.label), B(x, y, box.w - (x - box.x) - padX - keyW - subW - 4, itemH),
        { size: 14, color: dis ? C('muted') : ink, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
      var rx = box.x + box.w - padX;
      if (r.submenu) { rx -= 16; ctx.glyph('chevronRight', B(rx, y + (itemH - 16) / 2, 16, 16), { color: C('muted'), anchor: 'right' }); rx -= 8; }
      if (keyW) {
        ctx.plate(B(rx - keyW, y + (itemH - 20) / 2, keyW, 20), { name: 'kbd·' + i, fill: C('surfaceAlt'), radius: 'xs', stroke: C('border'), strokeW: 1 });
        ctx.text(String(r.key), B(rx - keyW, y, keyW, itemH), { size: 11, role: 'kbd', color: C('muted'), weight: 500, refit: false });
      }
      y += itemH;
    }
    await ctx.settle(); ctx.place();
    if (o.state === 'focus') ctx.ring(rowB || B(box.x + 4, box.y + padV, box.w - 8, itemH), { radius: CF.radius('sm') });
    return ctx.host;
  };

  /** Command palette — panel 560-680 · search 44-48 + ⌘K · section labels · rows 40 (icon 18 · title 14 · hint · kbd) · selected 12% · footer legend. */
  CF.commandPalette = async function (o) {
    o = o || {};
    var w = o.w || 560, rowH = o.rowH || 40, pad = 8, searchH = o.searchH || 44, groupH = 26, footH = o.footer === false ? 0 : 36;
    var groups = o.groups || [
      { label: 'Suggested', items: [{ glyph: 'file', title: 'New file', key: 'Ctrl N' }, { glyph: 'folder', title: 'Open project…', key: 'Ctrl O' }, { glyph: 'settings', title: 'Workspace settings' }] },
      { label: 'Recent', items: [{ glyph: 'layers', title: CF.brandName + ' design system', hint: 'edited 2h ago' }, { glyph: 'chart', title: 'Q3 report', hint: 'shared' }] }
    ];
    var h = pad + searchH + 9 + 8;
    groups.forEach(function (g) { h += (g.label ? groupH : 0) + g.items.length * rowH; });
    h += pad + footH;
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('CommandPalette', { slot: o.preview ? 'Preview' : null, state: o.state }), box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('spec'), stroke: C('border'), strokeW: 1, shadow: o.flat ? 0 : 5 });
    var sb = B(box.x + pad, box.y + pad, box.w - pad * 2, searchH);
    // `preview` is a documented slot of this family, so the factory has to draw it: a spec row labelled "160 right pane"
    // that renders a plain list is the "documented but unbuilt" failure the engine exists to prevent. The list column
    // shrinks by the pane, so a row's kbd chip never ends up painted under it.
    var pvW = o.preview ? (o.previewW || 160) : 0;
    var rowW = box.w - pvW, rowR = box.x + rowW;
    ctx.plate(sb, { name: 'search·field', fill: C('surfaceAlt'), radius: CF.radius('md') });
    ctx.glyph('search', B(sb.x + 14, sb.y + (searchH - 20) / 2, 20, 20), { color: C('muted'), strokeW: 2 });
    // An idle palette shows the placeholder, not an empty string: `query: ''` means "nothing typed yet".
    var typed = (o.query === undefined || o.query === null || String(o.query) === '') ? null : String(o.query);
    ctx.text(typed === null ? String(o.placeholder || 'Type a command or search…') : typed,
      B(sb.x + 42, sb.y, sb.w - 42 - 62, searchH), { size: 14, color: typed === null ? C('muted') : C('ink'), align: 'left', valign: 'middle', refit: false });
    ctx.plate(B(sb.x + sb.w - 52, sb.y + (searchH - 22) / 2, 44, 22), { name: 'kbd·hint', fill: C('surface'), radius: 'xs', stroke: C('border'), strokeW: 1 });
    ctx.text('Ctrl K', B(sb.x + sb.w - 52, sb.y, 44, searchH), { size: 11, role: 'kbd', color: C('muted'), weight: 600, refit: false });
    var y = sb.y + searchH + 9;
    ctx.plate(B(box.x + 1, y - 5, box.w - 2, 1), { name: 'hairline', fill: C('border') });
    y += 8;
    var flat = [], gi = 0;
    groups.forEach(function (g) { if (g.label) flat.push({ kind: 'group', label: g.label }); g.items.forEach(function (it) { flat.push({ kind: 'row', it: it, g: gi }); }); gi++; });
    var act = o.active === undefined ? 0 : Number(o.active), seen = 0;
    flat.forEach(function (r) {
      if (r.kind === 'group') {
        ctx.text(String(r.label).toUpperCase(), B(box.x + pad + 8, y, rowW - pad * 2 - 16, groupH),
          { size: 11, role: 'overline', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false });
        y += groupH; return;
      }
      var on = seen === act; seen++;
      if (on) ctx.plate(B(box.x + pad, y, rowW - pad * 2, rowH), { name: 'row·active', fills: CF.fills(C('primarySoft'), null), radius: CF.radius('sm') });
      var it = r.it, x = box.x + pad + 8;
      ctx.plate(B(x, y + (rowH - 24) / 2, 24, 24), { name: 'row·icon·wrap', fill: C('surfaceAlt'), radius: 'sm' });
      ctx.glyph(iconOf(it.glyph, 'command'), B(x + 3, y + (rowH - 18) / 2, 18, 18), { color: on ? C('primary') : C('muted'), strokeW: 1.6 });
      x += 24 + 12;
      var keyW = it.key ? CF.estW(String(it.key), 12) + 14 : 0;
      ctx.text(String(it.title), B(x, y, rowW - (x - box.x) - pad - keyW - 120, rowH - (it.hint ? 6 : 0)),
        { size: 14, color: C('ink'), weight: on ? 500 : 400, align: 'left', valign: it.hint ? 'top' : 'middle', refit: false,
          dy: it.hint ? 6 : 0 });
      if (it.hint) ctx.text(String(it.hint), B(x, y + 20, rowW - (x - box.x) - pad - keyW - 12, 14), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
      if (keyW) {
        ctx.plate(B(box.x + rowW - pad - 8 - keyW, y + (rowH - 20) / 2, keyW, 20), { name: 'kbd·row', fill: C('surfaceAlt'), radius: 'xs', stroke: C('border'), strokeW: 1 });
        ctx.text(String(it.key), B(box.x + rowW - pad - 8 - keyW, y, keyW, rowH), { size: 11, role: 'kbd', color: C('muted'), weight: 600, refit: false });
      }
      y += rowH;
    });
    if (pvW) {
      var pt = sb.y + searchH + 13, pbot = box.y + box.h - pad - footH;
      ctx.plate(B(rowR, pt - 8, 1, pbot - pt + 8), { name: 'preview·divider', fill: C('border') });
      ctx.plate(B(rowR + 10, pt, pvW - 20, 84), { name: 'preview·thumb', fill: C('surfaceAlt'), radius: CF.radius('sm') });
      ctx.glyph('file', B(rowR + pvW / 2 - 12, pt + 30, 24, 24), { color: C('muted') });
      ctx.text(String(o.previewTitle || 'New file'), B(rowR + 10, pt + 92, pvW - 20, 18),
        { size: 13, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false });
      var pnote = CF.wrap(String(o.previewNote || 'Creates a file in the current project'), pvW - 20, 12);
      pnote.slice(0, 3).forEach(function (ln, i) {
        ctx.text(ln, B(rowR + 10, pt + 112 + i * 16, pvW - 20, 14), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
      });
    }
    if (footH) {
      var fy = box.y + box.h - pad - footH + 6;
      ctx.plate(B(box.x + 1, fy - 6, box.w - 2, 1), { name: 'hairline·footer', fill: C('border') });
      ctx.text('up/down to navigate · enter to select · esc to close', B(box.x + pad + 8, fy, box.w - pad * 2 - 16, footH - 6),
        { size: 12, color: C('muted'), align: 'left', valign: 'middle', refit: false });
      ctx.glyph('command', B(box.x + box.w - pad - 24, fy + (footH - 18) / 2, 16, 16), { color: C('borderStrong') });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Anchor / table of contents — 2px rail · active segment primary · rows 28 (13-14) · nested indent 12. */
  CF.anchor = async function (o) {
    o = o || {};
    var raw = o.items || ['Overview', 'Installation', 'Usage', { label: 'Options', level: 1 }, { label: 'Presets', level: 1 }, 'API', 'Migration'];
    var items = raw.map(function (it) { return typeof it === 'string' ? { label: it, level: 0 } : Object.assign({ level: 0 }, it); });
    var rowH = o.rowH || 28, fs = o.fs || 13, railW = 2, indent = o.indent === undefined ? 12 : o.indent;
    var w = o.w || max(120, 4 + railW + 20 + items.reduce(function (a, it) { return max(a, (it.level || 0) * indent + CF.estW(String(it.label), fs) + 24); }, 0));
    var h = items.length * rowH;
    var box = B(o.x || 0, o.y || 0, w, h);
    var ST = o.state || 'default';
    var ctx = CF.build(CF.name('Anchor', { type: o.dots ? 'Dots' : 'Rail', state: ST, slot: o.counters ? 'Counters' : null }), box, { parent: o.parent });
    var railX = box.x + 4;
    ctx.plate(B(railX, box.y + 2, railW, box.h - 4), { name: 'rail', fill: C('ink'), opacity: 0.10 });
    var act = o.active === undefined ? 1 : Number(o.active);
    if (act >= 0) ctx.plate(B(railX, box.y + act * rowH + 2, railW, rowH - 4), { name: 'rail·active', fill: C('primary') });
    if (act >= 0 && (ST === 'hover' || ST === 'pressed')) ctx.plate(B(box.x + 4, box.y + act * rowH, box.w - 8, rowH),
      { name: 'row·' + (ST === 'pressed' ? 'pressed' : 'hover'), fills: CF.fills(null, ST), radius: 'xs' });
    items.forEach(function (it, i) {
      var on = i === act, ly = box.y + i * rowH;
      if (o.dots) { var dd = on ? 10 : 8; ctx.ellipse(B(railX + railW / 2 - dd / 2, ly + rowH / 2 - dd / 2, dd, dd), { name: 'dot·' + i, fill: on ? C('primary') : C('borderStrong') }); }
      var tx = railX + railW + 12 + (it.level || 0) * indent;
      ctx.text(String(it.label), B(tx, ly, box.w - (tx - box.x) - (o.counters ? 30 : 8), rowH),
        { size: fs, color: on ? C('primary') : (it.disabled ? C('muted') : C('muted')), weight: on ? 500 : 400,
          opacity: it.disabled ? CF.STATE.disabledContent : (on ? 1 : 0.92), align: 'left', valign: 'middle', refit: false });
      if (o.counters) ctx.text(String(it.count === undefined ? (i + 1) * 3 : it.count), B(box.x + box.w - 30, ly, 22, rowH),
        { size: 12, color: C('muted'), align: 'right', valign: 'middle', refit: false });
    });
    await ctx.settle(); ctx.place();
    if (ST === 'focus') ctx.ring(B(box.x + 4, box.y + (act >= 0 ? act * rowH : 0), box.w - 8, rowH), { radius: 'xs' });
    return ctx.host;
  };

  // ================================================================ E · Feedback & overlays (§3.5)

  /** Panel box grown by the arrow depth on the arrow side, so a bubble never escapes its host (audit containment). */
  var bubbleBox = function (box, side, depth, at) {
    var d = depth || 8, a = at || (side === 'left' || side === 'right' ? box.y + box.h / 2 : box.x + box.w / 2);
    var hb = B(side === 'left' ? box.x - d : box.x, side === 'top' ? box.y - d : box.y,
               box.w + (side === 'left' || side === 'right' ? d : 0),
               box.h + (side === 'top' || side === 'bottom' ? d : 0));
    return { host: hb, panel: box, at: a, depth: d, side: side };
  };
  /** Draw the bubble panel path (fill + hairline) inside an already-expanded host. */
  var bubbleDraw = function (ctx, bb, o) {
    o = o || {};
    ctx.path(CF.bubble(bb.panel, { radius: o.radius === undefined ? CF.radius('md') : o.radius,
      arrow: { side: bb.side, at: bb.at, size: o.arrowW || 14, depth: bb.depth } }),
      { name: 'panel', fill: o.fill || C('surface'), stroke: o.stroke === null ? null : (o.stroke || C('border')), strokeW: 1, shadow: o.shadow === undefined ? 4 : o.shadow });
  };
  var SEVERITY_GLYPH = { error: 'error', danger: 'error', warning: 'warning', info: 'info', processing: 'info', success: 'success', neutral: 'info' };

  /** Alert — severity icon 20 · title 14/500 + body 13 · close 16 · action row · soft tint or filled · banner = full-bleed, no radius. */
  CF.alert = async function (o) {
    o = o || {};
    var tone = o.tone || 'info', banner = o.variant === 'banner', filled = o.variant === 'filled';
    var soft = TONEMAP[tone] || TONEMAP.info;
    // §4: a tinted alert is ink copy on the wash, a filled alert is white copy on the ink surface. The base hue stays on
    // the accent bar and the icon — graphics need 3:1, copy needs 4.5, and the base hue never reaches it on its own tint.
    var deep = C(soft[2]), fg = C(soft[1]), bgc = filled ? deep : C(soft[0]);
    var ink = filled ? C('onPrimary') : deep;
    var title = o.title !== undefined ? String(o.title) : (o.message !== undefined ? String(o.message) : 'Changes published');
    var desc = o.description !== undefined ? String(o.description) : (o.title !== undefined && o.message !== undefined ? String(o.message) : null);
    var fs = 14, dfs = 13, padX = o.padX === undefined ? 16 : o.padX, padY = o.padY === undefined ? 12 : o.padY;
    var iconW = o.icon === false ? 0 : 20 + 12, closeW = o.closable ? 16 + 12 : 0;
    var acts = o.actions ? (Array.isArray(o.actions) ? o.actions : [String(o.actions)]) : null;
    var actW = acts ? acts.reduce(function (a, s) { return a + CF.estW(String(s), 13) + 24; }, 0) : 0;
    var contentW = max(CF.estW(title, fs), desc ? CF.estW(desc, dfs) : 0, actW);
    var w = o.w || (banner ? 960 : max(260, padX * 2 + iconW + closeW + contentW));
    var h = padY * 2 + fs + 4 + (desc ? dfs + 6 : 0) + (acts ? 12 + 20 : 0);
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Alert', { type: banner ? 'Banner' : (filled ? 'Filled' : (desc ? 'Description' : null)), tone: tone, state: o.state, slot: o.closable ? 'Dismissible' : null }), box,
      { parent: o.parent, radius: banner ? 0 : CF.radius('md') });
    ctx.host.fills = [{ fillColor: bgc, fillOpacity: 1 }];
    if (banner || o.leftBar !== false) ctx.plate(B(box.x, box.y, 3, box.h), { name: 'accent·bar', fill: filled ? C('surface') : fg });
    var x = box.x + padX;
    if (iconW) { ctx.glyph(SEVERITY_GLYPH[tone] || 'info', B(x, box.y + padY + 1, 20, 20), { color: ink, strokeW: 1.8 }); x += 20 + 12; }
    ctx.text(title, B(x, box.y + padY - 1, contentW, fs + 6), { size: fs, color: ink, weight: 600, align: 'left', valign: 'top', refit: false });
    var yy = box.y + padY + fs + 5;
    if (desc) { ctx.text(desc, B(x, yy, contentW, dfs + 6), { size: dfs, color: filled ? C('onPrimary') : C('ink'), opacity: filled ? 0.92 : 0.78, align: 'left', valign: 'top', refit: false }); yy += dfs + 6; }
    if (acts) {
      yy += 6;
      var ax = x;
      acts.forEach(function (a, i) {
        var lw = CF.estW(String(a), 13) + 8;
        ctx.text(String(a), B(ax, yy, lw, 20), { size: 13, color: filled ? C('onPrimary') : deep, weight: 500, align: 'left', valign: 'middle', refit: false, underline: true });
        ax += lw + 16;
      });
    }
    if (o.closable) ctx.glyph('close', B(box.x + box.w - padX - 16, box.y + padY, 16, 16), { color: ink, opacity: 0.7, strokeW: 1.6, anchor: 'right' });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Notification — card w 300-400 · icon 20 + title 14/500 + body 13 · close 16 · optional action · pad 16 · elevation 5. */
  CF.notification = async function (o) {
    o = o || {};
    var tone = o.tone || 'info';
    var soft = TONEMAP[tone] || TONEMAP.info;
    var title = String(o.title === undefined ? 'Upload finished' : o.title);
    var desc = String(o.description === undefined ? 'design-2026.fig landed in 3 files.' : o.description);
    var pad = o.pad === undefined ? 16 : o.pad, fs = 14, dfs = 13;
    var iconW = o.icon === false ? 0 : 20 + 12, closeW = o.closable === false ? 0 : 16 + 8;
    var contentW = max(CF.estW(title, fs), CF.estW(desc, dfs));
    // An action gets its own bottom row: drawn at the copy column it landed on top of the description (text_overlap_x).
    var actionH = o.action ? 36 : 0, actionW = o.action ? CF.estW(String(o.action), 14) + 24 : 0;
    var w = o.w || (pad * 2 + iconW + closeW + max(contentW, actionW)), h = pad * 2 + fs + 6 + dfs + 6 + actionH;
    var box = B(o.x || 0, o.y || 0, max(280, w), h);
    var ctx = CF.build(CF.name('Notification', { tone: tone, slot: o.action ? 'Action' : null, state: o.state }), box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), stroke: C('border'), strokeW: 1, shadow: o.flat ? 0 : 5 });
    var x = box.x + pad;
    if (iconW) { ctx.glyph(SEVERITY_GLYPH[tone] || 'info', B(x, box.y + pad, 20, 20), { color: C(soft[1]), strokeW: 1.8 }); x += 20 + 12; }
    ctx.text(title, B(x, box.y + pad - 2, contentW, fs + 6), { size: fs, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false });
    ctx.text(desc, B(x, box.y + pad + fs + 6, contentW, dfs + 8), { size: dfs, color: C('muted'), align: 'left', valign: 'top', refit: false });
    if (o.closable !== false) ctx.glyph('close', B(box.x + box.w - pad - 16, box.y + pad, 16, 16), { color: C('muted'), strokeW: 1.6, anchor: 'right' });
    if (o.action) {
      await CF.button({ parent: ctx.host, x: box.x + box.w - pad - actionW, y: box.y + box.h - pad - 24,
        label: String(o.action), size: 'xs', type: 'default' });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Toast — compact dark/light pill · icon 18 + 13-14 copy · optional action link · auto-dismiss meter 2-3px. */
  CF.toast = async function (o) {
    o = o || {};
    var tone = o.tone || 'neutral', dark = o.surface !== 'light';
    var msg = String(o.message === undefined ? 'Saved to the cloud' : o.message);
    var fs = 13, padx = 12, pady = 10, iconW = o.icon === false ? 0 : 18 + 8;
    var actW = o.action ? CF.estW(String(o.action), fs) + 12 : 0;
    var meterH = o.duration ? 3 : 0;
    var w = o.w || (padx * 2 + iconW + CF.estW(msg, fs) + actW + (actW ? 8 : 0));
    var h = pady * 2 + fs + 6 + meterH;
    var box = B(o.x || 0, o.y || 0, max(120, w), h);
    var ctx = CF.build(CF.name('Toast', { type: dark ? 'Dark' : 'Light', tone: tone, slot: o.action ? 'Action' : (o.duration ? 'Timed' : null) }), box,
      { parent: o.parent, fill: dark ? C('ink') : C('surface'), radius: CF.radius('md'), stroke: dark ? null : C('border'), strokeW: 1, shadow: dark ? 0 : 4 });
    var ink = dark ? C('onPrimary') : C('ink');
    var x = box.x + padx;
    if (iconW) { ctx.glyph(SEVERITY_GLYPH[tone] || 'check', B(x, box.y + pady + 1, 18, 18), { color: tone === 'neutral' ? ink : C(TONEMAP[tone] ? TONEMAP[tone][1] : 'success'), strokeW: 1.8 }); x += 18 + 8; }
    ctx.text(msg, B(x, box.y + pady, box.w - (x - box.x) - padx - actW - (actW ? 8 : 0), fs + 6),
      { size: fs, color: ink, align: 'left', valign: 'top', refit: false });
    if (actW) ctx.text(String(o.action), B(box.x + box.w - padx - actW + 4, box.y + pady, actW - 4, fs + 6),
      { size: fs, color: dark ? C('onPrimary') : C('primary'), weight: 600, align: 'right', valign: 'top', refit: false, underline: true });
    if (meterH) {
      ctx.plate(B(box.x + 1, box.y + box.h - meterH, box.w - 2, meterH), { name: 'meter·track', fill: dark ? '#FFFFFF' : C('ink'), opacity: 0.12 });
      ctx.plate(B(box.x + 1, box.y + box.h - meterH, max(4, (box.w - 2) * (o.remaining === undefined ? 0.62 : Number(o.remaining))), meterH),
        { name: 'meter', fill: dark ? '#FFFFFF' : C('primary'), opacity: dark ? 0.85 : 1 });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Tooltip — 12-13 copy · pad 8×5 · dark by default · arrow on any side · optional title line. */
  CF.tooltip = async function (o) {
    o = o || {};
    var dark = o.surface !== 'light', fs = o.fs || 12;
    var title = o.title !== undefined ? String(o.title) : null;
    var msg = String(o.text === undefined ? 'Copy the link first' : o.text);
    var padx = 10, pady = 7, arrow = o.arrow ? (o.arrowSide || 'top') : null, depth = arrow ? 7 : 0;
    var panel = B((o.x || 0) + depth * (arrow === 'left' ? 1 : 0), (o.y || 0) + depth * (arrow === 'top' ? 1 : 0),
                  max(48, padx * 2 + max(CF.estW(msg, fs), title ? CF.estW(title, fs) : 0)),
                  pady * 2 + fs + 4 + (title ? fs + 4 : 0));
    var bb = arrow ? bubbleBox(panel, arrow, depth) : { host: panel, panel: panel, at: 0, depth: 0, side: null };
    var ctx = CF.build(CF.name('Tooltip', { type: dark ? 'Dark' : 'Light', slot: title ? 'Title' : null }), bb.host, { parent: o.parent });
    if (arrow) bubbleDraw(ctx, bb, { fill: dark ? C('ink') : C('surface'), stroke: dark ? null : C('border'), radius: CF.radius('sm'), shadow: dark ? 2 : 4 });
    else { ctx.host.fills = [{ fillColor: dark ? C('ink') : C('surface'), fillOpacity: 1 }]; ctx.host.borderRadius = CF.radius('sm'); }
    var ink = dark ? '#FFFFFF' : C('ink');
    var y = panel.y + pady;
    if (title) { ctx.text(title, B(panel.x + padx, y, panel.w - padx * 2, fs + 4), { size: fs, color: ink, weight: 600, valign: 'top', refit: false }); y += fs + 4; }
    ctx.text(msg, B(panel.x + padx, y, panel.w - padx * 2, fs + 4), { size: fs, color: ink, opacity: title ? 0.86 : 1, valign: 'top', refit: false });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Popover — bubble 240-320 · title 14/500 + body 13 · pad 12-16 · optional footer actions · arrow on any side. */
  CF.popover = async function (o) {
    o = o || {};
    var w = o.w || 260, pad = o.pad === undefined ? 16 : o.pad, arrow = o.arrow ? (o.arrowSide || 'top') : null;
    var title = o.title === undefined ? null : String(o.title);
    var body = String(o.content === undefined ? 'Share this file with your team. Anyone with the link can comment.' : o.content);
    var fs = 14, dfs = 13;
    var acts = o.actions ? (Array.isArray(o.actions) ? o.actions : [o.actions]) : null;
    var pw = max(o.w || w, 200);
    var lines = CF.wrap(body, (pw - pad * 2) * 0.94, dfs);
    var ph = pad * 2 + (title ? fs + 8 : 0) + lines.length * (dfs + 6) + (acts ? 20 + 20 : 0);
    var panel = B((o.x || 0) + (arrow === 'left' ? 8 : 0), (o.y || 0) + (arrow === 'top' ? 8 : 0), pw, ph);
    var bb = arrow ? bubbleBox(panel, arrow, 8, o.arrowAt) : { host: panel, panel: panel, at: 0, depth: 0, side: null };
    var ctx = CF.build(CF.name('Popover', { slot: title ? 'Title' : (acts ? 'Actions' : null), state: o.state }), bb.host, { parent: o.parent });
    if (arrow) bubbleDraw(ctx, bb, { radius: CF.radius('md'), shadow: 4 });
    else { ctx.host.fills = [{ fillColor: C('surface'), fillOpacity: 1 }]; ctx.host.borderRadius = CF.radius('md'); ctx._stroke(ctx.host, C('border'), 1); ctx.host.shadows = CF.shadow(4); }
    var y = panel.y + pad;
    if (title) { ctx.text(title, B(panel.x + pad, y, panel.w - pad * 2, fs + 6), { size: fs, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false }); y += fs + 8; }
    var lh = dfs + 6;
    lines.forEach(function (ln, i) {
      ctx.text(ln, B(panel.x + pad, y + i * lh, panel.w - pad * 2, dfs + 4), { size: dfs, color: C('muted'), align: 'left', valign: 'top', refit: false });
    });
    y += lines.length * lh;
    if (acts) {
      y += 12;
      var ax = panel.x + pad;
      for (var i = 0; i < acts.length; i++) {
        await CF.button({ parent: ctx.host, x: ax, y: N(y - 12), label: String(acts[i]), size: 'xs', type: i === acts.length - 1 ? 'primary' : 'default' });
        ax += CF.estW(String(acts[i]), 13) + 28 + 8;
      }
      y += 24;
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Popconfirm — bubble 240-300 · warning icon 20 · message 13-14 · cancel + confirm row (destructive default). */
  CF.popconfirm = async function (o) {
    o = o || {};
    var tone = o.tone || 'danger', soft = TONEMAP[tone] || TONEMAP.danger;
    var msg = String(o.message === undefined ? 'Delete this file for everyone?' : o.message);
    var title = o.title !== undefined ? String(o.title) : null;
    var fs = 14, dfs = 13, pad = 16, arrow = o.arrow ? (o.arrowSide || 'top') : null;
    var cancel = String(o.cancelText === undefined ? 'Cancel' : o.cancelText);
    var okText = String(o.okText === undefined ? 'Delete' : o.okText);
    var btnRowW = CF.estW(cancel, 13) + CF.estW(okText, 13) + 56 + 8;
    var contentW = max(CF.estW(title || msg, fs), CF.estW(msg, dfs), btnRowW);
    var pw = max(o.w || 260, pad * 2 + 20 + 12 + contentW);
    var ph = pad * 2 + (title ? fs + 6 : 0) + dfs + 6 + 12 + 28;
    var panel = B((o.x || 0) + (arrow === 'left' ? 8 : 0), (o.y || 0) + (arrow === 'top' ? 8 : 0), pw, ph);
    var bb = arrow ? bubbleBox(panel, arrow, 8, o.arrowAt) : { host: panel, panel: panel, at: 0, depth: 0, side: null };
    var ctx = CF.build(CF.name('Popconfirm', { tone: tone, state: o.state }), bb.host, { parent: o.parent });
    if (arrow) bubbleDraw(ctx, bb, { radius: CF.radius('md'), shadow: 4 });
    else { ctx.host.fills = [{ fillColor: C('surface'), fillOpacity: 1 }]; ctx.host.borderRadius = CF.radius('md'); ctx._stroke(ctx.host, C('border'), 1); ctx.host.shadows = CF.shadow(4); }
    ctx.glyph(SEVERITY_GLYPH[tone] || 'warning', B(panel.x + pad, panel.y + pad, 20, 20), { color: C(soft[1]), strokeW: 1.8 });
    var tx = panel.x + pad + 20 + 12, tw = panel.w - pad * 2 - 32;
    var y = panel.y + pad;
    if (title) { ctx.text(title, B(tx, y, tw, fs + 4), { size: fs, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false }); y += fs + 6; }
    ctx.text(msg, B(tx, y, tw, dfs + 6), { size: dfs, color: C('ink'), opacity: 0.85, align: 'left', valign: 'top', refit: false });
    y += dfs + 6 + 12;
    var bw1 = CF.estW(okText, 13) + 32, bw2 = CF.estW(cancel, 13) + 32;
    await CF.button({ parent: ctx.host, x: panel.x + pw - pad - bw1, y: N(y), label: okText, size: 'xs', type: 'primary', tone: tone, w: bw1 });
    await CF.button({ parent: ctx.host, x: panel.x + pw - pad - bw1 - 8 - bw2, y: N(y), label: cancel, size: 'xs', type: 'default', w: bw2 });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Modal — scrim 55% · panel 400-720 (measure cap 560) · header 64 (title 16/600 + close 32) · body pad 24 · footer 72 right actions. Regions from LY.slots.modal. */
  CF.modal = async function (o) {
    o = o || {};
    var w = o.w || 520, headerH = o.headerH || 64, footerH = o.footerH || (o.footer === false ? 0 : 72), pad = o.pad === undefined ? 24 : o.pad;
    var bodyH = o.bodyH || (o.description ? 96 : 72);
    var rect = o.rect ? B(o.rect.x, o.rect.y, o.rect.w, o.rect.h) : B(o.x || 0, o.y || 0, w, headerH + bodyH + footerH);
    if (o.rect) bodyH = rect.h - headerH - footerH;
    var slot = LY && LY.slots.modal ? LY.slots.modal(rect, { headerH: headerH, footerH: footerH, pad: pad }) : null;
    var header = slot ? slot.header : B(rect.x, rect.y, rect.w, headerH);
    var body = slot ? slot.body : B(rect.x + pad, rect.y + headerH, rect.w - pad * 2, bodyH);
    var copy = slot ? slot.copy : B(body.x, body.y, min(body.w, 560), body.h);
    var footer = slot ? slot.footer : B(rect.x, rect.y + rect.h - footerH, rect.w, footerH);
    var closeB = slot ? slot.closeButton : B(rect.x + rect.w - 44, rect.y + 10, 32, 32);
    var ctx = CF.build(CF.name('Modal', { type: o.confirm ? 'Confirm' : (o.width === 'wide' ? 'Wide' : null), size: o.size, state: o.state, slot: o.footer === false ? 'NoFooter' : null }), rect,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('spec'), shadow: o.flat ? 0 : 5 });
    if (o.scrim) {
      var sw2 = o.scrimW || 1440, sh2 = o.scrimH || max(900, rect.h + 240);
      ctx.plate(B(rect.x + rect.w / 2 - sw2 / 2, rect.y + rect.h / 2 - sh2 / 2, sw2, sh2),
        { name: 'scrim', fill: C('ink'), opacity: o.scrimOpacity === undefined ? 0.55 : Number(o.scrimOpacity) });
    }
    ctx.text(String(o.title === undefined ? 'Share “' + CF.brandName + '”' : o.title), B(header.x + pad, header.y, header.w - pad * 2 - 56, headerH),
      { size: 16, color: C('ink'), weight: 600, align: 'left', valign: 'middle', refit: false });
    if (o.closable !== false) {
      ctx.plate(B(closeB.x, closeB.y, closeB.w, closeB.h), { name: 'close·hit', fills: CF.fills(null, o.hoverClose ? 'hover' : null), radius: CF.radius('sm') });
      ctx.glyph('close', B(closeB.x + 8, closeB.y + 8, 16, 16), { color: C('muted'), strokeW: 1.8 });
    }
    if (o.iconAlert) {
      var t = o.iconAlert === true ? 'warning' : o.iconAlert;
      ctx.glyph(SEVERITY_GLYPH[t] || 'warning', B(body.x, copy.y + 2, 22, 22), { color: C((TONEMAP[t] || TONEMAP.warning)[1]), strokeW: 1.8 });
    }
    var bx = body.x + (o.iconAlert ? 34 : 0);
    ctx.text(String(o.description === undefined ? 'Anyone with the link can comment. People outside the workspace can view it.' : o.description),
      B(bx, copy.y, copy.w - (bx - body.x), max(20, copy.h - (o.inputs ? 40 : 0))),
      { size: 14, color: C('muted'), align: 'left', valign: 'top', refit: false });
    if (o.inputs) {
      var iy = copy.y + 44;
      for (var ii = 0; ii < o.inputs.length; ii++) {
        await CF.input({ parent: ctx.host, x: N(bx), y: N(iy), w: N(min(320, copy.w)), size: 'md', placeholder: String(o.inputs[ii]) });
        iy += 40;
      }
    }
    if (footerH) {
      ctx.plate(B(rect.x + 1, footer.y, rect.w - 2, 1), { name: 'boundary·footer', fill: C('border') });
      var btns = o.buttons || (o.confirm ? ['Cancel', 'Confirm'] : ['Cancel', 'Share']);
      var fx = footer.x + rect.w - pad, bw = [];
      btns.forEach(function (b) { bw.push(CF.estW(String(b), 14) + 32); });
      for (var k = btns.length - 1; k >= 0; k--) {
        fx -= bw[k];
        await CF.button({ parent: ctx.host, x: N(fx), y: N(footer.y + (footerH - 32) / 2), label: String(btns[k]), size: 'md',
          type: k === btns.length - 1 ? 'primary' : 'default',
          tone: (k === btns.length - 1 && o.tone === 'danger') ? 'danger' : undefined, w: N(bw[k]) });
        fx -= 12;
      }
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Drawer — side panel 360-720 · header 56 + close · body pad 24 · footer 64-72 · bottom variant · optional scrim. */
  CF.drawer = async function (o) {
    o = o || {};
    var side = o.side || 'right', bottom = side === 'bottom';
    var w = o.w || (bottom ? (o.viewportW || 375) : 420);
    var h = o.h || (bottom ? 260 : (o.viewportH || 720));
    var headerH = o.headerH || 56, footerH = o.footerH || (o.footer === false ? 0 : 64), pad = o.pad === undefined ? 24 : o.pad;
    var rect = o.rect || B(o.x || 0, o.y || 0, w, h);
    if (rect.h < headerH + footerH + 48) rect = B(rect.x, rect.y, rect.w, headerH + footerH + 48);
    var slot = LY && LY.slots.modal ? LY.slots.modal(rect, { headerH: headerH, footerH: footerH, pad: pad }) : null;
    var header = slot ? slot.header : B(rect.x, rect.y, rect.w, headerH);
    var body = slot ? slot.body : B(rect.x + pad, rect.y + headerH, rect.w - pad * 2, rect.h - headerH - footerH);
    var footer = slot ? slot.footer : B(rect.x, rect.y + rect.h - footerH, rect.w, footerH);
    var ctx = CF.build(CF.name('Drawer', { type: bottom ? 'Bottom' : (side === 'left' ? 'Start' : 'End'), state: o.state, slot: o.footer === false ? 'NoFooter' : null }), rect,
      { parent: o.parent, fill: C('surface'), radius: bottom ? CF.radius('md') : 0, shadow: o.flat ? 0 : 5 });
    if (o.scrim) ctx.plate(B(rect.x + (bottom ? 0 : (side === 'right' ? -rect.w : rect.w)), rect.y - (bottom ? rect.h : 0),
      bottom ? rect.w : rect.w, bottom ? rect.h * 2 : rect.h * 2), { name: 'scrim', fill: C('ink'), opacity: 0.45 });
    ctx.text(String(o.title === undefined ? 'File history' : o.title), B(header.x + pad, header.y, header.w - pad * 2 - 44, header.h),
      { size: 16, color: C('ink'), weight: 600, align: 'left', valign: 'middle', refit: false });
    if (o.closable !== false) ctx.glyph('close', B(rect.x + rect.w - pad - 18, header.y + (header.h - 18) / 2, 18, 18), { color: C('muted'), strokeW: 1.8 });
    var dl = CF.wrap(o.description === undefined ? 'Every save from the last 30 days. Restore a version to branch from it.' : o.description, body.w * 0.94, 13);
    dl.forEach(function (ln, i) {
      ctx.text(ln, B(body.x, body.y + i * 19, body.w, 17), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
    });
    if (o.list) {
      var ly = body.y + dl.length * 19 + 10, rowH = o.rowH || 64;
      for (var i = 0; i < o.list; i++) {
        if (ly + rowH > body.y + body.h - 8) break;
        await CF.listItem({ parent: ctx.host, x: N(body.x), y: N(ly), w: N(body.w), h: rowH, lines: 2, leading: 'icon', glyph: 'archive',
          title: 'Version ' + (i + 1), sub: 'Today, 1' + (i + 2) + ':00 · you', trailing: 'menu' });
        ly += rowH + 4;
      }
    }
    if (footerH) {
      ctx.plate(B(rect.x + 1, footer.y, rect.w - 2, 1), { name: 'boundary·footer', fill: C('border') });
      var btns = o.buttons || ['Close', 'Save'];
      var fx = footer.x + rect.w - pad;
      for (var k = btns.length - 1; k >= 0; k--) {
        var bw = CF.estW(String(btns[k]), 14) + 32;
        fx -= bw;
        await CF.button({ parent: ctx.host, x: N(fx), y: N(footer.y + (footer.h - 32) / 2), label: String(btns[k]), size: 'md',
          type: k === btns.length - 1 ? 'primary' : 'default', w: N(bw) });
        fx -= 12;
      }
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Spin — arc 270° stroke 3 · 24/32/48 · label below or right · container dims and centres the loader over the content. */
  CF.spin = async function (o) {
    o = o || {};
    var d = o.size !== undefined && !CF.ladder(o.size).h ? Number(o.size) || 32 : ({ xs: 16, sm: 20, md: 24, lg: 32, xl: 48, '2xl': 64 }[o.size] || 32);
    var th = max(2, Math.round(d * 0.10)), label = o.label ? String(o.label) : null;
    var below = label && o.placement === 'below';
    var labW = label ? CF.estW(label, 13) + 10 : 0;
    var box = B(o.x || 0, o.y || 0, below ? max(d, labW) : d + labW, below ? d + 6 + 18 : max(d, 20));
    var ctx = CF.build(CF.name('Spin', { size: box.w + 'px', slot: label ? (below ? 'LabelBottom' : 'LabelRight') : (o.container ? 'Container' : null) }), box, { parent: o.parent });
    var cx = below ? box.x + box.w / 2 : box.x + d / 2, cy = box.y + d / 2;
    if (o.container) {
      var cw = o.w || 320, ch = o.h || 200;
      ctx.host.resize(N(cw), N(ch));
      ctx.plate(B(box.x, box.y, cw, ch), { name: 'spin·veil', fill: C('surface'), opacity: 0.65, radius: CF.radius('md') });
      cx = box.x + cw / 2; cy = box.y + ch / 2;
      ctx.host.x = N(box.x); ctx.host.y = N(box.y);
      ctx.plate(B(cx - d / 2 - 8, cy - d / 2 - 8, d + 16, d + 16), { name: 'spin·plate', fill: C('surface'), radius: CF.radius('md'), shadow: 2 });
    }
    ctx.path(CF.arc(cx, cy, d / 2 - th / 2, 0, 360), { name: 'track', stroke: C('ink'), strokeW: th, opacity: 0.10 });
    ctx.path(CF.arc(cx, cy, d / 2 - th / 2, -90, 190), { name: 'arc', stroke: C('primary'), strokeW: th });
    if (label) ctx.text(label, below ? B(box.x, cy + d / 2 + 4, box.w, 18) : B(cx + d / 2 + 10, box.y, labW, box.h),
      { size: 13, color: C('muted'), align: 'left', valign: 'middle', refit: false });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Bottom / action sheet — grabber 32×4 · title 16 + close · option rows 48-56 (icon 20 · label · trailing) · destructive row · safe-area pad. */
  CF.sheet = async function (o) {
    o = o || {};
    var grabber = o.grabber !== false, w = o.w || 375, pad = o.pad === undefined ? 16 : o.pad;
    var rowH = o.rowH || 52, safe = o.safe === undefined ? 20 : o.safe;
    var opts = o.options || [{ label: 'Rename', glyph: 'edit' }, { label: 'Duplicate', glyph: 'copy' }, { label: 'Move to…', glyph: 'folder', trail: 'Chevron' }, { label: 'Delete', glyph: 'trash', danger: true }];
    var title = o.title === undefined ? null : String(o.title);
    var rowsH = opts.length * rowH + (opts.length - 1) * 0.5;
    var h = (grabber ? 12 : pad) + (title ? 40 : 0) + rowsH + (o.cancel ? rowH + 8 : 0) + pad + safe;
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Sheet', { type: title ? 'Title' : 'Options', slot: o.cancel ? 'Cancel' : null }), box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('md'), shadow: o.flat ? 0 : 5 });
    var y = box.y;
    if (grabber) { ctx.plate(B(box.x + w / 2 - 16, y + 8, 32, 4), { name: 'grabber', fill: C('borderStrong'), radius: 'xs' }); y += 12; }
    if (title) {
      ctx.text(title, B(box.x + pad, y, box.w - pad * 2, 40), { size: 16, color: C('ink'), weight: 600, align: 'left', valign: 'middle', refit: false });
      if (o.closable) ctx.glyph('close', B(box.x + box.w - pad - 20, y + 10, 20, 20), { color: C('muted'), strokeW: 1.8 });
      ctx.plate(B(box.x, y + 39, box.w, 1), { name: 'boundary·header', fill: C('border') });
      y += 40;
    }
    for (var i = 0; i < opts.length; i++) {
      var it = typeof opts[i] === 'string' ? { label: opts[i] } : opts[i];
      var on = i === o.active;
      if (on) ctx.plate(B(box.x + 8, y, box.w - 16, rowH), { name: 'row·' + i, fills: CF.fills(C('surfaceAlt'), null), radius: CF.radius('md') });
      if (i) ctx.plate(B(box.x + pad, y, box.w - pad * 2, 1), { name: 'divider·' + i, fill: C('border') });
      var x = box.x + pad, ink = it.danger ? C('error') : C('ink');
      if (it.glyph) { ctx.glyph(iconOf(it.glyph, 'edit'), B(x, y + (rowH - 20) / 2, 20, 20), { color: ink, strokeW: 1.8 }); x += 20 + 14; }
      ctx.text(String(it.label), B(x, y, box.w - (x - box.x) - pad - (it.trailing ? 20 : 0), rowH),
        { size: 14, color: ink, weight: it.danger ? 500 : 400, align: 'left', valign: 'middle', refit: false });
      if (it.trailing === 'Chevron') ctx.glyph('chevronRight', B(box.x + box.w - pad - 16, y + (rowH - 16) / 2, 16, 16), { color: C('muted'), anchor: 'right' });
      else if (it.checked) ctx.glyph('check', B(box.x + box.w - pad - 18, y + (rowH - 18) / 2, 18, 18), { color: C('primary'), strokeW: 2, anchor: 'right' });
      else if (it.hint) ctx.text(String(it.hint), B(box.x + box.w - pad - CF.estW(String(it.hint), 13), y, CF.estW(String(it.hint), 13), rowH),
        { size: 13, color: C('muted'), align: 'right', valign: 'middle', refit: false });
      y += rowH;
    }
    if (o.cancel) {
      y += 8;
      await CF.button({ parent: ctx.host, x: N(box.x + pad), y: N(y), w: N(box.w - pad * 2), label: String(o.cancel === true ? 'Cancel' : o.cancel), size: 'lg', type: 'default' });
      y += 44;
    }
    if (safe) ctx.plate(B(box.x, box.y + box.h - safe, box.w, safe), { name: 'safe·area', fill: C('surfaceAlt'), opacity: 0.5 });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  // ================================================================ F · Application shell (§3.6) — every region comes from LY.slots.*

  /** App bar — 56-64 (marketing 72) · logo lockup · ≤5 nav links with the current one marked · search · icon actions · avatar.
      Below 760 the links and the search field are dropped (that is what a real header does), never squeezed. */
  CF.appBar = async function (o) {
    o = o || {};
    var h = o.h || (o.tier === 'mobile' ? 56 : 64), w = o.w || 1440;
    var rect = o.rect || B(o.x || 0, o.y || 0, w, h);
    var narrow = rect.w < 760;
    var items = (o.links === undefined ? (narrow ? [] : ['Product', 'Solutions', 'Docs', 'Pricing']) : o.links).slice();
    var nActs = o.actions === undefined ? (narrow ? 2 : 3) : o.actions;
    var searchW = o.searchW === undefined ? (narrow ? 0 : undefined) : o.searchW;
    var slot = LY && LY.slots.appBar ? LY.slots.appBar(rect, { actions: nActs, searchW: searchW, logoW: narrow ? 104 : undefined }) : null;
    var ctx = CF.build(CF.name('AppBar', { type: o.dark ? 'Dark' : (o.tier || 'web'), state: o.state, slot: o.sticky ? 'Sticky' : null }), rect,
      { parent: o.parent, fill: o.dark ? C('ink') : C('surface'), radius: 'none' });
    if (o.shadow !== false && !o.dark) ctx.plate(B(rect.x, rect.y + rect.h - 1, rect.w, 1), { name: 'boundary·edge', fill: C('border') });
    if (!slot) return ctx.host;
    var ink = o.dark ? '#FFFFFF' : C('ink'), sub = o.dark ? '#FFFFFF' : C('muted');
    var lg = slot.logo;
    ctx.plate(B(lg.x, lg.y + (lg.h - 28) / 2, 28, 28), { name: 'logo·mark', fill: C('primary'), radius: 'sm' });
    ctx.glyph(o.mark === 'hex' ? 'layers' : 'command', B(lg.x + 5, lg.y + (lg.h - 18) / 2, 18, 18), { color: C('onPrimary'), strokeW: 2 });
    ctx.text(String(o.name === undefined ? CF.brandName : o.name), B(lg.x + 36, lg.y, max(40, lg.w - 36), lg.h),
      { size: 16, color: ink, weight: 700, align: 'left', valign: 'middle', refit: false });
    var ws = items.map(function (l) { return CF.estW(String(l), 14) + 4; });
    var gap = 24, room = slot.links.w;
    var totalOf = function () { return ws.reduce(function (a, b) { return a + b; }, 0) + (ws.length ? gap * (ws.length - 1) : 0); };
    if (totalOf() > room) { gap = 16; }
    while (items.length > 1 && totalOf() > room) { items.pop(); ws.pop(); }
    var active = o.active === undefined ? 0 : o.active, lx = slot.links.x;
    for (var i = 0; i < items.length; i++) {
      var lw = ws[i], on = i === active;
      if (on) ctx.plate(B(lx - 6, slot.links.y, lw + 8, slot.links.h), { name: 'link·' + i, fills: CF.fills(null, 'hover'), radius: CF.radius('sm') });
      ctx.text(String(items[i]), B(lx, slot.links.y, lw, slot.links.h),
        { size: 14, color: on ? ink : sub, weight: on ? 600 : 400, opacity: on ? 1 : (o.dark ? 0.78 : 0.86), align: 'left', valign: 'middle', refit: false });
      if (on) ctx.plate(B(lx + lw / 2 - 10, slot.links.y + slot.links.h - 4, 20, 2), { name: 'indicator·' + i, fill: C('primary'), radius: 'xs' });
      lx += lw + gap;
    }
    if (slot.search.w > 200) {
      await CF.searchField({ parent: ctx.host, x: N(slot.search.x), y: N(slot.search.y + (slot.search.h - 32) / 2),
        w: N(slot.search.w), size: 'md', placeholder: o.search || 'Search files' });
    }
    var glyphs = o.glyphs || ['bell', 'help', 'grid'];
    for (var a = 0; a < nActs; a++) {
      await CF.iconButton({ parent: ctx.host, x: N(slot.actions.x + a * 36), y: N(slot.actions.y + (slot.actions.h - 28) / 2),
        size: 'xs', glyph: String(glyphs[a] || 'dots'), tone: o.dark ? 'onDark' : 'ghost' });
    }
    await CF.avatar({ parent: ctx.host, x: N(slot.avatar.x), y: N(slot.avatar.y), size: 32, name: o.user || 'Ada Liu', tone: o.dark ? 'accent' : undefined });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Side navigation — 240-280 expanded · 64-88 rail · brand + CTA · group labels + items · footer user row. Regions from LY.slots.sideNav. */
  CF.sideNav = async function (o) {
    o = o || {};
    // `user` is a name, not a switch: callers wrote `user: h > 520` and the footer rendered the string "true"
    // as the account holder (measured on the dashboard screen). One caller's boolean is a name here.
    if (o.user === true) o.user = 'Alex Doe';
    var rect = o.rect || B(o.x || 0, o.y || 0, o.w || (o.rail ? 72 : 256), o.h || 720);
    var groups = o.groups || [{ label: 'Workspace', items: ['Overview', 'Projects', 'Assets'] }, { label: 'Team', items: ['Members', 'Settings'] }];
    var plan = [], slotGroups = [], railMode = !!o.rail;
    groups.forEach(function (g) {
      var items = g.items || [];
      if (g.label && !railMode) { plan.push({ group: g.label }); slotGroups.push({ label: g.label, count: items.length }); }
      else slotGroups.push({ label: null, count: items.length });
      items.forEach(function (l) { plan.push({ item: l }); });
    });
    var slot = LY && LY.slots.sideNav
      ? LY.slots.sideNav(rect, { groups: slotGroups, itemH: o.itemH, hasCta: !!o.cta, hasUser: !!o.user, brand: o.brand === false ? false : undefined })
      : null;
    var rail = !!(slot ? slot.rail : railMode);
    var ctx = CF.build(CF.name('SideNav', { type: rail ? 'Rail' : 'Expanded', state: o.state, slot: o.cta ? 'Cta' : (o.user ? 'User' : null) }), rect,
      { parent: o.parent, fill: o.dark ? C('ink') : C('surfaceAlt'), radius: 'none' });
    ctx.plate(B(rect.x + rect.w - 1, rect.y, 1, rect.h), { name: 'boundary·edge', fill: o.dark ? '#FFFFFF' : C('border'), opacity: o.dark ? 0.12 : 1 });
    if (!slot) return ctx.host;
    var ink = o.dark ? '#FFFFFF' : C('ink');
    if (slot.brand) {
      var bd = slot.brand;
      ctx.plate(B(bd.x, bd.y, bd.w, bd.h), { name: 'logo·mark', fill: C('primary'), radius: CF.radius('md') });
      ctx.glyph('command', B(bd.x + (bd.w - 18) / 2, bd.y + (bd.h - 18) / 2, 18, 18), { color: C('onPrimary'), strokeW: 2 });
      if (!rail) ctx.text(String(o.name === undefined ? CF.brandName : o.name), B(bd.x + bd.w + 10, bd.y, rect.x + rect.w - (bd.x + bd.w) - 16, bd.h),
        { size: 16, color: ink, weight: 700, align: 'left', valign: 'middle', refit: false });
    }
    if (slot.cta) {
      await CF.button({ parent: ctx.host, x: N(slot.cta.x), y: N(slot.cta.y), w: N(slot.cta.w), h: slot.cta.h,
        label: rail ? '' : String(o.cta === true ? 'New file' : o.cta), size: 'md', type: 'primary',
        glyph: 'plus', iconOnly: rail, lead: rail ? undefined : 'plus' });
    }
    var icons = o.icons || ['home', 'grid', 'image', 'user', 'settings'];
    var seen = 0, listBottom = slot.list.y + slot.list.h;
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i], r = slot.items[i] ? slot.items[i].rect : null;
      if (!r || r.y + r.h > listBottom + 0.5) break;      // the pane owns a scroll area: rows past it are not drawn
      if (p.group) await CF.navItem({ parent: ctx.host, x: N(r.x), y: N(r.y), w: N(r.w), h: r.h, group: 1, label: p.group, onDark: !!o.dark });
      else {
        await CF.navItem({ parent: ctx.host, x: N(r.x), y: N(r.y), w: N(r.w), h: r.h, rail: rail, label: p.item,
          icon: icons[seen % icons.length], selected: seen === (o.active === undefined ? 1 : o.active),
          badge: o.badges && o.badges[seen], state: o.disabledItem === seen ? 'disabled' : 'default', onDark: !!o.dark });
        seen++;
      }
    }
    if (slot.user) {
      var uy = slot.user.y, ux = slot.user.x;
      ctx.plate(B(rect.x + 1, uy - 10, rect.w - 2, 1), { name: 'hairline·footer', fill: o.dark ? '#FFFFFF' : C('border'), opacity: o.dark ? 0.12 : 1 });
      await CF.avatar({ parent: ctx.host, x: N(rail ? rect.x + (rect.w - 32) / 2 : ux), y: N(uy + 2), size: rail ? 32 : 36, name: String(o.user) });
      if (!rail) {
        ctx.text(String(o.user).split(' ')[0], B(ux + 44, uy - 2, rect.x + rect.w - ux - 52, 18),
          { size: 13, color: ink, weight: 500, align: 'left', valign: 'top', refit: false });
        ctx.text(String(o.plan || 'Pro workspace'), B(ux + 44, uy + 16, rect.x + rect.w - ux - 52, 16),
          { size: 12, color: o.dark ? '#FFFFFF' : C('muted'), opacity: o.dark ? 0.62 : 1, align: 'left', valign: 'top', refit: false });
      }
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Toolbar — 44-48 band · left cluster (primary action + grouped icon buttons + dividers) · right cluster (view switch, filter, zoom). */
  CF.toolbar = async function (o) {
    o = o || {};
    var rect = o.rect || B(o.x || 0, o.y || 0, o.w || 960, o.h || 48);
    var slot = LY && LY.slots.toolbar ? LY.slots.toolbar(rect, { rightW: o.rightW || 200 }) : null;
    var ctx = CF.build(CF.name('Toolbar', { state: o.state, slot: o.variant === 'floating' ? 'Floating' : null }), rect,
      { parent: o.parent, fill: C('surface'), radius: o.variant === 'bare' ? 0 : CF.radius('md'),
        stroke: o.variant === 'bare' ? null : C('border'), strokeW: 1 });
    if (o.variant === 'floating') ctx.host.shadows = CF.shadow(2);
    if (!slot) return ctx.host;
    var left = o.left === undefined ? ['undo', 'redo', '-', 'copy', 'trash'] : o.left;
    var right = o.right === undefined ? ['list', 'grid'] : o.right;
    var rs = o.rightSize || 'xs', rSq = CF.iconSquare(rs), lSq = CF.iconSquare('xs');
    var x = slot.left.x, cy = slot.left.y, limit = slot.left.x + slot.left.w;
    for (var i = 0; i < left.length; i++) {
      if (x > limit) break;                                   // a toolbar never crowds past its own half
      if (left[i] === '-') { ctx.plate(B(x, cy + 6, 1, slot.controlH - 12), { name: 'boundary·group', fill: C('border') }); x += 12; continue; }
      if (/^[A-Z]/.test(String(left[i])) || String(left[i]).length > 8) {
        var bw = CF.estW(String(left[i]), 14) + 24;
        await CF.button({ parent: ctx.host, x: N(x), y: N(cy), w: N(bw), h: slot.controlH, label: String(left[i]), size: 'sm', type: 'default' });
        x += bw + 8; continue;
      }
      await CF.iconButton({ parent: ctx.host, x: N(x), y: N(cy + (slot.controlH - lSq) / 2), size: 'xs', glyph: String(left[i]),
        tone: left[i] === 'trash' ? 'danger' : 'ghost', state: o.state === 'disabled' ? 'disabled' : 'default' });
      x += lSq + (i === 1 ? 12 : 4);
    }
    var rx = slot.right.x + slot.right.w;
    if (o.zoom !== false) {
      var zw = 44; rx -= zw;
      ctx.text(String(o.zoom || '100%'), B(rx, cy, zw, slot.controlH), { size: 12, color: C('muted'), align: 'right', valign: 'middle', refit: false });
      rx -= 10;
    }
    for (var k = right.length - 1; k >= 0; k--) {
      if (right[k] === '-') { rx -= 12; ctx.plate(B(rx, cy + 6, 1, slot.controlH - 12), { name: 'boundary·group', fill: C('border') }); rx -= 12; continue; }
      rx -= rSq;
      await CF.iconButton({ parent: ctx.host, x: N(rx), y: N(cy + (slot.controlH - rSq) / 2), size: rs, glyph: String(right[k]),
        tone: k === (o.view === undefined ? 0 : o.view) ? 'accent' : 'ghost' });
      rx -= 4;
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Page title band — title 24-28/600 · optional breadcrumb or subtitle 13-14 · actions right · tabs row below. */
  CF.pageTitle = async function (o) {
    o = o || {};
    var rect = o.rect || B(o.x || 0, o.y || 0, o.w || 1152, o.h || (o.tabs ? 112 : 88));
    var padX = o.padX === undefined ? 24 : o.padX;
    var slot = LY && LY.slots.pageTitle
      ? LY.slots.pageTitle(B(rect.x + padX, rect.y, rect.w - padX * 2, o.tabs ? rect.h - 44 : rect.h)) : null;
    var ctx = CF.build(CF.name('PageTitle', { size: rect.h + 'h', slot: o.tabs ? 'WithTabs' : (o.badge ? 'Badge' : null) }), rect, { parent: o.parent });
    if (!slot) return ctx.host;
    // `CF.titleFs` is the skin hook for the page-title step (same mechanism as CF.tier): 24 is the DEFAULT kit ramp,
    // but a target whose declared ramp has no 24 step fails design-guide §3.2 `off_ramp_size`, so the theme file
    // re-points the band at its own heading step instead of every call site passing fs.
    var t = slot.title, fs = o.fs || CF.titleFs || 24;
    var title = String(o.title === undefined ? 'Payments reconciliation' : o.title);
    ctx.text(title, B(t.x, t.y, min(t.w, rect.w - padX * 2), min(40, fs + 8)),
      { size: fs, color: C('ink'), weight: 600, align: 'left', valign: 'middle', refit: false });
    var by = t.y + fs + 12;
    if (o.badge) await CF.chip({ parent: ctx.host, x: N(t.x + min(t.w, CF.estW(title, fs)) + 12), y: N(t.y + (t.h - 24) / 2),
      label: String(o.badge), kind: 'tag', tone: o.badgeTone || 'success', size: 'sm' });
    if (o.subtitle) {
      var lines = CF.wrap(o.subtitle, min(720, rect.w - padX * 2), 14);
      lines.slice(0, o.tabs ? 1 : 2).forEach(function (ln, i) {
        ctx.text(ln, B(t.x, by + i * 20, min(720, rect.w - padX * 2), 18), { size: 14, color: C('muted'), align: 'left', valign: 'top', refit: false });
      });
    } else if (o.breadcrumb) {
      await CF.breadcrumb({ parent: ctx.host, x: N(slot.subtitle.x), y: N(slot.subtitle.y), items: o.breadcrumb, fs: 13 });
    }
    var acts = (o.actions || ['Export', 'New report']).map(String);
    var L = CF.ladder('md');
    var ws = acts.map(function (a, i) { return CF.estW(a, L.fs) + L.padX * 2 + (i === acts.length - 1 ? L.icon + L.gap : 0); });
    var aw = ws.reduce(function (a, b) { return a + b + 12; }, 0);
    var floor = t.x + min(t.w, CF.estW(title, fs)) + 16;                 // actions never walk over the title
    while (acts.length > 1 && rect.x + rect.w - padX - aw < floor) { aw -= ws[0] + 12; acts.shift(); ws.shift(); }
    var ax = rect.x + rect.w - padX;
    for (var i = acts.length - 1; i >= 0; i--) {
      var primary = i === acts.length - 1;
      ax -= ws[i];
      await CF.button({ parent: ctx.host, x: N(ax), y: N(slot.actions.y), w: N(ws[i]), label: acts[i], size: 'md',
        type: primary ? 'primary' : 'default', lead: primary ? 'plus' : undefined });
      ax -= 12;
    }
    if (o.tabs) await CF.tabBand({ parent: ctx.host, rect: B(rect.x + padX, rect.y + rect.h - 44, rect.w - padX * 2, 44), items: o.tabs, active: o.tabActive });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Web footer — brand block + 3-5 link columns · optional newsletter · hairline · legal row (copyright, links, language, social). */
  CF.footer = async function (o) {
    o = o || {};
    var cols = o.cols || ['Product', 'Company', 'Resources', 'Legal'];
    var rect = o.rect || B(o.x || 0, o.y || 0, o.w || 1440, o.h || 320);
    var dark = o.dark !== false, padX = o.padX === undefined ? 64 : o.padX, padT = o.padT === undefined ? 56 : o.padT;
    var slot = LY && LY.slots.footer ? LY.slots.footer(rect, { cols: cols.length + 1, padX: padX, padT: padT }) : null;
    var ctx = CF.build(CF.name('Footer', { type: dark ? 'Dark' : 'Light', size: cols.length + 'col', slot: o.newsletter ? 'Newsletter' : null }), rect,
      { parent: o.parent, fill: dark ? C('ink') : C('surfaceAlt'), radius: 'none' });
    if (!slot) return ctx.host;
    var ink = dark ? '#FFFFFF' : C('ink'), sub = dark ? '#FFFFFF' : C('muted');
    ctx.plate(B(rect.x, rect.y, rect.w, 1), { name: 'boundary·edge', fill: dark ? '#FFFFFF' : C('border'), opacity: dark ? 0.12 : 1 });
    // column 0 is the brand block, so the link columns never sit under the logo
    var brand = slot.columns[0], top = rect.y + padT, brandW = max(140, brand.w);
    ctx.plate(B(brand.x, top, 32, 32), { name: 'logo·mark', fill: C('primary'), radius: CF.radius('lg') });
    ctx.text(String(o.name === undefined ? CF.brandName : o.name), B(brand.x + 42, top + 4, brandW - 42, 24),
      { size: 16, color: ink, weight: 700, align: 'left', valign: 'top', refit: false });
    CF.wrap(String(o.tagline === undefined ? 'Design infrastructure for product teams.' : o.tagline), brandW, 13)
      .slice(0, 2).forEach(function (ln, i) {
        ctx.text(ln, B(brand.x, top + 44 + i * 18, brandW, 16),
          { size: 13, color: sub, opacity: 0.72, align: 'left', valign: 'top', refit: false });
      });
    var linkY = top + 4;
    cols.forEach(function (cname, ci) {
      var col = slot.columns[ci + 1] || slot.columns.span(1, min(ci + 1, slot.cols - 1));
      if (o.newsletter && ci === cols.length - 1) return;             // that column is the signup block
      ctx.text(String(cname), B(col.x, linkY, col.w, 20), { size: 13, color: ink, weight: 600, align: 'left', valign: 'top', refit: false });
      var links = (o.links && o.links[ci]) || ['Overview', 'Changelog', 'Status', 'Contact'];
      links.forEach(function (l, li) {
        ctx.text(String(l), B(col.x, linkY + 32 + li * 26, col.w, 18), { size: 13, color: sub, opacity: 0.66, align: 'left', valign: 'top', refit: false });
      });
    });
    if (o.newsletter) {
      var last = slot.columns[cols.length] || slot.columns.span(1, slot.cols - 1);
      ctx.text(String(o.newsletter === true ? 'Product updates, monthly' : o.newsletter), B(last.x, linkY, last.w, 20),
        { size: 13, color: ink, weight: 600, align: 'left', valign: 'top', refit: false });
      await CF.input({ parent: ctx.host, x: N(last.x), y: N(linkY + 32), w: N(last.w), size: 'md', placeholder: 'you@studio.com', lead: 'mail' });
      await CF.button({ parent: ctx.host, x: N(last.x), y: N(linkY + 32 + 40), w: N(last.w), label: 'Subscribe', size: 'md', type: 'primary' });
    }
    var legal = slot.legal;
    ctx.plate(B(legal.x, legal.y - 16, legal.w, 1), { name: 'hairline·legal', fill: dark ? '#FFFFFF' : C('border'), opacity: dark ? 0.14 : 1 });
    ctx.text(String(o.legal === undefined ? CF.brandLegal() : o.legal), B(legal.x, legal.y, max(120, legal.w - 120), legal.h),
      { size: 12, color: sub, opacity: 0.6, align: 'left', valign: 'middle', refit: false });
    ['globe', 'chat', 'mail'].forEach(function (g, i) {
      ctx.glyph(g, B(legal.x + legal.w - 24 - (2 - i) * 32, legal.y + (legal.h - 18) / 2, 18, 18), { color: sub, opacity: 0.72, anchor: 'right' });
    });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Mobile bar — bottom tab bar 48-56 + 34 safe area (3-5 items, icon 24 + label 10) or a top bar with back · title · actions. */
  CF.mobileBar = async function (o) {
    o = o || {};
    var pos = o.position || 'bottom', w = o.w || 375;
    var items = o.items || ['Home', 'Search', 'Create', 'Inbox', 'Profile'];
    var safe = o.safe === undefined ? (pos === 'bottom' ? 34 : 0) : o.safe;
    // A chrome height is a SUM of hardware constants (56 tab bar + 34 safe area = 90). Rounding the sum up to the 4-grid
    // keeps it on scale (HARD §1) and still lands flush at the bottom of an on-grid viewport (812 − 92 = 720).
    var h = o.h || C4(pos === 'bottom' ? (o.labels === false ? 49 : 56) + safe : 56);
    var rect = o.rect || B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('MobileBar', { type: pos === 'bottom' ? 'Tab' : 'Top', size: items.length + 'up', slot: o.centerAction ? 'CenterAction' : null }), rect,
      { parent: o.parent, fill: C('surface'), radius: 'none' });
    ctx.plate(B(rect.x, pos === 'bottom' ? rect.y : rect.y + rect.h - 1, rect.w, 1), { name: 'boundary·edge', fill: C('border') });
    if (pos === 'top') {
      ctx.glyph('chevronLeft', B(rect.x + 16, rect.y + (rect.h - safe - 22) / 2, 22, 22), { color: C('ink'), strokeW: 2 });
      ctx.text(String(o.title === undefined ? 'Project' : o.title), B(rect.x, rect.y, rect.w, rect.h - safe), { size: 16, color: C('ink'), weight: 600, valign: 'middle', refit: false });
      var ax = rect.x + rect.w - 16;
      (o.actions || ['search', 'dotsV']).forEach(function (g, i) {
        ax -= 24; ctx.glyph(iconOf(g, 'dots'), B(ax, rect.y + (rect.h - safe - 24) / 2, 24, 24), { color: C('ink'), strokeW: 1.8, anchor: 'right' }); ax -= 12;
      });
      await ctx.settle(); ctx.place();
      return ctx.host;
    }
    var barH = rect.h - safe, n = Math.min(items.length, 5), cellW = rect.w / n;
    var gy = rect.y + barH / 2 - (o.labels === false ? 12 : 16);
    for (var i = 0; i < n; i++) {
      var it = typeof items[i] === 'string' ? { label: items[i] } : items[i];
      var cx = rect.x + cellW * (i + 0.5), on = i === (o.active === undefined ? 0 : o.active);
      if (o.centerAction && i === Math.floor(n / 2)) {
        ctx.ellipse(B(cx - 24, rect.y + barH / 2 - 24, 48, 48), { name: 'fab·center', fill: C('primary'), shadow: 2 });
        ctx.glyph('plus', B(cx - 10, rect.y + barH / 2 - 10, 20, 20), { color: C('onPrimary'), strokeW: 1.8 });
      } else {
        if (on) ctx.plate(B(cx - cellW / 2 + 8, rect.y + 6, cellW - 16, barH - 18), { name: 'tab·' + i, fills: CF.fills(C('primarySoft'), null), radius: CF.radius('md') });
        ctx.glyph(iconOf(it.glyph, ['home', 'search', 'plus', 'mail', 'user'][i % 5]), B(cx - 12, gy, 24, 24), { color: on ? C('primary') : C('muted'), strokeW: 2 });
        if (o.labels !== false) ctx.text(String(it.label), B(cx - cellW / 2, gy + 26, cellW, 14),
          { size: 12, color: on ? C('primary') : C('muted'), weight: on ? 600 : 400, valign: 'top', refit: false });
      }
      ctx.hitPad(B(cx - cellW / 2, rect.y, cellW, barH), 44);
    }
    if (safe) ctx.plate(B(rect.x + rect.w / 2 - 68, rect.y + rect.h - 12, 136, 5), { name: 'home·indicator', fill: C('ink'), radius: 'xs' });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  // ================================================================ Spec-board composer + registration

  var matrixWarn = function (m) { warn('CF.matrix: ' + m); };

  /**
   * Matrix — a component sheet: one row per variant, one column per state (or per slot).
   * Cells are produced by the factories themselves, so a matrix can never drift from the §3 contract.
   * o: { x, y, w, title, axes: ['default','hover',…], rows: [{ label, factory, props, cells }], colW, cellH, notes, parent }
   */
  CF.matrix = async function (o) {
    o = o || {};
    var rows = o.rows || [];
    var axes = o.axes || ['default'];
    var padX = o.padX === undefined ? 24 : o.padX, padY = o.padY === undefined ? 24 : o.padY;
    var labelW = o.labelW === undefined ? 168 : o.labelW, gapX = o.gapX === undefined ? 16 : o.gapX, gapY = o.gapY === undefined ? 16 : o.gapY;
    var pitch = o.colW || 136, cellH = o.cellH || 40, w = o.w || 1000;
    // A row may raise its own cell height (`row.cellH`) — an open panel and a 32px field share one sheet without
    // forcing every row to the tallest cell.
    var rowH = function (r) { return N((r && r.cellH) || cellH); };
    var bodyH = rows.reduce(function (a, r) { return a + rowH(r) + gapY; }, 0);
    var headH = o.title === false ? 0 : 40, stateRowH = axes.length > 1 ? 28 : 0;
    var h = padY * 2 + headH + stateRowH + bodyH + (o.notes ? 44 : 0);
    var box = B(o.x || 0, o.y || 0, w, h);
    var specName = o.specName || CF.name(o.family || 'Component', { slot: 'Spec' });
    var ctx = CF.build(specName, box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('spec'), stroke: C('border'), strokeW: 1 });
    var titleText = String(o.title === undefined ? (o.family || 'Component') + ' · variants' : o.title);
    if (headH) {
      ctx.text(titleText, B(box.x + padX, box.y + padY, box.w - padX * 2, 28),
        { size: 20, color: C('ink'), weight: 600, align: 'left', valign: 'middle', refit: false });
    }
    var top = box.y + padY + headH;
    var axisX = box.x + padX + labelW + gapX, axisRight = 0;
    var y = top + stateRowH + 4, maxRight = box.x + padX + labelW;
    // `maxW` is the band the shelf can grant. A matrix is fitted to its content, so without a hard right edge one wide
    // row (five-node Steps under five state columns = 5 829px) grows past the page root and every audit calls it
    // out_of_bounds. Cells that no longer fit fold into a second line of the SAME row: the sheet stays band-sized.
    var budgetR = o.maxW ? box.x + o.maxW - padX : Infinity, lineGap = 8, folded = false;
    // Actual column starts, recorded from the FIRST row as its cells are placed. The state-axis header must sit on
    // these x values, not on the declared `pitch`: a host wider than the pitch advances the row by `host.width+gapX`
    // (MiniCalendar: 252+16=268) while the old header stayed on pitch 136, so default/hover/focus/disabled bunched at
    // the left and never lined up with the four calendars under them (measured 2026-10-22 on `MiniCalendar·Spec`).
    var colX = null;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r], rh = rowH(row), lineTop = y, startX = axisX, cx = startX;
      // A row reserves the height of the TALLEST cell it actually produced, not the declared `cellH`. Cells are centred
      // on the row midline, so advancing the cursor by `rh` alone made a 200px Card on a 40px row bleed 80px into the
      // row below and the two overlapped — the reported "大号按钮 / 竖直排列的按钮叠在一起". The horizontal axis already
      // measured its cells (`max(pitch, host.width + gapX)`); height was the one axis still trusted to an estimate.
      var lines = [], line = { top: lineTop, h: rh, hosts: [] };
      lines.push(line);
      var closeLine = function (ln) {
        ln.hosts.forEach(function (hh) { CF.move(hh.host, hh.x, N(ln.top + ln.h / 2 - hh.host.height / 2)); });
      };
      var cells = row.cells && row.cells.length ? row.cells : [{}];
      for (var c = 0; c < cells.length; c++) {
        var opts = Object.assign({}, row.props || {}, cells[c] || {});
        if (!opts.size) opts.size = 'md';
        opts.parent = ctx.host; opts.x = N(cx); opts.y = N(line.top + line.h / 2);
        var fn = CF[row.factory];
        if (!fn) { matrixWarn(row.factory); cx += pitch; continue; }
        var host;
        var kidCount = ctx.host.children ? Array.from(ctx.host.children).length : 0;
        try { host = await fn(opts); } catch (e) {
          matrixWarn(row.factory + ' threw ' + e.message);
          // A factory creates its host before it draws content, so a throw half-way leaves an orphan: it is owned by no
          // row, never centred on the row midline, and lands on top of the next row (audit_layout stroke_covered).
          var kids = Array.from(ctx.host.children || []);
          for (var k = kidCount; k < kids.length; k++) { try { kids[k].remove(); } catch (e2) {} }
          continue;
        }
        if (!host) { matrixWarn(row.factory + ' returned null'); continue; }
        if (cx + host.width > budgetR && cx > startX + 1) {
          folded = true; closeLine(line);
          lineTop = line.top + line.h + lineGap; line = { top: lineTop, h: rh, hosts: [] }; lines.push(line); cx = startX;
        }
        if (r === 0 && !folded) { if (!colX) colX = []; colX[c] = N(cx); }
        line.hosts.push({ host: host, x: N(cx) });
        line.h = max(line.h, N(host.height));
        maxRight = max(maxRight, cx + host.width);
        cx += axes.length > 1 ? max(pitch, host.width + gapX) : (host.width + gapX);
      }
      closeLine(line);
      y = line.top + line.h + gapY;
      // The label is drawn after the cells because it has to span the row's *reserved* block: a folded or tall row is
      // three lines deep, and a label centred on the declared 40px row sits at the top of a 200px band.
      var blockH = N(y - gapY - lines[0].top);
      ctx.text(String(row.label === undefined ? row.factory : row.label), B(box.x + padX, lines[0].top, labelW, blockH),
        { size: 13, color: C('ink'), weight: 500, align: 'left', valign: 'middle', refit: false });
      if (row.note) ctx.text(String(row.note), B(box.x + padX, lines[0].top + blockH, labelW, 14),
        { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
    }
    // The axis line is drawn LAST because only now is it known whether the columns stayed on one line: a folded sheet
    // has no fixed column set, so it gets the reading order as a caption instead of five headers over nothing.
    if (stateRowH) {
      if (!folded) {
        axes.forEach(function (a, i) {
          var ax = (colX && colX[i] !== undefined) ? colX[i] : axisX + i * pitch;
          var next = (colX && colX[i + 1] !== undefined) ? colX[i + 1] : ax + pitch;
          ctx.text(String(a), B(ax, top, max(40, next - ax - 8), stateRowH - 6), { size: 11, role: 'axis', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false });
          axisRight = max(axisRight, ax + CF.estW(String(a), 11));
        });
      } else {
        ctx.text('columns fold: ' + axes.join('  ·  ') + ' — each row reads left to right, top line first',
          B(axisX, top, max(160, min(720, budgetR - axisX)), stateRowH - 6),
          { size: 11, role: 'axis', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false });
      }
    }
    // The header line holds title (20px) + right-aligned subtitle (13px): the fitted width must carry BOTH, or the
    // title renders past the shrunk board and lands on the subtitle (audit_layout text_overlap).
    var titleW = CF.estW(titleText, 20);
    var subW = (headH && o.subtitle) ? CF.estW(String(o.subtitle), 13) + 24 : 0;
    var need = max(maxRight + padX, axisRight + 8, box.x + padX + titleW + 8 + subW) - box.x;
    var fitW = N(o.shrink === false ? box.w : max(need, 160));   // a spec board is exactly as wide as its content, even past o.w
    if (o.maxW) fitW = min(fitW, N(o.maxW));
    var fitH = N(box.h + (y - (top + stateRowH + 4)) - bodyH);    // the fold grew the body; the board has to grow with it
    if (fitW !== box.w || fitH !== box.h) { try { ctx.host.resize(fitW, fitH); } catch (e) {} }
    var innerW = max(1, N(fitW - padX * 2));
    if (headH && o.subtitle) ctx.text(String(o.subtitle), B(box.x + fitW - padX - 320, box.y + padY + 6, min(320, innerW), 20),
      { size: 13, color: C('muted'), align: 'right', valign: 'middle', refit: false });
    if (o.notes) {
      var nl = CF.wrap(String(o.notes), innerW * 0.94, 12);
      nl.slice(0, 3).forEach(function (ln, i) {
        ctx.text(ln, B(box.x + padX, y + 8 + i * 16, innerW, 14), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
      });
    }
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Pre-flight for a heavy matrix: the MCP tool call has a ~30 s wall-clock ceiling, and one CF.matrix call draws
      every cell of every row. Split the ROWS into parts that each stay under the ceiling, then build ONE part per
      execute_code. Every part keeps all state axes, so `state_coverage`/`variant_sparse` aggregate across the family's
      boards (their names all match `·Spec`). Returns parts in visual order; place part N+1 at part N bottom + 32.
      This is a scheduling helper, not a second designer: the cells are still CF factories and the rows are the same
      spec rows. */
  CF.matrixPlan = function (o) {
    o = o || {};
    var rows = o.rows || [], axes = o.axes || ['default'];
    var cells = rows.length * axes.length;
    var maxCells = o.maxCells || 8;
    var rowsPer = Math.max(1, Math.floor(maxCells / Math.max(1, axes.length)));
    var base = o.specName || CF.name(o.family || 'Component', { slot: 'Spec' });
    var parts = [];
    for (var i = 0; i < rows.length; i += rowsPer) {
      var n = parts.length + 1;
      parts.push({
        part: n,
        rows: rows.slice(i, i + rowsPer),
        axes: axes,
        specName: n === 1 ? base : base + '·' + n,
        title: (o.title === undefined ? (o.family || 'Component') + ' · variants' : o.title) + (n > 1 ? ' · part ' + n : '')
      });
    }
    return { cells: cells, axes: axes.length, rows: rows.length, maxCells: maxCells, rowsPer: rowsPer, parts: parts,
             estMs: cells * 1000,
             note: 'estMs is a conservative 1 s/cell; if parts.length > 1 build ONE part per execute_code, stacking each board at previous bottom + 32' };
  };

  // ---------------------------------------------------------------- components: register / place / switch (C2/C3)
  /** The library record for a CF name — scanned, not cached, because the library outlives `storage`; a name lookup
      still works after a crash rebuild (post-crash checklist §5). Returns null when nothing matches. */
  CF.get = function (name) {
    if (!name) return null;
    try {
      var list = penpot.library.local.components || [];
      for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    } catch (e) {}
    return null;
  };

  /** Register a host board as a Penpot component. createComponent does NOT copy: the host *becomes* the main instance
      (it stays visible, but comp.remove() would delete it along with every instance — register from a masters board, or
      accept the board as master). Returns the record so callers can chain into CF.instance / CF.variantSet. */
  CF.component = function (host, name) {
    if (!host) return { err: 'no host' };
    try {
      var comp = penpot.library.local.createComponent([host]);
      if (name && comp && comp.name !== undefined) { try { comp.name = name; } catch (e) {} }
      return { ok: true, name: (comp && comp.name) || name || host.name, comp: comp || null, id: comp && comp.id };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  };
  /** "register" reads better at the call site; same operation. */
  CF.register = function (host, name) { return CF.component(host, name || (host && host.name)); };

  /** How many records the local library holds — the number gate G10 reports. */
  CF.libraryCount = function () {
    try { return (penpot.library.local.components || []).length; } catch (e) { return -1; }
  };

  /**
   * CF.autoRegister(o) → promote every CF control host in a scope to a Penpot **main component**, so a screen places an
   * instance of a real control instead of re-running a factory or, worse, grouping shapes (a group has no variants, no
   * swap, no single place to fix a defect). Idempotent: a name already in the library is counted, not re-created.
   *   o = { roots: [board…]  — default: the current page's top-level boards,
   *         states: false     — only the Default state of a family·type·size becomes a master unless true,
   *         dry: false, limit: 40, page: 'NN · Name' }
   * `limit` + `truncated` exist because execute_code stops at ~30s and createComponent is one platform call per host:
   * run it again until it reports `truncated:false`.
   * Returns { scanned, registered[], already[], skipped[], truncated, library }.
   */
  CF.autoRegister = function (o) {
    o = o || {};
    var map = CF.map(), known = {};
    Object.keys(map).forEach(function (g) { if (g !== 'composer') map[g].forEach(function (k) { known[k] = 1; }); });
    var STATE = /·(Hover|Focus|Pressed|Selected|Disabled|Loading|Error)/;
    var roots = o.roots;
    if (!roots) {
      try { var pg = o.page ? storage.pg(o.page) : null; var r = (pg && pg.root) || penpot.currentPage.root; roots = Array.from((r && r.children) || []); }
      catch (e) { return { err: 'autoRegister: no roots — ' + String(e).slice(0, 80) }; }
    }
    var limit = o.limit || 40;
    var out = { scanned: 0, registered: [], already: [], skipped: [], dry: !!o.dry, truncated: false };
    var seen = {};
    var famKey = function (nm) { var s = String(nm || '').split('·')[0] || ''; return s.charAt(0).toLowerCase() + s.slice(1); };
    function visit(n, depth) {
      if (!n || depth > 28 || out.truncated) return;
      var nm = ''; try { nm = String(n.name || ''); } catch (e) {}
      var t = ''; try { t = n.type; } catch (e) {}
      if (t === 'board' && /^([A-Za-z]+)·/.test(nm) && known[famKey(nm)] === 1 && !/·Spec(·|$)/.test(nm)) {
        out.scanned++;
        if (seen[nm]) return;
        seen[nm] = 1;
        if (CF.get(nm)) { out.already.push(nm); return; }
        if (STATE.test(nm) && !o.states) { out.skipped.push(nm); return; }
        if (out.registered.length >= limit) { out.truncated = true; return; }
        if (o.dry) { out.registered.push(nm); return; }
        var res = CF.component(n, nm);
        if (res && res.ok) out.registered.push(nm); else out.skipped.push(nm + ' → ' + (res && res.err || 'failed'));
        return;                                   // a host's internals belong to the master, never to the library
      }
      var kids = [];
      try { kids = Array.from(n.children || []); } catch (e) {}
      for (var i = 0; i < kids.length; i++) visit(kids[i], depth + 1);
    }
    Array.from(roots || []).forEach(function (b) { visit(b, 0); });
    out.library = CF.libraryCount();
    return out;
  };

  /**
   * CF.instance(name, o) → place a **real instance** of a registered control (C2), instead of re-running a factory.
   *   o = { parent, h, v, sizing:'fix'|'auto'|'fill', z, absolute:{x,y}, text, resize:[w,h] }
   * `name` is the exact registered name — `CF.instance(CF.name('Button', {type:'primary', size:'md'}))`.
   *
   * Two measured rules govern the sizing, and both are applied here rather than left to the caller:
   *   1. sizing is declared **after** `appendChild` and after any `resize()` (R5: resize downgrades a flow child to `fix`);
   *   2. a board in flow must be told `'fix'` to keep its master's box — `auto` on a *board* means **hug**, and a host
   *      whose label is in flow collapses to label size (measured: a 160×52 button → **30×17**). Absolute-interior hosts
   *      happen to survive `auto` because hug has no flow children to measure, but that is luck, not a contract.
   * Returns `{ok, inst, …}`; geometry is transitional until the layout engine settles (`NL.whenSettled` first).
   */
  CF.instance = function (name, o) {
    o = o || {};
    var rec = CF.get(name);
    if (!rec) return { err: 'no component named "' + name + '" in the local library — CF.component(host) registers one' };
    var inst = null;
    try { inst = rec.instance(); }
    catch (e) { return { err: 'instance() failed for "' + rec.name + '": ' + String(e && e.message || e) + ' — a record whose head shape was removed reports mainInstance() null; never detach a main instance' }; }
    if (!inst) return { err: 'instance() returned nothing for "' + rec.name + '"' };
    if (o.resize) { try { inst.resize(o.resize[0], o.resize[1]); } catch (e) {} }
    if (o.text !== undefined) {
      try {
        var kids = Array.from(inst.children || []);
        for (var i = 0; i < kids.length; i++) if (kids[i].type === 'text') { kids[i].characters = String(o.text); break; }
      } catch (e) {}
    }
    var sizing = null;
    if (o.parent) {
      o.parent.appendChild(inst);
      if (inst.layoutChild) {
        if (o.absolute) { inst.layoutChild.absolute = true; inst.x = o.absolute.x; inst.y = o.absolute.y; }
        var hs = o.h || o.sizing || 'fix', vs = o.v || o.sizing || 'fix';
        try { inst.layoutChild.horizontalSizing = hs; inst.layoutChild.verticalSizing = vs; sizing = hs + '/' + vs; } catch (e) {}
        if (o.z !== undefined) { try { inst.layoutChild.zIndex = o.z; } catch (e) {} }
      }
    }
    return { ok: true, inst: inst, name: rec.name, componentId: rec.id, sizing: sizing };
  };

  /**
   * CF.swap(inst, name) → switch an instance to another registered control (C3), via `swapComponent`.
   * Measured: the layer name follows the target component, the paint follows the target, the instance stays an
   * instance, and **per-instance text overrides survive the swap** (a matched text layer keeps 'Ship it').
   * (`switchVariant` is only for records built by CF.variantSet, below — and its `pos` must be a number.)
   */
  CF.swap = function (inst, name) {
    if (!inst) return { err: 'no instance' };
    var rec = CF.get(name);
    if (!rec) return { err: 'no component named "' + name + '" in the local library' };
    try {
      var main = rec.mainInstance ? rec.mainInstance() : null;
      if (!main) return { err: 'record "' + name + '" has no main instance — its head shape is gone (detach a main instance? see api-pitfalls §6)' };
      var target = main.component();
      inst.swapComponent(target);
      return { ok: true, name: inst.name, componentId: rec.id,
               fill: (inst.fills && inst.fills[0] && inst.fills[0].fillColor) || null };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  };

  /**
   * CF.variantSet(hosts, family, props) → group already-registered hosts into a native **variant set** (C3).
   *   hosts = [mainInstance boards…]  (register with CF.component first — or pass records, either is accepted)
   *   props = [{ Type:'Primary', Size:'Md' }, …] one entry per host — **required**:
   *     `createVariantContainer` throws `TypeError: Cannot convert undefined or null to object` without it, and the
   *     property table lives only in that argument.
   * Measured: the platform then **renames every head to the container's name** and renaming a head afterwards wipes the
   * property table (`{Type:…,Size:…}` → `{}`, `properties: []`) and the rename itself is reverted to 'Component'.
   * So: family goes on the *container* and the *record* (both renameable), and **never touch the heads** — that is the
   * one place where `CF.name`'s `Family·Type·Size` layer naming does not apply.
   */
  CF.variantSet = function (hosts, family, props) {
    if (!hosts || hosts.length < 2) return { err: 'a variant set needs at least two hosts' };
    if (!props || props.length !== hosts.length) return { err: 'props must have one properties object per host (it is the only place the property table comes from)' };
    if (!penpotUtils.createVariantContainer) return { ok: false, err: 'penpotUtils.createVariantContainer unavailable' };
    var entries = [], names = [];
    for (var i = 0; i < hosts.length; i++) {
      var h = hosts[i], rec = h && h.comp ? h.comp : null;
      if (!rec && h && typeof h.mainInstance === 'function') rec = h;                       // a record was passed
      if (!rec && h && typeof h.component === 'function') { try { rec = h.component(); } catch (e) {} }   // a main instance was passed
      if (!rec) { try { rec = CF.component(h, h && h.name).comp; } catch (e) {} }
      if (!rec || !rec.mainInstance) return { err: 'host ' + i + ' is not registered (createComponent failed or returned nothing)' };
      entries.push({ shape: rec.mainInstance(), properties: props[i] });
      names.push(rec.name);
    }
    try {
      var vc = penpotUtils.createVariantContainer(entries);
      if (family) { try { vc.name = family; } catch (e) {} }
      var rec2 = null, list = penpot.library.local.components || [];
      for (var j = 0; j < list.length; j++) if (list[j].variants && list[j].variants.id === vc.id) { rec2 = list[j]; break; }
      if (family && rec2) { try { rec2.name = family; } catch (e) {} }
      var headNames = [];
      try { headNames = Array.from(vc.children || []).map(function (k) { return k.name; }); } catch (e) {}
      return { ok: true, container: vc, record: rec2, containerName: vc.name,
               recordName: rec2 ? rec2.name : null, heads: headNames, properties: rec2 ? rec2.variantProps : null,
               note: 'heads carry the platform name — never rename a head (it wipes the property table); switch instances with inst.switchVariant(posIndex, value), pos must be a number' };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  };
  /** `CF.variants` is the name the map and the docs use; the `props` argument is required in both spellings. */
  CF.variants = function (hosts, family, props) { return CF.variantSet(hosts, family, props); };

  /**
   * CF.svgIcon(svg, o) → import an SVG as **editable vectors** (C11) instead of the hand-authored `CF.glyph` set.
   *   o = { parent, x, y, w, h, color, name, sizing:'fix'|'fill' }
   *
   * Measured rules this helper encodes:
   *   1. `createShapeFromSvg` always drops the group **at world (0,0), inside whichever board covers the origin**
   *      (verified: two different boards at the origin each received it at x/y −12,−12; with no board there it goes
   *      to the page root). Selection and `viewport.center` are ignored.
   *   2. If that board happens to be a **component copy**, the import cannot be reparented out
   *      (`Value not valid: Cannot change the structure of a component copy`) — so this helper always imports through
   *      its own throwaway board sitting at the origin, then moves the group from *there* (a plain board: allowed).
   *   3. The platform adds a `base-background` rectangle; it is removed here, otherwise it paints a plate behind the icon.
   *   4. `remove()` *inside* a component copy works (measured) — only re-parenting is blocked.
   *   5. **`x/y` (both given, world coordinates) = absolute placement** — the same contract as `absMount`/`NL.mount`,
   *      which is what a grid of icons needs inside a flex board; omit them and the icon joins the flow at `sizing`.
   */
  CF.svgIcon = function (svg, o) {
    o = o || {};
    if (!penpot.createShapeFromSvg) return { err: 'penpot.createShapeFromSvg unavailable' };
    var tmp = null, g = null;
    try {
      tmp = penpot.createBoard(); tmp.name = 'svgIcon·tmp'; tmp.x = -1; tmp.y = -1; tmp.resize(2, 2);
      g = penpot.createShapeFromSvg(String(svg));
      if (!g) return { err: 'createShapeFromSvg returned nothing (content:write permission needed)' };
      if (g.parent !== tmp) {
        // the origin was covered by something else first — move it out of wherever it landed (never a copy: we own tmp)
        try { if (g.parent && typeof g.parent.isComponentInstance === 'function' && g.parent.isComponentInstance()) { g.remove(); g = penpot.createShapeFromSvg(String(svg)); } } catch (e) {}
      }
    } catch (e) { return { err: String(e && e.message || e) }; }
    var cleaned = [];
    Array.from(g.children || []).forEach(function (c) {
      if (/base-background/.test(c.name || '')) { try { c.remove(); cleaned.push('base-background'); } catch (e) {} }
    });
    var color = o.color;
    if (color) {
      var paint = function (sh) {
        // keep the incoming stroke object: a fresh literal drops strokeAlignment, and null exports as center (§3)
        try { if (sh.strokes && sh.strokes.length) sh.strokes = [Object.assign({}, sh.strokes[0], { strokeColor: color, strokeOpacity: 1, strokeAlignment: sh.strokes[0].strokeAlignment || 'center', strokeWidth: (sh.strokes[0] && sh.strokes[0].strokeWidth) || 2 })]; } catch (e) {}
        try { if (sh.fills && sh.fills.length && sh.fills[0].fillColor) sh.fills = [{ fillColor: color, fillOpacity: sh.fills[0].fillOpacity === undefined ? 1 : sh.fills[0].fillOpacity }]; } catch (e) {}
        Array.from(sh.children || []).forEach(paint);
      };
      paint(g);
    }
    if (o.name) { try { g.name = o.name; } catch (e) {} }
    if (o.w && g.resize) { try { g.resize(o.w, o.h || o.w); } catch (e) {} }   // resize first, sizing declared last (R5)
    if (o.parent) {
      o.parent.appendChild(g);
      if (g.layoutChild) {
        // x/y together mean "world position" — the absMount contract — so they opt the icon out of flow; with no
        // x/y the icon joins the flow at `sizing` (a group in flow behaves like any board child, R5/R6 apply).
        if (o.x !== undefined && o.y !== undefined) { try { g.layoutChild.absolute = true; g.x = o.x; g.y = o.y; if (storage.NL && storage.NL._note) storage.NL._note(g, { declaredAbsolute: true }); } catch (e) {} }
        else { try { g.layoutChild.horizontalSizing = o.sizing || 'fix'; g.layoutChild.verticalSizing = o.sizing || 'fix'; } catch (e) {} }
        if (o.z !== undefined) { try { g.layoutChild.zIndex = o.z; } catch (e) {} }
      } else if (o.x !== undefined) { try { g.x = o.x; g.y = o.y; } catch (e) {} }
    } else {
      // no parent: the group was born *inside the throwaway board* (I1) — move it to the page root first, because
      // removing the throwaway deletes its children
      try { penpot.currentPage.root.appendChild(g); } catch (e) {}
      if (o.x !== undefined) { try { g.x = o.x; g.y = o.y; } catch (e) {} }
    }
    try { if (tmp) tmp.remove(); } catch (e) {}
    return { ok: true, group: g, name: g.name, removed: cleaned, type: g.type,
             kids: Array.from(g.children || []).map(function (c) { return c.name; }) };
  };

  /** §3 registry — every row's CF key, so the docs and this file can be diffed mechanically (gate G12). */
  CF.map = function () {
    return {
      actions: ['button', 'iconButton', 'buttonGroup', 'splitButton', 'fab', 'link', 'segmented'],
      forms: ['field', 'fieldBox', 'input', 'textarea', 'searchField', 'passwordField', 'maskedInput', 'otpInput', 'numberField',
              'select', 'combobox', 'multiSelect', 'datePicker', 'timePicker', 'switch', 'checkbox', 'radio', 'slider', 'rating',
              'colorPicker', 'upload', 'transfer', 'tree'],
      data: ['badge', 'statusText', 'chip', 'avatar', 'avatarGroup', 'card', 'kpi', 'progress', 'skeleton',
             'tableHeader', 'tableRow', 'tableState', 'listItem', 'descriptions', 'timeline', 'accordion', 'emptyState', 'carousel', 'miniCalendar'],
      navigation: ['navItem', 'tabs', 'tabBand', 'breadcrumb', 'pagination', 'steps', 'menu', 'commandPalette', 'anchor'],
      feedback: ['alert', 'notification', 'toast', 'tooltip', 'popover', 'popconfirm', 'modal', 'drawer', 'spin', 'sheet'],
      shell: ['appBar', 'sideNav', 'toolbar', 'pageTitle', 'footer', 'mobileBar'],
      composer: ['build', 'matrix', 'component', 'variants', 'instance', 'swap', 'get', 'register', 'variantSet', 'svgIcon', 'move']
    };
  };
  CF.missing = function () {
    var m = CF.map(), out = [];
    Object.keys(m).forEach(function (fam) {
      m[fam].forEach(function (k) { if (typeof CF[k] !== 'function') out.push(fam + '.' + k); });
    });
    return out;
  };

  /*__CF_MORE__*/

  storage.CF = CF;
  CF._keys = Object.keys(CF).filter(function (k) { return typeof CF[k] === 'function' && /^[a-z]/.test(k); });
  return { seeded: 'CF', factories: CF._keys.length, glyphs: CF.glyphKinds.length,
           sizes: CF.sizes, slots: LY ? Object.keys(LY.slots) : ['LY not seeded'] };
})();
