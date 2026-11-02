# Component system — the v3 contract

> A component is a declarative definition. A factory renders it. A token is the only source of material, type, corner,
> spacing and elevation. A screen is an assembly of component instances.

## 1. Four layers

```
tokens  →  components  →  assemblies  →  screens
live token records   definitions + masters   instances + regions   boards
```

| Layer | Owned by | Never contains |
|---|---|---|
| Tokens | `TK.seed` + sets/themes | a hex typed at a component call site |
| Components | `assets/components/*.json` + `CK` | a one-off drawing or a page layout |
| Assemblies | `LY.recipe` + `NL` + `CK.instance` | a redrawn control or a raw band |
| Screens | a board on a `Screens` page | typed control geometry |

## 1.1 Naming

One scheme per identifier class; no mixed casing inside a class.

| Class | Convention | Examples |
|---|---|---|
| Component ids/names | **PascalCase** | `Button`, `IconButton`, `Textarea`, `Modal` |
| Acronym component names | PascalCase with the established acronym kept uppercase | `FAB`, `KPI`, `JSXPreview` |
| Props, slots, part selector keys, JSON fields, JS APIs | **camelCase** | `iconOnly`, `surfaceRaised`, `iconStart`, `inkBar`, `buildPack` |
| Files and directories | **kebab-case** | `component-engine.js`, `catalog-pack.md`, `token-contract.json` |
| Token names and semantic roles | **dot + kebab-case** | `color.text-muted`, `color.brand-ink`, `radius.control`, `type.label` |
| Enum values, groups, states | **lowercase** | `primary`, `actions`, `hover`, `default` |
| Penpot layer/component separator | `·` (display separator, not a casing style) | `Button·Danger`, `ring·focus` |

- Source part inventory names (`AccordionItem`) are proper names and stay PascalCase; the selector keys used by
  component definitions (`inkBar`, `trackActive`) are camelCase.
- Role resolution normalizes case and separators, so an existing file declaring `color.textMuted` still resolves to
  `color.text-muted`. Camel aliases in the contract are compatibility only; new tokens use kebab-case.
- Do not introduce `color.primaryInk`-style camel token names in new DESIGN.md files or token sets.

## 2. Token contract

`assets/components/token-contract.json` defines 41 roles. A component references a role; `CK.roleToken` resolves it to
a live token by:

1. the declared token name;
2. an alias;
3. a normalized match across active tokens (case, `-`, `_`, `·`, `.` ignored).

```json
"color.brand":   { "type": "color", "token": "color.primary",
                   "aliases": ["color.brand", "color.accent"] },
"radius.control":{ "type": "borderRadius", "token": "radius.full",
                   "aliases": ["radius.pill", "radius.control"] },
"type.label":    { "type": "typography", "token": "type.label",
                   "aliases": ["type.label-md", "type.button"] }
```

Rules:

- **A missing required role is reported, not guessed.** `CK.contract().requiredMissing` is the gate.
- **A project may rename tokens.** Put its names in `aliases`; definitions do not change. `color.primary-ink` and
  `color.primary-ink` resolve to the same role.
- **A role is shared.** A one-off value belongs in the value-bound fallback, not in a new role.
- **Role names are semantic, not material.** `color.danger` is the readable danger ink; `radius.control` is the
  project's control corner, whatever its numeric value.

## 3. Component definition

```json
{
  "id": "Button",
  "name": "Button",
  "group": "actions",
  "factory": "button",
  "props": {
    "type":  { "values": ["primary", "secondary", "danger", "ghost"], "default": "primary" },
    "size":  { "values": ["xs", "sm", "md", "lg", "xl"], "default": "md" },
    "state": { "values": ["default", "hover", "focus", "pressed", "disabled"], "default": "default" }
  },
  "defaults": { "label": "Button", "type": "primary", "size": "md", "state": "default" },
  "states": ["default", "hover", "focus", "pressed", "disabled"],
  "slots": ["iconStart", "iconEnd", "iconOnly", "loading"],
  "requires": ["color.brand", "color.on-brand", "color.surface", "color.text",
               "radius.control", "type.label"],
  "bindings": [
    { "part": "host",  "prop": "fill", "when": { "type": "primary" }, "role": "color.brand" },
    { "part": "host",  "prop": "borderRadius", "role": "radius.control" },
    { "part": "label", "prop": "typography", "role": "type.label" },
    { "part": "label", "prop": "fill", "when": { "type": "primary" }, "role": "color.on-brand" },
    { "part": "ring",  "prop": "strokeColor", "when": { "state": "focus" }, "role": "color.focus" }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` / `name` | Stable identity. The base master is the bare head (`Button`); a non-default variant appends `·` segments (`Button·Danger`). |
