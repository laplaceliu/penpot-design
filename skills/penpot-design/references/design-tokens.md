# Penpot Design Tokens — authoritative usage (tested locally, not transcribed from docs)

> **All conclusions here were obtained by testing on a real Penpot file with `execute_code`**. Where they conflict with official docs / high-level overview, this article wins and is marked `[docs wrong]`.
> The three official reference articles (design-tokens / what-are-design-tokens / design-tokens-with-penpot) are old; **use them only for concepts, don't copy the API**.
>
> Companion executable engine: `scripts/token_engine.js` (paste and use, includes set build / verify / apply / audit).

## 0. Seven iron rules (learn these first; the rest are details)

1. **`addSet()` defaults to `active: false`; an inactive set causes "silent failure"** — the binding is recorded, the value doesn't take effect, no error thrown.
   Building a set must explicitly activate it: `tokens.addSet({name, active: true})` or `set.toggleActive()` after building.
   **This is the #1 pitfall this skill hit**: a delivered file once had 3 sets all inactive, 38 tokens all dead.
2. **Applying is async**, and **only takes effect when the target shape can actually carry that property**.
   `applyToShapes()` on an inapplicable shape **returns success but records nothing** → **you must readback `shape.tokens` to verify**; "no error" ≠ "applied".
3. **Omit the `properties` parameter as much as possible**. Omitting = use the type's default property (see §3 table);
   explicitly passing `['all']` **always errors in this version** `[docs wrong]`; passing a wrong property name also errors (e.g. font family must be `fontFamily`, not the doc's `fontFamilies`).
4. **Tokens are applied by "name", not by id**. When the same-named token exists in multiple active sets, **the later one in the `sets` array wins**;
   deactivating a set changes the resolved value. So set order = priority; put the "base layer" first and the "theme layer" last.
5. **`resolvedValue` is only non-null after the set is activated**. To check if a token is usable, look at whether `resolvedValue`/`resolvedValueString` is empty.
6. **Split sets by "whether to activate together", never by type**. `type` is the token's own attribute; the UI automatically groups by type **inside each set** (`tokensByType`), one set can hold all 17 kinds. Splitting by `Color`/`Radius`/`Spacing` is
   a category error: these three are always active together, splitting just turns 1 switch into N. See §1.1.
7. **The 01–02 token capacity is fixed; the values are brand-configurable.** Every project declares exactly
   `CAT.CAPACITY` (`references/catalog-standard.md`): **57 colours · 12 typography steps · 14 spacing steps · 9 radii ·
   13 shadow recipes · 2 dimensions · 4 border/divider colour roles · 10 semantic tone triples**. The counts come from
   the Foundations/Color boards' layout, so a missing or extra token re-flows pages 01/02 and is a `catalog_drift`
   finding (rule 62). Add a project-only token on a later page, or bump `CAT.CAPACITY` and rebuild 01/02 deliberately —
   never append it to the standard chapter.

## 1. Object model

```
penpot.library.local.tokens            // TokenCatalog (note: NOT penpot.library.tokens)
├── sets: TokenSet[]                   // array order = priority (later wins)
├── themes: TokenTheme[]               // flat array; grouping via the group attribute
├── addSet({name, active?}): TokenSet  // active omitted = false ⚠️
├── addTheme({group, name}): TokenTheme
├── getSetById(id) / getThemeById(id)
```

| Object | Members |
|---|---|
| `TokenSet` | `id` `name` `active` `tokens: Token[]` `tokensByType: [string, Token[]][]` `toggleActive()` `getTokenById(id)` `addToken({type,name,value})` `duplicate()` `remove()` |
| `Token` (each concrete type) | `id` `name` `description`(writable) `type` `value` `resolvedValue` `resolvedValueString` `duplicate()` `remove()` `applyToShapes(shapes, props?)` `applyToSelected(props?)` |
| `TokenTheme` | `id` `group` `name` `active` `toggleActive()` `activeSets: TokenSet[]` `addSet(set\|id)` `removeSet(...)` `duplicate()` `remove()` |

**There is no `penpot.tokens`, nor `penpotUtils.tokens`** — the only entry is `penpot.library.local.tokens`.

### 1.1 How to actually split sets (modeling rule) — don't split by type

**Remember one thing: a `SET` is not a "type partition"; `type` is the token's own attribute.**

Tested locally:

- **One set can hold all 17 types at once** (tested: adding 17 kinds of tokens into a single set, all succeeded);
  the UI's `Color / Border Radius / Dimensions / …` classification is **auto-grouped by `type` inside each set**,
  provided by `set.tokensByType: [type, Token[]][]` — **no need to build a set for this**.
- **The granularity of `toggleActive()` is the set**: one toggle affects **all** tokens in that set (tested 17 changing together).
- **`theme.addSet()` also only accepts sets**, can't activate by type.

So **set = activation / theme layer (a group of tokens switched on/off together)**, the split basis is "**whether to activate together**",
not "**what type it is**".

| Split way | Verdict |
|---|---|
| Split by type (`Color` / `Radius` / `Spacing` each one set) | ❌ **Category error**. Semantically these three are always active together, splitting just turns 1 switch into N; doing themes means placing an override copy in each set, very easy to miss an edit |
| Split by theme/layer (`Core` / `Dark` / `Density-Compact`) | ✅ **Correct**. Naturally fits the `active` + priority (later wins) mechanism |

**Two recommended landing forms:**

1. **No theme (most common)** → **one set holds everything** (e.g. `pix · Core`, internally auto-grouped by type, just as clear in the UI).
2. **Has theme (dark / density / brand)** → **base layer first + override layer after**:
   ```
   sets: [ 'pix · Core'(all base 38), 'pix · Dark'(only the color overrides, same name) ]
   ```
   The base layer must come first (`sets` order is priority, **later wins**, see §5);
   use `theme.addSet(core); theme.addSet(dark); theme.toggleActive()` to make a preset.

**Another tested constraint (affects the naming scheme)**: within the same set, token names are **globally unique, and `.` is treated as a path** —
when `t.color` exists it errors `A token already exists at the path: t.color or at a prefix thereof`,
i.e. **you cannot simultaneously have `t.color` and `t.color.x`** (leaf and parent nodes are mutually exclusive).
So the naming should use a unified prefix scheme (`color.primary` / `radius.md` / `spacing.xxs` such **same-level prefixes** are safe),
**don't** use names like "`md` with `md.lg` underneath" that collide paths with existing tokens.

## 2. The seventeen TokenTypes (the 17 UI categories, 1:1 with the API)

```
borderRadius · shadow · color · dimension · fontFamilies · fontSizes · fontWeights ·
letterSpacing · number · opacity · rotation · sizing · spacing · borderWidth ·
textCase · textDecoration · typography
```

> `[docs wrong]` high-level overview's TokenType list **misses `number` / `rotation` / `sizing`**,
> only 14; actually there are **17**. When writing code, use this table as the source of truth.

## 3. Value format / default applied property / applicable shapes (tested matrix)

| type | UI name | `value` passed | stored `value` | **default property when props omitted** | text | shape |
|---|---|---|---|---|---|---|
| `color` | Color | `'#FF471D'` | `'#FF471D'` | `fill` | ✅ | ✅ |
| `borderRadius` | Border Radius | `'8'` | `'8'` | `borderRadiusTopLeft` +`TopRight` +`BottomRight` +`BottomLeft` (**4 keys**) | ❌ | ✅ |
| `dimension` | Dimensions | `'16'` | `'16'` | `width` **+ `height`** | ✅ | ✅ |
| `fontFamilies` | Font Family | `'Inter'` | **`['Inter']`** (auto to array) | **`fontFamily`** (singular!) | ✅ | ❌ |
| `fontSizes` | Font Size | `'16'` | `'16'` | `fontSize` | ✅ | ❌ |
| `fontWeights` | Font Weight | `'600'` | `'600'` | `fontWeight` | ✅ | ❌ |
| `letterSpacing` | Letter Spacing | `'0.02'` | `'0.02'` | `letterSpacing` | ✅ | ❌ |
| `number` | Number | `'42'` | `'42'` | `rotation` | ✅ | ✅ |
| `opacity` | Opacity | `'0.6'` | `'0.6'` | `opacity` | ✅ | ✅ |
| `rotation` | Rotation | `'45'` | `'45'` | `rotation` | ✅ | ✅ |
| `shadow` | Shadow | object (see below) | **array** (see below) | `shadow` | ✅ | ✅ |
| `sizing` | Sizing | `'240'` | `'240'` | `width` **+ `height`** | ✅ | ✅ |
| `spacing` | Spacing | `'24'` | `'24'` | **no default property (no-op)** | ❌ | ❌ |
| `borderWidth` | Stroke Width | `'1'` | `'1'` | `strokeWidth` | ✅ | ✅ |
| `textCase` | Text Case | `'uppercase'` | `'uppercase'` | `textCase` | ✅ | ❌ |
| `textDecoration` | Text Decoration | `'underline'` | `'underline'` | `textDecoration` | ✅ | ❌ |
| `typography` | Typography | composite object (see below) | composite object | `typography` | ✅ | ❌ |

The "text/shape" columns = whether this type can apply to that shape; ❌ means applying **silently no-ops** (returns success, `tokens` empty).

### 3.1 shadow value shape

Just pass a single object; on storage it's **auto-wrapped into an array**, and `inset` is coerced to a **boolean**:

```js
set.addToken({ type: 'shadow', name: 'elevation.md', value: {
  color: '#1C1D20', inset: 'false', offsetX: '0', offsetY: '4', spread: '0', blur: '12'
}});
// readback value: [{ offsetX:'0', offsetY:'4', blur:'12', spread:'0', color:'#1C1D20', inset:false }]
```

### 3.2 typography value shape (note keys get renamed)

```js
set.addToken({ type: 'typography', name: 'type.body', value: {
  letterSpacing: '0', fontFamilies: 'Inter', fontSizes: '16',
  fontWeight: '400', lineHeight: '1.5', textCase: 'none', textDecoration: 'none'
}});
// readback value: { fontFamily:['Inter'], fontSize:'16', fontWeight:'400',
//               letterSpacing:'0', lineHeight:'1.5', textCase:'none', textDecoration:'none' }
//                        ↑ fontFamilies→fontFamily      ↑ fontSizes→fontSize
```

- **`lineHeight` has no standalone token type**, exists only as part of Typography.
- Each item in the composite value can be written as a **reference** (see §4), e.g. `fontSizes: '{fontSize.md}'`;
  but note that after renaming you must reference the token of the corresponding type.

### 3.3 Numeric values are all stored as strings

`spacing` / `dimension` / `borderRadius` / `borderWidth` / `sizing` / `number` / `opacity` / `rotation`
**all stored as strings** (`'16'`, `'0.6'`), but **also accept JS number input**, coerced to string.
When writing code, uniformly pass strings to avoid type inconsistency on readback.

## 4. References (token → token)

Write `'{token name outside the set level}'` in `value` (**only the token name, no set name**) and it becomes a reference:

```js
set.addToken({ type: 'color', name: 'color.link', value: '{color.primary}' });
// value: '{color.primary}'   resolvedValue: '#FF471D'   resolvedValueString: '#FF471D'
```

- References **resolve across sets** (the same-named token in this set or any active set can be referenced).
- When inactive, `resolvedValue` is still `null` — the reference chain only resolves in the activated state.

## 5. Activation / set vs theme difference / priority

### 5.1 Essential difference between Set and Theme

| | **TokenSet** | **TokenTheme** |
|---|---|---|
| What it is | **token container** (the actual data) | a preset of "which sets should be on" (just a set of references) |
| Stores tokens? | **Yes** (`tokens` / `tokensByType`) | **No**, only `activeSets` (references other sets) |
| Required? | **Required**, without a set there's nowhere for tokens | **Optional**, pure UI convenience |
| Can toggle alone? | Yes (`set.toggleActive()`), **but clears all themes' activation state** | Yes (`theme.toggleActive()`), switches its `activeSets` together |
| Mutually exclusive? | Not exclusive, any number can be on | **mutually exclusive within the same `group`** (activating one auto-stops the other in the group); **different groups can be active simultaneously** |
| Naming unique domain | **Yes** (name unique within set, and `.` is a path) | No |
| Affects priority? | **Yes** (`sets` array order) | No, only decides "who's on" |

**In one sentence: a set is "data", a theme is a "switch combination".**

### 5.2 Core rules (tested, clearer than official docs)

> **`set.active` is a derived value of "the union of all activated themes" — a set is active if and only if at least one activated theme contains it.**

Tested step-by-step (3 sets, 2 groups):

| Step | Observed set state | Observed theme state |
|---|---|---|
| Initial | all off | all inactive (`activeSets` still shows **declared members**, unrelated to activation state) |
| Activate `Density/compact` | `dense=ON` | compact=ACTIVE |
| Activate `Scheme/dark` (contains base+dark) | `base=ON dark=ON`, **`dense` stays ON** | dark and compact **both ACTIVE** |
| Activate `Scheme/light` (same group) | `base=ON`, **`dark` turns off**, `dense` stays ON | dark **auto-stopped**, light=ACTIVE |
| Directly `base.toggleActive()` | `base=off`, `dense` stays ON | **all three themes cleared** |

Three corollaries:

1. **Activating a theme doesn't turn off sets outside the theme** (`dense` was never turned off) — but **stopping a theme turns off its set** (step 3's `dark`).
   So the precise phrasing is "union" rather than "only-add-never-subtract".
