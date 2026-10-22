// audit_design.js — the design-rule lint for gate G13. **Read-only: it changes no shape.**
//
// WHY THIS FILE EXISTS: references/design-guide.md §11 declares the HARD rules in prose, and prose cannot block a
// delivery. Every HARD row in §11 (plus the component-library §4 coverage rows) becomes a machine check here, and
// each threshold is **read from the engines that drew the shapes** — LY.SPACE / LY.ROWS / LY.TIERS / LY.viewportHeight /
// CF.ladder / CF.STATE / CF.P — so the auditor can never disagree with the factories that produced the design.
//
// Usage: seed_storage.js → layout_engine.js → component_factory.js → this file, then
//   storage.designPage()                          // whole current page (the G13 gate)
//   storage.designPage({ board: host })           // one board, right after building it
//   storage.designPage({ tier: 'mobile' })        // when the audited scope is a touch screen
//   storage.designStart(pages) / designNext() / designAll(4)
// SCOPE: the auditor reads `penpot.currentPage`, and that binding only refreshes on a LATER execute_code turn — so
// there is no `{page}` argument here. Ask for one and you get a refusal, not a verdict about the wrong page;
// `designNext()` is the call that opens, settles and verifies. Always read `out.page` back.
// Output shape mirrors audit_layout.js: { counts, findings, verdict:'CLEAN'|'NEEDS_REPAIR', … }.
// ONE RULE DOES NOT READ CF/LY: `not_projected` (gate G16) reads `storage.FN`, which the G1 order seeds AFTER this
// file. It is consulted at AUDIT time, not seed time, so a session that never loads foundations_engine.js gets a
// finding on every 01/02 page instead of a silent pass.
//
// WHAT CLEAN MEANS: no HARD design-rule violation. It says nothing about positioning (audit_layout.js) or fidelity to
// the target (the PIL comparison in verification.md). Run all three.
//
// TWO LEVELS OF JUDGING (this is the whole design of the file):
//   1. **Composed layout** — the page/section boards and the boxes and gaps the agent placed. Grid, scale, rhythm,
//      split, viewport and control-cap rules bind here, because this is where amateur output actually shows.
//   2. **Primitives anywhere** — text and names: ramp, contrast, disabled alpha, measure, illegal names. These do not
//      depend on who drew the containing box, so they also judge the inside of a component.
//   Geometry *inside* a CF control host, a `·Spec` board or an annotation layer (fold·/region·) is NOT grid-audited:
//   an auto-width chip is 97px because the label is 97px, and a spec matrix places cells by measured content. Flagging
//   that would demand fixed widths on every control — worse design, and unfixable noise. Those internals are already
//   asserted structurally by the component-factory harness (containment / z-order / stroke / focus layer).
//
// Division of labour (do not duplicate): audit_layout.js owns out_of_bounds / board_overlap / text_overlap /
// header_collision / malformed_text / align_missing / crash_100x100 / degenerate_size / root_stray /
// text_centre_residue / loose_assembly. This file owns the §11 rules below.

