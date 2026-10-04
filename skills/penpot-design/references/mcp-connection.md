# 连接 Penpot MCP 指南

## 0. 启动前检查（确认 Penpot / MCP 是否已就绪）

**不要默认直接 `install.ps1` / `up.sh`**。先探测，按最小必要动作处理：既省时间（拉镜像约 5min），也避免误覆盖已有部署或误重跑 `create-profile`。

### 0.1 探测 Penpot 服务状态

- 首选：`scripts/status.{sh,ps1}` —— 输出容器状态 + HTTPS 探活（`/` 与 `/api/main/methods/get-enabled-flags` 的 HTTP 码）。
  - 两路 probe 均 `200` → **服务已在运行，跳到 §4 验证即可**。
  - 容器存在但状态非 `Up` → 只需 `up.{sh,ps1}` 拉起，**不要重装**；数据卷（postgres/valkey）保留，账号仍在，免 `create-profile`。
  - `compose ps` 报错 / 无容器 / 无 `$STACK/docker-compose.yml` → 需要完整安装（§1）。
- 快速替代（无脚本环境）：`curl -sk --max-time 5 https://penpot.local/api/main/methods/get-enabled-flags`，返回 200 即已起。

### 0.2 探测 MCP 客户端配置

- 工作区 `.mcp.json` 是否含 `penpot` 条目且 `url` 为 `https://penpot.local/mcp/stream`。
- `NODE_EXTRA_CA_CERTS` 是否已设置，且 CA 证书文件存在：`$STACK/data/caddy/pki/authorities/local/root.crt`（trust-ca 跑过才会生成）。
  - 两者都满足且 §0.1 端点可达 → **MCP 已就绪，直接 §4 验证**，不要重跑 trust-ca / 不要改 `.mcp.json`。
  - 配置在但端点没起 → 仅启动服务（§0.1 的 `up`）。
  - 未配置 → 按 §3 配置 `.mcp.json` + 跑 `trust-ca` + **重启客户端**。

### 0.3 确认动作（向用户）

把探测结论用一两句话汇报，并用 `ask_followup_question` 让用户确认下一步（轻量探测本身不打扰用户）：

| 探测结论 | 建议动作 | 是否需询问 |
|---|---|---|
| 服务在跑 + MCP 已配 | 直接验证（§4） | 否，直接验证 |
| 服务停了 + MCP 已配 | 仅 `up` 拉起 | 是（确认「仅启动」） |
| 无部署 / 未配置 | 完整安装 + 配置 | 是（确认「完整安装，约 5min」） |
| 服务在跑但 MCP 未配 | 仅配 MCP（trust-ca + `.mcp.json` + 重启客户端） | 是 |

> 关键原则：能复用就复用，能只启动就只启动，**绝不**在已就绪时重装或重跑 `create-profile`。

### 0.4 排障：`Connect Timeout Error (attempted address: penpot.local:443)`

这个报错**不代表客户端配置错**，而是端点根本没在监听。按下面顺序判定，**不要一上来就重装**：

| 症状 | 判定 | 动作 |
|---|---|---|
| `curl https://penpot.local` → `000`，但容器的 `status` 显示 `Up` | caddy 尚未 ready 或端口未映射 | 等 10–20s 重试 |
| `dockerDesktopLinuxEngine/.../containers/json` → `500`，报 "check if the server supports the requested API version" | Docker Desktop 引擎刚恢复 / API 版本协商抖动 | **用真实 docker 复核**（见下），能通即忽略这个 500 |
| 引擎可达但 `docker compose ls` 无项目 / 无容器 | 栈确实没起 | `up.{sh,ps1}` 拉起；数据卷在，**免** `create-profile` |
| 引擎本身不可达（`docker version` 连不上） | Docker Desktop 未启动 | 启动 Docker Desktop，等引擎 ready 再 `up` |

**Windows 陷阱：PATH 上的 `docker` 可能是 podman shim。**
实测环境 `where docker` 首位是 `H:\dev\shim\docker.cmd`，内容是把参数转给 `podman.exe`：

```bat
@echo off
call "%~dp0_wslup.cmd"
set "DOCKER_HOST=tcp://127.0.0.1:2375"
"%~dp0..\bin\podman.exe" %*
```

此时 `docker ps` 会报 `Cannot connect to Podman socket ... A socket operation encountered a dead network`，
**看起来像"容器全挂"，实际是问错了后端**。而本栈的 `lib.ps1` 明确以 **Docker Desktop** 为引擎
（`docker compose` / `docker-compose`）并会主动跳过 PATH shim。
复核请用真实二进制：

```powershell
$d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $d version --format 'client={{.Client.Version}} server={{.Server.Version}} api={{.Server.APIVersion}}'
& $d compose ls -a
& $d ps -a --format "{{.Names}} | {{.Status}}"
```