2. **Same-group mutual exclusion is automatic**, no need to hand-write stop logic — this is the biggest value of themes: using an axis to express the "can only pick one" constraint.
3. **Directly toggling a set clears all themes** — once you do this, you enter a "manual custom" state, all themes' `active` become false.

### 5.3 Priority (unrelated to theme)

Two **activated** sets defining the same-named token → **the later one in the `sets` array wins**; deactivating it falls back to the earlier one.
A theme only decides "who's on", **doesn't change the `sets` order**.

So the convention: **base layer first, theme override layer after**:

```
sets: [ 'pix · Core'(all base tokens), 'pix · Dark'(only the same-named tokens to override) ]

ensureTheme('Scheme', 'Light', ['pix · Core'])
ensureTheme('Scheme', 'Dark',  ['pix · Core', 'pix · Dark'])   // Dark after → overrides Core when activated
activateTheme('Scheme', 'Dark')                                 // → color.primary resolves to the override value
```

### 5.4 API and engine

```js
// native
const t = tokens.addTheme({ group: 'Scheme', name: 'Dark' });  // default active:false
t.addSet(coreSet); t.addSet(darkSet);                          // accepts TokenSet or id
t.toggleActive();                                              // activate (the other in same group auto-stops)

// engine (recommended, wraps the above rules)
TK.ensureTheme('Scheme', 'Dark', ['pix · Core', 'pix · Dark']);
TK.activateTheme('Scheme', 'Dark');     // returns { active, activeSetsNow }
TK.activeSets();                        // current actually-activated set names
```

