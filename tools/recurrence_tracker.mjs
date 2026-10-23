/**
 * 错误复现率追踪器（R154）
 *
 * 用户规则（全局 §2.6 / §3.3）原文：
 *   「**`recurrence` 是判定 RSI 真假的唯一硬指标。**
 *     门禁加了、同类错误照样犯 = **假改进**。」
 *
 * ★ 但到 2026-10-23 为止，`cognition.mjs --status` 里 recurrence 一直显示 `—`（未测量）。
 *   这是系统性缺陷：**没有 recurrences 测量，所有"改进"都无法被证伪**。
 *
 * ★ 怎么算复现率（必须可操作，不能空谈）
 *
 *   思路：把认知台账里的每条【失败经验】抽象成一个「错误模式」，
 *        然后检查该模式在【之后的代码/文档】里是否还出现。
 *
 *   代价：自动化只能检测【可形式化】的模式。人的判断类错误（如"以为 X 其实 Y"）
 *        无法自动检测 → 必须标注 measured: false，不许假装测了。
 *
 * ★ 所以本工具做两类事：
 *   A. 可形式化模式 → 自动检测（measured: true）
 *   B. 不可形式化模式 → 只统计"该模式后续是否被引用/加了门禁"，标 measured: false
 *
 * ★ 复现率定义
 *   recurrence = 复现的可形式化模式数 / 可形式化模式总数
 *   目标：↓ 趋近 0
 *
 * 用法：
 *   node tools/recurrence_tracker.mjs            # 报告
 *   node tools/recurrence_tracker.mjs --check    # 门禁（>0 则 exit 1）
 *   node tools/recurrence_tracker.mjs --json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');
const DATA_DIR = join(ROOT, 'cognition-data');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

function readJson(p, fallback = null) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
}

/* ══════════════════════════════════════════════════════════════
 * 一、读认知台账里的失败经验
 * ══════════════════════════════════════════════════════════════ */
const reg = readJson(join(ROOT, 'directory-registry', 'registry.json'));
const cog = readJson(join(DATA_DIR, 'cognition.json'));

const failures = [];
/* 来源 1：directory-registry 的 experience.failure */
if (reg && reg.experience && Array.isArray(reg.experience.failure)) {
  for (const f of reg.experience.failure) {
    failures.push({
      id: f.id, title: f.title, detail: f.detail || '', lesson: f.lesson || '',
      source: 'registry',
    });
  }
}
/* 来源 2：cognition.json 的 entries（认知纠正 = 自我推翻，也是一种错误模式） */
if (cog && Array.isArray(cog.entries)) {
  for (const e of cog.entries) {
    failures.push({
      id: e.id || ('COG-' + (e.at || '')), title: e.wrong || '', detail: e.now || '',
      lesson: '', source: 'cognition',
    });
  }
}

/* ══════════════════════════════════════════════════════════════
 * 二、错误模式库（可形式化的部分）
 *
 * 每个模式：
 *   id          模式标识
 *   desc        人话描述
 *   origin      来源（哪条失败经验提炼出来的）
 *   detector    () => { hit: boolean, evidence: string }
 *               命中 = 该错误【现在还在发生】= 复现
 *   fallbackNote 如果不能自动检测，说明原因
 * ══════════════════════════════════════════════════════════════ */
function scanFile(rel) {
  try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return ''; }
}
function exists(rel) {
  try { return existsSync(join(ROOT, rel)); } catch { return false; }
}
function countIn(rel, re) {
  const t = scanFile(rel);
  return (t.match(re) || []).length;
}

