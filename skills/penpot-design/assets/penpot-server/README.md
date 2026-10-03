# penpot-ui

本地 Penpot 设计平台的一键部署 + 配套脚本。整个目录是自包含的：克隆到任何
机器（`~/penpot`、`/srv/penpot`、CI workspace 均可）后，脚本会自动定位
`compose.yaml`、`caddy/Caddyfile` 和 `data/`，不需要改任何路径。

## 目录结构

```
.
├── compose.yaml          # 7 个服务：penpot-{frontend,backend,exporter,mcp,postgres,valkey} + caddy
├── caddy/Caddyfile       # https://penpot.local → penpot-frontend:8080
├── .env.example          # 复制到 .env 后按需修改（.env 已 gitignore）
├── data/                 # 容器状态（gitignore）：postgres / valkey / exports / caddy PKI
                          # 注意 assets 用的是命名卷 penpot_assets，不在本地目录
└── scripts/
    ├── lib.sh            # 公共入口：路径自解析、compose 包装、权限与 /etc/hosts 助手
    ├── prewarm.sh        # 预先拉取全部镜像（新机器上先跑这个）
    ├── up.sh             # 启动堆栈并等待 https://penpot.local 就绪
    ├── create-profile.sh # 建登录账号（新库是空的，必需；幂等）
    ├── down.sh           # 停止堆栈 [--volumes 连数据一起删]
    ├── status.sh         # 容器状态 + HTTPS 探测 + 证书 + 磁盘占用
    ├── tail-logs.sh      # 跟随某个服务的日志
    └── trust-ca.sh       # 把 Caddy 内部 CA 装进系统 / 浏览器 / Node 信任库
```

## 前置要求

- **Linux / macOS**：Docker Engine + compose 插件（`docker compose` v2），脚本也
  兼容 v1 的 `docker-compose`。
- **Windows**：**Docker Desktop**（`https://www.docker.com/products/docker-desktop`），
  自带 compose 插件（`docker compose` v2，兼容 v1 的 `docker-compose`）。脚本自动检测。
  - Windows 下所有运维脚本是 **PowerShell**（`.ps1`）版本，与 Linux 的 `.sh`
    一一对应（见下表）。在 **管理员终端** 里跑它们，否则写 `hosts` 会被跳过。
- 首次启动需要把 `penpot.local` 指到 `127.0.0.1`：
  - Linux：脚本自动 `sudo` 写 `/etc/hosts`；
  - **Windows**：写 `C:\Windows\System32\drivers\etc\hosts`，需要**以管理员身份**
    运行终端；非管理员时脚本会打印出要手动加的那一行并继续。

## 快速开始

```bash
cp .env.example .env        # 可选：改镜像 tag / 域名 / secret
./scripts/prewarm.sh        # 新机器上先拉镜像，约 5 分钟
./scripts/up.sh             # 启动并等待 HTTPS 就绪
./scripts/trust-ca.sh       # 装 CA（浏览器 + Node/Electron MCP 客户端）
./scripts/create-profile.sh # 建登录账号
```

启动完成后：

- 访问 <https://penpot.local/>
- 账号 `admin@penpot.local` / `penpot123`（登录后请在 `/auth/profile` 改密码）
- MCP：`https://penpot.local/mcp/stream`

> **注意**：全新部署的数据库是**空的**，一个账号都没有 —— 必须先跑
> `create-profile.sh` 才能登录。`up.sh` 里提示的账号密码是"建完之后"才存在的。

## Windows + Docker（与 Linux 的差异速览）

脚本（`scripts/` 下）同时提供了 `.sh`（Linux/macOS）和 `.ps1`（Windows）两套，
功能完全一致，只是把 Linux 特有的步骤换成了 Windows 等价物：

| 步骤 | Linux (`.sh`) | Windows (`.ps1`) |
|---|---|---|
| 拉镜像 | `./scripts/prewarm.sh` | `.\scripts\prewarm.ps1` |
| 启动 + 等待就绪 | `./scripts/up.sh` | `.\scripts\up.ps1` |
| 装 CA / 信任 | `./scripts/trust-ca.sh` | `.\scripts\trust-ca.ps1` |
| 建登录账号 | `./scripts/create-profile.sh` | `.\scripts\create-profile.ps1` |
| 状态 / 日志 / 停止 | `status` / `tail-logs` / `down` | 同名 `.ps1` |
| 一键安装 | — | `.\scripts\install.ps1`（串起上面四步）|

一键安装（首次）：

```powershell
cd <本目录>
.\scripts\install.ps1                 # 可选: -Email ... -Password ... -NoPrewarm
```

要点：

1. **以管理员身份**打开 PowerShell 再跑脚本，否则写 `hosts` 文件会被跳过（脚本会
   提示你手动加 `127.0.0.1 penpot.local`）。
2. **CA 信任**：`trust-ca.ps1` 把 Caddy 内部 CA 装进 **当前用户** 的
   `Trusted Root Certification Authorities` 存储（不需要管理员），并写入用户级
   `NODE_EXTRA_CA_CERTS` 环境变量，让 Node.js / Electron 类 MCP 客户端（CodeBuddy /
   VSCode / Codex）也能验证自签证书。**装完必须重启浏览器和 AI 客户端**。
