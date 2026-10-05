# Adapter: SwiftUI (Apple platforms, Swift)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only SwiftUI-specific parts; the general principles and viewport-tier constraints are the same as generic §0. Platforms: iOS / iPadOS / macOS / watchOS / tvOS / visionOS.

## 1. Overview (paradigm / platform & language / layout model / styling mechanism)

- **Paradigm**: declared constraint (declarative, diff update, auto-layout constraints).
- **Platform & language**: Swift; Apple SDK.
- **Layout model**: declarative stacks `VStack`/`HStack`/`ZStack`, `Grid`/`LazyVGrid`, `GeometryReader`, `Spacer`, `padding()`, `.frame()`; constraint-based auto-layout, no CSS.
- **Styling mechanism**: **SwiftUI has no CSS**, entirely via modifiers (`.foregroundStyle`/`.background`/`.clipShape(RoundedRectangle(cornerRadius:))`/`.shadow`/`.border`); `@Environment` theme; colors/fonts centralized into design-system structs.

## 2. Token mapping

- DESIGN.md tokens → **Swift extensions / structs**: `extension Color { static let primary = Color(hex: "1A1C1E") }`, `enum Radius { static let md: CGFloat = 8 }`, `enum Spacing { static let btnX: CGFloat = 16 }`.
- Type scale: `Font.custom("PublicSans", size: 16, relativeTo: .body)` or `Font.system(size:16, weight:.regular)`; centralized into `AppTypography`.
- Components only reference these constants, **no scattered hex/px**.

## 3. Asset system

- **Images**: Asset catalog (`Images.xcassets`) with `@1x/@2x/@3x` and dark variants; `Image("logo")`. SVG via `Image(nsImage:)` / vector PDF or SF Symbols.
- **Fonts**: register font family in asset catalog, `Font.custom(...)`; export size = annotation × multiplier (catalog automatic).
- Solid blocks/radii/shadows done with modifiers (`RoundedRectangle` + `.fill`/`.shadow`), no exported bitmaps.

## 4. State model

- Five states rely on **SwiftUI state + manual mapping**: `@State`/`@Binding` control the view; `ButtonStyle` / `PrimitiveButtonStyle`'s `Configuration.isPressed` (Pressed), `@Environment(\.isEnabled)` (Disabled), custom hover/focus (`.onHover` / `FocusState`); colors taken one-by-one from DESIGN.md variant keys.

## 5. High-DPI

- Asset catalog `@2x/@3x` + system scale auto-handled; no manual DPR; layout uses point (pt) logical units.

## 6. Acceptance means

- Use **snapshot testing** (e.g. `swift-snapshot-testing` or XCTest `XCTAttachment(image:)` screenshot) to export PNG; then compare with `references/verification.md` + `scripts/pixel_diff.py` (DPR=1, animations off, window = that tier's baseline width: pad 834 / mobile 375).
- Fix the preview environment (`.previewDevice` / fixed size) to ensure reproducibility.

## 7. Known pitfalls

- **No CSS / no arbitrary shadows**: `.shadow` is available but limited in style; complex glow uses `Canvas` or images.
- Platform version gating (some modifiers only on newer OS); `Canvas` for custom drawing; text rendering differs from web font metrics.
- SF Symbols and custom icon naming must align with the 01 F6 icon board.

## 8. pixel-perfect discipline (SwiftUI-specific)

1. **Integer pixels**: `padding`/`.frame`/`.cornerRadius` take integer design annotations; use token constants, never 12.5.
2. **Coordinate alignment**: `VStack`/`HStack` spacing checked against the anatomy board; a 1px offset is a bug.
3. **State completeness**: isPressed/disabled/hover/focus implemented one-by-one, colors from DESIGN.md variant keys.
4. **Font**: font weight/size/line-height consistent with F2; `relativeTo` avoids system scaling drift; correct CJK font.
5. **Screenshot verification**: snapshot test exports PNG, window = that tier's baseline width, DPR=1.
6. **Zero external asset links**: images/fonts go into asset catalog, compiled into the package, no runtime path dependence.
7. **Responsive / tiers**: when `targetProfiles` has multiple tiers, use `GeometryReader` / `Grid` to reflow into pad/mobile single-column, touch ≥44px; screenshot each tier and compare.
