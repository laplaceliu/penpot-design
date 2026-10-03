# Design → Code：Qt 输出指南（Qt4 / Qt5 / Qt6 分列）

总原则：**像素级还原 Penpot 设计系统**（pixel-perfect）；按组件索引页（13 页）的规划**分层实现**：token 层 → 原子组件 → 组合组件 → 模块/页面 → Demo 对齐 **14 页各所选档位的屏幕板**。每层落地后立即用 references/verification.md 的 PIL 流程比对。
**档位约束**：先读 DESIGN.md `targetProfiles` 确定目标宽度（web/pad/mobile）；按档位做 Qt 布局自适应
（QHBoxLayout/QVBoxLayout/Stacked 或 QML 响应式），验收窗口宽 = 该档基准宽，逐档截图比对（见 §4 第 7 条）。

## 0. 通用：token 层与资源引用（三版本共用基线）

- DESIGN.md tokens → 单一 token 头文件（如 `design_tokens.h` 常量 + `theme.qss` 变量区），**禁止在组件里散落魔法数字**。
- **图片资源**：
  - 全部走 Qt 资源系统（`.qrc`），前缀 `/images`、`/icons`，文件名与 Penpot 导出名一致（`组件名-状态-尺寸.png`）。
  - 代码只引用资源路径 `":/images/card-hero@2x.png"`，不引用文件系统路径。
  - 从 Penpot `export_shape` 导出 @1x/@2x（必要时 @3x）；**导出尺寸 = 设计稿标注尺寸 × 倍率**，勿在代码里缩放大图。
  - 摄影/插画类内容图用 WebP/PNG；纯色块/圆角用代码绘制（QSS/QPainter），不导出位图——放大后才不糊。
- **图标资源**：
  - 图标统一 SVG（描边图标保持 stroke 语义），经 `QIcon(":/icons/xxx.svg")` 使用；同一图标导出 `enabled/disabled` 两个状态或用 QIcon Mode（Normal/Disabled）由 Qt 自动变灰（自动变灰与设计稿不符时导出双份）。
  - 图标按钮尺寸 = 图标 24px + padding（按设计解剖板标注），图标在按钮内居中误差 ≤1px。
  - 建立 `icons.qrc` 单独管理，命名与 01 设计基础页 F6 图标板一致。
- **层级组织**（行业惯例）：`src/tokens/` → `src/atoms/`（Button、Input…）→ `src/molecules/`（SearchBox…）→ `src/organisms/`（Nav、Table…）→ `src/pages/`；类名/文件名与 Penpot 组件名一一对应（`Button·Primary` → `ButtonPrimary`）。

## 1. Qt4（QWidget + QSS）

- **结构**：单 `QApplication`；`MainWindow` 组合 organisms；每组件一个 `QWidget` 子类 + `setStyleSheet`（对象名选择器 `QPushButton#btnPrimary`）。
- **token 映射**：QSS 无 CSS 变量 → 用 `QString` 常量拼接或基类 `applyTheme(const Theme&)` 运行时 setStyleSheet；字号用 `QFont` 显式设置（QSS font-size 亦可）。
- **图片/图标**：`.qrc` + `QPixmap(":/images/x.png")`、`QIcon`；**Qt4 无 devicePixelRatio**——素材按目标屏导出 1x，高分屏用 `QIcon`（内置多尺寸选择）或导出大图按 `QPixmap::scaled` 降采样（禁止放大）。
- **坑**：QSS 圆角 + 边框同设会产生 1px 毛边，用 `border-radius + border: none` 或自绘 `paintEvent`；阴影/发光用预渲染透明 PNG 背景（Q4 无 QGraphicsDropShadowEffect 于 widgets 场景的便捷路径，Q4.5+ 有 QGraphicsDropShadowEffect 但仅 QGraphicsView 体系）。
- **示例（Primary 按钮原子）**：

