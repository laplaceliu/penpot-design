# Component Library — variant taxonomy, minimum variant set, anatomy numbers

> **Purpose**: this file defines what a component board must *contain*. `references/design-guide.md` says how a design must
> **behave** (spacing/typography/color/elevation), `references/layout-library.md` says where things **go**,
> this file says **which variants and states each component must show** — as numbers, with a factory key per row.
> Every row's `CF` key is implemented in `scripts/component_factory.js`; if a variant is not producible by `CF`,
> **add it to `component_factory.js`** (gate G12), never hand-build a one-off board in `execute_code`.
>
> **Provenance**: **[spec]** = published value (AntD token table / M3 material-web tokens v0.192 / MUI source / Carbon SCSS /
> Primer SCSS / WCAG 2.2) → HARD. **[obs]** = cross-system consensus → a default, movable by one scale step.
> Values measured from the recreation target always win over both (design-guide §0 precedence).

## 0. Use rules (gate G12)

1. **A component is a family of variants, not a shape.** A board showing one resting-state rectangle is an instant amateur tell.
   Each family below lists a **minimum variant set** (what must exist) and a **minimum state set** (what must be drawn per variant).
2. **Never hand-place control geometry.** Sizes come from the ladder in §2 (`CF.ladder(size)`), paddings from `design-guide §1`,
   positions inside a screen from `LY`. The factory computes width from label + padding, not from a typed number, unless the
   board is a fixed-width spec matrix.
3. **Assembly ownership still applies** (`penpot-structure.md §4.3`): a control with more than one layer is a **group** (or a
   component when it is reused), never a stack of loose siblings. `CF.*` always returns exactly one host shape with everything
   mounted inside it.
4. **Variants are declared in Penpot, not in prose.** Register each family as a variant container with the properties in §6;
   a `·` separated name (`Button·Primary·Md·Hover`), never `/` in a component name.
5. **State layers are tints over the base color, not different hex values** (§1.2). A hover that changes the fill hue fails
   `state_coverage` even if it looks plausible.
6. **A control with a master is placed, not redrawn.** `CF.autoRegister` promotes the first host of each name and
   `CF.componentize` swaps matching copies in place; any later host whose name already has a master and was drawn by hand signals
   `not_component` (rule 27, gate G13). Place with `CF.instance(name, {parent, text})` (§5.2). Copies accept size/position/
   text/fill overrides but **reject structural edits** — when a variant needs a child the master lacks (a label slot, a status
   chip), add the slot in the factory so it gets its own master; never bolt siblings onto an instance.

## 1. State model

### 1.1 The seven axes every interactive control must resolve

`default → hover → focus(-visible) → pressed → selected/checked (± indeterminate) → disabled → loading`

Plus, for fields: the **validation trio** `error / warning / success`, plus `readonly`. Plus, for reorderables: `dragged`.
Union verified across M3 (state layers), MUI (class names), Carbon (focus mixin), AntD (token table), Primer, Spectrum (`isPending`).

| Axis | What changes | Consensus value |
|---|---|---|
| hover | +state layer tint **and** the family's `hover` elevation recipe when `storage.EL` declares one — a control/card **lifts** (the source's own stack grows 2 → 6 drop layers and keeps its inset lip), not just tints | **8%** overlay [spec M3 `hover-state-layer-opacity`] + the EL lift (gate **G18**, rule 54 `hover_flat`) |
| focus | state layer **12%** + **focus ring** (atomic control) **or** state layer **12%** + a boundary reserved at alpha **0** (composition — §1.3) | ring **2px** thick, **2px offset**, contrast **≥3:1** vs adjacent, drawn **tight on the focus unit** [spec WCAG 2.4.11 AA] |
| pressed | state layer **12%** (+ label/icon shifts 1px down for tactile systems) | [spec M3 `pressed-state-layer-opacity` .12] |
| dragged | state layer **16%** + elevation level 3 + slight scale | [spec M3 `dragged-state-layer-opacity` .16] |
| selected | persistent fill tint + 2px accent border **or** accent fill (never both a hover tint and a selected tint at the same alpha) | [obs] |
| disabled | content alpha **.38** (M3) / **.25** (AntD `colorTextDisabled`); container **.12** fill + border at 40% | [spec] **not** "grey hex invented per file" |
| loading | spinner replaces the leading icon, **width stays constant**, label stays readable | spinner 16–20 inside a 32–40 control [obs]; delay 300–1000ms before showing (Spectrum `isPending`) to avoid flash |

**HARD**: the focus ring is drawn as its own layer/shape (or a 2px inner stroke), never as a change of the control's own border
color at 1px. `state_coverage` fails a board whose only "focus" is a darker border.

**HARD (G18)**: when a family has an elevation role (`EL.roles`), its `·Hover` cell must carry the **lift** recipe and its
`·Pressed` cell the press recipe — a hover cell with 0 shadows is `hover_flat` (rule 54). Focus/Selected/Disabled are
neutral states: they keep the base stack (the fill alpha carries the state). The role is resolved from the host name,
and a name with no type segment (`Button·MD`) is the default type, not an unknown `Md` type.

### 1.2 State layers, mechanically (what `CF` does)

Overlay tint = base fill + a second fill at the alpha above, same hue. On dark surfaces the overlay is **white**, on light surfaces
it is the **ink** color — that is the only polarity swap. A component board must show the tint applied to the *same* base color,
so the reviewer can see that hover is not a different blue. The elevation delta is layered on top of the tint by `CF.elevate`
(when EL is seeded): base/hover/pressed come from `EL.roleFor(host.name, family)`, so a factory cannot ship a flat hover
while the system declares a lift (the same "a rule that is not measured is not enforced" discipline as the radius gate).

### 1.3 The two focus expressions (`CF.FOCUS`, chosen by family role)

The focus state itself is HARD (§1.1). Its **form** is not: a rectangle is right on some controls and wrong on others, and
"wrong" is decided by what the keyboard actually lands on, not by taste.

| Role | The control is… | What is drawn | Families |
|---|---|---|---|
| `outline` | one plate the keyboard lands on (a button, a field, a checkbox, **one** OTP digit, **one** page cell, **one** slider thumb) | `ring·focus`: 2px, 2px offset, **tight on that unit**, ≥3:1 against the surface, the unit's own corner | everything not named below |
| `reserved` | a **composition** whose rows/nodes are bands of copy with no plate of their own | `ring·focus` authored at the unit box with `strokeOpacity: 0` — the slot, width and corner exist in the layer tree so a runtime only raises the alpha — **plus** the perceivable cue: `wash·focus`, the 12% brand state layer (§1.2) on the focused unit | Steps · Anchor · Menu · Breadcrumb · Tree · Table · TableRow · TableHeader · TableState · Accordion · ListItem · Descriptions · Transfer · MiniCalendar · CommandPalette |

**HARD — a ring is drawn on the focus UNIT, never on the container.** `ctx.ring` used to replace the box the factory passed
with "host board + 2px", so every composition got one rectangle around the whole thing: measured 2026-10-22 on
`08 · Navigation`, **20 of 20** rings were host+2 — a 775×24 band over a five-node step timeline, a 224×152 box around a menu
whose focused item is 32px, a 128×200 rail around a 28px active row. The factories already computed the unit
(`CF.steps` → the active node, `CF.menu` → the highlighted row, `CF.otp` → the digit, `CF.anchor` → the active line,
`CF.miniCalendar` → the selected day); the bug threw it away.

