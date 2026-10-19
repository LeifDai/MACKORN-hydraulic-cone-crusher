/**
 * version.json 生成器（R26 新建）
 *
 * 为什么需要：
 *   version.json 是【线上的唯一真相源】，check_live_state / monitor_live / preflight
 *   都读它判断"线上有几个工具"。但它里面的 remote_mcp_tools 一直是手写的 21，
 *   工具数升到 22 后无人更新 —— 于是所有基于它的判断都建立在错误数字上。
 *
 * 本脚本从 plugin/index.mjs 的【实际工具定义】生成 remote_tool_list 与 remote_mcp_tools，
 * 让硬事实只有一个来源。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VP = join(ROOT, 'distribution', '官网落地页', 'ai', 'version.json');

if (!existsSync(VP)) { console.error('  ❌ 找不到 version.json'); process.exit(1); }
const v = JSON.parse(readFileSync(VP, 'utf8'));
const idx = readFileSync(join(ROOT, 'plugin', 'index.mjs'), 'utf8');
const tools = (idx.match(/^\s{2}name: '(mackorn_[a-z_]+)',/gm) || []).map((l) => l.match(/'(mackorn_[a-z_]+)'/)[1]);
if (!tools.length) { console.error('  ❌ 未解析到任何工具定义'); process.exit(1); }

const before = { tools: v.remote_mcp_tools, list: (v.remote_tool_list || []).length };
v.remote_mcp_tools = tools.length;
v.remote_tool_list = tools;
v.built_at = new Date().toISOString();
v.build_id = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
writeFileSync(VP, JSON.stringify(v, null, 2) + '\n', 'utf8');

console.log('');
console.log('  version.json 已重生成');
console.log('    工具数: ' + before.tools + ' → ' + tools.length + (before.tools !== tools.length ? '  ⚠️ 修正了陈旧值' : ''));
console.log('    工具列表: ' + before.list + ' → ' + tools.length);
console.log('    build_id: ' + v.build_id);
console.log('');
