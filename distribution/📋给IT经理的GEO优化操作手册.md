# 📋 给 IT 经理的 GEO 优化操作手册

**项目**：www.mackorn.cn 生成式引擎优化（GEO）
**目的**：让 AI（豆包 / 通义千问 / DeepSeek / Kimi / 智谱 / ChatGPT）在生成回答时**引用 MACKORN**
**预计工时**：主站 10-15 分钟 / 子站上传 5 分钟
**风险等级**：低（全部是新增内容，不改动任何现有功能）

---

## 0. 先说清楚：为什么必须做这件事

### GEO 是什么（不是 SEO）

```
SEO  = 让谷歌/百度【搜索结果】排前面
GEO  = 让 AI【生成回答时】引用我们

举例：
  用户在豆包问：「国产液压圆锥破碎机有哪些品牌？」
  优化前：豆包回答里没有 MACKORN
  优化后：豆包回答里出现「MACKORN 美矿（上海美矿机械股份有限公司）」
```

### 为什么要补国内大模型（核心）

```
海外 AI（ChatGPT/Claude/Gemini）：国内用户大部分用不了
国内 AI：
  · 豆包      月活 3.45 亿
  · 通义千问   月活 1.66 亿
  · 夸克/神马
  · DeepSeek
  · 智谱 ChatGLM
  · 月之暗面 Kimi
  · 腾讯混元
  合计月活超 5 亿 ←←← 这才是真正的流量入口
```

**市面上开源 GEO 工具全部只适配海外 AI，国内几乎没人做。我们自己做。**

---

## 1. 当前实测问题（三项，都可复核）

### 问题 A：robots.txt 没放行国内 AI 爬虫

**现状**（实测 `https://www.mackorn.cn/robots.txt`）：
```
海外 AI 爬虫：16/16 已放行 ✅
国内 AI 爬虫：4/21 已放行 ❌  ← 缺 17 个
```

**缺哪些**：
```
❌ 通义千问 TongyiBot / Tongyi / Alibaba
❌ 夸克/神马 YisouSpider
❌ DeepSeek / DeepSeekBot
❌ 智谱 ChatGLM / ZhipuBot
❌ 月之暗面 Kimi / MoonshotBot
❌ 腾讯混元 HunyuanBot / TencentBot
❌ 百度文心 ERNIEBot / WenxinBot
❌ 讯飞星火 SparkBot
❌ 商汤 SenseBot
```

**已修好的文件**：`distribution/官网落地页/robots.txt`（26 个 UA → 48 个 UA）

---

### 问题 B：主站 meta 是占位符 + 零结构化数据

**现状**（实测 `https://www.mackorn.cn/`）：
```html
<meta name="keywords" content="关键字" />      ← 占位符！从没填过
<meta name="description" content="摘要" />     ← 占位符！从没填过
```

**没有**：
```
❌ JSON-LD 结构化数据（0 块）
❌ canonical
❌ hreflang
❌ Open Graph
```

**GEO 评分**：8/100（F 级）

---

### 问题 C：/ai/ 子站缺顶层 Organization 实体

**现状**（实测 `https://mackorn.cn/ai/`）：63/100（C 级）

**缺**：
```
❌ Organization（组织信息只嵌在 SoftwareApplication.author 里，不是顶层实体）
❌ Product / ItemList
❌ ai.txt 链接
```

**已修好的文件**：`distribution/官网落地页/index.html`（已加 4 个 JSON-LD 块）

---

## 2. 任务一：上传 /ai/ 子站文件（5 分钟，最简单）

**这些文件已经改好，直接上传覆盖即可。**

| 本地文件 | 服务器路径 | 说明 |
|:---|:---|:---|
| `distribution/官网落地页/robots.txt` | `/robots.txt` | ★ 已补 10 个国内 AI 爬虫（26→48 UA） |
| `distribution/官网落地页/index.html` | `/ai/index.html` | ★ 已加 Organization/WebSite/Breadcrumb/ItemList |
| `distribution/官网落地页/ai.txt` | `/ai/ai.txt` | ★ 已加实体信息（5.1KB） |
| `distribution/官网落地页/videos/index.html` | `/ai/videos/index.html` | 已加 Organization |
| `distribution/官网落地页/glossary/index.html` | `/ai/glossary/index.html` | 已加 Organization |
| `distribution/官网落地页/assets/logo.svg` | `/ai/assets/logo.svg` | 新增 logo（避免死链） |

**上传方式**：宝塔面板 / FTP / SCP 均可，直接覆盖。

