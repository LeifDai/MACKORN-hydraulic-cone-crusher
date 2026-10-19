/**
 * MACKORN 插件 · 自我丰富 / 自我迭代内核（evolve.mjs）
 * ============================================================================
 * 把《20260924 Mackorn 矿山选矿科研模型V1.py》的自我进化能力移植进来：
 *   · CredibilityEvaluator  —— 来源可信度分级（逐条移植 SOURCE_WEIGHTS / AUTHORITY_DOMAINS）
 *   · ConflictDetectorV1    —— 数值矛盾检测与交叉验证（逐条移植 NUMERIC_PATTERNS / 容差算法）
 *   · ModelEvolverV1        —— 指标评估与版本演进（V1 → V1.1 → V2，阈值同源）
 * 并在其上补齐工程落地所必需的三件事：
 *   · 持久化知识库（**插件升级不丢**，落在 $DSH_HOME/mackorn-knowledge）
 *   · PDCA 循环台账（Plan / Do / Check / Act，每轮留痕）
 *   · 行业情报哨兵（山特维克 / 美卓 / 专利 / 标准 的固定观测面 + 研究简报模板）
 *
 * 与 Python 原版的两处**有意差异**（安全考虑，已在输出中标注）：
 *   1. 可信度自动裁决只产出 `resolved_proposed`（建议值），
 *      不直接改写喂给选型的数据；须 `confirm` 后才落库。原版直接 status="resolved"。
 *   2. 无来源（source_url 空）的知识条目**拒收**。原版无此校验。
 * ============================================================================
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const EVOLVER_VERSION = 'V1';

/* ==========================================================================
 * 存储位置：插件升级不丢
 * ========================================================================== */

/** 知识库目录：$MACKORN_KB_DIR > $DSH_HOME/mackorn-knowledge > ~/.dsh/mackorn-knowledge */
export function kbDir() {
  if (process.env.MACKORN_KB_DIR) return process.env.MACKORN_KB_DIR;
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(home, 'mackorn-knowledge');
}

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}
function appendLog(path, record) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  } catch { /* 日志失败不影响主流程 */ }
}

const storePath = () => join(kbDir(), 'store.json');
const logPath = () => join(kbDir(), 'changelog.jsonl');
const pdcaPath = () => join(kbDir(), 'pdca.json');

const EMPTY_STORE = () => ({
  schema_version: '1.0',
  revision: 0,
  model_version: EVOLVER_VERSION,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  entries: [],
  conflicts: [],
  metrics: {
    data_coverage: 0,
    conflict_resolution_rate: 0,
    crushing_leverage_score: 0,
    knowledge_graph_density: 0,
  },
  gaps: [],
  watch_state: {},
});

export function loadStore() {
  const s = readJson(storePath(), null);
  if (!s) return EMPTY_STORE();
  const base = EMPTY_STORE();
  return { ...base, ...s, metrics: { ...base.metrics, ...(s.metrics ?? {}) } };
}

/* ==========================================================================
 * 一、CredibilityEvaluator（逐条移植自 Python 源模型 234-262 行）
 * ========================================================================== */

export const SOURCE_WEIGHTS = {
  official: 5, academic: 5, report: 4, conference: 4, media: 3, expert: 3,
};

export const AUTHORITY_DOMAINS = {
  'metso.com': 5, 'metso.cn': 5, 'mogroup2.cn': 5,
  'sandvik.com': 5, 'rocktechnology.sandvik': 5,
  'global.weir': 5, 'flsmidth.com': 5,
  'sciencedirect.com': 5, 'springer.com': 5,
  'ieeexplore.ieee.org': 5, 'mdpi.com': 4,
  'wanfangdata.com.cn': 4, 'cnki.net': 4,
  'std.samr.gov.cn': 5, 'openstd.samr.gov.cn': 5,
  'mackorn.com': 5, 'mackorn.cn': 5,
  // 专利与知识产权（本插件新增，用于专利情报）
  'patents.google.com': 4, 'worldwide.espacenet.com': 4, 'patentscope.wipo.int': 4,
  'pss-system.cponline.cnipa.gov.cn': 5, 'epub.cnipa.gov.cn': 5,
};

