# Icons — which channel, which source, which license

**The decision this skill ships with:** a **text icon catalog embedded in the skill** (Lucide, ISC) + one import
engine, instead of a downloaded `.penpot` library or a link guide. Everything below is either measured in
`penpot-capabilities.md` or a consequence of the workflow (paste → build → gate).

## 0. The three options, evaluated

| Option | Verdict | Why |
|---|---|---|
| **Bundle `.penpot` icon libraries from penpothub** | ❌ as the embedded default | Importing a `.penpot` file is a **UI-only** operation — the plugin API has no import method, so the skill cannot do it in-session, cannot retry it, and no gate can verify it. Consuming a library that *is* already in the file goes through `connectLibrary`, which is still on the **unverified** list (capabilities §12). Binary assets are also unreadable to this workflow: a script cannot inspect, diff or repair them, and each library carries its own license decision |
| **A guide only** (links + manual steps) | ❌ as the only answer | links rot, the manual step breaks the "one call, one page" loop, and nothing can be gated |
| **A famous SVG library, embedded as text** | ✅ **chosen** | `createShapeFromSvg` turns an SVG into **editable vectors** (capabilities §9), so the data form the file needs is text: grep-able, pasteable into `execute_code`, license-clear, works offline in any file. `assets/icons/lucide.jsonl` (1966 icons, 24×24, ISC) ships inside the skill; `scripts/icon_engine.js` (`storage.IC`) imports them |

**Why Lucide specifically**: 24-grid, `stroke-width: 2`, round caps/joins — the exact geometry `CF.glyph` and
`design-guide §iconography` already assume, so glyphs and catalog icons look like one family. Its license is **ISC**
(`assets/icons/LICENSE` — a copyright notice in copies is the only obligation). Font Awesome Free's *icons* are
**CC BY 4.0** (attribution must travel with the design) and Material Symbols is Apache-2.0 — both are usable through
the same mechanism, see §4; they are not bundled because Lucide covers the need with the lightest obligation.

## 1. Three channels — pick per artifact

| You are drawing | Use | Names |
|---|---|---|
| a glyph **inside a control** (select chevron, table sort, password eye, chip status) — must inherit the control palette and stay ≤ 2 path shapes | `CF.glyph(ctx, kind, box, o)` | the 85 hand-tuned kinds, camelCase: `chevronDown`, `sort`, `eyeOff`, `warning`… |
| a catalog icon at a box, in a grid, on a page, in an empty state, or inside a control that wants an imported vector | `IC.place(name, {parent, color, size})` / `IC.grid({names, x, y, …})` | Lucide kebab-case, alias- and camel-tolerant: `chevron-down` = `chevronDown` = alias `trash-2` |
| **the target system's own icon file** (Entry C — recreating a React/UI library) or any ad-hoc SVG | `CF.svgIcon(svg, {parent, color, size…})` | whatever the source uses |

Never mix two sources inside one control (component-library §6), and never hand-draw an icon with loose rectangles —
that is the same defect as a hand-drawn control (G12 spirit): it cannot be re-skinned or renamed by the engine.

**Why the 85 hand-drawn kinds are not redundant** (the "does the catalog replace them?" question, measured):

* **102 synchronous call sites** inside `component_factory.js` (`ctx.glyph('chevronDown', …)` etc.) — factory code is
  synchronous and draws **1–2 `path` shapes with the control's palette color**, `anchor`/`strokeW`/`opacity` overrides.
  `IC.place` cannot serve that contract today: it is async (every call site would need `await`), it returns a **group**
  of imported shapes, and it needs the icon's catalog line seeded first — a button whose chevron depends on a pasted
  JSONL line is a session-level failure mode the hand-drawn set does not have.
* **The catalog cannot be drawn through `ctx.path` either**: Lucide bodies contain **arc (`a`) commands and `<circle>`
  elements**, and a hand-assigned `path.d` with arcs does not render in this build (api-pitfalls §2 — the DSL's
  `M/L/C/O/R` exists precisely because it was converted to what `path.d` survives). Replacing `G` with catalog data
  means either a build-time arc→bezier conversion of every body (a data regeneration + visual re-verification of all
  85, not a deletion) or routing all 102 call sites through `createShapeFromSvg`.
* **`CF.glyphKinds` is a contract, not just storage**: the `01 · Foundations` **Icons** board is enumerated from it
  (`scaffold_structure.js` → `penpot-structure.md §2`), and the design→code side is specified to take **the same names**
  (SKILL.md), so the code icon set matches that board. Removing `G` rewrites a page of the fixed structure and the
  codegen naming agreement.
* **The Icons board is `FN`'s only declared exemption on `01.xx`** (`FN.EXEMPT['01'] = ['Icons']`, gate G16): a catalog of
  1966 glyphs is not one record type, so `IC.grid` composes it — still token-filled, still gated by all 30 other rules,
  and `not_projected` skips it **by that name only**. Every other board on 01/02 must be projected.