return (function () {
  const LY = storage.LY, CF = storage.CF;
  if (!LY || !CF) return { err: 'run seed_storage.js → layout_engine.js → component_factory.js first' };
  if (typeof LY.viewportHeight !== 'function') return { err: 'layout_engine.js is stale: it must export LY.viewportHeight' };
  const P = CF.P;

  // ---------------------------------------------------------------- rule registry (design-guide §11 + component-library §4)
  const RULES = {
    off_grid: '§1 · composed-layout coordinates and box sizes on the 4px grid (hairlines, text and glyph-derived control boxes exempt; so are coordinates and hug axes a FLEX parent derives for its flow children — those are font-metric sums, not typed values)',
    off_scale_gap: '§1 · the gap between two ADJACENT sibling blocks (<=256) must be on LY.SPACE; cumulative distances and larger separations are not judged',
    off_ramp_size: '§3.2 · font size ∈ the declared ramp; ≥12px, 11px only for a role-named node (axis / overline / kbd)',
    measure_overflow: '§3.4 · multi-line prose wider than the 760px measure (chat/table/code exempt)',
    split_ratio_50_50: '§8 · a two-pane split narrower than 2.2:1, or 3+ identical panes',
    control_too_wide: '§1 · control wider than its cap inside a ≥720 container',
    touch_target: '§6 · interactive host smaller than the tier floor (hit pad counts, spec boards use the 24 floor)',
    multiple_primary: '§4 · more than one filled primary control inside one region',
    row_height: '§6 · table row height outside the quantized set',
    radius_nesting: '§5.1 · inner radius > outer radius − inset (only where the inset is inside the outer radius); on the token ladder "tighter than the parent" means the NEXT STEP DOWN or the same step, never an interpolated number',
    contrast: '§3.3 · opaque text against its resolved background under 4.5:1 (3:1 for ≥24px and for tone labels)',
    viewport_locked: '§2 · board locked to the tier viewport while content overflows or dead space is left, or a long baseline-width board with no fold marker',
    state_coverage: '§5.2 + component-library §3.0 · required state columns missing on the spec board',
    rhythm_inconsistent: '§2 · sibling band gaps spread over more than one scale step',
    variant_sparse: 'component-library §4 · too few variants / sizes / icon slots for the family',
    focus_ring_missing: 'component-library §4 · a Focus state with neither a ring layer nor a 2px focus border',
    disabled_wrong: 'component-library §4 · disabled label alpha outside the .25–.40 state band',
    name_invalid: 'component-library §4 · name contains an illegal "/" or newline',
    paint_unbound: 'design-tokens §8.1 · an opaque solid paint whose hex IS a declared token colour but the shape carries no `tokens.fill` / `tokens.strokeColor` binding — the colour was typed, not chosen from the set',
    paint_off_palette: 'design-tokens §8.1 · a paint whose hex is not any declared colour token: the palette and the token set have drifted apart',
    type_unbound: 'design-tokens §8.1 · copy that matches a declared ramp step but carries no `tokens.typography` binding',
    type_off_ramp: '§3.2 · the drawn (family,size,weight) is not a declared typography token, so nothing can bind to it — raise it onto the ramp',
    space_unbound: '§1 + design-tokens §6 · a flow container whose rowGap/columnGap equals a declared `spacing` token but carries no `tokens.rowGap`/`tokens.columnGap` binding (padding cannot be bound: measured, only the two gap props are accepted)',
    space_off_scale: '§1 · a gap or padding written on a flow/grid container that is not any declared `spacing` value — the space scale is a token set, not a habit',
    no_guides: '§2 + native-layout R0 · a tier-viewport composition board with neither native `guides` nor `rulerGuides`: the grid must live on the board (LY.guides), not in hand-drawn column rectangles',
    pane_filled: '§2 + layout-library · a `region·` pane that holds child regions was also filled with copy: a pane is structure, not a band — the text runs underneath every child region (fill `LY.leaves()` only)',
    not_component: 'component-library §5 / gate G10 · a control host whose name already has a master in the local library, drawn again instead of placed with CF.instance — a copy cannot be fixed, swapped or variant-driven',
    caption_stale: '§4 · a `wash|hue|ink #RRGGBB` caption that does not match the paint of the swatch beside it — a token-bound plate follows the token while its label keeps the hex authored at build time, so a board built before a theme overlay documents values it no longer shows',
    empty_cell: '§4.3 · a `cell·slot·*` / `cell·recipe·*` container with zero children — the region plates an `after` pass draws are missing, which is what a timed-out build whose bare board was later mounted looks like; the block renders as an empty frame',
    no_type_styles: '§3.2 + design-tokens §5 · the ramp declares `typography` tokens and this board draws text, but `penpot.library.local.typographies` is EMPTY — the Assets → Typography panel lists style records, not token sets, so consumers have nothing to pick; seed them with `storage.TP.seed()`',
    not_projected: 'gate G16 · a Foundations / Color-in-use chapter page (FN.CHAPTER) whose boards were not PROJECTED from the token records: this board carries no durable `nl:fn` stamp, or the chapter is missing a kind it contractually requires, or `storage.FN` is not seeded so the gate cannot be read at all',
    cramped_gap: '§2 · two block-level (≥24) flow siblings separated by less than `LY.breath("inline")` — the whitespace that carries the hierarchy was simply omitted, so the blocks touch. Reads the same LY.BREATH table a builder writes',
    hierarchy_gap: '§2 2× rule · a composition-level container whose gap between groups is under 2× the largest gap inside those groups — related things are not closer than unrelated ones, so the page cannot be grouped by eye',
    text_cramped: '§2 + §3.2 · running copy whose `lineHeight` is below the leading its own ramp step declares (multi-line, or under 1.0), or two prose siblings closer than one line of the upper block — vertical rhythm is typography, not just layout',
    radius_off_ladder: '§5.1 + design-tokens §8 · a corner radius that is not one of the declared `borderRadius` token values: the token ladder is the ONLY source of a corner, so an orphan number cannot be retuned, themed or found again (measured 2026-10-21: a radius token writes all four corner props at once)',
    radius_unbound: '§5.1 + design-tokens §8 · a radius equal to a declared `borderRadius` token but with no `tokens.borderRadius*` binding — the corner was typed instead of taken from the set; run TK.bindBoard',
    ring_off_host: '§5.1 + CF.ROLE.ring = "host" · a `ring·*` outline whose corner is not its host control\'s corner: a ring is a derived outline, so `r0` body under an `r9999` ring (or a `r10` ring around a `r0` field) is one defect seen from two places. Rules 35/36 cannot see it — **both** values are on the ladder and bound. Repair with `TK.roleSweep`',
  };
  const DELEGATED = ['out_of_bounds', 'board_overlap', 'text_overlap', 'header_collision', 'malformed_text',
    'align_missing', 'crash_100x100', 'degenerate_size', 'root_stray', 'text_centre_residue', 'loose_assembly', 'spec'];

  // The page contract draws these only **inside a composite host** (one row per Table, one label per Stepper item), and
  // the contract puts the `·Spec` matrices on pages 03–09 while the composites live on page 10 — so an unscoped whole-page
  // coverage audit would demand a 5-state spec from a family that is never spec'd. They are still judged as shapes,
  // containers and CF hosts everywhere; only the matrix-coverage rules are scoped out. Page 10 is audited with
  // `{ families: [...] }` to bring them back inside their own board.
  const SPEC_SKIP = { SideNav: 1, Toolbar: 1, TabBand: 1, Table: 1, TableHeader: 1, TableState: 1, Form: 1,
    OptionList: 1, CommandPalette: 1 };

  // ---------------------------------------------------------------- tunables (each one cites the prose it comes from)
  const SPREAD_MAX = 256;   // > 2x the largest LY.SPACE step (128): a layout spread, not a rhythm gap
  const CFG = {
    hairline: 2,           // §1 exception: 1px border/divider
    gapTol: 0.5,          // every producer of these numbers is integer-exact (LY.SPACE, snap-to-4, C4 growth), so a
                          // half-pixel band decides membership; a 1px band would wave through 15/17/25 as "close enough".
    blockMin: 24,          // §1: gap math measures block↔block, not glyph↔label
    measure: 760,          // §3.4 WCAG ceiling / USWDS 66-char target
    capContainer: 720,     // §1 "full-width controls are legal only inside a narrow container"
    splitMin: 2.2,         // §8 two-column ratio 2.2–3.2
    bodyContrast: 4.5, largeContrast: 3.0, toneContrast: 3.0, contrastTol: 0.97,
    largeText: 24,         // §3.3 ≥3:1 for ≥24px
    opaqueFill: 0.9,       // §3.3 ramp is hex@1 in this kit; state-layer alphas belong to disabled_wrong, not here
    specTouchMin: 24,      // §6 blesses 24-tall compact controls; a spec board shows the whole size axis
    deadSpace: 200,        // §2 "a board with dead space at the bottom is an amateur tell"
    longBoard: 2000,       // layout-library §1: 2000+ must carry a fold marker
    rhythmBands: 3,        // §11 rule 14 needs ≥3 gaps before judging spread
    variantsMin: 3, sizesMin: 2,
    alphaBand: [0.25, 0.40],   // component-library §4: disabled content alpha
    minLeading: 1.2,           // §3.2 DEFAULT kit body leading — the floor when a size is not in the declared ramp
    proseMin: 240              // §3.4: a prose line is a *run of text*, not a label — 240px wide is where measure starts to matter
  };

  // Families that are *rows* (quantized height) / *fields* (width caps) / icon-bearing (§4 slot rule).
  const CAPS = { Input: 420, Textarea: 720, Search: 420, Password: 420, MaskedInput: 420, NumberField: 280,
    OTP: 560, Select: 240, MultiSelect: 420, Combobox: 360, DatePicker: 320, TimePicker: 200, ColorPicker: 280, Field: 480 };
  const ROW_FAMS = ['TableRow'];
  // component-library §3.0 — the state columns each family class must draw.
  const SETS = {
    ctl: ['default', 'hover', 'focus', 'pressed', 'disabled'],
    toggle: ['default', 'hover', 'focus', 'pressed', 'selected', 'disabled'],
    field: ['default', 'hover', 'focus', 'error', 'disabled'],
    row: ['default', 'hover', 'selected', 'focus', 'disabled'],
    sel: ['default', 'hover', 'focus', 'disabled'],
    display: ['default']
  };
  const CLASS = {
    Button: 'ctl', IconButton: 'ctl', ButtonGroup: 'ctl', SplitButton: 'ctl', FAB: 'ctl', Link: 'ctl',
    Upload: 'ctl', Slider: 'ctl', Rating: 'ctl', ColorPicker: 'ctl', Pagination: 'ctl', Steps: 'ctl',
    Anchor: 'ctl', Breadcrumb: 'ctl', Menu: 'ctl', Tree: 'ctl', Transfer: 'ctl', Carousel: 'ctl', MiniCalendar: 'ctl',
    Segmented: 'toggle', Tabs: 'toggle', NavItem: 'toggle', Chip: 'toggle',
    Input: 'field', Textarea: 'field', Search: 'field', Password: 'field', MaskedInput: 'field', NumberField: 'field',
    OTP: 'field', Select: 'field', MultiSelect: 'field', Combobox: 'field', DatePicker: 'field', TimePicker: 'field', Field: 'field',
    Switch: 'sel', Checkbox: 'sel', Radio: 'sel',
    TableRow: 'row', ListItem: 'row', Card: 'row', Accordion: 'row',
    // everything else is display chrome: one resting draw is enough to spec it
    AppBar: 'display', SideNav: 'display', Toolbar: 'display', PageTitle: 'display', Footer: 'display',
    MobileBar: 'display', Modal: 'display', Drawer: 'display', Sheet: 'display', Popover: 'display',
    Popconfirm: 'display', Tooltip: 'display', Toast: 'display', Notification: 'display', Alert: 'display',
    CommandPalette: 'display', Badge: 'display', Status: 'display', Avatar: 'display', AvatarGroup: 'display',
    StatusText: 'display', Progress: 'display', Skeleton: 'display', Descriptions: 'display', Spin: 'display',
    Timeline: 'display', KPI: 'display', Table: 'display', TableHeader: 'display', TableState: 'display',
    EmptyState: 'display', Component: 'display', TabBand: 'display'
  };
  const ICON_FAMS = ['Button', 'Input', 'Select', 'Search', 'Chip', 'Tabs', 'NavItem', 'Menu', 'Link', 'Field', 'Alert', 'Avatar'];
  // component-library §4: these two have exactly one drawing per state — a binary box has no style, slot or theme axis
  // (Radio's card/button forms delegate to Card and Segmented, which are audited as their own families). Demanding 3
  // "style variants" would only teach the producer to invent name tokens for the same pixels.
  const STATE_ONLY_FAMS = ['Checkbox', 'Radio'];
  const PRIMARY_FAMS = /^(Button|IconButton|SplitButton|ButtonGroup|FAB)$/;
  // Deliberate-overflow / decoration layers — the same prefix set the factories use as their escape hatch.
  const EXEMPT = /^(ring·|hitpad·|state·layer|scrim|shadow|glow|clip·|hairline|divider|guide|connector|underline|tick|shimmer|dot·|arrow|bubble|value·bubble|now-line|now·|resizer|resize-handle|grabber|handle|track|caret|ripple|mask|skeleton|bar·)/;
  // Audit annotations (LY.fold / LY.drawStart): meta copy about the layout, not design copy → judged by no type rule either.
  const ANNO = /^(fold·|region·)/;
  // The numbers rules 32/33/34 judge by, published for the repair engine (`storage.breathe`, fix_geometry.js) so the
  // fixer aims at the floor the gate enforces instead of inventing a second one. The ladder itself is `LY.BREATH`, read
  // through `LY.breath()` by both sides — this only shares the shape filters.
  storage.breathSpec = { blockMin: CFG.blockMin, proseMin: CFG.proseMin, minLeading: CFG.minLeading,
    exempt: EXEMPT.source, anno: ANNO.source };
  const CHATRX = /chat|message|thread|comment|table|code|terminal|\blog\b|console|editor|diff|json|kanban/i;
  const SPLITRX = /login|signin|auth|signup|register|transfer|empty|pricing|quote|onboard|wizard|survey|two|pair|equal|modal|dialog|sheet|drawer|command|gallery|grid/i;
  // A **legend strip** is a swatch rack, not a composition: a spec row that shows the same box once per declared value
  // (radius steps, shadow tokens, series hues) is equal-width BY MEANING — the equality is the comparison being
  // documented. §8's "N equal panes" tell is about content columns, so a row whose own name declares it a rack is
  // exempt from both split branches. This can only ever remove a finding, never create one. (Added 2026-10-21 with
  // `storage.FN`, which projects exactly these boards.)
  const LEGRX = /legend|strip|rack|scale|ladder|ramp|palette|matrix|series|swatch/i;

  // ---------------------------------------------------------------- read helpers (every property access is guarded: proxies can throw)
  const N = (v) => Math.round(v);
  const num = (o, k, d) => { try { const v = o[k]; return Number.isFinite(v) ? v : d; } catch (e) { return d; } };
  const str = (o, k, d) => { try { const v = o[k]; return v === undefined || v === null ? d : String(v); } catch (e) { return d; } };
  const arr = (o, k) => { try { const v = o[k]; return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const kidsOf = (n2) => { try { const k = n2.children; return Array.isArray(k) ? k : null; } catch (e) { return null; } };
  const typeOf = (s) => str(s, 'type', '');
  const nameOf = (s) => str(s, 'name', '');
  const isPlate = (s) => { const t = typeOf(s); return t === 'rectangle' || t === 'rect' || t === 'ellipse'; };
  const isText = (s) => typeOf(s) === 'text';
  const isBox = (s) => { const t = typeOf(s); return t === 'board' || t === 'group' || t === 'frame'; };
  const isVC = (s) => { try { return typeof s.isVariantContainer === 'function' && s.isVariantContainer(); } catch (e) { return false; } };
  const isInstance = (s) => { try { return typeof s.isComponentInstance === 'function' && s.isComponentInstance(); } catch (e) { return false; } };
  // Measured 2026-10-22: a component's own shape answers `isComponentInstance() === true` **and**
  // `isComponentMainInstance() === true`, so `isInstance` alone cannot tell a master from a consumer. A COPY is the
  // consumer whose interior is not ours to judge; the main instance is the definition, and skipping it is what let a
  // whole spec chapter (79 button masters on `03.01`) pass the radius rules vacuously.
  const isCopy = (s) => { try { return typeof s.isComponentCopyInstance === 'function' && s.isComponentCopyInstance(); } catch (e) { return false; } };
  const rec = (s) => isBox(s) || isVC(s);
  const box = (s) => { const x = num(s, 'x', 0), y = num(s, 'y', 0), w = num(s, 'width', 0), h = num(s, 'height', 0); return { x: x, y: y, w: w, h: h, r: x + w, b: y + h }; };
  const radiusOf = (s) => { try { const b = s.borderRadius; if (typeof b === 'number') return b; if (b && typeof b === 'object') return Number(b.topLeft) || 0; } catch (e) {} return 0; };
  const fsOf = (s) => { const v = parseFloat(str(s, 'fontSize', '')); return Number.isFinite(v) ? v : 14; };
  const charsOf = (s) => str(s, 'characters', '');
  const covers = (r, pt) => pt.x >= r.x && pt.x <= r.r && pt.y >= r.y && pt.y <= r.b;

  // ---------------------------------------------------------------- colour math (§3.3)
  const hexOK = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  const toRGB = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const chan = (v) => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (rgb) => 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
  const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const mix = (base, over, a) => [base[0] * (1 - a) + over[0] * a, base[1] * (1 - a) + over[1] * a, base[2] * (1 - a) + over[2] * a];
  const paint = (fills, base) => {
    let out = base;
    fills.forEach((f) => {
      const c = f && f.fillColor; if (!hexOK(c)) return;
      out = mix(out, toRGB(c), Math.max(0, Math.min(1, num(f, 'fillOpacity', 1))));
    });
    return out;
  };
  const TONE_HEX = () => [P.primary, P.error, P.success, P.warning, P.info, P.primarySoft, P.errorSoft, P.successSoft, P.warningSoft, P.infoSoft];
  const isToneColor = (hex) => TONE_HEX().some((v) => hexOK(v) && v.toLowerCase() === hex.toLowerCase());

  /** The colour a text actually sits on: every painted fill under it, bottom → top, down the parent chain. */
  function bgUnder(sh, pageBg) {
    const chain = []; let n2 = sh;
    while (n2) { chain.unshift(n2); n2 = n2.parent || null; }
    const me = box(sh), pt = { x: me.x + me.w / 2, y: me.y + me.h / 2 };
    const layers = [];
    for (let k = 0; k < chain.length - 1; k++) {
      const par = chain[k], child = chain[k + 1];
      arr(par, 'fills').forEach((f) => layers.push(f));
      const kids = kidsOf(par) || [];
      // ⚠ Every `.children` access returns NEW proxies, so `indexOf`/`===` never match (api-pitfalls §7): with a
      // reference test the loop below also collects our own branch, and a control host's translucent state fill is
      // painted TWICE — a 12% selected row then reads as #CACACA instead of #E1E1E1 and fails §3.3 on paper only.
      const cid = child.id;
      let idx = -1;
      for (let j = 0; j < kids.length; j++) { if (kids[j].id === cid) { idx = j; break; } }
      for (let j = 0; j < kids.length; j++) {
        if (idx >= 0 && j >= idx) break;                 // painted at or above our own branch
        const s = kids[j]; if (s.id === cid || isText(s)) continue;
        if (!covers(box(s), pt)) continue;
        arr(s, 'fills').forEach((f) => layers.push(f));
      }
    }
    return paint(layers, pageBg);
  }
  const toHex = (rgb) => '#' + rgb.map((v) => { const h = Math.max(0, Math.min(255, Math.round(v))).toString(16); return h.length < 2 ? '0' + h : h; }).join('').toUpperCase();

  // ---------------------------------------------------------------- CF name parsing
  const STATE_TOKENS = ['default', 'hover', 'focus', 'pressed', 'selected', 'disabled', 'loading', 'error',
    'success', 'warning', 'readonly', 'filled', 'open', 'closed', 'checked', 'unchecked', 'indeterminate', 'on', 'off', 'active'];
  const SIZE_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  function parseName(nm) {
    const segs = nm.split('·');
    // CF.name() drops the 'default' state and empty variant/size, so a plain resting control is a **single segment**
    // ("Breadcrumb", "TableRow"). The family is therefore always seg[0], dot or no dot.
    const fam = segs.length ? segs[0] : '';
    let state = null, size = null;
    segs.slice(1).forEach((s) => {
      const low = s.toLowerCase();
      if (!state && STATE_TOKENS.indexOf(low) >= 0) state = low;
      if (!size && SIZE_TOKENS.indexOf(low) >= 0) size = low;
    });
    return { family: fam, segs: segs, state: state, size: size,
      variant: segs.slice(1).filter((s) => STATE_TOKENS.indexOf(s.toLowerCase()) < 0 && SIZE_TOKENS.indexOf(s.toLowerCase()) < 0).join('·') || 'base' };
  }
  const famOf = (s) => { const p = parseName(nameOf(s)); return CLASS[p.family] ? p.family : null; };
  const isSpecBoard = (s) => typeOf(s) === 'board' && /·Spec(·|$)/.test(nameOf(s)) && !!famOf(s);
  // CF.name only ever joins variant/size/state/slot tokens, so a board carrying one of them is CF output even when its
  // family is not in CLASS (a factory renamed after this table). Unknown families stay host-shaped, judged as display.
  const CF_TOKENS = STATE_TOKENS.concat(SIZE_TOKENS, ['ICONSTART', 'ICONEND', 'CLEAR', 'ADDON', 'COUNT', 'BLOCK', 'SPEC',
    'BESIDE', 'BAND', 'STACK', 'MIXED', 'GROUP', 'RAIL', 'BLOCK']);
  function looksLikeCf(s) {
    if (typeOf(s) !== 'board') return false;
    const nm = nameOf(s); if (nm.indexOf('·') < 0) return false;
    return nm.split('·').slice(1).some((seg) => CF_TOKENS.indexOf(seg.toUpperCase()) >= 0 || seg.toUpperCase() === seg);
  }
  /** A CF control host (one board per control, family-named) — the boundary between "composed layout" and "component internals". */
  const isHostBoard = (s) => typeOf(s) === 'board' && !isSpecBoard(s) && (!!famOf(s) || looksLikeCf(s));
  /** True when the shape sits under a host whose NAME carries the `·Disabled·` **state segment** of the §4 grammar
      (`Button·Disabled·Md`). The segment must be at index ≥1: a shape merely *named or worded* "Disabled" is
      documentation, not a control (measured 2026-10-21 — `FN`'s `02.02` rule sentence "Disabled recedes as a pair…"
      tripped `disabled_wrong` at alpha 1.00, and a bare specimen label named "Disabled" would too, because both hit a
      word-boundary test rather than the name grammar). */
  function inDisabledHost(sh, top) {
    let s = sh.parent;
    while (s && s !== top) {
      const segs = nameOf(s).split('·');
      if (segs.length > 1 && segs.slice(1).some((x) => String(x).trim().toLowerCase() === 'disabled')) return true;
      s = s.parent || null;
    }
    return false;
  }

  // ---------------------------------------------------------------- the audit
  storage.designPage = function (opts) {
    opts = opts || {};
    // SCOPE REFUSAL (measured 2026-10-21): `penpot.openPage()` in the SAME execute_code call does not rebind
    // `penpot.currentPage`, so an audit asked for page B while page A is open silently reports A — three "CLEAN"
    // verdicts with the same 351-board count. A wrong-scope verdict is worse than no verdict: refuse, and name the
    // call that switches correctly (designNext opens, settles 700ms and verifies).
    if (opts.page && String(str(penpot.currentPage, 'name', '')) !== String(opts.page)) {
      return { err: 'designPage audits the OPEN page "' + str(penpot.currentPage, 'name', '?') + '", not "' + opts.page + '": open it and audit from a LATER execute_code call (or use designStart/designNext)',
        page: str(penpot.currentPage, 'name', '?'), want: String(opts.page), verdict: 'NEEDS_REPAIR',
        findings: [], counts: {}, errors: [], boards: 0, shapes: 0 };
    }
    // The ramp the auditor judges against must be the ramp the FILE DECLARES. `storage.T.fontRamp` is the system-contract
    // mirror from seed_storage — a second source of truth, and the two disagree the moment a file re-skins: measured
    // 2026-10-21, an FN-projected `Radius` title drawn at the declared `type.h3` = 36px was reported `off_ramp_size`
    // because the default mirror has no 36. Read the live typography tokens when the token engine is seeded; the mirror
    // stays as the fallback for a file that has no tokens at all.
    let RAMP = (storage.T && Array.isArray(storage.T.fontRamp)) ? storage.T.fontRamp
      : [11, 12, 13, 14, 16, 20, 24, 32, 40, 56, 64];   // design-guide §3.2 kit + layout-library display bands
    let rampSrc = 'storage.T mirror (no token engine seeded)';
    // The declared LEADING per size, from the same read as the sizes themselves. A size can appear twice in a ramp with
    // different leadings (22/600 is both `type.h6` at 1.2 and `type.button` at 1.5), so the floor is the *tightest*
    // declared step at that size — demanding more than the ramp declares would be the auditor inventing a rhythm.
    const LEAD = {};
    if (storage.TK && typeof storage.TK.declared === 'function') {
      try {
        const d2 = storage.TK.declared();
        if (d2 && !d2.err && Array.isArray(d2.types)) {
          d2.types.forEach(function (e) {
            const sz = Number(e.size), ld = Number(e.leading);
            if (!(sz > 0) || !(ld > 0)) return;
            LEAD[sz] = LEAD[sz] === undefined ? ld : Math.min(LEAD[sz], ld);
          });
        }
      } catch (e) {}
    }
    // Publish the exact leading floor the gate will judge by, per size, so `storage.breathe` writes what clears this
    // audit instead of its own second reading of the ramp (measured 2026-10-21: 14px = 1.4 via `declared()`, 1.5 via
    // `typeIndex().step` — the fixer would over-raise, and a rule the gate cannot re-read is a rule that drifts).
    if (Object.keys(LEAD).length) storage.breathSpec.lead = LEAD;
    if (storage.TK && typeof storage.TK.declared === 'function') {
      try {
        const d = storage.TK.declared();
        const sizes = (d && !d.err && Array.isArray(d.types))
          ? Array.from(new Set(d.types.map((t) => Number(t.size)).filter((n) => n > 0))).sort((a, b) => a - b) : [];
        if (sizes.length) { RAMP = sizes; rampSrc = d.types.length + ' declared typography tokens'; }
      } catch (e) {}
    }
    const pageBg = toRGB(hexOK(opts.pageBg) ? opts.pageBg : (hexOK(P.surface) ? P.surface : '#FFFFFF'));
    const out = { page: str(penpot.currentPage, 'name', 'single-board'), boards: 0, shapes: 0,
      counts: {}, findings: [], errors: [], sizes: {}, fonts: {}, tiers: {}, families: {}, skipped: {}, verdict: 'CLEAN' };
    out.ramp = rampSrc + ' · ' + RAMP.join(',');   // say which ramp a `off_ramp_size` verdict was measured against

    const add = (kind, s, where, detail) => {
      out.counts[kind] = (out.counts[kind] || 0) + 1;
      if (!RULES[kind] && DELEGATED.indexOf(kind) < 0) out.counts.__unknown_rule = (out.counts.__unknown_rule || 0) + 1;
      if (out.findings.length < (opts.maxFindings || 70)) out.findings.push({ kind: kind, board: where ? nameOf(where) : undefined,
        shape: s ? nameOf(s) : undefined, type: s ? typeOf(s) : undefined,
        host: s ? (chainName(s, undefined).split(' ')[0] || undefined) : undefined,
        text: s && isText(s) ? charsOf(s).slice(0, 18) : undefined,
        x: s ? N(num(s, 'x', 0)) : undefined, y: s ? N(num(s, 'y', 0)) : undefined,
        w: s ? N(num(s, 'width', 0)) : undefined, h: s ? N(num(s, 'height', 0)) : undefined, detail: detail });
    };
    const err = (where, e) => { if (out.errors.length < 4) out.errors.push(where + ':' + (e && e.message || e)); };

    const headOf = (r) => { const ks = kidsOf(r) || []; for (const c of ks) if (typeOf(c) === 'board') return c; return null; };
    const root = opts.root || (() => { try { return penpot.currentPage.root || penpot.root; } catch (e) { return null; } })();
    const top = opts.board || headOf(root);
    if (!top) return Object.assign(out, { err: 'no board to audit on this page' });
    // The tier is a property of the *screen*, never of the control inside it: a 32px icon button in a phone screen is
    // judged at the 44 floor, so the tier comes from the audited scope (explicit opts.tier wins).
    const tier = opts.tier || (isHostBoard(top) ? 'web' : LY.tierFor(num(top, 'width', 1440)));
    out.tier = tier;

    // ---- region pane map, measured geometrically.
    // A pane is a `region·` board whose box contains another `region·` board: nested (dashboard.content over its
    // kpi/chart/table bands) OR a flat sibling (docsLayout `content` 400,9520 928×1336 over `body` 480,9520 768×1336).
    // The old pane_filled test only looked for CHILD regions and was gated by `!isAnno(s)` — every `region·` name
    // matches ANNO, so the signature could never fire, and pages 14/15 shipped 65 cross-parent text collisions CLEAN.
    // Copy under a child region is the child's, not the pane's: `ownCopy` stops at nested region boards and ignores
    // annotation text, so a legal host fill (cart.summary draws its own lines, child bands were skipped) stays clean.
    const REGIONS = [];
    const ownCopy = (b) => {
      let hit = false;
      const scan = (n, d) => {
        if (hit || d > 8) return;
        for (const c of kidsOf(n) || []) {
          if (c !== b && typeOf(c) === 'board' && /^region·/.test(nameOf(c))) continue;
          if (isText(c) && !ANNO.test(nameOf(c)) && String(charsOf(c)).trim()) { hit = true; return; }
          scan(c, d + 1);
        }
      };
      scan(b, 0);
      return hit;
    };
    (function collectRegions(n) {
      for (const c of kidsOf(n) || []) {
        try { if (typeOf(c) === 'board' && /^region·/.test(nameOf(c))) REGIONS.push({ s: c, r: box(c), copy: ownCopy(c) }); } catch (e) {}
        collectRegions(c);
      }
    })(top);
    const holdsFilledRegion = (b) => {
      const br = box(b);
      return REGIONS.some((x) => x.s.id !== b.id && x.copy &&
        x.r.x >= br.x - 1 && x.r.y >= br.y - 1 && x.r.r <= br.r + 1 && x.r.b <= br.b + 1 &&
        (x.r.w * x.r.h) < (br.w * br.h));
    };

    /** Chain of names above the shape (stops at `stopAt`) — used for the documented exemptions. */
    function chainName(sh, stopAt) {
      let s = sh.parent, acc = [];
      while (s && s !== stopAt) { acc.push(nameOf(s)); s = s.parent || null; }
      return acc.join(' ');
    }
    const isAnno = (sh) => ANNO.test(nameOf(sh)) || ANNO.test(chainName(sh, top));
    /** Region = nearest ancestor board that is not a CF control host (a spec board counts as a region). */
    function regionOf(sh) {
      let s = sh.parent;
      while (s && s !== top) { if (typeOf(s) === 'board' && !isHostBoard(s)) return s; s = s.parent || null; }
      return top;
    }

    // ---- token-binding rules (design-tokens §8.1: the token set is the only source of colour and type) ----
    // `tokens` is the only proof available: a colour applied from a token keeps `fillColorRefId` **null** (measured
    // 2026-10-20), so the library-colour channel says nothing about token bindings.
    const TOK = (storage.TK && storage.TK.colorIndex) ? { ci: storage.TK.colorIndex(), ti: storage.TK.typeIndex() } : null;
    // A colour picker *displays* arbitrary colours: its hue ramp and swatch grid are content, not the system palette,
    // so demanding a token binding there would be a category error.
    const DATA_PAINT = /^(hue·step·|swatch(·|$))/;
    function paintAudit(s, st, isTxt) {
      if (!TOK || isAnno(s) || DATA_PAINT.test(nameOf(s))) return;
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      const fl = arr(s, 'fills');
      if (!isTxt && fl.length === 1 && !tk.fill && !str(fl[0], 'fillColorRefId', '') &&
          !fl[0].fillImage && !fl[0].fillColorGradient && num(fl[0], 'fillOpacity', 1) >= 0.99) {
        const h = String(fl[0].fillColor || '').toLowerCase(), e = TOK.ci.byHex[h];
        add(e ? 'paint_unbound' : 'paint_off_palette', s, st.top, e
          ? 'fill ' + h + ' is token ' + e.surface + ' but carries no tokens.fill — run TK.bindBoard'
          : 'fill ' + h + ' names no colour token (' + nameOf(s) + ')');
      }
      const so = arr(s, 'strokes');
      if (so.length === 1 && !tk.strokeColor && !str(so[0], 'strokeColorRefId', '') && num(so[0], 'strokeOpacity', 1) >= 0.99) {
        const h = String(so[0].strokeColor || '').toLowerCase(), e = TOK.ci.byHex[h];
        add(e ? 'paint_unbound' : 'paint_off_palette', s, st.top, e
          ? 'stroke ' + h + ' is token ' + e.surface + ' but carries no tokens.strokeColor'
          : 'stroke ' + h + ' names no colour token');
      }
      if (!isTxt || tk.typography) return;
      const k = storage.TK.shapeTypeKey(s), pretty = k.replace(/\|/g, ' ');
      if (TOK.ti.exact[k]) add('type_unbound', s, st.top, pretty + ' is a declared step carried with no tokens.typography binding');
      else {
        const alt = storage.TK.stepFor(s.fontSize, s.fontWeight, s.fontFamily, s.lineHeight);
        if (alt) add('type_unbound', s, st.top, pretty + ' → ' + alt + ' (binding retunes leading/family to the ramp)');
        else add('type_off_ramp', s, st.top, pretty + ' is not a declared typography token (' + charsOf(s).slice(0, 12) + ')');
      }
    }

    // ---- the space scale, judged on the container that carries it
    // Measured 2026-10-20: a `spacing` token binds to `rowGap`/`columnGap` (reads back on `tokens.rowGap`) but the four
    // padding props are REJECTED by applyToShapes, so padding is only judged as a value — otherwise the gate would
    // demand a binding the platform cannot store.
    const SI = storage.TK && storage.TK.spaceIndex ? storage.TK.spaceIndex() : null;
    const GAP_PROPS = ['rowGap', 'columnGap'];
    const PAD_PROPS = ['topPadding', 'rightPadding', 'bottomPadding', 'leftPadding'];
    function spaceAudit(s, st) {
      if (!SI || !SI.count || isAnno(s) || isInstance(s)) return;
      let fx = null;
      try { fx = s.flex || s.grid || null; } catch (e) {}
      if (!fx) return;
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      GAP_PROPS.concat(PAD_PROPS).forEach(function (p) {
        let v = null; try { v = num(fx, p, 0); } catch (e) {}
        if (!v || v <= 0) return;                       // 0 = the absence of a decision, not the 4px step
        const name = SI.byVal[v];
        if (!name) {
          add('space_off_scale', s, st.top, p + '=' + N(v) + ' is not a declared spacing token (' +
            Object.keys(SI.byVal).sort((a, c) => a - c).join('/') + ')');
        } else if (GAP_PROPS.indexOf(p) >= 0 && !tk[p]) {
          add('space_unbound', s, st.top, p + '=' + N(v) + ' is token ' + name + ' with no tokens.' + p + ' binding — run TK.bindBoard');
        }
      });
    }

    // ---- rules 35/36 · the corner radius is a token or it does not exist (§5.1 + design-tokens §8)
    // Measured 2026-10-21: applying a `borderRadius` token writes ALL FOUR corner props into `shape.tokens`
    // (`borderRadiusTopLeft/TopRight/BottomRight/BottomLeft`); a single-property apply yields a partial map, so the
    // binding proof below is "every non-zero corner carries its token", and `TK.bindBoard` binds the four together.
    // The ladder is read from the LIVE set (`TK.declared().radii`), never from `CF.RAD`, so a file that renames or
    // drops a step is judged by what it actually declares.
    const CORNERS = ['borderRadiusTopLeft', 'borderRadiusTopRight', 'borderRadiusBottomRight', 'borderRadiusBottomLeft'];
    const RI = (function () {
      if (!storage.TK || !storage.TK.declared) return null;
      let r = [];
      try { r = storage.TK.declared().radii || []; } catch (e) { r = []; }
      const byVal = {};
      r.forEach(function (x) { byVal[Math.round(Number(x.value))] = x.name; });
      return { count: r.length, byVal: byVal, steps: r.map((x) => x.name + ' ' + N(x.value)) };
    })();
    function cornersOf(s) {
      let b = null; try { b = s.borderRadius; } catch (e) { return null; }
      if (b === null || b === undefined) return null;
      if (typeof b === 'number') return [b, b, b, b];
      if (typeof b === 'object') return CORNERS.map(function (p) { return Number(b[p]) || 0; });
      return null;
    }
    function radiusAudit(s, st) {
      // Judged on masters and on copies alike: a copy can carry a corner override, and a master's corner is the value
      // every copy inherits. Only `isCopy` stops the descent below (the interior of a consumer is not a second opinion).
      if (!RI || !RI.count || isAnno(s) || isCopy(s)) return;
      const cs = cornersOf(s); if (!cs) return;
      const hit = cs.filter((v) => v > 0);
      if (!hit.length) return;
      const rc = out.radius || (out.radius = { shapes: 0, onLadder: 0, bound: 0, steps: {}, off: {} });
      rc.shapes++;
      let tk = {}; try { tk = s.tokens || {}; } catch (e) {}
      // ONE finding per shape per class: a scalar radius writes four identical corners, and four copies of the same
      // indictment would multiply every page's count without naming four different defects.
      const off = [], unbound = [];
      cs.forEach(function (v, i) {
        if (v <= 0) return;
        const name = RI.byVal[Math.round(v)];
        if (!name) { off.push(v); rc.off[v] = (rc.off[v] || 0) + 1; return; }
        if (!tk[CORNERS[i]]) { unbound.push(CORNERS[i] + '=' + N(v) + ' (' + name + ')'); return; }
        rc.steps[name] = (rc.steps[name] || 0) + 1;
      });
      if (off.length) add('radius_off_ladder', s, st.top,
        N(off[0]) + (off.length > 1 ? ' +' + off.length + ' corners' : '') +
        ' is not a declared border-radius token (' + RI.steps.join('/') + ') — the corner was invented, take it from the ladder');
      if (unbound.length) add('radius_unbound', s, st.top,
        unbound.join(' ') + ' carries no tokens.borderRadius* binding — run TK.bindBoard');
      if (!off.length) rc.onLadder++;
      if (!off.length && !unbound.length) rc.bound++;
    }

    // ---- rules 32/33/34b · §2 makes whitespace the FIRST separation device, so its ABSENCE is a defect of the same
    // class as an off-scale number. The amounts come from `LY.BREATH` — the very table `NL.frame({breath:…})` writes —
    // so a builder that used the ladder cannot be indicted by the gate, and the gate cannot drift from the ladder.
    function isBlock(k, col) {
      try { if (k.layoutChild && k.layoutChild.absolute) return false; } catch (e) { return false; }   // not separated by a gap
      if (isAnno(k) || /-PageRoot$|-Header$|-Footer$/.test(nameOf(k)) || EXEMPT.test(nameOf(k))) return false;
      const b = box(k);
      return (col ? b.h : Math.min(b.w, b.h)) >= CFG.blockMin;
    }
    function flexGap(s) {
      let fx = null; try { fx = s.flex || null; } catch (e) { return null; }
      if (!fx) return null;
      const col = String(fx.dir || 'column') !== 'row';
      return { col: col, gap: num(fx, col ? 'rowGap' : 'columnGap', 0) };
    }
    /** Running prose (not a label): it wraps, and it is wide enough to have a measure to respect (§3.4). */
    function isProse(t) {
      if (!isText(t)) return false;
      const b = box(t), fs = fsOf(t);
      if (b.w < CFG.proseMin) return false;
      const lh = CF.lineH(fs, null, str(t, 'fontFamily', null));
      return b.h >= lh * 1.8;
    }
    /** A uniform run of repeated items (table rows, list items, matrix cells) is ONE group: equal extents on a equal
        pitch means the container is a data list, and a list separates its items with rules and surface polarity, not
        with air. Rule 33 (2×) never binds a run — measured 2026-10-21 on 02.03 · Contrast matrix, where it indicted the
        same 48px row 12 times. `grouped` = the run's items stack their own interior (cards), and for a column of cards
        the whitespace FLOOR (rule 32) still binds even though the 2× rule does not. */
    function runOf(kids, col) {
      if (kids.length < 3) return null;
      const bs = kids.map(box), ext = [], pitch = [];
      for (let i = 0; i < bs.length; i++) ext.push(col ? bs[i].h : bs[i].w);
      for (let i = 1; i < bs.length; i++) pitch.push(col ? bs[i].y - bs[i - 1].y : bs[i].x - bs[i - 1].x);
      const flat = (a) => a.every((v) => Math.abs(v - a[0]) <= 2);
      if (!flat(ext) || !flat(pitch)) return null;
      const grouped = kids.some(function (k) {
        const g = flexGap(k);
        return !!g && g.col && (kidsOf(k) || []).filter((c) => isBlock(c, g.col)).length >= 2;
      });
      return { grouped: grouped };
    }
    function breathAudit(s, st, compos) {
      if (isAnno(s) || isInstance(s)) return;
      const fg = flexGap(s); if (!fg) return;
      const kids = (kidsOf(s) || []).filter((k) => isBlock(k, fg.col));
      if (kids.length < 2) return;
      // Adoption read, not a rule: §2 makes whitespace the FIRST separation device, so delivery has to be able to say how
      // much of the file is laid out on the `LY.BREATH` ladder rather than on an arbitrary on-scale number. A gap can be
      // `space_off_scale`-free and still not breathe.
      const bc = out.breath || (out.breath = { containers: 0, onLadder: 0, ladder: {}, off: {}, samples: [] });
      bc.containers++;
      const LV = LY.BREATH ? (LY.BREATH[st.tier] || LY.BREATH.web) : null;
      const lvl = LV ? LY.breathLevels().filter((k) => Math.abs(LV[k] - fg.gap) <= 0.01)[0] : null;
      if (lvl) { bc.onLadder++; bc.ladder[lvl] = (bc.ladder[lvl] || 0) + 1; }
      else { bc.off[fg.gap] = (bc.off[fg.gap] || 0) + 1;
        if (bc.samples.length < 8) bc.samples.push(nameOf(s).slice(0, 26) + ':' + N(fg.gap)); }
      const floor = LY.breath ? LY.breath('inline', st.tier) : 8;
      // A **row** of blocks may abut on purpose: §1.3 says adjacent panes and segments touch with a hairline, and that is
      // exactly what a Segmented / ButtonGroup / table row draws. The floor binds a row only when its members are cards
      // (each with a stacked interior of its own) or when the row already tried to separate them (gap > 0).
      if (!fg.col) {
        const cards = kids.filter(function (k) {
          const g = flexGap(k);
          return g && (kidsOf(k) || []).filter((c) => isBlock(c, g.col)).length >= 2;
        });
        if (fg.gap === 0 && cards.length < 2) return;
      }
      const run = runOf(kids, fg.col);
      if (fg.gap < floor) {
        // A cross-axis run (rows of cells) separates by rules, not air; a run of stacked cards still needs the floor.
        if (!(run && !run.grouped)) {
          add('cramped_gap', s, st.top, (fg.col ? 'row' : 'column') + ' gap ' + N(fg.gap) + ' between ' + kids.length +
            ' block-level children — under LY.breath("inline","' + st.tier + '")=' + floor + ': §2 makes whitespace the separator, so this stack has none ("' +
            nameOf(s).slice(0, 40) + '")');
        }
      }
      // 34b · prose↔prose needs a line of air (the CSS `margin-block: 1em` convention and §2's block rhythm). A label is
      // not prose, so the legal 4-6 label↔field gap is never judged here.
      if (fg.col) {
        for (let i = 0; i + 1 < kids.length; i++) {
          const A = kids[i], Bc = kids[i + 1];
          if (!isProse(A) || !isProse(Bc)) continue;
          const lh = CF.lineH(fsOf(A), null, str(A, 'fontFamily', null));
          const gap = box(Bc).y - box(A).b;
          if (gap >= 0 && gap < lh - 0.5) {
            add('text_cramped', Bc, st.top, 'paragraph gap ' + N(gap) + ' under one line (' + N(lh) + 'px) of the prose above — §2: body copy needs at least a line of air');
          }
        }
      }
      // 33 · the 2× rule, at composition level only: inside a CF host the `inline`/`row` steps are anatomy the factory
      // owns, and a spec matrix places its cells by measured content. Never judged across a repeated-item run.
      // `inner` counts a child ONLY when that child is itself a STACKED group (column axis, ≥2 block children): the gap
      // inside a table row is the gap between its CELLS, which separates fields, not groups. Measured 2026-10-21 on
      // 02.03 · Contrast matrix, where a 48px row's 16px cell gap was read as "the gap inside the group" 7 times.
      if (compos && LY.breath && !(run && !run.grouped)) {
        let inner = 0;
        kids.forEach(function (k) {
          const g = flexGap(k);
          if (!g || !g.col || g.gap < floor) return;
          if ((kidsOf(k) || []).filter((c) => isBlock(c, true)).length < 2) return;
          inner = Math.max(inner, g.gap);
        });
        if (inner && fg.gap < 2 * inner - 0.5) {
          add('hierarchy_gap', s, st.top, 'gap ' + N(fg.gap) + ' between groups is under 2× the gap ' + N(inner) +
            ' inside them (§2 2× rule) — raise this container to ' + N(LY.snap(2 * inner)) + ' or tighten the child ("' +
            nameOf(s).slice(0, 40) + '")');
        }
      }
    }
    // ---- text rules: ramp, measure, contrast, disabled alpha, leading (level 2: they judge copy wherever it lives)
    function auditText(t, st, par) {
      out.texts = (out.texts || 0) + 1;
      if (isAnno(t)) return;
      paintAudit(t, st, true);
      const fs = fsOf(t), txt = charsOf(t), r = box(t);
      // rule 34a · §2's rhythm lives in the type itself: `mkText` writes the ramp step's leading onto the layer, so a
      // text drawn at a tighter multiplier is copy the builder compressed by hand — invisible to every size rule, because
      // the size is on the ramp. Judged when the run wraps (a single line shows no rhythm) or when the multiplier would
      // clip its own line box (<1). The floor is the **tightest** declared step at that size, so the auditor never
      // demands more air than the ramp itself claims.
      const lhRaw = parseFloat(str(t, 'lineHeight', ''));
      if (Number.isFinite(lhRaw) && lhRaw > 0) {
        const want = LEAD[fs] !== undefined ? LEAD[fs] : CFG.minLeading;
        const one = CF.lineH(fs, null, str(t, 'fontFamily', null));
        if ((r.h >= one * 1.8 || lhRaw < 1) && lhRaw < want - 0.02) {
          add('text_cramped', t, st.top, 'lineHeight ' + lhRaw + ' under the declared leading ' + want + ' of the ' + fs +
            'px step' + (r.h >= one * 1.8 ? ' — ' + Math.max(2, Math.round(r.h / (lhRaw * fs))) + ' wrapped lines of copy'
              : ' — clips its own line box') + '. Bind the typography token; the ramp owns the rhythm');
        }
      }
      // §4.2 a swatch caption is a *claim about the paint beside it*. A token-bound plate follows the token while its
      // label keeps the hex authored at build time, so a board built before a theme overlay reads correct swatches
      // with stale captions — invisible to every other rule, because the text itself is well-formed. Scoped to the
      // wash/hue/ink grammar on purpose: that is the palette-documentation label and nothing else.
      const cap = /^(wash|hue|ink)\s+#([0-9a-f]{6})$/i.exec(txt.trim());
      if (cap && par) {
        const paints = [];
        // Array.from(par.children): the sibling set of the caption. Identity tests on shape proxies never hold, so the
        // caption itself is excluded by id below, not by ===.
        const tid = str(t, 'id', '');
        Array.from(par.children || []).forEach((k) => {
          // compare by id — every .children access returns a NEW proxy, so `k === t` is never true (api-pitfalls §7)
          if (str(k, 'id', '') === tid) return;
          const f = arr(k, 'fills');
          if (f.length && hexOK(f[0].fillColor)) paints.push(String(f[0].fillColor).toUpperCase());
        });
        if (paints.length === 1 && paints[0] !== '#' + cap[2].toUpperCase()) {
          add('caption_stale', t, st.top, '"' + txt.trim() + '" quotes ' + cap[2].toUpperCase() +
            ' but its swatch paints ' + paints[0] + ' — rebuild this board after the theme, or re-derive the caption from the plate');
        }
      }
      out.sizes[fs] = (out.sizes[fs] || 0) + 1;
      out.fonts[str(t, 'fontFamily', '?')] = (out.fonts[str(t, 'fontFamily', '?')] || 0) + 1;
      if (RAMP.indexOf(fs) >= 0) {
        // §3.2: 11px is legal only for a declared typographic role — the factory names those nodes (ctx.text({role})).
        // Reading the copy back is not decidable: "disabled" is an axis header, "Home" is navigation.
        // A `sample · <step>` node is the exception by construction: it is a type specimen (what `FN.typeRamp` draws),
        // its whole purpose is to render every declared step at its own size, and it is named after the token it shows.
        // Suppressing it is the point of that board; suppressing 11px copy in a screen is the point of this rule.
        if (fs === 11 && !/^sample · /.test(nameOf(t)) && !/(axis|overline|kbd)/.test(nameOf(t) + ' ' + chainName(t, st.top))) {
          add('off_ramp_size', t, st.top, '11px copy has no declared role (§3.2: axis/overline/kbd only) — raise it to 12: "' + txt.slice(0, 14) + '"');
        }
      } else {
        add('off_ramp_size', t, st.top, fs + 'px is not in the declared ramp (' + txt.slice(0, 14) + ')');
      }
      // §3.4 measure — only multi-line copy can read too wide
      const lines = Math.max(1, Math.round(r.h / Math.max(12, fs * 1.35)));
      if (r.w > CFG.measure && lines > 2 && !CHATRX.test(chainName(t, st.top))) {
        add('measure_overflow', t, st.top, 'w=' + N(r.w) + ' ≈ ' + lines + ' lines over the ' + CFG.measure + 'px measure');
      }
      const fl = arr(t, 'fills'); if (!fl.length || !hexOK(fl[0].fillColor)) return;
      const alpha = Math.max(0, Math.min(1, num(fl[0], 'fillOpacity', 1))) * Math.max(0, Math.min(1, num(t, 'opacity', 1)));
      // The state must be a NAME SEGMENT of an ancestor host (`Button·Disabled·Md`, the §4 grammar) — see inDisabledHost.
      if (inDisabledHost(t, st.top)) {           // disabled: owned by disabled_wrong, exempt from contrast
        if (alpha > CFG.alphaBand[1]) add('disabled_wrong', t, st.top, 'disabled label alpha ' + alpha.toFixed(2) +
          ' above the ' + CFG.alphaBand.join('–') + ' band (use ' + CF.STATE.disabledContent + ', not a brighter hex)');
        else if (alpha < CFG.alphaBand[0]) add('disabled_wrong', t, st.top, 'disabled label alpha ' + alpha.toFixed(2) +
          ' under the ' + CFG.alphaBand.join('–') + ' band (invisible copy is not a state)');
        return;
      }
      if (alpha < CFG.opaqueFill) return;      // state layers / placeholder washes are a different concern than legibility
      const bg = bgUnder(t, pageBg);
      const fg = mix(bg, toRGB(fl[0].fillColor), alpha);
      let want = fs >= CFG.largeText ? CFG.largeContrast : CFG.bodyContrast;
      if (isToneColor(fl[0].fillColor)) want = CFG.toneContrast;      // §4: status colour is double-encoded, so 3:1 applies
      const got = cr(fg, bg);
      if (got < want * CFG.contrastTol) add('contrast', t, st.top, charsOf(t).slice(0, 14) + ' ' + got.toFixed(2) + ':1 < ' + want + ':1 for ' + str(fl[0], 'fillColor', '?') + ' on ' + toHex(bg));
    }

    // ---- shape rules
    // Coverage is counted from the host's NAME, which survives componentization: once G10 replaces a spec-matrix cell with
    // an instance, the instance still demonstrates that family's state/variant/size — only its internals belong to the
    // master. Counting only hand-drawn hosts made every componentized family read as `variant_sparse`.
    function noteFamily(board, fam, p, deep) {
      const nm = nameOf(board);
      const F = out.families[fam] || (out.families[fam] = { family: fam, hosts: 0, states: {}, variants: {},
        sizes: {}, sizesAny: false, icons: { lead: 0, trail: 0 }, focus: 0, rings: 0, thickBorder: 0, boards: {} });
      F.hosts++; F.boards[nm] = (F.boards[nm] || 0) + 1;
      const sn = p.state || 'default';
      F.states[sn] = (F.states[sn] || 0) + 1;
      F.variants[p.variant] = (F.variants[p.variant] || 0) + 1;
      if (p.size) { F.sizes[p.size] = (F.sizes[p.size] || 0) + 1; F.sizesAny = true; }
      if (/IconStart|Lead|icon·/.test(nm)) F.icons.lead++;
      if (/IconEnd|Trail|Clear/.test(nm)) F.icons.trail++;
      if (deep && p.state === 'focus') {
        F.focus++;
        const ds = []; const collect = (n3) => { (kidsOf(n3) || []).forEach((c) => { ds.push(c); if (rec(c)) collect(c); }); };
        collect(board);
        let hasRing = ds.some((d) => /^ring·/.test(nameOf(d)));
        // CF.ring() deliberately mounts the ring one level up when the host clips (a card, a modal): drawn inside, the
        // clipped host cuts the outer band and the focus state shows two line segments instead of a ring. That ring is
        // still the host's focus evidence, so look for a sibling anchored on the host's box before calling it missing.
        if (!hasRing && board.parent) {
          const br = box(board);
          hasRing = (kidsOf(board.parent) || []).some((c) => {
            if (!/^ring·/.test(nameOf(c))) return false;
            const cr = box(c);
            return Math.abs(cr.w - br.w - 4) <= 2 && Math.abs(cr.h - br.h - 4) <= 2 &&
              Math.abs((cr.x + cr.w / 2) - (br.x + br.w / 2)) <= 2 &&
              Math.abs((cr.y + cr.b / 2) - (br.y + br.b / 2)) <= 2;
          });
        }
        if (hasRing) F.rings++;
        else if (arr(board, 'strokes').some((sh) => num(sh, 'strokeWidth', 1) >= 2)) F.thickBorder++;
      }
    }
    function auditShape(s, par, st) {
      out.shapes++;
      const r = box(s), nm = nameOf(s), fam = famOf(s);
      const spec = isSpecBoard(s);
      const exempt = EXEMPT.test(nm) || isAnno(s);
      if (/[/\n]/.test(nm)) add('name_invalid', s, st.top, '"' + nm + '" contains an illegal / or newline');
      // §4.3 an anatomy/recipe cell is a container the `after` pass fills with region plates. When a build times out and
      // the stray-heal mounts the bare board, the container survives with NOTHING inside — the board looks present in
      // every structural check and is empty on screen. Only a child count can see that, so it is checked by name.
      if (/^cell·(slot|recipe)·/.test(nm) && !(kidsOf(s) || []).length) {
        add('empty_cell', s, st.top, '"' + nm + '" has no children — its `after` pass never ran, so this block is a '
          + 'frame with no content; re-drive it with spec.replace=true (engines.md §6)');
      }
      if (isText(s)) { auditText(s, st, par); return; }

      // level 1 (composed layout only): grid + radius nesting
      const compos = !st.inCf && !st.inSpec;
      // imported SVG interiors (createShapeFromSvg → groups named svg/… with svg-* children) are vector geometry:
      // their sizes/positions come from the drawing, not from authored coordinates — judging them on the 4px grid is noise.
      const inImported = par && typeOf(par) === 'group' && (/^(svg|base-background)/.test(nm) || /^svg/.test(nameOf(par)));
      // A child of a **native grid-layout board** is placed by the platform: a 12-track grid at margin 32 / gutter 24
      // gives a 94px column, so judging its x/w on the 4px grid blames the designer for a division they did not type.
      // Same reasoning as the imported-SVG exemption above.
      const inGrid = (function () { try { return !!(par && par.grid && par.grid.columns && Array.from(par.grid.columns).length); } catch (e) { return false; } })();
      // Same class of exemption for **flex centering**: a child of a flow board whose parent centers on an axis gets
      // that offset from `padT + Σh + (n−1)·gap` math, not from a typed coordinate. A 44px caption centered in a 64px
      // row sits at y=10 — the 4px grid is unreachable there by construction (measured 2026-10-21 on the FN `Grid`
      // board). Judging it would demand that nobody ever center-aligns, so the axis the parent owns is skipped.
      const fxc = (par && par.flex) || null;
      const centered = function (axis) {
        if (!fxc) return false;
        try {
          const mainIsX = String(fxc.dir || 'column') === 'row';
          const isMainAxis = (axis === 'x') === mainIsX;
          const v = isMainAxis ? fxc.justifyContent : fxc.alignItems;
          return String(v) === 'center';
        } catch (e) { return false; }
      };
      if (compos && !exempt && !inImported && !inGrid && (isPlate(s) || typeOf(s) === 'board')) {
        const pr = par ? box(par) : { x: 0, y: 0 };
        const axes = [];
        // §1 binds what the designer **typed**. In a flow board the typed numbers are the padding, the gap and the
        // sizing declaration — the resulting coordinates and hug boxes are arithmetic over font metrics (a 13px label
        // is 19 tall at leading 1.4), so `y=54` or `h=99` cannot be fixed by anyone who did not also change the font.
        // Measured 2026-10-21 on the FN `Palette` board: every finding on that board was of this kind, while the actual
        // defect (a hug frame frozen at 6px under 68px of text) is invisible to this rule and is caught by
        // `NL.auditFlow`'s `hug_frozen` instead. Absolute children are still judged: their x/y IS typed.
        const flowChild = !!fxc && !(function () { try { return !!(s.layoutChild && s.layoutChild.absolute); } catch (e) { return true; } })();
        // A board the Foundations shelf pinned is positioned by `previous bottom + declared gap`, and a hug bottom is a
        // font-metric sum — the coordinate is derived, the gap is the decision (`off_scale_gap` judges that instead).
        // Read the durable `nl:shelf` stamp first: `NL._meta` is JS memory and is gone the moment the session re-seeds,
        // which would make an FN-projected board fail `off_grid` for a defect nobody introduced.
        const shelfPlaced = (function () {
          try { if (typeOf(s) === 'board') { const d = storage.NL && storage.NL.readStamp && storage.NL.readStamp(s); if (d && d.shelf) return true; } } catch (e) {}
          try { return !!(storage.NL && storage.NL._meta && storage.NL._meta(s) && storage.NL._meta(s).shelfPlaced); } catch (e) { return false; }
        })();
        const hugW = (function () { try { return String(s.horizontalSizing) === 'auto'; } catch (e) { return false; } })();
        const hugH = (function () { try { return String(s.verticalSizing) === 'auto'; } catch (e) { return false; } })();
        if (isPlate(s) || !fam) {                                  // a CF control host's own size is ladder- or content-derived
          // A device viewport (375, 834) is a hardware fact, not a coordinate the designer chose — §1 does not bind it.
          const devw = [LY.TIERS.web.w, LY.TIERS.pad.w, LY.TIERS.mobile.w];
          if (!hugW && r.w > CFG.hairline && devw.indexOf(N(r.w)) < 0 && Math.abs(LY.snap(r.w) - r.w) > 0.5) axes.push('w=' + N(r.w));   // epsilon: penpot.group bbox math leaves 1e-13 residue
          if (!hugH && r.h > CFG.hairline && Math.abs(LY.snap(r.h) - r.h) > 0.5) axes.push('h=' + N(r.h));
        }
        if (r.w > CFG.hairline && r.h > CFG.hairline && !flowChild && !shelfPlaced) {
          if (!centered('x') && Math.abs(LY.snap(r.x - pr.x) - (r.x - pr.x)) > 0.5) axes.push('x=' + N(r.x - pr.x));
          if (!centered('y') && Math.abs(LY.snap(r.y - pr.y) - (r.y - pr.y)) > 0.5) axes.push('y=' + N(r.y - pr.y));
        }
        if (axes.length) add('off_grid', s, st.top, axes.join(' ') + ' off the 4px grid');
      }
      if (compos && par && !exempt && !isText(s)) {
        const rad = radiusOf(s);
        if (rad >= 2 && rad < 100) {
          const prad = radiusOf(par), pr = box(par);
          const inset = Math.min(r.x - pr.x, r.y - pr.y, pr.r - r.r, pr.b - r.b);
          // §5.1 formula binds only where the inset is *inside* the outer radius (r16 card + r12 chip at pad 24 is legal)
          if (prad > 0 && inset >= 0 && inset <= prad && rad > prad - inset + 0.5) {
            add('radius_nesting', s, st.top, 'r' + N(rad) + ' inside r' + N(prad) + ' at inset ' + N(inset) + ' (max ' + N(prad - inset) + ')');
          }
        }
      }
      // rule 37 · ring_off_host — `CF.ROLE.ring = 'host'`: a ring is the control's derived outline, so its corner IS the
      // control's corner. Measured 2026-10-22 on `Button·Primary·MD·Focus·Pill` — the body carried `r0` and the ring
      // `r9999`, and 194 of the file's 230 rings disagreed with their host. Both numbers sit on the ladder and both are
      // token-bound, so rules 35/36 pass it; only comparing the pair can see the defect the eye sees.
      if (/^ring·/.test(nm) && !isAnno(s) && par) {
        const host = (function () {
          const rb = box(s);
          let best = null;
          (kidsOf(par) || []).forEach(function (k) {                    // CF.ring() mounts the ring one level UP when the
            if (k === s || !famOf(k)) return;                           // host clips: then the host is the sibling the ring
            const kb = box(k);                                          // surrounds by 2px, not the container.
            if (Math.abs(kb.w + 4 - rb.w) <= 2 && Math.abs(kb.h + 4 - rb.h) <= 2 &&
                Math.abs((kb.x + kb.w / 2) - (rb.x + rb.w / 2)) <= 2 &&
                Math.abs((kb.y + kb.h / 2) - (rb.y + rb.h / 2)) <= 2) best = k;
          });
          if (best) return best;
          return famOf(par) ? par : null;                               // ring drawn inside its host control
        })();
        if (host) {
          const rc = cornersOf(s), hc = cornersOf(host);
          const rv = rc ? Math.max.apply(null, rc) : null, hv = hc ? Math.max.apply(null, hc) : null;
          if (rv !== null && hv !== null && rv !== hv) {
            add('ring_off_host', s, st.top, 'ring r' + N(rv) + ' around host "' + nameOf(host).slice(0, 30) + '" r' + N(hv) +
              ' — a ring takes its host corner (repair: TK.roleSweep)');
          }
        }
      }
      if (!rec(s)) return;
      if (isCopy(s)) {
        const ib = typeOf(s) === 'board' ? s : null;
        if (ib && fam && !spec && !st.inCf && st.inSpec) noteFamily(ib, fam, parseName(nm), false);
        radiusAudit(s, st);                       // a copy can carry its own corner override: judge the host, not its interior
        return;                                   // internals belong to the main instance, which this pass visits directly
      }
      paintAudit(s, st, false);
      spaceAudit(s, st);
      radiusAudit(s, st);
      breathAudit(s, st, compos);
      // G10 (point 6): a control that already has a master in the library must be **placed**, not drawn again. The
      // redrawn copy is the maintenance bug — fix the master and every copy stays wrong, and no variant/swap exists.
      // Fires only once the master is registered, so it cannot be noise on a file that has no library yet.
      if (compos && typeOf(s) === 'board' && fam && CF.get && CF.get(nm)) {
        // The main component's own head IS the host named after the master — registering it must not indict it.
        let main = null; try { const rr = CF.get(nm); main = rr && rr.mainInstance ? rr.mainInstance() : null; } catch (e0) {}
        if (!main || main.id !== s.id) {
          add('not_component', s, st.top, '"' + nm + '" is a registered master but was drawn again — place it with CF.instance(\'' + nm + '\', { parent, … })');
        }
      }
      const board = typeOf(s) === 'board' ? s : null;
      if (board) out.boards++;
      // A pane region that also carries **its own** copy, over a child region that carries copy, is the dashboard/
      // docsLayout defect: the paragraph drawn into the pane ran underneath (or across) the filled child band. A pane
      // is structure; a host pane may be filled only when its child regions are its own empty anatomy.
      if (board && /^region·/.test(nm) && ownCopy(board) && holdsFilledRegion(board)) {
        add('pane_filled', board, st.top, '"' + nm + '" contains a filled region and carries copy of its own — a pane is structure; fill its leaves only');
      }
      // A board named `Foo·…` where Foo is not a known family would silently escape the coverage audit, so say so
      // rather than let a typo'd factory name read as a clean spec.
      // parseName puts the family in seg[0] ("CF.name() drops the default state… the family is therefore always seg[0]"),
      // so the check reads seg[0] too. Judging seg[1] turned every structural index row (`cell·Accordion·0`, where the
      // family word is the *second* segment by construction) into a claimed typo'd factory.
      const seg0 = nm.split('·')[0] || '';
      if (board && !fam && !spec && looksLikeCf(board) && /^[A-Z][A-Za-z]+$/.test(seg0)) {
        add('spec', s, st.top, 'control host "' + nm + '" names an unknown family "' + seg0 + '" (not in component-library §3.0)');
      }
      const cfHost = !!board && (!!fam || spec || looksLikeCf(board));

      const childSt = { top: st.top, tier: st.tier, inCf: st.inCf || (cfHost && !spec), inSpec: st.inSpec || spec };

      if (board && fam && !spec) {
        const p = parseName(nm);
        // §6 touch floor: 24 inside a spec board (it demonstrates the whole size axis), the tier floor on a screen
        const floor = st.inSpec ? CFG.specTouchMin : LY.TIERS[tier].touch;
        const pad = (kidsOf(board) || []).find((k) => /^hitpad·/.test(nameOf(k)));
        const padSide = pad ? Math.min(num(pad, 'width', 0), num(pad, 'height', 0)) : 0;
        const eff = Math.max(padSide, Math.min(r.w, r.h));
        if (CLASS[fam] !== 'display' && !exempt && eff < floor) {
          add('touch_target', board, st.top, fam + ' ' + N(r.w) + '×' + N(r.h) + ' < ' + floor + ' (' +
            (st.inSpec ? 'spec floor' : tier + ' floor)') + (pad ? ' — hitpad ' + N(padSide) : ''));
        }
        if (ROW_FAMS.indexOf(fam) >= 0 && LY.ROWS.filter((h) => h >= 32).indexOf(N(r.h)) < 0) {
          add('row_height', board, st.top, 'table row h=' + N(r.h) + ' outside ' + LY.ROWS.filter((h) => h >= 32).join('/'));
        }
        // §1 control caps + §4 one primary per region — both judged against the *region* the control sits in
        const cap = CAPS[fam], reg = regionOf(board), regW = num(reg, 'width', 0);
        // A control authored exactly at its cap reads back as 420.00000000000045: the same bbox residue the grid check
        // allows 0.5 for (§1 epsilon above). Without it a compliant control fails its own cap.
        if (cap && regW >= CFG.capContainer && r.w > cap + 0.5) {
          add('control_too_wide', board, st.top, fam + ' w=' + N(r.w) + ' > cap ' + cap + ' inside a ' + N(regW) + 'px region');
        }
        if (PRIMARY_FAMS.test(fam) && /·Primary/.test(nm) && !st.inSpec && !spec) {
          const bucket = (out.__prim = out.__prim || {});
          const key = (reg === st.top ? '__top' : String(reg.id || nameOf(reg))) + '·primary';
          (bucket[key] = bucket[key] || []).push({ sh: board, where: reg });
        }
        // coverage buckets: §5.2 binds "every interactive component's **spec board**", so only spec context feeds them.
        // `!st.inCf` keeps that true to its word: a control mounted *inside another control* (a Button in a table row)
        // is usage of that family, not its variant matrix — its states are demonstrated by its own spec board.
        if (!st.inCf && (st.inSpec || spec)) noteFamily(board, fam, p, true);
      } else if (board && !cfHost) {
        auditContainerBoard(board, st);
      }
      (kidsOf(board || s) || []).forEach((c) => { try { auditShape(c, board || s, childSt); } catch (e) { err(nameOf(c), e); } });
    }

    // ---- container-board rules (gaps, rhythm, split, viewport)
    function auditContainerBoard(b, st) {
      const r = box(b), kids = (kidsOf(b) || []).filter((c) => !EXEMPT.test(nameOf(c)) && !ANNO.test(nameOf(c)));
      // A **composed** block is one whose extent the agent chose through LY. A CF host board is auto- or ladder-sized,
      // and a spec matrix places its cells by measured glyph width, so the whitespace next to either is arithmetic, not
      // a design decision — judging it would flag every component page. Level-1 rules bind composed blocks only.
      const blocks = kids.filter((c) => {
        const k = box(c);
        return !isText(c) && k.w >= CFG.blockMin && k.h >= CFG.blockMin && (isPlate(c) || isBox(c)) &&
          !isHostBoard(c) && !isSpecBoard(c);
      });
      // §1 measured gaps between sibling blocks (the 2× rule and the scale are the same check from two sides).
      // "Neighbour" must mean neighbour in the FULL child list, not in the filtered one: when an exempt/annotation row
      // sits between two judged blocks (measured 2026-10-21, `row·col-header` inside FN's `Semantic roles`), the pair
      // that survives the filter spans it and the rule reports a 49px gap nobody authored — the real rhythm is 16 + 16.
      const allKids = (kidsOf(b) || []).slice().sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      const rank = {}; allKids.forEach((c, i) => { rank[str(c, 'id', '')] = i; });
      const vs = blocks.slice().sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      for (let i = 0; i < vs.length - 1; i++) {
        for (let j = i + 1; j < i + 2; j++) {   // neighbour only: non-adjacent "gaps" are cumulative spacing, not rhythm
          if (rank[str(vs[j], 'id', '')] - rank[str(vs[i], 'id', '')] !== 1) continue;
          const A = box(vs[i]), Bc = box(vs[j]);
          if (Math.min(A.r, Bc.r) - Math.max(A.x, Bc.x) <= 0) continue;
          const gap = A.b <= Bc.y ? Bc.y - A.b : (Bc.b <= A.y ? A.y - Bc.b : 0);
          if (gap > 0 && gap < r.h && gap <= SPREAD_MAX && !LY.onScale(gap, CFG.gapTol)) {
            add('off_scale_gap', gap === Bc.y - A.b ? vs[j] : vs[i], b, 'gap ' + N(gap) + ' between "' + nameOf(vs[i]) + '" and "' + nameOf(vs[j]) + '" is off ' + LY.SPACE.join('/'));
          }
        }
      }
      const hs = blocks.slice().sort((a, c) => num(a, 'x', 0) - num(c, 'x', 0));
      const allX = (kidsOf(b) || []).slice().sort((a, c) => num(a, 'x', 0) - num(c, 'x', 0));
      const rankX = {}; allX.forEach((c, i) => { rankX[str(c, 'id', '')] = i; });
      for (let i = 0; i < hs.length - 1; i++) {
        for (let j = i + 1; j < i + 2; j++) {   // neighbour only (same reason)
          if (rankX[str(hs[j], 'id', '')] - rankX[str(hs[i], 'id', '')] !== 1) continue;
          const A = box(hs[i]), Bc = box(hs[j]);
          if (Bc.x - A.r <= 0) continue;                            // not ordered / overlapping in x
          const yh = Math.min(A.b, Bc.b) - Math.max(A.y, Bc.y);
          if (yh < Math.min(A.h, Bc.h) * 0.5) continue;             // different rows, not a column gap
          const gap = Bc.x - A.r;
        if (gap > SPREAD_MAX) continue;
          if (gap > 0 && !LY.onScale(gap, CFG.gapTol)) {
            add('off_scale_gap', hs[j], b, 'column gap ' + N(gap) + ' between "' + nameOf(hs[i]) + '" and "' + nameOf(hs[j]) + '" is off scale');
          }
        }
      }
      // §8 two-column ratio (and the "three equal panes" tell: rails must be narrower than content)
      const panes = blocks.filter((c) => { const k = box(c); return isBox(c) && k.h >= r.h * 0.8 && k.w >= r.w * 0.2 && Math.abs(k.y - r.y) <= 8; });
      const legName = nameOf(b) + ' ' + chainName(b, st.top);
      if (panes.length === 2 && !SPLITRX.test(legName) && !LEGRX.test(legName)) {
        const a = box(panes[0]), c2 = box(panes[1]);
        const ratio = Math.max(a.w, c2.w) / Math.max(1, Math.min(a.w, c2.w));
        if (ratio < CFG.splitMin) add('split_ratio_50_50', panes[0], b, 'panes ' + N(a.w) + '/' + N(c2.w) + ' = ' + ratio.toFixed(2) + ':1 (§8 needs ' + CFG.splitMin + '–3.2:1)');
      } else if (panes.length >= 3 && !LEGRX.test(legName)) {
        const ws = panes.map((p2) => box(p2).w);
        const spread = Math.max.apply(null, ws) / Math.max(1, Math.min.apply(null, ws));
        if (spread < 1.1) add('split_ratio_50_50', panes[0], b, panes.length + ' equal panes of ' + N(ws[0]) + ' (§3.1 email tell)');
      }
      // §2 vertical rhythm between full-width bands
      const bands = blocks.filter((c) => { const k = box(c); return isBox(c) && k.w >= r.w * 0.9 && k.h >= 48; })
        .sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      const gaps = [];
      for (let i = 0; i < bands.length - 1; i++) {
        const A = box(bands[i]), Bc = box(bands[i + 1]);
        const g = Bc.y - A.b;
        if (g > 0 && LY.onScale(g, CFG.gapTol)) gaps.push(g);
      }
      if (gaps.length >= CFG.rhythmBands) {
        const idx = gaps.map((g) => { let best = -1; LY.SPACE.forEach((sp, si) => { if (Math.abs(sp - g) <= CFG.gapTol && best < 0) best = si; }); return best; });
        if (idx.every((v) => v >= 0) && Math.max.apply(null, idx) - Math.min.apply(null, idx) > 1) {
          add('rhythm_inconsistent', bands[1], b, 'band gaps ' + gaps.join('/') + ' spread over ' +
            (Math.max.apply(null, idx) - Math.min.apply(null, idx)) + ' scale steps (§2 wants one rhythm)');
        }
      }
      // §11 rule 12 viewport_locked — screen boards only (a CF control host never reaches here).
      // A board whose children are `·Spec` matrices is a documentation surface: its length comes from how many families
      // it stacks, not from a viewport habit, so the fold contract does not bind it.
      if (kids.some((c) => isSpecBoard(c))) return;
      const bt = LY.tierFor(r.w);
      // The viewport contract belongs to the tier being audited: a 720-wide card inside a 1440 page is content, not a pad screen.
      if (bt !== tier && b !== st.top) return;
      const vh = LY.viewportHeight(bt);
      const isScreen = r.w >= LY.TIERS[bt].w * 0.8 && r.h >= 300;
      if (!isScreen) return;
      out.tiers[bt] = (out.tiers[bt] || 0) + 1;
      // The grid must live ON the board. `board.guides`/`board.rulerGuides` are the writable native collections
      // (measured: only whole-array assignment works, there is no push API), so a screen that carries none was placed
      // against a grid the designer cannot see, snap to, or edit — which is also how a tall element ends up on top of
      // its neighbour: nothing on the canvas marks the boundary the hand-typed y was supposed to respect.
      // Bound only at the tier's baseline width: a 1760-wide documentation sheet is not a screen and has no column grid.
      if (Math.abs(r.w - LY.TIERS[bt].w) <= 1) {
        const gc = storage.NL && storage.NL.guideCount ? storage.NL.guideCount(b) : null;
        if (gc && gc.guides === 0 && gc.ruler === 0) {
          add('no_guides', b, st.top, 'a ' + bt + ' ' + N(r.w) + '×' + N(r.h) + ' screen carries no native guide — LY.guides(board, { tier: \'' + bt + '\' })');
        }
      }
      const contentB = (kidsOf(b) || []).reduce((m, c) => Math.max(m, num(c, 'y', 0) + num(c, 'height', 0)), r.y);
      if (Math.abs(r.h - vh) <= 8) {
        if (contentB > r.b + 1) add('viewport_locked', b, st.top, 'board is exactly the ' + bt + ' viewport (' + vh + ') while content reaches ' + N(contentB - r.y));
        else if (r.b - contentB >= CFG.deadSpace) add('viewport_locked', b, st.top, 'board is exactly the ' + bt + ' viewport with ' + N(r.b - contentB) + 'px of dead space below the content');
      }
      // The fold contract binds a **baseline-width screen**, not a documentation canvas. A 1920 PageRoot is wider than
      // the tier and carries no scrollable viewport: judging it as a screen forced a 1440×900 marker at x=0, which
      // annotated empty page space and drew an orange edge across the header (measured on the Rayo file). This is the
      // same guard the guides branch above already applies.
      if (r.h >= CFG.longBoard && Math.abs(r.w - LY.TIERS[bt].w) <= 1) {
        // LY.fold() mounts the marker next to the board it annotates, so it is found among the siblings too
        let fold = false;
        const hunt = (n3) => { (kidsOf(n3) || []).forEach((c) => { if (/^fold·/.test(nameOf(c))) fold = true; if (rec(c)) hunt(c); }); };
        hunt(b);
        // A recipe's row and its scrolling cell share the same origin; the marker is mounted beside the row (one
        // level above this cell), so an aligned fold among the siblings of ANY ancestor counts for this board.
        let p = (() => { try { return b.parent; } catch (e) { return null; } })();
        while (!fold && p) {
          const box0 = box(p);
          (kidsOf(p) || []).forEach((c) => {
            if (/^fold·/.test(nameOf(c)) && Math.abs(num(c, 'x', 1e9) - r.x) <= 2 && Math.abs(num(c, 'y', 1e9) - r.y) <= 2) fold = true;
          });
          if (p === st.top || Math.abs(box0.y - r.y) > 2) break;
          p = (() => { try { return p.parent; } catch (e) { return null; } })();
        }
        if (!fold) add('viewport_locked', b, st.top, 'board is ' + N(r.h) + ' tall (it scrolls) but carries no LY.fold() marker for the reviewer');
      }
    }

    // ---- family coverage rules (component-library §3.0 + §4), judged over the audited scope
    function auditCoverage() {
      // opts.families scopes the audit to one sub-board of the component pages: the contract puts a `·Spec` board per
      // family on pages 03–09 (core controls) and the composite families on page 10, so auditing the page root would demand
      // a 5-state TableHeader spec from a table that is only ever drawn once, in place, inside a real Table host.
      const only = opts.families && opts.families.length ? {} : null;
      if (only) opts.families.forEach((f) => { only[f] = 1; });
      Object.keys(out.families).forEach((k) => {
        const F = out.families[k], cls = CLASS[k], need = SETS[cls];
        const where = { name: Object.keys(F.boards)[0] || k };
        if (F.hosts < 2) return;                       // coverage is a property of a spec board, not of one instance
        if (only && !only[k]) return;
        if (SPEC_SKIP[k]) { out.skipped[k] = F.hosts; return; }
        const missing = need.filter((s) => !F.states[s]);
        if (cls !== 'display' && missing.length >= 2) {
          add('state_coverage', null, where, k + ' [' + cls + '] draws no ' + missing.join('/') + ' state (' + F.hosts +
            ' hosts, states seen: ' + Object.keys(F.states).join('/') + ')');
        }
        if (cls !== 'display' && STATE_ONLY_FAMS.indexOf(k) < 0) {
          const variants = Object.keys(F.variants).length, sizes = Object.keys(F.sizes).length;
          const sparse = [];
          if (variants < CFG.variantsMin) sparse.push(variants + ' variant(s) < ' + CFG.variantsMin);
          if (F.sizesAny && sizes < CFG.sizesMin) sparse.push(sizes + ' size(s) < ' + CFG.sizesMin);
          if (ICON_FAMS.indexOf(k) >= 0 && variants >= CFG.variantsMin && !F.icons.lead && !F.icons.trail) sparse.push('no icon slot variant');
          if (sparse.length) add('variant_sparse', null, where, k + ': ' + sparse.join(', '));
        }
        if (cls !== 'display' && F.focus > 0 && F.rings === 0 && F.thickBorder === 0) {
          add('focus_ring_missing', null, where, k + ': ' + F.focus + ' Focus host(s) with neither a ring· layer nor a ≥2px focus border');
        }
      });
      const bucket = out.__prim || {};
      Object.keys(bucket).forEach((key) => {
        const list = bucket[key];
        if (list.length > 1) add('multiple_primary', list[1].sh, list[1].where,
          list.length + ' filled primaries in one region (' + list.map((e) => nameOf(e.sh)).join(', ') + ')');
      });
      delete out.__prim;
    }

    // ---- run
    const st0 = { top: top, tier: tier, inCf: false, inSpec: false };
    try { auditShape(top, root || null, st0); } catch (e) { out.errors.push('walk:' + (e && e.message || e)); }
    auditCoverage();

    // ---- rule 30: the ramp must be *reachable*, not only declared.
    // A `typography` token is what the auditor binds to; a `LibraryTypography` style is what a human picks off
    // 素材 → 排版. Measured 2026-10-21: 40 active tokens, 0 styles, empty panel — every other rule passed, because
    // every other rule reads the tree or the token set, and neither tells you the library has nothing to offer.
    try {
      const rampN = (storage.TK && storage.TK.typeIndex) ? storage.TK.typeIndex().count : 0;
      let stylesN = -1;
      try { stylesN = Array.from(penpot.library.local.typographies).length; } catch (e) { stylesN = -1; }
      out.typeStyles = stylesN;
      if (out.texts && rampN > 0 && stylesN === 0) {
        add('no_type_styles', null, top, rampN + ' typography tokens declared and ' + out.texts
          + ' text shape(s) drawn, but the library holds 0 typography styles — run storage.TP.seed()');
      }
    } catch (e) { err('typeStyles', e); }

    // ---- rule 31 · gate G16 — the Foundations and Color-in-use chapters are PROJECTED from the token records, never composed by hand.
    // Every number in this rule is READ FROM `storage.FN`: FN.CHAPTER says which chapters are projections, FN.boards /
    // FN.EXEMPT which boards are in scope, FN.stampOf what counts as proof. The auditor keeps no copy of that table, so
    // it cannot drift from the engine that writes the stamps — and a hand-drawn `Palette` cannot read CLEAN.
    // When FN is absent the gate is UNPROVABLE, and unprovable is REPORTED, not passed.
    try {
      const FN = storage.FN;
      const pname = String(out.page || '');
      const m = /^(\d{2})(?:\.\d+)?/.exec(pname);
      if (FN && FN.CHAPTER) {
        const ch = FN.chapter(pname);
        if (ch && FN.chapters().indexOf(ch) >= 0) {
          out.provenance = 'FN ' + FN.VERSION + ' · chapter ' + ch + ' · projected kinds here: '
            + (FN.kindsOn(pname).join(',') || 'none') + ' · exempt: ' + (FN.EXEMPT[ch] || []).join('/');
          const foreign = FN.foreign(pname) || [];
          const mine = foreign.filter((f) => nameOf(top) === f.name);
          mine.forEach(() => add('not_projected', top, top, '“' + nameOf(top) + '” has no durable `nl:fn` stamp — it was drawn, not projected. Rebuild it with FN.project({ page, kind }) and let the tokens place themselves; `FN.restamp(page)` only restamps boards FN actually built'));
          if (/-PageRoot$/.test(nameOf(top)) && foreign.length > mine.length) {
            add('not_projected', null, top, (foreign.length - mine.length) + ' further un-projected board(s) on this page: '
              + foreign.filter((f) => nameOf(top) !== f.name).map((f) => f.name + '(' + f.w + '×' + f.h + ')').join(', '));
          }
        }
      } else if (m && (m[1] === '01' || m[1] === '02')) {
        add('not_projected', null, top, pname + ' is a Foundations/Color chapter and `storage.FN` is not seeded — G16 cannot be verified, so it cannot be claimed. Seed scripts/foundations_engine.js LAST in the G1 order');
      }
    } catch (e) { err('provenance', e); }

    const fails = Object.keys(out.counts).filter((key) => key.charAt(0) !== '_' && RULES[key]);
    out.verdict = fails.length ? 'NEEDS_REPAIR' : 'CLEAN';
    out.rules = Object.keys(RULES);
    return out;
  };

  // ---------------------------------------------------------------- batch runner (same contract as audit_layout.js)
  storage.designStart = function (pages) {
    storage.designQueue = (pages || penpotUtils.getPages().map((p) => p.name)).slice();
    storage.designReport = {};
    return { queued: storage.designQueue.length };
  };
  storage.designNext = async function (opts) {
    const q = storage.designQueue;
    if (!q || !q.length) return { done: true, report: storage.designReport };
    const name = q[0];
    if (penpot.currentPage.name !== name) {
      penpot.openPage(penpotUtils.getPageByName(name));
      await new Promise((r) => setTimeout(r, 700));
      if (penpot.currentPage.name !== name) return { wait: penpot.currentPage.name, want: name };
    }
    const page = q.shift();
    const r = storage.designPage(opts);
    storage.designReport[page] = { verdict: r.verdict, counts: r.counts, boards: r.boards, shapes: r.shapes,
      breath: r.breath, radius: r.radius,
      findings: r.findings.slice(0, 12), sizes: r.sizes, tier: r.tier, errors: r.errors, provenance: r.provenance };
    if (q.length) penpot.openPage(penpotUtils.getPageByName(q[0]));
    return { page: page, verdict: r.verdict, counts: r.counts, remaining: q.length };
  };
  storage.designAll = async function (batch, opts) {
    if (!storage.designQueue) storage.designStart();
    const res = [];
    for (let i = 0; i < (batch || 4); i++) { const r = await storage.designNext(opts); res.push(r); if (r.done) break; }
    return res;
  };
  /** The merged gate: G13 blocks delivery only when BOTH auditors are clean.
      SCOPE DISCIPLINE (positioning-audit G8: audit dimensions must stay orthogonal): this gate judges ONE page scope.
      G16's file-level coverage is therefore reported here but does NOT decide its verdict — otherwise a screen page
      would read NEEDS_REPAIR because page 01 was hand-composed, and the per-block build loop could never close.
      `storage.designCoverage()` is the delivery step that owns that verdict (SKILL.md step 7, contract §8). */
  storage.designGate = function (opts) {
    const d = storage.designPage(opts);
    const g = storage.auditPage ? storage.auditPage(opts || {}) : { verdict: 'not seeded: audit_layout.js', counts: {} };
    const c = (storage.FN && storage.FN.coverage) ? storage.designCoverage() : null;
    return { verdict: d.verdict === 'CLEAN' && g.verdict === 'CLEAN' ? 'CLEAN' : 'NEEDS_REPAIR',
      design: { verdict: d.verdict, counts: d.counts, provenance: d.provenance, breath: d.breath, radius: d.radius },
      layout: { verdict: g.verdict, counts: g.counts },
      coverage: c ? { verdict: c.verdict, missing: c.missing, foreign: c.foreign, offChapter: c.offChapter }
        : 'FN not seeded — run storage.designCoverage() at delivery (gate G16) after seeding foundations_engine.js' };
  };
  storage.designRules = function () { return RULES; };
  /** The FILE half of G16, run once per delivery. A per-page audit cannot see that the chapter is missing a board:
      the pagination this skill ships is block-per-page (`01.09 · Foundations · Palette`), so each chapter is spread
      over ~9 pages and coverage is only decidable across the file. Reads FN, so it costs one call and draws nothing. */
  storage.designCoverage = function () {
    const FN = storage.FN;
    if (!FN || !FN.coverage) return { verdict: 'NEEDS_REPAIR', err: 'storage.FN is not seeded (G1 seeds foundations_engine.js last) — chapter coverage cannot be read' };
    const c = FN.coverage();
    return { verdict: c.verdict, pages: c.pages, chapters: c.chapters.map((r) => ({ chapter: r.chapter, pages: r.pages,
      required: r.required.length, covered: r.covered, missing: r.missing, foreign: r.foreign, offChapter: r.offChapter })),
      missing: c.missing, foreign: c.foreign, offChapter: c.offChapter, contract: FN.CHAPTER, exempt: FN.EXEMPT };
  };
  storage.designDelegated = function () { return DELEGATED; };
  storage.designCFG = function () { return CFG; };

  return { seeded: 'design-lint', rules: Object.keys(RULES), delegated: DELEGATED,
    fns: ['designPage', 'designStart', 'designNext', 'designAll', 'designGate', 'designRules', 'designCoverage'] };
})();
