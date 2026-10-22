# Engines and recipes (battle-tested)

Build and repair engine code is **all externalized to `scripts/`** (can be pasted and run independently); this article only keeps the mechanism, usage, templates, and page recipes.

| Script | Content | Usage |
|---|---|---|
| `scripts/seed_storage.js` | tokens `storage.T`, `mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`mkChip`/`ct`/`pg`/`sleep` | run first each session; re-seed after storage loss |
| `scripts/layout_engine.js` | **`storage.LY.*`** — the region math: `SPACE`/`ROWS`/`TIERS`, `snap`/`onScale`, `frame`/`container`/`grid`/`split`/`rows`/`flow`/`repeat`/`pack`, `viewportHeight`/`fold`, `recipe`/`plan`/`rect`/`keys`, `slots`, `drawStart`/`drawStep` | run right after seed; every coordinate on every page comes from it (gate **G11**) |
| `scripts/component_factory.js` | **`storage.CF.*`** — the variant-producing factories + `build`/`matrix`/`component`/`variants`, **components** `get`/`register`/`instance`/`swap`/`variantSet`/`svgIcon`, `P` palette, `STATE` alphas, `ladder`/`radius`/`fills`/`name`/`glyph`, `minHit`/`tier`/`autoHit`, `map`/`missing` | run after LY; every control on every page is produced by it (gate **G12**). The registry is `CF.map()`; **`CF.missing()` must return `[]`** — that is the count to trust, not a number written in a doc. Screens reuse controls through `CF.instance(CF.name(...))` + `CF.swap` (instances, not re-drawn copies); a variant set needs `CF.variantSet(hosts, family, props)` with one `properties` object per host |
| `scripts/native_layout.js` | **`storage.NL.*`** — native flex/grid authoring: `frame`/`row`/`col`/`gridFrame`/`cell`, `mount`/`add`/`sizing`/`fill`/`fix`/`hug`/`alignSelf`/`margin`, `applyFlex` (whitelisted pad/gap/align vocabulary), `label`/`plate`/`line`, `guide`/`rulerGuide`, `stamp`/`readStamp`, `settle`/`whenSettled`/`report`/`auditFlow`/`nudge`/`reflow`/`fromRecipe` | run after CF; turns the LY region plan into **flow** boards so the file stays editable (`references/native-layout.md`). `fromRecipe` needs LY, `frame({shadow})` needs CF, both degrade instead of throwing |
| `scripts/audit_design.js` | **design-rule lint** (`designPage`/`designStart`/`designNext`/`designAll`/`designGate`/`designCoverage`): 37 signatures — grid/scale/ramp/gap/measure/split/cap/touch/primary/row-height/radius/contrast/viewport/state-coverage/`variant_sparse`/`focus_ring_missing`/`disabled_wrong`/`name_invalid` + token-binding `paint_unbound`/`paint_off_palette`/`type_unbound`/`type_off_ramp`/`space_unbound`/`space_off_scale` + `no_guides`/`pane_filled`/`not_component`/`caption_stale`/`empty_cell`/`no_type_styles` + the G16 provenance rule `not_projected`, whose chapter/exemption table it imports from `storage.FN` + the **whitespace trio** `cramped_gap`/`hierarchy_gap`/`text_cramped` (amounts from `LY.BREATH`, leading floor from the declared ramp, both published to the repairer as `storage.breathSpec`; `designPage()` also returns `out.breath`, the per-page **adoption read**) + the **radius pair** `radius_off_ladder`/`radius_unbound` (ladder read from the live `TK.declared().radii`, never from `CF.RAD`; `designPage()` returns `out.radius = {shapes, onLadder, bound, steps, off}`, and both skip `v <= 0` — see design-guide §5.1 "what the gate cannot see") + `ring_off_host` (a `ring·*` plate whose corner is not its host control's; `CF.ROLE.ring = 'host'`, repair `TK.roleSweep`). It judges **component masters** too: the skip is `isComponentCopyInstance()`, never `isComponentInstance()` — a main instance answers the latter `true`, so the old guard exempted every master in the file | run per board as built and per page at the end; gate **G13** blocks delivery |
| `scripts/repair_engines.js` | `fixStaleCenter` / `groupAssemblies` / `fixZOrder` / `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans` | run once to plant into storage, call page by page |
| `scripts/fix_layout.js` | flex-collapse repair (getDesignSize + absRow + fixCol, two-round convergence) | run directly on the target page |
| `scripts/token_engine.js` | Design Tokens (`TK.seed` build set + record token auto-active / `TK.apply` apply + readback verify / `TK.paint`·`TK.changed` theme-switch paint proof / `TK.audit`·`TK.assert` health check / `TK.unbindFill`) **plus the library typography styles** (`storage.TP`: `TP.seed` one `LibraryTypography` per declared ramp step, named exactly like its token, idempotent and readback-verified / `TP.audit` tokens ↔ styles diff / `TP.apply` apply-to-shape) **plus the two whole-file corner drivers** (`TK.radiusStart`/`TK.radiusSweep`/`TK.radiusPages` snap every drawn corner onto the live ladder and bind it; `TK.roleStart`/`TK.roleSweep`/`TK.rolePages` force the corner a family must carry — pill hosts to `CF.radius('control')` and every `ring·*` to its host — across masters **and** placed copies, then re-bind, because a raw `borderRadius` write clears the token binding) | record immediately after building skeleton; re-run health check before acceptance (gate **G9**); `TP.seed()` once per file **after** the ramp tokens exist — 素材 → 排版 lists `library.local.typographies`, which a token set never fills (capabilities §6, rule 30 `no_type_styles`) |
| `scripts/palette_engine.js` | Library colors (`LIB.seed` idempotent create+rename+set / `LIB.fill`·`LIB.stroke` ref-bound paint with readback / `LIB.audit` channel inventory via `shapesColors` / `LIB.replace` raw-hex swap) | the second re-skin channel (capabilities §7); independent of LY/CF/NL, so it can be seeded at any point |
| `scripts/foundations_engine.js` | **`storage.FN.*`** — the Foundations/Color-in-use boards **projected out of the library records**: `FN.setContent` (editorial content as data) / `FN.project({page,kind[,set]})` one board per call, stamped `nl:fn=<kind>` / `FN.bindNext({page})` bind+gate / `FN.check`·`FN.audit` / `FN.lanes`·`place`·`reflow`·`fitRoot`·`relayout` / `FN.source`·`tones`·`ratio`·`verdict` / the provenance read side `FN.CHAPTER`·`EXEMPT`·`boards`·`stampOf`·`kindsOn`·`foreign`·`chapterPages`·`coverage`·`restamp` | run LAST (it refuses without LY+CF+NL+TK); replaces hand-composed spec pages §7, and **is what makes gate G16 checkable**: `audit_design` rule 31 `not_projected` reads its stamp and `storage.designCoverage()` reads its chapter table (§7.1) |
| `scripts/prototype_engine.js` | Prototype + delivery (`PR.flow`/`ensureFlow`, `PR.nav`/`overlay`/`close`/`url`/`delay`, `PR.prototype(links,{flow})`, `PR.read`/`clear`, `PR.exports`/`bytes`, `PR.checkpoint`/`versions`/`restore`, `PR.ANIM` presets) | wire `14–16 · Screens` into a clickable flow before delivery (C6/C7/C9); its four rules P1–P4 (destination is a **shape**, interactions are append-only, animation fields complete, versions are verified not trusted) are in capabilities §8/§9 |
| `scripts/icon_engine.js` | Icons (`IC.seed` JSONL/`IC.add` any SVG / `IC.get`·`search`·`missing` / `IC.svg` color substitution / `IC.place` / `IC.grid`) | catalog `assets/icons/lucide.jsonl` (Lucide, ISC, 1966 icons); seed only the lines a page needs; channel choice + licenses in `references/icons.md` — in-control glyphs stay `CF.glyph` |
| `scripts/audit_layout.js` | positioning audit (`auditPage`/`auditAll`): **15 defect signatures + `text_centre_info`** (S1–S14 catalogue: containment, stale-center, size degradation, header, root stray, board/text overlap incl. S8b cross-parent, malformed, align, loose assembly, S12 stroke covered, S12b stroke clipped, S13 duplicate board) + font histogram, read-only | run on each board as built; recompute after finishing |
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
> `foundations_engine.js` (`FN`) is the exception in the other direction: it captures `LY`/`CF`/`NL`/`TK` **at seed
> time** and returns `{err:'load seed_storage + layout_engine + component_factory + native_layout + token_engine
> first'}`, so it is always loaded last and re-loaded last after a storage wipe.
>
> **Re-seeding is not exempt from the order.** `audit_design.js` and `FN` bind `const LY = storage.LY` in their closure,
> so re-seeding `layout_engine.js` alone leaves every consumer pointing at the *superseded object* — the new table is on
> `storage.LY` and the auditor never looks at it. Measured 2026-10-21: after a `LY.BREATH`-only edit, `designPage()` kept
> judging gaps against the previous ladder and reported 16px as off-ladder until `audit_design.js` was re-seeded *after*
> `layout_engine.js`. When you change a table one engine publishes, re-seed that engine **and everything downstream of it,
> in order**, then re-read the value through the consumer (`storage.designCFG()` / `out.ramp` / `out.breath`), not through
> `storage.LY` — the consumer's view is the one that produced the verdict.
>
> **Build iron rule**: G11 = regions come from `LY` (a typed coordinate is a defect); G12 = controls come from `CF`
> (a hand-built control is a defect and will also fail `name_invalid`); G16 = Foundations/Color boards come from `FN`
> (a typed row height or a `storage.T` hex mirror is a defect, see §7; **machine-checked** by rule 31 `not_projected` +
> `storage.designCoverage()`, see §7.1); G13 = `designGate` CLEAN before delivery.
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
// `token_engine.js` (TK) must be seeded before anything binds, and `foundations_engine.js` (FN) AFTER TK — it captures
// LY/CF/NL/TK at load time. Measured whole chain: 8 files / 277 KB in 69 ms, so re-seeding after a storage wipe is free.
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
- **componentize**: replace a redrawn control host **in place** with a real instance of the registered master (same parent, box, z; text overrides copied by text-layer name). Flow children are reported, never re-laid. Two guards are deliberate:
  - **size guard** — a factory's interior is absolute, so `instance.resize()` does not reflow it; a 200-wide copy swapped for a
    300-wide master leaves its field rect outside the host. Only a same-size copy (±2) is swapped; a different one is `misfit`.
  - **anatomy guard** — a copy can be the same size and still carry **more** than the master (a screen's pricing card with
    title + subtitle + seven feature rows vs the library's 2-text demo). The swap would keep the box and drop the copy's
    children. A copy with more descendants than the master is `anatomy`, never replaced; register a fuller master instead.
  - **Rebuild hazard**: rebuilding a screen can leave a *stale master* in the library (old anatomy, old name) while the
    new host is drawn again — run `componentize({apply:true})` after the rebuild and clear both `misfit` and `anatomy`
    before claiming the screen uses components. A component copy also **rejects structural edits** (appendChild throws
    "Cannot change the structure of a component copy"); text overrides and properties are allowed, which is why a master
    without a label/body slot cannot be given one on the screen — add the slot at the factory and re-register.

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

Factory lessons that cost a shipped screen each:

- **A Penpot text does not reflow a box.** A body paragraph handed to `createText` grows to its measured width; placing it
  in a 520-wide accordion renders one 732px line and the host crops it mid-sentence. Wrap first (`CF.wrap(text, w, fs)`),
  emit one text layer per line at `CF.lineH(fs)` and mark a deliberate ellipsis only when the reserved lines run out.
  The same rule applies to prose in `CF.card`, `CF.alert` and a `listBlock` meta line.
- **An idle OTP cell shows a caret, not a spinner.** The spinner arc on a 44px cell read as a broken ring over the border
  in export; loading is an explicit state (`o.loading`), not the default of the active cell. When it is loading, the 16px
  spinner is **centred** and replaces the caret — a 10px spinner in the cell's top-right corner reads as a trailing icon
  and sits on the active cell's 2px border (measured on `04 · Text fields`, `OTP·Spec`). The focus ring belongs to that
  same active cell (never box 1), and a `·Disabled` host suppresses the caret and accent border entirely.
- **Glyph aliases are one catalog.** `iconOf`/`CF.glyph` accept camelCase and kebab-case (`chevron-down` ↔ `chevronDown`);
  a new name that is not in `CF.glyphKinds` is a registration diff (`CF.missing()`), never a reason to draw a path inline.
- **A label is a slot.** `Checkbox`/`Radio`/`Switch` name the labelled composition `…·Label`; the bare master has no text
  child and a component copy refuses structural edits, so a screen cannot add a label to an unlabelled master. Register the
  labelled master or draw the label as a sibling composition — never append into a copy.
- **A composed card is a new composition, not a rerun of the demo.** When a screen needs a richer anatomy than the
  registered master (pricing card, FAQ accordion), give the host its own composition name (`Accordion·FAQ·Multi`) rather
  than drawing the master's name again; `not_component` is judged on the name, and `componentize`'s anatomy guard will
  refuse a swap that would drop children.

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
LY.fold(host, tier);                                          // 2px accent first-viewport marker
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

## 6. Re-pagination driver (chapter pages → block pages, contract: penpot-structure.md §2.3)

Re-splitting an existing file is a **migration**, not a rebuild: the boards already exist, the gates already pass, and
every destructive step costs a rebuild of a derived artifact. Write it as a small driver on `storage` (the Rayo file's
`storage.MIG` is the reference implementation) with exactly these steps, in this order:

| Step | What it does | Why it is where it is |
|---|---|---|
| `plan()` / `recall()` | derive the row table `{n, ch, block, d, t}` — `plan` from the old chapter pages, `recall` from the live `NN.MM · …` page names | `recall` is the only path that works **after** the old pages are gone; re-seeding an engine resets `rows`, so the driver must be re-runnable from the file itself |
| `scaffoldPages(rows)` | create `NN.MM · Chapter · Block` pages + PageRoot/Header/Footer (`scripts/scaffold_structure.js`) | it is a runner, not a planter: loading it executes, so load it only when you mean to build |
| `remap()` | point every queued build spec at its new page; **drop** specs that never shipped | migration preserves the delivered artifact — it must not silently add boards |
| `fast(k)` | build → `whenSettled` → de-duplicate same-name boards → `place` → `fixStaleCenter` → bind tokens | idempotent by construction: a spec whose board exists is skipped, so a call that hit the 30 s ceiling can simply be re-driven |
| `strays({apply})` | page-root hygiene: a stray whose name is already on the shelf is an interrupted rebuild's leftover → remove; a stray that is the real board → mount | this is what makes timeouts survivable instead of scary |
| `sweep(k)` | per-page repair chain (`groupAssemblies` → `fixStaleCenter` → rings → strays → guides → unclip) then **both** gates | one execution per page; the per-board audits of `R0.run` are what a 131-page migration cannot afford |
| `delOld()` | remove the chapter pages | **destructive and far-reaching**: masters die with the pages and every flow/interaction in the file is wiped (capabilities §8) |
| `mastersAll()` / `rebuildCover()` / `rebuildIndex()` / prototype re-author | re-register masters, then regenerate the derived boards, then re-wire flows | all four read the page list or the library, so they run **after** the structure is final |

Hard-won rules for this driver:

1. **Never trust a timed-out call's failure.** It usually completed. Re-drive idempotently and let `strays` clean up,
   rather than rebuilding again — the second rebuild is what produced stacked twins on the cover page.
2. **`instanceize` (copy → instance) must be guarded and dry-runnable.** `CF.instance(name, {resize})` moves the head but
   does not re-lay out its internals, so a wide screen row built from a narrow spec master keeps the master's columns —
   real damage. The guard: the head shape must resolve, the copy's box must match the master's (±2), and the text-slot
   counts must match; anything else is skipped with a reason.
3. **Fix in place by DFS index map before rebuilding.** When a repair must touch an instance's internals, walk the
   *sibling* copy for the authored offsets and apply the same deltas to the instance's children (`x`/`y`/`characters`
   are writable; `width` is not — api-pitfalls §14).
4. **Budget every loop to ~21 s** and return the remaining queue, so the client can call again. A loop that assumes it
   will finish is a loop that gets killed mid-page and leaves the file in a state only `strays` understands.
5. **A timeout can silently rob a board of its content pass.** The build is two-stage — `fast()` creates the frame, then
   `spec.build()`'s `after` hook draws the region plates (`build_l4.js` `anatomyBoard`, `build_l5.js` `recipeBoard`). If
   the call dies between the two, the bare frame is still in the tree, `strays` mounts it as the real board, the spec is
   already off the queue, and `MIG.fast` skips it forever because "board exists". Every geometric rule then passes on an
   empty frame — 39 blocks in the Rayo file were hollow this way and all 39 read CLEAN.
   Detect by **child count**, not geometry (that is rule 29, `empty_cell`: a `cell·slot·*` / `cell·recipe·*` with zero
   children). Repair by re-driving the **spec**, which still lives in `R0.l4.specs` / `R0.l5.specs`: `R0.requeue(spec)`
   sets `replace=true`, then `fast(1)`, then delete the same-name twin by **id** (name comparison is not enough — proxy
   identity never holds across `.children` accesses). Never "fix" a hollow block by hand-drawing plates: the plates come
   from `LY.rect`/`LY.drawStep`, and hand-drawn ones are the defect gate G11 exists to prevent.

## 7. Foundations projection (`storage.FN`) — the pages are output, not composed

`01 · Foundations` and `02 · Color in use` used to be the most expensive pages in the file, and not because there is
design in them: each board needed a hex list (a `storage.T` mirror), a caption per swatch, and **an array of row heights
typed by the caller** (`[56,136,40,40]`, `104 not 96 because swatch 48 + key 19 + hex 16 + 2×8 gaps`). Every one of those
numbers was a guess, `off_grid` / `off_scale_gap` / `paint_off_palette` rejected the guess, and each rejection cost a
full audit round-trip paid in model tokens. `FN` deletes both inputs:

| Removed input | What replaces it | What that means for the caller |
|---|---|---|
| **values** | `FN.source()` → `TK.declared()` (measured probe: 36 colours / 40 type steps / 10 spaces / 6 radii / 4 shadows / 10 dims) | there is no hex to type and no ramp to copy; a token kind the set does not declare is a **refusal** (`{err:'token set is missing …'}`), never a fallback literal, because a drawn value nothing can bind to is exactly what rules 19–24 report |
| **geometry** | every board is a **hug** column of hug rows, so its height is the sum Penpot computes (`padT + Σh + (n−1)·gap + padB`) | `FN.project` takes no height; there is nothing to get wrong, and `auditFlow`'s `hug_frozen` (§ native-layout.md) is the check that the sum still holds |
| **editorial copy** | `FN.prose` + `FN.setContent({usage, rules, notes, samples, seriesTones, strokeWidths})`, and **what a board consumed is stamped back into the file** (`nl:prose`) | what a board *says* is data; changing a sentence never means editing how the board is drawn. A fresh session that never called `FN.setContent` re-projects the same sentences (`FN.recoverProse`, §7.2) |
| **WCAG arithmetic** | `FN.ratio` / `FN.verdict` (relative luminance, AA / AA large / AAA) | the `Contrast matrix` cannot disagree with the palette, because it is computed from it |

**Call shape** (after G1; `FN` seeds last because it captures LY/CF/NL/TK at load time):

```js
storage.FN.setContent({ usage: { primary: '…' }, rules: { hover: '…' } });   // optional, per system
await storage.FN.project({ page: '01.03 · Foundations · Spacing', kind: 'spacing' });  // ONE kind per call
await storage.FN.bindNext({ page: '01.03 · …' });                            // repeat until {allBound:true}
await storage.FN.check('01.03 · …');                                         // both page gates + FN's own records
storage.FN.audit();                                                          // cost report: needsRepair must be []
```

`FN.KINDS` is the projectable set: `palette · typeRamp · spacing · radius · elevation · strokes · grid` (page 01) and
`semantic · stateLayers · contrast · dataColors` (page 02). `Icons` stays `IC.grid`/`CF.glyph` and `Light vs dark` stays
with the scheme boards (penpot-structure §2.2) — neither is a projection of one record type.

`FN.tones()` is where the triple naming contract is read: a tone exists only when `color.X` has both an ink and a wash
sibling, and **both spellings resolve** — `X-ink`/`X-wash`/`X-soft` (hyphen) and `XInk`/`XSoft`/`XWash` (the camelCase of
`design-guide.md` §4.1 and `CF.P`) — while a hue that merely ends in those letters (`color.pink`) never parses as a triple
(unit-tested in the connected build: `{primary: Soft/Ink, brand: -wash/-ink}`, and `inkOf('pink')` is `null`). The board's
own caption prints the suffixes the set actually declares, so 02 · Semantic roles documents the file rather than a template.
A set with no triple is a **refusal** (`{err: 'no colour token triple is declared: …'}`), never a fallback hex.

**Why exactly one board per call.** The plugin's `setTimeout(300)` answered in 0.479 / 0.799 / 0.825 / **12.457 s** inside
one session, so any settle-poll is a coin-flip against the 30 s ceiling — and **a call that times out is not cancelled**:
it keeps mutating the page while the next one queues behind it (that is how four boards and a stray ended up mis-shelved
during the probe). So `FN.project` does not sleep, poll, bind or gate; `FN.bindNext` binds exactly one board (the measured
`Spacing` board needed 36 s for its bind alone). Everything between the two is re-derived from the live page.

**The shelf is read, not remembered.** `FN.lanes(page)` walks the PageRoot's children and takes the two lane tops;
`FN.shelfStep` advances a lane by `round(h) + gap*2` **exactly** (rounding the next top up to a multiple of 8 widens the
measured gap to 33-39 px and `off_scale_gap` then fires *between* two FN boards — measured 36). Two consequences that the
stages are built around:

1. **A height is provisional inside the call that built it.** `Palette` returned `h=726` at project time and settled at
   **1052** on the next call (+62 for the head, +33 per swatch row), because a frozen hug only recomputes once the layout
   engine runs again. Shelving board *n+1* against 726 buries it under board *n*. Hence `FN.project` calls `FN.reflow`
   (re-shelve everything from live heights) **before** `FN.place`, and `FN.bindNext` reflows again and reports `grew`.
2. **A hug that never recomputed is a real render defect, not a stale read.** `row·head` shipped at `h=6` under two
   texts of 44 + 4 + 20 and the PNG proved the caption printed over the title. `FN.relayout(board)` — walk bottom-up,
   write any flex property (`cell.flex.topPadding = cell.flex.topPadding`) — repairs it in the same call. `FN.project`
   runs it after building, `FN.bindNext` after binding (binding writes fonts, and a font changes a text's height, which
   is precisely what freezes the parent).

`FN.fitRoot(page)` is the third derived number: root height = deepest child bottom + margin, snapped to 8 (the root is
an authored box, §1). Without it the layout audit reports every lower board as `out_of_bounds` (measured: four boards
escaping the scaffold-height root by 587-3763 px).

**Measured cost** (2026-10-21, a dedicated probe page, 11 boards, Web tier, one token set of 36 colours / 40 type steps):

| Stage | Cost | Note |
|---|---|---|
| `FN.project` (build + shelf) | ≈ 0.9 s + 0.16 s per board | 11 boards → 11 calls |
| `FN.bindNext` (bind + `relayout` + `reflow` + `auditFlow` + `designPage`) | 1.5–2.2 s typical · 4.4–6.3 s dense (`Palette` 42 batches, `Type ramp` 48) · **36 s** worst (`Spacing`, and that call still completed after its own timeout) | a re-run on an already-bound board is 4–46 ms, so `bindNext` is safe to poll |
| `TK.bindBoard(…, {dry:true})` | 37 ms | what `FN.check` uses to list `unbound` |
| settled heights | Radius 260 · Strokes 272 · Elevation 284 · Grid 372 · Data colors 455 · Spacing 492 · Semantic 693 · State layers 748 · Palette 1052 · Contrast 1338 · Type ramp 2657 | **0 of these were typed by anyone** |
| outcome | `FN.audit()` → `{projected: 11, gated: 11, needsRepair: [], flowBroken: []}`; `FN.check` → design CLEAN + layout CLEAN + `unbound: []` | **repair rounds: 0**, which is the whole point — the hand-composed path needed one audit round-trip per guessed height |

Two exports were eyeballed at the probe stage (`Palette`, `Semantic roles`) and both render correctly; every other board
is gated, not eyeballed, so claim them as audited rather than as visually verified. (Since then, `02 · Color in use` is
four-for-four exported and eyeballed — §7.2.)

**When a board you need is not a kind**: add the projector to `FN` (`FN.<kind>` + a `FN.KINDS` entry + the prose table),
never draw that board inside `execute_code`. A hand-composed Foundations/Color board re-introduces every defect class G16
removes, and cannot be re-projected when the palette changes.

### 7.1 How G16 is enforced (the projection is the only and default path)

Prose cannot block a build, so the contract is a **durable stamp in the file** plus two machine reads of it:

| Mechanism | What it proves |
|---|---|
| `FN.project` → `NL.stamp(board, {fn:<kind>, shelf:'1'})` (= `setPluginData('nl:fn', …)`) | this board was projected, by which kind. It lives **in the file**, so it survives a storage wipe and is readable by anyone who opens it — unlike `FN.records`, which is JS memory and dies with the session |
| `FN.CHAPTER` / `FN.EXEMPT` / `FN.stampOf` / `FN.boards` / `FN.foreign` | the single source of the contract: **which two chapters are projections** (`01` carries 7 kinds, `02` carries 4 — the same gate over both), which two boards (`Icons`, `Light vs dark`) may be composed, and what counts as proof |
| `audit_design.js` rule 31 `not_projected` | a board on a chapter page with no stamp. It **imports the table from FN** rather than keeping a copy, so auditor and engine cannot drift; and when `storage.FN` is not seeded it *reports* rather than passing — an unverifiable gate is a failed gate |
| `storage.designCoverage()` / `FN.coverage()` | the **file-level** half. Pagination is block-per-page (`01.09 · Foundations · Palette`), so a chapter lives on ~9 pages and "is `Palette` in this system at all" can only be answered across them. `missing` = a chapter kind never projected, `foreign` = a chapter board hand-drawn, `offChapter` = a projected board parked on the wrong chapter's page (reported, not blocking). Riding along in `designGate` whenever FN is seeded |
| `FN.check(page).g16` | `CLEAN` / `NEEDS_REPAIR` for that page, with the per-board `kind` + `stamped` readback |
| `FN.strays(page)` | boards sitting at the **page root beside `NN.MM-PageRoot`**. `FN.boards()` reads *inside* the PageRoot, so such a board was invisible to rule 31 and only another auditor's `root_stray` caught it (measured 2026-10-21). Strays count as `foreign` in both `FN.foreign` and `FN.coverage`, and are deliberately excluded from `restamp`/coverage so no placement accident can launder a hand-drawn board into a projection |
| `FN.restamp(page, {byName:true})` | backfills the stamp on boards a **pre-provenance FN** built. Name matching is opt-in `{byName}` precisely because it is not proof: the live file has a hand-drawn board titled `Palette`, and laundering it into `fn=palette` would be the one bug that makes this gate worthless. Default path = FN's own in-session records |
| `designPage({page:…})` **refuses**, `FN.check` settles first | both auditors read `penpot.currentPage`, and `openPage()` in the **same** `execute_code` call does not rebind it — measured: three requested pages, three identical `CLEAN` verdicts about the one page that happened to be open. A wrong-scope verdict is worse than none, so `designPage` returns `{err, want, verdict:'NEEDS_REPAIR'}` and `FN.check` opens, settles 700 ms, verifies `penpot.currentPage.name` and refuses on mismatch. Use `designStart`/`designNext` for a page walk |

Measured 2026-10-21, both directions, on the live file (FN 1.1.0; seeding `audit_design.js` 21 ms + `foundations_engine.js`
62 ms; the file holds 136 pages):

* **Passes**: the 11-board probe page restamped, then `FN.check('01.90 · Foundations · FN probe')` → `design CLEAN`,
  `layout CLEAN`, `g16 CLEAN`, `unbound []`, 11/11 stamped, 12.9 s; a component spec page (`03.01 · Actions · Button·Spec`)
  reads `CLEAN` with no `not_projected` — the rule does not reach outside its chapters.
* **Fires (inside the PageRoot)**: `designPage` on the two real pre-FN pages → `01.03 · Foundations · Spacing`
  `NEEDS_REPAIR`, 27 boards / 68 shapes, provenance `projected kinds here: none`, finding
  `1 further un-projected board(s) on this page: Spacing(864×736)`; same for `01.04 · Grid`.
* **Fires (page-root stray)**: a `mkAbsBoard` board mounted beside `99-PageRoot` — the class the first round missed —
  went from `FN.foreign() = []` to `[{name:'Negative control stray', 1920×240}]`, appeared in
  `designCoverage().foreign` as `01.90 · … · Negative control stray`, produced the page finding
  `99-PageRoot :: 1 further un-projected board(s) …`, and read `foreignNow: []` after the control was removed in the
  next call (the staging page is unchanged).
* **The real cost of the old mode, now visible**: `designCoverage()` on the Rayo file read `NEEDS_REPAIR` in 35 ms with
  15 chapter pages, 12 `foreign` boards (every `01.01`–`02.04` board, all built before FN existed), 4 chapter-`02` kinds
  `missing` and 4 `offChapter` (the staging page's 02 boards sit on an 01 page).
  That was the migration backlog, stated by a gate instead of by memory. **After the chapter-`02` migration (§7.2) the
  same read shows chapter `02` at 4/4 with `foreign []` and `missing []`, and the file still refuses `CLEAN` for the
  8 remaining hand-composed `01.xx` boards** — the gate moves the number, it does not move the verdict out of politeness.

A **second token set** is a projection argument, not a second builder: `FN.project({page, kind:'palette', set:'<system> ·
Dark'})` filters `FN.source()` to that set (colour records carry `set`), stamps `nl:set`, and shelves the dark twin beside
the light one — which is how `color-schemes.md`'s dual-polarity boards are made (one projection per set, never a hand-drawn
dark column).

### 7.2 What migrating `02 · Color in use` proved (FN 1.2 → 1.3)

Chapter 02 was migrated onto the same projector with **no second builder and no special case**: `FN.CHAPTER` already owned
its four kinds (`semantic · stateLayers · contrast · dataColors`), so "same as Foundations" meant calling the same three
stages on four pages. That is the test of the contract — a chapter that needed a different code path would not be a
projection. Four mechanisms came out of it, all now part of the default path:

* **`FN.use(page)` — the page-binding contract (1.2.0).** `setPluginData` and every token bind are **writes**, and
  `openPage()` does not rebind `penpot.currentPage` inside the same `execute_code` call. So `FN.project`, `FN.bindNext`,
  `FN.check` and `FN.restamp` each open the page, settle 700 ms, re-read `penpot.currentPage.name`, and **refuse** with
  `{err, want, wait}` on mismatch instead of stamping or reporting about whichever page happened to be open.
* **Editorial copy is durable (`nl:prose`, 1.2.0).** `FN.project` stamps the sentences a board actually consumed
  (`built.info.prose`) and re-reads them with `FN.recoverProse(page)` before building, so a fresh session that never called
  `FN.setContent` re-projects a board that still *says* what the file says. A projector that also **refuses a column header
  it has no sentence for** cannot silently ship an unnamed column. As of 1.3.0 every rule-drawing board stamps — `radius`,
  `stateLayers` and `dataColors` as well as `semantic`.
* **The state wash is a declared token, not `onDark` (1.3.0).** `CF.fills(…, {onDark:true})` shades with **black** because
  over a saturated brand fill a white 8% overlay lifts `#2563EB` to `#3F76ED` and drops the white label to 4.18:1 (§5.2).
  On a **neutral** inverse ground (`#161616`) that shade is a visual no-op, and the exported dark lane was seven identical
  black tiles. `FN.stateLayers` now passes `{overlay: FN.ink(ground)}` — the lane's own on-surface token — and derives the
  caption with `FN.over(base, tint, alpha)`. Two more rendering facts the same export proved: a content alpha must dim copy
  sitting on a **ground-coloured tile** (white at 38% on the light board ground is invisible, and `FN.cell` does not
  forward strokes, so the tile's hairline is set by hand), and **every** tile gets a hairline so a ground-coloured plate
  still reads against the board.
* **A rejected band aligns with an exported one.** The `contrast` matrix drew passing pairs in a fixed 480 `FN.cell` and
  rejected pairs in a fill row, so the ratio column jumped from x≈896 to x≈1560 — two tables pretending to be one. Both
  bands are cells of the same width now.

**Measured on the live file, 2026-10-21** (re-seeding `audit_design.js` 707 ms + `foundations_engine.js` 115 ms / 67,092 B;
`FN.project` ≈2.1 s, `FN.bindNext` 2.6–3.8 s per board, `designPage` 650 ms, `FN.check` 1.2 s; `02.03` project + bind +
check in one call 11.3 s):

| Board | Settled size | Gate |
|---|---|---|
| `02.01 · Semantic roles` | 1760×693 | usage column filled from DESIGN.md, `g16 CLEAN` |
| `02.02 · State layers` | 1760×748 | `designPage CLEAN`, `g16 CLEAN`, bind proof **13/13**, `grew 0` |
| `02.03 · Contrast matrix` | 1760×901 | 199 pairs measured / 12 exported / 6 rejected, proof **14/14** |
| `02.04 · Data colors` | 1760×455 | 6 series, `g16 CLEAN` |

All four were **exported and eyeballed**, so they are claimed as visually verified, not only gated. `designCoverage()`
reads chapter `02` as 4/4 covered with `foreign []` and `missing []`; the file verdict stays `NEEDS_REPAIR` because the
eight pre-FN `01.xx` boards are still hand-composed — that is the remaining backlog, reported by the gate rather than by
memory.

**One finding class the migration exposed about the auditor itself**: `audit_design.js` **stops walking at an instance
boundary** (`if (isInstance(s)) … return`), so the text/alpha rules cannot fire inside a componentized host. The negative
control for `disabled_wrong` therefore had to be run on a non-instance master (`Link·MD·Md·Disabled`): breaking its label
alpha produced `NEEDS_REPAIR`, restoring `.38` produced `CLEAN` — the rule is live, it just cannot see inside a copy.
The exemption test is also now the §4 **name grammar** (`inDisabledHost`: `disabled` as a `·`-segment of an ancestor host),
not a word search — the old word search was triggered by my own caption "Disabled recedes a…". See `api-pitfalls.md` §15.

