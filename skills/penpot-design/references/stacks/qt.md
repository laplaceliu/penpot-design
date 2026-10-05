# Adapter: Qt (Qt4 / Qt5 / Qt6)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only Qt-specific parts; the general principles and viewport-tier constraints are the same as generic §0.

## 1. Token layer (shared baseline across the three versions)

- DESIGN.md tokens → a single token header file (`design_tokens.h` constants + `theme.qss` variable section); when QSS has no CSS variables, use `QString` constant concatenation or a base-class `applyTheme(const Theme&)` that calls setStyleSheet at runtime; font sizes set explicitly via `QFont`. **No scattered magic numbers.**

## 2. Asset system (.qrc)

- All images/icons go through the Qt resource system (`.qrc`), prefixes `/images`, `/icons`, filenames matching Penpot export names (`Component-State-Size.png`); code only references `":/images/..."`, never filesystem paths.
- Export @1x/@2x (and @3x when needed); export size = annotation × multiplier.
- Icons uniformly SVG (keep stroke semantics) via `QIcon(":/icons/xxx.svg")`; `enabled/disabled` as two copies or QIcon Mode auto-grays (use two copies when they differ); build `icons.qrc`.
- Solid blocks/radii/shadows drawn with QSS/QPainter, not exported as bitmaps.

## 3. Version differences

### Qt4 (QWidget + QSS)

- **Structure**: single `QApplication`; `MainWindow` composes organisms; one `QWidget` subclass per component + `setStyleSheet` (object-name selector `QPushButton#btnPrimary`).
- **Token mapping**: QSS has no CSS variables → use `QString` constant concatenation or base-class `applyTheme(const Theme&)` at runtime setStyleSheet; font size set explicitly via `QFont` (QSS font-size is also acceptable).
- **Images/icons**: `.qrc` + `QPixmap(":/images/x.png")`, `QIcon`; **Qt4 has no devicePixelRatio** — export 1x assets for the target screen, on HiDPI use `QIcon` (built-in multi-size selection) or export a large image and downsample via `QPixmap::scaled` (no upscaling).
- **Pitfall**: QSS radius + border together produces a 1px fringe; use `border-radius + border: none` or custom `paintEvent`; shadows/glow use a pre-rendered transparent PNG background (Q4 has no convenient QGraphicsDropShadowEffect for the widget scene; Q4.5+ has QGraphicsDropShadowEffect but only within the QGraphicsView system).
- **Example (Primary button atom)**:

```cpp
class ButtonPrimary : public QPushButton {
    Q_OBJECT
public:
    explicit ButtonPrimary(const QString& text, QWidget* parent = nullptr)
        : QPushButton(text, parent) {
        setObjectName("btnPrimary");
        setCursor(Qt::PointingHandCursor);
        setFixedHeight(Tokens::kBtnHeightM);          // from design_tokens.h
        setStyleSheet(
            "QPushButton#btnPrimary {"
            "  background: " + Tokens::kPrimary + ";"
            "  color: " + Tokens::kOnPrimary + ";"
            "  border-radius: " + Tokens::kRadiusMd + "px;"
            "  padding: 0 " + Tokens::kPadBtnX + "px;"
            "  font-size: " + Tokens::kFontBtn + "px; }"
            "QPushButton#btnPrimary:hover  { background: " + Tokens::kPrimaryHover + "; }"
            "QPushButton#btnPrimary:pressed{ background: " + Tokens::kPrimaryActive + "; }"
            "QPushButton#btnPrimary:disabled{ background: " + Tokens::kPrimaryDisabled + "; }");
    }
};
```

### Qt5 (QWidget/QML + QSS + High-DPI)

