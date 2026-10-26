# 操作说明书 SOP · 全部待办事项

> **写给谁**：不熟悉计算机操作的同事。
> **说明**：本文覆盖 4 件事。第 2 件（旧链接跳转）有单独详细文档：
> `04_AI收录与分发\SOP-旧链接跳转操作说明.md`

---

# 总览：你要做的 5 件事

| 序号 | 事情 | 耗时 | 难度 | 有无风险 | 文档 |
|:---|:---|:---|:---|:---|:---|
| **1** | 上传新版部署包 | 5 分钟 | ★ | 无 | 本文 §一 |
| **2** | 旧链接跳转 | 15 分钟 | ★★ | 方案A无风险 | **单独文档** |
| **3** | Cloudflare 加速 | 15 分钟 | ★★ | 无 | 本文 §三 |
| **4** | Google Search Console | 10 分钟 | ★★ | 无 | 本文 §四 |
| **5** | 百度站长平台 | 10 分钟 | ★★ | 无 | 本文 §五 |

**建议顺序**：1 → 2 → 3 → 4 → 5（先做完 1 和 2，网站就正常了；3/4/5 是加速收录）

---

# 一、上传新版部署包（5 分钟 · 无风险）

**目的**：把网站内容从"散在根目录"改成"全部收进 /ai/ 子目录"，并修复 MCP 端点的 500 错误。

## 文件在哪
```
D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin\distribution\官网部署包.zip
（92 条目 / 438 KB）
```

## 怎么传（和你上次一样的方式）

**如果你用网页面板：**
```
① 登录面板 → 文件管理 → 进入网站根目录
② 上传 官网部署包.zip
③ 右键该 zip → 解压到当前目录
④ 弹出「文件已存在，是否覆盖」→ 选「全部覆盖 / 是」
⑤ 解压完删掉 zip
```

**如果你用 FileZilla：**
```
① 先在电脑上把 官网部署包.zip 解压成一个文件夹
② FileZilla 左侧进入解压后的文件夹，Ctrl+A 全选
③ 拖到右侧网站根目录
④ 弹出「目标文件已存在」→ 选「覆盖」
```

## ⚠️ 一个必须注意的点

**网站根目录里原有的这些文件，不要删！**
```
index.php / index.html    ← 你的首页
about/  news/  product/   ← 你原有的页面
images/  css/  js/        ← 你原有的资源
```

**我们上传的是**：
```
ai/            ← 新目录（我们的全部内容）
.well-known/   ← 新目录
robots.txt     ← 覆盖（我们优化过的版本）
sitemap.xml    ← 覆盖（我们的版本）
llms.txt       ← 新增
ai.txt         ← 新增
```

**判断方法**：上传前先截图记录根目录原来有什么；上传后对比，**只应该多出东西，不应该少东西**。

## 验证

```
① 访问 https://mackorn.cn/          → 你的首页应正常显示
② 访问 https://mackorn.cn/ai/       → 应显示插件页
③ 访问 https://mackorn.cn/ai/api/mcp.php  → 应显示一段 JSON（不是 500）
```

**第 ③ 条如果还是 500，告诉我，我再修。**

---

# 二、旧链接跳转（15 分钟）

👉 **见单独文档**：`04_AI收录与分发\SOP-旧链接跳转操作说明.md`

**那篇文档里有**：什么是跳转、三种上传方式、逐步骤截图式说明、故障排查表、回滚方法。

---

# 三、Cloudflare 加速（15 分钟 · 无风险）

**目的**：让你的网站在全球访问更快，并被 AI 爬虫更好地收录。

**为什么必须做**：你的服务器在中国（阿里云），而我们的客户在中亚/拉美/非洲。**智利的爬虫访问你的网站要等 300 毫秒**，搜索引擎会给慢站更低的抓取频率。

**Cloudflare 免费版能一次解决三件事**：
```
① 全球 CDN（智利/秘鲁/哈萨克访问从 300ms 降到 50ms）
② IPv6 支持（部分云爬虫优先走 IPv6）
③ 更强的缓存与压缩
```

## 具体步骤

### 3-1 注册 Cloudflare（3 分钟）
```
① 打开浏览器，访问：https://dash.cloudflare.com/sign-up
② 填邮箱（用 leif.dai@mackorn.cn）和密码
③ 点「Sign Up」
④ 去邮箱收验证邮件，点里面的链接验证
```

### 3-2 添加你的网站（3 分钟）
```
① 登录后点「+ Add a site」或「添加站点」
② 输入：mackorn.cn
③ 点「Add site」
④ 选择计划 → 选最下面的「Free」免费版 → 点「Continue」
```

### 3-3 记下 Cloudflare 给的 Nameserver（1 分钟）
```
Cloudflare 会显示两个地址，形如：
  xxxx.ns.cloudflare.com
  yyyy.ns.cloudflare.com

【把它们抄下来】—— 下一步要用
```

### 3-4 去你的域名注册商改 Nameserver（5 分钟）

**你是在哪买的 mackorn.cn？** 常见：
```
· 阿里云 / 万网     →  https://wanwang.aliyun.com/
· 腾讯云            →  https://dnspod.cloud.tencent.com/
· 新网 / 西部数码    →  对应官网
```

