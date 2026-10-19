// scaffold_structure.js — build the fixed 18-page skeleton of references/penpot-structure.md §2–§3.
// Usage: run seed_storage.js first, then run this script repeatedly (queue-runner mode, one batch per call) until it returns {done:true}.
// Re-runnable at any moment: existing pages and PageRoots are skipped, and phase 3 always re-fits PageRoot to its *used* height —
// so running it again after the content is built is the delivery-time height fix (§3 rule 5: never pad a page to a round number).
// PageRoot is always 1920 — the spec-sheet canvas, not a screen. Screen widths come from the tier (LY.TIERS: web 1440 / pad 834 / mobile 375).

var CANVAS_W = 1920, CONTENT_X = 80, CONTENT_R = 1840;
var HEADER_H = 160, FOOTER_H = 80, CONTENT_Y = 256, MIN_H = 1000;
// CONTENT_Y = header bottom (160) + one LY.SPACE step (96): 240 produced an 80px chrome→content gap, and 80 is not on
// the spacing scale, so designGate flagged the scaffold itself (measured). 96 is on-scale; fit() uses this as the floor.

// The page contract, one row per §2 line: n = page name, d = header description, t = token reference line.
var PAGES = [
  { n: '00 · Cover', d: 'Identity: name, version, style keywords, the tone ramps, table of contents', t: 'Palette · Type ramp · Spacing · Radius · Elevation' },
  { n: '01 · Foundations', d: 'Palette, type ramp, spacing, grid, radius, elevation, icons, strokes', t: 'colors.* · §3.2 type ramp · LY.SPACE · LY.TIERS · CF.radius · CF.glyphKinds' },
  { n: '02 · Color in use', d: 'Semantic roles, state layers, contrast matrix, light vs dark, data colors', t: 'tone wash/hue/ink · CF.STATE · WCAG 4.5:1 · categorical ramp' },
  { n: '03 · Actions', d: 'One Family·Spec per CF.map().actions family', t: 'CF.map().actions · control height ladder · CF.STATE' },
  { n: '04 · Text fields', d: 'Field, input, textarea, search, password, masked, OTP, number, upload, color', t: 'CF.map().forms ∩ fields · label/input gap · ctx.ring focus' },
  { n: '05 · Selection & pickers', d: 'Select, combobox, multi, date, time, switch, checkbox, radio, slider, rating, transfer, tree', t: 'CF.map().forms ∩ pickers · CF.STATE.toggle · touch floor' },
  { n: '06 · Data & lists', d: 'Table header/row/state, list item, descriptions, timeline, accordion, carousel, calendar', t: 'LY.ROWS · quantized row heights · CF.map().data ∩ lists' },
  { n: '07 · Display & metrics', d: 'Card, KPI, badge, status, chip, avatar, progress, skeleton, empty state', t: 'CF.map().data ∩ display · elevation · tone wash/ink' },
  { n: '08 · Navigation', d: 'Nav item, tabs, tab band, breadcrumb, pagination, steps, menu, command palette, anchor', t: 'CF.map().navigation · tab heights · pagination cell' },
  { n: '09 · Overlays & feedback', d: 'Modal, drawer, sheet, popover, popconfirm, tooltip, toast, notification, alert, spin — each over its real host', t: 'scrim alpha · CF.STATE · z-order (fixZOrder)' },
  { n: '10 · App shell & chrome', d: 'App bar, side nav, toolbar, page title, footer, mobile bar + the LY.slots anatomies', t: 'CF.map().shell · LY.slots · layout-library §2' },
  { n: '11 · Grid & breakpoints', d: 'Columns, gutters, container ladder, collapse order, touch floor, fold anatomy', t: 'LY.TIERS · LY.container · CF.minHit · LY.fold' },
  { n: '12 · Screen recipes', d: 'One annotated skeleton per LY.keys() + the tier-gate table', t: 'LY.keys() · LY.recipe(key, {tier}) · LY.rect' },
  { n: '13 · Component index', d: 'Registry: every component and variant, its name, its page, its DESIGN.md key', t: 'Family·Type·Size·State·Slot · CF.component · CF.variants' },
  { n: '14 · Screens · app', d: 'App-idiom recipes per selected tier, height from LY bands, one fold marker per board', t: 'LY.recipe · CF.tier · storage.absMount' },
  { n: '15 · Screens · content', d: 'Document-idiom pages, 1600–4000 tall: hero, pricing, article, docs, commerce, report', t: 'LY.flow · totalH · fold·<tier>' },
  { n: '16 · Screens · mobile', d: 'Device frames at 375/390 with the mobile chrome stack', t: 'LY.TIERS.mobile · CF.tier = mobile · 44 targets' },
  { n: '17 · Reference imitation', d: 'Optional: recreation target beside the produced screen + the delta list', t: 'delta list · DESIGN.md omitted' }
];

