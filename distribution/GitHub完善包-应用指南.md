# GitHub 仓库完善包 · 应用指南

> 生成时间：R67–R72
> 适用仓库：`https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher`
>
> **为什么需要你手动执行**：本机没有安装 `git` 和 `gh` CLI，
> 所以我把**所有文件都建好了**，并给出**可直接复制的操作步骤**。
> 全部操作约 15 分钟。

---

## 〇、先看结论：这次要改什么

| 项 | 现在 | 应该改成 | 为什么 |
|:---|:---|:---|:---|
| **仓库描述** | `...19 tools, 6 skills... good quality, reliable, partner for sustainable development.` | 见下方 §1 | ①工具数错（19→22）②"good quality/reliable"是**无法证实的自夸**，会被 AI 与工程师视为营销噪音 ③没提真正的差异化能力 |
| **仓库 Topics** | 未知/较少 | 见 §2 | Topics 是 GitHub 搜索与 AI 收录的重要信号 |
| **社区文件** | 只有 `LICENSE` | + `CONTRIBUTING` / `SECURITY` / `CODE_OF_CONDUCT` / `CITATION.cff` | 缺这些会被判"个人玩具"，且**`CITATION.cff` 直接影响 AI 与学术引用** |
| **Issue 模板** | 无 | + 4 个模板 | 让 issue 带结构化信息（尤其**数据纠错**模板） |
| **示例代码** | 无 | + `examples/`（2 个可直接跑） | 评审者 30 秒看懂；也是最好的"自证" |

---

## 一、改仓库描述（**最高优先，1 分钟**）

### 打开

```
https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
→ 右上角 ⚙️ (About 右侧的齿轮)
```

### 把 Description 换成这一行（**直接复制**）

```
Mining industry cone crusher selection & plant design for AI — 22 MCP tools, MACKORN NH/NS hydraulic cone crushers, aggregate & metal-mine crushing circuits, Whiten-1972 simulation, measured-data calibration, 12 languages, MIT.
```

### 为什么这么写（每条都有依据）

| 短语 | 依据 |
|:---|:---|
| `Mining industry ... for AI` | **行业在前的定位** —— 让找"矿业 AI 工具"的人先命中 |
| `22 MCP tools` | 实际工具数（`plugin/index.mjs` 里 22 个） |
| `NH/NS hydraulic cone crushers` | 真实覆盖范围 |
| `aggregate & metal-mine crushing circuits` | 国内外双市场（骨料 + 金属矿） |
| `Whiten-1972 simulation` | 有文献出处的仿真能力（可验证） |
| `measured-data calibration` | **别人抄不走的部分** |
| `12 languages` | 官网实际支持的语言数 |
| `MIT` | 许可证 |

**删掉了什么、为什么**：

- ❌ `19 tools` → 错的事实，会让 AI 引用到错数字
- ❌ `comparable to Sandvik CH/CS and Metso HP/MP` → **对竞品的比较不做来源标注**，有法律与信誉风险；想表达对标应该放在 README 的**对照矩阵**里，附数据来源
- ❌ `good quality, reliable` → **无法证实**。这个项目的核心纪律就是"不信任自我报告" —— 描述里自夸是自相矛盾
- ❌ `partner for sustainable development` → 与工程工具定位无关，稀释关键词

---

## 二、设置 Topics（1 分钟）

在同一个 About 面板，`Topics` 填这些（GitHub 最多 20 个）：

```
mcp
mcp-server
ai-agent
mining
mineral-processing
comminution
cone-crusher
crusher
aggregate
crushing-plant
mechanical-engineering
engineering-calculator
process-simulation
whiten-model
deepseek-harness
dsh-plugin
industry-plugin
china
open-source
mit-license
```

**注意**：`dsh-plugin` 与 `deepseek-harness` 是**新品类词** ——
现在几乎没有竞争者，先占位。

---

## 三、上传新增文件（10 分钟）

### 要新增的文件（都已建好，位置在本地仓库根目录）

```
CITATION.cff                                  ← 新增（AI/学术引用）
CONTRIBUTING.md                               ← 新增
SECURITY.md                                   ← 新增
CODE_OF_CONDUCT.md                            ← 新增
.github/PULL_REQUEST_TEMPLATE.md              ← 新增
.github/ISSUE_TEMPLATE/config.yml             ← 新增
.github/ISSUE_TEMPLATE/bug_report.yml         ← 新增
.github/ISSUE_TEMPLATE/feature_request.yml    ← 新增
.github/ISSUE_TEMPLATE/data_correction.yml    ← 新增（我们特有）
.github/ISSUE_TEMPLATE/engineering_question.yml ← 新增
examples/quick-start.mjs                      ← 新增（可直接跑）
examples/mcp-client.mjs                       ← 新增（可直接跑）
```

