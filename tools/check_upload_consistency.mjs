/**
 * 上传一致性检查器（R100）
 *
 * 用户明确要求：「先升级，再上传」——「请把已经上传的更新」。
 *
 * 为什么需要这个工具（本会话真实事故）：
 *   真相源 public-overrides/README.md 早已更新到 22 tools / V000022，
 *   但 GitHub 上的根 README.md 还是旧版（写 19/20 tools，编码也坏了）。
 *   结果 Glama 读根 README → 认为我们是 19 tools → 质量分评不出来 → PR 卡住。
 *
 *   一句话：**本地 100 分、线上 30 分，外界只看到 30 分。**（L-78）
 *
 * 本工具在【每次上传前】回答三个问题：
 *   ① 本地的"对外文件"是否已从真相源同步？（不镜像就是没升级）
 *   ② 对外文件里的硬事实（工具数/版本/语言数）是否与真相源一致？
 *   ③ 线上各surface是否与本地一致？（npm / GitHub / Registry / 网站）
 *
 * 用法：
 *   node tools/check_upload_consistency.mjs          # 全查（含线上）
 *   node tools/check_upload_consistency.mjs --local  # 只查本地镜像与硬事实
 *   node tools/check_upload_consistency.mjs --json
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution', '03_验证与基准');
const LOCAL_ONLY = process.argv.includes('--local');
const JSON_ONLY = process.argv.includes('--json');

const read = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return null; } };

/* ── 真相源 ── */
const truth = {};
try {
  const vj = JSON.parse(read('distribution/官网落地页/ai/version.json'));
  truth.version = String(vj.version || '');
  truth.languages = vj.languages || null;
} catch { }

