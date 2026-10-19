/**
 * 导出 Harness 约束清单（R89）
 *
 * 为什么需要（读徐庆贺演讲后想通的）：
 *   演讲：「Harness 本身是什么意思？就是给它一个框架、一个约束。
 *          把操控、数据、权限都框起来，让 Agent 在一个有约束的环境中
 *          为你服务，这样反而能发挥更大的实力。」
 *
 *   我们其实【已经有一套 Harness】：五条硬规矩 + 18 条护栏 + 29 项门禁 + 58 条教训。
 *   但它们是**隐式**的 —— 散在代码和文档里，外部读不到。
 *
 *   于是产生一个真实问题：
 *     一个接手的 Agent（云端的我 / 别人 / 另一个 AI）
 *     不知道边界在哪，可能做出我们绝不允许的事。
 *
 *   本工具把 Harness 导成【机器可读的一份文件】：
 *     distribution/03_验证与基准/harness.json
 *   谁接手，先读这个。
 *
 * 这也是"Agent 上岗"的必要条件：工位要有说明书。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');

/* ── ① 五条硬规矩（写死，因为它们是项目的立身之本）── */
const HARD_RULES = [
  { id: 'HR-1', rule: '绝不编造数字', how: '未知字段返回 null', why: '一个编造的"200mm"会让客户买错设备；一个诚实的 null 只会让客户多问一句' },
  { id: 'HR-2', rule: '每个结论必须带来源', how: 'S1 厂商 / S2 标准 / S3 文献 / S4 经验 / S5 手册', why: '没有来源的数字不该进代码' },
  { id: 'HR-3', rule: '冲突数据并列保留，绝不取平均', how: 'conflict[] 数组，不做数值合并', why: '取平均会把一个明确的矛盾变成看不见的错误' },
  { id: 'HR-4', rule: '承认边界', how: '液压圆锥破给料 > 350mm 必须拒绝', why: '它不是粗碎机，硬算会给出误导结果' },
  { id: 'HR-5', rule: '不信任自我报告', how: '必须真跑门禁，不能信"应该没问题"', why: '本会话多次出现"工具自报成功但实际失败"' },
];

/* ── ② 护栏规则（真读，不写死）── */
let guardRules = [];
try {
  const G = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'guardrails.mjs')).href);
  guardRules = (G.GUARD_RULES || []).map((r) => ({ id: r.id, severity: r.severity, desc: r.desc || r.description || r.title || '' }));
} catch (e) { guardRules = [{ error: String(e.message).slice(0, 80) }]; }

