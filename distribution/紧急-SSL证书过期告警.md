# 🚨 紧急：mackorn.cn 的 SSL 证书已过期 4.5 天

> 发现时间：2026-10-19 20:50（R101 夜间巡检）
> 严重程度：**高** —— 官网 HTTPS 全站不可用

---

## 一、事实（实测，不是推测）

```
Subject:    mackorn.cn
Issuer:     DigiCert Inc
Valid from: Jul 17 00:00:00 2026 GMT
Valid to:   Oct 14 23:59:59 2026 GMT
❌ 已过期 4.5 天
SAN:        DNS:mackorn.cn, DNS:www.mackorn.cn
```

### 连通性实测

| 测试 | 结果 |
|:---|:---|
| `https://mackorn.cn/` | ❌ `CERT_HAS_EXPIRED` |
| `https://47.110.80.123/` | ❌ `CERT_HAS_EXPIRED` |
| `https://www.mackorn.cn/` | ❌ `CERT_HAS_EXPIRED` |
| `http://mackorn.cn/` | ✅ HTTP 301（重定向到 https → 但 https 证书过期） |
| `http://47.110.80.123/` | ✅ HTTP 200 |
| TCP 80 / 443 | ✅ 都开放（服务器活着，只是证书过期） |

**对照**：GitHub API ✅ HTTP 200、npm registry ✅ HTTP 200 —— **不是本地网络问题。**

---

## 二、后果（比看起来严重）

```
① 所有浏览器访问 mackorn.cn 都会显示「不安全」警告
   → 客户、代理商打开官网第一眼就是不信任

② http:// 会 301 跳到 https:// → 而 https 证书过期
   → 实际上官网【完全无法正常访问】

③ 搜索引擎 / AI 爬虫抓取失败
   → 我们辛苦做的 12 语言页面、llms.txt、结构化数据全抓不到

④ ★ 这很可能就是 PR #15410 卡住的真正原因之一
   Glama 页面写：
     Responsiveness: Unresponsive
     This server cannot be deployed
   而我们 server.json 里的远程端点是 https://mackorn.cn/ai/api/mcp.php
   → Glama 探测这个地址 → 证书过期 → 判定 Unresponsive
   → 质量分评不出来 → PR #15410 无法合并
```

**换句话说：PR #15410 卡了两周，可能不是代码问题，是这个过期证书。**

---

## 三、立刻要做的（按顺序）

### ① 检查证书为什么会过期（谁负责续期）

```
服务器：47.110.80.123（阿里云，Apache + PHP 7.2.15）
签发：DigiCert Inc（可能是付费证书，也可能是某平台的免费 DV）
```

**可能原因**：
- 付费证书到期未续费
- 或者用了 Let's Encrypt 但自动续期任务挂了
- 或者证书是某个 CDN/面板统一管理的，没同步

**检查方法**（需要服务器访问）：
```bash
# 看证书文件在哪
apachectl -S 2>/dev/null | grep -i ssl
grep -r "SSLCertificateFile" /etc/httpd/ /etc/apache2/ 2>/dev/null

# 看过期时间
openssl x509 -in /path/to/cert.pem -noout -dates
```

### ② 续期（两条路）

**路 A：如果是 DigiCert 付费证书**
```
登录 DigiCert 账户 → 找到 mackorn.cn 订单 → 续期 → 重新签发 → 部署
（需要账户权限，只有你们有）
```

**路 B：换成 Let's Encrypt（免费 + 自动续期）**
```bash
# 在服务器上（需 root）
certbot --apache -d mackorn.cn -d www.mackorn.cn
# 之后 certbot 会自动续期（systemd timer 或 cron）
```

**路 C：如果用了阿里云证书服务**
```
阿里云控制台 → 数字证书管理服务 → 找到 mackorn.cn → 续费/重新签发 → 下载 → 部署到 Apache
```

### ③ 部署后验证

```bash
# 证书日期
echo | openssl s_client -servername mackorn.cn -connect mackorn.cn:443 2>/dev/null | openssl x509 -noout -dates

# HTTPS 是否正常
curl -I https://mackorn.cn/

# 我们的 API 端点
curl -s -X POST https://mackorn.cn/ai/api/mcp.php \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | head -c 200
```

---

## 四、我们的监控为什么没抓到（诚实复盘）

**本项目有 30+ 门禁、88 条教训，但没有任何一条在盯「官网 HTTPS 是否可用」。**

```
build_public.mjs      → 查本地文件合规
check_build_consistency → 查本地构建
publish_rhythm.mjs    → 查 GitHub/npm 发布节奏
ai_appeal.mjs         → 查本地 AI 友好度
cloud_heartbeat.mjs   → 查云端工作流是否在跑

❌ 没有一个在查【线上服务是否活着】
```

**这是监控盲区**：我们只顾着"本地东西对不对"，没顾"线上能不能访问"。

---

## 五、建议新增：线上健康检查（G14）

```
node tools/check_live_health.mjs

检查项：
  ① https://mackorn.cn/            → HTTP 200 + 证书未过期
  ② https://mackorn.cn/ai/         → HTTP 200
  ③ https://mackorn.cn/ai/api/mcp.php → JSON-RPC 正常响应 + 工具数
  ④ https://mackorn.cn/llms.txt    → HTTP 200
  ⑤ 证书剩余天数 ≥ 14（临期就告警，不给"过期才发现"的机会）

失败 → 红 + 明确说出是哪一项、剩多少天
```

**这条门禁能抓住**：
- 证书过期（提前 14 天预警）
- 站点宕机
- API 挂掉
- 部署后没生效

---

## 六、一句话

> **PR #15410 卡了两周，很可能不是代码，是一张 10-14 就到期的证书。**
> **Glama 探测 https://mackorn.cn 失败 → 判 Unresponsive → 质量分评不出来 → PR 合不了。**
> **证书续上，可能整件事就通了。**

---

## 七、紧急程度判断

| 项 | 判断 |
|:---|:---|
| 影响客户访问 | **是** —— 所有访客看到"不安全" |
| 影响 AI 抓取/收录 | **是** —— 爬虫抓不到 |
| 影响 PR #15410 | **很可能** —— Glama 探测失败 |
| 影响 npm 包使用 | 否 —— npm 包是本地跑的，不依赖官网 |
| 能否我自己修 | **否** —— 需要服务器/证书账户权限 |

**建议：今天就处理。**

---

*本专报由 R101 夜间巡检生成（2026-10-19 20:50）。*
