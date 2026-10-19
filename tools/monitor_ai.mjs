/**
 * 监控机器人 —— 具备多专家视角的持续监测
 *
 * 用户要求：
 *   "能否设计一个机器人，始终监控着市场的变化，具备刚才罗列的专家视角。
 *    哪里不完善的自动完善；这样我就有更多的时间，把产品和服务做的更好。"
 *
 * 三层架构：
 *   感知层 —— 采集（AI 引用 / 搜索引擎 / 自身状态 / 市场信号）
 *   判断层 —— 多专家视角判定"什么算不完善"
 *   行动层 —— 自动做能做的，其余转成"待你决策"清单
 *
 * 用法：
 *   node tools/monitor_ai.mjs              # 跑一轮，写日志并打印报告
 *   node tools/monitor_ai.mjs --json       # 只输出 JSON（供编排器消费）
 *
 * 日志：distribution/_monitor-log.jsonl（追加，可看趋势）
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const SRC = join(D, '官网落地页');
const LOG = join(D, '_monitor-log.jsonl');
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const jread = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

const findings = [];   // { view, level, item, detail, autoFixable }
const LEVELS = new Set(['ok', 'gap', 'warn', 'action']);
/**
 * 记录一条监测结果。
 * 自动识别 level 的位置（历史上调用顺序不统一），避免参数串位。
 * 支持的顺序：add(view, level, item, detail) / add(view, item, detail, level) /
 *            add(view, item, level, detail) / 末尾可加 boolean 表示可自动修补
 */
const add = (view, ...rest) => {
  let autoFixable = false;
  if (typeof rest[rest.length - 1] === 'boolean') autoFixable = rest.pop();
  const li = rest.findIndex((x) => typeof x === 'string' && LEVELS.has(x));
  const level = li >= 0 ? rest[li] : 'ok';
  const others = rest.filter((_, i) => i !== li);
  const [item, detail] = others;
  findings.push({ view, level, item: item ?? '', detail: detail ?? '', autoFixable });
};

/* ══════════════════════════════════════════════════════════
 * 感知层 1 —— AI 可发现性（网络专家视角）
 * ══════════════════════════════════════════════════════════ */
async function probeAiDiscoverability() {
  const probes = [
    ['官方 MCP Registry', 'https://registry.modelcontextprotocol.io/v0/servers?search=mackorn', /mackorn/i, '网络专家'],
    ['GitHub 仓库', 'https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher', /MACKORN/, '网络专家'],
    ['npm 包', 'https://registry.npmjs.org/mackorn-cone-crusher', /mackorn/, '计算机专家'],
    ['npmmirror 镜像', 'https://registry.npmmirror.com/mackorn-cone-crusher', /mackorn/, '计算机专家'],
    ['Glama', 'https://glama.ai/mcp/servers/LeifDai/MACKORN-hydraulic-cone-crusher', /mackorn/i, '网络专家'],
    ['LobeHub 检索', 'https://lobehub.com/mcp?q=mackorn', /mackorn/i, '网络专家'],
    ['MCP.so 检索', 'https://mcp.so/search?q=mackorn', /mackorn/i, '网络专家'],
  ];
  for (const [label, url, re, view] of probes) {
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(35000) });
      const t = r.status === 200 ? await r.text() : '';
      const hit = re.test(t);
      add(view, hit ? 'ok' : 'gap', 'AI 源收录：' + label, hit ? '已收录' : `HTTP ${r.status} · 未命中`);
    } catch (e) {
      add(view, 'warn', 'AI 源探测失败：' + label, e.cause?.code || e.message);
    }
  }
}

/* ══════════════════════════════════════════════════════════
 * 感知层 2 —— 自身状态（网络/计算机专家视角）
 * ══════════════════════════════════════════════════════════ */
