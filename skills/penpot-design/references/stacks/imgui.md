# Adapter: Dear ImGui (immediate-mode GUI)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only ImGui-specific parts; the general principles and viewport-tier constraints are the same as generic §0. Suited to tools / HUD / debug panels / in-engine UI.

## 1. Overview (paradigm / platform & language / layout model / styling mechanism)

- **Paradigm**: immediate mode — each frame re-invokes the widget code to generate drawing, no persistent object tree (state lives on your application side).
- **Platform & language**: C++ (with bindings for various languages); any backend (SDL / GLFW + OpenGL / Vulkan / DirectX / Metal).
- **Layout model**: immediate-mode streaming layout — `Begin/End` windows, `SameLine`, `Columns`, `SetNextWindowPos/Size`, `Indent`, content-area constraints; **no flexbox / no CSS reflow**, order is layout.
- **Styling mechanism**: `ImGuiStyle` struct (`Style.Colors[ImGuiCol_*]`, `FrameRounding`, `FramePadding`, `ItemSpacing`, etc.), `PushStyleVar` / `PushStyleColor` for temporary overrides; custom drawing via `ImDrawList` (`AddRect`, `AddText`). No CSS.

## 2. Token mapping

- DESIGN.md tokens → **C++ constants / theme struct** (e.g. `const ImVec4 kPrimary = ImGui::ColorConvertHexToFloat4("1A1C1E");`, `const float kRadiusMd = 8.f;`, `const ImVec2 kPadBtn = {16,8};`).
- Colors: `Style.Colors[ImGuiCol_Button/ButtonHovered/ButtonActive/Text/...]`; radius: `Style.FrameRounding` / `GrabRounding`; spacing: `Style.ItemSpacing` / `FramePadding`.
- **No scattered magic numbers**: centralized into a theme-init function that uniformly sets `ImGui::GetStyle()`.

## 3. Asset system

- **Images**: backend loads textures (e.g. `stb_image` → GL texture id), drawn with `Image(user_texture_id, size)`; you manage the texture lifecycle, ImGui provides no asset pipeline.
- **Export size = annotation × multiplier**: icons/images pre-generated at target resolution; solid blocks/radii/shadows drawn with `ImDrawList` or `AddImageRounded`, no exported bitmaps.
- **Fonts**: `ImFontAtlas::AddFontFromFileTTF` loads; CJK needs explicit glyph-range inclusion (`AddFontFromFileTTF(..., glyph_ranges_cjk)`), otherwise Chinese characters are missing.

## 4. State model

- ImGui itself has no persistent component state; **five states = your application state + immediate query**: Hover via `IsItemHovered()`, Active/Pressed via `IsItemActive()`/`IsMouseDown`, Focused via `IsItemFocused()`, Disabled via `BeginDisabled()`. Colors switch per these states during each frame's drawing, taken from DESIGN.md variant keys.

## 5. High-DPI

- `io.DisplaySize` + `io.DisplayFramebufferScale`; font scaling via `io.FontGlobalScale` or loading @2x fonts; the backend handles actual DPR.

## 6. Acceptance means

- After rendering to the framebuffer, save PNG (backend screenshot / `glReadPixels` / software-render dump); then compare with `references/verification.md` + `scripts/pixel_diff.py` (DPR=1, animations off, window = that tier's baseline width).
- Immediate mode needs a fixed frame (frozen at the same interaction state) before screenshotting, to avoid the picture jumping with input.

## 7. Known pitfalls

- **No persistent widget tree / no auto reflow**: layout entirely depends on call order and `SameLine/Columns`; complex forms easily misalign; wrap into reusable "component functions" to keep consistency.
- **Not suited to full app skins**: ImGui targets tools/debug/HUD; product-grade multi-page UI needs self-abstracted layout and state.
- **CJK and text width**: must load a font that includes CJK glyph ranges; `CalcTextSize` for manual alignment.
- Draw order determined by **call order** (later calls on top), mind the z-order.

## 8. pixel-perfect discipline (ImGui-specific)

1. **Integer pixels**: `ItemSpacing` / `FramePadding` / size take integer design values; never 12.5.
2. **Coordinate alignment**: `SetNextWindowPos/Size`, `SameLine` offset checked against the anatomy board; a 1px offset is a bug.
3. **State completeness**: each frame switches draw color by Hover/Active/Focused/Disabled, taken one-by-one from DESIGN.md variant keys.
4. **Font**: loaded font weight/size/line-height consistent with F2; complete CJK ranges.
5. **Screenshot verification**: after fixing the frame, dump PNG, window = that tier's baseline width, DPR=1.
6. **Zero external asset links**: textures/fonts are loaded by you and managed in memory, no runtime relative-path file dependence.
7. **Responsive / tiers**: when `targetProfiles` has multiple tiers, use `SetNextWindowSizeConstraints` + reflow to implement pad/mobile single-column, touch ≥44px; screenshot each tier and compare.
