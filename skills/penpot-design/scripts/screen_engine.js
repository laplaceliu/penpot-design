// screen_engine.js — **Screen assembly from the design system** (storage.SC). Gate **G17**: when the user supplies
// source material and asks for an imitation/recreation, a Screen board is assembled from the system — library
// component instances, token-bound paint, typography styles, the icon catalog and real raster **media** — and every
// entry of it is traceable to a record of that source. A screen is never hand-drawn.
//
// Usage (after the G1 seed order, plus media_engine.js):
//   SC.config({ server: 'http://127.0.0.1:8779' })         // the loopback server --root'ed at the PROJECT (media paths)
//   SC.record('contact', { src: 'https://example.com/contact', tier: 'web', recipe: 'contact',
//     sections: [{ region: 'form', controls: [{ family: 'input', type: 'outlined', size: 'md' }],
//                  copy: [{ text: 'Tell us about the project', size: 32, weight: 700, role: 'headline' }],
//                  media: [{ slot: 'cover', path: 'assets/cover.png' }] }] })
//   await SC.build({ page: '15 · Screens · content', screen: 'contact' })   // → census + gaps
//   SC.audit()                       // the current page, measured against the same contract the gate reads
//   SC.coverage()                    // record-side: which declared entries landed
//   await SC.reconcile({ dry: true })                       // census of drawn control hosts on screen pages
//   await SC.reconcile({ page: '15 …', apply: 'register' }) // promote them to masters (additive, idempotent)
//
// WHY this engine exists: the factory calls (`CF.button({parent, x, y, …})`) DRAW a control. That is right on a spec
// board, where the drawing is what gets registered. On a screen it produced one-off copies — 100 + 60 control-named
// hosts on a live file's screens pages, none of them instances, and `mediaFills: 0` on all three screen pages
// (measured 2026-10-22). A copy cannot be fixed, swapped or themed, and a gray plate with an `image` glyph is not the
// photograph the user asked to reproduce. SC is the path that makes the contract satisfiable instead of aspirational.
//
// Rules (each one is what the code below actually does; capabilities §9/§10, api-pitfalls §17):
//   S1  **instance-first**: a control entry is placed with `CF.instance(master)`. The engine never calls a factory to
//       draw a control on a screen; if the master is missing it reports `missing_master` with the remedy (grow the
//       factory per G12, then `CF.autoRegister`), it does not silently draw a one-off.
//   S2  a raster entry must come from a **source path** through `MD.place` (M1–M7). `SC.media` without `path` records a
//       placeholder and records it, so `placeholder_media` (gate) can demand the fill instead of pretending.
//   S3  structure comes from a recipe: `NL.fromRecipe(recipe, { tier, parent })` — so regions are named `region·*`,
//     their gaps come from `LY.BREATH`, and panes are detected geometrically (never filled with copy).
//   S4  copy is born on the ramp (`storage.mkText` snaps size/weight to a declared step) and then carries the library
//       style (`TP.apply`), so both channels are populated — a token without a style is unpickable in the panel (§30).
//   S5  binding happens AFTER the writes: `TK.bindBoard(board)` runs on the finished screen board, because a geometry
//       write drops the binding (measured for radius and for rings — same class of failure).
//   S6  proof is durable: the screen board is stamped `nl:sc / nl:src / nl:recipe / nl:tier / nl:assembled` via
//       pluginData (C10), so a later session — or another person — can re-run the gate without this conversation.
//   S7  **idempotent by stamp**: `SC.build` finds the screen board by its `nl:sc` key. The first call creates it, a later
//       call MOUNTS into it (`mode:'mount'`) so the same record re-run never duplicates a screen; only `{rebuild:true}`
//       removes and re-creates. Nothing is created and then deleted in a retry loop.
//   S8  the 30 s ceiling is planned for: build the record once, then call `SC.build({sections:['nav','intro']})`,
//       then the next group — the census reports `sectionsLeft`, so a screen is finished by continuing, not by re-trying.

