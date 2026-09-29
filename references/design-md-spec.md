# DESIGN.md 规范速查（google-labs-code/design.md, version alpha）

> 来源：https://github.com/google-labs-code/design.md （docs/spec.md + README.md）。
> DESIGN.md 是设计系统的**纯文本单一事实源**：YAML frontmatter 存机器可读 design tokens，Markdown 正文存人类可读的设计依据。
> **tokens 是规范性数值（normative），prose 仅提供上下文**——两者冲突时以 tokens 为准。

## 1. 文件结构

```
---
<YAML frontmatter：design tokens>
---
<Markdown 正文：设计依据与指导>
```

- frontmatter 以**独占一行的 `---`** 开始、以**独占一行的 `---`** 结束（normative）。
- 正文章节一律用 `##`（H2）；可选的 `#`（H1）仅作标题，不参与解析。
- 可用描述性色名（如 "Midnight Forest Green"）对应系统 token 名（如 `primary`）。

## 2. Frontmatter Schema

```yaml
version:                # 可选，当前 "alpha"
name:
description:            # 可选
omitted:                # 可选，声明有意省略的章节
colors:
  <color-name>: <color>
typography:
  <type-name>: <typography>
rounded:
  <level>: <dimension>
spacing:
  <level>: <dimension | number>
components:
  <component-name>: <component>
```

- `<level>` 为尺寸/间距刻度命名级别，常用 `xs / sm / md / lg / xl / full`，**任意描述性字符串键均合法**。
- 示例：

```yaml
---
version: alpha
name: Daylight Prestige
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
---
```

## 3. 值类型

### Color
任意合法 CSS 颜色串：`#RGB/#RGBA/#RRGGBB/#RRGGBBAA`、具名色、`rgb()/rgba()/hsl()/hsla()/hwb()`、`oklch()/oklab()/lch()/lab()`、`color-mix(in srgb, ...)`。
- 内部统一转 sRGB 做 WCAG 对比度检查；原始格式保留用于显示/导出。
- **推荐默认 `#RRGGBB` 十六进制**。

### Typography
| 属性 | 类型 | 说明 |
|---|---|---|
| `fontFamily` | string | |
| `fontSize` | Dimension | |
| `fontWeight` | number | 数值字重，如 `400`/`700` |
| `lineHeight` | Dimension \| number | `24px`/`1.5rem` 或无单位倍数（推荐） |
| `letterSpacing` | Dimension | |
| `fontFeature` | string | 对应 `font-feature-settings` |
| `fontVariation` | string | 对应 `font-variation-settings` |

### Dimension
**带单位后缀的字符串，仅允许 `px` / `em` / `rem`**。

### `omitted`
有意省略的章节数组，抑制 linter 告警。每项为字符串或 `{section, reason?}`：

```yaml
omitted:
  - spacing
  - section: rounded
    reason: "No rounded corners defined in brand book"
```

### Token 引用
- 必须写在**花括号**内，指向 YAML 树中的对象路径：`{colors.primary-60}`。
- 大多数 token 组中引用**必须指向原始值**（如 `colors.primary-60`），不能指向组（如 `colors`）。
- **例外**：`components` 内允许引用复合值（如 `{typography.label-md}`）。

## 4. 正文章节（normative 顺序）

出现的章节必须按此顺序（可省略，不可乱序）：

1. **Overview**（别名 "Brand & Style"）
2. **Colors**
3. **Typography**
4. **Layout**（别名 "Layout & Spacing"）
5. **Elevation & Depth**（别名 "Elevation"）
6. **Shapes**
7. **Components**
8. **Do's and Don'ts**

### 各节要点
- **Overview**：品牌个性、目标用户、UI 情绪基调（playful/professional、dense/spacious）——规则未覆盖时的决策依据。
- **Colors**：**至少定义 `primary` 色板**（normative）；命名惯例 `primary/secondary/tertiary/neutral`；正文描述各色板语义，frontmatter 给出精确值。
- **Typography**：多数系统 **9–15 级**；命名惯例 `headline/display/body/label/caption` 可再分 `small/medium/large`。
- **Layout**：栅格/边距/动态 padding 策略；frontmatter `spacing` 为 刻度 → Dimension 或无单位数字（列数/比率）。
- **Elevation & Depth**：阴影层级（spread/blur/color）；扁平设计需说明替代层级手段（描边、色阶）。
- **Shapes**：形状语言；frontmatter `rounded` 为 级别 → dimension。
- **Components**：组件原子的样式指导。常见：Buttons（primary/secondary/tertiary、sizing、padding、states）、Chips、Lists、Tooltips、Checkboxes、Radio buttons、Input fields；鼓励按领域扩展。
  - 组件属性 token：`backgroundColor` / `textColor` / `typography` / `rounded` / `padding` / `size` / `height` / `width`。
  - **变体**用相关键分列定义（`button-primary` / `button-primary-hover` / `button-primary-active`），agent 会综合全部变体做样式决策。
  - 示例：

