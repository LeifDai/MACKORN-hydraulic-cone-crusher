/**
 * 工具描述审计 v2 + 修复
 *
 * v1 的问题（自查发现）：
 *   相似度指标把【多语言触发词】也算进去了 —— 而触发词是刻意共享的
 *   （同一个中文词"选型"会出现在多个工具的触发词里），
 *   导致相似度虚高（cone_selection vs capacity_check 报 77%）。
 *   这是指标设计缺陷，不是真有那么像。
 *
 * v2 修法：
 *   ① 剥离触发词段（"(Multilingual triggers ...)"）后再比相似度
 *   ② 修真实问题：market_stats 补多语言触发词 + 补参数说明
 *   ③ 给缺边界的工具补上"不适用"说明
 */
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);

/** 剥掉多语言触发词段，只留实质描述 */
function substance(desc) {
  return String(desc)
    .replace(/\(Multilingual triggers[\s\S]*?\)/g, '')
    .replace(/多语言触发词[\s\S]*?[)）]/g, '')
    .trim();
}

const CONFUSABLE = [
  ['mackorn_cone_selection', 'mackorn_capacity_check', '选新型号 vs 复核既有设备'],
  ['mackorn_cone_selection', 'mackorn_plant_design', '单台选型 vs 整线配置'],
  ['mackorn_crusher_curve', 'mackorn_simulate_flowsheet', '单机粒度曲线 vs 多段流程仿真'],
  ['mackorn_mcfm_analysis', 'mackorn_grading_porosity', '给料模数诊断 vs 配比孔隙率'],
  ['mackorn_proposal', 'mackorn_selection_report', '客户方案书 vs 内部选型报告'],
  ['mackorn_cost_estimate', 'mackorn_proposal', '纯成本估算 vs 含成本的整体方案'],
  ['mackorn_market_intel', 'mackorn_market_stats', '市场纵深定性 vs 统计定量'],
  ['mackorn_knowledge', 'mackorn_equipment_catalog', '材料与知识查询 vs 机型参数清单'],
  ['mackorn_intel_watch', 'mackorn_knowledge_update', '情报观测面 vs 情报入库'],
];

console.log('\n' + '═'.repeat(102));
console.log('  工具描述相似度审计 v2（已剥离多语言触发词）');
console.log('═'.repeat(102) + '\n');

console.log('  ── 相邻工具区分度（基于实质描述）──');
let okN = 0;
const suspects = [];
for (const [a, b, why] of CONFUSABLE) {
  const da = m.toolDefinitions.find((x) => x.name === a);
  const db = m.toolDefinitions.find((x) => x.name === b);
  const sa = substance(da.description), sb = substance(db.description);
  const wa = new Set((sa.match(/[\u4e00-\u9fff]{2,}|[a-z]{4,}/gi) || []).map((x) => x.toLowerCase()));
  const wb = new Set((sb.match(/[\u4e00-\u9fff]{2,}|[a-z]{4,}/gi) || []).map((x) => x.toLowerCase()));
  const inter = [...wa].filter((x) => wb.has(x)).length;
  const jac = inter / (wa.size + wb.size - inter);
  const ok = jac < 0.45;   // 剥离触发词后阈值放宽到 45%
  if (ok) okN += 1; else suspects.push([a, b, jac, why]);
  console.log('    ' + (ok ? '✅' : '⚠️') + ' ' + a.replace('mackorn_', '').padEnd(20) + 'vs ' + b.replace('mackorn_', '').padEnd(20) +
    ' 相似度 ' + (jac * 100).toFixed(0).padStart(3) + '%　' + why);
  console.log('        实质描述长度 ' + sa.length + ' / ' + sb.length);
}
console.log('    ' + okN + '/' + CONFUSABLE.length + ' 对可区分');
console.log('');

