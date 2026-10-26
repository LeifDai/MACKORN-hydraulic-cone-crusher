# 操作说明书 SOP · 旧链接跳转

> **写给谁**：不熟悉计算机操作的同事。
> **要干什么**：网站内容搬到了 `/ai/` 子目录，原来发布过的网址要"自动转到新地址"，不然搜索引擎和 AI 会找不到。
> **要多久**：15 分钟。
> **风险**：**方案 A 零风险**（只上传文件，不改任何配置）。方案 B 有一点点风险，但我会教你怎么回滚。

---

# 第零步：先搞懂"跳转"是什么（1 分钟，用生活例子）

**比喻**：你原来的办公室在 **A 号楼 301**，现在搬到了 **B 号楼 205**。
如果有人在 A 号楼 301 敲门，会发生什么？

| 情况 | 结果 |
|:---|:---|
| **没做跳转** | 门口空着，来人以为"这家公司没了" |
| **做了跳转** | 门口贴张纸条：「已搬到 B 号楼 205」→ 来人找得到 |

**我们现在要做的就是这个"门口贴纸条"。**

**技术名词对应**：
```
A 号楼 301  =  https://mackorn.cn/glossary/        （旧地址）
B 号楼 205  =  https://mackorn.cn/ai/glossary/     （新地址）
门口纸条    =  跳转文件（或 .htaccess 里的一行规则）
```

---

# 第一步：先确认你能怎么访问服务器（3 分钟）

**你需要能"上传文件到网站根目录"。** 你上次上传部署包用的什么方式，这次就用同样方式。

## 怎么判断你用的是哪种方式？

**回想一下你上次上传部署包时的操作：**

| 你上次是怎么做的 | 那就用这个 | 跳到 |
|:---|:---|:---|
| 打开一个**网页**，在里面点上传 | 主机控制面板 / 宝塔面板 | **第二步 - 甲** |
| 用**软件**（FileZilla、WinSCP 等）拖文件进去 | FTP 工具 | **第二步 - 乙** |
| 记不清了 | 建议用 FTP 工具（最通用） | **第二步 - 乙** |

**如果不确定，先做一件事**：打开浏览器访问 https://mackorn.cn/ ，拉到最下面看有没有"管理"入口；或者回忆你上次上传时的那个网页地址。

---

# 第二步 - 甲：用「网页控制面板」上传（最简单）

## 甲-1 登录控制面板

```
① 打开浏览器
② 输入你上次上传部署包时用的那个网址
   （常见形如：https://xxx.aliyun.com  或  http://你的服务器IP:8888  或  https://主机商域名）
③ 输入用户名密码登录
```

## 甲-2 找到「文件管理」

**不同面板叫法不同，找这些字眼之一：**
```
· 文件管理  File Manager  📁
· 网站  →  网站根目录
· 我的网站  →  管理  →  文件
· 宝塔面板：左侧菜单「文件」
```

## 甲-3 进入「网站根目录」

**网站根目录的样子**：里面你会看到 `index.php`、`robots.txt`、`sitemap.xml`、`ai` 文件夹。

```
① 双击进入网站根目录
② 确认能看到 robots.txt 和 sitemap.xml  ← 看到这两个就对了
```

**⚠️ 如果看到很多层级（wwwroot / public_html / htdocs），逐层进入，直到看见 robots.txt**

## 甲-4 上传跳转文件包

```
① 找到「上传」按钮（通常是 ⬆ 图标或"上传文件"）
② 选择文件：
   D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin\distribution\旧链接跳转包.zip
③ 上传完成后，找到刚上传的 旧链接跳转包.zip
④ 右键 → 选择「解压」/「Extract」
⑤ 解压到【当前目录】（网站根目录）
⑥ 解压完删掉 旧链接跳转包.zip（可选，保持整洁）
```

