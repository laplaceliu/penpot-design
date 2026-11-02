---
name: penpot-design
description: "V3 component-first, token-driven design-system workflow for Penpot MCP. A component is a declarative definition (props, states, slots, anatomy, token-role bindings); factories render it; tokens are the only source of color, type, corner, spacing and elevation; a screen is an assembly of component instances. Built in: a 41-role token contract, 24 core components, a 125-family codesign-ui catalog pack with source-anatomy support, and the storage.CK runtime (load / build / master / instance / buildPack / matrix / rebind / theme / audit). Use when the user asks to generate a Penpot design system or component library, create or re-theme components through design tokens, build a screen as an assembly of component instances, recreate a React/UI library, batch-build or repair Penpot components, prove a light/dark token theme by repaint, export components for design-to-code, or connect the Penpot MCP. Supports URL / screenshots / source-tree entry, Web/Pad/Mobile tiers, light-only or switchable light+dark themes, and any GUI tech stack (Qt, Web, LVGL, imgui, MAUI, Flutter, SwiftUI, Compose…). Do not use for general coding unrelated to Penpot or design systems."
version: 3.0.0
license: MIT
---

# penpot-design: token-driven components

The component is the unit of design. A **component definition** owns its props, states, slots, anatomy and token-role
bindings. A **factory** is only the renderer. A **token** is the only way material, type, corner, spacing or elevation
changes. A **screen is an assembly of component instances**.

```
tokens → components → assemblies → screens
```

## File map

```
SKILL.md
assets/
  components/        token-contract.json · core.json · catalog.json
  libraries/         codesign-ui.json · codesign-ui.anatomy.json · codesign-ui.map.json
  icons/             lucide.jsonl (1966 icons, ISC)
  penpot-server/     local Penpot deployment stack
references/
  component-system.md        THE component contract (schema, roles, binding, lifecycle, audit)
  design-principles.md       spacing, type, color, states, elevation, corners, touch
  design-tokens.md           Penpot token mechanics (17 types, sets, themes, apply/readback)
  design-md-spec.md          DESIGN.md frontmatter/body schema, lint, template
  designmd-tokens.md         DESIGN.md ↔ Tokens-panel DTCG JSON, sidecar, round trip
  runtime.md                 MCP connection, seed order, execute_code discipline, delivery
  layout.md                  LY regions + NL flow + screen assembly with CK instances
  viewport-and-themes.md     Web/Pad/Mobile tiers, light/dark token themes
  catalog-pack.md            131-family catalog, anatomy support, regeneration
  code-to-design.md          URL / images / source tree → tokens → components → screens
  api-pitfalls.md            Penpot API traps (coordinates, paths, text, tokens, components)
  icons.md                   icon channels and the bundled Lucide catalog
  verification.md            export + PIL pixel acceptance
  design-to-code-generic.md  codegen discipline shared by all stacks
  stack-profiles.md · stacks/ stack selection, adapters, prompts
scripts/
  component-engine.js        storage.CK — the component runtime
  component-factory.js       renderer library (75 factories)
  token-engine.js            storage.TK / TP — tokens, themes, typography styles
  elevation-engine.js        storage.EL — shadow recipes and binding
  layout-engine.js           storage.LY — tiers, regions, recipes
  native-layout.js           storage.NL — flex/grid authoring
  icon-engine.js             storage.IC — Lucide catalog → vectors
  media-engine.js            storage.MD — raster assets
  anatomy-engine.js          storage.AN — source anatomy renderer
  catalog-engine.js          storage.LM — catalog manifest + anatomy boards
  prototype-engine.js        storage.PR — optional prototype links/exports
  seed-storage.js            mkAbsBoard / absMount / mkText helpers
  serve-skill.py             loopback/CORS server for execute_code
  pixel-diff.py              PIL acceptance
  designmd-tokens.py         DESIGN.md ↔ Penpot Tokens JSON converter
  build-component-catalog.py catalog.json generator
  validate-components.py     offline component-asset validator
  inventory-library.py       host-repo component inventory (maintenance)
  extract-anatomy.js         source anatomy extractor (maintenance)
```

