# Adapter: .NET MAUI (Multi-platform App UI)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only MAUI-specific parts; the general principles and viewport-tier constraints are the same as generic §0. Cross-platform (Android / iOS / Windows / macOS).

## 1. Overview (paradigm / platform & language / layout model / styling mechanism)

- **Paradigm**: retained XAML / C# (declarative UI tree + code-behind).
- **Platform & language**: C# + XAML; .NET (single project, multiple targets).
- **Layout model**: `Grid`, `StackLayout` (`Vertical`/`Horizontal`), `FlexLayout`, `AbsoluteLayout`, Grid row/column constraints; constraint-based (on DPS density-independent units).
- **Styling mechanism**: XAML `Style` + `ResourceDictionary` (`Setter` sets `BackgroundColor`/`CornerRadius`/`FontSize`…); `VisualStateManager` (VSM) manages states; no raw CSS (a little CSS is possible but mapped through `Style`).

## 2. Token mapping

- DESIGN.md tokens → **ResourceDictionary resources** (`<Color x:Key="Primary">#1A1C1E</Color>`, `<CornerRadius x:Key="RadiusMd">8</CornerRadius>`, `<Thickness x:Key="PadBtnX">16,0</Thickness>`), referenced via `StaticResource`.
- Theme switching via `App.Current.Resources` or `DynamicResource`; colors/type scale defined centrally, components only reference resources, **no scattered hex/px**.

## 3. Asset system

- **Images**: MauiImage (in csproj `<MauiImage Include="..." />`), auto-selected by `@1x/@2x/@3x`; or `EmbeddedResource`. Code uses `ImageSource.FromFile` / `Image` control.
- **Fonts**: `EmbeddedResource` + `ExportFont`; export size = annotation × multiplier (handled by MauiImage).
- **Icons**: font icons (`FontImageSource`) or SVG (MAUI supports `Image` directly with SVG); solid blocks/radii/shadows drawn with XAML (`Border`/`Shadow`/`CornerRadius`), no exported bitmaps.

## 4. State model

- Five states map to **VisualStateManager**: `Normal`(Default) / `Disabled` / `Pressed` / `Focused` / `PointerOver`(Hover); in `VisualStateGroup` set values like `BackgroundColor`, colors from DESIGN.md variant keys.

## 5. High-DPI

- MAUI uses **DPS (density-independent units)**, auto-scaled per platform; MauiImage multi-resolution assets auto-matched, no manual DPR.

## 6. Acceptance means

- Run on emulator / simulator / real device or Windows desktop, screenshot (Xharness / platform screenshot tools / desktop screenshot); then compare with `references/verification.md` + `scripts/pixel_diff.py` (DPR=1, animations off, window = that tier's baseline width: web 1440 / pad 834 / mobile 375).
- MAUI has no built-in golden tests; relies on device/simulator screenshots + layer-by-layer comparison.

## 7. Known pitfalls

- **Platform rendering differences**: the same XAML renders slightly differently on Android/iOS/Windows (shadows/radii/font metrics); acceptance must compare per platform.
- **Handler architecture (.NET 8+)**: control logic lives in Handler; deep customization goes through `Handler` / `Mapper` overrides.
- Font naming and licensing, CJK font embedding size; `FlexLayout` behaves differently from WPF/UWP.

## 8. pixel-perfect discipline (MAUI-specific)

1. **Integer pixels**: layout uses DPS integer values + `Thickness`/`CornerRadius` constants, taking integer design annotations.
2. **Coordinate alignment**: Grid rows/columns / `Margin`/`Padding` checked against the anatomy board; a 1px offset is a bug.
3. **State completeness**: implement the five VSM states one-by-one, colors from DESIGN.md variant keys.
4. **Font**: embedded font weight/size/line-height consistent with F2; complete CJK.
5. **Screenshot verification**: emulator/real-device/desktop screenshot, window = that tier's baseline width, DPR=1, per-platform check.
6. **Zero external asset links**: images/fonts go through MauiImage/EmbeddedResource, compiled into the package, no runtime path dependence.
7. **Responsive / tiers**: when `targetProfiles` has multiple tiers, use `Grid`/`FlexLayout` to reflow into pad/mobile single-column, touch ≥44px; screenshot each tier and compare.
