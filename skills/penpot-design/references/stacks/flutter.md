# 适配器：Flutter（Dart，跨平台）

通用纪律见 `references/design-to-code-generic.md`（token 只引变量、分层、资源零外链、五态、整数像素、验收流程）。
本文件只写 Flutter 特有部分；总原则与视口档位约束同 generic §0。跨平台（mobile / desktop / web / embedded）。

## 1. 概况（范式 / 平台与语言 / 布局模型 / 样式机制）

- **范式**：retained canvas（Widget 树 → RenderObject，Skia 渲染）。
- **平台与语言**：Dart；单一代码库多端。
- **布局模型**：约束式（BoxConstraints）。`Row`/`Column`（flex）、`Stack`、`Padding`、`Container`、`ConstrainedBox`、`GridView`/`ListView`、`Expanded`/`Flexible`。
- **样式机制**：**Flutter 无 CSS**，一切皆 Widget。`Container.decoration: BoxDecoration(color/borderRadius/boxShadow)`、`ThemeData(colorScheme, textTheme, ...)`、`TextStyle`；变体靠组合不同 Widget / `Theme` 扩展。无样式表文件。

## 2. Token 映射

- DESIGN.md tokens → **Dart 常量类**（`class AppColors { static const primary = Color(0xFF1A1C1E); }`、`class AppRadius { static const md = 8.0; }`、`class AppSpace { static const btnX = 16.0; }`），组件只引用这些常量，**禁散落 hex/px**。
- 字阶：`TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.6)`，集中到 `AppTypography`。
- `ThemeData.light()/dark()` 注入 `colorScheme` / `textTheme`，全局统一。

## 3. 资源系统

- **图片**：在 `pubspec.yaml` 声明 `assets:`（按 `images/2.0x/`、`images/3.0x/` 分辨率目录自动选）；`AssetImage` / `Image.asset`。
- **字体**：`pubspec.yaml` `fonts:` 注册 `family`；SVG 用 `flutter_svg`（`SvgPicture.asset`）。
- 导出尺寸 = 标注 × 倍率（`2.0x`/`3.0x`）；纯色块/圆角/阴影用 `BoxDecoration`（`boxShadow` 由 Skia 实现，不像 LVGL 受限），不导位图。

## 4. 状态模型

- 五态映射用 **MaterialState**（MaterialState.hovered/pressed/focused/disabled/selected）+ `MaterialStateProperty`（如 `MaterialStateProperty.resolveWith` 决定颜色）；或 `StatefulWidget` 自行维护状态。颜色逐一取自 DESIGN.md 变体键。

## 5. High-DPI

- `MediaQuery.of(context).devicePixelRatio` 由框架处理；资源 `2.0x`/`3.0x` 自动匹配；布局用逻辑像素（dp），无需手写 DPR。

## 6. 验收手段

- Flutter 原生支持 **Golden 测试**：`expectLater(find.byWidget(w), matchesGoldenFile('button.png'))`（`flutter test` 生成 / 比对像素）——最贴合 pixel-perfect。
- 也用 `integration_test` 截图或外部位图导出；再用 `references/verification.md` + `scripts/pixel_diff.py` 比对（DPR=1、禁动画、窗口 = 该档基准宽：web 1440 / pad 834 / mobile 375）。

## 7. 已知坑

- **无 CSS**：所有视觉都靠 Widget 组合与 `BoxDecoration`，别找样式表；`BoxShadow`（`boxShadow`）可用，比 LVGL 强。
- **文本缩放**：系统字体缩放会影响布局，验收时固定 `TextScaler`。
- 平台通道 / Web 渲染器（CanvasKit vs HTML）差异；`const` 构造函数利于稳定布局与比对。

## 8. pixel-perfect 纪律（Flutter 特有）

1. **整数像素**：间距/尺寸/圆角取设计整数标注；用 token 常量，不写 12.5。
2. **坐标对齐**：`Padding`/`SizedBox`/`margin` 与解剖板核对；1px 偏移即 bug。
3. **状态完备**：`MaterialState` 五态逐一实现，颜色取自 DESIGN.md 变体键。
4. **字体**：字体字重/字号/行高与 F2 一致；禁合成粗体；CJK 字体 family 正确。
5. **截图验证**：Golden 测试或集成截图，窗口 = 该档基准宽，DPR=1，`TextScaler` 固定。
6. **资源零外链**：图片/字体进 `pubspec` assets，编译进包，不依赖运行时路径。
7. **响应式 / 档位**：`targetProfiles` 多档时用 `LayoutBuilder` / `MediaQuery` 重排实现 pad/mobile 单列，触控 ≥44px；逐档截图比对。
