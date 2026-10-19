// icon_engine.js —— Penpot **icon catalog + placement** engine (storage.IC).
// Usage: paste the whole file into execute_code once; feed it icons, then place them.
// Catalog: assets/icons/lucide.jsonl (Lucide, ISC — see assets/icons/LICENSE), 1966 icons on a 24×24 grid,
//          one JSON object per line, plus a meta line carrying `{_meta, aliases}`.
// Decision + licences + how to add your own: references/icons.md.
//
// Why a catalog file instead of a `.penpot` library download (the answer to the penpothub question):
//   * importing a `.penpot` file is a **UI-only** operation — the plugin API has no such method, and cross-file
//     consumption goes through `connectLibrary`, which is on the still-unverified list (capabilities §12). A bundled
//     `.penpot` file would force a manual step in every session and no gate could verify it;
//   * binary assets are opaque to this workflow (they cannot be read, diffed or repaired by a script);
//   * `createShapeFromSvg` already turns an SVG into **editable vectors** (capabilities §9), so the data form we need
//     is text. Text is grep-able, license-clear, and pasteable into `execute_code` — exactly like every other engine.
//
// Three channels, pick per artifact (see references/icons.md):
//   in-control glyph, palette-driven, 1-2 paths   → `CF.glyph(ctx, kind, box, o)`   (85 hand-tuned kinds)
//   any catalog icon at a box/inside a flow       → `IC.place(name, {parent, color, size})`   ← this file
//   an SVG from the target system / anything else → `CF.svgIcon(svg, {parent, color})` (Entry C)
//
// Rules for bringing an SVG into the file (each one measured, capabilities §7/§9):
//   I1  `createShapeFromSvg` drops the group at **world (0,0) inside whichever board covers the origin** — so bring it in
//       through a throwaway board sitting there, then move the group from it;
//   I2  the platform adds a `base-background` rectangle → remove it, or a plate paints over the icon;
//   I3  `currentColor` is not resolved by this build → substitute a concrete color **before** it is brought in;
//   I4  **size is applied with `group.resize(size, size)` after the import** — measured: the svg root `width/height`
//       is ignored and the group lands at its **24-grid path bbox** (an 18-unit-wide icon arrives 18 px, whatever the
//       root says). Resize before mounting, so the sizing declaration still comes last (R5).