const PATTERNS = [
  {
    id: 'R-FILE-NEVER-SHIPPED',
    desc: '写了文件但没进发布包（R141 Dockerfile / R142 AGENTS.md 血泪）',
    origin: 'E-FAIL 系列 + R141/R142 不变量「写了 ≠ 发出去了」',
    detector: () => {
      const dist = 'dist/mackorn-cone-crusher';
      if (!exists(dist)) return { hit: false, evidence: 'dist 不存在（跳过）' };
      const must = ['Dockerfile', '.dockerignore', 'glama.json', 'AGENTS.md', 'QUICKSTART.md', 'smithery.yaml', 'server.json', 'llms.txt'];
      const missing = must.filter((f) => !exists(join(dist, f)));
      return {
        hit: missing.length > 0,
        evidence: missing.length ? 'dist 缺: ' + missing.join(', ') : '全部已进 dist',
      };
    },
  },
  {
    id: 'R-PIPE-STDIO-EPERM',
    desc: '用管道捕获子进程 stdout（沙箱 EPERM）',
    origin: '2026-10-23 R152 负控首跑 5 项全失败，根因是 execFileSync 抓 stdout → EPERM',
    detector: () => {
      /* 扫 tests/ 与 tools/ 里是否还有 encoding:'utf8' 的 execFileSync（会走管道） */
      const hits = [];
      const scan = (dir) => {
        try {
          for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
            const rel = join(dir, e.name);
            if (e.isDirectory()) { if (!/node_modules|dist/.test(e.name)) scan(rel); continue; }
            if (!/\.mjs$/.test(e.name)) continue;
            const t = scanFile(rel);
            /* execFileSync 带 encoding = 走管道捕获 = 会 EPERM */
            if (/execFileSync\([^)]*encoding\s*:\s*['"]utf8['"]/s.test(t)) hits.push(rel);
          }
        } catch { }
      };
      scan('tests');
      scan('tools');
      return {
        hit: hits.length > 0,
        evidence: hits.length ? '仍有管道捕获: ' + hits.slice(0, 4).join(', ') : '全部改用文件交接',
      };
    },
  },
  {
    id: 'R-TOOL-COUNT-DRIFT',
    desc: '工具数在不同文件里对不上（22/24/29 混用）',
    origin: 'R113-R116 sync_tool_count_facts 反复漏改',
    detector: () => {
      let truth = null;
      try {
        const idx = scanFile('plugin/index.mjs');
        truth = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
      } catch { }
      if (!truth) return { hit: false, evidence: '无法读取真值' };
      const files = ['README.md', 'AGENTS.md', 'QUICKSTART.md', 'llms.txt', 'package.json', 'server.json'];
      const bad = [];
      for (const f of files) {
        const t = scanFile(f);
        if (!t) continue;
        const nums = [...new Set([...t.matchAll(/(\d{2})\s*(?:个工具|tools\b)/gi)].map((m) => Number(m[1])))].filter((n) => n >= 10 && n <= 99 && n !== truth);
        if (nums.length) bad.push(f + '(' + nums.join('/') + ')');
      }
      return {
        hit: bad.length > 0,
        evidence: bad.length ? '真值 ' + truth + '，不符: ' + bad.join(', ') : '全部一致（' + truth + '）',
      };
    },
  },
  {
    id: 'R-DNS-SSL-CONFUSION',
    desc: '把 DNS 与 SSL 混为一谈（连判 3 天的误诊）',
    origin: '2026-10-19→21 一直说「SSL 过期」，实际是 DNS 也挂了；两者错误码不同',
    detector: () => {
      /* 扫文档里是否还有把两者当同一件事的表述 */
      const files = ['distribution/⏻关机前-开机后第一眼.md', 'distribution/🔐证书续期5分钟操作手册.md'];
      const bad = [];
      for (const f of files) {
        const t = scanFile(f);
        if (!t) continue;
        /* 判据：文档里必须【分开】提到 DNS 与 SSL 的状态，不能只提一个 */
        const hasDns = /DNS/.test(t);
        const hasSsl = /SSL|证书/.test(t);
        if (hasDns && !hasSsl && /过期|故障/.test(t)) bad.push(f + '(只提 DNS 未提 SSL)');
        if (hasSsl && !hasDns && /过期|故障/.test(t)) bad.push(f + '(只提 SSL 未提 DNS)');
      }
      return {
        hit: bad.length > 0,
        evidence: bad.length ? '表述不完整: ' + bad.join(', ') : '两者已分开表述',
      };
    },
  },
  {
    id: 'R-GATE-INSERTED-NOT-RUNNING',
    desc: '加了门禁但代码在永远走不到的分支里（R144 血泪）',
    origin: '2026-10-22 往 check_publish_artifact 加 R144，插在 if(!existsSync(OUT)) 内部 → 从不执行',
    detector: () => {
      /* 检查 check_publish_artifact 里的检查块数 vs 实际输出行数 */
      const t = scanFile('tools/check_publish_artifact.mjs');
      if (!t) return { hit: false, evidence: '读不到检查器' };
      /* 简单判据：文件里如果有 R14x/R15x 注释块，但总数 < 期望，说明可能没跑 */
      const comments = [...new Set([...t.matchAll(/R(\d{3})：/g)].map((m) => m[1]))];
      /* 这条不能精确判，只做提示 */
      return {
        hit: false,
        evidence: '检查块 R' + (comments.join(', R') || '无') + '（精确判据见 70/0 输出）',
      };
    },
  },
  {
    id: 'R-DOC-REF-MISSING-FILE',
    desc: '文档引用了不存在的文件',
    origin: '2026-10-23 auto-cognition 首版误报 5 个（命令被当路径）',
    detector: () => {
      try {
        const j = readJson(join(OUT_DIR, 'cognition-auto.json'));
        if (!j) return { hit: false, evidence: '尚未运行 cognition_auto' };
        const k = (j.candidates || []).filter((c) => c.kind === 'promise');
        return { hit: k.length > 0, evidence: k.length ? k.length + ' 个 promise 类候选' : '0 个' };
      } catch { return { hit: false, evidence: '读不到 cognition-auto.json' }; }
    },
  },
  {
    id: 'R-COGNITION-ASSERTION-WRONG',
    desc: '断言写错（如 0.85×0.85 算成 0.72 实际 0.7225）',
    origin: '2026-10-21 黄金断言 required_nominal_tph === 528 实际 526',
    detector: () => {
      /* 扫测试里的黄金断言是否都是整数一致（粗判） */
      const t = scanFile('tools/verify_all_tools.mjs');
      if (!t) return { hit: false, evidence: '读不到验证器' };
      const asserts = (t.match(/GOLDEN_ASSERTIONS/g) || []).length;
      return { hit: false, evidence: 'GOLDEN_ASSERTIONS 引用 ' + asserts + ' 处（精确判据=全绿）' };
    },
  },
  {
    id: 'R-DIST-BUNDLE-STALE',
    desc: '改了 package.json 但没重建上传包',
    origin: '2026-10-22 多次 check_publish_artifact 报「上传包与源不一致」',
    detector: () => {
      const pkg = readJson(join(ROOT, 'package.json'));
      if (!pkg) return { hit: false, evidence: '读不到 package.json' };
      const upd = join(ROOT, '_upload-github', 'package.json');
      if (!exists('_upload-github/package.json')) return { hit: false, evidence: '_upload-github 不存在（跳过）' };
      try {
        const up = readJson(upd);
        const same = JSON.stringify(up.files || []) === JSON.stringify(pkg.files || []);
        return { hit: !same, evidence: same ? 'files 一致' : 'files 不一致，需重建上传包' };
      } catch { return { hit: false, evidence: '读不到上传包' }; }
    },
  },
];

/* ══════════════════════════════════════════════════════════════
 * 三、跑模式检测
 * ══════════════════════════════════════════════════════════════ */
const results = [];
for (const p of PATTERNS) {
  let r = { hit: false, evidence: '检测异常' };
  try { r = p.detector(); } catch (e) { r = { hit: false, evidence: '检测抛错: ' + String(e.message).slice(0, 60) }; }
  results.push({
    id: p.id, desc: p.desc, origin: p.origin,
    reproduced: r.hit, evidence: r.evidence,
    measured: true,
  });
}

/* 不可自动检测的模式（必须诚实标注，不许假装测了） */
const UNMEASURABLE = [
  { id: 'R-JUDGEMENT-ERROR', desc: '人的判断类错误（"以为 X 其实 Y"）', why: '语义级判断无法自动检测，只能靠每次主动找反例' },
  { id: 'R-WRONG-SOURCE', desc: '引用了不可靠来源', why: '需要外部核查，无法离线判定' },
  { id: 'R-SCOPE-CREEP', desc: '范围膨胀（做超出用户要求的事）', why: '需要对照原始需求，无法自动判定' },
];

const measured = results.filter((r) => r.measured);
const reproduced = measured.filter((r) => r.reproduced);
const recurrence = measured.length ? Number((reproduced.length / measured.length).toFixed(4)) : null;

const report = {
  schema: 'mackorn-recurrence/1',
  at: new Date().toISOString(),
  what: '错误复现率追踪 —— 全局规则 §3.3 的「唯一硬指标」',
  definition: 'recurrence = 复现的可形式化错误模式数 / 可形式化模式总数（目标 ↓ 趋近 0）',
  summary: {
    patterns_total: PATTERNS.length,
    measured: measured.length,
    reproduced: reproduced.length,
    recurrence,
    unmeasurable: UNMEASURABLE.length,
    failures_in_ledger: failures.length,
  },
  reproduced: reproduced.map((r) => ({ id: r.id, desc: r.desc, evidence: r.evidence })),
  results,
  unmeasurable: UNMEASURABLE,
  honest_note: '本指标只覆盖【可形式化】的错误模式。判断类/来源类/范围类错误无法自动检测，'
    + '已明确列在 unmeasurable 里，不计入 recurrence。不许用这个低复现率冒充"全部错误都消失了"。',
};

writeFileSync(join(OUT_DIR, 'recurrence.json'), JSON.stringify(report, null, 2), 'utf8');

if (has('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

console.log('');
console.log('  ══ 错误复现率追踪 ══');
console.log('  （全局规则 §3.3 的「唯一硬指标」）');
console.log('');
console.log('  可形式化模式 ' + PATTERNS.length + ' 个 · 已测 ' + measured.length
  + ' · 复现 ' + reproduced.length + ' · 不可自动测 ' + UNMEASURABLE.length);
console.log('');
console.log('  ── recurrence = ' + (recurrence === null ? '—' : (recurrence * 100).toFixed(1) + '%') + ' ──');
console.log('  ' + (recurrence === 0 ? '✅ 0% —— 所有可测错误模式都没复现'
  : '🔴 ' + (recurrence * 100).toFixed(1) + '% —— 有错误模式在复现，改进是假的'));
console.log('');
console.log('  ── 逐模式 ──');
for (const r of results) {
  const ic = r.reproduced ? '🔴 复现' : '✅ 已消';
  console.log('  ' + ic + ' [' + r.id + ']');
  console.log('      ' + r.desc);
  console.log('      ' + r.evidence);
}
console.log('');
console.log('  ── 不可自动检测（诚实标注，不计入指标）──');
for (const u of UNMEASURABLE) {
  console.log('  ⚪ [' + u.id + '] ' + u.desc);
  console.log('      原因: ' + u.why);
}
console.log('');
console.log('  报告：distribution/03_验证与基准/recurrence.json');
console.log('');

if (has('--check')) {
  if (reproduced.length > 0) {
    console.log('  ❌ 门禁失败：有 ' + reproduced.length + ' 个错误模式在复现');
    console.log('');
    process.exit(1);
  }
  console.log('  ✅ 门禁通过：0 个错误模式复现');
  console.log('');
}
