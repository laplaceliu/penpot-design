# 引擎与配方（battle-tested）

构建与修复引擎代码**全部外置到 `scripts/`**（可独立粘贴执行）；本文只留机理、用法、模板与页面配方。

| 脚本 | 内容 | 用法 |
|---|---|---|
| `scripts/seed_storage.js` | tokens `storage.T`、`mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`mkChip`/`ct`/`pg` | 每会话先跑；storage 丢失后重播种 |
| `scripts/repair_engines.js` | `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans` | 跑一次种入 storage，逐页调用 |
| `scripts/fix_layout.js` | flex 压塌修复（getDesignSize + absRow + fixCol，两轮收敛） | 在目标页直接执行 |
| `scripts/audit_layout.js` | 定位审计（`auditPage`/`auditAll`，五类签名 + 字体直方图，只读） | 每板建成即跑；收尾后复算 |
| `scripts/fix_geometry.js` | 几何修补（列偏移/板高/根高/右溢出，四引擎，全支持 dry-run） | 审计出清单后逐页修 |
| `scripts/scaffold_structure.js` | 固定 16 页骨架 | code-to-design 第一步 |

> **顺序铁律**：`seed_storage.js`（G1）→ 建板（每板 `audit_layout.js` 单板审计，G3）→
> **阶段一几何**：`fix_geometry.js` 的 `fixGeometryAll({apply:false})` 出清单 → 复核 → `{apply:true}`
> → **阶段二对齐**：`repair_engines.js` 收尾（`cleanOrphans → alignPage → vAlignPage → fixInner → unclip`，G4）→
> `audit_layout.js` 复算至 `CLEAN`（G5）。
>
> **两阶段不可合并、且不必都跑**：实测 121 条越界全部由几何引擎解决，`vAlignPage` 命中 0；
> 先跑对齐引擎会在错误基准上吸附、引入误伤。**先诊断签名，再决定调哪个引擎。**
> 签名判定与噪声规则见 `references/positioning-audit.md`。

通用 runner（引擎/修复逐页执行；**尾部预切下一页，探测前必须先核对 `penpot.currentPage.name`**）：

```js
const q = storage.xxxQueue;
if (penpot.currentPage.name !== q[0]) { penpot.openPage(storage.pg(q[0])); return {wait: penpot.currentPage.name}; }
const pg = q.shift();
const r = storage.engineFn();
if (q.length) penpot.openPage(storage.pg(q[0]));
return { page: pg, ...r, remaining: q.length };
```

## 1. 修复引擎（代码：scripts/repair_engines.js）

- **alignPage**：文本吸附"包含其世界中心的最小宿主（rect/ellipse，24≤边长，面积≤20000）"；本应居中（垂直偏差≤6px、大宿主≤3px）则吸附宿主精确中心；页级直接文本跳过；Breadcrumbs 流式重排、Tabs 按 120px 列居中。**全程世界坐标**（混用 parentX 会产生跨层级假包含误吸附）。
- **vAlignPage**：小板（≤70px 高）单行直接子文本垂直居中（偏差 5–15px 才触发），带**堆叠守卫**（同板 x 重叠≥50% 且 y 相差>4 = 刻意堆叠，跳过）。
  - 误伤恢复：记录修复日志 → 对刻意非居中的元素按已知设计坐标还原（如 Number Field ＋ at y=−2 / － at y=22；Progress 标签 y=0）。
- **fixInner**：全文件描边批修（闭合形状→`inner`，路径→`center`；机理见 api-pitfalls.md §3）。
- **unclip**：全文件 `clipContent=false`（修复辉光被裁不可见；机理见 api-pitfalls.md §4）。
- **cleanOrphans**：清根级孤儿文本（历史崩溃残留，会污染遍历）。

修复日志返回 `[{位置, 内容, 轴, 偏移}]`，**先审计复核再进下一页**。

### gridSnap — 网格吸附（模板，未封装）

以标准网格推算期望位置，容差外批量吸附。日历示例（列心/行心公式按实际布局参数化）：

```js
const colCx = (c) => 21 + c * 29.14;
const rowCy = (r) => 119 + r * 31;
for (const c of kids) {
  if (c.type === 'text' && /^\d{1,2}$/.test(c.characters)) {
    // 找 (r,col) 使 |中心-格心| 最小；>0.5 则吸附
  }
}
```

注意：吸附前先跑一次审计（收集偏移清单返回人工复核），确认期望位置模型正确再批量修——期望模型错了会把全部元素修错（实例：弱化色规则写反把 17–30 整行误伤）。

### 专用修复模式

- **弧线路径重建**：删旧 path → `bez()` 生成（api-pitfalls.md §2）→ appendChild（世界坐标 d 无需再定位）。
- **连续路径箭头气泡**：气泡轮廓 + V 形箭头一条路径，圆角 kappa 近似；文字重新 appendChild 置顶层并按渲染宽高居中。
- **崩溃损伤修复**：walk 检测 100×100 非文本图元 → 按设计规格 resize（板 + 贴边子元素，头板必须处理）。
- **跨页删除**：先 `penpot.openPage` 该页（等切换生效），再 remove。

## 2. 构建种子与组件工厂

种子与基础工厂以 `scripts/seed_storage.js` 为单一真源（tokens 值同步 DESIGN.md）。方案 C 关键细节与三方案实测行为见 api-pitfalls.md §10。

组件工厂模板（固定尺寸组件 = 板属性 + 文字层，全走 `absMount`；阴影颜色**必须对象格式** `{color, opacity}`——字符串 hex 静默变黑）。主题参数按 DESIGN.md 替换：

```js
storage.mkButtonA = (label, x, y, opts = {}) => {
  const h = opts.h || 45, w = opts.w || 160;
  const b = storage.mkAbsBoard('Button / ' + label, x, y, w, h, '#F8F8F0', opts.radius ?? 50);
  const st = opts.type || 'default';
  if (st === 'primary') {                       // 3D 像素阴影：blur=0 + offsetY=线厚
    b.strokes = [{ strokeColor: '#F8F8F0', strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner' }];
    b.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 5, blur: 0, spread: 0, color: { color: '#BDAEA0', opacity: 1 } }];
  } else if (st === 'danger') {
    b.fills = [{ fillColor: '#E05A5A', fillOpacity: 1 }];
    b.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 5, blur: 0, spread: 0, color: { color: '#C94444', opacity: 1 } }];
  } else {                                      // 软阴影：blur 4 + 低不透明度
    b.strokes = [{ strokeColor: '#C4B89E', strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner' }];
    b.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: { color: '#3D3428', opacity: 0.06 } }];
  }
  const t = storage.mkText(label, x + w / 2, y + h / 2, opts.fs || 14, '#794F27', 600);
  storage.absMount(b, t, x + (w - t.width) / 2, y + (h - t.height) / 2);
  return b;
};
```

3D 像素阴影 vs 软阴影参数对照（Shadow/press 效果通用）：

| 效果 | offsetX/Y | blur | spread | color.opacity |
|---|---|---|---|---|
| 3D 硬阴影（按下前） | 0, 5 | 0 | 0 | 1（深一档同系色） |
| 软阴影 | 0, 2 | 4 | 0 | 0.06（黑色） |
| 卡片浮起 | 0, 3 | 10 | 0 | 0.10（黑色） |
| 内阴影（输入框/轨道） | style:'inner-shadow', 0, 2 | 4 | 0 | 0.08~0.2 |
| 焦点环（黄） | 两层：0,3,0,0 深黄 1.0 + 0,0,0,3 亮黄 0.15 | | | |

## 3. flex 压塌批量修复（代码：scripts/fix_layout.js）

症状：导出图上按钮/卡片被压成文字大小（flex hug）。三步：absolute 化 → 按名称恢复设计尺寸 → 自底向上重排行与容器，两轮收敛。

- `getDesignSize` 名称映射表是**项目相关的**，粘贴前按目标设计系统组件命名改写。
- **顺序陷阱**：先 absRow（行定型）后 fixCol（容器修正）；fixCol 跳过 `absolute` 子树——否则把 absolute 元素重新压回内容尺寸（实测教训）。

## 4. 页面组装模式（Dashboard/Landing/Login/List 管理/Detail 详情/Settings 表单）

外层整页板（方案 C）+ 分区手工布局。要点：

1. 整页板 1440 宽，y 分区：Navbar(100-180) → Hero(200-660) → Stats(700-820) → Features(880-1490) → Showcase(1520-2180) → FAQ(2210-2660) → CTA(2680-2840) → Footer(2880+)。
2. 分区标题统一：燕子尾 Path + 圆角胶囊板 + 居中文字（复用 Title 配方）。
3. Dashboard 双栏：侧栏 240px 固定 + 内容区偏移 x+240；表格斑马纹/hover 行用**全宽色板垫底**（append 顺序控制 z 序，垫底层先 append）。
4. Login 居中卡 + 装饰椭圆（ellipse 直接 append 页板）。
5. 页内组件直接按配方坐标重画（脚本无法实例化库组件），保持 tokens 一致即视觉一致。

## 5. 崩溃后重建清单

浏览器/插件崩溃 → storage 全丢。按序重建：

1. `scripts/seed_storage.js` 重播种（T/fonts/mkText/mkAbsBoard/absMount/pg）——一条命令探测+补种；
2. `penpotUtils.getPages()` 盘点页面结构，确认画布损伤（100×100 退化检测见 api-pitfalls.md §8）；
3. 板 id 全部重新收集（旧 id 失效）；
4. 用户报告"某组件缺失"时优先怀疑：组件删除连带主实例、超时落错页误删、崩溃退化——按 api-pitfalls.md §6/§11/§8 逐一排查。
