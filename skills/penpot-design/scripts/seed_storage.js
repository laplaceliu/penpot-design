// seed_storage.js —— Penpot execute_code 播种引擎
// 用法：整份粘贴进 execute_code 执行一次；每批业务命令前探测 storage.mkText，缺失则重跑本脚本。
// 约定：字面量函数入 storage；tokens 表 storage.T 为单一真源（值同步自 DESIGN.md）。

return (function () {
  // ---- tokens（按 DESIGN.md 填充/替换）----
  storage.T = storage.T || {
    primary: '#2563EB', primaryHover: '#1D4ED8', primaryActive: '#1E40AF', primaryDisabled: '#93C5FD',
    onPrimary: '#FFFFFF', secondary: '#64748B', neutral: '#F8FAFC', surface: '#FFFFFF',
    onSurface: '#0F172A', border: '#E2E8F0', error: '#DC2626', success: '#16A34A',
    radiusMd: 8, radiusLg: 12, padBtnX: 16, fontBtn: 14
  };
  const T = storage.T;

  // ---- 页面工具 ----
  storage.pg = function (name) { return penpotUtils.getPageByName(name); };

  // ---- 板工厂：方案 C（flex 容器 + 全员 absolute + 世界坐标）----
  storage.mkAbsBoard = function (name, x, y, w, h, fill, radius) {
    const b = penpot.createBoard();
    b.name = name; b.x = x; b.y = y; b.resize(w, h);
    b.borderRadius = radius || 0;
    b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    b.addFlexLayout();
    b.flex.dir = 'column';
    try { b.horizontalSizing = 'fixed'; b.verticalSizing = 'fixed'; } catch (e) {}
    return b;
  };

  // ---- 挂载：先 appendChild 再 absolute，再写世界坐标 ----
  storage.absMount = function (parent, child, worldX, worldY) {
    parent.appendChild(child);
    child.layoutChild.absolute = true;
    child.x = worldX; child.y = worldY;
    return child;
  };

  // ---- 文本工厂：CJK 自动选 Noto Sans SC（Penpot 无 CSS 字体栈回退，applyToText 整段生效）----
  // 第 6 参 fontRole：'display' 走 display 字体（按 DESIGN.md 替换 _display），其余走正文体。
  // 铁律：**这个参数必须从一开始就在**。中途才给 mkText 加字体选项，会让前后批次的
  // display 文字字体不一致，而这类不一致几何审计查不出来（只得靠 auditPage().fonts 直方图）。
  const _noto = penpot.fonts.findByName('Noto Sans SC');
  const _latin = penpot.fonts.findByName('Nunito');
  const _display = penpot.fonts.findByName('Anton');   // ← 按 DESIGN.md 的 display 字体替换
  const _variant = (f, w) => f.variants.find(v => v.fontWeight === String(w)) || f.variants.find(v => v.fontWeight === '400');
  storage.mkText = function (str, x, y, size, color, weight, fontRole) {
    const t = penpot.createText(str);
    t.x = x; t.y = y;
    const cjk = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(str);
    // CJK 优先：display 字体通常无中文字形，中文一律回落 Noto
    const font = cjk ? _noto : (fontRole === 'display' && _display ? _display : _latin);
    try { font.applyToText(t, _variant(font, weight || 400)); } catch (e) {}
    if (size) { try { t.fontSize = String(size); } catch (e) {} }
    if (color) { try { t.fills = [{ fillColor: color, fillOpacity: 1 }]; } catch (e) {} }
    return t;
  };

  // ---- 板内居中助手（绝对定位容器；文本创建后 width 已就绪时用）----
  storage.ct = function (b, str, opts) {
    opts = opts || {};
    const t = storage.mkText(str, 0, 0, opts.size, opts.color, opts.weight);
    storage.absMount(b, t, b.x + (b.width - t.width) / 2, b.y + (b.height - t.height) / 2);
    return t;
  };

  // ---- 矩形工厂 ----
  storage.mkRect = function (name, x, y, w, h, fill, radius, stroke, strokeW) {
    const r = penpot.createRectangle();
    r.name = name; r.x = x; r.y = y; r.resize(w, h);
    r.borderRadius = radius || 0;
    r.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
    if (stroke) {
      r.strokes = [{ strokeColor: stroke, strokeOpacity: 1, strokeWidth: strokeW || 1 }];
      try { r.strokeAlignment = 'inner'; } catch (e) {}   // 闭合形状一律 inner
    }
    return r;
  };

  // ---- token chip（页头 token 条）----
  storage.mkChip = function (parent, x, y, label, color) {
    const box = storage.mkAbsBoard('chip-' + label, x, y, 96, 28, color || T.border, 14);
    storage.absMount(parent, box, x, y);
    const t = storage.mkText(label, x + 12, y + 6, 12, T.onSurface);
    storage.absMount(parent, t, x + 12, y + 6);
    return box;
  };

  return { seeded: true, tokens: Object.keys(T).length,
           fns: ['mkAbsBoard', 'absMount', 'mkText', 'mkRect', 'mkChip', 'pg'] };
})();
