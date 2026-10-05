# Penpot design-system fixed structure (the output contract defined by this skill)

Every code-to-design task **must** produce the same fixed structure: one Penpot file = 16 numbered pages; one root board per page; uniform component spec-board structure. Relationship with DESIGN.md: DESIGN.md is the **single source of truth** for tokens and design rationale, the Penpot file is its **visual implementation**, token names/colors/type-scale/radius/spacing scale correspond 1:1.

## 1. File-level conventions

- File name: `<system>-<style keyword>.penpot` (e.g. `Blue-Tech-Glow.penpot`)
- Version features: components/v2, variants/v1, design-tokens/v1, layout/grid
- All tokens recorded into `penpot.library.local.tokens`, using `scripts/token_engine.js` (**do not hand-write addSet/addToken**).
  **TokenType has 17 kinds** (`color` / `borderRadius` / `dimension` / `fontFamilies` / `fontSizes` / `fontWeights` /
  `letterSpacing` / `number` / `opacity` / `rotation` / `shadow` / `sizing` / `spacing` / `borderWidth` /
  `textCase` / `textDecoration` / `typography`), recorded per the DESIGN.md section mapping.
  **How to split sets**: **by default build only 1 set** (`<system> · Core`, internally auto-grouped by type, one set can hold all 17 kinds).
  **Splitting sets by type is forbidden** (Color/Radius/Spacing each one = a category error: these three are always active together, splitting just turns 1 switch into N).
  Only when there is a theme (dark/density/brand) do you add an **override layer**, and **the base layer must come first** (`sets` order is priority, later wins).
  **Three iron rules**: ① `addSet()` defaults to `active:false`, **tokens in an inactive set bind "successfully but don't take effect"**, building a set must explicitly activate it;
  ② after applying **you must readback `shape.tokens`**, an inapplicable shape silently no-ops;
  ③ within the same set, token names treat `.` as a path, **leaf and parent nodes are mutually exclusive** (if `t.color` exists, `t.color.x` cannot).
  See `references/design-tokens.md`.
- CJK text uniformly uses Noto Sans SC (Penpot has no font-stack fallback)
- Component-name separator is always `·` (**`/` is forbidden**, assignment silently fails): `Button·Primary·Default`
- Coordinates follow the 8px grid; place final coordinates directly at build time, never move an already-built board
- **PageRoot width fixed at 1920 is the "spec-sheet canvas"** (shows component matrix / spec boards), unrelated to the final screen target width.
  The target screen width is decided by the **viewport tier** (see §2.1 and `references/viewport-profiles.md`), reflected in
  `12 · Layout modes` per-tier grid boards and `14 · Demo` per-tier screen boards. The design-system core (00–13, 15) is shared across the three tiers, built once.

## 2. Page master table (16 pages, fixed numbering and order)

Layering principle: 01–02 basics (token visualization) → 03–07 controls (by task domain: input→select→collection→display, one component normalizes to one page) → 08–10 patterns (navigation/overlay/feedback) → 11–12 scenarios (visualization/layout) → 13–15 delivery.

