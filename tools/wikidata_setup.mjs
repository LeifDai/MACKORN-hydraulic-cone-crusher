/**
 * Wikidata 实体创建工具
 *
 * ⚠️ 安全与合规
 *   ① 密码只从环境变量 WD_PASSWORD 读取，绝不写入文件
 *   ② 遵守 Wikidata 关注度政策（WD:N）—— 只为有可靠公开来源的实体建条目
 *   ③ 自建本公司实体属利益冲突编辑，须：只写可核查事实、来源全部公开、不写宣传性描述
 *   ④ 新账号可能有速率限制与滥用过滤器，遇到就停下报告，不绕过
 *
 * 用法：
 *   $env:WD_PASSWORD='...'; node tools/wikidata_setup.mjs --login          # 只测登录
 *   $env:WD_PASSWORD='...'; node tools/wikidata_setup.mjs --check          # 看账号权限
 *   $env:WD_PASSWORD='...'; node tools/wikidata_setup.mjs --search         # 查是否已有相关条目
 *   $env:WD_PASSWORD='...'; node tools/wikidata_setup.mjs --create         # 建实体
 *   $env:WD_PASSWORD='...'; node tools/wikidata_setup.mjs --create --apply # 真的写入
 */

const API = 'https://www.wikidata.org/w/api.php';
const UA = 'MackornRot/1.0 (https://mackorn.cn/ai/; leif.dai@mackorn.cn) node-fetch';
const USER = 'Leif Dai';
const PASS = process.env.WD_PASSWORD || '';
const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);

let COOKIES = '';

async function api(params, post = false) {
  const url = new URL(API);
  const body = new URLSearchParams({ format: 'json', ...params });
  const opts = {
    method: post ? 'POST' : 'GET',
    headers: { 'User-Agent': UA, 'Accept': 'application/json', ...(COOKIES ? { Cookie: COOKIES } : {}) },
    redirect: 'follow',
  };
  if (post) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = body.toString();
  } else {
    for (const [k, v] of body) url.searchParams.set(k, v);
  }
  const c = new AbortController(); const id = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(post ? API : url.toString(), { ...opts, signal: c.signal });
    const setCookie = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (setCookie.length) {
      const jar = setCookie.map((s) => s.split(';')[0]);
      const existing = COOKIES ? COOKIES.split('; ').filter((x) => !jar.some((j) => j.split('=')[0] === x.split('=')[0])) : [];
      COOKIES = [...existing, ...jar].join('; ');
    }
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { }
    return { status: r.status, json: j, text: t.slice(0, 600) };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.name };
  } finally { clearTimeout(id); }
}

/* ══════════════════════════════════════════════════════════
 * 登录
 * ══════════════════════════════════════════════════════════ */
async function login() {
  if (!PASS) { console.log('\n  ❌ 缺少密码。请设置环境变量 WD_PASSWORD\n'); return false; }
  console.log('\n  ── 登录 Wikidata ──\n');

  const tk = await api({ action: 'query', meta: 'tokens', type: 'login' });
  const token = tk.json?.query?.tokens?.logintoken;
  if (!token) { console.log('  ❌ 取不到 login token：' + (tk.json ? JSON.stringify(tk.json) : tk.text)); return false; }
  console.log('  ① login token 已获取');

  const r = await api({
    action: 'login', lgname: USER, lgpassword: PASS, lgtoken: token,
  }, true);

  const res = r.json?.login?.result;
  console.log('  ② 登录结果：' + res + (r.json?.login?.reason ? '  (' + r.json.login.reason + ')' : ''));

  if (res === 'Success') {
    console.log('  ✅ 登录成功\n');
    return true;
  }
  if (res === 'WrongPass') console.log('  ❌ 密码错误（如已启用双重验证，API 登录需用 Special:BotPasswords 生成的机器人密码）\n');
  if (res === 'NeedToken') console.log('  ⚠️ 需要重新取 token（cookie 未保持）\n');
  if (res === 'Aborted') console.log('  ❌ 被中止（可能是滥用过滤器或需验证码）\n');
  return false;
}

/* ══════════════════════════════════════════════════════════
 * 账号权限
 * ══════════════════════════════════════════════════════════ */
