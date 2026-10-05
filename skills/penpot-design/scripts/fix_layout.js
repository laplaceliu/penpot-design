// fix_layout.js —— flex-collapse batch repair (getDesignSize + absRow + fixCol, two-round convergence)
// Symptom: buttons/cards on the export squashed to text size (flex hug force-shrinks).
// Usage: paste the whole file into execute_code and run (directly on the target page, or store in storage and call page by page).
// Mechanics and approach decision: references/api-pitfalls.md §10; build engines mkAbsBoard/absMount: scripts/seed_storage.js.
// Order trap: absRow (row sizing) first, then fixCol (container fix); fixCol skips absolute subtrees —
// otherwise it re-squashes absolute elements back to content size (tested lesson).

return (function () {
  // Restore design size by name; null = container, no fixed size set.
  // ★ Rewrite this table per the target design system's component naming rules.
  const getDesignSize = (b) => {
    const n = b.name || '';
    if (n.startsWith('Button /')) return n.includes('Small 32') ? [120, 32] : n.includes('Large 48') ? [180, 48] : [160, 45];
    if (n.startsWith('Input /')) return n.includes('small 32') ? [200, 32] : n.includes('large 48') ? [320, 48] : [260, 40];
    if (n.startsWith('Tag /')) return [n.length > 12 ? 110 : 84, 32];
    if (n.startsWith('Card /')) return [200, 200];
    if (n === 'w') return [64, 40];
    if (n.startsWith('Progress /')) { const p = parseInt((n.split('/')[1] || '0')); return [400, p >= 90 ? 28 : p <= 40 ? 12 : 20]; }
    return null;
  };

  const absRow = (row) => {                    // all children absolute + horizontal placement within the row
    for (const c of row.children) if (c.type === 'board' && c.flex && c.flex.dir === 'row') absRow(c); // depth-first
    const gap = row.flex.columnGap || 0, padH = row.flex.horizontalPadding || 0, padV = row.flex.verticalPadding || 0;
    const kids = [...row.children];
    let maxH = 0;
    for (const c of kids) {
      try { c.layoutChild.absolute = true; } catch (e) {}
      const s = c.type === 'board' ? getDesignSize(c) : null;
      if (s) { try { c.resize(s[0], s[1]); } catch (e) {} }
      maxH = Math.max(maxH, c.height);
    }
    const rowH = Math.ceil(maxH + padV * 2);
    let cx = padH;
    for (const c of kids) {
      c.x = row.x + cx;
      c.y = row.y + Math.max(0, Math.round((rowH - c.height) / 2));
      cx += c.width + gap;
    }
    row.resize(Math.ceil(cx - gap + padH), rowH);   // row sizing (includes absolute children, safe)
  };

  const collectRows = (b, out) => {
    for (const c of b.children || []) {
      if (c.type === 'board' && c.flex) {
        if (c.flex.dir === 'row') out.push(c);
        collectRows(c, out);
      }
    }
  };

  const fixCol = (board, isRoot) => {           // only fix column containers; skip already-sized rows and absolute subtrees
    if (!board.flex) return;
    if (board.flex.dir === 'row') return;
    for (const c of board.children || []) {
      if (c.type !== 'board') continue;
      if (c.layoutChild && c.layoutChild.absolute) continue;
      if (c.flex && c.flex.dir === 'row') continue;
      fixCol(c, false);
    }
    let maxR = 0, maxB = 0;
    for (const c of board.children || []) {
      maxR = Math.max(maxR, (c.x - board.x) + c.width);
      maxB = Math.max(maxB, (c.y - board.y) + c.height);
    }
    if (maxB <= 0) return;
    const padH = board.flex.horizontalPadding || 0, padV = board.flex.verticalPadding || 0;
    const newW = isRoot ? board.width : Math.ceil(maxR + padH * 2);
    const newH = Math.ceil(maxB + padV * 2);
    if (Math.abs(board.width - newW) > 2 || Math.abs(board.height - newH) > 2) board.resize(newW, newH);
  };

  // Entry: every 'DS-'-prefixed board on the current page; two-round convergence
  const root = penpot.currentPage.root || penpot.root;
  const boards = root.children.filter(c => c.type === 'board' && c.name.startsWith('DS-'));  // ★ prefix = design system name, replace per actual naming
  for (let round = 0; round < 2; round++) {
    for (const rb of boards) {
      const rows = []; collectRows(rb, rows);
      for (const r of rows) absRow(r);
      fixCol(rb, true);
    }
  }
  let y = 100;
  for (const b of boards) { b.x = 100; b.y = y; y += b.height + 60; }  // vertical stack

  return { fixed: boards.length, page: penpot.currentPage.name };
})();