/* ── ③ 门禁项（真数，不写死）── */
let gates = [];
try {
  const g = readFileSync(join(ROOT, 'tools', 'enforce_lessons.mjs'), 'utf8');
  gates = [...g.matchAll(/rec\('([^']+)',\s*'([^']*)'/g)].map((m) => ({ id: m[1], name: m[2] }));
} catch { }

/* ── ④ 教训数 + 教训清单（真读）── */
let lessons = [];
try {
  const L = await import(pathToFileURL(join(ROOT, 'tools', 'lessons.mjs')).href);
  lessons = (L.LESSONS || []).map((l) => ({ id: l.id, area: l.area, title: l.title }));
} catch { }

/* ── ⑤ 云端边界（我们反复确认过的：云端做不到什么）── */
const CLOUD_BOUNDARY = {
  can: [
    '每 2 小时跑完全部门禁（29+ 步）',
    '发现回归时报红叉',
    '把夜间报告与经验库写回仓库',
    '在无人值守时持续发现回归',
  ],
  cannot: [
    '写新功能（Actions 只跑已有脚本）',
    '上传网站（需要服务器凭据）',
    '发布 npm（需要 npm token）',
    '发布 MCP Registry（需要 registry 凭据）',
    '修改仓库描述 / Topics（需网页操作）',
    '做业务判断（如"ja/de/tr 是规划中还是缺页面"）',
  ],
};

/* ── ⑥ 人机分工（谁必须做什么）── */
const HUMAN_REQUIRED = [
  { task: '把代码推到 GitHub', why: '需要账号认证（本机无凭据）', tool: 'tools/finish_all.mjs 或网页上传' },
  { task: '创建 GitHub token', why: '需要登录 GitHub', tool: 'https://github.com/settings/tokens/new' },
  { task: '上传网站更新包', why: '需要服务器凭据', tool: 'distribution/_deploy/' },
  { task: '发布 npm 新版本', why: '需要 npm token', tool: 'npm publish' },
  { task: 'Glama 重新评估', why: '需要在 Glama 网页点击', tool: 'glama.ai Admin 标签页' },
  { task: '报价与合同', why: '本插件明确不做价格承诺', tool: '商务渠道（sandy.zhao@mackorn.cn）' },
  { task: '现场勘查与材料试验', why: '插件是离线计算工具，替代不了现场', tool: '—' },
];

/* ── ⑦ 输出 ── */
const out = {
  schema: 'mackorn-harness/1',
  generated: new Date().toISOString(),
  what_this_is: 'MACKORN 插件的运行边界清单。任何接手的 Agent（云端/他人/另一个 AI）应先读本文件，再动手。',
  hard_rules: HARD_RULES,
  guardrails: { count: guardRules.length, rules: guardRules },
  gates: { count: gates.length, items: gates },
  lessons: { count: lessons.length, items: lessons },
  cloud_boundary: CLOUD_BOUNDARY,
  human_required: HUMAN_REQUIRED,
  how_to_verify: [
    'node tests/run.mjs              # 单元测试 + 负控',
    'node tools/enforce_lessons.mjs  # L2 门禁',
    'node tools/self_audit.mjs       # 十三维自检',
    'node tools/build_public.mjs     # 合规/版本/标签门禁',
    'node tools/check_survival_law.mjs  # 机会生存法则',
  ],
  forbidden: [
    '编造数字 / 估算冒充实测',
    '发布价格（本项目不发布价格）',
    '提供法律意见',
    '把冲突数据取平均',
    '放宽物理边界（350mm 给料等）',
    '提交带密钥/客户名/本地绝对路径的文件',
    '改历史记录（PDCA 台账 / changelog）—— 那是证据',
    '手工改构建产物（dist / _deploy / upload-ready）',
  ],
};

mkdirSync(D, { recursive: true });
writeFileSync(join(D, 'harness.json'), JSON.stringify(out, null, 2), 'utf8');

/* 同时出一份人可读版 */
const md = [
  '# MACKORN Harness —— 运行边界清单',
  '',
  '> 由 `tools/export_harness.mjs` 自动生成（R89）',
  '> **任何接手的 Agent 应先读本文件，再动手。**',
  '',
  '---',
  '',
  '## 一、五条硬规矩（不可违反）',
  '',
  '| # | 规矩 | 怎么做 | 为什么 |',
  '|:--|:---|:---|:---|',
  ...HARD_RULES.map((r) => '| ' + r.id + ' | **' + r.rule + '** | ' + r.how + ' | ' + r.why + ' |'),
  '',
  '## 二、护栏（' + guardRules.length + ' 条）',
  '',
  ...guardRules.slice(0, 30).map((r) => '- `' + r.id + '`' + (r.severity ? ' [' + r.severity + ']' : '') + ' ' + r.desc),
  '',
  '## 三、门禁（' + gates.length + ' 项）',
  '',
  ...gates.map((g) => '- `' + g.id + '` ' + g.name),
  '',
  '## 四、教训（' + lessons.length + ' 条，详见 tools/lessons.mjs）',
  '',
  ...lessons.slice(0, 20).map((l) => '- `' + l.id + '` [' + (l.area || '') + '] ' + (l.title || '')),
  lessons.length > 20 ? '\n… 另有 ' + (lessons.length - 20) + ' 条' : '',
  '',
  '## 五、云端能做什么 / 做不到什么',
  '',
  '**能做**：',
  ...CLOUD_BOUNDARY.can.map((x) => '- ✅ ' + x),
  '',
  '**做不到**：',
  ...CLOUD_BOUNDARY.cannot.map((x) => '- ❌ ' + x),
  '',
  '## 六、必须人做的事',
  '',
  '| 任务 | 为什么必须人做 | 工具/入口 |',
  '|:---|:---|:---|',
  ...HUMAN_REQUIRED.map((h) => '| ' + h.task + ' | ' + h.why + ' | ' + h.tool + ' |'),
  '',
  '## 七、怎么验证',
  '',
  '```',
  ...out.how_to_verify,
  '```',
  '',
  '## 八、禁止事项',
  '',
  ...out.forbidden.map((x) => '- ❌ ' + x),
  '',
  '---',
  '',
  '*生成时间：' + out.generated + '*',
  '',
].filter((x) => x !== undefined).join('\n');
writeFileSync(join(D, 'harness.md'), md, 'utf8');

console.log('');
console.log('  ══ Harness 约束导出 ══');
console.log('');
console.log('  硬规矩   ' + HARD_RULES.length + ' 条');
console.log('  护栏     ' + guardRules.length + ' 条');
console.log('  门禁     ' + gates.length + ' 项');
console.log('  教训     ' + lessons.length + ' 条');
console.log('  云端边界 能做 ' + CLOUD_BOUNDARY.can.length + ' / 做不到 ' + CLOUD_BOUNDARY.cannot.length);
console.log('  必须人做 ' + HUMAN_REQUIRED.length + ' 项');
console.log('  禁止事项 ' + out.forbidden.length + ' 条');
console.log('');
console.log('  已写 distribution/03_验证与基准/harness.json（机器可读）');
console.log('  已写 distribution/03_验证与基准/harness.md（人可读）');
console.log('');
console.log('  💡 接手的 Agent 先读这两个文件，就知道边界在哪。');
console.log('');
