# Code → Design: three entry points into a fixed-structure design system

Target artifacts (none dispensable):

1. **DESIGN.md** — the compliant spec file (the skeleton from `references/design-md-spec.md` + passing lint).
2. **Penpot design-system file** — the 18-page, 4-layer fixed structure (`references/penpot-structure.md` contract).
3. **Component mapping table** (page `13 · Component index` + workspace `component-map.json`) — input for design-to-code.

**The entry analysis only fills in numbers the engines already know how to draw.** Every value you extract lands either on a
scale `LY`/`CF` already uses (`LY.SPACE`, `LY.ROWS`, the type ramp, `CF.ladder`, `CF.P`) or on an explicit override of it.
If a measured value cannot be expressed through a factory or a recipe, that is a signal the engine is missing something
(gate G11/G12), not a licence to hand-build.

## Entry A: give a URL

1. **Survey**: web_fetch the target URL (and key subpages: login, dashboard, typical form page), extract:
   - Color: primary/secondary/neutral/semantic colors (sample from CSS variables, buttons, links, state components);
     for each tone record the **triple** the kit needs — wash / hue / ink (`design-guide.md` §4.1), not just the base.
   - Font: font-family stack, type scale (h1–h6/body/label), weight usage → snap onto the ramp, note the base body size.
   - Shape: radius tiers, stroke weight, shadow/glow → `CF.radius` tiers and the elevation table (§5.1).
   - Spacing: page margins, card padding, list row height → snap to `LY.SPACE` / `LY.ROWS` (never "approximately 8px").
   - Component inventory: which families of `CF.map()` the page actually shows, and **which slots** (icon-leading input?
     masked input? clear button? addon?) — this is the spec-board row list for pages 03–09.
2. **Style definition**: write Overview (brand personality / target users / emotional tone), determine style keywords (e.g. "deep-blue tech + glowing neon").
3. **Produce DESIGN.md**: fill tokens and body per the skeleton; `npx @google/design.md lint DESIGN.md` until 0 errors.
4. **Enter the unified build pipeline** (below).

## Entry B: give a set of images

1. **Read images** (read one by one): identify theme, component families, layout density, light/dark theme, and the **scroll
   idiom** of each screen (fixed-shell app vs long scrolling document) — that is what decides recipe pages 14 vs 15.
2. **Sample**: use PIL to assist color picking (write a small picking script alongside `scripts/pixel_diff.py`), quantize
   main/background/text colors to `#RRGGBB`; snap spacing to the nearest `LY.SPACE` step and row heights to `LY.ROWS`;
   give the closest font family by literal features and mark "estimated".
3. **Component inventory**: list visible components and states per image (if button hover/disabled doesn't appear in the image,
   the factory still draws the full `CF.AXES` row — fill by convention and note "inferred" in DESIGN.md).
4. **Produce DESIGN.md** (same as Entry A step 3).
5. **Enter the unified build pipeline**.

## Entry C: give an existing React/UI library source (recreate)

