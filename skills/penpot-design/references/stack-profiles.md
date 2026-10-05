# Stack Profiles

This skill supports any GUI tech stack. Before Design → Code starts, the target tech stack **must** be confirmed, to prevent the Agent from blindly guessing / defaulting to React.

## 1. When to ask

- **Only ask before Design → Code** (Code → Design is not mandatory; you may emit a generic design system first and pick the stack at codegen time).
- **Hard rule**: do not enter code generation without a confirmed `targetStacks`; **defaulting to React/Web is forbidden**; if ambiguous, stop and ask, never speculate codegen.
- If the user has already stated it ("use LVGL"), skip the question but still write DESIGN.md `targetStacks`.

## 2. Platform-family classification (decides how to ask, how to group options)

| Platform family | Representative tech | Common trait |
|---|---|---|
| Web frontend | React / Vue / Angular / Svelte / Web Components | CSS / Flex / asset import |
| Desktop native·cross-platform | Qt (QWidget·QML) / MAUI (.NET) / Flutter / JavaFX / Electron·Tauri | own styling + asset system |
| Mobile native | SwiftUI / Jetpack Compose (MAUI/Flutter crossing) | declarative + constraint layout |
| Embedded·MCU | LVGL / Embedded Wizard / TouchGFX / GUIX | resource-constrained, no arbitrary blur/font, bitmap atlas |
| Immediate mode | Dear ImGui / Nuklear | redraw per frame, draw call, no DOM |
| Game-engine UI | Unity UGUI·UI Toolkit / Unreal Slate / Cocos | canvas + anchors / control tree |

## 3. Runtime prompt (skill behavior)

When entering design→code, call `ask_followup_question`:

- **Two levels**: first ask platform family, then ask the specific framework (use multiSelect for multiple stacks); the last item always leaves "Other / I'll specify" free input.
- Result written into DESIGN.md `targetStacks`, as a subsequent hard constraint.
- Option content at the end of `references/stacks/manifest.md`.

## 4. Constraints on artifacts

- Code implemented per the selected stack (read the corresponding adapter); acceptance viewport/window = that tier's baseline width (including stack-specific screenshot means, see `verification.md` and each adapter).
- When `targetStacks` contains multiple stacks, produce and compare separately.

## 5. Unknown-stack handling

The user gives an unregistered stack ("TBD" in the manifest, or completely unknown):

1. Per this article (generic) discipline + ask the user for key constraints to codegen: **layout model / styling mechanism / asset system / language / acceptance means**.
2. Conveniently generate a draft adapter `references/stacks/<key>.md` (fill the §6 template).
3. Write back one line to `manifest.md` (remove the "TBD" marker).

## 6. Adapter template (new stack = fill in the blanks)

Unified fields: paradigm / platform & language / layout model / styling mechanism / asset system / state model / High-DPI / acceptance means / token mapping / known pitfalls.
Refer to the existing `stacks/qt.md`, `stacks/web.md` (they are also template exemplars).
