/**
 * 人才识别与追踪（R170）
 *
 * 用户要求（2026-10-24，全局规则 §2.8.4）：
 *   「我需要在世界各地发掘和发现相应的人才，懂得人才的识别，
 *     提高找人的能力和方法，最终汇总更有智慧的人的群体的集合，
 *     请编程把这个规则，写进迭代规则。」
 *
 * ★ 先划清边界（诚实）
 *   本工具不能「找到」人才 —— 找人靠线下关系、行业圈层、主动猎取。
 *   本工具能做的是：
 *     ① 记录候选人才 + 按 L1-L4 四层打分（让判断可复盘）
 *     ② 追踪接触节奏（多久没联系、下次该聊什么）
 *     ③ 统计群体结构（认知是否互补、缺哪一块）
 *     ④ 复盘：哪些判断对了、哪些错了（提升人才眼光）
 *
 * ★ 四层识别模型（来自全局规则 §2.8.4）
 *   L1 履历   —— 干过什么、在哪干过（简历/领英/行业名录）
 *   L2 战绩   —— 做成了什么（可验证：要案例、要数字、要能联系到的证人）
 *   L3 判断力 —— 遇到难题怎么想（问一个他没准备过的真实难题，听推理）
 *   L4 品格志趣 —— 没人看着时怎么选；想成为什么（看历史决策、看愿为什么付出代价）
 *
 *   ★ 关键判据：绝大多数招聘失败在 L1-L2 就用完了。真正的人才在 L3-L4。
 *
 * ★ 用人标准（对应「更有智慧的群体」）
 *   不是人多，是【认知互补】：技术 / 商务 / 区域 / 语言 / 资本，各缺一块
 *   每个成员都要能独立判断，不是执行机器
 *   用共同目标 + 长期利益绑定，不是短期合同
 *
 * 用法：
 *   node tools/talent_registry.mjs                     # 总览（人数/结构/待联系）
 *   node tools/talent_registry.mjs --list              # 全部候选
 *   node tools/talent_registry.mjs --add --name "..." --region "..." --role "..."
 *   node tools/talent_registry.mjs --assess --id T-001 --l1 5 --l2 3 --l3 4 --l4 2
 *   node tools/talent_registry.mjs --touch --id T-001 --note "聊了..."
 *   node tools/talent_registry.mjs --gap               # 群体结构缺口
 *   node tools/talent_registry.mjs --review            # 复盘：判断对错
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIR = join(ROOT, 'talent-data');
const REG = join(DIR, 'talents.json');
const TODAY = new Date().toISOString().slice(0, 10);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

mkdirSync(DIR, { recursive: true });

/* ══════════════════════════════════════════════════════════════
 * 数据结构
 * ══════════════════════════════════════════════════════════════ */
function loadReg() {
  if (!existsSync(REG)) {
    return {
      schema: 'mackorn-talent/1',
      created: TODAY,
      updated: TODAY,
      principles: {
        mission: '把 MACKORN 美矿做成世界一线品牌 —— 破碎/磨矿/选矿领域矿山客户信赖的品牌与伙伴',
        why_talent_matters: '一个人的产能有上限。一个能让更聪明的人愿意一起干的人，产能没有上限。代理商是"卖货的人"，人才是"让 MACKORN 变成世界品牌的人"。',
        four_layers: 'L1 履历 / L2 战绩 / L3 判断力 / L4 品格志趣 —— 绝大多数招聘失败在 L1-L2 就用完了',
        group_goal: '不是人多，是认知互补（技术/商务/区域/语言/资本，各缺一块）',
        sourcing_order: '① 现有强关系推荐 ② 行业圈层渗透 ③ 主动猎取 ④ 公开渠道（含专利发明人，被严重低估）⑤ 招聘网站（最后用）',
      },
      dimensions: ['technology', 'business', 'region', 'language', 'capital'],
      talents: [],
      reflections: [],
    };
  }
  return JSON.parse(readFileSync(REG, 'utf8'));
}

function saveReg(reg) {
  reg.updated = TODAY;
  writeFileSync(REG, JSON.stringify(reg, null, 2) + '\n', 'utf8');
}

function nextId(reg) {
  const n = (reg.talents || []).length + 1;
  return 'T-' + String(n).padStart(3, '0');
}

/* ══════════════════════════════════════════════════════════════
 * --add
 * ══════════════════════════════════════════════════════════════ */