**HARD — a ring takes the corner of the VISIBLE plate, not a transparent wrapper.** `TK.ringHost` resolves the owner by enclosure + concentricity, and when a wrapper board and its visible plate share the same box (a `Switch` host 44×22 r0 around a `track` 44×22 r9999, a `Checkbox` host around its `box`, an `Input` host around its `field`) the tie is broken by depth — the innermost plate wins. Decorative layers (`sheen·`, `hitpad·`, `wash·`, `clip·`, `surface·`, `hairline·`, `state·layer`) are never owners. A nested owner's corner is trusted by the sweeps only when it is on the live radius ladder; a wrapper's `r0` must never square the ring. This is what keeps a pill switch's focus outline pill-shaped after `roleSweep`/`ringSweep`, not only at birth.

**HARD — a circular unit gets a circular ring.** If the resolved owner is an ellipse, the ring's two margins must agree. A 20×20 radio inside a 20×24 host gets a **24×24** ring, not a 24×28 oval: `ctx.ring` compares the requested unit to `this.box` (what the factory asked for), never to the host box with a 6px tolerance, and `TK.ringSweep` refits an ellipse-owned ring to the smaller measured margin. Rule 37 `ring_off_host` reports an oval whose margins disagree.

**HARD — one hit pad per control.** `ctx.hitPad` is idempotent by name and size: `place()`'s `autoHit()` reuses the explicit pad instead of stacking a second identical `hitpad·44×32`. Two pads are a duplicate layer, not extra touch safety.

**HARD — `reserved` is never only a hidden border.** A boundary at alpha 0 reserves a slot; it is not an indicator
(WCAG 2.4.7 needs one to be *perceivable*). Rule 44 `focus_invisible` fails a ghost boundary whose control carries no visible
focus layer, and rule 16 `focus_ring_missing` no longer counts a layer that does not paint (alpha ≥ .05), so an invisible box
can never satisfy the focus gate.

## 2. Control geometry ladder

| Key | Height | Font | Pad-X | Icon | Radius | Gap icon↔label | Where it is the default |
|---|---|---|---|---|---|---|---|
| `xs` | **24** | 12 | 8 | 14–16 | `control` | 4 | dense table cell actions, inline edit, chips |
| `sm` | **28–32** | 13 | 10–12 | 16 | `control` | 6 | secondary toolbar buttons, filters [spec AntD `controlHeightSM` 24, Primer sm 28] |
| `md` | **32** | 14 | 12–16 | 16–18 | `control` | 8 | **the web default** [spec AntD `controlHeight` 32, Carbon S/M, shadcn h-8] |
| `lg` | **40** | 14–15 | 16–24 | 18–20 | `control` | 8 | forms, marketing CTAs [spec AntD `controlHeightLG` 40, M3 button 40dp] |
| `xl` | **44–48** | 15–16 | 20–24 | 20 | `control` | 8 | touch-first primary actions [spec WCAG 2.5.5 AAA 44, mobile 48dp] |
| `2xl` | **56** | 16–18 | 24–32 | 24 | `control` | 12 | hero CTA, checkout button |

- **The Radius column is a role, not a number (HARD).** `CF.ladder(size).radius` returns `'control'`, and `CF.radius('control')`
  resolves it against the **declared `borderRadius` token set** (`CF.ROLE`: control→`full`, box→`xs`, tile/badge→`sm`,
  card/field/panel→`md`, slab/inverse→`lg`, hero→`xl`, flat→`none`, **ring→`host`** — a ring is a derived outline and takes
  the corner of the control it surrounds, never a ladder step of its own). Hand-writing `radius: 8` or `radius: h / 2` is what
  produced the orphan corners this rule removes: every writer path (`ctx.plate`, `ctx.ring`, `ctx.clip`, `CF.build`,
  `NL.frame`, `NL.plate`, `storage.mkAbsBoard`, `storage.mkRect`) passes through `CF.radius()`, which snaps an off-ladder
  number to the nearest step and records the coercion in `CF.coerced`. A drawn control is therefore **always** a token
  corner, and gate rules 35/36/37/38 (`radius_off_ladder`, `radius_unbound`, `ring_off_host`, `ring_detached`) are the
  machine check. For a file drawn before the roles existed, `TK.roleSweep()` is the repair: it forces every control-family
  host (`TK.CONTROL_FAMS`) to `CF.radius('control')` and every `ring·*` plate to its host's corner — on masters **and** placed
  copies, because a write to a master does not re-sync the copies already in the file. `ctx.ring` also fixes **where** the
  ring lives: it mounts inside the control whose plate it outlines, so a ring that sits on the spec board instead of inside
  its control is a stale outline from a refit (rule 38; census and repair `TK.ringSweep()`).
- **Touch floors (HARD)**: mobile/pad target **≥44×44** (AAA 44 [spec WCAG 2.5.5], M3 state layer 40dp, iOS 44pt); web ≥32 with
  spacing exception. A 24px `xs` control is legal on a dense desktop table row **only** when its hit pad makes the target 32+.
- Icon-only buttons are **square**: 28 / 40 / 52 with icon 16–18 / 24 / 28 [obs MUI IconButton paddings 5/8/12].
- Text buttons keep the same height as their solid siblings; only padding and fill change.
- `CF.ladder('md')` returns `{h,fs,padX,icon,radius,gap}` — factories must take size from here, never inline a height.
- **A control's interior is the declared exception to whitespace-first** (design-guide §2.1, gate rules 32–34). Its gaps are
  *anatomy*, fixed by the ladder above at the `inline` level (icon↔label 8, label↔affix 4), and `gap 0` is **correct** for an
  attached control (ButtonGroup, Segmented, table row of chips) — those separate with a named boundary line (`boundary·*`), not with air. The auditor knows
  this: rules 32/33 bind a row only when its members stack into cards or already tried to separate them, and a shape inside an
  instance is never walked. What is **not** exempt is how controls sit next to each other and next to text: that is composition,
  and composition breathes at `LY.breath('block' | 'group', tier)`.

## 3. Families

Notation in **Min variant set**: what must appear on the component's spec board. `×` after a name = repeat per size tier where marked.
Every variant row also carries the state columns from §3.0.

### 3.0 Required state columns per family (signature `state_coverage`)

| Family | State columns the board must draw |
|---|---|
| Button / IconButton / FAB / Segmented / Tabs / Nav item | default · hover · focus · pressed · disabled (+ selected where the control is a toggle, + loading for buttons) |
| Input / Select / Combobox / DatePicker / Textarea | default · hover · focus(+ring) · filled · **error** · disabled · readonly |
| Checkbox / Radio / Switch | unchecked · checked · **indeterminate** (checkbox only) · hover · focus · disabled · (switch: loading) |
| Table row / List item / Card(selectable) | default · hover · **selected** · focus · disabled · loading/skeleton |
| Tag / Chip / Badge / Avatar / Progress / Skeleton | resting · (chip: hover, selected, closable) · (progress: determinate/indeterminate/success/error) |
| Overlay (modal/drawer/popover/tooltip/toast) | closed is not drawn; **open with scrim** + each anatomy band; tooltip: all 4 edge placements minimum (12 if the system documents them) |

### 3.1 A · Actions