async function check() {
  const r = await api({ action: 'query', meta: 'userinfo', uiprop: 'rights|groups|editcount|blockinfo' });
  const u = r.json?.query?.userinfo;
  if (!u) { console.log('\n  ❌ 未登录或查询失败：' + (r.json ? JSON.stringify(r.json).slice(0, 300) : r.text) + '\n'); return; }
  console.log('\n  ── 账号状态 ──\n');
  console.log('  用户名    ' + u.name);
  console.log('  用户 ID   ' + u.id);
  console.log('  编辑数    ' + (u.editcount ?? '?'));
  console.log('  用户组    ' + (u.groups || []).join(', '));
  console.log('  被封禁    ' + (u.blockid ? '是（' + (u.blockreason || '') + '）' : '否'));
  const canEdit = (u.rights || []).includes('edit');
  const canCreate = (u.rights || []).includes('createpage');
  console.log('  可编辑    ' + (canEdit ? '✅' : '❌'));
  console.log('  可建页    ' + (canCreate ? '✅' : '❌'));
  if (!canEdit || !canCreate) console.log('\n  ⚠️ 权限不足 —— 新账号通常需等待自动确认（4 天后或 10 次编辑）\n');
  else console.log('');
}

/* ══════════════════════════════════════════════════════════
 * 查重（先看有没有已存在的相关条目）
 * ══════════════════════════════════════════════════════════ */
async function search() {
  const terms = ['MACKORN', 'Shanghai Mackorn Minerals', '美矿', 'cone crusher', '液压圆锥破碎机', 'mackorn-cone-crusher'];
  console.log('\n  ── 查重（避免重复建条目）──\n');
  for (const t of terms) {
    const r = await api({ action: 'wbsearchentities', search: t, language: 'en', uselang: 'en', limit: '5' });
    const hits = r.json?.search || [];
    console.log('  "' + t + '" → ' + hits.length + ' 条');
    for (const h of hits.slice(0, 4)) {
      console.log('      ' + h.id + '  ' + (h.label || '') + '  — ' + (h.description || '').slice(0, 60));
    }
  }
  console.log('');
}

/* ══════════════════════════════════════════════════════════
 * 实体定义（全部为可核查的公开事实，无宣传性表述）
 *
 * 关注度依据（WD:N）：实体需有"可靠公开来源"。
 * 我们的来源：官方网站、官方 MCP Registry、GitHub、npm —— 均为公开可核查。
 * ⚠️ 这些都是"自述来源"，不是第三方独立报道。
 *    Wikidata 比 Wikipedia 宽松，但若被提删，理由是"缺乏独立来源"。
 *    因此描述只写事实，不写"领先""最好"。
 * ══════════════════════════════════════════════════════════ */
