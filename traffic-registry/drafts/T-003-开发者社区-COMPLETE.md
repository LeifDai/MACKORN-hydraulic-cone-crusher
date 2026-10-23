# 我们给 AI 插件做「可发现性」踩的四个坑：DNS、SSL、容器化，以及「写了 ≠ 发出去了」

> 发布平台：DEV.to / Hacker News / V2EX / 掘金
> 选题：T-003 · 状态：drafted · 字数约 2400
> 所有数字与事件均可在 `github.com/LeifDai/MACKORN-hydraulic-cone-crusher` 的提交历史和工具输出中复现

---

我们做了一个 MCP server —— 一个把矿业设备选型经验编码成 29 个工具的开源插件。它跑得挺好：1300 多条测试断言全绿，5 个负控测试全部按预期报警，`npx` 一条命令就能装。

然后我们发现：**几乎没有 AI 知道它存在。**

接下来三周，我们以为问题是「没提交到足够多的目录」。第四周才意识到，问题完全是另一回事。这篇把四个坑写清楚，因为其中三个是任何做 MCP server（或者任何想让 AI 找到的产品）的人都会撞上的。

---

## 坑一：以为没被收录，其实早收录了

我们的第一反应很朴素：去做一个「收录检测」。手写了 18 个 MCP 目录的探测脚本，跑完傻眼了：

```
✅ Official MCP Registry    HTTP 200
✅ npm registry             HTTP 200
✅ Glama                    HTTP 200
✅ Smithery                 HTTP 200
✅ skills.sh                HTTP 200
✅ awesome-dsh-plugin       PR #6141 已合并

❌ mcp.so                   HTTP 404
❌ MCP-X                    页面无记录
❌ MCPList                  HTTP 404
❌ Claude Connectors        未提交
```

**我们早在官方 MCP Registry、Glama、Smithery 上了。** 之前三周一直在「准备提交材料」，而材料早就没必要了。

真正的结论不是「6 个没收录」，而是「**我们为什么要假设自己没被收录？**」

> 教训：先测量，再行动。「让 AI 收录我们」的第一步不是提交，是查清现状。

---

## 坑二：把 DNS 故障误判成 SSL 故障，连判三天

这是最贵的一个坑。

我们的官网域名 `mackorn.cn` 在几个平台的探测里一直被判定为「不可用」。我们看到的错误是：

```
CERT_HAS_EXPIRED
```

于是我们断定：SSL 证书过期了。证书确实过期了（2026-10-14），所以这个判断看起来完全自洽。我们写了一份「证书续期 5 分钟手册」，连续三天在交接文档里写「唯一阻塞：SSL 证书」。

第四天，我把检查拆成两步跑：

```js
// 步骤 1：只查 DNS
import { lookup } from 'node:dns/promises';
await lookup('mackorn.cn', { family: 4 });
// → ❌ ENOTFOUND

// 步骤 2：只查 TLS（跳过证书校验，只看能不能握手）
import { connect } from 'node:tls';
connect({ host: '47.110.80.123', port: 443, servername: 'mackorn.cn', rejectUnauthorized: false });
// → ✅ 成功了，返回一张过期的证书
```

**这时候才看清是两件独立的事：**

```
mackorn.cn      → ENOTFOUND（裸域没有 A 记录）
www.mackorn.cn  → 47.110.80.123（正常），但证书过期
```

`fetch()` 把这两个失败模式都归一成了同一个异常。我们一直在修「证书」，而裸域在 DNS 阶段就死了 —— 证书修好了也照样打不开。

更讽刺的是：**第二天晚上，裸域的 A 记录自己恢复了。** 我们从来没有真正需要改 DNS。

> 教训：诊断网络问题时，DNS 层和 TLS 层必须分开测。
> `ENOTFOUND` 和 `CERT_HAS_EXPIRED` 是两个不同的问题，不是一个问题的两种说法。

后来我们把这条写成了代码里的一个检查器，专门避免复发：

```bash
node tools/cert_monitor.mjs
# ── ① DNS ──
# ✅ mackorn.cn          47.110.80.123
# ✅ www.mackorn.cn      47.110.80.123
# ── ② SSL 证书 ──
# 🔴 ★ 已过期 8 天 —— 立即续期
```

**分开显示，才不会再一次把两件事混成一件。**

---

## 坑三：Glama 的「cannot be deployed」不是探测失败，是它要你自己构建容器

Glama 是我们的 server 页面里一个奇怪的存在：页面存在，工具数显示（当时是 19，实际 29），但状态是：

```
cannot be deployed
Responsiveness: Unresponsive
Quality: ?
```

我们理所当然地认为：它探测我们的 `https://mackorn.cn/ai/api/mcp.php` 失败了，所以「不能部署」。

于是我们花了很久想「怎么让端点能被探测到」—— 包括修 DNS、修证书。

**全错了。**

Glama 的官方博客写得很清楚（2026-03-15 *How to make a release*）：

> "A Glama release is not a GitHub release. **It is a containerized build of your MCP server** that Glama uses to run security checks and to let users deploy the server."

也就是说：**Glama 自己 `docker build` 你的仓库，`docker run -i` 喂 JSON-RPC，验证你的 server 能不能启动、能不能列工具。它根本不需要访问你的网站。**

`cannot be deployed` 的真实含义是：**你还没做过 containerized release。**