| Component | Anatomy (numbers) | Variant axes | Min variant set | CF key |
|---|---|---|---|---|
| **Button** | h per ladder · pad-X · radius · label centered-left with icon · gap 8 · stroke 1px inner (outlined) · shadow only for elevated [spec AntD padding-inline 7/15/15 for 24/32/40; MUI 6×16 md] | `type` (primary · default/outlined · dashed · text · link · ghost · danger) × `size` (xs–2xl) × `icon` (none · start · end · only) × `block` × `shape` (square · round · circle) | primary **×3 sizes**, outlined, dashed, text, link, **danger**, **icon-start**, **icon-end**, **icon-only**, **loading**, **disabled**, **block/full-width** | `CF.button` |
| **IconButton** | square 28/40/52, icon 16–18/24/28, radius 6–8 or circle, state layer = hit area | `edge` (start · end), `shape`, `size`, `tone` (neutral · accent · danger) | 3 sizes × default/hover/focus/pressed/disabled + one **badge-on-icon** + one **selected/toggle** | `CF.iconButton` |

**IconButton tone is a graphic tone, and a graphic tile is material all the way down.** A tile's size, corner, fill or gradient, glyph ink and elevation recipe come from the profile — `actions.icontile.variants[key]` for **`CF.iconTile`**, `actions.iconbutton.variants[type]` for **`CF.iconButton`** — so the factory holds no hexes of its own and a file with no profile gets a flat token plate. Two material rules survive from measurement (2026-10-23) and belong in the recipe, not the factory: a tile whose fill is a **brand gradient** takes a *hue-tinted* glow (a black drop stack under a saturated fill reads as three competing colours), and it takes **no radial sheen** — the gradient already carries the top light. The flush focus ring on a filled brand/ink tile is `color.onDark`, or the profile's `ringInk`. `secondary` is the control surface (`surfaceAlt` + `border`) unless the profile declares `chip:true` (a borderless light raised plate whose hover moves the LABEL via `hoverInk` instead of washing the plate). The name still comes from `type`, so name and paint cannot diverge.

| **ButtonGroup / Compact** | attached: inner radius 0, outer radius kept; `boundary·segment` 1px at 40% between same-tone; gap 0 [spec AntD `Space.Compact`] | horizontal · vertical · with dropdown item · mixed type | 3 attached buttons (primary+outlined+icon), one **split attached** pair, one vertical stack | `CF.buttonGroup` |
| **Split button** | action + 40-wide chevron zone divided by a 1px rule (or 4px gap for the M3 style), total h = ladder | `tone` (primary · outlined), `menuPlacement` | primary split, outlined split, both in hover | `CF.splitButton` |
| **FAB** | **56** (small **40**, large **96**) [spec M3], margin 16, radius full, icon 24, elevation level 3 · extended: label 14/500 pad-X 16–20 h 56 | `size` (sm/md/lg) × `extended` × `tone` (primary · surface · branded) | sm, md, **extended**, lg, docked-over-content | `CF.fab` |
| **Link** | 14–15, underline on hover only (never a permanent underline inside body text at 14), gap 4 with icon | plain · with-icon · muted/disabled | inline-in-paragraph sample, nav link, **visited/disabled** | `CF.link` |
| **Toggle / Segmented** | track = row of `md` segments, active segment filled + radius, h 32–40, pad 4 inside the container [obs; M3 segmented 48dp h] | `count` (2–4), `iconOnly`, `size`, `fullWidth` | 3-segment default + selected variant, icon-only 4-segment, disabled segment | `CF.segmented` |

**HARD — a recreation builds the SOURCE's action inventory, not `CF.map().actions`.** Read the reference before the page and record its measured families/shapes in the project's DESIGN.md; only those families are drawn. Seed `CF.setReference({actions:{families,shapes,variants,anatomy}})` (stamped as `nl:ref` on the PageRoot) before page 03; `reference_drift` fails any spec family the source lacks, any host whose corner is not one of the family's pinned roles, and — through `anatomy` — a pinned material defect. `variants` can pin a family's minimum variant count and `iconSlot:false`, so the gate does not demand a variant the source never shows. The measured values (sizes, radii, materials) are project data, not part of this skill.

**A Button family may have more than one material role, and `type` selects the recipe.** A common source pattern is a dark machined plate (`control`: drops + insets + sheen) for the primary action and a **light chip** (`chip`: two small drops + insets + sheen), **no border**, ink label, with the hover expressed in the label rather than a fill tint. A secondary button that inherits a generic `secondary` tone's 1px border and the `control` stack is not the source. The project profile pins the material:

```js
anatomy: { 'Button·Secondary': { stroke: false, elevation: 'chip', focusRing: 'flush' } }
```

`CF.button` draws a secondary chip borderless, with the chip state expressed by **label ink + elevation** (no grey overlay); its focus ring is flush (offset 0) because a bordered halo with a gap reads as a detached frame. `EL.roles.Button.byType.secondary` supplies `chip`/`chipHover`; `EL.roleFor` resolves the TYPE before the state, so hover lifts `chip → chipHover` instead of inheriting the primary stack.


### 3.2 B · Text fields

The **input family is where thin component systems show up first**. A bare rounded rectangle is never acceptable.

