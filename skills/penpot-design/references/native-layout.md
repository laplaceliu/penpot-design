# Native auto-layout — authoring with `storage.NL`

Companion to `scripts/native_layout.js`; every claim here is a row in `penpot-capabilities.md` §0–§4, measured in the
connected build. Read that file first if a behaviour surprises you.

This engine exists because the old verdict ("flex is uncontrollable, use absolute") was **three naming/measurement bugs**,
not a platform limit. Absolute placement is still correct in some places, so the skill now has four authoring layers with a
hard division of labour:

| Layer | Owns | Coordinates | Why it cannot be replaced |
|---|---|---|---|
| `storage.LY` | the region **plan** — which boxes exist, at what size | pure math, no shapes (except `drawStart/drawStep`) | reproducibility: a typed coordinate is a defect (gate **G11**) |
| `storage.CF` | one **control**, every variant/state | absolute *inside its own host*, by design | pixel-exact internals (underline, hit pad, ring) that flow cannot express |
| `storage.NL` | the **flow** of a screen: padding, gap, sizing, grid | native flex/grid, no coordinates at all below the region level | editability: a designer changing copy re-wraps the row instead of breaking the rhythm |
| `storage.mkAbsBoard`/`absMount` | the `03–09` spec boards, art, pixel-exact overlays — **never a `01.xx`/`02.xx` board**, those are `FN.project` projections (G16) | world coordinates, `layoutChild.absolute = true` | some things are drawings, not layouts |

**A delivered screen is `LY` outside + `NL` inside + `CF` leaves.** Getting only one of the three is what produced the
pre-NL deliverables: correct pixels, uneditable file.

## 1. Seeding and call shape

```
seed_storage.js → layout_engine.js → component_factory.js → native_layout.js → audit_design.js
```

`native_layout.js` refuses to seed without `storage.mkText` and reads `storage.LY` / `storage.CF` at call time
(`fromRecipe` needs LY; `frame({shadow})` needs CF), so a partial seed degrades instead of throwing.

**Re-seed ≠ re-bind.** A long build script that captured `var p = storage.R0.p` (or `R0.l2`, `R0.CF`) keeps the **old engine
object** after a later seed replaces `storage.CF` / `storage.LY` / `storage.NL`. The symptom is a fix that is present in the
source but absent in the output ("I fixed the factory, rebuilt, nothing changed"). Build scripts must refresh
`storage.R0.p` (or read `storage.CF` at each call) after any re-seed; a stale snapshot is not a cache, it is a fork.

Build → settle → measure in **one** call, because the harness awaits a returned Promise:

```js
return (async () => {
  const r = NL.fromRecipe('dash3', { w: 1440, parent: host });
  await NL.whenSettled(host);            // polls the stale fingerprint, instead of guessing a sleep length
  return NL.auditFlow(host);
})();
```

`NL.settle(ms)` is a sleep, nothing more — 900 ms settled a 2-level tree, a 3-level nested tree was still stale at
1200 ms, so prefer **`NL.whenSettled(board,{tries,step})`**: it waits until the "child still at doc 0,0" fingerprint
disappears (measured: returned `settled:true` after one 400 ms poll for a settled tree, and `not_settled` kept being
reported for a 3-level tree at 1500 ms until the next call). `settleDeep()` (2000 ms) is the fallback when you cannot
afford a second call. **Never** return an object *containing* a Promise (`structuredClone` fails); return the Promise or
a plain value. Budget the sleep against the ~30 s call timeout: a settle inside a build call is fine, five settles in a
loop is not (that call timed out, and the tree it had already built stayed half-repaired).

One exception to "one call is enough": a **recompute** the engine has to re-run — re-declaring `fill` after a
`resize()` — only becomes visible in a **later call** (§7, R5). Write in one call, verify in the next.

## 2. Seven vocabulary rules (R1–R7)