### 上传方式 A：网页拖拽（最省事）

```
1. 打开 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
2. "Add file" → "Upload files"
3. 把上面列的文件拖进去（保持目录结构）
   ⚠️ .github/ISSUE_TEMPLATE/ 的层级要保对，否则模板不生效
4. Commit message 写：
   docs: add community files, issue templates, and runnable examples
5. Commit directly to main
```

### 上传方式 B：如果以后装了 git

```bash
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
git add CITATION.cff CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md \
        .github examples
git commit -m "docs: add community files, issue templates, and runnable examples"
git push origin main
```

---

## 四、验证（3 分钟）

上传后**逐项确认**（不要相信"应该好了"）：

```
□ 仓库首页 About 面板显示 "22 MCP tools"（不是 19）
□ About 面板上能看到 Topics 标签
□ 仓库根目录能看到 CITATION.cff / CONTRIBUTING.md / SECURITY.md / CODE_OF_CONDUCT.md
□ 点 "New issue" → 看到 4 个模板（缺陷/功能建议/数据纠错/工程问题）
□ 建 PR 时描述框自动带出检查清单
□ 下面这条命令能跑通：

    cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
    node examples/quick-start.mjs

  → 应该输出 3 个例子 + 三条硬规矩，退出码 0
```

### CITATION.cff 的特别验证

上传后访问：

```
https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher
→ 右侧边栏会出现 "Cite this repository"
```

**看到这个按钮 = 格式合法**。这对 AI 读懂"该怎么引用我们"很关键。

---

## 五、顺手要修的两件事（**重要**）

### ① 线上端点还是 22 个工具

**实测**（R72）：

```
线上 https://mackorn.cn/ai/api/mcp.php
  → serverInfo: cn.mackorn/mackorn-cone-crusher v0.2.0
  → tools/list: 22 个工具

本地 plugin/index.mjs
  → 22 个工具
```

**缺口**：`mackorn_knowledge`（材料库查询）线上还没有。

**要做的**：把 `distribution/_deploy/` 里的更新包上传到服务器
（`_deploy/` 目录就是为这个准备的，里面有 `ai/api/mcp.php` 与 `_data.php`）。

上传后重跑这个命令验证：

```bash
node examples/mcp-client.mjs --http
# 应该显示 "共 22 个工具"
```

### ② MCP Registry 的描述是旧版

Registry 上 `cn.mackorn/mackorn-cone-crusher` 已发布 4 个版本：

```
v0.0.7 / v0.0.8 / v0.0.9  → 描述写 "19 tools"
v0.2.0                     → 描述写 "22 tools"
```

**而 Registry 的已发布版本是不可变快照** —— 改描述必须发新版本。

**要做的**：升版本到 `0.2.1` 并重新发布（用新描述）。

---

## 六、这次完善背后的原则

不是"为了好看"，每一条都对应一个真实风险：

| 做法 | 防的是什么 |
|:---|:---|
| 描述里删掉自夸词 | 这个项目的**核心纪律是不信任自我报告** —— 描述自夸是自相矛盾；且 AI 与工程师会把它当噪音 |
| 工具数改成 22 | **错的事实**会被 AI 引用出去，污染下游 |
| 加 `CITATION.cff` | 没有它，AI 收录后**不知道该怎么标注出处** —— 等于白发 |
| 加数据纠错 issue 模板 | 我们真实发现过参数表的哨兵值（999 t/h）；**让用户能低成本报错**比等下一个客户撞上强 |
| 加可运行示例 | 示例必须**真跑过**才发 —— 本次就抓到了参数名写错（`target_tph` 应为 `targetTph`） |
| PR 模板带门禁清单 | 本仓库有过"改完文件损坏但所有门禁都绿"的事故，清单强制人跑全套 |

---

## 七、如果你只有 5 分钟

**只做这一件**（收益最大）：

改 §1 的仓库描述。

理由：那是 AI 和工程师**唯一一定会读到**的地方。
现在它写着一个错的工具数（19）和三个无法证实的自夸词。

---

*本指南由 R67–R72 工作产生。相关文件：`CITATION.cff`、`CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`、`.github/ISSUE_TEMPLATE/`、`examples/`*
