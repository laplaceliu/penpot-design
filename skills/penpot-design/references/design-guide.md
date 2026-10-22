# Design Guide — prescriptive layout, spacing, typography and state rules

> **What this file is**: the built-in "good design" baseline. Every number here is a **default adopted from cross-system consensus**
> (Ant Design v5, Material Design 3, Fluent 2, IBM Carbon, Apple HIG, USWDS) — not one vendor's taste.
> **Precedence** (highest wins): ① values measured from the target you are recreating (URL / images / source CSS) →
> ② values declared in DESIGN.md → ③ this file. Never overwrite ① and ② with ③; this file only fills gaps and judges quality.

## 0. Rule classes (read this first)

| Class | Meaning | Enforcement |
|---|---|---|
| **HARD** | Machine-decidable, violation = amateur output | `scripts/audit_design.js` reports it; **gate G13 blocks delivery** |
| **DEFAULT** | Adopted when the target gives no value | written into DESIGN.md frontmatter and labelled `consensus default` in prose |
| **TASTE** | Guidance for judgment, no single right number | appears as a Do/Don't line on the relevant spec board |

Every HARD rule below is marked `HARD`; §11 is the consolidated lint list that the audit engine implements.

## 1. Base unit and spacing scale

**HARD — one scale only.** Every gap, padding, inset and dimension on every axis is a multiple of **4px**; coordinates snap to the 4px grid.
Off-scale values (5, 6, 7, 9, 10, 13, 15, 18, 22…) are forbidden. **Exception (HARD-adjacent)**: hairlines and glyph metrics —
1px border/divider, and text box height produced by the font (do not force text height onto the grid).

| Token | px | Consensus source | Use it for |
|---|---|---|---|
| `space-3` | 2 | Carbon spacing-01, Fluent size20 | hairline double-ring gaps, icon nudges (rare) |
| `space-4` | 4 | AntD `paddingXXS`, M3 extra-small, Fluent size40 | label↔input, icon↔adjacent icon, tick offsets |
| `space-8` | 8 | AntD `paddingXS`, M3 small, Fluent size80 | **inside one component**: icon↔label, chip↔chip, key↔value |
| `space-12` | 12 | AntD `paddingSM`, M3 medium, Fluent size120 | small-component padding (24/32-tall controls), row inner gap |
| `space-16` | 16 | AntD `padding`, M3 large, Carbon mini unit×2 | **default container padding**: card body, cell padding, pane padding |
| `space-20` | 20 | AntD `marginMD` | dense card padding when 24 is too wide (KPI tile) |
| `space-24` | 24 | AntD `paddingLG`, M3 extra-large, Carbon gutter | **default block gap**: card↔card, form section, toolbar height |
| `space-32` | 32 | AntD `marginXL`, Carbon page margin lg | group↔group, content padding on desktop |
| `space-48` | 48 | AntD `marginXXL` | **section ↔ section inside one page band** |
| `space-64` | 64 | Carbon spacing-10 | page-level vertical rhythm (marketing) |
| `space-96` | 96 | Carbon spacing-11, marketing convention | hero band padding, full-bleed band rhythm |
| `space-128` | 128 | top of `LY.SPACE` | the widest full-bleed band rhythm on a long marketing page (web tail only; a pad/mobile page never reaches it) |

**Tiers compress the tail, never the head**: mobile uses 4/8/12/16/24 and caps section rhythm at 48–64; web uses the whole ramp.

### The three gap decisions (TASTE, but consistently applied)

1. **Related closer than unrelated** — the *2× rule*: a gap between two groups must be **≥ 2×** the gap between items inside either group.
   If a card's rows are 8 apart, cards must be ≥16 apart. If you cannot tell which items belong together from the whitespace, the layout has failed.
2. **Padding is spent once.** Total inset from an outer edge to text = sum of the nesting levels. Cap it: shell padding (24) + card padding (24) = 48 is already the ceiling;
   a third 24 wrapper makes content look stranded. When nesting a third level, use 8/12, not another 24.
3. **Adjacent panes abut with a hairline, not with whitespace.** Column/pane separators are 1px `border` + 0 gap; gaps live *inside* panes.
   (This is why amateur three-pane mockups look "melted": they float 24px gutters between panels that should touch.)

**HARD — control widths are capped.** A text input in a 1152px column is a defect: input 280–420, select 160–240, textarea 400–720.
Full-width controls are legal only inside a narrow container (card, drawer ≤400, mobile 343).

## 2. Whitespace and vertical rhythm

Whitespace is the hierarchy carrier, not leftover. Numbers that read as "designed":

### 2.1 Whitespace is the FIRST separation device (default and preferred)

When two things have to be told apart, spend air **before** reaching for any other device, in this order:

1. **Whitespace** (`LY.BREATH`) — the gap between flow siblings. The default device for every stack: element↔element,
   section↔section, block↔block.
2. **Elevation / surface polarity** — a card, a wash, a shadow. Only when the two things are different *kinds* of surface.
3. **A stroke or a divider** — only where whitespace would be a lie: table rows, pane edges, hairline separators (§1.3 rule 3).
4. **Alignment / reading order** — never a substitute for 1.

Reaching for a divider where a `block` gap would have carried the separation is the failure mode this section exists to
prevent: dividers multiply, each one then has to be kept aligned, and the page reads as a grid of lines instead of a
sequence of groups.

**HARD — the gap comes from the ladder, not from a typed number.** `LY.BREATH` names one amount per hierarchy level and
every value is a `SPACE` member, so a gap taken from the ladder cannot simultaneously be `space_off_scale`:

| Level | web / pad | mobile | What it separates |
|---|---|---|---|
| `inline` | 8 | 8 | two shapes that are one thing (caption↔its block, icon↔label inside a control) |
| `row` | 12 | 12 | a row of cells, a list line |
| `block` | 16 | 16 | **the default**: block↔block inside one band |
| `group` | 24 | 24 | a group of blocks (card padding, form group) |
| `section` | 32 | 32 | heading → its content, section → section |
| `band` | 48 | 48 | band → band inside one screen |
| `page` | 96 | 64 | full-bleed page bands (marketing) |

Read it with `LY.breath(level, tier)`; write it with `NL.frame({ breath: 'block' })` (`true` = `block`). Builder and gate
then cannot drift, because both read the same table. An explicit `gap:` number stays legal — measured systems disagree
with this ladder — but it must be a `SPACE` member and it must satisfy rules 32/33.

**Measured 2026-10-21 on the live file** (19 pages, 110 flow containers): 100% of the gaps already sit on a ladder
level (109 at `block` = 16, 1 at `inline` = 8) — after the ladder was **rewritten to include 16**. The first draft's
levels were 8/12/24/32/48/64/96, which called the file's own rhythm off-ladder and measured 3% adoption. A ladder that
indicts the system it describes is the wrong ladder; `LY.BREATH` documents the rhythm, it does not replace it.

