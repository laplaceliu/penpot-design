---
name: penpot-design
description: "Code to Design + Design to Code bidirectional design-system workflow, plus a practical Penpot MCP automation library. Two entry points (feed a URL or a set of images, or reuse an existing React/UI library source tree) produce DESIGN.md and a fixed-structure Penpot design system (18-page, 4-layer page/board/element contract). Layout is built in: a deterministic layout engine holds the spacing/type/grid scales and 30 screen recipes (app chrome — header, sidebar, footer, toolbar — plus business screens: email, calendar/week/month, event popover, dashboard, list, detail, settings, chat, kanban, hero, landing, blog, docs, e-commerce listing/PDP/cart/checkout, auth, OTP, pricing, wizard, gallery, print, contact), a component factory produces maximals variant sets (plain text button and icon button, plain input and icon input and masked input and OTP, … with the five state axes), and a prescriptive design guide plus a design-rule linter enforce whitespace, rhythm, typography, contrast, touch targets and state layers. Through execute_code it batch-builds components/variants/dashboards/typical pages, batch-repairs alignment/stroke/cropping/flex-collapse/Chinese-garbled-text, registers library components, and exports for acceptance; it guides connecting the Penpot MCP and ships a ready-to-use deployment stack; it outputs code for any GUI tech stack (Qt4/5/6, React/Vue, LVGL, imgui, MAUI, Flutter…) from a Penpot design file, emphasizing image and icon asset references and component-indexed layered implementation, with PIL pixel-level verification aimed at pixel-perfect. Use when the user mentions \"generate a design system from a URL/images\", \"generate a Penpot design system\", \"use Penpot MCP to create pages/build components or dashboards\", \"recreate a UI library/design system\", \"built-in layouts / header footer sidebar / email calendar hero blog layouts\", \"component variants and states coverage\", \"design rules for whitespace, spacing or typography\", \"batch-repair alignment/style/render issues/Chinese-garbled-text on selected elements\", \"register library components\", \"enter/validate Penpot design tokens (17 TokenTypes / set activation / token references / themes)\", \"design to code\", \"convert a design into Qt/React/Vue code\", \"pixel-level restoration\", \"choose/specify a target width (Web/Pad/Mobile)\", \"generate/recreate phone or tablet UI\", \"specify/choose a tech stack (Qt/Web/LVGL/imgui/MAUI/Flutter…)\"; supports Web widescreen / tablet Pad / phone Mobile viewports, monochrome / light+dark dual color schemes, and any GUI tech stack; at startup it asks together about the target-width tier and the color mode (whether switchable light+dark themes are wanted), asks the target stack before design→code (to avoid defaulting to React), and constrains DESIGN.md and the build/acceptance accordingly."
version: 1.7.0
license: MIT
---

# penpot-design: Code ↔ Design Bidirectional Workflow

Two directions sharing the same design-system contract (DESIGN.md + fixed Penpot structure):

1. **Code → Design**: feed a **URL** or **a set of images** → produce DESIGN.md + a fixed-structure Penpot design system (18 pages, 4 layers).
2. **Design → Code**: feed a Penpot design file → output code for the **confirmed tech stack**, **pixel-perfect**, accepted via PIL.

## What is built in (read this before improvising anything)

Layout, components and design rules are **engines in this skill**, not prose you re-derive per task:

| Engine | Holds | Doc |
|---|---|---|
| `scripts/layout_engine.js` → `storage.LY` | the space scale (`LY.SPACE`), **the whitespace ladder (`LY.BREATH` / `LY.breath(level, tier)` — 7 named levels, every one a `SPACE` member)**, row ladder (`LY.ROWS`), type ramp, the three viewport tiers (`LY.TIERS`), region math for **30 screen recipes** (`LY.keys()`), shelf packing (`LY.pack`), fold marker (`LY.fold`) | `references/layout-library.md` |
| `scripts/component_factory.js` → `storage.CF` | **74 control factories in 6 groups** (`CF.map()`: actions 7 · forms 23 · data 19 · navigation 9 · feedback 10 · shell 6; 106 `CF` functions in total once the drawing helpers are counted), each producing every variant × state of its family with named anatomy (`Button·IconStart·Md·Hover`), the size ladder (`CF.ladder`), the state alphas (`CF.STATE`), 85 glyphs (`CF.glyphKinds`), and `CF.missing()` as the registry diff; `CF.matrixPlan()` pre-flights a heavy family and splits its rows into parts that each fit one `execute_code` call (build one part per call under the 30 s MCP ceiling) | `references/component-library.md` |
| `scripts/foundations_engine.js` → `storage.FN` | **the only way a Foundations/Color-in-use board exists**: 11 board kinds (`FN.kinds()`) projected from `TK.declared()` over **both gated chapters — `01` carries 7 kinds, `02 · Color in use` carries 4, one contract and one gate for both** — no hex mirror, no typed height; the editorial sentences are data (`FN.setContent`) and the sentences a board consumed are stamped back into the file (`nl:prose`), WCAG ratios and state washes are derived (`FN.ratio`/`FN.over`), the shelf position is re-derived from the live page each call (`FN.lanes`/`reflow`/`fitRoot`), every write path binds the page first and refuses if the switch did not settle (`FN.use`), every board is bound + gated by the same engine (`FN.bindNext`), and each mount carries the durable `nl:fn=<kind>` stamp that makes the gate checkable (`FN.CHAPTER`/`EXEMPT`/`coverage`, `engines.md` §7.1) | `engines.md` §7 / §7.2 |
| `scripts/screen_engine.js` → `storage.SC` | **the only way a screen is built when the user supplied source material** (gate **G17**): `SC.record(screen, {src, recipe, sections:[{region, controls, copy, media, icons}]})` declares what the source shows, `SC.build(screen)` assembles it out of the system — controls placed as **library instances** (`SC.ctl` → `CF.instance`, never a re-draw; a missing master is reported as `missing_master`, not drawn around), structure from `LY.recipe` via `NL.fromRecipe`, copy on the ramp carrying the library typography style (`SC.copy` → `TP.apply`), raster from real media (`SC.media` → `MD.place`), then `TK.bindBoard` and a **durable record stamp** (`nl:sc/src/recipe/tier` + `nl:rec` digest) so `SC.coverage()` re-reads the contract from the file in any later session. Idempotent by stamp, board-scoped (a screen mounts **inside `NN-PageRoot`**, never at page root), section-limited for the 30 s sandbox ceiling. Reads: `SC.audit()` (drawn hosts / placeholders / bound copy → `ASSEMBLED`|`NOT_ASSEMBLED`), `SC.reconcile({dry})` (the drawn-vs-placed census), `SC.coverage()` | `engines.md` §8 |
| `scripts/media_engine.js` → `storage.MD` | **the raster channel** a photograph needs: `MD.import({path})` / `MD.place({parent, slot, path, x, y, w, h})` upload the user's own image as a Penpot media object and paint it (`fillImage`), because a gray plate with an icon glyph in it is a placeholder, not the source. Binary travels as base64 through the skill server's `/b64/<path>`; the seven measured media rules (M1–M7: three-arg `uploadMediaData`, whole-media-object fills, `uploadMediaUrl` cannot reach loopback, no media registry to read, proof = export) are in the file header and `penpot-capabilities.md` §9.1 | `penpot-capabilities.md` §9.1 |
| `references/design-guide.md` | prescriptive rules: spacing scale and whitespace, typography ramp + roles, color tone steps (wash/hue/ink), elevation and state layers, control sizes and touch floors, alignment, iconography | read before writing DESIGN.md |
| `scripts/audit_design.js` → `storage.designGate` | machine check of those rules (46 signatures, incl. token-binding, `not_component`, `caption_stale`, `empty_cell`, `no_type_styles`, `not_projected`, the **whitespace trio** `cramped_gap`/`hierarchy_gap`/`text_cramped`, the **radius pair** `radius_off_ladder`/`radius_unbound`, `ring_off_host` (a ring must take its host's corner), `ring_detached` (a ring must be mounted inside the control it outlines), `focus_invisible` (a ring that does not paint must be paired with a visible state wash — component-library §1.3), `row_axis_off` (a row's node, connector and copy share one axis — design-guide §2.3), `frame_dead_band` (a control border must not reserve a band its content never paints — design-guide §3.3) and the **gate-G17 trio** `not_assembled`/`placeholder_media`/`no_source_record`, scoped to the `14–16 · Screens` pages) — the design-guide is not a wish list | `design-guide.md` §11 |

