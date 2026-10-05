# Positioning Audit: how to get it right the first time, and how to actively find errors afterward

This article is an incident post-mortem + prevention contract. Incident background: in one 16-page design-system build, the user reported at delivery/acceptance that "**every page has mispositioned elements**". The root cause was not a wrong coordinate on one page, but that the **whole coordinate/text helper set was improvised on the spot**,
bypassing this skill's existing canonical engines, so the same systematic offset was copied into all 16 pages.

## I. Root-cause chain (ordered by contribution)

### R1 Improvised helper, bypassing the canonical engine (decisive)

`scripts/seed_storage.js` already provides `mkAbsBoard` / `absMount` / `mkText` / `mkRect` / `ct` / `mkChip`;
`scripts/repair_engines.js` already provides `alignPage` / `vAlignPage` / `fixInner` / `unclip` / `cleanOrphans`.
This build **did not read these two scripts**, and instead wrote its own helper set on site, causing three deviations:

| Deviation | Canonical | The incident's approach | Consequence |
|---|---|---|---|
| Board factory | `addFlexLayout()` + `flex.dir='column'` + `horizontalSizing/verticalSizing='fixed'` (approach C) | bare board + world-coordinate append (approach A) | the known failure mode of approach A is **whole-page offset `-board.y`** (readback correct, render misaligned), matching this incident's symptom |
| Text positioning | tested `t.width/t.height` → `absMount(parent, t, cx−w/2, cy−h/2)` | improvised `boxLabel`: `growType='fixed'` + `resize(w,h)` + `verticalAlign='center'` | `verticalAlign` is not a mechanism this skill relied on; the residual is exactly `vAlignPage`'s trigger domain (5–15px), copied across all 16 pages |
| Label ownership | text appended into the **container board itself** (`absMount(b, t, …)`) | lots of text appended into the **parent board** (same level as the container board) | label decoupled from container: component registration yields an empty shell; when reparenting/moving the container the label is left behind |

**Conclusion: `mkAbsBoard`/`absMount`/`mkText` and `alignPage`/`vAlignPage` are "use as-is" contract parts, not reference implementations.**

### R2 Only ran "stroke/de-clip", missed "alignment"

SKILL workflow step 5 says "**alignment**/stroke/de-clip review". This build used a hand-written script for a `fixInner` equivalent + de-clip,
**`alignPage` / `vAlignPage` were never run once**, so the residual left by R1 was never corrected.

### R3 Acceptance sampling, not full coverage

All ~120 boards only exported 4 for acceptance before declaring done. **The boards never exported are exactly where errors survive.**

### R4 Progress only lived in `storage` and context

The MCP connection dropped midway (`penpot.local:443` connect timeout), so the build queue and progress couldn't resume, and no one could take over for review.

## II. Four typical signatures: how to "actively find"

Eyeballing the export can only find "looks crooked". Below are four machine-decidable signatures, mapping to the four finding classes of `scripts/audit_layout.js`.

### S1 `out_of_bounds` — child element runs outside the parent board

- **Meaning**: the child rect is not contained by the parent rect (tolerance 1.5px).
- **Most typical cause**: approach A failure, whole-page offset `-board.y` (when board y=240 the content shifts up 240px overall, running outside the board or even to the page origin). The quadruple `(L,T,R,B)` in `detail` gives the overflow on each of the parent's four sides, **judge the signature by which side overflows**:

| Overflow direction | Signature | Fix |
|---|---|---|
| **L negative, and multiple boards on the same page share the value** | constant column offset (copy-paste left-column coords into right-column board) | `fixColumnOffset` shift the whole block |
| **T/B negative, and ≈ `-board.y`** | approach A failure (whole-page offset `-board.y`) | rebuild with approach C, **don't move element by element** |
| B negative, value differs per board (tens of px) | board height insufficient | `fitBoardHeight` |
| B negative, and shape is a direct child board of PageRoot | PageRoot height insufficient | `fitRootHeight` |
| R negative, shape is right-aligned text | right-side overflow (text box too wide) | `fixOverflowRight` |

