# Layout Library — built-in chrome primitives and business screen recipes

> **Purpose**: the skill no longer invents layout coordinates per task. Every screen is assembled by calling
> `scripts/layout_engine.js` (`storage.LY.*`), which implements the region math below and returns **world-coordinate rects**.
> This file is the human-readable twin of that table: same keys, same numbers. If the two disagree, the script wins for building and this file wins for explaining.
>
> Provenance legend: **[spec]** = verbatim from a published system (AntD / M3 / Fluent / Carbon / HIG / USWDS / VitePress CSS) → treat as HARD in `audit_design.js`;
> **[obs]** = median measured across the named products → a default the agent may move by **one scale step**, never by an arbitrary amount.

## 0. Use rules (gate G11)

1. **Never hand-write region coordinates.** Build a screen by `LY.frame()` → `LY.split()` / `LY.grid()` / `LY.flow()` → `LY.rect(key)`,
   and mount the region boards at those rects — the supported path is `NL.fromRecipe(key, {parent, x0, y0, …})`, which
   mounts each region **absolute at its `LY.rect` and gives it a flex interior**; fill that interior with `NL.add(region, control, 'fix','fix')`
   / `CF.instance(...)` (never `'auto'` on a board — it hugs and collapses to the label). `storage.absMount` remains correct
   for spec boards, anatomy diagrams and pixel-exact overlays (native-layout §9). If a recipe is missing,
   **add a recipe to `layout_engine.js` and document it here** — do not improvise numbers in `execute_code`.
2. **Web screens are long documents, not one viewport.** Height comes from band stacking (`LY.flow`), not from a canvas habit. See §0.4.
3. **Panes abut with a 1px hairline and 0 gap**; gaps live inside panes (design-guide §1.3).
4. **Every region carries its own padding**; do not let two nested regions share one pad (that is how content ends up 96px from the edge).
5. The recipe tables are written at the **web baseline width 1440**; `LY` re-derives them for any width and for pad/mobile (tiers §4).

### 0.4 Frame vs document height (the "long page" rule)

| Screen kind | Board size (web 1440) | How height is produced |
|---|---|---|
| **App screen** (dashboard, list, settings, email, chat…) | `1440 × max(viewport 900, contentH)` | bands sized by content; if `contentH < 900`, keep 900 and let the last region stretch (never leave dead space) |
| **Marketing / content page** (landing, pricing, blog, docs article, PDP) | `1440 × 1600…4000+` | `LY.flow` sums band heights: hero 560–760 + logo strip 120–160 + feature band 400–560 + … + footer 320–480 |
| **Mobile screen** | `375/390 × 812…(content)` | viewport chrome stack is fixed (§4.3), content flows; a feed page is 1600–2400 tall |
| First-screen marker | drawn as a **dashed 1440×900 outline** labelled `fold` | reviewers must see what the fold contains; `LY.fold(board)` |

**HARD**: a marketing board shorter than 1600px tall at 1440 wide, or an app board locked to exactly 1080 with empty bottom, fails audit signature `viewport_locked`.

## 1. Frames: the five math primitives

```
LY.frame({w,h,tier,chrome,topExtra,bottomExtra}) → { tier,w,h, statusBar, topBar, bottomBar, safeBottom, content:{x,y,w,h}, chrome }
LY.container(rect,{maxW,margin,top,bottom})      → centered content column rect   (1440 → inner 1152 @margin 32/gutter 24 [spec])
LY.grid(rect,cols,gutter)                        → [rect×cols] + .span(n,from) .colW .gap   (12 / 8 / 4 by tier [spec])
LY.split(rect,{panes:[{w|ratio|flex,min}]} | {mode}) → { panes:[rect], dividers:[x], gap }
LY.rows(rect,[{h|flex}],gap)                     → [rect×n]   (vertical stack, last flex row absorbs the rest)
LY.flow(rect,{bands:[{key,h|auto,minH}],gap})     → { bands:{key:rect}, order:[key], totalH }   ← the "long page" primitive
LY.repeat(rect,count,gap,axis)                   → [rect×count] + .cell   (KPI cards, tiles, calendar cells)
LY.snap(v,unit) · LY.onScale(v) · LY.tier(name) · LY.tierFor(w) · LY.pick(tier,{web,pad,mobile})
```
`mode` presets (web baselines): `rail` 68+flex · `nav` 240+flex · `list` 380+flex · `detail` flex+320 · `facet` 264+flex · `copy` 560+flex.

Two safety nets the agent must not route around:
- **no negative/NaN length ever leaves `LY`** — every rect passes one clamp that records `plan.overflow` and a human-readable cause.
  If `plan.overflow` is non-empty the layout does not fit this tier: fix the tier or the pane set, do not paint it.
- **`LY.recipe(key,{tier})` refuses a recipe that is not defined for that tier** and returns `{err, use}` pointing at the tier-appropriate
  recipe (§5 table). A three-pane app screen at 375 is not "the same layout, narrower".

Canonical container widths: `1440 − 2×32 = 1376` full-bleed content; with a 240 nav → `1200 − 2×24 = 1152` inner [obs];
Bootstrap max `1320`, VitePress layout max `1440` [spec] — so **1152–1200 inner is the web default**, 640–760 for prose (design-guide §3.4).

## 2. App chrome primitives (page `10 · App shell & chrome` spec boards)

Each primitive is a spec board with: anatomy (annotated) → variants (the listed columns) → responsive behavior note → Do/Don't.
Heights are the control band, widths are the region they own.

