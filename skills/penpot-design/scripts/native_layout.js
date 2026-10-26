// native_layout.js —— Penpot **native auto-layout** engine (storage.NL).
// Why this file exists: `references/penpot-capabilities.md` §2 proved the "flex is uncontrollable" verdict was three
// naming/measurement bugs, not a platform limit — nested `fix` boards keep their size, `fill` stretches them, padding
// moves children, hug height re-grows. NL authors screens the way Penpot (and the official structure guidance) wants:
// real flow, real sizing, native guides — so the deliverable stays editable by a designer.
//
// Division of labour (do not blur it):
//   storage.LY  = region *math* (what boxes exist, at what size)      → deterministic, pure numbers
//   storage.CF  = control *drawing* (one control, every variant/state) → absolute inside its own board, by design
//   storage.NL  = *flow* authoring (boards that lay themselves out)     → native flex/grid, the screen skeleton
//   storage.mkAbsBoard/absMount = the absolute path, still correct for spec boards, art and pixel-exact overlays
//
// Usage: paste the whole file into execute_code once (after seed_storage.js + layout_engine.js). Everything is
// available as storage.NL.*. Async calls must be awaited inside `return (async () => { … })()` — the harness awaits the
// returned promise (capabilities §0.1), which is what makes build → settle → measure one call.
//
// The vocabulary rules this engine enforces (each one measured, capabilities §1/§2/§3):
//   R1  flex padding is `topPadding|rightPadding|bottomPadding|leftPadding|verticalPadding|horizontalPadding`.
//       `paddingTop` etc. (the official plugin-types names) are silently dropped here — applyFlex aliases them and
//       **reports anything it cannot map** instead of writing nothing.
//   R2  `layoutChild` exists only after appendChild AND only when the parent board has flex/grid.
//       Child sizing is written **last**: writing the board's own horizontalSizing afterwards normalizes it back.
//   R3  Geometry reads are transitional until the engine settles. NL.settle() then NL.report(); for anything that
//       ships, export (the render is the referee).
//   R4  `grid.appendChild(child, row, column)` is **1-based**, and 0 / out-of-range indices are silently clamped to
//       the first cell. NL.cell validates the range and refuses instead.
//   R5  `shape.resize()` on a flow child **downgrades its declared sizing to `fix`** (measured: a `fill` child at 252
//       resized to 70 reads back `fix/fix`). Declare the sizing after the last resize. `NL.sizing` records what it was
//       asked to write, and `NL.auditFlow` reports the downgrade as `sizing_dropped` — nothing else in this build does.
//   R6  `fill` means two different numbers depending on the axis: cross axis = the parent's content box, main axis =
//       the free space left by the non-filling siblings (measured 376 in a content-552 row with one 160 sibling and
//       gap 16). A main-axis `fill` inside a hug parent normalizes the parent from `auto` back to `fix` silently.

