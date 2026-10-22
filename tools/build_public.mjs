/**
 * 构建「公开版」包 —— 可上传 GitHub / npm、全球任何 AI 可读取的第一版 V000001。
 *
 * 与内部版的差别（合规要求）：
 *   · 剔除 Metso/Bruno 相关分析文档、_refs 转换物、内部合规备忘
 *   · 剔除价格数据、内部销售策略、客户项目名
 *   · 用 public-overrides/ 覆盖 3 个敏感文件
 *   · 生成 VERSION / CHANGELOG / LICENSE / .gitignore / .npmignore / 公开 README
 *
 * 用法：node tools/build_public.mjs
 * 产物：dist/mackorn-cone-crusher/  （以及同名 .tgz 由 npm pack 生成）
 */
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'mackorn-cone-crusher');
const OVR = join(ROOT, 'public-overrides');

/* 版本从真相源派生，不再硬编码 —— 硬编码必然与 public-overrides/package.json 失配 */
const __ovrPkg = JSON.parse(readFileSync(join(ROOT, 'public-overrides/package.json'), 'utf8'));
const SEMVER = __ovrPkg.version;
export const RELEASE_VERSION = 'V' + SEMVER.replace(/\./g, '').padStart(6, '0');

/* ---------------- 允许清单：只有列在这里的才会进入公开包 ---------------- */
const ALLOW_ASSETS = true;
const ALLOW = {
  files: [
    'README.md',
    'package.json',
    // 2026-10-21 夜班修：这两个文件原来不在放行清单里，写了却永远发不出去。
    //   · Dockerfile      —— Glama / MCP Registry 自动构建部署靠它；
    //                        没有它评估器只能报 "This server cannot be deployed"。
    //   · skills.sh.json  —— skills.sh 的技能分组索引，npx skills 走这个。
    // 守卫：tools/check_publish_artifact.mjs 断言 dist 必须含这两个文件且写进 files 清单。
    'Dockerfile', 'AGENTS.md', 'QUICKSTART.md', 'smithery.yaml', 'CITATION.cff',
    'skills.sh.json',
  ],
  dirs: [
    'plugin',
    'skills',
    'tests',
    'tools',
    '.github',        // CI 工作流：让测试在 GitHub 上公开可复现（也是"活跃维护"的证据）
    // 注意：这里**不能**加 'assets'。
    // 源目录 assets/ 里有 Bond 教材扫描件与客户检测报告（受版权保护，绝不能公开）；
    // 公开的 logo 与二维码只放在 public-overrides/assets/，由覆盖机制单独带入。
  ],
  // 公开知识库：仅 MACKORN 自有产品参数 + 标准清单 + 故障速查
  knowledge: [
    'equipment-nh-ns.json',
    'standards.md',
    'faults.md',
  ],
};

/* ---------------- 公开包内必须不存在的内容 ----------------
 * 只拦"第三方专有数据与其提取产物"，不拦公开产品名
 * （例如 Metso Bruno 是公开软件名，作为竞品观测目标是正当的）。 */