return (function () {
  if (!storage.mkText) return { err: 'run seed_storage.js first' };
  var T = storage.T, G = function (v) { return Math.round(v / 4) * 4; };
  var estW = function (s, size) {
    return storage.CF && storage.CF.estW ? storage.CF.estW(String(s), size) : String(s).length * size * 0.52;
  };
  var rightX = function (s, size) { return G(Math.max(CONTENT_X, CONTENT_R - estW(s, size))); };

  storage.scaffoldContract = function () { return PAGES.map(function (p) { return p.n; }); };

  // Phase 1: create the missing pages (≤6 per call, to avoid the timeout).
  // ⚠️ Measured in this build: `penpot.createPage('00 · Cover')` and `penpot.createPage({name: …})` BOTH ignore the
  // argument — the page lands as `Page N`. Create first, then assign `.name` (assignment readback works). Without the
  // assignment every re-run sees the contract pages as "missing" and mints six more generic pages forever.
  var missing = [];
  for (var i = 0; i < PAGES.length; i++) if (!penpotUtils.getPageByName(PAGES[i].n)) missing.push(PAGES[i].n);
  if (missing.length) {
    var batch = missing.slice(0, 6), made = [];
    for (var j = 0; j < batch.length; j++) {
      var pg = null;
      try { pg = penpot.createPage(); } catch (e) { return { err: 'createPage failed for ' + batch[j] + ': ' + String(e).slice(0, 90) }; }
      try { pg.name = batch[j]; } catch (e) { return { err: 'page.name assignment failed for ' + batch[j] + ': ' + String(e).slice(0, 90) }; }
      made.push(pg);
    }
    // readback: report, never assume (the same rule every other gate follows)
    var notApplied = batch.filter(function (n) { return !penpotUtils.getPageByName(n); });
    if (notApplied.length) return { err: 'page names did not apply: ' + notApplied.join(', '), created: made.length };
    return { createdPages: batch, left: missing.length - batch.length };
  }

  // Phase 2: one PageRoot + Header per page (one page per call: page switching needs its own round-trip).
  if (!storage.scaffoldQueue) storage.scaffoldQueue = { fit: false, q: PAGES.map(function (p) { return p.n; }) };
  var st = storage.scaffoldQueue, q = st.q;
  if (!q.length) {
    if (!st.fit) { st.fit = true; st.q = PAGES.map(function (p) { return p.n; }); q = st.q; }
    else { storage.scaffoldQueue = null; return { done: true, pages: PAGES.length }; }
  }

  var pageName = q[0], meta = PAGES.filter(function (p) { return p.n === pageName; })[0];
  if (penpot.currentPage.name !== pageName) {
    penpot.openPage(storage.pg(pageName));
    return { switching: pageName, left: q.length };
  }
  var prefix = pageName.slice(0, 2), rootName = prefix + '-PageRoot';
  var page = storage.pg(pageName), rootKids = Array.from(page.root.children || []);
  var root = rootKids.filter(function (s) { return s.name === rootName; })[0];

  if (!st.fit) {
    if (!root) {
      root = storage.mkAbsBoard(rootName, 0, 0, CANVAS_W, MIN_H, T.neutral, 0);
      root.clipContent = false;   // createBoard already lands the board in the active page root
    }
    var header = root.children && Array.from(root.children).filter(function (s) { return s.name === prefix + '-Header'; })[0];
    if (!header) {
      header = storage.mkAbsBoard(prefix + '-Header', 0, 0, CANVAS_W, HEADER_H, T.surface, 0);
      storage.absMount(root, header, 0, 0);
      var title = storage.mkText(pageName, CONTENT_X, 40, 32, T.onSurface, 600);
      storage.absMount(header, title, CONTENT_X, 40);
      var desc = storage.mkText(meta.d, CONTENT_X, 88, 14, T.secondary, 400);
      storage.absMount(header, desc, CONTENT_X, 88);
      var chips = storage.mkText('tokens · ' + meta.t, CONTENT_X, 120, 12, T.secondary, 400);
      storage.absMount(header, chips, CONTENT_X, 120);
      var stamp = 'v1 · ' + new Date().toISOString().slice(0, 10);
      var meta_ = storage.mkText(stamp, rightX(stamp, 12), 40, 12, T.secondary, 400);
      storage.absMount(header, meta_, meta_.x, 40);
    }
    if (!root.children || !Array.from(root.children).some(function (s) { return s.name === prefix + '-Footer'; })) {
      var footer = storage.mkAbsBoard(prefix + '-Footer', 0, MIN_H - FOOTER_H, CANVAS_W, FOOTER_H, T.surface, 0);
      storage.absMount(root, footer, 0, MIN_H - FOOTER_H);
    }
    q.shift();
    if (q.length) penpot.openPage(storage.pg(q[0]));
    return { scaffolded: pageName, left: q.length };
  }

  // Phase 3: fit = PageRoot height takes the used height of the content column, footer sits at its bottom (§3 rule 5).
  var idx = PAGES.map(function (p) { return p.n; }).indexOf(pageName);
  var footerName = prefix + '-Footer';
  var foot = Array.from(root.children || []).filter(function (s) { return s.name === footerName; })[0];
  if (!foot) {
    foot = storage.mkAbsBoard(footerName, 0, MIN_H - FOOTER_H, CANVAS_W, FOOTER_H, T.surface, 0);
    storage.absMount(root, foot, 0, MIN_H - FOOTER_H);
  }
  var bottom = CONTENT_Y;
  Array.from(root.children || []).forEach(function (s) {
    if (s.name === prefix + '-Header' || s.name === footerName) return;
    bottom = Math.max(bottom, s.y + s.height);
  });
  var fy = G(bottom + 32), h = G(fy + FOOTER_H);
  if (Math.abs(root.height - h) > 1) root.resize(CANVAS_W, h);
  if (Math.abs(foot.y - fy) > 1) { foot.x = 0; foot.y = fy; }
  var nav = (idx > 0 ? 'prev · ' + PAGES[idx - 1].n : 'first page') + '      ' + (idx < PAGES.length - 1 ? 'next · ' + PAGES[idx + 1].n : 'last page');
  var kids = Array.from(foot.children || []);
  var tokens = kids.filter(function (s) { return s.name === 'footerTokens'; })[0];
  if (!tokens) { tokens = storage.mkText('tokens · ' + meta.t, CONTENT_X, fy + 32, 12, T.secondary, 400); tokens.name = 'footerTokens'; }
  storage.absMount(foot, tokens, CONTENT_X, fy + 32);
  var navTxt = Array.from(foot.children || []).filter(function (s) { return s.name === 'footerNav'; })[0];
  if (!navTxt) { navTxt = storage.mkText(nav, rightX(nav, 12), fy + 32, 12, T.secondary, 400); navTxt.name = 'footerNav'; }
  storage.absMount(foot, navTxt, Math.max(CONTENT_X, rightX(nav, 12)), fy + 32);

  q.shift();
  if (q.length) penpot.openPage(storage.pg(q[0]));
  return { fitted: pageName, rootH: h, left: q.length };
})();
