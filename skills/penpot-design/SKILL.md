---
name: penpot-design
description: "Code to Design + Design to Code 双向设计系统工作流，外加 Penpot MCP 自动化实战库。两种入口（给 URL 或给一组图片，或给既有 React/UI 库源码复刻）产出 DESIGN.md 与 Penpot 固定结构设计系统（16 页页面/板/元素契约），通过 execute_code 批量构建组件/变体/大屏/典型页面、批量修复对齐/描边/裁剪/flex 压塌/中文乱码、注册库组件、导出验收；指导连接 penpot mcp 并提供开箱即用的部署栈；从 Penpot 设计文件输出 Qt4/5/6 与 React/Vue 代码（分框架指南，强调图片与图标资源引用、按组件索引分层实现），PIL 像素级验证，目标 pixel-perfect。当用户提到「根据网址/图片生成设计系统」「生成 Penpot 设计系统」「用 Penpot MCP 创建页面/构建组件或大屏」「复刻 UI 库/设计系统」「批量修复选中元素的对齐/样式/渲染问题/中文乱码」「注册库组件」「录入/校验 Penpot design tokens（17 种 TokenType / set 激活 / token 引用 / themes）」「design to code」「设计稿转 Qt/React/Vue 代码」「像素级还原」「选择/指定目标宽度（Web/Pad/Mobile）」「生成/复刻手机或平板 UI」「指定/选择技术栈（Qt/Web/LVGL/imgui/MAUI/Flutter…）」时使用；支持 Web 宽屏 / 平板 Pad / 手机 Mobile 三档视口、单色/明暗双配色、与任意 GUI 技术栈，启动时会一并询问目标宽度档位与配色模式（是否要可切换的明暗两套 theme），design→code 前询问目标栈（防默认 React），并在 DESIGN.md 与构建/验收中据此外约束。"
version: 1.6.0
license: MIT
---

# penpot-design：Code ↔ Design 双向工作流

两个方向，共用同一套设计系统契约（DESIGN.md + Penpot 固定结构）：

1. **Code → Design**：给一个 **URL** 或 **一组图片** → 产出 DESIGN.md + Penpot 固定结构设计系统（16 页）。
2. **Design → Code**：给一个 Penpot 设计文件 → 输出 **Qt4/5/6** 或 **React/Vue** 代码，**pixel-perfect**，PIL 验收。

## 视口档位（必须：运行时会询问用户）

本技能不再只处理 Web 宽屏。所有任务先确认目标**视口档位**，再开工：

- **三档**：`web`（宽屏/桌面 1920）、`pad`（平板 834 等）、`mobile`（手机 375 等）。
- **运行时询问**：开始写 DESIGN.md 之前，用 `ask_followup_question`（multiSelect）问用户
  "本次要生成/复刻哪类宽度的 UI？"，选项 Web 宽屏 / 平板 Pad / 手机 Mobile。
  用户已明说（如"做个手机端"）可免问，但仍写入 `targetProfiles`。
- **约束范围**：档位决定 DESIGN.md Layout（栅格/边距/触控目标）、`12·布局模式` 各档网格板、
  `14·Demo` 各档屏幕宽、design-to-code 的响应式实现与验收 viewport。设计系统内核
  （00–13、15）与档位无关，只建一次、各档共用。

完整定义与产物映射见 `references/viewport-profiles.md`（务必先读）。

## 配色模式（必须：启动时与视口档位同一批询问）

- **两个选项**：`只要浅色`（默认）/ `浅色 + 深色两套`（可切换）。
- **运行时询问**：与视口档位**放在同一批 `ask_followup_question` 里**（一次往返问完，不要分两轮），
  问"是否需要**可切换的**明暗两套配色（整页翻转），而不只是同一页里深浅区域交替？"。
  **必须把这两个选项的差别写进选项描述** —— 多数系统天然有"分节表面极性"（同一页里深浅区域交替），
  那不是主题，问了容易答非所问。
- **答案落库**：写入 **DESIGN.md `## Colors` 章节正文**（与 `targetProfiles` 写 `## Layout` 同理），
  **不要**塞 frontmatter 自定义键（实测能过 lint 但会被忽略，等于无效）。
- **约束范围**：决定 token 的 set/theme 结构（两套 → `· Core` + `· Dark` + Scheme 组两个 theme，
  **Core 必须在前**）、`01 F1` 双极性色板、`02` 颜色系统页整体双份（含 C5 对比度审计两张表）、
  组件规格板的极性说明、以及 `14·Demo` **板数翻倍**（档位数 × 配色数）。