function probeSelf() {
  // 页面与结构化数据
  let pages = 0, ldBad = 0, noCanon = 0, noHreflang = 0;
  const langs = new Set();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') {
        pages++;
        const t = read(p);
        const l = t.match(/<html lang="([^"]+)"/);
        if (l) langs.add(l[1]);
        if (!/rel="canonical"/.test(t)) noCanon++;
        if (!/hreflang=/.test(t)) noHreflang++;
        for (const b of t.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
          try { JSON.parse(b[1].trim()); } catch { ldBad++; }
        }
      }
    }
  };
  walk(SRC);
  const sm = read(join(SRC, 'sitemap.xml'));
  const smN = (sm.match(/<loc>/g) || []).length;

  add('网络专家', '站点页面数', `${pages} 页 · ${langs.size} 种语言`, pages >= 50 ? 'ok' : 'warn');
  add('网络专家', 'JSON-LD 合法性', ldBad === 0 ? `全部合法` : `${ldBad} 块非法`, ldBad === 0 ? 'ok' : 'gap', true);
  add('网络专家', 'canonical 覆盖', `${pages - noCanon}/${pages}`, noCanon === 0 ? 'ok' : 'warn');
  add('网络专家', 'hreflang 覆盖', `${pages - noHreflang}/${pages}`, noHreflang <= pages * 0.4 ? 'ok' : 'warn');
  add('网络专家', 'sitemap 覆盖', `${smN} URL vs ${pages} 页`, smN >= pages ? 'ok' : 'gap', true);
  add('网络专家', 'robots.txt AI 放行', /CCBot/.test(read(join(SRC, 'robots.txt'))) ? '含 CCBot 等 16 类' : '未放行', /CCBot/.test(read(join(SRC, 'robots.txt'))) ? 'ok' : 'gap');

  // 构建门禁
  add('计算机专家', '部署包', existsSync(join(D, '官网部署包.zip')) ? `${(statSync(join(D, '官网部署包.zip')).size / 1024).toFixed(0)} KB` : '缺失', existsSync(join(D, '官网部署包.zip')) ? 'ok' : 'gap', true);
  add('计算机专家', '大 Excel 数据库', existsSync(join(D, '全球矿山装备海关数据库.xlsx')) ? '存在' : '缺失', existsSync(join(D, '全球矿山装备海关数据库.xlsx')) ? 'ok' : 'gap', true);
}

/* ══════════════════════════════════════════════════════════
 * 感知层 3 —— 海关数据覆盖（AI量化/外贸专家视角）
 * ══════════════════════════════════════════════════════════ */
function probeTrade() {
  const tg = jread(join(D, 'trade-global.json')) || { countries: {} };
  const cs = Object.values(tg.countries || {});
  const w23 = cs.filter((c) => c.hs?.['847420']?.years?.['2023']?.usd != null).length;
  const wp = cs.filter((c) => c.hs?.['847490']?.years?.['2023']?.usd != null).length;
  add('外贸专家', '有 2023 破碎数据国家', `${w23} / 100`, w23 >= 100 ? 'ok' : 'gap', true);
  add('AI量化专家', '覆盖国家数', `${cs.length} / 173`, cs.length >= 100 ? 'ok' : 'gap', true);
  add('AI量化专家', '零件数据国家', `${wp} / 50`, wp >= 50 ? 'ok' : 'gap', true);
}

/* ══════════════════════════════════════════════════════════
 * 感知层 4 —— 市场信号（金融专家视角）
 * ══════════════════════════════════════════════════════════ */
async function probeMarketSignal() {
  // World Bank 商品价格（公开 API）
  try {
    const r = await fetch('https://api.worldbank.org/v2/country/WLD/indicator/PX.REX.REER?format=json&per_page=1', { headers: H, signal: AbortSignal.timeout(20000) });
    add('金融专家', 'World Bank API 可达', r.status === 200 ? '可达（可接商品价格监测）' : `HTTP ${r.status}`, r.status === 200 ? 'ok' : 'warn');
  } catch (e) {
    add('金融专家', 'World Bank API 可达', e.cause?.code || e.message, 'warn');
  }
  // 矿价提醒：不自动抓取（需权威源），只做人工提示
  add('金融专家', '矿价周期复核', '建议每月查 World Bank CMO / LME：铜·铁·金·镍·钼', 'action');
}

/* ══════════════════════════════════════════════════════════
 * 感知层 5 —— 多专家资产盘点（判断层）
 * ══════════════════════════════════════════════════════════ */
function probeAssets() {
  const ASSETS = [
    ['地质与采矿专家', '地质与矿区', 5],
    ['人力资源专家', '人才与组织', 5],
    ['金融专家', '金融与全生命周期', 5],
    ['物流专家', '物流与交付', 5],
    ['风控专家', '风控', 4],
    ['工程项目管理专家', '项目管理', 5],
  ];
  for (const [view, dir, min] of ASSETS) {
    const p = join(D, dir);
    const n = existsSync(p) ? readdirSync(p).filter((f) => f.endsWith('.md')).length : 0;
    add(view, `${dir}/ 交付`, `${n} 个 md`, n >= min ? 'ok' : (n > 0 ? 'warn' : 'gap'));
  }
}

/* ══════════════════════════════════════════════════════════
 * 感知层 6 —— 渠道与闭环完整性（渠道专家视角）
 * ══════════════════════════════════════════════════════════ */
