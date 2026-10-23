/**
 * 自动认知发现器（R146）
 *
 * 用户要求：「天天提高认知力，请编程」
 *
 * ★ 为什么需要这个（与 cognition.mjs 的分工）：
 *   cognition.mjs     = 记录工具（--add / --quiz / --daily），要【人想出来】才记
 *   cognition_auto.mjs= 发现工具（自动扫描不一致），【机器先找出来】再确认
 *
 *   只靠人想 = 会漏；只靠机器 = 会瞎报。两者结合才是真自动化。
 *
 * ★ 它扫什么（六类"认知缺口"）：
 *   ① 承诺 vs 实现      文档写了但代码没做 / 代码做了但文档没写
 *   ② 数字不一致        工具数/版本/语言数在不同文件里对不上
 *   ③ 文件未见天日      写了但不在发布包里（R141/R142 血泪）
 *   ④ 死链 / 坏引用     md 里引用的文件不存在
 *   ⑤ 过期状态          台账/文档里的状态已经过时（如"阻塞在 SSL"但实际不是）
 *   ⑥ 反模式复现        之前记录过的失败模式又出现了
 *
 * ★ 输出：候选认知条目（candidates），每条带证据。
 *   不自动入账 —— 因为"发现不一致"≠"确认这是错的"，需要人/AI 判断。
 *
 * 用法：
 *   node tools/cognition_auto.mjs              # 扫描并报告
 *   node tools/cognition_auto.mjs --json
 *   node tools/cognition_auto.mjs --promote    # 把高置信度候选直接入认知台账
 *   node tools/cognition_auto.mjs --only numbers,files
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'distribution', '03_验证与基准');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
const only = val('--only');
const want = (k) => !only || only.split(',').some((o) => k.includes(o.trim()));

/* ══════════════════════════════════════════════════════════════
 * 真值采集（一次算好，供各类检查用）
 * ══════════════════════════════════════════════════════════════ */
