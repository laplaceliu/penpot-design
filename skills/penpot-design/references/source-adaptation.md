# Source adaptation protocol

A recreation is not a blank-file design-system exercise. Its factories must be fed by **measured source profiles**,
not by the generic kit. This document is the protocol, independent of any site or brand: the measured values live in
the project's `DESIGN.md` and in its `CF.setReference` profile, never in this skill.

## 1. The rule

**A factory default is legal for a blank file; a source recreation must read a measured profile for every family it
draws from the source — and must still build every family in the factory catalog.** Pages 03–09 are the complete
library, not a trimmed screenshot: measured families take their source profile, families the source never shows are
`derived` from the nearest source material (recorded in DESIGN.md), built on a `·Spec` board, registered and gated.
Omission is not a design decision; it is a missing component.

## 2. Profile groups and schema

`CF.setReference` merges a profile onto `storage.REF` and stamps it as `nl:ref` on the owning PageRoot. The groups are
the page families:

| Group | Pages | Families to measure |
|---|---|---|
| `actions` | 03 | Button, IconButton, ButtonGroup, SplitButton, FAB, Link, Segmented (the 7 canonical families) |
| `forms` | 04–05 | Input, Textarea, Search, Select, field wrapper, form panel |
| `selection` | 05 | Checkbox, Radio, Switch, Slider, date/time pickers |
| `data` | 06–07 | Card, Table, List, Badge, Progress, Timeline, Calendar |
| `navigation` | 08 | Nav item, Tabs, Breadcrumb, Pagination, Menu, Accordion |
| `feedback` | 09 | Tooltip, Modal, Drawer/Offcanvas, Alert, Toast (last two often derived) |

The lists above are the **measurement focus**, not the delivered inventory: a profile only describes families that
already exist on the page's canonical list (`CAT.pageFams`), and every canonical family is still delivered (`derived`
when the source never shows it).

Each family entry is anatomy data; the factory reads it and stamps the drawn host with `nl:prof`:

```js
// Shape of a family profile. Every field is optional; absent fields fall back to the generic kit only when the
// project has explicitly declared the family as `derived` (see §4).
{
  source: 'reference',              // provenance label, not a brand requirement
  family: 'input',
  size: { h: 48, padX: 16, radius: 12, fs: 16 },
  border: { width: 1, token: 'color.border', focusWidth: 2, focusToken: 'color.primary' },
  fill: 'color.surfaceAlt',
  ink: 'color.ink',
  elevation: 'chip',                // recipe name from DESIGN.md's elevation block
  typography: 'type.label-lg',      // library style name
  states: ['default', 'hover', 'focus', 'disabled', 'error'],
  derived: false,
  anatomy: { /* family-specific slots; the factory documents its keys */ },
  // the contract the GATE checks: the keys a factory must have drawn. Same key names as the stamp's `geo`, so the
  // comparison is data-to-data and needs no per-family code. Numbers are compared with a 0.75px tolerance.
  // Only keys the render can re-measure belong here (h/fs/radius/stroke/fill/box/ring/track/handle/cell/gradient/
  // chip) — never padX, and never a per-state wash; a per-size block merges over this one (§5).
  expect: { h: 48, fs: 16, radius: 12, stroke: 1 },
  sizes: { md: { h: 48, fs: 16 }, lg: { h: 40, fs: 14 } },
  // one source measurement can cover several variants; a variant overrides the family entry it sits under
  // (`CF.profile(group, family, variant)` returns the merged object, so `expect` may be per-variant too).
  variants: { primary: { gradient: ['color.brandDeep', 'color.brand'], elevation: { default: 'tile', hover: 'tileHover' } } }
}
```

A page-level profile is the same object keyed by family, plus the source URL/label in the project's DESIGN.md. The
stamp is durable (`nl:prof` JSON) so a later session can re-read what material the host claims, without trusting
session memory. `CF.setReference` stamps `nl:ref` on **every** PageRoot in the file, and `CF.hydrate()` restores
`storage.REF` from that stamp after a plugin-storage wipe, so the profile outlives both the session and the page.

## 3. Source-backed families — what to measure

Before building a page, read the reference's own CSS/HTML for the families that page uses. Measure, at minimum:

- **geometry**: height/width, padding, gap, corner radius, border width; for a stateful control, the same in focus.
- **material**: fill token, text token, shadow recipe (drop + inner + sheen), border presence.
- **type**: family, size, weight, leading; map it onto the project's declared ramp and record the token.
- **states**: which states the source actually shows; do not invent a state matrix the source never has.
- **anatomy**: the slots the family really carries (icon, label slot, addon, footer). A family with no source
  evidence stays derived (§4).

`design-guide.md` and `component-library.md` provide the generic defaults and the structural contract; they are not a
substitute for the source values.

## 4. Derived families (source has none)

A family absent from the source is still delivered — pages 03–09 are the complete library, not just the screenshot. It must be:

1. marked `derived: true` in the profile and in DESIGN.md;
2. built from the source's **material language** — its card/ink/control/chip recipes, radii, and type — never an
   unrelated M3 pastel or a generic app-dialog look;
