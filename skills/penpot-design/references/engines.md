# Engines and recipes (battle-tested)

Build and repair engine code is **all externalized to `scripts/`** (can be pasted and run independently); this article only keeps the mechanism, usage, templates, and page recipes.

| Script | Content | Usage |
|---|---|---|
| `scripts/seed_storage.js` | tokens `storage.T`, `mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`mkChip`/`ct`/`pg`/`sleep` | run first each session; re-seed after storage loss |
| `scripts/layout_engine.js` | **`storage.LY.*`** — the region math: `SPACE`/`ROWS`/`TIERS`, `snap`/`onScale`, `frame`/`container`/`grid`/`split`/`rows`/`flow`/`repeat`/`pack`, `viewportHeight`/`fold`, `recipe`/`plan`/`rect`/`keys`, `slots`, `drawStart`/`drawStep` | run right after seed; every coordinate on every page comes from it (gate **G11**) |
| `scripts/component_factory.js` | **`storage.CF.*`** — the variant-producing factories + `build`/`matrix`/`component`/`variants`, **components** `get`/`register`/`instance`/`swap`/`variantSet`/`svgIcon`, `P` palette, `STATE` alphas, `ladder`/`radius`/`fills`/`name`/`glyph`, `minHit`/`tier`/`autoHit`, `map`/`missing` | run after LY; every control on every page is produced by it (gate **G12**). The registry is `CF.map()`; **`CF.missing()` must return `[]`** — that is the count to trust, not a number written in a doc. Screens reuse controls through `CF.instance(CF.name(...))` + `CF.swap` (instances, not re-drawn copies); a variant set needs `CF.variantSet(hosts, family, props)` with one `properties` object per host |
| `scripts/native_layout.js` | **`storage.NL.*`** — native flex/grid authoring: `frame`/`row`/`col`/`gridFrame`/`cell`, `mount`/`add`/`sizing`/`fill`/`fix`/`hug`/`alignSelf`/`margin`, `applyFlex` (whitelisted pad/gap/align vocabulary), `label`/`plate`/`line`, `guide`/`rulerGuide`, `stamp`/`readStamp`, `settle`/`whenSettled`/`report`/`auditFlow`/`nudge`/`reflow`/`fromRecipe` | run after CF; turns the LY region plan into **flow** boards so the file stays editable (`references/native-layout.md`). `fromRecipe` needs LY, `frame({shadow})` needs CF, both degrade instead of throwing |
| `scripts/audit_design.js` | **design-rule lint** (`designPage`/`designStart`/`designNext`/`designAll`/`designGate`): 18 signatures — grid/scale/ramp/gap/measure/split/cap/touch/primary/row-height/radius/contrast/viewport/state-coverage/`variant_sparse`/`focus_ring_missing`/`disabled_wrong`/`name_invalid` | run per board as built and per page at the end; gate **G13** blocks delivery |
| `scripts/repair_engines.js` | `fixStaleCenter` / `groupAssemblies` / `fixZOrder` / `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans` | run once to plant into storage, call page by page |
| `scripts/fix_layout.js` | flex-collapse repair (getDesignSize + absRow + fixCol, two-round convergence) | run directly on the target page |
| `scripts/token_engine.js` | Design Tokens (`TK.seed` build set + record token auto-active / `TK.apply` apply + readback verify / `TK.paint`·`TK.changed` theme-switch paint proof / `TK.audit`·`TK.assert` health check / `TK.unbindFill`) | record immediately after building skeleton; re-run health check before acceptance (gate **G9**) |
| `scripts/palette_engine.js` | Library colors (`LIB.seed` idempotent create+rename+set / `LIB.fill`·`LIB.stroke` ref-bound paint with readback / `LIB.audit` channel inventory via `shapesColors` / `LIB.replace` raw-hex swap) | the second re-skin channel (capabilities §7); independent of LY/CF/NL, so it can be seeded at any point |
| `scripts/prototype_engine.js` | Prototype + delivery (`PR.flow`/`ensureFlow`, `PR.nav`/`overlay`/`close`/`url`/`delay`, `PR.prototype(links,{flow})`, `PR.read`/`clear`, `PR.exports`/`bytes`, `PR.checkpoint`/`versions`/`restore`, `PR.ANIM` presets) | wire `14–16 · Screens` into a clickable flow before delivery (C6/C7/C9); its four rules P1–P4 (destination is a **shape**, interactions are append-only, animation fields complete, versions are verified not trusted) are in capabilities §8/§9 |
| `scripts/icon_engine.js` | Icons (`IC.seed` JSONL/`IC.add` any SVG / `IC.get`·`search`·`missing` / `IC.svg` color substitution / `IC.place` / `IC.grid`) | catalog `assets/icons/lucide.jsonl` (Lucide, ISC, 1966 icons); seed only the lines a page needs; channel choice + licenses in `references/icons.md` — in-control glyphs stay `CF.glyph` |
| `scripts/audit_layout.js` | positioning audit (`auditPage`/`auditAll`): **eleven signature classes** + font histogram, read-only | run on each board as built; recompute after finishing |
| `scripts/fix_geometry.js` | geometry repair (column offset/board height/root height/right overflow, four engines, all support dry-run) | repair page by page after audit lists |
| `scripts/scaffold_structure.js` | **18-page skeleton**: pages → PageRoot/Header/Footer → `fit` (root height = used height) | first step of code-to-design; re-runnable, and phase 3 is the delivery-time height fix |

> **Seed order iron rule**: `seed_storage.js` → `layout_engine.js` → `component_factory.js` → `native_layout.js` → `audit_design.js`
> (each consumes the previous one's `storage` keys. Failure behavior is deliberately different:
> `audit_design.js` **refuses to run** without LY+CF and returns `{ err: 'run … first' }`, because a lint that cannot
> see the engines would report CLEAN; `component_factory.js` **reports** `slots: ['LY not seeded']` in its return value
> instead of throwing, because half a seed is still worth more than none; `native_layout.js` refuses without `mkText`
> and reads `storage.LY`/`storage.CF` **at call time**, so it can be seeded last. `token_engine.js`,
> `palette_engine.js`, `prototype_engine.js` and `icon_engine.js` depend only on `penpot.library.local` /
> `createShapeFromSvg` — they seed at any point (`IC.grid` additionally wants `mkText` from the first seed), and
> re-seed after a storage wipe. Either way: read the return, do not assume.)
>
> **Build iron rule**: G11 = regions come from `LY` (a typed coordinate is a defect); G12 = controls come from `CF`
> (a hand-built control is a defect and will also fail `name_invalid`); G13 = `designGate` CLEAN before delivery.
>
> **Repair iron rule**: `audit_layout.js` single-board audit as each board lands (G3) →
> **Phase 1 geometry**: `fix_geometry.js`'s `fixGeometryAll({apply:false})` lists → review → `{apply:true}`
> → **Phase 2 alignment**: `repair_engines.js` finishing (`cleanOrphans → fixStaleCenter → alignPage → vAlignPage → fixInner → unclip → groupAssemblies → fixZOrder`, G4/G10) →
> `audit_layout.js` + `audit_design.js` recompute to `CLEAN` (G5 + G13).
>
> **The two phases must not be merged, and needn't both run**: tested 121 out-of-bounds all resolved by the geometry engine, `vAlignPage` hit 0;
> running the alignment engine first would snap on a wrong baseline and introduce false-hurts. **Diagnose the signature first, then decide which engine.**
> Signature judgment and noise rules are in `references/positioning-audit.md`.
> **When a design-rule signature keeps coming back, fix the producer, not the board** (`LY`/`CF`/the palette), then rebuild that board.

### Seeding without pasting: fetch + new Function (the only viable path for the big engines)

**Pasting is capped** (`execute_code` arguments are truncated at ~21 KB), so `component_factory.js` (264 KB),
`layout_engine.js` (60 KB) and `audit_design.js` (41 KB) *cannot* be pasted whole — the docs' "paste the file"
language means "load the file", and the reliable loader is a loopback fetch (the plugin runs in a browser on this
machine, so `http://127.0.0.1` is reachable and exempt from mixed-content blocking — measured 200):