return (function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const IC = {};
  storage.IC = IC;

  IC.map = {};       // name -> body (inner SVG markup of one icon)
  IC.alias = {};     // alias -> canonical name
  IC.meta = null;

  const SVG_OPEN = (size) => `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24' fill='none'>`;
  const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const kebabToCamel = (s) => s.replace(/-([a-z])/g, (m, c) => c.toUpperCase());

  // ---------- seeding ----------
  /** Accepts: a JSONL string, an array of JSONL lines, an array of {name, body}, or a {name: body} object.
      Idempotent (same body = kept); the meta line sets `_meta` + `aliases`. Returns what was actually stored. */
  IC.seed = function (input) {
    let rows = [];
    if (typeof input === 'string') rows = input.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    else if (Array.isArray(input)) rows = input.map((r) => (typeof r === 'string' ? (function () { try { return JSON.parse(r); } catch (e) { return null; } })() : r)).filter(Boolean);
    else if (input && typeof input === 'object') {
      // object form: `_meta` (+ optional `aliases`) is kept as the meta row, everything else is an icon
      if (input._meta) rows.push({ _meta: input._meta, aliases: input.aliases || {} });
      rows = rows.concat(Object.keys(input).filter((k) => k !== '_meta' && k !== 'aliases')
        .map((k) => ({ name: k, body: input[k] })));
    }
    const out = { added: 0, kept: 0, aliases: 0, meta: null, bad: [] };
    rows.forEach((r) => {
      if (r && r._meta) { IC.meta = r._meta; if (r.aliases) { IC.alias = Object.assign(IC.alias, r.aliases); out.aliases = Object.keys(IC.alias).length; } out.meta = r._meta; return; }
      if (!r || !r.name || !r.body) { out.bad.push(r && r.name ? r.name : '<no name>'); return; }
      if (IC.map[r.name] === r.body) { out.kept++; return; }
      IC.map[r.name] = r.body; out.added++;
    });
    return out;
  };
  /** Add one icon. Accepts a body (`<path …/>`) or a full `<svg …>…</svg>` (the wrapper is unwrapped and its
      viewBox/width/height ignored — this engine always re-wraps at the requested size). */
  IC.add = function (name, svgOrBody) {
    if (!name || !svgOrBody) return { err: 'IC.add(name, body|svg) needs both' };
    let body = String(svgOrBody);
    if (body.indexOf('<svg') >= 0) {
      const inner = body.slice(body.indexOf('>') + 1, body.lastIndexOf('</svg>'));
      body = inner.replace(/<svg[\s\S]*$/, '');
    }
    if (!body) return { err: 'no drawable content for ' + name };
    IC.map[name] = body;
    return { ok: true, name: name, chars: body.length };
  };

  // ---------- lookup ----------
  /** name → body, with alias + camel/kebab resolution so `chevronDown`, `chevron-down` and the alias table all work. */
  IC.get = function (name) {
    if (!name) return null;
    if (IC.map[name]) return IC.map[name];
    const alt = /-/.test(name) ? kebabToCamel(name) : camelToKebab(name);
    if (IC.map[alt]) return IC.map[alt];
    const canon = IC.alias[name] || IC.alias[alt];
    if (canon && IC.map[canon]) return IC.map[canon];
    return null;
  };
  IC.has = (name) => !!IC.get(name);
  IC.list = () => Object.keys(IC.map).sort();
  IC.count = () => Object.keys(IC.map).length;
  IC.search = (q) => { const s = String(q || '').toLowerCase(); return IC.list().filter((n) => n.indexOf(s) >= 0); };
  /** Missing names, for batch checks (same spirit as CF.missing()). */
  IC.missing = (names) => (names || []).filter((n) => !IC.get(n));

  /** The catalog as a full SVG string with a concrete color (I3). Returns null when the name is unknown. */
  IC.svg = function (name, color, size) {
    const body = IC.get(name);
    if (!body) return null;
    const c = color || '#000000';
    return SVG_OPEN(size || 24) + body.replace(/currentColor/g, c) + '</svg>';
  };
  /** The SVG you would get — handy when the caller wants to inspect before bringing one in. */
  IC.hint = function () {
    return { extend: 'curl -sL https://unpkg.com/@iconify-json/lucide/icons.json  (then IC.add, see references/icons.md)',
             addOne: 'IC.add(name, bodyOrSvg) — body = <path …/> or a full <svg …>…</svg>',
             seedFile: 'assets/icons/lucide.jsonl — read one line per icon and IC.seed(lines)' };
  };

  // ---------- svg intake ----------
  /**
   * IC.place(name, o) → the icon as editable vectors at `o.x/o.y` (world) or inside `o.parent`.
   *   o = { parent, color, size=24, x, y, sizing='fix', nm, opacity }
   * Uses `CF.svgIcon` when the component factory is seeded (same measured svg-intake path, one implementation);
   * otherwise runs the path itself: throwaway board at the origin (I1) → bring it in → drop `base-background` (I2) →
   * recolor → move → remove the throwaway. Missing name = `{missing}` — never a silent placeholder.
   */
  IC.place = async function (name, o) {
    o = o || {};
    const size = o.size || 24;
    const svg = IC.svg(name, o.color, size);
    if (!svg) return { err: 'icon not in catalog: ' + name, missing: name, have: IC.count() };
    if (storage.CF && typeof storage.CF.svgIcon === 'function') {
      const r = storage.CF.svgIcon(svg, { parent: o.parent, x: o.x, y: o.y, w: size, h: size, color: o.color, name: o.nm, sizing: o.sizing || 'fix' });
      return Object.assign({ icon: name, size: size }, r);
    }
    let tmp = null, g = null;
    try {
      tmp = penpot.createBoard(); tmp.name = 'IC·tmp'; tmp.x = -1; tmp.y = -1; tmp.resize(2, 2);
      g = penpot.createShapeFromSvg(svg);
      if (!g) return { err: 'createShapeFromSvg returned nothing (content:write permission)' };
      Array.from(g.children || []).forEach((c) => { if (/base-background/.test(c.name || '')) { try { c.remove(); } catch (e) {} } });
      if (o.color) { const paint = (sh) => { try { if (sh.strokes && sh.strokes.length) sh.strokes = [{ strokeColor: o.color, strokeOpacity: 1, strokeWidth: (sh.strokes[0] && sh.strokes[0].strokeWidth) || 2 }]; } catch (e) {} Array.from(sh.children || []).forEach(paint); }; paint(g); }
      if (o.nm) { try { g.name = o.nm; } catch (e) {} }
      // I4: the group arrives at its 24-grid bbox, not at the svg root size → scale it here, before any mount
      try { g.resize(size, size); } catch (e) {}
      if (o.parent) {
        o.parent.appendChild(g);
        if (g.layoutChild) {
          if (o.x !== undefined && o.y !== undefined) { try { g.layoutChild.absolute = true; g.x = o.x; g.y = o.y; if (storage.NL && storage.NL._note) storage.NL._note(g, { declaredAbsolute: true }); } catch (e) {} }
          else { try { g.layoutChild.horizontalSizing = o.sizing || 'fix'; g.layoutChild.verticalSizing = o.sizing || 'fix'; } catch (e) {} }
        } else if (o.x !== undefined) { try { g.x = o.x; g.y = o.y; } catch (e) {} }
      } else {
        // no parent: the group was born *inside the throwaway board*, so it must be moved out first — removing the
        // throwaway deletes its children (measured failure mode of the first version)
        try { penpot.currentPage.root.appendChild(g); } catch (e) {}
        if (o.x !== undefined) { try { g.x = o.x; g.y = o.y; } catch (e) {} }
      }
    } catch (e) { return { err: String(e && e.message || e) }; }
    try { if (tmp) tmp.remove(); } catch (e) {}
    return { ok: true, icon: name, size: size, group: g, name: g && g.name, parent: g && g.parent ? g.parent.name : null,
             kids: g ? Array.from(g.children || []).map((c) => c.name) : [] };
  };

  /**
   * IC.grid(o) → a labeled icon grid (the `01 · Foundations` icon section, a spec sheet, an empty-state picker).
   *   o = { names, x, y, cols=8, cell=96, size=24, color, parent, labels=true, labelSize=11, labelColor }
   * Cells are computed from `x/y` + `cell` (no magic numbers beyond what the caller passes — G11: the caller gets the
   * rect from `LY.rect`). Labels are measured after render (the 1×1 transient, api-pitfalls §3) and centered under
   * each icon, so this call is **async**. Returns per-cell placement + `missing`.
   */
  IC.grid = async function (o) {
    o = o || {};
    const names = (o.names || []).slice();
    if (!names.length) return { err: 'IC.grid({names: […]}) needs at least one name' };
    const cols = o.cols || 8, cell = o.cell || 96, size = o.size || 24, x0 = o.x || 0, y0 = o.y || 0;
    const wantLabels = o.labels !== false && typeof storage.mkText === 'function';
    const placed = [], missing = [];
    let maxLabelW = 0;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const cx = x0 + (i % cols) * cell, cy = y0 + Math.floor(i / cols) * cell;
      const r = await IC.place(name, { color: o.color, size: size, nm: 'icon·' + name,
        x: cx + (cell - size) / 2, y: cy + (cell - size) / 2 - (wantLabels ? 8 : 0),
        parent: o.parent, sizing: 'fix' });
      if (r.err) { missing.push(name); continue; }
      let label = null;
      if (wantLabels) {
        label = storage.mkText(name, cx, cy + cell - 26, o.labelSize || 11, o.labelColor || (storage.T && storage.T.secondary) || '#475569', 500);
        // mkText leaves every layer named 'Text' — name it after the icon so the file stays navigable
        try { label.name = name; } catch (e) {}
        // always attach explicitly: an unparented createText lands wherever the app's sticky frame is (same class as I1)
        try { (o.parent || penpot.currentPage.root).appendChild(label); } catch (e) {}
        if (o.parent && label.layoutChild) { try { label.layoutChild.absolute = true; } catch (e) {} }
        placed.push({ name: name, icon: r.group, label: label, cx: cx + cell / 2, cy: cy });
        await sleep(90);   // measure the rendered width before centering (1×1 transient otherwise)
        const lw = label.width || 0; maxLabelW = Math.max(maxLabelW, lw);
        try { label.x = cx + (cell - lw) / 2; label.y = cy + cell - 26; } catch (e) {}
      } else placed.push({ name: name, icon: r.group, cx: cx + cell / 2, cy: cy + cell / 2 });
    }
    const rows = Math.ceil(names.length / cols);
    return { ok: true, count: placed.length, missing: missing, cols: cols, rows: rows,
             box: { x: x0, y: y0, w: cols * cell, h: rows * cell },
             cells: placed.map((p) => ({ name: p.name, x: p.cx, y: p.cy })) };
  };

  return { seeded: 'IC', fns: ['IC.seed', 'IC.add', 'IC.get', 'IC.has', 'IC.list', 'IC.count', 'IC.search', 'IC.missing',
                               'IC.svg', 'IC.place', 'IC.grid', 'IC.hint'],
           note: 'catalog assets/icons/lucide.jsonl (ISC) ; seed one line per icon ; IC.place brings icons in through a throwaway (I1-I4) ; CF.glyph stays the in-control path' };
})();
