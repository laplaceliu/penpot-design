// audit_design.js — the design-rule lint for gate G13. **Read-only: it changes no shape.**
//
// WHY THIS FILE EXISTS: references/design-guide.md §11 declares the HARD rules in prose, and prose cannot block a
// delivery. Every HARD row in §11 (plus the component-library §4 coverage rows) becomes a machine check here, and
// each threshold is **read from the engines that drew the shapes** — LY.SPACE / LY.ROWS / LY.TIERS / LY.viewportHeight /
// CF.ladder / CF.STATE / CF.P — so the auditor can never disagree with the factories that produced the design.
//
// Usage: seed_storage.js → layout_engine.js → component_factory.js → this file, then
//   storage.designPage()                          // whole current page (the G13 gate)
//   storage.designPage({ board: host })           // one board, right after building it
//   storage.designPage({ tier: 'mobile' })        // when the audited scope is a touch screen
//   storage.designStart(pages) / designNext() / designAll(4)
// SCOPE: the auditor reads `penpot.currentPage`, and that binding only refreshes on a LATER execute_code turn — so
// there is no `{page}` argument here. Ask for one and you get a refusal, not a verdict about the wrong page;
// `designNext()` is the call that opens, settles and verifies. Always read `out.page` back.
// Output shape mirrors audit_layout.js: { counts, findings, verdict:'CLEAN'|'NEEDS_REPAIR', … }.
// ONE RULE DOES NOT READ CF/LY: `not_projected` (gate G16) reads `storage.FN`, which the G1 order seeds AFTER this
// file. It is consulted at AUDIT time, not seed time, so a session that never loads foundations_engine.js gets a
// finding on every 01/02 page instead of a silent pass. Same for the gate-G17 trio `not_assembled` /
// `placeholder_media` / `no_source_record`: they are scoped to the screen and app-shell surfaces (`10`, `12`, `14–16`) by page name, so a
// spec chapter that legitimately *shows a drawing* is never indicted for it, and `no_source_record` also reports a
// session that never loaded screen_engine.js instead of passing a screen page it cannot read.
//
// WHAT CLEAN MEANS: no HARD design-rule violation. It says nothing about positioning (audit_layout.js) or fidelity to
// the target (the PIL comparison in verification.md). Run all three.
//
// TWO LEVELS OF JUDGING (this is the whole design of the file):
//   1. **Composed layout** — the page/section boards and the boxes and gaps the agent placed. Grid, scale, rhythm,
//      split, viewport and control-cap rules bind here, because this is where amateur output actually shows.
//   2. **Primitives anywhere** — text and names: ramp, contrast, disabled alpha, measure, illegal names. These do not
//      depend on who drew the containing box, so they also judge the inside of a component.
//   Geometry *inside* a CF control host, a `·Spec` board or an annotation layer (fold·/region·) is NOT grid-audited:
//   an auto-width chip is 97px because the label is 97px, and a spec matrix places cells by measured content. Flagging
//   that would demand fixed widths on every control — worse design, and unfixable noise. Those internals are already
//   asserted structurally by the component-factory harness (containment / z-order / stroke / focus layer).
//
// Division of labour (do not duplicate): audit_layout.js owns out_of_bounds / board_overlap / text_overlap /
// header_collision / malformed_text / align_missing / crash_100x100 / degenerate_size / root_stray /
// text_centre_residue / loose_assembly. This file owns the §11 rules below.

