// seed_storage.js —— Penpot execute_code seeding engine
// Usage: paste the whole file into execute_code and run once; before each batch of business commands probe storage.mkText, and re-run this script if missing.
// Convention: literal functions go into storage.
// ⚠️ Important: storage.T is only a **JS-side color mirror** (for drawing functions to pick colors); it does NOT create any Penpot design token.
//     Real token entry goes through scripts/token_engine.js's storage.TK.seed(...); see references/design-tokens.md.

return (function () {
  // ---- storage.T: JS-side color mirror only (fill/replace per DESIGN.md); does not create Penpot tokens ----
  storage.T = storage.T || {
    primary: '#2563EB', primaryHover: '#1D4ED8', primaryActive: '#1E40AF', primaryDisabled: '#93C5FD',
    onPrimary: '#FFFFFF', secondary: '#475569', neutral: '#F8FAFC', surface: '#FFFFFF',
    onSurface: '#0F172A', border: '#E2E8F0', error: '#DC2626', success: '#16A34A',
    // §4 ramp: the 7–8 step is the only tone allowed to carry copy (text on a tint, white on a solid).
    primaryInk: '#1E40AF', errorInk: '#991B1B', successInk: '#166534', warningInk: '#92400E', infoInk: '#075985',
    // the graphic (6-level) step of the remaining semantic tones, and each tone's wash. Copy never sits on either:
    // ink-on-own-wash is the readable pair (design-guide §4.1).
    warning: '#D97706', info: '#0284C7',
    primarySoft: '#DBEAFE', errorSoft: '#FEE2E2', successSoft: '#DCFCE7', warningSoft: '#FEF3C7', infoSoft: '#E0F2FE',
    radiusMd: 8, radiusLg: 12, padBtnX: 16, fontBtn: 14
  };
  const T = storage.T;

  // ---- page helper ----
  storage.pg = function (name) { return penpotUtils.getPageByName(name); };

  // ---- board factory: approach C (flex container + all absolute + world coordinates) ----
  storage.mkAbsBoard = function (name, x, y, w, h, fill, radius) {
    const b = penpot.createBoard();
    b.name = name; b.x = x; b.y = y; b.resize(w, h);
    b.borderRadius = storage.CF ? storage.CF.radius(radius === undefined ? 0 : radius) : (radius || 0);
    b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    b.addFlexLayout();
    b.flex.dir = 'column';
    // Sizing vocabulary is fix|auto (NOT 'fixed'/'hug'): assigning 'fixed' throws under the v2 manifest and was silently
    // swallowed by try/catch, so the board only worked because `fix` is the default. Name it explicitly instead.
    try { b.horizontalSizing = 'fix'; b.verticalSizing = 'fix'; } catch (e) {}
    return b;
  };

  // ---- mount: appendChild first, then absolute, then write world coordinates ----
  // Every deliberate pin is recorded in NL's `_reg`, so NL.auditFlow's `absolute_child` only fires on pins the build
  // code did NOT make (crash leftovers, reflow escapes) — an absMount is by definition a declaration (measured gap:
  // without this, every absMount'd child of an engine frame was reported as absolute_child).
  storage.absMount = function (parent, child, worldX, worldY) {
    parent.appendChild(child);
    child.layoutChild.absolute = true;
    child.x = worldX; child.y = worldY;
    try { if (storage.NL && storage.NL._note) storage.NL._note(child, { declaredAbsolute: true }); } catch (e) {}
    return child;
  };

  // ---- text factory: CJK auto-selects Noto Sans SC (Penpot has no CSS font-stack fallback, applyToText applies to the whole paragraph) ----
  // 6th param fontRole: 'display' uses the display font (replace _display per DESIGN.md), others use the body font.
  // Iron rule: **this parameter must be present from the very start**. Adding a font option to mkText halfway through
  // would make the display font inconsistent between early and late batches, and this kind of inconsistency can't be caught by the geometry audit (only via auditPage().fonts histogram).
  const _noto = penpot.fonts.findByName('Noto Sans SC');
  // fonts come from the system contract (storage.T), not from hard-coded families — a re-skinned file must not keep
  // drawing in the default stack (same single-source rule as the palette: design-tokens §8.1)
  const _latin = penpot.fonts.findByName((T && T.bodyFont) || 'Nunito');
  const _display = penpot.fonts.findByName((T && T.displayFont) || 'Anton');
  const _variant = (f, w) => f.variants.find(v => v.fontWeight === String(w)) || f.variants.find(v => v.fontWeight === '400');
  /** The FAMILY the token ramp declares, for a (size, weight) pair. A JS fallback family is only legal when the file
      has no ramp at all: measured 2026-10-23 on the reference, every factory label was born Nunito while the file declared
      Urbanist, because `T.bodyFont` was never set and `mkText` trusted the fallback — then `TK.bindBoard` still bound
      `type.label-lg` by size/weight, so the wrong family passed the type gate. The token set is the single source of
      the family, exactly as it is for colour. */
  const _declaredFamily = function (size, weight, leading) {
    try {
      var tk = storage.TK;
      if (!tk || !tk.activeTokens || !tk.tokenValue) return null;
      var wantS = parseFloat(size) || null, wantW = parseFloat(weight) || null, wantL = parseFloat(leading) || null;
      if (!wantS) return null;
      var list = tk.activeTokens('typography').map(function (e) {
        var v = tk.tokenValue(e.token) || {};
        var f = Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily;
        return { family: f ? String(f) : null, size: parseFloat(v.fontSize) || 0,
                 weight: parseFloat(v.fontWeight) || 400, leading: parseFloat(v.lineHeight) || 0 };
      }).filter(function (x) { return x.family && x.size; });
      if (!list.length) return null;
      // exact step first; else the nearest declared size, then the nearest weight at that size. A 13px label is
      // off-ramp, but it still belongs to the design's family — it must not fall back to another typeface.
      var best = null, score = Infinity;
      list.forEach(function (x) {
        var s = Math.abs(x.size - wantS) * 10 + Math.abs(x.weight - (wantW || 400)) / 100
              + (wantL && x.leading ? Math.abs(x.leading - wantL) : 0);
        if (x.size === wantS && wantW && x.weight === wantW) s -= 1000;
        if (s < score) { score = s; best = x; }
      });
      return best ? best.family : null;
    } catch (e) { return null; }
  };
  storage.mkText = function (str, x, y, size, color, weight, fontRole) {
    // `penpot.createText('')` returns null in 2.17 (measured 2026-10-20), so an empty label crashed on the very next
    // line with "Cannot set properties of null (setting 'x')" — half-way through a factory, which then left an orphan
    // host on the board. No text is the honest reading of an empty string.
    if (str === null || str === undefined || String(str) === '') return null;
    const t = penpot.createText(str);
    t.x = x; t.y = y;
    const cjk = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(str);
    // CJK first: display fonts usually have no CJK glyphs, Chinese always falls back to Noto
    let lh0 = null;
    try { lh0 = parseFloat(t.lineHeight); if (isNaN(lh0)) lh0 = null; } catch (e) {}
    const explicit = fontRole === 'display' ? ((T && T.displayFont) || null) : ((T && T.bodyFont) || null);
    const declared = explicit ? null : _declaredFamily(size, weight || 400, lh0);
    const famName = cjk ? ((T && T.cjkFont) || 'Noto Sans SC')
      : (explicit || declared || (fontRole === 'display' ? 'Anton' : 'Nunito'));
    const font = cjk ? _noto : (penpot.fonts.findByName(famName) || (fontRole === 'display' ? _display : _latin));
    // §3.2 enforcement at birth: a size the declared type ramp does not contain is snapped onto the nearest step of
    // the SAME family before the font variant is applied, so the drawn shape can never hold an undeclared step.
    // (audit_design `type_off_ramp` catches the same thing after the fact; TK.bindBoard then turns the snapped values
    // into a real token binding — the batch is what binds, this is what makes the batch a no-op.)
    const st = storage.mkText._stat = storage.mkText._stat || { texts: 0, snapped: 0, drift: {} };
    let step = null;
    if (size && storage.TK && storage.TK.snapType) {
      try { step = storage.TK.snapType(famName, size, weight || 400, lh0); } catch (e) { step = null; }
    }
    const useWeight = step && step.weight ? step.weight : (weight || 400);
    if (step && step.size !== null && (step.size !== parseFloat(size) || step.weight !== (weight || 400))) {
      st.snapped++;
      const k = famName + ' ' + size + '/' + (weight || 400) + ' → ' + step.name;
      st.drift[k] = (st.drift[k] || 0) + 1;
    }
    if (step) st.texts++;
    if (font) { try { font.applyToText(t, _variant(font, useWeight)); } catch (e) {} }
    const fs = step && step.size !== null ? step.size : size;
    if (fs) { try { t.fontSize = String(fs); } catch (e) {} }
    if (step) {
      // leading/tracking come from the token, never from the call: a ramp step defines the whole vertical rhythm.
      if (step.leading !== null) { try { t.lineHeight = String(step.leading); } catch (e) {} }
      if (step.tracking !== null) { try { t.letterSpacing = String(step.tracking); } catch (e) {} }
    }
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
    if (!t) return null;
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
    r.borderRadius = storage.CF ? storage.CF.radius(radius === undefined ? 0 : radius) : (radius || 0);
    r.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    if (stroke) {
      // strokeAlignment is a member of the STROKE object, not of the shape: `r.strokeAlignment = 'inner'` reads back
      // undefined and changes nothing (measured 2026-10-20), so the old try/catch line was dead code.
      r.strokes = [{ strokeColor: stroke, strokeOpacity: 1, strokeWidth: strokeW || 1, strokeAlignment: 'inner', strokeStyle: 'solid' }];
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
