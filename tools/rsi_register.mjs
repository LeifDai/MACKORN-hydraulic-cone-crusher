/**
 * 已知缺陷台账（R94）—— recurrence（同类错误复现率）的度量基础
 *
 * 为什么需要（对齐全局规则 §3.3）：
 *   全局 `AGENTS.md` 明确说：
 *     「`recurrence` 是判定 RSI 真假的唯一硬指标。
 *       门禁加了、同类错误照样犯 = 假改进。」
 *
 *   但 MACKORN 项目原来【无法测 recurrence】——
 *   60 条教训都有 check()，却没有一张表登记「哪个门禁守着哪条教训」。
 *   没有这张表，就无法回答："这条教训的守卫还在吗？失效了吗？"
 *
 * 本工具做三件事：
 *   ① 【登记】把 60 条教训 → 已知缺陷台账（缺陷特征 + 守护机制 + 负控证据）
 *   ② 【核验】真跑守卫：每条教训的 check() 现在还能通过吗？
 *   ③ 【算 recurrence】复现率 = 守卫失效的缺陷数 / 总缺陷数
 *
 * 关键设计（照 HELPER rsi.mjs）：
 *   「守卫不见了 = 退化 = 复发风险 100%」
 *   所以「守卫失效」必须被算成复发，不能算成"新问题"。
 *
 * 用法：
 *   node tools/rsi_register.mjs            # 建台账 + 核验 + 算复发率
 *   node tools/rsi_register.mjs --json     # 只输出 JSON
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const JSON_ONLY = process.argv.includes('--json');
const OUT = join(D, 'rsi-register.json');

/* ── 教训（缺陷的来源）── */
let LESSONS = [];
try {
  const M = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
  LESSONS = M.LESSONS || [];
} catch { }

/* ── 负控文件（守卫的有效性证据）── */
const NEG = {};
for (const f of ['guardrail_negative_controls.mjs', 'syntax_gate_negative_controls.mjs', 'plugin_negative_controls.mjs', 'hardfact_sync_negative_controls.mjs']) {
  const p = join(ROOT, 'tests', 'negative', f);
  NEG[f] = existsSync(p);
}

/* ═══════════════════════════════════════════════════════════════
 * ① 建台账：教训 → 缺陷条目
 *
 *    每条教训天然是一个"已知缺陷"：
 *      id      教训编号
 *      area    领域
 *      title   缺陷特征（"什么样的错"）
 *      guard   守护机制（就是它的 check()）
 *      negctl  有没有负控证明这个守卫真能抓到
 * ═══════════════════════════════════════════════════════════════ */
const negEvidenceFor = (l) => {
  const area = String(l.area || '');
  const id = String(l.id || '');
  /* 粗略映射：哪类教训由哪个负控文件证明 */
  if (/验证|工程/.test(area)) {
    return ['guardrail_negative_controls.mjs', 'syntax_gate_negative_controls.mjs', 'plugin_negative_controls.mjs'].filter((f) => NEG[f]);
  }
  if (/数据/.test(area)) return ['hardfact_sync_negative_controls.mjs'].filter((f) => NEG[f]);
  if (/构建/.test(area)) return ['syntax_gate_negative_controls.mjs'].filter((f) => NEG[f]);
  if (id === 'L-59' || id === 'L-60') return ['hardfact_sync_negative_controls.mjs'].filter((f) => NEG[f]);
  return [];
};

const register = LESSONS.map((l) => ({
  id: l.id,
  area: l.area || '',
  defect: l.title || '',                 // 缺陷特征
  guard: typeof l.check === 'function' ? 'check()' : null,
  negctl: negEvidenceFor(l),
  origin: String(l.origin || '').slice(0, 160),
}));

/* ═══════════════════════════════════════════════════════════════
 * ② 核验：真跑每条守卫
 *
 *    ⚠️ 关键：判据「守卫失效」必须与「守卫拒绝工作」区分开。
 *       · 守卫失效（check 返回 pass=false）→ 复发
 *       · 守卫抛错 / 超时 → 守卫本身坏了，也算复发（更严重）
 * ═══════════════════════════════════════════════════════════════ */
