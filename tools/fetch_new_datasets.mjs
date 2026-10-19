/**
 * 下载并检查新发现的候选数据集
 *
 * 候选：
 *   · ResearchData for "A new calculation method for dynamic adjustment of bed..." (zenodo.17543579)
 *   · CARINA WP3 Task3.2 Dataset Crushing Environment (zenodo.22172971)
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(resolve(HERE, '..'), 'distribution', '03_验证与基准', '实测数据');
const H = { 'User-Agent': 'MACKORN-Research/1.0 (mailto:leif.dai@mackorn.cn)', 'Accept': '*/*' };

const RECS = [
  { id: '17543579', dir: 'bed-adjustment', why: '床层动态调整计算方法（可能与料层破碎相关）' },
  { id: '22172971', dir: 'carina-crushing', why: 'CARINA 项目破碎环境数据集' },
];

console.log('\n' + '═'.repeat(100));
console.log('  下载候选数据集');
console.log('═'.repeat(100) + '\n');

for (const rec of RECS) {
  console.log('  ── ' + rec.id + '　' + rec.why + ' ──');
  let j;
  try {
    const r = await fetch('https://zenodo.org/api/records/' + rec.id, { headers: H, signal: AbortSignal.timeout(40000) });
    if (!r.ok) { console.log('     ❌ 记录 HTTP ' + r.status); continue; }
    j = await r.json();
  } catch (e) { console.log('     ❌ ' + e.message.slice(0, 60)); continue; }

  const md = j.metadata || {};
  console.log('     标题: ' + String(md.title || '').slice(0, 88));
  console.log('     许可: ' + ((md.license && (md.license.id || md.license)) || '未标注'));
  console.log('     DOI : ' + j.doi);
  const desc = String(md.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (desc) console.log('     摘要: ' + desc.slice(0, 200));

  const dir = join(OUT, rec.dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'zenodo-record.json'), JSON.stringify({
    id: rec.id, doi: j.doi, title: md.title,
    license: (md.license && (md.license.id || md.license)) || null,
    creators: md.creators, publication_date: md.publication_date,
    description: desc.slice(0, 1500),
    url: 'https://zenodo.org/records/' + rec.id, retrieved: new Date().toISOString(),
  }, null, 2), 'utf8');

  for (const f of (j.files || [])) {
    const sz = Math.round((f.size || 0) / 1024);
    const isText = /\.(csv|txt|json|xlsx|xls|tsv)$/i.test(f.key);
    console.log('       · ' + f.key + '  ' + sz + ' KB' + (isText ? '' : '（非表格，跳过）'));
    if (!isText || (f.size || 0) > 8 * 1024 * 1024) continue;
    const link = (f.links && (f.links.self || f.links.download)) || ('https://zenodo.org/records/' + rec.id + '/files/' + encodeURIComponent(f.key));
    try {
      const dr = await fetch(link, { headers: H, signal: AbortSignal.timeout(120000) });
      if (!dr.ok) { console.log('         ❌ HTTP ' + dr.status); continue; }
      const buf = Buffer.from(await dr.arrayBuffer());
      writeFileSync(join(dir, f.key), buf);
      console.log('         ✅ 已保存 ' + Math.round(buf.length / 1024) + ' KB');
    } catch (e) { console.log('         ❌ ' + String(e.message).slice(0, 50)); }
  }
  console.log('');
}
