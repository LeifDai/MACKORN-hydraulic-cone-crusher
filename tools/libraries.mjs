/**
 * 经验库 / 错误库 引擎（含评分与正判-模棱两可判定）
 * ================================================================
 * 用户设定：
 *   经验库 JY0001.1 —— 积累「什么做法让我们被 AI/网站收录」，按收录方的类别与权重打分
 *   错误库 CW0001.1 —— 积累「什么做法失败」，同样按权重记分
 *
 * 判定规则（用户明确定义）：
 *   经验：
 *     · 屡试屡好（成功率 = 100%，试验 ≥ 3）      → 正判
 *     · 屡试有时好有时坏（0 < 成功率 < 100%）    → 模棱两可经验
 *     · 屡试屡坏（成功率 = 0%）                  → 应降权/移入错误库
 *   错误：
 *     · 屡次测试都是失败（失败率 = 100%，试验 ≥ 3）→ 正判（错误被确认）
 *     · 有时坏有时不坏（0 < 失败率 < 100%）       → 模棱两可错误
 *
 * 防止误判的三条纪律：
 *   ① 试验次数 < 3 一律判「待定」，不下结论（样本太少）
 *   ② 未验证的记录不能算成功/失败 —— 必须有 observed 证据
 *   ③ 「测不到」（网络不可达/被反爬）不算失败，单独记 UNKNOWN，不计入成功率分母
 *
 * 存放：$DSH_HOME/mackorn-libraries/ （与知识库同源，插件升级不丢）
 *      同时镜像到 distribution/07_库/
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh');

/**
 * 存放策略：
 *   主库放在【工作区内】的 distribution/07_库/ —— 它是交付物的一部分，
 *   可以随差量包分发，也不受运行环境权限限制。
 *   DSH_HOME/mackorn-libraries 作为【可选镜像】—— 只在可写时写入（沙箱可能禁止）。
 *   ⚠️ 早期版本把主库放在 DSH_HOME，实测在受限环境下 EPERM 直接崩。
 *      库是产品资产，不该依赖沙箱外的可写路径。
 */
const MIRROR = join(ROOT, 'distribution', '07_库');   // 主库（工作区内）
const STORE = MIRROR;
const OPTIONAL_MIRROR = join(DSH_HOME, 'mackorn-libraries');
mkdirSync(STORE, { recursive: true });

export const FILES = {
  JY: 'JY0001.1-经验库.json',
  CW: 'CW0001.1-错误库.json',
  XXAL: 'XXAL1000.1-选型案例库.json',
  CL: 'CL0001.1-材料库.json',
};

/* ══════════════════════════════════════════════════════════════════
 * 收录方权重表 —— 决定「被谁收录」值多少分
 *
 * 权重依据：
 *   官方/标准机构     —— AI 训练与检索都优先采信
 *   大型通用目录      —— 覆盖面广，被 AI 直接读取
 *   搜索引擎          —— 是 AI 联网搜索的底座
 *   行业媒体          —— 垂直权威，AI 回答行业问题时会引用
 *   训练语料/学术     —— 进入模型权重，影响最持久
 *   小型个人目录      —— 有一定发现价值，但影响有限
 * ══════════════════════════════════════════════════════════════════ */
export const SOURCE_WEIGHTS = {
  训练语料: 1.0,
  学术: 1.0,
  官方注册表: 1.0,
  标准化机构: 0.95,
  搜索引擎: 0.9,
  MCP目录_官方: 1.0,
  MCP目录_大型: 0.75,
  MCP目录_小型: 0.4,
  包仓库: 0.85,
  代码归档: 0.8,
  数据集平台: 0.9,
  行业媒体: 0.7,
  招标平台: 0.6,
  企业目录: 0.5,
  政府公开: 0.9,
  个人博客: 0.2,
};

/** 由目标名推断类别（用于自动打分，避免手工标注） */
export function inferSourceType(name, hint) {
  if (hint) return hint;
  const n = String(name);
  if (/Common Crawl|训练语料|Pile/i.test(n)) return '训练语料';
  if (/arXiv|OpenAlex|Crossref|DataCite|DOAJ|Zenodo|figshare/i.test(n)) return '数据集平台';
  if (/registry\.modelcontextprotocol|官方.*Registry|标准/i.test(n)) return '官方注册表';
  if (/Glama|Smithery|MCP\.so|PulseMCP|LobeHub|mcpworld|mcp\.directory|MCP Market|awesome-mcp/i.test(n)) return 'MCP目录_大型';
  if (/npm|PyPI|包仓库/i.test(n)) return '包仓库';
  if (/GitHub|Software Heritage|GitLab/i.test(n)) return '代码归档';
  if (/Bing|Yandex|百度|搜狗|360|Mojeek|Marginalia|Google|搜索引擎/i.test(n)) return '搜索引擎';
  if (/Mining\.com|AggBusiness|InfoMine|行业/i.test(n)) return '行业媒体';
  if (/WIPO|专利/i.test(n)) return '标准化机构';
  if (/UNGM|TendersInfo|招标/i.test(n)) return '招标平台';
  return 'MCP目录_小型';
}

