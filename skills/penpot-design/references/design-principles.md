# Design principles

> These are the choices the token set and component definitions encode. They are guidance, not a second gate system:
> `CK.audit` checks the component contract; this file explains what good component decisions look like.

## 1. Spacing and whitespace

- **One base unit** (4/8 px; `LY.SPACE` is the executable scale). Every gap/padding is a member of that scale.
- **Whitespace is the first separation device**: whitespace → surface/elevation polarity → hairline/divider →
  alignment. Do not buy separation with a stroke when space or a surface change would do.
- **Gaps are meaningful**: inline (4–8), control-internal (8–12), block (16–24), section (32–48). A gap that changes
  without a visible reason reads as a broken rhythm.
- **Text has leading and paragraph air.** A paragraph's line-height and the space after it come from the declared
  typography token, not from a local offset.
- **A repeated run is one group**: table rows, menu items and list rows share one pitch. A wider gap must carry
  something visible.

## 2. Typography

- Use the declared ramp (`type.*` tokens) only. A size/weight/leading not in the ramp is off-system.
- Roles: display/title/heading/body/label/caption. Body copy is 14–16 px with 1.4–1.6 leading; captions are 12 px
  minimum; labels are 500–600 weight.
- Keep a measure of 45–75 characters for body copy; a control label is one line unless the component defines wrapping.
- Copy on a colored surface uses the **ink step** of the tone, not the hue step. White on a 6-level hue usually fails
  contrast.

## 3. Color

Each tone is a **triple**: wash (`*Soft`), hue (graphic), ink (`*Ink`, carries copy). A component binds the role, not
the hex.

- `color.brand` → graphics/rings/solid brand surfaces; `color.brand-ink` → copy on a wash and solid surfaces that carry
  white copy; `color.brand-soft` → wash.
- Neutral roles: surface, surfaceAlt, surfaceRaised, text-bright, text-muted, border, borderStrong, inverse,
  on-inverse.
- WCAG AA is the floor: 4.5:1 for body copy, 3:1 for large text, icons and focus indicators. Audit both light and dark
  schemes separately.
- Dark is **re-derived**, not inverted: washes become low-alpha tints and ink steps lift; do not reuse the light ink on
  a dark surface.

## 4. States

Every interactive family resolves:

```
default → hover → focus-visible → pressed → selected/checked → disabled → loading
```

- **Hover/pressed** are state layers over the same base fill (8 % / 12 %), plus the family's elevation lift when the
  project declares one. A hover that changes the hue is a different control.
- **Focus** is its own 2 px layer at the focus unit (2 px offset or flush, per the family), at ≥3:1 against the
  adjacent surface. A composition whose rows have no plate uses a 12 % focus wash; a ghost boundary alone is invisible.
- **Selected** is persistent; do not stack a hover tint and a selected tint at the same alpha.
- **Disabled** is the whole control receding: container at 12 %, content at 38 %; do not invent a grey hex per file.
- **Loading** keeps width constant and replaces the leading icon with a spinner; label stays readable.
- **Error/warning/success** are validation states for fields, not new component families.

## 5. Shape

- A corner comes from the `borderRadius` token set. The ladder is project-declared; a number is snapped to the nearest
  step.
- **One control, one corner**: the field, its add-ons, steppers, disabled overlay and focus ring share the field's
  corner. A pill button and a rounded field are different roles.
- A circle gets a circular ring. A ring takes its host's corner and is mounted inside the control it outlines.
- A card/panel uses the card step; a badge/checkbox box uses the small step; a pill uses the full step.

## 6. Elevation

- A raised object carries a **drop stack + inner pair** (dark bottom lip + light top highlight) when the project
  declares a physical recipe. A single flat shadow does not make an object.
- **Hover lifts** (more drop layers, lip preserved), not just tints.
- Shadows are tokens (`shadow.*`), multi-layer, applied through `EL`; a typed shadow array at a call site is not
  token-driven.
- A surface must exist before it can cast a shadow: mount the plate, then the copy.

## 7. Controls and touch

- Sizes come from `CF.ladder`: xs 24 · sm 28 · md 32 · lg 40 · xl 48 · 2xl 56 (web). The type, padding and icon sizes
  move with the size; the corner role does not.
- Touch floors: web 32, pad/mobile 44. A smaller visual control gets an invisible hit pad, not a fatter box.
- Labels and trailing icons have separate slots; a label never runs under its icon. Reserve icon width + gap.
- Icon-only buttons are square tiles or circles; the glyph is optically centred.

## 8. Icons and imagery

- Icons are a single family/weight per system, 16/20/24 px at 1×; use `CF.glyph` inside controls, `IC` for standalone
  icons.
- Images preserve their aspect ratio; a photo is never stretched to fill a slot. Crop with a mask when the slot ratio
  differs.
- A placeholder is not media: a gray plate with an image icon is a slot, not the user's photograph.

## 9. Alignment and composition

- One axis per row: copy, nodes and connectors share a centre/edge. A label sits on its control's axis.
- Prefer flow/grid (`NL`) over absolute coordinates. Absolute children are for declared overlays and control-host
  interiors.
- A screen is composed of regions from `LY.recipe`; a region that contains another region is structure, not a plate.
- A component with a master is placed, never redrawn. A screen is an assembly, not a screenshot.