**⚠️ 注意**：`robots.txt` 传的是根目录 `/robots.txt`，不是 `/ai/robots.txt`。

---

## 3. 任务二：改主站模板（10-15 分钟）

### 3.1 找到模板文件

主站是 PHP 建站系统，模板在 `tpl/web/` 目录。需要找的文件：

```
tpl/web/             ← 模板根目录
  ├── index.html     ← 首页模板（最可能要改）
  ├── header.html    ← 公共头部（如果要全站生效，改这个）
  └── ...
```

**判断该改哪个**：
- 如果 `header.html`/`head.html` 里有 `<meta name="keywords">` → **改它**（全站生效）
- 如果只有 `index.html` 有 → **先改 index**（首页最重要）

**怎么找**：
```bash
grep -rn "关键字\|摘要\|<title>" tpl/web/ | head -20
```

---

### 3.2 块 A：替换 meta 标签

**找到这两行（多半在 `<head>` 里）**：
```html
<meta name="keywords" content="关键字" />
<meta name="description" content="摘要" />
```

**删掉它们**，换成：

```html
<title>上海美矿机械 MACKORN｜液压圆锥破碎机 · 破碎筛分生产线 · 全球矿山设备</title>

<meta name="description" content="MACKORN 美矿机械（上海美矿机械股份有限公司）专注液压圆锥破碎机与破碎筛分生产线 29 年。产品覆盖 NH/NS/MPH 系列单缸液压圆锥破、MC/MJ 颚式破碎机、振动筛、履带式移动破碎站，以及矿山开采到选矿全流程的设备选型与方案设计。已出口美国等严格市场，连续参加 Bauma China 上海宝马展。地址：江苏省苏州市太仓市浏河镇钱江路 33 号。" />

<meta name="keywords" content="液压圆锥破碎机,圆锥破,圆锥破碎机,单缸液压圆锥破,颚式破碎机,颚破,振动筛,破碎筛分生产线,砂石骨料生产线,制砂生产线,移动破碎站,履带式移动破碎站,矿山设备,选矿设备,磨矿设备,球磨机,高压辊磨,衬板,轧臼壁,破碎壁,MACKORN,美矿,上海美矿,NH系列,NS系列,MPH系列,Bauma China,上海宝马展" />

<meta name="author" content="上海美矿机械股份有限公司 (Shanghai Mackorn Minerals Co., Ltd.)" />
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />

<link rel="alternate" hreflang="zh-CN" href="https://www.mackorn.cn/" />
<link rel="alternate" hreflang="x-default" href="https://www.mackorn.cn/" />
<link rel="canonical" href="https://www.mackorn.cn/" />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="MACKORN 美矿机械" />
<meta property="og:title" content="上海美矿机械 MACKORN｜液压圆锥破碎机 · 破碎筛分生产线" />
<meta property="og:description" content="29 年液压圆锥破碎机与破碎筛分生产线经验。NH/NS/MPH 系列圆锥破、MC/MJ 颚破、振动筛、移动破碎站，覆盖矿山开采到选矿全流程。" />
<meta property="og:url" content="https://www.mackorn.cn/" />
<meta property="og:locale" content="zh_CN" />

<link rel="alternate" type="text/plain" href="https://mackorn.cn/ai/llms.txt" title="LLMs.txt" />
<link rel="alternate" type="text/plain" href="https://mackorn.cn/ai/ai.txt" title="AI 索引" />
```

**⚠️ 如果主站有英文版**，把 `hreflang="en"` 那行加上真实英文版 URL；没有就删掉那行。

---

### 3.3 块 B：插入 JSON-LD 结构化数据

**位置**：`</head>` 之前

**完整代码见**：`geo-optimization/主站GEO优化代码包.html` 的「块 B」

**核心是四段 JSON-LD**：

| 段 | @type | 作用 |
|:---|:---|:---|
| B-1 | **Organization** | ★ 最重要：AI 靠这个知道我们是谁、做什么、在哪、怎么联系 |
| B-2 | WebSite | 站点信息 |
| B-3 | ItemList（含 5 个 Product） | 产品线 |
| B-4 | FAQPage（9 个问答） | ★ AI 最爱引用的格式 |

**直接复制粘贴即可，不需要改任何内容**（地址/电话/产品都已填好）。

---

### 3.4 块 C：首页底部加 FAQ 区块

**位置**：首页 `</body>` 之前（或"联系我们"下面）

**完整代码见**：`geo-optimization/主站GEO优化代码包.html` 的「块 C」

