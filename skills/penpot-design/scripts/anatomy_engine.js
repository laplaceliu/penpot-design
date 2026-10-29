// anatomy_engine.js — storage.AN: render a source-derived anatomy tree as a component wireframe.
// The tree comes from scripts/extract_anatomy.js (example JSX + reference CSS). This engine LAYS IT OUT and DRAWS it
// inside a spec frame, then LM.anatomyBoard registers the host as the designFamily master. No part-name lists.
//
// Rules:
//   A1 the host is the family board; every nested part is a child board (`an·*`) so text sits on its real ground and
//      the contrast audit resolves the local plate, not the page.
//   A2 layout is OUR absolute layout (the CSS is the source): column/row, gap, padding, explicit px/% sizes; every
//      coordinate/size snaps to 4px, every gap to a LY.SPACE step.
//   A3 material is token-mapped: CSS `--demo-*` → DESIGN.md roles (surface/surfaceAlt/border/ink/muted/primary…);
//      filled brand controls use the readable ink step so white copy clears 4.5:1. No shadows (a wireframe is flat).
//   A4 text is `mkText` (ramp-snapped) and gets a placeholder from its part when the example text is dynamic
//      ("Message content", "Action"), never an empty box.
//   A5 node/depth budgets (140/9) keep a heavy example under the MCP ceiling; overflow becomes a labelled slot.
return (function () {
  const AN = {};
  storage.AN = AN;
  const LY = storage.LY, CF = storage.CF, NL = storage.NL, MD = storage.MD;
  if (!LY || !CF || !NL) return { err: 'seed order: layout → component_factory → native_layout → library first' };

  AN.map = {};
  AN.attach = function (json) {
    const src = (json && json.components) || json || {};
    AN.map = src;
    let n = 0;
    try {
      (storage.LM.manifest.components || []).forEach((c) => {
        const a = src[c.designFamily] || src[c.name];
        if (a) { c.anatomy = a; n++; }
      });
    } catch (e) {}
    return { attached: n, components: Object.keys(src).length };
  };

  const P = () => storage.CF.P;
  const COLOR = (name) => {
    if (!name) return null;
    const p = P();
    const m = {
      surface: p.surface, surfaceAlt: p.surfaceAlt, surfaceRaised: p.surfaceRaised, neutralSoft: p.surfaceAlt,
      border: p.border, borderSubtle: p.borderSubtle || p.border, borderStrong: p.borderStrong,
      ink: p.ink, muted: p.muted, primary: p.primaryInk || p.primary, primarySoft: p.primarySoft,
      onInverse: p.onPrimary || '#FFFFFF', error: p.error, success: p.success, warning: p.warning, info: p.info,
      violet: p.violet || p.info, rose: p.error, sand: p.warning
    };
    return m[name] || (String(name).charAt(0) === '#' ? name : null);
  };
  const snap = (v, min) => Math.max(min === undefined ? 0 : min, Math.round((Number(v) || 0) / 4) * 4);
  const human = (s) => String(s || '').replace(/[._]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^(AngleSlider|Clipboard|Conversation|Message)/, '$1').trim();
  const labelOf = (n, fallback) => {
    const t = (n.text || '').trim();
    if (t) return t.slice(0, 90);
    const tag = String(n.tag || ''), part = String(n.part || ''), dp = String(n.dataPart || '');
    const cls = (n.cls && n.cls[0]) || '';
    // shortest honest slot: the data-part ("action-add-attachments"), else the class ("ValueText"), else the tag with
    // the family prefix removed (PromptInputActionAddAttachments → Action Add Attachments)
    let base = dp ? human(dp) : (cls ? human(cls) : human(tag || part));
    if (!dp && !cls && AN._family && base.toLowerCase().indexOf(String(AN._family).toLowerCase()) === 0) {
      base = base.slice(String(AN._family).length).trim();
    }
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : (fallback || 'Content');
  };

  // ---- measuring / drawing -------------------------------------------------
  AN._budget = 0;
  AN._maxNodes = 140;
  AN._maxDepth = 9;

  function styleOf(n) { return (n && n.style) || {}; }
  function dirOf(st) { return st.dir === 'row' || st.dir === 'row-reverse' ? 'row' : 'column'; }
  function padOf(st) { const p = st.pad; return p ? [p[0], p[1], p[2], p[3]].map((v) => snap(v || 0)) : [0, 0, 0, 0]; }
  function gapOf(st) { return st.gap ? snap(st.gap) : 0; }
  function radiusOf(st) {
    const r = st.radius;
    if (r === undefined || r === null) return 0;
    if (r >= 9000) return 9999;
    return CF.radius(r);
  }
  function fillOf(st, fallback) {
    if (st.bg) { const c = COLOR(st.bg); if (c) return c; }
    return fallback || null;
  }
  function inkOf(st) { return COLOR(st.color) || P().ink; }
  function lum(hex) {
    const c = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  const norm = (h) => String(h || '').toUpperCase();
  // A wireframe label is copy, so it must clear 4.5:1 on its local ground. The CSS palette is a demo stylesheet (some
  // muted steps are #A9A9A3 / #EEEEEC); map an unreadable colour to the readable step of the same role.
  function safeText(hex) {
    const p = P();
    if (!/^#[0-9A-F]{6}$/.test(norm(hex))) return p.ink;
    if (Math.min(ratio(hex, p.surface), ratio(hex, p.surfaceAlt)) >= 4.5) return hex;
    const eq = (a) => norm(a) === norm(hex);
    if (eq(p.primary)) return p.primaryInk || p.ink;
    if (eq(p.error)) return p.errorInk || p.ink;
    if (eq(p.success)) return p.successInk || p.ink;
    if (eq(p.warning)) return p.warningInk || p.ink;
    if (eq(p.info)) return p.infoInk || p.ink;
    return p.ink;
  }
  function darkFill(hex) {
    const p = P();
    return [p.primaryInk, p.primary, p.ink, p.inverse, p.error].some((x) => norm(x) === norm(hex));
  }
  function borderOf(shape, st) {
    if (!st.bc) return;
    const c = COLOR(st.bc) || P().border;
    try { shape.strokes = [{ strokeColor: c, strokeOpacity: 1, strokeWidth: st.bw || 1, strokeAlignment: 'inner' }]; } catch (e) {}
  }
  function textBox(parent, n, x, y, availW, st) {
    const fs = st.fs || 13, fw = st.fw || 400;
    const lh = st.lh || Math.round(fs * 1.5);
    const text = labelOf(n, 'Content');
    const w = Math.min(availW, Math.max(40, (CF.estW(text, fs) || 80) + 4));
    const lines = Math.max(1, Math.ceil((CF.estW(text, fs) || 80) / Math.max(40, availW)));
    const h = Math.max(snap(lh, 8), snap(lines * lh + 2, 8));
    const t = storage.mkText(text, 0, 0, fs, safeText(inkOf(st)), fw);
    if (!t) return { w: w, h: h };
    try { t.resize(w, h); t.growType = 'fixed'; } catch (e) {}
    try { t.align = st.align === 'center' ? 'center' : 'left'; t.verticalAlign = 'middle'; } catch (e) {}
    try { if (st.tt === 'uppercase') t.textTransform = 'uppercase'; } catch (e) {}
    storage.absMount(parent, t, parent.x + x, parent.y + y);
    try { t.name = 'an·text·' + human(n.part || n.tag || 'copy').slice(0, 18); } catch (e) {}
    AN._budget++;
    return { w: w, h: h };
  }
  function iconBox(parent, n, x, y, size, st) {
    const s = snap(size || 20, 8);
    const b = penpot.createBoard(); b.name = 'an·icon·' + human(n.tag || n.part || 'icon').slice(0, 16);
    b.resize(s, s); b.clipContent = false; b.fills = [];
    storage.absMount(parent, b, parent.x + x, parent.y + y);
    try { b.strokes = [{ strokeColor: P().muted, strokeOpacity: 0.55, strokeWidth: 1.4, strokeAlignment: 'inner' }]; } catch (e) {}
    try { b.borderRadius = CF.radius('xs'); } catch (e) {}
    // a small ink mark so a wireframe icon reads as "icon", not an empty box
    try {
      const p = penpot.createPath(); p.name = 'an·glyph';
      p.d = 'M 0 10 L 4 4 L 8 8 L 12 2';
      p.fills = [];
      p.strokes = [{ strokeColor: P().muted, strokeOpacity: 1, strokeWidth: 1.6, strokeAlignment: 'center', strokeCap: 'round', strokeJoin: 'round' }];
      p.x = b.x + 4; p.y = b.y + 4;
      storage.absMount(b, p, b.x + 4, b.y + 4);
    } catch (e) {}
    AN._budget++;
    return { w: s, h: s };
  }
  function mediaBox(parent, n, x, y, st) {
    const w = snap(st.w && typeof st.w === 'number' ? st.w : 48, 8);
    const h = snap(st.h && typeof st.h === 'number' ? st.h : w, 8);
    const b = penpot.createBoard(); b.name = 'an·media';
    b.resize(w, h); b.clipContent = false; b.fills = [{ fillColor: P().surfaceAlt, fillOpacity: 1 }];
    try { b.borderRadius = CF.radius(radiusOf(st) || 'sm'); } catch (e) {}
    storage.absMount(parent, b, parent.x + x, parent.y + y);
    AN._budget++;
    return { w: w, h: h };
  }
  function controlBox(parent, n, x, y, availW, st, kind) {
    const isInput = kind === 'input';
    const label = labelOf(n, isInput ? (n.label || 'Value') : 'Action');
    const h = snap(st.h && typeof st.h === 'number' ? st.h : (isInput ? 40 : 34), 8);
    const w = snap(st.w && typeof st.w === 'number' ? st.w : (isInput ? Math.max(120, availW) : Math.min(availW, (CF.estW(label, st.fs || 13) || 60) + 28)), 8);
    const fill = isInput ? (fillOf(st, P().surface)) : (fillOf(st, P().primaryInk || P().primary));
    const b = penpot.createBoard(); b.name = 'an·' + (isInput ? 'input' : 'button');
    b.resize(w, h); b.clipContent = false; b.fills = [{ fillColor: fill, fillOpacity: 1 }];
    try { b.borderRadius = CF.radius(radiusOf(st) || (isInput ? 'sm' : 'sm')); } catch (e) {}
    borderOf(b, st);
    storage.absMount(parent, b, parent.x + x, parent.y + y);
    // label INSIDE the control board so the contrast resolver reads the control fill, not the host
    const ink = isInput ? safeText(inkOf(st)) : (darkFill(fill) ? (P().onPrimary || '#FFFFFF') : safeText(inkOf(st)));
    const t = storage.mkText(label, 0, 0, st.fs || 13, ink, st.fw || 500);
    if (t) {
      try { t.resize(Math.max(24, w - 24), h); t.growType = 'fixed'; t.align = isInput ? 'left' : 'center'; t.verticalAlign = 'middle'; } catch (e) {}
      storage.absMount(b, t, b.x + (isInput ? 12 : 0), b.y);
      try { t.name = 'an·label'; } catch (e) {}
    }
    AN._budget++;
    return { w: w, h: h };
  }

  // measure + draw a node into parent board at local (x,y)
  function drawNode(parent, n, x, y, availW, depth) {
    AN._budget++;
    if (!n || depth > AN._maxDepth || AN._budget > AN._maxNodes) return { w: 0, h: 0 };
    // a hidden input / sr-only slot is metadata, not a visible part
    if (/HiddenInput|hidden-input|hiddeninput/i.test(String(n.tag || '') + ' ' + String(n.part || '') + ' ' + String(n.cls || ''))) return { w: 0, h: 0 };
    const st = styleOf(n);
    if (st.display === 'none') return { w: 0, h: 0 };
    if (n.t === 'text') return textBox(parent, n, x, y, availW, st);
    if (n.t === 'icon') return iconBox(parent, n, x, y, st.h || st.w || 20, st);
    if (n.t === 'media') return mediaBox(parent, n, x, y, st);
    if (n.t === 'input') return controlBox(parent, n, x, y, availW, st, 'input');
    if (n.t === 'button') return controlBox(parent, n, x, y, availW, st, 'button');

    // container
    const pad = padOf(st), gap = gapOf(st), dir = dirOf(st);
    const explicitW = st.w && typeof st.w === 'number' ? snap(st.w, 8) : (st.w && st.w.pct ? snap(availW * st.w.pct, 8) : 0);
    const innerW = explicitW ? Math.max(8, explicitW - pad[1] - pad[3]) : Math.max(40, availW - pad[1] - pad[3]);
    const kids = [], absKids = [];
    (n.kids || []).forEach((k) => {
      const reps = Math.min(3, Math.max(1, k.repeat || 1));
      for (let i = 0; i < reps; i++) { if ((k.style || {}).pos === 'absolute') absKids.push(k); else kids.push(k); }
    });
    // a board per part so local text grounds are real
    const b = penpot.createBoard(); b.name = 'an·' + human(n.part || n.tag || 'part').replace(/[.·]/g, '·').slice(0, 22);
    b.clipContent = false;
    const fill = fillOf(st, null);
    b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    try { b.borderRadius = CF.radius(radiusOf(st)); } catch (e) {}
    borderOf(b, st);
    storage.absMount(parent, b, parent.x + x, parent.y + y);
    let cx = pad[3], cy = pad[0], maxW = 0, rowH = 0;
    for (const k of kids) {
      if (AN._budget > AN._maxNodes) break;
      const ks = styleOf(k);
      let kw = innerW;
      if (dir === 'row') {
        if (ks.w && typeof ks.w === 'number') kw = snap(ks.w, 8);
        else if (k.t === 'text') kw = Math.min(innerW, (CF.estW(labelOf(k, ''), ks.fs || 13) || 80) + 4);
        else if (k.t === 'button') kw = Math.min(innerW, (CF.estW(labelOf(k, ''), ks.fs || 13) || 60) + 28);
        else if (k.t === 'icon') kw = snap(ks.w || 20, 8);
      }
      if (dir === 'row') {
        const sz = drawNode(b, k, cx, cy, kw, depth + 1);
        cx += sz.w + gap; rowH = Math.max(rowH, sz.h); maxW = Math.max(maxW, cx - gap + pad[1]);
      } else {
        const sz = drawNode(b, k, cx, cy, innerW, depth + 1);
        cy += sz.h + gap; maxW = Math.max(maxW, sz.w + pad[3] + pad[1]);
      }
    }
    let w = explicitW || Math.max(maxW, pad[1] + pad[3] + 8);
    let h = (st.h && typeof st.h === 'number') ? snap(st.h, 8) : (dir === 'row' ? rowH + pad[0] + pad[2] : Math.max(8, cy - gap + pad[2]));
    // a text-bearing leaf with a visible ground and no literal children still needs its placeholder copy
    const textish = /(Content|Label|Text|Value|Title|Description|Input|Placeholder|Empty|Reasoning)/i.test(String(n.part || n.tag || ''));
    // A NAMED empty part is still a part: `Highlight` is a <mark> whose copy is a JSX expression, `JsonTreeView.Tree`
    // is data-driven, so the tree ends in a named leaf with no children. Leaving it blank made a whole spec page a pale
    // bar (measured 2026-10-27). Decorative bands keep their silence.
    const named = !!n.part && !/^(Decor|Background|Bg|Overlay|Bar|Line|Divider|Track|Thumb|Dot|Indicator)$/i.test(String(n.part));
    const empty = kids.length === 0 && (textish || named);
    if (empty) {
      const ph = labelOf(n, human(n.part || n.tag));
      const pw = Math.min(innerW, Math.max(80, (CF.estW(ph, st.fs || 13) || 120) + 8));
      w = Math.max(w, pw + pad[1] + pad[3]);
      h = Math.max(h, snap((st.lh || Math.round((st.fs || 13) * 1.5)) + pad[0] + pad[2], 8));
    }
    if (st.minH && typeof st.minH === 'number') h = Math.max(h, snap(st.minH, 8));
    if (st.aspect) { const ar = parseFloat(st.aspect); if (ar > 0) h = snap(w / ar, 8); }
    w = snap(w, 8); h = snap(h, 8);
    try { b.resize(w, h); } catch (e) {}
    if (empty) textBox(b, { text: labelOf(n, human(n.part || n.tag)) }, pad[3], pad[0], Math.max(40, w - pad[1] - pad[3]), st);
    // absolutely positioned parts (scroll-to-bottom, floating actions): anchor to the container's inner corner
    for (const k of absKids) {
      const ks = styleOf(k);
      const sz = drawNode(b, k, 0, 0, innerW, depth + 1);
      if (sz && sz.board) {
        const rx = w - (ks.right || 12) - sz.w, ry = h - (ks.bottom || 12) - sz.h;
        try { storage.absMount(b, sz.board, b.x + Math.max(0, rx), b.y + Math.max(0, ry)); } catch (e) {}
      }
    }
    return { w: w, h: h, board: b };
  }


  const countNodes = (n) => 1 + (n.kids || []).reduce((a, k) => a + countNodes(k), 0);
  /** Sparse/data-driven examples still need an anatomy: render the part hierarchy as an indented tree diagram. This is
      derived from the source parts (Root → Content/Control → Item/Node), not an invented visual, and is used only when
      the example tree is too small (<8 nodes) or absent (Shimmer). */
  AN.renderFallback = function (entry, frame, o) {
    const parts = (entry.parts && entry.parts.length ? entry.parts : [entry.designFamily]);
    const host = penpot.createBoard(); host.name = entry.designFamily; host.clipContent = false;
    host.fills = [{ fillColor: P().surface, fillOpacity: 1 }];
    try { host.borderRadius = CF.radius('lg'); } catch (e) {}
    try { host.strokes = [{ strokeColor: P().border, strokeOpacity: 1, strokeWidth: 1, strokeAlignment: 'inner' }]; } catch (e) {}
    try { storage.NL.add(frame, host, 'fill', 'auto'); } catch (e) { try { frame.appendChild(host); } catch (e2) {} }
    const fam = String(entry.designFamily || '');
    const rows = [];
    if (/shimmer|skeleton/i.test(fam)) {
      // a shimmer is a bar, not a part list: three skeleton rows at the family's material
      for (let i = 0; i < 3; i++) rows.push({ name: i === 2 ? 'Shimmer' : '', level: 0, bar: true });
    } else {
      parts.forEach((p) => {
        const short = String(p).replace(new RegExp('^' + fam), '') || String(p);
        const lvl = /Root|Label|Tree$/i.test(short) ? 0 : (/Branch|Group|Content|Control|Trigger|Indicator|MarkerGroup/i.test(short) ? 1 : (/Item|Node|Marker|Thumb|Value|Text/i.test(short) ? 2 : 1));
        rows.push({ name: short || fam, level: lvl });
      });
    }
    let y = 24;
    rows.forEach((r, i) => {
      const x = 24 + r.level * 24;
      if (r.bar) {
        const bar = penpot.createRectangle(); bar.name = 'an·shimmer-bar';
        bar.resize(200 + (i % 2) * 60, 12); bar.borderRadius = CF.radius('xs');
        bar.fills = [{ fillColor: P().surfaceAlt, fillOpacity: 1 }];
        storage.absMount(host, bar, host.x + 24, host.y + y);
        y += 24;
        return;
      }
      // connector + chip + label (a part tree, not a flat list)
      if (r.level > 0) {
        const v = penpot.createRectangle(); v.name = 'an·connector';
        v.resize(1, 28); v.fills = [{ fillColor: P().border, fillOpacity: 1 }];
        storage.absMount(host, v, host.x + x - 12, host.y + y - 14);
      }
      const chip = penpot.createRectangle(); chip.name = 'an·part-chip';
      chip.resize(8, 8); chip.borderRadius = CF.radius('xs');
      chip.fills = [{ fillColor: r.level === 0 ? P().ink : P().muted, fillOpacity: 1 }];
      storage.absMount(host, chip, host.x + x, host.y + y + 8);
      const t = storage.mkText(r.name, 0, 0, 13, P().ink, r.level === 0 ? 600 : 400);
      if (t) {
        try { t.resize(Math.max(80, 600 - x), 24); t.growType = 'fixed'; t.verticalAlign = 'middle'; } catch (e) {}
        storage.absMount(host, t, host.x + x + 20, host.y + y);
        try { t.name = 'an·part·' + r.name.slice(0, 16); } catch (e) {}
      }
      y += 28;
    });
    const h = Math.max(80, Math.round((y + 24) / 4) * 4);
    try { host.resize(672, h); } catch (e) {}
    try { host.layoutChild.horizontalSizing = 'fix'; host.layoutChild.verticalSizing = 'fix'; } catch (e) {}
    try { host.setPluginData('nl:an', JSON.stringify({ fallback: true, nodes: rows.length })); } catch (e) {}
    return { host: host, w: 672, h: h, fallback: true, nodes: rows.length };
  };

  AN.render = function (entry, frame, o) {
    o = o || {};
    AN._family = entry.designFamily || entry.name || '';
    const a = entry.anatomy || (AN.map[entry.designFamily] || AN.map[entry.name]);
    // A source example whose tree is thinner than its declared parts is data-driven (TreeView passes a collection, so
    // the JSX has no rows). Those get the part-hierarchy diagram; a real example (Conversation 6 nodes/4 parts) keeps
    // its source wireframe.
    const anNodes = a && a.root ? countNodes(a.root) : 0;
    if (!a || !a.root || (anNodes < 6 && ((entry.parts || []).length > anNodes + 2))) return AN.renderFallback(entry, frame, o);
    AN._budget = 0;
    const ROOTW = 672;
    const host = penpot.createBoard();
    host.name = entry.designFamily;
    host.clipContent = false;
    const root = a.root;
    const st = styleOf(root);
    const pad = padOf(st);
    const fill = fillOf(st, P().surface);
    host.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    try { host.borderRadius = CF.radius(radiusOf(st)); } catch (e) {}
    borderOf(host, st);
    // the host is a flow child of the spec frame; children are absolute inside it
    try { storage.NL.add(frame, host, 'fill', 'auto'); } catch (e) { try { frame.appendChild(host); } catch (e2) {} }
    const kids = [], absRoot = [];
    (root.kids || []).forEach((k) => { const reps = Math.min(3, Math.max(1, k.repeat || 1)); for (let i = 0; i < reps; i++) { if ((k.style || {}).pos === 'absolute') absRoot.push(k); else kids.push(k); } });
    const dir = dirOf(st), gap = gapOf(st);
    const innerW = Math.max(80, ROOTW - pad[1] - pad[3]);
    let cx = pad[3], cy = pad[0], maxW = 0, rowH = 0;
    for (const k of kids) {
      if (AN._budget > AN._maxNodes) break;
      const ks = styleOf(k);
      const kw = dir === 'row' ? (ks.w && typeof ks.w === 'number' ? snap(ks.w, 8) : innerW) : innerW;
      if (dir === 'row') {
        const sz = drawNode(host, k, cx, cy, kw, 1);
        cx += sz.w + gap; rowH = Math.max(rowH, sz.h); maxW = Math.max(maxW, cx - gap + pad[1]);
      } else {
        const sz = drawNode(host, k, cx, cy, innerW, 1);
        cy += sz.h + gap; maxW = Math.max(maxW, sz.w + pad[3] + pad[1]);
      }
    }
    let w = ROOTW;
    let h = (st.h && typeof st.h === 'number') ? snap(st.h, 8) : (dir === 'row' ? rowH + pad[0] + pad[2] : Math.max(8, cy - gap + pad[2]));
    if (st.minH && typeof st.minH === 'number') h = Math.max(h, snap(st.minH, 8));
    h = snap(h, 8);
    try { host.resize(w, h); } catch (e) {}
    // THE ROOT IS THE COMPONENT when it has no element children (`Highlight`, `Suggestion`): its example copy is a JSX
    // expression the AST cannot resolve, so the source wireframe was an anonymous bar. Name the part on its own ground
    // and size the host to the label — an inline component is a chip, not a 672px sheet.
    if (!kids.length && !absRoot.length) {
      const lbl = entry.designFamily || human(root.part || root.tag) || labelOf(root, 'Component');
      const tw = (CF.estW(lbl, st.fs || 13) || 80) + 32;
      if (!(st.w && typeof st.w === 'number')) w = snap(Math.min(ROOTW, Math.max(160, tw + pad[1] + pad[3])), 8);
      h = snap(Math.max(h, pad[0] + (st.lh || 24) + pad[2] + 16), 8);
      try { host.resize(w, h); } catch (e) {}
      const tb = storage.mkText(lbl, 0, 0, st.fs || 13, safeText(inkOf(st)), st.fw || 500);
      if (tb) {
        try { tb.resize(Math.max(40, w - pad[1] - pad[3] - 16), 24); tb.growType = 'fixed'; tb.verticalAlign = 'middle'; tb.align = 'center'; } catch (e) {}
        storage.absMount(host, tb, host.x + pad[3] + 8, host.y + pad[0] + 8);
        try { tb.name = 'an·label'; } catch (e) {}
        AN._budget++;
      }
    }
    for (const k of absRoot) {
      const ks = styleOf(k);
      const sz = drawNode(host, k, 0, 0, innerW, 1);
      if (sz && sz.board) {
        const rx = w - (ks.right || 12) - sz.w, ry = h - (ks.bottom || 12) - sz.h;
        try { storage.absMount(host, sz.board, host.x + Math.max(0, rx), host.y + Math.max(0, ry)); } catch (e) {}
      }
    }
    try { host.layoutChild.horizontalSizing = 'fix'; host.layoutChild.verticalSizing = 'fix'; } catch (e) {}
    try { host.setPluginData('nl:an', JSON.stringify({ example: a.example || null, nodes: AN._budget })); } catch (e) {}
    return { host: host, w: w, h: h, example: a.example || null, nodes: AN._budget };
  };

  return { seeded: 'AN', api: ['attach', 'render'], components: Object.keys(AN.map).length };
})();
