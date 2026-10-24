/* ============================================================================
   elevation_engine.js — the ELEVATION / PHYSICALITY channel  (storage.EL)

   WHY THIS FILE EXISTS
   --------------------
   A design system's "physical" look is not one shadow: the source sites this
   skill recreates stack a DROP ladder (2–6 layers) with an INSET pair (a dark
   bottom lip + a white top highlight) and often a radial sheen. Measured
   2026-10-23 on the reference: every card is
       drop 0 7.77 16 .0588 + 0 3 3 .102
       inner 0 -8 0 .051 + 0 4 0 rgba(255,255,255,.6)
   and every dark control adds 6 more drop layers on hover (2.77→100px).

   The old component factory had `CF.shadow(level)` = ONE generic drop shadow
   from its own ELEV table; tokens dropped the inset pair; nothing applied
   elevation to a screen; and no audit rule measured any of it. Result measured
   2026-10-23: 3020 shapes in the file, 49 with a shadow, all SINGLE-layer,
   0 inset, 0 token-bound, 0 on the screen page. Penpot renders all of it
   (proved by export: 2 drop + 2 inner + a radial gradient on a probe board),
   so this was an engine gap, not a Penpot limit.

   WHAT THIS ENGINE OWNS
   ---------------------
   1. RECIPES  — the data: drop[] + inner[] + optional sheen{}, read from the
      DESIGN.md `elevation:` block. A recipe is the ONLY place a shadow value
      is written; per-layer values never appear at a call site.
   2. TOKENS   — one `shadow.<recipe>` token per recipe (multi-layer, insets
      included), seeded through TK (idempotent replace), then applied to the
      shape so `tokens.shadow` is set. A shadow without a binding is a typed
      shadow, which audit rule 50 (`shadow_unbound`) rejects.
   3. ROLES    — family → {base, hover, pressed}; this is what makes hover a
      LIFT instead of an 8% tint. `CF.shadow(level)` delegates here, so every
      factory-built control uses the design's own stack.
   4. SURFACES — a card/nav/panel PLATE under a region host (`surface·…`),
      derived from the host box, token-filled, elevated and sheened. A screen
      with textureless regions is how 0 shadows happened: a flat region has
      nothing to cast one.
   5. REPAIR   — `sweepPage` re-applies recipes to every name that carries a
      family role or a `plate·eN`/`segment·active` duty; `surfacePass` mounts
      the missing plates. Both are idempotent (same recipe → no write).
   6. PROOF    — `audit()` returns stamps / shadowed / inner / bound / sheen,
      and every applied shape carries the durable `nl:el=<recipe>` stamp, so
      audit rule 51 (`elevation_flat`) can re-read the contract from the file.

   MEASURED PENPOT FACTS (2026-10-23, probe board on Page 1, exported)
   -------------------------------------------------------------------
   · `shape.shadows` accepts an array mixing `drop-shadow` and `inner-shadow`;
     4 layers (2+2) round-trip and render (the card's bottom lip and the dark
     button's top highlight are visible in the export).
   · `token.applyToShapes([shape], ['shadow'])` accepts a MULTI-layer token and
     writes it; the token value is an array of
     `{offsetX, offsetY, blur, spread, color:'#RRGGBBAA', inset}`.
   · Shadow `color` must be `{color, opacity}`; a string is silently black.
   · A gradient fill needs NORMALISED coords (0..1) and NO `fillColor` in the
     same fill object: `{fillColorGradient:{type:'radial',startX:.28,…}}`.
     Mixing `fillColor` + gradient throws `Value not valid … :fills`.
   · An inset shadow's blur should stay 0 for a hard lip (`-8px 0` in CSS is a
     band, not a glow); the source's own `0 4px 0` is a hard highlight.

   USAGE (after the G1 seed order; needs storage.TK + storage.CF)
   --------------------------------------------------------------
     EL.seed({ set:'Reference · Core', recipes:{card:{drop:[…],inner:[…]}}, roles:{…} })
     await EL.sweepPage({ page:'03 · Actions', apply:true })
     EL.surface(parent, { name:'surface·nav', role:'nav', fill:'color.surface', radius:'full' })
     EL.audit()
   ========================================================================== */
