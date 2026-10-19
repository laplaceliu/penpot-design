# Penpot native capabilities — live-verified evidence base

Every row below was measured in **the connected build** through `execute_code` on 2026-10-19: the exact call, the observed
result, and — where this skill previously said something else — the old claim quoted and marked **FALSIFIED**. This file is
the authority for what may be claimed in a delivery; `api-pitfalls.md` records how to survive the sharp edges, this file
records what the platform can actually do.

Companion: `scripts/native_layout.js` (`storage.NL`) turns §1–§5 into an executable build path.

## 0. Three meta-findings that gate everything else

1. **The harness awaits a returned Promise.** `return (async () => { … })()` works, so one call can build → settle →
   measure → report. This kills the old "measure in the next call" split. Do **not** return an object *containing* a
   Promise (`structuredClone` fails); return the Promise itself or a plain value.
2. **Readback is transitional until the layout engine settles.** A nested-board flex tree still reported stale geometry
   **1.2 s** after the last write (children all at `parentX = -122000`, widths un-stretched); a later call read the correct
   tree. Discipline: `NL.whenSettled()` — it **polls the stale fingerprint itself** (§2.3) instead of guessing a sleep
   length — then `NL.report()` / `NL.auditFlow()`, and for any verdict that ships, **export** (the render is the referee,
   not the proxy). One caveat to meta-finding 1: awaiting is enough for *reading a settled tree*, but a recompute that the
   engine has to *re-run* (re-declared `fill` after a resize, §2.3) only appears in a **later call**, so the repair loop
   is write → next call → verify, not write → sleep → verify.
3. **Wrong property names are silently dropped, and sometimes *land as junk own-properties*.** `Object.keys(flex)` is the
   truth; assigning `flex.paddingTop = 24` "reads back" 24 in the same call (it created a stray JS property) while the
   layout never moved. `ShapeBase` proxies are **not extensible** (`host.leftPadding = 24` throws
   `Cannot add property leftPadding, object is not extensible`), which is the only place this build *does* tell you.
   Rule: after any property write, read the key back **in a later settled call** and compare against
   `Object.keys(obj)`.

## 1. Sizing vocabulary (measured, this build)

| Object | Property | Accepted values | Measured |
|---|---|---|---|
| board (container's own) | `horizontalSizing` / `verticalSizing` | `'fix'` \| `'auto'` | `fix` holds 160×52 exactly; `auto` hugs (outer column height became 188 = 3×52 + 2×16, then 236 after padding) |
| `layoutChild` (child in a flex/grid parent) | `horizontalSizing` / `verticalSizing` | `'fix'` \| `'auto'` \| `'fill'` | `fill` stretched a **nested board** to the parent's content width (400); `fill` on a rect = 752 = 800 − 2×24. **Both were cross-axis cases — on the main axis `fill` is the *leftover* space, see §2.3** |
| `layoutChild` sizing | *(durability)* | — | **`shape.resize()` on a flow child downgrades its declared sizing to `fix`** (§2.3); sizing must be re-declared after the last resize |
| `layoutChild` | `absolute` | bool | `true` escapes flow; x/y then read as **doc-absolute** (`boardX = −99300` proved it) |
| `layoutChild` | `zIndex` | number | `7` round-trips |
| `layoutChild` | `alignSelf` | `'auto'\|'start'\|'center'\|'end'\|'stretch'` | `end` → `boardX 656` in an 800-wide parent |
| `layoutChild` | `maxWidth` / `minWidth` / 6 margins | number | `maxWidth=400` clamped a `fill` child from 752 → 400 |
| `ShapeBase` | `constraintsHorizontal/Vertical` | `'left'\|'right'\|'leftright'\|'center'\|'scale'` | settable, round-trips |
| board | `clipContent`, `showInViewMode` | bool | settable, round-trips |

**`layoutChild` is `null` unless BOTH** (a) the shape already has a parent **and** (b) that parent board has flex or grid
layout. A plain board's child throws `Cannot set properties of null (setting 'absolute')`. This is *why* `mkAbsBoard`
calls `addFlexLayout()` before anything else — the trick is real, but it is a workaround, not the only path (§2).

**Order matters and is not commensurable:** writing `board.horizontalSizing = 'auto'` **after**
`layoutChild.horizontalSizing = 'fill'` normalizes the child back to `'auto'` (measured: width stayed 100 instead of
stretching to 400). Declare the child's layout sizing **last**.

`flex.verticalSizing = 'fill'` on a child of an **auto-height** parent computes height **0** — the documented collapse.
Never mix `fill` on the parent's hug axis.

## 2. Flex layout is production-viable — the "approach B is uncontrollable" verdict is FALSIFIED

`api-pitfalls.md` §10 said: *"B. flex auto-layout … Nested board children force-hugged (160×45 button collapses to text
size) … Uncontrollable in nested-board scenarios"* and recommended *"C. … **Recommended fallback**"*. Re-measured with the
correct vocabulary:

