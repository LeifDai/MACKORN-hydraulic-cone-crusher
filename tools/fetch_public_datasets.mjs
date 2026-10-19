/**
 * 下载并解析 Zenodo 上的公开破碎实测数据集
 *
 * 目标数据集：Granite jaw crushing dataset: particle size distribution of feed and product
 *   DOI: 10.5281/zenodo.21239431
 *   https://zenodo.org/api/records/21239431
 *
 * 这是目标①（公开验证数据集）的关键 —— 一份真实的、可引用的、含给料与产品筛析的公开数据。
 *
 * 纪律：
 *   · 只下载公开数据，保留原始文件与出处
 *   · 平台差异（颚破 vs 圆锥破）必须如实标注，不得当作直接对标
 *   · 数据解析失败就报失败，不猜
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '03_验证与基准', '实测数据');
mkdirSync(OUT, { recursive: true });

const H = { 'User-Agent': 'MACKORN-Research/1.0 (mailto:leif.dai@mackorn.cn)', 'Accept': '*/*' };

async function get(url, asText = true, timeout = 60000) {
  const c = new AbortController(); const id = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: H, signal: c.signal, redirect: 'follow' });
    clearTimeout(id);
    if (!r.ok) return { ok: false, status: r.status, text: '' };
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, status: r.status, buf, text: asText ? buf.toString('utf8') : '' };
  } catch (e) { clearTimeout(id); return { ok: false, status: 0, err: e.cause?.code || e.name, text: '' }; }
}

const RECORDS = [
  { id: '21239431', why: '花岗岩颚破实测：给料与产品粒度分布（最直接可用）', key: 'granite-jaw-crushing' },
  { id: '21702040', why: '脆性物料破碎 DEM + 实验验证数据', key: 'brittle-breakage-dem' },
  { id: '6390911', why: '水分含量对粉碎影响的实验数据', key: 'moisture-comminution' },
];

console.log('\n' + '═'.repeat(100));
console.log('  下载 Zenodo 公开破碎实测数据集');
console.log('═'.repeat(100) + '\n');

const manifest = [];
for (const rec of RECORDS) {
  console.log('  ── ' + rec.id + '　' + rec.why + ' ──');
  const r = await get('https://zenodo.org/api/records/' + rec.id);
  if (!r.ok) { console.log('    ❌ 记录取不到 HTTP ' + (r.status || r.err)); continue; }
  let j;
  try { j = JSON.parse(r.text); } catch { console.log('    ❌ 记录无法解析'); continue; }

  const md = j.metadata || {};
  console.log('    标题: ' + String(md.title || '').slice(0, 88));
  console.log('    许可: ' + ((md.license && (md.license.id || md.license)) || '未标注'));
  console.log('    DOI : ' + (j.doi || ''));
  console.log('    文件 ' + (j.files || []).length + ' 个:');

  const dir = join(OUT, rec.key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'zenodo-record.json'), JSON.stringify({
    id: rec.id, doi: j.doi, title: md.title,
    license: (md.license && (md.license.id || md.license)) || null,
    publication_date: md.publication_date,
    creators: md.creators,
    description: String(md.description || '').replace(/<[^>]+>/g, ' ').slice(0, 1200),
    url: 'https://zenodo.org/records/' + rec.id,
    retrieved: new Date().toISOString(),
  }, null, 2), 'utf8');

  for (const f of (j.files || [])) {
    const name = f.key;
    const size = f.size || 0;
    const link = (f.links && (f.links.self || f.links.download)) || ('https://zenodo.org/records/' + rec.id + '/files/' + encodeURIComponent(name));
    console.log('      · ' + name + '  ' + Math.round(size / 1024) + ' KB');
    // 只下小文件（< 5 MB）且是文本/表格类
    const isText = /\.(csv|txt|json|tsv|md|dat)$/i.test(name);
    if (size > 5 * 1024 * 1024 || !isText) { console.log('        （跳过：非文本或过大）'); continue; }
    const dl = await get(link);
    if (!dl.ok) { console.log('        ❌ 下载失败 HTTP ' + (dl.status || dl.err)); continue; }
    writeFileSync(join(dir, name), dl.buf);
    manifest.push({ record: rec.id, key: rec.key, file: name, bytes: dl.buf.length, url: link, doi: j.doi, license: (md.license && (md.license.id || md.license)) || null });
    console.log('        ✅ 已保存 ' + Math.round(dl.buf.length / 1024) + ' KB');
  }
  console.log('');
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  retrieved: new Date().toISOString(),
  purpose: '目标①：公开验证数据集 —— 用已发表文献/公开仓库中的实测给料与产品筛析数据',
  discipline: '只下载公开数据并保留出处与许可；平台差异（颚破/圆锥破）必须如实标注，不得当作直接对标',
  files: manifest,
}, null, 2), 'utf8');

console.log('  ✅ 共下载 ' + manifest.length + ' 个文件到 distribution/03_验证与基准/实测数据/');
console.log('');
