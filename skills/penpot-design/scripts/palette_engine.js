// palette_engine.js —— Penpot **library colors** executable engine (storage.LIB): the ref-binding re-skin channel.
// Usage: paste the whole file into execute_code and run once; literal functions go into storage for cross-call reuse.
// Basis: references/penpot-capabilities.md §7 (every claim below is a measured readback).
//
// Why this file exists next to token_engine.js: the build has **three** ways a shape can get its color, and they do
// not substitute for each other — measured, each with its own repaint trigger:
//
//   channel        bind with                    repaint trigger                who owns the value
//   ------------   ---------------------------  -----------------------------  --------------------------
//   library color  `shape.fills = [c.asFill()]` edit `c.color` (one call       LIB (this engine)
//                                                   repaints every bound shape)
//   token          `token.applyToShapes(...)`   `TK.activateTheme(group, x)`   TK (design-tokens.md)
//   raw hex        `fills = [{fillColor}]`      `penpot.replaceColor(shapes,   whoever wrote the hex
//                                               {color,opacity}, {color,opacity})
//
// Two sharp edges, both measured here:
//   * `penpot.library.local.createColor({name, color})` **ignores its arguments** in this build (six argument shapes
//     all produced a color named `#000000` with value `#000000`). The working recipe is: create, then **assign
//     `.name` and `.color`** — both assignments round-trip and the rename is what makes lookup by name possible.
//   * `penpot.replaceColor` only rewrites **raw** fills: a ref-bound fill came back untouched with an exact old-color
//     match. Raw fills also require the full `{color, opacity}` form to match (opacity omitted = silent no-op).