| Case (exact calls) | Measured after settle | Exported render |
|---|---|---|
| column board 400 wide, `fix`, `topPadding/leftPadding…=24`, `rowGap=16`, `verticalSizing='auto'`; 3 nested button boards declared `fix` + `resize(160,52)` | children at `parentY` 24 / 92 / 160, each **160×52 preserved**, height hugged to **236** = 24+52+16+52+16+52+24 | ✅ three buttons, correct gaps, correct padding |
| label inside each button board: `flex.dir='row'`, `justifyContent='center'`, `alignItems='center'`, label `hs/vs='auto'` | label `parentX` 57 / 49 / 59 for 47 / 63 / 43 px text in a 160 board → **centered to the pixel** | ✅ |
| same host, child `layoutChild.horizontalSizing='fill'` (rect **and** nested board) | width → 400 (full content width) for both | ✅ full-width bars |
| `alignItems='stretch'` + child own `horizontalSizing='fix'` | child keeps 160 (own declaration wins over the parent's stretch) | — |

**Root cause of the historical failure:** the old code wrote `horizontalSizing = 'fixed'` (invalid) inside a `try/catch`,
so the value was dropped and the board fell back to hug → "the button collapsed to its text". Same class of bug for
padding: this build's flex object exposes **`topPadding` / `rightPadding` / `bottomPadding` / `leftPadding` /
`verticalPadding` / `horizontalPadding`** — *not* the `paddingTop…` names in `@penpot/plugin-types`. `paddingTop` was a
silent no-op; `topPadding` moved the children to `parentX = 24` and grew the hug height 188 → 236.
`verticalPadding`/`horizontalPadding` are **aggregate setters** (setting `verticalPadding = 8` wrote `topPadding =
bottomPadding = 8`).

**Consequence for the skill**: auto-layout is no longer a fallback to be avoided — it is the path that makes the output
*editable* (a designer changing a label re-wraps the row; an absolute tree does not). Absolute placement stays the
deterministic path for pixel-exact art and for the spec boards. See `native-layout.md`.

### 2.1 What a freshly created flex board reads back (measured, `Object.keys(board.flex)`)

`dir:'column'` (after `addFlexLayout`), `wrap:'nowrap'`, `alignItems:'start'`, `alignContent:'stretch'`,
`justifyItems:null`, `justifyContent:'start'`, `rowGap:0`, `columnGap:0`, all four paddings `0`,
`horizontalSizing:'fix'`, `verticalSizing:'fix'`. **The 16 keys are exactly `NL.FLEX_KEYS`** — anything else you assign
becomes a JS own-property that the layout engine never reads.

Two consequences the audit now depends on:

* The defaults are **start-aligned on both axes**, so "the first flow child sits at `leftPadding`/`topPadding`" is only a
  valid expectation while `alignItems`/`justifyContent` stay `start|stretch`. A board with `align:'center'` parks its
  first child at `(w − childW)/2` **by design** — measuring it against the padding produces a false defect. `NL.auditFlow`
  therefore checks the padding edge per axis, only when that axis is start-aligned and the child has no `alignSelf`.
* A rect child has **no own sizing accessor**: `rect.horizontalSizing` reads `undefined` even inside a flex board, while
  `rect.layoutChild.horizontalSizing` reads `'fix'`. Any check that wants "is this child pinned to a size" must read
  `layoutChild` first and the own property as a fallback, or it silently skips every non-board.

### 2.2 NL smoke test (the engine, not the platform)

Built through `storage.NL` in a scratch file, read after `NL.settle(1400)`:

| What was authored | Measured |
|---|---|
| `NL.col(w:400, gap:16, pad:24, sizing:{h:'fix',v:'auto'})` + three `NL.frame(160×52, fix)` buttons + one `fill` rect | hug height **260** = 24+52+16+52+16+52+16+8+24 exactly; buttons kept **160×52** at `parentY` 24 / 92 / 160; rect **352** = 400−2×24 |
| label inside each 160-wide button, `align:'center', justify:'center'` | `parentX` 56 / 34 / 57 for 48 / 92 / 46 px text = **centred to the pixel**, no `ct()` measurement pass needed |
| `NL.frame(pad:{top:24, x:16})` — the long names | `topPadding 24, left 16, right 16, bottom 0`; children settled at px16/py24, second at py72 = 24+40+8. **Before this, `{pad:{top:24}}` wrote nothing at all.** |
| `NL.frame(pad:{gap:24})` | `flex_rejected → pad.gap → unknown pad key` in the audit — a bad pad key can no longer pass silently |
| `NL.gridFrame(620×320, 3 fixed cols, 2 rows)` + `NL.cell(1,1) / (1,2 span col 2) / (2,1)` | x 0 / 100 / 0 y100, `columnSpan` reads 2; `NL.cell(3,1)` and `NL.cell(1,4)` **refused** with the track count in the message |
| `NL.guide(grid, {cols:12, margin:24, gutter:16})` | `guides` length 1, `params.margin` 24 round-trip |
| `NL.stamp(grid,{recipe,region,tier})` → `NL.readStamp` | all three keys read back from **inside the file** |
| `NL.reflow` on a `mkAbsBoard` with two absolute rects | see §9 — `addFlexLayout` alone leaves them pinned |
| `NL.auditFlow` on the correct tree / the deliberately broken one | **CLEAN** / `absolute_child` + `no_flow_children` |
| `NL.fromRecipe('dash3', {w:1440, x0:400, y0:2000, parent})` | 4 region boards at the exact `LY.rect` boxes, `absolute`, `dir:column`, `pad 24/24`, `gap 16`, all stamped; a `fill` title inside `detail` settled at **1000** (= 1048 − 48) and the whole host audited **CLEAN** in one `whenSettled` poll *(LY side ran against a contract stub — see native-layout.md §4)* |
| `NL.auditFlow` read **before** the engine has positioned the children | one `not_settled` finding and **nothing else** — every geometry expectation suppressed (§2.3) |

### 2.3 `fill` means two different numbers, and three writes are silently downgraded (measured)

Both of these were found by letting the engine audit **its own** output, which is the reason `auditFlow` exists.

**The axis semantics of `fill`** — not one expectation (a column board, `pad:24`, content 552):

| Case | Measured |
|---|---|
| `fill` on the **cross** axis (width of a column child) | parent content box: 400 → **352**, 600 − 48 → **552** |
| `fill` on the **main** axis (width inside a `dir:'row'`) | the **free space left by the non-filling flow siblings**: row content 552, one 160 `fix` sibling, `columnGap` 16 → **376** |
| two `fill` children on the main axis | the free space split evenly between them |
| `verticalSizing:'fill'` where the fixed siblings already exceed the content box | **0** (content 52 − 80 sibling − 16 gap = −44), and the board overflows — the child lands at `parentY` 120 in a 100-tall board |
| absolute children in the same board | excluded from the sibling sum: they take no flow space |

So `NL.auditFlow` computes the expectation per axis, and the arithmetic is in the finding message
(`w=… main-axis free=… (content 552 − 160 of 1 sibling(s) − gap 16×1, 1 filling)`) — a wrong expectation is auditable,
not just a bare "not stretched".

**Three silent downgrades.** Each one keeps the visual result and destroys the *flow* property, so nothing reports it
except a readback against a recorded intent:

| Write | Readback afterwards | Consequence |
|---|---|---|
| `shape.resize(w, h)` on a flow child **after** declaring its sizing | `layoutChild.horizontalSizing`: `fill` → **`fix`** (measured: 252 px fill child resized to 70 reads `fix/fix`) | the child is pinned; a designer changing copy no longer re-wraps the row. This is why sizing is declared **last, after every resize** |
| a `fill` child on the parent's **main** axis inside a `sizing:'auto'` (hug) board | the parent's own `verticalSizing`: `auto` → **`fix`**, and the board keeps whatever height `resize()` last gave it (measured: declared 10, children needed 168 → content became **−38**) | the hug is gone without an error; everything below the board overflows |
| `parent.resize()` used as a "nudge" to force recompute | the **parent** is itself a flow child, so its own sizing downgrades exactly like a child's | the first version of `NL.nudge` broke the row it was repairing — it now restores the parent's sizing from the recorded intent |

**Repair is asynchronous, and that is the second trap.** Re-declaring the sizing after the resize does fix it, but the
geometry recompute lands on a **later layout pass**, not inside the call that wrote it:

```
grow.resize(120,40)                     → 120 / fix
NL.sizing(grow,'fill','fix')            → still 120 after 700 ms, sizing reads 'fill'
(next execute_code call)                → 377 / fill      ← 553 − 160 − 16
```

`NL.nudge()` therefore returns the sizing readback and explicitly says *re-audit in a later call*.

**The "not laid out yet" fingerprint** — the shape of every stale read in this build: until the engine has run, a flow
child is still at **doc (0,0)**, i.e. `parentX = −board.x`, `parentY = −board.y`, with its creation width (never
stretched). That single state produces a *cascade* of confident-looking findings — `padding_ignored`, `fill_not_stretched`,
`stale_or_manual_gap`, `size_stale` — all of them false. `NL.unlaid()` recognises it, `NL.auditFlow` reports
`not_settled` for that board and **suppresses every geometry expectation**, and `NL.whenSettled(board)` polls until it
disappears (measured: settled at the first 400 ms poll for a 2-level tree; a freshly built 3-level tree was still
`not_settled` after 1500 ms and cleared in the following call). Use `whenSettled`, not a guessed `settle(ms)`.

## 3. Grid layout (measured)

```js
board.addGridLayout();
const g = board.grid;
g.addColumn('flex', 1); g.addColumn('fixed', 200); g.addColumn('percent', 50);
g.addRow('fixed', 100); g.addRow('auto');
g.rowGap = 16; g.columnGap = 16; g.topPadding = 24; …      // same padding names as flex
g.appendChild(child, row, column);                          // **1-based** placement
child.layoutCell.rowSpan = 2; child.layoutCell.columnSpan = 1;
```

* Track types accepted: **`flex` | `fixed` | `percent` | `auto`**. Rejected: `fr`, `percentage`, `minmax`.
* On a 1200-wide board with `flex 1 / fixed 200 / percent 50` + 24 padding, the three cells settled at
  **x = 24 / 616 / 976, y = 24** → cells are positioned by the engine; **do not hand-place them**.
* `setRow/setColumn/addRowAtIndex/addColumnAtIndex/removeRow/removeColumn` exist on the grid object.
* **Placement indices are 1-based, and out-of-range values are silently clamped — FALSIFIED (this document previously
  said `appendChild(child,row,col)` is 0-based).** Re-measured on a controlled 2-row × 3-col grid (`fixed` 100/200/300,
  one child per grid so auto-placement cannot confound the read), reading `layoutCell` and the settled position:

  | `appendChild(child, a, b)` | landed cell | position |
  |---|---|---|
  | (1,1) | 1/1 | x0, y0 |
  | (1,2) | 1/2 | x100, y0 |
  | (1,3) | 1/3 | x300, y0 |
  | (2,1) | 2/1 | x0, y100 |
  | (2,3) | 2/3 | x300, y100 |
  | **(0,1)** | **1/1** | x0, y0 ← no error |
  | **(1,0)** | **1/1** | x0, y0 ← no error |
  | **(4,4)** | **1/1** | x0, y0 ← no error |

  So `a` = row, `b` = column, both **1-based**, and `0`/too-large never throws: everything you mis-index lands in the
  first cell, stacked. `NL.cell` validates against `grid.rows.length × grid.columns.length` and refuses instead —
  a silent stack is the same failure class as `paddingTop`.
* Spans require placement **first**: `rowSpan`/`columnSpan` on a child appended with plain `appendChild` throws
  `Value not valid: cell not found. Code: :row-cell`. `columnSpan = 2` set after placement reads back `2` and the child
  grows across the two tracks.
* Appending **without** indices auto-places (next free cell) — that is the path to use when the cell does not matter.


## 4. Guides, columns and view flags

```js
board.guides = [{ type: 'column', display: true,
  params: { color: { color: '#8b5cf6', opacity: 0.5 }, type: 'stretch', margin: 24, gutter: 16 } }];
board.addRulerGuide({ position: 120, direction: 'vertical', color: '#2563EB' });   // also on Page
page.removeRulerGuide(g);  board.removeRulerGuide(g);
```

* `board.guides` round-trips → **the tier's column grid can be drawn natively** (margin/gutter/columns) instead of with
  invisible rectangles, which is what the official guidance demands ("not with invisible rectangles").
* `showInViewMode` and `clipContent` are settable per board → the presentation layer can hide construction aids.

## 5. Components, instances and variants — instantiation IS scriptable

`api-pitfalls.md` §6 claimed: *"**Instantiating is not scriptable in this build** … So a script cannot place library
instances on a screen … `comp.instance()` … treat as **unverified**"*. **FALSIFIED.** Measured:

```js
const comp = penpot.library.local.createComponent([board]);   // board becomes the main instance
comp.mainInstance();            // → the head shape (isComponentMainInstance() && isComponentHead() true)
const inst = comp.instance();   // → a REAL instance board on the current page
root.appendChild(inst);
Array.from(inst.children).find(c => c.type === 'text').characters = 'Cancel';   // per-instance override
inst.resize(200, 48);
```

| Observation | Value |
|---|---|
| `inst.isComponentInstance()` / `isComponentRoot()` | `true` / `true` |
| instance size before resize | 160×52 (copied from main) |
| text override on the instance | reads `'Cancel'` |
| same child on the **main** instance | still `'Delete'` → **overrides are local, they do not propagate back** |
| `inst.resize(200,48)` | 200×48 |
| `penpotUtils.shapeStructure(inst)` | `{ componentInstance: { componentId, componentName, mainInstanceId } }` on the root **and** each child |
| `inst.detach()` | present |

Variant path — re-measured 2026-10-19 against the old claim, because several parts of it were wrong:

```js
// every entry MUST carry `properties` — without it: TypeError: Cannot convert undefined or null to object
const vc = penpotUtils.createVariantContainer([
  { shape: recA.mainInstance(), properties: { Type: 'Primary', Size: 'Md' } },
  { shape: recB.mainInstance(), properties: { Type: 'Secondary', Size: 'Md' } }]);
vc.name = 'Toggle';                    // container renameable — and the heads follow it
mergedRecord.name = 'Toggle';          // the record is renameable too
const inst = mergedRecord.instance();  // an instance starts at the record's variantProps
inst.switchVariant(0, 'Secondary');    // numeric pos → value; fill #2563eb → #475569
```

| Observation | Value |
|---|---|
| `createVariantContainer` without `properties` | **throws** `TypeError: Cannot convert undefined or null to object` — the property table comes *only* from that argument |
| the merge | consumes the source records: two flat records disappear and **one** variant record remains (`variants = {id, libraryId, properties:['Type','Size']}`) |
| head layer names | overwritten to the container's name (`'Component'`, then `'Toggle'` after the container rename) |
| renaming a head afterwards | **wipes the property table** — `variantProps` `{"Type":…,"Size":…}` → `{}`, `properties` → `[]` — and the new name is reverted to `'Component'`. Never touch the heads; put the family name on the container **and** the record |
| `setVariantProperty(pos, value)` | **record method, pos is a number index**: `setVariantProperty(0,'Off')` → `variantProps` becomes `{"Type":"Off",…}`; a string pos throws `Value not valid: Type. Code: :pos`. **Not present on instances** (`inst.setVariantProperty` → `undefined`) |
| `inst.switchVariant(pos, value)` | **works on instances** (numeric pos); same value = silent no-op; invalid value = silent no-op; text overrides survive the switch. The older "`switchVariant` is a no-op" verdict was measured on the wrong object |
| `renameProperty` / `addProperty` / `combineAsVariants` | **do not exist** on `penpotUtils`, and the first two are not on the component record either — the earlier "also verified … `renameProperty()`, `addProperty()`" line was wrong |
| properties are *stored* | structured on the record (`variantProps`), **not** parsed from a `[Property]=Value` layer name in this build — layer names after a merge are just the container name |

So: variant props are a **record-level** concern (`setVariantProperty`), variant *switching* is an **instance-level**
concern (`switchVariant`), and neither is reachable by renaming layers.

### 5.1 Placing instances on a screen (what `CF.instance` / `CF.swap` encode)

| Step | Measured |
|---|---|
| `rec.instance()` then `parent.appendChild(inst)` into a flex row | works; the instance keeps the main's box (160×52) until you declare sizing |
| **declaring `'auto'/'auto'` on an instance** | **collapses it to label size** — 160×52 → **41×17** (and a flow-interior `NL.frame` button 160×52 → **30×17**). For a board, `auto` means *hug*, and the harness reads it back as `own: auto/auto` too |
| declaring `'fix'/'fix'` | 160×52 preserved exactly, and the audit stays `CLEAN` — this is the default `CF.instance` writes |
| absolute-interior hosts (a `mkAbsBoard`-style CF control) with `'auto'` | *happen* to keep 160×52 — hug has no flow children to measure, so it never recomputes. Luck, not a contract: still declare `fix` |
| flow placement of an instance + label in one row | instance `px24`, label `px50` (= 24 + 14 + gap 12) after one `whenSettled` poll; `NL.auditFlow(row)` → **CLEAN** |
| `CF.swap(inst, name)` → `inst.swapComponent(other.mainInstance().component())` | name follows the target (`Button·Primary·Md·Hover`), fill follows the target (`#2563eb` → `#1d4ed8`), still an instance, **text override survives** (`'Publish'` stayed), size stays 160×52 |
| instance names on a screen | **inherit the component name** → a screen of instances carries `Family·Size·State` names for free, so G12/G13 naming still passes |
| `NL.auditFlow` walking instances | component copies are walked **through**, not judged (their interiors are mirrored masters) |

**Why the old claim was reached, and the trap that follows.** A component whose head shape is gone returns
`mainInstance() === null`, and then `instance()` throws `TypeError: undefined is not iterable` — which reads like "the API
is missing", not "this record is corrupt". Library record cleanup measured three ways:

* `comp.remove()` **with the main instance intact** → the record disappears (verified: library count returned to its
  previous value and no orphan shapes remained).
* **deleting** the main instance's *shape* (e.g. a batch cleanup that matches `isComponentInstance()`, which is `true`
  for **mains too**) → the record followed it: library count went to 0, **no ghost**. `isComponentInstance()` is
  therefore not a "this is a disposable copy" test.