而做 release 需要三样东西，我们只有一样：

```
✅ Dockerfile            （有了，但注释是中文 —— 构建时的编码风险）
❌ .dockerignore         （没有 → 构建上下文包含 dist/ 20MB+ 和几十张截图）
❌ glama.json            （没有 → 声明不了 maintainer）
```

补上之后还发现一个更实质的问题：我们的 `knowledge/` 目录有 **20.13 MB**，其中 **19.59 MB 是 `_refs/`** —— 40 张 PNG（17.48 MB）和 8 张 JPG（1.87 MB），都是报价截图。

两个问题：

1. **镜像会很大**（Glama 的构建有资源限制）
2. **报价截图不该进公开镜像**（合规问题）

先验证一件事：运行时到底需不需要 `_refs/`？

```bash
# 临时移走 _refs，跑自检
mv knowledge/_refs /tmp/_refs_bak
node plugin/mcp-server.mjs --selftest
# → 结果：36 通过 / 0 失败
mv /tmp/_refs_bak knowledge/_refs
```

**不需要。** 写进 `.dockerignore`：

```
knowledge/_refs/
knowledge/**/*.png
```

镜像从 20 MB 降到 **约 0.6 MB**。

> 教训：当平台给出一个模糊的失败状态（"cannot be deployed"），先去找它的**文档里怎么定义 release**，而不是猜它在测什么。

---

## 坑四：「写了」不等于「发出去了」

这是最难发现的一个，因为它不报错。

我们的发布流程是：源码 → `build_public.mjs` → `dist/` → npm 包 + GitHub 上传包。所有门禁当时全绿。

直到有一天我做了个「发布产物验收」检查，把 `dist/` 和「应该在里面的东西」逐一比对：

```
dist/mackorn-cone-crusher/
  ✅ Dockerfile
  ✅ server.json
  ✅ package.json
  ✅ README.md
  ✅ llms.txt
  ❌ AGENTS.md      ← 上周写的 AI 说明书
  ❌ QUICKSTART.md  ← 一键使用说明
  ❌ smithery.yaml  ← Smithery 配置
```

**三个文件都写了，但从来没有进过发布包。**

原因：新增一个"要发布的文件"，必须同时改三处：

```
① package.json 的 files 字段
② build_public.mjs 的放行清单
③ 验收器的检查项
```

我们改了三处中的零处。

更早之前，`Dockerfile` 也踩过完全一样的坑 —— 写了，但 `build_public.mjs` 的放行清单漏了它，所以从没进过 `dist/`。而**当时所有门禁都是绿的**，因为没有任何门禁在看这件事。

> 教训：「写了 ≠ 发出去了」。
> 任何交付物都要有门禁检查**最终产物**，而不是检查源码意图。
> 检查源码的门禁，对「没被复制到产物里」这件事完全无感。

现在我们的验收器有 70 条检查，其中一条专门盯这个：

```
ok  发布包含 AGENTS.md（AI 可发现性文件）  true
ok  发布包含 QUICKSTART.md（AI 可发现性文件）  true
ok  Glama 容器化文件 Dockerfile  true
ok  Glama 容器化文件 .dockerignore  true
ok  Glama 容器化文件 glama.json  true
```

---

## 三个可迁移的结论

### 1. 先测量，再行动

我们花三周准备「提交材料」，而 6 个平台早就收录了我们。真正该做的第一件事是写一个探测脚本。

### 2. 模糊的失败状态要拆开看

`fetch()` 把 DNS 失败和证书失败归成一个异常；平台把「没做 release」和「端点不可达」归成一个状态。**只要一个错误可能对应多种原因，就必须分开测每一层。**

### 3. 「写了」和「发出去了」是两件事，而门禁只查前者时会全绿

这条适用于任何有构建/发布流程的项目。**检查最终产物，不要检查源码意图。**

---

## 补充：我们后来还发现的一个坑（留给下篇）

在我们修完上述问题后，还发现了一个更隐蔽的问题：我们写的「语法检查闸门」，它的负控测试**从来没有跑通过** —— 因为它把路径写错了（`join(HERE, 'syntax_gate.mjs')`，而文件在 `tools/` 不在 `tests/negative/`），一直报 `Cannot find module`，然后被当成「闸门有效」。

一个坏掉的负控测试，会让「我们有负控」变成假信号。

这个值得单独写一篇。

---

*项目：https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher*
*工具：`node tools/cert_monitor.mjs` · `node tools/check_publish_artifact.mjs` · `node tools/recurrence_tracker.mjs`*
*License: MIT*

---

## 发布前检查清单

- [x] 每个数字都有出处（都能在仓库的 tools/ 输出里复现）
- [x] 没有编造的数据
- [x] 没有泄露 MACKORN 定价（只提到「报价截图不该进公开镜像」，没提任何价格）
- [x] 文献值标明是文献值（Whiten 1972 / Bond 1952 只提到不引用具体数值）
- [x] 未知的写「未知」
- [x] 语气符合开发者社区（第一人称，承认错误）
- [x] 没违反平台规则（没有营销词，没有号召）
- [x] 标题吸引人，内容兑现了标题

## 发布后记录

```bash
node tools/traffic_engine.mjs --record --topic T-003 --platform "DEV.to" --url <发布后的URL>
```
