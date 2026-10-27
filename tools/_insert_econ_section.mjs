#!/usr/bin/env node
/**
 * 把 docs/_econ_section.md 的内容插入 MACKORN-DSH-Plugin/AGENTS.md 头部。
 * 用「读文件 → 插入」的方式，彻底避开模板字符串里的反引号转义问题。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const AGENTS = join(ROOT, 'AGENTS.md');
const SECFILE = join(ROOT, 'docs', '_econ_section.md');
const MARK = '<!-- ECON-ROUTER-V0011 -->';

if (!existsSync(AGENTS)) { console.log('❌ 找不到 AGENTS.md'); process.exit(1); }
if (!existsSync(SECFILE)) { console.log('❌ 找不到 docs/_econ_section.md'); process.exit(1); }

let s = readFileSync(AGENTS, 'utf8');
if (s.includes(MARK)) {
  console.log('— AGENTS.md 已含该节，跳过');
  process.exit(0);
}
const sec = readFileSync(SECFILE, 'utf8');

// 插在第一个 "\n## " 之前（即紧跟文件头之后）
const idx = s.indexOf('\n## ');
const out = idx < 0
  ? s.trimEnd() + '\n\n' + sec.trimEnd() + '\n'
  : s.slice(0, idx) + '\n\n' + sec.trimEnd() + '\n' + s.slice(idx);

writeFileSync(AGENTS, out, 'utf8');
console.log('✅ 已插入 AGENTS.md');
console.log('  原 ' + s.length + ' 字符 → 现 ' + out.length + ' 字符');
console.log('  节位置：第 ' + (out.slice(0, out.indexOf(MARK)).split('\n').length) + ' 行');