* `inst.detach()` on the **main instance**, then `remove()` → the shape goes but the **record stays** as an unreachable
  ghost that can no longer be removed through the plugin API (3 such records are still in the demo file's library; they
  are only deletable from the Assets panel). **Never detach a main instance to clean up.** Register from a dedicated
  masters board and remove via `comp.remove()` while the head exists.

Component object surface (probed on 2026-10-19, flat *and* variant records): functions `remove instance mainInstance
isVariant transformInVariant addVariant setVariantProperty`; values `id libraryId name path variants variantProps
variantError getPluginData/…`. **Absent**: `switchVariant` (instances have it, records do not), `renameProperty`,
`addProperty`. `setVariantProperty(pos, value)` takes a **bare value** (`'Off'`, not `'Type=Off'`) and a **numeric** pos.

## 6. Design tokens — full round trip verified with a settled read

`TK` (`scripts/token_engine.js`) was already right; the earlier "binding doesn't take" suspicion was **my own stale read**
(no settle). Measured with `nap(700)` after each apply:

| Action | Readback |
|---|---|
| `addSet({name, active:true})` | `set.active === true` immediately |
| `set.addToken({type:'color', name:'color.probe.primary', value:'#2563EB'})` | `value '#2563EB'`, `resolvedValueString '#2563EB'` |
| `token.applyToShapes([rect])` | `rect.tokens === { fill: 'color.probe.primary' }`, `fills[0].fillColor === '#2563eb'` |
| `dimension` token `64` → rect | `width = height = 64` (both, as documented) |
| `typography` token → text | `tokens === { typography: 'type.probe' }`, `fontSize === '20'`; stored value renames `fontFamilies→fontFamily`, `fontSizes→fontSize` |
| `spacing` token `24` → flex board with `['rowGap','columnGap']` | `tokens === { rowGap: 'space.probe', columnGap: 'space.probe' }`, `flex.rowGap === 24`, `flex.columnGap === 24` |
| alias `{color.probe.primary}` | `resolvedValueString === '#2563EB'` |

