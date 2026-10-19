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
// Output shape mirrors audit_layout.js: { counts, findings, verdict:'CLEAN'|'NEEDS_REPAIR', … }.
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
    off_grid: '§1 · composed-layout coordinates and box sizes on the 4px grid (hairlines, text and glyph-derived control boxes exempt)',
    off_scale_gap: '§1 · the gap between two ADJACENT sibling blocks (<=256) must be on LY.SPACE; cumulative distances and larger separations are not judged',
    off_ramp_size: '§3.2 · font size ∈ the declared ramp; ≥12px, 11px only for a role-named node (axis / overline / kbd)',
    measure_overflow: '§3.4 · multi-line prose wider than the 760px measure (chat/table/code exempt)',
    split_ratio_50_50: '§8 · a two-pane split narrower than 2.2:1, or 3+ identical panes',
    control_too_wide: '§1 · control wider than its cap inside a ≥720 container',
    touch_target: '§6 · interactive host smaller than the tier floor (hit pad counts, spec boards use the 24 floor)',
    multiple_primary: '§4 · more than one filled primary control inside one region',
    row_height: '§6 · table row height outside the quantized set',
    radius_nesting: '§5.1 · inner radius > outer radius − inset (only where the inset is inside the outer radius)',
    contrast: '§3.3 · opaque text against its resolved background under 4.5:1 (3:1 for ≥24px and for tone labels)',
    viewport_locked: '§2 · board locked to the tier viewport while content overflows or dead space is left, or a long board with no fold marker',
    state_coverage: '§5.2 + component-library §3.0 · required state columns missing on the spec board',
    rhythm_inconsistent: '§2 · sibling band gaps spread over more than one scale step',
    variant_sparse: 'component-library §4 · too few variants / sizes / icon slots for the family',
    focus_ring_missing: 'component-library §4 · a Focus state with neither a ring layer nor a 2px focus border',
    disabled_wrong: 'component-library §4 · disabled label alpha outside the .25–.40 state band',
    name_invalid: 'component-library §4 · name contains an illegal "/" or newline'
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
    alphaBand: [0.25, 0.40]   // component-library §4: disabled content alpha
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
  const CHATRX = /chat|message|thread|comment|table|code|terminal|\blog\b|console|editor|diff|json|kanban/i;
  const SPLITRX = /login|signin|auth|signup|register|transfer|empty|pricing|quote|onboard|wizard|survey|two|pair|equal|modal|dialog|sheet|drawer|command|gallery|grid/i;

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
      const idx = kids.indexOf(child);
      for (let j = 0; j < kids.length; j++) {
        if (idx >= 0 && j >= idx) break;                 // painted at or above our own branch
        const s = kids[j]; if (s === child || isText(s)) continue;
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

  // ---------------------------------------------------------------- the audit
  storage.designPage = function (opts) {
    opts = opts || {};
    const RAMP = (storage.T && Array.isArray(storage.T.fontRamp)) ? storage.T.fontRamp
      : [11, 12, 13, 14, 16, 20, 24, 32, 40, 56, 64];   // design-guide §3.2 kit + layout-library display bands
    const pageBg = toRGB(hexOK(opts.pageBg) ? opts.pageBg : (hexOK(P.surface) ? P.surface : '#FFFFFF'));
    const out = { page: str(penpot.currentPage, 'name', 'single-board'), boards: 0, shapes: 0,
      counts: {}, findings: [], errors: [], sizes: {}, fonts: {}, tiers: {}, families: {}, skipped: {}, verdict: 'CLEAN' };

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

    // ---- text rules: ramp, measure, contrast, disabled alpha (level 2: they judge copy wherever it lives)
    function auditText(t, st) {
      if (isAnno(t)) return;
      const fs = fsOf(t), txt = charsOf(t), r = box(t);
      out.sizes[fs] = (out.sizes[fs] || 0) + 1;
      out.fonts[str(t, 'fontFamily', '?')] = (out.fonts[str(t, 'fontFamily', '?')] || 0) + 1;
      if (RAMP.indexOf(fs) >= 0) {
        // §3.2: 11px is legal only for a declared typographic role — the factory names those nodes (ctx.text({role})).
        // Reading the copy back is not decidable: "disabled" is an axis header, "Home" is navigation.
        if (fs === 11 && !/(axis|overline|kbd)/.test(nameOf(t) + ' ' + chainName(t, st.top))) {
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
      const chain = chainName(t, st.top) + ' ' + nameOf(t);
      if (/Disabled/i.test(chain)) {                                  // disabled: owned by disabled_wrong, exempt from contrast
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
    function auditShape(s, par, st) {
      out.shapes++;
      const r = box(s), nm = nameOf(s), fam = famOf(s);
      const spec = isSpecBoard(s);
      const exempt = EXEMPT.test(nm) || isAnno(s);
      if (/[/\n]/.test(nm)) add('name_invalid', s, st.top, '"' + nm + '" contains an illegal / or newline');
      if (isText(s)) { auditText(s, st); return; }

      // level 1 (composed layout only): grid + radius nesting
      const compos = !st.inCf && !st.inSpec;
      // imported SVG interiors (createShapeFromSvg → groups named svg/… with svg-* children) are vector geometry:
      // their sizes/positions come from the drawing, not from authored coordinates — judging them on the 4px grid is noise.
      const inImported = par && typeOf(par) === 'group' && (/^(svg|base-background)/.test(nm) || /^svg/.test(nameOf(par)));
      if (compos && !exempt && !inImported && (isPlate(s) || typeOf(s) === 'board')) {
        const pr = par ? box(par) : { x: 0, y: 0 };
        const axes = [];
        if (isPlate(s) || !fam) {                                  // a CF control host's own size is ladder- or content-derived
          // A device viewport (375, 834) is a hardware fact, not a coordinate the designer chose — §1 does not bind it.
          const devw = [LY.TIERS.web.w, LY.TIERS.pad.w, LY.TIERS.mobile.w];
          if (r.w > CFG.hairline && devw.indexOf(N(r.w)) < 0 && Math.abs(LY.snap(r.w) - r.w) > 0.5) axes.push('w=' + N(r.w));   // epsilon: penpot.group bbox math leaves 1e-13 residue
          if (r.h > CFG.hairline && Math.abs(LY.snap(r.h) - r.h) > 0.5) axes.push('h=' + N(r.h));
        }
        if (r.w > CFG.hairline && r.h > CFG.hairline) {
          if (Math.abs(LY.snap(r.x - pr.x) - (r.x - pr.x)) > 0.5) axes.push('x=' + N(r.x - pr.x));
          if (Math.abs(LY.snap(r.y - pr.y) - (r.y - pr.y)) > 0.5) axes.push('y=' + N(r.y - pr.y));
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
      if (!rec(s)) return;
      if (isInstance(s)) return;                                   // instance internals belong to the main component
      const board = typeOf(s) === 'board' ? s : null;
      if (board) out.boards++;
      // A board named `Foo·…` where Foo is not a known family would silently escape the coverage audit, so say so
      // rather than let a typo'd factory name read as a clean spec.
      if (board && !fam && !spec && looksLikeCf(board) && /^[A-Z][A-Za-z]+$/.test(nm.split('·')[1] || '')) {
        add('spec', s, st.top, 'control host "' + nm + '" names an unknown family "' + nm.split('·')[1] + '" (not in component-library §3.0)');
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
        if (cap && regW >= CFG.capContainer && r.w > cap) {
          add('control_too_wide', board, st.top, fam + ' w=' + N(r.w) + ' > cap ' + cap + ' inside a ' + N(regW) + 'px region');
        }
        if (PRIMARY_FAMS.test(fam) && /·Primary/.test(nm) && !st.inSpec && !spec) {
          const bucket = (out.__prim = out.__prim || {});
          const key = (reg === st.top ? '__top' : String(reg.id || nameOf(reg))) + '·primary';
          (bucket[key] = bucket[key] || []).push({ sh: board, where: reg });
        }
        // coverage buckets: §5.2 binds "every interactive component's **spec board**", so only spec context feeds them
        if (st.inSpec || spec) {
          const F = out.families[fam] || (out.families[fam] = { family: fam, hosts: 0, states: {}, variants: {},
            sizes: {}, sizesAny: false, icons: { lead: 0, trail: 0 }, focus: 0, rings: 0, thickBorder: 0, boards: {} });
          F.hosts++; F.boards[nameOf(board)] = (F.boards[nameOf(board)] || 0) + 1;
          const sn = p.state || 'default';
          F.states[sn] = (F.states[sn] || 0) + 1;
          F.variants[p.variant] = (F.variants[p.variant] || 0) + 1;
          if (p.size) { F.sizes[p.size] = (F.sizes[p.size] || 0) + 1; F.sizesAny = true; }
          if (/IconStart|Lead|icon·/.test(nm)) F.icons.lead++;
          if (/IconEnd|Trail|Clear/.test(nm)) F.icons.trail++;
          if (p.state === 'focus') {
            F.focus++;
            const ds = []; const collect = (n3) => { (kidsOf(n3) || []).forEach((c) => { ds.push(c); if (rec(c)) collect(c); }); };
            collect(board);
            if (ds.some((d) => /^ring·/.test(nameOf(d)))) F.rings++;
            else if (arr(board, 'strokes').some((sh) => num(sh, 'strokeWidth', 1) >= 2)) F.thickBorder++;
          }
        }
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
      const vs = blocks.slice().sort((a, c) => num(a, 'y', 0) - num(c, 'y', 0));
      for (let i = 0; i < vs.length - 1; i++) {
        for (let j = i + 1; j < i + 2; j++) {   // neighbour only: non-adjacent "gaps" are cumulative spacing, not rhythm
          const A = box(vs[i]), Bc = box(vs[j]);
          if (Math.min(A.r, Bc.r) - Math.max(A.x, Bc.x) <= 0) continue;
          const gap = A.b <= Bc.y ? Bc.y - A.b : (Bc.b <= A.y ? A.y - Bc.b : 0);
          if (gap > 0 && gap < r.h && gap <= SPREAD_MAX && !LY.onScale(gap, CFG.gapTol)) {
            add('off_scale_gap', gap === Bc.y - A.b ? vs[j] : vs[i], b, 'gap ' + N(gap) + ' between "' + nameOf(vs[i]) + '" and "' + nameOf(vs[j]) + '" is off ' + LY.SPACE.join('/'));
          }
        }
      }
      const hs = blocks.slice().sort((a, c) => num(a, 'x', 0) - num(c, 'x', 0));
      for (let i = 0; i < hs.length - 1; i++) {
        for (let j = i + 1; j < i + 2; j++) {   // neighbour only (same reason)
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
      if (panes.length === 2 && !SPLITRX.test(nameOf(b) + ' ' + chainName(b, st.top))) {
        const a = box(panes[0]), c2 = box(panes[1]);
        const ratio = Math.max(a.w, c2.w) / Math.max(1, Math.min(a.w, c2.w));
        if (ratio < CFG.splitMin) add('split_ratio_50_50', panes[0], b, 'panes ' + N(a.w) + '/' + N(c2.w) + ' = ' + ratio.toFixed(2) + ':1 (§8 needs ' + CFG.splitMin + '–3.2:1)');
      } else if (panes.length >= 3) {
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
      const contentB = (kidsOf(b) || []).reduce((m, c) => Math.max(m, num(c, 'y', 0) + num(c, 'height', 0)), r.y);
      if (Math.abs(r.h - vh) <= 8) {
        if (contentB > r.b + 1) add('viewport_locked', b, st.top, 'board is exactly the ' + bt + ' viewport (' + vh + ') while content reaches ' + N(contentB - r.y));
        else if (r.b - contentB >= CFG.deadSpace) add('viewport_locked', b, st.top, 'board is exactly the ' + bt + ' viewport with ' + N(r.b - contentB) + 'px of dead space below the content');
      }
      if (r.h >= CFG.longBoard) {
        // LY.fold() mounts the marker next to the board it annotates, so it is found among the siblings too
        let fold = false;
        const hunt = (n3) => { (kidsOf(n3) || []).forEach((c) => { if (/^fold·/.test(nameOf(c))) fold = true; if (rec(c)) hunt(c); }); };
        hunt(b);
        const p = (() => { try { return b.parent; } catch (e) { return null; } })();
        if (!fold && p) (kidsOf(p) || []).forEach((c) => { if (/^fold·/.test(nameOf(c)) && Math.abs(num(c, 'x', 1e9) - r.x) <= 2 && Math.abs(num(c, 'y', 1e9) - r.y) <= 2) fold = true; });
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
      findings: r.findings.slice(0, 12), sizes: r.sizes, tier: r.tier, errors: r.errors };
    if (q.length) penpot.openPage(penpotUtils.getPageByName(q[0]));
    return { page: page, verdict: r.verdict, counts: r.counts, remaining: q.length };
  };
  storage.designAll = async function (batch, opts) {
    if (!storage.designQueue) storage.designStart();
    const res = [];
    for (let i = 0; i < (batch || 4); i++) { const r = await storage.designNext(opts); res.push(r); if (r.done) break; }
    return res;
  };
  /** The merged gate: G13 blocks delivery only when BOTH auditors are clean. */
  storage.designGate = function (opts) {
    const d = storage.designPage(opts);
    const g = storage.auditPage ? storage.auditPage(opts || {}) : { verdict: 'not seeded: audit_layout.js', counts: {} };
    return { verdict: d.verdict === 'CLEAN' && g.verdict === 'CLEAN' ? 'CLEAN' : 'NEEDS_REPAIR',
      design: { verdict: d.verdict, counts: d.counts }, layout: { verdict: g.verdict, counts: g.counts } };
  };
  storage.designRules = function () { return RULES; };
  storage.designDelegated = function () { return DELEGATED; };
  storage.designCFG = function () { return CFG; };

  return { seeded: 'design-lint', rules: Object.keys(RULES), delegated: DELEGATED,
    fns: ['designPage', 'designStart', 'designNext', 'designAll', 'designGate', 'designRules'] };
})();
