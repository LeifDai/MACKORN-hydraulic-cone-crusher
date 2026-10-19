/**
 * 把材料库与知识库接进 selectConeCrusher 与 sizePlant 的输出
 *
 * 目标（用户要求）：
 *   ① 给料合理性体检 —— 给料粒度 × 材料硬度 × 腔型是否自洽
 *   ② 腔型/段数/衬板提示 —— 来自材料库
 *   ③ 已知错误主动拦截 —— 来自错误库
 *   且【不破坏】原有的 assumptions / warnings 纪律
 *
 * 做法：新增 knowledge_check 字段，并把它产生的告警【并入】原有 warnings
 *       （不新开一套告警体系，避免用户要看好几处）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'plugin', 'lib', 'engine.mjs');
let c = readFileSync(P, 'utf8');
const n0 = c.length;

/* ① import（已手工加入 engine.mjs）*/
console.log('  ○ import 已由手工处理');

/* ② selectConeCrusher：在 return 之前算知识体检 */
if (!c.includes('const kcheck = buildKnowledgeCheck')) {
  const anchor = `  return {
    request: { targetTph, maxFeedMm, targetProductMm, stage, ore, units, closedCircuit },`;
  if (!c.includes(anchor)) { console.error('  ❌ 找不到 selectConeCrusher 的 return 锚点'); process.exit(1); }
  c = c.replace(anchor, `  /* ── 知识体检：材料库 + 经验库 + 错误库 + 对标案例 ──
   * 只在能给建议时产生内容；库不可用或材料未收录时返回 found:false，
   * 绝不编造材料性质（CLAUDE.md 硬规矩：查不到就 null）。
   */
  const kcheck = buildKnowledgeCheck({
    ore, maxFeedMm, targetProductMm, stage, targetTph,
    cavityPool: effectivePool, topPick: ranked[0] ?? null,
  });
  for (const w of (kcheck.warnings || [])) if (!warnings.includes(w)) warnings.push(w);

${anchor}`);
  console.log('  ✅ selectConeCrusher 已加知识体检');
} else console.log('  ○ selectConeCrusher 已有');

/* ③ selectConeCrusher：return 里加字段 */
if (!c.includes('knowledge_check: kcheck,')) {
  c = c.replace(`    candidates: ranked.slice(0, 8),
    top_pick: ranked[0] ?? null,
    alternatives: ranked.slice(1, 4),
    assumptions,
    warnings,
  };`, `    candidates: ranked.slice(0, 8),
    top_pick: ranked[0] ?? null,
    alternatives: ranked.slice(1, 4),
    knowledge_check: kcheck,
    assumptions,
    warnings,
  };`);
  console.log('  ✅ selectConeCrusher 返回体已加 knowledge_check');
}

/* ④ sizePlant：同样接入 */
if (!c.includes('const kcheckPlant = buildKnowledgeCheck')) {
  const anchor = `  return {
    request: { targetTph, maxFeedMm, productMm, ore, closedCircuit, washing },`;
  if (!c.includes(anchor)) { console.error('  ❌ 找不到 sizePlant 的 return 锚点'); process.exit(1); }
  c = c.replace(anchor, `  /* ── 整线知识体检：整线看的是"末段圆锥破给料"与"材料适配"，不是原矿给料 ── */
  const kcheckPlant = buildKnowledgeCheck({
    ore, maxFeedMm, targetProductMm: productMm, stage: null, targetTph,
    cavityPool: cone.recommended_cavity_pool, topPick: cone.top_pick ?? null,
    isPlant: true,
    fineConeCavityPool: fineCone ? fineCone.recommended_cavity_pool : null,
  });
  for (const w of (kcheckPlant.warnings || [])) if (Array.isArray(warnings) && !warnings.includes(w)) warnings.push(w);

${anchor}`);
  console.log('  ✅ sizePlant 已加知识体检');
} else console.log('  ○ sizePlant 已有');

if (!c.includes('knowledge_check: kcheckPlant,')) {
  c = c.replace(`    total_reduction_ratio: pyRound(totalRatio, 2),`,
    `    total_reduction_ratio: pyRound(totalRatio, 2),
    knowledge_check: kcheckPlant,`);
  console.log('  ✅ sizePlant 返回体已加 knowledge_check');
}

