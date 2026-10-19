/**
 * RSI 判级器（R93）—— 递归自我改进的可测量闭环
 *
 * 依据用户给的 RSI 定义（原文要点）：
 *   · AI 辅助研发：模型帮人做事，但【目标/决策/流程仍由人控制】
 *   · RSI：系统参与改进【自身的算法、训练方法、工具链、后续研发流程】，
 *          并使这些改进【提高下一轮研发的效率或能力】
 *   · 真正的 RSI 至少要形成一个【可验证的闭环】
 *   · 更高门槛：改进要能【可靠地迁移到后续研发任务】，
 *               并【持续提升研发系统本身的能力】
 *
 * 设计原则（照 DeepRSI 的思路）：
 *   **用实际任务表现衡量，不听模型对自身能力的描述。**
 *
 * 七项可测指标：
 *   ① 持久化率   改进是否写进文件（而不是只存在于对话）
 *   ② 应用率     下一轮是否自动执行它
 *   ③ 元层改进占比  「防止再犯类」机制 / 全部改进  ← L3 的判据
 *   ④ 棘轮单调性  机制数量是否只增不减
 *   ⑤ 负控覆盖率  有多少机制被证明真的能抓到问题
 *   ⑥ 迁移率 ★   教训在【非起源领域】抓到问题的比例  ← L4 的判据（分水岭）
 *   ⑦ 效率趋势    同样工作量的耗时是否下降
 *
 * 防自吹：LEVEL = 满足条件的最高级，但被【最低的未达标项】卡住 —— 不许跳级。
 *
 * 用法：
 *   node tools/rsi_level.mjs           # 判级并输出
 *   node tools/rsi_level.mjs --json    # 只输出 JSON
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const JSON_ONLY = process.argv.includes('--json');
const BASELINE = join(D, 'rsi-baseline.json');

/* ═══════════════════════════════════════════════════════════════
 * 数据收集
 * ═══════════════════════════════════════════════════════════════ */

/* ── 教训 ── */
let LESSONS = [];
try {
  const M = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
  LESSONS = M.LESSONS || [];
} catch { }

