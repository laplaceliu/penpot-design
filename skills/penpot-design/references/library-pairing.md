# Library pairing — make the design system 1:1 with a component repository

A host component repository is the **source of truth for the component inventory**. In paired mode the Penpot design
system does not emit the generic `CF.map()` catalog; it emits **exactly the host library's components**, one design
family per component namespace, and the gate fails both a missing component and an invented one.

This is separate from `source-adaptation.md`: that pins a *marketing source's* measured families; pairing pins a
*component library's* public API. They can be combined (a site + the component library it is built with), but the
inventory rule is the library's.

## 1. Inventory the repository

```bash
python3 scripts/inventory_library.py \
  --package refs/codesign-ui/packages/react \
  --name codesign-ui \
  --mapping assets/libraries/codesign-ui.map.json \
  --out assets/libraries/codesign-ui.json \
  --md references/libraries/codesign-ui.md
```

The parser reads `src/components/<dir>/index.ts`, takes the namespace (`export * as Dialog`) and its exported visual
parts (`DialogRoot`, `DialogTrigger`, `DialogBackdrop`, …), and writes a manifest. A mapping file pins each namespace's
design contract; without one every entry is `custom` on page 13.

The committed example is **codesign-ui**: 62 namespaces, 461 anatomy parts, 56 visual and 6 behaviour-only components.
See `libraries/codesign-ui.md`.

## 2. Manifest schema

```js
{
  name: 'codesign-ui', version: '1.0.0', mode: 'headless', granularity: 'namespace',
  source: 'https://github.com/codesign-chat/codesign-ui',
  components: [{
    name: 'Dialog', designFamily: 'Dialog',          // 1:1 design-system family
    page: '09', group: 'feedback',                   // skill page + profile group
    factory: 'modal',                                // CF factory, or 'custom'
    kind: 'visual',                                  // visual | nonVisual
    category: 'Overlays & Dialogs',
    parts: ['DialogRoot', 'DialogTrigger', 'DialogBackdrop', 'DialogPositioner', 'DialogContent',
            'DialogTitle', 'DialogDescription', 'DialogCloseTrigger'],
    states: ['closed', 'open'],
    source: 'packages/react/src/components/dialog'
  }]
}
```

- **designFamily** — the master/spec family name in Penpot. One component may map to a factory with a different
  family name (Dialog → `modal`), but the design family stays the repo's name.
- **factory** — a `CF` factory that can draw a representative of the component (`modal`, `tabs`, `select`, …).
  `custom` means the skill has no matching styled factory: build a neutral **anatomy board** instead. A missing factory
  is a mapping gap, not a licence to draw a one-off control on a screen.
- **kind** — `visual` components need a design family/master (or part masters). `nonVisual` components (Portal,
  Presence, ClientOnly, FocusTrap, Collection, Formatting) are documented on the page-13 index and need no master.
- **parts** — the public anatomy. Parts are drawn in the spec board and may be registered as part masters at
  `granularity:'part'`; the default `namespace` granularity counts a part master as coverage for its namespace.
- **pages/groups** — the fixed 18-page groups: 03 actions, 04 fields, 05 selection, 06 data lists, 07 display,
  08 navigation, 09 feedback; 13 is the index (non-visual utilities).

## 3. Headless libraries: anatomy, not styled variants

codesign-ui is unstyled (Zag.js). A **styled variant matrix** (primary/secondary/danger) is an invention and fails
pairing. A paired headless component draws:

1. one representative anatomy (the factory's default or a neutral part board),
2. its public parts with labels,
3. its behavioural states (`closed/open`, `checked/unchecked`, `disabled`, …) as **documentation**, not as restyled
   variants.

The design system's own theme (colors/type/radius/elevation) still applies to the representative; it is the
*integration theme*, not a claim that the host library ships visual variants.

## 4. Build in paired mode

Seed the engines in G1 order, including `scripts/library_engine.js` after `component_factory.js`/`native_layout.js`:

```js
const LM = storage.LM;
LM.load(manifest);                       // or LM.hydrate() from a PageRoot's `nl:lib`
LM.validate(storage.CF);                 // { ok, missingFactories, custom, nonVisual }
LM.ensureProfiles(storage.CF);           // derived profiles for mapped factory families
LM.stamp(pr);                            // durable contract on the PageRoot (per page, while it is open)
const plan = LM.pagePlan('09 · Overlays & feedback');
const out = await LM.buildPage({ page:'09 · Overlays & feedback', parent: pr, x:80, y:208 });
```

- `LM.buildPage` is section/page-scoped; call it once per page and continue with `nextY` when the 30 s ceiling cuts a
  run. It draws mapped components with a single factory representative, `custom` components as anatomy boards, and
  registers the representative/anatomy root as the `designFamily` master.
- Page 13 is generated from the manifest with `LM.indexPage({parent: pr})`: one row per namespace with its page/group,
  factory or `custom` mode, part count and first parts; `nonVisual` rows are marked `behaviour-only · no master`. It is
  idempotent by board name (`library·<name>·index`); pass `replace:true` to rebuild it.
- Do **not** call `CF.ensureCatalog` in paired mode: it would add generic families outside the manifest.
- **30 s ceiling / heavy composites (measured 2026-10-24):** a Dialog/Drawer/Tour representative plus `LM.finish()` can
  exceed one `execute_code` call. Build with `finish:false` in one call, then run `LM.finish(board)` in its own call;
  register the master **last** (`register:true` only after binding). Binding a board that already contains a component
  master can block Penpot writes — if a timed-out call leaves the plugin unresponsive, reload the Penpot plugin/page.
  Reads still work, so verify the board and continue once reloaded; do not assume the file is corrupt.

## 5. Gate: `library_drift` (rule 61)

When `storage.LM` is active (or a PageRoot has `nl:lib`), the auditor:

- replaces the generic 03–09 catalog with `LM.pageFams(page)`; a missing manifest family **or** an extra `·Spec` on the
  page fails `library_drift`;
- skips the source-profile requirement of `reference_drift` (a paired headless library may have no CSS);
- on page 13 runs `LM.audit()`: every **visual** manifest component must have a master whose head is its designFamily
  **or one of its parts**; every library master must map to a manifest component or part. Missing and extra both fail.

`LM.audit().verdict` is `CLEAN` or `NEEDS_REPAIR`; `missing`/`extras` name the repair target. A negative control is
simple: delete one component master → `missing` names it; register a `Foo·Spec` outside the manifest → `extras` names it.

## 6. Acceptance

- `LM.validate(CF).ok` with zero `missingFactories`.
- `library_drift` CLEAN on pages 03–09 and 13.
- Page 13 lists every namespace, including `nonVisual` ones, with part counts.
- The manifest is the codegen index too: `designFamily` ↔ repo namespace, `parts` ↔ the library's exported anatomy.
  A design→code pass must use the manifest rather than guessing a component from a visual match.
