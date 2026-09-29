// scaffold_structure.js —— 按 penpot-structure.md 契约创建固定 16 页骨架
// 用法：先跑 seed_storage.js；再反复执行本脚本（队列 runner 模式，一次建一批），直至返回 {done:true}。
// 幂等：页已存在则跳过；PageRoot/页头/页脚已存在不重建。

var PAGES = [
  '00 · 封面', '01 · 设计基础', '02 · 颜色系统', '03 · 基础控件', '04 · 文本与输入',
  '05 · 选择器', '06 · 数据集合', '07 · 展示', '08 · 导航', '09 · 浮层',
  '10 · 反馈与状态', '11 · 数据可视化', '12 · 布局模式', '13 · 组件索引', '14 · Demo',
  '15 · 参考仿写'
];

return (function () {
  if (!storage.mkText) return { err: 'run seed_storage.js first' };

  // 阶段 1：建页（每次调用建 ≤6 页，防超时）
  var missing = [];
  for (var i = 0; i < PAGES.length; i++) {
    if (!penpotUtils.getPageByName(PAGES[i])) missing.push(PAGES[i]);
  }
  if (missing.length) {
    var batch = missing.slice(0, 6);
    for (var j = 0; j < batch.length; j++) penpot.createPage(batch[j]);
    return { createdPages: batch, left: missing.length - batch.length };
  }

  // 阶段 2：逐页建 PageRoot/Header/Footer（一次一页，防切页异步问题）
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