| # | Page name | Required content boards |
|---|--------|-----------|
| 00 | `00 · Cover` | System name big title, version+date, style keyword tags, primary-color band 6 cells, page table of contents |
| 01 | `01 · Design Basics` | F1 palette, F2 type scale, F3 spacing & grid, F4 radius, F5 shadow/glow, F6 icons, F7 stroke & dividers |
| 02 | `02 · Color System` | C1 semantic colors, C2 light/dark theme comparison, C3 state colors, C4 gradients, C5 WCAG contrast check table |
| 03 | `03 · Basic Controls` | Button (Type×State×Size matrix), IconButton, ButtonGroup, Switch, Checkbox, Radio, Segmented |
| 04 | `04 · Text & Input` | Input, Textarea, InputNumber, SearchBox, Slider, Upload, FileTrigger, DropZone, ColorPicker, Form container (label/helper/error three states) |
| 05 | `05 · Selectors` | Select, AutoComplete, Cascader, TreeSelect, Transfer, DatePicker, TimePicker, DateRangeField, Calendar, RangeCalendar, DateField, TimeField |
| 06 | `06 · Data Collection` | Table (sort/filter/expand/fixed columns), List, Tree, Descriptions, Statistic, Timeline, Pagination |
| 07 | `07 · Display` | Card (≥3 sizes), Tag/Chip, Badge, Avatar, Image, Video, FileCard, Carousel, Collapse, Divider |
| 08 | `08 · Navigation` | TopNav, Sidebar/Menu, Tabs, Breadcrumb, Stepper, Dropdown, ContextMenu, CommandMenu, Toolbar, Anchor, BackTop, keyboard shortcut table |
| 09 | `09 · Overlay` | Modal, Dialog, Drawer, Sheet, Popover, Tooltip, Popconfirm + positioning/mask spec board |
| 10 | `10 · Feedback & Status` | Toast, Notification, Alert, Result, Skeleton, Progress, Spinner, Empty, ErrorState |
| 11 | `11 · Data Visualization` | legend, KPI cards, line/bar/pie chart examples, dashboard widgets, chart color mapping |
| 12 | `12 · Layout Modes` | one layout-grid board per selected tier: web 12 grid / pad 8 grid (drop to 4 when narrow) / mobile 4 grid or single-column stack; per-tier PageHeader, Grid/Space, ScrollArea, responsive breakpoints, Empty/404/Error whole-page templates (by tier width) |
| 13 | `13 · Component Index` | all library component instance thumbnail grid + name + owning page coordinates (design-to-code mapping table) |
| 14 | `14 · Demo` | board matrix (all assembled from library component instances): for **each selected tier** produce that tier's baseline-width six boards — Dashboard, Landing, Login, List admin page (search+filter+table+pagination), Detail page (description+action area+Timeline), Settings form page (grouped form+danger zone); multiple tiers can sit side by side within the 1920 canvas (e.g. 5 mobile-375 boards in a row). The original "optional Mobile 375 app board" is upgraded to a mandatory board per tier |
| 15 | `15 · Reference Imitation` | optional: imitation-target contrast analysis; if no target, omit and declare in DESIGN.md `omitted` |

## 2.1 Viewport tier (profile) — decides 12/14 page forms

Before the task starts the skill uses `ask_followup_question` to ask the user for the target tier (web/pad/mobile, multi-select allowed),
the result written into DESIGN.md `targetProfiles`. Tier definitions, baseline width, grid, touch targets, and the complete impact on artifacts
are in `references/viewport-profiles.md`. Key points:

- `web`: baseline width 1440 (design canvas 1920), 12 grid, touch target ≥36px (mouse).
- `pad`: baseline width 834, 8 grid (drop to 4 when narrow), touch target ≥44px.
- `mobile`: baseline width 375, 4 grid or single-column stack, touch target ≥44px.
- The design-system core (00–13, 15) is shared across the three tiers, built once; only the `12` grid board and `14` screen board are built per tier.
- Each `14` screen board width = the corresponding tier's baseline width, multiple boards can sit side by side on the 1920 canvas.

## 2.2 Color mode (color schemes) — decides 01/02/14 page forms and token set structure

Asked in the **same batch** as the viewport tier via `ask_followup_question` (one round-trip), the result written into DESIGN.md `## Colors` section body.
Definitions, artifact mapping, and acceptance are in `references/color-schemes.md`; set/theme mechanism in `references/design-tokens.md` §5. Key points:

- **Distinguish two concepts first**: most systems naturally have "**sectional surface polarity**" (light/dark regions alternating within the same page, e.g. hero uses ink, body uses canvas) —
  that is **not** a theme, needs no theme. This tier asks about "**switchable** whole-page light/dark flip".
- Answer `Light only` → tokens build **1 set** (`<system> · Core`), **0 themes** (pix is currently this form).
- Answer `Light + dark two schemes` → tokens build `· Core` (all) + `· Dark` (only the overriding same-named tokens),
  **Core must come first** (`sets` order is priority, later wins); then build a `Scheme` group with two themes
  (Light = {Core}, Dark = {Core, Dark}), mutual exclusion within a group auto-guaranteed by Penpot.
