// scaffold_structure.js — build the fixed skeleton of references/penpot-structure.md §2–§3.
// Usage: run seed_storage.js first, then run this script repeatedly (queue-runner mode, one batch per call) until it returns {done:true}.
// Re-runnable at any moment: existing pages and PageRoots are skipped, and phase 3 always re-fits PageRoot to its *used* height —
// so running it again after the content is built is the delivery-time height fix (§3 rule 5: never pad a page to a round number).
// PageRoot is always 1920 — the spec-sheet canvas, not a screen. Screen widths come from the tier (LY.TIERS: web 1440 / pad 834 / mobile 375).
//
// TWO GRANULARITIES (penpot-structure.md §2a):
//   · block pages (DEFAULT for 03–09 and 18) — one codesign-ui component per page, derived from `storage.CATALOG.BLOCKS`
//     (`03.01 · Actions · Clipboard·Spec`). The 19-row PAGES table stays the chapter contract for 00–02 and 10–18.
//   · chapter pages / custom rows — `storage.scaffoldPages(rows)` installs a per-page row list (`{n,d,t}`) and every
//     phase iterates that instead. A shape can never change pages in this API (appendChild AND remove both throw
//     "Cannot modify a page that is not currently active"), so the page must be decided before the first shape is drawn.
// ⚠️ catalog_engine.js MUST be loaded before this runner: if CAT.BLOCKS is absent this file REFUSES rather than
// silently rebuilding the legacy 7-chapter shape (the exact failure mode where a pagination edit "did not take effect").

var CANVAS_W = 1920, CONTENT_X = 80, CONTENT_R = 1840;
var HEADER_H = 160, FOOTER_H = 80, CONTENT_Y = 208, MIN_H = 1000;
// CONTENT_Y = header bottom (160) + 48. The page root is itself an audited band stack (design-guide §2 / rule 14): the
// chrome→content gap, the inter-board gap (32) and the content→footer gap written below (32) must sit within ONE
// LY.SPACE step of each other. 96 broke it (`band gaps 96/32/32/32/32 spread over 3 scale steps`) and 80 was off-scale
// outright; 48 is design-guide §2 "new concern" and one step from 32. fit() uses this as the floor.

