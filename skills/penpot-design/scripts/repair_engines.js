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

  // ---- fixStaleCenter：stale-center 指纹精准修复（仅修「陈旧瞬态宽高」烤进坐标的居中错位）----
  // 指纹：文本**左上角**恰好落在宿主中心点（|t.x−hcx|≤2 或 |t.y−hcy|≤2），但文本真实中心
  //   与宿主中心偏差 >0.5 —— 这是「用创建瞬间 1×1 瞬态宽高算 (w−1)/2」的算术后果；
  //   刻意左对齐/内缩的文本只会落在 host.x+padding（12/16/18/24…），绝不会贴住中心点，
  //   因此按此指纹修复**零误伤**。按轴独立判定与修复（可能只偏一个轴）。
  // 与 alignPage 的分工：alignPage 吸附 ≤6px 的微差；本引擎专治 6px 以上、指纹命中的大偏移。
  // 引入缺陷兜底（G8）：只移动命中指纹的文本坐标，不改层级/样式；盲居中类误伤由指纹条件排除。
  storage.fixStaleCenter = (root) => {
    root = root || rootOf();
    const log = [];
    const walk = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      const hosts = kids.filter((h) => (h.type === 'rectangle' || h.type === 'ellipse' || h.type === 'board') && h.width >= 16 && h.height >= 16);
      for (const c of kids) {
        try {
          const isFlow = c.layoutChild && c.layoutChild.absolute === false;
          if (c.type === 'text' && !isFlow) {
            let host = null, ha = Infinity;
            const tcx = c.x + c.width / 2, tcy = c.y + c.height / 2;
            for (const h of hosts) {
              if (tcx >= h.x - 2 && tcx <= h.x + h.width + 2 && tcy >= h.y - 2 && tcy <= h.y + h.height + 2) {
                const a = h.width * h.height; if (a < ha) { ha = a; host = h; }
              }
            }
            if (host && c.width <= host.width && c.height <= host.height) {
              const hcx = host.x + host.width / 2, hcy = host.y + host.height / 2;
              const nx = hcx - c.width / 2, ny = hcy - c.height / 2;
              const sx = Math.abs(c.x - hcx) <= 2 && Math.abs(c.x - nx) > 0.5;
              const sy = Math.abs(c.y - hcy) <= 2 && Math.abs(c.y - ny) > 0.5;
              if (sx || sy) {
                const ox = c.x - nx, oy = c.y - ny;
                try { if (sx) c.parentX = nx - c.parent.x; if (sy) c.parentY = ny - c.parent.y; }
                catch (e) { if (sx) c.x = nx; if (sy) c.y = ny; }
                log.push([host.name, String(c.characters).slice(0, 8), sx ? (sy ? 'xy' : 'x') : 'y',
                          (sx ? ox : oy).toFixed(1)]);
              }
            }
          }
        } catch (e) {}
        walk(c);
      }
    };
    walk(root);
    return { fixes: log.length, log: log.slice(0, 40) };
  };

  // ---- groupAssemblies：装配成组（装配归属契约：penpot-structure.md §4）----
  // 同父级内「宿主（rect/ellipse ≥24）+ 中心落在宿主内、且最小宿主就是它」的兄弟图元
  // → penpot.group([host, ...members]) 成组，组名 = 宿主名。禁止散件同级堆叠。
  // 由内而外（面积升序）处理，天然支持嵌套：内层先成组，外层把内层组当普通成员收编
  // （按钮组进导航条）；板是分区容器，不做装配宿主；流式子图元跳过（归 flex 管）。
  // 幂等：已在同一 group/组件内的装配不重复成组；只动层级，不动坐标/样式。
  // 升级路径：单次装配=group；要复用/进 13 索引 → `createComponent([group])` 升级为组件，
  // 页面一律 `comp.instance()`（注册纪律见 penpot-structure.md §4）。
  storage.groupAssemblies = (root) => {
    root = root || rootOf();
    const log = [];
    const isFlow = (s) => !!(s.layoutChild && s.layoutChild.absolute === false);
    const walk = (node) => {
      if (node.isComponentInstance && node.isComponentInstance()) return;  // 实例内部是锁定副本，不动
      const kids0 = kidsOf(node); if (!kids0) return;
      for (const c of kids0.slice()) if (c.type === 'board' || c.type === 'group') walk(c);  // 先内层
      const kids = kidsOf(node); if (!kids) return;
      const byArea = kids
        .filter((h) => (h.type === 'rectangle' || h.type === 'ellipse' || h.type === 'board') && h.width >= 24 && h.height >= 24 && !isFlow(h))
        .sort((a, b) => a.width * a.height - b.width * b.height);
      const taken = new Set();      // 已被收编的成员
      const live = kids.slice();    // 成员代行者列表（成组后由组顶替）
      for (const h of byArea) {
        try {
          if (taken.has(h.id)) continue;   // 已作为成员进了内层组
          const members0 = live.filter((s) => s !== h && !taken.has(s.id) && !isFlow(s) &&
            s.x + s.width / 2 >= h.x && s.x + s.width / 2 <= h.x + h.width &&
            s.y + s.height / 2 >= h.y && s.y + s.height / 2 <= h.y + h.height);
          const members = members0.filter((s) => {
            const scx = s.x + s.width / 2, scy = s.y + s.height / 2;
            let smallest = h, sa = h.width * h.height;
            for (const h2 of byArea) {
              if (h2 === h || taken.has(h2.id)) continue;   // 已收编的内层宿主让位给其组
              if (scx >= h2.x && scx <= h2.x + h2.width && scy >= h2.y && scy <= h2.y + h2.height && h2.width * h2.height < sa) { smallest = h2; sa = h2.width * h2.height; }
            }
            return smallest === h;
          });
          if (!members.length) continue;
          // ⚠️ parent 每次访问生成新代理，`===` 恒 false（api-pitfalls children 代理坑）——必须按 id 比较
          const pid = h.parent ? h.parent.id : null;
          if (pid && (h.parent.type === 'group' || (h.parent.isComponentRoot && h.parent.isComponentRoot())) &&
              members.every((m) => m.parent && m.parent.id === pid)) continue;
          // ⚠️ penpot.group 有破坏性副作用（api-pitfalls §6.1）：组落 flex 流位 + 成员偏移 −minParentXY。
          // 补偿式成组：先捕获 bbox 的 min parentXY，成组后逃出流（absolute）并复位，readback 校验。
          const all = [h].concat(members);
          const minPX = Math.min.apply(null, all.map((s) => s.parentX));
          const minPY = Math.min.apply(null, all.map((s) => s.parentY));
          const maxPI = Math.max.apply(null, all.map((s) => s.parentIndex || 0));  // z：组占顶层成员的层槽
          const g = penpot.group(all);
          if (g) {
            try { g.name = h.name; } catch (e) {}
            try { g.layoutChild.absolute = true; } catch (e) {}
            // z 修复：penpot.group 会打乱成员前后序（实测标签被底板盖住）→ 组内面积降序重排
            try {
              const inner = Array.from(g.children).sort((a, b) => (b.width * b.height) - (a.width * a.height));
              for (let zi = 0; zi < inner.length; zi++) inner[zi].setParentIndex(zi);
            } catch (e) {}
            try { g.setParentIndex(maxPI); } catch (e) {}
            try { g.parentX = minPX; g.parentY = minPY; } catch (e) {}
            // readback 校验（写入可能静默失败）；失败按世界坐标重试一次
            if (Math.abs(g.parentX - minPX) > 1 || Math.abs(g.parentY - minPY) > 1) {
              try { g.x = node.x + minPX; g.y = node.y + minPY; } catch (e) {}
            }
            members.forEach((m) => taken.add(m.id));
            taken.add(h.id);
            live.push(g);   // 组顶替成员，供外层宿主收编（嵌套）
            log.push([g.name, members.length + 1]);
          }
        } catch (e) {}
      }
    };
    walk(root);
    return { groups: log.length, log: log.slice(0, 40) };
  };

  // ---- fixZOrder：组内前后顺序修复（z 语义：parentIndex 越大越靠前，0=最底）----
  // penpot.group 对成员 z 序不透明（实测会把底板排到标签上面 → 标签被盖住）。
  // 规则：组内按**面积降序**重排（大底板在下、文字/图标在上），setParentIndex(i) 逐个落位。
  // 与 groupAssemblies 配套：每轮成组后跑一次；export 小形状组可能命中导出缓存假象，
  // 验证 z 序请导出**整板**（api-pitfalls §6.1）。
  storage.fixZOrder = (root) => {
    root = root || rootOf();
    let fixed = 0;
    const walk = (node) => {
      if (node.isComponentInstance && node.isComponentInstance()) return;
      let kids; try { kids = kidsOf(node); } catch (e) { return; }
      if (!kids) return;
      if (node.type === 'group' && kids.length > 1) {
        const target = kids.slice().sort((a, b) => (b.width * b.height) - (a.width * a.height));
        for (let i = 0; i < target.length; i++) {
          try { if (target[i].parentIndex !== i) { target[i].setParentIndex(i); fixed++; } } catch (e) {}
        }
      }
      kids.forEach((c) => { if (c.type === 'group' || c.type === 'board') walk(c); });
    };
    walk(root);
    return fixed;
  };

  return { seeded: true, fns: ['alignPage', 'vAlignPage', 'fixInner', 'unclip', 'cleanOrphans', 'fixStaleCenter', 'groupAssemblies', 'fixZOrder'] };
})();
