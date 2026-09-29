# 连接 Penpot MCP 指南

## 1. 前置：本地 Penpot 部署

部署栈**随本技能自带**：`assets/penpot-server/`（compose 栈 7 服务：penpot-{frontend,backend,exporter,mcp,postgres,valkey} + caddy，Penpot 2.17，Caddy 在 `https://penpot.local` 终止 HTTPS）。完整说明见 `assets/penpot-server/README.md`。

> **为什么没有绝对路径**：栈根目录由 `assets/penpot-server/scripts/lib.sh` 从脚本自身位置反推（`BASH_SOURCE` + 逐级解析符号链接，兼容无 `readlink -f` 的 macOS），`compose.yaml`/`caddy/Caddyfile`/`data/` 全部相对推导。所以把 `assets/penpot-server/` 整目录拷到 `~/penpot`、`/srv/penpot` 或 CI workspace 都一样跑，不用改任何路径。下文的 `$STACK` 指栈目录（默认 = `<SKILL_DIR>/assets/penpot-server`，`<SKILL_DIR>` = 本技能 `SKILL.md` 所在目录）；只剩 `/etc/hosts`、`/usr/local/share/ca-certificates`、`/etc/environment`、`$HOME` 信任库这些"每台机器都固定"的绝对路径。

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
- **CA 每栈独立**：`$STACK/data/caddy/pki` 在首次启动时生成，换栈目录/重新拷一份 = 换 CA，浏览器与客户端仍信任旧的就会报错（不是脚本坏了）。解法见 `assets/penpot-server/README.md`「换目录 / 新克隆后浏览器报证书错误」：沿用旧 PKI，或重跑 `trust-ca.sh` 并重启浏览器。
- 端点走 Caddy 自签 TLS。Node/Electron 客户端不读系统证书库，必须设置（脚本自动写四处，第二条仅用于手动复核/指定）：

```bash
"$STACK/scripts/trust-ca.sh"   # 系统 OpenSSL 库 + NSS(Chrome/Edge/Playwright) + Firefox + NODE_EXTRA_CA_CERTS
# 脚本会自动写入 ~/.zshenv、~/.bashrc、/etc/environment；手动指定时：
export NODE_EXTRA_CA_CERTS="$STACK/data/caddy/pki/authorities/local/root.crt"
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
