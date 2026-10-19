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
  one of those three tokens). An 11px box drawn by hand with no role in the name is a finding, not a style choice. Never 10px in CJK.
- Tracking: negative (−0.01…−0.03em) only above 32px; CJK needs no negative tracking (glyphs are square, already tight).
  Penpot `letterSpacing` takes a **px number string** only (`'−0.5'`), not `em` (api-pitfalls §5).
- Emphasis is a **three-signal system**: weight, size, color. Using only color = weak hierarchy; using all three at once on every element = noise.

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
- Radius nesting rule (HARD): `inner radius = outer radius − padding`, clamped ≥0. r16 card + r12 inner chip is fine; r8 inner in r8 outer is wrong.
- Radius ramp (DEFAULT, cross-system): `none 0 / xs 2 / sm 4 / md 6–8 / lg 12 / xl 16 / full 9999`.
  One system uses **at most 3 radii** for the same component family; controls share one, cards a larger one, pills are `full` (only chips/buttons/tabs/pills).

### 5.2 State layers (M3 model — the only formal one; adopted as default)

Hover **8%**, Focus **12%**, Pressed **12%**, Dragged **16%** overlay of the `on-*` content color over the container.

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
| Hover / Pressed / Focus overlay alphas (§5.2) | `CF.fills(bg, state, { onDark })` appends an **overlay fill** at `CF.STATE[state]` (8/12/12%) — the ink color over the surface on light, black on dark surfaces (`onDark`) | the base fill stays opaque, so `contrast` measures the resting pair, and `off_grid` ignores the overlay |
| Selected ≠ solid brand | `CF.fills(bg, 'selected', { tint: 1 })` paints the hue at **12% wash**, never solid — solid brand under its own label is 2.9:1 | a selected row/option/card whose fill is opaque brand reads as a `contrast` failure |
| Focus ring | `ctx.ring(box)` mounts a **sibling plate named `ring·focus`** (2px stroke, 2px offset) | `focus_ring_missing` accepts a `ring·` layer **or** a ≥2px stroke; a darkened 1px border never counts |
| Touch floor | `ctx.hitPad(box, CF.minHit())` mounts an **invisible plate named `hitpad·<w>×<h>`** centered on the control | `touch_target` counts the pad, so a 24px icon button on mobile is legal only with a ≥44 pad present |
| Disabled = the whole control recedes | `ctx.place()` clamps **every text in the host subtree** (and in any host nested inside a `·Disabled` host) to `min(alpha, CF.STATE.disabledContent)` = `.38`; explicit alphas move downward only | `disabled_wrong` measures the label alpha and requires `.25–.40`; a dimmed plate with a full-opacity label fails |
| State axes are nameable | `CF.name({ state })` writes `·Hover` / `·Focus` / `·Disabled` / `·Selected` into the host name | `state_coverage` counts the columns by name — an unnamed host draws but is not counted |

- `hitpad·` and `ring·` are also the **escape convention for hand-built boards**: if you must place a control outside `CF`,
  name its invisible hit plate `hitpad·44×44` and its focus layer `ring·focus`, and the rules will see them.
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
| 1 | every coordinate and every size on the 4px grid (hairlines and text boxes exempt) | `off_grid` |
| 2 | every measured gap ∈ `LY.SPACE` (0/2/4/8/12/16/20/24/32/48/64/96/128) | `off_scale_gap` |
| 3 | every font size ∈ the declared ramp, ≥12px (11px only for a **named** role: `axis` / `overline` / `kbd`) | `off_ramp_size` |
| 4 | text with >2 lines and width >760 → prose measure exceeded | `measure_overflow` |
| 5 | two-column split ratio outside 2.2–3.2 (and not a documented exception) | `split_ratio_50_50` |
| 6 | control wider than its cap (input >420, select >240) in a container ≥720 wide | `control_too_wide` |
| 7 | interactive target below tier minimum (mobile/pad 44, web 32) | `touch_target` |
| 8 | more than one filled-primary control inside one region/board | `multiple_primary` |
| 9 | row/board height not in the quantized set while the board is a list/table recipe | `row_height` |
| 10 | radius of an inner box > (outer radius − inset) | `radius_nesting` |
| 11 | text/fill pair below 4.5:1 (3:1 for ≥24px, icons carrying meaning) | `contrast` |
| 12 | screen board whose height equals the tier viewport while its content bands overflow / or a tall empty region | `viewport_locked` |
| 13 | component spec board missing a required state column | `state_coverage` |
| 14 | section rhythm variance > one scale step between sibling bands | `rhythm_inconsistent` |
| 15 | family present with < 3 non-state, non-size variant tokens (no `IconStart`/affix/block variant drawn) | `variant_sparse` |
| 16 | control family with no `ring·` layer and no ≥2px focus border on its Focus hosts | `focus_ring_missing` |
| 17 | disabled content alpha outside `.25–.40` (`CF.STATE.disabledContent`) | `disabled_wrong` |
| 18 | shape/component name containing `/` or a newline — the variant-order grammar is `Family·Type·Size·State·Slot·Tone` | `name_invalid` |

`storage.designGate()` verdict is computed from these 18 (`out.rules`); the 12 positioning signatures
(`out_of_bounds`, `board_overlap`, …, `spec`) belong to `audit_layout.js` and are reported as delegated, never double-counted.

Rules 3/13/15–18 depend on **names, not pixels**: `CF` writes the role (`ctx.text({ role: 'axis' })`), the slot
(`slotName()` → `IconStart`/`Clear`/`Addon`/…) and the state into the shape name, so the auditor can decide coverage
from the registry. A hand-built board that draws the same pixels without the name token reads as absent.
Rules 13 and the variant minimum set are specified in `references/component-library.md`; rules 4/5/6/12 in `references/layout-library.md`.