- Artifact impact:
  - `01 Design Basics F1`: palette **dual-polarity side by side**.
  - `02 Color System`: C1/C2/C3/**C5 contrast audit all doubled** (two tables, dark is not the inverse of light).
  - `03–12`: interactive components at least add a dark-polarity state group; display widgets give polarity notes.
  - `14 Demo`: **board count = tiers × schemes** (2 tiers × 2 schemes = 24 boards).
  - `12` layout modes unaffected (layout is orthogonal to color).

## 3. Per-page required elements (page anatomy contract)

Every page (00 may be simplified) must have one and only one top-level root board, all elements mounted into it:

```
NN-PageRoot (1920 × variable height, clipContent = false)
├── NN-Header   header area 1920×160
│   ├── page number + Chinese name + English name (32px title, left-aligned)
│   ├── one-line page description (16px, secondary color)
│   ├── token chips bar (this page's token names + color blocks)
│   └── version + date (top-right, label-sm)
├── <content area: spec-board array>
└── NN-Footer   footer 1920×80
    ├── this page's token reference list
    └── "← NN-prev page name   NN-next page name →" nav bar
```

Hard rules:
1. All elements mount into PageRoot (otherwise exported header loses components).
2. `clipContent = false`, glow/shadow not clipped.
3. Header/Footer/content-board coordinates fixed (§5), free placement forbidden.
4. Degraded Header board (crash damage 100×100) causes the whole page export to be all black — verify Header size after each build batch.

## 4. Component spec board contract

Board name = component English name (e.g. `Button`), internal structure fixed:

```
Button (880 × N, surface base, rounded.md)
├── Title row: Chinese name + English name
├── Anatomy board: leader lines annotate padding / gap / radius / icon slot / text slot
├── Variant matrix (rows = State, cols = Type or Size)
│   ├── rows: Default / Hover / Pressed / Focused / Disabled (interactive full five states; display Default/Disabled)
│   ├── cols: Type (Primary/Secondary/Tertiary/Ghost/Danger…) or Size (S/M/L)
│   └── each cell = variant board `Button·Primary·Default`, caption below: `W×H · padding · {tokens}`
├── Usage rule bar: one Do line + one Don't line (each with a 48px mini illustration)
└── Library component master instance (master shape in 'AI Component Masters' master board)
```

Registration discipline (see references/mcp-automation.md §4):
- Register always with the `AI Component Masters` master board's shape via `createComponent([shape])`; `comp.remove()` deletes the master instance too, never register/re-register on a display-board shape.
- Variant container via `penpotUtils.createVariantContainer` (input must be a registered master instance); after reparent, reset `parentX/parentY`.

### 4.1 Assembly-ownership contract (group / component / board) — complete primitive sets forbidden from loose same-level stacking

**Every "visual component"'s constituent primitives (base plate + label + icon + sub-parts…) must be collected into and only into one kind of container**:

| Ownership | Judgment | Approach | Naming |
|---|---|---|---|
| **component** | **Reused**: listed in the 13 component index, or appears in ≥2 places in 14 Demo | assemble first into a group → `penpot.library.local.createComponent([group])` registers into `AI Component Masters`; in pages/examples **always `comp.instance()`**, never copy loose primitives | `A·B·C` (no `/`) |
| **group** | **Single-use** primitive set: variant-matrix cells, Anatomy illustration, KPI cards, swatch trio, button/field/label examples | `penpot.group([host, ...members])` groups in place (within the same parent), group name = host name/component name·variant | same component-name convention |
| **board** | page partition / spec board / screen board / overlay container (option C) | `mkAbsBoard`, not an assembly host (not grouped with label) | see §4 |

- **Unsure group or component → group first**; when upgrading, `createComponent([group])` registers the whole group, child elements stay collected, zero rework.
- **Only loose primitives allowed**: pure decorative singles (divider, grid column, independent caption) and sub-primitives **inside** a group/component.
- **Label-less primitive sets** (track+thumb, radio ring+dot) cannot be recognized by text-pairing in audit, **group manually** (group name takes the main-part name).
- Hierarchy iron rule: label must be **same parent** as the base plate (enter the group together); after registration the label becomes an internal child element of the component — otherwise registration yields an empty-shell component (§4 registration discipline).
- **Front-to-back order (z-order)**: larger `parentIndex` is more front (0 = bottom). After grouping/componentizing it must be kept —
  within a group **area descending** (large base plate at bottom, label/icon on top), the group itself occupies **the top member's layer slot**, instance replacement occupies **the original group's layer slot**.
  `penpot.group` scrambles members' z-order (label covered by base plate); repair engine `fixZOrder()` (`groupAssemblies` already built in).
- Machine enforcement: audit signature `loose_assembly` (S11) detects loose assemblies; repair engine `storage.groupAssemblies()`
  (inside-out, minimal-host ownership, nested groups, idempotent, **z-order preserving**); gate G10.

## 5. Coordinates and grid spec

| Item | Value |
|---|---|
| PageRoot width | 1920 |
| Content area | x ∈ [80, 1840] |
| Standard spec board | 560 wide, 3 cols x = 80 / 680 / 1280, column gap 40 |
| Large spec board | 880 wide, 2 cols x = 80 / 1000 |
| Board vertical gap / in-board blocks / elements | 48 / 24 / 8–16 |
| Header / Footer height | 160 / 80, content starts from y=240 |
| Demo screen board width (web) | 1440 (landscape) or 1920; placed on page-14's 1920 canvas |
| Demo screen board width (pad) | 834 (portrait) or 1194 (landscape) |
| Demo screen board width (mobile) | 375 (portrait) or 812 (landscape); multiple can sit side by side (1920÷375≈5) |
| Touch-target floor (pad/mobile) | ≥44px (use token `touchMin`); web ≥36px |

## 6. Mapping with DESIGN.md (design-to-code basis)

| DESIGN.md | Penpot | Code implementation |
|---|---|---|
| `colors.*` | 01-F1 palette + tokens set | theme variables (QSS var / CSS custom properties) |
| `typography.*` | 01-F2 type scale | font tokens / TextStyles |
| `spacing.*` | 01-F3 spacing grid | layout constants |
| `rounded.*` | 01-F4 radius | radius constants |
| `components.<name>` | 03–12 page spec boards + library components | code components (same-name mapping, see 13 index page) |
| Do's and Don'ts | each spec board's usage rule bar | code-review checklist items |

## 7. Delivery self-check list

- [ ] 16 pages complete (15 optional) and correctly named/ordered
- [ ] Each page has a unique PageRoot, Header/Footer in place, clipContent=false
- [ ] Component spec boards conform to §4 contract, variant naming `Component·Attribute·Attribute`
- [ ] **Assembly ownership compliant (§4.1)**: all primitive sets grouped or componentized, no loose same-level stacking (audit `loose_assembly` = 0);
      reused components use `comp.instance()` in pages rather than copied loose primitives
- [ ] All tokens recorded into library tokens, same name and value as DESIGN.md; **`storage.TK.audit().ok === true`**
      (all sets `active:true` + all tokens `resolvedValueString` non-empty, i.e. no failures/broken links)
- [ ] All components registered as library components (masters in AI Component Masters), 13 index page info complete
- [ ] 14 Demo each selected tier's screen boards all assembled from library component instances (six boards per tier: Dashboard/Landing/Login/List/Detail/Settings);
      **when color mode is "two schemes", board count = tiers × schemes**, and both schemes exported and accepted
- [ ] Color mode implemented per DESIGN.md `## Colors` declaration: light only → 1 set / 0 theme;
      two schemes → `· Core` + `· Dark` (Core first) + Scheme group with two themes, and **page 02 contrast audit has light/dark two tables**
- [ ] Each page `export_shape` exports PNG acceptance pass (no 100×100 degradation, no clipping, no offset)