| Rule | The measured fact | What `NL` does about it |
|---|---|---|
| **R1** | flex exposes `topPadding / rightPadding / bottomPadding / leftPadding / verticalPadding / horizontalPadding` — **not** the `paddingTop…` names in `@penpot/plugin-types`. Wrong names either do nothing or land as junk own-properties that "read back" the value you wrote. | `applyFlex` whitelists the 16 measured keys, aliases the `paddingTop…` family, and **returns `{applied, rejected}`**. `rejected` is stored per board and surfaces in `auditFlow` as `flex_rejected`. `pad` accepts `{pad:24}`, `{x,y}`, `{t,r,b,l}` and `{top,right,bottom,left}`; anything else is rejected, never silently dropped |
| **R2** | `layoutChild` is `null` until the shape is appended **and** the parent has flex/grid. Writing the container's own `horizontalSizing` after a child's `layoutChild.horizontalSizing` normalizes the child back. | `NL.frame` writes flex first and mounts last; `NL.add(parent, child, h, v)` appends then declares sizing. `NL.sizing` returns `{err}` when `layoutChild` is null instead of throwing |
| **R3** | geometry reads are transitional until the layout engine settles; an unsettled tree parks every flow child at doc (0,0) with its creation width | `whenSettled()` polls the fingerprint; `auditFlow` reports **`not_settled`** for that board and suppresses every geometry expectation instead of emitting a cascade of wrong findings; for anything that ships, **export** — the render is the referee |
| **R4** | `grid.appendChild(child, row, column)` is **1-based**, and `0` / out-of-range silently clamps to cell 1/1. An **absolute** layout child also keeps that flag through the append, and the platform then ignores (row,col) and auto-places it from the first free cell. | `NL.cell` validates against the track counts, **clears `layoutChild.absolute` BEFORE the append**, and refuses with the grid size in the message; `NL.cellAuto` is the no-index path. The ordering bug measured 2026-10-26: `CF.matrix`'s axis texts entered the grid absolute, landed in cells 1..n while the slots held 2..n+1, and the whole state row read one column left (rule 64 `axis_column_off`) |
| **R5** | **`shape.resize()` on a flow child downgrades its declared sizing to `fix`** (a 252 px `fill` child resized to 70 reads `fix/fix`). Silent — the pixels look fine, the editability is gone. | `NL.sizing` records what it was asked to declare; `auditFlow` compares that against the readback and reports **`sizing_dropped`**. Declare sizing **after the last resize**; `NL.nudge()` is the repair (and re-declares the *parent's* sizing too, because the nudge resizes the parent) |
| **R6** | `fill` is two different numbers: **cross axis** = the parent's content box; **main axis** = the free space left by the non-filling flow siblings (row content 552 − 160 sibling − 16 gap = **376**). A main-axis `fill` child also **un-hugs** its `auto` parent back to `fix`. | `auditFlow` computes the expectation per axis and prints its arithmetic in the finding; `NL.sizing` returns `warn:'hug_defeat'` at write time; `main_axis_overflow` names the case where the fixed siblings already exceed the content box (the fill child then computes **0** and the board overflows) |
| **R7** | a flex container with **no** gap declared renders its children **touching** (`rowGap`/`columnGap` default to `0`). Silence is not neutrality: "I did not decide the spacing" and "these two blocks must touch" are the same pixels. | `NL.frame(name, {breath:'block'})` resolves the gap from `LY.BREATH[level]` at the board's tier (layout-library §1.1), so the default separation device is **authored whitespace**, and the ladder is the same table `designGate` judges against — a declared `breath` can never fire `off_scale_gap` or `cramped_gap` (rules 32/33). An explicit `gap` still wins, because control anatomy is tight by contract (`inline` 8: icon↔label) |

## 3. Sizing: what to declare where

| You want | Declare | Measured |
|---|---|---|
| a container that keeps its authored box | `sizing:'fix'` on the frame | 160×52 button stays 160×52 inside a flow parent (the historic "collapses to text" was `horizontalSizing='fixed'`, an invalid value) |
| a container that hugs its children | `sizing:'auto'`, or per axis `sizing:{h:'fix', v:'auto'}` | column of 3×52 + 2×16 + 2×24 padding grew 188 → 236; a `NL.col(w:300,h:10,{v:'auto'})` with two 52 rows hugged to **168** = 24+52+16+52+24 |
| a child that spans the parent's content box | `fill` on the **cross** axis (`NL.add(col, child, 'fill', 'fix')`) | nested board → 400; rect → 752 = 800 − 2×24; in a 600/pad-24 column → **552** |
| a child that takes the **remaining space in a row** | `fill` on the **main** axis (`NL.add(row, child, 'fill', 'fix')`) | **376**, not 552: content 552 − one 160 sibling − 16 gap. Two filling siblings split that remainder evenly |
| a child that keeps a fixed size inside flow | `NL.fix(child, w, h)` (resize **then** declare) | width/height preserved exactly |
| a child off one axis only | `NL.alignSelf(child,'end')` | `end` parked it at boardX 656 in an 800-wide parent |
| a pixel-exact overlay on a flow board | `NL.mount(parent, child, {absolute:{x,y}})` | escapes flow; x/y then read as **doc-absolute**; absolute children take no space, so they are excluded from the fill budget |

Six traps, each measured:

1. `verticalSizing:'fill'` inside an **auto-height** parent computes height **0** — and worse, it *silently flips the
   parent's own `verticalSizing` from `auto` to `fix`, so the board keeps whatever height `resize()` last gave it
   (measured: declared `h:10`, children needed 168, content became **−38**). Never fill the parent's hug axis.
2. `rowGap` is the gap **between** children; a hug container's height is `padT + Σh + (n−1)·gap + padB` — that arithmetic
   is what `auditFlow` re-derives, so a hand-moved child shows up as `stale_or_manual_gap`.
3. A rect child has no own sizing accessor (`rect.horizontalSizing` reads `undefined`); read `layoutChild`. For a **board**
   the two are the same value — `layoutChild` is still the one to read.
4. `alignItems:'stretch'` + child own `fix` → the child keeps 160. The child's own declaration wins over the parent's
   stretch; there is no "force full width" except `layoutChild.horizontalSizing = 'fill'`.
5. **Any `resize()` after declaring sizing downgrades that sizing to `fix`** (R5). This includes a `resize()` you do to
   *make* the child fit — `NL.fix()` gets it right only because it resizes first and declares last.
6. A "nudge" is not free: resizing the **parent** to force a recompute downgrades **the parent's** own sizing exactly the
   same way. `NL.nudge()` re-declares it from the recorded intent; a hand-rolled nudge will not.

## 4. The screen build order

> **On a recreation (the user supplied a URL / screenshots / a library tree), this section is the *inside* of `SC.build`,
> not the entry point.** Call `SC.record(…)` then `SC.build({page, screen})` (`engines.md` §8, gate **G17**): it performs
> the `fromRecipe` + `LY.guides` calls below, **places controls as library instances** rather than drawing them, carries the
> library type style on copy, fills raster slots with the user's own asset (`MD.place`), binds tokens, and stamps the record
> into the board so the gate can be re-read later. Hand-running the snippet below on a screen page yields
> `not_assembled` (39) / `placeholder_media` (40) / `no_source_record` (41) findings.

```js
// one call, one region-level skeleton. `host` = the page board LY already sized.
// No gap typed: fromRecipe takes `block` (16) for the region stack and `group` (24) for its padding from LY.BREATH.
// Pass `breath: 'section'` to move a whole page one level up, or `gap:` / `regionPad:` only when the number is a
// deliberate exception the auditor has to be told about.
const sk = NL.fromRecipe('dash3', { w: 1440, h, tier: 'web', parent: host, fill: null });
// sk.regions = { nav: Board, toolbar: Board, content: Board, … } — each is a flow board at its LY rect
LY.guides(host, { tier: 'web' });   // native 12-col guides from LY.TIERS (margin 32, gutter 24), not invisible rects
```

`NL.fromRecipe(key, o)` also accepts **band recipes** (`landing`, `blogArticle`, …): app recipes carry `regions`
(world boxes resolved through `LY.rect`), document/band recipes carry `bands` (frame-relative, offset by `LY._ofs`
here). Both come back as `sk.regions` (band-style plans also expose `sk.bands`), and a plan with neither is an
**error** — the previous behaviour of returning an empty skeleton with `err:null` for every band recipe was a silent
no-op (measured: `fromRecipe('landing', …)` returned `{keys: []}` before the fix).

Measured (a 4-region `fromRecipe` on a 1440×900 host at `x0:400, y0:2000`): the four region boards landed at exactly
the rects `LY.rect` handed back (`rail 72×900 @400,2000`, `header 1368×56 @472,2000`, `list 320×844 @472,2056`,
`detail 1048×844 @792,2056`), each `layoutChild.absolute = true`, each `dir:column` with `pad 24/24` and `gap 16`, all
four stamped `{recipe, region, tier}` in the file. Content added inside `detail` settled at one `whenSettled` poll
(title width 1000 = 1048 − 48, second child `py64` = 24 + 24 + 16) and **`NL.auditFlow(host)` returned `CLEAN`**.
*Honest scope:* the LY side of that run used a faithful **contract stub** (`recipe → {regions,tier,frame,notes}`,
`rect(path) → world box`, `LY._plan` + `LY._ofs`) because `layout_engine.js` is 60 KB and needs its own seed call; the
real LY↔NL integration runs in the demo-file sessions. Everything else in the run — `frame`, mounts, `stamp`, flow, audit —
was the real engine path.

`NL.fromRecipe` resolves `storage.LY` **at call time**, so NL may be seeded before LY — this was fixed only after an
earlier build captured `const LY = storage.LY || null` at seed time and threw
`Cannot read properties of null (reading 'recipe')` when LY arrived later. If you ever see that message from
`fromRecipe`, the file predates the fix.

Then fill, in batches (`await NL.whenSettled(host)` at the end of each batch, never between children):

```js
const cell = await CF.button({ label: 'Deploy', type: 'primary', size: 'md', parent: sk.regions.actions });
NL.add(sk.regions.actions, cell, 'fix', 'fix');          // CONTROL hosts keep their authored box — see the sizing note
const inst = CF.instance(CF.name('Button', { type: 'primary', size: 'md' }),
                         { parent: sk.regions.list, text: 'Publish' });   // reuse instead of re-drawing (C2)
NL.add(sk.regions.list, NL.line(sk.regions.list, 'row·1', { w: 328, gap: 12 }, [
  { label: 'Quarterly report.pdf', size: 14, weight: 600 },
  { label: 'PDF · 2.1 MB', size: 12, color: storage.T.secondary, h: 'auto' },
]), 'fill', 'auto');
```

**The sizing idiom for a host board in flow, measured:** a board's `auto` means **hug**, so `'auto'/'auto'` on a
control collapses it — a 160×52 button whose label is in flow became **30×17**, and an instance of a flow-interior main
became **41×17**. Declare **`'fix'/'fix'`** for controls and instances (that is what `CF.instance` does by default),
`'fill'` on the cross axis only when the control must stretch, and `'auto'` for text (`NL.label`). An absolute-interior
host *happens* to survive `auto` because hug has nothing to measure — not a contract.

Ordering rules that matter in practice:

* **`LY` outside, `NL` inside.** A 2-D region plan (rail + header + content) is not one flex axis, so `fromRecipe` mounts
  region boards **absolute** at their LY rects and gives each a flex interior. `auditFlow` knows this: engine-declared
  absolutes are descended into, not reported (pass `{strict:true}` to see them).
* **Fill a region before declaring the region `auto`.** A hug parent + `fill` child is trap 1 — and the parent does not
  just fail to hug, it silently stops being a hug board at all (R6).
* **Join flow last.** `CF` hosts resize themselves while building (`ctx.place()` centres and clamps), so
  `NL.add(parent, cfHost, …)` must run **after** the `await CF.*` resolves — declaring `fill` and then letting the
  factory resize the host downgrades the sizing back to `fix` (R5), which is the exact bug the audit reports as
  `sizing_dropped`.
* **A drawing host joins flow whole, never piece by piece.** `CF` interiors are absolute by design (§9); `NL.add` the
  **host** and leave its children alone. Trying to flow a control's plate/label individually rebuilds the control's own
  geometry with the wrong owner — the measured case is a board that carried one child at absolute and one in flow, which
  `auditFlow` reports as `absolute_child`.
* **Fill leaves, not panes.** `fromRecipe` returns both panes (`content`, `main`, `readingPane`, `container`) and their
  leaf regions. A pane is structure — filling it with copy draws the text underneath every child region (the defect S8b
  and `pane_filled` were added for). Fill `LY.leaves(plan.regions)`; a pane gets a background, never content.
* **Reserve `CF.lineH(fs)`, not `fs`, for every text line.** A 14px body line renders ~21px (leading 1.5); reserving 14 and
  stepping 14+6 is how stacked buttons, step items and accordion bodies grew past their host and overlapped the next row
  (S14). The same arithmetic governs `labelH`, `helpH` and a wrapped-body line count.
* **Text goes in through `NL.label`** (which is `storage.mkText`, so the CJK/display-font routing stays in one place) and
  is declared `'auto'/'auto'` — never hand-place a flow label; that is what makes it re-wrap.
* **Stamp the provenance** (`NL.stamp(board, {recipe, tier, region})`) so the audit is re-runnable by whoever opens the
  file, not only by this session.

## 5. Grid

```js
const g = NL.gridFrame('card-grid', { w: 1152, h: 720,
  cols: [['flex', 1], ['flex', 1], ['flex', 1], ['fixed', 240]],
  rows: [['auto'], ['fixed', 160]], gap: 24, pad: { x: 0, y: 24 }, parent: sk.regions.content });
NL.cell(g, cardA, 1, 1, { row: 2 });      // **1-based**; spans only after placement
NL.cell(g, cardB, 1, 2);
```

Track types are `flex | fixed | percent | auto` (`fr`, `percentage`, `minmax` are rejected). Cells are positioned by the
engine — on a 1200-wide board with `flex 1 / fixed 200 / percent 50` + 24 padding they settled at x = 24 / 616 / 976;
**do not hand-place them**, and read `layoutCell.row/column` only after a settle.

## 6. Construction aids that belong in the file

| Aid | Call | Note |
|---|---|---|
| column grid | `NL.guide(board, {cols, margin, gutter, color, opacity, fillType, display})` | native guides round-trip; the official guidance is "not with invisible rectangles" |
| ruler guide | `NL.rulerGuide(boardOrPage, 120, 'vertical', '#2563EB')` | also on `Page`; remove with `removeRulerGuide(g)` |
| hide aids in presentation | `board.showInViewMode = false` | together with the flow (capabilities §8) this makes the file presentable |
| crop | `NL.frame(…, {clip: true})` | half stars, avatars, cover media |
| provenance | `NL.stamp` / `NL.readStamp` | lives **in the file** (pluginData), survives storage loss |

## 7. `auditFlow` — what each signature means and how to repair it

`NL.auditFlow(board, depth, o)` is read-only. It walks the tree, re-derives the flex arithmetic, and compares it to what
the engine declared at build time (`NL._reg`, keyed by shape id — shape proxies are **not extensible**, so nothing is
stuck on the shapes themselves).

**What is deliberately *not* judged**, because each of these used to produce confident-looking false findings:

| Container | Why it is walked through | Measured case |
|---|---|---|
| a **group** (SVG import, `penpot.group` assembly) | coordinates, not layout — its children have no `layoutChild` *by nature* | an imported icon inside a flow row reported `no_layoutChild` ×3 + `no_flow_children` |
| a **component copy** | a mirror; the master is judged at its own site | an instance's interior would report the master's every absolute child twice |
| a **board without flex/grid** | flow was never declared there (page root, drawing board) | auditing the page root reported `no_layoutChild` for every child on the page |
| a board whose children are **all absolute**, that `NL` did not declare as a flow region | that is a *drawing host* — which is what CF control interiors are (§9) | a `mkAbsBoard`-style control reported `absolute_child` for its plate **and** its label |

| Signature | Real meaning | Repair |
|---|---|---|
| `not_settled` | the engine has not positioned this board's children yet (one still sits at doc 0,0) — **every geometry finding below is meaningless until it clears** | `await NL.whenSettled(board)`, then re-audit in the next call. Never "repair" a `not_settled` board: its padding, gaps and fill widths are all read too early |
| `flex_rejected` | a flex/pad key you wrote is not in the measured vocabulary | use the alias `applyFlex` names in its message; never re-add a `try/catch` around it |
| `no_layoutChild` | a child of a **flow-declared** parent carries no `layoutChild` → the parent lost its flex, or the child was appended before the flex existed | `NL.frame` for containers; `addFlexLayout` first, then re-mount and re-declare sizing (R2) |
| `absolute_child` | a child is pinned inside a flow board **and the engine did not declare it** | `c.layoutChild.absolute = false` (that is the whole release — see §8), then re-declare sizing |
| `sizing_dropped` | the sizing `NL` was asked to declare is **not** what the shape reports now. Two causes, both silent: a `resize()` after the declaration (R5), or a main-axis `fill` child that un-hugged its parent (R6, reported on the **board** row). | re-declare with `NL.sizing` / `NL.nudge` after the last resize. `NL.nudge` also restores the parent's own sizing — the width only recomputes in a **later call**, so verify next call, not now |
| `padding_ignored` | on a **start-aligned** axis the first child is not at the padding edge | the padding was written under a wrong name, or the child was hand-moved |
| `stale_or_manual_gap` | `py ≠ prev.py + prev.h + rowGap` | re-settle before believing it (R3); otherwise the child was moved manually |
| `fill_not_stretched` | sizing says `fill` but the box ≠ the expectation **for that axis** — cross axis = content box, main axis = leftover after the non-filling siblings | the message prints the arithmetic; check the parent's own sizing on that axis, then whether a `resize()` (R5) or a wrap (`auditFlow` skips wrapped rows) explains it |
| `main_axis_overflow` | the fixed flow children already exceed the content box, so the fill child computes **0** and the board overflows | give the board room (bigger `fix` axis, or `auto` + no fill children), shrink a sibling, or drop the `fill` on that axis |
| `fixed_overflow` | a **`fix`**-axis flow with no fill child whose children already exceed the content box → the last child is drawn past the host (measured: 99 px of content in a 96 px cell, ×40 on one board). `audit_layout` only reported it as `out_of_bounds` two pixels lower down, which names the wrong object | grow the host (`FX.fitBoardHeight`), wrap the row, or drop a child. The finding prints the sum, and the trap inside it is leading: **a 13px label is 19 tall, not 15** |
| `hug_frozen` | a **hug** frame whose box ≠ `pad + Σchildren + gaps` on its main axis. Every other geometry expectation here is skipped for a hug parent as circular — it is only circular while the children are stale too; once they are laid out the sum is a fact (measured: `row·head` rendered 6 tall over two texts of 44 and 20, `auditFlow` said CLEAN, and the PNG export showed the caption printed on top of the title) | `storage.FN.relayout(board)` — walk bottom-up and write any flex property (`s.flex.topPadding = s.flex.topPadding`), which re-runs the pass in the same call. The cause is almost always **font application during token binding**: the text grows after the frame's last layout pass, so bind → relayout → re-audit, in that order (engines.md §7) |
| `fill_in_hug_parent` | a main-axis `fill` child inside a parent that still reads `auto` on that axis | same as `main_axis_overflow`; this one fires from sizing alone, so it survives an unsettled read |
| `size_stale` | a `fix` axis no longer measures what the caller declared | settle and re-read; if it persists, something resized it — fix the producer, not the board. (Boards built without an explicit `w/h` record no expectation, so flow rows do not spam this.) |
| `no_flow_children` | the board has children and none of them is in flow | run `NL.reflow` (§8) |

Reading the verdict: `NL.auditFlow` is a **producer** check, so every finding names the write that caused it. When the
same signature comes back after a repair, the producer is wrong, not the board — fix `NL`/`CF`/`LY` and rebuild, the way
G11/G12/G13 treat the design-rule lint.

A `NEEDS_REPAIR` verdict is only meaningful **after a settle**; a `CLEAN` verdict is not a delivery gate by itself —
`audit_design.designGate` (G13) and `audit_layout` (G3/G5) still have to pass, because `auditFlow` only proves the
skeleton is genuinely flow-authored and settled, not that it obeys the design rules.

## 8. Migrating an already-built absolute page

`penpotUtils.addFlexLayout(board, dir)` **does not** release children that are already `absolute` — they keep their
hand-placed coordinates. The migration is two steps, and `NL.reflow` performs both:

```js
const res = NL.reflow(board, { dir: 'column', breath: 'block', pad: 24 });   // addFlexLayout + clear each child's absolute
await NL.whenSettled(board);
return { released: res.released, audit: NL.auditFlow(board) };
```

Measured: two rects at `parentX/Y` 20,20 / 20,80 stayed put after `addFlexLayout`; clearing `absolute` moved them to
16,16 and 16,68 (pad 16 + gap 12). `NL.reflow` returns the `NL.report()` snapshot it took first — review `released`
before delivering, because re-flowing a board changes positions by design. A released child keeps whatever size it had
and reports `fix` on both axes, so declare the sizing you want **after** the reflow. Never run it on a spec board.

## 9. When to stay absolute

**On pages 01–09, arrangement is flow or grid — full stop (design-guide §1.5, lint `free_layout`).** Absolute
positioning there is legal ONLY for:

* **Name-declared overlays** — `scrim`/`overlay`/`veil`/`wash·`/`ring·`/`hitpad·`/`connector`/`tail·`/`rail·`/
  `boundary·`/`underline·`: they cover or connect, they do not arrange, and rule 43 requires them absolute.
* A **control host's own anatomy** (CF internals): a control is absolute inside its own host and that is correct —
  the host itself is what joins flow.
* **Page chrome and shelf** — the `-Header`/`-Footer`/`-PageRoot` internals, the page-level pin of whole boards
  (`FN.place` → `nl:shelf`), and `LY` region plans, whose coordinates come from the recipe (G11).

Everything else — spec-sheet rows/columns, cell grids, label stacks, foundation rows, diagram PARTS — is arranged with
`rowGap`/`columnGap`, padding or a grid, values on the declared spacing scale. Spec boards were previously permitted to
stay absolute (old §9 wording); that permission is revoked, on measured grounds: **a board's absolute children hold
world coordinates and do not follow the shell** (api-pitfalls §coordinates), so an absolute sheet cannot re-flow after
a token change and cannot be repaired in place — only rebuilt. `CF.matrix` now builds the sheet as a flow column of
grid rows (token gaps/padding) and attaches each drawn host into its settled slot with `CF.move` — the one proven way
to move a board whose anatomy is world-absolute.

Not `01`/`02` either way: a Foundations board is a hug column of hug rows, the most flow-native artifact in the file
(G16, `engines.md` §7); the only absolute pin there is each board's own top on the page, and that pin is declared.

On screens (14–16), the content area is flow (§4); absolute stays legal only for pixel-exact decoration and the
`LY`-placed region shells outside. If a screen's content area is a pile of absolute boards, the deliverable is not
editable and this is the file to fix.

Staying absolute (where it is legal) does **not** opt a board out of the whitespace contract. Rules 32/33 read
`flex.gap`, so they cannot see an absolute stack, but the distance between two absolute sibling blocks is still judged
by `off_scale_gap`, and the ladder is the same `LY.SPACE` scale underneath. `storage.breathe()` repairs the **flow**
half (gaps + text leading); an absolute gap is a coordinate, so it is repaired where it was authored —
`storage.reflowRows({gap})` re-shelves at a ladder level, `storage.moveSubtree` for one subtree. Whitespace is the
separation device either way; flow is only how you *declare* it.
