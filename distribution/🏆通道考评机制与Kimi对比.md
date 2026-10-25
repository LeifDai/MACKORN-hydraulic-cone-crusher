# 🏆 通道考评机制 · 谁能做得更好

> 建立：2026-10-26 02:00（R186）
> 口径：**质量 60% + 效率 40%**（用户选定）

---

## 一、先说最重要的结论（诚实，不粉饰）

### 🔴 实测：11 个通道，0 个真正可用

```
通道                                      类型    key      实测
─────────────────────────────────────────────────────────────
DeepSeek（收费，兜底）                     收费    ❌ 缺     跳过
Kimi K2.6（NVIDIA NIM，免费）              免费    ❌ 缺     跳过
GLM-5.3 Flash（NVIDIA NIM，免费）          免费    ❌ 缺     跳过
Nemotron 3.5 Lightning（NVIDIA NIM）      免费    ❌ 缺     跳过
Nemotron 3 Super 120B（NVIDIA NIM）       免费    ❌ 缺     跳过
DeepSeek V4.1 Flash（NVIDIA NIM）         免费    ❌ 缺     跳过
智谱 GLM-4-Flash（完全免费）                 免费    ❌ 缺     跳过
Kimi 官方 API（月之暗面）                    收费    ❌ 缺     跳过
硅基流动（9B 以下免费）                        免费    ❌ 缺     跳过
百度千帆 ERNIE-Speed（永久免费）               免费    ❌ 缺     跳过
Ollama 本地 qwen2.5:1.5b                  本地    ✓ 无需   ❌ 超时120s
─────────────────────────────────────────────────────────────
可用：0 / 11
```

**这就是「谁能做得更好」的真答案：不是谁更好，是只有一个能用（DeepSeek 收费），
其他全部因为 key 没配而不能用，连本地的 1.5B 小模型都超时 120 秒跑不动。**

**配置看起来完美（settings.yaml 里配了 8 个模型），但 key 一个都没设。**

---

## 二、Kimi 专项（用户直接问的）

### 三个 Kimi 版本对比

| 版本 | 免费？ | 能不能程序调用 | 怎么用 |
|:---|:---:|:---:|:---|
| **Kimi K2.6（NVIDIA NIM）** | ✅ **免费** | ✅ 能（OpenAI 兼容） | ★ **推荐**：免费注册 NVIDIA，用 `moonshotai/kimi-k2.6` |
| Kimi 官方 API（月之暗面） | 💰 收费 | ✅ 能 | 新用户 15 元试用额度，之后按 token 收费，**无永久免费模型** |
| Kimi 网页版 | ✅ 免费 | ❌ 不能 | kimi.moonshot.cn，只能人手动问，不能程序调用 |

### 结论

```
✅ Kimi 免费版【已经有了】—— 不需要月之暗面账号
   路径：NVIDIA NIM 免费额度 → moonshotai/kimi-k2.6
   位置：已经写在 settings.yaml 里，只差一个 NVIDIA_API_KEY

⚠️ Kimi 官方 API 没有永久免费（只有 15 元试用）

❌ Kimi 网页版免费但不能程序调用（不能做自动考评）
```

---

## 三、考评机制设计（三层）

### L1 通道考评（已实现，`tools/channel_eval.mjs`）

**口径：质量 60% + 效率 40%**

| 维度 | 权重 | 怎么算 |
|:---|:---:|:---|
| **质量** | 60 分 | 探活成功 +35 · 免费 +15（本地 +20）· 强模型档 +10 |
| **效率** | 40 分 | 延迟 <1s +40 · <3s +32 · <8s +22 · <20s +12 · >20s +5 |

**命令**：
```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
node tools\channel_eval.mjs --kimi           # Kimi 三版本对比
node tools\channel_eval.mjs --probe --score  # 探活 + 排名
node tools\channel_eval.mjs --status         # 只看 key 配置状态
```

### L2 助手/会话考评（设计）

**考评不同会话/模型的交付质量**：

| 维度 | 怎么测 |
|:---|:---|
| 门禁通过率 | `tests/run.mjs` 首跑通过数 / 总数 |
| 返工次数 | 同一个门禁反复挂几次才过 |
| 交付物完整度 | `check_publish_artifact.mjs` 通过数 |
| 自我推翻质量 | cognition_log 里 L3/L4 级的条数 |

**数据来源**：现有的 `cognition-data/` / `iteration-data/` / `rsi-data/`

### L3 人员考评（设计，接 §2.8.4）

**四层识别法**：

