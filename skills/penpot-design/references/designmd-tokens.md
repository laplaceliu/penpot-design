# DESIGN.md ↔ Penpot Tokens JSON

> Convert DESIGN.md frontmatter to **DTCG JSON** that Penpot's Tokens panel can import, and convert exported JSON
> back to DESIGN.md. This is a file-level interchange tool; it is not the runtime seeder (`TK.seed`).

Converter: `scripts/designmd-tokens.py`. Requires Python 3.9+ and PyYAML.

## 1. What maps

| DESIGN.md section | Penpot token type | Token name |
|---|---|---|
| `colors.<key>` | `color` | `color.<key>` |
| `typography.<key>` | `typography` | `type.<key>` (or `typography.<key>`) |
| `rounded.<key>` | `borderRadius` | `radius.<key>` |
| `spacing.<key>` | `spacing` | `spacing.<key>` |
| `elevation.<recipe>` | `shadow` | `shadow.<recipe>` |

The other Penpot token types (`dimension`, `fontSizes`, `fontWeights`, `letterSpacing`, `number`, `opacity`,
`rotation`, `sizing`, `borderWidth`, `textCase`, `textDecoration`, `fontFamilies`) are preserved through a **sidecar**
when converting JSON → DESIGN.md → JSON; DESIGN.md's standard sections cannot express them natively.

Naming: write DESIGN.md keys in **kebab-case** (`text-muted`, `primary-ink`, `surface-alt`). The converter preserves the
keys it reads; it does not silently rename them. Penpot API type names (`borderRadius`, `fontFamilies`) stay camelCase
because they are API constants, not token names.

## 2. DESIGN.md → Penpot Tokens

```bash
python3 scripts/designmd-tokens.py to-penpot DESIGN.md \
    -o tokens.json \
    --set-name "App · Core"
```

- Output is a single JSON whose top-level keys are set names, plus `$themes` and `$metadata`.
- `--components-as-tokens` also emits `component.<name>.*` tokens from the DESIGN.md `components:` block (off by
  default; component definitions belong in the registry).
- `--meta-in app.penpot.json` reads a sidecar from a previous export to preserve sets, themes, extra token types and
  component data.
- `--kebab-names` normalizes emitted token names to dot + kebab-case (`surfaceAlt` → `surface-alt`). Use it for a new
  file or a cleaned import; without it the converter preserves the DESIGN.md keys.
- `--base-font-size 16` sets the px per rem/em conversion.
- A camelCase frontmatter key emits a warning; fix the source key (or pass `--kebab-names`) rather than editing JSON.

## 3. Penpot Tokens → DESIGN.md

```bash
python3 scripts/designmd-tokens.py to-design tokens.json \
    -o DESIGN.md \
    --base DESIGN.md \
    --meta-out DESIGN.md.penpot.json
```

- Accepts a single JSON, a directory of set files, or a ZIP export.
- `--base DESIGN.md` preserves the existing body, description and `components:` block; only standard token sections
  are regenerated.
- `--effective` writes the resolved active-set values instead of the base set.
- The sidecar records everything DESIGN.md cannot express. Keep it next to the generated file for a lossless
  JSON → MD → JSON round trip.
- `--no-meta` skips the sidecar for a one-way, human-readable export.

## 4. Penpot UI import/export

Penpot's `TOKENS → Tools` menu offers Single JSON / Folder / ZIP import and Single/Multiple export. Import **replaces
all tokens, sets and themes in the file**; it does not merge. Export a backup first.

There is no token import/export API in the plugin. For a runtime build, use `TK.seed(spec)` in MCP; for editing tokens
in the Penpot UI, use this converter + the UI import.

## 5. Validation

- `python3 scripts/designmd-tokens.py --help` checks the CLI.
- Run the round trip on a copy and compare **token JSON**, not only the Markdown: Penpot stores shadow alpha as
  8-bit hex, so a DESIGN.md layer opacity may read back quantized (`0.08` → `0.0784`); that is a format limit, not a
  lost token.
  ```bash
  python3 scripts/designmd-tokens.py to-penpot DESIGN.md -o /tmp/t.json
  python3 scripts/designmd-tokens.py to-design /tmp/t.json -o /tmp/DESIGN.md \
      --base DESIGN.md --meta-out /tmp/t.penpot.json
  python3 scripts/designmd-tokens.py to-penpot /tmp/DESIGN.md -o /tmp/t2.json
  # compare /tmp/t.json and /tmp/t2.json semantically
  ```
- `npx @google/design.md lint DESIGN.md` must stay at 0 errors.
- Check that the generated token names are kebab-case; a camelCase frontmatter key is preserved, so fix the source
  DESIGN.md rather than post-editing the JSON.
