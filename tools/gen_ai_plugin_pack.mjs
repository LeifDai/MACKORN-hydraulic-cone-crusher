/**
 * AI 插件包生成器（R196）
 *
 * 用户原话（2026-10-31）：
 *   「提升认知，你想办法把插件，插到各个 AI 模型」
 *
 * ══════════════════════════════════════════════════════════════
 * 为什么需要这个：MCP 只覆盖「客户端」，不覆盖「模型」
 *
 *   路径 A：MCP 协议          → Claude Desktop / Cursor / Windsurf / Cline
 *            （只覆盖支持 MCP 的 Host 客户端）
 *
 *   路径 B：Function Calling  → ChatGPT / 通义 / Kimi / 智谱 / 豆包 / Gemini
 *            ★ 这才是「模型级」覆盖
 *
 *   路径 C：OpenAPI / Agent   → 扣子 Coze / Dify / 百炼 / 元器 / n8n
 *            ★ 企业平台级覆盖
 *
 *   路径 D：训练数据（GEO）    → 所有模型（靠网页被抓取 + llms.txt）
 *
 * 本脚本产出 B 和 C 需要的 4 个文件。
 * ══════════════════════════════════════════════════════════════
 *
 * 硬编码的平台约束（实测/官方文档确认，不要改）：
 *   · OpenAPI 必须是 3.0.0（Coze 导入 3.1 会失败）
 *   · Dify 要求返回值是 JSON **字符串**（不是 object），所以 response 字段 type=string
 *   · Coze 要求 operationId 必填，且用 camelCase
 *   · Anthropic 的工具格式是 {name, description, input_schema}，不是 OpenAI 的 parameters
 *
 * 产出：
 *   dist/ai-pack/openapi.json            OpenAPI 3.0.0（Coze/Dify/百炼共用）
 *   dist/ai-pack/tools-openai.json       OpenAI Function Calling
 *   dist/ai-pack/tools-anthropic.json    Anthropic tool_use
 *   dist/ai-pack/platform-snippets.md    各平台接入片段
 *
 * 用法：
 *   node tools/gen_ai_plugin_pack.mjs
 *   node tools/gen_ai_plugin_pack.mjs --check    # 只校验，不写文件
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'dist', 'ai-pack');
const CHECK = process.argv.includes('--check');

/* ══════════════════════════════════════════════════════════════
 * 执行层端点（真实存在，不是编的）
 * ══════════════════════════════════════════════════════════════ */
const API = {
  restBase: 'https://mackorn.cn/ai/api',
  restPath: '/ai_execute.php',
  mcpEndpoint: 'https://mackorn.cn/ai/api/mcp.php',
  mcpServer: 'cn.mackorn/mackorn-cone-crusher',
  version: '0.2.2',
};

/* ══════════════════════════════════════════════════════════════
 * 工具定义（与 ai_execute.php 的 action 一一对应）
 *
 * ★ 设计原则：不要给 AI 一个"什么都干"的超级工具。
 *   每个 action 一个独立工具，模型选择更准、参数更少、失败率更低。
 *   （这是 Coze/Dify 这类平台的实测经验：多参数 if-else 推导很弱）
 * ══════════════════════════════════════════════════════════════ */