```bash
python3 scripts/serve_skill.py            # loopback-only static server with CORS, port 8777
```

```js
// one call seeds everything, in engine order; measured: 259 KB component_factory in 35 ms
for (const f of ['layout_engine.js', 'component_factory.js', 'native_layout.js', 'audit_design.js']) {
  const src = await (await fetch('http://127.0.0.1:8777/scripts/' + f)).text();
  new Function('storage', 'penpot', 'penpotUtils', src)(storage, penpot, penpotUtils);
}
```

The three sandbox objects must be passed as **parameters** — a `new Function` body cannot *see* `storage`/`penpotUtils`
(api-pitfalls §7); the engines assign themselves into `storage`, so the return value is only the seed report (read it:
`seeded`, `factories`, `slots`, …).

⚠️ **Two of the scripts are runners, not planters**: `fix_layout.js` and `scaffold_structure.js` *execute* when loaded
(scaffold creates up to 6 pages and schedules a page switch as a side effect of seeding — which hijacks
`penpot.currentPage` mid-batch). Load them only when you intend to run them, never inside a bulk seed loop, and after
any load that could switch pages **re-verify `penpot.currentPage.name` before touching shapes** — a write while the
page is still switching fails with `Value not valid … Cannot modify a page that is not currently active`
(api-pitfalls §11).

