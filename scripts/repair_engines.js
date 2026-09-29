// repair_engines.js —— 审查修复引擎（alignPage / vAlignPage / fixInner / unclip）
// 用法：整份粘贴进 execute_code 执行一次（字面量函数入 storage 跨调用复用）；
//       之后逐页调用 storage.alignPage() 等，每次调用前核对 penpot.currentPage.name。
// 机理、误伤恢复与 gridSnap 模板：references/engines.md；坐标/描边陷阱：references/api-pitfalls.md。
// 约定：修复日志返回 [位置, 内容, 轴, 偏移] 供人工复核，确认后再进下一页。

return (function () {
  const rootOf = () => penpot.currentPage.root || penpot.root;
  const headOf = (root) => root.children.find(c => c.type === 'board');  // 别用 children[0]（可能有孤儿文本）
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const move = (s, px, py) => {
    try { s.parentX = px; s.parentY = py; return true; } catch (e1) {}
    try { s.x = px; s.y = py; return true; } catch (e2) {}
    return false;
  };

  // ---- alignPage V4：宿主吸附对齐 ----
  // 文本找"包含其世界中心的最小宿主"（rect/ellipse，24≤边长，面积≤20000），本应居中
  // （垂直偏差≤6px、大宿主≤3px）则吸附宿主精确中心；页级直接文本跳过；
  // Breadcrumbs 流式重排；Tabs 按 120px 列居中。全程世界坐标（混用 parentX 会产生跨层级假包含）。
  storage.alignPage = () => {
    const root = rootOf();
    const head = headOf(root);
    if (!head) return { err: 'no head board' };
    const log = []; const errors = [];
    const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
    const rec = (s) => s.type === 'board' || isVC(s);
    function collectHosts(node, hosts) {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if ((c.type === 'rectangle' || c.type === 'ellipse') && c.width >= 24 && c.height >= 24 && c.width * c.height <= 20000) hosts.push(c);
          if (rec(c)) collectHosts(c, hosts);
        } catch (e) { errors.push('ch:' + e.message); }
      }
    }
    function walk(node) {
      const kids = kidsOf(node); if (!kids) return;
      const hosts = []; collectHosts(node, hosts);
      for (const c of kids) {
        try {
          if (c.type === 'text' && c.parent !== head) {
            const tcx = c.x + c.width / 2, tcy = c.y + c.height / 2;   // 世界坐标
            let host = null, ha = Infinity;
            for (const h of hosts) {
              if (tcx >= h.x && tcx <= h.x + h.width && tcy >= h.y && tcy <= h.y + h.height) {
                const a = h.width * h.height;
                if (a < ha) { ha = a; host = h; }
              }
            }
            if (host) {
              const vc = host.y + host.height / 2, hc = host.x + host.width / 2;
              const ny = vc - c.height / 2, nx = hc - c.width / 2;
              const yTol = host.height >= 100 ? 3 : 6, xTol = host.width >= 100 ? 3 : 6;
              if (Math.abs(tcy - vc) <= yTol && Math.abs(c.y - ny) > 0.5)
                move(c, c.parentX, ny - c.parent.y) && log.push([node.name, c.characters.slice(0, 8), 'y']);
              if (Math.abs(tcx - hc) <= xTol && Math.abs(c.x - nx) > 0.5)
                move(c, nx - c.parent.x, c.parentY) && log.push([node.name, c.characters.slice(0, 8), 'x']);
            }
          }
          if (rec(c)) walk(c);
        } catch (e) { errors.push((c && c.name ? c.name : '?') + ':' + e.message); }
      }
    }
    walk(head);
    // Breadcrumbs 流式重排（x 累加实际渲染宽度 + 12 间距）
    for (const bc of head.children.filter(s => s.name === 'Breadcrumbs')) {
      const kids = bc.children.slice().sort((a, b) => a.parentX - b.parentX);
      let x = 0; const cy = bc.height / 2;
      for (const k of kids) { move(k, x, cy - k.height / 2); x += k.width + 12; }
    }
    // Tabs 按列居中（列宽 120）
    for (const tb of head.children.filter(s => s.name === 'Tabs')) {
      const labels = tb.children.filter(c => c.type === 'text').sort((a, b) => a.parentX - b.parentX);
      labels.forEach((t, i) => move(t, i * 120 + (120 - t.width) / 2, (tb.height - t.height) / 2));
    }
    return { fixes: log.length, errors: errors.slice(0, 5) };
  };

  // ---- vAlignPage：小板文本垂直居中（带堆叠守卫） ----
  // 小板（≤70px 高）内单行直接子文本垂直居中（偏差 5–15px 才触发）。
  // 堆叠守卫：同板 x 重叠≥50% 且 y 相差>4 的多行文本 = 刻意堆叠（步进钮＋/－、Progress 顶标签），跳过。
  storage.vAlignPage = () => {
    const root = rootOf();
    const head = headOf(root);
    if (!head) return { err: 'no head board' };
    const log = [];
    function walk(node) {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (node !== head && node.type === 'board' && node.height <= 70 && c.type === 'text' && c.height <= 30) {
            const stacked = kids.some(k => k !== c && k.type === 'text'
              && (Math.min(c.parentX + c.width, k.parentX + k.width) - Math.max(c.parentX, k.parentX)) > Math.min(c.width, k.width) * 0.5
              && Math.abs(c.parentY - k.parentY) > 4);
            if (!stacked) {
              const dy = node.height / 2 - (c.parentY + c.height / 2);
              if ((dy >= 5 && dy <= 15) || (dy <= -5 && dy >= -15)) {
                c.parentY = c.parentY + dy;
                log.push([node.name, c.characters.slice(0, 10), Math.round(dy * 10) / 10]);
              }
            }
          }
          const k = kidsOf(c); if (k) walk(c);
        } catch (e) {}
      }
    }
    walk(head);
    return { fixes: log.length, sample: log.slice(0, 12) };
  };

  // ---- fixInner：描边批修（闭合形状→inner，路径→center） ----
  storage.fixInner = () => {
    const root = rootOf();
    let closed = 0, open = 0;
    function walk(node) {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (c.strokes && c.strokes.length) {
            const want = c.type === 'path' ? 'center' : 'inner';
            if (c.strokes.some(st => st.strokeAlignment !== want)) {
              c.strokes = c.strokes.map(st => Object.assign({}, st, { strokeAlignment: want }));
              want === 'inner' ? closed++ : open++;
            }
          }
          walk(c);
        } catch (e) {}
      }
    }
    walk(root);
    return { closed, open };
  };

  // ---- unclip：解除板裁剪（修复辉光不可见） ----
  storage.unclip = () => {
    const root = rootOf();
    let n = 0;
    function walk(node) {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (c.type === 'board' && c.clipContent === true) { c.clipContent = false; n++; }
          walk(c);
        } catch (e) {}
      }
    }
    walk(root);
    return n;
  };

  // ---- 清理根级孤儿文本（历史崩溃残留，会污染遍历） ----
  storage.cleanOrphans = () => {
    const root = rootOf();
    let n = 0;
    for (const c of root.children.slice()) if (c.type === 'text') { c.remove(); n++; }
    return n;
  };

  return { seeded: true, fns: ['alignPage', 'vAlignPage', 'fixInner', 'unclip', 'cleanOrphans'] };
})();
