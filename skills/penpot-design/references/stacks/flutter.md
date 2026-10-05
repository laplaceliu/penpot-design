# Adapter: Flutter (Dart, cross-platform)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only Flutter-specific parts; the general principles and viewport-tier constraints are the same as generic §0. Cross-platform (mobile / desktop / web / embedded).

## 1. Overview (paradigm / platform & language / layout model / styling mechanism)

- **Paradigm**: retained canvas (Widget tree → RenderObject, Skia rendering).
- **Platform & language**: Dart; single codebase, multiple platforms.
- **Layout model**: constraint-based (BoxConstraints). `Row`/`Column` (flex), `Stack`, `Padding`, `Container`, `ConstrainedBox`, `GridView`/`ListView`, `Expanded`/`Flexible`.
- **Styling mechanism**: **Flutter has no CSS**; everything is a Widget. `Container.decoration: BoxDecoration(color/borderRadius/boxShadow)`, `ThemeData(colorScheme, textTheme, ...)`, `TextStyle`; variants come from composing different Widgets / `Theme` extensions. No stylesheet files.

## 2. Token mapping

- DESIGN.md tokens → **Dart constant classes** (`class AppColors { static const primary = Color(0xFF1A1C1E); }`, `class AppRadius { static const md = 8.0; }`, `class AppSpace { static const btnX = 16.0; }`), components only reference these constants, **no scattered hex/px**.
- Type scale: `TextStyle(fontSize: 16, fontWeight: FontWeight.w400, height: 1.6)`, centralized into `AppTypography`.
- `ThemeData.light()/dark()` inject `colorScheme` / `textTheme`, globally unified.

## 3. Asset system

- **Images**: declare `assets:` in `pubspec.yaml` (auto-selected by resolution dirs `images/2.0x/`, `images/3.0x/`); `AssetImage` / `Image.asset`.
- **Fonts**: register `family` via `fonts:` in `pubspec.yaml`; SVG via `flutter_svg` (`SvgPicture.asset`).
- Export size = annotation × multiplier (`2.0x`/`3.0x`); solid blocks/radii/shadows done with `BoxDecoration` (`boxShadow` is implemented by Skia, not as limited as LVGL), no exported bitmaps.

## 4. State model

- Five states map via **MaterialState** (MaterialState.hovered/pressed/focused/disabled/selected) + `MaterialStateProperty` (e.g. `MaterialStateProperty.resolveWith` decides color); or a `StatefulWidget` maintains its own state. Colors taken one-by-one from DESIGN.md variant keys.

## 5. High-DPI

- `MediaQuery.of(context).devicePixelRatio` handled by the framework; `2.0x`/`3.0x` assets auto-matched; layout uses logical pixels (dp), no manual DPR needed.

## 6. Acceptance means

- Flutter natively supports **Golden tests**: `expectLater(find.byWidget(w), matchesGoldenFile('button.png'))` (`flutter test` generates / compares pixels) — the closest fit to pixel-perfect.
- Also use `integration_test` screenshots or external bitmap export; then compare with `references/verification.md` + `scripts/pixel_diff.py` (DPR=1, animations off, window = that tier's baseline width: web 1440 / pad 834 / mobile 375).

## 7. Known pitfalls

- **No CSS**: all visuals rely on Widget composition and `BoxDecoration`; don't look for stylesheets; `BoxShadow` (`boxShadow`) is available, stronger than LVGL.
- **Text scaling**: system font scaling affects layout; fix `TextScaler` during acceptance.
- Platform channels / Web renderer (CanvasKit vs HTML) differences; `const` constructors help stable layout and comparison.

## 8. pixel-perfect discipline (Flutter-specific)

1. **Integer pixels**: spacing/size/radius take integer design annotations; use token constants, never 12.5.
2. **Coordinate alignment**: `Padding`/`SizedBox`/`margin` checked against the anatomy board; a 1px offset is a bug.
3. **State completeness**: implement the five `MaterialState` states one-by-one, colors from DESIGN.md variant keys.
4. **Font**: font weight/size/line-height consistent with F2; synthetic bold disabled; correct CJK font family.
5. **Screenshot verification**: Golden test or integration screenshot, window = that tier's baseline width, DPR=1, fixed `TextScaler`.
6. **Zero external asset links**: images/fonts go into `pubspec` assets, compiled into the package, no runtime path dependence.
7. **Responsive / tiers**: when `targetProfiles` has multiple tiers, use `LayoutBuilder` / `MediaQuery` to reflow into pad/mobile single-column, touch ≥44px; screenshot each tier and compare.
