---
name: penpot-design
description: "Code to Design + Design to Code bidirectional design-system workflow, plus a practical Penpot MCP automation library. Two entry points (feed a URL or a set of images, or reuse an existing React/UI library source tree) produce DESIGN.md and a fixed-structure Penpot design system (16-page page/board/element contract); through execute_code it batch-builds components/variants/dashboards/typical pages, batch-repairs alignment/stroke/cropping/flex-collapse/Chinese-garbled-text, registers library components, and exports for acceptance; it guides connecting the Penpot MCP and ships a ready-to-use deployment stack; it outputs Qt4/5/6 and React/Vue code from a Penpot design file (framework-specific guides emphasizing image and icon asset references and component-indexed layered implementation) with PIL pixel-level verification aimed at pixel-perfect. Use when the user mentions \"generate a design system from a URL/images\", \"generate a Penpot design system\", \"use Penpot MCP to create pages/build components or dashboards\", \"recreate a UI library/design system\", \"batch-repair alignment/style/render issues/Chinese-garbled-text on selected elements\", \"register library components\", \"enter/validate Penpot design tokens (17 TokenTypes / set activation / token references / themes)\", \"design to code\", \"convert a design into Qt/React/Vue code\", \"pixel-level restoration\", \"choose/specify a target width (Web/Pad/Mobile)\", \"generate/recreate phone or tablet UI\", \"specify/choose a tech stack (Qt/Web/LVGL/imgui/MAUI/Flutter…)\"; supports Web widescreen / tablet Pad / phone Mobile viewports, monochrome / light+dark dual color schemes, and any GUI tech stack; at startup it asks together about the target-width tier and the color mode (whether switchable light+dark themes are wanted), asks the target stack before design→code (to avoid defaulting to React), and constrains DESIGN.md and the build/acceptance accordingly."
version: 1.6.0
license: MIT
---

# penpot-design: Code ↔ Design Bidirectional Workflow

Two directions sharing the same design-system contract (DESIGN.md + fixed Penpot structure):

1. **Code → Design**: feed a **URL** or **a set of images** → produce DESIGN.md + a fixed-structure Penpot design system (16 pages).
2. **Design → Code**: feed a Penpot design file → output **Qt4/5/6** or **React/Vue** code, **pixel-perfect**, accepted via PIL.

## Viewport tiers (required: asked at runtime)

This skill no longer handles only Web widescreen. Every task first confirms the target **viewport tier** before starting:

- **Three tiers**: `web` (widescreen/desktop 1920), `pad` (tablet 834 etc.), `mobile` (phone 375 etc.).
- **Runtime prompt**: before writing DESIGN.md, use `ask_followup_question` (multiSelect) to ask the user
  "Which width-class UI do you want to generate/recreate this time?", with options Web widescreen / Tablet Pad / Phone Mobile.
  If the user has already stated it (e.g. "make a phone version"), the question can be skipped, but it must still be written into `targetProfiles`.
- **Scope**: the tier determines the DESIGN.md Layout (grid/margins/touch targets), the grid board per tier in `12·Layout modes`,
  the screen width per tier in `14·Demo`, and the responsive implementation and acceptance viewport of design-to-code. The design-system core
  (00–13, 15) is tier-independent: built once and shared across all tiers.

Full definitions and artifact mapping are in `references/viewport-profiles.md` (read it first).

## Color mode (required: asked together with the viewport tier at startup)

- **Two options**: `light only` (default) / `light + dark (switchable)`.
- **Runtime prompt**: put it in the **same batch of `ask_followup_question`** as the viewport tier (one round-trip, not two),
  asking "Do you need **switchable** light/dark color schemes (whole-page flip), rather than just light/dark regions alternating within the same page?".
  **You must write the difference between these two options into the option descriptions** — most systems naturally have "sectional surface polarity" (light/dark regions alternating within the same page),
  which is not a theme; asking without clarifying easily yields mismatched answers.
