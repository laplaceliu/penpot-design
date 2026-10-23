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
- **Instantiating IS scriptable — the old "no `makeInstance` / treat `comp.instance()` as unverified" verdict is
  FALSIFIED** (capabilities §5). Measured: `comp.instance()` returns a real instance board; `parent.appendChild(inst)` +
  a `'fix'/'fix'` sizing declaration places it in flow; `Array.from(inst.children).find(c => c.type === 'text').characters = '…'`
  overrides text **locally** (the master keeps its own); `inst.swapComponent(other.mainInstance().component())` switches
  a control to another registered variant (name and paint follow, **text overrides survive**). The skill's API is
  `CF.instance(CF.name('Button', {type,size,state}))` / `CF.swap(inst, name)`; use a fresh `CF` factory re-call only when
  no master was registered. Two traps that still apply:
  1. **declare `'fix'`, not `'auto'`** — an instance (or any control host) with `layoutChild` sizing `auto` **hugs to
     label size** (measured 160×52 → 41×17); `CF.instance` defaults to `'fix'/'fix'` and declares sizing last;
  2. **never delete the main instance's shape as cleanup** — `isComponentInstance()` is `true` for *mains too*, so a
     filter on it deletes masters (library records then follow), and `detach()` on a main leaves an unremovable ghost.
- **Variant containers**: `createVariantContainer` **requires** `properties` per entry (`{shape: rec.mainInstance(), properties:{Type:'Primary'}}`
  — without it: `TypeError: Cannot convert undefined or null to object`); the merge consumes the source records into one
  variant record; the platform **renames every head to the container's name** and renaming a head afterwards **wipes the
  property table**. Switch on instances with `inst.switchVariant(posIndex, value)` (numeric pos; string pos throws
  `Value not valid: Type. Code: :pos`), set the default on the record with `setVariantProperty(pos, value)`. Family name
  goes on the container **and** the record (`vc.name = 'Button'`, `rec.name = 'Button'`), never on the heads.
- Component boards must be absorbed into the page header board (`head.appendChild(compBoard)`, same-page reparent keeps world coordinates unchanged), otherwise the component is missing when exporting the header board. Identify the header board with `root.children.find(c => c.type === 'board')` (root may mix in orphan text, don't use children[0]).

### 6.1 group semantics and assembly ownership (contract: penpot-structure.md §4.3)

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
- **Three-level ownership**: reusable assembly → component (`createComponent([group])`; on a screen place an **instance**
  with `CF.instance(name)` — see §6 above; a `CF` factory re-call is the fallback when nothing was registered); single-use
  complete set → group; partition container → board. **Complete primitive sets must not be loose same-level stacking**
  (audit signature `loose_assembly`, fix `groupAssemblies()`, gate G10).
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
| B. flex auto-layout | Engine layout | The historical failures (160×45 button collapsed to text size; `horizontalSizing` "declared but ignored") were **vocabulary bugs**: `'fixed'` is an invalid value (only `'fix'`/`'auto'`), and the padding names were `paddingTop…` instead of `topPadding…` — both silently dropped, so the board fell back to hug | ~~Uncontrollable in nested-board scenarios~~ **FALSIFIED by capabilities §2** — with the right names, nested `fix` boards keep 160×52, `fill` stretches them, padding moves children, hug re-grows. **B is now the default path for screens** (`storage.NL`), because it is what keeps the file editable |
| **C. flex container + all absolute + world coordinates** | Manual coords | 33 components + 3 full pages (Landing 1440×3140 etc.) 0 rendering failures | Correct **for the `03–09` spec boards, art and pixel-exact overlays** (native-layout §9) — not the default for screens any more, and never for a `01.xx`/`02.xx` board, which `FN.project` emits as a hug column of hug rows (G16, rule 31); an absolute tree does not re-flow when copy changes |

### Key details of approach C

- `child.layoutChild.absolute = true` **must be set AFTER appendChild** (setting before is ineffective).
- In absolute mode `child.x/y` read/write are both world coordinates (same as normal shapes).
- The container itself `horizontalSizing/verticalSizing = 'fix'` (write **`'fix'`, never `'fixed'`** — `'fixed'` throws and
  the old `try/catch` swallowed it, so the board silently hugged: that is the root cause the collapse-repair engine was
  fighting). After `addFlexLayout()` `flex.dir` must be assigned (adding without setting dir has default-behavior differences).
- **Board resize doesn't affect absolute children** — safe to expand the frame (when Dashboard bottom components overlap, shift children down + resize board taller, in one step).
- **Moving a board (assign x/y), absolute children don't follow** — place final coordinates directly at build time; when moving is truly needed, compensate element by element (walk subtree and translate by the same dy).
- Diagnostic rule: **readback correct, render wrong → approach A failed, switch to C; data correct, render collapsed →
  a sizing/padding name was wrong (B's vocabulary, capabilities §2) or a `resize()` downgraded a flow child (`NL.auditFlow`
  reports `sizing_dropped`) — repair with `NL.nudge`/`NL.sizing`, do not blanket-absolutize a screen any more.**

### Collapse-repair engine

Two generations, both kept:
- **Today (preferred)**: `NL.auditFlow` → `NL.nudge`/`NL.sizing` → re-audit next call (native-layout §7). This fixes the
  producer instead of re-laying the board out.
- Legacy whole-file repair: `scripts/fix_layout.js` (getDesignSize restores design size by name + absRow manual re-layout
  + fixCol container fix, two-round convergence; usage and order trap in engines.md §3).

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

**Prevention**: ① unify helper signatures within the same code; ② or unify into object literals `{kind:'text', x, y, w, label, size, ...}` — which is what `FN`'s projections do internally: a Foundations/Color board gets **no literal coordinate from the caller at all** (gate G16), so the misalignment class cannot reach `01.xx`/`02.xx`; ③ add **argument count/type assertions** inside the helper, throw immediately on misalignment rather than drawing crooked.

**Detection (one-shot hit)**: scan all text, `characters` is **pure digits** (`/^\d{1,4}$/`) **and `height ≥ 200`**.
Tested this rule precisely hit all 23, zero false positives. **The threshold must be 200, not 36** —
normal numeric labels (pagination `1/2/3`, year `2026`) box height is only **40–44** (they live in a 40px capsule),
while a malformed text's box height is **400/500/600** (that's actually the **weight value** misused as height), the two differ by an order of magnitude.
You can additionally stack "height inconsistent with same-level rect heights" to tighten further.

## 14. Page-level operations and rebuilds (measured 2026-10-21, block-per-page migration)

All of these were paid for in lost work; each has a cheap safe path.

