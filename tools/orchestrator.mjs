/**
 * 经济路由器 · 主工具（R190）
 *
 * ⚠️ 为什么有这个文件：
 *   $DSH_HOME/AGENTS.md §2.12 写了 302 行规则，引用的主工具是
 *   `node tools/orchestrator.mjs --models / --run / --batch / --spec / --verify ...`
 *   但实测【orchestrator.mjs 根本不存在】（只有名字差一个字母的 orchestrate.mjs）。
 *   → 规则写了 302 行，命令一条都不能跑。这是「写了 ≠ 生效了」的典型案例。
 *   → 本文件就是把 §2.12 承诺的所有命令真正实现出来。
 *
 * 用户要求（2026-10-26 22:28）：
 *   「遵照经济性原则，用 DeepSeek harness 作为总指挥，用 codex 编程，
 *     用免费模型作为普通能做的工作，提升效率的同时提升经济性」
 *   「把以上已经编的，econ-router.mjs 用于 DeepSeek harness 的所有对话」
 *
 * ══════════════════════════════════════════════════════════════
 * 五级路由（§2.12 定义）
 *   T3 敏感 → 我做（DeepSeek）或本地 Ollama；命中敏感词强制覆盖
 *   T1 编程 → Codex
 *   T2 判断 → 我做（DeepSeek）
 *   T0 机械 → 免费云模型（智谱 GLM-4-Flash）
 *   T0 纯算 → 纯脚本
 * ══════════════════════════════════════════════════════════════
 *
 * 命令（与 §2.12 完全一致）：
 *   --models                         看能派给谁（通道状态）
 *   --classify "任务"                 只分类
 *   --run "任务"                      分类 + 派单条
 *   --batch items.json --task "..." --out out.json --tier steady
 *   --spec "任务"                     我出题（生成 prompt + 验收标准）
 *   --verify out.json                 我验收（自动查 + 抽检）
 *   --codex "任务"                    派给 Codex
 *   --report                         经济账
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA_DIR = join(ROOT, 'econ-data');
const LEDGER = join(DATA_DIR, 'ledger.jsonl');
const REPORT = join(DATA_DIR, 'report.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

/* ══════════════════════════════════════════════════════════════
 * 敏感词闸（T3 强制覆盖）
 * ══════════════════════════════════════════════════════════════ */
const SENSITIVE = [
  '合同', '协议', '报价', '价格', '单价', '总价', '折扣', '付款', '账期', '发票', '税',
  '客户名', '联系人', '手机号', '身份证', '银行', '账号', '密码', '密钥', 'token',
  '专利', '图纸', 'CAD', 'BOM', '配方', '工艺流程', '招标', '投标', '标书',
  '工资', '薪酬', '人事', '简历', '离职',
];
function checkSensitive(text) {
  const hits = SENSITIVE.filter((w) => text.includes(w));
  return { sensitive: hits.length > 0, hits };
}

/* ══════════════════════════════════════════════════════════════
 * 任务分级
 * ══════════════════════════════════════════════════════════════ */
const SIGNALS = {
  code: [
    /\.(py|mjs|js|ts|tsx|jsx|go|rs|java|cpp|c|h|sh|ps1|cmd|json|yaml|yml|html|css|sql)\b/i,
    /(写|加|改|修|重构|补|删|优化)(个|一个|一下)?(函数|方法|类|脚本|文件|模块|接口|测试|参数|逻辑|bug|错误)/,
    /(实现|编写|生成)(一个|个)?(函数|脚本|程序|工具|模块)/i,
    /(fix|implement|refactor|add|write|create)\s+(a\s+)?(function|script|module|class|test|method)/i,
    /报错|异常|stack trace|Traceback|SyntaxError|TypeError/i,
  ],
  judge: [
    /(选型|评估|判断|该不该|要不要|值不值|哪个好|怎么选|取舍|权衡)/,
    /(风险|隐患|漏洞|问题在哪|为什么|原因是什么)/,
    /(方案|策略|建议|推荐|话术|谈判|定价)/,
    /(analyze|evaluate|assess|recommend|should|which is better)/i,
  ],
  mechanical: [
    /(整理|转换|抽取|提取|翻译|分类|归类|格式化|清洗|拆分|合并|归纳|摘要|打标)/,
    /(翻译成|翻成|用英文|用中文|转成|变成)/,
    /(translate|extract|classify|format|summarize|convert|clean|parse|label)/i,
  ],
  compute: [
    /(统计|计算|求和|总数|多少个|去重|排序|筛选|平均值|最大值|最小值|占比)/,
    /(count|sum|average|dedupe|sort|filter|total|how many)/i,
  ],
};