**Consequences**: a needed variant is produced by extending the factory (gate **G12**), a needed region by extending the
recipe (gate **G11**), a Foundations/Color board by extending the projector (gate **G16**), a screen control that has no
master by extending the factory and then **placing an instance** (gate **G17**), and delivery is blocked until
`storage.designGate()` reads CLEAN (gate **G13**). G16 is not self-declared: rule 31 `not_projected` fails any `01.xx`/`02.xx`
board without the durable `nl:fn` stamp, and `storage.designCoverage()` fails a chapter whose kinds were never projected.
G17 is not self-declared either: rules 39/40/41 fail a `14–16` screen that draws a control with no master (`not_assembled`),
promises a raster slot and paints gray instead of the user's image (`placeholder_media`), or carries no source record
(`no_source_record`) — and a Screens page where `storage.SC` was never seeded cannot claim the gate at all.
Hand-written coordinates, hand-built one-off boards, hand-composed spec pages, freehand screens and "documented but unbuilt"
rules are all the failure mode this structure replaces.

**Whitespace is the default and preferred layout device (rules 32–34, inside gate **G13**)** — for *both* halves of the file: the gap
between elements **and** the space inside and between blocks of text. Separation is bought in this order: whitespace →
elevation/surface polarity → stroke or divider → alignment. The amounts are never typed at the call site: a content stack
takes its gap from `LY.BREATH` (`NL.frame({ breath: 'block' })`), and a paragraph's leading plus the air between paragraphs
come from the declared typography token, not from the call. What a builder writes and what the gate measures are the same
table (`LY.breath()` + `storage.breathSpec`), and `storage.breathe()` is the idempotent repair twin. The three exemptions
are declared, not improvised: a repeated run (a table is one group), abutting panes (§1.3), and a label↔field pair at 4–6.