/* ══════════════════════════════════════════════════════════════════
 * 判定与评分
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 经验判定
 * @param {object} e 经验记录 { trials, successes, unknowns }
 * @returns { trial, success, fail, rate, verdict, verdict_note }
 */
export function judgeExperience(e) {
  const trials = Number(e.trials || 0);
  const success = Number(e.successes || 0);
  const unknown = Number(e.unknowns || 0);
  const known = trials - unknown;                    // 已知结果的有效试验
  const fail = Math.max(0, known - success);
  const rate = known > 0 ? success / known : null;

  let verdict, note;
  if (known < 3) { verdict = '待定'; note = '有效试验仅 ' + known + ' 次（< 3），样本不足以判定 —— 继续积累'; }
  else if (rate === 1) { verdict = '正判'; note = known + ' 次全部有效，屡试屡好 —— 可作为稳定经验使用'; }
  else if (rate === 0) { verdict = '无效经验'; note = known + ' 次全部无效 —— 应从经验库降权或移入错误库'; }
  else { verdict = '模棱两可经验'; note = known + ' 次中成功 ' + success + ' 次（' + Math.round(rate * 100) + '%）—— 有条件成立，须标注适用条件'; }

  return { trials, known, success, fail, unknown, rate: rate == null ? null : +rate.toFixed(3), verdict, verdict_note: note };
}

/**
 * 错误判定
 * @param {object} e 错误记录 { trials, failures, unknowns }
 */
export function judgeError(e) {
  const trials = Number(e.trials || 0);
  const failures = Number(e.failures || 0);
  const unknown = Number(e.unknowns || 0);
  const known = trials - unknown;
  const ok = Math.max(0, known - failures);
  const rate = known > 0 ? failures / known : null;

  // 从证据序列判断【是否已修复】：最后一次失败之后，是否还有足够多次成功
  const ev = (e.evidence || []).filter((x) => x.observed === 'fail' || x.observed === 'ok');
  let lastFail = -1;
  for (let k = 0; k < ev.length; k++) if (ev[k].observed === 'fail') lastFail = k;
  const okAfterLastFail = lastFail >= 0 ? ev.slice(lastFail + 1).filter((x) => x.observed === 'ok').length : 0;
  const failuresBefore = lastFail >= 0 ? ev.slice(0, lastFail + 1).filter((x) => x.observed === 'fail').length : 0;
  const repaired = lastFail >= 0 && okAfterLastFail >= 3 && failuresBefore >= 1;

  let verdict, note;
  if (known < 3) { verdict = '待定'; note = '有效试验仅 ' + known + ' 次（< 3），不足以确认为错误'; }
  else if (repaired) { verdict = '已修复'; note = '曾复现 ' + failuresBefore + ' 次，之后连续 ' + okAfterLastFail + ' 次未复现 —— 修复有效；保留记录以防回归'; }
  else if (rate === 1) { verdict = '正判'; note = known + ' 次全部复现失败 —— 错误已确认，必须规避'; }
  else if (rate === 0) { verdict = '非错误'; note = known + ' 次均未复现，且从无失败记录 —— 原判断可能有误，应移出错误库'; }
  else { verdict = '模棱两可错误'; note = known + ' 次中失败 ' + failures + ' 次（' + Math.round(rate * 100) + '%），且失败与成功交替 —— 条件性失败，须找出触发条件'; }
  return { trials, known, failures, ok, unknown, rate: rate == null ? null : +rate.toFixed(3), verdict, verdict_note: note };
}

/**
 * 经验评分：按「被收录方的类别与权重」加权
 *
 * score = 10 × Σ(权重 × 成功) / Σ(权重 × 有效试验)
 *   —— 即「加权成功率 × 10」
 * 再乘一个「覆盖广度因子」：跨类别数越多，经验越普适
 *
 * @param {object} e 经验记录，含 evidence: [{ target, target_type, observed }]
 */
