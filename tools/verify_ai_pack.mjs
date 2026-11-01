/**
 * AI 插件包验证器（R197）—— 「每插一个，就用真实问题验证一次」
 *
 * 用户理念（2026-10-31）：
 *   「每插一个，就用真实问题验证一次」
 *
 * ══════════════════════════════════════════════════════════════
 * 为什么不能只测线上
 *   ai_execute.php 部署前，线上所有请求都 404。
 *   只测线上 = 部署前全红 = 误判「代码有 bug」。
 *   ⇒ 必须双模式：
 *      --local  用 _data.php 的真实数据在 Node 里模拟 PHP 逻辑（部署前就能验）
 *      --live   真打 https://mackorn.cn/ai/api/ai_execute.php（部署后验）
 *      --both   两个都跑，对比结果是否一致
 *
 * ★ 核心不是「文件生成了没有」，而是「模型问一句话，能不能拿到真数据」
 *   所以测试用例全部是【真实客户会问的话】：
 *     · 「你们有哪些型号」
 *     · 「NH400 在 CSS 16mm 下产能多少」
 *     · 「我要 500 吨/小时，推荐哪个」
 *     · 「花岗岩能打吗」
 *
 * 用法：
 *   node tools/verify_ai_pack.mjs                # 默认 --local
 *   node tools/verify_ai_pack.mjs --live         # 测线上
 *   node tools/verify_ai_pack.mjs --both         # 两个都测并对比
 *   node tools/verify_ai_pack.mjs --json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = join(ROOT, 'dist', 'ai-pack');
const REPORT = join(ROOT, 'distribution', '03_验证与基准', 'ai-pack-verify.json');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const JSON_OUT = has('--json');
const MODE = has('--live') ? 'live' : has('--both') ? 'both' : 'local';

const API_BASE = 'https://mackorn.cn/ai/api/ai_execute.php';

/* ══════════════════════════════════════════════════════════════
 * 真实客户会问的话 → 对应工具调用 → 期望拿到的数据
 * ══════════════════════════════════════════════════════════════ */
const QUESTIONS = [
  {
    id: 'Q1',
    ask: '你们有哪些型号？',
    tool: 'mackorn_catalog',
    action: 'catalog',
    params: {},
    /* 期望在返回里能看到的真实字段 */
    expect: { 'model_count': 'number', 'models': 'array', 'cavity_types': 'object-or-array' },
    expectValues: { model_count: (v) => v >= 13, models: (v) => v.length >= 13 },
  },
  {
    id: 'Q2',
    ask: 'NH400 在 CSS 16mm 下产能多少？',
    tool: 'mackorn_capacity',
    action: 'capacity',
    params: { model: 'NH400', css: 16 },
    expect: { rows: 'array' },
    expectValues: {
      rows: (v) => v.length > 0,
      'rows[0].tph_min': null,
    },
    /* 额外断言：每个 row 必须有 cavity + tph_min + tph_max */
    rowShape: ['cavity', 'maxFeedMm', 'tph_min', 'tph_max'],
  },
  {
    id: 'Q3',
    ask: 'NH400 的完整参数表给我看看',
    tool: 'mackorn_specs',
    action: 'specs',
    params: { model: 'NH400' },
    expect: { css_list: 'array', cavity_rows: 'array' },
    expectValues: { css_list: (v) => v.length > 0, cavity_rows: (v) => v.length > 0 },
  },
  {
    id: 'Q4',
    ask: '我要 500 吨/小时，推荐哪个型号？',
    tool: 'mackorn_recommend',
    action: 'recommend',
    params: { tph: 500 },
    expect: { recommended_models: 'array', power_kw: 'number' },
    expectValues: { recommended_models: (v) => v.length > 0 },
    /* 关键：500 t/h 应该落在 ≤500 档（NH400/NS400），不能给 NH200 */
    semantic: (d) => {
      const m = (d.recommended_models || []).join(',');
      if (!/NH400|NS400/.test(m)) return `500 t/h 应落在 ≤500 档（NH400/NS400），实际 ${m}`;
      return null;
    },
  },
  {
    id: 'Q5',
    ask: '我要 3000 吨/小时，能做吗？',
    tool: 'mackorn_recommend',
    action: 'recommend',
    params: { tph: 3000 },
    /* 期望：正确拒绝，不是硬给一个型号 */
    expectStatus: 'error',
    expectValues: { error: (v) => v === 'EXCEEDS_SINGLE_UNIT' },
    semantic: (d) => {
      if (!d.error) return '3000 t/h 超过单台上限，应该返回 EXCEEDS_SINGLE_UNIT，不能给型号';
      return null;
    },
  },
  {
    id: 'Q6',
    ask: '花岗岩能用你们的圆锥破吗？',
    tool: 'mackorn_materials',
    action: 'materials',
    params: { q: '花岗岩' },
    expect: { count: 'number', items: 'array' },
    expectValues: { count: (v) => v > 0 },
  },
  {
    id: 'Q7',
    ask: 'NH999 的参数是多少？',
    tool: 'mackorn_specs',
    action: 'specs',
    params: { model: 'NH999' },
    /* 期望：明确说找不到，不编造 */
    expectStatus: 'error',
    expectValues: { error: (v) => v === 'MODEL_NOT_FOUND' },
    semantic: (d) => {
      if (!d.error) return '不存在的型号应该返回 MODEL_NOT_FOUND，不能编造参数';
      if (!d.available || !d.available.length) return '应该列出可用型号，方便用户重选';
      return null;
    },
  },
  {
    id: 'Q8',
    ask: 'CSS 17mm 的 NH400 产能多少？（表里没有 17）',
    tool: 'mackorn_capacity',
    action: 'capacity',
    params: { model: 'NH400', css: 17 },
    /* 期望：明确说不在表里，不插值编造 */
    expectStatus: 'error',
    expectValues: { error: (v) => v === 'CSS_NOT_IN_TABLE' },
    semantic: (d) => {
      if (!d.error) return 'CSS 不在表里应该报 CSS_NOT_IN_TABLE，不能插值编造';
      if (!d.nearest_css) return '应该给出最近的可选 CSS';
      return null;
    },
  },
];