const ENTITIES = [
  {
    key: 'company',
    label: { en: 'Shanghai Mackorn Minerals', zh: '上海美矿机械股份有限公司' },
    description: { en: 'Chinese manufacturer of hydraulic cone crushers and crushing plants', zh: '中国液压圆锥破碎机与破碎筛分设备制造商' },
    aliases: { en: ['MACKORN', 'Shanghai Mackorn Minerals Co., Ltd.'], zh: ['美矿', 'MACKORN 美矿'] },
    claims: [
      ['P31', 'Q4830453'],            // instance of: business
      ['P17', 'Q148'],                // country: China
      ['P856', 'https://mackorn.cn'], // official website
      ['P452', 'Q1302149'],           // industry: machine industry (approximate)
    ],
    sources: ['official website', 'MCP Registry', 'GitHub', 'npm'],
  },
  {
    key: 'product',
    label: { en: 'MACKORN hydraulic cone crusher selection plugin', zh: 'MACKORN 液压圆锥破碎机选型插件' },
    description: { en: 'open-source cone crusher selection software (MCP server, 22 tools)', zh: '开源的圆锥破选型软件（MCP 服务端，23 个工具）' },
    aliases: { en: ['mackorn-cone-crusher', 'MACKORN DSH plugin'], zh: [] },
    claims: [
      ['P31', 'Q7397'],                // instance of: software
      ['P856', 'https://mackorn.cn/ai/'],
      ['P1324', 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher'],  // source code repository
      ['P275', 'Q308915'],             // copyright license: MIT
      ['P577', '2026'],                // publication date (year)
    ],
    sources: ['GitHub', 'npm', 'MCP Registry'],
  },
  {
    key: 'standard',
    label: { en: 'crushing and comminution reference data', zh: '破碎与粉磨参考数据' },
    description: { en: 'reference ranges for Bond work index, reduction ratios and cavity nomenclature', zh: 'Bond 功指数、破碎比与腔型命名的参考数据区间' },
    aliases: { en: [], zh: [] },
    claims: [
      ['P31', 'Q1172284'],             // instance of: dataset
      ['P856', 'https://mackorn.cn/ai/reference/'],
      ['P275', 'Q308915'],
    ],
    sources: ['mackorn.cn/ai/reference/'],
  },
];

async function create(apply) {
  console.log('\n  ── 创建 Wikidata 实体 ' + (apply ? '（实际写入）' : '（试运行）') + ' ──\n');
  if (!apply) console.log('  ⚠️ 未加 --apply，只展示将要写入的内容\n');

  const csrf = await api({ action: 'query', meta: 'tokens', type: 'csrf' });
  const token = csrf.json?.query?.tokens?.csrftoken;
  if (!token || token === '+\\') { console.log('  ❌ 取不到 CSRF token（未登录？）\n'); return; }

  for (const e of ENTITIES) {
    console.log('  ────────────────────────────────────────');
    console.log('  实体：' + e.label.en + ' / ' + e.label.zh);
    console.log('  描述：' + e.description.en);
    console.log('  声明：' + e.claims.map((c) => c[0] + '=' + c[1]).join(' · '));
    console.log('  来源：' + e.sources.join(' · '));

    if (!apply) { console.log('  → 试运行，跳过写入\n'); continue; }

    // 创建空实体
    const created = await api({
      action: 'wbeditentity', new: 'item', token,
      data: JSON.stringify({ labels: {}, descriptions: {} }),
    }, true);
    const id = created.json?.entity?.id;
    if (!id) { console.log('  ❌ 创建失败：' + (created.json ? JSON.stringify(created.json).slice(0, 300) : created.text) + '\n'); continue; }
    console.log('  ✅ 已创建 ' + id);

    // 写标签/描述/别名 + 声明
    const data = {
      labels: Object.fromEntries(Object.entries(e.label).map(([k, v]) => [k, { language: k, value: v }])),
      descriptions: Object.fromEntries(Object.entries(e.description).map(([k, v]) => [k, { language: k, value: v }])),
      aliases: Object.fromEntries(Object.entries(e.aliases).filter(([, v]) => v.length).map(([k, v]) => [k, v.map((x) => ({ language: k, value: x }))])),
      claims: e.claims.map(([prop, val]) => ({
        mainsnak: {
          snaktype: 'value', property: prop,
          datavalue: prop === 'P856' || prop === 'P1324'
            ? { value: val, type: 'string' }
            : prop === 'P577'
              ? { value: { time: '+' + val + '-00-00T00:00:00Z', timezone: 0, before: 0, after: 0, precision: 9, calendarmodel: 'http://www.wikidata.org/entity/Q1985727' }, type: 'time' }
              : { value: { 'entity-type': 'item', 'numeric-id': Number(val.slice(1)), id: val }, type: 'wikibase-entityid' },
        },
        type: 'statement', rank: 'normal',
      })),
    };
    const r2 = await api({ action: 'wbeditentity', id, token, data: JSON.stringify(data) }, true);
    if (r2.json?.success) {
      console.log('  ✅ 已写入标签/描述/声明 → https://www.wikidata.org/wiki/' + id + '\n');
    } else {
      console.log('  ⚠️ 标签写入结果：' + JSON.stringify(r2.json).slice(0, 300) + '\n');
    }
    await new Promise((s) => setTimeout(s, 2000));
  }
}

/* ── 入口 ── */
if (has('--login')) { const ok = await login(); if (ok) await check(); }
else if (has('--check')) { await check(); }
else if (has('--search')) { await search(); }
else if (has('--create')) { if (await login()) await create(has('--apply')); }
else {
  console.log(`
  Wikidata 实体创建工具
  ───────────────────────────────────────────────────
    --login     测登录（成功后自动显示账号状态）
    --check     看账号权限
    --search    查重（避免重复建条目）
    --create    试运行（展示将写入的内容）
    --create --apply   实际写入

  密码从环境变量 WD_PASSWORD 读取，不写入任何文件。
  ⚠️ 若账号启用了双重验证，API 登录需用 Special:BotPasswords
     生成机器人密码（用户名格式：Leif Dai@botname）。
`);
}
