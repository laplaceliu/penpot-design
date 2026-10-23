# Engines and recipes (battle-tested)

Build and repair engine code is **all externalized to `scripts/`** (can be pasted and run independently); this article only keeps the mechanism, usage, templates, and page recipes.

| Script | Content | Usage |
|---|---|---|
| `scripts/seed_storage.js` | tokens `storage.T`, `mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`mkChip`/`ct`/`pg`/`sleep` | run first each session; re-seed after storage loss |
| `scripts/layout_engine.js` | **`storage.LY.*`** — the region math: `SPACE`/`ROWS`/`TIERS`, `snap`/`onScale`, `frame`/`container`/`grid`/`split`/`rows`/`flow`/`repeat`/`pack`, `viewportHeight`/`fold`, `recipe`/`plan`/`rect`/`keys`, `slots`, `drawStart`/`drawStep` | run right after seed; every coordinate on every page comes from it (gate **G11**) |
| `scripts/component_factory.js` | **`storage.CF.*`** — the variant-producing factories + `build`/`matrix`/`component`/`variants`, **components** `get`/`register`/`instance`/`swap`/`variantSet`/`svgIcon`, `P` palette, `STATE` alphas, `ladder`/`radius`/`fills`/`gradFill`/`gradOf`/`name`/`glyph`/`iconTile` (a graphic tile: material read from the profile, never from the factory), **the source-adaptation layer** `setReference`/`stampRef`/`hydrate`/`reference`/`profile(group,family,variant)`/`profiles`/`profStamp`(`nl:prof`)/`profOf`/`profDiff`/`PROFILE_ALIAS`/`variantKeys`/`profKeys`/`profKeyFor`/`measureProf`/`stampPass`, `minHit`/`tier`/`autoHit`, `map`/`missing` | run after LY; every control on every page is produced by it (gate **G12**). The registry is `CF.map()`; **`CF.missing()` must return `[]`** — that is the count to trust, not a number written in a doc. Application surfaces (`10`/`12`/`14–16`) reuse controls through `CF.instance(CF.name(...))` + `CF.swap` (instances, not re-drawn copies); `CF.button` enforces this at build time — on a non-`·Spec`/`Masters·` parent with an exact master it returns `CF.instance(...)` instead of a raw host (`asInstance:false` only for a negative control); a variant set needs `CF.variantSet(hosts, family, props)` with one `properties` object per host |
| `scripts/native_layout.js` | **`storage.NL.*`** — native flex/grid authoring: `frame`/`row`/`col`/`gridFrame`/`cell`, `mount`/`add`/`sizing`/`fill`/`fix`/`hug`/`alignSelf`/`margin`, `applyFlex` (whitelisted pad/gap/align vocabulary), `label`/`plate`/`line`, `guide`/`rulerGuide`, `stamp`/`readStamp`, `settle`/`whenSettled`/`report`/`auditFlow`/`nudge`/`reflow`/`fromRecipe` | run after CF; turns the LY region plan into **flow** boards so the file stays editable (`references/native-layout.md`). `fromRecipe` needs LY, `frame({shadow})` needs CF, both degrade instead of throwing |
| `scripts/elevation_engine.js` | **elevation / physicality** (`storage.EL`): recipes → multi-layer `shadow.<recipe>` tokens (`drop` + **`inner`**), role map, `apply`/`surface`/`sheenFor`/`sweepPage`/`bindStamped`/`audit`/`auditAll`, `nl:el` stamps. Gate **G18**; §9 below |
| `scripts/audit_design.js` | **design-rule lint** (`designPage`/`designStart`/`designNext`/`designAll`/`designGate`/`designCoverage`): 59 signatures — the G18 six `shadow_unbound`/`elevation_flat`/`edge_missing`/`sheen_missing`/`hover_flat`/`surface_missing`, — grid/scale/ramp/gap/measure/split/cap/touch/primary/row-height/radius/contrast/viewport/state-coverage/`variant_sparse`/`focus_ring_missing`/`disabled_wrong`/`name_invalid` + token-binding `paint_unbound`/`paint_off_palette`/`type_unbound`/`type_off_ramp`/`space_unbound`/`space_off_scale` + `no_guides`/`pane_filled`/`not_component`/`caption_stale`/`empty_cell`/`no_type_styles` + the G16 provenance rule `not_projected`, whose chapter/exemption table it imports from `storage.FN` + the reference-inventory rule `reference_drift` (pages 03–09: page 03 the source's action families and shape roles, pages 04–08 the forms/selection/data/navigation profile GROUPS — every host of a profiled family must carry the `nl:prof` stamp and match the profile's declared `expect` block, page 09 the feedback profile compared only on the keys it declares; profile via `CF.setReference` → `storage.REF` → `nl:ref` on every PageRoot; the variant is resolved from the HOST NAME (`CF.profKeyFor`), `sizes[<size>]` merges over `expect`, and the repair for a host that predates the profile is `CF.stampPass(root,{overwrite:true})`, which stamps only what the RENDER measures) + the arrangement rule `free_layout` (rule 59, design-guide §1.5 — on pages 01–09 a content board's elements are arranged ONLY as flow/grid children: rowGap/columnGap/padding (values judged by `space_off_scale`) or a grid cell; an absolutely-positioned non-overlay child fails, control-host interiors and page chrome are exempt; producer `CF.matrix`'s flow/grid path with token gaps and `CF.move` slot attachment) + the **whitespace trio** `cramped_gap`/`hierarchy_gap`/`text_cramped` (amounts from `LY.BREATH`, leading floor from the declared ramp, both published to the repairer as `storage.breathSpec`; `designPage()` also returns `out.breath`, the per-page **adoption read**) + the **radius pair** `radius_off_ladder`/`radius_unbound` (ladder read from the live `TK.declared().radii`, never from `CF.RAD`; `designPage()` returns `out.radius = {shapes, onLadder, bound, steps, off}`, and both skip `v <= 0` — see design-guide §5.1 "what the gate cannot see") + `ring_off_host` (a `ring·*` plate whose corner **or centre** is not its host control's; ownership tolerance 6px, concentric tolerance 1px, so a 4px drift no longer falls into the 'row ring with no plate' branch; `CF.ROLE.ring = 'host'`, repair `TK.roleSweep`/`TK.ringSweep`) + `label_off_axis` (rule 57 — a control label's text-box centre >2px off its host axis; a unitless `lineHeight` read as px landed every Button label 9px low) + `spec_unregistered` (rule 58 / G10s — a control host on a spec page 03–09 that is not a component, including Hover/Focus/Pressed/Disabled state cells; repair with `CF.autoRegister({states:true})` plus unique-name registration for duplicates) + **the gate-G17 trio** `not_assembled`/`placeholder_media`/`no_source_record` (rules 39/40/41, §8 — scoped by page name to `10`/`12`/`14–16` and judging NESTED leaf controls (shell composites/composer excluded), with the family index read **live** from `CF.map()` and the slot grammar from `CF.isMediaSlot`, so a `·Spec` chapter that shows a drawing is never judged by them) + `ring_detached` (rule 38 — a `ring·*` plate that is not **mounted inside** the control it outlines: its ancestry reaches the `·Spec`/PageRoot container without passing a control board, or it traces no plate at all. **§7 ink centring**: `CF.glyph` scales the 24-unit grid to the slot and then shifts by `CF.glyphBox` (`G_BOX`, each glyph's real ink bbox computed from the table at seed time), because the authored marks are not uniformly centred in their cell — `undo` ink centre is (8.5,9) of (12,12), `chart` (12,14), `bell` (11.35); centring the CELL handed that offset to every row (Button download +3px, Chip SM check +4px, Alert info −2px). `TK.axisStart`/`TK.axisSweep` repairs an existing file (dry first; it moves the `…·fill` + `…·line` parts of one mark TOGETHER, and only in a host with one mark and one label — measured on the dry run, name-grouping merged a Tree's five `folder` marks into a phantom dy −63.7). Rule 45 `row_axis_off` gates both the connector and the icon case. Judged by `TK.ringHost()` = enclosure + concentricity, **never** by a fixed margin; repair `TK.ringSweep`. See §"Ring mounting" below and design-guide §5.1) + **`focus_invisible` (rule 44, component-library §1.3)** — `CF.FOCUS` gives a focus state two legal forms: an atomic control draws a **painting** 2px boundary **tight on the focus unit** (`ctx.ring` now honours the box the factory passes; it used to overwrite it with host+2, which boxed whole compositions — measured 2026-10-22: 20/20 rings on `08 · Navigation` were host+2), and a *composition* (Steps / Menu / Anchor / Table row / Accordion header / Tree / Breadcrumb / ListItem / Transfer / MiniCalendar / Descriptions / CommandPalette) authors the same boundary at `strokeOpacity: 0` as a **slot** and paints the unit's 12% brand `wash·focus` instead. Rule 16 `focus_ring_missing` now counts only a layer that **paints** (`focusEvidence`: ring alpha ≥ .05, or a visible `wash·focus`/`row·focus`/`node·focus`…/≥2px border), and rule 44 fails a ghost boundary whose control carries no visible focus layer — the pairing is what makes a hidden border legal instead of an invisible focus state. + **`row_axis_off` (rule 45, design-guide §2.3)** — a horizontal connector (`tail·*`/`rail·*`) must join the CENTRES of the nodes it runs between; a node anchored to the band's top slips out of its own line whenever it is smaller than the copy beside it (measured: `Steps·Dot·LG` node centres 6 vs connector/label 10). Repair: `CF.steps` centres `nyNode`; `TK.hostFit` grows a rebuilt host to its own copy (chrome `ring·`/`hitpad·`/`wash·` and `clip·` crops are never fitted — fitting `clip·half` widens a half star back to a full one). It judges **component masters** too: the skip is `isComponentCopyInstance()`, never `isComponentInstance()` — a main instance answers the latter `true`, so the old guard exempted every master in the file. + **`list_gap_split` (rule 49, design-guide §2.1)** — repeated row labels inside one host must share ONE pitch: the tightest gap must **repeat**, and a wider gap with nothing drawn in it is a hole. Two measurement disciplines are load-bearing and were both learned the hard way: copy is read **one level deep** (a hovered/selected row's label is inside its `row·` group after `storage.groupAssemblies`, so a direct-children read reported a 4-row menu as 3 rows and a 2-gap host as an unjudgable one), and a host with **no repeating pitch is not judged** (an Accordion's header→body / body→header gaps are three different relationships — the first version of the rule indicted all 5 Accordion hosts on `06 · Data & lists`). Repair: `TK.gapStart`/`TK.gapSweep` (dry first) → `TK.gapFlatten`, which moves **whole row units** (never a flattened child, or a grouped row moves twice), takes the same amount off the host, and calls `TK.centreOnRow` so the host keeps its place on the `CF.matrix` row midline — measured: closing 12px inside 12 Menu hosts slid each cell 6px off its row label | run per board as built and per page at the end; gate **G13** blocks delivery |
| `scripts/repair_engines.js` | `fixStaleCenter` / `groupAssemblies` / `fixZOrder` / `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans` | run once to plant into storage, call page by page |
| `scripts/fix_layout.js` | flex-collapse repair (getDesignSize + absRow + fixCol, two-round convergence) | run directly on the target page |
| `scripts/token_engine.js` | Design Tokens (`TK.seed` build set + record token auto-active / `TK.apply` apply + readback verify / `TK.paint`·`TK.changed` theme-switch paint proof / `TK.audit`·`TK.assert` health check / `TK.unbindFill`) **plus the library typography styles** (`storage.TP`: `TP.seed` one `LibraryTypography` per declared ramp step, named exactly like its token, idempotent and readback-verified / `TP.audit` tokens ↔ styles diff / `TP.apply` apply-to-shape) **plus the two whole-file corner drivers** (`TK.radiusStart`/`TK.radiusSweep`/`TK.radiusPages` snap every drawn corner onto the live ladder and bind it; `TK.roleStart`/`TK.roleSweep`/`TK.rolePages` force the corner a family must carry — pill hosts to `CF.radius('control')` and every `ring·*` to its host — across masters **and** placed copies, then re-bind, because a raw `borderRadius` write clears the token binding) **plus the ring-mount driver** (`TK.ringStart`/`TK.ringSweep`/`TK.ringPages` — the census and idempotent repair for rule 38: `TK.ringHost(shape)` resolves the plate a `ring·*` outlines by enclosure + concentricity, `ringSweep` re-mounts and resizes a drifted ring onto its owner with the *measured* per-axis margin and copies the host corner, then re-binds `radius` per page; it is the single resolver shared by the repairer **and** `audit_design.js`, so the gate and the fix cannot disagree) **plus the §1.3 focus driver** (`TK.focusStart`/`TK.focusSweep`/`TK.focusPages` — moves every `·Focus` host onto the new focus expression: classify by `CF.focusRole` + whether its `ring·*` paints + whether a visible wash exists, then REBUILD the host from `storage.SPECS` rows and accept it only when the name and size reproduce the old board (±2px), so a probe that does not match is removed and the host is reported `unresolved` instead of silently resized. Library masters and placed copies are counted and skipped (rebuilding a master would orphan its copies); the pass is resumable — the page goes back on the queue when `maxHosts`/`budget` runs out, and `TK.focusPages()` is the per-page census. **`TK.gapStart`/`TK.gapSweep` + `TK.gapFlatten`** close an empty wider gap in a list host (rule 49) and **`TK.centreOnRow`** keeps the shrunk host on the `CF.matrix` row midline; **`TK.hostFit`** grows a host that its own copy overflows) | run after any change to `ctx.ring`/`CF.FOCUS`/`CF.menu`, dry first | record immediately after building skeleton; re-run health check before acceptance (gate **G9**); `TP.seed()` once per file **after** the ramp tokens exist — 素材 → 排版 lists `library.local.typographies`, which a token set never fills (capabilities §6, rule 30 `no_type_styles`) |
| `scripts/palette_engine.js` | Library colors (`LIB.seed` idempotent create+rename+set / `LIB.fill`·`LIB.stroke` ref-bound paint with readback / `LIB.audit` channel inventory via `shapesColors` / `LIB.replace` raw-hex swap) | the second re-skin channel (capabilities §7); independent of LY/CF/NL, so it can be seeded at any point |
| `scripts/foundations_engine.js` | **`storage.FN.*`** — the Foundations/Color-in-use boards **projected out of the library records**: `FN.setContent` (editorial content as data) / `FN.project({page,kind[,set]})` one board per call, stamped `nl:fn=<kind>` / `FN.bindNext({page})` bind+gate / `FN.check`·`FN.audit` / `FN.lanes`·`place`·`reflow`·`fitRoot`·`relayout` / `FN.source`·`tones`·`ratio`·`verdict` / the provenance read side `FN.CHAPTER`·`EXEMPT`·`boards`·`stampOf`·`kindsOn`·`foreign`·`chapterPages`·`coverage`·`restamp` | run LAST (it refuses without LY+CF+NL+TK); replaces hand-composed spec pages §7, and **is what makes gate G16 checkable**: `audit_design` rule 31 `not_projected` reads its stamp and `storage.designCoverage()` reads its chapter table (§7.1) |
| `scripts/prototype_engine.js` | Prototype + delivery (`PR.flow`/`ensureFlow`, `PR.nav`/`overlay`/`close`/`url`/`delay`, `PR.prototype(links,{flow})`, `PR.read`/`clear`, `PR.exports`/`bytes`, `PR.checkpoint`/`versions`/`restore`, `PR.ANIM` presets) | wire `14–16 · Screens` into a clickable flow before delivery (C6/C7/C9); its four rules P1–P4 (destination is a **shape**, interactions are append-only, animation fields complete, versions are verified not trusted) are in capabilities §8/§9 |
| `scripts/icon_engine.js` | Icons (`IC.seed` JSONL/`IC.add` any SVG / `IC.get`·`search`·`missing` / `IC.svg` color substitution / `IC.place` / `IC.grid`) | catalog `assets/icons/lucide.jsonl` (Lucide, ISC, 1966 icons); seed only the lines a page needs; channel choice + licenses in `references/icons.md` — in-control glyphs stay `CF.glyph` |
| `scripts/media_engine.js` | **`storage.MD.*`** — the raster channel: `MD.config({server})` / `bytes(path)` / `import({path[,name]})` / `fill(shape, media)` / `place({parent, slot, path[, x,y,w,h, radius, mode]})` / **`refit({dry})` (M8: mask every stretched image in the CURRENT page)** / `distortion(w,h,media)` / `maskAround(shape,media)` / `audit` / `recover()` / `isSlot(name)` / `report` — **M8: an image never stretches.** `fillFitMode` is not writable in this build (accepted, then dropped by the readback), so `MD.place` picks the geometry: ratios agree → fill the box; disagree → `cover` (a `clip·` mask at the slot + the media inside at its own ratio, scaled to cover, centred) or `fit` (the shape takes the asset's ratio). `mode:'stretch'` is the only opt-in, and `MD.place` refuses to return an image still >2% off its asset | run after `token_engine`; a source image becomes a **real Penpot media object** painted with `fillImage` (M1–M7 in the file header and capabilities §9.1). Needs the **project-rooted** server (`serve_skill.py --root <project> --port 8779`) because `uploadMediaUrl` cannot reach loopback (M3) — the skill server on 8777 only serves `scripts/` (§8.1) |
| `scripts/screen_engine.js` | **`storage.SC.*`** — the record-driven screen assembler: `record(screen, spec)` (validates → `gaps`) / `build({page, screen[, sections, rebuild, x0, y0, h]})` → census / `ctl`·`copy`·`media`·`icon` (the four channels) / `master`·`familyIndex`·`libIndex`·`isControlName` / `pageRoot`·`nextSlot`·`find`·`scope`·`digest` / `audit`·`auditStart`·`auditNext` / `coverage` / `reconcile({dry}`|`{apply:'register'})` / `report` | run after `MD`; **the only screen path on a recreation** (gate **G17**, §8): places library **instances**, carries the type style, fills raster slots from the source, binds tokens, and stamps `nl:sc`/`nl:rec` so rules 39/40/41 and `SC.coverage()` can re-read the contract from the file |
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
> `media_engine.js` (`MD`) + `screen_engine.js` (`SC`) join the order **before the auditors** whenever the task is a
> recreation (gate **G17**, §8): `SC` refuses without `LY`+`CF`+`NL` and reads `MD`/`TK`/`TP` at call time, and it must be
> seeded *before* `audit_design.js` runs on a `14–16` page — rule 41's page-scope half reports a Screens page where `SC`
> is absent rather than passing it (`penpot-capabilities.md` §9.1 for the media rules, `api-pitfalls.md` §18 for the traps).
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

⚠️ **The path hangs off whichever root owns port 8777.** `serve_skill.py` serves *its own skill directory* (`ROOT =
dirname(dirname(__file__))`), so its URLs are `http://127.0.0.1:8777/scripts/<f>`. Measured 2026-10-22: that fetch
returned **404** here, because an ad-hoc repo-root CORS server already held 8777 and the skill's own instance was
silently not bound — from a repo root the same file is `/skills/penpot-design/scripts/<f>`. Before seeding, settle it
in one call instead of guessing both forms: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8777/ping.txt`
proves a server is up, `ss -ltnp | grep 8777` + `readlink /proc/<pid>/cwd` tells you which root it serves.

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

### Ring mounting (`TK.ringHost` / `TK.ringSweep`) — rule 38 `ring_detached`

A `ring·*` plate is an *outline of something*, so its position is a relation, not a coordinate. Measured 2026-10-22 over
the 231 rings of pages 03–16, the relations are:

- **The ring encloses a real plate** with margin `0…12` on both axes — 2 for 176 of them, but 5/6/7/9/10 for other
  families and **0** for an inline-link or breadcrumb ring, where the ring is the text's own box. A link ring is even
  non-uniform (≈1.5 horizontal / 3 vertical). **A fixed ±2 margin test is therefore a fallacy**: it flagged 47 rings,
  then 25, none of them defects.
- **The ring is concentric with that plate** (centre Δ ≤ `tol`, default **3**). Concentricity is the invariant; the
  margin is not judged at all.
- **The owner is usually a nested plate, not the control board**: an addon field's `field` rect, a Checkbox `box`
  (18×18), a Slider `handle`/`state·layer` (20×20 / 40×40), one OTP digit, one crumb `Text` run. Plain anatomy names
  carry no `·`, so an owner filter that requires `·` rejects all of them.
- **A row band may have no plate** (Tree / Accordion / anchor-rail rows are drawn flat: `Text` + glyphs only). Those 3
  rings are legitimate and pass by **containment**: the ring sits inside the control expanded by the max margin, with
  the ring centre inside the control.

The structural defect signature is a ring whose ancestry reaches the `·Spec`/PageRoot container **without passing a
control board** — `ctx.ring` always mounts inside the control (one level up only around a `clip·`), so a board-level
ring is a stale outline left behind by a refit. `TK.ringHost(shape)` resolves it in that order (control ancestor ≤4 up →
deep subtree scan for concentric + enclosing, innermost wins → expanded containment → page-wide size match) and returns
`{host, control, concentric, floating, contained, ox, oy, kind}` — the same object the auditor reads, so the gate and
the repair cannot disagree.

```js
const TK = storage.TK;
TK.ringStart(null);                                  // queue every page (pass names to scope it); an empty queue auto-starts
await TK.ringSweep({ dry: true });                    // census: {total:{rings, ok, drift, floating, rowRing, unresolved…}}
await TK.ringSweep({ budget: 16000, settle: 800 });   // apply: re-mount + resize per measured ox/oy, copy host corner,
                                                      // then TK.bindPage(n,{only:'radius'}) — a geometry write clears it
