// foundations_engine.js — `storage.FN`: project the Foundations / Color-in-use boards OUT OF THE LIBRARY RECORDS.
//
// WHY THIS EXISTS. Those boards used to be hand-composed: a JS palette mirror for the hexes, and a typed array of row
// heights per board (`[56,136,40,40]`, `104 not 96 because swatch 48 + key 19 + hex 16 + 2×8 gaps`). Every one of those
// numbers was a guess the auditor then rejected, so a rebuild costed an audit round-trip per board — the single most
// expensive loop in the whole workflow, paid in model tokens. `FN` removes the two inputs that make that loop exist:
//
//   1. VALUES — every colour, type step, spacing, radius and shadow is read from the live token records
//      (`TK.declared()`). A mirror is never consulted, and a missing kind is a REFUSAL, not a fallback: `FN` will not
//      draw a value the set does not declare, because that is what `paint_off_palette` / `type_off_ramp` exist to catch.
//   2. GEOMETRY — a board is a **hug** column (`sizing:{h:'fix', v:'auto'}`) of hug rows, so its height is the sum
//      Penpot itself computes (`padT + Σh + (n−1)·gap + padB`, native-layout trap #2 — the same formula `auditFlow`
//      re-derives). No caller passes a height array, so there is nothing to get wrong and nothing to re-measure.
//
// Editorial content (which sentence explains a tone, which series a chart uses) is DATA, in `FN.prose`, replaced by
// `FN.setContent()` — changing what a board says must never mean editing how it is drawn.
//
// Call shape (after the G1 seed order, so TK/CF/NL/LY are live). One board per stage, per call — see §7 for why.
// **Bind a board before projecting the next one**: the shelf reads the live page, so a board that grows at bind time
// (`grew` in the record) would otherwise overlap whatever was already shelved under it.
//   storage.FN.kinds()                                  → the projectable boards
//   storage.FN.project({ page:'01.03 · …', kind:'spacing' })   // draws + shelves it, binds nothing
//   storage.FN.bindNext({ page:'01.03 · …' })           // binds + gates the next board, until `allBound`
//   storage.FN.check('01.03 · …')                       // both page gates + what FN recorded
//   storage.FN.audit()                                  → what the projections cost: findings + repair iterations
return (function () {
  const NL = storage.NL, LY = storage.LY, CF = storage.CF, TK = storage.TK;
  if (!NL || !LY || !CF || !TK) return { err: 'load seed_storage + layout_engine + component_factory + native_layout + token_engine first (gate G1 order)' };

  const FN = {};
  storage.FN = FN;
  FN.VERSION = '1.3.0';   // 1.1.0 = the provenance contract (§6b): nl:fn stamps, FN.CHAPTER/EXEMPT, FN.coverage, restamp
                          // 1.2.0 = the page-binding contract (FN.use): open → settle → verify → refuse on every write
                          //         path, plus FN.strays (a board outside the PageRoot is still gated), the footer
                          //         re-anchor in fitRoot, and editorial copy that lives in the file (nl:prose) and a
                          //         projector that REFUSES a column header it has no sentence for (§3)
                          // 1.3.0 = state layers draw their wash from the DECLARED on-surface token (the `onDark` shade
                          //         is brand-fill-only — on a neutral inverse ground it is a visual no-op), a content
                          //         alpha dims copy instead of faking a container wash, every tile gets a hairline so
                          //         a ground-coloured plate still reads, and every board that draws editorial rules
                          //         stamps them (radius · state layers · data colors)

  // ---------- layout contract (all four numbers must be declared spacing, asserted in FN.source) ----------
  FN.layout = { margin: 80, pad: 32, gap: 16, cellGap: 8, canvas: 1920 };
  const up8 = (n) => Math.max(8, Math.round(n / 8) * 8);

  // ---------- 1 · the value source, with a refusal contract ----------
  /** `FN.setFilter` (set by `FN.project` from `{ set: '<system> · Dark' }`) scopes a projection to ONE token set: a
      two-scheme file declares the same names in both `· Core` and `· Dark`, so the colour boards are projected once per
      set (color-schemes.md §3) instead of drawing the merged superset. TK's cache is never mutated by the filter. */
  FN.source = function (force) {
    const all = TK.declared(force);
    if (!all.ok) return { err: 'token set is missing ' + all.missing.join(', ') + ' — seed it (gate G9); FN never draws a value the set does not declare', counts: all.counts };
    const d = FN.setFilter ? Object.assign({}, all, { colors: all.colors.filter((c) => c.set === FN.setFilter) }) : all;
    if (FN.setFilter) {
      d.counts = Object.assign({}, all.counts, { colors: d.colors.length });
      d.missing = Object.keys(d.counts).filter((k) => !d.counts[k]);
      if (!d.colors.length) return { err: 'no colour token is declared in the set “' + FN.setFilter + '” — active sets are ' + all.sets.join(', '), sets: all.sets };
    }
    const si = {}; all.spaces.forEach((s) => { si[s.value] = s.name; });
    ['pad', 'gap', 'cellGap'].forEach((k) => {
      const v = FN.layout[k];
      if (!si[v]) return FN.layout[k] = (TK.snapSpace(v) || {}).value || v;
    });
    FN.spaces = si;
    FN.hexOf = {}; d.colors.forEach((c) => { FN.hexOf[c.name] = c.hex; });
    FN.steps = {}; all.types.forEach((t) => { FN.steps[t.name] = t; });
    return d;
  };
  FN.color = (name) => (FN.source().colors || []).filter((c) => c.name === name)[0] || null;
  /** The tone triples are a naming convention, not a list: `color.X` (hue) plus its ink and wash steps.
      Both spellings the skill documents are read — `design-guide.md` §4.1 names them `XInk`/`XSoft` (what `TK.seed`
      and `CF.P` use) and a set may equally declare `X-ink`/`X-wash`. A lowercase name with no separator never matches,
      so a tone that is simply called `pink` is not misread as `pi` + `nk`. */
  FN.tones = function () {
    const d = FN.source(); if (d.err) return [];
    const stepOf = function (n) {
      const k = n.match(/^(.+)[-_](ink|wash|soft)$/i);
      if (k) return [k[1], k[2].toLowerCase() === 'soft' ? 'wash' : k[2].toLowerCase(), k[0].slice(k[1].length)];
      const c = n.match(/^(.*[a-z])(Ink|Wash|Soft)$/);
      if (c) return [c[1], c[2] === 'Soft' ? 'wash' : c[2].toLowerCase(), c[2]];
      return null;
    };
    const by = {};
    d.colors.forEach(function (col) {
      const n = String(col.name).replace(/^color\./, ''); const s = stepOf(n); if (!s) return;
      const t = by[s[0]] = by[s[0]] || { steps: {}, suffixes: {} };
      t.steps[s[1]] = col.hex; t.suffixes[s[1]] = s[2];
    });
    return Object.keys(by).filter((k) => by[k].steps.ink && by[k].steps.wash && d.colors.some((c) => c.name === 'color.' + k))
      .map((k) => { const h = d.colors.filter((c) => c.name === 'color.' + k)[0];
        return { tone: k, hue: h.hex, hueName: h.name, ink: by[k].steps.ink, wash: by[k].steps.wash,
          inkSuffix: by[k].suffixes.ink, washSuffix: by[k].suffixes.wash }; });
  };
  /** The `ink` step of a tone by name — the danger green's copy colour, whichever suffix convention the set uses. */
  FN.inkOf = function (tone) {
    const t = FN.tones().filter((x) => x.tone === tone)[0]; if (t) return t.ink;
    const d = FN.source(); const c = (d.colors || []).filter((x) => x.name === 'color.' + tone + '-ink' || x.name === 'color.' + tone + 'Ink')[0];
    return c ? c.hex : null;
  };

  // ---------- 2 · WCAG, derived ----------
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  FN.ratio = (a, b) => { const l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
  FN.verdict = (r, size) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : size >= 24 && r >= 3 ? 'AA large' : null);
  /** The hex a state layer resolves to: `base` + `tint` at alpha `a`, computed so the board can caption the step it
      is showing instead of asking a human to tell two near-blacks apart in a screenshot. */
  FN.over = function (base, tint, a) {
    const px = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
    const b = px(base), t = px(tint);
    return '#' + b.map((v, i) => ('0' + Math.round(v + (t[i] - v) * (a === undefined ? 1 : a)).toString(16)).slice(-2)).join('');
  };

  // ---------- 3 · the editorial table (content, never geometry) ----------
  FN.prose = {
    samples: [[30, 'Brand'], [60, 'Brand'], [1e9, 'R']], defaultSample: 'Brand Agency copy',
    usage: {}, rules: {}, notes: {},
    seriesTones: null,      // null = take every declared tone hue, capped at 6
    strokeWidths: [1, 2],   // no stroke-width token exists; declared here so the board is still data
    maxPass: 12, maxFail: 6
  };
  FN.setContent = function (o) { Object.keys(o || {}).forEach((k) => { if (k === 'usage' || k === 'rules' || k === 'notes') Object.assign(FN.prose[k], o[k]); else FN.prose[k] = o[k]; }); return FN.prose; };
  /** Editorial copy is data, and `FN.prose` is JS memory — so a projection writes the sentences it used into the board
      (`nl:prose`) and the next session reads them back before it builds anything. Measured 2026-10-21: a re-seed wiped
      the usage table and `Semantic roles` shipped a column header over six empty cells; every gate read CLEAN, because
      an empty cell is not a geometry, token or contrast defect. Never rely on memory for what a board says. */
  FN.stampProse = function (board, used) {
    try { NL.stamp(board, { prose: JSON.stringify(used) }); return true; } catch (e) { return false; }
  };
  FN.readProse = function (page) {
    const got = { usage: {}, rules: {}, notes: {} };
    FN.boards(page).forEach(function (b) {
      let raw = null; try { raw = NL.readStamp(b).prose; } catch (e) {}
      if (!raw) return;
      let o = null; try { o = JSON.parse(String(raw)); } catch (e) { return; }
      ['usage', 'rules', 'notes'].forEach(function (k) { if (o && o[k]) Object.assign(got[k], o[k]); });
    });
    return got;
  };
  /** Restore the page's own copy into `FN.prose` (what is already typed by hand wins over what the file says). */
  FN.recoverProse = function (page) {
    const got = FN.readProse(page), n = {};
    ['usage', 'rules', 'notes'].forEach(function (k) {
      const fresh = Object.keys(got[k]).filter((x) => !FN.prose[k][x]);
      fresh.forEach((x) => { FN.prose[k][x] = got[k][x]; });
      n[k] = { fromFile: fresh.length, alreadySet: Object.keys(got[k]).length - fresh.length };
    });
    return n;
  };
  FN.sampleFor = function (size) { const t = FN.prose.samples.find((s) => size >= s[0]); return t ? t[1] : FN.prose.defaultSample; };

  // ---------- 4 · composition: hug everywhere the axis is not the design choice ----------
  const seq = { n: 0 };
  const nm = (s) => String(s).replace(/\s+/g, ' ').replace(/\//g, '·').replace(/\n/g, ' ').trim().slice(0, 40);

  /** A board is a hug column: the caller chooses a WIDTH (that is the design decision), Penpot chooses the height. */
  FN.board = function (name, w, o) {
    o = o || {};
    return NL.frame(nm(name), { x: 0, y: 0, w: w, h: up8(200), dir: 'column', gap: FN.layout.gap,
      pad: { x: FN.layout.pad, y: FN.layout.pad }, sizing: { h: 'fix', v: 'auto' }, clip: false,
      fill: o.fill === undefined ? FN.surface() : o.fill, radius: o.radius === undefined ? CF.radius('md') : o.radius });
  };
  /** The default ground: the first declared surface container, falling back to the first non-copy colour. */
  FN.surface = function () {
    const d = FN.source(); if (d.err) return '#FFFFFF';
    const pick = d.colors.filter((c) => !c.copy)[0];
    return (d.colors.filter((c) => /container|surface/.test(c.name))[0] || pick || { hex: '#FFFFFF' }).hex;
  };
  FN.row = function (b, o) {
    o = o || {};
    const f = NL.frame(nm(o.name || 'row·' + (++seq.n)), { h: 8, dir: o.dir || 'row', gap: o.gap === undefined ? FN.layout.gap : o.gap,
      align: o.align || 'start', justify: o.justify, pad: o.pad, sizing: { h: 'fill', v: 'auto' }, clip: false });
    NL.add(b, f, 'fill', 'auto');
    return f;
  };
  /** A cell confines a variable-width child to a declared width — the one box size FN still chooses, because a
      column width is the layout, not the content. Height hugs. */
  FN.cell = function (parent, w, o) {
    o = o || {};
    const f = NL.frame(nm(o.name || 'cell·' + (++seq.n)), { w: w, h: 8, dir: o.dir || 'column',
      gap: o.gap === undefined ? FN.layout.cellGap : o.gap, align: o.align || 'start', justify: o.justify,
      pad: o.pad, fill: o.fill, radius: o.radius, sizing: { h: 'fix', v: 'auto' }, clip: false });
    if (parent) NL.add(parent, f, 'fix', 'auto');
    return f;
  };
  /** A role name is a convenience, not a claim: it resolves to a declared step, and only if the set genuinely names
      that step. Otherwise the requested (size, weight) is looked up in the ramp — and `storage.mkText` snaps at birth
      (`TK.snapType`), so a step nobody declared can still never reach the canvas (`type_off_ramp` stays silent). */
  FN.roles = { head: ['type.h3', 22, 600], label: ['type.label', 13, 600], axis: ['type.axis', 11, 500], body: ['type.body', 14, 400] };
  FN.step = function (name, size, weight) {
    if (FN.steps[name]) return Object.assign({ name: name }, FN.steps[name]);
    const bySize = TK.stepFor(size, weight, null, null);
    if (bySize && FN.steps[bySize]) return Object.assign({ name: bySize }, FN.steps[bySize]);
    return null;
  };
  /** Copy drawn at a DECLARED ramp step: family, size, weight, leading and tracking all come from the record, so
      `type_off_ramp` cannot fire and `TK.bindBoard` has an exact match to bind. */
  FN.text = function (parent, str, stepName, o) {
    o = o || {};
    const d = FN.source(); if (d.err) return null;
    const role = FN.roles[stepName] || [];
    const st = FN.step(stepName, o.size || role[1], o.weight || role[2] || 400);
    const size = st ? st.size : (o.size || role[1] || 14);
    const t = NL.label(String(str), { size: size, weight: st ? st.weight : (o.weight || role[2] || 400),
      color: o.color || FN.ink(), name: nm(o.name || (o.axis ? 'axis · ' + str : str)) });
    if (st && st.family) {
      // `TK.typeIndex` lowercases the family, so resolve it case-insensitively against the installed fonts.
      const want = String(st.family).toLowerCase();
      const f = penpot.fonts.findByName(st.family) || Array.from(penpot.fonts.all || []).filter((x) => String(x.name).toLowerCase() === want)[0] || null;
      if (f) { const v = f.variants.find((x) => String(x.fontWeight) === String(st.weight)) || f.variants.find((x) => String(x.fontWeight) === '400'); try { f.applyToText(t, v); } catch (e) {} }
      try { t.fontSize = String(st.size); } catch (e) {}
      if (st.leading) try { t.lineHeight = String(st.leading); } catch (e) {}
      if (st.tracking !== null && st.tracking !== undefined) try { t.letterSpacing = String(st.tracking); } catch (e) {}
    }
    if (parent) NL.add(parent, t, o.h || 'auto', o.v || 'auto');
    return t;
  };
  FN.ink = function (ground) {
    const d = FN.source(); const g = ground || FN.surface();
    const copy = (d.colors || []).filter((x) => x.copy);
    const best = copy.slice().sort((a, b) => FN.ratio(b.hex, g) - FN.ratio(a.hex, g))[0];
    return best ? best.hex : '#111111';
  };
  /** The faintest declared COPY colour that still clears 4.5:1 on `ground` — measured, never name-matched.
      (Measured 2026-10-21: a `/muted|faint/` name pick grabbed `color.on-inverse-muted` #ACACAC and painted it on the
      light ground at 2.13:1, i.e. the projector reproduced the exact defect `contrast` exists to catch.) */
  FN.muted = function (ground) {
    const d = FN.source(); const g = ground || FN.surface();
    const legible = (d.colors || []).filter((x) => x.copy && FN.ratio(x.hex, g) >= 4.5);
    const faint = legible.slice().sort((a, b) => FN.ratio(a.hex, g) - FN.ratio(b.hex, g))[0];
    return faint ? faint.hex : FN.ink(g);
  };
  FN.plate = function (parent, w, h, o) {
    o = o || {};
    const r = NL.plate(nm(o.name || 'plate·' + (++seq.n)), { w: w, h: h, fill: o.fill, radius: o.radius, stroke: o.stroke, strokeW: o.strokeW, opacity: o.opacity, shape: o.shape });
    if (parent) NL.add(parent, r, o.h || 'fix', o.v || 'fix');
    return r;
  };
  FN.head = function (b, title, sub) {
    // Title and caption **stack, always**. Side by side they need a width budget, and `CF.estW` is an estimate: on the
    // probe a 22px semibold title measured 376 and rendered 484, so the caption escaped the row (`out_of_bounds`).
    // A hug column cannot overflow — the platform wraps each line, so there is nothing to predict.
    const r = FN.row(b, { name: 'row·head', dir: 'column', align: 'start', gap: 4 });
    FN.text(r, title, 'type.h3', { weight: 600, size: 22 });
    if (sub) FN.text(r, sub, 'type.caption', { size: 13, color: FN.muted(), axis: true, name: 'axis · head' });
    return r;
  };

  /** Force Penpot to recompute every hug in the subtree. Call this after the last child is added and again before
      gating — a board that looks correct in JS can still be frozen at placeholder heights on the canvas.
      Measured 2026-10-21 on the probe: `Palette` shipped with `row·head` at h=6 while its two texts render 44 + 4 + 20
      = 68, and the PNG export proves the overlap is real, not a stale read. A hug frame is recomputed only when the
      layout engine sees it dirtied, so text children that grow *after* the frame's last pass (the font application
      during token binding) leave the parent at the placeholder height. Writing any flex property — even the value it
      already holds — re-runs the pass: `cell.flex.topPadding = cell.flex.topPadding` took a frozen 66 to its true 99
      inside the same call. `verticalSizing='fix'; resize(); ='auto'` works too but is three writes and can pin a size. */
  FN.relayout = function (board) {
    let touched = 0, failed = 0;
    (function walk(s) {
      const kids = s.children ? Array.from(s.children) : [];
      kids.forEach(walk);                                  // bottom-up: a parent must recompute from fresh children
      if (!s.flex) return;
      try { s.flex.topPadding = s.flex.topPadding; touched++; } catch (e) { failed++; }
    })(board);
    return { touched: touched, failed: failed };
  };

  // ---------- 5 · placement: the shelf is measured from the page, never remembered in JS ----------
  FN.pageRoot = function (page) {
    const p = storage.pg(page); if (!p) return null;
    return Array.from(p.root.children || []).filter((s) => /-PageRoot$/.test(s.name))[0] || null;
  };
  FN.lanes = function (page, o) {
    const root = FN.pageRoot(page); if (!root) return null;
    const ignore = (o && o.ignore) || {};
    const full = root.width - FN.layout.margin * 2, half = Math.floor((full - FN.layout.gap * 2) / 2 / 8) * 8;
    const st = { full: full, half: half, y: [FN.layout.margin * 2.6, FN.layout.margin * 2.6] };
    Array.from(root.children || []).forEach((s) => {
      if (/-Header$|-Footer$/.test(String(s.name)) || ignore[s.id]) return;
      const bottom = Math.round(s.y + s.height) + FN.layout.gap * 2, x = Math.round(s.x);
      if (Math.round(s.width) > half) { st.y[0] = Math.max(st.y[0], bottom); st.y[1] = Math.max(st.y[1], bottom); }
      else { const c = x >= FN.layout.margin + half ? 1 : 0; st.y[c] = Math.max(st.y[c], bottom); }
    });
    return st;
  };
  /** Put one board of width `w` and height `h` on the shelf and advance it. Shared by FN.place and FN.reflow so the
      two can never disagree about column choice or advance. Advance by EXACTLY the declared gap: rounding the next top
      up to a multiple of 8 widens the measured gap to 33-39 px and `off_scale_gap` then fires BETWEEN two FN boards
      (measured: 36) — the shelf is spacing the auditor reads, so it must be arithmetic on the scale. */
  FN.shelfStep = function (st, w, h) {
    const col = w > st.half ? 0 : (st.y[0] <= st.y[1] ? 0 : 1);
    const x = col === 0 ? FN.layout.margin : FN.layout.margin + st.half + FN.layout.gap * 2;
    const y = st.y[col];
    st.y[col] = Math.round(y + h) + FN.layout.gap * 2;
    if (w > st.half || col === 1) { const m = Math.max(st.y[0], st.y[1]); if (w > st.half) { st.y[0] = m; st.y[1] = m; } else st.y[0] = Math.max(st.y[0], m); }
    return [x, y];
  };
  /** The page must be OPEN before anything is written into it, and `openPage` only rebinds `penpot.currentPage` once it
      settles. Measured twice on 2026-10-21: three page audits issued in one call all reported the page that was already
      open, and `FN.project` onto a scaffolded `02.01-PageRoot` died with `[PENPOT PLUGIN] Value not valid: Cannot modify a
      page that is not open` because the build ran in the same turn as the switch. So every FN write path calls this:
      open → settle once (no poll loop, the plugin timer is a coin-flip) → VERIFY → refuse if the binding did not arrive.
      A refusal costs one extra `execute_code` call; writing into the wrong page costs the file. */
  FN.use = async function (page) {
    const want = String(page);
    const now = String((penpot.currentPage && penpot.currentPage.name) || '');
    if (now === want) return { ok: true, page: want };
    const p = storage.pg(want); if (!p) return { err: 'no page ' + want };
    penpot.openPage(p);
    try { await (storage.sleep ? storage.sleep(700) : new Promise((r) => setTimeout(r, 700))); } catch (e) {}
    const open = String((penpot.currentPage && penpot.currentPage.name) || '');
    if (open !== want) return { err: 'the page switch did not settle inside this call: currentPage is "' + open + '", wanted "' + want + '" — re-issue this FN call, the switch arrives on the next execute_code turn', wait: open, want: want };
    return { ok: true, page: want, opened: true };
  };
  FN.place = function (page, board, w) {
    const root = FN.pageRoot(page); if (!root) return { err: 'no PageRoot on ' + page + ' (run scaffold first)' };
    const st = FN.lanes(page);
    const at = FN.shelfStep(st, w, Math.round(board.height));
    try { storage.absMount(root, board, at[0], at[1]); }
    catch (e) { return { err: 'absMount into ' + page + ' failed: ' + String(e).slice(0, 70) + ' — a PageRoot must be a FLEX board (storage.mkAbsBoard), or every pinned child throws on layoutChild=null' }; }
    // Declare the coordinate as derived. The shelf's top is `previous bottom + gap`, and a hug bottom is a font-metric
    // sum, so the y lands off the 4px grid (measured: y=3249, 4029, 5886) — snapping it would instead put the GAP off
    // `LY.SPACE`, which is the number the designer actually chose. `off_grid` therefore skips an axis FN stamped.
    try { NL._note(board, { shelfPlaced: true }); NL.stamp(board, { shelf: '1' }); } catch (e) {}
    return { at: at, h: Math.round(board.height) };
  };
  /** Re-shelve every projected board on the page from its LIVE height. This is what makes the shelf honest: a board's
      height is provisional **inside the call that built it** (measured 2026-10-21: `Palette` returned h=726 at project
      time and settled at 1052 on the next call, because the frozen hugs only recompute once the layout engine runs
      again — +62 for the head and +33 per swatch row). Shelving the next board against 726 would bury it under the
      first, so `FN.project` reflows the page before placing, and `FN.bindNext` reflows again if the board grew. */
  FN.reflow = function (page) {
    const root = FN.pageRoot(page); if (!root) return { err: 'no PageRoot on ' + page };
    const mine = FN.projected(page);
    const ignore = {}; mine.forEach((s) => { ignore[s.id] = 1; });
    const st = FN.lanes(page, { ignore: ignore });
    let moved = 0;
    for (let i = 0; i < mine.length; i++) {
      const b = mine[i], w = Math.round(b.width), at = FN.shelfStep(st, w, Math.round(b.height));
      if (Math.round(b.x) !== at[0] || Math.round(b.y) !== at[1]) {
        try { storage.absMount(root, b, at[0], at[1]); moved++; } catch (e) { return { err: 'reflow failed on ' + b.name + ': ' + String(e).slice(0, 60) }; }
      }
    }
    const fit = FN.fitRoot(page);
    return { boards: mine.length, moved: moved, fit: fit.want || fit.err, lanes: st };
  };
  /** Fit the PageRoot to what the shelf actually holds. The layout audit measures every board against the root board,
      so a root still at its scaffold height reports each lower board as `out_of_bounds` (measured 2026-10-21 on the
      probe: four boards escaping the bottom by 587-3763px). The height is derived from the deepest child, never typed. */
  FN.fitRoot = function (page) {
    const root = FN.pageRoot(page); if (!root) return { err: 'no PageRoot on ' + page };
    let maxB = 0, footer = null;
    Array.from(root.children || []).forEach((s) => {
      if (/-Header$/.test(String(s.name))) return;
      // The scaffold's footer is anchored to the page height the SCAFFOLD guessed. When the projection fits the root to
      // what the shelf actually holds (measured 2026-10-21: 1184 → 816 on `02.01`), an anchor left where it was hangs
      // outside the page and reports `out_of_bounds` + `off_scale_gap` — a defect of this function, not of the board.
      if (/-Footer$/.test(String(s.name))) { footer = s; return; }
      maxB = Math.max(maxB, Math.round(s.y + s.height));
    });
    const top = Math.round(root.y);
    const fy = maxB + FN.layout.gap * 2;                        // the GAP is the decision (§1: it must land on LY.SPACE);
    const fh = footer ? Math.round(footer.height) : 0;          // snapping this coordinate would make it 35, off scale
    const want = up8(Math.max(maxB, fy + fh) - top + FN.layout.margin);
    const was = Math.round(root.height);
    if (was !== want) { try { root.resize(root.width, want); } catch (e) { return { err: 'root resize failed: ' + String(e).slice(0, 60) }; } }
    if (footer && Math.round(footer.y) !== fy) {
      try { storage.absMount(root, footer, Math.round(footer.x), fy); } catch (e) { return { err: 'footer re-anchor failed: ' + String(e).slice(0, 60) }; }
      // Same declaration the shelf boards carry: this coordinate is derived (`previous bottom + gap` over a hug sum),
      // so `off_grid` must not judge it as typed. It is NOT an `nl:fn` stamp, so it launders no projection: coverage
      // and `foreign` only read `nl:fn`, which only `FN.project` writes.
      try { NL.stamp(footer, { shelf: '1' }); } catch (e) {}
    }
    return { was: was, want: want, footer: footer ? fy : null };
  };

  // ---------- 6 · the projectors ----------
  // Each one reads records and returns { board, info }. None of them takes a height.

  FN.palette = function (o) {
    o = o || {}; const page = o.page; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(page) || { full: 1760, half: 864 }; const W = o.w || st.full;
    const b = FN.board(o.name || 'Palette', W);
    FN.head(b, 'Palette · every declared colour token', d.colors.length + ' colour tokens in ' + d.sets.join(' + ') + ' · nothing here is typed');
    const COLW = 320, PER = 5;
    // A swatch painted in the ground colour is invisible (measured: `color.surface` #faf7f6 on the #faf7f6 board reads as
    // an empty cell in the export). Every swatch therefore gets the declared border as a hairline edge.
    const edge = ((d.colors.filter((c) => /^color\.border$/.test(c.name))[0] || d.colors.filter((c) => /border/.test(c.name))[0] || {}).hex) || null;
    let n = 0, bound = 0;
    for (let i = 0; i < d.colors.length; i += PER) {
      const host = FN.row(b, { name: 'row·palette·' + Math.floor(i / PER), align: 'start', gap: FN.layout.gap });
      d.colors.slice(i, i + PER).forEach(function (c) {
        const cell = FN.cell(host, COLW, { name: 'cell·' + c.name.replace(/^color\./, '') });
        const sw = FN.plate(cell, COLW, 48, { name: 'swatch·' + c.name.replace(/^color\./, ''), fill: c.hex, radius: CF.radius('sm'), stroke: edge, strokeW: edge ? 1 : 0 });
        if (sw.fills && sw.fills.length) bound++;
        FN.text(cell, String(c.name).replace(/^color\./, ''), 'type.label', { size: 13, weight: 600 });
        FN.text(cell, c.hex + (c.copy ? ' · copy' : ' · surface'), 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · hex ' + c.name });
        n++;
      });
    }
    return { board: b, info: { colors: d.colors.length, swatches: bound } };
  };

  FN.typeRamp = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { full: 1760, half: 864 }; const W = o.w || st.half;
    const fam = o.family || null;
    const rows = d.types.filter((t) => (!fam || t.family === String(fam).toLowerCase()) && (o.min === undefined || t.size >= o.min) && (o.max === undefined || t.size <= o.max));
    if (!rows.length) return { err: 'no declared ramp step matches ' + JSON.stringify({ family: fam, min: o.min, max: o.max }) };
    const b = FN.board(o.name || 'Type ramp', W);
    FN.head(b, o.title || 'Type ramp · declared steps', rows.length + ' steps read from the typography tokens (family · size/weight · leading · tracking)');
    rows.forEach(function (t) {
      const r = FN.row(b, { name: 'row·' + t.name, align: 'center', gap: FN.layout.gap });
      const lab = FN.cell(r, 168, { name: 'cell·' + t.name });
      FN.text(lab, t.name.replace(/^type\./, ''), 'type.label', { size: 13, weight: 600 });
      FN.text(lab, t.size + '/' + t.weight + ' lh ' + (t.leading || '—'), 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · ' + t.name });
      FN.text(r, FN.sampleFor(t.size), t.name, { display: true, name: 'sample · ' + t.name.replace(/^type\./, '') });
    });
    return { board: b, info: { steps: rows.length } };
  };

  FN.spacing = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { half: 864 }; const W = o.w || st.half;
    const b = FN.board(o.name || 'Spacing', W);
    FN.head(b, 'Spacing · declared scale', d.spaces.length + ' spacing tokens · every gap in the file comes from this set (§1)');
    d.spaces.forEach(function (s) {
      const r = FN.row(b, { name: 'row·space·' + s.value, align: 'center', gap: FN.layout.gap });
      FN.plate(r, Math.min(s.value * 3, W - 260), 8, { name: 'bar·' + s.value, fill: FN.ink(), radius: CF.radius('xs') });
      const lab = FN.cell(r, 96, { name: 'cell·space·' + s.value });
      FN.text(lab, s.value + 'px', 'type.label', { size: 13, weight: 600 });
      FN.text(r, s.name, 'type.body', { size: 13, color: FN.muted() });
    });
    return { board: b, info: { steps: d.spaces.length } };
  };

  FN.radius = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { half: 864 }; const W = o.w || st.half;
    const b = FN.board(o.name || 'Radius', W);
    FN.head(b, 'Radius · declared steps', d.radii.length + ' border-radius tokens · the plate shows the real corner');
    // The strip is sized from the lane, not from a constant: a 120px cell fits six steps in an 864 lane and the seventh
    // (`out_of_bounds`) escapes it — and a recreation's ladder length is the source's business, so 7 is not an edge case.
    const n = Math.max(1, d.radii.length);
    const cellW = Math.max(72, Math.floor((W - 2 * FN.layout.pad - FN.layout.gap * (n - 1)) / n / 8) * 8);
    const plateW = Math.max(48, cellW - 24);
    const r = FN.row(b, { name: 'row·strip·radius', align: 'start', gap: FN.layout.gap });
    d.radii.forEach(function (x) {
      // the STORED value is drawn as-is: `full` is 9999 and the renderer clamps it to a clean pill (measured
      // 2026-10-21), so a clamp here would be the board inventing an off-ladder number of its own.
      const c = FN.cell(r, cellW, { name: 'cell·radius·' + x.name.replace(/^radius\./, ''), align: 'center' });
      FN.plate(c, plateW, 88, { name: 'plate·r·' + x.name.replace(/^radius\./, ''), fill: FN.surface(), radius: x.value, stroke: FN.hexOf['color.border'] || FN.muted(), strokeW: 1 });
      FN.text(c, x.name.replace(/^radius\./, '') + ' ' + x.value, 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · radius ' + x.name });
    });
    const note = FN.prose.rules.radius;
    if (note) FN.text(FN.row(b, { name: 'row·radius-note', align: 'center' }), note, 'type.body', { size: 13, color: FN.muted() });
    return { board: b, info: { steps: d.radii.length, prose: note ? { rules: { radius: note } } : null } };
  };

  FN.elevation = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { half: 864 }; const W = o.w || st.half;
    const b = FN.board(o.name || 'Elevation', W);
    FN.head(b, 'Elevation · declared shadows', d.shadows.length + ' shadow tokens · stacking uses shadow, adjacency uses a border (§5)');
    const r = FN.row(b, { name: 'row·strip·elevation', align: 'start', gap: FN.layout.gap });
    let drawn = 0;
    d.shadows.forEach(function (x) {
      const c = FN.cell(r, 160, { name: 'cell·elev·' + x.name.replace(/^shadow\./, ''), align: 'center' });
      const pl = FN.plate(c, 128, 88, { name: 'plate·' + x.name.replace(/^shadow\./, ''), fill: FN.surface(), radius: CF.radius('sm'), stroke: FN.hexOf['color.border'] || '' });
      const s = Array.isArray(x.value) ? x.value : [x.value];
      try { pl.shadows = s.map((v) => ({ offsetX: Number(v.offsetX || 0), offsetY: Number(v.offsetY || 0), blur: Number(v.blur || 0), spread: Number(v.spread || 0), color: v.color || '#00000026', opacity: 1, style: 'drop-shadow', show: true })); drawn++; } catch (e) {}
      FN.text(c, x.name.replace(/^shadow\./, ''), 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · ' + x.name });
      FN.text(c, 'y' + Number((s[0] || {}).offsetY || 0) + ' blur ' + Number((s[0] || {}).blur || 0), 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · geom ' + x.name });
    });
    return { board: b, info: { shadows: d.shadows.length, applied: drawn } };
  };

  FN.strokes = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { half: 864 }; const W = o.w || st.half;
    const borders = d.colors.filter((c) => /border|divider|outline/.test(c.name));
    if (!borders.length) return { err: 'no border/divider colour token — the strokes board has nothing to project' };
    const b = FN.board(o.name || 'Strokes & dividers', W);
    FN.head(b, 'Strokes & dividers', borders.length + ' border tokens × widths ' + FN.prose.strokeWidths.join(' / ') + ' (no stroke-width token exists; declared in FN.prose)');
    borders.forEach(function (c) {
      FN.prose.strokeWidths.forEach(function (wv, i) {
        const r = FN.row(b, { name: 'row·stroke·' + c.name.replace(/^color\./, '') + '·' + wv, align: 'center', gap: FN.layout.gap });
        FN.plate(r, W - 2 * FN.layout.pad - 200, 8, { name: 'rule·' + c.name.replace(/^color\./, '') + '·' + wv, stroke: c.hex, strokeW: wv, radius: 0 });
        FN.text(r, c.name.replace(/^color\./, '') + ' ' + wv + 'px', 'type.label', { size: 13, weight: 600 });
        if (i === 0) FN.text(r, c.hex, 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · ' + c.name });
      });
    });
    return { board: b, info: { borders: borders.length, widths: FN.prose.strokeWidths.length } };
  };

  FN.grid = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { half: 864 }; const W = o.w || st.half;
    const tiers = o.tiers || Object.keys(LY.TIERS);
    const b = FN.board(o.name || 'Grid', W);
    FN.head(b, 'Grid · viewport tiers', tiers.length + ' tiers from LY.TIERS · this build ships ' + CF.tier);
    tiers.forEach(function (k) {
      const t = LY.TIERS[k];
      // Label and strip share ONE row: a caption band shorter than `blockMin` is not a block, so the auditor measures
      // the gap ACROSS it (16+20+16 = 52, off scale). Composing them as siblings of the same row removes the phantom gap.
      const r = FN.row(b, { name: 'row·strip·grid·' + k, align: 'center', gap: FN.layout.gap });
      const lab = FN.cell(r, 200, { name: 'cell·grid·' + k });
      FN.text(lab, k + ' ' + t.w + ' · ' + t.cols + ' cols', 'type.label', { size: 14, weight: 600 });
      FN.text(lab, 'margin ' + t.margin + ' · gutter ' + t.gutter + ' · touch ' + t.touch, 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · grid ' + k });
      const strip = FN.row(r, { name: 'row·cols·' + k, align: 'start', gap: 8 });
      const g = LY.grid({ x: 0, y: 0, w: Math.max(120, Math.round(r.width) - 200 - FN.layout.gap), h: 64 }, t.cols, t.gutter);
      const cw = Math.max(8, up8(g.colW / 4));
      for (let c = 0; c < t.cols; c++) FN.plate(strip, cw, 64, { name: 'col·' + k + '-' + c, fill: FN.hexOf['color.surface-shade'] || FN.muted(), radius: CF.radius('xs') });
    });
    return { board: b, info: { tiers: tiers.length } };
  };

  FN.semantic = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const tones = FN.tones(); if (!tones.length) return { err: 'no colour token triple is declared: the set needs `color.X` plus its ink (`X-ink`/`XInk`) and wash (`X-wash`/`X-soft`/`XSoft`) steps — design-guide §4.1' };
    // A column header that promises copy is a CONTRACT with the reader. Measured 2026-10-21 on the live `02.01` board:
    // `FN.prose.usage` defaults to `{}`, so `Where each step is used` was drawn as a header over six empty cells and
    // every gate still read CLEAN — geometry, tokens, contrast and flow all passed an empty column. Refuse instead:
    // the sentences are data, so the data must exist before the structure that displays it is built.
    const silent = tones.map((t) => t.tone).filter((k) => !FN.prose.usage || !FN.prose.usage[k]);
    if (silent.length) return { err: 'FN.prose.usage has no sentence for ' + silent.length + ' of ' + tones.length + ' tone(s): ' + silent.join(', ') + ' — call FN.setContent({ usage: { … } }) first (or FN.recoverProse(page) if an earlier projection wrote them into the file), or the board ships a header over an empty column' };
    const used = {};
    const st = FN.lanes(o.page) || { full: 1760 }; const W = o.w || st.full;
    const b = FN.board(o.name || 'Semantic roles', W);
    FN.head(b, 'Semantic roles · wash / hue / ink', 'design-guide §4.1 · the triples are derived from token names, ' + tones.length + ' tones');
    const W2 = [288, 192, 192, 192, Math.max(320, W - 2 * FN.layout.pad - 864 - 64)];
    const hd = FN.row(b, { name: 'row·col-header', align: 'center', gap: FN.layout.gap });
    ['Tone', 'wash', 'hue · graphics only', 'ink', 'Where each step is used'].forEach(function (s, i) {
      const c = FN.cell(hd, W2[i], { name: 'col·' + s.split(' ')[0].toLowerCase() });
      FN.text(c, s, 'type.label', { size: 12, weight: 500, color: FN.muted() });
    });
    tones.forEach(function (t) {
      const r = FN.row(b, { name: 'row·tone·' + t.tone, align: 'center', gap: FN.layout.gap });
      const lab = FN.cell(r, W2[0], { name: 'cell·tone·' + t.tone });
      FN.text(lab, t.tone, 'type.label', { size: 14, weight: 600 });
      FN.text(lab, 'color.' + t.tone + ' · ' + t.washSuffix + ' · ' + t.inkSuffix, 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · tone ' + t.tone });
      [['wash', t.wash], ['hue', t.hue], ['ink', t.ink]].forEach(function (p) {
        const c = FN.cell(r, W2[1 + ['wash', 'hue', 'ink'].indexOf(p[0])], { name: 'cell·swatch·' + t.tone + '·' + p[0], align: 'center' });
        FN.plate(c, 160, 48, { name: 'swatch·' + t.tone + '·' + p[0], fill: p[1], radius: CF.radius('sm') });
        FN.text(c, p[0] + ' ' + p[1], 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · ' + p[0] + ' ' + t.tone });
      });
      const uc = FN.cell(r, W2[4], { name: 'cell·usage·' + t.tone });
      const usage = FN.prose.usage[t.tone];
      if (usage) FN.text(uc, usage, 'type.body', { size: 13, color: FN.muted() });
      (used.usage = used.usage || {})[t.tone] = usage;
    });
    return { board: b, info: { tones: tones.length, swatches: tones.length * 3, prose: used } };
  };

  FN.stateLayers = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { full: 1760 }; const W = o.w || st.full;
    const ground = FN.surface();
    const inverse = (d.colors.filter((c) => /inverse/.test(c.name) && !c.copy)[0] || {}).hex || '#101010';
    const states = Object.keys(CF.STATE).filter((k) => typeof CF.STATE[k] === 'number' && /hover|focus|pressed|dragged|selected|disabled/.test(k));
    // The wash is the ON-SURFACE colour, read from the declared copy tokens — not `CF.fills(…, {onDark:true})`, whose
    // shade overlay is correct on a saturated brand fill (white@8% lifts #2563EB until the white label breaks §3.3)
    // and a pure no-op on a near-black neutral ground. Measured 2026-10-21: the dark lane exported as seven identical
    // black tiles because the projector inherited the brand rule. A tile the eye cannot rank is not a state layer.
    const lanes = [{ key: 'light', hex: ground }, { key: 'dark', hex: inverse }];
    lanes.forEach(function (g) { g.wash = FN.ink(g.hex); g.ink = FN.ink(g.hex); });
    const hair = FN.hexOf['color.border'] || FN.muted(ground);
    const used = {};
    const b = FN.board(o.name || 'State layers', W);
    FN.head(b, 'State layers · CF.STATE alphas', 'M3 overlay model (§5.2) · the wash is the on-surface colour (' +
      lanes.map((g) => g.wash).join(' / ') + ') at the STATE alpha — on a brand fill the same state is a shade, never a lift');
    // The row is a fixed grid of columns; the remainder column must subtract EVERY gap in front of it. Authoring it as
    // `… - 32` (one gap) left 16px of the last cell outside the row — `out_of_bounds` ×10 on the probe (measured 2026-10-21).
    const COLS = [224, 192, 192];
    const rest = W - 2 * FN.layout.pad - COLS.reduce((a, c) => a + c, 0) - FN.layout.gap * COLS.length;
    states.forEach(function (k) {
      const r = FN.row(b, { name: 'row·state·' + k, align: 'center', gap: FN.layout.gap });
      const lab = FN.cell(r, COLS[0], { name: 'cell·state·' + k });
      FN.text(lab, k, 'type.label', { size: 14, weight: 600 });
      FN.text(lab, 'CF.STATE.' + k + ' = ' + CF.STATE[k], 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · ' + k });
      lanes.forEach(function (g, i) {
        const c = FN.cell(r, COLS[1 + i], { name: 'cell·' + g.key + '·' + k, align: 'center' });
        const hair2 = g.key === 'dark' ? (FN.hexOf['color.inverse-shade'] || g.wash) : hair;
        const content = /Content$/.test(k);
        if (content) {
          // A CONTENT alpha dims the label, it is not a container wash — and the copy must sit ON its own ground:
          // white at 38% drawn straight onto the light board ground is invisible (measured in this board's export).
          const tile = FN.cell(c, 160, { name: 'tile·' + g.key + '·' + k, align: 'center', dir: 'row', justify: 'center',
            pad: { x: 16, y: 12 }, fill: g.hex, radius: CF.radius('sm') });
          try { tile.strokes = [{ strokeColor: hair2, strokeWidth: 1, strokeStyle: 'solid', strokeAlignment: 'inner', strokeOpacity: 1 }]; } catch (e) {}
          const t = FN.text(tile, 'Copy', 'type.label', { size: 16, weight: 600, color: g.ink });
          try { t.fills = [{ fillColor: g.ink, fillOpacity: CF.STATE[k] }]; } catch (e) {}
        } else {
          // the hairline is what makes a tile whose base equals the board ground readable at all
          const p = FN.plate(c, 160, 48, { name: 'layer·' + g.key + '·' + k, fill: g.hex, radius: CF.radius('sm'), stroke: hair2, strokeW: 1 });
          try { p.fills = CF.fills(g.hex, k, { overlay: g.wash }); } catch (e) {}
        }
        FN.text(c, String(g.hex).toUpperCase() + ' → ' + FN.over(g.hex, g.wash, CF.STATE[k]).toUpperCase(), 'type.axis',
          { size: 11, color: FN.muted(), axis: true, name: 'axis · ' + g.key + ' ' + k });
      });
      const note = FN.prose.rules[k];
      if (!note) return;                       // no editorial content → no empty column (dead space is a §2 finding)
      const nc = FN.cell(r, Math.max(320, rest), { name: 'cell·rule·' + k });
      FN.text(nc, note, 'type.body', { size: 13, color: FN.muted() });
      (used.rules = used.rules || {})[k] = note;
    });
    return { board: b, info: { states: states.length, washes: lanes.map((g) => g.key + '=' + g.wash).join(' '), prose: Object.keys(used).length ? used : null } };
  };

  /** The matrix is ENUMERATED, not authored: every copy token × every surface token, measured, then split. */
  FN.contrast = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { full: 1760 }; const W = o.w || st.full;
    const copy = d.colors.filter((c) => c.copy), surf = d.colors.filter((c) => !c.copy);
    const all = [];
    copy.forEach(function (f) { surf.forEach(function (bg) {
      if (f.hex === bg.hex) return;
      const r = FN.ratio(f.hex, bg.hex);
      all.push({ fg: f, bg: bg, ratio: r, pass: FN.verdict(r, 16) });
    }); });
    const passing = all.filter((a) => a.pass).sort((a, b) => b.ratio - a.ratio).slice(0, FN.prose.maxPass);
    const failing = all.filter((a) => !a.pass).sort((a, b) => a.ratio - b.ratio).slice(0, FN.prose.maxFail);
    const b = FN.board(o.name || 'Contrast matrix', W);
    FN.head(b, 'Contrast matrix · WCAG 2.1', copy.length + ' copy × ' + surf.length + ' surface = ' + all.length + ' pairs measured, not asserted');
    function band(list, label, name) {
      const hd = FN.row(b, { name: 'row·header·' + name, align: 'center', gap: FN.layout.gap });
      FN.text(hd, label, 'type.label', { size: 12, weight: 500, color: FN.muted() });
      list.forEach(function (p) {
        const rr = FN.row(b, { name: 'row·pair·' + p.fg.name + '-on-' + p.bg.name, align: 'center', gap: FN.layout.gap });
        const lab = FN.cell(rr, 384, { name: 'cell·pair·' + p.fg.name + '-on-' + p.bg.name });
        FN.text(lab, p.fg.name.replace(/^color\./, '') + ' on ' + p.bg.name.replace(/^color\./, ''), 'type.label', { size: 14, weight: 600 });
        FN.text(lab, p.fg.hex + ' on ' + p.bg.hex, 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · pair ' + p.fg.name });
        if (p.pass) {
          const sc = FN.cell(rr, 480, { name: 'cell·sample·' + p.fg.name + '-' + p.bg.name, pad: { x: 16, y: 8 }, fill: p.bg.hex, radius: 0 });
          FN.text(sc, FN.prose.defaultSample, 'type.body', { size: 16, color: p.fg.hex });
        } else {
          // A CELL of the same 480 the passing band uses, not a fill row: `FN.row` spans the remaining width, so the
          // ratio column of the rejected band landed at x≈1560 while the exported band's sat at x≈896 — two tables
          // pretending to be one (measured in the 2026-10-21 export of this board).
          const sc = FN.cell(rr, 480, { name: 'cell·swatchpair·' + p.fg.name + '-' + p.bg.name, dir: 'row', align: 'center', gap: FN.layout.gap });
          FN.plate(sc, 160, 48, { name: 'bg·' + p.bg.name.replace(/^color\./, ''), fill: p.bg.hex, radius: CF.radius('sm') });
          FN.plate(sc, 160, 48, { name: 'fg·' + p.fg.name.replace(/^color\./, ''), fill: p.fg.hex, radius: CF.radius('sm') });
        }
        const rc = FN.cell(rr, 224, { name: 'cell·ratio·' + p.fg.name + '-' + p.bg.name });
        FN.text(rc, p.pass || 'Fail', 'type.label', { size: 14, weight: 600, color: p.pass ? FN.ink() : (FN.inkOf('danger') || FN.ink()) });
        FN.text(rc, p.ratio.toFixed(2) + ':1', 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · ratio ' + p.fg.name });
      });
    }
    band(passing, 'exported pairs · copy is drawn here', 'exported');
    band(failing, 'rejected pairs · never export these', 'rejected');
    FN.text(FN.row(b, { name: 'row·note', align: 'center' }), all.length + ' pairs enumerated · ' + passing.length + ' exported, ' + failing.length + ' rejected (the rest are off-canvas, the rule is the same)', 'type.body', { size: 13, color: FN.muted() });
    return { board: b, info: { measured: all.length, exported: passing.length, rejected: failing.length } };
  };

  FN.dataColors = function (o) {
    o = o || {}; const d = FN.source(); if (d.err) return d;
    const st = FN.lanes(o.page) || { full: 1760 }; const W = o.w || st.full;
    let tones = FN.tones().map((t) => ({ name: t.tone, hex: t.hue }));
    if (FN.prose.seriesTones) tones = FN.prose.seriesTones.map((n) => tones.filter((t) => t.name === n)[0]).filter(Boolean);
    tones = tones.slice(0, 6);
    if (!tones.length) return { err: 'no tone hue token to project as a data series' };
    const b = FN.board(o.name || 'Data colors', W);
    FN.head(b, 'Data colors · categorical ramp', tones.length + ' series from the declared hue steps · copy never sits on a hue');
    const lg = FN.row(b, { name: 'row·legend', align: 'start', gap: FN.layout.gap });
    tones.forEach(function (s) {
      const c = FN.cell(lg, 256, { name: 'cell·legend·' + s.name });
      FN.plate(c, 24, 24, { name: 'dot·' + s.name, fill: s.hex, radius: CF.radius('xs') });
      FN.text(c, s.name, 'type.label', { size: 13, weight: 600 });
      FN.text(c, s.hex, 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · series ' + s.name });
    });
    const br = FN.row(b, { name: 'row·strip·bars', align: 'end', gap: FN.layout.gap });
    tones.forEach(function (s, n) {
      const h = up8(192 - n * 24);
      const c = FN.cell(br, 256, { name: 'cell·bar·' + s.name, align: 'center' });
      FN.plate(c, 96, h, { name: 'bar·' + s.name, fill: s.hex, radius: CF.radius('xs') });
      FN.text(c, h + 'px', 'type.axis', { size: 11, color: FN.muted(), axis: true, name: 'axis · bar ' + s.name });
    });
    const rules = (FN.prose.rules.dataColors || []).slice();
    rules.forEach(function (s) {
      FN.text(FN.row(b, { name: 'row·rule·' + s.slice(0, 12), align: 'center' }), s, 'type.body', { size: 13, color: FN.muted() });
    });
    return { board: b, info: { series: tones.length, prose: rules.length ? { rules: { dataColors: rules } } : null } };
  };

  // The value is the board the projector draws — `replace` matches on it, so it must be the name, not the kind.
  FN.KINDS = { palette: 'Palette', typeRamp: 'Type ramp', spacing: 'Spacing', radius: 'Radius', elevation: 'Elevation',
    strokes: 'Strokes & dividers', grid: 'Grid', semantic: 'Semantic roles', stateLayers: 'State layers',
    contrast: 'Contrast matrix', dataColors: 'Data colors' };
  FN.kinds = function () { return Object.keys(FN.KINDS); };

  // ---------- 6b · the provenance contract that makes G16 checkable ----------
  // Which chapter owns which kind, which boards are NOT projections, and what counts as proof. This is what turns G16
  // from prose into a machine gate: `audit_design`'s `not_projected` reads the stamp written here and `FN.coverage()`
  // reads the same table, so the auditor never holds a second copy of the contract it could disagree with.
  FN.CHAPTER = { palette: '01', typeRamp: '01', spacing: '01', radius: '01', elevation: '01', strokes: '01', grid: '01',
    semantic: '02', stateLayers: '02', contrast: '02', dataColors: '02' };
  FN.EXEMPT = { '01': ['Icons'], '02': ['Light vs dark'] };   // a catalog and a scheme comparison: neither is one record type
  FN.chapter = function (page) { const m = String(page).match(/^(\d{2})(?:\.\d+)?/); return m ? m[1] : null; };
  FN.chapters = function () { return Array.from(new Set(Object.keys(FN.CHAPTER).map((k) => FN.CHAPTER[k]))); };
  FN.kindsOf = function (chapter) { return Object.keys(FN.CHAPTER).filter((k) => FN.CHAPTER[k] === chapter); };
  FN.kindByName = function (name) { const k = FN.kinds().filter((x) => FN.KINDS[x] === nm(name))[0]; return k || null; };
  /** The in-file proof that a board was projected: `nl:fn=<kind>` pluginData. It lives in the file, so it survives a
      storage wipe — unlike `FN.records` and `NL._reg`, which are JS memory and vanish with the session. */
  FN.stampOf = function (board) { try { return NL.readStamp(board).fn || null; } catch (e) { return null; } };
  /** The top-level boards of a page, read without opening it (measured 2026-10-21: `page.root.children` of a
      non-current page is readable, which is what makes a file-wide coverage pass cost one call). */
  FN.boards = function (page) {
    const root = FN.pageRoot(page); if (!root) return [];
    return Array.from(root.children || []).filter((s) => !/-PageRoot$|-Header$|-Footer$/.test(String(s.name)));
  };
  /** Every page whose number is a projection chapter — the pagination this skill actually ships is
      **block-per-page** (`01.09 · Foundations · Palette`), so a chapter is spread over ~9 pages, and a single page
      legitimately holds ONE block. Coverage is therefore a file question, never a per-page one. */
  FN.chapterPages = function () {
    const chs = FN.chapters();
    return penpotUtils.getPages().map((p) => String(p.name)).filter((n) => chs.indexOf(FN.chapter(n)) >= 0);
  };
  /** The file-level half of G16: each chapter kind must be projected SOMEWHERE, and no chapter page may hold an
      un-stamped board. `missing` is per chapter across pages; `foreign` lists page · board, so the repair is locable. */
  FN.coverage = function () {
    const pages = FN.chapterPages(), by = {}, out = [];
    pages.forEach(function (n) {
      const ch = FN.chapter(n);
      const rec = by[ch] = by[ch] || { chapter: ch, pages: 0, required: FN.kindsOf(ch), kinds: {}, foreign: [], offChapter: [] };
      rec.pages++;
      FN.boards(n).concat(FN.strays(n)).forEach(function (b) {
        const k = FN.stampOf(b);
        if (k) { if (FN.CHAPTER[k] === ch) (rec.kinds[k] = rec.kinds[k] || []).push(n + ' · ' + String(b.name));
          else rec.offChapter.push(n + ' · ' + String(b.name) + ' =' + k + ' (belongs on ' + FN.CHAPTER[k] + ')'); }
        else if ((FN.EXEMPT[ch] || []).map(nm).indexOf(nm(String(b.name))) < 0) rec.foreign.push(n + ' · ' + String(b.name));
      });
    });
    Object.keys(by).forEach(function (ch) {
      const rec = by[ch];
      rec.missing = rec.required.filter((k) => !rec.kinds[k]);
      rec.covered = rec.required.length - rec.missing.length;
      out.push(rec);
    });
    // `offChapter` is reported but does not block: it is a placement note (a projected board parked on the wrong
    // chapter page, which only ever happens on a mixed staging page), while `foreign` and `missing` are the two ways
    // the chapter can be the wrong ARTIFACT.
    return { pages: pages.length, chapters: out, missing: out.reduce((a, r) => a.concat(r.missing), []),
      foreign: out.reduce((a, r) => a.concat(r.foreign), []),
      offChapter: out.reduce((a, r) => a.concat(r.offChapter), []),
      verdict: (!out.some((r) => r.missing.length || r.foreign.length)) ? 'CLEAN' : 'NEEDS_REPAIR' };
  };
  /** A chapter page's content lives INSIDE `NN.MM-PageRoot` (contract §2). A board sitting at the page root beside it is
      a stray — and measured 2026-10-21 it was the one hole in this gate: `FN.boards()` reads inside the PageRoot, so a
      hand-composed control parked at the page root carried no stamp, was invisible to rule 31, and only another
      auditor's `root_stray` caught it. G16 cannot depend on a different engine to see a defect class, so strays count as
      foreign. They are deliberately NOT counted as coverage and `FN.restamp` never touches them: no placement accident
      can launder a hand-drawn board into a projection. */
  FN.strays = function (page) {
    const p = storage.pg(page); if (!p) return [];
    const root = FN.pageRoot(page);
    return Array.from(p.root.children || []).filter((s) => s !== root
      && String(s.type || '') === 'board' && !/-PageRoot$|-Header$|-Footer$/.test(String(s.name)));
  };
  /** Content boards on a gated chapter page that carry no projection stamp — i.e. hand-composed. Exempt names
      (§2: Icons, Light vs dark) and the scaffold's own PageRoot/Header/Footer are not boards FN claims. */
  FN.foreign = function (page) {
    const ch = FN.chapter(page), exempt = (FN.EXEMPT[ch] || []).map(nm);
    return FN.boards(page).concat(FN.strays(page)).filter(function (s) {
      if (exempt.indexOf(nm(String(s.name))) >= 0) return false;
      return !FN.stampOf(s);
    }).map((s) => ({ name: String(s.name), w: Math.round(s.width), h: Math.round(s.height) }));
  };
  /** Kinds this page holds, proven by the stamp. */
  FN.kindsOn = function (page) { return FN.boards(page).map((b) => FN.stampOf(b)).filter(Boolean); };
  /** Backfill the stamp on boards an OLDER FN projected. The name alone is not proof — the live file has a hand-drawn
      `Palette`, and matching by name would launder it as projected — so this reads FN's in-session records unless the
      caller names `{ byName: true }`, which is the operator saying "this page is FN's output, trust the titles". */
  FN.restamp = async function (page, o) {
    const use = await FN.use(page); if (use.err) return use;   // setPluginData is a write: the page must be open
    const fromRecords = {};
    (FN.records || []).filter((r) => r.page === page).forEach((r) => { fromRecords[nm(r.name)] = r.kind; });
    const stamped = [], unknown = [], laundered = [];
    FN.boards(page).forEach(function (b) {
      const had = FN.stampOf(b); if (had) { stamped.push(String(b.name) + '=' + had); return; }
      const k = fromRecords[nm(String(b.name))] || ((o && o.byName) ? FN.kindByName(String(b.name)) : null);
      if (!k) { unknown.push(String(b.name)); return; }
      if (!fromRecords[nm(String(b.name))]) laundered.push(String(b.name) + '=' + k);
      NL.stamp(b, { fn: k, shelf: '1' }); stamped.push(String(b.name) + '=' + k);
    });
    return { page: page, stamped: stamped, unknown: unknown, byName: !!(o && o.byName), nameMatched: laundered };
  };

  // ---------- 7 · the stages, one board per call ----------
  // Measured 2026-10-21 on a live probe page: build ≈ 0.9 s/board, `FN.place` ≈ 0.16 s, a whole-board token bind
  // (13 batches, 99 bindings, proof 12/12) = 3.0 s, `designPage({board})` ≈ 0.7 s, `TK.bindBoard(…, {dry:true})` =
  // 37 ms. `auditPage({})` walks the WHOLE page, so it is paid once per batch, never per board.
  // The stage split is not about CPU, it is about the plugin's timer pump: `setTimeout(300)` answered in 0.479 /
  // 0.799 / 0.825 / **12.457** s in one session, so any sleep-poll inside `execute_code` is a coin-flip against the
  // 30 s ceiling — and a call that times out is NOT cancelled, it keeps mutating the page while the next call queues
  // behind it (that is how four boards and a stray ended up mis-shelved here). Hence: no polls, one board per call,
  // and `FN.check`'s page-wide `auditPage` pass as the proof that the shelf holds.
  FN._rec = function (r) {
    FN.records = FN.records || [];
    const i = FN.records.findIndex((x) => x.page === r.page && x.name === r.name);
    if (i >= 0) FN.records[i] = Object.assign(FN.records[i], r); else FN.records.push(r);
    return r;
  };
  FN.projected = function (page) {
    const root = FN.pageRoot(page); if (!root) return [];
    const names = FN.kinds().map((k) => FN.KINDS[k]);
    return Array.from(root.children || []).filter((c) => names.indexOf(nm(String(c.name))) >= 0);
  };

  /** Build ONE board and shelf-place it. No sleep, no settle poll, no binding, no gating.
      Why so little per call: the plugin's `setTimeout` answers 300 ms in 0.4-12 s (measured across one session:
      479 / 799 / 825 / 12457 ms), so ANY poll loop is a coin-flip against the 30 s ceiling, and a call that dies
      mid-loop keeps mutating the page while the next one waits. The hug height is not needed here: `FN.lanes`
      re-derives the shelf from the page at the START of every call, so by the time the NEXT board is placed this
      one has settled (a whole call-cycle of wall-clock passed). One board per call is therefore the contract, and
      `FN.check`'s `auditPage` pass is the safety net that proves nothing overlaps. */
  FN.project = async function (o) {
    o = o || {};
    FN.setFilter = o.set || null;                    // one token set per projection (two-scheme files) — see §1
    const k = o.kind || (o.kinds || [])[0];
    if (!k) return { err: 'project takes one kind per call', kinds: FN.kinds() };
    if (typeof FN[k] !== 'function') return { err: 'unknown kind ' + k, kinds: FN.kinds() };
    if (o.kinds && o.kinds.length > 1) return { err: 'one kind per call (the shelf needs the previous board to settle first): got ' + o.kinds.join(', ') };
    // Every kind has one owning chapter, and a page is not a canvas for arbitrary boards: `Palette` on `03 · Actions`
    // would read CLEAN and still be the wrong artifact in the wrong place (G16 is a placement contract too).
    const ch = FN.chapter(o.page);
    if (!ch) return { err: 'FN projects onto numbered chapter pages only; ' + o.page + ' has no NN[.MM] prefix' };
    if (ch !== FN.CHAPTER[k] && !o.force) return { err: 'kind ' + k + ' belongs on chapter ' + FN.CHAPTER[k] + ', not on ' + o.page + ' (o.force overrides)' };
    const d = FN.source(o.reseed); if (d.err) return d;
    const root = FN.pageRoot(o.page); if (!root) return { err: 'no PageRoot on ' + o.page + ' (scaffold the page first)' };
    const name = nm(FN.KINDS[k]);
    // Open and settle FIRST: the remove below is destructive, and a removal issued against a page that is not the open
    // one either throws or silently hits the wrong file page (FN used to `openPage` here and build in the same turn).
    const use = await FN.use(o.page);
    if (use.err) return { kind: k, err: use.err, want: use.want, wait: use.wait };
    const prose = FN.recoverProse(o.page);          // a fresh session must not silently drop what the board says
    if (o.replace !== false) Array.from(root.children || []).filter((c) => nm(String(c.name)) === name).forEach((c) => { try { c.remove(); } catch (e) {} });
    const built = FN[k](Object.assign({}, o, { name: name }));
    FN.setFilter = null;                                 // the set filter lives only for this projector call
    if (!built || built.err) return { kind: k, err: (built && built.err) || 'the projector returned nothing' };
    const relaid = FN.relayout(built.board);
    const w = Math.round(built.board.width);
    const reflowed = FN.reflow(o.page);
    if (reflowed.err) return { kind: k, err: reflowed.err };
    const at = FN.place(o.page, built.board, w);
    if (at.err) return { kind: k, err: at.err };
    const stamp = NL.stamp(built.board, Object.assign({ fn: k, shelf: '1' }, o.set ? { set: o.set } : {}));
    if (built.info && built.info.prose) FN.stampProse(built.board, built.info.prose);
    const fit = FN.fitRoot(o.page);
    return { page: o.page, relaid: relaid, reflowed: reflowed.moved, fit: fit.want || fit.err, stamp: stamp, prose: prose,
      row: FN._rec({ page: o.page, kind: k, name: built.board.name, at: at.at, w: w,
      h: Math.round(built.board.height), records: built.info, gate: 'not yet bound' }), lanes: FN.lanes(o.page) };
  };

  /** Bind ONE board (the slow stage) and gate it in the same call. Call it until `allBound`. */
  FN.bindNext = async function (o) {
    o = o || {};
    const root = FN.pageRoot(o.page); if (!root) return { err: 'no PageRoot on ' + o.page };
    const boards = FN.projected(o.page);
    const done = (FN.records || []).filter((r) => r.page === o.page && r.gated).map((r) => r.name);
    const queue = boards.filter((c) => done.indexOf(c.name) < 0);
    const use = await FN.use(o.page);                 // binding writes tokens into the board: the page must be open
    if (use.err) return use;
    for (let i = 0; i < queue.length; i++) {
      const b = queue[i];
      let bind = {}; const t = Date.now();
      const dry = await TK.bindBoard(b, { dry: true });
      if (dry.batches) bind = await TK.bindBoard(b, o.bindOpts || {}); else bind = dry;
      bind.bindMs = Date.now() - t;
      // Binding writes fonts, and a font changes a text's height — which is exactly what leaves a hug frame frozen at
      // the placeholder height (§4 FN.relayout). Re-run the pass before judging the geometry, and report if the board
      // grew: a grown board means the shelf placed its neighbours against the old height, so `FN.project` must be re-driven.
      const hBefore = Math.round(b.height);
      const relaid = FN.relayout(b);
      const grew = Math.round(b.height) - hBefore;
      FN.reflow(o.page);   // no-op when nothing moved; re-shelves neighbours and fits the root when the board grew
      const flow = NL.auditFlow(b);
      const design = storage.designPage ? storage.designPage({ board: b }) : { verdict: 'audit_design not seeded' };
      const rec = FN._rec({ page: o.page, name: b.name, w: Math.round(b.width), h: Math.round(b.height), gated: true,
        relaid: relaid.touched, grew: grew,
        batches: bind.batches, bindMs: bind.bindMs,
        bound: { fill: bind.fillBound, stroke: bind.strokeBound, type: bind.typeBound, space: bind.spaceBound, padOnScale: bind.padOnScale },
        off: { palette: bind.offPalette, stroke: bind.offStroke, ramp: bind.offRamp, space: bind.offSpace },
        failed: bind.failed, proof: bind.proof,
        flow: flow && flow.ok === false ? flow : 'CLEAN',
        gate: design.verdict, gateCounts: design.counts, findings: (design.findings || []).slice(0, 12) });
      return Object.assign({ remaining: queue.length - i - 1 }, rec);
    }
    return { page: o.page, allBound: true, boards: boards.length };
  };
  /** The page-wide gate, run once after a batch: both auditors over the whole page, plus what FN itself recorded. */
  FN.check = async function (page) {
    // Both auditors read `penpot.currentPage`, and that binding only refreshes after the switch settles — so go through
    // `FN.use` and refuse rather than report a verdict about the wrong page.
    const use = await FN.use(page);
    if (use.err) return use;
    const design = storage.designPage ? storage.designPage({}) : { verdict: 'audit_design not seeded' };
    const layout = storage.auditPage ? storage.auditPage({}) : { verdict: 'audit_layout not seeded' };
    const boards = FN.boards(page);   // every content board, stamped or not: an un-projected board must show up here too
    const unbound = [];
    for (let i = 0; i < boards.length; i++) {
      try { if ((await TK.bindBoard(boards[i], { dry: true })).batches > 0) unbound.push(boards[i].name); } catch (e) {}
    }
    const ch = FN.chapter(page);
    const prov = ch ? { chapter: ch, required: FN.kindsOf(ch), kinds: FN.kindsOn(page), foreign: FN.foreign(page) } : null;
    const g16 = !prov ? 'not a projection chapter' : (!prov.foreign.length ? 'CLEAN' : 'NEEDS_REPAIR');
    return { page: page, boards: FN.boards(page).concat(FN.strays(page)).map((c) => ({ name: c.name, kind: FN.stampOf(c), stamped: !!FN.stampOf(c),
        stray: FN.strays(page).indexOf(c) >= 0,
        w: Math.round(c.width), h: Math.round(c.height), y: Math.round(c.y) })),
      unbound: unbound, g16: g16, provenance: prov, coverage: FN.coverage(),
      design: design.verdict, designCounts: design.counts, designFindings: (design.findings || []).slice(0, 20),
      layout: layout.verdict, layoutCounts: layout.counts, layoutFindings: (layout.findings || []).slice(0, 20),
      records: (FN.records || []).filter((r) => r.page === page) };
  };
  /** What the projections cost — the whole point of `FN` is that this reports ZERO repair rounds.
      `coverage` is the other half of G16: a page can be geometrically perfect and still be the wrong artifact set, so
      every chapter kind must be projected SOMEWHERE in the file (block-per-page means the chapter is spread over ~9
      pages, which is why coverage is read across `FN.chapterPages()`, never per page). */
  FN.audit = function () {
    const r = (FN.records || []).filter((x) => x.gate);
    const cov = FN.coverage();
    return { projected: (FN.records || []).length, gated: r.length,
      boards: r.map((x) => ({ name: x.name, h: x.h, batches: x.batches, bindMs: x.bindMs, gate: x.gate, flow: typeof x.flow === 'string' ? x.flow : 'NEEDS_REPAIR',
        findings: Object.keys(x.gateCounts || {}).length })),
      needsRepair: r.filter((x) => x.gate !== 'CLEAN').map((x) => x.name + ' ' + JSON.stringify(x.gateCounts)),
      flowBroken: r.filter((x) => typeof x.flow !== 'string').map((x) => x.name),
      coverage: cov, incomplete: cov.verdict !== 'CLEAN' };
  };

  return { seeded: true, version: FN.VERSION, kinds: FN.kinds(), layout: FN.layout,
    chapters: FN.CHAPTER, chapterPages: FN.chapterPages(), coverage: FN.coverage(), exempt: FN.EXEMPT,
    api: ['FN.setContent', 'FN.source', 'FN.kinds', 'FN.kindsOf', 'FN.chapter', 'FN.project', 'FN.bindNext', 'FN.check', 'FN.audit',
           'FN.projected', 'FN.boards', 'FN.lanes', 'FN.place', 'FN.reflow', 'FN.fitRoot', 'FN.shelfStep', 'FN.relayout', 'FN.board', 'FN.row', 'FN.cell', 'FN.text', 'FN.plate', 'FN.head',
           'FN.step', 'FN.tones', 'FN.inkOf', 'FN.ratio', 'FN.over', 'FN.verdict', 'FN.stampOf', 'FN.restamp', 'FN.foreign', 'FN.kindsOn', 'FN.kindByName', 'FN.chapterPages', 'FN.coverage', 'FN.strays', 'FN.use',
           'FN.stampProse', 'FN.readProse', 'FN.recoverProse'] };
})();