| Operation | Measured behaviour | Safe path |
|---|---|---|
| Move a board to another page | `absMount`/`appendChild` across pages was never the blocker — **re-parenting a component copy is**: `Value not valid: Cannot change the structure of a component copy. Code: :appendChild` | Pagination is **create-new + build-into-it**, not move. Copy an existing page's content by re-running its spec against the new page |
| Adjust an instance's internals | `inst.children[i].x = …` **works**; `hairline.width = …` throws `TypeError: Cannot set property width` (instance children's geometry is partly frozen) | Re-seat by position/text, never by size. If the size must change, re-instance from a master of the right box instead |
| Delete a page | Destroys the component masters hosted on it (**275 → 0** measured) **and** wipes every flow and interaction in the file | Treat `delOld` as a full delivery reset: re-register (`CF.autoRegister`, page by page — `createComponent` needs the page active), then re-create named flows **before** re-wiring links, then re-author links from a **name-based** spec (ids do not survive rebuilds) |
| Prototype link across pages | The interaction is accepted, reads back with a `type`, and its destination is **null** — the viewer does nothing | Keep a flow's entry and all its targets on one page (that is why `14/15/16` stay grouped, `penpot-structure.md` §2.3) |
| `penpot.openPage(id)` then read | The next read can still return the **previous** page's tree (looked like a cover page containing a whole landing screen) | `await storage.sleep(420–500)` **and** assert `penpot.currentPage.name === want` before touching shapes; every batch loop that switches pages must do both |
| Read a page that is not current | `pageRootOf(name)` **works cross-page** — a registry scan of 70 spec boards ran in 2.8 s without switching pages | Read cross-page, write same-page |
| A call that times out | The 30 s ceiling kills the **response**, not the **work**: the build completed, was placed, and the dedupe tail ran seconds later | Every batch driver must be idempotent (skip-if-board-exists) and must budget itself (~21 s), because "it failed" and "it already did it" are indistinguishable from the client. A timed-out rebuild leaves a **twin at the page root** → a `strays` pass (twin on shelf ⇒ remove the stray, else mount it) is mandatory before gating |
| Repair a known defect | Audit findings carry `board/shape/x/y/w/h/detail` | Locate by name+xy through a DFS index map and fix in place. Rebuilding a board to fix one row is how a repair becomes a regression |
| Rewrite a label | `shape.characters = '…'` writes and reads back | Caption fixes never need a rebuild — but see the row below before trusting a caption |
| Palette documentation vs theme overlay order | A swatch bound to a token renders the **current** token value while its caption text keeps the hex that was authored **at build time**: the violet/lime triples looked correct and were labelled `#161616`, ratio `1.00:1` | Build (or re-derive) any board that *quotes* token values **after** the theme overlay lands; when repairing, re-derive the caption from the sibling's own `fills[].fillColor` instead of from the palette mirror |
| `no_guides` on a footer | The auditor binds guides to any board at a tier baseline width with `height ≥ 300` — a tall footer qualifies | The guide pass must skip `*-Header` / `*-Footer` by name, and a footer that is genuinely ≥300 tall must carry guides or be shortened |
| Component identity probes | `penpot.components` is `undefined`; `inst.componentId` is `undefined`; `inst.component()` resolves the live record | Test "is this an instance of X" with `inst.component()` inside try/catch, not with an id field |
| Registering / counting masters | `penpot.components` returned **0** while the file had 1003 masters | The live registry is **`penpot.library.local.components`**; every coverage check must read it, or it will report an empty library |
| Interactions / flows | `shape.interactions[i].actions` is `undefined`; the field is singular (`it.action.destination`), and `penpot.currentPage.flows` is **page-scoped** | Read links with `storage.PR.read(shape)` and enumerate flows per page, never once per file |
| A recipe region with `h: 0` | `LY.recipe('listCrud')` collapses `bulkBar` to `1200×0` at a tier with no room for it; `resize(…, 0)` then throws `Value not valid: 0. Code: :resize` and kills the whole build mid-page | `LY.drawStep` skips a zero-area region and names it in `skipped` — a collapsed region is information, not a defect. Never hand a 0 dimension to `resize` |
| Auditing a page-root stray | `designPage()` scopes to the **PageRoot subtree**, so a bare frame sitting at the page root is invisible to all 38 rules and the verdict reads CLEAN | Always gate with **both** auditors (`designGate`): `audit_layout`'s `root_stray` owns the page root, `audit_design`'s `empty_cell` owns a hollow `cell·slot·*` / `cell·recipe·*` inside a board |
| Probing a new auditor rule | `board.width = 100` throws (read-only) and `board.moveTo` does not exist | Build the probe with `storage.mkAbsBoard(...)`, re-parent with `parent.appendChild(probe)`, run the auditor, and delete the probe in the same call — a proof must not leave a finding behind |
| The 素材 → 排版 (Typography) panel | It lists `penpot.library.local.typographies`, **not** the token set: a file measured with 40 *active* `typography` tokens and `themes: []` showed an **empty** panel (`typographies.length === 0`) while every design rule passed | `storage.TP.seed()` registers one style per declared step, named like its token (idempotent, readback-verified). When applying one: `style.applyToText(shape)` transfers family/size/weight/tracking but **rewrites `lineHeight` to 1.2** whatever the record holds — `TP.apply` re-asserts the style's leading; never bulk-apply over token-bound text |
| Deleting a page | There is **no** `penpot.deletePage` / `file.deletePage` (both `undefined`, and prototype introspection hides the real members). The working call is `storage.pg(name).remove()`, and it works on a page that is **not** current | After a page-split migration, "old pages emptied" is **not** "old pages gone": the 14 shells kept a `NN · Chapter` name and a PageRoot with 0 children, so both auditors passed them and the page panel read as 14 blank entries. A delivery sweep must enumerate `penpot.currentFile.pages` by name and assert every page still has a non-empty PageRoot, then `remove()` the rest (re-check `root.children.length` per page inside the loop so a page with content can never be dropped by a stale list) |

## 15. Foundations projection and the layout pass (measured 2026-10-21, `storage.FN` on a live probe page)

