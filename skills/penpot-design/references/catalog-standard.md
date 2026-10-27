# Standard catalog — the stable 01–09 design-system contract

> The project requirement this file encodes: **pages 01–09 are the same design system across projects.** Brand values
> (colors, fonts, radii, shadow values) remain configurable; the token *capacity*, the block-page inventory, the
> canonical variant/state baseline and the family order do **not**. Pages 10–17 remain free-form; source profiles still
> apply there.

## 1. What is fixed

| Layer | Fixed by | What can change per project |
|---|---|---|
| 01–02 token **capacity** | `CAT.CAPACITY` in `scripts/catalog_engine.js` | values of every token (brand), and the names of the declared tokens as long as the category counts match |
| 03–09 **block-page inventory** | `CAT.PLAN` + `CAT.BLOCKS` (67 families → 67 pages, `NN.MM · Chapter · Family·Spec`; one family belongs to exactly one page) | a profile may change a family's geometry/material (this project kept profile behaviour), so the board inside a page may vary |
| 03–09 canonical rows/axes | `CAT.PLAN` family entries (`rows`, `axes`, `cellH`, `w`, `labelW`, `gapY`) | a new project uses `CAT.buildPage`; source profiles may still alter host geometry |
| 03–09 family **order** | `CAT.PLAN` order → the `MM` number of each block page | support pages (a `Masters·` board) are allowed between family pages; a family page may not move to another chapter |
| 01–09 durable declaration | each standard PageRoot carries `nl:cat` (`CAT.seed` on the open page, `CAT.buildPage` on every page it builds) | none |
| ≥10 | — | free layout, source adaptation, screens, reference imitation |

### Capacity table (`CAT.CAPACITY`)

| Category | Standard | Why it is fixed |
|---|---|---|
| colours | **57** | the Palette grid row count and the Contrast matrix height |
| typography steps | **12** | the Type ramp board height |
| spacing steps | **14** | the Spacing board height |
| border-radius steps | **9** | the Radius board height |
| shadow recipes | **13** | the Elevation board height |
| dimensions | **2** | at least one dimension token must exist for `TK.declared().ok` |
| border/divider colour roles | **4** | the Strokes & dividers board height |
| semantic tone triples (`X` + `X-ink` + `X-soft`/`X-wash`) | **10** | the Semantic roles board height |

If a project genuinely needs a different capacity, change `CAT.CAPACITY` **and rebuild 01/02**; that is a deliberate
version bump, not a per-task edit. Extra project colours belong on later pages, not in the 01/02 chapter.

## 2. Block-page inventory (67 pages)

**One family = one page.** `CAT.BLOCKS` derives the list from `CAT.PLAN`; `MM` is the 1-based canonical position and
the page suffix is the board name verbatim:

```
03.01 · Actions · Button·Spec
03.02 · Actions · IconButton·Spec
…
09.10 · Overlays & feedback · Sheet·Spec
```

| Chapter | Pages | Families (canonical `MM` order) |
|---|---|---|
| `03 · Actions` | 03.01–03.07 | Button, IconButton, ButtonGroup, SplitButton, FAB, Link, Segmented |
| `04 · Text fields` | 04.01–04.11 | Field, Input, Textarea, Search, Password, MaskedInput, OTP, NumberField, Upload, Transfer, Tree |
| `05 · Selection & pickers` | 05.01–05.11 | Select, Combobox, MultiSelect, DatePicker, TimePicker, Switch, Checkbox, Radio, Slider, Rating, ColorPicker |
| `06 · Data & lists` | 06.01–06.09 | TableHeader, TableRow, TableState, ListItem, Descriptions, Timeline, Accordion, Carousel, MiniCalendar |
| `07 · Display & metrics` | 07.01–07.10 | Badge, StatusText, Chip, Avatar, AvatarGroup, Card, KPI, Progress, Skeleton, EmptyState |
| `08 · Navigation` | 08.01–08.09 | NavItem, Tabs, TabBand, Breadcrumb, Pagination, Steps, Menu, CommandPalette, Anchor |
| `09 · Overlays & feedback` | 09.01–09.10 | Alert, Notification, Toast, Tooltip, Popover, Popconfirm, Modal, Drawer, Spin, Sheet |

The canonical rows/axes are the data in `CAT.PLAN`, not prose. `CAT.pageFams(page)` is the machine-readable list; the
auditor uses the same function, so the document and the gate cannot disagree. **One family belongs to exactly one page**
— `CAT.planIssues()` rejects a family listed twice or on two pages, and `CAT.pageIssues()` rejects a chapter page that
still holds family specs. The page is addressable by the thing it contains: a defect report, a repair call and a human
sentence all name `06.09 · Data & lists · MiniCalendar·Spec`, never "the calendar spec somewhere on page 06".

Support pages are allowed for non-family boards (this file carries `07.11 · Display & metrics · Masters·Chip`); they
must not carry a `Family·Spec` board. Pages 14/15/16/17 never paginate: prototype links are page-local.

