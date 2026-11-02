# Runtime — MCP, seeding, execution and delivery

> Everything below is operational. The design contract is in `component-system.md`; the visual rules are in
> `design-principles.md`.

## 1. Penpot / MCP

The skill **does not install Penpot by default**. Probe first, then act with the smallest step.

1. **Service**: `assets/penpot-server/scripts/status.{sh,ps1}` or
   `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags`.
   - 200 → running; skip install.
   - container exists but stopped → `up.{sh,ps1}` only.
   - no deployment → full install (image pull is slow; confirm first).
2. **Client**: `.mcp.json` contains a `penpot` entry (`https://penpot.local/mcp/stream`) and `NODE_EXTRA_CA_CERTS`
   points at the stack's `data/caddy/pki/authorities/local/root.crt`.
   - configured + reachable → verification;
   - configured + down → start the service;
   - not configured → configure + `trust-ca.{sh,ps1}` + restart the client.
3. **Confirm** reuse / start-only / full install with the user. Lightweight probing itself is not a question.

- Deployment: `assets/penpot-server/` (compose + Caddy, self-resolving paths). Linux/macOS `scripts/*.sh`,
  Windows `scripts/*.ps1`. Run `create-profile` first; `https://penpot.local` (defaults `admin@penpot.local` /
  `penpot123`, but a deployed instance may have changed the password).
- MCP tools: `execute_code` / `export_shape` / `high_level_overview` / `penpot_api_info`.
- **Suspended plugin tab**: the MCP bridge log shows `Duplicate connection for given user token; rejecting new
  connection` while the old tab is stale. Restart the MCP container and click `MCP → 在此连接` in the Penpot toolbar.
  A tab reload also works but clears `storage` and selection, so re-seed and re-select.
  `docker restart penpot-server-penpot-mcp-1` is the usual fix for the duplicate session.

## 2. Seeding

`execute_code` arguments are capped at ~21 KB, so the engines are fetched from the skill's loopback server:

```bash
python3 scripts/serve-skill.py            # 127.0.0.1:8777, serves this skill directory
```

```js
for (const f of ['seed-storage.js','layout-engine.js','component-factory.js','native-layout.js',
                 'token-engine.js','elevation-engine.js','icon-engine.js','media-engine.js',
                 'component-engine.js']) {
  const src = await (await fetch('http://127.0.0.1:8777/scripts/' + f)).text();
  new Function('storage','penpot','penpotUtils', src)(storage, penpot, penpotUtils);
}
```

For the catalog pack, seed the anatomy support before CK:

```js
for (const f of ['anatomy-engine.js','catalog-engine.js']) {
  const src = await (await fetch('http://127.0.0.1:8777/scripts/' + f)).text();
  new Function('storage','penpot','penpotUtils', src)(storage, penpot, penpotUtils);
}
const manifest = await (await fetch('http://127.0.0.1:8777/assets/libraries/codesign-ui.json')).json();
const anatomy  = await (await fetch('http://127.0.0.1:8777/assets/libraries/codesign-ui.anatomy.json')).json();
storage.LM.load(manifest, anatomy);
```

The sandbox objects must be passed as **parameters**; a `new Function` body cannot see `storage`/`penpotUtils`.
`storage` is volatile: every plugin reload starts empty. Re-seed in the same order.

## 3. Engine map