> **`fitBoardHeight`'s maxGrow guardrail (critical, must enable)**
> This engine has a dangerous trait: **it can "swallow misplaced child elements into the board", thereby legitimizing the misalignment**.
> When the board really needs to grow, the amount is usually tens of px; **once it needs to grow hundreds of px, that must be a child element misplaced**,
> the correct fix is to move that child, not to inflate the board — after inflating, the audit sees "the child is inside the board" and gives a false negative instead.
> So the engine has a built-in `maxGrow` (default 160px): beyond it, it **refuses to grow** and puts it into the `suspect` list, attaching
> the `deepestChild` (the deepest child and its y), directly pointing at the suspect.
> Tested lesson: two Settings boards on one Demo page were inflated to **1336px / 1290px** (row gap only 960px),
> about 500px more than their content's proper height — this is the fingerprint of "misplaced child element swallowed in".

- **Criterion (distinguish L offset from approach A)**: the L offset is a **constant on the X axis**, and the constant = `board.x − originX` (here 920 = 1000 − 80);
  approach A failure is on the **Y axis** and the constant = `-board.y`. **Look at the axis first, then whether the value is shared.**
- **Accompanying trait**: readback (`child.x/y` read back) is **all correct**, only render/export is misaligned. **Readback-correct ≠ positioned-correct.**

### S2 `text_centre_residue` / `text_centre_info` — text not centered in its host

- **Meaning**: a text's world center falls inside some small host (rect/ellipse, side ≥24, area ≤20000), but deviates from the host center by > 0.5px.
- **Three-level judgment (critical, otherwise false positives run wild)**:
  - `text_centre_residue` = deviation **≤8px and text-box width ≥ host width ×0.72** → **the intent was centering** (button/capsule label), a defect.
  - `text_centre_residue` (**stale-center fingerprint**) = deviation >8px, but the **text's top-left corner lands exactly on the host's center**
    (`|t.x−hcx|≤2` or `|t.y−hcy|≤2`, per-axis independent) → see below, a defect, `detail` carries the `stale-center` mark.
  - `text_centre_info` = other cases (larger, or text box clearly narrower than host) → **deliberate inset** (tail × chip, left-aligned dropdown option rows), **not a defect**.
- **Cause A (≤8px residual)**: used a fixed text box + `verticalAlign/horizontalAlign` for centering, rather than "measure actual width/height + center placement".
- **Cause B (stale-center large offset)**: **reading `t.width/t.height` at the `createText()` creation instant to compute centering**.
  At creation the width/height are ~1px transient values (mcp-automation.md pitfall table "text positioning"), the arithmetic consequence of `(w−1)/2` is
  **the text's top-left corner lands exactly on the host center** — that's the origin of the fingerprint. Tested case: 37×15 label right-shifted 18.5px, down-shifted 7.5px (= `(37−1)/2`, `(15−1)/2`) inside a 110×32 pill, copied systematically across 16 pages.
  **Note: deliberately left-aligned text only lands at `host.x+padding` (12/16/18/24…), never sticks to the center (±2px),
  so the fingerprint judgment has zero false positives**; but it's **per-axis independent** — a left-aligned field placeholder may only hit the Y-axis fingerprint (vertically off-center), fix only Y.
- **Fix**: deviation 5–15px → `storage.vAlignPage()`; ≤6px → `storage.alignPage()` (host-snap, tolerance 6px / 3px for large hosts);
  **>6px and matching the stale-center fingerprint → `storage.fixStaleCenter()`** (only moves the coordinate of the hit axis, touches no hierarchy/style).
- **Note**: `alignPage`/`fixStaleCenter` only fix elements matching the fingerprint; deliberately off-center ones stay in the list — this is **expected behavior**.

### S3 `crash_100x100` / `degenerate_size` — size degradation

- `crash_100x100`: a non-text primitive exactly 100×100 = crash damage (api-pitfalls §8).
- `degenerate_size`: only **`w≤1 and h≤1`**, or **text** width/height ≤1 counts.
  **A 1px-tall hairline (divider, progress track) is deliberate design, not degradation** — an early version judging by "width or height ≤1" false-reported 85 in this system.

### S4 `header_collision` — body pressing onto the page header

- **Meaning**: a `rect/ellipse` on a board overlaps the page-header **title text** by >60%.
- **Threshold (critical)**: header = top `parentY < 96` and **font size ≥20px** text.
  Without the font-size threshold, two kinds of background boards would all false-report (of 31 tested here, 28 were false):
  - PageRoot's own `NN-Header` background board (it's supposed to sit under the title)
  - the nav-bar background rect of a 1440/375 demo screen (logo is 15–18px)
