# Penpot file contract — the 18-page output structure

> Every code-to-design task produces **the same file**: one Penpot file, 18 numbered pages in 4 layers, one root board
> per page, one spec board per component family, one board per screen recipe. The page list is fixed; the *contents* of
> the pages are derived from the engines, so adding a factory or a recipe automatically adds a board without changing
> this contract.
>
> **DESIGN.md is the source of truth** for tokens and rationale; this file is its visual implementation. Token names,
> colors, type scale, radius and spacing correspond 1:1. Where the two disagree, DESIGN.md wins for values and
> `layout_engine.js` / `component_factory.js` win for geometry.

## 0. How the page list is derived (read this first)

| Layer | Pages | Derivation rule |
|---|---|---|
| **L0 Identity & foundations** | `00`–`02` | the token groups of DESIGN.md, drawn once per token family |
| **L1 Components** | `03`–`09` | one page per group of `storage.CF.map()` (`actions` · `forms` split into fields/pickers · `data` split into lists/metrics · `navigation` · `feedback`) |
| **L2 Layout** | `10`–`12` | `CF.map().shell` + `LY.slots` (chrome) · `LY.TIERS` (grid) · `LY.keys()` (recipes) |
| **L3 Delivery** | `13`–`17` | the component registry, then the screen recipes split by **scroll idiom**, then the optional imitation page |

Three consequences that make the contract checkable instead of aspirational:

1. **A board that `CF`/`LY` cannot produce is not in this contract.** Every required board is named by an engine key.
   If a variant is missing, add the factory (gate G12); if a region is missing, add the recipe (gate G11). Do not
   hand-build a one-off board inside `execute_code`.
2. **Every page declares its audit scope** (last column of §2). `storage.designGate({ … })` is run with exactly that
   scope, so "page 14 is clean" is a statement with a definition, not an opinion.
3. **Page count never grows with the number of components.** A 40th Button variant is a row in an existing
   `Button·Spec` board; a 30th recipe is a board in `LY.pack()`'s next shelf row.

## 1. File-level conventions

- File name `<system>-<style keyword>.penpot` (e.g. `Blue-Tech-Glow.penpot`).
- Version features: `components/v2`, `variants/v1`, `design-tokens/v1`, `layout/grid`.
- Tokens go into `penpot.library.local.tokens` through `scripts/token_engine.js` — **never** hand-written
  `addSet`/`addToken`. 17 TokenTypes, one `· Core` set by default, an override set only when a theme exists
  (`sets` order is priority, later wins). The three iron rules (activate the set, read back `shape.tokens`, `.` is a
  path so leaf and parent are mutually exclusive) are in `references/design-tokens.md`.
  **Machine gate**: `storage.TK.audit().ok === true`.
- Names are `·` separated (`Button·Primary·Md·Hover`). `/` in a component name silently fails to assign.
  The token order is the variant-property order: `Family·Type·Size·State·Slot·Tone` (§4.2).
- CJK text uses Noto Sans SC (Penpot has no font-stack fallback).
- Coordinates are placed **once**, on the 4px grid, from `LY` numbers. Never move a board after it is built.
- **PageRoot is 1920 wide: it is the spec-sheet canvas, not a screen.** The screen width comes from the viewport tier
  (`LY.TIERS`: web 1440 / pad 834 / mobile 375) and only appears as the width of a board placed *inside* a page.

## 2. Page master table (18 pages, fixed numbering and order)

`Required boards` is the delivery contract. `Scope` is the argument passed to `storage.designGate()` for that page.

