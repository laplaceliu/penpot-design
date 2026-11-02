// component-engine.js — storage.CK: the component-first runtime.
//
// A component is a DEFINITION, not a drawing: id, group, factory renderer, props, states, slots, parts and
// token-role bindings. The factory draws; CK resolves semantic roles against the live token set, binds them,
// registers the master and places instances. A raw hex never enters a component call site.
//
//   CK.loadContract(tokenContract)                 // assets/components/token-contract.json
//   CK.load(coreRegistry)                          // assets/components/core.json
//   CK.load(catalogRegistry)                       // assets/components/catalog.json (125 codesign-ui families)
//   await CK.master('Button', {type:'primary'})    // build + bind + register `Button`
//   CK.instance('Button', {type:'primary'}, {parent, absolute:{x,y}, text:'Save'})
//   await CK.buildPack('core', {x:80, y:80, limit:6}) // resumable; call until done
//   CK.theme('Scheme', 'Dark')                     // switch token sets and prove the paint changed
//   CK.audit({pack:'core'})                        // token contract + masters + unbound census
//
// Why: the v2 pipeline bound tokens AFTER a board was drawn (TK.bindBoard). That made tokens a repair pass, not the
// design input. CK binds the semantic role BEFORE the value fallback, and publishes the unbound list, so a component
// that changes with tokens is the default — and a component that does not is a measured finding, not a promise.
return (function () {
  if (!storage.CF) return { err: 'run component-factory.js first' };
  var CK = {};
  storage.CK = CK;
  CK.VERSION = '1.0.0';

  var defs = {};          // id -> definition
  var byName = {};        // lowercase name -> id
  var packs = {};         // pack -> [id]
  var contract = null;
  var loadedFiles = [];

  function nm(s) { try { return String(s == null ? '' : s); } catch (e) { return ''; } }
  function low(s) { return nm(s).toLowerCase(); }
  function norm(s) { return low(s).replace(/[\s_\-·.]/g, ''); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isFn(x) { return typeof x === 'function'; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms || 80); }); }

  // ------------------------------------------------------------------ contract
  CK.loadContract = function (json) {
    if (!json || typeof json !== 'object' || !json.roles) return { err: 'contract: {roles:{…}} required' };
    contract = json;
    var roles = Object.keys(json.roles || {});
    return { loaded: 'contract', name: json.name || null, roles: roles.length, required: (json.required || []).length };
  };
  CK.contract = function () {
    if (!contract) return { err: 'no contract loaded — CK.loadContract(token-contract.json)' };
    var rows = Object.keys(contract.roles || {}).map(function (role) {
      var r = CK.roleToken(role);
      return { role: role, token: r.token || null, type: contract.roles[role].type, ok: !!r.record, err: r.err || null };
    });
    var missing = rows.filter(function (r) { return !r.ok; });
    var required = (contract.required || []).map(function (role) {
      var r = CK.roleToken(role);
      return { role: role, ok: !!r.record, token: r.token || null, err: r.err || null };
    });
    return { name: contract.name || null, roles: rows.length, resolved: rows.length - missing.length,
      missing: missing, required: required, requiredMissing: required.filter(function (r) { return !r.ok; }) };
  };

  /** Resolve a semantic role against the LIVE token set. Order: declared token name, aliases, then a normalized
      match across active tokens (so `color.primary-ink` and `color.primaryInk` are the same role). */
  CK.roleToken = function (role) {
    if (!contract) return { role: role, err: 'no contract loaded' };
    var spec = (contract.roles || {})[role];
    if (!spec) return { role: role, err: 'unknown role' };
    var want = [spec.token].concat(spec.aliases || []);
    for (var i = 0; i < want.length; i++) {
      var name = want[i];
      var rec = null;
      try { rec = storage.TK && storage.TK.find ? storage.TK.find(name) : null; } catch (e) { rec = null; }
      if (rec) return { role: role, token: name, record: rec, type: spec.type };
    }
    var active = [];
    try { active = storage.TK.activeTokens() || []; } catch (e) { active = []; }
    var hit = null, lookup = {};
    want.forEach(function (x) { lookup[norm(x)] = 1; });
    for (var j = 0; j < active.length; j++) {
      var an = active[j].name;
      if (lookup[norm(an)]) { hit = active[j]; break; }
    }
    if (hit) return { role: role, token: hit.name, record: hit.token, type: spec.type, normalized: true };
    return { role: role, err: 'token missing (expected ' + spec.token + ')', expected: spec.token, type: spec.type };
  };

  // ------------------------------------------------------------------ registry
  function validateDef(def) {
    var issues = [];
    if (!def || typeof def !== 'object') return ['not an object'];
    if (!def.id) issues.push('missing id');
    if (!def.name) issues.push('missing name');
    if (!def.factory && def.renderer !== 'none') issues.push('missing factory');
    if (def.factory && def.factory !== 'custom' && !isFn(storage.CF[def.factory])) issues.push('factory missing: ' + def.factory);
    if (contract) {
      (def.requires || []).forEach(function (r) { if (!contract.roles[r]) issues.push('unknown required role: ' + r); });
      (def.bindings || []).forEach(function (b) { if (b.role && !contract.roles[b.role]) issues.push('unknown binding role: ' + b.role); });
    }
    return issues;
  }

  /** Merge a registry file. `o.pack` names the pack when the file has no packs block. Idempotent by component id:
      a later file replaces the definition but keeps its pack position. */
  CK.load = function (json, o) {
    o = o || {};
    if (Array.isArray(json)) json = { components: json, packs: o.pack ? { [o.pack]: json.map(function (c) { return c.id; }) } : {} };
    if (!json || !Array.isArray(json.components)) return { err: 'registry: components[] required' };
    var added = 0, replaced = 0, kept = 0, issues = [];
    var ids = [];
    json.components.forEach(function (def) {
      if (!def || !def.id) { issues.push('definition missing id'); return; }
      var v = validateDef(def);
      if (v.length) issues.push(def.id + ': ' + v.join(', '));
      if (defs[def.id]) {
        if (o.keep === true) { kept++; ids.push(def.id); return; }
        replaced++;
      } else added++;
      defs[def.id] = def;
      byName[low(def.name)] = def.id;
      ids.push(def.id);
    });
    var pks = json.packs || (o.pack ? { [o.pack]: ids } : {});
    Object.keys(pks).forEach(function (p) {
      var list = (packs[p] = packs[p] || []);
      (pks[p] || []).forEach(function (id) { if (list.indexOf(id) < 0 && defs[id]) list.push(id); });
    });
    loadedFiles.push(json.name || o.name || 'registry');
    return { file: json.name || null, added: added, replaced: replaced, kept: kept, total: Object.keys(defs).length,
      packs: Object.keys(packs), issues: issues };
  };

  CK.loadMany = function (files, o) {
    var out = [];
    (files || []).forEach(function (f) { out.push(CK.load(f, o)); });
    return out;
  };
  CK.def = function (id) {
    if (!id) return null;
    return defs[id] || defs[byName[low(id)]] || null;
  };
  CK.components = function (pack) {
    var ids = pack && packs[pack] ? packs[pack] : Object.keys(defs);
    return ids.map(CK.def).filter(Boolean);
  };
  CK.packs = function () { return Object.keys(packs).map(function (p) { return { name: p, components: packs[p].length }; }); };
  CK.inventory = function (o) {
    o = o || {};
    var list = CK.components(o.pack).map(function (d) {
      var master = isFn(storage.CF.get) ? storage.CF.get(d.name) : null;
      return { id: d.id, name: d.name, group: d.group, factory: d.factory, states: d.states || [],
        slots: d.slots || [], requires: d.requires || [], bindings: (d.bindings || []).length,
        master: !!master, page: d.page || null };
    });
    return { name: (o.pack ? o.pack : 'registry'), components: list.length,
      withMaster: list.filter(function (x) { return x.master; }).length, list: list };
  };
  CK.plan = function (pack) {
    return CK.components(pack).map(function (d) {
      return { id: d.id, name: d.name, factory: d.factory, defaults: d.defaults || {},
        states: d.states || [], requires: d.requires || [] };
    });
  };
  CK.extend = function (def) {
    var v = validateDef(def);
    if (v.length) return { ok: false, issues: v };
    defs[def.id] = def; byName[low(def.name)] = def.id;
    return { ok: true, id: def.id, total: Object.keys(defs).length };
  };

  // ------------------------------------------------------------------ props & names
  CK.resolveProps = function (def, props) {
    var out = {};
    Object.keys((def && def.defaults) || {}).forEach(function (k) {
      if (def.defaults[k] !== undefined) out[k] = def.defaults[k];
    });
    Object.keys(props || {}).forEach(function (k) {
      if (props[k] !== undefined) out[k] = props[k];
    });
    // `variant` is the taxonomy word for the `type` axis (Button's `variant: danger`), but a field's `variant`
    // (`outlined`/`filled`) is a material prop, not the type axis. Only alias when the definition has a `type` axis
    // and does not declare `variant` as its own prop.
    if (out.variant !== undefined && out.type === undefined && def.props && def.props.type && !def.props.variant) {
      out.type = out.variant;
    }
    if (out.state === undefined) out.state = 'default';
    return out;
  };

  CK.masterName = function (id, props) {
    var def = CK.def(id);
    if (!def) return null;
    props = props || CK.resolveProps(def, {});
    var defaults = def.defaults || {};
    var nameProps = {};
    var extras = [];
    ['type', 'size', 'state', 'tone', 'shape', 'selected', 'iconOnly', 'variant', 'slot'].forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (defaults[k] !== undefined && String(v) === String(defaults[k])) return;
      if (k === 'state' && v === 'default') return;
      if (k === 'selected' && v === true) { nameProps.slot = [nameProps.slot, 'Selected'].filter(Boolean).join('-'); return; }
      if (k === 'iconOnly' && v === true) { nameProps.slot = [nameProps.slot, 'IconOnly'].filter(Boolean).join('-'); return; }
      nameProps[k] = v;
    });
    // A content flag is a real variant axis even though `CF.name` has no key for it: without this, Checked and
    // Indeterminate checkboxes (or a dotted and a plain badge) would share one master name and overwrite each other.
    [['checked', 'Checked'], ['indeterminate', 'Indeterminate'], ['dot', 'Dot'], ['removable', 'Removable'],
     ['extended', 'Extended'], ['avatar', 'Avatar'], ['block', 'Block'], ['loading', 'Loading'], ['media', 'Media'],
     ['scrim', 'Scrim'], ['open', 'Open']].forEach(function (pair) {
      var k = pair[0], v = props[k];
      if (v === undefined || v === null) return;
      if (v === false) { if (defaults[k] === true) extras.push('No' + pair[1]); return; }
      if (defaults[k] !== undefined && String(v) === String(defaults[k])) return;
      if (v === 'indeterminate') extras.push('Indeterminate');
      else if (v === true) extras.push(pair[1]);
    });
    if (extras.length) nameProps.variant = [nameProps.variant].concat(extras).filter(Boolean).join('-');
    if (!Object.keys(nameProps).length) return def.name;
    try { return storage.CF.name(def.name, nameProps); } catch (e) { return def.name; }
  };

  // ------------------------------------------------------------------ part resolution
  function walk(root, fn, depth) {
    if (!root || (depth || 0) > 32) return;
    try { fn(root, depth || 0); } catch (e) {}
    var kids = [];
    try { kids = Array.from(root.children || []); } catch (e) {}
    for (var i = 0; i < kids.length; i++) walk(kids[i], fn, (depth || 0) + 1);
  }
  function isCopy(s) {
    try { return !!(s && s.isComponentCopyInstance && s.isComponentCopyInstance()); } catch (e) { return false; }
  }
  /** Descendants used by PART selection. A nested component copy is one opaque unit: its text/rings belong to that
      component, not to the composite around it (a Modal's footer Button labels must not be its body copy). A nested
      RAW board whose head is a known component family (`Button·Primary·MD` drawn by a factory before its master
      existed) is treated the same way, because it is just as much a control of its own. */
  function descendants(host) {
    var out = [];
    (function rec(node) {
      var kids = [];
      try { kids = Array.from(node.children || []); } catch (e) {}
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        out.push(k);
        if (!isCopy(k) && !isNestedFamily(k)) rec(k);
      }
    })(host);
    return out;
  }
  function isNestedFamily(node) {
    if (!node || node.type !== 'board') return false;
    var head = String(nameOf(node).split('·')[0] || '');
    if (!head) return false;
    return !!defs[head] || !!byName[low(head)];
  }
  function nameOf(s) { try { return nm(s.name); } catch (e) { return ''; } }
  function isText(s) { try { return s.type === 'text'; } catch (e) { return false; } }
  function textCandidates(host) {
    return descendants(host).filter(isText);
  }
  function pickText(list, mode) {
    if (!list.length) return [];
    var scored = list.slice();
    var size = function (s) { try { return parseFloat(s.fontSize) || 0; } catch (e) { return 0; } };
    var weight = function (s) { try { return parseFloat(s.fontWeight) || 0; } catch (e) { return 0; } };
    var width = function (s) { try { return Number(s.width) || 0; } catch (e) { return 0; } };
    var chars = function (s) { try { return String(s.characters || '').length; } catch (e) { return 0; } };
    scored.sort(function (a, b) {
      if (mode === 'widest') return (width(b) - width(a)) || (chars(b) - chars(a));
      // body copy is normally the LIGHTER text: a footer button label is 500 and the paragraph is 400, and both are
      // 14px, so a weight-descending tie-break picked the button (measured live on Modal 2026-11-02).
      if (mode === 'largest-rest') return (size(b) - size(a)) || (weight(a) - weight(b)) || (chars(b) - chars(a));
      return (size(b) - size(a)) || (weight(b) - weight(a)) || (chars(b) - chars(a));
    });
    if (mode === 'largest-rest') return scored.length > 1 ? [scored[1]] : [scored[0]];
    return [scored[0]];
  }
  CK.parts = function (host, def, part, props) {
    if (!host) return [];
    if (part === 'host') return [host];
    var spec = ((def && def.parts) || {})[part] || null;
    var all = descendants(host);
    if (part === 'text') return all.filter(isText);
    if (part === 'label') {
      var labels = all.filter(isText);
      var named = labels.filter(function (t) { return /label|button|tab|chip|badge/i.test(nameOf(t)); });
      return pickText(named.length ? named : labels, spec && spec.pick === 'first' ? 'first' : 'widest');
    }
    if (part === 'title') {
      if (spec && spec.match) {
        var mt = all.filter(function (s) { return new RegExp(spec.match, 'i').test(nameOf(s)); });
        if (mt.length) return [mt[0]];
      }
      return pickText(all.filter(isText), 'largest');
    }
    if (part === 'body') {
      if (spec && spec.match) {
        var mb = all.filter(function (s) { return new RegExp(spec.match, 'i').test(nameOf(s)); });
        if (mb.length) return [mb[0]];
      }
      return pickText(all.filter(isText), 'largest-rest');
    }
    if (part === 'field') {
      var exact = all.filter(function (s) { return /^field$/.test(nameOf(s)); });
      return exact.length ? exact : all.filter(function (s) { return /·field$|^field·/i.test(nameOf(s)); });
    }
    if (part === 'box') {
      var boxes = all.filter(function (s) { return /^box$/.test(nameOf(s)); });
      return boxes.length ? boxes : all.filter(function (s) { return /^(box|circle)·/i.test(nameOf(s)); });
    }
    if (part === 'track') {
      var tracks = all.filter(function (s) { return /^(track|meter·track)$/i.test(nameOf(s)); });
      return tracks.length ? tracks : all.filter(function (s) { return /track/i.test(nameOf(s)); });
    }
    if (part === 'handle') return all.filter(function (s) { return /^handle$/i.test(nameOf(s)); });
    if (part === 'inkBar') return all.filter(function (s) { return /^ink·bar$/i.test(nameOf(s)); });
    if (part === 'icon') {
      return all.filter(function (s) {
        var n = nameOf(s);
        return /^(glyph|icon|spinner)(·|$)/i.test(n) || (s.type === 'path' && /glyph|icon/i.test(n));
      });
    }
    if (part === 'ring') return all.filter(function (s) { return /^ring·/i.test(nameOf(s)); });
    if (part === 'plate') {
      var plates = all.filter(function (s) { return /^(plate|surface|panel|accent|scrim|cover)(·|$)/i.test(nameOf(s)); });
      return plates.length ? plates : all.filter(function (s) { return s.type === 'rect' || s.type === 'board'; }).slice(0, 1);
    }
    if (spec && spec.match) {
      var re = new RegExp(spec.match, 'i');
      var hits = all.filter(function (s) { return re.test(nameOf(s)); });
      if (spec.pick === 'first') return hits.slice(0, 1);
      return hits;
    }
    // A literal part name is also a selector: `ink·bar`, `field`, `track`.
    return all.filter(function (s) { return nameOf(s) === String(part); });
  };

  // ------------------------------------------------------------------ token coverage
  CK.coverage = function (host) {
    var out = { shapes: 0, fill: 0, stroke: 0, typography: 0, radius: 0, shadow: 0,
      unbound: { fill: [], stroke: [], typography: [], radius: [], shadow: [] } };
    if (!host) return out;
    walk(host, function (s) {
      out.shapes++;
      var t = {};
      try { t = s.tokens || {}; } catch (e) {}
      var fills = []; try { fills = Array.from(s.fills || []); } catch (e) {}
      var strokes = []; try { strokes = Array.from(s.strokes || []); } catch (e) {}
      var isDecorative = /^(hitpad·|sheen·|clip·|guide·)/.test(nameOf(s));
      if (fills.length && !isDecorative) {
        var f0 = fills[0];
        var alpha = f0 && f0.fillOpacity !== undefined ? Number(f0.fillOpacity) : 1;
        var skippable = !f0 || f0.fillImage || f0.fillColorGradient || fills.length > 1 || alpha < 1;
        if (!skippable) {
          if (t.fill) out.fill++; else out.unbound.fill.push({ name: nameOf(s), color: f0.fillColor });
        }
      }
      if (strokes.length) {
        var s0 = strokes[0];
        var sa = s0 && s0.strokeOpacity !== undefined ? Number(s0.strokeOpacity) : 1;
        if (s0 && !s0.strokeColorGradient && sa >= 1) {
          if (t.strokeColor) out.stroke++; else out.unbound.stroke.push({ name: nameOf(s), color: s0.strokeColor });
        }
      }
      if (isText(s)) {
        if (t.typography) out.typography++; else out.unbound.typography.push({ name: nameOf(s), text: nm(s.characters).slice(0, 32) });
      }
      var r = null; try { r = Number(s.borderRadius) || 0; } catch (e) { r = 0; }
      if (r > 0 && !isDecorative) {
        // Penpot stores a borderRadius token on the four corner properties, not on the scalar `borderRadius`.
        var rBound = !!(t.borderRadius || t.borderRadiusTopLeft || t.borderRadiusTopRight ||
          t.borderRadiusBottomRight || t.borderRadiusBottomLeft);
        if (rBound) out.radius++; else out.unbound.radius.push({ name: nameOf(s), radius: r });
      }
      var sh = []; try { sh = Array.from(s.shadows || []); } catch (e) {}
      if (sh.length) {
        if (t.shadow) out.shadow++; else out.unbound.shadow.push({ name: nameOf(s), layers: sh.length });
      }
    });
    out.total = out.fill + out.stroke + out.typography + out.radius + out.shadow;
    out.unboundTotal = out.unbound.fill.length + out.unbound.stroke.length + out.unbound.typography.length +
      out.unbound.radius.length + out.unbound.shadow.length;
    // A shadow is a project-declared material, not a universal token surface; it is reported but does not by itself
    // fail a build. `CK.audit` publishes `unbound.shadow` separately.
    out.ok = out.unbound.fill.length + out.unbound.stroke.length + out.unbound.typography.length + out.unbound.radius.length === 0;
    return out;
  };

  // ------------------------------------------------------------------ bind
  function whenMatch(when, props) {
    if (!when || !Object.keys(when).length) return true;
    var keys = Object.keys(when);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], want = when[k];
      var got = props[k];
      var list = Array.isArray(want) ? want : [want];
      var hit = list.some(function (v) {
        if (v === null) return got === null || got === undefined;
        if (typeof v === 'boolean') return !!got === v;
        return String(got) === String(v);
      });
      if (!hit) return false;
    }
    return true;
  }

  CK.applyBinding = async function (host, def, binding, props) {
    if (!whenMatch(binding.when, props)) return { skipped: true, reason: 'when', binding: binding };
    var shapes = CK.parts(host, def, binding.part, props);
    if (!shapes.length) return { ok: false, missingPart: binding.part, binding: binding };
    // A token fill/stroke owns a SINGLE base paint. A state cell (base + 8% overlay), a gradient, an image or an
    // alpha paint is not a token surface: applying a token would replace the state material. Skip those shapes and
    // let TK.bindBoard's value pass decide (it skips them too), so a hover cell keeps its lift.
    if (binding.prop === 'fill') {
      shapes = shapes.filter(function (s) {
        var f = []; try { f = Array.from(s.fills || []); } catch (e) {}
        if (f.length !== 1) return false;
        var p = f[0];
        if (!p || p.fillImage || p.fillColorGradient) return false;
        return p.fillOpacity === undefined || Number(p.fillOpacity) >= 1;
      });
    } else if (binding.prop === 'strokeColor') {
      shapes = shapes.filter(function (s) {
        var st = []; try { st = Array.from(s.strokes || []); } catch (e) {}
        if (st.length !== 1) return false;
        var p = st[0];
        return p && !p.strokeColorGradient && (p.strokeOpacity === undefined || Number(p.strokeOpacity) >= 1);
      });
    }
    if (!shapes.length) return { skipped: true, reason: 'multi-fill/gradient/alpha', binding: binding };
    var role = CK.roleToken(binding.role);
    if (!role.record) {
      if (binding.optional) return { skipped: true, reason: 'missing role', role: binding.role, binding: binding };
      return { ok: false, missingRole: binding.role, binding: binding, err: role.err };
    }
    // MEASURED 2026-11-02: applying the SAME token to a shape that is already bound to it CLEARS the binding
    // (applyToShapes toggles the token off; a different token rebinds). Never re-apply a satisfied role.
    var same = function (shape) {
      var tk = {}; try { tk = shape.tokens || {}; } catch (e) {}
      if (binding.prop === 'borderRadius') {
        var corners = storage.TK.CORNER_PROPS || ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'];
        return tk.borderRadius === role.token || corners.every(function (k) { return tk[k] === role.token; });
      }
      if (binding.prop === 'strokeWidth') return tk.strokeWidth === role.token;
      return tk[binding.prop] === role.token;
    };
    var already = shapes.filter(same);
    if (already.length === shapes.length) return { ok: true, already: already.length, role: binding.role, token: role.token, prop: binding.prop, n: 0, binding: binding };
    shapes = shapes.filter(function (s) { return !same(s); });
    var res = null;
    // A borderRadius token owns the four corner props; the token API rejects the scalar name.
    var propsList = binding.prop === 'borderRadius'
      ? (storage.TK.CORNER_PROPS || ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'])
      : [binding.prop];
    try { res = await storage.TK.apply(role.token, shapes, propsList); }
    catch (e) { res = { ok: false, err: String(e && e.message || e) }; }
    return { ok: !!(res && res.ok), already: already.length, role: binding.role, token: role.token, prop: binding.prop,
      n: shapes.length, api: res, binding: binding };
  };

  /** Bind semantic roles first, then let TK bind every remaining raw value that a declared token names. The second
      pass is what makes a factory-built component token-driven; the first pass is what makes its FOREGROUND role
      semantic (a primary button is brand even if its hex is duplicated by another token). */
  CK.bind = async function (host, def, props, o) {
    o = o || {};
    props = props || CK.resolveProps(def, {});
    var applied = [], skipped = [], failed = [], missing = [];
    var scope = (def && def.id) || (def && def.name) || '?';
    var list = (def && def.bindings) || [];
    for (var i = 0; i < list.length; i++) {
      var r = null;
      try { r = await CK.applyBinding(host, def, list[i], props); }
      catch (e) { r = { ok: false, err: String(e && e.message || e) , binding: list[i] }; }
      if (r && r.ok) applied.push(r);
      else if (r && r.skipped) skipped.push(r);
      else if (r && r.missingPart) missing.push({ part: r.missingPart, role: list[i].role });
      else failed.push(r);
    }
    var value = null;
    if (o.valueBind !== false && storage.TK && storage.TK.bindBoard) {
      try { value = await storage.TK.bindBoard(host, {}); }
      catch (e) { value = { err: String(e && e.message || e) }; }
    }
    if (storage.EL && storage.EL.bindStamped && o.elBind !== false) {
      try { await storage.EL.bindStamped(host); } catch (e) {}
    }
    var coverage = CK.coverage(host);
    return { scope: scope, applied: applied.length, skipped: skipped.length, failed: failed, missingParts: missing,
      valueBind: value, coverage: coverage, ok: coverage.ok && failed.length === 0 };
  };

  // ------------------------------------------------------------------ build / master / instance
  function anatomyBuild(def, o) {
    var LM = storage.LM;
    if (!LM || !isFn(LM.anatomyBoard)) return null;
    var entry = { designFamily: def.name, name: def.name, factory: def.factory || 'custom', kind: def.kind || 'visual',
      parts: def.parts || [], states: def.states || [], group: def.group || null, page: def.page || null };
    return LM.anatomyBoard(entry, { parent: o.parent, x: o.x, y: o.y, w: o.w, register: false });
  }

  CK.build = async function (id, props, o) {
    o = o || {};
    var def = CK.def(id);
    if (!def) return { err: 'unknown component: ' + id };
    var p = CK.resolveProps(def, props);
    if (def.renderer === 'none' || def.kind === 'nonVisual') return { err: 'component is behaviour-only: ' + def.id };
    if (isFn(storage.CF.adoptPalette) && o.adopt !== false) { try { storage.CF.adoptPalette(); } catch (e) {} }

    var host = null, mode = 'factory';
    if (!def.factory || def.factory === 'custom') {
      var an = await anatomyBuild(def, o);
      if (!an) return { err: 'custom component needs storage.LM.anatomyBoard (seed library/anatomy engines)' };
      if (an.err) return { err: 'anatomy ' + def.id + ': ' + an.err };
      host = an.board || an.host || an;
      if (!host) return { err: 'anatomy ' + def.id + ' returned no board' };
      mode = 'anatomy';
    } else {
      var fn = storage.CF[def.factory];
      if (!isFn(fn)) return { err: 'missing factory: ' + def.factory };
      var args = {};
      Object.keys(p).forEach(function (k) { if (p[k] !== undefined) args[k] = p[k]; });
      if (o.args) Object.keys(o.args).forEach(function (k) { args[k] = o.args[k]; });
      if (o.x !== undefined) args.x = o.x;
      if (o.y !== undefined) args.y = o.y;
      if (o.parent !== undefined) args.parent = o.parent;
      if (o.w !== undefined) args.w = o.w;
      if (o.h !== undefined) args.h = o.h;
      if (o.text !== undefined && args.label === undefined) args.label = o.text;
      try { host = await fn(args); }
      catch (e) { return { err: 'factory ' + def.factory + ' failed: ' + String(e && e.message || e).slice(0, 200) }; }
      if (!host) return { err: 'factory ' + def.factory + ' returned nothing' };
      if (host.err) return { err: host.err };
    }

    var bind = null;
    if (o.bind !== false) bind = await CK.bind(host, def, p, o.bindOptions || {});
    var name = CK.masterName(def.id, p);
    var result = { ok: !bind || bind.ok !== false, id: def.id, name: name, host: host, props: p, mode: mode, bind: bind };
    if (o.register) {
      var reg = CK.registerHost(host, name, def);
      result.register = reg;
      result.ok = result.ok && !!reg.ok;
    }
    return result;
  };

  /** Register an already-built host, reusing an existing component of the same name. A duplicate definition then
      returns the existing record instead of failing the whole build. */
  CK.registerHost = function (host, name, def) {
    if (!host) return { ok: false, err: 'no host' };
    var existing = isFn(storage.CF.get) ? storage.CF.get(name) : null;
    if (existing) {
      try { if (storage.removeTree) storage.removeTree(host); else host.remove(); } catch (e) {}
      return { ok: true, name: name, reused: true, comp: existing };
    }
    var r = storage.CF.component(host, name);
    return { ok: !!(r && r.ok !== false && !r.err), name: name, reused: false, comp: r && r.comp, result: r };
  };

  CK.master = async function (id, props, o) {
    o = o || {};
    var def = CK.def(id);
    if (!def) return { err: 'unknown component: ' + id };
    var p = CK.resolveProps(def, props);
    var name = CK.masterName(def.id, p);
    var existing = isFn(storage.CF.get) ? storage.CF.get(name) : null;
    if (existing && o.ifExists !== 'replace') return { ok: true, id: def.id, name: name, reused: true, comp: existing };
    var b = await CK.build(def.id, p, Object.assign({}, o, { register: false }));
    if (b.err) return b;
    var reg = CK.registerHost(b.host, name, def);
    return { ok: !!reg.ok, id: def.id, name: name, reused: false, comp: reg.comp, build: b, register: reg };
  };

  CK.instance = async function (id, props, o) {
    o = o || {};
    var def = CK.def(id);
    if (!def) return { err: 'unknown component: ' + id };
    var p = CK.resolveProps(def, props);
    var want = CK.masterName(def.id, p);
    var name = want, fallback = false;
    if (!isFn(storage.CF.get) || !storage.CF.get(name)) {
      if (o.ensure) {
        var m = await CK.master(def.id, p, {});
        if (m.err) return m;
      }
      if (!storage.CF.get(name)) {
        if (storage.CF.get(def.name)) { name = def.name; fallback = true; }
        else return { err: 'no master "' + want + '" — build CK.master("' + def.id + '") first' };
      }
    }
    var place = storage.CF.instance(name, o);
    if (place && place.err) return place;
    var inst = place && (place.inst || place);
    if (o.text !== undefined && inst) {
      try {
        var kids = Array.from(inst.children || []);
        for (var i = 0; i < kids.length; i++) if (kids[i].type === 'text') { kids[i].characters = String(o.text); break; }
      } catch (e) {}
    }
    return { ok: true, id: def.id, inst: inst, name: name, fallback: fallback, props: p };
  };

  // ------------------------------------------------------------------ pack builder
  /** Build + register a pack in a deterministic grid. Resumable: call again with the returned `next` until done.
      Default limit 6 because createComponent is one platform call per master and execute_code has a ~30 s ceiling. */
  CK.buildPack = async function (pack, o) {
    o = o || {};
    var list = CK.components(pack);
    if (!list.length) return { err: 'no pack named ' + pack };
    var start = Math.max(0, Number(o.start) || 0);
    var limit = Math.max(1, Math.min(12, Number(o.limit) || 6));
    var cols = Math.max(1, Number(o.columns) || 3);
    var cellW = Number(o.cellW) || 520, cellH = Number(o.cellH) || 260;
    var gapX = Number(o.gapX) || 40, gapY = Number(o.gapY) || 40;
    var x0 = Number(o.x) || 80, y0 = Number(o.y) || 80;
    var built = [], failed = [];
    var end = Math.min(list.length, start + limit);
    for (var i = start; i < end; i++) {
      var def = list[i];
      var col = i % cols, row = Math.floor(i / cols);
      var x = x0 + col * (cellW + gapX), y = y0 + row * (cellH + gapY);
      var r = null;
      try { r = await CK.master(def.id, {}, { x: x, y: y, parent: o.parent, adopt: o.adopt }); }
      catch (e) { r = { err: String(e && e.message || e) }; }
      if (r && !r.err) built.push({ id: def.id, name: r.name, reused: r.reused, x: x, y: y });
      else failed.push({ id: def.id, err: (r && r.err) || 'failed' });
    }
    return { pack: pack, total: list.length, built: built, failed: failed,
      done: end >= list.length, next: end < list.length ? end : null, library: storage.CF.libraryCount() };
  };

  // ------------------------------------------------------------------ spec matrix
  CK.matrix = async function (id, o) {
    o = o || {};
    var def = CK.def(id);
    if (!def) return { err: 'unknown component: ' + id };
    if (!def.factory || def.factory === 'custom' || def.renderer === 'none' || def.kind === 'nonVisual') {
      return { err: 'no factory variant matrix for ' + def.id + ' (custom/non-visual); use CK.build/describe' };
    }
    if (!isFn(storage.CF.matrix)) return { err: 'CF.matrix unavailable' };
    var spec = (storage.CF.SPEC && storage.CF.SPEC[def.name]) || null;
    var rows = o.rows || (spec ? spec.map(function (r) {
      return { label: r.label, factory: def.factory, props: Object.assign({}, def.defaults || {}, r.props || {}), cells: r.cells,
        cellsByAxis: r.cellsByAxis, note: r.note };
    }) : [{ label: def.name, factory: def.factory, props: Object.assign({}, def.defaults || {}) }]);
    var axes = o.axes || def.states || ['default'];
    var board = null;
    try {
      board = await storage.CF.matrix({ family: def.name, rows: rows, axes: axes,
        specName: o.specName || (def.name + '·Spec'), title: o.title || (def.name + ' · variants × states'),
        subtitle: o.subtitle || ('factory: ' + def.factory + ' · states: ' + axes.join('/')),
        parent: o.parent, x: o.x, y: o.y, maxCells: o.maxCells || 20 });
    } catch (e) { return { err: 'CF.matrix: ' + String(e && e.message || e) }; }
    if (!board || board.err) return { err: (board && board.err) || 'matrix returned nothing' };
    var bind = null;
    if (o.bind !== false && storage.TK && storage.TK.bindBoard) {
      try { bind = await storage.TK.bindBoard(board, { self: true }); } catch (e) {}
    }
    return { ok: true, id: def.id, board: board, rows: rows.length, axes: axes, bind: bind };
  };

  /** Re-apply role + value bindings to already-built base masters after a token value change. Resumable, because
      each binding is an async platform call. A master built with non-default props has its own name; this pass only
      touches the base head, whose props are the definition defaults. */
  CK.rebind = async function (pack, o) {
    o = o || {};
    var list = CK.components(pack);
    var start = Math.max(0, Number(o.start) || 0);
    var limit = Math.max(1, Math.min(12, Number(o.limit) || 4));
    var end = Math.min(list.length, start + limit);
    var out = [], skipped = [];
    for (var i = start; i < end; i++) {
      var def = list[i];
      var rec = isFn(storage.CF.get) ? storage.CF.get(def.name) : null;
      var main = null;
      try { main = rec && rec.mainInstance ? rec.mainInstance() : null; } catch (e) {}
      if (!main) { skipped.push(def.id); continue; }
      var b = await CK.bind(main, def, CK.resolveProps(def, {}), { valueBind: o.valueBind !== false, elBind: o.elBind !== false });
      out.push({ id: def.id, applied: b.applied, skipped: b.skipped, failed: b.failed.length,
        unbound: b.coverage.unboundTotal, ok: b.ok });
    }
    return { pack: pack, rebound: out, skipped: skipped, done: end >= list.length,
      next: end < list.length ? end : null, total: list.length };
  };

  // ------------------------------------------------------------------ theme proof
  function masterShapes() {
    var shapes = [];
    var seen = {};
    Object.keys(defs).forEach(function (id) {
      var def = defs[id];
      var rec = isFn(storage.CF.get) ? storage.CF.get(def.name) : null;
      if (!rec) return;
      var main = null;
      try { main = rec.mainInstance ? rec.mainInstance() : null; } catch (e) {}
      if (!main) return;
      walk(main, function (s) { if (!seen[s.id]) { seen[s.id] = 1; shapes.push(s); } });
      if (!seen[main.id]) { seen[main.id] = 1; shapes.push(main); }
    });
    return shapes;
  }

  /** Switch a token theme and prove that the master paint changed. `changed === 0` means the components are not
      token-bound (or the theme does not override the roles they use) — it is a finding, not a pass. */
  CK.theme = async function (group, name, o) {
    o = o || {};
    if (!storage.TK || !storage.TK.activateTheme) return { err: 'TK.activateTheme unavailable' };
    var shapes = o.shapes || masterShapes();
    if (!shapes.length) return { err: 'no masters to prove; build a pack first' };
    var before = storage.TK.paint(shapes);
    var sw = storage.TK.activateTheme(group, name);
    if (sw && sw.err) return { err: sw.err };
    await sleep(o.settle || 700);
    var diff = storage.TK.changed(before, shapes);
    return { ok: diff.changed > 0, theme: group + '/' + name, activeSets: sw.activeSetsNow,
      shapes: shapes.length, changed: diff.changed, rows: diff.rows.slice(0, 20),
      verdict: diff.changed > 0 ? 'PAINT_CHANGED' : 'NO_PAINT_CHANGE' };
  };

  // ------------------------------------------------------------------ audit
  CK.audit = function (o) {
    o = o || {};
    var pack = o.pack || 'core';
    var list = CK.components(pack);
    var defIssues = [], missingMasters = [], unresolvedRoles = [], coverage = [],
      unbound = { fill: 0, stroke: 0, typography: 0, radius: 0, shadow: 0 };
    list.forEach(function (def) {
      var issues = validateDef(def);
      if (issues.length) defIssues.push({ id: def.id, issues: issues });
      (def.requires || []).forEach(function (role) {
        var r = CK.roleToken(role);
        if (!r.record) unresolvedRoles.push({ id: def.id, role: role, err: r.err || null });
      });
      if (def.renderer === 'none' || def.kind === 'nonVisual') return;
      var rec = isFn(storage.CF.get) ? storage.CF.get(def.name) : null;
      if (!rec) { missingMasters.push({ id: def.id, expected: def.name }); return; }
      var main = null;
      try { main = rec.mainInstance ? rec.mainInstance() : null; } catch (e) {}
      var cov = main ? CK.coverage(main) : { shapes: 0, total: 0, unboundTotal: 0, ok: false,
        unbound: { fill: [], stroke: [], typography: [], radius: [], shadow: [] } };
      coverage.push({ id: def.id, name: def.name, master: true, shapes: cov.shapes,
        bound: cov.total, unbound: cov.unboundTotal, ok: cov.ok });
      Object.keys(unbound).forEach(function (k) { unbound[k] += cov.unbound[k].length; });
    });
    var ctr = CK.contract();
    var rolesOk = ctr.requiredMissing ? ctr.requiredMissing.length === 0 : true;
    var mastersOk = missingMasters.length === 0;
    var bindsOk = unbound.fill + unbound.stroke + unbound.typography + unbound.radius === 0;
    var rolesResolvedOk = unresolvedRoles.length === 0;
    var verdict = (defIssues.length || !rolesOk || !rolesResolvedOk || !mastersOk || !bindsOk) ? 'NEEDS_REPAIR' : 'CLEAN';
    return { pack: pack, components: list.length, masters: coverage.length, missingMasters: missingMasters,
      defIssues: defIssues, contract: ctr, unresolvedRoles: unresolvedRoles, unbound: unbound, coverage: coverage,
      verdict: verdict,
      hint: verdict === 'CLEAN' ? 'component registry, token roles and masters are consistent'
        : [defIssues.length ? 'definition issues: ' + defIssues.length : null,
           !rolesOk ? 'required roles missing: ' + ctr.requiredMissing.map(function (r) { return r.role; }).join(', ') : null,
           !rolesResolvedOk ? 'component roles missing: ' + unresolvedRoles.slice(0, 8).map(function (r) { return r.id + '→' + r.role; }).join(', ') : null,
           missingMasters.length ? 'missing masters: ' + missingMasters.map(function (m) { return m.id; }).join(', ') : null,
           !bindsOk ? 'unbound paint remains (build or bind the component; gradients/state overlays are exempt)' : null
          ].filter(Boolean).join('; ') };
  };

  CK.describe = function (id) {
    var def = CK.def(id);
    if (!def) return { err: 'unknown component: ' + id };
    var roles = (def.requires || []).map(function (r) { var x = CK.roleToken(r); return { role: r, ok: !!x.record, token: x.token || null, err: x.err || null }; });
    var master = isFn(storage.CF.get) ? storage.CF.get(def.name) : null;
    return { def: def, roles: roles, master: !!master,
      variants: (function () { try { return (penpot.library.local.components || []).map(function (c) { return c.name; }).filter(function (n) { return n === def.name || n.indexOf(def.name + '·') === 0; }); } catch (e) { return []; } })() };
  };

  CK._state = function () { return { defs: Object.keys(defs).length, packs: packs, hasContract: !!contract, loadedFiles: loadedFiles.slice() }; };

  return { seeded: 'CK', version: CK.VERSION, components: Object.keys(defs).length,
    fns: ['loadContract', 'contract', 'roleToken', 'load', 'loadMany', 'def', 'components', 'packs', 'inventory', 'plan',
      'extend', 'resolveProps', 'masterName', 'parts', 'coverage', 'applyBinding', 'bind', 'build', 'registerHost',
      'master', 'instance', 'buildPack', 'matrix', 'rebind', 'theme', 'audit', 'describe'] };
})();