| Key | Region | Anatomy numbers | Variants that must exist on the board |
|---|---|---|---|
| `appBar` | product top bar | h **56 / 64** [spec AntD Layout header 64, padding 0 50] · logo 24–32 h · global search **320–420×32** · right icon buttons **32×32**, gap 8 · avatar 32 · page padding 0 24 · bottom hairline 1px | full · with-search · with-breadcrumb · with-tabs-below · scrolled-with-shadow |
| `marketingNav` | landing nav | h **64–80** · logo 24–32 · 5–7 links 14px gap **24–32** · ghost button 40 + solid **44–48 × 140–180**, gap 12 · transparent-over-hero variant | light · dark/inverted · sticky-with-blur · mobile-hamburger(44 target) |
| `sideNav` | navigation pane | w **224 / 240 / 256 / 272 / 288** (never >320) [obs; AntD Sider 200 default, 80 collapsed [spec]; every-layout sidebar 320 [spec]] · group label row 32 (11px uppercase muted) · item **40–44** h, pad 0 12, radius 6 · active = tinted bg + optional 2px leading bar · icon 20, icon↔label 12 · badge right 18–20 | expanded · **collapsed rail 80** · two-level (group + child, indent 16) · with-search-on-top · with-user-card-bottom · dark-panel variant |
| `navRail` | icon-only rail | w **64–72** · item target 40–48, icon 24 · gap 6–8 · active = white pill/bar **4×32** [obs Discord 72 / VS Code 48] | default · with-label-under-icon · with-overflow-menu |
| `drawer` | overlay side panel | w **378 / 736** [spec AntD presets] · M3 modal drawer **360** [spec] · mobile full-bleed 320–375 · header 56 (title 16 + close 32/44 target) · body pad **16–24** [spec AntD drawer 16×24 header, body 24] · footer bar 56, primary right | right · left · narrow(378) · wide(736) · with-footer |
| `toolbar` | action band | h **48–56** · controls 32 h, gap 8–12 · left cluster = primary actions, right cluster = density/column/download icon buttons 32 · bottom hairline | with-search · with-segmented · with-filter-chips · bulk-selected (tinted bg, "N selected" + 2–3 text buttons + X) |
| `filterBar` | query band | h **48–56** · chips **28–32 h, radius 16**, gap 8 · or 3–4 selects **160–200×32** · "clear all" 13px text button | chips · selects · chips+date-range (**200–260×36** [obs: the #1 dashboard control, keep it left of actions]) |
| `tabBand` | section tabs | h **48–56** · item h 48, w **88–160**, pad 0 16, label 14/500 · active **2px underline** (M3 indicator 3dp [spec]) · count chip 18–20 · scrollable when >6 · vertical variant pad 8×24 [spec AntD] | line-top · card-style · with-icons · vertical-left · scrollable-with-arrows |
| `pageTitleBand` | page header | h **72–96** · H1 **24–32/1.2** · subtitle 14/20 · eyebrow/status chip 24–28 h · right cluster: 1 primary + 1–2 secondary (32–40 h) + kebab 32, gap 8 · measure of title ≤720 | title-only · title+description · title+tabs · title+meta-row(avatar 24 + owner 13 + dot + relative time 12) |
| `breadcrumbBar` | path row | h **40–48** · 12–13px · separator `/` or `›` 12 · current = primary text color, rest = tertiary | default · with-back-arrow(mobile) · file-path-with-icons |
| `paginationBar` | list footer | h **56–64** · left "1–50 of 1,284" 13px · right prev/next **32×32** + numbered **32×32 gap 4** (show ≤7) + per-page select **88–120×32** | numbered · simple-prev/next · load-more **44 h × 200** · mobile-load-more |
| `listPaneHeader` | pane title row | h **48–56** · title 15–16/600 + count 12 · right icon buttons 28–32 | with-search-below · with-filter-only |
| `appFooter` | in-app footer | h **48–56** · links 13 · legal 12 muted · top hairline | minimal · with-version+timestamp(right) |
| `marketingFooter` | landing footer | padding **48–64** · **4–5 columns × 160–220** · column title 13/600 + links 14 gap 12 · brand block 240 · legal row 40 with hairline · newsletter input **280×40** | 4-col · 5-col+brand · compact-legal-only · dark |
| `statusBar` / `bottomBar` (mobile) | device chrome | iOS status **44** (20 legacy) · nav bar **44** (large-title 72–96 collapsing) · tab bar **49** [spec HIG] / M3 bottom nav **80, active indicator 64×32, min tab target 48×48** [spec] · home-indicator inset **34** [spec HIG] · FAB **56** (small 40, large 96 [spec]) margin 16 | iOS tab bar 3–5 tabs (75 each @375) · M3 bottom bar · top large-title · bottom action bar 56+34 |
| `emptyState` | first-run / no-data | illustration/icon **120–160** · headline 18–20 · body 14/1.5 **≤400 wide** · primary 40–44 min 140 · secondary text link · ≤3 actions · block centered in the pane | no-data · no-results(with query echo) · error(with retry) · 403/404/500 (whole-page template per tier) |
| `commandPalette` | overlay | dialog **560–672** wide (max ~720), top offset **80–120**, radius 12–16 · input row **52–56** (icon 20 + gap 12, text 16–18, clear 24) · results max-height **320–400** with internal scroll · group header 28–32 · item row **40–44** pad 0 16 (icon 16–20 + label 14 + right **kbd chips 20–24 h radius 4 11px mono**) · footer 36–40 with hints 12 | default · grouped-with-recents · with-preview-pane · empty |

## 3. Business screen recipes (`LY.recipes`)

Recipe key = the name you pass to `storage.LY.rect('email3')`. Each table lists regions in DOM/visual order; `h` is band height, `w` is pane width.

### 3.1 `email3` — email client, three-pane (1440×900 app screen)

```
┌───────────────────────── appBar 56 ─────────────────────────┐
│ folder 240 │ list 380 │ reading pane 820                     │
│  nav       │ rows     │ header 104–144 / body / attachments │
│            │          │                     ┌─ composer ─┐   │
└────────────────────────────────────────────  520–680×460–540 ┘
```

| Region | Numbers |
|---|---|
| appBar | h 56–64 · global search **400–640** left-of-center · gear + avatar right, icon buttons 40×40, gap 8 |
| folderNav | w **240–272** (or 84 icon rail) · **Compose button 152–200 × 40–44**, margin 16 · folder rows **32–36**, pad 0 12 · count chip right 20 h · 8–12 folders + Labels group + separator |
| listPane | w **320–400, default 380** · filter toolbar 40–44 (segmented tabs 28 h) · conversation row **64–72** default (3-line: sender/subject/snippet), comfortable **88–96**, compact **40–48** [spec: Gmail ships exactly these three density modes] · avatar 32–40 left · unread = 8px dot + 600 weight · row pad 12×16 · 1px bottom hairline |
| readingHeader | h **104–144** · subject 20–22/28 · sender row 48–56 (avatar 40, name 14, email 12 muted, time 12 right, 4×32 icon actions) · attachment tiles **88–96 sq** (images) or file rows 40–44 |
| messageBody | **measure 640–760 (never full pane width)**, pad 32×40, 15–16px / 1.5–1.6 · collapsed quote row 32–40 · each additional thread message = 48–64 summary row |
| composer (docked) | **520–680 × 460–540**, bottom-right, radius 8–12 top, shadow level 4 · header row 40 ("New message" + minimize/close 24) · To/Cc/Bcc rows **36–40** each · body min **180–220** · toolbar 40–44 (5–7 icons 24 + **Send 96–120×36–40 on the LEFT** + discard right) |
| mobile 375 | list only: search band 48 + filter chips row 40, rows **84–96** (avatar 40, subject + 2-line snippet) → message = full screen: app bar 56 (back/star/archive/delete), sender block 64–72, body pad 16, quote disclosure 40 → composer = full-screen sheet, input 44, toolbar 44 + inset 34 |

Gaps: panes abut with hairlines (0 gap); internal rhythm 8/16/24. Exemplars: Gmail, Outlook web, Superhuman, Proton Mail.
**Amateur mistakes (lint these in your own output)**: three **equal** panes (480/480/480 — kills the 65-char measure; correct ≈ 256/380/804) ·
composer `Send` right-aligned · reading body at 1100+ px wide · unread signaled by color only · toolbar icons floating without a 48–56 hairlined band.

### 3.2 `calMonth` / `calWeek` (days:1 = agenda column) / `eventPopover` — calendar

**`calMonth` @1440**: title band **64–72** (view segmented 200×36–40, "Today" 72×32, search 240) → weekday header row **32–40** (12px uppercase muted, centered) → 7 columns × 5–6 rows.
- cell width `(1440 − 2×32) / 7 ≈ 196` · cell height **120–148** ([spec] FullCalendar default `aspectRatio 1.35` → 196×145; clamp min 100, max 152).
- date numeral 12–13 top-right (Google) or top-left · today = filled circle **24–28**.
- **event chip h 20–22**, radius 3–4, font 11–12, horizontal inset 4–6, tinted fill + optional 4px leading bar (Outlook) · one line, ellipsis · **max 3 chips** then `+N more` row 16–18.
- **HARD: month cells are not square** (196×196 wastes ~40% of the screen).

**`calWeek` @1440**: time gutter **56–72** (Google ≈64, Outlook ≈70) with hour labels 10–11px right-aligned + 8 pad.
- **hour row height 44–48** (compact 36 → comfortable 64) → whole-day scroll height `24×48 = 1152` · half-hour line 1px @50% alpha.
- day column width `(1440 − 64 − 32) / 7 ≈ 189` · day header 56–64 (weekday 12 + numeral 20–24 circle).
- event block: `top = startMin/60 × hourH`, `height = durationMin/60 × hourH`, **min-height 22**; overlaps split the column into `n` sub-columns, width `col/n − 4`, gap 4–6; 2px leading accent bar; now-line 2px + 8px dot.
- all-day band (week/day only): **32–40 per all-day row**, label column "ALL-DAY" 88–100.

**`calDay` = `LY.recipe('calWeek', { days: 1 })`**: one column, but keep the time gutter 64–72; the column is then as wide as the canvas,
so cap the *event cards* at **640–880** and left-align them (a 1300px-wide event block is unreadable). Event card **88–144** (title 15–16, time 13,
attendee avatars 24 with −8 overlap), gap 16.
**`calMini`** is a *component*, not a screen: `CF.miniCalendar` (header row 32 · weekday row 20 · 7 columns of **32×32** cells at gap 2 · 6 rows → **252×262**, event dots 4) sits in a 240–300 left panel; pass `cell: 40` when it is used as a touch target on pad/mobile.
**`eventPopover`** (recipe): card **320–360 wide** (mobile 327), h **384**, pad 16, band gap 8 → title 36 · all-day 32 · start 36 · end 36 · calendar 36 · location 36 · "more" 36,
footer 36 with `remove` left (ghost) and `save` right (88×36 primary). It is placed 8px below the anchor cell and **flips above** when it would clip the canvas — never centred on screen, never full-width.
Mobile 375: month cell ≥**44×44** touch, weekday row 32, chips 4–5 + dots; week = 1–3 columns of 100–112 with gutter 48, hour 44; agenda rows 72–88; **FAB 56** at margin 16.
**Mistakes**: hour rows 24–32 (15-min events unreadable) · no all-day band · **hour labels vertically centered on the gridline instead of at its top edge** (the classic tell) · square month cells · chips 12px-on-18px with no fill contrast or no inset · no `+N more`.

### 3.3 `dashboard` — analytics (1440: nav 240 + content 1200 − 2×24 = **1152**)

| Region | Numbers |
|---|---|
| appBar / sideNav | §2 `appBar` + `sideNav` (224–272, items 40–44, 6–12 items) |
| pageTitleBand | 72–96 · right-aligned date-range picker **200–260×36** (keep left of actions) + refresh/share 32 |
| filterBar | 48–56, chips 28–32 radius 16 gap 8 · or 3–4 selects 160–200×32 |
| **kpiRow** | **4 cards**: `w = (1152 − 3×24)/4 = 270`, h **120–160**, pad 20–24 · label 12–13 · value **28–36 / 1.0** · delta 13 with 12–16 arrow · sparkline **60–80×24**. **HARD: never >6 KPI cards in one row at 1440** (each <180 → values wrap) |
| chartGrid | 12 cols gutter 24 · **convention: `colW = (inner − gutter×(cols−1)) / cols`**, so at inner 1152 colW = 74 → hero chart 8 cols **760×320–400** · side 4 cols **368** (760+24+368 = 1152 exactly) · or two 6-col **564** · card pad 20–24 · header 32–40 (title 14–16 + **legend right of title, never below the plot**) · **plot min-height 240** · axis labels 11–12 · **4–6** horizontal gridlines 1px · legend swatch 10–12 + gap 6–8 |
| table | header row 40–48 · body rows **48–56** (cell pad 16×16 → ≈56; middle 12×8; small 8×8 [spec]) · primary text col 260–360 · numeric cols **100–160 right-aligned** · status chips 88–120×24–28 |
| insightRail (optional) | 320–360 with 5–8 annotation rows 56–72 |
| mobile 375 | KPI 2×2 of **159×120** gap 12 (or stacked 343×104) · charts full-width **343×240–280** one per band · table → card rows 72–88 (label 13 muted left / value 15 right) · filter = scrolling chips 32 · nav → bottom tabs |
Exemplars: Grafana, Metabase, Stripe Dashboard, PostHog. **Mistakes**: 6–8 equal KPI cards · all charts the same size (no 8/4 hierarchy) · legend under the plot · left-aligned numbers · 32 pad inside a 120-tall card · no loading/empty skeleton · filter bar stacked *above* the page title.

### 3.4 `listCrud` — admin list (search + filter + table + pagination)

| Region | Numbers |
|---|---|
| pageTitleBand | 64–72 · H1 20–24 · "1,284 records" 13–14 muted · primary **120×32–40** right |
| toolbar | 56–64, **one line only**: search **240–320×32** (icon 16 left) · 1–3 filter selects 160–200×32 (or a "Filter" popover with a count badge) · segmented view switch ~180×32 · spacer · density/column/download 32 · gap 8–12 |
| bulkBar | appears **above** the table, never replaces the toolbar · 48–56 tinted · "3 selected" + 2–3 text buttons + X |
| tableHeader | 40–48 · checkbox col **40–48** · sortable caret 12 · 1px bottom rule |
| rows | default **48**, compact **40**, dense **32** [spec Carbon sm/md/lg = 32/40/48] · cell pad 16/16 → 12/8 → 8/8 [spec AntD] |
| columns | 6–8 at 1440 ≈ 1152: checkbox 44 / name 280 / email 300 / status 140 / role 160 / created 160 / actions **88 icon or 120 for 2 text actions** |
| rowActions | hover-reveal kebab 24–32 **or** one inline primary + kebab — **never 4 visible text links** |
| paginationBar | §2 |
| rowDetail | drawer **378 / 736** or full record page (§3.5) |
| mobile 375 | no table: rows **72–88** (checkbox 40 or long-press, thumb 40, two lines 15/13, chevron 24) · search **343×36** + filter icon 36 · filter = bottom sheet (medium detent ≈ **50% of expanded** [spec HIG]) with Reset/Apply footer 56+34 · pagination → "Load more" 44 |
**Mistakes**: toolbar wrapped to 3 rows by 8 inline filters · 24 page numbers printed · mixed alignment inside one column / currency left-aligned · bulk bar replacing the toolbar (loses filters) · no sticky header at 900 tall · row 64+ with a single text line (fake airy admin).

### 3.5 `detailRecord` — record / issue / profile page

`breadcrumb` → `header (96–140)` → `tabBand` → **main 760–880 + side 288–352, gap 24–32 (HARD ratio 2.5–3 : 1, never 50/50)** → optional sticky footer 56–64.

- header: title **28–32/1.2** measure ≤720 · status chip 96–120×24–28 · meta row 20–24 (avatar 24–32 + owner 13–14 + dot + relative time 12–13 + tags 24 h) · actions right: 1 primary + 1–2 secondary + kebab, gap 8.
- main: sections 32–40 apart · section title 16–18 with optional 1px rule · property grid 2-col (label 120–160 muted / value 14–15) · description **15–16/1.6 measure ≤720** · nested cards pad 20–24 radius 8.
- side: "Properties" rows 32–40 (label 12–13 / value 14) · owner card 88–120 · attachments rows 40–48 · panels stacked gap 24.
- timeline: node/avatar 24–32 + connector 1px at x≈11–15 · 2 lines of text · spacing 16–24 · date group headers 24 · composer 44–56 at top.
- mobile: header 72–88 (title 22–24) · tabs 44–48 scrollable · single column · metadata → "Details" disclosure 48 · timeline rows 72 · **sticky bottom action bar 56 + inset 34**.
Exemplars: Linear issue, GitHub PR files, Notion page, Jira record. **Mistakes**: body at full 1152 width · 50/50 split · tabs above the title (or title inside the tab panel) · 9 meta items in one 12px line · timeline without connector or date grouping · no sticky primary on mobile.

### 3.6 `settings` — section nav + grouped panels + danger zone

- outer nav 224–280 · **inner settings nav 224–264, sticky top 24**: group label 32 (11–12 uppercase muted) · items **40–44**, pad 0 12–16, radius 6, active tint (+ optional 2px leading bar) · 6–14 items · gap to content 32–48.
- **content measure 640–720 (HARD: never >760)**, left-aligned at the nav edge + 32–48 padding; page title 24–32 → description 14/20 → panels gap 32–40.
- panel/card: pad **20–24**, radius 8, hairline or tone bg · rows **48–72** (single-line 48, two-line with helper 64–72) · 1px separators, none after the last row.
- control geometry: label column **200–280** + control column (controls left-aligned and **not stretched**): input **280–360×40**, select **180–240×40**, toggle **40×24** (iOS 51×31), checkbox/radio **16–20** + gap 8, buttons 32–40.
- save model: either instant-save + toast (top-right 320–360×48) **or** sticky bottom bar 56–64 right-aligned Cancel / Save gap 12 — **never both on one screen**.
- **danger zone = the last card**: hairline danger border or 6–8% tint · title 16 semibold · helper 13–14 · destructive button **outline red 40 h** (filled only when irreversible) · confirm dialog **400–480**, type-the-name for deletes · each item its own row 56–72.
- mobile 375: no inner nav → **iOS inset-grouped list** (side margin 16, radius 10, rows 44–52, section header 32 uppercase 13 muted, chevron 14, toggle 51×31 right, gap 32 between groups) · drill-in screens with back in a 44 nav bar · destructive = red text row + destructive alert.
Exemplars: GitHub, Linear, Stripe settings. **Mistakes**: inputs stretched to 100% of 1152 · danger action among neutral rows · 14 flat nav items with no groups · mixed save models · labels above every desktop field · content centered while the nav is stranded.

### 3.7 `heroCenter` / `heroSplit` — marketing hero + landing band sequence

| Region | Numbers (container **1200–1280**, side pad 32–40, full-bleed bands) |
|---|---|
| hero band | total **560–760**, vertical padding **80–120** |
| badge pill | 24–28 h, radius 12–14, text 11–13, tinted bg + 1px border, gap 16–24 above H1 |
| **centered hero** | H1 **48–64 / 1.05–1.12**, max-width **720–840** · subhead **18–20/1.5–1.6**, max-width **520–640** · CTA row centered gap 12–16, margin-top 32–40 |
| **split hero** | copy column **520–600** (H1 40–52/1.1, left-aligned) · media column **600–720** · gap 48–64 |
| app-shot / media-right | visual **760–920** wide, radius 12–16, shadow, often **−24 overlap** into the next band · centered layout → visual **1120–1200**, margin-top 48–64 |
| trust line | 13–14 muted, 24 below CTAs |
| logoStrip | band padding **40–56** · **5–7** logos, h **20–28**, gap **48–64**, one row, hairline or tinted bg · caption 12–13 uppercase |
| featureBand | 3 columns of **360–384** gap 24–32 · icon 24–32 · h3 20–24/1.25 · body **15–16/1.6 ≤40ch** |
| quoteBlock | 2 cols: quote **24–32/1.3** (measure 640) + attribution row 48 |
| pricingBand | §3.14 comparison table · CTA band 240–320 |
| footer | §2 `marketingFooter` |
- Landing **band sequence** = `nav → hero(560–760) → logoStrip(120–160) → feature×2–3(400–560 each) → quote(240–320) → showcase(400–640) → faq(360–480) → cta(200–280) → footer(320–480)` → **total 2400–4200 at 1440** (a "one-screen landing" is the #1 amateur tell).
- Mobile 375: nav 56–64 + hamburger **44×44** · hero padding 48–64 · H1 **32–40/1.1 (≤3 lines)** · subhead 16–17/1.5 · CTAs **full-width 343×48 stacked**, gap 8–12 · visual 343 · sections rhythm 56–72.
Exemplars: Stripe (split hero, 48 H1, 80 rhythm), Linear (centered hero, 56–64 H1, 1200 app shot), Vercel/Supabase.
**Mistakes**: H1 28–32 at 1440 (reads as body) or 96 with no measure cap (3 words/line) · **everything centered, paragraphs over 2 lines** · subhead wrapping 4 lines · both CTAs filled primaries · CTA 36 next to a 64 H1 · rhythm 24→96→40 · 12 logos at random heights · copy column 1200 wide (110 chars/line).

### 3.8 `blogArticle` / `docsLayout` — long-form and documentation

**The one number that matters: measure 640–760px ≈ 66–75 characters** ([spec] WCAG ceiling 80 chars, USWDS 44/60/64/68/72ex with 66-char target, `65ch` convention).

- `blogArticle` @1440: nav 64–72 → **content 720–768** centered → (right rail optional 240) → footer. Byline block: avatar 40–48, name 15–16, meta row 13–14 (date · read time · share), h 56–72, margin-bottom 32–48 · hero image = measure wide, 16:9 or 2:1, radius 8–12, margin-bottom 32–40 · reading-progress bar 2–3px top accent.
- `docsLayout` @1440: nav 64–72 · left sidebar **264–320** (row 32–36, indent 16) · content **720–768** · right TOC **200–240** sticky top 24 · gaps 32–48 ([spec] VitePress `--vp-layout-max-width:1440px`, `--vp-nav-height:64px`, sidebar breakpoint 960).
- Article type ramp ([spec] VitePress CSS + typical blog): H1 **36–44/1.1** (mb 24–32) · H2 **26–30/1.25** (**mt 48–56**, mb 16) · H3 **20–22/1.4** (mt 32) · H4 18/24 · body **16–18/1.6–1.8** (VitePress 16/28) · lead 18–20/1.5 · caption 12–13 · inline code 0.875–0.9em · code block **13–14/1.7** [spec `--vp-code-line-height:1.7`], pad 16–20, radius 8.
- callout/note: **4px leading bar** + tinted bg + pad 12–16, radius `0 8 8 0`.
- TOC: **2 levels only**, items 28–32 h, 13–14, active = accent + 2px leading bar, "On this page" 12 uppercase · anchors offset 88 for the sticky nav.
- code chrome: language tag 11–12 top-right, copy button 28–32, line-number gutter **40–48**, **horizontal scroll, never wrap**.
- author card 96–120 (avatar 48–56 + 2 lines + follow 32–36) · related posts **2–3 cards of 360–384** gap 24 (or rows 88–104 with thumb 96×64) · read time = 1 min per 200–265 words.
- mobile: pad 16–20, measure 335–343 (≈40–48 chars, fine) · H1 28–32 · body 16–17/1.65 · TOC behind an "On this page" disclosure 44 · code 13 with scroll.
**Mistakes**: measure = container width (90–120 chars) · body leading 1.2–1.35 · H2 22 / H3 20 (invisible hierarchy) · justified text · TOC with 4 levels and 25 items · wrapped code blocks · full-bleed images inside the 720 column with no rhythm.

### 3.9 `chat` — messaging (workspace rail + channel list + messages + thread)

| Region | Numbers |
|---|---|
| workspaceRail | **64–72** · item target 40–48, gap 6–8 · active = white pill/bar 4×32 |
| channelSidebar | **240–320, default 260–280** · section header 24–32 (12–13 uppercase, chevron 12) · channel rows **28–36** pad 0 8–16, active = full-bleed or inset-8 tinted, radius 6 · DM rows 36–40 with avatar 32–40 + presence dot 8 · unread = **600 weight + 8px dot** |
| conversationTopBar | **48–56**: name 16–18/600 + purpose 13 muted · divider 1×24 · right icon buttons 28–32 gap 8, pad 0 16 |
| message rows | text 15/1.5–1.6 (≈24 per line) · **ungrouped** = avatar 40 + left gutter **56–64** (timestamp mode gutter 88, time 12 right-aligned) · name 14/600 + time 12 muted gap 6–8 · **grouped consecutive rows gap 2–4**, author change gap **14–20** · 3-line block ≈ 88–104 · horizontal pad 16–24 |
| dayDivider | 1px rule + pill label 20–24 h, 12–13, margin 16–24 |
| hoverToolbar | 28–32 h top-right, card bg + shadow, 5–7 icon buttons 20–24 |
| reactions | chips **22–26 h**, radius 11–13, emoji 14–16 + count 12, chip gap 4–6 |
| composer | min **56–72**, grows to ~200 · pad 8–12 · left/right icon buttons 28–32 gap 4 · placeholder 14–15 · send 32–36 · context line ("#general") 20–24 · width = full pane (Slack) or max **1000–1100** centered · top hairline + typing indicator row 20 |
| threadPanel | **400–500** (min 380, ≤40% of viewport) · own top bar 48–56 · root message card · replies · thread composer 56–72 · left hairline |
| unreadPill | 24 h pill, 12–13 text, right 24 |
- mobile 375: nav 44–56 · rows pad 12–16, avatar 40 gutter 56, inline timestamp 11–12 · reactions 24 · composer 44–56 + send 36 + **inset 34** (total bottom chrome ≈88) · long-press action sheet · thread = full push.
Exemplars: Slack (280 sidebar / 56 composer / 480 thread), Discord (72 + 240 + 400), Teams, Element, Beeper (CSS vars: sidebar 280 min).
**Mistakes**: applying the 65ch prose measure to chat (huge dead margins) · avatar+name+timestamp repeated on **every** line · composer 120–160 fixed empty, or 32 tall · sidebar 400 wide / channel rows 48 with 12px icons · reaction chips 32+ tall · no day divider, no unread marker · thread panel 240 (unusable) or 700 (crushes the room).

### 3.10 `kanban` — board

board header **56–64** (name 20/1.2 + view segmented ~180×32 + filters 120–160×32 + avatar stack 24 circles −8 overlap + "…" 32) →
**column w 272–320 (default 280–300)** [obs Trello 272, Linear 280–300], gap **16**, tinted bg radius 8 →
column header **44–52** (title 14–16/600 + count chip 20–24 h + WIP "5/8" 12–13 red when over + "+" 24–28 + kebab 24, hairline bottom) →
column body pad 8, **card gap 8–12**, **scrolls internally at fixed viewport height** (never stretches the page) →
card w = column − 16 = **256–288**, radius 6–8, pad **10–14**, min-height **64–88** · label bar **4–6 h** (or 20 h chips) · title **14/1.3, 2–3 lines** · meta row 12–13 with 16px icons (due, comments, checklist "3/5", priority chip) · avatars 20–24 right · hairline + hover elevation →
add-card row 36–44 ghost, full width − 16.
- **4–5 columns visible at 1440** (4×288 + 3×16 = 1200 ✓), **4–8 cards** each; drag states: ghost rotate 2–4°, drop placeholder = dashed same-size card, column highlight 2px inset.
- mobile 375: one column **343** with next-column peek 24–32 · header 44 · cards full width · **FAB 56** · long-press sheet · swimlanes → filter chips.
**Mistakes**: `flex:1` equal columns (480 wide → 3 visible, cards look like posters) · column height grows with content · **no count/WIP in the header** (then it is not a Kanban board, just columns of cards) · 12px card titles, no meta/due date · 12 columns at 140px · "add card" as a tiny text link at the very bottom.

### 3.11 `ecomListing` / `ecomPdp` / `cart` / `checkout`

**Listing @1440**: nav 64–80 → breadcrumb 40 → (banner 320–420) → toolbar **48–56** → grid → pagination 56–64.
facet rail **240–280** (group header 32–40 = 14/600 + chevron, checkbox rows 32–36, "show more" 24, count 12 muted, sticky top 24, separators 16) ·
toolbar: results count 13–14 left · sort select **180–220×36** · per-page 88 · grid/list toggle 32 · gap 12 ·
**cards: 3 × 276 with facets / 4 × 264 without**, gutter 24, radius 8–12 · image **1:1 or 4:5**, tinted bg, height 264–330 · badge pill 20–24 h top-left · wishlist 32 top-right · info pad 12–16: title 14–15/1.3 ≤2 lines (40 h) · price 15–16/600 + compare-at 13 strikethrough · rating 12–13 with 12px stars · swatch dots 16–20.

**PDP @1440** (container 1200–1280, gap **48–64**):
gallery left **560–680** (main square 560–640 radius 8, thumbnails **vertical rail 80–96** targets 64–80 or row 64–80 gap 8) |
**buy box right 400–480, sticky top 24**: brand 12–13 · title **26–32/1.2** · rating row 20 · price **24–28/1.2** + installment 12 ·
variant swatches **32–40 squares radius 4** (or pills 36 h) gap 8 · size guide 13 · stock line 13–14 (dot 8) · qty stepper **104×40** (buttons 40×40) ·
**Add to cart 48–56 h, full box width** · secondary row (wishlist 48 sq + Buy now outline 48) · trust row icons 16 + 12–13 · delivery block **64–88** (truck 20, 2 lines 13–14) · returns 13 · blocks 16–24 apart.
Below fold: accordion items 48–56 · description measure **720–800** 15–16/1.65 · specs rows 40–48 (label 200 muted / value) · reviews histogram bars 8 h + summary card 280–320 · related carousel 4-up 264 cards.

**`cart` (recipe)**: container maxW **1120**, two panes **712 + 360** gap 48 (pad 320 summary; mobile single column + sticky bar) ·
breadcrumb 44 → toolbar 40 → item rows **112** (rowSlots: thumb **88**, info, qty stepper **104×36**, price **96 right-aligned**, remove 24) ·
upsell card 96–128. **Summary card sticky top 24**: title 28 · subtotal/shipping/tax rows **36** (label 14 / value 14–15 right) ·
promo **40** (input 200–240×40 + Apply) · total **52** (18–20/600) · checkout CTA **52 full summary width** · secure note 20.
On mobile the CTA moves into a **sticky 72 bar** above the home inset — the checkout button must never scroll away.
**Checkout**: form column **560–640** + summary 360–400 · step indicator 40–48 (**3 steps max**: Contact / Shipping / Payment, or single page with anchored sections) · inputs **360–420 × 40–44**, labels 13–14 above (gap 6–8), field gap **16–20** · group titles 18–20 with mt 32–40 · card element box 40–44 with brand icons 20 · section summary rows 32 + "Edit" 13 · place order 48–56 with total echo + 12 legal.
- mobile: listing **2 × 167** gap 12 (or 1-column rows 120) · PDP full-bleed square gallery 375 with dots 8, buy box pad 16, **sticky bottom bar 56–64** (price 16 + Add-to-cart 44×160) + inset 34, details as accordion · checkout single column 343, inputs **44 h at 16px font** (prevents iOS focus-zoom), summary collapsed strip 48.
**Mistakes**: mixed thumbnail aspect ratios (ragged rows) · buy box full width with a 32px title wrapping 4 lines · CTA separated from price by 5 blocks (or CTA 36 h) · thumbnails 32–40 px · 6-step wizard with progress on every page · facet rail 400 wide or on the right · **mobile PDP without a sticky bar** (the buy button scrolls away).

### 3.12 `authCard` / `authSplit` / `otp`

**A. Centered card @1440**: tinted/gradient page bg · card **400–480** wide (M3 dialog caps at 560, min 280 [spec]), pad **32–40**, radius 8–16, hairline or soft shadow ·
logo 28–32 h mb 24–32 · H1 22–28/1.2 · sub 14–15/1.5 (m 8–12, mb 24–32) · labels 13–14 mb 6–8 · inputs **100% of card × 40–44**, field gap **16–20**, helper/error 12–13 at 4 below ·
"forgot password" 13 link right-aligned above submit · submit **100% × 44–48** 15–16/600 · divider "or" row 32 (1px lines + 12–13 label, gap 16) ·
SSO buttons **100% × 44–48 outline** (icon 20 + gap 12), stack gap 12, **max 3** · footer 13–14 centered with a 600-weight link.
**B. Split brand @1440**: brand panel **560–720 (40–50%)** bg color/image, pad 48–64, logo top, headline **32–44/1.15** (measure ≤480), supporting 16–18, testimonial/illustration, step dots 8 · form panel **480–560** vertically centered, pad **48–64**.
**C. Register**: card 440–520 · name+email+password · strength bar **4–6 h** + hint 12–13 · terms checkbox 16–18 + label 12–13, margin 16–20 · submit 44–48.
**D. Reset**: same card, single field + "we'll email a link" · success state = mail icon 40–48 + "Check your inbox" 20–24 + echoed address 14 + resend 13.
**E. OTP / 2FA**: H1 22–28, helper 14 · **6 boxes of 44–48 × 56–64, gap 8–12, group gap 12 after the 3rd** (or one input with `letterSpacing` 8–12) · auto-advance · error = red border + message 13 · "Resend code in 0:30" 13 disabled until the timer · "trust this device" row 40 · back link as a **44×44** target · total block ≤360 wide.
- mobile 375: **no card** — full-bleed pad 20–24, inputs **44–48 at 16px font**, submit fixed bottom 48 + inset 34, keyboard-aware scroll · brand panel becomes a 96–140 logo band.
Exemplars: GitHub (400–440 card + hairline), Stripe (split: brand + 480 form), Linear (dark split 560+480), Notion (480 card, SSO above password), Google/MS (2-step, 400–440).
**Mistakes**: card 640–720 → 60-char-wide fields · **placeholder-as-label** (the label disappears while typing) · two filled primaries (Sign in + Continue with Google at equal weight) · inputs 32 h / 13px font on mobile · OTP as one unsegmented field or 11 boxes · no error state until submit · forgot-password buried at 11px.

### 3.13 `gallery` — file manager / media

top bar 56–64 → (left nav 224–288) → path/breadcrumb bar 40–48 → toolbar **48–56** (search **280–360×32–36**, sort 140–200, view toggle 64×32, New/Upload primary 32–40, storage meter 120–160 + 12px) → canvas → selection bar → preview panel.
- grid tiles: content 1152 → **6 × 176** (gap 16) / **5 × 216** (gap 24) / **4 × 276** (gap 24) · thumbnail aspect **4:3** (132–162 h) or 16:9 · filename row **40–48** (13–14, 1–2 lines, ellipsis, pad 8–12) · meta row 20 (12 muted: size · date) · radius 6–8.
- overlays: checkbox **20–24** top-left (hover/selection only), kebab 24 top-right, badge 16–20 bottom-left · selection = 2px accent border + 8% tint.
- list rows **48–56**: icon 20–24 + name **320–400** + owner 140–180 + modified 140–160 + size **100–120 right-aligned** + actions 40 · header row 40 sortable.
- preview panel right **400–560** (or bottom drawer 320–420): header 48 (name 15 + close 32) · aspect-fit preview on tinted bg · metadata rows 32 · comments/versions rows 40–56 · actions row 48.
- lightbox: scrim 85–92% · image max 90vh · top bar 56 · nav arrows 44–48 · filmstrip thumbs **64–80** gap 8 · counter "4 of 128" 13.
- empty drop zone: dashed 2px, radius 12, h **160–200**, icon 40 + text 14–15 · folder tree rows 32–36, indent 16/level, chevron 16, icon 16–20.
- mobile: toolbar 48 (search 343×36 + filter icon) · grid **3 × 109** gap 8 (or 2 × 167) · tap enters selection (long press) · bottom action bar 56–64 + inset 34 · preview full screen · **FAB 56**.
Exemplars: Drive (240 nav + 5–6 tiles + 400 preview), Figma file browser (272 + 4-col cards), Dropbox/Box, Finder icon view (88–128 tiles).
**Mistakes**: 40px gaps → 3 giant columns (60% wasted) · mixed aspects → jagged grid · filename overlapping the thumbnail · checkboxes permanently on every tile · preview panel 200 wide · metadata in a modal instead of a panel · no "up one level" in list panes.

### 3.14 `wizard` / `pricing` / `reportPrint`

**`wizard` (modal) @1440**: dialog **640–880** (simple forms ≤560 per M3 [spec]) × **480–640**, radius 12–16 ·
header 56–64 (title 18–20 or "Step 2 of 5" 13–14 muted; close 32×32 in a 44 target) ·
**progress bar 3–4 h full width under the header**, or stepper row 32–48 (nodes 24–32 circles, connectors 2px, labels 12–13, current filled + 600, done = check, future = muted) ·
body pad 24–32; two-column option = illustration **280–360** + copy **480–640**; H2 24–32/1.2; body 15–16/1.55 ≤600 measure; inputs 360–480×40 gap 16–20; **option cards 100% × 80–120** (icon 32 + title 15 + desc 13; selected = 2px accent + tint) ·
footer 64–72, hairline top, pad 16–24: left Skip/Back ghost 40, right **Continue primary 40–44 × min 120**, gap 12.
Full-page variant: left media 40–50% (720) + right column 560–640 pad 64, dots 8 gap 8, headline 28–36.
Setup checklist: card 480–640 · rows 48–56 (node 20–24 + label 14–15 + CTA link 13 right) · "3/6 complete" + bar 6 h · dismiss X 32.
Mobile: header 48 (back target 44), progress 3px full-bleed, body pad 20, **one question per screen**, headline 22–26 with 64 rhythm, footer fixed **56 + inset 34**, primary on top full width, secondary 44 text below.
**Stepper choice**: numbered horizontal for 3–5 linear steps (labels ≤120 each) · progress bar when the count is uncertain · vertical for multi-section forms/timelines.
**Mistakes**: 8-node stepper with 11px labels in a 640 dialog · both Back and Continue filled primaries · step count only in prose · body measure 1200 · data lost on Back · close(X) discards without confirm · buttons 32 h in a 640-tall wizard.

**`pricing` (comparison)**: **3–4 columns × 240–320** · header row **88–120** (name 20 + price 32 + CTA 40) · feature rows **48–64** · sticky header 56 ·
highlight column = 2px accent + 4% tint · cell tooltips on jargon. **Mistakes**: 9 columns at 1400 · checkmarks with no text (accessibility + meaning lost) · no sticky header.

**`reportPrint`**: action bar 56 (title 18–20 · Export/Print/Share 32–40 · period picker 200×32) → gray canvas (12% tint) → **paper sheet**.
Sheet geometry @96dpi: US Letter **816×1056**, A4 **794×1123** · page padding **64–72** (0.75in) → text measure **672–730** ≈ 65–75 chars ✓.
At 1440: one sheet centered with a 24 shadow, or two sheets 816 + gap 40.
Anatomy: report header (logo 32 + title 22–28/1.2 · meta grid 2–3 cols × 200–240, labels 11–12 uppercase / values 13–14, rows 24–28 · hairline · 32–40 before body) ·
KPI strip 3–4 boxes **156–190 × 64–88** (label 11–12, value 18–24) · section title 15–18/1.3 mt 24–32, body **11–12/1.5** (print body is smaller than web) ·
tables: header row 32–40 with **2px bottom rule**, body rows **28–32**, numerics right, hairlines 0.5–1px, zebra **off** (or 4% tint), total row 2px top rule + 600, **units in the header** ("Revenue, USD k") ·
charts: 1-col **672×320**, 2-col **320×240** gap 24, axis labels 9–11, **no color-only encoding** (patterns/labels survive grayscale) ·
figure caption "Figure 2 — …" 11–12, 8 below · page footer 24 above the bottom pad (doc id/confidentiality left 10–11 · **"Page 3 of 12" centered** · date right) · signature block: 2 lines, rule 200 wide, labels 11, 40 apart.
Print rules: break every `1056 − 2×padding`; `orphans/widows: 2`; **repeat table headers across breaks**; margin 12.7–19mm; hide app chrome in print; A4 landscape (1123×794) for wide tables.
**Mistakes**: report laid out at 1440 with 20px padding (no paper metaphor, no page numbers) · 12-column tables that cannot print · body shrunk to 9–10px instead of splitting pages · no repeated header on page 2 · 8-hue charts · **missing generated-timestamp / data-period line** (makes the document legally useless).

### 3.15 `mobileFeed` — cards feed (single mobile archetype worth its own recipe)

375 canvas: status 44 → nav 44–56 → feed → tab bar 49/80 + inset 34.
card **343** (or 375 full-bleed), radius 12–16 · header row 40–44 (avatar 32 + name 14 + time 12 + "…" 24) · media **1:1 (343)** / 4:5 (429) / 16:9 (193) ·
action row **44** (icons 24–28, gap 20: like/comment/share/save) · caption: title 15/600 1–2 lines, body 14/1.45 ≤3 lines + "more" 13 · meta row 12–13 · inter-card gap 12–24.
List variant rows: min **44**, 1-line 44–48, 2-line **64**, with thumbnail **76–88** (thumb 40–60 radius 6–8), chevron 14–16 inset 16, separator inset to 64 when there is an avatar.
Insets-grouped (iOS settings) = side margin 16, radius 10, rows 44–52, section header 32 uppercase 13, groups 32 apart.
Sheets: grabber 32×4 (top inset 5–8), radius 10–16 (M3 top 28), **medium ≈ 50% of expanded** [spec HIG], large = full minus status; content pad 16–20; primary action 48–56 at bottom + 34.
Modals: **Cancel leading, Done trailing** [spec HIG]. Pull-to-refresh spinner 32 at −64. Sticky section header 28–32.
**Mistakes**: 6–7 tabs · bottom bar without the 34 inset (tap dead zone) · 32px targets / 8px screen margins · spacing mix 4/6/10/14 · large title that never collapses (wastes 48px of scroll) · sheet with only "Done" · body text 11–12px "to fit".

## 4. Tier adaptations (how `LY` re-derives a recipe)

### 4.1 Breakpoints and grids (consensus)

| Tier | Baseline | Cols | Page margin | Gutter | Touch min | Reference |
|---|---|---|---|---|---|---|
| `mobile` | 375 (min 320; 360/390/412 common) | **4** (or single-column stack) | **16** | 12–16 | **≥44** [spec HIG] / 48 [spec M3] | Carbon sm 320/4/0 [spec] |
| `pad` portrait | 834 (768/1024/1194) | **8** (drop to 4 when narrow) | 24 | 16–24 | ≥44 | M3 Window2 600–839 → 8 cols, 24 [spec] |
| `web` | 1440 (canvas 1920) | **12** | 24–32 | 24 (Carbon 32 [spec]) | ≥32 pointer (≥44 if hybrid) | M3 Window3 840–1199 → 12/24/32, Window4 1200–1599 centered ~1544 [spec] |

M3 window classes [spec]: `Compact 0–599` (4 cols / 16 / 16, bottom bar) → `Medium 600–839` (8 / 24 / 24, nav rail) → `Expanded 840+` (12 / 24 / 32–48, drawer).
Navigation choice follows width: **bottom bar → rail → drawer** (also how `LY` picks which chrome to emit).

### 4.2 Collapse rules (apply in this order when width shrinks)

1. secondary pane (insight rail / preview panel / TOC) → **drops below** the main column or into a sheet;
2. side nav → rail (64–80) → **hamburger drawer**; bottom tab bar appears on touch tiers;
3. multi-column grid → `12 → 8 → 4`; cards `4-up → 3 → 2 → 1` (mobile 2-col tiles = 167, 3-col = 109);
4. table → **card rows** (72–88) or horizontal scroll with an edge fade; never a 12-column table squeezed to 375;
5. filters → chips row (32) → **bottom sheet with Reset/Apply** (medium detent ≈50%);
6. sticky primary action bar at the bottom (+34 inset) whenever the main CTA would scroll away;
7. measure stays 640–760 on desktop and becomes `width − 2×16` on mobile; controls go 32 → **44–48 h at 16px font**.

### 4.3 Mobile chrome stack (fixed, per OS)

`iOS`: status 44 (20 legacy) → nav bar 44 (large title 72–96) → content → tab bar 49 → home indicator **34**.
`Android/M3`: status 24–28 → top app bar 56–64 (medium/large 112 [spec]) → content → bottom nav **80** (indicator 64×32, min target 48×48 [spec]) → gesture bar 24 · FAB 56/40/96 [spec].
**Never** place tappable content in the bottom 34 or behind the island; cap text width on pad for readability [spec HIG].

## 5. Which recipe for which deliverable

| Target product smells like… | Mandatory screen boards (web/pad baseline → the mobile substitute in parentheses) |
|---|---|
| mail / inbox / ticketing | `email3` + `commandPalette` + `settings` (+ `mobileListDetail` for the phone) |
| calendar / scheduling / shifts | `calMonth` + `calWeek` + `eventPopover` + `mobileListDetail` |
| analytics / monitoring / BI | `dashboard` + `listCrud` + `detailRecord` + `reportPrint` |
| back-office / admin / CRM / SaaS CRUD | `listCrud` + `detailRecord` + `settings` + `wizard` |
| chat / collaboration / community | `chat` + `commandPalette` + `mobileFeed` (phone: `mobileListDetail`) |
| project / task / agile | `kanban` + `detailRecord` + `dashboard` |
| content / blog / docs / marketing | `heroCenter` + `heroSplit` + `blogArticle` + `docsLayout` + `pricing` + `landing` |
| store / commerce | `ecomListing` + `ecomPdp` + `cart` + `checkout` |
| account / identity-heavy | `authCard` + `authSplit` + `otp` + `settings` |
| files / media / DAM | `gallery` + `wizard` (+ `CF.emptyState` boards with `kind: '404' / '403' / 'error'`) |
| consumer mobile app | `mobileFeed` + `mobileListDetail` + `authCard@375` + `chat` (if social) |

`emptyState`, `errorPage`, `miniCalendar` are **component-level** patterns (`scripts/component_factory.js`), not screen recipes:
they fill a region of a screen recipe, so they never appear in the table above as if they were boards.
Every recipe listed here must exist as (a) an annotated skeleton on page `12 · Screen recipes` and (b) a content-filled board on a screen page (`14 · Screens · app` / `15 · Screens · content` / `16 · Screens · mobile`) for the selected tier.

The recipe page (`12 · Screen recipes` of the file contract) carries the **annotated template** version of every recipe in this file;
pages `14–16` carry the **content-filled** version for the selected product (see `penpot-structure.md` §5–§6).