| Component | Anatomy (numbers) | Variant axes | Min variant set | CF key |
|---|---|---|---|---|
| **Input (text)** | h 32/40 by size, pad-X 12, radius 6–8, border 1px → **2px on focus** (focus ring at 2px offset instead, pick one and be consistent) [spec M3 outlined 1→2, AntD `lineWidthFocus` 3 halo], text 14, caret color = primary | `variant` (**outlined · filled · borderless · underlined**) × `size` (sm/md/lg) × `status` (default · error · success · warning) × `readonly` × `disabled` | all 4 variants × (default, focus, error, disabled) = the matrix, plus **hover** | `CF.input` |
| **Input with icon** | leading icon 16–18 at pad-X 12, text shifted by icon+8; trailing icon same mirror [spec M3 field icon 24, padding 16] | `slot` (prefix only · suffix only · both) | **prefix icon** (search/mail), **suffix icon** (calendar/info), prefix+label combo | `CF.input` (`lead`/`trail`) |
| **Input with clear** | suffix clear ✕ 16, appears only when filled and hovered/focused, hit pad 24–32, gap 4 | `allowClear` | filled + focused with **clear visible** | `CF.input` (`clear:true`) |
| **Input with counter** | `12 / 80` at 12px, muted, **outside** the border (bottom-right, 4 below) or inside as suffix when the field is short; red when over | `showCount` | with counter, one **over-limit** in error | `CF.input` (`count`) |
| **Addon input** | attached segments: addon h = field h, pad-X 12, bg filled-neutral, inner radius 0, outer radius kept (e.g. `https://` · `+86` · `.pdf` · unit `kg`) [spec AntD `addonBefore/addonAfter`] | prefix-addon · suffix-addon · both | `https://` + field, field + `kg`, select-as-addon | `CF.input` (`addonBefore`/`addonAfter`) |
| **Password** | field + **eye toggle** 20–24 trailing (hit 32), masked dots use `•` at 2px letterspacing, reveal keeps the caret | `reveal`, `strength` | masked · revealed · **with strength bar** (4–6 h, 4 segments, labels 12) | `CF.passwordField` |
| **Masked / formatted** | placeholder shows the mask (`(555) 123‑4567`, `4242 4242 4242 4242`, `12/31/24`), digits grouped by the mask, brand marks 20–24 trailing for card | `mask` (phone · card · date · currency · custom) | phone, card **with brand icon**, currency with unit prefix | `CF.maskedInput` |
| **OTP / code** | **6 boxes 44–48 × 56–64**, gap 8–12, extra group gap after the 3rd, one hidden input; active box = 2px accent + centred caret, disabled has neither (loading = centred 16px spinner, never a corner badge); filled boxes = dot or digit centered; error = red border on all + 13px message | `length` (4–8), `grouped`, `dashes`, `loading` | 6-box grouped, 4-box, error state, one **with resend timer** | `CF.otpInput` |
| **Search field** | h 32–40, radius 6–8 **or** full (pick one system-wide), leading 16–18, trailing clear + optional `⌘K` kbd chip 20–24 h, mono 11 | `inline` vs `overlay`, `shortcutHint`, `withButton` (AntD search = field + attached primary button) | field-only, field+clear, field+**attached button**, with kbd hint | `CF.searchField` |
| **Textarea** | min-h = 3 lines (rows×lineHeight + pad-Y 8–12), max-h with internal scroll, resize handle 14 bottom-right or `none`, counter bottom-right outside | `autosize` (min/max rows), `resize` (none · vertical), `count` | empty, filled with 4 lines, **autosized to content**, max-height with scroll | `CF.textarea` |
| **Number stepper** | field + attached − / + 32×32 buttons with a **20px icon slot / 1.7 stroke** (never the full 32px plate — `CF.iconBox`) (or hover-revealed up/down 16 arrows in a 24 gutter), value right-aligned, unit as suffix addon, min/max clamps shown by disabled arrows | `attached` vs `hover-reveal`, `unit`, `precision` | default, one arrow **disabled at min**, with unit, with value right-aligned | `CF.numberField` |
| **Select** | h = input ladder, trailing chevron 16–20 at pad 12, placeholder muted, selected normal; panel: row **32–40** pad-X 12–16, option 14, group header 12 uppercase muted, hover tint 8%, selected = accent text + 8% tint + check 16, max-h 280–320 scroll | `size`, `variant`, `loading`, `allowClear` | closed default, **open panel** (with hover + selected + disabled option), grouped with headers, **no-results**, loading | `CF.select` |
| **Combobox / autocomplete** | select + editable text, suggestions filtered, highlighted row (keyboard), free-solo entry "Create …" row | `freeSolo`, `grouped`, `async` | open with 5 suggestions + 1 highlighted, create-new row, **async paging with skeleton row** | `CF.combobox` |
| **Multi-select with chips** | chips **24–32 h** inside the field, gap 4, field min-h = ladder, `+N` overflow chip, per-chip ✕ 14–16, chips wrap to a second row (height grows) [spec AntD `maxTagCount` responsive] | `maxTagCount`, `chipRemovable` | 3 chips + `+2`, one chip on hover with ✕, at max reached (input disabled) | `CF.multiSelect` |
| **Date / time picker** | field = input ladder + trailing calendar 16–20; panel **280–360** wide, header row 40 (month ‹ › 32), weekday row 28 muted, **day cell 40×40** [spec M3 date-picker-modal 360×568, day cell 40], today ring, selected fill, range tint 12% between, footer 40 with presets + Cancel/OK 32 | `mode` (date · range · datetime · month · year), `presets`, `timeZone` | single open panel, **range in-progress** (start+hover end), datetime with time column, presets row, disabled past dates | `CF.datePicker`, `CF.timePicker` |
| **Form field wrapper** | label 13–14/500 above (**gap 6–8**) or beside at 240–280 on desktop, required `*` 12 danger, control, helper/error 12–13 at **4 below**, field-to-field gap 16–20 [spec AntD form margin 24, `margin-dense` 0] | `labelPlacement` (above · beside · floating), `helper`, `error`, `inline-validation` | label-above default, label-beside (settings), **error with icon + message**, success (validating spinner → check), helper-only, **required** | `CF.field` |
| **Switch** | **AntD 44×22** track, handle 18 [spec]; **M3 52×32** track, handle **16 → 24 selected → 28 pressed**, outline 2px, icon 16 [spec]; small 28×16 · label side left/right · loading spinner in the handle | `size` (sm/md), `labels` (on/off text inside), `icons`, `loading`, `destructive` | off, on, **pressed (handle grown)**, disabled off/on, **with inner icon**, loading | `CF.switch` |
| **Checkbox** | box **18–20**, radius **4 (`radius.xxs`)**, border 2px, check 12–14 stroke 2, state layer hit area **40×40** [spec M3], label 14 gap 8–12, row h 32–40; the focus ring is **flush** on the visible box (no outset halo), white on a checked/red box | `indeterminate`, `size`, `inTableHeader`, `card` | unchecked, checked, **indeterminate**, hover, focus ring, disabled checked + disabled unchecked, **select-all header row** | `CF.checkbox` |
| **Radio / radio card** | ring 20, dot 10–12, state layer 40 [spec M3 proxy via checkbox layer], label 14 gap 8; radio card = full card with 2px accent border when selected | `orientation`, `asButton` (AntD `Radio.Button`), `card` | 3 stacked radios (one selected), inline row, **as button group**, **radio card with title+meta+image** | `CF.radio` |
| **Slider** | track 4–6 h radius full, active 4–6 accent, handle **20 (hover ring 8% at 40)** or M3 20dp with 40dp state layer, value label 24 above on drag, marks 2px ticks + 11px labels, step rail h 40 total | `continuous` vs `steps`, `range` (two handles), `marks`, `vertical`, `disabled` | default at 40%, **with marks + labels**, **range with two handles**, dragged (handle grown + value label), disabled | `CF.slider` |
| **Rating** | stars 16–20, gap 2–4, half-star via clip, readonly shows value text | `count`, `half`, `readonly`, `size` | empty, 3.5 **with half star**, hover-preview, readonly with count | `CF.rating` |
| **Color picker** | swatch trigger 24–32 + hex field, panel: grid 8×6 swatches 24, hue bar 12×200, input row | `presets` vs `custom` | trigger closed, open panel with hue bar + presets grid | `CF.colorPicker` |
| **Upload** | dropzone dashed 2px radius 12 h **160–200**, icon 40 + "Drag files or browse" 14–15 + hint 12 · file row 48–56: icon 24 + name 14 + size 12 + progress 4 h + status icon 16 + ✕ | `dropzone`, `list`, `perFileStatus`, `imageGrid` | dropzone idle, dropzone **active/dragging**, rows: uploading (with bar), success, **error with retry**, image grid 64 thumbs | `CF.upload` |
| **Transfer** | two panels 240–280 × 320, header 40 with count + select-all checkbox, list rows 36–40, middle buttons 32–40 vertical | `withSearch`, `pagination` | both panels populated, one item selected each, disabled item | `CF.transfer` |
| **Tree select** | node row 32–36, indent **16/level**, guide lines 1px optional, chevron 16, checkbox 18, icon 16–20 | `checkable`, `directory`, `async` | 3 levels with one expanded, **checkable with parent indeterminate**, async node with spinner | `CF.tree` |

**A label is a slot, not a decoration** (`Checkbox` / `Radio` / `Switch`). A bare master has no text child, and a component
copy **refuses structural edits**, so a labelled row built from the bare master could not carry its copy. These three factories
therefore name the labelled composition with a `Label` slot — `Checkbox·Md·Checked·Checked-Label`, `Radio·Md·Selected·Selected-Label`,
`Switch·Md·On·On-Label` — which registers a **separate master** that owns the text. Place the `…·Label` name when label and
control ship as one host; keep the label as a sibling only when the copy differs per row (facet filters are the measured case) —
that is a deliberate group, not a component row, and must not be counted as one in coverage.