> ⚠️ **When themes exist, don't directly `set.toggleActive()`** — it clears all themes.
> `TK.ensureSet()` already has built-in protection: when a theme is detected it defaults to not toggling directly (use the third param `force` to force).
> `TK.audit()` also auto-switches its criterion: no theme → inactive set counts as a fault; with theme → inactive is a normal state,
> re-judged to "no same-group multi-activation + all tokens in activated sets resolvable".

### 5.5 A token set is **not** the 素材 panel (measured 2026-10-21)

There is a third surface beside sets and themes: the **library style records** the Assets panel lists —
`library.local.colors` (fills) and `library.local.typographies` (text). Creating tokens fills **neither**. A live file
proved it: 40 active `typography` tokens, `themes: []`, `typographies.length === 0` → the Typography panel was empty,
and every design rule still passed, because every rule reads the shape tree or the token set.

`storage.TP.seed()` (in `token_engine.js`) closes that gap: one `LibraryTypography` per declared ramp step, **named
exactly like its token**, fields written then read back (`drift: []`), idempotent (second run makes nothing), plus
`TP.audit()` (tokens ↔ styles diff) and `TP.apply(shape)`. Note the measured trap in the apply path:
`style.applyToText(shape)` transfers family/size/weight/tracking but **forces `lineHeight` to 1.2** regardless of the
record (1.05 → 1.2, 1.4 → 1.2), so `TP.apply` re-asserts the style's own leading, and a style pass over already-bound
text is a rhythm regression — register styles for consumers, keep `tokens.typography` as the binding of record.
`audit_design` rule 30 `no_type_styles` fails a text-bearing board whose library has 0 styles.