| # | Page | Required boards | Scope |
|---|---|---|---|
| **L0** | `00 · Cover` | 1 identity board (name, version+date, style-keyword chips, the 6 tone ramps as wash/hue/ink triples, the 18-page table of contents) | default |
| | `01 · Foundations` | 8 boards: `Palette` (every `CF.P` key, dual polarity when a dark scheme exists) · `Type ramp` (one line per step of the declared ramp — `storage.T.fontRamp` when the system overrides it, else design-guide §3.2 `[11,12,13,14,16,20,24,32,40,56,64]` — each with its role) · `Spacing` (`LY.SPACE` bars) · `Grid` (12/8/4 diagrams) · `Radius` · `Elevation` · `Icons` (`CF.glyphKinds` on `CF.iconSquare` pitches) · `Strokes & dividers` | default |
| | `02 · Color in use` | 5 boards: `Semantic roles` (tone → wash / hue / **ink**, design-guide §4) · `State layers` (the `CF.STATE` alphas drawn on one base) · `Contrast matrix` (every text/background pair the kit can produce, WCAG ratio + verdict) · `Light vs dark` · `Data colors` (categorical ramp) | default |
| **L1** | `03 · Actions` | one `Family·Spec` per `CF.map().actions` (button, iconButton, buttonGroup, splitButton, fab, link, segmented) | default |
| | `04 · Text fields` | `CF.map().forms` ∩ fields: field, fieldBox, input, textarea, searchField, passwordField, maskedInput, otpInput, numberField, upload, colorPicker | default |
| | `05 · Selection & pickers` | the rest of `CF.map().forms`: select, combobox, multiSelect, datePicker, timePicker, switch, checkbox, radio, slider, rating, transfer, tree — plus the shared `OptionList` composite they mount (judged inside its own board, §4.1) | default |
| | `06 · Data & lists` | tableHeader, tableRow, tableState, listItem, descriptions, timeline, accordion, carousel, miniCalendar | default |
| | `07 · Display & metrics` | card, kpi, badge, statusText, chip, avatar, avatarGroup, progress, skeleton, emptyState | default |
| | `08 · Navigation` | navItem, tabs, tabBand, breadcrumb, pagination, steps, menu, commandPalette, anchor | default |
| | `09 · Overlays & feedback` | modal, drawer, sheet, popover, popconfirm, tooltip, toast, notification, alert, spin — **each drawn over its real host** (a scrim, a dimmed screen, an anchor row), not floating on white | default |
| **L2** | `10 · App shell & chrome` | one board per `CF.map().shell` (appBar, sideNav, toolbar, pageTitle, footer, mobileBar) + one anatomy board per `LY.slots` key (appBar, sideNav, toolbar, pageTitle, tabs, footer, modal, kpiCard, tableRow, card, field, messageRow) + the remaining chrome keys of `layout-library §2` that no factory owns (navRail, filterBar, breadcrumbBar, paginationBar, listPaneHeader, statusBar, emptyState, commandPalette) | `{ families: [ … the composite names … ] }` |
| | `11 · Grid & breakpoints` | per selected tier: the column/gutter/margin diagram (`LY.TIERS[tier]`), the container ladder (1376 / 1152 / 720 / 640 / measure 760), the collapse order (`layout-library §4.2`), the touch-floor board (32 web / 44 touch, with the `hitpad·` escape), the fold anatomy | `{ tier: <tier of the board>` }` |
| | `12 · Screen recipes` | **one annotated skeleton per `LY.keys()`** (`LY.drawStart` → `drawStep`, every region labelled with its `LY.rect` key) + the tier-gate table (which recipe refuses which tier, and the `use` pointer it returns) | default |
| **L3** | `13 · Component index` | 1 registry board: thumbnail of every registered component/variant + its `Family·Type·Size·State·Slot` name + the page/board it lives on + the DESIGN.md component key (this is the design-to-code mapping table) | default |
| | `14 · Screens · app` | the 11 app-idiom recipes: dashboard, listCrud, detailRecord, settings, email3, chat, kanban, calMonth, calWeek, gallery, wizard — one board per recipe **per selected tier that `LY.recipe` accepts** (web 11/11, pad 10/11 refuses `calWeek`, mobile 1/11 = `settings`) | `{ tier }` per board |
| | `15 · Screens · content` | the 14 document-idiom recipes: landing, heroCenter, heroSplit, pricing, blogArticle, docsLayout, ecomListing, ecomPdp, cart, checkout, authCard, authSplit, otp, reportPrint (web 14/14, pad 12/14 refuses `authSplit` + `reportPrint`, mobile 5/14 = heroCenter, blogArticle, cart, authCard, otp) | `{ tier }` per board |
| | `16 · Screens · mobile` | the mobile tier's own set: `mobileFeed`, `mobileListDetail`, plus every 14/15 recipe that survives at 375 (`settings`, `heroCenter`, `blogArticle`, `cart`, `authCard`, `otp`) drawn at 375 and labelled `@375`. `eventPopover` belongs to page 09 (it is an overlay over its host); `commandPalette` to page 10 | `{ tier: 'mobile' }` |
| | `17 · Reference imitation` | *optional*: side-by-side of the recreation target and the produced screen + the delta list. Omit it and say so in DESIGN.md `omitted` | default |

All 29 `LY.keys()` recipes have a home above (11 + 14 + `mobileFeed` + `mobileListDetail` + `eventPopover` +
`commandPalette`), which is what makes "the screen pages are complete" checkable: `LY.keys()` minus the board names on
14–16 must be empty. **Refused tier × recipe pairs are not gaps** — page 12's tier-gate table records the `{ err, use }`
pointer each refusal returns, and that table is the delivery answer for "why is there no mobile three-pane email".

**Page 14/15/16 split is by scroll idiom, not by tier.** An app screen is a fixed shell whose *content region* scrolls;
a content page is a whole document that scrolls (1600–4000px tall); a mobile screen is a device frame with the chrome
stack of `layout-library §4.3`. Pad-width boards sit on 14/15 beside their web twins, labelled `@834`.

### 2.1 Viewport tiers — decide the shape of pages 11 and 14–16

Asked **before the task starts** (one `ask_followup_question` round-trip, multi-select), written into DESIGN.md
`targetProfiles`. Full definitions in `references/viewport-profiles.md`.

- `web` 1440 baseline (canvas 1920), 12 columns, margin 32, gutter 24, touch floor 32, viewport height 900.
- `pad` 834, 8 columns (4 when narrow), margin 24, gutter 16, touch 44, viewport 1112.
- `mobile` 375, 4 columns, margin 16, gutter 12, touch 44, viewport 812.
- **L0–L2 (00–13) are built once for all tiers**; only page 11 gains a board per tier and pages 14–16 gain a board per
  recipe × tier. `LY.recipe(key, { tier })` *refuses* a recipe that has no definition for that tier and returns
  `{ err, use }` — a three-pane app screen asked at 375 is not "the same layout, narrower", so it is replaced by
  `mobileListDetail`, never squeezed.
- A screen board is built at its own tier width, so `CF.tier` must be set to that tier **before** building the screen
  (`CF.tier = 'mobile'`). `CF.autoHit` pads compact controls to 32 on web and to 44 on touch; leaving the tier at the
  default is how a phone screen ships 32px targets.

### 2.2 Color schemes — decide 01, 02 and the demo boards

Asked in the **same round-trip**, written into DESIGN.md `## Colors`. Definitions in `references/color-schemes.md`.

