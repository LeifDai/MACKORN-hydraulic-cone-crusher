/**
 * AI 目录更新上传器（R138）
 *
 * 用户要求：
 *   「更新上传器；这样定期检查哪些平台收录了、哪些待收录；
 *     每 3 天对已经收录的进行更新，对待收录的查询，并提问完善，增加收录量。」
 *
 * 本工具做四件事（都是【生成材料】，不是自动提交）：
 *   ① --packet        生成更新包（给已收录平台同步最新信息）
 *   ② --submit-kit    生成提交材料包（给待收录平台）
 *   ③ --pr-comments   生成各 PR 的催促评论草稿
 *   ④ --sync-facts    先同步硬事实（工具数/版本），再生成包
 *
 * ★ 为什么不做「自动提交」：
 *   ① md 平台需要账号登录
 *   ② 提交表单大多有验证码/人工审核
 *   ③ 自动提交违反多数平台 ToS
 *   → 所以本工具做到「材料可直接复制粘贴」为止，最后一击由人点。
 *
 * ★ 诚实边界：
 *   提交后是否收录由平台决定，本工具不承诺结果。
 *
 * 输出目录：directory-registry/packets/
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const REG = join(ROOT, 'directory-registry', 'registry.json');
const OUT = join(ROOT, 'directory-registry', 'packets');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const today = new Date().toISOString().slice(0, 10);

if (!existsSync(REG)) { console.error('找不到 registry.json'); process.exit(1); }
const reg = JSON.parse(readFileSync(REG, 'utf8'));

/* 读当前真实状态（工具数/版本） */
function readFacts() {
  let tools = null; let version = null;
  try {
    const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
    tools = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
  } catch { }
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch { }
  let skills = 0;
  try {
    const sd = join(ROOT, 'skills');
    if (existsSync(sd)) {
      const { readdirSync } = require('node:fs');
    }
  } catch { }
  return { tools, version };
}

const facts = readFacts();
const id = reg.our_identity || {};

/* ══════════════════════════════════════════════════════════════
 * --sync-facts  先同步硬事实
 * ══════════════════════════════════════════════════════════════ */
if (has('--sync-facts')) {
  console.log('');
  console.log('  ══ 同步硬事实 ══');
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools', 'sync_tool_count_facts.mjs'), '--write'], {
      cwd: ROOT, stdio: 'inherit', windowsHide: true, timeout: 900000,
    });
  } catch (e) {
    console.log('  ⚠️ 同步失败（继续）: ' + String(e.message).slice(0, 80));
  }
  console.log('');
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

/* ══════════════════════════════════════════════════════════════
 * 通用信息块（所有包都用这套）
 * ══════════════════════════════════════════════════════════════ */
const COMMON = {
  name: id.name || 'MACKORN Hydraulic Cone Crusher Selection',
  name_cn: id.name_cn || 'MACKORN 美矿液压圆锥破碎机及生产线选型',
  repo: id.repo,
  npm: id.npm,
  mcp_name: id.mcp_name,
  site: id.site,
  license: id.license || 'MIT',
  tools: facts.tools || id.tools || 29,
  version: facts.version || '?',
  languages: id.languages || 12,
  contact: id.contact,

  one_liner_cn: '液压圆锥破选型、破碎筛分整线配置、磨矿选矿方法推荐与流程仿真。' + (facts.tools || 29) + ' 个工具，' + (id.languages || 12) + ' 语言。',
  one_liner_en: 'Hydraulic cone crusher selection, plant design, grinding & beneficiation method selection, and process simulation. ' + (facts.tools || 29) + ' tools, ' + (id.languages || 12) + ' languages.',

  short_desc_cn: 'MACKORN（美矿）液压圆锥破碎机与破碎筛分生产线选型插件。内置 NH/NS 单缸液压圆锥破厂商参数表、Whiten(1972) 稳态破碎模型、Bond(1952) 功耗模型。覆盖：客户需求表录入 → 机型/腔型/CSS/台数选型 → 整线配置 → 14 章方案书 → 成本估算；另含颚破、振动筛、磨矿（SAG/球磨/HPGR）、选矿（浮选/重选/光电选）、自动化分层、Kuz-Ram 爆破块度预测与整线贯通。每个结论都带来源等级（S1 厂商/S3 文献/S5 手册），未知字段返回 null 不编造。',
  short_desc_en: 'A vertical-domain plugin for MACKORN hydraulic cone crushers and crushing & screening plants. Built on NH/NS vendor parameter tables, the Whiten (1972) steady-state breakage model and Bond (1952) specific-energy model. Covers requirement-form intake → model/cavity/CSS/units selection → full plant configuration → 14-section proposal → cost estimation. Also includes jaw crusher, vibrating screen, grinding (SAG/ball mill/HPGR), beneficiation (flotation/gravity/ore sorting), automation layering, Kuz-Ram blast fragmentation and end-to-end chain selection. Every conclusion carries a source grade; unknown fields return null rather than being invented.',

  categories: 'Manufacturing / Industrial Equipment; Mining & Metals; Engineering; B2B',
  tags: 'cone-crusher, mining, mineral-processing, aggregate, crushing-plant, equipment-selection, hydraulic, engineering, mcp, mcp-server',

  install_mcp_json: JSON.stringify({
    mcpServers: {
      mackorn: { command: 'npx', args: ['-y', 'mackorn-cone-crusher'] },
    },
  }, null, 2),

  install_skills: 'npx skills add LeifDai/MACKORN-hydraulic-cone-crusher',

  verify_cmds: [
    'npx -y mackorn-cone-crusher --list      # 应列出 ' + (facts.tools || 29) + ' 个工具',
    'npx -y mackorn-cone-crusher --selftest  # 应 36 通过 / 0 失败',
  ],
};