```yaml
components:
  button-primary:
    backgroundColor: "{colors.primary-60}"
    textColor: "{colors.primary-20}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-70}"
```
- **Do's and Don'ts**：设计护栏（如 "每个屏幕只用 primary 色驱动单一最重要操作"、"保持 WCAG AA 4.5:1"）。

## 5. 推荐 token 命名（非规范性）

- colors：`primary`, `secondary`, `tertiary`, `neutral`, `surface`, `on-surface`, `error`
- typography：`headline-display`, `headline-lg`, `headline-md`, `body-lg`, `body-md`, `body-sm`, `label-lg`, `label-md`, `label-sm`
- rounded：`none`, `sm`, `md`, `lg`, `xl`, `full`

## 6. 未知内容的消费行为

| 场景 | 行为 |
|---|---|
| 未知章节标题（如 `## Iconography`） | 保留，不报错 |
| 未知颜色 token 名 | 值合法即接受 |
| 未知 typography token 名 | 接受 |
| 未知 spacing 值 | 接受；非法 dimension 按字符串存储 |
| 未知组件属性（如 `borderColor`） | 接受并告警 |
| **重复章节标题** | **报错并拒绝文件** |

## 7. 规范性规则清单（lint 依据）

1. frontmatter 可选；正文仅 `##` 章节参与解析（`#` 标题忽略）。
2. frontmatter 分隔符必须是独占一行的 `---`。
3. tokens 为规范值，prose 仅为上下文。
4. **必须定义 `primary` 色板**。
5. 章节顺序：Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts。
6. dimension 仅 `px` / `em` / `rem`。
7. 引用 `{path.to.token}` 须指向原始值（`components` 内可引复合值）。
8. 颜色归一 sRGB 做 WCAG 检查；推荐 `#RRGGBB`。
9. `omitted` 声明可抑制缺节告警。
10. 重复章节标题 → 文件被拒绝。

## 8. 工具链（CLI）

```bash
# 安装 / 直接运行
npm install @google/design.md
npx @google/design.md lint DESIGN.md            # Windows: npx -p @google/design.md designmd lint DESIGN.md

# lint —— 结构校验、断引用、WCAG 对比度（AA ≥ 4.5:1）；exit 1 = 有 error
npx @google/design.md lint --format json DESIGN.md
cat DESIGN.md | npx @google/design.md lint -

# diff —— 两个版本的 token 级 + prose 回归比较；exit 1 = 检测到回归
npx @google/design.md diff DESIGN.md DESIGN-v2.md

# export —— token 导出互操作格式
npx @google/design.md export --format json-tailwind DESIGN.md > tailwind.theme.json   # Tailwind v3 theme.extend
npx @google/design.md export --format css-tailwind DESIGN.md > theme.css              # Tailwind v4 @theme CSS 变量
npx @google/design.md export --format dtcg DESIGN.md > tokens.json                    # W3C Design Tokens

# spec —— 输出规范本体（可注入 agent prompt）
npx @google/design.md spec [--rules] [--rules-only] [--format markdown|json]
```

- 所有命令接受文件路径或 `-`（stdin），默认 JSON 输出。
- `lint` 覆盖 11 条规则：`broken-ref`, `missing-primary`, `contrast-ratio`, `orphaned-tokens`, `token-summary`, `missing-sections`, `missing-typography`, `section-order`, `unknown-key`, `token-like-ignored`, `omitted-rules`。
- 编程接口：`import { lint } from '@google/design.md/linter'` → `{findings, summary, designSystem}`。
- registry 报 `ENOVERSIONS` 时：检查 `npm config get registry`（应为 `https://registry.npmjs.org/`），然后 `npm cache clean --force`。

## 9. 本技能的 DESIGN.md 骨架模板

```markdown
---
version: alpha
name: <系统名>
description: <一句话定位>
colors:
  primary: "#......"
  secondary: "#......"
  neutral: "#......"
  surface: "#......"
  on-surface: "#......"
  error: "#......"
typography:
  headline-lg: { fontFamily: ..., fontSize: 32px, fontWeight: 600, lineHeight: 1.2 }
  body-md:     { fontFamily: ..., fontSize: 16px, fontWeight: 400, lineHeight: 1.6 }
  label-sm:    { fontFamily: ..., fontSize: 12px, fontWeight: 500, lineHeight: 1 }
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 32px
  xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-70}"
---

## Overview
<品牌个性 / 目标用户 / 情绪基调>

## Colors
<各色板语义描述>

## Typography
<字族分工与层级角色>

## Layout
<栅格模型与间距节奏>

## Elevation & Depth
<层级手段：阴影/发光/色阶/描边>

## Shapes
<圆角与形状语言>

## Components
<逐组件：变体、状态、尺寸、间距、token 引用>

## Do's and Don'ts
- Do ...
- Don't ...
```