/**
 * 来源可信度 1-5。
 * @param {string} url 来源地址
 * @param {string} sourceType official|academic|report|conference|media|expert
 * @param {boolean} hasPeerReview 是否同行评审
 * @param {number} citationCount 被引次数
 */
export function evaluateCredibility(url, sourceType, hasPeerReview = false, citationCount = 0) {
  let base = SOURCE_WEIGHTS[sourceType] ?? 2;
  const u = String(url ?? '').toLowerCase();
  for (const [domain, score] of Object.entries(AUTHORITY_DOMAINS)) {
    if (u.includes(domain)) { base = Math.max(base, score); break; }
  }
  if (hasPeerReview) base = Math.min(base + 1, 5);
  if (citationCount > 50) base = Math.min(base + 1, 5);
  return base;
}

/* ==========================================================================
 * 二、ConflictDetector（逐条移植自 Python 源模型 839-930 行）
 * ========================================================================== */

export const NUMERIC_PATTERNS = {
  power_kw: '(\\d+(?:\\.\\d+)?)\\s*kW',
  energy_kwh_t: '(\\d+(?:\\.\\d+)?)\\s*kWh/t',
  cagr_pct: 'CAGR\\s*(?:为|of)?\\s*(\\d+(?:\\.\\d+)?)\\s*%',
  market_size: '(\\d+(?:\\.\\d+)?)\\s*亿',
  recovery_pct: '(\\d+(?:\\.\\d+)?)\\s*%',
  lifetime_h: '(\\d{3,5})\\s*h',
  mcfm: 'MCFM\\s*[:：=]?\\s*(\\d+(?:\\.\\d+)?)',
  // 本插件新增：破碎行业常用字段
  capacity_tph: '(\\d+(?:\\.\\d+)?)\\s*t/h',
  css_mm: 'CSS\\s*[:：=]?\\s*(\\d+(?:\\.\\d+)?)\\s*mm',
  price_wan: '(\\d+(?:\\.\\d+)?)\\s*万元',
};

function extractNumeric(text, field) {
  const pattern = NUMERIC_PATTERNS[field];
  if (!pattern || !text) return null;
  const m = new RegExp(pattern).exec(String(text));
  return m ? Number(m[1]) : null;
}

/**
 * 抽取"实体键"：型号类 token。用于把矛盾检测**限定在同一主题内**。
 * 不加限定的话，全局两两比较会把"圆锥破功率 160kW"和"皮带电机 22kW"判成矛盾——
 * 这是 Python 源模型在异质知识库上的盲点（原模型只处理同一主题的搜索结果）。
 */
export function extractEntities(entry) {
  const text = `${entry?.title ?? ''} ${entry?.content ?? ''}`;
  const toks = text.match(/\b(?:NS|NH|MPH|MP|MH|CH|CS|CG|HP|GP|MJ|MC|CVS|PFQ|PLD?|B)\s?-?\d{2,4}[A-Z]?\b/gi) ?? [];
  return [...new Set(toks.map((t) => t.replace(/[\s-]/g, '').toUpperCase()))];
}

/** 两个条目是否可比：型号实体有交集，或显式声明了同一 subject。 */
function comparable(a, b) {
  if (a.subject && b.subject) return a.subject === b.subject;
  const ea = a._entities ?? extractEntities(a);
  const eb = b._entities ?? extractEntities(b);
  if (ea.length === 0 || eb.length === 0) return false;
  return ea.some((x) => eb.includes(x));
}

