# Codesign-ui catalog — the 1:1 01–09/18 design-system contract

> The project requirement this file encodes: **the design system's component inventory is the host component
> library's inventory.** `01`–`02` keep the same token capacity across projects; `03`–`09` + `18` are the 125 visual
> codesign-ui components (56 visual Layer-1 primitives + 36 screen-kit components in `03`–`09`, 33 Layer-2 AI composites in `18`; the 6 behaviour-only primitives are indexed on `13`); the 6
> behaviour-only primitives are indexed on `13` with no master. Brand token values remain configurable; the
> component inventory, page inventory and page order do not.

## 1. What is fixed

| Layer | Fixed by | What can change per project |
|---|---|---|
| 01–02 token **capacity** | `CAT.CAPACITY` in `scripts/catalog_engine.js` | values of every token (brand), and the names of the declared tokens as long as the category counts match |
| 03–09 + 18 **block-page inventory** | `CAT.LIBRARY` → `CAT.PLAN` → `CAT.BLOCKS` (125 visual components → 125 pages, `NN.MM · Chapter · Family·Spec`; one component belongs to exactly one page) | a profile may change a component's geometry/material (the project kept profile behaviour), so the board inside a page may vary |
| 13 **index** | `LM.audit()` + `LM.indexPage()` | the 6 non-visual primitives are listed there; they have no master |
| 03–09 + 18 **component order** | `CAT.LIBRARY[].order` → the `MM` number of each block page | support pages (a `Masters·` board) are allowed between family pages; a component page may not move to another chapter |
| 01–09/18 durable declaration | each standard PageRoot carries `nl:cat` (`CAT.seed` on the open page, `CAT.buildPage` on every page it builds) | none |
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
version bump, not a per-task edit.

## 2. Block-page inventory (125 visual pages + 6 index rows)

**One component = one page.** `CAT.BLOCKS` derives the list from `CAT.LIBRARY`; `MM` is the 1-based canonical
position and the page suffix is the board name verbatim:

```
03.01 · Actions · Clipboard·Spec
…
09.08 · Overlays & feedback · Tour·Spec
18.01 · AI & agents · Conversation·Spec
…
18.33 · AI & agents · Shimmer·Spec
```

`13 · Component index` lists the 6 behaviour-only primitives — `ClientOnly`, `Collection`, `FocusTrap`, `Format`,
`Portal`, `Presence` — with no master.

| Chapter | Pages | Components (canonical `MM` order) |
|---|---|---|
| `03 · Actions` | 03.01–03.10 | Button, IconButton, ButtonGroup, SplitButton, FAB, Link, Clipboard, DownloadTrigger, Toggle, ToggleGroup |
| `04 · Text fields` | 04.01–04.16 | Input, Textarea, Search, MaskedInput, Transfer, AngleSlider, DateInput, Editable, Field, Fieldset, FileUpload, NumberInput, PasswordInput, PinInput, SignaturePad, TagsInput |
| `05 · Selection & pickers` | 05.01–05.11 | Checkbox, ColorPicker, Combobox, DatePicker, TimePicker, RadioGroup, RatingGroup, SegmentGroup, Select, Slider, Switch |
| `06 · Data & lists` | 06.01–06.11 | TableHeader, TableRow, TableState, ListItem, Descriptions, Timeline, MiniCalendar, Carousel, JsonTreeView, Listbox, TreeView |
| `07 · Display & media` | 07.01–07.19 | Badge, StatusText, Chip, AvatarGroup, Card, KPI, Skeleton, EmptyState, Avatar, Frame, Highlight, ImageCropper, Marquee, Progress, QrCode, ScrollArea, Splitter, Swap, Timer |
| `08 · Navigation` | 08.01–08.12 | NavItem, TabBand, Breadcrumb, CommandPalette, Accordion, Collapsible, Menu, NavigationMenu, Pagination, Steps, Tabs, Toc |
| `09 · Overlays & feedback` | 09.01–09.13 | Alert, Notification, Popconfirm, Spin, Sheet, Dialog, Drawer, FloatingPanel, HoverCard, Popover, Toast, Tooltip, Tour |
| `18 · AI & agents` | 18.01–18.33 | Conversation, Message, PromptInput, ModelSelector, Attachments, Suggestion, Sources, InlineCitation, Reasoning, ChainOfThought, Plan, Tool, Task, Queue, Confirmation, Question, Agent, Artifact, CodeBlock, Snippet, Terminal, Sandbox, WebPreview, JSXPreview, SchemaDisplay, EnvironmentVariables, PackageInfo, Commit, Checkpoint, Context, StackTrace, TestResults, Shimmer |

