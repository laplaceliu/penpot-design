// fix_layout.js —— flex 压塌批量修复（getDesignSize + absRow + fixCol，两轮收敛）
// 症状：导出图上按钮/卡片被压成文字大小（flex hug 强制收缩）。
// 用法：整份粘贴进 execute_code 执行（在目标页直接跑，或存 storage 后逐页调用）。
// 机理与方案决策：references/api-pitfalls.md §10；构建引擎 mkAbsBoard/absMount：scripts/seed_storage.js。
// 顺序陷阱：先 absRow（行定型）后 fixCol（容器修正）；fixCol 跳过 absolute 子树——
//           否则会把 absolute 元素重新压回内容尺寸（实测教训）。

return (function () {
  // 按名称恢复设计尺寸；null = 容器，不设固定尺寸。
  // ★ 按目标设计系统的组件命名规则改写本表。
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

  const absRow = (row) => {                    // 行内全员 absolute + 水平排位
    for (const c of row.children) if (c.type === 'board' && c.flex && c.flex.dir === 'row') absRow(c); // 先深后浅
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
    row.resize(Math.ceil(cx - gap + padH), rowH);   // 行定型（含 absolute 子元素，安全）
  };

  const collectRows = (b, out) => {
    for (const c of b.children || []) {
      if (c.type === 'board' && c.flex) {
        if (c.flex.dir === 'row') out.push(c);
        collectRows(c, out);
      }
    }
  };

  const fixCol = (board, isRoot) => {           // 只修 column 容器；跳过已定型的行与 absolute 子树
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

  // 入口：当前页每根 ds 前缀板；两轮收敛
  const root = penpot.currentPage.root || penpot.root;
  const boards = root.children.filter(c => c.type === 'board' && c.name.startsWith('DS-'));  // ★ 前缀=设计系统名，按实际命名替换
  for (let round = 0; round < 2; round++) {
    for (const rb of boards) {
      const rows = []; collectRows(rb, rows);
      for (const r of rows) absRow(r);
      fixCol(rb, true);
    }
  }
  let y = 100;
  for (const b of boards) { b.x = 100; b.y = y; y += b.height + 60; }  // 垂直堆叠

  return { fixed: boards.length, page: penpot.currentPage.name };
})();
