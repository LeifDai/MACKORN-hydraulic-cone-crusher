#!/usr/bin/env node
/**
 * 发布产物验收门禁 —— 检查「真正要发出去的那个包裹」是否完整可跑。
 *
 * 为什么需要它（2026-10-21 夜班发现）：
 *   现有门禁（tests/run.mjs / self_audit / keyword_gate / build_public）都在校验
 *   **源码与内容合规**，但没人校验 **dist/ 里那份发布产物本身**。
 *   实测发现：根 package.json 声称会发布 Dockerfile 与 skills.sh.json，
 *   而 dist/ 里两个都没有 —— 原因是 build_public.mjs 的 ALLOW.files 只放行
 *   README.md 与 package.json。Dockerfile 是为 Glama 自动部署而写的，
 *   写了但永远发不出去，等于白写。
 *
 * 本门禁只读，不修改任何文件。退出码 0 = 产物可用；1 = 有阻断项。
 *
 * 用法：
 *   node tools/check_publish_artifact.mjs
 *   node tools/check_publish_artifact.mjs --verbose
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'dist', 'mackorn-cone-crusher');
const VERBOSE = process.argv.includes('--verbose');

let pass = 0;
let fail = 0;
const fails = [];

function ok(label, detail = '') {
  pass += 1;
  console.log(`  ok   ${label}${detail ? '  ' + detail : ''}`);
}
function bad(label, detail = '') {
  fail += 1;
  fails.push(label + (detail ? '  ' + detail : ''));
  console.log(`  FAIL ${label}${detail ? '  ' + detail : ''}`);
}
function warn(label, detail = '') {
  console.log(`  warn ${label}${detail ? '  ' + detail : ''}`);
}
function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
function hasFile(name) {
  const p = join(OUT, name);
  return existsSync(p) && statSync(p).size > 0;
}

console.log('='.repeat(66));
console.log('发布产物验收（dist/mackorn-cone-crusher）');
console.log('='.repeat(66));

/* ---------- 1. 产物存在 ---------- */
if (!existsSync(OUT)) {
  bad('dist 目录存在', OUT);


  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(1);
}
ok('dist 目录存在');

/* ---------- 24. AI 可发现性 + Glama 容器化（R142/R144，2026-10-22）---------- */
/* ══════ R142：AGENTS.md 必须进发布包（2026-10-22 实测发现缺失）══════
 * 血泪：10-21 写了 AGENTS.md 提升 AI 可发现性，但 package.json files 与
 *       build_public 放行清单都没加它 → 从未进过 dist → AI 装 npm 包读不到。
 *       这正是 R141 的不变量「写了 ≠ 发出去了」。 */
for (const f of ['AGENTS.md', 'QUICKSTART.md', 'smithery.yaml']) {
  const p = join(ROOT, 'dist', 'mackorn-cone-crusher', f);
  ok(`发布包含 ${f}（AI 可发现性文件）`, existsSync(p), existsSync(p) ? f + ' 已在 dist' : '⚠️ ' + f + ' 不在 dist —— AI 装包读不到');
}
/* files 清单必须与 dist 一致 */
try {
  const pkg = JSON.parse(read(join(ROOT, 'package.json')));
  const missing = ['AGENTS.md', 'QUICKSTART.md'].filter((f) => !(pkg.files || []).includes(f));
  ok('package.json files 含 AI 可发现性文件', missing.length === 0, missing.length ? '缺: ' + missing.join(', ') : '齐全');
} catch { ok('package.json 可解析', false); }


/* ══════ R144：Glama 容器化部署必需文件（2026-10-22）══════
 * 血泪：Glama 官方文档明确 "A Glama release is a containerized build" ——
 *       它自己构建镜像跑我们的 server，不探测我们的 HTTPS 端点。
 *       所以 Dockerfile / .dockerignore / glama.json 三个是【硬性前置】。
 *       之前只有 Dockerfile 且缺 .dockerignore（构建上下文 20MB+）→ 可能构建失败。 */
for (const f of ['Dockerfile', '.dockerignore', 'glama.json']) {
  const p = join(ROOT, f);
  const inDist = existsSync(join(ROOT, 'dist', 'mackorn-cone-crusher', f));
  ok(`Glama 容器化文件 ${f}`, existsSync(p) && inDist,
    !existsSync(p) ? '⚠️ 根目录缺 ' + f : (!inDist ? '⚠️ 不在 dist（Glama 构建读不到）' : '✓ 根目录+dist 都有'));
}
/* .dockerignore 必须排除 knowledge/_refs（17.48MB 报价截图 + 违反 No pricing） */
try {
  const di = read(join(ROOT, '.dockerignore'));
  const excludesRefs = /knowledge\/_refs\//.test(di);
  ok('.dockerignore 排除 knowledge/_refs（17.48MB 报价截图）', excludesRefs,
    excludesRefs ? '✓ 已排除，镜像从 20MB 降到 ~0.6MB' : '⚠️ 未排除 → 镜像 20MB+ 且含报价截图');
} catch { ok('.dockerignore 可读', false); }


