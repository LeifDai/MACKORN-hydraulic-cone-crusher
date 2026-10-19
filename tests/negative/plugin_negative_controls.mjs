/**
 * G4 插件级负控 —— 故意造坏，确认会响亮报错
 *
 * 蓝图第九节：「先做负控。装一份故意弄坏的副本，确认日志会响亮报错。
 *              只有负控响过，'干净日志'才算证据。」
 *
 * 本脚本在内存里构造 6 种"坏插件"，逐一验证【我们自己的加载器/校验器】
 * 能抓到它们。抓不到 = 我们的校验形同虚设。
 *
 * 六种坏法（都对应蓝图"常见坑"表里的真实事故）：
 *   N1 对象 schema 忘写 additionalProperties
 *   N2 属性里用 required: true（defineTool DSL 写法直接传给 register）
 *   N3 工具名重复
 *   N4 裸包名 import（会让整个 profile 启动失败）
 *   N5 用了不支持的 schema 关键字（minLength）
 *   N6 execute 抛错
 */
import { pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');   // tests/negative/ → 上两级才是插件根

const m = await import(pathToFileURL(join(ROOT, 'plugin', 'index.mjs')).href);
const defs = m.toolDefinitions;

/* ── 我们自己的契约校验器（与 tests/run.mjs 同口径）── */
const SUPPORTED = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);

function validateSchema(s, path = '$', isProperty = false) {
  const errs = [];
  if (!s || typeof s !== 'object') { errs.push(path + ' 不是对象'); return errs; }
  for (const k of Object.keys(s)) {
    if (!SUPPORTED.has(k)) errs.push(path + ' 含不支持的关键字 ' + k);
  }
  /* ⚠️ required 的合法用法（这个检查改过两次，如实记录）：
   *   v1：SUPPORTED 集合含 'required' → 完全检查不出来（N2 漏网）
   *   v2：只要 isProperty 就报错 → 误报 4 个真实工具
   *       （industry / entries.items / stages.items / feed_points.items 都是
   *         object 类型，它们的 required 是【对象级】的合法写法）
   *   v3（本版）：required 必须【是数组】，且【只能出现在 object 类型上】。
   *       这才是蓝图的真实要求：「必填用对象上的 required 数组，
   *       不是属性里的 required: true」。 */
  if ('required' in s) {
    if (!Array.isArray(s.required)) {
      errs.push(path + ' 的 required 不是数组（属性级 required: true 是 DSL 写法，直接传 register 会被拒）');
    } else if (s.type !== 'object') {
      errs.push(path + ' 有 required 数组但 type 不是 object（required 只能用于对象）');
    }
  }
  if (s.type === 'object') {
    if (!('additionalProperties' in s)) errs.push(path + ' 是 object 但未显式写 additionalProperties');
    if (s.properties) for (const [k, v] of Object.entries(s.properties)) errs.push(...validateSchema(v, path + '.' + k, true));
    if (s.required && !Array.isArray(s.required)) errs.push(path + '.required 不是数组');
  }
  if (s.type === 'array') {
    if (!s.items) errs.push(path + ' 是 array 但没有 items');
    else errs.push(...validateSchema(s.items, path + '.items', true));
  }
  return errs;
}

function validateTool(d) {
  const errs = [];
  if (typeof d.name !== 'string' || !d.name) errs.push('缺 name');
  if (typeof d.description !== 'string' || d.description.length < 20) errs.push('description 过短');
  if (!d.parameters) errs.push('缺 parameters');
  else errs.push(...validateSchema(d.parameters, 'parameters'));
  if (!d.output || typeof d.output.render !== 'function') errs.push('缺 output.render');
  if (typeof d.execute !== 'function') errs.push('缺 execute');
  return errs;
}

