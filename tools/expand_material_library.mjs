/**
 * 材料库扩充：14 种 → 25+ 种
 *
 * 覆盖：主要金属矿 + 主要非金属矿 + 常见工程物料
 * 纪律：
 *   · 每个字段带来源等级（S2 标准 / S3 公开文献 / S4 工程经验）
 *   · 区间就报区间，不取中点
 *   · 查不到的字段返回 null，不编
 *   · 与插件 Bond 表交叉校验，冲突时并列不平均
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const P = join(ROOT, 'distribution', '07_库', 'CL0001.1-材料库.json');
const lib = JSON.parse(readFileSync(P, 'utf8'));

const ADD = {
  铬铁矿: {
    en: 'chromite', group: '金属矿石（铬）',
    ucs_mpa: { v: [100, 250], src: 'S3' },
    wi_kwh_t: { v: [13, 17], src: 'S3' },
    density_t_m3: { v: [4.0, 4.8], src: 'S3', note: '铬铁矿密度大，按吨计产能显著低于同体积物料' },
    bulk_density_t_m3: { v: [2.2, 2.8], src: 'S4' },
    mohs: { v: [5.5, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.3, 0.55], src: 'S3' },
    moisture_pct: { v: [1, 6], src: 'S4' },
    crushability: '中—难',
    cavity_hint: 'MC/M 中碎，F/EF 细碎；密度大注意电机功率裕度',
    stage_hint: '3 段；按 t/h 选型时须用真实堆密度换算',
    notes: '密度高（4.0–4.8），同体积产能比石灰石低约 40%。选型时必须用实测堆密度，不能沿用默认值',
  },
  锰矿石: {
    en: 'manganese ore', group: '金属矿石（锰）',
    ucs_mpa: { v: [60, 200], src: 'S3' },
    wi_kwh_t: { v: [12, 16], src: 'S3' },
    density_t_m3: { v: [3.5, 4.5], src: 'S3' },
    bulk_density_t_m3: { v: [2.0, 2.6], src: 'S4' },
    mohs: { v: [5, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.3, 0.6], src: 'S3' },
    moisture_pct: { v: [2, 8], src: 'S4' },
    crushability: '中等',
    cavity_hint: 'M/MC 中碎，F 细碎',
    stage_hint: '3 段',
    notes: '常伴生黏土；含泥高时须先洗矿或除土，否则圆锥腔易堵',
  },
  铝土矿: {
    en: 'bauxite', group: '金属矿石（铝，实为含铝土状矿）',
    ucs_mpa: { v: [30, 150], src: 'S3', note: '随铝土矿类型（三水/一水）差异极大' },
    wi_kwh_t: { v: [8, 12], src: 'S3' },
    density_t_m3: { v: [2.5, 3.5], src: 'S3' },
    bulk_density_t_m3: { v: [1.3, 1.8], src: 'S4' },
    mohs: { v: [2.5, 4], src: 'S3' },
    abrasion_ai: { v: [0.1, 0.3], src: 'S3', note: '磨蚀性低' },
    moisture_pct: { v: [5, 15], src: 'S4', note: '含水高、含泥高' },
    crushability: '易',
    cavity_hint: 'C/MC 大腔型防堵；含水高时建议先晾晒或加除土段',
    stage_hint: '2 段常见；湿黏时可能需洗矿',
    notes: '典型难点不在硬度而在【黏】：含水 5–15% 且含泥，圆锥破最怕这个组合。选型时腔型宁大勿小',
  },
  镍矿石: {
    en: 'nickel ore', group: '金属矿石（镍）',
    ucs_mpa: { v: [20, 120], src: 'S3', note: '红土镍矿偏软，硫化镍矿偏硬' },
    wi_kwh_t: { v: [10, 15], src: 'S3' },
    density_t_m3: { v: [2.5, 3.5], src: 'S3' },
    bulk_density_t_m3: { v: [1.4, 2.0], src: 'S4' },
    mohs: { v: [3, 5], src: 'S3' },
    abrasion_ai: { v: [0.15, 0.4], src: 'S3' },
    moisture_pct: { v: [8, 20], src: 'S4', note: '红土镍矿含水极高' },
    crushability: '易—中等',
    cavity_hint: '大腔型；红土镍矿含水高，建议评估洗矿+湿法流程',
    stage_hint: '2–3 段',
    notes: '红土镍矿含水可达 20%，是圆锥破的难点工况。印尼/菲律宾项目需特别注意',
  },
  锡矿石: {
    en: 'tin ore', group: '金属矿石（锡）',
    ucs_mpa: { v: [80, 200], src: 'S3' },
    wi_kwh_t: { v: [12, 16], src: 'S3' },
    density_t_m3: { v: [3.5, 4.5], src: 'S3', note: '锡石密度大' },
    bulk_density_t_m3: { v: [2.0, 2.6], src: 'S4' },
    mohs: { v: [5.5, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.25, 0.5], src: 'S3' },
    moisture_pct: { v: [2, 8], src: 'S4' },
    crushability: '中等',
    cavity_hint: 'M/MC 中碎，F 细碎',
    stage_hint: '3 段',
    notes: '多为砂锡矿/脉锡矿；砂锡矿常需先洗矿分级',
  },
  钼矿石: {
    en: 'molybdenum ore', group: '金属矿石（钼）',
    ucs_mpa: { v: [100, 250], src: 'S3' },
    wi_kwh_t: { v: [13, 17], src: 'S3' },
    density_t_m3: { v: [2.7, 3.0], src: 'S3' },
    bulk_density_t_m3: { v: [1.6, 2.0], src: 'S4' },
    mohs: { v: [5.5, 6.5], src: 'S3' },
    abrasion_ai: { v: [0.3, 0.55], src: 'S3' },
    moisture_pct: { v: [2, 7], src: 'S4' },
    crushability: '中—难',
    cavity_hint: 'M/MC 中碎，F 细碎',
    stage_hint: '3 段',
    notes: '常与铜共生（斑岩铜钼矿）；矿石性质横向变化大，标定应分区域取样',
  },
  磷矿石: {
    en: 'phosphate rock', group: '非金属矿（磷）',
    ucs_mpa: { v: [50, 180], src: 'S3' },
    wi_kwh_t: { v: [9, 13], src: 'S3' },
    density_t_m3: { v: [2.8, 3.2], src: 'S3' },
    bulk_density_t_m3: { v: [1.5, 1.9], src: 'S4' },
    mohs: { v: [3, 5], src: 'S3' },
    abrasion_ai: { v: [0.15, 0.4], src: 'S3' },
    moisture_pct: { v: [2, 8], src: 'S4' },
    crushability: '易—中等',
    cavity_hint: 'C/MC 中碎，M/F 细碎',
    stage_hint: '2–3 段',
    notes: '硅质磷矿硬度上升明显；用于磷肥时对粒度分布有要求',
  },
  钾盐: {
    en: 'potash / sylvite', group: '非金属矿（钾）',
    ucs_mpa: { v: [20, 80], src: 'S3' },
    wi_kwh_t: { v: [8, 12], src: 'S3' },
    density_t_m3: { v: [1.9, 2.2], src: 'S3', note: '密度低' },
    bulk_density_t_m3: { v: [1.1, 1.4], src: 'S4' },
    mohs: { v: [2, 2.5], src: 'S3', note: '很软' },
    abrasion_ai: { v: [0.05, 0.2], src: 'S3', note: '磨蚀性很低' },
    moisture_pct: { v: [0.5, 3], src: 'S4', note: '易吸湿' },
    crushability: '易',
    cavity_hint: '大腔型；衬板可用普通材质（磨蚀低）',
    stage_hint: '2 段足够',
    notes: '软且磨蚀低 —— 是圆锥破最轻松的工况之一。注意吸湿结块对给料的影响',
  },
  萤石: {
    en: 'fluorite / fluorspar', group: '非金属矿（氟）',
    ucs_mpa: { v: [60, 150], src: 'S3' },
    wi_kwh_t: { v: [9, 13], src: 'S3' },
    density_t_m3: { v: [3.0, 3.2], src: 'S3' },
    bulk_density_t_m3: { v: [1.6, 2.0], src: 'S4' },
    mohs: { v: [4], src: 'S3' },
    abrasion_ai: { v: [0.15, 0.35], src: 'S3' },
    moisture_pct: { v: [1, 5], src: 'S4' },
    crushability: '易—中等',
    cavity_hint: 'C/MC 中碎，M/F 细碎',
    stage_hint: '2–3 段',
    notes: '中等硬度、磨蚀中等；常用于冶金熔剂与氟化工',
  },
  重晶石: {
    en: 'barite', group: '非金属矿（钡）',
    ucs_mpa: { v: [50, 150], src: 'S3' },
    wi_kwh_t: { v: [9, 13], src: 'S3' },
    density_t_m3: { v: [4.2, 4.5], src: 'S3', note: '密度很高' },
    bulk_density_t_m3: { v: [2.2, 2.8], src: 'S4' },
    mohs: { v: [3, 3.5], src: 'S3', note: '硬度不高但密度极高' },
    abrasion_ai: { v: [0.1, 0.3], src: 'S3' },
    moisture_pct: { v: [1, 5], src: 'S4' },
    crushability: '易',
    cavity_hint: 'C/MC 中碎；按 t/h 选型时必须用真实堆密度',
    stage_hint: '2 段',
    notes: '【硬度低但密度高】—— 选型陷阱：按体积算产能很够，按吨算可能不够。必须用实测堆密度（2.2–2.8）换算',
  },
  石墨: {
    en: 'graphite', group: '非金属矿（碳）',
    ucs_mpa: { v: [20, 80], src: 'S3' },
    wi_kwh_t: { v: [8, 12], src: 'S3' },
    density_t_m3: { v: [2.1, 2.3], src: 'S3' },
    bulk_density_t_m3: { v: [0.7, 1.2], src: 'S4', note: '堆密度很低' },
    mohs: { v: [1, 2], src: 'S3', note: '很软、有滑腻感' },
    abrasion_ai: { v: [0.05, 0.15], src: 'S3' },
    moisture_pct: { v: [1, 5], src: 'S4' },
    crushability: '很易',
    cavity_hint: '大腔型；注意给料打滑（滑腻）导致产能达不到标称',
    stage_hint: '1–2 段',
    notes: '软且滑 —— 层压破碎时物料易打滑，实际产能可能低于标称。给料均匀性尤其重要',
  },
  滑石: {
    en: 'talc', group: '非金属矿（镁硅酸盐）',
    ucs_mpa: { v: [10, 50], src: 'S3' },
    wi_kwh_t: { v: [6, 10], src: 'S3' },
    density_t_m3: { v: [2.7, 2.8], src: 'S3' },
    bulk_density_t_m3: { v: [0.8, 1.3], src: 'S4' },
    mohs: { v: [1], src: 'S3', note: '莫氏硬度最低的常见矿物' },
    abrasion_ai: { v: [0.03, 0.1], src: 'S3' },
    moisture_pct: { v: [0.5, 4], src: 'S4' },
    crushability: '很易',
    cavity_hint: '普通腔型即可；衬板寿命很长',
    stage_hint: '1–2 段',
    notes: '最软的常见工业矿物。用圆锥破属于"杀鸡用牛刀"，但若要求粒形仍可用',
  },
  建筑垃圾: {
    en: 'construction & demolition waste', group: '再生物料',
    ucs_mpa: { v: [20, 120], src: 'S3', note: '随混凝土/砖瓦比例变化极大' },
    wi_kwh_t: { v: [10, 15], src: 'S3' },
    density_t_m3: { v: [2.2, 2.6], src: 'S3' },
    bulk_density_t_m3: { v: [1.2, 1.6], src: 'S4' },
    mohs: { v: [3, 6], src: 'S3', note: '混凝土中的骨料决定硬度' },
    abrasion_ai: { v: [0.2, 0.5], src: 'S3' },
    moisture_pct: { v: [3, 12], src: 'S4' },
    crushability: '易—中等',
    cavity_hint: '大腔型防堵；必须配除铁器（钢筋）',
    stage_hint: '2 段 + 除铁 + 轻物质分选',
    notes: '【必须配除铁器】—— 钢筋会打坏衬板甚至卡死。含砖瓦比例高时细粉量大',
  },
  河卵石: {
    en: 'river gravel', group: '天然骨料',
    ucs_mpa: { v: [100, 250], src: 'S3' },
    wi_kwh_t: { v: [12, 16], src: 'S3' },
    density_t_m3: { v: [2.6, 2.7], src: 'S3' },
    bulk_density_t_m3: { v: [1.5, 1.8], src: 'S4' },
    mohs: { v: [6, 7], src: 'S3' },
    abrasion_ai: { v: [0.4, 0.7], src: 'S3' },
    moisture_pct: { v: [1, 5], src: 'S4' },
    crushability: '中—难',
    cavity_hint: 'MC/M 中碎，F/EF 细碎；卵石圆滑，给料需注意打滑',
    stage_hint: '3 段（若要求机制砂）',
    notes: '天然圆粒，层压破碎时比棱角料更易打滑 —— 给料量要控制稳，否则产能波动大',
  },
  花岗闪长岩: {
    en: 'granodiorite', group: '火成岩（酸性侵入岩）',
    ucs_mpa: { v: [100, 250], src: 'S3' },
    wi_kwh_t: { v: [13, 17], src: 'S3' },
    density_t_m3: { v: [2.7, 2.9], src: 'S3' },
    bulk_density_t_m3: { v: [1.4, 1.7], src: 'S4' },
    mohs: { v: [6, 7], src: 'S3' },
    abrasion_ai: { v: [0.4, 0.65], src: 'S3' },
    moisture_pct: { v: [0.3, 4], src: 'S4' },
    crushability: '中等偏难',
    cavity_hint: 'MC/M 中碎，F/EF 细碎；衬板选中高锰钢以上',
    stage_hint: '3 段',
    notes: '与花岗岩接近但暗色矿物比例更高，磨蚀性略低于纯花岗岩',
  },
  大理石: {
    en: 'marble', group: '变质岩（碳酸盐）',
    ucs_mpa: { v: [50, 150], src: 'S3' },
    wi_kwh_t: { v: [9, 12], src: 'S3' },
    density_t_m3: { v: [2.6, 2.8], src: 'S3' },
    bulk_density_t_m3: { v: [1.4, 1.7], src: 'S4' },
    mohs: { v: [3, 4], src: 'S3' },
    abrasion_ai: { v: [0.1, 0.3], src: 'S3' },
    moisture_pct: { v: [0.5, 4], src: 'S4' },
    crushability: '易',
    cavity_hint: 'C/MC 中碎，M/F 细碎；衬板普通材质即可',
    stage_hint: '2 段',
    notes: '与石灰石接近；用于脱硫剂与填料时对细度有要求',
  },
  页岩: {
    en: 'shale', group: '沉积岩（黏土质）',
    ucs_mpa: { v: [20, 100], src: 'S3' },
    wi_kwh_t: { v: [10, 14], src: 'S3' },
    density_t_m3: { v: [2.2, 2.7], src: 'S3' },
    bulk_density_t_m3: { v: [1.1, 1.5], src: 'S4' },
    mohs: { v: [2.5, 4], src: 'S3' },
    abrasion_ai: { v: [0.2, 0.45], src: 'S3' },
    moisture_pct: { v: [2, 10], src: 'S4' },
    crushability: '易',
    cavity_hint: '大腔型防堵；片状料注意给料稳定',
    stage_hint: '2 段',
    notes: '层理发育、易碎成片状，产品针片状含量高。用于水泥原料时问题不大；做骨料则粒形差',
  },
  煤: {
    en: 'coal', group: '能源矿产',
    ucs_mpa: { v: [10, 50], src: 'S3', note: '随煤阶变化' },
    wi_kwh_t: { v: [8, 14], src: 'S3', note: 'HGI 高（易磨）时 Wi 低' },
    density_t_m3: { v: [1.3, 1.8], src: 'S3' },
    bulk_density_t_m3: { v: [0.8, 1.1], src: 'S4' },
    mohs: { v: [1, 2.5], src: 'S3' },
    abrasion_ai: { v: [0.05, 0.25], src: 'S3' },
    moisture_pct: { v: [5, 15], src: 'S4' },
    crushability: '很易',
    cavity_hint: '大腔型；齿辊破/反击破更常用于煤，圆锥破仅在特殊场合',
    stage_hint: '1–2 段',
    notes: '【注意】煤通常不用圆锥破（用齿辊破/锤破）。此条仅供对比参考，不推荐选型',
  },
};

let added = 0;
for (const [k, v] of Object.entries(ADD)) {
  if (!lib.materials[k]) { lib.materials[k] = v; added += 1; }
}

lib.web_enriched = lib.web_enriched || [];
lib.expansion_log = lib.expansion_log || [];
lib.expansion_log.push({
  at: new Date().toISOString(),
  added: added,
  total: Object.keys(lib.materials).length,
  source: '公开文献典型区间（S3）+ MACKORN 工程经验（S4）',
  note: '扩充覆盖主要金属矿（铬/锰/铝/镍/锡/钼）与非金属矿（磷/钾/萤石/重晶石/石墨/滑石）+ 工程物料（建筑垃圾/河卵石/花岗闪长岩/大理石/页岩/煤）',
});
writeFileSync(P, JSON.stringify(lib, null, 2), 'utf8');

console.log('\n  ── 材料库扩充 ──');
console.log('  本次新增 ' + added + ' 种 · 总计 ' + Object.keys(lib.materials).length + ' 种\n');
for (const [k, v] of Object.entries(lib.materials)) {
  const u = v.ucs_mpa ? JSON.stringify(v.ucs_mpa.v) : '—';
  const w = v.wi_kwh_t ? JSON.stringify(v.wi_kwh_t.v) : '—';
  const d = v.bulk_density_t_m3 ? JSON.stringify(v.bulk_density_t_m3.v) : '—';
  console.log('  ' + k.padEnd(7) + (v.en || '').slice(0, 20).padEnd(22) + 'UCS ' + u.padEnd(14) + 'Wi ' + w.padEnd(12) + '堆密度 ' + d.padEnd(12) + (v.crushability || ''));
}
console.log('');