## Naming

One scheme per class: **components = PascalCase** (`Button`, `FAB`, `JSXPreview`), **props/slots/part keys/JSON
fields/JS APIs = camelCase** (`iconOnly`, `inkBar`, `buildPack`), **files = kebab-case**
(`component-engine.js`, `token-contract.json`), **tokens/roles = dot + kebab-case** (`color.text-muted`,
`color.brand-ink`, `radius.control`), **enum values/groups/states = lowercase** (`primary`, `actions`, `hover`).
The `·` in a Penpot layer name (`Button·Danger`) is a separator, not a casing style. Role resolution normalizes
case/separators, so old camel token names still resolve; new tokens use kebab-case.

## The four layers

| Layer | Owned by | Never contains |
|---|---|---|
| Tokens | `TK.seed` + live token sets/themes | a hex typed at a component call site |
| Components | `assets/components/*.json` + `storage.CK` | a one-off drawing or a page layout |
| Assemblies | `LY.recipe` + `NL` + `CK.instance` | a redrawn control or a raw band |
| Screens | a board on a `Screens` page | typed control geometry |

## Token contract

`assets/components/token-contract.json` defines **41 semantic roles**. A component references a role; the runtime
resolves it to a live token by declared name, alias, or normalized name.

```json
"color.brand":   { "type": "color", "token": "color.primary",
                   "aliases": ["color.brand", "color.accent"] },
"radius.control":{ "type": "borderRadius", "token": "radius.full",
                   "aliases": ["radius.pill", "radius.control"] },
"type.label":    { "type": "typography", "token": "type.label",
                   "aliases": ["type.label-md", "type.button"] }
```

- A missing **required** role is reported (`CK.contract().requiredMissing`), never guessed.
- A project may rename tokens; put its names in `aliases`. Components do not change.
- A role is shared. A one-off value belongs in the value-bound fallback, not in a new role.

## Component packs

| Pack | Contents |
|---|---|
| `core` | **24 hand-authored components**: Button, IconButton, Link, FAB, Input, Textarea, Select, Search, Checkbox, Radio, Switch, Slider, Badge, Chip, Avatar, Card, Progress, Tabs, Breadcrumb, Pagination, Alert, Toast, Tooltip, Modal. |
| `catalog` | **131 codesign-ui families** (125 visual + 6 behaviour-only): 69 factory renderers, 56 source-anatomy renderers, 6 index-only. Optional; loaded only for a 1:1 library recreation. |

A definition carries:

- **props** — requested variants; **defaults** are factory arguments;
- **states** — the axes a spec matrix and audit inventory use;
- **slots** — named anatomy slots;
- **requires** — semantic roles the component expects;
- **bindings** — role pins on named parts (`host`, `label`, `field`, `box`, `track`, `ring`…), with optional `when`
  conditions;
- **renderer** — `factory` (default) or `anatomy` (catalog custom families).

`CK.inventory()` prints the contract as data. `python3 scripts/validate-components.py` validates the registry offline.

## Runtime

Seed once per session (storage is volatile):

```text
seed-storage.js → layout-engine.js → component-factory.js → native-layout.js → token-engine.js
→ elevation-engine.js → icon-engine.js → media-engine.js
→ [anatomy-engine.js → catalog-engine.js]        (only for the catalog pack)
→ component-engine.js
```

Load assets through the skill server (execute_code arguments are capped at ~21 KB):

```bash
python3 scripts/serve-skill.py            # 127.0.0.1:8777, serves this skill dir
```

