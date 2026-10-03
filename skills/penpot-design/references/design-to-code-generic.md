# Design → Code：通用纪律（所有技术栈共用基线）

所有栈的出码都先遵守本文，再据 DESIGN.md `targetStacks` 从 `references/stacks/manifest.md`
选对应适配器补差异。原 Qt / Web 两份指南的共性已抽到此处；适配器只写该栈特有部分。

## 0. 双档位约束（开工前必读）

- **视口档位 `targetProfiles`**：见 `references/viewport-profiles.md`；验收 viewport/窗口宽 = 该档基准宽，逐档比对。
- **技术栈档位 `targetStacks`**：见 `references/stack-profiles.md`；**未确认不得进入代码生成，禁止默认 React/Web**。
- 两者正交：一个设计系统可同时面向 (stack, profile) 组合，例如 web+React 与 mobile+Flutter。

## 1. 分层实现组织（行业惯例，所有栈相同）

token 层 → atoms（Button/Input…）→ molecules（SearchBox/FormField…）→ organisms（TopNav/DataTable…）→ pages（对齐 14 页 Demo **各所选档位屏幕板**）。

- 组件名与 Penpot 一一对应（`Button·Primary` → `ButtonPrimary` / `Button variant="primary"`）；每组件单文件/单目录 + 同名样式 + 状态预览。
- 类名/文件名映射表见 13 组件索引页。

## 2. Token 层（禁止散落魔法值）

- DESIGN.md tokens 是唯一真源；组件样式/常量只引用**导出的变量**（CSS 变量 / QSS 变量 / 常量头文件 / 主题单例…按栈而定），**禁止在组件里写死 hex/px 魔法数字**。
- 导出手段见各栈适配器（`design.md export` / dtcg / 手写常量头文件）。

## 3. 资源引用总则

- **资源零外链**：所有图片/图标进该栈的资源系统（bundler import / `.qrc` / atlas / 二进制编译），代码只引用资源路径，不依赖运行时相对路径。
- **导出尺寸 = 设计标注尺寸 × 倍率**（@1x/@2x/@3x），从 Penpot `export_shape` 导出；禁止在代码里缩放大图。
- 纯色块/圆角/阴影优先用代码绘制（不导出位图），放大后才不糊。
- 图标命名与 01 设计基础页 **F6 图标板**一致；图标按钮 = 标注图标尺寸 + padding，居中误差 ≤1px。

## 4. 状态完备

每个交互件实现 **Default / Hover / Pressed / Focused / Disabled** 五态（展示件 Default/Disabled），颜色逐一取自 DESIGN.md 变体键。

## 5. 字体

自托管同设计字族；字重/字号/行高/字距逐项对齐 F2 字阶；禁用合成粗体。

## 6. 整数像素与盒模型

所有间距/尺寸取设计整数标注；盒模型（如 `border-box`）与 Penpot `strokeAlignment='inner'` 对应；1px 偏移即视为 bug。

## 7. pixel-perfect 验收（逐层）

每层落地即跑 `references/verification.md` 的 PIL 比对：DPR=1、禁动画、固定 viewport/窗口 = 该档基准宽；组件层达标后再对 14 页**各档屏幕板**整页比对（阈值 0.5%）。
循环：导基准图 → 截图 → 比对 → 按热图定位（位置/颜色/字体/图标/资源）→ 修复 → 再比对。

## 8. 选适配器

`targetStacks` 命中 `references/stacks/manifest.md` 中已登记栈 → 读对应 `stacks/<key>.md`；
未命中 → 按本文 + 向用户问清关键约束出码，并生成草稿适配器（见 `stack-profiles.md` §5）。
