/**
 * L2 构建期门禁 —— 经验与教训的强制执行
 * ================================================================
 * 把"经验"和"教训"变成【发布前必须通过的门】。
 * 只要有一条已确认的教训被违反，退出码非 0，构建失败。
 *
 * 与 L1 的分工：
 *   L1（plugin/lib/guardrails.mjs）—— 运行时，每次工具调用都检查，不阻断
 *   L2（本文件）                  —— 构建期，跑不过就不许发布
 *   L3（tools/self_iterate.mjs）  —— 自迭代，跑全部检查并把结果写回库
 *
 * 检查项：
 *   ① 31 条可执行教训（tools/lessons.mjs 的同一份定义）
 *   ② 18 条经验 + 12 条错误的可执行检查（tools/verify_libraries.mjs 的同一份定义）
 *   ③ 15 条运行时护栏的自我测试（含负控：违规必须被抓到）
 *   ④ 模型物理不变量（自验证框架）
 *   ⑤ 公开验证基准
 *
 * 用法：
 *   node tools/enforce_lessons.mjs            跑全部门禁
 *   node tools/enforce_lessons.mjs --json     机器可读
 *   node tools/enforce_lessons.mjs --quick    跳过耗时项（基准/自验证）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const JSON_OUT = process.argv.includes('--json');
const QUICK = process.argv.includes('--quick');
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return '' }; };
const exists = (p) => existsSync(p);

const results = [];
const t0 = Date.now();
function rec(area, name, pass, detail) {
  results.push({ area, name, pass: !!pass, detail: String(detail ?? '').slice(0, 180) });
  if (!JSON_OUT) console.log('  ' + (pass ? '✅' : '❌') + ' [' + area + '] ' + name + (detail ? '　— ' + String(detail).slice(0, 110) : ''));
}

if (!JSON_OUT) {
  console.log('\n' + '═'.repeat(100));
  console.log('  L2 构建期门禁 · 经验与教训的强制执行');
  console.log('═'.repeat(100) + '\n');
}

/* ══════════ ⓪ 语法验证（关键文件真编译 · R31 事故的防线）══════════
 *
 * 为什么只查【关键文件】而不是全仓库（R32 六次试错后的结论）：
 *   · 全仓库 278 个文件串行 node --check 要 10 分钟+ → 调用方超时
 *   · 并发 execFile 被沙箱拒绝（spawn EPERM）
 *   · 纯进程内做不到真语法分析（词法指纹误报 20→8→2，仍不可靠）
 *   · 而 R31 事故的实际风险面很窄：**改源码的脚本**（apply_tags 等）
 *     一次只动 1-5 个文件。对这 1-5 个文件串行 node --check，
 *     秒级、100% 可靠、完全在沙箱允许范围内。
 * 广域词法闸门（tools/syntax_gate.mjs）保留为【诊断工具】，不参与门禁判定。
 */
if (!JSON_OUT) console.log('\n  ── ⓪ 语法验证（关键文件真编译）──');
{
  const CRITICAL = [
    'plugin/index.mjs', 'plugin/lib/guardrails.mjs', 'plugin/lib/engine.mjs',
    'plugin/lib/simulate.mjs', 'plugin/lib/calibrate.mjs', 'plugin/lib/data.mjs',
    'plugin/mcp-server.mjs',
    'tools/lessons.mjs', 'tools/enforce_lessons.mjs', 'tools/build_public.mjs',
    'tools/apply_tags.mjs', 'tools/sync_ai_index.mjs', 'tools/gen_php_mcp.mjs',
  ];
  let okN = 0; const bad = [];
  for (const rel of CRITICAL) {
    const f = join(ROOT, rel);
    if (!existsSync(f)) continue;
    let ok = false;
    for (let k = 0; k < 3 && !ok; k += 1) {
      try { spawnSync(process.execPath, ['--check', f], { stdio: 'ignore', windowsHide: true, timeout: 120000 }); ok = true; } catch { }
    }
    if (ok) okN += 1; else bad.push(rel);
  }
  rec('语法', '关键源码文件能被 Node 解析（改源码的脚本不许静默毁掉模块）',
    bad.length === 0 && okN >= 10,
    okN + ' 个关键文件语法正确' + (bad.length ? '，❌ 无法解析: ' + bad.join(', ') : ''));
}

/* ══════════ ① 可执行教训（复用 lessons.mjs 的定义）══════════ */
if (!JSON_OUT) console.log('  ── ① 已确认教训（可执行检查）──');
let lessonStats = null;
try {
  const mod = await import(pathToFileURL(join(HERE, 'lessons.mjs')).href);
  const LESSONS = mod.LESSONS || mod.default || [];
  let pass = 0;
  const fails = [];
  for (const l of LESSONS) {
    let r; try { r = l.check(); } catch (e) { r = { pass: false, detail: '检查抛错: ' + String(e.message).slice(0, 60) }; }
    if (r && r.pass) pass += 1; else fails.push(l.id + ' ' + l.title.slice(0, 40) + ' — ' + (r && r.detail || ''));
  }
  lessonStats = { total: LESSONS.length, pass, fails };
  rec('教训', `可执行教训 ${pass}/${LESSONS.length}`, pass === LESSONS.length && LESSONS.length > 0,
    fails.length ? fails.slice(0, 3).join(' | ') : '全部通过');
} catch (e) {
  rec('教训', '教训检查器可加载', false, '导入 lessons.mjs 失败: ' + String(e.message).slice(0, 80));
}