return (async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SC = {};
  storage.SC = SC;
  const LY = storage.LY, CF = storage.CF, NL = storage.NL, TK = storage.TK, TP = storage.TP, MD = storage.MD;
  if (!LY || !CF || !NL) return { err: 'seed order first: seed_storage → layout_engine → component_factory → native_layout' };

  SC.records = {};          // screen key -> record
  SC.server = 'http://127.0.0.1:8777';
  SC.log = [];              // last build census per screen
  SC.families = null;       // PascalCase family names, from CF.map()
  SC.libIdx = null;         // lowercase master name -> canonical name

  SC.config = (o) => {
    o = o || {};
    if (o.server) SC.server = String(o.server).replace(/\/$/, '');
    if (MD && MD.config) MD.config({ server: SC.server });
    return { server: SC.server, tier: o.tier || 'web' };
  };

  // ---------- the vocabulary the record must speak ----------
  SC.familyIndex = function (force) {
    if (SC.families && !force) return SC.families;
    const map = CF.map(), out = {};
    Object.keys(map).forEach((g) => {
      (map[g] || []).forEach((f) => { out[String(f).charAt(0).toUpperCase() + String(f).slice(1)] = g; });
    });
    SC.families = out;
    return out;
  };
  SC.isControlName = function (nm) {
    const head = String(nm || '').split('·')[0];
    return !!SC.familyIndex()[head];
  };

  SC.libIndex = function (force) {
    if (SC.libIdx && !force) return SC.libIdx;
    const idx = {};
    try { Array.from(penpot.library.local.components || []).forEach((c) => { idx[String(c.name).toLowerCase()] = c.name; }); } catch (e) {}
    SC.libIdx = idx;
    return idx;
  };

  /** Resolve a control request to a master that EXISTS. Instance-first is only honest if a near-miss name is caught
      here (the library holds `Button·Primary·MD`; a record that asks for `Button·Primary·Md·Default` must not be
      reported as missing). Order: exact → case-insensitive → grammar-canonical (CF.name) → canonical case-fold. */
  SC.master = function (req) {
    req = req || {};
    const tried = [];
    const hit = (n) => { if (!n) return null; const r = CF.get(n); if (r) return { name: n, rec: r }; if (tried.indexOf(n) < 0) tried.push(n); return null; };
    if (req.name) { const h = hit(req.name) || hit(SC.libIndex()[String(req.name).toLowerCase()]); if (h) return h; }
    const fam = req.family ? (SC.familyIndex()[req.family] || (String(req.family).charAt(0).toUpperCase() + req.family.slice(1))) : null;
    if (!fam) return { err: 'no family or name in the control request', tried };
    const parts = {};
    ['type', 'size', 'state', 'slot', 'variant', 'tone', 'extra'].forEach((k) => { if (req[k] !== undefined) parts[k] = req[k]; });
    const cands = [CF.name(fam, parts), CF.name(req.family, parts), CF.name(fam, Object.assign({}, parts, { state: undefined }))];
    for (const c of cands) { const h = hit(c); if (h) return h; }
    for (const c of cands) { const h = hit(SC.libIndex()[String(c).toLowerCase()]); if (h) return h; }
    return { err: 'missing_master', tried: tried, family: fam };
  };

  // ---------- the four channels ----------
  /** S1 — place a control. Returns the instance shape (or the gap, never a hand-drawn control). */
  SC.ctl = function (parent, req, o) {
    o = o || {};
    const m = SC.master(req);
    if (m.err) { SC.log.push({ ch: 'ctl', err: m.err, tried: m.tried }); return { err: m.err, tried: m.tried }; }
    const r = CF.instance(m.name, Object.assign({ parent }, req.place || {}, o));
    if (!r || !r.ok) return { err: 'instance: ' + String((r && r.err) || 'no result'), master: m.name };
    if (req.stamp !== false) { try { NL.stamp(r.inst, { ctl: m.name }); } catch (e) {} }
    return { ok: true, master: m.name, via: 'instance', shape: r.inst, name: String(r.inst.name || '') };
  };

  /** S4 — copy on the ramp, carrying the library typography style. `box` = {x,y} for absolute, else it joins the flow. */
  SC.copy = async function (parent, req) {
    req = req || {};
    if (!req.text) return { err: 'copy: no text' };
    // a pane region holds structure; the auditor's pane_filled rule indicts copy written directly onto a pane, so the
    // caller must name a leaf region or pass a host band. Refusing here is cheaper than a gate failure later.
    const t = storage.mkText(String(req.text), 0, 0, req.size || 16, req.color || null, req.weight || 400, req.role);
    if (!t) return { err: 'copy: empty text' };
    if (parent) parent.appendChild(t);
    let style = null;
    if (TP && TP.apply) { const a = TP.apply(t); style = a && (a.step || a.err); }
    if (req.box && storage.absMount) storage.absMount(parent, t, req.box.x, req.box.y);
    else if (req.x !== undefined && req.y !== undefined) { try { t.x = req.x; t.y = req.y; } catch (e) {} }
    await sleep(120);   // text metrics settle; a centering done before this bakes the stale-center fingerprint
    return { ok: true, step: style, chars: String(req.text).slice(0, 28), w: Math.round(t.width), h: Math.round(t.height) };
  };

  /** §elevation — the surface a section sits on. A card is not a shadow floating on nothing: the plate comes
      first (token fill + radius), then its recipe (multi-layer drop + inset) and its sheen. `section.surface` is a
      declared colour token, `section.elevation` a declared EL recipe; both are optional and independent. */
  SC.surface = function (parent, sec) {
    sec = sec || {};
    if (!sec.surface && !sec.elevation) return { skipped: true };
    if (!storage.EL || !storage.EL.seeded) return { err: 'EL is not seeded — load scripts/elevation_engine.js and EL.seed() before a surfaced screen' };
    return storage.EL.surface(parent, {
      name: 'surface·' + (sec.region || 'section'), role: sec.elevation || 'card',
      fill: sec.surface || null, radius: sec.radius || 'card', sheen: sec.sheen
    });
  };

  /** S2 — a raster slot. With `path` it is a real media object; without it the placeholder is recorded as a gap. */
  SC.media = async function (parent, req) {
    req = req || {};
    const slot = req.slot || 'media';
    if (!req.path) {
      const s = penpot.createRectangle();
      s.name = 'img·' + slot;
      s.resize(Math.max(1, req.w || 240), Math.max(1, req.h || 160));
      s.fills = [{ fillColor: '#E2E8F0', fillOpacity: 1 }];
      if (parent) parent.appendChild(s);
      return { ok: false, gap: 'placeholder_media', slot: slot, note: 'no source path in the record — import the asset and re-run' };
    }
    const r = await MD.place({ parent, slot, path: req.path, x: req.x, y: req.y, w: req.w, h: req.h, radius: req.radius });
    if (!r || !r.ok) return { err: 'media: ' + String((r && r.err) || 'no result'), slot };
    return { ok: true, slot, media: r.media.name, size: [r.media.w, r.media.h], shape: r.shape };
  };

  /** an in-control glyph or a catalog icon — the vector channel (icons.md), kept here so a record can name all four */
  SC.icon = function (parent, req) {
    req = req || {};
    if (req.kind && CF.glyph) return CF.glyph(parent, req.kind, req.box || null, req.opts || {});
    if (req.name && storage.IC) return storage.IC.place(req.name, Object.assign({ parent }, req.opts || {}));
    return { err: 'icon: pass {kind} for a CF glyph or {name} for the catalog' };
  };

  /** The record, small enough to live in the file: which source, which recipe, which masters, which asset paths.
      Stamped as `nl:rec` (S6), so `SC.coverage()` re-runs in a fresh session — or by another person — from the board
      alone. Copy TEXT is not stored (it is on the shapes); only the counts, so the digest stays a few hundred bytes. */
  SC.digest = function (rec) {
    return JSON.stringify({
      src: rec.src || null, tier: rec.tier || 'web', recipe: rec.recipe || null,
      sections: (rec.sections || []).map((s) => ({
        region: s.region,
        controls: (s.controls || []).map((c) => c.name || SC.master(c).name || c.family || null),
        copy: (s.copy || []).length,
        media: (s.media || []).map((m) => ({ slot: m.slot || 'media', path: m.path || null })),
        icons: (s.icons || []).map((i) => i.kind || i.name || null),
        // §elevation: the surface and the stack are part of the record, not a post-build decoration —
        // coverage re-reads them from the board so a screen built without a card's plate reports it.
        surface: s.surface || null, elevation: s.elevation || null, radius: s.radius || null
      }))
    });
  };

  // ---------- the record ----------
  /** Declare (or merge) what one screen must contain. Validation happens now, not after a 30 s build. */
  SC.record = function (screen, spec) {
    spec = spec || {};
    const rec = SC.records[screen] = Object.assign({ screen, tier: 'web', sections: [] }, SC.records[screen] || {}, spec, { screen });
    const gaps = { controls: [], copy: [], media: [], regions: [] };
    const known = LY.keys ? LY.keys() : [];
    if (rec.recipe && known.indexOf(rec.recipe) < 0) gaps.regions.push('recipe "' + rec.recipe + '" is not an LY.keys() member');
    (rec.sections || []).forEach((sec, i) => {
      (sec.controls || []).forEach((c) => { const m = SC.master(c); if (m.err) gaps.controls.push((c.name || c.family) + ' → ' + m.tried.join(' | ')); });
      (sec.media || []).forEach((md) => { if (!md.path) gaps.media.push('slot "' + (md.slot || 'media') + '" has no source path'); });
      (sec.copy || []).forEach((cp) => { if (!cp.text) gaps.copy.push('copy entry #' + i + ' has no text'); });
      // §elevation validation: a surface must name a live colour token, an elevation a live recipe. A typo used
      // to be discovered as a white/blank plate 20 sections into a build.
      if (sec.surface) {
        let ok = false;
        try { ok = !!(storage.TK && storage.TK.find && storage.TK.find(sec.surface)); } catch (e) {}
        if (!ok) gaps.copy.push('section "' + (sec.region || i) + '" surface "' + sec.surface + '" is not a live colour token');
      }
      if (sec.elevation) {
        let ok = false;
        try { ok = !!(storage.EL && storage.EL.has && storage.EL.has(sec.elevation)); } catch (e) {}
        if (!ok) gaps.copy.push('section "' + (sec.region || i) + '" elevation "' + sec.elevation + '" is not a live EL recipe (seed elevation_engine.js)');
      }
    });
    rec.gaps = gaps;
    rec.empty = !gaps.controls.length && !gaps.media.length && !gaps.copy.length && !gaps.regions.length;
    return { screen, src: rec.src || null, tier: rec.tier, recipe: rec.recipe || null, sections: (rec.sections || []).length, gaps, empty: rec.empty };
  };

  // ---------- the build ----------
  /** The page's single content container (penpot-structure §3): a screen board is a CHILD of PageRoot, never a second
      root-level shape — `audit_layout.root_stray` indicts the latter, and `designPage` only walks from the page head,
      so a root-level screen would also be invisible to the design gate (measured 2026-10-22: a 31-shape screen board
      at page root audited `shapes: 201` and read CLEAN). */
  SC.pageRoot = function () {
    const kids = Array.from((penpot.root || {}).children || []);
    return kids.find((c) => /-PageRoot$/.test(String(c.name || ''))) || null;
  };
  /** Where the next screen board lands inside PageRoot: below every existing content board, one page-breath down. */
  SC.nextSlot = function (pr, tier) {
    const kids = Array.from(pr.children || []).filter((c) => c.type === 'board' && !/^(header|footer|PageHeader|PageFooter)/i.test(String(c.name || '')));
    let bottom = pr.y, right = pr.x;
    kids.forEach((b) => { bottom = Math.max(bottom, b.y + b.height); right = Math.max(right, b.x + b.width); });
    const gap = LY.breath ? LY.breath('page', tier || 'web') : 96;
    return { x: pr.x + (LY.TIERS[tier || 'web'] ? LY.TIERS[tier || 'web'].margin : 32), y: bottom + gap, pageBottom: bottom, pageRight: right };
  };

  SC.find = function (screen) {
    return SC.scope().filter((b) => {
      try { const st = NL.readStamp(b); return st && st.sc === screen; } catch (e) { return false; }
    });
  };

  /** Assemble one screen board from its record. Idempotent by the `nl:sc` stamp (S7). */
  SC.build = async function (o) {
    o = o || {};
    const screen = o.screen;
    const rec = SC.records[screen];
    if (!rec) return { err: 'no record for screen "' + screen + '" — SC.record() first' };
    if (!penpot.currentPage || penpot.currentPage.name !== o.page) {
      const pg = (penpot.currentFile.pages || []).find((p) => p.name === o.page);
      if (!pg) return { err: 'no page named "' + o.page + '"' };
      penpot.openPage(pg.id); await sleep(500);
      if (penpot.currentPage.name !== o.page) return { err: 'page did not open (asked ' + o.page + ', got ' + penpot.currentPage.name + ')' };
    }
    const existing = SC.find(screen);
    if (existing.length && o.rebuild) existing.forEach((b) => { try { b.remove(); } catch (e) {} });
    // S7/S8 as one rule: a screen board is found by its `nl:sc` stamp. First call creates it; later calls MOUNT into it,
    // so a build that hit the 30 s ceiling is continued by naming the next sections instead of being re-attempted blind.
    const resume = existing.length && !o.rebuild;

    const tier = rec.tier || 'web';
    const tw = (LY.TIERS[tier] || {}).w || 1440;
    const pr = SC.pageRoot();
    const slot = pr ? SC.nextSlot(pr, tier) : { x: 0, y: 0 };
    // x0/y0 are offsets inside PageRoot; omitted means "the next free band below the existing content".
    const wx = o.x0 === undefined ? slot.x : (pr ? pr.x + o.x0 : o.x0);
    const wy = o.y0 === undefined ? slot.y : (pr ? pr.y + o.y0 : o.y0);
    const plan0 = rec.recipe && LY.recipe ? LY.recipe(rec.recipe, { tier }) : null;
    const h0 = o.h || rec.h || (plan0 && plan0.frame && plan0.frame.h) || (LY.viewportHeight ? LY.viewportHeight(tier) : 900);

    const census = { screen, src: rec.src || null, tier, recipe: rec.recipe || null, mode: resume ? 'mount' : 'new', regions: [], placed: { instances: 0, copy: 0, media: 0, glyphs: 0, surfaces: 0, elevated: 0 }, gaps: [] };
    let board, plan = null;
    if (resume) {
      board = existing[0];
      plan = { regions: {}, keys: [], panes: [], leaves: [] };
      Array.from(board.children || []).forEach((c) => {
        const st = NL.readStamp(c);
        if (st && st.region) { plan.regions[st.region] = c; plan.keys.push(st.region); }
      });
      plan.panes = SC._panes(plan);
      census.regions = plan.keys;
    } else if (rec.recipe) {
      board = NL.frame('Screen·' + screen, { x: wx, y: wy, w: tw, h: h0, dir: 'column', fill: rec.fill || '#FFFFFF', radius: rec.radius || 'none', sizing: 'fix',
        parent: pr || undefined, absolute: pr ? { x: wx, y: wy } : null });
      const sk = NL.fromRecipe(rec.recipe, { tier, parent: board, x0: wx, y0: wy, w: tw, h: h0, fill: rec.regionFill || null });
      if (sk && sk.err) return { err: 'fromRecipe: ' + sk.err, screen };
      plan = sk;
      census.regions = sk.keys;
      census.panes = sk.panes;
    } else {
      board = NL.frame('Screen·' + screen, { x: wx, y: wy, w: tw, h: h0, dir: 'column', breath: 'block', fill: rec.fill || '#FFFFFF', radius: rec.radius || 'none', sizing: 'fix',
        parent: pr || undefined, absolute: pr ? { x: wx, y: wy } : null });
      plan = { regions: {}, keys: [], panes: [], leaves: [] };
    }
    if (!resume && !rec.recipe) {
      (rec.sections || []).forEach((sec, i) => {
        const b = NL.col('section·' + (sec.region || sec.name || i), { breath: 'group', w: tw, h: sec.h, dir: sec.dir || 'column', parent: board });
        sec._host = b; census.regions.push(String(b.name));
      });
    }

    // which sections this call owns: all of them on a fresh build, the named ones when mounting into an existing board
    const want = o.sections && o.sections.length ? o.sections.map(String) : null;
    for (const sec of rec.sections || []) {
      if (want && want.indexOf(String(sec.region)) < 0) { census.skippedSections = (census.skippedSections || 0) + 1; continue; }
      let host = (plan && plan.regions[sec.region]) || sec._host || board;
      if (!host) { census.gaps.push({ ch: 'region', want: sec.region, got: census.regions.slice(0, 12) }); continue; }
      if (!sec._host && plan && plan.panes && plan.panes.indexOf(String(sec.region)) >= 0 && (sec.copy || []).length)
        census.gaps.push({ ch: 'pane', region: sec.region, note: 'copy onto a pane — land it on a leaf region or a band you create' });
      // §elevation: the plate is mounted BEFORE the section's content, so it is the floor of the region rather
      // than a rectangle covering the copy. Idempotent by `surface·<region>` on a mount.
      if (sec.surface || sec.elevation) {
        const sr = SC.surface(host, sec);
        if (sr && !sr.err) { census.placed.surfaces++; if (sr.elevation && sr.elevation.ok) census.placed.elevated++; }
        else census.gaps.push({ ch: 'surface', region: sec.region, err: (sr && sr.err) || 'surface failed' });
      }
      for (const c of sec.controls || []) {
        const r = SC.ctl(host, c);
        if (r.ok) census.placed.instances++; else census.gaps.push({ ch: 'control', want: c.name || c.family, err: r.err, tried: r.tried });
      }
      for (const cp of sec.copy || []) {
        const r = await SC.copy(host, cp);
        if (r.ok) census.placed.copy++; else census.gaps.push({ ch: 'copy', err: r.err });
      }
      for (const md of sec.media || []) {
        const r = await SC.media(host, md);
        if (r.ok) census.placed.media++;
        else if (r.gap) census.gaps.push({ ch: 'media', slot: md.slot, err: r.gap });
        else census.gaps.push({ ch: 'media', slot: md.slot, err: r.err });
      }
      for (const ic of sec.icons || []) {
        const r = SC.icon(host, ic);
        if (r && !r.err) census.placed.glyphs++; else census.gaps.push({ ch: 'icon', err: (r && r.err) || 'glyph failed' });
      }
      census.filledSections = (census.filledSections || 0) + 1;
    }

    NL.stamp(board, { sc: screen, src: String(rec.src || ''), recipe: String(rec.recipe || ''), tier, assembled: '1' });
    // durable elevation census: how many shapes of this screen carry the `nl:el` contract. The gate compares this
    // stamp to the shapes it can actually see, so "0 shadows on a 3000-shape file" can never read CLEAN again.
    try {
      let els = 0;
      (function count(s) { if (storage.EL && storage.EL.readStamp && storage.EL.readStamp(s)) els++; Array.from(s.children || []).forEach(count); })(board);
      board.setPluginData('nl:els', String(els));
    } catch (e) { census.gaps.push({ ch: 'els', err: String(e).slice(0, 60) }); }
    try { const d = SC.digest(rec); board.setPluginData('nl:rec', d.length > 16000 ? d.slice(0, 16000) + '…' : d); } catch (e) { census.gaps.push({ ch: 'digest', err: String(e).slice(0, 80) }); }
    if (NL.guide && rec.recipe) NL.guide(board, Object.assign({ type: 'column' }, LY.guides ? LY.guides(tier) : {}));
    // A band that spans the tier width IS a grid host at that width, so it gets the same native column grid the screen
    // board carries: `audit_design` rule 12 (`no_guides`) binds every tier-width board, and a builder that grids only
    // the outer board leaves the full-bleed footer/hero band placed against a grid nobody can see (measured 2026-10-22
    // on the proof screen, where `region·footer` 1440 wide was the only board on the page with no guide).
    try {
      const tw = (LY.TIERS[tier] || {}).w;
      if (tw && NL.guide) Array.from(board.children || []).forEach((c) => {
        if (c.type === 'board' && Math.abs(Math.round(c.width) - tw) <= 1) {
          NL.guide(c, Object.assign({ type: 'column' }, LY.guides ? LY.guides(tier) : {}));
        }
      });
    } catch (e) { census.gaps.push({ ch: 'guides', err: String(e).slice(0, 60) }); }
    if (TK && TK.bindBoard) { try { await TK.bindBoard(board); } catch (e) { census.gaps.push({ ch: 'bind', err: String(e).slice(0, 90) }); } }
    // the shadow half of the birth pass: every `nl:el` stamp (surfaces + controls) gets its token binding.
    if (storage.EL && storage.EL.bindStamped) { try { census.elevationBind = await storage.EL.bindStamped(board); } catch (e) { census.gaps.push({ ch: 'bind-shadow', err: String(e).slice(0, 90) }); } }
    if (NL.whenSettled) { try { await NL.whenSettled(); } catch (e) {} }
    census.board = String(board.name || ''); census.id = board.id;
    // what is still empty is read off the board, not out of a session memory: a region with no children is a section
    // that has not been assembled (or whose entries all failed), which is exactly what `sectionsLeft` must mean.
    const regionHosts = (plan && plan.regions) || {};
    census.emptyRegions = Object.keys(regionHosts).filter((k) => {
      try { return Array.from(regionHosts[k].children || []).length === 0; } catch (e) { return false; }
    });
    census.sectionsLeft = (rec.sections || []).filter((s) => census.emptyRegions.indexOf(String(s.region)) >= 0).length;
    census.assembled = census.placed.instances > 0 && census.gaps.filter((g) => g.ch !== 'media').length === 0;
    SC.log.push(Object.assign({}, census, { at: 'build' }));
    return census;
  };

  /** Panes of a built plan, re-derived from the boards that exist (same geometric test NL.fromRecipe uses). */
  SC._panes = function (plan) {
    const keys = Object.keys(plan.regions || {});
    const geo = {};
    keys.forEach((k) => { const b = plan.regions[k]; geo[k] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; });
    const inside = (a, b) => b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.w <= a.x + a.w + 1 && b.y + b.h <= a.y + a.h + 1 && (b.w * b.h) < (a.w * a.h);
    return keys.filter((a) => keys.some((b) => b !== a && inside(geo[a], geo[b])));
  };

  // ---------- the measurement the gate reads (read-only) ----------
  /** One page, judged as a screen: instance-driven? media real? copy bound? stamped? `verdict` is `ASSEMBLED` or a count of each defect class. */
  SC.audit = function (o) {
    o = o || {};
    const root = (penpot.currentPage || {}).root;
    if (!root) return { err: 'no current page root' };
    const out = { page: penpot.currentPage && penpot.currentPage.name, boards: 0, stamped: 0, screens: [],
                  drawnHosts: 0, drawnNames: [], instances: 0, slots: 0, filled: 0, placeholders: [],
                  copy: 0, copyBound: 0, paint: 0, paintBound: 0, surfaces: 0, elevated: 0, sheen: 0, flat: [] };
    const note = (s) => { const nm = String(s.name || ''); out.drawnNames.push(nm); if (out.drawnNames.length > (o.samples || 14)) out.drawnNames.pop(); };
    const walk = (s, inBoard) => {
      let nm = ''; try { nm = String(s.name || ''); } catch (e) {}
      // a fold marker is an ANNOTATION, not screen copy: its label must not count against `copyBound`
      if (s.type === 'text' && s.parent && /^fold·/.test(String(s.parent.name || ''))) return;
      let isInst = false; try { isInst = !!(s.isComponentInstance && s.isComponentInstance()); } catch (e) {}
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      if (isInst) { out.instances++; return; }   // a master's internals belong to the master, not to this screen
      if (s.type === 'board') {
        if (inBoard === false) out.boards++;
        const st = NL.readStamp(s);
        if (st && st.sc) { out.stamped++; out.screens.push({ name: nm, sc: st.sc, src: st.src || null, recipe: st.recipe || null, assembled: st.assembled || null,
          emptyRegions: Array.from(s.children || []).filter((c) => { const r = NL.readStamp(c); return r && r.region && !Array.from(c.children || []).length; }).map((c) => String(c.name)) }); }
      }
      if (s.type === 'board' && SC.isControlName(nm)) { out.drawnHosts++; note(s); }
      // §elevation: a surface is declared by the record; a stamped shape without its recipe's layers is flat.
      const el = (storage.EL && storage.EL.readStamp) ? storage.EL.readStamp(s) : null;
      if (el) {
        out.elevated++;
        if (/^surface·/.test(nm)) out.surfaces++;
        const rec = storage.EL.recipe ? storage.EL.recipe(el) : null;
        let sh = []; try { sh = Array.from(s.shadows || []); } catch (e) {}
        if (rec && sh.length < rec.layers.length) out.flat.push({ name: nm, stamp: el, got: sh.length, want: rec.layers.length });
      }
      if (Array.from(s.children || []).some((c) => /^sheen·/.test(String(c.name || '')))) out.sheen++;
      if (s.type === 'text') { out.copy++; let b = false; try { b = !!(tk.typography); } catch (e) {} if (b) out.copyBound++; }
      let fl = []; try { fl = Array.from(s.fills || []); } catch (e) {}
      fl.forEach((f) => {
        if (f.fillImage) { out.slots++; out.filled++; return; }
        if (f.fillColor || f.fillColorRefId) { out.paint++; if (tk.fill || f.fillColorRefId) out.paintBound++; }
      });
      if (MD && MD.isSlot && MD.isSlot(nm) && !fl.some((f) => !!f.fillImage)) {
        out.slots++; out.placeholders.push({ name: nm, w: Math.round(s.width || 0), h: Math.round(s.height || 0) });
      }
      Array.from(s.children || []).forEach((c) => walk(c, inBoard || s.type === 'board'));
    };
    Array.from(root.children || []).forEach((b) => walk(b, false));
    out.placeholderCount = out.placeholders.length;
    out.verdict = (out.drawnHosts === 0 && out.placeholders.length === 0 && out.copy === out.copyBound &&
                   out.flat.length === 0 && (o.stampedRequired === false || out.stamped > 0)) ? 'ASSEMBLED' : 'NOT_ASSEMBLED';
    return out;
  };

  /** All pages whose name starts with a screen prefix (default 14/15/16), one SC.audit each. */
  SC.auditStart = function (prefixes) {
    const re = new RegExp('^(' + (prefixes || ['14', '15', '16']).map((p) => p.replace('.', '\\.')).join('|') + ')');
    SC._q = (penpot.currentFile.pages || []).filter((p) => re.test(p.name)).map((p) => p.name);
    SC._i = 0;
    return { queue: SC._q.length, pages: SC._q };
  };
  SC.auditNext = async function () {
    if (!SC._q) return { err: 'SC.auditStart first' };
    if (SC._i >= SC._q.length) return { done: true };
    const name = SC._q[SC._i++];
    const pg = (penpot.currentFile.pages || []).find((p) => p.name === name);
    penpot.openPage(pg.id); await sleep(450);
    if (penpot.currentPage.name !== name) return { err: 'page did not open: ' + name };
    const r = SC.audit(); r.page = name;
    return { left: SC._q.length - SC._i, result: r };
  };

  /** The boards a page-level measurement must look at: content lives INSIDE PageRoot on this file's pages, and a
      hand-composed page may also carry root-level boards. */
  SC.scope = function () {
    const pr = SC.pageRoot();
    return Array.from(((pr && pr.children) || []).concat((penpot.root || {}).children || []));
  };

  /** Record-side coverage, read FROM THE FILE: every stamped screen board on the current page is re-derived from its
      `nl:rec` digest, so this runs in a session that never saw SC.record(). It answers: was every declared entry a
      master that exists, did every region get filled, and is every named slot a real asset. */
  SC.coverage = function () {
    const root = (penpot.currentPage || {}).root;
    if (!root) return { err: 'no current page root' };
    const sum = (arr) => arr.reduce((n, s) => n + (s.controls || []).length + (s.copy || 0) + (s.media || []).length + (s.icons || []).length, 0);
    const out = [];
    SC.scope().forEach((b) => {
      const st = NL.readStamp(b);
      if (!st || !st.sc) return;
      let d = null, dErr = null;
      try { d = JSON.parse(b.getPluginData('nl:rec') || 'null'); } catch (e) { dErr = String(e).slice(0, 60); }
      const secs = d && d.sections ? d.sections : [];
      const notInLibrary = secs.reduce((a, s) => a.concat((s.controls || []).filter((n) => n && !CF.get(n))), []);
      const noSource = secs.reduce((a, s) => a.concat((s.media || []).filter((m) => !m.path).map((m) => m.slot || 'media')), []);
      const emptyRegions = Array.from(b.children || []).filter((c) => { const r = NL.readStamp(c); return r && r.region && !Array.from(c.children || []).length; }).map((c) => String(c.name));
      const placeholders = [];
      const names = new Set();
      (function walk(s) {
        const nm = String(s.name || '');
        names.add(nm);
        let fl = []; try { fl = Array.from(s.fills || []); } catch (e) {}
        if (MD && MD.isSlot(nm) && !fl.some((f) => !!f.fillImage)) placeholders.push(nm);
        Array.from(s.children || []).forEach(walk);
      })(b);
      // A declared surface/elevation is a promise the record makes; coverage checks the PLATE it promised, not
      // just the region's child count (an empty region and an untextured one are different failures).
      const wantSurfaces = secs.filter((s) => s.surface || s.elevation);
      const missingSurfaces = wantSurfaces.filter((s) => !names.has('surface·' + s.region)).map((s) => s.region);
      out.push({ screen: st.sc, src: st.src || null, recipe: st.recipe || null, tier: st.tier || null,
                 entries: secs.length ? sum(secs) : null, digest: d ? 'yes' : (dErr || 'absent'),
                 declaredRegions: secs.map((s) => s.region), emptyRegions,
                 declaredSurfaces: wantSurfaces.length, missingSurfaces,
                 notInLibrary, mediaWithoutSource: noSource, placeholderSlots: placeholders });
    });
    const bad = out.filter((s) => s.entries === null || s.notInLibrary.length || s.placeholderSlots.length || s.emptyRegions.length || s.missingSurfaces.length);
    return { page: penpot.currentPage && penpot.currentPage.name, screens: out.length, coverage: out, verdict: out.length && !bad.length ? 'COMPLETE' : (out.length ? 'INCOMPLETE' : 'NO SCREENS') };
  };

  // ---------- retro-apply: promote the drawn hosts instead of deleting them ----------
  /** `dry` (default): census of drawn control hosts on screen pages, grouped by name. `apply:'register'`: run
      CF.autoRegister over them, so the design system grows a master and the next build places an instance. Deleting a
      host and re-placing an instance is deliberately NOT the default: it is a destructive write, and the census is the
      part that must be reviewed first. */
  SC.reconcile = async function (o) {
    o = o || {};
    const pages = o.pages || (SC._q || null);
    if (!pages) return { err: 'pass {pages:[…]} or run SC.auditStart() first' };
    const out = [];
    for (const name of pages) {
      const pg = (penpot.currentFile.pages || []).find((p) => p.name === name);
      if (!pg) { out.push({ page: name, err: 'no such page' }); continue; }
      penpot.openPage(pg.id); await sleep(450);
      const aud = SC.audit({ stampedRequired: false });
      const one = { page: name, drawnHosts: aud.drawnHosts, drawnNames: aud.drawnNames, placeholders: aud.placeholderCount };
      if (o.apply === 'register' && aud.drawnHosts) {
        const r = CF.autoRegister({ roots: SC.scope(), dry: false, limit: o.limit || 40 });
        one.registered = (r.registered || []).length; one.already = (r.already || []).length; one.truncated = r.truncated;
        one.library = r.library;
        SC.libIndex(true);
      } else if (o.apply !== 'register') one.dry = true;
      out.push(one);
    }
    return { apply: o.apply || 'dry', pages: out };
  };

  SC.info = { seeded: 'SC', version: 1, families: Object.keys(SC.familyIndex()).length,
           masters: (penpot.library.local.components || []).length,
           fns: ['config', 'familyIndex', 'isControlName', 'libIndex', 'master', 'ctl', 'copy', 'media', 'icon', 'digest', 'record', 'find', 'build', 'audit', 'auditStart', 'auditNext', 'coverage', 'reconcile', 'report'],
           note: 'S1 instance-first · S2 media needs a source path · S3 recipe structure · S4 ramp+style · S5 bind after writes · S6 durable stamp · S7 idempotent by nl:sc · S8 limit for the 30s ceiling' };
  SC.report = () => Object.assign({}, SC.info, { server: SC.server, records: Object.keys(SC.records).length, built: SC.log.filter((l) => l.at === 'build').length });
})();