- Distinguish the two things first: **sectional surface polarity** (a dark hero inside a light page) is a property of
  every system and needs no theme. This question is about a **switchable whole-page light/dark pair**.
- `Light only` → 1 token set (`<system> · Core`), 0 themes.
- `Light + dark` → `· Core` (all tokens) then `· Dark` (only the overriding same-named tokens, **Core first**), plus a
  `Scheme` theme group with `Light = {Core}` and `Dark = {Core, Dark}`; Penpot enforces the group's mutual exclusion.
- Artifact impact — bounded on purpose, so a second scheme costs a page, not the file:
  - `01 Palette` and `02 Color in use` show both polarities side by side (the contrast matrix is **doubled**: dark is
    not the inverse of light).
  - `03–09` spec boards keep one polarity (the one the system starts in) plus the `onDark` state rows where `CF` draws
    them; they are not duplicated.
  - `14–16` add **one dark twin per demo page** (the recipe that best shows the scheme), not one per board.
  - `11 Grid & breakpoints` and `12 Screen recipes` are unaffected: layout is orthogonal to color.

## 3. Page anatomy (per-page contract)

Every page (00 may be simplified) has exactly one top-level root board, and everything mounts inside it:

```
NN-PageRoot (1920 × used height, clipContent = false)
├── NN-Header    1920×160 at y=0
│   ├── page number + name        32px, x=80, y=40          (ramp: 32)
│   ├── one-line description      14px secondary, x=80, y=88
│   ├── token reference line      "tokens · …" 12px, x=80, y=120
│   └── version + date            12px, right-aligned so its measured width ends at x=1840
├── <content column>  x ∈ [80, 1840] (1760 wide), starting at y=240
└── NN-Footer    1920×80 at y = used content bottom + 32
    ├── footerTokens   "tokens · …"  12px, x=80
    └── footerNav      "prev · NN · Page name      next · NN · Page name"  12px, right-aligned
```