### 3.3 C · Data display

| Component | Anatomy (numbers) | Variant axes | Min variant set | CF key |
|---|---|---|---|---|
| **Table header cell** | h 40–48, 12–13/600 uppercase-ish muted, sort chevron 16 right (gap 4), filter icon 16 when active (accent), resize handle 4 with 1px rule, pad-X **16** (middle 12, dense 8) [spec AntD cell padding 16×16] | `align` (left · **right for numeric**), `sortable`, `filterable` | plain, **sorted-asc**, sorted-desc, **filter-active**, numeric right-aligned header | `CF.tableHeader` |
| **Table row** | h **48 default / 40 middle / 32 dense** [spec AntD sizes], cell pad 16/12/8, NO bottom hairline — row separation is the container's `rowGap` (`space.md`), hover tint 8%, selected tint 12% + accent bar 2px left, checkbox col 44 | `density`, `selection`, `expandable`, `editing`, `zebra` | default, **hover**, **selected (with checkbox checked)**, expanded (child block 40–88 tinted), **row in inline-edit** (input 32 + Save/Cancel), **disabled** | `CF.tableRow` |
| **Table loading / empty / error** | skeleton rows = same geometry as real rows (bars 12 h, radius 4, tint pulse) · empty block centered, 200+ h · error row with retry | `skeletonCount`, `empty`, `error`, `noPermission` | skeleton table, **empty with action**, error with retry | `CF.tableState` |
| **List item** | 1-line 40–48 · 2-line 64 · 3-line 88 (M3 56/72 [spec]), leading media 24/40/48/56, title 14/500, sub 13 muted (**1 line, ellipsis**), meta right 12–13, trailing 24–32 action or chevron 16, NO divider — the list container supplies `rowGap` (`space.md`) | `lines` (1 · 2 · 3), `leading` (avatar · icon · thumb · checkbox · none), `trailing` (meta · action · chevron · switch · menu), `selected` | 1-line plain, 2-line with avatar, 3-line with thumbnail + trailing menu, **with checkbox**, with trailing switch, **selected**, dense | `CF.listItem` |
| **Card** | pad **24** (16 compact, 20–24 dense), radius 8–12, header 56 (title 16/600 + subtitle 13 + extra 24–32), body, footer 64 (actions right, `boundary·footer`), cover media full-bleed, `actions` row 48–56 icons 24 equal-split [spec AntD card] | `tone` (outlined · filled · elevated) × `media` (none · top · inline-left) × `header` × `footer` × `selectable` × `loading` | outlined, elevated (level 1), **with cover**, with header+extra, **with action row**, **selectable (checked)** , skeleton card | `CF.card` |
| **Statistic / KPI** | label 12–13 muted, value **28–36/1.0 tabular**, delta 13 + arrow 12–16 (success/error color **plus** sign — never color alone), sparkline 60–80×24, pad 20–24, h 120–160 | `sparkline`, `delta`, `prefix/suffix`, `compact` | full KPI (label+value+delta+spark), compact (label+value), **negative delta**, value-only | `CF.kpi` |
| **Tag / chip** | h **24 small / 32 default** [spec M3 chip 32, icon 18, avatar 24], radius 4 (tag) or full (chip), pad-X 8–12, dot 6–8 leading, icon 14–16, ✕ 14–16 at gap 4 | `kind` (**status tag · filter chip · input chip · actionable chip · link**) × `tone` (neutral · accent · success · warning · danger) × `removable` | tag per tone (4), filter chip selected/unselected, input chip with avatar, removable on hover, **`+N` overflow chip**, small 24 counter tag | `CF.chip` |
| **Badge** | dot **6** / pill **h 20 min-w 20**, width = measured label + 12 (pad-X 6 each side), font **12/700** (10–11 would fail the ramp minimum, design-guide §3.2), radius `full` (a pill binds the token, never `h/2`), offset −4 to −8 onto its host, overflow **99+**, optional `surface` ring 2 | `dot` vs `count` vs `status(text+dot)`, `standalone`, `soft`, `ribbon`, `showZero` | count on icon, **dot only**, `99+` overflow, status list (success/processing/default/error), ribbon corner, standalone | `CF.badge` |
| **Avatar** | **24 / 32 / 40 / 48 / 64 / 96**, circle or radius 6, initials 12–14/600, fallback = initials then icon then broken-image, presence dot 8–10 with 2px surface ring [spec AntD sizes] | `shape` (circle · rounded · square), `size`, `content` (image · initials · icon), `status`, `group`, `editable` | 3 sizes with image, **initials fallback**, **group of 4 with `+2` overflow**, presence dot, square, **editable (camera on hover)** | `CF.avatar`, `CF.avatarGroup` |
| **Status text** | dot **8** + gap 4 + label 12–13; dot colour carries the tone and the label repeats it in words (never colour alone); optional right meta 12 muted; host width = 12 + measured label | `tone` (neutral · accent · info · success · warning · danger), `size`, `pulse` | one row per tone, with right meta, muted label for a neutral state | `CF.statusText` |
| **Progress** | linear h **4–8** radius full, track 12% ink, fill accent, label 12 right or above · circular **48** (stroke 4 [spec M3]) · dashboard = 270° arc · steps = segmented bar n cells gap 2 | `type` (line · circle · steps · dashboard), `status` (normal · success · exception), `indeterminate`, `format` | line determinate with %, **line indeterminate**, line success + error, circular 48 with value, **segmented steps** | `CF.progress` |
| **Skeleton** | bars 12 h radius 4, gap 8, block tint + 8% shimmer; **geometry must match the real component it stands for** | `variant` (text · rect · circle · button · avatar · paragraph), `animated` | paragraph (3 lines), **list-row skeleton**, card skeleton, avatar+text skeleton | `CF.skeleton` |
| **Descriptions** | label 13 muted width **160–200** (or 240), value 14, row h 40–48, column gap 24–32, optional 1px grid (bordered variant) [spec AntD descriptions] | `bordered`, `columns` (1 · 2 · 3), `span` | 2-column plain, **bordered grid**, one item spanning 2 columns, long value wrapping | `CF.descriptions` |
| **Timeline** | node 10–12 dot (or icon 20), **connector 1–2px at x 11–15**, row h 40–72, content right of node gap 16, date 12 muted, `pending` = dashed tail | `dot` vs `icon`, `alternate`, `pending`, `labelPlacement` | 4 rows with dates, one with an avatar node, **pending**, one with an error node | `CF.timeline` |
| **Accordion / collapse** | header 48–56 (title 14–16 + chevron 16 rotating, gap 12), body pad 12–16 all sides — the body copy is CENTRED in its band, never `top 0`; items separated by a 12px internal gap (`space.md`), no divider, `ghost` = no border, nested indent 16–24 | `accordion` (single-open) vs multi, `ghost`, `iconPosition`, `disabled` | closed, **open with body**, ghost inside a card, disabled item, one with a status chip in the header | `CF.accordion` |
| **Empty state** | icon/illustration **120–160**, headline 18–20, body 14/1.5 **≤400 wide**, primary 40–44 min-w 140, secondary text link, **≤3 actions**, centered in its region | `first-run` · `no-data` · `no-results (echo the query)` · `error` · `403/404/500` | no-data with action, **no-results echoing the search term**, error with retry, 404 whole-page | `CF.emptyState` |
| **Carousel / gallery** | tile 4:3 or 1:1, dots 8 gap 8 active 16 (pill), arrows 40–48 on hover only, **2–3 tiles visible**, edge peek 16–24 | `autoplay`, `peek`, `dots` vs `arrows` | 3-up with peek, dots only, arrows-on-hover with one hovered tile | `CF.carousel` |
| **Mini calendar** | header 32 (month label 13/600 centered, `CF.glyph` chevrons 16 — **never typed `‹ ›`**, they are drawn) · weekday row 20 (11, named `role:'axis'`) · 7 columns of **32×32** day cells at gap 2, pad-X 8 (pass `cell: 40` + `hit: 44` for touch tiers) · today = 1.5px ring, selected = accent disc, range = soft wash plate · event **dot 4** at 6 above the cell bottom · optional in-cell mark = 11 `role:'axis'` label at the cell top · **the frame is derived, never assumed**: `rows = ceil((firstWeekday + days) / 7)` unless `rows` is passed explicitly (then it never shrinks below the month), so a 31-day month starting on the first column is **252×228**, not a 6-row sheet with an empty band under it — the height formula is `head+week+rows·(cell+gap)−gap+8` and rule 46 `frame_dead_band` fails a frame taller than its content · **adjacent-month cells are PAINTED** (previous/next month numbers at `muted` 62%, no state, no event dot; `adjacent:false` opts out) — an unfilled grid slot is the dead band, not a reservation | `rows` (5 · 6), `range`, `events`, `marks`, `weekendMuted`, `adjacent` | default with today + selection + dots, **range in progress** (`range` must DRAW the soft band — it needs two ends, so `CF.miniCalendar` supplies `[today, today+4]` when `selected` is not an array: a `·Range` host that paints no band is a label with no drawing behind it), 5-row tight, touch (cell 40) | `CF.miniCalendar` |

