# 适配器：.NET MAUI（Multi-platform App UI）

通用纪律见 `references/design-to-code-generic.md`（token 只引变量、分层、资源零外链、五态、整数像素、验收流程）。
本文件只写 MAUI 特有部分；总原则与视口档位约束同 generic §0。跨平台（Android / iOS / Windows / macOS）。

## 1. 概况（范式 / 平台与语言 / 布局模型 / 样式机制）

- **范式**：retained XAML / C#（声明式 UI 树 + 代码后置）。
- **平台与语言**：C# + XAML；.NET（单项目多目标）。
- **布局模型**：`Grid`、`StackLayout`（`Vertical`/`Horizontal`）、`FlexLayout`、`AbsoluteLayout`、`Grid` 列行约束；约束式（基于 DPS 密度无关单位）。
- **样式机制**：XAML `Style` + `ResourceDictionary`（`Setter` 设 `BackgroundColor`/`CornerRadius`/`FontSize`…）；`VisualStateManager`（VSM）管理状态；无原始 CSS（可用少量 CSS 但通过 `Style` 映射）。

## 2. Token 映射

- DESIGN.md tokens → **ResourceDictionary 资源**（`<Color x:Key="Primary">#1A1C1E</Color>`、`<CornerRadius x:Key="RadiusMd">8</CornerRadius>`、`<Thickness x:Key="PadBtnX">16,0</Thickness>`），`StaticResource` 引用。
- 主题切换用 `App.Current.Resources` 或 `DynamicResource`；颜色/字阶集中定义，组件只引资源，**禁散落 hex/px**。

## 3. 资源系统

- **图片**：MauiImage（csproj 里 `<MauiImage Include="..." />`），按 `@1x/@2x/@3x` 自动选；或 `EmbeddedResource`。代码用 `ImageSource.FromFile` / `Image` 控件。
- **字体**：`EmbeddedResource` + `ExportFont`；导出尺寸 = 标注 × 倍率（MauiImage 处理）。
- **图标**：字体图标（`FontImageSource`）或 SVG（MAUI 支持 `Image` 直接 SVG）；纯色块/圆角/阴影用 XAML（`Border`/`Shadow`/`CornerRadius`）绘制，不导位图。

## 4. 状态模型

- 五态映射到 **VisualStateManager**：`Normal`(Default) / `Disabled` / `Pressed` / `Focused` / `PointerOver`(Hover)；在 `VisualStateGroup` 里对 `BackgroundColor` 等设值，颜色取自 DESIGN.md 变体键。

## 5. High-DPI

- MAUI 用 **DPS（密度无关单位）**，按平台自动缩放；MauiImage 多分辨率资源自动匹配，无需手动 DPR。

## 6. 验收手段

- 在模拟器 / 仿真器 / 真机或 Windows 桌面跑，截图（Xharness / 平台截图工具 / 桌面截图）；再用 `references/verification.md` + `scripts/pixel_diff.py` 比对（DPR=1、禁动画、窗口 = 该档基准宽：web 1440 / pad 834 / mobile 375）。
- MAUI 无内建黄金测试，靠设备/模拟器截图 + 逐层比对。

## 7. 已知坑

- **平台渲染差异**：同一 XAML 在 Android/iOS/Windows 渲染略有差异（阴影/圆角/字体度量），验收需逐平台比对。
- **Handler 架构（.NET 8+）**：控件逻辑在 Handler，深度定制走 `Handler` / `Mapper` 覆盖。
- 字体命名与版权、CJK 字体嵌入体积；`FlexLayout` 与 WPF/UWP 行为不同。

## 8. pixel-perfect 纪律（MAUI 特有）

1. **整数像素**：布局用 DPS 整数值 + `Thickness`/`CornerRadius` 常量，取设计整数标注。
2. **坐标对齐**：Grid 行列 / `Margin`/`Padding` 与解剖板核对；1px 偏移即 bug。
3. **状态完备**：VSM 五态逐一实现，颜色取自 DESIGN.md 变体键。
4. **字体**：嵌入字体字重/字号/行高与 F2 一致；CJK 齐全。
5. **截图验证**：模拟器/真机/桌面截图，窗口 = 该档基准宽，DPR=1，逐平台核对。
6. **资源零外链**：图片/字体走 MauiImage/EmbeddedResource，编译进包，不依赖运行时路径。
7. **响应式 / 档位**：`targetProfiles` 多档时用 `Grid`/`FlexLayout` 重排实现 pad/mobile 单列，触控 ≥44px；逐档截图比对。