The canonical order is the data in `CAT.LIBRARY`, not prose. `CAT.pageFams(page)` is the machine-readable list; the
auditor uses the same function, so the document and the gate cannot disagree. **One component belongs to exactly one
page** — `CAT.planIssues()` rejects a component listed twice or on two pages, and `CAT.pageIssues()` rejects a
chapter page that still holds component specs. The page is addressable by the thing it contains: a defect report, a
repair call and a human sentence all name `18.02 · AI & agents · Message·Spec`, never "the message spec somewhere on
page 18".

Support pages are allowed for non-family boards; they must not carry a `Family·Spec` board. Pages 14/15/16/17 never
paginate: prototype links are page-local. The AI chapter is appended after 17 so the existing 10–17 contract keeps
its numbers.

## 3. Engine API — `scripts/catalog_engine.js` → `storage.CATALOG`

```js
CAT.LIBRARY                      // 131 codesign-ui entries {designFamily,page,order,group,factory,kind,parts,states,layer}
CAT.INVENTORY                    // { name:'codesign-ui', components:131, visual:125, nonVisual:6, pages:125 }
CAT.BLOCKS                       // 125 {chapter, mm, family, spec, page, fam} entries — the page inventory
CAT.blockFor(page)               // the block entry for `06.04 · Data & lists · TreeView·Spec`
CAT.blockPages()                 // the 125 page names, canonical order
CAT.pageFams(page)               // block page → [family]; legacy chapter page → the chapter list
CAT.pageIssues()                 // file-level pagination gate: missing pages, chapter shells, stray family specs, order
CAT.orderNames([names])          // canonical sequence: 00–02 → 03–09 blocks → 10–17 → 18 AI blocks
CAT.orderIssues([names])         // reports the first contract page that sits out of that sequence in the pages list
CAT.planIssues()                 // duplicate family inside a page, or the same family on two pages
CAT.planFor(page)                // canonical component configs (states/parts/factory)
CAT.buildPage({ page, limit: 1 })// LM.buildPage for that page's ONE component (mapped factory or custom anatomy)
CAT.tokenDrift(TK.declared())    // capacity drift (colours/types/spaces/radii/shadows/dims/strokes/tones)
CAT.auditFor({ page, root })     // page-scoped findings used by rule 62
CAT.audit()                      // whole-file: token capacity + 125 block pages + CAT.pageIssues
```

Seed order: load `library_engine.js` after `component_factory.js`/`native_layout.js`, load the manifest
(`LM.load(assets/libraries/codesign-ui.json)` or `LM.hydrate()`), then load `catalog_engine.js` **before**
`scaffold_structure.js` (the scaffold derives its 03–09 + 18 rows from `CAT.BLOCKS`). Call `CAT.seed()` **after** the
PageRoots exist. Only the **open** page's shapes accept plugin-data writes in this Penpot build, so `seed()` stamps
the page you are on and `CAT.buildPage` stamps each standard page as it builds it; `nl:cat` is evidence, while the
gate itself reads `storage.CATALOG` (re-seed the engine after a storage wipe). The engine is not a runner at load
time (safe to include in the G1 chain).

New project workflow:

1. `CF.setReference(profile)` if this is a recreation; profiles may change material/geometry but not the catalog.
2. Load `library_engine.js` + `LM.load(codesign-ui.json)` (or `LM.hydrate()` from a PageRoot), then load
   `catalog_engine.js`, then run `scripts/scaffold_structure.js` until `{done:true}`. Its default rows are
   `00–02 · 92 component block pages (56 visual primitives + 36 screen kit) · 10–17 · 33 AI block pages` (136 pages), each block page with
   PageRoot/Header/Footer.
3. For each block page (`CAT.blockPages()`): `CAT.buildPage({ page, limit: 1 })` until `{done:true}`. It calls
   `LM.buildPage` (mapped factory → one representative; `custom` → an anatomy board), `LM.finish` binds tokens and
   elevation, and `CAT.reflowPage` repacks the shelf. Without `LM` the build refuses — the paired manifest is the only legal path.
4. Run `CAT.audit()` and `CAT.pageIssues()`; both must be `CLEAN`, and `storage.designCoverage().catalog` must be
   `CLEAN` at delivery.
5. Run the normal `designGate`/`auditPage` acceptance. `catalog_drift` is rule **62**; `library_drift` is rule **61**.