const TRUTH = {};
try {
  const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
  TRUTH.tools = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
  TRUTH.toolNames = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))];
} catch { TRUTH.tools = null; }
try { TRUTH.allModels = JSON.parse(readFileSync(join(ROOT, 'plugin', 'lib', 'data.mjs'), 'utf8').match(/export const ALL_MODELS[\s\S]*?\]/)?.[0]?.length ? '1' : '1'); } catch { }
try { TRUTH.version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { TRUTH.version = null; }
try {
  const c = readFileSync(join(ROOT, 'plugin', 'lib', 'contact-i18n.mjs'), 'utf8');
  TRUTH.languages = (c.match(/^\s{2}'[a-z]{2}(-[A-Z]{2})?':/gm) || []).length || null;
} catch { TRUTH.languages = null; }
try {
  const sd = join(ROOT, 'skills');
  TRUTH.skills = existsSync(sd) ? readdirSync(sd, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(sd, d.name, 'SKILL.md'))).length : 0;
} catch { TRUTH.skills = null; }
try {
  const el = readFileSync(join(ROOT, 'tools', 'enforce_lessons.mjs'), 'utf8');
  TRUTH.gates = [...new Set([...el.matchAll(/rec\('(G\d+)'/g)].map((m) => m[1]))].length;
} catch { TRUTH.gates = null; }
try {
  const ls = readFileSync(join(ROOT, 'tools', 'lessons.mjs'), 'utf8');
  TRUTH.lessons = [...new Set([...ls.matchAll(/id: '(L-\d+)'/g)].map((m) => m[1]))].length;
} catch { TRUTH.lessons = null; }

const candidates = [];
function add(kind, title, evidence, severity, fixable) {
  candidates.push({ kind, title, evidence, severity, fixable });
}

/* ══════════════════════════════════════════════════════════════
 * ① 承诺 vs 实现
 * ══════════════════════════════════════════════════════════════ */
if (want('promise')) {
  /* 扫 CLAUDE.md / AGENTS.md / README 里声明的文件，检查是否真存在 */
  const docs = ['CLAUDE.md', 'AGENTS.md', 'QUICKSTART.md', 'README.md'].filter((f) => existsSync(join(ROOT, f)));
  for (const d of docs) {
    const txt = readFileSync(join(ROOT, d), 'utf8');
    /* 提取反引号里的路径样式（含 / 或以 .md/.mjs/.json 结尾） */
    /* R147 修误报：排除「node tools/xxx.mjs」这类【命令】上下文 ——
     * 它们不是路径引用，而是可执行命令。旧正则把命令里的文件名当成路径 → 假报 5 个"文件不存在"。
     * 判据：如果反引号内容前面紧邻 'node ' 或 'npx ' 或 'powershell '，就跳过。 */
    /* R148 修真误报：反引号里常是 `node tools/xxx.mjs`（含命令前缀），
     * 旧逻辑只匹配路径部分，导致看 `m.index` 前文时看到的是命令中间，判据失效。
     * 正确做法：先抓【整个反引号内容】，再看它的开头是不是命令。 */
    const backtickContents = [...txt.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
    const paths = [...new Set(backtickContents
      .filter((s) => {
        /* 纯命令 → 不是路径引用 */
        if (/^(node|npx|pnpm|npm|powershell|bash|sh|cd|git|claude|uvx|docker)\s/i.test(s)) return false;
        /* 只取"整段就是一个路径"的 */
        return /^[a-zA-Z0-9_\-\/\.]+\.(?:md|mjs|json|yml|yaml|sh|ps1|cff|txt)$/.test(s);
      }))];
    /* R149 修最后一个误报：裸文件名（不含 /）在 md 里通常是【行文提及】而非路径引用，
     * 例如「`build_public.mjs` 的放行清单漏了它」实际指 tools/build_public.mjs。
     * 修法：裸文件名在仓库里按文件名搜一遍，找到就算有效。 */
    const findByName = (name) => {
      /* R150 修 bug：原实现漏了【根目录】—— llms.txt / QUICKSTART.md 都在根目录，
       * 却被判"仓库里无同名文件"。根目录必须最先检查。 */
      if (existsSync(join(ROOT, name))) return join(ROOT, name);
      const dirs = ['tools', 'plugin', 'plugin/lib', 'tests', 'distribution', 'cognition-data',
                    'iteration-data', 'directory-registry', 'rsi-data', 'knowledge', 'skills'];
      for (const d of dirs) {
        const p = join(ROOT, d, name);
        if (existsSync(p)) return p;
      }
      /* 再扫一层 */
      try {
        for (const d of dirs) {
          const dp = join(ROOT, d);
          if (!existsSync(dp)) continue;
          for (const e of readdirSync(dp, { withFileTypes: true })) {
            if (e.isFile() && e.name === name) return join(dp, e.name);
          }
        }
      } catch { }
      return null;
    };
    const missing = [];
    for (const p of paths) {
      if (/^https?:/.test(p)) continue;
      if (p.includes('*')) continue;
      const hasDir = p.includes('/');
      if (hasDir) {
        if (!existsSync(join(ROOT, p))) missing.push(p);
      } else {
        if (!findByName(p)) missing.push(p + '（仓库里无同名文件）');
      }
    }
    if (missing.length) {
      add('promise', `${d} 引用了不存在的文件（${missing.length} 个）`, missing.slice(0, 8).join(', '), 'medium', true);
    }
  }
  /* AGENTS.md 里承诺的 29 个工具名是否都在代码里 */
  if (existsSync(join(ROOT, 'AGENTS.md')) && TRUTH.toolNames) {
    const ag = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
    const named = [...new Set([...ag.matchAll(/mackorn_[a-z_]+/g)].map((m) => m[0]))];
    const notInCode = named.filter((n) => !TRUTH.toolNames.includes(n));
    if (notInCode.length) {
      add('promise', `AGENTS.md 提到的工具在代码里不存在（${notInCode.length} 个）`, notInCode.join(', '), 'high', true);
    }
    const notInAgents = TRUTH.toolNames.filter((n) => !named.includes(n));
    if (notInAgents.length) {
      add('promise', `代码里有 ${notInAgents.length} 个工具没写进 AGENTS.md（AI 读不到）`, notInAgents.slice(0, 8).join(', '), 'medium', true);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
 * ② 数字不一致
 * ══════════════════════════════════════════════════════════════ */
if (want('numbers')) {
  const targets = ['README.md', 'AGENTS.md', 'QUICKSTART.md', 'CLAUDE.md', 'llms.txt', 'package.json', 'server.json'].filter((f) => existsSync(join(ROOT, f)));
  for (const f of targets) {
    const txt = readFileSync(join(ROOT, f), 'utf8');
    /* 工具数 */
    const toolNums = [...new Set([...txt.matchAll(/(\d{2})\s*(?:个工具|tools\b)/gi)].map((m) => Number(m[1])))].filter((n) => n >= 10 && n <= 99);
    /* R153 修逻辑 bug（NC2 负控抓到）：原判据「真值不在列表里才报」——
     * 如果文件里同时有正确的 29 和错误的 47，真值在列表里 → 漏报错误值。
     * 正确判据：【有任何 ≠ 真值的数就报】，并只列那些错的。 */
    if (TRUTH.tools && toolNums.length) {
      const wrongNums = toolNums.filter((n) => n !== TRUTH.tools);
      if (wrongNums.length) {
        add('numbers', `${f} 的工具数与真值不符（真值 ${TRUTH.tools}）`,
          '错误值: ' + wrongNums.join(', ') + '（文件里所有值: ' + toolNums.join(', ') + '）', 'high', true);
      }
    }
    /* 版本号 */
    if (TRUTH.version) {
      const vers = [...new Set([...txt.matchAll(/\bv?(\d+\.\d+\.\d+)\b/g)].map((m) => m[1]))].filter((v) => v.startsWith('0.'));
      const wrong = vers.filter((v) => v !== TRUTH.version);
      if (wrong.length && !f.includes('CHANGELOG')) {
        add('numbers', `${f} 的版本号与真值不符（真值 ${TRUTH.version}）`, '文件里出现: ' + wrong.join(', '), 'medium', true);
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════
 * ③ 文件未见天日（写了但不在发布包）
 * ══════════════════════════════════════════════════════════════ */
if (want('files')) {
  const DIST = join(ROOT, 'dist', 'mackorn-cone-crusher');
  if (existsSync(DIST)) {
    const keyFiles = ['AGENTS.md', 'QUICKSTART.md', 'Dockerfile', '.dockerignore', 'glama.json', 'smithery.yaml', 'server.json', 'llms.txt', 'README.md', 'LICENSE'];
    const missing = keyFiles.filter((f) => !existsSync(join(DIST, f)));
    if (missing.length) {
      add('files', `${missing.length} 个关键文件不在 dist（写了但发不出去）`, missing.join(', '), 'high', true);
    }
    /* package.json files 清单 vs dist 实际 */
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
      const listed = pkg.files || [];
      const notListed = keyFiles.filter((f) => existsSync(join(ROOT, f)) && !listed.includes(f));
      if (notListed.length) {
        add('files', `package.json files 漏列 ${notListed.length} 个关键文件`, notListed.join(', '), 'high', true);
      }
    } catch { }
  }
}

/* ══════════════════════════════════════════════════════════════
 * ④ 死链 / 坏引用（只查本仓库内的相对链接）
 * ══════════════════════════════════════════════════════════════ */
if (want('links')) {
  const docs = ['README.md', 'AGENTS.md', 'QUICKSTART.md', 'CLAUDE.md'].filter((f) => existsSync(join(ROOT, f)));
  for (const d of docs) {
    const txt = readFileSync(join(ROOT, d), 'utf8');
    /* markdown 链接 <target> 或 (target) */
    const links = [...new Set([...txt.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map((m) => m[1]))];
    const bad = [];
    for (const l of links) {
      if (/^(https?:|mailto:|#)/.test(l)) continue;
      const clean = l.replace(/^\.\//, '');
      if (!existsSync(join(ROOT, clean))) bad.push(l);
    }
    if (bad.length) {
      add('links', `${d} 有 ${bad.length} 个死链`, bad.slice(0, 6).join(', '), 'medium', true);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
 * ⑤ 过期状态（台账说 A，实际是 B）
 * ══════════════════════════════════════════════════════════════ */
if (want('stale')) {
  const regPath = join(ROOT, 'directory-registry', 'registry.json');
  if (existsSync(regPath)) {
    try {
      const reg = JSON.parse(readFileSync(regPath, 'utf8'));
      /* 检查上次检查日期是否超过 3 天 */
      const last = reg.rhythm?.last_check;
      if (last) {
        const days = Math.floor((Date.now() - Date.parse(last)) / 86400000);
        if (days >= 3) {
          add('stale', `AI 目录台账 ${days} 天没检查（周期 3 天）`, 'last_check = ' + last, 'medium', true);
        }
      }
      /* 检查 blockers 里是否有已解决的 */
      for (const p of reg.platforms || []) {
        for (const b of p.blockers || []) {
          if (/DNS/i.test(b)) {
            add('stale', `${p.name} 的 blocker 仍是「DNS」但 DNS 已于 10-21 恢复`, b, 'high', true);
          }
        }
      }
    } catch { }
  }
  /* cert-monitor 是否过期 */
  const cmPath = join(OUT_DIR, 'cert-monitor.json');
  if (existsSync(cmPath)) {
    try {
      const cm = JSON.parse(readFileSync(cmPath, 'utf8'));
      const at = cm.at ? Date.parse(cm.at) : 0;
      const hours = Math.floor((Date.now() - at) / 3600000);
      if (hours > 24) {
        add('stale', `证书监控结果 ${hours} 小时没更新（应每天跑）`, 'at = ' + cm.at, 'low', true);
      }
    } catch { }
  }
}

/* ══════════════════════════════════════════════════════════════
 * ⑥ 反模式复现（对照认知台账里的失败经验）
 * ══════════════════════════════════════════════════════════════ */
if (want('recur')) {
  const regPath = join(ROOT, 'directory-registry', 'registry.json');
  if (existsSync(regPath)) {
    try {
      const reg = JSON.parse(readFileSync(regPath, 'utf8'));
      const fails = reg.experience?.failure || [];
      /* 已知模式：文件缺发布包（E-FAIL/R141/R142） */
      const dist = join(ROOT, 'dist', 'mackorn-cone-crusher');
      const hasFileIssue = candidates.some((c) => c.kind === 'files');
      if (hasFileIssue && fails.some((f) => /发出去了|发布包|Dockerfile/i.test(f.title + f.detail))) {
        add('recur', '「写了 ≠ 发出去了」第三次复现！', '已知模式 E-FAIL/R141/R142 再次出现，说明门禁没覆盖到', 'critical', true);
      }
    } catch { }
  }
}

/* ══════════════════════════════════════════════════════════════
 * 汇总
 * ══════════════════════════════════════════════════════════════ */
const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
for (const c of candidates) bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;

const report = {
  schema: 'mackorn-cognition-auto/1',
  at: new Date().toISOString(),
  what: '自动认知发现器 —— 扫六类认知缺口，产出候选条目（不自动入账）',
  truth: TRUTH,
  counts: { total: candidates.length, ...bySeverity },
  candidates,
};

writeFileSync(join(OUT_DIR, 'cognition-auto.json'), JSON.stringify(report, null, 2), 'utf8');

if (has('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const I = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
console.log('');
console.log('  ══ 自动认知发现器 ══');
console.log('  （扫六类认知缺口：承诺/数字/文件/死链/过期/复现）');
console.log('');
console.log('  真值：工具 ' + TRUTH.tools + ' · 版本 ' + TRUTH.version + ' · 技能 ' + TRUTH.skills
  + ' · 门禁 ' + TRUTH.gates + ' · 教训 ' + TRUTH.lessons);
console.log('');
console.log('  发现 ' + candidates.length + ' 个候选'
  + '（🔴' + (bySeverity.critical || 0) + ' 🟠' + (bySeverity.high || 0)
  + ' 🟡' + (bySeverity.medium || 0) + ' ⚪' + (bySeverity.low || 0) + '）');
console.log('');
if (!candidates.length) {
  console.log('  ✅ 没有发现认知缺口 —— 系统自洽');
  console.log('');
  process.exit(0);
}
for (const c of candidates) {
  console.log('  ' + (I[c.severity] || '·') + ' [' + c.kind + '] ' + c.title);
  console.log('      证据: ' + String(c.evidence).slice(0, 100));
  console.log('      可修: ' + (c.fixable ? '是' : '需人工判断'));
}
console.log('');
console.log('  报告：distribution/03_验证与基准/cognition-auto.json');
console.log('');
console.log('  下一步：');
console.log('    · 逐条确认后，用 cognition_log.mjs --record 入账（四要素齐全）');
console.log('    · 或跑 node tools/cognition_auto.mjs --promote 自动入账高置信度项');
console.log('');

/* ══════════════════════════════════════════════════════════════
 * --promote  自动入账（只入 critical + high 且有明确证据的）
 * ══════════════════════════════════════════════════════════════ */
if (has('--promote')) {
  const promotable = candidates.filter((c) => (c.severity === 'critical' || c.severity === 'high') && c.fixable && c.evidence);
  console.log('  ── 自动入账（' + promotable.length + ' 条 high/critical）──');
  let ok = 0;
  for (const c of promotable) {
    try {
      execFileSync(process.execPath, [
        join(ROOT, 'tools', 'cognition_log.mjs'), '--record',
        '--wrong', '系统自洽性未检查：' + c.kind + ' 类别存在缺口（' + c.title + '）',
        '--now', '自动发现器检出：' + c.title + '。证据：' + String(c.evidence).slice(0, 120),
        '--evidence', 'tools/cognition_auto.mjs 自动扫描（' + c.kind + ' 类）',
        '--impact', 'L2',
      ], { cwd: ROOT, stdio: 'ignore', windowsHide: true, timeout: 120000 });
      ok += 1;
    } catch { }
  }
  console.log('  ✅ 已入账 ' + ok + '/' + promotable.length + ' 条');
  console.log('');
}
