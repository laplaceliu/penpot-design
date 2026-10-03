# penpot-design

一个符合 [vercel-labs/skills](https://github.com/vercel-labs/skills)（Agent Skills 开放生态）规范的技能包：
**Code ↔ Design 双向设计系统工作流 + Penpot MCP 自动化实战库**。

两个方向共用同一套设计系统契约（DESIGN.md + Penpot 固定结构）：

- **Code → Design**：给 URL / 一组图片 / 既有 React 组件库源码 → 产出 DESIGN.md + Penpot 设计系统（16 页固定结构）。
- **Design → Code**：给 Penpot 设计文件 → 按所选技术栈（Qt / Web 前端 / LVGL / imgui / MAUI / Flutter …）输出代码，PIL 像素级验收，目标 pixel-perfect；支持 Web 宽屏 / 平板 / 手机三档视口。

## 安装

```bash
# 安装到当前项目（写入 .codebuddy/skills/ 等各 agent 目录）
npx skills add laplaceliu/penpot-design

# 安装到用户全局目录
npx skills add laplaceliu/penpot-design -g

# 只装这一个技能，并指定 agent（示例：CodeBuddy）
npx skills add laplaceliu/penpot-design --skill penpot-design -a codebuddy

# 先看仓库里有哪些技能
npx skills add laplaceliu/penpot-design --list

# 不安装，直接生成提示词喂给某个 agent
npx skills use laplaceliu/penpot-design --skill penpot-design --agent claude-code
```

也支持本地路径安装（开发调试时）：

```bash
npx skills add ./
```

## 目录结构

```
.
└── skills/
    └── penpot-design/          # 技能根目录：SKILL.md 所在处即技能目录
        ├── SKILL.md            # 入口：frontmatter（name / description）+ 工作流总纲
        ├── references/         # 按需加载的参考文档（10 篇）
        │   ├── design-md-spec.md      # DESIGN.md 规范、lint 规则、骨架模板
        │   ├── penpot-structure.md    # 16 页固定结构契约
        │   ├── code-to-design.md      # URL / 图片 / 源码复刻三条入口
        │   ├── mcp-connection.md      # 连接 Penpot MCP（端点、CA、客户端配置）
        │   ├── mcp-automation.md      # execute_code 实战手册
        │   ├── api-pitfalls.md        # Penpot API 陷阱详解
        │   ├── engines.md             # 修复引擎 / 组件工厂 / 页面配方
        │   ├── design-to-code-generic.md  # 通用出码纪律（所有栈共用）
        │   ├── stack-profiles.md      # 技术栈档位：平台族分类 / 运行时询问 / 未知栈处理
        │   ├── stacks/                # 技术栈适配器注册表
        │   │   ├── manifest.md        # 栈 → 适配器文档 + 平台族标签
        │   │   ├── qt.md              # Qt4 / Qt5 / Qt6 适配器
        │   │   └── web.md             # Web 前端适配器（React/Vue/Angular/Svelte…）
        │   ├── viewport-profiles.md   # 视口档位：web/pad/mobile 三档
        │   └── verification.md        # PIL 像素级验证流程
        ├── scripts/            # 可直接粘贴进 execute_code / 命令行运行的引擎
        │   ├── seed_storage.js        # 播种引擎（tokens + 工厂函数）
        │   ├── scaffold_structure.js  # 16 页骨架批量构建
        │   ├── repair_engines.js      # 对齐 / 去裁剪 / 清孤儿
        │   ├── fix_layout.js          # flex 压塌批量修复
        │   └── pixel_diff.py          # PIL 像素比对（热图 + JSON 指标）
        └── assets/
            └── penpot-server/         # 自带的本地 Penpot 部署栈（路径自解析，可整体搬迁）
                ├── compose.yaml       # 7 服务：frontend/backend/exporter/mcp/postgres/valkey/caddy
                ├── caddy/Caddyfile    # https://penpot.local 终止 TLS
                ├── .env.example       # 复制到 .env 后按需修改
                └── scripts/           # prewarm / up / down / status / tail-logs / trust-ca / create-profile
```

## 前置条件

按用到的能力按需准备（不必全装）：

| 能力 | 依赖 |
|---|---|
| 本地 Penpot + MCP（推荐，栈已自带） | Docker Engine + compose 插件；脚本会自动补 `/etc/hosts` |
| PIL 像素级验收 | Python 3 + `Pillow`（`pip install Pillow`） |
| DESIGN.md lint / export | Node.js（技能内用 `npx @google/design.md`，无需预装） |
| 代码输出 | 对应目标技术栈工具链（Qt / Web 前端 / 其它栈依 `references/stacks/manifest.md` 适配器） |

首次跑本地栈：

```bash
cd skills/penpot-design/assets/penpot-server
cp .env.example .env          # 可选：改镜像 tag / 域名 / secret
./scripts/prewarm.sh          # 拉镜像，约 5 分钟
./scripts/up.sh               # 启动并等待 https://penpot.local 就绪
./scripts/trust-ca.sh         # 装 CA（MCP 客户端必需，装完重启客户端）
./scripts/create-profile.sh   # 建登录账号（新库是空的，必需）
```

> 安全提示：默认凭据（`admin@penpot.local` / `penpot123`）与 `.env.example` 里的
> `PENPOT_SECRET_KEY=change-me-in-production-please` 都是公开的占位值，仅供本地演示。
> 暴露到本机之外前请改掉。`.env` 与 `data/` 已被 gitignore。

## 技能契约要点

- `SKILL.md` frontmatter 只依赖 `name` + `description` 两个必填字段（均为字符串），
  与 vercel-labs/skills 的发现 / 安装 / 更新校验兼容；`version`、`license` 为附加元信息。
- 技能目录内的 `references/` `scripts/` `assets/` 均以 `SKILL.md` 所在目录为基准相对引用，
  因此整目录被 symlink / copy 到任意 agent 的 skills 目录后路径依然有效。
- `assets/penpot-server/` 内所有脚本从 `BASH_SOURCE` 反推栈根目录，不含机器相关绝对路径。

## License

MIT —— 见 [LICENSE](LICENSE)。