**New, and it changes how a theme switch must be driven:** adding a later active `· Dark` set with the same token name
changed the *base* token's `resolvedValueString` to the dark value (later set wins — as documented), **but the already-bound
shape kept its light fill**. The shape only re-resolved when the switch went through a **theme activation**:

```
Core+Dark both active (manual)        → rect fill still #2563eb
theme('Scheme/Dark').toggleActive()   → rect fill becomes #93c5fd     ← one call re-skins every bound shape
theme('Scheme/Light').toggleActive()  → back to #2563eb, Dark set auto-off (same-group exclusion)
```

So: **scheme switching is a theme operation, not a set-ordering operation.** Build the light+dark deliverable as
`· Core` + `· Dark` + a `Scheme` group with two themes, and switch with `TK.activateTheme('Scheme','Dark')`; after any
switch, settle and re-export before judging. `set.toggleActive()` still clears all themes (unchanged rule).

Re-verified 2026-10-19 with the acceptance helpers that are now in `token_engine.js` (`TK.paint` → `TK.changed`), on a
real token-bound shape:

| Step | Result |
|---|---|
| `TK.put('demo · Dark', 'color', 'color.primary', '#93C5FD')` (same token name, later set) | `TK.changed` → **0**: the paint stayed `#2563eb` while the resolved value moved |
| `TK.activateTheme('Scheme','Dark')` | active sets `['demo · Dark']`, paint `#2563eb → #93c5fd` → **changed: 1** |
| `TK.activateTheme('Scheme','Light')` | active sets `['demo · Core']`, paint `#93c5fd → #2563eb` → **changed: 1** |
| re-read with no switch in between | **changed: 0** (the comparison is stable; hex compared case-insensitively, since reads are lowercased) |

