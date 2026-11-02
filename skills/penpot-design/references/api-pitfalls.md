# Penpot API pitfalls (v3)

> Measured on Penpot 2.18.3. Every claim here was read back from a live file. When this file conflicts with the official
> docs or `high_level_overview`, this file wins.

## 1. Coordinates, boards and flow

| Trap | Evidence | Rule |
|---|---|---|
| A board's absolute children do not follow a later `x`/`y` write | moving a built host leaves its world-absolute anatomy behind | place at final coordinates at build time, or use `CF.move` which compensates the whole subtree |
| `appendChild` into a flex parent re-flows the child | a raw child of an auto board gets a flow position | `absMount(parent, child, x, y)` for control interiors; `NL.add`/`NL.cell` for real flow |
| `resize()` downgrades a flow child to `fix` | a fill/auto child becomes a fixed box after resize | declare sizing **after** append/resize |
| A board's `auto` is hug, not "automatic" | a control host with a label in flow collapsed to the label | a control host in flow is `fix`; only content frames hug |
| Grid auto-placement is order-sensitive | cells land in the next free slot when `row,col` is not explicit | always pass explicit `row,col`; `NL.cell` clears `absolute` first |
| `constraints` set before append reset to left/top | measured on a probe | set constraints after `appendChild` |
| A removed board's loose children re-parent to the page root | deleting a built shell leaves glyphs floating | remove the subtree (`storage.removeTree`) and sweep root leftovers |

## 2. Text

- **Width/height at creation is transient** (often 1×1). Measure after render (`await storage.ct`, `NL.settle`) before
  centring; centring from the creation box is the stale-centre defect.
- **`lineHeight` reads back unitless** (`1.4`, not px). Resolve a ratio `<4` against `fontSize` before computing a text
  box height.
- `align`, not `horizontalAlign`. A wrong property name is silently ignored under `try/catch`.
- `createText('')` returns `null` in this build; a factory must not treat an empty label as a shape.
- `TP.apply` transfers family/size/weight but rewrites `lineHeight` to 1.2; re-assert the style's leading after applying.
- Text inside a flow board is a **layout child**; moving it requires either `layoutChild.absolute=true` or a layout
  move, not only `x/y`.

## 3. Paths and strokes

- `path.d` is in **world coordinates**, not relative to the shape. Generated glyph paths must already be translated.
- SVG `A` (arc) does not render. Use cubic beziers (`CF.arc`).
- Closed shapes stroke `'inner'`; open paths `'center'`.
- `penpot.createPath()` starts with a **default 1px black stroke**. A fill-only path must write `strokes=[]`, or every
  filled glyph/panel ships a dark outline that no token names.
- A Penpot board clips by default; a focus ring drawn outside a clipped host loses its band. Release the clip or draw the
  ring at its final box.

## 4. Tokens

### 4.1 Activation

- `addSet()` defaults to **inactive**. Tokens in an inactive set bind "successfully" but the value never takes effect.
  Activate explicitly (`active:true` / `toggleActive`).
- With themes, a set's `active` is derived from the union of active themes. Direct `set.toggleActive()` clears theme
  activation; switch themes instead.
- A theme switch re-skins bound shapes; a set-order change alone does **not** repaint an already-bound shape. Prove the
  theme on the paint (`TK.paint` → `activateTheme` → `TK.changed`).
- `resolvedValue` is empty for an inactive set; use it to detect a dead binding.

### 4.2 Apply and readback

- `applyToShapes` is async and fire-and-forget. Its return value proves nothing; **read `shape.tokens`** after a settle.
- **Applying the same token to an already-bound shape clears the binding.** Skip satisfied roles; `CK.applyBinding` does.
- `properties: ['all']` errors in this version. Omit `properties` for the default property or pass the exact property.
- `spacing` has **no default property**; pass `rowGap`/`columnGap` explicitly.
- A `borderRadius` token writes the four `borderRadiusTopLeft/TopRight/BottomRight/BottomLeft` keys, not the scalar
  `borderRadius`; coverage must read the four keys.
- A multi-fill state layer (base + tint), a gradient and an image fill cannot take a single-token fill; bind the base and
  leave the overlay/asset as material.
- A shadow token needs `color:{color,opacity}`; a string color renders black. A multi-layer + inset array round-trips.
- Unbinding requires writing a **different** value first; writing the same value is a no-op and keeps the binding.
- A token name cannot be both a leaf and a prefix (`t.color` vs `t.color.x`).

## 5. Components

- `createComponent([host])` **does not copy**: the host becomes the main instance. Register a host you intend to keep.
- `isComponentInstance()` is true for **masters too**. Use `isComponentCopyInstance()` to mean "a placed copy".
- A component's name cannot contain `/`; use `·`.
- A placed instance accepts size/position/text/paint overrides, but not structural edits. A missing child is a master
  change, never a sibling bolted onto an instance.
- A plugin-side write to a master does not re-sync copies already placed; re-open the page/settle and verify, or rebuild
  the copy from the master.
- Registering a board that contains a component instance can produce an empty-shell record; register leaves/composites
  before their children become instances, or treat the composite as an assembly.
- `CF.get(name)` scans the library; library records survive a `storage` wipe, masters do not disappear with the session.
- `variantSet` renames every head to the container name; do not rename heads afterwards (it wipes the property table).

## 6. Images and media

- There is **no media registry** to read; `MD` caches `name → media` and rebuilds from shapes by scanning `fillImage`.
- `uploadMediaData` takes three positional args `(name, bytes, mtype)`; Penpot does not sniff the type.
- `uploadMediaUrl` cannot reach this machine's loopback from inside the Penpot container. Use the skill server's
  `/b64/<path>` → `atob` → `Uint8Array` → `uploadMediaData`.
- `fillFitMode` is accepted and dropped; crop must be built (`clip·` board + media at its own ratio). `MD.place` does.
- Paint the whole media object: `fills=[{fillImage: media}]`, not `{id}`.

## 7. Pages, prototype and export

- `penpot.openPage(page)` is async; wait and re-read `penpot.currentPage.name`. A non-current page exposes only
  `id`/`name` (no root).
- A prototype destination on another page reads back `destination:null`; keep a flow's entry and targets on one page.
- Exports can time out at `networkidle`; change `/opt/penpot/exporter/app.js` `networkidle` → `load` and restart the
  exporter.
- A board never exported is not visually verified; export the master/screen and read the image.

## 8. Plugin session

- `storage` is volatile. A plugin reload, crash or wake can wipe every engine; re-seed in the documented order.
- A suspended tab reports a stale heartbeat while the MCP bridge may reject the new plugin connection as a duplicate.
  Restart `penpot-server-penpot-mcp-1`, then `MCP → 在此连接`.
- Do not walk `.parent` from a shape you just removed; capture ids/boxes first and bound ancestor walks.
- Do not hand-write coordinate/text helpers. They copy a systematic offset into every page; use `seed-storage` + `LY` +
  `NL` + `CF`/`CK`.
