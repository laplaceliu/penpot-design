# 适配器：Dear ImGui（立即模式 GUI）

通用纪律见 `references/design-to-code-generic.md`（token 只引变量、分层、资源零外链、五态、整数像素、验收流程）。
本文件只写 ImGui 特有部分；总原则与视口档位约束同 generic §0。适合工具 / HUD / 调试面板 / 引擎内 UI。

## 1. 概况（范式 / 平台与语言 / 布局模型 / 样式机制）

- **范式**：immediate mode——每帧重新调用 widget 代码生成绘制，无持久对象树（状态在你自己的应用侧）。
- **平台与语言**：C++（含各语言绑定）；后端任意（SDL / GLFW + OpenGL / Vulkan / DirectX / Metal）。
- **布局模型**：立即式流式布局——`Begin/End` 窗口、`SameLine`、`Columns`、`SetNextWindowPos/Size`、`Indent`、内容区约束；**无 flexbox / 无 CSS 重排**，顺序即布局。
- **样式机制**：`ImGuiStyle` 结构体（`Style.Colors[ImGuiCol_*]`、`FrameRounding`、`FramePadding`、`ItemSpacing` 等），`PushStyleVar` / `PushStyleColor` 临时覆盖；自定义绘制走 `ImDrawList`（`AddRect`、`AddText`）。无 CSS。

## 2. Token 映射

- DESIGN.md tokens → **C++ 常量 / 主题结构体**（如 `const ImVec4 kPrimary = ImGui::ColorConvertHexToFloat4("1A1C1E");`、`const float kRadiusMd = 8.f;`、`const ImVec2 kPadBtn = {16,8};`）。
- 颜色：`Style.Colors[ImGuiCol_Button/ButtonHovered/ButtonActive/Text/...]`；圆角：`Style.FrameRounding` / `GrabRounding`；间距：`Style.ItemSpacing` / `FramePadding`。
- **禁止散落魔法数字**：集中到主题初始化函数统一设置 `ImGui::GetStyle()`。

## 3. 资源系统

- **图片**：后端加载纹理（如 `stb_image` → GL 纹理 id），用 `Image(user_texture_id, size)` 绘制；由你管理纹理生命周期，ImGui 不提供资源管线。
- **导出尺寸 = 标注 × 倍率**：图标/图片按目标分辨率预生成；纯色块/圆角/阴影用 `ImDrawList` 绘制或 `AddImageRounded`，不导位图。
- **字体**：`ImFontAtlas::AddFontFromFileTTF` 加载；CJK 需显式加字形区间（`AddFontFromFileTTF(..., glyph_ranges_cjk)`），否则中文缺字。

## 4. 状态模型

- ImGui 本身无持久组件状态；**五态 = 你的应用状态 + 即时查询**：Hover 用 `IsItemHovered()`、Active/Pressed 用 `IsItemActive()`/`IsMouseDown`、Focused 用 `IsItemFocused()`、Disabled 用 `BeginDisabled()`。颜色按这些状态在每帧绘制时切换，取自 DESIGN.md 变体键。

## 5. High-DPI

- `io.DisplaySize` + `io.DisplayFramebufferScale`；字体缩放用 `io.FontGlobalScale` 或加载 @2x 字体；后端负责实际 DPR。

## 6. 验收手段

- 渲染到帧缓冲后存 PNG（后端截图 / `glReadPixels` / 软件渲染 dump）；再用 `references/verification.md` + `scripts/pixel_diff.py` 比对（DPR=1、禁动画、窗口 = 该档基准宽）。
- 立即模式需固定帧（停在同一交互状态）再截图，避免画面随输入跳动。

## 7. 已知坑

- **无持久 widget 树 / 无自动重排**：布局完全靠调用顺序与 `SameLine/Columns`，复杂表单易错位；封装成可复用「组件函数」保持一致性。
- **不适合完整 App 皮肤**：ImGui 主打工具/调试/HUD；做产品级多页 UI 需自行抽象布局与状态。
- **CJK 与文本宽度**：必须加载含 CJK 字形区间的字体；`CalcTextSize` 用于手动对齐。
- 绘制层级由**调用顺序**决定（后调用在上层），注意 z-order。

## 8. pixel-perfect 纪律（ImGui 特有）

1. **整数像素**：`ItemSpacing` / `FramePadding` / 尺寸取设计整数值；不写 12.5。
2. **坐标对齐**：`SetNextWindowPos/Size`、`SameLine` 偏移与解剖板核对；1px 偏移即 bug。
3. **状态完备**：每帧按 Hover/Active/Focused/Disabled 切换绘制颜色，逐一取自 DESIGN.md 变体键。
4. **字体**：加载字体字重/字号/行高与 F2 一致；CJK 区间齐全。
5. **截图验证**：固定帧后 dump PNG，窗口 = 该档基准宽，DPR=1。
6. **资源零外链**：纹理/字体由你加载并在内存管理，不依赖运行时相对路径文件。
7. **响应式 / 档位**：`targetProfiles` 多档时用 `SetNextWindowSizeConstraints` + 重排实现 pad/mobile 单列，触控 ≥44px；逐档截图比对。