Fallback when the Penpot file lives on another machine: paste the small engines directly and chunk the big ones
(`storage.__part = (storage.__part || '') + chunk` … then join + `new Function`) — the fetch path only removes that
cost.

Generic runner (engines/repairs run page by page; **pre-cut next page at tail, must verify `penpot.currentPage.name` before probing**):

```js
const q = storage.xxxQueue;
if (penpot.currentPage.name !== q[0]) { penpot.openPage(storage.pg(q[0])); return {wait: penpot.currentPage.name}; }
const pg = q.shift();
const r = storage.engineFn();
if (q.length) penpot.openPage(storage.pg(q[0]));
return { page: pg, ...r, remaining: q.length };
```

## 1. Repair engines (code: scripts/repair_engines.js)

- **alignPage**: text snaps to "the smallest host containing its world center (rect/ellipse, 24≤side, area≤20000)"; if it should be centered (vertical deviation≤6px, large host≤3px) snap to the host's exact center; page-level direct text skipped; Breadcrumbs flow reflow, Tabs centered by 120px column. **All in world coordinates** (mixing parentX produces cross-level false-containment mis-snap).
- **vAlignPage**: small boards (≤70px tall) single-line direct child text vertical centering (only triggers at deviation 5–15px), with **stacking guard** (same-board x overlap≥50% and y diff>4 = deliberate stacking, skip).
  - False-hurt recovery: record repair log → restore deliberately off-center elements by known design coordinates (e.g. Number Field ＋ at y=−2 / － at y=22; Progress label y=0).
- **fixInner**: whole-file stroke batch fix (closed shapes→`inner`, paths→`center`; mechanism in api-pitfalls.md §3).
- **unclip**: whole-file `clipContent=false` (fix glow clipped invisible; mechanism in api-pitfalls.md §4).
- **fixStaleCenter**: fix **stale-center** centering large offset (>6px, fingerprint judgment) — the text's **top-left corner** lands exactly on the host center
  (`|t.x−hcx|≤2` or `|t.y−hcy|≤2`, per-axis independent), the arithmetic consequence of "using 1×1 transient width/height at creation to compute `(w−1)/2` centering".
  Deliberately left-aligned text only lands at `host.x+padding`, never sticks to the center → fingerprint judgment zero false positives; only moves the hit-axis coordinate, touches no hierarchy/style.
  **Must come before alignPage** (division: >6px large offset belongs to this engine, ≤6px micro-diff belongs to alignPage snap).