function classify(text) {
  const sens = checkSensitive(text);
  if (sens.sensitive) {
    return {
      level: 'T3', channel: 'self',
      reason: '敏感词：' + sens.hits.slice(0, 3).join('、'),
      action: '我做（不出网）', cost: 'paid',
    };
  }
  for (const [key, patterns] of Object.entries(SIGNALS)) {
    if (!patterns.some((re) => re.test(text))) continue;
    if (key === 'code') return { level: 'T1', channel: 'codex', reason: '编程信号', action: '派给 Codex', cost: 'codex' };
    if (key === 'judge') return { level: 'T2', channel: 'self', reason: '判断信号', action: '我做', cost: 'paid' };
    if (key === 'mechanical') return { level: 'T0', channel: 'free', reason: '机械活信号', action: '派给免费模型', cost: 'free' };
    if (key === 'compute') return { level: 'T0', channel: 'script', reason: '纯算信号', action: '纯脚本', cost: 'zero' };
  }
  return { level: 'T0', channel: 'free', reason: '默认机械活', action: '派给免费模型', cost: 'free' };
}

/* ══════════════════════════════════════════════════════════════
 * 免费通道
 * ══════════════════════════════════════════════════════════════ */
const PROVIDERS = [
  { id: 'zhipu-250414', name: '智谱 GLM-4-Flash-250414', keyEnv: 'ZHIPU_API_KEY', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash-250414', tier: 'fast', dataPolicy: 'cn', note: '实测 671-1133ms' },
  { id: 'zhipu-4-flash', name: '智谱 GLM-4-Flash', keyEnv: 'ZHIPU_API_KEY', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', tier: 'stable', dataPolicy: 'cn', note: '实测 2085-3409ms' },
  { id: 'zhipu-45-flash', name: '智谱 GLM-4.5-Flash', keyEnv: 'ZHIPU_API_KEY', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-flash', tier: 'strong', dataPolicy: 'cn', note: '实测 711ms' },
  { id: 'zhipu-air', name: '智谱 GLM-4-Air', keyEnv: 'ZHIPU_API_KEY', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-air', tier: 'strong', dataPolicy: 'cn', note: '实测 603ms' },
  { id: 'nvidia-deepseek', name: 'DeepSeek V4.1 Flash（NVIDIA）', keyEnv: 'NVIDIA_API_KEY', baseURL: 'https://integrate.api.nvidia.com/v1', model: 'deepseek-ai/deepseek-v4.1-flash', tier: 'strong', dataPolicy: 'global', note: '需 NVIDIA key' },
  { id: 'nvidia-kimi', name: 'Kimi K2.6（NVIDIA）', keyEnv: 'NVIDIA_API_KEY', baseURL: 'https://integrate.api.nvidia.com/v1', model: 'moonshotai/kimi-k2.6', tier: 'strong', dataPolicy: 'global', note: '需 NVIDIA key' },
];

const TIER_ORDER = { fast: 0, stable: 1, strong: 2 };

function availProviders(tier) {
  let list = PROVIDERS.filter((p) => process.env[p.keyEnv]);
  if (tier && tier !== 'any') {
    const want = TIER_ORDER[tier] != null ? tier : null;
    if (want) list = list.filter((p) => p.tier === want);
  }
  return list;
}

async function callOne(prompt, p, maxTokens = 800, timeoutMs = 60000) {
  const key = process.env[p.keyEnv];
  const t0 = Date.now();
  try {
    const r = await fetch(p.baseURL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens, temperature: 0.2,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { ok: false, ms, error: 'HTTP ' + r.status + ' ' + t.slice(0, 80) };
    }
    const j = await r.json();
    return {
      ok: true, ms, model: p.model,
      text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '',
      usage: j.usage || null,
    };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 80) };
  }
}

async function runFree(prompt, { tier = 'any', maxTokens = 800 } = {}) {
  const provs = availProviders(tier);
  if (!provs.length) {
    return { ok: false, error: '没有可用免费通道' + (tier !== 'any' ? '（tier=' + tier + '）' : ''), attempts: [] };
  }
  const attempts = [];
  for (const p of provs) {
    const r = await callOne(prompt, p, maxTokens);
    attempts.push({ provider: p.id, name: p.name, ok: r.ok, ms: r.ms, error: r.error });
    if (r.ok) return { ok: true, ...r, provider: p.id, providerName: p.name, attempts };
  }
  return { ok: false, error: '所有免费通道都失败', attempts };
}

/* ══════════════════════════════════════════════════════════════
 * 台账
 * ══════════════════════════════════════════════════════════════ */
function log(e) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n', 'utf8');
  } catch { /* 落盘失败不阻塞 */ }
}

