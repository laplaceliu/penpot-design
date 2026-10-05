# Adapter: Jetpack Compose (Android / Compose Multiplatform, Kotlin)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only Compose-specific parts; the general principles and viewport-tier constraints are the same as generic §0. Platform: mainly Android, Compose Multiplatform extends to desktop/Web.

## 1. Overview (paradigm / platform & language / layout model / styling mechanism)

- **Paradigm**: declared constraint (declarative, recomposition updates).
- **Platform & language**: Kotlin; Android (and Compose Multiplatform desktop/Web).
- **Layout model**: `Column`/`Row`/`Box` (flex-like), `ConstraintLayout`, `LazyColumn`/`LazyVerticalGrid`, `Modifier.padding/width/height/size`; chained modifier composition; constraint-based.
- **Styling mechanism**: **no CSS**, entirely via `Modifier` (`.background`/`.clip(RoundedCornerShape())`/`.shadow`/`.border`); `MaterialTheme(colorScheme, typography, shapes)` (Material3); visuals are all modifier composition.

## 2. Token mapping

- DESIGN.md tokens → **Kotlin constants / Theme**: `val Primary = Color(0xFF1A1C1E)`, `val RadiusMd = 8.dp` (`Dp`), `val PadBtnX = 16.dp`; attached to `MaterialTheme.colorScheme` / custom `AppShapes` / `AppDimensions`.
- Type scale: `TextStyle(fontSize = 16.sp, fontWeight = FontWeight.W400, lineHeight = 24.sp)`, centralized `AppTypography`.
- Components only reference these constants, **no scattered hex/px** (units `dp`/`sp`).

## 3. Asset system

- **Images**: `res/drawable` by DPI buckets (`mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi`) holds PNG, or use **vector drawable** (XML/SVG → `VectorAsset`); `painterResource(R.drawable.x)`.
- **Fonts**: register family in `res/font`; SVG icons go through `VectorAsset`.
- Export size = annotation × multiplier (DPI buckets automatic); solid blocks/radii/shadows done with `Modifier` (`.shadow`/`.clip`), no exported bitmaps.

## 4. State model

- Five states rely on **`InteractionSource`** (Material3 components expose `hover`/`pressed`/`focused`/`dragged`/`enabled` state flows) + your `remember`/`mutableStateOf`; use `collectAsState` to map to colors, taken one-by-one from DESIGN.md variant keys.

## 5. High-DPI

- Android uses `dp` (density-independent) + `sp` (font size, follows system scaling); multi-DPI drawable buckets auto-selected; no manual DPR.

## 6. Acceptance means

- Use **Compose UI test screenshot**: `composeTestRule.onRoot().captureToImage()` saves PNG (or Paparazzi / Shot libraries for golden); then compare with `references/verification.md` + `scripts/pixel_diff.py` (DPR=1, animations off, window = that tier's baseline width: pad 834 / mobile 375).

## 7. Known pitfalls

- **No CSS**: visuals entirely via modifier chains; Material3's `Shapes` system (small/medium/large corner) must map to design radii.
- Font scaling (`sp` + system settings) affects layout; fix `fontScale` during acceptance; Compose Multiplatform desktop rendering differs slightly from Android.
- `Modifier` order is sensitive (`background` vs `padding` order affects clipping/size).

## 8. pixel-perfect discipline (Compose-specific)

1. **Integer pixels**: `padding`/`size`/`Dp` take integer design annotations; use token constants, never 12.5.
2. **Coordinate alignment**: `Column`/`Row` `Arrangement`/`Alignment` checked against the anatomy board; a 1px offset is a bug.
3. **State completeness**: implement the five `InteractionSource` states one-by-one, colors from DESIGN.md variant keys.
4. **Font**: font weight/size/line-height consistent with F2; correct CJK font; fixed `fontScale` during acceptance.
5. **Screenshot verification**: `captureToImage` or golden library exports PNG, window = that tier's baseline width, DPR=1.
6. **Zero external asset links**: images/fonts go into `res`, compiled into APK, no runtime path dependence.
7. **Responsive / tiers**: when `targetProfiles` has multiple tiers, use `BoxWithConstraints` / `ConstraintLayout` to reflow into pad/mobile single-column, touch ≥44px; screenshot each tier and compare.
