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
    surfaceAlt: T.neutral || '#F8FAFC', surfaceRaised: T.surfaceRaised || '#FFFFFF', muted: T.secondary || '#475569',
    border: T.border || '#E2E8F0', borderStrong: T.borderStrong || '#CBD5E1',
    // a raised dark panel (an inverse card, a dark toast): DESIGN.md declares it; with no declaration it IS the ink.
    darkRaised: T.darkRaised || T.onSurface || '#2A2A2A',
    // A checkbox's mark, a selected row's glyph and a dark overlay all ask for `onDark`. It is a PALETTE key, not a
    // tone: omitting it made C() return the literal string 'onDark', the fill write threw, and every Transfer/Tree
    // cell was rolled back as an orphan (measured 2026-10-26: 15 cells → 0 hosts). White is the contract value.
    onDark: T.onDark || '#FFFFFF',
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
  CF.theme = function (map) { Object.assign(P, map || {}); C._res = null; CF._paletteOverride = true; return Object.keys(P).length; };
  /** ADOPT THE LIVE COLOUR TOKENS. `P` is seeded from `storage.T`, a JS mirror that a fresh session/plugin reload does
      not carry — the fallback is the generic kit (#2563EB slate palette), so a component rebuilt after a wipe came out
      off-brand while the file's own tokens still declared the source palette (measured 2026-10-26: a Chip atom rebuilt
      with #F8FAFC/#0F172A while every Chip master in the file used #F3EFEC/#161616). The token set is durable; the mirror
      is not. This re-derives the semantic roles from `TK.declared()` and mirrors them back into `storage.T` for engines
      that read it (`native_layout`, `icon_engine`). `CF.theme()` opts out (a deliberate custom palette). */
  CF.adoptPalette = function () {
    var d = null; try { d = storage.TK && storage.TK.declared ? storage.TK.declared(true) : null; } catch (e) {}
    if (!d || !d.colors || !d.colors.length) return { applied: 0, err: 'no live colour tokens' };
    var by = {}; d.colors.forEach(function (c) { by[String(c.name)] = c.hex || c.value; });
    var map = {
      primary: 'color.primary', primaryInk: 'color.primary-ink', primarySoft: 'color.primary-soft',
      onPrimary: 'color.on-inverse', onDark: 'color.on-inverse',
      ink: 'color.text-bright', muted: 'color.text-muted',
      surface: 'color.surface', surfaceAlt: 'color.surfaceAlt', surfaceRaised: 'color.surfaceRaised',
      border: 'color.border', borderStrong: 'color.borderStrong', line: 'color.text-bright',
      darkRaised: 'color.inverseRaised',
      error: 'color.error', errorInk: 'color.error-ink', errorSoft: 'color.error-soft',
      success: 'color.success', successInk: 'color.success-ink', successSoft: 'color.success-soft',
      warning: 'color.warning', warningInk: 'color.warning-ink', warningSoft: 'color.warning-soft',
      info: 'color.info', infoInk: 'color.info-ink', infoSoft: 'color.info-soft'
    };
    // The token set may spell the ink/wash steps `color.primary-ink` OR `color.primaryInk` (DESIGN.md emits the camel
    // form the token engine and CF.P use). Without this fallback every *Ink/*Soft role silently kept the generic kit
    // hex — measured 2026-10-27: AppKit's Button primary shipped #1E40AF (the default) while the set declared #3574C4.
    var look = function (name) {
      if (by[name]) return by[name];
      var camel = String(name).replace(/-ink$/, 'Ink').replace(/-soft$/, 'Soft');
      if (by[camel]) return by[camel];
      return null;
    };
    var T2 = storage.T || (storage.T = {}), n = 0;
    Object.keys(map).forEach(function (k) {
      var h = look(map[k]);
      if (!h) return;
      P[k] = h; n++;
      if (k === 'ink') { T2.onSurface = h; T2.ink = h; }
      else if (k === 'surfaceAlt') { T2.neutral = h; T2.surfaceAlt = h; }
      else if (k === 'muted') { T2.secondary = h; T2.muted = h; }
      else if (k === 'onPrimary') { T2.onPrimary = h; T2.onDark = h; }
      else T2[k] = h;
    });
    C._res = null;
    CF._paletteSig = d.colors.length;
    return { applied: n, primary: P.primary, surfaceAlt: P.surfaceAlt, ink: P.ink, border: P.border };
  };

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

  /** The ONE way a gradient fill is written. A linear gradient needs `width:1` in this build or Penpot rejects the
      whole fill (`Value not valid … :fills`); offsets are derived from the stop order when not declared; every stop
      colour resolves through `C()`, so a profile can name a token or a hex. `o.opacity` washes the whole fill (the
      disabled state), because a gradient fill cannot take a `fillOpacity` of its own. */
  CF.gradFill = function (stops, o) {
    o = o || {};
    var s = (stops || []).filter(function (x) { return x !== null && x !== undefined; });
    if (!s.length) return null;
    var n = max(1, s.length - 1);
    return [{ fillColorGradient: {
      type: o.type || 'linear',
      startX: o.startX !== undefined ? o.startX : 0.5, startY: o.startY !== undefined ? o.startY : 0,
      endX: o.endX !== undefined ? o.endX : 0.5, endY: o.endY !== undefined ? o.endY : 1, width: 1,
      stops: s.map(function (st, i) {
        var c = (st && typeof st === 'object') ? st : { color: st };
        return { color: C(c.color, c.color),
                 opacity: c.opacity !== undefined ? c.opacity : (o.opacity !== undefined ? o.opacity : 1),
                 offset: c.offset !== undefined ? c.offset : i / n };
      }) } }];
  };
  /** The gradient a profile declares for one variant/state, or null — a flat token fill is the fallback, never an
      invented pair of hexes. `grad` may be a stop list, `{default:[…], hover:[…]}`, or a token name. */
  CF.gradOf = function (holder, state) {
    if (!holder) return null;
    var g = holder.gradient || holder.grad;
    if (g && typeof g === 'object' && !Array.isArray(g)) g = g[state] || g.default || g.base || null;
    if (typeof g === 'string') g = [g];
    return (Array.isArray(g) && g.length >= 2) ? g : null;
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
    '2xl':{ h: 56, fs: 16, padX: 24, icon: 24, radius: 'control', gap: 12 },
    // The source's marketing controls are a measured 52px pill (24px pad, 16/24 label); xl (48) and 2xl (56) are
    // both wrong by 4px, and a profile may only pin the corner, not the height. A real size step is the honest fix.
    xl2:  { h: 52, fs: 16, padX: 24, icon: 24, radius: 'control', gap: 12 }
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
  /** Elevation is a DESIGN fact, not a factory default: when `storage.EL` is seeded (elevation_engine.js),
      its recipe is the only source of a shadow — multi-layer, insets included. The old single-layer ELEV
      stays as the fallback for a file that never declared an elevation record (2026-10-23). */
  CF.shadow = function (level) {
    if (!level) return [];
    if (storage.EL && storage.EL.seeded && storage.EL.shadow) {
      var a = storage.EL.shadow(level);
      if (a && a.length) return a;
    }
    var e = ELEV[Math.min(5, Math.max(1, level))] || ELEV[1];
    return [{ style: 'drop-shadow', offsetX: 0, offsetY: e.y, blur: e.b, spread: 0,
             color: { color: P.ink, opacity: e.o } }];
  };
  /** Apply the family's declared elevation (base/hover/pressed) to a freshly built control host, plus its
      sheen. A no-op unless EL is seeded and the family has a role, so a foreign system keeps its old look. */
  CF.elevate = function (host, family, o) {
    o = o || {};
    var EL = storage.EL;
    if (!EL || !EL.seeded || !EL.roleFor || !host) return null;
    var role = EL.roleFor(host.name, family);
    if (!role) return null;
    var r = EL.apply(host, role);
    if (r && r.ok && EL.sheen(role) && o.sheen !== false) {
      var isCopy = false;
      try { isCopy = !!(host.isComponentCopyInstance && host.isComponentCopyInstance()); } catch (e) {}
      if (!isCopy) {
        try {
          var hb = { x: host.x, y: host.y, w: host.width, h: host.height };
          EL.sheenFor(host, role, { parent: host, box: hb, radius: host.borderRadius });
        } catch (e) {}
      }
    }
    return r;
  };
  // ---------------------------------------------------------------- §2.1 radius = the token ladder, and nothing else
  // The ladder is the file's own `borderRadius` token set (DESIGN.md §Shapes). For a recreation that means the source
  // site's measured steps; for an invented system it means the steps DESIGN.md declared. `CF.radius(key)` reads the
  // LIVE declared value first — this table is only the fallback for a file whose tokens were never seeded, so its
  // numbers are a generic kit, not any one source's ladder.
  // `full` (9999) is the pill the radius FORGE needs and a source may not declare: `TK.radiusFor` reads it to bind a
  // corner that is `min(w,h)/2` or larger, and the renderer clamps it to a clean pill (measured 2026-10-21: a 320×32
  // and a 320×8 at 9999 both export as clean pills). It is a forge affordance, labelled as such — every DRAWN corner
  // in this file comes from a declared ladder step.
  var RAD = { none: 0, xxs: 4, xs: 2, sm: 3, md: 5, lg: 100, full: 9999 };
  CF.RAD = RAD;
  // role → ladder key. A factory asks for the ROLE it is drawing; the number and the token name both come from here,
  // so "which radius is legal where" has exactly one answer in the file.
  // A control takes the ladder's small step, not a pill: `control` is `sm`, and `TK.CONTROL_FAMS`'s repair pass reads
  // `CF.radius('control')`, so the sweep and the factories agree on the same number.
  // A background plate (a spec sheet, a modal, a command palette) holds a GROUP; it is not a control and not a card.
  // It defaults to square because a large corner CLIPS the group at the plate's own corners — measured 2026-10-22 on
  // `FAB·Spec`, where the ladder's `lg` (a large circle/pill step) cut the corner cells. Rounding belongs to
  // controls and cards; `spec` is the plate role, and audit_design rule 42 (`plate_rounded`) gates it.
  var ROLE = { control: 'sm', box: 'xxs', tile: 'sm', badge: 'sm', card: 'md', field: 'md', panel: 'md',
               spec: 'none', slab: 'none', inverse: 'none', hero: 'md', flat: 'none', ring: 'host', clip: 'host' };
  CF.ROLE = ROLE;
  var TOKEN_OF = { none: 'radius.none', xxs: 'radius.xxs', xs: 'radius.xs', sm: 'radius.sm', md: 'radius.md', lg: 'radius.lg',
                   full: 'radius.full' };
  var VALUE_OF = { 0: 'radius.none', 4: 'radius.xxs', 2: 'radius.xs', 3: 'radius.sm', 5: 'radius.md', 100: 'radius.lg',
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
    // The LADDER IS THE TOKEN SET's, not this file's fallback table. The static RAD below is a generic kit
    // (0/2/3/5/100); a source ladder can be 0/8/12/16/24/32/40/9999, and answering `tile` with the fallback's 3
    // while the file's `radius.sm` is 12 made a legal tile read as an off-reference corner (measured 2026-10-23 on
    // page 03: 12 `reference_drift` findings, all r12 tiles). Read the live declared value first.
    if (storage.TK && storage.TK.declared) {
      try {
        var decl = storage.TK.declared().radii || [];
        for (var ri = 0; ri < decl.length; ri++) if (decl[ri].name === 'radius.' + k) return decl[ri].value;
      } catch (e) {}
    }
    if (RAD[k] !== undefined) return RAD[k];
    if (/^radius\./.test(k)) { var kk = k.slice(7); if (RAD[kk] !== undefined) return RAD[kk]; }
    return CF.radius(Number(k));
  };
  /** The token name for the same question `CF.radius` answers with a number — the binder's input. */
  CF.radiusTokenFor = function (key) { return CF.radiusToken(CF.radius(key)); };
  /** The largest DECLARED radius step at or below `v`. A nested surface must use this, not an arbitrary smaller
      step: a r12 panel with a 4px inset admits at most r8, and a r4 row reads as a different control (measured
      2026-10-26 on TimePicker/Combobox: panel r12, row r4). Falls back to the generic ladder before tokens exist. */
  CF.radiusDown = function (v) {
    var vals = [];
    try { if (storage.TK && storage.TK.declared) vals = (storage.TK.declared().radii || []).map(function (r) { return Number(r.value); }); } catch (e) {}
    if (!vals.length) vals = Object.keys(RAD).map(function (k) { return RAD[k]; });
    var best = 0;
    vals.forEach(function (x) { if (isFinite(x) && x <= Number(v) + 0.5 && x > best) best = x; });
    return best;
  };
  CF.radiusSteps = function () { return Object.keys(RAD).map(function (k) { return { key: k, value: RAD[k], token: TOKEN_OF[k] }; }); };
  /** The corner of a FORM control (§5.1 "one control, one corner"). A field is not a button: a source whose actions
      are pills still draws its inputs on the form step (Rayo DESIGN.md: buttons `radius.full`, fields and modals
      `radius.md` = 12). The measured `forms` profile wins; otherwise the `field` role — NEVER `control`, the button
      pill. Every field family and every layer derived from a field (focus ring, state overlay, add-ons, steppers)
      resolves through this one function, so a variant can never move the geometry on its own. */
  CF.fieldRadius = function () {
    var g = (CF.reference && CF.reference('forms')) || {};
    var keys = ['input', 'textarea', 'search'];
    for (var i = 0; i < keys.length; i++) {
      var e = g[keys[i]];
      if (e && e.radius !== undefined && e.radius !== null) return CF.radius(e.radius);
    }
    return CF.radius('field');
  };
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
    // Clamp the arrow base to the flat part of its edge. Without this a centre `at` on a very small bubble
    // puts the base under a corner, and the path folds back over itself (the malformed notch this replaces).
    var cl = function (v, lo, hi) { return max(lo, min(hi, v)); };
    var d = 'M ' + f(x + r) + ' ' + f(y);
    // top edge (left→right): the arrow is part of THIS edge, not a detour after the left edge
    var topArrow = ar && ar.side === 'top';
    if (topArrow) {
      var ta = cl(at, x + r + aw / 2, x + w - r - aw / 2);
      d += L(ta - aw / 2, y); d += L(ta, y - ah); d += L(ta + aw / 2, y);
    }
    d += L(x + w - r, y);
    d += C(x + w - r + 0.5523 * r, y, x + w, y + r - 0.5523 * r, x + w, y + r);
    // right edge (top→bottom)
    var rightArrow = ar && ar.side === 'right';
    if (rightArrow) {
      var ra = cl(at, y + r + aw / 2, y + h - r - aw / 2);
      d += L(x + w, ra - aw / 2); d += L(x + w + ah, ra); d += L(x + w, ra + aw / 2);
    }
    d += L(x + w, y + h - r);
    d += C(x + w, y + h - r + 0.5523 * r, x + w - r + 0.5523 * r, y + h, x + w - r, y + h);
    // bottom edge (right→left)
    var bottomArrow = ar && ar.side === 'bottom';
    if (bottomArrow) {
      var ba = cl(at, x + r + aw / 2, x + w - r - aw / 2);
      d += L(ba + aw / 2, y + h); d += L(ba, y + h + ah); d += L(ba - aw / 2, y + h);
    }
    d += L(x + r, y + h);
    d += C(x + r - 0.5523 * r, y + h, x, y + h - r + 0.5523 * r, x, y + h - r);
    // left edge (bottom→top)
    var leftArrow = ar && ar.side === 'left';
    if (leftArrow) {
      var la = cl(at, y + r + aw / 2, y + h - r - aw / 2);
      d += L(x, la + aw / 2); d += L(x - ah, la); d += L(x, la - aw / 2);
    }
    d += L(x, y + r);
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
        // `lineHeight` reads back as the ramp's UNITLESS ratio (1.25), not pixels: `parseFloat` alone treated it as
        // 1.25px and centred every button label ~9px low (measured 2026-10-23 on all 21 Button masters). Resolve a
        // ratio below 4 against fontSize before measuring the vertical centre.
        var th = 0, tw = t.width || 0, tfs = parseFloat(t.fontSize) || 0;
        try { th = parseFloat(t.lineHeight) || 0; } catch (e) {}
        if (th > 0 && th < 4 && tfs > 0) th = th * tfs;
        if (!th) th = tfs ? CF.lineH(tfs, parseFloat(t.fontWeight) || 400, t.fontFamily) : (t.height || 0);
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
      var off = o.offset === undefined ? 2 : o.offset, w = o.width || 2;
      // A RING TAKES ITS HOST'S CORNER, not a ladder role. The default used to be `RZ('sm')`, which agreed with a
      // rounded control by coincidence (button 8 = sm 8) and disagreed with anything square: `CF.listItem` painted its
      // own state background on an r0 row, asked for no corner, and got an r8 ring + r8 `wash·focus` around a square
      // plate (rule 37 `ring_off_host` on every rebuilt ListItem·Focus). Resolve the same way the auditor does — the
      // host, or a same-box non-decorative plate inside it (a Switch track outranks its r0 wrapper) — and only fall
      // back to `sm` when nothing declares a corner at all.
      var rHost = null;
      if (this.host && storage.TK && storage.TK.cornersOf) {
        var cs = storage.TK.cornersOf(this.host);
        if (cs && cs.length) rHost = Math.max.apply(null, cs);
        var hb0 = this.host;
        var DECOR = /^(sheen·|hitpad·|wash·|clip·|surface·|hairline·|state·layer|ring·)/;
        Array.from(hb0.children || []).forEach(function (k) {
          if (DECOR.test(String(k.name))) return;
          if (Math.abs(k.width - hb0.width) > 2 || Math.abs(k.height - hb0.height) > 2) return;
          var kc = storage.TK.cornersOf(k); if (!kc || !kc.length) return;
          var km = Math.max.apply(null, kc);
          if (km > (rHost || 0)) rHost = km;
        });
      }
      var r = o.radius === undefined ? (rHost === null ? RZ('sm') : rHost) : RZ(o.radius);
      var hb = this.host ? B(this.host.x, this.host.y, this.host.width, this.host.height) : null;
      var src = box ? B(box.x, box.y, box.w, box.h) : (hb ? B(hb.x, hb.y, hb.w, hb.h) : null);
      if (!src) return null;
      if (hb && this.box) {
        src = B(src.x + (hb.x - this.box.x), src.y + (hb.y - this.box.y), src.w, src.h);
        // A caller that asked for the BUILD host follows the host through a resize refit. Do NOT use a blanket 6px
        // threshold: a 20×20 radio circle inside a 20×24 host differs by only 4px, and the old test inflated its ring to
        // 20×24 → a 24×28 OVAL around a circular control (measured 2026-10-23, Radio·Focus). Compare against `this.box`
        // (what the factory asked for), not against the current host box.
        var wasHostBox = Math.abs(src.w - this.box.w) <= 1 && Math.abs(src.h - this.box.h) <= 1;
        if (wasHostBox) src = B(hb.x, hb.y, hb.w, hb.h);
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
      var m = max(minSide || 32, box.w), mh = max(minSide || 32, box.h), nm = 'hitpad·' + m + '×' + mh;
      var px = box.x + (box.w - m) / 2, py = box.y + (box.h - mh) / 2;
      CF.fitToClip(this.host, box, 0, { clamp: false });
      // Idempotent: `place()` calls autoHit(), and a factory that already placed an explicit pad used to get a SECOND
      // identical plate (measured on Switch·Focus: two hitpad·44×32). One pad per control: reuse it and let autoHit
      // re-centre the same shape.
      var existing = null;
      try { existing = Array.from(this.host.children || []).find((c) => String(c.name || '') === nm); } catch (e) {}
      if (existing) {
        try { existing.resize(m, mh); } catch (e) {}
        try { storage.absMount(this.host, existing, N(px), N(py)); } catch (e) {}
        this._hit = existing;
        return existing;
      }
      var pad = this.plate(B(px, py, m, mh), { name: nm, fill: null });
      this._hit = pad;
      return pad;
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
    // First build of a session adopts the durable live token colours if the JS mirror was not seeded (see adoptPalette).
    if (!CF._paletteOverride && storage.TK && storage.TK.declared) {
      var sig = 0; try { sig = (storage.TK.declared().colors || []).length; } catch (e) {}
      if (sig && sig !== CF._paletteSig) { try { CF.adoptPalette(); } catch (e) {} }
    }
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
    brand: { bg: 'primary', ink: '#FFFFFF', onDark: 1 },
    secondary: { bg: 'surfaceAlt', ink: 'ink', line: 'border' },
    ink: { bg: 'darkRaised', ink: '#FFFFFF', onDark: 1 },
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

  /** Centre a control's single label on BOTH axes of its host. Text inside a layout board is a layout child: its
      `x/y` are parent-relative and a direct write is ignored — `storage.centerIn` writes `parentX/parentY`, which is
      the only coordinate pair that sticks. Call this after any post-birth font change; the factory's own refit only
      centres the size it was born with (measured 2026-10-26: a 16→30px label stayed ~29px right / 11px low). */
  CF.centerLabel = function (host, o) {
    o = o || {};
    if (!host) return { err: 'no host' };
    const texts = Array.from(host.children || []).filter((c) => c.type === 'text');
    if (texts.length !== 1) return { skipped: true, reason: 'labels=' + texts.length };
    const t = texts[0];
    try { t.align = o.align || 'center'; t.verticalAlign = o.valign || 'middle'; } catch (e) {}
    try { if (o.grow !== false) t.growType = 'auto-width'; } catch (e) {}
    try { storage.centerIn(t, host); } catch (e) { return { err: String(e).slice(0, 90) }; }
    return { ok: true, label: String(t.name), dx: Math.round((t.x + t.width / 2) - (host.x + host.width / 2)),
             dy: Math.round((t.y + t.height / 2) - (host.y + host.height / 2)) };
  };

  /**
   * CF.button — type(primary·default·dashed·text·link·ghost·danger) × size(xs…2xl) × slot(icon start/end/only,
   * loading, block) × state(§1.1 seven axes). Width comes from label + pad-X, never typed (except block / fixed spec).
   */
  CF.button = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), type = o.type || 'default', S = o.state || 'default';
    var tn = CF.tone(o.tone || type);
    var label = o.label === undefined ? (type === 'primary' ? 'Continue' : 'Button') : String(o.label);
    // A hero/CTA size is a SIZE decision, not a post-birth font edit: the label's size participates in width
    // estimation and in refit/centring. Editing `fontSize` after the factory returns leaves the old box behind.
    var lfs = o.labelSize || L.fs, lwt = o.labelWeight || o.weight || 500;
    var iconOnly = o.iconOnly || (!label && !!o.lead);
    var lead = (o.lead && !iconOnly ? L.icon : 0) || (iconOnly ? L.icon : 0);
    var leadW = (o.lead || o.loading) && !iconOnly ? L.icon + L.gap : 0;
    var trailW = o.trail ? L.icon + L.gap : 0;
    var lw = label && !iconOnly ? CF.estW(label, lfs) : 0;
    var w = o.block ? (o.w || 240) : (o.w || (iconOnly ? L.h : L.padX * 2 + leadW + trailW + lw));
    w = max(w, iconOnly ? L.h : L.h + 8);
    var round = o.shape === 'circle' || o.shape === 'round' || o.shape === 'pill';
    // The MATERIAL and the hover idiom are the profile's, not the factory's: `actions.button.variants[type]` may declare
    // `chip:true` (a light raised plate with no border), `hoverInk` (the hover lives in the label, not in a wash) and
    // `ringInk`. With no profile a secondary button keeps its tone's border and the generic state wash — inferring
    // "secondary means borderless chip" locally is what made one file's Button·Secondary a bordered control wearing
    // another family's elevation stack (measured 2026-10-23). `outlined` remains the bordered form either way.
    var bp = CF.profile('actions', 'button', type) || {};
    // PROFILE SIZE (§source-adaptation): a measured family size wins over the generic ladder. This factory used to read
    // only material keys (chip/radius/hoverInk), so a source's 40px/12px/16px-pad button shipped at the kit's 32/14/12
    // while its `nl:prof` stamp recorded the kit geometry and the gate compared it to a profile that said 40.
    // `sizes[size]` (the drawn step) wins over `size`.
    var bpSz = (bp && bp.size) || {}, bpZ = (bp && bp.sizes && bp.sizes[String(o.size || 'md').toLowerCase()]) || {};
    if (bpSz.h !== undefined || bpZ.h !== undefined || bpSz.fs !== undefined || bpZ.fs !== undefined || bpSz.padX !== undefined || bpZ.padX !== undefined) {
      L = Object.assign({}, L, {
        h: o.h || bpZ.h || bpSz.h || L.h,
        padX: bpZ.padX !== undefined ? bpZ.padX : (bpSz.padX !== undefined ? bpSz.padX : L.padX),
        fs: bpZ.fs !== undefined ? bpZ.fs : (bpSz.fs !== undefined ? bpSz.fs : L.fs)
      });
      lfs = o.labelSize || L.fs;
      leadW = (o.lead || o.loading) && !iconOnly ? L.icon + L.gap : 0;
      trailW = o.trail ? L.icon + L.gap : 0;
      lw = label && !iconOnly ? CF.estW(label, lfs) : 0;
      w = o.block ? (o.w || 240) : (o.w || (iconOnly ? L.h : L.padX * 2 + leadW + trailW + lw));
      w = max(w, iconOnly ? L.h : L.h + 8);
    }
    var chip = o.chip !== undefined ? !!o.chip : (bp.chip === true && !o.outlined);
    // A PILL is `full` by definition. Drawing it at `control` (12) and letting TK.roleSweep repair it to 9999 left the
    // BIRTH STAMP saying 12 while the render said 9999 — the stamp must be what was drawn, so the corner is right at
    // build time; a profile may pin the family's own default (`actions.button.radius`) when the shape axis is absent.
    var rad = o.shape === 'square' ? 0 : (round ? 'full' : (bp.radius !== undefined ? bp.radius : CF.radius('control')));
    var box = B(o.x || 0, o.y || 0, w, o.h || L.h);
    // `shape` is a real axis in this kit (a source may draw every CTA as a pill), so it belongs in the name: without it a
    // pill and a radius-6 button of the same type/size/state would share one name and the size axis would lie.
    var shapeV = o.shape === 'pill' || o.shape === 'round' || o.shape === 'circle' ? 'Pill' : (o.shape === 'square' ? 'Square' : null);
    var compName = CF.name('Button', { type: type, size: o.size, state: S, variant: shapeV, slot: slotName(o) });
    // BUILD-TIME INSTANCE GUARD (component-library §5 / G10): on an application surface, an exact registered Button
    // must be PLACED, never re-drawn. The previous enforcement was audit-only and exact-name-only, so page 10's raw
    // `Button·MD` shipped while the library held Button masters (measured 2026-10-23). A `·Spec`/`Masters·` parent is
    // where masters are authored, so the raw factory is still legal there.
    var pn = o.parent ? String(o.parent.name || '') : '';
    if (o.parent && CF.get && CF.get(compName) && !/·Spec(·|$)|^Masters·/.test(pn) && o.asInstance !== false) {
      var inst = CF.instance(compName, { parent: o.parent, absolute: { x: o.x || 0, y: o.y || 0 }, text: label,
        resize: (o.w !== undefined || o.h !== undefined) ? [w, o.h || L.h] : undefined });
      if (inst && inst.ok) return inst.inst;
    }
    var ctx = CF.build(compName, box, { parent: o.parent, radius: rad });
    // A chip's state is carried by ink + elevation; a grey overlay on a light plate reads as the harsh transition the
    // eye reports as a disabled/active mismatch. The same is true of a FILLED brand/ink button: its hover changes the
    // shadow and sheen, not the background. Disabled keeps its container overlay (§1.2).
    var filled = type === 'primary' || type === 'ink' || !!tn.onDark;
    var fillState = ((chip || filled) && (S === 'hover' || S === 'focus' || S === 'pressed' || S === 'selected')) ? 'default' : S;
    // PROFILE MATERIAL: a variant's declared fill wins for a filled type — a source's primary is often its READABLE ink
    // step, not the tone hue (white on #4A89DC is 3.56:1). `fill` is a palette key or hex, never a `color.*` token name.
    var baseFill = (filled && bp && bp.fill) ? C(bp.fill) : (tn.bg ? C(tn.bg) : null);
    ctx.host.fills = CF.fills(baseFill, fillState, { onDark: tn.onDark });
    if (tn.line && !chip) ctx._stroke(ctx.host, C(tn.line), 1, S === 'disabled' ? 0.4 : 1);
    if (tn.dashed && tn.line) ctx.host.strokes = [Object.assign({}, ctx.host.strokes[0], { strokeStyle: 'dashed' })];
    if (type === 'text' || type === 'link' || type === 'ghost') { /* no border, fill only carries the state tint */ }
    if (o.elevated) ctx.host.shadows = CF.shadow(1);
    var ink = C((filled && !tn.onDark) ? 'onPrimary' : tn.ink, P.ink), al = stateAlpha(S);
    // where the hover lives is a profile fact: some systems move the LABEL to the brand hue instead of washing the plate.
    var hoverInk = bp.hoverInk || (bp.states && bp.states.hover && bp.states.hover.ink) || (chip ? 'primary' : null);
    if (hoverInk && (S === 'hover' || S === 'focus' || S === 'pressed' || S === 'selected')) ink = C(hoverInk);
    if (iconOnly) ctx.glyph(o.glyph || 'search', B(box.x, box.y, box.w, box.h), { color: ink, opacity: al, anchor: 'center' });
    else {
      if (o.lead && !o.loading) ctx.glyph(o.glyph || 'download', B(box.x + L.padX, box.y + (box.h - L.icon) / 2, L.icon, L.icon), { color: ink, opacity: al, anchor: 'left' });
      if (o.loading) CF.spinner(ctx, B(box.x + L.padX, box.y + (box.h - L.icon) / 2, L.icon, L.icon), ink);
      if (label) ctx.text(label, B(box.x + L.padX + leadW, box.y, max(8, box.w - L.padX * 2 - leadW - trailW), box.h),
        { size: lfs, color: ink, weight: lwt, opacity: al, underline: (type === 'link' && (S === 'hover' || S === 'focus')) ? ink : false });
      if (o.trail) ctx.glyph(o.glyphEnd || 'chevronDown', B(box.x + box.w - L.padX - L.icon, box.y + (box.h - L.icon) / 2, L.icon, L.icon), { color: ink, opacity: al, anchor: 'right' });
    }
    await ctx.settle(); ctx.place(); if (!o.noRefit) ctx.refit(L.padX);
    if (!iconOnly && !o.lead && !o.trail) { try { CF.centerLabel(ctx.host); } catch (e) {} }
    CF.elevate(ctx.host, 'Button');
    var final = B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height);
    // A focus ring is FLUSH to the control on every button type. An outer halo with a 2px offset reads as a detached
    // frame, and a same-radius outset ring is not geometrically parallel (wider gap on the straight edges than at the
    // corners — the reported "border is not aligned / there is a gap"). Flush + host corner is exact; a filled
    // brand/ink surface takes a light ring because a brand ring on a brand fill is 1:1 and invisible.
    if (S === 'focus' || S === 'selected') ctx.ring(final, { radius: rad, offset: 0, color: o.ring ? C(o.ring) : (filled ? C(bp.ringInk || 'onPrimary') : C('primary')) });
    if (S === 'selected' && !tn.bg) ctx.host.fills = CF.fills(C('primary'), 'selected', { tint: 1 });
    if (o.hit) ctx.hitPad(final, o.hit);
    if (bp._family) CF.profStamp(ctx.host, bp, { h: final.h, padX: L.padX, fs: L.fs, radius: CF.radius(rad), chip: chip },
      { family: 'button', type: type, size: L.key, state: S });
    return ctx.host;
  };

  /**
   * CF.toggle — the codesign-ui Toggle (a pressed/unpressed button with an indicator), NOT a plain Button.
   * Anatomy `ToggleIndicator` + `ToggleRoot`; states off / on / focus / disabled. Geometry/material come from
   * `actions.toggle` (a source that lacks a toggle derives it from the button material).
   */
  CF.toggle = async function (o) {
    o = o || {};
    var prof = CF.profile('actions', 'toggle') || CF.profile('actions', 'button') || {};
    var sz = (prof && prof.size) || {}, szs = (prof && prof.sizes && prof.sizes[String(o.size || 'md').toLowerCase()]) || {};
    var h = o.h || szs.h || sz.h || 40;
    var padX = szs.padX !== undefined ? szs.padX : (sz.padX !== undefined ? sz.padX : 16);
    var fs = szs.fs !== undefined ? szs.fs : (sz.fs !== undefined ? sz.fs : 12);
    var rad = prof.radius !== undefined ? prof.radius : 8;
    var S = o.state || (o.on ? 'on' : 'off');
    var on = S === 'on' || S === 'selected' || o.on === true;
    var label = o.label === undefined ? 'Toggle' : String(o.label);
    var ind = o.indicator || 16;
    var w = o.w || (padX * 2 + ind + 8 + CF.estW(label, fs));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Toggle', { state: S, size: o.size }), box, { parent: o.parent, radius: rad });
    ctx.host.fills = on ? CF.fills(C('primarySoft'), null) : CF.fills(C('surface'), null);
    ctx._stroke(ctx.host, C(on ? 'primary' : 'border'), 1, S === 'disabled' ? 0.4 : 1);
    var ib = B(box.x + padX, box.y + (h - ind) / 2, ind, ind);
    ctx.plate(ib, { name: 'indicator', fill: on ? C('primary') : null, stroke: C(on ? 'primary' : 'borderStrong'), strokeW: 1, radius: 4 });
    if (on) ctx.glyph('check', B(ib.x + 2, ib.y + 2, ind - 4, ind - 4), { color: C('onPrimary'), strokeW: 2 });
    ctx.text(label, B(box.x + padX + ind + 8, box.y, max(8, w - padX * 2 - ind - 8), h),
      { size: fs, color: C(on ? 'primaryInk' : 'ink'), weight: 600, valign: 'middle', align: 'left', refit: false });
    if (S === 'focus') ctx.ring(B(box.x, box.y, w, h), { radius: rad, offset: 0, color: C('primary') });
    if (S === 'disabled') ctx.host.opacity = 0.5;
    await ctx.settle(); ctx.place(); ctx.refit(padX);
    CF.elevate(ctx.host, 'Button');
    var final = B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height);
    if (prof._family) CF.profStamp(ctx.host, prof, { h: final.h, padX: padX, fs: fs, radius: CF.radius(rad) },
      { family: 'toggle', size: String(o.size || 'md').toLowerCase(), state: S });
    return ctx.host;
  };

  /** Icon-only square button: 28 / 40 / 52 with icon 16 / 24 / 28 (§2 HARD), optional badge dot and toggle state. */
  CF.iconButton = async function (o) {
    o = o || {};
    var sq = CF.iconSquare(o.size), ic = CF.iconInSquare(o.size), S = o.state || 'default';
    // The NAME comes from `type`; the paint must come from the same axis. A primary icon button is a GRAPHIC
    // container (the source draws it in the brand hue with a white glyph), so `primary` resolves to the brand
    // tone — not to `TONE.primary` (the ink step reserved for copy-bearing surfaces). Unknown types fall to ghost.
    var toneKey = o.tone || o.type;
    var tn = toneKey === 'primary' ? TONE.brand : (TONE[toneKey] || TONE.ghost);
    var box = B(o.x || 0, o.y || 0, o.w || sq, o.h || sq);
    // The MATERIAL is the profile's, never the factory's: a source that paints its brand tile with a gradient declares
    // `actions.iconbutton.variants.<type>.gradient` (plus its own elevation recipe), and a file with no profile gets the
    // tone's flat token fill. Inventing a pair of gradient hexes here is what produced a tile that matched nothing.
    var iv = CF.profile('actions', 'iconbutton', toneKey || o.type) || CF.profile('actions', 'iconbutton') || {};
    // PROFILE SIZE: the source's 38px tile wins over the kit's 40 (the factory read the radius/material but not the
    // square, so the stamp said 40 against an expect of 38).
    var ivSz = (iv && iv.size) || {}, ivZ = (iv && iv.sizes && iv.sizes[String(o.size || 'md').toLowerCase()]) || {};
    if (ivSz.size !== undefined || ivZ.size !== undefined) sq = o.w || ivZ.size || ivSz.size || sq;
    // `box` was built before the profile was resolved: rebuild it so the RENDER and the `nl:prof` stamp agree.
    box = B(o.x || 0, o.y || 0, o.w || sq, o.h || sq);
    // The glyph box is snapped to the 4px grid: an 18px mark inside a 40px tile centres at 11 (off-grid) and the
    // auditor judges the mark's own box, not the tile's interior (measured 2026-10-27 on the shell title band).
    ic = Math.max(8, Math.round(Math.round(sq * (CF.iconInSquare(o.size) / (CF.iconSquare(o.size) || 1))) / 4) * 4);
    // An icon button is a TILE by default (DESIGN.md §Shapes: small icon tiles take `sm`); an explicit circle is `full`
    // (a rounded rect at `control` is a 40px square with soft corners, not the source's disc — it only ever looked
    // circular because TK.roleSweep repaired it afterwards, which the birth stamp could not see).
    var icoR = o.shape === 'circle' ? 'full' : (iv.radius !== undefined ? iv.radius : 'tile');
    var ctx = CF.build(CF.name('IconButton', { type: o.type || 'ghost', size: o.size, state: S, slot: o.badge ? 'Badge' : (o.shape === 'circle' ? 'Circle' : null) }), box, { parent: o.parent, radius: icoR });
    // The 44 hit pad is a child, but a flex parent could grow the 38 host to 41 before the spec pins its sizing. Pin the
    // drawn square at birth so RENDER and the `nl:prof` stamp agree (measured 2026-10-27: 38 stamp, 41 board).
    try { ctx.host.horizontalSizing = 'fix'; ctx.host.verticalSizing = 'fix'; } catch (e) {}
    // Filled brand/ink icons keep their base fill in every state; the old black focus overlay turned the red button
    // into a dark chip with a red-on-red halo. The state is carried by the ring and elevation.
    var icoFilled = toneKey === 'primary' || toneKey === 'ink' || !!tn.onDark;
    var icoFill = (icoFilled && (S === 'hover' || S === 'focus' || S === 'pressed' || S === 'selected')) ? 'default' : S;
    var ibGrad = CF.gradOf(iv, S);
    if (ibGrad) ctx.host.fills = CF.gradFill(ibGrad, { opacity: S === 'disabled' ? CF.STATE.disabledContent : 1 });
    else ctx.host.fills = CF.fills(C(tn.bg), icoFill, { onDark: tn.onDark });
    if (o.outlined || tn.line) ctx._stroke(ctx.host, C(o.outlined ? 'border' : tn.line), 1, S === 'disabled' ? 0.4 : 1);
    ctx.glyph(o.glyph || 'dots', CF.iconBox(box), { color: C(o.tone === 'danger' ? 'error' : (tn.ink || 'muted')), opacity: stateAlpha(S) });
    await ctx.settle(); ctx.place();
    CF.elevate(ctx.host, 'IconButton');
    var ibRole = iv.elevation && typeof iv.elevation === 'object' ? (iv.elevation[S] || iv.elevation.default) : iv.elevation;
    if (ibRole && storage.EL && storage.EL.has && storage.EL.has(ibRole)) storage.EL.apply(ctx.host, ibRole);
    var final = B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height);
    // Flush on the tile/circle (no outer frame, no gap); a filled brand/ink tile gets a light ring for contrast.
    if (S === 'focus' || S === 'selected') ctx.ring(final, { radius: icoR, offset: 0, color: icoFilled ? C(iv.ringInk || 'onPrimary') : C('primary') });
    // The dot is pinned to the corner **inside** the square: a board clips its own export box, so a badge that
    // overhangs is cut in half the moment the control is exported or turned into a component.
    if (o.badge) CF.badge({ parent: ctx.host, x: final.x + final.w - 8, y: final.y, dot: true, tone: o.badgeTone || 'error' });
    ctx.hitPad(final, o.hit || (o.tier === 'web' ? 32 : 44));
    if (iv._family) CF.profStamp(ctx.host, iv, { size: sq, radius: CF.radius(icoR), gradient: !!ibGrad },
      { family: 'iconbutton', type: toneKey, size: String(o.size || 'md').toLowerCase(), state: S, elevation: ibRole || null });
    return ctx.host;
  };
  /**
   * CF.iconTile — a GRAPHIC icon plate (a section icon, a feature glyph), which is material all the way down: its size,
   * corner, fill/gradient, glyph ink and elevation are the source's, read from `actions.icontile.variants[variant]`.
   * There is no generic reading of "how this source glows", so a file with no profile gets a flat token plate and no
   * variants. `o.variant` is the profile key; the first declared variant is the default.
   */
  CF.iconTile = async function (o) {
    o = o || {};
    var prof = CF.profile('actions', 'icontile') || {};
    var vs = prof.variants || {};
    var keys = CF.variantKeys(vs);
    var variant = keys.indexOf(String(o.variant)) >= 0 ? String(o.variant) : (o.variant ? String(o.variant) : (keys[0] || 'accent'));
    var V = CF.profile('actions', 'icontile', variant) || prof;
    var S = o.state || 'default', dis = S === 'disabled';
    var size = o.w || V.size || 64;
    var h = o.h || V.h || size, gs = o.glyphSize || V.glyphSize || Math.round(size * 0.45);
    var box = B(o.x || 0, o.y || 0, size, h);
    var rad = o.radius !== undefined ? o.radius : (V.radius !== undefined ? V.radius : 'tile');
    var name = CF.name(o.family || 'IconButton', { type: o.type || variant.charAt(0).toUpperCase() + variant.slice(1), size: o.size || 'MD', state: S });
    var ctx = CF.build(name, box, { parent: o.parent, radius: rad });
    var grad = CF.gradOf(V, S);
    if (grad) ctx.host.fills = CF.gradFill(grad, { opacity: dis ? CF.STATE.disabledContent : 1 });
    else ctx.host.fills = [{ fillColor: C(V.fill || 'ink'), fillOpacity: dis ? CF.STATE.disabledContent : 1 }];
    ctx.glyph(o.glyph || V.glyph || 'chart',
      B(box.x + (box.w - gs) / 2, box.y + (box.h - gs) / 2, gs, gs),
      { color: C(V.glyphInk || 'onPrimary'), opacity: dis ? CF.STATE.disabledContent : 1 });
    await ctx.settle(); ctx.place();
    var role = V.elevation && typeof V.elevation === 'object' ? (V.elevation[S] || V.elevation.default) : V.elevation;
    var EL = storage.EL;
    if (role && EL && EL.seeded && EL.has && EL.has(role)) EL.apply(ctx.host, role);
    var final = B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height);
    if (S === 'focus' || S === 'selected') ctx.ring(final, { radius: rad, offset: 0, color: C(V.ringInk || 'surface') });
    if (V._family) CF.profStamp(ctx.host, V, { size: size, radius: CF.radius(rad), gradient: !!grad },
      { family: 'icontile', variant: variant, size: String(o.size || 'md').toLowerCase(), state: S, elevation: role || null });
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
    // THE GROUP'S SILHOUETTE BELONGS TO ITS END SEGMENTS. The host is a pill/rounded plate that does NOT clip (a clip
    // would cut the focus ring, which is authored 1px outside), so a square `segment·` flush at either end painted its
    // corners straight through the host's rounded outline — measured 2026-10-26 on `ButtonGroup·Primary·MD·Focus`
    // (host r9999, segments r0, clipContent false, gate CLEAN). Per-corner radius: only the sides that touch the host
    // edge take the group corner; interior segments stay square.
    var grpR = RZ(L.radius);
    for (var i = 0; i < items.length; i++) {
      var it = items[i], tn = CF.tone(it.type || 'default');
      var seg = vert ? B(box.x + 1, box.y + 1 + off, box.w - 2, hs[i] - (i ? 1 : 0)) : B(box.x + 1 + off, box.y + 1, ws[i] - (i ? 1 : 0), box.h - 2);
      var fS = i === 0, lS = i === items.length - 1;
      var segR = (fS || lS) ? (vert
        ? { borderRadiusTopLeft: fS ? grpR : 0, borderRadiusTopRight: fS ? grpR : 0, borderRadiusBottomLeft: lS ? grpR : 0, borderRadiusBottomRight: lS ? grpR : 0 }
        : { borderRadiusTopLeft: fS ? grpR : 0, borderRadiusBottomLeft: fS ? grpR : 0, borderRadiusTopRight: lS ? grpR : 0, borderRadiusBottomRight: lS ? grpR : 0 }) : 0;
      // `RZ`/`CF.radius` resolve a NUMBER or a role name, so a per-corner map must be written onto the plate after it
      // exists (passing it as `radius` came back r0 — measured on the first rebuild of this fix).
      var segPlate = null;
      if (tn.bg) segPlate = ctx.plate(seg, { name: 'segment·' + (i + 1), fill: C(tn.bg), fills: CF.fills(C(tn.bg), S, { onDark: tn.onDark }) });
      else if (i && (S === 'hover' || S === 'pressed')) segPlate = ctx.plate(seg, { name: 'segment·' + (i + 1), fills: CF.fills(null, S) });
      // a per-corner MAP cannot be assigned: `borderRadius = {...}` throws "Value not valid: [object Object]" in
      // Penpot 2.17 (measured 2026-10-26); the four corner properties are the only writer.
      if (segPlate && segR) {
        ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].forEach(function (c) {
          try { segPlate['borderRadius' + c] = Number(segR['borderRadius' + c]) || 0; } catch (e) {}
        });
      }
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
    var zone = ctx.plate(B(box.x + box.w - cw, box.y, cw, box.h), { name: 'chevron-zone', fill: tn.bg ? '#000000' : C('border'), opacity: tn.bg ? 0.12 : 0.001 });
    // ONE CONTROL, ONE CORNER: the zone is flush with the host's right edge, so it must carry the host's right corners
    // (a square zone inside an r8 pill paints square corners through the outline — rule 73 flush_corner_split).
    try { var hostR = CF.radius(L.radius); zone.borderRadiusTopRight = hostR; zone.borderRadiusBottomRight = hostR; zone.borderRadiusTopLeft = 0; zone.borderRadiusBottomLeft = 0; } catch (e) {}
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
    // The extended FAB carries a white label, so its ground is the tone's INK step (§4.1: white on the hue is 3.56:1).
    var tn = o.tone === 'surface' ? TONE.filled : (o.tone === 'branded' ? { bg: 'primary', ink: 'onPrimary', onDark: 1 } : { bg: 'primaryInk', ink: 'onPrimary', onDark: 1 });
    var S = o.state || 'default', label = o.extended ? String(o.label === undefined ? 'New note' : o.label) : null;
    var w = label ? max(d, 16 + (o.iconOnly ? 0 : 24) + 8 + CF.estW(label, 14) + 16 + 2) : d;
    var box = B(o.x || 0, o.y || 0, w, d);
    var ctx = CF.build(CF.name('FAB', { size: o.size === 'sm' ? 'Sm' : (o.size === 'lg' ? 'Lg' : 'Md'), tone: o.tone,
      state: S, slot: [label ? 'Extended' : null, label && o.iconOnly ? 'IconOnly' : null].filter(Boolean).join('-') || null }), box, { parent: o.parent, radius: 'control' });
    ctx.host.fills = CF.fills(C(tn.bg), S, { onDark: tn.onDark });
    // Material is EL's, not the factory's: a project declares a Fab role, otherwise the control stays flat but
    // token-clean. A typed `CF.shadow` here made every FAB read `shadow_unbound` on the catalog pages.

    if (label) {
      if (!o.iconOnly) ctx.glyph(o.glyph || 'plus', B(box.x + 16, box.y + (d - 24) / 2, 24, 24), { color: C(tn.ink), opacity: stateAlpha(S) });
      ctx.text(label, B(box.x + (o.iconOnly ? 16 : 48), box.y, w - (o.iconOnly ? 32 : 64), d), { size: 14, color: C(tn.ink), weight: 600, opacity: stateAlpha(S) });
    } else ctx.glyph(o.glyph || 'plus', CF.iconBox(box), { color: C(tn.ink), opacity: stateAlpha(S) });
    await ctx.settle(); ctx.place(); ctx.refit(16);
    CF.elevate(ctx.host, 'Fab');
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, ctx.host.height), { radius: 'control' });
    return ctx.host;
  };

  /** Link: 14-15, underline appears on hover ONLY (§3.1), optional trailing icon, disabled = .38 content. */
  CF.link = async function (o) {
    o = o || {};
    // A link has no container to measure, so its whole contract is TYPE: the source's nav/CTA links are 16/600 with a
    // 1px brand underline on hover, the generic kit 500. The profile owns weight and step; the birth stamp records both.
    var prof = CF.profile('actions', 'link'), pp = (prof && prof.size) || {};
    var L = CF.ladder(o.size), fs = o.fs || pp.fs || L.fs;
    var label = String(o.label === undefined ? 'Read the docs' : o.label), S = o.state || 'default';
    // pressed = the ink step of the same hue (§1.2: a state is a step on the ramp, never a new hex)
    var color = C(S === 'pressed' ? (o.tone === 'neutral' ? 'ink' : 'primaryInk') : (o.tone === 'neutral' ? 'ink' : 'primary'));
    var w = CF.estW(label, fs) + (o.trail ? fs + 4 : 0) + 2;
    var box = B(o.x || 0, o.y || 0, o.w || w, o.h || max(L.h, fs + 10));
    var ctx = CF.build(CF.name('Link', { size: o.size, state: S, variant: o.underline ? 'Underline' : null, slot: slotName(o) }), box, { parent: o.parent });
    var wt = o.weight || pp.weight || 500;
    ctx.text(label, B(box.x, box.y, max(8, box.w - (o.trail ? fs + 4 : 0)), box.h), { size: fs, color: color, weight: wt,
      opacity: stateAlpha(S), align: 'left', underline: (o.underline || S === 'hover' || S === 'focus' || S === 'pressed') ? (o.underline === true ? color : o.underline) : false });
    if (o.trail) ctx.glyph(iconOf(o.trail, 'arrowRight'), B(box.x + box.w - fs, box.y + (box.h - fs) / 2, fs, fs), { color: color, opacity: stateAlpha(S), anchor: 'right' });
    await ctx.settle(); ctx.place(); ctx.refit(0);
    if (S === 'focus') ctx.ring(B(box.x - 2, box.y + 2, ctx.host.width + 4, box.h - 4), { radius: 'xs', offset: 2, width: 2 });
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { fs: fs, radius: 0 }, { family: 'link', size: L.key, state: S, weight: wt });
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
        var segPlate = ctx.plate(seg, { name: 'segment·active', fill: o.dark ? C('ink') : C('surface'),
          fills: S === 'selected' && !o.dark ? CF.fills(C('surface'), 'selected', { overlay: C('primary') }) : null,
          radius: L.radius, shadow: 0 });
        // The active pill is an elevation layer owned by the record, not a typed shadow; a file with a chip recipe
        // gets the physical plate, a file without one stays flat but token-clean (no `shadow_unbound`).
        if (!o.dark && segPlate && storage.EL && storage.EL.has && storage.EL.has('chip')) storage.EL.apply(segPlate, 'chip');
      } else if (S === 'hover' || S === 'pressed') {
        ctx.plate(seg, { name: 'segment·' + (i + 1), fills: CF.fills(null, S) });
      }
      if (o.iconOnly) ctx.glyph(o.glyphs ? o.glyphs[i] : 'grid', seg, { color: on ? (o.dark ? C('surface') : C('ink')) : ((S === 'hover' || S === 'pressed') ? C('ink') : C('muted')), opacity: stateAlpha(S) });
      else ctx.text(String(t), seg, { size: L.fs, color: on ? (o.dark ? C('surface') : C('ink')) : ((S === 'hover' || S === 'pressed') ? C('ink') : C('muted')), weight: on ? 600 : 400,
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
   * outlined/filled/borderless/underlined are four MATERIALS of one geometry — and one corner: `rad` is resolved once
   * from the form step and used by the field plate, its focus ring, its disabled overlay, its add-ons and its
   * steppers. A variant never changes geometry; `focus` is always a real ring layer.
   * o: {variant,size,state,status,lead,trail,clear,value,placeholder,addonBefore,addonAfter,count,readonly,disabled,hit}
   */
  CF.fieldBox = async function (family, o) {
    o = o || {};
    // SOURCE PROFILE (source-adaptation §2): a measured forms entry wins over the generic kit — geometry, material,
    // border and type all come from the reference; the call may still override per-slot. What was drawn is stamped
    // (`nl:prof`) so rule 56 can judge the render against the profile instead of trusting the builder's memory.
    // `sizes[size]` (the gate's per-size block) is read FIRST so one structure serves the draw AND the judgment:
    // the source's measured md step gets its own h/fs while sizes it never measured keep the ladder.
    var prof = CF.profile('forms', family), pp = (prof && prof.size) || {};
    var sz = (prof && prof.sizes && prof.sizes[String(o.size || 'md').toLowerCase()]) || {};
    if (prof && prof.variant && o.variant === undefined) o.variant = prof.variant;
    if (prof && pp.padX !== undefined && o.padX === undefined) o.padX = pp.padX;
    var L = CF.ladder(o.size);
    var fsOf = sz.fs !== undefined ? sz.fs : pp.fs;
    if (fsOf !== undefined && fsOf !== null) L = Object.assign({}, L, { fs: fsOf });
    var variant = o.variant || 'outlined', S = o.state || (o.disabled ? 'disabled' : (o.readonly ? 'readonly' : 'default'));
    if (o.status === 'error' && S === 'default') S = 'error';
    var fv = (prof && prof.variants && prof.variants[variant]) || FIELD[variant] || FIELD.outlined;
    var fh = o.h || (sz.h !== undefined ? sz.h : pp.h) || L.h;
    // ONE CONTROL, ONE CORNER (§5.1). The variant is MATERIAL (fill/stroke); it must never move the geometry — a
    // borderless body drawn `none` under a rounded focus ring / disabled overlay / stepper is one control wearing two
    // shapes (measured 2026-10-26 on page 05: `TimePicker·LG·Borderless` field r0, its ring + disabled-overlay r9999).
    // Fields also do not inherit the button pill: the source's `control` role is `full` for every button, while
    // DESIGN.md pins fields at the form step (`radius.md`). `rad` is the control's corner, every derived layer uses it.
    var rad = o.radius !== undefined ? CF.radius(o.radius)
      : (prof && pp.radius !== undefined ? CF.radius(pp.radius) : CF.fieldRadius());
    var padX = o.padX === undefined ? max(12, L.padX) : o.padX;
    var bW = (prof && prof.border && prof.border.width !== undefined) ? Number(prof.border.width) : 1;
    var bTok = (prof && prof.border && prof.border.token) ? prof.border.token : null;
    var inkTok = (prof && prof.ink) ? prof.ink : 'ink';
    var phTok = (prof && prof.placeholder) ? prof.placeholder : 'muted';
    var focusTok = (prof && prof.focusToken) ? prof.focusToken : 'primary';
    var aB = o.addonBefore ? padX * 2 + CF.estW(String(o.addonBefore), L.fs) : (o.insetLeft ? Number(o.insetLeft) : 0);
    var aA = o.addonAfter ? padX * 2 + CF.estW(String(o.addonAfter), L.fs) : (o.insetRight ? Number(o.insetRight) : 0);
    var fieldW = o.w || 240;
    var totalW = aB + fieldW + aA;
    // Foot area BELOW the plate: the counter and the strength readout are status copy, not field content — inside the
    // plate they sit on the hover/focus wash, where a tone hue drops under its contrast floor.
    var extra = (o.count ? 20 : 0) + (o.footH ? Number(o.footH) : 0);
    var box = B(o.x || 0, o.y || 0, totalW, fh + extra);
    var ctx = CF.build(CF.name(family, { type: variant, size: o.size, state: S, slot: slotName(o) }), box, { parent: o.parent });
    var fb = B(box.x + aB, box.y, fieldW, fh);
    var g = fieldGeom(fb, Object.assign({}, o, { padX: padX }));
    var line = C(bTok || fv.line), lineAlpha = 1, lw = bW || 1;
    if (o.status === 'error') { line = C('error'); lw = variant === 'underlined' ? max(2, bW) : max(1, bW); }
    else if (o.status === 'success') { line = C('success'); }
    else if (o.status === 'warning') { line = C('warning'); }
    if (S === 'hover' && variant === 'outlined' && !bTok) line = C('borderStrong');
    if (S === 'disabled') lineAlpha = 0.4;
    ctx.plate(fb, { name: 'field', fill: C(fv.bg), fills: CF.fills(C(fv.bg), S === 'readonly' ? null : (S === 'error' || S === 'success' || S === 'warning' ? null : S)),
      stroke: (variant === 'underlined' || !lw) ? null : line, strokeW: lw, strokeOpacity: lineAlpha,
      radius: rad });
    if (variant === 'underlined') ctx.plate(B(fb.x, fb.y + fb.h - (S === 'focus' ? max(2, lw) : lw), fb.w, S === 'focus' ? max(2, lw) : lw),
      { name: S === 'focus' ? 'underline·focus' : 'underline', fill: S === 'focus' ? C(focusTok) : line, opacity: lineAlpha });
    if (S === 'disabled') ctx.plate(fb, { name: 'disabled-overlay', fills: [{ fillColor: C('ink'), fillOpacity: CF.STATE.disabledContainer }], radius: rad });
    [o.addonBefore ? B(box.x, box.y, aB, fh) : null, o.addonAfter ? B(box.x + aB + fieldW, box.y, aA, fh) : null].forEach(function (ab, i) {
      if (!ab) return;
      ctx.plate(ab, { name: i ? 'addon·after' : 'addon·before', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1,
        radius: rad });
      ctx.text(String(i ? o.addonAfter : o.addonBefore), ab, { size: L.fs, color: C('muted') });
    });
    var txt = o.value === undefined ? (o.placeholder === undefined ? null : o.placeholder) : String(o.value);
    var vt = null;
    if (txt !== null) {
      var isPh = o.value === undefined;
      vt = ctx.text(txt, g.text, { size: L.fs, color: isPh ? C(phTok) : (o.status === 'error' ? C('error') : C(inkTok)),
        opacity: isPh ? (S === 'disabled' ? CF.STATE.disabledContent : 0.75) : stateAlpha(S === 'disabled' ? 'disabled' : null), align: o.align || 'left', valign: o.valign || 'middle' });
    }
    if (o.caret) ctx.plate(B(g.text.x + (o.value ? CF.estW(String(o.value), L.fs) : 0), fb.y + (fh - L.fs * 1.25) / 2, 1.5, N(L.fs * 1.25)), { name: 'caret', fill: C(focusTok) });
    if (g.lead) ctx.glyph(iconOf(o.lead, 'search'), g.lead, { color: o.status === 'error' ? C('error') : C('muted'), opacity: stateAlpha(S === 'disabled' ? 'disabled' : null) });
    if (g.trail) ctx.glyph(iconOf(o.trail, 'info'), g.trail, { color: C('muted') });
    if (g.clear && (S === 'focus' || S === 'hover' || o.value !== undefined)) ctx.glyph('close', g.clear, { color: C('muted'), name: 'icon·clear' });
    if (g.suffix) ctx.text(String(o.suffix), g.suffix, { size: L.fs, color: C('muted'), align: 'right' });
    if (o.count) {
      var over = Number(o.count.v) > Number(o.count.max);
      ctx.text(o.count.v + ' / ' + o.count.max, B(box.x, box.y + fh + 4, box.w, 16), { size: 12, color: over ? C('error') : C('muted'), align: 'right', valign: 'top' });
    }
    await ctx.settle(); ctx.place();
    // The control HOST carries the corner too. It is a transparent wrapper today, but an expanded state layer that
    // traces the host (NumberField's focus ring) reads it, and a r0 host under a rounded ring is the same mixture one
    // level up — `TK.roleSweep` resolves a ring to a BOARD host when it is concentric with it.
    try { ctx.host.borderRadius = rad; } catch (e) {}
    // MULTI-LINE VALUE: a textarea's copy is wrapped at the FIELD's content width, never left auto-width. An
    // auto-width text grows to its one-line width and overflows the plate (measured 2026-10-26: a 43-char value was
    // 259px wide in a 240px field, 31px outside; the same failure hits placeholders and long values). The host's
    // height already reserves rows; the text re-flows inside it.
    if (o.wrap && vt && vt.t) {
      try {
        vt.t.resize(g.text.w, Math.max(8, vt.t.height));
        vt.t.growType = 'auto-height';
        vt.t.verticalAlign = 'top';
        penpotUtils.setParentXY(vt.t, g.text.x - ctx.host.x, g.text.y - ctx.host.y);
      } catch (e) {}
    }
    if (S === 'focus' && variant !== 'underlined') ctx.ring(fb, { radius: rad });
    if (o.hit) ctx.hitPad(fb, o.hit);
    CF.profStamp(ctx.host, prof, { h: fh, padX: padX, fs: L.fs, radius: rad,
      stroke: variant === 'underlined' ? 0 : (bW || 0),
      fill: fv.bg || 'transparent', variant: variant }, { family: String(family).toLowerCase(), size: L.key, state: S, elevation: (prof && prof.elevation) || null });
    if (prof && prof.elevation && storage.EL && storage.EL.has && storage.EL.has(prof.elevation)) storage.EL.apply(ctx.host, prof.elevation);
    return { ctx: ctx, host: ctx.host, geom: g, field: fb, box: box, L: L, state: S, radius: rad };
  };
  CF.input = async function (o) { var r = await CF.fieldBox('Input', o); return r.host; };

  /** Multi-line field: min-h = rows × lineHeight + pad-Y, resize handle, counter below (never inside the scroll area). */
  CF.textarea = async function (o) {
    o = o || {};
    var tp = CF.profile('forms', 'textarea'), tpp = (tp && tp.size) || {};
    var L = CF.ladder(o.size);
    if (tp && tpp.fs) L = Object.assign({}, L, { fs: tpp.fs });
    var rows = o.rows || 3, lh = N(L.fs * 1.45), padY = tpp.padY !== undefined ? Number(tpp.padY) : 8;
    var h = o.h || tpp.h || (rows * lh + padY * 2);
    var r = await CF.fieldBox('Textarea', Object.assign({}, o, { h: h, valign: 'top', align: 'left', trail: o.trail || false, wrap: true }));
    if (o.resize !== 'none' && !(tp && tp.resize === false)) {
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
      // An attached action is part of the FIELD composition, so it wears the field's corner, not the button pill.
      ctx.plate(btn, { name: 'button·primary', fill: C('primary'), radius: r.radius });
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
    var n = o.length || 6, bw = o.boxW || 44, bh = o.boxH || 52, gap = o.gap || 12, groupAfter = o.grouped === false ? 0 : 3;
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
      // The expanded focus ring traces the HOST, so the host must carry the CONTROL corner — and the attached
      // steppers are frame parts of the same control, so they take it too (the field's resolved `r.radius`, which is
      // the form step; `L.radius` is the button pill and put r9999 steppers beside an r0 borderless field on page 05).
      try { r.host.borderRadius = CF.radius(r.radius); } catch (e) {}
      var dn = B(f.x - btnW, f.y, btnW, f.h), up = B(f.x + f.w, f.y, btnW, f.h);
      [[dn, 'minus', v <= minv], [up, 'plus', v >= maxv]].forEach(function (t) {
        ctx.plate(t[0], { name: 'stepper', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1, radius: r.radius });
        ctx.glyph(t[1], CF.iconBox(t[0], 20), { color: t[2] ? C('muted') : C('ink'), opacity: t[2] ? CF.STATE.disabledContent : 1, strokeW: 1.7 });
      });
    } else {
      var gh = B(f.x + f.w - 12 - 16, f.y + f.h / 2 - 16, 16, 16);
      ctx.glyph('chevronUp', gh, { color: C('muted') });
      ctx.glyph('chevronDown', B(gh.x, gh.y + 16, gh.w, gh.h), { color: v <= minv ? C('muted') : C('muted'), opacity: v <= minv ? CF.STATE.disabledContent : 1 });
    }
    await ctx.settle(); ctx.place();
    // A focus ring traces the CONTROL the user sees, not just its input segment: attached steppers abut the field's
    // edge and their 1px strokes cover an input-only ring's L/R border (measured 2026-10-26 on all three Focus
    // hosts). Expand the ring to the whole host box so it encloses the steppers instead of colliding with them.
    if (r.state === 'focus' && attached) {
      var ring = (r.host.children || []).filter(function (c) { return /^ring·/.test(String(c.name)); })[0];
      if (ring) {
        try { penpotUtils.setParentXY(ring, r.box.x - 2 - r.host.x, r.box.y - 2 - r.host.y); ring.resize(r.box.w + 4, r.box.h + 4); } catch (e) {}
      }
    }
    return ctx.host;
  };

  // ---- dropdown panel shared by select / combobox / date / menu / multi-select
  function panelPlate(ctx, box, o) {
    var p = ctx.plate(box, { name: o.name || 'panel', fill: C('surface'), radius: CF.radius('md'), shadow: o.shadow === undefined ? 3 : o.shadow, stroke: o.outline ? C('border') : null, strokeW: 1 });
    // A dropdown panel is an overlay material: use the declared elevation recipe (drop + inset, token-bound) instead of
    // the factory's typed single-layer `shadow:3`, which G18 rejects as `shadow_unbound` (30 panels on page 05).
    try { if (o.elevation !== false && storage.EL && storage.EL.seeded && storage.EL.apply) storage.EL.apply(p, o.elevation || 'panel'); } catch (e) {}
    return p;
  }
  function optionRow(ctx, r, o) {
    var L = CF.ladder(o.size || 'md'), padX = 12, icon = L.icon;
    if (o.group) { ctx.text(String(o.label).toUpperCase(), B(r.x + padX, r.y, r.w - padX * 2, r.h), { size: 11, role: 'overline', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false }); return; }
    // ONE SELECTED ROW, ONE STYLE. A single-select list may have a selected row and a keyboard/pointer-active row
    // at the same time, but they are different states: selected = brand wash + check; active/hover = NEUTRAL wash.
    // Both were brand 12% before, so every TimePicker read as two selected items (measured 2026-10-26). The active
    // plate is skipped when the same row is selected (selection wins). The row corner is the nested step passed by
    // optionList (panel radius − 4px inset), not an arbitrary `xs`.
    var rowR = o.radius === undefined ? 'xs' : o.radius;
    if (o.active && !o.selected) ctx.plate(r, { name: 'row·tint', fills: CF.fills(null, 'hover'), radius: rowR });
    if (o.selected) ctx.plate(r, { name: 'row·selected', fills: CF.fills(C('primary'), 'selected', { tint: 1 }), radius: rowR });
    if (o.hover && !o.selected && !o.active) ctx.plate(r, { name: 'row·hover', fills: CF.fills(null, 'hover'), radius: rowR });
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
    // Rows are inset 4 from the panel; the largest legal nested corner is the largest declared step ≤ panelR − 4.
    // Using `xs` (4) inside a r12 panel made the selected/hover row read as a different component.
    var panelR = o.radius === undefined ? CF.radius('md') : o.radius;
    var rowR = CF.radiusDown(panelR - 4);
    var y = box.y + 4, n = 0;
    rows.forEach(function (r) {
      var h = r.group ? 24 : rowH;
      optionRow(ctx, B(box.x + 4, y, box.w - 8, h), Object.assign({ size: o.size, radius: rowR }, r));
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
    // The field VALUE is not a list row: keep it off the option labels' x column by a 4px inset, otherwise the
    // list_gap_split rule reads value→option as a 34px gap in an otherwise 16px list and fails the panel
    // (measured 2026-10-26: 20 findings on Combobox/TimePicker). The inset is invisible at field scale.
    if (o.open) {
      try {
        var vt = (host.children || []).filter(function (c) { return c.type === 'text'; })[0];
        if (vt) penpotUtils.setParentXY(vt, Math.round(vt.parentX) - 4, Math.round(vt.parentY));
      } catch (e) {}
    }
    var pbox = B(f.x, f.y + f.h + 4, pw, ph);
    // Growth is a SIZE, not a world coordinate: `pbox.bottom - host.bottom` (the DatePicker form). Reading it as
    // `panelTop + panelHeight - hostHeight` inflates every open panel by however far down the page the cell sits.
    var nb = N(pbox.x + pbox.w - (host.x + host.width));
    var hb = N(pbox.y + pbox.h - (host.y + host.height));
    if (nb > 0 || hb > 0) { host.resize(N(host.width + max(0, nb)), N(host.height + max(0, hb))); base.box = B(host.x, host.y, host.width, host.height); }
    var panelRadius = CF.radius('md'), listRadius = CF.radiusDown(panelRadius - 4);
    panelPlate(ctx, pbox, {});
    if (o.search) ctx.plate(B(pbox.x + 4, pbox.y + 4, pbox.w - 8, 32), { name: 'panel·search', fill: C('surfaceAlt'), radius: listRadius });
    var y0 = pbox.y + 4 + (o.search ? 40 : 4);
    var avail = pbox.h - (y0 - pbox.y) - 4;
    var rows = opts.map(function (r) { return typeof r === 'string' ? { label: r } : r; });
    if (o.maxRows && rows.length > o.maxRows) rows = rows.slice(0, o.maxRows);   // a capped panel scrolls; it never spills
    var res = await CF.optionList(ctx, B(pbox.x, y0, pbox.w, avail), rows, { size: o.size, rowH: rowH, radius: panelRadius });
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
    var comb = await CF.select(Object.assign({ open: true, options: rows, trail: 'caretDown' }, o, { }));
    // A family composite owns its host NAME: without this the Combobox spec drew a raw `Select·…` host, which the
    // library already holds as a master, so the catalog could not register it (spec_unregistered on every state).
    try { if (comb) comb.name = CF.name('Combobox', { size: o.size, state: o.state || 'default', slot: 'Open' }); } catch (e) {}
    return comb;
  };

  /** Multi-select with chips inside the field; chips wrap so the field grows, +N overflow chip, per-chip ✕. */
  CF.multiSelect = async function (o) {
    o = o || {};
    var L = CF.ladder(o.size), maxTag = o.maxTagCount;
    // The chips ARE the value. `o.value` from CAT.PLAN ("Design, Product") is the chip source; it must not also be
    // painted as a plain field value — the fieldBox merge (`Object.assign({value:undefined}, o)`) put it back and the
    // value text ran through the chips (measured 2026-10-26: 15 text_overlap findings on page 05).
    var vals = o.values || (o.value !== undefined ? String(o.value).split(/\s*,\s*/).filter(Boolean) : ['Design', 'Research']);
    var overflow = 0;
    if (maxTag !== undefined && vals.length > maxTag) { overflow = vals.length - maxTag; vals = vals.slice(0, maxTag); }
    // THE CHIPS ARE CHIP COMPONENTS. A composite control composes the atom; redrawing a pill + label + ✕ as three
    // loose siblings is exactly what the selected MultiSelect master did (measured 2026-10-26). When the Chip atom
    // master exists, every tag is a real copy; the raw path below is a reported fallback for a file whose Chip family
    // has not been built yet (rule 65 `nested_control_raw` fails it on acceptance).
    var chipH = min(24, L.h - 8), chipGap = 4, rowsN = 1;
    var chipMaster = CF.get('Chip·Input·SM·Clear·Neutral') || CF.get('Chip');
    if (!chipMaster) { try { console.warn('CF.multiSelect: no Chip·Input·SM·Clear·Neutral master — inner chips are raw; build the Chip atom before this composite'); } catch (e) {} }
    var chipW = function (v) {
      return chipMaster ? CF.chipWidth(v) : (CF.estW(v, L.fs - 1) + (v[0] === '+' ? 12 : (o.removable === false ? 16 : 16 + L.icon + 4)));
    };
    var fieldW = o.w || 300, usable = fieldW - 24 - (L.icon + 8);
    var xs = [], x = 0;
    vals.concat(overflow ? ['+' + overflow] : []).forEach(function (v) {
      var cw = chipW(v);
      if (x + cw > usable) { rowsN++; x = 0; }
      xs.push({ v: v, x: x, w: cw, row: rowsN - 1 }); x += cw + chipGap;
    });
    // The BLOCK is the chips + the gaps BETWEEN them. Counting a trailing gap (the old `rowsN*(chipH+4)`) centred the
    // block two pixels high: MD field 36, chip 24 → top 4 / bottom 8 instead of 6/6 (the user's “上少下多”).
    var blockH = rowsN * chipH + (rowsN - 1) * chipGap;
    var fh = max(L.h, blockH + 12);
    // The placeholder is the empty-field affordance: with chips already inside, fieldBox's left-aligned placeholder
    // painted straight through them (audit_layout text_overlap).
    var baseOpts = Object.assign({ h: fh, value: undefined, placeholder: vals.length ? null : (o.placeholder || 'Add tags…'), trail: 'caretDown' }, o);
    baseOpts.value = undefined;   // chips carry the content; the field shows no duplicate run
    var base = await CF.fieldBox('MultiSelect', baseOpts);
    var ctx = base.ctx, f = base.field;
    var yOff = (f.h - blockH) / 2;
    xs.forEach(function (c) {
      var cb = B(f.x + 12 + c.x, f.y + yOff + c.row * (chipH + chipGap), c.w, chipH);
      var isMore = c.v[0] === '+';
      var inst = null;
      if (chipMaster) {
        var r = CF.instance(chipMaster.name, { parent: ctx.host, absolute: { x: cb.x, y: cb.y }, text: c.v });
        if (r && r.ok) {
          inst = r.inst;
          try { inst.name = isMore ? 'chip·overflow' : 'chip'; } catch (e) {}
          CF.chipFit(inst, c.v, { w: c.w, h: chipH });
          try { inst.resize(N(c.w), N(chipH)); } catch (e) {}
        }
      }
      if (!inst) {
        // Reported fallback (see the head of this block): a file without a Chip atom still renders, and rule 65 fails it.
        ctx.plate(cb, { name: isMore ? 'chip·overflow' : 'chip', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1, radius: 'control' });
        var inset = !isMore && o.removable !== false;
        ctx.text(c.v, B(inset ? cb.x + 4 : cb.x, cb.y, inset ? cb.w - 18 : cb.w, cb.h), { size: L.fs - 1, color: C('ink') });
        if (!isMore && o.removable !== false) ctx.glyph('close', B(cb.x + cb.w - 16, cb.y + (cb.h - 12) / 2, 12, 12), { color: C('muted'), strokeW: 1.5 });
      }
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
      // The OK plate carries white copy, so it takes the tone's INK step (white on the hue is 3.56:1).
      ctx.plate(okb, { name: 'button·ok', fill: C('primaryInk'), radius: L.radius });
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
      ctx.plate(ok2, { name: 'button·ok', fill: C('primaryInk'), radius: L.radius });
      ctx.text('OK', ok2, { size: 13, color: C('onPrimary'), weight: 500 });
    }
    await ctx.settle(); ctx.place();
    return host;
  };

  /** Time-of-day column list is the datetime mode of the same panel. */
  CF.timePicker = async function (o) {
    o = o || {};
    var rows = [];
    var sel = o.selected || 0, hov = o.hover === undefined ? 1 : o.hover;
    // A single-select time list has ONE selected row. The hovered/active row is a separate, neutral state and is
    // shown only in the Hover variant (or when a caller passes an explicit `active`); painting it brand made the
    // Default/Focus/Disabled specs look like they had two selected items (measured 2026-10-26).
    var active = o.active !== undefined ? o.active : (String(o.state || 'default') === 'hover' ? hov : null);
    for (var h = 0; h < (o.hourly ? 24 : 6); h++) rows.push({ label: (o.hourly ? (h < 10 ? '0' + h : h) : (h + 8)) + ':00', selected: h === sel, active: active !== null && h === active && h !== sel });
    var tp = await CF.select(Object.assign({ open: true, options: rows, panelW: o.panelW || 160, trail: 'clock', w: o.w || 160 }, o));
    try { if (tp) tp.name = CF.name('TimePicker', { size: o.size, state: o.state || 'default', slot: 'Open' }); } catch (e) {}
    return tp;
  };

  /** Form-field wrapper: label above (or beside at 240-280), 6-8 gap, control, helper/error 4 below — uses LY.slots.field. */
  CF.field = async function (o) {
    o = o || {};
    // The wrapper is part of the same profile: the reference measures the label (size/weight/gap above the field) as
    // much as the field itself, and a floating-label source must not be drawn with the generic 13/500 label at 6px.
    var fp = CF.profile('forms', o.factory || 'input'), fpp = (fp && fp.size) || {}, lp = (fp && fp.label) || {};
    var L = CF.ladder(o.size || 'md');
    if (fp && fpp.fs) L = Object.assign({}, L, { fs: fpp.fs });
    var ctlH = o.h || fpp.h || L.h;
    var label = String(o.label === undefined ? 'Field label' : o.label);
    var labFs = lp.fs || 13, labW = lp.weight || 500, labTok = lp.ink || 'ink';
    var helper = o.error ? String(o.error) : (o.success ? String(o.success) : (o.helper ? String(o.helper) : null));
    var beside = o.labelPlacement === 'beside';
    var labelH = beside ? 0 : (lp.h || 20), helpH = helper ? 18 : 0, gap = lp.gap !== undefined ? Number(lp.gap) : 6;
    var total = ctlH + labelH + helpH + (labelH ? gap : 0) + (helpH ? 4 : 0);
    var box = B(o.x || 0, o.y || 0, o.w || max(240, CF.estW(label, labFs) + 24), total);
    // §G12: the icon/addon/counter slots below the label are the *field's* slots — the sub-control inherits them, so
    // the wrapper host must carry them in its own name or `variant_sparse` reads a composed Field as one flat variant.
    var slot = [beside ? 'LabelBeside' : null, slotName(o)].filter(Boolean).join('-') || null;
    var ctx = CF.build(CF.name('Field', { state: o.error ? 'Error' : (o.success ? 'Success' : (o.state || 'default')), slot: slot }), box, { parent: o.parent });
    var labBox = beside ? B(box.x, box.y, min(280, box.w * 0.3), ctlH) : B(box.x, box.y, box.w, labelH);
    var labAl = (o.state === 'disabled') ? CF.STATE.disabledContent : 1;
    ctx.text(label, labBox, { size: labFs, color: C(o.state === 'disabled' ? 'muted' : labTok), weight: labW, opacity: labAl,
      align: beside ? 'right' : 'left', valign: beside ? 'middle' : 'top', refit: false });
    if (o.required) ctx.text('*', B(labBox.x + (beside ? labBox.w + 4 : CF.estW(label, labFs) + 4), beside ? labBox.y : box.y, 12, labBox.h),
      { size: labFs, color: C('error'), opacity: labAl, align: 'left', valign: beside ? 'middle' : 'top', refit: false });
    var ctlBox = beside ? B(labBox.x + labBox.w + 24, box.y, box.w - labBox.w - 24, ctlH) : B(box.x, box.y + labelH + gap, min(o.controlW || 360, box.w), ctlH);
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
    // A switch is the clearest example of a family the generic kit gets structurally wrong on a recreation: the generic
    // track is a 44×22 pill with a 2px-inset knob, while a source can measure a track several times that with a knob the
    // same proportion, a fixed inset lip and a gradient ON state. Everything below is generic — the numbers come from
    // `profiles.selection.switch`, and a file with no profile keeps the AntD/M3 presets.
    var prof = CF.profile('selection', 'switch');
    var sm = o.size === 'sm';
    // The profile's own size ladder wins: `selection.switch.sizes.sm` measured 46/26/24 while the factory read only
    // the flat `size` block (58/32/30), so every SM cell drew the MD track (12 drift findings, 2026-10-27).
    var PSZ = (prof && prof.sizes && prof.sizes[String(o.size || 'md').toLowerCase()]) || {};
    var TR = (prof && (sm ? (prof.trackSm || prof.track) : prof.track)) || {};
    var HS = (prof && prof.handle) || {};
    // The source-adaptation profile measures the track in a flat `size` block (trackW/trackH/handle/inset): the factory
    // used to read only `track:{w,h}` + `handle:{size}` and shipped the 44×22 kit against an expect of 58×32.
    var PS = (prof && prof.size) || {};
    var m3 = !prof && o.system === 'm3';
    var tw = o.trackW || PSZ.trackW || TR.w || PS.trackW || (m3 ? (sm ? 44 : 52) : (sm ? 28 : 44));
    var th = o.trackH || PSZ.trackH || TR.h || PS.trackH || (m3 ? (sm ? 24 : 32) : (sm ? 16 : 22));
    var on = !!o.checked, S = o.state || 'default';
    var pressed = S === 'pressed';
    var hw = o.handleSize || PSZ.handle || HS.size || PS.handle || (m3 ? (on ? (pressed ? 28 : 24) : 16) : (pressed ? th - 2 : th - 4));
    var inset = HS.inset !== undefined ? Number(HS.inset) : (PS.inset !== undefined ? Number(PS.inset) : (m3 ? 4 : 2));
    var labelFs = (prof && prof.label && prof.label.fs) || 14;
    var box = B(o.x || 0, o.y || 0, tw + (o.label ? CF.labelW(o.label, labelFs) : 0), max(th, 20));
    var swSlot = [on ? 'On' : 'Off', slotName({ lead: o.innerIcon ? true : null, loading: o.loading }), o.label ? 'Label' : null].filter(Boolean).join('-');
    var ctx = CF.build(CF.name('Switch', { size: sm ? 'Sm' : 'Md', state: S, slot: swSlot }), box, { parent: o.parent });
    var tr = B(box.x, box.y + (box.h - th) / 2, tw, th);
    ctx.hitPad(tr, o.hit || (m3 ? 40 : 32));                    // bottom-most: the 40dp state layer / touch target
    // A switch track is a pill by role; the profile may pin that step at the family level (`selection.switch.radius`)
    // rather than inside `track` — reading only TR.radius left a re-seeded session with an r8 rounded rectangle and
    // an r8 focus ring that could not wrap it (measured 2026-10-26).
    var rad = TR.radius !== undefined ? CF.radius(TR.radius)
      : ((prof && prof.radius !== undefined) ? CF.radius(prof.radius) : CF.radius('control'));
    var fillPr = (prof && prof.fill) || {};
    var tfill = on ? C(fillPr.on || 'primary') : C(fillPr.off || (m3 ? 'surface' : 'ink'));
    var grad = on && fillPr.onGradient && fillPr.onGradient.length >= 2 ? fillPr.onGradient : null;
    var tf = grad
      ? CF.gradFill(grad, { opacity: S === 'disabled' ? CF.STATE.disabledContent : 1 })
      : [{ fillColor: tfill, fillOpacity: (on || prof) ? 1 : (m3 ? 1 : 0.28) }];
    // A source that measures only default/checked does not license an invented hover wash: the profile opts out.
    var wash = !prof || prof.wash === true;
    var ov = (S === 'disabled') ? CF.STATE.disabledContainer : ((wash && (S === 'hover' || S === 'pressed' || S === 'selected')) ? CF.STATE[S] : 0);
    if (ov) tf.push({ fillColor: on ? '#FFFFFF' : C('ink'), fillOpacity: ov });
    var tplate = ctx.plate(tr, { name: 'track', radius: rad, fills: tf });
    if (!on && m3 && !prof) ctx._stroke(tplate, C('borderStrong'), 2);
    if (TR.stroke && prof) ctx._stroke(tplate, C(TR.stroke), Number(TR.strokeWidth || 1));
    var hx = on ? tr.x + tr.w - hw - inset : tr.x + inset;
    var hy = tr.y + (tr.h - hw) / 2;
    var handle = ctx.ellipse(B(hx, hy, hw, hw), { name: 'handle',
      fill: on ? C(HS.fillOn || 'onPrimary') : C(HS.fillOff || (m3 ? 'ink' : 'surface')),
      opacity: stateAlpha(S), shadow: prof ? 0 : (m3 ? 0 : 1) });
    if (HS.elevation && storage.EL && storage.EL.has && storage.EL.has(HS.elevation)) storage.EL.apply(handle, HS.elevation);
    var elev = prof && prof.elevation;
    var elevName = elev && typeof elev === 'object' ? (on ? elev.on : elev.off) : (elev || null);
    if (elevName && storage.EL && storage.EL.has && storage.EL.has(elevName)) storage.EL.apply(tplate, elevName);
    if (o.innerIcon && on) ctx.glyph('check', B(hx, hy, hw, hw), { color: C('primary'), strokeW: 2 });
    if (o.loading) CF.spinner(ctx, B(hx, hy, hw, hw), on ? C('primary') : C('muted'), 2);
    if (o.label) ctx.text(String(o.label), B(tr.x + tr.w + 8, box.y, box.w - tr.w - 8, box.h),
      { size: labelFs, color: S === 'disabled' ? C('muted') : C((prof && prof.label && prof.label.ink) || 'ink'), opacity: stateAlpha(S), align: 'left', valign: 'middle' });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(tr, { radius: rad, offset: prof ? 0 : 2, color: prof ? C(on ? (prof.focusTokenOn || 'ink') : (prof.focusToken || 'primary')) : undefined });
    CF.profStamp(ctx.host, prof, { trackW: tw, trackH: th, radius: rad, handle: hw, inset: inset },
      { family: 'switch', size: sm ? 'sm' : 'md', on: on, state: S, elevation: elevName || null,
        fill: on ? (fillPr.on || (grad ? 'gradient' : 'primary')) : (fillPr.off || (m3 ? 'surface' : 'ink')) });
    return ctx.host;
  };

  /** Checkbox: box 18-20 radius 3-4 border 2, check stroke 2, indeterminate bar, 40×40 state layer, select-all header. */
  CF.checkbox = async function (o) {
    o = o || {};
    var prof = CF.profile('selection', 'checkbox'), pp = (prof && prof.size) || {};
    var bs = o.boxSize || pp.box || 18, S = o.state || 'default', on = o.indeterminate ? 'mixed' : (o.checked ? 'on' : 'off');
    var cfs = pp.fs || 14;
    var labelW = o.label === undefined ? 0 : CF.labelW(o.label, cfs);
    // The label's rendered line is taller than the 18px box (14px type → 21px line): sizing the host to max(bs,20)
    // clipped the label's bottom 2px out of the host — the large-height-overlap class, seen by auditPage as out_of_bounds.
    var lh = o.label ? CF.lineH(cfs) : 0;
    var box = B(o.x || 0, o.y || 0, max(bs + labelW, bs), o.h || max(bs, 20, lh));
    // A label is a slot, not a decoration: a bare Checkbox master has no text child, and a component copy refuses
    // structural edits. Naming the labelled composition `…·Label` gives it its own master, so instances can carry copy.
    var cbsSlot = [on === 'mixed' ? 'Indeterminate' : (on === 'on' ? 'Checked' : null), o.label ? 'Label' : null].filter(Boolean).join('-');
    var ctx = CF.build(CF.name('Checkbox', { size: o.size, state: S, slot: cbsSlot }), box, { parent: o.parent });
    var bb = B(box.x, box.y + (box.h - bs) / 2, bs, bs);
    // The box's MATERIAL is the profile's: a source checkbox is a 24px white square with a 1px `line` border that fills
    // black when checked, not the kit's 18px r3 with a 2px primary stroke. `fillOn`/`border`/`borderWidth`/`radius`
    // come from the measured entry; with no profile the generic kit keeps its own steps.
    var cFill = (prof && (on === 'off' ? (prof.fill || 'surface') : (prof.fillOn || 'primary'))) || (on === 'off' ? 'surface' : (S === 'disabled' ? 'ink' : 'primary'));
    var cLine = (prof && prof.border) ? C(prof.border) : (on === 'off' ? (S === 'disabled' ? C('ink') : C('borderStrong')) : null);
    var cLW = prof && prof.borderWidth !== undefined ? Number(prof.borderWidth) : 2;
    var cRad = pp.radius !== undefined ? CF.radius(pp.radius) : 'xxs';
    if (S === 'hover' || S === 'focus' || o.layer) ctx.plate(B(bb.x - (40 - bs) / 2, bb.y - (40 - bs) / 2, 40, 40), { name: 'state·layer', fills: CF.fills(null, S === 'hover' ? 'hover' : 'focus'), radius: 'control' });
    ctx.plate(bb, { name: 'box', fill: C(cFill),
      fills: CF.fills(C(cFill), on === 'off' ? (S === 'hover' ? 'hover' : null) : (S === 'disabled' ? 'disabled' : null), { onDark: on !== 'off' }),
      stroke: on === 'off' ? cLine : null, strokeW: cLW, radius: cRad, strokeOpacity: 1 });
    if (on === 'off' && !prof) ctx._stroke(ctx.host.children[ctx.host.children.length - 1], o.checked ? C('primary') : C('borderStrong'), 2);
    if (on === 'off' && prof && cLine) ctx._stroke(ctx.host.children[ctx.host.children.length - 1], cLine, cLW);
    if (o.checked || o.indeterminate) {
      var mInk = (prof && prof.markInk) || 'onDark';
      if (o.indeterminate) ctx.plate(B(bb.x + 3, bb.y + bs / 2 - 1, bs - 6, 2.5), { name: 'dash', fill: C(mInk), radius: 'xs' });
      else ctx.glyph('check', B(bb.x - 2, bb.y - 2, bs + 4, bs + 4), { color: C(mInk), strokeW: max(2, bs * 0.16) });
    }
    if (o.label) ctx.text(String(o.label), B(bb.x + bs + 8, box.y, labelW, box.h), { size: cfs, color: C((prof && prof.ink) || 'ink'), opacity: stateAlpha(S), align: 'left' });
    await ctx.settle(); ctx.place();
    // A checkbox is a small visible box: the ring is FLUSH on it (offset 0, box corner), never a 22×22 halo
    // around an 18×18 r8 box — the halo is not parallel at the corners and reads as a gap.
    if (S === 'focus') ctx.ring(bb, { radius: cRad, offset: 0, color: on === 'off' ? C(prof && prof.focusToken || 'primary') : C('onDark') });
    ctx.hitPad(bb, o.hit || 32);
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { box: bs, radius: CF.radius(cRad), border: on === 'off' ? cLW : 0 },
      { family: 'checkbox', variant: on === 'on' ? 'checked' : (on === 'mixed' ? 'indeterminate' : 'unchecked'), state: S, checked: on });
    return ctx.host;
  };

  /** Radio: ring 20 + dot 10-12; asButton = segment; card = full card with 2px accent border when selected. */
  CF.radio = async function (o) {
    o = o || {};
    var S = o.state || 'default', on = !!o.checked;
    if (o.asButton) return CF.segmented({ x: o.x, y: o.y, size: o.size, items: o.options || ['A', 'B', 'C'], active: o.checkedIndex || 0, state: S, parent: o.parent, itemW: o.itemW });
    if (o.card) return CF.card(Object.assign({ x: o.x, y: o.y, w: o.w || 240, h: o.h || 96, selectable: true, checked: on, state: S, parent: o.parent,
      title: o.title || 'Card option', body: o.meta || 'Supporting line, one line, ellipsised' }));
    var prof = CF.profile('selection', 'radio'), pp = (prof && prof.size) || {};
    var rs = o.ring || pp.ring || 20, rfs = pp.fs || 14;
    var labelW = o.label === undefined ? 0 : CF.labelW(o.label, rfs);
    var box = B(o.x || 0, o.y || 0, max(rs + labelW, rs), o.h || 24);
    var rdoSlot = [on ? 'Checked' : null, o.label ? 'Label' : null].filter(Boolean).join('-') || null;
    var ctx = CF.build(CF.name('Radio', { state: S, slot: rdoSlot }), box, { parent: o.parent });
    var rb = B(box.x, box.y + (box.h - rs) / 2, rs, rs);
    if (S === 'hover' || S === 'focus') ctx.plate(B(rb.x - (40 - rs) / 2, rb.y - (40 - rs) / 2, 40, 40), { name: 'state·layer', fills: CF.fills(null, S === 'hover' ? 'hover' : 'focus'), radius: 'full' });
    // The radio's ring weight and dot size are the profile's: the source draws a hairline ring with a solid dot,
    // the kit a 2px primary ring — a source without a radio rule keeps the generic one (derived material).
    var rLine = on ? C((prof && prof.ringInk) || 'primary') : (S === 'disabled' ? C('muted') : C((prof && prof.border) || 'borderStrong'));
    var rLW = Number(prof && prof.ringWidth !== undefined ? prof.ringWidth : (on ? 2 : 1.5));
    var dotD = pp.dot || 10;
    ctx.ellipse(rb, { name: 'ring', fill: C((prof && prof.fill) || 'surface'), stroke: rLine, strokeW: rLW });
    if (on) ctx.ellipse(B(rb.x + (rs - dotD) / 2, rb.y + (rs - dotD) / 2, dotD, dotD), { name: 'dot', fill: S === 'disabled' ? C('muted') : C((prof && prof.ringInk) || 'primary') });
    if (o.label) ctx.text(String(o.label), B(rb.x + rs + 8, box.y, labelW, box.h), { size: rfs, color: C((prof && prof.ink) || 'ink'), opacity: stateAlpha(S), align: 'left' });
    await ctx.settle(); ctx.place();
    // A RADIO IS A CIRCLE: its focus ring must be a circle too. `'control'` is the button/pill role, and after a
    // re-seed without the profile roles it became r8 — a rounded-square outline around the 20px disc (measured
    // 2026-10-26 on `Radio·Focus·Checked`: ring 24×24 r0). The visible disc is an ellipse, so its outline is `full`.
    if (S === 'focus') ctx.ring(rb, { radius: 'full' });
    ctx.hitPad(rb, o.hit || 32);
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { ring: rs, dot: dotD, border: rLW },
      { family: 'radio', variant: on ? 'checked' : 'unchecked', state: S, checked: on });
    return ctx.host;
  };

  /** Slider: track 4-6, handle 20 (+40 state layer), marks 2px ticks + 11px labels, range = two handles, value label on drag. */
  CF.slider = async function (o) {
    o = o || {};
    var prof = CF.profile('selection', 'slider'), pp = (prof && prof.size) || {};
    var vert = o.direction === 'vertical';
    var len = (vert ? o.h || 200 : o.w || 240), th = o.trackH || pp.track || 4, hs = o.handle || pp.handle || 20;
    var lo = o.min === undefined ? 0 : Number(o.min), hi = o.max === undefined ? 100 : Number(o.max);
    // A range slider's value is an ARRAY (`[20, 80]`); Number([20,80]) is NaN and every derived coordinate became
    // NaN, so the whole row's cells were rolled back (measured 2026-10-26 on Slider·Spec row "Range"). A typed
    // o.from/o.to pair stays supported; the array is the canonical shape from CAT.PLAN.
    var vRaw = o.value, v2Raw = o.value2;
    if (Array.isArray(vRaw) && o.range) { v2Raw = vRaw[1]; vRaw = vRaw[0]; }
    if (o.from !== undefined) vRaw = o.from;
    if (o.to !== undefined) v2Raw = o.to;
    var raw2 = v2Raw === undefined ? lo + (hi - lo) * 0.7 : Number(v2Raw);
    var raw = vRaw === undefined ? lo + (hi - lo) * 0.4 : Number(vRaw);
    if (!isFinite(raw)) raw = lo + (hi - lo) * 0.4;
    if (!isFinite(raw2)) raw2 = lo + (hi - lo) * 0.7;
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
    var trkInk = (prof && prof.trackInk) || 'ink', trkOp = prof && prof.trackOpacity !== undefined ? Number(prof.trackOpacity) : 0.12;
    // The rail is a pill by role; the profile may pin it at the family level (selection.slider.radius), which is what
    // the source declares. Reading only `'control'` fell back to r8 whenever the session had not re-applied roles.
    var railR = (prof && prof.radius !== undefined) ? CF.radius(prof.radius) : CF.radius('control');
    ctx.plate(trackBox, { name: 'track', fills: [{ fillColor: C(trkInk), fillOpacity: trkOp }], radius: railR });
    var span = vert ? { a: trackBox.y, b: trackBox.y + trackBox.h, axis: 'y' } : { a: trackBox.x, b: trackBox.x + trackBox.w, axis: 'x' };
    var posOf = function (p) { return span.a + (span.b - span.a) * p; };
    var seg = function (pa, pb) {
      var a0 = posOf(min(pa, pb)), a1 = posOf(max(pa, pb));
      return vert ? B(trackBox.x, a0, trackBox.w, a1 - a0) : B(a0, trackBox.y, a1 - a0, trackBox.h);
    };
    var actInk = (prof && prof.activeInk) || 'primary';
    ctx.plate(o.range ? seg(v, v2) : seg(0, v), { name: 'track·active', fill: o.state === 'disabled' ? C('muted') : C(actInk), radius: railR });
    var handle = function (p) {
      var c = posOf(p);
      var b = vert ? B(trackBox.x + trackBox.w / 2 - hs / 2, c - hs / 2, hs, hs) : B(c - hs / 2, railY - hs / 2, hs, hs);
      if (o.state === 'hover' || o.state === 'dragged' || o.state === 'focus' || o.state === 'pressed')
        ctx.ellipse(B(b.x - 10, b.y - 10, hs + 20, hs + 20), { name: 'state·layer', fill: C('primary'), opacity: CF.STATE[o.state] });
      if (o.state === 'focus') ctx.ring(B(b.x - 10, b.y - 10, hs + 20, hs + 20), { offset: 0, radius: 'full', color: C('primary') });
      var hb = ctx.ellipse(b, { name: 'handle', fill: o.state === 'disabled' ? C('muted') : C('surface'), stroke: o.state === 'disabled' ? C('border') : C('primary'), strokeW: 2 });
      // A typed single-layer `shadow:1` is unbound and fails G18; the handle takes the declared `chip` recipe.
      try { if (storage.EL && storage.EL.seeded && storage.EL.apply) storage.EL.apply(hb, 'chip'); } catch (e) {}
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
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { track: th, handle: hs },
      { family: 'slider', state: o.state || 'default', range: !!o.range });
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
      ctx.text('PNG, JPG or PDF up to 20 MB', B(box.x + 16, box.y + 112, box.w - 32, 18), { size: 12, color: (US === 'hover' || o.dragging) ? C('ink') : C('muted'), opacity: dim });
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
    // SOURCE PROFILE: a marketing overline is a badge with a dot AND a label, a height, padding and its own plate.
    // The generic badge is a 20px count pill, so a recreation must be able to read the measured anatomy instead.
    var prof = CF.profile('data', 'badge'), pp = (prof && prof.size) || {};
    var hasText = o.text !== undefined || o.value !== undefined;
    var dot = o.dot || (!hasText && o.text === undefined && o.value === undefined);
    var dotOnly = !hasText;
    var tone = o.tone || 'danger';
    var soft = TONEMAP[tone] ? TONEMAP[tone][0] : 'errorSoft';
    var deep = TONEMAP[tone] ? C(TONEMAP[tone][2]) : C(tone);
    var bg = o.bg ? C(o.bg) : (prof && prof.fill ? C(prof.fill) : (o.soft ? C(soft) : deep));
    var ink = o.ink ? C(o.ink) : (prof && prof.ink ? C(prof.ink) : (o.soft ? deep : C('onPrimary')));
    var fs = o.fs || pp.fs || 12;
    var dotD = o.dotSize || pp.dot || 6;
    var h = o.h || pp.h || (dotOnly ? dotD : 20);
    var padX = o.padX !== undefined ? o.padX : (pp.padX !== undefined ? pp.padX : (dotOnly ? 0 : 6));
    var txt = dotOnly ? null : (o.text === undefined ? (o.value === undefined ? '' : (Number(o.value) > (o.max || 99) ? (o.max || 99) + '+' : String(o.value))) : String(o.text));
    var leadW = dot ? dotD + 6 : 0;
    var w = o.w || (dotOnly ? dotD : max(20, padX * 2 + leadW + CF.estW(txt || '', fs)));
    var rad = o.radius !== undefined ? o.radius : (pp.radius !== undefined ? pp.radius : ((prof && prof.radius) !== undefined ? prof.radius : (dotOnly ? 'full' : 'control')));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Badge', { type: dotOnly ? 'Dot' : (o.status ? 'Status' : (dot ? 'Overline' : 'Count')), tone: tone, state: o.state }), box, { parent: o.parent, radius: rad });
    ctx.host.fills = [{ fillColor: bg, fillOpacity: 1 }];
    if (dot) ctx.ellipse(B(box.x + padX, box.y + (h - dotD) / 2, dotD, dotD), { name: 'dot', fill: ink });
    if (txt) ctx.text(txt, B(box.x + padX + leadW, box.y, box.w - padX * 2 - leadW, h), { size: fs, color: ink, weight: o.weight || 600, align: 'left', valign: 'middle' });
    if (o.standalone || o.ring) ctx.host.strokes = [{ strokeColor: C('surface'), strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner', strokeStyle: 'solid' }];
    await ctx.settle(); ctx.place();
    var elRole = o.elevation || (prof && prof.elevation);
    if (elRole && storage.EL && storage.EL.has && storage.EL.has(elRole)) storage.EL.apply(ctx.host, elRole);
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { h: h, fs: fs, radius: CF.radius(rad) },
      { family: 'badge', size: String(o.size || 'md').toLowerCase(), state: o.state || 'default', elevation: elRole || null });
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
    var prof = CF.profile('data', 'chip'), pp = (prof && prof.size) || {};
    var tone = o.tone || 'neutral', on = kind === 'filter' ? (o.selected !== false) : true;
    var h = o.h || pp.h || (o.size === 'md' ? 32 : 24), padX = o.padX !== undefined ? o.padX : (pp.padX !== undefined ? pp.padX : (kind === 'tag' ? 8 : 12)), ic = h >= 28 ? 18 : 14;
    var fs = o.fs || pp.fs || L.fs;
    var cRad = o.radius !== undefined ? o.radius : (pp.radius !== undefined ? pp.radius : ((prof && prof.radius) !== undefined ? prof.radius : (kind === 'tag' ? 'sm' : 'control')));
    var label = String(o.label === undefined ? 'Chip' : o.label);
    var leadW = (o.dot ? 8 : 0) + (o.lead ? ic + 6 : 0) + (o.avatar ? h - 8 + 6 : 0);
    var trailW = (o.removable ? ic + 4 : 0) + (o.trail ? ic + 4 : 0) + (o.count ? CF.estW(String(o.count), CF.countFs(L)) + 6 : 0);
    var box = B(o.x || 0, o.y || 0, o.w || (padX * 2 + leadW + CF.estW(label, fs) + trailW), h);
    var ctx = CF.build(CF.name('Chip', { type: kind, size: o.size, state: S, slot: slotName(o), tone: tone }), box,
      { parent: o.parent, radius: cRad });
    var soft = TONEMAP[tone] || TONEMAP.neutral;
    // A link chip is CF.link with a pill outline, not a filled pill: its hue lives in the copy + underline, so the
    // host stays empty at rest. Giving it the base fill too made the copy primary-on-primary — invisible whenever the
    // brand hue is dark (a primary such as #161616), and §3.3 fails on the drawing, not on paper.
    var bgc = prof && prof.fill ? C(prof.fill) : (kind === 'link' ? null
      : kind === 'actionable' ? (on ? C('primary') : C('surface'))
      : (on ? C(soft[0]) : C('surface')));
    ctx.host.fills = CF.fills(bgc, S === 'default' ? null : (S === 'disabled' ? 'disabled' : S), { onDark: kind !== 'link' && on && tone === 'accent' });
    if (kind !== 'chip' && kind !== 'link' && !(prof && prof.fill)) ctx._stroke(ctx.host, on ? C(soft[1]) : C('border'), tone === 'neutral' ? 1 : 1, S === 'disabled' ? 0.4 : (on ? 0.5 : 1));
    else if (kind === 'chip' && !on) ctx._stroke(ctx.host, C('borderStrong'), 1);
    var solidBrand = (kind === 'actionable') && on;                 // a filled brand chip: white copy on the base hue (5.17:1)
    var ink = kind === 'link' ? C('primary') : (solidBrand ? C('onPrimary')
      : (tone === 'neutral' ? C('ink') : C(soft[2])));               // §4 ink step on a wash
    if (prof && prof.ink) ink = C(prof.ink);
    ink = S === 'disabled' ? C('muted') : ink;
    var x = box.x + padX;
    if (o.dot) { ctx.ellipse(B(x, box.y + (h - 8) / 2, 8, 8), { name: 'dot', fill: ink }); x += 8 + 6; }
    if (o.avatar) { ctx.ellipse(B(x, box.y + 4, h - 8, h - 8), { name: 'avatar', fill: C('surfaceAlt'), stroke: C('border'), strokeW: 1 }); x += h - 8 + 6; }
    if (o.lead) { ctx.glyph(iconOf(o.lead, 'check'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, anchor: 'left' }); x += ic + 6; }
    ctx.text(label, B(x, box.y, box.w - (x - box.x) - padX - trailW + 4, h), { size: fs, color: ink, weight: kind === 'tag' ? (prof && prof.weight ? prof.weight : 500) : 400,
      opacity: stateAlpha(S), align: 'left', underline: kind === 'link' ? ink : false });
    x = box.x + box.w - padX;
    if (o.count) { x -= CF.estW(String(o.count), CF.countFs(L)) + 6; ctx.text(String(o.count), B(x, box.y, CF.estW(String(o.count), CF.countFs(L)), h), { size: CF.countFs(L), color: ink, align: 'left' }); }
    if (o.trail) { x -= ic + 4; ctx.glyph(iconOf(o.trail, 'chevronDown'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, anchor: 'right' }); }
    if (o.removable) { x -= ic + 4; ctx.glyph('close', B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 1.6, anchor: 'right' }); }
    await ctx.settle(); ctx.place(); ctx.refit(padX);
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: cRad });
    if (o.hit) ctx.hitPad(B(ctx.host.x, ctx.host.y, ctx.host.width, h), o.hit);
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { h: h, fs: fs, radius: CF.radius(cRad) },
      { family: 'chip', kind: kind, size: String(o.size || 'md').toLowerCase(), state: S });
    return ctx.host;
  };

  /** Fit a placed Chip INSTANCE to a new label. The pill, its label and its ✕ are one component; a copy may not be
      structurally edited, but text + child geometry are overrides — so the copy is resized, the text box is sized to
      the new value, and the ✕ keeps the master's right inset. This is how a composite (MultiSelect) reuses a real
      Chip instead of redrawing raw pill plates (measured 2026-10-26: two raw `chip` rectangles inside the selected
      MultiSelect master, with text and ✕ as loose siblings). `o.w` fixes the box (in-place repair); otherwise the
      box grows by the label's measured width difference. */
  CF.chipFit = function (inst, label, o) {
    o = o || {};
    if (!inst) return null;
    var kids = []; try { kids = Array.from(inst.children || []); } catch (e) {}
    // FLEX anatomy: `row·content` owns the label↔✕ relation with a bound `columnGap` (space token). Only the copy's
    // text and BOX are overridden; the row reflows, so the ✕ can never land on top of the label. Manual x positions are
    // the legacy absolute path below (measured overlap 2026-10-26: a 78px copy kept the 85px master's right inset and
    // pushed the 7px ✕ 3.5px into "Design").
    var row = kids.filter(function (k) { return /^row·content$/.test(String(k.name || '')); })[0] || null;
    var hit = kids.filter(function (k) { return /^hitpad·/.test(String(k.name || '')); })[0] || null;
    if (row) {
      var rk = []; try { rk = Array.from(row.children || []); } catch (e) {}
      var ftxt = rk.filter(function (k) { return k.type === 'text'; })[0] || null;
      var fs = 14; try { fs = parseFloat(ftxt.fontSize) || 14; } catch (e) {}
      var tw = CF.estW(String(label), fs);
      var w0 = Number(inst.width) || 85;
      var w = o.w !== undefined ? Number(o.w) : w0;
      if (ftxt) {
        try { if (String(ftxt.characters) !== String(label)) ftxt.characters = String(label); } catch (e) {}
        try { ftxt.resize(max(8, tw), ftxt.height); } catch (e) {}
        try { ftxt.growType = 'auto-width'; } catch (e) {}
      }
      try { inst.resize(w, o.h !== undefined ? Number(o.h) : inst.height); } catch (e) {}
      if (hit) { try { hit.resize(w, hit.height); } catch (e) {} }
      return inst;
    }
    var txt = kids.filter(function (k) { return k.type === 'text'; })[0] || null;
    var close = kids.filter(function (k) { return /^glyph·close/.test(String(k.name || '')); })[0] || null;
    var fs2 = 14; try { fs2 = parseFloat(txt.fontSize) || 14; } catch (e) {}
    var tw2 = CF.estW(String(label), fs2);
    var baseW = Number(inst.width) || 85;
    var baseTextW = txt ? Number(txt.width) : tw2;
    var rightInset = close ? Math.max(0, baseW - (Number(close.x) - Number(inst.x)) - Number(close.width)) : 0;
    var w2 = o.w !== undefined ? Number(o.w) : Math.round(baseW + (tw2 - baseTextW));
    if (txt) {
      try { if (String(txt.characters) !== String(label)) txt.characters = String(label); } catch (e) {}
      try { txt.resize(max(8, tw2), txt.height); } catch (e) {}
      try { txt.x = Number(inst.x) + 12; } catch (e) {}
    }
    try { inst.resize(w2, o.h !== undefined ? Number(o.h) : inst.height); } catch (e) {}
    if (close) { try { close.x = Number(inst.x) + w2 - rightInset - Number(close.width); } catch (e) {} }
    if (hit) { try { hit.resize(w2, hit.height); } catch (e) {} }
    return inst;
  };
  /** The natural width of a Chip master for a label (the box a fresh instance needs). */
  CF.chipWidth = function (label, masterName) {
    var name = masterName || 'Chip·Input·SM·Clear·Neutral';
    var w = 85;
    try { var rec = CF.get(name); if (rec && rec.mainInstance && rec.mainInstance()) w = Number(rec.mainInstance().width) || w; } catch (e) {}
    return Math.round(w + (CF.estW(String(label), 14) - CF.estW('Design', 14)));
  };

  /** Avatar — 24/32/40/48/64/96, circle·rounded·square, image·initials·icon, presence dot 8-10 with a 2px surface ring. */
  CF.avatar = async function (o) {
    o = o || {};
    var SCALE = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64, '2xl': 96 };
    var s = o.size !== undefined && SCALE[o.size] !== undefined ? SCALE[o.size] : (Number(o.size) || 40);
    var fs = s >= 64 ? 20 : (s >= 48 ? 16 : (s >= 32 ? 13 : 12));   // §3.2 ramp: an avatar's initials are copy, not a glyph
    var box = B(o.x || 0, o.y || 0, s, s);
    var ctx = CF.build(CF.name('Avatar', { size: o.size || s, slot: o.status ? ('Status·' + o.status) : (o.content === 'initials' ? 'Initials' : (o.editable ? 'Editable' : null)) }), box,
      { parent: o.parent, radius: o.shape === 'square' ? 'none' : (o.shape === 'rounded' ? 'sm' : 'control'), clip: false });
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
      // THE HOST DOES NOT CLIP (a clip trims `presence`/`presence·ring`, which must read as a complete badge —
      // measured 2026-10-26 on `Avatar·LG·Status·online`: a 17px badge at the edge lost its outer quarter). The scrim
      // still has to follow the circle, so it takes the host's corner on the two sides that touch the edge — the same
      // per-corner device `ButtonGroup` uses for its end segments.
      var scrimR = o.shape === 'square' ? 0 : RZ(o.shape === 'rounded' ? 'sm' : 'control');
      var scrim = ctx.plate(B(box.x, box.y + s - s * 0.4, s, s * 0.4), { name: 'editable·scrim', fill: C('ink'), opacity: 0.55 });
      Array.from(ctx.host.children || []).forEach(function (k) {
        if (String(k.name) !== 'editable·scrim') return;
        ['BottomLeft', 'BottomRight'].forEach(function (c) { try { k['borderRadius' + c] = scrimR; } catch (e) {} });
      });
      void scrim;
      ctx.glyph('camera', B(box.x + s / 2 - s * 0.15, box.y + s - s * 0.32, s * 0.3, s * 0.3), { color: '#FFFFFF' });
    }
    if (o.ring) ctx.ring(box, { radius: 'control', offset: 2, width: 2 });
    await ctx.settle(); ctx.place();
    return ctx.host;
  };

  /** Avatar/group stack — ≤5 visible then +N overflow, 8px overlap (M3 16dp), z-order right→left. */
  CF.avatarGroup = async function (o) {
    o = o || {};
    // SIZE NAMES ARE PX. `o.size` arrives as a ladder key from CAT.PLAN ('md'/'lg'/'sm'); the old `var s = o.size || 32`
    // kept the STRING, `s * 0.3` became NaN, the box width/height became 1×1 and every member avatar was laid out at
    // NaN → (384,577) with all five stacked (measured 2026-10-26 on page 07: 3 degenerate slots, 16 escapes, 30 text
    // overlaps). The Avatar factory resolves the same scale; the group must do it before any arithmetic.
    var SCALE = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64, '2xl': 96 };
    var s = (o.size !== undefined && SCALE[o.size] !== undefined) ? SCALE[o.size] : (Number(o.size) || 32);
    var members = o.members || [];
    var n = members.length || 5, over = max(0, (o.total || n) - n), ov = s * 0.3;
    var box = B(o.x || 0, o.y || 0, s + (n - 1) * (s - ov) + (over ? s - ov + 6 : 0), s);
    // Its own family name and a FIXED box: appending absolute avatar children to a hug frame collapsed the group to
    // 1×1 inside a grid slot, so every catalog AvatarGroup rendered as a dot.
    var ctx = CF.build(CF.name('AvatarGroup', { size: o.size }), box, { parent: o.parent });
    for (var i = 0; i < n; i++) await CF.avatar({ parent: ctx.host, x: box.x + i * (s - ov), y: box.y, size: s, initials: (members[i] || '').slice(0, 2), name: members[i] });
    try { ctx.host.clipContent = false; ctx.host.horizontalSizing = 'fix'; ctx.host.verticalSizing = 'fix'; ctx.host.resize(box.w, box.h); } catch (e) {}
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
    // The generic card kit is one recipe: a white plate, a 1px hairline, `md` corners, one drop. A recreation's cards
    // are MEASURED — plate colour, corner, padding and the drop+inset stack come from the source material, and the
    // drawn result is stamped so rule 56 can judge it. `o.cardType` picks the measured entry (feature/pricing/work…).
    var prof = CF.profile('data', o.cardType || 'card'), pp = (prof && prof.size) || {};
    var tone = o.tone || (prof && prof.tone) || 'outlined', S = o.state || 'default';
    var pad = o.pad || pp.pad || (tone === 'elevated' ? 24 : 20);
    var w = o.w || pp.w || 320, headerH = o.title ? 56 : 0, coverH = o.cover ? (o.coverH || Math.round(w * 0.5)) : 0;
    var bodyH = o.h ? 0 : (o.bodyH || (o.body ? max(28, Math.ceil(CF.estW(String(o.body), 13) / max(80, w - pad * 2)) * 20 + 8) : 24));
    var footerH = (o.actions || o.footer) ? 56 : 0;
    var rad = CF.radius(o.radius !== undefined ? o.radius : (pp.radius !== undefined ? pp.radius : 'md'));
    var fillTok = o.fill || (prof && prof.fill) || (tone === 'outlined' ? 'surface' : (tone === 'filled' ? 'surfaceAlt' : 'surface'));
    var bW = (prof && prof.expect && prof.expect.stroke !== undefined) ? Number(prof.expect.stroke)
      : (prof && prof.border ? Number(prof.border.width || 0) : (tone === 'outlined' ? 1 : 0));
    var bTok = (prof && prof.border && prof.border.token) ? prof.border.token : 'border';
    var box = B(o.x || 0, o.y || 0, w, coverH + headerH + bodyH + footerH + pad * (coverH ? 1 : 2));
    var ctx = CF.build(CF.name('Card', { type: tone, state: S, slot: o.cover ? 'Cover' : (o.selectable ? 'Selectable' : null) }), box,
      { parent: o.parent, radius: rad, stroke: bW ? C(bTok) : null, strokeW: bW || 1, shadow: prof ? 0 : (tone === 'elevated' ? (o.elev || 1) : 0), clip: true });
    ctx.host.fills = [{ fillColor: C(fillTok), fillOpacity: 1 }];
    if (S === 'hover' && !prof && tone === 'elevated') ctx.host.shadows = CF.shadow((o.elev || 1) + 1);
    if (S === 'hover' && !prof && tone !== 'elevated') ctx.host.fills = CF.fills(C(fillTok), 'hover');
    CF.elevate(ctx.host, 'Card');
    var elevName = prof && prof.elevation;
    if (S === 'hover' && prof && prof.hoverElevation) elevName = prof.hoverElevation;
    if (elevName && storage.EL && storage.EL.has && storage.EL.has(elevName)) storage.EL.apply(ctx.host, elevName);
    var y = box.y;
    if (o.cover) {
      // the outlined host carries its border on its own box, and a board paints children over that stroke: a flush cover
      // plate erases the card's L/T/R border (stroke_covered). Inset it on the three bordered sides only — the cover's
      // bottom edge is interior, so it may run to the full height.
      var ci = bW ? bW : 0;
      var cover = ctx.plate(B(box.x + ci, y + ci, box.w - ci * 2, coverH - ci), { name: 'cover', fill: C(o.coverTone || 'border'), stroke: null });
      // A square plate flush in a r20 host cuts the host silhouette (`flush_corner_split`); the cover takes the host's
      // two top corners and keeps its own bottom edge square.
      if (cover && rad) {
        // Penpot keeps four corner props; assigning an array to `borderRadius` is silently dropped, so the flush
        // plate still painted square corners through the host's r20 silhouette (`flush_corner_split`).
        try {
          cover.borderRadiusTopLeft = rad; cover.borderRadiusTopRight = rad;
          cover.borderRadiusBottomLeft = 0; cover.borderRadiusBottomRight = 0;
        } catch (e) {}
      }
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
    if (S === 'focus') ctx.ring(box, { radius: rad });
    CF.profStamp(ctx.host, prof, { pad: pad, radius: rad, stroke: bW, w: w, fill: fillTok },
      { family: 'card', cardType: o.cardType || 'card', state: S, elevation: elevName || null });
    return ctx.host;
  };

  /** KPI / statistic — label 12-13 muted · value 28-36 tabular · delta 13 + arrow (colour AND sign) · sparkline 60-80×24. */
  CF.kpi = async function (o) {
    o = o || {};
    var prof = CF.profile('data', 'kpi'), pp = (prof && prof.size) || {};
    var pad = o.pad || pp.pad || 20, w = o.w || pp.w || 240, vs = o.valueFs || pp.valueFs || 32;
    var kRad = pp.radius !== undefined ? CF.radius(pp.radius) : CF.radius('md');
    var delta = o.delta === undefined ? null : Number(o.delta);
    var h = o.h || (pad * 2 + 18 + vs + (delta !== null ? 20 : 0) + (o.spark ? 26 : 0));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('KPI', { type: o.spark ? 'Sparkline' : (delta !== null ? 'Delta' : 'Compact'), state: o.state }), box,
      { parent: o.parent, fill: C((prof && prof.fill) || 'surface'), radius: kRad,
        stroke: (prof && prof.border) ? C(prof.border) : (o.bordered === false ? null : C('border')), strokeW: 1 });
    ctx.text(String(o.label === undefined ? 'Active users' : o.label), B(box.x + pad, box.y + pad - 2, w - pad * 2, 18),
      { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
    var value = String(o.value === undefined ? '1,284' : o.value);
    ctx.text(value, B(box.x + pad, box.y + pad + 16, w - pad * 2, vs + 6), { size: vs, color: C('ink'), weight: 600, align: 'left', valign: 'top', refit: false });
    var yy = box.y + pad + 16 + vs + 6;
    if (delta !== null) {
      var up = delta >= 0, good = o.inverse ? !up : up;
      // §4.1: on a white plate the copy is ink and the COLOUR rides on the arrow glyph — the palette's own
      // success/error ink steps are 3.28:1 and 4.0:1 on white, so tinted copy cannot clear AA. Sign + colour are
      // both still present (arrow direction + hue), which is what the guide asks for.
      var dcol = C('ink');
      ctx.glyph(up ? 'arrowUp' : 'arrowDown', B(box.x + pad, yy + 2, 14, 14), { color: C(good ? 'success' : 'error'), strokeW: 1.8 });
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
    var kElev = prof && prof.elevation;
    if (kElev && storage.EL && storage.EL.has && storage.EL.has(kElev)) storage.EL.apply(ctx.host, kElev);
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { pad: pad, radius: kRad, valueFs: vs },
      { family: 'kpi', state: o.state || 'default' });
    return ctx.host;
  };

  /** Progress — line h4-8 · circle 48 stroke 4 · dashboard 270° arc · segmented steps; normal/success/exception, indeterminate. */
  CF.progress = async function (o) {
    o = o || {};
    var type = o.type || 'line', p = o.value === undefined ? 0.62 : (Number(o.value) > 1 ? Number(o.value) / 100 : Number(o.value));
    p = max(0, min(1, p));
    var st = o.status || (p >= 1 ? 'success' : 'normal'), L = CF.ladder(o.size || 'md');
    var prof = CF.profile('data', 'progress'), pp = (prof && prof.size) || {};
    var th = o.thick || pp.track || (type === 'line' ? (o.size === 'lg' ? 8 : 4) : 4);
    var col = st === 'exception' || st === 'error' ? C('error') : (st === 'success' ? C('success') : C((prof && prof.activeInk) || 'primary'));
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
    var pRad = pp.radius !== undefined ? CF.radius(pp.radius) : 'control';
    var pOp = prof && prof.trackOpacity !== undefined ? Number(prof.trackOpacity) : 0.12;
    ctx3.plate(B(box3.x, box3.y + (box3.h - th) / 2, box3.w - labW, th), { name: 'track', fill: C((prof && prof.trackInk) || 'ink'), opacity: pOp, radius: pRad });
    var fw = o.indeterminate ? (box3.w - labW) * 0.34 : (box3.w - labW) * p;
    var bar = ctx3.plate(B(box3.x, box3.y + (box3.h - th) / 2, max(2, fw), th), { name: 'bar', fill: col, radius: pRad });
    // The source's brand fill GLOWS (a 2px brand drop). A profiled glow recipe is applied here so the bar is a light
    // source, not a painted stripe; without one the generic bar stays flat.
    var pElev = prof && prof.elevation;
    if (pElev && storage.EL && storage.EL.has && storage.EL.has(pElev)) storage.EL.apply(bar, pElev);
    if (o.indeterminate) ctx3.plate(B(box3.x + max(2, fw) - 12, box3.y + (box3.h - th) / 2, 12, th), { name: 'bar·shimmer', fill: '#FFFFFF', opacity: 0.55, radius: 'xs' });
    if (showLabel) ctx3.text(st === 'success' ? 'Done' : Math.round(p * 100) + '%', B(box3.x + box3.w - labW, box3.y, labW, box3.h),
      { size: 12, color: st === 'normal' ? C('ink') : col, align: 'right' });
    await ctx3.settle(); ctx3.place();
    if (prof && prof._family) CF.profStamp(ctx3.host, prof, { track: th },
      { family: 'progress', state: st, kind: 'line' });
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
    var prof = CF.profile('data', 'table'), pp = (prof && prof.size) || {};
    var L = CF.ladder(o.density === 'dense' ? 'sm' : (o.size || 'md'));
    var h = o.h || pp.rowH || (o.density === 'dense' ? 32 : 40), padX = o.padX || pp.padX || (o.density === 'dense' ? 8 : 16);
    var label = String(o.label === undefined ? 'Column' : o.label);
    var sortW = o.sort ? 16 + 4 : 0, filtW = o.filter ? 16 + 4 : 0, resW = o.resizable ? 6 : 0;
    // A TRAILING ICON NEEDS ITS OWN WIDTH + GAP. Sizing the label area as `w − pads − iconSlots` while allowing the
    // text to auto-grow past that box let "Column" run 2.3px into the sort caret (and 4.3px into the filter icon) on a
    // 88px header; the icons are at the right, so the label had nowhere to go (measured 2026-10-26). The host now grows
    // to its content minimum (label + a space-token gap + icon slots) even when a caller passes a narrower `o.w`.
    var iconGap = (o.sort || o.filter) ? 4 : 0;
    var minW = padX * 2 + CF.estW(label, 12) + iconGap + sortW + filtW + resW;
    var w = max(o.w || 0, max(80, minW));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('TableHeader', { state: o.sort ? 'Sorted·' + o.sort : (o.filter ? 'FilterActive' : 'Default'), slot: o.align === 'right' ? 'Numeric' : null }), box, { parent: o.parent });
    ctx.host.fills = CF.fills(C((prof && prof.headerFill) || 'surfaceAlt'), o.state === 'hover' ? 'hover' : null);
    var right = o.align === 'right';
    // ACTIVE HEADER COPY IS TEXT, NOT A FILL: `primary` is the brand plate colour (a light purple in this file) and
    // measured 2.51:1 on surfaceAlt; a 12px sort label and its 1.6px caret/filter glyphs need 4.5:1 / 3:1. The filled
    // primary button uses `primaryInk` for exactly this reason (CF.PALETTE button recipe), so the header's active
    // affordance does too (measured 2026-10-26: 3 contrast findings on TableHeader·Spec).
    var activeInk = C('primaryInk');
    var labH = ctx.text(label, B(box.x + padX, box.y, box.w - padX * 2 - sortW - filtW - resW, box.h),
      { size: 12, color: o.sort || o.filter ? activeInk : (o.state === 'hover' ? C('ink') : C('muted')), weight: 600, align: right ? 'right' : 'left', refit: false });
    var iconsN = (o.sort ? 1 : 0) + (o.filter ? 1 : 0);
    var x = box.x + box.w - padX - resW;
    if (o.filter) { x -= filtW; ctx.glyph('filter', B(x, box.y + (box.h - 16) / 2, 16, 16), { color: activeInk, strokeW: 1.6 }); }
    if (o.sort) { x -= sortW; ctx.glyph(o.sort === 'asc' ? 'caretUp' : 'caretDown', B(x, box.y + (box.h - 16) / 2, 16, 16), { color: activeInk, fill: activeInk }); }
    if (o.resizable) ctx.plate(B(box.x + box.w - 1, box.y + 8, 1, box.h - 16), { name: 'resize·handle', fill: C('borderStrong') });
    await ctx.settle(); ctx.place();
    // MEASURE, THEN GROW — `CF.estW` under-reports the real rendered label (35 vs 43 for "Column" at 12px), so the
    // box math above can still leave the auto-width text short of the icon slot. Grow the host by the measured
    // overflow + one 4px space-scale gap and shift the right icons; the label then has its own run.
    try {
      var t = labH && labH.t;
      var avail = box.w - padX * 2 - sortW - filtW - resW;
      var need = (t && iconsN ? (Number(t.width) - avail) + 4 : 0);
      if (need > 0.5) {
        ctx.host.resize(N(ctx.host.width + need), ctx.host.height);
        (ctx.host.children || []).forEach(function (k) {
          if (/^glyph·(caret|filter)/.test(String(k.name || ''))) k.x = N(Number(k.x) + need);
        });
      }
    } catch (e) {}
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { padX: padX, rowH: h }, { family: 'table', part: 'header', state: o.state || 'default' });
    return ctx.host;
  };

  /** Table row — 48/40/32 by density · cells pad 16/12/8 · hairline · hover 8% · selected 12% + 2px accent bar · checkbox col 44. */
  CF.tableRow = async function (o) {
    o = o || {};
    var prof = CF.profile('data', 'table');
    var dens = o.density || 'default';
    var tPad = (prof && prof.padX) || null;
    var h = o.h || ({ dense: 32, middle: 40, default: 48 }[dens] || 48);
    var padX = tPad !== undefined && tPad !== null ? tPad : ({ dense: 8, middle: 12, default: 16 }[dens] || 16);
    var cells = o.cells || ['Row label', '1,024', 'Active', '—'];
    var widths = o.widths || cells.map(function (c, i) { return i === 0 ? max(160, (o.w || 720) * 0.34) : Math.floor(((o.w || 720) - (o.selectable ? 44 : 0) - max(160, (o.w || 720) * 0.34)) / (cells.length - 1)); });
    var w = o.w || widths.reduce(function (a, b) { return a + b; }, 0) + (o.selectable ? 44 : 0) + padX;
    var box = B(o.x || 0, o.y || 0, w, h);
    var S = o.state || 'default';
    var ctx = CF.build(CF.name('TableRow', { size: dens, state: S, slot: o.expandable ? 'Expandable' : (o.editing ? 'Editing' : null) }), box, { parent: o.parent });
    var tFill = (prof && prof.fill) || 'surface', tZebra = (prof && prof.zebra) || 'surfaceAlt';
    ctx.host.fills = S === 'selected' ? CF.fills(C('primary'), 'selected', { tint: 1 }) : (o.zebra ? CF.fills(C(tZebra), S === 'hover' ? 'hover' : null) : CF.fills(C(tFill), S === 'hover' ? 'hover' : (S === 'disabled' ? 'disabled' : null)));
    if (S === 'selected') ctx.plate(B(box.x, box.y, 2, box.h), { name: 'accent·bar', fill: C('primary') });
    var x = box.x + (o.selectable ? 44 : 0);
    var al = S === 'disabled' ? CF.STATE.disabledContent : 1;
    // The expand chevron is a LEADING slot inside the first cell: 10px inset + 14px glyph + 4px gap. The old
    // `x += 4` gave the label only 4px, so "Row label" ran 2.9px under the chevron in every Expandable state
    // (measured 2026-10-26). The first cell keeps its column width; its CONTENT starts after the slot.
    if (o.expandable) ctx.glyph(o.expanded ? 'chevronDown' : 'chevronRight', B(box.x + 10, box.y + (h - 14) / 2, 14, 14), { color: C('muted') });
    var leadInset = o.expandable ? 28 : 0;
    for (var ci = 0; ci < cells.length; ci++) {
      var c = cells[ci], cw = widths[ci] || 120, cellX = x + (ci === 0 ? leadInset : 0), cellW = cw - (ci === 0 ? leadInset : 0),
          algn = (o.aligns && o.aligns[ci]) || (typeof c === 'number' || /^[\d.,%$–—-]/.test(String(c)) ? 'right' : 'left');
      if (o.editing && ci === (o.editIndex === undefined ? 0 : o.editIndex)) {
        await CF.input({ parent: ctx.host, x: cellX, y: box.y + (h - (dens === 'dense' ? 24 : 28)) / 2, w: cellW - 8,
                         size: dens === 'dense' ? 'xs' : 'sm', value: String(c), state: 'focus' });
      } else if (c && typeof c === 'object') {
        if (c.tone) await CF.chip({ parent: ctx.host, x: algn === 'right' ? cellX + cellW - padX - (c.w || 76) : cellX,
                                    y: box.y + (h - 24) / 2, label: c.label || '', size: 'sm', kind: 'tag', tone: c.tone });
        else if (c.progress !== undefined) await CF.progress({ parent: ctx.host, x: cellX, y: box.y + (h - 4) / 2, w: cellW - padX, value: c.progress, hideLabel: true });
        else if (c.avatar) await CF.avatar({ parent: ctx.host, x: cellX, y: box.y + (h - 32) / 2, size: 32, name: c.avatar });
        else if (c.action) await CF.button({ parent: ctx.host, x: cellX, y: box.y + (h - 28) / 2, label: c.action, size: 'xs', type: c.type || 'link' });
        else if (c.badge) await CF.badge({ parent: ctx.host, x: cellX + (algn === 'right' ? cellW - padX - 24 : 0), y: box.y + (h - 20) / 2, value: c.badge, tone: c.tone });
        else if (c.text !== undefined) ctx.text(String(c.text), B(cellX, box.y, cellW - padX, h), { size: ci === 0 ? 14 : 13, color: C('ink'), opacity: al, align: algn, refit: false });
      } else {
        ctx.text(String(c), B(cellX, box.y, cellW - padX, h), { size: ci === 0 ? 14 : 13, color: al < 1 ? C('muted') : C('ink'), weight: ci === 0 ? 500 : 400,
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
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { padX: padX }, { family: 'table', density: dens, state: S });
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
    c2.plate(B(box2.x + 1, box2.y + 1, box2.w - 2, 40), { name: 'header', fill: C('surfaceAlt'), radius: 'md' });
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
    var prof = CF.profile('data', 'list'), pp = (prof && prof.size) || {};
    var lines = o.lines || (o.sub ? 2 : 1);
    var media = (!o.leading || o.leading === 'none') ? 0 : (o.mediaSize || ({ 1: 24, 2: 40, 3: 48 }[lines] || 40));
    var h = o.h || pp.h || ({ 1: 48, 2: 64, 3: 88 }[lines] || 48);
    var padX = o.padX || pp.padX || 16, padY = 12, gap = o.gap === undefined ? 12 : o.gap;
    var w = o.w || 360, trailW = o.trailing ? (o.trailing === 'meta' ? 90 : o.trailing === 'chevron' ? 24 : o.trailing === 'switch' ? 48 : 32) : 0;
    var S = o.state || 'default';
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('ListItem', { size: lines + 'line', state: S, slot: o.trailing ? ('Trail·' + o.trailing) : null }), box, { parent: o.parent });
    ctx.host.fills = S === 'selected' ? CF.fills(C('primary'), 'selected', { tint: 1 }) : CF.fills(C((prof && prof.fill) || 'surface'), S === 'hover' ? 'hover' : null);
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
      { size: 13, color: (S === 'selected' || S === 'hover' || S === 'focus') ? C('ink') : C('muted'), opacity: stateAlpha(S), align: 'left', valign: 'top', refit: false });
    if (lines >= 3) ctx.text(String(o.meta || 'Tertiary detail'), B(tx, titleY + 40, textW, 16),
      { size: 12, color: (S === 'selected' || S === 'hover' || S === 'focus') ? C('ink') : C('muted'), opacity: stateAlpha(S, 0.8), align: 'left', valign: 'top', refit: false });
    if (o.trailing === 'meta') ctx.text(String(o.metaRight || '2h'), B(box.x + box.w - padX - trailW, box.y, trailW, h),
      { size: 12, color: C('muted'), align: 'right', valign: 'middle', refit: false });
    else if (o.trailing === 'chevron') ctx.glyph('chevronRight', B(box.x + box.w - padX - 16, box.y + (h - 16) / 2, 16, 16), { color: C('muted') });
    else if (o.trailing === 'menu') await CF.iconButton({ parent: ctx.host, x: box.x + box.w - padX - 28, y: box.y + (h - 28) / 2, size: 'xs', glyph: 'dotsV' });
    else if (o.trailing === 'switch') await CF.switch({ parent: ctx.host, x: box.x + box.w - padX - 44, y: box.y + (h - 22) / 2, size: 'sm', checked: o.on });
    else if (o.trailing === 'action') await CF.button({ parent: ctx.host, x: box.x + box.w - padX - 72, y: box.y + (h - 28) / 2, label: String(o.action || 'Open'), size: 'sm', type: 'default' });
    await ctx.settle(); ctx.place();
    if (S === 'focus') ctx.ring(box, { offset: 0 });   // no radius: the row's own corner owns the ring and the wash
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { padX: padX, radius: 0 },
      { family: 'list', lines: lines, state: S });
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
    var prof = CF.profile('data', 'timeline'), pp = (prof && prof.size) || {};
    var rowH = o.rowH || pp.rowH || 56, nodeW = o.node || pp.node || 20, padL = nodeW + 16, w = o.w || 320;
    var h = items.length * rowH + (o.pending ? rowH : 0);
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Timeline', { slot: o.alternate ? 'Alternate' : (o.labelLeft ? 'LabelLeft' : null) }), box, { parent: o.parent });
    var nx = box.x + (o.labelLeft ? 92 : 0);
    var tlInk = (prof && prof.ink) || 'ink', tlNode = (prof && prof.nodeInk) || 'surface', tlLine = (prof && prof.connectorInk) || 'border';
    // Pass A: every node's REAL box. A 10px dot and a 20px icon node do not share an edge, but the rail used a
    // constant `cy + nodeW → + (rowH − nodeW + 6)` for both, so under a dot the line started 5px below the node and
    // ran 1px into the next one (measured 2026-10-26 on `Timeline·Spec`: 3 disconnected rails per board).
    var nodeBox = items.map(function (it2, i2) {
      var cy2 = box.y + i2 * rowH + 12, cx2 = nx + nodeW / 2;
      if (it2.dot === false || it2.icon || it2.avatar) return B(nx, cy2, nodeW, nodeW);
      var d2 = o.dot || 10;
      return B(cx2 - d2 / 2, cy2 + nodeW / 2 - d2 / 2, d2, d2);
    });
    var pendTop = o.pending ? (box.y + items.length * rowH + 12 + 5) : null;
    items.forEach(function (it, i) {
      var cy = box.y + i * rowH + 12, cx = nx + nodeW / 2;
      var nb = nodeBox[i], nTop = (i < items.length - 1) ? nodeBox[i + 1].y : pendTop;
      if (nTop !== null && nTop !== undefined) ctx.plate(B(nb.x + nb.w / 2 - (o.width || 2) / 2, nb.y + nb.h, o.width || 2, Math.max(0, nTop - (nb.y + nb.h))),
        { name: 'connector' + (i === items.length - 1 ? '·pending' : ''), fill: C(tlLine), dashed: i === items.length - 1 });
      if (it.dot === false || it.icon || it.avatar) {
        ctx.ellipse(B(nx, cy, nodeW, nodeW), { name: 'node·' + i, fill: it.icon ? C(it.tone || 'primary') : C(tlNode), stroke: C(it.tone || tlLine), strokeW: 1 });
        if (it.icon) ctx.glyph(iconOf(it.icon, 'check'), B(nx + 2, cy + 2, nodeW - 4, nodeW - 4), { color: C('onPrimary'), strokeW: 1.6 });
      } else {
        var d = o.dot || 10;
        ctx.ellipse(B(cx - d / 2, cy + nodeW / 2 - d / 2, d, d), { name: 'node·' + i, fill: C(it.tone || (i === 0 ? 'primary' : tlLine)), stroke: it.hollow ? C(it.tone || 'primary') : null, strokeW: 2 });
      }
      var tx = nx + nodeW + 16;
      ctx.text(String(it.title), B(tx, cy - 2, box.w - (tx - box.x) - 8, 20), { size: pp.fs || 14, color: C(tlInk), weight: 500, align: 'left', valign: 'top', refit: false });
      if (it.body) ctx.text(String(it.body), B(tx, cy + 18, box.w - (tx - box.x) - 8, 18), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
      if (o.labelLeft) ctx.text(String(it.time || ''), B(box.x, cy, 80, 20), { size: 12, color: C('muted'), align: 'right', valign: 'top', refit: false });
      // Time sits on the TITLE line (right-aligned), not as a second vertical line: a below-title time creates two
      // different gaps (title→time, time→next title) and `list_gap_split` rightly reads the uneven pitch as a defect.
      else if (it.time) ctx.text(String(it.time), B(box.x + box.w - 60, cy - 2, 52, 20), { size: 12, color: C('muted'), align: 'right', valign: 'top', refit: false });
    });
    if (o.pending) {
      var py = box.y + items.length * rowH + 12, cxp = nx + nodeW / 2;
      ctx.ellipse(B(cxp - 5, py + 5, 10, 10), { name: 'node·pending', fill: C('border') });
      ctx.text(String(o.pending === true ? 'Pending…' : o.pending), B(nx + nodeW + 16, py - 2, box.w - nodeW - 24, 20), { size: 13, color: C('muted'), align: 'left', valign: 'top', refit: false });
    }
    await ctx.settle(); ctx.place();
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { rowH: rowH, node: nodeW, fs: pp.fs || 14 },
      { family: 'timeline', state: o.state || 'default' });
    return ctx.host;
  };

  /** Accordion / collapse — header 48-56 + chevron 16 · body pad 16-24 (top 0) · divider 1px · ghost · disabled. */
  CF.accordion = async function (o) {
    o = o || {};
    var items = o.items || [{ title: 'Shipping', body: 'Free on orders over 80.', open: true }, { title: 'Returns', body: '30 days, unworn.' }, { title: 'Support', disabled: true }];
    var prof = CF.profile('navigation', 'accordion'), pp = (prof && prof.size) || {};
    var headH = o.headH || pp.headH || 48, padX = o.padX || pp.padX || 16, bodyH = o.bodyH || pp.bodyH || 44;
    // Items separate with a row breath (12, `space.md`), NOT a 1px divider: the gap is a layout amount that survives
    // resizing, while a line plate is absolute geometry that drifts when the host refits.
    var itemGap = LY && LY.breath ? LY.breath('row') : 12;
    var w = o.w || 360, h = 0;
    items.forEach(function (it, i) { h += headH + (it.open && !o.collapsedAll ? bodyH : 0) + (i < items.length - 1 ? itemGap : 0); });
    var box = B(o.x || 0, o.y || 0, w, max(headH, h));
    var ST = o.state || 'default';
    // `name` lets a screen ship a content-specific composition (Accordion·FAQ·Multi) instead of drawing the registered
    // master's anatomy again under the master's name, which the design gate reads as not_component.
    var aFill = (prof && prof.fill) || (o.ghost ? null : 'surface');
    var aRad = pp.radius !== undefined ? CF.radius(pp.radius) : CF.radius('md');
    var ctx = CF.build(o.name || CF.name('Accordion', { type: o.ghost ? 'Ghost' : 'Bordered', state: ST, slot: o.accordion ? 'Single' : 'Multi' }), box,
      { parent: o.parent, fill: aFill ? C(aFill) : null, radius: aRad, stroke: (o.ghost || (prof && prof.border === false)) ? null : C((prof && prof.border) || 'border') });
    var aElev = prof && prof.elevation;
    if (aElev && storage.EL && storage.EL.has && storage.EL.has(aElev)) storage.EL.apply(ctx.host, aElev);
    var y = box.y;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], S = it.disabled ? 'disabled' : (it.open ? 'open' : 'default');
      if (i === (o.cursor === undefined ? 0 : Number(o.cursor)) && (ST === 'hover' || ST === 'pressed'))
        ctx.plate(B(box.x + 1, y, w - 2, headH), { name: 'header·' + (ST === 'pressed' ? 'pressed' : 'hover'), fills: CF.fills(null, ST), radius: CF.radius('sm') });
      ctx.text(String(it.title), B(box.x + padX + (o.icon ? 24 : 0), y, w - padX * 2 - 24 - (o.chip ? 90 : 0) - (o.icon ? 24 : 0), headH),
        { size: it.open ? (pp.fsOpen || pp.fs || 14) : (pp.fs || 14), color: it.disabled ? C('muted') : C((prof && (it.open ? (prof.inkOpen || prof.ink) : prof.ink)) || 'ink'),
          weight: pp.weight || 500, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
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
    if (ST === 'focus') ctx.ring(B(box.x, box.y, w, headH), { radius: aRad });
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { headH: headH, padX: padX, radius: aRad, fs: pp.fs || 14 },
      { family: 'accordion', state: ST });
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
    var prof = CF.profile('data', 'calendar'), pp = (prof && prof.size) || {};
    var cell = o.cell || pp.cell || 32, gap = o.gap === undefined ? (pp.gap !== undefined ? pp.gap : 2) : o.gap;
    var headH = o.headH || pp.headH || 32, weekH = o.weekH || pp.weekH || 20, padX = 8, padB = 8;
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
    var calRad = pp.radius !== undefined ? CF.radius(pp.radius) : CF.radius('md');
    var ctx = CF.build(CF.name('MiniCalendar', { size: cell + 'cell', state: ST,
      slot: [o.range ? 'Range' : null, o.events === false ? 'NoEvents' : null, rows + 'row'].filter(Boolean).join('-') }), box,
      { parent: o.parent, fill: C((prof && prof.fill) || 'surface'), radius: calRad,
        stroke: (prof && prof.border === false) ? null : C((prof && prof.border) || 'border'), strokeW: 1 });
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
      // The selected day is a FILLED primary plate with onPrimary copy. `primary` is the light brand purple in this
      // file; white on it measures 2.87:1 (24 contrast findings on MiniCalendar·Spec, measured 2026-10-26). The filled
      // primary button already uses `primaryInk` for this reason, so the calendar's strongest state does too.
      if (isSel) ctx.plate(B(r.x, r.y, cell, cell), { name: 'sel·' + dnum, fill: C('primaryInk'), radius: 'control' });
      else if (dnum === today) ctx.plate(B(r.x + 1, r.y + 1, cell - 2, cell - 2), { name: 'today·' + dnum, fill: null, stroke: C('primaryInk'), strokeW: 1.5, radius: 'control' });
      if (!isSel && dnum === (o.hoverDay === undefined ? today : o.hoverDay) && (ST === 'hover' || ST === 'pressed'))
        ctx.plate(B(r.x, r.y, cell, cell), { name: 'day·' + (ST === 'pressed' ? 'pressed' : 'hover'), fills: CF.fills(null, ST), radius: 'control' });
      ctx.text(String(dnum), r, { size: 12, weight: isSel || dnum === today ? 600 : 400,
        color: isSel ? C('onPrimary') : (dnum === today ? C('ink') : (muted ? C('muted') : C('ink'))), align: 'center', valign: 'middle', refit: false });
      if (events.indexOf(dnum) >= 0 && !isSel) ctx.plate(B(r.x + cell / 2 - 2, r.y + cell - 6, 4, 4), { name: 'dot·' + dnum, fill: C('primaryInk'), radius: 'xs' });
      if (o.hit) ctx.hitPad(r, o.hit);                          // 32 cells are a desktop sidebar affordance; touch tiers pass 44
      if (o.marks && o.marks[dnum]) ctx.text(String(o.marks[dnum]), B(r.x, r.y + 1, cell, 12), { size: 11, role: 'axis', color: C('muted'), align: 'center', valign: 'top', refit: false });
    }
    await ctx.settle(); ctx.place();
    if (ST === 'focus') ctx.ring(fcell || box, { radius: CF.radius('control') });
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { cell: cell, radius: calRad },
      { family: 'calendar', state: ST });
    return ctx.host;
  };

  // ================================================================ D · Navigation (§3.4)

  /** Nav item — row 40 · icon 20 + 12 gap · collapsed rail 48 square · selected = soft container + 3px bar · group label 32 · count · submenu. */
  CF.navItem = async function (o) {
    o = o || {};
    // A dark app-shell row keeps the generic recipe (its material is the shell's, measured on page 10); a LIGHT nav row
    // on a recreation reads the source's own measurement — text weight, gap, corner, and how selection is expressed
    // (a wash + accent bar is an app idiom; a source header may select with ink + a 1px rule instead).
    var prof = o.onDark ? null : CF.profile('navigation', o.navType || 'navitem');
    var np = (prof && prof.size) || {};
    var L = CF.ladder(o.size || 'md');
    if (prof && np.fs) L = Object.assign({}, L, { fs: np.fs });
    var S = o.state || 'default';
    var rail = !!o.rail, group = !!o.group;
    var h = o.h || np.h || (group ? 32 : (rail ? 48 : (o.size === 'sm' ? 32 : 40)));
    var padX = group || rail ? (rail ? 0 : 12) : (o.padX !== undefined ? o.padX : (np.padX !== undefined ? np.padX : 12));
    var rad = o.radius !== undefined ? CF.radius(o.radius) : CF.radius(np.radius !== undefined ? np.radius : (rail ? 'control' : 'md'));
    var ic = o.iconSize || (rail ? 22 : 20);
    var label = String(o.label === undefined ? (group ? 'Workspace' : 'Overview') : o.label);
    var badge = o.badge === undefined || o.badge === false ? null : String(o.badge);
    var badgeW = badge ? CF.estW(badge, 12) + 10 : 0;
    var subW = o.submenu ? 24 : 0;
    var hasIcon = !group && o.icon !== false;
    var minW = np.minW !== undefined ? Number(np.minW) : (rail ? 48 : 88);
    var w = o.w || (rail ? 48 : max(minW, padX * 2 + (hasIcon ? ic + 12 : 0) + CF.estW(label, group ? 11 : L.fs) + badgeW + subW + 4));
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('NavItem', { type: group ? 'Group' : (rail ? 'Rail' : null), size: o.size, state: S,
             slot: [o.selected ? 'Selected' : null, slotName({ lead: hasIcon ? true : null, badge: badge ? true : null, submenu: o.submenu })].filter(Boolean).join('-') || null }), box,
      { parent: o.parent, radius: rad });
    if (group) {
      ctx.text(label.toUpperCase(), B(box.x + padX, box.y, box.w - padX * 2, box.h),
        { size: 12, color: o.onDark ? C('mutedOnInk') : C('muted'), weight: 600, opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
      await ctx.settle(); ctx.place();
      // A group label is still a nav item: without the birth stamp the gate reads it as generic-kit chrome.
      CF.profStamp(ctx.host, prof, { h: h, padX: padX, radius: CF.radius(np.radius !== undefined ? np.radius : 0), fs: 12 },
        { family: 'navitem', size: L.key, type: 'group', state: S, ink: o.onDark ? 'mutedOnInk' : 'muted' });
      return ctx.host;
    }
    var sel = !!o.selected;
    var selStyle = (prof && prof.selected) || {};
    var selFillTok = selStyle.fill !== undefined ? selStyle.fill : 'primarySoft';
    var selInkTok = selStyle.ink || (prof && prof.ink ? prof.ink : 'primary');
    var indicator = o.indicator === false ? false : (selStyle.indicator || (prof ? 'none' : 'bar'));
    var allowWash = !prof || prof.wash === true;
    // A nav row mounted on an ink shell (`o.onDark`, set by CF.sideNav for its dark variant) has to lift its copy: the
    // palette ink is the same #161616 as the panel (1.00:1) and the palette muted is 2.54:1. The light `primarySoft`
    // selection wash would also invert the panel polarity, so a dark row selects with a white state layer instead and
    // lets the accent bar carry the brand.
    ctx.host.fills = (sel && selFillTok && !o.onDark) ? CF.fills(C(selFillTok), (allowWash && S !== 'default') ? S : null)
      : CF.fills(null, (allowWash && S !== 'default') ? S : null, o.onDark ? { onDark: true } : undefined);
    var ink = o.onDark ? (S === 'disabled' ? C('mutedOnInk') : TONE.onDark.ink)
      : (S === 'disabled' ? C('muted') : (sel ? C(selInkTok) : C(np.ink || 'ink')));
    var x = box.x + padX;
    if (hasIcon) {
      if (rail) ctx.glyph(iconOf(o.icon, 'home'), B(box.x + (w - ic) / 2, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 2 });
      else { ctx.glyph(iconOf(o.icon, 'home'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 1.8 }); x += ic + 12; }
    }
    var labelW = CF.estW(label, L.fs);
    if (sel && indicator === 'bar')
      ctx.plate(rail ? B(box.x + w - 3, box.y + (h - 20) / 2, 3, 20) : B(box.x, box.y + (h - 20) / 2, 3, 20),
        { name: 'accent·bar', fill: C(selInkTok), radius: 'xs' });
    if (!rail) {
      ctx.text(label, B(x, box.y, box.w - (x - box.x) - padX - badgeW - subW, h),
        { size: L.fs, color: ink, weight: sel ? (prof && prof.selectedWeight ? prof.selectedWeight : 500) : (prof && prof.weight ? prof.weight : 400),
          opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
      // `underline` is a real selection idiom (a 1px rule under the label), not a decoration: sources that select a
      // nav item with colour + rule have no wash and no bar, and drawing a bar would be an invented idiom.
      if (sel && indicator === 'underline')
        ctx.plate(B(x, box.y + h - 1, max(8, labelW), 1), { name: 'accent·underline', fill: C(selInkTok) });
      var rx = box.x + box.w - padX;
      if (o.submenu) { rx -= 16; ctx.glyph(o.expanded ? 'chevronUp' : 'chevronRight', B(rx, box.y + (h - 16) / 2, 16, 16), { color: o.onDark ? C('mutedOnInk') : C('muted'), anchor: 'right' }); rx -= 8; }
      if (badge) {
        ctx.plate(B(rx - badgeW, box.y + (h - 18) / 2, badgeW, 18), { name: 'count', fill: sel ? C('primary') : C('surfaceAlt'), radius: 'control' });
        ctx.text(badge, B(rx - badgeW, box.y, badgeW, h), { size: 12, color: sel ? C('onPrimary') : C('muted'), weight: 600, refit: false });
      }
    }
    await ctx.settle(); ctx.place();
    if (!rail && !group) ctx.refit(padX);
    try { ctx.host.clipContent = false; } catch (e) {}
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: rad, offset: 0 });
    if (rail) ctx.hitPad(B(box.x, box.y, w, h), 44);
    // The rail item floats on hover/press like the other nav pills: without the family role the state was a fill
    // tint with 0 shadows, which is exactly what `hover_flat` indicts (measured 2026-10-27 on NavItem·Rail).
    CF.elevate(ctx.host, 'NavItem');
    CF.profStamp(ctx.host, prof, { h: h, padX: padX, radius: rad, fs: L.fs },
      { family: 'navitem', size: L.key, selected: sel, indicator: indicator, state: S, ink: sel ? selInkTok : (np.ink || 'ink') });
    return ctx.host;
  };

  /** One tab — line (2px ink bar) · enclosed · card · pill · vertical · icon · count · closable · disabled. */
  CF.tabs = async function (o) {
    o = o || {};
    var prof = CF.profile('navigation', 'tabs'), pp = (prof && prof.size) || {};
    var type = o.type || (prof && prof.type) || 'line', S = o.state || 'default';
    var L = CF.ladder(o.size || 'md');
    if (prof && pp.fs) L = Object.assign({}, L, { fs: pp.fs });
    var vert = o.direction === 'vertical';
    var h = o.h || pp.h || (type === 'pill' ? (o.size === 'sm' ? 28 : 32) : (o.size === 'sm' ? 32 : 40));
    var padX = o.padX === undefined ? (pp.padX !== undefined ? pp.padX : (type === 'pill' ? 14 : 16)) : o.padX;
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
    var tSel = (prof && prof.selected) || {};
    var tInk = tSel.ink || 'primary', tFill = tSel.fill;
    if (type === 'pill') ctx.host.fills = sel ? CF.fills(tFill ? C(tFill) : C('primarySoft'), S === 'default' ? null : S) : CF.fills(null, S === 'default' ? null : S);
    else if (type === 'enclosed' || type === 'card') ctx.host.fills = CF.fills(sel && type === 'enclosed' ? C('surface') : null, S === 'default' ? null : S);
    else ctx.host.fills = CF.fills(null, S === 'default' ? null : S);
    if (type === 'enclosed' || type === 'card') {
      var blH = (type === 'card' && !sel) ? 1 : 2;
      ctx.plate(B(box.x, box.y + box.h - blH, box.w, blH), { name: 'base·line', fill: sel ? C(tInk) : C('border') });
    }
    else if (sel) ctx.plate(vert ? B(box.x, box.y + 6, 3, box.h - 12) : B(box.x + (type === 'line' ? padX * 0.4 : 0), box.y + box.h - 2, box.w - (type === 'line' ? padX * 0.8 : 0), 2),
      { name: 'ink·bar', fill: C(tInk), radius: 'xs' });
    var ink = S === 'disabled' ? C('muted') : (sel ? C(tSel.labelInk || tInk) : C('ink'));
    var x = box.x + padX;
    if (ic) { ctx.glyph(iconOf(o.icon, 'grid'), B(x, box.y + (h - ic) / 2, ic, ic), { color: ink, strokeW: 1.8 }); x += ic + 8; }
    ctx.text(label, B(x, box.y, box.w - (x - box.x) - padX - countW - closeW + 4, h),
      { size: L.fs, color: ink, weight: sel ? (tSel.weight || 500) : ((prof && prof.weight) || 400), opacity: stateAlpha(S), align: 'left', valign: 'middle', refit: false });
    var rx = box.x + box.w - padX;
    if (o.closable) { rx -= 14; ctx.glyph('close', B(rx, box.y + (h - 14) / 2, 14, 14), { color: C('muted'), strokeW: 1.6, anchor: 'right' }); }
    if (countW) { rx -= countW; ctx.plate(B(rx, box.y + (h - 18) / 2, countW, 18), { name: 'count', fill: C('surfaceAlt'), radius: 'control' });
      ctx.text(String(o.count), B(rx, box.y, countW, h), { size: 12, color: C('muted'), weight: 600, refit: false }); }
    await ctx.settle(); ctx.place();
    if (!o.w) ctx.refit(padX);
    if (S === 'focus') ctx.ring(B(ctx.host.x, ctx.host.y, ctx.host.width, h), { radius: CF.radius('sm') });
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { h: h, padX: padX, fs: L.fs,
      radius: type === 'pill' ? CF.radius('control') : (type === 'card' ? CF.radius('sm') : 0) },
      { family: 'tabs', size: L.key, type: type, selected: sel, state: S });
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
        w: o.equal && sr ? sr.w : it.w, h: o.h2 || 40, label: it.label, icon: it.icon, count: it.count,
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
    var prof = CF.profile('navigation', 'breadcrumb'), pp = (prof && prof.size) || {};
    var items = o.items || ['Workspace', 'Projects', CF.brandName + ' design'];
    var fs = o.fs || pp.fs || 13, sepKind = o.sep || (prof && prof.sep) || 'chevron', h = o.h || max(22, fs + 8);
    var sepW = sepKind === 'slash' ? 10 : 16 + 8;
    var backW = o.back ? 24 + 8 : 0;
    var cells = items.map(function (it, i) {
      var t = typeof it === 'string' ? { label: it } : it;
      return { label: String(t.label === undefined ? '…' : t.label), glyph: t.glyph, menu: !!t.menu, last: i === items.length - 1 };
    });
    var total = backW;
    cells.forEach(function (c, i) { total += CF.estW(c.menu ? '…' : c.label, fs) + (c.glyph ? 18 : 0) + (c.menu ? 16 : 0) + (i < cells.length - 1 ? sepW : 0); });
    var box = B(o.x || 0, o.y || 0, o.w || max(64, total + 8), h);
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
        { size: fs, color: c.last ? C((prof && prof.ink) || 'ink') : C(o.onDark ? 'onPrimary' : ((prof && prof.linkInk) || 'ink')), weight: c.last ? ((prof && prof.weight) || 500) : 400,
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
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { fs: fs, sep: sepKind },
      { family: 'breadcrumb', state: o.state || 'default' });
    return ctx.host;
  };

  /** Pagination — cell 32 (24 sm / 40 lg) · prev/next chevron with disabled ends · boundary+sibling window · ellipsis · quick jump · size changer · total. */
  CF.pagination = async function (o) {
    o = o || {};
    var prof = CF.profile('navigation', 'pagination'), pp = (prof && prof.size) || {};
    var L = CF.ladder(o.size || 'md');
    if (prof && pp.fs) L = Object.assign({}, L, { fs: pp.fs });
    var cell = o.cell || pp.cell || (o.size === 'sm' ? 24 : (o.size === 'lg' ? 40 : 32));
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
    var cellRad = pp.radius !== undefined ? CF.radius(pp.radius) : CF.radius('sm');
    var selFill = (prof && prof.activeFill) || 'primaryInk';
    var cellBtn = function (bx, kind, sel) {
      var st = disabled ? 'disabled' : (sel ? 'selected' : (kind === 'num' && i === o.hover ? 'hover' : 'default'));
      var cb = ctx.plate(B(bx, cy, cell, cell), { name: 'cell·' + (sel ? 'active' : kind), fills: sel ? CF.fills(C(selFill), null) : CF.fills(null, st === 'hover' ? 'hover' : null),
        radius: cellRad, stroke: !sel && !disabled && (prof ? prof.border !== false : o.outlined) ? C((prof && prof.border) || 'border') : null, strokeW: 1 });
      // A source pagination cell is a RAISED ink tile wearing the control stack; the generic kit paints it flat. The
      // profile's elevation recipe is applied here so the active cell reads as the same object as the page's buttons.
      if (sel) {
        var eL = prof && prof.elevation;
        if (eL && storage.EL && storage.EL.has && storage.EL.has(eL)) storage.EL.apply(cb, eL);
      }
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
    if (S === 'focus') ctx.ring(fxB || B(box.x, cy, cell, cell), { radius: cellRad });
    await ctx.settle(); ctx.place();
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { cell: cell, radius: cellRad, fs: L.fs },
      { family: 'pagination', size: String(o.size || 'md').toLowerCase(), state: S });
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
      // The active node carries the white step number: white on the 6-level hue is 3.56:1, so the fill is the tone's
      // INK step (§4: the 7–8 level is the only one allowed to carry copy; 4.72:1 here).
      ctx.ellipse(B(nx, ny, cs, cs), { name: 'node·' + st, fill: st === 'process' ? C('primaryInk') : (st === 'error' ? C('surface') : (st === 'finish' ? C('surface') : C('surfaceAlt'))),
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
          ctx.plate(B(box.x + cs / 2 - 1, ny + cs, 2, max(4, vrow - cs)),
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
    if (ST === 'focus' && focusBox) ctx.ring(focusBox, { radius: 'full' });
    return ctx.host;
  };

  /** Dropdown menu — panel 200-280 pad 4-8 · item 32 · icon 16 + label + shortcut (muted, right) + submenu chevron · group label · divider · danger · selectable. */
  CF.menu = async function (o) {
    o = o || {};
    var prof = CF.profile('navigation', 'menu'), pp = (prof && prof.size) || {};
    var raw = o.items || ['Edit', 'Duplicate', '-', 'Share', 'Delete'];
    var w = o.w || 220, itemH = o.itemH || pp.itemH || 32, padX = o.padX === undefined ? (pp.padX !== undefined ? pp.padX : 12) : o.padX,
      padV = o.padV === undefined ? (pp.padV !== undefined ? pp.padV : 4) : o.padV;
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
    var mFill = (prof && prof.fill) || 'surface';
    var mRad = pp.radius !== undefined ? CF.radius(pp.radius) : CF.radius('md');
    var ctx = CF.build(CF.name('Menu', { type: o.variant === 'submenu' ? 'Submenu' : (o.selectable ? 'Selectable' : null), state: o.state,
      // the leading 16px glyph column IS the menu's icon slot, so the host name has to say so (§4 coverage reads names).
      slot: [hasKeys ? 'Shortcuts' : null, hasIcons ? 'IconStart' : 'NoIcon'].filter(Boolean).join('-') || null }), box,
      { parent: o.parent, fill: C(mFill), radius: mRad, stroke: (prof && prof.border === false) ? null : C((prof && prof.border) || 'border'), strokeW: 1, shadow: o.flat ? 0 : 3 });
    var mElev = prof && prof.elevation;
    if (mElev && storage.EL && storage.EL.has && storage.EL.has(mElev)) storage.EL.apply(ctx.host, mElev);
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
    if (prof && prof._family) CF.profStamp(ctx.host, prof, { itemH: itemH, padX: padX, padV: padV, radius: mRad },
      { family: 'menu', state: o.state || 'default' });
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
    ctx.plate(B(box.x + 1, y - 5, box.w - 2, 1), { name: 'boundary·search', fill: C('border') });
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
      ctx.plate(B(box.x + 1, fy - 6, box.w - 2, 1), { name: 'boundary·footer', fill: C('border') });
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
        { size: fs, color: on ? C('primary') : (it.disabled ? C('muted') : ((ST === 'hover' || ST === 'pressed') ? C('ink') : '#52525B')), weight: on ? 500 : 400,
          opacity: it.disabled ? CF.STATE.disabledContent : 1, align: 'left', valign: 'middle', refit: false });
      // The counter sits on the same row plate as the label: muted on the hover wash is 4.11:1, so a washed row lifts it.
      if (o.counters) ctx.text(String(it.count === undefined ? (i + 1) * 3 : it.count), B(box.x + box.w - 30, ly, 22, rowH),
        { size: 12, color: (on || ST === 'hover' || ST === 'pressed') ? C('ink') : C('muted'), align: 'right', valign: 'middle', refit: false });
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

  /** Alert — severity icon 20 · title 14/500 + body 13 · close 16 · action row · soft tint or filled · banner = full-bleed, no radius.
      A source with no alert component declares a DERIVED material in `feedback.alert` (`{material, fill, radius,
      derived:true}` — source-adaptation §4): a plate built from a material the source does own. With no profile the
      generic path is the tone's own wash, and no elevation recipe is invented. */
  CF.alert = async function (o) {
    o = o || {};
    var tone = o.tone || 'info', banner = o.variant === 'banner', filled = o.variant === 'filled';
    var soft = TONEMAP[tone] || TONEMAP.info;
    var A = CF.profile('feedback', 'alert') || {};
    // §4: a tinted alert is ink copy on the wash, a filled alert is white copy on the ink surface. The base hue stays on
    // the accent bar and the icon — graphics need 3:1, copy needs 4.5, and the base hue never reaches it on its own tint.
    var deep = C(soft[2]), fg = C(soft[1]);
    // A derived material is a NEUTRAL plate with a tone-coloured icon; the generic default is the tone wash itself.
    var bgc = filled ? deep : C(A.fill || (A.material ? 'surfaceAlt' : soft[0]));
    var rad = banner ? 0 : (A.radius === undefined ? CF.radius('lg') : CF.radius(Number(A.radius)));
    var ink = filled ? C('onPrimary') : C('ink');
    var iconInk = A.icon === false ? null : (filled ? C('onPrimary') : (A.iconInk ? C(A.iconInk) : deep));
    var title = o.title !== undefined ? String(o.title) : (o.message !== undefined ? String(o.message) : 'Changes published');
    var desc = o.description !== undefined ? String(o.description) : (o.title !== undefined && o.message !== undefined ? String(o.message) : null);
    var fs = o.fs || A.fs || 14, dfs = o.descFs || A.descFs || 13;
    var padX = o.padX === undefined ? (A.padX !== undefined ? A.padX : 16) : o.padX;
    var padY = o.padY === undefined ? (A.padY !== undefined ? A.padY : 12) : o.padY;
    var iconW = (o.icon === false || A.icon === false) ? 0 : 20 + 12, closeW = o.closable ? 16 + 12 : 0;
    var acts = o.actions ? (Array.isArray(o.actions) ? o.actions : [String(o.actions)]) : null;
    var actW = acts ? acts.reduce(function (a, s) { return a + CF.estW(String(s), 13) + 24; }, 0) : 0;
    var contentW = max(CF.estW(title, fs), desc ? CF.estW(desc, dfs) : 0, actW);
    var w = o.w || (banner ? 960 : max(260, padX * 2 + iconW + closeW + contentW));
    var h = padY * 2 + fs + 4 + (desc ? dfs + 6 : 0) + (acts ? 12 + 20 : 0);
    var box = B(o.x || 0, o.y || 0, w, h);
    var ctx = CF.build(CF.name('Alert', { type: banner ? 'Banner' : (filled ? 'Filled' : (desc ? 'Description' : null)), tone: tone, state: o.state, slot: o.closable ? 'Dismissible' : null }), box,
      { parent: o.parent, radius: rad });
    ctx.host.fills = [{ fillColor: bgc, fillOpacity: 1 }];
    if (o.leftBar === true && A.bar !== false) ctx.plate(B(box.x, box.y, 3, box.h), { name: 'accent·bar', fill: filled ? C('surface') : fg });
    var x = box.x + padX;
    if (iconW) { ctx.glyph(SEVERITY_GLYPH[tone] || 'info', B(x, box.y + padY - 1, 20, 20), { color: iconInk, strokeW: 1.8 }); x += 20 + 12; }
    ctx.text(title, B(x, box.y + padY - 1, contentW, fs + 6), { size: fs, color: ink, weight: 600, align: 'left', valign: 'top', refit: false });
    var yy = box.y + padY + fs + 5;
    if (desc) { ctx.text(desc, B(x, yy, contentW, dfs + 6), { size: dfs, color: filled ? C('onPrimary') : C('muted'), opacity: filled ? 0.92 : 1, align: 'left', valign: 'top', refit: false }); yy += dfs + 6; }
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
    var EL = storage.EL;
    // The recipe is applied only when the profile names one that the elevation engine actually holds: a fallback name
    // typed here would either no-op or, worse, borrow another family's material.
    var aRole = A.material && EL && EL.has && EL.has(A.material) ? A.material : null;
    if (aRole && !filled && !banner) EL.apply(ctx.host, aRole);
    try { ctx.host.setPluginData('nl:fb', JSON.stringify({ family: 'alert', material: A.material || null, fill: A.fill || null, radius: A.radius === undefined ? CF.radiusToken(rad) : A.radius, derived: !!A.derived })); } catch (e) {}
    if (A._family) CF.profStamp(ctx.host, A, { radius: rad, fill: A.fill || (A.material ? 'surfaceAlt' : soft[0]), material: A.material || null, padX: padX, padY: padY, fs: fs },
      { family: 'alert', tone: tone, variant: o.variant || null, derived: !!A.derived, elevation: aRole });
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

  /** Toast — compact dark/light pill · icon 18 + 13-14 copy · optional action link · auto-dismiss meter 2-3px.
      A source with no toast declares a DERIVED material in `feedback.toast` (`{material, fill, radius, derived:true}`);
      the factory applies that recipe only when the elevation engine holds it, and never names one of its own. */
  CF.toast = async function (o) {
    o = o || {};
    var tone = o.tone || 'neutral', dark = o.surface !== 'light';
    var T = CF.profile('feedback', 'toast') || {};
    var msg = String(o.message === undefined ? 'Saved to the cloud' : o.message);
    var fs = o.fs || T.fs || 13;
    var padx = o.padX === undefined ? (T.padX !== undefined ? T.padX : 12) : o.padX;
    var pady = o.padY === undefined ? (T.padY !== undefined ? T.padY : 10) : o.padY;
    var iconW = o.icon === false ? 0 : 18 + 8;
    var actW = o.action ? CF.estW(String(o.action), fs) + 12 : 0;
    var meterH = o.duration ? 3 : 0;
    var w = o.w || (padx * 2 + iconW + CF.estW(msg, fs) + actW + (actW ? 8 : 0));
    var h = pady * 2 + fs + 6 + meterH;
    var box = B(o.x || 0, o.y || 0, max(120, w), h);
    var tRad = T.radius === undefined ? CF.radius('sm') : CF.radius(Number(T.radius));
    var tFill = dark ? C(T.fill || 'darkRaised') : C(T.fillLight || 'surface');
    var ctx = CF.build(CF.name('Toast', { type: dark ? 'Dark' : 'Light', tone: tone, slot: o.action ? 'Action' : (o.duration ? 'Timed' : null) }), box,
      { parent: o.parent, fill: tFill, radius: tRad, stroke: dark ? null : C('border'), strokeW: 1, shadow: T.material ? 0 : (dark ? 3 : 2) });
    var ink = dark ? C(T.ink || 'onPrimary') : C('ink');
    var x = box.x + padx;
    if (iconW) { ctx.glyph(SEVERITY_GLYPH[tone] || 'check', B(x, box.y + pady + (CF.lineH(fs) - 18) / 2, 18, 18), { color: tone === 'neutral' ? ink : C(TONEMAP[tone] ? TONEMAP[tone][1] : 'success'), strokeW: 1.8 }); x += 18 + 8; }
    ctx.text(msg, B(x, box.y + pady, box.w - (x - box.x) - padx - actW - (actW ? 8 : 0), fs + 6),
      { size: fs, color: ink, align: 'left', valign: 'top', refit: false });
    if (actW) ctx.text(String(o.action), B(box.x + box.w - padx - actW + 4, box.y + pady, actW - 4, fs + 6),
      { size: fs, color: dark ? C('onPrimary') : C('primary'), weight: 600, align: 'right', valign: 'top', refit: false, underline: true });
    if (meterH) {
      // FULL-WIDTH, FUSED WITH THE CARD — and TRIMMED BY THE CARD ITSELF. The bar spans the edge exactly, and the host
      // carries `clipContent = true` so the pill clips its ends: one silhouette, the same mechanism
      // `Avatar·LG·Status·online` uses for its presence badge (measured 2026-10-26: that host is r9999 with clip=true
      // and a 17px badge at its edge). `clipContent` clips CHILDREN only, so the card's own shadow is untouched. An
      // inset bar read detached and a separate `clip·` wrapper lost its absolute children on the next shelf move.
      try { ctx.host.clipContent = true; } catch (e) {}
      ctx.plate(B(box.x + 1, box.y + box.h - meterH, box.w - 2, meterH), { name: 'meter·track', fill: dark ? ink : C('ink'), opacity: 0.12 });
      ctx.plate(B(box.x + 1, box.y + box.h - meterH, max(4, (box.w - 2) * (o.remaining === undefined ? 0.62 : Number(o.remaining))), meterH),
        { name: 'meter', fill: dark ? ink : C('primary'), opacity: dark ? 0.85 : 1 });
    }
    await ctx.settle(); ctx.place();
    var EL = storage.EL;
    var tRole = T.material && EL && EL.has && EL.has(T.material) ? T.material : null;
    if (tRole) EL.apply(ctx.host, tRole);
    try { ctx.host.setPluginData('nl:fb', JSON.stringify({ family: 'toast', material: T.material || null, fill: dark ? (T.fill || 'darkRaised') : (T.fillLight || 'surface'), radius: T.radius === undefined ? CF.radiusToken(tRad) : T.radius, derived: !!T.derived })); } catch (e) {}
    if (T._family) CF.profStamp(ctx.host, T, { radius: tRad, fill: dark ? (T.fill || 'darkRaised') : (T.fillLight || 'surface'), material: T.material || null, padX: padx, padY: pady, fs: fs },
      { family: 'toast', tone: tone, surface: dark ? 'dark' : 'light', derived: !!T.derived, elevation: tRole });
    return ctx.host;
  };

  /** Tooltip — small copy · dark by default · optional arrow on any side · optional title line.
      Every measurement below is a GENERIC fallback; a recreation reads `feedback.tooltip` (source-adaptation §2), so
      the padding, corner, leading, shadow and arrow are the source's, not this file's. */
  CF.tooltip = async function (o) {
    o = o || {};
    var R = CF.profile('feedback', 'tooltip') || {};
    var padX = o.padx !== undefined ? o.padx : (R.padX !== undefined ? R.padX : 10);
    var padY = o.pady !== undefined ? o.pady : (R.padY !== undefined ? R.padY : 7);
    // `fs` may be declared as a list (a source whose tooltip carries two sizes); the draw takes the first.
    var rfs = Array.isArray(R.fs) ? R.fs[0] : R.fs;
    var fs = o.fs || rfs || 12;
    var lhPx = o.lineHeight || R.lineHeight || Math.round(fs * 1.4);
    var radius = R.radius === undefined ? CF.radius('sm') : CF.radius(Number(R.radius));
    var shadow = R.shadow === undefined ? 1 : Number(R.shadow);
    var depth = R.arrowDepth === undefined ? 5 : Number(R.arrowDepth);
    var brand = o.brand || o.surface === 'brand';
    var dark = o.surface !== 'light';
    var fill = brand ? C('primary') : (dark ? C(R.fill || 'ink') : C('surface'));
    var ink = (dark || brand) ? C(R.ink || 'onPrimary') : C('ink');
    // Placement is an axis of the family, not a hint: `placement`/`arrowSide` choose the arrow side and the
    // host expansion. `title` is COPY, so a boolean is a flag (`withTitle`) and never a rendered "true".
    var placed = String(o.placement || o.arrowSide || (R.arrow ? 'top' : '')).toLowerCase();
    if (['top', 'bottom', 'left', 'right'].indexOf(placed) < 0) placed = '';
    var title = (typeof o.title === 'string' && o.title.length) ? o.title
      : ((o.withTitle || o.title === true) ? String(o.titleText || 'Keyboard shortcut') : null);
    var msg = String(o.text === undefined ? 'Copy the link first' : o.text);
    var tw = Math.max(CF.estW(msg, fs), title ? CF.estW(title, fs) : 0);
    var panelW = Math.max(48, padX * 2 + tw);
    var panelH = padY * 2 + lhPx + (title ? lhPx : 0);
    // The arrow is a profile decision: a source that draws one gets one, a source that does not gets a plain bubble.
    var arrow = o.arrow === false ? null : (placed || null);
    var panel = B((o.x || 0) + (arrow === 'left' ? depth : 0), (o.y || 0) + (arrow === 'top' ? depth : 0), panelW, panelH);
    var bb = arrow ? bubbleBox(panel, arrow, depth) : { host: panel, panel: panel, at: 0, depth: 0, side: null };
    var ctx = CF.build(CF.name('Tooltip', { type: brand ? 'Brand' : (dark ? 'Dark' : 'Light'), variant: arrow ? cap(arrow) : null, slot: title ? 'Title' : null }), bb.host, { parent: o.parent });
    if (arrow) bubbleDraw(ctx, bb, { fill: fill, stroke: (dark || brand) ? null : C('border'), radius: radius, shadow: shadow });
    else {
      ctx.host.fills = [{ fillColor: fill, fillOpacity: 1 }];
      ctx.host.borderRadius = radius;
    }
    var y = panel.y + padY;
    if (title) { ctx.text(title, B(panel.x + padX, y, panel.w - padX * 2, lhPx), { size: fs, color: ink, weight: 600, valign: 'top', refit: false }); y += lhPx; }
    ctx.text(msg, B(panel.x + padX, y, panel.w - padX * 2, lhPx), { size: fs, color: ink, weight: 400, valign: 'top', refit: false });
    // A profile can pin the leading to something the body ramp does not carry; set the exact ratio before place()
    // measures the text centre, or the copy lands off-axis.
    ctx.pend.forEach(function (h) { try { h.t.lineHeight = String(lhPx / fs); } catch (e) {} });
    await ctx.settle(); ctx.place();
    if (!shadow) {
      try { ctx.host.shadows = []; } catch (e) {}
      try { ctx.kids.forEach(function (k) { k.shadows = []; }); } catch (e) {}
    }
    var surface = brand ? 'brand' : (dark ? 'dark' : 'light');
    try { ctx.host.setPluginData('nl:fb', JSON.stringify({ family: 'tooltip', radius: radius, padX: padX, padY: padY, fs: fs, lineHeight: lhPx, shadow: shadow, arrow: !!arrow, placement: arrow || 'none', surface: surface })); } catch (e) {}
    CF.profStamp(ctx.host, CF.profile('feedback', 'tooltip'), { padX: padX, padY: padY, radius: radius, shadow: shadow, fs: fs, arrow: !!arrow },
      { family: 'tooltip', placement: arrow || 'none', surface: surface });
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
    // One row, one axis: the mark is centred on the copy's LINE BOX (13px at leading 1.85 is 25px tall), not on its
    // top — a 20px icon at the text's y put its ink centre 3px above the message (measured 2026-10-27, rule 45b).
    ctx.glyph(SEVERITY_GLYPH[tone] || 'warning', B(panel.x + pad, panel.y + pad + (CF.lineH(title ? fs : dfs) - 20) / 2, 20, 20), { color: C(soft[1]), strokeW: 1.8 });
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

  /** SourceModal — the SOURCE's media modal, not a generic dialog. Everything that makes it the source's is declared in
      `feedback.modal`: `{radius, border, bodyPad, scrim, anchor, headerH, panelW/panelH, mediaFill, closeInk, variants}`.
      `o.variant` selects a profile variant (the first declared one is the default) and also names the master, so the
      component names stay the project's, not this file's. With no modal profile it delegates to `CF.modal` — inventing a
      "source" modal out of defaults is exactly the drift rule 56 reports. */
  CF.sourceModal = async function (o) {
    o = o || {};
    var M = CF.profile('feedback', 'modal');
    if (!M) return CF.modal(o);
    var vs = M.variants || {};
    var vkeys = CF.variantKeys(vs);
    var variant = vkeys.indexOf(String(o.variant)) >= 0 ? String(o.variant) : (o.variant ? String(o.variant) : (vkeys[0] || 'default'));
    // the merged read: a variant overrides the family, so every value below has exactly one source of truth
    var V = CF.profile('feedback', 'modal', variant) || M;
    var W = o.w || V.w || 720, H = o.h || V.h || 620, x = o.x || 0, y = o.y || 0;
    var anchor = V.anchor || 'center';
    var rad = V.radius === undefined ? 0 : CF.radius(Number(V.radius));
    var bw = V.border === undefined ? 0 : Number(V.border);
    var pad = V.bodyPad === undefined ? 0 : Number(V.bodyPad);
    var scrim = V.scrim === undefined ? 0.45 : Number(V.scrim);
    var bar = V.headerH !== undefined ? Number(V.headerH) : 44;
    var ctx = CF.build(CF.name('Modal', { type: o.type || variant.charAt(0).toUpperCase() + variant.slice(1) }), B(x, y, W, H),
      { parent: o.parent, radius: 'none' });
    ctx.host.fills = [{ fillColor: C(V.scrimFill || 'ink'), fillOpacity: scrim }];
    var pw = Math.round(W * Number(V.panelW !== undefined ? V.panelW : 0.72));
    var ph = Math.round(H * Number(V.panelH !== undefined ? V.panelH : (anchor === 'right' ? 1 : 0.58)));
    var px = anchor === 'right' ? W - pw : Math.round((W - pw) / 2);
    var py = anchor === 'right' ? 0 : Math.round((H - ph) / 2);
    var pbox = B(x + px, y + py, pw, ph);
    var panel = ctx.plate(pbox, { name: 'modal·panel', fill: C(V.panelFill || 'surfaceRaised'), radius: rad });
    if (bw) ctx._stroke(panel, C(V.borderInk || 'border'), bw);
    if (o.media !== false && ph > bar + 40) ctx.plate(B(pbox.x + bw + pad, pbox.y + bar, pbox.w - (bw + pad) * 2, pbox.h - bar - bw - pad),
      { name: 'media·modal', fill: C(V.mediaFill || 'ink'), radius: V.mediaRadius === undefined ? rad : CF.radius(Number(V.mediaRadius)) });
    ctx.glyph('close', B(pbox.x + pbox.w - 16 - 16, pbox.y + (bar - 16) / 2, 16, 16), { color: C(V.closeInk || 'ink'), strokeW: 1.6 });
    await ctx.settle(); ctx.place();
    try { ctx.host.setPluginData('nl:fb', JSON.stringify({ family: 'modal', variant: variant, radius: rad, border: bw, bodyPad: pad, scrim: scrim })); } catch (e) {}
    CF.profStamp(ctx.host, V, { radius: rad, border: bw, bodyPad: pad, scrim: scrim, headerH: bar },
      { family: 'modal', variant: variant, derived: !!V.derived });
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
      if (i) ctx.plate(B(box.x + pad, y, box.w - pad * 2, 1), { name: 'boundary·row' + i, fill: C('border') });
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
    if (safe) ctx.plate(B(box.x, box.y + box.h - safe, box.w, safe), { name: 'safe·area', fill: C('surfaceAlt'), opacity: 0.5, radius: 'md' });
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
    // A footer's legal row is separated from the link columns by a REGION boundary, not by a content divider:
    // naming it `hairline·` made rule 43 read it as a separator that whitespace should have bought.
    ctx.plate(B(legal.x, legal.y - 16, legal.w, 1), { name: 'boundary·legal', fill: dark ? '#FFFFFF' : C('border'), opacity: dark ? 0.14 : 1 });
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
    // The matrix skeleton is a native-flow composition; the engine is seeded after this file, so bind it here instead
    // of reading a global that a fetched `new Function` scope does not have.
    var NL = storage.NL;
    if (!NL) return { err: 'CF.matrix needs storage.NL — seed native_layout.js first' };
    var rows = o.rows || [];
    var axes = o.axes || ['default'];
    // SPACING IS TOKEN-SOURCED (design-guide §1.5; gates `free_layout` + `space_off_scale`): the sheet arranges its
    // content with flow rowGap/columnGap/padding or a grid — never free coordinates. Every gap/pad resolves through
    // LY.breath to an LY.SPACE member; a caller override is snapped to the scale, never trusted raw. The cell hosts
    // keep world-absolute interiors (measured: a board's absolute children do NOT follow its shell), so each host is
    // attached to its flow slot the one proven way: appendChild (drag, world preserved) + CF.move (delta repair).
    var SPACE = (storage.LY && storage.LY.SPACE) || [0, 2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 128];
    var onScale = function (v) {
      var n = Number(v), best = SPACE[0];
      for (var i = 0; i < SPACE.length; i++) if (Math.abs(SPACE[i] - n) < Math.abs(best - n)) best = SPACE[i];
      return best;
    };
    var br = function (lv) {
      return (storage.LY && storage.LY.breath) ? storage.LY.breath(lv, 'web') : ({ inline: 8, block: 16, group: 24 }[lv]);
    };
    var GAPC = onScale(o.gapX === undefined ? br('block') : o.gapX);    // cell ↔ cell (default breath block = 16)
    var GAPR = onScale(o.gapY === undefined ? br('block') : o.gapY);    // row ↔ row
    var PADX = onScale(o.padX === undefined ? br('group') : o.padX);    // board padding, horizontal
    var PADY = onScale(o.padY === undefined ? br('group') : o.padY);    // board padding, vertical
    var labelW = o.labelW === undefined ? 168 : o.labelW;               // a WIDTH, not a gap: stays a size
    var pitch = o.colW || 136, cellH = o.cellH || 40;
    var rowH = function (r) { return N((r && r.cellH) || cellH); };
    var headH = o.title === false ? 0 : 40, stateRowH = axes.length > 1 ? 28 : 0;
    var fam = o.family || 'Component';
    var box = B(o.x || 0, o.y || 0, o.w || 1000, 100);
    var specName = o.specName || CF.name(fam, { slot: 'Spec' });
    var ctx = CF.build(specName, box,
      { parent: o.parent, fill: C('surface'), radius: CF.radius('spec'), stroke: C('border'), strokeW: 1 });
    var titleText = String(o.title === undefined ? fam + ' · variants' : o.title);
    // THE CANVAS IS KNOWN BEFORE ANY CELL IS DRAWN — a fluid specimen has to be fitted before it is measured.
    var CANVAS = o.canvasW === undefined ? 1760 : Number(o.canvasW);
    // FLUID SPECIMENS — a table row is a flow CONTAINER: its 735px is the width of the demo table, not the width its
    // anatomy needs (`CF.tableRow` derives every column from `o.w`). Fragmenting the state ladder to fit five of them
    // throws away the one thing a matrix is for — comparing states across the row. So when the natural copies cannot
    // stand side by side, PROBE a fitted width first: the factory must honour `w` (a fixed-size control ignores it)
    // and no copy may overrun the narrower host. Both are measured, nothing is declared. Only when the probe fails
    // does the sheet fall back to the grouped grid.
    var fluidW = 0;
    var colN0 = Math.max(axes.length, rows.reduce(function (m, rr) { return max(m, (rr.cells && rr.cells.length) || 1); }, 0));
    if (colN0 > 1 && rows.length && rows[0].factory && CF[rows[0].factory]) {
      var probeAt = async function (wArg) {
        var popts = Object.assign({}, rows[0].props || {}, (rows[0].cells && rows[0].cells[0]) || {},
          { parent: ctx.host, x: N(PADX + labelW + GAPC), y: N(PADY + headH + stateRowH + 90000) });
        if (!popts.size) popts.size = 'md';
        if (wArg) popts.w = wArg;
        var pfn = CF[rows[0].factory], ph = null;
        try { ph = await pfn(popts); } catch (e) { return null; }
        return ph;
      };
      var nat = await probeAt(null);
      if (nat) {
        var natW = N(nat.width);
        try { nat.remove(); } catch (e) {}
        if (PADX * 2 + labelW + colN0 * natW + (colN0 - 1) * GAPC > CANVAS) {
          // snap DOWN to the 4px grid: an unfitted 303px column is off-grid copy (gate `off_grid`)
          var fit = Math.floor((CANVAS - PADX * 2 - labelW - (colN0 - 1) * GAPC) / colN0 / 4) * 4;
          if (fit >= 120) {
            var ok = await probeAt(fit);
            if (ok) {
              var honored = Math.abs(N(ok.width) - fit) <= 2;
              var overrun = false;
              (function walk(k) {
                Array.from(k.children || []).forEach(function (c) {
                  if (c.type === 'text' && N(c.x) + N(c.width) > N(ok.x) + N(ok.width) + 1) overrun = true;
                  walk(c);
                });
              })(ok);
              try { ok.remove(); } catch (e) {}
              if (honored && !overrun) fluidW = fit;
            }
          }
        }
      }
      await ctx.settle();
    }
    // ---- phase 1: draw every cell host (absolute, provisional token slot) and measure it.
    var drawn = [], maxCells = 0, stackI = 0;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r], cells = row.cells && row.cells.length ? row.cells : [{}];
      drawn[r] = []; maxCells = max(maxCells, cells.length);
      for (var c = 0; c < cells.length; c++) {
        var opts = Object.assign({}, row.props || {}, cells[c] || {});
        if (!opts.size) opts.size = 'md';
        // a fitted fluid specimen: every cell is RE-INSTANTIATED at the column width (never scaled), so the factory
        // re-lays out its own columns and the state ladder stays readable across one row
        if (fluidW && opts.w === undefined) opts.w = fluidW;
        opts.parent = ctx.host;
        // Phase-1 anti-overlap: these hosts are transients (phase 3 attaches them to measured slots). A vertical stack
        // means an interrupted call leaves a readable column instead of a pile of controls at a 112px pitch that are
        // 2-5x wider than that pitch. The final geometry still comes from the measured grid below.
        opts.x = N(PADX + labelW + GAPC);
        opts.y = N(PADY + headH + stateRowH + (stackI++) * 440);
        var fn = CF[row.factory];
        if (!fn) { matrixWarn(row.factory); continue; }
        var host = null;
        var kidCount = ctx.host.children ? Array.from(ctx.host.children).length : 0;
        try { host = await fn(opts); } catch (e) {
          // A factory creates its host before it draws content, so a throw half-way leaves an orphan owned by no
          // row: it lands on top of the next row (audit_layout stroke_covered). Remove what the throw produced.
          matrixWarn(row.factory + ' threw ' + e.message);
          var orphanKids = Array.from(ctx.host.children || []);
          for (var k = kidCount; k < orphanKids.length; k++) { try { orphanKids[k].remove(); } catch (e2) {} }
          continue;
        }
        if (!host) { matrixWarn(row.factory + ' returned null'); continue; }
        drawn[r][c] = host;
      }
    }
    await ctx.settle();
    // ---- phase 2: the sheet's own copy, queued through ctx (pend → place). Creation order is the contract the
    // skeleton consumes: [title, subtitle?] axis×N (per row: label, note?) … note lines.
    if (headH) {
      ctx.text(titleText, B(box.x + PADX, box.y + PADY, 400, 28),
        { size: 20, color: C('ink'), weight: 600, align: 'left', valign: 'middle', refit: false });
      if (o.subtitle) ctx.text(String(o.subtitle), B(box.x + PADX + 420, box.y + PADY + 6, 320, 20),
        { size: 13, color: C('muted'), align: 'right', valign: 'middle', refit: false });
    }
    if (stateRowH) axes.forEach(function (a) {
      ctx.text(String(a), B(box.x + PADX + labelW, box.y + PADY + headH, pitch, stateRowH - 6),
        { size: 11, role: 'axis', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false });
    });
    var rowLabelTs = [];
    rows.forEach(function (row, i) {
      var lh = ctx.text(String(row.label === undefined ? row.factory : row.label), B(box.x + PADX, box.y + PADY + headH + stateRowH + i * (rowH(row) + GAPR), labelW, rowH(row)),
        { size: 13, color: C('ink'), weight: 500, align: 'left', valign: 'middle', refit: false });
      if (lh && lh.t) rowLabelTs.push(lh.t);
      if (row.note) {
        var nh = ctx.text(String(row.note), B(box.x + PADX, box.y + PADY + headH + stateRowH + i * (rowH(row) + GAPR) + rowH(row), labelW, 14),
          { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
        if (nh && nh.t) rowLabelTs.push(nh.t);
      }
    });
    // The spec sheet is a page canvas artifact, not a 1000px card: widen it to the measured content (up to 1760)
    // BEFORE wrapping. A 204px control × 5 states needs 1296px; clamping to 1000 wrapped each row into two lines,
    // whose second line landed in the next row's label band (measured 2026-10-26 on NumberField·Spec). Wrapping is
    // reserved for sheets whose measured content genuinely exceeds the canvas. `CANVAS` is resolved above, before
    // phase 1, because a fluid specimen has to be fitted before it is measured.
    var innerW = max(1, N((Math.min(o.maxW || 1000, CANVAS)) - PADX * 2));
    if (o.notes) CF.wrap(String(o.notes), innerW * 0.94, 12).slice(0, 3).forEach(function (ln) {
      ctx.text(ln, B(box.x + PADX, box.y + PADY, innerW, 14), { size: 12, color: C('muted'), align: 'left', valign: 'top', refit: false });
    });
    var pendTs = (ctx.pend || []).map(function (h) { return h.t; });   // creation order
    await ctx.settle(); ctx.place();
    // THE LABEL COLUMN IS MEASURED, NOT ASSUMED. A fixed 100px label column let "Sorted descending" (119px) run 7px
    // into the TableHeader slot — and the single-axis fallback used wrap rows instead of a grid, so the text and the
    // control never shared a cell contract. The rendered label widths are read after place; the column grows to the
    // longest label/note + 8px, rounded to the 4px grid. Every matrix whose content fits is now a GRID (even one
    // data column), exactly like MultiSelect; the wrap fallback is only for a sheet wider than the canvas.
    var labelWEff = labelW;
    rowLabelTs.forEach(function (t) { var w = Number(t.width) || 0; if (w + 8 > labelWEff) labelWEff = w + 8; });
    labelWEff = Math.ceil(labelWEff / 4) * 4;
    // ---- phase 3: flow skeleton. Frames (slots) are the flow children — they own no world-pinned interior, so the
    // engine may position them freely; the drawn hosts are attached into their settled slot afterwards.
    var colN = Math.max(axes.length, maxCells), colW = [];
    for (var ci = 0; ci < colN; ci++) {
      var mw = pitch;
      for (var ri = 0; ri < rows.length; ri++) if (drawn[ri] && drawn[ri][ci]) mw = max(mw, N(drawn[ri][ci].width));
      colW[ci] = N(mw);
    }
    var needW = PADX * 2 + labelWEff + (colN ? GAPC + colW.reduce(function (a, w) { return a + w + GAPC; }, -GAPC) : 0);
    var fitW = min(N(max(160, needW)), CANVAS);
    try { ctx.host.resize(fitW, ctx.host.height); } catch (e) {}
    var attach = [], flowKids = [], ti = 0;
    if (headH) {
      var headRow = NL.row('head·' + fam, { justify: 'space-between', align: 'center', rowGap: GAPC, columnGap: GAPC });
      NL.add(ctx.host, headRow, 'fill', 'auto');
      flowKids.push(headRow);
      var ht = pendTs.slice(ti, ti + (o.subtitle ? 2 : 1)); ti += ht.length;
      ht.forEach(function (t) { try { t.layoutChild.absolute = false; } catch (e) {} try { headRow.appendChild(t); NL.sizing(t, 'auto', 'auto'); } catch (e) {} });
    }
    var axisTs = stateRowH ? pendTs.slice(ti, ti + axes.length) : []; ti += axisTs.length;
    // ONE measure decides both shapes: can every state column stand in the same row? `groupNeed(colN)` is the same
    // sum the classic grid would use, so the two branches can never disagree about whether the sheet fits — the old
    // pair of formulas put a fitted TableRow sheet into the grouped branch with one group, printing the state names
    // once per variant instead of once on the axis.
    var groupNeed = function (kk) {
      var w = 0;
      for (var j = 0; j < kk; j++) { var mw = pitch; for (var s = j; s < colN; s += kk) mw = max(mw, N(colW[s] || pitch)); w += mw; }
      return PADX * 2 + labelWEff + w + (kk - 1) * GAPC;
    };
    var useGrid = groupNeed(colN) <= CANVAS;
    if (useGrid) {
      var gcols = [['fixed', labelWEff]].concat(colW.map(function (w) { return ['fixed', w]; }));
      var grows = [];
      for (var gi = 0; gi < rows.length + (stateRowH ? 1 : 0); gi++) grows.push(['auto', 1]);
      var grid = NL.gridFrame('grid·' + fam, { cols: gcols, rows: grows, rowGap: GAPR, columnGap: GAPC });
      NL.add(ctx.host, grid, 'fill', 'auto');
      flowKids.push(grid);
      var gr = 1;
      // axis texts are created absolutely (world coords) before the grid exists. They MUST enter the cell as flow —
      // and the flag must be cleared BEFORE `NL.cell`: an absolute child keeps the flag through appendChild, the
      // platform ignores (row,col) and auto-places it in the next free cell, which put every state row one column
      // left (measured 2026-10-26: axes at cells 1..n, slots at 2..n+1). `NL.cell` also pre-clears it; this is the
      // readable half of the same contract.
      if (stateRowH) { axisTs.forEach(function (t, i) { try { t.layoutChild.absolute = false; } catch (e) {} NL.cell(grid, t, 1, i + 2); NL.sizing(t, 'fix', 'auto'); }); gr = 2; }
      for (var r2 = 0; r2 < rows.length; r2++) {
        var lab = pendTs[ti], note = rows[r2].note ? pendTs[ti + 1] : null; ti += rows[r2].note ? 2 : 1;
        if (lab || note) {
          // Fill the row height and centre the label copy: a grid cell is taller than the 20px line, and an auto-height
          // label box sticks to the cell top (fresh TableHeader matrix measured label 10px above the slot centre).
          var labBox = NL.col('label·' + fam + '·' + r2, { rowGap: br('inline'), sizing: { h: 'auto', v: 'fill' }, justify: 'center' });
          if (lab) { try { lab.layoutChild.absolute = false; } catch (e) {} labBox.appendChild(lab); NL.sizing(lab, 'auto', 'auto'); }
          if (note) { try { note.layoutChild.absolute = false; } catch (e) {} labBox.appendChild(note); NL.sizing(note, 'auto', 'auto'); }
          NL.cell(grid, labBox, gr + r2, 1);
        }
        var cellsR = drawn[r2] || [];
        for (var c2 = 0; c2 < cellsR.length; c2++) {
          if (!cellsR[c2]) continue;
          var slot = NL.frame('slot·' + fam + '·' + r2 + '.' + c2, { w: colW[c2], h: N(cellsR[c2].height), sizing: 'fix' });
          slot.fills = [];
          NL.cell(grid, slot, gr + r2, c2 + 2);
          attach.push({ slot: slot, host: cellsR[c2] });
        }
      }
    } else {
      // GROUPED GRID — the states do not fit side by side on the canvas (measured 2026-10-26: `Accordion·Spec` is
      // 5 × 360px = 2060 > the 1760 content canvas). The old answer was a wrap row: a 112px axis pitch sat over
      // 360px cells so nothing lined up, and each row became 660px of two stacked cells. The sheet stays ONE grid;
      // whole state GROUPS wrap into extra grid rows and every group is named by its own caption row directly above
      // the cells it labels, so a caption can never disagree with its column.
      var k = colN - 1;
      while (k > 1 && groupNeed(k) > CANVAS) k--;   // useGrid already proved colN does not fit
      var gw = [];
      for (var j2 = 0; j2 < k; j2++) { var mw2 = pitch; for (var s2 = j2; s2 < colN; s2 += k) mw2 = max(mw2, N(colW[s2] || pitch)); gw.push(N(mw2)); }
      var groups = Math.ceil(colN / k);
      var gcols2 = [['fixed', labelWEff]].concat(gw.map(function (w) { return ['fixed', w]; }));
      var grows2 = [];
      for (var gr2 = 0; gr2 < rows.length * groups * 2; gr2++) grows2.push(['auto', 1]);
      var grid2 = NL.gridFrame('grid·' + fam, { cols: gcols2, rows: grows2, rowGap: GAPR, columnGap: GAPC });
      NL.add(ctx.host, grid2, 'fill', 'auto');
      flowKids.push(grid2);
      // one phase-1 axis row cannot name k-wide groups — the per-cell captions replace it
      axisTs.forEach(function (t) { try { t.remove(); } catch (e) {} });
      for (var r4 = 0; r4 < rows.length; r4++) {
        var base = r4 * groups * 2 + 1;
        var lab4 = pendTs[ti], note4 = rows[r4].note ? pendTs[ti + 1] : null; ti += rows[r4].note ? 2 : 1;
        if (lab4 || note4) {
          var labBox4 = NL.col('label·' + fam + '·' + r4, { rowGap: br('inline'), sizing: { h: 'auto', v: 'fill' }, justify: 'center' });
          if (lab4) { try { lab4.layoutChild.absolute = false; } catch (e) {} labBox4.appendChild(lab4); NL.sizing(lab4, 'auto', 'auto'); }
          if (note4) { try { note4.layoutChild.absolute = false; } catch (e) {} labBox4.appendChild(note4); NL.sizing(note4, 'auto', 'auto'); }
          NL.cell(grid2, labBox4, base, 1, { row: groups * 2 });
        }
        var cells4 = drawn[r4] || [];
        for (var c4 = 0; c4 < cells4.length; c4++) {
          if (!cells4[c4]) continue;
          var gj = Math.floor(c4 / k), j4 = c4 % k, crow = base + gj * 2;
          var cap = ctx.text(String(axes[c4] === undefined ? c4 : axes[c4]),
            B(box.x + PADX + labelWEff + GAPC, box.y + PADY + headH + stateRowH + (r4 * 40) + 400, gw[j4], 17),
            { size: 11, role: 'axis', color: C('muted'), weight: 600, align: 'left', valign: 'middle', refit: false });
          if (cap && cap.t) { try { cap.t.layoutChild.absolute = false; } catch (e) {} NL.cell(grid2, cap.t, crow, j4 + 2); NL.sizing(cap.t, 'fix', 'auto'); }
          var slot4 = NL.frame('slot·' + fam + '·' + r4 + '.' + c4, { w: gw[j4], h: N(cells4[c4].height), sizing: 'fix' });
          slot4.fills = [];
          NL.cell(grid2, slot4, crow + 1, j4 + 2);
          attach.push({ slot: slot4, host: cells4[c4] });
        }
      }
    }
    var noteTs = pendTs.slice(ti);
    noteTs.forEach(function (t) { NL.add(ctx.host, t, 'fill', 'auto'); });
    // child ORDER is append order in flow: head → axis → grid/rows → notes.
    flowKids.concat(noteTs).forEach(function (k) { try { ctx.host.appendChild(k); } catch (e) {} });
    NL.applyFlex(ctx.host, { dir: 'column', rowGap: GAPR, columnGap: GAPC,
      topPadding: PADY, bottomPadding: PADY, leftPadding: PADX, rightPadding: PADX,
      horizontalSizing: 'fix', verticalSizing: 'auto' });
    await NL.settle();
    attach.forEach(function (a) { try { a.slot.appendChild(a.host); a.host.layoutChild.absolute = true; } catch (e) {} });
    await NL.settle();
    // The slot has its engine position by now; CF.move writes the shell AND delta-repairs its world-absolute
    // anatomy — the same move the old matrix used for row centring (production-proven on nested hosts).
    attach.forEach(function (a) { try { CF.move(a.host, N(a.slot.x), N(a.slot.y)); } catch (e) {} });
    await ctx.settle();
    // Return only after the flex layout has settled: the shelf step reads this height, and a transient hug height is
    // exactly what produced stale ~100px pitches (boards later grew to 277-2287 and overlapped). Cheap; removes a race.
    try { await NL.settle(); } catch (e) {}
    await new Promise(function (r) { setTimeout(r, 120); });
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

  // ---------------------------------------------------------------- the spec matrix contract (component-library §3)
  /** What a STATE COLUMN means in factory props. The column names come from the paired manifest (a headless library
      spells its own axes: `off`/`on`, `closed`/`open`, `selected`), and a factory only understands `state` plus a few
      content flags — so the translation lives here, once, instead of being re-guessed per page. */
  CF.stateCell = function (a) {
    var k = String(a === undefined ? 'default' : a).toLowerCase();
    if (k === 'error' || k === 'invalid') return { state: 'default', status: 'error' };
    if (k === 'dragging') return { state: 'default', dragging: true };
    if (k === 'closed') return { state: 'default', open: false };
    if (k === 'open' || k === 'expanded') return { state: 'default', open: true };
    if (k === 'off' || k === 'unchecked') return { state: 'default', checked: false };
    if (k === 'on' || k === 'checked') return { state: 'default', checked: true };
    if (k === 'indeterminate') return { state: 'default', indeterminate: true };
    if (k === 'filled') return { state: 'default', value: 'Filled value' };
    if (k === 'loading' || k === 'skeleton') return { state: 'default', loading: true };
    if (/^(hover|focus|pressed|selected|readonly|active|disabled)$/.test(k)) return { state: k };
    return { state: 'default' };
  };
  CF.stateCells = function (axes) { return (axes && axes.length ? axes : ['default']).map(CF.stateCell); };

  /** THE VARIANT ROWS a family's spec board must draw — the §3 "Min variant set", as real factory props.
      Keyed by design family. A row that the factory cannot draw cannot be written here, which is the point: the
      sheet is the factory's contract, not an invention. `cellsByAxis` overrides the state translation for a family
      whose axis is a content axis rather than a pseudo-state (Segmented's `off`/`on` is which segment is active).
      A family with no entry falls back to its single representative and the gate reports it (`variant_sparse`).
      ROW BUDGET: one block page carries exactly one `Family·Spec` board, and one `execute_code` call has a ~30 s
      ceiling at ≈1.3 s/cell — so keep `rows × states ≤ 20` and let `LM.buildEntry` trim, never split, the sheet. */
  CF.SPEC = {
    // ---------------------------------------------------------------- 03 · Actions
    Button: [
      { label: 'Primary · MD', props: { type: 'primary' } },
      { label: 'Secondary · SM', props: { type: 'secondary', size: 'sm' } },
      { label: 'Danger · MD', props: { type: 'danger' } },
      { label: 'Icon start · SM', props: { type: 'text', size: 'sm', lead: 'download' } },
      { label: 'Icon only · MD', props: { type: 'default', iconOnly: true, lead: 'dots' } }
    ],
    IconButton: [
      { label: 'Default · MD', props: { type: 'default' } },
      { label: 'Primary tile · SM', props: { type: 'primary', glyph: 'download', size: 'sm' } },
      { label: 'Badge on tile', props: { type: 'default', glyph: 'bell', badge: true } },
      { label: 'Secondary · LG', props: { type: 'secondary', size: 'lg', glyph: 'grid' }, cellsByAxis: { pressed: { state: 'selected' } } }
    ],
    ButtonGroup: [
      { label: 'Primary start', props: { items: [{ label: 'Save', type: 'primary' }, { label: 'Cancel' }, { glyph: 'chevronDown' }] } },
      { label: 'Neutral · SM', props: { size: 'sm', items: [{ label: 'Prev' }, { label: 'Next' }] } },
      { label: 'Vertical', props: { direction: 'vertical', items: [{ label: 'Cut' }, { label: 'Copy' }, { label: 'Paste' }] } },
      { label: 'Icon only · LG', props: { size: 'lg', items: [{ glyph: 'bold' }, { glyph: 'italic' }, { glyph: 'underline' }] } }
    ],
    SplitButton: [
      { label: 'Primary · MD', props: { type: 'primary' } },
      { label: 'Outlined · SM', props: { type: 'outlined', size: 'sm' } },
      { label: 'Danger · MD', props: { type: 'danger' } }
    ],
    FAB: [
      { label: 'Primary · MD', props: {} },
      { label: 'Surface · SM', props: { tone: 'surface', size: 'sm' } },
      { label: 'Extended · LG', props: { extended: true, label: 'New note', size: 'lg' } }
    ],
    Link: [
      { label: 'Brand · MD', props: {} },
      { label: 'Neutral · SM', props: { tone: 'neutral', size: 'sm' } },
      { label: 'Underline · MD', props: { underline: true } },
      { label: 'Icon trail · SM', props: { trail: true, size: 'sm' } }
    ],
    Toggle: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'LG', props: { size: 'lg' } }
    ],
    ToggleGroup: [
      { label: 'MD', props: {}, cellsByAxis: { off: { active: 0 }, on: { active: 1 } } },
      { label: 'SM', props: { size: 'sm', items: ['Day', 'Week'] }, cellsByAxis: { off: { active: 0 }, on: { active: 1 } } },
      { label: 'Ink · MD', props: { dark: true }, cellsByAxis: { off: { active: 0 }, on: { active: 1 } } }
    ],

    // ---------------------------------------------------------------- 04 · Text fields
    Field: [{ label: 'Label + input', props: { label: 'Email' } }],
    Input: [
      { label: 'Outlined · MD', props: { placeholder: 'you@example.com' } },
      { label: 'Outlined · SM', props: { size: 'sm', placeholder: 'City' } },
      { label: 'Filled · MD', props: { variant: 'filled', value: 'laplace@studio.io' } },
      { label: 'Icon start · SM', props: { variant: 'filled', size: 'sm', lead: 'mail' } }
    ],
    Textarea: [
      { label: 'Outlined · MD', props: { placeholder: 'Add a note' } },
      { label: 'Filled · MD', props: { variant: 'filled', rows: 5 } },
      { label: 'Borderless · SM', props: { variant: 'borderless', size: 'sm' } }
    ],
    Search: [
      { label: 'MD', props: { clear: false, placeholder: 'Search files' } },
      { label: 'SM', props: { clear: false, size: 'sm' } },
      { label: 'LG', props: { clear: false, size: 'lg' } },
      { label: 'Filled · MD', props: { clear: false, variant: 'filled', value: 'quarterly report' } }
    ],
    MaskedInput: [
      { label: 'Phone · MD', props: { clear: false } },
      { label: 'Card · SM', props: { clear: false, mask: 'card', size: 'sm' } },
      { label: 'Date · LG', props: { clear: false, mask: 'date', size: 'lg' } }
    ],
    PasswordInput: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'Filled · MD', props: { variant: 'filled', revealed: true } }
    ],
    NumberInput: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm', value: 7 } },
      { label: 'Filled · MD', props: { variant: 'filled' } }
    ],
    PinInput: [
      { label: '6 digits', props: {} },
      { label: '4 digits', props: { length: 4 } },
      { label: '6 + resend', props: { resend: true } }
    ],
    TagsInput: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'Filled · MD', props: { variant: 'filled', value: ['Draft', 'Shared'] } }
    ],
    FileUpload: [
      { label: 'Dropzone', props: {} },
      { label: 'Image grid', props: { grid: true } },
      { label: 'File list', props: { files: ['report.pdf', 'notes.md'] } }
    ],
    Transfer: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'LG', props: { size: 'lg' } }
    ],

    // ---------------------------------------------------------------- 05 · Selection & pickers
    Checkbox: [
      { label: 'MD', props: { label: 'Remember me' } },
      { label: 'SM', props: { label: 'Compact', size: 'sm' } },
      { label: 'LG', props: { label: 'Select all', size: 'lg' } }
    ],
    RadioGroup: [{ label: 'Radio', props: { label: 'Weekly digest' } }],
    Switch: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'Loading · MD', props: { loading: true } }
    ],
    Slider: [
      { label: 'Value', props: { value: 40 } },
      { label: 'Range', props: { range: true } },
      { label: 'Marks', props: { marks: true, value: 70 } }
    ],
    RatingGroup: [
      { label: 'MD', props: { value: 3 } },
      { label: 'SM', props: { size: 'sm', value: 4 } },
      { label: 'LG', props: { size: 'lg', value: 2 } }
    ],
    ColorPicker: [
      { label: 'Hex · MD', props: {} },
      { label: 'Swatch · MD', props: { showHex: false } },
      { label: 'Hex · SM', props: { size: 'sm' } }
    ],
    Select: [
      { label: 'Closed · MD', props: {} },
      { label: 'Open · MD', props: { open: true }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Closed · SM', props: { size: 'sm' } }
    ],
    Listbox: [
      { label: 'Open · MD', props: { open: true }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Open · SM', props: { open: true, size: 'sm' }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Open · LG', props: { open: true, size: 'lg' }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } }
    ],
    Combobox: [
      { label: 'Closed · MD', props: {} },
      { label: 'Open · MD', props: { open: true }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Closed · SM', props: { size: 'sm' } }
    ],
    DatePicker: [
      { label: 'Closed · MD', props: {} },
      { label: 'Open · MD', props: { open: true }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Closed · SM', props: { size: 'sm' } }
    ],
    TimePicker: [
      { label: 'Closed · MD', props: {} },
      { label: 'Open · MD', props: { open: true }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Closed · SM', props: { size: 'sm' } }
    ],
    SegmentGroup: [
      { label: 'MD', props: {}, cellsByAxis: { off: { active: 0 }, on: { active: 1 } } },
      { label: 'SM', props: { size: 'sm', items: ['Day', 'Week'] }, cellsByAxis: { off: { active: 0 }, on: { active: 1 } } },
      { label: 'Ink · MD', props: { dark: true }, cellsByAxis: { off: { active: 0 }, on: { active: 1 } } }
    ],

    // ---------------------------------------------------------------- 06 · Data & lists
    Carousel: [
      { label: 'Dots', props: {} },
      { label: 'Arrows', props: { arrows: true } },
      { label: 'Caption', props: { captions: true } }
    ],
    Descriptions: [
      { label: 'Plain · 2 col', props: {} },
      { label: 'Bordered · 2 col', props: { bordered: true } },
      { label: 'Plain · 1 col', props: { columns: 1 } }
    ],
    ListItem: [
      { label: '1-line', props: { label: 'Quarterly report.pdf' } },
      { label: '2-line', props: { label: 'Ana Ruiz', sub: 'ana@studio.io' } },
      { label: 'Trailing', props: { label: 'Design tokens', trailing: 'chevron' } }
    ],
    MiniCalendar: [
      { label: 'Month', props: {} },
      { label: 'Selected day', props: { selected: 14 } }
    ],
    TableHeader: [
      { label: 'Plain', props: {} },
      { label: 'Sorted asc', props: { sort: 'asc' } },
      { label: 'Sorted desc', props: { sort: 'desc' } },
      { label: 'Filter active', props: { filter: true } }
    ],
    TableRow: [
      { label: 'Plain', props: {} },
      { label: 'Expandable', props: { expandable: true } },
      { label: 'Editing', props: { editing: true } }
    ],
    TableState: [
      { label: 'Empty', props: {} },
      { label: 'Loading', props: { loading: true } },
      { label: 'Error', props: { error: true } }
    ],
    Timeline: [
      { label: 'Default', props: {} },
      { label: 'Alternate', props: { alternate: true } },
      { label: 'Label left', props: { labelLeft: true } }
    ],

    // ---------------------------------------------------------------- 07 · Display & media
    Avatar: [
      { label: 'Initials', props: { content: 'initials' } },
      { label: 'Status · online', props: { status: 'online' } },
      { label: 'Editable', props: { editable: true } },
      { label: 'Small', props: { size: 'sm' } }
    ],
    AvatarGroup: [
      { label: 'MD', props: { members: ['Ana', 'Bo', 'Cy'] } },
      { label: 'SM', props: { size: 'sm', members: ['Ana', 'Bo'] } },
      { label: 'LG', props: { size: 'lg', members: ['Ana', 'Bo', 'Cy', 'De', 'Ed'] } }
    ],
    Badge: [
      { label: 'Count', props: { value: 12 } },
      { label: 'Dot', props: { dotOnly: true } },
      { label: 'Overline', props: { dot: true } },
      { label: 'Status', props: { status: 'success' } }
    ],
    Card: [
      // 345px × 5 state columns cannot share one grid row inside the canvas, and a sheet that does not fit falls back
      // to absolutely attached cells (`free_layout`). The specimen is drawn at a fitted 280 so the grid holds.
      { label: 'Elevated', props: { tone: 'elevated', w: 280 } },
      { label: 'Outlined', props: { tone: 'outlined', w: 280 } },
      { label: 'With cover', props: { cover: true, title: 'Field study', w: 280 } },
      { label: 'Selectable', props: { selectable: true, title: 'Shared with team', w: 280 } }
    ],
    Chip: [
      { label: 'Input', props: { label: 'Draft' } },
      { label: 'Display', props: { label: 'Published', kind: 'display' } },
      { label: 'Closable', props: { label: 'Mobile', closable: true } },
      { label: 'Error tone', props: { label: 'Failed', tone: 'error' } }
    ],
    EmptyState: [
      { label: 'Icon', props: {} },
      { label: 'Illustration', props: { kind: 'illustration' } },
      { label: 'First run', props: { firstRun: true } }
    ],
    KPI: [
      { label: 'Delta up', props: { label: 'Active users', value: '12.4k', delta: 8.2 } },
      { label: 'Delta down', props: { label: 'Churn', value: '1.9%', delta: -0.4 } },
      { label: 'Sparkline', props: { label: 'Sessions', value: '3.1k', spark: true } },
      { label: 'Compact', props: { label: 'Uptime', value: '99.9%' } }
    ],
    Skeleton: [
      { label: 'Text', props: { variant: 'text', rows: 3 } },
      { label: 'List', props: { variant: 'list', rows: 3 } },
      { label: 'Circle', props: { variant: 'circle' } },
      { label: 'Button', props: { variant: 'button' } }
    ],
    StatusText: [
      { label: 'Success', props: { tone: 'success', label: 'Published' } },
      { label: 'Warning', props: { tone: 'warning', label: 'Needs review' } },
      { label: 'Error', props: { tone: 'error', label: 'Failed' } },
      { label: 'Neutral', props: { label: 'Draft' } }
    ],
    Progress: [
      { label: 'Determinate', props: { value: 62 } },
      { label: 'Indeterminate', props: { indeterminate: true } },
      { label: 'Steps', props: { steps: 5, value: 3 } },
      { label: 'Line', props: { line: true, value: 40 } }
    ],

    // ---------------------------------------------------------------- 08 · Navigation
    Accordion: [
      { label: 'Bordered · multi', props: {} },
      { label: 'Ghost', props: { ghost: true } },
      { label: 'Single', props: { accordion: true } }
    ],
    Menu: [
      { label: 'Closed', props: {} },
      { label: 'Open', props: { open: true }, only: ['default','disabled'], cellsByAxis: { closed: { open: true }, open: { open: true }, disabled: { open: true, state: 'disabled' } } },
      { label: 'Selectable', props: { selectable: true } }
    ],
    Pagination: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'Simple', props: { simple: true } }
    ],
    Steps: [
      { label: 'Horizontal', props: {} },
      { label: 'Vertical', props: { direction: 'vertical' } },
      { label: 'Dot', props: { dot: true } },
      { label: 'Bottom labels', props: { labelPlacement: 'bottom' } }
    ],
    Tabs: [
      { label: 'Line · MD', props: {} },
      { label: 'Card · MD', props: { type: 'card' } },
      { label: 'Line · SM', props: { size: 'sm' } },
      { label: 'Closable', props: { closable: true } }
    ],
    TabBand: [
      { label: 'Band', props: {} },
      { label: 'Scrollable', props: { scrollable: true } },
      { label: 'Add', props: { add: true } }
    ],
    Toc: [
      { label: 'Rail', props: {} },
      { label: 'Dots', props: { dots: true } },
      { label: 'Counters', props: { counters: true } }
    ],
    Breadcrumb: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'Back', props: { back: true } },
      { label: 'Truncated', props: { truncated: true } }
    ],
    CommandPalette: [
      { label: 'Default', props: {} },
      { label: 'Preview', props: { preview: true } }
    ],
    NavItem: [
      { label: 'Icon + label', props: { label: 'Home', glyph: 'home' } },
      { label: 'Group', props: { label: 'Workspace', group: true } },
      { label: 'Rail', props: { rail: true, glyph: 'home' } },
      { label: 'Small', props: { label: 'Trash', glyph: 'trash', size: 'sm' } }
    ],

    // ---------------------------------------------------------------- 09 · Overlays & feedback
    Dialog: [
      { label: 'Default', props: {} },
      { label: 'Confirm', props: { confirm: true } },
      { label: 'Wide', props: { width: 'wide' } },
      { label: 'No footer', props: { footer: false } }
    ],
    Drawer: [
      { label: 'End', props: {} },
      { label: 'Start', props: { side: 'left' } },
      { label: 'Bottom', props: { bottom: true } },
      { label: 'No footer', props: { footer: false } }
    ],
    Popover: [
      { label: 'Text', props: {} },
      { label: 'Title', props: { title: 'Share this file' } },
      { label: 'Actions', props: { actions: ['Copy link', 'Invite'] } }
    ],
    Toast: [
      { label: 'Dark · neutral', props: {} },
      { label: 'Light · success', props: { surface: 'light', tone: 'success' } },
      { label: 'Action', props: { action: 'Undo' } },
      { label: 'Timed', props: { duration: true } }
    ],
    Tooltip: [
      { label: 'Dark', props: {} },
      { label: 'Light', props: { surface: 'light' } },
      { label: 'With title', props: { title: 'Save' } }
    ],
    Alert: [
      { label: 'Info', props: { tone: 'info' } },
      { label: 'Success', props: { tone: 'success' } },
      { label: 'Warning', props: { tone: 'warning' } },
      { label: 'Danger', props: { tone: 'danger' } }
    ],
    Notification: [
      { label: 'Neutral', props: {} },
      { label: 'Success', props: { tone: 'success' } },
      { label: 'With action', props: { action: 'Retry' } }
    ],
    Popconfirm: [
      { label: 'Danger', props: {} },
      { label: 'Neutral', props: { tone: 'neutral' } },
      { label: 'Warning', props: { tone: 'warning' } }
    ],
    Sheet: [
      { label: 'Options', props: {} },
      { label: 'Title', props: { title: 'Share' } },
      { label: 'Cancel', props: { cancel: true } }
    ],
    Spin: [
      { label: 'MD', props: {} },
      { label: 'SM', props: { size: 'sm' } },
      { label: 'Label right', props: { label: 'Loading…' } },
      { label: 'Label bottom', props: { label: 'Loading…', below: true } }
    ]
  };
  /** The matrix plan for one paired component: rows from `CF.SPEC`, columns from the manifest's declared states. */
  CF.specPlan = function (family, entry) {
    var rows = CF.SPEC[String(family || '')];
    if (!rows || !rows.length) return null;
    var axes = (entry && entry.states && entry.states.length) ? entry.states.slice() : ['default'];
    var factory = (entry && entry.factory) || null;
    return { family: family, factory: factory, axes: axes,
      rows: rows.map(function (r) {
        var byAxis = r.cellsByAxis || {};
        // `only` limits a row to the named columns — a row that paints a whole calendar/menu panel must not paint it
        // once per state (measured 2026-10-27: `DatePicker·Spec` grew five open panels and the auditor could no
        // longer finish the page inside the MCP ceiling).
        var cols = r.only && r.only.length ? axes.filter(function (a) { return r.only.indexOf(String(a).toLowerCase()) >= 0; }) : axes;
        return { label: r.label, factory: r.factory || factory, props: r.props || {},
                 cells: cols.map(function (a) { return Object.assign({}, CF.stateCell(a), byAxis[String(a).toLowerCase()] || {}); }) };
      }) };
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
    Object.keys(map).forEach(function (g) { if (g !== 'composer') map[g].forEach(function (k) { known[String(k).toLowerCase()] = 1; }); });
    // A PAIRED catalog registers its cells under the DESIGN family head (`Dialog`, not `Modal`; `PinInput`, not
    // `OTP`), and `CF.map()` only knows the factory key. Without the manifest vocabulary those hosts read as
    // foreign chrome and were silently skipped — the page kept its board but lost every master (measured 2026-10-27).
    try {
      var man = storage.LM && storage.LM.manifest;
      ((man && man.components) || []).forEach(function (c) {
        var d = String(c.designFamily || c.name || '').toLowerCase();
        if (d) known[d] = 1;
      });
    } catch (e) {}
    var STATE = /·(Hover|Focus|Pressed|Selected|Disabled|Loading|Error)/;
    var roots = o.roots;
    if (!roots) {
      try { var pg = o.page ? storage.pg(o.page) : null; var r = (pg && pg.root) || penpot.currentPage.root; roots = Array.from((r && r.children) || []); }
      catch (e) { return { err: 'autoRegister: no roots — ' + String(e).slice(0, 80) }; }
    }
    var limit = o.limit || 40;
    var out = { scanned: 0, registered: [], already: [], skipped: [], dry: !!o.dry, truncated: false };
    var seen = {};
    var famKey = function (nm) { return String(String(nm || '').split('·')[0] || '').toLowerCase(); };
    function visit(n, depth) {
      if (!n || depth > 28 || out.truncated) return;
      var nm = ''; try { nm = String(n.name || ''); } catch (e) {}
      var t = ''; try { t = n.type; } catch (e) {}
      var famHead = famKey(nm);
      var famHit = !!known[famHead] || Object.keys(known).some(function (k) {
        return (k.length > famHead.length && k.indexOf(famHead) === 0) || (famHead.length > k.length && famHead.indexOf(k) === 0);
      });
      if (t === 'board' && /^([A-Za-z]+)(?:·|$)/.test(nm) && famHit && !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$/.test(nm)) {
        out.scanned++;
        // Deduplicate by SHAPE ID, not by name: two state cells can share a name (TableHeader·Default three
        // times) and each must still become a component — the second gets a unique `·AltN` alias below.
        if (seen[n.id]) return;
        seen[n.id] = 1;
        var isInst = false;
        try { isInst = !!(n.isComponentCopyInstance && n.isComponentCopyInstance()) || !!(n.isMainComponent && n.isMainComponent()); } catch (e) {}
        if (CF.get(nm) && isInst) { out.already.push(nm); return; }
        if (STATE.test(nm) && !o.states) { out.skipped.push(nm); return; }
        if (out.registered.length >= limit) { out.truncated = true; return; }
        if (o.dry) { out.registered.push(nm); return; }
        // A second RAW host with the same name (two table headers, two descriptions states) cannot share the master's
        // name: register it under a stable unique alias so it is a component too. Leaving it raw is what made
        // spec_unregistered report the duplicate cells while the first cell of the same family read CLEAN.
        var regName = nm;
        if (CF.get(nm)) { var k = 2; while (CF.get(regName)) { regName = nm + '·Alt' + k; k++; } }
        var res = CF.component(n, regName);
        if (res && res.ok) out.registered.push(regName); else out.skipped.push(nm + ' → ' + (res && res.err || 'failed'));
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
      actions: ['button', 'iconButton', 'buttonGroup', 'splitButton', 'fab', 'link', 'toggle', 'segmented'],
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
  /** The REFERENCE inventory: what the source site actually shows, measured, not what this factory can draw.
      On a recreation the agent MUST call this before building a component chapter, and the audit's `reference_drift`
      rule (spec pages 03–09, one profile group per page) enforces the measured half. The profile is stamped `nl:ref`
      on every PageRoot, so it survives a plugin reload.
        CF.setReference({ source:'https://…', actions:{ families:['Button','IconButton','Link'],
          shapes:{ Button:['full'], IconButton:['tile','full'], Link:['none'] } } });
      The measured `families` are SOURCE-backed, not the catalog: pages 03–09 must still build every CF.map() family.
      A family the source never shows is `derived` (CF.ensureCatalog) and takes the source material — it is built,
      registered and gated like any other, never omitted. */
  CF.setReference = function (o, root) {
    // A recreation has several source profiles (actions on 03, feedback/forms on 04–09). MERGE instead of replacing,
    // so seeding feedback on page 09 does not wipe the measured action profile; the profile is one durable object
    // stamped on the page that owns it.
    // Merge one level deeper for profile GROUPS: re-seeding a measured group must not erase the derived family
    // entries `CF.ensureCatalog` added to the same group (a shallow Object.assign replaced `actions` wholesale and
    // silently shrank the catalog back to the source-only families).
    var mergedRef = Object.assign({}, storage.REF || {});
    Object.keys(o || {}).forEach(function (k) {
      var cur = mergedRef[k], nxt = o[k];
      if (cur && nxt && typeof cur === 'object' && typeof nxt === 'object' && !Array.isArray(cur) && !Array.isArray(nxt)) {
        mergedRef[k] = Object.assign({}, cur, nxt);
      } else mergedRef[k] = nxt;
    });
    storage.REF = mergedRef;
    // The measured source SHAPES are also the design's radius ROLES: if the reference draws Button as a pill, then
    // `control` is `full` at birth (not the generic kit's 3px step), and an IconButton explicitly pinned to `tile`
    // keeps the tile step. Without this, every factory build went back to the fallback ladder on a fresh session and
    // the role sweep had to repair corners after the fact (measured 2026-10-23: a probe button was born r0).
    CF.applyRoles(storage.REF || o);
    CF.stampRef(root);
    return storage.REF;
  };
  /** Re-apply the source's radius ROLES from a reference profile. This MUST run on hydrate too, not only when the
      profile is first seeded: storage is volatile, so after every plugin reload the factories were re-seeded with
      `ROLE.control = 'sm'` while the file's actions measured `full` — fresh radios/switches/sliders were then born
      r8 and their focus rings could not wrap a pill/circle (measured 2026-10-26: the profile says
      `selection.radio.radius = 9999`, the render said r8). The profile is the durable record; the roles are derived. */
  CF.applyRoles = function (r) {
    r = r || storage.REF || {};
    try {
      var sh = (r.actions && r.actions.shapes) || {};
      (sh.Button || []).forEach(function (role) {
        if (role === 'full' || role === 'none' || role === 'tile') CF.ROLE.control = role;
      });
      if (sh.IconButton && sh.IconButton.length === 1 && /^(tile|full|none)$/.test(String(sh.IconButton[0]))) CF.ROLE.tile = sh.IconButton[0];
      // `tile` is a SHAPE word, not a token step. Left unresolved, `CF.radius('tile')` answered the fallback kit and
      // every measured tile drifted (2026-10-27: 14 `reference_drift` findings on IconButton, all r16 vs the 0 the
      // role resolved to). Bind the shape word to the ladder step the source actually measured.
      if (CF.ROLE.tile === 'tile') {
        var ib = (r.actions && r.actions.iconbutton) || {};
        var want = Number((ib.size && ib.size.radius) !== undefined ? ib.size.radius : ib.radius);
        if (want > 0 && storage.TK && storage.TK.declared) {
          try {
            var step = null, best = Infinity;
            (storage.TK.declared().radii || []).forEach(function (x) {
              var v = Number(x.value); if (Math.abs(v - want) < best) { best = Math.abs(v - want); step = String(x.name).replace(/^radius\./, ''); }
            });
            if (step && best <= 1) CF.ROLE.tile = step;
          } catch (e) {}
        }
      }
    } catch (e) {}
    return { control: CF.ROLE.control, tile: CF.ROLE.tile };
  };
  /** Write the MERGED profile to every PageRoot, not the delta from the last call. A recreation owns one file-wide
      profile; stamping only the group seeded on the current page lost every earlier group after a plugin reload
      (measured 2026-10-23: seeding feedback on 09 overwrote the actions stamp with `{feedback}`). */
  CF.stampRef = function (root) {
    var payload = null;
    try { payload = JSON.stringify(storage.REF || {}); } catch (e) { return { err: 'ref serialize' }; }
    var roots = root ? [root] : [];
    try {
      (penpot.currentFile ? penpot.currentFile.pages : []).forEach(function (p) {
        var kids = p && p.root && p.root.children ? p.root.children : [];
        for (var i = 0; i < kids.length; i++) if (/-?PageRoot$/.test(String(kids[i].name || ''))) { roots.push(kids[i]); break; }
      });
    } catch (e) {}
    var n = 0;
    roots.forEach(function (pr) { try { if (pr && pr.setPluginData) { pr.setPluginData('nl:ref', payload); n++; } } catch (e) {} });
    return { stamped: n };
  };
  /** Restore the profile from the file after a storage wipe: the PageRoot stamp is the durable copy, `storage.REF`
      is only the session cache. Called at seed time and lazily by `CF.reference`. */
  CF.hydrate = function () {
    if (!(storage.REF && Object.keys(storage.REF).length)) {
      try {
        var pr = penpotUtils.findShape(function (s) { return /-?PageRoot$/.test(String(s.name || '')); }, penpot.currentPage.root);
        var raw = pr && pr.getPluginData ? pr.getPluginData('nl:ref') : null;
        if (raw) storage.REF = JSON.parse(raw);
      } catch (e) {}
    }
    // The durable profile also owns the radius ROLES; only re-deriving them here keeps a re-seeded session from
    // building pill controls as r8 rounded rectangles (see CF.applyRoles).
    CF.applyRoles(storage.REF || {});
    return storage.REF || {};
  };
  CF.reference = function (group) {
    var r = (storage.REF && Object.keys(storage.REF).length) ? storage.REF : CF.hydrate();
    return r && r[group] ? r[group] : null;
  };
  /** The MEASURED source families (the inventory that has expect blocks). */
  CF.sourceFamilies = function (group) {
    var r = CF.reference(group);
    return r && r.families ? r.families : (CF.map()[group] || []);
  };
  /** The COMPLETE factory catalog for a group. A recreation builds all of it: measured families take their profile,
      absent families are derived from the source material and still get a ·Spec board and masters. */
  CF.referenceFamilies = function (group) { return CF.map()[group] || []; };
  /** Add one derived profile entry (source material, no `expect`): enough for the factory to stamp `nl:prof` and for
      the completeness gate to tell a deliberate derived family from an accidentally generic one. */
  CF.derivedProfile = function (group, family, opts) {
    opts = opts || {};
    // The `selection` profile group has no matching CF.map() group: its controls live in the forms factory group.
    var mapGroup = group === 'selection' ? 'forms' : group;
    var map = CF.map()[mapGroup] || [], key = String(family);
    var hit = map.filter(function (f) { return String(f).toLowerCase() === key.toLowerCase(); })[0];
    if (!hit) return { err: 'family ' + family + ' is not in CF.map().' + group, families: map };
    var g = storage.REF = storage.REF || {};
    g[group] = g[group] || {};
    if (CF.profile(group, hit)) return { kept: true, group: group, family: hit };
    g[group][hit] = Object.assign({ source: 'derived', derived: true, family: hit, material: opts.material || 'source' }, opts.entry || {});
    return { added: true, group: group, family: hit, entry: g[group][hit] };
  };
  /** Fill every missing family of a group with a derived entry (idempotent). Returns what was added. */
  CF.ensureCatalog = function (group, opts) {
    var out = { group: group, added: [], kept: [] };
    (CF.map()[group === 'selection' ? 'forms' : group] || []).forEach(function (f) {
      var r = CF.derivedProfile(group, f, opts);
      if (r.added) out.added.push(f); else out.kept.push(f);
    });
    if (out.added.length) CF.stampRef();
    return out;
  };
  /** One measured family entry from a profile group: `profiles.forms.input`, `profiles.selection.switch`, … .
      Aliases let one source measurement back several draws of the same control (Textarea/Search are Input fields).
      The actions inventory keeps `families` as an array; that is not a family entry and is ignored here. */
  CF.PROFILE_ALIAS = {
    input: ['input'], textarea: ['textarea'], search: ['search', 'searchfield'], maskedinput: ['maskedinput', 'input'],
    field: ['field'], switch: ['switch'], checkbox: ['checkbox'], radio: ['radio'], slider: ['slider'],
    card: ['card'], kpi: ['kpi'], navitem: ['navitem', 'nav'], tabs: ['tabs'], accordion: ['accordion'],
    breadcrumb: ['breadcrumb'], pagination: ['pagination'], menu: ['menu'],
    button: ['button'], iconbutton: ['iconbutton', 'icon'], icontile: ['icontile'],
    tooltip: ['tooltip'], modal: ['modal'], alert: ['alert'], toast: ['toast']
  };
  /** Resolve one family entry, optionally merged with one of its `variants[key]` (the variant wins, and may carry its
      own `expect` block). Returning the merged object is what lets a stamp and the gate resolve the SAME profile: the
      stamp records `variant`, the gate calls `CF.profile(g, f, stamp.variant)` and compares its `expect` to the geo. */
  /** The variant NAMES a profile declares: `variants` may be a name list or a map of per-variant overrides. */
  CF.variantKeys = function (vs) {
    if (!vs) return [];
    return Array.isArray(vs) ? vs.map(String) : Object.keys(vs);
  };
  CF.profile = function (group, family, variant) {
    var g = CF.reference(group);
    if (!g || typeof g !== 'object') return null;
    var fam = String(family || '').toLowerCase();
    var keys = [fam].concat(CF.PROFILE_ALIAS[fam] || []).map(function (k) { return k.toLowerCase(); });
    for (var i = 0; i < keys.length; i++) {
      var hit = null;
      Object.keys(g).some(function (gk) {
        var v = g[gk];
        if (gk.toLowerCase() === keys[i] && v && typeof v === 'object' && !Array.isArray(v)) { hit = v; return true; }
        return false;
      });
      if (hit) {
        var base = Object.assign({ _group: group, _family: fam, _key: keys[i] }, hit);
        // `variants` is either a NAME LIST (the family has these variants, no overrides) or a MAP of overrides; only a
        // map can be merged. Accepting both keeps a profile that just enumerates variants legal.
        var vv = (variant && hit.variants && !Array.isArray(hit.variants)) ? hit.variants[variant] : null;
        if (vv && typeof vv === 'object') Object.assign(base, vv, { _group: group, _family: fam, _key: keys[i], _variant: variant });
        else if (variant) base._variant = variant;
        return base;
      }
    }
    return null;
  };
  /** Every family entry a group declares, keyed by lower-case name. */
  CF.profiles = function (group) {
    var g = CF.reference(group), out = {};
    if (!g || typeof g !== 'object') return out;
    Object.keys(g).forEach(function (k) {
      var v = g[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && !/^(families|shapes|variants|source|anatomy)$/i.test(k)) {
        out[k.toLowerCase()] = Object.assign({ _group: group, _key: k }, v);
      }
    });
    return out;
  };
  /** The durable birth stamp: what a factory actually drew and which profile it drew from. `geo` uses the same keys
      as the profile's `expect` block, so a gate compares like with like instead of guessing anatomy. */
  CF.profStamp = function (host, prof, geo, extra) {
    if (!host || !prof || !host.setPluginData) return null;
    var d = Object.assign({ g: prof._group, f: prof._family || prof._key, src: prof.source || null,
      derived: !!prof.derived, geo: geo || {} }, extra || {});
    try { host.setPluginData('nl:prof', JSON.stringify(d)); } catch (e) {}
    return d;
  };
  /** Read a host's profile stamp; a component copy answers with its master's stamp (the master is the definition). */
  CF.profOf = function (s) {
    if (!s || !s.getPluginData) return null;
    var read = function (x) { try { var p = x.getPluginData('nl:prof'); return p ? JSON.parse(p) : null; } catch (e) { return null; } };
    var own = read(s);
    if (own) return own;
    try {
      var r = CF.get && CF.get(s.name);
      var m = r && r.mainInstance ? r.mainInstance() : null;
      if (m && m.getPluginData) return read(m);
    } catch (e) {}
    return null;
  };
  /** Compare a stamp's measured geometry to the profile's declared `expect` block; returns the mismatched keys.
      A family is measured per SIZE, so the stamp's `size` axis merges its `sizes[size]` block over `expect` — one
      family-level contract (shape, material) plus one per-size contract (height, type step). */
  CF.profDiff = function (prof, stamp) {
    var exp = prof && prof.expect;
    var bySize = (prof && stamp && stamp.size && prof.sizes && prof.sizes[stamp.size]) || null;
    if (bySize) exp = Object.assign({}, exp || {}, bySize);
    var got = (stamp && stamp.geo) || {}, out = [];
    if (!exp) return out;
    Object.keys(exp).forEach(function (k) {
      var want = exp[k], have = got[k];
      if (want === null || want === undefined) return;
      if (typeof want === 'number') {
        if (!Number.isFinite(Number(have)) || Math.abs(Number(have) - want) > 0.75) out.push({ k: k, want: want, got: have });
      } else if (String(have) !== String(want)) out.push({ k: k, want: want, got: have });
    });
    return out;
  };
  /** The keys a stamp must MEASURE to satisfy `expect`: the family block plus every per-size block (the stamp knows
      its size only after it is written, so the whole union is measured). */
  CF.profKeys = function (prof) {
    var ks = Object.keys((prof && prof.expect) || {});
    var ss = (prof && prof.sizes) || {};
    Object.keys(ss).forEach(function (k) { Object.keys(ss[k] || {}).forEach(function (kk) { if (ks.indexOf(kk) < 0) ks.push(kk); }); });
    return ks;
  };

  /** Resolve a host NAME to its profiled family entry (group + family + variant). Three passes, in order: the
      first path token as a family key (alias-aware); any family in any seeded group that DECLARES the second token
      as a variant (this is what sends `IconButton·Process·MD` to `icontile`, not `iconbutton`); then a prefix match
      (`TableRow·` → `table`). Returns {group,family,variant} — or null when no profile claims the name. */
  CF.profKeyFor = function (name) {
    var n = String(name || '').toLowerCase();
    if (!n || /·spec(·|$)|-pageroot$|-header$|-footer$|^masters·/.test(n)) return null;
    var seg = n.split('·'), tok = seg[0], v2 = seg[1] || null;
    var groups = ['actions', 'forms', 'selection', 'data', 'navigation', 'feedback'];
    // A COMPOSITE is not its atom. `ButtonGroup·Primary` and `SplitButton·Primary` used to resolve to the `button`
    // profile (via the declared variant `primary` / the `button` prefix), so the audit demanded a Button birth stamp
    // on a composite that is not a Button (measured 2026-10-26: 15 false reference_drift on ButtonGroup·Spec and 10
    // on SplitButton·Spec). The canonical block-page families are the file's own family vocabulary; a non-key match
    // may only cross into one of the structural containers (Table/List/Calendar), never into a different atom.
    var CANON = {};
    try { if (storage.CATALOG && storage.CATALOG.BLOCKS) storage.CATALOG.BLOCKS.forEach(function (b) { CANON[String(b.family).toLowerCase()] = 1; }); } catch (e) {}
    var CONTAINER = { list: 1, table: 1, calendar: 1 };
    var related = function (hit) {
      return tok.indexOf(hit) === 0 || hit.indexOf(tok) === 0 || tok.slice(0, 4) === hit.slice(0, 4);
    };
    // A family is measured per SIZE (an xl button is 48/16, an lg one 40/14), so the name's size axis is resolved
    // against the entry's `sizes` block and returned with it — one `expect` per family plus one merge per size.
    var sizeOf = function (ent) {
      var ss = ent && ent.sizes; if (!ss || typeof ss !== 'object') return null;
      var keys = Object.keys(ss);
      for (var i = 1; i < seg.length; i++) if (keys.indexOf(seg[i]) >= 0) return seg[i];
      return null;
    };
    var pass = function (i, want) {
      var ref = CF.reference(groups[i]); if (!ref) return null;
      if (want === 'variant' && !v2) return null;
      var fams = CF.profiles(groups[i]);
      var hit = Object.keys(fams).filter(function (k) {
        if (want === 'key') {
          var keyOk = tok === k || (CF.PROFILE_ALIAS[k] && CF.PROFILE_ALIAS[k].indexOf(tok) >= 0);
          if (!keyOk) return false;
          // One host prefix can belong to two families: `IconButton·Secondary·XL·Circle` is the TONE family
          // (iconbutton) while `IconButton·Process·MD` is the TILE family (icontile). `types` is the declaring
          // family's own list of second-segment tokens — without it the variant match pulls every `IconButton·…`
          // onto whichever other family happens to declare that word (a circle judged by a button's numbers).
          var types = fams[k].types;
          return !types || !v2 || types.map(String).indexOf(v2) >= 0;
        }
        if (want === 'variant') return fams[k].variants && !Array.isArray(fams[k].variants) && Object.keys(fams[k].variants).indexOf(v2) >= 0;
        return tok.indexOf(k) === 0;                              // prefix: listitem → list, tablerow → table
      })[0];
      if (!hit) return null;
      var hitLower = String(hit).toLowerCase();
      var aliasOk = !!(CF.PROFILE_ALIAS[hit] && CF.PROFILE_ALIAS[hit].indexOf(tok) >= 0);
      if (want !== 'key' && !aliasOk) {
        if (CANON[tok] && hitLower !== tok && !CONTAINER[hitLower]) return null;
        if (!related(hitLower)) return null;
      }
      // A VARIANT is any name segment the entry declares as one (first wins): `Card·Outlined·Selectable·Alt2` names a
      // state slot AND a selectable axis, and only `Selectable` is a declared variant — while `Switch·Md·On` names no
      // variant at all, so nothing is recorded. Size segments stay in `size`, never here.
      var vd = fams[hit].variants && !Array.isArray(fams[hit].variants) ? Object.keys(fams[hit].variants) : [];
      var vary = null;
      for (var si = 1; si < seg.length && vd.length; si++) { if (vd.indexOf(seg[si]) >= 0) { vary = seg[si]; break; } }
      return { group: groups[i], family: hit, variant: vary, size: sizeOf(fams[hit]) };
    };
    // Pass order: the FIRST TOKEN names the family (it is the host's own prefix), a DECLARED variant is the fallback
    // that catches a name whose prefix maps to several families (`IconButton·Process·MD` → `icontile`), and a bare
    // prefix match (`TableRow·` → `table`) only last.
    for (var w = 0; w < 3; w++) {
      var kind = ['key', 'variant', 'prefix'][w];
      for (var i = 0; i < groups.length; i++) { var r = pass(i, kind); if (r) return r; }
    }
    return null;
  };
  /** The geometry a host can be JUDGED on from its render — never the profile's own numbers. Family-specific keys
      (`box`, `track`, `handle`…) resolve through the named control plate inside the host; anything else a profile
      expects must have been written by the factory that drew it, so a host from before the profile exists FAILS that
      key instead of inheriting it (measured is the only honest source here). */
  CF.measureProf = function (host, keys) {
    var geo = {}, texts = [], plates = {}, depthLimit = 5;
    var hexOf = function (c) {
      if (!c) return null;
      if (c.r === undefined) return String(c).slice(0, 7).toLowerCase();
      return '#' + [c.r, c.g, c.b].map(function (v) { return Math.round(v * 255).toString(16).padStart(2, '0'); }).join('');
    };
    // The measured hex goes back into the SAME vocabulary the factories stamp with (a palette key), so a stamp written
    // by a factory and one written by stampPass are comparable. `P` first (the paint side), then the token index.
    var tokOf = function (hex) {
      if (!hex) return null;
      var h = String(hex).toLowerCase();
      // The token index first: it resolves a shared hex (white is both `surfaceRaised` and `onPrimary`) to the SURFACE
      // name, which is the vocabulary a factory stamps for a plate. The palette is the fallback for a literal the
      // token set does not carry; a still-unknown hex comes back as itself so the gate can quote it.
      try {
        var ci = storage.TK && storage.TK.colorIndex && storage.TK.colorIndex();
        var hit = ci && ci.byHex && ci.byHex[h];
        if (hit) return String((hit.surface && typeof hit.surface === 'string') ? hit.surface : (hit.all && hit.all[0]) || '').replace(/^color\./, '');
      } catch (e) {}
      var idx = tokOf._i || (tokOf._i = (function () {
        var m = {}; Object.keys(P).forEach(function (k) { var v = String(P[k] || '').toLowerCase(); if (/^#[0-9a-f]{6}$/.test(v) && m[v] === undefined) m[v] = k; }); return m;
      })());
      if (idx[h]) return idx[h];
      return h;
    };
    var ORIGIN = /^(field|box|track|panel|item|ring)$/;
    var walk = function (s, d) {
      var nm = String(s.name || '');
      if (s.type === 'text') texts.push(s);
      // A focus ring is `ring·…`, a radio's own disc is `ring`: only the exact control plate may be the origin, and
      // only when the host itself carries no paint (a card with a checkbox child must measure the CARD, not the box).
      if (!plates.origin && (ORIGIN.test(nm) || /^cell·/.test(nm))) plates.origin = s;
      if (!plates[nm] && /^(box|ring|track|handle)$/.test(nm)) plates[nm] = s;
      if (!plates.cell && /^cell·/.test(nm)) plates.cell = s;
      if (d >= depthLimit) return;
      var kids = s.children; if (!Array.isArray(kids)) return;
      kids.forEach(function (c) { walk(c, d + 1); });
    };
    walk(host, 0);
    var painted = function (s) { var f = s ? ((s.fills || [])[0] || {}) : {}; return !!(f.fillColorGradient || f.fillColor); };
    var origin = painted(host) ? host : (plates.origin || host);
    var want = function (k) { return !keys || keys.indexOf(k) >= 0; };
    var paintOf = function (s) {
      if (!s) return 'transparent';
      var f = (s.fills || [])[0] || {};
      if (f.fillColorGradient) return 'gradient';
      var h = hexOf(f.fillColor);
      if (!h || Number(f.fillOpacity) === 0) return 'transparent';   // no paint IS the source's `transparent` field
      return tokOf(h);
    };
    var strokeOf = function (s) {
      if (!s) return 0;
      var st = (s.strokes || [])[0];
      return st ? Number(st.strokeWidth || 1) : 0;
    };
    geo.h = Math.round(host.height);
    // The corner is the ORIGIN's own (a host painted flat with a rounded child must not borrow the child's radius,
    // and a nested pill inside a card must not push a 40px card to 9999).
    if (want('radius')) geo.radius = Number.isFinite(Number(origin.borderRadius)) ? Math.round(Number(origin.borderRadius)) : 0;
    if (want('fs') && texts.length) geo.fs = Math.round(Number(texts[0].fontSize));
    // padX is deliberately NOT measured: a Penpot text node is fitted to its INK and `alignPage` then snaps it to the
    // host's centre, so the left edge reports `pad + (box − ink)/2` — 29 for a button whose factory asked for 24, and
    // (field − ink)/2 for a left-aligned input. The number would be fiction, so a profile gates pad/fill/stroke/type
    // through `fill`/`stroke`/`fs`/`h` instead, and the factory's own `padX` claim stays a diagnostic, not a gate.
    if (want('stroke')) geo.stroke = strokeOf(origin);
    if (want('fill')) geo.fill = paintOf(origin);
    // `size` is the tile's own square (icon tiles carry no label), `cell` the pagination cell plate.
    if (want('size')) geo.size = Math.round(Math.min(Number(host.width), Number(host.height)));
    if (want('cell')) { var cp = plates.cell || null; if (cp) geo.cell = Math.round(Math.min(Number(cp.width), Number(cp.height))); }
    // `gradient` and `chip` are material facts the render CAN answer: a gradient fill is visible, and `chip` is the
    // ELEVATION the source gives that plate — EL's durable stamp names the recipe, so a pre-profile host is judged by
    // what it wears, not by what the factory claims.
    if (want('gradient')) geo.gradient = paintOf(origin) === 'gradient';
    if (want('chip')) {
      var eS = null;
      try { eS = storage.EL && storage.EL.readStamp ? storage.EL.readStamp(origin) : null; } catch (e) {}
      if (eS) geo.chip = /^chip/.test(String(eS));
    }
    ['box', 'ring', 'track', 'handle'].forEach(function (k) {
      if (want(k) && plates[k]) geo[k] = Math.round(Math.min(Number(plates[k].width), Number(plates[k].height)));
    });
    if (want('trackW') && plates.track) geo.trackW = Math.round(plates.track.width);
    if (want('trackH') && plates.track) geo.trackH = Math.round(plates.track.height);
    if (want('handle') && plates.handle) geo.handle = Math.round(plates.handle.width);
    return geo;
  };
  /** Idempotent birth-stamp REPAIR (source-adaptation §5). Walks `root`, and for every host a profile claims but that
      carries no `nl:prof`, writes the stamp from what the RENDER measures — so a file built before the profile was
      seeded is judged against the profile instead of skipped. It never copies profile numbers into the stamp: a host
      that is still generic keeps its generic measurement, fails `expect`, and is reported for a rebuild. */
  CF.stampPass = function (root, o) {
    o = o || {};
    var out = { scanned: 0, stamped: 0, kept: 0, claimed: 0 };
    if (!root) return out;
    (function walk(s, d) {
      if (d > 12) return;
      var nm = String(s.name || '');
      var kids = s.children;
      var isBoard = s.type === 'board';
      if (isBoard) {
        out.scanned++;
        var key = CF.profKeyFor(nm);
        if (key) {
          out.claimed++;
          var have = null;
          try { have = s.getPluginData ? s.getPluginData('nl:prof') : null; } catch (e) {}
          if (!have || o.overwrite) {
            var prof = CF.profile(key.group, key.family, key.variant);
            if (prof) {
              var geo = CF.measureProf(s, CF.profKeys(prof));
              CF.profStamp(s, prof, geo, { family: key.family, variant: key.variant, size: key.size, measured: true,
                state: (nm.split('·').filter(function (t) { return /^(default|hover|focus|pressed|selected|disabled|checked|on|off|open)$/.test(t.toLowerCase()); })[0] || 'default').toLowerCase() });
              out.stamped++;
            } else out.kept++;
          } else out.kept++;
        }
      }
      if (Array.isArray(kids)) kids.forEach(function (c) { walk(c, d + 1); });
    })(root, 0);
    return out;
  };

  /*__CF_MORE__*/

  try { CF.hydrate(); } catch (e) {}
  try { if (storage.TK && storage.TK.declared) CF.adoptPalette(); } catch (e) {}
  storage.CF = CF;
  CF._keys = Object.keys(CF).filter(function (k) { return typeof CF[k] === 'function' && /^[a-z]/.test(k); });
  return { seeded: 'CF', factories: CF._keys.length, glyphs: CF.glyphKinds.length,
           sizes: CF.sizes, slots: LY ? Object.keys(LY.slots) : ['LY not seeded'] };
})();