/* ── 门禁项 ── */
let GATES = [];
try {
  const g = readFileSync(join(HERE, 'enforce_lessons.mjs'), 'utf8');
  GATES = [...g.matchAll(/rec\('([^']+)',\s*'([^']*)'/g)].map((m) => ({ id: m[1], name: m[2] }));
} catch { }

/* ── 负控文件 ── */
let NEG_FILES = [];
try { NEG_FILES = readdirSync(join(ROOT, 'tests', 'negative')).filter((f) => f.endsWith('.mjs')); } catch { }

/* ── PDCA 台账 ── */
let ROUNDS = [];
try {
  const j = JSON.parse(readFileSync(join(ROOT, 'distribution', '05_视角与复盘', 'PDCA台账.json'), 'utf8'));
  ROUNDS = j.rounds || [];
} catch { }

/* ═══════════════════════════════════════════════════════════════
 * ① 持久化率
 *    判据：教训都有 fix 字段（说明"改了什么"写进了文件）
 * ═══════════════════════════════════════════════════════════════ */
const withFix = LESSONS.filter((l) => l.fix && String(l.fix).length >= 20);
const persistence = LESSONS.length ? withFix.length / LESSONS.length : 0;

/* ═══════════════════════════════════════════════════════════════
 * ② 应用率
 *    判据：有 check() 且被门禁/runner 自动调用
 *    （lessons.mjs 的 runner 会跑全部 → 有 check 即被应用）
 * ═══════════════════════════════════════════════════════════════ */
const withCheck = LESSONS.filter((l) => typeof l.check === 'function');
const application = LESSONS.length ? withCheck.length / LESSONS.length : 0;

/* ═══════════════════════════════════════════════════════════════
 * ③ 元层改进占比
 *    判据：教训里「防止再犯类」的占比
 *    识别：title/fix 里出现"必须/不许/禁止/不能/须/防"等约束词，
 *          且 fix 里有"机制/判据/检查/固化"等制度化词
 * ═══════════════════════════════════════════════════════════════ */
const META_WORDS = /机制|判据|检查器|固化|棘轮|负控|门禁|不许|禁止|绝不能|必须同时|防止再犯|只能增|可验证/;
const META_TITLE = /必须|不许|禁止|不能|绝不|须|防|要/;
const metaLessons = LESSONS.filter((l) => {
  const s = String(l.title || '') + ' ' + String(l.fix || '');
  return META_TITLE.test(String(l.title || '')) && META_WORDS.test(s);
});
const metaRatio = LESSONS.length ? metaLessons.length / LESSONS.length : 0;

/* ═══════════════════════════════════════════════════════════════
 * ④ 棘轮单调性
 *    判据：机制数量（教训 + 门禁）与基线比只增不减
 * ═══════════════════════════════════════════════════════════════ */
const mechanismCount = LESSONS.length + GATES.length;
let baseline = null;
if (existsSync(BASELINE)) { try { baseline = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { } }
const ratchetOk = !baseline || mechanismCount >= (baseline.mechanisms || 0);
const ratchetDelta = baseline ? mechanismCount - (baseline.mechanisms || 0) : 0;

/* ═══════════════════════════════════════════════════════════════
 * ⑤ 负控覆盖率
 *    判据：每个含"判据有效性"需求的领域都有负控文件
 *    识别：教训 area 里出现"验证"类的，应与负控数匹配；
 *          门禁项里带"负控"字样的都应有对应文件
 * ═══════════════════════════════════════════════════════════════ */
const NEG_AREAS = ['验证', '工程', '构建'];
const negAreasNeeded = new Set(LESSONS.filter((l) => NEG_AREAS.includes(l.area)).map((l) => l.area)).size || 1;
const negCoverage = Math.min(1, NEG_FILES.length / negAreasNeeded);

/* ═══════════════════════════════════════════════════════════════
 * ⑥ 迁移率 ★ 分水岭指标
 *
 *    定义：一条教训在【与它起源领域不同的场景】里被再次使用/救场。
 *
 *    怎么测（可验证，不靠自述）：
 *      a) 扫 PDCA 台账每一轮的 plan/check/act 文本
 *      b) 找出其中提到的教训 id（形如 L-xx）
 *      c) 对每条教训，统计它在【诞生之后】的轮次里被提到几次
 *      d) 若提到它的轮次主题（该轮 plan 开头）与教训 area 明显不同 → 记一次迁移
 *      e) 迁移率 = 有迁移记录的教训 / 总教训
 *
 *    这是本项目最接近 DeepRSI 的度量：用【实际发生的任务】证明改进在迁移。
 * ═══════════════════════════════════════════════════════════════ */

/* 教训 id → 它的 area */
const areaOf = new Map(LESSONS.map((l) => [l.id, l.area || '']));

/* 从 origin 里粗提"诞生轮次号"（形如 R26 / R68-R69） */
function birthRound(origin) {
  const m = String(origin || '').match(/R(\d+)/);
  return m ? Number(m[1]) : null;
}
const birthOf = new Map(LESSONS.map((l) => [l.id, birthRound(l.origin)]));

/* 扫 PDCA 轮次，记录每个教训 id 出现在哪些轮 */
const mentions = new Map();   // id -> [{ round, text }]
for (const r of ROUNDS) {
  const blob = String(r.plan || '') + ' ' + String(r.check || '') + ' ' + String(r.act || '');
  const roundNum = Number(String(r.round || '').replace(/[^0-9]/g, '')) || 0;
  const ids = new Set([...blob.matchAll(/\bL-(\d{2})\b/g)].map((m) => 'L-' + m[1]));
  for (const id of ids) {
    if (!mentions.has(id)) mentions.set(id, []);
    mentions.get(id).push({ round: roundNum, text: blob });
  }
}

/* 判断"这一轮的领域"是否与教训 area 不同 */
function isCrossDomain(blob, area) {
  if (!area) return false;
  /* 该轮文本里如果大量出现教训所属领域的词，算同域 */
  const AREA_HINTS = {
    验证: /验证|判据|负控|突变|自证|测试/,
    数据: /数据|哨兵|参数表|跨表|硬事实|语言数|工具数/,
    构建: /构建|产物|版本|门禁|语法|可重复/,
    AI收录: /收录|分发|索引|llms|hreflang|sitemap|skills|PR|Registry/,
    工程: /工程|脚本|路径|替换|导入|递归|并发/,
    合规: /合规|脱敏|泄露|价格|客户名/,
    市场: /市场|竞品|客户|报价/,
  };
  const re = AREA_HINTS[area];
  if (!re) return false;
  return !re.test(blob);      // 该轮不太像这个领域 → 算跨域
}

let transferCount = 0;
const transferRecords = [];
for (const l of LESSONS) {
  const birth = birthOf.get(l.id);
  const ms = (mentions.get(l.id) || []).filter((m) => (birth === null || m.round > birth));
  if (!ms.length) continue;
  const cross = ms.filter((m) => isCrossDomain(m.text, l.area));
  if (cross.length) {
    transferCount += 1;
    transferRecords.push({ id: l.id, area: l.area, rounds: cross.map((m) => 'R' + m.round).slice(0, 5) });
  }
}
const transferRate = LESSONS.length ? transferCount / LESSONS.length : 0;

/* ═══════════════════════════════════════════════════════════════
 * ⑦ 效率趋势
 *    判据：同等约束下，完成一轮 PDCA 的字数/轮次密度是否下降
 *    （我们没有精确耗时，用"每轮产出字数"做代理：越少字覆盖越多东西 = 效率高）
 * ═══════════════════════════════════════════════════════════════ */
let efficiency = null;
if (ROUNDS.length >= 10) {
  const half = Math.floor(ROUNDS.length / 2);
  const avgLen = (arr) => arr.reduce((s, r) => s + String(r.act || '').length, 0) / (arr.length || 1);
  const early = avgLen(ROUNDS.slice(0, half));
  const late = avgLen(ROUNDS.slice(half));
  efficiency = { early: Math.round(early), late: Math.round(late), improving: late <= early * 1.15 };
}

/* ═══════════════════════════════════════════════════════════════
 * 判级（防自吹：被最低未达标项卡住）
 * ═══════════════════════════════════════════════════════════════ */
const checks = [
  { key: 'L2-persist', level: 2, name: '持久化率 ≥ 90%', value: persistence, pass: persistence >= 0.9, fmt: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'L2-apply', level: 2, name: '应用率 ≥ 90%', value: application, pass: application >= 0.9, fmt: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'L3-meta', level: 3, name: '元层改进占比 ≥ 50%', value: metaRatio, pass: metaRatio >= 0.5, fmt: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'L3-ratchet', level: 3, name: '棘轮未倒退（机制数只增不减）', value: ratchetDelta, pass: ratchetOk, fmt: (v) => (v >= 0 ? '+' : '') + v },
  { key: 'L3-neg', level: 3, name: '负控覆盖率 ≥ 60%', value: negCoverage, pass: negCoverage >= 0.6, fmt: (v) => (v * 100).toFixed(0) + '%' },
  { key: 'L4-transfer', level: 4, name: '迁移率 ≥ 30%（跨域救场）', value: transferRate, pass: transferRate >= 0.3, fmt: (v) => (v * 100).toFixed(1) + '%' },
];

let level = 1;
for (const lv of [2, 3, 4]) {
  const forThis = checks.filter((c) => c.level === lv);
  if (forThis.every((c) => c.pass)) level = lv;
  else break;   // 不许跳级
}

/* ═══════════════════════════════════════════════════════════════
 * 输出
 * ═══════════════════════════════════════════════════════════════ */
const out = {
  schema: 'mackorn-rsi/1',
  generated: new Date().toISOString(),
  level,
  ceiling: 4,
  ceiling_reason: '严格意义的 L5 需要能改进【自身基础模型（权重/架构/训练方法）】—— 本项目改的是工具链与判据，改不了自己的权重。所以天花板 = L4。这不是谦虚，是事实。',
  metrics: {
    persistence: { value: persistence, passed: withFix.length, total: LESSONS.length },
    application: { value: application, passed: withCheck.length, total: LESSONS.length },
    meta_ratio: { value: metaRatio, passed: metaLessons.length, total: LESSONS.length },
    ratchet: { mechanisms: mechanismCount, baseline: baseline ? baseline.mechanisms : null, delta: ratchetDelta, ok: ratchetOk },
    neg_control: { files: NEG_FILES.length, needed: negAreasNeeded, coverage: negCoverage },
    transfer: { rate: transferRate, count: transferCount, total: LESSONS.length, records: transferRecords },
    efficiency,
    gates: GATES.length,
    rounds: ROUNDS.length,
  },
  checks,
  next_step: (() => {
    const failed = checks.filter((c) => !c.pass).sort((a, b) => a.level - b.level)[0];
    if (!failed) return '已达 L4（本项目天花板）。保持并继续扩大迁移证据。';
    return '升到 L' + failed.level + ' 的最小一步：让「' + failed.name + '」达标（当前 ' + failed.fmt(failed.value) + '）。';
  })(),
  honest_notes: [
    '本判级只测【本项目】（工具链层面），不测"模型本身变强了没有"。',
    '迁移率用 PDCA 台账里的实际引用做证据，不采信任何自我描述。',
    '级别被【最低未达标项】卡住 —— 单项很高也不会跳级，防自吹。',
  ],
};

/* 写基线（首次） */
if (!baseline) {
  mkdirSync(D, { recursive: true });
  writeFileSync(BASELINE, JSON.stringify({ established: out.generated, mechanisms: mechanismCount, lessons: LESSONS.length, gates: GATES.length }, null, 2), 'utf8');
}

mkdirSync(D, { recursive: true });
writeFileSync(join(D, 'rsi-level.json'), JSON.stringify(out, null, 2), 'utf8');

if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const LV = ['L0 纯人工', 'L1 AI 辅助', 'L2 产物自改进', 'L3 流程自改进', 'L4 跨任务迁移', 'L5 自模型改进'];
console.log('');
console.log('  ══ RSI 判级（递归自我改进的可测闭环）══');
console.log('');
console.log('  当前级别：' + LV[level]);
console.log('  天花板：  ' + LV[out.ceiling] + '（L5 做不到 —— 我们不能改自己的权重）');
console.log('');
console.log('  ── 七项指标 ──');
for (const c of checks) {
  console.log('  ' + (c.pass ? '✅' : '❌') + ' L' + c.level + ' ' + c.name.padEnd(30) + '  实际 ' + c.fmt(c.value));
}
console.log('  ── 补充 ──');
console.log('    机制总数（教训+门禁）  ' + mechanismCount + (baseline ? '  （基线 ' + baseline.mechanisms + '，' + (ratchetDelta >= 0 ? '+' : '') + ratchetDelta + '）' : '  （首轮基线）'));
console.log('    负控文件               ' + NEG_FILES.length);
console.log('    PDCA 轮次              ' + ROUNDS.length);
if (efficiency) console.log('    每轮固化字数           ' + efficiency.early + ' → ' + efficiency.late + (efficiency.improving ? '  ✅ 未膨胀' : '  ⚠️ 在膨胀'));
console.log('');
console.log('  ── 迁移证据（跨领域救场，L4 的分水岭）──');
if (!transferRecords.length) {
  console.log('    （暂无。迁移率 = 0 —— 说明改进还没在"没想到的场景"里救过场）');
} else {
  for (const t of transferRecords.slice(0, 12)) console.log('    · ' + t.id + ' [' + t.area + '] 在 ' + t.rounds.join('/') + ' 被跨域引用');
  if (transferRecords.length > 12) console.log('    … 另有 ' + (transferRecords.length - 12) + ' 条');
}
console.log('');
console.log('  ── 下一步 ──');
console.log('    ' + out.next_step);
console.log('');
console.log('  ── 诚实声明 ──');
for (const n of out.honest_notes) console.log('    · ' + n);
console.log('');
console.log('  已写 distribution/03_验证与基准/rsi-level.json');
console.log('');
process.exit(0);