## 6. Applying tokens

```js
token.applyToShapes([shapeA, shapeB]);          // ✅ omit properties → use default property
token.applyToShapes([shape], ['fill']);         // ✅ explicit (property name must be correct)
shape.applyToken(token, ['strokeColor']);       // ✅ equivalent
token.applyToSelected(['fontSize']);            // acts on current selection
await nap(500);                                 // ⏳ async, must wait before readback
```

**Six must-know pitfalls:**

1. **Omit `properties`**. Tested passing `['all']` always errors
   `Value not valid: Field 1 is invalid: should be a set of strings` — `[docs wrong]`, `'all'` is unavailable in this version.
2. **The font-family property name is `fontFamily` (singular)**, while the `TokenFontFamiliesProps` doc says `"fontFamilies"`.
   Passing `['fontFamilies']` → same `should be a set of strings` error; passing `['fontFamily']` → success. `[docs wrong]`
3. **Inapplicable = silent success**. Applying `fontSizes` to a rectangle returns OK, but `rect.tokens` is still `{}`.
   **The only criterion is readback**:
   ```js
   token.applyToShapes([sh]);
   await nap(500);
   if (!sh.tokens || !Object.keys(sh.tokens).length) throw new Error('token not effective: check set active / shape supports the property');
   ```
4. **typography overwrites single bindings**. Apply `fontSize`+`fontWeight`+… first, then apply `typography`,
   and `shape.tokens` only has `{typography:'…'}` left, the single bindings are lost. **Don't mix the two.**
