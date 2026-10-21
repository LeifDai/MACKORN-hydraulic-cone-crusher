# 🚨 可发现性故障修复指引（DNS + SSL 双故障）

> 生成：2026-10-21 09:25（R127）
> 实测工具：`node tools/reachability_health.mjs`
> **这份文档是照做就能修好的步骤，不需要懂技术细节。**

---

## 一、结论先说：**是两个独立问题叠加，必须都修**

```
问题①  DNS：裸域 mackorn.cn 没有 A 记录
        → Node dns.lookup 返回 ENOTFOUND
        → 所有 https://mackorn.cn/... 全部打不开

问题②  SSL：www.mackorn.cn 解析正常，但证书 2026-10-14 就过期了
        → Node fetch 返回 CERT_HAS_EXPIRED
        → 浏览器会显示"不安全"

★ 只修一个等于没修：
   · 只修 DNS → 域名能解析了，但证书过期，还是打不开
   · 只修证书 → 裸域还是解析不了，Glama 探测照样失败
```

**为什么这三天我一直判断错**：
我从 10-19 到 10-21 连续说"SSL 证书过期"，
因为看到 `CERT_HAS_EXPIRED` 就下结论了。
**直到今天把 `dns.lookup` 和 `fetch` 分开跑，才发现裸域根本没解析。**
这是我的判断错误，已记录到认知台账（第 25 条）。

---

## 二、【问题①】修 DNS（5 分钟，必须做）

### 症状
```
Resolve-DnsName mackorn.cn          → 无 A 记录
Resolve-DnsName www.mackorn.cn      → 47.110.80.123 ✅
```

### 怎么修（阿里云 DNS）

```
1. 登录阿里云 → 控制台 → 云解析 DNS
   https://dns.console.aliyun.com/

2. 找到域名 mackorn.cn → 点「解析设置」

3. 看现有记录里有没有「主机记录 = @ 且 类型 = A」这一条
   ├─ 有 → 检查记录值是不是 47.110.80.123；不是就改成它
   └─ 没有 → 点「添加记录」：

        记录类型：A
        主机记录：@          ← 这个 @ 就代表裸域 mackorn.cn
        解析线路：默认
        记录值：  47.110.80.123
        TTL：     600（10 分钟）

4. 保存后等 5-10 分钟生效

5. 验证（在 PowerShell 里跑）：
   Resolve-DnsName mackorn.cn -Type A
   → 应该看到 47.110.80.123
```

### 顺便确认这两条也在

```
主机记录  类型  记录值
@         A     47.110.80.123     ← 裸域（本条是修复重点）
www       A     47.110.80.123     ← 已存在，正常
```

**如果阿里云控制台里明明有 @ 的 A 记录，但本机解析不出来**：
可能是本机 DNS 缓存 → 跑 `ipconfig /flushdns` 再测。
还不行就是本地网络 DNS 有问题（换 8.8.8.8 或 223.5.5.5 试）。

---

## 三、【问题②】修 SSL 证书（10 分钟，必须做）

### 症状
```
https://www.mackorn.cn/... → CERT_HAS_EXPIRED
证书有效期到：2026-10-14 23:59:59 GMT
已过期：6 天
```

### 怎么修（服务器上操作）

**方式 A：用 certbot（推荐，如果服务器装过）**

```bash
# SSH 登上服务器 47.110.80.123
ssh root@47.110.80.123

# 一条命令续期
certbot --apache -d mackorn.cn -d www.mackorn.cn

# 或者只续期已有的
certbot renew --force-renewal
```

**方式 B：阿里云证书服务（如果没有 certbot）**