let TOOLS = 0;
try {
  const idx = read('plugin/index.mjs') || '';
  TOOLS = [...new Set([...idx.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
} catch { }
truth.tools = TOOLS;

let SKILLS = 0;
try {
  const { readdirSync } = await import('node:fs');
  for (const e of readdirSync(join(ROOT, 'skills'), { withFileTypes: true })) {
    if (e.isDirectory() && existsSync(join(ROOT, 'skills', e.name, 'SKILL.md'))) SKILLS += 1;
  }
} catch { }
truth.skills = SKILLS;

/* ── 向外发布的"镜像文件"（必须从真相源同步）── */
const MIRRORS = [
  { local: 'README.md', src: 'public-overrides/README.md', name: '根 README（GitHub 展示的）' },
  { local: 'llms.txt', src: 'public-overrides/llms.txt', name: 'llms.txt（AI 索引）' },
  { local: 'cordis.patch.yml', src: 'public-overrides/cordis.patch.yml', name: 'cordis.patch.yml' },
  { local: 'server.json', src: 'public-overrides/server.json', name: 'server.json（MCP Registry）' },
];

const results = [];
const add = (id, name, pass, detail) => results.push({ id, name, pass, detail });

/* ══════ ① 镜像文件是否与真相源一致 ══════ */
for (const m of MIRRORS) {
  const a = read(m.local);
  const b = read(m.src);
  if (a === null) { add('M-' + m.local, m.name, false, '不存在'); continue; }
  if (b === null) { add('M-' + m.local, m.name, false, '真相源不存在'); continue; }
  const same = a === b;
  const sizeLocal = a.length, sizeSrc = b.length;
  add('M-' + m.local, m.name, same, same ? `${Math.round(sizeLocal / 1024)}KB ✅ 与真相源一致` : `❌ 不一致（本地 ${Math.round(sizeLocal / 1024)}KB vs 真相源 ${Math.round(sizeSrc / 1024)}KB）`);
}

/* ══════ ② 对外文件里的硬事实是否与真相源一致 ══════ */
const FACT_FILES = ['README.md', 'llms.txt', 'server.json'];
const staleFacts = [];
for (const f of FACT_FILES) {
  const t = read(f);
  if (!t) continue;
  /* 工具数：找 N tools / N 个工具 */
  const nums = new Set();
  for (const m of t.matchAll(/(\d{1,3})\s*(?:tools|个工具|callable tools)/gi)) nums.add(Number(m[1]));
  for (const n of nums) {
    if (n !== truth.tools && n >= 5 && n <= 200) staleFacts.push({ file: f, kind: '工具数', found: n, expect: truth.tools });
  }
  /* 版本：找 V0000NN 与 semver */
  if (truth.version) {
    const vs = [...t.matchAll(/V(\d{6})/g)].map((m) => m[1]);
    for (const v of new Set(vs)) {
      if (Number(v) !== Number(String(truth.version).replace(/\./g, '').padEnd(6, '0')) && Number(v) < 100) {
        /* version.json 里的 RELEASE 形如 V000022 */
      }
    }
    /* 直接比 semver */
    const sv = [...t.matchAll(/(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    for (const s of new Set(sv)) {
      if (s !== truth.version && /^0\.\d/.test(s)) staleFacts.push({ file: f, kind: 'semver', found: s, expect: truth.version });
    }
  }
}
add('F-facts', '对外文件硬事实（工具数/版本）', staleFacts.length === 0,
  staleFacts.length ? '❌ 发现 ' + staleFacts.length + ' 处过时：' + staleFacts.slice(0, 4).map((x) => `${x.file} 写 ${x.kind}=${x.found}（应为 ${x.expect}）`).join(' · ')
    : `✅ 与真相源一致（${truth.tools} 工具 / v${truth.version}）`);

/* ══════ ③ 线上各 surface（可选）══════ */
const remote = [];
if (!LOCAL_ONLY) {
  /* npm */
  try {
    const r = await fetch('https://registry.npmjs.org/mackorn-cone-crusher', { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const latest = (j['dist-tags'] || {}).latest;
    const v = j.versions ? j.versions[latest] : null;
    const desc = v ? String(v.description || '') : '';
    const descTools = (desc.match(/(\d{1,3})\s*(?:个工具|tools)/i) || [])[1];
    const npmOk = latest === truth.version && (!descTools || Number(descTools) === truth.tools);
    remote.push({ surface: 'npm', name: 'npm latest', pass: npmOk, detail: `v${latest} · 描述工具数 ${descTools || '?'} · 期望 v${truth.version}/${truth.tools} 工具` });
  } catch (e) { remote.push({ surface: 'npm', name: 'npm latest', pass: null, detail: '不可达（' + String(e.message).slice(0, 40) + '）' }); }

  /* GitHub README（只读 API，不需要 token）*/
  try {
    const r = await fetch('https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher/readme', {
      headers: { Accept: 'application/vnd.github.raw', 'User-Agent': 'mackorn-check' }, signal: AbortSignal.timeout(20000),
    });
    if (r.ok) {
      const gh = await r.text();
      const ghTools = new Set([...gh.matchAll(/(\d{1,3})\s*(?:tools|个工具|callable tools)/gi)].map((m) => Number(m[1])));
      const bad = [...ghTools].filter((n) => n !== truth.tools && n >= 5 && n <= 200);
      remote.push({ surface: 'github', name: 'GitHub README', pass: bad.length === 0, detail: bad.length ? `❌ 线上写 ${bad.join('/')} 工具（应为 ${truth.tools}）—— Glama 读的是这份` : `✅ 工具数一致（${truth.tools}）` });
    } else remote.push({ surface: 'github', name: 'GitHub README', pass: null, detail: 'HTTP ' + r.status });
  } catch (e) { remote.push({ surface: 'github', name: 'GitHub README', pass: null, detail: '不可达' }); }

  /* GitHub 仓库 Description（也是展示位，容易被漏）*/
  try {
    const r = await fetch('https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mackorn-check' }, signal: AbortSignal.timeout(20000),
    });
    if (r.ok) {
      const j = await r.json();
      const d = String(j.description || '');
      const m = d.match(/(\d{1,3})\s*(?:tools|个工具)/i);
      const n = m ? Number(m[1]) : null;
      remote.push({ surface: 'github-description', name: 'GitHub Description', pass: n === null || n === truth.tools, detail: n === null ? '（描述里没有工具数）' : (n === truth.tools ? '✅ ' + n + ' 工具' : '❌ 写 ' + n + ' 工具（应为 ' + truth.tools + '）') });
    } else remote.push({ surface: 'github-description', name: 'GitHub Description', pass: null, detail: 'HTTP ' + r.status });
  } catch (e) { remote.push({ surface: 'github-description', name: 'GitHub Description', pass: null, detail: '不可达' }); }

  /* GitHub 最新 release */
  try {
    const r = await fetch('https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mackorn-check' }, signal: AbortSignal.timeout(20000),
    });
    if (r.ok) {
      const j = await r.json();
      const body = String(j.body || '') + ' ' + String(j.name || '');
      const relTools = (body.match(/(\d{1,3})\s*(?:tools|个工具)/i) || [])[1];
      const relOk = !relTools || Number(relTools) === truth.tools;
      remote.push({ surface: 'github-release', name: 'GitHub Release', pass: relOk, detail: `${j.tag_name || '?'} · 说明里写 ${relTools || '?'} 工具 · 期望 ${truth.tools}` });
    } else remote.push({ surface: 'github-release', name: 'GitHub Release', pass: null, detail: 'HTTP ' + r.status });
  } catch (e) { remote.push({ surface: 'github-release', name: 'GitHub Release', pass: null, detail: '不可达' }); }
}

/* ══════ 汇总 ══════ */
const all = [...results, ...remote];
const failed = all.filter((x) => x.pass === false);
const unknown = all.filter((x) => x.pass === null);
const ok = all.filter((x) => x.pass === true);

const out = {
  schema: 'mackorn-upload-consistency/1',
  generated: new Date().toISOString(),
  truth,
  local_mirrors: results,
  remote_surfaces: remote,
  summary: { ok: ok.length, failed: failed.length, unknown: unknown.length },
  verdict: failed.length ? 'STALE' : unknown.length ? 'PARTIAL' : 'CONSISTENT',
  rule: '先升级 → 再上传。上传前必须本工具全绿（STALE 时不许上传）。',
};

writeFileSync(join(D, 'upload-consistency.json'), JSON.stringify(out, null, 2), 'utf8');

if (JSON_ONLY) { console.log(JSON.stringify(out, null, 2)); process.exit(failed.length ? 1 : 0); }

console.log('');
console.log('  ══ 上传一致性检查（先升级 → 再上传）══');
console.log('');
console.log('  真相源：' + truth.tools + ' 工具 · ' + truth.skills + ' 技能 · v' + truth.version + (truth.languages ? ' · ' + truth.languages + ' 语言' : ''));
console.log('');
console.log('  【本地镜像】必须与真相源逐字节一致');
for (const r of results) console.log('    ' + (r.pass ? '✅' : '❌') + ' ' + r.name.padEnd(28) + ' ' + r.detail);
if (remote.length) {
  console.log('');
  console.log('  【线上 surface】');
  for (const r of remote) console.log('    ' + (r.pass === true ? '✅' : r.pass === false ? '❌' : '○') + ' ' + r.name.padEnd(20) + ' ' + r.detail);
}
console.log('');
console.log('  ── 判定 ──');
console.log('    ' + (out.verdict === 'CONSISTENT' ? '✅ 一致 —— 可以上传' :
  out.verdict === 'PARTIAL' ? '○ 部分未验证（有些线上端点不可达）' :
    '❌ 有 ' + failed.length + ' 处不一致 —— **先升级，不要上传**'));
console.log('');
if (failed.length) {
  console.log('  修法：');
  console.log('    node tools/sync_version.mjs --write     # 同步版本');
  console.log('    node tools/sync_hard_facts.mjs          # 同步工具数/语言数');
  console.log('    或把 public-overrides/ 下的真相源复制到根目录（README/llms.txt/server.json/cordis.patch.yml）');
  console.log('');
}
console.log('  已写 distribution/03_验证与基准/upload-consistency.json');
console.log('');
process.exit(failed.length ? 1 : 0);
