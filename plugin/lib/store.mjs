/**
 * 零依赖（自身）：可写存储探测与优雅降级
 *
 * 问题（R36 端到端验证发现）：
 *   mackorn_knowledge_update 在受限沙箱下直接抛 EPERM 崩溃 —— 工具不该因写不进去就死。
 *   用户环境若是只读或受限，插件会整块失效。
 *
 * 修法：
 *   ① 按优先级探测可写位置：$MACKORN_KB_DIR > $DSH_HOME/mackorn-knowledge > 插件同级 .data/
 *   ② 每个候选位置【实际试写一个小文件】确认可写，不靠猜测
 *   ③ 全部不可写时返回 null，调用方降级为「只读模式」而不是抛错
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let cached = undefined;   // undefined = 未探测；null = 全不可写；string = 可写目录

/** 实际试写验证可写性 */
function tryWritable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, '.write-probe');
    writeFileSync(probe, String(Date.now()), 'utf8');
    unlinkSync(probe);
    return true;
  } catch { return false; }
}

/** 候选目录（按优先级） */
function candidates(sub) {
  const out = [];
  if (process.env.MACKORN_KB_DIR) out.push(join(process.env.MACKORN_KB_DIR, sub || ''));
  const home = process.env.DSH_HOME || join(homedir(), '.dsh');
  out.push(join(home, 'mackorn-knowledge', sub || ''));
  // 兜底：插件同级的 .mackorn-data（随插件目录，通常在工作区或安装目录内）
  out.push(join(HERE, '..', '..', '.mackorn-data', sub || ''));
  return out.filter(Boolean);
}

/**
 * 找到第一个【确实可写】的目录。
 * @returns {string|null} null 表示全部不可写 —— 调用方必须降级，不能抛错
 */
export function writableDir(sub = '') {
  if (cached !== undefined && !sub) return cached;
  for (const d of candidates(sub)) {
    if (tryWritable(d)) { if (!sub) cached = d; return d; }
  }
  if (!sub) cached = null;
  return null;
}

/** 当前存储模式（供工具回显给用户） */
export function storageMode() {
  const d = writableDir();
  if (d) {
    const persisted = /mackorn-knowledge/.test(d);
    return {
      mode: persisted ? 'persistent' : 'session-local',
      dir: d,
      note: persisted
        ? '知识库落在 $DSH_HOME/mackorn-knowledge（插件升级不丢）'
        : '⚠️ $DSH_HOME 不可写，已降级到插件目录下的 .mackorn-data —— 数据随插件目录，插件升级可能丢失',
    };
  }
  return {
    mode: 'read-only',
    dir: null,
    note: '⚠️ 所有候选位置都不可写 —— 本次运行处于【只读模式】：可以校验与计算，但不会持久化任何内容。这是环境限制，不是插件故障。',
  };
}

/**
 * 安全写入：写不进去就返回 false，绝不抛错。
 * @returns {{ok:boolean, path:string|null, reason?:string}}
 */
export function safeWrite(relPath, content) {
  const d = writableDir();
  if (!d) return { ok: false, path: null, reason: '无可写目录（只读模式）' };
  const p = join(d, relPath);
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, path: null, reason: '写入失败: ' + String(e.message).slice(0, 80) };
  }
}

/** 安全读取：读不到返回 null，绝不抛错 */
export function safeRead(relPath) {
  for (const d of candidates()) {
    const p = join(d, relPath);
    try { if (existsSync(p)) return readFileSync(p, 'utf8'); } catch { }
  }
  return null;
}

/** 安全追加 */
export function safeAppend(relPath, line) {
  const d = writableDir();
  if (!d) return { ok: false, path: null, reason: '无可写目录（只读模式）' };
  const p = join(d, relPath);
  try {
    mkdirSync(dirname(p), { recursive: true });
    const prev = existsSync(p) ? readFileSync(p, 'utf8') : '';
    writeFileSync(p, prev + line, 'utf8');
    return { ok: true, path: p };
  } catch (e) {
    return { ok: false, path: null, reason: '追加失败: ' + String(e.message).slice(0, 80) };
  }
}
