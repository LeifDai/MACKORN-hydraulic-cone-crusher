/**
 * R75：把 sync_tool_count_facts 扩成【硬事实同步】—— 覆盖工具数 + 语言数
 *
 * 权威源（不写死，真读）：
 *   · 工具数   ← 数 plugin/index.mjs 的 name: 'mackorn_*'
 *   · 语言数   ← distribution/官网落地页/ai/version.json 的 languages 字段
 *
 * 发现（R75）：全仓 "12 languages" 23 处、"10 languages" 21 处 —— 两个数字打架。
 *   查 version.json 确认权威值是 12（language_list 12 项）。
 *   → 把过时的 10 同步成 12。
 *
 * 纪律不变：
 *   ① 陈述式才改，讨论/证据行不动（改证据 = 篡改）
 *   ② 构建产物靠重新生成，不手工改
 *   ③ 历史记录（PDCA/CHANGELOG）绝不动
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WRITE = process.argv.includes('--write');

/* ── 真相 ── */
const IDX = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
const TOOLS = [...new Set([...IDX.matchAll(/^\s{2}name: '(mackorn_[a-z_]+)',/gm)].map((m) => m[1]))].length;
let LANGS = null;
let langList = [];
{
  const p = join(ROOT, 'distribution', '官网落地页', 'ai', 'version.json');
  if (existsSync(p)) {
    try { const j = JSON.parse(readFileSync(p, 'utf8')); LANGS = Number(j.languages) || null; langList = j.language_list || []; } catch { }
  }
}
if (TOOLS < 10) { console.error('  ❌ 工具数可疑（' + TOOLS + '）—— 中止'); process.exit(2); }
console.log('  真相：' + TOOLS + ' 个工具' + (LANGS ? ' · ' + LANGS + ' 种语言' : ' · 语言数未知'));

/* ── 陈述式替换 ── */
const FIXES = [
  /* R113 通用规则：任何不等于真相的 "NN tools / NN 个工具 / NN MCP tools / NN 个 MCP 工具"
   * 都要替换成真相。旧版只列死 19/21/22，且 22 只有中文形式，导致 "22 tools" 漏改。
   * 实测：工具数 22→24→25 后 README/llms.txt 仍写 22，sync 却报"0 处待改"。 */
  [/(^|[^0-9])(\d{1,3})(\s*)(MCP tools)\b/g, (m, pre, num, sp, unit) => (Number(num) === TOOLS ? m : pre + TOOLS + sp + unit)],
  [/(^|[^0-9])(\d{1,3})(\s*)(个 MCP 工具)\b/g, (m, pre, num, sp, unit) => (Number(num) === TOOLS ? m : pre + TOOLS + sp + unit)],
  [/(^|[^0-9])(\d{1,3})(\s*)(tools)\b/g, (m, pre, num, sp, unit) => (Number(num) === TOOLS ? m : pre + TOOLS + sp + unit)],
  /* R114：还有「数字在后」的写法（如 CLAUDE.md 的 Tools: 24）—— 前一类规则抓不到。 */
  [/(Tools|tools)(\s*[:：]\s*)(\d{1,3})\b/g, (m, w, sep, num) => (Number(num) === TOOLS ? m : w + sep + TOOLS)],
  [/(\d{1,3})(\s+)(tool definitions)/g, (m, num, sp, w) => (Number(num) === TOOLS ? m : TOOLS + sp + w)],
  [/(^|[^0-9])(\d{1,3})(\s*)(个工具)\b/g, (m, pre, num, sp, unit) => (Number(num) === TOOLS ? m : pre + TOOLS + sp + unit)],
];
if (LANGS) {
  FIXES.push(
    [/\b10 languages\b/g, LANGS + ' languages'],
    [/10 种语言/g, LANGS + ' 种语言'],
    [/\b11 languages\b/g, LANGS + ' languages'],
    [/\b13 languages\b/g, LANGS + ' languages'],
  );
}