/**
 * 在若干条目间检测同一字段的数值矛盾。
 * 默认只比较**同主题**（共享型号实体或同一 subject）的条目；scope='global' 可退回全量两两比较。
 * @param {Array} records 条目数组（含 content / id / credibility）
 * @param {string} field NUMERIC_PATTERNS 的键
 * @param {number} tolerance 相对容差
 * @param {object} options { scope: 'entity'|'global' }
 */
export function detectNumericConflict(records, field, tolerance = 0.1, options = {}) {
  const scope = options.scope ?? 'entity';
  const values = [];
  for (const r of records ?? []) {
    const v = extractNumeric(r.content, field);
    if (v !== null) values.push({ id: r.id, v, cred: r.credibility ?? 0, rec: r });
  }
  const found = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      const a = values[i];
      const b = values[j];
      if (scope === 'entity' && !comparable(a.rec, b.rec)) continue;
      if (a.v === 0 && b.v === 0) continue;
      const diff = Math.abs(a.v - b.v) / Math.max(Math.abs(a.v), Math.abs(b.v));
      if (diff <= tolerance) continue;
      const shared = (a.rec._entities ?? extractEntities(a.rec)).filter((x) => (b.rec._entities ?? extractEntities(b.rec)).includes(x));
      const c = {
        field,
        subject: shared.length ? shared.join('+') : (a.rec.subject ?? b.rec.subject ?? null),
        scope,
        value_a: String(a.v),
        source_a: a.id,
        value_b: String(b.v),
        source_b: b.id,
        relative_diff: Number(diff.toFixed(4)),
      };
      if (a.cred > b.cred) {
        // 原版直接 resolved；此处降级为"建议值"，须人工 confirm 后才改写选型数据
        Object.assign(c, {
          status: 'resolved_proposed', resolution: 'auto_by_credibility',
          resolved_value: String(a.v),
          resolution_basis: `来源${a.id}可信度${a.cred} > 来源${b.id}可信度${b.cred}`,
          requires_confirmation: true,
        });
      } else if (b.cred > a.cred) {
        Object.assign(c, {
          status: 'resolved_proposed', resolution: 'auto_by_credibility',
          resolved_value: String(b.v),
          resolution_basis: `来源${b.id}可信度${b.cred} > 来源${a.id}可信度${a.cred}`,
          requires_confirmation: true,
        });
      } else {
        Object.assign(c, { resolution: 'needs_manual_review', status: 'open', requires_confirmation: true });
      }
      c.detected_at = new Date().toISOString();
      found.push(c);
    }
  }
  return found;
}

/** 交叉验证统计（移植 cross_validate）。 */
export function crossValidate(records) {
  const result = { validated: 0, disputed: 0, unverified: 0 };
  for (const r of records ?? []) {
    const status = r.verification_status ?? 'pending';
    if (status === 'verified' || status === 'cross_validated') result.validated += 1;
    else if (status === 'disputed') result.disputed += 1;
    else result.unverified += 1;
  }
  return result;
}

/** 矛盾处置报告（移植 generate_correction_report）。 */
export function correctionReport(conflicts) {
  const all = conflicts ?? [];
  const resolved = all.filter((c) => c.status === 'resolved' || c.status === 'resolved_proposed');
  const opened = all.filter((c) => c.status === 'open');
  return {
    total_conflicts: all.length,
    open_conflicts: opened.length,
    resolved_conflicts: resolved.length,
    resolution_rate: all.length ? Number((resolved.length / all.length).toFixed(3)) : 1.0,
    details: all,
    note: '本插件的 auto_by_credibility 只产出"建议值"（resolved_proposed），须人工 confirm 后才可用于选型；与 Python 源模型直接 resolved 有意不同',
  };
}

/* ==========================================================================
 * 三、ModelEvolver（逐条移植自 Python 源模型 933-1003 行）
 * ========================================================================== */

