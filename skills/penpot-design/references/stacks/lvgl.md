# Adapter: LVGL (Light and Versatile Graphics Library)

The generic discipline is in `references/design-to-code-generic.md` (tokens only reference variables, layering, zero external asset links, five states, integer pixels, acceptance flow).
This file covers only LVGL-specific parts; the general principles and viewport-tier constraints are the same as generic §0. Targets embedded / MCU, resource-constrained.

## 1. Overview (paradigm / platform & language / layout model / styling mechanism)

- **Paradigm**: retained canvas (object tree `lv_obj_t`, redrawn each frame by `lv_refr`, but objects persist).
- **Platform & language**: C (also C++ / MicroPython); runs on MCU / RTOS / no-OS environments, with display driver + framebuffer.
- **Layout model**: Flex (`lv_obj_set_flex_flow` / `flex_align`), Grid (`lv_obj_set_grid` + `grid_cell`), and absolute positioning (`lv_obj_align` / directly set x/y). No CSS box model.
- **Styling mechanism**: `lv_style_t` state styles (not CSS); use `lv_obj_add_state` + style selectors (`LV_STATE_DEFAULT/HOVER/PRESSED/FOCUSED/DISABLED`, `LV_PART_MAIN/...`), mounted via `lv_obj_add_style(obj, &style, state|part)`. No blur/shadow (only simple `shadow_*` offset, no Gaussian blur); gradients limited.

## 2. Token mapping

- DESIGN.md tokens → **C constant header file** (e.g. `design_tokens.h`: `#define COLOR_PRIMARY lv_color_hex(0x1A1C1E)`, `#define RADIUS_MD 8`, `#define PAD_BTN_X 16`).
- Colors: `lv_color_hex()` / `lv_color_make()`; radius: `style.radius`; spacing: `style.pad_*` / `gap`; type scale: `lv_style_set_text_font(obj, &font_16)`.
- **No scattered magic numbers**: component creation functions uniformly pull from the tokens header.

## 3. Asset system

- **Images**: use the LVGL image conversion tool (online / `lv_img_conv`) to convert PNG into a **C array** (`LV_IMG_CF_TRUE_COLOR_ALPHA` etc.), compiled into firmware; code uses `lv_img_set_src(obj, &img_logo)`. No runtime file reads.
- **Export size = annotation × multiplier**: embedded screens are usually 1x (screen physical pixels = design pixels); HiDPI handled via `LV_SCALE` / `lv_disp_set_zoom`; do not scale in code.
- **Fonts**: LVGL **has no system fonts**; you must use the font conversion tool to convert TTF into C (`lv_font_*`), and include the **CJK glyph ranges** as needed (otherwise Chinese characters are missing). Solid blocks/radii/shadows drawn with `lv_style`, no exported bitmaps.

## 4. State model

- Five states map: `LV_STATE_DEFAULT`(Default) / `HOVER`(Hover) / `PRESSED`(Pressed) / `FOCUSED`(Focused) / `DISABLED`(Disabled); colors taken one-by-one from DESIGN.md variant keys, written as the corresponding state's `lv_style_t`.

## 5. High-DPI

- `LV_DPI_DEF` sets the baseline DPI; high-resolution screens use `lv_disp_set_zoom()` or `LV_SCALE`; layout uses `lv_pct()` / `LV_SIZE_CONTENT` to adapt, no hardcoded pixels.

## 6. Acceptance means

- Preferred: run the same UI in the **LVGL simulator (SDL/PC port)**, layer by layer call `lv_refr_now(disp)` then save the framebuffer (`driver->flush_cb`'s output buf) as PNG.
- Or use the display driver `flush_cb` to dump the whole frame as a bitmap; then compare with `references/verification.md` + `scripts/pixel_diff.py` (DPR=1, animations off, window = that tier's baseline width: pad 834 / mobile 375).
- After the component layer passes, do a whole-page comparison of each tier's screen board on page 14.

## 7. Known pitfalls

- **No system fonts / no arbitrary blur**: fonts must be pre-converted and include CJK ranges; shadows use only simple `shadow_*` offset, complex glow either uses a pre-rendered PNG or is skipped.
- **RAM constrained**: large images / large font ranges consume a lot of memory; carefully choose `LV_MEM_SIZE` and `LV_COLOR_DEPTH` (16/32bit) per screen resolution.
- **No subpixel anti-aliasing**, object hierarchy affects clipping; you must thoroughly understand `lv_obj` parent-child coordinates and alignment rules to avoid breaking apart.

## 8. pixel-perfect discipline (LVGL-specific)

1. **Integer pixels**: all spacing/size take integer design values; layout uses `pad_*` / `gap` constants, never 12.5.
2. **Coordinate alignment**: `lv_obj_align` / flex `gap` checked item-by-item against the anatomy board; a 1px offset is a bug.
3. **State completeness**: implement the five-state `lv_style` one-by-one, colors from DESIGN.md variant keys.
4. **Font**: converted font weight/size/line-height consistent with design F2; complete CJK ranges, no missing glyphs.
5. **Screenshot verification**: simulator flush saves PNG, window = that tier's baseline width (pad 834 / mobile 375), DPR=1.
6. **Zero external asset links**: images/fonts all compiled into firmware, code only references C symbols, no filesystem dependence.
7. **Responsive / tiers**: when `targetProfiles` has multiple tiers, use flex/grid to reflow into pad/mobile single-column, touch ≥44px; screenshot each tier and compare.
