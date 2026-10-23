// audit_layout.js —— positioning audit engine (read-only, changes no shapes)
// Usage: paste the whole file into execute_code and run once (literal functions go into storage for cross-call reuse);
//       then call storage.auditPage() page by page, or use auditStart/auditNext for batch runs.
// Goal: turn "wrong element positioning" from "found by eyeballing the export" into "machine emits a list first".
// CLEAN only means the signature classes in positioning-audit.md didn't hit, not pixel-perfect correct — still need the PIL comparison in verification.md.

return (function () {
  const headOf = (r) => { try { return Array.from(r.children).find((c) => c.type === 'board'); } catch (e) { return null; } };
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const rec = (s) => s.type === 'board' || isVC(s);
  const fsz = (s) => { const v = parseFloat(s.fontSize); return isFinite(v) ? v : 14; };
  const alignOf = (s) => { try { return s.horizontalAlign || s.align || 'left'; } catch (e) { return 'left'; } };
  const R = (s) => ({ x: s.x, y: s.y, w: s.width, h: s.height, r: s.x + s.width, b: s.y + s.height });
  // Audit **annotation** layers: LY.fold() draws the first-viewport outline over a long board, LY.drawStart() draws labelled
  // region templates. Both sit on top of real boards on purpose, so the stacking/ownership signatures must not judge them.
  const ANNO = /^(fold·|region·)/;
  // Layers that *deliberately* escape the box they sit in: a focus ring is drawn at a 2px offset, the §6 hit pad is
  // larger than the control it wraps, a scrim/shadow covers its sibling. They must never read as out_of_bounds, and
  // never as an assembly host or a centering target.
  // Chrome, not assembly: a state overlay is authored to sit over/under the control it describes, so S11 must not
  // demand it be grouped with the copy. `wash·` is §1.3's focus/state wash (component-library §1.3) — same class as
  // `state·layer`; without it every reserved-family Focus host reads as 49 "loose" shapes.
  // `surface·` / `sheen·` are DERIVED plates (elevation_engine): a surface is the floor of its region and therefore
  // covers the region's own title by design. Judging it as a header collision indicted every card on the screen
  // (measured 2026-10-23: 8 header_collision findings, all background surfaces).
  const OVER = /^(ring·|hitpad·|shadow|glow|scrim|state·layer|wash·|surface·|sheen·|fold·|region·)/;
  // A painted box a shape can sit on or in. Penpot reports rectangles as 'rect'; older code compared 'rectangle'.
  // Accepting both is not hedging — a missed spelling silently disables every plate-based signature below.
  const PLATE = (s) => s.type === 'rect' || s.type === 'rectangle' || s.type === 'ellipse';

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
      // The cap keeps a reply readable, but it must not hide a class: 73 loose_assembly entries used to bury the one
      // text_overlap that mattered (counts is exhaustive, findings were not — so a page could never be closed honestly).
      if (out.findings.length < (opts.maxFindings == null ? 70 : opts.maxFindings)) out.findings.push({ kind: k, board: p && p.name, shape: s.name, type: s.type, text: s.type === 'text' ? String(s.characters).slice(0, 16) : undefined, x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.width), h: Math.round(s.height), detail: d });
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
        if (node.id !== head.id) {
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
          // A clip frame is authored *around* its content (a half star paints a whole glyph inside a half-width board):
          // overflow there is the mechanism, not a defect, and it is never visible.
          if (!OVER.test(c.name || '') && !node.clipContent && (cr.x < pb.x - 1.5 || cr.y < pb.y - 1.5 || cr.r > pb.r + 1.5 || cr.b > pb.b + 1.5)) {
            add('out_of_bounds', c, node, 'escapes (L' + Math.round(cr.x - pb.x) + ',T' + Math.round(cr.y - pb.y) + ',R' + Math.round(cr.r - pb.r) + ',B' + Math.round(cr.b - pb.b) + ')');
          }
          // OVER chrome is sized *from the control it wraps*, so 100×100 can be the honest derived value (a ring·focus is
          // diameter+2·offset: on the 96px lg FAB that is exactly 100). Only an un-sized authored shape is the fingerprint.
          if (!OVER.test(c.name || '') && c.type !== 'text' && c.type !== 'path' && Math.round(c.width) === 100 && Math.round(c.height) === 100) add('crash_100x100', c, node);
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
          if (hdr.length && PLATE(c) && !OVER.test(c.name || '')) {
            for (const ht of hdr) { const o = ovr(cr, ht.r); if (o > 0.6) { add('header_collision', c, node, 'over "' + String(ht.s.characters).slice(0, 12) + '" ' + Math.round(o * 100) + '%'); break; } }
          }
          if (rec(c)) walkA(c);
        } catch (e) { if (out.errors.length < 4) out.errors.push('A:' + e.message); }
      }
    };
    walkA(head);

    const hosts = [];
    const ch = (n2) => { const ks = kidsOf(n2); if (!ks) return; for (const c of ks) { try { if (PLATE(c) && !OVER.test(c.name || '') && c.width >= 24 && c.height >= 24 && c.width * c.height <= 20000) hosts.push(c); if (rec(c)) ch(c); } catch (e) {} } };
    ch(head);
    const walkB = (node) => {
      if (ANNO.test(node.name || '')) return;
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (c.type === 'text' && (!c.parent || c.parent.id !== head.id)) {
            const cr = R(c); const tcx = cr.x + cr.w / 2, tcy = cr.y + cr.h / 2;
            let host = null, ha = Infinity;
            for (const h of hosts) { const hr = R(h); if (tcx >= hr.x && tcx <= hr.r && tcy >= hr.y && tcy <= hr.b) { const a = hr.w * hr.h; if (a < ha) { ha = a; host = h; } } }
            if (host) {
              const hr = R(host); const dx = Math.abs(tcx - (hr.x + hr.w / 2)), dy = Math.abs(tcy - (hr.y + hr.h / 2)), m = Math.max(dx, dy);
              if (m > 0.5) {
                // Only when "the text box width approaches the host width" do we consider centering was intended (button/capsule).
                // Deliberately inset ones (chip with trailing icon, left-aligned option rows) go to info, not a defect.
                // `align` is part of that test: a LEFT-aligned caption padded inside its plate (an AppBar link: 51px of
                // copy in a 65px `link·0`) is inset by design and its box centre only looks centred because the padding is
                // symmetric. Measured 2026-10-20 on page 10: 5 such labels reported as residue, and `fixStaleCenter`
                // (which honours align) correctly refused to move them — a gate a repair must not obey is a false positive.
                let alg = ''; try { alg = String(c.align || '').toLowerCase(); } catch (e0) { alg = ''; }
                const close = c.width >= hr.w * 0.72 && alg === 'center';
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
      if (ANNO.test(node.name || '')) return;                             // annotation layers are deliberately stacked over real boards
      const kids = kidsOf(node); if (!kids) return;
      // S11's host is a *painted box* (line 24's own definition, and this rule's text: "a host (rect/ellipse ≥24)").
      // A board is a partition container — a label cell that holds its own text is layout, not loose stacking, and
      // counting it made every Pagination/Steps cell a violation. Same reading as groupAssemblies' filter.
      const cand = kids.filter((h) => PLATE(h) && h.width >= 24 && h.height >= 24 && !OVER.test(h.name || ''));
      for (const h of cand) {
        try {
          const hr = R(h);
          const members = kids.filter((s) => {
            if (s === h) return false;
            if (OVER.test(s.name || '')) return false;                    // a ring/hit-pad layer is chrome, not an assembly member
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
    // compare by .id: every access to .children yields a NEW proxy (api-pitfalls §7), so a reference comparison
    // against head is always true — the old code flagged PageRoot itself as a stray on every scaffolded page.
    const headId = head && head.id;
    Array.from(root.children).forEach((c) => { if (c.id !== headId) add('root_stray', c, root, 'top-level shape outside PageRoot'); });

    // S7 sibling-board overlap: pairwise intersection of top-level boards.
    // **This is the easiest class to miss** — it's created by the "fix" itself: after growing a board to wrap its content,
    // if the row length exceeds the grid row gap, it presses onto the next row's board. An audit that only checks containment is completely blind to it.
    const tops = Array.from(head.children).filter((c) => c.type === 'board' && c !== head && !ANNO.test(c.name || ''));
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
          // A region-anatomy label is drawn OVER the skeleton copy it names (`region·label·modal·body` on
          // `modal·copy 4`), which is the whole point of the anatomy board; ANNO layers are exempt from every stacking
          // signature, so this pair is not a collision.
          if (a.type === 'text' && b.type === 'text' && !ANNO.test(a.name || '') && !ANNO.test(b.name || '') && ovr(R(a), R(b)) > 0.6) {
            add('text_overlap', a, node, 'vs "' + String(b.characters).slice(0, 12) + '"');
          }
        }
      }
      kids.forEach((k) => { if (rec(k)) walkC(k); });
    };
    walkC(head);

    // S8b cross-parent text overlap. S8 only compares siblings, so it is blind to the defect that shipped pages 14/15:
    // a pane filled with prose (`region·content`) over its own filled child (`region·body`), a form drawn in `form` and
    // again in `contact/shipping/payment`, two listBlocks under one pane. Those texts have DIFFERENT parents, so the
    // sibling scan reported nothing and both gates stayed CLEAN while the export showed overprinted copy.
    // Scoped to one top-level board (the same nav label on two screens is not a collision); ANNO text is exempt.
    // Sorted by y with a forward window, so this is O(n·row) rather than O(n²) on a 15-screen page.
    const texts = [];
    const collectText = (n) => {
      for (const c of kidsOf(n) || []) {
        try { if (c.type === 'text' && !ANNO.test(c.name || '') && String(c.characters || '').trim()) texts.push(c); } catch (e) {}
        if (rec(c)) collectText(c);
      }
    };
    collectText(head);
    const topOf = (s) => { let p = s, last = s; try { while (p && p.parent && p.parent.id !== head.id) { last = p.parent; p = p.parent; } } catch (e) {} return last; };
    texts.sort((p, q) => (p.y || 0) - (q.y || 0));
    for (let i = 0; i < texts.length; i++) {
      const a = texts[i], ar = R(a), atop = topOf(a);
      for (let j = i + 1; j < texts.length && (texts[j].y || 0) < ar.b; j++) {
        const b = texts[j];
        try {
          if (a.parent.id === b.parent.id) continue;                 // siblings are S8's job
          if (topOf(b).id !== atop.id) continue;                     // different screen / spec board
          if (ovr(ar, R(b)) > 0.6) add('text_overlap_x', a, a.parent,
            'vs "' + String(b.characters).slice(0, 12) + '" under ' + (b.parent && b.parent.name));
        } catch (e) {}
      }
    }

    // S12 border occlusion. Penpot paints a shape's own stroke *under* its children, and a later sibling over an earlier
    // one, so an opaque overlay sitting flush on a bordered box erases that box's border for the covered length — this is
    // the reported "带边框的元素，边框只显示部分". Measured 2026-10-20 on Descriptions·Bordered: `cell·label·N` (#faf7f6,
    // same box as the bordered `cell·N`) hid L+T+B of the 1px border, so the row looked like it had no border on the left.
    // Threshold 0.5 alpha: a translucent state layer dims a border, an opaque one deletes it, and only the second is a defect.
    const PAINT = (s) => { try { return s.type !== 'text' && (s.fills || []).some((f) => f.fillColor && (f.fillOpacity === undefined ? 1 : f.fillOpacity) >= 0.5); } catch (e) { return false; } };
    const SCRIM = /^(scrim|shadow|glow|fold·)/;   // deliberate full-coverage layers: they are *meant* to hide what is under them
    // Only box-following strokes: a path's stroke runs along its geometry, so its bbox band is empty space and an
    // overlay inside the box hides nothing (122 false hits on Rating's star outline-vs-fill pair before this filter).
    const BOXISH = (s) => s.type === 'rect' || s.type === 'rectangle' || s.type === 'board' || s.type === 'ellipse';
    const bandsOf = (s) => {
      let st = []; try { st = s.strokes || []; } catch (e) { return null; }
      if (!st.length || !BOXISH(s)) return null;
      let sw = 1; st.forEach((t) => { sw = Math.max(sw, t.strokeWidth || 1); });
      const al = st[0].strokeAlignment || 'center';
      const ins = al === 'inner' ? 0 : (al === 'outer' ? -sw : -sw / 2);
      const r = R(s);
      return { sw: sw, sides: { L: [r.x + ins, r.y, sw, r.h], R: [r.r - sw - ins, r.y, sw, r.h],
                                T: [r.x, r.y + ins, r.w, sw], B: [r.x, r.b - sw - ins, r.w, sw] } };
    };
    // The clip that governs a child: every ancestor board clips its subtree, and a board clips by default, so the
    // innermost clipped ancestor is the tightest box the child's stroke band has to live inside.
    // The page root reports itself as `clipContent:true` at **0×0** (measured 2026-10-20) — a degenerate box is not a
    // clip, it is an unmeasured container, so it is skipped; without this guard every top-level board of every page
    // reads as fully cropped.
    const clipOf = (parent) => {
      let n = parent, d = 0;
      while (n && d++ < 24) {
        try { if (n.clipContent && n.width > 1 && n.height > 1) return { l: n.x, t: n.y, r: n.x + n.width, b: n.y + n.height }; } catch (e) { return null; }
        n = n.parent;
      }
      return null;
    };
    const walkE = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      for (let i = 0; i < kids.length; i++) {
        const a = kids[i];
        try {
          if (!SCRIM.test(a.name || '')) {
            const bb = bandsOf(a);
            if (bb) {
              const cover = [];
              for (let j = i + 1; j < kids.length; j++) if (PAINT(kids[j]) && !SCRIM.test(kids[j].name || '')) cover.push(kids[j]);
              (kidsOf(a) || []).forEach((c) => { if (PAINT(c) && !SCRIM.test(c.name || '')) cover.push(c); });
              for (const c of cover) {
                let cStroke = false; try { cStroke = (c.strokes || []).length > 0; } catch (e) {}
                const cr = R(c), ar = R(a);
                // A border redrawn by the shape sitting on top of it is not a missing border: tiling regions share edges
                // on purpose (a footer band and its save button both end at the same x). Only a coverer that carries no
                // stroke of its own, or whose edge is elsewhere, actually erases the line.
                const sameEdge = (side) => {
                  if (!cStroke) return false;
                  const e = side === 'L' ? [cr.x, ar.x] : side === 'R' ? [cr.r, ar.r] : side === 'T' ? [cr.y, ar.y] : [cr.b, ar.b];
                  return Math.abs(e[0] - e[1]) <= bb.sw + 1;
                };
                const hit = [];
                for (const k in bb.sides) {
                  if (sameEdge(k)) continue;
                  const b = bb.sides[k];
                  const w = Math.max(0, Math.min(b[0] + b[2], c.x + c.width) - Math.max(b[0], c.x));
                  const h = Math.max(0, Math.min(b[1] + b[3], c.y + c.height) - Math.max(b[1], c.y));
                  if (w * h >= b[2] * b[3] * 0.25) hit.push(k);
                }
                if (!hit.length) continue;
                // Two different defects share a signature. An overlay *inside* the bordered box (a label tint, a state
                // layer) is a sizing mistake — inset it. A sibling that pokes out of the box is a layout collision — the
                // later board must move, because insetting it would just bury the border a different way.
                const inner = c.x >= a.x - 1 && c.y >= a.y - 1 && c.x + c.width <= a.x + a.width + 1 && c.y + c.height <= a.y + a.height + 1;
                add('stroke_covered', a, node, '"' + c.name + '" hides ' + hit.join('') + ' of its ' + bb.sw + 'px border — ' +
                  (inner ? 'inset the overlay by the stroke width (CF.inset)' : 'two siblings collide, move the later one (reflowRows/fitBoardHeight)'));
              }
              // S12b border cropped by a clip. A **board clips by default** (api-pitfalls §4), so any layer a factory
              // deliberately draws *outside* its host box — `ctx.ring` at box−2, `ctx.hitPad` — is cut on the sides that
              // leave the clip. Measured 2026-10-20 on page 03: 56 stroked shapes cropped, all `ring·focus`, L/R/T/B
              // eaten by 1–2px, i.e. a focus state whose ring renders as two line segments instead of a ring.
              // This is the half the old `stroke_invisible` missed: it only tested `outer`, while every engine writes
              // `inner` and the crop comes from the *position*, not the alignment.
              const cb = clipOf(node);
              if (cb) {
                const occ = [];
                for (const k in bb.sides) {
                  const s = bb.sides[k];
                  const inside = Math.max(0, Math.min(s[0] + s[2], cb.r) - Math.max(s[0], cb.l)) *
                                 Math.max(0, Math.min(s[1] + s[3], cb.b) - Math.max(s[1], cb.t));
                  const area = s[2] * s[3];
                  if (area && inside / area < 0.75) occ.push(k + Math.round((1 - inside / area) * 100) + '%');
                }
                if (occ.length) add('stroke_clipped', a, node, '"' + (node.name || '') + '" clips it: ' + occ.join(' ') +
                  ' of the ' + bb.sw + 'px border is outside the clip box — put the layer inside the host (CF.inset / ctx.ring clamps) or release the clip');
              }
            }
          }
        } catch (e) { if (out.errors.length < 4) out.errors.push('E:' + e.message); }
        if (rec(a)) walkE(a);
      }
    };
    walkE(head);

    // A board name is page-level identity. Two boards with the same name on one page mean a rebuild drew a copy
    // instead of replacing it — the fingerprint of a spec whose `name` differs from the board `spec.build()` produces
    // (the by-name delete matched nothing; measured 2026-10-20: three `Grid·web1440·Anatomy` shelved on page 11).
    const pr = kidsOf(root).filter((k) => k.type === 'board' && /-PageRoot$/.test(String(k.name || '')))[0] || root;
    const seenBoard = {};
    kidsOf(pr).forEach((k) => {
      if (k.type !== 'board') return;
      const nm = String(k.name || '');
      // `fold·1440×900` is an ANNOTATION, and more than one is legitimate: one per tall baseline-width board
      // (§11 rule 12). Anchoredness is the builder's business; a name clash here is not a rebuilt twin. A page root
      // carries none — it is a canvas, not a screen.
      if (/^fold·/.test(nm)) return;
      if (seenBoard[nm] !== undefined) add('duplicate_board', k, pr, 'second board named ' + nm + ', first at y' + seenBoard[nm] + ' — a rebuild drew a copy, delete one');
      else seenBoard[nm] = Math.round(k.y);
    });

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