**A corner is taken from the `borderRadius` token set and nowhere else (rules 35–38, inside gate **G13**)** — an isolated
`borderRadius` number is not a legal write in this skill. The ladder exists as tokens (`radius.none/xs/sm/md/lg/xl/full`,
seeded from **DESIGN.md**, which for a recreation means *the source site's own* steps), and every writer — `ctx.plate`,
`ctx.ring`, `ctx.clip`, `CF.build`, `NL.frame`, `NL.gridFrame`, `mkAbsBoard`, `mkRect` — goes through `CF.radius(role)`, which
**snaps an off-ladder number to the nearest step and records the coercion in `CF.coerced`**, so the defect cannot be introduced
at draw time. A control's corner is `radius.full` (a pill binds the token, never `height/2`); a ring takes **its host's** corner
(`CF.ROLE.ring = 'host'`, rule 37 `ring_off_host` — a `r0` body under an `r9999` ring is one defect seen from two places); the gate
judges the result against the live `TK.declared().radii`, and `TK.radiusSweep()` (ladder) / `TK.roleSweep()` (role: pill-family hosts
and rings, **masters and placed copies**, because a master write does not re-sync copies) are the idempotent repairs for a file built
before the rules. Read the remaining limit: 35/36 judge corners that *exist*, and none of the three can tell whether a family whose
role DESIGN.md does not pin should be `sm` or `md` — `design-guide.md` §5.1 says what to measure instead of assuming a CLEAN gate means
the contract is applied.

**A `ring·*` layer must be mounted INSIDE the control it outlines (rule 38 `ring_detached`).** A ring is derived geometry: `ctx.ring`
draws it as the control's last child, at the owner plate's box ⊕ its own margin. When a refit later moves or widens that plate, the
ring stays where it was — a floating outline on the `Family·Spec` board, which no corner rule can see (there is no pair to compare).
The relation is resolved **once, by geometry**, in `TK.ringHost()` and judged on the **relation, not the margin**: measured 2026-10-22
across the file's 231 rings the margin is 2 for most families but 5/6/7/10 for others and 0 for an inline link, and the owner is
usually a *nested* plate (an addon's `field`, a Checkbox `box`, one Slider `handle`, one row of a Tree/Accordion/rail). So a ring is
legal when it encloses a real plate concentrically, or — for a row band that has no plate of its own — when it sits inside its control;
it is a defect when it lies on the container board. `TK.ringStart()` + `TK.ringSweep({dry})` then `{budget, settle}` is the census and
the idempotent repair (re-mount + refit onto the owner, preserving the ring's own margins); it re-binds `radius` on every page it writes.

**A recreated screen is ASSEMBLED from the system, never drawn at the screenshot (rules 39–41, gate **G17**, scoped to the `14–16 · Screens` pages).**
When the user supplies source material — a URL, screenshots, or an existing library source tree — and asks to imitate or recreate it, the screen is
built out of what the design system already owns, because that is the only version they can edit afterwards. Six channels, one legal call each:

| The source shows | Assemble it with | Never |
|---|---|---|
| a region or column | `LY.recipe(key,{tier})` → `NL.fromRecipe` | typed `x/y/w/h` |
| a control | `SC.ctl` → `CF.instance`/`CF.swap`, a **library instance** | a second `CF` draw or a rectangle — no master means extend the factory (G12), register it, then place it |
| its colour and type | `TK.bindBoard` / `TP.apply` (token + library type style) | the sampled hex typed into a fill |
| its spacing | `LY.BREATH` | a guessed gap |
| an icon | `IC.place` / `CF.glyph` | an emoji |
| a **photo, logo or screenshot** | `MD.place({parent, slot, path})` — the user's own bytes as a `fillImage` media object | a gray plate with an `image` glyph in it, which is a placeholder, not their asset |

The record comes before the build: `SC.record(screen, { src, tier, recipe, sections:[{region, controls, copy, media, icons}] })` **validates while you
declare** (a recipe outside `LY.keys()`, a control with no master, a slot with no source path, copy with no text each come back in `gaps`), then
`SC.build(screen)` assembles it and stamps `nl:sc` + `nl:rec` into the board — so `SC.coverage()` re-reads the contract from the file in any later
session, by another person, or after a crash. The stamp is what makes the gate checkable, and **unprovable is REPORTED, not passed**: a `14–16` page
where `storage.SC` was never seeded fails `no_source_record` instead of reading CLEAN. A screen mounts **inside `NN-PageRoot`**, because `designPage()`
walks from the page head — a board at page root is invisible to the gate *and* indicted by `audit_layout.root_stray` (measured 2026-10-22: a 31-shape
screen at root audited `shapes: 201` and read CLEAN, the falsest CLEAN this file has produced). `SC.audit()` is the read-side verdict (`ASSEMBLED` /
`NOT_ASSEMBLED`: drawn hosts, unfilled slots, unbound copy and paint), `SC.reconcile({dry})` the census, rebuild-by-stamp the idempotent repair.
Proof measured the same day: the negative control fires exactly `not_assembled:1` + `placeholder_media:1` on a screen page and **zero** G17 findings on
`17 · Reference imitation`; after `CF.autoRegister` + `MD.place` both findings clear without tripping rule 27, and `SC.audit()` reads ASSEMBLED
(7 instances, 0 drawn hosts, 2/2 media filled, 95/95 copy and 135/135 paint bound — with 2 empty FAQ regions reported, not hidden).
Read the remaining limit: G17 proves **assembly**, not **fidelity**. It cannot see that the copy is wrong or the crop is off, so the PIL diff against
the source (`verification.md`) remains what accepts a recreated screen.

## Viewport tiers (required: asked at runtime)

This skill no longer handles only Web widescreen. Every task first confirms the target **viewport tier** before starting:

- **Three tiers**, baseline widths from `LY.TIERS`: `web` 1440 (12 cols, margin 32, gutter 24, touch 32, viewport 900),
  `pad` 834 (8 cols, margin 24, gutter 16, touch 44, viewport 1112), `mobile` 375 (4 cols, margin 16, gutter 12, touch 44, viewport 812).
  **1920 is the spec-sheet canvas width, never a screen width.**
- **Runtime prompt**: before writing DESIGN.md, use `ask_followup_question` (multiSelect) to ask the user
  "Which width-class UI do you want to generate/recreate this time?", with options Web 1440 / Pad 834 / Mobile 375.
  If the user has already stated it (e.g. "make a phone version"), the question can be skipped, but it must still be written into `targetProfiles`.
- **Scope**: the tier determines the DESIGN.md Layout (grid/margins/touch targets), one grid diagram board per tier on
  `11 · Grid & breakpoints`, and one screen board per **recipe × accepted tier** on `14–16 · Screens`. The design-system core
  (00–13, 17) is tier-independent: built once and shared across all tiers.
- **Tier gate**: `LY.recipe(key, { tier })` *refuses* a recipe that has no definition at that tier and returns `{ err, use }`
  (28/30 recipes run on web, 26/30 on pad, 9/30 on mobile). A three-pane app screen at 375 is replaced by `mobileListDetail`,
  never squeezed. Set `CF.tier` to the board's tier **before** building it, or compact controls ship at 32px on a phone.

Full definitions and artifact mapping are in `references/viewport-profiles.md` (read it first).

## Color mode (required: asked together with the viewport tier at startup)

- **Two options**: `light only` (default) / `light + dark (switchable)`.
- **Runtime prompt**: put it in the **same batch of `ask_followup_question`** as the viewport tier (one round-trip, not two),
  asking "Do you need **switchable** light/dark color schemes (whole-page flip), rather than just light/dark regions alternating within the same page?".
  **You must write the difference between these two options into the option descriptions** — most systems naturally have "sectional surface polarity" (light/dark regions alternating within the same page),
  which is not a theme; asking without clarifying easily yields mismatched answers.
- **Where it lands**: write it into the **DESIGN.md `## Colors` section body** (same as writing `targetProfiles` into `## Layout`),
  **do not** stuff it into a custom frontmatter key (testing shows it passes lint but gets ignored, i.e. ineffective).
- **Scope** — bounded on purpose so a second scheme costs a page, not the file: token set/theme structure (two schemes →
  `· Core` + `· Dark` + Scheme group with two themes, **Core must come first**), the dual-polarity `Palette` board and the
  doubled `Contrast matrix` on `02 · Color in use` (both are **one more `FN.project({…, set})` per token set** — a dark
  board is a record read of the dark set, never a hand-drawn second column; G16), dark state rows inside the existing `03–09` spec boards (they are **not**
  duplicated), dark-panel variants on `10`, one extra column on `13`, and **one dark twin per screen page 14/15/16 (+3 boards)**.
  `11` and `12` are unaffected: layout is orthogonal to color.
- **Hard rule**: dark is **not** the inverse of light — each tone step is re-derived (the `*Ink` step must lift, see
  `color-schemes.md` §4.1); **WCAG must be audited separately for both schemes**; combinations never exported must not be described as "verified".

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
| `references/design-guide.md` | **Prescriptive design rules**: base unit and spacing scale, whitespace/vertical rhythm, type ramp + roles + measure, tone triples (wash/hue/ink), elevation and state layers, control sizes and touch floors, alignment, iconography, the DEFAULT kit for unmeasured values, the **46 HARD rules** `audit_design.js` enforces (§11, incl. §2.1 "whitespace is the first separation device", §5.1 "a corner comes from the `borderRadius` set" / "a ring takes its host's corner" / "a ring is mounted inside the control it outlines", and §12 "a recreated screen is assembled from the system" — gate G17) |
| `references/layout-library.md` | **Built-in layouts**: app chrome (appBar/sideNav/navRail/toolbar/footer/statusBar), the region vocabulary (`LY.slots`), the **30 screen recipes** (`LY.keys()`: dashboard, listCrud, detailRecord, settings, email3, chat, kanban, calMonth/calWeek, hero, landing, blog, docs, pricing, ecom, cart, checkout, auth, otp, wizard, gallery, commandPalette, mobile…), grid/breakpoints, collapse order, long-document band stacking |
| `references/component-library.md` | **Variant taxonomy and the minimum variant set per family**: the `Family·Type·Size·State·Slot·Tone` name grammar, required states per control class, icon/affix/clear/loading slots, and which `CF` factory owns each family |
| `references/design-md-spec.md` | DESIGN.md spec (schema/rules/CLI/lint) and skeleton template |
| `references/penpot-structure.md` | **Fixed-structure contract**: 18 pages in 4 layers, the optional **block-per-page** pagination (`NN.MM · Chapter · Block`, screens exempt), page anatomy, spec boards, coordinates, self-check list |
| `references/code-to-design.md` | Entry A (URL) / Entry B (images) / Entry C (library source) analysis + unified build pipeline |
| `references/mcp-connection.md` | Connect Penpot MCP: deployment scripts, endpoint, client config, CA, verification |
| `references/mcp-automation.md` | **execute_code practical handbook**: session discipline, three layout approaches, pitfall quick-ref, variants/components, recreating UI libraries, driving the build through `LY`/`CF`, acceptance discipline |
| `references/api-pitfalls.md` | Detailed execute_code API pitfalls (coordinates/Path/stroke/crop/text/variants/sandbox/crash/export/layout) |
| `references/positioning-audit.md` | **Positioning audit**: incident post-mortem, the S1–S14 signature catalogue (out-of-bounds/centering residual incl. the stale-center fingerprint/size degradation/header collision/root stray/font/board overlap/text overlap incl. cross-parent S8b/malformed text/alignment-not-applied/loose assembly/stroke covered S12/stroke clipped S12b/duplicate board S13; S14 tall-copy reservation is a cause class), root-cause chains, preventive gates G1–G8, standard operation order |
| `references/design-tokens.md` | **Authoritative Design Tokens usage** (tested locally): 17 TokenTypes, value formats, default-applied properties, active/themes/priority, 6 application pitfalls, unbinding details, 9 doc-vs-implementation discrepancies, and the theme-switch **paint proof** (§9.1) |
| `references/penpot-capabilities.md` | **The authority on what may be claimed** — every Penpot API used by this skill with the exact call, the measured readback and the date: sizing/flex vocabulary, grid, components/variants (§5), tokens/themes (§6), library colors (§7), prototype interactions (§8), delivery/export/versions (§9), plus §12 "still unverified". Read this **before** believing a doc or designing against an API |
| `references/native-layout.md` | **Native auto-layout authoring** (`storage.NL`): the four-layer division of labour (LY/CF/NL/absolute), seed + call shape, rules R1–R7, the sizing decision table and its six measured traps, screen build order, grid, construction aids, and `auditFlow`'s signature → repair table |
| `references/icons.md` | **Icons**: which channel (`CF.glyph` in-control / `IC.place` / `CF.svgIcon`), the embedded Lucide catalog (1966 icons, ISC) and its JSONL contract, why a `.penpot` library download is not automatable, license table (Lucide/Material/FontAwesome/penpothub), extending the catalog, SVG constraints |
| `references/engines.md` | Engines and recipes: seed order, repair-engine mechanics, factory templates, screen-assembly pattern, crash-rebuild checklist (code in scripts/) |
| `references/design-to-code-generic.md` | **Generic codegen discipline** (shared across all stacks: layering/tokens/assets/five states/integer pixels/acceptance) |
| `references/stack-profiles.md` | **Tech-stack tiers**: platform-family classification, runtime prompts (only before design→code), unknown-stack handling |
| `references/stacks/manifest.md` | Tech-stack adapter registry (stack → adapter doc + platform-family tags) |
| `references/stacks/qt.md` | Qt adapter (Qt4/5/6 listed separately) |
| `references/stacks/web.md` | Web frontend adapter (React/Vue/Angular/Svelte…) |
| `references/viewport-profiles.md` | **Viewport tiers**: `LY.TIERS` definitions (web 1440 / pad 834 / mobile 375), runtime prompts, the tier gate, impact on pages 11 and 14–16 and acceptance |
| `references/color-schemes.md` | **Color mode**: asked at startup (same batch as viewport tier), the difference between "sectional surface polarity vs switchable theme", where the answer lands, the bounded artifact mapping (token set/theme, `01`/`02`/`10`/`13`/`14–16`) and contrast acceptance |
| `references/verification.md` | PIL pixel-level verification full flow and root-cause quick-ref |
| `scripts/seed_storage.js` | execute_code seeding engine (**`storage.T` is only a JS-side color mirror, it does NOT create Penpot tokens** + `mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`ct`; `ct()` is **async, measures real centering after render**, calls must `await`) |
| `scripts/layout_engine.js` | **Layout engine** (`storage.LY`): `SPACE`/`ROWS`/ramp, `TIERS`, `slots`, `recipe(key,{tier,w,h,x0,y0})` → a frozen region plan read with `LY.rect(name)`, `snap`/`pack`/`fold`/`viewportHeight`, `keys()`, `missing()` |
| `scripts/component_factory.js` | **Component factory** (`storage.CF`): 74 control factories over the 6 `CF.map()` groups (`ladder`/`P`/`STATE`/`fills`/`name`/`minHit`/`tier`/`matrix`/`map`/`missing`); every variant × state of a family drawn and **named** so coverage is decidable. Plus the **component layer**: `component`/`register` (master), `get`/`instance`/`swap` (place + switch a control on a screen), `variantSet`/`variants` (native variant container), `svgIcon` (SVG → editable vectors) |
| `scripts/native_layout.js` | **Native auto-layout engine** (`storage.NL`): flow authoring with `frame`/`row`/`col`/`gridFrame`/`cell` — **`frame({breath:'block'})` takes the gap from `LY.BREATH`, the default-and-preferred whitespace path (omitting both `gap` and `breath` used to mean flex default 0)** — `sizing`/`fill`/`fix`/`hug`, whitelisted flex vocabulary (`applyFlex`, rules R1–R6), `guide`/`stamp`, **`whenSettled`** (polls the stale fingerprint), **`auditFlow`** (the flow lint: `not_settled`/`sizing_dropped`/`main_axis_overflow`/… ), `nudge`, `reflow`, `fromRecipe` — the editable half of every screen (native-layout.md) |
| `scripts/audit_design.js` | **Design-rule lint engine** (read-only): `designPage` / `designStart`+`designNext` / `designGate` / `designCoverage` — the 46 HARD rules of `design-guide.md` §11 (token-binding, `not_component`, `caption_stale`, `empty_cell`, `no_type_styles`, the G16 provenance rule `not_projected` whose chapter table it reads from `storage.FN` instead of copying, the whitespace trio `cramped_gap`/`hierarchy_gap`/`text_cramped` whose amounts it reads from `LY.BREATH` and publishes to the repairer as `storage.breathSpec`, the radius pair `radius_off_ladder`/`radius_unbound` whose ladder it reads from the live `TK.declared().radii` instead of `CF.RAD`, `ring_off_host` which compares a `ring·*` plate to the corner of the control it outlines, `ring_detached` which requires that plate to be **mounted inside** that control — judged through `TK.ringHost`, the same resolver the repairer uses, so gate and fix cannot disagree — **and the gate-G17 trio `not_assembled`/`placeholder_media`/`no_source_record`, scoped by page name to `14–16 · Screens` (`SCREEN_PAGE`) so a `·Spec` chapter that legitimately shows a drawing is never indicted; their family index is read LIVE from `CF.map()` rather than from the auditor's own `CLASS` table, and their slot grammar from `CF.isMediaSlot`**, **judging component masters, not only copies** (`isComponentCopyInstance`, never `isComponentInstance` — a master answers the latter), the per-page **adoption reads** `out.breath` + `out.radius` (how much of the file separates / rounds on a ladder level), verdict `CLEAN`/`NEEDS_REPAIR` (gate G13) |
| `scripts/token_engine.js` | **Design Tokens engine**: `TK.seed` (build set + record tokens, auto `active:true`) / `TK.apply` (apply + readback verify, catch silent failures) / `TK.paint`+`TK.changed` (theme-switch **paint** proof) / `TK.audit` (inactive/broken-reference health check) / `TK.unbindFill`. Plus the **retro-apply driver** `TK.bindPage`/`TK.radiusStart`+`TK.radiusSweep`+`TK.radiusPages` — a resumable, class-scoped (`{only:'radius'}`) whole-file pass whose per-page yield **is the commit** (api-pitfalls §17). Plus the **role pass** `TK.roleStart`+`TK.roleSweep`+`TK.rolePages` — walks every page and forces the corner a **family** must carry: control-family hosts (`TK.CONTROL_FAMS`: button/iconbutton/splitbutton/fab/chip/badge/tag) to `CF.radius('control')`, every `ring·*` plate to its host's corner (`CF.ROLE.ring = 'host'`), masters **and** placed copies (a master write does not re-sync copies), then binds what it wrote. Plus the **ring-mount pass** `TK.ringStart`+`TK.ringSweep`+`TK.ringPages` — rule 38's census and idempotent repair: `TK.ringHost(shape)` resolves the plate a `ring·*` outlines (enclosure 0–12 per axis + centre Δ ≤ 3, nested plates and flat row bands included) and the sweep re-mounts a drifted ring onto that owner at the ring's **own measured margin**, then re-binds `radius` for the page | Plus **`storage.TP`** — the library **typography styles** behind 素材 → 排版: `TP.seed` (one `LibraryTypography` per declared ramp step, named like its token, idempotent, readback-verified) / `TP.audit` (tokens ↔ styles diff) / `TP.apply` (measured: `applyToText` rewrites `lineHeight` to 1.2, so it re-asserts the style's leading) |
| `scripts/palette_engine.js` | **Library-color engine** (`storage.LIB`): `LIB.seed`/`put` (idempotent create→rename→set, because `createColor` ignores its args) / `LIB.fill`·`LIB.stroke` (ref-bound paint, readback = `fillColorRefId`) / `LIB.audit` (three-channel inventory: library / token / raw) / `LIB.replace` (raw-hex swap) |
| `scripts/foundations_engine.js` | **Foundations projector — the only producer of `01.xx`/`02.xx` boards** (`storage.FN`): `FN.setContent` (editorial sentences as data) / `FN.project({page,kind[,set]})` — build + shelf-place ONE of 11 boards from the token records (no height argument exists) and stamp it `nl:fn=<kind>` / `FN.bindNext({page})` — bind + gate the next unbound board, call until `allBound` / `FN.check(page)` (incl. `g16`) / `FN.audit()` (the cost report: it must show 0 repair rounds) / `FN.relayout`·`reflow`·`fitRoot` (the stale-hug and shelf repairs the projection needs) / the provenance side `FN.CHAPTER`·`EXEMPT`·`chapterPages`·`boards`·`stampOf`·`kindsOn`·`foreign`·`coverage`·`restamp` — the table the auditor reads, so G16 cannot drift |
| `scripts/icon_engine.js` | **Icon catalog + import engine** (`storage.IC`): `seed`/`add` (JSONL or any SVG) / `get`·`search`·`missing` (alias + camel↔kebab lookup) / `svg` (currentColor substituted) / `place` (import through the origin throwaway; `x/y` = world, no `x/y` = flow) / `grid` (labeled sheet for `01 · Foundations`) — catalog `assets/icons/lucide.jsonl`, decision + licenses in `references/icons.md` |
| `scripts/media_engine.js` | **Raster asset engine** (`storage.MD`) — the channel `IC`/`CF.glyph` do not cover (photographs, logos, screenshots): `MD.config({server})` / `import({path})` / `place({parent, slot, path, x, y, w, h})` → a `fillImage` paint, `fill`/`get`/`find`/`recover` (no media registry exists, so the cache is rebuilt from the shapes) / `audit`. Binary arrives via the project-rooted server's `/b64/<path>` because `uploadMediaUrl` cannot reach loopback; rules **M1–M7** measured in `penpot-capabilities.md` §9.1. `MD.isSlot` delegates to `CF.isMediaSlot` so the gate and the engine share one grammar |
| `scripts/screen_engine.js` | **Screen assembly engine** (`storage.SC`) — gate **G17**, the only screen path on a recreation: `record(screen, spec)` (validates recipe/master/path/text **before** building, returns `gaps`) → `await build({page, screen[, sections, rebuild]})` assembles regions from `LY.recipe` via `NL.fromRecipe`, controls as **library instances** (`SC.ctl` → `CF.instance`; a missing master is a `missing_master` gap, never a re-draw), copy on the ramp with the library type style (`SC.copy` → `TP.apply`), raster from the source (`SC.media` → `MD.place`), then guides + `TK.bindBoard` + the durable `nl:sc`/`nl:rec` stamp. Idempotent by stamp (S7: first call creates, later calls mount), section-limited for the 30 s ceiling (S8), mounts **inside `NN-PageRoot`** (S: a root-level board is invisible to `designPage`). Reads: `audit()` → `ASSEMBLED`/`NOT_ASSEMBLED`, `auditStart`/`auditNext`, `coverage()` → `COMPLETE`/`INCOMPLETE`, `reconcile({dry}`|`{apply:'register'})` → the additive retro-apply. Rules S1–S8 in `engines.md` §8 |
| `scripts/prototype_engine.js` | **Prototype + delivery engine** (`storage.PR`): `flow`/`ensureFlow`, `nav`/`overlay`/`close`/`url`/`delay`, `prototype(links,{flow})` (batch, self-verifying `dropped`), `read`/`clear`, `exports`/`bytes`, `checkpoint`/`versions`/`restore`, `ANIM` presets — rules P1–P4 in capabilities §8/§9 |
| `scripts/repair_engines.js` | Repair engines (**fixStaleCenter** / **groupAssemblies** / **fixZOrder** / alignPage / vAlignPage / fixInner / unclip / cleanOrphans) |
| `scripts/fix_layout.js` | flex-collapse batch repair engine (absRow + fixCol, two-round convergence) |
| `scripts/audit_layout.js` | **Positioning audit engine** (read-only): `auditPage` / `auditAll`, **15 defect signatures + `text_centre_info`** (out-of-bounds/centering residual incl. **stale-center fingerprint**/size degradation/header collision/root-level float/sibling board overlap/text overlap incl. **cross-parent S8b**/**malformed text**/**alignment-not-applied**/**loose assembly**/**stroke covered S12**/**stroke clipped S12b**/**duplicate board S13**; S14 is the tall-copy cause class, caught by S1/S7/S8) + verdict `CLEAN`/`NEEDS_REPAIR` — independent of `audit_design.js`, which owns the 46 design rules |
| `scripts/fix_geometry.js` | **Geometry repair engine** (all support dry-run): `fixColumnOffset` / `fitBoardHeight` / `fixOverflowRight` / **`reflowRows`** / `fitRootHeight` / **`breathe`** (the repair twin of rules 32–34: raises a cramped container to the next `LY.SPACE` member and re-binds a compressed paragraph to its declared leading, aiming at `storage.breathSpec` + `LY.BREATH` so it cannot disagree with the gate; idempotent) / `fixGeometryAll` / `moveSubtree` |
| `scripts/scaffold_structure.js` | 18-page skeleton batch-build script (3-phase queue runner: create pages → PageRoot/Header/Footer → **fit** root height); its `PAGES` table **is** `penpot-structure.md` §2 and `storage.scaffoldContract()` returns it |
| `scripts/pixel_diff.py` | PIL pixel-comparison tool (heatmap + JSON metrics) |
| `assets/penpot-server/` | **Bundled deployment stack**: compose with 7 services + caddy/Caddyfile + 8 ops scripts + README (self-resolving paths, whole dir relocatable) |

## Workflow 1: Code → Design (three starting ways)

**Way A — URL**: web_fetch to survey the target site and key subpages → extract colors/fonts/radii/spacing/shadows/component inventory → define style keywords.
**Way B — images**: read each image and analyze → PIL color quantization to `#RRGGBB` → align spacing to the `LY.SPACE` scale → component and state inventory (missing states filled by convention and labeled "inferred").
**Way C — an existing UI library source tree** (`.tsx` + `.module.less`): read the **full source** of every component first, extract CSS variables into the palette, probe fonts, then the same pipeline (`mcp-automation.md` §5).

Then (shared by both ways, details in `references/code-to-design.md`):

0. **Confirm the two startup tiers — ask both in the same `ask_followup_question` (two questions), not in two rounds**:
   - **Viewport tier** (read `references/viewport-profiles.md` first): target width web / pad / mobile (multiSelect allowed) →
     write into DESIGN.md `targetProfiles` as a hard constraint going forward.
   - **Color mode** (read `references/color-schemes.md` first): `light only` or `light + dark (switchable)` →
     write into DESIGN.md `## Colors` section body.
     **You must clarify "sectional surface polarity ≠ switchable theme" when asking**, otherwise users easily mismatch.
   The two answers together determine the subsequent **token structure**: light only → 1 set, 0 themes;
   two schemes → `<system> · Core` + `<system> · Dark` (Core first) + Scheme group with two themes.
0.5 **[Gate G1] Load the canonical scripts verbatim, in seed order**:
   `scripts/seed_storage.js` (`mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`ct`) → `scripts/layout_engine.js` (`storage.LY`) →
   `scripts/component_factory.js` (`storage.CF`) → `scripts/native_layout.js` (`storage.NL`) → `scripts/token_engine.js` (`TK.*`) →
   `scripts/media_engine.js` (`storage.MD`) → `scripts/screen_engine.js` (`storage.SC`, needs `LY`+`CF`+`NL`+`MD`) →
   `scripts/audit_layout.js` (`auditPage`) → `scripts/audit_design.js` (`designPage`/`designGate`) →
   `scripts/foundations_engine.js` (`storage.FN`, last: it refuses to seed unless `LY`+`CF`+`NL`+`TK` are all live).
   **On a recreation task (`仿写`/`复刻` from a URL, screenshots or a library tree) `MD` + `SC` are not optional extras** —
   they are the only way to satisfy gate **G17**, and a Screens page where `SC` is absent *reports* that instead of passing
   (rule 41), so seeding late is visible in the verdict rather than silent.
   **"Load", not "paste": `execute_code` arguments are capped at ~21 KB**, so the big engines must be fetched from the
   skill's loopback server (`python3 scripts/serve_skill.py`) and built with
   `new Function('storage','penpot','penpotUtils', src)` — full recipe in engines.md §"Seeding without pasting"
   (measured: 259 KB `component_factory.js` seeds in 35 ms). `scaffold_structure.js` and `fix_layout.js` **execute on
   load** (they are runners, and scaffold schedules page switches) — load them only when you mean to run them, and
   re-verify `penpot.currentPage.name` before touching shapes afterwards.
   The order matters: `CF` reads `LY` at seed time and reports `slots:['LY not seeded']` when it is missing;
   `audit_design.js` returns `{ err: 'run … first' }` rather than a false CLEAN; `native_layout.js` reads `LY`/`CF`
   **at call time**, so it tolerates being seeded late. `palette_engine.js` (`LIB`) and `prototype_engine.js` (`PR`)
   depend only on `penpot.library.local` — seed them any time, and re-seed **every** engine after a storage wipe
   (the post-crash order is in engines.md §5). Read each seed's return value: `seeded`, `factories`, `slots`, `fns`.
   **Do not invent your own coordinate/text/layout helpers** — the incident post-mortem in `references/positioning-audit.md`: a temporary
   self-made `mkAbsBoard`/text-box copied the same systematic offset into every page. When something is missing, **add a factory to `CF`
   or a recipe to `LY`**; do not rewrite the ones above and do not hand-build a one-off board in `execute_code`.
1. Produce **DESIGN.md** (skeleton in spec doc §9, Layout section written per `targetProfiles` with grid/margins/touch targets;
   the numbers must be the ones `LY.SPACE` / `LY.ROWS` / the type ramp / `CF.ladder` already use, or an explicit override of them) →
   `npx @google/design.md lint DESIGN.md` until 0 errors.
2. **Connect Penpot MCP** (see next section). Persist the build queue and completed-page list **to disk** (e.g. `build-progress.json`, gate G6).
3. Seed the engines (G1) → `scripts/scaffold_structure.js` builds the 18-page skeleton + PageRoot/header/footer —
   it is a **queue runner**: one batch per call (≤6 pages created per call; one page per call for the PageRoot/Header/Footer
   and the fit phases), **run it repeatedly until it returns `{done:true}`** (`createPage` ignores its name argument, so the
   fixed script assigns `.name` itself and verifies the readback)
   (PageRoot is always 1920: it is the spec-sheet canvas, never a screen).
   **Immediately record Design Tokens [Gate G9]**: `storage.TK.seed(spec)`
   (spec generates 17 TokenTypes from DESIGN.md sections per the mapping in `references/design-tokens.md` §8) →
   `storage.TK.assert()` must PASS (no inactive set, no broken reference).
   **Then `storage.TP.seed()`** — one library **typography style** per declared ramp step, named like its token, so
   素材 → 排版 is not empty: a token set never fills `library.local.typographies`, and rule 30 (`no_type_styles`) fails
   any text-bearing board whose library has 0 styles (design-tokens §5.5).
   ⚠️ Two must-knows: `addSet()` defaults to **`active:false`**, tokens in an inactive set **bind successfully but the value does not take effect (silent failure)**;
   `storage.T` in `seed_storage.js` is only a JS-side color mirror, **it does not create any Penpot token**. See `references/design-tokens.md`.
   For a light+dark answer, build `<system> · Core` + `<system> · Dark` + the `Scheme` group with two themes now — the
   switch is a **theme operation** (capabilities §6), and the proof is the paint: `TK.paint(shapes)` → `TK.activateTheme('Scheme','Dark')`
   → settle → `TK.changed(before, …)` must report `changed ≥ 1` (design-tokens §9.1).
   **Also seed the library-color channel**: `storage.LIB.seed(spec)` from the same palette — `LIB.fill`/`LIB.stroke` bind
   refs that repaint on one `c.color` write, and `LIB.audit(shapes)` later tells you which channel each fill uses.
4. **[Gate G2/G3] Pilot the first board, then batch**: project the first board of `01 · Foundations` **and of
   `02 · Color in use`** (both are `FN.CHAPTER` chapters, so both are G16-gated the same way) → `storage.auditPage()` must have no
   `out_of_bounds` / `header_collision` → immediately export and eyeball that there is no overall offset → only then allow batch building.
   During batch, **run a single-board audit right after each board is built** (only this board's findings), do not copy the same offset into 100+ boards.
   Fill page by page, in contract order:
   - `01 · Foundations` (palette / type ramp / spacing / grid / radius / elevation / strokes) and `02 · Color in use`
     (semantic roles, state layers, the contrast matrix, data colors) — later pages reference them.
     **[Gate G16 · projection is the ONLY way a Foundations/Color board is built — there is no composed alternative]**
     `storage.FN` is not an optimization suggestion: every board on the `01.xx` / `02.xx` pages is emitted by it, and the
     skill ships no other path. Call shape: `FN.setContent({usage, rules, notes, …})` for the editorial sentences →
     `FN.project({page, kind[, set]})` **one kind per call** → `FN.bindNext({page})` **until `allBound`** →
     `FN.check(page)`. There is no height argument to pass and no hex to type: values come from `TK.declared()` and a
     missing token kind is a **refusal**, while the board height is the hug sum Penpot itself computes. A second colour
     scheme is one more projection with `set:` the dark token set, not a second builder.
     **The gate is machine-read, in two scopes**: each projected board carries `nl:fn=<kind>` as pluginData *inside the
     file*, auditor rule 31 **`not_projected`** fails any board on a chapter page without that stamp — including one
     parked at the page root beside the `NN.MM-PageRoot` (`FN.strays`) — and
     `storage.designCoverage()` fails the file when a chapter kind was never projected (pagination is block-per-page, so
     coverage is a file question). `Icons` and `Light vs dark` are the two **declared** exemptions (`FN.EXEMPT`), because
     neither is one record type; everything else that is hand-drawn is a defect — and if `storage.FN` is not seeded, the
     rule *reports* rather than passing. When a board kind does not exist yet, **add the projector to `FN`**, never draw
     the board inline. Full call shape, enforcement mechanics and measured cost in `engines.md` §7 / §7.1.
   - `03–09` component spec boards: **one `CF.matrix(...)` call per family of `CF.map()`**, shelves placed by `LY.pack`.
     **[Gate G12]** `CF.missing()` must be `[]` and each spec board must pass `state_coverage` / `variant_sparse` /
     `focus_ring_missing` — a variant nobody can produce is a missing factory, never a hand-drawn rectangle.
   - `10 · App shell & chrome` (the `CF.map().shell` composites + one anatomy board per `LY.slots` key),
     `11 · Grid & breakpoints` (one diagram board **per selected tier** from `LY.TIERS`),
     `12 · Screen recipes` (one annotated skeleton per `LY.keys()`, drawn with `LY.drawStart`/`drawStep`, + the tier-gate table).
   - `13 · Component index` + `component-map.json` (generated from `CF.map()` / `CF.variants`, not typed by hand).
   - `14–16 · Screens`: **[Gate G17 · on a recreation, `SC.record` → `SC.build` is the ONLY screen path]** when the user
     gave a URL, screenshots or a library source tree, write what the source shows into a record and let the engine assemble
     it: `SC.record('home', { src:'https://example.com/home', tier:'web', recipe:'hero', sections:[{ region, controls:[…], copy:[…], media:[{slot,path}], icons:[…] }] })`
     (validation happens **now**: an unknown recipe, a control with no master, a slot with no path each come back in `gaps`), then
     `await SC.build({ screen:'home', page:'14 · Screens · app', sections:[…] })` — one call per section is how you stay under the
     30 s ceiling, because the board is found again by its `nl:sc` stamp and later calls **mount** into it. What that call guarantees:
     regions from `LY.recipe` via `NL.fromRecipe`, controls as **library instances** (`SC.ctl` → `CF.instance`, never a re-draw;
     a missing master is reported as `missing_master` so you extend the factory per G12), copy on the ramp carrying the library
     type style (`SC.copy` → `TP.apply`), raster as the user's own asset (`SC.media` → `MD.place`), then `TK.bindBoard` and the
     durable `nl:sc`/`nl:rec` stamp. Accept with `SC.audit()` reading `ASSEMBLED` and `NL.auditFlow(board)` reading `CLEAN`.
     **[Gate G11]** still holds inside that path: one board per recipe × **tier the recipe accepts** (`LY.recipe` returns
     `{ err, use }` otherwise — follow the `use` pointer, never squeeze), height from the recipe's `totalH`, each board gets
     `LY.fold(board, tier)`, and `CF.tier` is set per board before building.
     **Absolute authoring of a screen is only legal for a *new* recipe the file has never had**, and then it is still
     `NL.fromRecipe` + `NL.add(region, control, 'fix','fix')` (**`fix`, never `auto`** — a board's `auto` is hug and collapses to
     the label) + `CF.instance`, never typed coordinates. A freehand screen fails `no_source_record` (rule 41) and any control
     drawn without a master fails `not_assembled` (rule 39).
5. **[Gate G10 · components before groups — not just grouping]** Register the library as the spec pages are built:
   `CF.autoRegister({ limit: N, states: false })` per spec page promotes every **default-state** control host to a real
   Penpot main component (idempotent; returns `{registered, already, skipped, library}`). `CF.libraryCount() > 0` is the
   proof the library exists — a gate that only inspects groups cannot distinguish a screen built from masters from one
   built from copies. From then on, on any **composed** page a host whose name already has a master and is drawn again is
   `not_component` (the redrawn copy cannot be fixed, swapped or variant-driven). Two ways to clear it: place
   `CF.instance(name, {parent, absolute, resize, text})` at build time, or repair an existing file in place with
   `storage.componentize({ apply: true })` (same parent/box/z, text overrides copied by text-layer name; flow children are
   reported as `flow`, never silently re-laid). Spec boards are exempt by contract — they are where the masters live.
   The master's own head is exempt (the gate compares ids), so registering never indicts the host it came from.
   Manual registration remains `CF.component(host)` (**the tag must be a child element of the master board**, otherwise
   registration yields an empty-shell component; `createComponent` does **not** copy — the host *becomes* the main instance).
6. **[Gate G4] Finish page by page, fixed order**: `cleanOrphans()` → `fixStaleCenter()` → `alignPage()` → `vAlignPage()` → `fixInner()` → `unclip()` → `groupAssemblies()` → `fixZOrder()`;
   (`fixStaleCenter` fixes the large offset from "centering computed from the transient width/height at creation moment" baked into coordinates, must run before `alignPage`; text centering always `await storage.ct(...)` or `storage.centerIn(t, host)`, see positioning-audit.md S2)
   **[Gate G10b · assembly ownership]**: a complete set of primitives (base plate + label + icon) must be **grouped or made a component, no loose same-level stacking**
   — reuse/registration that enters the 13 index becomes a component (screens **place an instance**: `CF.instance(CF.name(…))`
   + `CF.swap` for state switches — instancing is scriptable, api-pitfalls §6; a `CF` factory re-call is the fallback when
   no master exists), one-off use `penpot.group(...)` groups them;
   judgment and naming contract in `penpot-structure.md` §4.3, audit signature `loose_assembly` (S11), repair engine `groupAssemblies()` (idempotent, at the end of the G4 chain).
   Record the repair log `[position, content, axis, offset]` for manual review, then restore deliberately non-centered elements per `engines.md` §1.
   **[Gate G14 · bind at birth]** no board is "done" when it is drawn: `runOne`-style builders must call
   `TK.bindBoard(board, { snapSpace: true })` (or `TK.bindPage(page)`) **after the render pass and before the gate**, and
   `TK` must be seeded *before* the first board (G9). A colour typed as hex is not a token: the gate reads
   `tokens.fill` / `tokens.strokeColor` / `tokens.typography` / `tokens.rowGap`, never the hex. Backfill sweep:
   `TK.bindPage(name, { snapSpace: true, from, count })`, batched — one page per call.
   **[Gate G15 · guides at birth]** a board at a tier baseline width is a **screen**: give it native guides before the
   audit sees it — `LY.guides(board, { tier })` (12/8/4 columns from `LY.TIERS` + a fold ruler). Never draw column
   rectangles. Backfill: `storage.seedGuides({ apply: true, tier })` (idempotent, tier-width boards only); the gate
   signature is `no_guides`.
   **[G11 · fill leaves, not panes]** a region that *contains* another region is structure — fill `LY.leaves(plan.regions)`,
   never the pane itself. Filling `dashboard.content` drew the article underneath the KPI row, the chart and the table
   (`pane_filled`); the same trap exists in `readingPane`, `container`, `main` and every scroll area.
   **[vertical reservations]** text height is `CF.lineH(fs)`, never `fs`: a text layer renders at `fs × ramp leading`
   (body 1.5, display 1.15). Reserving `fs` for a wrapped label and then stepping by `fs + 6` is how tall (stacked) buttons
   and step items grew past their host and overlapped the next one (S14).
7. **Recompute + accept [Gate G5 + G13 + G16 + G17]**: two independent auditors must both read CLEAN, per page, with the scope named in contract §2:
   `storage.auditPage()` (positioning) and `storage.designGate({ tier | families })` (the 46 design rules — grid, scale, rhythm, ramp,
   contrast, touch floor, split ratio, state/variant coverage, fold marker, token binding, guides, pane fill, component use,
   **the whitespace trio `cramped_gap`/`hierarchy_gap`/`text_cramped`** (§2.1: whitespace is the first separation device, for gaps
   *and* for leading/paragraph air) **, the radius pair `radius_off_ladder`/`radius_unbound` + `ring_off_host`/`ring_detached`,
   the G16 provenance rule `not_projected` and the G17 assembly trio `not_assembled`/`placeholder_media`/`no_source_record`**;
   when `storage.FN` is seeded `designGate` also runs the file-level
   `designCoverage()`, which is the only check that can see a chapter missing a board, and when `storage.SC` is seeded
   `SC.coverage()` is the only check that can see a screen whose declared entries never became masters or assets).
   Run the gate over **every top-level board of the page** (`designStart`/`designNext`), not only the head board: `designPage({})`
   audits `headOf(root)` alone, so a second board at page root reads CLEAN while its neighbour is never judged.
   A `designGate` that returns `{ err: 'run … first' }` is not a CLEAN.
   Whitespace findings repair in place with `storage.breathe({ apply: true })` (dry-run first; idempotent; it raises the container
   gap to the next `LY.SPACE` member and re-binds a compressed paragraph to its declared leading, then re-fits board and root heights).
   Every **screen** additionally carries `storage.NL.auditFlow(board) === 'CLEAN'` (flow authoring: settled, sized, no dropped declarations).
   Remaining findings must each be manually confirmed as deliberate. Then export PNG per board (or a contact sheet per page) and accept against the
   self-check list (pages 14–16 accepted per recipe × tier).
   **Boards never exported must not be described as "verified"**.
   Also run `storage.TK.audit()`, and on **at least one real shape** do
   `await storage.TK.apply(tokenName, [shape])` and confirm `ok:true` is returned —
   **"no error" ≠ "took effect"**: wrong set-activation state or inapplicable shape both silently no-op; the only verdict is readback.
   With two schemes, prove the switch on the **paint** (`TK.paint` → `TK.activateTheme` → `TK.changed`, design-tokens §9.1)
   and re-export after switching.
   If the delivery ships interactive: `storage.PR.prototype(links, { flow: 'Task · …' })` first (a named flow beats the
   auto-generated `Flow N`), then confirm every row reports `dropped:false` and `PR.flows()` shows only your names;
   set `PR.exports(board, presets)` per screen so the file leaves batch-export configured, and take a `PR.checkpoint(label)`
   before any risky batch — **only `ok:true` counts**, because `saveVersion` can be silent (capabilities §9).

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

Entry: Penpot file + DESIGN.md + page `13 · Component index` (`component-map.json`).

> **Confirm the tech stack first**: before entering this flow use `ask_followup_question` to ask `targetStacks` (two levels: platform family → framework,
> multiSelect depending on whether multiple stacks), write into DESIGN.md. No codegen without confirmation; defaulting to React/Web forbidden. See `references/stack-profiles.md`.

**Implementation organization (industry convention, same for all stacks)**: implement **layered by the component index** — tokens layer → atoms (Button/Input…) → composites (SearchBox/FormField…) → modules (TopNav/DataTable…) → pages (aligned to the screen boards of each selected tier on pages `14–16`). Component names map 1:1 to Penpot; accept with PIL immediately after each layer lands before moving to the next.
**Carry the engines across, not just the pixels**: the recipe that produced a screen board (`LY.recipe(key)`) is the page's
region table, the ladder a control came from (`CF.ladder(size)`) is its CSS/Qt geometry, and `design-guide.md` is the
review checklist — reuse them instead of re-deriving spacing from the screenshot.
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
- Icons: SVG preferred (`currentColor` coloring follows tokens), names consistent with the `01 · Foundations` **Icons** board (its pitches are `CF.glyphKinds` on `CF.iconSquare`, so the code icon set takes the same names); icon buttons = annotated icon size + padding, centering error ≤1px.
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
- Finally compare each screen board of pages `14–16` **per recipe × selected tier** as a whole page, output a component × metric summary table.