| 层 | 看什么 | 权重 |
|:---|:---|:---:|
| L1 履历 | 干过什么、在哪干过 | 10% |
| L2 战绩 | 做成了什么（可验证） | 30% |
| **L3 判断力** | **遇到难题怎么想** | **30%** |
| **L4 品格与志趣** | **在没人看着时怎么选** | **30%** |

**工具**：`node tools/talent_registry.mjs --assess --id T-001 --l1 5 --l2 3 --l3 4 --l4 2`

**关键**：只评 L1-L2 会被工具自动标 `shallow` 并提示「多数招聘失败在这里」。

---

## 四、现在就做：5 分钟配好免费通道

### 优先顺序（选 1-2 个就够，不用全配）

### ① NVIDIA NIM（最重要，一次配好 6 个模型含 Kimi）

**为什么最优先**：
```
一个 key 解锁 6 个模型，其中包含 Kimi K2.6（用户要的）
完全免费额度
注册不需要信用卡
```

**注册步骤**：
```
1. 打开 https://build.nvidia.com
2. 右上角 Login（可用 Google/GitHub 登录，不需要信用卡）
3. 任意选一个模型 → 点「Get API Key」
4. 复制 key（形如 nvapi-xxxxxxxxxxxx）
5. 在 PowerShell 里跑：
   setx NVIDIA_API_KEY "nvapi-你的key"
6. 重开终端生效
```

**验证**：
```powershell
cd "D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
node tools\channel_eval.mjs --probe --score
```

### ② 智谱 GLM-4-Flash（国内永久免费，最稳）

**为什么**：
```
完全免费（无 token 上限，30 并发）
国内直连，不需要翻墙
中文能力强
```

**注册**：
```
1. 打开 https://open.bigmodel.cn
2. 注册（手机号）
3. 控制台 → API Keys → 新建
4. setx ZHIPU_API_KEY "你的key"
```

### ③ 百度千帆 ERNIE-Speed（永久免费，QPS 50）

```
1. https://qianfan.baidubce.com
2. 注册（百度账号）
3. 创建应用 → 拿 API Key + Secret Key
4. setx QIANFAN_API_KEY "你的key"
```

### ④ 硅基流动（9B 以下免费）

```
1. https://cloud.siliconflow.cn
2. 注册（手机号）
3. API Keys → 新建
4. setx SILICONFLOW_API_KEY "你的key"
```

---

## 五、Ollama 为什么超时（技术诊断）

```
现象：qwen2.5:1.5b 模型 120 秒无响应
可能原因：
  ① 本机内存不足（1.5B 模型加载需约 1GB）
  ② Ollama 服务卡住（进程在跑但无响应）
  ③ 磁盘 I/O 阻塞

排查方法：
  ① 看 Ollama 日志：%LOCALAPPDATA%\Ollama\server.log
  ② 重启 Ollama：任务管理器结束 ollama.exe，重新启动
  ③ 试更小的模型：ollama pull qwen2.5:0.5b
```

**⚠️ Ollama 不可用的后果**：
```
T3 敏感数据（合同/报价/图纸/发票）没有本地安全通道
→ 只能我自己做（收费）或人工
→ 这是当前最大的经济缺口
```

---

## 六、考评台账（每天自动跑）

**已加进云端工作流**：每天跑 `node tools/channel_eval.mjs --probe --score`

**台账位置**：`channel-eval-data/channel-eval.json`

**判断口径**：
```
可用通道数    含义                      动作
──────────────────────────────────────────────
0-1          配置没生效                配 key（见第四节）
2-3          开始生效                  日常用免费
4+           正常                      保持
```

---

## 七、反模式（明令禁止）

```
✗ 声称"我已经配好免费通道"但 key 是空的
✗ 把"配置里写了 8 个模型"当成"8 个能用"
✗ 只看模型名字判断好坏（Kimi K2.6 名字好但 key 没配=不能用）
✗ 用自我描述替代测量（"我感觉智谱更快"）
✗ 把 Ollama 超时当成"模型不行"（可能是内存/服务问题）
✗ 声称能算精确省钱金额（DSH 日志无 token 用量）
```

---

## 八、一句话

```
Kimi 免费版已经有了（NVIDIA NIM 的 moonshotai/kimi-k2.6），
但 NVIDIA_API_KEY 没配 → 11 个通道 0 个能用。
「谁做得更好」现在无法回答 —— 因为只有一个能用。
配 key 是唯一出路，5 分钟的事。
```

---

*本文件由 R186 生成（2026-10-26 02:00）· 工具：tools/channel_eval.mjs*
