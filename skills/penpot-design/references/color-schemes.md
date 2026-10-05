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

| Location | Change |
|---|---|
| **token structure** | `sets: [ '<system> · Core'(all), '<system> · Dark'(only the same-named tokens to override) ]` + `Scheme` group with two themes (Light = {Core}, Dark = {Core, Dark}). **Core must come first** (`sets` order is priority, later wins). Use `TK.ensureTheme` / `TK.activateTheme`. |
| **00 Cover** | Note the color mode and the two schemes' names |
| **01 Design basics F1** | The palette board needs **dual polarity** side by side (light column, dark column + role correspondence) |
| **02 Color system** | C1 semantic colors / C2 surface pairs / C3 text hierarchy / **C5 contrast audit all doubled** (side by side or stacked) |
| **03–12 component spec boards** | every interactive component gives at least one dark-polarity state set; display widgets at least give polarity notes |
| **12 Layout modes** | unchanged (layout is orthogonal to color) |
| **14 Demo** | each tier × **each scheme** produces six boards → board count **doubles** (2 tiers × 2 schemes = 24 boards). Can be side by side but must be clearly labeled. |
| **DESIGN.md `## Elevation & Depth`** | needs to explain the relationship between "sectional polarity" and "theme polarity": how `ink` / `canvas` roles swap or hold after flipping |

## 5. Acceptance (mandatory)

- **WCAG contrast must be audited separately for both schemes**. dark is **not** the inverse of light:
  simple inversion usually breaks mid-tone grayscale (`on-surface-muted` and similar are most likely to fail).
- Page-02's C5 contrast-audit table needs a **light table + dark table**, two of them.
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

- Adding a second scheme afterward costs far more than deciding at the start: **the palette must be re-derived, page-02's contrast audit redone,
  component spec boards get polarity added, Demo board count doubles**.
- Conversely, deciding "light only" at the start saves the whole theme structure and the second set of boards — exactly
  pix's current basis of 1 set / 0 themes.
