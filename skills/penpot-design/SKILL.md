---
name: penpot-design
description: "Code to Design + Design to Code 双向设计系统工作流，外加 Penpot MCP 自动化实战库。两种入口（给 URL 或给一组图片，或给既有 React/UI 库源码复刻）产出 DESIGN.md 与 Penpot 固定结构设计系统（16 页页面/板/元素契约），通过 execute_code 批量构建组件/变体/大屏/典型页面、批量修复对齐/描边/裁剪/flex 压塌/中文乱码、注册库组件、导出验收；指导连接 penpot mcp 并提供开箱即用的部署栈；从 Penpot 设计文件输出 Qt4/5/6 与 React/Vue 代码（分框架指南，强调图片与图标资源引用、按组件索引分层实现），PIL 像素级验证，目标 pixel-perfect。当用户提到「根据网址/图片生成设计系统」「生成 Penpot 设计系统」「用 Penpot MCP 创建页面/构建组件或大屏」「复刻 UI 库/设计系统」「批量修复选中元素的对齐/样式/渲染问题/中文乱码」「注册库组件」「design to code」「设计稿转 Qt/React/Vue 代码」「像素级还原」时使用。"
version: 1.2.0
license: MIT
---

# penpot-design：Code ↔ Design 双向工作流

两个方向，共用同一套设计系统契约（DESIGN.md + Penpot 固定结构）：

1. **Code → Design**：给一个 **URL** 或 **一组图片** → 产出 DESIGN.md + Penpot 固定结构设计系统（16 页）。
2. **Design → Code**：给一个 Penpot 设计文件 → 输出 **Qt4/5/6** 或 **React/Vue** 代码，**pixel-perfect**，PIL 验收。

## When to Use（何时使用）

在以下场景加载本技能，按对应的参考文档展开：

- 用户给出网址 / 截图 / 设计图，要求「生成设计系统」「产出 DESIGN.md」「建 Penpot 设计系统」。
- 用户要求用 Penpot MCP 批量建页 / 建组件 / 建大屏、注册库组件、批量修复对齐或中文乱码。
- 用户要求把既有 React / UI 组件库复刻成设计系统。
- 用户要求把 Penpot 设计稿转成 Qt4/5/6 或 React/Vue 代码，或做像素级还原验收。

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
| `references/engines.md` | 引擎与配方：修复引擎机理、组件工厂模板、页面组装模式、崩溃重建清单（代码在 scripts/） |
| `references/design-to-code-qt.md` | Qt4 / Qt5 / Qt6 分列输出指南 |
| `references/design-to-code-web.md` | React / Vue 分列输出指南 |
| `references/verification.md` | PIL 像素级验证全流程与根因速查 |
| `scripts/seed_storage.js` | execute_code 播种引擎（tokens + 工厂函数） |
| `scripts/repair_engines.js` | 修复引擎（alignPage / vAlignPage / fixInner / unclip / cleanOrphans） |
| `scripts/fix_layout.js` | flex 压塌批量修复引擎（absRow + fixCol，两轮收敛） |
| `scripts/scaffold_structure.js` | 固定 16 页骨架批量构建脚本 |
| `scripts/pixel_diff.py` | PIL 像素比对工具（热图 + JSON 指标） |
| `assets/penpot-server/` | **自带部署栈**：compose 7 服务 + caddy/Caddyfile + 8 个运维脚本 + README（路径自解析，整目录可搬迁） |

## 工作流 1：Code → Design（两种开始方式）

**方式 A — 给 URL**：web_fetch 勘察目标站与关键子页 → 提取色彩/字体/圆角/间距/阴影/组件清单 → 定风格关键词。
**方式 B — 给图片**：逐张读图分析 → PIL 取色量化 `#RRGGBB` → 间距按 4/8/12/16/24/32 档对齐 → 组件与状态清单（缺失状态按惯例补全并标注「推断」）。

随后（两方式共用，详见 `references/code-to-design.md`）：