/** 版本号演进：V1 → V1.1 … → V1.9 → V2（与源模型同规则）。 */
export function nextVersion(version) {
  if (/^V\d+$/.test(version)) return `${version}.1`;
  const m = /^V(\d+)\.(\d+)$/.exec(version);
  if (!m) return version;
  const major = Number(m[1]);
  const minor = Number(m[2]) + 1;
  return minor >= 10 ? `V${major + 1}` : `V${major}.${minor}`;
}

/**
 * 指标评估与进化判定。
 * @param {object} correction 矛盾处置报告
 * @param {number} newDataCount 本轮新增条目数
 * @param {number} totalDataCount 条目总数
 * @param {number} crushingLeverageScore 破碎效率杠杆得分（0-1，由调用方给）
 */
export function evaluateAndEvolve(correction, newDataCount, totalDataCount, crushingLeverageScore = 0) {
  const total = Math.max(totalDataCount, 1);
  const metrics = {
    data_coverage: Number(Math.min(newDataCount / total, 1).toFixed(3)),
    conflict_resolution_rate: correction?.resolution_rate ?? 0,
    crushing_leverage_score: Number(Number(crushingLeverageScore).toFixed(3)),
    knowledge_graph_density: Number((total / 1000).toFixed(4)),
  };
  const shouldEvolve = metrics.conflict_resolution_rate >= 0.8
    && metrics.data_coverage >= 0.3
    && metrics.crushing_leverage_score >= 0.6;
  return { metrics, should_evolve: shouldEvolve };
}

/** 优化建议（移植 get_optimization_suggestions，并加入本插件的实际缺口）。 */
export function optimizationSuggestions(metrics, gaps = []) {
  const s = [];
  if ((metrics.data_coverage ?? 0) < 0.5) {
    s.push({ priority: 'high', action: '扩大数据源覆盖范围', target: '增加非英语来源（俄语/西班牙语/德语）与俄蒙非洲项目资料' });
  }
  if ((metrics.conflict_resolution_rate ?? 0) < 0.9) {
    s.push({ priority: 'medium', action: '提升矛盾处置率', target: '对 open 冲突逐条裁决并回填 resolution_basis' });
  }
  if ((metrics.crushing_leverage_score ?? 0) < 0.6) {
    s.push({ priority: 'high', action: '强化破碎效率杠杆分析', target: '补充 MCFM / 速度均匀化 / 多梯度衬板 的现场实测数据' });
  }
  s.push({ priority: 'medium', action: '扩充知识图谱实体与关系', target: '增加「设备-矿物-工艺-MCFM」四元组关系' });
  for (const g of gaps ?? []) {
    s.push({ priority: g.priority ?? 'medium', action: `补缺口：${g.title}`, target: g.how ?? g.detail ?? '' });
  }
  return s;
}

/* ==========================================================================
 * 四、行业情报哨兵（山特维克 / 美卓 / 专利 / 标准）
 * ========================================================================== */