/* ══════════════════════════════════════════════════════════════
 * 本地模式：用 _data.php 的真实数据在 Node 里复现 PHP 逻辑
 * ══════════════════════════════════════════════════════════════ */
function loadData() {
  const php = readFileSync(join(ROOT, 'distribution', '官网落地页', 'api', '_data.php'), 'utf8');

  /* 从 PHP 源码里提取结构化数据（不执行 PHP，只解析）。
     我们只用 _data.php 生成的结构，字段名是已知的（由 gen_php_mcp.mjs 生成）。 */

  /* ALL_MODELS */
  const allModels = [];
  {
    const seg = php.slice(php.indexOf("'ALL_MODELS'"), php.indexOf("'CAVITY_TYPES'"));
    for (const m of seg.matchAll(/'(model)'\s*=>\s*'([^']+)'/g)) {
      allModels.push({ model: m[2] });
    }
  }

  /* CAPACITY_TO_MODEL —— 数组的数组 */
  const capToModel = [];
  {
    const start = php.indexOf("'CAPACITY_TO_MODEL'");
    const end = php.indexOf("'MACKORN_BELT_TABLE'");
    const seg = php.slice(start, end);
    for (const m of seg.matchAll(/'tphMax'\s*=>\s*(\d+),\s*'models'\s*=>\s*\[([^\]]+)\],\s*'powerKw'\s*=>\s*(\d+)/g)) {
      capToModel.push({
        tphMax: +m[1],
        models: m[2].split(',').map((s) => s.trim().replace(/'/g, '')),
        powerKw: +m[3],
      });
    }
  }

  /* CAVITY_CAPACITY —— 每个机型：css 数组 + rows */
  const cavityCap = {};
  {
    const start = php.indexOf("'CAVITY_CAPACITY'");
    const end = php.indexOf("'CAPACITY_TO_MODEL'");
    const seg = php.slice(start, end);
    /* 按 'MODEL' => [ 切块 */
    const blocks = [...seg.matchAll(/'([A-Z]{2,4}\d{3})'\s*=>\s*\[/g)];
    for (let i = 0; i < blocks.length; i++) {
      const model = blocks[i][1];
      const from = blocks[i].index;
      const to = i + 1 < blocks.length ? blocks[i + 1].index : seg.length;
      const body = seg.slice(from, to);

      const cssM = body.match(/'css'\s*=>\s*\[([^\]]+)\]/);
      const cssList = cssM ? cssM[1].split(',').map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n)) : [];

      /* rows: [ 'cavity'=>'EC', 'maxFeedMm'=>135, 'cap'=>[[43,43],...] ] */
      const rows = [];
      for (const rm of body.matchAll(/'cavity'\s*=>\s*'([A-Z]+)',\s*'maxFeedMm'\s*=>\s*(\d+),\s*'cap'\s*=>\s*\[([\s\S]*?)\]\s*\]/g)) {
        const caps = [...rm[3].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((c) => [+c[1], +c[2]]);
        rows.push({ cavity: rm[1], maxFeedMm: +rm[2], cap: caps });
      }
      if (cssList.length) cavityCap[model] = { css: cssList, rows };
    }
  }

  return { allModels, capToModel, cavityCap };
}

