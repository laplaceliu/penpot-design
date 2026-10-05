# Penpot MCP automation handbook (execute_code)

> Migrated from the penpot-mcp-automation skill (merged into penpot-design). Hardened through multiple complete runs (93 components + variants + 1920×1080 widescreen (web tier), 33 components + library components + Dashboard/Landing/Login/List/Detail/Settings six typical pages). **Now supports web / pad / mobile three viewport tiers** (see `references/viewport-profiles.md`); Demo and page-12 layout grids are built per selected tier, and the task start uses `ask_followup_question` to confirm the target width.
> Detailed mechanics and code: api-pitfalls.md (pitfall details) / engines.md (mechanics and recipes) / scripts/*.js (seed and engine code).

Operate Penpot files via the `execute_code` tool of the `penpot` MCP. All code runs in that tool's sandbox, with a 30-second timeout.

## 1. Session discipline (must obey every call)

1. **Page switching is asynchronous**: after `penpot.openPage(pageObj)`, creating/modifying shapes in the same call may hit the old page. Two reliable patterns:
   - Step-wise: this call only switches page and returns `{switching:true}`, the next call does the work;
   - Queue runner: `if (penpot.currentPage.name !== q[0]) { penpot.openPage(storage.pg(q[0])); return {wait:true}; }` → `const pg = q.shift(); work; if (q.length) penpot.openPage(...)`. **Note the runner pre-switches the next page at its tail; before probing/repairing you must verify `penpot.currentPage.name`**.
   - **Defensive verification at the start of every command**: `openPage(pg); await sleep(400); if (penpot.currentPage.name !== 'target page') return {err: currentPage.name};` — return immediately on mismatch, never run remove/create on the wrong page.
2. **Page object**: `openPage` only accepts a Page object or UUID. Helper `storage.pg = n => penpotUtils.getPageByName(n)`.
3. **Storage is volatile**: lost after plugin reconnect / browser crash. Before each batch probe `storage.T / storage.mkText / storage.absMount`; if missing, re-seed (seed template: `scripts/seed_storage.js`, extend per project theme).
4. **Batch size**: each call ≤8 primitives or ≤10 text; exceeding triggers the 30s timeout. A timed-out call may have partially taken effect — before retrying, probe residue to avoid duplicate creation. **When killed by timeout, openPage may not have committed**: the next command may land on the old page — switch page + verify before operating (lesson: once on the Foundations page a "remove all" was wrongly executed, wiping the whole page).
5. **Crash-damage pattern**: canvas crash (lots of glow blur + large files + frequent page switching are triggers; a symptom is also MCP reporting "No plugin instance connected") degrades the **last batch created before the crash** of board/rect/ellipse to default 100×100 (text unaffected; position/fill/z-order preserved). Detection: non-text primitive size exactly 100×100. Fix = resize per design spec, **including the header board** (header-board degradation makes the export all black). Disabling WebGL significantly stabilizes; mild freeze self-heals after sleep 60~120s.
6. **Return values**: only return raw values (number/string/flat array). Returning a function or complex object fails structuredClone (e.g. shape's makeMask).
7. **Cross-page operations**: modifying/deleting a non-active page object reports "Cannot modify a page that is not currently active" → activate its owning page first.

## 2. Building a new board: layout-approach decision

Try the three approaches in order, degrade when rendering is abnormal: **A bare board + world-coordinate appendChild** (simplest, but some environments export with a whole-page offset) → **B flex auto-layout** (needs engine layout, nested sub-boards get hug-collapsed) → **C flex container + all absolute + world coordinates** (recommended fallback, 33 components + 3 full pages 0 failures). The three approaches' build/render behavior and tested conclusions are in the detailed table in api-pitfalls.md §10.

Approach C standard writing (`mkAbsBoard`/`absMount` full engine in `scripts/seed_storage.js`):

```js
storage.mkAbsBoard = (name, x, y, w, h, fill, radius) => {
  const b = penpot.createBoard();
  b.name = name; b.x = x; b.y = y; b.resize(w, h);
  b.borderRadius = radius || 0;
  b.fills = fill ? [{ fillColor: fill, fillOpacity: 1 }] : [];
  b.addFlexLayout();
  b.flex.dir = 'column';
  try { b.horizontalSizing = 'fixed'; b.verticalSizing = 'fixed'; } catch (e) {}
  return b;
};
storage.absMount = (parent, child, worldX, worldY) => {
  parent.appendChild(child);
  child.layoutChild.absolute = true;   // ★ must be set AFTER appendChild
  child.x = worldX; child.y = worldY;  // in absolute mode x/y are world coordinates
};
```

**Diagnosis**: readback coordinates correct but export whole-page offset → approach A failed, rebuild that board with approach C (rebuilding is faster than patching). Export buttons/cards squashed to text size → approach B's hug collapse, after all `layoutChild.absolute = true` re-layout by design size.

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
| **Resizing a board and children** | Board resize **doesn't affect absolute children** (safe to expand the frame). But a board with non-absolute flex children, when resized, triggers the engine to `fix` sizing back to content size (collapse) — don't resize again after fixing |
| **CJK font fallback** | Penpot has no CSS font-stack fallback: `applyToText` applies to the whole paragraph, Chinese in Latin fonts like Nunito renders as garbage. **mkText auto-selects Noto Sans SC by `/[\u3000-\u9fff\uff00-\uffef]/`**; scan existing text `characters` for batch fix (`Text.fontWeight` can read the current weight directly, replace at same weight) |
| **Emoji rendering** | Penpot renders emoji as pixel-style graphics (same in exported PNG) — actually suitable for game/pixel-style design, can be used directly as icon placeholders |
| **Assembly ownership** | A complete primitive set (base plate + label + icon) **must not be loose same-level stacking**: reuse → component (`createComponent([group])`, pages use `comp.instance()`), single-use → **group**. **⚠️ `penpot.group` has destructive side effects** (group drops into flex flow position, members shift −minParentXY, board gets inflated; `ungroup` doesn't restore coordinates) — must use **compensatory grouping** (capture min parentXY → group → `absolute=true` → reset → readback), canonical implementation in `groupAssemblies()`. Group name = host name, component name forbids `/` use `·`. Contract `penpot-structure.md` §4.1, audit `loose_assembly` |

## 4. Variant containers (Variant)

**Group first, then register**: a multi-primitive assembly first `penpot.group([host, ...members])` to collect (assembly-ownership contract `penpot-structure.md` §4.1),
then `createComponent([group])` registers the whole group — child elements stay collected, component semantics complete; registering loose primitives directly yields a defective component containing only a single piece.

`penpotUtils.createVariantContainer(items)` requires the input to be **a registered library component's main instance**, passing a plain shape reports "ShapeProxy invalid":

```js
const comp = penpot.library.local.createComponent([realShape]);  // register, the original shape becomes the main instance
comp.name = 'Button·Primary·Default';                              // '/' not allowed
// after collecting all:
const container = penpotUtils.createVariantContainer(
  comps.map(c => ({ shape: c.mainInstance(), properties: { Type: t, State: s } }))
);
```

After reparent, the instance's internal child elements shift (e.g. +30,30) → reset `parentX/parentY` by the design relative coordinates. The component showcase board must be appendChild'd into the page header board (same-page reparent keeps world coordinates unchanged), otherwise the component is missing when exporting the header board.

**★ Deleting a component empties the showcase board**: after `createComponent([shape])` the original shape in-place becomes the main instance; **`comp.remove()` deletes the main instance along with it**. During batch de-dup/re-registration, if you register with a shape from the showcase board, the showcase board gets hollowed out (tested: 6 showcase boards emptied). Iron rule: **always register with shapes from a dedicated masters board (e.g. 'AI Component Masters')**; after accidental deletion rebuild the showcase board per recipe.

## 5. Recreating an existing UI library (React component library → Penpot)

1. **Read the full source before acting**: each component's `.tsx` + `.module.less` must be read. Drawing from a one-line doc impression misses key structure (lesson: the Title doc only says "swallowtail ribbon", the source is actually a five-layer structure — clip-path fishtail swallowtail / folded-corner border triangle / rotateX(3deg) front / inner shadow / text layer, default green `#27d039` not the theme color, em units scale with font size).
2. **Extract tokens**: CSS variables → storage.T (color/radius/spacing/shadow color), synced into `penpot.library.local.tokens` (addSet + addToken, type: 'color'/'borderRadius'/'dimension').
3. **Font decision**: read less's font-family stack → `penpot.fonts.findByName` to probe availability → mkText auto-routes by CJK regex.
4. **Build order**: Foundations page (palette/type scale/spacing radius shadow) → Components page (board per component) → register library components → assemble typical pages (Dashboard/Landing/Login/List/Detail/Settings reusing component recipe coordinates).
5. **Export and accept immediately after each board is built**, don't pile up to the end — layout problems found earlier cost less to rebuild.

## 6. Review and repair engines (mechanics in engines.md §1, code: scripts/repair_engines.js, scripts/fix_layout.js)

- **alignPage**: text snaps to "the smallest host (rect/ellipse, 24≤side, area≤20000) containing its world center" center; page-level direct text skipped; Breadcrumbs flow reflow; Tabs centered by column.
- **vAlignPage**: vertical centering of single-line direct-child text inside small boards (≤70px tall), with **vertical-stacking guard** (multi-line text with same-board x overlap≥50% = deliberate stacking, skip — prevents false-hurt on stepper buttons, top-aligned labels).
- **fixInner**: whole-file stroke batch fix (closed→inner, paths→center).
- **unclip**: whole-file `clipContent=false`.
- **gridSnap**: calendar/table grid snapping (colCx/rowCy to derive expected positions).

Common pattern: engines stored in `storage` as **literal functions**, queue stored in `storage.xxxQueue`, page-by-page runner execution; repair log returns `[{position, content, axis, offset}]` for manual review.

## 7. Acceptance discipline

- `export_shape({shapeId, format:'png'})` can only export shapes on the **currently active page**; before exporting confirm `penpot.currentPage` is the shape's page (sleep 500ms+ after switching); large boards (3000px+ full page) may time out (retry 2~3 times); occasional stale cache black image / old content (retrying heals it).
- **Board ids change after rebuild**: exporting an old id reports "Cannot read properties of null" — re-collect `board.id` before exporting.
- **Editor rendering ≠ export rendering**: defects like null strokeAlignment double lines, clipContent clipping glow are only visible in the editor. When the user says "I see X in the editor", you must diagnose with the editor rendering mechanism (clip/alignment/stroke semantics), not just look at the exported image.
- **Export may capture layout transition states**: data readback all correct but rendering garbled — wait 1s+ and re-export before judging, don't immediately change code.
- After fixing, export to the user, and ask the user to zoom in the editor to review.
- Programmatic audit is preferred: derive expected positions from the standard grid / host, compare item by item and return an offset list, then batch-fix — more reliable than eyeballing screenshots.

## 8. Building a design system (theme recipe)

The theme recipe is derived from DESIGN.md, and can be deposited into project-private docs as needed (not into SKILL). Common composition:

- **tokens**: color/font/radius/spacing/shadow/effect (e.g. glow) spec, strictly consistent with DESIGN.md.
- **seeds and factories**: seed template (`scripts/seed_storage.js`) + themed factory functions (mkText/mkRect/card constructor etc., namespace on `storage`).
- **layout coordinates**: component-page build order, full-page / widescreen partition coordinate table (visual-spec quick reference).
- **typical pages**: Dashboard/Landing/Login/List admin/Detail/Settings form and other page assembly recipes (engines.md §4 pattern + theme coordinates).

Experience: set tokens first → seed → build component pages board by board per spec + export accept → finally assemble full pages; complex decorations (ribbon/badge/multi-layer shadow) encapsulated as separate constructors, avoid scattered coordinates.

Layout-approach decision and tested behavior table are in api-pitfalls.md §10; the absMount engine is in `scripts/seed_storage.js`; the collapse-repair engine is in `scripts/fix_layout.js`.