/* ── 行级跳过：在讨论/记录该错误 ── */
const META = /过时|仍写|实测|实际已是|evidence|origin|→|修复|替换|陈旧|需要更新|需 push|v0\.0\.|已过时|标准文案|下面用|应为|发现|矛盾|不一致|冲突|审阅者|审核者|维护者|原话|评论|他说|quote|引述|待改|待传|对照/;

const BUILD_OUT = /(^|\/)(dist|upload-ready|_deploy|_delta|_npmcli|_npmcache|_archive|node_modules|_upload-github)\//;
const SITE_OUT = /(^|\/)distribution\/官网落地页\//;
const HISTORY = /(PDCA|pdca-master|pdca-history|lessons-status|lessons-single|enforce-lessons|早上7点后|CHANGELOG|changelog|台账|two-centers-report|weak-check-detection|status-now|独立验证|数据哨兵值扫描|跨表一致性检查|build-consistency|run-guards-audit|compliance-report|tests-run|search-index-verify|hard-facts\.json)/;
/* R77：测试夹具里【故意】放着过时的字符串（负控样本）——
 *   改了它们等于破坏测试。
 *   本会话真实踩到：工具扫全仓时改掉了自己测试文件里的 SHOULD_CHANGE 数组，
 *   导致下次跑测试出现假失败。 */
/* R90：报告类文件本身就是【关于这个数字】的证据 ——
 *   例如《PR状态专报》的核心就是引述审核者说"条目写 21，仓库是 19"。
 *   改掉这些数字等于销毁证据。整份文件不扫。 */
const EVIDENCE_DOCS = /(PR状态专报|收录经验库|硬事实一致性|数据质量专报|GitHub完善包|读完徐庆贺|新分发通道|一条命令做完|推送到GitHub)/;
const TEST_FIXTURE = /^tests\//;
const SELF = /^tools\/sync_tool_count_facts\.mjs$|^tools\/sync_hard_facts\.mjs$|^tools\/update_prs\.mjs$|^tools\/build_indexing_playbook\.mjs$|^tools\/lessons\.mjs$/;
const SCAN_EXT = /\.(md|mjs|json|txt|yml|yaml|html|cff)$/;

const out = { stated: [], meta: 0, metaFiles: [], buildOut: [], history: [], self: [], clean: 0 };