- **Where it lands**: write it into the **DESIGN.md `## Colors` section body** (same as writing `targetProfiles` into `## Layout`),
  **do not** stuff it into a custom frontmatter key (testing shows it passes lint but gets ignored, i.e. ineffective).
- **Scope**: determines the token set/theme structure (two schemes → `· Core` + `· Dark` + Scheme group with two themes,
  **Core must come first**), the dual-polarity palette of `01 F1`, the fully doubled `02` color-system page (including the two C5 contrast-audit tables),
  the polarity notes on component spec boards, and the **doubled board count** of `14·Demo` (tiers × color schemes).
- **Hard rule**: dark is **not** the inverse of light; **WCAG must be audited separately for both schemes**; combinations never exported must not be described as "verified".

Full definitions, artifact mapping, and acceptance are in `references/color-schemes.md` (read it first).
Token set/theme mechanics are detailed in `references/design-tokens.md` §5.

## Tech-stack tiers (asked only before Design → Code)

This skill supports any GUI tech stack (Qt / Web frontend / LVGL / imgui / MAUI / Flutter / SwiftUI / Compose …),
no longer hard-coded to only Qt and React/Vue.

- **When to ask**: only before **Design → Code** use `ask_followup_question` to confirm (two levels: platform family first, then framework,
  multiSelect depending on whether multiple stacks); Code → Design is not mandatory — you may emit a generic design system first and pick the stack at codegen time.
- **Hard rule**: do not enter code generation without a confirmed `targetStacks`; **defaulting to React/Web is forbidden**; if ambiguous, stop and ask — never speculate codegen.
- **Scope**: code is implemented and accepted per the chosen stack (viewport/window = tier baseline width). Unknown stacks emit code per the generic discipline plus clarified
  key constraints, and produce a draft adapter.
- Full classification, prompting rules, and adapter templates are in `references/stack-profiles.md`; the stack → doc mapping is in
  `references/stacks/manifest.md`; the generic codegen discipline is in `references/design-to-code-generic.md`.

## When to Use

Load this skill in the following scenarios and expand using the corresponding reference docs:

- The user gives a URL / screenshot / design image and asks to "generate a design system", "produce DESIGN.md", or "build a Penpot design system".
- The user wants to use Penpot MCP to batch-build pages / components / dashboards, register library components, or batch-fix alignment or Chinese-garbled-text.
- The user wants to recreate an existing React / UI component library into a design system.
- The user wants to convert a Penpot design into code for any tech stack (Qt/Web/LVGL/imgui/MAUI/Flutter…), or do pixel-level restoration/acceptance.

Out of scope: general coding tasks unrelated to Penpot / design systems / design-to-code conversion.

## Reference doc map (read on demand)