// The page contract, one row per §2 line: n = page name, d = header description, t = token reference line.
var PAGES = [
  { n: '00 · Cover', d: 'Identity: name, version, style keywords, the tone ramps, table of contents', t: 'Palette · Type ramp · Spacing · Radius · Elevation' },
  { n: '01 · Foundations', d: 'Palette, type ramp, spacing, grid, radius, elevation, icons, strokes', t: 'colors.* · §3.2 type ramp · LY.SPACE · LY.TIERS · CF.radius · CF.glyphKinds' },
  { n: '02 · Color in use', d: 'Semantic roles, state layers, contrast matrix, light vs dark, data colors', t: 'tone wash/hue/ink · CF.STATE · WCAG 4.5:1 · categorical ramp' },
  { n: '03 · Actions', d: 'One Family·Spec per codesign-ui action component: Button, IconButton, ButtonGroup, SplitButton, FAB, Link, Clipboard, DownloadTrigger, Toggle, ToggleGroup', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '04 · Text fields', d: 'One Family·Spec per codesign-ui form component: Input, Textarea, Search, MaskedInput, Transfer, AngleSlider, DateInput, Editable, Field, Fieldset, FileUpload, NumberInput, PasswordInput, PinInput, SignaturePad, TagsInput', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '05 · Selection & pickers', d: 'One Family·Spec per codesign-ui selection component: Checkbox, ColorPicker, Combobox, DatePicker, TimePicker, RadioGroup, RatingGroup, SegmentGroup, Select, Slider, Switch', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '06 · Data & lists', d: 'One Family·Spec per codesign-ui data component: TableHeader, TableRow, TableState, ListItem, Descriptions, Timeline, MiniCalendar, Carousel, JsonTreeView, Listbox, TreeView', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '07 · Display & media', d: 'One Family·Spec per codesign-ui display/media component: Badge, StatusText, Chip, AvatarGroup, Card, KPI, Skeleton, EmptyState, Avatar, Frame, Highlight, ImageCropper, Marquee, Progress, QrCode, ScrollArea, Splitter, Swap, Timer', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '08 · Navigation', d: 'One Family·Spec per codesign-ui navigation component: NavItem, TabBand, Breadcrumb, CommandPalette, Accordion, Collapsible, Menu, NavigationMenu, Pagination, Steps, Tabs, Toc', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '09 · Overlays & feedback', d: 'One Family·Spec per codesign-ui overlay component: Alert, Notification, Popconfirm, Spin, Sheet, Dialog, Drawer, FloatingPanel, HoverCard, Popover, Toast, Tooltip, Tour', t: 'CAT.BLOCKS · codesign-ui manifest · CF.matrix / anatomy board' },
  { n: '10 · App shell & chrome', d: 'App bar, side nav, toolbar, page title, footer, mobile bar + the LY.slots anatomies', t: 'CF.map().shell · LY.slots · layout-library §2' },
  { n: '11 · Grid & breakpoints', d: 'Columns, gutters, container ladder, collapse order, touch floor, fold anatomy', t: 'LY.TIERS · LY.container · CF.minHit · LY.fold' },
  { n: '12 · Screen recipes', d: 'One annotated skeleton per LY.keys() + the tier-gate table', t: 'LY.keys() · LY.recipe(key, {tier}) · LY.rect' },
  { n: '13 · Component index', d: 'Registry: every component and variant, its name, its page, its DESIGN.md key', t: 'Family·Type·Size·State·Slot · CF.component · CF.variants' },
  { n: '14 · Screens · app', d: 'App-idiom recipes per selected tier, height from LY bands, one fold marker per board', t: 'LY.recipe · CF.tier · storage.absMount' },
  { n: '15 · Screens · content', d: 'Document-idiom pages, 1600–4000 tall: hero, pricing, article, docs, commerce, report', t: 'LY.flow · totalH · fold·<tier>' },
  { n: '16 · Screens · mobile', d: 'Device frames at 375/390 with the mobile chrome stack', t: 'LY.TIERS.mobile · CF.tier = mobile · 44 targets' },
  { n: '17 · Reference imitation', d: 'Optional: recreation target beside the produced screen + the delta list', t: 'delta list · DESIGN.md omitted' },
  { n: '18 · AI & agents', d: 'One Family·Spec per codesign-ui AI composite: conversation, message, prompt input, tools, terminal, previews', t: 'CAT.BLOCKS · library manifest · LM.anatomyBoard' }
];

