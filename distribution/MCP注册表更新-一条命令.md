# MCP Registry 更新 —— 你只需跑一条命令

> 背景：官方 MCP Registry 里我们的条目还是旧的（**0.0.7 / 29 tools / 只有 stdio**）。
> 我已把新版 `server.json` 写好并**通过官方校验**，只差重新登录发布（GitHub OAuth 需要浏览器交互，我做不到）。

---

## 为什么这次更新很重要

| 项 | 旧条目 | 新条目 |
|:---|:---|:---|
| 版本 | 0.0.7 | **0.2.0** |
| 描述 | "29 tools" | **29 tools** |
| **远程端点** | **❌ 无** | **✅ streamable-http** |

**关键在最后一行：**

```
旧条目只有 packages(stdio) —— AI 必须在本机装 Node 才能用我们
新条目加了 remotes(streamable-http) —— 任何 MCP 客户端一个 URL 就能连

这是"能被读"和"能被调用"的分界线。
官方 Registry 是所有 MCP 客户端的发现入口，
加了远程端点 = 打开了一整类只支持远程 MCP 的客户端。
```

---

## 你要做的（1 分钟）

打开 PowerShell，逐行粘贴：

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin\distribution\mcp-publisher"

$env:HOME = "$PWD\_home"
$env:USERPROFILE = "$PWD\_home"

.\mcp-publisher.exe login
```

**会弹浏览器 → 用 GitHub 登录（LeifDai 账号）→ 授权**

然后：

```powershell
.\mcp-publisher.exe validate
.\mcp-publisher.exe publish
```

**看到 `✅ server.json is valid` 和发布成功即可。**

---

## 发完校验（10 秒）

浏览器打开：
```
https://registry.modelcontextprotocol.io/v0/servers?search=mackorn
```

**应看到 `"version": "0.2.0"` 和 `"remotes"` 字段。**

---

## 如果 login 失败

**备选方案：用 GitHub Actions 自动发布**（不需要浏览器）

在仓库 `.github/workflows/publish-mcp.yml` 放：

```yaml
name: Publish to MCP Registry
on:
  workflow_dispatch:
permissions:
  id-token: write
  contents: read
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install mcp-publisher
        run: |
          curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
      - name: Publish
        run: |
          ./mcp-publisher login github-oidc
          ./mcp-publisher publish
```

放到仓库根目录，并确保 `server.json` 也在根目录 → 在 Actions 页面点 Run workflow。

**OIDC 方式不需要浏览器，但要求仓库在 LeifDai 名下**（我们的仓库正是）。

---

## 文件位置

```
D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin\distribution\mcp-publisher\
  ├── mcp-publisher.exe     发布器
  ├── server.json           ← 我已写好并通过校验
  └── _home\...\token.json  旧 token（已过期，login 会覆盖）
```

**server.json 内容（已校验通过）：**

```json
{
  "name": "cn.mackorn/mackorn-cone-crusher",
  "description": "MACKORN hydraulic cone crusher selection and crushing-plant design. 29 tools, callable over HTTP.",
  "title": "MACKORN Hydraulic Cone Crusher Selection",
  "version": "0.2.0",
  "websiteUrl": "https://mackorn.cn/ai/",
  "repository": { "url": "https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher", "source": "github" },
  "remotes": [
    { "type": "streamable-http", "url": "https://mackorn.cn/ai/api/mcp.php" }
  ],
  "packages": [
    { "registryType": "npm", "identifier": "mackorn-cone-crusher", "version": "0.2.0", "transport": { "type": "stdio" } }
  ]
}
```

---

## 一句话

```
我已把新条目写好并通过官方校验，
只差你登录一次 GitHub（我做不到浏览器交互）。
跑 3 条命令，我们的远程 MCP 端点就进了官方注册表。
```
