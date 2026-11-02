# Layout and screen assembly

> Regions are computed by `LY`; flow is authored by `NL`; controls are `CK.instance`; copy uses the declared type
> ramp; raster uses `MD.place`; icons use `IC.place` / `CF.glyph`.

## 1. Tiers

`LY.TIERS` defines three width classes:

| Tier | Width | Columns | Margin | Gutter | Touch floor | Viewport |
|---|---|---|---|---|---|---|
| `web` | 1440 | 12 | 32 | 24 | 32 | 900 |
| `pad` | 834 | 8 | 24 | 16 | 44 | 1112 |
| `mobile` | 375 | 4 | 16 | 12 | 44 | 812 |

`1920` is the **spec-sheet canvas**, never a screen width. Set `CF.tier` before building a screen so hit pads and
control sizes follow the tier. A recipe that has no definition at a tier returns `{err, use}`; follow `use` (a
three-pane screen at 375 becomes `mobileListDetail`, never a squeezed desktop).

## 2. `LY` — regions

```js
const plan = LY.recipe('dashboard', {tier:'web', x0:0, y0:0, w:1440, h:900});
plan.regions          // named region boxes, flow-ready
LY.rect(plan, 'content')
LY.leaves(plan.regions) // the regions that actually hold content
LY.slots.modal(rect, {headerH:64, footerH:72, pad:24})
LY.fold(board, 'web') // fold ruler
```

- `LY.keys()` lists the built-in recipes. Common: `dashboard`, `listCrud`, `detailRecord`, `settings`, `email3`,
  `chat`, `kanban`, `calMonth`, `calWeek`, `hero`, `landing`, `blog`, `docs`, `pricing`, `ecom`, `cart`, `checkout`,
  `auth`, `otp`, `wizard`, `gallery`, `commandPalette`, `mobileListDetail`.
- A region that **contains** another region is structure; fill `LY.leaves(...)`, never the pane itself.
- Spacing comes from `LY.SPACE`/`LY.BREATH`; a typed gap is not a layout decision. `LY.pack`/`LY.fold` place siblings
  and reserve the fold line.
- `LY.recipe` returns region math, not shapes. Build the plan first, then mount components into regions.

## 3. `NL` — native flow

```js
const board = NL.fromRecipe(plan, {parent: screensPage});
const row   = NL.row('toolbar', {gap: 8, align:'center'});
NL.add(board, row, 'fill', 'auto');
const card  = NL.frame('content', {dir:'column', breath:'block', pad:24, sizing:{h:'fix', v:'auto'}});
NL.gridFrame('grid', {cols:[['fixed',240],['auto',1]], rowGap:16, columnGap:16});
NL.cell(grid, shape, row, col);
```

The sizing vocabulary is **`fix` / `auto`**, not `fixed`/`hug`.

| Need | Declaration |
|---|---|
| Control keeps its master box in flow | `fix` / `fix` |
| Board hugs its content | `auto` on the main axis |
| Board fills its parent | `fill` on the cross axis |
| Grid cell | `NL.cell(grid, shape, row, col)` |
| Absolute overlay | `absMount` / `layoutChild.absolute` — only for declared overlays |

Measured traps:

- `resize()` downgrades a flow child to `fix`; declare sizing **after** append/resize.
- A board with `auto` on a label in flow collapses to the label; a control host in flow is `fix`.
- `NL.settle()` / `NL.whenSettled()` must finish before measuring; a transient hug height is not a layout.
- `NL.auditFlow(board)` reports `not_settled`, `sizing_dropped`, `main_axis_overflow`, `absolute_child`,
  `root_stray`. A screen is accepted only when it reads `CLEAN`.

## 4. Screen assembly

```js
const plan  = LY.recipe('dashboard', {tier:'web'});
const board = NL.fromRecipe(plan, {parent: screensPage});

await CK.instance('Button', {type:'primary'}, {
  parent: plan.region('header'), absolute:{x:24,y:16}, text:'New report'
});
await CK.instance('Card', {}, {parent: plan.region('content'), absolute:{x:0,y:0}});
MD.place({parent: plan.region('hero'), slot:'img·hero', path:'assets/hero.jpg'});
IC.place({parent: plan.region('toolbar'), name:'search', x:24, y:12});
```

Rules:

- **Controls**: `CK.instance` only. A missing master is `missing_master`; extend the definition/factory, rebuild, then
  place. Never draw the control around it.
- **Bands**: a direct child ≥40% of the screen width and ≥56 high must be a component copy; ≥50% of structural children
  are copies. A raw band cannot be swapped, re-themed or fixed centrally.
- **Copy**: use the declared typography ramp; `TP.apply` when the file has library type styles.
- **Raster**: `MD.place({path, slot})` uses the user's own bytes and preserves the asset ratio; a gray plate with an
  image icon is a placeholder, not media.
- **Icons**: `IC.place` for standalone icons; `CF.glyph` inside a control. No emoji.
- **Overlays**: absolute children of the region, `sendToBack` when they are scrims; never flow children.
- **Tier**: `CF.tier` set before the first control; `LY.recipe` accepts only tiers it defines.

## 5. Screen acceptance

- `CK.instance` fallbacks = 0 for controls the source shows.
- `NL.auditFlow(board) === 'CLEAN'`.
- Exported screen compared with the source at the tier baseline width × each color scheme (`verification.md`).
- A board never exported is not “verified”.
