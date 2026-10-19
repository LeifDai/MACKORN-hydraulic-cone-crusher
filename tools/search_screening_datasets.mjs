/**
 * 定向检索：筛分 / 分级 公开数据
 *
 * 目标②明确写"优先圆锥破或筛分"。前几轮的通用检索没找到，
 * 这次换更贴筛分现场的术语，并扩到更多仓库。
 *
 * 纪律：找不到就报 0，并记录搜过什么。
 */
const UA = 'MACKORN-Research/1.0 (mailto:leif.dai@mackorn.cn)';
const g = async (u, h = {}) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json', ...h }, signal: AbortSignal.timeout(35000) });
    return { s: r.status, t: await r.text() };
  } catch (e) { return { s: 0, e: e.cause?.code || e.name, t: '' }; }
};

const Q = [
  'vibrating screen efficiency data', 'screen classification curve particles',
  'screening partition curve data', 'trommel screen performance',
  'banana screen screening efficiency', 'double deck screen data',
  'screen aperture particle size separation', 'screening kinetics model data',
  'sieve bend classification data', 'air classification separator data',
  'hydrocyclone classification data', 'spiral classifier performance',
  'aggregate screening plant data', 'quarry screening throughput',
  'screen undersize oversize distribution', 'particle separation efficiency curve',
  'crushing screening circuit data', 'mineral processing plant survey data',
  'comminution circuit survey', 'grinding circuit particle size data',
];

console.log('\n' + '='.repeat(100));
console.log('  定向检索 · 筛分 / 分级 公开数据（' + Q.length + ' 组关键词）');
console.log('='.repeat(100) + '\n');

const REL = /screen|siev|classif|separat|particle size|gradation|circuit|comminut|crush/i;
const EX = /sea ice|kelp|protein|molecul|gene|cell|mice|rat|wheat|corn|soil microb|aerosol|chest|health|anthropometric|insulin|RNA|DNA|screen time|drug|patient|cancer|CRISPR|p53/i;

const seen = new Map();
for (const q of Q) {
  const r = await g('https://zenodo.org/api/records?size=8&q=' + encodeURIComponent(q) + '&type=dataset');
  if (r.s !== 200) { console.log('  - [' + q + '] HTTP ' + (r.s || r.e)); continue; }
  let j; try { j = JSON.parse(r.t); } catch { continue; }
  let shown = 0;
  for (const h of (j.hits?.hits || [])) {
    const md = h.metadata || {};
    const title = String(md.title || '');
    if (!REL.test(title) || EX.test(title)) continue;
    const doi = md.doi || h.doi || '';
    if (seen.has(doi)) continue;
    seen.set(doi, { title, doi, lic: (md.license && (md.license.id || md.license)) || '?', files: (h.files || []).filter((f) => /\.(csv|txt|xlsx|json)$/i.test(f.key)).map((f) => f.key) });
    if (shown === 0) console.log('  -- [' + q + '] --');
    shown += 1;
    console.log('     ' + title.slice(0, 84));
    console.log('        ' + doi + '  ' + ((md.license && (md.license.id || md.license)) || '?'));
  }
  await new Promise((s) => setTimeout(s, 200));
}

console.log('\n' + '-'.repeat(100));
console.log('  候选 ' + seen.size + ' 个');
if (seen.size) {
  let i = 0;
  for (const [, v] of seen) { i += 1; console.log('   ' + String(i).padStart(2) + '. ' + v.title.slice(0, 76)); }
}
console.log('');
console.log('  判定标准（人工）：');
console.log('    要的是【含筛分作业的给料/产品粒度对应数据】，不是"用了筛子做样品制备"的论文附件。');
console.log('');