/** 固定观测面：谁、看什么、多久看一次、看到什么记到哪。 */
export const WATCHLIST = [
  {
    id: 'W-SANDVIK', category: '竞品动向', target: '山特维克 Sandvik Rock Processing',
    why: 'CH/CS/CG 系列与本插件 NS/NH 系列直接竞争；ASRi 控制系统、衬板材料专利、腔型设计是主要对标点',
    sources: ['rocktechnology.sandvik（新闻与产品页）', 'sandvik.com 新闻中心', 'Sandvik 年报/季报', '公开技术样本 PDF'],
    queries: ['Sandvik CH CS cone crusher new model 2026', 'Sandvik ASRi update', '山特维克 圆锥破碎机 新品'],
    cadenceDays: 30, tags: ['竞品', '山特维克'],
  },
  {
    id: 'W-METSO', category: '竞品动向', target: '美卓 Metso（含 Bruno 仿真生态）',
    why: 'HP/GP 系列、IC 系列控制、Bruno 选型软件与本插件功能重叠；其参数曲线与算法口径是行业基准',
    sources: ['metso.com 新闻与产品页', 'mogroup2.cn', 'Metso 年报/季报', '公开白皮书与技术文章'],
    queries: ['Metso HP GR cone crusher launch 2026', 'Metso Bruno update', '美卓 圆锥破碎机 新品'],
    cadenceDays: 30, tags: ['竞品', '美卓'],
  },
  {
    id: 'W-PATENT-CN', category: '专利', target: '中国专利（CNIPA）破碎机相关',
    why: '国内同行专利直接反映技术路线与侵权风险；也是我方腔型/衬板创新的查新来源',
    sources: ['pss-system.cponline.cnipa.gov.cn', 'epub.cnipa.gov.cn', 'Google Patents 中文'],
    queries: ['IPC B02C 圆锥破碎机 2026 公开', '多缸液压圆锥破碎机 专利', '破碎腔型 衬板 专利'],
    cadenceDays: 30, tags: ['专利', '中国'],
  },
  {
    id: 'W-PATENT-INTL', category: '专利', target: '国际专利（Espacenet / WIPO / Google Patents）',
    why: '掌握 Sandvik/Metso/FLSmidth 的专利布局，规避海外项目侵权风险',
    sources: ['worldwide.espacenet.com', 'patentscope.wipo.int', 'patents.google.com'],
    queries: ['B02C 2/00 cone crusher patent 2026', 'Sandvik cone crusher patent', 'Metso crusher chamber patent', 'cone crusher liner profile patent'],
    cadenceDays: 30, tags: ['专利', '国际'],
  },
  {
    id: 'W-STD', category: '标准规范', target: '国家标准 / 行业标准',
    why: 'GB/JB 更新会直接影响设计合规与投标资格',
    sources: ['std.samr.gov.cn', 'openstd.samr.gov.cn', '全国标准信息公共服务平台'],
    queries: ['圆锥破碎机 国家标准 更新', 'JB/T 破碎机 新标准', 'GB 砂石骨料 生产线 标准'],
    cadenceDays: 90, tags: ['标准'],
  },
  {
    id: 'W-MARKET', category: '市场', target: '矿山机械与骨料市场数据',
    why: '五维分析里的"行业"与"时效"维度需要可核查的市场口径',
    sources: ['中国砂石协会', 'Mining.com / Mining Magazine', '上市公司年报（中信重工/北方重工等）', '海关进出口数据'],
    queries: ['全球矿山机械市场规模 2026', '中国砂石骨料产量 2026', '圆锥破碎机 进口 出口 数据'],
    cadenceDays: 90, tags: ['市场'],
  },
];

/** 计算哪些观测项已到期。 */
export function dueWatchItems(watchState, now = new Date()) {
  const due = [];
  for (const w of WATCHLIST) {
    const last = watchState?.[w.id];
    if (!last) { due.push({ ...w, last_checked: null, overdue_days: null, reason: '从未采集' }); continue; }
    const days = Math.floor((now - new Date(last)) / 86400000);
    if (days >= w.cadenceDays) {
      due.push({ ...w, last_checked: last, overdue_days: days - w.cadenceDays, reason: `距上次 ${days} 天，超过 ${w.cadenceDays} 天周期` });
    }
  }
  return due;
}

/* ==========================================================================
 * 五、知识条目写入（自我丰富）
 * ========================================================================== */