- **groupAssemblies**: assemble into groups (assembly-ownership contract `penpot-structure.md` §4.3). Under the same parent, "host (rect/ellipse/board ≥24)
  + sibling primitives whose center falls inside it and whose smallest host is it" → into a group, group name = host name.
  Inside-out (ascending area) → nested groups (button group into nav bar); idempotent (skip within same group/component, compare parent/child by `.id`);
  **built-in compensation grouping** (`penpot.group`'s destructive side effect see api-pitfalls §6.1: capture min parentXY → group →
  `absolute=true` → reset → readback verify), guaranteeing members' world coordinates zero displacement.
  Upgrade reusable assembly to component: `CF.component(group)` (= `createComponent([group])`). Note what registration does:
  the host **becomes** the component's main instance — it stays on the canvas, and `comp.remove()` deletes it along with
  every instance (api-pitfalls.md §6), so register from a masters board or accept that the board you registered from is the master.
  **On a screen, "reuse" means `CF.instance(CF.name('…'))`** — instancing *is* scriptable (api-pitfalls.md §6,
  capabilities §5), and `CF.swap` switches the placed control to another registered variant; a `CF` factory re-call stays
  valid as the fallback when no master was registered, and produces identical geometry either way.
- **fixZOrder**: in-group front/back order repair (z semantics: larger `parentIndex` = more front). `penpot.group` puts the base plate above the label
  (label covered) → within group sort by descending area `setParentIndex(i)` (large base at bottom, text on top), instance internals skipped.
  `groupAssemblies` already has the same logic built-in (with group layer-slot preservation); use this engine for old-group batch fixes. Verify by whole-board export (small-shape group export has a cache illusion).
- **cleanOrphans**: clean root-level orphan text (historical crash residue, pollutes traversal).

The repair log returns `[{position, content, axis, offset}]`, **audit-review before going to the next page**.

### gridSnap — grid snapping (template, not wrapped)

Compute expected positions from the standard grid, batch-snap beyond tolerance. Calendar example (column-center/row-center formulas parameterized by actual layout):

```js
const colCx = (c) => 21 + c * 29.14;
const rowCy = (r) => 119 + r * 31;
for (const c of kids) {
  if (c.type === 'text' && /^\d{1,2}$/.test(c.characters)) {
    // find (r,col) minimizing |center - grid center|; snap if >0.5
  }
}
```

Note: run an audit once before snapping (collect the offset list for manual review), confirm the expected-position model is correct before batch fixing — a wrong expectation model would fix all elements wrong (instance: the weak-color rule was written inverted and false-hurt the 17–30 whole row).

### Dedicated repair patterns

- **Arc path rebuild**: delete old path → `bez()` generate (api-pitfalls.md §2) → appendChild (world-coordinate d needs no re-positioning).
- **Continuous path arrow bubble**: bubble outline + V-shaped arrow one path, rounded kappa approximation; text re-appendChild to top layer and centered by render width/height.
- **Crash-damage repair**: walk detects 100×100 non-text primitives → resize per design spec (board + edge-touching children, header board must be handled).
- **Cross-page delete**: first `penpot.openPage` that page (wait for switch to take effect), then remove.

## 2. Build seeds and the component factory

`scripts/seed_storage.js` is the single source for the primitives (approach C, `mkAbsBoard`/`absMount`/`mkText`/`ct`) and
`scripts/component_factory.js` for the controls; token values stay synced with DESIGN.md. Approach-C details and the
three approaches' tested behavior are in api-pitfalls.md §10.

**Do not write a `storage.mkButtonA`-style one-off constructor any more.** A bespoke factory is exactly what gates
G12/G13 reject: it is absent from `CF.map()`, its host carries no `Family·Type·Size·State·Slot` name, so coverage,
focus rings and disabled dimming cannot be found by the lint, and the same button gets drawn twice with different
numbers. The supported path is to add the control **to `CF`**:

```js
// component_factory.js — the minimal shape of a factory (see CF.badge / CF.link for the smallest real ones)
CF.myThing = async function (o) {
  o = o || {};
  var L = CF.ladder(o.size);                     // {h,fs,padX,icon,radius,gap} over CF.sizes: xs sm md lg xl 2xl
  var label = String(o.label === undefined ? 'Label' : o.label);
  // width is measured (estW) or handed in by the recipe rect — the ladder gives height, never width
  var rect = o.rect || B(o.x || 0, o.y || 0, o.w || CF.estW(label, L.fs) + L.padX * 2, o.h || L.h);
  var ctx = CF.build(CF.name('MyThing', { type: o.type, size: o.size,   // the NAME is what makes coverage decidable
                                         state: o.state, slot: slotName(o) }),
    rect, { parent: o.parent, fill: C('surface'), radius: CF.radius('sm'), stroke: C('border'), strokeW: 1 });
  ctx.plate(B(rect.x + 8, rect.y + 8, 16, 16), { name: 'dot', fill: C('primary') });
  ctx.text(label, B(rect.x + 32, rect.y, rect.w - 40, rect.h),
    { size: L.fs, color: C('ink'), align: 'left', valign: 'middle' });
  await ctx.settle(); ctx.place();               // settle = let text render, place = center + disabled clamp
  return ctx.host;                               // ONE host with everything mounted inside (§4.3 ownership for free)
};
// then: add 'myThing' to the right CF.map() family, and a SPEC row so CF.matrix draws its state columns.
```

Rules that the `CF.*` context already implements and a hand-built control always forgets: `ctx.pend`/`settle`/`place`
(measure after render, never from the 1×1 transient), `stateAlpha(S)` + the `·Disabled` ancestor clamp, `C(tone)` through
the palette (never a literal hex), `ctx.ring` for focus, `CF.minHit`/`autoHit` for the touch floor, `CF.name` for naming.

Shadow parameters (still the hand-mechanics reference for anything `CF` does not own — glow, press, decorative cards;
shadow color **must be object format** `{color, opacity}`, a string hex silently turns black):

| Effect | offsetX/Y | blur | spread | color.opacity |
|---|---|---|---|---|
| 3D hard shadow (pre-press) | 0, 5 | 0 | 0 | 1 (one darker tone of same family) |
| soft shadow | 0, 2 | 4 | 0 | 0.06 (black) |
| card float | 0, 3 | 10 | 0 | 0.10 (black) |
| inner shadow (input/track) | style:'inner-shadow', 0, 2 | 4 | 0 | 0.08~0.2 |
| focus ring (yellow) | two layers: 0,3,0,0 dark yellow 1.0 + 0,0,0,3 bright yellow 0.15 | | | |

## 3. flex-collapse batch repair (code: scripts/fix_layout.js)

Symptom: buttons/cards on the export are squashed to text size (flex hug). Three steps: absolutize → restore design size by name → bottom-up reflow rows and containers, two-round convergence.

- `getDesignSize` name-map is **project-specific**, rewrite per the target design system's component naming before pasting.
- **Order trap**: first absRow (row sizing) then fixCol (container fix); fixCol skips `absolute` subtrees — otherwise absolute elements get re-squashed back to content size (tested lesson).

## 4. Screen assembly (code: `LY.recipe` + `CF.*`, recipes documented in layout-library.md §3/§5)

**There is no page-assembly coordinate table in this skill any more** — that table was the thing gate G11 replaces. A
screen is produced by three calls:

```js
var t = LY.tier(tier);
// probe pass: recipe().totalH = what the bands *require* (independent of the h you pass in)
var probe = LY.recipe(key, { w: t.w, tier: tier });
if (probe.err) return probe;                                  // tier refusal = the answer, not an obstacle
var h = Math.max(probe.totalH, LY.viewportHeight(tier));      // §0.4: never below one viewport, never a typed number
// build pass: same numbers plus the page origin, so LY.rect() returns world coordinates
var plan = LY.recipe(key, { w: t.w, h: h, tier: tier, x0: 80, y0: 240 });
var host = storage.mkAbsBoard(key + ' · ' + tier, 80, 240, t.w, h, storage.T.surface, 0);
await CF.pageTitle({ parent: host, rect: LY.rect('pageTitle'), title: 'Overview' });
await CF.toolbar({ parent: host, rect: LY.rect('filterBar') });
LY.fold(host, tier);                                          // dashed first-viewport marker
```

`h` only *stretches* the flexible region, while `totalH` is the content requirement — that is why the shape above is two
passes: measure, then rebuild at `max(totalH, viewport)` so an app board is never a viewport-shaped box with dead bands.

What the recipes already encode (so nobody has to re-decide it per task): the pane set and its widths (`rail`/`nav`/
`list`/`detail`/`facet`/`copy` presets), the band stack and `totalH` for long documents, chrome heights (56/64 app bar,
49/80 bottom bar, 44 status bar, 34 home-indicator inset), gutters and per-region padding, the split ratio and the
container ladder. layout-library §3 lists every recipe's regions in visual order with their numbers; §0.4 states the
long-page heights (marketing 1600–4000+, app `max(viewport, contentH)`, mobile feed 1600–2400).

Still worth knowing from the pre-engine era, because `LY`/`CF` do not cover it:

1. **Z-order of backing layers**: a zebra/hover row paints its full-width backing plate *first*, then the row content —
   inside one host this is `CF.tableRow`'s job; outside a host it is `fixZOrder`'s (area-descending).
2. **Decorative shapes may hang off the page board** (an oversized ellipse behind an auth card) as long as the host
   board has `clipContent = false`; they are exempt from the grid rules as `plate`/decoration, never as a layout box.
3. **Anatomy illustration recipes** (swallowtail title, capsule section header) are `CF.*` factories now; if the target
   system has one `CF` lacks, add the factory (G12), do not hand-draw it on the screen.
4. **Never re-derive a region for a second tier**: `LY.recipe(key, { tier })` either returns that tier's own pane set or
   refuses with `{ err, use }`. Refusal is the correct answer for "three-pane email at 375" — the fix is `mobileListDetail`.

## 5. Post-crash rebuild checklist

Browser/plugin crash → storage all lost. Rebuild in order:

1. re-seed **in the engine order**: `seed_storage.js` (T/fonts/mkText/mkAbsBoard/absMount/pg/sleep) → `layout_engine.js`
   (`LY`) → `component_factory.js` (`CF`) → `native_layout.js` (`NL`) → `audit_design.js` (`designPage`/`designGate`) →
   `audit_layout.js` (`auditPage`), plus the three engines that carry their own state and work at any point once their
   shapes exist: `token_engine.js` (`TK`), `palette_engine.js` (`LIB`), `prototype_engine.js` (`PR`); one command probes and
   supplements what is missing. Storage loss also wipes `NL._reg` (the build-time declarations) — without it `auditFlow`
   loses its `sizing_dropped`/`size_stale`/`not_settled` precision — so re-stamp with `NL.stamp` and prefer
   `whenSettled` over remembered sleeps;
2. `penpotUtils.getPages()` inventory page structure (measured working — returns the page objects; the alternative is
   `penpot.currentFile.pages`; **there is no `penpot.pages`**, capabilities §10), confirm canvas damage (100×100
   degradation check in api-pitfalls.md §8);
3. re-collect all board ids (old ids invalid);
4. when the user reports "some component missing", prioritize suspecting: component deletion taking the main instance along, timeout landing on wrong page causing mis-delete, crash degradation — investigate one by one per api-pitfalls.md §6/§11/§8.