3. **端口转发**：`compose.yaml` 里 caddy 发布 `127.0.0.1:443:443`。Docker Desktop
   会把容器端口转发到 Windows 主机的 `127.0.0.1:443`，所以浏览器直接访问
   `https://penpot.local/` 即可。若某些环境下连不上，把 `127.0.0.1:443:443` 改成
   `443:443` 再 `up` 一次。
4. **`.local` 域名**：Windows 的 `hosts` 文件通常优先于 mDNS，但个别浏览器对
   `*.local` 走 mDNS 解析。若出现 "找不到服务器"，把主机名换成 `penpot.test`：
   设环境变量 `PENPOT_HOST=penpot.test`，同步改 `.env` 的 `PENPOT_PUBLIC_URI` 和
   `caddy/Caddyfile` 的站点块（把 `penpot.local` 改成 `penpot.test`）。脚本全部读
   `PENPOT_HOST`，无需改脚本本身。
5. **数据目录权限**：`data/` 通过 bind mount 挂进 Linux 容器（在 Docker Desktop 的
   Linux VM 内）。Postgres/Valkey 首次初始化若报权限错误，先 `down` 再 `up`；仍不行可在
   `compose.yaml` 的对应卷挂里加 `:z` 重标，或改用命名卷。

> 引擎检测逻辑见 `scripts/lib.ps1`：检测 `docker compose`（v2）或 `docker-compose`
> （v1），选定其一。`.ps1` 在 Windows + Docker Desktop 上运行。
>
> **执行策略**：Windows 默认可能禁止运行 `.ps1`（"无法加载，因为禁止运行脚本"）。
> 首次运行前，在管理员 PowerShell 里执行一次
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`；或者每次用
> `powershell -ExecutionPolicy Bypass -File .\scripts\up.ps1` 方式调用。
>
> **Docker Desktop 用户注意**：确保 Docker Desktop 已启动（系统托盘图标为绿/运行中），
> 且已安装 compose 插件（默认自带）。否则 `docker compose version` 会失败，脚本会提示
> 先启动 Docker Desktop。

## 换目录 / 新克隆后浏览器报证书错误？

这是**预期行为**，不是脚本坏了：Caddy 的 `data/caddy/pki` 是每个部署目录独立的，
首次启动会生成一套**全新的 CA 密钥对**。所以换目录或重新克隆就等于换了一个 CA，
而浏览器信任的还是上一套 —— 于是报证书错误。

`./scripts/status.sh` 的 `==> Certificate` 段会显示当前生效的 CA（含 `notBefore`），
`./scripts/trust-ca.sh` 结尾的 `Chain check` 会直接告诉你服务端签发的证书
和刚装进去的 CA 是否对得上 —— 对不上就是换了 CA。

两种解法，按需要选：

**A. 沿用已有的 CA**（推荐，浏览器无需重启，团队不用重新装证书）：
把旧部署的 PKI 复制过来，再重启堆栈。

```bash
./scripts/down.sh
sudo rm -rf data/caddy/pki data/caddy/certificates
sudo cp -a /path/to/old-deployment/data/caddy/pki data/caddy/pki
./scripts/up.sh
```

**B. 用新 CA，重新下发信任**：`./scripts/trust-ca.sh`，然后**重启浏览器**。

## 证书与 MCP 客户端

叶子证书由 Caddy 的内部 CA 签发，浏览器会报 "Your connection is not private"，
Node/Electron 类客户端（Codebuddy / Codex / VSCode / Claude Code）还会直接报
`fetch failed: unable to get local issuer certificate`。跑一次即可：

```bash
./scripts/trust-ca.sh
```

它会写入四处：系统 OpenSSL 信任库（curl/openssl）、`~/.pki/nssdb`
（Chrome / Edge / Playwright）、每个 Firefox profile 的 `cert9.db`、以及
`NODE_EXTRA_CA_CERTS`（`~/.zshenv`、`~/.bashrc`、`/etc/environment`）。
**跑完后必须重启 AI 客户端** —— 环境变量不会进入已运行的进程。

## 脚本的可移植约定

这是本次整理的核心，改动脚本时请遵守：

1. **不使用任何绝对路径**。所有部署路径都由 `scripts/lib.sh` 从脚本自身位置
   反推（`BASH_SOURCE` + 逐级解析符号链接，兼容没有 `readlink -f` 的 macOS）。
   于是可以 `cd /tmp && bash /path/to/scripts/up.sh`，也可以把脚本软链到
   `~/bin`。
2. 仍然存在的绝对路径只有 `/etc/hosts`、`/usr/local/share/ca-certificates`、
   `/etc/environment` 和 `$HOME` 下的信任库 —— 这些在每台机器上都是固定的。
3. 主机名由 `PENPOT_HOST` 控制（默认 `penpot.local`）；改它时要同步改
   `.env` 里的 `PENPOT_PUBLIC_URI` 和 `caddy/Caddyfile` 的站点块。
4. `compose.yaml` 故意**不写** `name:`。项目名由所在目录推导，这样同机上
   并存的多份 checkout 不会互相抢占、甚至重建对方的容器。需要固定名字就在
   `.env` 里设 `COMPOSE_PROJECT_NAME`。
5. 镜像 tag 统一走 `PENPOT_IMAGE_TAG`（`compose.yaml` 与 `prewarm.sh` 读同一
   个变量），升级只改一处。

## 停止

```bash
./scripts/down.sh            # 停止，保留 ./data
./scripts/down.sh --volumes  # 停止并删除命名卷（不可恢复）
```
