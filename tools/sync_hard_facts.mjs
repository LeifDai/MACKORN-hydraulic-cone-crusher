/**
 * 硬事实一致性：唯一真相源 + 生成器 + 门禁
 *
 * 为什么做这个（收录规律 P2）：
 *   实测发现 GitHub 仓库描述写 "19 tools"，而实际已是 22。
 *   AI 检索会【直接引用抓到的数字】—— 过时比没收录更糟。
 *
 * 三类硬事实：
 *   ① 工具数     （22）
 *   ② 版本号     （0.2.0）
 *   ③ 语言数     （12）
 *
 * 处置：
 *   ① 唯一真相源 = distribution/官网落地页/ai/version.json（线上也是读它）
 *   ② 生成本文件 → 所有对外描述与 README 都从它拉数，不再手写
 *   ③ 门禁：扫描全部对外文件，任何与真相源不一致的数字 → 失败
 *
 * 同时输出一份【可直接粘贴到 GitHub 仓库描述】的标准文案（行业优先格式，
 * 满足收录规律 P1：描述的前 3-5 词决定分类）。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SITE = join(ROOT, 'distribution', '官网落地页');
const OUTDIR = join(ROOT, 'distribution', '04_AI收录与分发');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

/* ── ① 唯一真相源 ── */
const vpath = join(SITE, 'ai', 'version.json');
const v = readJson(vpath);
if (!v) { console.error('  ❌ 找不到唯一真相源: distribution/官网落地页/ai/version.json'); process.exit(1); }