```js
// seed
for (const f of ['seed-storage.js','layout-engine.js','component-factory.js','native-layout.js',
                 'token-engine.js','elevation-engine.js','icon-engine.js','media-engine.js',
                 'component-engine.js']) {
  const src = await (await fetch('http://127.0.0.1:8777/scripts/' + f)).text();
  new Function('storage','penpot','penpotUtils', src)(storage, penpot, penpotUtils);
}

// registry
const contract = await (await fetch('http://127.0.0.1:8777/assets/components/token-contract.json')).json();
const core     = await (await fetch('http://127.0.0.1:8777/assets/components/core.json')).json();
storage.CK.loadContract(contract);
storage.CK.load(core);                         // pack: core

// 1:1 catalog (optional)
// const catalog = await (await fetch('http://127.0.0.1:8777/assets/components/catalog.json')).json();
// storage.CK.load(catalog, {pack:'catalog', keep:true});

// build one master as a smoke test, then the pack in resumable batches
await storage.CK.master('Button', {}, {x:80, y:80});
await storage.CK.buildPack('core', {x:80, y:80, columns:3, limit:6}); // repeat with {start: next} until done

// gates
storage.CK.audit({pack:'core'});               // CLEAN | NEEDS_REPAIR
await storage.CK.theme('Scheme','Dark');       // changed > 0
```

Key API:

| Call | Result |
|---|---|
| `CK.loadContract(json)` / `CK.load(registry,{pack,keep})` | load roles and definitions |
| `CK.contract()` / `CK.inventory({pack})` / `CK.plan(pack)` | health, inventory, build plan |
| `CK.master(id, props, o)` | build + bind + register; idempotent by master name |
| `CK.instance(id, props, o)` | place the exact master; `fallback:true` when only the base head exists |
| `CK.buildPack(pack, o)` | resumable grid build; call until `done` |
| `CK.matrix(id, o)` | one `Family·Spec` board |
| `CK.rebind(pack, o)` | re-apply roles + value bindings after a token value change |
| `CK.theme(group,name,o)` | switch a token theme and prove the paint changed |
| `CK.audit({pack})` | contract + definitions + masters + unbound census |
| `CK.describe(id)` | definition + resolved roles + variant masters |

Read every result: `load().issues`, `master().reused`, `instance().fallback`, `audit().verdict`, `theme().changed`.

## Workflow A — tokens → component library

1. **Ask together at startup**: viewport tier(s) — Web 1440 / Pad 834 / Mobile 375 — and color mode — light only or
   switchable light+dark. Clarify that “sectional dark regions in one page” is not a theme.
2. **Write DESIGN.md** (frontmatter tokens + prose), then `npx @google/design.md lint DESIGN.md` until 0 errors.
   The `elevation:` block is machine data: recipes (`drop` + `inner` + `sheen`) and family roles.
   Write token keys in **kebab-case** (`text-muted`, `primary-ink`, `surface-alt`).
3. **Tokens-panel interchange (optional)**: `python3 scripts/designmd-tokens.py to-penpot DESIGN.md -o tokens.json --set-name "<system> · Core" --kebab-names`
   produces DTCG JSON for Penpot's `TOKENS → Tools` import. The UI import **replaces all tokens/sets/themes**; export
   a backup first. Reverse with `to-design` and `--base DESIGN.md --meta-out …`. Details: `references/designmd-tokens.md`.
4. **Seed the runtime**: `TK.seed(spec)` → `TK.assert()` → `TP.seed()` for library typography styles. This is the MCP
   path; it is separate from the UI JSON import. For a switchable theme, build `<system> · Core` + `<system> · Dark`
   (Core first) + a `Scheme` group and prove the switch on the paint (`TK.paint` → `TK.activateTheme` → `TK.changed`).
4. **Load contract + core registry**; `CK.load().issues` and `CK.contract().requiredMissing` must be empty.
5. **Smoke one master**, read `bind.failed` / `coverage.unbound`; then `CK.buildPack('core',{start,limit})` until done.
6. **Audit** `CK.audit({pack:'core'})`. A `NEEDS_REPAIR` verdict names the missing master, missing component role or
   unbound paint. Fix the definition/factory/token set; never hand-draw the missing component.
7. **Accept visually**: export a contact sheet / individual masters; `CK.theme(...).changed > 0` for a switchable
   scheme.

The detailed visual rules are in `design-principles.md`; they are guidance for token/component choices, not a second
gate system.

