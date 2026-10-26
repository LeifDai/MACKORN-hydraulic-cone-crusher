# 🚀 把代码推到 GitHub（不需要 git，2 分钟）

> 本机没有 git、没有 gh、也没有 GitHub 凭据。
> 所以我写了一个**用 GitHub API 直传**的工具：`tools/push_via_api.mjs`
>
> **你只需要一个 token，其它都我准备好了。**

---

## 一、为什么不用 git

```
本机现状：
  git        ❌ 没装（winget 也不可用）
  gh CLI     ❌ 没装
  凭据       ❌ 环境变量 / 凭据管理器 / hosts.yml 全无

所以我改用 GitHub 的 Contents API —— 只要有 token，
一个 Node 脚本就能把 28 个文件全部传上去，不用装任何东西。
```

---

## 二、你只需要做三步

### 第 1 步：创建一个 token（30 秒）

打开：

```
https://github.com/settings/personal-access-tokens/new
```

填：

```
Token name:        mackorn-push（随便起）
Expiration:        7 days（够用就行）
Repository access: Only select repositories
                   → 选 LeifDai/MACKORN-hydraulic-cone-crusher
Permissions:       Repository permissions
                   → Contents = Read and write   ★ 只勾这一个就够
```

点 **Generate token**，复制（`github_pat_` 开头）。

### 第 2 步：二选一执行

**方案 A（推荐，token 不留在命令历史里）**

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
$env:GITHUB_TOKEN="把token粘在这里"
node tools/push_via_api.mjs --write
```

**方案 B（一条命令）**

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
node tools/push_via_api.mjs --write --token github_pat_xxxxx
```

### 第 3 步：看结果

```
成功会逐个打印：
  🆕 CITATION.cff
  🔄 .github/workflows/nightly-self-iteration.yml
  ...
  ✅ 成功 28（新增 25 · 更新 3）
```

然后打开 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher 确认。

---

## 三、这个工具会传什么（28 个文件）

| 类别 | 文件 |
|:---|:---|
| **社区文件** | `CITATION.cff` · `CONTRIBUTING.md` · `SECURITY.md` · `CODE_OF_CONDUCT.md` |
| **Issue 模板** | `.github/ISSUE_TEMPLATE/` 下 5 个（含**数据纠错**模板） |
| **PR 模板** | `.github/PULL_REQUEST_TEMPLATE.md` |
| **示例** | `examples/quick-start.mjs` · `examples/mcp-client.mjs` |
| **云端** | `.github/workflows/nightly-self-iteration.yml` |
| **Glama 修复** | `Dockerfile` · `package.json` · `server.json` |
| **校验工具** | `tools/` 下 5 个（CITATION 校验 / 跨表一致性 / 哨兵值扫描 / 硬事实同步 / 门禁） |
| **测试** | `tests/negative/hardfact_sync_negative_controls.mjs` |
| **文档** | `distribution/` 下 6 份（含两份 PR 专报） |

**安全性**：
- 已跑合规门禁（零命中）—— 没有本地绝对路径、客户名、价格、密钥
- token **不落盘、不打印**
- 默认是**预演模式**，加 `--write` 才真写
- 每个文件都带 commit message，出问题可逐个回滚

---

## 四、⚠️ 推完之后立刻做（PR 在等）

```
□ 1. 回 PR #6141（⏰ 截止 2026-10-20，只剩 5 天）
     https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6141

     贴这段：
     ─────────────────────────────────────────
     The repository is now updated. It currently exposes **22 tools**
     (19 at submission time; +3 added since — mackorn_knowledge,
     mackorn_distributor_eval, mackorn_market_stats).

     You can verify with:
       node plugin/mcp-server.mjs --list

     Thanks for catching the mismatch — the entry was written against a
     stale count.
     ─────────────────────────────────────────

□ 2. 回 PR #15410
     https://github.com/punkpeye/awesome-mcp-servers/pull/15410

     贴这段：
     ─────────────────────────────────────────
     The Glama evaluation blocker should now be resolved:
       · package.json `bin` now includes the package name itself, so
         `npx mackorn-cone-crusher` works (previously only `mackorn-mcp`
         was registered);
       · a Dockerfile has been added so the server can be built and
         started reproducibly.

     Please re-trigger the Glama evaluation when you have a moment.
     ─────────────────────────────────────────

□ 3. 去 Glama 点一次重新评估
     https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher
     （Admin 标签页里通常有 Re-evaluate）
```

---

## 五、如果你不想创建 token

那就用**网页拖拽**（原方案）：

```
1. 打开 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
2. "Add file" → "Upload files"
3. 打开文件夹：distribution\_upload-github\
4. 把里面【所有内容】拖进上传框
5. Commit message:
   docs: add community files, issue templates, runnable examples, and cloud checks
6. "Commit directly to the main branch" → Commit changes
```

**两条路效果一样**，选你方便的。

---

## 六、好消息：这两个 PR 卡的不是代码质量

```
我实测过：
  node plugin/mcp-server.mjs --selftest   → 29 通过 / 0 失败
  node tests/run.mjs                      → 104 通过 / 0 失败
  门禁 L2                                 → 29 / 29
  十三维自检                              → 100 / 100

代码是好的。
卡住的原因是【GitHub 上那份还是旧的】——
而这件事，5 分钟就能解决。
```

---

*本文件由 R87 生成。配套工具：`tools/push_via_api.mjs`*
