/**
 * 四级容灾降级路由器（R201）
 *
 * 用户要求（2026-11-01）：
 *   「优先白嫖 → 再试免费云端 → 再试本地 → 最后花钱保底」
 *   四档：智谱(免费) → NVIDIA(免费) → Ollama(本地) → DeepSeek(收费)
 *
 * ══════════════════════════════════════════════════════════════
 * 与用户初版的差别（都不是风格问题，是会不会误判的问题）
 *
 *   ① apiKey 不写默认假值
 *      初版：apiKey: process.env.ZHIPU_API_KEY || "你的智谱Key"
 *      → 没有 key 时会拿字符串 "你的智谱Key" 去请求 → 401
 *      → 日志显示「智谱返回错误」，看起来像 key 失效，其实根本没配
 *      改：没有该环境变量就【标记为未配置并跳过】，日志明确说「未配置」
 *
 *   ② 本地档不只探端口，还要确认有模型
 *      初版：探 /models 只要通就试
 *      → Ollama 起来了但没模型，会白等 30 秒超时
 *      改：先探 /api/tags，检查目标模型是否存在，不存在就跳过并说明
 *
 *   ③ 加 --test 模式
 *      初版只能被 import 调用，没法单独验证「降级链是否真的在工作」
 *      改：node tools/free_router.mjs --test 逐档实测 + 打印每一步
 *
 *   ④ 加「敏感内容闸」
 *      含合同/报价/客户名等内容一律不准走云端（只能 Ollama 或调用方自己做）
 *      —— 这是项目铁律，路由层也要拦一道
 *
 * 用法：
 *   node tools/free_router.mjs --test              # 逐档实测（真实发请求）
 *   node tools/free_router.mjs --status            # 只看每档配置状态（不请求）
 *   node tools/free_router.mjs --ask "回复一个字：好"  # 走降级链问一句
 *   node tools/free_router.mjs --ask "..." --sensitive  # 声明敏感 → 只准本地
 *   node tools/free_router.mjs --json
 *
 * 作为模块：
 *   import { smartChat } from './tools/free_router.mjs';
 *   const r = await smartChat([{role:'user',content:'hi'}]);
 */
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DATA_DIR = join(ROOT, 'router-data');
const LEDGER = join(DATA_DIR, 'router-ledger.jsonl');

/* ══════════════════════════════════════════════════════════════
 * 四档配置
 *   kind: free      免费云端
 *   kind: local     本地（不出网）
 *   kind: paid      收费兜底
 * ══════════════════════════════════════════════════════════════ */
const PROVIDERS = [
  {
    id: 'zhipu',
    name: '智谱 GLM-4-Flash（免费）',
    kind: 'free',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash-250414',      /* 实测 671-1133ms，比 glm-4-flash 快 */
    fallbackModel: 'glm-4-flash',
    keyEnv: 'ZHIPU_API_KEY',
    timeout: 15000,
    note: '永久免费，无 token 上限',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM（免费）',
    kind: 'free',
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    /* ★ R202 实测修正（2026-11-01）：/models 列 85 个，但只有 11 个 chat 端点真开通。
     *   Kimi K2.6 / DeepSeek V4.1 Flash / GLM-5.3 Flash 全部 not-deployed（404 Function not found）。
     *   实测可用里最强的三个：
     *     mistralai/mistral-large-4-1t-a52b   528ms  通用最强
     *     nvidia/nemotron-3-ultra-550b-a55b   684ms  550B
     *     nvidia/nemotron-3.5-lightning-30b-a3b 443ms 最快 */
    model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    fallbackModel: 'mistralai/mistral-large-4-1t-a52b',
    keyEnv: 'NVIDIA_API_KEY',
    timeout: 20000,
    note: '需免费注册 build.nvidia.com',
  },
  {
    id: 'ollama',
    name: '本地 Ollama（不出网）',
    kind: 'local',
    baseURL: 'http://127.0.0.1:11434',
    model: 'qwen2.5:1.5b',
    fallbackModel: 'qwen2.5:3b',
    keyEnv: null,
    timeout: 60000,                    /* 本地首次加载慢 */
    note: '唯一的敏感内容安全通道',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek（收费兜底）',
    kind: 'paid',
    url: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY',
    timeout: 30000,
    note: '最稳，但计费',
  },
];

