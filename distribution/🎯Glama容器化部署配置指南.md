# 🎯 Glama 容器化部署配置指南（照做 5 分钟）

> 生成：2026-10-22 17:45（R144）
> **重大发现：Glama 的 Release 不需要我们的 HTTPS 端点，它自己构建 Docker 镜像跑我们的 server。**
> 所以 SSL 证书和 Glama 的 Release 是**两件独立的事** —— 现在就能做！

---

## 一、为什么这条路径能绕开 SSL

Glama 官方文档（`https://glama.ai/blog/2026-03-15-how-to-make-a-release`）原文：

> **"A Glama release is not a GitHub release. It is a containerized build of your MCP server
> that Glama uses to run security checks and to let users deploy the server."**

**这意味着**：

```
❌ 不需要：Glama 探测我们的 https://mackorn.cn/ai/api/mcp.php
✅ 只需要：Glama 能 docker build 我们的仓库 + docker run -i 启动 MCP server

所以 SSL 证书过期【不会阻塞】Glama Release。
```

**我之前判断错了** —— 一直以为 "cannot be deployed" 是 SSL 探测失败导致的。
实际是**我们从来没做过 containerized release**。

---

## 二、我已经准备好的东西（不用你改）

| 文件 | 状态 | 作用 |
|:---|:---|:---|
| `Dockerfile` | ✅ 已重写（英文注释，避免编码风险） | Glama 用它构建镜像 |
| `.dockerignore` | ✅ 新建 | 把构建上下文从 20MB+ 压到 ~0.6MB |
| `glama.json` | ✅ 新建 | 声明维护者（Glama 认领用） |
| `package.json` files | ✅ 已含三个文件 | 确保进 npm 包 |
| `check_publish_artifact` | ✅ 加了 8 项检查（70/0 全过） | 防回归 |

### 关键优化：`.dockerignore` 排除了 `knowledge/_refs/`

```
knowledge/_refs/ = 19.59 MB
  其中 17.48 MB 是 40 张报价截图 PNG（还违反 No pricing 规则）
  1.87 MB 是 JPG
  0.15 MB 是 1 个 pptx

✅ 已验证：移走 _refs 后 selftest 依然 36 通过 / 0 失败（运行时不依赖它）

镜像大小：20MB → ~0.6MB
```

---

## 三、你要做的 5 个步骤

### 前置检查（1 分钟）

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

# 确认三个文件都在
Test-Path Dockerfile, .dockerignore, glama.json
# 期望：三个 True
```

### 步骤 1：打开 Glama 的 Dockerfile 管理页

```
https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher/admin/dockerfile
```

⚠️ **前提**：你必须是这个 server 在 Glama 上的 **maintainer**。
如果还没认领，先去 **Score 标签页** 认领（`https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher/score`，看页面里的 FAQ）。

### 步骤 2：配置 build spec

在 admin 页面填写：

```
┌─ Build spec ─────────────────────────────────────┐
│                                                   │
│  Dockerfile path:   Dockerfile                    │
│  Build context:     .                             │
│                                                   │
│  ── CMD arguments ──                              │
│  留空（我们的 ENTRYPOINT 已经是 node plugin/mcp-server.mjs）│
│                                                   │
│  ── Environment variables schema ──               │
│  留空（我们的 server 不需要任何环境变量/API key）   │
│                                                   │
│  ── Placeholder parameters ──                     │
│  留空                                             │
│                                                   │
└───────────────────────────────────────────────────┘
```

**为什么都留空**：
我们的 MCP server 是**纯本地零依赖**的，不需要：
- ❌ API key
- ❌ 数据库连接
- ❌ 环境变量
- ❌ 端口（stdio 通信）

### 步骤 3：点击 **Deploy**（触发构建测试）

```
Glama 会：
  ① docker build 我们的 Dockerfile
  ② 启动容器
  ③ 用 docker run -i 喂 JSON-RPC 握手
  ④ 验证 tools/list 能列出 29 个工具

如果成功 → 出现 "Build test succeeded"
如果失败 → 看错误日志（见下面「排错」）
```

### 步骤 4：点击 **Make Release**

```
构建测试成功后：
  在测试列表点「Make Release」
  或点进测试详情页点「Create Release」
```

### 步骤 5：填版本号 + 发布

```
版本号：0.2.2（与 npm 一致）
Changelog（可选）：
  Initial containerized release.
  - 29 MCP tools covering mining → crushing → screening → grinding →
    beneficiation → automation → full-chain selection
  - Zero external dependencies (Node.js built-ins only)
  - Whiten (1972) + Bond (1952) models
  → 点「Create & Publish Release」
```

### 完成后会发生什么

```
✅ Glama 对镜像跑安全扫描
✅ 用户可以一键从 Glama 部署我们的 server
✅ 我们的 server 拿到 A 级质量分   ← 关键！
✅ PR #15410（awesome-mcp-servers）的合并阻塞被解除
```

---

## 四、排错

| 现象 | 原因 | 怎么修 |
|:---|:---|:---|
| `Build failed: COPY failed` | 某个 COPY 的路径不存在 | 跑 `node tools/check_publish_artifact.mjs` 看哪个文件缺 |
| `Build failed: out of context` | 构建上下文太大 | 确认 `.dockerignore` 已生效（应 <1MB） |
| `Container exited immediately` | ENTRYPOINT 路径错 | 确认 `plugin/mcp-server.mjs` 存在且可跑 |
| `tools/list returned 0 tools` | server 启动失败 | 本地跑 `node plugin/mcp-server.mjs --list` 验证 |
| `cannot find module` | 某文件没被 COPY | 检查 Dockerfile 的 COPY 清单 |
| 构建超时 | 镜像太大 | 确认 `_refs/` 被排除 |

### 本地无法验证（我没装 Docker）

```
❌ 本机没有 docker（实测 Get-Command docker → 未安装）
✅ 但我做了替代验证：
   · Dockerfile 里 4 条 COPY 的路径全部存在
   · ENTRYPOINT 文件存在
   · knowledge/_refs 移走后 selftest 依然 36/0（证明不依赖它）
   · knowledge/ 里只有 .md/.json（0.6MB）会被打进镜像
```

**所以只能靠 Glama 的构建测试来最终验证。** 如果它失败，把错误日志给我，我按日志修。

---

## 五、如果 Glama 要求 `glama.json` 的其他字段

我们已经按真实样例建了：

```json
{
  "$schema": "https://glama.ai/mcp/schemas/server.json",
  "maintainers": ["LeifDai"]
}
```

**来源**：解码自 `ariekogan/ateam-mcp` 的真实 `glama.json`（不是猜的）。

如果 Glama 报 "invalid glama.json"，把报错发我，我按 schema 补。

---

## 六、这条路径的价值（为什么值得做）

```
✅ 绕开 SSL 阻塞 —— 不用等证书修好就能拿质量分
✅ 一次解锁 3 个平台：
   · Glama 质量分 A
   · awesome-mcp-servers PR #15410 可以合并
   · Glama 上用户可一键部署（实际获客）
✅ 提升 AI 可发现性 —— A 级评分在 Glama 的排序里权重高
```

---

## 七、一句话

```
三个文件我已经备好了。你只需要：
  打开 Glama admin 页面 → 配置留空 → Deploy → Make Release → 填 0.2.2 → 发布
5 分钟。不需要等 SSL。
```

---

*本文件由 R144 生成（2026-10-22 17:45）。工具：`node tools/check_publish_artifact.mjs`*