- **铁律**：dark **不是** light 的取反，**WCAG 必须两套分别审计**；未导出过的组合不得表述为"已验证"。

完整定义、产物映射与验收见 `references/color-schemes.md`（务必先读）。
Token 的 set/theme 机制细节见 `references/design-tokens.md` §5。

## 技术栈档位（仅 Design → Code 前询问）

本技能支持任意 GUI 技术栈（Qt / Web 前端 / LVGL / imgui / MAUI / Flutter / SwiftUI / Compose …），
不再只写死 Qt 与 React/Vue。

- **何时问**：只在 **Design → Code** 前用 `ask_followup_question` 确认（两级：先平台族、再框架，
  multiSelect 视是否多栈）；Code → Design 不强制，可先出通用设计系统、出码时再定栈。
- **铁律**：未确认 `targetStacks` 不得进入代码生成；**禁止默认 React/Web**；模棱两可就停住问，绝不推测出码。
- **约束范围**：代码按所选栈实现并验收（viewport/窗口 = 档基准宽）。未知栈按通用纪律 + 问清
  关键约束出码，并生成草稿适配器。
- 完整分类、询问规范与适配器模板见 `references/stack-profiles.md`；栈 → 文档映射见
  `references/stacks/manifest.md`；通用出码纪律见 `references/design-to-code-generic.md`。

## When to Use（何时使用）

在以下场景加载本技能，按对应的参考文档展开：

- 用户给出网址 / 截图 / 设计图，要求「生成设计系统」「产出 DESIGN.md」「建 Penpot 设计系统」。
- 用户要求用 Penpot MCP 批量建页 / 建组件 / 建大屏、注册库组件、批量修复对齐或中文乱码。
- 用户要求把既有 React / UI 组件库复刻成设计系统。
- 用户要求把 Penpot 设计稿转成任意技术栈（Qt/Web/LVGL/imgui/MAUI/Flutter…）代码，或做像素级还原验收。

不适用场景：与 Penpot / 设计系统 / 设计稿转码无关的一般编码任务。

## 参考文档地图（按需读取）

| 文件 | 内容 |
|---|---|
| `references/design-md-spec.md` | DESIGN.md 规范（schema/规则/CLI/lint）与骨架模板 |
| `references/penpot-structure.md` | **固定结构契约**：16 页、页面解剖、规格板、坐标、自检清单 |
| `references/code-to-design.md` | 入口 A（URL）/入口 B（图片）分析法 + 统一构建管线 |
| `references/mcp-connection.md` | 连接 penpot mcp：部署脚本、端点、客户端配置、CA、验证 |
| `references/mcp-automation.md` | **execute_code 实战手册**：会话纪律、布局三方案、陷阱速查、变体/组件、复刻 UI 库、验收纪律 |
| `references/api-pitfalls.md` | execute_code API 陷阱详解（坐标/Path/描边/裁剪/文本/变体/沙箱/崩溃/导出/布局） |
| `references/positioning-audit.md` | **定位审计**：四个定位失效签名（越界/文本居中残差/尺寸退化/页头碰撞）、根因链、预防门禁 G1–G7、标准作业顺序 |
| `references/design-tokens.md` | **Design Tokens 权威用法**（本机实测）：17 种 TokenType、值格式、默认应用属性、active/themes/优先级、6 个应用坑、解绑细则、文档与实现的 9 处差异 |
| `references/engines.md` | 引擎与配方：修复引擎机理、组件工厂模板、页面组装模式、崩溃重建清单（代码在 scripts/） |
| `references/design-to-code-generic.md` | **通用出码纪律**（所有栈共用：分层/token/资源/五态/整数像素/验收） |
| `references/stack-profiles.md` | **技术栈档位**：平台族分类、运行时询问（仅 design→code 前）、未知栈处理 |
| `references/stacks/manifest.md` | 技术栈适配器注册表（栈 → 适配器文档 + 平台族标签） |
| `references/stacks/qt.md` | Qt 适配器（Qt4/5/6 分列） |
| `references/stacks/web.md` | Web 前端适配器（React/Vue/Angular/Svelte…） |
| `references/viewport-profiles.md` | **视口档位**：web/pad/mobile 三档定义、运行时询问、对 DESIGN.md 与 12/14 页与验收的影响 |
| `references/color-schemes.md` | **配色模式**：启动时询问（与视口档位同批）、「分节表面极性 vs 可切换主题」的区别、答案落库位置、两套配色的产物映射（token set/theme、01/02/14 页变化）与对比度验收 |
| `references/verification.md` | PIL 像素级验证全流程与根因速查 |
| `scripts/seed_storage.js` | execute_code 播种引擎（**`storage.T` 只是 JS 侧色值镜像，不创建 Penpot token** + 工厂函数） |
| `scripts/token_engine.js` | **Design Tokens 引擎**：`TK.seed`（建集+录 token，自动 `active:true`）/ `TK.apply`（应用+回读校验，捕获静默失败）/ `TK.audit`（未激活/引用断链体检）/ `TK.unbindFill` |
| `scripts/repair_engines.js` | 修复引擎（alignPage / vAlignPage / fixInner / unclip / cleanOrphans） |
| `scripts/fix_layout.js` | flex 压塌批量修复引擎（absRow + fixCol，两轮收敛） |
| `scripts/audit_layout.js` | **定位审计引擎**（只读）：`auditPage` / `auditAll`，**十类签名**（越界/居中残差/尺寸退化/页头碰撞/根级游离/兄弟板重叠/文本重叠/字体/**畸形文本**/**对齐未生效**）+ 判定 `CLEAN`/`NEEDS_REPAIR` |
| `scripts/fix_geometry.js` | **几何修补引擎**（全部支持 dry-run）：`fixColumnOffset` / `fitBoardHeight` / `fixOverflowRight` / **`reflowRows`** / `fitRootHeight` / `fixGeometryAll` / `moveSubtree` |
| `scripts/scaffold_structure.js` | 固定 16 页骨架批量构建脚本 |
| `scripts/pixel_diff.py` | PIL 像素比对工具（热图 + JSON 指标） |
| `assets/penpot-server/` | **自带部署栈**：compose 7 服务 + caddy/Caddyfile + 8 个运维脚本 + README（路径自解析，整目录可搬迁） |