if (has('--add')) {
  const name = val('--name');
  if (!name) { console.error('--add 需要 --name'); process.exit(1); }
  const reg = loadReg();
  const t = {
    id: nextId(reg),
    name,
    name_en: val('--name-en') || null,
    region: val('--region') || null,          /* 国家/区域 */
    role: val('--role') || null,              /* 期望角色：技术/商务/区域经理/代理 */
    source: val('--source') || null,          /* 怎么发现的：推荐/展会/专利/LinkedIn */
    contacted: [],                            /* 接触记录 */
    scores: { L1: null, L2: null, L3: null, L4: null },  /* 1-5 */
    notes: {
      L1_resume: val('--l1-note') || null,
      L2_track_record: val('--l2-note') || null,
      L3_judgment: val('--l3-note') || null,
      L4_character: val('--l4-note') || null,
    },
    dimension: val('--dimension') || null,    /* technology/business/region/language/capital */
    status: 'candidate',
    created: TODAY,
    last_contact: null,
    cadence_days: 30,
    risk_flags: [],
  };
  reg.talents.push(t);
  saveReg(reg);
  console.log('');
  console.log('  ✅ 已记录候选人才');
  console.log('     ' + t.id + ' ' + t.name + (t.region ? ' · ' + t.region : '') + (t.role ? ' · ' + t.role : ''));
  console.log('');
  console.log('  下一步：用 --assess 按 L1-L4 打分（这是识别人才的核心动作）');
  console.log('  node tools/talent_registry.mjs --assess --id ' + t.id + ' --l1 5 --l2 3 --l3 4 --l4 2');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --assess  四层打分
 * ══════════════════════════════════════════════════════════════ */
if (has('--assess')) {
  const id = val('--id');
  const reg = loadReg();
  const t = (reg.talents || []).find((x) => x.id === id);
  if (!t) { console.error('找不到: ' + id); process.exit(1); }
  const set = (k) => { const v = val('--' + k.toLowerCase()); return v ? Number(v) : null; };
  const L1 = set('L1'); const L2 = set('L2'); const L3 = set('L3'); const L4 = set('L4');
  if (L1 !== null) t.scores.L1 = L1;
  if (L2 !== null) t.scores.L2 = L2;
  if (L3 !== null) t.scores.L3 = L3;
  if (L4 !== null) t.scores.L4 = L4;

  const sc = t.scores;
  const assessed = Object.values(sc).filter((v) => v !== null).length;
  /* 关键判据：只有 L1-L2 的评估是「浅层」 */
  const deep = (sc.L3 !== null || sc.L4 !== null);
  const avg = assessed ? Number((Object.values(sc).filter((v) => v !== null).reduce((a, b) => a + b, 0) / assessed).toFixed(2)) : null;

  t.assessment = {
    assessed_layers: assessed,
    depth: deep ? 'deep' : 'shallow',
    average: avg,
    verdict: (() => {
      if (!deep) return '⚠️ 只在 L1-L2 —— 这是多数招聘失败的地方。必须做 L3（问没准备过的难题）与 L4（看历史决策）';
      if (avg >= 4) return '✅ 强候选（L3/L4 已评估，均分 ' + avg + '）';
      if (avg >= 3) return '🟡 可用，需补强弱项';
      return '🔴 不建议（均分 ' + avg + '）';
    })(),
    at: TODAY,
  };
  saveReg(reg);

  console.log('');
  console.log('  ══ 四层评估：' + t.name + '（' + t.id + '）══');
  console.log('');
  const names = { L1: '履历（干过什么）', L2: '战绩（做成什么，可验证）', L3: '判断力（没准备过的难题怎么想）', L4: '品格志趣（没人看着时怎么选）' };
  for (const k of ['L1', 'L2', 'L3', 'L4']) {
    const v = sc[k];
    const bar = v === null ? '　未评' : '●'.repeat(v) + '○'.repeat(5 - v) + '  ' + v + '/5';
    console.log('  ' + k + ' ' + names[k].padEnd(34) + bar);
  }
  console.log('');
  console.log('  深度：' + (deep ? '✅ 已触到 L3/L4（真正的人才在这里）' : '⚠️ 只到 L1/L2（多数招聘失败在这里）'));
  console.log('  均分：' + (avg === null ? '—' : avg));
  console.log('  判定：' + t.assessment.verdict);
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --touch  记录接触
 * ══════════════════════════════════════════════════════════════ */
if (has('--touch')) {
  const id = val('--id');
  const reg = loadReg();
  const t = (reg.talents || []).find((x) => x.id === id);
  if (!t) { console.error('找不到: ' + id); process.exit(1); }
  const note = val('--note') || '（无备注）';
  t.contacted = t.contacted || [];
  t.contacted.push({ at: TODAY, note });
  t.last_contact = TODAY;
  saveReg(reg);
  console.log('');
  console.log('  ✅ 已记录接触：' + t.name + ' · ' + TODAY);
  console.log('     ' + note);
  console.log('     累计接触 ' + t.contacted.length + ' 次');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --gap  群体结构缺口
 * ══════════════════════════════════════════════════════════════ */
if (has('--gap')) {
  const reg = loadReg();
  const dims = reg.dimensions || ['technology', 'business', 'region', 'language', 'capital'];
  console.log('');
  console.log('  ══ 群体结构缺口 ══');
  console.log('  （目标：不是人多，是认知互补）');
  console.log('');
  const counts = {};
  for (const t of reg.talents || []) {
    if (t.dimension) counts[t.dimension] = (counts[t.dimension] || 0) + 1;
  }
  const dimName = { technology: '技术', business: '商务', region: '区域覆盖', language: '语言', capital: '资本/融资' };
  let gaps = 0;
  for (const d of dims) {
    const n = counts[d] || 0;
    const ok = n > 0;
    if (!ok) gaps += 1;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + (dimName[d] || d).padEnd(12) + n + ' 人' + (ok ? '' : '  ← 缺这一块'));
  }
  console.log('');
  console.log('  ' + (dims.length - gaps) + '/' + dims.length + ' 维度已覆盖');
  if (gaps) console.log('  ⚠️ 缺 ' + gaps + ' 个维度 —— 认知不互补的团队，规模再大也做不成世界品牌');
  console.log('');
  /* 区域分布 */
  const regions = {};
  for (const t of reg.talents || []) {
    if (t.region) regions[t.region] = (regions[t.region] || 0) + 1;
  }
  if (Object.keys(regions).length) {
    console.log('  ── 区域分布 ──');
    for (const [r, n] of Object.entries(regions).sort((a, b) => b[1] - a[1])) {
      console.log('  ' + r.padEnd(16) + n + ' 人');
    }
    console.log('');
  }
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --review  复盘：判断对错
 * ══════════════════════════════════════════════════════════════ */
if (has('--review')) {
  const reg = loadReg();
  console.log('');
  console.log('  ══ 人才判断复盘 ══');
  console.log('  （提升人才眼光的唯一方法：记录判断 → 验证结果 → 找错在哪）');
  console.log('');
  const assessed = (reg.talents || []).filter((t) => t.assessment);
  const shallow = assessed.filter((t) => t.assessment.depth === 'shallow');
  const deep = assessed.filter((t) => t.assessment.depth === 'deep');
  console.log('  已评估 ' + assessed.length + ' 人');
  console.log('  · 只到 L1-L2（浅层）：' + shallow.length + ' 人' + (shallow.length ? ' ← 需补 L3/L4' : ''));
  console.log('  · 已到 L3-L4（深层）：' + deep.length + ' 人');
  console.log('');
  if (shallow.length) {
    console.log('  ── 需要补 L3/L4 的人 ──');
    for (const t of shallow) {
      console.log('  · ' + t.id + ' ' + t.name + '（均分 ' + t.assessment.average + '）');
      console.log('      L3 怎么测：问一个他没准备过的真实难题（如"如果你只能带 3 个人开拓一个国家的市场，你选谁、为什么"）');
      console.log('      L4 怎么看：看他过去在没人监督时的决策、看他愿意为什么付出代价');
    }
    console.log('');
  }
  const refs = reg.reflections || [];
  if (refs.length) {
    console.log('  ── 历史复盘（' + refs.length + ' 条）──');
    for (const r of refs.slice(-10)) {
      console.log('  · ' + r.at + ' ' + r.talent_name);
      console.log('      当时判断: ' + r.judgment);
      console.log('      实际结果: ' + r.outcome);
      if (r.lesson) console.log('      学到: ' + r.lesson);
    }
    console.log('');
  } else {
    console.log('  ── 还没有历史复盘 ──');
    console.log('  记录方式：node tools/talent_registry.mjs --reflect --id T-001 --judgment "..." --outcome "..." --lesson "..."');
    console.log('');
  }
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --reflect  记录一条复盘
 * ══════════════════════════════════════════════════════════════ */
if (has('--reflect')) {
  const id = val('--id');
  const reg = loadReg();
  const t = (reg.talents || []).find((x) => x.id === id);
  if (!t) { console.error('找不到: ' + id); process.exit(1); }
  reg.reflections = reg.reflections || [];
  reg.reflections.push({
    at: TODAY, talent_id: id, talent_name: t.name,
    judgment: val('--judgment') || null,
    outcome: val('--outcome') || null,
    lesson: val('--lesson') || null,
  });
  saveReg(reg);
  console.log('');
  console.log('  ✅ 已记录复盘：' + t.name);
  console.log('     这是提升人才眼光的唯一方法 —— 判断必须有结果反馈');
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --list
 * ══════════════════════════════════════════════════════════════ */
if (has('--list')) {
  const reg = loadReg();
  console.log('');
  console.log('  ══ 人才库（' + (reg.talents || []).length + ' 人）══');
  console.log('');
  for (const t of reg.talents || []) {
    const sc = t.scores || {};
    const bar = ['L1', 'L2', 'L3', 'L4'].map((k) => (sc[k] === null || sc[k] === undefined ? '·' : sc[k])).join('/');
    console.log('  ' + t.id + ' ' + String(t.name).padEnd(14) + bar + '  ' + (t.region || '?') + ' · ' + (t.role || '?'));
    if (t.assessment) console.log('      ' + t.assessment.verdict.slice(0, 80));
  }
  console.log('');
  process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * 默认：总览
 * ══════════════════════════════════════════════════════════════ */
const reg = loadReg();
const talents = reg.talents || [];
const now = Date.now();
const needContact = talents.filter((t) => {
  if (!t.last_contact) return true;
  return (now - Date.parse(t.last_contact)) / 86400000 >= (t.cadence_days || 30);
});

console.log('');
console.log('  ══ 人才库 ══');
console.log('');
console.log('  ★ 使命：' + reg.principles?.mission);
console.log('');
console.log('  为什么人才最重要：');
console.log('    ' + reg.principles?.why_talent_matters);
console.log('');
console.log('  ── 现状 ──');
console.log('  候选 ' + talents.length + ' 人 · 需联系 ' + needContact.length + ' 人');
if (talents.length) {
  const assessed = talents.filter((t) => t.assessment);
  const shallow = assessed.filter((t) => t.assessment.depth === 'shallow');
  console.log('  已评估 ' + assessed.length + ' · 其中只到 L1-L2 的 ' + shallow.length + ' 人' + (shallow.length ? '（需补 L3/L4）' : ''));
}
console.log('');
if (needContact.length) {
  console.log('  ── 该联系了（超过 ' + 30 + ' 天没接触）──');
  for (const t of needContact.slice(0, 10)) {
    const days = t.last_contact ? Math.floor((now - Date.parse(t.last_contact)) / 86400000) : null;
    console.log('  · ' + t.id + ' ' + t.name + '  ' + (days === null ? '从未接触' : days + ' 天前'));
  }
  console.log('');
}
console.log('  ── 四层识别法（§2.8.4）──');
console.log('  L1 履历   —— 干过什么（简历/领英/行业名录）');
console.log('  L2 战绩   —— 做成什么（要案例、要数字、要能联系到的证人）');
console.log('  L3 判断力 —— 没准备过的难题怎么想（★ 真正的人才在这里）');
console.log('  L4 品格   —— 没人看着时怎么选（★ 真正的人才在这里）');
console.log('');
console.log('  ★ 绝大多数招聘失败在 L1-L2 就用完了。');
console.log('');
console.log('  ── 命令 ──');
console.log('    --add --name "..." --region "..." --role "..." --dimension technology');
console.log('    --assess --id T-001 --l1 5 --l2 3 --l3 4 --l4 2');
console.log('    --touch --id T-001 --note "聊了..."');
console.log('    --gap        群体结构缺口（认知是否互补）');
console.log('    --review     复盘（提升人才眼光的唯一方法）');
console.log('    --list       全部候选');
console.log('');
console.log('  数据：talent-data/talents.json');
console.log('');
