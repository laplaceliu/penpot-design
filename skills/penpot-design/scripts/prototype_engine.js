// prototype_engine.js —— Penpot **prototype + delivery** engine (storage.PR): flows, interactions, export presets,
// version checkpoints. Usage: paste the whole file into execute_code and run once; functions go into storage.
// Basis: references/penpot-capabilities.md §8/§9 (every rule below is a measured readback, 2026-10-19).
//
// Four sharp edges this engine exists to hide (each one costs a probe otherwise):
//   P1  **`destination` must be the SHAPE OBJECT**, not an id. `{type:'navigate-to', destination: board.id}` is
//       *accepted without error and silently dropped* — the readback shows `action:{type:'navigate-to',
//       preserveScrollPosition:false}` with no destination at all. `destination: board` stores a full snapshot of the
//       shape (that is what the readback's big blob is). Same for `open-overlay`.
//   P2  **`shape.interactions` is read-only** (getter only). `addInteraction` **appends** — authoring twice gives two
//       entries. The only mutator is `shape.removeInteraction(interactionObject)`; an index or an id is rejected with
//       `Value not valid: 0. Code: :removeInteraction`. PR.clear removes them all through that path.
//   P3  **every animation field must be sent explicitly** (capabilities §8): a bare `{type:'dissolve',duration:300}`
//       and a slide missing `way` both fail `Value not valid … Code: :addInteraction`. Use the presets below.
//   P4  **`file.findVersions()` / `version.restore()` are async** (`await` them; `Array.from()` on the unawaited
//       promise silently yields `[]`). **`file.saveVersion` is not trustworthy on its own** — it resolved with a full
//       version object earlier in a session and later never settled *and* never created a version. `PR.checkpoint`
//       therefore verifies against `findVersions`: the label existing there is the only evidence of a checkpoint.

