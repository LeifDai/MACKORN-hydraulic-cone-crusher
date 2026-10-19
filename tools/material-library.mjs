/**
 * 材料库 CL0001.1 —— 不同岩石/矿石的性质
 *
 * 用户需求：「编程爬取不同岩石、矿石的性质形成材料库CL0001.1；夯实工艺的基础，
 *            基于不同的材料性质…优化插件选型能力」
 *
 * 设计原则（与插件纪律一致）：
 *   ① 每个数值必须带来源等级（S1厂商 / LITERATURE / ENGINEERING-RANGE / MACKORN-measured）
 *   ② 区间就报区间，不取中点假装精确
 *   ③ 来源冲突时并列显示，不平均
 *   ④ 查不到就 null，不编
 *
 * 来源：
 *   · Bond 功指数 Wi：选矿教科书公开典型区间（已内置于 simulate.mjs）
 *   · 抗压强度 / 硬度 / 密度：公开岩石力学手册区间 + 现场经验
 *   · 磨蚀性（AI 指数）：公开文献区间
 *   · 网络补充：可跑 tools/crawl_materials.mjs 用公开来源扩充并标注出处
 *
 * 用途：
 *   · 选型时按矿石性质调整破碎段数、腔型、CSS 与衬板材质
 *   · 标定时给参数初值与合理区间
 *   · 报价与磨损预测的输入
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { MATERIALS, SOURCE_LEVELS } from '../plugin/lib/data.mjs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const LIB_DIR = join(ROOT, 'distribution', '07_库');
mkdirSync(LIB_DIR, { recursive: true });
const FILE = 'CL0001.1-材料库.json';

/** 来源等级 */


/**
 * 内置材料数据
 * 每个字段形如 { v: 值 或 [lo,hi], src: 'S3', note: '出处' }
 * 没有的字段用 null —— 不编。
 */


/** 读库（不存在则用内置数据初始化） */
export function loadMaterials() {
  const p = join(LIB_DIR, FILE);
  if (existsSync(p)) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { } }
  const lib = {
    lib: 'CL0001.1', name: '材料库', created: new Date().toISOString(),
    source_levels: SOURCE_LEVELS,
    discipline: '区间就报区间不取中点；来源冲突并列不平均；查不到返回 null 不编造',
    materials: MATERIALS,
    web_enriched: [],
    note: '内置数据来自公开文献典型区间（S3）与 MACKORN 工程经验（S4）。联网扩充请跑 tools/crawl_materials.mjs。',
  };
  writeFileSync(p, JSON.stringify(lib, null, 2), 'utf8');
  return lib;
}

/** 按名称查材料（支持中英文模糊匹配） */
export function getMaterial(name) {
  const lib = loadMaterials();
  const q = String(name || '').toLowerCase().trim();
  if (!q) return null;
  for (const [cn, m] of Object.entries(lib.materials)) {
    if (cn === name || (m.en || '').toLowerCase().includes(q) || q.includes(cn)) return { key: cn, ...m };
  }
  return null;
}

/** 取某属性的数值（区间取 [lo,hi]；单值取 v） */
export function materialValue(name, field) {
  const m = getMaterial(name);
  if (!m || !m[field] || m[field].v == null) return null;
  const v = m[field].v;
  return { value: v, is_range: Array.isArray(v), source: m[field].src, note: m[field].note || null };
}

/** 选型建议：基于材料性质给出腔型/段数/衬板提示 */
export function selectionHints(name) {
  const m = getMaterial(name);
  if (!m) return null;
  const ucs = m.ucs_mpa && m.ucs_mpa.v ? (Array.isArray(m.ucs_mpa.v) ? m.ucs_mpa.v : [m.ucs_mpa.v, m.ucs_mpa.v]) : null;
  const ai = m.abrasion_ai && m.abrasion_ai.v ? (Array.isArray(m.abrasion_ai.v) ? m.abrasion_ai.v : [m.abrasion_ai.v, m.abrasion_ai.v]) : null;
  const wear = ai ? (ai[1] >= 0.6 ? '极高（衬板消耗是主成本项）' : ai[1] >= 0.4 ? '高' : ai[1] >= 0.25 ? '中' : '低') : null;
  const hard = ucs ? (ucs[1] >= 250 ? '很硬' : ucs[1] >= 150 ? '硬' : ucs[1] >= 80 ? '中等' : '较软') : null;
  return {
    material: name, group: m.group, hardness_grade: hard, wear_grade: wear,
    cavity_hint: m.cavity_hint, stage_hint: m.stage_hint, notes: m.notes,
    sources: Object.fromEntries(Object.entries(m).filter(([, v]) => v && typeof v === 'object' && v.src).map(([k, v]) => [k, v.src + (v.note ? ' · ' + v.note : '')])),
  };
}

/** 交叉校验：把材料库的 Wi 与插件内 Bond 表对比（发现冲突就并列报出） */
export function crossCheckWi(bondTable) {
  const lib = loadMaterials();
  const out = [];
  for (const [cn, m] of Object.entries(lib.materials)) {
    if (!bondTable[cn] || !m.wi_kwh_t) continue;
    const a = bondTable[cn], b = Array.isArray(m.wi_kwh_t.v) ? m.wi_kwh_t.v : [m.wi_kwh_t.v, m.wi_kwh_t.v];
    const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
    out.push({ material: cn, plugin_bond: a, library: b, overlap: overlap > 0, verdict: overlap > 0 ? '一致（区间有交叠）' : '冲突 —— 并列显示，不平均' });
  }
  return out;
}

export function runCli() {
  if (process.argv[1] && process.argv[1].endsWith('material-library.mjs')) {
    const cmd = process.argv[2] || '--list';
    if (cmd === '--list') {
      const lib = loadMaterials();
      console.log('\n' + '═'.repeat(96));
      console.log('  材料库 CL0001.1 —— ' + Object.keys(lib.materials).length + ' 种材料');
      console.log('═'.repeat(96) + '\n');
      for (const [cn, m] of Object.entries(lib.materials)) {
        const u = m.ucs_mpa ? JSON.stringify(m.ucs_mpa.v) : '—';
        const w = m.wi_kwh_t ? JSON.stringify(m.wi_kwh_t.v) : '—';
        console.log('  ' + cn.padEnd(6) + (m.en || '').padEnd(22) + 'UCS ' + u.padEnd(14) + 'Wi ' + w.padEnd(12) + m.crushability);
      }
      console.log('\n  存放: ' + join(LIB_DIR, FILE) + '\n');
    } else if (cmd === '--hints') {
      const name = process.argv[3];
      const h = selectionHints(name);
      console.log(h ? JSON.stringify(h, null, 2) : '未找到材料: ' + name);
    }
  }

}


/* 仅当【直接运行】本文件时才执行 CLI —— 模块必须可被安全导入（教训 L-32） */
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) runCli();
