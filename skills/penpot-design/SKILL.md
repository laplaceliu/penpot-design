---
name: penpot-design
description: "Code to Design + Design to Code 双向设计系统工作流，外加 Penpot MCP 自动化实战库。两种入口（给 URL 或给一组图片，或给既有 React/UI 库源码复刻）产出 DESIGN.md 与 Penpot 固定结构设计系统（16 页页面/板/元素契约），通过 execute_code 批量构建组件/变体/大屏/典型页面、批量修复对齐/描边/裁剪/flex 压塌/中文乱码、注册库组件、导出验收；指导连接 penpot mcp 并提供开箱即用的部署栈；从 Penpot 设计文件输出 Qt4/5/6 与 React/Vue 代码（分框架指南，强调图片与图标资源引用、按组件索引分层实现），PIL 像素级验证，目标 pixel-perfect。当用户提到「根据网址/图片生成设计系统」「生成 Penpot 设计系统」「用 Penpot MCP 创建页面/构建组件或大屏」「复刻 UI 库/设计系统」「批量修复选中元素的对齐/样式/渲染问题/中文乱码」「注册库组件」「design to code」「设计稿转 Qt/React/Vue 代码」「像素级还原」「选择/指定目标宽度（Web/Pad/Mobile）」「生成/复刻手机或平板 UI」「指定/选择技术栈（Qt/Web/LVGL/imgui/MAUI/Flutter…）」时使用；支持 Web 宽屏 / 平板 Pad / 手机 Mobile 三档视口与任意 GUI 技术栈，运行时会询问目标宽度档位与目标栈（design→code 前，防默认 React）并在 DESIGN.md 与构建/验收中据此外约束。"
version: 1.3.0
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
| `references/engines.md` | 引擎与配方：修复引擎机理、组件工厂模板、页面组装模式、崩溃重建清单（代码在 scripts/） |
| `references/design-to-code-generic.md` | **通用出码纪律**（所有栈共用：分层/token/资源/五态/整数像素/验收） |
| `references/stack-profiles.md` | **技术栈档位**：平台族分类、运行时询问（仅 design→code 前）、未知栈处理 |
| `references/stacks/manifest.md` | 技术栈适配器注册表（栈 → 适配器文档 + 平台族标签） |
| `references/stacks/qt.md` | Qt 适配器（Qt4/5/6 分列） |
| `references/stacks/web.md` | Web 前端适配器（React/Vue/Angular/Svelte…） |
| `references/viewport-profiles.md` | **视口档位**：web/pad/mobile 三档定义、运行时询问、对 DESIGN.md 与 12/14 页与验收的影响 |
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

0. **确认视口档位**（先读 `references/viewport-profiles.md`）：用 `ask_followup_question` 问用户
   目标宽度（web/pad/mobile，可多选），结果写入 DESIGN.md `targetProfiles`，作为后续硬约束。
1. 产出 **DESIGN.md**（骨架见 spec 文档 §9，Layout 章节按 `targetProfiles` 写栅格/边距/触控目标）→
   `npx @google/design.md lint DESIGN.md` 至 0 error。
2. **连接 penpot mcp**（见下节）。
3. `scripts/seed_storage.js` 播种（tokens 同步 DESIGN.md）→ `scripts/scaffold_structure.js` 建 16 页骨架。
4. 按页填充：01 设计基础/02 颜色系统先建（token 可视化）→ 03–12 组件规格板（契约 §4，每板建完立即导出验收；
   12 页按各所选档位分别建布局网格板）→ 13 组件索引（+ `component-map.json`）→ 14 Demo：
   对**每个所选档位**分别产出该档基准宽的六板（Dashboard/Landing/Login/List 管理/Detail 详情/Settings 表单），
   全部用库组件实例组装。
5. 注册库组件（母版在 `AI Component Masters`）→ 对齐/描边/去裁剪审查 → 逐页导出 PNG 按自检清单验收
   （14 页逐档位逐板验收）。

## 连接 penpot mcp（速记，详见 references/mcp-connection.md）

- 部署栈自带在 `assets/penpot-server/`（compose 7 服务 + caddy，脚本路径自解析，整目录可搬到任意位置）：Linux/macOS 用 `assets/penpot-server/scripts/*.sh`，**Windows 用同名的 `*.ps1`**（优先 `podman compose`，回退 `docker compose`）→ `https://penpot.local`（`admin@penpot.local` / `penpot123`，需先跑 `create-profile.{sh,ps1}`）。Windows 一键：`.\scripts\install.ps1`。
- MCP 端点：`https://penpot.local/mcp/stream`（HTTP）或 `https://penpot.local/api/mcp/sse`（SSE）。
- 客户端配 `.mcp.json`；自签证书跑一次 `assets/penpot-server/scripts/trust-ca.{sh,ps1}`（自动写 `NODE_EXTRA_CA_CERTS`）并**重启客户端**；CA 每栈目录独立，换目录需重跑。
- 验证：4 工具（execute_code / export_shape / high_level_overview / penpot_api_info）→ `penpot_api_info` → `high_level_overview` → execute_code 冒烟。
- execute_code 纪律：切页异步要防御式校验；storage 易失每批播种；每调用 ≤8 图元/≤10 文本；崩溃损伤查 100×100。完整坑表见 `references/mcp-automation.md` 与 `references/api-pitfalls.md`。

## 工作流 2：Design → Code（按所选技术栈分走）

入口：Penpot 文件 + DESIGN.md + 13 组件索引页（`component-map.json`）。

> **先确认技术栈**：进入本流程前用 `ask_followup_question` 问 `targetStacks`（两级：平台族→框架，
> multiSelect 视是否多栈），写入 DESIGN.md。未确认不得出码，禁止默认 React/Web。详见 `references/stack-profiles.md`。

**实现组织（行业惯例，所有栈相同）**：按组件索引**分层实现**——tokens 层 → 原子（Button/Input…）→ 组合（SearchBox/FormField…）→ 模块（TopNav/DataTable…）→ 页面（对齐 14 页 Demo 各所选档位的屏幕板）。组件名与 Penpot 一一对应；每层落地立即 PIL 验收再进下一层。
**双档位约束**：先读 DESIGN.md `targetProfiles`（视口 web/pad/mobile）与 `targetStacks`（技术栈）；
代码按档位做响应式、按栈实现，验收 viewport / 窗口宽 = 该档基准宽，逐档截图比对。

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