`scaffold_structure.js` owns this geometry — the constants are `CANVAS_W 1920 · CONTENT_X 80 · CONTENT_R 1840 ·
HEADER_H 160 · FOOTER_H 80 · CONTENT_Y 240` and its `PAGES` table **is** §2 (page name + header description + token
line), so the doc and the scaffolder can be diffed mechanically. `storage.scaffoldContract()` returns the page names.
The script is a 3-phase queue runner, re-runnable at any time: phase 1 creates the missing pages (6 per call), phase 2
builds one PageRoot+Header+Footer per page (idempotent), phase 3 **fits** every root to its used height and moves the
footer. Run phase 3 again after the content exists — that is the delivery-time height fix.

Hard rules:
1. Everything mounts into PageRoot (a shape outside it is lost on export and read as `root_stray`).
2. `clipContent = false`, so glow/shadow/ring layers are not cropped.
3. Header/Footer/content geometry comes from `scaffold_structure.js`; do not re-derive it per task.
4. A header degraded to 100×100 (the crash signature) blacks out the whole page export — verify Header size after
   every build batch (`storage.auditPage()` reports `crash_100x100`).
5. PageRoot height = the used height of the content column. **Do not pad a page to a round number** — a footer
   floating 2000px below its content reads as `viewport_locked`.
6. No arrow/check/dingbat glyphs in generated text: Penpot has no font-stack fallback, so a glyph missing from Nunito
   or Noto Sans SC renders as tofu. Write `prev ·` / `next ·`, not `←` / `→`.

## 4. Spec-board anatomy (what `CF.matrix` draws)

`CF.matrix({ family, axes, rows, parent, x, y })` returns one board named `Family·Spec`, exactly as wide as its
content (it shrinks to fit; `shrink:false` keeps the requested width):

```
Button·Spec (measuredW × padY·2 + 40 + 28 + rows·(cellH+gapY))
├── title row            20px   "Button · variants"        + optional 13px right-aligned subtitle
├── state-axis header    11px, role:axis — one label per column (default/hover/focus/…)
├── one row per variant  label 13px at labelW=168, then one control host per state column
│   └── each cell = a CF host, `Family·Type·Size·State·Slot`, vertically centred in cellH
├── hairlines            1px, 70% border colour, between rows
└── notes                up to 3 wrapped 12px lines (the usage rule / Do-Don't row)
```

### 4.1 Minimum coverage per family (signatures `state_coverage`, `variant_sparse`, `focus_ring_missing`)

The rows a family must show are `references/component-library.md §3.0` (states) and `§3` (variants). The auditor's
thresholds, single-sourced in `audit_design.js`:

| Check | Threshold | Notes |
|---|---|---|
| states | every state column of the family's class (`ctl` / `field` / `toggle` / `row` / `sel`) bar at most 2 | a matrix built from `component-library §3.0` passes by construction |
| variants | ≥ 3 distinct **non-state, non-size** name tokens | skipped for `Checkbox` / `Radio`: one drawing per state, no style axis exists |
| sizes | ≥ 2 ladder sizes, only when the family declares a size at all | `xs`–`2xl` tokens |
| icon slots | a `IconStart`/`IconEnd`/`Clear` variant wherever the family is in `ICON_FAMS` | named by `CF`'s `slotName()`, not by prose |
| focus | ≥ 1 `ring·` layer or a ≥2px focus border on the Focus hosts | drawn by `ctx.ring`, never by darkening a 1px border |
| disabled | content alpha in `.25–.40` (`CF.STATE.disabledContent`) | `place()` clamps it for the whole host subtree |
| coverage scope | families present with < 2 hosts are not judged; composites listed in `SPEC_SKIP` are judged only inside their own board | page 10 runs `{ families: […] }` to bring them back |

