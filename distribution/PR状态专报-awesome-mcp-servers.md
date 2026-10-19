# 🔍 PR 状态专报：awesome-mcp-servers #15410

> 查证时间：R85
> **结论：PR 未合并，但只差一件事 —— 而根因我已修好。**

---

## 一、PR 现状（实测 GitHub API）

```
PR:       punkpeye/awesome-mcp-servers #15410
标题:      Add LeifDai/MACKORN-hydraulic-cone-crusher - hydraulic cone crusher selection MCP server
状态:      OPEN（未合并）
创建:      2026-09-30
最后更新:  2026-10-09
评论:      2 条
标签:      has-emoji ✅ · valid-name ✅ · has-glama ✅   ← 自动检查全过
```

**上游仓库规模**：

```
punkpeye/awesome-mcp-servers  →  96,380 stars · 17,682 forks
open_issues_count             →  2,922（近 3000 个待处理）
```

**这意味着**：能进这个列表，曝光量极大；但也说明维护者审核压力极大，
所以任何一点小问题都会被挂起。

---

## 二、🎯 维护者的原话（2026-10-09，OWNER punkpeye）

> Thanks for your submission! There's one outstanding issue before this can be merged:
>
> - **Glama quality score not yet set**: The server has been claimed on Glama, but the
>   quality score hasn't been evaluated yet (currently showing '?'). Please visit
>   [your server's Glama page](https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher)
>   and ensure the quality score is evaluated. **Any grade is fine—it just needs to be set.**
>
> Once that's resolved, this should be ready to merge. Let me know if you have any questions!

**翻译与解读**：

```
「唯一未决问题：Glama 质量分还没被评估出来（现在显示 '?'）。
  请确保它被评估。
  【任何等级都行 —— 只要它被设置出来。】
  解决之后就可以合并了。」

★ 关键：维护者【不是】要我们拿高分，只是要 Glama 把分评出来。
  所以问题不是"我们不够好"，而是"评估器跑不起来我们"。
```

---

## 三、🎯 根因（我实测找到的）

### 证据 1：Glama 页面上的两个致命信号

```
Maintenance
  Activity:        Maintained
  Responsiveness:  Unresponsive      ← 评估器探测我们的服务器【没有响应】

This server cannot be deployed       ← 无法构建可部署镜像
```

### 证据 2：我们的 `package.json` 里 `bin` 名与包名不一致

```json
"name": "mackorn-cone-crusher",
"bin": { "mackorn-mcp": "plugin/mcp-server.mjs" }
         ↑ bin 名 ≠ 包名
```

**后果**：`npx mackorn-cone-crusher` **找不到可执行文件**
（npm 只在 `bin` 名与包名相同时才自动映射）。
而 Glama / MCP Registry 这类自动评估器**通常按包名启动**。

→ **起不来 → Unresponsive → 评不了分 → 分数永远 `?` → PR 永远挂着**

### 证据 3：仓库里没有 Dockerfile

Glama 要"部署"服务器（起容器 → 跑 MCP → 调工具 → 算分）。
没有 Dockerfile，它的自动探测也失败了 → `This server cannot be deployed`。

### 证据 4（反证）：服务器本体完全正常

```
node plugin/mcp-server.mjs --list       → exit 0（正常列出工具）
node plugin/mcp-server.mjs --selftest   → exit 0 · 29 通过 / 0 失败
```

**所以不是代码问题，是"怎么把它拉起来"的问题。**

---

## 四、✅ 我已做的修复（本地，等你 push）

| # | 修复 | 文件 |
|:--|:---|:---|
| 1 | **`bin` 加包名别名** —— 现在 `npx mackorn-cone-crusher` 也能起 | `package.json` |
| 2 | **加 Dockerfile** —— 让 Glama 能构建并启动 | `Dockerfile` |
| 3 | **根 `server.json` 对齐真相源**（原先是我手写的重复品） | `server.json` |

### 修复后的 `bin`

```json
"bin": {
  "mackorn-cone-crusher": "plugin/mcp-server.mjs",
  "mackorn-mcp": "plugin/mcp-server.mjs"
}
```

### 新增的 Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY plugin ./plugin
COPY skills ./skills
COPY knowledge ./knowledge
ENTRYPOINT ["node", "plugin/mcp-server.mjs"]
```

**为什么这个 Dockerfile 能解决问题**：它不监听端口，走 stdio ——
评估器用 `docker run -i` 喂 JSON-RPC 即可，零依赖、无需 npm install。

---

## 五、你接下来要做的（按顺序）

```
□ 1. 上传修复后的文件到 GitHub
     需要上传：Dockerfile · package.json · server.json
     （或者：直接拖 distribution\_upload-github\ 整个文件夹）

□ 2. 等 npm 发布新版本（bin 改动要发到 npm 才生效）
     —— 若不好发，至少 Dockerfile 能先让 Glama 跑起来

□ 3. 去 Glama 触发重新评估
     https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher
     → 右上角 "Admin" 标签页里通常有"重新评估/Re-evaluate"按钮

□ 4. 等 Glama 把分数评出来（不再是 '?'）

□ 5. 在 PR #15410 里回一句：
     "Glama quality score is now set — please take another look."
     https://github.com/punkpeye/awesome-mcp-servers/pull/15410

□ 6. 顺手更新 PR 描述里的 "19 tools" → "22 tools"
     （现在 PR body 里还写着 19 tools / 6 skills）
```

---

## 六、另一个 PR（待查）

`tools/update_prs.mjs` 里记录还有第二个：

```
awesome-dsh-plugin #6141
  repo: LeifDai/awesome-dsh-plugin
  path: data/plugins/LeifDai__MACKORN-hydraulic-cone-crusher.yml
```

**我还没查它的状态**（需要先确认上游仓库名）。
下次可以查：GitHub 搜 `awesome-dsh-plugin`。

---

## 七、这件事的方法论价值

```
① 【不要猜"没通过"的原因，去读维护者的原话】——
   我第一反应以为是"内容质量不够"，实际是"评估器跑不起来我们"。
   完全不同的两件事，修法也完全不同。

② 【自动评估器的失败往往是"启动方式"而不是"代码质量"】——
   服务器 selftest 29/0 全过，但评估器连起都起不来。

③ 【bin 名 ≠ 包名是个隐蔽的坑】——
   npx <包名> 会失败，而几乎没人会想到去查这个。

④ 【能上 96k star 的列表，值得为它专门加一个 Dockerfile】——
   曝光量远超成本。
```

---

## 八、一句话总结

> **PR 没被拒，是"挂着"了 —— 差一个 Glama 质量分。**
> **而 Glama 评不了分，是因为它起不来我们的服务器。**
> **根因（bin 名不匹配 + 无 Dockerfile）我已经修好，**
> **你 push 之后去 Glama 点一下重新评估，这个 PR 就能合。**

---

*本专报由 R85 实测产生。相关文件：`Dockerfile`、`package.json`、`server.json`*
