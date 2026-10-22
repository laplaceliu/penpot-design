// media_engine.js — Penpot **raster asset** engine (storage.MD): a source image becomes a real media object in the
// file and paints a shape. This is the channel `IC`/`CF.glyph` do not cover: photographs, illustrations, logos and
// screenshots — i.e. most of what a *recreated* screen actually shows.
//
// Usage: paste/fetch this file once (after seed_storage), then
//   MD.config({ server: 'http://127.0.0.1:8779' })          // the loopback server rooted at the PROJECT (--root ..)
//   const m = await MD.import({ path: 'assets/hero.jpg' })   // → {id,name,width,height,mtype}
//   await MD.place({ parent: board, slot: 'hero', path: 'assets/hero.jpg', x, y, w, h })
//
// WHY this engine exists (the gap it closes): until now a photo on a screen was drawn as a gray plate with an `image`
// glyph inside it (`CF`'s `media`/`thumb` slots). That is a placeholder, not an asset, and on a *recreation* task it
// silently loses the thing the user asked to reproduce. Gate G17 (`SKILL.md`) therefore requires real media on screens,
// and this file is what makes that requirement satisfiable without hand-drawing.
//
// Rules for raster media (every one measured 2026-10-22 on a live reference file, capabilities §9):
//   M1  `uploadMediaData(name, bytes, mtype)` takes **three** arguments. The 2-arg form and the `{name,data,mtype}`
//       object form both fail with `media type  is not supported` — Penpot does not sniff, it is told.
//   M2  the bytes must decode to a real image: three garbage bytes return `http error` from the backend. A successful
//       upload returns `{name, width, height, mtype, id}` with the asset's **true pixel size**, so the media object is
//       itself the record — never trust a hand-typed width.
//   M3  `uploadMediaUrl(url)` is **not** the loopback path: a `http://127.0.0.1:…` URL fails with
//       `Value not valid. Code: :uploadMedia-url`, because that fetch runs in the Penpot container, which cannot see
//       this machine's loopback. Binary therefore comes through the skill server's `/b64/<path>` route → `atob` →
//       `Uint8Array` → `uploadMediaData`. (The sandbox `fetch` response exposes only `.text()`/`.json()` — there is no
//       `arrayBuffer`/`blob` — which is exactly why `/b64/` exists.)
//   M4  `shape.fills = [{ fillImage: <the WHOLE media object> }]`. A partial `{id}` or `{id,mtype}` is rejected:
//       `Value not valid: [{:fill-image {:id #uuid …}}]. Code: :fills`.
//   M5  `keepAspectRatio` is **not observable** in the fill readback (assigned true and false, both read `null`), so
//       crop behaviour is unverified — do not claim it. `fillOpacity` does land (0.5 read back as 0.5).
//   M6  there is **no media registry to read**: `penpot.currentFile` exposes only `id/name/revn/pages`. So the engine
//       caches `name → media` for the session and `MD.recover()` rebuilds the cache by scanning shapes for
//       `fillImage` — an already-placed asset is re-findable, an uploaded-but-unused one is not.
//   M7  proof of a placed asset is an export, not a readback: `export_shape(shapeId, mode:'fill')` returns the raw
//       asset and `mode:'shape'` renders the shape with it (both verified against the source PNG).
//   M8  **an image never stretches, and the fit mode cannot be asked for — it must be built.** `fillFitMode` (and
//       `fillShapeId`) are SILENTLY DROPPED by this plugin build: assigning `'cover'` returns no error and the
//       readback keeps only `fillColor/fillOpacity/fillColorGradient/fillColorRefFile/fillColorRefId/fillImage`
//       (measured 2026-10-22). So Penpot's own crop is unreachable and the default (`content`) distorts: a
//       1440×816 photograph placed into a 468×700 gallery slot came out 62% out of proportion, and that is what
//       `MD.place` did for every one of the 30 images on `15 · Screens · content`. The two legal outcomes are
//       therefore geometry, chosen by `MD.place({mode})`:
//         `fit`   — the SHAPE takes the media's ratio (nothing is cropped, the slot's height is derived);
//         `cover` — a real MASK: a `clip·` board (`clipContent = true`) at the slot box with the media laid inside at
//                   ITS OWN ratio, scaled to fill the slot and centred, so the overflow is cropped by the board.
//       `MD.place` picks `cover` automatically when the slot and the media disagree by >2%, and `audit_design` rule 47
//       (`media_stretched`) fails any `fillImage` shape whose aspect still disagrees with its asset's.

