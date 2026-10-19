/**
 * 探针：真调一个工具，检查输出契约（教训 L-12）
 * 输出 JSON 到 stdout，父进程读取。全程无顶层 await 依赖问题。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const out = { ok: false, hasAsm: false, asmLen: 0, hasWarn: false, warnLen: 0, averaged: false, error: null };

try {
  const mod = await import(new URL('../plugin/index.mjs', import.meta.url).href);
  const defs = mod.toolDefinitions || [];
  const cap = defs.find((t) => t.name === 'mackorn_capacity_check');
  if (!cap) { out.error = 'no-tool'; }
  else {
    const r = await cap.execute({ model: 'NH400', cavity: 'M', css: 16 });
    out.hasAsm = Array.isArray(r.assumptions) && r.assumptions.length > 0;
    out.asmLen = (r.assumptions || []).length;
    out.hasWarn = Array.isArray(r.warnings);
    out.warnLen = (r.warnings || []).length;
    out.averaged = /"averaged"|"_averaged"|已平均|取平均/.test(JSON.stringify(r));
    out.ok = true;
  }
} catch (e) { out.error = String(e.message).slice(0, 100); }

const p = join(ROOT, 'distribution', '03_验证与基准', '_probe-tool-contract.json');
try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(out), 'utf8'); } catch { }
process.exit(0);