## 工作流 1：Code → Design（两种开始方式）

**方式 A — 给 URL**：web_fetch 勘察目标站与关键子页 → 提取色彩/字体/圆角/间距/阴影/组件清单 → 定风格关键词。
**方式 B — 给图片**：逐张读图分析 → PIL 取色量化 `#RRGGBB` → 间距按 4/8/12/16/24/32 档对齐 → 组件与状态清单（缺失状态按惯例补全并标注「推断」）。

随后（两方式共用，详见 `references/code-to-design.md`）：

0. **确认两个启动档位——用同一次 `ask_followup_question`（两个问题）问完，不要分两轮**：
   - **视口档位**（先读 `references/viewport-profiles.md`）：目标宽度 web / pad / mobile（可多选）→
     写入 DESIGN.md `targetProfiles`，作为后续硬约束。
   - **配色模式**（先读 `references/color-schemes.md`）：`只要浅色` 还是 `浅色 + 深色两套`（可切换）→
     写入 DESIGN.md `## Colors` 章节正文。
     **提问时必须讲清「分节表面极性 ≠ 可切换主题」**，否则用户容易答非所问。
   两个答案共同决定后续的 **token 结构**：只要浅色 → 1 个 set、0 个 theme；
   两套 → `<系统名> · Core` + `<系统名> · Dark`（Core 在前）+ Scheme 组两个 theme。
