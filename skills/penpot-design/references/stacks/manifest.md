# Tech-stack adapter registry (manifest)

One adapter doc per supported stack (`references/stacks/<key>.md`), following a unified template (see `references/stack-profiles.md` §6).
SKILL.md workflow 2 looks up the doc here by DESIGN.md `targetStacks`; unknown-stack handling is in `stack-profiles.md` §5.

| key | Aliases / frameworks | Platform family | Paradigm | Adapter doc |
|---|---|---|---|---|
| `qt` | Qt4 / Qt5 / Qt6 (QWidget·QML) | Desktop native / cross-platform | retained canvas | `stacks/qt.md` |
| `web` | React / Vue / Angular / Svelte / Web Components | Web frontend | retained DOM | `stacks/web.md` |
| `lvgl` | LVGL | Embedded / MCU | retained canvas | `stacks/lvgl.md` |
| `imgui` | Dear ImGui / Nuklear | Immediate mode | immediate | `stacks/imgui.md` |
| `maui` | .NET MAUI | Desktop / mobile cross-platform | retained XAML | `stacks/maui.md` |
| `flutter` | Flutter | Cross-platform | retained canvas | `stacks/flutter.md` |
| `swiftui` | SwiftUI | Mobile native (iOS) | declared constraint | `stacks/swiftui.md` |
| `compose` | Jetpack Compose | Mobile native (Android) | declared constraint | `stacks/compose.md` |

> All planned stacks already have completed adapters; when the user picks an unlisted stack, handle it per `stack-profiles.md` §5 (generic + ask-constraints codegen + produce a draft adapter).

## Prompt options (for the two-level prompt in stack-profiles.md)

- Platform family: Web frontend / Desktop native·cross-platform / Mobile native / Embedded·MCU / Immediate mode / Game-engine UI / Other
- Framework (expanded per family, last item always "Other / I'll specify" free input)
