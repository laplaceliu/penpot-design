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
| **L0 Identity & foundations** | `00`–`02` | the token groups of DESIGN.md. `01`/`02` are **projected** by `storage.FN` from `TK.declared()` records — one `FN.project({page,kind})` call per board, never drawn by hand (gate G16); `00` is the identity sheet |
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
   `Button·Spec` board; a 30th recipe is a board in `LY.pack()`'s next shelf row. (§2.3 is the one deliberate
   exception: the *chapter* pages may be paginated one board per page, which multiplies page count without ever adding
   a board that the engines cannot produce.)

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
| | `01 · Foundations` | 8 boards — **one `01.MM` page each, each projected by `storage.FN` and carrying the durable `nl:fn=<kind>` stamp (gate G16; `designCoverage()` judges the chapter across pages, engines.md §7)**: `Palette` (every declared colour token, dual polarity when a dark scheme exists) · `Type ramp` (one line per **`TK.declared().types`** step — `storage.T.fontRamp` only when the system overrides it, else design-guide §3.2 `[11,12,13,14,16,20,24,32,40,56,64]` — each with its role) · `Spacing` (`LY.SPACE` bars) · `Grid` (12/8/4 diagrams) · `Radius` · `Elevation` · `Icons` (`CF.glyphKinds` on `CF.iconSquare` pitches; the one **declared exemption** `FN.EXEMPT['01']`, it draws a catalog) · `Strokes & dividers`. **No board here takes a height argument**: the value comes from the hug sum | default |
| | `02 · Color in use` | 5 boards: `Semantic roles` (tone → wash / hue / **ink**, the triples derived from token *names*, design-guide §4) · `State layers` (the `CF.STATE` alphas drawn on one base) · `Contrast matrix` (every text/background pair the kit can produce, WCAG ratio + verdict **computed** from the palette) · `Light vs dark` (scheme boards only, §2.2) · `Data colors` (categorical ramp). All but `Light vs dark` are `FN` projections | default |
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