So the split is deliberate: `G` = the guaranteed, synchronous, palette-native marks *inside* controls; `IC` = the
extensible catalog *outside* them. If one source is ever wanted, the viable path is **generated** data (Lucide →
converted DSL), not removal.

## 2. Usage

```js
// seed — only what this page needs (one line per icon from assets/icons/lucide.jsonl, read on demand)
storage.IC.seed([
  '{"name":"search","body":"<path fill=\\"none\\" stroke=\\"currentColor\\" … d=\\"M21 21l-4.3-4.3\\"/>"}',
  …
]);
storage.IC.add('target-system-icon', '<svg …>…</svg>');       // or paste any SVG outright

// place one icon (async): flow child by default; give x/y to place it absolutely (absMount contract)
await storage.IC.place('search', { parent: sk.regions.toolbar, color: storage.T.muted, size: 16 });
await storage.IC.place('inbox',  { parent: host, x: 120, y: 400, color: '#2563EB', size: 48 });

// the `01 · Foundations` icon section (or any labeled sheet): rect comes from LY.rect (G11), labels auto-centered
const r = storage.LY.rect('icons');
const grid = await storage.IC.grid({ names: ['inbox','search','bell','settings','trash-2','heart','star','flag'],
                                     x: r.x, y: r.y, cols: 8, cell: 96, size: 24,
                                     color: storage.T.onSurface, parent: host });
// grid → { count, missing:[…], box:{x,y,w,h}, cells:[…] } — `missing` is a real answer, not a placeholder
```

Rules the engine encodes (measured, capabilities §7/§9): the import lands at world (0,0) so it goes through a
throwaway board (and a no-`parent` group is moved to the page root **before** the throwaway is deleted — otherwise it
is deleted with it); the platform's `base-background` rectangle is removed; `currentColor` is substituted before
import; **size is applied with `group.resize(size, size)` after the import** — the svg root `width/height` is ignored
and the group lands at its 24-grid path bbox; `x/y` together mean world coordinates
(absolute inside a flex parent), no `x/y` = joins the flow at `sizing`.

## 3. Extending the catalog (offline-first, network optional)

The bundled set is complete for offline work. To pull more, any Iconify set is one request (this machine measured
`curl -sL` working):

```bash
curl -sL "https://unpkg.com/@iconify-json/lucide/icons.json" > /tmp/set.json        # or @iconify-json/material-symbols, …
node -e "const j=require('/tmp/set.json'); console.log(JSON.stringify({name:'check',body:j.icons['check'].body}))"
```

Then `IC.add(name, body)` in-session, or append the line to `assets/icons/lucide.jsonl` if it belongs to the skill's
default set. The JSONL contract: **line 1 = `{_meta, aliases}`**, every other line = `{"name","body"}` (body only — the
wrapper, viewBox and color are the engine's job).

**Paste-safety detail**: the bundled bodies use **single-quoted** SVG attributes (`fill='none'`), so a line contains no
backslashes and no escaping when copied into `execute_code` — `IC.seed([\`…line…\`])` (backticks) round-trips
byte-exactly. If you `IC.add` an SVG from elsewhere with double-quoted attributes, that is fine too — it just has to be
escaped as usual when pasted (or pass it inside backticks).

## 4. Sources and licenses

| Source | License | Bundled? | How to use it here |
|---|---|---|---|
| **Lucide** | ISC (`assets/icons/LICENSE`) | ✅ `assets/icons/lucide.jsonl` | `IC.seed` / `IC.place` / `IC.grid` |
| Material Symbols | Apache-2.0 (keep the notice) | no | `@iconify-json/material-symbols` → `IC.add` |
| Font Awesome Free | icons **CC BY 4.0** (attribution in the design), code MIT | no | same path; **carry the attribution** in the delivered spec page if used |
| Heroicons / Remix / Tabler | MIT | no | same path |
| penpothub `.penpot` libraries | per-library | no | **manual UI import only**, then probe `connectLibrary` (unverified, capabilities §12) — a guide, never an automated step |
| the target system's own SVGs (Entry C) | whatever the target ships | n/a | `CF.svgIcon(svg, …)` — this is the fidelity path: the recreated library keeps *its* icons |

## 5. SVG constraints when passing your own

* a `viewBox` (24×24 preferred) — it is preserved on import, and the engine then **resizes the group to `size`**
  (measured: the svg root `width/height` does not scale anything — the group arrives at its path bbox);
* stroke icons: keep `fill="none"` + `stroke-width` on the paths; filled icons: `fill` on the shape — either is fine;
* **no** `<image>`, `<use href>`, external refs, filters or CSS classes: they do not resolve in this build;
* `currentColor` is fine — `IC.svg`/`IC.place` substitute a concrete color (the build does not resolve it);
* arcs (`A`) are fine **through `createShapeFromSvg`** (the platform converts them) — only hand-written `path.d`
  assignments need the kappa conversion (api-pitfalls §2).

Sizes: inside controls 16 (xs/sm), **18–20 (md)**, 24 (lg / icon-only 40 control), 28–32 (empty state, upload),
40–48 (illustration) — component-library §6, and a meaning-carrying icon needs a label or tooltip.