return (function () {
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const PR = {};
  storage.PR = PR;
  const page = () => penpot.currentPage;

  // ---------- animation presets (all fields, as measured) ----------
  PR.ANIM = {
    dissolve: (dur) => ({ type: 'dissolve', duration: dur === undefined ? 300 : dur, easing: 'ease-out' }),
    slideFromRight: () => ({ way: 'from-right', direction: 'reverse', duration: 300, easing: 'ease-out', offsetEffect: [] }),
    slideFromLeft: () => ({ way: 'from-left', direction: 'reverse', duration: 300, easing: 'ease-out', offsetEffect: [] }),
    pushRight: () => ({ direction: 'right', duration: 300, easing: 'ease-in-out' }),
    pushLeft: () => ({ direction: 'left', duration: 300, easing: 'ease-in-out' })
  };

  // ---------- flows ----------
  /** A flow makes a board a prototype entry point. Throws `:createFlow-frame` when the board is a variant child —
      the error is reported, not swallowed, because the fix is 'flow from a plain screen board, not a variant head'. */
  PR.flow = function (name, board) {
    if (!board) return { err: 'PR.flow(name, board) needs a board' };
    try {
      const f = page().createFlow(name, board);
      return { ok: true, name: name, flows: PR.flows() };
    } catch (e) { return { err: String(e && e.message || e) }; }
  };
  PR.flows = function () {
    try { return Array.from(page().flows || []).map((f) => f.name); } catch (e) { return ['ERR ' + String(e).slice(0, 60)]; }
  };
  PR.removeFlow = function (name) {
    try {
      const f = Array.from(page().flows || []).find((x) => x.name === name);
      if (!f) return { err: 'no flow named ' + name };
      f.remove();
      return { ok: true, removed: name, flows: PR.flows() };
    } catch (e) { return { err: String(e).slice(0, 120) }; }
  };
  /**
   * Idempotent flow creation — call it **before** wiring links. Measured: adding a `navigate-to` from a board that no
   * flow covers makes Penpot auto-create a flow named `Flow N` (with every flow deleted, one nav link produced
   * `Flow 1`). The auto-flow works, but the delivered file then ships with machine names; create the named flow first
   * and the auto-name never appears.
   */
  PR.ensureFlow = function (name, board) {
    if (PR.flows().indexOf(name) >= 0) return { ok: true, existed: true, flows: PR.flows() };
    return PR.flow(name, board);
  };

  // ---------- interactions ----------
  /** Sanitized readback: `[{trigger, delay, actionType, destination, keys}]` — the destination blob in a raw readback
      is a whole serialized shape, which is why it is reduced to its name here. */
  PR.read = function (shape) {
    try {
      return Array.from(shape.interactions || []).map((it) => ({
        trigger: it.trigger, delay: it.delay, type: it.action && it.action.type,
        destination: it.action && it.action.destination ? it.action.destination.name : null,
        url: it.action && it.action.url || null,
        keys: it.action ? Object.keys(it.action).filter((k) => k !== 'destination').join(',') : null
      }));
    } catch (e) { return { err: String(e).slice(0, 120) }; }
  };

  /** PR.link(shape, {trigger, action, delay}) → the raw call, errors returned. Appends (P2). */
  PR.link = function (shape, spec) {
    spec = spec || {};
    if (!shape) return { err: 'PR.link: no shape' };
    try {
      const fn = spec.delay === undefined || spec.delay === null
        ? () => shape.addInteraction(spec.trigger || 'click', spec.action)
        : () => shape.addInteraction(spec.trigger || 'click', spec.action, spec.delay);
      fn();
      return { ok: true, read: PR.read(shape) };
    } catch (e) { return { err: String(e && e.message || e) }; }
  };

  /** navigate-to with the destination passed **as a shape** (P1). */
  PR.nav = function (shape, target, o) {
    o = o || {};
    return PR.link(shape, { trigger: o.trigger || 'click', delay: o.delay, action: Object.assign({ type: 'navigate-to', destination: target }, o.action || {}) });
  };
  /** open-overlay: destination as a shape; measured options that survive: position, closeWhenClickOutside,
      addBackgroundOverlay (plus `relativeTo`, `manualPositionLocation` — see capabilities §8). */
  PR.overlay = function (shape, target, o) {
    o = o || {};
    return PR.link(shape, { trigger: o.trigger || 'click', action: { type: 'open-overlay', destination: target,
      position: o.position || 'center', closeWhenClickOutside: o.closeWhenClickOutside !== false,
      addBackgroundOverlay: o.addBackgroundOverlay !== false } });
  };
  PR.close = function (shape, o) { return PR.link(shape, { trigger: (o && o.trigger) || 'click', action: { type: 'close-overlay' } }); };
  PR.url = function (shape, href, o) { return PR.link(shape, { trigger: (o && o.trigger) || 'click', action: { type: 'open-url', url: href } }); };
  PR.delay = function (shape, ms, target, o) { return PR.nav(shape, target, Object.assign({ trigger: 'after-delay', delay: ms }, o || {})); };

  /** Remove every interaction on a shape, through the only mutator that exists (P2). */
  PR.clear = function (shape) {
    let removed = 0, err = null;
    try {
      const list = Array.from(shape.interactions || []);
      list.forEach(() => { const it = Array.from(shape.interactions || [])[0]; if (!it) return; shape.removeInteraction(it); removed++; });
    } catch (e) { err = String(e).slice(0, 120); }
    return { removed: removed, err: err, left: PR.read(shape).length };
  };

  /**
   * PR.prototype(links) → batch author a flow map in one pass, resolving names to boards so a spec stays readable.
   *   links = [{ from:'S1', to:'S2', trigger:'click', anim:'slideFromRight', delay: 1500 }]
   *   or    [{ from: board, to: board, action: {type:'open-url', url:…} }]
   * Returns one row per link, each with its readback — a silently dropped destination shows up as `destination: null`
   * right here instead of at review time (P1).
   */
  PR.prototype = function (links, o) {
    // deep name index: a link's `from` is usually a **nested** board (a CTA inside a screen), and page.root.children
    // only holds screens — a shallow map made every nested link report 'no such board' (measured).
    const byName = {};
    const walk = (s) => { Array.from(s.children || []).forEach((c) => { if (c.name && !(c.name in byName)) byName[c.name] = c; walk(c); }); };
    // a Page has no `children` (capabilities §10) — the tree starts at `.root`
    walk(page().root);
    const resolve = (x) => (typeof x === 'string' ? byName[x] : x);
    // o.flow: name the entry point up front, before any link exists (see PR.ensureFlow — otherwise Penpot invents Flow N)
    if (o && o.flow) {
      const first = resolve((links && links[0] && links[0].from) || o.from);
      if (first) PR.ensureFlow(o.flow, first);
    }
    return (links || []).map((l) => {
      const from = resolve(l.from), to = resolve(l.to);
      if (!from) return { from: l.from, err: 'no such board on this page' };
      let action = l.action;
      if (!action) {
        if (!to) return { from: l.from, to: l.to, err: 'no such target board' };
        const anim = l.anim ? (typeof l.anim === 'function' ? l.anim() : PR.ANIM[l.anim] && PR.ANIM[l.anim]()) : null;
        action = { type: 'navigate-to', destination: to };
        if (anim) action.animation = anim;
      }
      if (l.clear !== false) PR.clear(from);
      const res = PR.link(from, { trigger: l.trigger || 'click', delay: l.delay, action: action });
      const rows = res.ok ? PR.read(from) : null;
      return { from: from.name, err: res.err || null,
               read: rows ? rows[rows.length - 1] : null,
               dropped: rows && !rows[rows.length - 1].destination && rows[rows.length - 1].type !== 'open-url' };
    });
  };

  // ---------- export presets (C7) ----------
  /** `shape.exports` round-trips; defaults are filled in on read (`suffix:''`, `skipChildren:false`). */
  PR.exports = function (shape, presets) {
    try {
      shape.exports = presets || [{ type: 'png', scale: 2 }, { type: 'svg' }];
      return { ok: true, read: JSON.stringify(shape.exports) };
    } catch (e) { return { err: String(e).slice(0, 140) }; }
  };
  /** Render bytes (acceptance can run from inside the file): `await PR.bytes(shape, {type:'png',scale:2})`. */
  PR.bytes = async function (shape, spec) {
    try {
      const arr = await shape.export(spec || { type: 'png', scale: 1 });
      return { ok: true, kind: (spec && spec.type) || 'png', bytes: arr && arr.length ? arr.length : null };
    } catch (e) { return { err: String(e).slice(0, 160) }; }
  };

  // ---------- version checkpoints (C9) ----------
  /**
   * Checkpoint = a version whose label **appears in `findVersions`**. That is the whole contract, because
   * `saveVersion` behaved two different ways in one session: at 12:12 it resolved and returned `{label, createdBy,
   * createdAt}` (both labels visible in `findVersions`), and later the promise never settled — yet a checkpoint whose
   * call had already timed out *did* show up in `findVersions` seconds afterwards. So write and promise are on
   * different clocks, and this function trusts neither: it fires the save, **polls `findVersions` for up to 6 s**
   * (each read is fast: 21 ms measured) and reports only whether the label actually landed.
   * Returns `{ok:true, label, createdAt, promiseSettled}` or `{ok:false, err}` — a checkpoint you cannot see is not a
   * checkpoint, and the caller must not treat it as one.
   */
  PR.checkpoint = async function (label) {
    const tag = label || ('checkpoint · ' + new Date().toISOString().slice(11, 19));
    let err = null, settled = false;
    try {
      Promise.resolve(penpot.currentFile.saveVersion(tag)).then(() => { settled = true; }).catch((e) => { err = String(e && e.message || e).slice(0, 120); });
    } catch (e) { err = String(e && e.message || e).slice(0, 120); }
    // poll instead of a fixed sleep: one checkpoint landed seconds after its call had already timed out, while the
    // promise never settled — the write and the promise are on different clocks.
    let hit = null;
    for (let i = 0; i < 10 && !hit; i++) {
      await nap(600);
      const list = await PR.versions();
      hit = Array.isArray(list) ? list.find((v) => v.label === tag) : null;
    }
    return hit
      ? { ok: true, label: hit.label, createdAt: hit.createdAt, promiseSettled: settled }
      : { ok: false, err: err || ('saveVersion did not land within 6s (promise settled=' + settled + ')') };
  };
  PR.versions = async function () {
    try {
      const list = await penpot.currentFile.findVersions();
      return Array.from(list || []).map((v) => ({ label: v.label, createdAt: v.createdAt, isAutosave: v.isAutosave, idx: Array.prototype.indexOf.call(list, v) }));
    } catch (e) { return { err: String(e && e.message || e) }; }
  };
  /** Restore a labeled version (default: the newest user version). `FileVersion.restore()` returned 1 on success. */
  PR.restore = async function (label) {
    try {
      const list = await penpot.currentFile.findVersions();
      const arr = Array.from(list || []);
      const target = label ? arr.find((v) => v.label === label) : arr.find((v) => !v.isAutosave);
      if (!target) return { err: 'no version' + (label ? ' labeled ' + label : '') };
      const r = await target.restore();
      return { ok: true, label: target.label, result: r };
    } catch (e) { return { err: String(e && e.message || e) }; }
  };

  return { seeded: 'PR', fns: ['PR.flow', 'PR.flows', 'PR.removeFlow', 'PR.ensureFlow', 'PR.read', 'PR.link', 'PR.nav', 'PR.overlay',
                               'PR.close', 'PR.url', 'PR.delay', 'PR.clear', 'PR.prototype', 'PR.exports', 'PR.bytes',
                               'PR.checkpoint', 'PR.versions', 'PR.restore', 'PR.ANIM'],
           note: 'P1 destination is a shape (ids are silently dropped) ; P2 interactions is read-only, removeInteraction(interaction) ; P3 animation fields all explicit ; P4 save/find/restore are async' };
})();