/** 生成稳定的条目 id。 */
function makeId(prefix, seq) {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

/**
 * 写入一批知识条目。
 * 铁律：**无来源拒收**（Python 原版无此校验，此处为工程加固）。
 * @param {object} input { entries:[{title, content, source_url, source_type, publish_date, tags, kind, verification_status}], actor, rationale, confirm_resolutions }
 */
export function ingestKnowledge(input = {}) {
  const store = loadStore();
  const accepted = [];
  const rejected = [];
  const now = new Date().toISOString();
  let seq = store.entries.length;

  for (const raw of input.entries ?? []) {
    if (!raw || !raw.title || !raw.content) { rejected.push({ entry: raw, reason: '缺少 title 或 content' }); continue; }
    if (!raw.source_url || String(raw.source_url).trim() === '') {
      rejected.push({ entry: { title: raw.title }, reason: '缺少 source_url —— 本插件拒收无来源条目（防止把猜测写进知识库）' });
      continue;
    }
    seq += 1;
    const credibility = raw.credibility ?? evaluateCredibility(raw.source_url, raw.source_type ?? 'media', raw.has_peer_review === true, raw.citation_count ?? 0);
    const entry = {
      id: makeId('KB', seq),
      kind: raw.kind ?? 'intel',
      title: raw.title,
      content: raw.content,
      source_url: raw.source_url,
      source_type: raw.source_type ?? 'media',
      credibility,
      publish_date: raw.publish_date ?? null,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      subject: raw.subject ?? null,
      captured_at: now,
      captured_by: input.actor ?? 'ai',
      verification_status: raw.verification_status ?? 'pending',
      supersedes: raw.supersedes ?? null,
    };
    entry._entities = extractEntities(entry);
    accepted.push(entry);
  }

  if (accepted.length === 0) {
    return {
      accepted: 0, rejected, store_revision: store.revision, model_version: store.model_version,
      message: rejected.length ? '全部条目被拒（缺来源或必填字段）' : '没有提供条目',
      hints: ['每条必须带 source_url；来源类型 official/academic/report/conference/media/expert 会影响可信度评分'],
    };
  }

  const allEntries = [...store.entries, ...accepted];

  // 矛盾检测：对所有涉及数值的字段做两两比较
  const fields = Array.isArray(input.check_fields) && input.check_fields.length
    ? input.check_fields
    : ['power_kw', 'capacity_tph', 'css_mm', 'price_wan', 'energy_kwh_t', 'lifetime_h', 'mcfm'];
  const newConflicts = [];
  const scope = input.conflict_scope ?? 'entity';
  for (const f of fields) {
    for (const c of detectNumericConflict(allEntries, f, input.tolerance ?? 0.1, { scope })) {
      const dup = store.conflicts.some((x) => x.field === c.field && x.source_a === c.source_a && x.source_b === c.source_b && x.value_a === c.value_a && x.value_b === c.value_b);
      if (!dup) newConflicts.push(c);
    }
  }
  const conflicts = [...store.conflicts, ...newConflicts];

  // 版本演进判定
  const corr = correctionReport(conflicts);
  const evolution = evaluateAndEvolve(corr, accepted.length, allEntries.length, input.crushing_leverage_score ?? store.metrics.crushing_leverage_score ?? 0);
  let version = store.model_version;
  let versionBumped = false;
  if (evolution.should_evolve) {
    version = nextVersion(version);
    versionBumped = true;
  }

  const updated = {
    ...store,
    revision: store.revision + 1,
    model_version: version,
    updated_at: now,
    entries: allEntries,
    conflicts,
    metrics: evolution.metrics,
  };
  writeJson(storePath(), updated);
  appendLog(logPath(), {
    at: now, actor: input.actor ?? 'ai', action: 'ingest', revision: updated.revision,
    accepted: accepted.map((a) => ({ id: a.id, title: a.title, credibility: a.credibility, source_url: a.source_url })),
    rejected, new_conflicts: newConflicts.length, metrics: evolution.metrics,
    version_before: store.model_version, version_after: version, version_bumped: versionBumped,
    rationale: input.rationale ?? null,
  });

  return {
    accepted: accepted.length,
    accepted_entries: accepted.map((a) => ({ id: a.id, title: a.title, credibility: a.credibility, source: a.source_url, kind: a.kind })),
    rejected,
    new_conflicts: newConflicts,
    open_conflicts: conflicts.filter((c) => c.status === 'open').length,
    proposed_conflicts: conflicts.filter((c) => c.status === 'resolved_proposed').length,
    metrics: evolution.metrics,
    should_evolve: evolution.should_evolve,
    version_before: store.model_version,
    version_after: version,
    version_bumped: versionBumped,
    store_revision: updated.revision,
    store_path: storePath(),
    notes: [
      'auto_by_credibility 只产出建议值（resolved_proposed），要用于选型必须人工确认',
      '本轮新增条目已进入知识库；插件升级不会覆盖该目录',
    ],
  };
}

/** 人工确认一条矛盾处置（把 resolved_proposed → resolved）。 */
export function confirmConflict(input = {}) {
  const store = loadStore();
  const idx = store.conflicts.findIndex((c) => c.field === input.field && c.source_a === input.source_a && c.source_b === input.source_b);
  if (idx < 0) return { ok: false, message: '未找到该冲突记录', store_revision: store.revision };
  const approved = input.approve !== false;
  const target = store.conflicts[idx];
  const now = new Date().toISOString();
  if (approved) {
    Object.assign(target, {
      status: 'resolved',
      resolution: input.resolution ?? target.resolution ?? 'manual_confirmed',
      resolved_value: input.resolved_value ?? target.resolved_value ?? null,
      resolution_basis: input.basis ?? `人工确认 @${now} by ${input.actor ?? 'human'}`,
      requires_confirmation: false,
      confirmed_at: now,
    });
  } else {
    Object.assign(target, {
      status: 'open',
      resolution: 'rejected_by_reviewer',
      resolution_basis: input.basis ?? `人工否决自动建议 @${now} by ${input.actor ?? 'human'}`,
      requires_confirmation: true,
      confirmed_at: now,
    });
  }
  store.updated_at = now;
  store.conflicts[idx] = target;
  store.revision += 1;
  const corr = correctionReport(store.conflicts);
  store.metrics.conflict_resolution_rate = corr.resolution_rate;
  writeJson(storePath(), store);
  appendLog(logPath(), { at: now, actor: input.actor ?? 'human', action: 'confirm_conflict', field: input.field, approved, revision: store.revision });
  return { ok: true, conflict: target, resolution_rate: corr.resolution_rate, store_revision: store.revision };
}

/* ==========================================================================
 * 六、PDCA 循环台账
 * ========================================================================== */

export function loadPdca() {
  return readJson(pdcaPath(), { cycles: [] });
}

/**
 * 记录一轮 PDCA。
 * @param {object} input { plan, do: string[], check, act, actor }
 */
export function recordPdca(input = {}) {
  const ledger = loadPdca();
  const store = loadStore();
  const corr = correctionReport(store.conflicts);
  const metrics = { ...store.metrics, conflict_resolution_rate: corr.resolution_rate };
  const cycle = {
    round: ledger.cycles.length + 1,
    at: new Date().toISOString(),
    actor: input.actor ?? 'ai',
    model_version: store.model_version,
    store_revision: store.revision,
    entries: store.entries.length,
    open_conflicts: corr.open_conflicts,
    proposed_conflicts: corr.resolved_conflicts,
    metrics,
    plan: input.plan ?? null,
    do: input.do ?? [],
    check: input.check ?? null,
    act: input.act ?? null,
    next_actions: optimizationSuggestions(metrics, store.gaps),
  };
  ledger.cycles.push(cycle);
  writeJson(pdcaPath(), ledger);
  appendLog(logPath(), { at: cycle.at, actor: cycle.actor, action: 'pdca', round: cycle.round, metrics });
  return { cycle, total_rounds: ledger.cycles.length, ledger_path: pdcaPath() };
}

/* ==========================================================================
 * 七、状态总览
 * ========================================================================== */

export function evolutionStatus() {
  const store = loadStore();
  const ledger = loadPdca();
  const corr = correctionReport(store.conflicts);
  const due = dueWatchItems(store.watch_state);
  const metrics = { ...store.metrics, conflict_resolution_rate: corr.resolution_rate };
  return {
    model_version: store.model_version,
    store_revision: store.revision,
    store_path: storePath(),
    kb_dir: kbDir(),
    entries: store.entries.length,
    entries_by_kind: store.entries.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc; }, {}),
    credibility_histogram: store.entries.reduce((acc, e) => { acc[e.credibility] = (acc[e.credibility] ?? 0) + 1; return acc; }, {}),
    conflicts: { total: corr.total_conflicts, open: corr.open_conflicts, proposed: corr.resolved_conflicts, resolution_rate: corr.resolution_rate },
    metrics,
    should_evolve_now: evaluateAndEvolve(corr, 0, store.entries.length, metrics.crushing_leverage_score).should_evolve,
    pdca_rounds: ledger.cycles.length,
    last_cycle: ledger.cycles.at(-1) ?? null,
    watch_due: due.map((d) => ({ id: d.id, target: d.target, reason: d.reason })),
    watch_total: WATCHLIST.length,
    next_actions: optimizationSuggestions(metrics, store.gaps),
    gaps: store.gaps,
    evolution_rules: {
      evolve_when: '矛盾处置率 ≥ 0.80 且 数据覆盖率 ≥ 0.30 且 破碎杠杆得分 ≥ 0.60（与 Python 源模型同阈值）',
      version_scheme: 'V1 → V1.1 → … → V1.9 → V2',
      guardrails: ['无来源拒收', '可信度裁决只产出建议值，须人工确认', '冲突并列保留、不取平均'],
    },
  };
}

