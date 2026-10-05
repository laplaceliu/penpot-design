// seed_storage.js —— Penpot execute_code seeding engine
// Usage: paste the whole file into execute_code and run once; before each batch of business commands probe storage.mkText, and re-run this script if missing.
// Convention: literal functions go into storage.
// ⚠️ Important: storage.T is only a **JS-side color mirror** (for drawing functions to pick colors); it does NOT create any Penpot design token.
//     Real token entry goes through scripts/token_engine.js's storage.TK.seed(...); see references/design-tokens.md.

return (function () {
  // ---- storage.T: JS-side color mirror only (fill/replace per DESIGN.md); does not create Penpot tokens ----
  storage.T = storage.T || {
    primary: '#2563EB', primaryHover: '#1D4ED8', primaryActive: '#1E40AF', primaryDisabled: '#93C5FD',
    onPrimary: '#FFFFFF', secondary: '#64748B', neutral: '#F8FAFC', surface: '#FFFFFF',
    onSurface: '#0F172A', border: '#E2E8F0', error: '#DC2626', success: '#16A34A',
    radiusMd: 8, radiusLg: 12, padBtnX: 16, fontBtn: 14
  };
  const T = storage.T;

  // ---- page helper ----
  storage.pg = function (name) { return penpotUtils.getPageByName(name); };

  // ---- board factory: approach C (flex container + all absolute + world coordinates) ----
  storage.mkAbsBoard = function (name, x, y, w, h, fill, radius) {
    const b = penpot.createBoard();
    b.name = name; b.x = x; b.y = y; b.resize(w, h);
    b.borderRadius = radius || 0;
    b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    b.addFlexLayout();
    b.flex.dir = 'column';
    try { b.horizontalSizing = 'fixed'; b.verticalSizing = 'fixed'; } catch (e) {}
    return b;
  };

  // ---- mount: appendChild first, then absolute, then write world coordinates ----
  storage.absMount = function (parent, child, worldX, worldY) {
    parent.appendChild(child);
    child.layoutChild.absolute = true;
    child.x = worldX; child.y = worldY;
    return child;
  };

  // ---- text factory: CJK auto-selects Noto Sans SC (Penpot has no CSS font-stack fallback, applyToText applies to the whole paragraph) ----
  // 6th param fontRole: 'display' uses the display font (replace _display per DESIGN.md), others use the body font.
  // Iron rule: **this parameter must be present from the very start**. Adding a font option to mkText halfway through
  // would make the display font inconsistent between early and late batches, and this kind of inconsistency can't be caught by the geometry audit (only via auditPage().fonts histogram).
  const _noto = penpot.fonts.findByName('Noto Sans SC');
  const _latin = penpot.fonts.findByName('Nunito');
  const _display = penpot.fonts.findByName('Anton');   // ← replace with the display font from DESIGN.md
  const _variant = (f, w) => f.variants.find(v => v.fontWeight === String(w)) || f.variants.find(v => v.fontWeight === '400');
  storage.mkText = function (str, x, y, size, color, weight, fontRole) {
    const t = penpot.createText(str);
    t.x = x; t.y = y;
    const cjk = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(str);
    // CJK first: display fonts usually have no CJK glyphs, Chinese always falls back to Noto
    const font = cjk ? _noto : (fontRole === 'display' && _display ? _display : _latin);
    try { font.applyToText(t, _variant(font, weight || 400)); } catch (e) {}
    if (size) { try { t.fontSize = String(size); } catch (e) {} }
    if (color) { try { t.fills = [{ fillColor: color, fillOpacity: 1 }]; } catch (e) {} }
    return t;
  };

  // ---- in-board centering helper (absolute-positioned container) ----
  // ⚠️ Iron rule: t.width/t.height at the createText() creation instant are ~1px transient values (see mcp-automation "Text positioning").
  //    Using transient width/height to compute centering bakes the wrong offset into coordinates (text top-left landing exactly on host center = stale-center fingerprint).
  //    So ct() must center by **measuring after rendering** (async, internally sleeps 120ms). Callers always `await storage.ct(...)`.
  storage.sleep = storage.sleep || function (ms) { return new Promise((r) => setTimeout(r, ms)); };
  storage.ct = async function (b, str, opts) {
    opts = opts || {};
    const t = storage.mkText(str, 0, 0, opts.size, opts.color, opts.weight);
    await storage.sleep(120);                       // wait for the text to render real width/height
    storage.absMount(b, t, b.x + (b.width - t.width) / 2, b.y + (b.height - t.height) / 2);
    return t;
  };

  // ---- precise centering inside host (use when text has rendered real width/height; synchronous) ----
  // host can be rect/ellipse/board. Only moves coordinates, doesn't change z-order; don't apply to deliberately left-aligned text.
  storage.centerIn = function (t, host) {
    const nx = host.x + (host.width - t.width) / 2;
    const ny = host.y + (host.height - t.height) / 2;
    try { t.parentX = nx - t.parent.x; t.parentY = ny - t.parent.y; }
    catch (e) { t.x = nx; t.y = ny; }
    return t;
  };

  // ---- rectangle factory ----
  storage.mkRect = function (name, x, y, w, h, fill, radius, stroke, strokeW) {
    const r = penpot.createRectangle();
    r.name = name; r.x = x; r.y = y; r.resize(w, h);
    r.borderRadius = radius || 0;
    r.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    if (stroke) {
      r.strokes = [{ strokeColor: stroke, strokeOpacity: 1, strokeWidth: strokeW || 1 }];
      try { r.strokeAlignment = 'inner'; } catch (e) {}   // closed shapes always inner
    }
    return r;
  };

  // ---- token chip (page-header token bar) ----
  storage.mkChip = function (parent, x, y, label, color) {
    const box = storage.mkAbsBoard('chip-' + label, x, y, 96, 28, color || T.border, 14);
    storage.absMount(parent, box, x, y);
    const t = storage.mkText(label, x + 12, y + 6, 12, T.onSurface);
    storage.absMount(parent, t, x + 12, y + 6);
    return box;
  };

  return { seeded: true, tokens: Object.keys(T).length,
           fns: ['mkAbsBoard', 'absMount', 'mkText', 'mkRect', 'mkChip', 'pg', 'ct(async)', 'centerIn', 'sleep'] };
})();
