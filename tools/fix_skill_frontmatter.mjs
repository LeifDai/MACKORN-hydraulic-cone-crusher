/**
 * 技能 frontmatter 修复 + 校验
 * 背景：给 whenToUse 注入多语言触发词时，字符串里含 ": "（冒号+空格），
 *      YAML 会把它当映射分隔符 → frontmatter 解析失败 → 整个技能被静默拒绝。
 *      （实测后果：6 个 MACKORN 技能从技能目录整体消失。）
 * 本脚本：把 whenToUse 重写成**安全的 YAML 纯量**，并用官方 yaml 库逐个校验。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const YAML = await import(pathToFileURL('D:/AI/npm_global/node_modules/@deepseek-ai/dsh/node_modules/yaml/dist/index.js').href);
const ROOT = process.argv[2];

/** 把任意文本变成安全的 YAML 纯量：去掉 ": "、行首指示符、注释符风险。 */
function safeScalar(s) {
  return String(s)
    .replace(/\r?\n/g, ' ')          // 单行
    .replace(/:\s+/g, '——')          // 冒号+空格 → YAML 映射指示符，必须消除
    .replace(/\s+#/g, ' #')          // 注释符前保留（YAML 纯量中 " #" 会截断注释）
    .replace(/^[-?*&!|>%@`"']/, '')  // 行首指示符
    .trim();
}

let broken = 0;
let fixed = 0;
console.log('=== 逐个技能 frontmatter 校验 ===');
for (const d of readdirSync(ROOT)) {
  const p = join(ROOT, d, 'SKILL.md');
  if (!existsSync(p)) continue;
  let t = readFileSync(p, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t);
  if (!m) { console.log(`  ✗ ${d}: 无 frontmatter`); broken += 1; continue; }

  let ok = true;
  let err = '';
  try { YAML.parse(m[1]); } catch (e) { ok = false; err = String(e.message).split('\n')[0]; }

  if (!ok) {
    broken += 1;
    console.log(`  ✗ ${d}: ${err}`);
    // 修复：逐行重写 whenToUse
    const lines = m[1].split(/\r?\n/);
    const out = lines.map((line) => {
      const mm = /^(whenToUse|description|name)\s*:\s*(.*)$/.exec(line);
      if (!mm) return line;
      return `${mm[1]}: ${safeScalar(mm[2])}`;
    });
    const newFm = out.join('\n');
    try {
      YAML.parse(newFm);
      t = t.replace(m[1], newFm);
      writeFileSync(p, t, 'utf8');
      fixed += 1;
      console.log(`     → 已修复并写入`);
    } catch (e2) {
      console.log(`     → 修复后仍失败: ${String(e2.message).split('\n')[0]}`);
    }
  } else {
    const o = YAML.parse(m[1]);
    const w = String(o.whenToUse ?? '');
    console.log(`  ✓ ${d}  name=${o.name}  desc=${String(o.description ?? '').length}字  whenToUse=${w.length}字`);
  }
}
console.log(`\n=== 结果：${broken} 个曾损坏 / ${fixed} 个已修复 ===`);

// 复检
console.log('\n=== 复检 ===');
let pass = 0;
for (const d of readdirSync(ROOT)) {
  const p = join(ROOT, d, 'SKILL.md');
  if (!existsSync(p)) continue;
  const t = readFileSync(p, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t);
  try {
    const o = YAML.parse(m[1]);
    if (!o.name || !o.description) throw new Error('缺 name/description');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.name)) throw new Error(`name 非 kebab-case: ${o.name}`);
    pass += 1;
    console.log(`  ✓ ${o.name}`);
  } catch (e) {
    console.log(`  ✗ ${d}: ${String(e.message).split('\n')[0]}`);
  }
}
console.log(`\n合规技能数：${pass}`);
process.exitCode = pass > 0 ? 0 : 1;