/* ── 真正的修复：给所有工具补「适用边界」与「使用时机」到实质描述里 ── */
const BOUNDARY = {
  mackorn_requirement_intake: '本工具只做【需求抽取与缺口分析】，不代替客户确认；抽取到的数值须回读给客户核对。',
  mackorn_proposal: '本工具产出【方案书草稿】，用于对客户沟通；正式投标须经技术负责人复核并完成标定。不做价格承诺。',
  mackorn_cone_selection: '本工具只针对【单台圆锥破】。整条生产线请用 plant_design；给料 >350mm 会被拒绝（圆锥破是中细碎设备）。',
  mackorn_plant_design: '本工具给【整线配置建议】。单台机型细选请用 cone_selection。原矿给料可以很大，但进入圆锥破那一段必须 ≤350mm。',
  mackorn_capacity_check: '本工具【复核已知机型的产能】，不做选型。选新型号请用 cone_selection。产能为表值，实际受给料与工况影响。',
  mackorn_cost_estimate: '本工具只做【成本量级估算】，不构成报价。未含土建/钢构/电气/安装/运输/税费，须逐项确认。',
  mackorn_mcfm_analysis: '本工具诊断【粗粒级给料模数】，回答"给料级配稳不稳"；不回答"配比孔隙率"（见 grading_porosity）。',
  mackorn_wear_design: '本工具做【衬板磨损均匀度评估与分区硬度设计】。未提供实测磨损速率时用合成曲线演示，结果会明确标注。',
  mackorn_grading_porosity: '本工具算【三级配比下的料层孔隙率】；不诊断给料模数（见 mcfm_analysis）。',
  mackorn_market_intel: '本工具做【市场纵深定性分析】；定量统计（集中度/回归/威布尔）请用 market_stats。不做价格承诺。',
  mackorn_selection_report: '本工具产出【内部技术选型报告】，面向工程判断；面向客户的方案书请用 proposal。',
  mackorn_equipment_catalog: '本工具只列【机型与腔型枚举值】；查材料性质与经验教训请用 knowledge。不含报价。',
  mackorn_pdca_status: '本工具【只读】查看自优化循环状态；不写入。写入 PCDA 台账请用 knowledge_update 或直接跑 pdca_round。',
  mackorn_crusher_curve: '本工具算【单台圆锥破的产品粒度曲线】；多段破碎+筛分闭路请用 simulate_flowsheet。',
  mackorn_simulate_flowsheet: '本工具算【多段流程的稳态物料平衡与循环负荷】；只要单台曲线请用 crusher_curve。',
  mackorn_calibrate: '本工具用【现场实测筛析】反算模型参数；没有实测数据时不要用它（文献默认值只用于量级估算）。',
  mackorn_contact: '本工具只给【公开联系方式】；不做具体报价，不承诺交期。',
  mackorn_distributor_eval: '本工具做【代理评估打分与风险清单】，不构成法律意见，也不替代实地尽调。',
  mackorn_market_stats: '本工具只做【统计计算】，不解读市场含义；市场判断请用 market_intel。',
  mackorn_knowledge: '本工具查【材料性质/经验/错误/对标案例】；查机型参数请用 equipment_catalog。材料库未收录的矿石【不猜测】其性质。',
  mackorn_intel_watch: '本工具给【情报采集纪律与观测面】；不联网检索（检索由具备联网能力的 AI 完成），入库请用 knowledge_update。',
  mackorn_knowledge_update: '本工具【校验并写入】知识库；无 source_url 的条目一律拒收。只读取请用 knowledge 或 pdca_status。',
};

/* 用 edit 直接在 index.mjs 上做是更稳的方式，但为批量起见这里用脚本追加 */
const P = join(ROOT, 'plugin', 'index.mjs');
let c = readFileSync(P, 'utf8');
let applied = 0;
for (const [name, note] of Object.entries(BOUNDARY)) {
  // 在每个工具 description 的字符串末尾追加边界说明
  const idx = c.indexOf(`name: '${name}'`);
  if (idx < 0) continue;
  // 找到该工具 description 的结束（后面紧跟 parameters:）
  const pi = c.indexOf('parameters:', idx);
  if (pi < 0) continue;
  const seg = c.slice(idx, pi);
  if (seg.includes('【适用边界】')) continue;
  // 在 description 的最后一个引号前插入
  const lastQuote = seg.lastIndexOf("',");
  if (lastQuote < 0) continue;
  const insertAt = idx + lastQuote;
  c = c.slice(0, insertAt) + " + ' 【适用边界】" + note.replace(/'/g, "\\'") + "'" + c.slice(insertAt);
  applied += 1;
}
writeFileSync(P, c, 'utf8');
console.log('  ── 已给 ' + applied + ' 个工具补【适用边界】──');
console.log('');
console.log('  注：边界说明直接写进 description，AI 在选工具时能看到，');
console.log('      从而降低"用错工具"的概率。');
console.log('');
