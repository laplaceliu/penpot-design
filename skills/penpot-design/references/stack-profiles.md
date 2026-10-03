# 技术栈档位（Stack Profiles）

本技能支持任意 GUI 技术栈。Design → Code 开始前**必须**确认目标技术栈，防止 Agent 盲目猜测 / 默认 React。

## 1. 何时问

- **只在 Design → Code 前问**（Code → Design 不强制；可先出通用设计系统，出码时再定栈）。
- **铁律**：未确认 `targetStacks` 不得进入代码生成；**禁止默认 React/Web**；模棱两可就停住问，绝不推测出码。
- 用户已明说（"用 LVGL"）可免问，但仍写入 DESIGN.md `targetStacks`。

## 2. 平台族分类（决定怎么问、怎么分组选项）

| 平台族 | 代表技术 | 共性 |
|---|---|---|
| Web 前端 | React / Vue / Angular / Svelte / Web Components | CSS / Flex / 资源 import |
| 桌面原生·跨端 | Qt（QWidget·QML）/ MAUI(.NET) / Flutter / JavaFX / Electron·Tauri | 各自样式 + 资源系统 |
| 移动原生 | SwiftUI / Jetpack Compose（MAUI/Flutter 交叉） | 声明式 + 约束布局 |
| 嵌入式·MCU | LVGL / Embedded Wizard / TouchGFX / GUIX | 资源受限、无任意模糊/字体、位图 atlas |
| 立即模式 | Dear ImGui / Nuklear | 每帧重画、draw call、无 DOM |
| 游戏引擎 UI | Unity UGUI·UI Toolkit / Unreal Slate / Cocos | 画布 + 锚点 / 控件树 |

## 3. 运行时询问（技能行为）

进入 design→code 时调用 `ask_followup_question`：

- **两级**：第一问平台族，第二问具体框架（是否多栈用 multiSelect）；末项恒留「其他 / 我来说明」自由输入。
- 结果写入 DESIGN.md `targetStacks`，作为后续硬约束。
- 选项内容见 `references/stacks/manifest.md` 末尾。

## 4. 对产物的约束

- 代码按所选栈实现（读对应适配器）；验收 viewport/窗口 = 该档基准宽（含栈特定截图手段，见 `verification.md` 与各适配器）。
- `targetStacks` 含多栈时分别产出与比对。

## 5. 未知栈处理

用户给出未登记栈（manifest 中「待补」或完全未知）：

1. 按本文（generic）纪律 + 向用户问清关键约束出码：**布局模型 / 样式机制 / 资源系统 / 语言 / 验收手段**。
2. 顺手生成草稿适配器 `references/stacks/<key>.md`（套 §6 模板）。
3. 回写 `manifest.md` 一行（去掉「待补」标记）。

## 6. 适配器模板（新增栈 = 填空）

统一字段：范式 / 平台与语言 / 布局模型 / 样式机制 / 资源系统 / 状态模型 / High-DPI / 验收手段 / token 映射 / 已知坑。
参考现有 `stacks/qt.md`、`stacks/web.md`（它们也是模板范本）。