```
1. 阿里云 → 数字证书管理服务 → 免费证书
   申请一张 DigiCert 免费证书（mackorn.cn + www.mackorn.cn）

2. 下载 Apache 格式

3. 上传到服务器：
   /usr/home/hyu8030010001/htdocs/  （同目录下建 ssl 文件夹）

4. 编辑 Apache 配置（通常是 /etc/apache2/vhosts.d/ 或 httpd.conf）：
   SSLCertificateFile    /path/to/xxx_public.crt
   SSLCertificateKeyFile /path/to/xxx.key
   SSLCertificateChainFile /path/to/xxx_chain.crt

5. 重启 Apache：
   systemctl restart httpd   或   service apache2 restart
```

**方式 C：如果服务器上有宝塔面板（最简单）**

```
宝塔面板 → 网站 → mackorn.cn → SSL → Let's Encrypt → 申请（免费，自动续）
```

### 验证

```powershell
# PowerShell（如果 TLS 栈坏就用 Node）
node -e "fetch('https://www.mackorn.cn/ai/').then(r=>console.log('HTTP',r.status)).catch(e=>console.log('FAIL',e.cause&&e.cause.code))"
```

**修好的标志**：`HTTP 200`

---

## 四、两个都修好后，跑这三个命令验证

```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"

# ① 可发现性体检（应该变 GREEN）
node tools/reachability_health.mjs

# ② AI 收录探测（自有 4 个应从"错误"变"已收录"）
node tools/ai_coverage.mjs

# ③ 线上健康（原来的检查）
node tools/check_live_health.mjs
```

**期望结果**：
```
reachability_health → GREEN: 全部可达
ai_coverage         → 收录数从 6 涨到 10（自有 4 个端点恢复）
```

---

## 五、修好之后的动作（顺序很重要）

```
□ 1. 等 10 分钟让 DNS 生效 + 证书生效
□ 2. 跑上面三个验证命令，确认 GREEN
□ 3. 去 Glama 后台强制重新抓取
      https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher
      → 页面里找 "Admin" 或 "Refresh" 按钮
      → 触发重新评估（现在会探测成功）
□ 4. 观察 Glama 页面是否：
      · 工具数从 19 → 29
      · "cannot be deployed" → 可部署
      · Responsiveness 从失败 → 正常
□ 5. PR #15410 那边补一条评论：
      "The bare domain DNS record has been fixed and the SSL certificate renewed.
       Please re-trigger the evaluation."
```

---

## 六、当前 AI 收录状态（修好前，实测）

| 平台 | 状态 | 说明 |
|:---|:---|:---|
| ✅ Official MCP Registry | **已收录** | 官方注册表已有我们 |
| ✅ npm registry | **已收录** | mackorn-cone-crusher@0.2.2 |
| ✅ Glama | **页面已存在** | 但显示 19 tools + cannot be deployed |
| ✅ Smithery | **已收录** | 我以为没收录，实际早就有 |
| ✅ skills.sh | **已收录** | |
| ✅ unpkg server.json | **已收录** | |
| ❌ mcp.so | 未收录 | 404，需提交 |
| ❌ MCP-X | 未收录 | 需提交 |
| ❌ MCPList | 未收录 | 404，需提交 |
| ❌ Claude Connectors | 未收录 | 需 Anthropic 审核 |
| 🚫 PulseMCP | 被挡 | 403 反爬，不算未收录 |
| 🚫 MCPServers.org | 被挡 | 403 反爬 |
| ⚠️ punkpeye/awesome-mcp-servers | 探测失败 | ECONNRESET（本机网络问题） |
| ⚠️ awesome-dsh-plugin | 探测失败 | 同上（但 PR #6141 已合并，应该在里面） |
| ⚠️ 自有 4 个端点 | **全挂** | DNS + SSL 双故障 |

**结论**：收录情况比预想的好（6 个已收录，含官方注册表和 Glama）。
**真正卡住的是自有域名打不开**，不是"没提交"。

---

## 七、一句话总结

```
不是"AI 不收录我们" 的问题，
是"我们自己的网站在 AI 眼里是死的" 的问题。

先把自己修活，收录自然会来。
```

---

*本文件由 R127 生成。工具：`tools/reachability_health.mjs` + `tools/ai_coverage.mjs`*
