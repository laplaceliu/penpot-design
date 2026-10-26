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
  /** Delete root-level strays. A shape outside `NN-PageRoot` is a stray by contract (audit `root_stray`), and the
      usual cause is `board.remove()` re-parenting a removed container's loose children to the page root. The old
      version only deleted root-level TEXT, so leaked glyphs/plates (paths, rects) survived every cleanup pass
      (measured 2026-10-26: 102 checkbox glyphs/dashes on page 04). It now removes every non-PageRoot root shape,
      recursively, and still removes loose text that sits directly under the PageRoot board. */
  storage.cleanOrphans = (opts) => {
    opts = opts || {};
    const frame = rootOf();
    const keep = opts.keep || [];
    const dry = !!opts.dry;
    const names = [];
    Array.from(frame.children || []).forEach((c) => {
      const nm = String(c.name || '');
      if (/-PageRoot$/.test(nm)) return;
      if (keep.some((k) => nm === k || (k instanceof RegExp && k.test(nm)))) return;
      names.push(nm || c.type);
      if (!dry) { try { (storage.removeTree || function (x) { x.remove(); })(c); } catch (e) {} }
    });
    const pr = Array.from(frame.children || []).find((c) => /-PageRoot$/.test(String(c.name)));
    if (pr) Array.from(pr.children || []).forEach((c) => {
      if (c.type === 'text') { names.push('PageRoot/text:' + String(c.name || '')); if (!dry) { try { c.remove(); } catch (e) {} } }
    });
    return { dry: dry, removed: names.length, names: names.slice(0, 30) };
  };

  // ---- unifyCorners: §5.1 "one control, one corner" (rule 63 control_corner_split) ----
  /**
   * Every FRAME part of a field control (`field`, `addon·*`, `stepper`, `disabled-overlay`, `ring·*`) takes the
   * control's resolved corner. The factory resolves it once (`CF.fieldRadius()`: forms profile → `field` role, never
   * the button pill), but a host built by an older generation can carry a square borderless body beside a rounded
   * ring/overlay/stepper (measured 2026-10-26 on `05 · Forms II`: field r0, ring + disabled-overlay + steppers r9999).
   * One scalar corner per plate keeps every value token-bindable — `TK.bindBoard` writes the four corner props as one
   * token, so a per-corner design would be flattened by the next bind. Popup surfaces (panel/row/option), chips,
   * carets and divider lines are not frame parts and are left alone. `o.radius` overrides the resolved step; `o.dry`
   * only reports. Bind afterwards (TK.bindPage / TK.radiusSweep) and re-audit.
   */
  storage.unifyCorners = (root, o) => {
    o = o || {};
    const CFx = storage.CF;
    let R = o.radius;
    if (R === undefined || R === null) R = (CFx && CFx.fieldRadius) ? CFx.fieldRadius() : 12;
    R = Math.round(Number(R) || 0);
    const FRAME = /^(field|addon·|addon$|stepper$|disabled-overlay$|ring·)/;
    const maxCorner = (s) => {
      let b = null; try { b = s.borderRadius; } catch (e) { return null; }
      if (b === null || b === undefined) return null;
      if (typeof b === 'number') return b;
      if (typeof b === 'object') return Math.max(Number(b.borderRadiusTopLeft) || 0, Number(b.borderRadiusTopRight) || 0,
        Number(b.borderRadiusBottomRight) || 0, Number(b.borderRadiusBottomLeft) || 0);
      return null;
    };
    const out = { radius: R, hosts: 0, parts: 0, changed: 0, sample: [], dry: !!o.dry };
    (function walk(s) {
      let ks = []; try { ks = Array.from(s.children || []); } catch (e) { ks = []; }
      if (ks.some((k) => String(k.name || '') === 'field')) {
        out.hosts++;
        const hc = maxCorner(s);
        if (hc !== null && Math.round(hc) !== R) {
          out.changed++;
          if (!o.dry) { try { s.borderRadius = R; } catch (e) {} }
          if (out.sample.length < 12) out.sample.push(String(s.name || '?').slice(0, 24) + ' host r' + Math.round(hc) + '→r' + R);
        }
        ks.forEach((k) => {
          const n = String(k.name || '');
          if (!FRAME.test(n)) return;
          out.parts++;
          const v = maxCorner(k);
          if (v === null || Math.round(v) === R) return;
          out.changed++;
          if (!o.dry) { try { k.borderRadius = R; } catch (e) {} }
          if (out.sample.length < 12) out.sample.push(String(s.name || '?').slice(0, 24) + ' / ' + n + ' r' + Math.round(v) + '→r' + R);
        });
      }
      ks.forEach(walk);
    })(root || rootOf());
    return out;
  };

  // ---- repairAxisRow: rule 64 axis_column_off — the state row must sit on its columns ----
  /**
   * A matrix sheet names its columns with one `axis` text per column, and each label must sit on the column whose
   * cells it names. `CF.matrix` used to let the axes enter the grid while still `absolute`, so the platform ignored
   * the explicit (row,col) and auto-placed them from the first free cell: the whole state row read one column left
   * and the last state had no label (measured 2026-10-26 on every grid on page 05). This pass re-cells each axis to
   * its slot's column and lets the grid re-flow, then settles. Geometry is the trigger (flush-left or centred is
   * legal); a cell that names a different column is also repaired. `o.dry` reports only.
   */
  storage.repairAxisRow = async (root, o) => {
    o = o || {};
    const NL = storage.NL;
    const out = { grids: 0, axes: 0, fixed: 0, skipped: 0, moved: [], dry: !!o.dry };
    (function walk(s) {
      let ks = []; try { ks = Array.from(s.children || []); } catch (e) { ks = []; }
      if (/^grid·/.test(String(s.name || ''))) {
        const ax = ks.filter((k) => /^axis/.test(String(k.name || '')) && k.type === 'text').sort((a, b) => a.x - b.x);
        if (ax.length >= 2) {
          const byRow = {};
          ks.forEach((k) => {
            const m = /^slot·.+?·(\d+)\.(\d+)$/.exec(String(k.name || ''));
            if (!m) return;
            const r = Number(m[1]), c = Number(m[2]);
            (byRow[r] || (byRow[r] = {}))[c] = k;
          });
          const rowKeys = Object.keys(byRow).map(Number).sort((a, b) => a - b);
          const cols = rowKeys.length ? Object.keys(byRow[rowKeys[0]]).map(Number).sort((a, b) => a - b).map((c) => byRow[rowKeys[0]][c]) : [];
          if (cols.length) {
            out.grids++;
            ax.forEach((t, i) => {
              const slot = cols[i];
              if (!slot) { out.skipped++; return; }
              out.axes++;
              let cellCol = null, slotCol = null, row = 1;
              try { cellCol = t.layoutCell && t.layoutCell.column; row = (t.layoutCell && t.layoutCell.row) || 1; } catch (e) {}
              try { slotCol = slot.layoutCell && slot.layoutCell.column; } catch (e) {}
              const cellBad = !!(cellCol && slotCol && cellCol !== slotCol);
              const flush = Math.abs(t.x - slot.x) <= 2;
              const centred = Math.abs((t.x + t.width / 2) - (slot.x + slot.width / 2)) <= 2;
              // CELL FIRST when the grid exposes one: after the first axis lands, the platform re-flows the remaining
              // auto-placed siblings, so their pre-settle x is still stale even though their cell is already right.
              // Geometry is the fallback for a shape without a cell (a wrapped/flex-row sheet).
              const geoBad = (!cellCol || !slotCol) && (!flush && !centred);
              if (!cellBad && !geoBad) return;
              // A grid child is moved by its CELL. `NL.cell` clears `absolute` before the append (the platform ignores
              // (row,col) otherwise). After the first axis lands, the platform re-flows the auto-placed siblings, so
              // the loop re-reads each child rather than trusting the pre-pass cells.
              if (slotCol && NL && NL.cell) {
                out.fixed++;
                if (!o.dry) { try { NL.cell(s, t, row, slotCol); } catch (e) { out.fixed--; out.skipped++; } }
                if (out.moved.length < 12) out.moved.push({ grid: String(s.name), axis: String(t.characters || '').slice(0, 16), from: cellCol, to: slotCol });
              } else {
                // A flex-row axis (the wrapped fallback sheet): a layout child's x is derived, so report rather than nudge.
                out.skipped++;
              }
            });
          }
        }
      }
      ks.forEach(walk);
    })(root || rootOf());
    if (!o.dry && out.fixed && NL && NL.settle) { try { await NL.settle(); } catch (e) {} }
    return out;
  };

  // ---- repairChips: rules 65/66 — inner pills are Chip components and the row is centred on the field ----
  /**
   * A composite field's tags are a COMPOSITION of the Chip atom, not three loose shapes: a pill plate + a text + a ✕
   * redrawn inside MultiSelect cannot be instanced, themed or fixed from one place (measured 2026-10-26 on the
   * selected `MultiSelect·Outlined·MD` master). This pass replaces a raw tag cluster with a copy of the registered
   * `Chip·Input·SM·Clear·Neutral` master, then centres the whole tag block on the field. The old centring formula
   * counted a trailing gap (`rowsN*(chipH+4)`), which put the 24px row at top 4 / bottom 8 in a 36px field (the
   * user's “上少下多”). `o.master` overrides the atom name; `o.dry` reports only. Run after building a composite
   * family, or on any composite that predates the Chip atom.
   */
  storage.repairChips = async (root, o) => {
    o = o || {};
    const CFx = storage.CF;
    const masterName = o.master || 'Chip·Input·SM·Clear·Neutral';
    const master = CFx && CFx.get ? CFx.get(masterName) : null;
    const out = { hosts: 0, raw: 0, converted: 0, centered: 0, skipped: 0, samples: [], dry: !!o.dry };
    const isCopy = (k) => { try { return !!(k.isComponentCopyInstance && k.isComponentCopyInstance()); } catch (e) { return false; } };
    const kidsOf = (s) => { try { return Array.from(s.children || []); } catch (e) { return []; } };
    (function walk(s) {
      const ks = kidsOf(s);
      const field = ks.filter((k) => String(k.name || '') === 'field')[0] || null;
      const chips = ks.filter((k) => /^chip(?:·|$)/.test(String(k.name || '')) && k.type !== 'text' && k.type !== 'path');
      if (field && chips.length) {
        out.hosts++;
        chips.forEach((ch) => { if (!isCopy(ch)) out.raw++; });
        if (!o.dry && master && CFx.instance) {
          chips.forEach((ch) => {
            if (isCopy(ch)) return;
            const box = { x: Number(ch.x), y: Number(ch.y), w: Number(ch.width), h: Number(ch.height) };
            const inside = (k) => {
              const cx = Number(k.x) + Number(k.width) / 2, cy = Number(k.y) + Number(k.height) / 2;
              return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
            };
            const text = ks.filter((k) => k.type === 'text' && inside(k))[0] || null;
            const close = ks.filter((k) => /^glyph·close/.test(String(k.name || '')) && inside(k))[0] || null;
            const label = text ? String(text.characters || '') : 'Tag';
            const keep = String(ch.name || 'chip');
            [ch, text, close].forEach((k) => { if (k) { try { (storage.removeTree || function (x) { x.remove(); })(k); } catch (e) {} } });
            const r = CFx.instance(masterName, { parent: s, absolute: { x: box.x, y: box.y }, text: label });
            if (r && r.ok) {
              try { r.inst.name = keep; } catch (e) {}
              try { CFx.chipFit(r.inst, label, { w: box.w, h: box.h }); } catch (e) {}
              out.converted++;
              if (out.samples.length < 10) out.samples.push(String(s.name || '?').slice(0, 26) + ' / ' + label + ' ' + Math.round(box.w) + '×' + Math.round(box.h));
            } else out.skipped++;
          });
        } else if (!master) out.skipped += chips.length;
        // Centre the BLOCK (chips + inner gaps, never a trailing gap) on the field.
        const now = kidsOf(s).filter((k) => /^chip(?:·|$)/.test(String(k.name || '')) && k.type !== 'text' && k.type !== 'path');
        if (now.length && field) {
          const minY = Math.min.apply(null, now.map((k) => Number(k.y)));
          const maxY = Math.max.apply(null, now.map((k) => Number(k.y) + Number(k.height)));
          const dy = (Number(field.y) + Number(field.height) / 2) - (minY + (maxY - minY) / 2);
          if (Math.abs(dy) > 0.5) {
            out.centered++;
            if (!o.dry) now.forEach((k) => { try { k.y = Number(k.y) + dy; } catch (e) {} });
            if (out.samples.length < 10) out.samples.push(String(s.name || '?').slice(0, 26) + ' chips centre ' + Math.round(dy * 10) / 10 + 'px');
          }
        }
      }
      ks.forEach(walk);
    })(root || rootOf());
    if (!o.dry && (out.converted || out.centered)) { try { await new Promise((r) => setTimeout(r, 300)); } catch (e) {} }
    return out;
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
          try { (storage.removeTree || function (x) { x.remove(); })(h); out.replaced++; if (out.sample.length < 12) out.sample.push(nm + ' ' + Math.round(okW) + '×' + Math.round(okH)); }
          catch (e) { out.failed++; out.errors.push(nm + ' → host.remove(): ' + String(e).slice(0, 60)); try { inst.remove(); } catch (e2) {} }
        } catch (e) { out.failed++; out.errors.push(String((h && h.name) || '?') + ' → ' + String(e).slice(0, 60)); }
        walk(h);
      }
    };
    walk(root);
    out.library = storage.CF.libraryCount ? storage.CF.libraryCount() : null;
    return out;
  };

  // ---- fitTexts: make every text's BOX its content, and make the RENDER follow the box ----
  // WHY. `penpot.createText(str)` lays the text out at a transient width, so the shape is born with a height that does
  // NOT match its content (measured 2026-10-22 on this Penpot 2.17: a 16px/24 label read h=384, a 36px/48 page title
  // read h=1728 — in both cases `fontSize × lineHeight`), and the glyphs are drawn at the VERTICAL CENTRE of that box.
  // Three consequences, all visible in an export:
  //   1. the glyphs sit hundreds of pixels below the shape's own origin — outside their host, and clipped away (the
  //      export of `01-Header` showed only the right-hand stamp, whose short box happened to keep its glyphs inside);
  //   2. the audit reads the BOX, so a stale height reads as a 1728-tall label overlapping its neighbours;
  //   3. the offset is FROZEN at the first layout: `textBounds.y` keeps the first box's centring forever, so moving
  //      or resizing the shape afterwards does not move the glyphs (measured: the title's `textBounds.y` stayed 882
  //      through a move, two resizes and a characters rewrite, while its shape `y` was 40).
  // THE TWO MOVES. (a) resize the box to the content — `textBounds` gives the content's own box once the text has
  // laid out; (b) force a RE-LAYOUT, because only a real property change re-runs it: writing the line-height twice (a
  // nudge, then the real value) recomputes the centring against the now-correct box, so `textBounds.y` returns to the
  // shape's own origin (measured: a label at y=88 saw `textBounds.y` go 219 → 87).
  // THE ORDER MATTERS, and both halves of it are measured. A `resize` BEFORE a text has ever been laid out leaves it
  // with EMPTY bounds and it never renders at all (a freshly created label read w=1, h=1 and stayed that way). So the
  // pass WAITS for the layout — the bounds must report a real width and height — and it never probes: a text that is
  // still laying out is left alone rather than resized on a guess. A single-line text gets the content's own width plus
  // 8px of slack (a box of EXACTLY the content's width wraps the last glyph: a 249px title rendered on two lines in a
  // 249px box); a WRAPPED paragraph keeps its column width and only its height is written.
  // IDEMPOTENT: a second pass finds every box already at (width + 8, one line) and only re-nudges.
  storage.fitTexts = async (root) => {
    root = root || rootOf();
    const out = { checked: 0, fitted: 0, relaid: 0, settled: 0, pending: 0, errors: [] };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const texts = [];
    const walk = (node) => { const kids = kidsOf(node); if (!kids) return; for (const c of kids) { if (c.type === 'text') texts.push(c); walk(c); } };
    walk(root);
    if (!texts.length) return out;
    const info = (t) => {
      let tb = null; try { tb = t.textBounds; } catch (e) {}
      let lh = 0; try { lh = parseFloat(t.lineHeight) || 0; } catch (e) {}
      const w = Math.round(t.width || 0), h = Math.round(t.height || 0);
      const tw = tb ? Math.round(tb.width) : 0, th = tb ? Math.round(tb.height) : 0;
      return { tb: tb, lh: lh, w: w, h: h, tw: tw, th: th, ok: tw > 1 && th > 0 && w > 1 };
    };
    // ---- wait for the layout: a text that has not been laid out is never resized
    for (let tries = 0; tries < 24; tries++) {
      await sleep(260);
      let ok = 0;
      for (const t of texts) if (info(t).ok) ok++;
      out.settled = ok;
      if (ok === texts.length) break;
    }
    // ---- fit the box to the content
    const pending = [];
    for (const t of texts) {
      out.checked++;
      const i = info(t);
      if (!i.ok) { out.pending++; pending.push(t); continue; }
      const wrapped = i.lh > 0 && i.th > i.lh * 1.6;
      const newW = wrapped ? i.w : Math.max(i.w, i.tw + 8);
      const newH = i.th;
      if (newW !== i.w || newH !== i.h) {
        const delta = newW - i.w;
        try { t.resize(newW, newH); out.fitted++; } catch (e) { out.errors.push(String(e).slice(0, 70)); continue; }
        // the glyphs keep their own position inside the box, so a box that changed width shifts them: give the slack
        // back to the side the text is aligned to.
        if (delta) {
          let al = 'left'; try { al = t.align || 'left'; } catch (e) {}
          const shift = al === 'center' ? -delta / 2 : (al === 'right' ? -delta : 0);
          if (shift) { try { t.x = t.x + shift; } catch (e) {} }
        }
      }
    }
    // ---- the nudge that re-anchors the glyphs to the (now correct) box
    const nudged = [];
    for (const t of texts) { try { const lh = t.lineHeight; if (lh) { nudged.push([t, String(lh)]); t.lineHeight = '1.2'; } } catch (e) {} }
    if (nudged.length) {
      await sleep(340);
      for (const n of nudged) { try { n[0].lineHeight = n[1]; out.relaid++; } catch (e) { out.errors.push(String(e).slice(0, 70)); } }
      await sleep(440);
    }
    return out;
  };

  /** Re-centre every control label on BOTH axes of its host. A label whose size was edited after birth keeps its
      old box (the factory's refit only knows the size it was born with), so it reads 10-30px off-axis while every
      style token still passes. `CF.centerLabel` uses `storage.centerIn` (`parentX/parentY`), the only coordinate pair
      that writes on a layout child. Icon-slot hosts are skipped: their label is offset by design. Idempotent. */
  storage.centerLabels = function (root, o) {
    o = o || {};
    const scope = root || (penpot.currentPage && penpot.currentPage.root);
    const CFx = storage.CF;
    if (!scope) return { err: 'no scope' };
    if (!CFx || !CFx.centerLabel) return { err: 'CF.centerLabel missing — seed component_factory.js' };
    const isCtl = (nm) => {
      const n = String(nm || '');
      if (/·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^Masters·/.test(n)) return false;
      return /^(Button|Tab|Chip|Checkbox|Radio|Switch)·/.test(n) || /(?:Button|Cta|Toggle)$/.test(n.split('·').pop());
    };
    const out = { hosts: 0, fixed: 0, skipped: 0, rows: [] };
    (function walk(s) {
      Array.from(s.children || []).forEach((c) => {
        if (c.type === 'board' && isCtl(c.name)) {
          out.hosts++;
          const iconSlot = /IconStart|IconEnd|Lead|Trail/.test(String(c.name)) ||
            (Array.from(c.children || []).some((k) => k.type === 'path' || /^(glyph|icon)·/.test(String(k.name))));
          if (iconSlot) { out.skipped++; }
          else {
            const r = CFx.centerLabel(c);
            if (r && r.ok) { out.fixed++; if (out.rows.length < 40) out.rows.push({ host: String(c.name), dx: r.dx, dy: r.dy }); }
            else out.skipped++;
          }
        }
        walk(c);
      });
    })(scope);
    return out;
  };

  return { seeded: true, fns: ['alignPage', 'vAlignPage', 'fixInner', 'unclip', 'cleanOrphans', 'unifyCorners', 'repairAxisRow', 'repairChips', 'fixStaleCenter', 'groupAssemblies', 'fixZOrder', 'componentize', 'fitTexts', 'centerLabels'] };
})();