| `group` | `actions`, `forms`, `selection`, `data`, `navigation`, `feedback`, `ai`, `utility`. |
| `factory` | Renderer key in `storage.CF` (`button`, `input`, `card`…) or `custom` for source anatomy. |
| `renderer` | `factory` (default), `anatomy`, or `none` (behaviour-only catalog entries). |
| `props` | Documented axes and defaults; `defaults` are the factory arguments. Unknown props pass through. |
| `states` | State axes used by `CK.matrix` and the inventory. |
| `slots` | Named anatomy slots (documentation + matrix coverage). |
| `parts` | Optional selectors overriding the defaults below. |
| `requires` | Roles the component expects; unresolved roles are an audit failure. |
| `bindings` | Role pins. Each has `part`, `prop`, optional `when`, `role`, optional `optional`. |

### 3.1 Part selection

`CK.parts(host, def, part)` walks the built subtree. Nested component copies and known-family boards are opaque: their
text belongs to that component, not to the composite around it.

| Part | Selector |
|---|---|
| `host` | component root |
| `label` | text named `label`/`button`/`tab`/`chip`/`badge`, else the widest text |
| `title` | largest text |
| `body` | largest remaining text, preferring the lighter weight |
| `field` | node named `field` |
| `box` | node named `box` (checkbox) |
| `track` | `track` or `meter·track` |
| `handle` | `handle` |
| `inkBar` | `ink·bar` |
| `trackActive` | `track·active` (custom selector) |
| `icon` | `glyph·*`, `icon·*`, `spinner` |
| `ring` | `ring·*` |
| `plate` | first `plate·`/`surface·`/`panel·` layer, else first rect/board |
| custom | `parts.<name>.match` regex, with `pick` (`first`, `widest`, `largest`, `largest-rest`) |

### 3.2 Naming

- Default props → `Button`.
- Axis change → `Button·Danger` / `Button·Danger·Lg`.
- Content flags are name segments: `Checkbox·Checked`, `Checkbox·Indeterminate`, `Badge·Dot`,
  `Chip·NoRemovable`, `FAB·Extended`, `Modal·Scrim`.
- `/` is illegal in a component name; everything joins with `·`.

## 4. Runtime API — `scripts/component-engine.js` → `storage.CK`

Seed order and MCP setup: `runtime.md`.

| Call | Result |
|---|---|
| `CK.loadContract(json)` | load 41 roles + required list |
| `CK.load(registry,{pack,keep})` | merge core/catalog definitions; `keep:true` preserves the richer core def for a shared id |
| `CK.packs()` / `CK.inventory({pack})` / `CK.plan(pack)` | pack sizes / inventory with master coverage / build plan |
| `CK.contract()` | resolved + missing roles; `requiredMissing` is the gate |
| `CK.roleToken(role)` | `{token, record, type}` or `{err}` |
| `CK.masterName(id, props)` | exact master name used by screens |
| `CK.build(id, props, o)` | draw + bind; `o.register` registers the master |
| `CK.master(id, props, o)` | idempotent build + register; reuses an existing master by name |
| `CK.instance(id, props, o)` | place the exact master; `fallback:true` when only the base head exists |
| `CK.buildPack(pack, o)` | resumable grid build; call with `{start: next}` until `done` |
| `CK.matrix(id, o)` | one `Family·Spec` board from the definition rows/states |
| `CK.rebind(pack, o)` | resumable re-apply after a token value change |
| `CK.theme(group,name,o)` | switch a theme and prove the paint changed |
| `CK.audit({pack})` | contract + definitions + masters + unbound census |
| `CK.describe(id)` | definition + resolved roles + variant masters |
| `CK.extend(def)` | add a runtime definition after validation |

`CK.buildPack` defaults to 3 columns × 520 px cells; pass `cellW`/`cellH`/`columns` for a different master sheet.

## 5. Binding semantics

A build runs two passes:

1. **Semantic roles** — bindings are applied in order; a later matching binding wins. A missing part is reported in
   `missingParts`; a missing non-optional role fails the binding; `optional:true` skips material a project has not
   declared.
2. **Value fallback** — `TK.bindBoard(host,{})` walks the whole subtree and binds every remaining fill/stroke/type/
   radius whose value already equals a declared token. This is why a factory-built family with no explicit binding is
   still token-driven.

Exempt by design (reported, not failed):

- a gradient fill (`fillColorGradient`) — a gradient is a source material;
- a multi-fill state overlay (base + 8 % ink/white) — the base is token-bound; the alpha is the state;
- an image fill;
- a shadow not declared in the project (only when the binding is optional);
- a radius on a decorative layer (`sheen·`, `hitpad·`, `clip·`, `guide·`).

`CK.coverage` reports fill/stroke/typography/radius/shadow. `CK.audit` fails `CLEAN` if fill/stroke/typography/radius
remain unbound; a shadow is reported separately because a project may intentionally ship flat components.

### 5.1 Measured Penpot facts (2.18.3, 2026-11-02)