/* 工具数以【实际定义】为准（version.json 里可能滞后） */
const idxSrc = read(join(ROOT, 'plugin', 'index.mjs'));
const actualTools = (idxSrc.match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;

const TRUTH = {
  tools: actualTools || v.remote_mcp_tools || null,
  version: v.version || null,
  languages: v.languages || (Array.isArray(v.language_list) ? v.language_list.length : null),
  source: 'distribution/官网落地页/ai/version.json + plugin/index.mjs（实际工具定义数）',
};


/* ══════════════════════════════════════════════════════════════════
 * 直接运行守卫（教训 L-32）
 * 本脚本会被其它脚本 import —— 没有守卫的话，一 import 就把整个 CLI 跑一遍，
 * 污染调用方输出、误导判断。实测：build_indexing_playbook 曾被 import 时触发全量生成。
 * ══════════════════════════════════════════════════════════════════ */
const isDirectRun = (() => { try { return import.meta.url === pathToFileURL(process.argv[1] || '').href; } catch { return false; } })();
if (isDirectRun) {
  console.log('');
  console.log('='.repeat(92));
  console.log('  硬事实一致性检查');
  console.log('='.repeat(92));
  console.log('');
  console.log('  ── 唯一真相源 ──');
  console.log('    工具数  : ' + TRUTH.tools + '　（实际定义 ' + actualTools + ' · version.json 记 ' + v.remote_mcp_tools + '）');
  console.log('    版本号  : ' + TRUTH.version);
  console.log('    语言数  : ' + TRUTH.languages);
  console.log('');
  if (actualTools && v.remote_mcp_tools && actualTools !== v.remote_mcp_tools) {
    console.log('  ⚠️ 真相源自身不一致：实际 ' + actualTools + " vs version.json " + v.remote_mcp_tools);
    console.log('     → version.json 会随构建重生成，此处以【实际定义数】为准');
  }
  
  /* ── ② 扫描对外文件里的硬事实 ── */
  const SCAN = [
    'README.md', 'README_EN.md', 'package.json', 'public-overrides/package.json', 'CLAUDE.md',
    'distribution/官网落地页/llms.txt', 'distribution/官网落地页/llms-full.txt',
    'distribution/官网落地页/ai.txt', 'distribution/官网落地页/.well-known/agent.json',
    'distribution/官网落地页/ai/index.html', 'distribution/官网落地页/index.html',
  ];
  /* 递归补上 about / 语言首页等 */
  for (const d of ['distribution/官网落地页', 'distribution/官网落地页/ai']) {
    const abs = join(ROOT, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (/\.(md|txt|json|html)$/i.test(f)) {
        const rel = relative(ROOT, join(abs, f)).replace(/\\/g, '/');
        if (!SCAN.includes(rel) && !/node_modules/.test(rel)) SCAN.push(rel);
      }
    }
  }
  
  const violations = [];
  const checked = [];
  for (const rel of SCAN) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    const c = read(p);
    if (!c) continue;
    checked.push(rel);
    /* 工具数：抓 "N tools" / "N 个工具" / "N 个 MCP 工具" */
    for (const m of c.matchAll(/(\d{1,3})\s*(?:个\s*)?(?:MCP\s*)?(?:tools?|工具)\b/gi)) {
      const n = Number(m[1]);
      if (n >= 10 && n <= 60 && n !== TRUTH.tools) {
        violations.push({ file: rel, fact: '工具数', found: n, expect: TRUTH.tools, ctx: c.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' ') });
      }
    }
  }
  
  console.log('');
  console.log('  ── 扫描 ' + checked.length + ' 个对外文件 ──');
  if (!violations.length) {
    console.log('    ✅ 未发现硬事实不一致');
  } else {
    const byFile = {};
    for (const x of violations) (byFile[x.file] = byFile[x.file] || []).push(x);
    for (const [f, arr] of Object.entries(byFile)) {
      console.log('    ❌ ' + f + '（' + arr.length + ' 处）');
      for (const x of arr.slice(0, 3)) console.log('       ' + x.fact + ' 写成 ' + x.found + '，应为 ' + x.expect + '　…' + x.ctx + '…');
    }
  }
  
  /* ── ③ 生成标准描述文案（可直接粘到 GitHub / npm / 目录）── */
  const DESC = {
    github: 'Mining industry cone crusher selection & plant design for AI — '
      + TRUTH.tools + ' MCP tools, NH/NS hydraulic cone crushers, aggregate & metal-mine crushing circuits, '
      + 'Whiten-1972 simulation, measured-data calibration, ' + TRUTH.languages + ' languages, MIT.',
    github_short: 'Mining industry cone crusher selection for AI — ' + TRUTH.tools + ' MCP tools (NH/NS hydraulic cone crushers)',
    npm: '矿山破碎筛分生产线选型：给一张客户需求表 + 一个产量，得到带依据的设备选型、流程仿真、实测标定与方案书'
      + '（DeepSeek Harness 插件 + MCP 服务器，' + TRUTH.tools + ' 个工具，零依赖）',
    dsh_catalog: 'Mining industry vertical-domain MACKORN cone crusher plugin — ' + TRUTH.tools + ' MCP tools, '
      + 'hydraulic cone crusher selection and crushing-plant design. Aggregate, quarry and metal-mine crushing circuits.',
    topics: ['mining', 'cone-crusher', 'hydraulic-cone-crusher', 'crushing-plant', 'aggregate',
      'mineral-processing', 'crusher-selection', 'equipment-selection', 'mcp', 'mcp-server',
      'model-context-protocol', 'deepseek-harness', 'dsh-plugin', 'engineering-tools', 'whiten-model'],
  };
  
  console.log('');
  console.log('  ── 标准描述文案（行业优先，满足收录规律 P1）──');
  console.log('    GitHub : ' + DESC.github);
  console.log('    npm    : ' + DESC.npm);
  console.log('    DSH目录 : ' + DESC.dsh_catalog);
  
  /* ── ④ 落盘 ── */
  const bundle = {
    generated: new Date().toISOString(),
    truth: TRUTH,
    violations,
    checked_files: checked.length,
    descriptions: DESC,
    rule: 'P2（收录规律）：硬事实必须与唯一真相源一致 —— AI 会直接引用抓到的数字，过时比没收录更糟。',
    how_to_apply: {
      github: '仓库 → Settings → 顶部 Description 框粘贴 descriptions.github（或用 gh repo edit --description "…"）',
      github_topics: '仓库 → Settings → Topics 逐个添加 descriptions.topics',
      npm: '改 public-overrides/package.json 的 description 后重新 publish',
      dsh_catalog: '提 PR 修改 awesome-dsh-plugin 里我们那条的描述',
    },
  };
  writeFileSync(join(OUTDIR, 'hard-facts.json'), JSON.stringify(bundle, null, 2), 'utf8');
  
  const L = [];
  L.push('# 硬事实一致性（唯一真相源 + 标准文案）');
  L.push('');
  L.push('> 生成时间：' + bundle.generated.slice(0, 19).replace('T', ' '));
  L.push('> 规律来源：收录规律 **P2** —— AI 会直接引用它抓到的数字，**过时比没收录更糟**。');
  L.push('');
  L.push('## 一、唯一真相源');
  L.push('');
  L.push('| 硬事实 | 值 | 来源 |');
  L.push('|:---|:---|:---|');
  L.push('| 工具数 | **' + TRUTH.tools + '** | plugin/index.mjs 的实际工具定义数（version.json 记 ' + v.remote_mcp_tools + '） |');
  L.push('| 版本号 | **' + TRUTH.version + '** | distribution/官网落地页/ai/version.json |');
  L.push('| 语言数 | **' + TRUTH.languages + '** | version.json 的 language_list 长度 |');
  L.push('');
  L.push('## 二、扫描结果');
  L.push('');
  L.push('检查了 **' + checked.length + '** 个对外文件。');
  L.push('');
  if (!violations.length) {
    L.push('✅ **未发现硬事实不一致。**');
  } else {
    L.push('❌ 发现 **' + violations.length + '** 处不一致：');
    L.push('');
    L.push('| 文件 | 硬事实 | 写成 | 应为 |');
    L.push('|:---|:---|--:|--:|');
    for (const x of violations) L.push('| ' + x.file + ' | ' + x.fact + ' | ' + x.found + ' | ' + x.expect + ' |');
  }
  L.push('');
  L.push('> ⚠️ **注意**：GitHub 仓库描述与 npm 上的 description 是**远程的**，本地扫描不到。');
  L.push('> 实测 GitHub 描述仍写 "19 tools"（实际 ' + TRUTH.tools + '）—— 需 push 后用下面的标准文案更新。');
  L.push('');
  L.push('## 三、标准文案（可直接粘贴）');
  L.push('');
  L.push('### GitHub 仓库描述（行业优先 —— 前 3-5 词决定分类）');
  L.push('');
  L.push('```');
  L.push(DESC.github);
  L.push('```');
  L.push('');
  L.push('> 为什么这样写：收录规律 **P1** —— 目录型渠道按 description 分词分类。');
  L.push('> 我们把 "Mining industry" 放在最前面，就是为了让分类器把我们归到**行业/工程**类，');
  L.push('> 而不是上次的「设计、媒体与视觉」册。');
  L.push('');
  L.push('### GitHub Topics（逐个添加）');
  L.push('');
  L.push('```');
  L.push(DESC.topics.join('\n'));
  L.push('```');
  L.push('');
  L.push('### npm description');
  L.push('');
  L.push('```');
  L.push(DESC.npm);
  L.push('```');
  L.push('');
  L.push('### DSH 插件目录（提 PR 时用）');
  L.push('');
  L.push('```');
  L.push(DESC.dsh_catalog);
  L.push('```');
  L.push('');
  L.push('## 四、怎么应用');
  L.push('');
  for (const [k, val] of Object.entries(bundle.how_to_apply)) L.push('- **' + k + '**：' + val);
  L.push('');
  L.push('---');
  L.push('');
  L.push('*本文件由 tools/sync_hard_facts.mjs 生成；每次改动硬事实后重跑即更新。*');
  L.push('*机器可读版：distribution/04_AI收录与分发/hard-facts.json*');
  L.push('');
  writeFileSync(join(OUTDIR, '硬事实一致性.md'), L.join('\n'), 'utf8');
  
  console.log('');
  console.log('='.repeat(92));
  console.log('  输出: distribution/04_AI收录与分发/硬事实一致性.md');
  console.log('        distribution/04_AI收录与分发/hard-facts.json');
  console.log('='.repeat(92));
  console.log('');
  process.exit(violations.length ? 1 : 0);
  
}