/* ⑤ 新增 buildKnowledgeCheck 函数（放在文件末尾） */
if (!c.includes('function buildKnowledgeCheck')) {
  c += `

/* ══════════════════════════════════════════════════════════════════
 * 知识体检 —— 把材料库 / 经验库 / 错误库 / 案例库接进选型
 *
 * 设计纪律：
 *   · 库不可用时返回 available:false，不报错、不编造
 *   · 材料未收录时返回 found:false 并列出已收录材料，不猜性质
 *   · 产生的告警【并入】调用方的 warnings 数组，不新开一套体系
 *   · 每条建议都带来源（材料库 S3/S4 / 错误库 / 案例库）
 * ══════════════════════════════════════════════════════════════════ */
function buildKnowledgeCheck({ ore, maxFeedMm, targetProductMm, stage, targetTph, cavityPool, topPick, isPlant = false, fineConeCavityPool = null }) {
  const out = {
    available: true,
    material: null,
    compatibility: [],
    known_error_guard: [],
    reference_cases: null,
    warnings: [],
    sources: [],
  };

  /* ① 材料库：性质 + 腔型/段数/衬板提示 */
  let mh = null;
  try { mh = materialHints(ore); } catch { out.available = false; }
  if (mh && mh.found) {
    out.material = {
      name: mh.material, name_en: mh.name_en, group: mh.group,
      hardness_grade: mh.hardness_grade, hardness_basis: mh.hardness_basis,
      wear_grade: mh.wear_grade, wear_basis: mh.wear_basis,
      crushability: mh.crushability,
      ucs_range_mpa: mh.ucs_range_mpa, ai_range: mh.ai_range,
      cavity_hint: mh.cavity_hint, stage_hint: mh.stage_hint, notes: mh.notes,
      source: 'CL0001.1 材料库（公开文献典型区间 S3 / MACKORN 工程经验 S4）',
    };
    out.sources.push('CL0001.1 材料库');

    /* ② 给料合理性体检：给料粒度 × 材料硬度 × 腔型池 */
    const ucs = mh.ucs_range_mpa;
    const hard = ucs ? (ucs[0] + ucs[1]) / 2 : null;
    const feed = Number.isFinite(Number(maxFeedMm)) ? Number(maxFeedMm) : null;

    if (feed != null && hard != null) {
      // 硬料 + 大给料 → 中碎段负荷重，需要确认功率裕度
      if (hard >= 150 && feed >= 200) {
        out.compatibility.push({ level: 'attention', item: '硬料 + 大给料', detail: '抗压强度中位数 ' + hard.toFixed(0) + ' MPa（硬），给料 ' + feed + ' mm 偏大 —— 中碎段单位能耗高，建议确认装机功率裕度并优先选大功率机型', source: '材料库 × 给料粒度' });
      }
      // 软料 + 小给料 → 可能用不上圆锥破的层压优势
      if (hard < 80 && feed < 60 && !isPlant) {
        out.compatibility.push({ level: 'info', item: '软料 + 小给料', detail: '材料偏软（中位数 ' + hard.toFixed(0) + ' MPa）且给料不大 —— 圆锥破可用，但需确认是否高估了能耗；软料层压破碎时循环负荷通常偏低', source: '材料库 × 给料粒度' });
      }
      // 磨蚀高 → 衬板成本提示（这个必须显著）
      if (mh.wear_grade === '极高' || mh.wear_grade === '高') {
        out.compatibility.push({ level: 'attention', item: '衬板消耗', detail: '磨蚀等级「' + mh.wear_grade + '」—— 衬板消耗会成为主要运行成本项，选材（高铬铸铁/陶瓷复合）与备件库存必须体现在方案里', source: '材料库磨蚀指数' });
      }
    }

    /* ③ 腔型提示与实际腔型池的一致性检查 */
    if (cavityPool && Array.isArray(cavityPool) && cavityPool.length && mh.cavity_hint) {
      out.compatibility.push({ level: 'info', item: '腔型建议', detail: '材料库建议：' + mh.cavity_hint + '　本工具按给料粒度给出的腔型池：' + cavityPool.join('/'), source: '材料库 + 本工具腔型规则（S1 §4.2）' });
    }
    if (targetProductMm != null && mh.stage_hint) {
      out.compatibility.push({ level: 'info', item: '段数建议', detail: '材料库建议：' + mh.stage_hint + '　目标产品 ' + targetProductMm + ' mm', source: '材料库' });
    }

    /* ④ 材料自带的告警并入 */
    for (const w of (mh.warnings || [])) out.warnings.push('[材料库] ' + w);
  } else if (ore) {
    out.material = { found: false, queried: ore, note: mh ? mh.note : '材料库不可用', available_materials: mh ? mh.available_materials : null };
  }

  /* ⑤ 错误库：把与选型相关的已确认/已修复错误作为前置提醒 */
  try {
    const kb = selectionKnowledge({ ore, target_tph: targetTph });
    if (kb && kb.preflight) {
      out.known_error_guard = kb.preflight.filter((x) => x.verdict === '正判' || x.verdict === '已修复').map((x) => ({ id: x.id, verdict: x.verdict, check: x.claim, fix: x.fix }));
      if (out.known_error_guard.length) out.sources.push('CW0001.1 错误库');
    }
    if (kb && kb.reference_cases && kb.reference_cases.matched && kb.reference_cases.matched.length) {
      out.reference_cases = {
        total_effective: kb.reference_cases.total_effective,
        matched: kb.reference_cases.matched.slice(0, 5),
        disclaimer: kb.reference_cases.disclaimer,
      };
      out.sources.push('XXAL1000.1 案例库');
    }
    // 案例太少要如实说（目标要求：不美化）
    if (kb && kb.warnings) for (const w of kb.warnings) out.warnings.push('[知识库] ' + w);
  } catch { /* 库不可用不影响主流程 */ }

  out.rule = '材料性质来自公开文献区间（S3）与 MACKORN 工程经验（S4），不取中点做分级以外的推断；查不到就返回 found:false，不猜。竞品案例仅作对标，不作为 MACKORN 能力承诺。';
  return out;
}
`;
  console.log('  ✅ 已新增 buildKnowledgeCheck()');
}

writeFileSync(P, c, 'utf8');
console.log('\n  engine.mjs: ' + n0 + ' → ' + c.length + ' 字符');
