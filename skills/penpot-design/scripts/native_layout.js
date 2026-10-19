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
  const NL = {};
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
  NL._reg = {};
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
   * o: { x,y,w,h, fill, radius, dir:'row'|'column', gap | rowGap/columnGap, pad (see _padSpec),
   *      align, justify, wrap, sizing:'fix'|'auto' | {h,v}, clip, guides:{cols,margin,gutter},
   *      strokes, shadow, parent, absolute (mount as absolute inside a flow parent), name }
   * `sizing:'auto'` hugs; measured: a column of 3×52 + 2×16 + 2×24 padding grew 188 → 236 when padding was applied.
   */
  NL.frame = function (name, o) {
    o = o || {};
    const b = penpot.createBoard();
    b.name = name;
    b.x = o.x || 0; b.y = o.y || 0;
    try { b.resize(o.w || 100, o.h || 100); } catch (e) {}
    if (o.fill) b.fills = [{ fillColor: o.fill, fillOpacity: o.fillOpacity === undefined ? 1 : o.fillOpacity }];
    else b.fills = [];
    if (o.radius) b.borderRadius = o.radius;
    if (o.strokes) b.strokes = o.strokes;
    if (o.shadow && storage.CF && storage.CF.shadow) { try { b.shadows = storage.CF.shadow(o.shadow); } catch (e) {} }
    b.addFlexLayout();
    const spec = { dir: o.dir || 'column' };
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
    if (o.clip !== undefined) { try { b.clipContent = !!o.clip; } catch (e) {} }
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
    if (o.fill) b.fills = [{ fillColor: o.fill, fillOpacity: 1 }]; else b.fills = [];
    if (o.radius) b.borderRadius = o.radius;
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
    if (o.radius && r.borderRadius !== undefined) r.borderRadius = o.radius;
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
  /** capabilities §4: measured round-trip. This is how the tier column grid should exist on a screen board. */
  NL.guide = function (board, spec) {
    const cols = spec.cols || 12, margin = spec.margin === undefined ? 32 : spec.margin, gutter = spec.gutter === undefined ? 24 : spec.gutter;
    const g = { type: 'column', display: spec.display === false ? false : true,
      params: { color: { color: spec.color || '#8b5cf6', opacity: spec.opacity === undefined ? 0.5 : spec.opacity },
                type: spec.fillType || 'stretch', margin: margin, gutter: gutter, count: spec.count } };
    try { board.guides = (Array.from(board.guides || [])).concat([g]); return { guides: Array.from(board.guides).length, margin: board.guides[0].params.margin }; }
    catch (e) { return { err: String(e).slice(0, 120) }; }
  };
  NL.rulerGuide = function (host, position, direction, color) {
    try { const g = host.addRulerGuide({ position: position, direction: direction || 'vertical', color: color || '#2563EB' }); return { ok: true, id: g && g.id }; }
    catch (e) { return { err: String(e).slice(0, 120) }; }
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
   *                       sibling is absolute: that is a drawing host, which is what CF control interiors are (§9)
   *   sizing_dropped      declared sizing != readback → R5 (a resize() after the declaration) or R6 hug-vs-fill
   *                       normalization; both are silent, so this engine is the only thing that catches them
   *   padding_ignored     a start-aligned flow board's first child is not at the padding edge → padding written under
   *                       the wrong name (measured: center/end alignment parks the child elsewhere legitimately)
   *   size_stale          a `fix` axis no longer measures what it was declared as → read before settle (R3)
   *   fill_not_stretched  sizing 'fill' but the box != the expectation for **that axis** (see the fill note below)
   *   fill_in_hug_parent  main-axis `fill` inside a hug parent → the platform computes 0 (capabilities §1), a design bug
   *   main_axis_overflow  the fixed flow children already exceed the content box → the fill child computes 0 and the
   *                       board overflows (measured: content 52, one 80 sibling, gap 16 → free −44 → h 0)
   *   flex_rejected       NL.frame recorded rejected flex/pad keys at build time
   *
   * The fill expectation is axis-aware, because `fill` is not one number (both measured in the connected build):
   *   cross axis  → the parent's **content box** (400-wide fix parent, pad 24 → child 352)
   *   main axis   → the **free space left by the non-filling flow siblings**, split evenly between filling kids
   *                 (row, content 552, gap 16, one 160 sibling → the fill child is 376, *not* 552)
   * Skipped when the parent hugs on the axis being checked (the expectation would be circular) or when the row wraps.
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
      // a board whose children are ALL absolute is a drawing host (CF control interiors are absolute by design —
      // native-layout §9), unless this engine explicitly declared it as a flow region.
      const drawingHost = !meta.kind && !meta.reflowed && kids.length > 0
        && kids.every((c) => c.layoutChild && c.layoutChild.absolute);
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
      const flowKids = kids.filter((c) => c.layoutChild && !c.layoutChild.absolute);
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
      // the board's OWN hug can be silently normalized by a main-axis fill child (R6)
      if (fx && meta.declaredSizing) {
        const own = [];
        if (meta.declaredSizing.h && ownH !== meta.declaredSizing.h) own.push('h ' + meta.declaredSizing.h + '→' + ownH);
        if (meta.declaredSizing.v && ownV !== meta.declaredSizing.v) own.push('v ' + meta.declaredSizing.v + '→' + ownV);
        if (own.length) push('sizing_dropped', b.name, own.join(', ') + ' → the board no longer behaves as NL.frame declared it (R6: a main-axis fill child normalizes a hug parent back to fix)');
      }
      let flow = 0, prev = null, declAbs = 0;
      kids.forEach((c) => {
        const lc = c.layoutChild;
        if (!lc) { push('no_layoutChild', b.name + ' › ' + c.name, 'parent has no flex/grid (R2)'); return; }
        const cm = NL._meta(c) || {};
        if (lc.absolute) {
          if (!drawingHost && (o.strict || !cm.declaredAbsolute)) push('absolute_child', b.name + ' › ' + c.name, 'pinned inside a flow board');
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
      if (!flow && kids.length && !declAbs) push('no_flow_children', b.name, kids.length + ' children, none in flow');
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
      const b = NL.frame('region·' + name, { x: r.x, y: r.y, w: r.w, h: r.h, fill: o.fill || null, radius: o.radius || 0,
        dir: 'column', gap: o.gap === undefined ? 16 : o.gap, pad: o.regionPad === undefined ? 24 : o.regionPad,
        sizing: 'fix', parent: o.parent, absolute: o.parent ? { x: r.x, y: r.y } : null });
      NL.stamp(b, { recipe: key, region: name, kind: boxes[name].kind, tier: plan.tier || o.tier || 'web' });
      out[name] = b;
    });
    return { recipe: key, tier: plan.tier, frame: plan.frame, notes: plan.notes, regions: out, keys: names,
             bands: names.length && boxes[names[0]].kind === 'band' ? out : undefined, totalH: plan.totalH };
  };

  return { seeded: 'NL', version: NL.VERSION,
    fns: ['settle', 'settleDeep', 'whenSettled', 'unlaid', 'applyFlex', 'sizing', 'fill', 'fix', 'hug', 'alignSelf',
          'zIndex', 'margin', 'frame', 'row', 'col', 'mount', 'add', 'gridFrame', 'cell', 'cellAuto', 'label', 'plate',
          'line', 'guide', 'rulerGuide', 'stamp', 'readStamp', 'report', 'auditFlow', 'declare', 'nudge', 'reflow', 'fromRecipe'],
    flexKeys: NL.FLEX_KEYS,
    note: 'R1 pad names topPadding|… (pad:{top,x,t} accepted, unknown keys rejected) ; R2 layoutChild after append + sizing last ; R3 settle before measuring → NL.whenSettled() polls, auditFlow reports not_settled instead of a cascade ; R4 grid cells are 1-based ; R5 resize() downgrades a flow child to fix → declare after the last resize, repair with NL.nudge ; R6 fill = content box on the cross axis, leftover space on the main axis, and it silently un-hugs its parent' };
})();
