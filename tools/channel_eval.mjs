/**
 * 通道考评器（R186）—— 谁能做得更好，更出色
 *
 * 用户要求（2026-10-26 01:28）：
 *   「建立考评机制，看看谁能做的更好，更出色；
 *     和 kimi 比较，看看是否有免费的版本；
 *     质量 + 效率加权（质量 60% + 效率 40%）」
 *
 * ★ 三层考评（用户全选）
 *   L1 通道   AI 通道（DeepSeek / 智谱 / NVIDIA / Kimi / Ollama）谁在什么任务上更好
 *   L2 助手   不同会话/模型的交付质量（门禁通过率 / 返工次数）
 *   L3 人员   按人才四层识别法（L1履历 / L2战绩 / L3判断力 / L4品格）
 *
 * ★ 加权口径（用户选 3）
 *   质量 60% + 效率 40%
 *   质量：能不能用 / 对不对 / 过几道门禁
 *   效率：延迟 / 成本 / token
 *
 * ★ 诚实边界（必须先说清）
 *   · DSH 会话日志不记录 token 用量 → 考评的是【延迟 + 成功率】，不是精确成本
 *   · 质量评分只有在【真跑任务并验收】后才有意义，不能凭模型自述
 *   · 本工具不代注册账号、不代填 key（红线）
 *
 * 用法：
 *   node tools/channel_eval.mjs --status          # 看所有通道状态（含 key 有无）
 *   node tools/channel_eval.mjs --probe           # 探活（真发请求测延迟）
 *   node tools/channel_eval.mjs --score           # 打分排名
 *   node tools/channel_eval.mjs --kimi            # 专门看 Kimi 各版本
 *   node tools/channel_eval.mjs --json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'channel-eval-data');
const OUT_JSON = join(OUT_DIR, 'channel-eval.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');

/* ══════════════════════════════════════════════════════════════
 * 通道清单（含免费政策 —— 这是用户最关心的）
 * ══════════════════════════════════════════════════════════════ */
const CHANNELS = [
  {
    id: 'deepseek-paid',
    name: 'DeepSeek（收费，兜底）',
    kind: 'paid',
    baseURL: 'https://api.deepseek.com/v1',
    keyEnv: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    freePolicy: '新用户 500 万 tokens / 30 天，之后收费',
    note: '当前主力（其他 key 都没配时唯一能用的）',
  },
  {
    id: 'nvidia-kimi',
    name: 'Kimi K2.6（NVIDIA NIM，免费）',
    kind: 'free',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    models: ['moonshotai/kimi-k2.6'],
    freePolicy: 'NVIDIA NIM 免费额度（已确认可用）',
    note: '★ 这就是「Kimi 免费版」—— 不需要月之暗面账号',
  },
  {
    id: 'nvidia-glm',
    name: 'GLM-5.3 Flash（NVIDIA NIM，免费）',
    kind: 'free',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    models: ['z-ai/glm-5.3-flash'],
    freePolicy: 'NVIDIA NIM 免费额度',
    note: '快（1.5s），适合 T0 机械活',
  },
  {
    id: 'nvidia-nemotron-fast',
    name: 'Nemotron 3.5 Lightning（NVIDIA NIM，最快）',
    kind: 'free',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    models: ['nvidia/nemotron-3.5-lightning-30b-a3b'],
    freePolicy: 'NVIDIA NIM 免费额度',
    note: '最快（0.6s），适合简单分类/抽取',
  },
  {
    id: 'nvidia-nemotron-strong',
    name: 'Nemotron 3 Super 120B（NVIDIA NIM，强）',
    kind: 'free',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    models: ['nvidia/nemotron-3-super-120b-a12b'],
    freePolicy: 'NVIDIA NIM 免费额度',
    note: '免费里最强的一档',
  },
  {
    id: 'nvidia-deepseek',
    name: 'DeepSeek V4.1 Flash（NVIDIA NIM，免费）',
    kind: 'free',
    baseURL: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
    models: ['deepseek-ai/deepseek-v4.1-flash'],
    freePolicy: 'NVIDIA NIM 免费额度',
    note: 'DeepSeek 的免费通道',
  },
  {
    id: 'zhipu-glm4-flash',
    name: '智谱 GLM-4-Flash（完全免费）',
    kind: 'free',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    keyEnv: 'ZHIPU_API_KEY',
    models: ['glm-4-flash'],
    freePolicy: '★ 完全免费，无 token 上限，30 并发',
    note: '国内永久免费里最稳的',
  },
  {
    id: 'kimi-official',
    name: 'Kimi 官方 API（月之暗面，收费）',
    kind: 'paid',
    baseURL: 'https://api.moonshot.cn/v1',
    keyEnv: 'MOONSHOT_API_KEY',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    freePolicy: '新用户送 15 元额度（非永久免费）',
    note: '★ 实测 2026-10-26：key 有效（能查余额、能列模型），但账户欠费 0.03092 元被暂停 → 充值任意金额即可用',
  },
  {
    id: 'siliconflow',
    name: '硅基流动（9B 以下永久免费）',
    kind: 'free',
    baseURL: 'https://api.siliconflow.cn/v1',
    keyEnv: 'SILICONFLOW_API_KEY',
    models: ['Qwen/Qwen2.5-7B-Instruct', 'THUDM/glm-4-9b-chat'],
    freePolicy: '9B 以下模型永久免费',
    note: '中小模型免费',
  },
  {
    id: 'qianfan',
    name: '百度千帆 ERNIE-Speed（永久免费）',
    kind: 'free',
    baseURL: 'https://qianfan.baidubce.com/v2',
    keyEnv: 'QIANFAN_API_KEY',
    models: ['ernie-speed-128k'],
    freePolicy: '永久免费，QPS=50',
    note: '国内免费额度最大的之一',
  },
  {
    id: 'ollama-local',
    name: 'Ollama 本地 qwen2.5:1.5b（真·免费无限）',
    kind: 'local',
    baseURL: 'http://localhost:11434/v1',
    keyEnv: null,
    models: ['qwen2.5:1.5b'],
    freePolicy: '完全免费，无额度，不出网',
    note: '★ 敏感数据唯一安全通道（合同/报价/图纸）',
  },
];