export function scoreExperience(e) {
  const ev = (e.evidence || []).filter((x) => x.observed === 'success' || x.observed === 'fail');
  if (!ev.length) return { score: null, weighted_rate: null, breadth: 0, categories: 0, note: '无有效证据，无法评分' };

  let num = 0, den = 0;
  const cats = new Set();
  for (const x of ev) {
    const type = x.target_type || inferSourceType(x.target);
    const w = SOURCE_WEIGHTS[type] ?? 0.5;
    cats.add(type);
    den += w;
    if (x.observed === 'success') num += w;
  }
  const weighted = den > 0 ? num / den : null;
  const breadth = Math.min(1, cats.size / 4);           // 跨 4 个及以上类别 = 满分广度
  const score = weighted == null ? null : +(weighted * 10 * (0.7 + 0.3 * breadth)).toFixed(2);
  return {
    score,
    weighted_rate: weighted == null ? null : +weighted.toFixed(3),
    breadth: +breadth.toFixed(2),
    categories: cats.size,
    category_list: [...cats],
    note: '加权成功率 ' + (weighted * 100).toFixed(0) + '% × 广度因子 ' + (0.7 + 0.3 * breadth).toFixed(2),
  };
}

/* ══════════════════════════════════════════════════════════════════
 * 库读写
 * ══════════════════════════════════════════════════════════════════ */