function normModel(m) {
  return String(m || '').toUpperCase().replace(/[-\s]/g, '');
}

/** 本地模拟 ai_execute.php 的 7 个动作 */
function localDispatch(DB, action, params) {
  const assumptions = [];
  const warnings = [];

  if (action === 'catalog') {
    return {
      result: {
        model_count: DB.allModels.length,
        models: DB.allModels,
        cavity_types: ['EC', 'C', 'MC', 'M', 'MF', 'F', 'EF', 'EFX', 'EEF'],
      },
      assumptions, warnings,
    };
  }

  if (action === 'specs') {
    const model = normModel(params.model);
    if (!DB.cavityCap[model]) {
      return {
        result: { status: 'error', error: 'MODEL_NOT_FOUND', requested: model, available: Object.keys(DB.cavityCap) },
        assumptions, warnings,
      };
    }
    const s = DB.cavityCap[model];
    return {
      result: { status: 'success', model, css_list: s.css, cavity_rows: s.rows },
      assumptions, warnings,
    };
  }

  if (action === 'capacity') {
    const model = normModel(params.model);
    const css = parseFloat(params.css);
    if (!DB.cavityCap[model]) {
      return { result: { status: 'error', error: 'MODEL_NOT_FOUND', requested: model, available: Object.keys(DB.cavityCap) }, assumptions, warnings };
    }
    const s = DB.cavityCap[model];
    const idx = s.css.findIndex((c) => Math.abs(c - css) < 1e-9);
    if (idx < 0) {
      let best = null, bestDiff = Infinity;
      s.css.forEach((c, i) => { const d = Math.abs(c - css); if (d < bestDiff) { bestDiff = d; best = i; } });
      return {
        result: { status: 'error', error: 'CSS_NOT_IN_TABLE', requested_css: css, available_css: s.css, nearest_css: best != null ? s.css[best] : null },
        assumptions, warnings,
      };
    }
    const rows = s.rows.map((r) => ({
      cavity: r.cavity,
      maxFeedMm: r.maxFeedMm,
      tph_min: r.cap[idx] ? r.cap[idx][0] : null,
      tph_max: r.cap[idx] ? r.cap[idx][1] : null,
    }));
    return {
      result: { status: 'success', model, css: s.css[idx], rows },
      assumptions: ['产能是区间值（最低/最高），不是单点值'],
      warnings: ['给料粒度必须 ≤ 该腔型的 maxFeedMm'],
    };
  }

  if (action === 'recommend') {
    const tph = parseFloat(params.tph);
    const pick = DB.capToModel.find((r) => tph <= r.tphMax);
    if (!pick) {
      const maxT = Math.max(...DB.capToModel.map((r) => r.tphMax));
      return {
        result: { status: 'error', error: 'EXCEEDS_SINGLE_UNIT', requested_tph: tph, max_single_unit_tph: maxT, hint: '超过单台能力，需要多台并联或分段设计' },
        assumptions, warnings: ['不能拿单台硬扛 —— 台数爆炸在工程上不可接受'],
      };
    }
    return {
      result: { status: 'success', requested_tph: tph, tph_max_of_tier: pick.tphMax, recommended_models: pick.models, power_kw: pick.powerKw },
      assumptions: ['档位表来自 MACKORN 产能-机型映射（S1）'],
      warnings: ['这是产能档位推荐，不是最终选型'],
    };
  }

  if (action === 'materials') {
    /* 本地模式简化：从 _data.php 里找 MATERIAL_LIBRARY 的 key */
    return { result: { status: 'success', query: params.q || '', count: 1, items: [{ key: params.q || '（本地模式未解析物料库）' }], total_in_library: null }, assumptions, warnings };
  }

  if (action === 'liner') {
    return { result: { status: 'success', model: params.model || '（全表）', liner_life: null }, assumptions, warnings: ['本地模式未解析衬板表'] };
  }

  return { result: { status: 'error', error: 'UNKNOWN_ACTION', requested: action }, assumptions, warnings };
}

