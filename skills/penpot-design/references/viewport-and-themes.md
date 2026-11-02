# Viewport tiers and color themes

## 1. Viewport tiers

Ask at startup, together with color mode. Write the answer into DESIGN.md `targetProfiles`.

| Tier | Width | Grid | Margin | Gutter | Touch | Viewport |
|---|---|---|---|---|---|---|
| `web` | 1440 | 12 | 32 | 24 | 32 | 900 |
| `pad` | 834 | 8 | 24 | 16 | 44 | 1112 |
| `mobile` | 375 | 4 | 16 | 12 | 44 | 812 |

- A tier is a **constraint**, not a scale factor. `LY.recipe(key,{tier})` refuses a recipe without a definition at that
  tier and returns `{err, use}`; follow `use`.
- Set `CF.tier` before building a screen; the touch floor and hit pads follow it.
- A screen board is built at the tier baseline width. `1920` is the spec-sheet canvas, not a screen.
- Multiple tiers may be selected; build one board per accepted recipe × tier. The component library itself is
  tier-independent (built once).

## 2. Color mode

Ask in the **same batch** as the tier:

- **light only** — one set, no theme.
- **switchable light + dark** — `<system> · Core` (all base tokens) + `<system> · Dark` (only overrides, same names)
  + a `Scheme` theme group with `Light` and `Dark`. Core comes first: later sets win.

Clarify the difference in the question: “sectional light/dark regions within one page” is **not** a theme. A theme
flips the whole file by activating a token set.

### 2.1 Artifact mapping

| Artifact | Light only | Switchable |
|---|---|---|
| Token sets | one set | Core + Dark (Dark overrides colors and any changed type/material tokens) |
| Theme group | none | `Scheme`: Light (Core), Dark (Core + Dark) |
| Components | built once | built once; all binds are by role/token name |
| Screens | one board per recipe × tier | one board per recipe × tier; theme is a file-level switch, not a duplicate screen |
| Acceptance | export once | export both themes and compare separately |

### 2.2 Dark is re-derived

- Do not invert hexes. Keep the tone semantics: wash becomes a low-alpha tint of the hue; the ink step must **lift**
  so copy on a wash stays ≥4.5:1; solid surfaces choose a darker step and white copy.
- Override **`color.primary-ink`**, not only `color.primary`; otherwise copy keeps the light ink on a dark surface.
- Use references (`{color.primary-ink}`) in composite typography where possible so one override propagates.
- Audit WCAG for each scheme separately; combinations that were never exported are not “verified”.

### 2.3 Theme proof

```js
const before = TK.paint(masterShapes);
TK.activateTheme('Scheme', 'Dark');
await sleep(700);
const diff = TK.changed(before, masterShapes);   // changed > 0
```

`CK.theme(group,name)` wraps this and returns `changed`, `activeSets` and sample rows. `changed === 0` means the
components are not token-bound or the dark set does not override the roles they use.

Measured on Penpot 2.18.3 (2026-11-02): a dark override of 21 color tokens repainted 65 master shapes; switching back
restored the light paint and returned `changed: 65`.