| Fact | Consequence |
|---|---|
| A `borderRadius` token is stored on `borderRadiusTopLeft/TopRight/BottomRight/BottomLeft`, not the scalar `borderRadius`. | `CK.coverage` checks the four corner keys. |
| Applying the **same** token to an already-bound shape clears the binding. | `CK.applyBinding` skips satisfied roles; `CK.rebind` is safe. |
| `TK.bindBoard(host,{self:true})` visits the root only. | `CK.bind` calls `TK.bindBoard(host,{})` for the full subtree. |
| `penpot.createPath()` starts with a default 1px black stroke. | `ctx.path` writes `strokes=[]` for a fill-only path. |
| `CF.badge` / `CF.chip` dereferenced `prof.radius` with no profile. | Fixed in `component-factory.js`. |
| A composite's nested raw control can be a text candidate for `body`. | `CK.parts` skips nested known families and prefers the lighter 14px paragraph over a 500-weight button label. |

## 6. Lifecycle

```js
CK.loadContract(contract);
CK.load(core);                              // pack: core
CK.load(catalog, {pack:'catalog', keep:true}); // optional 1:1 catalog

await CK.master('Button', {}, {x:80, y:80}); // one master = smoke test
await CK.buildPack('core', {x:80, y:80, columns:3, limit:6}); // repeat with {start: next}

CK.audit({pack:'core'});                    // CLEAN | NEEDS_REPAIR
await CK.theme('Scheme','Dark');            // changed > 0
```

**First live run.** Build one master before a batch and read `bind.failed` / `coverage.unbound`. The 24-family core
pack passed this on Penpot 2.18.3 (24/24 masters, audit CLEAN, 0 unbound fill/stroke/type/radius, one reported Switch
handle shadow). Re-run the smoke after a new Penpot build or a new renderer.

**Instance.** `CK.instance(id, props, o)` places the exact master; when the exact variant is absent it falls back to the
base head and reports `fallback:true`. That is a visible fact, not a silent pass. Use `{ensure:true}` to build the
variant first.

## 7. Re-theming

1. **Change a token value** (`TK.put` / `TK.seed`); every bound paint follows. `CK.rebind(pack,{start,limit})` re-reads
   role/value bindings safely (already-bound tokens are skipped).
2. **Switch a theme** — `CK.theme(group,name)`; pass is `changed > 0`.
3. **Re-map a role** — point a role at another token in the contract; rebuild/rebind.

Not token-driven: typed width/height/padding, a multi-fill state overlay alpha, a gradient stop list, a shadow outside
`EL`, a radius written after build. Report these; do not call them themed.

## 8. Screens are assemblies

```js
const plan  = LY.recipe('dashboard', {tier:'web'});
const board = NL.fromRecipe(plan, {parent: pageRoot});
await CK.instance('Button', {type:'primary'}, {
  parent: plan.region('header'), absolute:{x:24,y:16}, text:'New report'
});
await CK.instance('Card', {}, {parent: plan.region('content'), absolute:{x:0,y:0}});
```

Rules:

- a control with a master is **placed**, never redrawn;
- a band (direct child ≥40 % width and ≥56 high) is a component copy; ≥50 % of structural children are copies;
- regions come from `LY.recipe`; flow from `NL`; controls from `CK.instance`; copy from the type ramp; raster from
  `MD.place`; icons from `IC.place` / `CF.glyph`;
- set `CF.tier` before building; a three-pane screen at 375 is replaced by `mobileListDetail`, never squeezed;
- `CK.instance` fallbacks are findings; build the variant or extend the definition.

Acceptance: exports + PIL (`verification.md`); `NL.auditFlow(board) === 'CLEAN'`; instance fallbacks 0 for controls
the source shows.

## 9. Auditing

`CK.audit({pack})` returns:

| Field | PASS |
|---|---|
| `contract.requiredMissing` | empty |
| `defIssues` | empty (factory exists, roles known) |
| `unresolvedRoles` | empty (every `requires` role resolves) |
| `missingMasters` | empty (every visual definition has its base head) |
| `unbound.fill/stroke/typography/radius` | zero |
| `unbound.shadow` | reported; zero when shadows are declared |
| `verdict` | `CLEAN` |

Also run `python3 scripts/validate-components.py` (offline registry/factory/role/catalog check) and export the masters.
`CK.audit` is the component-layer gate; layout and copy fidelity need `NL.auditFlow` and the PIL diff.

## 10. Extending

1. **New variant** — add the prop value (and a factory branch if the renderer cannot draw it), then `CK.master(id,{…})`.
2. **New family** — add a definition with id/name/group/factory (or `custom` + anatomy), props, states, slots,
   `requires`, `bindings`; validate with `CK.extend(def)` or `validate-components.py`; build its master.
3. **New renderer** — add a factory to `storage.CF` or a `custom` anatomy; never draw the component inline on a screen.
4. **New role** — add it to the contract, map it to a live token/alias, list it in `requires`.

The catalog pack is fixed at 125 visual + 6 behaviour-only families (`references/catalog-pack.md`). A source profile may change
material/geometry inside a family; it may not add, remove or reorder one.
