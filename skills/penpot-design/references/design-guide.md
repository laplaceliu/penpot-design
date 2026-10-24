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

**HARD — on pages 01–09 the ARRANGEMENT of a board's elements is flow or grid, never free coordinates (§1.5).**
A content board positions its children with `rowGap`/`columnGap`, vertical/horizontal padding, or a grid — and those
values come from the declared spacing scale (previous rules), never typed raw. Absolute positioning inside 01–09 is
legal only for a **name-declared overlay** (`scrim`/`overlay`/`veil`/`wash·`/`ring·`/`hitpad·`/`connector`/`tail·`/`rail·`/
`boundary·`/`underline·` — rule 43 requires overlays absolute) and for a **control host's own anatomy** (the host itself
must still be a flow/grid child of its board). Page chrome (`-Header`/`-Footer`/`-PageRoot` internals) and page-level
shelf placement of whole boards are outside the rule. The measured platform fact behind it (api-pitfalls §coordinates):
a board's absolute children hold **world coordinates and do not follow the shell**, so free layout cannot re-flow after
a token change and cannot be nudged into compliance — only rebuilt. Lint: `free_layout` (gate G13). Producers:
`CF.matrix` (a flow column of grid rows with token gaps/padding; hosts attached into settled slots by `CF.move`) and
the `FN` row builders (`NL.frame`/`NL.row` + `FN.sp`).

## 2. Whitespace and vertical rhythm

Whitespace is the hierarchy carrier, not leftover. Numbers that read as "designed":

### 2.1 Whitespace is the FIRST separation device (default and preferred)

When two things have to be told apart, spend air **before** reaching for any other device, in this order:

1. **Whitespace** (`LY.BREATH`) — the gap between flow siblings. The default device for every stack: element↔element,
   section↔section, block↔block.
2. **Elevation / surface polarity** — a card, a wash, a shadow. Only when the two things are different *kinds* of surface.
3. **A stroke** — only as a functional boundary or state indicator (a pane edge, a selected tab underline, an attached button group). A 1px line is **never** a content separator.
4. **Alignment / reading order** — never a substitute for 1.

Reaching for a divider where a `block` gap would have carried the separation is the failure mode this section exists to
prevent: dividers multiply, each one then has to be kept aligned, and the page reads as a grid of lines instead of a
sequence of groups.

**HARD — content separates with a spacing-token gap, not a line (rule 43).** Rows of a list, table, accordion or menu take
`space.md` (12) or `space.base` (16) as their `rowGap`; no `divider`/`hairline` plate is drawn between them. A line plate
is absolute geometry: when the host refits, it stays where it was and the separation drifts. A line is legal only as a
functional boundary or state indicator, and it must be named `boundary·*` or `underline·*` — `divider_separator` fails
any shape still named `divider`/`hairline`.

**HARD — a separation must be either SEEN or FREE (rule 49).** Once the line is gone, the space it used to own has to
justify itself: inside one host, repeated row labels share ONE pitch, and a gap wider than that pitch is legal only when
something is drawn in it (a `group` label, a `boundary·*` line). A semantic marker that eats `space.md` and paints
nothing reads as uneven padding, not as grouping — that is exactly what a `'-'` in a `CF.menu` item list did (label gaps
12 / 24 / 12), so a divider row now costs **zero**: the four commands stay one rhythm, and a break that must be seen is
authored as a `{ group: 'File' }` row instead. Conversely a host whose gaps are all different has no rhythm to break
(header→body vs body→header in an Accordion) and is not judged.

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

### 2.3 One axis per row (nodes · connectors · copy)

Inside a row, everything that shares the line is centred on **one** axis: `max(node size, line height)`. Anchoring the node
to the band's TOP and the label to its middle is the defect a reviewer reads as "these are not aligned" — it only shows up
when the node is *smaller* than the copy beside it. Measured 2026-10-22 on `Steps·Dot·LG`: a 12px step dot under a 20px
label put the node centres at 6px and every connector and label centre at 10px, so the timeline's dots sat above their own
connecting line. `CF.steps` centres `nyNode` on the band; the same rule binds any hand-built row (steppers, timelines,
icon+label lists, avatar rows). Gated by rule 45 `row_axis_off`.

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
- **When recreating a source, these defaults do not apply.** Measure the source's own stack — its layer offsets, opacities **and insets** — and record it in DESIGN.md's `elevation:` block (§5.4). A system measured from a real site is almost never a single drop shadow: the 2026-10-23 recreation had `drop 0 7.77 16 .0588 + 0 3 3 .102` **plus** `inset 0 -8 0 .051 + 0 4 0 rgba(255,255,255,.6)` on every card, and a hover that added six more drop layers. Declaring only the e1/e2/e3 drops (the old DEFAULT translation) threw away exactly what made the source feel physical.
- **Border vs divider**: containers get 1px `border` or a tone step; items *inside* a container get 1px dividers with `colorSplit`
  (`rgba(5,5,5,.06)` light) — a visible gray hairline inside a card reads as a table.
