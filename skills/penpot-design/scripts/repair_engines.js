// repair_engines.js —— review and repair engines (alignPage / vAlignPage / fixInner / unclip)
// Usage: paste the whole file into execute_code and run once (literal functions go into storage for cross-call reuse);
//       then call storage.alignPage() etc. page by page, verifying penpot.currentPage.name before each call.
// Mechanics, false-hurt recovery, and the gridSnap template: references/engines.md; coordinate/stroke pitfalls: references/api-pitfalls.md.
// Convention: the repair log returns [position, content, axis, offset] for manual review, then proceed to the next page.

return (function () {
  const rootOf = () => penpot.currentPage.root || penpot.root;
  const headOf = (root) => root.children.find(c => c.type === 'board');  // don't use children[0] (may have orphan text)
  const kidsOf = (n) => { try { const k = n.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  // Penpot reports a rectangle as 'rect'; comparing only 'rectangle' silently matches nothing (see positioning-audit.md).
  const PLATE = (s) => s.type === 'rect' || s.type === 'rectangle' || s.type === 'ellipse';
  // Chrome that is deliberately bigger than the box it belongs to: focus ring offset, §6 hit pad.
  const OVER = /^(ring·|hitpad·|shadow|glow|scrim|state·layer)/;
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
          if (PLATE(c) && !OVER.test(c.name || '') && c.width >= 24 && c.height >= 24 && c.width * c.height <= 20000) hosts.push(c);
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
  // ⚠ Authored crops are NOT part of that fix. A `clip·*` frame (half star, cover media, avatar) is drawn *around*
  // its content precisely so the overflow is cut; clearing it makes the overflow visible and turns the audit's
  // clip exemption off (audit_layout reads the live `clipContent`, so the escape then reports as out_of_bounds).
  const KEEP_CLIP = /^clip·/;
  storage.unclip = () => {
    const root = rootOf();
    let n = 0, kept = 0;
    function walk(node) {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (c.type === 'board' && c.clipContent === true) {
            if (KEEP_CLIP.test(c.name || '') || (storage._clipKeep && storage._clipKeep[c.id])) { kept++; c.clipContent = true; }
            else { c.clipContent = false; n++; }
          }
          walk(c);
        } catch (e) {}
      }
    }
    walk(root);
    return { released: n, kept };
  };

  // ---- reclip: re-assert the crops a previous unclip (or an older engine) dropped ----
  storage.reclip = () => {
    const root = rootOf();
    let n = 0;
    function walk(node) {
      const kids = kidsOf(node); if (!kids) return;
      for (const c of kids) {
        try {
          if (c.type === 'board' && KEEP_CLIP.test(c.name || '')) { (storage._clipKeep || (storage._clipKeep = {}))[c.id] = 1; if (c.clipContent !== true) { c.clipContent = true; n++; } }
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
  // The audit's own classification (audit_layout walkB): a caption whose box nearly fills its host and whose centre is
  // ≤8px off the host centre is a centring *residue* (a defect), while a narrow label far from the centre is a
  // deliberate inset (informational). Kept beside fixStaleCenter so the gate and the repair can never disagree.
  const residueOk = (host, c) => {
    const dx = Math.abs((c.x + c.width / 2) - (host.x + host.width / 2));
    const dy = Math.abs((c.y + c.height / 2) - (host.y + host.height / 2));
    const m = Math.max(dx, dy);
    return m > 0.5 && m <= 8 && c.width >= host.width * 0.72 &&
           c.width <= host.width && c.height <= host.height;
  };
  storage.fixStaleCenter = (root) => {
    root = root || rootOf();
    const log = [];
    const walk = (node) => {
      const kids = kidsOf(node); if (!kids) return;
      const hosts = kids.filter((h) => (PLATE(h) || h.type === 'board') && h.width >= 16 && h.height >= 16 && !OVER.test(h.name || ''));
      for (const c of kids) {
        try {
          const isFlow = c.layoutChild && c.layoutChild.absolute === false;
          if (c.type === 'text' && !isFlow) {
            // Deliberately edge-aligned copy is never a centering residue: its x is pad-X by design, and in a tall
            // container its row centre can still fall on the host's mid-line, which reads as the y fingerprint.
            let al = null; try { al = c.align; } catch (e0) {}
            if (al && String(al).toLowerCase() !== 'center') continue;
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
              } else if (residueOk(host, c)) {
                // Near-miss centring: the audit's `text_centre_residue` is box-centre off host-centre by ≤8px on a
                // label whose width fills the host (a button/nav-link caption). It is invisible as a defect and
                // invisible as an intent — the fix is the same one the author meant, so the pair is exact.
                const mx = (host.x + host.width / 2) - (c.x + c.width / 2);
                const my = (host.y + host.height / 2) - (c.y + c.height / 2);
                try { if (Math.abs(mx) > 0.5) c.parentX = c.parentX + mx; if (Math.abs(my) > 0.5) c.parentY = c.parentY + my; }
                catch (e) { c.x = c.x + mx; c.y = c.y + my; }
                log.push([host.name, String(c.characters).slice(0, 8), 'centre', Math.max(Math.abs(mx), Math.abs(my)).toFixed(1)]);
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
  // a screen places an instance with `CF.instance` (instancing IS scriptable — api-pitfalls §6 / capabilities §5;
  // registration discipline see penpot-structure.md §4.3).
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
        // PLATE-only, mirroring audit_layout S11: a board is a partition container, so a label cell that holds its own
        // text is layout, not loose stacking. Grouping those would also move CF-built boards out of the flex flow the
        // factory authored them in.
        .filter((h) => PLATE(h) && h.width >= 24 && h.height >= 24 && !isFlow(h) && !OVER.test(h.name || ''))
        .sort((a, b) => (b.width * b.height) - (a.width * a.height));
      const taken = new Set();      // members already absorbed
      const live = kids.slice();    // member stand-in list (replaced by group after grouping)
      for (const h of byArea) {
        try {
          if (taken.has(h.id)) continue;   // already a member of an inner group
          // OVER layers (focus ring, hit pad, shadow, scrim) are deliberately larger than the control they wrap and are
          // judged by name. Swallowing one into an assembly group hides it from `designPage`'s ring hunt (which walks
          // boards, not groups) and re-sorts it in z-order, so they are never members.
          const members0 = live.filter((s) => s !== h && !taken.has(s.id) && !isFlow(s) && !OVER.test(s.name || '') &&
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

  // ---- componentize (G10, point 6): a redrawn copy of a registered master → a real instance ----
  // `CF.autoRegister` promotes one host per name; every OTHER host with that name is a copy, and a copy cannot be
  // fixed, swapped or variant-driven. This engine replaces each copy **in place**: same parent, same box, same z,
  // text overrides copied by text-layer name (the copy and its master come from the same factory, so the anatomy
  // matches). Flow children are skipped — appendChild + absolute would reflow the siblings; report them instead.
  // Size guard: a factory's internals are absolute, so `instance.resize()` does NOT reflow them. Replacing a 200-wide
  // demo copy with a 300-wide master instance left its field rect 100px outside the host (audit out_of_bounds ×5 on
  // page 04). Only a same-size copy can be swapped; a differently sized one is reported as `misfit`, never replaced.
  // Anatomy guard: a copy can be the *same size* and still carry more than the master — a screen's pricing card has
  // title + subtitle + seven feature rows + an action, while the registered master is the library's 2-text demo. The
  // swap kept the box and dropped everything else (measured on page 15: 3 pricing cards, 8 landing cards). A copy with
  // more descendants than the master is reported as `anatomy`, never replaced; registering a fuller master is the fix.
  storage.componentize = (opts) => {
    opts = opts || {};
    const root = opts.root || rootOf();
    const apply = !!opts.apply;
    const out = { apply: apply, hosts: 0, copies: 0, replaced: 0, flow: 0, failed: 0, main: 0, misfit: 0, anatomy: 0, sample: [], misfitSample: [], anatomySample: [], errors: [] };
    if (!storage.CF || !storage.CF.get) return { err: 'componentize needs component_factory.js (CF.get)' };
    const texts = (box) => {
      const acc = [], walk = (n, d) => {
        if (d > 8) return;
        let k; try { k = Array.from(n.children || []); } catch (e) { return; }
        for (const c of k) { if (c.type === 'text') acc.push(c); walk(c, d + 1); }
      };
      walk(box, 0);
      return acc;
    };
    const size = (box) => {
      let n = 0; const walk = (s, d) => {
        if (d > 8) return;
        let k; try { k = Array.from(s.children || []); } catch (e) { return; }
        n += k.length; k.forEach((c) => walk(c, d + 1));
      };
      walk(box, 0);
      return n;
    };
    const walk = (node) => {
      let kids; try { kids = kidsOf(node); } catch (e) { return; }
      if (!kids) return;
      for (const h of kids) {
        try {
          if (h.type !== 'board' || h.width < 4 || h.height < 4) { walk(h); continue; }
          const nm = String(h.name || '');
          const rec = /^([A-Za-z]+)·/.test(nm) ? storage.CF.get(nm) : null;
          if (!rec) { walk(h); continue; }
          const isInst = h.isComponentInstance && h.isComponentInstance();
          let main = null; try { main = rec.mainInstance ? rec.mainInstance() : null; } catch (e) {}
          if (isInst || (main && main.id === h.id)) { if (main && main.id === h.id) out.main++; walk(h); continue; }
          if (main && (Math.abs(main.width - h.width) > 2 || Math.abs(main.height - h.height) > 2)) {
            out.misfit++;
            if (out.misfitSample.length < 12) out.misfitSample.push(nm + ' ' + Math.round(h.width) + '×' + Math.round(h.height) + ' vs master ' + Math.round(main.width) + '×' + Math.round(main.height));
            walk(h); continue;
          }
          if (main && size(h) > size(main)) {
            out.anatomy++;
            if (out.anatomySample.length < 12) out.anatomySample.push(nm + ' ' + size(h) + ' nodes vs master ' + size(main));
            walk(h); continue;
          }
          out.hosts++; out.copies++;
          let absolute = true;
          try { absolute = !(h.layoutChild && h.layoutChild.absolute === false); } catch (e) {}
          if (!absolute) { out.flow++; walk(h); continue; }
          if (!apply) { if (out.sample.length < 12) out.sample.push(nm); walk(h); continue; }
          const box = { x: h.x, y: h.y, w: h.width, h: h.height };
          const parent = h.parent;
          let idx = 0, z = 0;
          try { idx = h.parentIndex; z = h.parentIndex; } catch (e) {}
          const hostTexts = texts(h);
          let inst = null;
          try { inst = rec.instance(); } catch (e) { out.failed++; out.errors.push(nm + ' → instance(): ' + String(e).slice(0, 60)); continue; }
          if (!inst) { out.failed++; out.errors.push(nm + ' → instance() returned null'); continue; }
          try { inst.resize(box.w, box.h); } catch (e) {}
          parent.appendChild(inst);
          try { if (inst.layoutChild) inst.layoutChild.absolute = true; } catch (e) {}
          try { inst.x = box.x; inst.y = box.y; } catch (e) {}
          try { inst.setParentIndex(z); } catch (e) {}
          try {
            const instTexts = texts(inst);
            const pool = {};
            instTexts.forEach((t) => { const k = String(t.name || ''); (pool[k] || (pool[k] = [])).push(t); });
            hostTexts.forEach((t) => {
              const list = pool[String(t.name || '')];
              const dst = list && list.shift();
              let s = ''; try { s = String(t.characters || ''); } catch (e) {}
              if (dst && s) { try { dst.characters = s; } catch (e) {} }
            });
          } catch (e) {}
          let okW = 0, okH = 0;
          try { okW = inst.width; okH = inst.height; } catch (e) {}
          if (Math.abs(okW - box.w) > 2 || Math.abs(okH - box.h) > 2) {
            try { inst.resize(box.w, box.h); } catch (e) {}
            try { okW = inst.width; okH = inst.height; } catch (e) {}
          }
          try { h.remove(); out.replaced++; if (out.sample.length < 12) out.sample.push(nm + ' ' + Math.round(okW) + '×' + Math.round(okH)); }
          catch (e) { out.failed++; out.errors.push(nm + ' → host.remove(): ' + String(e).slice(0, 60)); try { inst.remove(); } catch (e2) {} }
        } catch (e) { out.failed++; out.errors.push(String((h && h.name) || '?') + ' → ' + String(e).slice(0, 60)); }
        walk(h);
      }
    };
    walk(root);
    out.library = storage.CF.libraryCount ? storage.CF.libraryCount() : null;
    return out;
  };

  return { seeded: true, fns: ['alignPage', 'vAlignPage', 'fixInner', 'unclip', 'cleanOrphans', 'fixStaleCenter', 'groupAssemblies', 'fixZOrder', 'componentize'] };
})();