## Workflow B — components → screens

```js
const plan  = storage.LY.recipe('dashboard', { tier:'web' });
const board = storage.NL.fromRecipe(plan, { parent: screensPage });

await storage.CK.instance('Button', { type:'primary' }, {
  parent: plan.region('header'), absolute: { x: 24, y: 16 }, text: 'New report'
});
await storage.CK.instance('Card', {}, { parent: plan.region('content'), absolute: { x: 0, y: 0 } });
```

Rules:

- A control with a master is **placed**, never redrawn. A missing variant is a definition/factory extension, then a
  rebuild; never a one-off rectangle.
- A band (direct child ≥40% of the screen width and ≥56 high) is a component copy; ≥50% of a screen's structural
  children are copies.
- Regions come from `LY.recipe`; flow from `NL`; controls from `CK.instance`; copy from the declared ramp; raster from
  `MD.place`; icons from `IC.place` / `CF.glyph`.
- Set `CF.tier` before building a screen (`web`/`pad`/`mobile`) so touch floors follow the tier.
- `CK.instance` reports `fallback:true` when the exact variant master is absent. Treat that as a finding.

A screen is accepted when instance fallbacks are 0 for the controls the source shows, `NL.auditFlow(board) === 'CLEAN'`,
and an export is compared against the source (`verification.md`).

## Workflow C — Design → Code

`CK.inventory({pack})` is the codegen index; `CK.describe(id)` is the component's prop/state/role contract.

- Order: **tokens → atoms → composites → screens**. Code names map 1:1 to Penpot component heads.
- Read `targetProfiles`, `targetStacks` and the color mode from DESIGN.md first. **Do not default to React/Web**;
  ask for the stack before codegen (`stack-profiles.md`).
- A code component consumes the same token roles; it never copies a hex from a screenshot.
- Assets: export @1x/@2x from the Penpot component; icons follow the `Foundations` icon names; solid fills/radii/
  shadows are drawn in code.
- Acceptance: `python3 scripts/pixel-diff.py design/X.png impl/X.png --threshold 12 --max-diff-ratio 0.002`;
  whole page ≤0.5%, component ≤0.2%; a size mismatch is an immediate reject.

## Re-theming

Three legal changes, all preserving component geometry:

1. **Change a token value** (`TK.put` / `TK.seed`). Every bound paint follows; after a value replacement run
   `CK.rebind(pack,{start,limit})` until done.
2. **Switch a theme** — `CK.theme(group,name)`; pass is `changed > 0`.
3. **Re-map a role** — point a role at a different token in the contract, then rebuild/rebind.

Not token-driven: typed width/height/padding, a multi-fill state overlay alpha, a gradient stop list, a shadow applied
outside `EL`, a radius written after build. Report these; do not call them themed.

## Verification

| Gate | PASS |
|---|---|
| Contract | `CK.contract().requiredMissing` empty; every component `requires` role resolves |
| Definitions | `CK.load().issues` and `CK.audit().defIssues` empty |
| Masters | every visual definition has its base master (`missingMasters` empty) |
| Binding | `unbound.fill/stroke/typography/radius` = 0; `unbound.shadow` reported (0 when shadows are declared) |
| Instances | screen controls are copies; `fallback` = 0 for variants the source shows |
| Theme | `CK.theme(...).changed > 0` for a switchable scheme |
| Visual | exported contact sheet / screen comparison; boards never exported are not “verified” |

Run `python3 scripts/validate-components.py` before delivery. `CK.audit` is the component-layer gate; `auditFlow` and
the PIL diff cover layout and copy fidelity. Live-verified on Penpot 2.18.3 (2026-11-02): 24/24 core masters,
`CK.audit` CLEAN, 0 unbound fill/stroke/type/radius, theme repaint 65 shapes, exact variant instances `fallback:false`.

## Extending

1. **New variant** — add the prop value (and a factory branch if the renderer cannot draw it), then `CK.master(id,{…})`.
2. **New family** — add a definition to the registry: id/name/group/factory (or `custom` + anatomy), props, states,
   slots, `requires`, `bindings`; validate with `CK.extend(def)` or `validate-components.py`; build the master.