5. **`dimension` and `sizing` set width and height together by default** (not just one); if you only want width, explicitly pass `['width']`.
6. **`spacing` has no default property**, omitting props does nothing. To act on a flex container, specify explicitly:
   ```js
   spacingToken.applyToShapes([flexBoard], ['rowGap', 'columnGap']);
   ```
   **Measured limit (2026-10-23): only `rowGap`/`columnGap` bind.** The four padding props are REJECTED by
   `applyToShapes` in the connected build, so padding can never carry a binding: it is authored from the scale and
   judged as a VALUE (`space_off_scale`); `space_unbound` covers the two gap props only. The upstream
   `TokenSpacingProps` type still lists 'paddingLeft'/'marginTop' — writing them reads back and does nothing.
7. **`borderRadius` writes FOUR corner keys and rewrites the drawn value** (measured 2026-10-22). A scalar `shape.borderRadius`
   is one number, but the token map is `{borderRadiusTopLeft, TopRight, BottomRight, BottomLeft}`; applying the token to only one
   key leaves a partial map, so `TK.bindBoard` applies all four together — and that apply is not a no-op on the geometry, it
   *retunes* the corner to the token's value. Binding is therefore the repair for an off-ladder corner, not just a label on it.
   A `9999` value renders as a clean pill (the renderer clamps it), which is why `radius.full` can be the control step.