**Naming is what makes coverage decidable.** A control that draws a leading icon must be *named* `…·IconStart…`; a
11px axis label must be *named* `axis`. `CF` does this for both (`slotName()`, `ctx.text({ role })`); a hand-built
board that draws the pixels without the token reads as absent.

### 4.2 Registration (variant containers)

- Register with `CF.component(host)` — which is `createComponent([host])`: the host **becomes** the component's main
  instance (it stays on the canvas, so a spec board may be registered from), masters are conventionally collected in the
  `AI Component Masters` board. `comp.remove()` also deletes its instances, so never delete a component to "undo" a
  registration, and never re-register the same host in place.
- Group the variant hosts with `CF.variants(hosts, name)` when `penpotUtils.createVariantContainer` exists; report,
  never assume, its availability.
- Variant properties, in this order and **≤ 4 per family**: `Type` · `Size` · `State` · `Slot`. `Slot` carries the
  boolean-ish anatomy switches (with-icon, with-clear, addon, loading) so `State` stays a clean axis.

### 4.3 Assembly ownership (no loose primitive sets)

Every visual component's primitives live in **exactly one** container:

| Ownership | Judgment | How | Name |
|---|---|---|---|
| **component** | reused: in the 13 index, or in ≥ 2 places on 14–16 | assemble into a group → `CF.component(group)`; on a screen, **place an instance** with `CF.instance(CF.name(…))` and switch states with `CF.swap` (instancing is scriptable — api-pitfalls §6, capabilities §5); a `CF` factory re-call is the fallback when no master exists. Never copy loose primitives into a screen | `Family·Type·Size·State` |
| **group** | single-use primitive set: a matrix cell, an anatomy illustration, a KPI card | `penpot.group([host, …members])` in the same parent | host name |
| **board** | page partition, spec board, screen board, overlay container | `storage.mkAbsBoard` (approach C), not a group host | see §2 |

- Unsure group-or-component → **group first**; `CF.component(group)` upgrades it with zero rework.
- Only decorative singles (divider, hairline, caption) and primitives **inside** a host may stay loose.
- Label-less primitive sets (track + thumb, ring + dot) cannot be found by text pairing: group them manually.
- A `CF.*` factory **always returns one host with everything mounted inside it** — building through `CF` satisfies
  this section for free, which is the real reason G12 exists.
- Z-order: within a group the area descends (base plate at the bottom, label/icon on top) and the group takes the top
  member's slot. `penpot.group` scrambles it; repair with `storage.fixZOrder()`.
- Machine enforcement: `loose_assembly` (audit_layout.js) + `storage.groupAssemblies()` + gate G10.

## 5. Coordinates, columns and packing

| Item | Value |
|---|---|
| PageRoot width | **1920** (pages 00–13, 17) |
| Content column | x ∈ [80, 1840] → 1760 wide |
| Spec-board shelf | `LY.pack({x:80,y:240,w:1760}, widths, { gapX: 32, gapY: 32 })` — wrap at the column edge, never overlap, `out.height` gives the used height |
| Max spec-board width | 1760 (a board wider than the shelf is clamped by `LY.pack`, not allowed to bleed) |
| Screen boards | one per row when the board is ≥ 900 wide (app/content); 4 × 375 boards per row on page 16 (`LY.pack` with `gapX: 24`) |
| Vertical rhythm on a page | 32 between spec boards, **64** between screen boards (they are the deliverable) |
| Header / footer | 160 / 80, content starts at y = 240 |
| Tier viewport height (fold marker) | web 900 · pad 1112 · mobile 812 (`LY.viewportHeight(tier)`) |
| Screen board width | web 1440 · pad 834 · mobile 375/390 — **never** 1920 (that is the canvas, §1) |
| Touch floor | mobile/pad ≥ 44, web ≥ 32, incl. `hitpad·` (`CF.minHit()` reads `CF.tier`) |

