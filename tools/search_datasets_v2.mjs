/**
 * 公开数据集扩大检索 v2 —— 更宽的关键词面 + 更多仓库
 *
 * 目标（用户要求②）：再找含【给料/产品筛析】的公开 CC-BY 数据，优先圆锥破或筛分。
 * 纪律：检索不到就如实报 0，不把"我没搜到"说成"不存在"。
 */
const UA = 'MACKORN-Research/1.0 (mailto:leif.dai@mackorn.cn)';
const g = async (u, opt = {}) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'application/json', ...(opt.h || {}) }, method: opt.m || 'GET', body: opt.body, signal: AbortSignal.timeout(40000) });
    return { s: r.status, t: await r.text() };
  } catch (e) { return { s: 0, e: e.cause?.code || e.name, t: '' }; }
};

const QUERIES = [
  'screening test aggregate gradation', 'vibrating screen performance data',
  'jaw crusher throughput measurement', 'cone crusher liner wear measurement',
  'crushing plant throughput data', 'aggregate production gradation data',
  'rock crushing energy measurement', 'comminution test work data',
  'mineral liberation crushing data', 'ore sorting crushing data',
  'ball mill bond work index data', 'drop weight test comminution',
  'JK drop weight test data', 'particle breakage compression test',
  'crusher chamber geometry data', 'sieve analysis rock crushing',
  'aggregate shape index crushing', 'flakiness index crushed aggregate',
];

console.log('\n' + '═'.repeat(100));
console.log('  Zenodo 公开数据集扩大检索（' + QUERIES.length + ' 组关键词）');
console.log('═'.repeat(100) + '\n');

const seen = new Map();
const RELEVANT = /crusher|crushing|comminut|screen|siev|particle size|gradation|aggregate|ore|rock|breakage|ball mill|bond|drop weight|liberation/i;
const EXCLUDE = /sea ice|kelp|protein|molecular|pea|dust|aerosol|concrete|steel|crash|battery|x-ray|chest|health|colombia|anthropometric|insulin|gene|cell|mice|rat|wheat|corn|soil microbial/i;

for (const q of QUERIES) {
  const r = await g('https://zenodo.org/api/records?size=10&q=' + encodeURIComponent(q) + '&type=dataset');
  if (r.s !== 200) { console.log('  ○ [' + q + '] HTTP ' + (r.s || r.e)); continue; }
  let j; try { j = JSON.parse(r.t); } catch { continue; }
  const hits = (j.hits && j.hits.hits) || [];
  let shown = 0;
  for (const h of hits) {
    const m = h.metadata || {};
    const title = String(m.title || '');
    if (!RELEVANT.test(title) || EXCLUDE.test(title)) continue;
    const doi = m.doi || h.doi || '';
    if (seen.has(doi)) continue;
    seen.set(doi, title);
    if (shown === 0) console.log('  ── [' + q + '] ──');
    shown += 1;
    const files = (h.files || []).filter((f) => /\.(csv|txt|json|xlsx|xls)$/i.test(f.key)).map((f) => f.key + '(' + Math.round((f.size || 0) / 1024) + 'KB)').slice(0, 4);
    console.log('    ' + title.slice(0, 80));
    console.log('       DOI ' + doi + '  ' + (m.publication_date || '') + '  许可 ' + ((m.license && (m.license.id || m.license)) || '?'));
    if (files.length) console.log('       可下载: ' + files.join(', '));
  }
  await new Promise((s) => setTimeout(s, 250));
}

console.log('\n' + '─'.repeat(100));
console.log('  去重后 ' + seen.size + ' 个候选数据集');
console.log('');
if (seen.size) {
  console.log('  全部候选：');
  let i = 0;
  for (const [doi, title] of seen) { i += 1; console.log('    ' + String(i).padStart(2) + '. ' + title.slice(0, 74) + '  [' + doi + ']'); }
}
console.log('');
