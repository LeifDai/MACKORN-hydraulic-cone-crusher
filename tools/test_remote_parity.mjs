/**
 * PHP 远程端点 vs 本地 JS 引擎 —— 一致性对照
 * 同一输入必须同输出，否则远程端点不可信。
 */
import { mcfmFormula } from '../plugin/lib/core.mjs';
import { checkCapacity, selectConeCrusher, analyzeGrading, analyzeMcfm } from '../plugin/lib/engine.mjs';

const P = async (name, args) => {
  const r = await fetch('https://mackorn.cn/ai/api/mcp.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(40000),
  });
  const j = JSON.parse(await r.text());
  if (j.error) return { __error: j.error };
  return JSON.parse(j.result.content[0].text).result;
};

console.log('\n══ 一、MCFM 公式三方核对（手算 / JS / PHP）══');
for (const arr of [[30, 45, 60, 72, 82, 90, 96, 99], [2, 15, 35, 55, 70, 82, 90, 20], [5, 20, 40, 60, 75, 85, 92, 25]]) {
  const sum = arr.slice(0, 7).reduce((a, b) => a + b, 0);
  const hand = (sum - 7 * arr[7]) / (100 - arr[7]);
  const js = mcfmFormula(arr);
  const php = await P('mackorn_mcfm_analysis', { cumulative_retained: arr });
  const phpM = php && typeof php.mcfm === 'number' ? php.mcfm : null;
  const allSame = phpM !== null && Math.abs(hand - js) < 0.01 && Math.abs(hand - phpM) < 0.01;
  console.log('  输入 ' + JSON.stringify(arr));
  console.log('    手算 ' + hand.toFixed(3) + '   JS ' + js.toFixed(3) + '   PHP ' + (phpM === null ? 'null' : phpM));
  console.log('    ' + (allSame ? '✅ 三者一致' : '❌ 不一致'));

  // 输入合理性提示
  if (arr[7] > 60 || arr[7] < 5) {
    console.log('    ⚠ A8=' + arr[7] + ' —— A8 是"80% 通过粒级"的累积筛余，正常应接近 20（即 80% 通过）');
  }
}

console.log('\n══ 二、capacity_check 对照 ══');
{
  const php = await P('mackorn_capacity_check', { model: 'NH400', cavity: 'MC', css: 16 });
  const js = checkCapacity({ model: 'NH400', cavity: 'MC', css: 16 });
  console.log('  PHP: capacity_tph=' + JSON.stringify(php?.capacity_tph) + '  power=' + php?.power_kw + '  maxFeed=' + php?.max_feed_mm);
  console.log('  JS : capacityTph=' + JSON.stringify(js?.capacityTph ?? js?.capacity_tph) + '  power=' + (js?.powerKw ?? js?.power_kw));
  const hit = php?.capacity_tph && (js?.capacityTph || js?.capacity_tph);
  console.log('  ' + (hit ? '✅ 两边都取到逐格产能' : '⚠ 有一边没取到逐格值'));
  console.log('  JS 原始: ' + JSON.stringify(js).slice(0, 300));
}

console.log('\n══ 三、cone_selection 对照 ══');
{
  const php = await P('mackorn_cone_selection', { target_tph: 500, max_feed_mm: 300, target_product_mm: 20 });
  const js = selectConeCrusher({ targetTph: 500, maxFeedMm: 300, productMm: 20 });
  console.log('  PHP 推荐: ' + php?.recommendation + '  候选 ' + php?.candidate_count);
  console.log('  JS  推荐: ' + (js?.recommended?.model || js?.recommendation || JSON.stringify(js).slice(0, 80)));
  console.log('  PHP 前 3: ' + (php?.candidates || []).slice(0, 3).map((c) => c.model).join(', '));
}

console.log('\n══ 四、grading 对照 ══');
{
  const php = await P('mackorn_grading_porosity', { coarse_frac: 50, mid_frac: 30, fine_frac: 20 });
  const js = analyzeGrading({ coarseFrac: 50, midFrac: 30, fineFrac: 20 });
  console.log('  PHP φ = ' + php?.porosity);
  console.log('  JS  φ = ' + (js?.porosity ?? js?.phi));
  console.log('  ' + (php?.porosity && Math.abs(php.porosity - (js?.porosity ?? js?.phi ?? -9)) < 0.001 ? '✅ 一致' : '⚠ 需核对'));
}

console.log('\n══ 五、给料超限的负向对照 ══');
{
  const php = await P('mackorn_cone_selection', { target_tph: 500, max_feed_mm: 700 });
  const warned = (php?.candidates?.length || 0) > 0;
  console.log('  PHP 候选数: ' + php?.candidate_count + '（应 >0，因为按产能反查）');
  console.log('  告警数: ' + (php?.candidates ? '' : ''));
  console.log('  ' + (warned ? '✅ 没有静默清空候选' : '❌ 候选被清空'));
}
console.log('');