export function load(name) {
  const p = join(STORE, name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
export function save(name, data) {
  data.updated = new Date().toISOString();
  const json = JSON.stringify(data, null, 2);
  writeFileSync(join(STORE, name), json, 'utf8');
  // 可选镜像：沙箱可能禁止写 DSH_HOME，失败不影响主库
  try { mkdirSync(OPTIONAL_MIRROR, { recursive: true }); writeFileSync(join(OPTIONAL_MIRROR, name), json, 'utf8'); mirrorOk = true; }
  catch { mirrorOk = false; }
  return join(STORE, name);
}
export let mirrorOk = null;   // 上次镜像是否成功（null = 未尝试）

/** 记录一次经验试验 */
export function recordExperience({ id, claim, category, action, target, target_type, observed, expected, condition }) {
  const lib = load(FILES.JY) || {
    lib: 'JY0001.1', name: '经验库', created: new Date().toISOString(),
    rule: '屡试屡好=正判；有时好有时坏=模棱两可经验；有效试验<3=待定；测不到=UNKNOWN不计入分母',
    experience: [],
  };
  let e = id ? lib.experience.find((x) => x.id === id) : null;
  if (!e) {
    const n = lib.experience.length + 1;
    e = { id: 'JY-' + String(n).padStart(4, '0'), claim, category, action, condition: condition || null, evidence: [], trials: 0, successes: 0, unknowns: 0, created: new Date().toISOString() };
    lib.experience.push(e);
  }
  e.trials += 1;
  if (observed === 'success') e.successes += 1;
  if (observed === 'unknown') e.unknowns += 1;
  e.evidence.push({ target, target_type: target_type || inferSourceType(target), observed, expected: expected || null, at: new Date().toISOString() });
  const j = judgeExperience(e);
  const s = scoreExperience(e);
  e.verdict = j.verdict; e.verdict_note = j.verdict_note;
  e.success_rate = j.rate; e.score = s.score; e.score_note = s.note; e.categories = s.category_list || [];
  e.last_verified = new Date().toISOString();
  save(FILES.JY, lib);
  return { experience: e, judgement: j, scoring: s };
}

/** 记录一次错误试验 */
export function recordError({ id, claim, category, action, target, target_type, observed, why, fix }) {
  const lib = load(FILES.CW) || {
    lib: 'CW0001.1', name: '错误库', created: new Date().toISOString(),
    rule: '屡次测试都失败=正判；有时坏有时不坏=模棱两可错误；有效试验<3=待定；测不到=UNKNOWN不计入分母',
    error: [],
  };
  let e = id ? lib.error.find((x) => x.id === id) : null;
  if (!e) {
    const n = lib.error.length + 1;
    e = { id: 'CW-' + String(n).padStart(4, '0'), claim, category, action, why: why || null, fix: fix || null, evidence: [], trials: 0, failures: 0, unknowns: 0, created: new Date().toISOString() };
    lib.error.push(e);
  }
  e.trials += 1;
  if (observed === 'fail') e.failures += 1;
  if (observed === 'unknown') e.unknowns += 1;
  e.evidence.push({ target, target_type: target_type || inferSourceType(target), observed, at: new Date().toISOString() });
  const j = judgeError(e);
  e.verdict = j.verdict; e.verdict_note = j.verdict_note;
  e.failure_rate = j.rate; e.last_verified = new Date().toISOString();
  save(FILES.CW, lib);
  return { error: e, judgement: j };
}

/* ══════════════════════════════════════════════════════════════════
 * 统计与自检（防误判）
 * ══════════════════════════════════════════════════════════════════ */
export function stats() {
  const jy = load(FILES.JY) || { experience: [] };
  const cw = load(FILES.CW) || { error: [] };
  const byVerdict = (arr, key) => {
    const o = {};
    for (const x of arr) { const v = x.verdict || '待定'; o[v] = (o[v] || 0) + 1; }
    return o;
  };
  const scored = jy.experience.filter((x) => x.score != null).sort((a, b) => b.score - a.score);
  return {
    experience: {
      total: jy.experience.length,
      by_verdict: byVerdict(jy.experience),
      top: scored.slice(0, 10).map((x) => ({ id: x.id, claim: x.claim, score: x.score, verdict: x.verdict })),
      worst: scored.slice(-5).reverse().map((x) => ({ id: x.id, claim: x.claim, score: x.score, verdict: x.verdict })),
    },
    error: {
      total: cw.error.length,
      by_verdict: byVerdict(cw.error),
      confirmed: cw.error.filter((x) => x.verdict === '正判').map((x) => ({ id: x.id, claim: x.claim, fix: x.fix })),
    },
  };
}

/** 采样不足 / 未验证 的记录清单（防止误判） */
export function audit() {
  const jy = load(FILES.JY) || { experience: [] };
  const cw = load(FILES.CW) || { error: [] };
  const issues = [];
  for (const x of jy.experience) {
    const k = (x.trials || 0) - (x.unknowns || 0);
    if (k < 3) issues.push({ lib: 'JY', id: x.id, issue: '有效试验 ' + k + ' < 3，判定不可靠', claim: x.claim });
    if ((x.evidence || []).some((y) => !y.at)) issues.push({ lib: 'JY', id: x.id, issue: '证据缺时间戳', claim: x.claim });
  }
  for (const x of cw.error) {
    const k = (x.trials || 0) - (x.unknowns || 0);
    if (k < 3) issues.push({ lib: 'CW', id: x.id, issue: '有效试验 ' + k + ' < 3，判定不可靠', claim: x.claim });
  }
  return issues;
}

/* ══════════════════════════════════════════════════════════════════
 * CLI
 * ══════════════════════════════════════════════════════════════════ */
export function runCli() {
  if (process.argv[1] && process.argv[1].endsWith('libraries.mjs')) {
    const cmd = process.argv[2] || '--stats';
    if (cmd === '--stats') {
      const s = stats();
      console.log('\n' + '═'.repeat(90));
      console.log('  经验库 JY0001.1 / 错误库 CW0001.1');
      console.log('═'.repeat(90));
      console.log('\n  ── 经验库（' + s.experience.total + ' 条）──');
      console.log('    判定分布: ' + JSON.stringify(s.experience.by_verdict));
      if (s.experience.top.length) {
        console.log('\n    评分最高的经验：');
        for (const x of s.experience.top) console.log('      ' + String(x.score).padStart(5) + '  ' + x.verdict.padEnd(12) + '  ' + x.claim.slice(0, 60));
      }
      if (s.experience.worst.length) {
        console.log('\n    评分最低的经验（需复核）：');
        for (const x of s.experience.worst) console.log('      ' + String(x.score).padStart(5) + '  ' + x.verdict.padEnd(12) + '  ' + x.claim.slice(0, 60));
      }
      console.log('\n  ── 错误库（' + s.error.total + ' 条）──');
      console.log('    判定分布: ' + JSON.stringify(s.error.by_verdict));
      if (s.error.confirmed.length) {
        console.log('\n    已确认的错误（正判，必须规避）：');
        for (const x of s.error.confirmed) console.log('      ' + x.id + '  ' + x.claim.slice(0, 56) + (x.fix ? '\n            修法: ' + x.fix.slice(0, 70) : ''));
      }
      const a = audit();
      console.log('\n  ── 防误判自检 ──');
      if (!a.length) console.log('    ✅ 无问题（所有已判定记录的样本量均 ≥ 3）');
      else { console.log('    ⚠️ ' + a.length + ' 条需注意：'); a.slice(0, 10).forEach((x) => console.log('      [' + x.lib + '] ' + x.id + ' ' + x.issue)); }
      console.log('\n  存放: ' + STORE + '\n');
    } else if (cmd === '--audit') {
      const a = audit();
      console.log('\n  防误判自检: ' + (a.length ? a.length + ' 条问题' : '✅ 通过') + '\n');
      a.forEach((x) => console.log('  [' + x.lib + '] ' + x.id + ' — ' + x.issue + '  «' + String(x.claim).slice(0, 50) + '»'));
      console.log('');
    } else {
      console.log('用法: node tools/libraries.mjs [--stats|--audit]');
    }
  }

}


/* 仅当【直接运行】本文件时才执行 CLI —— 模块必须可被安全导入（教训 L-32） */
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) runCli();
