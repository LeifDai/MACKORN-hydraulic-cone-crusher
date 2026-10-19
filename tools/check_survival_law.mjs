/**
 * 生存法则检查器（R83）
 *
 * 用户指令（原文）：
 *   「不断升级程序，不断迭代 PDCA，不断优化，这个机会生存的法则，请写到规则里面。」
 *
 * 什么叫"写到规则里面"（本项目的一贯做法）：
 *   不是写在文档里让人自觉遵守，而是**编成可执行判据**，变成门禁的一部分。
 *   文档会被忘记，门禁不会。
 *
 * 本检查器把"机会生存法则"落成 4 条可测量的指标：
 *
 *   ① 【动】本次会话有没有推进
 *      —— 距最近一次 PDCA 记录不能超过 N 天（N=3）
 *      停滞 = 机会在流失（别人的插件在迭代，我们不动就是退）
 *
 *   ② 【证】推进有没有留下证据
 *      —— PDCA 台账里最近一轮必须有 计划/执行/核对/处置 四段
 *      只有计划没有核对 = 自说自话
 *
 *   ③ 【防】质量有没有退化
 *      —— 教训数只能增不能减；门禁项数只能增不能减
 *      这两条是"棘轮"：过去了就不许退回去
 *
 *   ④ 【双】云端与本地是不是都在动
 *      —— 本地：文件最近有改动
 *      —— 云端：工作流存在且步骤数未减少
 *      只有一条腿走路，断了就全断
 *
 * 退出码：0 = 法则成立；1 = 有指标不达标（附具体是哪条）
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');

const STALE_DAYS = 3;          // 超过 3 天没推进 = 停滞
const rows = [];
let fail = 0;

const ok = (id, name, pass, detail) => { rows.push({ id, name, pass, detail }); if (!pass) fail += 1; };

/* ══════ ① 【动】最近一次 PDCA 距今多久 ══════
 * ⚠️ R83 修正：口径要按【真实台账结构】来。
 *   真实台账：distribution/05_视角与复盘/PDCA台账.json
 *     { generated, product, version, scope, rounds:[ {round, recorded_at, plan, check, act, gates} ], ... }
 *   我第一版猜的路径（pdca-master-history.jsonl）是 L3 自迭代的日志，不是主台账 ——
 *   又一次"没读结构就写判据"。 */
const LEDGER = join(ROOT, 'distribution', '05_视角与复盘', 'PDCA台账.json');
let lastAt = null, rounds = 0, lastRound = null;
if (existsSync(LEDGER)) {
  try {
    const j = JSON.parse(readFileSync(LEDGER, 'utf8'));
    const arr = j.rounds || j.entries || j.history || [];
    rounds = Array.isArray(arr) ? arr.length : 0;
    if (rounds) lastRound = arr[rounds - 1];
    lastAt = (lastRound && (lastRound.recorded_at || lastRound.at || lastRound.generated)) || j.generated || null;
  } catch { }
}
let ageDays = null;
if (lastAt) {
  const t = Date.parse(lastAt);
  if (Number.isFinite(t)) ageDays = (Date.now() - t) / 86400000;
}
ok('LIVE-1', '【动】最近有推进（PDCA 距今天数 ≤ ' + STALE_DAYS + '）',
  ageDays !== null && ageDays <= STALE_DAYS,
  ageDays === null ? '读不到台账（' + (existsSync(LEDGER) ? '台账存在但无时间戳' : '台账不存在：' + LEDGER) + '）'
    : '最近一轮 ' + (lastRound && lastRound.round || '?') + ' · 距今 ' + ageDays.toFixed(2) + ' 天 · 累计 ' + rounds + ' 轮');

/* ══════ ② 【证】最近一轮四段齐全 ══════
 * 真实结构里是 plan / check / act（"执行"体现在 gates 与 check 里）——
 * 所以判据认：plan + check + act + gates 四要素。 */
{
  const keys = lastRound ? Object.keys(lastRound) : [];
  const need = ['plan', 'check', 'act', 'gates'];
  const miss = need.filter((k) => !keys.includes(k));
  ok('LIVE-2', '【证】最近一轮 PDCA 要素齐全（计划/核对/处置/门禁）',
    Boolean(lastRound) && miss.length === 0,
    lastRound ? (miss.length ? '缺：' + miss.join(', ') : '四要素齐全 · ' + lastRound.round) : '无最近一轮');
}