return (function () {
  if (!storage.mkText) return { err: 'run seed_storage.js first' };
  var T = storage.T, G = function (v) { return Math.round(v / 4) * 4; };
  var estW = function (s, size) {
    return storage.CF && storage.CF.estW ? storage.CF.estW(String(s), size) : String(s).length * size * 0.52;
  };
  var rightX = function (s, size) { return G(Math.max(CONTENT_X, CONTENT_R - estW(s, size))); };

  // ---- 03–09 + 18 block pages: one catalog component per page, derived from CAT.BLOCKS (single inventory) --------
  var BLOCK_ROWS = (function () {
    var CAT = storage.CATALOG;
    if (!CAT || !CAT.BLOCKS || !CAT.BLOCKS.length) return null;
    return CAT.BLOCKS.filter(function (b) { return b.chapter !== '18'; }).map(function (b) {
      var ch = PAGES.filter(function (p) { return p.n === CAT.PAGE_NAMES[b.chapter]; })[0] || { d: '', t: '' };
      var axes = (b.fam && b.fam.axes) || [];
      return {
        n: b.page, d: ch.d, t: (b.fam && b.fam.factory === 'custom' ? 'anatomy board' : 'factory · ' + ((b.fam && b.fam.factory) || 'custom')) + ' · states: ' + (axes.join(' / ') || '—'),
        ch: b.chapter, family: b.family, spec: b.spec
      };
    });
  })();
  var AI_ROWS = (function () {
    var CAT = storage.CATALOG;
    if (!CAT || !CAT.BLOCKS) return [];
    return CAT.BLOCKS.filter(function (b) { return b.chapter === '18'; }).map(function (b) {
      var ch = PAGES.filter(function (p) { return p.n === CAT.PAGE_NAMES[b.chapter]; })[0] || { d: '', t: '' };
      var axes = (b.fam && b.fam.axes) || [];
      return {
        n: b.page, d: ch.d, t: 'anatomy board · states: ' + (axes.join(' / ') || '—'),
        ch: b.chapter, family: b.family, spec: b.spec
      };
    });
  })();
  var DEFAULT_ROWS = (BLOCK_ROWS && BLOCK_ROWS.length)
    ? PAGES.slice(0, 3).concat(BLOCK_ROWS, PAGES.slice(10, 18), AI_ROWS)   // 00–02 · 03–09 · 10–17 · 18
    : PAGES.slice();                                           // only reachable for an explicitly installed row list
  if (!storage._scafRows && !BLOCK_ROWS) {
    return { err: 'the 03–09 standard is one block page per family, derived from storage.CATALOG.BLOCKS — load scripts/catalog_engine.js BEFORE scaffold_structure.js (or call storage.scaffoldPages(rows) before a re-run for a custom list). Refusing to build the legacy seven-chapter shape.' };
  }

  storage.scaffoldContract = function () { return DEFAULT_ROWS.map(function (p) { return p.n; }); };
  /** Install a custom page row list (`[{n,d,t}]`, one row per board). Passing null restores the standard list. */
  storage.scaffoldPages = function (rows) {
    storage._scafRows = rows && rows.length ? rows : null;
    storage.scaffoldQueue = null;
    return (storage._scafRows || DEFAULT_ROWS).length;
  };
  var rowsOf = function () { return storage._scafRows || DEFAULT_ROWS; };
  // `NN.MM · Chapter · Block` pages name their chrome after the full code (04.07-PageRoot); chapter pages keep NN-.
  var prefixOf = function (pageName) { return String(pageName).split(' · ')[0]; };

  // Phase 1: create the missing pages (≤6 per call, to avoid the timeout).
  // ⚠️ Measured in this build: `penpot.createPage('00 · Cover')` and `penpot.createPage({name: …})` BOTH ignore the
  // argument — the page lands as `Page N`. Create first, then assign `.name` (assignment readback works). Without the
  // assignment every re-run sees the contract pages as "missing" and mints six more generic pages forever.
  var missing = [];
  var ROWS = rowsOf();
  for (var i = 0; i < ROWS.length; i++) if (!penpotUtils.getPageByName(ROWS[i].n)) missing.push(ROWS[i].n);
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
  if (!storage.scaffoldQueue) storage.scaffoldQueue = { fit: false, q: ROWS.map(function (p) { return p.n; }) };
  var st = storage.scaffoldQueue, q = st.q;
  if (!q.length) {
    if (!st.fit) { st.fit = true; st.q = ROWS.map(function (p) { return p.n; }); q = st.q; }
    else { storage.scaffoldQueue = null; return { done: true, pages: ROWS.length }; }
  }

  var pageName = q[0], meta = rowsOf().filter(function (p) { return p.n === pageName; })[0] || { n: pageName, d: '', t: '' };
  if (penpot.currentPage.name !== pageName) {
    penpot.openPage(storage.pg(pageName));
    return { switching: pageName, left: q.length };
  }
  var prefix = prefixOf(pageName), rootName = prefix + '-PageRoot';
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
  var idx = rowsOf().map(function (p) { return p.n; }).indexOf(pageName);
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
  var rowsNow = rowsOf();
  var nav = (idx > 0 ? 'prev · ' + rowsNow[idx - 1].n : 'first page') + '      ' + (idx < rowsNow.length - 1 ? 'next · ' + rowsNow[idx + 1].n : 'last page');
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
