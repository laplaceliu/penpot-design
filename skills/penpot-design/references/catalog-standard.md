# Standard catalog — the stable 01–09 design-system contract

> The project requirement this file encodes: **pages 01–09 are the same design system across projects.** Brand values
> (colors, fonts, radii, shadow values) remain configurable; the token *capacity*, the page → family inventory, the
> canonical variant/state baseline and the family order do **not**. Pages 10–17 remain free-form; source profiles still
> apply there.

## 1. What is fixed

| Layer | Fixed by | What can change per project |
|---|---|---|
| 01–02 token **capacity** | `CAT.CAPACITY` in `scripts/catalog_engine.js` | values of every token (brand), and the names of the declared tokens as long as the category counts match |
| 03–09 page → family inventory | `CAT.PLAN` (67 families, `CAT.pageFams(page)`; one family belongs to exactly one page) | a profile may change a family's geometry/material (this project kept profile behaviour), so board heights and shelf positions may vary |
| 03–09 canonical rows/axes | `CAT.PLAN` family entries (`rows`, `axes`, `cellH`, `w`, `labelW`, `gapY`) | a new project uses `CAT.buildPage`; source profiles may still alter host geometry |
| 03–09 family **order** on a page | `CAT.PLAN` order; the gate sorts `·Spec` boards by `y` then `x` | board heights/shelf positions may move; the family sequence may not |
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

## 2. Page → family inventory (67)

| Page | Count | Families (canonical order) |
|---|---|---|
| `03 · Actions` | 7 | Button, IconButton, ButtonGroup, SplitButton, FAB, Link, Segmented |
| `04 · Text fields` | 11 | Field, Input, Textarea, Search, Password, MaskedInput, OTP, NumberField, Upload, Transfer, Tree |
| `05 · Selection & pickers` | 11 | Select, Combobox, MultiSelect, DatePicker, TimePicker, Switch, Checkbox, Radio, Slider, Rating, ColorPicker |
| `06 · Data & lists` | 9 | TableHeader, TableRow, TableState, ListItem, Descriptions, Timeline, Accordion, Carousel, MiniCalendar |
| `07 · Display & metrics` | 10 | Badge, StatusText, Chip, Avatar, AvatarGroup, Card, KPI, Progress, Skeleton, EmptyState |
| `08 · Navigation` | 9 | NavItem, Tabs, TabBand, Breadcrumb, Pagination, Steps, Menu, CommandPalette, Anchor |
| `09 · Overlays & feedback` | 10 | Alert, Notification, Toast, Tooltip, Popover, Popconfirm, Modal, Drawer, Spin, Sheet |

The canonical rows/axes are the data in `CAT.PLAN`, not prose. `CAT.pageFams(page)` is the machine-readable list; the
auditor uses the same function, so the document and the gate cannot disagree. **One family belongs to exactly one page**
— `CAT.planIssues()` rejects a family listed twice or on two pages, so a `ColorPicker` cannot live on both 04 and 05.

## 3. Engine API — `scripts/catalog_engine.js` → `storage.CATALOG`

```js
CAT.seed()                       // stamps nl:cat on the OPEN PageRoot; call after scaffold (buildPage stamps its own page)
CAT.hydrate()                    // restores `active` from the durable stamp after a storage wipe
CAT.pageFams(page)               // canonical family names, in order
CAT.planIssues()                 // duplicate family inside a page, or the same family on two pages
CAT.planFor(page)                // canonical family configs (rows/axes/w/cellH/…)
CAT.buildPage({ page, limit: 2 })// CF.matrix per canonical family; registers and binds each board
CAT.tokenDrift(TK.declared())    // capacity drift (colours/types/spaces/radii/shadows/dims/strokes/tones)
CAT.auditFor({ page, root })     // page-scoped findings used by rule 62
CAT.audit()                      // whole-file: token capacity + all seven standard pages
```

Seed order: load `catalog_engine.js` after `component_factory.js` / `native_layout.js`; call `CAT.seed()` **after**
the 18 PageRoots exist. Only the **open** page's shapes accept plugin-data writes in this Penpot build, so `seed()`
stamps the page you are on and `CAT.buildPage` stamps each standard page as it builds it; `nl:cat` is evidence, while
the gate itself reads `storage.CATALOG` (re-seed the engine after a storage wipe). The engine is not a runner at load
time (safe to include in the G1 chain).

New project workflow:

1. `CF.setReference(profile)` if this is a recreation; profiles may change material/geometry but not the catalog.
2. For each of `03`–`09`: call `CAT.buildPage({ page, limit: 2–4 })` until `{done:true}`; then
   `CF.autoRegister({states:true})` is already done per board by the builder.
3. Run `CAT.audit()`; `verdict` must be `CLEAN`.
4. Run the normal `designGate`/`auditPage` acceptance. `catalog_drift` is rule **62**.

## 4. Gate — rule 62 `catalog_drift`

- **01**: `TK.declared().counts` must equal `CAT.CAPACITY` (and the stroke/tone group counts); a missing/extra token is
  reported because it changes the 01/02 layout.
- **03–09**: every canonical family must have exactly one `·Spec` board, in canonical order by `y` then `x`; extra
  `·Spec` families are reported. Board heights/shelf positions are deliberately **not** judged, because the project
  chose to keep profile-driven geometry inside 03–09. `CAT.audit()` also runs `CAT.planIssues()`, so a duplicate
  family on one page or the same family on two pages is caught even when the rendered pages happen to match the plan.
- A page 01–09 whose `storage.CATALOG` is not seeded is **REPORTED**, not passed: load the engine and call `CAT.seed()`.
- `nl:cat` is durable **evidence** of the declared standard, not the engine itself: a plugin storage wipe removes
  `storage.CATALOG`, so reload `catalog_engine.js` (and re-run the normal G1 chain) before auditing; `CAT.hydrate()`
  returns the stamp for the report. The gate never passes on the stamp alone.

Negative control (use once per skill release): add a temporary `Ghost·Spec` board to page 03 and/or delete one canonical
Spec board; `designPage` must report `catalog_drift`; remove/restore and it must read zero.

## 5. Profile policy (this project's choice)

The project kept the source-adaptation profile behaviour: profiles can alter a family's material **and geometry** on
03–09, so a recreation's spec boards can differ in height and shelf position from another project's. The **stable**
contract is the token capacity, family inventory, family order and canonical row/axis baseline; it is what the gate
enforces. If exact board geometry is required in a future project, use `CAT.buildPage` without a geometry-changing
profile; the same engine then yields the same board set and rows.
