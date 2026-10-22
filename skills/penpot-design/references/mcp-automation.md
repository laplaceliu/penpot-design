# Penpot MCP automation handbook (execute_code)

> Migrated from the penpot-mcp-automation skill (merged into penpot-design). Hardened through multiple complete runs (93 components + variants + 1920×1080 widescreen (web tier), 33 components + library components + Dashboard/Landing/Login/List/Detail/Settings six typical pages). **Now supports web / pad / mobile three viewport tiers** (see `references/viewport-profiles.md`); the screen pages `14 · Screens · app` / `15 · Screens · content` / `16 · Screens · mobile` are built per selected tier from `storage.LY` recipes, and the task start uses `ask_followup_question` to confirm the target width.
> Detailed mechanics and code: api-pitfalls.md (pitfall details) / engines.md (mechanics and recipes) / scripts/*.js (seed, engines and repair code).
>
> **Since 1.6 the geometry is not improvised per task.** Three engines carry the design knowledge and the discipline below applies on top of them:
> `scripts/layout_engine.js` (`storage.LY.*` — every region rect), `scripts/component_factory.js` (`storage.CF.*` — every control),
> `scripts/audit_design.js` (`storage.designPage/designGate` — the design-rule lint, gate **G13**). Gate **G11** forbids hand-writing
> a region coordinate; gate **G12** forbids hand-building a component that `CF` cannot produce. Both auditors are independent:
> `audit_layout.js` judges positioning/overlap, `audit_design.js` judges spacing/typography/coverage.

Operate Penpot files via the `execute_code` tool of the `penpot` MCP. All code runs in that tool's sandbox.

### The three timeouts, read off the deployed server (`/opt/penpot/mcp/index.js`), not guessed

| Constant | Value | What it kills |
|---|---|---|
| `EVAL_TIMEOUT_MS` | **30 000** | one `execute_code` call. This is the number every batch size below is planned against |
| `taskTimeoutSecs` | 30 (configurable) | the plugin-task round-trip (same order as eval) |
| `IMPORT_TIMEOUT_MS` | 120 000 | file import only — **not** a licence to run a 2-minute `execute_code` |
| `HEARTBEAT_STALE_THRESHOLD_MS` | 30 000 (hardcoded) | a hidden/minimized plugin tab stops the heartbeat → the server rejects **all** tool calls |
| `resolveTimeoutMs` | 15 000 | resolving a connected plugin |

Practical consequence: **30s per call is the real budget**, so every engine in `scripts/` is written as a queue runner
(`designStart`/`designNext`/`designAll`, `auditAll`, `scaffoldQueue`) that does one page — sometimes one switch — per call.

## 1. Session discipline (must obey every call)

1. **Page switching is asynchronous**: after `penpot.openPage(pageObj)`, creating/modifying shapes in the same call may hit the old page. Two reliable patterns:
   - Step-wise: this call only switches page and returns `{switching:true}`, the next call does the work;
   - Queue runner: `if (penpot.currentPage.name !== q[0]) { penpot.openPage(storage.pg(q[0])); return {wait:true}; }` → `const pg = q.shift(); work; if (q.length) penpot.openPage(...)`. **Note the runner pre-switches the next page at its tail; before probing/repairing you must verify `penpot.currentPage.name`**.
   - **Defensive verification at the start of every command**: `openPage(pg); await sleep(400); if (penpot.currentPage.name !== 'target page') return {err: currentPage.name};` — return immediately on mismatch, never run remove/create on the wrong page. Measured 2026-10-21: **without the sleep the name never changes inside the call**, so three audits of "three pages" were three verdicts about the one page that was already open. The auditors now do this themselves (`designPage({page})` refuses, `FN.check` settles 700 ms and refuses on a name mismatch, `designNext` opens+waits+verifies).
2. **Page object**: `openPage` only accepts a Page object or UUID. Helper `storage.pg = n => penpotUtils.getPageByName(n)`.
3. **Storage is volatile**: lost after plugin reconnect / browser crash. Before each batch probe `storage.T / storage.mkText / storage.absMount`; if missing, re-seed (seed template: `scripts/seed_storage.js`, extend per project theme).
4. **Batch size**: each call ≤8 primitives or ≤10 text; exceeding triggers the 30s eval timeout. A timed-out call may have partially taken effect — before retrying, probe residue to avoid duplicate creation. **When killed by timeout, openPage may not have committed**: the next command may land on the old page — switch page + verify before operating (lesson: once on the Foundations page a "remove all" was wrongly executed, wiping the whole page).
5. **Crash-damage pattern**: canvas crash (lots of glow blur + large files + frequent page switching are triggers; a symptom is also MCP reporting "No plugin instance connected") degrades the **last batch created before the crash** of board/rect/ellipse to default 100×100 (text unaffected; position/fill/z-order preserved). Detection: non-text primitive size exactly 100×100. Fix = resize per design spec, **including the header board** (header-board degradation makes the export all black). Disabling WebGL significantly stabilizes; mild freeze self-heals after sleep 60~120s.
6. **Return values**: only return raw values (number/string/flat array). Returning a function or complex object fails structuredClone (e.g. shape's makeMask).
7. **Cross-page operations**: modifying/deleting a non-active page object reports "Cannot modify a page that is not currently active" → activate its owning page first. **Reading is exempt**: `pageRootOf(name)` walks a non-current page's tree fine (measured: 70 spec boards scanned in 2.8 s), so inventory/audit passes need no page switching — only writes do.
8. **Self-budget long passes (`while (q.length && Date.now()-t0 < 21000)`)**: the 30 s ceiling kills the *response*, not the *work* — a "timed out" rebuild normally completed and placed its board seconds later, and a second blind rebuild is what stacks twins. So every driver returns `{done, left}`, is idempotent (skip-if-exists), and is followed by a stray sweep rather than a retry.
9. **Repair in place before rebuilding.** An audit finding carries `board/shape/x/y/w/h`; a text label is writable
   (`shape.characters = …`), an instance child is positionable (`child.x = …`) though not resizable
   (`child.width = …` throws). The rebuild path is reserved for boards whose *structure* is wrong — a rebuild costs every
   derived artifact that reads it (masters, flows, TOC, index, exports), and a repair costs none of that.

## 2. Building a new board: layout-approach decision

Choose the approach **per artifact**, not by habit — the old "B fails → fall back to C" ordering is superseded
(capabilities §2 marked it FALSIFIED; the historical hug collapse was vocabulary: `'fixed'` instead of `'fix'`, `paddingTop…`
instead of `topPadding…`, both silently dropped, and a `resize()` that downgrades a flow child's sizing, R5):

* **B flex auto-layout (`storage.NL`)** — **the default for screens and regions**, because the file stays editable
  (a designer changing copy re-wraps the row). Settle with `NL.whenSettled`, prove with `NL.auditFlow`.
* **A bare board + world-coordinate appendChild** — simple one-offs only; re-check the whole-page export offset on the
  first board before batching (some environments show `-board.y` in export while readback looks right).
* **C flex container + all absolute (`mkAbsBoard`/`absMount`)** — the `03–09` `CF` spec boards, anatomy diagrams, art and
  pixel-exact overlays (native-layout §9): 33 components + 3 full pages with 0 rendering failures, and it bypasses reflow
  by design. **Not `01.xx`/`02.xx`**: a Foundations board is a hug column of hug rows produced by `FN.project` (G16) — the
  only thing approach C is used for there is the shelf pin, which `FN.place` declares (`nl:shelf`).

Degrade only with evidence from an export: export offset → suspect A; a screen that no longer re-flows → it was authored
absolute, re-build the interior with `NL`, not `fix_layout`. The measured table for all three is in api-pitfalls.md §10.

Approach C standard writing (`mkAbsBoard`/`absMount` full engine in `scripts/seed_storage.js`):

```js
storage.mkAbsBoard = (name, x, y, w, h, fill, radius) => {
  const b = penpot.createBoard();
  b.name = name; b.x = x; b.y = y; b.resize(w, h);
  b.borderRadius = radius || 0;
  b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  b.addFlexLayout();
  b.flex.dir = 'column';
  // sizing vocabulary is 'fix' | 'auto' — NOT 'fixed'/'hug'; assigning 'fixed' throws under the v2 manifest and a
  // try/catch swallows it, so the board only appears to work because 'fix' happens to be the default.
  try { b.horizontalSizing = 'fix'; b.verticalSizing = 'fix'; } catch (e) {}
  return b;
};
storage.absMount = (parent, child, worldX, worldY) => {
  parent.appendChild(child);
  child.layoutChild.absolute = true;   // ★ must be set AFTER appendChild
  child.x = worldX; child.y = worldY;  // in absolute mode x/y are world coordinates
};
```

**Diagnosis**: readback coordinates correct but export whole-page offset → approach A failed, rebuild that board with approach C (rebuilding is faster than patching). Export buttons/cards squashed to text size → a **sizing/padding vocabulary** bug (invalid `'fixed'`, `paddingTop…` names — capabilities §2, or a `resize()` that downgraded the sizing: `NL.auditFlow` → `sizing_dropped`), repair with `NL.nudge`/`NL.sizing`; only a spec/art board should be re-laid out absolute (approach C).

## 3. Core pitfall quick-reference table (detailed mechanics and code in api-pitfalls.md)

| Pitfall | Correct approach |
|---|---|
| Path has no `setPathData` method | Assign via the `path.d` property; reading/writing `d` are both **world coordinates**, auto-adapts the bounding box after writing |
| SVG arc `A` command doesn't render (new Path defaults to `d="M0,0L100,100"` diagonal) | Arc → cubic bezier: kappa=4/3·tan(θ/4), each segment ≤90° |
| `appendChild` preserves world coordinates | Place child at final world coordinates first, then append; or after append use `penpotUtils.setParentXY(child, relX, relY)`. Setting relative values first then append → child lands at page origin |
| Stroke-alignment property name | It's `strokeAlignment` ('center'/'inner'/'outer'), there is no strokeWidthAlignment, assigning silently drops it to null. **Closed shapes always 'inner'** (center overflows half the stroke width, clipped when touching the parent board edge → double rounded lines / uneven thickness); open paths (arc/polyline) use 'center' |
| Board clip property | It's `clipContent` (not clipsContent). The board hosting glow elements must have `clipContent = false`, otherwise the glow is clipped invisible |
| Moving a component's main-instance child element | `penpotUtils.setParentXY` fails; directly assign `child.parentX/parentY` (works everywhere for normal shapes + main instances) |
| Sandbox scope | penpotUtils/storage are not true globals; a function body serialized by `new Function` can't access them → persistent engines must be stored in `storage` as literal function definitions |
| children/parent proxy | Each access to `shape.children`/`shape.parent` generates a new proxy, **reference comparison (`===`/`indexOf`) is always false/-1** → `Array.from(children)` single snapshot; **parent/child and same-group judgments compare by `.id`** (`m.parent.id === p.id`). Practical lesson: assembly-ownership idempotent judgment using `===` gets fooled into "never compliant", repeatedly nesting into groups |
| Component name | `/` is not allowed (assigning silently fails), use `·` separator, e.g. `Button·Primary·Default` |
| Text positioning | Width/height at the creation instant is unreliable (may be 1×1). **Center by actual width/height after rendering** (`await storage.ct(...)`, internally sleeps 120ms tested; or `storage.centerIn(t, host)`), otherwise offset by a few to tens of pixels. **Fingerprint**: the misaligned text's top-left corner lands exactly on the host center (arithmetic consequence of `(w−1)/2`); repair engine `storage.fixStaleCenter()`, audit mark `stale-center` (positioning-audit.md S2) |
| Coordinate-system mixing | `child.x/y` and `board.x/y` are world coordinates; `parentX/parentY` are parent-relative. Containment judgment / snap computation use world coordinates throughout. Conversion: `new parentX = worldX - parent.x` |
| **Moving a board = shell moves, content doesn't** | Assigning x/y to a board with `absolute` children, the children keep world coordinates and don't follow → board content falls apart. **Place final coordinates directly at build time, never move an already-built board**; when bulk-moving is unavoidable, compensate `dy` element by element |
| **Resizing a board and children** | Board resize **doesn't affect absolute children** (safe to expand the frame). On a **flow** child it is destructive: `resize()` silently downgrades that child's sizing to `fix` (native-layout R5) — declare the sizing after the last resize; resizing the **parent** downgrades the parent's own sizing the same way (that is what `NL.nudge` compensates). `NL.auditFlow` reports both as `sizing_dropped` |
| **CJK font fallback** | Penpot has no CSS font-stack fallback: `applyToText` applies to the whole paragraph, Chinese in Latin fonts like Nunito renders as garbage. **mkText auto-selects Noto Sans SC by `/[\u3000-\u9fff\uff00-\uffef]/`**; scan existing text `characters` for batch fix (`Text.fontWeight` can read the current weight directly, replace at same weight) |
| **Emoji rendering** | Penpot renders emoji as pixel-style graphics (same in exported PNG) — actually suitable for game/pixel-style design, can be used directly as icon placeholders |
| **Assembly ownership** | A complete primitive set (base plate + label + icon) **must not be loose same-level stacking**: reuse → component (`createComponent([group])`; on a screen **place an instance** with `CF.instance` + `CF.swap` — instancing is scriptable, api-pitfalls.md §6), single-use → **group**. **⚠️ `penpot.group` has destructive side effects** (group drops into flex flow position, members shift −minParentXY, board gets inflated; `ungroup` doesn't restore coordinates) — must use **compensatory grouping** (capture min parentXY → group → `absolute=true` → reset → readback), canonical implementation in `groupAssemblies()`. Group name = host name, component name forbids `/` use `·`. Contract `penpot-structure.md` §4.3, audit `loose_assembly` |
| **Interaction destination** | `addInteraction('click', {type:'navigate-to', destination: board})` needs the **shape**; an id (or `destinationId`/`screen`/`target`) is accepted with no error and **silently dropped** — verify with `PR.read(shape).destination` (`prototype_engine.js`, capabilities §8) |
| **Interaction list is append-only** | `shape.interactions` is read-only; `addInteraction` appends; the only mutator is `removeInteraction(interactionObject)` (an index/id throws `Value not valid: 0`) → `PR.clear(shape)` before re-authoring |
| **Prototype entry point** | With no flow on the page, wiring navs creates machine-named `Flow 1..N`. Call `PR.ensureFlow(name, board)` **first**, then read `page.flows` back |
| **Checkpoint ≠ returned call** | `file.saveVersion(label)` resolved once and later never settled while the write landed *after* the call had timed out — the only evidence is the label appearing in `await file.findVersions()`. `PR.checkpoint` polls 6 s and returns `ok:false` if it cannot see it |
| **SVG icon import location** | `createShapeFromSvg` drops the group **at world (0,0) inside the board covering the origin** (selection/viewport ignored) and adds a `base-background` rectangle; if the origin sits in a component copy the group cannot be reparented (`…Cannot change the structure of a component copy`) → `CF.svgIcon` imports through a throwaway board there (capabilities §7/§9) |
| **Library color creation** | `penpot.library.local.createColor({name, color})` **ignores its arguments** (six shapes measured) → create then assign `.name`/`.color`; the call lives on `library.local`, not on `library.local.colors` |
| **Seeding the big engines** | `execute_code` arguments are capped (~21 KB) — never paste `component_factory.js` (264 KB). Serve the skill (`scripts/serve_skill.py`, loopback+CORS) and build each engine with `new Function('storage','penpot','penpotUtils', src)` after fetching (engines.md §"Seeding without pasting"). `scaffold_structure.js`/`fix_layout.js` **execute on load** (runners) and scaffold schedules page switches |
| **createPage ignores its name** | `penpot.createPage('01 · Foundations')` lands as `Page N` → `const p = createPage(); p.name = …` then read back via `getPageByName`. And `getPages()` returns **detached snapshots** (`name` writes silently no-op, `remove` undefined) — resolve through `getPageByName` for anything you mutate |

## 4. Variant containers (Variant)

**Group first, then register**: a multi-primitive assembly first `penpot.group([host, ...members])` to collect (assembly-ownership contract `penpot-structure.md` §4.3),
then `createComponent([group])` registers the whole group — child elements stay collected, component semantics complete; registering loose primitives directly yields a defective component containing only a single piece.

`penpotUtils.createVariantContainer(items)` requires the input to be **a registered library component's main instance**, passing a plain shape reports "ShapeProxy invalid":

```js
const comp = penpot.library.local.createComponent([realShape]);  // register, the original shape becomes the main instance
comp.name = 'Button·Primary·Default';                              // '/' not allowed
// after collecting all:
const container = penpotUtils.createVariantContainer(
  comps.map(c => ({ shape: c.mainInstance(), properties: { Type: t, State: s } }))
);
container.name = 'Button';                                        // rename the container …
// … and the merged record (find it via `c.variants.id === container.id`), e.g. `rec.name = 'Button'`
```

Measured rules (capabilities §5, `CF.variantSet` implements them):

- **`properties` is required on every entry** — without it: `TypeError: Cannot convert undefined or null to object`.
  The property table comes from that argument only; layer names are not the source of truth.
- The merge **consumes the source records** (two flat records → one variant record with `variants:{id, properties:[…]}`).
- The platform **renames every head to the container's name**, and renaming a head afterwards **wipes the property
  table** (`variantProps` → `{}`, `properties` → `[]`) and reverts the name. Never touch the heads; the family name goes
  on the container **and** the record. Head layer names are therefore the one place where `CF.name`'s
  `Family·Type·Size·State·Slot` format does **not** apply.
- Switch placed instances with **`inst.switchVariant(posIndex, value)`** — pos is a **number** (a string throws
  `Value not valid: Type. Code: :pos`); the same value is a silent no-op. Set the record's default with
  `setVariantProperty(pos, value)` (record-level; `setVariantProperty` does not exist on instances).
  For flat (non-variant) components use `CF.swap(inst, name)` instead.

After reparent, the instance's internal child elements shift (e.g. +30,30) → reset `parentX/parentY` by the design relative coordinates. The component showcase board must be appendChild'd into the page header board (same-page reparent keeps world coordinates unchanged), otherwise the component is missing when exporting the header board.

**★ Deleting a component empties the showcase board**: after `createComponent([shape])` the original shape in-place becomes the main instance; **`comp.remove()` deletes the main instance along with it**. During batch de-dup/re-registration, if you register with a shape from the showcase board, the showcase board gets hollowed out (tested: 6 showcase boards emptied). Iron rule: **always register with shapes from a dedicated masters board (e.g. 'AI Component Masters')**; after accidental deletion rebuild the showcase board per recipe.

## 5. Recreating an existing UI library (React component library → Penpot)

1. **Read the full source before acting**: each component's `.tsx` + `.module.less` must be read. Drawing from a one-line doc impression misses key structure (lesson: the Title doc only says "swallowtail ribbon", the source is actually a five-layer structure — clip-path fishtail swallowtail / folded-corner border triangle / rotateX(3deg) front / inner shadow / text layer, default green `#27d039` not the theme color, em units scale with font size).
2. **Extract tokens**: CSS variables → storage.T (color/radius/spacing/shadow color), synced into `penpot.library.local.tokens` (addSet + addToken, type: 'color'/'borderRadius'/'dimension').
3. **Font decision**: read less's font-family stack → `penpot.fonts.findByName` to probe availability → mkText auto-routes by CJK regex.
4. **Build order**: `01 · Foundations` + `02 · Color in use` — **projected by `storage.FN`, one board kind per call; there
   is no other producer** (`FN.project({page,kind[,set]})` → `FN.bindNext({page})` until `allBound`; no height array, no hex
   mirror, engines.md §7). Gating those pages requires FN seeded first: rule 31 `not_projected` reads FN's chapter table
   and the `nl:fn` stamp FN writes, and `storage.designCoverage()` answers the file-level question (block-per-page means
   a chapter spans ~9 pages).
   → `03–09` one `Family·Spec` board per component family, produced by `CF.matrix` and packed by `LY.pack`
   → `10–12` chrome, grid, recipes → `13 · Component index` → register library components → `14–16` the screen recipes.
   When the recreated library has numbers of its own, they **override the consensus defaults** (they are the target);
   where it gives none, keep `LY`/`CF` values.
5. **Export and accept immediately after each board is built**, don't pile up to the end — layout problems found earlier cost less to rebuild.

## 5.5 Driving the build through the engines (the only sanctioned path)

```js
// one call = one page. Seed order: seed_storage → layout_engine → component_factory → native_layout → audit_design
// (token_engine / palette_engine / prototype_engine have no engine deps, seed any time).
const r = await storage.designNext({ tier: 'web' });       // build/audit the next queued page

// a screen = LY outside (absolute region plan) + NL inside (flow) + CF leaves (controls or instances):
const host = storage.mkAbsBoard('dashboard · web', 80, 240, 1440, 900, '#FFFFFF', 0);
const sk = storage.NL.fromRecipe('dashboard', { w: 1440, tier: 'web', x0: 80, y0: 240, parent: host });
if (sk.err) return sk;                                    // tier refusal is an answer, not an obstacle
await storage.CF.toolbar({ parent: sk.regions.header, rect: storage.LY.rect('filterBar') });
const cell = storage.CF.instance(storage.CF.name('Button', { type: 'primary', size: 'md' }),
                                 { parent: sk.regions.header, text: 'Deploy' });   // reuse, not re-draw
storage.NL.guide(sk.regions.content, { cols: 12, margin: 24, gutter: 16 });         // native grid
await storage.NL.whenSettled(host);                       // poll the stale fingerprint, don't guess a sleep
const flow = storage.NL.auditFlow(host);                  // must be CLEAN before the gates below
storage.LY.fold(host, 'web');                             // the 2px accent first-viewport marker
```

- **Numbers enter the file only from `LY` (rects, spacing, tiers) or `CF` (control metrics)**. A coordinate typed into
  `execute_code` is gate **G11**; a control drawn without its factory is gate **G12** and will also fail `name_invalid`,
  because coverage is read from the `Family·Type·Size·State·Slot` name the factories emit.
- **Gap: name the hierarchy level, not the number.** `NL.frame(name, {breath:'block'})` / `NL.reflow(board, {breath:'group'})`
  resolve through `LY.breath(level, tier)`, the same table `designGate` judges, so a declared breath cannot fire `cramped_gap`
  or `off_scale_gap` (rules 32/33, native-layout R7). A frame with neither `breath` nor `gap` gets flex's default **0** — two
  blocks touching because nobody decided. Typographic air is the same contract: leading comes from the ramp (`CF.lineH(fs)`),
  and a wrapped paragraph needs ≥ one line before the next block (rule 34).
- **Sizing on a flow child is declared last, after every `resize()`** (native-layout R5): `resize()` downgrades a flow
  child's sizing to `fix` silently, and `NL.auditFlow` is the only thing that notices (`sizing_dropped`). Control hosts
  and instances take `'fix'/'fix'`; `'auto'` on a board means **hug** and collapses a button to its label.
- **A missing recipe or factory is a bug in the engine**, not a reason to hand-build: add the recipe to
  `layout_engine.js` and document it in `layout-library.md`, or add the factory to `component_factory.js` and to
  `CF.map()`. The docs and the scripts are diffed mechanically, so an undocumented addition fails.
- **Before delivery**: `storage.designGate({ tier })` (G13) **and** `storage.auditPage()` (positioning) **and**
  `storage.NL.auditFlow(board)` per screen — three verdicts, all `CLEAN`. Then, if the deliverable ships interactive:
  wire it with `storage.PR.prototype(links, {flow})` (check every row's `dropped:false` and read `PR.flows()` back),
  and prove the theme with `TK.paint` → `TK.activateTheme` → `TK.changed` (design-tokens §9.1).

## 6. Review and repair engines (mechanics in engines.md §1, code: scripts/repair_engines.js, scripts/fix_layout.js)

- **alignPage**: text snaps to "the smallest host (rect/ellipse, 24≤side, area≤20000) containing its world center" center; page-level direct text skipped; Breadcrumbs flow reflow; Tabs centered by column.
- **vAlignPage**: vertical centering of single-line direct-child text inside small boards (≤70px tall), with **vertical-stacking guard** (multi-line text with same-board x overlap≥50% = deliberate stacking, skip — prevents false-hurt on stepper buttons, top-aligned labels).
- **fixInner**: whole-file stroke batch fix (closed→inner, paths→center).
- **unclip**: whole-file `clipContent=false`.
- **fixStaleCenter / groupAssemblies / fixZOrder / cleanOrphans**: stale-center offset, assembly ownership (G10), group z-order, root-level crash residue.
- **gridSnap**: calendar/table grid snapping (colCx/rowCy to derive expected positions) — for **repaired** legacy grids only; a new calendar is `LY.recipe('calMonth')` + `CF.miniCalendar`, which cannot be off-grid.

Common pattern: engines stored in `storage` as **literal functions**, queue stored in `storage.xxxQueue`, page-by-page runner execution; repair log returns `[{position, content, axis, offset}]` for manual review.

**Repair never outranks the producer.** If a signature keeps coming back (`off_grid`, `variant_sparse`, `rhythm_inconsistent`),
the fix is in `LY`/`CF`/the palette, not in a one-off patch on the board — patching the pixels is how a file ends up with
100 boards that all carry the same hand-typed mistake.

## 7. Acceptance discipline

- `export_shape({shapeId, format:'png'})` can only export shapes on the **currently active page**; before exporting confirm `penpot.currentPage` is the shape's page (sleep 500ms+ after switching); large boards (3000px+ full page) may time out (retry 2~3 times); occasional stale cache black image / old content (retrying heals it).
- **Board ids change after rebuild**: exporting an old id reports "Cannot read properties of null" — re-collect `board.id` before exporting.
- **Editor rendering ≠ export rendering**: defects like null strokeAlignment double lines, clipContent clipping glow are only visible in the editor. When the user says "I see X in the editor", you must diagnose with the editor rendering mechanism (clip/alignment/stroke semantics), not just look at the exported image.
- **Export may capture layout transition states**: data readback all correct but rendering garbled — wait 1s+ and re-export before judging, don't immediately change code.
- After fixing, export to the user, and ask the user to zoom in the editor to review.
- Programmatic audit is preferred: derive expected positions from the standard grid / host, compare item by item and return an offset list, then batch-fix — more reliable than eyeballing screenshots.
- **Batch export at delivery scale goes through a loopback receiver, not `export_shape`.** `export_shape` returns one
  image to the model per call (fine for a spot check, hopeless for 30 boards); inside `execute_code`
  `await shape.export({type:'png', scale:1})` yields a `Uint8Array` that can be `POST`ed to a local
  `http://127.0.0.1:8778/png?name=…` sink, which writes it under `exports/` for PIL to measure and tile
  (`assets`-side reference implementation: `export_receiver.py` + `tools/contact_sheet.py` in a task directory).
  Budget ~3 s per full-screen board, so the loop self-budgets like any other long pass.
- **A repair invalidates its page's exports.** After any change to a board, re-export that board before describing it as
  accepted, and re-run the blank/flat check (grayscale `pstdev < 8` catches a tile that exported empty). Screenshots that
  predate a repair are not evidence about the repaired file.
- **A gate cannot see text.** `designGate`/`auditPage` judge paint, geometry and contrast of *rendered* copy; a caption
  that *quotes* a token value (`wash #E7E1F9`, `7.34:1 …`) is plain text and stays silently stale when the swatch next to
  it is token-bound and therefore correct. Boards that document values must be built **after** the theme overlay lands,
  and when in doubt re-derive the caption from the sibling shape's own `fills[].fillColor` — then look at the export.

## 8. Building a design system (theme recipe)

The theme recipe is derived from DESIGN.md, and can be deposited into project-private docs as needed (not into SKILL). Common composition:

- **tokens**: color/font/radius/spacing/shadow/effect (e.g. glow) spec, strictly consistent with DESIGN.md.
- **seeds and factories**: seed template (`scripts/seed_storage.js`) + the variant-producing factories
  (`scripts/component_factory.js`); project-private additions go into `CF` with a `CF.map()` entry, never into a task script.
- **layout**: `scripts/layout_engine.js` recipes + the theme's own overrides (`LY.SPACE`, `LY.TIERS`, container width).
  A per-task "partition coordinate table" is **not** a deliverable any more — it is what gate G11 removes.
- **typical pages**: the screen recipes of `layout-library.md §3/§5` rendered at each selected tier (pages 14–16), not a
  hand-picked Dashboard/Landing/Login set re-derived per task.

Experience: set tokens first (`TK.seed` + `LIB.seed`) → seed (`seed_storage` → `layout_engine` → `component_factory` →
`native_layout`) → build component pages board by board per spec + export accept → assemble full pages with
`NL.fromRecipe` + `CF.instance` → wire interactions (`PR.prototype`) and prove the theme (`TK.paint`/`changed`) at
acceptance; complex decorations (ribbon/badge/multi-layer shadow) encapsulated as a `CF.*` factory with a `·`-named host,
so coverage and the lint can see them.

The layout-approach history (A/B/C) and its measured status — B is fixed and now the default, C stays for spec/art — is
in api-pitfalls.md §10; the absolute engines are `scripts/seed_storage.js` + `scripts/fix_layout.js`, the flow engine is
`scripts/native_layout.js`, and the color/prototype channels are `scripts/palette_engine.js` / `scripts/prototype_engine.js`.