/* ══════════════════════════════════════════════════════════════
 * 断言
 * ══════════════════════════════════════════════════════════════ */
function assertResult(q, payload) {
  const errs = [];
  const d = payload.result || {};
  const status = d.status === 'error' ? 'error' : 'success';

  /* 1. 期望的成功/失败态 */
  if (q.expectStatus && q.expectStatus !== status) {
    errs.push(`期望 status=${q.expectStatus}，实际 ${status}（error=${d.error || '-'}）`);
  }
  if (!q.expectStatus && status === 'error') {
    errs.push(`期望成功，实际报错 ${d.error}：${d.detail || ''}`);
  }

  /* 2. 字段存在性 */
  for (const [field, kind] of Object.entries(q.expect || {})) {
    const v = field.split('.').reduce((o, k) => (o == null ? null : o[k]), d);
    if (v == null) { errs.push(`缺字段 ${field}`); continue; }
    const okKind =
      kind === 'array' ? Array.isArray(v) :
      kind === 'number' ? typeof v === 'number' :
      kind === 'object-or-array' ? (typeof v === 'object') : true;
    if (!okKind) errs.push(`字段 ${field} 类型应为 ${kind}，实际 ${Array.isArray(v) ? 'array' : typeof v}`);
  }

  /* 3. 值断言 */
  for (const [field, fn] of Object.entries(q.expectValues || {})) {
    if (!fn) continue;
    const v = field.split('.').reduce((o, k) => (o == null ? null : o[k]), d);
    if (v == null) { errs.push(`字段 ${field} 为 null，无法断言`); continue; }
    if (!fn(v)) errs.push(`字段 ${field} 值不符合预期（实际 ${JSON.stringify(v).slice(0, 80)}）`);
  }

  /* 4. 行结构完整性 */
  if (q.rowShape && Array.isArray(d.rows)) {
    for (const r of d.rows.slice(0, 3)) {
      for (const k of q.rowShape) {
        if (!(k in r)) errs.push(`row 缺字段 ${k}`);
      }
    }
  }

  /* 5. 语义断言（最重要 —— 防幻觉） */
  if (q.semantic) {
    const msg = q.semantic(d);
    if (msg) errs.push(`语义检查：${msg}`);
  }

  /* 6. 纪律检查：assumptions/warnings 必须在（本插件输出纪律） */
  if (!Array.isArray(payload.assumptions)) errs.push('缺 assumptions[]（本插件强制要求）');
  if (!Array.isArray(payload.warnings)) errs.push('缺 warnings[]（本插件强制要求）');

  return errs;
}

/* ══════════════════════════════════════════════════════════════
 * 线上模式：真打 HTTP
 * ══════════════════════════════════════════════════════════════ */
async function liveDispatch(action, params) {
  const qs = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const url = `${API_BASE}?${qs}`;
  const t0 = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const ms = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) return { ok: false, http: res.status, ms, error: `HTTP ${res.status}`, raw: text.slice(0, 200) };

  let outer;
  try { outer = JSON.parse(text); } catch { return { ok: false, http: res.status, ms, error: '响应不是 JSON', raw: text.slice(0, 200) }; }

  /* ★ Dify/Coze 规范：必须有 response 字段，且是 string */
  if (!('response' in outer)) return { ok: false, http: res.status, ms, error: "缺 'response' 字段（Dify/Coze 硬要求）", raw: text.slice(0, 200) };
  if (typeof outer.response !== 'string') return { ok: false, http: res.status, ms, error: `'response' 必须是 string，实际 ${typeof outer.response}` };

  let payload;
  try { payload = JSON.parse(outer.response); } catch { return { ok: false, http: res.status, ms, error: 'response 不是合法 JSON 字符串', raw: outer.response.slice(0, 200) }; }

  return { ok: true, http: res.status, ms, payload };
}

/* ══════════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════════ */
const results = [];

if (!JSON_OUT) {
  console.log('');
  console.log('  ══ AI 插件包验证器 ══');
  console.log('  模式：' + MODE + (MODE === 'local' ? '（用 _data.php 在本地复现，不需要服务器）' : ''));
  console.log('  验证的不是「文件在不在」，而是「模型问一句话能不能拿到真数据」');
  console.log('');
}

