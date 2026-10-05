# Design → Code: Generic Discipline (shared baseline across all tech stacks)

Every stack's codegen follows this article first, then picks the corresponding adapter from `references/stacks/manifest.md` by DESIGN.md `targetStacks` to fill in differences.
The common parts of the original Qt / Web guides have been pulled here; adapters only cover that stack's specifics.

## 0. Three-tier constraints (read before starting)

- **Viewport tier `targetProfiles`**: see `references/viewport-profiles.md`; acceptance viewport/window width = that tier's baseline width, compared tier by tier.
- **Tech-stack tier `targetStacks`**: see `references/stack-profiles.md`; **do not enter code generation without confirmation, defaulting to React/Web is forbidden**.
- **Color mode `colorSchemes`**: see `references/color-schemes.md`; with two schemes you **must use the same set of semantic tokens**,
  never hard-code the second scheme's values inside components, and **acceptance combination count = tiers × schemes** (each tier × each scheme screenshotted and compared separately).
  The switch mechanism and persistence (follow system / manual / remember or not) are read from the declarations in DESIGN.md `## Colors` and Do's and Don'ts.
- The three are orthogonal: one design system can simultaneously target (stack, profile, scheme) combinations, e.g. web+React+dark and mobile+Flutter+light.

## 1. Layered implementation organization (industry convention, same for all stacks)

token layer → atoms (Button/Input…) → molecules (SearchBox/FormField…) → organisms (TopNav/DataTable…) → pages (aligned to page-14 Demo **each tier's screen boards**).

- Component names map 1:1 to Penpot (`Button·Primary` → `ButtonPrimary` / `Button variant="primary"`); each component is a single file/dir + same-named style + state preview.
- The class-name/file-name mapping table is on the page-13 component index.

## 2. Token layer (no scattered magic values)

- DESIGN.md tokens are the single source of truth; component styles/constants only reference **exported variables** (CSS variables / QSS variables / constant header files / theme singletons… per stack), **never hard-code hex/px magic numbers in components**.
- Export means are in each stack adapter (`design.md export` / dtcg / hand-written constant header).

## 3. Asset reference general rules

- **Zero external asset links**: all images/icons go into the stack's asset system (bundler import / `.qrc` / atlas / binary compile), code only references asset paths, no runtime relative-path dependence.
- **Export size = design annotation size × multiplier** (@1x/@2x/@3x), exported from Penpot via `export_shape`; never scale large images in code.
- Solid blocks/radii/shadows are preferably drawn in code (not exported as bitmaps), so they stay sharp when enlarged.
- Icon naming consistent with the 01 design-basics page **F6 icon board**; icon buttons = annotated icon size + padding, centering error ≤1px.

## 4. State completeness

Every interactive widget implements the five states **Default / Hover / Pressed / Focused / Disabled** (display widgets Default/Disabled), colors taken one-by-one from DESIGN.md variant keys.

## 5. Fonts

Self-host the same design font family; weight/size/line-height/letter-spacing aligned item-by-item to the F2 type scale; synthetic bold disabled.

## 6. Integer pixels and box model

All spacing/sizes take integer design annotations; the box model (e.g. `border-box`) corresponds to Penpot `strokeAlignment='inner'`; a 1px offset is treated as a bug.

## 7. pixel-perfect acceptance (layer by layer)

After each layer lands, run the PIL comparison in `references/verification.md`: DPR=1, animations off, fixed viewport/window = that tier's baseline width; after the component layer passes, do a **whole-page comparison** of page-14 **each tier's screen boards** (threshold 0.5%).
Loop: export baseline → screenshot → compare → locate via heatmap (position/color/font/icon/asset) → fix → compare again.

## 8. Pick an adapter

`targetStacks` hits a registered stack in `references/stacks/manifest.md` → read the corresponding `stacks/<key>.md`;
miss → per this article + ask the user for key constraints to codegen, and produce a draft adapter (see `stack-profiles.md` §5).
