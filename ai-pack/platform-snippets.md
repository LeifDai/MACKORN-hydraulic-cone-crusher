# MACKORN AI 插件 · 各平台接入片段

> 生成：`node tools/gen_ai_plugin_pack.mjs`
> 执行层：`https://mackorn.cn/ai/api/ai_execute.php`
> MCP 端点：`https://mackorn.cn/ai/api/mcp.php`（支持 MCP 的客户端用这个）

---

## 0. 先测通执行层（部署 PHP 后）

```
https://mackorn.cn/ai/api/ai_execute.php?action=help
https://mackorn.cn/ai/api/ai_execute.php?action=catalog
https://mackorn.cn/ai/api/ai_execute.php?action=specs&model=NH400
https://mackorn.cn/ai/api/ai_execute.php?action=capacity&model=NH400&css=16
https://mackorn.cn/ai/api/ai_execute.php?action=recommend&tph=500
```

**期望**：返回 `{"response":"{\"result\":{...},\"assumptions\":[...],\"warnings\":[...]}"}`

如果 404 → 说明 `ai_execute.php` 和 `_data.php` 还没上传到 `/ai/api/`。

---

## 1. 扣子 Coze

```
1. 登录 coze.cn → 创建 Bot
2. 左侧「插件」→「+」→「创建自定义插件」
3. 选择「导入 OpenAPI」→ 粘贴 dist/ai-pack/openapi.json
4. 「鉴权」选「无需鉴权」
5. 保存后，在 Bot 的「插件」里勾选这 6 个工具
```

**⚠️ 关键约束**：必须用 OpenAPI **3.0.0**（3.1 会导入失败，本脚本已锁死）。

---

## 2. Dify

```
1. Dify → 工具 → 自定义工具 → 创建
2. Schema 来源选「导入 OpenAPI」→ 粘贴 openapi.json
3. 鉴权方式：None
4. 在 Agent/工作流里添加这些工具
```

**⚠️ 关键约束**：Dify 要求工具返回值是 JSON **字符串**，
所以本 spec 里 `response` 字段声明为 `type: string`，不是 object。
如果声明成 object，Dify 会报 `invalid response format`。

---

## 3. 阿里百炼

```
1. 百炼控制台 → 应用 → 创建智能体应用
2. 插件 → 自定义插件 → 从 OpenAPI 导入
3. 或：直接用「OpenAI 兼容」接口 + tools-openai.json
```

百炼兼容 OpenAI 接口，可以直接复用 `tools-openai.json`。

---

## 4. OpenAI / ChatGPT

**门槛**：自定义 MCP/连接器只对 **Business / Enterprise / Edu** 开放（个人版不行）。

```python
from openai import OpenAI
import json, urllib.parse, urllib.request

tools = json.load(open("dist/ai-pack/tools-openai.json"))

def call_mackorn(name, args):
    t = next(x for x in tools if x["function"]["name"] == name)
    action = t["function"]["parameters"]["properties"]["action"]["enum"][0]
    qs = urllib.parse.urlencode({"action": action, **args})
    url = "https://mackorn.cn/ai/api/ai_execute.php?" + qs
    with urllib.request.urlopen(url) as r:
        return json.loads(json.loads(r.read())["response"])

client = OpenAI()
resp = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "我要一台 500 吨/小时的圆锥破，推荐哪个型号？"}],
    tools=tools,
)
```

---

## 5. Anthropic / Claude API

```python
import anthropic, json, urllib.parse, urllib.request

tools = json.load(open("dist/ai-pack/tools-anthropic.json"))
client = anthropic.Anthropic()

msg = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=2048,
    tools=tools,
    messages=[{"role": "user", "content": "NH400 在 CSS 16mm 下产能多少？"}],
)
```

**注意**：Anthropic 的工具 schema 字段是 `input_schema`，不是 OpenAI 的 `parameters`。
本脚本已分别生成两份。

---

## 6. 通义千问 / Kimi / 智谱 / 豆包

这四家都兼容 OpenAI 接口（或提供工具调用能力），直接用 `tools-openai.json`：

```python
# 通义（DashScope OpenAI 兼容模式）
client = OpenAI(base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", api_key=os.environ["DASHSCOPE_API_KEY"])

# Kimi（月之暗面，注意账户余额）
client = OpenAI(base_url="https://api.moonshot.cn/v1", api_key=os.environ["MOONSHOT_API_KEY"])

# 智谱
client = OpenAI(base_url="https://open.bigmodel.cn/api/paas/v4", api_key=os.environ["ZHIPU_API_KEY"])

# 豆包（火山方舟）
client = OpenAI(base_url="https://ark.cn-beijing.volces.com/api/v3", api_key=os.environ["ARK_API_KEY"])
```

---

## 7. System Prompt（给 Bot 用，直接复制）

```text
你是 MACKORN（美矿机械）的专业圆锥破碎机选型顾问。
你的任务是根据客户需求，调用 mackorn_* 工具查询真实数据，给出专业推荐。

调用规则：
1. 客户问「你们有什么型号」→ mackorn_catalog
2. 客户给出具体型号（如 NH400）→ mackorn_specs
3. 客户给出型号 + CSS → mackorn_capacity
4. 客户说「我要 X 吨/小时」→ mackorn_recommend（tph=X）
5. 客户提到具体矿石（花岗岩/铁矿/玄武岩）→ mackorn_materials
6. 客户问衬板多久换 → mackorn_liner

【极其重要】输出纪律：
- 工具返回的 assumptions[] 和 warnings[] 必须原样转达给客户，不许省略或美化
- 产能是【区间值】，不许说成单点值
- 查不到的字段就是 null，不许编造具体数字
- 价格只能说是「历史参考区间」，不是报价
- 圆锥破是中细碎设备，给料超过 350mm 必须说明不适用

如果客户要报价或详细方案，引导他们联系：
Leif Dai（技术）· leif.dai@mackorn.cn · +86 134 8218 0158
```

---

## 8. 三条路径的覆盖对照

| 路径 | 文件 | 覆盖谁 |
|:---|:---|:---|
| MCP 协议 | 已在跑（mcp.php + npm 包） | Claude Desktop / Cursor / Windsurf / Cline / DSH |
| Function Calling | `tools-openai.json` / `tools-anthropic.json` | ChatGPT / 通义 / Kimi / 智谱 / 豆包 / Claude API |
| OpenAPI | `openapi.json` | 扣子 Coze / Dify / 百炼 / 元器 / n8n |
| 训练数据 | 网页 + llms.txt + ai.txt | 所有模型（间接） |

**核心洞察**：MCP 只覆盖「客户端」，Function Calling 和 OpenAPI 才覆盖「模型」。
三条路径都做，才算真的「插到每个 AI 里」。