return (function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MD = {};
  storage.MD = MD;

  MD.server = 'http://127.0.0.1:8777';
  MD.byName = {};      // name -> media object as returned by the upload (M2)
  MD.placed = 0;
  MD.errors = [];

  const MTYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
  // A `.svg` is NOT this channel: vectors go through `IC.place` / `CF.svgIcon` so they stay editable (icons.md).
  MD.mtype = (name) => MTYPES[String(name || '').split('.').pop().toLowerCase()] || null;

  MD.config = (o) => { if (o && o.server) MD.server = String(o.server).replace(/\/$/, ''); return { server: MD.server, cached: Object.keys(MD.byName).length }; };

  /** A shape name that claims to hold a raster asset. The gate's `placeholder_media` rule judges exactly this set,
      so the grammar lives in ONE place (`CF.isMediaSlot`) and both readers call it — if the auditor and the media
      engine disagreed, a plate would be a slot for one and invisible to the other. Resolved lazily because `CF` may
      not be seeded yet when this file loads, and the fallback must stay identical to it. */
  const SLOT_RX = /^(img·|image·|media$|media·|thumb$|thumb·|photo|hero·media|cover·|avatar·|og:)/i;
  MD.isSlot = (name) => {
    const CF = storage.CF;
    return CF && CF.isMediaSlot ? CF.isMediaSlot(name) : SLOT_RX.test(String(name || ''));
  };

  // ---------- import ----------
  /** Fetch base64 text from the loopback server and decode. `path` is relative to that server's --root. */
  MD.bytes = async function (path) {
    const url = MD.server + '/b64/' + String(path).replace(/^\/+/, '');
    const r = await fetch(url);
    const t = await r.text();
    if (!t || !t.length) throw new Error('empty /b64 response for ' + url + ' (is the file under the server root? is it --root\'d at the project?)');
    return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  };

  /** Upload one raster asset. Idempotent by name within the session (M6). Returns the media object. */
  MD.import = async function (o) {
    o = o || {};
    const name = o.name || String(o.path || 'media').split('/').pop();
    if (MD.byName[name] && !o.force) return { media: MD.byName[name], cached: true };
    const mtype = o.mtype || MD.mtype(name);
    if (!mtype) { MD.errors.push({ name, err: 'no raster mtype (an .svg belongs to IC/CF.svgIcon)' }); return { err: 'unsupported media type: ' + name }; }
    let bytes = o.bytes;
    if (!bytes) { try { bytes = await MD.bytes(o.path); } catch (e) { MD.errors.push({ name, err: String(e.message || e) }); return { err: 'bytes: ' + String(e.message || e).slice(0, 140) }; } }
    try {
      const m = await penpot.uploadMediaData(name, bytes, mtype);   // M1: three arguments, always
      if (!m || !m.id) { MD.errors.push({ name, err: 'upload returned no id' }); return { err: 'no media id' }; }
      MD.byName[name] = m;
      return { media: m, bytes: bytes.length, cached: false };
    } catch (e) { MD.errors.push({ name, err: String(e.message || e) }); return { err: 'upload: ' + String(e.message || e).slice(0, 140) }; }
  };

  // ---------- paint ----------
  /** Apply a media object as an image fill and verify it landed (M4). */
  MD.fill = async function (shape, media, o) {
    o = o || {};
    if (!shape || !media || !media.id) return { ok: false, err: 'shape and media required' };
    try {
      const f = { fillImage: { id: media.id, name: media.name, width: media.width, height: media.height, mtype: media.mtype } };
      if (o.opacity !== undefined) f.fillOpacity = o.opacity;
      shape.fills = o.append ? Array.from(shape.fills || []).concat([f]) : [f];
    } catch (e) { return { ok: false, err: 'fills: ' + String(e.message || e).slice(0, 140) }; }
    await sleep(o.settle === undefined ? 120 : o.settle);
    let back = null;
    try { const fl = Array.from(shape.fills || []); const hit = fl.find((x) => x.fillImage && x.fillImage.id === media.id); back = hit && hit.fillImage; } catch (e) {}
    if (!back) return { ok: false, err: 'readback found no fillImage with that id' };
    MD.placed++;
    return { ok: true, media: back.name, size: [back.width, back.height], name: String(shape.name || '') };
  };

  /** M8 — how far a shape's box is from its asset's own ratio, in %. >2 means the picture is being distorted. */
  MD.distortion = function (w, h, media) {
    if (!media || !media.width || !media.height || !h) return 0;
    return Math.abs((w / h) / (media.width / media.height) - 1) * 100;
  };

  /** Import + paint in one call. `box` = {x,y,w,h} for an absolute board, or pass `parent` only to join a flow.
      M8: `mode` is `'cover'` (the default when the slot and the asset disagree — a `clip·` mask + an inside image at
      its own ratio), `'fit'` (the shape takes the asset's ratio) or `'exact'` (fill the given box, only legal when
      the ratios already agree). `'stretch'` exists for a caller that truly wants it and says so. */
  MD.place = async function (o) {
    o = o || {};
    const slot = o.slot || 'media';
    const imp = await MD.import({ path: o.path, name: o.name, bytes: o.bytes, mtype: o.mtype, force: o.force });
    if (imp.err) return { ok: false, slot: slot, err: imp.err };
    const media = imp.media;
    const ma = media.width / (media.height || 1);
    let w = o.w !== undefined ? o.w : media.width;
    let h = o.h !== undefined ? o.h : media.height;
    let mode = o.mode;
    if (!mode) mode = MD.distortion(w, h, media) > 2 ? 'cover' : 'exact';
    if (mode === 'fit') { if (o.w !== undefined && o.h === undefined) h = Math.round(w / ma); else if (o.h !== undefined && o.w === undefined) w = Math.round(h * ma); else h = Math.round(w / ma); mode = 'fit'; }
    const x = o.x, y = o.y;
    let s = o.shape, mask = null;

    if (mode === 'cover' && !s) {
      // the mask: a clipping board at the SLOT box…
      if (!storage.mkAbsBoard) return { ok: false, slot: slot, err: 'cover needs seed_storage (mkAbsBoard)' };
      mask = storage.mkAbsBoard('clip·' + slot, x || 0, y || 0, w, h, null, o.radius);
      try { mask.clipContent = true; } catch (e) {}
      if (storage.CF && storage.CF.keepClip) storage.CF.keepClip(mask);
      if (o.parent) { try { storage.absMount(o.parent, mask, x, y); } catch (e) { try { o.parent.appendChild(mask); } catch (e2) {} } }
      // …holding the media at ITS OWN ratio, scaled up to cover the slot and centred, so the board crops the overflow
      const scale = Math.max(w / media.width, h / (media.height || 1));
      const iw = Math.round(media.width * scale), ih = Math.round(media.height * scale);
      s = penpot.createRectangle();
      s.name = 'img·' + slot;
      s.resize(iw, ih);
      mask.appendChild(s);
      // `absMount` takes WORLD coordinates (seed_storage): the offset is relative to the MASK's own x/y, not to 0
      try { storage.absMount(mask, s, Math.round(mask.x + (w - iw) / 2), Math.round(mask.y + (h - ih) / 2)); } catch (e) { s.layoutChild.absolute = true; }
      const rc = await MD.fill(s, media, o);
      if (!rc.ok) { try { mask.remove(); } catch (e) {} return { ok: false, slot: slot, err: rc.err }; }
      MD.placed++;
      return { ok: true, slot: slot, mode: 'cover', mask: String(mask.name || ''), shape: String(s.name || ''),
        crop: { slot: [w, h], mediaPainted: [iw, ih], trimmed: [Math.max(0, iw - w), Math.max(0, ih - h)] },
        media: { name: media.name, id: media.id, w: media.width, h: media.height }, ratio: +ma.toFixed(3),
        distortion: +MD.distortion(iw, ih, media).toFixed(1) };
    }

    if (!s) {
      s = penpot.createRectangle();
      s.name = (o.prefix || 'img·') + slot;
      s.resize(Math.max(1, w), Math.max(1, h));
      if (o.radius !== undefined && s.borderRadius !== undefined) { try { s.borderRadius = o.radius; } catch (e) {} }
      if (o.parent) o.parent.appendChild(s);
      // A flex parent needs `absMount` (it releases the child from the flow); a plain board takes x/y directly —
      // calling absMount on a non-flex parent throws `Cannot set properties of null (setting 'absolute')`.
      if (x !== undefined && y !== undefined) {
        let flexed = false; try { flexed = !!(s.parent && s.parent.flex); } catch (e) {}
        if (flexed && storage.absMount) storage.absMount(s.parent, s, x, y);
        else { try { s.x = x; s.y = y; } catch (e) {} }
      }
    } else if (mode === 'fit' || mode === 'cover') {
      // an existing shape cannot be wrapped without moving it out of its caller's layout, so it is fitted instead —
      // and the caller is told, because a `cover` request that lands as `fit` changed the slot's geometry
      const nw = Math.round(mode === 'cover' ? s.height * ma : w), nh = Math.round(nw / ma);
      try { s.resize(nw, nh); w = nw; h = nh; mode = 'fit(from ' + mode + ')'; } catch (e) {}
    }
    const r = await MD.fill(s, media, o);
    if (!r.ok) { try { s.remove(); } catch (e) {} return { ok: false, slot: slot, err: r.err }; }
    const dist = MD.distortion(s.width, s.height, media);
    if (mode !== 'stretch' && dist > 2) return { ok: false, slot: slot, err: 'M8: the shape is still ' + dist.toFixed(1) + '% off its asset ratio — pass mode:"cover" (mask) or "fit"' };
    return { ok: true, slot: slot, mode: mode, shape: String(s.name || ''), media: { name: media.name, id: media.id, w: media.width, h: media.height }, ratio: +ma.toFixed(3), distortion: +dist.toFixed(1) };
  };

  /** M8 repair for an EXISTING file: wrap every stretched image in a real mask, in place.
      The shape keeps its slot box (that box becomes the `clip·` board's box, so the layout does not move), the image
      inside is resized to the asset's own ratio scaled to COVER the slot and centred, and the board crops the overflow.
      A flow child is re-inserted at its own index so the row order survives. Idempotent: a masked image already sits at
      its asset ratio, so the second pass finds nothing. Like `MD.audit` it reads the CURRENT page — the caller drives
      the page loop, one `execute_code` per page (the 30 s ceiling). */
  MD.refit = function (o) {
    o = o || {};
    const root = (penpot.currentPage || {}).root;
    if (!root) return { err: 'no current page root' };
    let fixed = 0, skipped = 0; const bad = [];
    (function walk(s, d) {
      if (d > 12) return;
      Array.from(s.children || []).forEach((c) => {
        let f = null;
        try { f = Array.from(c.fills || []).find((x) => x && x.fillImage && x.fillImage.width && x.fillImage.height); } catch (e) {}
        if (f && c.height > 0 && MD.distortion(c.width, c.height, f.fillImage) > 2) {
          const dist = MD.distortion(c.width, c.height, f.fillImage);
          bad.push({ name: String(c.name || '').slice(0, 28), box: Math.round(c.width) + 'x' + Math.round(c.height),
            asset: f.fillImage.width + 'x' + f.fillImage.height, dist: +dist.toFixed(1) });
          if (o.dry) { fixed++; walk(c, d + 1); return; }
          if (maskAround(c, f.fillImage)) fixed++; else skipped++;
          return;                       // the shape changed parent; the old sibling list is stale
        }
        walk(c, d + 1);
      });
    })(root, 0);
    return { page: penpot.currentPage && penpot.currentPage.name, dry: !!o.dry, stretched: bad.length, fixed: fixed, skipped: skipped, sample: bad.slice(0, 6) };
  };

  /** Build the mask around one stretched image. Returns false when the platform refused a step (caller counts it). */
  function maskAround(shape, media) {
    if (!storage.mkAbsBoard) return false;
    const par = shape.parent;
    if (!par) return false;
    const b = { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
    let idx = -1;
    try { idx = Array.from(par.children || []).findIndex((c) => c.id === shape.id); } catch (e) {}
    let radius = 0;
    try { radius = Number(shape.borderRadius) || 0; shape.borderRadius = 0; } catch (e) {}
    let mask = null;
    try {
      mask = storage.mkAbsBoard('clip·' + String(shape.name || 'media').replace(/^(img|thumb|media)·/, ''), b.x, b.y, b.w, b.h, null, radius);
      mask.clipContent = true;
      if (storage.CF && storage.CF.keepClip) storage.CF.keepClip(mask);
    } catch (e) { return false; }
    try { if (idx >= 0 && par.insertChild) par.insertChild(mask, idx); else par.appendChild(mask); } catch (e) { try { par.appendChild(mask); } catch (e2) {} }
    // The mask takes the image's place in the layout, with the SAME participation it had: an absolute child stays
    // absolute (pinned to its own world box), a flow child stays a flow child at its own index — pinning a flow child
    // would let its siblings slide up and move the composition the recipe authored.
    let wasAbsolute = false;
    try { wasAbsolute = !!(shape.layoutChild && shape.layoutChild.absolute); } catch (e) {}
    if (wasAbsolute || !par.flex) { try { storage.absMount(par, mask, Math.round(b.x), Math.round(b.y)); } catch (e) {} }
    const scale = Math.max(b.w / media.width, b.h / (media.height || 1));
    const iw = Math.round(media.width * scale), ih = Math.round(media.height * scale);
    try {
      mask.appendChild(shape);
      shape.resize(iw, ih);
      storage.absMount(mask, shape, Math.round(mask.x + (b.w - iw) / 2), Math.round(mask.y + (b.h - ih) / 2));
    } catch (e) { return false; }
    return true;
  }
  MD.maskAround = maskAround;

  /** Walk one page and report the media slots and which of them are still placeholders (no image fill). */
  MD.audit = function (o) {
    o = o || {};
    const root = (penpot.currentPage || {}).root;
    const out = { page: penpot.currentPage && penpot.currentPage.name, slots: 0, filled: 0, placeholders: [], filledNames: [] };
    if (!root) return { err: 'no current page root' };
    (function walk(s) {
      let nm = ''; try { nm = String(s.name || ''); } catch (e) {}
      if (MD.isSlot(nm)) {
        let has = false; try { has = Array.from(s.fills || []).some((f) => !!f.fillImage); } catch (e) {}
        out.slots++;
        if (has) { out.filled++; out.filledNames.push(nm); }
        else if (out.placeholders.length < (o.samples || 12)) out.placeholders.push({ name: nm, type: String(s.type), w: Math.round(s.width || 0), h: Math.round(s.height || 0) });
      }
      let ks = []; try { ks = Array.from(s.children || []); } catch (e) {}
      ks.forEach(walk);
    })(root);
    return out;
  };

  /** Rebuild the name→media cache from what is already painted (M6). Run it before re-importing in a new session. */
  MD.recover = function () {
    const root = (penpot.currentPage || {}).root;
    if (!root) return { err: 'no current page root' };
    let found = 0;
    (function walk(s) {
      let fl = []; try { fl = Array.from(s.fills || []); } catch (e) {}
      fl.forEach((f) => { const im = f.fillImage; if (im && im.id && im.name && !MD.byName[im.name]) { MD.byName[im.name] = { id: im.id, name: im.name, width: im.width, height: im.height, mtype: im.mtype }; found++; } });
      let ks = []; try { ks = Array.from(s.children || []); } catch (e) {}
      ks.forEach(walk);
    })(root);
    return { recovered: found, cached: Object.keys(MD.byName).length };
  };

  MD.report = () => ({ server: MD.server, cached: Object.keys(MD.byName).length, placed: MD.placed, errors: MD.errors.length });
  return 'MD';
})();
