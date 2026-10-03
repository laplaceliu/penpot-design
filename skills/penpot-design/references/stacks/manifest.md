# 技术栈适配器注册表（manifest）

每个支持的栈一份适配器文档（`references/stacks/<key>.md`），遵循统一模板（见 `references/stack-profiles.md` §6）。
SKILL.md 工作流 2 据 DESIGN.md `targetStacks` 在此查表选文档；未知栈处理见 `stack-profiles.md` §5。

| key | 别名 / 框架 | 平台族 | 范式 | 适配器文档 |
|---|---|---|---|---|
| `qt` | Qt4 / Qt5 / Qt6（QWidget·QML） | 桌面原生 / 跨端 | retained canvas | `stacks/qt.md` |
| `web` | React / Vue / Angular / Svelte / Web Components | Web 前端 | retained DOM | `stacks/web.md` |
| `lvgl` | LVGL | 嵌入式 / MCU | retained canvas | `stacks/lvgl.md`（待补） |
| `imgui` | Dear ImGui / Nuklear | 立即模式 | immediate | `stacks/imgui.md`（待补） |
| `maui` | .NET MAUI | 桌面 / 移动跨端 | retained XAML | `stacks/maui.md`（待补） |
| `flutter` | Flutter | 跨端 | retained canvas | `stacks/flutter.md`（待补） |
| `swiftui` | SwiftUI | 移动原生（iOS） | declared constraint | `stacks/swiftui.md`（待补） |
| `compose` | Jetpack Compose | 移动原生（Android） | declared constraint | `stacks/compose.md`（待补） |

> 「待补」项表示已规划但尚未写适配器；用户选定后按模板补上（或先用 generic + 问约束出码并生成草稿）。

## 询问选项（供 stack-profiles.md 两级询问）

- 平台族：Web 前端 / 桌面原生·跨端 / 移动原生 / 嵌入式·MCU / 立即模式 / 游戏引擎 UI / 其他
- 框架（按族展开，末项恒为「其他 / 我来说明」自由输入）