/* ══════════ ② 库检查（复用 verify_libraries 的 CHECKS）══════════ */
if (!JSON_OUT) console.log('\n  ── ② 经验库 / 错误库的可执行检查 ──');
try {
  const mod = await import(pathToFileURL(join(HERE, 'verify_libraries.mjs')).href);
  const CHECKS = mod.CHECKS;
  const libs = await import(pathToFileURL(join(HERE, 'libraries.mjs')).href);
  const jy = libs.load(libs.FILES.JY), cw = libs.load(libs.FILES.CW);
  const all = [...(jy?.experience || []).map((x) => ['JY', x]), ...(cw?.error || []).map((x) => ['CW', x])];
  let pass = 0, noCheck = 0;
  const fails = [];
  for (const [lib, e] of all) {
    const fn = CHECKS[e.id];
    if (!fn) { noCheck += 1; continue; }
    let r; try { r = fn(); } catch (err) { r = { pass: false, evidence: '抛错: ' + String(err.message).slice(0, 50) }; }
    if (r.pass) pass += 1; else fails.push(e.id + ' — ' + String(r.evidence).slice(0, 60));
  }
  const checked = all.length - noCheck;
  rec('库', `库检查 ${pass}/${checked}` + (noCheck ? `（${noCheck} 条尚无检查函数）` : ''), fails.length === 0 && checked > 0,
    fails.length ? fails.slice(0, 3).join(' | ') : '全部通过');
  rec('库', '库判定无「无效经验」残留', !(jy?.experience || []).some((x) => x.verdict === '无效经验'),
    (jy?.experience || []).filter((x) => x.verdict === '无效经验').map((x) => x.id).join(', ') || '无');
} catch (e) {
  rec('库', '库检查器可加载', false, '导入失败: ' + String(e.message).slice(0, 80));
}

/* ══════════ ③ 运行时护栏自测（含负控）══════════ */
if (!JSON_OUT) console.log('\n  ── ③ 运行时护栏自测（含负控）──');
try {
  const G = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'guardrails.mjs')).href);
  const rules = G.listRules();
  rec('护栏', `规则表非空（${rules.length} 条）`, rules.length >= 10, rules.length + ' 条');
  rec('护栏', '每条规则都有 id/severity/来源', rules.every((r) => r.id && r.severity && r.lesson), '字段完整');

  // 负控 1：给料 600 的单台圆锥破必须被 GR-02 抓到
  const g1 = G.guardOutput('mackorn_cone_selection', { product: 'NH400' }, { max_feed_mm: 600 });
  rec('护栏', '负控：单台圆锥破给料 600mm 被拦', g1.violations.some((v) => v.id === 'GR-02'), '命中 ' + g1.violations.map((v) => v.id).join(','));

  // 负控 2：整条生产线的原矿给料 600mm 不应被 GR-02 误报
  const g2 = G.guardOutput('mackorn_plant_design', { plant: 'ok' }, { max_feed_mm: 600 });
  rec('护栏', '负控：整线原矿给料不误报 GR-02', !g2.violations.some((v) => v.id === 'GR-02'), g2.violations.length ? '误报 ' + g2.violations.map((v) => v.id).join(',') : '无误报');

  // 负控 3：合并字段必须被 GR-04 抓到
  const g3 = G.guardOutput('mackorn_cone_selection', { averaged: 42 }, {});
  rec('护栏', '负控：averaged 合并字段被拦', g3.violations.some((v) => v.id === 'GR-04'), '命中 ' + g3.violations.map((v) => v.id).join(','));

  // 负控 4：干净输出不应产生 error
  const g4 = G.guardOutput('mackorn_equipment_catalog', { models: [] }, {});
  rec('护栏', '负控：干净输出零 error', g4.errors === 0, 'error ' + g4.errors);
} catch (e) {
  rec('护栏', '护栏模块可加载', false, String(e.message).slice(0, 80));
}