`LY.pack()` exists because a spec board's width is *measured* (`CF.matrix` shrinks to its content): a page cannot
pre-plan 3 fixed columns, it packs. Packing by hand is the same class of error as hand-writing a pane width (G11).

## 6. Screen pages: the long-document rule (pages 14–16)

This is where amateur output is most visible, so the rules are explicit:

1. **Height comes from the bands, never from a canvas habit.** Build with `LY.recipe(key, { w, tier })` (app screens)
   or `LY.flow()` (content pages) and resize the screen board to `totalH`. A marketing board shorter than 1600 at 1440
   wide, or an app board locked to exactly 1080 with an empty bottom, fails `viewport_locked`.
2. **Every screen board carries a fold marker**: `LY.fold(board, tier)` draws the dashed viewport outline labelled
   `fold·<tier>` so a reviewer sees what the first screen contains. A board taller than 2000 without one is flagged.
3. **Only the extent the agent chose is judged.** Grid, scale, rhythm, split ratio, viewport and control-cap rules
   apply to the sections and boxes you placed; geometry *inside* a `CF` host or a `·Spec` board is not grid-audited,
   because an auto-width chip is 97px wide when its label is 97px wide.
4. **Screens are assembled from the factories, not from re-drawn primitives** (§4.3): chrome from `CF.appBar`/`CF.sideNav`,
   regions from `LY.rect`, content from the `CF` family that owns it. Re-calling a factory is the scripted equivalent of
   instancing — same geometry, same name, and the coverage lint can see it.
5. `CF.tier` is set per screen (§2.1) and the board is audited with the matching `{ tier }`.

## 7. Mapping to DESIGN.md (design-to-code basis)

| DESIGN.md | Penpot | Code |
|---|---|---|
| `colors.*` | 01 Palette + 02 Color in use + token set | theme variables / CSS custom properties |
| `typography.*` | 01 Type ramp | font tokens / TextStyles |
| `spacing.*`, `grid` | 01 Spacing + 11 Grid & breakpoints | layout constants |
| `rounded.*`, `shadow.*` | 01 Radius / Elevation | radius + elevation constants |
| `components.<name>` | 03–09 spec boards + registered components + 13 index | code components (same-name mapping) |
| `layouts.<recipe>` | 12 Screen recipes + 14–16 boards | page templates / route views |
| Do's and Don'ts | each spec board's `notes` row | code-review checklist |
| `targetProfiles`, `## Colors` | how many boards 11/14–16 carry, and the set/theme structure | breakpoint + theme config |

## 8. Delivery self-check

- [ ] 18 pages present, named and ordered per §2 (17 optional, declared in DESIGN.md `omitted`).
- [ ] One PageRoot per page with Header/Footer in place, `clipContent=false`, root height = used height (§3).
- [ ] Pages 03–09: one `Family·Spec` per family of `CF.map()`, packed by `LY.pack`, names in
      `Family·Type·Size·State·Slot` form, no `/`.
- [ ] Coverage per §4.1: `variant_sparse`, `state_coverage`, `focus_ring_missing`, `disabled_wrong` all **0**.
- [ ] Assembly ownership per §4.3: `loose_assembly` = 0; screens re-call the `CF` factories, never re-draw loose primitives.
- [ ] Tokens: `storage.TK.audit().ok === true` and every name/value pair matches DESIGN.md.
- [ ] Pages 14–16: one board per recipe × selected tier, each sized by `LY` (never by a typed height), each with a
      `fold·` marker; every board audited with its own `{ tier }`.
- [ ] Color scheme implemented as declared (§2.2), including the doubled contrast matrix on 02 when a dark scheme exists.
- [ ] `storage.designGate({ … })` **CLEAN for every page scope in §2**, and `storage.auditPage()` CLEAN for positioning
      (the two auditors are independent: this file's rules say nothing about overlap, and vice versa).
- [ ] `export_shape` PNG per page accepted: no 100×100 degradation, no clipping, no offset; CJK renders with Noto Sans SC.