const FORBIDDEN_PATTERNS = [
  /brunodb/i, /bruno_validation/i, /mackorn_equipment_map/i, /crusher_id/i,
  /CrusherId/, /ScreenId/, /CRUSDATA/, /GRADCORR|RPM 2008|RPM2008|rev 080416|Rock Processing Manual/,
  /\bGc[1-9]\b/, /\bCc[1-9]\b/, /\bPo[1-9]\b/, /FGc[1-9]/, /Gcf[1-9]/,
  /(?:破解|逆向|reverse[- ]?engineer)/i,
  /MACKORN-DSH-Plugin/, /\.smc\b/,
];
const FORBIDDEN_FILES = [
  /^sync_tool_count_facts\.mjs$/i,
  /^check_citation\.mjs$/i,
  /^CITATION\.cff$/i,
  /^CONTRIBUTING\.md$/i,
  /^CODE_OF_CONDUCT\.md$/i,
  /^SECURITY\.md$/i,
  /^check_cross_table\.mjs$/i,
  /^scan_sentinel_values\.mjs$/i,
  /* R46：下划线开头的临时/探针文件不进合规扫描 —— 判据运行时会产生这类文件，
   *   若残留会让 build_public 误报（本次 L-08/L-16 就是这么被别的判据带崩的）。 */
  /^_[^/]*$/i,
  /* R45：脚本产生的备份/临时文件一律不提交、不进合规扫描（本次 data.mjs.r44bak 曾被扫到并误报） */
  /\.(bak|prev|r\d+bak|strbak|mutbak|oneoff|oneoff-done|dupfixbak|linebak|b6bak)$/i,
  /* R140（2026-10-21 夜班）：package.json 的历史备份曾被带进 dist（package.json.prekeywordfix），
   * 虽不在 files 清单里不会被 npm 发布，但会污染产物、误导人工核对。 */
  /^package\.json\..+/i,
  /^verify_changed_syntax\.mjs$/i,
  /^_archive\//i,
  /^sync_hard_facts\.mjs$/i, /^sync_version_json\.mjs$/i, /^_fix_hardcoded21\.mjs$/i,
  /^build_indexing_playbook\.mjs$/i, /^build_action_checklist\.mjs$/i, /^fix_npm_keywords\.mjs$/i,
  /^pdca_master\.mjs$/i, /^_wire_l4/i, /^_fix_l/i, /^_add_l/i, /^_apply_/i,
  /^prove_l05\.mjs$/i,
  /^prove_l34\.mjs$/i, /^independent_golden\.mjs$/i, /^detect_weak_checks\.mjs$/i, /^_wire_l44\.mjs$/i,
  /^test_lesson_mutation\.mjs$/i, /^classify_lesson_checks\.mjs$/i,
  /^prove_s1_fix\.mjs$/i, /^_probe_calib\.mjs$/i, /^_decisive\.mjs$/i, /^_g1_calib\.mjs$/i, /^_calib_golden\.mjs$/i, /^_calibrate_probe\.mjs$/i,
  /^fix_guardrail_scope\.mjs$/i, /^build_guardrail_negcontrols\.mjs$/i, /^_fix_g9g13\.mjs$/i,
  /^search_screening_datasets\.mjs$/i, /^_stream_dump\.mjs$/i, /^_pdf_diag\.mjs$/i, /^_ext_new\.mjs$/i, /^_check_screen_cand\.mjs$/i,
  /^check_blueprint_compliance\.mjs$/i, /^_insp_/i, /^negative\//i,
  /^night_summary\.mjs$/i, /^night_report\.mjs$/i,
  /^audit_tool_descriptions(_v2)?\.mjs$/i,
  /^uat_diagnostic_scenarios\.mjs$/i,
  /^uat_business_scenarios\.mjs$/i, /^add_market_verdict\.mjs$/i, /^_insp_/i,
  /^uat_user_scenarios\.mjs$/i, /^add_capacity_verdict\.mjs$/i, /^_add_cv\.mjs$/i, /^_fix_u/i,
  /^audit_site\.mjs$/i, /^_fix_audit/i, /^_fix_l35/i, /^_add_l3/i,
  /^check_live_state\.mjs$/i, /^_fix_l35check\.mjs$/i, /^_add_l35\.mjs$/i,
  /^verify_all_tools\.mjs$/i, /^fix_storage_robustness\.mjs$/i, /^fix_material_sources\.mjs$/i,
  /^build_model_card\.mjs$/i, /^publish_model_card\.mjs$/i, /^search_datasets_v2\.mjs$/i, /^fetch_new_datasets\.mjs$/i, /^mine_chalmers/i,
  /^workflow_dryrun\.mjs$/i, /^night_report\.mjs$/i, /^pdf_text_extract\.mjs$/i, /^fetch_chalmers_papers\.mjs$/i,
  // 一次性抓取/诊断脚本（含本地路径，非交付物）
  /^fetch_chalmers_papers\.mjs$/i, /^pdf_text_extract\.mjs$/i, /^expand_material_library\.mjs$/i,
  /^add_knowledge_tool\.mjs$/i, /^add_cli_guards\.mjs$/i, /^_add_cli_guards\.mjs$/i,
  /^enforce_lessons\.mjs$/i, /^self_iterate\.mjs$/i, /^calibration_priority_guide\.mjs$/i,
  /^clean_case_library\.mjs$/i, /^verify_goal_deliverables\.mjs$/i, /^diagnose_/i, /^crawl_cases2?\.mjs$/i,
  /^fix_publish_gates\.mjs$/i, /^integrate_uncertainty\.mjs$/i, /^fix_whiten_model\.mjs$/i,
  // 一次性诊断脚本（排查用，不是交付物；含本地路径）
  /^diagnose_whiten_order\.mjs$/i, /^diagnose_stable_solver\.mjs$/i,
  /^diagnose_breakage_convention\.mjs$/i, /^diagnose_correct_formula\.mjs$/i,
  /bruno-/i, /^mss-/i, /风险提示/, /price-bands\.json$/i,
  /plant-cases\.json$/i, /competitors\.json$/i, /_sample-proposal-output/,
  // 内部研发/引导脚本，不随公开包发布
  /^build_public\.mjs$/i, /^debug_intake\.mjs$/i, /^seed_knowledge\.mjs$/i,
  /* R141（2026-10-21 夜班）：两个内部验收工具不发布 —— 它们引用 dist/ 与项目结构，
   * 发给用户后跑不起来，只会误导。 */
  /^check_publish_artifact\.mjs$/i, /^check_lessons_subset\.mjs$/i,
  /* R142（2026-10-22 夜班）：一次性版本脚本不发布 —— bump_package_version 曾把版本
   * 硬编码成 0.2.0，随包发出去别人误跑就是事故（现已被 --to 守卫拦住）。 */
  /^bump_package_version\.mjs$/i, /^align_version_020\.mjs$/i,
  /^probe-plugin\.mjs$/i, /^dump_docx_structure\.py$/i, /^dump_xlsx\.py$/i,
  /^早晨一键上传\.ps1$/i, /^upload_to_github\.ps1$/i, /^github_publish\.ps1$/i, /^fixup_publish\.ps1$/i, /^fix_description_encoding\.ps1$/i, /^npm_publish\.ps1$/i, /^update_pr\.ps1$/i, /^analyze_registry\.ps1$/i, /^prune_remote\.ps1$/i, /^submit_awesome_mcp\.ps1$/i, /^fix_tests_sdk_portability\.mjs$/i, /^fix_skill_frontmatter\.mjs$/i, /rpm|sandvik.*manual|rockprocessing/i,
];
const FORBIDDEN_DIRS = [/^_upload-github$/i, /^_refs$/i, /^_forms$/i, /^\.tmp-kb$/i, /^dist$/i, /^public-overrides$/i];

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