0.5 **【门禁 G1】读并原样粘贴 canonical 脚本**：`scripts/seed_storage.js`（`mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`ct`）
   + `scripts/repair_engines.js`（`alignPage`/`vAlignPage`/`fixInner`/`unclip`/`cleanOrphans`）
   + `scripts/audit_layout.js`（`auditPage`）+ `scripts/token_engine.js`（`TK.*`）。
   **禁止自造坐标/文本 helper**——事故复盘见 `references/positioning-audit.md`：临时自造 `mkAbsBoard`/文本盒
   把同一个系统性偏移复制到了全部 16 页。需要新工厂时**新增**函数，不改写上面几个。
1. 产出 **DESIGN.md**（骨架见 spec 文档 §9，Layout 章节按 `targetProfiles` 写栅格/边距/触控目标）→
   `npx @google/design.md lint DESIGN.md` 至 0 error。
2. **连接 penpot mcp**（见下节）。构造队列与已完成页清单**落盘**（如 `build-progress.json`，门禁 G6）。
3. `scripts/seed_storage.js` 播种工厂函数 → `scripts/scaffold_structure.js` 建 16 页骨架。
   **并立即录入 Design Tokens【门禁 G9】**：粘贴 `scripts/token_engine.js` → `storage.TK.seed(spec)`
   （spec 按 `references/design-tokens.md` §8 的映射从 DESIGN.md 各章节生成 17 种 TokenType）→
   `storage.TK.assert()` 必须 PASS（无未激活 set、无引用断链）。
   ⚠️ 两条必知：`addSet()` 默认 **`active:false`**，未激活 set 里的 token **绑定会成功但值不生效（静默失败）**；
   `seed_storage.js` 的 `storage.T` 只是 JS 侧色值镜像，**不创建任何 Penpot token**。详见 `references/design-tokens.md`。
4. **【门禁 G2/G3】首板试点再批量**：先建 01 页第一块板 → `storage.auditPage()` 必须无
   `out_of_bounds` / `header_collision` → 立即导出肉眼确认无整体偏移 → 才允许批量建。
   批量时**每个板建成即跑单板审计**（只看本板 finding），不要把同一偏移复制到 100+ 板。
   按页填充：01 设计基础/02 颜色系统先建（token 可视化）→ 03–12 组件规格板（契约 §4；
   12 页按各所选档位分别建布局网格板）→ 13 组件索引（+ `component-map.json`）→ 14 Demo：
   对**每个所选档位**分别产出该档基准宽的六板（Dashboard/Landing/Login/List 管理/Detail 详情/Settings 表单），
   全部用库组件实例组装。
5. 注册库组件（母版在 `AI Component Masters`，**标签必须是母版板的子元素**，否则注册出空壳组件）。
6. **【门禁 G4】逐页收尾，顺序固定**：`cleanOrphans()` → `alignPage()` → `vAlignPage()` → `fixInner()` → `unclip()`；
   记录修复日志 `[位置, 内容, 轴, 偏移]` 人工复核，再按 `engines.md` §1 还原刻意非居中的元素。
7. **复算 + 验收【门禁 G5】**：`auditPage()` 全页复算至 `CLEAN`（剩余项须逐条人工确认为刻意不居中）→
   逐板导出 PNG（或逐页 contact sheet）按自检清单验收（14 页逐档位逐板验收）。
   **未导出过的板不得表述为"已验证"**。
   另跑 `storage.TK.audit()`，且在**至少一个真实形状**上做过
   `await storage.TK.apply(tokenName, [shape])` 并确认返回 `ok:true` ——
   **「没报错」不等于「生效了」**：错误的 set 激活状态或不适用的形状都会静默 no-op，唯一判据是 readback。

## 启动前检查：确认 Penpot / MCP 是否已就绪（必做，先探测再动作）

技能**不再默认直接安装** Penpot。开始任何部署动作前，先探测当前状态、按最小必要动作处理，避免重复拉镜像（~5min）或误覆盖已有部署。

1. **探测 Penpot 服务**：跑 `assets/penpot-server/scripts/status.{sh,ps1}`，或 `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags` 看是否 200。
   - 返回 200 → 服务已在跑，**跳过安装/启动**。
   - 容器存在但停了 → 只需 `up.{sh,ps1}` 拉起，**不要重装**（数据卷含账号，免 `create-profile`）。
   - 容器/compose 不存在 → 需要完整安装。
2. **探测 MCP 客户端配置**：查工作区 `.mcp.json` 是否含 `penpot` 条目（`url: https://penpot.local/mcp/stream`），且 `NODE_EXTRA_CA_CERTS` 已设、CA 证书存在（`$STACK/data/caddy/pki/authorities/local/root.crt`）。
   - 已配置且端点可达 → **直接进「连接 penpot mcp」验证**，不动任何东西。
   - 已配置但端点没起 → 仅启动服务。
   - 未配置 → 配 `.mcp.json` + 跑 `trust-ca` + 重启客户端。
3. **向用户确认再动手**：把探测结果用一两句话说明（如「Penpot 已在运行、MCP 已配好，直接验证」/「检测到旧部署已停，是否仅启动？」/「未检测到部署，是否完整安装（约 5 分钟拉镜像）？」），用 `ask_followup_question` 确认动作（**复用 / 仅启动 / 完整安装配置**）后再执行。轻量探测本身不询问。

## 连接 penpot mcp（速记，详见 references/mcp-connection.md；启动前务必先按上节做就绪探测，勿直接 install）

