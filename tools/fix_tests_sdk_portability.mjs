/**
 * 修复 tests/run.mjs（第 2 版，稳健写法）
 *
 * 做法从"精确多行锚点"改为"全局替换 + 结果断言"：
 *   1) 所有 sdk.assertSupportedJsonSchema(  → validateSchema(
 *   2) 所有 sdk.validateJsonSchemaValue(    → validateValue(
 *   3) 在 SDK 加载处定义 validateSchema / validateValue（真 SDK 优先，内置兜底）
 *   4) 去掉那些"因为缺 SDK 就整块不跑"的 if (sdk) 守卫
 *   5) 负控 3/4 依赖 SDK 的作者 DSL 转换器，缺 SDK 时显式 skip
 *
 * 可重复运行；已打过则跳过。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TARGET = join(ROOT, 'tests', 'run.mjs');

let t = readFileSync(TARGET, 'utf8');
if (t.includes('loadDshSdk')) { console.log('  已打过补丁，跳过'); process.exit(0); }

const nl = t.includes('\r\n') ? '\r\n' : '\n';
let changed = 0;
const rep = (from, to, label, optional = false) => {
  if (!t.includes(from)) { if (!optional) console.log(`  [warn] 未命中: ${label}`); return; }
  t = t.split(from).join(to); changed++;
};

/* ---------- 1) 各个调用点先统一改名 ---------- */
const before1 = (t.match(/sdk\.assertSupportedJsonSchema\(/g) || []).length;
const before2 = (t.match(/sdk\.validateJsonSchemaValue\(/g) || []).length;
rep('sdk.assertSupportedJsonSchema(', 'validateSchema(', 'assertSupportedJsonSchema 调用');
rep('sdk.validateJsonSchemaValue(', 'validateValue(', 'validateJsonSchemaValue 调用');

/* ---------- 2) 去掉"缺 SDK 就整块不跑"的守卫 ---------- */
rep('if (sdk) {' + nl + '  for (const def of defs) {', '{' + nl + '  for (const def of defs) {', 'C 段 if(sdk) 守卫');
rep('if (sdk) {' + nl + '  threw = false;', '{' + nl + '  threw = false;', '负控8 if(sdk) 守卫');

/* ---------- 3) 定义 validateSchema / validateValue + 内置兜底 ---------- */
const anchor = `let pass = 0;`;
if (!t.includes(anchor)) { console.error('  ❌ 找不到计数器锚点'); process.exit(1); }

const helpers = `const require_ = createRequire(import.meta.url);

/* ---------------------------------------------------------------------------
 * 定位官方 @deepseek-ai/dsh-tools SDK
 *
 * 曾经这里写死了一条本机绝对路径（D:/AI/npm_global/...）。后果：任何在别处克隆
 * 仓库的人、以及 GitHub Actions CI 跑测试都会 "Cannot find module" 而失败
 * —— 对一个主打"可验证"的项目是硬伤。
 *
 * 现在按顺序探测；全部失败时退回**内置子集校验器**。测试在任何机器上都跑得出
 * 有意义的结果，而不是"因为缺 SDK 就红"。
 * ------------------------------------------------------------------------- */
async function loadDshSdk() {
  const tried = [];
  const candidates = [];
  if (process.env.DSH_SDK_ROOT) {
    const r = String(process.env.DSH_SDK_ROOT).replace(/[\\\\/]+$/, '');
    candidates.push(join(r, 'dsh-tools', 'lib', 'index.js'), join(r, 'lib', 'index.js'));
  }
  try { candidates.push(require_.resolve('@deepseek-ai/dsh-tools')); } catch { /* 未作为依赖安装 */ }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  for (const p of [
    home && join(home, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'),
    'D:/AI/npm_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
    '/usr/lib/node_modules/@deepseek-ai/dsh-tools/lib/index.js',
  ]) if (p) candidates.push(p);

  for (const c of candidates) {
    tried.push(c);
    try {
      const m = await import(pathToFileURL(c).href);
      if (typeof m.assertSupportedJsonSchema === 'function') return { sdk: m, from: c, tried };
    } catch { /* 试下一个 */ }
  }
  return { sdk: null, from: null, tried };
}

/* 内置子集校验器：复刻 dsh enforced JSON Schema 子集的约束（官方 SDK 缺失时启用） */
const ALLOWED_KEYS = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);
const ALLOWED_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);

function assertSupportedJsonSchema(schema, path = '$') {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(path + ': schema 必须是对象');
  for (const k of Object.keys(schema)) if (!ALLOWED_KEYS.has(k)) throw new Error(path + ': 子集外关键字 "' + k + '"');
  if (schema.type !== undefined && !ALLOWED_TYPES.has(schema.type)) throw new Error(path + ': 非法 type "' + schema.type + '"');
  if (schema.type === 'object') {
    if (!('additionalProperties' in schema)) throw new Error(path + ': object 必须显式声明 additionalProperties');
    if (schema.required !== undefined && !Array.isArray(schema.required)) throw new Error(path + ': required 必须是字符串数组（不允许 required:true/false 的作者 DSL 写法）');
    for (const [pk, pv] of Object.entries(schema.properties || {})) assertSupportedJsonSchema(pv, path + '.properties.' + pk);
  }
  if (schema.items !== undefined) assertSupportedJsonSchema(schema.items, path + '.items');
  (schema.oneOf || []).forEach((b, i) => assertSupportedJsonSchema(b, path + '.oneOf[' + i + ']'));
  return true;
}

/** 内置取值校验兜底：验证工具输出是否符合自己的 output.schema（覆盖本插件用到的子集） */
function validateJsonSchemaValueFallback(schema, value, path = '$') {
  const out = [];
  if (schema === null || typeof schema !== 'object') return out;
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
    if (!schema.oneOf.some((b) => validateJsonSchemaValueFallback(b, value, path).length === 0)) out.push(path + ': 不匹配任何 oneOf 分支');
    return out;
  }
  if (schema.const !== undefined && value !== schema.const) out.push(path + ': 期望 const');
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) out.push(path + ': 不在 enum 内');
  const ty = schema.type;
  if (ty === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { out.push(path + ': 期望 object'); return out; }
    for (const k of schema.required || []) if (!(k in value)) out.push(path + ': 缺必填字段 ' + k);
    if (schema.additionalProperties === false) for (const k of Object.keys(value)) if (!(schema.properties || {})[k]) out.push(path + ': 多余字段 ' + k);
    for (const [k, sub] of Object.entries(schema.properties || {})) if (k in value) out.push(...validateJsonSchemaValueFallback(sub, value[k], path + '.' + k));
  } else if (ty === 'array') {
    if (!Array.isArray(value)) { out.push(path + ': 期望 array'); return out; }
    if (schema.items) value.forEach((v, i) => out.push(...validateJsonSchemaValueFallback(schema.items, v, path + '[' + i + ']')));
  } else if (ty === 'string') { if (typeof value !== 'string') out.push(path + ': 期望 string'); }
  else if (ty === 'number') { if (typeof value !== 'number') out.push(path + ': 期望 number'); }
  else if (ty === 'integer') { if (!Number.isInteger(value)) out.push(path + ': 期望 integer'); }
  else if (ty === 'boolean') { if (typeof value !== 'boolean') out.push(path + ': 期望 boolean'); }
  else if (ty === 'null') { if (value !== null) out.push(path + ': 期望 null'); }
  return out;
}

let pass = 0;`;

t = t.replace(anchor, helpers);

/* ---------- 4) 加载 SDK 并绑定 validateSchema / validateValue ---------- */
rep(`let sdk = null;`, `const { sdk, from, tried } = await loadDshSdk();
let validateSchema;
let validateValue;
if (sdk) {
  validateSchema = (s) => sdk.assertSupportedJsonSchema(s);
  validateValue = (s, v, p) => sdk.validateJsonSchemaValue(s, v, p);
} else {
  validateSchema = (s) => assertSupportedJsonSchema(s);
  validateValue = (s, v, p) => validateJsonSchemaValueFallback(s, v, p);
}
let sdk = null;`, 'SDK 变量声明');

// 原来的 try/catch 加载块整体替换为一条 check/skip
t = t.replace(/try \{\r?\n  sdk = await import\(pathToFileURL\(join\(DSH_SDK_ROOT[\s\S]*?\n\}\r?\n/, (m) =>
  `if (sdk) check('能加载官方 dsh-tools SDK', true, from);\n  else skip('官方 dsh-tools SDK 不可用，改用内置子集校验器', '探测了 ' + tried.length + ' 个位置');\n`);
changed++;

/* ---------- 5) skip 计数器 ---------- */
rep('let fail = 0;', 'let fail = 0;\nlet skipped = 0;', 'skipped 计数器');
rep(`function eq(a, b) {`, `function skip(label, why) {
  skipped += 1;
  console.log('  skip ' + label + (why ? ' :: ' + why : ''));
}

function eq(a, b) {`, 'skip 函数');

/* ---------- 6) 负控 3/4：缺 SDK 时显式跳过 ---------- */
t = t.replace(/(  check\('负控3：作者 DSL 中对象缺 additionalProperties 被拒绝', threw\);\r?\n\})/, (m) =>
  m + ` else {\n  skip('负控3：作者 DSL 缺 additionalProperties 被拒', '需要官方 SDK 的作者 DSL 转换器');\n}`);
t = t.replace(/(  check\('负控4：作者 DSL 的 required:false 被拒绝', threw\);\r?\n\})/, (m) =>
  m + ` else {\n  skip('负控4：作者 DSL 的 required:false 被拒', '需要官方 SDK 的作者 DSL 转换器');\n}`);

/* ---------- 7) 汇总加 skipped ---------- */
t = t.replace("=== 结果：${pass} 通过 / ${fail} 失败 ===", '=== 结果：${pass} 通过 / ${fail} 失败${skipped ? " / " + skipped + " 跳过" : ""} ===');

/* ---------- 断言 ---------- */
const resid = [...t.matchAll(/^\s*sdk\.(assertSupportedJsonSchema|validateJsonSchemaValue)\(/gm)];
if (resid.length) { console.error(`  ❌ 仍有 ${resid.length} 处 sdk.xxx 调用未改写`); process.exit(1); }
if (!t.includes('loadDshSdk')) { console.error('  ❌ loadDshSdk 未注入'); process.exit(1); }
if (!t.includes('validateJsonSchemaValueFallback')) { console.error('  ❌ 内置取值校验器未注入'); process.exit(1); }
if (!t.includes('function skip(')) { console.error('  ❌ skip() 未注入'); process.exit(1); }

writeFileSync(TARGET, t, 'utf8');
console.log(`  ✅ 已修复源码 tests/run.mjs（${changed} 处结构化替换）`);
console.log(`     - assertSupportedJsonSchema 调用点改写 ${before1} 处，validateJsonSchemaValue ${before2} 处`);
console.log('     - 新增：SDK 自动发现 + 内置子集校验器 + 内置取值校验兜底 + skip()');
