# ☁️ 云端自迭代备选方案：阿里云函数计算 FC

> 目标③要求：「完善 GitHub Actions 工作流使其真能定时跑通并把证据写回仓库，
> 同时准备阿里云函数计算 FC 的备选说明」
> 编写：R102（2026-10-19 夜）

---

## 一、为什么需要备选

**GitHub Actions 的现状（实测）**：

```
✅ 工作流已写好：38 步，引用脚本全部存在
✅ 心跳机制已加（防 60 天自动禁用）
✅ 每 2 小时 cron
❌ 但【推不上去】—— 本机没有 git、没有 gh、没有 ghp_ token
```

**所以工作流虽然写好了，但从未真正在云端跑过。**

**需要备选的真实原因**：

| 风险 | 说明 |
|:---|:---|
| **GitHub Actions 推不上去** | 本机无 GitHub 凭据，工作流无法上线 |
| **GitHub 公开仓库 60 天无活动会被禁用** | 已有心跳对策，但需要先能推 |
| **GitHub Actions 免费额度** | 公开仓库通常免费，但 fork 的仓库会消耗自己的额度 |
| **中国大陆访问不稳** | GitHub 在国内访问时好时坏 |

**阿里云 FC 的优势**：服务器就在国内（47.110.80.123 是阿里云），网络稳定，且我们已有阿里云账号。

---

## 二、方案对比（先搜已有方案，再决定）

按全局规则「做任何事之前先搜已有方案 + 了解环境」：

### 已了解的环境

```
服务器：47.110.80.123（阿里云 ECS，Apache + PHP 7.2.15）
已有域名：mackorn.cn
文档根：/usr/home/hyu8030010001/htdocs/
现有凭据：无（需要用户提供阿里云 AccessKey 或控制台权限）
```

### 三条备选路径

| 方案 | 做法 | 优点 | 缺点 | 需要什么 |
|:---|:---|:---|:---|:---|
| **A. 服务器 cron** | 在 ECS 上加 `crontab` 跑 Node 脚本 | 最简单、零成本、已有服务器 | 需要 SSH 权限；服务器挂了就没 | SSH 凭据 |
| **B. 阿里云函数计算 FC** | 定时触发器 + 函数跑 Node | 免运维、按量计费、独立于 ECS | 需要部署配置、依赖层管理 | 阿里云账号 + AccessKey |
| **C. 阿里云 ACK / ECS 容器** | 容器化 + 定时 Job | 环境一致 | 重，过度设计 | 同上 |

**建议：先 A（最简单），A 不行再 B。**

---

## 三、方案 A：ECS cron（推荐先做）

### 前提

```
① SSH 到 47.110.80.123 的凭据（用户提供）
② 服务器上有 Node.js ≥ 18（需确认）
```

### 步骤

```bash
# 1. 检查 Node
ssh user@47.110.80.123 'node --version'

# 2. 拉代码（GitHub 能访问的话）
cd /usr/home/hyu8030010001/
git clone https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher.git repo

# 3. 加 cron（每 2 小时）
crontab -e
# 加这一行：
0 */2 * * * cd /usr/home/hyu8030010001/repo && /usr/local/bin/node tools/cloud_heartbeat.mjs >> /var/log/mackorn-nightly.log 2>&1
0 */2 * * * cd /usr/home/hyu8030010001/repo && /usr/local/bin/node tools/enforce_lessons.mjs >> /var/log/mackorn-nightly.log 2>&1
0 */2 * * * cd /usr/home/hyu8030010001/repo && /usr/local/bin/node tools/build_public.mjs >> /var/log/mackorn-nightly.log 2>&1

# 4. 验证
tail -f /var/log/mackorn-nightly.log
```

### 注意

- **不要**在服务器上跑会写文件的脚本（除非确认权限），优先只跑"检查类"
- 心跳文件要能写回 —— 但服务器上写回不等于 GitHub 上有。所以 A 方案的"证据回写"只能到服务器本地
- **如果想回写 GitHub**，需要服务器上有 GitHub token（放环境变量，不进仓库）

---

## 四、方案 B：阿里云函数计算 FC

### 前提