| Script | Provides | Depends on |
|---|---|---|
| `seed-storage.js` | `mkAbsBoard` / `absMount` / `mkText` / `mkRect` / `ct` / `pg` / `sleep` | Penpot |
| `layout-engine.js` | `LY`: space/type/grid scales, tiers, region recipes, `pack`/`fold` | — |
| `component-factory.js` | `CF`: 75 control factories, naming, component registration, instance/swap, matrix | LY (optional), TK, EL |
| `native-layout.js` | `NL`: flex/grid authoring, `fromRecipe`, `auditFlow` | LY, CF, mkText |
| `token-engine.js` | `TK`: sets/themes, `apply`+readback, `bindBoard`, `paint`/`changed`; `TP`: library typography | Penpot tokens |
| `elevation-engine.js` | `EL`: shadow recipes, role map, `apply`/`surface`/`bindStamped` | TK, CF |
| `component-engine.js` | `CK`: component-first runtime | CF, TK, EL (optional), LM (anatomy only) |
| `icon-engine.js` | `IC`: Lucide catalog → vectors, `place`/`grid` | NL, CF |
| `media-engine.js` | `MD`: raster import/place, ratio-preserving fills | NL, CF |
| `anatomy-engine.js` | `AN`: source JSX/CSS anatomy → wireframe board | LY, CF, NL, MD |
| `catalog-engine.js` | `LM`: manifest + `anatomyBoard` for `custom` catalog families | AN, NL, CF, TK, EL |
| `prototype-engine.js` | `PR`: optional flows, interactions, export presets, versions | Penpot |
| `designmd-tokens.py` | DESIGN.md ↔ Penpot Tokens-panel DTCG JSON (file interchange) | PyYAML; not a runtime engine |

No other engines are part of v3.

## 4. Execution discipline

- **Check `penpot_api_info` before writing an attribute; read back after.** A non-existent property silently no-ops
  under `try/catch`; "no error" is not "took effect". `api-pitfalls.md` is the detailed list.
- **One board / one page / one section per heavy call.** `execute_code` has a ~30 s wall clock. `CK.buildPack` is
  resumable; `limit:6` is a safe starting batch on a 3-column sheet.
- **Page switches are async.** `await penpot.openPage(page); await sleep(500)` before touching `penpot.currentPage`.
  Re-read `penpot.currentPage.name`; a stale handle writes into the wrong page.
- **Text width/height is transient at creation.** Measure after render (`await storage.ct`, `NL.settle`); never centre
  from the creation-time 1×1 box.
- **`path.d` is world coordinates**; arcs are cubic beziers, not SVG `A`.
- **Never hand-write a one-off layout helper.** Use `LY`/`NL` for structure, `CK.instance` for controls, `CF` for
  renderers.
- **Do not leave test artifacts.** Build on a scratch page, export for proof, then remove the test components/screens
  and restore the previous token theme/set state.

## 5. File / page layout

v3 has no page-count or block-page contract. Use a small, readable file:

```
01 · Components    masters produced by CK (core or catalog)
02 · Screens       one board per screen, built from CK instances
03 · Catalog       optional; catalog masters when the 131-family pack is used
```

- A component master can live on any page; the library is global.
- A screen is a board on a `Screens` page, assembled from instances; it does not live inside a page-root wrapper.
- The penpot token sets/themes live in the `TOKENS` tab, not on a page.
- Page order and page names are organizational, not a gate. `CK.audit` reads the library, not page names.

## 6. Delivery

1. `CK.audit({pack})` → `CLEAN`.
2. `CK.theme(group,name)` → `changed > 0` for a switchable theme.
3. Export a contact sheet of the masters and each screen; `export_shape` accepts a master/board id.
4. Optional prototype: `PR.flow` / `PR.nav` / `PR.prototype` / `PR.exports`; verify every link reports `dropped:false`.
5. Optional version checkpoint: `PR.checkpoint(label)`; only `ok:true` counts.
6. For design→code, export the components/screens at @1x/@2x and compare with the implementation via
   `verification.md`.

## 7. Failure playbook

| Symptom | Action |
|---|---|
| `duplicate connection … rejecting new connection` | restart `penpot-server-penpot-mcp-1`; click `MCP → 在此连接` |
| plugin tab suspended / no heartbeat | focus the Penpot tab; if it stays stale, reload and re-seed |
| `execute_code` timeout | split the call; use `buildPack`/`matrix`/`page` batches |
| page switch wrote to the wrong page | re-read `penpot.currentPage.name`; wait after `openPage` |
| token apply returns success but no binding | shape does not support the property, set inactive, or same-token rebind; read `shape.tokens` |
| component master missing after reload | library is durable, `storage` is not; re-seed and `CK.load` definitions |
| export timeout (`networkidle`) | old exporter bug: change `/opt/penpot/exporter/app.js` `networkidle` → `load`, restart exporter |