/* ══════════════════════════════════════════════════════════════
 * 敏感内容闸（T3 只能走 local）
 * ══════════════════════════════════════════════════════════════ */
const SENSITIVE = [
  '合同', '协议', '报价', '价格', '单价', '总价', '折扣', '付款', '账期', '发票', '税',
  '客户名', '联系人', '手机号', '身份证', '银行', '账号', '密码', '密钥',
  '专利', '图纸', 'CAD', 'BOM', '配方', '工艺流程', '招标', '投标', '标书',
  '工资', '薪酬', '人事', '简历', '离职',
];
function isSensitive(text) {
  const hits = SENSITIVE.filter((w) => text.includes(w));
  return { sensitive: hits.length > 0, hits };
}

/* ══════════════════════════════════════════════════════════════
 * 状态：这档能不能用（配置层面，不发请求）
 * ══════════════════════════════════════════════════════════════ */
function providerStatus(p) {
  if (p.kind === 'local') return { configured: true, keyEnvSet: '（本地，无需 key）' };
  const has = !!(p.keyEnv && process.env[p.keyEnv]);
  return { configured: has, keyEnvSet: has ? '✅ 已配' : '❌ 缺 ' + p.keyEnv };
}

/* ══════════════════════════════════════════════════════════════
 * 本地能力探测（Ollama：既探服务也探模型）
 * ══════════════════════════════════════════════════════════════ */
async function probeOllama(p) {
  try {
    const r = await fetch(p.baseURL + '/api/tags', { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status };
    const j = await r.json();
    const names = (j.models || []).map((m) => m.name);
    if (!names.length) return { ok: false, reason: '服务在跑但没有模型（需 ollama pull）' };
    /* 优先 p.model，其次 p.fallbackModel，再次任意模型 */
    const pick = names.includes(p.model) ? p.model
      : (p.fallbackModel && names.includes(p.fallbackModel) ? p.fallbackModel : names[0]);
    return { ok: true, model: pick, all: names };
  } catch (e) {
    return { ok: false, reason: (e.cause && (e.cause.code || e.cause.message)) || e.message };
  }
}

/* ══════════════════════════════════════════════════════════════
 * 单档调用
 * ══════════════════════════════════════════════════════════════ */
async function callProvider(p, messages, { maxTokens = 800, modelOverride = null } = {}) {
  const t0 = Date.now();
  const r = { id: p.id, name: p.name, kind: p.kind, ok: false, ms: null, model: null, text: null, usage: null, error: null };

  /* 本地档：先用原生 API */
  if (p.kind === 'local') {
    const probe = await probeOllama(p);
    if (!probe.ok) { r.ms = Date.now() - t0; r.error = '本地不可用：' + probe.reason; return r; }
    const useModel = modelOverride || probe.model;
    try {
      const res = await fetch(p.baseURL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: useModel,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
          options: { num_predict: maxTokens },
        }),
        signal: AbortSignal.timeout(p.timeout),
      });
      r.ms = Date.now() - t0;
      if (!res.ok) { r.error = 'HTTP ' + res.status + ' ' + (await res.text()).slice(0, 80); return r; }
      const j = await res.json();
      r.ok = true;
      r.model = useModel;
      r.text = (j.message && j.message.content) || '';
      r.usage = { total_tokens: j.eval_count != null ? j.eval_count + (j.prompt_eval_count || 0) : null };
      return r;
    } catch (e) {
      r.ms = Date.now() - t0;
      r.error = String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 80);
      return r;
    }
  }

  /* 云端档：OpenAI 兼容 */
  const key = p.keyEnv ? process.env[p.keyEnv] : null;
  if (!key) { r.error = '未配置 ' + p.keyEnv + '（跳过，不是 key 失效）'; return r; }

  const tryModel = async (m) => {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: m, messages, max_tokens: maxTokens, temperature: 0.2, stream: false }),
      signal: AbortSignal.timeout(p.timeout),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 100));
    }
    return res.json();
  };

  try {
    let j;
    let usedModel = modelOverride || p.model;
    try {
      j = await tryModel(usedModel);
    } catch (e) {
      /* 主模型不可用时试 fallback 模型 */
      if (p.fallbackModel && !modelOverride) {
        usedModel = p.fallbackModel;
        j = await tryModel(usedModel);
      } else throw e;
    }
    r.ms = Date.now() - t0;
    r.ok = true;
    r.model = usedModel;
    r.text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    r.usage = j.usage || null;
    return r;
  } catch (e) {
    r.ms = Date.now() - t0;
    r.error = String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 120);
    return r;
  }
}