- **Cause**: the spec-board body's start y didn't yield to the header scaffold. **The first board of a new board must check this.**

### S5 `root_stray` — top-level stray primitives outside PageRoot

- **Meaning**: among `page.root`'s direct children, shapes other than `NN-PageRoot`.
- **Cause**: **bound-instance residue** produced during library-component registration / variant-container building (here: page 01's `Badge·New`,
  page 03's `Button`, each a 0-child stray instance). `createVariantContainer` also places the container at the **page root** rather than inside PageRoot.
- **Handling**: first use `isMainComponent()` / `component` to identify — **a bound instance can be safely removed** (doesn't affect the library),
  a main instance must be considered together with the component. Both here were 0-child bound instances, deleted directly.

### S6 Font consistency — unexpected font used for same-page/same-class text

- **Meaning**: `auditPage()`'s returned `fonts` histogram shows an unexpected font, or **a title that should use the display font is in body font**.
- **Cause**: **helper signature drift across batched builds was out of sync**. Here page 01 was built in an early batch,
  at which point `mkText` had no `font` parameter yet, so the display samples on the "Type Scale Display" board all fell back to Inter;
  later batches (Cover / Landing) explicitly passed `font:'display'` and rendered correctly as Anton.
- **Detection**: `auditPage().fonts` gives the font histogram; spot-check per page whether "display-level size (≥56px) text is a display font".
- **Fix**: `penpot.fonts.findByName('Anton')` → `anton.applyToText(t, anton.variants.find(v => v.fontWeight==='400'))`.
  Here 4 corrections; some shapes throw `Value not valid`, handle one by one with try/catch.
- **Prevention**: the canonical `mkText` must **carry the font-role parameter from the start** (see `scripts/seed_storage.js`'s `opts.font`),
  don't add it halfway through — changing the helper mid-build makes early/late batches inconsistent, and this kind of inconsistency **won't trigger the geometry audit**, only discoverable via the font histogram.

### S7 `board_overlap` — sibling boards pressing on each other

- **Meaning**: two top-level board rects under the same PageRoot intersect (intersection area >1px).
- **Why it's the sneakiest**: it **is "created" by a fix**. The flow is
  "audit finds board height insufficient → `fitBoardHeight` grows the board → row length exceeds the fixed row gap → presses onto the next row's board".
  An audit that only checks "containment" is **completely blind** to this: the grown board naturally contains its own content, and the page role is all normal.
- **Judgment**: first look at the overlap width/height in `detail`; then see if it's **same-column** (same x) adjacent boards —
  same-column adjacent board overlap = the row gap was breached, the typical form.
- **Fix**: `reflowRows` (re-row the gap by actual board height). **Don't** change board height to fit the grid —
  board height is decided by content; what should fit the grid is the **row gap**.
- **Implementation note**: moving a board won't carry `layoutChild.absolute`'s child elements (api-pitfalls §10),
  you must `moveSubtree` and translate each element's world coordinates by the same (dx,dy), otherwise you get a secondary misalignment of "board moved, content didn't".
- **Order iron rule**: `fitBoardHeight` → `reflowRows` → `fitRootHeight`.
  Row re-flow must use the **real height after growing**, the root-board shrink must use the **real bottom after reflow**. Reverse order means running two rounds.

### S8 `text_overlap` — two text segments pressing together

- **Meaning**: two text segments under the same parent have overlapping visual rects by >60%. Almost certainly means misalignment, duplication, or residue.
- **Why only text-vs-text**: shape overlap is too noisy — scrim over panel, palette backing, background bar under title are all deliberate.
  Text overlapping each other is rarely design intent.

### S9 `malformed_text` — malformed text left by helper-argument misalignment

- **Form**: `characters` is **pure digits** (`/^\d{1,4}$/`) **and `height ≥ 200`**.
  > Threshold is 200, not 36. Tested lesson: using 36 would false-report **all normal numeric labels** —
  > pagination `1/2/3`, year `2026` boxes are only **40–44** tall (they live in 40px-tall capsules);
  > while truly malformed boxes are **400 / 500 / 600** tall (that's the font-weight value misused as height). The two differ by an order of magnitude.
  > To be stricter, add "height inconsistent with same-level rect heights".
- **Cause**: two helper signatures differ in the same build (`R(b,x,y,w,h,fill,…)` vs `X(b,x,y,w,label,…)`),
  calling the text helper as the rect helper → the whole argument chain misaligns: `label`←height, `fontSize`←label, `h`←weight, color all black.
  See `api-pitfalls.md` §13.
- **Why it's harmful**: it simultaneously creates **two** visible faults — garbage numbers appear on screen, and these malformed texts' `h` (400/500/600)
  raise `fitBoardHeight` by hundreds of px, **breaching the row gap and pressing onto the next row's board**. So when "a board is mysteriously a few hundred px taller",
  the first thing is to scan S9; this board's height anomaly is a content problem, not a layout problem.
- **Detection precision**: tested exact hit 23/23, zero false positives (real KPI value `120` height is only 44, far below the anomaly zone above the 36 threshold;
  can add "height inconsistent with same-level rect" to tighten).
- **Fix**: reverse-derive and restore the arguments by the misalignment relation, **no rebuild needed**:
  `characters` = the intended height; `fontSize` = the intended label (only numeric survives);
  invalid `fill` means the intended font size fell into `fills`; `h` = the intended weight. Combined with "same-level same-x/w rect height" you can reverse-look-up the intended height.
  ⚠️ After restoring, **must re-set `align`** (see S10), and verify via readback after writing.

### S10 `align_not_applied` — alignment property write silently fails

- **Meaning**: the code set centering/right-alignment on text, but it renders left-aligned (label stuck to the container's left edge).
- **Cause**: wrong property name. Text horizontal alignment is **`align`**, **there is no `horizontalAlign`**;
  assigning under a wrong name in `try/catch` **silently fails**, the code "looks like it ran". See `api-pitfalls.md` §12.1.
- **Judgment**: **readback immediately after writing** — `if (t.align !== want) throw`.
  readback `undefined` ⇒ wrong property name; read-back old value ⇒ illegal value/type.

### S11 `loose_assembly` — loose assembly (a complete primitive set not collected into a group/component)

- **Meaning**: under the same parent, a host (rect/ellipse/board ≥24) and sibling primitives whose "center falls inside it, and the smallest host is it"
  form an assembly (base plate + label/icon/sub-part), but they aren't collected into the same **group** or **component** — loose same-level stacking.
- **Cause**: building by `absMount`-ing each piece into the board without ever collecting; consequence is **select/move/reuse all degrade**:
  dragging the base plate leaves the label behind, component registration yields an empty shell, design-to-code can't map an assembly to one component.
- **Contract** (`penpot-structure.md` §4.1): reusable assembly → **component** (`createComponent([group])`,
  pages use `comp.instance()`); single-use complete set → **group** (`penpot.group([host, ...members])`);
  pure decorative singles can be loose. Label-less complete sets (track+thumb) can't be identified by the audit, group manually.
- **Fix**: `storage.groupAssemblies()` (inside-out by ascending area, minimal-host ownership, nested groups, idempotent, only touches hierarchy not coordinates).
  Already-compliant assemblies (within a group/component) aren't reported; after fixing, recompute `loose_assembly = 0`.
- **Note**: after `groupAssemblies`, newly added primitives if hung loose directly will report again — **run once at the end of each G4 chain**.
- **Note**: in the audit script, read alignment as `s.align`; if legacy code wrote `s.horizontalAlign || s.align`,
  **it takes the latter** (the former is always undefined), so the audit result is trustworthy — but the write side must use the correct name.
- **Keep the fix scope restrained**: don't use loose criteria like "box width matches the base rect" to sweep the whole file — tested it false-hurt
  structures like "a media rect inside a card as wide as the text box" (one false-hurt of 9).
  Tighten to **box width + box height both matching the base rect** (full stacking) to judge centered, tested zero false positives.

## II·supplement, meta-lesson: audit must cover "the output space of the fix action"

This is more important than any single signature; it's the common point of two incidents:

> **Each round of fixing "moves" the defect space elsewhere. The audit's coverage must include the output the fix action may produce,
> otherwise "fixed" just means "moved the error to where I can't see it".**

Comparison examples:

| Round | Fix action | New defect | Could the audit then find it |
|---|---|---|---|
| Round 1 | `fitBoardHeight` grows the board | row length breaches row gap, presses next row's board | ❌ only checked containment → reported CLEAN, yet user saw lots of misalignment |
| Round 1 | `fixOverflowRight` shifts text left | may collide with left-side elements | ❌ no overlap check |
| Round 1 | `fixColumnOffset` shifts whole block | target position may be occupied | ❌ no overlap check |
| Round 2 | `createVariantContainer` re-hangs master | label left outside board (S5) | ❌ no root_stray check then |
| Round 3 | mid-way added font param to `mkText` | early/late batch font inconsistency (S6) | ❌ geometry audit can't detect in principle |
| **Board day one** | two-column layout: W col `x=80 w=1440` (→1520), M col `x=1400` | **two columns overlap 120px (every screen overlaps)** | ❌ no overlap check ever; and this **isn't fix-introduced, it's "native" error** |
| Round 2 | `R`/`X` two helper signatures mixed | 23 malformed texts (S9) + board inflated 400–570px breaching row gap | ❌ no S9, no S7 then |
| Round 4 | manual fix wrote property as `horizontalAlign` | 23 alignment fixes all ineffective (S10) | ❌ undiscovered without readback |

> **Note the "native error" row**: not all misalignment comes from fix actions.
> The two-column overlap existed from board day one, and every prior round's audit reported it CLEAN.
> So when audit dimensions are incomplete, **"always CLEAN" ≠ "always correct"**, only "this dimension was never checked".

**Landing rules**:
1. **After changes, always check "adjacency"**: any fix that "moves / grows / re-hangs" must run S7 + S8 once.
2. **Every repair engine must state in SKILL "what defect it introduces, who covers it"**, otherwise it's a landmine for the next round.
3. **Audit judgment dimensions must be orthogonal**: containment (in) / overlap / size / font / structure (stray).
   Containment alone is insufficient — in this system's two incidents, the user's perception problem came once from **containment**, once from **overlap**.
4. **Don't declare CLEAN too early**: `verdict: CLEAN` only means "current checks didn't hit".
   The delivery wording must be "**passed N checks**", not "no problems".

### Two iterations of the judgment rules (must use the corrected rules)

| Check | Version 1 (noisy) | Corrected (usable) |
|---|---|---|
| Containment | use shape outer frame | **text uses visual rect** (estimate text width by alignment), otherwise wide text boxes false-overflow |
| Degenerate size | width or height ≤1 | `1×1` or text ≤1; **exclude 1px hairlines** |
| Header collision | top text ≥16 | top **font size ≥20** text; exclude background boards |
| Center residual | deviation >0.5 all reported | only report ≤8px **and** text-box width ≥ host×0.72; others become `info` |

## III. Prevention contract (hard gates written into the flow)

### G1 [Gate] Before acting, must read the canonical scripts; no improvising coordinate/text helpers

The **step 0.5** of `code-to-design` and `design-to-code` (before seeding):

1. Read `scripts/seed_storage.js`, **paste and execute as-is**; when a new factory is needed, **add** a function, don't rewrite `mkAbsBoard`/`absMount`/`mkText`.
2. Read `scripts/repair_engines.js`, paste and execute as-is, as a mandatory end-of-run item.
3. If a custom text box is truly needed (e.g. fixed-size field), it **must** be covered by `audit_layout.js`'s S2 check after building,
   not allowed to "set `verticalAlign` and call centering done".

> Criterion: any build's execute_code that contains a self-written `mkAbsBoard` / `absMount` / text-box function body is a violation.

### G2 [Gate] Approach C is default; approach A must pass first-board export first

Bare board + world coordinates (approach A) will whole-page offset `-board.y` on some files/versions.
**Only after running "first board built → immediately export → eyeball confirm no offset" on this environment** may you batch with approach A;
otherwise always `addFlexLayout()` + `flex.dir` + sizing fixed (approach C).

### G3 [Gate] After building each board, immediately run the single-board audit

Don't wait for the whole page. **Immediately after each board is built, `storage.auditPage()` and only look at the new board's findings**.
S1/S4 surface on the very first board, avoiding copying the same offset into 120 boards.

### G4 [Gate] End-of-run must run the alignment engine, fixed order

```
cleanOrphans() → fixStaleCenter() → alignPage() → vAlignPage() → fixInner() → unclip()
```

`fixStaleCenter` must come **before** `alignPage`: it fixes the >6px stale-center large offset (fingerprint judgment),
after which the residual micro-difference goes to `alignPage`'s ≤6px snap; reverse order means the large offset never gets fixed.

Once per page; **must record the returned repair log** (`[position, content, axis, offset]`) and review manually, then restore false-hurts.
`vAlignPage`'s known false-hurt surface (deliberate off-center: stepper +/−, Progress top label) restored per the known coordinates in `engines.md` §1.

### G5 [Gate] Acceptance must be full coverage; no sampling-announced completion

- Each board **exported at least once**; when many pages, do a contact sheet per page (whole page one image) for a first pass, then export suspicious boards individually.
- Delivery-wording discipline: **boards never exported must not be described as "verified"**. Write "unverified" if not verified.

### G6 Session resumable: persist progress

Connections are volatile (this time `penpot.local:443` connect timeout interrupted).
- Before building, probe whether the endpoint is up (`assets/penpot-server/scripts/status.*`);
- **Write the build queue + completed-page list into a workspace file** (e.g. `build-progress.json`), don't only keep it in `storage`;
- After reconnect, resume by file, and use `audit_layout.js` to recompute built pages, confirming no half-built pages.

### G7 Proxy must allow `penpot.local`

When the local HTTP/SOCKS proxy is configured (`http://localhost:8118` / `socks5://localhost:30000`),
`penpot.local` gets sent to the proxy for resolution and times out. Add `penpot.local`, `localhost`, `*.local` to `NO_PROXY`,
or disable the proxy for the MCP client process.

### G8 [Gate] Audit dimensions must be orthogonal; each repair engine must state "what defect it introduces, who covers it"

This is the costliest lesson of the two incidents: **when the audit covers only one dimension, the fix moves the defect into that dimension's blind spot.**

- **Dimension list (none dispensable)**: containment (in) / overlap / size / font / structure (stray).
- **Fix action → possible defect introduced → covering check** must be registered in pairs:

| Fix action | Possible defect introduced | Covering check |
|---|---|---|
| `fixColumnOffset` shifts whole block | target occupied → collision | S7 + S8 |
| `fitBoardHeight` grows board | row length breaches row gap → presses next row's board; **or swallows misplaced child to legitimize it** | S7 + `maxGrow` guardrail |
| `reflowRows` re-rows gap | subtree misses translation → board moved but content didn't | S1 containment recompute |
| `createVariantContainer` re-hangs master | label left outside container | S5 `root_stray` |
| mid-way add param to helper | early/late batch inconsistency | S6 font histogram |

- **After fixing, must rerun "adjacency" checks (S7/S8)**, not just recompute containment.
- **Delivery-wording discipline**: `verdict: CLEAN` only means "this set of checks didn't hit". Phrase externally as
  "**passed N checks (list them)**", not "no problems".
  This system had one real delivery incident: reported "14/16 pages CLEAN", but the user still saw lots of misalignment on the Demo page —
  because the check set then had no "overlap" dimension.

### G10 [Gate] Assembly must be grouped (group) or componentized (component); no loose same-level stacking

Full contract in `penpot-structure.md` §4.1, three-sentence version:

1. **A complete primitive set (base plate + label + icon + sub-part) must be collected into one kind of container**: reuse / into the 13 index → **component**
   (`createComponent([group])`, pages always `comp.instance()`); single use → **group** (`penpot.group([host, ...members])`).
2. **Machine enforcement**: audit signature `loose_assembly` (S11) checks loose assemblies; repair engine `groupAssemblies()` absorbs them;
   run at the end of each page's G4 chain (idempotent), recompute `loose_assembly = 0` to pass the page.
3. **Unsure → group first**: `createComponent([group])` can upgrade the whole group to a component, zero rework; reverse (loose → component) needs rebuild.

**Introduced defects and coverage (G8 registration)**: `groupAssemblies` only changes hierarchy (collect into a new group within the same parent), no coordinate/style change;
possible false-hurt is "collecting two deliberately-stacked pieces into a group" — excluded by minimal-host ownership + nesting semantics; a wrong group can be restored with `penpot.ungroup(g)`
(group name = host name, log checkable). Subsequent `alignPage`/`fixStaleCenter` all traverse the tree, working across group boundaries as usual.

## IV. Standard operation order (replacing "build by feel then export")

```
0.5  Read and paste seed_storage.js + repair_engines.js + audit_layout.js + fix_geometry.js   ← G1
1    First board (page 01 first block) built → auditPage() → pass → directly export eyeball confirm                      ← G2/G3
2    Batch build: each board built immediately runs single-board audit (only this board's findings)                                   ← G3
3    Phase 1 "geometry": per page fixGeometryAll({apply:false}) → list → review → {apply:true}
     (internal order fixed: fixColumnOffset → fitBoardHeight → fixOverflowRight → reflowRows → fitRootHeight)
4    Phase 2 "alignment": cleanOrphans → fixStaleCenter → alignPage → vAlignPage → fixInner → unclip ← G4
     → groupAssemblies (assemble into groups, idempotent; loose_assembly=0)                                 ← G10
     → fixZOrder (in-group front/back: big base at bottom label on top; group occupies top-member layer slot) ← G10
5    Recompute: auditPage() must be CLEAN, and **must include S7 overlap / S8 text overlap** two items
     (remaining items must each be manually confirmed as deliberate inset = text_centre_info)
6    Acceptance: export per page (large boards need retry), record per-board whether actually exported                             ← G5
7    Persist progress and list                                                                        ← G6
```

### Why split the two repair phases (tested data from the second incident)

One 16-page system's tested distribution: `out_of_bounds` 121, `header_collision` 31, `degenerate_size` 85, `text_centre_residue` 29.
After splitting by signature:

| Phase | Engine | Actual hits | After fix |
|---|---|---|---|
| Geometry | `fixColumnOffset` | 6 right-column boards, **77 child elements**, dx always +920 | pages 01/02 immediately CLEAN |
| Geometry | `fitBoardHeight` | 16 boards grew 4–140px | pages 03/04/06/07/10/12/13/15 CLEAN |
| Geometry | `fitRootHeight` | 6 PageRoots grew | pages 05/09/11/14 CLEAN |
| Geometry | `fixOverflowRight` | 3 right-aligned text boxes shifted left 84px | page 11 CLEAN |
| — | clean `root_stray` | 2 stray bound instances | pages 01/03 CLEAN |
| Phase 2 | `alignPage`/`vAlignPage` | **not run** (trigger domain 0) | — |
| **Regression** | **`fitBoardHeight` grown boards breach row gap** | **Demo page still lots of misalignment** | ❌ no overlap check then → missed |

**It then reported "14/16 pages CLEAN", but the Demo page (14) still showed lots of misalignment to the user — this CLEAN was a false negative.**
The reason: `fitBoardHeight` grew 6 Demo boards past the 960px fixed row gap, pressing onto the next row's boards;
while the audit then only had the "containment" dimension, completely blind to "overlap". Found only after adding S7.

Three conclusions:
1. **Fix geometry first, then see whether to run the alignment engine**. This time all 121 out-of-bounds were resolved by the geometry engine;
   if you ran `alignPage`/`vAlignPage` upfront, you'd fix no out-of-bounds and would snap on a wrong baseline, introducing new false-hurts.
2. **`vAlignPage` is not essential**. Its trigger domain (5–15px, small-board single-line text) hit 0 in this incident;
   the real lesion was "content block misplaced to the origin". **Diagnose the signature first, then decide which engine**, don't run blind by checklist.
3. **Geometry repair must end with "re-row gap + shrink root height"**, and the order is
   `fitBoardHeight → reflowRows → fitRootHeight`. Doing only the grow without the re-flow equals moving the defect from
   "content overflows board bottom" to "board presses neighbor" — **both visible to the user, and the latter is easier to miss in audit**.

### Acceptance: export timeout is "page-level"

Multiple boards on the same page failing export in a row (here page 01, PageRoot height 2960px, `page.goto: Timeout 20000ms exceeded`,
stuck at `waiting until "networkidle"`), while other pages in the same file are normal → this is the known "large-board export timeout", **batch by page + retry**.
If **all pages** time out and the exporter log shows `networkidle` timeout, even though `penpot-frontend:8080` is reachable (tested 200),
first `docker restart penpot-server-penpot-exporter-1` — this is an exporter-side state lockup, restart recovers it.

## V. Audit output interpretation discipline

- `verdict: CLEAN` only means **four signature classes didn't hit**, not pixel-level correct; still must run the PIL comparison in `verification.md`.
- When `text_centre_residue_*` hits a lot and concentrates on the same host class (e.g. all 52px-tall fields),
  that's a **systematic helper defect**, should change the helper and rerun, **don't** expect `vAlignPage` to rescue one by one.
- The audit is read-only. **First produce the list for manual review, then go to repair** — a wrong expectation model would change all elements wrong (`engines.md` §1 gridSnap lesson).