- **A corner is taken from the `borderRadius` token set and nowhere else (HARD).** The ladder exists as tokens
  (`radius.none / xxs / xs / sm / md / lg / xl / xxl / full`); every writer in the engines goes through `CF.radius()`, which takes a
  role (`control`/`box`/`tile`/`card`/`field`/`panel`/`slab`/`hero`/`pill`…; `box` = the 4px `xxs` step for an 18–20px checkbox), a ladder key, a `radius.*` name or a number,
  and **snaps anything off-ladder to the nearest step**, recording the coercion in `CF.coerced`. So the defect cannot be
  introduced at draw time, and two machine rules judge the result: `radius_off_ladder` (a corner that is not a declared
  value) and `radius_unbound` (a corner that is a declared value but carries no `tokens.borderRadius*` binding).
  `TK.radiusSweep()` is the repair for the second one — see `design-tokens.md` §8.
- **A background plate defaults to SQUARE (HARD, rule 42).** A `·Spec` sheet, a modal, a command palette and an empty-state tile hold a group of elements; they are not controls and not cards. A large corner on such a plate clips the group it holds at the plate's own corners — measured 2026-10-22 on `FAB·Spec`, where the ladder's `lg` was the source's 100px avatar/pill step. `CF.ROLE.spec = 'none'`, and `audit_design` reports `plate_rounded` for any `·Spec` board with a non-zero corner.
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
| Focus ring | `ctx.ring(unitBox)` mounts a **sibling plate named `ring·focus`** (2px stroke, 2px offset) **on the box the factory was given** — the unit the keyboard is on, never the container's own box. `CF.FOCUS` picks the form by family role (component-library §1.3): `outline` paints it; `reserved` (compositions — Steps, Menu, Anchor, Table row, Accordion header …) authors it at `strokeOpacity: 0` as a slot and draws `wash·focus`, the 12% brand state layer, on the unit | `focus_ring_missing` accepts a focus layer that **paints** (alpha ≥ .05) **or** a ≥2px stroke; a darkened 1px border never counts. `focus_invisible` (rule 44) fails a ghost boundary with no visible layer beside it |
| Touch floor | `ctx.hitPad(box, CF.minHit())` mounts an **invisible plate named `hitpad·<w>×<h>`** centered on the control | `touch_target` counts the pad, so a 24px icon button on mobile is legal only with a ≥44 pad present |
| Disabled = the whole control recedes | `ctx.place()` clamps **every text in the host subtree** (and in any host nested inside a `·Disabled` host) to `min(alpha, CF.STATE.disabledContent)` = `.38`; explicit alphas move downward only | `disabled_wrong` measures the label alpha and requires `.25–.40`; a dimmed plate with a full-opacity label fails. **The exemption is the §4 name grammar**: `disabled` must be a `·`-separated segment of an *ancestor host* name (`Button·Disabled·Md`), not a word anywhere in the chain — measured 2026-10-21, a caption that merely said "Disabled recedes a…" inherited the exemption and hid a real finding. And it only ever sees texts the auditor walks: rule 31's peers **stop at an instance boundary** (`api-pitfalls.md` §15) |
| State axes are nameable | `CF.name({ state })` writes `·Hover` / `·Focus` / `·Disabled` / `·Selected` into the host name | `state_coverage` counts the columns by name — an unnamed host draws but is not counted |

- `hitpad·` and `ring·` are also the **escape convention for hand-built `03–17` boards**: if you must place a control outside `CF`,
  name its invisible hit plate `hitpad·44×44` and its focus layer `ring·focus`, and the rules will see them.
  **Never on a `01.xx`/`02.xx` chapter page** — those boards are `FN` projections and the stamp (`nl:fn=<kind>`) is the only
  way one exists there (gate G16, rule 31 `not_projected`).
