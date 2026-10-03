# 适配器：Jetpack Compose（Android / Compose Multiplatform，Kotlin）

通用纪律见 `references/design-to-code-generic.md`（token 只引变量、分层、资源零外链、五态、整数像素、验收流程）。
本文件只写 Compose 特有部分；总原则与视口档位约束同 generic §0。平台：Android 为主，Compose Multiplatform 扩至桌面/Web。

## 1. 概况（范式 / 平台与语言 / 布局模型 / 样式机制）

- **范式**：declared constraint（声明式，recomposition 更新）。
- **平台与语言**：Kotlin；Android（及 Compose Multiplatform 桌面/Web）。
- **布局模型**：`Column`/`Row`/`Box`（类似 flex）、`ConstraintLayout`、`LazyColumn`/`LazyVerticalGrid`、`Modifier.padding/width/height/size`；modifier 链式组合；约束式。
- **样式机制**：**无 CSS**，全靠 `Modifier`（`.background`/`.clip(RoundedCornerShape())`/`.shadow`/`.border`）；`MaterialTheme(colorScheme, typography, shapes)`（Material3）；视觉皆 modifier 组合。

## 2. Token 映射

- DESIGN.md tokens → **Kotlin 常量 / Theme**：`val Primary = Color(0xFF1A1C1E)`、`val RadiusMd = 8.dp`（`Dp`）、`val PadBtnX = 16.dp`；挂到 `MaterialTheme.colorScheme` / 自定义 `AppShapes` / `AppDimensions`。
- 字阶：`TextStyle(fontSize = 16.sp, fontWeight = FontWeight.W400, lineHeight = 24.sp)`，集中 `AppTypography`。
- 组件只引这些常量，**禁散落 hex/px**（`dp`/`sp` 为单位）。

## 3. 资源系统

- **图片**：`res/drawable` 按 DPI 桶（`mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi`）放 PNG，或用 **vector drawable**（XML/SVG → `VectorAsset`）；`painterResource(R.drawable.x)`。
- **字体**：`res/font` 注册 family；SVG 图标走 `VectorAsset`。
- 导出尺寸 = 标注 × 倍率（DPI 桶自动）；纯色块/圆角/阴影用 `Modifier`（`.shadow`/`.clip`），不导位图。

## 4. 状态模型

- 五态靠 **`InteractionSource`**（Material3 组件暴露 `hover`/`pressed`/`focused`/`dragged`/`enabled` 状态流）+ 你的 `remember`/`mutableStateOf`；用 `collectAsState` 映射到颜色，逐一取自 DESIGN.md 变体键。

## 5. High-DPI

- Android 用 `dp`（密度无关）+ `sp`（字号，随系统缩放）；drawable 多 DPI 桶自动选；无手动 DPR。

## 6. 验收手段

- 用 **Compose UI 测试截图**：`composeTestRule.onRoot().captureToImage()` 存 PNG（或 Paparazzi / Shot 库做 golden）；再用 `references/verification.md` + `scripts/pixel_diff.py` 比对（DPR=1、禁动画、窗口 = 该档基准宽：pad 834 / mobile 375）。

## 7. 已知坑

- **无 CSS**：视觉全靠 modifier 链；`Material3` 的 `Shapes` 体系（small/medium/large corner）需映射到设计圆角。
- 字体缩放（`sp` + 系统设置）影响布局，验收固定 `fontScale`；Compose Multiplatform 桌面渲染与 Android 略有差异。
- `Modifier` 顺序敏感（`background` 与 `padding` 先后影响裁剪/尺寸）。

## 8. pixel-perfect 纪律（Compose 特有）

1. **整数像素**：`padding`/`size`/`Dp` 取设计整数标注；用 token 常量，不写 12.5。
2. **坐标对齐**：`Column`/`Row` 的 `Arrangement`/`Alignment` 与解剖板核对；1px 偏移即 bug。
3. **状态完备**：`InteractionSource` 五态逐一实现，颜色取自 DESIGN.md 变体键。
4. **字体**：字体字重/字号/行高与 F2 一致；CJK 字体正确；验收固定 `fontScale`。
5. **截图验证**：`captureToImage` 或 golden 库导出 PNG，窗口 = 该档基准宽，DPR=1。
6. **资源零外链**：图片/字体进 `res`，编译进 APK，不依赖运行时路径。
7. **响应式 / 档位**：`targetProfiles` 多档时用 `BoxWithConstraints` / `ConstraintLayout` 重排实现 pad/mobile 单列，触控 ≥44px；逐档截图比对。