## 3. Engine API — `scripts/catalog_engine.js` → `storage.CATALOG`

```js
CAT.seed()                       // stamps nl:cat on the OPEN PageRoot; call after scaffold (buildPage stamps its own page)
CAT.hydrate()                    // restores `active` from the durable stamp after a storage wipe
CAT.BLOCKS                       // 67 {chapter, mm, family, spec, page, fam} entries — the page inventory
CAT.blockFor(page)               // the block entry for `06.09 · Data & lists · MiniCalendar·Spec`
CAT.blockPages()                 // the 67 page names, canonical order
CAT.pageFams(page)               // block page → [family]; legacy chapter page → the chapter list
CAT.pageIssues()                 // file-level pagination gate: missing pages, chapter shells, stray family specs, order
CAT.orderNames([names])          // canonical sequence: 00–02 → 67 block pages (CAT.BLOCKS order) → 10–17
CAT.orderIssues([names])         // reports the first contract page that sits out of that sequence in the pages list
CAT.planIssues()                 // duplicate family inside a page, or the same family on two pages
CAT.planFor(page)                // canonical family configs (rows/axes/w/cellH/…)
CAT.buildPage({ page, limit: 2 })// CF.matrix for that page's ONE family; registers and binds the board
CAT.tokenDrift(TK.declared())    // capacity drift (colours/types/spaces/radii/shadows/dims/strokes/tones)
CAT.auditFor({ page, root })     // page-scoped findings used by rule 62
CAT.audit()                      // whole-file: token capacity + 67 block pages + CAT.pageIssues
```

Seed order: load `catalog_engine.js` after `component_factory.js` / `native_layout.js` and **before**
`scaffold_structure.js` (the scaffold derives its 03–09 rows from `CAT.BLOCKS` and refuses to build the legacy
seven-chapter shape). Call `CAT.seed()` **after** the PageRoots exist. Only the **open** page's shapes accept
plugin-data writes in this Penpot build, so `seed()` stamps the page you are on and `CAT.buildPage` stamps each
standard page as it builds it; `nl:cat` is evidence, while the gate itself reads `storage.CATALOG` (re-seed the
engine after a storage wipe). The engine is not a runner at load time (safe to include in the G1 chain).

New project workflow:

1. `CF.setReference(profile)` if this is a recreation; profiles may change material/geometry but not the catalog.
2. Load `catalog_engine.js`, then run `scripts/scaffold_structure.js` until `{done:true}`. Its default rows are
   `00–02 · 67 block pages · 10–17` (78 pages), each block page with PageRoot/Header/Footer.
3. For each block page (`CAT.blockPages()`): `CAT.buildPage({ page, limit: 2–4 })` until `{done:true}`. It registers,
   binds tokens, runs the **elevation pass** (`EL.hydrate` → `sweepPage` → `adopt` → re-`bindBoard`) and reflows the
   shelf; its `elevation` field reports an `err` when `storage.EL` is absent or has no recipes instead of leaving typed
   shadows behind;
   `CF.autoRegister({states:true})` is already done per board by the builder. The sheet `CF.matrix` produces is **one
   grid** (`grid·<Family>`: measured label column + one data column per state) — rule 72 `spec_not_grid` rejects an
   `axis·` + `row·` fallback, so a page drawn by an older builder is rebuilt, never left in place because "nothing overlaps".
4. Run `CAT.audit()` and `CAT.pageIssues()`; both must be `CLEAN`, and `storage.designCoverage().catalog` must be
   `CLEAN` at delivery.
5. Run the normal `designGate`/`auditPage` acceptance. `catalog_drift` is rule **62**.

### 3.1 Shelf repair — `CAT.reflowPage` (1.0.2)

`CAT.reflowPage({ page })` re-packs every canonical `·Spec` board on the page from its **current measured size**, in
canonical family order (80 / 208, gap 32, max row 1760), moving only boards that are off-shelf. On a block page there
is exactly one board, so it enforces the `(80, 208)` origin and nothing else. It moves the **board only** — Penpot's layout-child coordinates are
parent-relative, so the whole subtree follows; shifting descendants as well double-shifts them (measured 2026-10-26:
a +500 shelf move put every host at +1000). It then re-fits the PageRoot/footer through `FN.fitRoot` when that engine
is live. It is **idempotent**: a correctly packed page reports `moved: 0`.

Why it exists — the stale-shelf class. `CF.matrix` returns an **auto-height** spec. `CAT.buildPage` used to measure the
board and advance the shelf **before** `TK.bindBoard`, but binding rewrites the spec's fallback font/leading to the
declared ramp and the board grows (measured: 100 → 277-2287). Every later board was then placed on the old 100px pitch
(100 + 32 = 132), so the whole page read as a pile of overlapping boards even though each board was internally correct.

The fix is two-sided and both halves are required:
- build order is **bind first, then measure** (`CAT.buildPage` 1.0.2 calls `autoRegister` + `TK.bindBoard`, waits for
  `NL.whenSettled`, then reads `b.width/height`), and
- every `buildPage` ends with `CAT.reflowPage`, so any late growth is re-packed in the same call.

