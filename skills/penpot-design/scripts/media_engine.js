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

  /** Import + paint in one call. `box` = {x,y,w,h} for an absolute board, or pass `parent` only to join a flow. */
  MD.place = async function (o) {
    o = o || {};
    const slot = o.slot || 'media';
    const imp = await MD.import({ path: o.path, name: o.name, bytes: o.bytes, mtype: o.mtype, force: o.force });
    if (imp.err) return { ok: false, slot: slot, err: imp.err };
    const media = imp.media;
    const w = o.w !== undefined ? o.w : media.width, h = o.h !== undefined ? o.h : media.height;
    let s = o.shape;
    if (!s) {
      s = penpot.createRectangle();
      s.name = (o.prefix || 'img·') + slot;
      s.resize(Math.max(1, w), Math.max(1, h));
      if (o.radius !== undefined && s.borderRadius !== undefined) { try { s.borderRadius = o.radius; } catch (e) {} }
      if (o.parent) o.parent.appendChild(s);
      // A flex parent needs `absMount` (it releases the child from the flow); a plain board takes x/y directly —
      // calling absMount on a non-flex parent throws `Cannot set properties of null (setting 'absolute')`.
      if (o.x !== undefined && o.y !== undefined) {
        let flexed = false; try { flexed = !!(s.parent && s.parent.flex); } catch (e) {}
        if (flexed && storage.absMount) storage.absMount(s.parent, s, o.x, o.y);
        else { try { s.x = o.x; s.y = o.y; } catch (e) {} }
      }
    }
    const r = await MD.fill(s, media, o);
    if (!r.ok) { try { s.remove(); } catch (e) {} return { ok: false, slot: slot, err: r.err }; }
    return { ok: true, slot: slot, shape: String(s.name || ''), media: { name: media.name, id: media.id, w: media.width, h: media.height }, ratio: +(media.width / (media.height || 1)).toFixed(3) };
  };

  // ---------- audit ----------
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