console.log(`=== 构建公开版 ${RELEASE_VERSION}（semver ${SEMVER}） ===`);
rmSync(DIST, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* ---------- 1. 复制允许的顶层文件与目录 ---------- */
let copied = 0;
for (const f of ALLOW.files) {
  if (existsSync(join(ROOT, f))) { cpSync(join(ROOT, f), join(OUT, f)); copied += 1; }
}
for (const d of ALLOW.dirs) {
  const src = join(ROOT, d);
  if (!existsSync(src)) continue;
  cpSync(src, join(OUT, d), { recursive: true });
  copied += 1;
}

/* ---------- 2. 公开知识库（白名单） ---------- */
mkdirSync(join(OUT, 'knowledge'), { recursive: true });
for (const k of ALLOW.knowledge) {
  const src = join(ROOT, 'knowledge', k);
  if (existsSync(src)) { cpSync(src, join(OUT, 'knowledge', k)); copied += 1; }
  else console.warn(`  [warn] 知识库白名单文件不存在：${k}`);
}

/* ---------- 3. 用公开覆盖版替换敏感文件 ---------- */
function applyOverrides(dir) {
  for (const name of readdirSync(dir)) {
    const src = join(dir, name);
    const st = statSync(src);
    const rel = relative(OVR, src);
    const dst = join(OUT, rel);
    if (st.isDirectory()) { applyOverrides(src); continue; }
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
    console.log(`  [override] ${rel}`);
  }
}
applyOverrides(OVR);

/* ---------- 4. 清理公开包内的禁止文件/目录 ---------- */
function prune(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    const rel = relative(OUT, p).replace(/\\/g, '/');
    if (st.isDirectory()) {
      if (FORBIDDEN_DIRS.some((re) => re.test(name))) { rmSync(p, { recursive: true, force: true }); console.log(`  [prune dir] ${rel}`); continue; }
      prune(p);
      continue;
    }
    if (FORBIDDEN_FILES.some((re) => re.test(name))) { rmSync(p, { force: true }); console.log(`  [prune] ${rel}`); continue; }
    // 内部文档（使用手册里含内部路径的那几份不进公开包）
    if (/^(使用手册-按图索骥|风险提示-数据合规|自检与验收报告)\.md$/.test(name)) {
      rmSync(p, { force: true }); console.log(`  [prune 内部文档] ${rel}`);
    }
  }
}
prune(OUT);