/** 生成一份可直接执行的情报研究简报（把"该看什么"变成"照着做"）。 */
export function intelBrief(focus) {
  const store = loadStore();
  const due = dueWatchItems(store.watch_state);
  const items = focus ? WATCHLIST.filter((w) => w.id === focus || w.category === focus || w.target.includes(String(focus))) : due;
  const targets = items.length ? items : WATCHLIST;
  return {
    generated_at: new Date().toISOString(),
    due_only: !focus,
    items: targets.map((w) => ({
      id: w.id, category: w.category, target: w.target, why: w.why,
      cadence_days: w.cadenceDays, last_checked: store.watch_state?.[w.id] ?? null,
      sources: w.sources,
      queries: w.queries,
      record_as: {
        tool: 'mackorn_knowledge_update',
        required: ['title', 'content', 'source_url', 'source_type'],
        source_type_options: Object.keys(SOURCE_WEIGHTS),
        tags: w.tags,
        kind: w.category === '专利' ? 'patent' : w.category === '标准规范' ? 'standard' : w.category === '市场' ? 'market' : 'intel',
      },
      credibility_hint: '官方/学术=5，报告/会议=4，媒体/专家=3；域名在白名单内自动提档',
    })),
    workflow: [
      '1) 用你的 web 搜索/抓取工具按 queries 检索（本插件自身不联网，检索由 AI 完成）',
      '2) 对每条有效发现，摘出「事实 + 数字 + 出处链接 + 发布日期」',
      '3) 调用 mackorn_knowledge_update 写入，source_url 必填（否则拒收）',
      '4) 工具会自动做可信度分级与数值矛盾检测；出现矛盾会并列保留并标 open/proposed',
      '5) 调用 mackorn_pdca_status 看指标与本轮应做什么；对 open 矛盾用 confirm 逐条裁决',
      '6) 定期调用 mackorn_pdca_status 记录 PDCA 轮次，形成周而复始的优化循环',
    ],
    honesty_note: '本插件不发起网络请求：情报获取由具备联网能力的 AI 完成，插件负责纪律（必填来源）、可信度分级、矛盾检测、版本演进与 PDCA 留痕。',
  };
}

/** 标记某个观测项已采集（由 update 流程调用）。 */
export function markWatched(id) {
  const store = loadStore();
  store.watch_state = { ...(store.watch_state ?? {}), [id]: new Date().toISOString() };
  store.updated_at = new Date().toISOString();
  writeJson(storePath(), store);
  return store.watch_state[id];
}
