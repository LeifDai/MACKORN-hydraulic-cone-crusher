/**
 * 改源码后自检（共享助手 · 教训 L-28）
 *
 * 用法（在改完源码的脚本末尾调用）：
 *     import { verifyAfterWrite } from './verify_after_write.mjs';
 *     verifyAfterWrite();
 *
 * 它会：
 *   ① 对仓库里所有关键 .mjs 跑 node --check
 *   ② 有任何一个不能解析 → 打印详情并 process.exit(1)
 *
 * 为什么需要：文本替换的锚点不存在会【静默失败】。R31 事故就是
 *   apply_tags 把内容插进字符串字面量内部 → 22 行引号损坏 →
 *   plugin/index.mjs 无法解析，而当时所有门禁全绿。
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const DEFAULT_TARGETS = [
  'plugin/index.mjs',
  'plugin/lib/guardrails.mjs',
  'plugin/lib/engine.mjs',
  'plugin/lib/data.mjs',
  'tools/lessons.mjs',
  'tools/enforce_lessons.mjs',
  'tools/build_public.mjs',
];

export function verifyAfterWrite(targets = DEFAULT_TARGETS, opts = {}) {
  const bad = [];
  for (const rel of targets) {
    const f = join(ROOT, rel);
    if (!existsSync(f)) continue;
    let ok = false;
    for (let k = 0; k < 3 && !ok; k += 1) {
      try { execFileSync(process.execPath, ['--check', f], { stdio: 'ignore', windowsHide: true, timeout: 120000 }); ok = true; } catch { }
    }
    if (!ok) bad.push(rel);
  }
  if (bad.length) {
    console.error('');
    console.error('  ❌ 源码语法被改坏：' + bad.join(', '));
    console.error('     ⚠️ 这是 R31 事故的重演（文本替换锚点错位）—— 请立刻修复或回滚。');
    if (opts.exitOnFail !== false) process.exit(1);
    return false;
  }
  return true;
}
