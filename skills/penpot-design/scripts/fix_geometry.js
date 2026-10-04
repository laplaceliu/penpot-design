// fix_geometry.js —— 几何修补引擎（四类签名，全部支持 dry-run）
// 用法：整份粘贴进 execute_code 执行一次（字面量函数入 storage 跨调用复用）；
//       然后逐页调用 storage.fixColumnOffset / fitBoardHeight / fitRootHeight / fixOverflowRight。
// 纪律：**先 {apply:false} 出清单人工复核，确认后再 {apply:true}**；每类修完立刻跑 audit_layout.js 复算。
// 机理与四类签名的判定见 references/positioning-audit.md。

return (function () {
  const headOf = (r) => { try { return Array.from(r.children).find((c) => c.type === 'board'); } catch (e) { return null; } };
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const rec = (s) => s.type === 'board' || isVC(s);
  const fsz = (s) => { const v = parseFloat(s.fontSize); return isFinite(v) ? v : 14; };
  const alignOf = (s) => { try { return s.horizontalAlign || s.align || 'left'; } catch (e) { return 'left'; } };

  // 与 audit_layout.js 同源的「文本视觉矩形」：宽文本框会假越界，必须按对齐方式估算实际字面范围
  storage.visRect = function (c) {
    if (c.type !== 'text') return { x: c.x, y: c.y, w: c.width, h: c.height, r: c.x + c.width, b: c.y + c.height };
    const f = fsz(c), n = String(c.characters || '').length;
    const est = Math.max(4, Math.min(c.width, n * f * 0.62 + 2));
    const a = alignOf(c);
    let vx = c.x; if (a === 'center') vx = c.x + (c.width - est) / 2; else if (a === 'right') vx = c.x + c.width - est;
    const vh = Math.max(4, Math.min(c.height, f * 1.35)), vy = c.y + (c.height - vh) / 2;
    return { x: vx, y: vy, w: est, h: vh, r: vx + est, b: vy + vh };
  };

  // 移动：优先 parentX/parentY（处处可用），兜底世界坐标 x/y
  const moveX = (s, wx) => { try { s.parentX = wx - s.parent.x; return true; } catch (e1) {} try { s.x = wx; return true; } catch (e2) {} return false; };

  // ---- S1 常量列偏移 ----
  // 症状：右列板的内容用了左列板的绝对 x，整块内容跑到板左侧（甚至压在邻板上）。
  // 判据：板内存在 x < board.x - 2 的直接子元素。
  // 平移量：dx = board.x - originX（originX = 内容撰写时使用的原点，默认 80）。
  // 注意与方案 A 失效区分：本签名是 **X 轴常量**偏移；方案 A 失效是 **Y 轴 -board.y** 偏移。
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

  // ---- S2 板高不足（内容溢出板底） ----
  // pad 默认 0：**组件母版（Button/Input/Toggle…）必须恰好等于内容尺寸**，
  // 给板统一加内边距会把母版撑大、破坏组件（实测教训：pad=40 会把 Button 60→100）。
  // 安全性：板 resize 不影响 absolute 子元素。
  storage.fitBoardHeight = function (opts) {
    opts = opts || {};
    const pad = opts.pad == null ? 0 : opts.pad;
    const minGrow = opts.minGrow == null ? 2 : opts.minGrow;
    // maxGrow 护栏（默认 160）：本引擎有个危险特性——**它能把「放错的子元素」吞进板里，从而把错位合法化**。
    // 板只需长大几十 px 才是"内容真的溢出"；一旦需要长高几百 px，那必是子元素被放错位置，
    // 正确修法是挪子元素，而不是把板撑大（撑大后审计看到"子元素在板内"就通过了 = 假阴性）。
    const maxGrow = opts.maxGrow == null ? 160 : opts.maxGrow;
    const apply = !!opts.apply;
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root); if (!head) return { err: 'no head board' };
    const log = [], suspect = [];
    const walk = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      kids.forEach((k) => { if (rec(k)) walk(k); });      // 先深层后父层（子板变高会影响父板 maxB）
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
    walk(head); walk(head);                                // 两轮收敛
    return { apply: apply, boards: log.length, plan: log, suspect: suspect, refused: suspect.length };
  };

  // ---- S3 PageRoot 高度不足 ----
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

  // ---- S4 右侧溢出（右对齐文本框超宽等） ----
  // 判据：子元素「视觉矩形」右边超出板右 +1px → 左移到板右内侧 inset 处。
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

  // ---- S7 行重叠修复：按实际板高重排行距 ----
  // 为什么必须要它：`fitBoardHeight` 把板长高以包住内容后，若行长超过**固定行距**，
  // 板就会压到下一行——这是「修复动作自己制造的新缺陷」，且只查包含性的审计看不出来。
  // 为什么不直接改板高：板高由内容决定，不能迁就网格；**要迁就的是行距**。
  // 关键实现：移动板**不会**带走 absolute 子元素（api-pitfalls §10），必须整体平移子树。
  const moveToWorld = (s, wx, wy) => {
    try { s.parentX = wx - s.parent.x; s.parentY = wy - s.parent.y; return true; } catch (e1) {}
    try { s.x = wx; s.y = wy; return true; } catch (e2) {}
    return false;
  };
  const moveSubtree = (s, dx, dy) => {
    (kidsOf(s) || []).forEach((k) => moveSubtree(k, dx, dy));   // 先动子孙（absolute → 世界坐标），再动壳
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
      // 统计修复前的重叠，便于判断是否真的有病
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

  // ---- 一次跑完（顺序有讲究：横向归位 → 纵向长高 → 右侧收边 → 重排行距 → 最后收根板） ----
  // 注意 reflowRows 必须在 fitBoardHeight **之后**（重排依据的是长高后的真实高度），
  // fitRootHeight 又必须在 reflowRows **之后**（根高依据的是重排后的真实底边）。
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