## 7. Library colors = real style bindings (the missing re-skin mechanism)

The three color channels of this build, each with a different repaint trigger — all measured 2026-10-19:

| channel | bind with | repaint trigger | owner |
|---|---|---|---|
| **library color** | `shape.fills = [c.asFill()]` → `fillColorRefId` | `c.color = '#…'` (one write, every bound shape follows) | `storage.LIB` (`scripts/palette_engine.js`) |
| **token** | `token.applyToShapes([shape])` → `tokens.fill` | `TK.activateTheme(group, name)` (§6) | `storage.TK` |
| **raw hex** | `fills = [{fillColor:'#…'}]` | `penpot.replaceColor(shapes, {color,opacity}, {color,opacity})` | whoever wrote the hex |

```js
// createColor IGNORES its arguments in this build — six argument shapes ({name,color}, {name,value}, positional,
// {name,hex}, {name,fill}, {name,color:{r,g,b}}) all produced a color named '#000000' with value '#000000'.
// The working recipe (and what palette_engine.LIB.put does): create, then assign both properties.
const c = penpot.library.local.createColor({});   // note: on the LIBRARY, not on .colors (that collection has
                                                  // no createColor — measured "…colors.createColor is not a function")
c.name = 'primary';                               // round-trips → lookup by name works (LIB.color('primary'))
c.color = '#2563EB';                              // round-trips
rect.fills = [c.asFill()];                        // → {fillColor:'#2563EB', fillOpacity:1,
                                                  //     fillColorRefFile:<fileId>, fillColorRefId:<colorId>}
c.color = '#7C3AED';                              // → every bound shape repaints (measured: fill followed,
                                                  //     and fillColorRefId stayed intact)
```

