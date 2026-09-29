# Penpot MCP 自动化实战手册（execute_code）

> 迁移自 penpot-mcp-automation 技能（已并入 penpot-design）。沉淀自多轮完整实战（93 组件 + 变体 + 1920×1080 大屏、33 组件 + 库组件 + Dashboard/Landing/Login/List/Detail/Settings 六典型页面）。
> 详细机理与代码：api-pitfalls.md（陷阱详解）/ engines.md（机理与配方）/ scripts/*.js（种子与引擎代码）。

通过 `penpot` MCP 的 `execute_code` 工具操作 Penpot 文件。所有代码在该工具的沙箱中执行，30 秒超时。

## 1. 会话纪律（每次调用必须遵守）

1. **切页是异步的**：`penpot.openPage(pageObj)` 后在同一调用内创建/修改形状会命中旧页。两种可靠模式：
   - 分步：本调用只切页并返回 `{switching:true}`，下一调用再操作；
   - 队列 runner：`if (penpot.currentPage.name !== q[0]) { penpot.openPage(storage.pg(q[0])); return {wait:true}; }` → `const pg = q.shift(); 操作; if (q.length) penpot.openPage(...)`。**注意 runner 尾部会预切下一页，探测/修复前必须先核对 `penpot.currentPage.name`**。
   - **每条命令开头防御式验证**：`openPage(pg); await sleep(400); if (penpot.currentPage.name !== '目标页') return {err: currentPage.name};`——不匹配立即 return，绝不在错误的页上执行 remove/创建。
2. **页对象**：`openPage` 只接受 Page 对象或 UUID。助手 `storage.pg = n => penpotUtils.getPageByName(n)`。
3. **storage 易失**：插件重连/浏览器崩溃后全丢。每批前探测 `storage.T / storage.mkText / storage.absMount`，缺失则重播种（种子模板：`scripts/seed_storage.js`，按项目主题扩展）。
4. **批量大小**：每调用 ≤8 个图元或 ≤10 个文本，超出会 30s 超时。超时的调用可能已部分生效——重试前先探测残留，避免重复创建。**超时被杀时 openPage 可能未提交**：下一条命令会落在旧页上执行——先切页+验证再操作（教训：曾在 Foundations 页被误执行"全部 remove"，整页清空）。
5. **崩溃损伤模式**：画布崩溃（大量辉光 blur + 大文件 + 频繁切页是诱因；症状还有 MCP 报 "No plugin instance connected"）时，**崩溃前最后一批创建**的 board/rect/ellipse 退化为默认 100×100（text 不受影响；位置/填充/层级保留）。检测：非文本图元尺寸恰为 100×100。修复=按设计规格重新 resize，**含头板**（头板退化时导出全黑）。禁用 WebGL 可显著稳定；轻度卡死 sleep 60~120s 可自愈。
6. **返回值**：只返回原始值（数字/字符串/平铺数组）。返回函数或复杂对象会 structuredClone 失败（如 shape 的 makeMask）。
7. **跨页操作**：修改/删除非激活页对象报 "Cannot modify a page that is not currently active" → 先激活所属页。

## 2. 构建新板：布局方案决策

三种方案按序尝试，渲染异常时降级：**A 裸板+世界坐标 appendChild**（最简单，部分环境导出整体偏移）→ **B flex 自动布局**（需引擎排版，嵌套子板被 hug 压塌）→ **C flex 容器 + 全员 absolute + 世界坐标**（推荐兜底，33 组件 + 3 整页 0 失败）。三方案构建/渲染行为与实测结论详表见 api-pitfalls.md §10。

方案 C 标准写法（`mkAbsBoard`/`absMount` 完整引擎见 `scripts/seed_storage.js`）：

```js
storage.mkAbsBoard = (name, x, y, w, h, fill, radius) => {
  const b = penpot.createBoard();
  b.name = name; b.x = x; b.y = y; b.resize(w, h);
  b.borderRadius = radius || 0;
  b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  b.addFlexLayout();
  b.flex.dir = 'column';
  try { b.horizontalSizing = 'fixed'; b.verticalSizing = 'fixed'; } catch (e) {}
  return b;
};
storage.absMount = (parent, child, worldX, worldY) => {
  parent.appendChild(child);
  child.layoutChild.absolute = true;   // ★ 必须在 appendChild 之后设置
  child.x = worldX; child.y = worldY;  // absolute 模式下 x/y 即世界坐标
};
```

**诊断方法**：readback 坐标正确但导出整体错位 → 方案 A 失效，换方案 C 重建该板（重建比修补快）。导出按钮/卡片被压成文字大小 → 方案 B 的 hug 压塌，全员 `layoutChild.absolute = true` 后按设计尺寸重排。

## 3. 核心陷阱速查表（详细机理与代码见 api-pitfalls.md）

| 陷阱 | 正确做法 |
|---|---|
| Path 没有 `setPathData` 方法 | 用 `path.d` 属性赋值；d 的读写均为**世界坐标**，写入后自动适配包围盒 |
| SVG arc `A` 命令不渲染（新 Path 默认 `d="M0,0L100,100"` 对角线） | 弧线转三次贝塞尔：kappa=4/3·tan(θ/4)，每段 ≤90° |
| `appendChild` 保留世界坐标 | 子元素先放最终世界坐标再 append；或 append 后 `penpotUtils.setParentXY(child, relX, relY)`。先设相对值再 append → 子元素落在页面原点 |
| 描边对齐属性名 | 是 `strokeAlignment`（'center'/'inner'/'outer'），不存在 strokeWidthAlignment，赋值静默丢弃留 null。**闭合形状一律 'inner'**（center 外溢半线宽，贴父板边缘被裁 → 圆角双线/粗细不均）；开放路径（弧线/折线）用 'center' |
| 板裁剪属性 | 是 `clipContent`（不是 clipsContent）。发光元素所在板必须 `clipContent = false`，否则辉光被裁不可见 |
| 移动组件主实例子元素 | `penpotUtils.setParentXY` 会失败；用 `child.parentX/parentY` **直接赋值**（普通形状+主实例处处可用） |
| 沙箱作用域 | penpotUtils/storage 非真全局；`new Function` 序列化的函数体内访问不到 → 持久引擎必须以字面量函数定义存入 storage |
| children 代理 | 每次访问 `shape.children` 生成新代理，`indexOf` 按引用比较全 -1 → 先 `Array.from(children)` 单次快照再 filter/indexOf |
| 组件名 | 不允许 `/`（赋值静默失败），用 `·` 分隔，如 `Button·Primary·Default` |
| 文本定位 | 创建瞬间的文本宽高不可信（可能 1×1）。**渲染后再按实际 width/height 居中**，否则偏移数像素到数十像素 |
| 坐标系混用 | `child.x/y` 与 `board.x/y` 是世界坐标；`parentX/parentY` 是父内相对。包含判断/吸附计算全程统一世界坐标。换算：`new parentX = worldX - parent.x` |
| **移动 board = 壳动内容不动** | 对含 `absolute` 子元素的板赋值 x/y，子元素保持世界坐标不跟随 → 板内容散架。**构建时直接放最终坐标，永不移动已建好的板**；必须批量移动时逐元素补偿 `dy` |
| **resize 板与子元素** | 板 resize **不影响 absolute 子元素**（安全扩容画框）。但含非 absolute flex 子元素的板 resize 会触发引擎把子元素 `fix` sizing 压回内容大小（压塌）——修复后勿再 resize |
| **CJK 字体回退** | Penpot 无 CSS 字体栈回退：`applyToText` 整段生效，Nunito 等拉丁字体的中文渲染为乱码。**mkText 按 `/[\u3000-\u9fff\uff00-\uffef]/` 自动选 Noto Sans SC**；存量文本扫描 `characters` 批修（`Text.fontWeight` 可直接读当前字重，同字重替换） |
| **Emoji 渲染** | Penpot 将 emoji 渲染为像素风图形（导出 PNG 同样）——对游戏风/像素风设计反而合适，可直接当图标占位 |

## 4. 变体容器（Variant）

`penpotUtils.createVariantContainer(items)` 要求输入是**已注册库组件的主实例**，直接传 shape 会报 "ShapeProxy invalid"：

```js
const comp = penpot.library.local.createComponent([realShape]);  // 注册，原形状变主实例
comp.name = 'Button·Primary·Default';                              // 不允许 '/'
// 收集全部后：
const container = penpotUtils.createVariantContainer(
  comps.map(c => ({ shape: c.mainInstance(), properties: { Type: t, State: s } }))
);
```

reparent 后实例内部子元素会偏移（如 +30,30）→ 按设计相对坐标重置 `parentX/parentY`。组件展示板要 appendChild 进页头板（同页 reparent 世界坐标不变），否则导出头板时组件缺失。

**★删除组件连带掏空展示板**：`createComponent([shape])` 后原形状就地变主实例；**`comp.remove()` 会连主实例一起删**。批量去重/重注册时若用展示板里的形状注册，展示板会被掏空（实测 6 个展示板被清空）。铁律：**注册一律用专用母版板（如 'AI Component Masters'）里的形状**；误删后按配方重建展示板。

## 5. 复刻既有 UI 库（React 组件库 → Penpot）

1. **先读源码全文再动手**：`.tsx` + `.module.less` 每个组件都要读。凭文档一句话印象画会漏关键结构（教训：Title 文档只写"燕子尾丝带"，源码实为五层结构——clip-path 鱼尾燕尾/折角 border 三角/rotateX(3deg) 正面/内阴影/文字层，默认绿 `#27d039` 而非主题色，em 单位随字号缩放）。
2. **提取 tokens**：CSS 变量 → storage.T（颜色/圆角/间距/阴影色），同步录入 `penpot.library.local.tokens`（addSet + addToken，type: 'color'/'borderRadius'/'dimension'）。
3. **字体决策**：读 less 的 font-family 栈 → `penpot.fonts.findByName` 探测可用性 → mkText 按 CJK 正则自动分流。
4. **构建顺序**：Foundations 页（色板/字阶/间距圆角阴影）→ Components 页（按组件分板）→ 注册库组件 → 典型页面组装（Dashboard/Landing/Login/List/Detail/Settings 直接复用组件配方坐标）。
5. **每个板构建完立即导出验收**，不要攒到最后——布局问题越早发现重建成本越低。

## 6. 审查与修复引擎（机理见 engines.md §1，代码：scripts/repair_engines.js、scripts/fix_layout.js）

- **alignPage**：文本吸附"包含其世界中心的最小宿主"（rect/ellipse，24≤边长，面积≤20000）中心；页级直接文本跳过；Breadcrumbs 流式重排；Tabs 按列居中。
- **vAlignPage**：小板（≤70px 高）内单行直接子文本垂直居中，带**垂直堆叠守卫**（同板 x 重叠≥50% 的多行文本=刻意堆叠，跳过——防误伤步进钮、顶对齐标签）。
- **fixInner**：全文件描边批修（闭合→inner，路径→center）。
- **unclip**：全文件 `clipContent=false`。
- **gridSnap**：日历/表格网格吸附（colCx/rowCy 推算期望位）。

通用模式：引擎以**字面量函数**存 `storage`，队列存 `storage.xxxQueue`，逐页 runner 执行；修复日志返回 `[{位置, 内容, 轴, 偏移}]` 供人工复核。

## 7. 验收纪律

- `export_shape({shapeId, format:'png'})` 只能导出**当前激活页**上的形状；导出前确认 `penpot.currentPage` 就是形状所在页（切页后 sleep 500ms+）；大板（3000px+ 整页）可能超时（重试 2~3 次即可）；偶发陈旧缓存黑图/旧内容（重试即愈）。
- **板重建后 id 会变**：旧 id 导出报 "Cannot read properties of null"——重新收集 `board.id` 再导出。
- **编辑器渲染 ≠ 导出渲染**：null strokeAlignment 双线、clipContent 裁辉光等缺陷只在编辑器可见。用户报"编辑器看到 X"时，必须用编辑器渲染机制诊断（裁剪/对齐/描边语义），不能只看导出图。
- **导出可能捕捉布局过渡态**：数据 readback 全对但渲染错乱——等待 1s+ 重新导出再判断，不要立即改代码。
- 修复后导出给用户，并请用户在编辑器中放大复核。
- 程序化审计优先：以标准网格/宿主推算期望位置，逐项比对并返回偏移清单，再批量修复——比肉眼截图可靠。

## 8. 构建设计系统（主题配方）

主题配方从 DESIGN.md 推导，按需沉淀到项目私有文档（不入 SKILL）。通用构成：

- **tokens**：色彩/字体/圆角/间距/阴影/特效（如发光）规范，与 DESIGN.md 严格一致。
- **种子与工厂**：种子模板（`scripts/seed_storage.js`）+ 主题化工厂函数（mkText/mkRect/卡片构造器等，命名空间挂 `storage`）。
- **布局坐标**：组件页构建顺序、整页/大屏分区坐标表（视觉规格速查表）。
- **典型页面**：Dashboard/Landing/Login/List 管理/Detail 详情/Settings 表单等页面组装配方（engines.md §4 模式 + 主题坐标）。

经验：先定 tokens → 播种 → 组件页按规格板逐页构建+导出验收 → 最后组装整页；复杂装饰（丝带/徽标/多层阴影）单独封装构造器，避免坐标散落。

布局方案决策与实测行为表见 api-pitfalls.md §10；absMount 引擎见 `scripts/seed_storage.js`；压塌修复引擎见 `scripts/fix_layout.js`。
