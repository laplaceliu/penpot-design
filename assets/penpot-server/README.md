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

- Docker Engine + compose 插件（`docker compose` v2）。脚本也兼容 v1 的
  `docker-compose`。
- 首次启动需要写 `/etc/hosts`（把 `penpot.local` 指到 `127.0.0.1`），脚本会
  自动 `sudo` 追加；没有 sudo 权限时会打印出需要手动添加的那一行并继续。

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
