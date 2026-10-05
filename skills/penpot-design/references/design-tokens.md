# Penpot Design Tokens — authoritative usage (tested locally, not transcribed from docs)

> **All conclusions here were obtained by testing on a real Penpot file with `execute_code`**. Where they conflict with official docs / high-level overview, this article wins and is marked `[docs wrong]`.
> The three official reference articles (design-tokens / what-are-design-tokens / design-tokens-with-penpot) are old; **use them only for concepts, don't copy the API**.
>
> Companion executable engine: `scripts/token_engine.js` (paste and use, includes set build / verify / apply / audit).

## 0. Six iron rules (learn these first; the rest are details)

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
   // also 'paddingLeft' / 'marginTop' / 'layoutItemMinW' … (see TokenSpacingProps)
   ```

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
