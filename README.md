# penpot-design

A skill pack conforming to the [vercel-labs/skills](https://github.com/vercel-labs/skills) specification:
**a component-first, token-driven design-system workflow + a practical Penpot MCP automation library**.

The unit of work is a **component**. A component is a declarative definition — props, states, slots, anatomy and
token-role bindings. A factory is only its renderer. Design tokens are the only source of color, type, corner, spacing
and elevation. A screen is an assembly of component instances.

```
tokens → components → assemblies → screens
```

Two packs ship in the skill:

- **core** — 24 hand-authored, token-bound components (Button, Input, Select, Card, Modal…).
- **catalog** — 131 codesign-ui families (125 visual + 6 behaviour-only) for a 1:1 recreation, with source-anatomy
  support for the 56 custom families.

`storage.CK` builds and binds masters, places instances, proves a light/dark theme by repaint, and audits the component
contract. The design-to-code side reads the same registry (`CK.inventory`) and emits code for the confirmed tech stack,
with PIL pixel acceptance.

## Installation

```bash
# Install into the current project (writes into .codebuddy/skills/ and other agent dirs)
npx skills add laplaceliu/penpot-design

# Install into the user-global directory
npx skills add laplaceliu/penpot-design -g

# Install just this one skill, targeting a specific agent (example: CodeBuddy)
npx skills add laplaceliu/penpot-design --skill penpot-design -a codebuddy

# List available skills, or print the prompt without installing
npx skills add laplaceliu/penpot-design --list
npx skills use laplaceliu/penpot-design --skill penpot-design --agent claude-code
```

Local-path installation:

```bash
npx skills add ./
```

## Directory structure

```
.
└── skills/
    └── penpot-design/          # Skill root: the directory containing SKILL.md
        ├── SKILL.md            # component-first workflow (tokens → components → assemblies → screens)
        ├── assets/
        │   ├── components/     # token-contract.json · core.json · catalog.json
        │   ├── libraries/      # codesign-ui.json · codesign-ui.anatomy.json · codesign-ui.map.json
        │   ├── icons/          # lucide.jsonl (1966 icons, ISC) + LICENSE
        │   └── penpot-server/  # local Penpot deployment stack
        ├── references/
        │   ├── component-system.md      # THE component contract
        │   ├── design-principles.md     # spacing, type, color, states, elevation, shape
        │   ├── design-tokens.md         # Penpot token mechanics
        │   ├── design-md-spec.md        # DESIGN.md schema and template
│   ├── designmd-tokens.md       # DESIGN.md ↔ Penpot Tokens JSON
        │   ├── runtime.md               # MCP, seeding, execute_code, delivery
        │   ├── layout.md                # LY regions, NL flow, screen assembly
        │   ├── viewport-and-themes.md   # tiers, light/dark themes
        │   ├── catalog-pack.md          # 131-family inventory and anatomy
        │   ├── code-to-design.md        # URL / images / source tree → components
        │   ├── api-pitfalls.md          # measured Penpot traps
        │   ├── icons.md · verification.md
        │   ├── design-to-code-generic.md · stack-profiles.md
        │   └── stacks/                  # stack adapters
        └── scripts/
            ├── component-engine.js      # storage.CK
            ├── component-factory.js     # renderers
            ├── token-engine.js          # storage.TK / TP
            ├── elevation-engine.js      # storage.EL
            ├── layout-engine.js         # storage.LY
            ├── native-layout.js         # storage.NL
            ├── icon-engine.js           # storage.IC
            ├── media-engine.js          # storage.MD
            ├── anatomy-engine.js        # storage.AN
            ├── catalog-engine.js        # storage.LM
            ├── prototype-engine.js      # storage.PR (optional delivery)
            ├── seed-storage.js
            ├── designmd-tokens.py · serve-skill.py · pixel-diff.py
            ├── build-component-catalog.py · validate-components.py
            └── inventory-library.py · extract-anatomy.js
```

## Prerequisites

| Capability | Dependency |
|---|---|
| Local Penpot + MCP (recommended; stack bundled) | Docker Engine + compose plugin; scripts auto-patch `/etc/hosts` |
| PIL pixel acceptance | Python 3 + `Pillow` |
| DESIGN.md lint | Node.js (`npx @google/design.md`, no preinstall) |
| DESIGN.md ↔ Tokens JSON | Python 3.9+ + PyYAML (`python3 -m pip install pyyaml`) |
| Code output | the target stack toolchain (`references/stacks/manifest.md`) |

First run of the local stack:

> **Probe before deploying**: `./scripts/status.sh` (or
> `curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags`). If it returns 200 and the workspace
> `.mcp.json` already has a `penpot` entry, just verify; do not reinstall.

```bash
cd skills/penpot-design/assets/penpot-server
cp .env.example .env          # optional: image tag / domain / secret
./scripts/prewarm.sh          # pull images (~5 min)
./scripts/up.sh               # start and wait for https://penpot.local
./scripts/trust-ca.sh         # install CA (restart the MCP client afterward)
./scripts/create-profile.sh   # create the login account (fresh DB is empty)
```

> The default local credentials (`admin@penpot.local` / `penpot123`) and
> `PENPOT_SECRET_KEY=change-me-in-production-please` are demo placeholders. Change them before exposing the stack.
> `.env` and `data/` are gitignored.

## Validation

```bash
python3 skills/penpot-design/scripts/validate-components.py        # offline registry/factory/role/catalog check
python3 skills/penpot-design/scripts/build-component-catalog.py    # regenerate catalog.json
```

Live-verified on Penpot 2.18.3 (2026-11-02): 24/24 core masters, `CK.audit` CLEAN, 0 unbound fill/stroke/type/radius,
dark-theme repaint of 65 shapes, exact variant instances `fallback:false`.

## Skill contract notes

- `SKILL.md` frontmatter uses the two required fields `name` + `description`; `version`/`license` are metadata.
- `references/`, `scripts/` and `assets/` are resolved relative to the directory containing `SKILL.md`, so the whole
  skill directory can be copied or symlinked into any agent's skills directory.
- Deployment scripts derive the stack root from `BASH_SOURCE`; no machine-specific absolute paths.

## License

MIT — see [LICENSE](LICENSE).
