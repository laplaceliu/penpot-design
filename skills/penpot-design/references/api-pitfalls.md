# Penpot MCP execute_code API pitfalls (detailed)

Each item is a battle-tested pitfall (93-component design-system build + multiple repair rounds). Organized by topic, with mechanics and fix code.

## 1. Coordinate system

- `child.x / child.y`: **world coordinates** (absolute on canvas). `board.x / board.y` are also world coordinates.
- `child.parentX / child.parentY`: **parent-relative coordinates**.
- Conversion: `parentX = worldX - parent.x`; reverse `worldX = parent.x + parentX`.
- Containment judgment, host snapping, grid derivation must **use world coordinates throughout**. Mixing parentX produces cross-level false containment (e.g. dragging a page-level title into a Modal component's center).
- Correct post-fix writing: `c.parentX = nx - c.parent.x` (nx = expected world x).

### appendChild world-coordinate rule

`appendChild` **preserves world coordinates**. Two correct orders:

```js
// (a) place final world coordinates first, then append
child.x = finalWorldX; child.y = finalWorldY;
parent.appendChild(child);

// (b) append first, then set relative coordinates
parent.appendChild(child);
penpotUtils.setParentXY(child, relX, relY);   // note: fails for component main-instance children, see §5
child.parentX = relX; child.parentY = relY;   // direct assignment fallback
```

Wrong order (set "relative intent values" first then append to a non-origin parent board) → child lands at the page origin.
Batch fix (idempotent, order-independent): for each child of a non-root parent `setParentXY(child, child.x, child.y)` (relative := current world); **skip the direct children of variant containers**.

### Move-mechanism priority

```js
const move = (s, px, py) => {
  try { s.parentX = px; s.parentY = py; return true; } catch(e1) {}   // preferred: works everywhere
  try { s.x = px; s.y = py; return true; } catch(e2) {}               // fallback: world coordinates
  return false;
};
```

`penpotUtils.setParentXY` exists and works for normal shapes, but **throws for component main-instance child elements**.

## 2. Path and bezier

- Path objects have **no `setPathData` method** (calling silently fails inside try/catch). The only entry is the `path.d` property.
- The getter/setter of `path.d` are both **world coordinates**; after writing, width/height auto-adapt the bounding box (d doesn't change when the object moves — moving changes x/y).
- A newly created `penpot.createPath()` defaults to `d = "M0,0L100,100"` (diagonal) — a mysterious diagonal appearing in the export means a path wasn't assigned.
- SVG arc `A` command **doesn't render** (silently ignored). Arcs must be converted to cubic bezier:

```js
// arc → cubic bezier (each segment ≤90°). Returns world-coordinate d.
function bez(cx, cy, r, a0deg, a1deg) {
  const segs = Math.max(1, Math.ceil(Math.abs(a1deg - a0deg) / 90));
  const a0 = a0deg * Math.PI / 180;
  const total = (a1deg - a0deg) * Math.PI / 180;
  let d = 'M ' + (cx + r * Math.cos(a0)).toFixed(2) + ' ' + (cy + r * Math.sin(a0)).toFixed(2);
  let prev = a0;
  for (let i = 1; i <= segs; i++) {
    const next = a0 + total * i / segs;
    const k = 4 / 3 * Math.tan((next - prev) / 4);
    const p0x = cx + r * Math.cos(prev), p0y = cy + r * Math.sin(prev);
    const p1x = cx + r * Math.cos(next), p1y = cy + r * Math.sin(next);
    d += ' C ' + (p0x - k * r * Math.sin(prev)).toFixed(2) + ' ' + (p0y + k * r * Math.cos(prev)).toFixed(2)
       + ' '   + (p1x + k * r * Math.sin(next)).toFixed(2) + ' ' + (p1y - k * r * Math.cos(next)).toFixed(2)
       + ' '   + p1x.toFixed(2) + ' ' + p1y.toFixed(2);
    prev = next;
  }
  return d;
}
```

- M/L/C commands work normally. Polyline `toD = pts => 'M ' + pts.map(p => p[0]+' '+p[1]).join(' L ')`.
- Area chart: append `L x_last y_base L x_first y_base Z` at the end of the polyline d.
- **Bubble with arrow (Popover/Tooltip)**: merge the bubble outline + arrow bump into **one continuous path** (rounded corners via kappa approximation, arrow as a V-shaped bump on the base edge). Don't use "rotate a 45° square against the edge" as the arrow — at a panel's top the z-order shows an ✕ crossing line, at the bottom it gets crossed by the panel's base-edge stroke.

## 3. Stroke strokeAlignment

- The property name is `strokes[i].strokeAlignment`, values `'center' | 'inner' | 'outer'`. There is **no** `strokeWidthAlignment` — assigning it is silently dropped, leaving the property `null`.
- `null` behavior: the export renderer ≈ center; **the editor canvas renderer draws double lines on rounded corners**.
- `center`: stroke width overflows half inside and out. When a shape **touches the parent board edge**, the outer half is clipped by the board → straight edges keep only the inner half, rounded-arc inner parts keep full width → "double-line width at rounded corners / uneven thickness".
- `inner`: stroke fully drawn inside the shape, never clipped, never covered by neighbors. inner's rounded-corner seam only appears at extreme values (r60 + w10); design spec w1-2 / r≤20 is clean.
- **Conclusion: closed shapes (rect/ellipse/board) always explicitly `'inner'`; open paths (arc/polyline, where stroke is the line itself) use `'center'`** (inner is semantically inapplicable to open paths, and there's no clip risk around open paths).
- Verification: build an enlarged contrast board (r60, w10, four alignments side by side), export and eyeball + count all-page `strokes.some(st => !st.strokeAlignment)`.
- Batch fix:

```js
c.strokes = c.strokes.map(st => Object.assign({}, st, { strokeAlignment: want }));
```

## 4. Clip clipContent

- The property name is the board's **`clipContent`** (not clipsContent — if you read undefined, suspect the property name first). Default `true`.
- Mechanism: drop-shadow radiates outside the shape (blur+spread). When a shape touches the parent board edge (e.g. button cap same size as its instance board), the glow is entirely clipped → glow invisible in the editor, only shows when you drag the element out of the container.
- Fix: all boards hosting glow elements `clipContent = false`. Safety: glow radius (blur 20 + spread 1 ≈ 21px) must be smaller than the component gap (38-40px), otherwise adjacent glows pollute each other.
- Whole-file batch fix: walk all `type==='board' && clipContent===true` → false.

## 5. Text

- `Text.letterSpacing` only accepts a **numeric string** (px). `t.fontSize = String(size)`. Passing `'0.02em'` / `'2%'` errors.
- **`t.width/t.height` at the creation instant is unreliable** (may be a 1×1 transient value): reading width/height right after `penpot.createText()` to compute centering bakes the wrong offset into coordinates — the arithmetic consequence of `(w−1)/2` is **the text's top-left corner lands exactly on the host's center** (stale-center fingerprint, tested: a 37×15 label inside a 110×32 pill is shifted +18.5px right, +7.5px down, systematically copied across 16 pages).
  - Prevention: centering always **measured after rendering** — `await storage.ct(...)` (canonical, internally `sleep(120)`) or `storage.centerIn(t, host)` (synchronous version when the text is already rendered). **Don't** read `t.width` synchronously in the factory to compute offset.
  - Post-fix: `storage.fixStaleCenter()` (fingerprint judgment, per-axis independent, zero false-hurt), audit marks `text_centre_residue stale-center`. See `positioning-audit.md` S2 and `engines.md` §1.
- Shadow color must be object format `{color, opacity}`; passing a string hex is **silently converted to black** (root cause of the rendering 3D shadow disappearing). Use the `fillOpacity` field for semi-transparent fills (don't nest rgba inside a color object).
- **CJK font fallback is a systemic problem**: Penpot has **no** CSS font-stack per-character fallback — `font.applyToText(text, variant)` applies to the whole paragraph. Latin fonts like Nunito only contain Latin glyphs, Chinese renders as garbage (the most common root cause of users reporting "font rendering is wrong").
  - Prevention: at mkText creation route content `const cjk = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(str); const font = cjk ? noto : latin;`
  - Batch fix existing: walk all text, `cjkRe.test(c.characters)` hit → `noto.applyToText(c, notoVar(c.fontWeight))`. **`Text.fontWeight` can be read directly** (returns the current weight string), same-weight replacement doesn't break layout. Tested one batch fix of 89 places.
- CJK glyphs: Noto Sans SC all weights available. Monospace numerals JetBrains Mono, tech-title Orbitron both available. `penpot.fonts.findByName(name)` + `font.applyToText(text, variant)`, variant matched by fontWeight.
- **Emoji renders as pixel-style graphics** (consistent in editor and exported PNG): a plus for game/pixel style, can be used directly as icon placeholders (Image frame, app icon, BackTop balloon); use with caution for serious business style.
- growType: 'auto-width' (default ideal) / 'fixed' / 'auto-height'. Fixed-width centered text uses fixed + align.
- **Stale-measurement trap**: reading `t.width/t.height` at creation may be 1×1 (layout incomplete). Using them to compute centering → offset a few to tens of pixels (tested: arrow text off by 13px, status bar off by 45.5px, calendar selected number off by 5.5px).
- **Centering must be done after rendering**: `t.parentX = cx - t.width / 2` (width is now the rendered real width). At build time you can be rough, and run a round of the alignment engine at the end for uniform correction. Same under approach C (absolute): the centering in `absMount` is written right after text creation (width is usually ready then, but to be safe run a correction round after the build is done).

## 6. Variants and components

- `createVariantContainer(items)`'s items must be **a registered library component's main instance**: `{ shape: comp.mainInstance(), properties: { Prop: value } }`. Passing a plain ShapeProxy reports "ShapeProxy invalid".
- Registration: `penpot.library.local.createComponent([realShape])` — the original shape in-place becomes the main instance; **`comp.remove()` deletes the main instance along with it**. Accident chain: deleting duplicate-name components during batch de-dup → main instances scattered across showcase boards get deleted → showcase boards hollowed out (tested 6 boards emptied, user-view "all components disappeared"). Iron rules:
  1. **Always register with shapes from a dedicated masters board** ('AI Component Masters'); after the masters are consumed by registration, rebuild the masters then register again;
  2. After a showcase board is hollowed out, rebuild it as a whole per recipe (board-level rebuild is more reliable than patching shapes one by one);
  3. After assigning component name `comp.name = ...` immediately readback-verify — when `/` is disallowed the assignment silently fails and readback still shows the old name.
- After a variant container reparent, **the instance's internal child elements shift** (tested +30,30) → reset by the design relative coordinates. Known recipes:
  - Button (160×52): cap(0,0), text(80−w/2, 26−h/2)
  - Toggle (76×44): track(12,8), dot On(39,11)/Off(15,11)
  - Checkbox (120×32): box(0,4), ✓(11−w/2, 15−h/2), label(32, 15−h/2)
  - Switch (76×44): track(12,7), dot On(37,10)/Off(15,10)
- Component objects have no `makeInstance`, instances can't be script-generated.
- Component boards must be absorbed into the page header board (`head.appendChild(compBoard)`, same-page reparent keeps world coordinates unchanged), otherwise the component is missing when exporting the header board. Identify the header board with `root.children.find(c => c.type === 'board')` (root may mix in orphan text, don't use children[0]).

### 6.1 group semantics and assembly ownership (contract: penpot-structure.md §4.1)

- **API**: `penpot.group(shapes)` groups in place (within the same parent level, **no parent parameter**), returns a `Group`; `penpot.ungroup(g)` ungroups.
- **⚠️ `penpot.group` has destructive side effects (tested, must compensate)**: after grouping
  1. The new group's `layoutChild.absolute` is **false** (group becomes a flex-flow child) → the flex parent board **flow-reflows** the group to the column top;
  2. Members shift as a whole: the group is placed at the parent origin, member relative layout is preserved but **absolute position shifts by −(member bbox's minParentXY)**;
  3. If the parent board is hug, the flow child counts in and **the board size gets inflated**.
  `penpot.ungroup(g)` **doesn't restore coordinates** (members fall back by in-group relative coords, gets messier) — group/ungroup round-trips can't be used for rollback!
  **Compensatory grouping (canonical, zero displacement)**:
  ```js
  const minPX = Math.min(...shapes.map(s => s.parentX)), minPY = Math.min(...shapes.map(s => s.parentY));
  const g = penpot.group(shapes);
  g.layoutChild.absolute = true;          // escape flex flow
  g.parentX = minPX; g.parentY = minPY;   // restore bbox original position (must readback-verify after writing)
  ```
  The repair engine `groupAssemblies()` already has this compensation built-in; bare `penpot.group` calls must do the same three steps.
- **⚠️ Grouping scrambles front/back order (z-order)**: `parentIndex` **larger = more front (0=bottom)**, `bringToFront()` lands at the last index; `penpot.group` is opaque to members' z-order — tested it puts **the base plate above the label** (label covered, export a solid color block).
  After grouping you must fix z: within the group sort by **descending area** `setParentIndex(i)` (large base at bottom, text/icon on top), the group itself `setParentIndex(top member's original parentIndex)` to keep the layer slot; instance replacement same (``inst.setParentIndex(original group index)`).
  Verification note: **small-shape group export may hit a cache illusion** (looks like no text), go by **whole-board export**.
  Batch-fix engine `storage.fixZOrder()` (groupAssemblies already has the same logic built-in).
- **Difference between group and board**: assigning x/y to a **board** with absolute children is "shell moves, content doesn't" (children world coordinates don't follow); **a group is different — moving the group shell drags the children along** (a group is a bounding wrapper), so dragging/reusing an assembly after grouping is safe.
- **Three-level ownership**: reusable assembly → component (`createComponent([group])`, pages `comp.instance()`); single-use complete set → group; partition container → board. **Complete primitive sets must not be loose same-level stacking** (audit signature `loose_assembly`, fix `groupAssemblies()`, gate G10).
- **Group name** = host name / `component name·variant`; component name forbids `/` (assignment silently fails).
- **Nesting is normal**: a button group collected into a nav-bar group — layer by layer from inside out with `penpot.group`; `createComponent` can take nested groups.
- **Registration order**: group first to collect → then `createComponent([group])`; registering loose primitives directly yields a defective component.

## 7. Sandbox and proxies

- The `penpotUtils` / `storage` injected by the execute_code sandbox are **not true globals**: a function body serialized by `new Function` / `eval` can't access them (reports "reading 'xxx' of undefined"). Closure literal functions can survive across calls (stored in storage).
- Don't update engines by string-replacement + `new Function('return ' + src)()` — you lose scope; rewrite the whole function literally.
- `shape.children` generates a **new proxy object** on each access: doing filter/indexOf before `Array.from(children)` all return -1. Correct: snapshot first `const kids = Array.from(node.children)` then operate.
- Return values contain only primitive values; returning an object with a function (e.g. makeMask) fails structuredClone.
- `penpotUtils.findShapeById(id)` is effective across the whole file (cross-page); but you still need to activate the owning page before modifying.

## 8. Crash-damage diagnosis

- Symptoms: a page's components "fall apart" (board content overflows) or the whole page exports all black (header board 100×100 clips everything).
- Detection: walk the whole page, non-text primitive `Math.round(w)===100 && Math.round(h)===100` is damage.
- Fix: resize per design spec (board + edge-touching rect/ellipse children). Text doesn't need touching.
- Prevention: control batch size per call, avoid high-frequency page switching, disable WebGL in heavy-glow scenarios.

## 9. Export export_shape

- Can only export shapes on the **currently active page** (render URL bound to the current page-id) — passing another page's ID renders wrong content or an empty image.
- Large boards (3000px+) may time out: just retry (tested 3140px full page succeeded on the 3rd try). Occasional stale-cache black image: retry.
- **Board id changes after rebuild**: after `remove` + rebuild a same-name board the old id is invalid, exporting reports "Cannot read properties of null" — re-collect `board.id`.
- **Layout transition state**: data readback all correct but rendering garbled / buttons collapsed — the layout engine's async reflow isn't done, wait 1s+ and re-export before judging.
- Exported images differ from editor rendering (see §3/§4) — ultimately rely on the editor.

## 10. Layout engine (flex / layoutChild)

### Tested behavior of the three approaches

| Approach | Build | Render | Tested conclusion |
|---|---|---|---|
| A. Bare board + world-coordinate append | Simple | Mostly normal; some files/versions export whole-page offset `-board.y` (readback correct, render misaligned) | Environment-dependent, use batch only after first-board export acceptance |
| B. flex auto-layout | Engine layout | Nested board children force-hugged (160×45 button collapses to text size); `layoutChild.horizontalSizing='fix'` declared but still async-reset; `minWidth/minHeight` also overridden; no `removeFlexLayout()` API | Uncontrollable in nested-board scenarios |
| **C. flex container + all absolute + world coordinates** | Manual coords | 33 components + 3 full pages (Landing 1440×3140 etc.) 0 rendering failures | **Recommended fallback**; absolute children position-absolute, completely bypasses flex reflow |

### Key details of approach C

- `child.layoutChild.absolute = true` **must be set AFTER appendChild** (setting before is ineffective).
- In absolute mode `child.x/y` read/write are both world coordinates (same as normal shapes).
- The container itself `horizontalSizing/verticalSizing = 'fixed'` prevents the engine from changing size; after `addFlexLayout()` `flex.dir` must be assigned (adding without setting dir has default-behavior differences).
- **Board resize doesn't affect absolute children** — safe to expand the frame (when Dashboard bottom components overlap, shift children down + resize board taller, in one step).
- **Moving a board (assign x/y), absolute children don't follow** — place final coordinates directly at build time; when moving is truly needed, compensate element by element (walk subtree and translate by the same dy).
- Diagnostic rule: **readback correct, render wrong → approach A failed, switch to C; data correct, render collapsed → flex hug, all absolute re-layout**.

### Collapse-repair engine

See `scripts/fix_layout.js` (getDesignSize restores design size by name + absRow manual re-layout + fixCol container fix, two-round convergence; usage and order trap in engines.md §3).

## 11. openPage timeout lands on wrong page (data-safety incident)

When execute_code's 30s timeout kills the call, the `penpot.openPage` inside it may **not have committed**. The next command, if it starts with "assume already on the target page" and directly runs remove/create, lands on the **old page** — tested lesson: after a timeout, the next call's `for (c of root.children) c.remove()` wiped the entire Foundations page.

Defense chain:
1. The first command after a timeout **only does** `openPage(pg) + sleep(400) + return currentPage.name`;
2. Only execute the operation if the page name matches;
3. Before a whole-page remove, first `return` the top-level board list for manual confirmation (or limit to a `name.startsWith('xxx')` conditional delete, never bare remove all).

## 12. Property names must be checked against the API; wrong ones silently fail (the most expensive kind of pitfall)

**Iron rule: before writing a property to a shape, use `penpot_api_info` (e.g. `{"type":"Text"}`) to check the property name; readback immediately after writing.**
Penpot's shape proxies **don't error on non-existent property names** — under `try/catch` it's a silent failure, the code "looks like it ran".

### 12.1 Case: `align` is not `horizontalAlign`

The correct property for text horizontal alignment is **`align`** (`"center" | "left" | "right" | "mixed" | "justify" | null`); vertical alignment is `verticalAlign`. There **is no `horizontalAlign`**.

```js
t.horizontalAlign = 'center';   // ✗ silently fails, property still old value
t.align = 'center';             // ✓
// must readback:
if (t.align !== 'center') throw new Error('align not effective');   // readback is the only criterion
```

Tested consequence: all 23 fixes were ineffective, centered/right-aligned text degraded to left-aligned, export shows "label stuck to left edge".
**Diagnostic rule: readback `undefined` ⇒ wrong property name; readback old value ⇒ assignment rejected (type/value illegal).**

Similar property-name differences to watch: `strokes[i].strokeAlignment` (not `strokeWidthAlignment`), board's `clipContent` (not `clipsContent`), ellipse uses `penpot.createEllipse()`.

### 12.2 Correction to §10: `layoutChild.absolute = true` does **not** guarantee "moving a board, children don't follow"

§10 once said "moving a board (assign x/y), absolute children don't follow". **Tested on Penpot 2.17 this doesn't hold**:

- A Demo board's child element `c.layoutChild.absolute` read back **`true`**;
- After moving the board as a whole +180px, **the child moved along** (for these children `parentX` is relative);
- I followed "doesn't follow" and added another subtree translation → the child moved a total of **+360**, content shifted 180px out of the board.

**Correct approach: don't infer, probe first.**

```js
// move-semantics probe: move a board N px, measure one child's world-x change
const probeMoveSemantics = (board, child, dx) => {
  const before = child.x;
  try { board.parentX = board.parentX + dx; } catch (e) { board.x = board.x + dx; }
  const after = child.x;
  try { board.parentX = board.parentX - dx; } catch (e) { board.x = board.x - dx; }   // restore
  return { childFollows: Math.abs((after - before) - dx) < 1, childDelta: after - before };
};
// childFollows === true  → only move the board, don't compensate the subtree
// childFollows === false → translate the subtree element by element (moveSubtree)
```

Choose a strategy after judging: follows ⇒ only move the board; doesn't follow ⇒ `moveSubtree` (move descendants first, then the shell).

### 12.3 exporter random export failure: change Playwright's `networkidle` to `load`

**Symptom**: `page.goto: Timeout 20000ms exceeded ... waiting until "networkidle"`,
multiple boards on the same page fail in a row, other pages occasionally succeed; the exporter container resources are normal (CPU 0%, memory a few hundred MB);
`fetch('http://penpot-frontend:8080/')` from inside the exporter returns **200** (network is fine).

**Mechanism**: `render.html` keeps a long connection (for real-time sync), so `networkidle` (requires no connection within 500ms) **never achieved** → inevitably 20s timeout.
So it's only weakly correlated with board size / page size, appearing as "sometimes works, sometimes doesn't".

**Fix** (idempotent, reversible):

```powershell
# the container's app.js has only 1 occurrence of networkidle, and it's necessarily in a wait_until context
$d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
# first back up /opt/penpot/exporter/app.js -> app.js.orig, then replace "networkidle" with "load", finally:
& $d restart penpot-server-penpot-exporter-1
```

Tested: the same board failed 3 times in a row before, succeeded once after. Restore: overwrite with `app.js.orig` and restart.
> Note: this is a container-layer patch; `docker compose up -d --force-recreate` resets it; `restart` preserves it.

## 13. All cell helpers in the same build must share one signature

**Incident**: a single build script contained two sets of helpers side by side:

```js
R(b, x, y, w, h, fill, radius, stroke)              // rect: h before label
X(b, x, y, w, label, size, color, weight, h, align) // text: no h before label
```

Calling `X` as `R` shifts the whole argument chain: `label`←height, `fontSize`←label, `h`←weight, colors all black.
One batch produced **23 malformed texts** (garbage numbers on screen, board inflated 400–570px, breaching the row gap and pressing the next row).

**Prevention**: ① unify helper signatures within the same code; ② or unify into object literals `{kind:'text', x, y, w, label, size, ...}` (this skill's 01/02 pages use literal writing, zero incidents in the same batch); ③ add **argument count/type assertions** inside the helper, throw immediately on misalignment rather than drawing crooked.

**Detection (one-shot hit)**: scan all text, `characters` is **pure digits** (`/^\d{1,4}$/`) **and `height ≥ 200`**.
Tested this rule precisely hit all 23, zero false positives. **The threshold must be 200, not 36** —
normal numeric labels (pagination `1/2/3`, year `2026`) box height is only **40–44** (they live in a 40px capsule),
while a malformed text's box height is **400/500/600** (that's actually the **weight value** misused as height), the two differ by an order of magnitude.
You can additionally stack "height inconsistent with same-level rect heights" to tighten further.