3. built on its group page with a `·Spec` board (the completeness half of `reference_drift`), registered like every
   other family, and gated: `nl:prof` carries the derived material — a missing spec board or a missing stamp is a finding.

The skill must not hardcode which families are derived for a particular site. The project profile declares them.

## 5. Gate

`reference_drift` (rule 56) is the source-adaptation gate. It is **data-driven**: one branch per page range, no family
names hardcoded per page.

**The catalogue constrains the inventory; the profile constrains the form.** Pages 03–09 deliver exactly `CAT.PLAN` as one block page per family (`CAT.BLOCKS`)
(67 families, one page each — rule 62). A profile entry may change a family's material, geometry and variants; it may
not add a family to a standard page, remove one, or move it to another page. A source-only component is built on
page `10` or later (or page `17 · Reference imitation`), never as an extra `·Spec` inside 03–09.

- **03 · Actions** — the chapter is the seven canonical action families (`CAT.PLAN['03']`), each on its own `03.MM · Actions · Family·Spec` page: a spec
  whose family is not in the profile, a profile family with no spec, or a host whose corner role the source does not pin.
- **04–08 · Forms / Selection / Data / Navigation** — one table maps the page prefix to its group and its profiled
  families (and one family may own several host-name prefixes: `List` claims `ListItem·`, `Table` claims
  `TableRow·`/`TableHeader·`, `Calendar` claims `MiniCalendar·`). A recreation must have the group profile; every host
  of a profiled family must carry `nl:prof` (a copy answers with its master's stamp, via `CF.profOf`); a stamp from the
  wrong group is a finding; and the stamp's `geo` must equal the profile's declared `expect` (0.75px numeric
  tolerance, `(derived material)` noted for a derived entry). The **variant** comes from the HOST NAME
  (`CF.profKeyFor` — the first name segment the entry declares in `variants`, e.g. `Card·…·Selectable`), so both stamp
  paths resolve the same merge; the **size** (`md`/`lg`/… from the name) merges the entry's `sizes[size]` block over
  `expect`, so one family contract plus one per-size contract serves both the draw and the judgment.
- **09 · Feedback** — tooltip and modal are compared **only on the keys the profile declares** (radius, padX/padY,
  shadow, arrow, fs — which may be a list — border, bodyPad); alert and toast are compared on the declared derived
  `material`. `nl:fb` remains the feedback stamp.
- A page whose group was never seeded is REPORTED (`no … source profile on page NN`), never passed. The gate reads the
  PageRoot `nl:ref` stamp, so it survives a storage wipe.

**What a stamp may claim.** A stamp written by a factory records what the factory drew; a stamp written by
`CF.stampPass(root, {overwrite:true})` records what the RENDER measures (radius, fs, h, stroke, fill, the control
plate's box/ring/track/handle/cell, the gradient flag, and `chip` read from the elevation stamp). `expect` may only
declare keys in that measurable set — `padX` is deliberately absent, because a Penpot text node is fitted to its ink
and `alignPage` snaps it to the host centre, so a left-edge measurement would be fiction. A key the render cannot
yield (`headH`, `rowH`, a state's wash) stays a stamp-only diagnostic or gets its own `variants` entry; declaring it
turns a real pass into noise, and omitting it turns noise into a pass.

Negative control (how to prove the gate is live, not decorative): set one host's `nl:prof` to a non-JSON string →
every copy of that host must report `carries no nl:prof`; restore the stamp → the expect findings return (measured
2026-10-23 on `Input·Outlined·MD·Hover`: 15 → 4 → 15). A gate that reads CLEAN both ways is not measuring.

## 6. Work queue

| Priority | Scope | Status |
|---|---|---|
| P0 | actions (03), feedback (09), icon-tile materials, checkbox geometry/axis/ring | **done** |
| P1 | profile layer in the factories (`CF.profile`/`profiles`/`profStamp`/`profOf`/`profDiff`, `nl:prof`, `nl:ref` on every PageRoot, `CF.hydrate`), profile-aware forms/textarea/field/switch/card/navItem/tooltip/alert/toast/modal/button/iconButton/iconTile/link/checkbox/radio/slider/kpi/progress/table/list/timeline/calendar/accordion/tabs/breadcrumb/pagination/menu, the 04–08 gate branch, `CF.stampPass` + `profKeyFor` + `profKeys`, name-derived variants and per-size `expect`, and the removal of every source-measured value from the skill (hexes, recipe names, class names, geometry) | **done (skill side)** — proved on 03/06/07/08 (profile gate at 0, negative control fires). Projects seed every group from their own measured profile and rebuild the pages the gate names |
| P2 | derived families (Table/KPI/Progress/Timeline/Calendar/Tabs/Menu/…) declared `derived: true` with the source's material language and gated like any other family; layout recipes and screen skeletons | **derived families done** (declared + gated, measured 2026-10-23); layout recipes / skeletons **queued** |

The generic 74-factory kit and 30 layout recipes remain as the fallback and as the first draft of a family with no
source evidence. They are not the delivered look of a source-backed page.