8. **A write is committed only when the event loop yields** (measured 2026-10-22, and this one cost a whole false-green pass).
   `applyToShapes` returns immediately and reports success, but the change is queued: with no `await` after it, an independent
   read later in the same session found 1,757 corners still unbound across 68 pages even though the sweep had "bound" 3,465.
   With an 800–1200 ms yield the same shapes read back bound. So the settle wait in `TK.bindBoard` **is not a courtesy pause for
   the readback — it IS the commit**, and a batch pass may collapse it to one yield per PAGE (`pageSettle`) because every write
   the page queued lands together.

`shape.tokens` is a map of `{ property name: token name }` (note there is **no** trap beyond `x`/`y`/`height`;
`fontFamilies` here also appears as **`fontFamily`**).

## 7. Unbinding

**There is no removeToken API** — just write the shape property directly to unbind:

```js
shape.fills = [{ fillColor: '#FF471D', fillOpacity: 1 }];   // tokens.fill clears accordingly
```

**Key detail (tested)**: writing the **same value** is a no-op, **the binding is NOT cleared**;
you must write a **different value** to unbind. So "record the original value first, then write it back" **cannot** be used to unbind,
you need to write a temporary value in between:

```js
const keep = shape.fills[0].fillColor;
shape.fills = [{ fillColor: '#000001', fillOpacity: 1 }];  // different value → unbind
shape.fills = [{ fillColor: keep,      fillOpacity: 1 }];  // write the true value back
```

## 8. Mapping with DESIGN.md sections

| DESIGN.md section | token types to record |
|---|---|
| Colors | `color` |
| Typography | `typography` (main) + `fontFamilies` / `fontSizes` / `fontWeights` / `letterSpacing` (for references and separate application) + `textCase` / `textDecoration` (as needed) |
| Layout | `spacing` / `dimension` / `sizing` |
| Elevation & Depth | `shadow` / `opacity` |
| Shapes | `borderRadius` / `borderWidth` |
| (other) | `number` / `rotation` (for badges, rotation decorations, etc.) |

**Optional mechanical bridge**: the `design.md` CLI can export DESIGN.md into W3C Design Tokens (DTCG) and a Tailwind theme:

```bash
npx @google/design.md export --format dtcg DESIGN.md > tokens.json   # machine-readable, can serve as TK.seed's spec source
```

Using it avoids hand-copying values; but **DTCG type names don't map 1:1 to Penpot's 17 TokenTypes**
(e.g. DTCG has no `sizing`/`rotation`, Penpot has no `duration`/`cubicBezier`), still needs an explicit mapping layer.

### 8.1 A tone seeds as three `color` tokens, and the override set must carry all three

`design-guide.md §4.1` defines each tone as the triple **wash · hue · ink**; the names below are the contract between
`TK.seed`, the palette in `seed_storage.js` (`storage.T`), the mirror in `CF.P` and `CF.theme(map)` — keep them identical,
or a re-skinned file silently keeps drawing the default blue.

```
color.primary        #2563EB   hue   → graphics only (icon, 3px bar, ring, chart)
color.primarySoft    #DBEAFE   wash  → background that the ink sits on
color.primaryInk     #1E40AF   ink   → the ONLY step that carries copy (on wash 7.15:1, under white 7.09–8.72:1)
color.onPrimary      #FFFFFF   copy on an ink-step solid
```

Same three-way split for `info` / `success` / `warning` / `error` (`*Soft` + `*Ink`), plus the neutral roles
(`color.ink` `color.muted` `color.surface` `color.surfaceAlt` `color.border`).

**Consequence for themes**: `· Dark` must override **`color.primaryInk`**, not only `color.primary`. In dark the wash becomes a
low-alpha tint and the ink step has to *lift* (`color-schemes.md §4.1`); a dark set that overrides only the hue leaves copy at
the light ink on a dark surface, which `audit_design.js` reports as `contrast`. Reference the pair instead of repeating hexes
where you can (`{color.primaryInk}` inside a typography token), so one override propagates.

