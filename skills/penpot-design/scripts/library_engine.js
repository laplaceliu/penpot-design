// library_engine.js — **library pairing** (storage.LM). A host UI library (headless or styled) becomes the exact
// component contract the Penpot design system must build, 1:1 at the chosen granularity.
//
//   LM.load(manifest)                 // assets/libraries/<name>.json (see references/library-pairing.md)
//   LM.validate(CF)                   // every mapped factory exists; designFamily unique
//   LM.ensureProfiles(CF)             // add a derived profile for each mapped factory family
//   LM.buildPage({page,parent,x,y})   // build the manifest's components assigned to that page
//   LM.indexPage({parent,x,y,replace})// page 13: one row per namespace, behaviour-only included
//   LM.stamp(root) / LM.hydrate()     // durable `nl:lib` stamp on PageRoots
//   LM.audit()                        // library masters vs manifest: covered / missing / extras
//
// Headless libraries describe ANATOMY + BEHAVIOUR, not styling variants. Pairing therefore draws one representative
// component (factory or anatomy board) and lists its parts/states; do NOT invent a primary/secondary variant matrix.
// A component with no factory is `custom` and gets an anatomy board; a behaviour-only component is `nonVisual` and is
// indexed on page 13 with no master. The audit's `library_drift` rule consumes pageFams()/audit().
return (function () {
  const LM = {};
  storage.LM = LM;
  LM.manifest = null;
  LM.active = false;
  LM.granularity = 'namespace';
  LM.errors = [];

  const pageNum = (p) => { const m = String(p || '').match(/^(\d{2})/); return m ? m[1] : null; };
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const names = (s) => Array.from(new Set((s || []).map((x) => String(x))));

  LM.load = function (manifest) {
    if (!manifest || !Array.isArray(manifest.components)) return { err: 'manifest.components[] required' };
    LM.manifest = manifest;
    LM.active = true;
    LM.granularity = manifest.granularity || 'namespace';
    const seen = {};
    LM.errors = [];
    manifest.components.forEach((c) => {
      if (!c.name || !c.designFamily) LM.errors.push('component missing name/designFamily: ' + JSON.stringify(c).slice(0, 80));
      if (seen[c.designFamily]) LM.errors.push('duplicate designFamily ' + c.designFamily);
      seen[c.designFamily] = 1;
    });
    return LM.summary();
  };

  LM.summary = function () {
    const cs = (LM.manifest && LM.manifest.components) || [];
    return { name: LM.manifest && LM.manifest.name, active: LM.active, granularity: LM.granularity,
      components: cs.length, parts: cs.reduce((a, c) => a + (c.parts || []).length, 0),
      visual: cs.filter((c) => c.kind === 'visual').length,
      nonVisual: cs.filter((c) => c.kind !== 'visual').length, errors: LM.errors };
  };

  LM.all = function () { return ((LM.manifest && LM.manifest.components) || []).slice(); };
  LM.visual = function () { return LM.all().filter((c) => (c.kind || 'visual') === 'visual'); };
  LM.nonVisual = function () { return LM.all().filter((c) => (c.kind || 'visual') !== 'visual'); };
  LM.byPage = function (page) { const p = pageNum(page); return LM.all().filter((c) => String(c.page) === p); };
  /** Block pages (`03.01 · …`) carry ONE canonical family; filter the chapter manifest to it. Chapter pages keep
      the whole-page list for legacy manifests. */
  const blockFor = (page) => (storage.CATALOG && storage.CATALOG.blockFor) ? storage.CATALOG.blockFor(page) : null;
  const onBlock = (list, page) => {
    const b = blockFor(page);
    if (!b) return list;
    return list.filter((c) => String(c.designFamily).toLowerCase() === String(b.family).toLowerCase());
  };
  /** Design-family names assigned to a page (visual only); the audit requires exactly these spec boards. */
  LM.pageFams = function (page) {
    return names(onBlock(LM.byPage(page), page).filter((c) => (c.kind || 'visual') === 'visual').map((c) => c.designFamily));
  };
  LM.pagePlan = function (page) {
    return onBlock(LM.byPage(page), page).map((c) => ({ name: c.name, designFamily: c.designFamily, page: c.page,
      group: c.group, factory: c.factory || 'custom', kind: c.kind || 'visual', parts: c.parts || [], states: c.states || [] }));
  };
  LM.factoryIndex = function (CF) {
    const map = CF.map ? CF.map() : {}, set = {};
    Object.keys(map).forEach((g) => (map[g] || []).forEach((f) => { set[f] = g; }));
    return set;
  };
  /** Mapping health: every non-custom visual factory must exist; design families unique. */
  LM.validate = function (CF) {
    const fi = LM.factoryIndex(CF);
    const missingFactories = [], unknownGroups = [], custom = [], nonVisual = [];
    LM.visual().forEach((c) => {
      if (c.factory === 'custom') { custom.push(c.designFamily); return; }
      if (!fi[c.factory]) missingFactories.push({ component: c.name, factory: c.factory });
      if (c.group && ['actions', 'forms', 'selection', 'data', 'navigation', 'feedback', 'ai', 'utility'].indexOf(c.group) < 0) unknownGroups.push(c.name + ':' + c.group);
    });
    LM.nonVisual().forEach((c) => nonVisual.push(c.name));
    return { ok: missingFactories.length === 0 && LM.errors.length === 0, missingFactories, unknownGroups, custom, nonVisual,
      coverage: { components: LM.all().length, mapped: LM.visual().length - custom.length, custom: custom.length, nonVisual: nonVisual.length } };
  };
  /** Seed a derived profile for every mapped factory family (idempotent). */
  LM.ensureProfiles = function (CF) {
    const added = [];
    LM.visual().forEach((c) => {
      if (c.factory === 'custom') return;
      const r = CF.derivedProfile ? CF.derivedProfile(c.group || 'feedback', c.factory, { material: 'source' }) : null;
      if (r && r.added) added.push(c.factory);
    });
    return { added: names(added) };
  };

  /** Durable library contract on the PageRoot: compact enough for pluginData, rich enough to hydrate. */
  LM.payload = function () {
    const m = LM.manifest || {};
    return JSON.stringify({ name: m.name || null, version: m.version || null, granularity: LM.granularity,
      source: m.source || null,
      components: LM.all().map((c) => ({ name: c.name, designFamily: c.designFamily, page: c.page, group: c.group,
        factory: c.factory || 'custom', kind: c.kind || 'visual', parts: c.parts || [], states: c.states || [] })) });
  };
  LM.stamp = function (root) {
    root = root || (penpot.root && (penpot.root.children || []).filter((c) => /-PageRoot$/.test(String(c.name)))[0]);
    if (!root || !root.setPluginData) return { err: 'no PageRoot' };
    try { root.setPluginData('nl:lib', LM.payload()); return { stamped: 1, name: LM.manifest && LM.manifest.name }; }
    catch (e) { return { err: 'stamp: ' + String(e).slice(0, 100) }; }
  };
  LM.hydrate = function (root) {
    root = root || penpot.root;
    const pr = (root && root.children || []).filter((c) => /-PageRoot$/.test(String(c.name)))[0];
    let raw = null; try { raw = pr && pr.getPluginData ? pr.getPluginData('nl:lib') : null; } catch (e) {}
    if (!raw) return null;
    let m = null; try { m = JSON.parse(raw); } catch (e) { return null; }
    LM.manifest = Object.assign({ granularity: 'namespace' }, m);
    LM.active = true;
    return LM.summary();
  };
  LM.ensure = function () {
    if (LM.active && LM.manifest) return true;
    return !!LM.hydrate();
  };

  /** Audit the live library against the manifest. Part-level masters count as coverage of their namespace. */
  LM.audit = function () {
    if (!LM.manifest) return { err: 'no manifest — LM.load() or LM.hydrate()' };
    let comps = [];
    try { comps = Array.from(penpot.library.local.components || []).map((c) => String(c.name)); } catch (e) {}
    const heads = names(comps.map((n) => n.split('·')[0]));
    const headSet = {}; heads.forEach((h) => headSet[h] = 1);
    const partSet = {};
    LM.all().forEach((c) => (c.parts || []).forEach((p) => partSet[p] = c.designFamily));
    const familySet = {}; LM.visual().forEach((c) => familySet[c.designFamily] = 1);
    const missing = LM.visual().filter((c) => !(headSet[c.designFamily] || (c.parts || []).some((p) => headSet[p])))
      .map((c) => ({ name: c.name, designFamily: c.designFamily, page: c.page, factory: c.factory }));
    const extras = heads.filter((h) => !familySet[h] && !partSet[h]);
    return { name: LM.manifest.name, libraryMasters: comps.length, heads: heads.length,
      visualFamilies: Object.keys(familySet).length, missing, extras,
      verdict: (missing.length || extras.length) ? 'NEEDS_REPAIR' : 'CLEAN' };
  };

  /** Settle, bind tokens and adopt any typed shadow: a paired spec board must pass the same gates as a built one. */
  LM.finish = async function (b) {
    try { if (storage.NL && storage.NL.settle) await storage.NL.settle(450); } catch (e) {}
    try { if (storage.NL && storage.NL.settle) await storage.NL.settle(250); } catch (e) {}
    try { if (storage.TK && storage.TK.bindBoard) await storage.TK.bindBoard(b, { snapSpace: true }); } catch (e) {}
    // Type styles are a separate library channel (a token set never fills `library.local.typographies`). Apply them to
    // the spec copy so the paired page does not ship declared ramp steps with no `tokens.typography` binding.
    try {
      if (storage.TP && storage.TP.apply) {
        const applyType = (k) => { if (k.type === 'text') { try { storage.TP.apply(k); } catch (e) {} } (k.children || []).forEach(applyType); };
        applyType(b);
      }
    } catch (e) {}
    try {
      if (storage.EL) {
        if (storage.EL.adopt) storage.EL.adopt(b, 'card');
        if (storage.EL.bindStamped) await storage.EL.bindStamped(b);
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
    return b;
  };

  // ---------------------------------------------------------------- spec boards
  LM.specFrame = function (entry, o) {
    o = o || {};
    const w = o.w || 720;
    const b = (storage.NL && storage.NL.frame)
      ? storage.NL.frame(entry.designFamily + '·Spec', { x: o.x || 0, y: o.y || 0, w: w, h: 8, dir: 'column', breath: 'group', pad: 24, sizing: { h: 'fix', v: 'auto' }, clip: false })
      : storage.mkAbsBoard(entry.designFamily + '·Spec', o.x || 0, o.y || 0, w, 240, null, 0);
    if (o.parent) { try { o.parent.appendChild(b); b.layoutChild.absolute = true; b.x = o.x || 0; b.y = o.y || 0; } catch (e) {} }
    const T = storage.T;
    const head = storage.mkText(entry.designFamily + ' · ' + (entry.category || ''), 0, 0, 20, T.onSurface, 600); head.name = 'title·' + entry.designFamily;
    storage.NL.add(b, head, 'fill', 'auto');
    const meta = storage.mkText((entry.kind === 'nonVisual' ? 'behaviour-only · no master' : 'factory: ' + (entry.factory || 'custom')) +
      ' · states: ' + ((entry.states || []).join(' / ') || '—') + ' · ' + (entry.source || ''), 0, 0, 12, T.secondary, 400);
    meta.name = 'axis · meta'; storage.NL.add(b, meta, 'fill', 'auto');
    if ((entry.parts || []).length) {
      const pl = storage.mkText('Parts · ' + entry.parts.join('  ·  '), 0, 0, 12, T.muted, 400);
      pl.name = 'axis · parts'; storage.NL.add(b, pl, 'fill', 'auto');
    }
    return b;
  };

  /** A neutral anatomy board: part chips laid out in a flow column. No styling opinions, no invented variants. */
  LM.anatomyBoard = async function (entry, o) {
    o = o || {};
    const b = LM.specFrame(entry, o);
    const root = storage.NL.frame(entry.designFamily, { w: o.w ? o.w - 48 : 672, h: 8, dir: 'column', breath: 'block', pad: 16, sizing: { h: 'fix', v: 'auto' }, clip: false });
    storage.NL.add(b, root, 'fill', 'auto');
    const T = storage.T;
    (entry.parts || [entry.designFamily]).forEach((p) => {
      const row = storage.NL.row('part·' + p, { dir: 'row', align: 'center', gap: 12 });
      storage.NL.add(root, row, 'fill', 'auto');
      const chip = penpot.createRectangle();
      chip.name = 'chip·' + p; chip.resize(12, 12); chip.borderRadius = storage.CF.radius('xs');
      chip.fills = [{ fillColor: T.borderStrong, fillOpacity: 1 }];
      storage.NL.add(row, chip, 'fix', 'fix');
      const t = storage.mkText(p, 0, 0, 13, T.onSurface, 500); t.name = 'part·' + p + '·label';
      storage.NL.add(row, t, 'auto', 'auto');
    });
    if (o.finish !== false) await LM.finish(b);
    if (o.register !== false) { try { if (storage.CF && storage.CF.component) storage.CF.component(root, entry.designFamily); } catch (e) {} }
    return { board: b, master: o.register === false ? null : entry.designFamily, mode: 'anatomy' };
  };

  /** Build one manifest component on its page: mapped → one factory representative; custom → anatomy board. */
  LM.buildEntry = async function (entry, o) {
    o = o || {};
    if ((entry.kind || 'visual') !== 'visual') {
      const b = LM.specFrame(entry, o);
      return { board: b, mode: 'nonVisual', master: null };
    }
    if (!entry.factory || entry.factory === 'custom') return await LM.anatomyBoard(entry, o);
    const CF = storage.CF;
    const fn = CF[entry.factory];
    if (!fn) return { err: 'missing factory ' + entry.factory, entry: entry.name };
    const b = LM.specFrame(entry, o);
    let host = null;
    try { host = await fn({ parent: b, x: (o.x || 0) + 24, y: (o.y || 0) + 120, size: 'md' }); }
    catch (e) { return { err: 'factory ' + entry.factory + ': ' + String((e && e.message) || e), board: b }; }
    if (!host) return { err: 'factory ' + entry.factory + ' returned nothing', board: b };
    if (o.finish !== false) await LM.finish(b);
    if (o.register !== false) { try { if (CF.component) CF.component(host, entry.designFamily); } catch (e) {} }
    return { board: b, mode: 'factory', master: o.register === false ? null : entry.designFamily, shape: String(host.name || '') };
  };

  LM.buildPage = async function (o) {
    o = o || {};
    const page = o.page;
    const plan = LM.pagePlan(page);
    if (!plan.length) return { err: 'no manifest components on page ' + page };
    const parent = o.parent;
    if (!parent) return { err: 'parent PageRoot required' };
    let y = o.y === undefined ? 208 : o.y;
    const built = [], gaps = [];
    for (const c of plan) {
      if (o.only && o.only.indexOf(c.name) < 0 && o.only.indexOf(c.designFamily) < 0) continue;
      const r = await LM.buildEntry(c, { parent: parent, x: o.x === undefined ? 80 : o.x, y: y, finish: o.finish, register: o.register });
      if (r.err) gaps.push({ component: c.name, err: r.err }); else { built.push({ component: c.name, mode: r.mode, master: r.master }); y += Math.round((r.board && r.board.height) || 240) + 40; }
      if (o.limit && built.length + gaps.length >= o.limit) break;
    }
    return { page: page, built: built, gaps: gaps, nextY: y, remaining: plan.length - built.length - gaps.length };
  };

  /** Page 13: one documentation row per manifest namespace (visual + behaviour-only). No masters, no style claims. */
  LM.indexPage = async function (o) {
    o = o || {};
    if (!LM.manifest) return { err: 'no manifest — LM.load() or LM.hydrate()' };
    const parent = o.parent;
    if (!parent) return { err: 'parent PageRoot required' };
    const name = 'library·' + (LM.manifest.name || 'host') + '·index';
    const existing = Array.from(parent.children || []).filter((c) => String(c.name || '') === name);
    if (existing.length) {
      if (!o.replace) return { skipped: true, board: existing[0] };
      existing.forEach((c) => { try { (storage.removeTree || ((x) => x.remove()))(c); } catch (e) {} });
    }
    const T = storage.T || {};
    const b = storage.NL.frame(name, { x: o.x === undefined ? 80 : o.x, y: o.y === undefined ? 208 : o.y,
      w: o.w || 1800, h: 8, dir: 'column', pad: 32, gap: 8, sizing: { h: 'fix', v: 'auto' }, clip: false,
      fill: T.surfaceRaised || T.surface || '#FFFFFF' });
    try { parent.appendChild(b); b.layoutChild.absolute = true; b.x = o.x === undefined ? 80 : o.x; b.y = o.y === undefined ? 208 : o.y; } catch (e) {}

    const head = storage.mkText((LM.manifest.name || 'host') + ' · component index', 0, 0, 32, T.onSurface, 700);
    if (head) { head.name = 'title·library'; storage.NL.add(b, head, 'fill', 'auto'); }
    const parts = LM.all().reduce((a, c) => a + (c.parts || []).length, 0);
    const meta = storage.mkText(LM.all().length + ' namespaces · ' + LM.visual().length + ' visual · ' + LM.nonVisual().length +
      ' behaviour-only · ' + parts + ' anatomy parts', 0, 0, 14, T.secondary, 400);
    if (meta) { meta.name = 'axis · meta'; storage.NL.add(b, meta, 'fill', 'auto'); }

    const order = { '03': 0, '04': 1, '05': 2, '06': 3, '07': 4, '08': 5, '09': 6, '13': 7, '18': 8 };
    const labels = { '03': 'Actions', '04': 'Text fields', '05': 'Selection & pickers', '06': 'Data & lists',
      '07': 'Display & media', '08': 'Navigation', '09': 'Overlays & feedback', '13': 'Behaviour-only utilities',
      '18': 'AI & agents' };
    const rows = LM.all().slice().sort((a, c) => {
      const pa = order[String(a.page)] === undefined ? 99 : order[String(a.page)];
      const pc = order[String(c.page)] === undefined ? 99 : order[String(c.page)];
      return pa - pc || String(a.designFamily).localeCompare(String(c.designFamily));
    });
    let last = null;
    rows.forEach((c) => {
      if (c.page !== last) {
        last = c.page;
        const h = storage.mkText('Page ' + c.page + (labels[c.page] ? ' · ' + labels[c.page] : ''), 0, 0, 16, T.onSurface, 600);
        if (h) { h.name = 'axis · page·' + c.page; storage.NL.add(b, h, 'fill', 'auto'); }
      }
      const ps = c.parts || [];
      const preview = ps.slice(0, 6).join(' · ') + (ps.length > 6 ? ' · +' + (ps.length - 6) : '');
      const mode = (c.kind || 'visual') === 'visual'
        ? (c.factory === 'custom' ? 'custom anatomy' : 'factory · ' + c.factory)
        : 'behaviour-only · no master';
      const t = storage.mkText(c.designFamily + '  ·  ' + (c.group || '—') + '  ·  ' + mode + '  ·  ' + ps.length + ' parts' +
        (preview ? '  ·  ' + preview : ''), 0, 0, 12, T.onSurface, 400);
      if (t) { t.name = 'row·' + c.designFamily; storage.NL.add(b, t, 'fill', 'auto'); }
    });
    try { b.setPluginData('nl:libidx', LM.manifest.name || 'host'); } catch (e) {}
    if (o.finish !== false) await LM.finish(b);
    return { board: b, rows: rows.length, visual: LM.visual().length, nonVisual: LM.nonVisual().length, parts: parts };
  };

  return LM.summary();
})();
