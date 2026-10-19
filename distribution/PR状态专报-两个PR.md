# 🔍 两个 PR 状态专报（合并版）

> 查证时间：R85–R86
> **一句话结论：两个 PR 都没被拒，都卡在同一个根因上 —— GitHub 仓库是旧版本。**

---

## 〇、先看这张表

| PR | 上游 | 状态 | 卡在哪 | 截止 |
|:---|:---|:---|:---|:---|
| **#15410** | `punkpeye/awesome-mcp-servers`<br>**96,380 stars** | OPEN | Glama 质量分 = `?` | 无 |
| **#6141** | `awesome-dsh-plugin/awesome-dsh-plugin`<br>**18,873 stars** | OPEN<br>标签 `held: author` | 工具数对不上 | ⏰ **2026-10-20** |

**两个都不是"被拒"，是"挂着等我们"** —— 而且**都指向同一件事**。

---

## 一、PR #15410（awesome-mcp-servers，96k stars）

### 维护者的原话（2026-10-09，OWNER punkpeye）

> **Glama quality score not yet set**: The server has been claimed on Glama, but the
> quality score hasn't been evaluated yet (currently showing '?'). …
> **Any grade is fine—it just needs to be set.**
> Once that's resolved, this should be ready to merge.

**解读**：不是要我们拿高分，只是要 Glama **把分评出来**。

### 根因（我实测）

Glama 页面上写着：

```
Responsiveness: Unresponsive       ← 探测我们的服务器【没有响应】
This server cannot be deployed     ← 无法构建可部署镜像
```

而我们的 `package.json`：

```json
"name": "mackorn-cone-crusher",
"bin": { "mackorn-mcp": "plugin/mcp-server.mjs" }
         ↑ bin 名 ≠ 包名
```

**后果**：`npx mackorn-cone-crusher` 找不到可执行文件 →
Glama 起不来我们 → 评不了分 → 分数永远 `?`

**反证（代码没问题）**：

```
node plugin/mcp-server.mjs --list       → exit 0
node plugin/mcp-server.mjs --selftest   → exit 0 · 29 通过 / 0 失败
```

### 已修

| 修复 | 文件 |
|:---|:---|
| `bin` 加包名别名 | `package.json` |
| 新增 Dockerfile | `Dockerfile` |
| 根 `server.json` 对齐真相源 | `server.json` |

---

## 二、PR #6141（awesome-dsh-plugin，18.8k stars）**有截止期！**

### 审核者的原话（2026-10-12，fkysly）

> 这条先没合 —— 条目里写的**工具数量对不上**，其余都对（6 个技能我核过，正好 6 个）。
>
> 条目写 **22 tools**，但仓库里是 **19**：
> - `plugin/index.mjs` 的 `TOOLS` 数组列了 19 个
> - `plugin/mcp-server.mjs` 用的也是同一份
> - 仓库 README 三处都写 19
>
> **两条路，都可以：**
> 1. 把描述里的 **21 改成 19**（就改这一个数字），推一版我马上合；
> 2. 如果 21 是对的 —— 比如你另有 2 个工具没进这个数组，说一声出处，我就按 21 合。
>
> **到 2026-10-20 没有别的消息，我就按代码里的实际数量（19）改掉这一处后收录。**
> 不是驳回，只是要让列表上那行和仓库里真正有的东西一致。

### 🚨 关键推断

**他说 GitHub 仓库里只有 19 个工具** ——
而**我们本地是 22 个**。

**所以 GitHub 上的仓库停留在很旧的版本**，
本地后来加的（`mackorn_knowledge` / `mackorn_distributor_eval` / `mackorn_market_stats` 等）
**从来没推上去**。

### ⏰ 只剩 5 天

```
审核者在等我们回应，截止 2026-10-20。
如果没消息，他会按 GitHub 上的实际数量（19）收录。

后果：列表上永远写着 19 tools，而实际是 22 ——
      正是本项目最忌讳的"硬事实不一致"。
```

### 应对（按优先级）

```
① 【最好】把本地最新代码推到 GitHub（22 tools），
   然后回评论：「仓库已更新到 22 个工具，见 commit xxx」

② 【次好】如果暂时推不了，回评论说明：
   「本地已加到 22，正在同步仓库，请稍等」——
   争取时间，避免他按 19 收录

③ 【兜底】若都做不到，就按他说的把条目改成 19 ——
   但那会让列表长期写错数字，不推荐
```

---

## 三、🎯 共同根因（这才是要解决的）

```
┌─────────────────────────────────────────────────────┐
│  GitHub 仓库停留在【19 个工具】的旧版本              │
│  （本地已 22 个，但本机没有 git，改动从未推上去）     │
└─────────────────────────────────────────────────────┘
          ↓ 导致                              ↓ 导致
   PR #6141 工具数对不上              Glama 评估旧版失败
   （审核者查到 19）                  → PR #15410 卡住
```

**所以：解决这一个问题，两个 PR 都可能通。**

---

## 四、要你做的（按顺序，约 20 分钟）

```
□ 1. 【最关键】把本地最新代码推到 GitHub
     本机没有 git，两条路：
       A. 装 git（https://git-scm.com/download/win）后 push
       B. 用网页上传（拖 distribution\_upload-github\ 整个文件夹）
     ★ 至少要保证：plugin/ 与 README 是最新的（22 tools）

□ 2. 推完后，在两个 PR 下面各回一句：

     PR #6141（紧急，5 天截止）：
       「The repository is now updated — it currently exposes **22 tools**
        (19 at submission time, +3 added since). Please re-check
        plugin/index.mjs. Happy to adjust the entry if you prefer a
        specific number.」

     PR #15410：
       「Glama quality score should now evaluate — the package's `bin`
        name now matches the package name (`npx mackorn-cone-crusher`
        works), and a Dockerfile has been added for reproducible
        deployment. Please take another look.」

□ 3. 去 Glama 点一次重新评估
     https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher
     （Admin 标签页里通常有 Re-evaluate）

□ 4. 检查另一个候选列表（我顺手找到的）：
     dshworks/awesome-dsh-plugins（"Spam-filtered, open-data registry"）
     → 也可以投一次
```

---

## 五、这件事的方法论价值

```
① 【PR 挂着 ≠ 被拒】——
   两个 PR 都是"等投稿人回应"，而不是"内容不够好"。
   读到原话才知道该做什么。

② 【审核者查的是 GitHub，不是你的本地】——
   我们本地 22 个工具、门禁全绿、文档齐全，
   但审核者看到的是 GitHub 上的旧版本。
   ★ 本地做到 100 分，只推到线上 30 分，外面的世界只看到 30 分。

③ 【有 deadline 的 review 要优先处理】——
   #6141 截止 2026-10-20，只剩 5 天。
   错过就永久写成 19 tools。

④ 【两个不同的问题可能是同一个根因】——
   Glama 评不了分 与 工具数对不上，看起来无关，
   实际都是"线上仓库旧"。

⑤ 【这就是"云端继续"的真实价值】——
   如果代码已经在 GitHub 上，云端每 2 小时自动跑验证，
   这两个 PR 的阻塞从一开始就不会存在。
```

---

## 六、一句话总结

> **两个 PR 都活着，都在等我们。**
> **而它们等的是同一件事：把最新的代码推到 GitHub。**
> **#6141 还剩 5 天，优先处理。**

---

*本专报由 R85–R86 实测产生（GitHub API 直查 PR、评论、标签）。*