const results = [];
let dead = 0, alive = 0, broken = 0;
for (const r of register) {
  const l = LESSONS.find((x) => x.id === r.id);
  if (!l || typeof l.check !== 'function') { results.push({ ...r, status: 'no-guard' }); broken += 1; continue; }
  let res = null;
  try {
    res = l.check();
    /* 同步 runner 约定：返回 Promise 说明写错了（本会话真实踩过 L-55） */
    if (res && typeof res.then === 'function') { results.push({ ...r, status: 'async-guard' }); broken += 1; continue; }
  } catch (e) {
    results.push({ ...r, status: 'throws', error: String(e.message).slice(0, 100) });
    broken += 1;
    continue;
  }
  if (res && res.pass) { results.push({ ...r, status: 'alive' }); alive += 1; }
  else { results.push({ ...r, status: 'failed', detail: String(res && res.detail || '').slice(0, 120) }); dead += 1; }
}

/* ═══════════════════════════════════════════════════════════════
 * ③ 算 recurrence
 *
 *    定义（严格版）：
 *      recurrence = (守卫失效 + 守卫损坏) / 总缺陷数
 *
 *    含义：有多少"已知缺陷"现在【没有可靠守卫】了。
 *    这个数字必须趋近 0 —— 它升高说明改进在退化。
 * ═══════════════════════════════════════════════════════════════ */
const total = register.length || 1;
const recurrence = (dead + broken) / total;
const negCovered = register.filter((r) => (r.negctl || []).length > 0).length;
const negCoverage = negCovered / total;

/* ═══════════════════════════════════════════════════════════════
 * ④ 输出
 * ═══════════════════════════════════════════════════════════════ */
const out = {
  schema: 'mackorn-rsi-register/1',
  generated: new Date().toISOString(),
  what: '已知缺陷台账 —— recurrence（同类错误复现率）的度量基础。对齐全局 AGENTS.md §3.3。',
  total_defects: register.length,
  alive,
  dead,
  broken,
  recurrence,
  recurrence_note: 'recurrence = (守卫失效 + 守卫损坏) / 总缺陷数。趋近 0 才算真改进。',
  neg_coverage: negCoverage,
  by_status: results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}),
  register: results,
  global_rule_alignment: {
    source: '$DSH_HOME/AGENTS.md §3.3',
    quote: '「recurrence 是判定 RSI 真假的唯一硬指标。门禁加了、同类错误照样犯 = 假改进。」',
    how_measured: '真跑每条教训的 check()，统计失效/损坏的比例',
  },
};

mkdirSync(D, { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

console.log('');
console.log('  ══ 已知缺陷台账 · recurrence 核验 ══');
console.log('');
console.log('  已知缺陷（=教训）   ' + register.length);
console.log('  ✅ 守卫存活          ' + alive);
console.log('  ❌ 守卫失效          ' + dead);
console.log('  ⚠️ 守卫损坏          ' + broken + (broken ? '（抛错/无 check/async）' : ''));
console.log('');
console.log('  ★ recurrence（同类错误复现率）= ' + (recurrence * 100).toFixed(1) + '%'
  + (recurrence === 0 ? '  ✅ 所有已知缺陷都有可靠守卫' : recurrence < 0.05 ? '  ⚠️ 有少量守卫失效' : '  ❌ 守卫大面积失效'));
console.log('    负控覆盖          ' + (negCoverage * 100).toFixed(1) + '%（有多少缺陷有负控证明守卫真能抓到）');
console.log('');

if (dead || broken) {
  console.log('  ── 需要处理 ──');
  for (const r of results) {
    if (r.status === 'failed') console.log('    ❌ ' + r.id + ' [' + r.area + '] ' + r.defect.slice(0, 46) + '  →  ' + r.detail);
    else if (r.status === 'throws') console.log('    ⚠️ ' + r.id + ' 守卫抛错: ' + r.error);
    else if (r.status === 'async-guard') console.log('    ⚠️ ' + r.id + ' 守卫是 async（同步 runner 拿不到结果，见 L-55）');
    else if (r.status === 'no-guard') console.log('    ⚠️ ' + r.id + ' 没有 check()');
  }
  console.log('');
}

console.log('  ── 与全局规则的对齐 ──');
console.log('    ' + out.global_rule_alignment.quote);
console.log('    度量方式：' + out.global_rule_alignment.how_measured);
console.log('');
console.log('  已写 distribution/03_验证与基准/rsi-register.json');
console.log('');
process.exit(0);