/* ══════════════════════════════════════════════════════════════
 * ① 状态检查（key 有没有配）
 * ══════════════════════════════════════════════════════════════ */
function checkStatus() {
  const results = [];
  for (const ch of CHANNELS) {
    const hasKey = ch.keyEnv ? !!process.env[ch.keyEnv] : true;
    results.push({
      ...ch,
      hasKey,
      keyEnvSet: ch.keyEnv || '（本地服务，无需 key）',
      ready: ch.kind === 'local' ? true : hasKey,
    });
  }
  return results;
}

/* ══════════════════════════════════════════════════════════════
 * ② 探活（真发请求测延迟）
 * ══════════════════════════════════════════════════════════════ */
async function probeOne(ch) {
  const r = { id: ch.id, name: ch.name, ok: false, latency_ms: null, http: null, error: null, model_found: null };
  if (!ch.keyEnv || !process.env[ch.keyEnv]) {
    if (ch.kind !== 'local') { r.error = '缺 key（' + ch.keyEnv + '）'; return r; }
  }
  const t0 = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (ch.keyEnv && process.env[ch.keyEnv]) headers['Authorization'] = 'Bearer ' + process.env[ch.keyEnv];
    const res = await fetch(ch.baseURL + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: ch.models[0],
        messages: [{ role: 'user', content: '回复一个字：好' }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(45000),
    });
    r.http = res.status;
    r.latency_ms = Date.now() - t0;
    if (res.ok) {
      const j = await res.json();
      r.ok = true;
      r.model_found = j.model || ch.models[0];
      r.actual_latency = r.latency_ms;
    } else {
      const txt = await res.text().catch(() => '');
      r.error = 'HTTP ' + res.status + ' ' + txt.slice(0, 60);
    }
  } catch (e) {
    r.latency_ms = Date.now() - t0;
    r.error = String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 60);
  }
  return r;
}

/* ══════════════════════════════════════════════════════════════
 * ③ 打分（质量 60% + 效率 40%）
 * ══════════════════════════════════════════════════════════════ */
