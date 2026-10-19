# Color Schemes — runtime prompt + artifact mapping

The second startup-tier **on par with** the "viewport tier" `references/viewport-profiles.md`: also asked once before writing DESIGN.md,
also written into DESIGN.md as a hard constraint for all subsequent builds and acceptance.

## 0. First distinguish: "sectional surface polarity" ≠ "switchable color scheme"

**This is the easiest place to answer wrong; you must describe the two options clearly when asking.**

| | **Sectional surface polarity** (most systems have it naturally) | **Switchable color scheme / theme** (what this tier asks about) |
|---|---|---|
| Appearance | **Within the same page** light/dark regions alternate (e.g. hero uses ink, body uses canvas) | **Whole-page flip**: background, text, stroke all change together |
| Example | pix system's hero/services/footer are dark, the rest light | User clicks "dark mode", the whole interface darkens |
| Optional? | Not an option, part of the visual language | A user-switchable state |
| Needs theme? | **No** | **Yes** (see `design-tokens.md` §5) |

> Only "sectional polarity" → **no theme**, one token set suffices (exactly pix's current state).
> "Switchable color scheme" → then build a second set + theme group.

## 1. When to ask

**Before writing DESIGN.md**, put it in the **same batch of `ask_followup_question`** as the viewport tier (one round-trip, not two).
If the user has already stated it (e.g. "must have dark mode"), skip the question but still persist it into DESIGN.md.

## 2. What to ask

- **header**: `Color mode`
- **question**: Do you need **switchable** light/dark color schemes (whole-page flip), rather than just light/dark regions alternating within the same page?
- **multiSelect**: no (single-select default)
- **options**:
  - `Light only (default)` — single color scheme. Build tokens as **1 set** (`<system> · Core`), **no theme**. Leanest deliverable.
  - `Light + dark two schemes` — deliver switchable light/dark. Build `· Core` + `· Dark` tokens, plus a Scheme group with two themes.
  - `Follow system (auto light/dark)` — deliverable **identical** to the previous item (both schemes required); the only difference is the interaction convention,
    just write it into DESIGN.md's Colors / Do's and Don'ts.

## 3. Where the answer lands

In the **`## Colors` section body** of DESIGN.md, the same mechanism as `targetProfiles` written into the `## Layout` section body:

```markdown
## Colors

**Color schemes: `light` and `dark`.** Both must be delivered; `dark` is a first-class scheme,
not an inversion of `light`.
```

- **Do not** stuff it into frontmatter as a custom key. Tested: a custom top-level key `colorSchemes:` **will not** trigger a lint warning
  (0 error / 0 warning), but will be **ignored** by both the linter and `designmd export` — i.e. "passes but ineffective",
  so the body declaration is authoritative (`targetProfiles` same).
- When "two schemes" is chosen, the Colors section **must give both schemes' color values**, and explicitly write the **semantic-role mapping**
  (what the same `on-surface` is under light, what it is under dark); not just a pile of bare color values.

## 4. Artifact mapping (answer = two schemes)

Bounded on purpose: **a second scheme costs a page, not the file.** The old "double every board" contract made dark
mode unaffordable, so teams skipped it; the mapping below keeps dark first-class where color is the subject (00–02) and
one-board-deep where color is a detail (03–16).

| Location | Change |
|---|---|
| **token structure** | `sets: [ '<system> · Core'(all), '<system> · Dark'(only the same-named tokens to override) ]` + `Scheme` group with two themes (Light = {Core}, Dark = {Core, Dark}). **Core must come first** (`sets` order is priority, later wins). Use `TK.ensureTheme` / `TK.activateTheme`. |
| **`00 · Cover`** | Note the color mode and the two schemes' names |
| **`01 · Foundations`** | The `Palette` board needs **dual polarity** side by side (light column, dark column + role correspondence) |
| **`02 · Color in use`** | `Semantic roles` draws the wash / hue / **ink** triple for both polarities; `Contrast matrix` is **doubled** (a light table and a dark table, side by side or stacked); `Light vs dark` board; `Data colors` re-checked for the dark ramp |
| **`03–09` spec boards** | **not duplicated**: one polarity (the one the system starts in) plus the dark state rows `CF` already draws (`onDark` variants where the family declares one) |
| **`10 · App shell & chrome`** | Add the dark-panel variants the families own (`sideNav` dark panel, inverted `footer`); they are rows of the existing spec boards, not new boards |
| **`11 · Grid & breakpoints`, `12 · Screen recipes`** | unchanged — layout is orthogonal to color |
| **`13 · Component index`** | one extra column: which families carry a dark variant |
| **`14 · Screens · app`, `15 · Screens · content`, `16 · Screens · mobile`** | **one dark twin per page** (the recipe that best shows the scheme), **not** one per board. 3 boards added, not 24. Label the scheme on the board name. |
| **DESIGN.md `## Elevation & Depth`** | explain how "sectional polarity" and "theme polarity" relate: how the `ink` / `canvas` roles swap or hold after flipping |

### 4.1 Dark is derived per tone step, not inverted

The tone ramp is `[wash · hue · ink]` (design-guide §4) and only the `*Ink` step carries copy. In light, copy sits as
`primaryInk` on a `primarySoft` wash (6.37–7.15:1); in dark the wash becomes a low-alpha tint over the dark surface, so the
**ink step must move the other way** (a lifted hue step, e.g. `#93C5FD`-family text on `#0F172A`) or the pair lands
under 4.5:1. That is why `· Dark` overrides the role tokens one by one and why the contrast matrix is the board that
proves it — `audit_design.js` checks the pair each text actually sits on, in the scheme it was drawn in.

## 5. Acceptance (mandatory)

- **WCAG contrast must be audited separately for both schemes**. dark is **not** the inverse of light:
  simple inversion usually breaks mid-tone grayscale (the `muted` / `on-surface-muted` role is the most likely to fail).
- `02 · Color in use → Contrast matrix` needs a **light table and a dark table**, two of them.
- `TK.audit()` under theme mode switches to the `mode: 'theme-driven'` criterion
  (an inactive set is normal; re-judge "no multiple same-group activations + all tokens in the active set resolvable").
- Export acceptance: run both schemes once each, **combinations never exported must not be described as "verified"**.

## 6. Design → Code side

- Both schemes must go through the **same set of semantic tokens** (CSS custom properties / theme object / QSS palette),
  never hard-code the second scheme's values inside components.
- The switch mechanism and persistence (follow system `prefers-color-scheme` / manual switch / remember or not) are written into DESIGN.md's
  Do's and Don'ts; code implements accordingly.
- Acceptance: each tier × each scheme screenshotted and compared separately (acceptance combination count = tiers × schemes).

## 7. Why it must be asked at startup

- Adding a second scheme afterward costs far more than deciding at the start: **the palette must be re-derived, the
  `02 · Color in use` contrast audit redoubled, the shell families gain dark variants, and every dark-scheme demo board
  has to be rebuilt from the token set that did not exist when it was drawn**.
- Conversely, deciding "light only" at the start saves the whole theme structure and the dark boards — exactly
  pix's current basis of 1 set / 0 themes.
