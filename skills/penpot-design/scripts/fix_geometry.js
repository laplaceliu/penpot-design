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
  storage.fixGeometryAll = function (apply) {
    const a = !!apply;
    return {
      column: storage.fixColumnOffset({ apply: a }),
      boardH: storage.fitBoardHeight({ apply: a }),
      overflowR: storage.fixOverflowRight({ apply: a }),
      reflow: storage.reflowRows({ apply: a }),
      rootH: storage.fitRootHeight({ apply: a })
    };
  };

  return { seeded: true, fns: ['visRect', 'moveSubtree', 'fixColumnOffset', 'fitBoardHeight', 'reflowRows', 'fitRootHeight', 'fixOverflowRight', 'fixGeometryAll'] };
})();