const walk = (d, dep = 0) => {
  if (dep > 5) return;
  let es = [];
  try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const q = join(d, e.name);
    const rel = q.replace(ROOT + '\\', '').replace(/\\/g, '/');
    if (/node_modules|\.git/.test(rel)) continue;
    if (e.isDirectory()) { walk(q, dep + 1); continue; }
    if (!SCAN_EXT.test(e.name)) continue;
    let c = '';
    try { c = readFileSync(q, 'utf8'); } catch { continue; }

    let total = 0;
    for (const [re] of FIXES) total += (c.match(re) || []).length;
    if (!total) { out.clean += 1; continue; }
    if (BUILD_OUT.test(rel) || SITE_OUT.test(rel)) { out.buildOut.push({ rel, hits: total }); continue; }
    if (HISTORY.test(rel)) { out.history.push({ rel, hits: total }); continue; }
    if (EVIDENCE_DOCS.test(rel)) { (out.evidence || (out.evidence = [])).push({ rel, hits: total }); continue; }
    if (TEST_FIXTURE.test(rel)) { (out.fixture || (out.fixture = [])).push({ rel, hits: total }); continue; }
    if (SELF.test(rel)) { out.self.push({ rel, hits: total }); continue; }

    let stated = 0, meta = 0;
    const newLines = c.split('\n').map((l) => {
      let has = false;
      for (const [re] of FIXES) { re.lastIndex = 0; if (re.test(l)) { has = true; break; } }
      for (const [re] of FIXES) re.lastIndex = 0;
      if (!has) return l;
      /* R77：同时含【旧值】与【新值】的行 = 映射表/对比表（如 ['19 tools','22 tools']），
       *   那是修复逻辑或证据，不是过时陈述 —— 跳过。
       *   血泪来源：工具曾把裸的 ['19 tools','22 tools'] 改成 ['22 tools','22 tools']。 */
      /* R113：任何不等于 TOOLS 的 NN tools/个工具 都算过时 */
        const mTool = l.match(/(^|[^0-9])(\d{1,3})(\s*)(tools|个工具)/);
        const staleTool = !!mTool && Number(mTool[2]) !== TOOLS;
      const freshTool = new RegExp('(^|[^0-9])' + TOOLS + '\\s*(tools|个工具)').test(l);
      const staleLang = LANGS ? /(^|[^0-9])10(\s*)(languages|种语言)/.test(l) : false;
      const freshLang = LANGS ? new RegExp('(^|[^0-9])' + LANGS + '\\s*(languages|种语言)').test(l) : false;
      if ((staleTool && freshTool) || (staleLang && freshLang)) { meta += 1; return l; }
      if (META.test(l)) { meta += 1; return l; }
      let o = l;
      for (const [re, to] of FIXES) o = o.replace(re, to);
      if (o !== l) stated += 1;
      return o;
    });

    if (meta) { out.meta += meta; out.metaFiles.push({ rel, meta }); }
    if (!stated) continue;
    out.stated.push({ rel, hits: stated, meta });
    if (WRITE) writeFileSync(q, newLines.join('\n'), 'utf8');
  }
};
walk(ROOT);

console.log('');
console.log('  ══ 硬事实同步' + (WRITE ? '（已写入）' : '（dry-run）') + ' ══');
console.log('');
console.log('  ① 陈述式（' + (WRITE ? '已改' : '待改') + '）：'
  + out.stated.length + ' 文件 · ' + out.stated.reduce((s, x) => s + x.hits, 0) + ' 处');
for (const x of out.stated) console.log('     ' + String(x.hits).padStart(3) + '  ' + x.rel + (x.meta ? '   （另有 ' + x.meta + ' 行是记录/证据，未动）' : ''));
console.log('');
console.log('  ② 构建产物（重新生成）：' + out.buildOut.length + ' 文件 · ' + out.buildOut.reduce((s, x) => s + x.hits, 0) + ' 处');
console.log('  ③ 历史记录（不动）：' + out.history.length + ' 文件 · ' + out.history.reduce((s, x) => s + x.hits, 0) + ' 处');
console.log('  ④ 元引用脚本（不动）：' + out.self.length + ' 文件 · ' + out.self.reduce((s, x) => s + x.hits, 0) + ' 处');
console.log('  ⑤ 行级跳过（记录/证据）：' + out.meta + ' 行 / ' + out.metaFiles.length + ' 文件');
for (const x of out.metaFiles.slice(0, 8)) console.log('       ' + x.meta + ' 行  ' + x.rel);
console.log('');
console.log('  ✅ 干净文件：' + out.clean);
console.log('');

/* ── 顺带报告：语言列表里有目录缺失的 ── */
if (langList.length) {
  const base = join(ROOT, 'distribution', '官网落地页');
  let dirs = [];
  try { dirs = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { }
  const missing = langList.filter((l) => l !== 'zh' && !dirs.includes(l));
  if (missing.length) {
    console.log('  ⚠️ 语言列表里有 ' + missing.length + ' 种没有对应页面目录：' + missing.join(', '));
    console.log('     （version.json 声明 ' + LANGS + ' 种，官网目录只有 ' + (langList.length - missing.length) + ' 种 —— 请确认是"规划中"还是"缺页面"）');
    console.log('');
  }
}

if (!WRITE && out.stated.length) console.log('  加 --write 才真正改写。\n');
process.exit(WRITE ? 0 : (out.stated.length ? 1 : 0));