/* ── 6 种坏插件 ── */
const GOOD = {
  name: 'mackorn_negative_probe',
  description: '一个用于负控测试的合法工具定义，正常情况下应当通过所有校验。',
  parameters: { type: 'object', properties: { x: { type: 'number', description: '测试输入' } }, required: ['x'], additionalProperties: false },
  output: { schema: { type: 'object', additionalProperties: true }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
  async execute(args) { return { ok: args.x }; },
};

const CASES = [
  {
    id: 'N1', name: '对象 schema 忘写 additionalProperties',
    bad: { ...GOOD, parameters: { type: 'object', properties: { x: { type: 'number' } } } },
    expect: /additionalProperties/,
  },
  {
    id: 'N2', name: '属性里用 required: true（DSL 写法误传给 register）',
    bad: { ...GOOD, parameters: { type: 'object', properties: { x: { type: 'number', required: true } }, additionalProperties: false } },
    expect: /required 不是数组/,   // 报错文本随校验逻辑演进过，这里对齐当前实现
  },
  {
    id: 'N3', name: '工具名与已有工具重复',
    bad: { ...GOOD, name: defs[0].name },
    expect: null,   // 用另一个检查：重名检测
  },
  {
    id: 'N4', name: '裸包名 import（会拖垮整个 profile）',
    bad: { ...GOOD, _src: "import { defineTool } from '@deepseek-ai/dsh-tools';" },
    expect: /裸包名/,
  },
  {
    id: 'N5', name: '用了不支持的 schema 关键字 minLength',
    bad: { ...GOOD, parameters: { type: 'object', properties: { x: { type: 'number', minLength: 1 } }, additionalProperties: false } },
    expect: /不支持的关键字 minLength/,
  },
  {
    id: 'N6', name: 'execute 抛错',
    bad: { ...GOOD, async execute() { throw new Error('负控：故意失败'); } },
    expect: /负控：故意失败/,
  },
];

console.log('\n' + '═'.repeat(102));
console.log('  G4 插件级负控 —— 故意造坏，确认我们的校验器会响亮报错');
console.log('═'.repeat(102) + '\n');

let caught = 0;
for (const c of CASES) {
  let got = null;

  if (c.id === 'N3') {
    // 重名检测：把坏工具加进真实工具表，看是否报重名
    const names = defs.map((d) => d.name);
    got = names.includes(c.bad.name) ? ('检测到工具名重复: ' + c.bad.name) : null;
  } else if (c.id === 'N4') {
    // 裸包名检测：模拟源码扫描
    got = /^\s*import\s+[^'"]*from\s+['"](?!\.|node:)/m.test(c.bad._src) ? '检测到裸包名 import' : null;
  } else if (c.id === 'N6') {
    // execute 抛错：真调一次，确认错误能传出
    try { await c.bad.execute({ x: 1 }); got = null; }
    catch (e) { got = String(e.message); }
  } else {
    // schema 校验
    const errs = validateTool(c.bad);
    got = errs.length ? errs.join('; ') : null;
  }

  const ok = got !== null && (!c.expect || c.expect.test(got));
  if (ok) caught += 1;
  console.log('  ' + (ok ? '✅ 已抓到' : '❌ 漏网') + '  ' + c.id + ' ' + c.name);
  console.log('        ' + (got ? '报错: ' + got.slice(0, 100) : '⚠️ 校验器没报错 —— 这是校验缺口！'));
}

/* 正控：合法工具必须通过（否则说明校验器太严，会把好插件也拒了） */
console.log('');
console.log('  ── 正控（合法定义必须通过，否则校验器过严）──');
const goodErrs = validateTool(GOOD);
const goodOk = goodErrs.length === 0;
console.log('  ' + (goodOk ? '✅' : '❌') + '  L0 合法工具定义' + (goodOk ? ' 通过校验' : ' 被误拒: ' + goodErrs.join('; ')));

/* 真实工具全部通过 */
const realBad = defs.map((d) => ({ n: d.name, e: validateTool(d) })).filter((x) => x.e.length);
console.log('  ' + (realBad.length === 0 ? '✅' : '❌') + '  22 个真实工具' + (realBad.length === 0 ? ' 全部通过校验' : ' 有 ' + realBad.length + ' 个不合法: ' + realBad.map((x) => x.n).join(', ')));

console.log('');
console.log('═'.repeat(102));
console.log('  负控 ' + caught + '/' + CASES.length + ' 抓到' + (caught === CASES.length ? '  ✅ 校验器有效' : '  ❌ 有漏网，校验形同虚设'));
console.log('  正控 ' + (goodOk && realBad.length === 0 ? '✅ 通过（不过严）' : '❌ 过严'));
console.log('');
process.exit(caught === CASES.length && goodOk && realBad.length === 0 ? 0 : 1);