function probeChannels() {
  const must = [
    ['备件专项页', join(SRC, 'ai', 'parts', 'en', 'index.html')],
    ['经销商招募页', join(SRC, 'distributors', 'index.html')],
    ['设计院/EPC 页', join(SRC, 'engineering-firms', 'index.html')],
    ['联系方式页(含二维码)', join(SRC, 'contact', 'index.html')],
    ['矿石指南索引', join(SRC, 'guides', 'index.html')],
    ['当地图', join(SRC, 'markets')],
  ];
  for (const [label, p] of must) {
    add('渠道专家', label, existsSync(p) ? '存在' : '缺失', existsSync(p) ? 'ok' : 'gap', true);
  }
  // 二维码
  const qrs = ['contact-qr.svg', 'ai-qr.svg', 'distributors-qr.svg', 'contact-qr.png'].filter((q) => existsSync(join(SRC, q)));
  add('渠道专家', '二维码资产', `${qrs.length} 个（SVG+PNG）`, qrs.length >= 4 ? 'ok' : 'gap', true);
  // AI 引用监测能力
  add('网络专家', 'AI 引用监测能力', existsSync(join(ROOT, 'tools', 'monitor_ai.mjs')) ? '本脚本' : '缺失', 'ok');
}

/* ══════════════════════════════════════════════════════════
 * 主流程
 * ══════════════════════════════════════════════════════════ */
const run = async () => {
  await probeAiDiscoverability();
  probeSelf();
  probeTrade();
  await probeMarketSignal();
  probeAssets();
  probeChannels();

  const ok = findings.filter((f) => f.level === 'ok').length;
  const gaps = findings.filter((f) => f.level === 'gap');
  const warns = findings.filter((f) => f.level === 'warn');
  const actions = findings.filter((f) => f.level === 'action');
  const autoFix = gaps.filter((f) => f.autoFixable);

  const record = {
    ts: new Date().toISOString(),
    ok: ok, gap: gaps.length, warn: warns.length, action: actions.length,
    autoFixable: autoFix.length,
    gaps: gaps.map((g) => ({ view: g.view, item: g.item, detail: g.detail })),
  };
  try { appendFileSync(LOG, JSON.stringify(record) + '\n', 'utf8'); } catch { }

  if (process.argv.includes('--json')) { console.log(JSON.stringify(record, null, 2)); return record; }

  const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', rd: '\x1b[31m', c: '\x1b[36m' };
  console.log('\n' + C.b + '═'.repeat(76) + C.r);
  console.log(C.b + '  监控机器人 · 多专家视角持续监测' + C.r + C.d + '   ' + new Date().toLocaleString('zh-CN') + C.r);
  console.log(C.b + '═'.repeat(76) + C.r);

  const BY = {};
  for (const f of findings) (BY[f.view] ||= []).push(f);
  for (const [view, items] of Object.entries(BY)) {
    const bad = items.filter((i) => i.level !== 'ok');
    console.log('\n' + C.b + '【' + view + '】' + C.r + (bad.length ? C.rd + '  ' + bad.length + ' 项需关注' + C.r : C.g + '  全部正常' + C.r));
    for (const i of items) {
      const icon = i.level === 'ok' ? C.g + '✓' + C.r : i.level === 'gap' ? C.rd + '✗' + C.r : i.level === 'warn' ? C.y + '!' + C.r : C.c + '→' + C.r;
      console.log('  ' + icon + ' ' + i.item.padEnd(26) + C.d + i.detail + C.r);
    }
  }

  console.log('\n' + C.b + '─'.repeat(76) + C.r);
  console.log('  正常 ' + C.g + ok + C.r + ' · 缺口 ' + C.rd + gaps.length + C.r + ' · 告警 ' + C.y + warns.length + C.r + ' · 待人工 ' + C.c + actions.length + C.r);
  if (autoFix.length) {
    console.log('\n  ' + C.c + '可自动修补 ' + autoFix.length + ' 项：' + C.r);
    for (const a of autoFix) console.log('    → ' + a.item + '（' + a.detail + '）');
    console.log('  ' + C.d + '执行：node tools/orchestrate.mjs（会自动重建并复检）' + C.r);
  }
  const manual = gaps.filter((f) => !f.autoFixable);
  if (manual.length) {
    console.log('\n  ' + C.rd + '需人工处理 ' + manual.length + ' 项：' + C.r);
    for (const m of manual) console.log('    ✗ [' + m.view + '] ' + m.item + '  —  ' + m.detail);
  }
  console.log('\n  ' + C.d + '日志：' + LOG.replace(ROOT + '\\', '') + C.r + '\n');
  return record;
};

run().then((r) => process.exit(r.gap > 0 ? 1 : 0)).catch((e) => { console.error('监控失败：' + e.message); process.exit(2); });