- Anything that needs a *declared* role (11px `axis`/`overline`/`kbd`) works the same way: the role lives in the name.

### 5.4 Physicality: the stack, the inset pair, the sheen, the lift (HARD, gate G18)

A "shadow" in this skill is a **recipe**, not a number. `storage.EL` (`elevation_engine.js`) owns it; the recipe is
declared in DESIGN.md (`elevation:` frontmatter) and seeded as a **multi-layer `shadow.<recipe>` token**. Nothing else
may write `shape.shadows`.

**The stack.** A raised object carries a *drop ladder* **and** an *inset pair*:

| Recipe archetype (names and values are the PROJECT's — DESIGN.md `elevation:`; a family reads its recipe from its profile `elevation` key, so no factory names one) | Layers |
|---|---|
| `card` — light card, list row, accordion | two soft drops (a tight contact shadow + a wide ambient one); inner dark bottom lip + inner white top highlight |
| `control` — dark button / FAB / icon button | two tight drops; inner lip + highlight; optional radial sheen |
| `tile` — a graphic tile whose fill is a brand gradient | tinted glow drops (the hue of the fill, not black) + one tight dark drop; inner lip + highlight; **no sheen** — a gradient fill already carries the top light, and a sheen over it muddies the hue |
| `nav` — floating pill / bar | small drop ladder + soft insets |
| `panel` — dark band, toast, inverse surface | drop ladder + lip + highlight; sheen |
| `e1/e2/e3` | pure drop ladder for unnamed objects (segment thumb, slider handle, foundations swatch) |

**The inset pair is what a recipe must declare, and the sheen is what it must not double up.** A gradient or a
top-lit fill already reads as lit from above; adding the radial sheen plate on top of it is a second light source.

**Why the inset pair is HARD.** A drop shadow says "this floats"; the inset pair says "this is a **moulded object**"
— the bottom lip catches the eye and the top highlight catches the light. Measured 2026-10-23: of 3020 shapes, 49 had a
shadow and **0** had an inner layer; the file read CLEAN under every rule the gate had at the time because **none of them measured material**.
Penpot renders mixed drop/inset arrays (proved by export), so this is a gate gap, not a renderer limit.

**Hover is a LIFT.** `controlHover` keeps the lip/highlight and grows the drop stack from 2 to 6 layers (up to
`0 100 80 .149`); `cardHover` swaps `e2` for `e3`; `controlPressed`/`cardPressed` collapse to `e1` and deepen the lip.
A state modelled only as an 8% fill tint is `hover_flat`. The engine picks the recipe from the host name
(`Button·MD·Hover`), including the **no-type** form (`Button·MD` = default type, not an unknown `Md` type) and the
case-insensitive family (`FAB` vs `Fab`). Sizes never change.

**Sheen** is a separate `sheen·` rectangle with a **radial gradient** (white `.2` at 28% / −10%). Penpot fills are
solid **or** gradient — mixing `fillColor` and `fillColorGradient` in one fill throws `Value not valid … :fills` — so the
sheen sits **above the surface and below the content**. A component **copy** cannot be authored; its master carries the
sheen and the copy inherits it (measured: a 128×32 Button master's sheen appeared on its screen copies).

**Surfaces.** A card shadow needs something to cast it. A section declares `surface` (a live colour token) +
`elevation` (a recipe) + `radius` in the SC record; `SC.build` mounts `surface·<region>` **before** the copy. A
screen with bare text regions is `surface_missing`, and a page with no plates is how 143 shapes shipped with **0**
shadows. A surface is a plain rectangle (not a board): it must sit behind content, and a text card does not clip. The
positioning audit exempts `surface·`/`sheen·` from `header_collision` — a floor legitimately covers its own title.

**What the gate cannot see.** It proves *assembly*, not *fidelity*: a recipe can be present and still use the wrong
source values, and a hover variant can be drawn without being reachable in a prototype. Penpot has no "switch variant
on mouse-enter" action, so runtime hover is not authorable in a Penpot prototype; hover states are delivered as
**state variants / matrix cells** and the motion is documented. The PIL diff against the source remains the
fidelity check. Repairs: `EL.apply` (one shape), `EL.sweepPage({page, apply})` (family/state pass),
`EL.surfacePass({surfaces})` (missing plates), `EL.bindStamped` (tokens), `EL.audit` (census).

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
- **An icon is placed in a SLOT, never stretched to its control box.** `CF.iconSize(host)` returns 16/20/24/32 by host size and `CF.iconBox(host)` centres it; a 32px stepper therefore draws a 20px icon at a 1.7 stroke, not a 32px mark filling the plate (measured 2026-10-22: the old call passed the whole stepper box and produced a 19×19 plus with a 2.72 stroke beside 14px copy). A minus is a **zero-height path**: centre it by its line coordinate, not by resizing a 20×20 box — the line stays at the box top and reads as "not centred".
- Grid: 24×24 with 2px stroke (Fluent/AntD convention), 2px padding inside the box, `currentColor`-style single fill so the icon follows the text token.
- Icon + label gap **8** (12 when the label is ≥20px); the icon is optically centered on the label's cap height, not on the line box
  (centering error ≤1px).
- **HARD — the INK is centred, not the 24-unit cell.** `CF.glyph` scales the grid to the slot and then shifts by `G_BOX` (each glyph's real ink
  bbox, computed from the table at seed time), because the authored drawings are NOT uniformly centred in their cell: `home`/`check`/`search` sit
  at (12,12) but `undo` spans [1,4]–[16,14] (centre 8.5,9), `redo` (15.5,9), `chart` (12,14), `bell` (11.35). Centring the cell handed every
  off-centre mark straight through to the row: measured on a `Button·MD·IconStart` the download icon sat 3px off its label, a `Chip·SM` check 4px,
  an `Alert` info mark 2px. Gate: rule 45 `row_axis_off` also compares a mark's centre with the copy beside it — judged only in a host with ONE
  mark and ONE label, because in a multi-row host (Tree, Menu, Accordion) no pairing is provable: by name it merges five rows into one mark
  (phantom dy −63.7), by origin it splits one icon into two halves that then disagree. Repair an existing file with `TK.axisSweep`.
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
- **Row copy is centred as a BLOCK inside the row, not top-aligned.** A 48px one-line list row centres its 14/1.4 title (box 22) at `(48−22)/2`; a 2/3-line row centres the whole 38/56 block. The leading icon and trailing chevron share that centre — a top-aligned title beside a centred chevron reads as a broken row (measured 2026-10-22 on `ListItem·1line·Trail·chevron`). Where a label sits in its own bordered cell, the value copy starts **one row breath after that cell's border** (`LY.breath('row')`, 12 = `space.md`), never flush to the border — measured 2026-10-22 on `Descriptions·Bordered·2col`, where the value began exactly on the label plate edge.
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
| 16 | control family with no focus layer that **paints** on its Focus hosts: a `ring·*` at alpha ≥ .05 (component-library §1.3 draws it **tight on the focus unit**, not around the container), the visible `wash·focus` state layer a `reserved` family carries instead, or a ≥2px focus border | `focus_ring_missing` |
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
| 27 | a control host on an app/shell/screen surface whose name already has a master in the local library, drawn again instead of placed with `CF.instance` — the exact-name half of G10; it now judges nested shell-composite controls too, not only top-level boards | `not_component` |
| 28 | a `wash|hue|ink #RRGGBB` caption that does not match the paint of the swatch beside it — the board documents a value it no longer shows | `caption_stale` |
| 29 | a `cell·slot·*` / `cell·recipe·*` container with **zero children** — the region plates its `after` pass draws are missing, so the block is an empty frame that every structural check passes | `empty_cell` |
| 30 | the ramp declares `typography` tokens and this board draws text, but `library.local.typographies` is **empty** — 素材 → 排版 has nothing to offer a consumer | `no_type_styles` |
| 31 | a board on a Foundations / Color-in-use chapter page (`FN.CHAPTER`) that carries no durable `nl:fn` projection stamp — it was **composed by hand, not projected** (the two declared exemptions are `Icons` on `01` and `Light vs dark` on `02`; if `storage.FN` is not seeded the rule reports instead of passing) | `not_projected` |
| 32 | **§2.1** — a flow container whose ≥2 block-level (≥24 on the stack axis) siblings are separated by less than `LY.breath("inline", tier)`: the whitespace that carries the hierarchy was simply omitted. Skips a repeated run of cross-axis items (a table), abutting panes (§1.3), and any label↔field pair, which is legal at 4–6 | `cramped_gap` |
| 33 | **§1.3 rule 1 / §2.1** — at composition level, a container whose gap between groups is under **2×** the gap inside those groups, where a group is a child that *stacks* ≥2 block-level siblings of its own. A row's cell gap is not a group gap, and a repeated run is one group, not several | `hierarchy_gap` |
| 34 | **§3.2** — copy with no typographic whitespace: a wrapped paragraph (≥1.8 rendered lines) whose `lineHeight` is under the leading the ramp declares for that size, **or** two consecutive prose blocks separated by less than one line of the block above | `text_cramped` |
| 35 | **§5.1** — a corner whose value is **not one of the declared `borderRadius` token values** (a checkbox box above the 4px `xxs` step is reported under the same signature) (judged from the live `TK.declared().radii`, not a hard-coded ramp): an orphan number left on the canvas. One finding per shape, not per corner | `radius_off_ladder` |
| 36 | **§5.1** — a corner whose value **is** a declared `borderRadius` token but carries no `tokens.borderRadiusTopLeft/TopRight/BottomRight/BottomLeft` binding: the value was typed, not chosen. Repaired by `TK.radiusSweep()`, whose adoption read (`radiusPages()`) is the number the delivery report quotes | `radius_unbound` |
| 37 | **§5.1** — a `ring·*` layer whose corner is not its host control's corner (`CF.ROLE.ring = 'host'`), **or whose centre is more than 1px off a same-size host it traces, or a checkbox/radio/switch focus ring that is OUTSET around its visible box (a small-control ring is flush; an outset halo leaves a corner gap)**. Rules 35/36 pass it: `r0` body and `r9999` ring are both declared and both bound, and only the **pair** is wrong — the defect a user sees as "a rectangle in front of a rounded ring" (measured 2026-10-22: 194 of 230 rings disagreed with their host). A 4px left drift read CLEAN before the owner tolerance was widened from 3 to 6px (measured 2026-10-23: the secondary button's focus halo sat 4px left with a 4px gap on one side). Repaired by `TK.roleSweep()` / `TK.ringSweep()` | `ring_off_host` |
| 38 | **§5.1** — a `ring·*` plate that is **not mounted inside the control it outlines**: its ancestry reaches the `·Spec`/PageRoot container without passing a control board, or it is inside a control but traces no plate and is not contained by it. Judged by enclosure + concentricity (margin **0–12** per axis, non-uniform allowed, centre Δ ≤ 3) — **never** by a fixed 2px margin, which is what made the first draft of this rule flag 47 legitimate rings. What the user reports as "this element drifted"; repaired by `TK.ringSweep()` (7 of 231 drifted by 10–72px) | `ring_detached` |
| 39 | **§12 (gate G17)** — *screen AND app-shell surfaces* (`10 · App shell & chrome`, `12 · Screen recipes`, `14–16 · Screens`, matched by page name) and **nested leaf controls**: a family-named board **drawn** where the library has **no master of that name**. Rule 27 `not_component` structurally cannot see this — it needs an exact-name master to compare against — so a shell/screen made of disposable one-off rectangles passed the gate while having nothing to fix centrally, no variants and no swap. **The first implementation was scoped to 14–16 and to `compos` boards, so page 10's raw `Button·MD` / `IconButton·Ghost·XS` / `NavItem` controls passed** (measured 2026-10-23). The repair is never "draw it again": extend the factory (G12), `CF.autoRegister` / `CF.component`, then **place** it (`SC.ctl` / `CF.instance`). The family index is read **live** from `CF.map()` (falling back to the auditor's own `CLASS` table); `shell` composites and `composer` helpers are excluded because they are documentation boards, not leaf controls. `CF.button` also refuses to draw a raw host when an exact master exists on a non-spec parent and returns `CF.instance` instead | `not_assembled` |
| 40 | **§12 (gate G17)** — *screen pages only*: a shape whose name claims a raster slot (the **single** grammar `CF.isMediaSlot`, which `MD.isSlot` also calls — a plate cannot be a slot for the gate and invisible to the engine) but carries no `fillImage` in its fills: a gray rectangle standing in for the user's own photograph. Import the source asset with `MD.place({parent, slot, path})`; judged **before** `rec()`, because a rect plate is not a box shape and the text/box early-return would have hidden every one of them (measured: 19 + 27 such slots on pages 14/15, `mediaFills: 0`) | `placeholder_media` |
| 42 | **§5.1** — a `·Spec` / background plate with a non-zero corner. The plate holds a GROUP, not a control: a large corner (a source ladder's `lg` can be the 100px avatar/pill step) clips the group at the plate's own corners — `FAB·Spec` lost its corner cells this way. Background plates default to **square** (`radius.none`); rounding belongs to controls and cards. Rebuilt by `CF.radius('spec')`; gated here | `plate_rounded` |
| 43 | **§2.1** — a content separator drawn as a `divider`/`hairline` plate. Content blocks separate with a spacing-token gap (`space.md` 12 / `space.base` 16 bound as `rowGap`/`columnGap`), never a 1px line whose absolute x/y drifts when the host refits. Functional boundaries and state indicators are named `boundary·*` / `underline·*` and are not judged. Removed from ListItem, TableHeader/Row/State, Accordion, Menu and the spec-matrix row/header hairlines in the Boedoxol file (285 plates total); Accordion/Menu now use a 12px internal gap | `divider_separator` |
| 41 | **§12 (gate G17)** — *screen pages only*: a top-level content board at a tier baseline width with **no durable `nl:sc` / `nl:rec` stamp** — it was composed freehand, so there is no record of the source material it claims to recreate and the gate cannot be re-read in a later session. Rebuild with `SC.record(…)` then `SC.build(…)`. The **page-level half** of the same rule reports a Screens page where `storage.SC` was never seeded: **unprovable is REPORTED, not passed** — the contract rule 31 applies to G16. Judges top-level boards only, because a full-bleed band inside a screen is the same width as its host and would otherwise be counted as a second screen | `no_source_record` |
| 47 | **M8 (media_engine) + §8** — a shape carrying a `fillImage` whose box ratio is >2% off the asset's own ratio: the photograph is being **stretched**, not cropped. This build cannot ask for the crop — `fillFitMode`/`fillShapeId` are accepted and **silently dropped** (the readback keeps only `fillColor/fillOpacity/fillColorGradient/fillColorRefFile/fillColorRefId/fillImage`), so Penpot falls back to `content` = stretch. Measured on `15 · Screens · content`: **30 of 30** images distorted, worst 62% (a 1440×816 photo in a 468×700 slot). The two legal forms are geometry: `MD.place({mode:'fit'})` sizes the shape to the asset ratio, `MD.place({mode:'cover'})` (the automatic default when they disagree) builds a real **mask** — a `clip·` board at the slot box with the media inside at its own ratio, scaled to cover and centred. Repair an existing file with `MD.refit` | `media_stretched` |
| 48 | **M8/§8** — an overlay plate (`scrim*`, `overlay*`, `veil*`, `wash·*`, `ring·*`, `hitpad·*`) that is a NON-absolute child of a flex parent: an overlay must sit ON its slot, a flow child **consumes** it. Measured on the same page: all 22 `scrim·region·*` plates were in-flow at half height (468×315 inside a 468×700 media slot), so every scrim pushed the photograph it was meant to darken down out of its own region. `CF` mounts plates through `absMount` (absolute) so a factory cannot produce this — hand-authored screens do. Judged on the plate's own name, never on `isAnno` (whose ancestor-chain test would blind the rule to its whole target class, since overlays live inside `region·…`) | `overlay_in_flow` |
| 44 | **component-library §1.3** — a `ring·*` boundary at `strokeOpacity < .05` (the slot a `reserved` composition authors) with **no visible focus layer** in the same control (`wash·focus` / `row·focus` / `node·focus` … at fill alpha ≥ .05, or a painting ring / ≥2px border). Hidden borders are the form; a hidden border **alone** is an invisible focus state, which WCAG 2.4.7 and §1.1 both reject — this is the rule that makes the `reserved` role safe to use. Measured before the rule existed: the old `focus_ring_missing` matched the **name** only, so a fully transparent box would have passed it | `focus_invisible` |
| 46 | **§3.3 + §2** — a control host whose border reserves a band its content never fills: the bottom content inset is ≥ 32px AND ≥ 3× the top inset (the frame is taller than what it frames). Only the BOTTOM axis is judged — a `TableRow`, `ListItem` or `Timeline` stretches to its column, so a right-hand band is the design (a 4-side test produced 30 page-06 findings, 29 of them legitimate containers). Measured on `MiniCalendar·32cell`: the height formula used a hardcoded `rows: 6` while the drawn month needs 5, and every out-of-month slot was `continue`d, so the 6th row was empty and the grid's leading/trailing cells were never painted (inset bottom 49 vs top 7). It was NOT a reservation for adjacent-month days — a reservation nobody fills is dead space. Repair: derive the frame from the content (`need = ceil((firstWeekday + days) / 7)`) and paint adjacent-month cells muted | `frame_dead_band` |
| 45 | **§2.3** — a horizontal connector (`tail·*` / `rail·*` / `connector`) whose centre is not the centre of the nodes it joins. One row has ONE axis: the node, its connector and its copy are all centred on `max(node, line-height)`. A node anchored to the band's TOP slips out of its own line whenever it is smaller than the copy beside it — `Steps·Dot·LG` (a 12px dot under a 20px label) measured node centres 6 vs connector and label centres 10, which is what a reviewer calls "these are not aligned". `CF.steps` centres `nyNode`; a hand-built row must place the node ON the line | `row_axis_off` |
| 49 | **§2.1** — repeated row labels inside one control host must share ONE pitch: the tightest gap must REPEAT (that is the established rhythm) and a wider gap with nothing drawn in it is a hole, not grouping. Measured on `Menu·IconStart`: label gaps **12 / 24 / 12** around DUPLICATE — `CF.menu` gave a `'-'` divider a `space.md` of empty space, and rule 43 had already removed the line that used to justify it, so what a reviewer sees is "the padding is uneven". A semantic boundary must be SEEN (a `group` label row, or a functional `boundary·*` line, which rule 43 exempts) or cost NOTHING, which is what `CF.menu` does now. Two disciplines keep the gate honest: copy is read **one level deep** (a hovered row's label lives inside its `row·` group, so direct-children measurement reported a 4-row menu as 3), and a host with **no repeating pitch is not judged** — an Accordion's 26/39/40 are header→body, body→header and header→header, three different relationships, not three rows with a hole (the first version of this rule indicted all 5 Accordion hosts on page 06). Repair: `TK.gapStart`/`TK.gapSweep` (dry first; it moves whole row units, takes the same amount off the host and re-centres the host on its `CF.matrix` row midline via `TK.centreOnRow`) | `list_gap_split` |
| 50 | **§5.4 (gate G18)** — a shape that paints a shadow while the token set declares `shadow.*` tokens but carries **no `tokens.shadow` binding**: the stack was typed instead of taken from the elevation record. Measured 2026-10-23: 49 shadowed shapes, **0** bound; every one was a single hand-typed drop. Repair: `EL.sweepPage({page, apply:true})` → `EL.bindStamped` | `shadow_unbound` |
| 51 | **§5.4 (gate G18)** — a shape stamped `nl:el=<recipe>` whose `shadows` has **fewer layers than that recipe** (a 4-layer card collapsed to one, or a rebuild that dropped the insets). The stamp is the durable contract; this rule compares it to the render. Repair: `EL.apply(shape, recipe)` | `elevation_flat` |
| 52 | **§5.4 (gate G18)** — a stamped recipe declares **INNER** layers (the dark bottom lip / white top highlight that make a card read as a physical object) but the shape paints drop shadows only. A drop alone is the flat "everything is a card" look this rule exists to stop | `edge_missing` |
| 53 | **§5.4 (gate G18)** — a stamped recipe declares a **radial sheen** but the host carries no `sheen·*` plate: the top-light that sells the material is absent. Component **copies** are exempt (a child cannot be authored on a copy; the master carries it). Repair: `EL.sheenFor(host, recipe)` | `sheen_missing` |
| 54 | **§5.4 + §5.2 (gate G18)** — a component state board named `·Hover`/`·Pressed` whose family declares a hover/press recipe but paints **0 shadows**: hover was modelled as an 8% fill tint, not as the source's elevation lift. Measured 2026-10-23: every Button/Card hover cell in the file read 0 shadows while the source adds 4–6 drop layers. Repair: `EL.sweepPage` | `hover_flat` |
| 55 | **§5.4 (gate G18)** — a screen record declares `surface`/`elevation` for a section but the board has no **`surface·<region>`** plate: the section is bare, so it has nothing to cast a shadow. Reads the durable `nl:rec` digest, not session memory. Measured: `15 · Screens · content` had 143 shapes and **0** surfaces/shadows. Repair: `SC.surface` / `EL.surfacePass` | `surface_missing` |
| 56 | **§3.1 + component-library §3.1 + `source-adaptation.md`** — a recreation's spec pages are the SOURCE's inventory, not the factory's family list, and the proof is data, not prose. **Page 03 (actions)**: a `·Spec` board whose family is not in the profile, a profile family with no spec, or a host whose corner role is not one the source pins; `variants` in the profile can pin a family's variant count and icon-slot expectation so the gate never demands an invented variant. **Pages 04–08** (forms · selection · data · navigation): the page's profile GROUP must exist, every host of a profiled family must carry the `nl:prof` birth stamp, and the stamp's measured geometry must equal that profile's declared `expect` block — one table drives all four pages, no family names are hardcoded per page. **Page 09 (feedback)**: tooltip/modal compare only the keys the profile declares (radius, padding, shadow, arrow, border, body padding, font size) and alert/toast compare the declared derived `material`. The profile is `CF.setReference(...)` merged into `storage.REF` and stamped `nl:ref` on **every** PageRoot, so it survives a storage wipe; a missing profile is REPORTED (`no … source profile on page NN`), never passed | `reference_drift` |
| 57 | **§2.3** — a control's label is not on the control's own vertical axis (Button/Tab/Chip/Checkbox/Radio/Switch): its text-box centre is >2px off the host centre while still within one line of it (a deliberately top/bottom-aligned caption is not judged). Measured 2026-10-23 on all 21 Button masters: `place()` read a unitless `lineHeight` (1.25) as 1.25 **px**, centred the label on a 1.25px band and landed every one 9px low while host, padding and typography all read correct. The fix is at the source (resolve ratio × fontSize); the gate lives in the text pass, not the board pass, because text has its own pass | `label_off_axis` |
| 58 | **§10 / gate G10s** — a control-shaped board on a spec page (`03`–`09`) that is **not a component** (neither a master nor an instance). Every spec element must be a registered master, including the Hover/Focus/Pressed/Disabled/Selected cells; the default cells were registered, the state cells were raw, so screens could not instance them. Nested anatomy inside a registered control and a composite already assembled from component instances (a Field holding an Input instance) are exempt. Repair: `CF.autoRegister({states:true})` plus a unique-name registration pass for duplicates, until `spec_unregistered` is 0 | `spec_unregistered` |
| 59 | **§1.5 + native-layout §9** — on pages `01`–`09` a content board's elements are arranged **only** as flow or grid children: `rowGap`/`columnGap`, vertical/horizontal padding (values judged by `space_off_scale`), or a grid cell. An absolutely-positioned child that is not a name-declared overlay (`scrim`/`overlay`/`veil`/`wash·`/`ring·`/`hitpad·`/`connector`/`tail·`/`rail·`/`boundary·`/`underline·`) is **free layout**. A control host's own anatomy is exempt, but the host itself must still be a flow/grid child; page chrome and page-level shelf placement are outside the rule. Measured platform fact (api-pitfalls §coordinates): a board's absolute children hold world coordinates and do not follow the shell, so free layout cannot re-flow after a token change and cannot be nudged — only rebuilt. Repair: rebuild through the producer (`CF.matrix` flow/grid path, `FN` rows), never a nudge | `free_layout` |
| 60 | **§5 + gate G18** — a shadowed shape whose painted shadow box is cut by a **clipping ancestor** (a `slot·`, `grid·`, `·Spec`, `row·`, `cell·` or any layout board that still carries Penpot's default `clipContent=true`). Penpot boards default to clipping, and using a grid/gap layout made every cell crop its child's drop/inset stack at the cell edge. Layout containers are authored with `clipContent=false` — only `clip·` media masks crop. Repair: `storage.unclip()` on the page (keeps `clip·`), or rebuild the container with the fixed `NL.frame` / `mkAbsBoard` default | `shadow_clipped` |
| 61 | **§12 + library pairing** — when a host component-library manifest is active (`storage.LM`, durable `nl:lib` on PageRoots), pages `03`–`09` must contain **exactly** the manifest design families assigned to that page (a missing family or an extra `·Spec` fails), and page `13` audits the live library masters against the manifest: every visual component must have a master (namespace or part), and every master must map to a manifest component/part. Headless libraries pair on anatomy + states, not invented styled variants. Repair by building the missing family or removing the extra master; never add an invented component | `library_drift` |

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