return (function () {
  if (!storage.mkText) return { err: 'run seed_storage.js first (needs mkText/sleep)' };
  const NL = {}, PREV = storage.NL || null;
  storage.NL = NL;
  // Sibling engines are reached through `storage` **at call time**, never captured here: NL may be seeded before LY/CF
  // (the seed order in engines.md puts it last, but a post-crash supplement run often does not know that yet).
  NL.VERSION = '1.1.0';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const N = (v) => Math.round(v);

  // ---------- metadata side registry ----------
  // **Shape proxies are not extensible**: `shape._x = 1` throws `Cannot add property _x, object is not extensible`
  // (measured). So every note NL takes about a board lives here, keyed by shape id, and survives across execute_code
  // calls because storage.NL itself survives.
  // An ENGINE reload must not erase it: re-seeding native_layout.js is the documented repair path, and a fresh `_reg`
  // silently turns every `declaredAbsolute` CF mount into an `absolute_child` finding (the audit loses the note that
  // said "this child was pinned on purpose"). Carry the registry across the reload instead.
  NL._reg = (PREV && PREV._reg) || {};
  NL._note = function (shape, patch) {
    const k = String(shape.id);
    NL._reg[k] = Object.assign(NL._reg[k] || { name: shape.name }, patch);
    return NL._reg[k];
  };
  NL._meta = function (shape) { return NL._reg[String(shape.id)] || null; };
  NL.forget = function (shape) { delete NL._reg[String(shape.id)]; return true; };

  // ---------- R0: settle ----------
  // 900ms settled a 2-level tree correctly; a 3-level nested board was still stale at 1200ms (capabilities §0.2).
  // Anything with nested flow boards inside nested flow boards needs the deep variant, or a second call.
  NL.settle = async function (ms) { await sleep(ms || 900); return true; };
  NL.settleDeep = async function (ms) { await sleep(ms || 2000); return true; };

  // ---------- R1: validated flex vocabulary ----------
  // Measured Object.keys(flex) in the connected build. Anything outside this list is a JS own-property, not a layout input.
  NL.FLEX_KEYS = ['dir', 'wrap', 'alignItems', 'alignContent', 'justifyItems', 'justifyContent',
                  'rowGap', 'columnGap', 'verticalPadding', 'horizontalPadding',
                  'topPadding', 'rightPadding', 'bottomPadding', 'leftPadding',
                  'horizontalSizing', 'verticalSizing'];
  // The trap this guards: `paddingTop` reads back 24 in the same call (you wrote a stray property) and does nothing.
  NL.FLEX_ALIAS = { paddingTop: 'topPadding', paddingRight: 'rightPadding', paddingBottom: 'bottomPadding',
                    paddingLeft: 'leftPadding', horizontalSizing_: 'horizontalSizing', gap: null,
                    padding: null, itemReverse: 'reverseDir' };
  // pad shorthand: {pad:24} | {pad:{x:24,y:16}} | {pad:{t,r,b,l}} | {pad:{top,right,bottom,left}}.
  // The long names are accepted because they are what @penpot/plugin-types calls them; **unknown keys are reported**,
  // because {pad:{top:24}} used to write nothing at all and stay silent — the same failure class as `paddingTop`.
  NL._pad = function (o) {
    const p = o.pad, s = {}, bad = [];
    if (p === undefined || p === null) return { s: s, bad: bad };
    if (typeof p === 'number') { s.topPadding = p; s.rightPadding = p; s.bottomPadding = p; s.leftPadding = p; return { s: s, bad: bad }; }
    if (typeof p !== 'object') return { s: s, bad: ['pad must be a number or an object'] };
    const MAP = { x: ['leftPadding', 'rightPadding'], y: ['topPadding', 'bottomPadding'],
                  t: ['topPadding'], top: ['topPadding'], r: ['rightPadding'], right: ['rightPadding'],
                  b: ['bottomPadding'], bottom: ['bottomPadding'], l: ['leftPadding'], left: ['leftPadding'] };
    Object.keys(p).forEach(function (k) {
      const m = MAP[k];
      if (!m) { bad.push('pad.' + k); return; }
      if (p[k] === undefined) return;
      m.forEach(function (key) { s[key] = p[k]; });
    });
    return { s: s, bad: bad };
  };
  NL._padSpec = function (o) { return NL._pad(o).s; };

  /** Write a spec onto board.flex, rejecting unknown keys loudly instead of silently. Returns {applied, rejected}. */
  NL.applyFlex = function (board, spec) {
    const applied = {}, rejected = {};
    if (!board || !board.flex) return { err: 'board has no flex (call addFlexLayout / NL.frame first)' };
    const s = Object.assign({}, spec);
    if (s.pad !== undefined) {
      const pad = NL._pad(s);
      Object.assign(s, pad.s);
      pad.bad.forEach(function (k) { rejected[k] = 'unknown pad key (use x/y, t/r/b/l or top/right/bottom/left)'; });
      delete s.pad;
    }
    Object.keys(s).forEach((k) => {
      let key = k;
      if (NL.FLEX_ALIAS[k] === null) { rejected[k] = 'no such flex property (expand it: ' + (k === 'gap' ? 'rowGap+columnGap' : 'topPadding/rightPadding/bottomPadding/leftPadding') + ')'; return; }
      if (NL.FLEX_ALIAS[k]) key = NL.FLEX_ALIAS[k];
      if (NL.FLEX_KEYS.indexOf(key) < 0) { rejected[k] = 'not in the measured flex vocabulary: ' + key; return; }
      if (s[k] === undefined) return;
      try { board.flex[key] = s[k]; applied[key] = board.flex[key]; }
      catch (e) { rejected[k] = String(e).slice(0, 90); }
    });
    return { applied: applied, rejected: rejected };
  };

  // ---------- R2: sizing vocabulary ----------
  // own (container) = 'fix' | 'auto' ; layoutChild (as a flow child) = 'fix' | 'auto' | 'fill'
  NL.OWN_SIZING = ['fix', 'auto'];
  NL.CHILD_SIZING = ['fix', 'auto', 'fill'];

  /** Declare how a shape behaves *inside* its flow parent. Call AFTER mount **and after every `resize()`** — measured:
   *  `shape.resize()` on a flow child silently downgrades its `layoutChild` sizing to `fix` (R5), so a `fill` declared
   *  before the resize is gone afterwards. Also never re-write the shape's own horizontalSizing afterwards
   *  (it wins and normalizes layoutChild back — capabilities §1). */
  NL.sizing = function (child, h, v) {
    const out = { name: child.name };
    if (!child.layoutChild) { out.err = 'layoutChild is null → parent has no flex/grid, or the child is not appended yet'; return out; }
    const lc = child.layoutChild;
    if (h) { if (NL.CHILD_SIZING.indexOf(h) < 0) out.hRejected = h; else { try { lc.horizontalSizing = h; } catch (e) { out.hRejected = String(e).slice(0, 60); } } }
    if (v) { if (NL.CHILD_SIZING.indexOf(v) < 0) out.vRejected = v; else { try { lc.verticalSizing = v; } catch (e) { out.vRejected = String(e).slice(0, 60); } } }
    out.h = lc.horizontalSizing; out.v = lc.verticalSizing;
    // remember the intent, so auditFlow can catch the two silent downgrades (R5 resize, hug-vs-fill normalization)
    NL._note(child, { declaredSizing: { h: h || out.h, v: v || out.v } });
    const p = child.parent, pf = p && p.flex ? p.flex : null;
    if (pf) {
      const isCol = pf.dir !== 'row';
      const fillMain = isCol ? lc.verticalSizing === 'fill' : lc.horizontalSizing === 'fill';
      if (fillMain) {
        const own = NL._meta(p) || {};
        if ((isCol ? own.declaredSizing && own.declaredSizing.v === 'auto' : own.declaredSizing && own.declaredSizing.h === 'auto')) {
          out.warn = 'hug_defeat: the parent hugs on its main axis, and a main-axis fill child normalizes it back to fix (measured)';
        }
        if (p[isCol ? 'verticalSizing' : 'horizontalSizing'] === 'auto') out.warn = 'hug_defeat (readback): parent main axis still reads auto while this child fills it → it computes 0';
      }
    }
    return out;
  };
  NL.fill = (c) => NL.sizing(c, 'fill', 'fill');
  NL.fix = (c, w, h) => { if (w && c.resize) { try { c.resize(w, h); } catch (e) {} } return NL.sizing(c, 'fix', 'fix'); };
  NL.hug = (c) => NL.sizing(c, 'auto', 'auto');
  NL.alignSelf = (c, v) => { if (!c.layoutChild) return { err: 'layoutChild null (R2)' }; c.layoutChild.alignSelf = v; return { alignSelf: c.layoutChild.alignSelf }; };
  NL.zIndex = (c, z) => { if (!c.layoutChild) return { err: 'layoutChild null (R2)' }; c.layoutChild.zIndex = z; return { zIndex: c.layoutChild.zIndex }; };
  NL.margin = (c, spec) => {
    if (!c.layoutChild) return { err: 'layoutChild null (R2)' };
    const lc = c.layoutChild, out = {};
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      const k = 'margin' + side[0].toUpperCase() + side.slice(1);
      if (spec[side] !== undefined || spec[k] !== undefined) { const v = spec[side] !== undefined ? spec[side] : spec[k]; try { lc[k] = v; out[k] = lc[k]; } catch (e) { out[k] = 'ERR ' + String(e).slice(0, 50); } }
    });
    return out;
  };

  // ---------- flow boards ----------
  /**
   * NL.frame(name, o) → a board that lays its children out.
   * o: { x,y,w,h, fill, radius, dir:'row'|'column', gap | rowGap/columnGap | **breath:'inline|row|block|group|section|band|page'**,
   *      pad (see _padSpec), tier, align, justify, wrap, sizing:'fix'|'auto' | {h,v}, clip, guides:{cols,margin,gutter},
   *      strokes, shadow, parent, absolute (mount as absolute inside a flow parent), name }
   * `breath` is the whitespace-first default: it takes the gap from `LY.BREATH[level]` at the board's tier, so a content
   * stack never has to invent a number and `off_scale_gap`/`cramped_gap` cannot fire on it.
   * `sizing:'auto'` hugs; measured: a column of 3×52 + 2×16 + 2×24 padding grew 188 → 236 when padding was applied.
   */
  NL.frame = function (name, o) {
    o = o || {};
    const b = penpot.createBoard();
    b.name = name;
    b.x = o.x || 0; b.y = o.y || 0;
    try { b.resize(o.w || 100, o.h || 100); } catch (e) {}
    // A layout frame is not a crop: default clipContent OFF so a card's shadow / ring / stroke can bleed into the gap.
    b.clipContent = false;
    if (o.fill) b.fills = [{ fillColor: o.fill, fillOpacity: o.fillOpacity === undefined ? 1 : o.fillOpacity }];
    else b.fills = [];
    if (o.radius) b.borderRadius = storage.CF.radius(o.radius);
    // A stroke written without `strokeAlignment` reads back null, and null exports as `center`: half the band falls
    // outside the shape and a clipped ancestor eats it (the "border shows only part of itself" class). Closed shapes
    // are inner by contract (api-pitfalls §3), so the default is applied here rather than left to each caller.
    if (o.strokes) b.strokes = o.strokes.map((s) => Object.assign({ strokeStyle: 'solid', strokeOpacity: 1, strokeAlignment: 'inner' }, s));
    if (o.shadow && storage.CF && storage.CF.shadow) { try { b.shadows = storage.CF.shadow(o.shadow); } catch (e) {} }
    b.addFlexLayout();
    const spec = { dir: o.dir || 'column' };
    // 留白 is the DEFAULT separation device, and the omission path used to be its opposite: a frame with no `gap` gets
    // Penpot's flex default of **0**, so "I did not think about spacing" renders as "the blocks touch". `breath` names
    // the hierarchy level instead of a number and resolves it from `LY.BREATH` (single source: the auditor reads the
    // same table, so a declared breath can never be off-scale). An explicit `gap`/`rowGap`/`columnGap` still wins —
    // control anatomy is tight by contract (§2 `inline` 8: icon↔label), and this is why the ladder is opt-IN per frame
    // while the *requirement* is opt-OUT (designGate `cramped_gap`), never a silent rewrite of every factory.
    if (o.breath && storage.LY && storage.LY.breath) {
      const bg = storage.LY.breath(o.breath === true ? 'block' : o.breath,
                                  o.tier || (storage.CF && storage.CF.tier) || 'web');
      spec.rowGap = bg; spec.columnGap = bg;
    }
    if (o.gap !== undefined) { spec.rowGap = o.gap; spec.columnGap = o.gap; }
    if (o.rowGap !== undefined) spec.rowGap = o.rowGap;
    if (o.columnGap !== undefined) spec.columnGap = o.columnGap;
    if (o.pad !== undefined) spec.pad = o.pad;
    if (o.align) spec.alignItems = o.align;
    if (o.alignContent) spec.alignContent = o.alignContent;
    if (o.justify) spec.justifyContent = o.justify;
    if (o.wrap) spec.wrap = o.wrap;
    const sz = o.sizing === undefined ? 'fix' : o.sizing;
    if (typeof sz === 'string') { spec.horizontalSizing = sz; spec.verticalSizing = sz; }
    else { if (sz.h) spec.horizontalSizing = sz.h; if (sz.v) spec.verticalSizing = sz.v; }
    const flex = NL.applyFlex(b, spec);
    if (o.clip !== undefined) {
      try {
        b.clipContent = !!o.clip;
        // Register as a DELIBERATE crop only when the caller says so (`o.keepClip`). A blanket registration here
        // made every clip:true control host (pill-corner ButtonGroup, Segmented, Tabs…) a keep-clip, which defeats
        // fitToClip's release in ctx.ring — the focus ring then mounts OUTSIDE the host, the audit reads
        // `focus_ring_missing`, and siblings cover the stray ring (`stroke_covered`). Measured 2026-10-21 on
        // 03.03 ButtonGroup after the block-page rebuild; CF.keepClip remains the explicit registry.
        if (o.clip && o.keepClip) (storage._clipKeep || (storage._clipKeep = {}))[b.id] = 1;
      } catch (e) {}
    }
    if (o.guides) NL.guide(b, o.guides);
    NL._note(b, { rejected: flex.rejected, kind: 'frame',
                  // only a size the caller actually chose is an expectation; the 100×100 default would report size_stale
                  declared: (o.w || o.h) ? { w: N(o.w || 100), h: N(o.h || 100) } : null,
                  declaredSizing: { h: spec.horizontalSizing, v: spec.verticalSizing },
                  declaredAbsolute: !!o.absolute });
    if (o.parent) NL.mount(o.parent, b, { absolute: o.absolute, x: o.x, y: o.y, sizing: o.childSizing, z: o.z });
    return b;
  };
  NL.row = (name, o) => NL.frame(name, Object.assign({ dir: 'row' }, o || {}));
  NL.col = (name, o) => NL.frame(name, Object.assign({ dir: 'column' }, o || {}));

  /** Mount into a flow parent. `absolute:{x,y}` opts this child out of flow (pixel-exact overlay on a flow board). */
  NL.mount = function (parent, child, o) {
    o = o || {};
    parent.appendChild(child);
    if (o.absolute) {
      if (!child.layoutChild) return { err: 'layoutChild null after append → parent has no flex/grid (R2)' };
      child.layoutChild.absolute = true;
      child.x = o.absolute.x !== undefined ? o.absolute.x : o.x;
      child.y = o.absolute.y !== undefined ? o.absolute.y : o.y;
      // a deliberate pin must be declared, or auditFlow reports it as absolute_child (same rule as absMount)
      NL._note(child, { declaredAbsolute: true });
      return { mounted: child.name, mode: 'absolute' };
    }
    if (o.alignSelf) { try { child.layoutChild.alignSelf = o.alignSelf; } catch (e) {} }
    if (o.margin) NL.margin(child, o.margin);
    if (o.sizing) NL.sizing(child, o.sizing.h || (typeof o.sizing === 'string' ? o.sizing : null), o.sizing.v || (typeof o.sizing === 'string' ? o.sizing : null));
    if (o.z !== undefined) NL.zIndex(child, o.z);
    return { mounted: child.name, mode: 'flow', sizing: child.layoutChild ? child.layoutChild.horizontalSizing + '/' + child.layoutChild.verticalSizing : null };
  };

  /** Append + declare sizing in one go, sizing written last (R2). */
  NL.add = function (parent, child, h, v, extra) {
    parent.appendChild(child);
    if (extra && extra.alignSelf) { try { child.layoutChild.alignSelf = extra.alignSelf; } catch (e) {} }
    return NL.sizing(child, h, v);
  };

  // ---------- grid ----------
  /**
   * NL.gridFrame(name, o) → grid board. o.cols / o.rows = arrays of [type, value] with type ∈
   * 'flex'|'fixed'|'percent'|'auto' (measured: `fr`, `percentage`, `minmax` are rejected).
   */
  NL.gridFrame = function (name, o) {
    o = o || {};
    const b = penpot.createBoard();
    b.name = name; b.x = o.x || 0; b.y = o.y || 0;
    try { b.resize(o.w || 100, o.h || 100); } catch (e) {}
    b.clipContent = false;
    if (o.fill) b.fills = [{ fillColor: o.fill, fillOpacity: 1 }]; else b.fills = [];
    if (o.radius) b.borderRadius = storage.CF.radius(o.radius);
    b.addGridLayout();
    const g = b.grid, err = [];
    (o.cols || []).forEach((t) => { try { g.addColumn(t[0], t[1] === undefined ? 1 : t[1]); } catch (e) { err.push('col ' + t.join(':') + ' → ' + String(e).slice(0, 60)); } });
    (o.rows || []).forEach((t) => { try { g.addRow(t[0], t[1] === undefined ? 1 : t[1]); } catch (e) { err.push('row ' + t.join(':') + ' → ' + String(e).slice(0, 60)); } });
    if (o.gap !== undefined) { try { g.rowGap = o.gap; g.columnGap = o.gap; } catch (e) {} }
    if (o.rowGap !== undefined) { try { g.rowGap = o.rowGap; } catch (e) {} }
    if (o.columnGap !== undefined) { try { g.columnGap = o.columnGap; } catch (e) {} }
    const gp = NL._pad(o);
    Object.keys(gp.s).forEach((k) => { try { g[k] = gp.s[k]; } catch (e) { err.push(k + ' → ' + String(e).slice(0, 60)); } });
    gp.bad.forEach((k) => err.push(k + ' → unknown pad key (use x/y, t/r/b/l or top/right/bottom/left)'));
    if (o.parent) NL.mount(o.parent, b, { absolute: o.absolute, x: o.x, y: o.y, sizing: o.childSizing });
    NL._note(b, { gridErr: err, declared: (o.w || o.h) ? { w: N(o.w || 100), h: N(o.h || 100) } : null, kind: 'grid', declaredAbsolute: !!o.absolute });
    return b;
  };
  /** Place into a cell. Indices are **1-based** — measured: `grid.appendChild(child, row, column)` puts (1,1) in the
   *  first cell, and `0`, `0/1`, `1/0` and `4/4` on a 2×3 grid are **silently clamped to 1/1** with no error. So the
   *  range is validated here instead of trusting the platform. Spans require placement **first**, else
   *  "Value not valid: cell not found. Code: :row-cell". */
  NL.cell = function (gridBoard, child, row, col, span) {
    const out = { child: child.name };
    const g = gridBoard && gridBoard.grid;
    if (!g) { out.err = 'not a grid board (call NL.gridFrame / addGridLayout)'; return out; }
    const nrows = Array.from(g.rows || []).length, ncols = Array.from(g.columns || []).length;
    if (!(row >= 1 && row <= nrows) || !(col >= 1 && col <= ncols)) {
      out.err = 'cell ' + row + '/' + col + ' is outside a ' + nrows + '×' + ncols + ' grid (1-based) — the platform would clamp it to 1/1 silently';
      return out;
    }
    // A GRID CHILD IS FLOW BY DEFINITION. An absolute layout child KEEPS the flag through `appendChild`, and the
    // platform then ignores the explicit (row,col) and auto-places the shape in the next free cells. Measured
    // 2026-10-26: every `CF.matrix` state row was one column left (axis cells 1..5 while the slots occupied 2..6),
    // because the axes were absolute children of the spec host when they entered the grid. Clearing the flag AFTER
    // the append is too late; it must happen here, before the platform sees the child.
    try { if (child.layoutChild && child.layoutChild.absolute) child.layoutChild.absolute = false; } catch (e) {}
    try { g.appendChild(child, row, col); }
    catch (e) { try { gridBoard.appendChild(child); } catch (e2) {} out.placeErr = String(e).slice(0, 90); }
    if (!child.layoutCell) { out.cellErr = 'layoutCell null → child is not in a grid parent'; return out; }
    if (span) {
      if (span.row !== undefined) { try { child.layoutCell.rowSpan = span.row; } catch (e) { out.rowSpanErr = String(e).slice(0, 70); } }
      if (span.col !== undefined) { try { child.layoutCell.columnSpan = span.col; } catch (e) { out.colSpanErr = String(e).slice(0, 70); } }
    }
    out.cell = { row: child.layoutCell.row, column: child.layoutCell.column, rowSpan: child.layoutCell.rowSpan, columnSpan: child.layoutCell.columnSpan };
    return out;
  };
  /** Auto-place a child into the next free cell (no indices at all). */
  NL.cellAuto = function (gridBoard, child) {
    const out = { child: child.name };
    try { gridBoard.grid.appendChild(child); } catch (e) { try { gridBoard.appendChild(child); } catch (e2) {} out.placeErr = String(e).slice(0, 90); }
    return out;
  };

  // ---------- flow children (text / plate) ----------
  /** Text child. Uses storage.mkText so the CJK/display-font routing (api-pitfalls §5) stays in one place. */
  NL.label = function (str, o) {
    o = o || {};
    const t = storage.mkText(str, 0, 0, o.size || 14, o.color || (storage.T && storage.T.onSurface) || '#0F172A', o.weight || 400, o.role);
    // createText() names every text layer "Text"; a flow label named by its content keeps the layer panel readable and
    // lets an audit quote which label it is talking about.
    try { t.name = o.name || (String(str).replace(/\s+/g, ' ').trim().slice(0, 40) || 'label'); } catch (e) {}
    if (o.growType) { try { t.growType = o.growType; } catch (e) {} }
    if (o.align) { try { t.align = o.align; } catch (e) {} }
    return t;
  };
  NL.plate = function (name, o) {
    o = o || {};
    const r = o.shape === 'ellipse' ? penpot.createEllipse() : penpot.createRectangle();
    r.name = name;
    try { r.resize(o.w || 100, o.h || 100); } catch (e) {}
    if (o.radius && r.borderRadius !== undefined) r.borderRadius = storage.CF.radius(o.radius);
    r.fills = o.fill ? [{ fillColor: o.fill, fillOpacity: o.opacity === undefined ? 1 : o.opacity }] : [];
    if (o.stroke) r.strokes = [{ strokeColor: o.stroke, strokeOpacity: o.strokeOpacity === undefined ? 1 : o.strokeOpacity, strokeWidth: o.strokeW || 1, strokeAlignment: 'inner' }];
    return r;
  };
  /** One-line row of flow children: NL.line(parent, name, {…frame opts}, items) where items = [{label|plate, h, v}]. */
  NL.line = function (parent, name, o, items) {
    const row = NL.frame(name, Object.assign({ dir: 'row', align: 'center', gap: 8, sizing: 'auto' }, o || {}));
    if (parent) NL.mount(parent, row, { sizing: o && o.childSizing });
    (items || []).forEach((it) => {
      const sh = it.label !== undefined ? NL.label(it.label, it) : NL.plate(it.name || 'plate', it);
      NL.add(row, sh, it.h || 'auto', it.v || 'auto', it);
    });
    return row;
  };

  // ---------- native guides (replaces invisible column rectangles) ----------
  /**
   * Put a real Penpot layout guide on a board. Measured 2026-10-20 on 2.17.0:
   *   `board.guides` is a WRITABLE array and only the whole array can be re-assigned (there is no push API);
   *   an entry is `{ type:'column'|'row', display:bool, params:{ color:{color,opacity}, type, margin, gutter } }`;
   *   `params.type` accepts **only** 'stretch' (margin + gutter) and 'center' (size + gutter) — 'auto', 'manual' and
   *   'fr' are rejected with "Value not valid: […]. Code: :guides";
   *   `count` is dropped on write, so the column count is the platform's own division of the board width — asking for
   *   "12 columns" is expressed as the margin/gutter pair that produces them at that tier width.
   * A guide is not a drawing: it is what a designer snaps to, and what the audit reads as proof the board was built on
   * a grid at all (page 11 used to paste `mkRect` column plates, which look like a grid and snap to nothing).
   */
  NL.guide = function (board, spec) {
    spec = spec || {};
    const axis = spec.axis || spec.type || 'column';
    const mode = spec.mode || spec.fillType || 'stretch';
    const params = { color: { color: spec.color || '#8B5CF6', opacity: spec.opacity === undefined ? 0.35 : spec.opacity }, type: mode };
    if (mode === 'center') { params.size = spec.size === undefined ? 80 : spec.size; params.gutter = spec.gutter === undefined ? 24 : spec.gutter; }
    else { params.margin = spec.margin === undefined ? 32 : spec.margin; params.gutter = spec.gutter === undefined ? 24 : spec.gutter; }
    const g = { type: axis, display: spec.display === false ? false : true, params: params };
    let list = [];
    try { list = Array.from(board.guides || []); } catch (e) { list = []; }
    // Same-axis rewrite replaces instead of duplicating: a rebuilt board must not accumulate two column grids.
    list = list.filter((x) => !(x && x.type === axis));
    try { board.guides = list.concat([g]); }
    catch (e) { return { err: String(e).slice(0, 140) }; }
    const back = Array.from(board.guides || []);
    return { guides: back.length, readback: back.map((x) => ({ type: x.type, mode: x.params && x.params.type, margin: x.params && x.params.margin, gutter: x.params && x.params.gutter, size: x.params && x.params.size })) };
  };
  /** Ruler guide. Measured: the signature is POSITIONAL `addRulerGuide(orientation, position)`, orientation
   *  'vertical' | 'horizontal'. The object form throws "Value not a safe number. Code: :addRulerGuide" for every key
   *  permutation tried. Reads back on `board.rulerGuides` — a DIFFERENT collection from `board.guides` — as
   *  `{orientation, position, color}`, with no id. */
  NL.rulerGuide = function (host, position, orientation) {
    try {
      const g = host.addRulerGuide(orientation || 'horizontal', N(position));
      return { ok: true, orientation: g && g.orientation, position: g && g.position, ruler: Array.from(host.rulerGuides || []).length };
    }
    catch (e) { return { err: String(e).slice(0, 120) }; }
  };
  /** What an audit asks of a board: does it carry the grid it claims to have been built on? */
  NL.guideCount = function (board) {
    let g = 0, r = 0;
    try { g = Array.from(board.guides || []).filter((x) => x && x.display !== false).length; } catch (e) {}
    try { r = Array.from(board.rulerGuides || []).length; } catch (e) {}
    return { guides: g, ruler: r };
  };

  // ---------- in-file provenance (C10) ----------
  /** Stamp what produced a board, so audits are re-runnable by anyone who opens the file. */
  NL.stamp = function (shape, data) {
    const out = {};
    Object.keys(data || {}).forEach((k) => {
      try { shape.setPluginData('nl:' + k, String(data[k])); out[k] = String(data[k]); }
      catch (e) { out[k] = 'ERR ' + String(e).slice(0, 60); }
    });
    return out;
  };
  NL.readStamp = function (shape) {
    const out = {};
    try { Array.from(shape.getPluginDataKeys ? shape.getPluginDataKeys() : []).forEach((k) => { if (k.indexOf('nl:') === 0) out[k.slice(3)] = shape.getPluginData(k); }); } catch (e) { out.err = String(e).slice(0, 80); }
    return out;
  };

  // ---------- verification ----------
  /** Settled geometry of a flow subtree. Read-only; this is the "did the engine actually lay it out" evidence. */
  NL.report = function (board, depth) {
    const max = depth === undefined ? 3 : depth;
    const dump = (s, d) => {
      const lc = s.layoutChild || null;
      const o = { name: s.name, type: s.type, x: N(s.x), y: N(s.y), px: N(s.parentX), py: N(s.parentY),
                  w: N(s.width), h: N(s.height),
                  sizing: lc ? (lc.horizontalSizing + '/' + lc.verticalSizing + (lc.absolute ? ' abs' : '')) : null,
                  z: lc ? lc.zIndex : null };
      if (s.flex) o.flex = { dir: s.flex.dir, rowGap: s.flex.rowGap, columnGap: s.flex.columnGap,
                             pad: [s.flex.topPadding, s.flex.rightPadding, s.flex.bottomPadding, s.flex.leftPadding],
                             align: s.flex.alignItems, justify: s.flex.justifyContent,
                             own: s.horizontalSizing + '/' + s.verticalSizing };
      if (s.grid) o.grid = { cols: s.grid.columns ? Array.from(s.grid.columns).map((c) => c.type + ':' + c.value) : null };
      if (d < max && s.children) o.kids = Array.from(s.children).map((c) => dump(c, d + 1));
      return o;
    };
    return dump(board, 0);
  };

  /**
   * The "not laid out yet" fingerprint (R3, measured): until the engine runs, a flow child still sits at doc (0,0) —
   * `parentX/parentY` read as −board.x/−board.y, widths un-stretched. A settled flow child is always at ≥ padding
   * (pad 0 boards are exempt, since 0,0 is then a legitimate position). `NL.whenSettled` polls this; `auditFlow`
   * reports it as `not_settled` instead of emitting a cascade of padding/fill/gap findings about a tree that simply
   * has not been measured late enough.
   */
  NL.unlaid = function (b) {
    const fx = b.flex || null;
    if (!fx) return null;
    const pad = N(fx.leftPadding) > 0 || N(fx.topPadding) > 0;
    if (!pad) return null;
    const kid = Array.from(b.children || []).find((c) => c.layoutChild && !c.layoutChild.absolute
      && N(c.x) === 0 && N(c.y) === 0);
    return kid || null;
  };
  /** Poll until the layout engine has actually positioned the subtree. Replaces the guess-the-sleep-ms habit. */
  NL.whenSettled = async function (board, o) {
    o = o || {};
    const tries = o.tries || 10, step = o.step || 400;
    const pending = (b, d) => {
      if (d > 6) return [];
      const l = NL.unlaid(b) ? [b.name] : [];
      Array.from(b.children || []).forEach((c) => { if (c.children && c.children.length) l.push.apply(l, pending(c, d + 1)); });
      return l;
    };
    for (let i = 0; i < tries; i++) {
      await sleep(step);
      const bad = pending(board, 0);
      if (!bad.length) return { settled: true, waited: step * (i + 1) };
      if (i === tries - 1) return { settled: false, waited: step * tries, boards: bad };
    }
    return { settled: false, waited: 0 };
  };

  /**
   * NL.auditFlow(board, depth, o) — read-only check that a subtree is really flow-authored and settled.
   * `o.strict` (default false) also reports boards the engine parked **absolute on purpose** — the LY region skeleton
   * (G11) is an absolute 2-D plan with flow interiors, so absolute region boards are expected and still descended into.
   * Signatures (each one maps to a measured failure mode):
   *   not_settled         the subtree has not been laid out at read time → settle and re-run, do not "repair" anything
   *   no_layoutChild      a child of a **flow-declared** parent carries no layoutChild → R2 (the parent lost its flex,
   *                       or the child was appended before the flex existed). Not reported for groups, component copies
   *                       or flex-less drawing boards: their children have no layoutChild *by nature* (an SVG import
   *                       inside a row reported 3 of them before this rule)
   *   absolute_child      a child pinned inside a flow board **and the engine did not declare it**. Skipped when every
   *                       content sibling is absolute: that is a drawing host, which is what CF control interiors (§9)
   *                       and an LY region plan (a 2-D arrangement of pinned controls) both are. `fold·` annotation
   *                       children are exempt, exactly as in the other two auditors' ANNO rule.
   *   no_flow_children    an engine-declared flow board whose content children are all absolute → either the region is
   *                       a drawing host (skipped) or a flow board lost its flow children (reported).
   *   sizing_dropped      declared sizing != readback → R5 (a resize() after the declaration) or R6 hug-vs-fill
   *                       normalization; both are silent, so this engine is the only thing that catches them
   *   padding_ignored     a start-aligned flow board's first child is not at the padding edge → padding written under
   *                       the wrong name (measured: center/end alignment parks the child elsewhere legitimately)
   *   size_stale          a `fix` axis no longer measures what it was declared as → read before settle (R3)
   *   fill_not_stretched  sizing 'fill' but the box != the expectation for **that axis** (see the fill note below)
   *   fill_in_hug_parent  main-axis `fill` inside a hug parent → the platform computes 0 (capabilities §1), a design bug
   *   main_axis_overflow  the fixed flow children already exceed the content box → the fill child computes 0 and the
   *                       board overflows (measured: content 52, one 80 sibling, gap 16 → free −44 → h 0)
   *   fixed_overflow      a `fix`-axis flow with no fill child whose children already exceed the content box → the last
   *                       child is drawn past the host (measured: 99 of content in a 96 cell)
   *   hug_frozen          a hug frame that does NOT equal pad + Σchildren + gaps → the layout pass never re-ran after a
   *                       child grew, so the content overflows the frame on canvas (measured: `row·head` h=6 over texts
   *                       of 44 + 4 + 20, caught only by the PNG export until this signature existed). Repair: FN.relayout
   *   flex_rejected       NL.frame recorded rejected flex/pad keys at build time
   *
   * The fill expectation is axis-aware, because `fill` is not one number (both measured in the connected build):
   *   cross axis  → the parent's **content box** (400-wide fix parent, pad 24 → child 352)
   *   main axis   → the **free space left by the non-filling flow siblings**, split evenly between filling kids
   *                 (row, content 552, gap 16, one 160 sibling → the fill child is 376, *not* 552)
   * Skipped when the parent hugs on the axis being checked (the expectation would be circular) or when the row wraps.
   * That exemption covers `fill` only — `hug_frozen` above is the non-circular expectation for a hugging frame.
   */
  NL.auditFlow = function (board, depth, o) {
    o = o || {};
    const max = depth === undefined ? 99 : depth;
    const findings = [];
    const push = (sig, where, why) => findings.push({ sig: sig, where: where, why: why });
    const startish = (v) => !v || v === 'start' || v === 'flex-start' || v === 'stretch';
    const walk = (b, d) => {
      if (d > max) return;
      const meta = NL._meta(b) || {};
      if (meta.rejected && Object.keys(meta.rejected).length) Object.keys(meta.rejected).forEach((k) => push('flex_rejected', b.name, k + ' → ' + meta.rejected[k]));
      if (meta.gridErr && meta.gridErr.length) meta.gridErr.forEach((m) => push('flex_rejected', b.name, 'grid → ' + m));
      const kids = Array.from(b.children || []);
      const fx = b.flex || null;
      const isGroup = b.type === 'group';
      const isCopy = typeof b.isComponentInstance === 'function' ? b.isComponentInstance() : false;
      // ---- containers that are NOT flow hosts, by design:
      //   group            an SVG import or penpot.group assembly: coordinates, not layout (measured: 3 children,
      //                    none of them had a layoutChild, and asserting flow on them is pure noise)
      //   component copy   a mirror of a master that is audited at its own site
      //   board without flex  the page root, a drawing board, a CF control host before flex: flow was never declared
      // The only flex-less board this engine will still judge is one **it** declared (`kind:'frame'`/`reflowed`) —
      // there the missing layoutChild means the board lost its flex, which is the R2 failure the signature is for.
      const engineFlow = !!fx || !!b.grid || meta.kind === 'frame' || meta.kind === 'grid' || !!meta.reflowed;
      if (isGroup || isCopy || !engineFlow) {
        // flex-less, grid-less, non-engine boards (page root, drawing boards) are walked through: flow was never
        // declared there. An engine frame that lost its flex still goes down the main path and reports
        // `no_layoutChild` per child, which is the R2 signal this branch would otherwise have to duplicate.
        kids.forEach((c) => { if (c.children && c.children.length) walk(c, d + 1); });
        return;
      }
      // A board whose children are ALL absolute is a drawing host: CF control interiors are absolute by design
      // (native-layout §9), and so is an LY region plan, whose whole point is a 2-D arrangement of pinned controls
      // inside a board that still carries flex metadata for sizing. The old `!meta.kind` exemption knew only the
      // first case, so every region whose controls were all pinned (region·table with 4 TableHeader copies, region·facets
      // with 10 checkboxes, region·sidebar with its Menu, …) reported `absolute_child` on every CF mount — 26 screens
      // were never auditable as CLEAN even though nothing was flowing in those regions. A board that really flows has
      // at least one non-absolute child, which makes this test false and keeps the signature alive for that case.
      // `fold·` is not content: it is the viewport annotation LY.fold overlays on a screen, exempt in both other
      // auditors (audit_layout/audit_design ANNO) and exempt here for the same reason.
      const contentKids = kids.filter((c) => !/^fold·/.test(c.name || ''));
      const drawingHost = contentKids.length > 0
        && contentKids.every((c) => c.layoutChild && c.layoutChild.absolute);
      const padL = fx ? fx.leftPadding : 0, padT = fx ? fx.topPadding : 0;
      const gap = fx ? fx.rowGap : 0;
      const isCol = !fx || fx.dir !== 'row';
      const wrapping = fx && fx.wrap && fx.wrap !== 'nowrap';
      const xStart = fx ? startish(isCol ? fx.alignItems : fx.justifyContent) : false;
      const yStart = fx ? startish(isCol ? fx.justifyContent : fx.alignItems) : false;
      const contentW = fx ? N(b.width) - N(fx.leftPadding) - N(fx.rightPadding) : N(b.width);
      const contentH = fx ? N(b.height) - N(fx.topPadding) - N(fx.bottomPadding) : N(b.height);
      const ownH = b.horizontalSizing, ownV = b.verticalSizing;
      // main-axis fill budget: absolute kids take no space, so they are excluded from the sibling sum.
      const flowKids = contentKids.filter((c) => c.layoutChild && !c.layoutChild.absolute);
      const gapMain = fx ? (isCol ? fx.rowGap : fx.columnGap) : 0;
      const fillers = flowKids.filter((c) => (isCol ? c.layoutChild.verticalSizing : c.layoutChild.horizontalSizing) === 'fill');
      const mainUsed = flowKids.filter((c) => fillers.indexOf(c) < 0)
        .reduce((a, c) => a + (isCol ? N(c.height) : N(c.width)), 0);
      const mainFree = (isCol ? contentH : contentW) - mainUsed - gapMain * Math.max(0, flowKids.length - 1);
      const perFill = fillers.length ? Math.round(mainFree / fillers.length) : 0;
      const mainOwn = isCol ? ownV : ownH;
      const crossOwn = isCol ? ownH : ownV;
      // the engine has not positioned this board's children yet → say so once, and skip the geometry expectations
      const stale = NL.unlaid(b);
      if (stale) push('not_settled', b.name, 'flow child “' + stale.name + '” still sits at doc 0,0 → NL.whenSettled() before trusting any geometry finding here');
      // A FIXED-axis flow with no fill child still has a budget, and nothing used to check it: when the fixed children
      // plus their gaps exceed the content box the last child is drawn past the host, and the only signal was
      // audit_layout reporting `out_of_bounds` two pixels lower down (measured 2026-10-20, Palette: swatch 48 + label 19
      // + axis 16 + 2×8 gaps = 99 inside a 96 cell ×40 times). This is the tall-element class the shelf cannot see.
      if (!stale && fx && !b.grid && !wrapping && !fillers.length && flowKids.length && mainOwn !== 'auto' && mainFree < -1) {
        push('fixed_overflow', b.name, (isCol ? 'h' : 'w') + ' content ' + (isCol ? contentH : contentW) + ' < ' + mainUsed +
          ' of children + gap ' + gapMain + '×' + Math.max(0, flowKids.length - 1) + ' (free=' + mainFree +
          ') → grow the host (FX.fitBoardHeight) / wrap the row / drop a child; a 13px label is 19 tall at leading 1.4, not 15');
      }
      // The mirror of `fixed_overflow`, and the check this engine was missing: a HUG frame must equal
      // pad + Σ children + gaps on its main axis. Measured 2026-10-21 on the FN probe — `row·head` rendered 6 tall over
      // two texts of 44 and 20 (the PNG export shows the caption printed on top of the title) and `auditFlow` reported
      // CLEAN, because every axis expectation it holds is skipped for a hug parent as "circular". It is only circular
      // when the children are stale too; once they are laid out the sum is a fact. A miss means the layout engine never
      // re-ran this frame after a child grew (the font application during token binding does exactly that).
      // Repair: write any flex property on the frame, bottom-up (storage.FN.relayout).
      if (!stale && fx && !b.grid && !wrapping && !fillers.length && flowKids.length && mainOwn === 'auto') {
        const padMain = isCol ? N(fx.topPadding) + N(fx.bottomPadding) : N(fx.leftPadding) + N(fx.rightPadding);
        const wantHug = mainUsed + gapMain * Math.max(0, flowKids.length - 1) + padMain;
        const gotHug = isCol ? N(b.height) : N(b.width);
        if (Math.abs(gotHug - wantHug) > 2) {
          push('hug_frozen', b.name, (isCol ? 'h=' : 'w=') + gotHug + ' but ' + wantHug + ' = ' + mainUsed + ' of ' +
            flowKids.length + ' child(ren) + gap ' + gapMain + '×' + Math.max(0, flowKids.length - 1) + ' + padding ' + padMain +
            ' → the layout pass never re-ran after a child grew; the content overflows this frame on canvas. Repair: FN.relayout(board)');
        }
      }
      // the board's OWN hug can be silently normalized by a main-axis fill child (R6)
      if (fx && meta.declaredSizing) {
        const own = [];
        if (meta.declaredSizing.h && ownH !== meta.declaredSizing.h) own.push('h ' + meta.declaredSizing.h + '→' + ownH);
        if (meta.declaredSizing.v && ownV !== meta.declaredSizing.v) own.push('v ' + meta.declaredSizing.v + '→' + ownV);
        if (own.length) push('sizing_dropped', b.name, own.join(', ') + ' → the board no longer behaves as NL.frame declared it (R6: a main-axis fill child normalizes a hug parent back to fix)');
      }
      let flow = 0, prev = null, declAbs = 0;
      contentKids.forEach((c) => {
        const lc = c.layoutChild;
        if (!lc) { push('no_layoutChild', b.name + ' › ' + c.name, 'parent has no flex/grid (R2)'); return; }
        const cm = NL._meta(c) || {};
        if (lc.absolute) {
          // Derived layers (an elevation surface, its sheen, a media crop mask) are BY CONSTRUCTION absolute:
          // they must not consume a flow slot. The note registry is session-memory, so the name is the durable
          // declaration — same contract as `CF.keepClip` for `clip·` (measured 2026-10-23: 11 surface plates +
          // 3 media masks were reported as undeclared on `15 · Screens`).
          const derived = /^(surface·|sheen·|clip·)/.test(String(c.name || ''));
          if (!derived && !drawingHost && (o.strict || !cm.declaredAbsolute)) push('absolute_child', b.name + ' › ' + c.name, 'pinned inside a flow board');
          else declAbs++;
          if (c.children && c.children.length) walk(c, d + 1);
          return;
        }
        flow++;
        if (!stale && flow === 1) {
          if (xStart && !(lc.alignSelf && lc.alignSelf !== 'auto') && N(c.parentX) !== N(padL)) push('padding_ignored', b.name, 'first child px=' + N(c.parentX) + ' but leftPadding=' + N(padL) + ' (alignItems ' + (fx ? fx.alignItems : '-') + ')');
          if (yStart && N(c.parentY) !== N(padT)) push('padding_ignored', b.name, 'first child py=' + N(c.parentY) + ' but topPadding=' + N(padT) + ' (justifyContent ' + (fx ? fx.justifyContent : '-') + ')');
        }
        if (prev && !stale && fx && isCol && !wrapping) {
          const want = prev.y + prev.h + gap;
          if (Math.abs(c.parentY - want) > 1) push('stale_or_manual_gap', b.name + ' › ' + c.name, 'py=' + N(c.parentY) + ' expected ' + want + ' (rowGap ' + gap + ')');
        }
        if (fx) {
          const hFill = lc.horizontalSizing === 'fill', vFill = lc.verticalSizing === 'fill';
          const selfCross = lc.alignSelf && lc.alignSelf !== 'auto' && lc.alignSelf !== 'stretch';
          if (!stale && (isCol ? hFill : vFill) && !selfCross && crossOwn !== 'auto' && !wrapping) {
            const want = isCol ? contentW : contentH, got = isCol ? N(c.width) : N(c.height);
            if (Math.abs(got - want) > 1) push('fill_not_stretched', b.name + ' › ' + c.name, (isCol ? 'w' : 'h') + '=' + got + ' cross-axis content=' + want);
          }
          if (isCol ? vFill : hFill) {
            if (mainOwn === 'auto') push('fill_in_hug_parent', b.name + ' › ' + c.name, 'main-axis fill inside a hug (' + mainOwn + ') board → the platform computes 0; give the parent a fixed axis or the child a fix/auto size');
            else if (!stale && mainFree < 0) push('main_axis_overflow', b.name + ' › ' + c.name, 'the fixed flow children already exceed the content box (free=' + mainFree + ': content ' + (isCol ? contentH : contentW) + ' − ' + mainUsed + ' of ' + (flowKids.length - fillers.length) + ' sibling(s) − gap ' + gapMain + '×' + Math.max(0, flowKids.length - 1) + ') → this fill child computes 0 and the board overflows');
            else if (!stale && !wrapping) {
              const got = isCol ? N(c.height) : N(c.width);
              if (Math.abs(got - perFill) > 1) push('fill_not_stretched', b.name + ' › ' + c.name, (isCol ? 'h=' : 'w=') + got + ' main-axis free=' + perFill + ' (content ' + (isCol ? contentH : contentW) + ' − ' + mainUsed + ' of ' + (flowKids.length - fillers.length) + ' sibling(s) − gap ' + gapMain + '×' + Math.max(0, flowKids.length - 1) + ', ' + fillers.length + ' filling)');
            }
          }
        }
        // R5: a resize() after declaring sizing, or a main-axis fill inside a hug parent, silently downgrades the
        // value we wrote. The readback is the truth, so compare it against what this engine was asked to declare.
        if (cm.declaredSizing) {
          const sd = [];
          if (cm.declaredSizing.h && lc.horizontalSizing !== cm.declaredSizing.h) sd.push('h ' + cm.declaredSizing.h + '→' + lc.horizontalSizing);
          if (cm.declaredSizing.v && lc.verticalSizing !== cm.declaredSizing.v) sd.push('v ' + cm.declaredSizing.v + '→' + lc.verticalSizing);
          if (sd.length) push('sizing_dropped', b.name + ' › ' + c.name, sd.join(', ') + ' → resize() downgrades a flow child to fix (R5), or a fill child normalized a hug parent; re-declare the sizing after the last resize');
        }
        if (!stale && cm.declared) {
          const bad = [];
          // a rect child has no *own* sizing accessor (reads undefined) — layoutChild is the flow truth, own sizing the fallback.
          const hs = lc.horizontalSizing || c.horizontalSizing;
          const vs = lc.verticalSizing || c.verticalSizing;
          if (hs === 'fix' && N(c.width) !== cm.declared.w) bad.push('w ' + cm.declared.w + '→' + N(c.width));
          if (vs === 'fix' && N(c.height) !== cm.declared.h) bad.push('h ' + cm.declared.h + '→' + N(c.height));
          if (bad.length) push('size_stale', c.name, bad.join(', ') + ' → read before settle (R3), or the engine resized it');
        }
        prev = { y: N(c.parentY), h: N(c.height) };
        if (c.children && c.children.length) walk(c, d + 1);
      });
      if (!flow && contentKids.length && !declAbs && !drawingHost) push('no_flow_children', b.name, contentKids.length + ' children, none in flow');
    };
    walk(board, 0);
    return { board: board.name, findings: findings, verdict: findings.length ? 'NEEDS_REPAIR' : 'CLEAN' };
  };

  /** Remember the declared size of a board so auditFlow can catch a stale read (R3). */
  NL.declare = function (board, w, h) { try { board.resize(w, h); } catch (e) {} NL._note(board, { declared: { w: N(w), h: N(h) } }); return board; };

  /**
   * R5 repair: `resize()` downgraded a flow child's sizing to `fix`. Re-declare the sizing, then nudge the parent so
   * the layout engine recomputes the row.
   * Two measured caveats, both of which this function handles:
   *   1. the parent `resize()` downgrades **the parent's own** sizing exactly like a child resize (that is how the
   *      first version of this helper broke the tree it was repairing) → restore it from the parent's note;
   *   2. the recompute lands on a **later** layout pass, not inside this call: measured `120/fix` → re-declared →
   *      still `120/fill` after 700ms, and `377/fill` in the next execute_code call. Re-audit next call.
   */
  NL.nudge = async function (child, h, v) {
    const p = child.parent;
    if (!p) return { err: 'child has no parent' };
    const pm = NL._meta(p) || {};
    const declared = NL.sizing(child, h || 'fill', v);
    const w = N(p.width), hh = N(p.height);
    try { p.resize(w + 1, hh); } catch (e) {}
    await sleep(150);
    try { p.resize(w, hh); } catch (e) {}
    let restored = null;
    if (pm.declaredSizing) {
      if (p.layoutChild) restored = NL.sizing(p, pm.declaredSizing.h, pm.declaredSizing.v);
      else { try { p.horizontalSizing = pm.declaredSizing.h; p.verticalSizing = pm.declaredSizing.v; restored = { h: p.horizontalSizing, v: p.verticalSizing }; } catch (e) { restored = { err: String(e).slice(0, 60) }; } }
    }
    await sleep(NL.settleMs || 600);
    const lc = child.layoutChild || {};
    return { declared: declared, parentSizingRestored: restored,
             sizing: [lc.horizontalSizing, lc.verticalSizing], w: N(child.width), h: N(child.height),
             note: 'sizing readback is immediate, geometry is not — re-run NL.auditFlow in a later call' };
  };

  /**
   * Migration lever (capabilities §9): penpotUtils.addFlexLayout re-orders existing absolute children into flow.
   * Destructive to the authored order — snapshot NL.report() first, and never run it on a spec board.
   */
  NL.reflow = function (board, o) {
    o = o || {};
    const before = NL.report(board, 1);
    const res = { before: before, released: [], kept: [], err: null };
    try { penpotUtils.addFlexLayout(board, o.dir || (board.flex && board.flex.dir) || 'column'); }
    catch (e) { res.err = String(e).slice(0, 140); }
    const spec = { dir: o.dir || 'column' };
    if (o.breath && storage.LY && storage.LY.breath) {
      const bg = storage.LY.breath(o.breath === true ? 'block' : o.breath,
                                  o.tier || (storage.CF && storage.CF.tier) || 'web');
      spec.rowGap = bg; spec.columnGap = bg;
    }
    if (o.gap !== undefined) { spec.rowGap = o.gap; spec.columnGap = o.gap; }
    if (o.pad !== undefined) spec.pad = o.pad;
    if (o.align) spec.alignItems = o.align;
    if (o.justify) spec.justifyContent = o.justify;
    const flex = NL.applyFlex(board, spec);
    Array.from(board.children || []).forEach((c) => {
      if (!c.layoutChild) { res.kept.push(c.name + ' (no layoutChild)'); return; }
      if (!c.layoutChild.absolute) return;
      try { c.layoutChild.absolute = false; res.released.push(c.name); }
      catch (e) { res.kept.push(c.name + ' → ' + String(e).slice(0, 50)); }
    });
    NL._note(board, { reflowed: true, rejected: flex.rejected });
    res.rejected = flex.rejected;
    res.note = 'addFlexLayout alone leaves children absolute; they were released here. NL.settle() before judging, and re-declare sizing where the hand-placed size mattered.';
    return res;
  };

  // ---------- recipe → flow (the screen skeleton) ----------
  /**
   * NL.fromRecipe(key, o) → the screen *skeleton*: every LY region becomes a board whose **inside** is flow.
   * `o` = { tier, w, h, x0, y0, parent, fill, gap, regionPad, radius }.
   * The split is deliberate (G11 stays intact either way):
   *   outer structure  = LY geometry, mounted **absolute** — a 2-D region plan (nav rail + header + content) is not a
   *                      single flex axis, and hand-derived coordinates are what makes it reproducible;
   *   region interior  = native flex — padding/gap/sizing live in the layout panel, so a designer editing copy or
   *                      dropping a control in does not break the rhythm.
   * LY.rect() (not p.regions[]) so the recipe's x0/y0 offset is applied.
   * Returns the region boards keyed by name so the caller can fill them with CF controls / instances.
   */
  NL.fromRecipe = function (key, o) {
    if (!storage.LY) return { err: 'seed layout_engine.js first' };
    const LY = storage.LY;
    o = o || {};
    const plan = LY.recipe(key, { tier: o.tier, w: o.w, h: o.h, x0: o.x0, y0: o.y0 });
    if (plan && plan.err) return plan;
    // Two plan shapes exist (measured): app recipes carry `regions` (world boxes, resolved through LY.rect which adds
    // the recipe x0/y0 offset); document/band recipes — landing, blogArticle, pricing… — carry `bands`, which are
    // **frame-relative** and must be offset by LY._ofs here. Reading only `regions` made NL.fromRecipe return an EMPTY
    // skeleton with `err:null` for every band recipe — a silent no-op, exactly what an engine must never do.
    const boxes = {};
    if (plan.regions && Object.keys(plan.regions).length) {
      Object.keys(plan.regions).forEach((n) => { const r = LY.rect(n); if (r && r.w && r.h) boxes[n] = { rect: r, kind: 'region' }; });
    } else if (plan.bands && Object.keys(plan.bands).length) {
      const ofs = LY._ofs || { x: 0, y: 0 };
      Object.keys(plan.bands).forEach((n) => {
        const b = plan.bands[n];
        if (!b || !b.w || !b.h) return;
        boxes[n] = { rect: { x: (b.x || 0) + ofs.x, y: (b.y || 0) + ofs.y, w: b.w, h: b.h }, kind: 'band' };
      });
    }
    const names = Object.keys(boxes);
    if (!names.length) return { err: 'recipe ' + key + ' produced neither regions nor bands — plan keys: ' + Object.keys(plan).join(',') };
    const out = {};
    names.forEach((name) => {
      const r = boxes[name].rect;
      // A region's gap comes from the breath ladder unless the caller names a level or a number: 16 was already the
      // measured rhythm of this file, so the ladder is what the default always was — now it is declared, not typed.
      const tier = plan.tier || o.tier || 'web';
      const bg = o.gap !== undefined ? o.gap
        : (LY.breath ? LY.breath(o.breath === undefined ? 'block' : o.breath, tier) : 16);
      const b = NL.frame('region·' + name, { x: r.x, y: r.y, w: r.w, h: r.h, fill: o.fill || null, radius: o.radius || 'none',
        dir: 'column', gap: bg, pad: o.regionPad === undefined ? (LY.breath ? LY.breath('group', tier) : 24) : o.regionPad,
        sizing: 'fix', parent: o.parent, absolute: o.parent ? { x: r.x, y: r.y } : null });
      NL.stamp(b, { recipe: key, region: name, kind: boxes[name].kind, tier: plan.tier || o.tier || 'web' });
      out[name] = b;
    });
    // Pane vs band, decided from the boards that now exist (not from the recipe's plan object): a region whose box
    // contains another region is a **pane** — a column, a document body, a scroll area. Filling it is the measured
    // `dashboard.content` defect: the paragraph runs underneath every child band. A recipe may ship flat sibling
    // regions (docsLayout content/body, checkout form/contact/shipping/payment, authSplit formPane/form), so the check
    // is geometric, not hierarchical — and it is computed here because a consumer holding an older `storage.LY`
    // reference (`p.LY`) would silently miss a newly added helper and skip every pane (measured: 65 cross-parent
    // text collisions on pages 14/15 after the LY.leaves guard was added).
    const geo = {};
    names.forEach((n) => { const b = out[n]; geo[n] = { x: N(b.x), y: N(b.y), w: N(b.width), h: N(b.height) }; });
    const inside = (a, b) => b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 &&
      b.y + b.h <= a.y + a.h + 1 && (b.w * b.h) < (a.w * a.h);
    const contains = {};
    names.forEach((a) => { contains[a] = names.filter((b) => b !== a && inside(geo[a], geo[b])); });
    const panes = names.filter((n) => contains[n].length > 0);
    const leaves = names.filter((n) => contains[n].length === 0);
    return { recipe: key, tier: plan.tier, frame: plan.frame, notes: plan.notes, regions: out, keys: names,
             panes, leaves, contains,
             bands: names.length && boxes[names[0]].kind === 'band' ? out : undefined, totalH: plan.totalH };
  };

  return { seeded: 'NL', version: NL.VERSION,
    fns: ['settle', 'settleDeep', 'whenSettled', 'unlaid', 'applyFlex', 'sizing', 'fill', 'fix', 'hug', 'alignSelf',
          'zIndex', 'margin', 'frame', 'row', 'col', 'mount', 'add', 'gridFrame', 'cell', 'cellAuto', 'label', 'plate',
          'line', 'guide', 'rulerGuide', 'guideCount', 'stamp', 'readStamp', 'report', 'auditFlow', 'declare', 'nudge', 'reflow', 'fromRecipe'],
    regCarried: Object.keys(NL._reg).length,
    flexKeys: NL.FLEX_KEYS,
    note: 'R1 pad names topPadding|… (pad:{top,x,t} accepted, unknown keys rejected) ; R2 layoutChild after append + sizing last ; R3 settle before measuring → NL.whenSettled() polls, auditFlow reports not_settled instead of a cascade ; R4 grid cells are 1-based ; R5 resize() downgrades a flow child to fix → declare after the last resize, repair with NL.nudge ; R6 fill = content box on the cross axis, leftover space on the main axis, and it silently un-hugs its parent ; R7 an undeclared gap is 0, i.e. blocks touch — author the separation: frame({breath:"block"}) takes it from LY.BREATH at the board tier (designGate 32/33 judge the same table)' };
})();
