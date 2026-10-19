/**
 * 探针：真调工具，检查对外页面上的算例数字是否来自工具输出（教训 L-09）
 * 输出 JSON 到文件，父进程同步读取。
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const out = { ok: false, nums: 0, found: 0, page: null, error: null };
try {
  const mod = await import(new URL('../plugin/index.mjs', import.meta.url).href);
  const defs = mod.toolDefinitions || [];
  const cap = defs.find((t) => t.name === 'mackorn_capacity_check');
  if (!cap) out.error = 'no-tool';
  else {
    const r = await cap.execute({ model: 'NH400', cavity: 'M', css: 16 });
    const js = JSON.stringify(r);
    const nums = [...new Set(js.match(/[0-9]{2,4}/g) || [])].slice(0, 15);
    out.nums = nums.length;
    const SITE = join(ROOT, 'distribution', '官网落地页', 'ai', 'tools');
    if (existsSync(SITE)) {
      for (const e of readdirSync(SITE, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const idx = join(SITE, e.name, 'index.html');
        if (existsSync(idx) && /capacity|NH400/i.test(readFileSync(idx, 'utf8'))) { out.page = e.name; break; }
      }
    }
    if (out.page) {
      const t = readFileSync(join(SITE, out.page, 'index.html'), 'utf8');
      out.found = nums.filter((x) => t.indexOf(x) >= 0).length;
    }
    out.ok = true;
  }
} catch (e) { out.error = String(e.message).slice(0, 100); }

const p = join(ROOT, 'distribution', '03_验证与基准', '_probe-case-examples.json');
try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(out), 'utf8'); } catch { }
process.exit(0);