`CF.matrix` (factory 1.0.2) also settles its flex layout before returning and stacks phase-1 hosts vertically, so an
interrupted call leaves a readable column instead of overlapping controls. A sheet whose states do not fit side by side
is **not** allowed to fall back to rows. `CF.matrix` tries two answers, in order, and both are MEASURED:

1. **Fit the specimen.** A table row is a flow CONTAINER — its 735px is the width of the demo table, not the width its
   anatomy needs (`CF.tableRow` derives every column from `o.w`). The builder probes one cell at the natural width, and
   when `colN` of them overflow the canvas it probes again at `floor((canvas − pads − label − gaps) / colN)`. The fit is
   accepted only if the factory HONOURS `w` (a fixed-size control ignores it and comes back at its own width) and no
   copy overruns the narrower host. Then every state stands in one row under the shared axis and stays comparable
   left-to-right — measured 2026-10-26 on `TableRow·Spec`: 5 × 735 (needW 3935) → 5 × 303 in one row, sheet 1760×603
   of wrapped fragments → 1760×280 with one axis row.
2. **Group the ladder.** Only when the probe fails (the anatomy really is that wide — a 360px list item with avatar +
   two lines + trailing action, an accordion, a carousel) does the sheet group — it takes the largest `k < colN` with
`PADX·2 + labelWEff + Σ group widths + (k−1)·GAPC ≤ canvas`, wraps whole state groups into extra grid rows, spans the
variant label over the whole group block, and names every group with its own caption row directly above the cells it
labels. `groups === 1` is never reachable: one measure (`groupNeed(colN) ≤ canvas`) decides both branches, so a sheet
that fits prints the state names once on the axis, not once per variant. Measured 2026-10-26 on `Accordion·Spec`
(5 × 360px = 2060 > 1760): the old wrap row stacked two cells per line and left a 112px axis pitch naming 360px
columns, so nothing lined up.
 A partial matrix with no `grid·`/`row·`/
`axis·` child is **reported** by `buildPage` (`partial: [...]`) and never shelved; rebuild that family (or split it with
`CF.matrixPlan`) instead of continuing.

## 4. Gate — rule 62 `catalog_drift` + file-level `CAT.pageIssues`

- **01**: `TK.declared().counts` must equal `CAT.CAPACITY` (and the stroke/tone group counts); a missing/extra token is
  reported because it changes the 01/02 layout.
- **03–09, page scope**: a block page must hold **exactly one** `Family·Spec` board, and the board and page suffix must
  both name the family (`CAT.auditFor`). A chapter page that still carries `·Spec` boards is reported as the
  pre-pagination shape, not passed. A support page may carry no family spec; a stray family spec on it is reported.
  Board heights/material are deliberately **not** judged, because the project chose to keep profile-driven geometry.
- **03–09, file scope**: `CAT.pageIssues()` enumerates all 67 `CAT.BLOCKS` pages and reports missing pages, chapter
  shells left behind, and stray family specs. `storage.designCoverage().catalog` merges this into the delivery verdict,
  so a per-page audit cannot pass a file that is missing `06.09 · … · MiniCalendar·Spec`.
- **Sequence scope**: `CAT.orderIssues()` checks the pages-list ORDER of the contract pages — `00–02`, then the 67 block
  pages in `CAT.BLOCKS` order, then `10–17`. This is the only half of the contract no per-page audit can see: a page is
  created at the END of the list (`penpot.createPage()` has no position argument) and the plugin API exposes no
  page-move call, so a re-paginated or hand-dragged file silently drifts while every page-scoped gate still reads CLEAN.
  Extra support pages (a `Masters·` page) are outside the sequence and may sit anywhere.
- A page 01–09 whose `storage.CATALOG` is not seeded is **REPORTED**, not passed: load the engine and call `CAT.seed()`.
- `nl:cat` is durable **evidence** of the declared standard, not the engine itself: a plugin storage wipe removes
  `storage.CATALOG`, so reload `catalog_engine.js` (and re-run the normal G1 chain) before auditing; `CAT.hydrate()`
  returns the stamp for the report. The gate never passes on the stamp alone.

Negative control (use once per skill release): add a second `·Spec` to an existing block page and/or delete one block
page; `designPage` / `designCoverage` must report `catalog_drift` (page scope) and a missing page (file scope);
remove/restore and both must read zero. For the order half, feed `CAT.orderIssues()` a copy of the live page names with
two contract pages swapped — it must report exactly one drift; the unmodified list must read zero. It takes a name
array so the control never has to touch the file.

## 5. Profile policy (this project's choice)

The project kept the source-adaptation profile behaviour: profiles can alter a family's material **and geometry** on
03–09, so a recreation's spec boards can differ in height and shelf position from another project's. The **stable**
contract is the token capacity, family inventory, family order and canonical row/axis baseline; it is what the gate
enforces. If exact board geometry is required in a future project, use `CAT.buildPage` without a geometry-changing
profile; the same engine then yields the same board set and rows.
