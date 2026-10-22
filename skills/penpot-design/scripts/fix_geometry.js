// fix_geometry.js —— geometry repair engine (four signature classes, all support dry-run)
// Usage: paste the whole file into execute_code and run once (literal functions go into storage for cross-call reuse);
//       then call storage.fixColumnOffset / fitBoardHeight / fitRootHeight / fixOverflowRight page by page.
// Discipline: **first {apply:false} to produce a list for manual review, then {apply:true} after confirming**; after each class, immediately re-run audit_layout.js to recompute.
// Mechanics and the four-signature judgments: references/positioning-audit.md.

return (function () {
  const headOf = (r) => { try { return Array.from(r.children).find((c) => c.type === 'board'); } catch (e) { return null; } };
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const rec = (s) => s.type === 'board' || isVC(s);
  const fsz = (s) => { const v = parseFloat(s.fontSize); return isFinite(v) ? v : 14; };
  const alignOf = (s) => { try { return s.horizontalAlign || s.align || 'left'; } catch (e) { return 'left'; } };

  // "Text visual rect" from the same source as audit_layout.js: wide text boxes falsely overflow, must estimate the actual glyph extent by alignment
  storage.visRect = function (c) {
    if (c.type !== 'text') return { x: c.x, y: c.y, w: c.width, h: c.height, r: c.x + c.width, b: c.y + c.height };
    const f = fsz(c), n = String(c.characters || '').length;
    const est = Math.max(4, Math.min(c.width, n * f * 0.62 + 2));
    const a = alignOf(c);
    let vx = c.x; if (a === 'center') vx = c.x + (c.width - est) / 2; else if (a === 'right') vx = c.x + c.width - est;
    const vh = Math.max(4, Math.min(c.height, f * 1.35)), vy = c.y + (c.height - vh) / 2;
    return { x: vx, y: vy, w: est, h: vh, r: vx + est, b: vy + vh };
  };

  // Move: prefer parentX/parentY (works everywhere), fall back to world coordinates x/y
  const moveX = (s, wx) => { try { s.parentX = wx - s.parent.x; return true; } catch (e1) {} try { s.x = wx; return true; } catch (e2) {} return false; };

  // ---- S1 constant column offset ----
  // Symptom: a right-column board's content used the left-column board's absolute x, the whole content runs to the board's left (even onto a neighbor board).
  // Criterion: a direct child with x < board.x - 2 exists inside the board.
  // Shift amount: dx = board.x - originX (originX = the origin used when writing the content, default 80).
  // Distinguish from approach A failure: this signature is an **X-axis constant** offset; approach A failure is a **Y-axis -board.y** offset.
  storage.fixColumnOffset = function (opts) {
    opts = opts || {};
    const originX = opts.originX == null ? 80 : opts.originX;
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    const log = [];
    for (const B of Array.from(head.children)) {
      if (B.type !== 'board') continue;
      const kids = kidsOf(B); if (!kids || !kids.length) continue;
      const disp = kids.filter((k) => k.x < B.x - 2);
      if (!disp.length) continue;
      const dx = B.x - originX;
      log.push({ board: B.name, boardX: Math.round(B.x), displaced: disp.length, dx: dx, sample: disp.slice(0, 3).map((k) => (k.name || '') + '@' + Math.round(k.x)) });
      if (apply) disp.forEach((k) => moveX(k, k.x + dx));
    }
    return { apply: apply, boards: log.length, totalChildren: log.reduce((a, b) => a + b.displaced, 0), plan: log };
  };

  // ---- S2 board height insufficient (content overflows board bottom) ----
  // Default pad 0: **component masters (Button/Input/Toggle…) must equal their content size exactly**,
  // adding uniform padding to boards would inflate the masters and break components (tested lesson: pad=40 grows Button 60→100).
  // Safety: board resize doesn't affect absolute children.
  storage.fitBoardHeight = function (opts) {
    opts = opts || {};
    const pad = opts.pad == null ? 0 : opts.pad;
    const minGrow = opts.minGrow == null ? 2 : opts.minGrow;
    // maxGrow guardrail (default 160): this engine has a dangerous trait — **it can swallow a "misplaced child" into the board, legitimizing the misalignment**.
    // A board only needs to grow tens of px to be "real content overflow"; once it needs to grow hundreds of px, that must be a child misplaced,
    // the correct fix is to move the child, not inflate the board (after inflating, the audit sees "the child is inside the board" and passes = false negative).
    const maxGrow = opts.maxGrow == null ? 160 : opts.maxGrow;
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    const log = [], suspect = [];
    const walk = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      kids.forEach((k) => { if (rec(k)) walk(k); });      // depth-first then parent (a child board growing affects the parent board maxB)
      if (node.type === 'board' && node !== head) {
        let maxB = -Infinity, worst = null;
        kids.forEach((k) => { const b = k.y + k.height; if (isFinite(b) && b > maxB) { maxB = b; worst = k; } });
        if (isFinite(maxB)) {
          const needH = Math.ceil(maxB + pad - node.y);
          const grow = needH - node.height;
          if (grow > minGrow) {
            const rec_ = { board: node.name, from: Math.round(node.height), to: needH, grow: Math.round(grow), deepestChild: worst ? (worst.name || worst.type) + '@' + Math.round(worst.y) : null };
            if (grow > maxGrow) { suspect.push(Object.assign({ reason: 'grow ' + Math.round(grow) + 'px > maxGrow ' + maxGrow + ' - likely a MISPLACED child, fix the child not the board' }, rec_)); return; }
            if (apply) { try { node.resize(node.width, needH); } catch (e) { log.push({ board: node.name, err: String(e).slice(0, 50) }); return; } }
            log.push(rec_);
          }
        }
      }
    };
    walk(head); walk(head);                                // two-round convergence
    return { apply: apply, boards: log.length, plan: log, suspect: suspect, refused: suspect.length };
  };

  // ---- S3 PageRoot height insufficient ----
  storage.fitRootHeight = function (opts) {
    opts = opts || {};
    const pad = opts.pad == null ? 80 : opts.pad;
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    let maxB = -Infinity;
    Array.from(head.children).forEach((k) => { const b = k.y + k.height; if (isFinite(b) && b > maxB) maxB = b; });
    const need = Math.ceil(maxB + pad - head.y);
    if (need > head.height + 2) { const from = Math.round(head.height); if (apply) head.resize(head.width, need); return { apply: apply, grew: true, from: from, to: need }; }
    return { apply: apply, grew: false, h: Math.round(head.height) };
  };

  // ---- S4 right-side overflow (right-aligned text box too wide, etc.) ----
  // Criterion: a child's "visual rect" right edge exceeds the board right +1px → shift left to inside the board right minus inset.
  storage.fixOverflowRight = function (opts) {
    opts = opts || {};
    const inset = opts.inset == null ? 24 : opts.inset;
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    const log = [];
    const walk = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      if (node !== head) {
        const br = node.x + node.width;
        for (const c of kids) {
          const cr = storage.visRect(c);
          if (cr.r > br + 1) {
            const shift = cr.r - (br - inset);
            log.push({ board: node.name, shape: c.name, text: c.type === 'text' ? String(c.characters).slice(0, 12) : undefined, from: Math.round(c.x), shift: Math.round(shift) });
            if (apply) moveX(c, c.x - shift);
          }
        }
      }
      kids.forEach((c) => { if (rec(c)) walk(c); });
    };
    walk(head);
    return { apply: apply, count: log.length, plan: log };
  };

  // ---- S7 row-overlap repair: re-row the gaps by actual board height ----
  // Why it's necessary: after fitBoardHeight grows a board to wrap its content, if the row length exceeds the **fixed row gap**,
  // the board presses onto the next row — this is a "fix action creating a new defect itself", invisible to an audit that only checks containment.
  // Why not just change board height: board height is decided by content, can't yield to the grid; **what must yield is the row gap**.
  // Key implementation: moving a board **does NOT** carry absolute children (api-pitfalls §10), the subtree must be translated as a whole.
  const moveToWorld = (s, wx, wy) => {
    try { s.parentX = wx - s.parent.x; s.parentY = wy - s.parent.y; return true; } catch (e1) {}
    try { s.x = wx; s.y = wy; return true; } catch (e2) {}
    return false;
  };
  const moveSubtree = (s, dx, dy) => {
    (kidsOf(s) || []).forEach((k) => moveSubtree(k, dx, dy));   // move descendants first (absolute → world coordinates), then the shell
    moveToWorld(s, s.x + dx, s.y + dy);
  };
  storage.moveSubtree = moveSubtree;

  storage.reflowRows = function (opts) {
    opts = opts || {};
    const gap = opts.gap == null ? 60 : opts.gap;
    const xtol = opts.xtol == null ? 8 : opts.xtol;
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    const tops = Array.from(head.children).filter((c) => c.type === 'board' && c !== head);
    const cols = [];
    tops.forEach((b) => {
      let col = cols.find((c) => Math.abs(c.x - b.x) <= xtol);
      if (!col) { col = { x: Math.round(b.x), items: [] }; cols.push(col); }
      col.items.push(b);
    });
    const log = [];
    let maxBottom = -Infinity, overlapsBefore = 0;
    cols.forEach((col) => {
      col.items.sort((a, b) => a.y - b.y);
      // count overlaps before repair, to judge whether there's truly a problem
      for (let i = 0; i + 1 < col.items.length; i++) {
        if (col.items[i].y + col.items[i].height > col.items[i + 1].y + 1) overlapsBefore++;
      }
      let cursor = col.items[0].y;
      col.items.forEach((b) => {
        const dy = cursor - b.y;
        if (Math.abs(dy) > 1) { log.push({ board: b.name, dy: Math.round(dy), from: Math.round(b.y), to: Math.round(cursor) }); if (apply) moveSubtree(b, 0, dy); }
        cursor += b.height + gap;
      });
      const bottom = cursor - gap;
      if (bottom > maxBottom) maxBottom = bottom;
    });
    return { apply: apply, cols: cols.length, overlapsBefore: overlapsBefore, moved: log.length, plan: log, suggestedRootH: Math.ceil(maxBottom + 80 - head.y) };
  };

  // ---- run all at once (order matters: horizontal reposition → vertical grow → right edge trim → re-row gaps → finally shrink root board) ----
  // Note reflowRows must come **after** fitBoardHeight (re-row uses the post-grow real heights),
  // and fitRootHeight must come **after** reflowRows (root height uses the post-reflow real bottom).
  // ---- S12b `stroke_clipped`: a stroke band cropped by a clip ----
  // The geometry of audit_layout's `stroke_clipped` reversed into a repair, with the two causes kept apart:
  //   · a layer **authored to sit outside** its host (`ring·*`, `hitpad·*`, glow/shadow) is that host's own state —
  //     release the host clip (a board clips **by default**, api-pitfalls §4) so the ring renders as a ring;
  //   · any other stroked box is a mis-placed overlay — pull its box inside the clip so the border survives at the
  //     clip edge instead of vanishing.
  // A clip registered by `CF.keepClip` (a `clip·*` frame, a cover crop, an avatar) is the design itself and is never
  // released; those shapes are clamped. Dry-run by default: read `plan`, then call with {apply:true}.
  storage.fixClippedStrokes = function (opts) {
    opts = opts || {};
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    const OUT = /^(ring·|hitpad·|shadow|glow|scrim|state·layer)/;
    const KEEP = storage._clipKeep || {};
    const clipperOf = (n) => { let p = n.parent, d = 0; while (p && d++ < 24) { try { if (p.clipContent && p.width > 1 && p.height > 1) return p; } catch (e) { return null; } p = p.parent; } return null; };
    // how much of each side band lies outside the clip box (px). inner→band is [x, x+w]; center→[x-w/2, x+w/2]; outer→[x-w, x].
    const outside = (s, c) => {
      const st = (s.strokes || [])[0] || {};
      const w0 = st.strokeWidth || 1, al = st.strokeAlignment || 'center';
      const out = al === 'outer' ? w0 : (al === 'center' ? w0 / 2 : 0);
      const th = out + (al === 'inner' ? w0 : (al === 'center' ? w0 / 2 : 0));
      const o = { L: Math.max(0, Math.min(th, c.x - (s.x - out))), R: Math.max(0, Math.min(th, (s.x + s.width + out) - (c.x + c.width))),
                  T: Math.max(0, Math.min(th, c.y - (s.y - out))), B: Math.max(0, Math.min(th, (s.y + s.height + out) - (c.y + c.height))) };
      const hit = []; for (const k in o) if (o[k] > th * 0.25) hit.push(k);
      return { hit, th, o };
    };
    const moveXY = (s, wx, wy) => { try { s.parentX = wx - s.parent.x; s.parentY = wy - s.parent.y; return true; } catch (e1) { try { s.x = wx; s.y = wy; return true; } catch (e2) { return false; } } };
    const log = [], refused = [];
    const walk = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      for (const s of kids) {
        try {
          if ((s.strokes || []).length && s.type !== 'text') {
            const c = clipperOf(s);
            if (c) {
              const bs = outside(s, c);
              if (bs.hit.length) {
                const crops = KEEP[c.id] || /^clip·/.test(String(c.name || ''));
                const wantsOverflow = OUT.test(String(s.name || ''));
                const row = { shape: String(s.name || s.type).slice(0, 40), host: String(c.name || '').slice(0, 30),
                  sides: bs.hit.join(''), sw: bs.th, fix: (wantsOverflow && !crops) ? 'release-clip' : 'clamp' };
                if (row.fix === 'release-clip') { if (apply) { try { c.clipContent = false; } catch (e) { row.err = String(e).slice(0, 40); } } log.push(row); }
                else if (crops && wantsOverflow) {
                  // Same decision `ctx.ring` now makes at birth: the crop stays a crop and the overflowing layer is
                  // re-mounted one level up, at the world box it was authored at.
                  row.fix = 'reparent'; row.host = String(((c.parent && c.parent.name) || 'page root')).slice(0, 30);
                  const gp = c.parent;
                  if (!gp || !(gp.width > 1 && gp.height > 1)) refused.push(Object.assign(row, { reason: 'no container above the crop to host an overflowing layer' }));
                  else {
                    if (apply) { try { storage.absMount(gp, s, s.x, s.y); } catch (e) { row.err = 'absMount: ' + String(e).slice(0, 40); } }
                    log.push(row);
                  }
                }
                else {
                  const x = Math.max(s.x, c.x), y = Math.max(s.y, c.y);
                  const r = Math.min(s.x + s.width, c.x + c.width), b = Math.min(s.y + s.height, c.y + c.height);
                  row.from = Math.round(s.width) + '×' + Math.round(s.height); row.to = Math.round(r - x) + '×' + Math.round(b - y);
                  if (r - x < 4 || b - y < 4) { refused.push(Object.assign(row, { reason: 'the clip leaves no room for the band; move the layer out of the clipped host' })); }
                  else {
                    if (apply) {
                      const wasAbs = !!(s.layoutChild && s.layoutChild.absolute);
                      if (!moveXY(s, x, y)) row.err = 'move rejected';
                      try { s.resize(r - x, b - y); } catch (e2) { row.err = 'resize: ' + String(e2).slice(0, 30); }
                      // the radius is NOT re-clamped here: `borderRadius` only ever holds a ladder token value and the
                      // renderer clamps an over-large corner itself (measured 2026-10-21), so writing min(w,h)/2 back
                      // would turn a bound pill into an orphan number.
                      if (wasAbs) { try { s.layoutChild.absolute = true; } catch (e4) {} }   // R5: resize downgrades a flow child
                    }
                    log.push(row);
                  }
                }
              }
            }
          }
        } catch (e) { /* one bad node must not stop the sweep */ }
        if (rec(s)) walk(s);
      }
    };
    walk(head);
    return { apply: apply, shapes: log.length, plan: log.slice(0, 40), refused: refused,
             released: log.filter((r) => r.fix === 'release-clip').length,
             clamped: log.filter((r) => r.fix === 'clamp').length,
             reparented: log.filter((r) => r.fix === 'reparent').length };
  };

  // ---- G15 native guides (S13 no_guides) ----
  // A board at the tier's baseline width IS a screen, and a screen must carry the grid it was laid out on: native
  // column guides + a fold ruler (`LY.guides`), never hand-drawn column rectangles. `R0.runOne` seeds this at birth;
  // this is the sweep for boards drawn before that gate existed. Idempotent: a board that already has any guide is
  // counted, not re-seeded (whole-array assignment cannot be appended to, so a second seed would duplicate the grid).
  storage.seedGuides = function (opts) {
    opts = opts || {};
    const apply = !!opts.apply, tier = opts.tier || 'web';
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root) || root;
    const plan = [], done = [];
    const walk = (n) => {
      const kids = kidsOf(n); if (!kids) return;
      for (const b of kids) {
        try {
          if (b.type === 'board' && storage.LY && storage.LY.tierFor) {
            const t = storage.LY.tierFor(b.width);
            if (t === tier && Math.abs(Math.round(b.width) - storage.LY.TIERS[t].w) <= 1 && b.height >= (opts.minH || 300)) {
              const gc = storage.NL && storage.NL.guideCount ? storage.NL.guideCount(b) : null;
              if (gc && gc.guides === 0 && gc.ruler === 0) {
                const row = { board: b.name, w: Math.round(b.width), h: Math.round(b.height) };
                plan.push(row);
                if (apply) {
                  const r = storage.LY.guides(b, { tier: t });
                  row.guides = r.guides; row.fold = r.fold; row.err = r.err || r.colErr || null;
                  done.push(row);
                }
              }
            }
          }
          if (rec(b)) walk(b);
        } catch (e) { /* one bad board must not stop the sweep */ }
      }
    };
    walk(head);
    return { apply: apply, tier: tier, boards: plan.length, seeded: apply ? done.length : 0, plan: plan.slice(0, 40) };
  };

  // ---- §2 whitespace: the repair twin of audit_design rules 32/33/34 (`breathe`)
  // The gate owns the verdict; this only aims the file at it. It reads the ladder from `LY.breath()` and the shape
  // filters from `storage.breathSpec` (published by audit_design.js), so a fixer cannot invent a floor the auditor does
  // not use, and every new gap is the NEXT `LY.SPACE` member — raising whitespace must never create an `off_scale_gap`.
  // Idempotent: a container already at or above the target is not written, so a re-run reports `raised: 0`.
  storage.breathe = function (opts) {
    opts = opts || {};
    const LY = storage.LY;
    if (!LY || !LY.breath) return { err: 'layout_engine.js must export LY.breath — LY.BREATH is the single source of the whitespace ladder' };
    const apply = !!opts.apply, BS = storage.breathSpec || {};
    const blockMin = BS.blockMin || 24, minLeading = BS.minLeading || 1.2;
    const EX = BS.exempt ? new RegExp(BS.exempt) : /^(ring·|hitpad·|divider|hairline)/;
    const AN = BS.anno ? new RegExp(BS.anno) : /^(fold·|region·)/;
    const cap = opts.maxRaise || LY.SPACE[LY.SPACE.length - 1];
    const rd = (o, k, d) => { try { const v = o[k]; return Number.isFinite(v) ? v : d; } catch (e) { return d; } };
    const nmOf = (s) => { try { return String(s.name || ''); } catch (e) { return ''; } };
    const isTxt = (s) => { try { return s.type === 'text'; } catch (e) { return false; } };
    const isInst = (s) => { try { return typeof s.isComponentInstance === 'function' && s.isComponentInstance(); } catch (e) { return false; } };
    const absChild = (k) => { try { return !!(k.layoutChild && k.layoutChild.absolute); } catch (e) { return true; } };
    const flexOf = (s) => { try { return s.flex || null; } catch (e) { return null; } };
    const dirCol = (fx) => String(fx.dir || 'column') !== 'row';
    const gapOf = (fx) => rd(fx, dirCol(fx) ? 'rowGap' : 'columnGap', 0);
    const blockish = (k, col) => !absChild(k) && !AN.test(nmOf(k)) && !EX.test(nmOf(k)) &&
      !/-PageRoot$|-Header$|-Footer$/.test(nmOf(k)) &&
      (col ? rd(k, 'height', 0) : Math.min(rd(k, 'width', 0), rd(k, 'height', 0))) >= blockMin;
    /** The next `LY.SPACE` member at or above v (capped): the repair stays on the scale by construction. */
    const stepUp = (v) => { const up = LY.SPACE.filter((s) => s >= v)[0]; return up === undefined ? cap : Math.min(up, cap); };
    /** The repair twin of `audit_design`'s run test: a uniform run of repeated items is one group, and raising its gap to
        the inline floor or to 2× the inner gap would inflate a data table into a page of air. `grouped` (a run of stacked
        cards) still gets the floor — a column of touching cards really is cramped. */
    const runOf = function (blocks, col) {
      if (blocks.length < 3) return null;
      const ext = blocks.map((k) => rd(k, col ? 'height' : 'width', 0));
      const pitch = [];
      for (let i = 1; i < blocks.length; i++) pitch.push(rd(blocks[i], col ? 'y' : 'x', 0) - rd(blocks[i - 1], col ? 'y' : 'x', 0));
      const flat = (a) => a.every((v) => Math.abs(v - a[0]) <= 2);
      if (!flat(ext) || !flat(pitch)) return null;
      const grouped = blocks.some(function (k) {
        const g = flexOf(k); if (!g) return false;
        return dirCol(g) && Array.from(kidsOf(k) || []).filter((c) => blockish(c, dirCol(g))).length >= 2;
      });
      return { grouped: grouped };
    };
    /** The leading the ramp itself declares for this step — the TIGHTEST of the candidates, so the fixer never demands
        more air than the typography token claims (22/600 is both `type.h6` at 1.2 and `type.button` at 1.5). */
    const leadFloor = function (fs, weight) {
      if (BS.lead && BS.lead[Number(fs)] !== undefined) return Number(BS.lead[Number(fs)]);
      const tk = storage.TK;
      if (!tk || !tk.typeIndex) return minLeading;
      try {
        const ti = tk.typeIndex();
        const list = ti.step[Number(fs) + '|' + Number(weight || 400)] || ti.ramp.filter((r) => Number(r.size) === Number(fs));
        const ls = (list || []).map((r) => Number(r.leading)).filter((l) => l > 0);
        return ls.length ? Math.min.apply(null, ls) : minLeading;
      } catch (e) { return minLeading; }
    };
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root) || root;
    const plan = [], textPlan = [], changed = [];
    let raised = 0, textFixed = 0;
    const walk = function (s) {
      // The leading check runs BEFORE the kids guard: a text has no children, so `if (!kids) return` used to short-circuit
      // every paragraph in the file past rule 34a (measured 2026-10-21 on the whitespace probe — 4 containers planned, 0 texts).
      if (isTxt(s) && opts.text !== false) {
        const fsV = (() => { const v = parseFloat(String(s.fontSize)); return Number.isFinite(v) ? v : 14; })();
        const wt = (() => { const v = parseInt(s.fontWeight, 10); return Number.isFinite(v) ? v : 400; })();
        const fam = (() => { try { return s.fontFamily; } catch (e) { return null; } })();
        let lhRaw = NaN; try { lhRaw = parseFloat(String(s.lineHeight)); } catch (e) {}
        if (Number.isFinite(lhRaw) && lhRaw > 0) {
          const one = storage.CF && storage.CF.lineH ? storage.CF.lineH(fsV, wt, fam) : fsV * 1.5;
          const want = leadFloor(fsV, wt);
          if ((rd(s, 'height', 0) >= one * 1.8 || lhRaw < 1) && lhRaw < want - 0.02) {
            textFixed++;
            textPlan.push({ name: nmOf(s).slice(0, 40), fs: Math.round(fsV), from: lhRaw, to: want });
            if (apply) { try { s.lineHeight = String(want); } catch (e) { textFixed--; } }
          }
        }
      }
      const kids = kidsOf(s); if (!kids) return;
      for (const k of kids) { if (!isInst(k)) walk(k); }        // bottom-up; an instance's interior belongs to its master
      const fx = flexOf(s);
      if (fx) {
        const col = dirCol(fx), gap = gapOf(fx);
        const tier = LY.tierFor ? LY.tierFor(rd(s, 'width', 1440)) : 'web';
        const floor = LY.breath('inline', tier);
        const blocks = Array.from(kids).filter((k) => blockish(k, col));
        if (blocks.length >= 2) {
          let want = gap;
          const run = runOf(blocks, col);
          // A ROW may abut by contract (§1.3 panes/segments touch with a hairline): the floor binds a row only when its
          // members are cards (each with a stacked interior) or when the row already tried to separate them.
          const cards = col ? blocks.length : blocks.filter(function (k) {
            const g = flexOf(k); if (!g) return false;
            return Array.from(kidsOf(k) || []).filter((c) => blockish(c, dirCol(g))).length >= 2;
          }).length;
          if (!(gap === 0 && !col && cards < 2) && gap < floor && !(run && !run.grouped)) want = floor;
          let inner = 0;
          // Same scope as rule 33: only a child that is itself a stacked group contributes an inner gap. The 16px inside
          // a table row is the gap between its CELLS and would inflate every matrix on the file.
          blocks.forEach(function (k) {
            const g = flexOf(k); if (!g || !dirCol(g)) return;
            const v = gapOf(g); if (v < floor) return;
            if (Array.from(kidsOf(k) || []).filter((c) => blockish(c, true)).length < 2) return;
            inner = Math.max(inner, v);
          });
          if (inner && gap < 2 * inner - 0.5 && !(run && !run.grouped)) want = Math.max(want, stepUp(2 * inner));
          // 34b: consecutive wrapped paragraphs need a line of air, which is a taller order than the `inline` floor.
          if (col) {
            const proseMin = BS.proseMin || 240;
            const prose = (t) => isTxt(t) && rd(t, 'width', 0) >= proseMin &&
              rd(t, 'height', 0) >= (storage.CF && storage.CF.lineH ? storage.CF.lineH(parseFloat(String(t.fontSize)) || 14, 400, null) : 21) * 1.8;
            for (let i = 0; i + 1 < blocks.length; i++) {
              if (!prose(blocks[i]) || !prose(blocks[i + 1])) continue;
              const one = storage.CF && storage.CF.lineH ? storage.CF.lineH(parseFloat(String(blocks[i].fontSize)) || 14, 400, null) : 21;
              want = Math.max(want, stepUp(one));
            }
          }
          if (want > gap) {
            plan.push({ name: nmOf(s).slice(0, 46), axis: col ? 'row' : 'column', from: Math.round(gap), to: Math.round(want),
              blocks: blocks.length, inner: Math.round(inner) });
            if (apply) { try { fx[col ? 'rowGap' : 'columnGap'] = want; changed.push(s); raised++; } catch (e) {} }
          }
        }
      }
    };
    walk(head);
    let fit = null;
    if (apply && (raised || textFixed)) {
      // A hug frame only recomputes when it sees itself dirtied (api-pitfalls §15), so every changed container and its
      // ancestors get a no-op flex write, then the board/root heights are re-fitted by this file's own engines.
      changed.forEach(function (n) { let p = n; for (let i = 0; i < 8 && p; i++) { try { if (p.flex) { const g = p.flex.rowGap; p.flex.rowGap = g; } } catch (e) {} p = p.parent; } });
      if (opts.fit !== false) {
        fit = {};
        try { if (storage.fitBoardHeight) fit.boardH = storage.fitBoardHeight({ apply: true }); } catch (e) {}
        try { if (storage.fitRootHeight) fit.rootH = storage.fitRootHeight({ apply: true }); } catch (e) {}
      }
    }
    return { apply: apply, containers: plan.length, raised: raised, texts: textPlan.length, textFixed: textFixed,
      plan: plan.slice(0, 30), textPlan: textPlan.slice(0, 15), fit: fit };
  };

  storage.fixGeometryAll = function (apply) {
    const a = !!apply;
    return {
      column: storage.fixColumnOffset({ apply: a }),
      boardH: storage.fitBoardHeight({ apply: a }),
      overflowR: storage.fixOverflowRight({ apply: a }),
      reflow: storage.reflowRows({ apply: a }),
      stroke: storage.fixClippedStrokes({ apply: a }),
      guides: storage.seedGuides({ apply: a }),
      breath: storage.breathe({ apply: a }),
      rootH: storage.fitRootHeight({ apply: a })
    };
  };

  return { seeded: true, fns: ['visRect', 'moveSubtree', 'fixColumnOffset', 'fitBoardHeight', 'reflowRows', 'fitRootHeight', 'fixOverflowRight', 'fixClippedStrokes', 'seedGuides', 'breathe', 'fixGeometryAll'] };
})();