3. **New renderer** — add a factory to `storage.CF` or a `custom` anatomy; never draw the component inline on a screen.
4. **New role** — add it to the contract, map it to a live token/alias, list it in `requires`.

The catalog inventory is fixed at 125 visual + 6 behaviour-only families for a 1:1 codesign-ui recreation
(`catalog-pack.md`). A source profile may change material/geometry inside a family, never add/remove/reorder one.

## Startup questions

1. **Viewport tier** — Web 1440 / Pad 834 / Mobile 375 (multiSelect). Write into DESIGN.md `targetProfiles`.
   `1920` is the spec-sheet canvas, never a screen width.
2. **Color mode** — light only, or switchable light+dark. Ask in the same batch as the tier; state the difference
   between sectional polarity and a theme. Write it into the `## Colors` body.
3. **Tech stack** — only before Design → Code: platform family, then framework. No codegen without a confirmed
   `targetStacks`.

## Penpot / MCP

The skill **does not install Penpot by default**. Probe first:

1. `assets/penpot-server/scripts/status.{sh,ps1}` or
   `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags`.
   200 → running; container stopped → `up.{sh,ps1}`; no deployment → full install.
2. `.mcp.json` has a `penpot` entry (`https://penpot.local/mcp/stream`) and `NODE_EXTRA_CA_CERTS` points at the
   stack's `data/caddy/pki/authorities/local/root.crt`. Configured + reachable → verify; configured + down → start;
   not configured → configure + `trust-ca` + restart the client.
3. Confirm with the user before reuse / start-only / full install.

- Deployment: `assets/penpot-server/` (compose + Caddy, relocatable). Linux/macOS `scripts/*.sh`, Windows `scripts/*.ps1`;
  `create-profile` first; `https://penpot.local` (the account that script created; its defaults are
  `admin@penpot.local` / `penpot123`, but a deployed instance may have changed the password).
- MCP tools: `execute_code` / `export_shape` / `high_level_overview` / `penpot_api_info`.
- **Suspended plugin tab**: the MCP bridge logs `Duplicate connection … rejecting` while the old tab is stale.
  Restart `penpot-server-penpot-mcp-1`, then click `MCP → 在此连接` in the toolbar; a tab reload also works but clears
  `storage` and selection, so re-seed.
- **execute_code**: arguments ≤~21 KB; load engines via `serve-skill.py` + `new Function`; storage is volatile; ≤8
  primitives / ≤10 texts per call; one page/section per heavy call; verify async page switches.
- **Check `penpot_api_info` before writing an attribute; read back after.** A wrong property name silently no-ops.
  See `api-pitfalls.md`.

## Reference map

| Read | For |
|---|---|
| `component-system.md` | authoritative component contract, roles, binding, lifecycle, audit, live-verified facts |
| `design-principles.md` | spacing, type, color, states, elevation, corners, touch, iconography |
| `design-tokens.md` | Penpot token mechanics (17 types, sets, themes, apply/readback, paint proof) |
| `design-md-spec.md` | DESIGN.md schema, lint, template |
| `designmd-tokens.md` | DESIGN.md ↔ Tokens-panel DTCG JSON, sidecar, round trip |
| `runtime.md` | MCP connection, seed order, execute_code discipline, delivery, clean file layout |
| `layout.md` | `LY` regions/recipes, `NL` flow, screen assembly with `CK.instance` |
| `viewport-and-themes.md` | tiers, light/dark themes, artifact mapping |
| `catalog-pack.md` | 131-family catalog, anatomy support, regeneration, validation |
| `code-to-design.md` | URL / images / source-tree entry pipeline |
| `api-pitfalls.md` | measured Penpot traps and component/token limits |
| `icons.md` · `verification.md` | icons, PIL pixel acceptance |
| `design-to-code-generic.md` · `stack-profiles.md` · `stacks/*` | codegen discipline and stack adapters |
