# Engines and recipes (battle-tested)

Build and repair engine code is **all externalized to `scripts/`** (can be pasted and run independently); this article only keeps the mechanism, usage, templates, and page recipes.

| Script | Content | Usage |
|---|---|---|
| `scripts/seed_storage.js` | tokens `storage.T`, `mkAbsBoard`/`absMount`/`mkText`/`mkRect`/`mkChip`/`ct`/`pg` | run first each session; re-seed after storage loss |
| `scripts/repair_engines.js` | `fixStaleCenter` / `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans` | run once to plant into storage, call page by page |
| `scripts/fix_layout.js` | flex-collapse repair (getDesignSize + absRow + fixCol, two-round convergence) | run directly on the target page |
| `scripts/token_engine.js` | Design Tokens (`TK.seed` build set + record token auto-active / `TK.apply` apply + readback verify / `TK.audit`·`TK.assert` health check / `TK.unbindFill`) | record immediately after building skeleton; re-run health check before acceptance |
| `scripts/audit_layout.js` | positioning audit (`auditPage`/`auditAll`, five signature classes + font histogram, read-only) | run on each board as built; recompute after finishing |
| `scripts/fix_geometry.js` | geometry repair (column offset/board height/root height/right overflow, four engines, all support dry-run) | repair page by page after audit lists |
| `scripts/scaffold_structure.js` | fixed 16-page skeleton | first step of code-to-design |

> **Order iron rule**: `seed_storage.js` (G1) → build boards (each board `audit_layout.js` single-board audit, G3) →
> **Phase 1 geometry**: `fix_geometry.js`'s `fixGeometryAll({apply:false})` lists → review → `{apply:true}`
> → **Phase 2 alignment**: `repair_engines.js` finishing (`cleanOrphans → fixStaleCenter → alignPage → vAlignPage → fixInner → unclip`, G4) →
> `audit_layout.js` recompute to `CLEAN` (G5).
>
> **The two phases must not be merged, and needn't both run**: tested 121 out-of-bounds all resolved by the geometry engine, `vAlignPage` hit 0;
> running the alignment engine first would snap on a wrong baseline and introduce false-hurts. **Diagnose the signature first, then decide which engine.**
> Signature judgment and noise rules are in `references/positioning-audit.md`.

Generic runner (engines/repairs run page by page; **pre-cut next page at tail, must verify `penpot.currentPage.name` before probing**):

```js
const q = storage.xxxQueue;
if (penpot.currentPage.name !== q[0]) { penpot.openPage(storage.pg(q[0])); return {wait: penpot.currentPage.name}; }
const pg = q.shift();
const r = storage.engineFn();
if (q.length) penpot.openPage(storage.pg(q[0]));
return { page: pg, ...r, remaining: q.length };
```

## 1. Repair engines (code: scripts/repair_engines.js)

- **alignPage**: text snaps to "the smallest host containing its world center (rect/ellipse, 24≤side, area≤20000)"; if it should be centered (vertical deviation≤6px, large host≤3px) snap to the host's exact center; page-level direct text skipped; Breadcrumbs flow reflow, Tabs centered by 120px column. **All in world coordinates** (mixing parentX produces cross-level false-containment mis-snap).
- **vAlignPage**: small boards (≤70px tall) single-line direct child text vertical centering (only triggers at deviation 5–15px), with **stacking guard** (same-board x overlap≥50% and y diff>4 = deliberate stacking, skip).
  - False-hurt recovery: record repair log → restore deliberately off-center elements by known design coordinates (e.g. Number Field ＋ at y=−2 / － at y=22; Progress label y=0).
