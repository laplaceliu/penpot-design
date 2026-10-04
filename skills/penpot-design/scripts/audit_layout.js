// audit_layout.js —— 定位审计引擎（只读，不改任何形状）
// 用法：整份粘贴进 execute_code 执行一次（字面量函数入 storage 跨调用复用）；
//       然后逐页 storage.auditPage()，或用 auditStart/auditNext 批量跑。
// 目标：把「元素定位不对」从「靠肉眼在导出图上发现」变成「机器先出清单」。
// 判定 CLEAN 只代表六类签名未命中，不等于像素级正确——仍需走 verification.md 的 PIL 比对。

return (function () {
  const headOf = (r) => { try { return Array.from(r.children).find((c) => c.type === 'board'); } catch (e) { return null; } };
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const rec = (s) => s.type === 'board' || isVC(s);
  const fsz = (s) => { const v = parseFloat(s.fontSize); return isFinite(v) ? v : 14; };
  const alignOf = (s) => { try { return s.horizontalAlign || s.align || 'left'; } catch (e) { return 'left'; } };
  const R = (s) => ({ x: s.x, y: s.y, w: s.width, h: s.height, r: s.x + s.width, b: s.y + s.height });

  // 文本用「视觉矩形」：宽文本框（居中/右对齐留白）会大量假越界，必须按对齐方式估算字面范围
  storage.visRect = function (c) {
    if (c.type !== 'text') return R(c);
    const f = fsz(c), n = String(c.characters || '').length;
    const est = Math.max(4, Math.min(c.width, n * f * 0.62 + 2));
    const a = alignOf(c);
    let vx = c.x; if (a === 'center') vx = c.x + (c.width - est) / 2; else if (a === 'right') vx = c.x + c.width - est;
    const vh = Math.max(4, Math.min(c.height, f * 1.35)), vy = c.y + (c.height - vh) / 2;
    return { x: vx, y: vy, w: est, h: vh, r: vx + est, b: vy + vh };
  };

  storage.auditPage = function (opts) {
    opts = opts || {};
    const headBand = opts.headBand == null ? 96 : opts.headBand;
    const titleMin = opts.titleMin == null ? 20 : opts.titleMin;   // 规格板标题的字号下限
    const out = { page: penpot.currentPage.name, boards: 0, shapes: 0, counts: {}, findings: [], errors: [], headerSizes: [], fonts: {} };
    const root = penpot.currentPage.root || penpot.root;
    const head = headOf(root);
    if (!head) return Object.assign(out, { err: 'no head board on this page' });
    const add = (k, s, p, d) => {
      out.counts[k] = (out.counts[k] || 0) + 1;
      if (out.findings.length < 70) out.findings.push({ kind: k, board: p && p.name, shape: s.name, type: s.type, text: s.type === 'text' ? String(s.characters).slice(0, 16) : undefined, x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.width), h: Math.round(s.height), detail: d });
    };
    const ovr = (a, b) => { const w = Math.min(a.r, b.r) - Math.max(a.x, b.x); const h = Math.min(a.b, b.b) - Math.max(a.y, b.y); if (w <= 0 || h <= 0) return 0; const s = Math.min(a.w * a.h, b.w * b.h); return s > 0 ? (w * h) / s : 0; };

    const walkA = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      const pb = R(node);
      let hdr = [];
      if (node.type === 'board') {
        out.boards++;
        // 页头 = 顶部「大字标题」（字号 >= titleMin）。若不设字号门槛，
        // 演示屏的 18px logo 背景条、PageRoot 的 Header 背景板会全量假报 header_collision。
        if (node !== head) {
          hdr = kids.filter((c) => c.type === 'text' && c.parentY < headBand && fsz(c) >= titleMin).map((c) => ({ s: c, r: storage.visRect(c) }));
          if (hdr.length && out.headerSizes.length < 6) out.headerSizes.push(node.name + ':' + fsz(hdr[0].s));
        }
      }
      for (const c of kids) {
        try {
          out.shapes++;
          if (c.type === 'text') out.fonts[c.fontFamily] = (out.fonts[c.fontFamily] || 0) + 1;
          const cr = storage.visRect(c);
          // S1/S2/S3/S4 越界（下界=板高不足，右界=右侧溢出，左界=常量列偏移）
          if (cr.x < pb.x - 1.5 || cr.y < pb.y - 1.5 || cr.r > pb.r + 1.5 || cr.b > pb.b + 1.5) {
            add('out_of_bounds', c, node, 'escapes (L' + Math.round(cr.x - pb.x) + ',T' + Math.round(cr.y - pb.y) + ',R' + Math.round(cr.r - pb.r) + ',B' + Math.round(cr.b - pb.b) + ')');
          }
          if (c.type !== 'text' && c.type !== 'path' && Math.round(c.width) === 100 && Math.round(c.height) === 100) add('crash_100x100', c, node);
          // 1px 发丝线是刻意设计（分隔线/轨道），只报真退化
          if ((c.width <= 1 && c.height <= 1) || (c.type === 'text' && (c.width <= 1 || c.height <= 1))) add('degenerate_size', c, node, 'w=' + Math.round(c.width) + ' h=' + Math.round(c.height));
          if (c.type === 'text') {
            // S9 畸形文本：helper 参数错位的指纹——纯数字内容 + 异常高的文本框。
            // 阈值必须用 200 而不是 36：正常的数字标签（分页 1/2/3、年份 2026）盒高只有 40-44，
            // 而畸形文本的盒高是 400/500/600（那其实是被误当高度的字重值）。
            if (/^\d{1,4}$/.test(String(c.characters)) && c.height >= 200) add('malformed_text', c, node, 'numeric content, box h=' + Math.round(c.height));
            // S10 对齐未生效：写入失败会留下 undefined/null
            let al = 'x'; try { al = c.align; } catch (e) {}
            if (al === undefined || al === null) add('align_missing', c, node, 'align undefined - property write likely failed');
          }
          if (hdr.length && (c.type === 'rectangle' || c.type === 'ellipse')) {
            for (const ht of hdr) { const o = ovr(cr, ht.r); if (o > 0.6) { add('header_collision', c, node, 'over "' + String(ht.s.characters).slice(0, 12) + '" ' + Math.round(o * 100) + '%'); break; } }
          }
          if (rec(c)) walkA(c);
        } catch (e) { if (out.errors.length < 4) out.errors.push('A:' + e.message); }
      }
    };
    walkA(head);

    const hosts = [];
    const ch = (n2) => { const ks = kidsOf(n2); if (!ks) return; for (const c of ks) { try { if ((c.type === 'rectangle' || c.type === 'ellipse') && c.width >= 24 && c.height >= 24 && c.width * c.height <= 20000) hosts.push(c); if (rec(c)) ch(c); } catch (e) {} } };
    ch(head);
    const walkB = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (c.type === 'text' && c.parent !== head) {
            const cr = R(c); const tcx = cr.x + cr.w / 2, tcy = cr.y + cr.h / 2;
            let host = null, ha = Infinity;
            for (const h of hosts) { const hr = R(h); if (tcx >= hr.x && tcx <= hr.r && tcy >= hr.y && tcy <= hr.b) { const a = hr.w * hr.h; if (a < ha) { ha = a; host = h; } } }
            if (host) {
              const hr = R(host); const dx = Math.abs(tcx - (hr.x + hr.w / 2)), dy = Math.abs(tcy - (hr.y + hr.h / 2)), m = Math.max(dx, dy);
              if (m > 0.5) {
                // 只有「文本框宽接近宿主宽」时才认为本意是居中（按钮/胶囊）。
                // 刻意内缩的（带尾部图标的 chip、左对齐的选项行）归为 info，不算缺陷。
                const close = c.width >= hr.w * 0.72;
                add(m <= 8 && close ? 'text_centre_residue' : 'text_centre_info', c, node, 'host "' + host.name + '" dx=' + dx.toFixed(1) + ' dy=' + dy.toFixed(1) + (close ? '' : ' inset'));
              }
            }
          }
          if (rec(c)) walkB(c);
        } catch (e) { if (out.errors.length < 4) out.errors.push('B:' + e.message); }
      }
    };
    walkB(head);

    // S5 根级游离形状：PageRoot 之外的顶层图元（注册组件期间易产生绑定实例残留）
    Array.from(root.children).forEach((c) => { if (c !== head) add('root_stray', c, root, 'top-level shape outside PageRoot'); });

    // S7 兄弟板重叠：顶层板两两相交。
    // **这是最容易漏的一类**——它由「修复」本身制造：把板长高以便包住内容后，
    // 若行长超过网格行距，就会压到下一行的板。只查包含性的审计对它是完全盲的。
    const tops = Array.from(head.children).filter((c) => c.type === 'board' && c !== head);
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        const a = tops[i], b = tops[j];
        const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (w > 1 && h > 1) add('board_overlap', a, head, 'vs "' + b.name + '" ' + Math.round(w) + 'x' + Math.round(h));
      }
    }

    // S8 文本互相重叠：两段文本压在一起（几乎必然是错位/重复）。
    // 只报 text-vs-text：背景垫底、scrim 压面板等都是刻意的，形状重叠噪声太大。
    const walkC = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i], b = kids[j];
          if (a.type === 'text' && b.type === 'text' && ovr(R(a), R(b)) > 0.6) {
            add('text_overlap', a, node, 'vs "' + String(b.characters).slice(0, 12) + '"');
          }
        }
      }
      kids.forEach((k) => { if (rec(k)) walkC(k); });
    };
    walkC(head);

    // 判据：text_centre_info 是「刻意内缩」的信息项，不构成缺陷
    out.verdict = Object.keys(out.counts).filter((k) => k !== 'text_centre_info').length ? 'NEEDS_REPAIR' : 'CLEAN';
    return out;
  };

  // ---- 批量 runner ----（切页后必须核对 currentPage.name，超时可能落错页）
  storage.auditStart = function (pages) {
    storage.auditQueue = (pages || penpotUtils.getPages().map((p) => p.name)).slice();
    storage.auditReport = {};
    return { queued: storage.auditQueue.length };
  };
  storage.auditNext = async function () {
    const q = storage.auditQueue;
    if (!q || !q.length) return { done: true, report: storage.auditReport };
    const name = q[0];
    if (penpot.currentPage.name !== name) {
      penpot.openPage(penpotUtils.getPageByName(name));
      await new Promise((r) => setTimeout(r, 700));
      if (penpot.currentPage.name !== name) return { wait: penpot.currentPage.name, want: name };
    }
    const page = q.shift();
    const r = storage.auditPage();
    storage.auditReport[page] = { verdict: r.verdict, counts: r.counts, boards: r.boards, shapes: r.shapes, findings: r.findings.slice(0, 10), errors: r.errors };
    if (q.length) penpot.openPage(penpotUtils.getPageByName(q[0]));
    return { page: page, verdict: r.verdict, counts: r.counts, boards: r.boards, shapes: r.shapes, remaining: q.length };
  };
  storage.auditAll = async function (batch, pages) {
    if (!storage.auditQueue) storage.auditStart(pages);
    const res = [];
    for (let i = 0; i < (batch || 4); i++) { const r = await storage.auditNext(); res.push(r); if (r.done) break; }
    return res;
  };

  return { seeded: true, fns: ['auditPage', 'visRect', 'auditStart', 'auditNext', 'auditAll'] };
})();