| Behaviour | Measured | Consequence / safe path |
|---|---|---|
| **A hug frame can be frozen while its children are correct** | `row·head` reported `h=6` under two texts rendering 44 + 4 + 20; every readback was "right", `auditFlow` said CLEAN, and the **PNG export** showed the caption printed over the title | The layout pass only recomputes a hug when it sees the frame dirtied. Text that grows **after** the frame's last pass leaves the parent stale. Repair in the same call: write any flex property it already holds (`cell.flex.topPadding = cell.flex.topPadding`) bottom-up — `storage.FN.relayout(board)`, `{touched, failed}`. Now caught as `NL.auditFlow` → `hug_frozen` |
| **Token binding is one of those "text grows later" events** | `TK.bindBoard` applies typography tokens, so heights change *at bind time*, i.e. after the board was shelved | Bind → `relayout` → `reflow` → gate, in that order. `FN.bindNext` does exactly this and reports `grew` (the neighbour shelf must be re-set against the new height) |
| **A freshly built board's height is provisional inside the call that built it** | `Palette` returned `h=726` at `FN.project` time and read **1052** on the next call | Never shelf-place the *next* board against a number from this call. `FN.lanes` re-reads the page each call and `FN.reflow` re-shelves everything from live heights first |
| **Flex readback names** | the live object is `board.flex`, its keys `topPadding/rightPadding/bottomPadding/leftPadding/verticalPadding/horizontalPadding`; `board.layout` and `paddingTop…` are **not** readbacks | A diagnostic that reads the wrong name sees `undefined` and concludes the board is broken. Measured: I "found" Radius/Spacing boards to be pad-less and started repairing them; recomputing with `topPadding` showed they were consistent. Read the engine's vocabulary (`applyFlex`'s whitelist), not your memory of CSS |
| **The plugin session can be wiped mid-task** | `storage` came back `{}` (all engines gone) and `FN.records` — which lives in JS memory, not on the file — was lost with it. Likely trigger: a timed-out `export_shape` | After a wipe: re-seed in G1 order, `foundations_engine.js` **last** (it captures LY/CF/NL/TK at load time and returns `{err:'load … first'}` otherwise), then re-derive state from the page (`FN.projected(page)` reads which boards exist) instead of trusting a record list |
| **There is no `penpot.getPages`** | page enumeration is `storage.pg(name).root.children` (the **page's** top level: PageRoot/Header/Footer/strays) vs `FN.pageRoot(page).children` (the **boards**) | Ask for the right level. A "no boards on the page" reading that inspected `pg().root.children` was really reading one PageRoot and zero strays |
| **`export_shape` timeouts are not size-predictable** | a 1760×726 board timed out at 30 s while a 1696×68 row **and** a 1760×1052 board exported fine | Do not infer a board is broken because its export stalled; retry, and keep exports to one board per call. The image is returned inline — there is no file path to collect |
| **The root must fit the shelf** | after 11 boards were projected, 4 read `out_of_bounds` (escaping a scaffold-height PageRoot by 587–3763 px); fixing that then produced `off_grid @ 99-PageRoot h=8623` | `FN.fitRoot(page)`: root height = deepest child bottom + margin, **snapped to 8** (the root is an authored box, §1, so it is judged by rule 1 — derived content is exempt, a derived *root* is not) |
| **An auditor with a second source of truth invents findings** | `off_ramp_size` measured against `storage.T.fontRamp`, so a declared 36px title was reported off-ramp | The checker must read the same records the builder does: `audit_design` now takes the ramp from `TK.declared().types` and prints which source it used (`out.ramp`). When a rule fires on a value the set *does* declare, suspect the auditor before the board |
| **`setPluginData` is the only provenance that outlives the session** | after `storage` was wiped, `FN.records` was gone but `NL.readStamp(board)` still returned `nl:fn=palette` — the stamp lives in the file | G16 rests on that channel: `FN.project` stamps `{fn:<kind>, shelf:'1'}`, rule 31 `not_projected` reads it, and the `off_grid` shelf exemption reads `nl:shelf` **before** the memory-only `_meta`, so a re-seeded session does not invent findings on boards it did not change |
| **A board *title* is not proof of who built it** | the live file has a hand-composed board named `Palette` — exactly the display name of the `palette` kind | `FN.restamp` matches by name **only** under `{byName:true}`, because the default would launder a hand-drawn board into a projection. Run it per page, read `nameMatched`, and only accept it for a page you know FN built |
| **A per-page audit cannot see a missing page** | block-per-page means chapter 01 lives on ~9 pages; each of them can be CLEAN while the file has no `Palette` at all | `storage.designCoverage()` / `FN.coverage()` answer the file question (every `FN.CHAPTER` kind stamped somewhere). It is deliberately **not** folded into `designGate`'s verdict — a screen page must not fail for a Foundations reason (scope orthogonality, positioning-audit G8); it is a delivery step |
| **An unseeded gate is not a passed gate** | `audit_design.js` seeds before `foundations_engine.js` (G1), so rule 31 runs at *audit* time; on a session where FN never loaded, a 01/02 page would silently have no provenance check | Rule 31 has an explicit `else`: FN missing + a chapter-looking page → `not_projected` with "G16 cannot be verified, so it cannot be claimed". `designCoverage()` returns `NEEDS_REPAIR` with the same message |
| **`designPage()` has no page argument — it audits whatever is open** | measured 2026-10-21: `penpot.openPage(pg)` and `storage.designPage({})` **in the same call** ran three times on three pages and returned three identical `CLEAN` verdicts with `page: "01.90 …"`, `boards: 351` every time, because `penpot.currentPage` only rebinds on a later turn. `designPage({page})` is not an option, it is silently ignored | Audit one page per call through the queue runner (`designStart(pages)` + `await designNext()` — it opens, sleeps 700 ms and verifies `penpot.currentPage.name`), and **always read `out.page` back**: a verdict whose page name is not the page you meant is not a verdict about that page. The same trap makes a "clean" file-level claim meaningless; use `designCoverage()` for that. Both engines now refuse instead of misreporting: `designPage({page})` returns `{err, want, verdict:'NEEDS_REPAIR'}`, `FN.check` settles 700 ms and refuses on a name mismatch |
| **"Which boards are on this page" depends on which root you read** | `FN.boards()` reads inside `NN.MM-PageRoot`; a hand-composed board mounted at the **page root** beside it was invisible to gate G16 — `FN.foreign()` said `[]`, `designCoverage` said nothing, and only `audit_layout`'s `root_stray` caught it. Negative control: one `mkAbsBoard` stray → `foreign [{Negative control stray 1920×240}]`, a rule-31 finding on `99-PageRoot`, and a `designCoverage().foreign` entry | `FN.strays(page)` feeds `FN.foreign` and `FN.coverage`, so a chapter page's content is judged at both levels. Strays are excluded from `restamp`/`kindsOn` — an out-of-place board can never be laundered into a projection |
| **The design auditor never walks inside an instance** | `audit_design.js` returns at `if (isInstance(s))`, so `disabled_wrong`, the text/contrast and the `caption_stale` rules cannot see a shape inside a componentized host — measured while building the negative control for `disabled_wrong`: mutating a `·Disabled` **instance**'s label alpha produced no finding at all | A CLEAN page is not proof that every copy inside a master is right; the master is judged where it is drawn (`03–09` spec boards), and instances are judged by which master they point at. To prove a text rule is live, run the control on a **non-instance** shape (`Link·MD·Disabled` on its spec board: break the alpha → `NEEDS_REPAIR`, restore `.38` → `CLEAN`). Do not use `isComponentInstance()` as the discriminator on a closed page — the walk already uses `isInstance` |
| **A state exemption must be a name segment, not a word** | the old `disabled` exemption searched the whole ancestor-name string, so my own caption "**Disabled** recedes a control…" inherited it and hid a real finding | `inDisabledHost()` splits on `·` and matches a **segment** (`Button·Disabled·Md`, the §4 name grammar). Anything that documents a state in prose is not in that state, and a gate that reads intent from a sentence will be triggered by the sentence |
| **Writes need the page open; reads do not** | `setPluginData` and `TK.bindBoard` both landed on whichever page happened to be current, because `openPage()` rebinds only on the **next** `execute_code` turn | Every FN write path (`project`/`bindNext`/`check`/`restamp`) now goes through `FN.use(page)`: open → settle 700 ms → re-read `penpot.currentPage.name` → **refuse** with `{err,want,wait}`. A refusal costs one re-issue; a stamp on the wrong page costs a silent gate failure |
| **`CF.fills(…, {onDark:true})` is a no-op on a neutral ground** | the `02.02` dark lane exported as **seven identical black tiles**: `onDark` deliberately shades (black overlay) because white@8% over `#2563EB` lifts to `#3F76ED` and drops the white label to 4.18:1 — but over `#161616` there is nothing to darken | Keep `CF.fills` as it is for **brand fills** (the shade is correct and documented). A board that *documents* the ladder passes the material explicitly: `CF.fills(ground, state, {overlay: FN.ink(ground)})`, and captions the composite with `FN.over(base, tint, alpha)`. Same state name, two overlay materials — §5.2 of the design-guide now says which applies where |
| **A dimmed label needs a ground behind it** | `disabledContent` (white text at 38%) drawn directly on the light board ground is invisible; and `FN.cell` does not forward `strokes`, so a ground-coloured tile had no hairline | Content alphas go in a **tile** filled with the lane's own ground (`FN.cell(…)` then assign `tile.strokes` by hand). Every tile on a state board gets a 1px inner hairline, otherwise a ground-coloured plate cannot be told apart from the board |
| **A two-band table must use the same cell width in both bands** | the `contrast` matrix drew passing pairs in a fixed 480 `FN.cell` and rejected pairs in a **fill row**, so the ratio column sat at x≈896 in one band and x≈1560 in the other (visible only in the PNG) | `FN.row` spans the remaining width — use `FN.cell(w)` whenever a column must line up across bands. Read geometry from an export, not from `x`/`w` readbacks that are individually "correct" |

## 16. The whitespace ladder and rules 32–34 (measured 2026-10-21, `LY.BREATH` + `breathe` on a live file)

| Behaviour | Measured | Consequence / safe path |
|---|---|---|
| **A ladder that indicts the system it describes is the wrong ladder** | the first `LY.BREATH` draft skipped `16` (inline 8 → block 24); the adoption read then found **121 of 125** flow containers separating at exactly 16 px, i.e. the file's own rhythm was `off_ladder` | Derive the ladder from what the `SPACE` scale *and* the built file already do, then measure adoption (`out.breath.onLadder / containers`) before tightening. Final: `inline 8 · row 12 · block 16 · group 24 · section 32 · band 48 · page 96/64` — every level a `LY.SPACE` member. A rule that only a hand-built board can pass is a rule against the engine |
| **Re-seeding is not exempt from the G1 order** | after a `LY.BREATH`-only edit, `designPage()` kept judging gaps against the **superseded** ladder and reported 16 px as off-ladder, because `audit_design.js` binds `const LY = storage.LY` in its closure at seed time | When a table one engine publishes changes, re-seed that engine **and everything downstream of it, in order** (`layout_engine` → `native_layout` → `audit_design` → `fix_geometry`), and verify through the consumer (`out.breath`, `storage.designCFG()`), never through `storage.LY` |
| **A repair pass can be silently unreachable** | `breathe()` reported `texts: 0` while `textPlan` held 2 entries: the walker began with `const kids = kidsOf(s); if (!kids) return;`, and a **text has no children**, so every paragraph in the file short-circuited past rule 34a | Put per-type checks before the children guard, then prove the branch by planting a probe and reading the counters. A repairer that reports 0 fixed on a page the auditor just flagged is not clean — it is broken |
| **Auditor and repairer must not own two leading tables** | the auditor judged 14 px text against 1.4 while the repairer raised it to 1.5, so a page oscillated between the two tools | The auditor publishes what it measured: `storage.breathSpec.lead[fs]` (the tightest declared leading per step, from `TK.declared()`), and `breathe`'s `leadFloor` reads that map first. Any "correct value" the repairer computes independently is a finding generator |
| **A gap floor on a *row* is a design veto, not a bug fix** | rule 32 first fired on `Segmented` / `ButtonGroup` / table rows — controls that separate with a **hairline**, which §1.3 mandates | `breathAudit` binds a row's floor only when its members are cards (each with a stacked interior) or the row already tried to separate them (`gap > 0`). Same for rule 33's 2× test: `inner` requires a **stacked** child (`g.col`) with ≥2 block children, else a cell row's gap reads as a "missing section break" |
| **A repeated run is one visual object, so it needs no air between its steps** | the `02.03` contrast matrix produced 7 `hierarchy_gap` findings on a board that exports CLEAN and is `FN`-projected — a ladder of equal-height rows | `runOf(kids, col)` exempts ≥3 siblings with equal extent (±2) and uniform pitch (±2), **unless** the run is `grouped` (its members stack ≥2 blocks, i.e. real cards). The mirror exists in `breathe`; keep both in sync or the repairer undoes the exemption |
| **`shape.width = N` on a text does nothing** | the probe paragraph stayed on one line (`h=14`) after `t.width = 480`; only `t.resize(480, h)` wrapped it to 480×56 | To measure or repair wrapping/leading, `resize`. And `mkText` writes the token's *declared* leading, so a deliberately compressed paragraph must be forced with `t.lineHeight = '1'` before the floor can be demonstrated |
| **`storage.mkRect` has no parent argument** | the 8 probe swatches landed as page-root **siblings** instead of inside the probe board | `NL.mount(parent, shape)` after creating, or `parent.appendChild` — do not delete-and-rebuild to fix parenting (that is churn, and a deleted board takes its stamps with it) |

## 17. The radius ladder as the only corner source (measured 2026-10-21/22, `CF.RAD` + rules 35/36/37/38 + `TK.radiusSweep` / `TK.roleSweep` / `TK.ringSweep` on a live file)

| Behaviour | Measured | Consequence / safe path |
|---|---|---|
| **A `borderRadius` apply writes four keys and rewrites the geometry** | `token.applyToShapes(shapes, ['borderRadiusTopLeft','…TopRight','…BottomRight','…BottomLeft'])` put all four into `shape.tokens` **and** retuned the drawn corner (measured: `Pagination·Spec` 12→10, `cell·prev` 6→4) | Binding is the repair, not a label. Apply all four together — a one-key apply leaves a partial map that rule 36 still indicts. A `9999` corner renders as a clean pill (the renderer clamps it), so `radius.full` can legitimately be the control step |
| **A write lands only when the event loop yields — and it reports success before that** | the first sweep ran with `settle: 0`, **reported 3,465 corners bound**, and a later independent dry read found **1,757 corners still unbound across 68 pages**. The phase trace stopped at `apply +539ms` and never reached `settle`. A controlled re-run (`applyToShapes` + 800–1200 ms yield) landed every write | `applyToShapes` is fire-and-forget: its return value proves nothing. The settle wait **is** the commit, not a courtesy pause for the readback. A batch pass may collapse it to one yield per **page** (`TK.bindPage({pageSettle: 800})`) because everything that page queued lands together — 136 pages / 449 boards / 21,449 shapes in 2 chunks instead of 17 s-per-board |
| **A non-current `Page` exposes only `id`/`name`** | `page.root` is `null` for every page but the open one, and `penpotUtils.getPages().find(...)` can hand back a stale copy, so a "walk all pages" probe scanned 136 pages in 4.3 s and found **nothing** | `await penpot.openPage(page.id)` → settle → re-read through `penpotUtils.getPageByName(name)`, and retry the cold root (6×250 ms) before giving up. A file-wide read that finishes implausibly fast is a read that skipped the file |
| **`execute_code` returns only from a top-level `return`; an async IIFE swallows its own exceptions** | wrapping the sweep in `(async () => { … })()` produced `{log:""}` with no result and no error, which read like a timeout | Write the call as a function body with `return await …`. Same trap as `nap`: it is engine-local, not a global, so a top-level `nap(500)` is `nap is not a function` |
| **A counter that is 0 by design looks like a counter that is 0 by success** | `05.08` reported `bound: 0` while its bindings had landed — dry mode never writes, so every `*Bound` counter is 0 in a dry pass | Read a dry sweep as `{scanned, off, already}` and never as proof of adoption; adoption is `already + bound`. Label the mode in the aggregate (`_radAgg.mode`) so the two runs cannot be conflated |
| **A budgeted sweep must keep its cursor in `storage`** | the 30 s MCP wall killed a naive whole-file pass mid-page; a local variable lost the progress and the retry re-did 68 pages | `TK.radiusStart()` builds the queue, `TK.radiusSweep({budget, chunk})` advances `TK._radAt` and returns `{remaining, done}`; `if (!r.boards) shift` makes a stuck cursor structurally impossible. Re-issue until `done: true` |
| **Rules that judge "is this value legal" are blind to "is this value present"** | after the sweep read `off: 0` file-wide, the `Button·Spec` **export** showed square buttons: the host carries `r=0` and both new rules skip `v <= 0`. A read of the 1,086 non-instance control hosts found three generations mixed — `fab/chip/avatar/field` at `r9999 bound`, `badge/navitem` at `r10`, `field` at `r4`, and `button:fill:r0 unbound ×45`, `listitem r0 ×27`, `field:fill:r0 ×21` | `designGate` CLEAN proves *no orphan values*, not *every role applied*. Close the gap where the knowledge lives: have the factory **stamp the host with the role it drew** and judge the stamp (see `design-guide.md §5.1` "what the gate cannot see"). Never mass-patch corners — the per-family host radius is only known to the factory, and instances follow their master, so re-driving the spec board fixes every copy |
| **The ladder a recreation documents must be the source's ladder** | the engine's default ladder (`0/2/3/5/100/9999`) and a source's declared set (for example `0/4/10/26/50/80/9999`) can disagree at every step; rules 35/36 read the **live** `TK.declared().radii`, so the file is judged by what it actually declares | Seed the source's steps into the token set before drawing anything, and keep `CF.RAD` a mirror of that set. A rule bound to the engine's constant instead of the file's tokens indicts a correct file |
| **A "component" answers `isComponentInstance()` — including its own master** (measured 2026-10-22) | on `Button·Primary·MD·Focus·Pill`: `isComponentInstance() === true`, `isComponentMainInstance() === isComponentRoot() === isComponentHead() === true`; a placed copy is the one that answers `isComponentCopyInstance() === true` | Every "skip instances, they follow their master" guard (`isInstance`) silently exempts **every master in the file**. `audit_design` now skips with `isCopy`, and `TK.roleSweep` walks masters + plain boards + copies. The evidence was a whole `Focus` chapter reading CLEAN while its masters held the defect |
| **A plugin-side write to a master does NOT re-sync the copies already placed** | set `borderRadius = 9999` on the main instance → the master fixed, the `Button·SM` copies on `14 · Screens · app` still read `r0` after closing and re-opening the page | Repair copies in the same pass; do not assume the master carries them. `resetOverrides()` exists on the shape but is **not** used: it would also revert the label/paint/size a screen deliberately set. Only re-driving a spec board through `CF` propagates, because then the copies are rebuilt rather than left behind |
| **A raw `borderRadius =` write clears the token binding** | the negative control (write `r0` → restore `r9999`) left `radius_unbound: 1` on the page even though the value was exactly on the ladder | Any sweep that writes corners must bind afterwards: `TK.roleSweep` ends each page with `TK.bindPage(n, {only:'radius', pageSettle})`. A geometry repair and a binding repair are one operation, not two |
| **A ring plate takes its host's corner, and nothing checked that** | `ring·focus` around a pill button was drawn at a ladder step (10) while the host sat at 0/9999 → the visible defect. Rule 37 `ring_off_host` now compares the two maxima and is proven non-vacuous both ways (host→26 and ring→10 each produced `{radius_unbound 1, ring_off_host 1}`) | `CF.ROLE.ring = 'host'`: a ring's radius is derived from the shape it outlines, never from a ladder step. When widening a gate, expect **previously invisible** debt to surface — the first re-gate after the exemption was lifted added 16 paint and 12 type findings on `07.02` alone, all inside masters |
| **A ring's *position* is a relation too, and rule 37 could not see it** | the same `ring·focus` on `04.04 · Text fields · Search·Spec` sat on the spec board, 10–72 px away from the plate it outlines — the report was "this element drifted". Census over the file's 231 rings: 7 floating drifts, 3 legitimate flat-row-band rings, 224 ok | Rule 38 `ring_detached`, judged by `TK.ringHost()` (enclosure 0–12 per axis + centre Δ ≤ 3) and repaired by `TK.ringSweep()`. `ctx.ring` always mounts inside the control, so **a board-level ring is structurally impossible for new work** — its ancestry reaching `·Spec`/PageRoot without passing a control board is the signature of a stale outline left by a refit |
| **A fixed ±2 margin test flags the file's correct rings** | the first draft found 47 "offenders", then 25 after loosening the owner filter; all of them were rings whose family genuinely uses 5/6/7/9/10, or a link/breadcrumb ring whose margin is 0 and non-uniform (≈1.5 horizontal / 3 vertical) | The **margin is not a rule**; enclosure + concentricity is. The repairer re-applies the ring's own measured `ox`/`oy` instead of forcing `TK.RING_OFF`, otherwise one sweep repaints every non-uniform outline in the file |
| **The owner is usually a nested plate whose anatomy name has no `·`** | owners found in practice: an addon's `field` rect, a Checkbox `box` (18×18), a Slider `handle` / `state·layer` (20 / 40), one OTP digit, one crumb `Text` run | Resolve by **geometry over the control's subtree** (innermost concentric+enclosing match wins), never by a name pattern. A `·`-requiring filter reports the best-behaved rings in the file as detached |
| **A flat row band has no plate for a ring to outline** | Tree / Accordion / anchor-rail rows are drawn as `Text` + glyphs only — 3 such rings, all intentional focus affordances on the row | Fall back to **containment**: the ring inside the control expanded by the max margin, with the ring's centre inside the control. `design-guide.md §5.1` states it; `res.contained` is what `audit_design` accepts it through |
| **Shape ids share a UUID prefix across a whole page** | every id on `04.04` begins `a0ae248a-a193-80c9-8008-…`, so a probe comparing `id.slice(0,8)` saw 41 rings as **the same shape** and reported a stacked duplicate that did not exist | Compare and export **full** ids (`export_shape` rejects the short form). A "duplicate/alias" hypothesis built on a truncated id is an artifact of the truncation — measure the id before believing the finding |
| **A repair pass that ends in `bound: 0` may have unbound something** | the apply pass wrote geometry and corners and reported `bound: 0` (nothing *new* to bind) — correct here, because the touched rings carry `r0`/`full` and `TK.bindPage` had already landed them, but indistinguishable from a pass that dropped its own writes | Always re-read after an apply: a dry `ringSweep` (`drift 0`) **and** `designPage` CLEAN on each touched page. `audit_layout`'s `ring_detached` count is the independent check that the repairer's own counter is honest |
| **A frame sized from an assumed grid, not the drawn one** | `CF.miniCalendar` computed its height from a hardcoded `rows: 6` while the loop `continue`d over every out-of-month slot, so a 31-day month starting on the first column drew 5 rows inside a 6-row sheet: content inset bottom 49px vs top 7px. The reviewer read it as "the border is bigger than the content — is that to reserve next month's days?" No: nothing ever painted those cells | Derive the frame from the content (`rows = ceil((firstWeekday + days) / 7)`, an explicit `rows` only ever raising it) AND paint the adjacent-month numbers muted, so the grid has no empty slot at all. Gate: rule 46 `frame_dead_band`, BOTTOM axis only — a 4-side version flagged 30 hosts on page 06 of which 29 were legitimate stretch-to-container rows (`TableRow`/`ListItem`/`Timeline`) |
| **A variant axis that only renames** | `o.range` on `CF.miniCalendar` fed the NAME (`·Range`) but the soft band is drawn only when the selection is a two-end array, so the whole RANGE row of the spec board carried a label with no drawing behind it — invisible to every name-based coverage check | A prop that names a variant must also DRAW it: `range` now supplies `[today, today+4]` when `selected` is not an array. When adding an axis, verify by export, not by the host name |
| **A pairing rule you cannot prove on a multi-row host** | to move an icon onto its label's axis I first grouped the `…·fill`/`…·line` parts by NAME — a `Tree·MD` host repeats `glyph·folder` down five rows, so all five became one "mark" and the dry run asked to move them by dy −63.7 (and `Accordion` chevrons by −30.3). Grouping by ORIGIN instead splits one icon in two (the 1.7px dot of `info·fill` sits inside the 15px circle of `info·line`, so their origins differ by 6.7px), and grouping by BBOX INTERSECTION still crossed rows because a path's bbox carries its stroke | Only judge a pairing that is decidable: **one mark (1–2 parts) and exactly one text in the host** — Button/Chip/Alert/NavItem. A multi-row host is corrected by REBUILDING it from the factory, never by搬运 siblings. Always run the repairer `{dry:true}` over the whole file and read the deltas before applying: that is what turned −63.7 into a rejected design before it touched the file |
| **`fillFitMode` is accepted and then thrown away** | the natural fix for 30 stretched photos was `fillFitMode:'cover'` on the image fill. Assigning it raises no error, and the readback returns a fill with only `fillColor/fillOpacity/fillColorGradient/fillColorRefFile/fillColorRefId/fillImage` — the mode is gone, and the render stays `content` (stretch). `keepAspectRatio` (M5) is the same story | Do not express the crop through the fill: build it. `MD.place({mode:'cover'})` wraps the slot in a `clip·` board (`clipContent`) and lays the media inside at ITS OWN ratio scaled to cover; `MD.refit` does the same to an existing file. Gate: rule 47 `media_stretched`, judged on the asset numbers the fill record DOES carry |
| **An overlay written as a flow child** | 22 `scrim·region·*` plates on the screens page were flex children at half the region's height, so each scrim occupied the top of the media slot and shoved the photograph below it out of the region — the export showed a gray band where the image should have been | An overlay is `absMount(parent, plate, parent.x, parent.y)` + the media `sendToBack()`; `CF` already does this, hand-authored screens did not. Gate: rule 48 `overlay_in_flow`, judged on the plate's own name (using `isAnno` would blind it, because an overlay's parent is a `region·…`) |
| **A recipe band taller than the regions it authors** | `worksIndex`/`journalIndex` declared `footer: 900` while the deepest footer region is `+96 +300 = 396`, and `portfolioHome` declared 900 against content ending at 620 — so every screen board carried 504px/280px of empty sheet under its last region | Size a band from what is placed in it, then trim the frame (`rule 46 frame_dead_band` catches the residue; the recipes now declare 396/620 with the derivation in a comment). When a board is shrunk, RE-STACK the shelf: the gap after it was authored at 64, so leaving the siblings in place turns a 504px trim into a 568px gap |
| **`ctx.ring` threw away the box it was handed** | every factory that draws a focus state computes the **unit** the keyboard is on (`CF.steps` → the active node, `CF.menu` → the highlighted row, `CF.otp` → the digit, `CF.anchor` → the active line, `CF.miniCalendar` → the selected day), but `ctx.ring` replaced it with "host board + 2px" — a defence against a matrix refit moving the host afterwards. Measured 2026-10-22 on `08 · Navigation`: **20 of 20** rings were host+2, so a five-node timeline wore a 775×24 band and a menu wore a 224×152 box around a 32px item. What the reviewer saw as "this class should not have a focus border" was a ring on the wrong object | Take the caller's box: translate it by the host's own move delta (`host - ctx.box`), snap to the host only when the caller asked for ~(the whole host) (±6px), allow a ≤6px halo (the clip is released anyway) and clamp only a *large* escape. The move-guard the old shortcut existed for is preserved without discarding the geometry |
| **A focus ring on a composition is the wrong form, not just the wrong size** | tightening the ring still left a rectangle around a step node, a menu row and an anchor rail — copy bands with no plate of their own, where an outline reads as a crop mark | `CF.FOCUS` (§1.3) makes the form a **family role**, decided in one place: `outline` paints a 2px boundary on the unit; `reserved` authors the identical boundary at `strokeOpacity: 0` — slot, width and corner survive for a runtime to raise — and paints the unit's 12% brand `wash·focus` as the cue. Gate: `focusEvidence` refuses a layer that does not paint (rule 16), rule 44 `focus_invisible` refuses a slot with no visible layer, so a hidden border can never be *mistaken* for a focus state |
| **A `.parent` walk from a shape you just removed freezes the plugin** | a repair call deleted the host that was still `penpot.selection[0]`, then walked `while (!/·Spec$/.test(n.name)) n = n.parent`; the walk never terminated, the plugin's main thread blocked, and **every** later `execute_code` failed with `Task … timed out after 30 seconds` — the bridge log shows `Sent task …` with no `completed` line, which is the fingerprint of a hung tab rather than a disconnected plugin | Capture the ids/boxes you need **before** removing anything, re-resolve shapes by name from `penpot.currentPage` / `page.root` instead of trusting a stale `penpot.selection`, and bound every ancestor walk (`guard++ < 8` + `try/catch`, the pattern `audit_design`'s `ringHost` already uses). Recovery: reload the Penpot tab — the shapes written before the hang are already persisted, so the file does not have to be rebuilt |


## 18. Raster media and screen assembly (measured 2026-10-22, `storage.MD` + `storage.SC` on a live file, gate G17)

| Pitfall | Evidence | Rule |
|---|---|---|
| `uploadMediaData` guessed signature | the 2-arg form and the `{name,data,mtype}` object form both fail with `media type  is not supported` | **three positional args**: `(name, bytes, mtype)`. Penpot does not sniff the type, it is told (M1) |
| Upload accepts any bytes? | three garbage bytes → `http error` from the backend | The bytes must decode to a real image. A success returns `{name,width,height,mtype,id}` with the asset's **true pixel size** — the media object is itself the size record; never trust a hand-typed width (M2) |
| `uploadMediaUrl` with the loopback server | `Value not valid. Code: :uploadMedia-url` | That fetch runs **inside the Penpot container**, which has no route to this machine's `127.0.0.1`. Binary comes through the skill server's `/b64/<path>` → `atob` → `Uint8Array` → `uploadMediaData` (M3). Related: the sandbox `fetch` response exposes only `.text()`/`.json()` — **no `arrayBuffer`/`blob`**, which is precisely why `/b64/` exists |
| `fills = [{ fillImage: { id } }]` | `Value not valid: [{:fill-image {:id #uuid …}}]. Code: :fills` | Paint the **whole** media object returned by the upload: `fills = [{ fillImage: media }]` (M4) |
| Cropping claims | `keepAspectRatio` assigned `true`, assigned `false` — both read back `null` | Crop behaviour is **unverified**; do not describe a fill as covering/containing. `fillOpacity` does land (0.5 → 0.5) (M5, and `penpot-capabilities.md` §12) |
| Listing the file's media | `penpot.currentFile` exposes only `id/name/revn/pages` | **There is no media registry to read.** `MD` caches `name → media` for the session and `MD.recover()` rebuilds it by scanning shapes for `fillImage` — an uploaded-but-unused asset is unrecoverable (M6) |
| Proof a placed asset is real | readback shows the fill, not the pixels | Proof is an **export**: `export_shape(id, mode:'fill')` returns the raw asset, `mode:'shape'` renders the shape with it — both verified byte-for-byte against the source PNG (M7) |
| A screen board placed at **page root** | a 31-shape screen at root: `designPage` reported `shapes: 201` and verdict **CLEAN**, while `audit_layout` indicted it as `root_stray` | `designPage()` walks from the **page head** (`headOf(root)`), so a second root-level board is *invisible to the design gate*. Screens mount **inside `NN-PageRoot`** (`SC.pageRoot()` + `SC.nextSlot()`), and a delivery run uses `designStart`/`designNext` over every top-level board instead of trusting one `designPage({})`. A CLEAN that never looked at the board is the most expensive verdict type |
| Rule 40 fired on nothing | the first draft put `placeholder_media` after `rec(s)`, and `rec()` returns early for shapes that are not boxes — every raster slot is a **rect plate** | Judge a slot-name test **before** any box/text early-return. When a rule reads `0` on a page known to hold 19 offenders, test the placement of the check before concluding the page is clean |
| `no_source_record` counted 45 screens on a 12-screen page | a full-bleed `hero`/`footer` band is exactly the tier width, so a width-based screen test matched the screen *and its children* | Match **top-level** content boards only (parent is the page root or `*-PageRoot`). The same trap already exists for `no_guides`, which is why it is width-matched at every level — that rule *wants* every tier-width board; this one does not |
| The auditor's own family table lagged the factory | `CLASS` (state-coverage taxonomy) lists fewer families than `CF.map()`, so a new factory's controls read as "not a control" | `controlFamily()` indexes **live** `CF.map()` (both spellings — the map holds camelCase `otp` while a name head keeps `OTP·Block·Md`) and falls back to `CLASS`. Two spellings, one index |
| The slot grammar existed twice | `MD.isSlot` and the gate each had their own regex; a plate could be a slot for one and invisible to the other | **One** source: `CF.isMediaSlot(name)`; `MD.isSlot` and rule 40 both call it |
| A gate that cannot run reads CLEAN | a `14–16` page in a session where `screen_engine.js` was never seeded has no `storage.SC` to consult | **Unprovable is REPORTED, not passed** (the contract G16 already applies): rule 41's page-scope half adds a `no_source_record` finding naming the missing seed. A silent pass on an unseeded engine is how a gate becomes theatre |
| `SC.build` retried after the 30 s wall duplicated the screen | the second call created a second `Screen·home` | The board is found by its `nl:sc` stamp, so a re-run **mounts into it** (`mode:'mount'`) and `census.sectionsLeft` names what remains; only `{rebuild:true}` re-creates (S7/S8). Nothing is created and then deleted |
| Rule 49 indicted 5 healthy Accordion hosts | it compared every consecutive pair of same-column labels and called the widest one a hole — but an Accordion's gaps are header→body, body→header, header→header: **three different relationships, not three rows with a missing beat** | A rhythm gate needs an established rhythm: require the tightest gap to **repeat** (`repeats >= 2`) before judging an outlier. A host with all-different gaps is not a list |
| Rule 49 reported a 4-row menu as a 3-row one | `groupAssemblies` wraps a hovered/selected row's label inside its `row·` group, so a **direct-children** read of `board.children` never saw that copy | Measure copy **one level deep** (children + grandchildren). The same flattening must NOT be used for MOVING: shifting a group and its own child moves that row twice |
| A repaired host slid off its spec row | `CF.matrix` centres every cell on the row midline; closing 12px of empty space inside 12 Menu hosts moved each centre 6px away from its row label | Any pass that shrinks a host re-anchors it: `TK.centreOnRow` puts it back on the sibling caption it was centred on (a left-side text already within 8px of the old centre) |

## 19. Elevation, insets and sheen (measured 2026-10-23, `storage.EL` + gate G18 on a live file)

| Symptom | Cause | Fix / rule |
|---|---|---|
| The entire screen is flat although DESIGN.md has an "Elevation & Depth" section | the section was prose; the token seed translated it to **3 single-layer `shadow.*` tokens**, `CF.shadow` used its own internal one-layer ladder, and no SC section painted a surface. 3020 shapes, 49 shadows, 0 inner, 0 bound, 0 on the screen — and every gate read CLEAN | `elevation:` is frontmatter **data**; `EL.seed` creates one multi-layer token per **recipe** (incl. `inner`); `SC.record` sections carry `surface`+`elevation` and `SC.build` mounts `surface·<region>` before content. Rules 50–55 (G18) fail any of it missing |
| A card's bottom lip / top highlight is missing | the recipe only had `drop` layers, or a rebuild normalized the stack to one layer | `inner` layers are part of the recipe (`0 -8 0 .051` + `0 4 0 white/.6`); rule 52 `edge_missing`; repair `EL.apply` |
| Hover looks like a slightly darker button | state was modelled as an 8% tint; the hover recipe was never applied | `EL.roleFor` returns `controlHover`/`cardHover` from the host name; `hover_flat` (rule 54). Measured: default 4 layers → hover **8** |
| A shadow renders black at full opacity | `color` was passed as a string | shadow color is `{color:'#RRGGBB', opacity}`. S2 in `penpot-capabilities.md` §9.2 |
| A gradient fill throws `Value not valid … :fills` | `fillColor` and `fillColorGradient` in the SAME fill, or pixel coords | gradient-only fill, **normalised 0..1** coords; the sheen is a **separate** plate above the surface |
| A **linear** `fillColorGradient` is rejected even with gradient-only fields | the builder omits `width`; the radial sheen path always set it, so radial worked and linear did not | every gradient fill needs `width: 1` (measured 2026-10-23: adding `width:1` to `{type:'linear',startX:.5,startY:0,endX:.5,endY:1,stops:[…]}` made it valid) |
| A `sheen·` plate is 100×100 instead of the host | a plain `{x,y,w,h}` box read through a shape-only reader → 0×0 → resize skipped; Penpot's rectangle default is 100×100 | accept both `width/height` and `w/h` in the box reader; `audit_layout.crash_100x100` is the fingerprint that catches it |
| `token.applyToShapes([a,b,c,d], ['shadow'])` reports success but binds 0 | batched shadow-token application is unreliable (2/2 buttons bound, 0/4 chips in one call) | apply **one shape per call**, one settle wait, then verify + retry once (`EL.bindStamped`) |
| Re-applying the **same** shadow token unbinds it | `applyToShapes([shape], ['shadow'])` on a shape already bound to `shadow.chip` toggles the binding OFF (measured 2026-10-23: `tokens.shadow` disappeared, the 4 painted layers stayed) | bind only when `shape.tokens.shadow !== 'shadow.' + recipe`; `EL.bindStamped` now skips already-bound shapes and retries only the still-unbound |
| `EL.sheenFor` returns `ok` but the host has no `sheen·` child | the stale-sheen cleanup compared `k === plate`, and Penpot returns a **new proxy** on every `.children` read, so it removed the plate it had just inserted | remove stale sheens **before** creating the new plate, compare by `.id`/name+box, never object identity |
| A `sheen·` plate survives a recipe change (`control` → `chip`) and the top-light doubles | old and new keys differ, so both plates existed | one sheen per host, keyed `sheen·<recipe>`; the new `sheenFor` removes same-box siblings first |
| A button's label is 9px low although the host/padding are correct | `place()` did `parseFloat(t.lineHeight)` on a **unitless** leading (`1.25`), then centred on a 1.25px-tall box; every one of the 21 Button masters measured `dy=9` | resolve a ratio `< 4` against `fontSize` (`1.25 × 16 = 20px`) before centring; fall back to `CF.lineH(fs, weight, family)` |
| Every factory label is Nunito while the file declares Urbanist | `mkText` trusted `storage.T.bodyFont`, which was never set, and the seed's default is `Nunito`; `TK.bindBoard` then bound `type.label-lg` by size/weight, so the wrong family passed the type gate | `mkText` resolves the **declared ramp's family** for the (size,weight) pair; a JS fallback family is legal only when the file has no typography tokens |
| `TP.apply` leaves the right font but no `tokens.typography`, and leading 1.2 | `LibraryTypography.applyToText` drops the token binding and rewrites `lineHeight` to 1.2 | `TP.apply` re-binds the token named after the style and re-asserts the style's leading **after** the bind; never bulk-apply over token-bound copy without a rebound check |
| `fontSize`/`fontWeight` read as 0 in a new audit rule | they read back as **strings**; `Number.isFinite('16')` is false | `parseFloat(str(shape, 'fontSize'))` for text metrics |
| `CF.radius('tile')` returns 3 while the file's `radius.sm` is 12 | the role→ladder mapping used the static fallback table (`0/2/3/5/100`) instead of the live token values | `CF.radius(key)` reads `TK.declared().radii` for `radius.<key>` first; the static table is only the no-token fallback. `CF.setReference` also derives `control`/`tile` from the measured source shapes |
| A master's new `sheen·` child appears on its existing screen copies | expected — children propagate from the master | do not author the sheen on a copy; rule 53 exempts copies |
| A focus ring looks like a detached frame with a gap | an **outset** ring with the same corner radius as its host is not parallel: the gap is the offset on the straight edges but smaller at the corners. The first build used a 44×44 r12 ring around a 40×40 r12 tile (measured 2026-10-23) | focus rings on buttons/icon buttons are now **flush**: ring box = host box, ring radius = host radius, 2px inner stroke. Filled brand/ink surfaces use `color.onDark` (white) so the ring is not red-on-red; light/secondary use `color.primary` |
| `CF.component(host)` returns `{ok:true}` but the library count does not move and the host is not a main | the host is a board that **contains a component instance** (a Field holding an Input instance); Penpot creates an empty-shell record with `id:''` instead of a master | do not wrap an assembly in a second component. Register the leaf controls; treat a composite of instances as an assembly. Register composites **before** their children become instances if they truly must be masters |
| `shadow_unbound` fires on the 15 FAB cells only | the role key was `Fab` while the library names them `FAB`, and a strict `EL.roles[fam]` pre-check skipped them before the case-insensitive resolver ran | family lookup is case-insensitive and the pre-check is gone; also `Button·MD` (size, no type) must resolve to `default`, `Focus/Selected/Disabled` are neutral states |
| Every card's floor is a `header_collision` | the positioning audit's `OVER` regex did not know `surface·`/`sheen·`; a plate covering its own title is the design | add both to `OVER` (they are derived layers like `wash·`/`scrim`), not to the control audit |