TK.ringPages();                                       // AFTER a pass: per-page table of drift/unresolved/floating/corners
```

Idempotent: the first apply pass took `drift 7, reparented 7, refit 7, corners 1` and the re-read returned
`41/41 ok, drift 0`. Negative control: nudging one repaired ring +24px makes `designPage()` return
`NEEDS_REPAIR {ring_detached:1}`, and restoring it returns `CLEAN`.

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

> **[Gate G17] When the user supplied source material (a URL, screenshots, a library tree → `仿写`/`复刻`), this section is
> not the entry point — §8 is.** `SC.record(…)` → `SC.build(…)` performs the calls below *and* places library instances,
> binds paint, carries the type style, fills the raster slots with the user's own assets and stamps the record into the board.
> What follows stays valid for what `SC` cannot know: the two-pass `totalH` measurement, the tier refusal semantics, and the
> three leftovers in the list at the end. Building a screen or app-shell surface by hand on a recreation now produces `not_assembled` (39),
> `placeholder_media` (40) and `no_source_record` (41) findings on every page, so it is not a shorter route — it is a reroute.

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
   `audit_layout.js` (`auditPage`), plus the engines that carry their own state and work at any point once their
   shapes exist: `token_engine.js` (`TK`), `palette_engine.js` (`LIB`), `prototype_engine.js` (`PR`),
   **`media_engine.js` (`MD`) and `screen_engine.js` (`SC`)** — one command probes and
   supplements what is missing. Storage loss also wipes `NL._reg` (the build-time declarations) — without it `auditFlow`
   loses its `sizing_dropped`/`size_stale`/`not_settled` precision — so re-stamp with `NL.stamp` and prefer
   `whenSettled` over remembered sleeps;
   **Storage loss does NOT wipe the screen records** (§8): `SC.records` is session state, but every built screen still
   carries `nl:sc` + `nl:rec` in its own pluginData, so `SC.coverage()` re-derives the contract from the file, `MD.recover()`
   rebuilds the media cache by scanning shapes for `fillImage`, and `SC.build({screen, sections:[…]})` **mounts into the
   existing board** instead of creating a second one. A recreation therefore survives a crash without this conversation;
   a freehand screen does not, which is what rule 41 is for.
2. `penpotUtils.getPages()` inventory page structure (measured working — returns the page objects; the alternative is
   `penpot.currentFile.pages`; **there is no `penpot.pages`**, capabilities §10), confirm canvas damage (100×100
   degradation check in api-pitfalls.md §8);
3. re-collect all board ids (old ids invalid);
4. when the user reports "some component missing", prioritize suspecting: component deletion taking the main instance along, timeout landing on wrong page causing mis-delete, crash degradation — investigate one by one per api-pitfalls.md §6/§11/§8.

## 6. Re-pagination driver (chapter pages → block pages, contract: penpot-structure.md §2.3)

Re-splitting an existing file is a **migration**, not a rebuild: the boards already exist, the gates already pass, and
every destructive step costs a rebuild of a derived artifact. Write it as a small driver on `storage` (the reference
implementation is `storage.MIG`) with exactly these steps, in this order:

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
   empty frame — 39 blocks in a live file were hollow this way and all 39 read CLEAN.
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
* **The real cost of the old mode, now visible**: `designCoverage()` on a live file read `NEEDS_REPAIR` in 35 ms with
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


## 8. Recreation: a screen assembled from the system (`storage.SC`) + the raster channel (`storage.MD`) — gate **G17**

When the user hands over source material — a URL, screenshots, an existing library tree — and asks to **imitate / recreate**
it (仿写 / 复刻), the screen pages are where the answer either respects the design system or quietly abandons it. `CF` **draws**
a control, which is exactly right on a `·Spec` board (that drawing is what gets registered) and exactly wrong on a screen:
the drawing becomes a disposable copy that cannot be fixed centrally, has no variants, cannot be swapped, and carries no
relation to the library the same file just built. Measured on a live file before `SC` existed (2026-10-22): pages `14/15`
held **99 + 60 control-named hosts, 0 of them instances of what they imitated**, and every raster slot on all three screen
pages was a gray plate with an `image` glyph — **`mediaFills: 0`**, i.e. the user's photographs were not in the file at all.

`SC` is the path that makes the requirement satisfiable instead of aspirational, and `MD` is the channel it needed for raster.

### 8.1 Seed order and the two loopback servers

`SC`/`MD` are fetched like the other engines (`new Function('storage','penpot','penpotUtils', src)`), after `TK`:

```
seed_storage → layout_engine → component_factory → native_layout → token_engine
  → media_engine (MD) → screen_engine (SC) → audit_layout → audit_design → foundations_engine