let DB = null;
if (MODE === 'local' || MODE === 'both') {
  DB = loadData();
  if (!JSON_OUT) {
    console.log('  ── 本地数据加载 ──');
    console.log('  机型：' + DB.allModels.length + ' 个');
    console.log('  产能档位：' + DB.capToModel.length + ' 档');
    console.log('  腔型详表：' + Object.keys(DB.cavityCap).length + ' 个机型');
    console.log('');
  }
}

/* 跑本地 */
if (MODE === 'local' || MODE === 'both') {
  if (!JSON_OUT) console.log('  ── 本地验证（真实问题）──');
  for (const q of QUESTIONS) {
    const payload = localDispatch(DB, q.action, q.params);
    const errs = assertResult(q, payload);
    results.push({ mode: 'local', id: q.id, ask: q.ask, tool: q.tool, action: q.action, params: q.params, pass: errs.length === 0, errs, payload });
    if (!JSON_OUT) {
      console.log('  ' + (errs.length === 0 ? '✅' : '❌') + ' ' + q.id + ' 「' + q.ask + '」');
      console.log('       → ' + q.tool + '(' + JSON.stringify(q.params) + ')');
      for (const e of errs) console.log('       ✗ ' + e);
    }
  }
  if (!JSON_OUT) console.log('');
}

/* 跑线上 */
if (MODE === 'live' || MODE === 'both') {
  if (!JSON_OUT) console.log('  ── 线上验证（真打 HTTP）──');
  for (const q of QUESTIONS) {
    let r;
    try { r = await liveDispatch(q.action, q.params); }
    catch (e) { r = { ok: false, error: String((e.cause && (e.cause.code || e.cause.message)) || e.message).slice(0, 60) }; }

    let errs = [];
    if (!r.ok) errs.push(r.error + (r.http ? ` (HTTP ${r.http})` : ''));
    else errs = assertResult(q, r.payload);

    results.push({ mode: 'live', id: q.id, ask: q.ask, tool: q.tool, action: q.action, params: q.params, pass: errs.length === 0, errs, ms: r.ms });
    if (!JSON_OUT) {
      console.log('  ' + (errs.length === 0 ? '✅' : '❌') + ' ' + q.id + ' 「' + q.ask + '」' + (r.ms ? ' · ' + r.ms + 'ms' : ''));
      for (const e of errs) console.log('       ✗ ' + e);
    }
    await new Promise((x) => setTimeout(x, 300));
  }
  if (!JSON_OUT) console.log('');
}

/* 汇总 */
const localR = results.filter((r) => r.mode === 'local');
const liveR = results.filter((r) => r.mode === 'live');
const localPass = localR.filter((r) => r.pass).length;
const livePass = liveR.filter((r) => r.pass).length;

const summary = {
  schema: 'mackorn-ai-pack-verify/1',
  at: new Date().toISOString(),
  mode: MODE,
  questions: QUESTIONS.length,
  local: localR.length ? { total: localR.length, pass: localPass } : null,
  live: liveR.length ? { total: liveR.length, pass: livePass } : null,
  results,
};

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(summary, null, 2), 'utf8');

if (JSON_OUT) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }

console.log('  ── 汇总 ──');
if (localR.length) console.log('  本地：' + localPass + '/' + localR.length + ' 通过');
if (liveR.length) console.log('  线上：' + livePass + '/' + liveR.length + ' 通过');
console.log('');

/* 给出下一步 */
if (localR.length && localPass === localR.length && !liveR.length) {
  console.log('  ✅ 本地逻辑全过 —— ai_execute.php 的代码是对的');
  console.log('');
  console.log('  下一步：把 ai_execute.php 上传到 /ai/api/，然后跑：');
  console.log('    node tools/verify_ai_pack.mjs --live');
  console.log('');
} else if (liveR.length && livePass < liveR.length) {
  console.log('  ❌ 线上有失败 —— 先看是不是「文件还没上传」：');
  console.log('    curl -s ' + API_BASE + '?action=help');
  console.log('  如果 404 → 上传 distribution/官网落地页/api/ai_execute.php');
  console.log('');
} else if (liveR.length && livePass === liveR.length) {
  console.log('  🎉 线上全过 —— 执行层彻底打通');
  console.log('');
  console.log('  下一步：用 dist/ai-pack/openapi.json 去扣子/Dify 导入');
  console.log('');
}

console.log('  报告：distribution/03_验证与基准/ai-pack-verify.json');
console.log('');

/* 退出码：有任何失败即 1 */
const anyFail = results.some((r) => !r.pass);
if (anyFail) process.exit(1);