/* ══════════════════════════════════════════════════════════════
 * --submit-kit  生成提交材料包
 * ══════════════════════════════════════════════════════════════ */
if (has('--submit-kit') || has('--all')) {
  const targets = (reg.platforms || []).filter((p) => p.status === 'not-listed');
  const lines = [];
  lines.push('# 📤 AI 目录提交材料包（自动生成）');
  lines.push('');
  lines.push('> 生成时间：' + new Date().toISOString());
  lines.push('> 生成工具：`node tools/directory_uploader.mjs --submit-kit`');
  lines.push('> **下面每一段都可以直接复制粘贴到对应平台的表单里。**');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 通用信息（所有平台都用这套）');
  lines.push('');
  lines.push('### 名称');
  lines.push('```');
  lines.push(COMMON.name);
  lines.push('```');
  lines.push('### 中文名');
  lines.push('```');
  lines.push(COMMON.name_cn);
  lines.push('```');
  lines.push('### 一句话简介（≤80 字）');
  lines.push('```');
  lines.push(COMMON.one_liner_cn);
  lines.push('');
  lines.push(COMMON.one_liner_en);
  lines.push('```');
  lines.push('### 详细简介');
  lines.push('```');
  lines.push(COMMON.short_desc_cn);
  lines.push('```');
  lines.push('### 英文详细简介');
  lines.push('```');
  lines.push(COMMON.short_desc_en);
  lines.push('```');
  lines.push('### 分类');
  lines.push('```');
  lines.push(COMMON.categories);
  lines.push('```');
  lines.push('### Tags');
  lines.push('```');
  lines.push(COMMON.tags);
  lines.push('```');
  lines.push('### 链接');
  lines.push('```');
  lines.push('仓库：' + COMMON.repo);
  lines.push('npm：  ' + COMMON.npm);
  lines.push('MCP：  ' + COMMON.mcp_name);
  lines.push('官网：  ' + COMMON.site + '   （⚠️ DNS/SSL 修复中，暂用 www）');
  lines.push('License: ' + COMMON.license);
  lines.push('作者：  ' + COMMON.contact);
  lines.push('```');
  lines.push('### 安装（MCP）');
  lines.push('```json');
  lines.push(COMMON.install_mcp_json);
  lines.push('```');
  lines.push('### 安装（Agent Skills）');
  lines.push('```bash');
  lines.push(COMMON.install_skills);
  lines.push('```');
  lines.push('### 验证');
  lines.push('```bash');
  for (const v of COMMON.verify_cmds) lines.push(v);
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 逐平台提交指引（' + targets.length + ' 个）');
  lines.push('');
  for (const p of targets) {
    lines.push('### ' + p.name);
    lines.push('');
    lines.push('```');
    lines.push('提交方式：' + (p.submit_method || '见平台官网'));
    lines.push('平台地址：' + (p.url || ''));
    if (p.blockers && p.blockers.length) {
      lines.push('⚠️ 前置阻塞：' + p.blockers.join(' / '));
      lines.push('   → 阻塞未解之前提交会被拒，先修阻塞');
    }
    lines.push('```');
    if (p.notes) {
      lines.push('');
      lines.push('> ' + p.notes);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## 提交后怎么验证');
  lines.push('');
  lines.push('```bash');
  lines.push('node tools/directory_checker.mjs --check --only <平台id>');
  lines.push('node tools/directory_checker.mjs');
  lines.push('```');
  lines.push('');

  const outFile = join(OUT, 'submit-kit-' + today + '.md');
  writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log('');
  console.log('  ✅ 提交材料包已生成：directory-registry/packets/submit-kit-' + today + '.md');
  console.log('     待提交平台 ' + targets.length + ' 个 · 工具数 ' + COMMON.tools + ' · 版本 ' + COMMON.version);
  console.log('');
  if (!has('--all')) process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --packet  生成更新包（给已收录平台）
 * ══════════════════════════════════════════════════════════════ */
if (has('--packet') || has('--all')) {
  const listed = (reg.platforms || []).filter((p) => ['listed', 'merged', 'pr-open', 'listed-but-unresponsive'].includes(p.status));
  const lines = [];
  lines.push('# 🔄 已收录平台更新包（自动生成）');
  lines.push('');
  lines.push('> 生成时间：' + new Date().toISOString());
  lines.push('> 用途：每 3 天同步一次元数据，防止平台缓存过期（如 Glama 显示 19 tools 而实际 ' + COMMON.tools + '）');
  lines.push('');
  lines.push('## 当前最新状态（要同步给各平台）');
  lines.push('');
  lines.push('```');
  lines.push('工具数：' + COMMON.tools);
  lines.push('版本：  ' + COMMON.version);
  lines.push('语言：  ' + COMMON.languages);
  lines.push('描述：  ' + COMMON.one_liner_cn);
  lines.push('```');
  lines.push('');
  lines.push('## 逐平台更新动作（' + listed.length + ' 个）');
  lines.push('');
  for (const p of listed) {
    lines.push('### ' + p.name + '（' + p.status + '）');
    lines.push('');
    lines.push('```');
    lines.push('更新方式：' + (p.update_method || '自动同步'));
    lines.push('检查方式：' + (p.check_method || 'node tools/directory_checker.mjs --only ' + p.id));
    if (p.blockers && p.blockers.length) lines.push('⚠️ 阻塞：' + p.blockers.join(' / '));
    lines.push('```');
    lines.push('');
  }
  lines.push('## ⚠️ 已知缓存问题');
  lines.push('');
  const stale = listed.filter((p) => (p.requirements || []).some((r) => r.id.includes('fresh') || r.id.includes('count') && r.satisfied === false));
  if (stale.length) {
    for (const p of stale) {
      lines.push('- **' + p.name + '**：缓存过期，需重新抓取');
      if (p.update_method) lines.push('  → ' + p.update_method);
    }
  } else {
    lines.push('- 暂无已知缓存问题');
  }
  lines.push('');

  const outFile = join(OUT, 'update-packet-' + today + '.md');
  writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log('  ✅ 更新包已生成：directory-registry/packets/update-packet-' + today + '.md');
  console.log('     已收录平台 ' + listed.length + ' 个');
  console.log('');
  if (!has('--all')) process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
 * --pr-comments  生成 PR 催促评论
 * ══════════════════════════════════════════════════════════════ */
if (has('--pr-comments') || has('--all')) {
  const prs = (reg.platforms || []).filter((p) => p.status === 'pr-open' || p.id === 'glama');
  const lines = [];
  lines.push('# 💬 PR 评论草稿（自动生成）');
  lines.push('');
  lines.push('> 生成时间：' + new Date().toISOString());
  lines.push('');
  for (const p of prs) {
    lines.push('## ' + p.name);
    lines.push('');
    lines.push('```markdown');
    if (p.id === 'awesome-mcp') {
      lines.push('The evaluation blocker has been root-caused and is being fixed.');
      lines.push('');
      lines.push('It turned out to be **two independent issues**:');
      lines.push('');
      lines.push('1. **DNS** — the bare domain `mackorn.cn` had lost its A record, so any probe against');
      lines.push('   `https://mackorn.cn/...` failed at the DNS resolution stage;');
      lines.push('2. **SSL** — the `www` host resolved correctly but its certificate expired on 2026-10-14.');
      lines.push('');
      lines.push('Both are being addressed. Once propagation completes I will re-trigger the');
      lines.push('evaluation and confirm the score appears here.');
      lines.push('');
      lines.push('Also note the tool count shown on the Glama page (' + (p.notes && p.notes.match(/19/) ? '19' : '?') + ') is a stale cache — the current');
      lines.push('release has **' + COMMON.tools + ' tools**, as reflected in the repo README.');
      lines.push('');
      lines.push('Verification tooling I run locally:');
      lines.push('- `node tools/reachability_health.mjs` — DNS / SSL / endpoint health');
      lines.push('- `node tools/ai_coverage.mjs` — index coverage across platforms');
      lines.push('```');
    } else {
      lines.push('Updated metadata: the project now ships **' + COMMON.tools + ' tools** (version ' + COMMON.version + ').');
      lines.push('Repo README and `AGENTS.md` are up to date. Please re-evaluate when convenient.');
      lines.push('```');
    }
    lines.push('');
  }
  const outFile = join(OUT, 'pr-comments-' + today + '.md');
  writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log('  ✅ PR 评论草稿已生成：directory-registry/packets/pr-comments-' + today + '.md');
  console.log('');
  if (!has('--all')) process.exit(0);
}

/* 默认：显示全部可用命令 */
if (!has('--packet') && !has('--submit-kit') && !has('--pr-comments') && !has('--sync-facts')) {
  console.log('');
  console.log('  ══ 目录更新上传器 ══');
  console.log('');
  console.log('  当前状态：工具 ' + COMMON.tools + ' · 版本 ' + COMMON.version);
  console.log('');
  console.log('  命令：');
  console.log('    --submit-kit    生成待收录平台的提交材料包');
  console.log('    --packet        生成已收录平台的更新包');
  console.log('    --pr-comments   生成 PR 催促评论草稿');
  console.log('    --sync-facts    先同步硬事实（工具数/版本）再生成');
  console.log('    --all           一次生成全部三类');
  console.log('');
  console.log('  ★ 本工具只生成材料，不做自动提交（提交需账号 + 过 ToS）。');
  console.log('    生成后复制粘贴即可。');
  console.log('');
}