**The three exemptions, where whitespace is deliberately NOT the device** (the gate encodes all of them):

- **A repeated run** — ≥3 siblings, equal extent along the axis, uniform pitch: table rows, list items, matrix cells.
  Those are *one* group separated by rules and polarity, not several groups separated by air. Rule 33 never binds a run;
  rule 32 binds it only when the items stack an interior of their own (a column of touching cards is cramped, a column of
  touching rows is a table). Measured on `02.03 · Contrast matrix`, where the first draft indicted one 48px row 12 times.
- **Abutting panes and segments** (§1.3 rule 3) — a row at gap 0 whose members are not cards.
- **A label and its field** (4–6) — tighter than any ladder level and correct. Rule 32 only judges siblings that are
  block-level (≥24 on the stack axis), so a caption never drags a form up to 16.

### 2.2 The numbers

| Context | Value |
|---|---|
| Page top inset (below app bar / nav) | 24–32 (web), 16 (mobile) |
| Page title band → first block | 24 |
| Block → block inside one band | 24 (related) / 48 (new concern) |
| Band → band (full-bleed section) | 64–96 (web), 40–56 (mobile) |
| Section heading → its content | 16 (TASTE: never more than the heading's own font size ×2) |
| Card header → card body | 16; card body → card footer actions 16–24 |
| Form label → field | 4–6; field → next field 16–20; group → group 32–40 |
| Table cell vertical padding | 12–16 (comfortable), 8 (compact) |
| Modal title → body 16–24; body → footer 24; footer buttons gap 12 |

**HARD — the fold is not the page.** A web screen board is a **full document height**, not 1920×1080. Marketing pages 2400–4000 tall,
app pages `max(viewport, content)`. Compute the height from band stacking (§ layout-library), never from a fixed canvas habit.
A 1440×900 board containing 3 bands of content with dead space at the bottom is an amateur tell.

## 3. Typography

### 3.1 Family assignment

- **UI/body**: one sans family everywhere. Consensus defaults: `Nunito`/system-sans (Latin), **`Noto Sans SC` is mandatory for CJK**
  (Penpot has no per-character font-stack fallback — routing CJK to a Latin font renders garbage; see api-pitfalls §5).
- **Display** (optional, ≤3 uses per system): hero H1, cover title, big KPI numbers only. Never for UI labels, never for CJK.
- **Numeric emphasis**: `JetBrains Mono` (or any tabular mono) for table figures, timers, codes, OTP, IDs — Penpot cannot set
  `font-feature-settings: tnum`, so **tabular alignment is achieved with a mono font, not with the UI font**.
- Weight available: 400 regular, 500 medium, 600 semibold, 700 bold. Match the variant you ask for; `_variant()` falls back to 400 silently.

### 3.2 The ramp (DEFAULT kit when the target gives none)

Base body = **14px / 20px** (AntD `fontSize 14`, Fluent Body 14/20, Carbon 14/20) — 16px body is for **prose only** (§3.4).

| Role | Size/line-height | Weight | Where |
|---|---|---|---|
| `display-xl` | 56/60 | 600–700 | hero H1, cover |
| `display-lg` | 40/44 | 600 | landing H1, big KPI value |
| `h1` | 32/40 | 600 | page title, modal-with-form title |
| `h2` | 24/32 | 600 | section title, card group title |
| `h3` | 20/28 | 600 | block title, dialog title |
| `h4` | 16/24 | 600 | subsection, table group header |
| `body-lg` | 16/24 | 400 | lead paragraph, prose, mobile body |
| `body` | 14/20 | 400 | **default UI text** |
| `body-sm` | 13/20 | 400 | helper text, table secondary column |
| `caption` | 12/16 | 400 | metadata, timestamps, chips, chart axis |
| `overline` | 11/16 | 500 (tracking +0.04em) | nav group labels, table header (optional) |
| `button` | 14/20 | 500–600 | all standard controls (40/36 tall); 12px for 24-tall controls |

- Line-height: headings **1.1–1.3**, UI text **1.43–1.5**, prose **1.5–1.8** (prose needs more; UI labels need less).
- **HARD — ramp steps ≥ 4px apart** (12/13/14 are one step, not three). A "hierarchy" built from 14 vs 15 is invisible in the export.
- **HARD — minimum size 12px** for anything a user must read. 11px is legal **only for a declared role** — `overline` group labels,
  chart axes, keyboard hints — and the declaration is the shape *name*: `ctx.text({ role: 'axis' | 'overline' | 'kbd' })` writes
  the role into the name, which is what `audit_design.js` reads (`off_ramp_size` accepts an 11px box **only** when its name carries
  one of those three tokens, or a `sample · ` prefix — a type specimen is *supposed* to show the step it is named after).
  An 11px box drawn by hand with no role in the name is a finding, not a style choice. Never 10px in CJK.
- Tracking: negative (−0.01…−0.03em) only above 32px; CJK needs no negative tracking (glyphs are square, already tight).
  Penpot `letterSpacing` takes a **px number string** only (`'−0.5'`), not `em` (api-pitfalls §5).
- Emphasis is a **three-signal system**: weight, size, color. Using only color = weak hierarchy; using all three at once on every element = noise.

**HARD — typographic whitespace is part of the ramp, not a per-shape choice (§2.1 applied to type).** Two amounts decide whether a
block of copy breathes, and both belong to the ramp step, never to the call site:

- **Leading (行距)** — the step's own declared `lineHeight` is the floor. `mkText`/`TK.apply` write it from the token; a hand-typed
  `t.lineHeight = '1'` on a wrapped paragraph is the same defect as a gap of 0 between two blocks. Measured floor the gate uses:
  the **tightest declared leading at that size** (`TK.declared()` → `storage.breathSpec.lead`), so the auditor never demands more
  air than the ramp itself claims. A single-line label at 1.0 is not judged — only wrapped copy (≥1.8 rendered lines) is.
- **Paragraph air (段距)** — the gap between two consecutive prose blocks must be **≥ one line** of the block above (the CSS
  `margin-block: 1em` convention). Copy stacked at the label gap reads as one grey mass even when every line has perfect leading.

`CF.lineH(fs, weight, family)` returns the pixel line box for a step, which is what both the gate and `storage.breathe()` measure
a paragraph against; a factory that stacks copy reserves `lineH(fs)`, never `fs`. Repair with `storage.breathe({ apply: true })`,
which raises the container gap and re-binds the compressed paragraph to the declared leading in the same pass.

### 3.3 Text color ramp (DEFAULT, exact consensus values)

| Role | Light | Dark | Note |
|---|---|---|---|
| Primary text | `rgba(0,0,0,.88)` | `rgba(255,255,255,.85)` | **never pure #000 on pure #fff** |
| Secondary | `rgba(0,0,0,.65)` | `.65` inverted | labels, table secondary |
| Tertiary / muted | `rgba(0,0,0,.45)` | `.45` | helper text, timestamps |
| Disabled | `rgba(0,0,0,.25)` | `.25` | paired with disabled surface |
| On-primary | white on dark brand fill | — | must reach 4.5:1 |

**HARD**: `on-surface` and `surface` must be ≥4.5:1 (≥3:1 for ≥24px text and for icons that carry meaning).
Disabled text is exempt from contrast, but must still be ≥2.5:1 against its own container, and never the only carrier of state.

### 3.4 Measure (the single most decisive number)

**HARD — running prose is capped at 640–760px** (≈ 45–75 characters at 16–18px; WCAG ceiling 80, USWDS target 66 chars, `65ch` convention).
Applies to: article body, description blocks, settings copy, modal copy, chat *except* chat messages.
**Exemption (do not "fix" these)**: chat/messaging lines deliberately fill the pane (chat is scanned, not read);
data tables and dashboards fill the column; code blocks scroll horizontally rather than wrap.

- Prose font 16–18/1.6; lead paragraph 18–20/1.5; article H1 36–44; H2 24–30 with **margin-top 48–56** (heading needs more space above than below).
- Long text is **left-aligned**; centered text over 2 lines is unreadable; justified text creates rivers — forbidden everywhere.
- Numbers in tables/KPIs: right-align, mono font, consistent decimal digits; names and dates left-align; status = chip, not bare colored text.

## 4. Color usage rules

- Roles first, palette second: `surface` / `surface-container` / `border` / `text-*` / `primary` / `success` / `warning` / `danger` / `info`
  + an `on-*` counterpart for every fill. Dark is a **remixed** set (M3 tone flip / AntD dark ramp), never an inversion.
- Palette step discipline (AntD 10-step ramp): step **6 = base**, 1–3 = tinted backgrounds, 7–8 = hover/active, 9–10 = text-on-tint.
- **One primary action per region** (HARD within one spec/screen board): exactly one filled primary button; the rest outline/ghost/text.
  Two filled primaries = no primary.
- 60-30-10: neutral surface dominates, secondary supports, accent ≤10% of pixels. Accent used on a large surface
  (whole hero band, whole nav) stops being an accent.
- Status must be **doubly encoded**: color + (icon or text or weight). Unread = 600 weight **and** a dot; error = red **and** an icon/message.
- Functional color is never decorative: if it is painted on a card border "for looks", the same color cannot mean "danger" elsewhere.

### 4.1 Every tone is a triple: `wash · hue · ink` (single-sourced in `CF.P`)

The base (AntD step 6 / M3 tone 40) is a **graphic** color — an icon, a 3px bar, a shape. Copy never sits on it directly.
Each tone the kit can paint ships as three coordinated steps, and only the two ends carry text:

| Tone | `*Soft` / wash (background) | hue (graphics only) | `*Ink` (the text-on-wash step) |
|---|---|---|---|
| primary | `#DBEAFE` | `#2563EB` | `#1E40AF` |
| info | `#E0F2FE` | `#0284C7` | `#075985` |
| success | `#DCFCE7` | `#16A34A` | `#166534` |
| warning | `#FEF3C7` | `#D97706` | `#92400E` |
| danger | `#FEE2E2` | `#DC2626` | `#991B1B` |
| neutral | `#F8FAFC` (`surfaceAlt`) | `#E2E8F0` (`border`) | `#0F172A` (`ink`), secondary `#475569` (`muted`) |

- **HARD — the two copy-carrying combinations are `*Ink` on its own wash, and white on `*Ink`.** Measured (WCAG 2.1 relative
  luminance, this kit's exact hexes): ink-on-wash **6.37–7.15:1** (warning 6.37 … primary 7.15), white-on-ink **7.09–8.72:1**.
  The base hue is a **graphic** step: white on it is 3.19 (warning) / 3.30 (success) / 4.10 (info) / 4.83 (danger) / 5.17 (primary),
  so `success`/`warning`/`info` solid fills with white copy are contrast failures — which is why `CF.TONE`'s solid fills
  (`primary` / `danger` / `success`) point at the **`*Ink`** keys, and `CF.badge` / `CF.alert(filled)` / `CF.chip(solid)` resolve
  their surface through `CF.tintOf(tone)[2]`. A hand-built `#2563EB` plate with white text or a `#16A34A` pill with white text
  is the reflex this rule exists to stop.
- The neutral secondary is `muted #475569` on `surface` (**7.58:1**) — never `#94A3B8`, the "light gray helper text" reflex,
  which is **2.56:1** and fails.
- **Dark**: the triple is re-derived per step, not inverted — the wash becomes a low-alpha tint over the dark surface and the
  `*Ink` step **lifts** (a 3–4 level hue, e.g. `#93C5FD`-family copy on `#0F172A`). Mechanics in `color-schemes.md` §4.1.
- **The triple is a name contract, and `02 · Semantic roles` reads it** (gate G16): `storage.FN.tones()` finds a tone only
  when `color.X` has both an ink and a wash sibling, accepting both `X-ink`/`X-wash`/`X-soft` and the camelCase of the table
  above (`XInk`/`XSoft`) — while a hue that merely ends in those letters (`color.pink`) never parses as a triple. A token set
  with no complete triple makes the projector **refuse**, so a tone documented here but not declared in the set shows up as a
  missing board, not as a board painted with a fallback hex (`engines.md` §7).

## 5. Elevation, borders and state layers

### 5.1 Layering mechanism (pick one per system, TASTE)

`shadow` (M3/MD) / `tone` (Fluent, M3 surface-container ramp) / `border` (AntD, GitHub) / `glow` (tech-neon). **Consensus default: border + tone for adjacency, shadow for stacking.**

| Level | Recipe (DEFAULT, CSS shorthand; Penpot shadows need the object color form) | Used by |
|---|---|---|
| 0 | none | page background, table rows, nav rail |
| 1 | `0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)` (M3) or `0 1px 2px rgba(0,0,0,.05),0 2px 4px rgba(0,0,0,.03)` (AntD tertiary) | resting card, static panel |
| 2 | `0 3px 6px -4px rgba(0,0,0,.12),0 6px 16px rgba(0,0,0,.08)` | raised card, sticky bar |
| 3 | level-2 recipe + `0 9px 28px 8px rgba(0,0,0,.05)` | dropdown, popover, tooltip, drawer |
| 4–5 | level-3 stronger | modal, command palette, full-screen sheet |

- A shadow implies "floating above something". Never stack a shadow on a section that is not floating (the classic "everything is a card" disease).
- **Border vs divider**: containers get 1px `border` or a tone step; items *inside* a container get 1px dividers with `colorSplit`
  (`rgba(5,5,5,.06)` light) — a visible gray hairline inside a card reads as a table.
- **A corner is taken from the `borderRadius` token set and nowhere else (HARD).** The ladder exists as tokens
  (`radius.none / xs / sm / md / lg / xl / full`); every writer in the engines goes through `CF.radius()`, which takes a
  role (`control`/`box`/`tile`/`card`/`field`/`panel`/`slab`/`hero`/`pill`…), a ladder key, a `radius.*` name or a number,
  and **snaps anything off-ladder to the nearest step**, recording the coercion in `CF.coerced`. So the defect cannot be
  introduced at draw time, and two machine rules judge the result: `radius_off_ladder` (a corner that is not a declared
  value) and `radius_unbound` (a corner that is a declared value but carries no `tokens.borderRadius*` binding).
  `TK.radiusSweep()` is the repair for the second one — see `design-tokens.md` §8.
- **The two blind spots these rules had, and what closed them (read this before claiming a file is corner-clean).**
  (1) *They judged only corners that exist*: both skip `v <= 0`, so a control host drawn square by an older generation of a
  factory passed CLEAN — and (2) *they never looked inside a component*: `isComponentInstance()` is **also true for the
  component's own shape** (measured 2026-10-22: `Button·Primary·MD·Focus·Pill` answers `isComponentInstance()`,
  `isComponentMainInstance()`, `isComponentRoot()` and `isComponentHead()` all true), so the auditor's instance skip silently
  exempted 79 button masters on `03.01` and the whole spec chapter read CLEAN while every Focus cell showed a square body
  behind a pill ring. The auditor now stops only at a **copy** (`isComponentCopyInstance()`) and judges masters and copy hosts.
  The pair itself is **rule 37 `ring_off_host`** (§5.1, `CF.ROLE.ring = 'host'`: a ring is the control's derived outline, so its
  corner IS the control's corner — both values can sit on the ladder and still contradict each other, which is exactly why 35/36
  could not see it), and the repair is **`TK.roleSweep()`** (`design-tokens.md` §8.2): pill-family hosts to the step DESIGN.md
  binds them to, every ring to its host's corner, then bind + commit.
- **A `ring·*` plate must be mounted INSIDE the control it outlines — rule 38 `ring_detached` (HARD).** Rule 37 compares a
  ring's *corner* to its host's; it says nothing about *where the ring is*, and a ring that sits on the spec board instead of
  inside its control is the same defect seen from the other side (what the user reported as "the element drifted"). The
  relation is geometric, and **not** a fixed margin: measured 2026-10-22 over the file's 231 rings, the ring↔plate margin is
  2 for 176 of them but 5/6/7/9/10 for other families and **0** for an inline-link or breadcrumb ring — where the ring *is*
  the text's box and even non-uniform (≈1.5 horizontal / 3 vertical). What is invariant: the ring **encloses** a real plate
  (margin 0–12 on each axis) and is **concentric** with it (centre Δ ≤ 3). The owner is usually a *nested* plate — an addon's
  `field` rect, a Checkbox `box`, a Slider `handle`, one OTP digit, one crumb `Text` run — not the control board, and a flat
  row band (Tree / Accordion / anchor rail) has no plate at all, so its ring is accepted by containment instead.
  `TK.ringHost(shape)` is the one resolver behind both the gate and the repair, and `TK.ringSweep()` is the idempotent fix
  (7 of 231 drifted 10–72px; re-read 41/41 ok). Semantics and the failure modes in `engines.md` §"Ring mounting", call
  details in `design-tokens.md` §8.2.
- **Still not machine-checked: the role of a family DESIGN.md does not bind to one step.** A `Card·*` host carries whatever
  corner the generation that drew it typed; DESIGN.md's `card: {rounded.md}` is the authority, but no rule compares a host to
  its family's declared role, so a card at `sm` under a `md` contract reads CLEAN. Read the masters against DESIGN.md before
  claiming the roles are applied, and repair by **re-driving that spec board through `CF`** (the factory is the only writer
  that knows its family's role) — never by patching radii in place.
- Radius nesting rule (HARD): `inner radius = outer radius − padding`, clamped ≥0 — read as **which step to take**, not
  as arithmetic: the inner box takes the declared step at or below `outer − inset`. An interpolated number
  (`card radius + 4`) is the old failure mode and is what `radius_nesting` now indicts.
- Radius ramp (DEFAULT ladder, cross-system, for a design with no measured source):
  `none 0 / xs 2 / sm 4 / md 8 / lg 12 / xl 16 / full 9999`. A step is a single number because a token is a single value.
  A recreation **always takes the source's own ladder** and writes it into DESIGN.md §Shapes; `full` is stored as 9999
  and rendered clamped, which is why a pill binds `radius.full` instead of `height/2`.
  One system uses **at most 3 radii** for the same component family; controls share one, cards a larger one, pills are `full` (only chips/buttons/tabs/pills).

### 5.2 State layers (M3 model — the only formal one; adopted as default)

Hover **8%**, Focus **12%**, Pressed **12%**, Dragged **16%** overlay of the `on-*` content color over the container.

**The overlay material has two cases, and the state board must show both.** Over a light container the wash is the
declared on-surface ink. Over a **saturated brand fill** the same state is a **shade**, not a lift: white at 8% over
`#2563EB` reads `#3F76ED`, where a white label drops to 4.18:1 and breaks §3.3, so `CF.fills(…, { onDark: true })`
darkens instead (Fluent's brand hover is a darker step too). Over a **neutral inverse ground** (`#161616`) that shade is
a visual no-op — seven identical black tiles — so a board that *documents* the state ladder passes the wash in explicitly
(`FN.stateLayers` → `{ overlay: FN.ink(ground) }`, the declared token of the lane it belongs to). `disabledContent` is the
other material: it dims the **copy** (`CF.STATE.disabledContent` = .38), it never paints a container wash, and the dimmed
label still needs a ground-coloured tile behind it or it disappears into the board.

| State | Rule |
|---|---|
| Default | the base recipe |
| Hover | tint only (8–10% overlay or one palette step lighter/darker). **Never change size, padding, border width or position on hover** — that shifts layout |
| Pressed/Active | one step stronger than hover (12%), or 1px translate-down if the style uses a hard shadow |
| Focused | **HARD**: a dedicated ring, not a hover tint. Default: 2px accent ring + 2px offset, ≥3:1 against both surfaces (Fluent's double ring: `outline 2px light` + `inner 2px dark`). In Penpot: `shadows` with `blur 0 / spread 3` in the ring color + inner stroke |
| Selected | must survive a screenshot with no cursor: tinted background + weight + (leading bar or check). Selected ≠ hover, and is not a hover state |
| Disabled | no hover semantics, reduced contrast pair (container 12% + content 38%), and never the only visual difference from enabled |
| Loading | same box as default (no size change) + spinner/skeleton; never move the label |

**HARD**: every interactive component's spec board must show the full applicable state row — `Default / Hover / Pressed / Focused / Selected / Disabled / Loading`
(display widgets: `Default / Disabled`). A component board missing two or more states fails gate G12.

### 5.3 How these state rules become Penpot primitives (so a hand-built control cannot fake them)

The auditor reads **names and layers**, not intent. `CF` writes them; a hand-built control that paints the same pixels
without them is a finding, not a style difference.

| Rule | Primitive | What the auditor looks for |
|---|---|---|
| Hover / Pressed / Focus overlay alphas (§5.2) | `CF.fills(bg, state, { onDark, overlay })` appends an **overlay fill** at `CF.STATE[state]` (8/12/12%) — the ink color over the surface on light, black over a saturated brand fill (`onDark`), or the wash you name (`overlay`, what `02.02 · State layers` uses so the dark lane is not seven identical black tiles) | the base fill stays opaque, so `contrast` measures the resting pair, and `off_grid` ignores the overlay |
| Selected ≠ solid brand | `CF.fills(bg, 'selected', { tint: 1 })` paints the hue at **12% wash**, never solid — solid brand under its own label is 2.9:1 | a selected row/option/card whose fill is opaque brand reads as a `contrast` failure |
| Focus ring | `ctx.ring(box)` mounts a **sibling plate named `ring·focus`** (2px stroke, 2px offset) | `focus_ring_missing` accepts a `ring·` layer **or** a ≥2px stroke; a darkened 1px border never counts |
| Touch floor | `ctx.hitPad(box, CF.minHit())` mounts an **invisible plate named `hitpad·<w>×<h>`** centered on the control | `touch_target` counts the pad, so a 24px icon button on mobile is legal only with a ≥44 pad present |
| Disabled = the whole control recedes | `ctx.place()` clamps **every text in the host subtree** (and in any host nested inside a `·Disabled` host) to `min(alpha, CF.STATE.disabledContent)` = `.38`; explicit alphas move downward only | `disabled_wrong` measures the label alpha and requires `.25–.40`; a dimmed plate with a full-opacity label fails. **The exemption is the §4 name grammar**: `disabled` must be a `·`-separated segment of an *ancestor host* name (`Button·Disabled·Md`), not a word anywhere in the chain — measured 2026-10-21, a caption that merely said "Disabled recedes a…" inherited the exemption and hid a real finding. And it only ever sees texts the auditor walks: rule 31's peers **stop at an instance boundary** (`api-pitfalls.md` §15) |
| State axes are nameable | `CF.name({ state })` writes `·Hover` / `·Focus` / `·Disabled` / `·Selected` into the host name | `state_coverage` counts the columns by name — an unnamed host draws but is not counted |

- `hitpad·` and `ring·` are also the **escape convention for hand-built `03–17` boards**: if you must place a control outside `CF`,
  name its invisible hit plate `hitpad·44×44` and its focus layer `ring·focus`, and the rules will see them.
  **Never on a `01.xx`/`02.xx` chapter page** — those boards are `FN` projections and the stamp (`nl:fn=<kind>`) is the only
  way one exists there (gate G16, rule 31 `not_projected`).
- Anything that needs a *declared* role (11px `axis`/`overline`/`kbd`) works the same way: the role lives in the name.

## 6. Controls, targets and density

- **Control heights (DEFAULT, near-universal)**: `xs 24` (compact inline), `sm 32` (AntD default / Fluent medium), `md 36–40` (Fluent large / M3 button 40), `lg 40–48` (hero, mobile, forms).
  One page picks **one** baseline (32 for dense back-office, 40 for consumer) and uses the others only as deliberate steps.
- Vertical padding of a control = `(height − line-height) / 2`; horizontal padding 12 (sm) / 16 (md) (AntD `paddingInline 15/11` for 40/32 controls).
- **HARD — touch targets**: `pad`/`mobile` ≥ **44×44** (Apple HIG) — 48 is the safer default (M3); `web` ≥ **32** for pointer, and any 24-tall control must sit in a ≥32 hit row.
  Icon-only controls on touch tiers must be ≥44 with ≥8 separation.
- Density modes are a **named axis**, not ad-hoc shrink: `comfortable` (row 48–56, pad 16), `default` (row 40–48, pad 12–16), `compact` (row 32–40, pad 8–12).
  Table row heights come from the quantized set **32 / 40 / 48 / 56 / 64 / 72 / 88** (HARD).
- Form: label above field on mobile, label left (160–240 wide, right-aligned colon) on desktop; label↔field gap 4–6; field↔field 16–20;
  helper/error text 12–13 placed 4 below the field; error is **red text + icon**, never border-color alone.

## 7. Iconography

- Size ladder (HARD to these steps): **16** inline with 14px text / **20** inside buttons, menu items, inputs / **24** nav, tabs, cards /
  **28–32** empty states, feature blocks / **40–48** hero marks. One size per context, no in-between.
- Grid: 24×24 with 2px stroke (Fluent/AntD convention), 2px padding inside the box, `currentColor`-style single fill so the icon follows the text token.
- Icon + label gap **8** (12 when the label is ≥20px); the icon is optically centered on the label's cap height, not on the line box
  (centering error ≤1px — this is checked in acceptance).
- **Never** mix stroke weights or corner styles in one icon set; never stretch non-uniformly; never use an emoji as a business icon
  (Penpot renders emoji as pixel art — legitimate only for game/pixel styles, see api-pitfalls §5).
- Icon-only control needs: a tooltip/hint board in the spec + a name in `component-map.json` (the code side needs the accessible label).
- **Where the icons come from** (this grid is exactly why): `CF.glyph` for in-control marks, the bundled Lucide catalog
  (24×24, 2px round stroke, ISC) through `storage.IC` for page/decorative icons, `CF.svgIcon` for the target system's own
  SVGs — channel choice, licensing and the `.penpot`-import verdict are in `references/icons.md`.

## 8. Alignment (from AntD's published Do/Don't + Carbon practice)

- One visual starting line per view; titles and body left-aligned; colons right-aligned so content forms a column;
  numbers right-aligned with equal decimals; icons share a leading edge column.
- Keep content away from the window edge (fixed page margin) — never let a block "float" to the viewport bound.
- Baseline-align text+icon+chip inside one row; a 1px baseline drift across a toolbar reads as slop at export zoom.
- Two-column content ratio **2.2–3.2 : 1** (HARD, never 50/50): a side panel equal to the main column turns properties into content.

## 9. Motion (Design → Code side; static in the design file)

Durations `fast 100ms / base 200ms / slow 300ms`; easings `standard cubic-bezier(.2,0,0,1)` (M3) /
`ease-in-out cubic-bezier(.645,.045,.355,1)` (AntD). Design boards document the **end state**, never a mid-animation frame.
Motion values live in DESIGN.md prose (`## Motion`) so code can read them; the 5-state row (§5.2) is what the Penpot boards must contain.

## 10. When the target gives nothing (DEFAULT kit)

If Entry A/B/C produced no measurable value for a concern, adopt this kit, write it into DESIGN.md frontmatter, and mark the prose
`consensus default (not measured from target)` so it is never passed off as observed:

```yaml
spacing: { xxs: 4px, xs: 8px, sm: 12px, md: 16px, lg: 24px, xl: 32px, xxl: 48px, section: 96px }
rounded: { none: 0px, sm: 4px, md: 8px, lg: 12px, xl: 16px, full: 9999px }
# typography: the §3.2 table verbatim;  colors: §3.3 text ramp + a 10-step primary ramp (§4)
# controls: heights 24/32/40 · touchMin 44px · rows 32/40/48/56/64/72/88 · measure 720px
```

## 11. Consolidated HARD rules (what `scripts/audit_design.js` checks)

| # | Rule | Signature |
|---|---|---|
| 1 | every coordinate and every size **the designer typed** is on the 4px grid (hairlines and text boxes exempt; so are hug axes, a flow child's derived x/y, and a shelf-pinned board's top — see the note below) | `off_grid` |
| 2 | every measured gap ∈ `LY.SPACE` (0/2/4/8/12/16/20/24/32/48/64/96/128) — judged between **adjacent siblings in the full child list**, never across an excluded one | `off_scale_gap` |
| 3 | every font size ∈ **the declared ramp** (`TK.declared().types` when the token engine is live, else the `storage.T` mirror — the verdict prints which), ≥12px (11px only for a **named** role: `axis` / `overline` / `kbd`, or a `sample ·` type specimen) | `off_ramp_size` |
| 4 | text with >2 lines and width >760 → prose measure exceeded | `measure_overflow` |
| 5 | two-column split ratio outside 2.2–3.2 (and not a documented exception) | `split_ratio_50_50` |
| 6 | control wider than its cap (input >420, select >240) in a container ≥720 wide | `control_too_wide` |
| 7 | interactive target below tier minimum (mobile/pad 44, web 32) | `touch_target` |
| 8 | more than one filled-primary control inside one region/board | `multiple_primary` |
| 9 | row/board height not in the quantized set while the board is a list/table recipe | `row_height` |
| 10 | radius of an inner box > (outer radius − inset) — the inner box must take the declared **step** at or below that bound, never an interpolated number | `radius_nesting` |
| 11 | text/fill pair below 4.5:1 (3:1 for ≥24px, icons carrying meaning) | `contrast` |
| 12 | screen board whose height equals the tier viewport while its content bands overflow / or a tall empty region | `viewport_locked` |
| 13 | component spec board missing a required state column | `state_coverage` |
| 14 | section rhythm variance > one scale step between sibling bands | `rhythm_inconsistent` |
| 15 | family present with < 3 non-state, non-size variant tokens (no `IconStart`/affix/block variant drawn) | `variant_sparse` |
| 16 | control family with no `ring·` layer and no ≥2px focus border on its Focus hosts | `focus_ring_missing` |
| 17 | disabled content alpha outside `.25–.40` (`CF.STATE.disabledContent`); "is this disabled?" is decided on a **name segment** (`·Disabled`, `/disabled`, `-disabled`), never a substring — `CF.STATE.disabledContent` contains `disabled` and must not read as a disabled board | `disabled_wrong` |
| 18 | shape/component name containing `/` or a newline — the variant-order grammar is `Family·Type·Size·State·Slot·Tone` | `name_invalid` |
| 19 | an opaque paint whose hex **is** a declared colour token but the shape has no `tokens.fill` / `tokens.strokeColor` — the colour was typed, not chosen from the set | `paint_unbound` |
| 20 | a paint whose hex is not any declared colour token — palette and token set have drifted | `paint_off_palette` |
| 21 | copy that matches a declared ramp step but carries no `tokens.typography` binding | `type_unbound` |
| 22 | a drawn `(family,size,weight)` that is not a declared typography token, so nothing can bind to it | `type_off_ramp` |
| 23 | a flow container whose `rowGap`/`columnGap` equals a declared spacing token but has no `tokens.rowGap`/`tokens.columnGap` | `space_unbound` |
| 24 | a gap or padding on a flow/grid container that is not any declared `spacing` value | `space_off_scale` |
| 25 | a tier-viewport composition board with neither native `guides` nor `rulerGuides` — the grid must live on the board | `no_guides` |
| 26 | a `region·` pane that holds child regions was also filled with copy — a pane is structure, not a band | `pane_filled` |
| 27 | a control host whose name already has a master in the local library, drawn again instead of placed with `CF.instance` | `not_component` |
| 28 | a `wash|hue|ink #RRGGBB` caption that does not match the paint of the swatch beside it — the board documents a value it no longer shows | `caption_stale` |
| 29 | a `cell·slot·*` / `cell·recipe·*` container with **zero children** — the region plates its `after` pass draws are missing, so the block is an empty frame that every structural check passes | `empty_cell` |
| 30 | the ramp declares `typography` tokens and this board draws text, but `library.local.typographies` is **empty** — 素材 → 排版 has nothing to offer a consumer | `no_type_styles` |
| 31 | a board on a Foundations / Color-in-use chapter page (`FN.CHAPTER`) that carries no durable `nl:fn` projection stamp — it was **composed by hand, not projected** (the two declared exemptions are `Icons` on `01` and `Light vs dark` on `02`; if `storage.FN` is not seeded the rule reports instead of passing) | `not_projected` |
| 32 | **§2.1** — a flow container whose ≥2 block-level (≥24 on the stack axis) siblings are separated by less than `LY.breath("inline", tier)`: the whitespace that carries the hierarchy was simply omitted. Skips a repeated run of cross-axis items (a table), abutting panes (§1.3), and any label↔field pair, which is legal at 4–6 | `cramped_gap` |
| 33 | **§1.3 rule 1 / §2.1** — at composition level, a container whose gap between groups is under **2×** the gap inside those groups, where a group is a child that *stacks* ≥2 block-level siblings of its own. A row's cell gap is not a group gap, and a repeated run is one group, not several | `hierarchy_gap` |
| 34 | **§3.2** — copy with no typographic whitespace: a wrapped paragraph (≥1.8 rendered lines) whose `lineHeight` is under the leading the ramp declares for that size, **or** two consecutive prose blocks separated by less than one line of the block above | `text_cramped` |
| 35 | **§5.1** — a corner whose value is **not one of the declared `borderRadius` token values** (judged from the live `TK.declared().radii`, not a hard-coded ramp): an orphan number left on the canvas. One finding per shape, not per corner | `radius_off_ladder` |
| 36 | **§5.1** — a corner whose value **is** a declared `borderRadius` token but carries no `tokens.borderRadiusTopLeft/TopRight/BottomRight/BottomLeft` binding: the value was typed, not chosen. Repaired by `TK.radiusSweep()`, whose adoption read (`radiusPages()`) is the number the delivery report quotes | `radius_unbound` |
| 37 | **§5.1** — a `ring·*` layer whose corner is not its host control's corner (`CF.ROLE.ring = 'host'`). Rules 35/36 pass it: `r0` body and `r9999` ring are both declared and both bound, and only the **pair** is wrong — the defect a user sees as "a rectangle in front of a rounded ring" (measured 2026-10-22: 194 of 230 rings disagreed with their host). Repaired by `TK.roleSweep()` | `ring_off_host` |
| 38 | **§5.1** — a `ring·*` plate that is **not mounted inside the control it outlines**: its ancestry reaches the `·Spec`/PageRoot container without passing a control board, or it is inside a control but traces no plate and is not contained by it. Judged by enclosure + concentricity (margin **0–12** per axis, non-uniform allowed, centre Δ ≤ 3) — **never** by a fixed 2px margin, which is what made the first draft of this rule flag 47 legitimate rings. What the user reports as "this element drifted"; repaired by `TK.ringSweep()` (7 of 231 drifted by 10–72px) | `ring_detached` |
| 39 | **§12 (gate G17)** — *screen pages only* (`14–16 · Screens`, matched by page name): a family-named board **drawn** where the library has **no master of that name**. Rule 27 `not_component` structurally cannot see this — it needs an exact-name master to compare against — so a screen made of disposable one-off rectangles passed the gate while having nothing to fix centrally, no variants and no swap. The repair is never "draw it again": extend the factory (G12), `CF.autoRegister`, then **place** it (`SC.ctl` → `CF.instance`). The family index is read **live** from `CF.map()` (falling back to the auditor's own `CLASS` table), so a newly added factory is judged the same session it appears | `not_assembled` |
| 40 | **§12 (gate G17)** — *screen pages only*: a shape whose name claims a raster slot (the **single** grammar `CF.isMediaSlot`, which `MD.isSlot` also calls — a plate cannot be a slot for the gate and invisible to the engine) but carries no `fillImage` in its fills: a gray rectangle standing in for the user's own photograph. Import the source asset with `MD.place({parent, slot, path})`; judged **before** `rec()`, because a rect plate is not a box shape and the text/box early-return would have hidden every one of them (measured: 19 + 27 such slots on pages 14/15, `mediaFills: 0`) | `placeholder_media` |
| 41 | **§12 (gate G17)** — *screen pages only*: a top-level content board at a tier baseline width with **no durable `nl:sc` / `nl:rec` stamp** — it was composed freehand, so there is no record of the source material it claims to recreate and the gate cannot be re-read in a later session. Rebuild with `SC.record(…)` then `SC.build(…)`. The **page-level half** of the same rule reports a Screens page where `storage.SC` was never seeded: **unprovable is REPORTED, not passed** — the contract rule 31 applies to G16. Judges top-level boards only, because a full-bleed band inside a screen is the same width as its host and would otherwise be counted as a second screen | `no_source_record` |

**Rules 1/2 judge authored numbers, not arithmetic.** In a flow board the numbers the designer chose are the padding,
the gap and the sizing declaration; the resulting coordinates and hug boxes are sums over font metrics (a 13px label is
19 tall at leading 1.4), so `y=54` or `h=99` is not something anyone can fix without also changing the font — flagging it
is a finding nobody can act on. `off_grid` therefore skips (a) a **hug** axis (`horizontalSizing`/`verticalSizing` =
`auto`), (b) a flow child's derived x/y inside a flex parent (an **absolute** child still counts: its x/y *is* typed),
and (c) a board pinned by the Foundations shelf, whose top is `previous bottom + declared gap` — snapping that coordinate
would instead put the *gap* off `LY.SPACE`, and the gap is the decision `off_scale_gap` judges. Measured 2026-10-21 on
the `FN` `Palette` board: every `off_grid` finding on it was of this kind, while the real defect — a hug frame frozen at
6 px under 68 px of text — is invisible to rule 1 and is caught by `NL.auditFlow`'s `hug_frozen` instead
(`native-layout.md` §7). **The exemptions move a finding to the right engine; they never delete it.**

**The two identity chapters — `01 · Foundations` and `02 · Color in use` — are projections, so most of these rules cannot
fire there (gate G16 — the only and default way those pages are built; both chapters are in `FN.CHAPTER` and are gated
identically, so 02 is not a downstream consumer of 01, it is the same contract with the colour-side kinds).**
`storage.FN` reads its values from `TK.declared()` (a missing token kind is a refusal, so 19–24 hold by construction),
derives each height from the hug sum (so there is no typed number for 1/2 to reject), computes the `wash|hue|ink #RRGGBB`
captions from the same record as the swatch (rule 28), and WCAG ratios from the palette itself (rule 11). Call shape, the
one-board-per-call discipline and the measured cost are in `engines.md` §7. Hand-composing those boards — a `storage.T`
hex mirror, a `[56,136,40,40]` row array — is the failure mode this replaces: each guessed number used to cost one audit
round-trip.

**G16 is machine-checked, in two scopes.** Every board `FN.project` mounts carries `nl:fn=<kind>` + `nl:shelf=1` as
**pluginData**, i.e. inside the file, so the proof survives a storage wipe and is readable by anyone who opens it —
unlike `FN.records`, which is JS memory. Rule 31 (`not_projected`) reads that stamp, and reads the chapter table, the
exemption list and the kind list **from FN itself**, so auditor and engine cannot disagree. Because this skill's
pagination is block-per-page (`01.09 · Foundations · Palette`), a chapter is spread over ~9 pages: per-page scope
catches an un-stamped board, and `storage.designCoverage()` / `FN.coverage()` answer the file question — every chapter
kind projected somewhere, no chapter board left hand-drawn. Measured 2026-10-21: coverage over 14 chapter pages is one
read-only call; on a live file it reported the 12 hand-composed boards still on `01.xx`/`02.xx` and refused
`CLEAN`, and an 11-board projected page read `CLEAN` (351 boards / 919 shapes / 7.4 s).

**Token rules 19–24 are birth rules, not backfill rules.** A hex that matches the palette is still a typed colour; the
gate reads `tokens.fill` / `tokens.strokeColor` / `tokens.typography` / `tokens.rowGap`, never the hex. Seed the token
set before the first board (G9) and bind each board in the same builder pass (`TK.bindBoard(board, { snapSpace: true })`,
G14) — a late sweep is how a system ends up with colour, type and spacing surviving only as numbers. The full token
surface and its six measured traps are in `design-tokens.md` §8.1.

**Rule 28 exists because paint and copy have different lifetimes.** A swatch bound to a colour token re-renders whenever
the token changes; the `wash #E7E1F9` label next to it is a string frozen at build time. Build a palette-documentation
board **after** the theme overlay is loaded, and when repairing one, re-derive the caption from the sibling plate's own
`fills[].fillColor` rather than from the palette mirror — the mirror is what was stale in the first place.

Rule 29 exists because a block whose content pass never ran is invisible to every geometric rule: the container is
correctly sized, correctly placed and correctly named, and only its **child count** says it is empty. The measured way
to produce it is a build that hits the `execute_code` ceiling — the board is created, the call dies before `after`, and
the stray-heal later mounts the bare frame (see `engines.md` §6). Re-drive those specs with `replace=true`; do not
"fix" them by hand-drawing plates.

Rule 30 closes the gap between *declared* and *reachable*. A `typography` token is what the auditor binds to and what
`TK` writes; the type a designer picks off 素材 → 排版 is a **`LibraryTypography` style record**, a different subsystem
(`penpot.library.local.typographies`). Measured on a delivered file: 40 active typography tokens, `themes: []`,
`typographies.length === 0` — the panel was empty and every other rule passed, because every other rule reads the shape
tree or the token set. `storage.TP.seed()` registers one style per declared step, named exactly like its token, verifies
each field by readback and is idempotent; `TP.apply` exists for consumers, but **do not bulk-apply styles over bound
text** — `applyToText` rewrites `lineHeight` to `1.2` whatever the record says (capabilities §6), so it flattens the
rhythm rule 21/22 just tuned.

`storage.designGate()` verdict is computed from these 38 (`out.rules`); the 15 defect signatures
(`out_of_bounds`, `board_overlap`, `text_overlap`, `text_overlap_x`, `header_collision`, `malformed_text`, `align_missing`,
`crash_100x100`, `degenerate_size`, `root_stray`, `text_centre_residue`, `loose_assembly`, `stroke_covered`, `stroke_clipped`,
`duplicate_board`) belong to `audit_layout.js` and are reported as delegated, never double-counted. `text_centre_info` is
informational and does not change the verdict. Rule 31 (`not_projected`) is the one rule that does not read geometry at all:
it reads the durable `nl:fn=<kind>` stamp that only `FN.project` writes, and its **file-level** twin is
`storage.designCoverage()` — deliberately a separate call, because a per-page audit cannot see a chapter page nobody built.

**Rules 32–34 share one table with the builder, and have one repair twin.** The amounts come from `LY.BREATH`
(`LY.breath(level, tier)`) and the leading floor from the declared typography tokens, published as
`storage.breathSpec` (`blockMin`/`proseMin`/`minLeading`/`lead` + the shape-filter regexes) at audit time, so
`storage.breathe()` (`fix_geometry.js`, dry-run by default, idempotent) aims at exactly the floor the gate measures and
every gap it writes is the next `LY.SPACE` member — a repair can never create `space_off_scale`. `designPage()` also
returns `out.breath`: an **adoption read** (how many flow containers sit on a ladder level, and the histogram of those
that do not) — not a rule, because a gap can be on-scale and still not be the ladder's. Proven 2026-10-21 on a planted
probe: 2 `cramped_gap` + 2 `hierarchy_gap` + 3 `text_cramped` → one `breathe({apply:true})` pass → 0/0/0, second pass
`raised: 0` (idempotent), and the file's three real findings (`row·head` at gap 4 on `10.22`/`10.23`/`10.25`) cleared the
same way with the gate CLEAN and the layout auditor unchanged on all three pages.

Rules 3/13/15–18 depend on **names, not pixels**: `CF` writes the role (`ctx.text({ role: 'axis' })`), the slot
(`slotName()` → `IconStart`/`Clear`/`Addon`/…) and the state into the shape name, so the auditor can decide coverage
from the registry. A hand-built board that draws the same pixels without the name token reads as absent.
Rules 13 and the variant minimum set are specified in `references/component-library.md`; rules 4/5/6/12 in `references/layout-library.md`.

## 12. A recreated screen is assembled from the system (gate **G17**, rules 39–41)

Everything above §11 describes how a *design system* is drawn. Pages `14–16 · Screens` are where a different promise is
being made: the user handed over source material — a URL, screenshots, an existing component tree — and asked for it to be
**imitated / recreated** (仿写 / 复刻). For those pages, matching the pixels is not the deliverable. The deliverable is the
same UI expressed in **this file's** mechanisms, because that is the only version the user can then edit, re-theme, swap a
state on, or hand to a developer.

**So on a recreation, a screen is assembled and never drawn (HARD).** Six channels, one legal call each, one signature each:

| The source shows | Assemble it with | Rule that catches the shortcut |
|---|---|---|
| a region, column, full-bleed band | `LY.recipe(key,{tier})` → `NL.fromRecipe` (gaps from `LY.BREATH`, §2.1) | `off_grid`, `no_guides`, `pane_filled` |
| a control (button, field, row, card…) | **a library instance**: `SC.ctl` → `CF.instance` / `CF.swap` | 39 `not_assembled` (no master) · 27 `not_component` (master exists, redrawn anyway) |
| its colour | a token / library colour (`TK.bindBoard`, `LIB.fill`) | 19–20 `paint_unbound`, `paint_off_palette` |
| its type | the declared ramp step **plus** the library typography style (`SC.copy` → `TP.apply`) | 21–22 `type_unbound`, `type_off_ramp`, 30 `no_type_styles` |
| an icon | `IC.place` (catalog) or `CF.glyph` (in-control) | none yet — the record's `icons[]` is the only check, so an emoji placeholder is caught by reading the board, not by the gate |
| a **photograph, logo or screenshot** | the user's own bytes: `MD.place({parent, slot, path})` → a real `fillImage` media object | 40 `placeholder_media` |

**The record comes before the build (HARD, rule 41).** What the source shows is written down first —
`SC.record(screen, { src, tier, recipe, sections:[{ region, controls, copy, media, icons }] })` — which *validates while you
declare*: a recipe outside `LY.keys()`, a control with no master, a raster slot with no source path, copy with no text each
return as a `gaps` entry instead of becoming a shape. `SC.build` then assembles it and stamps the record **into the board**
(`nl:sc`/`nl:src`/`nl:recipe`/`nl:tier` + the `nl:rec` digest), so the contract survives the session: `SC.coverage()` re-reads
it from the file and another person, or a post-crash rebuild, can re-run the same gate without this conversation. A screen
composed freehand — however good it looks — has no record, and `no_source_record` reports it.
**Unprovable is reported, not passed**: a Screens page where `storage.SC` was never seeded fails the same signature instead of
reading CLEAN, exactly as rule 31 does for G16.

**A screen mounts inside `NN-PageRoot`, never at page root (HARD).** `designPage()` walks from the page head, so a root-level
board is invisible to the gate while `audit_layout` indicts it as `root_stray`: measured 2026-10-22, a 31-shape screen at page
root audited `shapes: 201` and read **CLEAN**. `SC.pageRoot()` / `SC.nextSlot()` handle the placement.

**What is *not* a shortcut**: a `·Spec` board on `03–09` is *supposed* to be a drawing — that drawing is what gets registered
as the master. Rules 39–41 are therefore **scoped by page name** (`/^1[4-9] · Screens/`), never by a guess about the board, so
an identity chapter is untouched; `13 · Component index` hosts masters, and `17 · Reference imitation` shows references. On a
recreation the order is: build the system (tokens → library → masters on `03–13`), *then* assemble the screens from it.

**G17 proves assembly, not fidelity.** It cannot see that the wording is wrong, that the crop is off, or that the source had
four testimonials and the board has three. The acceptance for a recreated screen stays the pixel diff against the source
(`verification.md`, `scripts/pixel_diff.py`), and a board never exported is never described as verified.