**解压后你应该看到多出这些文件夹和文件：**
```
glossary/          ← 新出现
markets/           ← 已存在（覆盖里面的 index.html）
distributors/
engineering-firms/
contact/
en/ ru/ es/ pt/ fr/ ar/ id/ ja/ de/ tr/ vi/
llms-full.txt
CLAUDE.md
api/
```

## 甲-5 验证（见第四步）

---

# 第二步 - 乙：用「FTP 软件」上传

## 乙-1 下载 FTP 软件（如果还没有）

```
推荐 FileZilla（免费）：
  打开 https://filezilla-project.org/
  点「Download FileZilla Client」
  选 Windows 版下载安装
```

## 乙-2 准备连接信息

**你需要从主机商那里拿到这 4 个信息：**
```
主机地址（Host）：     例 47.110.80.123  或  ftp.mackorn.cn
用户名（Username）：   例 mackorn
密码（Password）：     你 FTP 的密码
端口（Port）：         通常 21
```

**⚠️ 如果不知道**：打电话问你的网站服务商，或者回想你上次上传部署包时用的信息。

## 乙-3 连接

```
① 打开 FileZilla
② 顶部 4 个框依次填：主机 / 用户名 / 密码 / 端口
③ 点「快速连接」
④ 右侧出现服务器文件列表 = 连接成功
```

## 乙-4 找到网站根目录

**在右侧（服务器）列表里**，逐层双击进入，直到看到 `robots.txt` 和 `sitemap.xml`。

**⚠️ 如果进不去或有多个文件夹**：找名字像 `wwwroot`、`public_html`、`htdocs`、`web` 的那个。

## 乙-5 上传

```
① 左侧（你的电脑）导航到：
   D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin\distribution\
② 找到「旧链接跳转包」文件夹（不是 .zip，是解压后的文件夹）
   —— 如果只有 .zip，先右键解压
③ 进入「旧链接跳转包」文件夹，全选里面【所有】条目（Ctrl+A）
④ 拖到右侧（服务器）的网站根目录
⑤ 弹出「目标文件已存在」→ 选「覆盖」
⑥ 等待传输完成（进度条走完）
```

**⚠️ 重要**：拖的是「旧链接跳转包」**里面**的东西，不是「旧链接跳转包」这个文件夹本身。

---

# 第三步：验证是否成功（2 分钟）

**打开浏览器，逐个访问下面这些地址。** 每个都应该**自动跳到 `/ai/` 开头的新地址**：

| 在地址栏输入 | 应该跳转到 |
|:---|:---|
| `https://mackorn.cn/glossary/` | `https://mackorn.cn/ai/glossary/` |
| `https://mackorn.cn/contact/` | `https://mackorn.cn/ai/contact/` |
| `https://mackorn.cn/ru/` | `https://mackorn.cn/ai/ru/` |
| `https://mackorn.cn/markets/` | `https://mackorn.cn/ai/markets/` |

**怎么看成功**：
```
✅ 地址栏自动变成了 /ai/...  →  成功
❌ 显示 404 找不到页面        →  文件没传对位置，见"故障排查"
❌ 显示 403 禁止访问          →  文件没传对位置，见"故障排查"
```

**再验证新地址能打开**：
```
https://mackorn.cn/ai/glossary/     ← 应该正常显示术语表
https://mackorn.cn/ai/              ← 应该正常显示插件页
```

---

# 第四步（可选但推荐）：让跳转更"正规"

**上面方案 A 的跳转是"页面级"的。搜索引擎能看懂，但更规范的做法是服务器级 301 跳转。**

**如果你觉得自己能小心操作，可以做这一步；如果没把握，跳过也不影响使用。**

## 操作步骤

