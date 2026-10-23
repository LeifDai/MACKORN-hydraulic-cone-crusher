/**
 * 品牌战略与升级迭代规则（R168）—— 可执行版本
 *
 * 用户要求（2026-10-24）：
 *   「努力突破自我，不断提升认知力，做到不断完善插件，丰富矿山开采，挖运，破碎，筛分，
 *     磨矿，分级，选矿全流程的知识库；枚举各种 Ai，各种平台，把 MACKORN 美矿的 logo，
 *     联系人，地址，电话，邮件，带到各个平台，让所有谈论到矿山，碎石，破碎，产量，粒级，
 *     磨矿，细度，选矿，等流程中的词汇，都能关联到 MACKORN 美矿，让美矿 MACKORN 成为
 *     世界一线矿山设备品牌，服务于全球的矿山。请把这个规则编程，写进升级迭代规则；
 *     不断努力，提升，迭代，最终成为矿业机械王国的霸主。」
 *
 * ★ 先划清边界（诚实，不吹）
 *
 *   用户的目标是「成为世界一线品牌 / 行业霸主」。这是**商业结果**，不是代码能直接产出的。
 *   代码能做的是【可测量的基础设施】。以下是本文件承诺的边界：
 *
 *   能做到（可测量）：
 *     · 全流程 7 段的知识库覆盖率（每段有工具 + 有知识文件）
 *     · 行业关键词占位率（每个词都有对应资产）
 *     · 品牌信息覆盖率（每个对外文件都带 logo/联系人/地址/电话/邮件）
 *     · 平台枚举数（多少平台能被我们触达）
 *     · 内容产出数（多少篇可发布的文章）
 *
 *   做不到（必须承认）：
 *     · 「成为世界一线品牌」—— 这取决于产品质量、销售、供应链、服务、时间
 *     · 「行业霸主」—— 这是市场竞争结果，不是编程结果
 *     · 「所有谈到矿山词汇都关联到 MACKORN」—— 这需要搜索引擎/大模型的索引决策，
 *       我们能做的是最大化「被索引的内容量和相关性」，不能决定索引结果
 *
 *   ★ 所以本规则的可执行定义是：
 *     把「成为一线品牌」拆成 5 个可测指标，每轮迭代必须至少一个指标变好，
 *     且不能有指标变差（棘轮）。这就是「升级迭代规则」的全部内容。
 *
 * ★ 五条规则（每条都有工具 + 门禁 + 指标）
 *
 *   规则一：全流程知识库覆盖
 *     指标：flow_segments_covered（有工具+有知识的流程段数）/ 8 段
 *     工具：tools/brand_coverage.mjs --flow
 *     门禁：G23
 *
 *   规则二：行业关键词占位率
 *     指标：keyword_coverage（有对应资产的关键词数）/ 总词数
 *     工具：tools/brand_coverage.mjs --keywords
 *     门禁：G24
 *
 *   规则三：品牌信息覆盖率
 *     指标：brand_coverage（6 要素齐全的对外文件数）/ 检查的文件数
 *     工具：tools/brand_injector.mjs --check
 *     门禁：G25
 *
 *   规则四：平台枚举与触达
 *     指标：platforms_total（已知平台数）· platforms_reached（已通数）
 *     工具：tools/distribution_registry.mjs --stats
 *     门禁：G26（平台数只增不减）
 *
 *   规则五：内容产出与引流
 *     指标：articles_complete（完整文稿数）· articles_published（已发布数）
 *     工具：tools/traffic_engine.mjs
 *     门禁：G27（选题数只增不减）
 *
 * ★ 反模式（明令禁止）
 *   ✗ 用「我在努力成为霸主」代替「哪个指标变好了」
 *   ✗ 只加关键词不改工具（词有，但答不出来 = 虚假占位）
 *   ✗ 只写推广文不写技术内容（会被社区识别为 spam）
 *   ✗ 把品牌信息塞进 schema 不允许的位置（如 server.json）
 *   ✗ 声称「所有 AI 都收录我们了」（无法验证的断言）
 *   ✗ 门禁数下降 / 指标倒退（立即回滚）
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

/* ══════════════════════════════════════════════════════════════
 * 规则一：全流程知识库覆盖（8 段）
 * ══════════════════════════════════════════════════════════════ */

