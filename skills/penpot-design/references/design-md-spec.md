# DESIGN.md spec quick reference (google-labs-code/design.md, version alpha)

> Source: https://github.com/google-labs-code/design.md (docs/spec.md + README.md).
> DESIGN.md is the design system's **plain-text single source of truth**: YAML frontmatter holds machine-readable design tokens, Markdown body holds human-readable design rationale.
> **tokens are the normative values (normative), prose only provides context** — when they conflict, tokens win.

## 1. File structure

```
---
<YAML frontmatter: design tokens>
---
<Markdown body: design rationale and guidance>
```

- frontmatter starts and ends with a **`---` on its own line** (normative).
- Body sections all use `##` (H2); optional `#` (H1) is only a title and is not parsed.
- Descriptive color names (e.g. "Midnight Forest Green") may map to system token names (e.g. `primary`).

## 2. Frontmatter Schema

```yaml
version:                # optional, currently "alpha"
name:
description:            # optional
omitted:                # optional, declares intentionally omitted sections
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

- `<level>` is a named level for size/spacing scale, commonly `xs / sm / md / lg / xl / full`, **any descriptive string key is legal**.
- Example:

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

## 3. Value types

### Color
Any valid CSS color string: `#RGB/#RGBA/#RRGGBB/#RRGGBBAA`, named colors, `rgb()/rgba()/hsl()/hsla()/hwb()`, `oklch()/oklab()/lch()/lab()`, `color-mix(in srgb, ...)`.
- Internally normalized to sRGB for WCAG contrast checking; the original format is kept for display/export.
- **Default recommended `#RRGGBB` hex**.

### Typography
| Property | Type | Notes |
|---|---|---|
| `fontFamily` | string | |
| `fontSize` | Dimension | |
| `fontWeight` | number | numeric weight, e.g. `400`/`700` |
| `lineHeight` | Dimension \| number | `24px`/`1.5rem` or unitless multiplier (recommended) |
| `letterSpacing` | Dimension | |
| `fontFeature` | string | maps to `font-feature-settings` |
| `fontVariation` | string | maps to `font-variation-settings` |

### Dimension
**A string with a unit suffix; only `px` / `em` / `rem` allowed**.

### `omitted`
An array of intentionally omitted sections, suppresses linter warnings. Each item is a string or `{section, reason?}`:

```yaml
omitted:
  - spacing
  - section: rounded
    reason: "No rounded corners defined in brand book"
```

### Token reference
- Must be written in **curly braces**, pointing to an object path in the YAML tree: `{colors.primary-60}`.
- In most token groups the reference **must point to a primitive value** (e.g. `colors.primary-60`), not a group (e.g. `colors`).
- **Exception**: inside `components`, referencing composite values is allowed (e.g. `{typography.label-md}`).

## 4. Body sections (normative order)

Sections that appear must be in this order (may be omitted, but not reordered):

1. **Overview** (alias "Brand & Style")
2. **Colors**
3. **Typography**
4. **Layout** (alias "Layout & Spacing")
5. **Elevation & Depth** (alias "Elevation")
6. **Shapes**
7. **Components**
8. **Do's and Don'ts**

### Section highlights
- **Overview**: brand personality, target users, UI emotional tone (playful/professional, dense/spacious) — the decision basis when rules don't cover something.
- **Colors**: **define at least the `primary` palette** (normative); naming convention `primary/secondary/tertiary/neutral`; body describes each palette's semantics, frontmatter gives exact values.
- **Typography**: most systems have **9–15 levels**; naming convention `headline/display/body/label/caption` further split into `small/medium/large`.
- **Layout**: grid/margins/dynamic padding strategy; frontmatter `spacing` is scale → Dimension or unitless number (column count/ratio).
- **Elevation & Depth**: shadow levels (spread/blur/color); flat designs must explain alternative layering (stroke, tone steps).
- **Shapes**: shape language; frontmatter `rounded` is level → dimension.
- **Components**: styling guidance for component atoms. Common: Buttons (primary/secondary/tertiary, sizing, padding, states), Chips, Lists, Tooltips, Checkboxes, Radio buttons, Input fields; domain extension encouraged.
  - Component attribute tokens: `backgroundColor` / `textColor` / `typography` / `rounded` / `padding` / `size` / `height` / `width`.
  - **Variants** are defined in separate related keys (`button-primary` / `button-primary-hover` / `button-primary-active`); the agent synthesizes all variants for styling decisions.
  - Example:

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