return (function () {
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const LIB = {};
  storage.LIB = LIB;
  const cat = () => penpot.library.local.colors;

  LIB.list = () => Array.from(cat());
  LIB.color = function (name) { return LIB.list().find((c) => c.name === name) || null; };

  /** Idempotent: creates (through the rename+set recipe) or updates the color's value.
      Updating `c.color` repaints every shape that was bound with asFill() — that is the whole point of the channel.
      NOTE the create call lives on the **library**: `penpot.library.local.createColor(...)`, NOT on
      `penpot.library.local.colors` (that collection has no createColor — measured `…colors.createColor is not a
      function`), and its argument is ignored anyway, so the rename+set below is the real contract. */
  LIB.put = function (name, hex) {
    if (!name || !hex) return { err: 'LIB.put(name, hex) needs both' };
    let c = LIB.color(name), action = 'kept';
    if (!c) {
      try { c = penpot.library.local.createColor({}); } catch (e) { return { err: 'createColor: ' + String(e && e.message || e) }; }
      action = 'created';
    }
    try { c.name = name; } catch (e) { return { err: 'rename: ' + String(e).slice(0, 100) }; }
    let same = false;
    try { same = String(c.color).toLowerCase() === String(hex).toLowerCase(); } catch (e) {}
    if (!same) { try { c.color = hex; action = action === 'created' ? 'created' : 'updated'; } catch (e) { return { err: 'set color: ' + String(e).slice(0, 100) }; } }
    return { name: name, action: action, color: c.color, id: c.id };
  };

  /** Batch seed from a palette spec: [{name, color}, …] or { name: color, … }. Returns the per-color log. */
  LIB.seed = function (spec) {
    const rows = Array.isArray(spec) ? spec
      : Object.keys(spec || {}).map((k) => ({ name: k, color: spec[k] }));
    const log = rows.map((r) => LIB.put(r.name, r.color || r.value || r.hex));
    return { colors: LIB.list().map((c) => c.name + '=' + c.color),
             failures: log.filter((l) => l.err),
             updated: log.filter((l) => l.action === 'updated').map((l) => l.name + '→' + l.color) };
  };

  /** Bind a shape's fill/stroke to a library color. Readback-verified: the ref fields are the proof of the binding. */
  LIB.bind = function (shape, fillName, strokeName) {
    const out = { shape: shape && shape.name, fill: null, stroke: null, errs: [] };
    if (fillName) {
      const c = LIB.color(fillName);
      if (!c) { out.errs.push('no library color named "' + fillName + '"'); }
      else { try { shape.fills = [c.asFill()]; out.fill = fillName; } catch (e) { out.errs.push('fills: ' + String(e).slice(0, 80)); } }
    }
    if (strokeName) {
      const c = LIB.color(strokeName);
      if (!c) { out.errs.push('no library color named "' + strokeName + '"'); }
      else { try { shape.strokes = [c.asStroke()]; out.stroke = strokeName; } catch (e) { out.errs.push('strokes: ' + String(e).slice(0, 80)); } }
    }
    // readback: a ref is the only evidence the binding took
    const f = (() => { try { return shape.fills && shape.fills[0]; } catch (e) { return null; } })();
    const s = (() => { try { return shape.strokes && shape.strokes[0]; } catch (e) { return null; } })();
    out.boundFill = !!(f && f.fillColorRefId);
    out.boundStroke = !!(s && s.strokeColorRefId);
    if (out.fill && !out.boundFill) out.errs.push('fill assigned but no fillColorRefId came back → the shape does not support a ref');
    if (out.stroke && !out.boundStroke) out.errs.push('stroke assigned but no strokeColorRefId came back');
    out.ok = out.errs.length === 0;
    return out;
  };
  LIB.fill = (shape, name) => LIB.bind(shape, name, null);
  LIB.stroke = (shape, name) => LIB.bind(shape, null, name);

  /** Every shape under a root (a board or the page root), for audits and batch paints. */
  LIB.flatten = function (root) {
    const out = [];
    const walk = (s) => { if (!s) return; out.push(s); Array.from(s.children || []).forEach(walk); };
    Array.isArray(root) ? root.forEach(walk) : walk(root);
    return out;
  };

  /**
   * LIB.audit(rootOrShapes) → what `penpot.shapesColors` sees (capabilities §7/§10):
   *   rows = [{color, refId, shapes:[…]}] where `refId` is present for library-bound fills and **absent for raw hex**.
   * `shapesColors` **requires an array** (a bare shape throws `Value not valid: [object ShapeProxy].
   * Code: :shapesColors-shapes`), which is why everything funnels through LIB.flatten.
   */
  LIB.audit = function (rootOrShapes) {
    const shapes = Array.isArray(rootOrShapes) ? rootOrShapes : LIB.flatten(rootOrShapes);
    let rows = null, err = null;
    try { rows = penpot.shapesColors(shapes); } catch (e) { err = String(e).slice(0, 160); }
    if (err) return { err: err, shapes: shapes.length };
    // shapesInfo entries are {property, index, shapeId} — **no name**, so resolve ids against the shapes we were given.
    // Channel classification needs the shapes anyway: a **token-bound** fill has no fillColorRefId either, so without
    // consulting `shape.tokens` it would be filed as raw hex (three channels, capabilities §6/§7).
    const byId = {}, tokenBound = {};
    shapes.forEach((s) => {
      try { byId[String(s.id)] = s.name; } catch (e) {}
      try { const tk = s.tokens; if (tk && Object.keys(tk).length) tokenBound[String(s.id)] = Object.keys(tk).join(','); } catch (e) {}
    });
    const out = rows.map((r) => {
      const ids = (r.shapesInfo || []).map((i) => String(i.shapeId));
      const tk = ids.map((id) => tokenBound[id]).filter(Boolean);
      return {
        color: r.color,
        refId: r.refId || null,
        refFile: r.refFile || null,
        channel: r.refId ? 'library' : (tk.length ? 'token' : 'raw'),
        tokenKeys: Array.from(new Set(tk)).join(';') || null,
        uses: (r.shapesInfo || []).length,
        props: Array.from(new Set((r.shapesInfo || []).map((i) => i.property))).join(','),
        shapes: ids.slice(0, 6).map((id) => byId[id] || String(id).slice(-6))
      };
    }).sort((a, b) => b.uses - a.uses);
    return { shapes: shapes.length, colors: out.length,
             libraryBound: out.filter((r) => r.channel === 'library').length,
             tokenBound: out.filter((r) => r.channel === 'token').length,
             rawHex: out.filter((r) => r.channel === 'raw').length,
             rows: out };
  };

  /**
   * LIB.replace(shapes, oldHex, newHex) → the **raw-hex** channel batch swap (measured):
   *   * both sides are sent as `{color, opacity}` — the opacity field is **required for the old color to match**
   *     (omitting it returned successfully and changed nothing);
   *   * a fill that carries `fillColorRefId` is **left alone** — that is correct: the library color owns it (edit
   *     `c.color` instead); returning "did nothing" here is the signal that the shape is ref-bound;
   *   * the method returns `null`, so success is read back from the fills, not from the return value.
   */
  LIB.replace = async function (shapes, oldHex, newHex, opacity) {
    const arr = (Array.isArray(shapes) ? shapes : LIB.flatten(shapes)).filter(Boolean);
    const op = opacity === undefined ? 1 : opacity;
    const before = arr.map((s) => { try { return s.fills[0].fillColor; } catch (e) { return null; } });
    let err = null;
    try { penpot.replaceColor(arr, { color: oldHex, opacity: op }, { color: newHex, opacity: op }); }
    catch (e) { err = String(e).slice(0, 160); }
    await nap(500);
    const after = arr.map((s) => { try { return s.fills[0].fillColor; } catch (e) { return null; } });
    const changed = arr.filter((s, i) => String(before[i]).toLowerCase() !== String(after[i]).toLowerCase());
    return { err: err, shapes: arr.length, changed: changed.length,
             sample: changed.slice(0, 5).map((s, i) => s.name),
             note: err ? null : (changed.length ? null : 'nothing changed → the old color did not match, or every fill is ref-bound (edit the library color instead)') };
  };

  /** Remove a color (while it exists — no head-shape trap here, colors are plain records). */
  LIB.remove = function (name) {
    const c = LIB.color(name);
    if (!c) return { err: 'no color named "' + name + '"' };
    try { c.remove(); return { ok: true, name: name }; }
    catch (e) { return { err: String(e).slice(0, 100) }; }
  };

  return { seeded: 'LIB', fns: ['LIB.list', 'LIB.color', 'LIB.put', 'LIB.seed', 'LIB.bind', 'LIB.fill', 'LIB.stroke',
                                'LIB.flatten', 'LIB.audit', 'LIB.replace', 'LIB.remove'],
           note: 'library channel: createColor ignores its args → rename+set; asFill/asStroke carry fillColorRefId/strokeColorRefId; replaceColor is raw-hex only and needs {color,opacity}' };
})();