**操作（以阿里云为例）：**
```
① 登录阿里云 → 控制台 → 域名
② 找到 mackorn.cn → 点「管理」
③ 左侧点「DNS 修改」或「DNS 服务器」
④ 点「修改 DNS 服务器」
⑤ 把 Cloudflare 给的那两个地址填进去（替换原来的）
⑥ 点「确认」
```

**⚠️ 这一步做完，网站会有短暂（几分钟到几小时）不稳定，属正常现象。**

### 3-5 等生效 + 开启加速

```
① 回 Cloudflare，点「Check nameservers now」
② 生效后（可能 10 分钟到 24 小时），Cloudflare 会发邮件通知你
③ 生效后进入 DNS 页面，把每条记录的云朵图标点成【橙色】（开启代理）
```

## 验证

```
① 访问 https://mackorn.cn/  确认网站正常
② 打开 https://www.whatsmydns.net/#A/mackorn.cn
   看全球各地解析出来的 IP 是不是 Cloudflare 的（104.x / 172.x 开头）
```

---

# 四、Google Search Console（10 分钟 · 无风险）

**目的**：让 Gemini 和所有用 Google 的 AI 更快收录我们。

## 步骤

### 4-1 登录
```
① 打开：https://search.google.com/search-console
② 用 Google 账号登录（如果没有，先注册一个）
   ⚠️ 如果 Google 打不开，需要换网络（这是网络环境问题，不是操作问题）
```

### 4-2 添加资源
```
① 点左上角「添加资源」/「Add property」
② 选【网域】那一栏（不是「网址前缀」）
③ 输入：mackorn.cn
④ 点「继续」
```

### 4-3 验证所有权（推荐 DNS 方式）
```
① Google 会给你一条 TXT 记录，形如：
   google-site-verification=xxxxxxxxxxxxx

② 去 Cloudflare（如果你已经做了第三步）：
   DNS → Add record → 类型选 TXT → 名称填 @ → 内容粘贴上面那串
   保存

③ 回 Google，点「验证」
```

**如果还没做 Cloudflare**，也可以去阿里云域名解析里加这条 TXT 记录。

### 4-4 提交站点地图
```
① 左侧菜单点「站点地图」/「Sitemaps」
② 在"添加新的站点地图"框里输入：sitemap.xml
③ 点「提交」
④ 状态显示「成功」即可
```

---

# 五、百度站长平台（10 分钟 · 无风险）

**目的**：让文心一言、豆包、通义千问（全部中文 AI）更快收录我们。

## 步骤

### 5-1 登录
```
① 打开：https://ziyuan.baidu.com/
② 用百度账号登录（或注册）
```

### 5-2 添加站点
```
① 点「用户中心」→「站点管理」→「添加网站」
② 输入：https://mackorn.cn
③ 点下一步
```

### 5-3 验证所有权（推荐文件验证，最简单）
```
① 选「文件验证」
② 百度给你一个文件，形如：baidu_verify_xxxxxxxxxx.html
③ 下载它
④ 上传到网站根目录（和你上传部署包一样的操作）
⑤ 回百度点「完成验证」
```

**如果文件验证不方便**，也可以用「CNAME 验证」（在域名解析里加一条记录）。

### 5-4 提交站点地图 + 手动提交
```
① 左侧「普通收录」→「资源提交」→「sitemap」
② 填：https://mackorn.cn/sitemap.xml
③ 点提交

④ 再点「手动提交」
⑤ 粘贴这 10 个最重要的 URL（每次一行）：
   https://mackorn.cn/ai/
   https://mackorn.cn/ai/glossary/
   https://mackorn.cn/ai/screens/
   https://mackorn.cn/ai/reference/
   https://mackorn.cn/ai/markets/cn/
   https://mackorn.cn/ai/api/mcp.php
   https://mackorn.cn/llms.txt
   https://mackorn.cn/ai.txt
   https://mackorn.cn/.well-known/agent.json
   https://mackorn.cn/.well-known/keywords.json
⑥ 点提交
```

---

# 全部完成后的检查清单

```
□ 1. 部署包已上传，https://mackorn.cn/ai/ 能打开
□ 2. https://mackorn.cn/ai/api/mcp.php 显示 JSON（不是 500）
□ 3. 旧链接跳转包已上传，/glossary/ 自动跳到 /ai/glossary/
□ 4. Cloudflare 已生效（whatsmydns 查是 104.x / 172.x）
□ 5. Google Search Console 已验证 + sitemap 已提交
□ 6. 百度站长平台 已验证 + sitemap 已提交
```

---

# 遇到问题怎么找我

**发给我这三样**：
```
① 你做到哪一步卡住了（第几节的第几小步）
② 屏幕上显示的原文（截图最好）
③ 你访问的网址是什么
```

**我会立刻告诉你怎么办，或者我这边改代码。**

---

# 一句提醒

**这 5 件事里，第 1、2 件必须做（做完网站才正常）。**
**第 3、4、5 件是"加速收录"，不做也能用，只是 AI 找到我们会慢几周。**

**如果你时间紧，就先做 1 和 2。**
