// token_engine.js —— Penpot Design Tokens executable engine (build set / apply / health-check)
// Usage: paste the whole file into execute_code and run once (literal functions go into storage for cross-call reuse).
// Basis: references/design-tokens.md (all conclusions are local tests, including 5 iron rules and 6 application pitfalls).
//
// Why it's needed: storage.T in seed_storage.js is only a JS-side color mirror, **it does NOT create any Penpot token**.
// Real library-token entry goes through this engine.
//
// The three steps in order (must not be reversed):
//   TK.seed(spec)              build set + record token (auto active:true when no theme)
//   await TK.apply(...)       apply (with readback verification, throws on silent failure)
//   TK.audit() / TK.assert()  health-check (inactive / broken reference / same-group multi-activation)
//
// theme (optional): TK.ensureTheme(group, name, [setNames]) to build, TK.activateTheme(group, name) to switch.
// ⚠️ When themes exist, **do not** directly set.toggleActive() — directly toggling clears all themes' activation state;
//    and then set.active is a derived value of "the union of active themes", being inactive is a normal state (see references/design-tokens.md §5).

return (function () {
  const cat = () => penpot.library.local.tokens;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));

  const TK = {};
  storage.TK = TK;

  // ---------- query ----------
  TK.set = (name) => Array.from(cat().sets).find((s) => s.name === name) || null;

  // Find token by name: **search from the last set forward for the first "active" set defining it**, consistent with Penpot's resolution priority
  TK.find = function (name) {
    const sets = Array.from(cat().sets);
    for (let i = sets.length - 1; i >= 0; i--) {
      if (!sets[i].active) continue;
      const t = Array.from(sets[i].tokens).find((x) => x.name === name);
      if (t) return t;
    }
    return null;
  };

  // ---------- build set ----------
  // Iron rule 1: addSet defaults to active:false; inactive = the binding is recorded but the value doesn't take effect (silent failure).
  // ⚠️ When themes exist you must **not** directly toggle the set: directly toggling clears all themes' activation state (tested).
  //    So force defaults to "directly activate only when there's no theme"; when there's a theme, hand it to the theme to manage.
  TK.ensureSet = function (name, active, force) {
    let s = TK.set(name);
    if (!s) s = cat().addSet({ name: name, active: active === false ? false : true });
    const want = active === false ? false : true;
    const hasThemes = Array.from(cat().themes).length > 0;
    const mayToggle = force === undefined ? !hasThemes : !!force;
    if (s.active !== want && mayToggle) { try { s.toggleActive(); } catch (e) {} }
    return s;
  };

  // ---------- Themes (a preset of "which sets are on"; itself stores no tokens) ----------
  TK.theme = function (group, name) {
    return Array.from(cat().themes).find((t) => t.group === group && t.name === name) || null;
  };

  // Build theme (idempotent) and declare its member sets; does not activate
  TK.ensureTheme = function (group, name, setNames) {
    let t = TK.theme(group, name);
    if (!t) t = cat().addTheme({ group: group, name: name });
    (setNames || []).forEach(function (n) {
      const s = TK.set(n);
      if (s) { try { t.addSet(s); } catch (e) {} }
    });
    return t;
  };

  // Activate/deactivate theme. Same-group mutual exclusion is handled automatically by Penpot (activating one stops the other in the group);
  // deactivating a theme also deactivates its set, but if that set is also contained by another **active** theme, it stays active.
  TK.activateTheme = function (group, name, on) {
    const t = TK.theme(group, name);
    if (!t) return { err: 'theme does not exist: ' + group + '/' + name };
    const want = on === false ? false : true;
    if (t.active !== want) { try { t.toggleActive(); } catch (e) { return { err: String(e).slice(0, 120) }; } }
    return { theme: group + '/' + name, active: t.active, activeSetsNow: TK.activeSets() };
  };

  // Currently actually-activated set names (= union of all active themes; with no theme it's each set's own active)
  TK.activeSets = function () {
    return Array.from(cat().sets).filter((s) => s.active).map((s) => s.name);
  };

  // ---------- record token (idempotent: skip same value, rebuild different value) ----------
  TK.put = function (setName, type, name, value) {
    const s = TK.ensureSet(setName);
    const old = Array.from(s.tokens).find((t) => t.name === name);
    if (old) {
      let same = false;
      try { same = JSON.stringify(old.value) === JSON.stringify(value); } catch (e) {}
      if (same) return { name: name, type: old.type, action: 'kept' };
      try { old.remove(); } catch (e) { return { name: name, err: 'remove failed: ' + String(e).slice(0, 80) }; }
    }
    try {
      const t = s.addToken({ type: type, name: name, value: value });
      TK._ci = null; TK._ti = null; TK._si = null; TK._declared = null;
      return { name: name, type: t.type, action: old ? 'replaced' : 'added' };
    } catch (e) {
      return { name: name, err: String(e).slice(0, 140) };
    }
  };

  // ---------- batch seeding ----------
  // spec = [{ set:'pix · Core', active:true, tokens:[ ['color','color.primary','#FF471D'], ... ] }]
  // Note: split sets by "whether to activate together", **not by type** — one set can hold all 17 kinds (see references/design-tokens.md §1.1)
  // Also accepts the { set, tokens: { name: {type, value} } } writing (a bit looser)
  TK.seed = function (spec) {
    const log = [];
    (spec || []).forEach((grp) => {
      const set = TK.ensureSet(grp.set, grp.active);
      const list = Array.isArray(grp.tokens)
        ? grp.tokens.map((row) => ({ type: row[0], name: row[1], value: row[2] }))
        : Object.keys(grp.tokens || {}).map((k) => ({ name: k, type: grp.tokens[k].type, value: grp.tokens[k].value }));
      list.forEach((t) => log.push(Object.assign({ set: set.name }, TK.put(grp.set, t.type, t.name, t.value))));
    });
    return { sets: Array.from(cat().sets).map((s) => s.name + (s.active ? '' : '(INACTIVE!)')), log: log };
  };

  // ---------- apply (with readback verification) ----------
  // Iron rules 2/3: omit properties to use the default property; 'all' is unavailable; inapplicable = silent success, so you must read back.
  TK.apply = async function (tokenName, shapes, props) {
    const arr = Array.isArray(shapes) ? shapes : [shapes];
    const t = TK.find(tokenName);
    if (!t) return { ok: false, err: 'token does not exist or its set is inactive: ' + tokenName };
    let apiOk = true, apiErr = null;
    try { props && props.length ? t.applyToShapes(arr, props) : t.applyToShapes(arr); }
    catch (e) { apiOk = false; apiErr = String(e).slice(0, 160); }
    await nap(500);
    const report = arr.map((sh) => {
      let map = {};
      try { map = sh.tokens || {}; } catch (e) {}
      const keys = Object.keys(map).filter((k) => map[k] === tokenName);
      return { shape: sh.name, bound: keys.length > 0, keys: keys };
    });
    const allBound = report.every((r) => r.bound);
    return {
      ok: apiOk && allBound,
      token: tokenName,
      type: t.type,
      apiOk: apiOk, apiErr: apiErr,
      note: (apiOk && !allBound) ? 'API reported no error but recorded no binding → shape does not support this property, or the set is inactive' : null,
      shapes: report
    };
  };

  // ---------- unbind ----------
  // No removeToken API: write the property directly. **Detail: writing the same value does NOT unbind, you must write a different value first**.
  TK.unbindFill = async function (shape) {
    const keep = (() => { try { return shape.fills[0].fillColor; } catch (e) { return null; } })();
    const op = (() => { try { return shape.fills[0].fillOpacity; } catch (e) { return 1; } })();
    shape.fills = [{ fillColor: '#000001', fillOpacity: op == null ? 1 : op }];
    await nap(400);
    shape.fills = [{ fillColor: keep, fillOpacity: op == null ? 1 : op }];
    await nap(400);
    return { shape: shape.name, fill: keep, tokens: JSON.stringify(shape.tokens) };
  };

  TK.unbindStroke = async function (shape) {
    const st = (() => { try { return shape.strokes[0]; } catch (e) { return null; } })();
    if (!st) return { shape: shape.name, note: 'no stroke' };
    const keep = { strokeColor: st.strokeColor, strokeOpacity: st.strokeOpacity, strokeWidth: st.strokeWidth, strokeAlignment: st.strokeAlignment };
    shape.strokes = [Object.assign({}, keep, { strokeColor: '#000001' })];
    await nap(400);
    shape.strokes = [keep];
    await nap(400);
    return { shape: shape.name, tokens: JSON.stringify(shape.tokens) };
  };

  // ---------- paint snapshot (theme-switch acceptance, capabilities §6) ----------
  // Bindings and paint are read at different moments: a shape can keep `tokens.fill` while showing a stale color,
  // because adding a later active set changes the token's resolvedValueString **without** re-skinning bound shapes —
  // only `activateTheme` does that. So acceptance reads the *paint*: snapshot → switch → settle → TK.changed().
  TK.paint = function (shapes) {
    const arr = Array.isArray(shapes) ? shapes : [];
    return arr.map((s, i) => {
      let f = null, st = null;
      try { f = s.fills && s.fills[0] ? { color: s.fills[0].fillColor, opacity: s.fills[0].fillOpacity, ref: s.fills[0].fillColorRefId || null } : null; } catch (e) {}
      try { st = s.strokes && s.strokes[0] ? { color: s.strokes[0].strokeColor, opacity: s.strokes[0].strokeOpacity, ref: s.strokes[0].strokeColorRefId || null } : null; } catch (e) {}
      return { key: (s.name || 'shape') + '#' + i, fill: f, stroke: st };
    });
  };
  TK.changed = function (before, shapes) {
    const now = TK.paint(shapes);
    const out = [];
    now.forEach((n, i) => {
      const b = before[i];
      if (!b) return;
      const fc = b.fill && n.fill && String(b.fill.color).toLowerCase() !== String(n.fill.color).toLowerCase();
      const sc = b.stroke && n.stroke && String(b.stroke.color).toLowerCase() !== String(n.stroke.color).toLowerCase();
      if (fc || sc) out.push({ key: n.key, fill: [b.fill && b.fill.color, n.fill && n.fill.color], stroke: [b.stroke && b.stroke.color, n.stroke && n.stroke.color] });
    });
    return { changed: out.length, rows: out };
  };

  // ---------- health-check ----------
  // The judgment logic depends on whether a theme is used:
  //   No theme: an inactive set = a fault (token binding would "succeed but not take effect").
  //   With theme: whether a set is active is **derived** (= union of active themes), being inactive is a normal state,
  //               and the pass criterion becomes "no same-group multi-activation + all tokens in active sets resolvable".
  TK.audit = function () {
    const sets = Array.from(cat().sets);
    const themes = Array.from(cat().themes);
    const hasThemes = themes.length > 0;
    const inactiveSets = [], unresolved = [], dupNames = {};
    const detail = sets.map((s) => {
      const toks = Array.from(s.tokens);
      if (!s.active) inactiveSets.push(s.name);
      toks.forEach((t) => {
        // A token in an inactive set resolving empty is **by design**, not a broken link; only health-check active sets
        if (s.active && !t.resolvedValueString) unresolved.push(s.name + ' / ' + t.name + ' (' + t.type + ')');
        dupNames[t.name] = dupNames[t.name] || [];
        dupNames[t.name].push(s.name);
      });
      return { name: s.name, active: s.active, tokens: toks.length, types: toks.reduce((a, t) => { a[t.type] = (a[t.type] || 0) + 1; return a; }, {}) };
    });
    const conflicts = Object.keys(dupNames).filter((k) => dupNames[k].length > 1).map((k) => k + ' ← ' + dupNames[k].join(', '));
    // theme integrity: no multiple activations within the same group
    const byGroup = {};
    themes.forEach((t) => { if (t.active) { byGroup[t.group] = byGroup[t.group] || []; byGroup[t.group].push(t.name); } });
    const groupViolations = Object.keys(byGroup).filter((g) => byGroup[g].length > 1).map((g) => g + ': ' + byGroup[g].join(', '));
    const activeThemes = themes.filter((t) => t.active).map((t) => t.group + '/' + t.name);
    const activeSetsNow = TK.activeSets();

    const problems = [];
    if (!hasThemes) {
      if (inactiveSets.length) problems.push('inactive set(s) exist: tokens bound in them would "succeed but not take effect"');
    } else {
      if (groupViolations.length) problems.push('multiple active themes within the same group');
      if (!activeThemes.length) problems.push('themes defined but none currently active → all sets are off');
    }
    if (unresolved.length) problems.push('unresolvable token within an active set: usually a broken reference chain');

    return {
      ok: problems.length === 0,
      mode: hasThemes ? 'theme-driven' : 'manual',
      setOrder: sets.map((s) => s.name),
      sets: detail,
      inactiveSets: inactiveSets,
      activeSetsNow: activeSetsNow,
      unresolved: unresolved,
      sameNameAcrossSets: conflicts,
      themes: themes.map((t) => ({ group: t.group, name: t.name, active: t.active, declares: Array.from(t.activeSets).map((x) => x.name) })),
      activeThemes: activeThemes,
      themeGroupViolations: groupViolations,
      problems: problems,
      hint: problems.length ? problems.join('; ') : (hasThemes ? 'theme config OK, currently active sets: ' + activeSetsNow.join(', ') : 'all tokens resolvable')
    };
  };

  // Convenience: one-line health-check that throws (used as a gate)
  TK.assert = function () {
    const a = TK.audit();
    if (!a.ok) throw new Error('token health check failed: ' + JSON.stringify(a.problems));
    return a;
  };

  // ---------- indexes: the "no raw hex, no ad-hoc type" contract ----------
  // storage.T / CF.P (the JS palette the engines paint with) and the Penpot token set must carry the same values.
  // These indexes are the read side of that contract: hex → color token, type step → typography token.
  // A token's *name* is the semantic claim, so the same hex may belong to several tokens (#161616 is `primary`,
  // `inverse` and `text-bright`): copy paints bind to the text/on-* candidate, surface paints to the rest.
  TK.normHex = function (v) {
    if (!v) return null;
    const s = String(v).trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(s) ? s : null;
  };
  TK.isCopyName = function (n) { return /^color\.(text-|on-)/.test(String(n)); };

  TK.activeTokens = function (type) {
    const out = [];
    Array.from(cat().sets).filter((s) => s.active).forEach((s) => {
      Array.from(s.tokens).forEach((t) => { if (!type || t.type === type) out.push({ set: s.name, name: t.name, token: t }); });
    });
    return out;
  };

  TK.colorIndex = function (force) {
    if (TK._ci && !force) return TK._ci;
    const byHex = {};
    const list = TK.activeTokens('color');
    list.forEach((e) => {
      let v = null; try { v = e.token.value; } catch (err) {}
      const hex = TK.normHex(typeof v === 'string' ? v : (v && v.color));
      if (!hex) return;
      const r = byHex[hex] || (byHex[hex] = { all: [], copy: null, surface: null });
      r.all.push(e.name);
      if (TK.isCopyName(e.name)) { if (!r.copy) r.copy = e.name; }
      else if (!r.surface) r.surface = e.name;
    });
    Object.keys(byHex).forEach((h) => { const r = byHex[h]; if (!r.copy) r.copy = r.surface; if (!r.surface) r.surface = r.copy; });
    const dupes = Object.keys(byHex).filter((h) => byHex[h].all.length > 1);
    TK._ci = { byHex: byHex, tokens: list.length, hexes: Object.keys(byHex).length,
               dupes: dupes.map((h) => h + ' ← ' + byHex[h].all.join(', ')) };
    return TK._ci;
  };

  // The nearest declared colour for a literal that misses the index. Used by `CF`'s palette chokepoint to repair a
  // hand-typed hex *before* it lands on the canvas: `d` is the largest single-channel distance, and only a near miss
  // (default ≤ 12/255) is snapped — a genuinely different colour is reported instead, because silently re-drawing a
  // data-visualisation hue as the nearest brand tone would destroy the content the gate already exempts.
  TK.nearestHex = function (hex, maxD) {
    const h = TK.normHex(hex);
    const ci = TK.colorIndex();
    if (!h || !ci.hexes) return null;
    const rgb = (x) => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
    const a = rgb(h);
    let best = null, bd = Infinity;
    Object.keys(ci.byHex).forEach(function (k) {
      const b = rgb(k);
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      if (d < bd) { bd = d; best = k; }
    });
    const rec = best && ci.byHex[best];
    return { hex: best, d: bd, name: rec ? (rec.surface || rec.all[0]) : null,
             near: best !== null && bd <= (maxD === undefined ? 12 : maxD) };
  };

  // A typography token's value: `value` on the record, `resolvedValue` as the fallback (measured: the composite
  // resolves through a one-element array whose keys are the pluralized names).
  TK.tokenValue = function (t) {
    let v = null;
    try { v = t.value; } catch (e) {}
    if (v && v.fontSize) return v;
    try { const rv = t.resolvedValue; const c = Array.isArray(rv) ? rv[0] : rv; if (c && (c.fontSize || c['font-size'])) v = c.fontSize ? c : { fontSize: c['font-size'], fontWeight: c['font-weight'], lineHeight: c['line-height'], fontFamily: c['font-family'], letterSpacing: c['letter-spacing'] }; } catch (e) {}
    return v || {};
  };
  const num = (x) => { const n = parseFloat(x); return isNaN(n) ? null : n; };
  const fam = (f) => Array.isArray(f) ? String(f[0] || '').toLowerCase() : String(f || '').toLowerCase();
  TK.typeKey = function (family, size, weight, leading) {
    return [fam(family), num(size), num(weight), num(leading)].join('|');
  };
  TK.shapeTypeKey = function (sh) {
    let f, s, w, l;
    try { f = sh.fontFamily; s = sh.fontSize; w = sh.fontWeight; l = sh.lineHeight; } catch (e) {}
    return TK.typeKey(f, s, w, l);
  };

  TK.typeIndex = function (force) {
    if (TK._ti && !force) return TK._ti;
    const exact = {}, step = {}, ramp = [];
    TK.activeTokens('typography').forEach((e) => {
      const v = TK.tokenValue(e.token);
      const k = TK.typeKey(v.fontFamily, v.fontSize, v.fontWeight, v.lineHeight);
      if (!exact[k]) exact[k] = e.name;
      const sk = num(v.fontSize) + '|' + num(v.fontWeight);
      (step[sk] = step[sk] || []).push({ name: e.name, family: fam(v.fontFamily), leading: num(v.lineHeight) });
      ramp.push({ name: e.name, family: fam(v.fontFamily), size: num(v.fontSize), weight: num(v.fontWeight),
                  leading: num(v.lineHeight), tracking: num(v.letterSpacing) });
    });
    TK._ti = { exact: exact, step: step, ramp: ramp, count: ramp.length };
    return TK._ti;
  };

  // The declared step for a drawn (size, weight) pair. A size/weight can legitimately exist twice in a ramp (22/600 is
  // both `type.h6` at 1.2 and `type.button` at 1.5), so the tie-break is: same family first, then the nearest leading.
  // The winner's own values are what the binding writes, so the ramp — not the drawn shape — stays authoritative.
  TK.stepFor = function (size, weight, family, leading) {
    const list = TK.typeIndex().step[num(size) + '|' + num(weight)];
    if (!list || !list.length) return null;
    const wantF = fam(family), wantL = num(leading);
    let best = null, score = Infinity;
    list.forEach(function (c) {
      let s = (c.family === wantF ? 0 : 10) + (wantL === null || c.leading === null ? 0 : Math.abs(c.leading - wantL));
      if (s < score) { score = s; best = c.name; }
    });
    return best;
  };

  // ---------- creation-side enforcement ----------
  // `TK.stepFor` is the after-the-fact repair (bindBoard retunes what is already on the canvas). `snapType` is the
  // prevention: `storage.mkText` asks it before writing a size, so a text layer can never be born with a step the
  // token set does not name. Same-family only — the family is the builder's visible choice, and silently swapping
  // body copy into the display face is not what "snap onto the ramp" should mean.
  TK.snapType = function (family, size, weight, leading) {
    const ti = TK.typeIndex();
    if (!ti.count) return null;
    const f = fam(family), s = num(size), w = num(weight), l = num(leading);
    const pick = function (entry) {
      const v = entry && entry.r ? entry.r : entry;
      return { name: v.name, family: v.family, size: v.size, weight: v.weight, leading: v.leading,
               tracking: v.tracking, snapped: v.size !== s || v.weight !== w };
    };
    const exact = ti.exact[TK.typeKey(f, s, w, l)];
    if (exact) {
      const hit = ti.ramp.filter(function (r) { return r.name === exact; })[0];
      return hit ? { name: hit.name, family: hit.family, size: hit.size, weight: hit.weight,
                     leading: hit.leading, tracking: hit.tracking, snapped: false } : null;
    }
    const same = ti.ramp.filter(function (r) { return r.family === f; });
    const pool = same.length ? same : ti.ramp;
    let best = null, score = Infinity;
    pool.forEach(function (r) {
      const ds = r.size === null || s === null ? 0 : Math.abs(r.size - s);
      const dw = r.weight === null || w === null ? 0 : Math.abs(r.weight - w) / 100;
      const dl = r.leading === null || l === null ? 0 : Math.abs(r.leading - l) / 4;
      const sc = ds + dw + dl;
      if (sc < score) { score = sc; best = r; }
    });
    return best ? pick(best) : null;
  };

  // ---------- the space scale as an index (point: gaps and padding are tokens too) ----------
  // The props a `spacing` token can be bound to on a flow/grid container. Named explicitly because `spacing` has no
  // default property (design-tokens §6). Vertical/horizontal shorthand is NOT listed: Penpot stores the four sides,
  // and writing a shorthand through a token binding reads back on the wrong key.
  const LAYOUT_PROPS = ['rowGap', 'columnGap', 'topPadding', 'rightPadding', 'bottomPadding', 'leftPadding'];
  TK.LAYOUT_PROPS = LAYOUT_PROPS;
  TK.spaceIndex = function (force) {
    if (TK._si && !force) return TK._si;
    const byVal = {};
    TK.activeTokens('spacing').forEach((e) => {
      let v = null; try { v = e.token.value; } catch (err) {}
      const n = num(typeof v === 'string' ? v : (v && v.value));
      if (n !== null && byVal[n] === undefined) byVal[n] = e.name;
    });
    TK._si = { byVal: byVal, count: Object.keys(byVal).length };
    return TK._si;
  };
  /** The repair twin of `snapType`: pull a typed value onto the declared scale (a builder that wrote 6 has to be
      retuned by the rule the factory follows). Nearest wins, ties go up because a scale is a rhythm, not a ceiling. */
  TK.snapSpace = function (v) {
    const byVal = TK.spaceIndex().byVal;
    const vals = Object.keys(byVal).map(Number).sort((a, b) => a - b);
    if (!vals.length) return null;
    let best = vals[0];
    vals.forEach((x) => { if (Math.abs(x - v) < Math.abs(best - v) || (Math.abs(x - v) === Math.abs(best - v) && x > best)) best = x; });
    return { value: best, name: byVal[best], delta: best - v };
  };
  // Only the two gap props take a token binding. Measured 2026-10-20: `applyToShapes(shapes, ['topPadding'])` is
  // refused by the server (`should be a set of strings` — the spacing token's property enum has no padding), so
  // padding is retuned onto the scale and reported, never bound.
  const GAP_PROPS = ['rowGap', 'columnGap'];
  TK.GAP_PROPS = GAP_PROPS;

  // The four corner props a `borderRadius` token owns. Measured 2026-10-21: `applyToShapes(shapes, CORNER_PROPS)` binds
  // ALL FOUR at once, writes `shape.tokens.borderRadiusTopLeft…BottomLeft`, and REWRITES the shape's own value to the
  // token's (r20 → 9999, r12 → 26) — so binding an off-ladder corner is NOT a visual no-op, it is the retune. Passing a
  // single corner leaves a partial map, which the gate still indicts on the three the call did not write.
  const CORNER_PROPS = ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'];
  TK.CORNER_PROPS = CORNER_PROPS;

  /** The declared corner ladder, by rounded value: { byVal, byName, steps(asc), count }. */
  TK.radiusIndex = function (force) {
    if (TK._ri && !force) return TK._ri;
    const byVal = {}, byName = {};
    TK.activeTokens('borderRadius').forEach((e) => {
      let v = null; try { v = e.token.value; } catch (err) {}
      const n = num(typeof v === 'string' ? v : (v && v.value));
      if (n === null) return;
      if (byVal[Math.round(n)] === undefined) byVal[Math.round(n)] = e.name;
      byName[e.name] = n;
    });
    const steps = Object.keys(byVal).map(Number).sort((a, b) => a - b);
    TK._ri = { byVal: byVal, byName: byName, steps: steps, count: steps.length };
    return TK._ri;
  };

  /** Which token a DRAWN corner belongs to — the decision the retro pass and `TK.bindBoard` share, and the only place
      that may pick a step for a value that has none. Three cases, in order:
        already declared        → bind as drawn;
        `min(w,h)/2` or larger  → it IS a pill. The old factories derived `h/2` per size and minted 722 one-off numbers,
                                  and DESIGN.md §Shapes says every control is a pill at any height, so the token is
                                  `radius.full` (9999 renders clamped: measured a 320×32 and a 320×8 both export as
                                  clean pills) — NOT the nearest small step, which would square off a switch;
        anything else           → the nearest declared step, ties going up (the rule `snapSpace` follows).
      `null` = the shape has no corner to bind (0 is the absence of a decision), or the file declares no radius tokens,
      in which case a caller must refuse rather than invent a ladder. */
  TK.radiusFor = function (value, side) {
    const ri = TK.radiusIndex();
    if (!ri.count) return null;
    const v = Math.round(Number(value) || 0);
    if (!v) return null;
    if (ri.byVal[v]) return { name: ri.byVal[v], value: v, exact: true };
    if (side && v >= Math.round(side / 2) - 1) {
      const full = ri.byName['radius.full'] !== undefined ? Math.round(ri.byName['radius.full']) : ri.steps[ri.steps.length - 1];
      return { name: ri.byVal[full], value: full, pill: true, from: v };
    }
    let best = ri.steps[0];
    ri.steps.forEach((x) => { if (Math.abs(x - v) < Math.abs(best - v) || (Math.abs(x - v) === Math.abs(best - v) && x > best)) best = x; });
    return { name: ri.byVal[best], value: best, snapped: true, from: v };
  };

  /** The four corners of a shape as numbers (a symmetric shape stores a scalar; an asymmetric one stores the map). */
  TK.cornersOf = function (sh) {
    let b = null; try { b = sh.borderRadius; } catch (e) { return null; }
    if (b === null || b === undefined) return null;
    if (typeof b === 'number') return [b, b, b, b];
    if (typeof b === 'object') return CORNER_PROPS.map((p) => Number(b[p]) || 0);
    return null;
  };

  // ---------- the read side for spec-sheet builders ----------
  /** Every value a Foundations / Color board may draw, read out of the LIVE token records in one pass.
      This exists so documentation boards never need `storage.T` or `CF.P`: both are JS mirrors, and a mirror that
      drifts paints a hex no token names (`paint_off_palette`) or — measured — silently falls back to a default.
      A projector reads this and REFUSES a missing kind instead of inventing a value. */
  TK.declared = function (force) {
    if (TK._declared && !force) return TK._declared;
    const nv = (x) => { const n = parseFloat(x); return isNaN(n) ? null : n; };
    const raw = (t) => { try { return t.value; } catch (e) { return null; } };
    const out = { sets: TK.activeSets(), colors: [], types: [], spaces: [], radii: [], dims: [], shadows: [] };
    TK.activeTokens('color').forEach((e) => {
      const v = raw(e.token);
      const hex = TK.normHex(typeof v === 'string' ? v : (v && v.color));
      if (hex) out.colors.push({ name: e.name, hex: hex, copy: TK.isCopyName(e.name), set: e.set });
    });
    out.types = TK.typeIndex().ramp.slice();
    const si = TK.spaceIndex();
    Object.keys(si.byVal).map(Number).sort((a, b) => a - b).forEach((n) => out.spaces.push({ value: n, name: si.byVal[n] }));
    TK.activeTokens('borderRadius').forEach((e) => {
      const n = nv(raw(e.token)); if (n !== null) out.radii.push({ name: e.name, value: n });
    });
    TK.activeTokens('dimension').forEach((e) => {
      const n = nv(raw(e.token)); if (n !== null) out.dims.push({ name: e.name, value: n });
    });
    TK.activeTokens('shadow').forEach((e) => {
      const v = raw(e.token); const s = Array.isArray(v) ? v[0] : (v && (v.shadow || v.value)) || v;
      if (s) out.shadows.push({ name: e.name, value: s });
    });
    out.radii.sort((a, b) => a.value - b.value);
    out.dims.sort((a, b) => a.value - b.value);
    out.counts = ['colors', 'types', 'spaces', 'radii', 'dims', 'shadows'].reduce((m, k) => (m[k] = out[k].length, m), {});
    out.missing = Object.keys(out.counts).filter((k) => !out.counts[k]);
    out.ok = out.missing.length === 0;
    // a hex claimed by several names (#161616 is primary, inverse and text-bright) — the board captions the FIRST
    // declaring name, so the label is stable across re-seeds rather than depending on record iteration order.
    out.hexOwner = {};
    out.colors.forEach((c) => { if (!out.hexOwner[c.hex]) out.hexOwner[c.hex] = c.name; });
    TK._declared = out;
    return out;
  };

  // ---------- subtree walk ----------
  TK.walk = function (node, fn, depth) {
    if (!node || (depth || 0) > 48) return 0;
    let n = 0;
    try { fn(node, depth || 0); n++; } catch (e) { return n; }
    let kids = [];
    try { kids = Array.from(node.children || []); } catch (e) {}
    for (let i = 0; i < kids.length; i++) n += TK.walk(kids[i], fn, (depth || 0) + 1);
    return n;
  };

  // ---------- bind what the engines already painted correctly ----------
  // Every fill/stroke whose hex IS a declared token color, and every text whose type step IS declared, gets bound.
  // Because the lookup is by the value actually in use, binding is a visual no-op — which is what makes it safe to
  // run on a board that is already gated. `dry` turns it into the audit read (findings only, no writes).
  // `retune` goes one step further: a text at a declared (size, weight) with a *different* leading is re-bound to
  // the declared step, i.e. the ramp wins over what was drawn. Off by default — it changes text height.
  TK.bindBoard = async function (board, o) {
    o = o || {};
    if (!board) return { err: 'bindBoard: no board' };
    // Phase timeline, pushed into the caller's array so a call that dies in the `execute_code` ceiling still says
    // which phase it died in (a 30s stall with no trace is a guess; with a trace it is one line of output).
    const tr = o.trace || null;
    let _tm = Date.now();
    const mark = function (s, n) { if (tr) { const now = Date.now(); tr.push(s + ' +' + (now - _tm) + 'ms' + (n === undefined ? '' : ' n=' + n)); _tm = now; } };
    const ci = TK.colorIndex(), ti = TK.typeIndex(), si = TK.spaceIndex();
    mark('indexes');
    const buckets = {}, order = [];
    const push = function (tokenName, prop, sh) {
      const k = tokenName + '::' + prop;
      let b = buckets[k];
      if (!b) { b = buckets[k] = { token: tokenName, prop: prop, shapes: [] }; order.push(k); }
      b.shapes.push(sh);
    };
    const miss = { color: {}, typography: {}, stroke: {}, spacing: {}, radius: {} };
    const skipped = { alpha: 0, multi: 0, gradient: 0, ref: 0, otherPaint: 0 };
    const already = { fill: 0, strokeColor: 0, typography: 0, borderRadius: 0 };
    let scanned = 0, retuned = 0, retunedSpace = 0, retunedRadius = 0, pillRadius = 0, onScalePadding = 0;
    // `only` narrows the pass to ONE token class. A corner sweep must not re-bind fills or re-retune text on a page
    // that was already gated for them: those branches write, and a write outside the class under review is a change
    // nobody asked for. Without `only` every class runs, as before.
    const want = function (cls) { return !o.only || o.only === cls; };

    const visit = function (sh) {
      scanned++;
      let tk = {};
      try { tk = sh.tokens || {}; } catch (e) {}
      // ---- fills (a token fill binding replaces fill[0] with the token color and keeps no ref, so the only
      //      proof a paint is token-bound is `tokens.fill` — `fillColorRefId` stays null, measured 2026-10-20)
      let fills = [];
      try { fills = Array.from(sh.fills || []); } catch (e) {}
      if (fills.length && want('fill')) {
        const f0 = fills[0];
        if (tk.fill) already.fill++;
        else if (f0.fillColorRefId) skipped.ref++;
        else if (f0.fillImage || f0.fillColorGradient) skipped.gradient++;
        else if (fills.length > 1) skipped.multi++;
        else if (num(f0.fillOpacity) !== null && num(f0.fillOpacity) < 1) skipped.alpha++;
        else {
          const hex = TK.normHex(f0.fillColor);
          const e = hex && ci.byHex[hex];
          if (!e) { const raw = String(f0.fillColor || '').toLowerCase(); miss.color[raw] = (miss.color[raw] || 0) + 1; }
          else push(sh.type === 'text' ? e.copy : e.surface, 'fill', sh);
        }
      }
      // ---- strokes
      let strokes = [];
      try { strokes = Array.from(sh.strokes || []); } catch (e) {}
      if (strokes.length && want('fill')) {
        const s0 = strokes[0];
        if (tk.strokeColor) already.strokeColor++;
        else if (s0.strokeColorRefId) skipped.ref++;
        else if (strokes.length > 1) skipped.multi++;
        else if (num(s0.strokeOpacity) !== null && num(s0.strokeOpacity) < 1) skipped.alpha++;
        else {
          const hex = TK.normHex(s0.strokeColor);
          const e = hex && ci.byHex[hex];
          if (!e) { const raw = String(s0.strokeColor || '').toLowerCase(); miss.stroke[raw] = (miss.stroke[raw] || 0) + 1; }
          else push(e.surface, 'strokeColor', sh);
        }
      }
      // ---- layout spacing: a flex/grid container's gap and padding are values the space scale owns.
      // `spacing` tokens have **no default property** (design-tokens §6: omitting props is a no-op), so each prop
      // is named. 0 is skipped: "no gap" is the absence of a decision, not the 4px step.
      // Only rowGap/columnGap are bound (GAP_PROPS): the spacing token's property enum rejects the four padding
      // props, measured 2026-10-20, so padding is judged for scale membership (and retuned with `snapSpace`) but
      // reported as `padOnScale`, never as a binding.
      let fx = null, gr = null;
      try { fx = sh.flex; } catch (e) {}
      try { gr = sh.grid; } catch (e) {}
      const src = fx || gr;
      if (src && want('space')) {
        LAYOUT_PROPS.forEach(function (p) {
          let val = null;
          try { val = num(src[p]); } catch (e) {}
          if (val === null || val <= 0) return;
          let name = si.byVal[val];
          // `snapSpace: true` (opt-in: unlike a binding, this moves geometry) retunes an off-scale gap/padding onto
          // the declared steps, then binds what can be bound. Without it the value is only reported as offSpace.
          if (!name && o.snapSpace && sh.type === 'board') {
            const snap = TK.snapSpace(val);
            if (snap && snap.value > 0) {
              try { src[p] = snap.value; val = snap.value; name = snap.name; retunedSpace++; } catch (e) {}
            }
          }
          if (!name) { miss.spacing[val] = (miss.spacing[val] || 0) + 1; return; }
          if (GAP_PROPS.indexOf(p) < 0) { onScalePadding++; return; }
          if (tk[p]) { already[p] = (already[p] || 0) + 1; return; }
          push(name, p, sh);
        });
      }
      // ---- corners (rules 35/36 · the `borderRadius` token set is the ONLY source of a corner)
      // Opt-OUT, not opt-in: `radius: false` is the only way to keep a board's corners untouched, because a run that
      // leaves an orphan number on the canvas is the defect this pass exists to remove. Binding rewrites the drawn
      // value onto the ladder (measured), so `retunedRadius` counts how many corners moved and `pillRadius` how many
      // were derived `h/2` pills that became `radius.full`.
      if (want('radius') && o.radius !== false) {
        const cs = TK.cornersOf(sh);
        if (cs) {
          const v = Math.max.apply(null, cs);
          if (v > 0) {
            const r = TK.radiusFor(v, Math.min(num(sh.width) || 0, num(sh.height) || 0));
            if (!r) miss.radius[v] = (miss.radius[v] || 0) + 1;
            else {
              if (r.pill) pillRadius++;
              if (r.pill || r.snapped) retunedRadius++;
              if (CORNER_PROPS.every((p) => tk[p] === r.name)) already.borderRadius++;
              else push(r.name, 'borderRadius', sh);
            }
          }
        }
      }
      // ---- typography
      if (sh.type === 'text' && want('type')) {
        if (tk.typography) { already.typography++; return; }
        const k = TK.shapeTypeKey(sh);
        let name = ti.exact[k];
        if (!name && o.retune !== false) {
          const alt = TK.stepFor(sh.fontSize, sh.fontWeight, sh.fontFamily, sh.lineHeight);
          if (alt) { name = alt; retuned++; }
        }
        if (name) push(name, 'typography', sh);
        else miss.typography[k] = (miss.typography[k] || 0) + 1;
      }
    };
    if (o.self) visit(board); else TK.walk(board, visit);
    mark('visit', scanned);

    const applied = [], failed = [];
    let fillBound = 0, strokeBound = 0, typeBound = 0, spaceBound = 0, radiusBound = 0, shapes = 0;
    order.forEach(function (k) {
      const b = buckets[k];
      if (o.dry) { applied.push({ token: b.token, prop: b.prop, n: b.shapes.length }); return; }
      const t = TK.find(b.token);
      if (!t) { failed.push({ token: b.token, err: 'not found / set inactive' }); return; }
      try {
        if (b.prop === 'typography') t.applyToShapes(b.shapes, ['typography']);
        else if (b.prop === 'borderRadius') t.applyToShapes(b.shapes, CORNER_PROPS);
        else t.applyToShapes(b.shapes, [b.prop]);
        applied.push({ token: b.token, prop: b.prop, n: b.shapes.length });
        shapes += b.shapes.length;
        if (b.prop === 'fill') fillBound += b.shapes.length;
        else if (b.prop === 'strokeColor') strokeBound += b.shapes.length;
        else if (b.prop === 'typography') typeBound += b.shapes.length;
        else if (b.prop === 'borderRadius') radiusBound += b.shapes.length;
        else { spaceBound += b.shapes.length; if (LAYOUT_PROPS.indexOf(b.prop) < 0) failed.push({ token: b.token, prop: b.prop, err: 'not a layout prop' }); }
      } catch (e) { failed.push({ token: b.token, prop: b.prop, err: String(e).slice(0, 120) }); }
    });
    mark('apply', applied.length);
    // The settle wait is a timer, and a timer is NOT safe in the middle of a file pass: measured 2026-10-22, a
    // `bindBoard` that wrote four corner bindings on `Screen·gallery·Web` reached `apply +539ms` and then never got
    // out of `await nap(500)` — the render thread was busy re-laying the page and the plugin sandbox stopped firing
    // timers. `settle: 0` skips the promise entirely; the writes are already in the model, and the authoritative read
    // is the later dry pass (`radiusSweep({dry:true})`), which needs no timer.
    const settle = o.settle === undefined ? 500 : o.settle;
    if (!o.dry && order.length && settle > 0) await nap(settle);
    mark('settle');

    // readback: proof over a sample, because applyToShapes succeeds silently on an inactive set.
    // One bucket PER PROP is sampled (not the first six of whatever order came in), so a pass that bound 400 fills and
    // silently dropped its corners cannot read back as proven.
    let bound = 0, sample = 0;
    const probe = [];
    const seenProp = {};
    const sampleKeys = order.filter(function (k) {
      const pr = buckets[k].prop;
      if (seenProp[pr]) return false;
      seenProp[pr] = 1; return true;
    }).slice(0, 8);
    if (!o.dry && settle > 0) sampleKeys.forEach(function (k) {
      const b = buckets[k];
      b.shapes.slice(0, 3).forEach(function (sh) {
        sample++;
        let ok = false;
        try {
          ok = b.prop === 'borderRadius'
            ? CORNER_PROPS.every((p) => (sh.tokens || {})[p] === b.token)
            : (sh.tokens || {})[b.prop] === b.token;
        } catch (e) {}
        if (ok) bound++; else if (probe.length < 6) probe.push({ shape: sh.name, want: b.token, got: JSON.stringify(sh.tokens || {}) });
      });
    });

    mark('readback', bound);
    return {
      board: board.name, dry: !!o.dry, scanned: scanned, retuned: retuned, retunedSpace: retunedSpace,
      retunedRadius: retunedRadius, pillRadius: pillRadius,
      padOnScale: onScalePadding,
      fillBound: fillBound, strokeBound: strokeBound, typeBound: typeBound, spaceBound: spaceBound, radiusBound: radiusBound,
      already: already, skipped: skipped, batches: applied.length,
      offPalette: Object.keys(miss.color).map((h) => h + '×' + miss.color[h]),
      offStroke: Object.keys(miss.stroke).map((h) => h + '×' + miss.stroke[h]),
      offSpace: Object.keys(miss.spacing).sort((a, b) => miss.spacing[b] - miss.spacing[a]).map((k) => k + '×' + miss.spacing[k]),
      offRamp: Object.keys(miss.typography).sort((a, b) => miss.typography[b] - miss.typography[a]).map((k) => k + '×' + miss.typography[k]),
      offRadius: Object.keys(miss.radius).sort((a, b) => miss.radius[b] - miss.radius[a]).map((k) => k + '×' + miss.radius[k]),
      proof: (o.dry || settle === 0) ? null : { sampled: sample, bound: bound, misses: probe }
    };
  };

  // ---------- page / file batch runner (execute_code has a 30s ceiling, so this is resumable) ----------
  // Measured 2026-10-20: `penpot.pages` is **undefined** in the plugin build — the page list is on the file
  // (`penpot.currentFile.pages`), so a default that iterated `penpot.pages` threw instead of queueing the file.
  TK.pageNames = function () {
    try { const f = penpot.currentFile; if (f && f.pages) return Array.from(f.pages).map((p) => p.name); } catch (e) {}
    try { return Array.from(penpot.pages || []).map((p) => p.name); } catch (e) { return []; }
  };
  TK.bindStart = function (names) {
    TK._bindQueue = (names || TK.pageNames()).slice();
    TK._bindReport = {};
    return { queued: TK._bindQueue.length };
  };
  // Binds the top-level boards of a page (one call per board keeps each write batch small and interruptible).
  TK.bindPage = async function (name, o) {
    o = o || {};
    const page = (typeof name === 'string') ? penpotUtils.getPageByName(name) : name;
    if (!page) return { err: 'no page ' + name };
    if (penpot.currentPage.name !== page.name) {
      // `openPage` resolves once the page is loaded (measured: root readable 42ms after the call), so awaiting it
      // replaces the fixed 600ms timer — and a timer is the one thing this pass cannot rely on after a write.
      try { await penpot.openPage(page.id); } catch (e) {}
      await nap(120);
    }
    // `currentPage.children` is empty until the page object is re-read: the root lives on `page.root` (capabilities §2).
    let root = null;
    try { root = page.root || (Array.from(penpot.currentPage.children || []))[0] || null; } catch (e) {}
    // A big page keeps its root unhydrated for a moment after `openPage` (measured 2026-10-22 on `15 · Screens ·
    // content`: read back with `root = null` right after the open, 17 boards a second later). Re-reading by name turns a
    // cold page into a retry instead of a `page has no root`.
    for (let i = 0; !root && i < 6; i++) {
      await nap(250);
      try { const rp = penpotUtils.getPageByName(page.name); root = (rp && rp.root) || null; } catch (e) {}
    }
    if (!root) return { page: page.name, err: 'page has no root' };
    // The fixed structure shelves every board inside one `<page> · PageRoot` board (penpot-structure §3), so that board's
    // children are the page's units of work — and the PageRoot's own paint (the page ground) is bound separately.
    const named = Array.from(root.children || []).find((k) => /-PageRoot$/.test(String(k.name || '')));
    const container = named || root;
    const kids = Array.from(container.children || []).filter((k) => k.type === 'board');
    if (named) await TK.bindBoard(named, Object.assign({}, o, { self: true }));
    // The page chrome ( `<n>-Header` / `<n>-Footer`) are SIBLINGS of the PageRoot, so a sweep that only walks the
    // PageRoot leaves their paint and type unbound — `paint_unbound` on every page. Bound them in the same pass.
    let chrome = [];
    if (named) {
      try { chrome = Array.from(root.children || []).filter((k) => k.type === 'board' && k !== named); } catch (e) { chrome = []; }
    }
    for (let i = 0; i < chrome.length; i++) await TK.bindBoard(chrome[i], o);
    const rows = [];
    const from = o.from || 0, to = Math.min(kids.length, from + (o.count || kids.length));
    for (let i = from; i < to; i++) {
      const r = await TK.bindBoard(kids[i], o);
      rows.push(r);
    }
    const sum = (f) => rows.reduce((a, r) => a + (f(r) || 0), 0);
    // One yield per PAGE commits everything that page's boards queued: the binding is not in the file until the event
    // loop gets the turn back, and a per-board wait costs 0.7s × 12 boards for the same result 0.7s × 1 gives.
    if (o.pageSettle && rows.reduce((a, r) => a + (r.batches || 0), 0) > 0) await nap(o.pageSettle);
    return {
      page: page.name, boards: rows.length, of: kids.length, from: from,
      scanned: sum((r) => r.scanned), fill: sum((r) => r.fillBound), stroke: sum((r) => r.strokeBound), type: sum((r) => r.typeBound),
      alreadyType: sum((r) => r.already.typography),
      skipped: { alpha: sum((r) => r.skipped.alpha), multi: sum((r) => r.skipped.multi), gradient: sum((r) => r.skipped.gradient), ref: sum((r) => r.skipped.ref) },
      offPalette: rows.reduce((a, r) => a.concat(r.offPalette), []),
      offStroke: rows.reduce((a, r) => a.concat(r.offStroke), []),
      offRamp: rows.reduce((a, r) => { r.offRamp.forEach((k) => { const p = k.split('×'); a[p[0]] = (a[p[0]] || 0) + Number(p[1]); }); return a; }, {}),
      offSpace: rows.reduce((a, r) => { r.offSpace.forEach((k) => { const p = k.split('×'); a[p[0]] = (a[p[0]] || 0) + Number(p[1]); }); return a; }, {}),
      space: sum((r) => r.spaceBound), padOnScale: sum((r) => r.padOnScale),
      radius: sum((r) => r.radiusBound), alreadyRadius: sum((r) => (r.already || {}).borderRadius),
      retunedRadius: sum((r) => r.retunedRadius), pillRadius: sum((r) => r.pillRadius),
      offRadius: rows.reduce((a, r) => { (r.offRadius || []).forEach((k) => { const p = k.split('×'); a[p[0]] = (a[p[0]] || 0) + Number(p[1]); }); return a; }, {}),
      retuned: sum((r) => r.retuned), retunedSpace: sum((r) => r.retunedSpace)
    };
  };
  TK.bindNext = async function (o) {
    o = o || {};
    if (!TK._bindQueue) TK.bindStart();
    if (!TK._bindQueue.length) return { done: true, report: TK._bindReport };
    const n = TK._bindQueue[0];
    const r = await TK.bindPage(n, o);
    if (r.err && /page has no root/.test(r.err)) { TK._bindReport[n] = r; TK._bindQueue.shift(); return r; }
    TK._bindReport[n] = r;
    TK._bindQueue.shift();
    return { page: n, boards: r.boards, fill: r.fill, stroke: r.stroke, type: r.type, radius: r.radius,
      offPalette: (r.offPalette || []).length, remaining: TK._bindQueue.length };
  };

  // ---------- file-wide corner sweep (rules 35/36 · resume-safe) ----------
  // `execute_code` has a ~30s ceiling, so a file pass must stop itself and be called again. The queue lives in
  // `storage`, so a dropped call costs the in-flight page, never the progress already written — and because the pass
  // reads each shape's own value and re-binds only what is not already at the target token, re-running over a page
  // that was already swept is a no-op rather than a second edit.
  TK.radiusStart = function (names, o) {
    o = o || {};
    TK._radQueue = (names || TK.pageNames()).slice();
    TK._radReport = {};
    TK._radAt = 0;
    // The tally lives in `storage`, not in the call: an `execute_code` timeout discards the response but not the
    // writes or the cursor, so a dropped call must not discard the count of what was already done.
    if (!TK._radAgg || o.reset !== false) {
      TK._radAgg = { mode: o.dry ? 'dry' : 'apply', calls: 0, pages: 0, boards: 0, scanned: 0, bound: 0, already: 0, retuned: 0, pill: 0, off: 0, offValues: {}, errs: [] };
    }
    return { queued: TK._radQueue.length };
  };
  // A page is chunked, not taken whole: `bindPage` has no deadline of its own, and one 40-board screens page would
  // blow the ~30s `execute_code` ceiling from inside a single call (measured 2026-10-22: page 14 = 13 boards ≈ 4s, so
  // 4 boards per chunk keeps every call well under it).
  TK.radiusSweep = async function (o) {
    o = o || {};
    if (!TK._radQueue || !TK._radQueue.length) TK.radiusStart(null, { dry: o.dry });
    if (!TK._radAgg) TK.radiusStart(TK._radQueue, { dry: o.dry });
    const budget = o.budget === undefined ? 18000 : o.budget;
    const chunk = o.chunk === undefined ? 4 : o.chunk;
    // A corner binding is only in the file once the event loop has been given back: measured 2026-10-22, a sweep run
    // with no yield reported 3,465 corners bound while a later independent dry read still found them unbound, and the
    // same page with one 800ms yield read back 365/365 bound. The write is queued, the flush happens on the yield, so
    // the wait is not a courtesy pause for a readback — it IS the commit. It is paid once per PAGE (`pageSettle`), not
    // once per board, and `radiusPages()` is the read that says which pages still owe it.
    const settle = o.dry ? undefined : (o.settle === undefined ? 800 : o.settle);
    const t0 = Date.now();
    const agg = TK._radAgg;
    const anomalies = [];
    let chunks = 0;
    agg.calls++; agg.mode = o.dry ? 'dry' : 'apply';
    while (TK._radQueue.length && Date.now() - t0 < budget) {
      const n = TK._radQueue[0];
      const r = await TK.bindPage(n, {
        only: 'radius', dry: !!o.dry, from: TK._radAt, count: chunk,
        settle: o.dry ? undefined : 0, pageSettle: o.dry ? undefined : settle,
      });
      chunks++;
      if (r.err) { anomalies.push({ page: n, err: r.err }); agg.errs.push({ page: n, err: r.err }); TK._radQueue.shift(); TK._radAt = 0; continue; }
      agg.boards += r.boards || 0; agg.scanned += r.scanned || 0;
      agg.bound += r.radius || 0; agg.already += r.alreadyRadius || 0;
      agg.retuned += r.retunedRadius || 0; agg.pill += r.pillRadius || 0;
      Object.keys(r.offRadius || {}).forEach(function (k) {
        const p = k.split('×');
        agg.offValues[p[0]] = (agg.offValues[p[0]] || 0) + Number(p[1] || 1);
        agg.off += Number(p[1] || 1);
      });
      const rep = TK._radReport[n];
      if (!rep) { TK._radReport[n] = { boards: r.boards, of: r.of, scanned: r.scanned, bound: r.radius, already: r.alreadyRadius, retuned: r.retunedRadius, pill: r.pillRadius, offRadius: r.offRadius }; agg.pages++; }
      else {
        rep.boards += r.boards; rep.scanned += r.scanned; rep.bound += r.radius; rep.already += r.alreadyRadius;
        rep.retuned += r.retunedRadius; rep.pill += r.pillRadius;
      }
      TK._radAt += r.boards;
      // A chunk that processed nothing must still move the cursor: `from` cannot advance past a page whose boards all
      // failed, and a queue that never empties is a driver bug, not a design.
      if (!r.boards) { TK._radQueue.shift(); TK._radAt = 0; }
      else if (TK._radAt >= (r.of || 0)) { TK._radQueue.shift(); TK._radAt = 0; }
    }
    return {
      chunks: chunks, ms: Date.now() - t0, remaining: TK._radQueue.length, at: TK._radAt,
      done: TK._radQueue.length === 0, anomalies: anomalies.slice(0, 8),
      total: { pages: agg.pages, boards: agg.boards, scanned: agg.scanned, bound: agg.bound, already: agg.already, retuned: agg.retuned, pill: agg.pill, off: agg.off },
      offValues: agg.offValues
    };
  };
  // The per-page table the delivery read needs: which pages carried an off-ladder corner or had corners to move.
  TK.radiusPages = function (o) {
    o = o || {};
    const rows = Object.keys(TK._radReport || {}).map(function (n) {
      const r = TK._radReport[n];
      return { page: n, scanned: r.scanned, bound: r.bound, already: r.already, retuned: r.retuned, pill: r.pill, off: Object.keys(r.offRadius || {}).length };
    });
    return {
      pages: rows.length,
      withCorners: rows.filter((r) => r.retuned > 0 || r.bound > 0 || r.already > 0).length,
      withOffLadder: rows.filter((r) => r.off > 0).length,
      worst: rows.slice().sort((a, b) => b.retuned - a.retuned).slice(0, o.top || 12)
    };
  };

  // ---------- the step a HOST must carry (DESIGN.md's decision, not the factory's memory) ----------
  // Rules 35/36 judge corners that exist, so a control host drawn square by an older generation of the factory passes
  // vacuously — measured 2026-10-22, when the `Button·Spec` export showed square bodies behind pill focus rings. The
  // authority for which step a host takes is DESIGN.md's component list, and Rayo binds every button, tag, chip and
  // badge variant to `{rounded.full}`; these are the families that says something about, in the name `CF` uses.
  // A family absent from this table is NOT judged — the auditor never invents a step the source did not declare.
  // Measured 2026-10-22 on the live file: `Button·Primary·MD·Focus·Pill` reports `isComponentInstance() === true` AND
  // `isComponentMainInstance() === isComponentRoot() === isComponentHead() === true` — in Penpot a component IS its main
  // instance, so skipping "instances" would skip every master and fix nothing. Only a COPY is a consumer whose interior
  // belongs to the master (`isComponentCopyInstance()`); repairing the master is what propagates to the copies.
  TK.PILL_FAMS = { button: 1, iconbutton: 1, splitbutton: 1, fab: 1, chip: 1, badge: 1, tag: 1 };
  // The second half of the same contract: `CF.ROLE.ring = 'host'` — a ring is a derived outline, so its corner is the
  // host's corner. A ring at 10 around a host at 0 (or 9999) is the defect the user pointed at on `Button·Primary·MD·Focus·Pill`.
  TK.roleStart = function (names, o) {
    o = o || {};
    TK._roleQueue = (names || TK.pageNames()).slice();
    TK._roleReport = {};
    if (!TK._roleAgg || o.reset !== false) {
      TK._roleAgg = { mode: o.dry ? 'dry' : 'apply', calls: 0, pages: 0, hosts: 0, masters: 0, copies: 0, rings: 0, bound: 0, already: 0, errs: [] };
    }
    return { queued: TK._roleQueue.length };
  };
  TK.roleSweep = async function (o) {
    o = o || {};
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!TK._roleQueue || !TK._roleQueue.length) TK.roleStart(null, o);
    if (!TK._roleAgg) TK.roleStart(TK._roleQueue, o);
    const agg = TK._roleAgg; agg.calls++; agg.mode = o.dry ? 'dry' : 'apply';
    if (agg.copies === undefined) agg.copies = 0;    // an agg from a call made before this counter existed must not go NaN
    let FULL = 9999; try { if (storage.CF && storage.CF.radius) FULL = storage.CF.radius('control'); } catch (e) {}
    const budget = o.budget === undefined ? 18000 : o.budget;
    const settle = o.dry ? 0 : (o.settle === undefined ? 800 : o.settle);
    // Reading a page's `root` needs the page OPEN even for a dry count (a non-current Page exposes only id/name), so the
    // open is not optional here — keep its settle wait short when nothing is being written.
    const openNap = o.dry ? 60 : 150;
    const t0 = Date.now(); const anomalies = []; let chunks = 0;
    const isInst = (s) => { try { return typeof s.isComponentInstance === 'function' && s.isComponentInstance(); } catch (e) { return false; } };
    const isCopy = (s) => { try { return typeof s.isComponentCopyInstance === 'function' && s.isComponentCopyInstance(); } catch (e) { return isInst(s); } };
    const isMaster = (s) => { try { return typeof s.isComponentMainInstance === 'function' && s.isComponentMainInstance(); } catch (e) { return false; } };
    const maxC = (s) => { const cs = TK.cornersOf(s); return cs ? Math.max.apply(null, cs) : null; };
    while (TK._roleQueue.length && Date.now() - t0 < budget) {
      const n = TK._roleQueue.shift(); chunks++;
      let page = null; try { page = penpotUtils.getPageByName(n); } catch (e) {}
      if (!page) { anomalies.push({ page: n, err: 'no page' }); continue; }
      // Writes need the page OPEN (api-pitfalls §14); reads do not, but this pass writes.
      if (penpot.currentPage.name !== n) { try { await penpot.openPage(page.id); } catch (e) { anomalies.push({ page: n, err: 'open failed' }); continue; } await nap(openNap); }
      let root = null; try { root = penpot.currentPage.root; } catch (e) {}
      for (let i = 0; !root && i < 6; i++) { await nap(o.dry ? 80 : 200); try { const rp = penpotUtils.getPageByName(n); root = rp && rp.root; } catch (e) {} }
      if (!root) { anomalies.push({ page: n, err: 'no root (cold page)' }); TK._roleQueue.unshift(n); break; }
      let hosts = 0, rings = 0, masters = 0, copies = 0;
      (function walk(s, host) {
        // Measured 2026-10-22: writing `borderRadius` on a component's MAIN INSTANCE fixes the master and every FRESH
        // instance, but the copies already placed in the file keep their own geometry — `Button·SM` on `14 · Screens ·
        // app` still read 0 after its master was set to 9999, and re-opening the page did not refresh it. So a copy is
        // visited too, and only with these two rules (host step + ring follows host): nothing else about a copy is ours
        // to rewrite, and `resetOverrides()` would also revert the label and paint a screen deliberately set.
        const nm = String(s.name || '');
        const isCop = isCopy(s);
        let h = host;
        if (/^ring·/.test(nm)) {
          // The host is resolved by geometry, not by "the nearest enclosing board": inside a `Family·Spec` board that
          // fallback hands the rule the shelf itself (TK.ringHost, and the drifted `Search·Spec` plate of 2026-10-22).
          // A ring takes the corner of the control BOARD it outlines; when it hugs a nested plate (a `field` rect, one
          // crumb text run) that plate's own radius is design-guide §5.1's open question, and copying it here would
          // rewrite 100+ rings to a value no token bound them to.
          const r = TK.ringHost ? TK.ringHost(s) : { host: host, floating: false };
          const rh = r.host;
          if (rh && !r.floating && String(rh.type) === 'board' && isControlBoard(rh)) {
            const hv = maxC(rh), rv = maxC(s);
            if (hv !== null && rv !== null && hv !== rv) { rings++; if (!o.dry) { try { s.borderRadius = hv; } catch (e) { rings--; } } }
          }
        } else if (String(s.type) === 'board') {
          h = s;
          const base = nm.split('·')[0].toLowerCase();
          if (TK.PILL_FAMS[base] && !/·Spec$|-PageRoot$|-Header$|-Footer$/.test(nm)) {
            const v = maxC(s);
            if (v !== null && v !== FULL) {
              hosts++;
              if (isCop) copies++; else if (isMaster(s)) masters++;
              if (!o.dry) { try { s.borderRadius = FULL; } catch (e) { hosts--; if (isCop) copies--; else if (isMaster(s)) masters--; } }
            }
          }
        }
        let ks = []; try { ks = Array.from(s.children || []); } catch (e) {}
        ks.forEach((k) => walk(k, h));
      })(root, null);
      // The values are now on the ladder; bind them. `TK.bindPage` walks every board's corners and yields once per page,
      // and that yield IS the commit (api-pitfalls §17) — a sweep that skips it has written nothing.
      let bind = { radius: 0, alreadyRadius: 0 };
      if (!o.dry) bind = await TK.bindPage(n, { only: 'radius', settle: 0, pageSettle: settle });
      agg.pages++; agg.hosts += hosts; agg.rings += rings; agg.masters += masters; agg.copies += copies;
      agg.bound += bind.radius || 0; agg.already += bind.alreadyRadius || 0;
      TK._roleReport[n] = { hosts: hosts, masters: masters, copies: copies, rings: rings, bound: bind.radius || 0, already: bind.alreadyRadius || 0 };
      if (bind.err) anomalies.push({ page: n, err: bind.err });
    }
    return {
      chunks: chunks, ms: Date.now() - t0, remaining: TK._roleQueue.length, done: TK._roleQueue.length === 0,
      anomalies: anomalies.slice(0, 8),
      total: { pages: agg.pages, hosts: agg.hosts, masters: agg.masters, copies: agg.copies, rings: agg.rings, bound: agg.bound, already: agg.already }
    };
  };
  TK.rolePages = function () {
    return Object.keys(TK._roleReport || {}).filter((n) => TK._roleReport[n].hosts || TK._roleReport[n].rings)
      .map((n) => Object.assign({ page: n }, TK._roleReport[n]));
  };

  // ---------- the ring ↔ owner relation: resolved by GEOMETRY, in one place ----------
  // Rule 37 (`ring_off_host`) compares a ring's corner to its host's, but it *found* its host by assuming the ring is
  // already concentric. Measured 2026-10-22 on `04.04 · Text fields · Search·Spec`: a `ring·focus` left at its pre-refit
  // box (204×36 at y 546, drawn for a 200px cell before the row was refit to 281×32 at y 532) has no concentric sibling,
  // and the old fallback `famOf(par) ? par : null` handed rule 37 the **Spec board** as the host — corners 0 — so a
  // floating, 16px-low ring around nothing read CLEAN. A container is never a host: a `·Spec` / `·PageRoot` / `-Header` /
  // `-Footer` board holds controls, it is not one. This function is the single source of the relation; the auditor reads
  // it (`audit_design` rules 37/38) and `TK.ringSweep` repairs with it, so the two cannot own two tables (api-pitfalls §16).
  //
  // Two measured facts set the semantics of this whole section (census 2026-10-22, 231 rings over the 116 pages 03–16):
  //   1. **the margin is not a constant.** 176 rings hug their plate at 2px, but Rating/IconButton rows use 6, a Segmented
  //      uses 5, a `Slider` handle uses 10, and a Breadcrumb crumb ring is *coincident* with its row (0). A ±2 box
  //      comparison therefore mis-called 47 healthy rings detached. The invariant is not the margin but the **relation**:
  //      the ring is concentric with a real plate and strictly encloses it (`margin ∈ [0, RING_MAX_MARGIN]`).
  //   2. **the owner is usually not the control board.** A ring outlines what the user sees: the `field` rect of an addon
  //      Input (204×36 inside a 279×32 host), the 140×32 input segment of a NumberField, the 18×18 `box` of a Checkbox,
  //      one `handle` of a Slider, one **row** of a Tree / Accordion / rail / crumb list. So the scan walks the whole
  //      control subtree (text and paths included — a crumb link *is* a text run), and a ring that outlines a row band
  //      and simply has no plate of its own is judged by **containment** instead, not called detached.
  TK.RING_OFF = 2;
  TK.RING_MAX_MARGIN = 12;
  const RING_CONTAINER = /·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^Root /;
  const RING_DECOR = /^(ring·|hairline·|guide·|axis|Group$)/;
  function ringName(sh) { try { return String(sh.name || ''); } catch (e) { return ''; } }
  function ringBox(sh) {
    try {
      const x = Number(sh.x), y = Number(sh.y), w = Number(sh.width), h = Number(sh.height);
      return [x, y, w, h].every((v) => isFinite(v)) ? { x: x, y: y, w: w, h: h } : null;
    } catch (e) { return null; }
  }
  // a host is a CF-shaped control board (`Family·Variant·Size·State·Slot`), never the shelf that holds them
  function isControlBoard(sh) {
    if (String(sh.type) !== 'board') return false;
    const n = ringName(sh);
    if (RING_CONTAINER.test(n)) return false;
    return n.indexOf('·') >= 0;
  }
  function isOwnable(sh) {
    if (String(sh.type) === 'svg') return false;
    return !RING_DECOR.test(ringName(sh));
  }
  function N2(v) { return Math.round(v * 100) / 100; }

  // The page-wide fallback for a ring that is NOT inside any control: its SIZE identifies the plate it was drawn for
  // (ring = plate ⊕ m for the family's m), so the owner is the nearest plate the ring is exactly the right size to hug.
  TK.ringOwner = function (s, o) {
    o = o || {};
    const margin = o.margin === undefined ? TK.RING_MAX_MARGIN : o.margin;
    const maxDelta = o.maxDelta === undefined ? 200 : o.maxDelta;
    const rb = ringBox(s);
    if (!rb) return { host: null, err: 'no box' };
    const cx = rb.x + rb.w / 2, cy = rb.y + rb.h / 2;
    const matches = [];
    (function scan(k, d) {
      if (k !== s && isOwnable(k)) {
        const b = ringBox(k);
        if (b && b.w > 0 && b.h > 0) {
          const ox = (rb.w - b.w) / 2, oy = (rb.h - b.h) / 2;
          // The ring ENCLOSES its owner with a tight, non-negative margin on both axes. Uniformity is NOT required: an
          // inline-link ring is its text ⊕ (1.5, 3) — a crumb of `08.06` — because a link adds vertical breathing room,
          // not a square frame. Rank by centre distance, then by total slack, then innermost.
          if (ox >= -0.01 && oy >= -0.01 && ox <= margin && oy <= margin) {
            const v = Math.abs(cx - (b.x + b.w / 2)) + Math.abs(cy - (b.y + b.h / 2));
            if (v <= maxDelta) matches.push({ sh: k, box: b, ox: ox, oy: oy, slack: Math.abs(ox - oy) + ox + oy, delta: N2(v) });
          }
        }
      }
      if (d >= (o.depth === undefined ? 6 : o.depth)) return;
      let ks = []; try { ks = Array.from(k.children || []); } catch (e) {}
      ks.forEach((c) => scan(c, d + 1));
    })(o.scan || s.parent, 0);
    matches.sort((a, b) => (a.delta - b.delta) || (a.slack - b.slack) || (a.box.w * a.box.h - b.box.w * b.box.h));
    if (!matches.length) return { host: null, matches: 0 };
    return { host: matches[0].sh, margin: N2(matches[0].ox), oy: N2(matches[0].oy), delta: matches[0].delta, matches: matches.length,
      runnerUp: matches.length > 1 ? matches[1].delta : null, ambiguous: matches.length > 1 && matches[1].delta - matches[0].delta <= 2 };
  };

  // THE resolver. Returns `{host, concentric, floating, contained, ox, oy}` — `host` = the plate the ring outlines,
  // `concentric` = it really traces it, `floating` = the ring is not mounted inside any control (the defect the user
  // reported), `contained` = it sits inside its control and outlines a row band that has no plate of its own.
  TK.ringHost = function (s, o) {
    o = o || {};
    const tol = o.tol === undefined ? 3 : o.tol;
    const margin = o.margin === undefined ? TK.RING_MAX_MARGIN : o.margin;
    const rb = ringBox(s);
    if (!rb) return { host: null, concentric: false, err: 'no box' };
    const cx = rb.x + rb.w / 2, cy = rb.y + rb.h / 2;
    let control = null, a = null, g = 0;
    try { a = s.parent; } catch (e) {}
    while (a && g < 4) { if (isControlBoard(a)) { control = a; break; } try { a = a.parent; } catch (e) { a = null; } g++; }
    const cb = ringBox(control);
    // A row ring legitimately overhangs its control by its own margin, so containment is judged on the control
    // EXPANDED by RING_MAX_MARGIN, with the ring's centre inside the control (measured: the Tree/Accordion/rail rows have
    // no plate of their own — only their Text runs and glyphs are drawn flat — so a row outline traces nothing).
    const contained = !!cb && rb.x >= cb.x - margin && rb.y >= cb.y - margin &&
      rb.x + rb.w <= cb.x + cb.w + margin && rb.y + rb.h <= cb.y + cb.h + margin &&
      cx >= cb.x && cx <= cb.x + cb.w && cy >= cb.y && cy <= cb.y + cb.h;
    if (control) {
      const good = [];
      (function scan(k, d) {
        if (k !== s && isOwnable(k)) {
          const b = ringBox(k);
          if (b && b.w > 0 && b.h > 0) {
            const v = Math.abs(cx - (b.x + b.w / 2)) + Math.abs(cy - (b.y + b.h / 2));
            const ox = (rb.w - b.w) / 2, oy = (rb.h - b.h) / 2;
            if (v <= tol && ox >= -0.01 && oy >= -0.01 && ox <= margin && oy <= margin) good.push({ sh: k, v: v, ox: ox, oy: oy });
          }
        }
        if (d >= (o.depth === undefined ? 4 : o.depth)) return;
        let ks = []; try { ks = Array.from(k.children || []); } catch (e) {}
        ks.forEach((c) => scan(c, d + 1));
      })(control, 0);
      // a composite's ring hugs the SMALLER thing it outlines, so the innermost concentric plate wins.
      good.sort((p, q) => (p.v - q.v) || (p.sh.width * p.sh.height - q.sh.width * q.sh.height));
      if (good.length) {
        const w = good[0];
        return { host: w.sh, control: control, concentric: true, floating: false, contained: contained,
          via: w.sh === control ? 'control' : 'descendant', ox: N2(w.ox), oy: N2(w.oy), dist: N2(w.v),
          kind: String(w.sh.type), accepts: good.length };
      }
      return { host: null, control: control, concentric: false, floating: false, contained: contained, kind: 'none' };
    }
    // floating: mounted on the container board, so no concentric sibling can exist. Use the size match instead.
    const own = TK.ringOwner(s, { margin: margin, maxDelta: o.maxDelta, scan: o.scan });
    if (!own.host) return { host: null, control: null, concentric: false, floating: true, contained: false, matches: own.matches || 0 };
    return { host: own.host, control: null, concentric: own.delta <= tol, floating: true, contained: false,
      via: 'size-match', ox: own.margin, oy: own.oy, dist: own.delta, kind: String(own.host.type),
      matches: own.matches, runnerUp: own.runnerUp, ambiguous: own.ambiguous };
  };

  // The board a repaired ring must be mounted IN: `ctx.ring` puts a ring inside the control whose plate it outlines
  // (`clip·` crops are the one exception — their ring stays one level up, api-pitfalls §4).
  function ringMount(host) {
    if (isControlBoard(host)) return /^clip·/.test(ringName(host)) ? host.parent : host;
    let a = null, g = 0;
    try { a = host.parent; } catch (e) {}
    while (a && g < 5) { if (isControlBoard(a)) return /^clip·/.test(ringName(a)) ? a.parent : a; try { a = a.parent; } catch (e) { a = null; } g++; }
    return null;
  }

  // Census + idempotent repair for the drift class. `dry` reports; a write refits the ring onto its owner (owner box ±
  // the ring's own measured margin, never a forced 2), re-mounts it inside the owning control, and takes the owner's
  // corner when the owner is a control BOARD (a nested plate's radius is design-guide §5.1's open question, not this rule).
  TK.ringStart = function (names, o) {
    o = o || {};
    TK._ringQueue = (names || TK.pageNames()).slice();
    TK._ringReport = {};
    if (!TK._ringAgg || o.reset !== false) {
      TK._ringAgg = { mode: o.dry ? 'dry' : 'apply', calls: 0, pages: 0, rings: 0, ok: 0, drift: 0, reparented: 0, refit: 0, corners: 0, floating: 0, rowRing: 0, unresolved: 0, bound: 0, errs: [] };
    }
    return { queued: TK._ringQueue.length };
  };
  TK.ringSweep = async function (o) {
    o = o || {};
    const nap = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!TK._ringQueue || !TK._ringQueue.length) TK.ringStart(null, o);
    if (!TK._ringAgg) TK.ringStart(TK._ringQueue, o);
    const agg = TK._ringAgg; agg.calls++; agg.mode = o.dry ? 'dry' : 'apply';
    const budget = o.budget === undefined ? 16000 : o.budget;
    const settle = o.dry ? 0 : (o.settle === undefined ? 800 : o.settle);
    const t0 = Date.now(); const anomalies = []; let chunks = 0;
    while (TK._ringQueue.length && Date.now() - t0 < budget) {
      const n = TK._ringQueue.shift(); chunks++;
      let page = null; try { page = penpotUtils.getPageByName(n); } catch (e) {}
      if (!page) { anomalies.push({ page: n, err: 'no page' }); continue; }
      if (penpot.currentPage.name !== n) { try { await penpot.openPage(page.id); } catch (e) { anomalies.push({ page: n, err: 'open failed' }); continue; } await nap(o.dry ? 60 : 150); }
      let root = null; try { root = penpot.currentPage.root; } catch (e) {}
      for (let i = 0; !root && i < 6; i++) { await nap(o.dry ? 80 : 200); try { const rp = penpotUtils.getPageByName(n); root = rp && rp.root; } catch (e) {} }
      if (!root) { anomalies.push({ page: n, err: 'no root (cold page)' }); TK._ringQueue.unshift(n); break; }
      let rings = 0, ok = 0, drift = 0, reparented = 0, refit = 0, corners = 0, floating = 0, rowRing = 0, unresolved = 0;
      const list = [];
      (function walk(s) {
        if (/^ring·/.test(ringName(s))) { list.push(s); return; }
        let ks = []; try { ks = Array.from(s.children || []); } catch (e) {}
        ks.forEach((k) => walk(k));
      })(root);
      list.forEach((s) => {
        rings++;
        const res = TK.ringHost(s, { tol: o.tol, margin: o.margin });
        const host = res.host;
        if (!host) {
          if (res.floating) { floating++; unresolved++; anomalies.push({ page: n, ring: ringName(s), floating: true, matches: res.matches }); }
          else if (res.contained) { rowRing++; ok++; }
          else { unresolved++; anomalies.push({ page: n, ring: ringName(s), err: 'inside control, fits nothing' }); }
          return;
        }
        if (res.concentric && !res.floating) {
          ok++;
          if (String(host.type) === 'board' && isControlBoard(host)) {
            const cs = TK.cornersOf(host), rs = TK.cornersOf(s);
            const hv = cs ? Math.max.apply(null, cs) : null, rv = rs ? Math.max.apply(null, rs) : null;
            if (hv !== null && rv !== null && hv !== rv) { corners++; if (!o.dry) { try { s.borderRadius = hv; } catch (e) { corners--; } } }
          }
          return;
        }
        drift++;
        // the ring's OWN measured margins are re-applied (a link ring is ⊕1.5/3, a control ring ⊕2, a handle ring ⊕10) —
        // forcing 2 here would repaint every non-uniform outline in the file.
        const ox = res.ox === undefined ? TK.RING_OFF : res.ox, oy = res.oy === undefined ? TK.RING_OFF : res.oy;
        const hb = ringBox(host);
        const target = ringMount(host);
        const to = [Math.round(hb.x - ox), Math.round(hb.y - oy), Math.round(hb.w + ox * 2), Math.round(hb.h + oy * 2)];
        if (res.floating) floating++;
        if (o.dry) { anomalies.push({ page: n, ring: ringName(s), drift: { via: res.via, dist: res.dist, margin: [ox, oy], host: ringName(host), kind: res.kind, from: [Math.round(s.x), Math.round(s.y), Math.round(s.width), Math.round(s.height)], to: to } }); return; }
        if (!target) { anomalies.push({ page: n, ring: ringName(s), err: 'no mount target' }); drift--; return; }
        try { if (target.clipContent) target.clipContent = false; } catch (e) {}
        storage.absMount(target, s, hb.x - ox, hb.y - oy);
        s.resize(hb.w + ox * 2, hb.h + oy * 2);
        if (target !== s.parent) reparented++;
        refit++;
        if (String(host.type) === 'board' && isControlBoard(host)) {
          const cs = TK.cornersOf(host);
          const hv = cs ? Math.max.apply(null, cs) : null;
          if (hv !== null) { const rs = TK.cornersOf(s); const rv = rs ? Math.max.apply(null, rs) : null; if (rv !== hv) { corners++; try { s.borderRadius = hv; } catch (e) {} } }
        }
      });
      let bind = { radius: 0 };
      // a geometry write and a corner write both drop the token binding, so the pass must re-bind to leave the file bound.
      if (!o.dry && (refit || corners)) bind = await TK.bindPage(n, { only: 'radius', settle: 0, pageSettle: settle });
      else if (!o.dry && settle) await nap(settle);
      agg.pages++; agg.rings += rings; agg.ok += ok; agg.drift += drift; agg.reparented += reparented;
      agg.refit += refit; agg.corners += corners; agg.floating += floating; agg.rowRing += rowRing;
      agg.unresolved += unresolved; agg.bound += bind.radius || 0;
      TK._ringReport[n] = { rings: rings, ok: ok, drift: drift, reparented: reparented, refit: refit, corners: corners, floating: floating, rowRing: rowRing, unresolved: unresolved, bound: bind.radius || 0 };
    }
    return {
      chunks: chunks, ms: Date.now() - t0, remaining: TK._ringQueue.length, done: TK._ringQueue.length === 0,
      anomalies: anomalies.slice(0, o.samples || 10), anomalyCount: anomalies.length,
      total: { pages: agg.pages, rings: agg.rings, ok: agg.ok, drift: agg.drift, reparented: agg.reparented, refit: agg.refit, corners: agg.corners, floating: agg.floating, rowRing: agg.rowRing, unresolved: agg.unresolved, bound: agg.bound }
    };
  };
  TK.ringPages = function () {
    return Object.keys(TK._ringReport || {}).filter((n) => TK._ringReport[n].drift || TK._ringReport[n].unresolved || TK._ringReport[n].floating || TK._ringReport[n].corners)
      .map((n) => Object.assign({ page: n }, TK._ringReport[n]));
  };

  // ---------- library typography styles: the 素材 → 排版 list ----------
  // Measured 2026-10-21: a file can hold 40 *active* `typography` tokens and still show an **empty** Typography
  // panel, because that panel lists `penpot.library.local.typographies` (the style records) — a different subsystem
  // from `tokens.sets`. `createTypography()` takes NO argument (same ignore-the-args behaviour as `createColor`,
  // capabilities §7) and returns a `LibraryTypography` with writable name/fontFamily/fontSize/fontWeight/lineHeight/
  // letterSpacing plus `applyToText(shape)`. A token *declares* the ramp; a style is what a consumer can pick,
  // so a delivered file needs both — audit_design rule 30 (`no_type_styles`) fails a text-bearing board whose
  // library has styles = 0.
  const TP = storage.TP = {};
  TP.all = function () { try { return Array.from(penpot.library.local.typographies); } catch (e) { return []; } };
  TP.get = function (name) { const n = String(name); return TP.all().find((t) => String(t.name) === n) || null; };
  TP.read = function (t) {
    const o = {};
    ['name', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'].forEach((k) => {
      try { o[k] = t[k]; } catch (e) { o[k] = undefined; }
    });
    return o;
  };

  // Idempotent: one style per declared token, named **exactly like the token**, so `type.prose-lg` on a shape means
  // the same thing in the token set, in the panel and in the auditor. `rewrite: true` re-writes an existing record.
  TP.seed = function (o) {
    o = o || {};
    const list = TK.activeTokens('typography');
    const have = {};
    TP.all().forEach((t) => { have[String(t.name)] = t; });
    const made = [], kept = [], drift = [], failed = [];
    list.forEach(function (e) {
      const v = TK.tokenValue(e.token);
      const famName = Array.isArray(v.fontFamily) ? String(v.fontFamily[0] || '') : String(v.fontFamily || '');
      let t = have[e.name];
      if (t && !o.rewrite) { kept.push(e.name); return; }
      if (!t) {
        try { t = penpot.library.local.createTypography(); } catch (err) { failed.push(e.name + ' ← create: ' + String(err && err.message || err).slice(0, 48)); return; }
        made.push(e.name);
      }
      try { t.name = e.name; } catch (err) {}
      const f = famName ? penpot.fonts.findByName(famName) : null;
      const wantW = String(v.fontWeight || '400');
      if (f) {
        const variant = f.variants.find((x) => String(x.fontWeight) === wantW)
          || f.variants.find((x) => String(x.fontWeight) === '400') || f.variants[0];
        // setFont, not fontFamily= : the style record must carry a real fontId/variantId or the panel shows a family
        // the renderer cannot load. Weight/size after it, because setFont also writes the weight it resolved.
        try { t.setFont(f, variant); } catch (err) { failed.push(e.name + ' ← setFont: ' + String(err && err.message || err).slice(0, 48)); }
      } else if (famName) { failed.push(e.name + ' ← font "' + famName + '" not installed'); }
      const want = { fontSize: v.fontSize, lineHeight: v.lineHeight, letterSpacing: v.letterSpacing, fontWeight: v.fontWeight };
      Object.keys(want).forEach((k) => {
        if (want[k] === null || want[k] === undefined || want[k] === '') return;
        try { t[k] = String(want[k]); } catch (err) {}
      });
      const bad = [];
      Object.keys(want).forEach((k) => {
        if (want[k] === null || want[k] === undefined || want[k] === '') return;
        let got; try { got = t[k]; } catch (err) {}
        if (num(got) === null || num(got) !== num(want[k])) bad.push(k + '=' + String(got) + ' ≠ ' + String(want[k]));
      });
      if (bad.length) drift.push(e.name + ' ← ' + bad.join(', '));
    });
    return { ramp: list.length, made: made.length, kept: kept.length, styles: TP.all().length,
      madeNames: made.slice(0, 8), drift: drift.slice(0, 8), failed: failed.slice(0, 8) };
  };

  // The inventory the gate reads: every declared step must have a style, and a style with no token is a lie in the panel.
  TP.audit = function () {
    const ramp = TK.typeIndex().ramp;
    const names = TP.all().map((t) => String(t.name));
    const missing = ramp.filter((r) => names.indexOf(r.name) < 0).map((r) => r.name);
    const fileOnly = names.filter((n) => !ramp.some((r) => r.name === n));
    return { tokens: ramp.length, styles: names.length, missing: missing.slice(0, 12), fileOnly: fileOnly.slice(0, 12) };
  };

  // Apply the declared style to a text shape and report the readback (this is the panel's own "apply", so a style
  // that cannot be applied is worth nothing — measure it, do not assume it).
  TP.apply = function (shape) {
    let fam = null, fs = null, fw = null, lh = null;
    try { fam = shape.fontFamily; fs = shape.fontSize; fw = shape.fontWeight; lh = shape.lineHeight; } catch (e) {}
    const name = TK.stepFor(fs, fw, fam, lh);
    if (!name) return { err: 'this step is not in the ramp', shape: String(shape.name || '').slice(0, 30) };
    const st = TP.get(name);
    if (!st) return { err: 'no style named ' + name, step: name };
    const before = TP.read(shape);
    try { st.applyToText(shape); } catch (e) { return { err: String(e && e.message || e).slice(0, 60), step: name }; }
    // Measured 2026-10-21: `applyToText` transmits family/size/weight/tracking but rewrites **lineHeight to 1.2**
    // whatever the record holds (1.05 → 1.2, 1.4 → 1.2), so the leading is re-asserted from the style here — otherwise
    // applying a style silently flattens the ramp's rhythm.
    let styleLh = null; try { styleLh = st.lineHeight; } catch (e) {}
    if (styleLh !== null && styleLh !== undefined && String(styleLh) !== '') { try { shape.lineHeight = String(styleLh); } catch (e) {} }
    return { step: name, changed: JSON.stringify(before) !== JSON.stringify(TP.read(shape)), after: TP.read(shape) };
  };

  return { seeded: true, fns: ['TK.seed', 'TK.ensureSet', 'TK.put', 'TK.find', 'TK.apply', 'TK.unbindFill', 'TK.unbindStroke', 'TK.paint', 'TK.changed', 'TK.audit', 'TK.assert', 'TK.theme', 'TK.ensureTheme', 'TK.activateTheme', 'TK.activeSets', 'TK.colorIndex', 'TK.typeIndex', 'TK.stepFor', 'TK.snapType', 'TK.nearestHex', 'TK.spaceIndex', 'TK.snapSpace', 'TK.declared', 'TK.walk', 'TK.bindBoard', 'TK.bindPage', 'TK.bindStart', 'TK.bindNext', 'TP.seed', 'TP.audit', 'TP.apply', 'TP.get', 'TP.read'] };
})();