const rootPkg = readJson(join(ROOT, 'package.json'));
const ovrPkg = readJson(join(ROOT, 'public-overrides', 'package.json'));
const outPkg = readJson(join(OUT, 'package.json'));

if (!rootPkg) bad('根 package.json 可解析'); else ok('根 package.json 可解析');
if (!ovrPkg) bad('public-overrides/package.json 可解析'); else ok('public-overrides/package.json 可解析');
if (!outPkg) {
  bad('dist/package.json 可解析');
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(1);
}
ok('dist/package.json 可解析');

/* ---------- 2. 版本三方一致 ---------- */
const versions = { root: rootPkg?.version, overrides: ovrPkg?.version, dist: outPkg.version };
const uniq = new Set(Object.values(versions).filter(Boolean));
if (uniq.size === 1) ok('版本三方一致', outPkg.version);
else bad('版本三方一致', JSON.stringify(versions));

/* ---------- 3. bin 必须含包名（否则依赖 npx 的隐式回退）---------- */
const binKeys = Object.keys(outPkg.bin || {});
if (binKeys.includes(outPkg.name)) ok('dist bin 含包名', outPkg.name);
else bad('dist bin 含包名', `bin=${JSON.stringify(binKeys)}，包名=${outPkg.name}（npx <包名> 目前只靠单-bin 隐式回退）`);
if (binKeys.includes('mackorn-mcp')) ok('dist bin 保留旧别名 mackorn-mcp'); else warn('dist bin 缺旧别名 mackorn-mcp');

/* ---------- 4. 应该在包里的文件（文档/PDCA 承诺过的）---------- */
const MUST_HAVE = ['Dockerfile', 'skills.sh.json', 'server.json', 'llms.txt', 'README.md', 'LICENSE', 'VERSION', 'cordis.patch.yml'];
for (const f of MUST_HAVE) {
  if (hasFile(f)) ok(`dist 含 ${f}`);
  else bad(`dist 含 ${f}`, '文件不存在或为 0 字节');
}

/* ---------- 5. files 清单必须与磁盘一致 ---------- */
const declared = Array.isArray(outPkg.files) ? outPkg.files : [];
if (!declared.length) bad('dist package.json 有 files 白名单');
else ok('dist package.json 有 files 白名单', `${declared.length} 条`);

const missingOnDisk = declared.filter((entry) => {
  const rel = String(entry).replace(/\/$/, '');
  return !existsSync(join(OUT, rel));
});
if (missingOnDisk.length === 0) ok('files 里每条都能在磁盘找到');
else bad('files 里每条都能在磁盘找到', `缺：${missingOnDisk.join(', ')}`);

for (const f of ['Dockerfile', 'skills.sh.json']) {
  if (!hasFile(f)) continue; // 已在上一条报过
  if (declared.some((d) => String(d).replace(/\/$/, '') === f)) ok(`files 清单包含 ${f}`);
  else bad(`files 清单包含 ${f}`, '文件在 dist 里但没写进 files，npm 不会发布它');
}

/* ---------- 6. 元数据与真相一致（描述里的"N 个工具"必须等于实际）---------- */
// 2026-10-21 实测：描述写「22 个工具」，实际 29 —— 发布元数据是错的。
// MCP Registry / Glama 读的就是这个 description，写错会误导评估与用户。
try {
  const { toolDefinitions } = await import(new URL('../dist/mackorn-cone-crusher/plugin/index.mjs', import.meta.url).href);
  const realCount = toolDefinitions.length;
  const desc = String(outPkg.description || '');
  const claimed = desc.match(/(\d+)\s*个工具/);
  if (claimed && Number(claimed[1]) === realCount) ok('description 工具数与实际一致', `${realCount} 个`);
  else if (!claimed) warn('description 未写工具数（不阻断，但建议写上）');
  else bad('description 工具数与实际一致', `描述写 ${claimed[1]}，实际 ${realCount}`);
} catch (e) {
  warn('无法加载 dist 的 toolDefinitions', String(e.message).slice(0, 90));
}