function scoreChannels(statuses, probes) {
  const scored = [];
  for (const st of statuses) {
    const probe = probes.find((p) => p.id === st.id) || {};
    /* 质量分（60）：能不能用 + 免费 + 模型档位 */
    let quality = 0;
    const qDetail = [];
    if (probe.ok) { quality += 35; qDetail.push('探活成功 +35'); }
    else if (st.ready) { quality += 15; qDetail.push('有 key 但未实测 +15'); }
    else { qDetail.push('不可用 +0'); }
    if (st.kind === 'free') { quality += 15; qDetail.push('免费 +15'); }
    else if (st.kind === 'local') { quality += 20; qDetail.push('本地零成本 +20'); }
    else { qDetail.push('收费 +0'); }
    const strong = /120B|K2\.6|Super|128k|reasoner/i.test(st.models.join(' '));
    if (strong) { quality += 10; qDetail.push('强模型档 +10'); }

    /* 效率分（40）：延迟越低越高 */
    let efficiency = 0;
    const eDetail = [];
    const lat = probe.latency_ms;
    if (lat != null && probe.ok) {
      if (lat < 1000) { efficiency += 40; eDetail.push('极快 <1s +40'); }
      else if (lat < 3000) { efficiency += 32; eDetail.push('快 <3s +32'); }
      else if (lat < 8000) { efficiency += 22; eDetail.push('中 <8s +22'); }
      else if (lat < 20000) { efficiency += 12; eDetail.push('慢 <20s +12'); }
      else { efficiency += 5; eDetail.push('很慢 >20s +5'); }
    } else if (st.ready) { efficiency += 10; eDetail.push('未实测 +10'); }

    scored.push({
      ...st,
      score: quality + efficiency,
      quality, efficiency,
      quality_detail: qDetail.join(' · '),
      efficiency_detail: eDetail.join(' · '),
      probe,
    });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const statuses = checkStatus();

console.log('');
console.log('  ══ 通道考评器 ══');
console.log('  （考评口径：质量 60% + 效率 40%）');
console.log('');

/* Kimi 专项 */
if (has('--kimi')) {
  console.log('  ══ Kimi 各版本对比 ══');
  const kimis = [
    { v: 'Kimi K2.6（NVIDIA NIM）', free: true, how: '已配在 settings.yaml，需 NVIDIA_API_KEY', url: 'https://integrate.api.nvidia.com/v1' },
    { v: 'Kimi 官方 API（月之暗面）', free: false, how: '新用户 15 元额度，之后收费', url: 'https://api.moonshot.cn/v1' },
    { v: 'Kimi 网页版', free: true, how: '完全免费，但无 API（不能程序调用）', url: 'https://kimi.moonshot.cn' },
  ];
  for (const k of kimis) {
    console.log('  ' + (k.free ? '✅ 免费' : '💰 收费') + '  ' + k.v);
    console.log('       ' + k.how);
  }
  console.log('');
  console.log('  ★ 结论：Kimi 免费版【已经有了】—— 走 NVIDIA NIM 的 moonshotai/kimi-k2.6');
  console.log('     不需要月之暗面账号，只需 NVIDIA_API_KEY（免费注册）');
  console.log('');
}

/* 状态表 */
console.log('  ══ ① 通道状态（key 有没有配）══');
console.log('  ' + '通道'.padEnd(38) + '类型'.padEnd(8) + 'key');
console.log('  ' + '─'.repeat(70));
for (const st of statuses) {
  const kindLabel = st.kind === 'free' ? '免费' : st.kind === 'local' ? '本地' : '收费';
  const keyLabel = st.kind === 'local' ? '✓ 无需' : st.hasKey ? '✅ 已配' : '❌ 缺 ' + st.keyEnv;
  console.log('  ' + st.name.padEnd(36) + ' ' + kindLabel.padEnd(6) + ' ' + keyLabel);
}
console.log('');

const readyCount = statuses.filter((s) => s.ready).length;
console.log('  可用通道：' + readyCount + '/' + statuses.length);
if (readyCount <= 1) {
  console.log('  ⚠️ 只有 ≤1 个通道可用 → 实际上还在用收费 DeepSeek');
  console.log('     配置看起来全，但 key 没设 → 一个免费通道都用不上');
  console.log('     ★ 这是「谁能做得更好」的真正阻塞：不是模型不行，是 key 没配');
}
console.log('');

/* 探活 */
let probes = [];
if (has('--probe') || has('--score')) {
  console.log('  ══ ② 探活（真发请求测延迟，每个最多等 45s）══');
  for (const st of statuses) {
    if (!st.ready) { console.log('  ⊘ ' + st.name.padEnd(36) + ' 跳过（缺 key）'); continue; }
    process.stdout.write('  ⏳ ' + st.name.padEnd(36) + ' 探测中…');
    const p = await probeOne(st);
    probes.push(p);
    process.stdout.write('\r  ' + (p.ok ? '✅' : '❌') + ' ' + st.name.padEnd(36) + ' ' +
      (p.ok ? (p.latency_ms + 'ms') : (p.error || '').slice(0, 40)) + '\n');
  }
  console.log('');
}

/* 打分 */
const scored = scoreChannels(statuses, probes);
if (has('--score') || has('--probe')) {
  console.log('  ══ ③ 排名（质量 60% + 效率 40%）══');
  console.log('  ' + '排名'.padEnd(5) + '通道'.padEnd(36) + '总分'.padEnd(7) + '质量'.padEnd(6) + '效率');
  console.log('  ' + '─'.repeat(72));
  scored.forEach((s, i) => {
    console.log('  ' + String(i + 1).padEnd(4) + ' ' + s.name.padEnd(35) + ' ' +
      String(s.score).padEnd(6) + ' ' + String(s.quality).padEnd(5) + ' ' + s.efficiency);
  });
  console.log('');
  console.log('  ══ ④ 明细（前 3 名）══');
  for (const s of scored.slice(0, 3)) {
    console.log('  ' + s.name);
    console.log('      质量 ' + s.quality + '/60：' + s.quality_detail);
    console.log('      效率 ' + s.efficiency + '/40：' + s.efficiency_detail);
  }
  console.log('');
}

/* 落盘 */
const report = {
  schema: 'mackorn-channel-eval/1',
  at: new Date().toISOString(),
  rubric: { quality: 60, efficiency: 40, note: 'DSH 日志无 token 用量，考评延迟+成功率，不是精确成本' },
  channels: scored.map((s) => ({
    id: s.id, name: s.name, kind: s.kind, models: s.models,
    freePolicy: s.freePolicy, hasKey: s.hasKey, ready: s.ready,
    score: s.score, quality: s.quality, efficiency: s.efficiency,
    probe: s.probe, note: s.note,
  })),
  summary: {
    total: statuses.length,
    ready: readyCount,
    probed: probes.filter((p) => p.ok).length,
    top: scored[0] ? scored[0].name : null,
  },
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

console.log('  报告：channel-eval-data/channel-eval.json');
console.log('');

if (JSON_OUT) console.log(JSON.stringify(report.summary, null, 2));
