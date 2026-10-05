# penpot-design

A skill pack conforming to the [vercel-labs/skills](https://github.com/vercel-labs/skills) (Agent Skills open ecosystem) specification:
**a Code ↔ Design bidirectional design-system workflow + a practical Penpot MCP automation library**.

Both directions share the same design-system contract (DESIGN.md + the fixed Penpot structure):

- **Code → Design**: feed a URL / a set of images / an existing React component-library source tree → produce DESIGN.md + a Penpot design system (16-page fixed structure).
- **Design → Code**: feed a Penpot design file → emit code for the chosen tech stack (Qt / Web frontend / LVGL / imgui / MAUI / Flutter …), with PIL pixel-level acceptance testing aimed at pixel-perfect results; supports Web widescreen / tablet / phone viewports.

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
        ├── references/         # Reference docs loaded on demand (10+ articles)
        │   ├── design-md-spec.md      # DESIGN.md spec, lint rules, skeleton template
        │   ├── penpot-structure.md    # 16-page fixed-structure contract
        │   ├── code-to-design.md      # Three entry points: URL / images / source reuse
        │   ├── mcp-connection.md      # Connect Penpot MCP (endpoint, CA, client config)
        │   ├── mcp-automation.md      # execute_code practical handbook
        │   ├── api-pitfalls.md        # Detailed Penpot API pitfalls
        │   ├── engines.md             # Repair engine / component factory / page recipes
        │   ├── design-to-code-generic.md  # Generic codegen discipline (shared across stacks)
        │   ├── stack-profiles.md      # Stack tiers: platform-family classification / runtime prompts / unknown-stack handling
        │   ├── stacks/                # Tech-stack adapter registry
        │   │   ├── manifest.md        # Stack → adapter doc + platform-family tags
        │   │   ├── qt.md              # Qt4 / Qt5 / Qt6 adapters
        │   │   └── web.md             # Web frontend adapter (React/Vue/Angular/Svelte…)
        │   ├── viewport-profiles.md   # Viewport tiers: web/pad/mobile
        │   └── verification.md        # PIL pixel-level verification flow
        ├── scripts/            # Engines that can be pasted directly into execute_code / run from the CLI
        │   ├── seed_storage.js        # Seeding engine (tokens + factory functions)
        │   ├── scaffold_structure.js  # Batch-build the 16-page skeleton
        │   ├── repair_engines.js      # Alignment / de-cropping / orphan cleanup
        │   ├── fix_layout.js          # Batch-flex-collapse repair
        │   └── pixel_diff.py          # PIL pixel comparison (heatmap + JSON metrics)
        └── assets/
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