More measured facts:

* **`asStroke()` exists and carries the refs** (`strokeColorRefFile`, `strokeColorRefId`, plus `strokeStyle/
  strokeWidth/Alignment/Cap*` fields) — binding a stroke to a library color round-trips the same way `asFill` does.
* **Duplicate names are allowed**: `createColor` twice under the same name makes two records, so idempotency must be
  done by **looking the name up first** (`LIB.color(name)`), which is what `LIB.put` does.
* **`penpot.shapesColors(shapes)` requires an ARRAY** — a bare shape throws
  `Value not valid: [object ShapeProxy]. Code: :shapesColors-shapes`. It returns
  `[{color, refFile, refId, opacity, id, fileId, shapesInfo:[{property, index, shapeId}]}]`:
  `refId` present ⇒ library-bound, absent ⇒ **raw hex**. There is no shape *name* in `shapesInfo`, so resolve
  `shapeId` against the shapes you passed in (`LIB.audit` does).
* **`penpot.replaceColor(shapes, old, next)`**: both sides must be **`{color, opacity}`** — omit `opacity` on the old
  color and the call succeeds while changing nothing (measured). It only rewrites **raw** fills: a ref-bound fill with
  an exact old-color match came back untouched (correctly — the library color owns that value). It returns `null`, so
  success is read back from the fills, never from the return value. `shapes` must be an array.

This is the lighter-weight sibling of token binding (§6): no token model, no theme group — one color, one edit, every
bound shape follows. `scripts/palette_engine.js` (`storage.LIB`) encodes the recipe, `LIB.audit` is the
`shapesColors()`-based inventory that tells you which channel each fill on a board is using.

## 8. Prototype: flows, interactions, animations

Verified: `page.createFlow(name, board)` (throws `:createFlow-frame` if the board is a variant child — use a plain
board), `flow.remove()`, `shape.interactions` readback, and `addInteraction(trigger, action, delay?)` for
`click` / `mouse-enter` / `mouse-leave` / `after-delay` combined with `navigate-to`, `open-overlay`, `toggle-overlay`,
`close-overlay`, `previous-screen`, `open-url`.

* **Every animation field must be sent explicitly.** `{type:'dissolve',duration:300}` and a slide missing `way` both fail
  with `Value not valid … Code: :addInteraction`; full `{way:'from-right',direction:'reverse',duration:300,easing:'ease-out',offsetEffect:[]}`
  and push `{direction:'right',duration:300,easing:'ease-in-out'}` succeed. Measured as *preserved in the readback*:
  `{type:'dissolve',duration:300,easing:'ease-out'}` and the slide/push shapes above → `action` reads back
  `type,preserveScrollPosition,animation`.
* Overlay options: `position` (`'manual'|'center'|'top-left'|…`), `closeWhenClickOutside`, `addBackgroundOverlay`,
  `relativeTo`, `manualPositionLocation` — measured readback for an overlay link:
  `action: {type,destination,position,closeWhenClickOutside,addBackgroundOverlay}` (all five kept).
* Triggers include `'after-delay'` with a delay argument → timed transitions are authorable. Measured:
  `addInteraction('after-delay', action, 1200)` reads back `{trigger:'after-delay', delay:1200, …}`; `mouse-enter` with
  a navigate action round-trips too.

Re-measured 2026-10-19 while building `scripts/prototype_engine.js` (this is the part that cost probes):

| Fact | Measured |
|---|---|
| **`destination` must be the shape object** | `{type:'navigate-to', destination: board}` → the readback stores a full serialized snapshot of the shape (`{id, type, name, center, fills, …}`). **`destination: board.id` (or `destinationId`, `screen`, `target`) is accepted with no error and silently dropped** — the readback shows `action:{type:'navigate-to', preserveScrollPosition:false}` with no destination. Same for `open-overlay`. |
| `shape.interactions` | **read-only** (`Cannot set property interactions … which has only a getter`) → you cannot clear by assignment |
| removal | `shape.removeInteraction(interactionObject)` works; **an index or an id is rejected**: `Value not valid: 0. Code: :removeInteraction` |
| `addInteraction` | **appends** — authoring the same button twice gives two entries; clear first (that is what `PR.clear` does) |
| `open-url` | `{type:'open-url', url:'https://…'}` → `action: {type, url}` round-trips |
| `close-overlay` | `{type:'close-overlay'}` → `action: {type}` round-trips |
| **auto-flow** | with **no** flows on the page, wiring navs from two boards auto-created flows named `Flow 1` and `Flow 2`. Creating one *named* flow first (from the entry board) meant the same batch produced **only** that named flow → always create the entry flow before wiring, and read `page.flows` afterwards to catch strays |

