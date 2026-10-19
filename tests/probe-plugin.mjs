/**
 * 装载探针（不是插件的一部分，只用于验证 DSH 是否真的挂载了绝对路径插件）。
 * import 与 apply 各写一行到 .runtime/probe.log。
 */
import { appendFileSync, mkdirSync } from 'node:fs';

const DIR = 'D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/.runtime';
const LOG = `${DIR}/probe.log`;
const stamp = (stage, extra = '') => {
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${stage} ${extra}\n`, 'utf8');
  } catch { /* ignore */ }
};

stamp('import');

export const name = 'mackorn-probe';
export const inject = ['tools'];

export function apply(ctx) {
  stamp('apply-enter', `hasToolsService=${typeof ctx?.tools?.register === 'function'}`);
  try {
    if (typeof ctx?.tools?.register !== 'function') throw new Error('ctx.tools 不可用');
    ctx.tools.register({
      name: 'mackorn_probe',
      description: '装载探针：仅用于验证插件是否被 DSH 真实挂载。',
      parameters: { type: 'object', additionalProperties: false },
      output: { schema: { type: 'object', additionalProperties: true }, render: () => [{ type: 'text', text: 'probe ok' }] },
      execute: () => ({ ok: true }),
    });
    stamp('registered');
  } catch (error) {
    stamp('register-failed', String(error && error.message));
  }
}