**服务起来了但工具仍不可用**：`/mcp` 能返 200、MCP 容器日志显示工具已注册，
但 `execute_code` 报 "tool does not exist or is not registered" →
是**客户端把 MCP server 注册丢了**（连接失败被反复打断后失联）。此时：
1. 确认客户端配置（Windows: `%USERPROFILE%\.codebuddy\mcp.json`，非工作区 `.mcp.json`）里的
   `url` 为 `https://penpot.local/mcp/stream?userToken=...`；裸 curl 打 `/mcp/stream` 返 **406 属正常**
   （缺 SSE Accept 头），不是故障；
2. **重载 IDE 窗口 / 重连 MCP servers**，让客户端重新读取配置并注册 penpot 工具；
3. 另需浏览器里的 Penpot 插件面板处于打开且已连上桥接（WS 4402），`execute_code` 才能触达文件。

### 0.5 排障：`No Penpot instance connected for user token`

**这是"客户端↔服务端正常、服务端↔浏览器断开"的专属报错**，与 §0.4 的失联不是一回事，别混。判据：

| 现象 | 含义 |
|---|---|
| `high_level_overview` / `penpot_api_info` 正常返回 | 客户端↔MCP 服务端 **通**（这两个工具在服务端本地，不需要浏览器） |
| `execute_code` 报 `No Penpot instance connected for user token` | MCP 服务端↔浏览器 **断**（`execute_code` 是唯一要触达文件的通道） |
| 服务端日志只有 `WebSocket mcpServer started on port 4402`，无任何后续插件连接行 | 浏览器插件**从未连上**（不是掉线，是没装/没运行） |
| 日志里 `userTokenFp=<fp>` 稳定出现 | 客户端 token 没问题，问题在浏览器侧 |

**浏览器侧接线（每档约 1 分钟）**：

1. 打开 `https://penpot.local` 并登录（`admin@penpot.local` / `penpot123`）。
2. 打开目标设计文件。
3. 安装/启用插件，**manifest 地址**：`https://penpot.local/plugins/mcp/manifest.json`
   （插件名 **Penpot MCP Plugin**，权限 `content:read/write`、`library:read/write`、`comment:read/write`）。
4. **在该文件里运行这个插件**——它代表文件与 MCP 服务端建立桥接。
   桥接是**按文件/按会话**的：刷新或切换文件后需要重新运行插件。

**端点自查（都可 curl 判定，不必猜）**：

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://penpot.local/plugins/mcp/manifest.json   # 200 = 插件可安装
curl -sk -o /dev/null -w '%{http_code}\n' https://penpot.local/mcp/stream                  # 406 = 服务端活着（缺 SSE 头，正常）
curl -sk -o /dev/null -w '%{http_code}\n' https://penpot.local/mcp/ws                      # 426 = 桥接端点活着（缺 Upgrade 头，正常）
```

这三个码是**健康态**，别当成故障。反过来：`manifest` 404 = 前端 nginx 没代理到 `penpot-mcp`
（检查 `docker exec <frontend> cat /etc/nginx/overrides/server.d/mcp-locations.conf`，
应有 `/mcp/ws → penpot-mcp:4402`、`/mcp/stream → penpot-mcp:4401/mcp`、`/mcp/sse → penpot-mcp:4401/sse`）。

**诊断日志口径**（Windows 注意 PATH 上的 `docker` 可能是 podman shim，见 §0.4）：

```powershell
$d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
& $d logs --tail 40 penpot-server-penpot-mcp-1
# 关心两类行：PluginBridge(插件连接) 与 userTokenFp=x(客户端会话)
```

## 1. 前置：本地 Penpot 部署

部署栈**随本技能自带**：`assets/penpot-server/`（compose 栈 7 服务：penpot-{frontend,backend,exporter,mcp,postgres,valkey} + caddy，Penpot 2.18，Caddy 在 `https://penpot.local` 终止 HTTPS）。完整说明见 `assets/penpot-server/README.md`。

> **为什么没有绝对路径**：栈根目录由脚本从自身位置反推，所以把 `assets/penpot-server/` 整目录拷到任意位置（`~/penpot`、`C:\penpot`、CI workspace）都一样跑，不用改任何路径。Linux/macOS 用 `scripts/lib.sh`（`BASH_SOURCE` + 逐级解析符号链接），Windows 用 `scripts/lib.ps1`（`$PSScriptRoot`）。下文的 `$STACK` 指栈目录（默认 = `<SKILL_DIR>/assets/penpot-server`，`<SKILL_DIR>` = 本技能 `SKILL.md` 所在目录）。