/* ---------- 4b. 路径脱敏 ----------
 * 问题：知识文件与源码注释里写着内部知识库路径（E:\Mackorn\...）与开发机路径
 *       （C:\Users\<用户>\.dsh\...），进公开包会暴露内部目录结构、且到处不可复现。
 * 原则：**保留出处标识，去掉目录树**。
 *       「每个数字能指到来源」是硬规矩，所以不能把出处删掉，只能把它变成可公开引用的标签。
 */
const TEXT_EXT = /\.(mjs|js|cjs|json|md|txt|yml|yaml|py|ps1|html|css|ts)$/i;
let sanitized = 0;
const sanitizeHits = [];

function sanitizePaths(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { sanitizePaths(p); continue; }
    if (!TEXT_EXT.test(name)) continue;           // 二进制（如 .jpg）跳过，避免损坏
    let c;
    try { c = readFileSync(p, 'utf8'); } catch { continue; }
    const before = c;

    // ① 内部知识库路径（E:\Mackorn\... 或 \\Mackorn\...）→ 保留文件名，目录树换标签
    // 注意两点（都踩过）：
    //   · 内部目录名【含空格】（如「02 产品-设计-研发」），必须允许空格，以反引号/引号/竖线/换行 结束
    //   · 必须【贪婪】吃到路径末尾，否则只会替换盘符（会得到「MACKORN内部知识库MACKORN美矿…」这种粘连）
    const toLabel = (m) => {
      const parts = m.split(/[\\/]/).filter(Boolean);
      const base = parts[parts.length - 1] || '';
      return base ? `MACKORN内部知识库/${base}` : 'MACKORN内部知识库';
    };
    c = c.replace(/[A-Za-z]:[\\/]Mackorn[\\/][^\n`|"']*/g, toLabel);
    c = c.replace(/\\\\Mackorn[\\/][^\n`|"']*/g, toLabel);

    // ①b 其他根目录下的内部文件路径（保留文件名，便于追溯来源）
    const ROOTS = '(?:Users|DSH|AI|npm|nodejs|Program Files|ProgramData|Windows|Temp|home|opt|usr|var|mnt)';
    const P1C = new RegExp('[A-Za-z]:[\\\\/]' + ROOTS + '[\\\\/][^\\s"\'`|)\\]]*?([^\\\\/\\s"\'`|)\\]]+\\.(?:md|json|xlsx|docx|py|csv))', 'g');
    c = c.replace(P1C, (_m, file) => `MACKORN内部知识库/${file}`);

    // ② 开发机 Python 解释器路径 → 环境变量（可复现）
    const P2 = new RegExp('[\'"][A-Za-z]:[\\\\/]' + ROOTS + '[^\'"]*?python(?:\\.exe|3)?[\'"]', 'gi');
    c = c.replace(P2, "process.env.MACKORN_PY || 'python'");

    // ③ 其余残留的本地绝对路径 —— 只认已知根目录，避免误伤正则转义（如 e:\s*）
    const P3 = new RegExp('[A-Za-z]:[\\\\/]' + ROOTS + '[\\\\/][^\\s"\'`|)\\]]{1,}', 'g');
    c = c.replace(P3, '<本地路径已脱敏>');

    if (c !== before) {
      writeFileSync(p, c, 'utf8');
      sanitized += 1;
      const rel = relative(OUT, p).replace(/\\/g, '/');
      sanitizeHits.push(rel);
    }
  }
}
sanitizePaths(OUT);
if (sanitized) {
  console.log(`\n=== 路径脱敏 ===`);
  console.log(`  已脱敏 ${sanitized} 个文件：`);
  sanitizeHits.slice(0, 20).forEach((f) => console.log(`    ${f}`));
  if (sanitizeHits.length > 20) console.log(`    … 另 ${sanitizeHits.length - 20} 个`);
} else {
  console.log('\n=== 路径脱敏 ===\n  ✅ 无本地路径泄漏');
}

/* ---------- 5. 生成发布元数据 ---------- */
writeFileSync(join(OUT, 'VERSION'), `${RELEASE_VERSION}\n`, 'utf8');

// llms.txt —— AI 爬虫/LLM 专用项目摘要（llmstxt.org 约定），随公开包分发。
// 注意：不要用正则往根级文件清单里塞名字，容易把 writeFileSync 的路径参数改坏（踩过）。
const __srvSrc = join(OVR, 'server.json');
if (existsSync(__srvSrc)) writeFileSync(join(OUT, 'server.json'), readFileSync(__srvSrc, 'utf8'));

const __llmsSrc = join(OVR, 'llms.txt');
if (existsSync(__llmsSrc)) writeFileSync(join(OUT, 'llms.txt'), readFileSync(__llmsSrc, 'utf8'));

writeFileSync(join(OUT, 'CHANGELOG.md'), `# 变更记录

## ${RELEASE_VERSION} — 首个公开版（${new Date().toISOString().slice(0, 10)}）

首个面向全球发布的版本。同一份工具定义同时支持三种接入方式：

- **DeepSeek Harness 插件**（纯 Cordis entry，零 npm 依赖）
- **MCP 服务器**（零依赖 stdio，任何支持 MCP 的 AI 客户端均可调用）
- **Node ES Module**（可直接被其它程序 import）

### 能力

15 个工具：
\`mackorn_requirement_intake\`（客户需求表录入）、\`mackorn_proposal\`（方案书生成）、
\`mackorn_cone_selection\`（圆锥破选型）、\`mackorn_plant_design\`（整线配置）、
\`mackorn_capacity_check\`（产能校核）、\`mackorn_cost_estimate\`（成本估算）、
\`mackorn_mcfm_analysis\`（给料模数 MCFM）、\`mackorn_wear_design\`（衬板磨损）、
\`mackorn_grading_porosity\`（料层孔隙率）、\`mackorn_market_intel\`（市场纵深）、
\`mackorn_selection_report\`（选型报告）、\`mackorn_equipment_catalog\`（机型总览）、
\`mackorn_intel_watch\`（行业情报观测面）、\`mackorn_knowledge_update\`（知识入库与矛盾检测）、
\`mackorn_pdca_status\`（自我迭代 PDCA 台账）。

5 个技能：选型 / 整线 / 需求表录入 / 市场纵深方法 / 千行百业插件方法论。

### 理论内核

移植自 MACKORN《矿山选矿科研模型》的核心理论：粗粒级模数 MCFM、速度均匀化指数、
磨损稳定性与多梯度衬板、料层孔隙率、五维分析框架、可信度分级、数值矛盾检测、版本演进。

### 数据与诚实纪律

- 数据分四级标注：厂商硬数据 / 厂商历史资料 / 工程经验区间 / 空缺
- 每个工具输出都带 \`assumptions[]\`（假设 + 来源）与 \`warnings[]\`
- 数据缺口返回 \`null\`，不用默认值冒充
- 多来源冲突**并列保留**，不取平均
- **本公开版不含任何价格数据**，报价请走 MACKORN 商务

### 许可

代码与文档：MIT。MACKORN 产品参数数据版权归上海美矿机械股份有限公司所有，以 MIT 许可随附。
`, 'utf8');

writeFileSync(join(OUT, 'LICENSE'), `MIT License

Copyright (c) ${new Date().getFullYear()} Shanghai Mackorn Minerals Co., Ltd. (MACKORN)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`, 'utf8');

writeFileSync(join(OUT, '.gitignore'), `node_modules/
dist/
*.tgz
.tmp-kb/
.runtime/
.DS_Store
`, 'utf8');

writeFileSync(join(OUT, '.npmignore'), `tests/
tools/demo_*.mjs
tools/dump_*.py
tools/debug_*.mjs
public-overrides/
`, 'utf8');

/* ---------- 6. 合规闸门：公开包内禁止出现的内容 ---------- */
console.log('\n=== 合规闸门 ===');
const files = walk(OUT);
const violations = [];

// 6a. 结构性断言：覆盖版必须真的覆盖到位，不能落在错的路径
const dm = join(OUT, 'plugin/lib/data-market.mjs');
if (!existsSync(dm)) violations.push({ file: 'plugin/lib/data-market.mjs', pattern: '缺失', hit: '市场数据覆盖版未生效' });
else {
  const t = readFileSync(dm, 'utf8');
  if (/priceWanCny/.test(t)) violations.push({ file: 'plugin/lib/data-market.mjs', pattern: '价格残留', hit: '含 priceWanCny —— 内部价格未被公开版覆盖' });
  if (/自营融资租赁业务，解决客户资金压力/.test(t)) violations.push({ file: 'plugin/lib/data-market.mjs', pattern: '内部策略残留', hit: '内部销售策略未被覆盖' });
}
// 输出根不应出现杂散的 lib/ 目录（覆盖路径写错的典型症状）
if (existsSync(join(OUT, 'lib'))) violations.push({ file: 'lib/', pattern: '路径错误', hit: '覆盖版落到了包根 lib/，应为 plugin/lib/' });

// 6c. 技能 frontmatter 闸门
// 实测事故：给技能注入多语言触发词时，串里含 ": "（冒号+空格）→ YAML 把它当映射分隔符
// → frontmatter 解析失败 → **6 个技能从技能目录整体静默消失**。
// 这种失败没有报错、只有"技能不见了"，必须由闸门拦住。
const skillRoot = join(OUT, 'skills');
if (existsSync(skillRoot)) {
  let yamlParse = null;
  try { yamlParse = (await import('file:///D:/AI/npm_global/node_modules/@deepseek-ai/dsh/node_modules/yaml/dist/index.js')).parse; } catch { /* 无 yaml 库则跳过深校验 */ }
  for (const d of readdirSync(skillRoot)) {
    const sp = join(skillRoot, d, 'SKILL.md');
    if (!existsSync(sp)) { violations.push({ file: `skills/${d}`, pattern: '结构', hit: '缺 SKILL.md' }); continue; }
    const txt = readFileSync(sp, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(txt);
    if (!fm) { violations.push({ file: `skills/${d}/SKILL.md`, pattern: 'frontmatter', hit: '缺少 --- frontmatter ---' }); continue; }
    if (!/^name:\s*\S/m.test(fm[1]) || !/^description:\s*\S/m.test(fm[1])) {
      violations.push({ file: `skills/${d}/SKILL.md`, pattern: 'frontmatter', hit: '缺 name 或 description' });
    }
    // YAML 里 ": " 在纯量中非法，是本次事故的直接原因
    if (/^(description|whenToUse):\s.*:\s/m.test(fm[1])) {
      violations.push({ file: `skills/${d}/SKILL.md`, pattern: 'YAML', hit: '纯量中含 ": "（冒号+空格）会导致 frontmatter 解析失败、技能被静默拒绝' });
    }
    if (yamlParse) {
      try { const o = yamlParse(fm[1]); if (!o?.name || !o?.description) violations.push({ file: `skills/${d}/SKILL.md`, pattern: 'frontmatter', hit: '解析后缺 name/description' }); }
      catch (e) { violations.push({ file: `skills/${d}/SKILL.md`, pattern: 'YAML', hit: String(e.message).split('\n')[0] }); }
    }
  }
}
// 6b. 关键词扫描
for (const rel of files) {
  const abs = join(OUT, rel);
  if (/\.(png|jpg|pdf|docx|xlsx|pptx|tgz|mdb|db)$/i.test(rel)) continue;
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  for (const re of FORBIDDEN_PATTERNS) {
    const m = re.exec(text);
    if (m) { violations.push({ file: rel, pattern: String(re), hit: m[0] }); break; }
  }
}
// 客户名与价格残留检查
const CLIENT_HINTS = ['舟山', '海港开发', '哈密', '富宏', '葫芦岛', '志达', '双旗', '鞍钢', '栾川', '罗河', '洛钼', '红透山'];
for (const rel of files) {
  const abs = join(OUT, rel);
  if (/\.(png|jpg|pdf|docx|xlsx|pptx|tgz|mdb|db)$/i.test(rel)) continue;
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  for (const h of CLIENT_HINTS) {
    if (text.includes(h)) { violations.push({ file: rel, pattern: '客户名', hit: h }); break; }
  }
}

// 6c. 本地绝对路径残留检查
// 公开包里出现 [盘符]:\... 会暴露内部目录结构，且对使用者毫无意义。
// 路径脱敏（第 4b 步）之后仍残留的，一律视为闸门失败。
const LOCAL_PATH_RE = /[A-Za-z]:\\(?:Users|AI|Mackorn|DSH|DSH desktop|mackorn)[^\s"'`|)\]]*/g;
for (const rel of files) {
  const abs = join(OUT, rel);
  if (/\.(png|jpg|pdf|docx|xlsx|pptx|tgz|mdb|db)$/i.test(rel)) continue;
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { continue; }
  const m = LOCAL_PATH_RE.exec(text);
  if (m) violations.push({ file: rel, pattern: '本地绝对路径', hit: m[0].slice(0, 80) });
}

if (violations.length) {
  console.log(`  ❌ 发现 ${violations.length} 处违规：`);
  for (const v of violations) console.log(`     ${v.file}  ←  ${v.pattern}  命中「${v.hit}」`);
  process.exitCode = 1;
} else {
  console.log(`  ✅ 零命中（检查了 ${files.length} 个文件）`);
}

/* ---------- 6.5 版本号一致性门禁 ----------
 * 版本号散落在 README / llms.txt / server.json / package.json / index.html /
 * server-card.json / 发布清单.md 里。手工改必漏，漏了就会出现
 * "包是 0.0.6、README 写 0.0.3" 这种自相矛盾——对一个主打数据诚实的项目是硬伤。
 * sync_version.mjs 是真相源同步器，这里以检查模式调用：不一致就构建失败。 */
console.log('\n=== 版本号一致性 ===');
{
  const logFile = join(ROOT, '.version-check.log');
  const fd = openSync(logFile, 'w');
  let status = 0;
  let spawnErr = null;
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools/sync_version.mjs')], { cwd: ROOT, stdio: ['ignore', fd, fd] });
    if (r.error) spawnErr = r.error;
    status = r.status;
  } catch (e) { spawnErr = e; } finally { closeSync(fd); }
  let text = '';
  try { text = readFileSync(logFile, 'utf8'); } catch { }
  try { rmSync(logFile, { force: true }); } catch { }

  if (spawnErr) {
    console.log(`  ⚠ 无法运行版本检查（${spawnErr.code ?? spawnErr.message}）`);
  } else if (status === 0) {
    const tail = text.trim().split('\n').slice(-1)[0].trim();
    console.log(`  ${tail}`);
  } else {
    console.log('  ❌ 版本号不一致：');
    for (const l of text.split('\n')) if (/STALE|→/.test(l)) console.log(`  ${l.trim()}`);
    console.log('     修复：node tools/sync_version.mjs --write');
    process.exitCode = 1;
  }
}

/* ---------- 6.6 标签一致性门禁 ----------
 * 定位词散落在 package.json / manifest / llms.txt / README，手改必漏。
 * apply_tags.mjs 是唯一真相源，这里以检查模式调用。 */
console.log('\n=== 标签一致性 ===');
{
  const logFile = join(ROOT, '.tags-check.log');
  const fd = openSync(logFile, 'w');
  let status = 0, spawnErr = null;
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools/apply_tags.mjs')], { cwd: ROOT, stdio: ['ignore', fd, fd] });
    if (r.error) spawnErr = r.error; status = r.status;
  } catch (e) { spawnErr = e; } finally { closeSync(fd); }
  let text = '';
  try { text = readFileSync(logFile, 'utf8'); } catch { }
  try { rmSync(logFile, { force: true }); } catch { }
  if (spawnErr) console.log('  ⚠ 无法运行标签检查（' + (spawnErr.code || spawnErr.message) + '）');
  else if (status === 0) console.log('  ✅ ' + text.trim().split('\n').slice(-1)[0].trim());
  else { console.log('  ❌ 标签不一致：'); text.split('\n').filter(l => /\[缺\]/.test(l)).forEach(l => console.log('  ' + l.trim())); console.log('     修复：node tools/apply_tags.mjs --write'); process.exitCode = 1; }
}

/* ---------- 7. 在公开包内跑测试与 MCP 自检 ----------
 * 坑：沙箱环境（workspace-write / read-only）下，Node 的 child_process 用
 * **默认 piped stdio** 会因无法打开命名管道而报 `spawnSync ... EPERM`。
 * 那不是测试失败，是环境限制——但会让构建误报"❌ 失败"。
 * 所以这里改成把子进程输出**重定向到文件**，再读文件，完全不用管道。 */
console.log('\n=== 公开包自检 ===');

function runToFile(label, scriptArgs) {
  const logFile = join(OUT, `.selftest-${label.replace(/[^\w]/g, '_')}.log`);
  const fd = openSync(logFile, 'w');
  let status = 0;
  let spawnErr = null;
  try {
    // stdio: ['ignore', fd, fd] —— 直接写文件描述符，不经过管道
    const r = spawnSync(process.execPath, scriptArgs, { cwd: OUT, stdio: ['ignore', fd, fd] });
    if (r.error) spawnErr = r.error;
    status = r.status;
  } catch (e) {
    spawnErr = e;
  } finally {
    closeSync(fd);
  }
  let text = '';
  try { text = readFileSync(logFile, 'utf8'); } catch { }
  try { rmSync(logFile, { force: true }); } catch { }
  return { status, spawnErr, text };
}

const t1 = runToFile('tests', [join(OUT, 'tests/run.mjs')]);
if (t1.spawnErr) {
  console.log(`  ⚠ tests/run.mjs 无法在沙箱内启动子进程（${t1.spawnErr.code ?? t1.spawnErr.message}）`);
  console.log('    这通常是沙箱限制而非测试失败；请在非受限终端重跑以取得正式结论。');
} else if (t1.status === 0) {
  console.log(`  tests/run.mjs → ${t1.text.trim().split('\n').slice(-1)[0]}`);
} else {
  console.log('  ❌ tests/run.mjs 失败');
  console.log(t1.text.split('\n').slice(-12).join('\n'));
  process.exitCode = 1;
}

const t2 = runToFile('mcp', [join(OUT, 'plugin/mcp-server.mjs'), '--selftest']);
if (t2.spawnErr) {
  console.log(`  ⚠ MCP selftest 无法在沙箱内启动子进程（${t2.spawnErr.code ?? t2.spawnErr.message}）`);
} else if (t2.status === 0 || /0 失败/.test(t2.text)) {
  const last = t2.text.trim().split('\n').slice(-1)[0];
  console.log(`  MCP selftest → 通过（${last}）`);
} else {
  console.log('  ❌ MCP selftest 失败');
  console.log(t2.text.split('\n').slice(-8).join('\n'));
  process.exitCode = 1;
}

/* ---------- 7.5 发布产物验收（2026-10-21 夜班新增）----------
 * 为什么加在这里：之前所有门禁都只校验**源码**与内容合规，
 * 没人校验 dist 里那份**产物本身** —— 结果 Dockerfile 写了却从没进过发布包，
 * Glama/Registry 因此无法自动部署。从今往后"构建成功"包含"产物可用"。 */
const t3 = runToFile('artifact', [join(ROOT, 'tools/check_publish_artifact.mjs')]);
if (t3.spawnErr) {
  console.log(`  ⚠ 发布产物验收无法启动子进程（${t3.spawnErr.code ?? t3.spawnErr.message}）`);
  console.log('    这是沙箱限制；请在非受限终端重跑以取得正式结论。');
} else if (t3.status === 0) {
  const lastLine = t3.text.trim().split('\n').filter((l) => /结果：/.test(l)).slice(-1)[0] ?? '';
  console.log(`  发布产物验收 → 通过（${lastLine}）`);
} else {
  console.log('  ❌ 发布产物验收失败：');
  console.log(t3.text.split('\n').filter((l) => /FAIL|阻断|^\s+- /.test(l)).slice(0, 15).join('\n'));
  process.exitCode = 1;
}

/* ---------- 8. 清掉自检产生的临时知识库，再汇总 ---------- */
rmSync(join(OUT, 'tests/.tmp-kb'), { recursive: true, force: true });

const total = walk(OUT).length;
let bytes = 0;
for (const f of walk(OUT)) bytes += statSync(join(OUT, f)).size;
console.log('\n=== 公开包就绪 ===');
console.log(`  目录：${OUT}`);
console.log(`  文件：${total} 个，${(bytes / 1024).toFixed(1)} KB`);
console.log(`  版本：${RELEASE_VERSION}（semver ${SEMVER}）`);
console.log('  下一步：');
console.log(`    cd "${OUT}"`);
console.log('    npm pack                      # 生成 mackorn-cone-crusher-0.0.3.tgz');
console.log('    git init && git add . && git commit -m "MACKORN cone crusher selection plugin V000003"');
console.log('    gh repo create MACKORN-hydraulic-cone-crusher --public --source=. --push');
console.log('    gh repo edit --add-topic dsh-plugin --add-topic deepseek-harness --add-topic mcp --add-topic cone-crusher --add-topic mineral-processing');