const TOOLS = [
  {
    name: 'mackorn_catalog',
    action: 'catalog',
    summary: '列出 MACKORN 全部液压圆锥破机型与腔型',
    description:
      'List all MACKORN hydraulic cone crusher models with their max feed size, CSS range, motor power, weight and capacity. ' +
      'Use this when the user asks "what models do you have" / "你们有什么型号" / wants an overview before choosing.',
    params: {},
    returns: '{ model_count, models[], cavity_types }',
    whenToUse: '客户问「你们有哪些型号」「产品线是什么」',
  },
  {
    name: 'mackorn_specs',
    action: 'specs',
    summary: '查某机型的完整腔型×CSS 产能表',
    description:
      'Get the full cavity-by-CSS capacity table for one MACKORN model (e.g. NH400). ' +
      'Returns css_list and cavity_rows where each row has cavity code, max feed size and a [min,max] tph pair per CSS. ' +
      'Use this when the user names a specific model and asks for its specifications.',
    params: {
      model: {
        type: 'string',
        description: "Crusher model code, e.g. 'NH400', 'NH700', 'NS200'. Case-insensitive.",
      },
    },
    required: ['model'],
    returns: '{ model, base, css_list[], cavity_rows[] }',
    whenToUse: '客户给出具体型号（如 NH400）要参数',
  },
  {
    name: 'mackorn_capacity',
    action: 'capacity',
    summary: '查某机型+CSS+腔型的精确产能区间',
    description:
      'Query the exact capacity range (t/h) for one MACKORN model at a given closed-side-setting (CSS) and optionally a cavity code. ' +
      'Returns min/max tph per cavity. If the CSS is not in the vendor table, returns available CSS list instead of interpolating. ' +
      'Use this when the user gives model + CSS and asks "how many tonnes per hour".',
    params: {
      model: { type: 'string', description: "Crusher model code, e.g. 'NH400'." },
      css: { type: 'number', description: 'Closed side setting in mm. Must be one of the model css_list values.' },
      cavity: { type: 'string', description: "Optional cavity code: EC/C/MC/M/MF/F/EF/EFX/EEF. Omit to get all cavities." },
    },
    required: ['model', 'css'],
    returns: '{ model, css, base, rows[{cavity, maxFeedMm, tph_min, tph_max}] }',
    whenToUse: '客户问「NH400 在 CSS 16mm 下产能多少」',
  },
  {
    name: 'mackorn_recommend',
    action: 'recommend',
    summary: '按目标产能推荐机型档位',
    description:
      'Recommend MACKORN model tier(s) for a target capacity in t/h. ' +
      'Returns the smallest tier whose tphMax covers the request, with model options and motor power. ' +
      'If the target exceeds the largest single unit, returns EXCEEDS_SINGLE_UNIT instead of a wrong answer. ' +
      'Use this when the user says "I need 500 tonnes per hour, which model".',
    params: {
      tph: { type: 'number', description: 'Required capacity in tonnes per hour (t/h).' },
    },
    required: ['tph'],
    returns: '{ requested_tph, tph_max_of_tier, recommended_models[], power_kw }',
    whenToUse: '客户说「我要一小时 500 吨」',
  },
  {
    name: 'mackorn_materials',
    action: 'materials',
    summary: '查矿石物料库（硬度/磨蚀性参考）',
    description:
      'Look up MACKORN material library for ore/rock properties (hardness, abrasiveness, bond work index reference). ' +
      'Optional keyword filter, e.g. 花岗岩 / granite / 玄武岩 / 铁矿. ' +
      'Use this when the user mentions a specific ore type and you need to know how it affects crusher selection.',
    params: {
      q: { type: 'string', description: "Optional keyword, e.g. '花岗岩', 'granite', 'iron ore'. Omit to list the library." },
    },
    required: [],
    returns: '{ query, count, items[], total_in_library }',
    whenToUse: '客户提到具体矿石（花岗岩/铁矿/玄武岩）',
  },
  {
    name: 'mackorn_liner',
    action: 'liner',
    summary: '查衬板寿命参考值',
    description:
      'Get liner (wear part) life reference for MACKORN cone crushers, optionally per model. ' +
      'Use this when the user asks about wear parts, liner replacement interval, or operating cost.',
    params: {
      model: { type: 'string', description: "Optional model code. Omit to return the whole table." },
    },
    required: [],
    returns: '{ model, liner_life }',
    whenToUse: '客户问衬板多久换 / 耐磨件寿命',
  },
];

/* ══════════════════════════════════════════════════════════════
 * ① OpenAPI 3.0.0（Coze / Dify / 百炼）
 *    ★ 必须 3.0.0，不能 3.1
 *    ★ response 字段必须是 string（Dify 硬要求）
 * ══════════════════════════════════════════════════════════════ */