### 8.2 The `borderRadius` set is the only source of a corner

`design-guide.md §5.1` makes this a HARD rule, and the mechanics that make it checkable are here:

- **Seed the ladder as tokens, then never write a corner again.** `TK.seed` records `radius.none / xs / sm / md / lg / full`
  from DESIGN.md's `Shapes` section — for a recreation, **the source site's own ladder** (for example
  `0 / 4 / 10 / 26 / 50 / 80 / 9999`), not the engine's default ladder. A recreated file that invents its own steps
  documents a system the source does not have.
- **Every writer goes through `CF.radius(role)`** (`ctx.plate`, `ctx.ring`, `ctx.clip`, `CF.build`, `NL.frame`, `NL.gridFrame`,
  `mkAbsBoard`, `mkRect`). A number that is not a declared step is *snapped* to the nearest one and recorded in `CF.coerced`, so
  an invented value is visible in the registry instead of silently drawn.
- **`full = 9999` is a real step, not a trick.** It renders as a clean pill (see pitfall 7 above), so a control's corner is
  `radius.full`, and a pill's `h/2` derivation is gone: the value comes from the set, so retuning the set retunes every pill.
- **Gate**: rules **35 `radius_off_ladder`**, **36 `radius_unbound`**, **37 `ring_off_host`** and **38 `ring_detached`** judge
  the ladder, the binding, the ring↔host corner pair and the ring↔host **mounting**, from the LIVE declared set
  (`TK.declared().radii`), never from `CF.RAD`.
