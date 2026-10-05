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

  return { seeded: true, fns: ['TK.seed', 'TK.ensureSet', 'TK.put', 'TK.find', 'TK.apply', 'TK.unbindFill', 'TK.unbindStroke', 'TK.audit', 'TK.assert', 'TK.theme', 'TK.ensureTheme', 'TK.activateTheme', 'TK.activeSets'] };
})();