```
① 阿里云账号 + 函数计算已开通
② AccessKey（用于部署）或控制台操作权限
```

### 步骤（控制台）

```
1. 创建服务
   名称: mackorn-nightly
   日志: 开启

2. 创建函数
   运行环境: Node.js 18
   函数入口: index.handler
   内存: 512 MB
   超时: 300 秒

3. 上传代码
   把 tools/ + plugin/ + distribution/ 打包成 zip 上传
   （注意：包会比较大，约 3-5 MB，FC 限制 50MB）

4. 配置定时触发器
   Cron 表达式: 0 0 */2 * * * ?   （阿里云 cron 是 6 位，秒级）
   时区: Asia/Shanghai

5. 环境变量（不写进代码）
   GITHUB_TOKEN = ghp_xxx    ← 如果要回写 GitHub
```

### 函数代码骨架

```js
// index.js（FC 入口）
'use strict';

exports.handler = async (event, context) => {
  const { execFileSync } = require('node:child_process');
  const results = [];
  const steps = [
    ['心跳', 'tools/cloud_heartbeat.mjs'],
    ['L2门禁', 'tools/enforce_lessons.mjs'],
    ['合规', 'tools/build_public.mjs'],
    ['线上健康', 'tools/check_live_health.mjs'],
  ];
  for (const [name, script] of steps) {
    try {
      execFileSync(process.execPath, [script], { cwd: '/code', stdio: 'inherit', timeout: 240000 });
      results.push({ step: name, ok: true });
    } catch (e) {
      results.push({ step: name, ok: false, err: String(e.message).slice(0, 200) });
    }
  }
  // 可选：回写 GitHub（需要 GITHUB_TOKEN）
  return { ok: results.every(r => r.ok), results, at: new Date().toISOString() };
};
```

### 注意

- FC 的 `/tmp` 只有 512MB，且**不持久**
- 要把文件写回 GitHub 必须用 API（`tools/push_via_api.mjs` 已有）
- **首次部署后要手动触发一次验证**

---

## 五、无论哪个方案都必须解决的：证据回写

**目标③说「把证据写回仓库」。三个方案的能力不同：**

| 方案 | 能写回哪 |
|:---|:---|
| GitHub Actions | ✅ 直接 commit 回仓库（`contents: write`） |
| ECS cron | ⚠️ 只能写服务器本地；要回 GitHub 需 token |
| 阿里云 FC | ⚠️ 只能写 /tmp；要回 GitHub 需 token + API |

**所以「回写仓库」这件事，本质上都需要 GitHub 凭据。**

**这就是为什么 §一 说「工作流写好了但从未跑过」—— 缺的不是代码，是凭据。**

---

## 六、现在的真实结论（诚实）

```
✅ 工作流已写好：38 步 · 心跳防盗用 · 每 2 小时
✅ 本地预演可跑：workflow_dryrun.mjs
❌ 从未在云端真实跑过 —— 因为推不上去

所以：
  · 我不能说"云端自迭代已做实"
  · 只能说"材料备齐，等一次推送"

备选方案已写在这份文档里（ECS cron / 阿里云 FC），
但【都需要用户提供服务器或阿里云凭据】才能落地。
```

---

## 七、需要你做的（按优先级）

```
□ 1. 【最省事】给一个 GitHub 经典 token（勾 public_repo）
     → 推上去 → GitHub Actions 就开始跑，方案 A/B 都不用了

□ 2. 如果 GitHub Actions 不可用：
     给 SSH 凭据 → 我或你加 ECS cron（方案 A，10 分钟）

□ 3. 如果要在阿里云 FC 上跑：
     给阿里云 AccessKey 或控制台权限 → 按 §四 部署
```

**三个都需要凭据。我无法代替认证。**

---

## 八、这套备选说明的价值

```
① 备选方案不是"以防万一"，而是因为主方案【已经卡住】
② 三条路径的能力边界写清了（谁能回写仓库、谁不能）
③ 诚实标注：工作流写好了但从未真跑 —— 不说"已做实"
```

---

*本文件由 R102 生成。相关：`.github/workflows/nightly-self-iteration.yml` · `tools/cloud_heartbeat.mjs`*
