# Code → Design

> Entry: a URL, a set of screenshots, or an existing UI-library source tree. Output: DESIGN.md, a live token set, a
> token-bound Penpot component library, and (optionally) screens assembled from instances.

## 1. Analyze the source

| Entry | What to read | What to extract |
|---|---|---|
| **URL** | the target page + key subpages | colors, fonts, radii, spacing scale, shadow stack, component families, states, copy hierarchy |
| **Images** | each screenshot | the same, plus raster asset slots and their ratios; quantize colors with PIL (`#RRGGBB`) |
| **Source tree** | the component package, CSS variables/modules, examples | namespace inventory, anatomy (parts), states, prop axes, asset references |

For a source tree, `scripts/inventory-library.py` can scan components/kit/ai folders and emit a manifest:

```bash
python3 scripts/inventory-library.py --package <repo>/packages/react --name <lib> \
  --mapping assets/libraries/<lib>.map.json --out assets/libraries/<lib>.json
```

The manifest records `designFamily`, page/group, factory (or `custom`), kind, parts and states. A factory missing from
`CF` is `custom` (anatomy), never a licence to draw one-offs.

## 2. Write DESIGN.md

- Frontmatter: colors, typography, rounded, spacing, elevation (recipes + roles), components.
- Body: usage rules, tone semantics, layout targets (`targetProfiles`), color mode, content rules.
- `npx @google/design.md lint DESIGN.md` until 0 errors.
- Elevation is machine data: `drop[]` + `inner[]` + `sheen`, with family roles (`Button`, `Card`…). If the source is
  physical, measure its own stack; do not invent three flat layers.

## 3. Seed tokens

```js
const spec = [{ set:'<system> · Core', active:true, tokens:[
  ['color','color.primary','#…'], ['color','color.primary-ink','#…'], ['color','color.primary-soft','#…'],
  ['typography','type.body',{fontFamily:'Inter',fontSize:'14',fontWeight:'400',lineHeight:'1.5',…}],
  ['borderRadius','radius.control','9999'], ['spacing','spacing.md','16'],
  ['shadow','shadow.card',{color:'#000000',inset:false,offsetX:'0',offsetY:'4',spread:'0',blur:'12'}]
]}];
TK.seed(spec);
TK.assert();
TP.seed();
```

- One set holds all types; split by activation/theme, not by token type.
- Add a `· Dark` override set + a `Scheme` theme group for switchable light/dark (`viewport-and-themes.md`).
- The token contract resolves roles to these names/aliases. If the source uses different names, add aliases, not a second
  component set.

## 4. Map components

1. **Start from the core pack** (`assets/components/core.json`): it covers the common atoms (Button, Input, Card,
   Tooltip, Modal…).
2. **Load the catalog pack** (`assets/components/catalog.json`) for a 1:1 codesign-ui recreation; 69 factories and
   56 anatomy families.
3. **Add/override a definition** for a source family the packs do not cover:
   - choose a factory that draws the anatomy, or `custom` + anatomy;
   - define props/states/slots, `requires`, and `bindings` to roles;
   - validate with `CK.extend(def)` or `validate-components.py`;
   - build the master with `CK.master`.
4. **A missing variant** is a definition/factory extension, then a rebuild; never a one-off board.

## 5. Build and verify the library

```js
CK.loadContract(contract);
CK.load(core);
// optional: CK.load(catalog, {pack:'catalog', keep:true});
await CK.buildPack('core', {x:80, y:80, columns:3, limit:6}); // until done
CK.audit({pack:'core'});                                     // CLEAN
```

- Read `audit().missingMasters`, `unresolvedRoles`, `unbound.*`.
- Export a contact sheet; check the component visually.
- For a switchable theme, `CK.theme(...).changed > 0`.

## 6. Assemble screens

Use `LY.recipe` for regions, `NL` for flow, `CK.instance` for controls, `MD.place` for raster, `IC.place` for icons
(`layout.md`). One board per accepted recipe × tier. A screen is an assembly of component copies, not a drawing.

## 7. Accept

- Every control is a component instance; `CK.instance` fallbacks are 0 for the variants the source shows.
- `NL.auditFlow(board) === 'CLEAN'`.
- Export the screen and compare with the source at the tier baseline width × each scheme
  (`verification.md`).
- A screen that was never exported is not “verified”.