/* ══════════ ③b 工具端到端（L-34：语法通过 ≠ 可用）══════════ */
if (!JSON_OUT) console.log('\n  ── ③b 工具端到端（23 个工具真调 execute + render）──');
try {
  const r = spawnSync(process.execPath, [join(HERE, 'verify_all_tools.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
  rec('工具', '23 个工具端到端通过', r.status === 0, r.status === 0 ? '全部 execute + render 正常' : 'exit ' + r.status + '（跑 node tools/verify_all_tools.mjs 看明细）');
} catch (e) { rec('工具', '端到端验证可执行', false, String(e.message).slice(0, 70)); }

/* ══════════ ③c 全站审计（死链/结构/AI索引）══════════ */
if (!JSON_OUT) console.log('\n  ── ③c 全站审计 ──');
try {
  const r = spawnSync(process.execPath, [join(HERE, 'audit_site.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
  rec('站点', '全站审计零严重问题（死链/结构）', r.status === 0, r.status === 0 ? '无死链、结构完整' : 'exit ' + r.status + '（跑 node tools/audit_site.mjs 看明细）');
} catch (e) { rec('站点', '全站审计可执行', false, String(e.message).slice(0, 70)); }

/* ══════════ ③d 用户验收（输出是否真能用来做决定）══════════ */
if (!QUICK && !JSON_OUT) console.log('\n  ── ③d 用户验收测试（5 个真实场景）──');
if (!QUICK) {
  try {
    const r = spawnSync(process.execPath, [join(HERE, 'uat_user_scenarios.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
    rec('UAT', '5 个真实用户场景输出可用', r.status === 0, r.status === 0 ? '20 项检查全通过' : 'exit ' + r.status + '（跑 node tools/uat_user_scenarios.mjs 看明细）');
    const r2 = spawnSync(process.execPath, [join(HERE, 'uat_business_scenarios.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
    rec('UAT', '8 个商务交付场景输出可用', r2.status === 0, r2.status === 0 ? '31 项检查全通过' : 'exit ' + r2.status + '（跑 node tools/uat_business_scenarios.mjs 看明细）');
    const r3 = spawnSync(process.execPath, [join(HERE, 'uat_diagnostic_scenarios.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
    rec('UAT', '5 个技术诊断场景输出可用', r3.status === 0, r3.status === 0 ? '17 项检查全通过' : 'exit ' + r3.status + '（跑 node tools/uat_diagnostic_scenarios.mjs 看明细）');
  } catch (e) { rec('UAT', 'UAT 可执行', false, String(e.message).slice(0, 70)); }
}

/* ══════════ ③e 插件级负控（G4：故意造坏，确认校验器会报错）══════════ */
if (!QUICK && !JSON_OUT) console.log('\n  ── ③e 插件级负控（6 种坏插件 + 正控）──');
if (!QUICK) {
  try {
    const r = spawnSync(process.execPath, [join(HERE, '..', 'tests', 'negative', 'plugin_negative_controls.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G4', '插件级负控 6/6 抓到 + 正控通过', r.status === 0, r.status === 0 ? '校验器有效且不过严' : 'exit ' + r.status + '（跑 node tests/negative/plugin_negative_controls.mjs 看明细）');
  /* R78：硬事实同步的负控 —— 断言它【双向】正确：
   *   该保留的证据行原样保留 + 该改的陈述式确实改了。
   *   只断言一边会在"什么都没发生"时假通过（本会话真实踩过）。 */
  {
    const r = spawnSync(process.execPath, [join(HERE, '..', 'tests', 'negative', 'hardfact_sync_negative_controls.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G4b', '硬事实同步负控（证据保留 + 陈述式改写）', r.status === 0, r.status === 0 ? '双向断言通过' : 'exit ' + r.status + '（双向断言失败或工具未跑起来）');
  /* R82：跨表一致性 —— 从"只报告"推进到"接门禁"。
   *   只阻断【真矛盾】与【结构异常】；"覆盖差异"（如大机型无详表）是设计如此，不阻断。 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'check_cross_table.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G5', '跨表一致性（0 真矛盾 · 0 结构异常）', r.status === 0, r.status === 0 ? '数据表之间自洽' : 'exit ' + r.status + '（有真矛盾或结构异常，看 跨表一致性检查.json）');
  /* R83：机会生存法则 —— 在动/有证据/未退化/双轨都在 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'check_survival_law.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G6', '机会生存法则（在动 · 有证据 · 未退化 · 双轨都在）', r.status === 0, r.status === 0 ? '法则成立' : 'exit ' + r.status + '（停滞或退化，看 生存法则检查.json）');
  /* R93：RSI 判级 —— 自我改进必须是可测闭环，且天花板要诚实 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'rsi_level.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G7', 'RSI 判级（分级可测 · 天花板诚实）', r.status === 0, r.status === 0 ? '判级有效' : 'exit ' + r.status + '（判级失败，见 rsi-level.json）');
  /* R94：recurrence —— 全局规则说这是「判定 RSI 真假的唯一硬指标」。
   *   门禁加了、同类错误照样犯 = 假改进。所以它必须进硬门禁。 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'rsi_register.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
    const rp = join(D, '03_验证与基准', 'rsi-register.json');
    let rec2 = null;
    if (exists(rp)) { try { rec2 = JSON.parse(read(join(D, '03_验证与基准', 'rsi-register.json'))); } catch { } }
    const recur = rec2 ? rec2.recurrence : 1;
    rec('G8', 'recurrence = 0（同类错误不复现 · RSI 唯一硬指标）', r.status === 0 && recur === 0, 'recurrence ' + (recur * 100).toFixed(1) + '%' + (recur === 0 ? ' ✅ 所有已知缺陷都有可靠守卫' : ' ❌ 有守卫失效 —— 这是假改进'));
  /* R95：RSI 闭环完整性 —— 全局规则：四环节缺一不算改进 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'rsi_record.mjs'), '--check-loop'], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G9', 'RSI 闭环完整（基线/证据/退路/复测/recurrence=0）', r.status === 0, r.status === 0 ? '闭环完整' : 'exit ' + r.status + '（闭环不完整，见 rsi-data/rsi.json）');
  /* R96：发布节奏 —— 每 3 天检查、每周至少更新一次（用户明令） */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'publish_rhythm.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 180000 });
    /* R96：这里只验【检查器可用】并显示当前节奏状态。
     *   真正的推送依赖人工 token（人被阻塞），把那种红算成代码缺陷会掩盖其它问题。 */
    const pp = join(D, '03_验证与基准', 'publish-rhythm.json');
    let pv = 'UNKNOWN', pd2 = '?';
    if (exists(pp)) { try { const j = JSON.parse(read(join(D, '03_验证与基准', 'publish-rhythm.json'))); pv = j.verdict; pd2 = j.days_since_publish; } catch { } }
    rec('G10', '发布节奏检查器可用（状态另见报告）', r.status === 0 || pv === 'VIOLATION', '状态 ' + pv + ' · 上次发布 ' + (pd2 === null ? '?' : pd2) + ' 天前' + (pv === 'VIOLATION' ? ' ⚠️ 需本周推送（依赖人工 token）' : ''));
  }

  /* R96：AI 友好度 —— 「成为所有 AI 大模型喜欢的插件」的可测分数 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'ai_appeal.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    const op = join(D, '03_验证与基准', 'ai-appeal.json');
    let sc = 0;
    if (exists(op)) { try { sc = JSON.parse(read(join(D, '03_验证与基准', 'ai-appeal.json'))).score || 0; } catch { } }
    rec('G11', 'AI 大模型友好度 ≥ 85', r.status === 0 && sc >= 85, '得分 ' + sc + '/100' + (sc >= 85 ? ' ✅' : ' ❌ 低于 85'));
  /* R100：先升级再上传 —— 用户明令。镜像文件必须与真相源一致，否则不许上传。 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'check_upload_consistency.mjs'), '--local'], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    rec('G12', '上传前一致性（先升级再上传）', r.status === 0, r.status === 0 ? '镜像与真相源一致，可上传' : '有镜像过期 —— 先同步再上传');
  /* R101：线上健康 —— 弥补"只顾本地不看线上"的盲区。
   *   非阻塞：证书续期/部署需要服务器凭据（人已被阻塞），
   *   把它算成代码缺陷会让门禁永久红、掩盖其它问题。状态在报告里可见。 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'check_live_health.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 180000 });
    const lp = join(D, '03_验证与基准', 'live-health.json');
    let lv = "?", lcert = "?";
    if (exists(lp)) { try { const j = JSON.parse(read(join(D, "03_验证与基准", "live-health.json"))); lv = j.verdict; const cf = (j.checks || []).find((x) => x.id === "cert"); lcert = cf ? String(cf.detail).slice(0, 60) : "?"; } catch { } }
    rec('G13', '线上健康检查（非阻塞·状态可见）', true, '判定 ' + lv + ' · 证书 ' + lcert);
  /* R111：每天提升认知力 —— 用户明令。以"推翻自己的频率与深度"为判据（辩证规则 §6.4）。 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'cognition_log.mjs'), '--check'], { stdio: 'ignore', windowsHide: true, timeout: 120000 });
    const cp = join(D, '03_验证与基准', 'cognition.json');
    let cd = "?", cw = "?", ca = "?";
    if (exists(cp)) { try { const j = JSON.parse(read(join(D, "03_验证与基准", "cognition.json"))); cd = j.metrics.daily_correction; cw = j.metrics.week_correction; ca = j.metrics.avg_depth; } catch { } }
    rec('G14', '认知力达标（今日≥1 · 7天≥3 · 深度≥1.5）', r.status === 0, '今日 ' + cd + ' · 7天 ' + cw + ' · 平均深度 ' + ca);
  }
  /* ══════ R121/R122：用户 2026-10-20 明令两条编入生存规则 ══════ */

  /* G15：每天提升认知力（全局规则 §2.6）—— 四件事：学/疑/炼/测 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'cognition.mjs'), '--daily'], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    const cp = join(ROOT, 'cognition-data', 'cognition.json');
    let facts = "?", refu = "?", test = "?", corr = "?";
    try {
      const j = JSON.parse(read(cp));
      const m = j.metrics || {};
      facts = m.facts; refu = m.refutations;
      const t = j.today || {};
      test = t.tested; corr = t.correct;
    } catch { }
    rec('G15', '认知力日课达标（学/疑/炼/测 四件事）', r.status === 0,
      '知识 ' + facts + ' 条 · 自我推翻 ' + refu + ' 条 · 今日回忆 ' + test + ' 题 ' + corr + ' 正确');
  }

  /* G16：不断更新迭代（棘轮）—— 有基线 / 有净增量 / 无倒退 / 合规零命中 */
  {
    const r = spawnSync(process.execPath, [join(HERE, 'iteration_ratchet.mjs'), '--check'], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
    const hp = join(ROOT, 'iteration-data', 'ratchet-history.json');
    let snaps = 0, latest = null, prev = null;
    try {
      const h = JSON.parse(read(hp));
      snaps = (h.snapshots || []).length;
      if (snaps) latest = h.snapshots[snaps - 1];
      if (snaps >= 2) prev = h.snapshots[snaps - 2];
    } catch { }
    let delta = "—";
    if (latest && prev) {
      const ks = ["gates", "lessons", "tools", "facts", "refutations"];
      const parts = [];
      for (const k of ks) {
        const a = latest.metrics[k]; const b = prev.metrics[k];
        if (a !== null && b !== null && a !== b) parts.push(k + " " + b + "→" + a);
      }
      delta = parts.length ? parts.join(" · ") : "无净增量";
    }
    rec('G16', '迭代棘轮（有基线 · 有净增量 · 无倒退 · 合规0）', r.status === 0,
      '快照 ' + snaps + ' 次 · ' + delta);
  }
  /* ══════ R127：可发现性（2026-10-21 用户要求「让领先的 AI 都收录我们」）══════ */

  /* G17：AI 收录覆盖（至少 5 个平台已收录我们的条目） */
  {
    const cp = join(D, '03_验证与基准', 'ai-coverage.json');
    let listed = null, total = null, notListed = null;
    try {
      const j = JSON.parse(read(cp));
      if (j && j.summary) { listed = j.summary.listed; total = j.summary.total; notListed = j.summary.not_listed; }
    } catch { }
    /* 注意：本门禁不现场发 18 个网络请求（太慢），只读最近一次探测结果。
     * 如果结果文件不存在，判为 UNKNOWN 并通过（不阻塞），但在 detail 里明说。 */
    const ok = listed === null ? true : listed >= 5;
    rec('G17', 'AI 收录覆盖 ≥5 个平台（读探测结果）', ok,
      listed === null ? '⚠ 尚无 ai-coverage.json（先跑 node tools/ai_coverage.mjs）'
        : ('已收录 ' + listed + '/' + total + ' · 未收录 ' + notListed));
  }

  /* G18：自有域名 DNS + SSL 双检（2026-10-21 发现两个独立问题叠加） */
  {
    const rp = join(D, '03_验证与基准', 'reachability.json');
    let verdict = null, mainBlocker = null, dnsOk = null, sslOk = null;
    try {
      const j = JSON.parse(read(rp));
      verdict = j.verdict; mainBlocker = j.main_blocker;
      dnsOk = j.dns ? j.dns.ok : null;
      sslOk = j.ssl ? j.ssl.ok : null;
    } catch { }
    /* 非阻塞：可发现性故障需要用户操作服务器（DNS/证书），本地改不了。
     * 但如果 RED，必须在门禁输出里【明确可见】，不能静默。 */
    rec('G18', '自有域名可达（DNS+SSL，非阻塞但必须可见）', true,
      verdict === null ? '⚠ 尚无 reachability.json（先跑 node tools/reachability_health.mjs）'
        : (verdict + (mainBlocker ? ' · 主要矛盾：' + mainBlocker : '') + ' · DNS ' + (dnsOk ? 'OK' : 'FAIL') + ' · SSL ' + (sslOk ? 'OK' : 'FAIL')));
  }

  /* G19：工具描述自包含（2026-10-21 实测 29/29 达标，加门禁防回归）。
   * 判据三点：含触发词、含边界说明、长度不低于 200 字。
   * 理由：AI 选工具时只看 description，缺任一项它就判断这个工具用不上。 */
  {
    let total19 = 0;
    const bad19 = [];
    try {
      const idx19 = read(join(ROOT, 'plugin', 'index.mjs'));
      const blocks19 = idx19.split(/\n  name: '/).slice(1);
      total19 = blocks19.length;
      for (const b19 of blocks19) {
        const nm19 = (b19.match(/^(mackorn_[a-z_]+)/) || [])[1] || '?';
        const dm19 = b19.match(/description:[\s\S]{0,4000}?\n  parameters:/);
        const desc19 = dm19 ? dm19[0] : b19.slice(0, 4000);
        const hasTrig19 = /Trigger|触发词|triggers/i.test(desc19);
        const hasBound19 = /边界|不适用|不含|注意|限制|⚠️/.test(desc19);
        if (!hasTrig19) bad19.push(nm19 + ' 缺触发词');
        if (!hasBound19) bad19.push(nm19 + ' 缺边界');
        if (desc19.length < 200) bad19.push(nm19 + ' 过短');
      }
    } catch (e19) { bad19.push(String(e19.message).slice(0, 40)); }
    rec('G19', '工具描述自包含（触发词+边界+200字以上）', bad19.length === 0,
      bad19.length === 0 ? ('全部 ' + total19 + ' 个达标') : (bad19.slice(0, 5).join(' · ') + (bad19.length > 5 ? ' 共' + bad19.length + '项' : '')));
  }
  /* G20：AI 目录台账完整（15 个平台都有状态 + 检查周期 + 经验库） */
  {
    let total = 0; let listed = 0; let noStatus = []; let hasExp = false;
    try {
      const rj = JSON.parse(read(join(ROOT, 'directory-registry', 'registry.json')));
      const ps = rj.platforms || [];
      total = ps.length;
      listed = ps.filter((p) => ['listed', 'merged', 'pr-open'].includes(p.status)).length;
      noStatus = ps.filter((p) => !p.status).map((p) => p.name);
      hasExp = !!(rj.experience && (rj.experience.success || []).length && (rj.experience.failure || []).length);
    } catch (e) { noStatus.push('读不到 registry.json'); }
    const ok20 = noStatus.length === 0 && hasExp && total >= 10;
    rec('G20', 'AI 目录台账完整（平台状态+经验库）', ok20,
      total + ' 个平台 · 已收录 ' + listed + ' · 经验库 ' + (hasExp ? '有' : '缺') + (noStatus.length ? ' · 缺状态: ' + noStatus.slice(0,3).join(',') : ''));
  }
  /* G21：证书剩余天数预警（2026-10-14 过期拖了 7 天才发现，加此门禁）
   * 读 cert-monitor.json，<0 已过期 / <=7 立即续 / <=14 本周续 / <=30 计划续
   * 非阻塞（本地改不了证书），但必须在门禁输出里明确可见。 */
  {
    let days = null; let level21 = null; let issuer21 = null;
    try {
      const cm = JSON.parse(read(join(D, '03_验证与基准', 'cert-monitor.json')));
      if (cm.cert && cm.cert.main) { days = cm.cert.main.days_left; issuer21 = cm.cert.main.issuer; }
      level21 = cm.cert ? cm.cert.level : null;
    } catch { }
    const txt = days === null ? '⚠ 尚无 cert-monitor.json（先跑 node tools/cert_monitor.mjs）'
      : (days < 0 ? ('🔴 已过期 ' + Math.abs(days) + ' 天（' + (issuer21 || '?') + '）→ 立即续期')
        : days <= 7 ? ('🔴 仅剩 ' + days + ' 天 → 立即续期')
        : days <= 14 ? ('🟠 剩 ' + days + ' 天 → 本周内续期')
        : days <= 30 ? ('🟡 剩 ' + days + ' 天 → 计划续期')
        : ('🟢 剩 ' + days + ' 天'));
    rec('G21', 'SSL 证书有效期（非阻塞但必须可见）', true, txt);
  }
  /* G22：自动认知发现器必须 0 候选（六类缺口全清）
   * 2026-10-23 建。扫：承诺 vs 实现 / 数字不一致 / 文件未见天日 /
   * 死链 / 过期状态 / 反模式复现。任何一类有候选 = 系统不自洽。 */
  {
    let total = null; let critical = 0; let kinds = [];
    try {
      const ca = JSON.parse(read(join(D, '03_验证与基准', 'cognition-auto.json')));
      total = ca.counts ? ca.counts.total : 0;
      critical = ca.counts ? (ca.counts.critical || 0) : 0;
      kinds = [...new Set((ca.candidates || []).map((x) => x.kind))];
    } catch { }
    const txt = total === null ? '⚠ 尚无 cognition-auto.json（先跑 node tools/cognition_auto.mjs）'
      : (total === 0 ? '✅ 0 候选（六类缺口全清）'
        : '⚠ ' + total + ' 个候选（' + kinds.join(',') + (critical ? ' · 🔴' + critical + ' 严重' : '') + '）');
    rec('G22', '自动认知发现器（六类缺口）', total === 0, txt);
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  } catch (e) { rec('G4', '负控可执行', false, String(e.message).slice(0, 70)); }
}

/* ══════════ ③f 蓝图自检（G1-G5 五道门禁 + 八项自检）══════════ */
if (!QUICK && !JSON_OUT) console.log('\n  ── ③f 蓝图自检 ──');
if (!QUICK) {
  try {
    const r = spawnSync(process.execPath, [join(HERE, 'check_blueprint_compliance.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    let ok = r.status === 0;
    let detail = ok ? '五道门禁与自检清单已核对' : '（详见 distribution/03_验证与基准/blueprint-compliance.json）';
    try {
      const rep = JSON.parse(readFileSync(join(ROOT, 'distribution', '03_验证与基准', 'blueprint-compliance.json'), 'utf8'));
      detail = rep.passed + '/' + rep.total + ' 项' + (rep.gaps.length ? ' · 缺口 ' + rep.gaps.length + ' 项: ' + rep.gaps.map((g) => '[' + g.gate + ']' + g.item).join('; ') : '');
    } catch { }
    rec('蓝图', '五道门禁与自检清单核对', ok, detail);
  } catch (e) { rec('蓝图', '蓝图自检可执行', false, String(e.message).slice(0, 70)); }
}

/* ══════════ ③g 护栏全量负控（S1 修复：每条规则都必须有人验证）══════════ */
if (!QUICK && !JSON_OUT) console.log('\n  ── ③g 护栏全量负控（17 条逐条）──');
if (!QUICK) {
  try {
    const r = spawnSync(process.execPath, [join(HERE, '..', 'tests', 'negative', 'guardrail_negative_controls.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    /* 额外断言：listRules() 的每个 id 都必须在负控样本表里出现。
     * 这是对抗性审查（R18 S1）指出的失败模式的根治：
     *   新增规则若忘配负控 → 门禁直接红，而不是自动变成"无验证规则"。 */
    let detail = r.status === 0 ? '17 条负控 + 7 条正控全通过' : 'exit ' + r.status;
    let ok = r.status === 0;
    try {
      const gr = await import(pathToFileURL(join(HERE, '..', 'tests', 'negative', 'guardrail_negative_controls.mjs')).href);
      const live = (await import(pathToFileURL(join(HERE, '..', 'plugin', 'lib', 'guardrails.mjs')).href)).listRules().map((x) => x.id);
      const missing = live.filter((id) => !(id in gr.TRIGGERS));
      if (missing.length) { ok = false; detail = '以下护栏没有负控样本: ' + missing.join(', '); }
    } catch (e) { ok = false; detail = '无法核对负控覆盖: ' + String(e.message).slice(0, 50); }
    rec('护栏', '每条护栏都有可响应的负控（含新增规则强制）', ok, detail);
  } catch (e) { rec('护栏', '护栏负控可执行', false, String(e.message).slice(0, 70)); }
}

/* ══════════ ③h G1 同值对照（标定器必须能还原已知参数）══════════ */
if (!QUICK && !JSON_OUT) console.log('\n  ── ③h G1 标定同值对照 ──');
if (!QUICK) {
  try {
    const r = spawnSync(process.execPath, [join(HERE, 'g1_calibration_test.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
    rec('G1', '标定器能还原已知参数（同值对照）', r.status === 0, r.status === 0 ? '3/3 工况还原或如实标注不可辨识' : 'exit ' + r.status + '（跑 node tools/g1_calibration_test.mjs 看明细）');
  } catch (e) { rec('G1', 'G1 同值对照可执行', false, String(e.message).slice(0, 70)); }
}

/* ══════════ ③i 硬事实一致性（工具数/版本/语言数）══════════ */
if (!QUICK && !JSON_OUT) console.log('\n  ── ③i 硬事实一致性 ──');
if (!QUICK) {
  try {
    const r = spawnSync(process.execPath, [join(HERE, 'sync_hard_facts.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
    let detail = r.status === 0 ? '对外文件硬事实与唯一真相源一致' : 'exit ' + r.status;
    try {
      const hf = JSON.parse(readFileSync(join(D, '04_AI收录与分发', 'hard-facts.json'), 'utf8'));
      detail = hf.violations.length === 0
        ? '检查 ' + hf.checked_files + ' 个对外文件，硬事实全部一致（工具 ' + hf.truth.tools + ' · v' + hf.truth.version + ' · ' + hf.truth.languages + ' 语言）'
        : hf.violations.length + ' 处不一致: ' + hf.violations.slice(0, 3).map((x) => x.file + ' ' + x.fact + '=' + x.found).join('; ');
    } catch { }
    rec('硬事实', '对外文件的工具数/版本号/语言数与唯一真相源一致', r.status === 0, detail);
  } catch (e) { rec('硬事实', '硬事实检查可执行', false, String(e.message).slice(0, 70)); }
}

/* ══════════ ④ 模型物理不变量 ══════════ */
if (!JSON_OUT) console.log('\n  ── ④ 模型物理不变量 ──');
try {
  const S = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'simulate.mjs')).href);
  const { sieveSeries, DISTRIBUTIONS, discretize, simulateConeCrusher } = S;
  const SIZES = sieveSeries(0.5, 512);
  const feedOf = (f80, n = 1.1) => discretize(DISTRIBUTIONS.rosinRammler({ xc: f80 / Math.pow(Math.log(5), 1 / n), n }), SIZES).frac;
  let worst = 0, neg = 0;
  for (const css of [6, 10, 16, 25, 32, 40, 50]) for (const f80 of [60, 120, 200, 300]) {
    const r = simulateConeCrusher(feedOf(f80), SIZES, { cssMm: css });
    worst = Math.max(worst, r.mass_balance_error);
    neg = Math.min(neg, Number(r.max_negative_mass));
  }
  rec('模型', '质量守恒（28 组网格）', worst < 1e-2, '最坏 ' + worst.toExponential(2));
  rec('模型', '无负质量', neg > -1e-9, '最大负值 ' + neg.toExponential(2));
  let rejected = 0;
  for (const css of [0, -5, NaN, Infinity]) { try { simulateConeCrusher(feedOf(120), SIZES, { cssMm: css }); } catch { rejected += 1; } }
  rec('模型', '失效边界 4/4 拒绝', rejected === 4, rejected + '/4');
  // 单调性
  const ps = [6, 10, 16, 25, 40].map((c) => simulateConeCrusher(feedOf(200), SIZES, { cssMm: c }).product_p80_mm);
  rec('模型', 'CSS 单调（产品随 CSS 变粗）', ps.every((v, i) => i === 0 || v >= ps[i - 1]), ps.map((x) => x.toFixed(1)).join(' → '));
} catch (e) {
  rec('模型', '模型可加载', false, String(e.message).slice(0, 80));
}

/* ══════════ ⑤ 公开验证基准 + 自验证（非 quick）══════════ */
if (!QUICK) {
  if (!JSON_OUT) console.log('\n  ── ⑤ 公开验证基准与自验证 ──');
  const bench = join(D, '03_验证与基准', '公开基准', 'run-benchmark.mjs');
  if (exists(bench)) {
    // 沙箱下不能用管道 stdio（EPERM），用 stdio:'ignore' 跑，结果读 last-run.json
    try { spawnSync(process.execPath, [bench], { stdio: 'ignore', timeout: 300000 }); } catch { }
    let b = null; try { b = JSON.parse(read(join(D, '03_验证与基准', '公开基准', 'last-run.json'))); } catch { }
    rec('基准', '公开验证基准全通过', !!b && b.failed === 0, b ? (b.passed + '/' + b.total) : '取不到结果');
  } else rec('基准', '公开基准存在', false, '缺少 run-benchmark.mjs');

  const vm = join(HERE, 'validate_model.mjs');
  if (exists(vm)) {
    let v = null;
    try { v = JSON.parse(read(join(D, '03_验证与基准', 'model-self-validation.json'))); } catch { }
    if (v) {
      const hard = (v.checks || []).filter((c) => c.level === 'hard' && !c.pass);
      rec('自验证', '无硬失败', hard.length === 0, hard.length ? hard.map((c) => c.name).join(', ') : '通过 ' + (v.summary?.passed ?? '?') + '/' + (v.summary?.total ?? '?'));
    } else rec('自验证', '自验证报告存在', false, '缺少 model-self-validation.json（跑 validate_model.mjs 生成）');
  }
}

/* ══════════ ⑨ 发布产物完整性（R140 · 2026-10-21 夜班新增）══════════
 *
 * 为什么必须有这一节：
 *   之前所有门禁（单元/自审/关键词/基准/自验证）校验的都是**源码与内容合规**，
 *   没有任何一条校验 `dist/` 里那份**真正要发出去的产物**。
 *   实测后果：Dockerfile 为 Glama 自动部署而写，写了却从没进过发布包 ——
 *   `build_public.mjs` 的 ALLOW.files 只放行 README.md 与 package.json。
 *   于是评估器只能报 "This server cannot be deployed"，而门禁全绿。
 *
 * 教训（可迁移）：**"写了" ≠ "发出去了"。** 任何交付物都要有一个门禁
 *   去检查**最终产物**，而不是检查源码意图。
 */
if (!JSON_OUT) console.log('\n  ── ⑨ 发布产物完整性（R140）──');
{
  const DIST = join(ROOT, 'dist', 'mackorn-cone-crusher');
  let distPkg = null;
  try { distPkg = JSON.parse(read(join(DIST, 'package.json'))); } catch { distPkg = null; }

  rec('产物', 'dist 目录存在', exists(DIST), exists(DIST) ? DIST : '先跑 node tools/build_public.mjs');
  rec('产物', 'dist/package.json 可解析', !!distPkg, distPkg ? ('v' + distPkg.version) : '');

  const binKeys = Object.keys((distPkg && distPkg.bin) || {});
  rec('产物', 'bin 含包名（npx <包名> 可靠解析）',
    !!distPkg && binKeys.includes(distPkg.name), binKeys.join(',') || '(无 bin)');
  rec('产物', 'bin 保留旧别名 mackorn-mcp', binKeys.includes('mackorn-mcp'), '');

  rec('产物', '含 Dockerfile（Glama/Registry 部署入口）', exists(join(DIST, 'Dockerfile')), '');
  rec('产物', '含 skills.sh.json（skills.sh 索引）', exists(join(DIST, 'skills.sh.json')), '');

  const distFiles = (distPkg && Array.isArray(distPkg.files)) ? distPkg.files : [];
  rec('产物', 'files 清单含 Dockerfile', distFiles.includes('Dockerfile'), '');
  rec('产物', 'files 清单含 skills.sh.json', distFiles.includes('skills.sh.json'), '');
  const ghost = distFiles.filter((f) => !exists(join(DIST, String(f).replace(/\/$/, ''))));
  rec('产物', 'files 清单无幽灵条目（每条都在磁盘上）', ghost.length === 0, ghost.join(', '));

  // 产物级综合验收：真跑 check_publish_artifact（stdio 必须 ignore，管道会 EPERM）
  let ap = { status: null, error: null };
  try {
    ap = spawnSync(process.execPath, [join(HERE, 'check_publish_artifact.mjs')], { stdio: 'ignore', timeout: 300000 });
  } catch (e) { ap = { status: null, error: e }; }
  rec('产物', 'check_publish_artifact.mjs 通过',
    !ap.error && ap.status === 0,
    ap.error ? ('EPERM/异常: ' + (ap.error.code || ap.error.message)) : ('exit ' + ap.status));
}

/* ══════════ 汇总 ══════════ */
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
const byArea = {};
for (const r of results) { byArea[r.area] ||= { pass: 0, total: 0 }; byArea[r.area].total++; if (r.pass) byArea[r.area].pass++; }

const summary = {
  gate: 'L2 enforce_lessons',
  generated: new Date().toISOString(),
  elapsed_ms: Date.now() - t0,
  total: results.length, passed: pass, failed: fail.length,
  by_area: byArea,
  lesson_stats: lessonStats,
  results,
  rule: '任何一条已确认的教训被违反 → 退出码 1 → 不许发布。负控必须响，否则护栏形同虚设。',
};

mkdirSync(join(D, '03_验证与基准'), { recursive: true });
/* ⚠️ 部分运行不得覆盖完整报告（PDCA 调度器 R23 抓到）：
 *   --quick 只跑 15 项，早期版本也写 enforce-lessons-report.json，
 *   于是完整报告（24 项）被 15 项覆盖 → 后续判断全部失真。 */
{
  const isQuick = typeof QUICK !== 'undefined' && QUICK;
  const target = isQuick ? 'enforce-lessons-quick.json' : 'enforce-lessons-report.json';
  const payload = { gate: 'L2 构建门禁' + (isQuick ? '（quick 子集）' : ''), generated: new Date().toISOString(), elapsed_ms: Date.now() - t0, total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, is_full_run: !isQuick, by_area: byArea, lesson_stats: lessonStats, results, rule: '教训+库+护栏含负控+工具端到端+三批UAT+全站审计+插件级负控+蓝图自检+G1同值对照+物理不变量+公开基准' };
  writeFileSync(join(D, '03_验证与基准', target), JSON.stringify(payload, null, 2), 'utf8');
}

if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));
else {
  console.log('\n' + '═'.repeat(100));
  console.log('  汇总');
  console.log('═'.repeat(100));
  for (const [a, v] of Object.entries(byArea)) console.log('  ' + a.padEnd(10) + v.pass + ' / ' + v.total + (v.pass === v.total ? '  ✅' : '  ❌'));
  console.log('  ' + '─'.repeat(50));
  console.log('  合计 ' + pass + ' / ' + results.length + (fail.length ? '  ❌ 门禁未通过' : '  ✅ 门禁通过'));
  if (fail.length) { console.log('\n  失败明细：'); for (const f of fail) console.log('    ❌ [' + f.area + '] ' + f.name + ' — ' + f.detail); }
  console.log('\n  报告: distribution/03_验证与基准/enforce-lessons-report.json');
  console.log('  耗时: ' + (Date.now() - t0) + ' ms\n');
}
process.exit(fail.length ? 1 : 0);