### 3.4 D · Navigation

| Component | Anatomy | Variant axes | Min variant set | CF key |
|---|---|---|---|---|
| **Nav item (list nav)** | h **40–44**, pad-X 12, radius 6, icon 20 + gap 12, label 14, badge right, active = 8% tint + accent label (+ optional 2–3px leading bar), nested indent **16/level**, group header 32 (11 uppercase muted) | `level`, `active`, `collapsed(rail 80)`, `withBadge`, `withSubmenu`, `dark panel` | default, **active**, hover, with badge, nested child, group header, **collapsed rail item (48×48 icon only)**, disabled | `CF.navItem` |
| **Tabs** | band h **48 label-only / 72 icon+label** [spec M3 primary tab], item 88–160 pad-X 16, label 14/500, **indicator 2–3px** (M3 3dp) at the band bottom, gap between items 0 (line) or 8 (card), count chip 18–20, scroll arrows 32 when >6 [spec AntD line/card/editable types] | `type` (line · card · editable-card · segmented), `position` (top · left · bottom), `icon`, `badge`, `closable`, `overflow` | line: default+**active**+hover+disabled, card: 2 tabs, **with icons**, with badge, **vertical-left**, scrollable with arrows, **editable (+ close)** | `CF.tabs` |
| **Breadcrumb** | h 40–48, 12–13, separator `/` or `›` 12, current = primary text, others = tertiary with hover underline, **collapsed middle `…` opens a dropdown** | `withBack` (mobile), `dropdownMiddle`, `withIcon` | 3-level default, **middle collapsed to `…`**, with back arrow (mobile), with icons | `CF.breadcrumb` |
| **Pagination** | band 56–64 · prev/next **32×32**, page **32×32 gap 4** (show ≤7, `…` for gaps), current = accent fill, total "1–50 of 1,284" 13 left, per-page select **88–120×32**, quick jumper 60×32 | `numbered` · `simple` · `mini` · `loadMore` · `infinite`, `showTotal`, `sizeChanger` | numbered with total + per-page, **mini (drawer/table)**, simple prev/next, **load more 44×200**, ellipsis case | `CF.pagination` |
| **Steps / wizard rail** | node **32** (dot 24 / panel 40), connector 1–2px, label 14/500, sub-label 12, **status: wait (muted) · process (accent + filled) · finish (check) · error (red)**; vertical variant = rail 240–288 with node at x 16 | `direction`, `type` (default · dot · navigation · panel), `labelPlacement`, `percent`, `readOnly` | horizontal 4 steps with one process + one finish, **error step**, **dot variant**, **vertical rail**, panel (cards as steps) | `CF.steps` |
| **Menu / dropdown** | panel min-w **160–240**, radius 8, pad 4–8, item h **32–36** pad-X 12, icon 16–20 gap 8, shortcut **kbd chip 20–24 h mono 11**, submenu chevron 16, **every command row at ONE pitch: a `'-'` in the item list is a semantic boundary that draws nothing and costs NOTHING — a break that must be seen is a `{ group: 'File' }` label row (24) or a functional `boundary·*` line, never empty space (rule 49)**, destructive item in danger, header/footer rows allowed | `trigger` (hover · click · contextMenu), `placement` (12), `submenu`, `checkable`, `icons` | default open with 5 items + a **group label row**, submenu cascade, **checkable group**, destructive item, **context menu**, header+footer menu | `CF.menu` |
| **Command palette** | dialog **560–672** wide (cap ~720), top offset **80–120**, radius 12–16, elevation 4 + scrim 40–60% · input row 52–56 (icon 20, text 16–18, clear 24) · group header 28–32 · result row **40–44** pad-X 16 (icon 16–20 + 14 + right kbd) · max-h results 320–400 internal scroll · footer 36–40 hints 12 | `grouped`, `withPreview`, `scopedFilters`, `empty` | open with 2 groups + first row highlighted, **empty with suggestion**, with preview pane, filtered-with-chips | `CF.commandPalette` |
| **Anchor / table of contents** | column 200–240, item 28–32, 13px muted, **active = accent + 2px leading bar**, 2 levels max, ≤25 items, sticky top 24 | `sticky`, `depth` | 2-level list with one active, hover | `CF.anchor` |

### 3.5 E · Overlays and feedback