/* ══════════════════════════════════════════════════════════════
 * 降级链主函数
 * ══════════════════════════════════════════════════════════════ */
export async function smartChat(messages, options = {}) {
  const text = messages.map((m) => String(m.content || '')).join('\n');
  const sens = isSensitive(text);

  /* ★ 敏感内容闸：只准本地 */
  let chain = PROVIDERS;
  if (options.sensitive || sens.sensitive) {
    chain = PROVIDERS.filter((p) => p.kind === 'local');
    if (!chain.length) {
      throw new Error('[T3 硬约束] 内容敏感，但本地通道不可用 —— 拒绝上云。请启动 Ollama，或由调用方自己做。');
    }
  }

  const attempts = [];
  for (const p of chain) {
    if (options.verbose !== false) {
      process.stdout.write('  → 尝试 ' + p.name.padEnd(30));
    }
    const r = await callProvider(p, messages, options);
    attempts.push(r);
    if (options.verbose !== false) {
      console.log(r.ok ? '✅ ' + r.ms + 'ms · ' + r.model : '✗ ' + (r.error || '').slice(0, 40));
    }
    if (r.ok) {
      logUsage({ provider: p.id, kind: p.kind, ok: true, ms: r.ms, tokens: r.usage ? r.usage.total_tokens : null, sensitive: sens.sensitive });
      return { ...r, attempts, fallback_count: attempts.length - 1 };
    }
  }

  logUsage({ provider: null, kind: null, ok: false, error: 'all_failed', sensitive: sens.sensitive });
  const err = new Error('所有通道都失败了（' + attempts.length + ' 档）');
  err.attempts = attempts;
  err.sensitive = sens.sensitive;
  throw err;
}

function logUsage(e) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n', 'utf8');
  } catch { /* 落盘失败不影响主流程 */ }
}