**What this buys the skill**: a delivered design system can ship as a clickable prototype (screen → screen, menu →
overlay, modal close) instead of a pile of static boards, and `showInViewMode` + `viewMode` navigation make it presentable.
The whole grammar is in `storage.PR` (`scripts/prototype_engine.js`): `PR.flow/ensureFlow`, `PR.nav/overlay/close/url/delay`,
`PR.prototype(links, {flow})` (name-resolves nested boards, reports `dropped:true` if a destination went missing), and
`PR.read` for sanitized readback.

## 9. Delivery, codegen and import

| Capability | Measured |
|---|---|
| `shape.exports = [{type:'png',scale:2},{type:'svg'}]` | round-trips → **export presets are authorable**, so a delivery can leave the file with batch export already configured per screen. Readback fills the defaults: `[{type:'png',scale:2,suffix:'',skipChildren:false}, …]` |
| `shape.export({type:'png',scale:1})` | returns `Promise<Uint8Array>` — **await it**: 215 bytes for a 160×52 button, 1524 bytes for a 360×240 screen. Acceptance can render from inside the file (`PR.bytes`) |
| `penpot.generateStyle(shape)` | real CSS; **and it is the clearest argument for §2** — an absolute-authored board emits `position:absolute; left:100000px` junk, a flex board emits `display:flex; gap; padding` |
| `penpot.generateMarkup(shape,'html')` | works |
| `penpotUtils.generateCss(...)` | **has an `openPage` side effect** — never call it mid-batch without re-verifying the page |
| `penpotUtils.getBounds(shape)` | uses `text.textBounds` → **real rendered text metrics**; replaces the `CF.estW` estimate wherever an exact measure matters |
| `penpot.createShapeFromSvg(svg)` | returns a Group whose size is the **drawn path bbox in grid units** (see the size rule below) → **icons can be imported as editable vectors** instead of emoji placeholders. Five measured rules: it is inserted **at world (0,0), inside whichever board covers the origin** (two different origin-covering boards each received it at x/y −12,−12; with none, it goes to the page root) — `penpot.selection` and `viewport.center` are ignored; the platform adds a `base-background` rectangle you must delete or it paints a plate behind the icon; if the origin is covered by a **component copy** the import cannot be reparented (`Value not valid: Cannot change the structure of a component copy`) — import through a throwaway board at the origin and move from there; a **no-`parent` group is born inside that throwaway**, so it must be moved to the page root *before* the throwaway is removed (otherwise it is deleted with it — measured as `Value not valid: … :getChildren` on the next read); and **the svg root `width/height` is ignored** — the group lands at its 24-grid path bbox (an 18-unit icon arrives 18 px whatever the root says), so the size control is `group.resize(size, size)` after the import, before the sizing declaration (R5). `IC.svg`/`IC.place`/`CF.svgIcon` encode all five |
| `penpot.uploadMediaUrl/uploadMediaData` | available for raster assets |
| `penpotUtils.addFlexLayout(board, dir)` | adds flex and re-orders **newly added** children — but existing children keep `layoutChild.absolute = true` and stay at their hand-placed coordinates (measured: two rects still at `parentX/Y` 20,20 / 20,80 after the call). The release is per child: `c.layoutChild.absolute = false`, after which they re-flow to the padding edge and the row gap (measured: 16,16 and 16,68 with `pad:16, gap:12`). `NL.reflow` does both |
| `file.export('penpot'\|'zip','all'\|'merge'\|'detach')` | the method exists — **the pipeline has not been run** (§12) |
| `file.findVersions()` / `FileVersion` | **async, measured**: `await findVersions()` → `[{label, createdBy, createdAt, isAutosave, restore(), pin(), remove()}]`, ~21 ms; `await version.restore()` → `1`. No `id` field on a version row (labels are the key) |
| `file.saveVersion(label)` | **worked 3× in one session** (returned `{label, createdBy, createdAt}`; the labels appeared in `findVersions`) **and then silently stopped landing**: the promise never settled, and polling `findVersions` for 6 s found nothing — while a checkpoint whose *call had already timed out* appeared in the list seconds later. Conclusion: the write and the promise are on different clocks, so a checkpoint is **only** a checkpoint if the label shows up in `findVersions` (`PR.checkpoint` polls for 6 s and returns `ok:false` otherwise) |
| `penpot.history` | only `undoBlockBegin()/undoBlockFinish(id)` — no general undo; do not plan on it |
| `shape.setPluginData/getPluginData/getPluginDataKeys`, same for `page`/`file`/`library` | available → engine bookkeeping (recipe key, tier, audit stamp) can live **in the file** instead of only in `storage` |

## 10. API-surface facts that cost a probe each

* **`penpot.currentPage` is a `Page`, and a `Page` has no `children`.** The shape tree starts at
  `penpot.currentPage.root` (or `penpot.root`); `Array.from(page.children)` throws
  `undefined is not iterable`. There is **no `penpot.pages`** either — enumerate with `penpot.currentFile.pages`.
  Every engine here uses `penpot.currentPage.root || penpot.root` — keep it that way.
* `Page` members: `id name root getRoot remove background flows rulerGuides getShapeById findShapes openPage createFlow
  removeFlow addRulerGuide removeRulerGuide addCommentThread removeCommentThread findCommentThreads` + pluginData.
  `findShapes({name, nameLike, type})` is the cheap lookup; `addCommentThread` means design feedback is scriptable too.