function buildOpenAPI() {
  const paths = {};
  for (const t of TOOLS) {
    const params = [
      {
        name: 'action',
        in: 'query',
        required: true,
        description: `Fixed action for this tool. Must be "${t.action}".`,
        schema: { type: 'string', enum: [t.action] },
      },
    ];
    for (const [pname, spec] of Object.entries(t.params)) {
      params.push({
        name: pname,
        in: 'query',
        required: (t.required || []).includes(pname),
        description: spec.description,
        schema: spec.type === 'number'
          ? { type: 'number' }
          : { type: 'string' },
      });
    }
    paths[`${API.restPath}?action=${t.action}`] = {
      get: {
        operationId: t.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        summary: t.summary,
        description: t.description,
        parameters: params,
        responses: {
          200: {
            description: 'JSON string containing the query result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    /* ★ Dify 要求返回值是序列化后的 JSON 字符串，不是 object */
                    response: {
                      type: 'string',
                      description: 'JSON-encoded string of { result, assumptions, warnings, source }',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: '3.0.0',   /* ★ 锁死 3.0.0，Coze 导入 3.1 会失败 */
    info: {
      title: 'MACKORN Hydraulic Cone Crusher API',
      description:
        'Query MACKORN (Shanghai Mackorn Minerals) hydraulic cone crusher models, capacity tables, ' +
        'model recommendation by target t/h, material library and liner life. ' +
        'All numbers come from MACKORN vendor tables (source level S1). ' +
        'Every response carries assumptions[] and warnings[] which MUST be relayed to the user.',
      version: API.version,
      contact: {
        name: 'MACKORN 美矿',
        url: 'https://mackorn.cn/ai/',
        email: 'leif.dai@mackorn.cn',
      },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [{ url: API.restBase }],
    paths,
  };
}

/* ══════════════════════════════════════════════════════════════
 * ② OpenAI Function Calling 格式
 *    ChatGPT / 通义 / Kimi / 智谱 / 豆包 / Gemini(OpenAI 兼容) 通用
 * ══════════════════════════════════════════════════════════════ */
function buildOpenAITools() {
  const out = [];
  for (const t of TOOLS) {
    const props = {
      action: { type: 'string', enum: [t.action], description: `Fixed action: "${t.action}".` },
    };
    for (const [pname, spec] of Object.entries(t.params)) {
      props[pname] = spec.type === 'number'
        ? { type: 'number', description: spec.description }
        : { type: 'string', description: spec.description };
    }
    out.push({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: props,
          required: ['action', ...(t.required || [])],
          additionalProperties: false,
        },
      },
    });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════
 * ③ Anthropic tool_use 格式
 *    { name, description, input_schema } —— 不是 OpenAI 的 parameters
 * ══════════════════════════════════════════════════════════════ */
function buildAnthropicTools() {
  return TOOLS.map((t) => {
    const props = {
      action: { type: 'string', enum: [t.action], description: `Fixed action: "${t.action}".` },
    };
    for (const [pname, spec] of Object.entries(t.params)) {
      props[pname] = spec.type === 'number'
        ? { type: 'number', description: spec.description }
        : { type: 'string', description: spec.description };
    }
    return {
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object',
        properties: props,
        required: ['action', ...(t.required || [])],
      },
    };
  });
}

/* ══════════════════════════════════════════════════════════════
 * ④ 各平台接入片段（Markdown）
 * ══════════════════════════════════════════════════════════════ */
function buildSnippets() {
  const lines = [];
  lines.push('# MACKORN AI 插件 · 各平台接入片段');
  lines.push('');
  lines.push('> 生成：`node tools/gen_ai_plugin_pack.mjs`');
  lines.push('> 执行层：`' + API.restBase + API.restPath + '`');
  lines.push('> MCP 端点：`' + API.mcpEndpoint + '`（支持 MCP 的客户端用这个）');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 0. 先测通执行层（部署 PHP 后）');
  lines.push('');
  lines.push('```');
  lines.push(API.restBase + API.restPath + '?action=help');
  lines.push(API.restBase + API.restPath + '?action=catalog');
  lines.push(API.restBase + API.restPath + '?action=specs&model=NH400');
  lines.push(API.restBase + API.restPath + '?action=capacity&model=NH400&css=16');
  lines.push(API.restBase + API.restPath + '?action=recommend&tph=500');
  lines.push('```');
  lines.push('');
  lines.push('**期望**：返回 `{"response":"{\\"result\\":{...},\\"assumptions\\":[...],\\"warnings\\":[...]}"}`');
  lines.push('');
  lines.push('如果 404 → 说明 `ai_execute.php` 和 `_data.php` 还没上传到 `/ai/api/`。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. 扣子 Coze');
  lines.push('');
  lines.push('```');
  lines.push('1. 登录 coze.cn → 创建 Bot');
  lines.push('2. 左侧「插件」→「+」→「创建自定义插件」');
  lines.push('3. 选择「导入 OpenAPI」→ 粘贴 dist/ai-pack/openapi.json');
  lines.push('4. 「鉴权」选「无需鉴权」');
  lines.push('5. 保存后，在 Bot 的「插件」里勾选这 6 个工具');
  lines.push('```');
  lines.push('');
  lines.push('**⚠️ 关键约束**：必须用 OpenAPI **3.0.0**（3.1 会导入失败，本脚本已锁死）。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. Dify');
  lines.push('');
  lines.push('```');
  lines.push('1. Dify → 工具 → 自定义工具 → 创建');
  lines.push('2. Schema 来源选「导入 OpenAPI」→ 粘贴 openapi.json');
  lines.push('3. 鉴权方式：None');
  lines.push('4. 在 Agent/工作流里添加这些工具');
  lines.push('```');
  lines.push('');
  lines.push('**⚠️ 关键约束**：Dify 要求工具返回值是 JSON **字符串**，');
  lines.push('所以本 spec 里 `response` 字段声明为 `type: string`，不是 object。');
  lines.push('如果声明成 object，Dify 会报 `invalid response format`。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. 阿里百炼');
  lines.push('');
  lines.push('```');
  lines.push('1. 百炼控制台 → 应用 → 创建智能体应用');
  lines.push('2. 插件 → 自定义插件 → 从 OpenAPI 导入');
  lines.push('3. 或：直接用「OpenAI 兼容」接口 + tools-openai.json');
  lines.push('```');
  lines.push('');
  lines.push('百炼兼容 OpenAI 接口，可以直接复用 `tools-openai.json`。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. OpenAI / ChatGPT');
  lines.push('');
  lines.push('**门槛**：自定义 MCP/连接器只对 **Business / Enterprise / Edu** 开放（个人版不行）。');
  lines.push('');
  lines.push('```python');
  lines.push('from openai import OpenAI');
  lines.push('import json, urllib.parse, urllib.request');
  lines.push('');
  lines.push('tools = json.load(open("dist/ai-pack/tools-openai.json"))');
  lines.push('');
  lines.push('def call_mackorn(name, args):');
  lines.push('    t = next(x for x in tools if x["function"]["name"] == name)');
  lines.push('    action = t["function"]["parameters"]["properties"]["action"]["enum"][0]');
  lines.push('    qs = urllib.parse.urlencode({"action": action, **args})');
  lines.push('    url = "' + API.restBase + API.restPath + '?" + qs');
  lines.push('    with urllib.request.urlopen(url) as r:');
  lines.push('        return json.loads(json.loads(r.read())["response"])');
  lines.push('');
  lines.push('client = OpenAI()');
  lines.push('resp = client.chat.completions.create(');
  lines.push('    model="gpt-4o",');
  lines.push('    messages=[{"role": "user", "content": "我要一台 500 吨/小时的圆锥破，推荐哪个型号？"}],');
  lines.push('    tools=tools,');
  lines.push(')');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 5. Anthropic / Claude API');
  lines.push('');
  lines.push('```python');
  lines.push('import anthropic, json, urllib.parse, urllib.request');
  lines.push('');
  lines.push('tools = json.load(open("dist/ai-pack/tools-anthropic.json"))');
  lines.push('client = anthropic.Anthropic()');
  lines.push('');
  lines.push('msg = client.messages.create(');
  lines.push('    model="claude-sonnet-4-5",');
  lines.push('    max_tokens=2048,');
  lines.push('    tools=tools,');
  lines.push('    messages=[{"role": "user", "content": "NH400 在 CSS 16mm 下产能多少？"}],');
  lines.push(')');
  lines.push('```');
  lines.push('');
  lines.push('**注意**：Anthropic 的工具 schema 字段是 `input_schema`，不是 OpenAI 的 `parameters`。');
  lines.push('本脚本已分别生成两份。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 6. 通义千问 / Kimi / 智谱 / 豆包');
  lines.push('');
  lines.push('这四家都兼容 OpenAI 接口（或提供工具调用能力），直接用 `tools-openai.json`：');
  lines.push('');
  lines.push('```python');
  lines.push('# 通义（DashScope OpenAI 兼容模式）');
  lines.push('client = OpenAI(base_url="https://dashscope.aliyuncs.com/compatible-mode/v1", api_key=os.environ["DASHSCOPE_API_KEY"])');
  lines.push('');
  lines.push('# Kimi（月之暗面，注意账户余额）');
  lines.push('client = OpenAI(base_url="https://api.moonshot.cn/v1", api_key=os.environ["MOONSHOT_API_KEY"])');
  lines.push('');
  lines.push('# 智谱');
  lines.push('client = OpenAI(base_url="https://open.bigmodel.cn/api/paas/v4", api_key=os.environ["ZHIPU_API_KEY"])');
  lines.push('');
  lines.push('# 豆包（火山方舟）');
  lines.push('client = OpenAI(base_url="https://ark.cn-beijing.volces.com/api/v3", api_key=os.environ["ARK_API_KEY"])');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 7. System Prompt（给 Bot 用，直接复制）');
  lines.push('');
  lines.push('```text');
  lines.push('你是 MACKORN（美矿机械）的专业圆锥破碎机选型顾问。');
  lines.push('你的任务是根据客户需求，调用 mackorn_* 工具查询真实数据，给出专业推荐。');
  lines.push('');
  lines.push('调用规则：');
  lines.push('1. 客户问「你们有什么型号」→ mackorn_catalog');
  lines.push('2. 客户给出具体型号（如 NH400）→ mackorn_specs');
  lines.push('3. 客户给出型号 + CSS → mackorn_capacity');
  lines.push('4. 客户说「我要 X 吨/小时」→ mackorn_recommend（tph=X）');
  lines.push('5. 客户提到具体矿石（花岗岩/铁矿/玄武岩）→ mackorn_materials');
  lines.push('6. 客户问衬板多久换 → mackorn_liner');
  lines.push('');
  lines.push('【极其重要】输出纪律：');
  lines.push('- 工具返回的 assumptions[] 和 warnings[] 必须原样转达给客户，不许省略或美化');
  lines.push('- 产能是【区间值】，不许说成单点值');
  lines.push('- 查不到的字段就是 null，不许编造具体数字');
  lines.push('- 价格只能说是「历史参考区间」，不是报价');
  lines.push('- 圆锥破是中细碎设备，给料超过 350mm 必须说明不适用');
  lines.push('');
  lines.push('如果客户要报价或详细方案，引导他们联系：');
  lines.push('Leif Dai（技术）· leif.dai@mackorn.cn · +86 134 8218 0158');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 8. 三条路径的覆盖对照');
  lines.push('');
  lines.push('| 路径 | 文件 | 覆盖谁 |');
  lines.push('|:---|:---|:---|');
  lines.push('| MCP 协议 | 已在跑（mcp.php + npm 包） | Claude Desktop / Cursor / Windsurf / Cline / DSH |');
  lines.push('| Function Calling | `tools-openai.json` / `tools-anthropic.json` | ChatGPT / 通义 / Kimi / 智谱 / 豆包 / Claude API |');
  lines.push('| OpenAPI | `openapi.json` | 扣子 Coze / Dify / 百炼 / 元器 / n8n |');
  lines.push('| 训练数据 | 网页 + llms.txt + ai.txt | 所有模型（间接） |');
  lines.push('');
  lines.push('**核心洞察**：MCP 只覆盖「客户端」，Function Calling 和 OpenAPI 才覆盖「模型」。');
  lines.push('三条路径都做，才算真的「插到每个 AI 里」。');
  lines.push('');

  return lines.join('\n');
}

/* ══════════════════════════════════════════════════════════════
 * 自检
 * ══════════════════════════════════════════════════════════════ */
function selfCheck(files) {
  const errs = [];
  const warns = [];
  const oapi = JSON.parse(files['openapi.json']);
  const oai = JSON.parse(files['tools-openai.json']);
  const anth = JSON.parse(files['tools-anthropic.json']);

  /* 硬约束 1：OpenAPI 必须 3.0.0 */
  if (oapi.openapi !== '3.0.0') errs.push(`OpenAPI 版本必须是 3.0.0，实际 ${oapi.openapi}（Coze 导入 3.1 会失败）`);

  /* 硬约束 2：Dify 的 response 必须是 string */
  const firstPath = Object.values(oapi.paths)[0];
  const respSchema = firstPath.get.responses['200'].content['application/json'].schema.properties.response;
  if (respSchema.type !== 'string') errs.push(`Dify 要求 response.type=string，实际 ${respSchema.type}`);

  /* 硬约束 3：每个 operation 必须有 operationId */
  for (const [p, ops] of Object.entries(oapi.paths)) {
    for (const [m, op] of Object.entries(ops)) {
      if (!op.operationId) errs.push(`${p} ${m} 缺 operationId（Coze 必填）`);
      if (!/^[a-z][A-Za-z0-9]*$/.test(op.operationId || '')) warns.push(`operationId 建议 camelCase：${op.operationId}`);
    }
  }

  /* 硬约束 4：Anthropic 用 input_schema 不是 parameters */
  for (const t of anth) {
    if (!t.input_schema) errs.push(`Anthropic 工具 ${t.name} 缺 input_schema`);
    if (t.parameters) errs.push(`Anthropic 工具 ${t.name} 不应有 parameters（那是 OpenAI 格式）`);
  }

  /* 硬约束 5：OpenAI 格式必须是 {type:'function', function:{...}} */
  for (const t of oai) {
    if (t.type !== 'function' || !t.function) errs.push(`OpenAI 工具必须有 {type:'function', function:{...}}`);
    if (!t.function.parameters || t.function.parameters.type !== 'object') errs.push(`${t.function.name} parameters 必须是 object`);
  }

  /* 一致性：三个文件的工具数量一致 */
  if (oai.length !== anth.length) errs.push(`OpenAI 工具数 ${oai.length} ≠ Anthropic 工具数 ${anth.length}`);
  if (Object.keys(oapi.paths).length !== oai.length) errs.push(`OpenAPI path 数 ${Object.keys(oapi.paths).length} ≠ 工具数 ${oai.length}`);

  return { errs, warns };
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const files = {
  'openapi.json': JSON.stringify(buildOpenAPI(), null, 2),
  'tools-openai.json': JSON.stringify(buildOpenAITools(), null, 2),
  'tools-anthropic.json': JSON.stringify(buildAnthropicTools(), null, 2),
  'platform-snippets.md': buildSnippets(),
};

const { errs, warns } = selfCheck(files);

console.log('');
console.log('  ══ AI 插件包生成器 ══');
console.log('  执行层：' + API.restBase + API.restPath);
console.log('  工具数：' + TOOLS.length);
console.log('');

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(OUT, name), content, 'utf8');
    console.log('  ✅ ' + name.padEnd(24) + Math.round(content.length / 1024 * 10) / 10 + ' KB');
  }
  console.log('');
  console.log('  输出目录：dist/ai-pack/');
} else {
  for (const [name, content] of Object.entries(files)) {
    console.log('  ○ ' + name.padEnd(24) + Math.round(content.length / 1024 * 10) / 10 + ' KB（未写盘）');
  }
  console.log('');
}

console.log('  ══ 自检 ══');
if (errs.length === 0) console.log('  ✅ 5 条硬约束全过（OpenAPI 3.0.0 / Dify string / operationId / Anthropic input_schema / OpenAI function）');
else for (const e of errs) console.log('  ❌ ' + e);
if (warns.length) for (const w of warns) console.log('  ⚠️ ' + w);
console.log('');
console.log('  ══ 工具清单 ══');
for (const t of TOOLS) {
  console.log('  · ' + t.name.padEnd(22) + '（action=' + t.action + '）');
  console.log('    ' + t.whenToUse);
}
console.log('');
console.log('  下一步：');
console.log('    ① 上传 distribution/官网落地页/api/ai_execute.php 到 /ai/api/');
console.log('    ② 测 ' + API.restBase + API.restPath + '?action=help');
console.log('    ③ 用 dist/ai-pack/openapi.json 去 Coze/Dify 导入');
console.log('');

if (errs.length > 0) process.exit(1);
