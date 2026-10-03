# 适配器：SwiftUI（Apple 平台，Swift）

通用纪律见 `references/design-to-code-generic.md`（token 只引变量、分层、资源零外链、五态、整数像素、验收流程）。
本文件只写 SwiftUI 特有部分；总原则与视口档位约束同 generic §0。平台：iOS / iPadOS / macOS / watchOS / tvOS / visionOS。

## 1. 概况（范式 / 平台与语言 / 布局模型 / 样式机制）

- **范式**：declared constraint（声明式，diff 更新，自动布局约束）。
- **平台与语言**：Swift；Apple SDK。
- **布局模型**：声明式栈 `VStack`/`HStack`/`ZStack`、`Grid`/`LazyVGrid`、`GeometryReader`、`Spacer`、`padding()`、`.frame()`；约束式自动布局，无 CSS。
- **样式机制**：**SwiftUI 无 CSS**，全靠 modifier（`.foregroundStyle`/`.background`/`.clipShape(RoundedRectangle(cornerRadius:))`/`.shadow`/`.border`）；`@Environment` 主题；颜色/字体集中到设计系统结构体。

## 2. Token 映射

- DESIGN.md tokens → **Swift 扩展 / 结构体**：`extension Color { static let primary = Color(hex: "1A1C1E") }`、`enum Radius { static let md: CGFloat = 8 }`、`enum Spacing { static let btnX: CGFloat = 16 }`。
- 字阶：`Font.custom("PublicSans", size: 16, relativeTo: .body)` 或 `Font.system(size:16, weight:.regular)`；集中到 `AppTypography`。
- 组件只引用这些常量，**禁散落 hex/px**。

## 3. 资源系统

- **图片**：Asset catalog（`Images.xcassets`）含 `@1x/@2x/@3x` 与 dark 变体；`Image("logo")`。SVG 用 `Image(nsImage:)` / 矢量 PDF 或 SF Symbols。
- **字体**：Asset catalog 注册 font family，`Font.custom(...)`；导出尺寸 = 标注 × 倍率（catalog 自动）。
- 纯色块/圆角/阴影用 modifier（`RoundedRectangle` + `.fill`/`.shadow`），不导位图。

## 4. 状态模型

- 五态靠 **SwiftUI 状态 + 手动映射**：`@State`/`@Binding` 控制视图；`ButtonStyle` / `PrimitiveButtonStyle` 的 `Configuration.isPressed`（Pressed）、`@Environment(\.isEnabled)`（Disabled）、自定义 hover/focus（`.onHover` / `FocusState`）；颜色逐一取自 DESIGN.md 变体键。

## 5. High-DPI

- Asset catalog 的 `@2x/@3x` + 系统 scale 自动处理；无手动 DPR；布局用点（pt）逻辑单位。

## 6. 验收手段

- 用 **快照测试**（如 `swift-snapshot-testing` 或 XCTest `XCTAttachment(image:)` 截图）导出 PNG；再用 `references/verification.md` + `scripts/pixel_diff.py` 比对（DPR=1、禁动画、窗口 = 该档基准宽：pad 834 / mobile 375）。
- 固定预览环境（`.previewDevice` / 固定 size）保证可复现。

## 7. 已知坑

- **无 CSS / 无任意阴影**：`.shadow` 可用但样式有限；复杂发光用 `Canvas` 或图片。
- 平台版本门控（部分 modifier 仅新 OS）；`Canvas` 做自定义绘制；文本渲染与 web 字体度量不同。
- SF Symbols 与自定义图标命名需对齐 01 F6 图标板。

## 8. pixel-perfect 纪律（SwiftUI 特有）

1. **整数像素**：`padding`/`.frame`/`.cornerRadius` 取设计整数标注；用 token 常量，不写 12.5。
2. **坐标对齐**：`VStack`/`HStack` spacing 与解剖板核对；1px 偏移即 bug。
3. **状态完备**：isPressed/disabled/hover/focus 逐一实现，颜色取自 DESIGN.md 变体键。
4. **字体**：字体字重/字号/行高与 F2 一致；`relativeTo` 避免系统缩放漂移；CJK 字体正确。
5. **截图验证**：快照测试导出 PNG，窗口 = 该档基准宽，DPR=1。
6. **资源零外链**：图片/字体进 Asset catalog，编译进包，不依赖运行时路径。
7. **响应式 / 档位**：`targetProfiles` 多档时用 `GeometryReader` / `Grid` 重排实现 pad/mobile 单列，触控 ≥44px；逐档截图比对。
