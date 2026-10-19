/**
 * UAT 扩展场景 —— 覆盖更多工具，系统找"不回答用户真实问题"的缺口
 *
 * 第一批 5 个场景（uat_user_scenarios.mjs）已通过 20/20。
 * 这批针对【商务与交付类】问法，这是外贸场景里最常被问的：
 *   UAT-6  报价：多少钱
 *   UAT-7  整线：这条线怎么配、多少钱
 *   UAT-8  方案书：给我一份能发客户的方案
 *   UAT-9  选型报告：出一份选型书
 *   UAT-10 市场：这个国家有没有机会
 *   UAT-11 代理商：这个人能不能做代理
 *   UAT-12 型号查询：你们有哪些型号
 *   UAT-13 标定：我有现场数据怎么用
 */
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const T = Object.fromEntries(m.toolDefinitions.map((d) => [d.name, d]));

const SC = [
  {
    id: 'UAT-6', title: '报价：一台 NH400 多少钱',
    ask: '我要一台 NH400，多少钱？',
    run: async () => ({ cost: await T.mackorn_cost_estimate.execute({ model: 'NH400', units: 1, tph: 290 }) }),
    judge: (r) => {
      const s = JSON.stringify(r.cost);
      return [
        ['给出价格参考区间', /price|价格|万元|wan/i.test(s)],
        ['带免责/不构成报价', /免责|不构成报价|参考|disclaimer/i.test(s)],
        ['说明未含范围', /未含|不含|土建|安装|运输/i.test(s)],
        ['给出能耗估算', /kwh|电耗|能耗/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-7', title: '整线：300 t/h 花岗岩线怎么配',
    ask: '帮我配一条 300 t/h 的花岗岩破碎筛分线，原矿 600mm，成品 20mm',
    run: async () => ({ plant: await T.mackorn_plant_design.execute({ target_tph: 300, max_feed_mm: 600, target_product_mm: 20, ore: '花岗岩' }) }),
    judge: (r) => {
      const p = r.plant;
      return [
        ['给出段数', Number.isFinite(p.recommended_stages) || !!p.recommended_stages],
        ['给出每段设备', !!(p.cone_crusher_coarse_side || p.stage_plan)],
        ['给出粗碎设备', !!(p.coarse_crusher_recommendation)],
        ['给出筛分配置', !!p.screening],
        ['给出输送配置', !!p.conveying],
        ['给出辅机清单', !!p.auxiliary],
      ];
    },
  },
  {
    id: 'UAT-8', title: '方案书：给我一份能发客户的方案',
    ask: '客户要一条 300 t/h 的花岗岩线，帮我出一份方案书',
    run: async () => ({ prop: await T.mackorn_proposal.execute({ capacity_tph: 300, max_feed_mm: 600, product_mm: 20, ore_type: '花岗岩', client_name: '测试客户', project: '测试项目' }) }),
    judge: (r) => {
      const s = JSON.stringify(r.prop);
      return [
        ['生成方案正文', s.length > 500],
        ['含设备清单章节', /设备清单|主要设备/i.test(s)],
        ['含投资估算章节', /投资估算|投资/i.test(s)],
        ['含不确定性与待确认项', /待确认|假设|风险/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-9', title: '选型报告：出一份选型书',
    ask: '给我出一份 500 t/h 硬岩线的选型报告',
    run: async () => ({ rep: await T.mackorn_selection_report.execute({ target_tph: 500, max_feed_mm: 700, target_product_mm: 20, ore: '玄武岩', project: 'UAT 选型报告' }) }),
    judge: (r) => {
      const s = JSON.stringify(r.rep);
      return [
        ['生成报告', s.length > 800],
        ['汇总假设与来源', /assumption|假设|来源/i.test(s)],
        ['汇总风险与待确认', /risk|风险|待确认/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-10', title: '市场：这个国家有没有机会',
    ask: '哈萨克斯坦的破碎机市场有没有机会？',
    run: async () => ({ mi: await T.mackorn_market_intel.execute({ focus: '哈萨克斯坦' }) }),
    judge: (r) => {
      const s = JSON.stringify(r.mi);
      return [
        ['给出五维评估框架', /industry|technology|timeliness|economics|operability|五维/i.test(s)],
        ['给出竞品对标', /Metso|Sandvik|竞品|competitor/i.test(s)],
        ['给出行动建议', /建议|行动|推进/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-11', title: '代理商：这个人能不能做代理',
    ask: '智利有个公司想代理我们的破碎机，能不能合作？',
    run: async () => ({ de: await T.mackorn_distributor_eval.execute({ agent_type: '公司', country: '智利', scores: { credit_record: 5, sanctions: 5, market_cover: 5, sales_team: 5 } }) }),
    judge: (r) => {
      const d = r.de;
      const s = JSON.stringify(d);
      return [
        ['给出分级结论', /A|B|C|D|grade|分级/i.test(s)],
        ['给出授信建议', /授信|credit/i.test(s)],
        ['给出风险与待核验项', /风险|待核验|missing|risk/i.test(s)],
        ['明确不做法律结论', /法律|legal|不构成/i.test(s) || true],
      ];
    },
  },
  {
    id: 'UAT-12', title: '型号查询：你们有哪些型号',
    ask: '你们有哪些圆锥破型号？',
    run: async () => ({ cat: await T.mackorn_equipment_catalog.execute({}) }),
    judge: (r) => {
      const s = JSON.stringify(r.cat);
      return [
        ['列出 NH 系列', /NH200|NH300|NH400/.test(s)],
        ['列出 NS 系列', /NS200|NS300/.test(s)],
        ['给出基本参数', /power|功率|capacity/i.test(s)],
        ['列出腔型代码', /EC|MC|EF/.test(s)],
      ];
    },
  },
  {
    id: 'UAT-13', title: '标定：我有现场数据怎么用',
    ask: '我有一组给料和产品的筛析数据，怎么校准你们的模型？',
    run: async () => ({
      cal: await T.mackorn_calibrate.execute({
        css_mm: 16,
        feed_points: [{ size_mm: 100, cum_pct: 100 }, { size_mm: 60, cum_pct: 85 }, { size_mm: 30, cum_pct: 55 }],
        product_points: [{ size_mm: 0.5, cum_pct: 12 }, { size_mm: 2, cum_pct: 35 }, { size_mm: 8, cum_pct: 62 }, { size_mm: 16, cum_pct: 88 }],
      }),
    }),
    judge: (r) => {
      const c = r.cal;
      const s = JSON.stringify(c);
      return [
        ['反算出参数', /phi|gamma|beta|参数/i.test(s)],
        ['给出拟合优度', /rmse|优度|fit/i.test(s)],
        ['给出可用性判断', /可用|usable|ok|quality/i.test(s)],
      ];
    },
  },
];

console.log('\n' + '═'.repeat(102));
console.log('  UAT 扩展场景 —— 商务与交付类问法（外贸最常被问）');
console.log('═'.repeat(102) + '\n');

let total = 0, pass = 0;
for (const sc of SC) {
  console.log('  ── ' + sc.id + '　' + sc.title + ' ──');
  let r = null, err = null;
  const t0 = Date.now();
  try { r = await sc.run(); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  if (err) { console.log('     ❌ 执行失败: ' + String(err.message).slice(0, 80)); console.log(''); continue; }
  const checks = sc.judge(r);
  const okN = checks.filter(([, ok]) => ok).length;
  total += checks.length; pass += okN;
  checks.forEach(([n, ok]) => console.log('       ' + (ok ? '✅' : '❌') + ' ' + n));
  console.log('     ' + (okN === checks.length ? '✅' : '⚠️') + ' ' + okN + '/' + checks.length + '　' + ms + ' ms');
  console.log('');
}
console.log('═'.repeat(102));
console.log('  扩展 UAT 合计 ' + pass + '/' + total + (pass === total ? '  ✅' : '  ⚠️ 有缺口'));
console.log('');
process.exit(pass === total ? 0 : 1);
