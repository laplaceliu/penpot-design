# 适配器：LVGL（Light and Versatile Graphics Library）

通用纪律见 `references/design-to-code-generic.md`（token 只引变量、分层、资源零外链、五态、整数像素、验收流程）。
本文件只写 LVGL 特有部分；总原则与视口档位约束同 generic §0。面向嵌入式 / MCU，资源受限。

## 1. 概况（范式 / 平台与语言 / 布局模型 / 样式机制）

- **范式**：retained canvas（对象树 `lv_obj_t`，每帧由 `lv_refr` 重绘，但对象持久）。
- **平台与语言**：C（也支持 C++ / MicroPython）；跑在 MCU / RTOS / 无 OS 环境，显示驱动 + 帧缓冲。
- **布局模型**：Flex（`lv_obj_set_flex_flow` / `flex_align`）、Grid（`lv_obj_set_grid` + `grid_cell`）、以及绝对定位（`lv_obj_align` / 直接设 x/y）。无 CSS 盒模型。
- **样式机制**：`lv_style_t` 状态样式（不是 CSS）；用 `lv_obj_add_state` + 样式选择器（`LV_STATE_DEFAULT/HOVER/PRESSED/FOCUSED/DISABLED`、`LV_PART_MAIN/...`），通过 `lv_obj_add_style(obj, &style, state|part)` 挂载。无模糊/阴影（仅简单 `shadow_*` 偏移，无高斯模糊）；渐变受限。

## 2. Token 映射

- DESIGN.md tokens → **C 常量头文件**（如 `design_tokens.h`：`#define COLOR_PRIMARY lv_color_hex(0x1A1C1E)`、`#define RADIUS_MD 8`、`#define PAD_BTN_X 16`）。
- 颜色：`lv_color_hex()` / `lv_color_make()`；圆角：`style.radius`；间距：`style.pad_*` / `gap`；字阶：`lv_style_set_text_font(obj, &font_16)`。
- **禁止散落魔法数字**：组件创建函数统一从 tokens 头文件取。

## 3. 资源系统

- **图片**：用 LVGL 图像转换工具（online / `lv_img_conv`）把 PNG 转成 **C 数组**（`LV_IMG_CF_TRUE_COLOR_ALPHA` 等），编译进固件；代码用 `lv_img_set_src(obj, &img_logo)`。无运行时文件读取。
- **导出尺寸 = 标注 × 倍率**：嵌入式屏通常 1x（屏物理像素即设计像素），高分屏按 `LV_SCALE` / `lv_disp_set_zoom` 处理；勿在代码缩放。
- **字体**：LVGL **没有系统字体**，必须用字体转换工具把 TTF 转成 C（`lv_font_*`），并按需纳入 **CJK 字形区间**（否则中文缺字）。纯色块/圆角/阴影用 `lv_style` 绘制，不导位图。

## 4. 状态模型

- 五态映射：`LV_STATE_DEFAULT`(Default) / `HOVER`(Hover) / `PRESSED`(Pressed) / `FOCUSED`(Focused) / `DISABLED`(Disabled)；颜色逐一取自 DESIGN.md 变体键，写成对应 state 的 `lv_style_t`。

## 5. High-DPI

- `LV_DPI_DEF` 设基准 DPI；高分辨率屏用 `lv_disp_set_zoom()` 或 `LV_SCALE`；布局用 `lv_pct()` / `LV_SIZE_CONTENT` 自适应，不写死像素。

## 6. 验收手段

- 首选 **LVGL 模拟器（SDL/PC 端口）** 跑同一套 UI，逐层 `lv_refr_now(disp)` 后把帧缓冲（`driver->flush_cb` 输出的 buf）存 PNG。
- 或用显示驱动 `flush_cb` 把整帧 dump 为位图；再用 `references/verification.md` + `scripts/pixel_diff.py` 比对（DPR=1、禁动画、窗口 = 该档基准宽：pad 834 / mobile 375）。
- 组件层达标后再对 14 页各档屏幕板整页比对。

## 7. 已知坑

- **无系统字体 / 无任意模糊**：字体必须预转换并含 CJK 区间；阴影只用 `shadow_*` 简单偏移，复杂发光换预渲染 PNG 或不做。
- **RAM 受限**：大图 / 大字体区段极耗内存，按屏分辨率谨慎选 `LV_MEM_SIZE` 与 `LV_COLOR_DEPTH`（16/32bit）。
- **无子像素抗锯齿**、对象层级影响裁剪；`lv_obj` 父子坐标与对齐规则必须吃透，避免散架。

## 8. pixel-perfect 纪律（LVGL 特有）

1. **整数像素**：所有 spacing/size 取设计整数值；布局用 `pad_*` / `gap` 常量，不写 12.5。
2. **坐标对齐**：`lv_obj_align` / flex `gap` 与解剖板逐项核对；1px 偏移即 bug。
3. **状态完备**：五态 `lv_style` 逐一实现，颜色取自 DESIGN.md 变体键。
4. **字体**：转换字体字重/字号/行高与设计 F2 一致；CJK 区间齐全，禁缺字。
5. **截图验证**：模拟器 flush 存 PNG，窗口 = 该档基准宽（pad 834 / mobile 375），DPR=1。
6. **资源零外链**：图片/字体全编译进固件，代码只引用 C 符号，不依赖文件系统。
7. **响应式 / 档位**：`targetProfiles` 多档时用 flex/grid 重排实现 pad/mobile 单列，触控 ≥44px；逐档截图比对。