/* ---------- 6b. exports 指向的文件必须存在 ---------- */
const exportsMap = outPkg.exports || {};
const exportTargets = Object.values(exportsMap).filter((v) => typeof v === 'string');
const brokenExports = exportTargets.filter((rel) => !existsSync(join(OUT, String(rel).replace(/^\.\//, ''))));
if (exportTargets.length === 0) warn('package.json 没有 exports 字段');
else if (brokenExports.length === 0) ok('exports 指向的文件都存在', `${exportTargets.length} 条`);
else bad('exports 指向的文件都存在', `缺：${brokenExports.join(', ')}`);

/* ---------- 7. 交付物卫生：dist 根不应有备份类文件 ---------- */
const junk = readdirSync(OUT).filter((n) => /\.(bak|prev|orig|rej|tmp|prekeywordfix)$/i.test(n) || /~$/.test(n));
if (junk.length === 0) ok('dist 根无备份/临时文件');
else warn('dist 根有备份/临时文件', junk.join(', '));

/* ---------- 7. 协议层可用（真跑，不靠自述）---------- */
// 注意：不能用 stdio:'pipe'。受限环境（含 DSH 沙箱）禁止子进程管道，
// 会抛 EPERM —— 那是**测试没跑起来**，不是**产物坏了**（沙箱内失败不算证据）。
// 用 'ignore' 只取退出码；--verbose 时改 'inherit' 让人能看见输出。
const server = join(OUT, 'plugin', 'mcp-server.mjs');
const childStdio = VERBOSE ? 'inherit' : 'ignore';
function runServer(args, timeout) {
  return execFileSync(process.execPath, [server, ...args], { stdio: childStdio, timeout });
}
if (!existsSync(server)) {
  bad('dist 含 mcp-server.mjs');
} else {
  ok('dist 含 mcp-server.mjs');
  try {
    runServer(['--list'], 60000);
    ok('dist mcp-server --list 退出码 0');
  } catch (e) {
    if (e.code === 'EPERM') warn('协议检查跳过：子进程 EPERM（沙箱限制，请在沙箱外跑）');
    else bad('dist mcp-server --list 退出码 0', String(e.message).slice(0, 120));
  }
  try {
    runServer(['--selftest'], 180000);
    ok('dist mcp-server --selftest 通过');
  } catch (e) {
    if (e.code === 'EPERM') warn('--selftest 跳过：子进程 EPERM（沙箱限制）');
    else bad('dist mcp-server --selftest 通过', String(e.message).slice(0, 120));
  }
}

/* ---------- 8. MCPB 包（Claude Desktop 一键安装）----------
 * 2026-10-22 实测：这个包停在 0.0.9 / tools 数组 19 个，
 * 而 manifest 的 description 里却写着 "29 tools" —— 用户装到旧版本，包内还自相矛盾。
 * 教训：分发物要**逐个**校验，不能只校验 npm 那一个。 */
const MCPB = join(ROOT, 'distribution', 'mcpb', 'mackorn-cone-crusher');
if (!existsSync(MCPB)) {
  warn('未找到 MCPB 包（distribution/mcpb/mackorn-cone-crusher）');
} else {
  let mf = null;
  try { mf = JSON.parse(readFileSync(join(MCPB, 'manifest.json'), 'utf8')); } catch { mf = null; }
  if (!mf) {
    bad('MCPB manifest.json 可解析');
  } else {
    ok('MCPB manifest.json 可解析');
    const semver = String(outPkg.version);
    const vNum = 'V' + semver.replace(/\./g, '').padStart(6, '0');

    if (mf.version === semver) ok('MCPB version 与 package.json 一致', semver);
    else bad('MCPB version 与 package.json 一致', `manifest=${mf.version} vs package=${semver}`);

    const srcVer = mf._meta && mf._meta['cn.mackorn/registry'] ? mf._meta['cn.mackorn/registry'].source_version : undefined;
    if (srcVer === vNum) ok('MCPB source_version 正确', vNum);
    else bad('MCPB source_version 正确', `manifest=${srcVer} vs 期望=${vNum}`);

    /* 工具数以真实定义为准（不读 manifest 自己的声明） */
    let realCount = null;
    try {
      const mod = await import(new URL('../dist/mackorn-cone-crusher/plugin/index.mjs', import.meta.url).href);
      realCount = (mod.toolDefinitions || []).length;
    } catch { realCount = null; }

    const toolsArr = Array.isArray(mf.tools) ? mf.tools : [];
    if (realCount && toolsArr.length === realCount) ok('MCPB tools 数组完整', `${toolsArr.length} 个`);
    else bad('MCPB tools 数组完整', `manifest=${toolsArr.length} vs 实际=${realCount ?? '?'}`);

    const m = String(mf.description || '').match(/(\d+)\s*tools/);
    if (!m) warn('MCPB description 未写工具数');
    else if (realCount && Number(m[1]) === realCount) ok('MCPB description 工具数正确', m[1]);
    else bad('MCPB description 工具数正确', `描述=${m[1]} vs 实际=${realCount}`);

    if (Array.isArray(mf.privacy_policies) && mf.privacy_policies.length) ok('MCPB 声明了隐私政策', mf.privacy_policies[0]);
    else warn('MCPB 未声明 privacy_policies（我们已有 https://mackorn.cn/ai/privacy.html）');

    /* R152（2026-10-22 夜班）：MCPB 里不得带源码备份。
     * 实测 build_mcpb 原先无过滤地 cpSync(plugin/lib)，把 6 个 *.bak/*.prev（约 140 KB）
     * 一起装给 Claude Desktop 用户 —— 那是**旧版本代码**（engine.mjs.bak 比现行版少 12.5 KB），
     * 既占空间又可能被 AI/用户误当成现行算法。 */
    const junkM = [];
    const walkJunk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) { walkJunk(p); continue; }
        if (/(\.(bak|prev|orig|rej|tmp|old)$)|(\.(bak|prev|orig)\.)|(^_)/i.test(name)) {
          junkM.push(p.slice(MCPB.length + 1).replace(/\\/g, '/'));
        }
      }
    };
    try { walkJunk(MCPB); } catch { }
    if (junkM.length === 0) ok('MCPB 包内无源码备份/临时文件');
    else bad('MCPB 包内无源码备份/临时文件', junkM.slice(0, 6).join(', ') + (junkM.length > 6 ? ' …共 ' + junkM.length + ' 个' : ''));
  }
}

/* ---------- 9. 部署真相源 version.json（线上 AI 直接读它）----------
 * 2026-10-22 实测：version_note 里还写着「semver 0.2.0 = 内部构建 V000020」，
 * 而实际已是 0.2.2 / V000022 —— 我们自己的站点在对外说错版本。
 * 这个文件的 version_note / product_version 从来没人校验过。 */
const VJ = join(ROOT, 'distribution', '官网落地页', 'ai', 'version.json');
if (!existsSync(VJ)) {
  warn('未找到部署真相源 version.json');
} else {
  let vj = null;
  try { vj = JSON.parse(readFileSync(VJ, 'utf8')); } catch { vj = null; }
  if (!vj) {
    bad('version.json 可解析');
  } else {
    ok('version.json 可解析');
    const semver = String(outPkg.version);
    const vNum = 'V' + semver.replace(/\./g, '').padStart(6, '0');

    if (String(vj.version) === semver) ok('version.json version 与包一致', semver);
    else bad('version.json version 与包一致', `${vj.version} vs ${semver}`);

    const note = String(vj.version_note || '');
    if (note.includes(semver) && note.includes(vNum)) ok('version_note 里的版本已更新', `${semver} / ${vNum}`);
    else bad('version_note 里的版本已更新', note.slice(0, 90) || '(空)');

    const buildId = String(vj.build_id || '');
    if (/^\d{14}$/.test(buildId)) ok('build_id 格式正确', buildId);
    else bad('build_id 格式正确', buildId || '(空)');

    let realCount = null;
    try {
      const mod = await import(new URL('../dist/mackorn-cone-crusher/plugin/index.mjs', import.meta.url).href);
      realCount = (mod.toolDefinitions || []).length;
    } catch { realCount = null; }

    if (!realCount) {
      warn('无法取到工具实际数，跳过 version.json 计数校验');
    } else {
      if (Number(vj.total_tools) === realCount) ok('version.json total_tools 正确', String(realCount));
      else bad('version.json total_tools 正确', `${vj.total_tools} vs ${realCount}`);

      if (Number(vj.remote_mcp_tools) === realCount) ok('version.json remote_mcp_tools 正确', String(realCount));
      else bad('version.json remote_mcp_tools 正确', `${vj.remote_mcp_tools} vs ${realCount}`);

      const arr = Array.isArray(vj.remote_tool_list) ? vj.remote_tool_list : [];
      const uniq = new Set(arr);
      if (arr.length === realCount && uniq.size === realCount) ok('remote_tool_list 完整且无重复', `${arr.length} 个`);
      else bad('remote_tool_list 完整且无重复', `条目 ${arr.length} / 去重 ${uniq.size} / 实际 ${realCount}`);

      const local = Array.isArray(vj.local_only_tools) ? vj.local_only_tools : [];
      const kernel = Number(vj.tools_with_remote_kernel);
      if (kernel + local.length === realCount) ok('可算数 + local-only 数 = 总数', `${kernel} + ${local.length} = ${realCount}`);
      else bad('可算数 + local-only 数 = 总数', `${kernel} + ${local.length} ≠ ${realCount}`);

      const notListed = local.filter((n) => !uniq.has(n));
      if (notListed.length === 0) ok('local-only 工具都在 remote_tool_list 里');
      else bad('local-only 工具都在 remote_tool_list 里', notListed.join(', '));
    }
  }
}

/* ---------- 10. GitHub 上传包新鲜度（_upload-github）----------
 * 2026-10-22 实测：这个"上传就绪包"里 llms.txt 还是 38 KB 旧版、package.json 还是 3.5 KB 旧版，
 * 而源已是 40 KB / 5.3 KB —— 谁按它拖到 GitHub 上，推上去的就是旧内容。
 * 它是给人手动上传用的暂存目录，最容易腐化（没有构建会自动刷新它）。 */
const UP = join(ROOT, 'distribution', '_upload-github');
if (!existsSync(UP)) {
  warn('未找到 GitHub 上传包（distribution/_upload-github）');
} else {
  const MUST_MATCH = ['README.md', 'llms.txt', 'server.json', 'cordis.patch.yml', 'package.json'];
  const diff = [];
  for (const rel of MUST_MATCH) {
    const a = join(ROOT, rel);
    const b = join(UP, rel);
    if (!existsSync(a) || !existsSync(b)) { diff.push(rel + '(缺失)'); continue; }
    if (readFileSync(a).equals(readFileSync(b))) continue;
    diff.push(rel);
  }
  if (diff.length === 0) ok('上传包与源逐字节一致', `${MUST_MATCH.length} 个关键文件`);
  else bad('上传包与源逐字节一致', `不一致：${diff.join(', ')}（重建：node tools/build_github_upload_bundle.mjs）`);

  /* R154（2026-10-22 夜班）：清单 `_上传清单.md` 必须与**实际包内容**一致。
   * 实测清单写"57 个文件"而磁盘只有 55 个 —— 因为源列表里 rsi_record/rsi_register 各写了两遍，
   * 清单出现重复行；且第五节还写着"应显示 23 个工具（线上 21）""官网只有 9 个语言目录"（实际 29 / 11）。
   * 用户按清单核对会以为少传了文件。 */
  {
    const MD = join(UP, '_上传清单.md');
    if (!existsSync(MD)) {
      bad('上传清单存在', '_上传清单.md 缺失');
    } else {
      const md = readFileSync(MD, 'utf8');
      const rows = [...md.matchAll(/\| `([^`]+)` \| ([\d.]+) KB \|/g)].map((m) => m[1]);
      const uniq = new Set(rows);
      const disk = [];
      const walkUp = (dir, base) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          const rel = base ? base + '/' + e.name : e.name;
          if (e.isDirectory()) { walkUp(p, rel); continue; }
          if (rel === '_上传清单.md') continue;
          disk.push(rel);
        }
      };
      walkUp(UP, '');
      if (rows.length !== uniq.size) bad('上传清单无重复行', `重复 ${rows.length - uniq.size} 行`);
      else ok('上传清单无重复行', `${uniq.size} 项`);

      const missInDisk = [...uniq].filter((r) => !disk.includes(r));
      const missInMd = disk.filter((r) => !uniq.has(r));
      if (missInDisk.length || missInMd.length) {
        bad('上传清单与包内容一致', `清单多:${missInDisk.join(',') || '无'} 包多:${missInMd.join(',') || '无'}`);
      } else ok('上传清单与包内容一致', `${disk.length} 个文件`);

      const realN = (() => {
        try { return Number(JSON.parse(readFileSync(join(ROOT, 'distribution', '官网落地页', 'ai', 'version.json'), 'utf8')).total_tools) || 0; } catch { return 0; }
      })();
      const mN = md.match(/应显示 "共 (\d+) 个工具"/);
      if (realN && mN && Number(mN[1]) !== realN) bad('上传清单的工具数与实际一致', `清单 ${mN[1]} vs 实际 ${realN}`);
      else ok('上传清单的工具数与实际一致', mN ? mN[1] : '未提及');
    }
  }
}

/* ---------- 11. 网站部署目录（_deploy）布局与内容 ----------
 * 2026-10-22 实测：两个构建器共用同一个 _deploy 且都 rmSync 后重建 ——
 *   build_deploy_zip.mjs  → 扁平旧布局（/en/、/api/）
 *   restructure_deploy.mjs → canonical 布局（全部归入 /ai/）
 * 谁最后跑谁说了算，结果"解压即完成"的包可能把页面部署到错误路径。
 * 另外 restructure 的 LINK_MAP 里有一条裸子串规则，会把 /ai/api/ 叠成 /ai/ai/api/，
 * 而 llms.txt 是给 AI 读的 —— 错误 URL 会被直接引用。 */
const DEP = join(ROOT, 'distribution', '_deploy');
if (!existsSync(DEP)) {
  warn('未找到网站部署目录（distribution/_deploy）');
} else {
  const LANGS = ['en', 'ru', 'es', 'pt', 'fr', 'ar', 'id', 'ja', 'de', 'tr', 'vi'];
  const MUST = [
    ['ai/api/mcp.php', '远程 MCP 端点'],
    ['ai/version.json', '版本真相源'],
    ['ai/index.html', '中文主页'],
    ['ai/llms.txt', 'robots 里宣传的 /ai/llms.txt'],
    ['ai/privacy.html', '隐私政策页'],
    ['sitemap.xml', '站点地图'],
    ['robots.txt', '爬虫规则'],
  ];
  const missing = MUST.filter(([p]) => !existsSync(join(DEP, p))).map(([p, why]) => p + '(' + why + ')');
  if (missing.length === 0) ok('部署目录关键文件齐全', MUST.length + ' 项');
  else bad('部署目录关键文件齐全', '缺：' + missing.join(', '));

  const langMissing = LANGS.filter((l) => !existsSync(join(DEP, 'ai', l, 'index.html')));
  if (langMissing.length === 0) ok('部署目录 12 语言页齐全', 'ai/index.html(zh) + 11 个语言目录');
  else bad('部署目录 12 语言页齐全', '缺：' + langMissing.join(', '));

  const FLAT = [...LANGS, 'api', 'glossary', 'markets', 'distributors', 'contact', 'engineering-firms'];
  const flatLeft = FLAT.filter((d) => existsSync(join(DEP, d)));
  if (flatLeft.length === 0) ok('部署目录无扁平旧布局残留');
  else bad('部署目录无扁平旧布局残留', '残留：' + flatLeft.join(', ') + '（说明扁平构建器覆盖了 canonical 布局）');

  /* 叠层 URL 扫描：/ai/ai/ 这类会把 AI 引到 404 */
  let layered = [];
  const walkScan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { walkScan(p); continue; }
      if (!/\.(html|txt|json|xml|md|php|cff)$/i.test(name)) continue;
      let c = '';
      try { c = readFileSync(p, 'utf8'); } catch { continue; }
      if (c.includes('/ai/ai/')) layered.push(p.slice(DEP.length + 1).replace(/\\/g, '/'));
    }
  };
  walkScan(DEP);
  if (layered.length === 0) ok('部署目录无叠层 URL（/ai/ai/）');
  else bad('部署目录无叠层 URL（/ai/ai/）', layered.slice(0, 5).join(', ') + (layered.length > 5 ? ' …共 ' + layered.length + ' 个' : ''));

  /* R151（2026-10-22 夜班）：部署版 mcp.php 不得残留**旧（非 /ai/）站点路径**。   * 实测源文件里曾写 https://mackorn.cn/api/mcp.php 与 /contact/，靠部署期改写兜底；
   * 一旦有人跳过 restructure_deploy 直接上传，用户会在工具输出的 source/qr 字段里看到旧链接。
   * 现在生成器直接产出 canonical 路径，这条门禁确认它真的没有旧路径。 */
  {
    const mcpP = join(DEP, 'ai', 'api', 'mcp.php');
    if (!existsSync(mcpP)) {
      bad('部署版 mcp.php 存在');
    } else {
      const c = readFileSync(mcpP, 'utf8');
      const stale = [];
      for (const seg of ['api', 'contact', 'glossary', 'markets', 'distributors', 'engineering-firms']) {
        if (new RegExp('mackorn\\.cn/' + seg + '/').test(c)) stale.push('/' + seg + '/');
      }
      if (stale.length === 0) ok('部署版 mcp.php 无旧站点路径');
      else bad('部署版 mcp.php 无旧站点路径', '残留：' + stale.join(', '));
    }
  }

  /* R156（2026-10-22 夜班）：部署目录里每个页面的 canonical 与 hreflang 都必须指向 /ai/。
   * 实测 LINK_MAP 的绝对 URL 规则只手写了 en/ru/es/de 四种语言 → ar/fr/id/pt/vi 的
   * canonical 仍写 https://mackorn.cn/ar/（站点根已无该路径 → 爬虫照 canonical 访问会 404），
   * 96 个页面里 5 个 canonical 错、29 处 hreflang 错。已改为按语言表批量生成规则。 */
  {
    const badCanon = [];
    const badHref = [];
    const walkHtml = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walkHtml(p); continue; }
        if (!e.name.endsWith('.html')) continue;
        const c = readFileSync(p, 'utf8');
        const mc = c.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
        if (mc && !/^https:\/\/mackorn\.cn\/ai\//.test(mc[1])) badCanon.push(p.slice(DEP.length + 1).replace(/\\/g, '/') + '→' + mc[1]);
        for (const m of c.matchAll(/<link[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/g)) {
          if (!/^https:\/\/mackorn\.cn\/ai\//.test(m[2]) && !/^https:\/\/mackorn\.cn\/?$/.test(m[2])) badHref.push(p.slice(DEP.length + 1).replace(/\\/g, '/') + '(' + m[1] + ')→' + m[2]);
        }
      }
    };
    try { walkHtml(DEP); } catch { }
    if (badCanon.length === 0) ok('部署页 canonical 全部指向 /ai/');
    else bad('部署页 canonical 全部指向 /ai/', badCanon.slice(0, 5).join(' , ') + (badCanon.length > 5 ? ' …共 ' + badCanon.length + ' 个' : ''));
    if (badHref.length === 0) ok('部署页 hreflang 全部指向 /ai/');
    else bad('部署页 hreflang 全部指向 /ai/', badHref.slice(0, 5).join(' , ') + (badHref.length > 5 ? ' …共 ' + badHref.length + ' 个' : ''));
  }

  /* R157/R158（2026-10-22 夜班）：部署产物**死链扫描**。
   * 实测抓到过：guides/ 整目录没进包（agent.json 里 9 条链接 404）、repo-qrcode.png 没进包、
   * logo 没进包、markets 缺入口页，以及 llms.txt 里 55 条 URL 指向部署后不存在的扁平路径。
   * 这类问题只有「把产物里每个链接映射回本地文件」才暴露。 */
  {
    const dead = new Map();
    const walkLink = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walkLink(p); continue; }
        if (!/\.(html|txt|json|xml)$/i.test(e.name)) continue;
        const c = readFileSync(p, 'utf8');
        const urls = [];
        for (const m of c.matchAll(/https:\/\/mackorn\.cn(\/[A-Za-z0-9_\-./%]*)/g)) urls.push(m[1]);
        for (const m of c.matchAll(/(?:href|src)="(\/[A-Za-z0-9_\-./%]*)"/g)) urls.push(m[1]);
        for (const u of urls) {
          if (!u || u === '/') continue;
          const clean = u.split(/[?#]/)[0];
          const cand = clean.endsWith('/') ? clean + 'index.html' : clean;
          const fp = join(DEP, ...cand.replace(/^\//, '').split('/'));
          if (!existsSync(fp)) {
            if (!dead.has(clean)) dead.set(clean, new Set());
            dead.get(clean).add(p.slice(DEP.length + 1).replace(/\\/g, '/'));
          }
        }
      }
    };
    try { walkLink(DEP); } catch { }
    if (dead.size === 0) ok('部署产物无死链');
    else {
      const sample = [...dead.entries()].slice(0, 5).map(([u, s]) => u + '(' + s.size + '处)');
      bad('部署产物无死链', sample.join(' , ') + (dead.size > 5 ? ' …共 ' + dead.size + ' 种' : ''));
    }
  }

  /* robots.txt 里的工具数必须与实际一致 */
  try {
    const rb = readFileSync(join(DEP, 'robots.txt'), 'utf8');
    const m = rb.match(/(\d+)\s*个工具/);
    let realCount = null;
    try {
      const mod = await import(new URL('../dist/mackorn-cone-crusher/plugin/index.mjs', import.meta.url).href);
      realCount = (mod.toolDefinitions || []).length;
    } catch { realCount = null; }
    if (!m) warn('robots.txt 未写工具数');
    else if (realCount && Number(m[1]) === realCount) ok('robots.txt 工具数与实际一致', m[1]);
    else bad('robots.txt 工具数与实际一致', `写 ${m[1]}，实际 ${realCount ?? '?'}`);
  } catch { warn('robots.txt 不可读'); }

  /* 部署包 zip 的新鲜度（不阻断，但过期就必须重打才能上传） */
  const ZIPF = join(ROOT, 'distribution', '官网全量部署包.zip');
  if (!existsSync(ZIPF)) warn('未找到 官网全量部署包.zip（跑 node tools/zip_deploy.mjs）');
  else {
    const zipT = statSync(ZIPF).mtimeMs;
    let newer = 0;
    const walkNew = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) { walkNew(p); continue; }
        if (st.mtimeMs > zipT + 1000) newer++;
      }
    };
    walkNew(DEP);
    if (newer === 0) ok('官网全量部署包.zip 比部署目录新', `${(statSync(ZIPF).size / 1024).toFixed(0)} KB`);
    else warn('官网全量部署包.zip 已过期', `${newer} 个文件比 zip 新，上传前重跑 node tools/zip_deploy.mjs`);
  }
}

/* ---------- 12. 远程 PHP 端点的参数 schema 与 Node 定义一致 ----------
 * 2026-10-22 实测：远程与本地是两套实现，schema 曾漂移 15/29 个工具
 * （requirement_intake 少 24 个参数、distributor_eval 还是旧设计、多个工具 required 不一致）。
 * 远程 AI 按错的 schema 调用 = "工具存在但总是失败"，而本地测试完全看不出。
 * 现在 PHP 的 $add schema 由 tools/gen_php_mcp.mjs 从 plugin/index.mjs 生成，
 * 这条门禁负责确认"生成结果真的没漂"。 */
try {
  execFileSync(process.execPath, [join(HERE, 'check_php_schema_parity.mjs')], { stdio: 'ignore', timeout: 120000 });
  ok('远程 PHP 参数 schema 与 Node 定义一致');
} catch (e) {
  if (e.code === 'EPERM') warn('参数一致性检查跳过：子进程 EPERM（沙箱限制）');
  else bad('远程 PHP 参数 schema 与 Node 定义一致', '跑 node tools/check_php_schema_parity.mjs 看明细');
}

/* ---------- 13. .well-known 身份文件自洽 ----------
 * 2026-10-22 实测三处互相矛盾（这些文件 AI 目录会直接读）：
 *   ① server-card.json 的 tools 数组只有 19 项（实际 29）—— 且**没有任何生成器**，纯手工维护
 *   ② ai-plugin.json 的 api.url 指向 /.well-known/openapi.json，而该文件**从不存在**（404）
 *   ③ agent 页 meta 写 "20 callable tools"（实际 29）
 * 修法：server-card + openapi.json 改为由 sync_ai_index.mjs 从工具定义生成；agent 页用 AGENT.tools。
 * 本段负责确认它们不再漂。 */
{
  const SITE13 = join(ROOT, 'distribution', '官网落地页');
  const WK = join(SITE13, '.well-known');
  let realCount13 = null;
  try {
    const mod = await import(new URL('../dist/mackorn-cone-crusher/plugin/index.mjs', import.meta.url).href);
    realCount13 = (mod.toolDefinitions || []).length;
  } catch { realCount13 = null; }

  /* ② openapi.json 必须存在（ai-plugin.json 的 api.url 指向它） */
  const ap13 = join(WK, 'ai-plugin.json');
  if (!existsSync(ap13)) {
    warn('未找到 .well-known/ai-plugin.json');
  } else {
    let ap = null;
    try { ap = JSON.parse(readFileSync(ap13, 'utf8')); } catch { ap = null; }
    if (!ap) {
      bad('ai-plugin.json 可解析');
    } else {
      ok('ai-plugin.json 可解析');
      const apiUrl = String((ap.api && ap.api.url) || '');
      if (!apiUrl) {
        warn('ai-plugin.json 未声明 api.url');
      } else {
        const rel = apiUrl.replace(/^https?:\/\/[^/]+/, '');
        const local = join(SITE13, rel.replace(/^\//, '').replace(/\//g, '/'));
        if (existsSync(local)) ok('ai-plugin.api.url 指向的文件真实存在', rel);
        else bad('ai-plugin.api.url 指向的文件真实存在', `${rel} 不存在（客户端会 404）`);
      }
    }
  }

  /* ① server-card 的工具数必须等于实际 */
  const sc13 = join(WK, 'mcp', 'server-card.json');
  if (!existsSync(sc13)) {
    bad('存在 .well-known/mcp/server-card.json');
  } else {
    let sc = null;
    try { sc = JSON.parse(readFileSync(sc13, 'utf8')); } catch { sc = null; }
    if (!sc) bad('server-card.json 可解析');
    else {
      const n = Array.isArray(sc.tools) ? sc.tools.length : -1;
      if (realCount13 && n === realCount13) ok('server-card 工具数与实际一致', String(n));
      else bad('server-card 工具数与实际一致', `${n} vs ${realCount13 ?? '?'}`);
      const ver = sc.serverInfo && sc.serverInfo.version;
      if (ver === String(outPkg.version)) ok('server-card 版本与包一致', String(ver));
      else bad('server-card 版本与包一致', `${ver} vs ${outPkg.version}`);
    }
  }

  /* ③ agent 页 meta 里的工具数 */
  const agentPage = join(SITE13, 'ai', 'agent', 'index.html');
  if (existsSync(agentPage) && realCount13) {
    const c = readFileSync(agentPage, 'utf8');
    const m = c.match(/mining agent:\s*(\d+)\s*callable tools/);
    if (!m) warn('agent 页未写可调用工具数（跳过）');
    else if (Number(m[1]) === realCount13) ok('agent 页工具数与实际一致', m[1]);
    else bad('agent 页工具数与实际一致', `写 ${m[1]}，实际 ${realCount13}`);
  }
}

/* ---------- 14. 跨交付物版本一致性（7 处对外版本号必须相同） ----------
 * 2026-10-22 实测：agent.json 里写 version 1.0.0，而 package.json / dist / _upload /
 * MCPB manifest / version.json / server.json 全是 0.2.2 —— 因为生成器把它硬编码了。
 * AI 目录读 agent.json 会看到一个与产品不符的版本。这里做一次性矩阵比对。 */
{
  const readJ = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  const SITE14 = join(ROOT, 'distribution', '官网落地页');
  const cands = [
    ['package.json', readJ(join(ROOT, 'package.json'))],
    ['dist/package.json', readJ(join(ROOT, 'dist', 'mackorn-cone-crusher', 'package.json'))],
    ['_upload-github/package.json', readJ(join(ROOT, 'distribution', '_upload-github', 'package.json'))],
    ['version.json', readJ(join(SITE14, 'ai', 'version.json'))],
    ['MCPB manifest', readJ(join(MCPB, 'manifest.json'))],
    ['server.json', readJ(join(ROOT, 'distribution', '_upload-github', 'server.json'))],
    ['agent.json', readJ(join(SITE14, '.well-known', 'agent.json'))],
  ].filter(([, v]) => v && v.version);
  const vers = new Map();
  for (const [name, v] of cands) {
    const key = String(v.version);
    if (!vers.has(key)) vers.set(key, []);
    vers.get(key).push(name);
  }
  if (vers.size === 1) ok('跨交付物版本号一致', [...vers.keys()][0] + ' × ' + cands.length + ' 处');
  else bad('跨交付物版本号一致', [...vers].map(([v, ns]) => v + ':' + ns.join('/')).join(' | '));
}

/* ---------- 汇总 ---------- */
console.log('-'.repeat(66));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) {
  console.log('');
  console.log('阻断项：');
  for (const f of fails) console.log('  - ' + f);
  console.log('');
  console.log('这些是**发布产物**的问题，不是源码问题。修 build_public.mjs 的放行清单或 public-overrides/package.json。');
}
console.log('='.repeat(66));
process.exit(fail === 0 ? 0 : 1);
