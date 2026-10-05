# Code → Design: two entry points into a fixed-structure design system

Target artifacts (none dispensable):

1. **DESIGN.md** — the compliant spec file (the skeleton from references/design-md-spec.md + passing lint).
2. **Penpot design-system file** — fixed structure (references/penpot-structure.md contract).
3. **Component mapping table** (page-13 component index + workspace `component-map.json`) — input for design-to-code.

## Entry A: give a URL

1. **Survey**: web_fetch the target URL (and key subpages: login, dashboard, typical form page), extract:
   - Color: primary/secondary/neutral/semantic colors (sample from CSS variables, buttons, links, state components)
   - Font: font-family stack, type scale (h1–h6/body/label), weight usage
   - Shape: radius tiers, stroke weight, shadow/glow
   - Spacing: page margins, card padding, list row height (snap to 8px grid)
   - Component inventory: screenshot-style description of component families appearing on the page (button types, form controls, navigation, overlays, charts…)
2. **Style definition**: write Overview (brand personality / target users / emotional tone), determine style keywords (e.g. "deep-blue tech + glowing neon").
3. **Produce DESIGN.md**: fill tokens and body per the skeleton; `npx @google/design.md lint DESIGN.md` until 0 errors.
4. **Enter the unified build pipeline** (below).

## Entry B: give a set of images

1. **Read images** (read_file one by one): identify theme, component families, layout density, light/dark theme.
2. **Sample**: use PIL to assist color picking (write a small picking script alongside `scripts/pixel_diff.py`, or read pixels with Python outside execute_code), quantize main/background/text colors to `#RRGGBB`; reverse-engineer the spacing tiers (4/8/12/16/24/32) from rulers/grids in the image; give the closest font family by literal features and mark "estimated".
3. **Component inventory**: list visible components and states per image (if button hover/disabled doesn't appear in the image, fill by industry convention and note "inferred" in DESIGN.md).
4. **Produce DESIGN.md** (same as Entry A step 3).
5. **Enter the unified build pipeline**.

## Entry C (extension): give an existing React/UI library source (recreate)

When the user gives an existing component library (`.tsx` + `.module.less` etc.) and asks to recreate it into a design system, use the **recreation pipeline** (details in `references/mcp-automation.md` §5):
first read the full source (don't rely on doc impressions; lesson: Title doc was one sentence, source was actually five layers) → extract CSS variables/tokens → font probing + CJK split → Foundations → Components → register library components → assemble typical pages. The output also conforms to the fixed-structure contract.

## Unified build pipeline (shared by all entries)

0. **Confirm the two startup tiers — ask both in the same `ask_followup_question` (two questions)** (after obtaining entry materials, before writing DESIGN.md):
   - **Viewport tier** (read `references/viewport-profiles.md` first): multiSelect for target width — `Web widescreen` / `Tablet Pad` / `Phone Mobile`.
     Result written into DESIGN.md `targetProfiles`.
   - **Color mode** (read `references/color-schemes.md` first): ask whether **switchable** light/dark two schemes are needed (whole-page flip),
     rather than just light/dark regions alternating within the same page — options `Light only` / `Light + dark two schemes`.
     Result written into DESIGN.md `## Colors` section body. **The question must clarify the difference between these two concepts.**
   The two answers together form a hard constraint for all subsequent builds and acceptance. If the user has already stated it ("make a phone version", "must have dark mode"), skip the question but still persist.
   Together they determine the token structure: light only → 1 set / 0 theme; two schemes → `· Core` + `· Dark` (Core first) + Scheme group with two themes.
1. **Connect Penpot MCP** (references/mcp-connection.md): verify the 4 tools work, `high_level_overview` can read files.
2. **Seed**: `scripts/seed_storage.js` builds factory functions (`storage.T` is only a JS-side color mirror) →
   then use `scripts/token_engine.js`'s `TK.seed(spec)` to **actually record Penpot design tokens**
   (set split by color mode: light only → 1 `· Core`; two schemes → `· Core` + `· Dark`),
   finally `TK.assert()` must PASS. See `references/design-tokens.md`.
3. **Skeleton**: `scripts/scaffold_structure.js` builds 16 pages + PageRoot/header/footer (PageRoot always 1920, it's the spec-sheet canvas).
4. **Fill page by page** (order = page number order; within a component page follow the component spec-board contract §4):
   - 01 design basics → 02 color system (token visualization first, later pages reference it)
   - 03–12 component pages: each component one board one matrix; **immediately `export_shape` to accept after each board is built** (earlier rebuild costs less)
   - `12 · Layout modes`: build a layout-grid board for **each tier** in `targetProfiles` (web 12 cols / pad 8 cols / mobile 4 cols or single-column stack) + that tier's responsive breakpoints and Empty/404 template
   - 13 component index + `component-map.json` (component name → page name/coordinates/token reference/variant list)
   - `14 · Demo`: for **each selected tier** produce that tier's baseline-width six boards (Dashboard/Landing/Login/List admin/Detail/Settings form), all assembled from library component instances; multiple tiers placed side by side on page-14's 1920 canvas
5. **Register library components**: masters go to `AI Component Masters`, `createComponent` + `createVariantContainer`.
6. **Review and fix**: run alignment/stroke/unclip engines (engines.md), focus: closed stroke inner, glow board clipContent=false, correct CJK font; **check pad/mobile boards for touch targets ≥44px**.
7. **Accept**: export PNG per page and check against this contract's self-check list (penpot-structure.md §7); page `14` accepted tier by tier, board by board; ask the user to zoom in the editor to review.

## DESIGN.md writing notes (shared by both entries)

- tokens are the only normative values; body only writes semantics and usage ("Primary used only for the single most important action per screen" style guardrails).
- Component tokens reference base tokens where possible (`{colors.primary}`), variant keys independent (`button-primary-hover`).
- Unknown/inferred items don't fabricate precise values: use the closest tier + mark "estimated from image" in prose.
- Icon and image asset conventions are written into Components/Do's and Don'ts in advance (export size, naming, @2x), a prerequisite for pixel-perfect in the design-to-code stage.
- **Layout section must record `targetProfiles`** (web/pad/mobile) and adjust accordingly: spacing scale (mobile tighter 4/8/12),
  touch-target floor (pad/mobile ≥44px, introduce `touchMin` token), grid description written per tier, never assume a single width.