- **fixInner**: whole-file stroke batch fix (closed shapes→`inner`, paths→`center`; mechanism in api-pitfalls.md §3).
- **unclip**: whole-file `clipContent=false` (fix glow clipped invisible; mechanism in api-pitfalls.md §4).
- **fixStaleCenter**: fix **stale-center** centering large offset (>6px, fingerprint judgment) — the text's **top-left corner** lands exactly on the host center
  (`|t.x−hcx|≤2` or `|t.y−hcy|≤2`, per-axis independent), the arithmetic consequence of "using 1×1 transient width/height at creation to compute `(w−1)/2` centering".
  Deliberately left-aligned text only lands at `host.x+padding`, never sticks to the center → fingerprint judgment zero false positives; only moves the hit-axis coordinate, touches no hierarchy/style.
  **Must come before alignPage** (division: >6px large offset belongs to this engine, ≤6px micro-diff belongs to alignPage snap).
- **groupAssemblies**: assemble into groups (assembly-ownership contract `penpot-structure.md` §4.1). Under the same parent, "host (rect/ellipse/board ≥24)
  + sibling primitives whose center falls inside it and whose smallest host is it" → into a group, group name = host name.
  Inside-out (ascending area) → nested groups (button group into nav bar); idempotent (skip within same group/component, compare parent/child by `.id`);
  **built-in compensation grouping** (`penpot.group`'s destructive side effect see api-pitfalls §6.1: capture min parentXY → group →
  `absolute=true` → reset → readback verify), guaranteeing members' world coordinates zero displacement.
  Upgrade reusable assembly to component: `createComponent([group])` → pages use `comp.instance()`.
- **fixZOrder**: in-group front/back order repair (z semantics: larger `parentIndex` = more front). `penpot.group` puts the base plate above the label
  (label covered) → within group sort by descending area `setParentIndex(i)` (large base at bottom, text on top), instance internals skipped.
  `groupAssemblies` already has the same logic built-in (with group layer-slot preservation); use this engine for old-group batch fixes. Verify by whole-board export (small-shape group export has a cache illusion).
- **cleanOrphans**: clean root-level orphan text (historical crash residue, pollutes traversal).

The repair log returns `[{position, content, axis, offset}]`, **audit-review before going to the next page**.

### gridSnap — grid snapping (template, not wrapped)

Compute expected positions from the standard grid, batch-snap beyond tolerance. Calendar example (column-center/row-center formulas parameterized by actual layout):

```js
const colCx = (c) => 21 + c * 29.14;
const rowCy = (r) => 119 + r * 31;
for (const c of kids) {
  if (c.type === 'text' && /^\d{1,2}$/.test(c.characters)) {
    // find (r,col) minimizing |center - grid center|; snap if >0.5
  }
}
```

Note: run an audit once before snapping (collect the offset list for manual review), confirm the expected-position model is correct before batch fixing — a wrong expectation model would fix all elements wrong (instance: the weak-color rule was written inverted and false-hurt the 17–30 whole row).

### Dedicated repair patterns

- **Arc path rebuild**: delete old path → `bez()` generate (api-pitfalls.md §2) → appendChild (world-coordinate d needs no re-positioning).
- **Continuous path arrow bubble**: bubble outline + V-shaped arrow one path, rounded kappa approximation; text re-appendChild to top layer and centered by render width/height.
- **Crash-damage repair**: walk detects 100×100 non-text primitives → resize per design spec (board + edge-touching children, header board must be handled).
- **Cross-page delete**: first `penpot.openPage` that page (wait for switch to take effect), then remove.

## 2. Build seeds and component factories

Seeds and base factories take `scripts/seed_storage.js` as single source of truth (token values synced with DESIGN.md). Approach C key details and the three approaches' tested behavior are in api-pitfalls.md §10.

Component factory template (fixed-size component = board attribute + text layer, all via `absMount`; shadow color **must be object format** `{color, opacity}` — string hex silently turns black). Theme params replaced per DESIGN.md:

```js
storage.mkButtonA = (label, x, y, opts = {}) => {
  const h = opts.h || 45, w = opts.w || 160;
  const b = storage.mkAbsBoard('Button / ' + label, x, y, w, h, '#F8F8F0', opts.radius ?? 50);
  const st = opts.type || 'default';
  if (st === 'primary') {                       // 3D pixel shadow: blur=0 + offsetY=line thickness
    b.strokes = [{ strokeColor: '#F8F8F0', strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner' }];
    b.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 5, blur: 0, spread: 0, color: { color: '#BDAEA0', opacity: 1 } }];
  } else if (st === 'danger') {
    b.fills = [{ fillColor: '#E05A5A', fillOpacity: 1 }];
    b.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 5, blur: 0, spread: 0, color: { color: '#C94444', opacity: 1 } }];
  } else {                                      // soft shadow: blur 4 + low opacity
    b.strokes = [{ strokeColor: '#C4B89E', strokeOpacity: 1, strokeWidth: 2, strokeAlignment: 'inner' }];
    b.shadows = [{ style: 'drop-shadow', offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: { color: '#3D3428', opacity: 0.06 } }];
  }
  const t = storage.mkText(label, x + w / 2, y + h / 2, opts.fs || 14, '#794F27', 600);
  storage.absMount(b, t, x + (w - t.width) / 2, y + (h - t.height) / 2);
  return b;
};
```

3D pixel shadow vs soft shadow parameter comparison (Shadow/press effect generic):

| Effect | offsetX/Y | blur | spread | color.opacity |
|---|---|---|---|---|
| 3D hard shadow (pre-press) | 0, 5 | 0 | 0 | 1 (one darker tone of same family) |
| soft shadow | 0, 2 | 4 | 0 | 0.06 (black) |
| card float | 0, 3 | 10 | 0 | 0.10 (black) |
| inner shadow (input/track) | style:'inner-shadow', 0, 2 | 4 | 0 | 0.08~0.2 |
| focus ring (yellow) | two layers: 0,3,0,0 dark yellow 1.0 + 0,0,0,3 bright yellow 0.15 | | | |

## 3. flex-collapse batch repair (code: scripts/fix_layout.js)

Symptom: buttons/cards on the export are squashed to text size (flex hug). Three steps: absolutize → restore design size by name → bottom-up reflow rows and containers, two-round convergence.

- `getDesignSize` name-map is **project-specific**, rewrite per the target design system's component naming before pasting.
- **Order trap**: first absRow (row sizing) then fixCol (container fix); fixCol skips `absolute` subtrees — otherwise absolute elements get re-squashed back to content size (tested lesson).

## 4. Page assembly patterns (Dashboard/Landing/Login/List admin/Detail/Settings form)

Outer whole-page board (approach C) + manually laid-out partitions. Key points:

1. Whole-page board 1440 wide, y partitions: Navbar(100-180) → Hero(200-660) → Stats(700-820) → Features(880-1490) → Showcase(1520-2180) → FAQ(2210-2660) → CTA(2680-2840) → Footer(2880+).
2. Partition titles unified: swallowtail Path + rounded capsule board + centered text (reuse Title recipe).
3. Dashboard two columns: sidebar 240px fixed + content area offset x+240; table zebra/hover rows use **full-width color backing** (append order controls z-order, backing layer appended first).
4. Login centered card + decorative ellipse (ellipse directly appended to page board).
5. In-page components directly redrawn by recipe coordinates (scripts can't instantiate library components), keeping tokens consistent = visually consistent.

## 5. Post-crash rebuild checklist

Browser/plugin crash → storage all lost. Rebuild in order:

1. `scripts/seed_storage.js` re-seed (T/fonts/mkText/mkAbsBoard/absMount/pg) — one command probes + supplements seeds;
2. `penpotUtils.getPages()` inventory page structure, confirm canvas damage (100×100 degradation check in api-pitfalls.md §8);
3. re-collect all board ids (old ids invalid);
4. when the user reports "some component missing", prioritize suspecting: component deletion taking the main instance along, timeout landing on wrong page causing mis-delete, crash degradation — investigate one by one per api-pitfalls.md §6/§11/§8.
