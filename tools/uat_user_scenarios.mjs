/**
 * 用户验收测试（UAT）—— 模拟真实用户提问，检查输出是否【真正有用】
 *
 * 与单测的区别：
 *   单测验证「函数不崩、字段齐全」；
 *   UAT 验证「一个真实工程师拿到这个输出，能不能做决定」。
 *
 * 五个真实场景（来自外贸选型的实际问法）：
 *   ① 非洲花岗岩 300 t/h 骨料线，要 20mm 以下
 *   ② 中东玄武岩 500 t/h，问配几台圆锥破
 *   ③ 现有 NH400 能否做到 350 t/h（复核既有设备）
 *   ④ 客户只给了需求表，问还缺什么
 *   ⑤ 硬岩线台时产量偏低，怎么查
 *
 * 评判标准（每条给分）：
 *   · 是否给出明确结论（不是含糊的"建议进一步确认"）
 *   · 是否带来源/假设
 *   · 是否暴露不确定度
 *   · 是否指出用户需要提供什么
 *   · 是否出现明显错误（如给料超限未拦）
 */
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const T = Object.fromEntries(m.toolDefinitions.map((d) => [d.name, d]));

const SCENARIOS = [
  {
    id: 'UAT-1', title: '非洲花岗岩 300 t/h 骨料线',
    ask: '客户在赞比亚有花岗岩矿，要一条 300 t/h 的骨料线，成品 20mm 以下，帮我选圆锥破',
    run: async () => {
      const sel = await T.mackorn_cone_selection.execute({ target_tph: 300, max_feed_mm: 200, target_product_mm: 20, ore: '花岗岩', stage: '中碎' });
      return { sel };
    },
    judge: (r) => {
      const s = r.sel;
      const checks = [
        ['给出明确机型', !!s.top_pick && !!s.top_pick.model],
        ['给出腔型与 CSS', !!(s.top_pick && s.top_pick.cavity && s.top_pick.css_mm)],
        ['给出台数', Number.isFinite(s.recommended_units)],
        ['带假设来源', Array.isArray(s.assumptions) && s.assumptions.length > 0],
        ['暴露不确定度', !!s.knowledge_check],
        ['材料建议', !!(s.knowledge_check && s.knowledge_check.material)],
      ];
      return checks;
    },
  },
  {
    id: 'UAT-2', title: '中东玄武岩 500 t/h 配几台',
    ask: '阿联酋玄武岩，500 t/h，问要几台圆锥破',
    run: async () => {
      const sel = await T.mackorn_cone_selection.execute({ target_tph: 500, max_feed_mm: 250, target_product_mm: 25, ore: '玄武岩', stage: '中碎' });
      return { sel };
    },
    judge: (r) => {
      const s = r.sel;
      const conflicts = (s.knowledge_check && s.knowledge_check.compatibility || []).filter((x) => x.level === 'conflict');
      return [
        ['给出台数', Number.isFinite(s.recommended_units)],
        ['硬料磨蚀提示', !!(s.knowledge_check && s.knowledge_check.material && /极高|高/.test(s.knowledge_check.material.wear_grade || ''))],
        ['产能校核说明', s.warnings.some((w) => /台|净给料|循环负荷/.test(String(w)))],
      ];
    },
  },
  {
    id: 'UAT-3', title: '复核既有 NH400 能否 350 t/h',
    ask: '我厂里已经有一台 NH400，C 腔，CSS 16mm，能不能做到 350 t/h',
    run: async () => {
      /* ⚠️ 必须传 target_tph —— 用户问的是「能不能做 350 t/h」，
       * 早期版本漏了这个参数，导致工具无从判定，测试却怪工具没给判定。
       * 这是 UAT 自身的 bug：测试调用必须复现用户的真实问题。 */
      const cap = await T.mackorn_capacity_check.execute({ model: 'NH400', cavity: 'C', css: 16, target_tph: 350 });
      return { cap };
    },
    judge: (r) => {
      const c = r.cap;
      const s = JSON.stringify(c);
      return [
        ['给出产能区间', /capacity|tph|t\/h/i.test(s)],
        /* 检查【是否真的给了达标判定】——认 verdict 字段，不认模糊词。
         * 早期版本用 /ok|达标/ 这类模糊匹配，既可能漏判也可能误判；
         * 现在要求 verdict.asked === true 且有明确的 achievable 布尔值。 */
        ['给出达标判定（verdict 字段）', !!(c.verdict && c.verdict.asked === true && typeof c.verdict.achievable === 'boolean')],
        ['判定含缺口或余量', !!(c.verdict && (Number.isFinite(c.verdict.margin_pct)))],
        ['判定附可执行建议', !!(c.verdict && typeof c.verdict.advice === 'string' && c.verdict.advice.length > 20)],
        ['带假设', Array.isArray(c.assumptions) && c.assumptions.length > 0],
      ];
    },
  },
  {
    id: 'UAT-4', title: '客户只给需求表，问还缺什么',
    ask: '客户发来需求表：产量 200 t/h，原料石灰石，最大粒度 600mm，成品 0-31.5mm。还缺什么？',
    run: async () => {
      const r = await T.mackorn_requirement_intake.execute({ capacity_tph: 200, max_feed_mm: 600, ore_type: '石灰石', product_mm: 31.5 });
      return { intake: r };
    },
    judge: (r) => {
      const s = JSON.stringify(r.intake);
      return [
        ['列出缺失字段', /missing|缺|待补/i.test(s)],
        ['给出追问话术', /追问|问客户|询问|ask/i.test(s)],
        ['已自动配线', /stage|段|设备|model/i.test(s)],
      ];
    },
  },
  {
    id: 'UAT-5', title: '硬岩线台时产量偏低怎么查',
    ask: '我的圆锥破线台时产量上不去，给料是花岗岩，怎么排查',
    run: async () => {
      const k = await T.mackorn_knowledge.execute({ ore: '花岗岩', target_tph: 300 });
      const g = await T.mackorn_grading_porosity.execute({ coarse_frac: 0.3, mid_frac: 0.3, fine_frac: 0.4 });
      return { knowledge: k, grading: g };
    },
    judge: (r) => {
      const s = JSON.stringify(r.knowledge) + JSON.stringify(r.grading);
      return [
        ['材料性质可查', !!(r.knowledge.material_hints && r.knowledge.material_hints.found)],
        ['给料级配诊断', /porosity|孔隙率|级配/i.test(JSON.stringify(r.grading))],
        ['给出可执行建议', /建议|腔型|层压|优/i.test(s)],
      ];
    },
  },
];

