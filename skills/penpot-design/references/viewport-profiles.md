# Viewport Profiles

This skill abstracts "interface width" into three standard viewport tiers (profiles). Any code-to-design or
design-to-code task **must confirm the target tier before starting**: the skill uses `ask_followup_question`
(multiSelect, multiple allowed). Building must not begin without confirmation.

## 1. Three-tier definitions — the twin table of `LY.TIERS`

The numbers below are `storage.LY.TIERS` in `scripts/layout_engine.js`. **That object is the single source**: change it
there, change it here, never carry a tier number in a task prompt.

| Tier key | Alias | Baseline width | Viewport height (`LY.viewportHeight`) | Grid cols | Content margin | Gutter | Touch floor |
|---|---|---|---|---|---|---|---|
| `web` | desktop / widescreen | **1440** (spec canvas 1920) | 900 | 12 | 32 | 24 | 32 (mouse) |
| `pad` | tablet | **834** (iPad Air portrait) | 1112 | 8 (4 when narrow) | 24 | 16 | 44 |
| `mobile` | phone | **375** (390 also used) | 812 | 4 (or single-column stack) | 16 | 12 | 44 |

Device chrome each tier carries (`TIERS[tier].chrome`, consumed by `LY.frame`):

| | statusBar | navBar | tabbar | safeBottom |
|---|---|---|---|---|
| `web` | 0 | 64 (app bar) | 0 | 0 |
| `pad` | 28 | 56 | 0 | 24 |
| `mobile` | 44 | 44 (large title 72–96) | 49 | 34 |

- **The baseline width is the width of a *board*, never of a page.** PageRoot stays 1920 on every page; a screen mock is
  a 1440/834/375-wide board placed inside it (`penpot-structure.md §1, §5`).
- Height is a **fold marker, not a size limit**: `LY.fold(board, tier)` draws the 2px accent viewport outline, and the board
  itself is as tall as its bands (`LY.flow` → `totalH`). Screens are long documents; the fold is what the reviewer checks.
- Tiers **share one set of tokens and one component library**; they differ only in grid, margins, touch floor and board width.

## 2. How tiers affect artifacts

### Tier-independent (built once, shared)
`00 · Cover`, `01 · Foundations`, `02 · Color in use`, `03–09` component specs, `10 · App shell & chrome`,
`12 · Screen recipes`, `13 · Component index`, `17 · Reference imitation`. Spec boards show all states and sizes as
usual; for a touch tier add the size step that meets 44 (e.g. `Button·Md` at 44 high) rather than inventing a
phone-only control.

### Tier-dependent
- **`11 · Grid & breakpoints`** — one diagram board **per selected tier**: columns/gutter/margin from `LY.TIERS[tier]`,
  the container ladder, the collapse order (`layout-library §4.2`), the touch-floor board (32 web vs 44 touch with the
  `hitpad·` escape), the fold anatomy.
- **`14 · Screens · app` and `15 · Screens · content`** — one board **per app/content recipe × selected tier**, at that
  tier's baseline width. Web 1440 boards sit one per row; pad twins sit beside them labelled `@834`.
- **`16 · Screens · mobile`** — the mobile tier only: `mobileFeed`, `mobileListDetail`, plus the mobile twins of
  auth/otp/checkout where `LY` declares support. 4 × 375 boards per row (`LY.pack({gapX:24})`).

### The tier gate is executable, not advisory
- `LY.recipe(key, { tier })` **refuses** a recipe with no definition for that tier and returns `{ err, use }` pointing at
  the tier-appropriate recipe. A three-pane app screen asked at 375 is not "the same layout, narrower": it is replaced
  by `mobileListDetail`, never squeezed. Do not route around this by typing coordinates.
- `CF.tier` must be set to the board's tier **before** building it (`CF.tier = 'mobile'`), because `CF.autoHit` pads
  compact controls to 32 on web and to 44 on touch. Leaving the tier at its default is how a phone screen ships 32px
  targets.
- Audit each screen board with its own scope: `storage.designGate({ tier: 'mobile' })` while the mobile board is active.
  `touch_target` uses `CF.minHit()`, which reads `CF.tier` — one switch, both auditors.

## 3. DESIGN.md and design-to-code

- The Layout section records `targetProfiles: [web|pad|mobile]`, and the tokens adjust: spacing scale (mobile 4/8/12,
  web 8/16/24/32), the **whitespace ladder** `LY.BREATH[tier]` — same levels per tier, only the `page` level drops 96 → 64 on
  mobile, and `NL.frame({breath})` resolves it from the board's tier (layout-library §1.1) — touch floor (≥44 → token `touchMin`),
  grid description written **per tier**, never one width assumed.
- Code implements the responsiveness per selected tier (CSS media queries / Qt layout adaptation); at acceptance the
  viewport width = that tier's baseline, screenshotted and compared tier by tier against the `14–16` boards.
- One tier → fix that width. Multiple tiers → produce and compare per tier; a tier with no board is a missing deliverable,
  not a "responsive detail".

## 4. Runtime prompt (skill behavior)

At the task start (after obtaining entry materials, before writing DESIGN.md) call `ask_followup_question`:

- `header`: `"Target width"`
- `question`: `"Which width-class UI do you want to generate / recreate this time? (multiple allowed)"`
- `options` (multiSelect: true): `Web 1440 (desktop)` · `Pad 834 (tablet)` · `Mobile 375 (phone)`
- Write the answer into DESIGN.md `targetProfiles` and use it as a hard constraint for every subsequent build and for
  the per-board `{ tier }` audit scope.
- If the user already said it ("make a phone version"), adopt it without re-asking — but still persist `targetProfiles`.