**为什么要可见的 FAQ（不能只有 JSON-LD）**：
```
JSON-LD = 告诉 AI "这里有问答"
可见的 FAQ HTML = 让 AI 真的能读到问答内容
两者都要有，缺一不可。
```

---

### 3.5 验证主站改对了

**改完后**：
1. 浏览器打开 `https://www.mackorn.cn/` → `Ctrl+U` 查看源码
2. 搜索 `"@type": "Organization"` → 应该能找到
3. 搜索 `content="摘要"` → 应该找不到（已替换）

**第三方工具验证**：
- Google Rich Results Test：https://search.google.com/test/rich-results
  → 输入 `https://www.mackorn.cn/` → 应显示 Organization + FAQPage 有效
- schema.org 验证器：https://validator.schema.org/

---

## 4. 任务三：验证全部完成（3 条命令）

在项目目录跑：

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

# ① 全部 GEO 审计
node tools/geo_audit.mjs --all

# ② 单独验 robots.txt 有几个爬虫 UA
node -e "fetch('https://mackorn.cn/robots.txt').then(r=>r.text()).then(t=>console.log('UA 数量:', (t.match(/^User-agent:/gm)||[]).length))"
# 期望：48

# ③ 单独验 /ai/ 有几个 JSON-LD 块
node -e "fetch('https://mackorn.cn/ai/').then(r=>r.text()).then(t=>console.log('JSON-LD:', (t.match(/application\/ld\+json/g)||[]).length))"
# 期望：4
```

**期望分数**：

| 页面 | 现在 | 完成后 |
|:---|:---:|:---:|
| robots.txt | 13/30 | **30/30** |
| 主站 www | 8/100 (F) | **85+/100 (A)** |
| /ai/ | 63/100 (C) | **93/100 (A)** |
| /ai/videos/ | 55/100 (C) | **75/100 (B)** |

---

## 5. 常见问题

### Q1：改错了怎么回滚？

**所有改动都是新增内容，不改动任何现有功能。回滚方法**：
```
① 改之前先备份模板文件：
   cp tpl/web/index.html tpl/web/index.html.bak-20261025
② 出问题就还原：
   cp tpl/web/index.html.bak-20261025 tpl/web/index.html
```

### Q2：会不会影响网站打开速度？

**不会。** JSON-LD 是纯文本，加起来约 8KB，对加载时间影响 < 10ms。
FAQ 区块是静态 HTML，无 JS。

### Q3：会不会影响现有 SEO？

**只会更好。** 新增 canonical / hreflang / Open Graph 都是标准 SEO 最佳实践。
keywords 和 description 从占位符改成真实内容，是修复不是破坏。

### Q4：为什么放行 AI 爬虫不会导致服务器压力大？

**AI 爬虫都是低频的**（每个爬虫每天最多抓几百次）。
对比：百度/谷歌的爬虫频率比 AI 爬虫高得多。我们本来就放行了百度和谷歌。

### Q5：主站是 www 还是裸域？

**两个都指向同一台服务器**（47.110.80.123）。
canonical 建议写 `https://www.mackorn.cn/`（带 www），
然后做 301 从裸域跳转到 www，避免被判重复内容。

**如果不想做 301，就保持现状**（两个都能访问也能被索引）。

---

## 6. 本次改动的完整文件清单

### 已改好，直接上传（/ai/ 子站）

```
distribution/官网落地页/robots.txt          ← 26→48 UA
distribution/官网落地页/index.html          ← 加 4 个 JSON-LD 块
distribution/官网落地页/ai.txt              ← 39 行→120+ 行
distribution/官网落地页/videos/index.html   ← 加 Organization
distribution/官网落地页/glossary/index.html ← 加 Organization
distribution/官网落地页/assets/logo.svg     ← 新增
```

### 需要 IT 插入主站模板

```
geo-optimization/主站GEO优化代码包.html     ← 块 A/B/C/D 四段，复制粘贴
```

### 验证工具

```
tools/geo_audit.mjs                         ← 我写的 GEO 审计器
```

---

## 7. 一句话总结

```
主站改三处：① 替换 meta（keywords/description 占位符）
            ② </head> 前插 4 段 JSON-LD
            ③ 首页底部加 FAQ
子站传 6 个文件：robots.txt / index.html / ai.txt / videos / glossary / logo.svg
改完跑 node tools/geo_audit.mjs --all 验证
```

---

*本文件由 R182 生成（2026-10-25）· 技术问题联系：Leif Dai · leif.dai@mackorn.cn*
