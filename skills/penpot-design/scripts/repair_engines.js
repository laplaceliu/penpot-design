// repair_engines.js —— review and repair engines (alignPage / vAlignPage / fixInner / unclip)
// Usage: paste the whole file into execute_code and run once (literal functions go into storage for cross-call reuse);
//       then call storage.alignPage() etc. page by page, verifying penpot.currentPage.name before each call.
// Mechanics, false-hurt recovery, and the gridSnap template: references/engines.md; coordinate/stroke pitfalls: references/api-pitfalls.md.
// Convention: the repair log returns [position, content, axis, offset] for manual review, then proceed to the next page.

return (function () {
  const rootOf = () => penpot.currentPage.root || penpot.root;
  const headOf = (root) => root.children.find(c => c.type === 'board');  // don't use children[0] (may have orphan text)
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const move = (s, px, py) => {
    try { s.parentX = px; s.parentY = py; return true; } catch (e1) {}
    try { s.x = px; s.y = py; return true; } catch (e2) {}
    return false;
  };

  // ---- alignPage V4: host-snap alignment ----
  // Text finds "the smallest host containing its world center" (rect/ellipse, 24≤side, area≤20000); if it should be centered
  // (vertical deviation≤6px, large host≤3px) snap to the host's exact center; page-level direct text skipped;
  // Breadcrumbs flow reflow; Tabs centered by 120px column. All in world coordinates (mixing parentX produces cross-level false containment).
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
            const tcx = c.x + c.width / 2, tcy = c.y + c.height / 2;   // world coordinates
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
    // Breadcrumbs flow reflow (x accumulates actual rendered width + 12 gap)
    for (const bc of head.children.filter(s => s.name === 'Breadcrumbs')) {
      const kids = bc.children.slice().sort((a, b) => a.parentX - b.parentX);
      let x = 0; const cy = bc.height / 2;
      for (const k of kids) { move(k, x, cy - k.height / 2); x += k.width + 12; }
    }
    // Tabs centered by column (column width 120)
    for (const tb of head.children.filter(s => s.name === 'Tabs')) {
      const labels = tb.children.filter(c => c.type === 'text').sort((a, b) => a.parentX - b.parentX);
      labels.forEach((t, i) => move(t, i * 120 + (120 - t.width) / 2, (tb.height - t.height) / 2));
    }
    return { fixes: log.length, errors: errors.slice(0, 5) };
  };

  // ---- vAlignPage: small-board text vertical centering (with stacking guard) ----
  // Small boards (≤70px tall) single-line direct-child text vertical centering (only triggers at deviation 5–15px).
  // Stacking guard: multi-line text with same-board x overlap≥50% and y diff>4 = deliberate stacking (stepper +/−, Progress top label), skip.
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

  // ---- fixInner: stroke batch fix (closed shapes→inner, paths→center) ----
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

  // ---- unclip: release board clipping (fix glow invisible) ----
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

  // ---- clean root-level orphan text (historical crash residue, pollutes traversal) ----
  storage.cleanOrphans = () => {
    const root = rootOf();
    let n = 0;
    for (const c of root.children.slice()) if (c.type === 'text') { c.remove(); n++; }
    return n;
  };

  // ---- fixStaleCenter: stale-center fingerprint precise fix (only fixes centering offset baked by "stale transient width/height") ----
  // Fingerprint: the text's **top-left corner** lands exactly on the host center (|t.x−hcx|≤2 or |t.y−hcy|≤2), but the text's real center
  //    deviates from the host center by >0.5 — the arithmetic consequence of "computing (w−1)/2 with the 1×1 transient width/height at creation";
  //    deliberately left-aligned/inset text only lands at host.x+padding (12/16/18/24…), never sticks to the center,
  //    so fixing by this fingerprint is **zero false-hurt**. Per-axis independent judgment and fix (may only be off on one axis).
  // Division of labor with alignPage: alignPage snaps ≤6px micro-diff; this engine specializes in >6px, fingerprint-hit large offsets.
  // Defect-introduction fallback (G8): only moves the text coordinates that hit the fingerprint, doesn't change z-order/style; blind-centering false-hurts are excluded by the fingerprint condition.
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

  // ---- groupAssemblies: assemble into groups (assembly-ownership contract: penpot-structure.md §4) ----
  // Same-parent "host (rect/ellipse ≥24) + siblings whose center falls inside it, and the smallest host is it"
  // → penpot.group([host, ...members]) to group, group name = host name. Loose same-level stacking forbidden.
  // Inside-out (ascending area) processing, natively supports nesting: inner groups first, outer group absorbs inner groups as normal members
  // (button group into nav bar); a board is a partition container, not an assembly host; flow child primitives skipped (left to flex).
  // Idempotent: assemblies already in the same group/component aren't re-grouped; only changes hierarchy, not coordinates/style.
  // Upgrade path: single-use assembly = group; to reuse / enter the 13 index → `createComponent([group])` upgrades to a component,
  // pages always `comp.instance()` (registration discipline see penpot-structure.md §4).
  storage.groupAssemblies = (root) => {
    root = root || rootOf();
    const log = [];
    const isFlow = (s) => !!(s.layoutChild && s.layoutChild.absolute === false);
    const walk = (node) => {
      if (node.isComponentInstance && node.isComponentInstance()) return;  // instance internals are locked copies, don't touch
      const kids0 = kidsOf(node); if (!kids0) return;
      for (const c of kids0.slice()) if (c.type === 'board' || c.type === 'group') walk(c);  // inner first
      const kids = kidsOf(node); if (!kids) return;
      const byArea = kids
        .filter((h) => (h.type === 'rectangle' || h.type === 'ellipse' || h.type === 'board') && h.width >= 24 && h.height >= 24 && !isFlow(h))
        .sort((a, b) => a.width * b.height - b.width * b.height);
      const taken = new Set();      // members already absorbed
      const live = kids.slice();    // member stand-in list (replaced by group after grouping)
      for (const h of byArea) {
        try {
          if (taken.has(h.id)) continue;   // already a member of an inner group
          const members0 = live.filter((s) => s !== h && !taken.has(s.id) && !isFlow(s) &&
            s.x + s.width / 2 >= h.x && s.x + s.width / 2 <= h.x + h.width &&
            s.y + s.height / 2 >= h.y && s.y + s.height / 2 <= h.y + h.height);
          const members = members0.filter((s) => {
            const scx = s.x + s.width / 2, scy = s.y + s.height / 2;
            let smallest = h, sa = h.width * h.height;
            for (const h2 of byArea) {
              if (h2 === h || taken.has(h2.id)) continue;   // absorbed inner hosts yield to their group
              if (scx >= h2.x && scx <= h2.x + h2.width && scy >= h2.y && scy <= h2.y + h2.height && h2.width * h2.height < sa) { smallest = h2; sa = h2.width * h2.height; }
            }
            return smallest === h;
          });
          if (!members.length) continue;
          // ⚠️ parent generates a new proxy on each access, `===` is always false (api-pitfalls children proxy pitfall) — must compare by id
          const pid = h.parent ? h.parent.id : null;
          if (pid && (h.parent.type === 'group' || (h.parent.isComponentRoot && h.parent.isComponentRoot())) &&
              members.every((m) => m.parent && m.parent.id === pid)) continue;
          // ⚠️ penpot.group has destructive side effects (api-pitfalls §6.1): group drops into flex flow position + members shift −minParentXY.
          // Compensatory grouping: first capture the bbox's min parentXY, escape the flow (absolute) after grouping and reset, readback-verify.
          const all = [h].concat(members);
          const minPX = Math.min.apply(null, all.map((s) => s.parentX));
          const minPY = Math.min.apply(null, all.map((s) => s.parentY));
          const maxPI = Math.max.apply(null, all.map((s) => s.parentIndex || 0));  // z: group takes the top member's layer slot
          const g = penpot.group(all);
          if (g) {
            try { g.name = h.name; } catch (e) {}
            try { g.layoutChild.absolute = true; } catch (e) {}
            // z fix: penpot.group scrambles member front/back order (tested: label covered by base plate) → re-sort within group by descending area
            try {
              const inner = Array.from(g.children).sort((a, b) => (b.width * b.height) - (a.width * a.height));
              for (let zi = 0; zi < inner.length; zi++) inner[zi].setParentIndex(zi);
            } catch (e) {}
            try { g.setParentIndex(maxPI); } catch (e) {}
            try { g.parentX = minPX; g.parentY = minPY; } catch (e) {}
            // readback-verify (write may silently fail); if failed, retry once in world coordinates
            if (Math.abs(g.parentX - minPX) > 1 || Math.abs(g.parentY - minPY) > 1) {
              try { g.x = node.x + minPX; g.y = node.y + minPY; } catch (e) {}
            }
            members.forEach((m) => taken.add(m.id));
            taken.add(h.id);
            live.push(g);   // group replaces members, for outer host to absorb (nesting)
            log.push([g.name, members.length + 1]);
          }
        } catch (e) {}
      }
    };
    walk(root);
    return { groups: log.length, log: log.slice(0, 40) };
  };

  // ---- fixZOrder: within-group front/back order fix (z semantics: larger parentIndex = more front, 0=bottom) ----
  // penpot.group is opaque to member z-order (tested: base plate ranked above label → label covered).
  // Rule: within group re-sort by **descending area** (large base at bottom, text/icon on top), setParentIndex(i) one by one.
  // Pairs with groupAssemblies: run once after each grouping; small-shape group export may hit a cache illusion,
  // verify z-order by exporting the **whole board** (api-pitfalls §6.1).
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
