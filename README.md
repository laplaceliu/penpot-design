# penpot-design

A skill pack conforming to the [vercel-labs/skills](https://github.com/vercel-labs/skills) (Agent Skills open ecosystem) specification:
**a Code ↔ Design bidirectional design-system workflow + a practical Penpot MCP automation library**.

Both directions share the same design-system contract (DESIGN.md + the fixed Penpot structure):

- **Code → Design**: feed a URL / a set of images / an existing React component-library source tree → produce DESIGN.md + a Penpot design system (18 pages in 4 layers).
- **Design → Code**: feed a Penpot design file → emit code for the chosen tech stack (Qt / Web frontend / LVGL / imgui / MAUI / Flutter …), with PIL pixel-level acceptance testing aimed at pixel-perfect results; supports Web widescreen / tablet / phone viewports.

Layout, components and design rules are **executable engines, not prose**: `layout_engine.js` holds the spacing/type/grid scales and 29 screen
recipes (app chrome — header, sidebar, footer, toolbar — plus email, calendar, dashboard, chat, kanban, hero, landing, blog, docs, e-commerce,
auth, OTP, pricing, wizard, mobile…), `component_factory.js` produces every variant × state of its 74 control factories with machine-checkable
names (`Button·IconStart·Md·Hover`), `native_layout.js` authors the screens as **native auto-layout** (flow padding/gap/sizing a designer can
edit, with a flow lint of its own), `audit_design.js` lints the result against the 18 HARD rules of `design-guide.md` (grid, rhythm, ramp,
contrast, touch floors, state coverage), `token_engine.js`/`palette_engine.js` own the two repaintable color channels (theme-switched tokens,
library colors), and `prototype_engine.js` wires the delivered screens into a clickable prototype with export presets and verifiable checkpoints.
Screens place **instances** of registered components (`CF.instance`/`CF.swap`) rather than redrawing them. A missing variant or region is fixed
by extending the factory/recipe, never by hand-building a board. Every API claim is backed by a measured readback in
`references/penpot-capabilities.md` (with a "still unverified" list).

## Installation

```bash
# Install into the current project (writes into .codebuddy/skills/ and other agent dirs)
npx skills add laplaceliu/penpot-design

# Install into the user-global directory
npx skills add laplaceliu/penpot-design -g

# Install just this one skill, targeting a specific agent (example: CodeBuddy)
npx skills add laplaceliu/penpot-design --skill penpot-design -a codebuddy

# First list the skills available in the repo
npx skills add laplaceliu/penpot-design --list

# Don't install; instead generate the prompt to feed a specific agent
npx skills use laplaceliu/penpot-design --skill penpot-design --agent claude-code
```

Local-path installation is also supported (for development/debugging):

```bash
npx skills add ./
```

## Directory structure

```
.
└── skills/
    └── penpot-design/          # Skill root: the directory containing SKILL.md is the skill directory
        ├── SKILL.md            # Entry point: frontmatter (name / description) + workflow overview
        ├── references/         # Reference docs loaded on demand
        │   ├── design-guide.md          # Prescriptive rules: spacing / whitespace / typography / color / states / targets (18 HARD rules)
        │   ├── layout-library.md        # Built-in layouts: app chrome, region slots, 29 screen recipes, grid & breakpoints
        │   ├── component-library.md     # Variant taxonomy + the minimum variant/state set every family must draw
        │   ├── design-md-spec.md        # DESIGN.md spec, lint rules, skeleton template
        │   ├── penpot-structure.md      # 18-page fixed-structure contract (page/board/element + self-check list)
        │   ├── code-to-design.md        # Three entry points: URL / images / source reuse + unified build pipeline
        │   ├── mcp-connection.md        # Connect Penpot MCP (endpoint, CA, client config)
        │   ├── mcp-automation.md        # execute_code practical handbook (session discipline, layout approaches, acceptance)
        │   ├── api-pitfalls.md          # Detailed Penpot API pitfalls
        │   ├── positioning-audit.md     # Positioning failure signatures S1–S11, root causes, preventive gates
        │   ├── design-tokens.md         # Penpot Design Tokens: 17 TokenTypes, activation, themes, paint proof, doc-vs-impl gaps
        │   ├── penpot-capabilities.md   # Measured Penpot API evidence base (what may be claimed / still unverified)
        │   ├── native-layout.md         # Native auto-layout authoring (storage.NL): rules R1–R6, sizing traps, flow lint
        │   ├── icons.md                 # Icon channels, bundled Lucide catalog (ISC), licenses, why not a .penpot download
        │   ├── engines.md               # Seed order, repair-engine mechanics, factory templates, screen-assembly pattern
        │   ├── viewport-profiles.md     # Viewport tiers: web 1440 / pad 834 / mobile 375
        │   ├── color-schemes.md         # Light-only vs switchable light+dark, bounded artifact mapping
        │   ├── design-to-code-generic.md  # Generic codegen discipline (shared across stacks)
        │   ├── stack-profiles.md        # Stack tiers: platform-family classification / runtime prompts / unknown-stack handling
        │   ├── verification.md          # PIL pixel-level verification flow
        │   └── stacks/                  # Tech-stack adapter registry (one doc per stack, unified template)
        │       ├── manifest.md          # Stack → adapter doc + platform-family tags
        │       ├── qt.md                # Qt4 / Qt5 / Qt6 (QWidget · QML)
        │       ├── web.md               # React / Vue / Angular / Svelte / Web Components
        │       ├── flutter.md           # Flutter (retained canvas)
        │       ├── compose.md           # Jetpack Compose (declared constraints)
        │       ├── swiftui.md           # SwiftUI (declared constraints)
        │       ├── maui.md              # .NET MAUI (retained XAML)
        │       ├── lvgl.md              # LVGL for embedded / MCU
        │       └── imgui.md             # Dear ImGui / Nuklear (immediate mode)
        ├── scripts/            # Engines that can be pasted directly into execute_code / run from the CLI
        │   ├── seed_storage.js        # Seeding engine (JS-side color mirror + mkAbsBoard/absMount/mkText/ct)
        │   ├── layout_engine.js       # `storage.LY`: space/type/grid scales, 29 recipes, pack, fold, tier gate
        │   ├── component_factory.js   # `storage.CF`: 74 control factories (6 `CF.map()` groups) + spec matrices + instance/variantSet/svgIcon
        │   ├── native_layout.js       # `storage.NL`: native flex/grid authoring, whenSettled, auditFlow, fromRecipe
        │   ├── audit_design.js        # `storage.designGate`: 18 HARD design-rule checks (read-only)
        │   ├── audit_layout.js        # `storage.auditPage`: 11 positioning signatures (read-only)
        │   ├── token_engine.js        # `storage.TK`: design-token seed / apply / paint proof / audit
        │   ├── palette_engine.js      # `storage.LIB`: library colors (seed / ref-bind / three-channel audit / raw replace)
        │   ├── prototype_engine.js    # `storage.PR`: flows, interactions, export presets, verifiable checkpoints
        │   ├── icon_engine.js         # `storage.IC`: embedded Lucide catalog → editable vectors (place / grid)
        │   ├── scaffold_structure.js  # Batch-build the 18-page skeleton (pages → headers → fit)
        │   ├── repair_engines.js      # fixStaleCenter / groupAssemblies / fixZOrder / align / vAlign / fixInner / unclip
        │   ├── fix_layout.js          # Batch-flex-collapse repair
        │   ├── fix_geometry.js        # Geometry repair (offset / fit / reflow / move subtree, dry-run capable)
        │   └── pixel_diff.py          # PIL pixel comparison (heatmap + JSON metrics)
        └── assets/
            ├── icons/                 # Embedded icon catalog: lucide.jsonl (1966 icons, 24-grid, ISC) + LICENSE
            └── penpot-server/         # Bundled local Penpot deployment stack (self-resolving paths, fully relocatable)
                ├── compose.yaml       # 7 services: frontend/backend/exporter/mcp/postgres/valkey/caddy
                ├── caddy/Caddyfile    # Terminate TLS at https://penpot.local
                ├── .env.example       # Copy to .env and edit as needed
                └── scripts/           # prewarm / up / down / status / tail-logs / trust-ca / create-profile
```

## Prerequisites

Prepare only what you need for the capabilities you use (no need to install everything):

| Capability | Dependency |
|---|---|
| Local Penpot + MCP (recommended; stack is bundled) | Docker Engine + compose plugin; scripts auto-patch `/etc/hosts` |
| PIL pixel-level acceptance | Python 3 + `Pillow` (`pip install Pillow`) |
| DESIGN.md lint / export | Node.js (the skill uses `npx @google/design.md` internally, no preinstall needed) |
| Code output | The toolchain for the target stack (Qt / Web frontend / other stacks per `references/stacks/manifest.md` adapters) |

First run of the local stack:

> **Check whether a deployment already exists first**: probe liveness with `./scripts/status.sh` (or `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags` to see if it returns 200); also check whether the workspace `.mcp.json` already contains a `penpot` entry. If the service is already running and MCP is configured, just verify — **no reinstall needed**. See skill `references/mcp-connection.md` §0 Pre-start checklist.

```bash
cd skills/penpot-design/assets/penpot-server
cp .env.example .env          # optional: change image tag / domain / secret
./scripts/prewarm.sh          # pull images, ~5 minutes
./scripts/up.sh               # start and wait until https://penpot.local is ready
./scripts/trust-ca.sh         # install CA (required by the MCP client; restart the client afterward)
./scripts/create-profile.sh   # create a login account (a fresh DB is empty, so this is required)
```

> Security note: the default credentials (`admin@penpot.local` / `penpot123`) and the `PENPOT_SECRET_KEY=change-me-in-production-please` in `.env.example` are public placeholder values for local demo only.
> Change them before exposing the stack beyond your machine. `.env` and `data/` are already gitignored.

## Skill contract notes

- `SKILL.md` frontmatter depends only on the two required fields `name` + `description` (both strings),
  compatible with vercel-labs/skills discovery / install / update validation; `version`, `license` are additional metadata.
- `references/` `scripts/` `assets/` inside the skill directory are all referenced relative to the directory containing `SKILL.md`,
  so paths stay valid after the whole directory is symlinked / copied into any agent's skills directory.
- All scripts inside `assets/penpot-server/` derive the stack root from `BASH_SOURCE`, containing no machine-specific absolute paths.

## License

MIT — see [LICENSE](LICENSE).