/* ══════════════════════════════════════════════════════════════
 * CLI
 * ══════════════════════════════════════════════════════════════ */
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  if (has('--status')) {
    console.log('');
    console.log('  ══ 四级降级路由器 · 配置状态 ══');
    console.log('');
    for (const p of PROVIDERS) {
      const st = providerStatus(p);
      const kindLabel = p.kind === 'free' ? '免费' : p.kind === 'local' ? '本地' : '收费';
      console.log('  ' + (st.configured ? '✅' : '❌') + ' ' + p.name.padEnd(28) + '[' + kindLabel + '] ' + st.keyEnvSet);
      console.log('       ' + p.note);
    }
    const okCount = PROVIDERS.filter((p) => providerStatus(p).configured).length;
    console.log('');
    console.log('  配置可用：' + okCount + '/' + PROVIDERS.length);
    console.log('');
    process.exit(0);
  }

  if (has('--test')) {
    console.log('');
    console.log('  ══ 四级降级路由器 · 逐档实测 ══');
    console.log('  验证的不是「配置在不在」，而是「这一档真能回话吗」');
    console.log('');
    const messages = [{ role: 'user', content: '回复一个字：好' }];
    const results = [];
    for (const p of PROVIDERS) {
      const st = providerStatus(p);
      process.stdout.write('  ' + (st.configured ? '⏳' : '⊘') + ' ' + p.name.padEnd(30));
      if (!st.configured) { console.log('跳过（' + st.keyEnvSet + '）'); results.push({ id: p.id, skipped: true, reason: st.keyEnvSet }); continue; }
      const r = await callProvider(p, messages, { maxTokens: 8 });
      results.push(r);
      console.log(r.ok ? '✅ ' + r.ms + 'ms · ' + r.model + ' · 「' + String(r.text || '').slice(0, 12) + '」' : '❌ ' + (r.error || '').slice(0, 60));
    }
    const okCount = results.filter((r) => r.ok).length;
    const skipped = results.filter((r) => r.skipped).length;
    console.log('');
    console.log('  ── 汇总 ──');
    console.log('  实测可用：' + okCount + ' 档 · 跳过（未配置）：' + skipped + ' 档 · 失败：' + (results.length - okCount - skipped) + ' 档');
    /* 降级链验证：第一档失败会不会自动往下 */
    console.log('');
    console.log('  ── 降级链验证（故意用不存在的主模型，看会不会自动 fallback）──');
    const firstFree = PROVIDERS.find((p) => providerStatus(p).configured && p.kind === 'free');
    if (firstFree) {
      const r = await callProvider(firstFree, messages, { maxTokens: 8, modelOverride: 'THIS-MODEL-DOES-NOT-EXIST' });
      console.log('  ' + (r.ok ? '✅ 正确降级到 fallback 模型 ' + r.model : '⚠️ 降级失败：' + (r.error || '').slice(0, 60)));
    } else {
      console.log('  ⊘ 没有已配置的免费云端档，跳过');
    }
    console.log('');
    process.exit(okCount > 0 ? 0 : 1);
  }

  if (has('--sensitive-test')) {
    console.log('');
    console.log('  ══ 敏感内容闸验证 ══');
    console.log('  期望：含「报价」的内容被拒绝上云，只允许本地');
    console.log('');
    try {
      await smartChat([{ role: 'user', content: '这份合同的报价是多少' }]);
      console.log('  ❌ 闸门失效：敏感内容被放行了');
      process.exit(1);
    } catch (e) {
      console.log('  ✅ 闸门生效：' + e.message.slice(0, 100));
      process.exit(0);
    }
  }

  const ask = val('--ask');
  if (ask) {
    console.log('');
    console.log('  ══ 走降级链问一句 ══');
    console.log('  问：' + ask);
    console.log('');
    try {
      const r = await smartChat([{ role: 'user', content: ask }], {
        sensitive: has('--sensitive'),
        maxTokens: 500,
      });
      console.log('');
      console.log('  ✅ 由「' + r.name + '」回答（' + r.ms + 'ms · ' + r.model + '）');
      if (r.fallback_count > 0) console.log('  ⚠️ 发生了 ' + r.fallback_count + ' 次降级');
      console.log('');
      console.log(r.text.split('\n').map((l) => '  ' + l).join('\n'));
      console.log('');
    } catch (e) {
      console.log('  ❌ ' + e.message);
      if (e.attempts) for (const a of e.attempts) console.log('     · ' + a.name + ': ' + (a.error || '').slice(0, 60));
      console.log('');
      process.exit(1);
    }
    process.exit(0);
  }

  console.log('');
  console.log('  ══ 四级容灾降级路由器 ══');
  console.log('  智谱(免费) → NVIDIA(免费) → Ollama(本地) → DeepSeek(收费)');
  console.log('');
  console.log('  --status            看每档配置状态');
  console.log('  --test              逐档实测（真实发请求）');
  console.log('  --sensitive-test    验证敏感内容闸');
  console.log('  --ask "问题"         走降级链问一句');
  console.log('  --ask "..." --sensitive   声明敏感（只准本地）');
  console.log('');
}