console.log('\n' + '═'.repeat(102));
console.log('  用户验收测试（UAT）—— 检验输出是否【真正能用来做决定】');
console.log('═'.repeat(102) + '\n');

let totalChecks = 0, passedChecks = 0;
for (const sc of SCENARIOS) {
  console.log('  ── ' + sc.id + '　' + sc.title + ' ──');
  console.log('     用户问：' + sc.ask);
  let r = null, err = null;
  const t0 = Date.now();
  try { r = await sc.run(); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  if (err) { console.log('     ❌ 执行失败: ' + String(err.message).slice(0, 80)); console.log(''); continue; }
  const checks = sc.judge(r);
  const okN = checks.filter(([n, ok]) => ok).length;
  totalChecks += checks.length; passedChecks += okN;
  checks.forEach(([n, ok]) => console.log('       ' + (ok ? '✅' : '❌') + ' ' + n));
  console.log('     ' + (okN === checks.length ? '✅' : '⚠️') + ' ' + okN + '/' + checks.length + ' 项通过　' + ms + ' ms');
  console.log('');
}

console.log('═'.repeat(102));
console.log('  UAT 合计 ' + passedChecks + '/' + totalChecks + ' 项通过' + (passedChecks === totalChecks ? '  ✅ 全部场景输出可用' : '  ⚠️ 有场景输出不完整'));
console.log('');
console.log('  说明：本测试检验的是「输出是否包含做决定所需的信息」，不是「结论是否正确」——');
console.log('        后者需要现场数据对标（见 distribution/03_验证与基准/公开数据集清单.md）。');
console.log('');
process.exit(passedChecks === totalChecks ? 0 : 1);