function readLedger() {
  if (!existsSync(LEDGER)) return [];
  try {
    return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--models
 * ══════════════════════════════════════════════════════════════ */
if (has('--models')) {
  console.log('');
  console.log('  ══ 能派给谁 ══');
  console.log('');
  console.log('  ── T0 机械活：免费云模型 ──');
  for (const p of PROVIDERS) {
    const ok = !!process.env[p.keyEnv];
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + p.name.padEnd(34) + ' tier=' + p.tier.padEnd(7) + (ok ? p.note : '缺 ' + p.keyEnv));
  }
  console.log('');
  console.log('  可用：' + availProviders().length + '/' + PROVIDERS.length);
  console.log('');
  console.log('  ── 其他通道 ──');
  const codex = ['D:\\AI\\npm_global\\codex.ps1', 'D:\\AI\\npm_global\\codex.cmd'].find((p) => existsSync(p));
  console.log('  ' + (codex ? '✅' : '❌') + ' Codex（T1 编程）  ' + (codex || '未找到'));
  console.log('  ⚠️  Ollama（T3 敏感）  实测 ECONNREFUSED / 120s 超时，需修');
  console.log('  ⚠️  DeepSeek（总指挥） 本会话在用（收费）');
  console.log('');
  const led = readLedger();
  const free = led.filter((x) => x.cost === 'free' || x.cost === 'zero').length;
  console.log('  ── 经济账 ──');
  console.log('  已派活：' + led.length + ' 次 · 免费 ' + free + ' 次 · 免费占比 ' + (led.length ? Math.round(free / led.length * 100) : 0) + '%');
  console.log('');
  process.exit(availProviders().length > 0 ? 0 : 1);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--classify
 * ══════════════════════════════════════════════════════════════ */
const classifyText = val('--classify');
if (classifyText) {
  const c = classify(classifyText);
  console.log('');
  console.log('  任务：' + classifyText.slice(0, 80));
  console.log('  级别：' + c.level + ' → ' + c.channel);
  console.log('  理由：' + c.reason);
  console.log('  动作：' + c.action);
  console.log('  成本：' + c.cost);
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--run（分类 + 派单条）
 * ══════════════════════════════════════════════════════════════ */
const runText = val('--run');
if (runText) {
  const c = classify(runText);
  console.log('');
  console.log('  ══ 派单 ══');
  console.log('  ' + c.level + ' → ' + c.channel + '（' + c.reason + '）');
  console.log('');
  if (c.level === 'T3') {
    console.log('  ⛔ 敏感内容不出网 —— ' + c.reason);
    console.log('     拒绝派给云免费通道。我来做，或本地 Ollama（若可用）。');
    console.log('');
    process.exit(2);
  }
  if (c.channel === 'codex') {
    const codex = ['D:\\AI\\npm_global\\codex.ps1', 'D:\\AI\\npm_global\\codex.cmd'].find((p) => existsSync(p));
    if (!codex) { console.log('  ❌ 找不到 Codex'); process.exit(1); }
    console.log('  → 派给 Codex');
    console.log('     & "' + codex + '" exec "' + runText.replace(/"/g, '`"') + '"');
    console.log('     ⚠️ 不自动执行（会改文件），确认后手动跑');
    console.log('');
    process.exit(0);
  }
  if (c.channel === 'self') {
    console.log('  → 该我做（判断类，免费模型不可靠）');
    console.log('     这条不派出去，由 DeepSeek 处理。');
    console.log('');
    process.exit(0);
  }
  console.log('  ⏳ 派给免费通道…');
  const r = await runFree(runText, { tier: val('--tier') || 'any' });
  if (r.ok) {
    console.log('  ✅ ' + r.providerName + ' · ' + r.ms + 'ms');
    if (r.usage) console.log('  token: ' + r.usage.total_tokens);
    console.log('');
    console.log(r.text.split('\n').map((l) => '  ' + l).join('\n'));
    console.log('');
    log({ task: runText.slice(0, 200), level: c.level, channel: r.provider, cost: 'free', ms: r.ms, tokens: r.usage ? r.usage.total_tokens : null });
  } else {
    console.log('  ❌ ' + r.error);
    for (const a of r.attempts || []) console.log('     · ' + a.name + ': ' + (a.error || '?'));
    console.log('');
    process.exit(1);
  }
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--batch（批量派活 —— 最省 token 的形态）
 * ══════════════════════════════════════════════════════════════ */
const batchFile = val('--batch');
if (batchFile) {
  if (!existsSync(batchFile)) { console.log('  ❌ 文件不存在：' + batchFile); process.exit(1); }
  const taskTpl = val('--task') || null;
  const outFile = val('--out') || join(DATA_DIR, 'batch-out.json');
  const tier = val('--tier') || 'any';
  const items = JSON.parse(readFileSync(batchFile, 'utf8'));
  const arr = Array.isArray(items) ? items : [items];
  console.log('');
  console.log('  ══ 批量派活 · ' + arr.length + ' 条 ══');
  console.log('  模板：' + (taskTpl || '（每条自带 prompt）'));
  console.log('  tier：' + tier);
  console.log('');
  const results = [];
  let free = 0, failed = 0, refused = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    const prompt = taskTpl ? taskTpl + '\n\n' + JSON.stringify(item) : (item.prompt || JSON.stringify(item));
    /* ★ R191：有 --task 模板时，按【模板】判级，不按 item 内容
     *   实测血案：客户留言里含"报个方案"→ 被判 T2 跳过，
     *   但 task 模板是"抽取字段"→ 其实是 T0。
     *   判级应该看【要做什么】，不是看【材料里有什么词】。 */
    const c = taskTpl ? classify(taskTpl) : classify(prompt);
    process.stdout.write('  [' + (i + 1) + '/' + arr.length + '] ' + c.level + ' ');
    if (c.level === 'T3') { console.log('⛔ 拒（敏感）'); refused++; results.push({ item, refused: true, reason: c.reason }); continue; }
    if (c.channel !== 'free') { console.log('→ ' + c.channel + '（跳过）'); results.push({ item, skipped: c.channel }); continue; }
    const r = await runFree(prompt, { tier });
    if (r.ok) {
      console.log('✅ ' + r.ms + 'ms');
      free++;
      results.push({ item, ok: true, provider: r.provider, ms: r.ms, text: r.text, usage: r.usage });
      log({ task: prompt.slice(0, 200), level: c.level, channel: r.provider, cost: 'free', ms: r.ms, tokens: r.usage ? r.usage.total_tokens : null });
    } else {
      console.log('❌ ' + (r.error || '').slice(0, 30));
      failed++;
      results.push({ item, ok: false, error: r.error });
    }
  }
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), total: arr.length, free, failed, refused, results }, null, 2), 'utf8');
  console.log('');
  console.log('  免费成功 ' + free + ' · 失败 ' + failed + ' · 拒敏 ' + refused);
  console.log('  结果：' + outFile);
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--spec（我出题：生成 prompt + 验收标准）
 * ══════════════════════════════════════════════════════════════ */
const specTask = val('--spec');
if (specTask) {
  const c = classify(specTask);
  console.log('');
  console.log('  ══ 出题（导师动作 ①：定标准）══');
  console.log('  任务：' + specTask);
  console.log('  判级：' + c.level + ' → ' + c.channel);
  console.log('');
  console.log('  ── 派给免费模型的 prompt（可直接复制）──');
  console.log('');
  console.log('    任务：' + specTask);
  console.log('');
  console.log('    硬性要求：');
  console.log('    ① 严格按指定格式输出，不要加解释、不要加前言后语');
  console.log('    ② 不确定的字段留空，不要编造');
  console.log('    ③ 如果输入信息不足，直接说「信息不足」，不要猜');
  console.log('    ④ 数字必须来自原文，不能推算');
  console.log('');
  console.log('  ── 验收标准（导师动作 ③：验收）──');
  console.log('');
  console.log('    ① 格式对：字段名/分隔符与要求一致');
  console.log('    ② 内容对：抽 3 条人工核对，错 1 条即整体打回');
  console.log('    ③ 无编造：所有数字/名称能在原文里找到');
  console.log('    ④ 无空转：每条都有实质输出，不是「请提供更多信息」占位');
  console.log('');
  console.log('  ── 下一步 ──');
  console.log('');
  console.log('    派活：node tools/orchestrator.mjs --batch items.json --task "<上面 prompt>" --out out.json');
  console.log('    验收：node tools/orchestrator.mjs --verify out.json');
  console.log('');
  log({ action: 'spec', task: specTask.slice(0, 200), level: c.level, cost: 'paid' });
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--verify（我验收）
 * ══════════════════════════════════════════════════════════════ */
const verifyFile = val('--verify');
if (verifyFile) {
  if (!existsSync(verifyFile)) { console.log('  ❌ 文件不存在：' + verifyFile); process.exit(1); }
  const data = JSON.parse(readFileSync(verifyFile, 'utf8'));
  const results = data.results || [];
  console.log('');
  console.log('  ══ 验收（导师动作 ③）══');
  console.log('');
  const withText = results.filter((r) => r.ok && r.text);
  const empty = withText.filter((r) => !r.text.trim());
  const short = withText.filter((r) => r.text.trim().length < 3);
  /* ★ R191 修 bug（实测血案）：免费模型会用 xx / X / ? / 未知 填充未知字段，
   *   自动检查全过（不空、不过短、不是"信息不足"），但内容是编造的占位符。
   *   实测：原文没说地区，模型输出「地区=xx」，验收器漏掉了。 */
  const placeholder = withText.filter((r) => /信息不足|请提供|无法|抱歉|不知道/.test(r.text));
  const fakePlaceholder = withText.filter((r) => /(^|[=|\s])(xx|XX|X{2,}|\?{1,3}|未知|N\/A|null)([=|\s]|$)/.test(r.text));
  console.log('  总条数：' + results.length);
  console.log('  成功：' + results.filter((r) => r.ok).length);
  console.log('  失败：' + results.filter((r) => !r.ok && !r.refused).length);
  console.log('  拒敏：' + results.filter((r) => r.refused).length);
  console.log('');
  console.log('  ── 自动检查 ──');
  console.log('  ' + (empty.length === 0 ? '✅' : '❌') + ' 无空输出（' + empty.length + ' 条空）');
  console.log('  ' + (short.length === 0 ? '✅' : '⚠️') + ' 无过短输出（' + short.length + ' 条 <3 字）');
  console.log('  ' + (placeholder.length === 0 ? '✅' : '⚠️') + ' 无占位回答（' + placeholder.length + ' 条说"信息不足"）');
  console.log('  ' + (fakePlaceholder.length === 0 ? '✅' : '❌') + ' 无编造占位符 xx/未知/N/A（' + fakePlaceholder.length + ' 条有 ← 实测高频错误）');
  console.log('');
  /* 抽检 3 条给人工核对 */
  console.log('  ── 抽检 3 条（必须人工核对，不能只看自动检查）──');
  const sample = withText.slice(0, 3);
  for (let i = 0; i < sample.length; i++) {
    const r = sample[i];
    console.log('');
    console.log('  [' + (i + 1) + '] 输入：' + JSON.stringify(r.item).slice(0, 100));
    console.log('      输出：' + r.text.trim().split('\n').slice(0, 3).join(' / ').slice(0, 200));
  }
  console.log('');
  const pass = empty.length === 0 && short.length === 0 && fakePlaceholder.length === 0;
  console.log('  ══ 结论：' + (pass ? '✅ 自动检查通过' : '❌ 自动检查未通过') + ' ══');
  console.log('  ⚠️ 自动检查通过 ≠ 质量合格 —— 必须人工核对抽检的 3 条');
  console.log('');
  process.exit(pass ? 0 : 1);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--codex
 * ══════════════════════════════════════════════════════════════ */
const codexTask = val('--codex');
if (codexTask) {
  const codex = ['D:\\AI\\npm_global\\codex.ps1', 'D:\\AI\\npm_global\\codex.cmd'].find((p) => existsSync(p));
  console.log('');
  console.log('  ══ 派给 Codex ══');
  console.log('  任务：' + codexTask);
  console.log('');
  if (!codex) {
    console.log('  ❌ 找不到 codex（查过 D:\\AI\\npm_global\\codex.ps1 / .cmd）');
    console.log('');
    process.exit(1);
  }
  console.log('  ✅ Codex：' + codex);
  console.log('');
  console.log('  命令：');
  console.log('    & "' + codex + '" exec "' + codexTask.replace(/"/g, '`"') + '"');
  console.log('');
  console.log('  ⚠️ 不自动执行（Codex 会改文件）。确认后手动跑，或由我代跑。');
  console.log('  💡 建议先打快照：git 或 copy 一份原文件');
  console.log('');
  log({ action: 'codex', task: codexTask.slice(0, 200), cost: 'codex' });
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 命令：--report
 * ══════════════════════════════════════════════════════════════ */
if (has('--report')) {
  const rows = readLedger();
  const byChannel = {}, byLevel = {};
  let tokens = 0, freeN = 0, paidN = 0;
  for (const r of rows) {
    byChannel[r.channel || r.action || '?'] = (byChannel[r.channel || r.action || '?'] || 0) + 1;
    byLevel[r.level || '?'] = (byLevel[r.level || '?'] || 0) + 1;
    if (r.tokens) tokens += r.tokens;
    if (r.cost === 'free' || r.cost === 'zero') freeN++; else paidN++;
  }
  const rep = {
    schema: 'mackorn-econ-report/1',
    at: new Date().toISOString(),
    total: rows.length,
    free: freeN, paid: paidN,
    free_ratio: rows.length ? Math.round(freeN / rows.length * 100) : 0,
    tokens_via_free: tokens,
    by_channel: byChannel, by_level: byLevel,
    note: 'free_ratio = 免费通道处理占比。DSH 会话本身 token 不计入（日志无 token 用量）。',
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(REPORT, JSON.stringify(rep, null, 2), 'utf8');
  console.log('');
  console.log('  ══ 经济账 ══');
  console.log('  总派活：' + rep.total + ' 次');
  console.log('  免费：' + rep.free + ' 次 · 收费：' + rep.paid + ' 次');
  console.log('  免费占比：' + rep.free_ratio + '%（越高越省）');
  console.log('  免费通道累计 token：' + rep.tokens_via_free);
  console.log('');
  if (rep.total === 0) {
    console.log('  ⚠️ 还没有派活记录。用 --run 或 --batch 派几件活。');
  } else {
    console.log('  ── 按通道 ──');
    for (const [k, v] of Object.entries(rep.by_channel)) console.log('    ' + k + ': ' + v);
    console.log('  ── 按级别 ──');
    for (const [k, v] of Object.entries(rep.by_level)) console.log('    ' + k + ': ' + v);
  }
  console.log('');
  console.log('  报告：econ-data/report.json');
  console.log('  台账：econ-data/ledger.jsonl');
  console.log('');
  process.exit(0);
}

/* 无参数：帮助 */
console.log('');
console.log('  ══ orchestrator · 经济路由器（§2.12 主工具）══');
console.log('');
console.log('  --models                                     看能派给谁');
console.log('  --classify "任务"                             只分类');
console.log('  --run "任务"                                  分类 + 派单条');
console.log('  --batch items.json --task "..." --out out.json   批量');
console.log('  --spec "任务"                                 我出题（生成 prompt + 验收标准）');
console.log('  --verify out.json                            我验收');
console.log('  --codex "任务"                                派给 Codex');
console.log('  --report                                     经济账');
console.log('');
console.log('  五级：T3 我做 · T1 Codex · T2 我做 · T0 免费云 · T0 纯算');
console.log('');
