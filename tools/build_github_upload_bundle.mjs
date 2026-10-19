/**
 * 建【上传就绪包】（R79）
 *
 * 背景：本机没有 git，用户要手动上传。GitHub 网页上传器支持【一次拖入多个文件】，
 *   但要求保持目录结构（尤其是 .github/ISSUE_TEMPLATE/ 的层级）。
 *
 * 本工具：
 *   ① 对比"线上已有的文件"与"本地新文件"，找出需要上传的
 *   ② 复制到一个扁平可拖拽的目录 distribution/_upload-github/
 *   ③ 生成一份逐项清单（含点击路径）
 *
 * 为什么不做 zip：GitHub 网页上传器不收 zip（只收文件），
 *   拖文件夹或逐个选文件都行，但 zip 不行。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '_upload-github');

/* ── 线上已有（从 GitHub API 实拉，2026-10 实测）── */
const ON_GITHUB = new Set([
  '.github/workflows/nightly-self-iteration.yml',
  '.gitignore', '.npmignore', 'CHANGELOG.md', 'LICENSE', 'README.md', 'VERSION',
  'cordis.patch.yml', 'llms.txt', 'package.json', 'server.json', '发布清单.md',
]);

/* ── 需要上传的（本地新增或已改）── */
const TO_UPLOAD = [
  /* 根目录社区文件 */
  /* R85：修 Glama 评估阻塞（PR #15410 的唯一未决项） */
  'skills.sh.json',
  'tools/cloud_heartbeat.mjs',
  'tools/publish_rhythm.mjs',
  'tools/ai_appeal.mjs',
  'tools/check_upload_consistency.mjs',
  'tools/sync_version.mjs',
  'tools/gen_php_mcp.mjs',
  'tools/rsi_level.mjs',
  'tools/rsi_register.mjs',
  'tools/rsi_record.mjs',
  'tests/negative/ai_appeal_negative_controls.mjs',
  'Dockerfile',
  'package.json',
  'server.json',
  'README.md',
  'LICENSE',
  'VERSION',
  'CLAUDE.md',
  'CITATION.cff',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  /* GitHub 模板 */
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/data_correction.yml',
  '.github/ISSUE_TEMPLATE/engineering_question.yml',
  /* 示例 */
  'examples/quick-start.mjs',
  'examples/mcp-client.mjs',
  /* 本轮新加的工具（可选，但建议一起上，让云端能跑） */
  'tools/check_citation.mjs',
  'tools/sync_tool_count_facts.mjs',
  'tools/check_cross_table.mjs',
  'tools/scan_sentinel_values.mjs',
  'tools/enforce_lessons.mjs',
  'tests/negative/hardfact_sync_negative_controls.mjs',
  '.github/workflows/nightly-self-iteration.yml',
  /* 文档 */
  'distribution/GitHub完善包-应用指南.md',
  'distribution/云端继续说明.md',
  'distribution/今晚工作方案.md',
  'distribution/⏻关机前交接.md',
  'distribution/PR状态专报-awesome-mcp-servers.md',
  'distribution/PR状态专报-两个PR.md',
  'distribution/新分发通道-Agent Skills-73种AI助手.md',
  'distribution/两个月无人值守方案.md',
  'distribution/交接-从这里继续.md',
  'distribution/把已上传的更新到0.2.2.md',
  'distribution/⏻关机前-开机后第一眼.md',
  'distribution/RSI判级标准-设计稿.md',
  'distribution/读完徐庆贺演讲-对照与可编程条目.md',
  'CHANGELOG.md',
  'llms.txt',
  'cordis.patch.yml',
  'tools/rsi_record.mjs',
  'tools/rsi_register.mjs',
  'articles/一条命令把圆锥破选型装进你的AI.md',
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const rows = [];
let totalKB = 0;
for (const rel of TO_UPLOAD) {
  const src = join(ROOT, rel);
  if (!existsSync(src)) { rows.push({ rel, ok: false, why: '本地不存在' }); continue; }
  const dst = join(OUT, rel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  const kb = statSync(src).size / 1024;
  totalKB += kb;
  rows.push({ rel, ok: true, kb, onGithub: ON_GITHUB.has(rel) });
}

/* ── 生成清单 ── */
const ok = rows.filter((r) => r.ok);
const miss = rows.filter((r) => !r.ok);
const neu = ok.filter((r) => !r.onGithub);
const upd = ok.filter((r) => r.onGithub);

const md = [
  '# 📤 上传就绪包（GitHub）',
  '',
  '> 由 `tools/build_github_upload_bundle.mjs` 生成（R79）',
  '> 本机没有 git，所以走**网页拖拽上传**这条路。',
  '',
  '---',
  '',
  '## 一、怎么上传（3 分钟）',
  '',
  '### 方式 A：拖文件夹（推荐）',
  '',
  '```',
  '1. 打开 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher',
  '2. 点 "Add file" → "Upload files"',
  '3. 打开这个文件夹：',
  '     distribution\\_upload-github\\',
  '4. 把里面【所有内容】拖进上传框',
  '   （GitHub 会保留目录结构，.github/ISSUE_TEMPLATE/ 也会正确放置）',
  '5. 下方 Commit message 填：',
  '     docs: add community files, issue templates, runnable examples, and cloud checks',
  '6. 选 "Commit directly to the main branch" → Commit changes',
  '```',
  '',
  '### 方式 B：分两批（更稳）',
  '',
  '```',
  '第 1 批（社区文件）：CITATION.cff / CONTRIBUTING.md / SECURITY.md / CODE_OF_CONDUCT.md',
  '第 2 批（其余）：.github/ examples/ tools/ tests/ distribution/',
  '```',
  '',
  '---',
  '',
  '## 二、清单（' + ok.length + ' 个文件 · ' + totalKB.toFixed(1) + ' KB）',
  '',
  '### 🆕 新增（线上没有）— ' + neu.length + ' 个',
  '',
  '| 文件 | 大小 |',
  '|:---|--:|',
  ...neu.map((r) => '| `' + r.rel + '` | ' + r.kb.toFixed(1) + ' KB |'),
  '',
  '### 🔄 覆盖更新（线上已有旧版）— ' + upd.length + ' 个',
  '',
  '| 文件 | 大小 |',
  '|:---|--:|',
  ...upd.map((r) => '| `' + r.rel + '` | ' + r.kb.toFixed(1) + ' KB |'),
  '',
];
if (miss.length) {
  md.push('### ⚠️ 本地缺失（跳过）— ' + miss.length + ' 个', '');
  for (const r of miss) md.push('- `' + r.rel + '` —— ' + r.why);
  md.push('');
}
md.push(
  '---',
  '',
  '## 三、上传后必做（**否则云端跑不起来**）',
  '',
  '```',
  '□ 1. 仓库 Settings → Actions → General → Workflow permissions',
  '      选 "Read and write permissions" → Save',
  '      （不开这个，云端"提交本轮结果"那一步会失败）',
  '',
  '□ 2. 仓库 About → ⚙️ → Description 改成：',
  '      Mining industry cone crusher selection & plant design for AI — 22 MCP tools, MACKORN NH/NS hydraulic cone crushers, aggregate & metal-mine crushing circuits, Whiten-1972 simulation, measured-data calibration, 12 languages, MIT.',
  '',
  '□ 3. About → Topics 填（最多 20 个）：',
  '      mcp, mcp-server, ai-agent, mining, mineral-processing, comminution,',
  '      cone-crusher, crusher, aggregate, crushing-plant, mechanical-engineering,',
  '      engineering-calculator, process-simulation, whiten-model, deepseek-harness,',
  '      dsh-plugin, industry-plugin, china, open-source, mit-license',
  '',
  '□ 4. Actions 页面点 "Run workflow" 手动跑一次，确认能跑通',
  '      https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher/actions',
  '```',
  '',
  '---',
  '',
  '## 四、验证清单',
  '',
  '```',
  '□ 仓库根目录能看到 CITATION.cff / CONTRIBUTING.md / SECURITY.md / CODE_OF_CONDUCT.md',
  '□ 右侧边栏出现 "Cite this repository"（CITATION.cff 格式合法才会有）',
  '□ 点 "New issue" 能看到 4 个模板（缺陷/功能建议/数据纠错/工程问题）',
  '□ 建 PR 时描述框自动带出检查清单',
  '□ Actions 页面出现夜间工作流，且首次手动运行是绿色',
  '□ About 面板显示 "22 MCP tools"（不是 19）',
  '```',
  '',
  '---',
  '',
  '## 五、还剩两件我做不了的',
  '',
  '```',
  '□ 上传网站更新包（distribution\\_deploy\\ → 服务器）',
  '   上传后验证：node examples\\mcp-client.mjs --http',
  '   应显示 "共 23 个工具"（当前线上是 21）',
  '',
  '□ 确认 version.json 声明的 12 种语言里，ja / de / tr 是"规划中"还是"缺页面"',
  '   （官网目前只有 9 个语言目录）',
  '```',
  '',
  '---',
  '',
  '*生成时间：' + new Date().toISOString() + '*',
  '',
);

writeFileSync(join(OUT, '_上传清单.md'), md.join('\n'), 'utf8');

console.log('');
console.log('  ══ 上传就绪包 ══');
console.log('');
console.log('  输出目录：distribution/_upload-github/');
console.log('  新增 ' + neu.length + ' 个 · 覆盖更新 ' + upd.length + ' 个 · 缺失 ' + miss.length + ' 个');
console.log('  合计 ' + totalKB.toFixed(1) + ' KB');
console.log('');
console.log('  目录结构：');
for (const r of ok) console.log('    ' + (r.onGithub ? '🔄' : '🆕') + ' ' + r.rel);
if (miss.length) { console.log(''); console.log('  ⚠️ 缺失：'); for (const r of miss) console.log('    ❌ ' + r.rel); }
console.log('');
console.log('  清单：distribution/_upload-github/_上传清单.md');
console.log('');