```cpp
class ButtonPrimary : public QPushButton {
    Q_OBJECT
public:
    explicit ButtonPrimary(const QString& text, QWidget* parent = nullptr)
        : QPushButton(text, parent) {
        setObjectName("btnPrimary");
        setCursor(Qt::PointingHandCursor);
        setFixedHeight(Tokens::kBtnHeightM);          // 来自 design_tokens.h
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

## 2. Qt5（QWidget/QML + QSS + High-DPI）

- **结构**：同 Qt4 分层；QWidget 路线用 QSS + `Q_PROPERTY` 主题对象；QML 路线把 atoms 做成 `Control` 派生 + `QtObject` theme 单例（`Theme.qml` 持 token）。
- **High-DPI（必须）**：`QApplication::setAttribute(Qt::AA_EnableHighDpiScaling)` + `QGuiApplication::setAttribute(Qt::AA_UseHighDpiPixmaps)`；素材导出 @1x/@2x，命名 `name.png` / `name@2x.png`（Qt 自动选倍率）。
- **图片/图标**：`.qrc`（`RESOURCES += assets.qrc` 或 `qt5_add_resources`）；QML 里 `Image { source: "qrc:/images/x@2x.png"; sourceSize }`；图标 `QIcon`（QWidget）/ `Image` + SVG（SVG 走 QML 原生支持或 QSvgRenderer）。
- **阴影/发光**：`QGraphicsDropShadowEffect`（QWidget 可用）；发光 = 大 blur + 主色 + 高 opacity，注意性能（避免每帧重建）。
- **示例（Card 组合组件关键差异）**：QSS `border-radius` + `QGraphicsDropShadowEffect` + 图片 `QLabel::setPixmap(QPixmap(":/images/avatar.png"))`，尺寸取设计解剖板标注，勿凭感觉缩放。

## 3. Qt6（QWidget/QML + qt_add_resources）

- **结构**：CMake `qt_add_executable` / `qt_add_qml_module`；分层同上；推荐 QML + `Theme` 单例（token 以 `pragma Singleton` + `readonly property color` 表达，最接近 CSS 变量）。
- **High-DPI**：Qt6 默认启用，无需 attribute；`QPixmap::devicePixelRatio` 已自动处理，素材仍导出 @1x/@2x（Qt6 也支持 @3x）。
- **图片/图标**：`qt_add_resources(app "assets" PREFIX "/" FILES images/... icons/...)`；SVG 图标用 `QSvgIconEngine`（`QIcon("qrc:/icons/x.svg")`）或 QML `Image`；**图标着色**用 `QIcon` + `QPalette` 或 SVG 动态替换 `currentColor`（与设计 token 联动）。
- **发光/阴影**：`MultiEffect`（Qt6.5+ QtQuick.Effects）或 `RectangularShadow`（Qt5Compat.GraphicalEffects）；widgets 路线同 Qt5。
- **示例（QML atom）**：

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

## 4. pixel-perfect 纪律（Qt 三版本共同）

1. **整数像素**：所有间距/尺寸取设计标注整数值；布局用固定尺寸 + Layout 间距常量，不写 12.5 这类值。
2. **坐标对齐**：QSS `padding`/`margin` 与设计解剖板逐项核对；1px 偏移即视为 bug。
3. **状态完备**：每个交互件实现 Default/Hover/Pressed/Focused/Disabled 五态，颜色逐一取自 DESIGN.md 变体键。
4. **字体**：家族/字重/字号/行高/字距与 F2 字阶一致；行高在 Qt 用 `QFontMetrics` + 手动 leading 或 QSS `line-height`（QSS 支持有限时用富文本/自绘）。
5. **截图验证**：每完成一层跑 verification.md 的 PIL 比对（DPR=1、禁动画、固定窗口尺寸 = **该档基准宽**：web 1440 / pad 834 / mobile 375）。
6. **资源零外链**：构建产物不依赖工作区相对路径图片；全部 qrc 编译进二进制。
7. **响应式 / 档位**：`targetProfiles` 含多档时，用 Qt 布局自适应（QHBoxLayout⇄QVBoxLayout 堆叠、QML 响应式）实现 pad/mobile 单列布局，触控目标 ≥44px；单一档位可固定该窗口宽。逐档分别截图与 Penpot 对应板比对。
