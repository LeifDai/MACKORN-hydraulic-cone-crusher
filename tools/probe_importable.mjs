/**
 * 探针：真 import 一批带 CLI 的脚本，确认可安全导入（教训 L-32）
 * 输出 JSON 到文件，父进程读取。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CANDIDATES = ['lessons.mjs', 'verify_libraries.mjs', 'libraries.mjs',
  'syntax_gate.mjs', 'build_indexing_playbook.mjs', 'build_action_checklist.mjs',
  'sync_hard_facts.mjs', 'audit_run_guards.mjs'];
const out = { imported: 0, bad: [] };

for (const t of CANDIDATES) {
  const f = new URL('./' + t, import.meta.url).href;
  try { await import(f); out.imported += 1; }
  catch (e) { out.bad.push(t + '(' + String(e.message).slice(0, 36) + ')'); }
}

const p = join(ROOT, 'distribution', '03_验证与基准', '_probe-importable.json');
try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(out), 'utf8'); } catch { }
process.exit(0);
