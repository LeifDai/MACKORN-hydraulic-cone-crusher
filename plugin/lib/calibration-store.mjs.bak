/**
 * 标定值仓库（calibration-store.mjs）
 * ============================================================================
 * 解决的问题：`mackorn_calibrate` 算出的实测参数，之前只写进知识库就**没人用**——
 * 选型与仿真仍然用文献默认值。这是"标定完了等于没标"的空头承诺。
 *
 * 本模块把知识库里的标定条目读回来，按「机型 + 腔型 + CSS 区间」匹配，
 * 供 simulate / sim-adapter 作为**默认破碎函数参数**使用，并在输出中如实标注
 * 参数来源是 `MACKORN-实测` 还是 `LITERATURE`。
 *
 * 匹配纪律（宁可不用，不可用错）：
 *   · 必须机型一致（KB 条目里认得出来才用）
 *   · 必须腔型一致（若条目写了腔型）
 *   · CSS 必须落在该条目标定的 ±30% 区间内
 *   · 三条任一不满足 → 返回 null，回退文献默认值，并说明原因
 * ============================================================================
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const LITERATURE_BREAKAGE = { phi: 0.45, gamma: 0.7, beta: 3.5, throwFactor: 0.8 };
export const LITERATURE_SOURCE = 'LITERATURE (Whiten 1972 / Napier-Munn et al.)';

/** 知识库目录：允许用环境变量覆盖（测试/多租户用）。 */
export function kbDir() {
  return process.env.MACKORN_KB_DIR || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'mackorn-knowledge');
}

function readStore() {
  const p = join(kbDir(), 'store.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** 从条目的标题/正文/标签里抠出机型、腔型、CSS、参数。 */
function parseCalibrationEntry(e) {
  const hay = [e.title, e.content, (e.tags || []).join(' '), e.subject || ''].join(' ');
  const isCalib = /标定|calibrat/i.test(hay) || (e.tags || []).some((t) => /标定|calibration/i.test(t));
  if (!isCalib) return null;

  const model = (hay.match(/\b(N[HS]\d{3})\b/i) || [])[1];
  const cavity = (hay.match(/\b(EC|MC|MF|EFX|EEF|C|M|F|EF)\b/) || [])[1];
  const num = (label) => {
    const m = new RegExp(`${label}\\s*[=:：]?\\s*([0-9]*\\.?[0-9]+)`, 'i').exec(hay);
    return m ? Number(m[1]) : null;
  };
  const phi = num('phi') ?? num('φ');
  const gamma = num('gamma') ?? num('γ');
  const beta = num('beta') ?? num('β');
  const throwFactor = num('throwFactor') ?? num('啮合系数');
  const css = num('css') ?? num('css_mm');
  const rmse = num('rmse');

  if (![phi, gamma, beta].every((v) => Number.isFinite(v) && v > 0)) return null;
  if (!(beta > gamma)) return null;

  return {
    id: e.id, title: e.title, model: model ? model.toUpperCase() : null,
    cavity: cavity ? cavity.toUpperCase() : null,
    cssMm: Number.isFinite(css) ? css : null,
    rmse_pct_points: Number.isFinite(rmse) ? rmse : null,
    params: { phi, gamma, beta, ...(Number.isFinite(throwFactor) ? { throwFactor } : {}) },
    credibility: e.credibility, source_url: e.source_url,
  };
}

/**
 * 查标定值。
 * @param {{model?:string, cavity?:string, cssMm?:number, maxCssDeviation?:number}} q
 * @returns {{found:boolean, params:object, source:string, why:string, entry?:object}}
 */
export function getCalibration(q = {}) {
  const miss = (why) => ({ found: false, params: LITERATURE_BREAKAGE, source: LITERATURE_SOURCE, why });
  const store = readStore();
  if (!store?.entries?.length) return miss('知识库无条目或不存在');

  const all = store.entries.map(parseCalibrationEntry).filter(Boolean);
  if (!all.length) return miss('知识库中尚无标定条目（用 mackorn_calibrate 标定后用 mackorn_knowledge_update 落库）');

  const model = q.model ? String(q.model).toUpperCase() : null;
  const cavity = q.cavity ? String(q.cavity).toUpperCase() : null;
  const css = Number.isFinite(Number(q.cssMm)) ? Number(q.cssMm) : null;
  const maxDev = Number.isFinite(Number(q.maxCssDeviation)) ? Number(q.maxCssDeviation) : 0.3;

  let cands = all;
  // 机型：条目写了机型就必须一致（条目没写机型则视为通用，但仍要求 CSS 匹配）
  if (model) {
    const withModel = cands.filter((c) => c.model === model);
    if (withModel.length) cands = withModel;
    else if (cands.every((c) => c.model)) return miss(`无 ${model} 的标定条目（现有：${[...new Set(cands.map((c) => c.model))].join('/')}）`);
  }
  if (cavity) {
    const withCav = cands.filter((c) => !c.cavity || c.cavity === cavity);
    if (withCav.length) cands = withCav;
    else return miss(`无 ${cavity} 腔型的标定条目`);
  }
  if (css !== null) {
    const inRange = cands.filter((c) => c.cssMm === null || Math.abs(c.cssMm - css) / c.cssMm <= maxDev);
    if (inRange.length) cands = inRange;
    else return miss(`CSS ${css} mm 超出该条目标定区间 ±${Math.round(maxDev * 100)}%（标定于 CSS ${cands.map((c) => c.cssMm).filter((v) => v !== null).join('/')} mm）`);
  }

  // 多套取 RMSE 最小（最贴合实测）的
  const best = cands.slice().sort((a, b) => (a.rmse_pct_points ?? 99) - (b.rmse_pct_points ?? 99))[0];
  if (!best) return miss('无匹配条目');

  const label = [best.model, best.cavity, best.cssMm !== null ? `CSS ${best.cssMm}mm` : null].filter(Boolean).join(' · ');
  return {
    found: true,
    params: { ...LITERATURE_BREAKAGE, ...best.params },
    source: `MACKORN-实测标定${label ? `（${label}）` : ''}${best.rmse_pct_points !== null ? `，RMSE ${best.rmse_pct_points} 个百分点` : ''}`,
    why: `命中知识库条目 ${best.id}`,
    entry: best,
  };
}

/** 供工具/技能展示：当前可用的标定条目概览。 */
export function listCalibrations() {
  const store = readStore();
  if (!store?.entries?.length) return { count: 0, entries: [], kb_dir: kbDir(), note: '知识库为空' };
  const all = store.entries.map(parseCalibrationEntry).filter(Boolean);
  return {
    count: all.length,
    kb_dir: kbDir(),
    entries: all.map((c) => ({ id: c.id, model: c.model, cavity: c.cavity, css_mm: c.cssMm, rmse_pct_points: c.rmse_pct_points, params: c.params })),
    note: all.length ? '这些条目会被 mackorn_crusher_curve / mackorn_simulate_flowsheet 自动优先采用' : '尚无标定条目，仿真使用文献默认参数',
  };
}