* **`penpot.createPage(name)` and `createPage({name})` both ignore the argument** — the page lands as `Page N` (measured
  two ways). The working recipe is `const p = penpot.createPage(); p.name = '01 · Foundations';` — the assignment
  round-trips. Without the assignment, a name-checked queue (like the scaffold's) sees every page as permanently
  missing and mints six more generic pages per run.
* **`penpotUtils.getPages()` returns detached snapshots**: writes to `.name` silently do nothing and `remove` is
  `undefined`. Resolve through **`penpotUtils.getPageByName(name)`** (live proxy: rename ✓, `remove()` ✓ even on a
  non-active page) or `penpot.currentPage` after `openPage`. `getPages()` is fine for reading names/ids.
* `Object.keys(penpotUtils)` returns `[]` (prototype accessors) — probe with the names you need, not by enumeration.
  Measured to exist: **`getPages()`** (returns the page objects — used by the audit queues; the alternative is
  `penpot.currentFile.pages`), `addFlexLayout`, `createVariantContainer`, `shapeStructure`, `getBounds`, `generateCss`
  (has the `openPage` side effect, §9), `setParentXY`. Measured **absent**: `combineAsVariants`, `switchVariant`,
  `renameProperty`, `addProperty`, `removeFlexLayout`.
* `penpot` top-level: `ui utils closePlugin on off version root currentFile currentPage selection viewport history library
  fonts flags currentUser activeUsers shapesColors replaceColor theme localStorage createBoard createRectangle createEllipse
  createText createPath createBoolean createShapeFromSvg(WithImages) group ungroup uploadMediaUrl uploadMediaData
  generateMarkup generateStyle generateFontFaces openViewer createPage openPage alignHorizontal/Vertical
  distributeHorizontal/Vertical flatten createVariantFromComponents`.
* `penpot.library.local`: `colors typographies components tokens createColor createTypography createComponent` + pluginData;
  `penpot.library` also exposes `connected availableLibraries connectLibrary` (cross-file libraries).
* Official type definitions are the reference for names **but not for this build's names** (§2 padding). npm
  `@penpot/plugin-types@1.4.2`, 4419 lines; authoritative docs `doc.plugins.penpot.app`.
* The MCP server ships **5** tools (`execute_code`, `export_shape`, `high_level_overview`, `penpot_api_info`,
  `import_image`); a session that only sees 4 has a stale registration.

## 11. Capability → action (what the skill must now exploit)

| # | Native capability | What the skill does with it | Status |
|---|---|---|---|
| C1 | flex/grid with `fix`/`auto`/`fill`, real padding names, settle-then-measure | `storage.NL` authors screens with auto-layout; `LY` supplies the structure, `NL` supplies the flow; absolute stays for spec/art boards | **shipped** (`scripts/native_layout.js`, rules R1–R6, `whenSettled`/`auditFlow`/`nudge`/`fromRecipe`) |
| C2 | `comp.instance()` + per-instance text override + `instance.resize` | screens place **instances** of registered components instead of re-calling factories | **shipped** (`CF.get`/`CF.component`/`CF.register`/`CF.instance`, sizing declared `fix` and last) |
| C3 | variant containers + `switchVariant` | state/variant coverage becomes *switchable* on a delivered screen, not one board per state | **shipped** (`CF.variantSet`/`CF.variants` + `CF.swap`; rules in §5) |
| C4 | token apply round-trip + **theme activation repaints** | `· Core`/`· Dark` + `Scheme` themes become the actual light/dark switch; acceptance runs `TK.paint` → `TK.activateTheme` → `TK.changed` → re-export | **mechanics shipped** (§6; `TK.paint`/`TK.changed` added to `token_engine.js` — the full switch loop runs in the demo session) |
| C5 | library colors with `fillColorRefId` | a second re-skin channel for palettes; `shapesColors()` audit | **shipped** (`scripts/palette_engine.js`: `LIB.seed/bind/audit/replace`, §7 rules) |
| C6 | flows + interactions + animations | `14–16 · Screens` ship as a clickable prototype; a flow per primary task | #15 |
| C7 | `shape.exports` presets | delivery leaves batch-export configured; acceptance can run from the file, not the session | #15 |
| C8 | `board.guides` column grid | the grid diagram on `11` is a native guide, no invisible rects | #15 |
| C9 | `file.saveVersion(label)` / `findVersions` / `restore` | checkpoint before each risky batch; recovery without hand-rolled undo | #15 |
| C10 | `setPluginData` on shapes/pages | recipe key, tier and gate stamp travel **inside the file** → audits are re-runnable by anyone | **shipped** (`NL.stamp`/`NL.readStamp`) |
| C11 | `createShapeFromSvg` | icons become editable vectors from any SVG, plus a **bundled Lucide catalog** (1966 icons, ISC) with a placement/grid engine; emoji placeholders demoted to a fallback | **shipped** (`scripts/icon_engine.js` + `assets/icons/lucide.jsonl`: origin rule + `base-background` removal + recolor + resize-to-size + root-move-before-tmp-removal, see `references/icons.md`) |
| C12 | `generateStyle` / `generateMarkup` / `getBounds` | Design→Code gets CSS-accurate geometry from flow boards; text metrics stop being estimated | #16 |

## 12. Still unverified — do not claim these

* `Group.makeMask`, `penpot.flatten`, boolean ops beyond `createBoolean` existence.
* `createTypography` object shape (and `createColor` options *beyond* the create-then-assign recipe of §7 — six
  argument shapes were tried and all were ignored, but no accepted form was found).
* Cross-file `connectLibrary` behaviour and what `availableLibraries` returns in a multi-file team.
* `penpot.ui` messaging, `openViewer` result, comment-thread round-trip.
* Anything about the **exported-file** pipeline (`file.export`) beyond that the method exists — it has not been run.
* `transformInVariant()` / `addVariant()` / `variantError` semantics: they *exist* on records (§5), but no call has been
  exercised, so their effect is unknown.
* `replaceColor` on **strokes** (§7 measured fills only), and on a whole page rather than a shape array.