- **Do's and Don'ts**: design guardrails (e.g. "use primary color to drive only the single most important action per screen", "keep WCAG AA 4.5:1").

## 5. Recommended token naming (non-normative)

- colors: `primary`, `secondary`, `tertiary`, `neutral`, `surface`, `on-surface`, `error`
- typography: `headline-display`, `headline-lg`, `headline-md`, `body-lg`, `body-md`, `body-sm`, `label-lg`, `label-md`, `label-sm`
- rounded: `none`, `sm`, `md`, `lg`, `xl`, `full`

## 6. Unknown-content consumption behavior

| Scenario | Behavior |
|---|---|
| Unknown section title (e.g. `## Iconography`) | kept, no error |
| Unknown color token name | accepted if value is valid |
| Unknown typography token name | accepted |
| Unknown spacing value | accepted; invalid dimension stored as string |
| Unknown component attribute (e.g. `borderColor`) | accepted and warned |
| **Duplicate section title** | **error and file rejected** |

## 7. Normative rule checklist (lint basis)

1. frontmatter optional; only `##` sections parsed (`#` titles ignored).
2. frontmatter delimiter must be a `---` on its own line.
3. tokens are normative values, prose only context.
4. **`primary` palette must be defined**.
5. Section order: Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts.
6. dimension only `px` / `em` / `rem`.
7. Reference `{path.to.token}` must point to a primitive value (`components` may reference composite values).
8. Colors normalized to sRGB for WCAG check; `#RRGGBB` recommended.
9. `omitted` declaration suppresses missing-section warnings.
10. Duplicate section title → file rejected.

## 8. Toolchain (CLI)

```bash
# install / run directly
npm install @google/design.md
npx @google/design.md lint DESIGN.md            # Windows: npx -p @google/design.md designmd lint DESIGN.md

# lint —— structure validation, broken refs, WCAG contrast (AA ≥ 4.5:1); exit 1 = has error
npx @google/design.md lint --format json DESIGN.md
cat DESIGN.md | npx @google/design.md lint -

# diff —— token-level + prose regression comparison of two versions; exit 1 = regression detected
npx @google/design.md diff DESIGN.md DESIGN-v2.md

# export —— token export interoperability formats
npx @google/design.md export --format json-tailwind DESIGN.md > tailwind.theme.json   # Tailwind v3 theme.extend
npx @google/design.md export --format css-tailwind DESIGN.md > theme.css              # Tailwind v4 @theme CSS variables
npx @google/design.md export --format dtcg DESIGN.md > tokens.json                    # W3C Design Tokens

# spec —— output the spec itself (injectable into agent prompt)
npx @google/design.md spec [--rules] [--rules-only] [--format markdown|json]
```

- All commands accept a file path or `-` (stdin), default JSON output.
- `lint` covers 11 rules: `broken-ref`, `missing-primary`, `contrast-ratio`, `orphaned-tokens`, `token-summary`, `missing-sections`, `missing-typography`, `section-order`, `unknown-key`, `token-like-ignored`, `omitted-rules`.
- Programmatic: `import { lint } from '@google/design.md/linter'` → `{findings, summary, designSystem}`.
- When registry reports `ENOVERSIONS`: check `npm config get registry` (should be `https://registry.npmjs.org/`), then `npm cache clean --force`.

## 9. This skill's DESIGN.md skeleton template

```markdown
---
version: alpha
name: <system name>
description: <one-line positioning>
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
<brand personality / target users / emotional tone>

## Colors
<semantic description of each palette>

## Typography
<font-family division of labor and level roles>

## Layout
<grid model and spacing rhythm>

## Elevation & Depth
<layering means: shadow/glow/tone/stroke>

## Shapes
<radius and shape language>

## Components
<per component: variants, states, sizes, spacing, token references>

## Do's and Don'ts
- Do ...
- Don't ...
```