| File | Content |
|---|---|
| `references/design-md-spec.md` | DESIGN.md spec (schema/rules/CLI/lint) and skeleton template |
| `references/penpot-structure.md` | **Fixed-structure contract**: 16 pages, page anatomy, spec boards, coordinates, self-check list |
| `references/code-to-design.md` | Entry A (URL) / Entry B (images) analysis + unified build pipeline |
| `references/mcp-connection.md` | Connect Penpot MCP: deployment scripts, endpoint, client config, CA, verification |
| `references/mcp-automation.md` | **execute_code practical handbook**: session discipline, three layout approaches, pitfall quick-ref, variants/components, recreating UI libraries, acceptance discipline |
| `references/api-pitfalls.md` | Detailed execute_code API pitfalls (coordinates/Path/stroke/crop/text/variants/sandbox/crash/export/layout) |
| `references/positioning-audit.md` | **Positioning audit**: four positioning-failure signatures (out-of-bounds/centering residual/size degradation/header collision), root-cause chains, preventive gates G1–G7, standard operation order |
| `references/design-tokens.md` | **Authoritative Design Tokens usage** (tested locally): 17 TokenTypes, value formats, default-applied properties, active/themes/priority, 6 application pitfalls, unbinding details, 9 doc-vs-implementation discrepancies |
| `references/engines.md` | Engines and recipes: repair-engine mechanics, component-factory templates, page-assembly patterns, crash-rebuild checklist (code in scripts/) |
| `references/design-to-code-generic.md` | **Generic codegen discipline** (shared across all stacks: layering/tokens/assets/five states/integer pixels/acceptance) |
| `references/stack-profiles.md` | **Tech-stack tiers**: platform-family classification, runtime prompts (only before design→code), unknown-stack handling |
| `references/stacks/manifest.md` | Tech-stack adapter registry (stack → adapter doc + platform-family tags) |
| `references/stacks/qt.md` | Qt adapter (Qt4/5/6 listed separately) |
| `references/stacks/web.md` | Web frontend adapter (React/Vue/Angular/Svelte…) |
| `references/viewport-profiles.md` | **Viewport tiers**: web/pad/mobile definitions, runtime prompts, impact on DESIGN.md and pages 12/14 and acceptance |
| `references/color-schemes.md` | **Color mode**: asked at startup (same batch as viewport tier), the difference between "sectional surface polarity vs switchable theme", where the answer lands, the artifact mapping for two schemes (token set/theme, changes to pages 01/02/14) and contrast acceptance |
| `references/verification.md` | PIL pixel-level verification full flow and root-cause quick-ref |
| `scripts/seed_storage.js` | execute_code seeding engine (**`storage.T` is only a JS-side color mirror, it does NOT create Penpot tokens** + factory functions; `ct()` is **async, measures real centering after render**, calls must `await`) |
| `scripts/token_engine.js` | **Design Tokens engine**: `TK.seed` (build set + record tokens, auto `active:true`) / `TK.apply` (apply + readback verify, catch silent failures) / `TK.audit` (inactive/broken-reference health check) / `TK.unbindFill` |
| `scripts/repair_engines.js` | Repair engines (**fixStaleCenter** / **groupAssemblies** / alignPage / vAlignPage / fixInner / unclip / cleanOrphans) |
| `scripts/fix_layout.js` | flex-collapse batch repair engine (absRow + fixCol, two-round convergence) |
| `scripts/audit_layout.js` | **Positioning audit engine** (read-only): `auditPage` / `auditAll`, **eleven signature classes** (out-of-bounds/centering residual (incl. **stale-center fingerprint**)/size degradation/header collision/root-level float/sibling board overlap/text overlap/font/**malformed text**/**alignment-not-applied**/**loose assembly loose_assembly**) + verdict `CLEAN`/`NEEDS_REPAIR` |
| `scripts/fix_geometry.js` | **Geometry repair engine** (all support dry-run): `fixColumnOffset` / `fitBoardHeight` / `fixOverflowRight` / **`reflowRows`** / `fitRootHeight` / `fixGeometryAll` / `moveSubtree` |
| `scripts/scaffold_structure.js` | Fixed 16-page skeleton batch-build script |
| `scripts/pixel_diff.py` | PIL pixel-comparison tool (heatmap + JSON metrics) |
| `assets/penpot-server/` | **Bundled deployment stack**: compose with 7 services + caddy/Caddyfile + 8 ops scripts + README (self-resolving paths, whole dir relocatable) |

## Workflow 1: Code → Design (two starting ways)

**Way A — URL**: web_fetch to survey the target site and key subpages → extract colors/fonts/radii/spacing/shadows/component inventory → define style keywords.
**Way B — images**: read each image and analyze → PIL color quantization to `#RRGGBB` → align spacing to the 4/8/12/16/24/32 tiers → component and state inventory (missing states filled by convention and labeled "inferred").

Then (shared by both ways, details in `references/code-to-design.md`):

0. **Confirm the two startup tiers — ask both in the same `ask_followup_question` (two questions), not in two rounds**:
   - **Viewport tier** (read `references/viewport-profiles.md` first): target width web / pad / mobile (multiSelect allowed) →
     write into DESIGN.md `targetProfiles` as a hard constraint going forward.
   - **Color mode** (read `references/color-schemes.md` first): `light only` or `light + dark (switchable)` →
     write into DESIGN.md `## Colors` section body.
     **You must clarify "sectional surface polarity ≠ switchable theme" when asking**, otherwise users easily mismatch.
   The two answers together determine the subsequent **token structure**: light only → 1 set, 0 themes;
   two schemes → `<system> · Core` + `<system> · Dark` (Core first) + Scheme group with two themes.
0.5 **[Gate G1] Read and paste the canonical scripts verbatim**: `scripts/seed_storage.js` (`mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`ct`)
   + `scripts/repair_engines.js` (`alignPage`/`vAlignPage`/`fixInner`/`unclip`/`cleanOrphans`)
   + `scripts/audit_layout.js` (`auditPage`) + `scripts/token_engine.js` (`TK.*`).
   **Do not invent your own coordinate/text helpers** — the incident post-mortem in `references/positioning-audit.md`: a temporary self-made `mkAbsBoard`/text-box
   copied the same systematic offset into all 16 pages. When a new factory is needed, **add** a function; do not rewrite the ones above.
1. Produce **DESIGN.md** (skeleton in spec doc §9, Layout section written per `targetProfiles` with grid/margins/touch targets) →
   `npx @google/design.md lint DESIGN.md` until 0 errors.
2. **Connect Penpot MCP** (see next section). Persist the build queue and completed-page list **to disk** (e.g. `build-progress.json`, gate G6).
3. `scripts/seed_storage.js` seeds factory functions → `scripts/scaffold_structure.js` builds the 16-page skeleton.
   **Immediately record Design Tokens [Gate G9]**: paste `scripts/token_engine.js` → `storage.TK.seed(spec)`
   (spec generates 17 TokenTypes from DESIGN.md sections per the mapping in `references/design-tokens.md` §8) →
   `storage.TK.assert()` must PASS (no inactive set, no broken reference).
   ⚠️ Two must-knows: `addSet()` defaults to **`active:false`**, tokens in an inactive set **bind successfully but the value does not take effect (silent failure)**;
   `storage.T` in `seed_storage.js` is only a JS-side color mirror, **it does not create any Penpot token**. See `references/design-tokens.md`.
4. **[Gate G2/G3] Pilot the first board, then batch**: build the first board of page 01 → `storage.auditPage()` must have no
   `out_of_bounds` / `header_collision` → immediately export and eyeball that there is no overall offset → only then allow batch building.
   During batch, **run a single-board audit right after each board is built** (only this board's findings), do not copy the same offset into 100+ boards.
   Fill page by page: build 01 design basics / 02 color system first (token visualization) → 03–12 component spec boards (contract §4;
   page 12 builds layout-grid boards per selected tier) → 13 component index (+ `component-map.json`) → 14 Demo:
   for **each selected tier** produce that tier's baseline-width six boards (Dashboard/Landing/Login/List admin/Detail/Settings form),
   all assembled from library component instances.
5. Register library components (masters in `AI Component Masters`; **the tag must be a child element of the master board**, otherwise registration yields an empty-shell component).
6. **[Gate G4] Finish page by page, fixed order**: `cleanOrphans()` → `fixStaleCenter()` → `alignPage()` → `vAlignPage()` → `fixInner()` → `unclip()` → `groupAssemblies()` → `fixZOrder()`;
   (`fixStaleCenter` fixes the large offset from "centering computed from the transient width/height at creation moment" baked into coordinates, must run before `alignPage`; text centering always `await storage.ct(...)` or `storage.centerIn(t, host)`, see positioning-audit.md S2)
   **[Gate G10] Assembly ownership**: a complete set of primitives (base plate + label + icon) must be **grouped or made a component, no loose same-level stacking**
   — reuse/registration that enters the 13 index becomes a component (pages use `comp.instance()`), one-off use `penpot.group(...)` groups them;
   judgment and naming contract in `penpot-structure.md` §4.1, audit signature `loose_assembly` (S11), repair engine `groupAssemblies()` (idempotent, at the end of the G4 chain).
   Record the repair log `[position, content, axis, offset]` for manual review, then restore deliberately non-centered elements per `engines.md` §1.
7. **Recompute + accept [Gate G5]**: `auditPage()` recompute the whole page to `CLEAN` (remaining items must each be manually confirmed as deliberately non-centered) →
   export PNG per board (or a contact sheet per page) and accept against the self-check list (page 14 accepted per tier per board).
   **Boards never exported must not be described as "verified"**.
   Also run `storage.TK.audit()`, and on **at least one real shape** do
   `await storage.TK.apply(tokenName, [shape])` and confirm `ok:true` is returned —
   **"no error" ≠ "took effect"**: wrong set-activation state or inapplicable shape both silently no-op; the only verdict is readback.

## Pre-start check: confirm whether Penpot / MCP is ready (mandatory, probe before acting)

The skill **no longer installs** Penpot by default. Before any deployment action, probe the current state and act with the minimal necessary action, to avoid re-pulling images (~5min) or accidentally overwriting an existing deployment.

1. **Probe Penpot service**: run `assets/penpot-server/scripts/status.{sh,ps1}`, or `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags` to see if it returns 200.
   - Returns 200 → service is running, **skip install/start**.
   - Container exists but stopped → just `up.{sh,ps1}` to bring it up, **do not reinstall** (data volume has the account, no `create-profile` needed).
   - Container/compose does not exist → full install needed.
2. **Probe MCP client config**: check whether the workspace `.mcp.json` contains a `penpot` entry (`url: https://penpot.local/mcp/stream`), and `NODE_EXTRA_CA_CERTS` is set, the CA cert exists (`$STACK/data/caddy/pki/authorities/local/root.crt`).
   - Already configured and endpoint reachable → **go straight to "Connect Penpot MCP" verification**, touch nothing.
   - Configured but endpoint down → just start the service.
   - Not configured → configure `.mcp.json` + run `trust-ca` + restart the client.
3. **Confirm with the user before acting**: explain the probe result in one or two sentences (e.g. "Penpot is running, MCP configured, verify directly" / "Detected a stopped old deployment, start only?" / "No deployment detected, full install (~5min image pull)?"), use `ask_followup_question` to confirm the action (**reuse / start only / full install-config**) before executing. Lightweight probing itself is not asked about.

## Connect Penpot MCP (cheat sheet; details in references/mcp-connection.md; do the readiness probe in the previous section before starting, do not install directly)

- The deployment stack ships in `assets/penpot-server/` (compose 7 services + caddy, scripts self-resolve paths, whole dir relocatable): Linux/macOS use `assets/penpot-server/scripts/*.sh`, **Windows uses the same-named `*.ps1`** (prefer `podman compose`, fall back to `docker compose`) → `https://penpot.local` (`admin@penpot.local` / `penpot123`, run `create-profile.{sh,ps1}` first). Windows one-click: `.\scripts\install.ps1`.
- MCP endpoint: `https://penpot.local/mcp/stream` (HTTP) or `https://penpot.local/api/mcp/sse` (SSE).
- Client configures `.mcp.json`; for the self-signed cert run `assets/penpot-server/scripts/trust-ca.{sh,ps1}` once (auto-writes `NODE_EXTRA_CA_CERTS`) and **restart the client**; the CA is independent per stack directory, re-run when switching directories.
- Verify: 4 tools (execute_code / export_shape / high_level_overview / penpot_api_info) → `penpot_api_info` → `high_level_overview` → execute_code smoke.
- execute_code discipline: defensive verification for async page switches; storage is volatile, seed each batch; ≤8 primitives / ≤10 text per call; crash damage check 100×100. Full pitfall table in `references/mcp-automation.md` and `references/api-pitfalls.md`.
- **Before writing an attribute, check `penpot_api_info`; after writing, must readback**: a non-existent property name (e.g. text alignment written as `horizontalAlign`, correct is `align`) **silently fails** under `try/catch`, the code "looks like it ran" but the effect is zero. See `api-pitfalls.md` §12.
- **Export randomly fails** (`waiting until "networkidle"` timeout) is an old exporter bug, not a network issue: change the container's `/opt/penpot/exporter/app.js` `networkidle` to `load` and restart the exporter to fix it for good. See `api-pitfalls.md` §12.3.

## Workflow 2: Design → Code (branches by chosen tech stack)

Entry: Penpot file + DESIGN.md + page-13 component index (`component-map.json`).

> **Confirm the tech stack first**: before entering this flow use `ask_followup_question` to ask `targetStacks` (two levels: platform family → framework,
> multiSelect depending on whether multiple stacks), write into DESIGN.md. No codegen without confirmation; defaulting to React/Web forbidden. See `references/stack-profiles.md`.

**Implementation organization (industry convention, same for all stacks)**: implement **layered by the component index** — tokens layer → atoms (Button/Input…) → composites (SearchBox/FormField…) → modules (TopNav/DataTable…) → pages (aligned to the screen boards of each selected tier on page 14 Demo). Component names map 1:1 to Penpot; accept with PIL immediately after each layer lands before moving to the next.
**Three-tier constraint**: read DESIGN.md `targetProfiles` (viewport web/pad/mobile), `targetStacks` (tech stack), and
the color mode declared in `## Colors` first;
code is responsive per tier, implemented per stack, uses the same semantic tokens per color scheme; acceptance = screenshot at that tier's baseline width × that color scheme, **compare per combination**
(number of combinations = tiers × color schemes).

- **Generic discipline**: read `references/design-to-code-generic.md` first (layering/tokens/assets/five states/integer pixels/acceptance).
- **Pick adapter**: from `targetStacks` pick the corresponding doc via `references/stacks/manifest.md`
  (e.g. `stacks/qt.md` covers Qt4/5/6, `stacks/web.md` covers React/Vue/Angular/Svelte).
- **Unknown stack**: when not registered in the manifest, emit code per generic + clarified key constraints (layout model/style mechanism/asset system/language/acceptance means) from the user,
  and produce a draft adapter `references/stacks/<key>.md`, writing back to the manifest (see `stack-profiles.md` §5).

**Asset references (key)**:

- Images: always go through the stack's asset system (`.qrc` / bundler import / atlas), zero external links in code; export @1x/@2x (@3x) from Penpot, **export size = annotated size × multiplier**, never shrink-scale large images in code; solid blocks/radii/shadows drawn in code.
- Icons: SVG preferred (`currentColor` coloring follows tokens), names consistent with the 01-page F6 icon board; icon buttons = annotated icon size + padding, centering error ≤1px.
- Build an asset manifest (`component-map.json` includes the asset mapping); change images at the design end first then export, one-way flow.

## Acceptance (mandatory): PIL pixel-perfect

**Implementation screenshots compared pixel-by-pixel against Penpot exports must meet the bar before completion**; flow in `references/verification.md`:

```bash
python3 scripts/pixel_diff.py design/Button.png impl/Button.png \
    --out diff/Button.diff.png --threshold 12 --max-diff-ratio 0.002
```

- Screenshot standardization: DPR=1, freeze animations, fonts loaded, window/viewport = design board size.
- Judgment: diff_ratio ≤ 0.5% (whole page) / 0.2% (component); large solid differences must be fixed; size mismatch is an immediate reject.
- Loop: export baseline → screenshot → compare → locate via heatmap (position/color/font/icon/asset) → fix → compare again.
- Finally compare each screen board of page-14 Demo **per selected tier** as a whole page, output a component × metric summary table.