(function (storage, penpot, penpotUtils) {
  'use strict';
  var EL = storage.EL = storage.EL || {};
  EL.VERSION = '1.0.0';
  EL.recipes = EL.recipes || {};
  EL.roles = EL.roles || {};
  EL.spec = EL.spec || null;
  EL.seeded = false;

  var DEFAULT_SET = null;
  function TK() { return storage.TK; }
  function CF() { return storage.CF; }
  function nap(ms) { return new Promise(function (r) { setTimeout(r, ms || 120); }); }
  function nm(s) { try { return String(s.name || ''); } catch (e) { return ''; } }
  function kids(s) { try { return Array.from(s.children || []); } catch (e) { return []; } }
  function num(s, k, d) { var v = Number(s && s[k]); return isFinite(v) ? v : d; }
  // Accepts a live shape (`width`/`height`) OR a plain `{x,y,w,h}` box. The old reader only knew the shape form,
  // so a `{w,h}` box read 0×0 and a sheen stayed at Penpot's 100×100 default (measured on every Button master).
  function box(s) { return { x: num(s, 'x', 0), y: num(s, 'y', 0), w: num(s, 'width', num(s, 'w', 0)), h: num(s, 'height', num(s, 'h', 0)) }; }

  // ---------------------------------------------------------------- colour / layer plumbing
  function baseHex(c) {
    var h = String(c || '#000000').trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(h)) return h;
    if (/^#[0-9A-F]{3}$/.test(h)) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    if (h === 'WHITE') return '#FFFFFF';
    if (h === 'BLACK') return '#000000';
    return '#000000';
  }
  function alpha(o) {
    var a = Math.max(0, Math.min(1, Number(o) === undefined || isNaN(Number(o)) ? 1 : Number(o)));
    var v = Math.round(a * 255).toString(16).toUpperCase();
    return v.length < 2 ? '0' + v : v;
  }
  function hex8(c, o) { return baseHex(c) + alpha(o); }
  /** Resolve a radius role/key/`radius.x` name to the LIVE token value, so a surface takes `radius.xl` = 32 in a
      file whose ladder is 8/12/16/24/32/40 and never falls through `CF.radius`'s default ladder (where `xl` is
      unknown and a NaN silently became 0 — measured 2026-10-23). */
  function radiusOf(key) {
    var out = { value: null, token: null };
    if (key === null || key === undefined) return out;
    if (typeof key === 'number') { out.value = key; return out; }
    var tk = TK(), d = null;
    try { d = tk && tk.declared ? tk.declared() : null; } catch (e) { d = null; }
    var want = String(key);
    if (want.indexOf('radius.') !== 0) want = 'radius.' + want;
    var list = (d && d.radii) || [];
    var hit = list.filter(function (r) { return r.name === want; })[0];
    if (hit) { out.value = hit.value; out.token = hit.name; return out; }
    if (CF() && CF().radius) out.value = CF().radius(key);
    return out;
  }
  function layer(l, kind) {
    l = l || {};
    return {
      style: kind === 'inner' ? 'inner-shadow' : 'drop-shadow',
      offsetX: num(l, 'x', num(l, 'offsetX', 0)),
      offsetY: num(l, 'y', num(l, 'offsetY', 0)),
      blur: num(l, 'blur', 0),
      spread: num(l, 'spread', 0),
      color: { color: baseHex(l.color || l.c || '#000000'), opacity: l.opacity === undefined ? num(l, 'o', 0.1) : Number(l.opacity) },
      kind: kind || 'drop'
    };
  }
  function normRecipe(name, r) {
    r = r || {};
    var drop = (r.drop || []).map(function (l) { return layer(l, 'drop'); });
    var inner = (r.inner || r.inset || []).map(function (l) { return layer(l, 'inner'); });
    var sheen = null;
    if (r.sheen === true) sheen = { opacity: 0.2, width: 0.62, cx: 0.28, cy: -0.10 };
    else if (r.sheen && typeof r.sheen === 'object') sheen = {
      opacity: r.sheen.opacity === undefined ? 0.2 : Number(r.sheen.opacity),
      width: r.sheen.width === undefined ? 0.62 : Number(r.sheen.width),
      cx: r.sheen.cx === undefined ? 0.28 : Number(r.sheen.cx),
      cy: r.sheen.cy === undefined ? -0.10 : Number(r.sheen.cy)
    };
    return { name: name, drop: drop, inner: inner, sheen: sheen, layers: drop.concat(inner) };
  }
  function tokenValue(rec) {
    return rec.layers.map(function (l) {
      return {
        offsetX: String(l.offsetX), offsetY: String(l.offsetY), blur: String(l.blur), spread: String(l.spread),
        color: hex8(l.color && l.color.color, l.color && l.color.opacity),
        inset: l.style === 'inner-shadow'
      };
    });
  }
  function cloneShadows(rec) {
    return rec.layers.map(function (l) {
      return {
        style: l.style, offsetX: l.offsetX, offsetY: l.offsetY, blur: l.blur, spread: l.spread,
        color: { color: l.color.color, opacity: l.color.opacity }
      };
    });
  }

  // ---------------------------------------------------------------- seed
  /** `o.recipes` = { name:{drop:[{x,y,blur,spread,color,opacity}], inner:[…], sheen:{…}|true} }
      `o.roles`   = { Button:{base:'control', hover:'controlHover', pressed:'controlPressed', types:['primary'], sheen:true}, … }
      `o.set`     = the active token set (defaults to the first active set).
      Idempotent: a recipe whose token value is unchanged is kept. */
  EL.seed = function (o) {
    o = o || {};
    var tk = TK();
    if (!tk || !tk.put) return { err: 'TK is not seeded — seed token_engine.js first' };
    var set = o.set || (tk.activeSets && tk.activeSets()[0]) || DEFAULT_SET;
    if (!set) return { err: 'no active token set to hold shadow tokens' };
    DEFAULT_SET = set;
    EL.spec = o;
    EL.recipes = {};
    var log = [], errors = [];
    Object.keys(o.recipes || {}).forEach(function (k) {
      var rec = normRecipe(k, o.recipes[k]);
      if (!rec.layers.length) { errors.push(k + ': no layers'); return; }
      EL.recipes[k] = rec;
      var r = tk.put(set, 'shadow', 'shadow.' + k, tokenValue(rec));
      log.push(r);
      if (r && r.err) errors.push('shadow.' + k + ': ' + r.err);
    });
    EL.roles = o.roles || {};
    EL.seeded = Object.keys(EL.recipes).length > 0;
    // verify the tokens actually exist and carry the same layer count; a seed that "looked ok" but
    // silently kept an old 1-layer token is the defect this engine replaced.
    var check = [];
    Object.keys(EL.recipes).forEach(function (k) {
      var t = (tk.find && tk.find('shadow.' + k)) || null;
      var v = null;
      try { v = t && (t.value || t.resolvedValue); } catch (e) {}
      var n = Array.isArray(v) ? v.length : 0;
      check.push({ token: 'shadow.' + k, layers: n, want: EL.recipes[k].layers.length, ok: n === EL.recipes[k].layers.length });
      if (n !== EL.recipes[k].layers.length) errors.push('shadow.' + k + ': token has ' + n + ' layer(s), recipe wants ' + EL.recipes[k].layers.length);
    });
    return { seeded: EL.seeded, set: set, recipes: Object.keys(EL.recipes), roles: Object.keys(EL.roles), tokens: check, log: log, errors: errors };
  };

  EL.recipe = function (name) { return EL.recipes[String(name)] || null; };
  EL.shadow = function (name) {
    if (name === undefined || name === null) return [];
    var key = String(name);
    if (!EL.recipes[key] && /^\d+$/.test(key)) {
      var lv = Number(key);
      key = lv === 1 ? 'e1' : lv === 2 ? 'e2' : lv === 3 ? 'e3' : lv === 4 ? 'e3' : 'e3';
    }
    var rec = EL.recipes[key];
    return rec ? cloneShadows(rec) : [];
  };
  EL.has = function (name) { return !!EL.recipes[String(name)]; };
  /** Family lookup is case-insensitive: the library spells it `FAB`, the role table `Fab`, and a case mismatch
      silently skipped 15 FAB state boards (measured 2026-10-23). */
  function roleDef(family) {
    var f = String(family || '');
    if (EL.roles[f]) return EL.roles[f];
    var lf = f.toLowerCase();
    var keys = Object.keys(EL.roles);
    for (var i = 0; i < keys.length; i++) if (keys[i].toLowerCase() === lf) return EL.roles[keys[i]];
    return null;
  }
  EL.role = function (family, state) {
    var r = roleDef(family);
    if (!r) return null;
    if (state && r[state]) return r[state];
    return r.base || null;
  };
  /** The recipe a family host should carry for a state. Parses `Button·Primary·MD·Hover`:
      family=Button, type=Primary, state=Hover. `types` in the role restricts which variants carry elevation
      (a Ghost/Text button is not a floating object, so it must not inherit the primary's control stack). */
  EL.roleFor = function (fullName, family) {
    var name = String(fullName || '');
    var segs = name.split('·');
    var fam = family || segs[0];
    var def = roleDef(fam);
    if (!def) return null;
    var state = null;
    if (/·Hover(·|$)/.test(name)) state = 'hover';
    else if (/·Pressed(·|$)/.test(name)) state = 'pressed';
    // Disabled is a NEUTRAL state: the control keeps its physical stack (the fill alpha makes it recede). A
    // disabled board with a stale hand-drawn shadow was the last `shadow_unbound` on page 03.
    var types = def.types;
    // The TYPE segment is parsed for `byType` even when the role has no allow-list: `IconButton·Primary` needs the
    // brandTile material while `IconButton·Ink` keeps the control stack. `Button·MD` has NO type segment — the second
    // segment is a SIZE — so a missing type resolves to `default`.
    var SIZES = { xs: 1, sm: 1, md: 1, lg: 1, xl: 1, '2xl': 1 };
    var NEUTRAL = { focus: 1, selected: 1, loading: 1, open: 1, disabled: 1 };
    var tv = null;
    for (var i = 1; i < segs.length; i++) {
      var seg = String(segs[i]).toLowerCase();
      if (seg === state || SIZES[seg] || NEUTRAL[seg]) continue;
      tv = seg; break;
    }
    if (!tv) tv = 'default';
    if (types && types.length) {
      var ok = types.some(function (t) { return String(t).toLowerCase() === tv; });
      if (!ok) return null;
    }
    // A family is not one material: a dark primary button is a machined plate (control), while the source's light
    // secondary chip is a low-relief chip (two drops + two insets). Resolve the TYPE first, then the state, so a
    // `Button·Secondary·Hover` lifts chip→chipHover instead of inheriting the primary's 9-layer control stack
    // (measured 2026-10-23: the secondary cell carried shadow.control and read as a heavy dark shadow).
    var pick = (def.byType && tv && def.byType[tv]) ? def.byType[tv] : def;
    return state && pick[state] ? pick[state] : (pick.base || null);
  };
  EL.sheen = function (name) { var r = EL.recipes[String(name)]; return r ? r.sheen : null; };
  EL.names = function () { return Object.keys(EL.recipes); };

  // ---------------------------------------------------------------- stamps
  EL.stamp = function (shape, recipe) {
    try { shape.setPluginData('nl:el', String(recipe)); return true; } catch (e) { return false; }
  };
  EL.readStamp = function (shape) {
    try { return shape.getPluginData('nl:el') || null; } catch (e) { return null; }
  };
  EL.stamped = function (root) {
    var out = [];
    var walk = function (s) { var k = EL.readStamp(s); if (k) out.push({ shape: s, recipe: k }); kids(s).forEach(walk); };
    walk(root || penpot.currentPage.root);
    return out;
  };

  // ---------------------------------------------------------------- apply
  function sameLayers(cur, want) {
    cur = Array.isArray(cur) ? cur : [];
    if (cur.length !== want.length) return false;
    for (var i = 0; i < cur.length; i++) {
      var a = cur[i] || {}, b = want[i] || {};
      var ac = (a.color && a.color.color) || '', bc = (b.color && b.color.color) || '';
      if (String(a.style) !== String(b.style)) return false;
      if (Math.abs(num(a, 'offsetX', 0) - b.offsetX) > 0.01) return false;
      if (Math.abs(num(a, 'offsetY', 0) - b.offsetY) > 0.01) return false;
      if (Math.abs(num(a, 'blur', 0) - b.blur) > 0.01) return false;
      if (Math.abs(num(a, 'spread', 0) - b.spread) > 0.01) return false;
      if (String(ac).toUpperCase() !== String(bc).toUpperCase()) return false;
      if (Math.abs(num(a.color, 'opacity', 0) - b.color.opacity) > 0.004) return false;
    }
    return true;
  }
  function applyShadows(shape, name) {
    var want = EL.shadow(name);
    if (!want.length) return { ok: false, err: 'unknown recipe ' + name };
    var cur = [];
    try { cur = shape.shadows || []; } catch (e) {}
    var same = sameLayers(cur, want);
    if (!same) { try { shape.shadows = want; } catch (e) { return { ok: false, err: String(e).slice(0, 120), name: name }; } }
    // Bind the token WITHOUT awaiting: `applyToken` is fire-and-forget; the engine's settle/readback covers it.
    // Skip when already bound to this recipe — re-applying the same shadow token toggles the binding off (measured
    // 2026-10-23), which is why a sweep could unbind every shape it had just bound.
    var tk = TK();
    var bound = null; try { bound = (shape.tokens || {}).shadow; } catch (e) {}
    if (tk && tk.find && bound !== 'shadow.' + name) {
      try { var t = tk.find('shadow.' + name); if (t && t.applyToShapes) t.applyToShapes([shape], ['shadow']); } catch (e) {}
    }
    EL.stamp(shape, name);
    return { ok: true, name: name, layers: want.length, inner: want.filter(function (l) { return l.style === 'inner-shadow'; }).length, changed: !same };
  }
  EL.apply = function (shape, name) { return applyShadows(shape, name); };

  // ---------------------------------------------------------------- sheen (the radial top-light)
  /** A sheen is a sibling plate: a gradient cannot share a fill with the solid surface (measured: mixing
      `fillColor` + `fillColorGradient` throws `:fills`). It is drawn ABOVE the surface and BELOW the content,
      never the other way round, or it washes the copy out. */
  EL.sheenFor = function (host, name, o) {
    o = o || {};
    var sh = EL.sheen(name);
    if (!sh) return { skipped: true };
    var parent = o.parent || (host && host.parent) || null;
    if (!parent) return { err: 'no parent for sheen' };
    var key = 'sheen·' + (o.key || String(name));
    var hb = box(o.box || host);
    // ONE sheen per host, removed BEFORE the new plate exists. Removing same-box siblings after insertion used object
    // identity (`k === plate`) and Penpot's proxies are not stable across reads, so the pass deleted the plate it had
    // just created — `sheenFor` returned ok while every Button host stayed sheenless (measured 2026-10-23). Compare by
    // `id` so the survivor is unambiguous.
    var existing = kids(parent).filter(function (k) { return nm(k) === key; })[0] || null;
    var keepId = existing ? existing.id : null;
    kids(parent).forEach(function (k) {
      if (!/^sheen·/.test(nm(k)) || k.id === keepId) return;
      var kb = box(k);
      if (Math.abs(kb.x - hb.x) <= 2 && Math.abs(kb.y - hb.y) <= 2 && Math.abs(kb.w - hb.w) <= 2 && Math.abs(kb.h - hb.h) <= 2) {
        try { k.remove(); } catch (e) {}
      }
    });
    var r = o.radius === undefined ? num(host, 'borderRadius', 0) : o.radius;
    var plate = existing;
    if (!plate) {
      try { plate = penpot.createRectangle(); } catch (e) { return { err: 'sheen rect: ' + String(e).slice(0, 80) }; }
      plate.name = key;
      // insert directly above the surface, below every content child
      var idx = 0;
      if (o.surface) { idx = kids(parent).indexOf(o.surface) + 1; if (idx < 1) idx = 0; }
      try { parent.insertChild(idx, plate); } catch (e) { try { parent.appendChild(plate); } catch (e2) {} }
    }
    try {
      plate.fills = [{ fillColor: null, fillOpacity: null, fillColorGradient: {
        type: 'radial', startX: sh.cx, startY: sh.cy, endX: sh.cx, endY: sh.cy, width: sh.width,
        stops: [{ color: '#FFFFFF', opacity: sh.opacity, offset: 0 }, { color: '#FFFFFF', opacity: 0, offset: 1 }]
      } }];
      plate.strokes = [];
      plate.shadows = [];
      plate.borderRadius = r;
    } catch (e) { return { err: 'sheen paint: ' + String(e).slice(0, 100) }; }
    if (hb.w > 0 && hb.h > 0) { try { plate.resize(hb.w, hb.h); } catch (e) {} }
    // position: inside the host (local 0,0) or in the surface's parent at the surface box
    var px = o.box ? (hb.x - (parent.x || 0)) : 0;
    var py = o.box ? (hb.y - (parent.y || 0)) : 0;
    try {
      if (parent.flex || parent.grid) {
        plate.layoutChild.absolute = true;
        if (storage.NL && storage.NL._note) storage.NL._note(plate, { declaredAbsolute: true });
        penpotUtils.setParentXY(plate, px, py);
      } else { plate.x = (o.box ? hb.x : parent.x) || 0; plate.y = (o.box ? hb.y : parent.y) || 0; }
    } catch (e) {}
    return { ok: true, name: key, opacity: sh.opacity };
  };

  // ---------------------------------------------------------------- surfaces
  /** Mount (or re-fit) a labelled surface plate inside `parent`. The plate is a RECTANGLE, not a board:
      it must sit behind content and cast a shadow, and a text card does not need to clip. Idempotent by name. */
  EL.surface = function (parent, o) {
    o = o || {};
    if (!parent) return { err: 'no parent' };
    // Canonical name is `surface·<region key>`: the record declares `region:'services.c1'`, so stripping the
    // structural `region·` prefix is what lets `surface_missing` / SC.coverage find the plate the record promised.
    var name = o.name || ('surface·' + String(nm(parent) || 'section').replace(/^region·/, ''));
    var existing = kids(parent).filter(function (k) { return nm(k) === name; })[0] || null;
    var plate = existing;
    if (!plate) {
      try { plate = penpot.createBoard(); plate.clipContent = false; } catch (e) { return { err: 'surface board: ' + String(e).slice(0, 80) }; }
      plate.name = name;
      try { parent.appendChild(plate); } catch (e) { return { err: 'surface append: ' + String(e).slice(0, 80) }; }
    }
    var hb = box(parent);
    var inset = o.inset === undefined ? 0 : Number(o.inset);
    if (o.box) hb = o.box;
    var w = Math.max(1, hb.w - inset * 2), h = Math.max(1, hb.h - inset * 2);
    try {
      plate.resize(w, h);
      // A children-hugging box (the nav pill) is offset inside its host even when the host is a flex
      // parent; using `inset` alone pinned it to the host's top-left (measured on region·nav).
      var ox = (hb.x + inset) - num(parent, 'x', 0);
      var oy = (hb.y + inset) - num(parent, 'y', 0);
      if (parent.flex || parent.grid) {
        plate.layoutChild.absolute = true;
        if (storage.NL && storage.NL._note) storage.NL._note(plate, { declaredAbsolute: true });
        penpotUtils.setParentXY(plate, ox, oy);
      }
      else { plate.x = hb.x + inset; plate.y = hb.y + inset; }
    } catch (e) {}
    var rad = radiusOf(o.radius === undefined ? 'card' : o.radius);
    if (rad.value !== null) {
      try {
        plate.borderRadius = rad.value;
        if (rad.token && TK() && TK().find) {
          var rt = TK().find(rad.token);
          if (rt && rt.applyToShapes) rt.applyToShapes([plate], ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft']);
        }
      } catch (e) {}
    }
    var fillToken = o.fill || null;
    try {
      if (fillToken) {
        var tk = TK(); var t = tk && tk.find ? tk.find(fillToken) : null;
        var hex = t ? (t.resolvedValue || t.value) : null;
        plate.fills = [{ fillColor: hex || '#FFFFFF', fillOpacity: 1 }];
        if (t && t.applyToShapes) { try { t.applyToShapes([plate], ['fill']); } catch (e) {} }
      } else plate.fills = [];
      plate.strokes = [];
    } catch (e) { return { err: 'surface fill: ' + String(e).slice(0, 100) }; }
    // behind every existing child (the plate is structure, the copy is the content)
    try { plate.sendToBack(); } catch (e) {}
    var res = { ok: true, name: name, shape: plate, fill: fillToken || null };
    if (o.role || o.elevation) {
      var role = o.elevation || o.role;
      var a = applyShadows(plate, role);
      res.elevation = a;
      if (a.ok && EL.sheen(role) && o.sheen !== false && !isCopy(plate)) {
        res.sheen = EL.sheenFor(plate, role, { parent: plate, radius: plate.borderRadius });
      }
    }
    return res;
  };

  function isCopy(s) { try { return !!(s.isComponentCopyInstance && s.isComponentCopyInstance()); } catch (e) { return false; } }
  function isMaster(s) { try { return !!(s.isComponentMainInstance && s.isComponentMainInstance()); } catch (e) { return false; } }

  /** Resolve a surface map entry against a host. `mode:'children'` hugs the direct children's union (a nav pill
      around its items), `mode:'host'` fills the host box. */
  function surfaceBox(host, entry) {
    var hb = box(host);
    if (entry.mode !== 'children') return hb;
    var skip = entry.skip instanceof RegExp ? entry.skip : null;
    // Never hug the plates this pass owns: a second run that included the existing surface grew the nav pill
    // by its own padding (measured 990×88 instead of 958×64).
    var list = kids(host).filter(function (c) { return !/^(guide|fold|surface·|sheen·)/.test(nm(c)) && !(skip && skip.test(nm(c))); });
    if (!list.length) return hb;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (c) { var b = box(c); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    var px = entry.padX === undefined ? (entry.pad === undefined ? 16 : Number(entry.pad)) : Number(entry.padX);
    var py = entry.padY === undefined ? (entry.pad === undefined ? 16 : Number(entry.pad)) : Number(entry.padY);
    return { x: x0 - px, y: y0 - py, w: (x1 - x0) + px * 2, h: (y1 - y0) + py * 2 };
  }

  /** Mount every surface declared in `o.surfaces` on the CURRENT page. This is the retro-apply for a screen
      built before the elevation channel existed; future screens declare `surface`/`elevation` in SC.record and
      SC.build mounts the same plate at assembly time. */
  EL.surfacePass = function (o) {
    o = o || {};
    var root = o.root || penpot.currentPage.root;
    var entries = o.surfaces || [];
    var hosts = [];
    var walk = function (s) { hosts.push(s); kids(s).forEach(walk); };
    walk(root);
    var out = { page: nm(penpot.currentPage), mounted: [], skipped: [], errors: [] };
    entries.forEach(function (e) {
      var re = e.match instanceof RegExp ? e.match : null;
      var exact = typeof e.match === 'string' ? e.match : null;
      var found = hosts.filter(function (s) {
        if (re) return re.test(nm(s));
        return exact ? nm(s) === exact : false;
      });
      if (!found.length) { out.skipped.push({ match: String(e.match), why: 'no host' }); return; }
      found.forEach(function (host) {
        if (e.parent && !(re ? re.test(nm(host.parent)) : nm(host.parent) === e.parent)) return;
        var b = surfaceBox(host, e);
        var r = EL.surface(host, {
          // leave the name to EL.surface when the entry has none, so the canonical `surface·<region key>`
          // (the record's naming) is used in BOTH the build path and the repair path
          name: e.name ? String(e.name).replace('{region}', nm(host)) : undefined,
          role: e.role, elevation: e.elevation, fill: e.fill, radius: e.radius,
          inset: 0, box: { x: b.x, y: b.y, w: b.w, h: b.h }, sheen: e.sheen
        });
        if (r.err) out.errors.push({ host: nm(host), err: r.err });
        else out.mounted.push({ host: nm(host), plate: r.name, fill: r.fill, elevation: r.elevation && r.elevation.name, changed: r.elevation && r.elevation.changed, sheen: !!r.sheen });
      });
    });
    return out;
  };

  // ---------------------------------------------------------------- sweep / repair
  /** Re-apply recipes on the CURRENT page to every shape whose NAME carries a family role or a known duty.
      One page per call: Penpot's `openPage` does not rebind `currentPage` in the same execute_code call
      (measured), so the page is the caller's job — same refusal as `designPage`. */
  EL.sweepPage = async function (o) {
    o = o || {};
    var page = nm(penpot.currentPage);
    if (o.page && String(o.page) !== page) return { err: 'sweepPage works on the OPEN page "' + page + '", not "' + o.page + '"', page: page };
    var root = o.root || penpot.currentPage.root;
    var groups = {}, changed = [], applied = [], skipped = [];
    var walk = function (s) {
      var name = nm(s);
      var type = '';
      try { type = String(s.type); } catch (e) {}
      if (!/^(board|rectangle|ellipse|path)$/.test(type)) { kids(s).forEach(walk); return; }
      if (/·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^sheet·/.test(name)) { kids(s).forEach(walk); return; }
      var role = null;
      var stamp = EL.readStamp(s);
      // The NAME is the contract for a control family: once a type-specific role exists (`Button·Secondary` → chip),
      // a stale stamp from an older recipe must not pin the shape to the old material (a sweep after the role change
      // would otherwise keep re-applying `control` to every secondary). Non-family duties (plate·eN, surface stamps)
      // still resolve through the stamp.
      var fam = name.split('·')[0];
      if (name.indexOf('·') > 0) {
        var named = EL.roleFor(name, fam);
        if (named) role = named;
      }
      if (!role && stamp && EL.has(stamp)) role = stamp;
      if (!role) {
        // do NOT pre-test `EL.roles[fam]` here: that strict map lookup is what skipped `FAB` (role key `Fab`)
        if (name.indexOf('·') > 0) role = null;
        else if (/^plate·e\d$/.test(name) && EL.has(name.split('·')[1])) role = name.split('·')[1];
        else if (name === 'segment·active' && EL.has('e1')) role = 'e1';
        else if (name === 'handle' && EL.has('e1')) role = 'e1';
        else if (name === 'panel' && EL.has('e3')) role = 'e3';   // a floating dropdown / popover plate
      }
      if (!role) { kids(s).forEach(walk); return; }
      if (o.types && o.types.length && o.types.indexOf(type) < 0) { kids(s).forEach(walk); return; }
      var r = applyShadows(s, role);
      if (r.ok) {
        applied.push({ name: name, role: role, layers: r.layers, inner: r.inner });
        if (r.changed) changed.push({ name: name, role: role, layers: r.layers });
        (groups[role] = groups[role] || []).push(s);
        // sheen: a master can grow the child (it propagates to instances); a component COPY cannot be authored
        if (EL.sheen(role) && !isCopy(s)) {
          var sr = EL.sheenFor(s, role, { parent: s, box: box(s), radius: num(s, 'borderRadius', 0) });
          if (sr && sr.ok) applied[applied.length - 1].sheen = sr.name;
        }
      } else skipped.push({ name: name, role: role, err: r.err });
      kids(s).forEach(walk);
    };
    walk(root);
    // Bind by the durable stamp, one shape at a time: `applyToShapes([many], ['shadow'])` bound 2/2 buttons
    // but 0/4 chips in one call (measured 2026-10-23), while a single-shape call bound every time.
    var bind = null;
    if (o.apply !== false) bind = await EL.bindStamped(root, { wait: o.wait });
    return { page: page, applied: applied.length, changed: changed.length, groups: Object.keys(groups).length, bind: bind,
      sheened: applied.filter(function (a) { return a.sheen; }).length, changedList: changed.slice(0, 40), skipped: skipped.slice(0, 20) };
  };

  // ---------------------------------------------------------------- audit
  /** Read-only census. `stamped` is the durable contract (nl:el), `shadowed`/`inner`/`bound` are what the
      render actually has. A stamped shape with fewer layers than its recipe is `flat`. */
  /** Bind every `nl:el`-stamped shape to its `shadow.<recipe>` token — the shadow half of TK.bindBoard.
      One shape per `applyToShapes` call (see the measurement above), one settle wait, then a verify + retry. */
  EL.bindStamped = async function (root, o) {
    o = o || {};
    var list = EL.stamped(root);
    var res = { tried: list.length, bound: 0, byRecipe: {}, unbound: [] };
    var tk = TK();
    if (!tk || !tk.find) { res.err = 'TK not seeded'; return res; }
    var bindOf = function (e) { var g = null; try { g = (e.shape.tokens || {}).shadow; } catch (x) {} return g; };
    // NEVER re-apply a token that is already bound: measured 2026-10-23, applying the same shadow token toggles the
    // binding OFF (it is a toggle, not an idempotent set). The old unconditional pass + retry only ended bound by
    // luck, and a second bind call could leave the whole page unbound. Only shapes whose binding is missing/different
    // are touched, and none is touched twice unless the first read still shows it unbound.
    var todo = list.filter(function (e) { return bindOf(e) !== 'shadow.' + e.recipe; });
    todo.forEach(function (e) {
      var t = tk.find('shadow.' + e.recipe);
      if (t && t.applyToShapes) { try { t.applyToShapes([e.shape], ['shadow']); } catch (x) {} }
    });
    await nap(o.wait || 900);
    // retry once for the ones the plugin dropped while the shape was still settling
    todo.forEach(function (e) {
      if (bindOf(e) === 'shadow.' + e.recipe) return;
      var t = tk.find('shadow.' + e.recipe);
      if (t && t.applyToShapes) { try { t.applyToShapes([e.shape], ['shadow']); } catch (x) {} }
    });
    await nap(500);
    list.forEach(function (e) {
      if (bindOf(e) === 'shadow.' + e.recipe) { res.bound++; res.byRecipe[e.recipe] = (res.byRecipe[e.recipe] || 0) + 1; }
      else res.unbound.push({ name: nm(e.shape), recipe: e.recipe, got: bindOf(e) || null });
    });
    return res;
  };

  /** Adopt painted-but-unbound shadows: a factory (or a legacy host) that typed a stack gets a declared recipe,
      stamped and bound. Size/role picks a small (`chip`) or surface (`card`) stack; a caller may override. This is the
      repair for `shadow_unbound` when the shape has no family role to sweep by. */
  EL.adopt = function (root, fallback) {
    root = root || penpot.currentPage.root;
    var adopted = [], byRecipe = {};
    (function walk(s) {
      if (!s) return;
      var sh = [], tok = {};
      try { sh = s.shadows || []; } catch (e) {}
      try { tok = s.tokens || {}; } catch (e) {}
      if (sh.length && !tok.shadow) {
        var nm = String(s.name || '');
        var rec = fallback || 'card';
        if (/handle|knob|dot|avatar|indicator|switch/i.test(nm) || (s.type === 'ellipse' && s.width <= 96)) rec = 'chip';
        if (EL.has(rec)) {
          var r = EL.apply(s, rec);
          if (r && r.ok) { adopted.push({ shape: nm, recipe: rec }); byRecipe[rec] = (byRecipe[rec] || 0) + 1; }
        }
      }
      Array.from(s.children || []).forEach(walk);
    })(root);
    return { adopted: adopted.length, byRecipe: byRecipe, sample: adopted.slice(0, 8) };
  };

  EL.audit = function (root) {
    root = root || (penpot.currentPage && penpot.currentPage.root);
    var out = { page: nm(penpot.currentPage), shapes: 0, shadowed: 0, inner: 0, stamped: 0, bound: 0, unbound: 0, sheen: 0, recipes: {}, flat: [], errors: [] };
    var walk = function (s) {
      out.shapes++;
      var name = nm(s), sh = [];
      try { sh = Array.isArray(s.shadows) ? s.shadows : []; } catch (e) {}
      var tok = null;
      try { tok = (s.tokens && s.tokens.shadow) || null; } catch (e) {}
      var stamp = EL.readStamp(s);
      if (stamp) {
        out.stamped++;
        out.recipes[stamp] = (out.recipes[stamp] || 0) + 1;
        var rec = EL.recipe(stamp);
        if (rec && sh.length < rec.layers.length) out.flat.push({ name: name, stamp: stamp, got: sh.length, want: rec.layers.length });
      }
      if (sh.length) {
        out.shadowed++;
        if (sh.some(function (x) { return x.style === 'inner-shadow'; })) out.inner++;
        if (tok) out.bound++; else out.unbound++;
      }
      if (kids(s).some(function (k) { return /^sheen·/.test(nm(k)); })) out.sheen++;
      kids(s).forEach(walk);
    };
    walk(root);
    return out;
  };

  EL.auditAll = function () {
    var pages = penpotUtils.getPages();
    var out = {};
    pages.forEach(function (p) {
      var page = penpotUtils.getPageById(p.id);
      out[p.name] = { shadowed: 0, inner: 0, stamped: 0, bound: 0, unbound: 0, sheen: 0, flat: 0 };
      var o = out[p.name];
      var walk = function (s) {
        var sh = [];
        try { sh = s.shadows || []; } catch (e) {}
        var tok = null; try { tok = s.tokens && s.tokens.shadow; } catch (e) {}
        var stamp = EL.readStamp(s);
        if (stamp) { o.stamped++; var rec = EL.recipe(stamp); if (rec && sh.length < rec.layers.length) o.flat++; }
        if (sh.length) { o.shadowed++; if (sh.some(function (x) { return x.style === 'inner-shadow'; })) o.inner++; if (tok) o.bound++; else o.unbound++; }
        if (kids(s).some(function (k) { return /^sheen·/.test(nm(k)); })) o.sheen++;
        kids(s).forEach(walk);
      };
      walk(page.root);
    });
    return out;
  };

  EL.api = ['seed', 'recipe', 'shadow', 'has', 'role', 'roleFor', 'sheen', 'names', 'stamp', 'readStamp', 'stamped',
    'apply', 'adopt', 'sheenFor', 'surface', 'surfacePass', 'sweepPage', 'bindStamped', 'audit', 'auditAll'];
  return { seeded: EL.seeded, version: EL.VERSION, api: EL.api };
})(storage, penpot, penpotUtils);