### 3.1 Shelf repair — `CAT.reflowPage`

`CAT.reflowPage({ page })` re-packs every canonical `·Spec` board on the page from its **current measured size**, in
canonical family order (80 / 208, gap 32, max row 1760), moving only boards that are off-shelf. On a block page there
is exactly one board, so it enforces the `(80, 208)` origin and nothing else. It moves the **board only** — Penpot's
layout-child coordinates are parent-relative, so the whole subtree follows; shifting descendants as well double-shifts
them (measured 2026-10-26: a +500 shelf move put every host at +1000). It then re-fits the PageRoot/footer through
`FN.fitRoot` when that engine is live. It is **idempotent**: a correctly packed page reports `moved: 0`.

## 4. Gate — rule 62 `catalog_drift` + rule 61 `library_drift`

- **01**: `TK.declared().counts` must equal `CAT.CAPACITY` (and the stroke/tone group counts); a missing/extra token is
  reported because it changes the 01/02 layout.
- **03–09 + 18, page scope**: a block page must hold **exactly one** `Family·Spec` board, and the board and page suffix
  must both name the component (`CAT.auditFor`). A chapter page that still carries `·Spec` boards is reported as the
  pre-pagination shape, not passed. A support page may carry no family spec; a stray family spec on it is reported.
  Board heights/material are deliberately **not** judged, because the project chose to keep profile-driven geometry.
- **03–09 + 18, file scope**: `CAT.pageIssues()` enumerates all 125 `CAT.BLOCKS` pages and reports missing pages,
  chapter shells left behind, and stray family specs. `storage.designCoverage().catalog` merges this into the delivery
  verdict.
- **Sequence scope**: `CAT.orderIssues()` checks the pages-list ORDER — `00–02`, then the 03–09 block pages, then
  `10–17`, then the 18 AI block pages. This is the only half of the contract no per-page audit can see: a page is
  created at the END of the list and the plugin API exposes no page-move call, so a re-paginated or hand-dragged file
  silently drifts while every page-scoped gate still reads CLEAN. Extra support pages (a `Masters·` page) are outside
  the sequence and may sit anywhere.
- **Paired library**: `library_drift` (rule 61) compares the live masters against the manifest on page 13; every
  visual component must have a master whose head is its `designFamily` or one of its parts, and every library master
  must map to a manifest component or part. Missing and extra both fail. `LM.audit()` is the read-side verdict.
- **Coverage check**: `scripts/inventory_library.py --check --catalog scripts/catalog_engine.js` is the source-tree
  gate. It scans `src/components` + `src/ai`, compares the 95 directories to the manifest and `CAT.LIBRARY`, and exits
  non-zero on a missing/extra component, a duplicate family, a page/order collision, or a visual/non-visual mismatch.
- A page 01–09/18 whose `storage.CATALOG` is not seeded is **REPORTED**, not passed.

Negative control (use once per skill release): add a second `·Spec` to an existing block page and/or delete one block
page; `designPage` / `designCoverage` must report `catalog_drift` (page scope) and a missing page (file scope);
remove/restore and both must read zero. For the paired half, delete one component master; `LM.audit()` must name it.
For the source-tree half, add a directory under `src/components` without a mapping; the coverage check must fail.

## 5. Profile policy

The project kept the source-adaptation profile behaviour: profiles can alter a component's material **and geometry**,
so a recreation's spec boards can differ in height and shelf position from another project's. The **stable** contract
is the token capacity, component inventory, component order and the paired manifest; it is what the gate enforces.
The inventory is generated from the host library, never typed by hand:

```bash
python3 scripts/inventory_library.py \
  --package refs/codesign-ui/packages/react \
  --name codesign-ui \
  --mapping assets/libraries/codesign-ui.map.json \
  --out assets/libraries/codesign-ui.json \
  --md references/libraries/codesign-ui.md

python3 scripts/inventory_library.py \
  --package refs/codesign-ui/packages/react \
  --name codesign-ui \
  --mapping assets/libraries/codesign-ui.map.json \
  --out assets/libraries/codesign-ui.json \
  --check --catalog scripts/catalog_engine.js

# after a library change — regenerate CAT.LIBRARY from the manifest, then re-check
python3 scripts/inventory_library.py \
  --package refs/codesign-ui/packages/react \
  --name codesign-ui \
  --mapping assets/libraries/codesign-ui.map.json \
  --out assets/libraries/codesign-ui.json \
  --sync-catalog scripts/catalog_engine.js
```
