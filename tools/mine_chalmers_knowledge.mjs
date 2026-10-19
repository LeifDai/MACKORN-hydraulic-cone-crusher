/**
 * 深挖 Chalmers 文本：提取【可用的模型与工程知识】
 *
 * 目标不是抽数字（数字在图里），而是抽【知识与关系】：
 *   ① 圆锥破性能的影响因素与相互关系（eccentric / chamber / CSS / capacity）
 *   ② 破碎函数与选择函数的表述
 *   ③ 作者对"标定与验证"的方法论结论
 *   ④ 任何可用的经验关系式
 *
 * 纪律：每条都带原文，可回溯；抽不到就是空，不编。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(resolve(HERE, '..'), 'distribution', '03_验证与基准', '实测数据', 'chalmers-cone-crusher');

const docs = [
  { key: 'chalmers-759', title: 'Cone Crusher Performance (2015)', f: 'chalmers-759.txt' },
  { key: 'chalmers-170211', title: 'Modelling and Simulation of Dynamic Behaviour (2013)', f: 'chalmers-170211.txt' },
];

/** 主题词表：每个主题找含该词、且带数字或因果词的句子 */
const TOPICS = {
  '破碎函数': /\bbreakage function\b|\bbreakage\b[^.]{0,60}\b(function|model|matrix)\b/i,
  '选择函数': /\bselection\b[^.]{0,50}\b(function|model)\b/i,
  '偏心距与产能': /\beccentric\b[^.]{0,120}\b(capacity|throughput|stroke|speed)\b/i,
  '腔型与性能': /\bchamber\b[^.]{0,120}\b(capacity|performance|geometry|profile)\b/i,
  'CSS 与产品粒度': /\b(CSS|closed side)\b[^.]{0,120}\b(P80|product|size|grading)\b/i,
  '层压破碎': /\b(interparticle|choke|choked|compression|bed)\b[^.]{0,100}\b(crush|break|ratio)\b/i,
  '标定方法': /\bcalibrat/i,
  '验证方法': /\bvalidat/i,
  '模型局限': /\b(limitation|uncertain|assumption|simplif|valid only|not able)\b/i,
  '转速影响': /\bspeed\b[^.]{0,100}\b(capacity|performance|product)\b/i,
};

const out = {};
for (const d of docs) {
  const txt = readFileSync(join(DIR, d.f), 'utf8');
  const sents = txt.split(/(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 30 && s.length < 400);
  out[d.key] = { title: d.title, topics: {} };
  for (const [name, re] of Object.entries(TOPICS)) {
    const hits = sents.filter((s) => re.test(s)).slice(0, 6);
    if (hits.length) out[d.key].topics[name] = hits;
  }
}

/* 输出 */
let total = 0;
for (const [key, v] of Object.entries(out)) {
  console.log('\n' + '═'.repeat(98));
  console.log('  ' + v.title);
  console.log('═'.repeat(98));
  for (const [topic, sents] of Object.entries(v.topics)) {
    console.log('\n  ── ' + topic + '（' + sents.length + ' 条）──');
    for (const s of sents) { console.log('     · ' + s.slice(0, 230)); total += 1; }
  }
}
console.log('\n  共提取 ' + total + ' 条原文片段\n');

writeFileSync(join(DIR, 'mined-knowledge.json'), JSON.stringify({
  generated: new Date().toISOString(),
  purpose: '从 Chalmers 公开圆锥破研究文本中提取的【知识与关系】（非数字，数字在图里）',
  sources: docs.map((d) => ({ key: d.key, title: d.title })),
  discipline: '每条都是原文片段，可回溯；抽不到就是空，不编。用于印证/修正本插件的建模假设。',
  topics: Object.keys(TOPICS),
  extracted: out,
}, null, 2), 'utf8');
console.log('  ✅ ' + join(DIR, 'mined-knowledge.json') + '\n');
