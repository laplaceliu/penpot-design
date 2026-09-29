# Code → Design：两种入口到固定结构设计系统

目标产物（缺一不可）：
1. **DESIGN.md** —— 合规规范文件（references/design-md-spec.md 的骨架 + lint 通过）。
2. **Penpot 设计系统文件** —— 固定结构（references/penpot-structure.md 契约）。
3. **组件映射表**（13 · 组件索引页 + 工作区 `component-map.json`）—— design-to-code 的输入。

## 入口 A：给一个 URL

1. **勘察**：web_fetch 目标 URL（以及关键子页：登录页、仪表盘、典型表单页），提取：
   - 色彩：主色/辅色/中性色/语义色（从 CSS 变量、按钮、链接、状态组件取样）
   - 字体：font-family 栈、字阶（h1–h6/正文/label）、字重使用
   - 形状：圆角档位、描边粗细、阴影/发光
   - 间距：页面边距、卡片 padding、列表行高（对齐 8px 栅格取整）
   - 组件清单：截图式描述页面上出现的组件族（按钮类型、表单控件、导航、浮层、图表…）
2. **风格定调**：写 Overview（品牌个性 / 目标用户 / 情绪基调），确定风格关键词（如「深蓝科技风 + 发光霓虹」）。
3. **产出 DESIGN.md**：按骨架填 tokens 与正文；`npx @google/design.md lint DESIGN.md` 至 0 error。
4. **进入统一构建管线**（见下）。

## 入口 B：给一组图片

1. **读图**（read_file 逐张读入）：识别主题、组件族、布局密度、深浅主题。
2. **取样**：颜色用 PIL 辅助取色（`scripts/pixel_diff.py` 同机可写取色小脚本，或直接在 execute_code 外用 Python 读像素），把主色/背景/文字色量化为 `#RRGGBB`；对图片内标尺/网格反推间距档位（4/8/12/16/24/32），字体按字面特征给最接近字族并注明「估计」。
3. **组件清单**：逐图列出可见组件与状态（按钮的 hover/disabled 若图中未出现，按行业惯例补全并在 DESIGN.md 注明推断）。
4. **产出 DESIGN.md**（同入口 A 第 3 步）。
5. **进入统一构建管线**。

## 入口 C（扩展）：给既有 React/UI 库源码（复刻）

用户给出一个现成组件库（`.tsx` + `.module.less` 等）要求复刻成设计系统时，走 **复刻流水线**（详见 `references/mcp-automation.md` §5）：
先读源码全文（勿凭文档印象，教训：Title 文档一句话、源码实为五层结构）→ 提取 CSS 变量/tokens → 字体探测 + CJK 分流 → Foundations → Components → 注册库组件 → 典型页面组装。产出同样符合固定结构契约。

## 统一构建管线（各入口共用）

1. **连接 Penpot MCP**（references/mcp-connection.md）：验证 4 工具可用、`high_level_overview` 能读文件。
2. **播种**：`scripts/seed_storage.js`，把 DESIGN.md tokens 同步进 `storage.T` 与 `penpot.library.local.tokens`。
3. **骨架**：`scripts/scaffold_structure.js` 建 16 页 + PageRoot/页头/页脚。
4. **按页填充**（顺序 = 页码顺序，组件页内部按组件规格板契约 §4）：
   - 01 设计基础 → 02 颜色系统（token 可视化先行，后续页引用）
   - 03–12 组件页：每组件 一板一矩阵；**每板构建完立即 `export_shape` 验收**（越早发现重建成本越低）
   - 13 组件索引 + `component-map.json`（组件名 → 页名/坐标/token 引用/变体清单）
   - 14 Demo 六板（Dashboard/Landing/Login/List 管理/Detail 详情/Settings 表单）全部用库组件实例组装
5. **注册库组件**：母版放 `AI Component Masters`，`createComponent` + `createVariantContainer`。
6. **审查修复**：对齐/描边/去裁剪引擎过一遍（engines.md），重点：闭合描边 inner、发光板 clipContent=false、CJK 字体正确。
7. **验收**：逐页导出 PNG 对照本契约自检清单（penpot-structure.md §7）；请用户在编辑器放大复核。

## DESIGN.md 编写要点（两入口通用）

- tokens 为唯一规范值；正文只写语义与用法（"Primary 仅用于每屏单一最重要操作"式护栏）。
- 组件 token 尽量引用基础 token（`{colors.primary}`），变体键独立（`button-primary-hover`）。
- 未知/推断项不编造精确数值：用接近的档位 + 在 prose 标注「自图片估计」。
- 图标与图片资源约定提前写进 Components/Do's and Don'ts（导出尺寸、命名、@2x），是 design-to-code 阶段 pixel-perfect 的前提。