return (function () {
  const LY = storage.LY, CF = storage.CF;
  if (!LY || !CF) return { err: 'run seed_storage.js → layout_engine.js → component_factory.js first' };
  if (typeof LY.viewportHeight !== 'function') return { err: 'layout_engine.js is stale: it must export LY.viewportHeight' };
  const P = CF.P;

  // ---------------------------------------------------------------- rule registry (design-guide §11 + component-library §4)
  const RULES = {
    off_grid: '§1 · composed-layout coordinates and box sizes on the 4px grid (hairlines, text and glyph-derived control boxes exempt; so are coordinates and hug axes a FLEX parent derives for its flow children — those are font-metric sums, not typed values)',
    off_scale_gap: '§1 · the gap between two ADJACENT sibling blocks (<=256) must be on LY.SPACE; cumulative distances and larger separations are not judged',
    off_ramp_size: '§3.2 · font size ∈ the declared ramp; ≥12px, 11px only for a role-named node (axis / overline / kbd)',
    measure_overflow: '§3.4 · multi-line prose wider than the 760px measure (chat/table/code exempt)',
    split_ratio_50_50: '§8 · a two-pane split narrower than 2.2:1, or 3+ identical panes',
    control_too_wide: '§1 · control wider than its cap inside a ≥720 container',
    touch_target: '§6 · interactive host smaller than the tier floor (hit pad counts, spec boards use the 24 floor)',
    multiple_primary: '§4 · more than one filled primary control inside one region',
    row_height: '§6 · table row height outside the quantized set',
    radius_nesting: '§5.1 · inner radius > outer radius − inset (only where the inset is inside the outer radius); on the token ladder "tighter than the parent" means the NEXT STEP DOWN or the same step, never an interpolated number',
    contrast: '§3.3 · opaque text against its resolved background under 4.5:1 (3:1 for ≥24px and for tone labels)',
    viewport_locked: '§2 · board locked to the tier viewport while content overflows or dead space is left, or a long baseline-width board with no fold marker',
    state_coverage: '§5.2 + component-library §3.0 · required state columns missing on the spec board',
    rhythm_inconsistent: '§2 · sibling band gaps spread over more than one scale step',
    variant_sparse: 'component-library §4 · too few variants / sizes / icon slots for the family',
    focus_ring_missing: 'component-library §4 + §1.3 · a Focus state with neither a PAINTING focus layer (a `ring·*` at alpha ≥.05, or a visible `wash·focus`/`row·focus`/`node·focus` state layer, or a ≥2px focus border) nor a 2px focus border. A ghost boundary alone is rule 44, not evidence here',
    disabled_wrong: 'component-library §4 · disabled label alpha outside the .25–.40 state band',
    name_invalid: 'component-library §4 · name contains an illegal "/" or newline',
    paint_unbound: 'design-tokens §8.1 · an opaque solid paint whose hex IS a declared token colour but the shape carries no `tokens.fill` / `tokens.strokeColor` binding — the colour was typed, not chosen from the set',
    paint_off_palette: 'design-tokens §8.1 · a paint whose hex is not any declared colour token: the palette and the token set have drifted apart',
    type_unbound: 'design-tokens §8.1 · copy that matches a declared ramp step but carries no `tokens.typography` binding',
    type_off_ramp: '§3.2 · the drawn (family,size,weight) is not a declared typography token, so nothing can bind to it — raise it onto the ramp. On a SCREEN or inside a control host a BINDING is also judged: a bound token whose run reads a different family/size/weight/leading (a Nunito run bound to Urbanist `type.label-lg`) is this rule, because the binding is a name, not the type. Documentation/spec labels are scoped out of the binding half',
    space_unbound: '§1 + design-tokens §6 · a flow container whose rowGap/columnGap equals a declared `spacing` token but carries no `tokens.rowGap`/`tokens.columnGap` binding (padding cannot be bound: measured, only the two gap props are accepted)',
    space_off_scale: '§1 · a gap or padding written on a flow/grid container that is not any declared `spacing` value — the space scale is a token set, not a habit',
    no_guides: '§2 + native-layout R0 · a tier-viewport composition board with neither native `guides` nor `rulerGuides`: the grid must live on the board (LY.guides), not in hand-drawn column rectangles',
    pane_filled: '§2 + layout-library · a `region·` pane that holds child regions was also filled with copy: a pane is structure, not a band — the text runs underneath every child region (fill `LY.leaves()` only)',
    not_component: 'component-library §5 / gate G10 · a control host whose name already has a master in the local library, drawn again instead of placed with CF.instance — a copy cannot be fixed, swapped or variant-driven',
    caption_stale: '§4 · a `wash|hue|ink #RRGGBB` caption that does not match the paint of the swatch beside it — a token-bound plate follows the token while its label keeps the hex authored at build time, so a board built before a theme overlay documents values it no longer shows',
    empty_cell: '§4.3 · a `cell·slot·*` / `cell·recipe·*` container with zero children — the region plates an `after` pass draws are missing, which is what a timed-out build whose bare board was later mounted looks like; the block renders as an empty frame',
    no_type_styles: '§3.2 + design-tokens §5 · the ramp declares `typography` tokens and this board draws text, but `penpot.library.local.typographies` is EMPTY — the Assets → Typography panel lists style records, not token sets, so consumers have nothing to pick; seed them with `storage.TP.seed()`',
    reference_drift: 'recreation source-adaptation gate (source-adaptation.md) · page 03: the ·Spec boards are exactly the source action families and their measured corner roles, a profiled family host must carry the material the profile pins (border/elevation/flush ring), and every action host carries the `nl:prof` birth stamp whose measured geo equals its entry\'s `expect`. pages 04–09: the page\'s profile GROUP (forms/selection/data/navigation/feedback) must be seeded once the file is a recreation, every host of a profiled family must carry its `nl:prof` (or `nl:fb`) birth stamp, and the stamp\'s measured geometry must equal the profile\'s declared `expect` block — a factory default is legal for a blank file, not for a source-backed page. Hosts from before the profile was seeded are measured by `CF.stampPass` (it reads the render, never the profile\'s numbers), so a generic host fails `expect` instead of being skipped. The profile is seeded through CF.setReference and stamped `nl:ref` on every PageRoot, so it survives a storage wipe; a missing profile is REPORTED, not passed',
    not_projected: 'gate G16 · a Foundations / Color-in-use chapter page (FN.CHAPTER) whose boards were not PROJECTED from the token records: this board carries no durable `nl:fn` stamp, or the chapter is missing a kind it contractually requires, or `storage.FN` is not seeded so the gate cannot be read at all',
    cramped_gap: '§2 · two block-level (≥24) flow siblings separated by less than `LY.breath("inline")` — the whitespace that carries the hierarchy was simply omitted, so the blocks touch. Reads the same LY.BREATH table a builder writes',
    hierarchy_gap: '§2 2× rule · a composition-level container whose gap between groups is under 2× the largest gap inside those groups — related things are not closer than unrelated ones, so the page cannot be grouped by eye',
    text_cramped: '§2 + §3.2 · running copy whose `lineHeight` is below the leading its own ramp step declares (multi-line, or under 1.0), or two prose siblings closer than one line of the upper block — vertical rhythm is typography, not just layout',
    radius_off_ladder: '§5.1 + design-tokens §8 · a corner radius that is not one of the declared `borderRadius` token values (a checkbox box above the 4px `radius.xxs` step is included): the token ladder is the ONLY source of a corner, so an orphan number cannot be retuned, themed or found again (measured 2026-10-21: a radius token writes all four corner props at once)',
    radius_unbound: '§5.1 + design-tokens §8 · a radius equal to a declared `borderRadius` token but with no `tokens.borderRadius*` binding — the corner was typed instead of taken from the set; run TK.bindBoard',
    ring_off_host: '§5.1 + CF.ROLE.ring = "host" · a `ring·*` outline whose corner is not the corner of the unit it outlines — a control BOARD or a NESTED plate (field, OTP digit, slider handle) — or whose two margins disagree around a circular owner (an oval ring around an ellipse), or a RECTANGULAR outline around a circular owner (a circle gets a circle: a 24×24 r0 ring around a 20px radio has 2/2 margins and passes the old ellipse test, but it is the wrong SHAPE), or a checkbox/radio/switch ring that is OUTSET around its visible box (the ring is flush; an outset halo leaves a corner gap): a ring is a derived outline, so `r0` body under an `r9999` ring (or a `r10` ring around a `r0` field) is one defect seen from two places. The owner is resolved by `TK.ringHost`, which ranks the TIGHTEST UNIFORM hug — not the smallest concentric plate: on `Radio·Focus·Checked` the 10px inner dot is concentric at 7px while the visible 20px disc owns the 2px ring. Rules 35/36 cannot see the corner case — **both** values are on the ladder and bound — and an ellipse has no borderRadius to compare. Repair with `TK.ringSweep` (corner + oval/rect refit).',
    ring_detached: '§5.1 + CF.ROLE.ring = "host" · a `ring·*` plate that is not mounted inside the control it outlines: it sits on the container (`Family·Spec` / PageRoot) board instead, or sits inside a control it neither traces nor fits. `ctx.ring` can only produce this when the ring was drawn before a refit moved its host, so the outline keeps the old box while the control moves away (measured 2026-10-22: 7 of the file\'s 231 rings, drifted 10-72px). Rule 37 cannot see it — there is no pair to compare — and the old host lookup handed rule 37 the shelf itself (corners 0), so a floating plate read CLEAN. The margin is NOT judged (measured 2/5/6/7/10/0 across families); the relation is. Repair with `TK.ringSweep`',
    plate_rounded: '§5.1 · a `·Spec` / background plate with a non-zero corner: the plate holds a GROUP, so a large corner (a source ladder\'s `lg` can be a 100px pill step) clips the group at the plate\'s own corners. Background plates default to square (`radius.none`); rounding belongs to controls and cards',
    divider_separator: '§2.1 · a content separator drawn as a `divider`/`hairline` plate: content blocks separate with a spacing-token gap (`space.md` 12 / `space.base` 16, bound as rowGap/columnGap), never with a 1px line whose absolute position drifts when the host refits. Functional boundaries and state indicators must be named `boundary·*` or `underline·*`, which this rule does not judge',
    focus_invisible: '§1.3 + WCAG 2.4.7 · a Focus control whose only focus evidence is a boundary at (near) zero alpha — `CF.FOCUS`\'s `reserved` role authors the ring as a SLOT (2px, the unit\'s corner, `strokeOpacity` 0) so a runtime can raise it, and the eye reads the 12% brand state wash. A ghost boundary with no `wash·focus` / `row·focus` / `node·focus` … plate in the same control is an invisible focus state: it satisfies nothing. `ctx.ring` draws both halves for a reserved family; if only the boundary survives, the wash was dropped (repair: rebuild the host, or `TK.focusSweep`)',
    row_axis_off: '§2.3 + §7 · a horizontal connector (`tail·*` / `rail·*` / `connector`) whose centre is not the centre of the nodes it joins: one row has ONE axis, and a node smaller than its own label (a 12px step dot under a 20px line) drawn at the band\'s TOP slips out of its own connector (measured 2026-10-22 on `Steps·Dot·LG`: node centres 6px, connector and label centres 10px). Repair: `CF.steps` centres `nyNode` on `max(cs, tLH)`; anything drawn by hand must place the node on the line, not the line on the node',
    overlay_in_flow: 'M8/§8 · an OVERLAY plate (`scrim*`, `overlay*`, `veil*`, `wash·*`, `ring·*`, `hitpad·*`) that is a NON-absolute child of a flex parent: an overlay is meant to sit ON its slot, but a flow child CONSUMES the slot — measured on `15 · Screens · content`, all 22 `scrim·region·*` plates were in-flow and half-height (468×315 inside a 468×700 media slot), so each one pushed the photograph it was supposed to darken down out of its own region. `CF` mounts its plates through `absMount` (absolute), so a factory cannot produce this and a hand-authored screen can. Repair: `absMount(parent, plate, parent.x, parent.y)`, and the media under it `sendToBack()`',
    list_gap_split: '§2.1 · a control host whose repeated command/row labels are NOT uniformly spaced: the tightest gap REPEATS (that is the established row pitch) and one gap is more than 1px wider with NOTHING drawn in the extra space. A semantic group boundary (a `\'-\'` in a menu) that eats `space.md` after rule 43 removed its line reads as a mistake, not as grouping — measured on `Menu·IconStart`: label gaps 12 / 24 / 12 around DUPLICATE. Either mark the break with something visible (a `group` label row, or a functional `boundary·*` line, which rule 43 exempts) or give it no space at all, which is what `CF.menu` does now. Copy is read one level deep (a hovered row lives inside its `row·` group) and a host with no repeating pitch is NOT judged — an Accordion\'s 26/39/40 are header→body, body→header, header→header, three different relationships, not three rows with a hole',
    media_stretched: 'M8 (media_engine) · a shape carrying a `fillImage` whose box ratio is more than 2% off the asset\'s own ratio — the photograph is being DISTORTED, not cropped. This build cannot ask for the crop: writing `fillFitMode: \'cover\'` succeeds and is silently dropped (the readback keeps only fillColor/fillOpacity/fillColorGradient/fillColorRefFile/fillColorRefId/fillImage), so Penpot falls back to `content` = stretch. Measured 2026-10-22 on `15 · Screens · content`: **30 of 30** images were stretched, worst 62% (a 1440×816 photo in a 468×700 gallery slot). The two legal forms are geometry: `MD.place({mode:\'fit\'})` sizes the shape to the asset ratio, `MD.place({mode:\'cover\'})` — the default when they disagree — builds a real MASK (`clip·` board with `clipContent`, the media inside at its own ratio scaled to cover and centred). Repair an existing file with `MD.refit`',
    frame_dead_band: '§3.3 + §2 · a control host whose border reserves a band its content never fills: one side\'s content inset is >= 32px AND >= 3x the opposite side (the frame is bigger than what it frames). Measured 2026-10-22 on `MiniCalendar·32cell`: the height formula used a hardcoded `rows: 6` while the drawn month (31 days starting on the first column) needs 5, and the loop `continue`d over every out-of-month slot, so the 6th row was empty and the grid\'s leading/trailing cells were never painted — inset bottom 49px vs top 7px. It is NOT a reservation for adjacent-month days: a reservation that is never filled is dead space. Repair: derive the frame from the content (`CF.miniCalendar` computes `need = ceil((firstWeekday + days) / 7)` and paints adjacent-month cells muted) or fill the band',
    not_assembled: 'gate G17 · a control-shaped board DRAWN on a screen or app-shell surface (`10`, `12`, `14–16`) whose name has no master in the local library. Rule 27 `not_component` only catches the redraw of a control that already has a master; a screen built from hand-drawn approximations has no master to compare against, so it read CLEAN while being nothing but disposable rectangles. A recreated screen is assembled from the system — extend the factory (G12), register it (`CF.autoRegister`), place it (`CF.instance` / `SC.ctl`)',
    placeholder_media: 'gate G17 · a shape whose name claims a raster asset (the `CF.isMediaSlot` grammar: `img·`, `thumb·`, `media`, `photo`, `cover·`, `avatar·`…) on a screen page, with no `fillImage` in its fills — a gray plate standing in for the user\'s own photograph. Import the source file with `MD.place({ parent, slot, path })` (`media_engine.js`)',
    no_source_record: 'gate G17 · a screen page whose composition boards carry no durable `nl:sc` / `nl:rec` stamp, so there is no record of the source material the screen was assembled from and the gate cannot be read (or `storage.SC` is not seeded at all). Unprovable is REPORTED, not passed — same contract as G16',
    shadow_unbound: '§5 + gate G18 · a shape that paints a shadow while the token set declares `shadow.*` tokens but carries no `tokens.shadow` binding — the stack was typed instead of taken from the elevation record. Measured 2026-10-23: 49 shadowed shapes in the file, 0 bound, all single-layer. Repair with `storage.EL.sweepPage({page, apply:true})`',
    library_drift: 'library-pairing contract (references/library-pairing.md) · when a host component library manifest is active (`storage.LM`, durable `nl:lib` on PageRoots), pages 03–09 must contain EXACTLY the manifest design families assigned to that page — a missing family or an extra family fails, and page 13 audits the live library masters against the manifest (missing visual components / masters that belong to no manifest component). A paired headless library draws anatomy + states, not invented styled variants',
    catalog_drift: 'standard design-system contract (references/catalog-standard.md) · pages 01–09 are the SAME system across projects: 01/02 must carry the standard token CAPACITY (57 colours / 12 type steps / 14 space steps / 9 radii / 13 shadow recipes / 2 dimensions / 4 border roles / 10 semantic tone triples) so the Foundations and Color boards keep one layout, and 03–09 must be the canonical 67 BLOCK PAGES from `storage.CATALOG.BLOCKS` — `NN.MM · Chapter · Family·Spec`, exactly one family spec per page, no legacy chapter page carrying family specs, no family spec on a support page, and the contract pages must sit in canonical sequence (`CAT.orderIssues`: 00–02 → 67 block pages in `CAT.BLOCKS` order → 10–17; extra support pages may sit anywhere). The file-level half is `CAT.pageIssues()` (missing block pages, chapter shells, order drift), merged into `storage.designCoverage().catalog`. Brand values remain project-specific and a source profile may still change geometry inside a family (the project chose to keep profile behaviour), but the block-page/family inventory, page order and token capacity are not project-authored. Load catalog_engine.js and call `CAT.seed()` before auditing; a file without the durable `nl:cat` stamp is REPORTED, not passed',
    shadow_clipped: '§5 + gate G18 · a shadowed shape whose painted shadow box is cut by a clipping ancestor — Penpot boards default to clipContent=true, so a slot/grid/Spec/row container slices the drop+inset stack at the cell edge. Layout containers must be authored with clipContent=false; only `clip·` media masks crop. Repair: storage.unclip() on the page, or rebuild the container with the fixed NL.frame/mkAbsBoard default',
    elevation_flat: '§5 + gate G18 · a shape stamped `nl:el=<recipe>` whose `shadows` has fewer layers than that recipe (a multi-layer stack collapsed to one, or a rebuild that dropped the insets), OR whose stamp names a different recipe than its NAME resolves to (a `Button·Secondary` still carrying `control` while its role is `chip`). The stamp is the durable contract; this rule compares it to the render and to the role. Repair with `EL.apply(shape, recipe)` / `EL.sweepPage`',
    edge_missing: '§5 + gate G18 · a stamped recipe declares INNER layers (the dark bottom lip / white top highlight that make a card read as a physical object) but the shape paints only drop shadows. A drop shadow alone is the flat "everything is a card" look this rule exists to stop',
    sheen_missing: '§5 + gate G18 · a stamped recipe declares a radial sheen but the host carries no `sheen·*` plate — the top-light that sells the material is absent. Repair with `EL.sheenFor(host, recipe)`',
    hover_flat: '§5.2 + gate G18 · a component state board named `·Hover`/`·Pressed` whose family declares a hover/press recipe but carries ZERO shadows — hover was modelled as an 8% fill tint, not as the source\'s elevation lift (measured 2026-10-23: every Button/Card hover state in the file read 0 shadows while the source adds 4–6 drop layers). Repair with `EL.sweepPage`',
    surface_missing: '§5 + gate G18 · a screen record declares `surface`/`elevation` for a section but the board has no `surface·<region>` plate — the section was assembled as bare text/frames with nothing to cast a shadow (measured 2026-10-23: 143 shapes, 0 shadows on `15 · Screens · content`). Mount it with `SC.surface` / `EL.surfacePass`',
    spec_unregistered: 'gate G10s · a control-shaped board on a spec page (`03`–`09`) that is not a Penpot component (neither a master nor an instance); repair with CF.autoRegister({states:true}).',
    label_off_axis: '§2.3 · a control\'s label is not on the control\'s own axis (vertical AND horizontal): its text-box centre sits >2px off the host centre while still within one line of it (a deliberate top/bottom-aligned caption is not judged; horizontal centring is exempt when the host carries a lead element — glyph, icon, avatar, dot, swatch, badge or any ellipse — because that element legitimately offsets the copy). Measured 2026-10-23 on all 21 Button masters: a unitless `lineHeight` (1.25) was read as 1.25px, so every label was centred on a 1.25px-tall box and landed 9px low. Measured 2026-10-26: five `Chip·Input·MD·Avatar` masters were falsely 15px off-axis because the exemption only recognised paths/glyph names, not the avatar ellipse. Repair: re-place from the resolved leading (ratio × fontSize) and re-centre on the final host box',
    free_layout: '§1.5 + native-layout §9 · on pages 01–09 a content board positions its elements ONLY as flow or grid children — rowGap/columnGap/padding (values judged by space_off_scale) or a grid cell: an absolutely-positioned child that is not a name-declared overlay (scrim/overlay/veil/wash·/sheen·/ring·/hitpad·/connector/tail·/rail·/boundary·/underline·) is free layout. A control host\'s own anatomy is exempt, but the host itself must still be a flow/grid child; page chrome (-Header/-Footer/-PageRoot) and page-level shelf placement are outside the rule. The measured platform fact behind it (api-pitfalls §coordinates): a board\'s absolute children hold WORLD coordinates and do not follow the shell, so free layout cannot re-flow after a token change and cannot be repaired in place. Producers: CF.matrix (grid/flow rows) and the FN row builders; the repair is a rebuild from the record, never a nudge',
    control_corner_split: '§5.1 · ONE CONTROL, ONE CORNER: inside a field control (the host that owns a `field` plate), the field, its add-ons (`addon·*`), attached steppers, `disabled-overlay` and `ring·*` must all carry the SAME corner. A variant changes MATERIAL (fill/stroke), never geometry; a square borderless body under a rounded ring/overlay/stepper is one control drawn with two shapes and reads as an element that does not belong (measured 2026-10-26 on `05 · Forms II`: Borderless TimePicker field r0, ring + disabled-overlay + steppers r9999). Rules 35/36 pass it — both values are ladder values and both are token-bound — and rule 37 only compares a ring to a BOARD host, so the mixture had no gate. The corner is resolved once through `CF.fieldRadius()` (forms profile → `field` role, never the button pill). Popup surfaces (panel/row/option), chips, carets and divider lines are not frame parts. Repair with `storage.unifyCorners`',
    axis_column_off: '§0 × §2.3 · a matrix sheet’s state row names its COLUMNS: one axis label per data column, each sitting on the column it names (flush-left on the slot or centred over it — either is legal, being off the column is not). Measured 2026-10-26: every `CF.matrix` grid had the whole state row one column left (axis cells 1..n while slots occupied 2..n+1), because the axis texts entered the grid as ABSOLUTE children — the platform ignored the explicit (row,col) and auto-placed them from the first free cell. The render read `default` over the row-label gutter and left the last state unnamed. Judge geometry, and report the grid cell when it disagrees with the column. Judged BY CELL (a caption in the grid row directly above each slot), so a grouped sheet — one caption row per state group, used when the states do not fit side by side — is held to the same pairing as a single axis row. Repair with `storage.repairAxisRow`',
    nested_control_raw: 'component-library §5 / G10s · a composite COMPOSES the atom: a `chip`/`pill`/`tag` plate inside a registered control must be a real copy of the atom family, not a redrawn rectangle whose label and ✕ are loose siblings. Measured 2026-10-26 on the selected `MultiSelect·Outlined·MD` master: two raw `chip` rectangles, two loose Text runs and two loose close paths — the tags could not be themed, swapped or fixed from the Chip library. A copy answers `isComponentCopyInstance`; a raw child inside a master inherits the parent’s main-instance flags, so those cannot distinguish it. Repair with `storage.repairChips` (instances the registered `Chip·Input·SM·Clear·Neutral` atom and fits label/✕)',
    chip_row_off_axis: '§2.3 + §3.3 · a field’s tag block is centred on the FIELD: the union of its chip pills (height + the gaps BETWEEN rows, never a trailing gap) shares the field’s vertical centre. Measured 2026-10-26 on `MultiSelect·Outlined·MD`: a 24px tag row in a 36px field sat at top 4 / bottom 8 because the factory centred `rowsN*(chipH+4)` — the trailing pitch counted as content. The old rule 57 is text-only, so the loose block had no gate. Repair with `storage.repairChips`',
    chip_icon_overlap: '§2.3 + native-layout §2 · a chip’s label and its ✕ are layout siblings, not two coordinates: their boxes must not intersect. Measured 2026-10-26 on a 78px `chip` copy that inherited its 85px master’s right inset — the text ended at x331 and the ✕ started at x327.5, a 3.5px collision the user reported as “✕ 与文字重叠”. A flex atom (`row·content` with a bound `space.xxs` `columnGap`) cannot produce it; a legacy absolute chip can. The rule accepts both a board chip (label/✕ inside) and a raw plate (label/✕ as siblings). Repair: rebuild the Chip atom with the flex row / `storage.repairChips` for raw chips',
    popup_state_collision: '§3.3 + §4 single-select semantics · a popup list has ONE selected row; hover/keyboard-active is a SEPARATE neutral state and a single-select panel must never show two selected rows or a brand-washed active row. Measured 2026-10-26: every TimePicker `row·selected` and `row·tint` was #2563eb @12%, so all variants read as two selected items (the user asked whether that was semantically correct — it is not). Repair with `storage.repairPopupRows`',
    popup_row_corner: '§5.1 nested surfaces · a popup row is inset inside its panel, so its corner is the LARGEST declared radius step ≤ panel radius − row inset — not the trigger’s corner and not an arbitrary smaller step. Measured 2026-10-26: TimePicker/Combobox rows sat 4px inside a r12 panel with r4 (`xs`), which read as a different component; the legal nested step is r8. Repair with `storage.repairPopupRows`',
    label_icon_overlap: '§2.3 + §3.3 · a registered control’s label and its leading/trailing icon are layout neighbours: their boxes must not intersect. Measured 2026-10-26 on `TableHeader·Sorted·asc`: an 88px host with 16px pads and a 16px caret slot gave the 43px label a 36px box; the auto-width text ran 2.3px into the caret (4.3px into the filter icon). The header factory now grows to its content minimum (label + space gap + icon slot); rule 67 covers chip label/✕. Repair with `storage.repairIconOverlap`',
    spec_label_overlap: '§1.5 + §2.3 spec matrix · a `·Spec` matrix is a GRID — including a default-only/single-axis family — with a measured label column and one data cell per row; the label text and its slot/component must not intersect. Measured 2026-10-26 on `TableHeader·Spec`: the single-axis fallback used wrap rows, the 100px label board held a 119px “Sorted descending”, and the text ran 7px into the TableHeader slot. `CF.matrix` now labels every fitting sheet as a grid, reads the rendered label/note widths and grows the label column (rounded to 4px); labels fill the row and centre vertically. Rebuild a legacy spec through `CF.matrix`',
    overlay_clipped: '§5.1 overlay visibility · a host with `clipContent` must not contain its own overlay badge (`presence`/`presence·ring`, `badge·`, `status·`, `dot·`, `indicator`): the clip trims the badge against the rounded silhouette. Measured 2026-10-26 on `Avatar·LG·Status·online` — 48×48 r9999 with `clipContent: true`, a 17px `presence·ring` at the edge losing its outer quarter; every avatar carried the same clip because `CF.avatar` passed `clip: true` unconditionally. Repair: the host does not clip; a surface that genuinely needs cropping (an editable scrim, a photo) takes the corner itself or lives in its own `clip·` wrapper',
    flush_corner_split: '§5.1 "one control, one corner", composited · a plate that sits FLUSH in a rounded host (both an X edge and a Y edge within 1px) must carry the host corner on the sides that touch that edge, or the host must clip. A group of segments is the case that hid: `ButtonGroup·Primary·MD·Focus` was a r9999 pill with r0 `segment·` plates and clipContent false, so the two end segments painted square corners straight through the pill outline — and it passed every gate (rule 63 only names the field family, rule 37 only compares a ring to its host). Measured 2026-10-26: 3 hosts in the file (two ButtonGroup states, one Toast accent bar). Repair: give the end plate a per-corner radius (CF.buttonGroup does), never clip the host — clipping cuts the focus ring that is authored 1px outside it. A 1–6px INDICATOR (progress meter, accent line) is exempt: spanning the edge is what makes it read as the card’s own bottom edge (“矩形和圆角融为一体”), and the trim comes from the HOST’s `clipContent` — the `Avatar·LG·Status·online` pattern (r9999 host, clip=true, presence badge at the edge) — never from an inset bar, a rounded 3px corner, or a separate `clip·` board (each was tried on `Toast·Dark·Timed·Info` and each was worse: detached, no-op, and lost absolute children on the next shelf move). `clipContent` clips children only, so the card’s own shadow is untouched. The rule judges PLATES only',
    spec_not_grid: '§1.5 + §2.3 spec matrix shape · a `·Spec` sheet is laid out by ONE real grid container (`grid·<Family>`: a measured label column + one data column per state), not by an `axis·` row plus `row·<Family>·N` fallback boards, and a board named `grid·` must actually carry a grid layout. Rule 71 only fires once a label crosses its slot, so the fallback shape itself was ungated and 36 of 67 block pages kept it after the grid landed in `CF.matrix` (32 with a 100px label column under a 148px axis spacer — the two columns visibly disagree). There is no wrap-row shape any more: a sheet whose states do not fit side by side becomes a GROUPED grid (whole state groups wrap into extra grid rows, each group named by its own caption row). Repair: rebuild through `CF.matrix`',
  };
  const DELEGATED = ['out_of_bounds', 'board_overlap', 'text_overlap', 'header_collision', 'malformed_text',
    'align_missing', 'crash_100x100', 'degenerate_size', 'root_stray', 'text_centre_residue', 'loose_assembly', 'spec'];

  // The page contract draws these only **inside a composite host** (one row per Table, one label per Stepper item), and
  // the contract puts the `·Spec` matrices on pages 03–09 while the composites live on page 10 — so an unscoped whole-page
  // coverage audit would demand a 5-state spec from a family that is never spec'd. They are still judged as shapes,
  // containers and CF hosts everywhere; only the matrix-coverage rules are scoped out. Page 10 is audited with
  // `{ families: [...] }` to bring them back inside their own board.
  const SPEC_SKIP = { SideNav: 1, Toolbar: 1, TabBand: 1, Table: 1, TableHeader: 1, TableState: 1, Form: 1,
    OptionList: 1, CommandPalette: 1 };

  // ---------------------------------------------------------------- tunables (each one cites the prose it comes from)
  const SPREAD_MAX = 256;   // > 2x the largest LY.SPACE step (128): a layout spread, not a rhythm gap
  const CFG = {
    hairline: 2,           // §1 exception: 1px border/divider
    gapTol: 0.5,          // every producer of these numbers is integer-exact (LY.SPACE, snap-to-4, C4 growth), so a
                          // half-pixel band decides membership; a 1px band would wave through 15/17/25 as "close enough".
    blockMin: 24,          // §1: gap math measures block↔block, not glyph↔label
    measure: 760,          // §3.4 WCAG ceiling / USWDS 66-char target
    capContainer: 720,     // §1 "full-width controls are legal only inside a narrow container"
    splitMin: 2.2,         // §8 two-column ratio 2.2–3.2
    bodyContrast: 4.5, largeContrast: 3.0, toneContrast: 3.0, contrastTol: 0.97,
    largeText: 24,         // §3.3 ≥3:1 for ≥24px
    opaqueFill: 0.9,       // §3.3 ramp is hex@1 in this kit; state-layer alphas belong to disabled_wrong, not here
    specTouchMin: 24,      // §6 blesses 24-tall compact controls; a spec board shows the whole size axis
    deadSpace: 200,        // §2 "a board with dead space at the bottom is an amateur tell"
    longBoard: 2000,       // layout-library §1: 2000+ must carry a fold marker
    rhythmBands: 3,        // §11 rule 14 needs ≥3 gaps before judging spread
    variantsMin: 3, sizesMin: 2,
    alphaBand: [0.25, 0.40],   // component-library §4: disabled content alpha
    minLeading: 1.2,           // §3.2 DEFAULT kit body leading — the floor when a size is not in the declared ramp
    proseMin: 240              // §3.4: a prose line is a *run of text*, not a label — 240px wide is where measure starts to matter
  };

  // Families that are *rows* (quantized height) / *fields* (width caps) / icon-bearing (§4 slot rule).
  const CAPS = { Input: 420, Textarea: 720, Search: 420, Password: 420, MaskedInput: 420, NumberField: 280,
    OTP: 560, Select: 240, MultiSelect: 420, Combobox: 360, DatePicker: 320, TimePicker: 200, ColorPicker: 280, Field: 480 };
  const ROW_FAMS = ['TableRow'];
  // component-library §3.0 — the state columns each family class must draw.
  const SETS = {
    ctl: ['default', 'hover', 'focus', 'pressed', 'disabled'],
    toggle: ['default', 'hover', 'focus', 'pressed', 'selected', 'disabled'],
    field: ['default', 'hover', 'focus', 'error', 'disabled'],
    row: ['default', 'hover', 'selected', 'focus', 'disabled'],
    sel: ['default', 'hover', 'focus', 'disabled'],
    display: ['default']
  };
  const CLASS = {
    Button: 'ctl', IconButton: 'ctl', ButtonGroup: 'ctl', SplitButton: 'ctl', FAB: 'ctl', Link: 'ctl',
    Upload: 'ctl', Slider: 'ctl', Rating: 'ctl', ColorPicker: 'ctl', Pagination: 'ctl', Steps: 'ctl',
    Anchor: 'ctl', Breadcrumb: 'ctl', Menu: 'ctl', Tree: 'ctl', Transfer: 'ctl', Carousel: 'ctl', MiniCalendar: 'ctl',
    Segmented: 'toggle', Tabs: 'toggle', NavItem: 'toggle', Chip: 'toggle',
    Input: 'field', Textarea: 'field', Search: 'field', Password: 'field', MaskedInput: 'field', NumberField: 'field',
    OTP: 'field', Select: 'field', MultiSelect: 'field', Combobox: 'field', DatePicker: 'field', TimePicker: 'field', Field: 'field',
    Switch: 'sel', Checkbox: 'sel', Radio: 'sel',
    TableRow: 'row', ListItem: 'row', Card: 'row', Accordion: 'row',
    // everything else is display chrome: one resting draw is enough to spec it
    AppBar: 'display', SideNav: 'display', Toolbar: 'display', PageTitle: 'display', Footer: 'display',
    MobileBar: 'display', Modal: 'display', Drawer: 'display', Sheet: 'display', Popover: 'display',
    Popconfirm: 'display', Tooltip: 'display', Toast: 'display', Notification: 'display', Alert: 'display',
    CommandPalette: 'display', Badge: 'display', Status: 'display', Avatar: 'display', AvatarGroup: 'display',
    StatusText: 'display', Progress: 'display', Skeleton: 'display', Descriptions: 'display', Spin: 'display',
    Timeline: 'display', KPI: 'display', Table: 'display', TableHeader: 'display', TableState: 'display',
    EmptyState: 'display', Component: 'display', TabBand: 'display'
  };
  const ICON_FAMS = ['Button', 'Input', 'Select', 'Search', 'Chip', 'Tabs', 'NavItem', 'Menu', 'Link', 'Field', 'Alert', 'Avatar'];
  // component-library §4: these two have exactly one drawing per state — a binary box has no style, slot or theme axis
  // (Radio's card/button forms delegate to Card and Segmented, which are audited as their own families). Demanding 3
  // "style variants" would only teach the producer to invent name tokens for the same pixels.
  const STATE_ONLY_FAMS = ['Checkbox', 'Radio'];
  const PRIMARY_FAMS = /^(Button|IconButton|SplitButton|ButtonGroup|FAB)$/;
  // Deliberate-overflow / decoration layers — the same prefix set the factories use as their escape hatch.
  const EXEMPT = /^(ring·|hitpad·|state·layer|scrim|shadow|glow|clip·|sheen·|hairline|divider|guide|connector|underline|tick|shimmer|dot·|arrow|bubble|value·bubble|now-line|now·|resizer|resize-handle|grabber|handle|track|caret|ripple|mask|skeleton|bar·)/;
  // Audit annotations (LY.fold / LY.drawStart): meta copy about the layout, not design copy → judged by no type rule either.
  const ANNO = /^(fold·|region·)/;
  // The numbers rules 32/33/34 judge by, published for the repair engine (`storage.breathe`, fix_geometry.js) so the
  // fixer aims at the floor the gate enforces instead of inventing a second one. The ladder itself is `LY.BREATH`, read
  // through `LY.breath()` by both sides — this only shares the shape filters.
  storage.breathSpec = { blockMin: CFG.blockMin, proseMin: CFG.proseMin, minLeading: CFG.minLeading,
    exempt: EXEMPT.source, anno: ANNO.source };
  const CHATRX = /chat|message|thread|comment|table|code|terminal|\blog\b|console|editor|diff|json|kanban/i;
  const SPLITRX = /login|signin|auth|signup|register|transfer|empty|pricing|quote|onboard|wizard|survey|two|pair|equal|modal|dialog|sheet|drawer|command|gallery|grid/i;
  // A **legend strip** is a swatch rack, not a composition: a spec row that shows the same box once per declared value
  // (radius steps, shadow tokens, series hues) is equal-width BY MEANING — the equality is the comparison being
  // documented. §8's "N equal panes" tell is about content columns, so a row whose own name declares it a rack is
  // exempt from both split branches. This can only ever remove a finding, never create one. (Added 2026-10-21 with
  // `storage.FN`, which projects exactly these boards.)
  const LEGRX = /legend|strip|rack|scale|ladder|ramp|palette|matrix|series|swatch/i;

  // ---------------------------------------------------------------- read helpers (every property access is guarded: proxies can throw)
  const N = (v) => Math.round(v);
  const num = (o, k, d) => { try { const v = o[k]; return Number.isFinite(v) ? v : d; } catch (e) { return d; } };
  const str = (o, k, d) => { try { const v = o[k]; return v === undefined || v === null ? d : String(v); } catch (e) { return d; } };
  const arr = (o, k) => { try { const v = o[k]; return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const kidsOf = (n2) => { try { const k = n2.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const typeOf = (s) => str(s, 'type', '');
  const nameOf = (s) => str(s, 'name', '');
  const isPlate = (s) => { const t = typeOf(s); return t === 'rectangle' || t === 'rect' || t === 'ellipse'; };
  const isText = (s) => typeOf(s) === 'text';
  const isBox = (s) => { const t = typeOf(s); return t === 'board' || t === 'group' || t === 'frame'; };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const isInstance = (s) => { try { return typeof s.isComponentInstance === 'function' && s.isComponentInstance(); } catch (e) { return false; } };
  // Measured 2026-10-22: a component's own shape answers `isComponentInstance() === true` **and**
  // `isComponentMainInstance() === true`, so `isInstance` alone cannot tell a master from a consumer. A COPY is the
  // consumer whose interior is not ours to judge; the main instance is the definition, and skipping it is what let a
  // whole spec chapter (79 button masters on `03.01`) pass the radius rules vacuously.
  const isCopy = (s) => { try { return typeof s.isComponentCopyInstance === 'function' && s.isComponentCopyInstance(); } catch (e) { return false; } };
  const rec = (s) => isBox(s) || isVC(s);
  const box = (s) => { const x = num(s, 'x', 0), y = num(s, 'y', 0), w = num(s, 'width', 0), h = num(s, 'height', 0); return { x: x, y: y, w: w, h: h, r: x + w, b: y + h }; };
  const radiusOf = (s) => { try { const b = s.borderRadius; if (typeof b === 'number') return b; if (b && typeof b === 'object') return Number(b.topLeft) || 0; } catch (e) {} return 0; };
  const fsOf = (s) => { const v = parseFloat(str(s, 'fontSize', '')); return Number.isFinite(v) ? v : 14; };
  const charsOf = (s) => str(s, 'characters', '');
  const covers = (r, pt) => pt.x >= r.x && pt.x <= r.r && pt.y >= r.y && pt.y <= r.b;

  // ---------------------------------------------------------------- colour math (§3.3)
  const hexOK = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const toRGB = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const chan = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
  const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const mix = (base, over, a) => [base[0] * (1 - a) + over[0] * a, base[1] * (1 - a) + over[1] * a, base[2] * (1 - a) + over[2] * a];
  const paint = (fills, base) => {
    let out = base;
    fills.forEach((f) => {
      const c = f && f.fillColor; if (!hexOK(c)) return;
      out = mix(out, toRGB(c), Math.max(0, Math.min(1, num(f, 'fillOpacity', 1))));
    });
    return out;
  };
  const TONE_HEX = () => [P.primary, P.error, P.success, P.warning, P.info, P.primarySoft, P.errorSoft, P.successSoft, P.warningSoft, P.infoSoft];
  const isToneColor = (hex) => TONE_HEX().some((v) => hexOK(v) && v.toLowerCase() === hex.toLowerCase());

  /** The colour a text actually sits on: every painted fill under it, bottom → top, down the parent chain. */
  function bgUnder(sh, pageBg) {
    const chain = []; let n2 = sh;
    while (n2) { chain.unshift(n2); n2 = n2.parent || null; }
    const me = box(sh), pt = { x: me.x + me.w / 2, y: me.y + me.h / 2 };
    const layers = [];
    for (let k = 0; k < chain.length - 1; k++) {
      const par = chain[k], child = chain[k + 1];
      arr(par, 'fills').forEach((f) => layers.push(f));
      const kids = kidsOf(par) || [];
      // ⚠ Every `.children` access returns NEW proxies, so `indexOf`/`===` never match (api-pitfalls §7): with a
      // reference test the loop below also collects our own branch, and a control host's translucent state fill is
      // painted TWICE — a 12% selected row then reads as #CACACA instead of #E1E1E1 and fails §3.3 on paper only.
      const cid = child.id;
      let idx = -1;
      for (let j = 0; j < kids.length; j++) { if (kids[j].id === cid) { idx = j; break; } }
      for (let j = 0; j < kids.length; j++) {
        if (idx >= 0 && j >= idx) break;                 // painted at or above our own branch
        const s = kids[j]; if (s.id === cid || isText(s)) continue;
        if (!covers(box(s), pt)) continue;
        arr(s, 'fills').forEach((f) => layers.push(f));
      }
    }
    return paint(layers, pageBg);
  }
  const toHex = (rgb) => '#' + rgb.map((v) => { const h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return h.length < 2 ? '0' + h : h; }).join('').toUpperCase();

  // ---------------------------------------------------------------- CF name parsing
  const STATE_TOKENS = ['default', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'loading', 'error',
    'success', 'warning', 'readonly', 'filled', 'open', 'closed', 'checked', 'unchecked', 'indeterminate', 'on', 'off', 'active'];
  const SIZE_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  function parseName(nm) {
    const segs = nm.split('·');
    // CF.name() drops the 'default' state and empty variant/size, so a plain resting control is a **single segment**
    // ("Breadcrumb", "TableRow"). The family is therefore always seg[0], dot or no dot.
    const fam = segs.length ? segs[0] : '';
    let state = null, size = null;
    segs.slice(1).forEach((s) => {
      const low = s.toLowerCase();
      if (!state && STATE_TOKENS.indexOf(low) >= 0) state = low;
      if (!size && SIZE_TOKENS.indexOf(low) >= 0) size = low;
    });
    return { family: fam, segs: segs, state: state, size: size,
      variant: segs.slice(1).filter((s) => STATE_TOKENS.indexOf(s.toLowerCase()) < 0 && SIZE_TOKENS.indexOf(s.toLowerCase()) < 0).join('·') || 'base' };
  }
  const famOf = (s) => { const p = parseName(nameOf(s)); return CLASS[p.family] ? p.family : null; };
  const isSpecBoard = (s) => typeOf(s) === 'board' && /·Spec(·|$)/.test(nameOf(s)) && !!famOf(s);
  // CF.name only ever joins variant/size/state/slot tokens, so a board carrying one of them is CF output even when its
  // family is not in CLASS (a factory renamed after this table). Unknown families stay host-shaped, judged as display.
  const CF_TOKENS = STATE_TOKENS.concat(SIZE_TOKENS, ['ICONSTART', 'ICONEND', 'CLEAR', 'ADDON', 'COUNT', 'BLOCK', 'SPEC',
    'BESIDE', 'BAND', 'STACK', 'MIXED', 'GROUP', 'RAIL', 'BLOCK']);
  function looksLikeCf(s) {
    if (typeOf(s) !== 'board') return false;
    const nm = nameOf(s); if (nm.indexOf('·') < 0) return false;
    return nm.split('·').slice(1).some((seg) => CF_TOKENS.indexOf(seg.toUpperCase()) >= 0 || seg.toUpperCase() === seg);
  }
  /** A CF control host (one board per control, family-named) — the boundary between "composed layout" and "component internals". */
  const isHostBoard = (s) => typeOf(s) === 'board' && !isSpecBoard(s) && (!!famOf(s) || looksLikeCf(s));

  // ------------------------------------------------------------ gate G17 (recreation): screen-page scope + live family index
  /** A **screen page** is where "assembled from the design system" is a requirement, not a nicety: a `·Spec` board
      exists to show a drawing, a screen exists to be built out of what the library already owns. Screens are grouped
      pages 14/15/16 (`penpot-structure.md` §2), so the predicate is the page name, never a board-level guess. */
  const SCREEN_PAGE = (nm) => /^1[4-9] · Screens/.test(String(nm || ''));
  // `CLASS` is the auditor's own state-coverage taxonomy and lags `CF.map()` every time a factory is added, so the
  // drawn-vs-placed rules index the LIVE factory table and fall back to CLASS. The family is always seg[0] (`CF.name()`
  // drops the default state), and BOTH spellings are indexed because the map holds camelCase keys (`otp`) while a name
  // head keeps the authored case (`OTP·Block·Md`).
  let CFAMS = null;
  function controlFamily(nm) {
    const head = String(nm || '').split('·')[0];
    if (!head) return null;
    if (!CFAMS) {
      CFAMS = {};
      Object.keys(CLASS).forEach((f) => { CFAMS[f] = 1; });
      let map = null;
      try { map = CF.map(); } catch (e) { map = null; }
      Object.keys(map || {}).forEach((g) => {
        const list = (map && map[g]) || [];
        for (let i = 0; i < list.length; i++) {
          const k = String(list[i] || '');
          if (!k) continue;
          CFAMS[k] = 1;
          CFAMS[k.charAt(0).toUpperCase() + k.slice(1)] = 1;
        }
      });
      // `shell` composites (AppBar/SideNav/Toolbar/PageTitle/Footer/MobileBar) and the `composer` helpers are
      // DOCUMENTATION boards on page 10, not leaf controls a screen places. Including them made the strict
      // not_assembled rule indict all six shell specimens (measured 2026-10-23), which is the noise that would
      // make the rule get switched off. Only leaf control families are judged.
      ['shell', 'composer'].forEach((g) => {
        ((map && map[g]) || []).forEach((k) => {
          delete CFAMS[k];
          delete CFAMS[String(k).charAt(0).toUpperCase() + String(k).slice(1)];
        });
      });
    }
    return CFAMS[head] ? head : null;
  }
  /** The raster-slot grammar, from its single source (`CF.isMediaSlot`, which `MD.isSlot` also calls). A local copy
      here would let a plate be a slot for the auditor and invisible to the media engine. */
  const SLOT_RX = /^(img·|image·|media$|media·|thumb$|thumb·|photo|hero·media|cover·|avatar·|og:)/i;
  const isMediaSlot = (nm) => (CF && CF.isMediaSlot ? CF.isMediaSlot(nm) : SLOT_RX.test(String(nm || '')));
  /** True when the shape sits under a host whose NAME carries the `·Disabled·` **state segment** of the §4 grammar
      (`Button·Disabled·Md`). The segment must be at index ≥1: a shape merely *named or worded* "Disabled" is
      documentation, not a control (measured 2026-10-21 — `FN`'s `02.02` rule sentence "Disabled recedes as a pair…"
      tripped `disabled_wrong` at alpha 1.00, and a bare specimen label named "Disabled" would too, because both hit a
      word-boundary test rather than the name grammar). */
  function inDisabledHost(sh, top) {
    let s = sh.parent;
    while (s && s !== top) {
      const segs = nameOf(s).split('·');
      if (segs.length > 1 && segs.slice(1).some((x) => String(x).trim().toLowerCase() === 'disabled')) return true;
      s = s.parent || null;
    }
    return false;
  }

  // ---------------------------------------------------------------- the audit
  storage.designPage = function (opts) {
    opts = opts || {};
    // SCOPE REFUSAL (measured 2026-10-21): `penpot.openPage()` in the SAME execute_code call does not rebind
    // `penpot.currentPage`, so an audit asked for page B while page A is open silently reports A — three "CLEAN"
    // verdicts with the same 351-board count. A wrong-scope verdict is worse than no verdict: refuse, and name the
    // call that switches correctly (designNext opens, settles 700ms and verifies).
    if (opts.page && String(str(penpot.currentPage, 'name', '')) !== String(opts.page)) {
      return { err: 'designPage audits the OPEN page "' + str(penpot.currentPage, 'name', '?') + '", not "' + opts.page + '": open it and audit from a LATER execute_code call (or use designStart/designNext)',
        page: str(penpot.currentPage, 'name', '?'), want: String(opts.page), verdict: 'NEEDS_REPAIR',
        findings: [], counts: {}, errors: [], boards: 0, shapes: 0 };
    }
    // The ramp the auditor judges against must be the ramp the FILE DECLARES. `storage.T.fontRamp` is the system-contract
    // mirror from seed_storage — a second source of truth, and the two disagree the moment a file re-skins: measured
    // 2026-10-21, an FN-projected `Radius` title drawn at the declared `type.h3` = 36px was reported `off_ramp_size`
    // because the default mirror has no 36. Read the live typography tokens when the token engine is seeded; the mirror
    // stays as the fallback for a file that has no tokens at all.
    let RAMP = (storage.T && Array.isArray(storage.T.fontRamp)) ? storage.T.fontRamp
      : [11, 12, 13, 14, 16, 20, 24, 32, 40, 56, 64];   // design-guide §3.2 kit + layout-library display bands
    let rampSrc = 'storage.T mirror (no token engine seeded)';
    // The declared LEADING per size, from the same read as the sizes themselves. A size can appear twice in a ramp with
    // different leadings (22/600 is both `type.h6` at 1.2 and `type.button` at 1.5), so the floor is the *tightest*
    // declared step at that size — demanding more than the ramp declares would be the auditor inventing a rhythm.
    const LEAD = {};
    if (storage.TK && typeof storage.TK.declared === 'function') {
      try {
        const d2 = storage.TK.declared();
        if (d2 && !d2.err && Array.isArray(d2.types)) {
          d2.types.forEach(function (e) {
            const sz = Number(e.size), ld = Number(e.leading);
            if (!(sz > 0) || !(ld > 0)) return;
            LEAD[sz] = LEAD[sz] === undefined ? ld : Math.min(LEAD[sz], ld);
          });
        }
      } catch (e) {}
    }
    // Publish the exact leading floor the gate will judge by, per size, so `storage.breathe` writes what clears this
    // audit instead of its own second reading of the ramp (measured 2026-10-21: 14px = 1.4 via `declared()`, 1.5 via
    // `typeIndex().step` — the fixer would over-raise, and a rule the gate cannot re-read is a rule that drifts).
    if (Object.keys(LEAD).length) storage.breathSpec.lead = LEAD;
    if (storage.TK && typeof storage.TK.declared === 'function') {
      try {
        const d = storage.TK.declared();
        const sizes = (d && !d.err && Array.isArray(d.types))
          ? Array.from(new Set(d.types.map((t) => Number(t.size)).filter((n) => n > 0))).sort((a, b) => a - b) : [];
        if (sizes.length) { RAMP = sizes; rampSrc = d.types.length + ' declared typography tokens'; }
      } catch (e) {}
    }
    const pageBg = toRGB(hexOK(opts.pageBg) ? opts.pageBg : (hexOK(P.surface) ? P.surface : '#FFFFFF'));
    const out = { page: str(penpot.currentPage, 'name', 'single-board'), boards: 0, shapes: 0,
      counts: {}, findings: [], errors: [], sizes: {}, fonts: {}, tiers: {}, families: {}, skipped: {}, verdict: 'CLEAN' };
    out.ramp = rampSrc + ' · ' + RAMP.join(',');   // say which ramp a `off_ramp_size` verdict was measured against
    // §5 elevation is measured against the LIVE record: the shadow tokens the set declares and the EL engine
    // that owns the recipes. A file with no shadow tokens is judged by the old rules only (no false positives).
    const HAS_EL = !!(storage.EL && storage.EL.seeded && typeof storage.EL.readStamp === 'function');
    let SHADOW_TOKENS = 0;
    try { const d3 = storage.TK && storage.TK.declared ? storage.TK.declared() : null; SHADOW_TOKENS = (d3 && d3.shadows ? d3.shadows.length : 0); } catch (e) {}
    out.elevation = { engine: HAS_EL, shadowTokens: SHADOW_TOKENS };

    const add = (kind, s, where, detail) => {
      out.counts[kind] = (out.counts[kind] || 0) + 1;
      if (!RULES[kind] && DELEGATED.indexOf(kind) < 0) out.counts.__unknown_rule = (out.counts.__unknown_rule || 0) + 1;
      if (out.findings.length < (opts.maxFindings || 70)) out.findings.push({ kind: kind, board: where ? nameOf(where) : undefined,
        shape: s ? nameOf(s) : undefined, type: s ? typeOf(s) : undefined,
        host: s ? (chainName(s, undefined).split(' ')[0] || undefined) : undefined,
        text: s && isText(s) ? charsOf(s).slice(0, 18) : undefined,
        x: s ? N(num(s, 'x', 0)) : undefined, y: s ? N(num(s, 'y', 0)) : undefined,
        w: s ? N(num(s, 'width', 0)) : undefined, h: s ? N(num(s, 'height', 0)) : undefined, detail: detail });
    };
    const err = (where, e) => { if (out.errors.length < 4) out.errors.push(where + ':' + (e && e.message || e)); };

    const headOf = (r) => { const ks = kidsOf(r) || []; for (const c of ks) if (typeOf(c) === 'board') return c; return null; };
    const root = opts.root || (() => { try { return penpot.currentPage.root || penpot.root; } catch (e) { return null; } })();
    const top = opts.board || headOf(root);
    if (!top) return Object.assign(out, { err: 'no board to audit on this page' });
    // The tier is a property of the *screen*, never of the control inside it: a 32px icon button in a phone screen is
    // judged at the 44 floor, so the tier comes from the audited scope (explicit opts.tier wins).
    const tier = opts.tier || (isHostBoard(top) ? 'web' : LY.tierFor(num(top, 'width', 1440)));
    out.tier = tier;
    // G17 scope: the three screen-page rules (39/40/41) are page-scoped by contract so a spec chapter that legitimately
    // displays a drawing is never indicted for it. Computed once per page, not per shape.
    const SCREEN = SCREEN_PAGE(out.page);
    // App surfaces are the compositions a user actually operates: the app-shell/chrome showcase, screen recipes and
    // screens. `not_assembled` was scoped to 14–16 only, so page 10's `Button·MD` / `IconButton·Ghost·XS` raw boards
    // passed every gate while the library held Button/IconButton masters (measured 2026-10-23). Same contract here.
    const APP = /^(10 · App shell & chrome|12 · Screen recipes|1[4-6] · Screens)/.test(String(out.page || ''));
    // Spec pages 03–09 are the library's source of truth: every control host there (including every state cell) must be a
    // real component, not a raw drawing. This is the G10s contract the user asked for (measured 2026-10-23).
    const SPEC = /^0[3-9] ·/.test(String(out.page || ''));
    out.screenPage = SCREEN;

    // ---- region pane map, measured geometrically.
    // A pane is a `region·` board whose box contains another `region·` board: nested (dashboard.content over its
    // kpi/chart/table bands) OR a flat sibling (docsLayout `content` 400,9520 928×1336 over `body` 480,9520 768×1336).
    // The old pane_filled test only looked for CHILD regions and was gated by `!isAnno(s)` — every `region·` name
    // matches ANNO, so the signature could never fire, and pages 14/15 shipped 65 cross-parent text collisions CLEAN.
    // Copy under a child region is the child's, not the pane's: `ownCopy` stops at nested region boards and ignores
    // annotation text, so a legal host fill (cart.summary draws its own lines, child bands were skipped) stays clean.
    const REGIONS = [];
    const ownCopy = (b) => {
      let hit = false;
      const scan = (n, d) => {
        if (hit || d > 8) return;
        for (const c of kidsOf(n) || []) {
          if (c !== b && typeOf(c) === 'board' && /^region·/.test(nameOf(c))) continue;
          if (isText(c) && !ANNO.test(nameOf(c)) && String(charsOf(c)).trim()) { hit = true; return; }
          scan(c, d + 1);
        }
      };
      scan(b, 0);
      return hit;
    };
    (function collectRegions(n) {
      for (const c of kidsOf(n) || []) {
        try { if (typeOf(c) === 'board' && /^region·/.test(nameOf(c))) REGIONS.push({ s: c, r: box(c), copy: ownCopy(c) }); } catch (e) {}
        collectRegions(c);
      }
    })(top);
    const holdsFilledRegion = (b) => {
      const br = box(b);
      return REGIONS.some((x) => x.s.id !== b.id && x.copy &&
        x.r.x >= br.x - 1 && x.r.y >= br.y - 1 && x.r.r <= br.r + 1 && x.r.b <= br.b + 1 &&
        (x.r.w * x.r.h) < (br.w * br.h));
    };

    /** Chain of names above the shape (stops at `stopAt`) — used for the documented exemptions. */
    function chainName(sh, stopAt) {
      let s = sh.parent, acc = [];
      while (s && s !== stopAt) { acc.push(nameOf(s)); s = s.parent || null; }
      return acc.join(' ');
    }
    const isAnno = (sh) => ANNO.test(nameOf(sh)) || ANNO.test(chainName(sh, top));
    /** Region = nearest ancestor board that is not a CF control host (a spec board counts as a region). */
    function regionOf(sh) {
      let s = sh.parent;
      while (s && s !== top) { if (typeOf(s) === 'board' && !isHostBoard(s)) return s; s = s.parent || null; }
      return top;
    }

    // ---- token-binding rules (design-tokens §8.1: the token set is the only source of colour and type) ----
    // `tokens` is the only proof available: a colour applied from a token keeps `fillColorRefId` **null** (measured
    // 2026-10-20), so the library-colour channel says nothing about token bindings.
    const TOK = (storage.TK && storage.TK.colorIndex) ? { ci: storage.TK.colorIndex(), ti: storage.TK.typeIndex() } : null;
    // A colour picker *displays* arbitrary colours: its hue ramp and swatch grid are content, not the system palette,
    // so demanding a token binding there would be a category error.
    const DATA_PAINT = /^(hue·step·|swatch(·|$))/;
    function paintAudit(s, st, isTxt) {
      if (!TOK || isAnno(s) || DATA_PAINT.test(nameOf(s))) return;
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      const fl = arr(s, 'fills');
      if (!isTxt && fl.length === 1 && !tk.fill && !str(fl[0], 'fillColorRefId', '') &&
          !fl[0].fillImage && !fl[0].fillColorGradient && num(fl[0], 'fillOpacity', 1) >= 0.99) {
        const h = String(fl[0].fillColor || '').toLowerCase(), e = TOK.ci.byHex[h];
        add(e ? 'paint_unbound' : 'paint_off_palette', s, st.top, e
          ? 'fill ' + h + ' is token ' + e.surface + ' but carries no tokens.fill — run TK.bindBoard'
          : 'fill ' + h + ' names no colour token (' + nameOf(s) + ')');
      }
      const so = arr(s, 'strokes');
      if (so.length === 1 && !tk.strokeColor && !str(so[0], 'strokeColorRefId', '') && num(so[0], 'strokeOpacity', 1) >= 0.99) {
        const h = String(so[0].strokeColor || '').toLowerCase(), e = TOK.ci.byHex[h];
        add(e ? 'paint_unbound' : 'paint_off_palette', s, st.top, e
          ? 'stroke ' + h + ' is token ' + e.surface + ' but carries no tokens.strokeColor'
          : 'stroke ' + h + ' names no colour token');
      }
      if (!isTxt) return;
      // Scope the bound-drift half to CONSUMER SURFACES: a screen, or copy inside a control host. A foundations/spec
      // board's annotation is documentation, not a component the user edits; judging it here dragged 185 board labels
      // into a font migration that shrank auto-height swatch cells (measured 2026-10-23). The family contract still
      // applies where it matters, and `mkText` now takes its family from the ramp so new documentation is born correct.
      let inCtrl = false;
      try {
        let a = s.parent, g = 0;
        while (a && a !== st.top && g < 4) { if (typeOf(a) === 'board' && /^(Button|IconButton|Tab|Chip|Link)·/.test(nameOf(a))) { inCtrl = true; break; } a = a.parent || null; g++; }
      } catch (e) {}
      const surfaceScope = SCREEN || inCtrl;
      // A BOUND token is not proof the run matches it: `TK.bindBoard` keys on size+weight, so a Nunito 16/600 run
      // was bound to the Urbanist `type.label-lg` and passed every type rule (measured 2026-10-23 on all Button
      // labels). Judge the binding against the token's own family/size/weight/leading, not just its presence.
      if (tk.typography) {
        if (surfaceScope) {
          const e = TOK.ti && TOK.ti.ramp ? TOK.ti.ramp.filter((r) => r.name === tk.typography)[0] : null;
          if (e) {
            const f = String(str(s, 'fontFamily', '')).toLowerCase();
            // `fontSize`/`fontWeight` read back as STRINGS on a text shape; `num()` only accepts finite numbers, so it
            // reported 0 for every bound run and this new check indicted the whole type ramp (measured immediately).
            const fs = parseFloat(str(s, 'fontSize', '0')) || 0, fw = parseFloat(str(s, 'fontWeight', '0')) || 0;
            const lhRaw = parseFloat(str(s, 'lineHeight', '0')) || 0;
            const lhPx = lhRaw > 0 && lhRaw < 4 ? lhRaw * fs : lhRaw;
            const wantPx = e.leading && e.size ? e.leading * e.size : 0;
            const bad = [];
            if (e.family && f && e.family !== f) bad.push('family ' + str(s, 'fontFamily', '?') + ' ≠ ' + e.family);
            if (e.size && Math.abs(fs - e.size) > 0.6) bad.push('size ' + N(fs) + ' ≠ ' + N(e.size));
            if (e.weight && Math.abs(fw - e.weight) > 1) bad.push('weight ' + N(fw) + ' ≠ ' + N(e.weight));
            if (wantPx && lhPx && Math.abs(lhPx - wantPx) > 1.5) bad.push('leading ' + N(lhPx) + 'px ≠ ' + N(wantPx) + 'px');
            if (bad.length) add('type_off_ramp', s, st.top, '"' + tk.typography + '" is bound but the run does not match it: ' + bad.join(' · ') + ' — the binding is a name, not the type');
          }
        }
        return;
      }
      const k = storage.TK.shapeTypeKey(s), pretty = k.replace(/\|/g, ' ');
      if (TOK.ti.exact[k]) add('type_unbound', s, st.top, pretty + ' is a declared step carried with no tokens.typography binding');
      else {
        const alt = storage.TK.stepFor(s.fontSize, s.fontWeight, s.fontFamily, s.lineHeight);
        if (alt) add('type_unbound', s, st.top, pretty + ' → ' + alt + ' (binding retunes leading/family to the ramp)');
        else add('type_off_ramp', s, st.top, pretty + ' is not a declared typography token (' + charsOf(s).slice(0, 12) + ')');
      }
    }

    // ---- the space scale, judged on the container that carries it
    // Measured 2026-10-20: a `spacing` token binds to `rowGap`/`columnGap` (reads back on `tokens.rowGap`) but the four
    // padding props are REJECTED by applyToShapes, so padding is only judged as a value — otherwise the gate would
    // demand a binding the platform cannot store.
    const SI = storage.TK && storage.TK.spaceIndex ? storage.TK.spaceIndex() : null;
    const GAP_PROPS = ['rowGap', 'columnGap'];
    const PAD_PROPS = ['topPadding', 'rightPadding', 'bottomPadding', 'leftPadding'];
    function spaceAudit(s, st) {
      if (!SI || !SI.count || isAnno(s) || isInstance(s)) return;
      let fx = null;
      try { fx = s.flex || s.grid || null; } catch (e) {}
      if (!fx) return;
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      GAP_PROPS.concat(PAD_PROPS).forEach(function (p) {
        let v = null; try { v = num(fx, p, 0); } catch (e) {}
        if (!v || v <= 0) return;                       // 0 = the absence of a decision, not the 4px step
        const name = SI.byVal[v];
        if (!name) {
          add('space_off_scale', s, st.top, p + '=' + N(v) + ' is not a declared spacing token (' +
            Object.keys(SI.byVal).sort((a, c) => a - c).join('/') + ')');
        } else if (GAP_PROPS.indexOf(p) >= 0 && !tk[p]) {
          add('space_unbound', s, st.top, p + '=' + N(v) + ' is token ' + name + ' with no tokens.' + p + ' binding — run TK.bindBoard');
        }
      });
    }

    // ---- rules 35/36 · the corner radius is a token or it does not exist (§5.1 + design-tokens §8)
    // Measured 2026-10-21: applying a `borderRadius` token writes ALL FOUR corner props into `shape.tokens`
    // (`borderRadiusTopLeft/TopRight/BottomRight/BottomLeft`); a single-property apply yields a partial map, so the
    // binding proof below is "every non-zero corner carries its token", and `TK.bindBoard` binds the four together.
    // The ladder is read from the LIVE set (`TK.declared().radii`), never from `CF.RAD`, so a file that renames or
    // drops a step is judged by what it actually declares.
    const CORNERS = ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'];
    const RI = (function () {
      if (!storage.TK || !storage.TK.declared) return null;
      let r = [];
      try { r = storage.TK.declared().radii || []; } catch (e) { r = []; }
      const byVal = {};
      r.forEach(function (x) { byVal[Math.round(Number(x.value))] = x.name; });
      return { count: r.length, byVal: byVal, steps: r.map((x) => x.name + ' ' + N(x.value)) };
    })();
    function cornersOf(s) {
      let b = null; try { b = s.borderRadius; } catch (e) { return null; }
      if (b === null || b === undefined) return null;
      if (typeof b === 'number') return [b, b, b, b];
      if (typeof b === 'object') return CORNERS.map(function (p) { return Number(b[p]) || 0; });
      return null;
    }
    function radiusAudit(s, st) {
      // Judged on masters and on copies alike: a copy can carry a corner override, and a master's corner is the value
      // every copy inherits. Only `isCopy` stops the descent below (the interior of a consumer is not a second opinion).
      if (!RI || !RI.count || isAnno(s) || isCopy(s)) return;
      const cs = cornersOf(s); if (!cs) return;
      // Rule 42: a spec sheet is a background plate for a GROUP of controls, so it defaults to square. A non-zero
      // corner on it is not a taste choice — the board clips its own children, and the ladder step used as "large"
      // (`lg`, the source's 100px avatar/pill step) cuts the corner cells (measured 2026-10-22 on `FAB·Spec`).
      if (/·Spec$/.test(nameOf(s))) {
        const mx = Math.max.apply(null, cs);
        if (mx > 0) add('plate_rounded', s, st.top,
          '"' + nameOf(s) + '" has a ' + N(mx) + 'px corner — a ·Spec background plate holds a group and defaults to square (radius.none); round the controls, not the sheet');
      }
      const hit = cs.filter((v) => v > 0);
      if (!hit.length) return;
      const rc = out.radius || (out.radius = { shapes: 0, onLadder: 0, bound: 0, steps: {}, off: {} });
      rc.shapes++;
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      // ONE finding per shape per class: a scalar radius writes four identical corners, and four copies of the same
      // indictment would multiply every page's count without naming four different defects.
      const off = [], unbound = [];
      cs.forEach(function (v, i) {
        if (v <= 0) return;
        const name = RI.byVal[Math.round(v)];
        if (!name) { off.push(v); rc.off[v] = (rc.off[v] || 0) + 1; return; }
        if (!tk[CORNERS[i]]) { unbound.push(CORNERS[i] + '=' + N(v) + ' (' + name + ')'); return; }
        rc.steps[name] = (rc.steps[name] || 0) + 1;
      });
      if (off.length) add('radius_off_ladder', s, st.top,
        N(off[0]) + (off.length > 1 ? ' +' + off.length + ' corners' : '') +
        ' is not a declared border-radius token (' + RI.steps.join('/') + ') — the corner was invented, take it from the ladder');
      if (unbound.length) add('radius_unbound', s, st.top,
        unbound.join(' ') + ' carries no tokens.borderRadius* binding — run TK.bindBoard');
      if (!off.length) rc.onLadder++;
      if (!off.length && !unbound.length) rc.bound++;
    }

    // ---- rules 32/33/34b · §2 makes whitespace the FIRST separation device, so its ABSENCE is a defect of the same
    // class as an off-scale number. The amounts come from `LY.BREATH` — the very table `NL.frame({breath:…})` writes —
    // so a builder that used the ladder cannot be indicted by the gate, and the gate cannot drift from the ladder.
    function isBlock(k, col) {
      try { if (k.layoutChild && k.layoutChild.absolute) return false; } catch (e) { return false; }   // not separated by a gap
      if (isAnno(k) || /-PageRoot$|-Header$|-Footer$/.test(nameOf(k)) || EXEMPT.test(nameOf(k))) return false;
      const b = box(k);
      return (col ? b.h : Math.min(b.w, b.h)) >= CFG.blockMin;
    }
    function flexGap(s) {
      let fx = null; try { fx = s.flex || null; } catch (e) { return null; }
      if (!fx) return null;
      const col = String(fx.dir || 'column') !== 'row';
      return { col: col, gap: num(fx, col ? 'rowGap' : 'columnGap', 0) };
    }
    /** Running prose (not a label): it wraps, and it is wide enough to have a measure to respect (§3.4). */
    function isProse(t) {
      if (!isText(t)) return false;
      const b = box(t), fs = fsOf(t);
      if (b.w < CFG.proseMin) return false;
      const lh = CF.lineH(fs, null, str(t, 'fontFamily', null));
      return b.h >= lh * 1.8;
    }
    /** A uniform run of repeated items (table rows, list items, matrix cells) is ONE group: equal extents on a equal
        pitch means the container is a data list, and a list separates its items with rules and surface polarity, not
        with air. Rule 33 (2×) never binds a run — measured 2026-10-21 on 02.03 · Contrast matrix, where it indicted the
        same 48px row 12 times. `grouped` = the run's items stack their own interior (cards), and for a column of cards
        the whitespace FLOOR (rule 32) still binds even though the 2× rule does not. */
    function runOf(kids, col) {
      if (kids.length < 3) return null;
      const bs = kids.map(box), ext = [], pitch = [];
      for (let i = 0; i < bs.length; i++) ext.push(col ? bs[i].h : bs[i].w);
      for (let i = 1; i < bs.length; i++) pitch.push(col ? bs[i].y - bs[i - 1].y : bs[i].x - bs[i - 1].x);
      const flat = (a) => a.every((v) => Math.abs(v - a[0]) <= 2);
      if (!flat(ext) || !flat(pitch)) return null;
      const grouped = kids.some(function (k) {
        const g = flexGap(k);
        return !!g && g.col && (kidsOf(k) || []).filter((c) => isBlock(c, g.col)).length >= 2;
      });
      return { grouped: grouped };
    }
    function breathAudit(s, st, compos) {
      if (isAnno(s) || isInstance(s)) return;
      const fg = flexGap(s); if (!fg) return;
      const kids = (kidsOf(s) || []).filter((k) => isBlock(k, fg.col));
      if (kids.length < 2) return;
      // Adoption read, not a rule: §2 makes whitespace the FIRST separation device, so delivery has to be able to say how
      // much of the file is laid out on the `LY.BREATH` ladder rather than on an arbitrary on-scale number. A gap can be
      // `space_off_scale`-free and still not breathe.
      const bc = out.breath || (out.breath = { containers: 0, onLadder: 0, ladder: {}, off: {}, samples: [] });
      bc.containers++;
      const LV = LY.BREATH ? (LY.BREATH[st.tier] || LY.BREATH.web) : null;
      const lvl = LV ? LY.breathLevels().filter((k) => Math.abs(LV[k] - fg.gap) <= 0.01)[0] : null;
      if (lvl) { bc.onLadder++; bc.ladder[lvl] = (bc.ladder[lvl] || 0) + 1; }
      else { bc.off[fg.gap] = (bc.off[fg.gap] || 0) + 1;
        if (bc.samples.length < 8) bc.samples.push(nameOf(s).slice(0, 26) + ':' + N(fg.gap)); }
      const floor = LY.breath ? LY.breath('inline', st.tier) : 8;
      // A **row** of blocks may abut on purpose: §1.3 says adjacent panes and segments touch with a hairline, and that is
      // exactly what a Segmented / ButtonGroup / table row draws. The floor binds a row only when its members are cards
      // (each with a stacked interior of its own) or when the row already tried to separate them (gap > 0).
      if (!fg.col) {
        const cards = kids.filter(function (k) {
          const g = flexGap(k);
          return g && (kidsOf(k) || []).filter((c) => isBlock(c, g.col)).length >= 2;
        });
        if (fg.gap === 0 && cards.length < 2) return;
      }
      const run = runOf(kids, fg.col);
      if (fg.gap < floor) {
        // A cross-axis run (rows of cells) separates by rules, not air; a run of stacked cards still needs the floor.
        if (!(run && !run.grouped)) {
          add('cramped_gap', s, st.top, (fg.col ? 'row' : 'column') + ' gap ' + N(fg.gap) + ' between ' + kids.length +
            ' block-level children — under LY.breath("inline","' + st.tier + '")=' + floor + ': §2 makes whitespace the separator, so this stack has none ("' +
            nameOf(s).slice(0, 40) + '")');
        }
      }
      // 34b · prose↔prose needs a line of air (the CSS `margin-block: 1em` convention and §2's block rhythm). A label is
      // not prose, so the legal 4-6 label↔field gap is never judged here.
      if (fg.col) {
        for (let i = 0; i + 1 < kids.length; i++) {
          const A = kids[i], Bc = kids[i + 1];
          if (!isProse(A) || !isProse(Bc)) continue;
          const lh = CF.lineH(fsOf(A), null, str(A, 'fontFamily', null));
          const gap = box(Bc).y - box(A).b;
          if (gap >= 0 && gap < lh - 0.5) {
            add('text_cramped', Bc, st.top, 'paragraph gap ' + N(gap) + ' under one line (' + N(lh) + 'px) of the prose above — §2: body copy needs at least a line of air');
          }
        }
      }
      // 33 · the 2× rule, at composition level only: inside a CF host the `inline`/`row` steps are anatomy the factory
      // owns, and a spec matrix places its cells by measured content. Never judged across a repeated-item run.
      // `inner` counts a child ONLY when that child is itself a STACKED group (column axis, ≥2 block children): the gap
      // inside a table row is the gap between its CELLS, which separates fields, not groups. Measured 2026-10-21 on
      // 02.03 · Contrast matrix, where a 48px row's 16px cell gap was read as "the gap inside the group" 7 times.
      if (compos && LY.breath && !(run && !run.grouped)) {
        let inner = 0;
        kids.forEach(function (k) {
          const g = flexGap(k);
          if (!g || !g.col || g.gap < floor) return;
          if ((kidsOf(k) || []).filter((c) => isBlock(c, true)).length < 2) return;
          inner = Math.max(inner, g.gap);
        });
        if (inner && fg.gap < 2 * inner - 0.5) {
          add('hierarchy_gap', s, st.top, 'gap ' + N(fg.gap) + ' between groups is under 2× the gap ' + N(inner) +
            ' inside them (§2 2× rule) — raise this container to ' + N(LY.snap(2 * inner)) + ' or tighten the child ("' +
            nameOf(s).slice(0, 40) + '")');
        }
      }
    }
    // ---- text rules: ramp, measure, contrast, disabled alpha, leading (level 2: they judge copy wherever it lives)
    function auditText(t, st, par) {
      out.texts = (out.texts || 0) + 1;
      if (isAnno(t)) return;
      paintAudit(t, st, true);
      const fs = fsOf(t), txt = charsOf(t), r = box(t);
      // rule 34a · §2's rhythm lives in the type itself: `mkText` writes the ramp step's leading onto the layer, so a
      // text drawn at a tighter multiplier is copy the builder compressed by hand — invisible to every size rule, because
      // the size is on the ramp. Judged when the run wraps (a single line shows no rhythm) or when the multiplier would
      // clip its own line box (<1). The floor is the **tightest** declared step at that size, so the auditor never
      // demands more air than the ramp itself claims.
      const lhRaw = parseFloat(str(t, 'lineHeight', ''));
      if (Number.isFinite(lhRaw) && lhRaw > 0) {
        const want = LEAD[fs] !== undefined ? LEAD[fs] : CFG.minLeading;
        const one = CF.lineH(fs, null, str(t, 'fontFamily', null));
        if ((r.h >= one * 1.8 || lhRaw < 1) && lhRaw < want - 0.02) {
          add('text_cramped', t, st.top, 'lineHeight ' + lhRaw + ' under the declared leading ' + want + ' of the ' + fs +
            'px step' + (r.h >= one * 1.8 ? ' — ' + Math.max(2, Math.round(r.h / (lhRaw * fs))) + ' wrapped lines of copy'
              : ' — clips its own line box') + '. Bind the typography token; the ramp owns the rhythm');
        }
      }
      // rule 57 · label_off_axis — a control's label belongs on the control's own axis. A unitless leading read as
      // pixels centres the text box on a 1.25px band instead of a 20px one, which lands every label ~9px low while the
      // host, padding and typography all read correct (measured 2026-10-23 on all 21 Button masters). Only a label that
      // is clearly MEANT to be centred (inside the host band, within one line of its centre) is judged. This lives in
      // `auditText`, not the shape pass: text has its own pass, so the same test in the board pass never ran.
      if (par) {
        // A label belongs to a control host under either its family prefix (`Button·…`) or a custom marketing name
        // (`CtaButton`, `PurchaseButton`): naming a hero control by hand must not put it outside the axis contract.
        const isCtlName = (nm) => {
          const n = String(nm || '');
          if (/·Spec(·|$)|-PageRoot$|-Header$|-Footer$/.test(n)) return false;
          // Matrix chrome (`head·Button`, `grid·IconButton`, `axis·Tabs`, `row·…`, `label·…`) is NOT a control:
          // the suffix test below reads its trailing family name and used to treat the sheet's title/axis copy as a
          // control label (measured 2026-10-26 after the block-page split: 11 false `label_off_axis` on Button·Spec,
          // 2 on IconButton·Spec, all on `head·`/`axis·`/`grid·` text). Chrome names are declared here, once.
          if (/^(head|grid|axis|row|label|slot|meta|foot|footer|cap|note|title|desc|tokens|stamp)(?:[·-]|$)/.test(n)) return false;
          if (n.indexOf('·') < 0 && /(?:Button|Cta|Toggle)$/.test(n)) return true;   // hand-named hero control
          return /^(Button|Tab|Chip|Checkbox|Radio|Switch)·/.test(n);
        };
        let owner = par, steps = 0;
        while (owner && owner !== st.top && steps < 3 && !(typeOf(owner) === 'board' && isCtlName(nameOf(owner)))) {
          owner = owner.parent || null; steps++;
        }
        if (owner && owner !== st.top && typeOf(owner) === 'board' && isCtlName(nameOf(owner))) {
          const ob = box(owner), dx = (r.x + r.w / 2) - (ob.x + ob.w / 2), dy = (r.y + r.h / 2) - (ob.y + ob.h / 2);
          const inside = r.x >= ob.x - 1 && r.y >= ob.y - 1 && r.x + r.w <= ob.x + ob.w + 1 && r.y + r.h <= ob.y + ob.h + 1;
          if (inside && Math.abs(dy) > 2 && Math.abs(dy) <= Math.max(12, fs)) {
            add('label_off_axis', t, st.top, 'label centre is ' + N(Math.abs(dy)) + 'px ' + (dy > 0 ? 'below' : 'above') +
              ' the axis of "' + nameOf(owner).slice(0, 34) + '" — centre it on the final host box (resolved leading = ratio × fontSize); repair: storage.centerLabels(page,{apply:true}) or CF.centerLabel(host)');
          }
          // Horizontal: only when the host has no lead element that legitimately offsets the label. A hero CTA whose
          // font was enlarged after birth keeps the pre-edit box: it reads 25-30px off-axis while every style token
          // and the vertical centre can still be correct (measured 2026-10-26 on CtaButton). Repaired by centerIn.
          // A LEAD IS NOT ALWAYS A GLYPH: an input chip's avatar (ellipse), a radio's disc, a dot/swatch/badge all
          // offset the label by design. The old path/`glyph·`/`icon·` test ignored ellipses and looked only at direct
          // children, so it reported every `Chip·Input·…Avatar` master and the new chip atom (whose ✕ lives inside
          // `row·content` → `icon·close`) as off-axis (measured 2026-10-26). Look two levels down.
          const isLead = (k) => typeOf(k) === 'path' || typeOf(k) === 'ellipse' ||
            /^(glyph|icon|avatar|dot|badge|swatch|indicator|lead|trail)(·|$)/.test(nameOf(k));
          const leadIn = (h, depth) => (kidsOf(h) || []).some((k) => isLead(k) || (depth > 0 && leadIn(k, depth - 1)));
          const iconSlot = /IconStart|IconEnd|Lead|Trail/.test(nameOf(owner)) || leadIn(owner, 2);
          if (inside && !iconSlot && Math.abs(dx) > 2) {
            add('label_off_axis', t, st.top, 'label centre is ' + N(Math.abs(dx)) + 'px ' + (dx > 0 ? 'right' : 'left') +
              ' of the axis of "' + nameOf(owner).slice(0, 34) + '" — a label is centred on BOTH axes of its host; repair: storage.centerLabels(page,{apply:true}) or CF.centerLabel(host)');
          }
        }
      }
      // §4.2 a swatch caption is a *claim about the paint beside it*. A token-bound plate follows the token while its
      // label keeps the hex authored at build time, so a board built before a theme overlay reads correct swatches
      // with stale captions — invisible to every other rule, because the text itself is well-formed. Scoped to the
      // wash/hue/ink grammar on purpose: that is the palette-documentation label and nothing else.
      const cap = /^(wash|hue|ink)\s+#([0-9a-f]{6})$/i.exec(txt.trim());
      if (cap && par) {
        const paints = [];
        // Array.from(par.children): the sibling set of the caption. Identity tests on shape proxies never hold, so the
        // caption itself is excluded by id below, not by ===.
        const tid = str(t, 'id', '');
        Array.from(par.children || []).forEach((k) => {
          // compare by id — every .children access returns a NEW proxy, so `k === t` is never true (api-pitfalls §7)
          if (str(k, 'id', '') === tid) return;
          const f = arr(k, 'fills');
          if (f.length && hexOK(f[0].fillColor)) paints.push(String(f[0].fillColor).toUpperCase());
        });
        if (paints.length === 1 && paints[0] !== '#' + cap[2].toUpperCase()) {
          add('caption_stale', t, st.top, '"' + txt.trim() + '" quotes ' + cap[2].toUpperCase() +
            ' but its swatch paints ' + paints[0] + ' — rebuild this board after the theme, or re-derive the caption from the plate');
        }
      }
      out.sizes[fs] = (out.sizes[fs] || 0) + 1;
      out.fonts[str(t, 'fontFamily', '?')] = (out.fonts[str(t, 'fontFamily', '?')] || 0) + 1;
      if (RAMP.indexOf(fs) >= 0) {
        // §3.2: 11px is legal only for a declared typographic role — the factory names those nodes (ctx.text({role})).
        // Reading the copy back is not decidable: "disabled" is an axis header, "Home" is navigation.
        // A `sample · <step>` node is the exception by construction: it is a type specimen (what `FN.typeRamp` draws),
        // its whole purpose is to render every declared step at its own size, and it is named after the token it shows.
        // Suppressing it is the point of that board; suppressing 11px copy in a screen is the point of this rule.
        if (fs === 11 && !/^sample · /.test(nameOf(t)) && !/(axis|overline|kbd)/.test(nameOf(t) + ' ' + chainName(t, st.top))) {
          add('off_ramp_size', t, st.top, '11px copy has no declared role (§3.2: axis/overline/kbd only) — raise it to 12: "' + txt.slice(0, 14) + '"');
        }
      } else {
        add('off_ramp_size', t, st.top, fs + 'px is not in the declared ramp (' + txt.slice(0, 14) + ')');
      }
      // §3.4 measure — only multi-line copy can read too wide
      const lines = Math.max(1, Math.round(r.h / Math.max(12, fs * 1.35)));
      if (r.w > CFG.measure && lines > 2 && !CHATRX.test(chainName(t, st.top))) {
        add('measure_overflow', t, st.top, 'w=' + N(r.w) + ' ≈ ' + lines + ' lines over the ' + CFG.measure + 'px measure');
      }
      const fl = arr(t, 'fills'); if (!fl.length || !hexOK(fl[0].fillColor)) return;
      const alpha = Math.max(0, Math.min(1, num(fl[0], 'fillOpacity', 1))) * Math.max(0, Math.min(1, num(t, 'opacity', 1)));
      // The state must be a NAME SEGMENT of an ancestor host (`Button·Disabled·Md`, the §4 grammar) — see inDisabledHost.
      if (inDisabledHost(t, st.top)) {           // disabled: owned by disabled_wrong, exempt from contrast
        if (alpha > CFG.alphaBand[1]) add('disabled_wrong', t, st.top, 'disabled label alpha ' + alpha.toFixed(2) +
          ' above the ' + CFG.alphaBand.join('–') + ' band (use ' + CF.STATE.disabledContent + ', not a brighter hex)');
        else if (alpha < CFG.alphaBand[0]) add('disabled_wrong', t, st.top, 'disabled label alpha ' + alpha.toFixed(2) +
          ' under the ' + CFG.alphaBand.join('–') + ' band (invisible copy is not a state)');
        return;
      }
      if (alpha < CFG.opaqueFill) return;      // state layers / placeholder washes are a different concern than legibility
      const bg = bgUnder(t, pageBg);
      const fg = mix(bg, toRGB(fl[0].fillColor), alpha);
      let want = fs >= CFG.largeText ? CFG.largeContrast : CFG.bodyContrast;
      if (isToneColor(fl[0].fillColor)) want = CFG.toneContrast;      // §4: status colour is double-encoded, so 3:1 applies
      const got = cr(fg, bg);
      if (got < want * CFG.contrastTol) add('contrast', t, st.top, charsOf(t).slice(0, 14) + ' ' + got.toFixed(2) + ':1 < ' + want + ':1 for ' + str(fl[0], 'fillColor', '?') + ' on ' + toHex(bg));
    }

    // ---- §1.3: what counts as focus evidence
    // A focus state is HARD (§1.1, WCAG 2.4.7), but its FORM is a family role: `CF.FOCUS` gives an atomic control a
    // 2px boundary that paints, and a COMPOSITION (step timeline, menu, table row, accordion header …) a boundary
    // authored at alpha 0 — a reserved slot a runtime raises — whose perceivable cue is the 12% brand state wash.
    // So the gate asks one question of a candidate layer: does it PAINT? A zero-alpha ring is never evidence (rule 44
    // judges it on its own), and a name match alone used to make an invisible box pass `focus_ring_missing`.
    const FOCUS_WASH = /(?:^|·)(wash|row|node|band|cell|item|tint|day|tile|segment|crumb|underline|boundary|bar|rail)·focus$/;
    function focusEvidence(sh) {
      const n = nameOf(sh);
      if (/^ring·/.test(n)) return arr(sh, 'strokes').some((k) => num(k, 'strokeOpacity', 1) >= 0.05 && num(k, 'strokeWidth', 1) >= 1);
      if (FOCUS_WASH.test(n)) return arr(sh, 'fills').some((k) => num(k, 'fillOpacity', 1) >= 0.05);
      return false;
    }

    // ---- shape rules
    // Coverage is counted from the host's NAME, which survives componentization: once G10 replaces a spec-matrix cell with
    // an instance, the instance still demonstrates that family's state/variant/size — only its internals belong to the
    // master. Counting only hand-drawn hosts made every componentized family read as `variant_sparse`.
    function noteFamily(board, fam, p, deep) {
      const nm = nameOf(board);
      const F = out.families[fam] || (out.families[fam] = { family: fam, hosts: 0, states: {}, variants: {},
        sizes: {}, sizesAny: false, icons: { lead: 0, trail: 0 }, focus: 0, rings: 0, thickBorder: 0, boards: {} });
      F.hosts++; F.boards[nm] = (F.boards[nm] || 0) + 1;
      const sn = p.state || 'default';
      F.states[sn] = (F.states[sn] || 0) + 1;
      F.variants[p.variant] = (F.variants[p.variant] || 0) + 1;
      if (p.size) { F.sizes[p.size] = (F.sizes[p.size] || 0) + 1; F.sizesAny = true; }
      if (/IconStart|Lead|icon·/.test(nm)) F.icons.lead++;
      if (/IconEnd|Trail|Clear/.test(nm)) F.icons.trail++;
      if (deep && p.state === 'focus') {
        F.focus++;
        const ds = []; const collect = (n3) => { (kidsOf(n3) || []).forEach((c) => { ds.push(c); if (rec(c)) collect(c); }); };
        collect(board);
        // §1.3: the evidence must PAINT. A `reserved` family authors its boundary at alpha 0 as a slot and carries the
        // 12% state wash as the cue, so counting a ghost ring here would let an invisible focus state pass rule 16.
        let hasRing = ds.some((d) => focusEvidence(d));
        // CF.ring() deliberately mounts the ring one level up when the host clips (a card, a modal): drawn inside, the
        // clipped host cuts the outer band and the focus state shows two line segments instead of a ring. That ring is
        // still the host's focus evidence, so look for a sibling anchored on the host's box before calling it missing.
        if (!hasRing && board.parent) {
          const br = box(board);
          hasRing = (kidsOf(board.parent) || []).some((c) => {
            if (!/^ring·/.test(nameOf(c)) || !focusEvidence(c)) return false;
            const cr = box(c);
            return Math.abs(cr.w - br.w - 4) <= 2 && Math.abs(cr.h - br.h - 4) <= 2 &&
              Math.abs((cr.x + cr.w / 2) - (br.x + br.w / 2)) <= 2 &&
              Math.abs((cr.y + cr.b / 2) - (br.y + br.b / 2)) <= 2;
          });
        }
        if (hasRing) F.rings++;
        else if (arr(board, 'strokes').some((sh) => num(sh, 'strokeWidth', 1) >= 2 && num(sh, 'strokeOpacity', 1) >= 0.05)) F.thickBorder++;
      }
    }
    function auditShape(s, par, st) {
      out.shapes++;
      const r = box(s), nm = nameOf(s), fam = famOf(s);
      const spec = isSpecBoard(s);
      const exempt = EXEMPT.test(nm) || isAnno(s);
      if (/[/\n]/.test(nm)) add('name_invalid', s, st.top, '"' + nm + '" contains an illegal / or newline');
      // Rule 43: a 1px line is not a layout device for separating content. The content gap comes from the spacing
      // ladder (space.md 12 / space.base 16) so it survives a refit; functional edges are named boundary·* and state
      // indicators underline·*, which are deliberately outside this rule.
      if (/^(divider|hairline)(·|$)/.test(nm)) {
        add('divider_separator', s, st.top, '"' + nm + '" is a 1px content separator — use a spacing-token gap '
          + '(space.md/space.base); name functional edges boundary·* and indicators underline·*');
      }
      // §4.3 an anatomy/recipe cell is a container the `after` pass fills with region plates. When a build times out and
      // the stray-heal mounts the bare board, the container survives with NOTHING inside — the board looks present in
      // every structural check and is empty on screen. Only a child count can see that, so it is checked by name.
      if (/^cell·(slot|recipe)·/.test(nm) && !(kidsOf(s) || []).length) {
        add('empty_cell', s, st.top, '"' + nm + '" has no children — its `after` pass never ran, so this block is a '
          + 'frame with no content; re-drive it with spec.replace=true (engines.md §6)');
      }
      // rule 40 · placeholder_media (gate G17) — a name that CLAIMS a raster slot plus no `fillImage` in the fills is a
      // gray plate standing in for the user's own photograph. Before the isText/board gates, because the shape that
      // holds media is a plain rect, not a control host, and `rec()` would have returned on it.
      if (SCREEN && !isCopy(s) && isMediaSlot(nm) && !arr(s, 'fills').some((f) => f && f.fillImage)) {
        add('placeholder_media', s, st.top, '"' + nm + '" claims a raster slot but no fill carries `fillImage` — import the source asset with MD.place({ parent, slot, path }) (scripts/media_engine.js); the icon-glyph plate this replaces is a placeholder, not the user\'s image');
      }
      // rules 50–54 · ELEVATION (gate G18). Physics is not decoration: a shadow is a token-bound multi-layer
      // stack, a card carries its inset pair, a declared sheen is drawn, and hover is a LIFT. Each of these
      // was absent from the file while every other rule read CLEAN (measured 2026-10-23).
      try {
        const shs = arr(s, 'shadows');
        let tokMap = {}; try { tokMap = s.tokens || {}; } catch (e) {}
        // A layout board must not clip a child's shadow. Penpot defaults clipContent=true; the engine now authors it
        // false, and this rule is the backstop for anything built before that fix (and for hand-drawn containers).
        if (shs.length) {
          let eL = 0, eT = 0, eR = 0, eB = 0;
          shs.forEach(function (sh) {
            const ox = Number(sh.offsetX || 0), oy = Number(sh.offsetY || 0);
            const bl = Number(sh.blur || 0), sp = Number(sh.spread || 0);
            eL = Math.max(eL, bl + sp - ox); eT = Math.max(eT, bl + sp - oy);
            eR = Math.max(eR, bl + sp + ox); eB = Math.max(eB, bl + sp + oy);
          });
          let p2 = s.parent, dep = 0, cut = null;
          while (p2 && dep++ < 16) {
            let cc = false, cw = 0, ch = 0;
            try { cc = !!p2.clipContent; cw = p2.width; ch = p2.height; } catch (e) {}
            if (cc && cw > 1 && ch > 1 && !/^clip·/.test(nameOf(p2))) {
              if (s.x - eL < p2.x - 1 || s.y - eT < p2.y - 1 ||
                  s.x + s.width + eR > p2.x + cw + 1 || s.y + s.height + eB > p2.y + ch + 1) { cut = p2; break; }
            }
            p2 = p2.parent;
          }
          if (cut) add('shadow_clipped', s, st.top, '"' + nm.slice(0, 40) + '" paints a shadow that is cut by the clipping ancestor "' + nameOf(cut).slice(0, 34) + '" (clipContent=true, ' + Math.round(cut.width) + '×' + Math.round(cut.height) + ') — a layout container must not crop a child shadow; repair: storage.unclip() or rebuild the container with clipContent=false');
        }
        if (SHADOW_TOKENS > 0 && shs.length && !tokMap.shadow) {
          add('shadow_unbound', s, st.top, '"' + nm.slice(0, 30) + '" paints ' + shs.length + ' shadow layer(s) with no `tokens.shadow` binding — the stack was typed, not taken from the elevation record. Repair: EL.sweepPage({ page, apply: true })');
        }
        if (HAS_EL) {
          const stamp = storage.EL.readStamp(s);
          if (stamp) {
            const rec = storage.EL.recipe(stamp);
            if (rec) {
              if (shs.length < rec.layers.length) add('elevation_flat', s, st.top, 'stamp `nl:el=' + stamp + '` wants ' + rec.layers.length + ' layer(s), the shape paints ' + shs.length + ' — the stack collapsed. Repair: EL.apply(shape, \'' + stamp + '\')');
              if (rec.inner.length && !shs.some((x) => x.style === 'inner-shadow')) add('edge_missing', s, st.top, 'recipe "' + stamp + '" declares ' + rec.inner.length + ' INNER layer(s) (the dark lip / top highlight) but the shape paints drop shadows only — the object loses its material');
              // a component COPY cannot be authored (adding a child to it is not a legal write); its master carries
              // the sheen. The copy still paints the drop+inset stack, which is what the eye reads as material.
              if (rec.sheen && !isCopy(s) && !(kidsOf(s) || []).some((k) => /^sheen·/.test(nameOf(k)))) add('sheen_missing', s, st.top, 'recipe "' + stamp + '" declares a radial sheen and the host has no `sheen·*` plate — the top-light that sells the material is absent. Repair: EL.sheenFor(host, \'' + stamp + '\')');
            }
          }
          if (typeOf(s) === 'board' && /·(Hover|Pressed)(·|$)/.test(nm) && !shs.length) {
            const role = storage.EL.roleFor ? storage.EL.roleFor(nm, nm.split('·')[0]) : null;
            if (role) add('hover_flat', s, st.top, '"' + nm + '" is a ' + (String(nm).indexOf('·Pressed') >= 0 ? 'Pressed' : 'Hover') + ' state with 0 shadows while its family declares "' + role + '" — the state was modelled as a fill tint, not the source\'s elevation ' + (String(nm).indexOf('·Pressed') >= 0 ? 'press-down' : 'lift') + '. Repair: EL.sweepPage');
          }
          // The stamp must agree with the NAME's current role. A type-specific material (secondary → chip) introduced
          // after a cell was built left the stale `control` stamp and its 9-layer dark stack in place, and the layer
          // count matched its own stamp, so every G18 rule read CLEAN (measured 2026-10-23). Judge only CONTROL families:
          // a chrome shape named `nav·settings` is an icon button that legitimately carries `control`, and the `Nav`
          // surface role is not the role of that 48×48 control (measured 2026-10-23 on page 15).
          if (storage.EL.roleFor && /^(Button|IconButton|Fab|Chip|Badge)·/.test(nm)) {
            const want = storage.EL.roleFor(nm, String(nm).split('·')[0]);
            const have = storage.EL.readStamp(s);
            if (want && have && want !== have) add('elevation_flat', s, st.top, '"' + nm.slice(0, 40) + '" is stamped "' + have + '" but its family/type resolves to "' + want + '" — the material was not re-derived after the role changed. Repair: EL.sweepPage');
          }
        }
      } catch (e) { err('elevation', e); }
      // rule 49 · list_gap_split — repeated labels in one host share ONE rhythm. A wider gap is legal only when
      // something is DRAWN in it (a group label, a boundary line); an empty wider gap is what the owner reads as
      // "the padding is uneven" once rule 43 has removed the line that used to justify it.
      // TWO DISCIPLINES KEEP THIS FROM INDICTING A LEGITIMATE HOST (both measured 2026-10-22):
      //  · copy is read ONE LEVEL DEEP, because `groupAssemblies` wraps a hovered/selected row's label in a `row·`
      //    group: reading direct children only made that row invisible and reported a 3-row host as 2 gaps.
      //  · an outlier needs an ESTABLISHED PITCH — the smallest gap must repeat (≥2 rows at it). A host whose gaps
      //    are all different has no rhythm to break: that is an Accordion (header→body 26, body→header 39, 40) or a
      //    Popover (title→body 2, body→edge 0), where a "wider gap" is a different RELATIONSHIP, not a missing row.
      if (typeOf(s) === 'board' && /·/.test(nm) && !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^Root |^(fold|region)·/.test(nm) && !isAnno(s)) {
        const kidsS = kidsOf(s) || [];
        const flat = [];
        kidsS.forEach((k) => { flat.push(k); (kidsOf(k) || []).forEach((c) => flat.push(c)); });
        const labels = flat.filter((k) => isText(k) && box(k).h > 0).sort((a, b) => box(a).y - box(b).y);
        const sameRow = (a, b) => Math.abs(box(a).h - box(b).h) <= 1 && Math.abs(box(a).x - box(b).x) <= 1;
        // the run of consecutive labels that are siblings in the same column (a menu's items, a list's rows)
        const run = [];
        labels.forEach((k) => { if (!run.length || sameRow(run[run.length - 1], k)) run.push(k); });
        if (run.length >= 3) {
          const gaps = [];
          for (let i3 = 1; i3 < run.length; i3++) gaps.push({ i: i3, v: box(run[i3]).y - box(run[i3 - 1]).b });
          const lo = Math.min.apply(null, gaps.map((g) => g.v));
          const repeats = gaps.filter((g) => Math.abs(g.v - lo) <= 1).length;
          const bad = repeats >= 2 ? gaps.filter((g) => g.v > lo + 1).find((g) => {
            const from = box(run[g.i - 1]).b, to = box(run[g.i]).y;
            // anything painted between the two labels marks the break
            return !flat.some((k) => { const q = box(k); return q.h > 0 && q.y >= from - 1 && q.b <= to + 1 &&
              !(q.y === box(run[g.i - 1]).y && q.h === box(run[g.i - 1]).h) && !(q.y === box(run[g.i]).y && q.h === box(run[g.i]).h); });
          }) : null;
          if (bad) add('list_gap_split', s, st.top, 'label gaps ' + gaps.map((g) => N(g.v)).join('/') + ' — ' + repeats +
            ' rows sit at ' + N(lo) + 'px but one carries nothing in its ' + N(bad.v - lo) +
            'px of extra space: mark the break (a group label, a `boundary·*` line) or give it no space (§2.1)');
        }
      }
      // rule 48 · overlay_in_flow — an overlay that takes part in the flow is a second content block, not a veil.
      // NOTE: judged on the plate's OWN name, not `isAnno(s)` — that helper also reads the ancestor chain, and an
      // overlay lives inside a `region·…` pane, so using it here would blind the rule to exactly its whole target class.
      if (/^(scrim|overlay|veil|wash·|ring·|hitpad·)/.test(nm) && par && !ANNO.test(nm)) {
        let pflex = false, abs = true;
        try { pflex = !!(par.flex && String(par.flex.dir) !== 'none'); } catch (e) {}
        try { abs = !!(s.layoutChild && s.layoutChild.absolute); } catch (e) {}
        if (pflex && !abs) add('overlay_in_flow', s, st.top, '"' + nm.slice(0, 26) + '" is a ' + N(r.w) + '\u00d7' + N(r.h) +
          ' overlay laid OUT inside "' + nameOf(par).slice(0, 22) + '" instead of covering it — it consumes ' +
          N(r.h) + 'px of the slot its sibling was authored to fill');
      }
      // rule 47 · media_stretched (M8) — an image fill is being stretched instead of cropped. Judged on the
      // ASSET's own numbers, which the fill record carries, so no registry read is needed.
      const imFill = arr(s, 'fills').find((f) => f && f.fillImage && f.fillImage.width && f.fillImage.height);
      if (imFill && r.h > 0) {
        const ia = imFill.fillImage.width / imFill.fillImage.height;
        const d = Math.abs((r.w / r.h) / ia - 1) * 100;
        if (d > 2) add('media_stretched', s, st.top, imFill.fillImage.name + ' ' + imFill.fillImage.width + '\u00d7' +
          imFill.fillImage.height + ' painted into ' + N(r.w) + '\u00d7' + N(r.h) + ' \u2014 ' + N(d) +
          '% off the asset ratio: place it with MD.place({mode:"cover"}) (a clip\u00b7 mask) or "fit"');
      }
      if (isText(s)) { auditText(s, st, par); return; }

      // level 1 (composed layout only): grid + radius nesting
      const compos = !st.inCf && !st.inSpec;
      // imported SVG interiors (createShapeFromSvg → groups named svg/… with svg-* children) are vector geometry:
      // their sizes/positions come from the drawing, not from authored coordinates — judging them on the 4px grid is noise.
      const inImported = par && typeOf(par) === 'group' && (/^(svg|base-background)/.test(nm) || /^svg/.test(nameOf(par)));
      // A child of a **native grid-layout board** is placed by the platform: a 12-track grid at margin 32 / gutter 24
      // gives a 94px column, so judging its x/w on the 4px grid blames the designer for a division they did not type.
      // Same reasoning as the imported-SVG exemption above.
      const inGrid = (function () { try { return !!(par && par.grid && par.grid.columns && Array.from(par.grid.columns).length); } catch (e) { return false; } })();
      // Same class of exemption for **flex centering**: a child of a flow board whose parent centers on an axis gets
      // that offset from `padT + Σh + (n−1)·gap` math, not from a typed coordinate. A 44px caption centered in a 64px
      // row sits at y=10 — the 4px grid is unreachable there by construction (measured 2026-10-21 on the FN `Grid`
      // board). Judging it would demand that nobody ever center-aligns, so the axis the parent owns is skipped.
      const fxc = (par && par.flex) || null;
      const centered = function (axis) {
        if (!fxc) return false;
        try {
          const mainIsX = String(fxc.dir || 'column') === 'row';
          const isMainAxis = (axis === 'x') === mainIsX;
          const v = isMainAxis ? fxc.justifyContent : fxc.alignItems;
          return String(v) === 'center';
        } catch (e) { return false; }
      };
      if (compos && !exempt && !inImported && !inGrid && (isPlate(s) || typeOf(s) === 'board')) {
        const pr = par ? box(par) : { x: 0, y: 0 };
        const axes = [];
        // §1 binds what the designer **typed**. In a flow board the typed numbers are the padding, the gap and the
        // sizing declaration — the resulting coordinates and hug boxes are arithmetic over font metrics (a 13px label
        // is 19 tall at leading 1.4), so `y=54` or `h=99` cannot be fixed by anyone who did not also change the font.
        // Measured 2026-10-21 on the FN `Palette` board: every finding on that board was of this kind, while the actual
        // defect (a hug frame frozen at 6px under 68px of text) is invisible to this rule and is caught by
        // `NL.auditFlow`'s `hug_frozen` instead. Absolute children are still judged: their x/y IS typed.
        const flowChild = !!fxc && !(function () { try { return !!(s.layoutChild && s.layoutChild.absolute); } catch (e) { return true; } })();
        // A board the Foundations shelf pinned is positioned by `previous bottom + declared gap`, and a hug bottom is a
        // font-metric sum — the coordinate is derived, the gap is the decision (`off_scale_gap` judges that instead).
        // Read the durable `nl:shelf` stamp first: `NL._meta` is JS memory and is gone the moment the session re-seeds,
        // which would make an FN-projected board fail `off_grid` for a defect nobody introduced.
        const shelfPlaced = (function () {
          try { if (typeOf(s) === 'board') { const d = storage.NL && storage.NL.readStamp && storage.NL.readStamp(s); if (d && d.shelf) return true; } } catch (e) {}
          try { return !!(storage.NL && storage.NL._meta && storage.NL._meta(s) && storage.NL._meta(s).shelfPlaced); } catch (e) { return false; }
        })();
        const hugW = (function () { try { return String(s.horizontalSizing) === 'auto'; } catch (e) { return false; } })();
        const hugH = (function () { try { return String(s.verticalSizing) === 'auto'; } catch (e) { return false; } })();
        // M8: inside a `clip·` crop, EVERYTHING is derived arithmetic — the painted media is the slot scaled by
        // `max(slotW/imgW, slotH/imgH)` and centred, so its size and offset are fractions of an aspect ratio
        // (measured: `img·hero-media-0` 1235×700 at x −383 inside a 468×700 mask). §1 binds the numbers the designer
        // typed; the mask's own box is one of those, the crop inside it is not.
        const inCrop = (function () { try { return /^clip·/.test(nameOf(par)) || !!(par && par.clipContent); } catch (e) { return false; } })();
        if (!inCrop) {
          if (isPlate(s) || !fam) {                                  // a CF control host's own size is ladder- or content-derived
            // A device viewport (375, 834) is a hardware fact, not a coordinate the designer chose — §1 does not bind it.
            const devw = [LY.TIERS.web.w, LY.TIERS.pad.w, LY.TIERS.mobile.w];
            if (!hugW && r.w > CFG.hairline && devw.indexOf(N(r.w)) < 0 && Math.abs(LY.snap(r.w) - r.w) > 0.5) axes.push('w=' + N(r.w));   // epsilon: penpot.group bbox math leaves 1e-13 residue
            if (!hugH && r.h > CFG.hairline && Math.abs(LY.snap(r.h) - r.h) > 0.5) axes.push('h=' + N(r.h));
          }
          if (r.w > CFG.hairline && r.h > CFG.hairline && !flowChild && !shelfPlaced) {
            if (!centered('x') && Math.abs(LY.snap(r.x - pr.x) - (r.x - pr.x)) > 0.5) axes.push('x=' + N(r.x - pr.x));
            if (!centered('y') && Math.abs(LY.snap(r.y - pr.y) - (r.y - pr.y)) > 0.5) axes.push('y=' + N(r.y - pr.y));
          }
        }
        if (axes.length) add('off_grid', s, st.top, axes.join(' ') + ' off the 4px grid');
      }
      if (compos && par && !exempt && !isText(s)) {
        const rad = radiusOf(s);
        if (rad >= 2 && rad < 100) {
          const prad = radiusOf(par), pr = box(par);
          const inset = Math.min(r.x - pr.x, r.y - pr.y, pr.r - r.r, pr.b - r.b);
          // §5.1 formula binds only where the inset is *inside* the outer radius (r16 card + r12 chip at pad 24 is legal)
          if (prad > 0 && inset >= 0 && inset <= prad && rad > prad - inset + 0.5) {
            add('radius_nesting', s, st.top, 'r' + N(rad) + ' inside r' + N(prad) + ' at inset ' + N(inset) + ' (max ' + N(prad - inset) + ')');
          }
        }
      }
      // rule 37 · ring_off_host — `CF.ROLE.ring = 'host'`: a ring is the control's derived outline, so its corner IS the
      // control's corner. Measured 2026-10-22 on `Button·Primary·MD·Focus·Pill` — the body carried `r0` and the ring
      // `r9999`, and 194 of the file's 230 rings disagreed with their host. Both numbers sit on the ladder and both are
      // token-bound, so rules 35/36 pass it; only comparing the pair can see the defect the eye sees.
      if (/^ring·/.test(nm) && !isAnno(s) && par) {
        // The relation is resolved ONCE, by geometry, in `TK.ringHost` — the auditor and the repairer must not own two
        // tables (api-pitfalls §16). Degraded inline copy for the case where the token engine is not seeded: the same
        // three questions — which control owns me, do I trace a plate, am I inside my control.
        const host = (function () {
          if (storage.TK && typeof storage.TK.ringHost === 'function') {
            try { return storage.TK.ringHost(s) || {}; } catch (e) {}
          }
          const rb = box(s), cx = rb.x + rb.w / 2, cy = rb.y + rb.h / 2;
          const isCtl = function (k) { return typeOf(k) === 'board' && /·/.test(nameOf(k)) &&
            !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^Root /.test(nameOf(k)); };
          const isOwn = function (k) { return typeOf(k) !== 'svg' && !/^(ring·|hairline·|guide·|axis|Group$)/.test(nameOf(k)); };
          let control = null, a = par, gd = 0;
          while (a && gd < 4) { if (isCtl(a)) { control = a; break; } try { a = a.parent; } catch (e) { a = null; } gd++; }
          if (!control) return { host: null, concentric: false, floating: true, contained: false };
          const cb = box(control);
          // a row ring overhangs its control by its own margin, so containment is judged on the expanded box (TK.ringHost)
          const contained = rb.x >= cb.x - 12 && rb.y >= cb.y - 12 && rb.x + rb.w <= cb.x + cb.w + 12 && rb.y + rb.h <= cb.y + cb.h + 12 &&
            cx >= cb.x && cx <= cb.x + cb.w && cy >= cb.y && cy <= cb.y + cb.h;
          let best = null, bestV = Infinity, bestA = Infinity;
          (function scan(k, d) {
            if (k !== s && isOwn(k)) {
              const kb = box(k);
              if (kb.w > 0 && kb.h > 0) {
                const v = Math.abs(cx - (kb.x + kb.w / 2)) + Math.abs(cy - (kb.y + kb.h / 2));
                const ox = (rb.w - kb.w) / 2, oy = (rb.h - kb.h) / 2;
                const ar = kb.w * kb.h;
                // A ring whose centre is 4–6px off a same-size plate is an OFF-CENTRE ring, not a ring around some
                // other band. The old v≤3 owner match missed it and the fallback read "no plate here", so a ring
                // 4px left of its button passed CLEAN (measured 2026-10-23). Own it within 6px, then judge centre.
                if (v <= 6 && ox >= -0.01 && oy >= -0.01 && ox <= 12 && oy <= 12 && (v < bestV - 0.5 || (Math.abs(v - bestV) <= 0.5 && ar < bestA))) { best = k; bestV = v; bestA = ar; }
              }
            }
            if (d >= 4) return;
            (kidsOf(k) || []).forEach(function (c) { scan(c, d + 1); });
          })(control, 0);
          return { host: best, concentric: !!best && bestV <= 1, offBy: best ? bestV : null, floating: false, contained: contained, dist: best ? bestV : null };
        })();
        const rh = host.host;
        // A checkbox is a small VISIBLE box: its focus ring is flush on that box. An outset 22×22 halo around an
        // 18×18 r4 box is not parallel at the corners and reads as a border with a gap (measured 2026-10-23).
        const ctlNm = nameOf(host.control || par);
        if (/^Checkbox(?:·|$)/.test(ctlNm) && rh && (box(s).w > box(rh).w + 1 || box(s).h > box(rh).h + 1)) {
          add('ring_off_host', s, st.top, 'checkbox focus ring ' + N(box(s).w) + '×' + N(box(s).h) + ' is outset around its ' + N(box(rh).w) + '×' + N(box(rh).h) + ' box — a small control ring is flush (offset 0, box corner); an outset ring leaves a corner gap');
        }
        // rule 44 · focus_invisible — §1.3: a `reserved` family's boundary is authored at alpha 0 (the slot a runtime
        // raises) and the eye reads the unit's state wash instead. Drop the wash and the focus state is invisible while
        // every name-based check still passes, so a ghost boundary is judged HERE, next to the geometry it belongs to.
        const ghost = !arr(s, 'strokes').some((k) => num(k, 'strokeOpacity', 1) >= 0.05);
        if (ghost) {
          const ctl = host.control || par;
          let wash = null;
          (function scanW(k, d) {
            (kidsOf(k) || []).forEach((c) => {
              if (wash) return;
              if (focusEvidence(c)) { wash = c; return; }
              if (d < 3) scanW(c, d + 1);
            });
          })(ctl, 0);
          if (!wash) {
            add('focus_invisible', s, st.top, 'boundary at alpha 0 on "' + nameOf(ctl).slice(0, 30) +
              '" with no visible focus layer (wash·focus / row·focus / …) inside it — an invisible focus state is not a focus state');
          }
        }
        if (host.floating) {
          // rule 38 · ring_detached — the plate is mounted on the CONTAINER board, not inside a control. `ctx.ring` can
          // only produce this when the ring was drawn before a refit moved its host: the outline keeps its old box while
          // the control it belongs to moves away, and no rule could see it before, because the old host lookup handed
          // rule 37 the `Family·Spec` shelf itself (corners 0) and a floating plate read CLEAN (measured 2026-10-22:
          // `Search·Spec`, `MaskedInput·Spec` 244×36 whose `field` owner is 16px above it, `Card·Spec` drifted 72px).
          add('ring_detached', s, st.top, 'ring ' + N(box(s).w) + '×' + N(box(s).h) + ' at ' + N(box(s).x) + ',' + N(box(s).y) +
            ' lies on the container board instead of inside its control' + (rh ? ' (its size matches "' + nameOf(rh).slice(0, 26) + '" ' + N(host.dist) + 'px away)' : ' and matches no plate') +
            ' — repair with TK.ringSweep');
        } else if (!rh) {
          // A ring inside a list-like control (one row of a Tree / Accordion / anchor rail / crumb list) outlines a band
          // that has no plate of its own. Judged by containment: it must still sit inside its control.
          if (!host.contained) {
            add('ring_detached', s, st.top, 'ring ' + N(box(s).w) + '×' + N(box(s).h) + ' inside "' + nameOf(host.control || par).slice(0, 26) +
              '" traces no plate and is not contained by it (nearest ' + (host.dist === null || host.dist === Infinity ? 'none' : N(host.dist) + 'px off') +
              ') — repair with TK.ringSweep');
          }
        } else if (host.offBy !== null && host.offBy > 1) {
          // 37 · off-centre — a ring is DERIVED from its owner: same centre is the whole contract. A ring refit that
          // read a stale host box lands 2–6px off, which the eye sees as "the border is not around the button".
          add('ring_off_host', s, st.top, 'ring ' + N(box(s).w) + '×' + N(box(s).h) + ' is ' + N(host.offBy) +
            'px off the centre of "' + nameOf(rh).slice(0, 30) + '" — a ring takes its host box exactly (repair: TK.ringSweep)');
        } else if (host.concentric) {
          // A circle gets a CIRCLE. The corner test below cannot see an ellipse owner (it has no borderRadius), so a
          // 24×28 ring around a 20×20 Radio passed every gate while reading as "what is this focusing?". Margins on the
          // two axes must agree within 1px; repair is TK.ringSweep (it refits to the smaller measured margin).
          if (typeOf(rh) === 'ellipse') {
            const ob = box(rh), sb = box(s);
            const mx = (sb.w - ob.w) / 2, my = (sb.h - ob.h) / 2;
            if (Math.abs(mx - my) > 1) {
              add('ring_off_host', s, st.top, 'ring ' + N(sb.w) + '×' + N(sb.h) + ' is oval around the circular unit "' + nameOf(rh).slice(0, 30) +
                '" (' + N(ob.w) + '×' + N(ob.h) + '), margins ' + N(mx) + '/' + N(my) + ' — repair: TK.ringSweep');
            }
            // A CIRCLE GETS A CIRCLE. Equal margins around a round owner are not enough when the outline itself is a
            // rectangle with a small corner: measured 2026-10-26 on the selected `Radio·Focus·Checked` ring — 24×24
            // r0 around a 20px disc, margins 2/2, so the old ellipse test passed and no rule compared the SHAPE.
            const sc = typeOf(s) === 'ellipse' ? null : cornersOf(s);
            const rmax = sc ? Math.max.apply(null, sc) : (typeOf(s) === 'ellipse' ? null : 0);
            const need = Math.min(sb.w, sb.h) / 2 - 1;
            if (rmax !== null && rmax < need) {
              add('ring_off_host', s, st.top, 'ring ' + N(sb.w) + '×' + N(sb.h) + ' r' + N(rmax) +
                ' is a rectangular outline around the circular unit "' + nameOf(rh).slice(0, 30) + '" (' + N(ob.w) + '×' + N(ob.h) +
                ') — a circle gets a circle (repair: TK.ringSweep)');
            }
          } else {
            // A ring takes its owner's corner whether the owner is a control BOARD or a nested plate (a field, an OTP
            // digit, a Slider handle). Restricting the comparison to boards left every nested owner ungated.
            const rc = cornersOf(s), hc = cornersOf(rh);
            const rv = rc ? Math.max.apply(null, rc) : null, hv = hc ? Math.max.apply(null, hc) : null;
            if (rv !== null && hv !== null && rv !== hv) {
              add('ring_off_host', s, st.top, 'ring r' + N(rv) + ' around "' + nameOf(rh).slice(0, 30) + '" r' + N(hv) +
                ' — a ring takes its host corner (repair: TK.ringSweep)');
            }
          }
        } else {
          add('ring_detached', s, st.top, 'ring ' + N(box(s).w) + '×' + N(box(s).h) + ' off host "' + nameOf(rh).slice(0, 30) +
            '" by ' + N(host.dist) + 'px — a drifted plate, not a corner disagreement (repair: TK.ringSweep)');
        }
      }
      // rule 74 · overlay_clipped — a badge is an overlay: it must read as a COMPLETE shape, so the host cannot clip it.
      if (typeOf(s) === 'board' && !isAnno(s)) {
        let clips = false;
        try { clips = !!s.clipContent; } catch (e) { clips = false; }
        if (clips) {
          (kidsOf(s) || []).forEach((k) => {
            if (!/^(presence|badge|status|dot·|indicator)/.test(nameOf(k))) return;
            const kb = box(k), sb = box(s);
            const out = kb.x < sb.x - 1 || kb.y < sb.y - 1 || kb.x + kb.w > sb.x + sb.w + 1 || kb.y + kb.h > sb.y + sb.h + 1;
            add('overlay_clipped', k, st.top, '"' + nameOf(k).slice(0, 22) + '" is an overlay on a clipping host "' + nameOf(s).slice(0, 24) +
              '" — the clip trims it against the rounded silhouette' + (out ? ' (and its box already reaches the host edge)' : '') +
              '; the host must not clip its own badge (repair: clip a `clip·` content wrapper instead)');
          });
        }
      }
      // rule 73 · flush_corner_split — a square plate that occupies a CORNER of a rounded, unclipped host cuts the
      // host's silhouette. The judge is geometry (flush on one X edge AND one Y edge), not a family list, so it covers
      // any composite: segments, accent bars, tabs. Rule 63 covers the field family only and rule 37 only compares a
      // ring, which is why a pill ButtonGroup full of square segments read CLEAN.
      if (typeOf(s) === 'board' && !isAnno(s)) {
        let hr = 0, clipped = false;
        try { hr = Number(typeof s.borderRadius === 'number' ? s.borderRadius : 0) || 0; } catch (e) { hr = 0; }
        try { clipped = !!s.clipContent; } catch (e) { clipped = false; }
        if (hr > 0 && !clipped) {
          const hb = box(s);
          const DECOR_PLATE = /^(ring·|hitpad·|wash·|sheen·|clip·|boundary·|hairline·|state·layer|surface·|scrim|glow)/;
          (kidsOf(s) || []).forEach((k) => {
            if (typeOf(k) !== 'rectangle' || DECOR_PLATE.test(nameOf(k))) return;
            // read the FOUR corners: with per-corner radii the scalar `borderRadius` readback is 0 (Penpot only
            // reports the shorthand when every corner agrees), so a correctly rounded end segment looked square.
            let kr = 0;
            try {
              kr = Math.max(Number(k.borderRadiusTopLeft) || 0, Number(k.borderRadiusTopRight) || 0,
                            Number(k.borderRadiusBottomRight) || 0, Number(k.borderRadiusBottomLeft) || 0);
              if (!kr) kr = Number(typeof k.borderRadius === 'number' ? k.borderRadius : 0) || 0;
            } catch (e) { kr = 0; }
            if (kr > 0) return;
            const kb = box(k);
            const fl = Math.abs(kb.x - hb.x) <= 1, fr = Math.abs(hb.x + hb.w - (kb.x + kb.w)) <= 1;
            const ft = Math.abs(kb.y - hb.y) <= 1, fb = Math.abs(hb.y + hb.h - (kb.y + kb.h)) <= 1;
            if (!((fl || fr) && (ft || fb))) return;
            const sides = [(fl ? 'left' : 'right'), (ft ? 'top' : 'bottom')].join('+');
            // A 1–6px INDICATOR (progress meter, accent line) IS EXEMPT. It reads as the card's OWN EDGE when it spans
            // the edge — that is the "fused with the rounded corner" look the user asked for — and every alternative
            // breaks it: inset reads detached, rounding a 3px bar is a no-op, and a clip wrapper detached the plates
            // from their absolute coordinates on the next shelf move (all measured 2026-10-26 on `Toast·Dark·Timed·Info`).
            if (Math.min(kb.w, kb.h) <= 6) return;
            add('flush_corner_split', k, st.top, '"' + nameOf(k).slice(0, 24) + '" is square (r0) but sits in the ' + sides +
              ' corner of the r' + N(hr) + ' "' + nameOf(s).slice(0, 26) + '" and the host does not clip — the plate\'s square corners cut the rounded silhouette; give it the host corner on the touching sides (per-corner radius), or stop authoring the host as a clip-free rounded plate');
          });
        }
      }
      // rule 63 · control_corner_split — §5.1 "one control, one corner". A field's variants change the MATERIAL
      // (fill/stroke), never the geometry, and every layer derived from the field — focus ring, disabled overlay,
      // add-ons, attached steppers — takes the field's corner. Measured 2026-10-26 on `05 · Forms II`: the Borderless
      // TimePicker's `field` was r0 while its `ring·focus`, `disabled-overlay` and steppers were r9999; the eye reads
      // that as two components wearing one element. Rules 35/36 pass it (both corners are ladder values and both are
      // bound) and rule 37 only compares a ring to a BOARD host, so the mixture had no gate. The unit is the `field`
      // plate's HOST: popup surfaces (panel/row/option), chips, carets, divider lines and glyphs have their own policy
      // and are not frame parts. One finding per offending part, naming both values.
      if (nm === 'field' && !isAnno(s) && par) {
        const FRAME = /^(field|addon·|addon$|stepper$|disabled-overlay$|ring·)/;
        const parts = (kidsOf(par) || []).filter((k) => FRAME.test(nameOf(k)) && !isAnno(k));
        const vals = [];
        parts.forEach((k) => { const c = cornersOf(k); if (c) vals.push({ k: k, v: Math.max.apply(null, c) }); });
        const ref = vals.length ? Math.max.apply(null, vals.map((x) => x.v)) : 0;
        if (ref > 0) {
          vals.forEach((x) => {
            if (x.v === ref) return;
            add('control_corner_split', x.k, st.top, nameOf(x.k) + ' r' + N(x.v) + ' beside the control corner r' + N(ref) +
              ' — field, ring, disabled overlay, add-ons and steppers share ONE corner (§5.1; repair: storage.unifyCorners)');
          });
        }
      }
      // rule 64 · axis_column_off — a matrix sheet's state row NAMES its columns, one axis per column, and each label
      // must sit on the column whose cells it names. Measured 2026-10-26: every grid matrix built by `CF.matrix` had
      // its whole state row one column left (axis cells 1..n while the slots held 2..n+1) because the axis texts
      // entered the grid as ABSOLUTE children — the platform ignored (row,col) and auto-placed them from the first
      // free cell. The eye reads "default" over the row-label gutter and the last state without a label. Geometry is
      // the judge (flush-left or centred on the column); the grid cell is reported with it when they disagree.
      // Repair: `storage.repairAxisRow`.
      if (/^grid·/.test(nm) && !isAnno(s)) {
        const kidsG = kidsOf(s) || [];
        const ax = kidsG.filter((k) => /^axis/.test(nameOf(k)) && typeOf(k) === 'text');
        const slotsG = kidsG.filter((k) => /^slot·/.test(nameOf(k)) && k.layoutCell);
        if (ax.length >= 1 && slotsG.length) {
          const cellKey = (r, c) => r + ':' + c;
          const slotAt = {}, capAt = {};
          slotsG.forEach((sl) => { slotAt[cellKey(sl.layoutCell.row, sl.layoutCell.column)] = sl; });
          ax.forEach((t) => { if (t.layoutCell) capAt[cellKey(t.layoutCell.row, t.layoutCell.column)] = t; });
          // A slot is named by the NEAREST caption above it in its own grid column: one axis row serves every variant
          // row on a classic sheet, while a grouped sheet repeats the caption row per state group. Judged by cell, not
          // by sorted index, so both shapes are held to the same pairing.
          const capsInCol = {};
          ax.forEach((t) => {
            const c = t.layoutCell; if (!c) return;
            (capsInCol[c.column] || (capsInCol[c.column] = [])).push(t);
          });
          slotsG.forEach((sl) => {
            const c = sl.layoutCell;
            const above = (capsInCol[c.column] || []).filter((t) => t.layoutCell.row < c.row)
              .sort((a, b) => b.layoutCell.row - a.layoutCell.row)[0];
            if (!above) {
              add('axis_column_off', sl, st.top, 'slot "' + nameOf(sl).slice(0, 26) + '" in grid cell ' + c.row + '/' + c.column +
                ' has no state caption above it in its own column — every data cell is named by the label over it');
              return;
            }
            const tb = box(above), sb = box(sl);
            const flush = Math.abs(tb.x - sb.x) <= 2;
            const centred = Math.abs((tb.x + tb.w / 2) - (sb.x + sb.w / 2)) <= 2;
            if (!flush && !centred) {
              add('axis_column_off', above, st.top, 'axis "' + String(above.characters || '').slice(0, 18) + '" at x' + N(tb.x) + ' is ' + N(Math.abs(tb.x - sb.x)) +
                'px off its column "' + nameOf(sl).slice(0, 26) + '" (x' + N(sb.x) + ') — a state label sits on the column it names (repair: storage.repairAxisRow)');
            }
          });
          ax.forEach((t) => {
            const c = t.layoutCell;
            if (!c) { add('axis_column_off', t, st.top, 'axis "' + String(t.characters || '').slice(0, 18) + '" is not in a grid cell — it cannot name a column'); return; }
            if (!slotAt[cellKey(c.row + 1, c.column)]) {
              add('axis_column_off', t, st.top, 'axis "' + String(t.characters || '').slice(0, 18) + '" at cell ' + c.row + '/' + c.column + ' names no data cell below it (' + (c.row + 1) + '/' + c.column + ')');
            }
          });
        }
      }
      // rule 65 · nested_control_raw — a composite COMPOSES the atom. A `chip`/`pill`/`tag` plate inside a registered
      // control must be a real copy of the atom family (Chip), not a redrawn rectangle whose label and ✕ are loose
      // siblings: that construction cannot be themed, swapped or fixed from the library (measured 2026-10-26 on the
      // selected `MultiSelect·Outlined·MD` master). A copy answers `isComponentCopyInstance`; a raw child inside a
      // master does not (it answers the parent's main-instance flags, so those cannot be used here).
      if (/^(chip|pill|tag)(?:·|$)/.test(nm) && par && !isAnno(s) && storage.CF && storage.CF.get) {
        const pn = nameOf(par);
        if (storage.CF.get(pn)) {
          let isCopy = false; try { isCopy = !!(s.isComponentCopyInstance && s.isComponentCopyInstance()); } catch (e) {}
          if (!isCopy && !storage.CF.get(nm)) {
            add('nested_control_raw', s, st.top, '"' + nm + '" inside registered composite "' + pn.slice(0, 28) +
              '" is a raw ' + typeOf(s) + ' plate — the inner pill must be a real Chip/Button component copy (repair: storage.repairChips)');
          }
        }
      }
      // rule 66 · chip_row_off_axis — the tag block is centred on the FIELD, not on a stale pitch. The old CF.multiSelect
      // formula counted a trailing gap (`rowsN*(chipH+4)`), so a 24px tag row sat at top 4 / bottom 8 in a 36px field
      // (the user's “上少下多”). Only the block's vertical centre is judged; the left inset is padding, not centring.
      if (nm === 'field' && par && !isAnno(s)) {
        const chips = (kidsOf(par) || []).filter((k) => /^chip(?:·|$)/.test(nameOf(k)) && typeOf(k) !== 'text' && typeOf(k) !== 'path');
        if (chips.length) {
          const minY = Math.min.apply(null, chips.map((k) => box(k).y));
          const maxY = Math.max.apply(null, chips.map((k) => box(k).y + box(k).h));
          const dy = (box(s).y + box(s).h / 2) - (minY + (maxY - minY) / 2);
          if (Math.abs(dy) > 1) {
            add('chip_row_off_axis', chips[0], st.top, 'chip block centre is ' + N(dy) + 'px off the field centre (top and bottom padding differ) — centre the block on the field (repair: storage.repairChips)');
          }
        }
      }
      // rule 67 · chip_icon_overlap — the label and its ✕ are layout siblings, not two coordinates that happen to be
      // close. Measured 2026-10-26: a 78px chip copy inherited the 85px master's right inset; the text box ended at 331
      // and the ✕ started at 327.5 — a 3.5px collision the eye reads as a broken icon. The flex atom (row·content,
      // bound `space.xxs` columnGap) cannot produce this; a legacy absolute chip can. The chip host may be a board with
      // the label/✕ inside, or an old raw plate whose label/✕ are siblings — both are checked.
      if (/^(chip|pill|tag)(?:·|$)/i.test(nm) && !isAnno(s)) {
        const isIcon = (k) => /close|trail|chevron|caret|arrow/i.test(nameOf(k));
        let text = null, icon = null;
        if (typeOf(s) === 'board' || typeOf(s) === 'group') {
          (function scan(k, d) {
            (kidsOf(k) || []).forEach((c) => {
              if (!text && typeOf(c) === 'text') text = c;
              if (!icon && isIcon(c) && typeOf(c) !== 'text') icon = c;
              if (d < 2) scan(c, d + 1);
            });
          })(s, 0);
        } else if (par) {
          const cb = box(s);
          (kidsOf(par) || []).forEach((k) => {
            if (k === s) return;
            const kb = box(k), cx = kb.x + kb.w / 2, cy = kb.y + kb.h / 2;
            if (cx < cb.x - 1 || cx > cb.x + cb.w + 1 || cy < cb.y - 1 || cy > cb.y + cb.h + 1) return;
            if (!text && typeOf(k) === 'text') text = k;
            if (!icon && isIcon(k) && typeOf(k) !== 'text') icon = k;
          });
        }
        if (text && icon) {
          const tb = box(text), ib = box(icon);
          const ox = Math.min(tb.x + tb.w, ib.x + ib.w) - Math.max(tb.x, ib.x);
          const oy = Math.min(tb.y + tb.h, ib.y + ib.h) - Math.max(tb.y, ib.y);
          if (ox > 1 && oy > 1) {
            add('chip_icon_overlap', icon, st.top, 'chip label and "' + nameOf(icon).slice(0, 18) + '" overlap by ' + N(ox) +
              'px — lay the label/✕ out as a flex row with a bound space token; manual x is the defect (repair: rebuild the Chip atom / storage.repairChips)');
          }
        }
      }
      // rules 68/69 · popup state + nested corner. A single-select popup has ONE selected row; the hover/keyboard
      // active row is a DIFFERENT, NEUTRAL state. Both were drawn with the brand wash (measured 2026-10-26: every
      // TimePicker row·selected and row·tint were #2563eb @12%, so every variant read as two selected items). The row
      // plate is a nested surface too: inside a r12 panel with a 4px inset, the largest legal corner is r8 — the old
      // `xs` (4) made the highlight read as a different control. Both tests share the same panel/row inventory.
      if (typeOf(s) === 'board' && !isAnno(s)) {
        const panel = (kidsOf(s) || []).filter((k) => String(k.name || '') === 'panel')[0] || null;
        if (panel) {
          const rows = (kidsOf(s) || []).filter((k) => /^(row·(selected|tint|hover|active)|option·(selected|active|hover))/i.test(String(k.name || '')));
          const sel = rows.filter((k) => /selected/i.test(nameOf(k)));
          const act = rows.filter((k) => /(tint|hover|active)/i.test(nameOf(k)));
          if (sel.length > 1) {
            add('popup_state_collision', sel[1], st.top, sel.length + ' selected rows in one single-select panel — only one option may be selected (repair: storage.repairPopupRows)');
          }
          // Active/hover must be NEUTRAL. A brand wash on a row that is not selected reads as a second selection.
          act.forEach((k) => {
            const fl = arr(k, 'fills')[0];
            if (!fl || num(fl, 'fillOpacity', 1) < 0.01) return;
            const h = String(fl.fillColor || '').toLowerCase();
            const e = TOK && TOK.ci && TOK.ci.byHex ? TOK.ci.byHex[h] : null;
            const tname = e ? String(e.surface || (e.all && e.all[0]) || '') : '';
            const neutral = /text-|border|surface|base|inverse|neutral|shade|backdrop/.test(tname);
            if (!neutral) {
              add('popup_state_collision', k, st.top, nameOf(k) + ' uses a non-neutral fill (' + h + (tname ? ' = ' + tname : ', no neutral colour token') +
                ') — only the selected row may carry the brand wash; hover/active is a neutral state (repair: storage.repairPopupRows)');
            }
          });
          // Nested corner: panel r12, rows inset 4 → r8 max. A rounded row must use the largest declared step ≤ that.
          if (RI && RI.count) {
            const pb = box(panel), pr = cornersOf(panel);
            const pR = pr ? Math.max.apply(null, pr) : null;
            if (pR && pR > 0) {
              const steps = Object.keys(RI.byVal).map(Number).sort((a, b) => a - b);
              rows.forEach((k) => {
                const rb = box(k), rc = cornersOf(k);
                if (!rc) return;
                const rv = Math.max.apply(null, rc);
                if (rv <= 0) return;
                const inset = Math.min(rb.x - pb.x, rb.y - pb.y, (pb.x + pb.w) - (rb.x + rb.w), (pb.y + pb.h) - (rb.y + rb.h));
                if (inset < 1) return;
                let maxLegal = 0;
                steps.forEach((v) => { if (v <= pR - inset + 0.5 && v > maxLegal) maxLegal = v; });
                if (rv !== maxLegal) {
                  add('popup_row_corner', k, st.top, nameOf(k) + ' r' + N(rv) + ' inside r' + N(pR) + ' panel at inset ' + N(inset) +
                    ' — the nested corner is r' + N(maxLegal) + ' (largest ladder step ≤ panel−inset), not the trigger corner or an arbitrary smaller step (repair: storage.repairPopupRows)');
                }
              });
            }
          }
        }
      }
      // rule 70 · label_icon_overlap — a control's copy and its trailing icon are layout neighbours, not two
      // coordinates. Measured 2026-10-26 on `TableHeader·Sorted·asc`: an 88px host, 43px label, 16px caret slot and
      // 16px pads left a 36px label area; the auto-width text ran 2.3px into the caret (4.3px into the filter icon).
      // Chips are rule 67; all other registered controls are judged here.
      if (typeOf(s) === 'board' && !isAnno(s) && !/^(chip|pill|tag)(?:·|$)/i.test(nm) && storage.CF && storage.CF.get && storage.CF.get(nm)) {
        // AFFORDANCE icons only: a chart/arc/panel is content, not an icon slot beside copy. Treating every path
        // as an icon flagged KPI sparklines (20px 'overlap' with the value) and Progress arcs (27px) — false positives.
        const isIcon = (k) => /^glyph·(caret|chevron|close|arrow|sort|filter|ellipsis|more|plus|minus|search|calendar|clock|eye|info|help|check|copy|download|upload|settings|dots|menu)/i.test(nameOf(k)) ||
          /^(icon|trail|lead)(·|$)/i.test(nameOf(k));
        const kids = (kidsOf(s) || []);
        const texts = kids.filter((k) => typeOf(k) === 'text');
        const icons = kids.filter((k) => typeOf(k) !== 'text' && isIcon(k));
        texts.forEach((t) => {
          const tb = box(t);
          icons.forEach((ic) => {
            const ib = box(ic);
            const ox = Math.min(tb.x + tb.w, ib.x + ib.w) - Math.max(tb.x, ib.x);
            const oy = Math.min(tb.y + tb.h, ib.y + ib.h) - Math.max(tb.y, ib.y);
            if (ox > 1 && oy > 1) {
              add('label_icon_overlap', ic, st.top, 'label "' + String(t.characters || '').slice(0, 18) + '" and "' + nameOf(ic).slice(0, 20) +
                '" overlap by ' + N(ox) + 'px in "' + nm.slice(0, 28) + '" — reserve the icon slot + a space-token gap and let the host grow, or truncate the label (repair: storage.repairIconOverlap)');
            }
          });
        });
      }
      // rule 71 · spec_label_overlap — a spec matrix's row-label text and its data slot/component are separate cells.
      // Measured 2026-10-26 on `TableHeader·Spec`: the single-axis fallback used wrap rows (no grid), the 100px label
      // board held "Sorted descending" at 119px, and the text ran 7px into the TableHeader slot. Every `·Spec` is now
      // a grid (even with one data column) with a measured label column; this gate judges the rendered label/slot pair.
      if (/·Spec(?:·|$)/.test(nm) && typeOf(s) === 'board' && !isAnno(s)) {
        const labels = [], slots = [];
        (function scan(k) {
          const n = nameOf(k);
          if (/^label·/.test(n)) labels.push(k);
          if (/^slot·/.test(n)) slots.push(k);
          (kidsOf(k) || []).forEach(scan);
        })(s);
        labels.forEach((lab) => {
          const lm = /·(\d+)(?:\.|$)/.exec(nameOf(lab));
          const row = lm ? Number(lm[1]) : null;
          let t = null;
          (function findText(k) { if (t) return; if (typeOf(k) === 'text') { t = k; return; } (kidsOf(k) || []).forEach(findText); })(lab);
          if (!t) return;
          const tb = box(t);
          slots.forEach((sl) => {
            const sm = /·(\d+)(?:\.|$)/.exec(nameOf(sl));
            if (!sm || (row !== null && Number(sm[1]) !== row)) return;
            const sb = box(sl);
            const ox = Math.min(tb.x + tb.w, sb.x + sb.w) - Math.max(tb.x, sb.x);
            const oy = Math.min(tb.y + tb.h, sb.y + sb.h) - Math.max(tb.y, sb.y);
            if (ox > 1 && oy > 1) {
              add('spec_label_overlap', t, st.top, 'label "' + String(t.characters || '').slice(0, 20) + '" runs ' + N(ox) +
                'px into "' + nameOf(sl).slice(0, 26) + '" — a spec matrix is a grid with a MEASURED label column (never wrap rows); repair: rebuild the board through CF.matrix (single-axis matrices are grids too)');
            }
          });
        });
      }
      // rule 72 · spec_not_grid — §1.5/§2.3: a `·Spec` sheet's matrix body is ONE real grid container (`grid·<Family>`),
      // never an `axis·` row plus `row·<Family>·N` boards. Rule 71 only catches a label that already crosses its slot, so
      // a sheet that merely keeps the pre-grid fallback shape passed every gate while its label column drifted from the
      // axis spacer (measured 2026-10-26: 36 of 67 block pages, 32 of them with 100px labels under a 148px spacer).
      if (/·Spec(?:·|$)/.test(nm) && typeOf(s) === 'board' && !isAnno(s)) {
        const body = kidsOf(s) || [];
        const grids = body.filter((k) => /^grid·/.test(nameOf(k)));
        const rowB = body.filter((k) => /^row·/.test(nameOf(k)));
        const axisB = body.filter((k) => /^axis·/.test(nameOf(k)));
        grids.forEach((g) => {
          if (!g.grid) add('spec_not_grid', g, st.top, '"' + nameOf(g) + '" is named like a grid but carries no grid layout — the sheet is not laid out by a grid container');
        });
        if (!grids.length && (rowB.length || axisB.length)) {
          const space = axisB.length ? (kidsOf(axisB[0]) || []).filter((k) => /^labelspace·/.test(nameOf(k)))[0] : null;
          const lab = rowB.length ? (kidsOf(rowB[0]) || []).filter((k) => /^label·/.test(nameOf(k)))[0] : null;
          const sw = space ? N(box(space).w) : null, lw = lab ? N(box(lab).w) : null;
          add('spec_not_grid', s, st.top, 'matrix body is ' + axisB.length + ' `axis·` + ' + rowB.length + ' `row·` board(s), not one `grid·' +
            String(nm).replace(/·Spec.*$/, '') + '` — a spec sheet is a grid with a MEASURED label column (one column per state, labels never cross their slot)' +
            (sw !== null && lw !== null && Math.abs(sw - lw) > 1 ? ', and the label column has already drifted: axis spacer ' + sw + 'px vs row label ' + lw + 'px' : '') +
            '. Repair: rebuild the board through CF.matrix (it grids any sheet up to the canvas) or split it with CF.matrixPlan');
        } else if (grids.length && (rowB.length || axisB.length)) {
          add('spec_not_grid', s, st.top, 'mixed matrix: ' + grids.length + ' `grid·` container(s) AND ' + rowB.length + ' `row·`/`axis·` fallback boards on the same sheet — the sheet must be one grid');
        }
      }
      // rule 45 · row_axis_off — §2.3: one row has ONE axis. A horizontal connector must join the CENTRES of the nodes
      // it runs between. A node drawn at the band's TOP slips out of its own line whenever the node is smaller than the
      // copy beside it (a 12px step dot under a 20px label = 4px), which is what the eye reads as "these are not aligned".
      if (/^(tail·|tail$|rail·|rail$|connector)/.test(nm) && !isAnno(s) && par) {
        const cb = box(s);
        if (cb.h > 0 && cb.h <= 6 && cb.w > cb.h) {
          const nodes = (kidsOf(par) || []).filter((k) => /^node·/.test(nameOf(k)) && box(k).h >= cb.h);
          if (nodes.length) {
            const big = nodes.reduce((a, k) => (box(k).h > box(a).h ? k : a), nodes[0]);
            const nb = box(big);
            const d = Math.abs((cb.y + cb.h / 2) - (nb.y + nb.h / 2));
            if (d > 1) add('row_axis_off', s, st.top, 'connector centre ' + N(cb.y + cb.h / 2) + ' is ' + N(d) +
              'px off the "' + nameOf(big).slice(0, 20) + '" centre ' + N(nb.y + nb.h / 2) + ' — a row has one axis (§2.3)');
          }
        } else if (cb.w > 0 && cb.w <= 6 && cb.h > cb.w) {
          // A VERTICAL rail must join the node above to the node below EDGE to EDGE. Rule 45 used to read only
          // horizontal bands (`w > h`), so a fixed-length rail detached in silence: `Timeline·Spec` carried 3
          // disconnected rails per board because the rail assumed every node filled the 20px icon box.
          const cxc = cb.x + cb.w / 2, cyc = cb.y + cb.h / 2;
          const col = (kidsOf(par) || []).filter((k) => /^node·/.test(nameOf(k)) && Math.abs(box(k).x + box(k).w / 2 - cxc) <= 3);
          // Pair by CENTRE proximity, then judge the EDGE gap: a rail that overlaps its node must report that node,
          // not the next one down (filtering by "top below the rail end" skipped an overlapped node by 55px).
          const near = (list, d) => list.slice().sort((a, b) => d(a) - d(b))[0];
          const above = near(col.filter((k) => box(k).y + box(k).h / 2 < cyc), (k) => cyc - (box(k).y + box(k).h / 2));
          const below = near(col.filter((k) => box(k).y + box(k).h / 2 > cyc), (k) => (box(k).y + box(k).h / 2) - cyc);
          if (above) {
            const g = cb.y - (box(above).y + box(above).h);
            if (g > 1.5 || g < -1.5) add('row_axis_off', s, st.top, 'rail starts ' + N(g) + 'px from the bottom of "' + nameOf(above).slice(0, 16) +
              '" (' + (g > 0 ? 'detached' : 'overlapping') + ') — a rail joins node edge to node edge; compute it from the drawn nodes, not from a fixed pitch');
          }
          if (below) {
            const g2 = box(below).y - (cb.y + cb.h);
            if (g2 > 1.5 || g2 < -1.5) add('row_axis_off', s, st.top, 'rail ends ' + N(g2) + 'px from the top of "' + nameOf(below).slice(0, 16) +
              '" (' + (g2 > 0 ? 'detached' : 'overlapping') + ') — a rail joins node edge to node edge; compute it from the drawn nodes, not from a fixed pitch');
          }
        }
      }
      // rule 46 · frame_dead_band — a border that reserves more than its content ever uses. The frame is not a
      // placeholder for a band nobody paints: measured on `MiniCalendar·32cell`, a hardcoded 6-row height around a
      // 5-row month left 49px of empty sheet under the last row while the top inset was 7px.
      if (typeOf(s) === 'board' && /·/.test(nm) && !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^Root |^(fold|region)·/.test(nm) && !isAnno(s)) {
        const kb = box(s);
        let cl = Infinity, ct = Infinity, cr = -Infinity, cb = -Infinity, seen = false;
        (kidsOf(s) || []).forEach((k) => {
          if (/^(ring·|hitpad·|wash·|shadow|glow|scrim|guide·)/.test(nameOf(k))) return;   // chrome overhangs by design
          const q = box(k);
          if (!(q.w > 0 && q.h > 0)) return;
          seen = true;
          cl = Math.min(cl, q.x); ct = Math.min(ct, q.y); cr = Math.max(cr, q.x + q.w); cb = Math.max(cb, q.y + q.h);
        });
        if (seen) {
          const ins = { top: ct - kb.y, left: cl - kb.x, bottom: kb.b - cb, right: kb.r - cr };
          // BOTTOM ONLY, deliberately. A row, a list item and a table row are containers that STRETCH to their
          // column, so a right-hand band is the design (measured: 29 of the 30 page-06 findings a 4-side test
          // produced were `TableRow`/`ListItem`/`Timeline` trailing to their container width). The defect this rule
          // exists for is the frame that is TALLER than the content it frames — a sheet with an empty row under it.
          const sides = [['bottom', 'top']];
          for (let i2 = 0; i2 < sides.length; i2++) {
            const a = sides[i2][0], o2 = sides[i2][1];
            if (ins[a] >= 32 && ins[a] >= 3 * Math.max(1, ins[o2])) {
              add('frame_dead_band', s, st.top, N(ins[a]) + 'px of empty band at the ' + a + ' while the opposite side is ' +
                N(ins[o2]) + 'px — the border reserves space its content never fills (derive the frame from the content, or fill it)');
              break;
            }
          }
        }
      }
      // rule 45b · the same axis binds an ICON to the copy it sits beside (§2.3 + §7). `CF.glyph` scaled the 24-unit
      // CELL to the slot, so artwork that is not itself centred in that cell arrived displaced — `undo` spans
      // [1,4]–[16,14] (centre 8.5,9 of 12,12), which put a side-nav icon 1.7–2.5px off its label. Judged only against
      // copy whose band the icon actually overlaps, so a calendar header chevron is never compared with a day number.
      if (/^glyph·/.test(nm) && !isAnno(s) && par && r.h > 0) {
        // a mark is TWO shapes (`…·fill` + `…·line`) whose ink bboxes differ, so the axis is their UNION — but this is
        // judged ONLY in a host that owns exactly ONE mark and at least one label (Button, Chip, Alert, NavItem): in a
        // multi-row host (Tree, Menu, Accordion) every pairing rule I can invent is wrong somewhere — by name it
        // merges five rows into one mark, by bbox intersection a stroked path still reaches across the row. Those
        // hosts are corrected by rebuilding them from the factory, not by comparing siblings.
        const sibs = (kidsOf(par) || []).filter((k) => /^glyph·/.test(nameOf(k)) && box(k).h > 0);
        const kind = nm.replace(/·(fill|line)$/, '');
        const sameKind = sibs.filter((k) => kind === nameOf(k).replace(/·(fill|line)$/, ''));
        const labels0 = (kidsOf(par) || []).filter((k) => isText(k) && box(k).h > 0);
        const nested = sameKind.length <= 1 || sameKind.every((p) => {
          const q = box(p);
          return !(Math.max(q.x, r.x) > Math.min(q.x + q.w, r.x + r.w) || Math.max(q.y, r.y) > Math.min(q.y + q.h, r.y + r.h));
        });
        if (sibs.length <= 2 && nested && labels0.length === 1) {
          let y0 = r.y, y1 = r.b;
          sameKind.forEach((p) => { const q = box(p); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y + q.h); });
          const gcy = (y0 + y1) / 2;
          const label = labels0.filter((k) => { const q = box(k); return y0 < q.y + q.h && y1 > q.y; })
            .sort((a, b) => Math.abs(box(a).x - r.x) - Math.abs(box(b).x - r.x))[0];
          if (label) {
            const lb = box(label), d = Math.abs(gcy - (lb.y + lb.h / 2));
            if (d > 1.2) add('row_axis_off', s, st.top, 'icon "' + kind.slice(0, 18) + '" centre ' + N(gcy) + ' is ' + N(d) + 'px off the copy beside it at ' +
              N(lb.y + lb.h / 2) + ' — the glyph table centres its CELL, the row centres its INK (§7, repair: CF.glyph shifts by G_BOX)');
          }
        }
      }
      if (!rec(s)) return;
      if (isCopy(s)) {
        const ib = typeOf(s) === 'board' ? s : null;
        if (ib && fam && !spec && !st.inCf && st.inSpec) noteFamily(ib, fam, parseName(nm), false);
        radiusAudit(s, st);                       // a copy can carry its own corner override: judge the host, not its interior
        return;                                   // internals belong to the main instance, which this pass visits directly
      }
      paintAudit(s, st, false);
      spaceAudit(s, st);
      if (nm === 'box' && par && /^Checkbox(?:·|$)/.test(nameOf(par))) {
        const rv = radiusOf(s);
        if (rv !== null && rv > 4) add('radius_off_ladder', s, st.top, 'checkbox box r' + N(rv) + ' — the visible box uses the 4px xxs step (design-guide §5.1); a larger corner turns an 18px checkbox into a pill/circle');
      }
      radiusAudit(s, st);
      breathAudit(s, st, compos);
      // G10 (point 6): a control that already has a master in the library must be **placed**, not drawn again. The
      // redrawn copy is the maintenance bug — fix the master and every copy stays wrong, and no variant/swap exists.
      // Fires only once the master is registered, so it cannot be noise on a file that has no library yet.
      if ((SCREEN || APP) && typeOf(s) === 'board' && fam && CF.get && CF.get(nm)) {
        // The main component's own head IS the host named after the master — registering it must not indict it.
        let main = null; try { const rr = CF.get(nm); main = rr && rr.mainInstance ? rr.mainInstance() : null; } catch (e0) {}
        if (!main || main.id !== s.id) {
          add('not_component', s, st.top, '"' + nm + '" is a registered master but was drawn again — place it with CF.instance(\'' + nm + '\', { parent, … })');
        }
      }
      // rule 39 · not_assembled (gate G17) — the OTHER half, which rule 27 structurally cannot see. `not_component`
      // needs an exact-name master to compare against, so a screen whose controls were hand-drawn (measured 2026-10-22:
      // 160 control-shaped hosts on pages 14/15, only 2 of their names have a master) passed the gate while being made
      // of disposable rectangles: nothing to fix centrally, no variants, no swap, and no relation to the system the
      // same file just built. On a screen OR an app surface a family-named board is therefore required to be PLACED, and the repair
      // is to extend the factory (G12), register what it draws (`CF.autoRegister`), then place instances (`SC.ctl`).
      // Fires only inside app/screen scope and only for non-instances, so a `·Spec`/masters chapter that shows a drawing is untouched.
      if ((SCREEN || APP) && !isInstance(s) && typeOf(s) === 'board' && controlFamily(nm) && !/^Masters·/.test(nm) && !/·Spec(·|$)/.test(nm) && !(CF.get && CF.get(nm))) {
        add('not_assembled', s, st.top, '"' + nm + '" was drawn on an app/screen surface and no master of that name exists in the library — assemble from the system: extend the factory (G12), register it (CF.autoRegister / CF.component), then place it with CF.instance / SC.ctl');
      }
      // rule 58 · spec_unregistered (gate G10s) — a spec page is the component library's source of truth, so every
      // control host on 03–09 (including Hover/Focus/Pressed/Disabled state cells) must be a real master. Default cells
      // were registered in the original build; the state cells were not, and they were therefore unusable as instances.
      if (SPEC && typeOf(s) === 'board' && controlFamily(nm) && !/·Spec(·|$)|^Masters·/.test(nm) && !isInstance(s)) {
        // Only a TOP-LEVEL spec element is judged. A nested input/label inside a Field (a control) is anatomy that
        // belongs to that Field's master, not a second element to register; judging it made a componentized Field
        // look 'unregistered' forever. The spec board is the container and is not itself a control ancestor.
        let ctrlAnc = false, a = s.parent;
        while (a && a !== st.top) {
          const an = nameOf(a);
          if (typeOf(a) === 'board' && !/·Spec(·|$)|^Masters·/.test(an) && controlFamily(an)) { ctrlAnc = true; break; }
          a = a.parent || null;
        }
        // A COMPOSITE that already contains component instances (a Field holding an Input instance, a TableRow
        // holding cell components) is an assembly of components, not a raw leaf. Penpot's createComponent refuses a
        // board that contains an instance (it returns an empty-shell record), so the legal architecture is the
        // composition. Register the LEAF controls; never demand the composite wrap itself in a second component.
        let hasInst = false;
        (function scan(k, d) {
          if (hasInst || d > 3) return;
          for (const c of kidsOf(k) || []) { if (isInstance(c)) { hasInst = true; return; } scan(c, d + 1); }
        })(s, 0);
        if (!ctrlAnc && !hasInst) add('spec_unregistered', s, st.top, '"' + nm + '" is a raw control on a spec page — every element on 03–09 must be a component. Repair: CF.autoRegister({states:true}) on this page');
      }
      const board = typeOf(s) === 'board' ? s : null;
      if (board) out.boards++;
      // A pane region that also carries **its own** copy, over a child region that carries copy, is the dashboard/
      // docsLayout defect: the paragraph drawn into the pane ran underneath (or across) the filled child band. A pane
      // is structure; a host pane may be filled only when its child regions are its own empty anatomy.
      if (board && /^region·/.test(nm) && ownCopy(board) && holdsFilledRegion(board)) {
        add('pane_filled', board, st.top, '"' + nm + '" contains a filled region and carries copy of its own — a pane is structure; fill its leaves only');
      }
      // A board named `Foo·…` where Foo is not a known family would silently escape the coverage audit, so say so
      // rather than let a typo'd factory name read as a clean spec.
      // parseName puts the family in seg[0] ("CF.name() drops the default state… the family is therefore always seg[0]"),
      // so the check reads seg[0] too. Judging seg[1] turned every structural index row (`cell·Accordion·0`, where the
      // family word is the *second* segment by construction) into a claimed typo'd factory.
      const seg0 = nm.split('·')[0] || '';
      let pairedFam = null;
      try { const L = storage.LM; if (L && (L.active || (L.hydrate && L.hydrate()))) { pairedFam = {}; L.visual().forEach((c) => pairedFam[c.designFamily] = 1); } } catch (e) {}
      if (board && !fam && !spec && !(pairedFam && pairedFam[seg0]) && looksLikeCf(board) && /^[A-Z][A-Za-z]+$/.test(seg0)) {
        add('spec', s, st.top, 'control host "' + nm + '" names an unknown family "' + seg0 + '" (not in component-library §3.0)');
      }
      const cfHost = !!board && (!!fam || spec || looksLikeCf(board));

      const childSt = { top: st.top, tier: st.tier, inCf: st.inCf || (cfHost && !spec), inSpec: st.inSpec || spec };

      if (board && fam && !spec) {
        const p = parseName(nm);
        // §6 touch floor: 24 inside a spec board (it demonstrates the whole size axis), the tier floor on a screen
        const floor = st.inSpec ? CFG.specTouchMin : LY.TIERS[tier].touch;
        const pad = (kidsOf(board) || []).find((k) => /^hitpad·/.test(nameOf(k)));
        const padSide = pad ? Math.min(num(pad, 'width', 0), num(pad, 'height', 0)) : 0;
        const eff = Math.max(padSide, Math.min(r.w, r.h));
        if (CLASS[fam] !== 'display' && !exempt && eff < floor) {
          add('touch_target', board, st.top, fam + ' ' + N(r.w) + '×' + N(r.h) + ' < ' + floor + ' (' +
            (st.inSpec ? 'spec floor' : tier + ' floor)') + (pad ? ' — hitpad ' + N(padSide) : ''));
        }
        if (ROW_FAMS.indexOf(fam) >= 0 && LY.ROWS.filter((h) => h >= 32).indexOf(N(r.h)) < 0) {
          add('row_height', board, st.top, 'table row h=' + N(r.h) + ' outside ' + LY.ROWS.filter((h) => h >= 32).join('/'));
        }
        // §1 control caps + §4 one primary per region — both judged against the *region* the control sits in
        const cap = CAPS[fam], reg = regionOf(board), regW = num(reg, 'width', 0);
        // A control authored exactly at its cap reads back as 420.00000000000045: the same bbox residue the grid check
        // allows 0.5 for (§1 epsilon above). Without it a compliant control fails its own cap.
        if (cap && regW >= CFG.capContainer && r.w > cap + 0.5) {
          add('control_too_wide', board, st.top, fam + ' w=' + N(r.w) + ' > cap ' + cap + ' inside a ' + N(regW) + 'px region');
        }
        if (PRIMARY_FAMS.test(fam) && /·Primary/.test(nm) && !st.inSpec && !spec) {
          const bucket = (out.__prim = out.__prim || {});
          const key = (reg === st.top ? '__top' : String(reg.id || nameOf(reg))) + '·primary';
          (bucket[key] = bucket[key] || []).push({ sh: board, where: reg });
        }
        // coverage buckets: §5.2 binds "every interactive component's **spec board**", so only spec context feeds them.
        // `!st.inCf` keeps that true to its word: a control mounted *inside another control* (a Button in a table row)
        // is usage of that family, not its variant matrix — its states are demonstrated by its own spec board.
        if (!st.inCf && (st.inSpec || spec)) noteFamily(board, fam, p, true);
      } else if (board && !cfHost) {
        auditContainerBoard(board, st);
      }
      (kidsOf(board || s) || []).forEach((c) => { try { auditShape(c, board || s, childSt); } catch (e) { err(nameOf(c), e); } });
    }

    // ---- container-board rules (gaps, rhythm, split, viewport)
    function auditContainerBoard(b, st) {
      const r = box(b), kids = (kidsOf(b) || []).filter((c) => !EXEMPT.test(nameOf(c)) && !ANNO.test(nameOf(c)));
      // A **composed** block is one whose extent the agent chose through LY. A CF host board is auto- or ladder-sized,
      // and a spec matrix places its cells by measured glyph width, so the whitespace next to either is arithmetic, not
      // a design decision — judging it would flag every component page. Level-1 rules bind composed blocks only.
      const blocks = kids.filter((c) => {
        const k = box(c);
        return !isText(c) && k.w >= CFG.blockMin && k.h >= CFG.blockMin && (isPlate(c) || isBox(c)) &&
          !isHostBoard(c) && !isSpecBoard(c);
      });
      // §1 measured gaps between sibling blocks (the 2× rule and the scale are the same check from two sides).
      // "Neighbour" must mean neighbour in the FULL child list, not in the filtered one: when an exempt/annotation row
      // sits between two judged blocks (measured 2026-10-21, `row·col-header` inside FN's `Semantic roles`), the pair
      // that survives the filter spans it and the rule reports a 49px gap nobody authored — the real rhythm is 16 + 16.
      const allKids = (kidsOf(b) || []).slice().sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      const rank = {}; allKids.forEach((c, i) => { rank[str(c, 'id', '')] = i; });
      const vs = blocks.slice().sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      for (let i = 0; i < vs.length - 1; i++) {
        for (let j = i + 1; j < i + 2; j++) {   // neighbour only: non-adjacent "gaps" are cumulative spacing, not rhythm
          if (rank[str(vs[j], 'id', '')] - rank[str(vs[i], 'id', '')] !== 1) continue;
          const A = box(vs[i]), Bc = box(vs[j]);
          if (Math.min(A.r, Bc.r) - Math.max(A.x, Bc.x) <= 0) continue;
          const gap = A.b <= Bc.y ? Bc.y - A.b : (Bc.b <= A.y ? A.y - Bc.b : 0);
          if (gap > 0 && gap < r.h && gap <= SPREAD_MAX && !LY.onScale(gap, CFG.gapTol)) {
            add('off_scale_gap', gap === Bc.y - A.b ? vs[j] : vs[i], b, 'gap ' + N(gap) + ' between "' + nameOf(vs[i]) + '" and "' + nameOf(vs[j]) + '" is off ' + LY.SPACE.join('/'));
          }
        }
      }
      const hs = blocks.slice().sort((a, c) => num(a, 'x', 0) - num(c, 'x', 0));
      const allX = (kidsOf(b) || []).slice().sort((a, c) => num(a, 'x', 0) - num(c, 'x', 0));
      const rankX = {}; allX.forEach((c, i) => { rankX[str(c, 'id', '')] = i; });
      for (let i = 0; i < hs.length - 1; i++) {
        for (let j = i + 1; j < i + 2; j++) {   // neighbour only (same reason)
          if (rankX[str(hs[j], 'id', '')] - rankX[str(hs[i], 'id', '')] !== 1) continue;
          const A = box(hs[i]), Bc = box(hs[j]);
          if (Bc.x - A.r <= 0) continue;                            // not ordered / overlapping in x
          const yh = Math.min(A.b, Bc.b) - Math.max(A.y, Bc.y);
          if (yh < Math.min(A.h, Bc.h) * 0.5) continue;             // different rows, not a column gap
          const gap = Bc.x - A.r;
        if (gap > SPREAD_MAX) continue;
          if (gap > 0 && !LY.onScale(gap, CFG.gapTol)) {
            add('off_scale_gap', hs[j], b, 'column gap ' + N(gap) + ' between "' + nameOf(hs[i]) + '" and "' + nameOf(hs[j]) + '" is off scale');
          }
        }
      }
      // §8 two-column ratio (and the "three equal panes" tell: rails must be narrower than content)
      const panes = blocks.filter((c) => { const k = box(c); return isBox(c) && k.h >= r.h * 0.8 && k.w >= r.w * 0.2 && Math.abs(k.y - r.y) <= 8; });
      const legName = nameOf(b) + ' ' + chainName(b, st.top);
      if (panes.length === 2 && !SPLITRX.test(legName) && !LEGRX.test(legName)) {
        const a = box(panes[0]), c2 = box(panes[1]);
        const ratio = Math.max(a.w, c2.w) / Math.max(1, Math.min(a.w, c2.w));
        if (ratio < CFG.splitMin) add('split_ratio_50_50', panes[0], b, 'panes ' + N(a.w) + '/' + N(c2.w) + ' = ' + ratio.toFixed(2) + ':1 (§8 needs ' + CFG.splitMin + '–3.2:1)');
      } else if (panes.length >= 3 && !LEGRX.test(legName)) {
        const ws = panes.map((p2) => box(p2).w);
        const spread = Math.max.apply(null, ws) / Math.max(1, Math.min.apply(null, ws));
        if (spread < 1.1) add('split_ratio_50_50', panes[0], b, panes.length + ' equal panes of ' + N(ws[0]) + ' (§3.1 email tell)');
      }
      // §2 vertical rhythm between full-width bands
      const bands = blocks.filter((c) => { const k = box(c); return isBox(c) && k.w >= r.w * 0.9 && k.h >= 48; })
        .sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      const gaps = [];
      for (let i = 0; i < bands.length - 1; i++) {
        const A = box(bands[i]), Bc = box(bands[i + 1]);
        const g = Bc.y - A.b;
        if (g > 0 && LY.onScale(g, CFG.gapTol)) gaps.push(g);
      }
      if (gaps.length >= CFG.rhythmBands) {
        const idx = gaps.map((g) => { let best = -1; LY.SPACE.forEach((sp, si) => { if (Math.abs(sp - g) <= CFG.gapTol && best < 0) best = si; }); return best; });
        if (idx.every((v) => v >= 0) && Math.max.apply(null, idx) - Math.min.apply(null, idx) > 1) {
          add('rhythm_inconsistent', bands[1], b, 'band gaps ' + gaps.join('/') + ' spread over ' +
            (Math.max.apply(null, idx) - Math.min.apply(null, idx)) + ' scale steps (§2 wants one rhythm)');
        }
      }
      // §11 rule 12 viewport_locked — screen boards only (a CF control host never reaches here).
      // A board whose children are `·Spec` matrices is a documentation surface: its length comes from how many families
      // it stacks, not from a viewport habit, so the fold contract does not bind it.
      if (kids.some((c) => isSpecBoard(c))) return;
      const bt = LY.tierFor(r.w);
      // The viewport contract belongs to the tier being audited: a 720-wide card inside a 1440 page is content, not a pad screen.
      if (bt !== tier && b !== st.top) return;
      const vh = LY.viewportHeight(bt);
      const isScreen = r.w >= LY.TIERS[bt].w * 0.8 && r.h >= 300;
      if (!isScreen) return;
      out.tiers[bt] = (out.tiers[bt] || 0) + 1;
      // rule 41 · no_source_record (gate G17, proof half) — a recreated screen is assembled from a RECORD of the user's
      // own source material, stamped durably on the board (`nl:sc` + `nl:rec`, screen_engine.js S6) so the contract
      // outlives the session that built it and `SC.coverage()` can be re-read by anyone else. No stamp means the gate
      // has nothing to read, and unprovable is REPORTED, not passed — the same contract rule 31 applies to G16.
      if (SCREEN) {
        // Scoped to the board that IS a screen: the stamp contract belongs to the composition a source record produced,
        // not to a full-bleed band inside it. Without this the first census indicted 45 boards on page 14 for what are
        // 12 screens, because a `region·` band at tier width and 300+ tall matches `isScreen` too.
        const parB = (function () { try { return b.parent; } catch (e) { return null; } })();
        // The PageRoot is the 1920-wide SHEET the screens are mounted on, not a screen: it is wider than the tier and
        // carries no `nl:sc` by design. Judging it made every content page with screens report `no_source_record` about
        // its own canvas (measured 2026-10-22 on `15 · Screens · content`).
        const isCanvas = /-PageRoot$/.test(nameOf(b));
        const topLevel = !isCanvas && (!parB || parB.id === str(root, 'id', '') || /-PageRoot$/.test(nameOf(parB)));
        if (topLevel) {
          out.screens = (out.screens || 0) + 1;
          let srec = null; try { srec = storage.NL && storage.NL.readStamp ? storage.NL.readStamp(b) : null; } catch (e) {}
          if (!srec || !srec.sc || !srec.rec) {
            add('no_source_record', b, st.top, '"' + nameOf(b) + '" is a ' + bt + ' screen with no ' +
              (!srec || !srec.sc ? '`nl:sc`' : '`nl:rec`') + ' stamp — it was composed freehand, not assembled from a source record; rebuild it with SC.record(…) then SC.build(…) (scripts/screen_engine.js)');
          }
        }
      }
      // The grid must live ON the board. `board.guides`/`board.rulerGuides` are the writable native collections
      // (measured: only whole-array assignment works, there is no push API), so a screen that carries none was placed
      // against a grid the designer cannot see, snap to, or edit — which is also how a tall element ends up on top of
      // its neighbour: nothing on the canvas marks the boundary the hand-typed y was supposed to respect.
      // Bound only at the tier's baseline width: a 1760-wide documentation sheet is not a screen and has no column grid.
      if (Math.abs(r.w - LY.TIERS[bt].w) <= 1) {
        const gc = storage.NL && storage.NL.guideCount ? storage.NL.guideCount(b) : null;
        if (gc && gc.guides === 0 && gc.ruler === 0) {
          add('no_guides', b, st.top, 'a ' + bt + ' ' + N(r.w) + '×' + N(r.h) + ' screen carries no native guide — LY.guides(board, { tier: \'' + bt + '\' })');
        }
      }
      const contentB = (kidsOf(b) || []).reduce((m, c) => Math.max(m, num(c, 'y', 0) + num(c, 'height', 0)), r.y);
      if (Math.abs(r.h - vh) <= 8) {
        if (contentB > r.b + 1) add('viewport_locked', b, st.top, 'board is exactly the ' + bt + ' viewport (' + vh + ') while content reaches ' + N(contentB - r.y));
        else if (r.b - contentB >= CFG.deadSpace) add('viewport_locked', b, st.top, 'board is exactly the ' + bt + ' viewport with ' + N(r.b - contentB) + 'px of dead space below the content');
      }
      // The fold contract binds a **baseline-width screen**, not a documentation canvas. A 1920 PageRoot is wider than
      // the tier and carries no scrollable viewport: judging it as a screen forced a 1440×900 marker at x=0, which
      // annotated empty page space and drew an orange edge across the header (measured on a live file). This is the
      // same guard the guides branch above already applies.
      if (r.h >= CFG.longBoard && Math.abs(r.w - LY.TIERS[bt].w) <= 1) {
        // LY.fold() mounts the marker next to the board it annotates, so it is found among the siblings too
        let fold = false;
        const hunt = (n3) => { (kidsOf(n3) || []).forEach((c) => { if (/^fold·/.test(nameOf(c))) fold = true; if (rec(c)) hunt(c); }); };
        hunt(b);
        // A recipe's row and its scrolling cell share the same origin; the marker is mounted beside the row (one
        // level above this cell), so an aligned fold among the siblings of ANY ancestor counts for this board.
        let p = (() => { try { return b.parent; } catch (e) { return null; } })();
        while (!fold && p) {
          const box0 = box(p);
          (kidsOf(p) || []).forEach((c) => {
            if (/^fold·/.test(nameOf(c)) && Math.abs(num(c, 'x', 1e9) - r.x) <= 2 && Math.abs(num(c, 'y', 1e9) - r.y) <= 2) fold = true;
          });
          if (p === st.top || Math.abs(box0.y - r.y) > 2) break;
          p = (() => { try { return p.parent; } catch (e) { return null; } })();
        }
        if (!fold) add('viewport_locked', b, st.top, 'board is ' + N(r.h) + ' tall (it scrolls) but carries no LY.fold() marker for the reviewer');
      }
    }

    // ---- family coverage rules (component-library §3.0 + §4), judged over the audited scope
    function auditCoverage() {
      // opts.families scopes the audit to one sub-board of the component pages: the contract puts a `·Spec` board per
      // family on pages 03–09 (core controls) and the composite families on page 10, so auditing the page root would demand
      // a 5-state TableHeader spec from a table that is only ever drawn once, in place, inside a real Table host.
      const only = opts.families && opts.families.length ? {} : null;
      if (only) opts.families.forEach((f) => { only[f] = 1; });
      // The source profile pins a family's variant set. A recreation must not be forced to invent a variant the
      // reference never shows (a reference may pin no icon slot and only default/underline nav links).
      let REF = null;
      try { REF = (storage.CF && storage.CF.reference) ? storage.CF.reference('actions') : (storage.REF && storage.REF.actions); } catch (e) {}
      Object.keys(out.families).forEach((k) => {
        const F = out.families[k], cls = CLASS[k], need = SETS[cls];
        const where = { name: Object.keys(F.boards)[0] || k };
        if (F.hosts < 2) return;                       // coverage is a property of a spec board, not of one instance
        if (only && !only[k]) return;
        if (SPEC_SKIP[k]) { out.skipped[k] = F.hosts; return; }
        const missing = need.filter((s) => !F.states[s]);
        if (cls !== 'display' && missing.length >= 2) {
          add('state_coverage', null, where, k + ' [' + cls + '] draws no ' + missing.join('/') + ' state (' + F.hosts +
            ' hosts, states seen: ' + Object.keys(F.states).join('/') + ')');
        }
        if (cls !== 'display' && STATE_ONLY_FAMS.indexOf(k) < 0) {
          const variants = Object.keys(F.variants).length, sizes = Object.keys(F.sizes).length;
          const refFam = REF && Array.isArray(REF.families) && REF.families.some((f) => String(f).toLowerCase() === String(k).toLowerCase());
          const refV = refFam && REF.variants ? (REF.variants[k] || REF.variants[Object.keys(REF.variants).find((x) => x.toLowerCase() === String(k).toLowerCase())]) : null;
          const minV = refV && refV.min !== undefined ? Number(refV.min) : CFG.variantsMin;
          const needIcon = refV ? refV.iconSlot !== false : true;
          const sparse = [];
          if (variants < minV) sparse.push(variants + ' variant(s) < ' + minV);
          if (F.sizesAny && sizes < CFG.sizesMin) sparse.push(sizes + ' size(s) < ' + CFG.sizesMin);
          if (needIcon && ICON_FAMS.indexOf(k) >= 0 && variants >= minV && !F.icons.lead && !F.icons.trail) sparse.push('no icon slot variant');
          if (sparse.length) add('variant_sparse', null, where, k + ': ' + sparse.join(', '));
        }
        if (cls !== 'display' && F.focus > 0 && F.rings === 0 && F.thickBorder === 0) {
          add('focus_ring_missing', null, where, k + ': ' + F.focus + ' Focus host(s) with neither a ring· layer nor a ≥2px focus border');
        }
      });
      const bucket = out.__prim || {};
      Object.keys(bucket).forEach((key) => {
        const list = bucket[key];
        if (list.length > 1) add('multiple_primary', list[1].sh, list[1].where,
          list.length + ' filled primaries in one region (' + list.map((e) => nameOf(e.sh)).join(', ') + ')');
      });
      delete out.__prim;
    }

    // ---- run
    const st0 = { top: top, tier: tier, inCf: false, inSpec: false };
    try { auditShape(top, root || null, st0); } catch (e) { out.errors.push('walk:' + (e && e.message || e)); }
    auditCoverage();

    // ---- rule 30: the ramp must be *reachable*, not only declared.
    // A `typography` token is what the auditor binds to; a `LibraryTypography` style is what a human picks off
    // 素材 → 排版. Measured 2026-10-21: 40 active tokens, 0 styles, empty panel — every other rule passed, because
    // every other rule reads the tree or the token set, and neither tells you the library has nothing to offer.
    try {
      const rampN = (storage.TK && storage.TK.typeIndex) ? storage.TK.typeIndex().count : 0;
      let stylesN = -1;
      try { stylesN = Array.from(penpot.library.local.typographies).length; } catch (e) { stylesN = -1; }
      out.typeStyles = stylesN;
      if (out.texts && rampN > 0 && stylesN === 0) {
        add('no_type_styles', null, top, rampN + ' typography tokens declared and ' + out.texts
          + ' text shape(s) drawn, but the library holds 0 typography styles — run storage.TP.seed()');
      }
    } catch (e) { err('typeStyles', e); }

    // ---- rule 31 · gate G16 — the Foundations and Color-in-use chapters are PROJECTED from the token records, never composed by hand.
    // Every number in this rule is READ FROM `storage.FN`: FN.CHAPTER says which chapters are projections, FN.boards /
    // FN.EXEMPT which boards are in scope, FN.stampOf what counts as proof. The auditor keeps no copy of that table, so
    // it cannot drift from the engine that writes the stamps — and a hand-drawn `Palette` cannot read CLEAN.
    // When FN is absent the gate is UNPROVABLE, and unprovable is REPORTED, not passed.
    try {
      const FN = storage.FN;
      const pname = String(out.page || '');
      const m = /^(\d{2})(?:\.\d+)?/.exec(pname);
      if (FN && FN.CHAPTER) {
        const ch = FN.chapter(pname);
        if (ch && FN.chapters().indexOf(ch) >= 0) {
          out.provenance = 'FN ' + FN.VERSION + ' · chapter ' + ch + ' · projected kinds here: '
            + (FN.kindsOn(pname).join(',') || 'none') + ' · exempt: ' + (FN.EXEMPT[ch] || []).join('/');
          const foreign = FN.foreign(pname) || [];
          const mine = foreign.filter((f) => nameOf(top) === f.name);
          mine.forEach(() => add('not_projected', top, top, '“' + nameOf(top) + '” has no durable `nl:fn` stamp — it was drawn, not projected. Rebuild it with FN.project({ page, kind }) and let the tokens place themselves; `FN.restamp(page)` only restamps boards FN actually built'));
          if (/-PageRoot$/.test(nameOf(top)) && foreign.length > mine.length) {
            add('not_projected', null, top, (foreign.length - mine.length) + ' further un-projected board(s) on this page: '
              + foreign.filter((f) => nameOf(top) !== f.name).map((f) => f.name + '(' + f.w + '×' + f.h + ')').join(', '));
          }
        }
      } else if (m && (m[1] === '01' || m[1] === '02')) {
        add('not_projected', null, top, pname + ' is a Foundations/Color chapter and `storage.FN` is not seeded — G16 cannot be verified, so it cannot be claimed. Seed scripts/foundations_engine.js LAST in the G1 order');
      }
    } catch (e) { err('provenance', e); }

    // ---- rule 41 (page scope) · no_source_record (gate G17) — a screen page can only be judged assembled when the
    // screen engine is loaded, exactly as rule 31 refuses to claim G16 without `storage.FN`. A missing SC is reported, not skipped.
    try {
      if (SCREEN && (!storage.SC || typeof storage.SC.build !== 'function')) {
        add('no_source_record', null, top, out.page + ' is a Screens page and `storage.SC` is not seeded — G17 cannot be verified, so it cannot be claimed. Seed scripts/screen_engine.js in the G1 order (engines.md §"Seeding without pasting")');
      }
    } catch (e) { err('screenScope', e); }

    // ---- rule 55 (page scope) · surface_missing (gate G18) — a recorded surface/elevation that never became a plate.
    // Reads the durable `nl:rec` digest, not session memory, so a screen built in another session is still judged.
    try {
      if (SCREEN && storage.SC && storage.NL) {
        (storage.SC.scope ? storage.SC.scope() : []).forEach((b) => {
          const st = storage.NL.readStamp && storage.NL.readStamp(b);
          if (!st || !st.sc) return;
          let d = null;
          try { d = JSON.parse(b.getPluginData('nl:rec') || 'null'); } catch (e) { d = null; }
          if (!d || !d.sections) return;
          const names = new Set();
          (function walkNames(s) { names.add(nameOf(s)); (kidsOf(s) || []).forEach(walkNames); })(b);
          (d.sections || []).forEach((sec) => {
            if (!sec || (!sec.surface && !sec.elevation)) return;
            const plate = 'surface·' + sec.region;
            if (!names.has(plate)) {
              add('surface_missing', b, top, 'record section "' + sec.region + '" declares surface=' + (sec.surface || '—') + ' / elevation=' + (sec.elevation || '—') + ' but the board has no `' + plate + '` plate — the section is bare, so it has nothing to cast a shadow. Mount it with SC.surface / EL.surfacePass');
            }
          });
        });
      }
    } catch (e) { err('surfaceScope', e); }

    // ---- rule 56 · reference_drift — a recreation's Actions page is the SOURCE's action inventory, not the factory's
    // family list. A family the source never shows is not drawn; a family's corner roles are pinned by the measured
    // source (for example Button=pill, IconButton=tile/circle, Link=none). The profile is durable on the PageRoot (`nl:ref`).
    try {
      const pname = String(out.page || '');
      // 03–09 are BLOCK pages: one canonical family per page (CAT.BLOCKS). On a block page the family-presence
      // checks below would demand the whole chapter on one page, so completeness is a file question there
      // (CAT.pageIssues / designCoverage). The per-family material/stamp checks still run against the one spec.
      const CATB = (storage.CATALOG && storage.CATALOG.blockFor) ? storage.CATALOG.blockFor(pname) : null;
      // Library pairing: an `nl:lib` stamp (or an in-session LM.load) replaces the generic CF.map() catalog with the
      // host library's exact component inventory. Generic mode has no stamp, so all existing rules are unchanged.
      const LIB = (storage.LM && storage.LM.ensure) ? (storage.LM.ensure() ? storage.LM : null) : null;
      if (LIB && /^13(?:\D|$)/.test(pname) && /-PageRoot$/.test(nameOf(top))) {
        const la = LIB.audit();
        (la.missing || []).forEach((m) => add('library_drift', null, top, 'paired library "' + la.name + '": visual component ' + m.designFamily + ' (' + m.factory + ') has no master in the Penpot library'));
        (la.extras || []).forEach((h) => add('library_drift', null, top, 'library master "' + h + '" is not a component (or part) of the paired manifest — the design system may not invent components outside the host library'));
      }
      // One reader for the birth stamp, used by every branch of rule 56: an instance answers with its MASTER's stamp
      // (the master is the definition), so a placed copy is judged by what it is an instance of, not by its own record.
      const readProf = (k) => { let st = null; try { st = (storage.CF && storage.CF.profOf) ? storage.CF.profOf(k) : null; } catch (e) {} if (!st) { try { const raw = k.getPluginData ? k.getPluginData('nl:prof') : null; if (raw) st = JSON.parse(raw); } catch (e) {} } return st; };
      if (/^03(?:\.| ·)/.test(pname) && /-PageRoot$/.test(nameOf(top))) {
        let ref = null;
        try { ref = (storage.CF && storage.CF.reference) ? storage.CF.reference('actions') : (storage.REF && storage.REF.actions); } catch (e) {}
        if (!ref) { try { const raw = top.getPluginData ? top.getPluginData('nl:ref') : null; if (raw) { const d = JSON.parse(raw); ref = d && d.actions; } } catch (e) {} }
        if (!LIB && (!ref || !ref.families || !ref.families.length)) {
          add('reference_drift', null, top, 'no reference action profile on page 03 — seed CF.setReference({actions:{families,shapes}}) from DESIGN.md before building the Actions chapter; a factory list is not a reference inventory');
        } else {
          // COMPLETE CATALOG. The source inventory is the measured half, not a licence to delete the other
          // action families: pages 03–09 are the library. Every CF.map() family gets a ·Spec board; the source's
          // families are judged against their measured `expect`, the rest are derived and registered like any other.
          const NAMEMAP = { fab: 'FAB', kpi: 'KPI', otpInput: 'OTP', searchField: 'Search', passwordField: 'Password' };
          const capFam = (f) => NAMEMAP[f] || (String(f).charAt(0).toUpperCase() + String(f).slice(1));
          let catalog = ['Button', 'IconButton', 'ButtonGroup', 'SplitButton', 'FAB', 'Link', 'Segmented'];
          if (LIB) catalog = LIB.pageFams('03');
          else try { const m = storage.CF && storage.CF.map ? storage.CF.map().actions : []; if (m && m.length) catalog = m.map(capFam); } catch (e) {}
          const want = catalog.map((f) => String(f).toLowerCase());
          const source = ref.families.map((f) => String(f).toLowerCase());
          const shapes = {};
          Object.keys(ref.shapes || {}).forEach((k) => { shapes[String(k).toLowerCase()] = ref.shapes[k]; });
          const specs = (kidsOf(top) || []).filter((c) => typeOf(c) === 'board' && /^[A-Za-z][A-Za-z0-9]*·Spec(?:·|$)/.test(nameOf(c)));
          const seen = {};
          specs.forEach((b) => {
            const fam = String(nameOf(b)).split('·')[0], key = fam.toLowerCase();
            seen[key] = 1;
            if (want.indexOf(key) < 0) add(LIB ? 'library_drift' : 'reference_drift', b, top, LIB ? 'Actions spec "' + nameOf(b) + '" is not a component of the paired library manifest on page 03' : 'Actions spec "' + nameOf(b) + '" names family ' + fam + ', which is not in CF.map().actions — the library has no factory to back it');
            const allowed = shapes[key];
            if (allowed && allowed.length) {
              const vals = allowed.map((role) => { try { return (storage.CF && storage.CF.radius) ? storage.CF.radius(role) : ({ none: 0, tile: 12, full: 9999 }[role]); } catch (e) { return null; } });
              (function walk(k) {
                const nm = nameOf(k);
                if (k !== b && typeOf(k) === 'board' && new RegExp('^' + fam + '·').test(nm)) {
                  const cs = cornersOf(k), v = cs ? Math.max.apply(null, cs) : null;
                  if (v !== null && vals.indexOf(v) < 0) add('reference_drift', k, top, nm.slice(0, 44) + ' uses r' + N(v) + '; the reference pins ' + fam + ' to ' + allowed.join('/') + ' — use the measured shape role, not a new radius');
                }
                (kidsOf(k) || []).forEach(walk);
              })(b);
            }
          });
          if (!CATB && /^0[3-9] · /.test(pname)) catalog.forEach((f) => { if (!seen[String(f).toLowerCase()]) add(LIB ? 'library_drift' : 'reference_drift', null, top, (LIB ? 'paired action catalog: ' : 'complete action catalog: ') + f + ' has no ·Spec board on page 03' + (LIB ? '' : (source.indexOf(String(f).toLowerCase()) >= 0 ? ' (source-measured family)' : ' (derived family — build it from the source material, do not omit it)'))); });
          // ANATOMY — the family list is only the first half of the source contract. A family that IS in the inventory
          // can still be drawn with the wrong material: the a reference secondary action may be a borderless light chip, but the
          // generic "secondary" tone gave it a 1px border, a `control` stack and a detached halo. These facts live in the
          // profile until the factory can read them; the gate checks the render against them, so a rebuild cannot drift.
          const anat = ref.anatomy || {};
          Object.keys(anat).forEach(function (head) {
            const rule = anat[head] || {};
            (function walkAnat(k) {
              const kn = nameOf(k);
              if (typeOf(k) === 'board' && kn.indexOf(head) === 0 && !/·Spec(·|$)/.test(kn)) {
                if (rule.stroke === false && arr(k, 'strokes').length) {
                  const sw = num(arr(k, 'strokes')[0], 'strokeWidth', 1);
                  add('reference_drift', k, top, kn.slice(0, 44) + ' carries a ' + N(sw) + 'px stroke; the reference ' + head + ' is borderless — its edge is the chip inset, not a line');
                }
                if (rule.elevation && storage.EL && storage.EL.readStamp) {
                  const stp = storage.EL.readStamp(k);
                  if (stp && String(stp).indexOf(rule.elevation) !== 0) add('reference_drift', k, top, kn.slice(0, 44) + ' is stamped `' + stp + '`, the reference material is `' + rule.elevation + '` (repair: EL.sweepPage)');
                }
                if (rule.focusRing === 'flush') {
                  const ring = (kidsOf(k) || []).filter((c) => /^ring·/.test(nameOf(c)))[0];
                  if (ring) {
                    const rb = box(ring), kb = box(k);
                    const gap = Math.max(Math.abs(rb.x - kb.x), Math.abs(rb.y - kb.y), Math.abs(rb.w - kb.w), Math.abs(rb.h - kb.h));
                    if (gap > 1) add('reference_drift', k, top, kn.slice(0, 44) + ' focus ring is ' + N(gap) + 'px off the chip edge; the reference focus is flush (no gap between outline and pill)');
                  }
                }
              }
              (kidsOf(k) || []).forEach(walkAnat);
            })(top);
          });
          // BIRTH STAMP — pages 03 and 04–08 are ONE contract: a profiled host carries the stamp of the entry it was
          // drawn from and measures what that entry's `expect` declares. A Actions host built before the profile
          // existed is not exempt — CF.stampPass measures it, and a generic measurement still fails `expect`.
          if (!LIB && storage.CF && storage.CF.profKeyFor && storage.CF.profDiff) {
            (function walkStamp(k) {
              const nm = nameOf(k);
              if (typeOf(k) === 'board' && !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$/.test(nm)) {
                const key = storage.CF.profKeyFor(nm);
                if (key && key.group === 'actions') {
                  const st = readProf(k);
                  const prof = storage.CF.profile(key.group, key.family, key.variant);
                  const derived = !!(prof && prof.derived);
                  if (!st && !derived) add('reference_drift', k, top, nm.slice(0, 44) + ' carries no nl:prof stamp — it was not drawn from the actions profile; run CF.stampPass (measures the render) or rebuild it with the profile-aware factory');
                  else if (st && prof && !derived) storage.CF.profDiff(prof, st).forEach(function (b) {
                    add('reference_drift', k, top, nm.slice(0, 44) + ' draws ' + b.k + '=' + (b.got === undefined || b.got === null ? '—' : b.got) + '; the actions profile measures ' + b.k + '=' + b.want);
                  });
                }
              }
              (kidsOf(k) || []).forEach(walkStamp);
            })(top);
          }
        }
      } else if (/^09(?:\.| ·)/.test(pname) && /-PageRoot$/.test(nameOf(top))) {
        // Feedback reference — the source HAS tooltip/modal CSS; Alert/Toast are marked derived in the profile. The
        // factory stamps `nl:fb` with the material it drew; a raw generic tooltip/modal/alert/toast (or M3 pastel)
        // cannot read CLEAN. The profile is stamped on the PageRoot, so it survives a storage wipe.
        let fb = null;
        try { fb = (storage.CF && storage.CF.reference) ? storage.CF.reference('feedback') : null; } catch (e) {}
        if (!fb) { try { const raw = top.getPluginData ? top.getPluginData('nl:ref') : null; if (raw) { const d = JSON.parse(raw); fb = d && d.feedback; } } catch (e) {} }
        // The complete feedback catalog is the page contract; measured tooltip/modal are checked below, the rest are
        // derived and must still be built and registered (never omitted).
        try {
          const m = LIB ? LIB.pageFams('09') : (storage.CF && storage.CF.map ? storage.CF.map().feedback : []);
          const specHead = {};
          (kidsOf(top) || []).forEach((c) => { if (typeOf(c) === 'board' && /·Spec(?:·|$)/.test(nameOf(c))) specHead[String(nameOf(c)).split('·')[0].toLowerCase()] = 1; });
          if (!CATB && /^0[3-9] · /.test(pname)) m.forEach((f) => { const cap = String(f).charAt(0).toUpperCase() + String(f).slice(1); if (!specHead[String(cap).toLowerCase()]) add(LIB ? 'library_drift' : 'reference_drift', null, top, (LIB ? 'paired feedback catalog: ' : 'complete feedback catalog: ') + cap + ' has no ·Spec board on page 09' + (LIB ? '' : ' — measured families use their profile, the rest are derived from the source material and must still be built')); });
        } catch (e) {}
        if (!LIB && !fb) {
          add('reference_drift', null, top, 'no feedback source profile on page 09 — seed CF.setReference({feedback:{tooltip,modal,alert,toast}}) from the reference CSS before building Overlays; generic factory defaults are not the source');
        } else {
          const fbOf = (k) => { try { return JSON.parse(k.getPluginData('nl:fb') || 'null'); } catch (e) { return null; } };
          (function walkFb(k) {
            const nm = nameOf(k);
            if (typeOf(k) === 'board' && !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$/.test(nm)) {
              const f = fbOf(k);
              if (/^Tooltip·/.test(nm)) {
                const R = fb.tooltip || {};
                if (!f || f.family !== 'tooltip') add('reference_drift', k, top, nm + ' has no feedback stamp — a raw tooltip is not the profiled one; draw it with CF.tooltip after seeding feedback.tooltip');
                else {
                  const bad = [];
                  if (R.radius !== undefined && N(f.radius) !== N(R.radius)) bad.push('radius ' + N(f.radius) + '≠' + N(R.radius));
                  if (R.padX !== undefined && N(f.padX) !== N(R.padX)) bad.push('padX ' + N(f.padX) + '≠' + N(R.padX));
                  if (R.padY !== undefined && N(f.padY) !== N(R.padY)) bad.push('padY ' + N(f.padY) + '≠' + N(R.padY));
                  if (R.shadow !== undefined && Number(f.shadow) !== Number(R.shadow)) bad.push('shadow ' + f.shadow + '≠' + R.shadow);
                  if (R.arrow !== undefined && !!f.arrow !== !!R.arrow) bad.push('arrow ' + !!f.arrow + '≠' + !!R.arrow);
                  if (R.fs !== undefined) {
                    const sizes = Array.isArray(R.fs) ? R.fs.map(Number) : [Number(R.fs)];
                    if (sizes.indexOf(Number(f.fs)) < 0) bad.push('fs ' + f.fs + '≠' + sizes.join('/'));
                  }
                  if (bad.length) add('reference_drift', k, top, nm.slice(0, 44) + ' tooltip drifts from the feedback profile: ' + bad.join(', '));
                }
              } else if (/^Modal·/.test(nm)) {
                const R = fb.modal || {};
                const bad = [];
                if (!f || f.family !== 'modal') bad.push('no modal stamp');
                else {
                  if (R.radius !== undefined && N(f.radius) !== N(R.radius)) bad.push('radius ' + N(f.radius) + '≠' + N(R.radius));
                  if (R.border !== undefined && N(f.border) !== N(R.border)) bad.push('border ' + N(f.border) + '≠' + N(R.border));
                  if (R.bodyPad !== undefined && N(f.bodyPad) !== N(R.bodyPad)) bad.push('bodyPad ' + N(f.bodyPad) + '≠' + N(R.bodyPad));
                }
                if (bad.length) add('reference_drift', k, top, nm.slice(0, 44) + ' is not the profiled modal (' + bad.join(', ') + ') — rebuild it with the factory that reads feedback.modal');
              } else if (/^Alert·/.test(nm)) {
                const R = fb.alert || {};
                if (!f || f.family !== 'alert' || (R.material && f.material !== R.material)) add('reference_drift', k, top, nm.slice(0, 44) + ' is not using the profiled alert material "' + (R.material || '—') + '" — a derived family takes a source material, never an unrelated pastel');
              } else if (/^Toast·/.test(nm)) {
                const R = fb.toast || {};
                if (!f || f.family !== 'toast' || (R.material && f.material !== R.material)) add('reference_drift', k, top, nm.slice(0, 44) + ' is not using the profiled toast material "' + (R.material || '—') + '" — a derived family takes a source material, never a generic pill');
              }
            }
            (kidsOf(k) || []).forEach(walkFb);
          })(top);
        }
      } else if (/^0[45678](?:\.| ·)/.test(pname) && /-PageRoot$/.test(nameOf(top))) {
        // GENERIC PROFILE GATE (source-adaptation §5). Pages 04–08 are the same contract as 03/09, but it is DATA that
        // drives it, not family names hardcoded per page: the page's profile group must exist once the file is a
        // recreation, every host of a profiled family must carry the `nl:prof` birth stamp, and the stamp's measured
        // geometry must equal the profile's declared `expect` block. A factory default therefore cannot read CLEAN.
        const GROUPS = [
          { re: /^04/, g: 'forms', fams: [] },
          { re: /^05/, g: 'selection', fams: [] },
          { re: /^06/, g: 'data', fams: [] },
          { re: /^07/, g: 'data', fams: [] },
          { re: /^08/, g: 'navigation', fams: [] }
        ];
        const G = GROUPS.filter((x) => x.re.test(pname))[0];
        if (G) {
          // The complete catalog, split by page contract (not a hand-list that lets families disappear):
          // 04 = fields, 05 = selection/pickers, 06 = data lists, 07 = display/metrics, 08 = navigation.
          if (LIB) {
            G.fams = LIB.pageFams(pname);
          } else try {
            const m = storage.CF && storage.CF.map ? storage.CF.map() : null;
            const NAMEMAP2 = { fab: 'FAB', kpi: 'KPI', otpInput: 'OTP', searchField: 'Search', passwordField: 'Password' };
            const cap = (f) => NAMEMAP2[f] || (String(f).charAt(0).toUpperCase() + String(f).slice(1));
            const PICK = new Set(['select', 'combobox', 'multiSelect', 'datePicker', 'timePicker', 'switch', 'checkbox', 'radio', 'slider', 'rating', 'colorPicker']);
            const DISPLAY = new Set(['badge', 'statusText', 'chip', 'avatar', 'avatarGroup', 'card', 'kpi', 'progress', 'skeleton', 'emptyState']);
            if (m) {
              if (/^04/.test(pname)) G.fams = m.forms.filter((f) => f !== 'fieldBox' && !PICK.has(f)).map(cap);
              else if (/^05/.test(pname)) G.fams = m.forms.filter((f) => PICK.has(f)).map(cap);
              else if (/^06/.test(pname)) G.fams = m.data.filter((f) => !DISPLAY.has(f)).map(cap);
              else if (/^07/.test(pname)) G.fams = m.data.filter((f) => DISPLAY.has(f)).map(cap);
              else if (/^08/.test(pname)) G.fams = m.navigation.map(cap);
            }
          } catch (e) {}
          const specHead = {};
          (kidsOf(top) || []).forEach((c) => { if (typeOf(c) === 'board' && /·Spec(?:·|$)/.test(nameOf(c))) specHead[String(nameOf(c)).split('·')[0].toLowerCase()] = 1; });
          if (!CATB && /^0[3-9] · /.test(pname)) G.fams.forEach((f) => { if (!specHead[String(f).toLowerCase()]) add(LIB ? 'library_drift' : 'reference_drift', null, top, (LIB ? 'paired ' : 'complete ') + G.g + ' catalog: ' + f + ' has no ·Spec board on page ' + pname.slice(0, 2) + (LIB ? ' — the paired library manifest assigns it to this page' : ' — build the whole family set; a source recreation does not delete the families the site does not show')); });
          if (LIB) Object.keys(specHead).forEach((h) => {
            if (G.fams.map((x) => String(x).toLowerCase()).indexOf(h) < 0) {
              const capH = h.charAt(0).toUpperCase() + h.slice(1);
              add('library_drift', null, top, 'paired ' + G.g + ' page contains ' + capH + '·Spec, which is not a manifest component for page ' + pname.slice(0, 2));
            }
          });
          const rootRef = () => { try { const raw = top.getPluginData ? top.getPluginData('nl:ref') : null; return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
          let groupRef = null;
          try { groupRef = (storage.CF && storage.CF.reference) ? storage.CF.reference(G.g) : null; } catch (e) {}
          if (!groupRef) { const d2 = rootRef(); groupRef = d2 && d2[G.g]; }
          let isRecreation = !!groupRef;
          if (!isRecreation) {
            try { if (storage.REF && Object.keys(storage.REF).length) isRecreation = true; } catch (e) {}
            if (!isRecreation) isRecreation = !!rootRef();
          }
          if (!LIB && isRecreation && !groupRef) {
            add('reference_drift', null, top, 'no ' + G.g + ' source profile on page ' + pname.slice(0, 2) + ' — seed CF.setReference({' + G.g + ': {…}}) from the reference CSS before building this chapter; a factory default is legal for a blank file, not for a source-backed page');
          } else if (groupRef) {
            const ALIAS = { textarea: ['textarea'], search: ['search'], field: ['field'], navitem: ['navitem', 'nav'],
              list: ['list', 'listitem'], table: ['table', 'tablerow', 'tableheader'], calendar: ['calendar', 'minicalendar'] };
            // A family is identified by its HOST-NAME prefix, and one family can own several prefixes (List draws
            // `ListItem·`, Table draws `TableHeader·`/`TableRow·`). Matching on the bare prefix alone left every
            // row/header host ungated — the gate passed a page whose rows were still generic (measured 2026-10-23).
            const FAMPAT = { List: /^(?:List|ListItem|Descriptions)(?:·|$)/, Table: /^(?:Table|TableRow|TableHeader)(?:·|$)/, Calendar: /^(?:MiniCalendar|Calendar)(?:·|$)/ };
            const keyFor = (fam) => {
              const ks = [String(fam).toLowerCase()].concat(ALIAS[String(fam).toLowerCase()] || []);
              for (let i = 0; i < ks.length; i++) {
                const hit = Object.keys(groupRef).filter((gk) => gk.toLowerCase() === ks[i] && groupRef[gk] && typeof groupRef[gk] === 'object' && !Array.isArray(groupRef[gk]))[0];
                if (hit) return hit;
              }
              return null;
            };
            const declared = Object.keys(groupRef).filter((k) => groupRef[k] && typeof groupRef[k] === 'object' && !Array.isArray(groupRef[k]) && !/^(families|shapes|variants|source|anatomy)$/i.test(k));
            if (!declared.length) add('reference_drift', null, top, 'the ' + G.g + ' profile declares no family entries — every family this page draws needs a measured or explicitly derived entry');
            (function walkP(k) {
              const nm = nameOf(k);
              // A `Masters·` board is a supporting master sheet, not a family spec page: its children are the atom
              // masters themselves. Judging them as page content produced 10 false reference_drift findings on the
              // 07.11 Masters·Chip support page (measured 2026-10-26); skip the whole subtree.
              if (typeOf(k) === 'board' && /^Masters·/.test(nm)) return;
              if (typeOf(k) === 'board' && !/·Spec(·|$)|-PageRoot$|-Header$|-Footer$|^Masters·/.test(nm)) {
                const fam = G.fams.filter((f) => (FAMPAT[f] ? FAMPAT[f].test(nm) : new RegExp('^' + f + '(?:·|$)').test(nm)))[0];
                const famKey = fam ? keyFor(fam) : null;
                if (fam && famKey) {
                  const st = readProf(k);
                  const entry0 = (storage.CF && storage.CF.profile && storage.CF.profile(G.g, famKey)) || groupRef[famKey];
                  const derived0 = !!(entry0 && entry0.derived);
                  if (!st && !derived0) {
                    const draw = ({ List: 'listItem', Table: 'tableRow', Calendar: 'miniCalendar' })[fam] || fam.toLowerCase();
                    add('reference_drift', k, top, nm.slice(0, 44) + ' carries no nl:prof stamp — it was drawn from the generic kit, not from the ' + G.g + ' profile; run CF.stampPass (measures the render) or rebuild it with the profile-aware factory (CF.' + draw + ')');
                  } else if (derived0) { /* derived family: coverage is the contract, no measured expect — an UNSTAMPED
                    derived host is legal too (st === null); the old `st && derived0` guard let that case fall through
                    to `st.g` and crashed the page audit (measured 2026-10-26 on 08.03 TabBand·Spec) */ } else {
                    if (st.g && st.g !== G.g) add('reference_drift', k, top, nm.slice(0, 44) + ' is stamped from the "' + st.g + '" profile on a ' + G.g + ' page');
                    // Judge against the entry MERGED with the variant the HOST NAME declares (`Card·…·Selectable` — a
                    // factory stamp may record a different axis, and the name is the one both stamp paths agree on),
                    // and profDiff merges the stamp's per-size block over `expect`.
                    const nk = (storage.CF && storage.CF.profKeyFor) ? storage.CF.profKeyFor(nm) : null;
                    const vary = (nk && nk.variant) || st.variant || null;
                    const entry = (storage.CF && storage.CF.profile && storage.CF.profile(G.g, famKey, vary)) || groupRef[famKey];
                    const diff = !entry ? [] : ((storage.CF && storage.CF.profDiff) ? storage.CF.profDiff(entry, st)
                      : (entry.expect ? Object.keys(entry.expect).filter((ek) => entry.expect[ek] !== undefined && String((st.geo || {})[ek]) !== String(entry.expect[ek])).map((ek) => ({ k: ek, want: entry.expect[ek], got: (st.geo || {})[ek] })) : []));
                    diff.forEach((b) => add('reference_drift', k, top, nm.slice(0, 44) + ' draws ' + b.k + '=' + (b.got === undefined || b.got === null ? '—' : b.got) + '; the ' + G.g + ' profile measures ' + b.k + '=' + b.want + (entry.derived ? ' (derived material)' : '')));
                  }
                }
              }
              (kidsOf(k) || []).forEach(walkP);
            })(top);
          }
        }
      }
    } catch (e) { err('reference', e); }

    // ---- rule 62 · catalog_drift — the standard 01–09 design-system contract. Token CAPACITY on 01 and the
    // page → family inventory/order on 03–09 come from `storage.CATALOG` (catalog_engine.js), not from a per-project
    // spec plan. A profile may still change a family's geometry (project decision), so this rule does NOT judge board
    // heights/shelf positions; it judges the stable contract: token capacity, family set, page order and the durable
    // `nl:cat` declaration. A file without the stamp is REPORTED, not passed.
    try {
      const pC = String(out.page || '');
      if (/^0[1-9](?:\.| ·)/.test(pC) && /-PageRoot$/.test(nameOf(top))) {
        const CAT = storage.CATALOG;
        if (CAT && typeof CAT.auditFor === 'function') {
          (CAT.auditFor({ page: pC, root: top }) || []).forEach((x) => add('catalog_drift', x.shape || null, top, x.detail));
          // The plan itself is whole-file data; judge it once, from the first standard page, so a duplicate family
          // listing (the same family on two pages) is reported even when every rendered page happens to match.
          if (/^03(?:\.| ·)/.test(pC) && typeof CAT.planIssues === 'function') {
            (CAT.planIssues() || []).forEach((x) => add('catalog_drift', null, top, x.detail));
          }
        } else {
          add('catalog_drift', null, top, pC + ' is a standard-system page and `storage.CATALOG` is not seeded — load scripts/catalog_engine.js and call CAT.seed(); its durable `nl:cat` stamp proves the file declared the standard, then build the chapter with CAT.buildPage');
        }
      }
    } catch (e) { err('catalog', e); }

    // ---- rule 59 · free_layout — pages 01–09 judge ARRANGEMENT, not just values: a content board's elements are
    // flow or grid children (rowGap/columnGap/padding — values already judged by space_off_scale — or grid cells).
    // An absolutely-positioned non-overlay child is the defect: measured (api-pitfalls §coordinates), a board's
    // absolute children hold world coordinates and do NOT follow the shell, so free layout cannot re-flow after a
    // token change and cannot be nudged into compliance — only rebuilt. Control-host interiors are the declared
    // anatomy exemption (the host itself is still judged as a child of its board).
    try {
      const pF = String(out.page || '');
      if (/^0[1-9](?:\.| ·)/.test(pF) && /-PageRoot$/.test(nameOf(top))) {
        const OVL_RE = /^(scrim|overlay|veil|wash·|sheen·|ring·|hitpad·|slot·|connector|tail·|rail·|boundary·|underline·)/;
        let flN = 0;
        const walkFL = (b, depth) => {
          (kidsOf(b) || []).forEach((c) => {
            const nm = nameOf(c);
            if (OVL_RE.test(nm) || /-Header$|-Footer$|-PageRoot$/.test(nm)) return;   // overlays + chrome, by contract
            const isArr = (c.layoutChild && c.layoutChild.absolute === false) || !!(c.layoutCell);
            if (!isArr) {
              flN++;
              if (flN <= 8) add('free_layout', c, b, '"' + nm.slice(0, 40) + '" is absolutely positioned inside "' +
                nameOf(b).slice(0, 32) + '" — on pages 01–09 arrange elements only with rowGap/columnGap/padding or a grid (values on the spacing scale); absolute is legal only for a named overlay');
              return;   // a free-laid subtree is already off-contract; its interior is judged by its own producer
            }
            if (typeOf(c) === 'board' && depth < 6 && !controlFamily(nm)) walkFL(c, depth + 1);   // host interiors exempt
          });
        };
        (kidsOf(top) || []).forEach((b) => {
          if (typeOf(b) === 'board' && !/-Header$|-Footer$|-PageRoot$/.test(nameOf(b))) walkFL(b, 0);
        });
        if (flN > 8) add('free_layout', null, top, (flN - 8) + ' more free-laid children on this page (first 8 reported)');
      }
    } catch (e) { err('freeLayout', e); }

    const fails = Object.keys(out.counts).filter((key) => key.charAt(0) !== '_' && RULES[key]);
    out.verdict = fails.length ? 'NEEDS_REPAIR' : 'CLEAN';
    out.rules = Object.keys(RULES);
    return out;
  };

  // ---------------------------------------------------------------- batch runner (same contract as audit_layout.js)
  storage.designStart = function (pages) {
    storage.designQueue = (pages || penpotUtils.getPages().map((p) => p.name)).slice();
    storage.designReport = {};
    return { queued: storage.designQueue.length };
  };
  storage.designNext = async function (opts) {
    const q = storage.designQueue;
    if (!q || !q.length) return { done: true, report: storage.designReport };
    const name = q[0];
    if (penpot.currentPage.name !== name) {
      penpot.openPage(penpotUtils.getPageByName(name));
      await new Promise((r) => setTimeout(r, 700));
      if (penpot.currentPage.name !== name) return { wait: penpot.currentPage.name, want: name };
    }
    const page = q.shift();
    const r = storage.designPage(opts);
    storage.designReport[page] = { verdict: r.verdict, counts: r.counts, boards: r.boards, shapes: r.shapes,
      breath: r.breath, radius: r.radius, screenPage: r.screenPage, screens: r.screens,
      findings: r.findings.slice(0, 12), sizes: r.sizes, tier: r.tier, errors: r.errors, provenance: r.provenance };
    if (q.length) penpot.openPage(penpotUtils.getPageByName(q[0]));
    return { page: page, verdict: r.verdict, counts: r.counts, remaining: q.length };
  };
  storage.designAll = async function (batch, opts) {
    if (!storage.designQueue) storage.designStart();
    const res = [];
    for (let i = 0; i < (batch || 4); i++) { const r = await storage.designNext(opts); res.push(r); if (r.done) break; }
    return res;
  };
  /** The merged gate: G13 blocks delivery only when BOTH auditors are clean.
      SCOPE DISCIPLINE (positioning-audit G8: audit dimensions must stay orthogonal): this gate judges ONE page scope.
      G16's file-level coverage is therefore reported here but does NOT decide its verdict — otherwise a screen page
      would read NEEDS_REPAIR because page 01 was hand-composed, and the per-block build loop could never close.
      `storage.designCoverage()` is the delivery step that owns that verdict (SKILL.md step 7, contract §8). */
  storage.designGate = function (opts) {
    const d = storage.designPage(opts);
    const g = storage.auditPage ? storage.auditPage(opts || {}) : { verdict: 'not seeded: audit_layout.js', counts: {} };
    const c = (storage.FN && storage.FN.coverage) ? storage.designCoverage() : null;
    return { verdict: d.verdict === 'CLEAN' && g.verdict === 'CLEAN' ? 'CLEAN' : 'NEEDS_REPAIR',
      design: { verdict: d.verdict, counts: d.counts, provenance: d.provenance, breath: d.breath, radius: d.radius },
      layout: { verdict: g.verdict, counts: g.counts },
      coverage: c ? { verdict: c.verdict, missing: c.missing, foreign: c.foreign, offChapter: c.offChapter }
        : 'FN not seeded — run storage.designCoverage() at delivery (gate G16) after seeding foundations_engine.js' };
  };
  storage.designRules = function () { return RULES; };
  /** The FILE half of G16, run once per delivery. A per-page audit cannot see that the chapter is missing a board:
      the pagination this skill ships is block-per-page (`01.09 · Foundations · Palette`), so each chapter is spread
      over ~9 pages and coverage is only decidable across the file. Reads FN, so it costs one call and draws nothing. */
  storage.designCoverage = function () {
    const FN = storage.FN;
    const CAT = storage.CATALOG;
    const catFindings = (CAT && typeof CAT.pageIssues === 'function') ? CAT.pageIssues()
      : [{ detail: 'storage.CATALOG is not seeded — the standard 67-page block inventory cannot be checked (load catalog_engine.js)' }];
    const catVerdict = catFindings.length ? 'NEEDS_REPAIR' : 'CLEAN';
    if (!FN || !FN.coverage) return { verdict: 'NEEDS_REPAIR', catalog: { verdict: catVerdict, findings: catFindings },
      err: 'storage.FN is not seeded (G1 seeds foundations_engine.js last) — chapter coverage cannot be read' };
    const c = FN.coverage();
    return { verdict: c.verdict === 'CLEAN' && catVerdict === 'CLEAN' ? 'CLEAN' : 'NEEDS_REPAIR',
      catalog: { verdict: catVerdict, findings: catFindings },
      pages: c.pages, chapters: c.chapters.map((r) => ({ chapter: r.chapter, pages: r.pages,
      required: r.required.length, covered: r.covered, missing: r.missing, foreign: r.foreign, offChapter: r.offChapter })),
      missing: c.missing, foreign: c.foreign, offChapter: c.offChapter, contract: FN.CHAPTER, exempt: FN.EXEMPT };
  };
  storage.designDelegated = function () { return DELEGATED; };
  storage.designCFG = function () { return CFG; };

  return { seeded: 'design-lint', rules: Object.keys(RULES), delegated: DELEGATED,
    fns: ['designPage', 'designStart', 'designNext', 'designAll', 'designGate', 'designRules', 'designCoverage'] };
})();
