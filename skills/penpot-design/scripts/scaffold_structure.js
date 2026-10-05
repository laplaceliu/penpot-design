// scaffold_structure.js —— build the fixed 16-page skeleton per the penpot-structure.md contract
// Usage: run seed_storage.js first; then run this script repeatedly (queue-runner mode, one batch per call) until it returns {done:true}.
// Idempotent: skip pages that already exist; don't rebuild PageRoot/Header/Footer that already exist.
// Note: PageRoot is always 1920 — this is the "spec-sheet canvas" (shows component matrices / spec boards), unrelated to the final screen target width.
// The target screen width is decided by the viewport tier (web/pad/mobile), reflected in the page-12 layout-grid boards and page-14 Demo screen boards (see references/viewport-profiles.md).

var PAGES = [
  '00 · Cover', '01 · Design Basics', '02 · Color System', '03 · Basic Controls', '04 · Text & Input',
  '05 · Selectors', '06 · Data Collection', '07 · Display', '08 · Navigation', '09 · Overlay',
  '10 · Feedback & Status', '11 · Data Visualization', '12 · Layout Modes', '13 · Component Index', '14 · Demo',
  '15 · Reference Imitation'
];

return (function () {
  if (!storage.mkText) return { err: 'run seed_storage.js first' };

  // Phase 1: create pages (≤6 pages per call, to avoid timeout)
  var missing = [];
  for (var i = 0; i < PAGES.length; i++) {
    if (!penpotUtils.getPageByName(PAGES[i])) missing.push(PAGES[i]);
  }
  if (missing.length) {
    var batch = missing.slice(0, 6);
    for (var j = 0; j < batch.length; j++) penpot.createPage(batch[j]);
    return { createdPages: batch, left: missing.length - batch.length };
  }

  // Phase 2: build PageRoot/Header/Footer page by page (one page per call, to avoid async page-switch issues)
  if (!storage.scaffoldQueue) {
    storage.scaffoldQueue = PAGES.slice();
  }
  var q = storage.scaffoldQueue;
  if (!q.length) { storage.scaffoldQueue = null; return { done: true }; }

  var pageName = q[0];
  if (penpot.currentPage.name !== pageName) {
    penpot.openPage(storage.pg(pageName));
    return { switching: pageName, left: q.length };
  }
  var rootName = pageName.slice(0, 2) + '-PageRoot';
  var existing = penpotUtils.getPageByName(pageName).root;
  var kids = existing && existing.children ? Array.from(existing.children) : [];
  var hasRoot = kids.some(function (s) { return s.name === rootName; });

  if (!hasRoot) {
    var T = storage.T;
    var root = storage.mkAbsBoard(rootName, 0, 0, 1920, 1200, T.neutral, 0);
    root.clipContent = false;
    var header = storage.mkAbsBoard(rootName.replace('PageRoot', 'Header'), 0, 0, 1920, 160, T.surface, 0);
    storage.absMount(root, header, 0, 0);
    var title = storage.mkText(pageName, 80, 40, 32, T.onSurface, 600);
    storage.absMount(root, title, 80, 40);
    var meta = storage.mkText('v1 · ' + new Date().toISOString().slice(0, 10), 1640, 48, 12, T.secondary);
    storage.absMount(root, meta, 1640, 48);
    var footer = storage.mkAbsBoard(rootName.replace('PageRoot', 'Footer'), 0, 1120, 1920, 80, T.surface, 0);
    storage.absMount(root, footer, 0, 1120);
    return { scaffolded: pageName, left: q.length };
  }

  q.shift();
  if (q.length) penpot.openPage(storage.pg(q[0]));
  return { finished: pageName, left: q.length - 1 };
})();