| Component | Anatomy | Variant axes | Min variant set | CF key |
|---|---|---|---|---|
| **Modal / dialog** | **a recreation reads `feedback.modal`**: border · radius · body padding · scrim alpha · anchor (`center`/`right`) · header height · panel ratios · media fill, with per-variant overrides in `variants` (the variant key also names the master). `CF.sourceModal` draws that; with no modal profile it delegates to `CF.modal`, because inventing a "source" modal out of defaults is the drift rule 56 reports. The generic 400/520 app dialog remains for non-source app screens | `variant` (the profile's keys), `size`, `media` | every declared variant + its media/flush form; no generic title/body/footer on a source page | `CF.sourceModal` / `CF.modal` (app only) |
| **Drawer** | **378 / 736** [spec AntD presets], M3 modal drawer **360** [spec], mobile full-bleed · header 56 (title 16 + close) · body pad **16–24** [spec AntD 16×24 header, body 24] · footer 56 primary right · optional sticky tab band 48 | `placement` (right · left · bottom · top), `size`, `withFooter`, `detents` (mobile sheet) | right 378 detail, **right 736 with form + footer**, **bottom sheet at 50%**, left nav drawer, with internal tabs | `CF.drawer` |
| **Popover / card overlay** | panel 240–360, radius 8, elevation 3, pad 12–16, **arrow 8–12** (or none, but then keep 8px gap), pointer offset 8 | `placement`, `withActions`, `form` | with 2 actions, **with a mini form**, no-arrow anchored card | `CF.popover` |
| **Popconfirm** | 240–320, icon 16 (warning) + message 13/1.5, buttons 28–32 h (ghost + danger), gap 8 | `tone` (default · danger) | neutral, **danger (delete)** | `CF.popconfirm` |
| **Tooltip** | **measured from `feedback.tooltip`**: padX × padY, radius, fill/ink, `fs` (one size or a list — a source may carry two), lineHeight, `shadow` level (0 = none), and `arrow` (a source that draws one gets one; a source that does not gets a plain bubble, never an invented diamond). Stamped `nl:fb` + `nl:prof` | `placement` (top/bottom/left/right), `size`, `withTitle`, `brand` | every declared size × all four edges, arrow present/absent as declared | `CF.tooltip` |
| **Alert / banner** | **a source with no alert declares a DERIVED material** (`feedback.alert = {material, fill, radius, padX, padY, fs, icon, iconInk, bar, derived:true}`) built from a surface the source does own — a neutral plate with the tone carried by the icon, not an M3 pastel fill. With no profile the generic path is the tone's own wash; the recipe is applied only when the elevation engine actually holds it | `type` (info · success · warning · error), `description`, `closable`, `action` | 4 tones × compact/description, closable, with action | `CF.alert` |
| **Toast** | **a source with no toast declares a DERIVED material** (`feedback.toast = {material, fill, fillLight, ink, radius, padX, padY, fs, derived:true}`) — normally its ink/control surface, never a generic pill shadow. No profile = the flat generic toast with a level-2/3 drop | `tone` (success · error · info · neutral), `action`, `duration` | 3 tones, action, timed, disabled | `CF.toast` |
| **Message / toast / snackbar** | h 40–56, radius 8, pad 12–16 (icon 16–20 + text 13–14 + optional action), **width 320–480**, elevation 4, offset 16–24 from the edge, auto-dismiss 3–8s (pause on hover) | `tone`, `placement` (8), `action` (Undo), `withTitle` | success, error, **with undo action**, top-center banner-style, stacked 3 | `CF.toast` |
| **Notification** | card **320–400**, header 40 (title 14/600 + close 24), body 13–14/1.5 ≤3 lines, footer actions 32, avatar/icon 32–40 | `avatar`, `actions`, `duration` | default with title+body, **with actions**, with avatar, error with retry | `CF.notification` |
| **Progress overlay / spin** | spinner **20–24 inline**, 32–40 block, 48–64 fullscreen; stroke 2–4; track 12% ink | `size`, `label`, `fullscreen` | inline in a button, block centered in a card, **fullscreen with scrim + hint text** | `CF.spin` |
| **Sheet (mobile)** | 2 detents (25% / 50–90%), grabber 32–36 × 4 radius 2 at top 8, header 48–56, content pad 16, bottom inset **34** | `detent`, `expandable` | low detent with grabber, expanded near-full with primary + inset | `CF.sheet` |

### 3.6 F · Chrome (assembled with `LY.slots`, drawn by `CF`)

`appBar`, `marketingNav`, `sideNav`, `navRail`, `toolbar`, `filterBar`, `tabBand`, `pageTitleBand`, `breadcrumbBar`,
`paginationBar`, `appFooter`, `marketingFooter`, `statusBar`/`bottomBar`, `drawer` — anatomy numbers live in
`layout-library.md §2`; each is **one spec board** on the chrome page with the variant column set from that table
(always including **collapsed/rail**, **dark-panel** and **scrolled-with-shadow** where the primitive offers them).
`CF` provides `CF.appBar`, `CF.sideNav`, `CF.toolbar`, `CF.tabBand`, `CF.pageTitle`, `CF.footer`, `CF.mobileBar`
which read `LY.slots.*` for their internal geometry — so a chrome board and a screen's chrome are literally the same code.

## 4. Board coverage checklist (what `audit_design.js` counts)

For each component family present in the design system, the board must satisfy:

| Check | Threshold | Signature |
|---|---|---|
| variants | ≥ 3 distinct non-state, non-size name tokens (the §3 Min variant set is the intent; the threshold is what is decidable) | `variant_sparse` |
| states | the family's row in §3.0 drawn as matrix columns, at most 2 missing for its control class (`ctl` / `field` / `toggle` / `row` / `sel`) | `state_coverage` |
| sizes | at least 2 ladder sizes, **only when the family declares a size at all** | `variant_sparse` |
| focus | ≥ 1 focus layer that **paints** on the Focus hosts of every focusable family: a `ring·*` at alpha ≥ .05 tight on the focus unit (§1.3), or the visible `wash·focus` / `row·focus` / `node·focus` … state layer a `reserved` family carries instead, or a ≥2px focus border | `focus_ring_missing` |
| focus is visible | a `ring·*` at alpha < .05 must be paired with a visible focus layer in the same control — a reserved slot alone is not an indicator | `focus_invisible` (§1.3, rule 44) |
| disabled | content alpha in `.25–.40` (`CF.STATE.disabledContent`), clamped for the whole host subtree by `ctx.place()` | `disabled_wrong` |
| touch | every target ≥ tier floor (mobile/pad 44, web 32) — an invisible `hitpad·<w>×<h>` plate counts toward it | `touch_target` |
| icon slots | a `IconStart` / `IconEnd` / `Clear` variant wherever the family is in the auditor's `ICON_FAMS` | `variant_sparse` |
| assembly | every control drawn as 1 host + mounted children, no loose siblings at the board level | `loose_assembly` (emitted by `audit_layout.js`) |
| naming | `Family·Type·Size·State·Slot·Tone`, no `/`, matches `component-map.json` | `name_invalid` |

**Counting rule**: `variants × states` on a board is the honest measure of work. A 12-variant board with only resting states is
`variant_sparse` **and** `state_coverage`; audit reports both so the fix is not ambiguous.

**Coverage is decided by names, not by pixels** — three consequences:

- The slot axes must be *in the name*: `CF` writes them through `slotName()` (`IconStart`, `IconEnd`, `Clear`, `Addon`, `Count`,
  `Block`, `Loading`, `Dot`, `Avatar`). A factory that draws a leading icon without naming it reads as "no icon variant".
- **Scope exceptions**, single-sourced in `audit_design.js`: `STATE_ONLY_FAMS = [Checkbox, Radio]` (one drawing per state — a style
  axis genuinely does not exist, so `variant_sparse` is skipped); `SPEC_SKIP = {SideNav, Toolbar, TabBand, Table, TableHeader,
  TableState, Form, OptionList, CommandPalette}` (composites judged only inside their own board, because the contract puts matrices on
  03–09 and these on 10 — page 10 is run with `{ families: [...] }` to bring the coverage rules back).
- A family present with < 2 hosts is **not judged** (it is not a spec board yet), and an 11px box is legal only when its name carries
  the role (`axis` / `overline` / `kbd`) — `ctx.text({ role })` is what writes it, including inside `CF.matrix`'s column headers.

## 5. Which parts are *components* (registered) and which are *groups*

Applies the ownership contract (`penpot-structure.md §4.3`), per family:

| Register as a **component** (reused, variant container) | Keep as a **group** (single-use assembly) | Assemble as a **board** (page-level region) |
|---|---|---|
| Button (+sizes/types as variants), IconButton, Input (+variants), Select, Checkbox, Switch, Chip, Badge, Avatar, Tag, Tooltip, Alert, Toast, Nav item, Tab, Table row, List item, Card, Modal, Spinner, Skeleton | A specific search box (icon input + button + hint row) used once, a KPI card with fixed content, one page header | Every spec board, every chrome region, every Demo screen |

Variant container property names (keep ≤4 per family, in this order): **`Type` · `Size` · `State` · `Slot`**.
`Slot` covers boolean-ish anatomy switches (with-icon, with-clear, addon, loading) so `State` stays a clean 7-value axis.

### 5.1 The two naming worlds (both are required — they cannot be merged)

| Where | Layer name | Why |
|---|---|---|
| a control drawn by `CF`, a spec board, a flat registered master | `CF.name('Button', {type,size,state,slot})` → **`Button·Primary·Md·Hover`** | this is what the design-rule lint parses (`famOf`/`parseName`), what G12/G13 check, and what a screen instance *inherits* when you place it |
| a head **inside a variant container** | **the platform's** — after `createVariantContainer` it overwrites both heads with the container's name, and renaming one afterwards **wipes the property table** (`variantProps` → `{}`, `properties` → `[]`) | the property table comes from the `properties` argument only; layers are not the source of truth in this build (capabilities §5) |

So a variant set reads as: container + record named `Button`, heads named `Button`, props `Type/Size/State/Slot` on the
record — and the **flat** `CF.name` strings remain the keys you use everywhere else (`CF.instance(CF.name(...))`,
`CF.swap(inst, CF.name(...))`, spec rows, `component-map.json`).

### 5.2 Reuse on a screen: instances, not re-drawn copies

```js
const name = CF.name('Button', { type: 'primary', size: 'md' });
CF.component(btnHost, name);                     // once, from the masters board (the host *becomes* the main)
const a = CF.instance(name, { parent: region, text: 'Publish' });   // screen placement — sizing fix/fix, declared last
CF.swap(a, CF.name('Button', { type: 'primary', size: 'md', state: 'hover' }));   // hover state, no new geometry
```

* an instance **inherits the master's name**, so screens of instances pass the naming gates for free;
* `CF.swap` → `swapComponent`: paint and name follow the target, **text overrides survive**;
* in a variant set, switch with `inst.switchVariant(posIndex, value)` (numeric pos; same value = silent no-op);
* **never** declare `'auto'` on an instance or control host — a board's `auto` is *hug* and it collapses to the label
  (measured 160×52 → 41×17). `CF.instance` defaults to `'fix'/'fix'`;

**HARD — an application surface is assembled from components, never raw boards (measured 2026-10-23).** Real screens place instances; a shell showcase may host a master in place (page 10's `NavItem`/`IconButton` masters), but every control must be a component and every duplicate an instance. The enforcement is not prose:

* `not_assembled` / `not_component` judge leaf controls on `10 · App shell & chrome`, `12 · Screen recipes` and `14–16 · Screens`, **including controls nested inside a shell composite**. The earlier scope (top-level `compos` boards on 14–16 only) let page 10's raw `Button·MD`, nine `IconButton·Ghost·XS` and eight `Search/Avatar/NavItem` controls pass; they were subsequently registered/placed.
* `CF.button` is guarded at build time: when an exact master exists and the parent is **not** a `·Spec` / `Masters·` board, it returns `CF.instance(...)` instead of drawing a raw host. Passing `asInstance:false` is only for a negative control — the audit catches the result.
* Shell composites (`AppBar`, `SideNav`, `Toolbar`, `PageTitle`, `Footer`, `MobileBar`) and `composer` helpers are documentation boards, not leaf controls; they are excluded from `not_assembled` so the rule does not indict the shell specimens themselves.
* If the variant has no master, do **not** ship a raw draw: extend the factory (G12), register the host (`CF.autoRegister` / `CF.component`), then place it. A missing master on a screen is reported by `SC.audit` as `missing_master`.

**HARD — spec pages 03–09 are the component factory (rule 58, gate G10s).** A `·Spec` page is not a gallery of drawings: every control host there must be a registered component, **including every state cell** (Hover/Focus/Pressed/Disabled/Selected). `CF.autoRegister({states:true})` promotes the first host of every name; duplicate state cells must then be registered under unique names (or replaced by instances) so `spec_unregistered` is 0. Nested anatomy inside a registered control (an Input inside a Field master) is part of that master, and a composite already holding component instances is an assembly — both are exempt. Measured 2026-10-23 on the the reference file: 301 spec state cells were still raw after the default-only registration; they were registered (library 72 → 373). The subsequent source icon-tile rebuild replaced the generic Primary/Ink/Secondary tile masters with process/feature tiles, settling the library at **369 masters**; every page 03–09 now reports `spec_unregistered: 0`.
* deleting a main instance's shape removes its record (and `isComponentInstance()` is true for **mains** too), so batch
  cleanups must not filter on it; `inst.detach()` on a main leaves an unremovable ghost (capabilities §5);
* **retrofitting** a screen built from hand-drawn controls: `CF.componentize({page, apply:true})` replaces same-size copies
  in place (text overrides copied by layer name). Its **size guard** (`misfit`, ±2px) exists because a factory interior is
  absolute — `instance.resize()` does not reflow it; its **anatomy guard** (`anatomy`) refuses a copy with more descendants
  than the master, because the swap would silently drop them. Clear both before claiming the screen uses components, and give
  a deliberately richer composition its own name (`Accordion·FAQ·Multi`) instead of reusing the master's.

## 6. Icon rules for component slots

- Sizes used **inside controls**: 16 (xs/sm), **18–20 (md, the default)**, 24 (lg / icon-only 40 control), 28–32 (empty state, upload), 40–48 (empty-state illustration).
- Stroke/weight consistent with the icon set; **never mix two icon families** on one board.
- Gap icon↔label: **4 / 6 / 8** by control size (§2 table); icon-only controls keep the control square.
- An icon that carries meaning (status, "delete", "download") needs a **label or tooltip**: the board shows the tooltip variant.
- Exported size = annotated size × multiplier (@1x/@2x), from `export_shape`, never scaled in code (design-to-code §3).
- **Default renderer: `CF.glyph(ctx, kind, box, o)`** — the built-in 24-grid path set (chevron, check, search, close, …),
  drawn as fill/stroke paths with the control's palette color, so it inherits tone and state automatically.
- **Catalog / imported vectors: `IC.place(name, {parent, color, size})`** (embedded Lucide set, `storage.IC`, one line
  per icon from `assets/icons/lucide.jsonl`) and **`IC.grid({names, x, y, …})`** for the `01 · Foundations` icon sheet
  (that board is one of the **two declared exemptions** of gate G16, `FN.EXEMPT['01']` — alongside `Light vs dark` on
  `02`; every other 01/02 board is an `FN.project` projection);
  **`CF.svgIcon(svg, {parent, color, size})`** for the target system's own icon file. The channel decision, licenses and
  the "why not a `.penpot` download" analysis are in `references/icons.md`. Never mix two sources inside one control,
  and never hand-draw an icon with loose rectangles.

## 7. Feeding design → code

`component-map.json` per component: `{ name, family, page, board:{x,y,w,h}, variants:[{type,size,state,slot,shapeId}], tokens:[…], states:[…], recipes:[…] }`.
Code generation must find **every** variant there; a variant missing from the map does not exist in code, and a variant present in the map
but not on the board fails the acceptance check (verification.md). The five-state matrix and the §4 checklist are what a
reviewer checks the generated CSS/storybook against.