When the user gives an existing component library (`.tsx` + `.module.less` etc.) and asks to recreate it into a design system,
use the **recreation pipeline** (`references/mcp-automation.md` §5): first read the full source (don't rely on doc impressions;
lesson: a Title doc was one sentence, the source was five layers) → extract CSS variables into `CF.theme(map)` + `storage.T` +
`TK.seed` → font probing + CJK split → `01 · Foundations` → `03–09` spec boards (the library's own props become the variant rows) →
register components → recipe screens. Where the library contradicts a `design-guide` HARD rule (e.g. white copy on a 3.3:1 hue),
**keep the library's shape and fix the tone**, and write the delta into DESIGN.md rather than forking the factory.

## Unified build pipeline (shared by all entries)

0. **Confirm the two startup tiers — ask both in the same `ask_followup_question` (two questions)** (after obtaining entry materials, before writing DESIGN.md):
   - **Viewport tier** (read `references/viewport-profiles.md` first): multiSelect for target width — `Web 1440 (desktop)` / `Pad 834 (tablet)` / `Mobile 375 (phone)`.
     Result written into DESIGN.md `targetProfiles`.
   - **Color mode** (read `references/color-schemes.md` first): ask whether **switchable** light/dark two schemes are needed (whole-page flip),
     rather than just light/dark regions alternating within the same page — options `Light only` / `Light + dark two schemes`.
     Result written into DESIGN.md `## Colors` section body. **The question must clarify the difference between these two concepts.**
   The two answers together form a hard constraint for all subsequent builds and acceptance. If the user has already stated it
   ("make a phone version", "must have dark mode"), skip the question but still persist.
   Together they determine the token structure: light only → 1 set / 0 theme; two schemes → `· Core` + `· Dark` (Core first) + Scheme group with two themes.
   **Also read `references/design-guide.md` now**: it is the rule set the produced file will be linted against, and its §10 DEFAULT kit
   is what you use for any concern the entry materials did not measure.
1. **Connect Penpot MCP** (`references/mcp-connection.md`): verify the 4 tools work, `high_level_overview` can read files.
2. **Seed, in engine order** (gate G1): `scripts/seed_storage.js` (factories + `storage.T`, which is only a JS-side color mirror) →
   `scripts/layout_engine.js` (`storage.LY`) → `scripts/component_factory.js` (`storage.CF`, re-skin it with `CF.theme(map)` from the
   entry's measurements) → `scripts/token_engine.js` `TK.seed(spec)` to **actually record Penpot design tokens** (set split by color mode) →
   `TK.assert()` must PASS. See `references/design-tokens.md`.
3. **Skeleton**: `scripts/scaffold_structure.js` builds the 18 pages + PageRoot/header/footer (PageRoot always 1920, it's the spec-sheet canvas);
   run its phase-3 **fit** again at delivery time.
4. **Fill page by page** (order = page number order; `export_shape` to accept after **each board**, earlier rebuild costs less):
   - `01 · Foundations` (palette, type ramp, spacing, grid, radius, elevation, icons, strokes) → `02 · Color in use`
     (semantic roles, state layers, **contrast matrix**, light vs dark, data colors) — every later page references these.
   - `03–09`: one `CF.matrix` spec board per family of `CF.map()`, shelves placed with `LY.pack`; `CF.missing()` must be `[]`.
   - `10 · App shell & chrome`: the `CF.map().shell` composites + one anatomy board per `LY.slots` key (audited with `{ families: […] }`).
   - `11 · Grid & breakpoints`: one diagram board **per tier** in `targetProfiles` (`LY.TIERS`), the container ladder, the collapse order, the touch floor.
   - `12 · Screen recipes`: one annotated skeleton per `LY.keys()` (`LY.drawStart`/`drawStep`) + the tier-gate table (which recipe refuses which tier, and its `use` pointer).
   - `13 · Component index` + `component-map.json` (generated from `CF.map()`/`CF.variants()`: component name → page/board, token references, variant list, asset names).
   - `14–16 · Screens`: one board per **recipe × accepted tier** (`LY.recipe(key,{tier})` refuses and returns `{err, use}` — follow the pointer),
     each built at its own tier width with `CF.tier` set first, height from the recipe's `totalH` (long documents stack bands, they do not fit one screen),
     each carrying `LY.fold(board, tier)`.
5. **Register library components**: `CF.component(host)` (masters collected in `AI Component Masters`; the host *becomes* the main instance),
   `CF.variants(hosts, name)` where `penpotUtils.createVariantContainer` is available — probe it, never assume it.
6. **Review and fix**: run the G4 repair chain (`cleanOrphans` → `fixStaleCenter` → `alignPage` → `vAlignPage` → `fixInner` → `unclip` →
   `groupAssemblies` → `fixZOrder`), focus: closed stroke inner, glow board `clipContent=false`, correct CJK font, pad/mobile touch targets ≥44.
7. **Accept**: both auditors CLEAN with the page scope named in contract §2 — `storage.auditPage()` (positioning) and
   `storage.designGate({ tier | families })` (the 18 design rules) — then export PNG per page and check against the self-check list
   (`penpot-structure.md` §8); pages 14–16 accepted recipe by recipe, tier by tier; ask the user to zoom in the editor to review.

## DESIGN.md writing notes (shared by all entries)

- tokens are the only normative values; body only writes semantics and usage ("Primary used only for the single most important action per screen" style guardrails).
- Component tokens reference base tokens where possible (`{colors.primary}`), variant keys independent (`button-primary-hover`).
- Unknown/inferred items don't fabricate precise values: use the `design-guide.md` §10 DEFAULT kit and mark "estimated from image" in prose.
- Icon and image asset conventions are written into Components/Do's and Don'ts in advance (export size, naming, @2x), a prerequisite for pixel-perfect in the design-to-code stage.
- **Layout section must record `targetProfiles`** (web/pad/mobile) and adjust accordingly: the grid is `LY.TIERS[tier]` (12/8/4 cols, margins 32/24/16,
  gutters 24/16/12), the touch floor is 44 on pad/mobile and 32 on web (`CF.minHit()` reads `CF.tier`), row heights come from `LY.ROWS`,
  section rhythm from `LY.SPACE` — never assume a single width, and never write a spacing number that is not on the scale.
