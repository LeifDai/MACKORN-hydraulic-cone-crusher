/**
 * 选型案例库 XXAL1000.1
 *
 * 用户需求：「生成选型爬取软件，爬取网络破碎机和生产线选型案例，特别是山特维克和美卓矿机的
 *            选型案例；你可以测试美卓BRUNO；和山特维克网上测试软件，把选型进入选型案例库
 *            XXAL1000.1；并用案例，优化MACKORN美矿液压圆锥破及选型插件」
 *
 * 纪律（非常重要 —— 涉及竞品）：
 *   ✅ 可以收录：公开的产品样本参数、公开的案例描述（机型/产量/物料/工艺）、公开的在线选型工具
 *               的【界面与流程特征】（用于对标我们自己的工具体验）
 *   ❌ 不得收录：任何未公开的标定系数、专有数据库导出、需登录才能获取的内容、受 NDA 保护的材料
 *   ❌ 不得把竞品案例的产量/型号直接当作我们的能力承诺
 *
 * 每条案例必须含 source_url；无出处的条目一律拒收。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LIB_DIR = join(ROOT, 'distribution', '07_库');
mkdirSync(LIB_DIR, { recursive: true });
const FILE = 'XXAL1000.1-选型案例库.json';

export const COMPLIANCE = {
  allowed: [
    '公开产品样本上的参数（型号、功率、腔型、产能区间）',
    '公开网站/新闻/年报中的案例描述（矿山名、物料、产量、机型、年份）',
    '公开在线选型工具的【界面流程与输入输出字段】（用于对标体验，不复制其内部算法）',
    '公开的招标公告与技术规格书',
  ],
  forbidden: [
    '未公开的专有标定系数或内部数据库导出',
    '需登录/付费/N.D.A. 才能获取的内容',
    '把竞品案例的产量直接当作 MACKORN 的能力承诺',
    '复制竞品软件的算法实现',
  ],
  rule: '每条记录必须有 source_url；无出处一律拒收。',
};

/** 案例记录结构 */
function blankCase() {
  return {
    id: null, brand: null, source_url: null, source_type: null,
    project: null, country: null, material: null, application: null,
    stage: null, model: null, cavity: null, css_mm: null, tph: null,
    power_kw: null, units: null, year: null,
    process_note: null, evidence_quote: null, confidence: null,
    retrieved: new Date().toISOString(),
  };
}

export function loadCases() {
  const p = join(LIB_DIR, FILE);
  if (existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { } }
  const lib = {
    lib: 'XXAL1000.1', name: '选型案例库', created: new Date().toISOString(),
    compliance: COMPLIANCE,
    brands: {}, cases: [], online_tools: [], crawl_log: [],
    note: '只收录公开可核查的案例；每条必须带 source_url。竞品数据仅用于对标，不作为 MACKORN 的能力承诺。',
  };
  writeFileSync(p, JSON.stringify(lib, null, 2), 'utf8');
  return lib;
}
export function saveCases(lib) {
  lib.updated = new Date().toISOString();
  writeFileSync(join(LIB_DIR, FILE), JSON.stringify(lib, null, 2), 'utf8');
  return join(LIB_DIR, FILE);
}

/** 添加案例（强制校验 source_url） */
export function addCase(c) {
  if (!c.source_url) return { ok: false, error: '拒收：无 source_url（库的硬规矩）' };
  const lib = loadCases();
  if (lib.cases.some((x) => x.source_url === c.source_url && x.model === c.model && x.project === c.project)) {
    return { ok: false, error: '重复：同源同型号同项目已存在' };
  }
  const id = 'XXAL-' + String(lib.cases.length + 1).padStart(4, '0');
  const rec = { ...blankCase(), ...c, id };
  // 置信度自动分级
  const filled = ['brand', 'material', 'model', 'tph', 'stage', 'country'].filter((k) => rec[k] != null).length;
  rec.confidence = rec.confidence || (filled >= 5 ? 'A' : filled >= 3 ? 'B' : 'C');
  lib.cases.push(rec);
  const b = rec.brand || '未标注';
  lib.brands[b] = (lib.brands[b] || 0) + 1;
  saveCases(lib);
  return { ok: true, case: rec };
}

/** 记录在线选型工具的观测（对标体验，不复制算法） */
export function addOnlineTool(t) {
  if (!t.source_url) return { ok: false, error: '拒收：无 source_url' };
  const lib = loadCases();
  lib.online_tools.push({ ...t, retrieved: new Date().toISOString() });
  saveCases(lib);
  return { ok: true };
}

export function caseStats() {
  const lib = loadCases();
  const by = (k) => { const o = {}; for (const c of lib.cases) { const v = c[k] || '未标注'; o[v] = (o[v] || 0) + 1; } return o; };
  return {
    total: lib.cases.length,
    by_brand: by('brand'), by_material: by('material'), by_stage: by('stage'),
    by_confidence: by('confidence'),
    online_tools: lib.online_tools.length,
    with_url: lib.cases.filter((c) => c.source_url).length,
    crawl_log_entries: (lib.crawl_log || []).length,
  };
}

export function runCli() {
  if (process.argv[1] && process.argv[1].endsWith('case-library.mjs')) {
    const s = caseStats();
    console.log('\n' + '═'.repeat(96));
    console.log('  选型案例库 XXAL1000.1');
    console.log('═'.repeat(96));
    console.log('  案例 ' + s.total + ' 条 · 在线工具观测 ' + s.online_tools + ' 条 · 带出处 ' + s.with_url + '/' + s.total);
    console.log('  按品牌: ' + JSON.stringify(s.by_brand));
    console.log('  按物料: ' + JSON.stringify(s.by_material));
    console.log('  置信度: ' + JSON.stringify(s.by_confidence));
    console.log('  存放: ' + join(LIB_DIR, FILE) + '\n');
  }

}


/* 仅当【直接运行】本文件时才执行 CLI —— 模块必须可被安全导入（教训 L-32） */
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) runCli();