- **`TK.roleSweep()` — the repair for a corner that is legal but wrong (rule 37's twin).** 35/36 can only judge values that
  exist, so the two real defects of a rebuilt file are invisible to them: a control host still square because an older
  factory generation drew it, and a `ring·*` layer that disagrees with that host. Both are judged against the **source's own
  contract**: `TK.CONTROL_FAMS` (button · iconbutton · splitbutton · fab · chip · badge · tag) is the set of families DESIGN.md
  binds to the control step (`CF.radius('control')`) — a family absent from the table is never judged — and `CF.ROLE.ring = 'host'` supplies the second
  rule. `TK.roleStart()` + `TK.roleSweep({budget})` until `done: true`, then `TK.rolePages()` for the per-page table and a
  **dry re-read** for the proof (measured: 136 pages → 367 hosts (241 masters + 23 copies) + 192 rings repaired, re-read 0/0/0).
- **`TK.ringSweep()` — the repair for a ring that is bound, correctly rounded, and in the wrong place (rule 38).**
  37 compares a ring's *corner* to its host; it cannot see a ring that drifted off the plate it outlines, which is what a
  user reports as "this element moved". `TK.ringHost(shape)` resolves the owner in one place for both the auditor and the
  repairer — nearest control ancestor (≤4 up) → deep subtree scan for a plate the ring **encloses** (margin 0–12 per axis)
  and is **concentric** with (Δ ≤ 3) → expanded-containment for a flat row band → page-wide size match — and returns
  `{host, control, concentric, floating, contained, ox, oy, via, kind, dist}`. `TK.ringStart(null)` (or a page-name list) then
  `TK.ringSweep({dry:true})` / `{budget, settle}` is the census and the fix, and `TK.ringPages()` reads the per-page defect
  table **after** a pass; the write re-applies the ring's **own measured
  margins** (`ox`/`oy`, default `TK.RING_OFF` = 2), never a forced 2, re-mounts it inside the owning control (`clip·` plates
  keep their ring one level up), copies the host corner only when the host is a control *board*, and then
  `TK.bindPage(n, {only:'radius'})`, because the geometry write dropped the binding. Measured 2026-10-22: 231 rings over
  pages 03–16 → 224 ok + 3 contained row rings + **7 floating drifts of 10–72px, all repaired**; dry re-read 41/41 ok, 0
  drift (idempotent); negative control +24px → `NEEDS_REPAIR {ring_detached:1}` → restore → `CLEAN`.
  Why the margins are not a constant, and the ±2 test that produced 47 false findings, are in `api-pitfalls.md §17` and
  `engines.md` §"Ring mounting".
- **Two measured facts that decide the sweep's scope** (`api-pitfalls.md §17`): a component's own shape answers
  `isComponentInstance() === true` **and** `isComponentMainInstance() === true`, so "skip instances" would skip every master
  and fix nothing; and a plugin-side write to a master **does not re-sync the copies already placed in the file** (measured:
  `Button·SM` on `14 · Screens · app` still read `r0` after its master was set to 9999 and the page re-opened). So the sweep
  visits masters, plain boards **and** copies, and does not call `resetOverrides()` — that would also revert the label and
  paint a screen deliberately set.

## 9. Acceptance recipe [Gate G9] (must run)

After pasting `scripts/token_engine.js`:

```js
return storage.TK.audit();    // full health check
storage.TK.assert();          // throws directly on failure, can be used as a gate
// end-to-end: apply and readback on at least 1 real shape
await storage.TK.apply('color.primary', [someRealShape]);   // must return ok:true
```

Health-check items (any failure = not qualified):

1. Each set's `active === true` (**inactive = all tokens dead**);
2. Each token's `resolvedValueString` is non-empty (broken reference chain surfaces here);
3. Set order follows "base first, override after";
4. name maps 1:1 to DESIGN.md, no cross-set name conflict (unless intentional theme override);
5. If `themes` exist, their `activeSets` and `active` states match expectations.

### 9.1 The theme switch must be proven on the **paint**, not on the bindings (added with `TK.paint`/`TK.changed`)

Bindings and paint are read at different moments, and this build separates them: adding a later active set changes the
token's `resolvedValueString` while **the already-bound shape keeps its old fill** — only a **theme activation**
re-skins it (capabilities §6). So `tokens.fill === 'color.primary'` proves nothing about what a reviewer sees. The
acceptance loop, run after the light/dark sets and the `Scheme` group exist:

```js
const shapes = /* the real shapes you care about, e.g. every control on a screen board */;
const before = storage.TK.paint(shapes);              // [{key, fill:{color,opacity,ref}, stroke:{…}}]
storage.TK.activateTheme('Scheme', 'Dark');           // one call re-skins every token-bound shape
await storage.NL.whenSettled(board);                  // then let layout settle (R3)
storage.TK.changed(before, storage.TK.paint(shapes)); // {changed: n, rows:[{key, fill:[before, after]}]}
```

Requirements on that read: `changed === 0` while a switch was requested is a **failure** (nothing re-skinned), a stable
second run must report `changed: 0`, and the comparison is case-insensitive on purpose — this build lowercases hex
fills on readback (`#2563EB` reads back `#2563eb`). After the switch, settle and **re-export** before judging
(capabilities §0.2: the render is the referee).

Same rule on the library-color channel (`scripts/palette_engine.js`): edit `c.color`, settle, read the bound shape's
`fillColor` — the ref surviving is what proves the paint came from the channel and not from a literal write.

## 10. Doc-vs-implementation discrepancy list (following docs will trip you up)

| Item | Docs say | Tested |
|---|---|---|
| TokenType count | 14 (listed 14) | **17** (extra `number` / `rotation` / `sizing`) |
| `addSet` default | not stated | **`active: false`** (source of silent failure) |
| `properties: ['all']` | a valid TokenProperty | **errors, unavailable** |
| font family property name | `fontFamilies` | must pass **`fontFamily`**; `shape.tokens` key is also `fontFamily` |
| `spacing` default property | not stated | **none** (omitting props = no-op) |
| `dimension`/`sizing` default | not stated | acts on both `width` and `height` |
| token entry | `penpot.library.local.tokens` | ✅ consistent (but `penpot.tokens` **does not exist**) |
| apply sync | stated async | ✅ consistent (tested ~500ms to stabilize) |
| unbind method | "just set the property directly" | ✅ but **writing the same value doesn't unbind** |