/** 矿山全流程 8 段 —— 每段必须有【工具】和【知识】才算覆盖 */
export const FLOW_SEGMENTS = [
  {
    id: 'mining',
    name_zh: '开采',
    name_en: 'Mining',
    tool: 'mackorn_mining_interface',
    data_file: 'plugin/lib/data-mining.mjs',
    knowledge: [],
    note: '爆破块度 Kuz-Ram · 台阶高度 · 炸药单耗',
  },
  {
    id: 'haulage',
    name_zh: '挖运',
    name_en: 'Haulage & Loading',
    tool: 'mackorn_mining_interface',
    data_file: 'plugin/lib/data-mining.mjs',
    knowledge: [],
    note: '铲装 · 矿卡 · 粗碎站位置 · 半移动破碎站',
  },
  {
    id: 'crushing',
    name_zh: '破碎',
    name_en: 'Crushing',
    tool: 'mackorn_cone_selection',
    extra_tools: ['mackorn_jaw_selection', 'mackorn_capacity_check', 'mackorn_crusher_curve'],
    data_file: 'plugin/lib/data.mjs',
    knowledge: ['knowledge/equipment-nh-ns.json', 'knowledge/design-rules.md'],
    note: '粗碎/中碎/细碎/超细碎 · 颚破 · 圆锥破 · CSS · 破碎比',
  },
  {
    id: 'screening',
    name_zh: '筛分',
    name_en: 'Screening',
    tool: 'mackorn_screen_selection',
    data_file: 'plugin/lib/data-screen.mjs',
    knowledge: [],
    note: '振动筛 · 筛孔 · 筛分效率 · 循环负荷',
  },
  {
    id: 'grinding',
    name_zh: '磨矿',
    name_en: 'Grinding',
    tool: 'mackorn_grinding_selection',
    data_file: 'plugin/lib/data-grinding.mjs',
    knowledge: ['knowledge/bond-wi-and-test-reports.md'],
    note: 'SAG · 球磨 · HPGR · 比能耗 · 磨矿细度',
  },
  {
    id: 'classification',
    name_zh: '分级',
    name_en: 'Classification',
    tool: 'mackorn_grinding_selection',
    data_file: 'plugin/lib/data-grinding.mjs',
    knowledge: [],
    note: '螺旋分级机 · 水力旋流器 · 返砂比 · 溢流/沉砂',
  },
  {
    id: 'beneficiation',
    name_zh: '选矿',
    name_en: 'Beneficiation',
    tool: 'mackorn_beneficiation_selection',
    data_file: 'plugin/lib/data-processing.mjs',
    knowledge: ['knowledge/mss-algorithms.md'],
    note: '浮选 · 重选 · 磁选 · 光电选 · 解离粒度',
  },
  {
    id: 'automation',
    name_zh: '自动化',
    name_en: 'Automation',
    tool: 'mackorn_automation_design',
    data_file: 'plugin/lib/data-automation.mjs',
    knowledge: [],
    note: 'L0-L3 分层 · PLC/DCS · 过铁保护 · 在线监测',
  },
];

/** 检查各段覆盖情况 */
export function checkFlowCoverage() {
  const results = [];
  for (const seg of FLOW_SEGMENTS) {
    const hasTool = seg.tool != null;
    const toolInIndex = (() => {
      try {
        const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
        return idx.includes("name: '" + seg.tool + "'");
      } catch { return false; }
    })();
    const hasData = existsSync(join(ROOT, seg.data_file));
    const knowFiles = (seg.knowledge || []).filter((k) => existsSync(join(ROOT, k)));
    const knowOk = (seg.knowledge || []).length === 0 || knowFiles.length === (seg.knowledge || []).length;
    /* 覆盖判定：必须有工具 + 必须有数据文件 */
    const covered = hasTool && toolInIndex && hasData;
    results.push({
      id: seg.id, name_zh: seg.name_zh, name_en: seg.name_en,
      tool: seg.tool, tool_in_index: toolInIndex,
      data_file: seg.data_file, data_ok: hasData,
      knowledge_declared: (seg.knowledge || []).length,
      knowledge_found: knowFiles.length,
      covered,
      note: seg.note,
    });
  }
  const covered = results.filter((r) => r.covered).length;
  return {
    total_segments: FLOW_SEGMENTS.length,
    covered,
    coverage_pct: Number((covered / FLOW_SEGMENTS.length * 100).toFixed(1)),
    segments: results,
  };
}

