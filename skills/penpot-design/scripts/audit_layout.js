// audit_layout.js —— positioning audit engine (read-only, changes no shapes)
// Usage: paste the whole file into execute_code and run once (literal functions go into storage for cross-call reuse);
//       then call storage.auditPage() page by page, or use auditStart/auditNext for batch runs.
// Goal: turn "wrong element positioning" from "found by eyeballing the export" into "machine emits a list first".
// CLEAN only means the six signature classes didn't hit, not pixel-perfect correct — still need the PIL comparison in verification.md.

return (function () {
  const headOf = (r) => { try { return Array.from(r.children).find((c) => c.type === 'board'); } catch (e) { return null; } };
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const rec = (s) => s.type === 'board' || isVC(s);
  const fsz = (s) => { const v = parseFloat(s.fontSize); return isFinite(v) ? v : 14; };
  const alignOf = (s) => { try { return s.horizontalAlign || s.align || 'left'; } catch (e) { return 'left'; } };
  const R = (s) => ({ x: s.x, y: s.y, w: s.width, h: s.height, r: s.x + s.width, b: s.y + s.height });

  // Text uses "visual rect": wide text boxes (centered/right-aligned whitespace) falsely overflow a lot, must estimate the glyph extent by alignment
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
    const titleMin = opts.titleMin == null ? 20 : opts.titleMin;   // font-size floor for spec-board titles
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
        // Page header = top "large title" (font size >= titleMin). Without the font-size floor,
        // a demo screen's 18px logo background bar and PageRoot's Header background board would all falsely report header_collision.
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
          // S1/S2/S3/S4 out-of-bounds (bottom = board height insufficient, right = right overflow, left = constant column offset)
          if (cr.x < pb.x - 1.5 || cr.y < pb.y - 1.5 || cr.r > pb.r + 1.5 || cr.b > pb.b + 1.5) {
            add('out_of_bounds', c, node, 'escapes (L' + Math.round(cr.x - pb.x) + ',T' + Math.round(cr.y - pb.y) + ',R' + Math.round(cr.r - pb.r) + ',B' + Math.round(cr.b - pb.b) + ')');
          }
          if (c.type !== 'text' && c.type !== 'path' && Math.round(c.width) === 100 && Math.round(c.height) === 100) add('crash_100x100', c, node);
          // A 1px hairline is deliberate design (divider/track); only report true degeneration
          if ((c.width <= 1 && c.height <= 1) || (c.type === 'text' && (c.width <= 1 || c.height <= 1))) add('degenerate_size', c, node, 'w=' + Math.round(c.width) + ' h=' + Math.round(c.height));
          if (c.type === 'text') {
            // S9 malformed text: fingerprint of helper argument misalignment — numeric-only content + abnormally tall text box.
            // The threshold must be 200, not 36: normal numeric labels (pagination 1/2/3, year 2026) box height is only 40-44,
            // while a malformed text's box height is 400/500/600 (that's actually the weight value misused as height).
            if (/^\d{1,4}$/.test(String(c.characters)) && c.height >= 200) add('malformed_text', c, node, 'numeric content, box h=' + Math.round(c.height));
            // S10 alignment not effective: a failed write leaves undefined/null
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
                // Only when "the text box width approaches the host width" do we consider centering was intended (button/capsule).
                // Deliberately inset ones (chip with trailing icon, left-aligned option rows) go to info, not a defect.
                const close = c.width >= hr.w * 0.72;
                // stale-center fingerprint: the text's top-left corner lands exactly on the host center (|t.x−hcx|≤2 or |t.y−hcy|≤2)
                // — the arithmetic consequence of computing centering with the 1×1 transient width/height at creation. Deliberately inset text only lands at
                // host.x+padding, never sticks to the center; hits of the fingerprint are all treated as defects, handed to fixStaleCenter.
                const stale = (Math.abs(cr.x - (hr.x + hr.w / 2)) <= 2 || Math.abs(cr.y - (hr.y + hr.h / 2)) <= 2) && m > 8;
                add((m <= 8 && close) || stale ? 'text_centre_residue' : 'text_centre_info', c, node, 'host "' + host.name + '" dx=' + dx.toFixed(1) + ' dy=' + dy.toFixed(1) + (stale ? ' stale-center' : (close ? '' : ' inset')));
              }
            }
          }
          if (rec(c)) walkB(c);
        } catch (e) { if (out.errors.length < 4) out.errors.push('B:' + e.message); }
      }
    };
    walkB(head);

    // S11 loose assembly: a host (rect/ellipse ≥24) and siblings "whose center falls inside it, and the smallest host is it"
    // form an assembly, but it's not collected into the same group/component — violates the assembly-ownership contract (penpot-structure.md §4:
    // a complete primitive set must be grouped or componentized, loose same-level stacking is forbidden).
    // Repair engine: storage.groupAssemblies(). A board is a partition container, not an assembly host; deliberate singles (pure decorative) are exempt.
    const walkD = (node) => {
      if (node.isComponentInstance && node.isComponentInstance()) return;  // instance internals are compliant (main-instance constraint)
      const kids = kidsOf(node); if (!kids) return;
      const cand = kids.filter((h) => (h.type === 'rectangle' || h.type === 'ellipse' || h.type === 'board') && h.width >= 24 && h.height >= 24);
      for (const h of cand) {
        try {
          const hr = R(h);
          const members = kids.filter((s) => {
            if (s === h) return false;
            const sr = R(s); const scx = sr.x + sr.w / 2, scy = sr.y + sr.h / 2;
            if (scx < hr.x || scx > hr.r || scy < hr.y || scy > hr.b) return false;
            let smallest = h, sa = hr.w * hr.h;
            for (const h2 of cand) {
              if (h2 === h) continue;
              const r2 = R(h2);
              if (scx >= r2.x && scx <= r2.r && scy >= r2.y && scy <= r2.b && r2.w * r2.h < sa) { smallest = h2; sa = r2.w * r2.h; }
            }
            return smallest === h;
          });
          if (members.length) {
            // ⚠️ parent is a proxy, `===` is always false — compare by id (api-pitfalls children proxy pitfall)
            const p = h.parent;
            const ok = p && (p.type === 'group' || (p.isComponentRoot && p.isComponentRoot())) && members.every((m) => m.parent && m.parent.id === p.id);
            if (!ok) add('loose_assembly', h, node, '"' + h.name + '" + ' + members.length + ' shape(s) not grouped (groupAssemblies)');
          }
        } catch (e) {}
      }
      for (const c of kids) { if (rec(c)) walkD(c); }
    };
    walkD(head);

    // S5 root-level stray shapes: top-level shapes outside PageRoot (easily produced as bound-instance residue during component registration)
    Array.from(root.children).forEach((c) => { if (c !== head) add('root_stray', c, root, 'top-level shape outside PageRoot'); });

    // S7 sibling-board overlap: pairwise intersection of top-level boards.
    // **This is the easiest class to miss** — it's created by the "fix" itself: after growing a board to wrap its content,
    // if the row length exceeds the grid row gap, it presses onto the next row's board. An audit that only checks containment is completely blind to it.
    const tops = Array.from(head.children).filter((c) => c.type === 'board' && c !== head);
    for (let i = 0; i < tops.length; i++) {
      for (let j = i + 1; j < tops.length; j++) {
        const a = tops[i], b = tops[j];
        const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (w > 1 && h > 1) add('board_overlap', a, head, 'vs "' + b.name + '" ' + Math.round(w) + 'x' + Math.round(h));
      }
    }

    // S8 text overlapping each other: two text segments pressed together (almost always misalignment/duplication).
    // Only report text-vs-text: background backings, scrim over panels, etc. are deliberate, shape overlap is too noisy.
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

    // Criterion: text_centre_info is an "deliberate inset" informational item, not a defect
    out.verdict = Object.keys(out.counts).filter((k) => k !== 'text_centre_info').length ? 'NEEDS_REPAIR' : 'CLEAN';
    return out;
  };

  // ---- batch runner ---- (after page switch you must verify currentPage.name; timeout may land on the wrong page)
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
