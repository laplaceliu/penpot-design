// catalog-engine.js — storage.LM: the optional 131-family catalog and its source-anatomy renderer.
//
// This file replaces the v2 "library pairing + page standard" engine. It has ONE job: when a component definition
// has `renderer:"anatomy"` (the 56 custom codesign-ui families), render its source-derived anatomy as a Penpot board
// that CK can register and bind. It does not own pages, page plans, drift rules or page-level audits.
//
//   LM.load(manifest[, anatomyJson])   // assets/libraries/codesign-ui.json (+ .anatomy.json)
//   LM.attachAnatomy(anatomyJson)      // AN.attach, after anatomy-engine.js is seeded
//   LM.anatomyBoard(entry, {x,y,parent,register:false})
//   LM.summary() / LM.all() / LM.visual() / LM.nonVisual() / LM.byPage(n)
//
// Seed order: component-factory → native-layout → anatomy-engine → catalog-engine → component-engine.
// CK.build('AngleSlider') delegates here; the returned board is then token-bound and registered by CK.
return (function () {
  const LM = {};
  storage.LM = LM;
  LM.manifest = null;
  LM.active = false;
  LM.errors = [];

  const names = (s) => Array.from(new Set((s || []).map((x) => String(x))));
  const pageNum = (p) => { const m = String(p || '').match(/^(\d{2})/); return m ? m[1] : null; };

  LM.load = function (manifest, anatomyJson) {
    if (!manifest || !Array.isArray(manifest.components)) return { err: 'manifest.components[] required' };
    LM.manifest = manifest;
    LM.active = true;
    LM.errors = [];
    const seen = {};
    manifest.components.forEach((c) => {
      if (!c.name || !c.designFamily) LM.errors.push('component missing name/designFamily: ' + JSON.stringify(c).slice(0, 80));
      if (seen[c.designFamily]) LM.errors.push('duplicate designFamily ' + c.designFamily);
      seen[c.designFamily] = 1;
    });
    if (anatomyJson) LM.attachAnatomy(anatomyJson);
    return LM.summary();
  };

  LM.attachAnatomy = function (json) {
    if (!storage.AN || !storage.AN.attach) return { err: 'seed anatomy-engine.js first' };
    const r = storage.AN.attach(json || {});
    return { attached: r && r.attached, components: r && r.components };
  };

  LM.summary = function () {
    const cs = LM.all();
    return { name: LM.manifest && LM.manifest.name, active: LM.active, granularity: (LM.manifest && LM.manifest.granularity) || 'namespace',
      components: cs.length, parts: cs.reduce((a, c) => a + (c.parts || []).length, 0),
      visual: LM.visual().length, nonVisual: LM.nonVisual().length, errors: LM.errors };
  };

  LM.all = function () { return ((LM.manifest && LM.manifest.components) || []).slice(); };
  LM.visual = function () { return LM.all().filter((c) => (c.kind || 'visual') === 'visual'); };
  LM.nonVisual = function () { return LM.all().filter((c) => (c.kind || 'visual') !== 'visual'); };
  LM.byPage = function (page) { const p = pageNum(page); return LM.all().filter((c) => String(c.page) === p); };
  LM.find = function (family) { return LM.all().filter((c) => c.designFamily === family || c.name === family)[0] || null; };
  LM.parts = function (family) { const c = LM.find(family); return c ? (c.parts || []) : []; };

  /** Settle, token-bind and shadow-bind an anatomy board before CK registers it. */
  LM.finish = async function (board) {
    try { if (storage.NL && storage.NL.settle) await storage.NL.settle(450); } catch (e) {}
    try { if (storage.TK && storage.TK.bindBoard) await storage.TK.bindBoard(board, { snapSpace: true }); } catch (e) {}
    try {
      if (storage.TP && storage.TP.apply) {
        const applyType = (node) => {
          if (node.type === 'text') { try { storage.TP.apply(node); } catch (e) {} }
          (node.children || []).forEach(applyType);
        };
        applyType(board);
      }
    } catch (e) {}
    try { if (storage.EL && storage.EL.bindStamped) await storage.EL.bindStamped(board); } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
    return board;
  };

  LM.specFrame = function (entry, o) {
    o = o || {};
    const w = o.w || 720;
    const b = (storage.NL && storage.NL.frame)
      ? storage.NL.frame(entry.designFamily + '·Spec', { x: o.x || 0, y: o.y || 0, w, h: 8, dir: 'column', breath: 'group', pad: 24, sizing: { h: 'fix', v: 'auto' }, clip: false })
      : storage.mkAbsBoard(entry.designFamily + '·Spec', o.x || 0, o.y || 0, w, 240, null, 0);
    if (o.parent) { try { o.parent.appendChild(b); b.layoutChild.absolute = true; b.x = o.x || 0; b.y = o.y || 0; } catch (e) {} }
    const T = storage.T;
    const head = storage.mkText(entry.designFamily + (entry.category ? ' · ' + entry.category : ''), 0, 0, 20, T.onSurface, 600);
    head.name = 'title·' + entry.designFamily;
    storage.NL.add(b, head, 'fill', 'auto');
    const meta = storage.mkText('source anatomy · states: ' + ((entry.states || []).join(' / ') || '—') + ' · ' + (entry.source || ''),
      0, 0, 12, T.secondary, 400);
    meta.name = 'axis · meta'; storage.NL.add(b, meta, 'fill', 'auto');
    if ((entry.parts || []).length) {
      const pl = storage.mkText('Parts · ' + entry.parts.join('  ·  '), 0, 0, 12, T.muted, 400);
      pl.name = 'axis · parts'; storage.NL.add(b, pl, 'fill', 'auto');
    }
    return b;
  };

  /** Render one source-derived anatomy (or its part-tree fallback) as a board CK can register. */
  LM.anatomyBoard = async function (entry, o) {
    o = o || {};
    const b = LM.specFrame(entry, o);
    try { if (b.flex) b.flex.rowGap = 32; } catch (e) {}
    let root = null, mode = 'part-tree';
    if (storage.AN && storage.AN.render) {
      try {
        const r = await storage.AN.render(entry, b, o);
        if (r && r.host) { root = r.host; mode = 'source-anatomy'; }
      } catch (e) { root = null; }
    }
    if (!root) {
      root = storage.NL.frame(entry.designFamily, { w: o.w ? o.w - 48 : 672, h: 8, dir: 'column', breath: 'block', pad: 16, sizing: { h: 'fix', v: 'auto' }, clip: false });
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
    }
    if (o.finish !== false) await LM.finish(b);
    if (o.register !== false) { try { if (storage.CF && storage.CF.component) storage.CF.component(root, entry.designFamily); } catch (e) {} }
    return { board: b, master: o.register === false ? null : entry.designFamily, mode };
  };

  return { seeded: 'LM', fns: ['load', 'attachAnatomy', 'summary', 'all', 'visual', 'nonVisual', 'byPage', 'find', 'parts', 'finish', 'specFrame', 'anatomyBoard'] };
})();
