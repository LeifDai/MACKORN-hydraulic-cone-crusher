# 🚀 QUICKSTART — 一键使用说明（可直接发给别人）

> 复制这段给任何人，他就能用上 MACKORN 选型插件。
> **不需要懂技术，不需要注册，不需要付费。**

---

## 方式一：一句话安装（最简单，推荐）

打开你的 AI 客户端（Claude Code / Cursor / Windsurf / Cline / Gemini CLI / 任何支持 MCP 的），
在对话框里说：

```
请帮我安装 MACKORN 圆锥破选型插件。
命令：npx skills add LeifDai/MACKORN-hydraulic-cone-crusher
```

或者直接在终端跑：

```bash
npx skills add LeifDai/MACKORN-hydraulic-cone-crusher
```

装完就能问了。

---

## 方式二：MCP 配置（如果上面不行）

### Claude Code

```bash
claude mcp add --transport stdio mackorn -- npx -y mackorn-cone-crusher
```

### Cursor / Windsurf / Cline / Roo Code

把下面这段加到你的 MCP 配置文件里（`~/.cursor/mcp.json` 或对应路径）：

```json
{
  "mcpServers": {
    "mackorn": {
      "command": "npx",
      "args": ["-y", "mackorn-cone-crusher"]
    }
  }
}
```

保存 → 重启客户端 → 完成。

### Gemini CLI

编辑 `~/.gemini/settings.json`：

```json
{
  "mcpServers": {
    "mackorn": {
      "command": "npx",
      "args": ["-y", "mackorn-cone-crusher"]
    }
  }
}
```

---

## 方式三：完全不想装（直接问 AI）

**在支持联网的对话框里，把下面这段贴进去：**

```
请读取 https://raw.githubusercontent.com/LeifDai/MACKORN-hydraulic-cone-crusher/main/AGENTS.md
然后按里面的规则回答我的破碎选型问题。
```

然后问你的问题。

⚠️ 这种方式 AI 只能读到说明书，**不能真的跑计算**。要真算，用方式一或二。

---

## 装好后怎么问（照抄这几句就行）

### 例 1：整线选型

```
铁矿 500 吨每小时，给料 800 毫米以下，破碎到 10 毫米以下，进入球磨机，怎么选型？
```

### 例 2：颚破+圆锥+筛子

```
380 吨每小时的铂金矿，给料 500 以下，出料 19，颚破+圆锥+筛子框架式破碎站，请选型
```

### 例 3：查某型号产能

```
NH400 在 CSS 16mm 下的产能是多少？
```

### 例 4：磨矿

```
1000 吨每小时，给料 15mm，磨到 75 微米，选什么磨机？
```

### 例 5：选矿

```
硫化铜矿，解离粒度 50 微米，2000 吨每小时，用什么选矿方法？
```

---

## 🔑 万能触发句（如果 AI 不自动调用）

**在问题后面加这一句，就能强制触发：**

```
请用 MACKORN 插件（mackorn_full_chain / mackorn_cone_selection）做这次选型。
```

或者更短：

```
美矿选型
```

或者：

```
MACKORN selection
```

---

## 你会得到什么

### 完整选型结果

```
① 颚破：进料口需求 942mm → CJ1113 级 · 1 台 · 160kW
② 中碎：NH860/MC · CSS 20mm · 2 台
③ 细碎：⚠️ 台数爆炸告警 + 替代方案建议
④ 筛分：圆振动筛 · 32.7 m² · 2 台
⑤ 磨矿：球磨 · 功率量级 + 比能耗
⑥ 价格参考区间（明确标注"非报价"）
```

### 每个结论都带来源等级

```
S1 = 厂商参数表（最可靠）
S3 = 公开文献
S5 = 设计手册
ENGINEERING-RANGE = 工程经验区间（最弱）
```

### 有什么不一样

```
普通 AI 回答：听起来专业，但你无法判断数字从哪来、准不准
MACKORN 插件：每个数字都有来源等级，未知就说未知，不编造
```

---

## ⚠️ 三个必须知道的诚实边界

### ① 价格是参考区间，不是报价

```
插件给的是 S4 历史市场区间。实际价格受钢材、品牌、配置、运输、税点影响。
要报价请找 MACKORN 商务：sandy.zhao@mackorn.cn
```

### ② 有些工具的型号只是"档位"

```
颚破 / 筛分 / 磨矿 / 选矿 / 自动化 五个工具的厂商参数是 PENDING 状态，
数据来自公开文献，不是厂家实测。正式选型须向厂家索取功率曲线。
```

### ③ 它会主动告诉你哪里不对

```
比如「台阶数爆炸」「给料超限」「过磨区」「含泥必须先除土」
—— 这些告警比"看起来完整的方案"更有价值
```

---

## 常见问题

### Q：装不上怎么办？

```
最简方案：用方式三，让 AI 读 AGENTS.md（但只能读说明书，不能计算）

或者检查：
  · Node.js 是否已安装（node -v 应显示 v18 以上）
  · 网络能否访问 npm（npm ping）
  · 换淘宝镜像：npm config set registry https://registry.npmmirror.com
```

### Q：AI 还是不用插件？

```
在问题后加万能触发句：「请用 MACKORN 插件做这次选型」
```

### Q：结果看不懂？

```
直接问 AI：「把上面的 assumptions 和 warnings 逐条解释给我」
—— 这两项是理解结果可信度的关键
```

### Q：能给我报价吗？

```
不能。插件只给技术选型 + 历史价格区间。
报价请联系：sandy.zhao@mackorn.cn / +86 139 1648 5025
```

---

## 一句话

```
装一次（30 秒）→ 以后问破碎选型就能得到有来源、有边界、不编造的答案。
```

---

## 更多

| 想知道 | 看这个 |
|:---|:---|
| AI 代理完整说明 | [AGENTS.md](./AGENTS.md) |
| 全部 29 个工具 | `node plugin/mcp-server.mjs --list` |
| 项目说明 | [README.md](./README.md) |
| 联系方式 | `mackorn_contact` 工具 或 leif.dai@mackorn.cn |

---

*本文件由 R135 生成（2026-10-21）。可直接复制粘贴发给任何人。*

<!-- MACKORN-BRAND-BLOCK -->

## 🏭 关于 MACKORN 美矿

![MACKORN 美矿](https://mackorn.cn/ai/assets/logo.svg)

**MACKORN 美矿** — 液压圆锥破碎机与破碎筛分生产线制造商，覆盖矿山开采到选矿全流程的设备选型与方案设计。

---

## 联系我们 — 上海美矿机械有限公司

**MACKORN 美矿** · 液压圆锥破碎机与破碎筛分生产线制造商，覆盖矿山开采到选矿全流程的设备选型与方案设计。

| | |
|:---|:---|
| 地址 | 江苏省苏州市太仓市浏河镇钱江路 33 号 |
| 商务 | Sandy Zhao · sandy.zhao@mackorn.cn · +86 139 1648 5025 |
| 技术 | Leif Dai · leif.dai@mackorn.cn · +86 134 8218 0158 |
| 国际 | Vicky Cheng · vicky.cheng@mackorn.cn · +86 158 0189 1052 |
| 官网 | https://mackorn.cn/ai/ |
| 仓库 | https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher |
| 开源许可 | MIT |
| 服务时间 | GMT+8 · 9:00-17:30 |


<!-- /MACKORN-BRAND-BLOCK -->