### 1.1 镜像 tag 口径（"Version mismatch" 的头号成因）

- **tag 是两段 minor，不是三段 patch**：写 `2.18`，**不要**写 `2.18.0`。`2.18` 实际解析到 `2.18.1`。
- 四个 `penpotapp/*` 镜像必须来自**同一次构建**。镜像自带 `org.opencontainers.image.version` 与
  `org.opencontainers.image.revision` 标签，可直接自证：

  ```powershell
  $d = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe"
  foreach ($i in 'frontend','backend','exporter','mcp') {
    $l = (& $d inspect "penpotapp/${i}:2.18" --format '{{json .Config.Labels}}' | ConvertFrom-Json)
    "$i -> $($l.'org.opencontainers.image.version') $($l.'org.opencontainers.image.revision')"
  }
  # 四个 revision 必须一致。实测 2.18 = version 2.18.1 / revision 423cb411324d
  ```

- **症状 → 处方**：插件里出现
  `Version mismatch detected: This version of the MCP server is intended for Penpot X while the current version is Y`
  → `penpotapp/mcp` 与 `penpotapp/frontend` 不是同一构建。**只改 `.env` 的 `PENPOT_IMAGE_TAG` 一处**
  （`compose.yaml` 的四条 image 行、`prewarm.{sh,ps1}` 的默认值都读同一个变量），然后重建。

- **升级是一次全量重建**，顺序固定：

  ```bash
  # 1) 先停栈，做冷备份（后端启动即跑不可回退的库迁移，必须留退路）
  ./scripts/down.{sh,ps1}
  cp -r ./data/postgres/data ./data/postgres/data-backup-<旧tag>
  # 2) 改 .env 的 PENPOT_IMAGE_TAG=<新tag>
  # 3) 拉镜像 → 拉起（自动迁移）
  ./scripts/prewarm.{sh,ps1}
  ./scripts/up.{sh,ps1}
  # 4) 核验：容器全部 Exited 变成 Up，且 endpoints 三码健康
  ```

  迁移后自证数据无损（Penpot 把页面存在 `file.data` 的 **bytea** 里，别指望能 SQL 解析页面树）：

  ```bash
  docker exec penpot-server-penpot-postgres-1 psql -U penpot -d penpot -t -A -F ' | ' \
    -c "SELECT name, pg_size_pretty(length(data)::bigint), revn, modified_at FROM file ORDER BY created_at;"
  ```

  旧 tag 的镜像**先留着**（是唯一的快速回滚路径），确认新版稳定后再 `docker rmi` 回收磁盘。

**引擎**：脚本自动检测 —— 优先 `podman compose`（Windows 推荐 Podman Desktop），否则回退 `docker compose` / `docker-compose`。

**Linux / macOS（bash）：**

```bash
STACK=<SKILL_DIR>/assets/penpot-server   # 目录可整体搬走，$STACK 随之变化
cd "$STACK" && cp .env.example .env # 可选：改镜像 tag / 域名 / secret
./scripts/prewarm.sh                # 首次拉镜像（~5 min）
./scripts/up.sh                     # 启动 + 等待 https://penpot.local 就绪（自动补 /etc/hosts）
./scripts/trust-ca.sh               # 装 CA → 见 §3（MCP 客户端必需）
./scripts/create-profile.sh         # 建登录账号（新库是空的，必需；幂等）
./scripts/status.sh                 # 容器状态 + HTTPS 探活 + 证书 + 磁盘占用
./scripts/tail-logs.sh <service>    # 跟踪单服务日志
./scripts/down.sh [--volumes]       # 停止（--volumes 清数据，不可逆）
```

**Windows（PowerShell，建议用管理员终端）：**

```powershell
$STACK = "<SKILL_DIR>\assets\penpot-server"
cd $STACK
Copy-Item .env.example .env                              # 可选
.\scripts\install.ps1                                   # 一键：prewarm→up→trust-ca→create-profile
# 或分步：
.\scripts\prewarm.ps1
.\scripts\up.ps1
.\scripts\trust-ca.ps1
.\scripts\create-profile.ps1                            # 建登录账号（新库是空的，必需；幂等）
.\scripts\status.ps1
.\scripts\tail-logs.ps1 <service>
.\scripts\down.ps1 [-Volumes]
```

登录凭据（`create-profile.sh` 播种）：`https://penpot.local/`，`admin@penpot.local` / `penpot123`（登录后到 `/auth/profile` 改密码）。主机名改 `PENPOT_HOST` 时要同步改 `.env` 的 `PENPOT_PUBLIC_URI` 与 `caddy/Caddyfile` 站点块。

## 2. MCP 端点

| 通道 | URL |
|---|---|
| Streamable HTTP（推荐） | `https://penpot.local/mcp/stream` |
| Legacy SSE | `https://penpot.local/api/mcp/sse` |

