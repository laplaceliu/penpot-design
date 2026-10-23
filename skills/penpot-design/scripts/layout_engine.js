// layout_engine.js — storage.LY: deterministic layout math + built-in screen recipes.
//
// WHY THIS FILE EXISTS: the skill's #1 amateur-output cause was coordinates invented inside execute_code per task.
// LY answers "where does this region go" with numbers taken from references/layout-library.md, so the agent
// never hand-writes a pane width again. **Pure math by default: it creates no shapes** — you feed the rects to
// storage.mkAbsBoard / storage.absMount (approach C) or to storage.CF.* factories (component_factory.js).
//
// Usage: run seed_storage.js first, then paste this whole file once per session.
//   const p = storage.LY.recipe('email3', { w: 1440, h: 900 });
//   storage.LY.rect('appBar')            // -> {x,y,w,h} in the coordinate space you passed (canvas space if x0/y0 given)
//   storage.mkAbsBoard('appBar', r.x, r.y, r.w, r.h, ...)
// Optional annotated-skeleton drawing (page 12 of the file contract): storage.LY.drawStart(...) then drawStep().
// HARD rule (gate G11): if a recipe is missing, ADD it here and document it in layout-library.md. Do not improvise.

return (function () {
  if (!storage.mkAbsBoard) return { err: 'run seed_storage.js first' };

  // ---------------------------------------------------------------- config
  var SPACE = [0, 2, 4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 128];   // design-guide §1
  var ROWS = [24, 32, 40, 48, 56, 64, 72, 88, 96, 120];            // quantized row/band heights
  var TIERS = {
    mobile: { w: 375, cols: 4, margin: 16, gutter: 12, touch: 44,
              chrome: { statusBar: 44, navBar: 44, tabbar: 49, safeBottom: 34 } },
    pad:    { w: 834, cols: 8, margin: 24, gutter: 16, touch: 44,
              chrome: { statusBar: 28, navBar: 56, tabbar: 0, safeBottom: 24 } },
    web:    { w: 1440, cols: 12, margin: 32, gutter: 24, touch: 32,
              chrome: { statusBar: 0, navBar: 64, tabbar: 0, safeBottom: 0 } }
  };
  var N = function (v) { return Math.round(v); };
  var LY = {};
  LY._warn = [];
  function warn(msg) { LY._warn.push(msg); }
  LY.warnings = function () { return LY._warn.slice(); };

  // A negative or NaN length is never a design decision: it silently becomes an inverted board on the canvas.
  // R() is the single choke point every rect in this file passes through, so the clamp lives here and the cause surfaces as a warning.
  var R = function (x, y, w, h) {
    if (!Number.isFinite(w) || w < 0) { warn('rect width ' + w + ' clamped to 0 — a pane/grid column does not fit this tier'); w = Math.max(0, w || 0); }
    if (!Number.isFinite(h) || h < 0) { warn('rect height ' + h + ' clamped to 0'); h = Math.max(0, h || 0); }
    return { x: N(x), y: N(y), w: N(w), h: N(h) };
  };
  var move = function (r, dx, dy) { return R(r.x + dx, r.y + dy, r.w, r.h); };
  /** Floor a *derived* length onto the 4px grid. Division (12 columns, N tiles, flex slack) produces fractions;
      design-guide §1 forbids them, and audit_design.js `off_grid` reports them — so the engine floors instead of
      emitting 442.67. The remainder becomes extra trailing margin, which is invisible; a rounded 443 is not. */
  var G = function (v) { return Math.floor(v / 4) * 4; };
  LY.G = G;

  LY.SPACE = SPACE; LY.ROWS = ROWS; LY.TIERS = TIERS;
  LY.R = R;

  // ---------------------------------------------------------------- the whitespace ladder (design-guide §2)
  /** 留白 is the FIRST separation device, so its amounts live in one table instead of in each caller's habit.
      Every number below is a `LY.SPACE` member — that is what makes this table and `off_scale_gap` unable to disagree,
      and why the tier columns compress only the tail (§1: "tiers compress the tail, never the head").
      `block` is the level the auditor judges: two block-level siblings closer than this are separated by nothing. */
  // The gap ladder for the four hierarchy levels §2 names. Levels are SPACE members, so a builder that takes its gap
  // from here cannot also trip `space_off_scale`. Measured 2026-10-21 on the live file: 121 of 125 flow containers
  // separate at 16, so an earlier draft that skipped 16 made the file's own rhythm "off-ladder" — the ladder describes
  // the rhythm, it does not invent a competing one. Tiers currently diverge only at the ceiling (`page`).
  var BREATH = {
    web:    { inline: 8,  row: 12, block: 16, group: 24, section: 32, band: 48, page: 96 },
    pad:    { inline: 8,  row: 12, block: 16, group: 24, section: 32, band: 48, page: 96 },
    mobile: { inline: 8,  row: 12, block: 16, group: 24, section: 32, band: 48, page: 64 }
  };
  LY.BREATH = BREATH;
  /** The declared gap for one hierarchy level at one tier. An unknown level falls to `block` (the most common
      omission), an unknown tier to `web`. Returned values are never off-scale. */
  LY.breath = function (level, tier) {
    var t = BREATH[tier] || BREATH.web;
    var v = t[level] !== undefined ? t[level] : t.block;
    if (!SPACE.some(function (s) { return Math.abs(s - v) <= 0.5; })) {
      // A hand-edited table entry must not become an off-scale finding: take the next scale step UP, so the repair of a
      // wrong number never costs whitespace.
      var up = SPACE.filter(function (s) { return s >= v; })[0];
      v = up === undefined ? SPACE[SPACE.length - 1] : up;
    }
    return v;
  };
  /** The level names the ladder defines — the auditor's adoption read uses this instead of a second list. */
  LY.breathLevels = function () { return Object.keys(BREATH.web); };

  // snap any length onto the 4px grid (HARD rule 1); hairlines and text boxes are exempt by caller choice
  LY.snap = function (v, unit) { unit = unit || 4; return N(Math.round(v / unit) * unit); };
  LY.onScale = function (v, tol) { tol = tol === undefined ? 0.6 : tol; return SPACE.some(function (s) { return Math.abs(s - v) <= tol; }); };
  LY.tier = function (name) { var t = TIERS[name] || TIERS.web; return t; };
  /** Which tier a width belongs to — lets LY.recipe() reject a web-only layout asked to render at 375. */
  LY.tierFor = function (w) { return w >= 1100 ? 'web' : (w >= 600 ? 'pad' : 'mobile'); };
  /** Readable per-tier numbers: LY.pick(tier, { web: 240, pad: 200, mobile: 0 }). */
  LY.pick = function (tierName, byTier, fallback) {
    var v = byTier[tierName];
    if (v === undefined) v = fallback !== undefined ? fallback : byTier.web;
    return v;
  };

  // ---------------------------------------------------------------- primitives
  /** App frame: strips device/app chrome off the canvas, returns the usable content rect. */
  LY.frame = function (o) {
    o = o || {};
    var t = LY.tier(o.tier);
    var ch = Object.assign({}, t.chrome, o.chrome || {});
    var w = o.w || t.w;
    var h = o.h || 900;
    var y = ch.statusBar + ch.navBar + (o.topExtra || 0);
    var bottomH = ch.tabbar + ch.safeBottom + (o.bottomExtra || 0);
    return {
      tier: o.tier || 'web', w: w, h: h,
      statusBar: R(0, 0, w, ch.statusBar),
      topBar: R(0, ch.statusBar, w, ch.navBar),
      bottomBar: R(0, h - bottomH, w, bottomH),
      safeBottom: R(0, h - ch.safeBottom, w, ch.safeBottom),
      content: R(0, y, w, h - y - bottomH),
      chrome: ch
    };
  };

  /** Centered content column with side margins and an optional max width (marketing container, prose measure). */
  LY.container = function (rect, o) {
    o = o || {};
    var margin = o.margin === undefined ? 32 : o.margin;
    var w = Math.min(rect.w - margin * 2, o.maxW || Infinity);
    return R(rect.x + (rect.w - w) / 2, rect.y + (o.top || 0), w, rect.h - (o.top || 0) - (o.bottom || 0));
  };

  /** Column grid. g.span(n, from) returns a rect spanning n columns starting at column index `from` (0-based). */
  LY.grid = function (rect, cols, gutter) {
    cols = cols || 12;
    gutter = gutter === undefined ? 24 : gutter;
    var cw = G((rect.w - gutter * (cols - 1)) / cols);
    var out = [];
    for (var i = 0; i < cols; i++) out.push(R(rect.x + i * (cw + gutter), rect.y, cw, rect.h));
    out.span = function (n, from) {
      from = from || 0; n = Math.max(1, Math.min(n, cols - from));
      return R(rect.x + from * (cw + gutter), rect.y, cw * n + gutter * (n - 1), rect.h);
    };
    out.colW = cw; out.gap = gutter; out.cols = cols;
    out.rect = R(rect.x, rect.y, rect.w, rect.h);   // the grid's own box: consumers need its origin, not just the columns
    return out;
  };

  /** Named pane presets (web baselines) so a one-off split still uses a canonical ratio instead of an invented number. */
  var MODE_PANES = {
    rail:   [{ w: 68 }, {}],            // icon rail + content
    nav:    [{ w: 240 }, {}],           // side nav + content
    list:   [{ w: 380 }, {}],           // list pane + detail
    detail: [{}, { w: 320 }],           // content + side/inspector pane
    facet:  [{ w: 264 }, {}],           // filter rail + grid
    copy:   [{ w: 560 }, {}]            // marketing copy column + media
  };
  LY.modes = MODE_PANES;

  /** Horizontal pane split. panes: [{w}|{ratio}|{flex}] fixed px, fraction, or remaining share; or use `mode`. Hairlines returned separately (1px, 0 gap). */
  LY.split = function (rect, o) {
    o = o || {};
    var spec = o.panes || MODE_PANES[o.mode];
    if (!spec) { warn('LY.split needs panes or a known mode (' + Object.keys(MODE_PANES).join('/') + ')'); spec = [{}]; }
    var gap = o.gap === undefined ? 0 : o.gap;
    var fixed = 0, flexCount = 0, totalRatio = 0;
    spec.forEach(function (p) {
      if (p.w !== undefined) fixed += p.w;
      else if (p.ratio !== undefined) totalRatio += p.ratio;
      else flexCount++;
    });
    var slack = rect.w - fixed - gap * (spec.length - 1);
    var perFlex = flexCount ? G(slack / flexCount) : 0;
    var x = rect.x, panes = [], dividers = [];
    spec.forEach(function (p, i) {
      var w = p.w !== undefined ? p.w : (p.ratio !== undefined ? G(slack * p.ratio / totalRatio) : perFlex);
      // clamp: a pane may never receive less than its min
      if (p.min !== undefined) w = Math.max(p.min, w);
      panes.push(R(x, rect.y, w, rect.h));
      x += w + gap;
      if (i < spec.length - 1 && o.hairlines !== false) { dividers.push(x - gap / 2); }
    });
    return { panes: panes, dividers: dividers, gap: gap };
  };

  /** Vertical split into rows: rows: [{h}|{flex}], returns rects (bottom-most flex absorbs the rest). */
  LY.rows = function (rect, spec, gap) {
    gap = gap === undefined ? 0 : gap;
    var fixed = 0, flexIdx = -1, flexCount = 0;
    spec.forEach(function (r, i) { if (r.h !== undefined) fixed += r.h; else { flexCount++; flexIdx = i; } });
    var slack = rect.h - fixed - gap * (spec.length - 1);
    var y = rect.y, out = [];
    spec.forEach(function (r, i) {
      var h = r.h !== undefined ? r.h : G(slack / flexCount);
      out.push(R(rect.x, y, rect.w, h));
      y += h + gap;
    });
    return out;
  };

  /** Band flow = the "web pages are long" primitive. bands: [{key,h}|{key,auto,minH}] stacked with rhythm gap.
      Returns { bands:{key:rect}, order:[key], totalH }. Call LY.flow() with a rect whose h is a *guess*, then resize the
      host board to totalH (and never to the viewport height when totalH > viewport). */
  LY.flow = function (rect, o) {
    o = o || {};
    var gap = o.gap === undefined ? 0 : o.gap;
    var y = rect.y, bands = {}, order = [];
    (o.bands || []).forEach(function (b) {
      var h = b.h !== undefined ? b.h : (b.minH || 240);
      bands[b.key] = R(rect.x, y, rect.w, h);
      order.push(b.key);
      y += h + gap;
    });
    return { bands: bands, order: order, totalH: order.length ? (y - rect.y - gap) : 0 };
  };

  /** Even repetition inside a rect (KPI cards, tiles, calendar cells, form columns). */
  LY.repeat = function (rect, count, gap, axis) {
    gap = gap === undefined ? 24 : gap;
    var out = [];
    if (axis === 'y') {
      var h = G((rect.h - gap * (count - 1)) / count);
      for (var i = 0; i < count; i++) out.push(R(rect.x, rect.y + i * (h + gap), rect.w, h));
    } else {
      var w = G((rect.w - gap * (count - 1)) / count);
      for (var j = 0; j < count; j++) out.push(R(rect.x + j * (w + gap), rect.y, w, rect.h));
    }
    out.cell = w || h;
    return out;
  };

  /** Shelf packing of *measured* boxes inside a rect — the page-assembly primitive a spec page needs.
      CF boards shrink to their content (CF.matrix returns the fitted width), so a page cannot pre-plan column
      pitches; it packs. `items` = [{w,h}] or [number] (heights then take `rowH`). x is snap-up so the first board
      lands on grid even when the rect came from a fractional container(); the leftover of each row is reported. */
  LY.pack = function (rect, items, o) {
    o = o || {};
    var gx = o.gapX === undefined ? 32 : o.gapX, gy = o.gapY === undefined ? 32 : o.gapY;
    var rowH = o.rowH === undefined ? 0 : o.rowH;
    var x0 = Math.ceil(rect.x / 4) * 4, out = [], x = x0, y = rect.y, maxRowH = 0, rows = 1, right = 0;
    (items || []).forEach(function (raw) {
      var w = typeof raw === 'number' ? raw : raw.w, h = (typeof raw === 'number' ? 0 : raw.h) || rowH || 0;
      var bw = LY.snap(w), bh = LY.snap(h);
      if (bw > rect.w) bw = LY.snap(rect.w);
      if (x > x0 && x - x0 + bw > rect.w) {          // wrap: the row is finished
        y += maxRowH + gy; x = x0; maxRowH = 0; rows++;
      }
      out.push(R(x, y, bw, bh));
      x += bw + gx; maxRowH = Math.max(maxRowH, bh);
      right = Math.max(right, x - gx);
    });
    out.rows = rows;
    out.height = y - rect.y + maxRowH;
    out.right = right;
    return out;
  };

  // ---------------------------------------------------------------- slot anatomy (chrome + common blocks)
  /** What lives *inside* a chrome rect, so headers/footers/navs are assembled from numbers, not vibes. */
  LY.slots = {
    appBar: function (r, o) {
      o = o || {};
      var padX = o.padX === undefined ? 24 : o.padX;
      var ctlH = Math.min(40, r.h - 16);
      var cy = r.y + (r.h - ctlH) / 2;
      var right = r.x + r.w - padX;
      var avatar = R(right - 32, cy + (ctlH - 32) / 2, 32, 32);
      var iconW = (o.actions === undefined ? 3 : o.actions) * 36;
      var actions = R(avatar.x - 12 - iconW, cy, iconW, ctlH);
      var searchW = o.searchW === undefined ? Math.min(400, Math.max(240, r.w * 0.28)) : o.searchW;
      var search = R(actions.x - 16 - searchW, cy + (ctlH - 32) / 2, searchW, 32);
      var logo = R(r.x + padX, cy + (ctlH - 32) / 2, o.logoW || 120, 32);
      var links = R(logo.x + logo.w + 32, cy, Math.max(160, search.x - logo.x - logo.w - 64), ctlH);
      return { logo: logo, links: links, search: search, actions: actions, avatar: avatar, controlH: ctlH, padX: padX };
    },
    // Brand lockup, CTA, scrolling list and the footer user row are all cut from ONE rect so
    // CF.sideNav never hand-computes a y offset (gate G11).
    sideNav: function (r, o) {
      o = o || {};
      var rail = r.w <= 88;
      var padX = 12, itemH = o.itemH || (rail ? 48 : 40), groupH = 32;
      var brandH = o.brand === false ? 0 : (rail ? 48 : 44), ctaH = o.hasCta ? 56 : 0, userH = o.hasUser ? 64 : 0;
      var y = r.y + 16;
      var markS = rail ? 32 : 28;
      var brand = o.brand === false ? null : R(rail ? r.x + (r.w - markS) / 2 : r.x + 16, y, markS, markS);
      y += brandH;
      var cta = o.hasCta ? R(r.x + (rail ? 8 : 16), y, r.w - (rail ? 16 : 32), 40) : null;
      if (cta) y += ctaH;
      var list = R(r.x, y, r.w, r.h - (y - r.y) - userH - 12);
      var items = [];
      (o.groups || [{ label: null, count: o.items || 8 }]).forEach(function (g) {
        if (g.label) { items.push({ kind: 'group', rect: R(list.x, y, list.w, groupH) }); y += groupH + 4; }
        for (var i = 0; i < g.count; i++) { items.push({ kind: 'item', rect: R(list.x + padX, y, list.w - padX * 2, itemH) }); y += itemH + 4; }
        if (g.label) y += 4;
      });
      var user = o.hasUser ? R(r.x + padX, r.y + r.h - userH + 8, r.w - padX * 2, 40) : null;
      return { rail: rail, brand: brand, cta: cta, list: list, items: items, user: user,
               itemH: itemH, padX: padX, icon: rail ? 22 : 20, iconLabelGap: 12, overflow: N(y - (list.y + list.h)) };
    },
    toolbar: function (r, o) {
      o = o || {};
      var padX = o.padX === undefined ? 16 : o.padX, h = Math.min(32, r.h - 12);
      var y = r.y + (r.h - h) / 2, x = r.x + padX, out = {};
      out.left = R(x, y, Math.max(120, r.w * 0.5), h);
      out.right = R(r.x + r.w - padX - (o.rightW || 120), y, o.rightW || 120, h);
      out.controlH = h; out.gap = 8;
      return out;
    },
    pageTitle: function (r) {
      var ctlH = Math.min(40, r.h - 24), y = r.y + (r.h - ctlH) / 2;
      return {
        title: R(r.x, r.y + 8, Math.min(720, r.w * 0.55), Math.min(40, r.h * 0.5)),
        subtitle: R(r.x, r.y + r.h - 28, Math.min(720, r.w * 0.6), 20),
        actions: R(r.x + r.w - 320, y, 320, ctlH), controlH: ctlH, gap: 8
      };
    },
    tabs: function (r, o) {
      o = o || {};
      var n = o.count || 4, w = Math.min(160, r.w / n), items = [];
      for (var i = 0; i < n; i++) items.push(R(r.x + i * w, r.y, w, r.h));
      return { items: items, itemW: w, indicatorH: 2, padX: 16, minItemW: 88 };
    },
    footer: function (r, o) {
      o = o || {};
      var cols = o.cols || 4, padT = o.padT === undefined ? 48 : o.padT;
      var grid = LY.grid(R(r.x + (o.padX || 32), r.y + padT, r.w - (o.padX || 32) * 2, r.h - padT - 64), cols, 24);
      var legal = R(grid.span(1, 0).x, r.y + r.h - 40, r.w - (o.padX || 32) * 2, 24);
      return { columns: grid, cols: cols, colW: grid.colW, legal: legal, padT: padT };
    },
    modal: function (r, o) {
      o = o || {};
      var headerH = o.headerH || 64, footerH = o.footerH || 72, pad = o.pad === undefined ? 24 : o.pad;
      return {
        header: R(r.x, r.y, r.w, headerH),
        body: R(r.x + pad, r.y + headerH, r.w - pad * 2, r.h - headerH - footerH),
        copy: R(r.x + pad, r.y + headerH, Math.min(r.w - pad * 2, 560), r.h - headerH - footerH), // measure cap
        footer: R(r.x, r.y + r.h - footerH, r.w, footerH),
        closeButton: R(r.x + r.w - 44, r.y + 10, 32, 32),
        buttons: R(r.x + r.w - pad - 220, r.y + r.h - footerH + (footerH - 40) / 2, 220, 40),
        buttonGap: 12
      };
    },
    kpiCard: function (r) {
      var pad = Math.min(24, Math.max(16, N(r.w * 0.08)));
      return {
        pad: pad,
        label: R(r.x + pad, r.y + pad, r.w - pad * 2, 16),
        value: R(r.x + pad, r.y + pad + 22, r.w * 0.6, Math.min(40, r.h * 0.34)),
        delta: R(r.x + pad, r.y + r.h - pad - 18, r.w * 0.5, 18),
        spark: R(r.x + r.w - pad - 80, r.y + r.h - pad - 24, 80, 24)
      };
    },
    tableRow: function (r, cols) {
      // cols: [{key,w|ratio,align,numeric}] -> cell rects. Fixed `w` cols take their width; `ratio` cols share the rest.
      // Numeric cells default to right alignment (design-guide §3.4 HARD: tabular data right/bottom-aligned, never ragged).
      var fixed = 0, totalRatio = 0;
      cols.forEach(function (c) { if (c.w !== undefined) fixed += c.w; else totalRatio += (c.ratio || 1); });
      var slack = Math.max(0, r.w - fixed);
      var x = r.x, out = {};
      cols.forEach(function (c) {
        var w = c.w !== undefined ? c.w : (totalRatio ? slack * (c.ratio || 1) / totalRatio : 0);
        var cell = R(x, r.y + 12, w, r.h - 24);
        cell.align = c.align || (c.numeric ? 'right' : 'left');
        out[c.key] = cell;
        x += w;
      });
      out.cellPadX = 16; return out;
    },
    card: function (r, o) {
      o = o || {};
      var pad = o.pad === undefined ? 24 : o.pad;
      var mediaH = o.mediaH ? Math.min(o.mediaH, r.h * 0.55) : 0;
      var headH = o.header ? 56 : 0, footH = o.footer ? 64 : 0;
      return {
        media: mediaH ? R(r.x, r.y, r.w, mediaH) : null,
        header: headH ? R(r.x + pad, r.y + mediaH, r.w - pad * 2, headH) : null,
        body: R(r.x + pad, r.y + mediaH + headH, r.w - pad * 2, r.h - mediaH - headH - footH - pad),
        footer: footH ? R(r.x + pad, r.y + r.h - footH, r.w - pad * 2, footH - 8) : null,
        pad: pad
      };
    },
    field: function (r, o) {
      // form field block: label above (or beside on desktop), control, helper/error below
      o = o || {};
      var labelH = o.labelAbove === false ? 0 : 20, helpH = o.helper === false ? 0 : 18, gap = 6;
      var ctlH = o.ctlH || (r.h - labelH - helpH - gap * 2);
      if (o.labelAbove === false) {
        var labelW = Math.min(280, r.w * 0.3);
        return {
          label: R(r.x, r.y, labelW, 20), control: R(r.x + labelW + 24, r.y, r.w - labelW - 24, ctlH),
          helper: R(r.x + labelW + 24, r.y + ctlH + 4, r.w - labelW - 24, helpH), ctlH: ctlH, gap: gap
        };
      }
      return {
        label: R(r.x, r.y, r.w, labelH),
        control: R(r.x, r.y + labelH + gap, Math.min(r.w, o.maxW || 360), ctlH),
        helper: R(r.x, r.y + labelH + gap + ctlH + 4, r.w, helpH),
        ctlH: ctlH, gap: gap
      };
    },
    messageRow: function (r, o) {
      o = o || {};
      var gutter = o.grouped ? 56 : (o.timestamps ? 88 : 56);
      return { avatar: R(r.x + 8, r.y + 4, 40, 40), body: R(r.x + gutter, r.y, r.w - gutter - 16, r.h), gutter: gutter };
    }
  };

  // ---------------------------------------------------------------- screen recipes
  // Every recipe: function(o) -> { frame, regions:{name:rect}, order:[name], notes }.
  // `o` = { w, h, tier, x0, y0, ...recipe-specific }. Regions are in the same coordinate space as o.x0/o.y0 (default 0,0).
  var RECIPES = {};

  RECIPES.email3 = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier || 'web' });
    var body = f.content;
    var s = LY.split(body, { panes: [{ w: o.navW || 240 }, { w: o.listW || 380 }, {}] });
    var nav = s.panes[0], list = s.panes[1], read = s.panes[2];
    var rows = LY.rows(list, [{ h: 44 }, { h: 0 }], 0);
    var rowH = o.density === 'comfortable' ? 88 : (o.density === 'compact' ? 44 : 68);
    var convo = [];
    for (var i = 0; i < Math.min(8, Math.floor((list.h - 44) / rowH)); i++) convo.push(R(list.x, list.y + 44 + i * rowH, list.w, rowH));
    var rh = LY.rows(read, [{ h: o.readHeaderH || 128 }, {} ], 0);
    var bodyR = rh[1];
    var composerW = Math.min(600, bodyR.w - 48), composerH = Math.min(500, bodyR.h - 32);
    return {
      frame: f,
      regions: {
        appBar: f.topBar, folderNav: nav, listPane: list, listToolbar: rows[0], conversations: R(list.x, list.y + 44, list.w, list.h - 44),
        readingPane: read, readingHeader: rh[0], readingBody: bodyR,
        readingMeasure: LY.container(bodyR, { maxW: 720, margin: 40, top: 8 }),   // 640-760 measure, NOT the pane width
        attachments: R(bodyR.x + 32, bodyR.y + bodyR.h - 120, bodyR.w - 64, 104),
        composer: R(read.x + read.w - composerW - 24, read.y + read.h - composerH - 24, composerW, composerH)
      },
      order: ['appBar', 'folderNav', 'listPane', 'readingPane', 'composer'],
      rows: { conversation: convo, rowH: rowH },
      dividers: s.dividers,
      notes: 'panes abut with 1px hairlines (gap 0); measure capped at 720 inside an 820 reading pane; Send lives on the composer toolbar LEFT.'
    };
  };

  RECIPES.calMonth = function (o) {
    o = o || {};
    var w = o.w || 1440, h = o.h || 900;
    var f = LY.frame({ w: w, h: h, tier: o.tier });
    var head = LY.rows(f.content, [{ h: 68 }, { h: 36 }, {} ]);
    var inner = LY.container(head[2], { margin: o.margin === undefined ? 32 : o.margin });
    var weeks = o.weeks || 5;
    var grid = LY.grid(inner, 7, 1);
    var cells = [];
    var ch = Math.max(100, Math.min(152, inner.h / weeks));
    for (var r0 = 0; r0 < weeks; r0++) for (var c0 = 0; c0 < 7; c0++)
      cells.push(R(grid[c0].x, inner.y + r0 * ch, grid[c0].w, ch));
    var chipsH = Math.floor((ch - 28) / 22);
    return {
      frame: f,
      regions: { titleBar: head[0], weekdayRow: head[1], grid: inner },
      cells: cells, cols: grid, cellH: ch, weeks: weeks,
      chipH: 22, chipGap: 2, chipsPerCell: Math.max(1, Math.min(3, chipsH)),
      notes: 'cell aspect ~1.35 (FullCalendar default); event chips 20-22 tall with 4-6 horizontal inset, max 3 then "+N more"; cells are NOT square.'
    };
  };

  RECIPES.calWeek = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier });
    var days = o.days || 7;                       // days:1 is the `calDay` agenda-column view
    var head = LY.rows(f.content, [{ h: 64 }, { h: 56 }, { h: 36 }, {} ]);
    var inner = f.content.w;
    var gutter = o.gutter || LY.pick(o.tier, { web: 64, pad: 56, mobile: 48 });
    var grid = LY.grid(R(f.content.x + gutter, head[3].y, inner - gutter, head[3].h), days, 1);
    var hourH = o.hourH || 48;
    return {
      frame: f,
      regions: { titleBar: head[0], dayHeader: head[1], allDayBand: head[2], scroll: head[3], timeGutter: R(f.content.x, head[3].y, gutter, head[3].h) },
      cols: grid, dayW: grid.colW, hourH: hourH, dayHeightPx: hourH * 24,
      event: function (col, startMin, endMin, lane, lanes) {
        var laneW = (grid.colW - 8) / Math.max(1, lanes);
        return R(grid[col].x + 4 + lane * laneW, head[3].y + (startMin / 60) * hourH, Math.max(24, laneW - 4), Math.max(22, ((endMin - startMin) / 60) * hourH));
      },
      notes: 'hour labels sit AT the top edge of the line, never vertically centered on it; half-hour line = 1px @50% alpha; min event height 22.'
    };
  };

  RECIPES.eventPopover = function (o) {
    o = o || {};
    var t = o.tier || 'web';
    // o.w / o.h are the CANVAS the popover lands in (the convention every other recipe uses); the card itself is popW/popH.
    var canvasW = o.w || 1440, canvasH = o.h || 900;
    var w = o.popW || LY.pick(t, { web: 360, pad: 360, mobile: 327 });
    var h = o.popH || 384;
    var anchor = o.anchor || R(24, 24, 196, 120);                 // the calendar cell / event chip it opened from
    var x = Math.max(8, Math.min(anchor.x, canvasW - w - 8));
    var y = anchor.y + (anchor.h || 0) + 8;
    if (y + h > canvasH - 8) y = Math.max(8, anchor.y - h - 8);  // flip above rather than clip
    var card = R(x, y, w, h);
    var body = R(card.x + 16, card.y + 16, card.w - 32, card.h - 32 - 52);
    var fl = LY.flow(body, { gap: 8, bands: [
      { key: 'title', h: 36 }, { key: 'allDay', h: 32 }, { key: 'start', h: 36 }, { key: 'end', h: 36 },
      { key: 'calendar', h: 36 }, { key: 'location', h: 36 }, { key: 'more', h: 36 }
    ] });
    var pair = LY.split(fl.bands.start, { panes: [{ ratio: 1 }, { ratio: 1 }], gap: 8 });
    var regions = Object.assign({}, fl.bands, {
      card: card, body: body, startLabel: pair.panes[0], startValue: pair.panes[1],
      footer: R(card.x + 16, card.y + card.h - 16 - 36, card.w - 32, 36),
      remove: R(card.x + 16, card.y + card.h - 16 - 36, 64, 36),
      save: R(card.x + card.w - 16 - 88, card.y + card.h - 16 - 36, 88, 36)
    });
    return {
      frame: { w: canvasW, h: canvasH }, card: card, regions: regions,
      notes: '320-360 wide, NEVER full-width; time pair = two 40-44 controls side by side; Save top-right of the footer with Cancel ghost; opening from a cell keeps the pointer 8px off the cell edge.'
    };
  };

  RECIPES.dashboard = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1200, tier: o.tier });
    var s = LY.split(f.content, { panes: [{ w: o.navW || 240 }, {}] });
    var nav = s.panes[0], area = s.panes[1];
    var head = LY.rows(area, [{ h: 88 }, { h: 56 }, {} ], 0);
    var inner = LY.container(head[2], { margin: 24 });
    var fl = LY.flow(inner, {
      gap: 24, bands: [
        { key: 'kpi', h: o.kpiH || 140 }, { key: 'charts', h: o.chartH || 360 },
        { key: 'table', h: o.tableH || 420 }
      ]
    });
    var kpis = LY.repeat(fl.bands.kpi, o.kpiCount || 4, 24);
    var g12 = LY.grid(fl.bands.charts, 12, 24);
    var gTable = LY.grid(fl.bands.table, 12, 24);
    return {
      frame: f,
      regions: { sideNav: nav, pageTitle: head[0], filterBar: head[1], content: inner, kpi: fl.bands.kpi, charts: fl.bands.charts, table: fl.bands.table },
      kpi: kpis, kpiW: kpis.cell,
      charts: { hero: g12.span(8, 0), side: g12.span(4, 8), half: g12.span(6, 0) },
      table: gTable.span(12, 0), grid12: g12,
      totalH: head[2].y + fl.totalH - f.content.y,
      notes: '4 KPI cards @270 wide (never >6); plot min-height 240; legend right of the card title, not under the plot; date-range 200-260x36 left of actions.'
    };
  };

  RECIPES.listCrud = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1000, tier: o.tier });
    var navW = o.navW === undefined ? 240 : o.navW;
    var s = navW ? LY.split(f.content, { panes: [{ w: navW }, {}] }) : { panes: [null, f.content], dividers: [] };
    var area = s.panes[1];
    var head = LY.rows(area, [{ h: 80 }, { h: 64 }, { h: o.bulk ? 52 : 0 }, {} ], 0);
    var inner = LY.container(head[3], { margin: 24 });
    var cols = o.columns || [{ key: 'sel', w: 44 }, { key: 'name', w: 280 }, { key: 'email', w: 300 },
                             { key: 'status', w: 140 }, { key: 'role', w: 160 }, { key: 'created', w: 160 }, { key: 'actions', ratio: 0 }];
    var rowsH = o.rowH || 48;
    var body = LY.rows(inner, [{ h: 44 }, { h: rowsH * 8 }, { h: 64 }], 0);
    return {
      frame: f,
      regions: { sideNav: s.panes[0], pageTitle: head[0], toolbar: head[1], bulkBar: head[2], content: inner,
                 tableHeader: body[0], tableBody: body[1], pagination: body[2] },
      columns: cols, rowH: rowsH, visibleRows: 8, dividers: s.dividers,
      notes: 'toolbar is ONE line; row 48 default / 40 compact / 32 dense; actions column 88 (kebab) or 120 (two text actions); never 4 visible text links.'
    };
  };

  RECIPES.detailRecord = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1100, tier: o.tier });
    var inner = LY.container(f.content, { margin: o.margin === undefined ? 32 : o.margin, maxW: o.maxW || 1200 });
    var head = LY.rows(inner, [{ h: 44 }, { h: 120 }, { h: 48 }, {} ], 0);
    var split = LY.split(head[3], { panes: [{ ratio: 2.7 }, { w: o.sideW || 320 }], gap: 32 });
    var mainR = LY.rows(split.panes[0], [{ h: 200 }, { h: 240 }, {} ], 24);
    var side = LY.rows(split.panes[1], [{ h: 220 }, { h: 160 }, {} ], 24);
    return {
      frame: f,
      regions: { breadcrumb: head[0], header: head[1], tabs: head[2], body: head[3], main: split.panes[0], side: split.panes[1],
                 description: mainR[0], properties: mainR[1], activity: mainR[2], ownerCard: side[0], attachments: side[1] },
      ratio: split.panes[0].w / split.panes[1].w,
      measure: LY.container(mainR[0], { margin: 0, maxW: 720 }),
      notes: 'main:side = 2.7:1 (HARD 2.2-3.2, never 50/50); prose measure 720 inside the main column; timeline rows 40-72 with a 1px connector at x=11-15.'
    };
  };

  RECIPES.settings = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1200, tier: o.tier });
    // collapse per layout-library §4: pad drops the product nav, mobile drops both (settings becomes a single stack)
    var outerW = o.navW === undefined ? LY.pick(o.tier, { web: 240, pad: 0, mobile: 0 }) : o.navW;
    var sideW = o.sideNavW === undefined ? LY.pick(o.tier, { web: 240, pad: 220, mobile: 0 }) : o.sideNavW;
    var panes = [];
    if (outerW) panes.push({ w: outerW });
    if (sideW) panes.push({ w: sideW });
    panes.push({});
    var s = LY.split(f.content, { panes: panes, gap: 0 });
    var main = s.panes[s.panes.length - 1];
    var area = LY.container(main, { margin: o.tier === 'mobile' ? 16 : 32, maxW: 720 });   // HARD: measure <=760
    var head = LY.rows(area, [{ h: 64 }, { h: 200 }, { h: 160 }, { h: 240 }], 32);
    return {
      frame: f,
      regions: { outerNav: outerW ? s.panes[0] : null, settingsNav: sideW ? s.panes[s.panes.length - 2] : null,
                 content: area, pageTitle: head[0], generalPanel: head[1], dangerPanel: head[3] },
      panels: head,
      controlCols: o.tier === 'mobile' ? { label: 0, input: area.w, select: area.w } : { label: 240, input: 320, select: 200 },
      notes: 'content measure 640-720; panel rows 48-72; danger zone is the LAST card with red outline button; instant-save XOR sticky save bar; on mobile labels go ABOVE controls (label-beside needs 240px you do not have).'
    };
  };

  RECIPES.heroCenter = function (o) {
    o = o || {};
    var w = o.w || 1440;
    var f = LY.frame({ w: w, h: o.h || 760, tier: o.tier, chrome: { statusBar: 0, navBar: o.navH || 72, tabbar: 0, safeBottom: 0 } });
    var inner = LY.container(f.content, { margin: 40, maxW: 1280 });
    var fl = LY.flow(inner, {
      bands: [{ key: 'badge', h: 28 }, { key: 'h1', h: o.h1H || 132 }, { key: 'sub', h: 84 },
              { key: 'cta', h: 48 }, { key: 'trust', h: 24 }, { key: 'visual', h: o.visualH || 420 }]
    });
    var bands = fl.bands;
    var cx = inner.x + inner.w / 2;
    return {
      frame: f, inner: inner,
      regions: {
        nav: f.topBar, hero: f.content, container: inner,
        badge: R(cx - Math.min(120, inner.w / 2), bands.badge.y, Math.min(240, inner.w), 28),
        h1: R(cx - Math.min(420, inner.w / 2), bands.h1.y, Math.min(840, inner.w), bands.h1.h),
        sub: R(cx - Math.min(320, inner.w / 2), bands.sub.y, Math.min(640, inner.w), bands.sub.h),
        cta: R(cx - Math.min(160, inner.w / 2), bands.cta.y, Math.min(320, inner.w), 48),
        trust: R(cx - Math.min(200, inner.w / 2), bands.trust.y, Math.min(400, inner.w), 24),
        visual: R(cx - Math.min(600, inner.w / 2), bands.visual.y, Math.min(1200, inner.w), bands.visual.h)
      },
      gaps: { badgeToH1: bands.h1.y - (bands.badge.y + 28), h1ToSub: bands.sub.y - (bands.h1.y + bands.h1.h), ctaToVisual: bands.visual.y - (bands.cta.y + 48) },
      totalH: fl.totalH,
      notes: 'H1 48-64/1.05-1.12 max-width 720-840; subhead 18-20 max-width 520-640 (never 4 lines); CTA gap 12-16, one filled primary only; hero band 560-760 with 80-120 vertical padding.'
    };
  };

  RECIPES.heroSplit = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 680, chrome: { statusBar: 0, navBar: o.navH || 72, tabbar: 0, safeBottom: 0 } });
    var inner = LY.container(f.content, { margin: 40, maxW: 1280 });
    var sp = LY.split(inner, { panes: [{ w: o.copyW || 560 }, {}], gap: o.gap === undefined ? 64 : o.gap });
    var copy = LY.rows(sp.panes[0], [{ h: 28 }, { h: 120 }, { h: 80 }, { h: 48 }, { h: 24 }], 24);
    return {
      frame: f, inner: inner,
      regions: { nav: f.topBar, container: inner, copy: sp.panes[0], media: sp.panes[1],
                 badge: copy[0], h1: copy[1], sub: copy[2], cta: copy[3], trust: copy[4] },
      totalH: f.h,
      notes: 'copy column 520-600 (H1 40-52/1.1 left aligned), media 600-720, gap 48-64; visual may overlap the next band by -24.'
    };
  };

  RECIPES.landing = function (o) {
    o = o || {};
    var w = o.w || 1440;
    var bandsSpec = o.bands || [
      { key: 'nav', h: 72 }, { key: 'hero', h: o.heroH || 680 }, { key: 'logoStrip', h: 144 },
      { key: 'features', h: 480 }, { key: 'showcase', h: 520 }, { key: 'quote', h: 280 },
      { key: 'faq', h: 420 }, { key: 'cta', h: 240 }, { key: 'footer', h: 400 }
    ];
    var totalH = bandsSpec.reduce(function (a, b) { return a + b.h; }, 0);
    var fl = LY.flow(R(0, 0, w, totalH), { bands: bandsSpec });
    var inner = LY.container(R(0, 0, w, totalH), { margin: 40, maxW: 1280 });
    var feat = LY.grid(fl.bands.features, 12, 24);
    return {
      frame: { w: w, h: totalH }, bands: fl.bands, order: fl.order, inner: inner, totalH: totalH,
      features: { col3: [feat.span(4, 0), feat.span(4, 4), feat.span(4, 8)], col2: [feat.span(6, 0), feat.span(6, 6)] },
      logoStrip: { logos: LY.repeat(R(inner.x, fl.bands.logoStrip.y + 48, inner.w, 48), 6, 64) },
      notes: 'landing total height 2400-4200 at 1440 (a one-screen landing is the #1 amateur tell); feature cards 360-384 wide; rhythm 64-96 between bands.'
    };
  };

  // a one-page editorial landing recipe measured at 1440 (example band flow, no brand). The band heights are the
  // reference's own document flow, so a band that merely contains another region is not a region here; the screen record
  // fills these 17 leaves. Total 17,665 at 1440. A project may pass its own bandsSpec.
  RECIPES.editorialLanding = function (o) {
    o = o || {};
    var w = o.w || 1440;
    var bandsSpec = [
      { key: 'hero', h: 900 }, { key: 'about', h: 1096 }, { key: 'partner', h: 168 },
      { key: 'services', h: 1068 }, { key: 'works', h: 3836 }, { key: 'process', h: 680 },
      { key: 'benefits', h: 1195 }, { key: 'features', h: 1192 }, { key: 'tools', h: 800 },
      { key: 'team', h: 1112 }, { key: 'statistic', h: 692 }, { key: 'awards', h: 772 },
      { key: 'testimonials', h: 756 }, { key: 'pricing', h: 1033 }, { key: 'faqs', h: 844 },
      { key: 'contact', h: 800 }, { key: 'footer', h: 721 }
    ];
    var totalH = bandsSpec.reduce(function (a, b) { return a + b.h; }, 0);
    var fl = LY.flow(R(0, 0, w, totalH), { bands: bandsSpec });
    return { frame: { w: w, h: totalH }, bands: fl.bands, order: fl.order, totalH: totalH,
             inner: LY.container(R(0, 0, w, totalH), { margin: 60, maxW: 1320 }),
             notes: 'editorial landing example: 17 bands at 1440, one measured document flow (900/1096/168/1068/3836/680/1195/1192/800/1112/692/772/756/1033/844/800/721). A project passes its OWN `bandsSpec` — these heights are an example, not a rule; content column 1320 at margin 60; ink bands full-bleed.' };
  };

  // ---------------------------------------------------------------- one-page portfolio recreation recipes
  // The source is a dark one-page portfolio plus two index pages. These three recipes encode its band stack and the
  // leaf regions the screen record fills; a band that merely contains another region is NOT a region here (overlapping
  // boards), so only leaves are listed. Heights are the source's own 1440 rhythm: 900 hero, 180 band padding.
  var bdxCells = function (rect, cols, rows, gap) {
    var cw = G((rect.w - gap * (cols - 1)) / cols), ch = G((rect.h - gap * (rows - 1)) / rows);
    var out = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++)
      out.push(R(rect.x + c * (cw + gap), rect.y + r * (ch + gap), cw, ch));
    return out;
  };
  RECIPES.portfolioHome = function (o) {
    o = o || {};
    var w = o.w || 1440, bandsSpec = [
      { key: 'nav', h: 72 }, { key: 'hero', h: 900 }, { key: 'works', h: 1500 }, { key: 'services', h: 1600 },
      { key: 'quote', h: 900 }, { key: 'skills', h: 1100 }, { key: 'stats', h: 900 }, { key: 'philosophy', h: 900 },
      { key: 'journal', h: 1300 },
      // §2 a band is only as tall as what the recipe puts in it. The footer here ends at `footer.legal`
      // (+500 +120 = 620); declaring 900 left 280px of empty board under the last region, which `audit_design`
      // rule 46 (`frame_dead_band`) now fails — measured on `Screen·home` in the live file.
      { key: 'footer', h: 620 }];
    var totalH = bandsSpec.reduce(function (a, b) { return a + b.h; }, 0);
    var fl = LY.flow(R(0, 0, w, totalH), { bands: bandsSpec });
    var b = fl.bands, M = 72, W = w - M * 2;
    var svc = bdxCells(R(M, b.services.y + 360, W, 1040), 3, 2, 24);
    var st = bdxCells(R(M, b.stats.y + 340, W, 360), 4, 1, 24);
    var jr = bdxCells(R(M, b.journal.y + 360, W, 920), 2, 2, 24);
    var regions = {
      nav: R(0, b.nav.y, w, 72),
      'hero.copy': R(M, b.hero.y + 160, 700, 520),
      'hero.media': R(w - M - 468, b.hero.y + 80, 468, 700),
      'works.header': R(M, b.works.y + 96, W, 220),
      'works.card': R(M, b.works.y + 360, W, 960),
      'services.header': R(M, b.services.y + 96, W, 220),
      'quote.copy': R(M, b.quote.y + 160, 800, 560),
      'quote.media': R(w - M - 468, b.quote.y + 100, 468, 700),
      'skills.header': R(M, b.skills.y + 96, W, 220),
      'skills.list': R(M, b.skills.y + 360, W, 640),
      'stats.header': R(M, b.stats.y + 96, W, 180),
      'philosophy.copy': R(M, b.philosophy.y + 160, 800, 560),
      'philosophy.media': R(w - M - 468, b.philosophy.y + 100, 468, 700),
      'journal.header': R(M, b.journal.y + 96, W, 220),
      'footer.brand': R(M, b.footer.y + 96, 600, 300),
      'footer.social': R(w - M - 468, b.footer.y + 96, 468, 300),
      'footer.legal': R(M, b.footer.y + 500, W, 120)
    };
    svc.forEach(function (r, i) { regions['services.c' + (i + 1)] = r; });
    st.forEach(function (r, i) { regions['stats.c' + (i + 1)] = r; });
    jr.forEach(function (r, i) { regions['journal.c' + (i + 1)] = r; });
    return { frame: { w: w, h: totalH }, bands: b, order: fl.order, totalH: totalH, regions: regions,
             notes: 'One-page portfolio: hero 900 with a 700 copy column and a 468 media card; bands 900–1600; contact in the footer.' };
  };
  RECIPES.worksIndex = function (o) {
    o = o || {};
    var w = o.w || 1440, bandsSpec = [{ key: 'nav', h: 72 }, { key: 'header', h: 300 }, { key: 'grid', h: 1752 },
      // §2 the footer band holds one 300px region inset 96 → 396; the 900 it used to declare left 504px of empty
      // board under the page (rule 46 `frame_dead_band`, measured on `Screen·works`).
      { key: 'footer', h: 396 }];
    var totalH = bandsSpec.reduce(function (a, b) { return a + b.h; }, 0);
    var fl = LY.flow(R(0, 0, w, totalH), { bands: bandsSpec });
    var b = fl.bands, M = 72, W = w - M * 2;
    var cards = bdxCells(R(M, b.grid.y, W, b.grid.h), 3, 4, 24);
    var regions = { nav: R(0, b.nav.y, w, 72), header: R(M, b.header.y, W, b.header.h),
      footer: R(M, b.footer.y + 96, W, 300) };
    cards.forEach(function (r, i) { regions['c' + (i + 1)] = r; });
    return { frame: { w: w, h: totalH }, bands: b, order: fl.order, totalH: totalH, regions: regions,
             notes: 'Works index: 12 project cards in a 3-column grid; the card shows still, client, year and categories.' };
  };
  RECIPES.journalIndex = function (o) {
    o = o || {};
    var w = o.w || 1440, bandsSpec = [{ key: 'nav', h: 72 }, { key: 'header', h: 300 }, { key: 'grid', h: 1064 }, { key: 'pagination', h: 120 },
      // §2 396, not 900 — see `worksIndex`: the band carries one 300px region inset 96 (rule 46).
      { key: 'footer', h: 396 }];
    var totalH = bandsSpec.reduce(function (a, b) { return a + b.h; }, 0);
    var fl = LY.flow(R(0, 0, w, totalH), { bands: bandsSpec });
    var b = fl.bands, M = 72, W = w - M * 2;
    var cards = bdxCells(R(M, b.grid.y, W, b.grid.h), 2, 2, 24);
    var regions = { nav: R(0, b.nav.y, w, 72), header: R(M, b.header.y, W, b.header.h),
      pagination: R(M, b.pagination.y + 24, W, 56), footer: R(M, b.footer.y + 96, W, 300) };
    cards.forEach(function (r, i) { regions['c' + (i + 1)] = r; });
    return { frame: { w: w, h: totalH }, bands: b, order: fl.order, totalH: totalH, regions: regions,
             notes: 'Journal index: four cover cards in a 2-column grid plus a 56px pagination row.' };
  };

  RECIPES.blogArticle = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 2400, chrome: { statusBar: 0, navBar: 68, tabbar: 0, safeBottom: 0 } });
    var measure = LY.container(f.content, { margin: 32, maxW: o.measure || 720 });
    var fl = LY.flow(measure, {
      gap: 0, bands: [
        { key: 'title', h: 120 }, { key: 'byline', h: 72 }, { key: 'heroImage', h: Math.round(measure.w * 0.5625) },
        { key: 'p1', h: 168 }, { key: 'h2', h: 64 }, { key: 'p2', h: 216 }, { key: 'code', h: 240 },
        { key: 'p3', h: 168 }, { key: 'callout', h: 104 }, { key: 'author', h: 120 }
      ]
    });
    var b = fl.bands;
    var tocW = 220;
    var hasToc = o.tier === 'web' && measure.x + measure.w + 32 + tocW <= f.w;
    return {
      frame: f, measure: measure, regions: b, totalH: fl.totalH,
      headingOffset: { h2MarginTop: 48, h2MarginBottom: 16 },
      toc: hasToc ? R(measure.x + measure.w + 32, f.content.y + 24, tocW, 320) : null,
      notes: 'body 16-18/1.6-1.8 at measure 640-760; H2 gets MORE space above (48-56) than below (16); code blocks 13-14/1.7 with a 40-48 gutter and horizontal scroll (never wrap); callout = 4px leading bar + tint.'
    };
  };

  RECIPES.docsLayout = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1400, chrome: { statusBar: 0, navBar: 64, tabbar: 0, safeBottom: 0 } });
    var sp = LY.split(f.content, { panes: [{ w: o.sideW || 288 }, {}, { w: o.tocW || 224 }], gap: 0 });
    var body = LY.container(sp.panes[1], { margin: 32, maxW: 768 });
    return {
      frame: f,
      regions: { sidebar: sp.panes[0], content: sp.panes[1], body: body, toc: sp.panes[2] },
      sidebarRows: LY.repeat(R(sp.panes[0].x + 12, sp.panes[0].y + 16, sp.panes[0].w - 24, 36 * 12), 12, 0, 'y'),
      anchorOffset: 88,
      notes: 'sidebar 264-320, TOC 200-240 sticky top 24, content 720-768; TOC lists 2 levels and <=25 items; anchors offset by 88 for the sticky nav.'
    };
  };

  RECIPES.chat = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier });
    var sp = LY.split(f.content, { panes: [{ w: o.railW || 68 }, { w: o.sideW || 272 }, {}, o.thread ? { w: o.threadW || 440 } : null]
      .filter(Boolean), gap: 0 });
    var idx = o.thread ? 3 : 2;
    var room = LY.rows(sp.panes[idx], [{ h: 52 }, {}, { h: o.composerH || 72 }], 0);
    var list = room[1];
    var rowH = [64, 24, 64, 88, 40, 64];
    var msgs = [], y = list.y;
    rowH.forEach(function (h) { if (y + h < list.y + list.h) { msgs.push(R(list.x, y, list.w, h)); y += h; } });
    return {
      frame: f,
      regions: { rail: sp.panes[0], channelList: sp.panes[1], room: sp.panes[idx], topBar: room[0], messages: list, composer: room[2],
                 thread: o.thread ? sp.panes[3] : null },
      messages: msgs, avatarGutter: 56, groupedGap: 4, authorChangeGap: 16,
      dayDivider: R(list.x + 16, list.y + 64, 120, 22),
      notes: 'chat fills the pane (65ch prose measure does NOT apply); grouped consecutive rows gap 2-4, author change 14-20; composer min 56-72 and grows; reaction chips 22-26 h.'
    };
  };

  RECIPES.kanban = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier });
    var head = LY.rows(f.content, [{ h: 60 }, {} ], 0);
    // how many columns FIT, not how many we wish for: 272 min + 16 gutter per column. 4 columns is a 1440 number.
    var n = o.columns || Math.max(2, Math.min(o.maxColumns || 7, Math.floor((f.content.w - 32 + 16) / 288)));
    var colW = Math.min(320, Math.max(272, Math.floor((f.content.w - 32 - (n - 1) * 16) / n)));
    if (n * colW + (n - 1) * 16 > f.content.w - 32) n = Math.max(2, Math.floor((f.content.w - 32 + 16) / (colW + 16)));
    var cols = [];
    for (var i = 0; i < n; i++) cols.push(R(f.content.x + 16 + i * (colW + 16), head[1].y, colW, head[1].h));
    var cards = cols.map(function (c) {
      var ch = 84, gap = 8, out = [];
      for (var y = c.y + 52 + 8; y + ch < c.y + c.h - 44; y += ch + gap) out.push(R(c.x + 8, y, c.w - 16, ch));
      return out;
    });
    return {
      frame: f, regions: { boardHeader: head[0], board: head[1] },
      columns: cols, colW: colW, headerH: 48, cardW: colW - 16, cardH: 84, cards: cards,
      addCard: cols.map(function (c) { return R(c.x + 8, c.y + c.h - 44, c.w - 16, 36); }),
      notes: 'column 272-320 (default 280-300), gap 16, 4-5 visible at 1440; columns scroll internally at fixed viewport height; header MUST show count/WIP.'
    };
  };

  RECIPES.ecomListing = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1600, chrome: { statusBar: 0, navBar: 72, tabbar: 0, safeBottom: 0 } });
    var inner = LY.container(f.content, { margin: 32, maxW: 1280 });
    var head = LY.rows(inner, [{ h: 40 }, { h: 52 }, {} ], 16);
    var sp = LY.split(head[2], { panes: [{ w: o.facetW || 264 }, {}], gap: 24 });
    var perRow = o.perRow || 3;
    var grid = LY.grid(sp.panes[1], perRow, 24);
    var cards = [], rows = Math.floor((sp.panes[1].h - 64) / 424);
    for (var r = 0; r < rows; r++) for (var c = 0; c < perRow; c++)
      cards.push(R(grid[c].x, sp.panes[1].y + r * (400 + 24), grid[c].w, 400));
    return {
      frame: f, regions: { container: inner, breadcrumb: head[0], toolbar: head[1], facets: sp.panes[0], grid: sp.panes[1] },
      cards: cards, cardW: grid.colW, imgAspect: 1, infoH: 120,
      notes: '3 cols x 276 with facets / 4 x 264 without; image 1:1 or 4:5 (mixed aspects make ragged rows); price right-of-title 15-16/600 + compare-at strikethrough.'
    };
  };

  RECIPES.ecomPdp = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1400, chrome: { statusBar: 0, navBar: 72, tabbar: 0, safeBottom: 0 } });
    var inner = LY.container(f.content, { margin: 32, maxW: 1280 });
    var sp = LY.split(inner, { panes: [{ w: o.galleryW || 620 }, {}], gap: 56 });
    var gal = LY.rows(sp.panes[0], [{ h: Math.min(620, sp.panes[0].w) }, { h: 88 }], 16);
    var buy = LY.rows(sp.panes[1], [{ h: 20 }, { h: 76 }, { h: 44 }, { h: 88 }, { h: 56 }, { h: 56 }, { h: 88 }, { h: 120 }], 16);
    return {
      frame: f, regions: { gallery: sp.panes[0], mainImage: gal[0], thumbs: gal[1], buyBox: sp.panes[1] },
      buySlots: { brand: buy[0], title: buy[1], rating: buy[2], price: buy[3], variants: buy[4], qty: buy[5], addToCart: buy[6], delivery: buy[7] },
      sticky: { top: 24 },
      notes: 'gallery 560-680 / buy box 400-480 sticky; Add-to-cart 48-56 h full box width and adjacent to price; thumbs 64-80 (32-40 is unusable); mobile gets a sticky bottom bar 56-64 + inset 34.'
    };
  };

  RECIPES.cart = function (o) {
    o = o || {};
    var t = o.tier || 'web';
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: t,
                       chrome: t === 'web' ? { statusBar: 0, navBar: o.navH || 72, tabbar: 0, safeBottom: 0 } : undefined });
    var inner = LY.container(f.content, { margin: t === 'mobile' ? 16 : 32, maxW: 1120 });
    var head = LY.rows(inner, [{ h: 44 }, { h: 40 }, {} ], 16);
    var sp = t === 'mobile'
      ? { panes: [head[2], null], dividers: [] }
      : LY.split(head[2], { panes: [{}, { w: LY.pick(t, { web: 360, pad: 320 }) }], gap: 48 });
    var rowH = o.rowH || 112, list = sp.panes[0];
    var rows = [], n = Math.max(1, Math.min(o.items || 3, Math.floor(list.h / (rowH + 16))));
    for (var i = 0; i < n; i++) rows.push(R(list.x, list.y + i * (rowH + 16), list.w, rowH));
    var slots = rows.map(function (r) {
      var thumb = 88;
      return { thumb: R(r.x + 8, r.y + (r.h - thumb) / 2, thumb, thumb),
               info: R(r.x + 8 + thumb + 16, r.y + 14, r.w - thumb - 160 - 40, 44),
               qty: R(r.x + r.w - 136 - 72, r.y + (r.h - 36) / 2, 104, 36),
               price: R(r.x + r.w - 136, r.y + (r.h - 40) / 2, 96, 40),
               remove: R(r.x + r.w - 32, r.y + 12, 24, 24) };
    });
    var sum = sp.panes[1] ? LY.rows(sp.panes[1], [
      { h: 28 }, { h: 36 }, { h: 36 }, { h: 36 }, { h: 40 }, { h: 52 }, { h: 52 }, { h: 20 }
    ], 12) : null;
    var sticky = t === 'mobile' ? R(f.content.x, f.h - f.chrome.tabbar - f.chrome.safeBottom - 72, f.content.w, 72) : null;
    return {
      frame: f, inner: inner,
      regions: { breadcrumb: head[0], toolbar: head[1], items: list, summary: sp.panes[1],
                 summaryTitle: sum && sum[0], lineSubtotal: sum && sum[1], lineShipping: sum && sum[2], lineTax: sum && sum[3],
                 promo: sum && sum[4], total: sum && sum[5], cta: sum && sum[6], legal: sum && sum[7], stickyBar: sticky },
      rows: rows, rowSlots: slots, rowH: rowH, thumbSize: 88, qtyW: 104,
      notes: 'row 96-128 (thumb 72-96 + title/variant 2 lines + qty stepper 104x36-40 + price 96 right-aligned + remove 24); summary 320-384 sticky top 24 with 32-40 value rows, 48-56 total, CTA 48-56 full summary width; promo input 200-240x40 + Apply; on mobile the CTA lives in a sticky 72 bar above the home inset.'
    };
  };

  RECIPES.checkout = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1100, chrome: { statusBar: 0, navBar: 72, tabbar: 0, safeBottom: 0 } });
    var inner = LY.container(f.content, { margin: 32, maxW: 1100 });
    var sp = LY.split(inner, { panes: [{ w: 600 }, {}], gap: 48 });
    var steps = LY.rows(sp.panes[0], [{ h: 44 }, { h: 280 }, { h: 280 }, { h: 320 }], 24);
    return {
      frame: f, regions: { container: inner, form: sp.panes[0], summary: sp.panes[1], stepIndicator: steps[0],
                 contact: steps[1], shipping: steps[2], payment: steps[3] },
      summaryCols: { rowH: 36, promoW: 220, totalH: 52, ctaH: 52 },
      notes: '3 steps max; form column 560-640, inputs 360-420 x 40-44 (never full width); summary 360-400 sticky; place-order echoes the total + 12px legal.'
    };
  };

  RECIPES.authCard = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier });
    // a 440 card is a web/pad number; at 375 the card IS the screen minus 16px margins
    var cw = Math.min(o.cardW || LY.pick(o.tier, { web: 440, pad: 440, mobile: 343 }), f.content.w - 16);
    var ch = o.cardH || LY.pick(o.tier, { web: 560, pad: 560, mobile: 0 }) || Math.min(620, f.content.h);
    var pad = o.tier === 'mobile' ? 24 : 36;
    var card = R(f.content.x + (f.content.w - cw) / 2, f.content.y + Math.max(24, (f.content.h - ch) / 2 - 24), cw, ch);
    var inner = R(card.x + pad, card.y + pad, card.w - pad * 2, card.h - pad * 2);
    var fl = LY.flow(inner, { bands: [
      { key: 'logo', h: 32 }, { key: 'h1', h: 40 }, { key: 'sub', h: 44 },
      { key: 'email', h: 62 }, { key: 'password', h: 62 }, { key: 'forgot', h: 24 },
      { key: 'submit', h: 46 }, { key: 'divider', h: 32 }, { key: 'sso', h: 96 }, { key: 'footer', h: 40 }
    ], gap: 8 });
    return {
      frame: f, card: card, regions: fl.bands, inner: inner, totalH: fl.totalH,
      notes: 'card 400-480 wide (a 640 card produces 60-char fields); fields 100% of card x 40-44, gap 16-20; submit 100% x 44-48; max 3 SSO buttons; never use placeholder as label.'
    };
  };

  RECIPES.authSplit = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, chrome: { statusBar: 0, navBar: 0, tabbar: 0, safeBottom: 0 } });
    var sp = LY.split(f.content, { panes: [{ w: o.brandW || 640 }, {}], gap: 0 });
    var form = LY.container(sp.panes[1], { margin: 56, maxW: 440 });
    return {
      frame: f, regions: { brand: sp.panes[0], formPane: sp.panes[1], form: form },
      brandHeadline: R(sp.panes[0].x + 64, sp.panes[0].y + sp.panes[0].h / 2 - 60, Math.min(480, sp.panes[0].w - 128), 120),
      notes: 'brand panel 560-720 (40-50%), form panel 480-560 with padding 48-64 and max width 440; headline 32-44/1.15 measure <=480.'
    };
  };

  RECIPES.otp = function (o) {
    o = o || {};
    var w = o.w || 360;
    var boxes = o.length || 6, gap = o.gap === undefined ? 12 : o.gap, groupGap = o.groupGap === undefined ? 12 : o.groupGap;
    // 48px boxes are the web number; on a 320 screen shrink the BOX (never the gap below 6) so the row still fits.
    var bw = Math.min(o.boxW || 48, Math.max(28, Math.floor((w - 32 - (boxes - 1) * gap - groupGap) / boxes)));
    var total = boxes * bw + (boxes - 1) * gap + groupGap;
    var cells = [];
    var x = (w - total) / 2;
    for (var i = 0; i < boxes; i++) { cells.push(R(x, 0, bw, o.boxH || 56)); x += bw + gap + (i === 2 ? groupGap : 0); }
    return { cells: cells, boxW: bw, boxH: o.boxH || 56, gap: gap, groupGap: groupGap, totalW: total,
             notes: '6 boxes 44-48 x 56-64, gap 8-12, extra group gap after the 3rd; error = red border + 13px message; resend disabled until the timer.' };
  };

  RECIPES.gallery = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 1000, tier: o.tier });
    var sp = LY.split(f.content, { panes: [{ w: o.navW || 240 }, {}, o.preview ? { w: 440 } : null].filter(Boolean), gap: 0 });
    var idx = o.preview ? 2 : 1;
    var area = LY.rows(sp.panes[idx], [{ h: 44 }, { h: 52 }, {} ], 0);
    var inner = LY.container(area[2], { margin: 24 });
    var perRow = o.perRow || 6;
    var grid = LY.grid(inner, perRow, 16);
    var thH = Math.round(grid.colW * 0.75);
    var tiles = [], rows = Math.floor((inner.h - thH - 68) / (thH + 68));
    for (var r = 0; r < rows; r++) for (var c = 0; c < perRow; c++)
      tiles.push(R(grid[c].x, inner.y + r * (thH + 68), grid[c].w, thH + 68));
    return {
      frame: f,
      regions: { sideNav: sp.panes[0], canvas: sp.panes[idx], pathBar: area[0], toolbar: area[1], grid: inner, preview: o.preview ? sp.panes[2] : null },
      tiles: tiles, tileW: grid.colW, thumbH: thH, captionH: 68,
      notes: '6 x 176 (gap 16) / 5 x 216 / 4 x 276; thumbnail 4:3; checkbox appears only on hover/selection; filename in its own row 40-48, never over the thumbnail.'
    };
  };

  RECIPES.wizard = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier });
    var dw = o.dialogW || 720, dh = o.dialogH || 560;
    var dlg = R(f.content.x + (f.content.w - dw) / 2, f.content.y + Math.max(0, (f.content.h - dh) / 2), dw, dh);
    var sl = LY.slots.modal(dlg, { headerH: 60, footerH: 72, pad: 32 });
    var body = LY.rows(sl.body, [{ h: 64 }, {}, { h: 96 }], 16);
    return {
      frame: f, dialog: dlg, slots: sl,
      regions: { header: sl.header, progress: R(dlg.x, dlg.y + 60, dlg.w, 4), body: body[1], illustration: R(sl.body.x, body[1].y, 300, body[1].h), copy: R(sl.body.x + 332, body[1].y, sl.body.w - 332, body[1].h) },
      stepper: { node: 32, connector: 2, label: 12 },
      notes: 'dialog 640-880 (<=560 for simple forms); progress 3-4 h under the header OR stepper row 32-48; Back ghost + Continue primary (never two primaries); option cards 100% x 80-120.'
    };
  };

  RECIPES.commandPalette = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, tier: o.tier });
    var dw = o.dialogW || 640, dh = 420;
    var dlg = R(f.content.x + (f.content.w - dw) / 2, f.content.y + 96, dw, dh);
    var sl = LY.rows(dlg, [{ h: 56 }, {} ], 0);
    var groups = [8, 6];
    var rows = [], y = sl[1].y + 30;
    groups.forEach(function (n) { y += 30; for (var i = 0; i < n; i++) { rows.push(R(dlg.x + 4, y, dlg.w - 8, 42)); y += 42; } });
    return {
      frame: f, dialog: dlg, scrim: f.content,
      regions: { input: sl[0], results: sl[1], footer: R(dlg.x, dlg.y + dlg.h - 40, dlg.w, 40) },
      rows: rows, itemH: 42, kbd: { h: 22, w: 28 },
      notes: '560-672 wide, top offset 80-120 (never full width, never top:0); results max-height 320-400 with internal scroll; group headers mandatory; kbd chips right.'
    };
  };

  RECIPES.reportPrint = function (o) {
    o = o || {};
    var paper = o.paper === 'a4' ? { w: 794, h: 1123 } : { w: 816, h: 1056 };
    var pad = 72;
    return {
      frame: { w: o.w || 1440, h: o.h || 1200 },
      sheet: R(Math.round(((o.w || 1440) - paper.w) / 2), 72, paper.w, paper.h),
      measure: R(Math.round(((o.w || 1440) - paper.w) / 2) + pad, 72 + pad, paper.w - pad * 2, paper.h - pad * 2),
      canvas: R(0, 0, o.w || 1440, o.h || 1200),
      notes: 'letter 816x1056 / A4 794x1123 @96dpi, page padding 64-72 -> measure 672-730 (65-75 chars); KPI boxes 156-190x64-88; table header 2px rule + repeated on every page; page number centered; no color-only chart encodings.'
    };
  };

  RECIPES.mobileFeed = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 375, h: o.h || 1600, tier: 'mobile', chrome: { statusBar: 44, navBar: 44, tabbar: 49, safeBottom: 34 } });
    var cards = [], y = f.content.y + 8;
    for (var i = 0; i < 4; i++) {
      var cardH = 44 + Math.round((f.content.w - 32) * (o.aspect || 1)) + 44 + 76;
      cards.push(R(f.content.x + 16, y, f.content.w - 32, cardH)); y += cardH + 16;
    }
    return {
      frame: f, cards: cards, cardW: f.content.w - 32, mediaH: Math.round((f.content.w - 32) * (o.aspect || 1)),
      regions: { statusBar: f.statusBar, navBar: f.topBar, feed: { x: f.content.x, y: f.content.y, w: f.content.w, h: y - f.content.y }, tabBar: f.bottomBar },
      totalH: f.chrome.statusBar + f.chrome.navBar + (y - f.content.y) + f.chrome.tabbar + f.chrome.safeBottom,
      notes: 'cards 343 wide (or 375 full-bleed); header row 40-44, action row 44 (icons 24-28 gap 20), caption <=3 lines + "more"; inter-card gap 12-24; never put content in the bottom 34 inset.'
    };
  };

  RECIPES.mobileListDetail = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 375, h: o.h || 900, tier: 'mobile' });
    var inner = LY.container(f.content, { margin: 16 });
    var rowH = o.rowH || 72;
    var rows = [];
    for (var i = 0; i < Math.floor(f.content.h / rowH); i++) rows.push(R(f.content.x, f.content.y + i * rowH, f.content.w, rowH));
    return {
      frame: f, inner: inner, rows: rows, rowH: rowH,
      rowSlots: function (r) { return { thumb: R(r.x + 16, r.y + (r.h - 48) / 2, 48, 48), title: R(r.x + 76, r.y + 12, r.w - 76 - 40, 22),
                                        sub: R(r.x + 76, r.y + 36, r.w - 76 - 40, 20), chevron: R(r.x + r.w - 32, r.y + r.h / 2 - 8, 14, 16) }; },
      notes: 'rows: 1-line 44-48, 2-line 64, with thumbnail 76-88; separator starts at the text x (64 with avatar); sticky bottom action bar 56 + inset 34 for the primary CTA.'
    };
  };

  RECIPES.pricing = function (o) {
    o = o || {};
    var f = LY.frame({ w: o.w || 1440, h: o.h || 900, chrome: { statusBar: 0, navBar: 72, tabbar: 0, safeBottom: 0 } });
    var inner = LY.container(f.content, { margin: 40, maxW: 1200 });
    var n = o.plans || 3;
    var cols = LY.repeat(inner, n, 24);
    return {
      frame: f, inner: inner, columns: cols, colW: cols.cell,
      rows: { header: 112, price: 88, cta: 56, feature: 56 },
      notes: '3-4 columns of 240-320; header 88-120 (name 20 + price 32 + CTA 40); feature rows 48-64; highlighted column = 2px accent + 4% tint; never 9 columns at 1400.'
    };
  };

  /** §3.2 + §8 contact page: one promise, one form, and the details for the reader who would rather write by hand.
      The two-pane is 800/336 (2.4:1) with a 64 gutter — a narrower aside would read as a second column of the form,
      and an even split has no hierarchy. Fields live inside the form pane so the pane owns the vertical rhythm. */
  RECIPES.contact = function (o) {
    o = o || {};
    var w = o.w || 1440;
    var bandsSpec = o.bands || [
      { key: 'nav', h: 72 }, { key: 'intro', h: o.introH || 224 }, { key: 'form', h: o.formH || 560 },
      { key: 'faq', h: 400 }, { key: 'footer', h: 320 }
    ];
    var totalH = bandsSpec.reduce(function (a, b) { return a + b.h; }, 0);
    var fl = LY.flow(R(0, 0, w, totalH), { bands: bandsSpec });
    var inner = LY.container(R(0, 0, w, totalH), { margin: 40, maxW: 1200 });
    var b = fl.bands;
    var intro = R(inner.x, b.intro.y + 48, Math.min(inner.w, 720), b.intro.h - 96);
    var sp = LY.split(R(inner.x, b.form.y, inner.w, b.form.h), { panes: [{ w: o.formW || 800 }, {}], gap: 64 });
    var stack = LY.rows(sp.panes[0], [{ h: 76 }, { h: 76 }, { h: 148 }, { h: 44 }, { h: 56 }], 24);
    var aside = LY.repeat(R(sp.panes[1].x, sp.panes[1].y + 24, sp.panes[1].w, sp.panes[1].h - 48), 4, 16, 'y');
    var faqCols = LY.repeat(R(inner.x, b.faq.y + 64, inner.w, b.faq.h - 128), 2, 64);
    return {
      frame: { w: w, h: totalH }, bands: fl.bands, order: fl.order, inner: inner, totalH: totalH,
      regions: { nav: b.nav, intro: intro, form: sp.panes[0], aside: sp.panes[1], faq: faqCols[0], faqRight: faqCols[1], footer: b.footer },
      formFields: { pair: LY.repeat(stack[0], 2, 24), subject: stack[1], message: stack[2], consent: stack[3], submit: stack[4] },
      asideRows: aside, faqCols: faqCols,
      notes: 'intro measure 66-75ch inside a 720 column; form pane 800 · aside 336 at 2.4:1 with a 64 gutter (§8 floor is 2.2:1); '
        + 'name+email share one row of two 388 fields, message 148 (4 lines), consent 44, submit 56; the aside is four 116 '
        + 'rows — email, phone, studio, socials — because a reader who will not type still has to reach someone.'
    };
  };

  /** The fillable bands of a region plan: a region that *contains* another region is a pane (a scroll area, a
   *  column, a document body), not content. Filling it draws a paragraph underneath every child band — the measured
   *  `dashboard.content` defect, where prose ran behind the KPI cards, the chart and the table. A consumer of a plan
   *  must fill `LY.leaves()` and treat the rest as structure. Accepts the plan's `regions` object or an array. */
  LY.leaves = function (regions) {
    var list = [];
    if (Array.isArray(regions)) regions.forEach(function (r) { if (r) list.push(r); });
    else Object.keys(regions || {}).forEach(function (k) { var r = regions[k]; if (r) { r.name = k; list.push(r); } });
    return list.filter(function (a) {
      return !list.some(function (b) {
        if (b === a) return false;
        return b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + (b.w || 0) <= a.x + (a.w || 0) + 1 &&
               b.y + (b.h || 0) <= a.y + (a.h || 0) + 1 && (b.w * b.h) < (a.w * a.h);
      });
    });
  };

  /** One-screen height per tier. Exported because audit_design.js must know what "locked to the viewport" means. */
  function viewportHeight(tierName) {
    return tierName === 'mobile' ? 812 : (tierName === 'pad' ? 1112 : 900);
  }
  LY.viewportHeight = viewportHeight;

  /** Tier applicability = the collapse contract, made executable (layout-library §4).
      A desktop recipe asked to render at 375 must REFUSE with a pointer, never emit negative panes:
      silently inverting a pane is how "three-column app at phone width" nonsense reaches the canvas. */
  var APPLIES = {
    email3:          { tiers: ['web', 'pad'],        mobile: 'mobileListDetail' },
    calMonth:        { tiers: ['web', 'pad'],        mobile: 'mobileListDetail' },
    calWeek:         { tiers: ['web'],               pad: 'calMonth', mobile: 'mobileListDetail' },
    eventPopover:    { tiers: ['web', 'pad', 'mobile'] },
    dashboard:       { tiers: ['web', 'pad'],        mobile: 'mobileFeed' },
    listCrud:        { tiers: ['web', 'pad'],        mobile: 'mobileListDetail' },
    detailRecord:    { tiers: ['web', 'pad'],        mobile: 'mobileListDetail' },
    settings:        { tiers: ['web', 'pad', 'mobile'] },
    heroCenter:      { tiers: ['web', 'pad', 'mobile'] },
    heroSplit:       { tiers: ['web', 'pad'],        mobile: 'heroCenter' },
    landing:         { tiers: ['web', 'pad'],        mobile: 'heroCenter' },
    editorialLanding:   { tiers: ['web'],               pad: null, mobile: null },
    blogArticle:     { tiers: ['web', 'pad', 'mobile'] },
    docsLayout:      { tiers: ['web', 'pad'],        mobile: 'blogArticle' },
    chat:            { tiers: ['web', 'pad'],        mobile: 'mobileListDetail' },
    kanban:          { tiers: ['web', 'pad'],        mobile: null },
    ecomListing:     { tiers: ['web', 'pad'],        mobile: 'mobileFeed' },
    ecomPdp:         { tiers: ['web', 'pad'],        mobile: 'mobileListDetail' },
    cart:            { tiers: ['web', 'pad', 'mobile'] },
    checkout:        { tiers: ['web', 'pad'],        mobile: 'authCard' },
    authCard:        { tiers: ['web', 'pad', 'mobile'] },
    authSplit:       { tiers: ['web'],               pad: 'authCard', mobile: 'authCard' },
    otp:             { tiers: ['web', 'pad', 'mobile'] },
    gallery:         { tiers: ['web', 'pad'],        mobile: 'mobileFeed' },
    wizard:          { tiers: ['web', 'pad'],        mobile: 'authCard' },
    commandPalette:  { tiers: ['web', 'pad'],        mobile: null },
    reportPrint:     { tiers: ['web'],               pad: null, mobile: null },
    pricing:         { tiers: ['web', 'pad'],        mobile: null },
    contact:         { tiers: ['web'],               pad: 'authCard', mobile: 'authCard' },
    portfolioHome:   { tiers: ['web'],               pad: null, mobile: null },
    worksIndex:      { tiers: ['web'],               pad: null, mobile: null },
    journalIndex:    { tiers: ['web'],               pad: null, mobile: null },
    mobileFeed:      { tiers: ['mobile', 'pad'] },
    mobileListDetail:{ tiers: ['mobile', 'pad'] }
  };
  LY.applies = APPLIES;

  LY.recipes = RECIPES;
  LY.keys = function () { return Object.keys(RECIPES); };

  /** Run a recipe and freeze its regions for later lookups: LY.recipe('email3',{w:1440,h:900}) then LY.rect('composer').
      Tier is resolved from o.tier, else from o.w, else the recipe's primary tier; an inapplicable tier returns {err, use}. */
  LY.recipe = function (key, o) {
    var fn = RECIPES[key];
    if (!fn) return { err: 'unknown recipe ' + key, available: Object.keys(RECIPES) };
    o = Object.assign({}, o || {});
    var ap = APPLIES[key];
    if (!o.tier) o.tier = o.w ? LY.tierFor(o.w) : (ap ? ap.tiers[0] : 'web');
    if (ap && ap.tiers.indexOf(o.tier) < 0) {
      return { err: key + ' is not laid out for tier "' + o.tier + '" (defined for: ' + ap.tiers.join(', ') + ')',
               use: ap[o.tier] || null, tiers: ap.tiers,
               note: ap[o.tier] ? 'call LY.recipe(\'' + ap[o.tier] + '\') for this tier' : 'no ' + o.tier + ' layout exists — collapse to a single-column stack (layout-library §4)' };
    }
    LY._warn = [];
    var p = fn(o);
    p.key = key; p.tier = o.tier;
    if (LY._warn.length) p.overflow = LY.warnings();
    LY._plan = p;
    LY._ofs = { x: o.x0 || 0, y: o.y0 || 0 };
    return p;
  };
  LY.plan = function () { return LY._plan; };
  LY.rect = function (path) {
    var p = LY._plan; if (!p) return null;
    var node = (p.regions && p.regions[path]) || p[path];
    if (!node) return null;
    var o = LY._ofs || { x: 0, y: 0 };
    return R(node.x + o.x, node.y + o.y, node.w, node.h);
  };

  // ---------------------------------------------------------------- annotated skeleton drawing
  /** Draw a recipe as an annotated template board (page `12 · Screen recipes` of the file contract).
      Creates 1 region + 2 texts per call and keeps the rest in a queue: paste-safe against the 30s timeout. */
  LY.drawStart = function (key, host, o) {
    o = o || {};
    var plan = LY.recipe(key, { w: (o.w || host.width), h: (o.h || host.height), tier: o.tier });
    if (plan.err) return plan;
    var ofs = { x: host.x, y: host.y };
    // Painter's order by descending area: a recipe's regions overlap (a card contains a title band), and Penpot paints
    // later siblings on top, so drawing in key order buries the small region's border under the big region's tint.
    var keys = Object.keys(plan.regions || {}).sort(function (a, b) {
      var ra = plan.regions[a] || {}, rb = plan.regions[b] || {};
      return (rb.w || 0) * (rb.h || 0) - (ra.w || 0) * (ra.h || 0);
    });
    LY._draw = { plan: plan, host: host, keys: keys, i: 0, ofs: ofs,
                 tint: o.tint || '#EEF2F7', line: o.line || '#94A3B8', label: o.label || '#475569', done: false, drawn: 0 };
    return { queued: keys.length, regions: keys };
  };
  LY.drawStep = function (perCall) {
    var d = LY._draw;
    if (!d || d.done) return { done: true, drawn: d ? d.drawn : 0 };
    perCall = perCall || 3;
    var p = d.plan;
    while (perCall-- > 0 && d.i < d.keys.length) {
      var k = d.keys[d.i++];
      var r = p.regions[k];
      // A recipe collapses a region to h=0 when the tier has no room for it (`listCrud.bulkBar`); Penpot refuses
      // resize(…, 0), and a zero-area plate carries no information anyway, so it is skipped and named in `skipped`.
      if (!r || !r.w || !r.h) { (d.skipped || (d.skipped = [])).push(k + '(' + (r ? r.w + 'x' + r.h : 'no rect') + ')'); continue; }
      var b = storage.mkAbsBoard('region·' + k, d.ofs.x + r.x, d.ofs.y + r.y, r.w, r.h, d.tint, 4);
      b.strokes = [{ strokeColor: d.line, strokeOpacity: 1, strokeWidth: 1, strokeAlignment: 'inner' }];
      b.fills = [{ fillColor: d.tint, fillOpacity: 0.5 }];
      storage.absMount(d.host, b, d.ofs.x + r.x, d.ofs.y + r.y);
      var lt = storage.mkText(k + '  ' + r.w + '×' + r.h, 0, 0, 12, d.label, 500);
      storage.absMount(b, lt, d.ofs.x + r.x + 8, d.ofs.y + r.y + 6);
      d.drawn++;
    }
    if (d.i >= d.keys.length) {
      d.done = true;
      if (p.notes) {
        var nt = storage.mkText(p.notes, 0, 0, 12, d.label, 400);
        storage.absMount(d.host, nt, d.ofs.x, d.ofs.y + (p.frame && p.frame.h ? p.frame.h : d.host.height) + 12);
      }
    }
    return { drawn: d.drawn, left: d.keys.length - d.i, done: d.done, skipped: d.skipped || [] };
  };

  /** Put the tier's grid on a board as **native Penpot guides**: the column grid (margin + gutter straight from
   *  `LY.TIERS`) and a horizontal ruler guide at the first-viewport line, so the reviewer sees the fold without a
   *  drawn rectangle. Every screen board must carry these — a board laid out on a grid it never declared is the thing
   *  the audit used to be blind to (gate G15, design-guide §12).
   *  o: { tier, rows, viewport, foldRuler, color, rowColor } */
  LY.guides = function (host, o) {
    o = o || {};
    var name = o.tier || host.foldTier || 'web';
    var t = LY.tier(name);
    var res = { board: host.name, tier: name, margin: t.margin, gutter: t.gutter };
    if (!storage.NL || !storage.NL.guide) return { err: 'LY.guides needs native_layout.js loaded (NL.guide)' };
    var col = storage.NL.guide(host, { axis: 'column', margin: t.margin, gutter: t.gutter, color: o.color || '#8B5CF6' });
    if (col.err) res.err = col.err; else res.columns = col.guides;
    if (o.rows) {
      var rw = storage.NL.guide(host, { axis: 'row', margin: t.margin, gutter: t.gutter, color: o.rowColor || '#0EA5E9' });
      if (rw.err) res.rowErr = rw.err; else res.rows = rw.guides;
    }
    if (o.foldRuler !== false) {
      var vh = o.viewport || viewportHeight(name);
      var ru = storage.NL.rulerGuide(host, Math.min(vh, Math.round(host.height)), 'horizontal');
      if (ru.err) res.rulerErr = ru.err; else res.fold = ru.position;
    }
    var c = storage.NL.guideCount(host);
    res.guides = c.guides; res.ruler = c.ruler;
    return res;
  };

  /** Fold marker: 2px accent first-viewport outline over a long **baseline-width** board. Its absence there is signature
      `viewport_locked`; its presence says "the design scrolls, this is only what the user sees before scrolling".
      A PageRoot is a canvas, not a screen: a 1440 outline at its origin annotated empty page space and drew an orange
      edge across the header (measured), so a root returns null instead of growing a marker. */
  LY.fold = function (host, tier) {
    if (/-PageRoot$/i.test(String(host.name || ''))) return null;
    var name = tier || host.foldTier || 'web';
    var t = LY.tier(name);
    var vh = viewportHeight(name);
    // Replace, never stack: a rebuild calls fold() again and an older marker at the same anchor would paint a second
    // ruler and a second label over the same pixels (audit_layout's text_overlap_x). The marker is annotation only,
    // so removing every fold· at this anchor — nested or page-level — is safe.
    try {
      var pageRoot = (penpot.currentPage && penpot.currentPage.root) || penpot.root;
      var stale = [];
      var scan = function (n) {
        (n.children || []).forEach(function (c) {
          var cx = 1e9, cy = 1e9;
          try { cx = c.x; cy = c.y; } catch (e) {}
          if (/^fold·/.test(c.name || '') && Math.abs(cx - host.x) <= 2 && Math.abs(cy - host.y) <= 2) stale.push(c);
          scan(c);
        });
      };
      scan(pageRoot);
      stale.forEach(function (c) { try { c.remove(); } catch (e) {} });
    } catch (e) {}
    var b = storage.mkAbsBoard('fold·' + t.w + '×' + vh, host.x, host.y, Math.min(t.w, host.width), vh, null, 0);
    b.strokes = [{ strokeColor: '#F97316', strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner' }];
    // The marker is a *sibling* of the board it annotates (overlaying it would make the board its own parent and the
    // audit would judge the marker as content). A board always has a parent on a real page; the fallback keeps the
    // helper usable for a detached board.
    // EXCEPTION — a PageRoot has no usable sibling slot: its parent is `page.root`, which refuses layout children
    // (absMount throws on `layoutChild.absolute`) and where any top-level shape is audit_layout's `root_stray`. A page
    // root therefore carries its own marker; designPage's fold hunt accepts a `fold·` at any depth and both auditors
    // skip ANNO subtrees, so judging is unchanged.
    var par = /-PageRoot$/.test(host.name || '') ? host
      : (host.parent || (penpot.currentPage && penpot.currentPage.root) || penpot.root);
    if (par) storage.absMount(par, b, host.x, host.y);
    var lt = storage.mkText('fold · ' + (host.height - vh) + 'px more below the fold', 0, 0, 12, '#F97316', 600);
    storage.absMount(b, lt, b.x + 12, b.y + b.height - 24);
    return b;
  };

  storage.LY = LY;
  return { seeded: 'LY', recipes: LY.keys(), primitives: ['frame', 'container', 'grid', 'split', 'rows', 'flow', 'repeat', 'snap', 'onScale', 'tier',
           'BREATH', 'breath', 'breathLevels'],
           slots: Object.keys(LY.slots), draw: ['drawStart', 'drawStep', 'fold'] };
})();