1. 产出 **DESIGN.md**（骨架见 spec 文档 §9）→ `npx @google/design.md lint DESIGN.md` 至 0 error。
2. **连接 penpot mcp**（见下节）。
3. `scripts/seed_storage.js` 播种（tokens 同步 DESIGN.md）→ `scripts/scaffold_structure.js` 建 16 页骨架。
4. 按页填充：01 设计基础/02 颜色系统先建（token 可视化）→ 03–12 组件规格板（契约 §4，每板建完立即导出验收）→ 13 组件索引（+ `component-map.json`）→ 14 Demo 六板（Dashboard/Landing/Login/List 管理/Detail 详情/Settings 表单，全部库组件实例）。
5. 注册库组件（母版在 `AI Component Masters`）→ 对齐/描边/去裁剪审查 → 逐页导出 PNG 按自检清单验收。

## 连接 penpot mcp（速记，详见 references/mcp-connection.md）

- 部署栈自带在 `assets/penpot-server/`（compose 7 服务 + caddy，脚本路径自解析，整目录可搬到任意位置）：Linux/macOS 用 `assets/penpot-server/scripts/*.sh`，**Windows 用同名的 `*.ps1`**（优先 `podman compose`，回退 `docker compose`）→ `https://penpot.local`（`admin@penpot.local` / `penpot123`，需先跑 `create-profile.{sh,ps1}`）。Windows 一键：`.\scripts\install.ps1`。
- MCP 端点：`https://penpot.local/mcp/stream`（HTTP）或 `https://penpot.local/api/mcp/sse`（SSE）。
- 客户端配 `.mcp.json`；自签证书跑一次 `assets/penpot-server/scripts/trust-ca.{sh,ps1}`（自动写 `NODE_EXTRA_CA_CERTS`）并**重启客户端**；CA 每栈目录独立，换目录需重跑。
- 验证：4 工具（execute_code / export_shape / high_level_overview / penpot_api_info）→ `penpot_api_info` → `high_level_overview` → execute_code 冒烟。
- execute_code 纪律：切页异步要防御式校验；storage 易失每批播种；每调用 ≤8 图元/≤10 文本；崩溃损伤查 100×100。完整坑表见 `references/mcp-automation.md` 与 `references/api-pitfalls.md`。

## 工作流 2：Design → Code（Qt 与 Web 分开走）

入口：Penpot 文件 + DESIGN.md + 13 组件索引页（`component-map.json`）。

**实现组织（行业惯例，两框架相同）**：按组件索引**分层实现**——tokens 层 → 原子（Button/Input…）→ 组合（SearchBox/FormField…）→ 模块（TopNav/DataTable…）→ 页面（对齐 14 页 Demo 六板）。组件名与 Penpot 一一对应；每层落地立即 PIL 验收再进下一层。

- **Qt4/Qt5/Qt6**：按 `references/design-to-code-qt.md` 分列执行——QSS/QML 变体、`.qrc` 资源系统、`QIcon/QPixmap`、High-DPI 差异（Q4 无 DPR / Q5 需 attribute+@2x / Q6 自动）、阴影发光方案各版本不同。
- **React/Vue**：按 `references/design-to-code-web.md` 分列执行——`design.md export` 生成 CSS 变量/Tailwind 配置、组件目录规范、五态还原、`srcSet`/SVG 图标方案各框架不同。

**资源引用（重点）**：
- 图片：一律走资源系统（`.qrc` / bundler import），代码零外链；从 Penpot 导出 @1x/@2x（@3x），**导出尺寸=标注尺寸×倍率**，禁止代码内缩放大图；纯色块/圆角/阴影用代码绘制。
- 图标：SVG 优先（`currentColor` 着色跟 token），命名与 01 页 F6 图标板一致；图标按钮=24px 图标+标注 padding，居中误差 ≤1px。
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
- 最后对 14 页 Demo 六板整页比对，输出组件 × 指标汇总表。