## 3. 客户端配置（CodeBuddy / Codex / VSCode 通用）

```json
{
  "mcpServers": {
    "penpot": {
      "type": "http",
      "url": "https://penpot.local/mcp/stream"
    }
  }
}
```

- CodeBuddy：写入工作区 `.mcp.json`（或 CodeBuddy MCP 设置面板填上述 URL）。
- **CA 每栈独立**：`$STACK/data/caddy/pki` 在首次启动时生成，换栈目录/重新拷一份 = 换 CA，浏览器与客户端仍信任旧的就会报错（不是脚本坏了）。解法见 `assets/penpot-server/README.md`「换目录 / 新克隆后浏览器报证书错误」：沿用旧 PKI，或重跑信任脚本并重启浏览器。
- 端点走 Caddy 自签 TLS。Node/Electron 客户端不读系统证书库，必须设置（脚本自动处理）。

  - **Linux/macOS**：`./$STACK/scripts/trust-ca.sh` 会写入系统 OpenSSL 库 + NSS（Chrome/Edge/Playwright）+ Firefox + `NODE_EXTRA_CA_CERTS`（写入 `~/.zshenv`、`~/.bashrc`、`/etc/environment`）。手动指定时：

    ```bash
    export NODE_EXTRA_CA_CERTS="$STACK/data/caddy/pki/authorities/local/root.crt"
    ```

  - **Windows**：`.\$STACK\scripts\trust-ca.ps1` 把 CA 装进**当前用户**的 `Trusted Root Certification Authorities` 存储，并写入**用户级** `NODE_EXTRA_CA_CERTS`（无需管理员）。手动指定时（PowerShell）：

    ```powershell
    $env:NODE_EXTRA_CA_CERTS = "$STACK\data\caddy\pki\authorities\local\root.crt"
    # 持久化（用户级）：
    [Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', "$STACK\data\caddy\pki\authorities\local\root.crt", 'User')
    ```

**设置环境变量后必须重启 AI 客户端**（env 不会注入已运行进程）。否则报：

```
SSE error: TypeError: fetch failed: unable to get local issuer certificate
```

## 4. 连接验证

1. MCP 工具列表出现 4 个工具：`execute_code`、`export_shape`、`high_level_overview`、`penpot_api_info`。
2. 调 `penpot_api_info` 确认握手成功。
3. 调 `high_level_overview` 确认能读到当前文件的页/板树。
4. `execute_code` 冒烟测试：`return {page: penpot.currentPage.name, pages: penpotUtils.getPages().map(p=>p.name)}`。

## 5. 可用工具与工作定位

| 工具 | 用途 | 备注 |
|---|---|---|
| `execute_code` | 唯一写入通道：建页/建板/建组件/改属性 | 沙箱执行，**30s 超时** |
| `export_shape` | 导出 PNG 验收 | 只能导出**当前激活页**上的形状 |
| `high_level_overview` | 读文件结构 | 构建前勘察、修复前比对 |
| `penpot_api_info` | API/连接信息 | 排障 |

## 6. execute_code 会话纪律（速查）

- **切页异步**：`penpot.openPage(pageObj)` 后同调用内操作会命中旧页。每条命令开头防御式验证：`openPage(pg); await sleep(400); if (penpot.currentPage.name !== '目标页') return {err: penpot.currentPage.name};`
- `openPage` 只接受 Page 对象或 UUID：`storage.pg = n => penpotUtils.getPageByName(n)`。
- **storage 易失**：插件重连/崩溃即丢，每批前探测 `storage.mkText` 等，缺失则重新播种（`scripts/seed_storage.js`）。
- **批量上限**：每调用 ≤8 图元或 ≤10 文本；超时可能部分生效，重试前先探测残留。
- 跨页修改报 "Cannot modify a page that is not currently active" → 先激活所属页。
- 返回值只给原始值（数字/字符串/平铺数组），复杂对象 structuredClone 失败。
- 崩溃损伤：最后一批 board/rect/ellipse 可能退化为 100×100（检测恰为 100×100 的非文本图元），按规格重 resize；禁用 WebGL 可显著稳定；轻度卡死 sleep 60~120s 自愈。

布局三方案按序：A 裸板+世界坐标 appendChild（注意导出偏移风险）→ B flex 自动布局（警惕 hug 压塌）→ **C flex 容器 + 全员 absolute + 世界坐标（推荐兜底）**。完整引擎与陷阱表见本技能 `references/`：mcp-automation.md（纪律/速查）/ api-pitfalls.md（机理详解与三方案实测表）/ engines.md（引擎机理与页面配方）；引擎代码在 `scripts/`。