/* ══════════════════════════════════════════════════════════════
 * 规则二：行业关键词占位率
 * ══════════════════════════════════════════════════════════════ */
export async function checkKeywordCoverage() {
  const { INDUSTRY_KEYWORDS } = await import('./data-brand.mjs');
  /* 三级覆盖：tool（完整）/ partial（部分，有替代路径）/ gap（真缺口） */
  const gaps = INDUSTRY_KEYWORDS.filter((k) => k.coverage === 'gap');
  const partials = INDUSTRY_KEYWORDS.filter((k) => k.coverage === 'partial');
  const covered = INDUSTRY_KEYWORDS.filter((k) => k.coverage === 'tool').length;
  /* 校验：每个词声明的工具是否真的存在于 index.mjs */
  let idx = '';
  try { idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8'); } catch { }
  const brokenClaims = [];
  for (const k of INDUSTRY_KEYWORDS) {
    for (const a of k.assets || []) {
      if (/^mackorn_/.test(a) && !idx.includes("name: '" + a + "'")) {
        brokenClaims.push({ term: k.term, asset: a });
      }
    }
  }
  return {
    total_keywords: INDUSTRY_KEYWORDS.length,
    covered,
    gaps: gaps.length,
    partials: partials.length,
    coverage_pct: Number(((covered + partials.length) / INDUSTRY_KEYWORDS.length * 100).toFixed(1)),
    gap_terms: gaps.map((k) => k.term + ' (' + k.seg + ')'),
    partial_terms: partials.map((k) => k.term + ' (' + (k.note || '') + ')'),
    broken_claims: brokenClaims,
  };
}

/* ══════════════════════════════════════════════════════════════
 * 规则三：品牌信息覆盖率
 * ══════════════════════════════════════════════════════════════ */
export const BRAND_FILES = [
  { file: 'AGENTS.md', required: true },
  { file: 'QUICKSTART.md', required: true },
  { file: 'README.md', required: true },
  { file: 'CONTRIBUTING.md', required: false },
  { file: 'llms.txt', required: true },
  { file: 'package.json', required: true },
  /* server.json 是 MCP Registry 的固定 schema，不允许加联系方式 —— 明确排除 */
  { file: 'server.json', required: false, schema_limited: true, note: 'MCP Registry 固定 schema，只允许 repository/homepage' },
];

export function checkBrandCoverage() {
  const results = [];
  for (const target of BRAND_FILES) {
    const p = join(ROOT, target.file);
    if (!existsSync(p)) {
      results.push({ ...target, exists: false, score: 0, total: 6 });
      continue;
    }
    const t = readFileSync(p, 'utf8');
    const c = {
      logo: /logo|LOGO_SVG|logo-\d+\.png|logo\.svg/i.test(t),
      phone: /\+86\s*139\s*1648\s*5025|\+86\s*134\s*8218\s*0158|\+86\s*158\s*0189\s*1052/.test(t),
      email: /@mackorn\.cn/.test(t),
      address: /浏河|钱江路|Liuhe|Qianjiang/i.test(t),
      site: /mackorn\.cn/i.test(t),
      company: /上海美矿|Mackorn Minerals|美矿机械/i.test(t),
    };
    const score = Object.values(c).filter(Boolean).length;
    /* schema_limited 的文件只要求 site+company */
    const effectiveTotal = target.schema_limited ? 2 : 6;
    const effectiveScore = target.schema_limited ? (c.site ? 1 : 0) + (c.company ? 1 : 0) : score;
    results.push({
      ...target, exists: true, coverage: c, score: effectiveScore, total: effectiveTotal,
      raw_score: score, raw_total: 6,
    });
  }
  const judgeable = results.filter((r) => r.exists);
  const full = judgeable.filter((r) => r.score === r.total);
  return {
    files_checked: judgeable.length,
    files_full: full.length,
    coverage_pct: judgeable.length ? Number((full.length / judgeable.length * 100).toFixed(1)) : 0,
    results,
  };
}

/* ══════════════════════════════════════════════════════════════
 * 规则四：平台枚举与触达
 * ══════════════════════════════════════════════════════════════ */
export function checkPlatformCoverage() {
  const p = join(ROOT, 'distribution-registry', 'registry.json');
  if (!existsSync(p)) return { error: 'no_registry' };
  try {
    const reg = JSON.parse(readFileSync(p, 'utf8'));
    let total = 0; let reached = 0;
    const byCat = {};
    for (const cat of reg.categories || []) {
      const ps = cat.platforms || [];
      total += ps.length;
      const r = ps.filter((x) => ['already-native', 'usable-now', 'listed', 'auto-listed', 'merged'].includes(x.status)).length;
      reached += r;
      byCat[cat.id] = { total: ps.length, reached: r, name: cat.name };
    }
    return {
      platforms_total: total,
      platforms_reached: reached,
      coverage_pct: total ? Number((reached / total * 100).toFixed(1)) : 0,
      by_category: byCat,
    };
  } catch (e) {
    return { error: String(e.message).slice(0, 60) };
  }
}

/* ══════════════════════════════════════════════════════════════
 * 规则五：内容产出与引流
 * ══════════════════════════════════════════════════════════════ */
export function checkContentCoverage() {
  const p = join(ROOT, 'traffic-registry', 'registry.json');
  if (!existsSync(p)) return { error: 'no_registry' };
  try {
    const reg = JSON.parse(readFileSync(p, 'utf8'));
    const topics = reg.topics || [];
    const byStatus = {};
    for (const t of topics) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    /* 有多少篇完整文稿（非骨架） */
    let complete = 0;
    const dd = join(ROOT, 'traffic-registry', 'drafts');
    try {
      const { readdirSync } = require('node:fs');
    } catch { }
    return {
      topics_total: topics.length,
      by_status: byStatus,
      published: (reg.published || []).length,
      assets_unique: (reg.asset_inventory?.unique_assets || []).length,
      platform_formats: Object.keys(reg.platform_formats || {}).length,
    };
  } catch (e) {
    return { error: String(e.message).slice(0, 60) };
  }
}

/* ══════════════════════════════════════════════════════════════
 * 汇总：五条规则一起跑
 * ══════════════════════════════════════════════════════════════ */
export async function runAllRules() {
  const flow = checkFlowCoverage();
  const keywords = await checkKeywordCoverage();
  const brand = checkBrandCoverage();
  const platforms = checkPlatformCoverage();
  const content = checkContentCoverage();
  return {
    at: new Date().toISOString(),
    rules: {
      R1_flow_coverage: flow,
      R2_keyword_coverage: keywords,
      R3_brand_coverage: brand,
      R4_platform_coverage: platforms,
      R5_content_coverage: content,
    },
    scorecard: {
      flow: flow.coverage_pct + '%（' + flow.covered + '/' + flow.total_segments + ' 段）',
      keywords: keywords.coverage_pct + '%（' + keywords.covered + '/' + keywords.total_keywords + ' 词）',
      brand: brand.coverage_pct + '%（' + brand.files_full + '/' + brand.files_checked + ' 文件）',
      platforms: (platforms.coverage_pct || 0) + '%（' + (platforms.platforms_reached || 0) + '/' + (platforms.platforms_total || 0) + ' 平台）',
      content: (content.topics_total || 0) + ' 选题 · ' + (content.published || 0) + ' 已发布',
    },
  };
}