```

Two servers, two roots — conflating them is the first thing that fails:

| Server | Root | Used for |
|---|---|---|
| `python3 scripts/serve_skill.py` → `:8777` | the **skill** directory | fetching `scripts/*.js` (`http://127.0.0.1:8777/skills/penpot-design/scripts/screen_engine.js`) |
| `serve_skill.py --root <project> --port 8779` → `:8779` | the **project** directory | raster bytes for the user's assets, through the `/b64/<path>` route (`MD.config({server})`, `SC.config({server})`) |

`uploadMediaUrl` cannot use either (M3: the fetch runs in the Penpot container, which has no route to this machine's
loopback), so binary always travels as base64 → `atob` → `Uint8Array` → `uploadMediaData`.

### 8.2 The record, then the build

```js
SC.config({ server: 'http://127.0.0.1:8779' });
SC.record('contact', {
  src: 'https://example.com/contact', tier: 'web', recipe: 'contact',
  sections: [{ region: 'form',
    controls: [{ family: 'input', type: 'outlined', size: 'md', place: { x: 0, y: 0 } }],
    copy:     [{ text: 'Tell us about the project', size: 32, weight: 700, role: 'headline' }],
    media:    [{ slot: 'cover', path: 'assets/img/cover.webp' }],
    icons:    [{ kind: 'mail' }] }]
});
const census = await SC.build({ page: '15 · Screens · content', screen: 'contact' });
```

`SC.record` **validates while you declare** and returns `gaps` before a single shape exists: a recipe outside `LY.keys()`, a
control whose master does not exist (`tried:` lists every name it looked for), a media slot with no `path`, copy with no text.
`SC.build` then assembles it through four channels, each of which has exactly one legal call:

| Channel | Call | Guarantee |
|---|---|---|
| structure | `NL.fromRecipe(recipe,{tier,parent})` | regions named `region·*`, gaps from `LY.BREATH`, panes detected geometrically and **never filled with copy** |
| control | `SC.ctl` → `CF.instance` | an **instance**; a missing master is a `missing_master` gap (fix: grow the factory per G12, then `CF.autoRegister`), never a re-draw |
| copy | `SC.copy` → `mkText` + `TP.apply` | snapped to a declared ramp step *and* carrying the library typography style (a token with no style is unpickable in the 素材 panel) |
| raster | `SC.media` → `MD.place` | the user's own bytes as a `fillImage` media object |

Then, in the same call: `NL.stamp(board, {sc,src,recipe,tier,assembled:'1'})` + `setPluginData('nl:rec', digest)` (**S6**, the
proof is durable — `SC.coverage()` re-reads the contract from the board in a session that never called `SC.record`),
native column guides on the board **and on every child band at the tier width** (`no_guides` binds both),
`TK.bindBoard(board)` **after** the writes (**S5**: a geometry write drops a binding — measured for radius and for rings), and
`NL.whenSettled()`.

Rules **S1–S8** are in the file header; the three that decide the shape of a session are **S7** (idempotent by stamp: the
first call creates the board, later calls *mount into it* — `mode:'mount'` — so a retry never duplicates a screen and nothing
is created and then deleted; only `{rebuild:true}` re-creates), **S8** (the 30 s ceiling is planned for: `SC.build({sections:[…]})`,
and `census.sectionsLeft` is read off the board — a region with no children is a section still owed), and **S1** (instance-first,
with `missing_master` reported rather than worked around).

### 8.3 A screen mounts INSIDE `NN-PageRoot`

`designPage()` walks from the page head, so a screen board placed at **page root** is invisible to the design gate *and* is
indicted by `audit_layout.root_stray`. Measured 2026-10-22: a 31-shape screen at page root audited `shapes: 201` and read
**CLEAN** — the falsest verdict this file has produced, and the reason the first proof screen looked finished. `SC.pageRoot()`
finds `NN-PageRoot`, `SC.nextSlot()` packs the new board below the existing content by one page breath, and rule 41 only
judges **top-level** content boards so that it counts screens instead of counting their full-bleed bands.

### 8.4 The reads the gate shares

| Read | Answers |
|---|---|
| `SC.audit()` / `auditStart(prefixes)` + `auditNext()` | this page as a screen: `stamped`, `instances`, `drawnHosts`, `slots`/`filled`/`placeholders`, `copy`/`copyBound`, `paint`/`paintBound`, empty regions, `verdict` `ASSEMBLED`/`NOT_ASSEMBLED` |
| `SC.coverage()` | **record**-side: every declared entry re-read from `nl:rec` — `notInLibrary`, `mediaWithoutSource`, `emptyRegions`, `digest:'yes'`, verdict `COMPLETE`/`INCOMPLETE`/`NO SCREENS` |
| `SC.reconcile({dry})` → `({apply:'register', limit})` | the retro-apply path for a legacy file: census the drawn hosts per page, then promote them with `CF.autoRegister` over `SC.scope()`. **Additive** — deleting a host and re-placing an instance is a destructive write and is deliberately not the default |
| `SC.master` / `SC.libIndex` / `SC.familyIndex` / `SC.find` / `SC.digest` / `SC.report` | the lookups the above are built from (`libIndex` is case-insensitive because the factory map is camelCase while a name head keeps the authored case: `otp` vs `OTP·Block·Md`) |

`MD` on its side is `MD.config/import/place/fill/get/find/recover/audit` and obeys the seven measured media rules
**M1–M7** (`penpot-capabilities.md` §9.1: three-arg `uploadMediaData`, whole-media-object fills, no media registry to read,
proof = `export_shape` `mode:'fill'|'shape'`). The slot grammar has **one** source — `CF.isMediaSlot` — which `MD.isSlot`
and auditor rule 40 both call, so a plate cannot be a slot for the gate and invisible to the engine.

### 8.5 Proof, census, and what G17 does not prove

Negative control, measured 2026-10-22 on the live file: one drawn `Card·Horizontal·Lg` plus one unfilled `img·hero` plate
produced **exactly** `not_assembled: 1` + `placeholder_media: 1` on a screen page and **zero** G17 findings on
`17 · Reference imitation` (`designPage` there reads `CLEAN`, 221 shapes). `CF.autoRegister` then cleared `not_assembled`
without tripping rule 27 on the host it registered, and `MD.place` cleared `placeholder_media` on the readback of
`fillImage`. The finished proof screen read `SC.audit()` → **ASSEMBLED**: 7 instances, 0 drawn hosts, 2/2 media filled,
95/95 copy bound, 135/135 paint bound — with **2 empty FAQ regions reported, not hidden**.

The debt the gate now blocks, page by page (`designNext`, same day):

| Page | screens | `no_source_record` | `not_assembled` | `placeholder_media` | verdict |
|---|---|---|---|---|---|
| `14 · Screens · app` | 12 | 12 | 51 | 19 | NEEDS_REPAIR |
| `15 · Screens · content` | 16 | 16 | 49 | 27 | NEEDS_REPAIR |
| `16 · Screens · mobile` | 2 | 2 | 0 | 0 | NEEDS_REPAIR |

(Read `no_source_record` as *one per screen board*: all 30 were composed before records existed. The pages are otherwise
well bound — `SC.audit` measures 327/327 and 326/326 copy styles bound, 520/532 and 502/521 paints bound — so this is
**assembly** debt, not token debt. `SC.audit`'s `drawnHosts` (99 / 60) counts every control-named host; rule 39 indicts the
51 / 49 of them that have **no** master, so the two numbers are different questions, not a discrepancy.)

**G17 proves assembly, not fidelity.** It cannot see that the copy is wrong, that a hero crop is off, or that the source had
four testimonials and the board has three. The PIL diff against the source (`verification.md`, `scripts/pixel_diff.py`) stays
the acceptance step for a recreated screen, and a board that was never exported is never described as verified.

## 9. Elevation: the physical channel (`storage.EL`) — gate **G18**

### 9.1 Why it exists (the measured failure)

2026-10-23, on the the reference recreation: **3020 shapes, 49 with a shadow, every one single-layer, 0 inner, 0 token-bound,
0 on the screen page**. Every other auditor read CLEAN. In the same session a Penpot probe proved the renderer supports
2 drop + 2 inner layers, a multi-layer shadow token, and a radial gradient — so the gap was not Penpot, it was that the
skill had **no elevation channel**: `CF.shadow(level)` used its own generic one-layer `ELEV`, `TK.seed` had been fed only
the three drop tokens, screens had no plates to cast anything, and none of the 49 rules the gate had at the time measured material.

### 9.2 The contract

```
DESIGN.md  elevation: { <recipe>:{drop:[…], inner:[…], sheen:{…}}, roles:{Family:{base,hover,pressed,types}} }
                    ↓
EL.seed({set, recipes, roles})       one `shadow.<recipe>` token each; layer count verified on readback
                    ↓
EL.apply(shape, recipe)              shadows + token binding + durable `nl:el=<recipe>` stamp
EL.surface(parent,{role,fill,radius})  `surface·<region>` plate, behind content, token fill, elevation, sheen
EL.sheenFor(host, recipe)            `sheen·*` radial plate (a fill is solid OR gradient — never both)
EL.sweepPage({page, apply})          family/state repair: Button/Card/FAB/Accordion/Chip/Badge/Tooltip/Toast
EL.bindStamped(root)                 one-shape-at-a-time shadow token binding (batch apply bound 0/4)
// a REPAIR that resized a plate must also re-run TK.bindBoard(board) first: fill/radius bindings can drop
EL.audit()/auditAll()                shadowed / inner / stamped / bound / unbound / sheen / flat
```

`CF.shadow` delegates to `EL` when seeded; `CF.elevate(host, family)` is called at the end of `button`, `iconButton`,
`fab` and `card`, so a newly built control carries the design's stack instead of the generic one. `SC.record` sections
accept `surface`/`elevation`/`radius`; `SC.build` mounts the plate **before** the section's controls/copy and calls
`EL.bindStamped` in its birth pass.

### 9.3 Rules and where they bite

- **A name has a role, and the role has states.** `EL.roleFor` parses `Family·Type·Size·State`; a **size** segment is not
  a type (`Button·MD` = default type), a case-mismatched family still resolves (`FAB` → `Fab`), `Focus`/`Selected`/
  `Disabled` are neutral states that keep the base stack, `Hover`/`Pressed` take their recipe. Each of these was a
  measured skip (the screen's secondary CTA and 15 FAB cells shipped flat).
- **Repair by stamp, not by name after the first pass.** `sweepPage` writes `nl:el`; `bindStamped` reads the stamp, so
  a later session can re-bind without re-deriving the family.
- **Surfaces are rectangles, not boards.** They sit behind copy and cast a shadow; a text card does not clip. Their
  canonical name is `surface·<record region>` (strip the structural `region·` prefix) so `surface_missing` and
  `SC.coverage` can find the plate the record promised.
- **Sheen is exempt on copies.** A component copy cannot be authored; its master carries the sheen (measured: master →
  copy propagation worked for children). Rule 53 skips copies for this reason.
- **The positioning audit must know the new layers.** `surface·`/`sheen·` joined `audit_layout`'s `OVER` regex; without
  it every card's floor was indicted as a `header_collision`.
- **What G18 cannot see.** It proves the stack/inset/sheen/plate exist and are bound — not that the recipe matches the
  source, and not that a hover is reachable at runtime (Penpot has no switch-variant-on-hover action). Export and the PIL
  diff remain the fidelity proof.

### 9.4 The repair that proved it (the reference, 2026-10-23)

| Read | Before | After |
|---|---|---|
| shapes with a shadow | 49 | **140** |
| with an inner layer | 0 | **96** |
| token-bound | 0 | **140** |
| sheen plates | 0 | **55** |
| shadow tokens | 3 (1 layer each) | **18** (1–8 layers) |
| `15 · Screens` shadows | **0** | **20** (20 inner, 20 bound, 5 sheen) |
| `EL.audit` | — | unbound 0, flat 0 |

Hover cells: `Button·Primary·MD` = 4 layers → `·Hover` = **8**; default Card = 4 (e2+inset) → hover = 4 (e3+inset).
`SC.audit` → ASSEMBLED (53/53 copy bound), `SC.coverage` → COMPLETE (no missing surfaces), `designPage`/`auditPage` →
CLEAN on page 15. The five exported proofs (service card, nav pill, hover button, card hover, toast) were inspected;
the flat regions before the repair had nothing to cast a shadow at all.