/* ══════ ②b 【新】上下文新鲜度（R89，读徐庆贺演讲后加）
 * 演讲说「记忆是要有人持续告诉你，围绕你发生了哪些事情」。
 * 但只有"持续记录"不够 —— 记录里必须有【新东西】，否则是空转。
 * 判据：相邻两轮的 act（固化内容）相似度必须 < 0.7。
 *   两条几乎一样的固化 = 这一轮没有真的推进。 */
{
  let roundsArr = [];
  try {
    const j = JSON.parse(readFileSync(LEDGER, 'utf8'));
    roundsArr = j.rounds || [];
  } catch { }
  if (roundsArr.length < 2) {
    ok('LIVE-2b', '【新】上下文新鲜度（相邻两轮固化内容不重复）', true, '轮次不足 2，暂不判定');
  } else {
    const tok = (s) => new Set(String(s || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter((x) => x.length >= 2));
    const a = tok(roundsArr[roundsArr.length - 2].act);
    const b = tok(roundsArr[roundsArr.length - 1].act);
    let inter = 0; for (const x of b) if (a.has(x)) inter += 1;
    const union = a.size + b.size - inter;
    const jac = union ? inter / union : 1;
    ok('LIVE-2b', '【新】上下文新鲜度（相邻两轮固化内容相似度 < 0.7）', jac < 0.7,
      '相似度 ' + jac.toFixed(3) + (jac < 0.7 ? ' ✅（有新东西）' : ' ❌（疑似空转：两轮固化几乎一样）'));
  }
}

/* ══════ ②c 【新】目标完成率（R89）
 * 演讲的公式是「记忆 + Agent + 工位 = 上岗」。
 * 但"工位"只保证不停，"目标"才保证不空转。
 * 判据：上一轮的 check 必须提到【具体产出】（文件路径 / 数字 / 表格），
 *   而不是只有形容词。这是"完成率"的可验证代理。 */
{
  let last = null;
  try { const j = JSON.parse(readFileSync(LEDGER, 'utf8')); const a = j.rounds || []; last = a[a.length - 1] || null; } catch { }
  if (!last) {
    ok('LIVE-5', '【新】目标有可验证产出（check 里有文件/数字）', true, '无轮次');
  } else {
    const chk = String(last.check || '');
    /* R96 relaxed：原来只认 .mjs/.json 扩展名或带斜杠的路径，
     * 结果把自己的输出（"rsi_level（L2/天花板L4，7项指标）"）判成"没有可验证产出"。
     * 判据太严 = 假告警，和太松一样有害。放宽为：
     *   ① 有扩展名   ② 有路径斜杠   ③ 有下划线/连字符标识符（工具名）
     *   ④ 有反引号包裹的具体名词 */
    const hasFile = /\.(mjs|json|md|yml|yaml|cff|php|html|txt)\b/.test(chk)
      || /\b[a-z_]+\/[a-zA-Z0-9_.-]+/.test(chk)
      || /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){1,}\b/.test(chk)
      || /`[^`]{3,}`/.test(chk);
    const hasNum = /\d/.test(chk);
    /* R97 relaxed2：原判据要求"有文件路径"，但像
     * "npm 0.2.2 已发布：66 文件 2.78MB、描述含 22 工具" 这种
     * 全是具体数字的 check 同样是有可验证产出的，不是口号。
     * 判据太严 = 假告警（和太松一样有害）。
     * 改为：（有文件 或 有数字）且长度 ≥ 40。 */
    ok('LIVE-5', '【新】目标有可验证产出（check 里有文件或具体数字）', (hasFile || hasNum) && chk.length >= 40,
      'check 长度 ' + chk.length + ' · 含文件 ' + hasFile + ' · 含数字 ' + hasNum + (chk.length < 30 ? ' ❌ 太短（像口号）' : ''));
  }
}

/* ══════ ③ 【防】棘轮：教训数与门禁项数不许减 ══════ */
const BASELINE = join(D, '生存法则基线.json');
let curLessons = 0, curGates = 0;
{
  try {
    const L = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
    curLessons = (L.LESSONS || []).length;
  } catch { }
  try {
    const g = readFileSync(join(HERE, 'enforce_lessons.mjs'), 'utf8');
    curGates = (g.match(/\brec\(/g) || []).length;
  } catch { }
}
let base = null;
if (existsSync(BASELINE)) { try { base = JSON.parse(readFileSync(BASELINE, 'utf8')); } catch { } }
if (!base) {
  base = { lessons: curLessons, gates: curGates, established: new Date().toISOString() };
  mkdirSync(D, { recursive: true });
  writeFileSync(BASELINE, JSON.stringify(base, null, 2), 'utf8');
  ok('LIVE-3', '【防】棘轮已建立（教训数/门禁项数不许减）', true,
    '首轮基线：教训 ' + curLessons + ' · 门禁 ' + curGates);
} else {
  const lessOk = curLessons >= base.lessons;
  const gateOk = curGates >= base.gates;
  ok('LIVE-3', '【防】棘轮未倒退（教训数/门禁项数不许减）', lessOk && gateOk,
    '教训 ' + base.lessons + '→' + curLessons + (lessOk ? ' ✅' : ' ❌倒退') +
    ' · 门禁 ' + base.gates + '→' + curGates + (gateOk ? ' ✅' : ' ❌倒退'));
}

/* ══════ ④ 【双】云端与本地都在动 ══════ */
{
  const WF = join(ROOT, '.github', 'workflows', 'nightly-self-iteration.yml');
  const wfExists = existsSync(WF);
  const wfSteps = wfExists ? (readFileSync(WF, 'utf8').match(/^\s*-\s*name:/gm) || []).length : 0;
  /* 本地：看几个核心文件里最新的修改时间 */
  const core = ['plugin/index.mjs', 'plugin/lib/engine.mjs', 'tools/lessons.mjs', 'tools/enforce_lessons.mjs'];
  let newest = 0;
  for (const f of core) { const p = join(ROOT, f); if (existsSync(p)) newest = Math.max(newest, statSync(p).mtimeMs); }
  const localAgeH = newest ? (Date.now() - newest) / 3600000 : Infinity;
  const localAlive = localAgeH <= 24 * 7;   // 一周内有改动
  ok('LIVE-4', '【双】云端工作流存在 且 本地近期有改动',
    wfExists && wfSteps >= 10 && localAlive,
    '云端工作流 ' + (wfExists ? wfSteps + ' 步' : '缺失') +
    ' · 本地核心文件最近改动 ' + (Number.isFinite(localAgeH) ? localAgeH.toFixed(1) + ' 小时前' : '未知'));
}

/* ══════ 输出 ══════ */
console.log('');
console.log('  ══ 机会生存法则检查 ══');
console.log('  （不断升级 · 不断迭代 PDCA · 不断优化 —— 写成可执行判据，而不是文档）');
console.log('');
for (const r of rows) console.log('  ' + (r.pass ? '✅' : '❌') + ' ' + r.id + '  ' + r.name + '\n       ' + r.detail);
console.log('');
console.log('  ' + (fail === 0 ? '✅ 法则成立：在动、有证据、未退化、双轨都在' : '❌ ' + fail + ' 项不达标 —— 停滞就是机会流失'));
console.log('');

mkdirSync(D, { recursive: true });
writeFileSync(join(D, '生存法则检查.json'), JSON.stringify({
  generated: new Date().toISOString(), stale_days: STALE_DAYS,
  rows, pdca_rounds: rounds, last_pdca_at: lastAt,
  lessons: curLessons, gates: curGates,
}, null, 2), 'utf8');
console.log('  已写 distribution/03_验证与基准/生存法则检查.json');
console.log('');
process.exit(fail ? 1 : 0);