All 30 `LY.keys()` recipes have a home above (11 + 14 + `mobileFeed` + `mobileListDetail` + `eventPopover` +
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
  - `01 · Palette` and `02 · Color in use` show both polarities by being **projected once per token set**
    (`FN.project({page, kind, set:'<system> · Dark'})` — the dark table is a record read, so it cannot drift from the
    theme; the `Contrast matrix` is doubled the same way). `Light vs dark` stays composed as `FN.EXEMPT['02']`.
  - `03–09` spec boards keep one polarity (the one the system starts in) plus the `onDark` state rows where `CF` draws
    them; they are not duplicated.
  - `14–16` add **one dark twin per demo page** (the recipe that best shows the scheme), not one per board.
  - `11 Grid & breakpoints` and `12 Screen recipes` are unaffected: layout is orthogonal to color.

### 2.3 Block-per-page pagination (the fine-grained variant of the same contract)

The 18-page list is the **chapter** contract. A chapter may be paginated to **one board per page** without changing
anything else in this file: page `07 · Display & metrics` becomes `07.01 · Display & metrics · Card·Spec`,
`07.02 · … · Kpi·Spec`, … The grammar is fixed:

```
NN.MM · <chapter name> · <board name>        07.03 · Display & metrics · Card·Spec
```

`NN` is still the chapter of §2 (so layer, ordering and the footer nav are unchanged), `MM` is the 1-based index of the
board inside that chapter, and the block suffix is **the board's own name verbatim** — the page is addressable by the
thing it contains, which is the whole point: a defect report, a repair call and a human sentence all name the same
unit, and no repair ever has to "find the card spec somewhere on page 07".

- **When to use it**: whenever a chapter carries more than a couple of boards and the task involves repair loops or
  per-board delivery. One board per page makes `designPage`/`auditPage` scope trivially small, keeps each page's
  PageRoot short (a 12-board chapter page is a 12 000px scroll), and makes the block addressable in a URL/selection.
- **When NOT to paginate**: pages **14/15/16** and **17**. Prototype links are page-local — a `navigate-to` whose
  destination lives on another page persists with a **null destination** (measured 2026-10-21: the interaction survives,
  reads back fine, and does nothing in the viewer). Screens must therefore stay on one page with their flow partners.
- **Page anatomy per block page** is §3 verbatim: `<NN.MM>-PageRoot` (1920) + `-Header` + `-Footer` + exactly **one**
  content board at `x=80, y=208`. The header's description line is the chapter description; the token line is the
  board's own token reference.
- **Scope for the gates** is inherited from the chapter row of §2 (`default`, `{families:[…]}`, `{tier}`), so
  "page 07.03 is clean" has the same definition as before.
- **Three derived artifacts must be rebuilt last**, because they read the page list: the `00` cover's table of contents
  (chapter → block-page range), the `13` component index (families × the pages that host them), and the prototype
  flows. All three are engine-derived — never hand-edit a TOC.
- **`FN` boards paginate the same way.** `FN.project({page: '01.09 · Foundations · Palette', kind: 'palette'})` writes into
  whatever page you name: `FN.pageRoot` resolves that page's `<NN.MM>-PageRoot`, and a one-board page is simply a shelf with
  one entry (the board lands at the shelf's first slot). Because a chapter is now spread over ~9 pages, **coverage is a file
  question**: `FN.chapterPages()` lists the `NN[.MM]` pages whose chapter is in `FN.CHAPTER`, `FN.coverage()` (and the
  auditor's `storage.designCoverage()`) checks each chapter kind is projected *somewhere* and that no chapter board is
  un-stamped, and `FN.offChapter` reports a projected board parked on the wrong chapter's page without blocking it.
  `FN.boards(page)` returns a page's content boards (the scaffold's `-PageRoot`/`-Header`/`-Footer` excluded) and
  `FN.stampOf(board)` the `nl:fn` proof; `FN.projected(page)` still recognises a board by its **`FN.KINDS` display name**,
  so the block suffix of the page name and the board name are the same string — which is exactly the §2.3 rule.
  Under pagination `FN.reflow`/`fitRoot` become no-ops on a one-board page, and `FN.check(page)` scopes to that board.
- **Deleting a page is not a cosmetic act.** It destroys the component masters hosted on it (measured: 275 → 0) and it
  wipes every flow and interaction in the file. After any page deletion: re-register masters (`CF.autoRegister` per
  page), re-create the named flows **before** re-wiring links (otherwise Penpot invents `Flow N`), and re-author links
  from a name-based spec, because ids do not survive a rebuild.

## 3. Page anatomy (per-page contract)

Every page (00 may be simplified) has exactly one top-level root board, and everything mounts inside it:

```
NN-PageRoot (1920 × used height, clipContent = false)
├── NN-Header    1920×160 at y=0
│   ├── page number + name        32px, x=80, y=40          (ramp: 32)
│   ├── one-line description      14px secondary, x=80, y=88
│   ├── token reference line      "tokens · …" 12px, x=80, y=120
│   └── version + date            12px, right-aligned so its measured width ends at x=1840
├── <content column>  x ∈ [80, 1840] (1760 wide), starting at y=208
└── NN-Footer    1920×80 at y = used content bottom + 32
    ├── footerTokens   "tokens · …"  12px, x=80
    └── footerNav      "prev · NN · Page name      next · NN · Page name"  12px, right-aligned
```

`scaffold_structure.js` owns this geometry — the constants are `CANVAS_W 1920 · CONTENT_X 80 · CONTENT_R 1840 ·
HEADER_H 160 · FOOTER_H 80 · CONTENT_Y 208` and its `PAGES` table **is** §2 (page name + header description + token
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

`CF.matrix({ family, axes, rows, parent, x, y, maxW })` returns one board named `Family·Spec`, as wide as its content
but **never wider than `maxW`** (the band the shelf can grant, FULL = 1760): cells that no longer fit fold onto a second
line of their own row, the board grows in height, and the state-axis header is replaced by a `columns fold: …` caption
(a folded sheet has no fixed column set — the host names still carry the state, and `designPage` reads those).
`shrink:false` keeps the requested width.

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
| **board** | page partition, spec board, screen board, overlay container | a Foundations/Color board is **projected** (`FN.project`, G16 — never `mkAbsBoard`); the `03–09` spec boards, screens and overlays are `storage.mkAbsBoard`/`NL` (approach C), not a group host | see §2 |

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
| Spec-board shelf | `LY.pack({x:80,y:208,w:1760}, widths, { gapX: 32, gapY: 32 })` — wrap at the column edge, never overlap, `out.height` gives the used height |
| Foundations shelf (`FN`, pages 01–02) | two lanes off the same column (`FN.lanes(page)`), advance = `round(h) + gap×2` **exactly** — the page is re-read at the start of every call and `FN.reflow` re-shelves from **live** heights, because a board's height is provisional inside the call that built it (measured: 726 → 1052). `FN.fitRoot` then fits the root. This shelf is not `LY.pack`: `LY.pack` plans from widths known up front, `FN` shelves from heights that only exist after a layout pass |
| Max spec-board width | 1760 (a board wider than the shelf is clamped by `LY.pack`, not allowed to bleed) |
| Screen boards | one per row when the board is ≥ 900 wide (app/content); 4 × 375 boards per row on page 16 (`LY.pack` with `gapX: 24`) |
| Vertical rhythm on a page | **The page root is one band stack** (`Header` → boards → `Footer` are all full-width bands): 48 chrome→content, 32 between spec boards, 32 content→footer — every gap within one `LY.SPACE` step or rule 14 `rhythm_inconsistent` fires. **64** between screen boards (they are the deliverable) |
| Long-board fold marker | any **baseline-width screen/recipe board** ≥ 2000 tall carries `LY.fold(host, tier)`; a `NN-PageRoot` is a canvas (1920 wide), not a screen and carries none — `LY.fold` refuses a root, because its 1440-wide outline annotated empty page space and crossed the header |
| Header / footer | 160 / 80, content starts at y = 208 (header bottom + 48, one step from the 32 board rhythm) |
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
2. **Every screen board carries a fold marker**: `LY.fold(board, tier)` draws the 2px accent viewport outline labelled
   `fold·<tier>` so a reviewer sees what the first screen contains. A **baseline-width** board taller than 2000 without
   one is flagged (a PageRoot is a canvas, not a screen, and carries none).
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
- [ ] **If §2.3 pagination is used**: every chapter page is replaced by `NN.MM · Chapter · Block` pages, one board each,
      `MM` contiguous from 01 inside each chapter; 14/15/16/17 stay grouped; the cover TOC, the `13` index and the
      prototype flows were regenerated **after** the last page add/delete; every flow is named (no `Flow N`); a
      destination readback of `null` on any interaction is a defect, not a formatting quirk.
- [ ] One PageRoot per page with Header/Footer in place, `clipContent=false`, root height = used height (§3).
- [ ] **No empty page**: enumerate `penpot.currentFile.pages` and assert each page's PageRoot has ≥ 1 child board.
      A page-split leaves the old `NN · Chapter` shells behind with an empty root — both auditors pass them (they scope to
      the PageRoot subtree), so the only thing that catches them is this enumeration. Remove them with
      `storage.pg(name).remove()` (there is no `penpot.deletePage`), re-checking `root.children.length` per page inside the loop.
- [ ] Pages 03–09: one `Family·Spec` per family of `CF.map()`, packed by `LY.pack`, names in
      `Family·Type·Size·State·Slot` form, no `/`.
- [ ] Coverage per §4.1: `variant_sparse`, `state_coverage`, `focus_ring_missing`, `disabled_wrong` all **0**.
- [ ] Assembly ownership per §4.3: `loose_assembly` = 0; screens re-call the `CF` factories, never re-draw loose primitives.
- [ ] Tokens: `storage.TK.audit().ok === true` and every name/value pair matches DESIGN.md.
- [ ] **Corners come from the `borderRadius` set and nowhere else**: `radius_off_ladder` (35), `radius_unbound` (36) and
      `ring_off_host` (37) are **0** on every page, and `designNext`'s `out.radius` adoption reads `shapes === onLadder === bound`.
      Repair an existing file with `TK.radiusStart()` + `TK.radiusSweep()` (ladder) until `done: true`, then
      `TK.roleStart()` + `TK.roleSweep()` (role: pill-family hosts and every `ring·*` → its host's corner, masters **and**
      placed copies) until `done: true` — one commit yield per page, see `api-pitfalls.md §17` — then **re-read in dry mode**
      before claiming it. Note what the rules cannot see: a host with **no** corner passes vacuously, and a family DESIGN.md
      does not pin to one step reads CLEAN at the wrong step, so also read the masters (`design-guide.md §5.1`) and re-drive any
      spec board whose host corner contradicts the role its factory declares.
- [ ] **Foundations chapters come from `FN` and can prove it (G16 — the only way those pages are built)**:
      `storage.designCoverage()` reads **CLEAN** (every `FN.CHAPTER` kind projected on some `NN.MM` page of its chapter,
      `missing: []`, `foreign: []`), `await storage.FN.check(page)` reads design CLEAN + layout CLEAN with `unbound: []`
      and `g16: 'CLEAN'`, and each board carries the durable `nl:fn=<kind>` pluginData that rule 31 (`not_projected`)
      reads. `storage.FN.audit()` then lists every kind this session projected with `gate: CLEAN`, `needsRepair: []`,
      `flowBroken: []`. A board produced by a typed height array or a `storage.T` hex mirror is a G16 violation **even
      when it gates CLEAN** — the gate proves the board, the stamp proves the producer (engines.md §7). Only `Icons`
      (01) and `Light vs dark` (02) may be composed, and only because `FN.EXEMPT` says so.
- [ ] Pages 14–16: one board per recipe × selected tier, each sized by `LY` (never by a typed height), each with a
      `fold·` marker; every board audited with its own `{ tier }`.
- [ ] Color scheme implemented as declared (§2.2), including the doubled contrast matrix on 02 when a dark scheme exists.
- [ ] `storage.designGate({ … })` **CLEAN for every page scope in §2**, and `storage.auditPage()` CLEAN for positioning
      (the two auditors are independent: this file's rules say nothing about overlap, and vice versa).
- [ ] **Whitespace is the separation device on every page** (rules 32–34, inside gate G13): `storage.designGate().design.breath`
      reads `onLadder === containers` — every flow gap is a `LY.BREATH` level, not a typed number — and `cramped_gap` / `hierarchy_gap` / `text_cramped` are **0**.
      A finding that survives must be one of the three declared exemptions (attached-control row, repeated run, `FN`-projected state
      board) and must be named as such. Text carries the ramp's declared leading and a wrapped paragraph gets ≥ one line of air
      (design-guide §2.1/§3.2); the repair is `storage.breathe()` — dry-run first, then `{apply:true}`, then re-gate.
- [ ] `export_shape` PNG per page accepted: no 100×100 degradation, no clipping, no offset; CJK renders with Noto Sans SC.