```
① 在网站根目录找到 .htaccess 文件
   ⚠️ 如果看不到，可能是"隐藏文件"，需要在面板/FTP 里打开"显示隐藏文件"选项

② 【最重要】先备份！
   右键 .htaccess → 下载到电脑 → 改名为 htaccess-备份-2026-10-04.txt
   （如果 .htaccess 不存在，直接跳到 ④）

③ 用文本编辑器打开 .htaccess（记事本就行）

④ 打开这个文件：
   D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin\distribution\_deploy2\redirects-建议.txt

⑤ 从中复制这一段（从 <IfModule mod_rewrite.c> 到 </IfModule>）：

   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteRule ^glossary/(.*)$ /ai/glossary/$1 [R=301,L]
     RewriteRule ^markets/(.*)$ /ai/markets/$1 [R=301,L]
     ...（其余规则）
   </IfModule>

⑥ 粘贴到 .htaccess 的【最末尾】（不要删掉原有内容！）

⑦ 保存，上传回网站根目录（覆盖原文件）

⑧ 立刻访问 https://mackorn.cn/ 确认网站正常
```

## ⚠️ 如果出现 500 错误（网站打不开）

**别慌，30 秒恢复：**
```
① 把你刚才备份的 htaccess-备份-2026-10-04.txt 上传回去
   改名为 .htaccess 覆盖
② 或者：直接删掉 .htaccess 里你刚粘贴的那一段
③ 刷新网站，应该恢复正常
```

**500 的原因**：服务器没启用 mod_rewrite 模块。**这不是你的错，是主机配置问题**，方案 A（页面跳转）照样能用。

---

# 故障排查表

| 现象 | 原因 | 怎么解决 |
|:---|:---|:---|
| 访问旧地址显示 **404** | 文件传到了错误的目录 | 确认传到了有 `robots.txt` 的那个目录 |
| 访问旧地址显示 **403** | 目录里没有 index.html | 检查是否传了 `index.html` 进去 |
| 访问旧地址**没跳转**，显示一片白 | 浏览器缓存 | 按 **Ctrl + F5** 强制刷新 |
| 网站整个打不开（**500**） | 改 .htaccess 出错了 | 恢复备份的 .htaccess（见上） |
| 找不到 **.htaccess** | 它是隐藏文件 | 在面板/FTP 里打开「显示隐藏文件」 |
| 找不到**网站根目录** | 层级太深 | 逐层进入，直到看见 `robots.txt` |

---

# 完整检查清单（照着打勾）

```
□ 1. 确认我能访问服务器（面板 / FTP）
□ 2. 进入网站根目录（能看到 robots.txt 和 sitemap.xml）
□ 3. 上传「旧链接跳转包」里的所有内容
□ 4. 遇到同名文件选「覆盖」
□ 5. 浏览器访问 /glossary/ 确认自动跳到 /ai/glossary/
□ 6. 浏览器访问 /ai/glossary/ 确认能正常打开
□ 7. 浏览器访问 / 确认首页正常
□ 8.（可选）.htaccess 加 301 规则（先备份！）
```

---

# 做完后告诉我

**发给我这三条信息**：
```
① 访问 https://mackorn.cn/glossary/ 后，地址栏变成了什么？
② 访问 https://mackorn.cn/ai/ 能正常打开吗？
③ 有没有哪一步卡住了？截图发我
```

**我会立刻重新跑线上检测，确认全部转绿。**

---

# 附：为什么不用 .htaccess 也能跳转

**方案 A 的跳转文件里写了三行"三重保险"：**
```html
<link rel="canonical" href="https://mackorn.cn/ai/glossary/">
   ↑ 告诉搜索引擎：真正的地址在这里

<meta http-equiv="refresh" content="0; url=https://mackorn.cn/ai/glossary/">
   ↑ 浏览器看到这行会自动跳

<script>location.replace("https://mackorn.cn/ai/glossary/");</script>
   ↑ 万一浏览器不支持上面那个，用 JavaScript 跳
```

**所以：不用碰任何服务器配置，只上传文件就能跳。**
**代价**：搜索引擎看到的是"页面跳转"而不是"服务器 301"，收录稍慢一点点，但完全有效。