- **Structure**: same layering as Qt4; QWidget route uses QSS + `Q_PROPERTY` theme object; QML route makes atoms `Control` subclasses + `QtObject` theme singleton (`Theme.qml` holds tokens).
- **High-DPI (required)**: `QApplication::setAttribute(Qt::AA_EnableHighDpiScaling)` + `QGuiApplication::setAttribute(Qt::AA_UseHighDpiPixmaps)`; export assets @1x/@2x, named `name.png` / `name@2x.png` (Qt auto-selects multiplier).
- **Images/icons**: `.qrc` (`RESOURCES += assets.qrc` or `qt5_add_resources`); in QML `Image { source: "qrc:/images/x@2x.png"; sourceSize }`; icons `QIcon` (QWidget) / `Image` + SVG (SVG via QML native support or QSvgRenderer).
- **Shadow/glow**: `QGraphicsDropShadowEffect` (available for QWidget); glow = large blur + primary color + high opacity, watch performance (avoid rebuilding every frame).
- **Example (Card composite key differences)**: QSS `border-radius` + `QGraphicsDropShadowEffect` + image `QLabel::setPixmap(QPixmap(":/images/avatar.png"))`, size taken from the design anatomy board annotation, never scale by feel.

### Qt6 (QWidget/QML + qt_add_resources)

- **Structure**: CMake `qt_add_executable` / `qt_add_qml_module`; layering as above; QML + `Theme` singleton recommended (tokens expressed as `pragma Singleton` + `readonly property color`, closest to CSS variables).
- **High-DPI**: Qt6 enables it by default, no attribute needed; `QPixmap::devicePixelRatio` auto-handled, still export @1x/@2x (Qt6 also supports @3x).
- **Images/icons**: `qt_add_resources(app "assets" PREFIX "/" FILES images/... icons/...)`; SVG icons via `QSvgIconEngine` (`QIcon("qrc:/icons/x.svg")`) or QML `Image`; **icon coloring** via `QIcon` + `QPalette` or dynamically replacing `currentColor` in SVG (linked to design tokens).
- **Glow/shadow**: `MultiEffect` (Qt6.5+ QtQuick.Effects) or `RectangularShadow` (Qt5Compat.GraphicalEffects); widget route same as Qt5.
- **Example (QML atom)**:

```qml
// atoms/ButtonPrimary.qml
Button {
    id: root
    padding: Theme.padBtnX
    implicitHeight: Theme.btnHeightM
    background: Rectangle {
        radius: Theme.radiusMd
        color: root.down ? Theme.primaryActive
             : root.hovered ? Theme.primaryHover
             : root.enabled ? Theme.primary : Theme.primaryDisabled
    }
    contentItem: Text {
        text: root.text
        color: Theme.onPrimary
        font: Theme.fontBtn
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }
}
```

## 4. pixel-perfect discipline (Qt-specific)

1. **Integer pixels**: all spacing/sizes take integer design annotations; layout uses fixed sizes + Layout spacing constants, never values like 12.5.
2. **Coordinate alignment**: QSS `padding`/`margin` checked item-by-item against the design anatomy board; a 1px offset is treated as a bug.
3. **State completeness**: every interactive widget implements the five states Default/Hover/Pressed/Focused/Disabled, colors taken one-by-one from DESIGN.md variant keys.
4. **Font**: family/weight/size/line-height/letter-spacing consistent with the F2 type scale; line-height in Qt uses `QFontMetrics` + manual leading or QSS `line-height` (use rich text / custom draw when QSS support is limited).
5. **Screenshot verification**: after each layer, run the PIL comparison in verification.md (DPR=1, animations off, fixed window size = **that tier's baseline width**: web 1440 / pad 834 / mobile 375).
6. **Zero external asset links**: the build artifact does not depend on workspace-relative image paths; all compiled into the binary via qrc.
7. **Responsive / tiers**: when `targetProfiles` contains multiple tiers, use Qt layouts to adapt (QHBoxLayout⇄QVBoxLayout stacking, QML responsive) to implement pad/mobile single-column layouts, touch targets ≥44px; a single tier can fix that window width. Screenshot each tier separately and compare against the corresponding Penpot board.