- 部署栈自带在 `assets/penpot-server/`（compose 7 服务 + caddy，脚本路径自解析，整目录可搬到任意位置）：Linux/macOS 用 `assets/penpot-server/scripts/*.sh`，**Windows 用同名的 `*.ps1`**（优先 `podman compose`，回退 `docker compose`）→ `https://penpot.local`（`admin@penpot.local` / `penpot123`，需先跑 `create-profile.{sh,ps1}`）。Windows 一键：`.\scripts\install.ps1`。
- MCP 端点：`https://penpot.local/mcp/stream`（HTTP）或 `https://penpot.local/api/mcp/sse`（SSE）。
- 客户端配 `.mcp.json`；自签证书跑一次 `assets/penpot-server/scripts/trust-ca.{sh,ps1}`（自动写 `NODE_EXTRA_CA_CERTS`）并**重启客户端**；CA 每栈目录独立，换目录需重跑。
- 验证：4 工具（execute_code / export_shape / high_level_overview / penpot_api_info）→ `penpot_api_info` → `high_level_overview` → execute_code 冒烟。
- execute_code 纪律：切页异步要防御式校验；storage 易失每批播种；每调用 ≤8 图元/≤10 文本；崩溃损伤查 100×100。完整坑表见 `references/mcp-automation.md` 与 `references/api-pitfalls.md`。
- **写属性前必须核对 `penpot_api_info`，写入后必须 readback**：不存在的属性名（如文本对齐写成 `horizontalAlign`，正确是 `align`）在 `try/catch` 下**静默失败**，代码"看起来跑了"而效果为零。见 `api-pitfalls.md` §12。
- **导出随机失败**（`waiting until "networkidle"` 超时）是 exporter 的老毛病，不是网络问题：把容器内 `/opt/penpot/exporter/app.js` 的 `networkidle` 改成 `load` 并重启 exporter 即根治。见 `api-pitfalls.md` §12.3。

## 工作流 2：Design → Code（按所选技术栈分走）

入口：Penpot 文件 + DESIGN.md + 13 组件索引页（`component-map.json`）。

> **先确认技术栈**：进入本流程前用 `ask_followup_question` 问 `targetStacks`（两级：平台族→框架，
> multiSelect 视是否多栈），写入 DESIGN.md。未确认不得出码，禁止默认 React/Web。详见 `references/stack-profiles.md`。

**实现组织（行业惯例，所有栈相同）**：按组件索引**分层实现**——tokens 层 → 原子（Button/Input…）→ 组合（SearchBox/FormField…）→ 模块（TopNav/DataTable…）→ 页面（对齐 14 页 Demo 各所选档位的屏幕板）。组件名与 Penpot 一一对应；每层落地立即 PIL 验收再进下一层。
**三档位约束**：先读 DESIGN.md `targetProfiles`（视口 web/pad/mobile）、`targetStacks`（技术栈）与
`## Colors` 声明的配色模式；
代码按档位做响应式、按栈实现、按配色走同一套语义 token，验收 = 该档基准宽 × 该配色的截图，**逐组合比对**
（组合数 = 档位数 × 配色数）。

- **通用纪律**：先读 `references/design-to-code-generic.md`（分层/token/资源/五态/整数像素/验收）。
- **选适配器**：据 `targetStacks` 从 `references/stacks/manifest.md` 选对应文档执行
  （如 `stacks/qt.md` 覆盖 Qt4/5/6、`stacks/web.md` 覆盖 React/Vue/Angular/Svelte）。
- **未知栈**：manifest 未登记时，按 generic + 向用户问清关键约束（布局模型/样式机制/资源系统/语言/验收手段）出码，
  并生成草稿适配器 `references/stacks/<key>.md`，回写 manifest（见 `stack-profiles.md` §5）。

**资源引用（重点）**：
- 图片：一律走该栈资源系统（`.qrc` / bundler import / atlas），代码零外链；从 Penpot 导出 @1x/@2x（@3x），**导出尺寸=标注尺寸×倍率**，禁止代码内缩放大图；纯色块/圆角/阴影用代码绘制。
- 图标：SVG 优先（`currentColor` 着色跟 token），命名与 01 页 F6 图标板一致；图标按钮=标注图标尺寸+padding，居中误差 ≤1px。
- 建立资源清单（`component-map.json` 含资源映射），改图先改设计端再导出，单向流动。

## 验收（强制）：PIL pixel-perfect

**实现截图与 Penpot 导出图逐像素比对达标才算完成**，流程见 `references/verification.md`：

```bash
python3 scripts/pixel_diff.py design/Button.png impl/Button.png \
    --out diff/Button.diff.png --threshold 12 --max-diff-ratio 0.002
```

- 截图标准化：DPR=1、冻结动画、字体加载完成、窗口/viewport=设计板尺寸。
- 判定：diff_ratio ≤ 0.5%（整页）/0.2%（组件）；大块实心差异必修；尺寸不一致直接打回。
- 循环：导基准图 → 截图 → 比对 → 按热图定位（位置/颜色/字体/图标/资源）→ 修复 → 再比对。
- 最后对 14 页 Demo **各所选档位的屏幕板**分别整页比对，输出组件 × 指标汇总表。
