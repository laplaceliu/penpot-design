# Viewport Profiles

This skill abstracts "interface width" into three standard viewport tiers (profiles). Any code-to-design or
design-to-code task **must confirm the target tier before starting**: the skill uses `ask_followup_question`
to confirm with the user (multiSelect, multiple allowed). Building must not begin without confirmation.

## 1. Three-tier definitions

| Tier key | Alias | Design baseline width (portrait) | Common device widths | Grid columns | Content margin | Min touch target |
|---|---|---|---|---|---|---|
| `web`    | Widescreen / desktop | 1440 (design canvas 1920) | 1280 / 1440 / 1920 | 12 | 24–32 | ≥36px (mouse pointer) |
| `pad`    | Tablet | 834 (iPad Air portrait)   | 768 / 834 / 1024 / 1194 | 8 (drop to 4 when narrow) | 16–24 | ≥44px |
| `mobile` | Phone | 375 (iPhone baseline)     | 360 / 390 / 412 / 414 | 4 (or single-column stack) | 12–16 | ≥44px |

- Height is only a reference for the Demo board's initial height; component pages / spec boards are not height-limited.
- One tier can produce both portrait and landscape boards (web/pad usually landscape, mobile usually portrait).
- Tiers **share the same set of design tokens and component library**; differences are only in layout grid, margins, touch-target floor, and Demo screen width.

## 2. How tiers affect artifacts

### Design-system core (shared, tier-independent)
`00` cover, `01–02` basics, `03–13` component specs and index, `15` references: these are tokens and the component library,
**built once, shared across all selected tiers**. PageRoot / page header / page footer are fixed at 1920 (this is the "spec sheet
canvas", not a screen mockup, so the width is constant). Component spec boards show all states / sizes as usual, and should add a suitable Size for touch tiers (e.g. `Button·S` at 44px height under pad/mobile to meet touch targets).

### Tier-related pages
- **`12 · Layout modes`**: each selected tier needs its own layout-grid board (web 12 columns / pad 8 columns /
  mobile 4 columns or single-column stack) + that tier's responsive-breakpoint notes + that tier's Empty/404 whole-page template.
- **`14 · Demo`**: for each selected tier, produce that tier's baseline-width Demo six boards
  (Dashboard / Landing / Login / List / Detail / Settings), board width = tier baseline width.
  Multiple tiers can sit side by side on page-14's 1920 canvas (e.g. 5 mobile-375 boards in a row).
  The original "optional Mobile 375 app board" is upgraded to: each selected tier's **mandatory** boards.

### DESIGN.md
The Layout section must record `targetProfiles: [web|pad|mobile]`, and adjust accordingly:
- Spacing scale (mobile uses the tighter 4 / 8 / 12; web can use 8 / 16 / 24 / 32).
- Touch-target floor (pad / mobile ≥44px → use token `touchMin`).
- Grid description written per tier; never assume only one width's layout.

### Design → Code
- Code implements responsiveness per the selected tier (CSS media breakpoints / Qt layout adaptation); at acceptance the viewport / window
  width = that tier's baseline width, screenshotted and compared tier by tier.
- For a single tier, just fix that width; for multiple tiers, produce and compare per tier.

## 3. Runtime prompt (skill behavior)

At the task start (after obtaining entry materials, before writing DESIGN.md) call `ask_followup_question`:

- `header`: `"Target width"`
- `question`: `"Which width-class UI do you want to generate / recreate this time? (multiple allowed)"`
- `options` (multiSelect: true):
  - `Web widescreen (desktop 1920)`
  - `Tablet Pad (834 etc.)`
  - `Phone Mobile (375 etc.)`
- After getting the result, write it into DESIGN.md `targetProfiles`, and use it as a hard constraint for all subsequent builds and acceptance.
- If the user has explicitly specified (e.g. "make a phone version"), adopt it directly without re-asking, but still persist it to
  `targetProfiles`.
