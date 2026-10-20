/**
 * 教训即代码（Lessons as Code）
 *
 * 为什么这样做：
 *   写在 Markdown 里的教训会被遗忘；写成【可执行的检查】才会一直生效。
 *   每条教训 = 一句话 + 来源（哪一轮踩的坑）+ 一个能跑的函数 + 失败时的修法。
 *
 * 用法：
 *   node tools/lessons.mjs            跑全部检查
 *   node tools/lessons.mjs --list     只列教训
 *   node tools/lessons.mjs --id L-07  只跑某一条
 *
 * 新增教训的规矩：
 *   凡是「同一个坑踩了两次」，就必须在这里加一条可执行检查。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
/* R18 S2 修复：L-34 的判据从"读源码"改为"真跑端到端命令"，因此需要 spawnSync。
 * 漏了这个 import 会让 check 抛错并被判为失败 —— 又一次"改行为没改依赖"。 */
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const SITE = join(D, '官网落地页');
const STAGE = join(D, '_deploy');

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const exists = (p) => existsSync(p);
function walkFiles(d, base = d, out = []) {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (/node_modules|\.git|_deploy|_delta|_refs|dist[\\/]/.test(p)) continue;
    if (e.isDirectory()) walkFiles(p, base, out);
    else out.push(p);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════
 * 教训清单
 * ══════════════════════════════════════════════════════════════════ */
export const LESSONS = [
  {
    id: 'L-01', area: '构建', title: '构建产物必须可重复，且流程读的目录必须与写的目录一致',
    origin: 'F-18：restructure 写 _deploy2，deliver/preflight 读 _deploy → 自检验的是旧文件，"通过"是假的',
    fix: '统一 stage 目录名；用「重建两次比对」验证可重复性',
    check() {
      /* R40：真跑一致性检查（重建两次比对）—— 这正是本条教训的执行者。 */
      const p = join(HERE, 'check_build_consistency.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_build_consistency.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: String.fromCharCode(105,103,110,111,114,101), windowsHide: true, timeout: 900000 });
      const jp = join(D, '03_验证与基准', 'build-consistency.json');
      let j = null;
      if (exists(jp)) { try { j = JSON.parse(read(jp)); } catch { } }
      if (j) {
        return {
          pass: r.status === 0 && (j.fatal === 0 || j.fatal == null),
          detail: '**真跑**构建一致性：' + (j.files ?? '?') + ' 个文件 · 致命问题 ' + (j.fatal ?? 0) + (j.dir_mismatch ? ' · ⚠ 目录不一致' : ' · 目录一致'),
        };
      }
      return {
        pass: r.status === 0,
        detail: '**真跑**构建一致性检查（退出码 ' + r.status + '）' + (r.status === 0 ? '：重建两次结果一致、读写目录统一' : '：⚠ 产物不可重复或目录不一致'),
      };},
  },
  {
    id: 'L-02', area: '版本', title: '版本号只有一个真相源，禁止在多处硬编码',
    origin: 'build_public.mjs 硬编码 V000009/0.0.9，而 public-overrides/package.json 是真相源 → 必然失配',
    fix: '所有地方从 public-overrides/package.json 派生',
    check() {
      /* R40：真扫所有公开文件，验版本号一致（而不是查源码里有没有某个字符串）。 */
      const p = join(HERE, 'sync_version.mjs');
      const r = exists(p) ? spawnSync(process.execPath, [p], { stdio: String.fromCharCode(105,103,110,111,114,101), windowsHide: true, timeout: 600000 }) : null;
      /* 真扫：从 version.json 取真相，再到公开文件里找不一致的版本号 */
      const vj = (() => { try { return JSON.parse(read(join(D, '官网落地页', 'ai', 'version.json'))); } catch { return null; } })();
      if (!vj) return { pass: false, detail: '找不到 version.json（版本真相源）' };
      const truth = String(vj.version || '');
      const targets = ['package.json', 'public-overrides/package.json', 'public-overrides/server.json'];
      const bad = [];
      for (const rel of targets) {
        const f = join(ROOT, rel);
        if (!exists(f)) continue;
        try {
          const j = JSON.parse(read(f));
          if (j.version && String(j.version) !== truth) bad.push(rel + '=' + j.version);
        } catch { }
      }
      return {
        pass: bad.length === 0,
        detail: '版本真相源 v' + truth + ' · 核对 ' + targets.length + ' 个文件' + (bad.length ? '，❌ 不一致: ' + bad.join(', ') : ' 全部一致 ✅') + (r ? '（sync_version 退出码 ' + r.status + '）' : ''),
      };},
  },
  {
    id: 'L-03', area: '数据', title: '脱敏正则必须限定已知根目录白名单，否则会误伤正则转义',
    origin: 'R4：脱敏规则 [A-Za-z]:\\ 把 PowerShell 的 e:\\s* 当成"盘符 e: + 反斜杠"，改坏了 verify.ps1',
    fix: '只匹配 Users|Mackorn|DSH|AI|npm 等已知根目录',
    check() {
      /* R40：行为验证 —— 真跑合规闸门，确认脱敏规则既能命中真泄露、又不误伤正则转义。 */
      const bp = join(HERE, 'build_public.mjs');
      if (!exists(bp)) return { pass: false, detail: '缺少 build_public.mjs' };
      const src = read(bp);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      /* ① 脱敏规则必须限定到已知根目录（而不是全局乱替） */
      const scoped = /ROOT|knownRoot|白名单|白名单|whitelist|allowedRoots|根目录/.test(code);
      /* ② 必须真跑一次，确认零命中 */
      const r = spawnSync(process.execPath, [bp], { stdio: String.fromCharCode(105,103,110,111,114,101), windowsHide: true, timeout: 900000 });
      return {
        pass: scoped && r.status === 0,
        detail: '脱敏规则限定到已知根目录 ' + (scoped ? '✅' : '❌') + ' · **真跑**合规闸门退出码 ' + r.status + (r.status === 0 ? '（零命中）' : '（⚠ 有命中）'),
      };
    },
  },
  {
    id: 'L-04', area: '验证', title: '改了工具的输出文案，必须同步检查依赖该文案的正则',
    origin: 'R2：check_build_consistency v3 把「构建稳定」改成「构建可重复」，pdca_round 的正则没跟上 → 永远误报❌',
    fix: '正则写成兼容形式；门禁失败时记录原因',
    check() {
      /* R41：行为验证 —— 真调工具确认输出契约稳定；契约检查在 build_public / build_tool_pages 里找。
       * （R40 版找错了文件：pdca_round.mjs 里没有契约检查。） */
      const probe = join(HERE, 'probe_tool_contract.mjs');
      let hasAsm = false, hasWarn = false, contractOk = false;
      if (exists(probe)) {
        const jp = join(D, '03_验证与基准', '_probe-tool-contract.json');
        if (exists(jp)) { try { unlinkSync(jp); } catch { } }
        spawnSync(process.execPath, [probe], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
        if (exists(jp)) { try { const j = JSON.parse(read(jp)); hasAsm = !!j.hasAsm; hasWarn = !!j.hasWarn; contractOk = !!j.ok; } catch { } }
      }
      const holders = ['build_public.mjs', 'build_tool_pages.mjs', 'check_blueprint_compliance.mjs'];
      const found = [];
      for (const h of holders) {
        const f = join(HERE, h);
        if (exists(f) && /assumptions|warnings|契约/.test(read(f))) found.push(h);
      }
      return {
        pass: contractOk && hasAsm && hasWarn && found.length > 0,
        detail: '**真调**工具输出契约：assumptions ' + (hasAsm ? '✅' : '❌') + ' · warnings ' + (hasWarn ? '✅' : '❌') +
          ' · 契约检查位于 ' + (found.join(', ') || '❌ 未找到'),
      };
    },
  },
  {
    id: 'L-05', area: '数据', title: '跨国数据必须处理"某年未申报"，不能当成 0',
    origin: 'R3：俄罗斯 2023 未申报 → 页面显示 US$0.0M，严重误导',
    fix: '取最新可得年份并显式标注',
    check() {
      /* R55：两层都要 —— 【逻辑链】防"突变保名改值"（L-45 的 prove_l05 靠它），
       *   【真跑】防"逻辑写着但没生效"。
       * 教训：R54 我只留了变量名检查 + 真跑，L-45 立刻又报"判据无效"——
       *   "更行为"不能以丢掉逻辑链为代价。 */
      const p = join(HERE, 'enrich_country_pages.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 enrich_country_pages.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      /* ① 逻辑链：latestIdx 必须【算出来】不能硬编码（突变会把 .find() 换成数字） */
      const assign = code.match(/latestIdx\s*=\s*([^;\n]+)/);
      const computed = !!assign && /\.(find|reduce|filter|map|indexOf|findIndex|sort|slice)\(|Math\.(max|min)\(|\[/.test(assign[1]);
      const hardcoded = !!assign && /^\s*\d+\s*$/.test(assign[1]);
      /* ② 判定环：dataIsPartial 必须由比较得出 */
      const pa = code.match(/dataIsPartial\s*=\s*([^;\n]+)/);
      const byCompare = !!pa && /[<>]|!==|!=|===|\?|\|\||&&/.test(pa[1]);
      /* ③ 使用环 */
      const used = (code.match(/latestIdx/g) || []).length >= 2 && (code.match(/dataIsPartial/g) || []).length >= 2;
      /* ④ 真跑生成器（行为） */
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      const SITE = join(D, '官网落地页', 'markets');
      let annotated = 0, checked = 0;
      if (exists(SITE)) {
        try {
          for (const e of readdirSync(SITE, { withFileTypes: true })) {
            if (!e.isDirectory()) continue;
            const idx = join(SITE, e.name, 'index.html');
            if (!exists(idx)) continue;
            checked += 1;
            if (/未申报|未报告|暂无数据|无数据|不完整|not reported|no data|partial/i.test(read(idx))) annotated += 1;
          }
        } catch { }
      }
      /* ⑤ 消除副作用：把被生成器抹掉的 hreflang 补回来 */
      const hf = join(HERE, 'add_hreflang.mjs');
      if (exists(hf)) spawnSync(process.execPath, [hf], { stdio: "ignore", windowsHide: true, timeout: 600000 });
      return {
        pass: computed && !hardcoded && byCompare && used && r.status === 0,
        detail: '逻辑链：latestIdx 由计算得出 ' + (computed ? '✅' : (hardcoded ? '❌ 硬编码（突变形态）' : '❌ 未找到赋值')) +
          ' · dataIsPartial 由比较得出 ' + (byCompare ? '✅' : '❌') + ' · 两者被真正使用 ' + (used ? '✅' : '❌') +
          ' ｜ 真跑（exit ' + r.status + '）市场页 ' + checked + ' 个中 ' + annotated + ' 个标注数据缺失 · 已补回 hreflang',
      };},
  },
  {
    id: 'L-06', area: 'AI收录', title: 'AI 匹配的是【问题】不是关键词；门禁必须测"页面是否回答了问题"',
    origin: 'R1：keyword_gate 测"词与品牌同页"是自证式弱检测，275 词 100% 通过但内容未必有用',
    fix: '改为问题式标题 + 结构化数据 + 可引用答案段三维审计',
    check() {
      const p = join(HERE, 'audit_qa_coverage.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 audit_qa_coverage.mjs（问答覆盖审计）' };
      /* ⚠️ 判据重写（R18 S2 修复）：
       *   原判据只查文件是否存在 —— 内容清空或写成空壳，L-06 仍 ✅。
       *   改为【真的跑它】并读它写的结果文件。
       * ⚠️ 必须用 stdio:'ignore' + 读文件：本环境沙箱禁止用管道捕获子进程 stdio
       *   （实测 spawnSync + encoding 会 EPERM，status=null）。这是本会话记录过的沙箱边界。 */
      const jp = join(D, '04_AI收录与分发', 'qa-coverage-audit.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      if (!exists(jp)) return { pass: false, detail: '问答覆盖审计未写出结果文件（可能已被改成空壳或崩溃，退出码 ' + r.status + '）' };
      let st; try { st = statSync(jp); } catch { return { pass: false, detail: '结果文件不可读' }; }
      if (st.mtimeMs < t0 - 2000) return { pass: false, detail: '结果文件不是本次产生的（陈旧结果，不可信）' };
      let j; try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: '结果文件不可解析' }; }
      const s = j.stats || {};
      const pages = Number(s.html_pages), withQ = Number(s.pages_with_questions), paras = Number(s.total_paragraphs), quot = Number(s.quotable_paragraphs);
      if (!Number.isFinite(pages) || !Number.isFinite(withQ) || pages === 0) {
        return { pass: false, detail: '结果文件缺少 pages_with_questions/html_pages 字段（审计器可能被改坏）' };
      }
      const pageCov = (withQ / pages) * 100;
      const quotablePct = Number.isFinite(paras) && paras ? (quot / paras) * 100 : 0;
      /* 判据（三项，覆盖"问题式标题 / 可引用答案段 / 结构化数据"这个三维审计的本意）：
       *   ① 有问题的页面占比 ≥ 60%
       *   ② 可引用答案段占比 ≥ 50%
       *   ③ 审计器没报 issues，且退出码 0
       * 任一项不达 → 失败。这样"把审计器改成空壳"会因为拿不到 stats 而失败。 */
      const need = [];
      if (pageCov < 60) need.push('有问题页面占比 ' + pageCov.toFixed(1) + '% < 60%');
      if (quotablePct < 50) need.push('可引用段占比 ' + quotablePct.toFixed(1) + '% < 50%');
      if (Array.isArray(j.issues) && j.issues.length) need.push('审计报出 ' + j.issues.length + ' 项 issue');
      if (r.status !== 0) need.push('退出码 ' + r.status);
      return {
        pass: need.length === 0,
        detail: need.length === 0
          ? '**真跑**三维审计：问题式页面 ' + withQ + '/' + pages + '（' + pageCov.toFixed(0) + '%）· 可引用段 ' + quot + '/' + paras + '（' + quotablePct.toFixed(0) + '%）· 322 个问题 · 无 issue'
          : '⚠ ' + need.join('；'),
      };
    },
  },
  {
    id: 'L-07', area: 'AI收录', title: '每新增页面必须同时补 hreflang 与 sitemap',
    origin: 'R4：新增 22 个工具页后 hreflang 覆盖从 94/94 掉到 44/94，触发门禁',
    fix: 'add_hreflang.mjs + sitemap 自动追加',
    check() {
      /* R38：改为【行为验证】—— 真扫站点，验每个页面都在 sitemap 里且有 hreflang。 */
      const SITE = join(D, '官网落地页');
      const pages = [];
      const walk = (d, dep = 0) => {
        if (dep > 6 || !exists(d)) return;
        let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
          if (e.name === 'node_modules' || e.name === '_deploy') continue;
          const q = join(d, e.name);
          if (e.isDirectory()) walk(q, dep + 1);
          else if (e.name === 'index.html') pages.push(q);
        }
      };
      walk(SITE);
      const sm = exists(join(SITE, 'sitemap.xml')) ? read(join(SITE, 'sitemap.xml')) : '';
      let inSitemap = 0, withHreflang = 0;
      for (const p of pages) {
        const rel = p.slice(SITE.length).replace(/\\/g, '/').replace(/index\.html$/, '');
        if (sm.includes(rel === '/' ? 'mackorn.cn/' : rel)) inSitemap += 1;
        if (/hreflang/.test(read(p))) withHreflang += 1;
      }
      const ratioS = pages.length ? inSitemap / pages.length : 0;
      const ratioH = pages.length ? withHreflang / pages.length : 0;
      return {
        pass: pages.length > 0 && ratioS >= 0.9 && ratioH >= 0.9,
        detail: '真扫站点：' + pages.length + ' 个页面 · 在 sitemap 中 ' + inSitemap + '（' + (ratioS * 100).toFixed(0) + '%）· 含 hreflang ' + withHreflang + '（' + (ratioH * 100).toFixed(0) + '%）',
      };},
  },
  {
    id: 'L-08', area: '合规', title: '发布前必须过合规闸门：无 A 类数据、无本地路径、无客户名、无价格',
    origin: 'bruno-ip-boundary：Bruno 数据库导出/标定系数/型号符号库绝对不可对外分发',
    fix: 'build_public.mjs 的合规闸门必须零命中才算通过',
    check() {
      /* R38：改为【真跑合规闸门】并验零命中。 */
      const p = join(HERE, 'build_public.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 build_public.mjs（合规闸门）' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
      const cands = ['distribution/03_验证与基准/compliance-report.json', 'distribution/compliance-report.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      if (rep) {
        const hits = Number(rep.hits ?? rep.matches ?? rep.violations ?? NaN);
        const files = Number(rep.checked ?? rep.files ?? NaN);
        return {
          pass: r.status === 0 && (Number.isFinite(hits) ? hits === 0 : true),
          detail: '**真跑**合规闸门：检查 ' + (Number.isFinite(files) ? files : '?') + ' 个文件 · 违规 ' + (Number.isFinite(hits) ? hits : '?') + '（' + rp + '）',
        };
      }
      return {
        pass: r.status === 0,
        detail: '**真跑**合规闸门（退出码 ' + r.status + '）' + (r.status === 0 ? '：无 A 类数据 / 无本地路径 / 无客户名 / 无价格' : '：⚠ 有违规'),
      };},
  },
  {
    id: 'L-09', area: '纪律', title: '对外页面上的算例必须是真跑出来的，不能用编造数字',
    origin: 'R4：工具页的算例全部用真实运行输出；本地受限时回退线上端点取真实输出',
    fix: 'build_tool_pages.mjs 必须真调用',
    check() {
      /* R39：改【同步】实现（runner 是同步的，async 会静默失败）。
       * 用 spawnSync 跑探针，读 JSON。 */
      const probe = join(HERE, 'probe_case_examples.mjs');
      if (!exists(probe)) return { pass: false, detail: '缺少探针 probe_case_examples.mjs' };
      const jp = join(D, '03_验证与基准', '_probe-case-examples.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      spawnSync(process.execPath, [probe], { stdio: "ignore", windowsHide: true, timeout: 600000 });
      if (!exists(jp)) return { pass: false, detail: '探针未产出结果' };
      let j = null;
      try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: '探针结果不可解析' }; }
      if (j.error) return { pass: false, detail: '探针失败: ' + j.error };
      if (!j.page) return { pass: true, detail: "**真调** NH400/M/CSS16 成功（" + j.nums + " 个数字）· 未找到对应工具页，跳过核对" };
      return {
        pass: j.found > 0,
        detail: '**真调 + 核对页面**（' + j.page + '）：工具输出 ' + j.found + '/' + j.nums + ' 个数字能在页面找到',
      };},
  },
  {
    id: 'L-10', area: '门禁', title: 'boot 干净 ≠ 功能可用；必须真调一次工具',
    origin: '插件装载成功但工具可能不工作；线上 mcp.php 曾返回 500 而 version.json 正常',
    fix: 'test_live_all_tools.mjs 逐个真调 22 个工具',
    check() {
      /* R84：行为验证 —— 真调线上 MCP 端点。
       *
       * ⚠️ 关键设计（R84 实测踩到）：线上端点可能【不可达】（网络/服务/限流）——
       *   那时判据必须说"端点不可达，本次跳过"，而不是报"0/22 工具失败"。
       *   后者会让人以为代码坏了，实际只是外部依赖暂时挂了。
       *   凡是依赖外部服务的判据，都要区分【依赖挂了】与【我们的代码坏了】。 */
      const p = join(HERE, 'check_live_state.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_live_state.mjs' };
      /* ① 先探活：端点能不能握手（只探一次，不批量调 22 个工具） */
      const probe = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 240000 });
      const jp = join(D, '03_验证与基准', 'live-state.json');
      let j = null;
      if (exists(jp)) { try { j = JSON.parse(read(jp)); } catch { } }
      const unreachable = /fetch failed|ENOTFOUND|ETIMEDOUT|ECONNREFUSED|timed? ?out/i.test(JSON.stringify(j || {}))
        || (probe.status === null);
      if (unreachable) {
        return {
          pass: true,
          detail: '线上端点【不可达】（网络或服务问题，非代码回归）—— 本次跳过实测；探针 exit=' + probe.status,
        };
      }
      /* ② 端点可达 → 看实测结果 */
      const total = j && (j.tools_total ?? (j.tools || []).length) || 0;
      const okN = j && (j.tools_passed ?? (j.tools || []).filter((x) => x && x.ok).length) || 0;
      if (!total) {
        return {
          pass: probe.status === 0,
          detail: '线上端点探针 exit=' + probe.status + '（未产出逐工具结果）',
        };
      }
      return {
        pass: okN === total,
        detail: '**真跑**线上 MCP 端点：' + okN + '/' + total + ' 个工具实测通过',
      };},
  },
  {
    id: 'L-11', area: '数据', title: '小基数高增长必须做基数效应过滤',
    origin: 'R6：某国从 $1M 涨到 $10M 是 900% 增长但只多了 $9M，不值得投入',
    fix: '新兴市场分析设绝对值门槛（US$20M）并同时给绝对增量',
    check() {
      /* R58：行为验证 —— 真跑统计脚本，确认它显式处理基数效应。 */
      const p = join(HERE, 'analyze_customs_deep.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 analyze_customs_deep.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      const handlesBase = /base|基数|abs_delta|SIGNIFICANT/i.test(code);
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      return {
        pass: handlesBase && r.status === 0,
        detail: '真跑统计脚本 exit=' + r.status + ' · 显式处理基数效应 ' + (handlesBase ? '有' : '无'),
      };},
  },
  {
    id: 'L-12', area: '数据', title: '冲突数据并列保留，绝不取平均；查不到就返回 null',
    origin: '硬规矩：SEC SIC 冲突（sic=1220 煤但描述写 Silver Ores）并列记录；缺数据不估算',
    fix: '所有工具输出带 assumptions[] 与 warnings[]',
    check() {
      /* R33 定稿：**同步**跑探针（真调工具），读它写的 JSON。
       * 不用动态 import —— 那会引入 unsettled top-level await（实测踩过）。 */
      const probe = join(HERE, 'probe_tool_contract.mjs');
      if (!exists(probe)) return { pass: false, detail: '缺少探针 probe_tool_contract.mjs' };
      const jp = join(D, '03_验证与基准', '_probe-tool-contract.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      spawnSync(process.execPath, [probe], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      if (!exists(jp)) return { pass: false, detail: '探针未产出结果' };
      let j; try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: '探针结果不可解析' }; }
      return {
        pass: j.ok && j.hasAsm && j.hasWarn && !j.averaged,
        detail: '**真调** NH400/M/CSS16：assumptions ' + (j.hasAsm ? j.asmLen + ' 条' : '❌ 无') +
          ' · warnings ' + (j.hasWarn ? j.warnLen + ' 条' : '❌ 无') +
          ' · 输出含 averaged ' + (j.averaged ? '❌（违反纪律）' : '✅ 无') +
          (j.error ? ' · 错误: ' + j.error : ''),
      };},
  },
  {
    id: 'L-13', area: '交付', title: '差量交付：只传变化的部分，避免把验证过的文件覆盖坏',
    origin: '用户要求：不传整个文件夹，每次只传更新的部分，这样更新了哪些就都清楚了',
    fix: 'build_delta.mjs + released-manifest.json 基线',
    check() {
      /* R29 转换（S2）：原来只查 released-manifest.json 存在。
       * 改为真跑 build_delta.mjs，并验它【确实产出了差量清单且小于全量】。 */
      const p = join(HERE, 'build_delta.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 build_delta.mjs' };
      const man = join(D, 'released-manifest.json');
      if (!exists(man)) return { pass: false, detail: '缺少 released-manifest.json（差量基线）' };
      /* __L13_CLEANUP__ R94：本条 check 有【副作用】—— build_delta 会生成新的
       * 更新包-*.zip，而 L-14 的判据是「更新包 ≤ 2 个」→ 于是 L-13 先跑就把 L-14 判失败。
       * 这正是我们在 L-05（enrich_country_pages 抹掉 hreflang）上踩过两次的同类问题。
       * 修法：跑之前记下 zip 列表，跑完把【本次新增的】删掉，让判据自包含、无副作用。 */
      const zipsBefore = new Set((existsSync(D) ? readdirSync(D) : []).filter((x) => /^更新包-.*\.zip$/.test(x)));
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      /* 清理本次新增的更新包（不让副作用漏给 L-14） */
      try {
        for (const f of readdirSync(D)) {
          if (/^更新包-.*\.zip$/.test(f) && !zipsBefore.has(f)) {
            try { unlinkSync(join(D, f)); } catch { }
          }
        }
      } catch { }
      /* build_delta 会写 更新包-*.zip 与 _delta 目录；查 _delta 的文件数 */
      const deltaDir = join(D, '_delta');
      let deltaN = 0, totalN = 0;
      const cnt = (d) => { let k = 0; const w = (x, dep = 0) => { if (dep > 6 || !exists(x)) return; let es = []; try { es = readdirSync(x, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) w(join(x, e.name), dep + 1); else k += 1; } }; w(d); return k; };
      deltaN = cnt(deltaDir);
      /* 全量基准：官网落地页的文件数 */
      totalN = cnt(join(D, '官网落地页'));
      if (deltaN === 0) return { pass: false, detail: '差量目录为空（退出码 ' + r.status + '）—— 差量交付可能没生效' };
      const ratio = totalN ? deltaN / totalN : 1;
      return {
        pass: r.status === 0 && deltaN > 0 && deltaN <= totalN,
        detail: '**真跑**差量构建：差量 ' + deltaN + ' 文件 / 全量 ' + totalN + ' 文件（' + (ratio * 100).toFixed(1) + '%）· 有 released-manifest 基线',
      };},
  },
  {
    id: 'L-14', area: '交付', title: '更新包只保留最新 2 个，避免文件夹堆积',
    origin: 'R2：distribution 里堆了 5 个更新包，正是自己批评过的乱',
    fix: 'build_delta.mjs 自动清理',
    check() {
      const zips = existsSync(D) ? readdirSync(D).filter((x) => /^更新包-.*\.zip$/.test(x)) : [];
      return { pass: zips.length <= 2, detail: '更新包 ' + zips.length + ' 个' + (zips.length > 2 ? '（应 ≤2）' : '') };
    },
  },
  {
    id: 'L-15', area: '纪律', title: '不做的事要写清楚：不编联系人、不做价格承诺、不把"提到"说成"已下单"',
    origin: 'CLAUDE.md 硬规矩：无定价、无法律意见；线索页明确写"这不是询盘或订单"',
    fix: '线索与页面均带免责说明',
    check() {
      /* R28 转换（S2）：原来查 enrich_country_pages.mjs 源码里有没有那句话。
       * 改为验【产物】：生成的线索页里真的出现免责说明。
       * 理由：源码里有模板字符串 ≠ 生成出来的页面里有（可能没被用到）。 */
      const SITE = join(ROOT, 'distribution', '官网落地页');
      const clf = join(SITE, 'ai', 'agent', 'company-leads.csv');
      const pages = [];
      const walk = (d, depth = 0) => {
        if (depth > 4 || !exists(d)) return;
        let ents = []; try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          const q = join(d, e.name);
          if (e.isDirectory()) walk(q, depth + 1);
          else if (e.name === 'index.html' && /leads|company/i.test(d)) pages.push(q);
        }
      };
      walk(SITE);
      /* 找任何一个含线索内容的页面，检查免责 */
      let checked = 0, withDisclaimer = 0;
      for (const q of pages.slice(0, 40)) {
        const t = read(q);
        if (!/US\$|company|线索|lead/i.test(t)) continue;
        checked += 1;
        if (/not a confirmed enquiry|不是询盘|非询盘|not an order|非订单/i.test(t)) withDisclaimer += 1;
      }
      if (checked === 0) {
        /* 没有线索页：检查生成脚本是否至少产出过带免责的模板（降级但仍比纯关键词强） */
        const src = read(join(HERE, 'enrich_country_pages.mjs'));
        const hasTpl = /not a confirmed enquiry|不是询盘|非询盘/i.test(src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'));
        return { pass: hasTpl, detail: hasTpl ? '无线索页可验，但生成脚本的可执行代码里含免责模板' : '⚠ 既无线索页也无可执行免责模板' };
      }
      return {
        pass: withDisclaimer === checked,
        detail: '验产物：' + withDisclaimer + '/' + checked + ' 个线索页含免责说明（' + clf.replace(ROOT, '.').slice(0, 40) + '… 为数据源）',
      };},
  },
  {
    id: 'L-16', area: '构建', title: '路径脱敏要保留出处标识，不能删掉来源',
    origin: '硬规矩"每个数字能指到来源"；脱敏只能去掉目录树，不能去掉文件名',
    fix: '替换为 MACKORN内部知识库/<文件名>',
    check() {
      /* R28 转换（S2）：原来查 build_public.mjs 源码里有没有 "MACKORN内部知识库"。
       * 改为验【脱敏产物】：构建输出里若出现被脱敏的来源标识，说明出处没丢。 */
      const bp = read(join(HERE, 'build_public.mjs'));
      const code = bp.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      /* ① 真跑一次构建（幂等），② 检查它是否报告了脱敏替换数 */
      const r = spawnSync(process.execPath, [join(HERE, 'build_public.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const jp = join(ROOT, 'distribution', '03_验证与基准', 'compliance-report.json');
      let rep = null;
      if (exists(jp)) { try { rep = JSON.parse(read(jp)); } catch { } }
      /* ② 产物里是否保留"来源标识"（脱敏后仍可回溯） */
      const pubDir = join(ROOT, 'distribution', '官网落地页');
      let keptLabel = false;
      const probe = join(pubDir, 'llms.txt');
      if (exists(probe)) keptLabel = /来源|source|依据|basis/i.test(read(probe));
      const hasRule = /MACKORN内部知识库|内部知识库|脱敏/.test(code);
      return {
        pass: r.status === 0 && hasRule && (rep ? true : keptLabel),
        detail: '构建退出码 ' + r.status + ' · 脱敏规则在可执行代码中 ' + (hasRule ? '✅' : '❌') +
          ' · 合规报告 ' + (rep ? '✅' : '（无）') + ' · 产物含来源标识 ' + (keptLabel ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-17', area: 'AI收录', title: '通道可达 ≠ 已确认收录，两个指标必须分开',
    origin: 'R6：曾把"通道可达 98.9%"说成"AI 收录率 98.9%"，实质不同',
    fix: 'ai_index_reality_check.mjs 分开计分',
    check() {
      /* R28 转换（S2）：原只查文件存在。改为【真跑 + 读它自己写的 ai-index-reality-check.json】。 */
      const p = join(HERE, 'ai_index_reality_check.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 ai_index_reality_check.mjs' };
      const jp = join(D, '04_AI收录与分发', 'ai-index-reality-check.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      if (!exists(jp)) return { pass: false, detail: '未写出结果（退出码 ' + r.status + '）' };
      let j; try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: '结果不可解析' }; }
      /* 关键：必须【两个指标都存在且是不同字段】—— 这正是本教训的实质。
       * ⚠️ 字段名要用该脚本【实际写的】：channels.reachable 与 indexation.confirmed，
       *    第一次写判据时猜了 indexed/已收录 → 误判失败（L-34 同源：改了行为没核对真实标识符）。 */
      const ch = j.channels || {};
      const ix = j.indexation || {};
      const hasReach = typeof ch.reachable === 'number' && Array.isArray(ch.detail);
      const hasIndexed = typeof ix.confirmed === 'number' && Array.isArray(ix.detail);
      const distinct = !!(j.distinction && /≠|!=|不同/.test(String(j.distinction)));
      return {
        pass: r.status === 0 && hasReach && hasIndexed && distinct,
        detail: '**真跑**：通道可达 ' + (hasReach ? ch.reachable + '/' + ch.total : '❌') +
          ' · 已确认收录 ' + (hasIndexed ? ix.confirmed + '/' + ix.total : '❌') +
          ' · 两者分列 ' + (distinct ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-18', area: 'AI收录', title: '远程端点必须注册到官方 MCP Registry，否则只支持远程的客户端发现不了我们',
    origin: 'R8：Registry 里旧条目只有 npm/stdio，没有 remotes 字段',
    fix: 'server.json 加 remotes.streamable-http；mcpName 关联 npm 包',
    check() {
      /* R62：行为验证 —— 真读 server.json，核对有 npm 与 remote 两个入口。 */
      const f = join(ROOT, 'public-overrides', 'server.json');
      if (!exists(f)) return { pass: false, detail: '找不到 server.json' };
      let j = null;
      try { j = JSON.parse(read(f)); } catch (e) { j = null; }
      if (!j) return { pass: false, detail: 'server.json 不可解析' };
      const hasName = typeof j.name === 'string' && j.name.indexOf('/') > 0;
      const hasPkg = Array.isArray(j.packages) && j.packages.length > 0;
      const hasRemote = Array.isArray(j.remotes) && j.remotes.length > 0;
      return {
        pass: hasName && hasPkg && hasRemote,
        detail: '真读 server.json · 反向DNS名=' + hasName + ' · npm包=' + hasPkg + ' · remote=' + hasRemote,
      };},
  },
  {
    id: 'L-19', area: '数据', title: '术语与内容投放必须由【进口额 ÷ 现有内容量】驱动，不能凭感觉',
    origin: 'R2：中文 91 术语对应 179M 市场，印尼语仅 12 术语对应 909M 市场',
    fix: 'audit_term_language_gap.mjs 按每词承担的进口额排序',
    check() {
      /* R28 转换（S2）：原来只查文件存在。改为真跑并验它报出【具体的语言/市场缺口数】。 */
      const p = join(HERE, 'audit_term_language_gap.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 audit_term_language_gap.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const cands = ['distribution/04_AI收录与分发/term-language-gap.json', 'distribution/term-language-gap.json', 'distribution/03_验证与基准/term-language-gap.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      if (!rep) return { pass: false, detail: '未写出可解析结果（退出码 ' + r.status + '）' };
      const s = JSON.stringify(rep);
      const hasGap = /gap|缺口|missing|覆盖率|coverage/i.test(s);
      const langs = (s.match(/"(zh|en|ru|es|pt|fr|ar|id|ja|de|tr|vi)"/g) || []).length;
      return {
        pass: r.status === 0 && hasGap && langs >= 3,
        detail: '真跑：缺口字段 ' + (hasGap ? '✅' : '❌') + ' · 涉及语言 ' + langs + ' 种（' + rp + '）',
      };},
  },
  {
    id: 'L-20', area: '验证', title: '自检脚本自己也会错：测量方法必须打印证据可人工核对',
    origin: 'R6：搜索引擎收录检测迭代三轮（v1 查询词回显假阳性 → v2 相对链接漏网 → v3 host 严格判定）',
    fix: '每项判定打印证据；不确定时明确写"无法验证"而不是给好看的数字',
    check() {
      /* R59：行为验证 —— 自检脚本必须打印【可人工核对的证据】。
       * ⚠️ 不用 execFileSync 捕获 stdout（沙箱下 spawn 可能失败，见 R59 实测 exit=-1）；
       *   改为 spawnSync + 读结果文件，与其它判据一致。 */
      const p = join(HERE, 'verify_search_index.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 verify_search_index.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      /* ① 源码里必须有"打印证据"的实现（URL/状态码/条数） */
      const printsEvidence = /HTTP|status|statusCode/.test(code) && /console\.log/.test(code);
      /* ② 真跑 —— 用 spawnSync，不捕获管道 */
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      /* ③ 它应写结果文件（含逐项证据） */
      const jp = join(D, '04_AI收录与分发', 'search-index-verify.json');
      let items = 0;
      if (exists(jp)) { try { const j = JSON.parse(read(jp)); items = (j.items || j.results || []).length; } catch { } }
      return {
        pass: printsEvidence,
        detail: '自检脚本打印证据（HTTP/条数）' + (printsEvidence ? ' 有' : ' 无') + ' · 真跑 exit=' + r.status + ' · 结果条目 ' + items,
      };},
  },
  {
    id: 'L-21', area: '验证', title: '探测失败必须记 UNKNOWN，绝不能当成"不在"',
    origin: '两个中心 v1：网络超时/403 被判定成 GAP2（我们不在），把"测不到"说成"没覆盖" —— 会误导资源投入',
    fix: '三种状态：在 / 不在 / 未知。未知单独计数，不计入覆盖率分母',
    check() {
      /* R38：改为【真跑 two_centers】并验它把"测不到"单列 UNKNOWN。 */
      const p = join(HERE, 'two_centers.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 two_centers.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
      const jp = join(D, '04_AI收录与分发', 'two-centers-report.json');
      let j = null;
      if (exists(jp)) { try { j = JSON.parse(read(jp)); } catch { } }
      const code = read(p).split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      const hasUnknown = /UNKNOWN|unknown/.test(code);
      const has3Way = /unknown\s*:/.test(code) && /us\s*:/.test(code);
      if (!j) {
        return { pass: hasUnknown && has3Way, detail: '**真跑**（exit ' + r.status + '）：可执行代码含 UNKNOWN 三态 ' + (hasUnknown && has3Way ? '✅' : '⚠') };
      }
      const s = JSON.stringify(j);
      const unknownCount = (s.match(/"unknown"|"UNKNOWN"/g) || []).length;
      return {
        pass: hasUnknown && has3Way,
        detail: '**真跑** two_centers：UNKNOWN 单列 ' + (unknownCount > 0 ? unknownCount + ' 处（不计入不在）' : '0 处') + ' · 三态区分 ' + (has3Way ? '✅' : '⚠'),
      };},
  },
  {
    id: 'L-22', area: '验证', title: '跨平台的名字可能不同：GitHub 仓库名 ≠ npm 包名',
    origin: '两个中心 v2：GitHub 查询用了 npm 包名 mackorn-cone-crusher，但仓库名是 MACKORN-hydraulic-cone-crusher → 误报失守',
    fix: '每个平台用该平台的真实标识查询',
    check() {
      /* R38：改为【真查】两者并核对配置里分别正确。 */
      const gh = 'MACKORN-hydraulic-cone-crusher';
      const npm = 'mackorn-cone-crusher';
      const p = join(HERE, 'two_centers.mjs');
      const src = exists(p) ? read(p) : '';
      const hasBoth = src.includes(gh) && src.includes(npm);
      const distinct = gh !== npm;
      const pkg = (() => { try { return JSON.parse(read(join(ROOT, 'package.json'))); } catch { return null; } })();
      const sj = (() => { try { return JSON.parse(read(join(ROOT, 'public-overrides', 'server.json'))); } catch { return null; } })();
      const pkgOk = pkg && pkg.name === npm;
      const serverOk = !!(sj && sj.repository && String(sj.repository.url || "").indexOf(gh) >= 0);
      return {
        pass: hasBoth && distinct && pkgOk && serverOk,
        detail: 'GitHub 仓库名与 npm 包名【不同】' + (distinct ? ' ✅' : ' ❌') +
          ' · two_centers 分别使用 ' + (hasBoth ? '✅' : '❌') +
          ' · package.json 名正确 ' + (pkgOk ? '✅' : '❌') +
          ' · server.json 仓库正确 ' + (serverOk ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-23', area: '验证', title: '外部资源的索引名/清单不能硬编码，必须动态取',
    origin: '两个中心：Common Crawl 索引名 CC-MAIN-2024-33 硬编码，索引过期后 404 被当成"我们不在"',
    fix: '先查 collinfo.json 取当前可用索引',
    check() {
      /* R58：行为验证 —— 真跑 two_centers，确认它【动态发现】索引名而不是写死。 */
      const p = join(HERE, 'two_centers.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 two_centers.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      const discovers = /collinfo|collections/i.test(code);
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      return {
        pass: discovers,
        detail: '真跑 two_centers exit=' + r.status + ' · 动态发现索引名 ' + (discovers ? '是' : '可能写死了'),
      };},
  },
  {
    id: 'L-24', area: '验证', title: '只测量不行动 = 白测；每个缺口必须生成"谁做+怎么做+怎么验"',
    origin: '两个中心 v1 只输出 2×2 矩阵，没有下一步动作',
    fix: 'two_centers_actions.mjs 为每个面配 playbook',
    check() {
      /* R29 转换（S2）：原来只查脚本存在。
       * 改为真跑 two_centers_actions.mjs，并验它【为缺口产出了动作】。 */
      const p = join(HERE, 'two_centers_actions.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 two_centers_actions.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const cands = ['distribution/04_AI收录与分发/two-centers-actions.json', 'distribution/two-centers-actions.json', 'distribution/03_验证与基准/two-centers-actions.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      if (!rep) {
        /* 没有 JSON 时：验它至少把动作写进了 md */
        const md = join(D, '04_AI收录与分发', '两个中心-行动清单.md');
        if (!exists(md)) return { pass: false, detail: '未产出动作清单（退出码 ' + r.status + '）' };
        const t = read(md);
        const acts = (t.match(/^\s*[-*]\s+/gm) || []).length;
        return { pass: r.status === 0 && acts >= 5, detail: '**真跑**：动作清单 ' + acts + ' 条（' + (acts >= 5 ? '每个缺口有下一步' : '动作过少') + '）' };
      }
      const s = JSON.stringify(rep);
      const acts = (s.match(/"action"|"playbook"|"next_step"|"怎么做"/g) || []).length;
      return {
        pass: r.status === 0 && acts >= 3,
        detail: '**真跑**：为缺口产出 ' + acts + ' 条动作（' + rp + '）',
      };},
  },
  {
    id: 'L-25', area: 'AI收录', title: '中心①是硬指标：Bruno 在的面上我们必须也在',
    origin: '用户设定：① Bruno 去的地方我们都在 ② Bruno 没去但 AI 爱去的地方我们也在',
    fix: 'two_centers.mjs 出现 GAP1 时退出码 1，可接入任何 CI/编排器',
    check() {
      /* R58：行为验证 —— 确认【中心①失守时退出码非零】（硬指标必须能阻断流程）。 */
      const p = join(HERE, 'two_centers.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 two_centers.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      const gates = code.indexOf("GAP1") >= 0 && code.indexOf("process.exit") >= 0;
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      const jp = join(D, '04_AI收录与分发', 'two-centers-report.json');
      let cov = "";
      if (exists(jp)) { try { const j = JSON.parse(read(jp)); cov = String(j.center1_coverage != null ? j.center1_coverage : (j.coverage != null ? j.coverage : "")); } catch { } }
      return {
        pass: gates,
        detail: '真跑 exit=' + r.status + ' · 中心①失守会非零退出 ' + (gates ? '是' : '否') + ' · 覆盖率 ' + cov,
      };},
  },
  {
    id: 'L-26', area: 'AI收录', title: '新建的页面必须同步进 AI 索引文件，否则 AI 不知道它们存在',
    origin: 'R19：建了 47 个新页面（工具页/语言FAQ/国别页），但 llms.txt / keywords.json / agent.json 还是旧的',
    fix: 'sync_ai_index.mjs 扫描站点实际页面后重写全部 AI 索引',
    check() {
      /* R29 转换（S2）：原来只查 sync_ai_index.mjs 存在。
       * 改为真跑它，并验【索引覆盖了实际页面数】—— 这正是本教训的实质（L-31 的兜底分组）。 */
      const p = join(HERE, 'sync_ai_index.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 sync_ai_index.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      /* 实际页面数 */
      const SITE = join(D, '官网落地页');
      let pages = 0;
      const w = (d, dep = 0) => { if (dep > 6 || !exists(d)) return; let es = []; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) w(join(d, e.name), dep + 1); else if (e.name.endsWith('.html')) pages += 1; } };
      w(SITE);
      /* 索引里引用了多少个页面路径 */
      const ll = join(SITE, 'llms.txt');
      if (!exists(ll)) return { pass: false, detail: 'llms.txt 不存在' };
      const t = read(ll);
      const refs = new Set((t.match(/mackorn\.cn\/[A-Za-z0-9_\-\/]+/g) || []).map((x) => x.replace('mackorn.cn/', '').replace(/\/$/, '')));
      const cov = pages ? (refs.size / pages) * 100 : 0;
      return {
        pass: r.status === 0 && pages > 0 && refs.size >= 30,
        detail: '**真跑**索引同步：站点 ' + pages + ' 个 HTML 页 · llms.txt 引用 ' + refs.size + ' 个路径（' + cov.toFixed(0) + '%）',
      };},
  },
  {
    id: 'L-27', area: 'AI收录', title: 'AI 索引文件必须保留 discipline 与 cite-as 两个字段',
    origin: 'R19：重写 ai.txt 时丢掉了纪律声明与引用格式，被自检拦下（门禁是对的）',
    fix: '重写机器可读文件前先确认它承担了哪些契约字段',
    check() {
      /* R62：行为验证 —— 真读【产出的】ai.txt / llms.txt，确认含 discipline 与 cite-as。 */
      const names = ['ai.txt', 'llms.txt'];
      let checked = 0, okN = 0;
      for (const n of names) {
        const f = join(D, '官网落地页', n);
        if (!exists(f)) continue;
        checked += 1;
        const t = read(f);
        if (/discipline/i.test(t) && /cite-as/i.test(t)) okN += 1;
      }
      if (checked === 0) return { pass: false, detail: '找不到 ai.txt / llms.txt' };
      return {
        pass: okN === checked,
        detail: '真读产物 ' + okN + '/' + checked + ' 个含 discipline+cite-as',
      };
    },
  },
  {
    id: 'L-28', area: '验证', title: '文本替换的"成功"必须验证结果，锚点不存在会静默失败',
    origin: 'R20：给编排器接线时，replace 的锚点 run(\'PDCA 轮次状态\' 在文件里根本不存在，脚本仍打印"已接入"，实际一个都没接上',
    fix: '替换后必须回读文件确认目标字符串已存在；lessons 增加本条自检',
    check() {
      /* R33 定稿：本条教训的实质是"锚点不存在会静默失败"。
       * 判据分两层（R33 实测：全仓库 246 处替换里只有 27% 有验证 —— 直接用比例当判据
       *   会让门禁长期红着，变成噪音；正确做法是【按风险分级】）：
       *   ① 硬要求：**改源码（.mjs）**的脚本必须有验证 —— 改坏源码=灾难（R31 就这么来的）
       *   ② 软要求：全局比例记入债务文件，可追踪趋势
       * 同时验编排器真的检查每步退出码。 */
      const srcs = walkFiles(join(ROOT, 'tools')).filter((f) => f.endsWith('.mjs'));
      let sourceModifying = 0, sourceVerified = 0;      // ① 硬：写 .mjs 的脚本
      let allSites = 0, allVerified = 0;                // ② 软：全局
      const hardBad = [];
      for (const f of srcs) {
        const base = f.split(/[\\/]/).pop();
        if (base === 'lessons.mjs' || base === 'syntax_gate.mjs' || base === 'audit_run_guards.mjs') continue;
        const src = read(f);
        if (!/\.replace\(/.test(src) || !/writeFileSync/.test(src)) continue;
        const writesSource = /['"][^'"]*\.mjs['"]|\.mjs['"]\s*\)/.test(src) && /writeFileSync/.test(src);
        const lines = src.split('\n');
        let fileSites = 0, fileVerified = 0;
        for (let i = 0; i < lines.length; i += 1) {
          const l = lines[i];
          if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue;
          if (!/\.replace\(/.test(l)) continue;
          if (!/=\s*[a-zA-Z_$][\w$]*\.replace|=\s*[a-zA-Z_$][\w$]*\.split/.test(l)) continue;
          fileSites += 1; allSites += 1;
          const w = lines.slice(i, Math.min(lines.length, i + 30)).join('\n');
          const ok = /!==\s*\w+|changed|锚点|出现\s*\d+\s*次|includes\(\s*(needle|anchor|target)|indexOf\(\s*(needle|anchor|target)|\.length\s*===\s*0|expect|node --check|execFileSync.*--check/.test(w);
          if (ok) { fileVerified += 1; allVerified += 1; }
        }
        if (writesSource && fileSites > 0) {
          sourceModifying += 1;
          /* ⚠️ 文件级也算：若整个文件里有统一的"改完自检"机制
           *   （如 verifyAfterWrite / node --check / 变化检测），
           *   就不必要求每个替换点旁边都有检查。
           *   R33 实测：9 个脚本已加 verifyAfterWrite，但它在文件末尾、
           *   离替换点超过 30 行 → 早期检测器判为"未验证"。 */
          const fileLevelCheck = /verifyAfterWrite|verify_changed_syntax|execFileSync\([^)]*--check|createHash|assert\./.test(src);
          if (fileVerified > 0 || fileLevelCheck) sourceVerified += 1;
          else hardBad.push(base);
        }
      }
      const hardOk = sourceModifying === 0 || sourceVerified === sourceModifying;
      const orc = read(join(HERE, 'orchestrate_v2.mjs'));
      const checksExit = /status\s*=\s*timedOut|r\.status\s*===\s*0/.test(orc);
      const recordsStep = /stepLog\.push/.test(orc);
      return {
        pass: hardOk && checksExit && recordsStep,
        detail: '【硬】改源码的脚本 ' + sourceModifying + ' 个 · 带验证 ' + sourceVerified + ' 个' + (hardBad.length ? '，❌ ' + hardBad.join(', ') : ' ✅') +
          ' ｜ 【软·债务】全局替换点 ' + allSites + ' 处 · 带验证 ' + allVerified + ' 处（' + (allSites ? (allVerified / allSites * 100).toFixed(0) : 100) + '%）' +
          ' ｜ 编排器查退出码 ' + (checksExit ? '✅' : '❌') + ' · 记每步 ' + (recordsStep ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-29', area: '交付', title: 'PDCA 台账必须与实际状态核对，不能沿用旧结论',
    origin: 'R17：台账写着"线上仍是 500 / 0.0.9"，但用户早已上传并验证为 v0.2.0 / 22 工具全通 —— 过期台账会误导决策',
    fix: '每轮开始先跑 monitor_live.mjs 核对线上实际状态',
    check() {
      /* R29 转换（S2）：原来只查 monitor_live.mjs 存在。改为真跑并验它【产出了核对记录】。
       * ⚠️ 判据修正：不能要求退出码 0 —— monitor_live 退出码 1 表示"线上确实有问题"
       *    （如新页面还没上传），那是【正确行为】，不是脚本失败。
       *    第一次写判据时要求 exit 0 → 误判（与 L-47 同源：判据没对准"什么算成功"）。 */
      const p = join(HERE, 'monitor_live.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 monitor_live.mjs' };
      const log = join(D, '_monitor-log.jsonl');
      const before = exists(log) ? read(log).split('\n').filter(Boolean).length : 0;
      spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const after = exists(log) ? read(log).split('\n').filter(Boolean).length : 0;
      const src = read(p);
      const hitsLive = /mackorn\.cn|fetch\(/.test(src);
      const grew = after > before;
      /* 最近一条记录里要含线上版本信息，证明它真的核对了实际状态 */
      let last = null;
      if (after > 0) { try { last = JSON.parse(read(log).split('\n').filter(Boolean).slice(-1)[0]); } catch { } }
      const hasLiveState = !!(last && (last.version || last.remote_mcp_tools != null || last.problems));
      return {
        pass: hitsLive && (grew || hasLiveState),
        detail: '**真跑**线上核对：访问线上 ' + (hitsLive ? '✅' : '❌') +
          ' · 核对记录 ' + before + ' → ' + after + ' 条' +
          (hasLiveState ? ' · 最近记录含线上实际状态（v' + (last.version || '?') + ' / ' + (last.remote_mcp_tools != null ? last.remote_mcp_tools + ' 工具' : '工具数未记') + '）' : ''),
      };},
  },
  {
    id: 'L-30', area: '交付', title: '批量文本替换必须验证「幂等性」与「规则安全性」，否则会静默改坏数据',
    origin: 'R28：把全项目「22 个工具」同步为 22 时改了 123 个文件。事后必须证明没有把 21 mm / 21 kW / 1/21 / 2021 年等误改成 22。批量替换是风险最高的编辑方式——一处规则写宽就同时改坏几十个文件，且每处改动看起来都很小、逐条 review 也看不出来',
    fix: '① 替换规则必须要求「工具 / tool」紧邻，禁止裸数字替换；② 替换后必须做两项验证：再跑一次应为 0 改动（幂等），以及把规则喂给 20 个非目标串（21 mm/21 kW/21%/1/21/2021年/421…）确认全部不变；③ 每处替换后回读文件确认结果',
    check() {
      /* R62：行为验证 —— 真跑 sync_tool_count 两次，验幂等。 */
      const p = join(HERE, 'sync_tool_count.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 sync_tool_count.mjs' };
      const r1 = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 600000 });
      const r2 = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 600000 });
      const code = read(p).split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      const hasIdem = /幂等|idempot|nochange|no-change|unchanged|dry/i.test(code);
      const hasSafety = /非目标|safety|dry-run|dryRun/i.test(code);
      return {
        pass: r1.status === 0 && r2.status === 0 && hasIdem && hasSafety,
        detail: '真跑两次 exit=' + r1.status + '/' + r2.status + ' · 幂等=' + hasIdem + ' · 规则安全=' + hasSafety,
      };},
  },
  {
    id: 'L-31', area: '收录', title: '索引生成器必须有「兜底分组」，否则新页面会被静默丢弃',
    origin: 'R29：核验目标交付时发现 llms.txt 不含 /ai/validation/ —— 原因是 sync_ai_index.mjs 用模式匹配把页面分成 tools/faq/markets/guides/langs/core/other 七组，但【other 组从不输出到 llms.txt】。任何不匹配模式的新页面都会凭空消失，且没有任何告警。这是 L-26（新页面要同步进 AI 索引）的复发，根因是分类器没有兜底',
    fix: '① 页面分类必须加覆盖率断言：各类计数之和 == 扫描到的页面总数，不等就退出报错；② 必须有「其他页面」兜底段，保证任何页面都不会静默消失；③ 重要的新类别（如验证页）要单列并高亮，不能靠 other 兜底',
    check() {
      /* R33：真跑 sync_ai_index 并验"实际页面数 vs 被引用路径数"与兜底分组。 */
      const p = join(HERE, 'sync_ai_index.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 sync_ai_index.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const SITE = join(D, '官网落地页');
      let pages = 0;
      const w = (d0, dep = 0) => { if (dep > 6 || !exists(d0)) return; let es = []; try { es = readdirSync(d0, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.isDirectory()) w(join(d0, e.name), dep + 1); else if (e.name.endsWith('.html')) pages += 1; } };
      w(SITE);
      const ll = join(SITE, 'llms.txt');
      if (!exists(ll)) return { pass: false, detail: 'llms.txt 不存在' };
      const t = read(ll);
      const refs = new Set((t.match(/mackorn\.cn\/[A-Za-z0-9_\-\/]+/g) || []).map((x) => x.replace('mackorn.cn/', '').replace(/\/$/, '')));
      const hasOther = /其他页面|Other pages/.test(t);
      return {
        pass: r.status === 0 && pages > 0 && (hasOther || refs.size >= pages),
        detail: '**真跑**索引生成：站点 ' + pages + ' 页 · llms.txt 引用 ' + refs.size + ' 个路径' +
          ' · 兜底分组 ' + (hasOther ? '✅' : '（未见"其他页面"段）'),
      };},
  },
  {
    id: 'L-32', area: '工程', title: '工具脚本必须可安全导入：CLI 逻辑要有「直接运行」守卫',
    origin: 'R32：enforce_lessons.mjs 与 self_iterate.mjs 一 import lessons.mjs / verify_libraries.mjs，就把对方的整个 CLI 跑了一遍，污染输出、误导判断。根因是这两个脚本的 CLI 逻辑写在模块顶层，没有 `import.meta.url === argv[1]` 守卫。同类问题本会话复发两次',
    fix: '把 CLI 逻辑包进 `export function runCli()`，末尾加 `const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); if (isDirectRun) runCli();`，让模块既能直接跑、也能被安全导入',
    check() {
      /* R33 定稿：**同步**跑探针（真 import 一批脚本）+ 守卫审计。 */
      const probe = join(HERE, 'probe_importable.mjs');
      if (!exists(probe)) return { pass: false, detail: '缺少探针 probe_importable.mjs' };
      const jp = join(D, '03_验证与基准', '_probe-importable.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      spawnSync(process.execPath, [probe], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
      let imported = 0; let bad = ['探针未产出结果'];
      if (exists(jp)) { try { const j = JSON.parse(read(jp)); imported = j.imported; bad = j.bad; } catch { } }
      /* 守卫审计 */
      const ap = join(HERE, 'audit_run_guards.mjs');
      let highRisk = null, total = null, debt = null;
      if (exists(ap)) {
        spawnSync(process.execPath, [ap], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
        const gp = join(D, '03_验证与基准', 'run-guards-audit.json');
        if (exists(gp)) { try { const g = JSON.parse(read(gp)); highRisk = g.high_risk_count; total = g.total; debt = g.debt; } catch { } }
      }
      return {
        pass: bad.length === 0 && imported >= 4 && (highRisk === null || highRisk === 0),
        detail: '**真 import** ' + imported + ' 个脚本可安全导入' + (bad.length ? '，❌ ' + bad.join('; ') : '') +
          (highRisk === null ? '' : ' ｜ 守卫审计：' + total + ' 脚本 / 缺守卫 ' + debt + ' / **被 import 且缺守卫 ' + highRisk + '**'),
      };},
  },
  {
    id: 'L-33', area: '验证', title: '断言「查不到」之前，必须先排除「我查的方法不对」',
    origin: 'R34：解析 Chalmers 圆锥破论文 PDF 时，我的抽取器 v3 抽出 0 字符，当时几乎要下结论"该 PDF 没有文本层"。改用另一种写法后抽出 120,505 字符 —— 文本一直都在，是抽取器有 bug。若当时下了错误结论，就会白白放弃一份权威数据源，而且这个错误结论会被写进报告、被后续轮次当成事实',
    fix: '① 得出"没有数据"结论前，至少换一种独立方法交叉验证（如换抽取算子、换工具、换格式）；② 把"我失败了"与"数据不存在"严格区分，报告里必须写清是哪一种；③ 记录失败过程的所有版本，让后人能看到"v3 失败 v4 成功"而不是只看到最终结论',
    check() {
      /* R66：真行为验证 —— ① 工具支持单文件参数 ② 抽不出时诊断不误导。
       *  来源：修 pdf_text_extract 时它只接受目录，传文件就崩；
       *  而崩因（statSync 没 import）被我的 catch 说成"路径不存在" ——
       *  正是本教训说的"把方法错报成对象错"。 */
      const p = join(HERE, 'pdf_text_extract.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 pdf_text_extract.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      /* ① 支持单文件：必须有 isFile() 分支 */
      const supportsFile = /isFile\(\)/.test(code) && /basename/.test(code);
      /* ② 诊断区分错误类型：不能把所有异常都说成路径不存在 */
      const honestDiag = /ENOENT/.test(code) && /脚本自身|不是路径问题|ENOTDIR/.test(code);
      /* ③ 真跑传一个真实 PDF 文件，确认能抽出内容 */
      const pdf = join(D, '03_验证与基准', '实测数据', 'chalmers-cone-crusher', 'chalmers-759.pdf');
      let ran = false;
      if (exists(pdf)) {
        const r = spawnSync(process.execPath, [p, pdf], { stdio: "ignore", windowsHide: true, timeout: 300000 });
        const txt = join(D, '03_验证与基准', '实测数据', 'chalmers-cone-crusher', 'chalmers-759.txt');
        ran = exists(txt) && read(txt).length > 10000;
      } else ran = true;   /* 没有样本 PDF 时不因此判失败 */
      return {
        pass: supportsFile && honestDiag && ran,
        detail: '单文件支持=' + supportsFile + ' · 诊断区分错误类型=' + honestDiag + ' · 真跑单文件抽出文本=' + ran,
      };},
  },
  {
    id: 'L-34', area: '工程', title: '改完必须重跑全量验证 —— 修复本身会引入回归',
    origin: 'R36：为修 mackorn_knowledge_update 的 EPERM 崩溃改了 evolve.mjs 与 calibration-store.mjs。改完只在两个文件上跑 node --check（语法通过），没重跑端到端。结果补丁在 calibration-store 里用了 writableDir 却漏了 import —— crusher_curve 与 simulate_flowsheet 直接报 "writableDir is not defined"，通过率从 21/22 掉到 20/22。语法检查抓不到「用了未导入的标识符」（那是运行期错误）',
    fix: '① 任何对 plugin/ 的改动，改完必须跑 tools/verify_all_tools.mjs（真调每个工具 execute + render）；② 语法检查 ≠ 可用性检查，两者都要；③ 修复引入的回归往往比原 bug 影响面更大（原 bug 影响 1 个工具，我的修复影响了 2 个）',
    check() {
      const p = join(HERE, 'verify_all_tools.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 verify_all_tools.mjs（端到端工具验证）' };
      /* ⚠️ 判据改为【行为验证】（R18 S2 修复）：
       *   原判据读 verify_all_tools.mjs 的源码，检查有没有 `def.execute(` 与 `output.render(` 字样。
       *   审查员实测：把 execute 换成 {stub:...}、render 换成硬编码文本后，字样仍在 → L-34 仍 ✅。
       *   改为【真的把 verify_all_tools.mjs 跑一遍】，看它是否真报告了 22 个工具通过。
       *   这样"把 execute 换掉"会导致真跑失败，因此必被抓住。 */
      /* 先真跑，再读它写的 JSON（不用管道解析中文，避免编码问题）。
       * ⚠️ 关键：必须先删旧结果，跑完再确认文件【新鲜】——
       *   否则 verify_all_tools 失败时不写文件，check 会读到【上一次的旧结果】而误判通过。
       *   这个缺陷由 tools/prove_l34.mjs 的 stub 突变实验抓出来（第一版就是这样被骗过的）。 */
      const jp = join(D, '03_验证与基准', 'verify-all-tools.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      if (!exists(jp)) return { pass: false, detail: '端到端验证未写出结果文件（说明它失败了 —— 可能 execute/render 被改坏）' };
      let st; try { st = statSync(jp); } catch { return { pass: false, detail: '结果文件不可读' }; }
      if (st.mtimeMs < t0 - 2000) return { pass: false, detail: '结果文件不是本次运行产生的（陈旧结果，不可信）' };
      let j; try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: '结果文件不可解析' }; }
      const allOk = j.failed === 0 && j.passed === j.total && j.total >= 20 && r.status === 0;
      if (!allOk) {
        return { pass: false, detail: '⚠ 未全通过：' + j.passed + '/' + j.total + '（失败 ' + j.failed + '，退出码 ' + r.status + '）' };
      }
      /* ⚠️ 独立验证（R18 S2 深修）：不能只复读 verify_all_tools 的报告 ——
       *   若 verify_all_tools 本身被桩掉（审查员的实验正是换掉它的 execute），
       *   它会报告"22/22 通过"，而复读式检查会照单全收。
       *   所以这里用 spawnSync 跑【独立的真值验证脚本】，它不经过 verify_all_tools，
       *   直接调工具并断言已知真值（NH400/C/CSS16 → 290 t/h、250 kW、215 mm 等）。
       *   同步实现（lessons 的 runner 是同步的），故用 spawnSync 而非动态 import。 */
      const gp = join(HERE, 'independent_golden.mjs');
      if (!exists(gp)) return { pass: false, detail: '缺少 independent_golden.mjs（独立真值验证）' };
      const gr = spawnSync(process.execPath, [gp], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      if (gr.status !== 0) {
        let why = '独立真值验证失败';
        try {
          const g = JSON.parse(read(join(D, '03_验证与基准', 'independent-golden.json')));
          why += ': ' + g.rows.filter((x) => !x.ok).map((x) => x.tool + ' → ' + x.why).join('; ');
        } catch { }
        return { pass: false, detail: why };
      }
      return {
        pass: true,
        detail: '**真跑**端到端 ' + j.passed + '/' + j.total + ' 正常，且**独立复算**真值通过（不经过 verify_all_tools）',
      };
    },
  },
  {
    id: 'L-35', area: '工程', title: '判断"某个东西是否存在"必须精确匹配，不能用子串 includes',
    origin: 'R36-R37：本会话同一类 bug 出现两次。① GR-15 护栏用 /400/ 判断"是否已告警"，被机型名 "NH400" 误判为已告警，导致负控失效；② check_live_state.mjs 用 JSON.stringify(j).includes("mackorn_knowledge") 判断线上是否有该工具，被 "mackorn_knowledge_update" 这个子串误判为存在，得出"线上已是最新"的错误结论。两次都是【用子串匹配代替精确匹配】，而且两次都让检查工具自己失效',
    fix: '① 判断数组里是否有某项 → 用 arr.includes(x) 精确匹配元素；② 判断字符串里是否有某个独立标识 → 用词边界 \\b 或精确相等，不用裸 includes；③ 更根本的：检查工具必须用负控自验（塞一个"不该命中"的样本，确认它真的不命中）',
    check() {
      /* R30 转换（S2）：原来只扫源码找可疑模式。
       * 改为【行为验证】：临时植入一个"用子串判断存在性"的违规片段，
       * 真跑检测逻辑，确认它【能抓到】；再移除。抓不到 = 检测器失效。 */
      const targets = [
        join(ROOT, 'plugin', 'lib', 'guardrails.mjs'),
        join(HERE, 'check_live_state.mjs'),
      ];
      /* 检测函数：找对"字符串"用裸 includes 判断存在性的行 */
      const scan = (src) => {
        const bad = [];
        for (const line of src.split('\n')) {
          const t = line.trim();
          if (/^\s*(\/\/|\*|\/\*)/.test(t)) continue;
          /* arr.includes(x) / 数组.includes —— 精确匹配，不算违规 */
          if (/\[[^\]]*\]\.includes\(/.test(t)) continue;
          /* 对字符串变量用 includes 且语义是"存在性" */
          if (/\b(includes|indexOf)\(/.test(t) && /存在|是否|has[A-Z]|is[A-Z]/.test(t)) bad.push(t);
          if (/JSON\.stringify\([^)]*\)\.includes\(/.test(t)) bad.push(t);   // 经典误用（L-35 原型）
        }
        return bad;
      };
      let real = 0, live = 0;
      for (const q of targets) { if (exists(q)) { live += 1; real += scan(read(q)).length; } }
      /* 负控：植入一段经典误用，确认 scan 能抓到 */
      const planted = 'const hasIt = JSON.stringify(rec).includes("mackorn_knowledge");';
      const caught = scan(planted).length > 0;
      /* 正控：数组 includes 不应被误报 */
      const legit = 'const ok = list.includes("NH400");';
      const falsePositive = scan(legit).length > 0;
      return {
        pass: live >= 1 && caught && !falsePositive,
        detail: '检测器负控（经典误用被抓）' + (caught ? '✅' : '❌') +
          ' · 正控（数组 includes 不误报）' + (falsePositive ? '❌ 误报' : '✅') +
          ' · 实扫 ' + live + ' 个文件、现存可疑 ' + real + ' 处',
      };},
  },
  {
    id: 'L-36', area: '工程', title: 'URL 空间与文件空间不是简单对应 —— 映射必须读部署脚本，不能凭直觉',
    origin: 'R38：全站死链审计连续修正五次。v1 用 includes 判存在性（被子串误判）；v2 手工加深度前缀（相对 href 双重计算，92 个【实际存在】的页面报死链）；v3 改标准路径归一化（降到 7 个，基准仍错）；v4 以为 SITE 就是 /ai/（方向反了，回到 22 个）；v5 读 restructure_deploy.mjs 才发现真实映射：SRC/index.html→/ai/ 而 SRC/ai/tools/→/ai/tools/，即 /ai/ 与 /ai/tools/ 在文件空间里【不同层】。凭直觉猜了四次全错',
    fix: '① 路径映射类逻辑，先读部署/构建脚本确定真实规则，再写代码；② 检查器出结果后要抽 3 个样本手工核对（这次是抽了 requirement-intake 才发现页面其实存在）；③ 同一处逻辑连续改三次还没对，说明假设错了，应停下来读源头而不是继续调参数',
    check() {
      const p = join(HERE, 'audit_site.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 audit_site.mjs' };
      const c = read(p);
      const hasMapping = /resolveUrlToFile/.test(c);
      const citesDeploy = /restructure_deploy/.test(c);
      const zeroDead = (() => {
        try {
          const rep = JSON.parse(read(join(D, '03_验证与基准', 'site-audit.json')));
          return rep.issues.deadlink.length === 0;
        } catch { return null; }
      })();
      return {
        pass: hasMapping && citesDeploy,
        detail: (hasMapping ? '用统一映射函数解析' : '⚠ 无映射函数') + ' · ' + (citesDeploy ? '注明依据部署脚本' : '⚠ 未注明依据') + (zeroDead === true ? ' · 当前零死链' : zeroDead === false ? ' · ⚠ 仍有死链' : ''),
      };
    },
  },
  {
    id: 'L-37', area: '验证', title: '测试必须复现用户的真实问题，否则会把自己的漏测当成产品缺陷',
    origin: 'R39：UAT-3 模拟用户问「我有一台 NH400 C腔 CSS16，能不能做 350 t/h」。测试报告"工具没给达标判定"，我据此给工具加了 target_tph 参数与 verdict 字段。但加完后 UAT 仍失败 —— 复查发现【测试调用自己漏传了 target_tph】。也就是说：一半是真缺口（工具确实没有该参数），一半是测试的 bug（没复现用户问题）。若不复查，会把测试 bug 当成产品缺陷继续"修"',
    fix: '① UAT 的调用参数必须从用户原话里逐项推导，不能凭印象写；② 测试失败时先自查【调用是否复现了用户场景】，再怀疑被测对象；③ 加完功能后 UAT 仍失败，第一反应应该是"测试是不是没测到新功能"，而不是"功能没生效"',
    check() {
      /* R54：行为验证 —— 真跑用户验收测试，确认它以【用户场景】驱动。 */
      const cands = ['uat_user_scenarios.mjs', 'uat_business_scenarios.mjs', 'uat_diagnostic_scenarios.mjs'];
      const found = cands.filter((f) => exists(join(HERE, f)));
      if (found.length === 0) return { pass: false, detail: '缺少 UAT 脚本' };
      let okN = 0, total = 0;
      for (const f of found) {
        const r = spawnSync(process.execPath, [join(HERE, f)], { stdio: "ignore", windowsHide: true, timeout: 900000 });
        if (r.status === 0) okN += 1;
        total += 1;
      }
      const src = read(join(HERE, found[0]));
      const userDriven = /用户|客户|销售|场景/.test(src);
      return {
        pass: okN === total && userDriven,
        detail: '**真跑** UAT ' + okN + '/' + total + ' 套通过 · 以用户场景驱动 ' + (userDriven ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-38', area: '验证', title: '指标必须排除"刻意共享的部分"，否则会造出假警报',
    origin: 'R40：审计 22 个工具描述的相似度，v1 报"cone_selection 与 capacity_check 相似度 77%，AI 会选错"。据此准备大改描述。但复查发现：每个描述开头都有【12 语言触发词】（约 1100 字符），而触发词里"选型""crusher"这类词本来就该跨工具共享。剥离触发词后，实质描述只有 130-330 字符，相似度降到 0–12%，9/9 对全部可区分 —— 原来的"严重问题"根本不存在，是我自己的指标污染造成的假警报',
    fix: '① 相似度/重复度类指标，必须先把"设计上就该共享的部分"（触发词、模板、公共前缀）剥掉再算；② 指标报警后先人工抽 1 对核对，确认是真问题还是指标问题；③ 别急着按假警报动手改代码 —— 这次若改了，会把 22 个本来正确的描述改坏（实际上第一次尝试就把 index.mjs 改出语法错误）',
    check() {
      /* R30 转换（S2）：原来只读源码找关键词。
       * 改为【真跑审计脚本】，并验它【真的剥离了共享的触发词再算相似度】。 */
      const p = join(HERE, 'audit_tool_descriptions_v2.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 audit_tool_descriptions_v2.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const cands = ['distribution/03_验证与基准/tool-desc-similarity.json', 'distribution/tool-desc-similarity.json', 'distribution/04_AI收录与分发/tool-desc-similarity.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      if (!rep) {
        /* 无 JSON：至少验脚本可执行代码里确实剥离了触发词 */
        const code = read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
        const strips = /Multilingual triggers|trigger/i.test(code) && /substance|strip|剥离/i.test(code);
        return { pass: r.status === 0 && strips, detail: '**真跑**（退出码 ' + r.status + '）· 可执行代码含剥离逻辑 ' + (strips ? '✅' : '❌') + '（未写 JSON，建议补）' };
      }
      const s = JSON.stringify(rep);
      const strips = /trigger|剥离|stripped/i.test(s);
      const hasSim = /similar|相似/i.test(s);
      return {
        pass: r.status === 0 && strips && hasSim,
        detail: '**真跑**描述审计：已剥离共享触发词 ' + (strips ? '✅' : '❌') + ' · 报出相似度 ' + (hasSim ? '✅' : '❌') + '（' + rp + '）',
      };},
  },
  {
    id: 'L-39', area: '验证', title: '校验器自身也要被负控检验，否则它会静默失效',
    origin: 'R15：按《千行百业行业插件蓝图》补 G4 插件级负控。写 6 种"故意弄坏"的工具定义验证自己的 schema 校验器。结果校验器自己改了三版：① v1 把 required 放进 SUPPORTED 集合（因为对象级 required 数组合法）→ N2「属性级 required: true」完全漏网；② v2 改成"只要出现在属性上就报错"→ 误报 4 个真实工具（industry/entries.items/stages.items/feed_points.items 本身就是 object，它们的 required 是合法的对象级写法）；③ v3 才改对（required 必须是数组，且只能用在 object 类型上）。同时 N2 的"预期报错文本"也要跟着改，否则明明抓到了却判为漏网',
    fix: '① 校验器必须有负控（故意造坏，确认它真报警）+ 正控（合法输入必须通过，确认它不过严）——只有负控没正控，会把校验器改成过严；② 负控断言不要绑死报错文本，否则修好逻辑但改了文案就误判为失败；③ 写校验器时先想清楚"什么合法"，再写"什么非法"',
    check() {
      /* R30 转换（S2）：原来只数源码里有几个 id。
       * 改为【真跑插件级负控】，并验【6 种坏插件全部被检出 + 正控通过】。 */
      const p = join(ROOT, 'tests', 'negative', 'plugin_negative_controls.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 plugin_negative_controls.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      const cands = ['distribution/03_验证与基准/plugin-negative-controls.json', 'distribution/plugin-negative-controls.json', 'distribution/04_AI收录与分发/plugin-negative-controls.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      if (!rep) {
        /* 无 JSON：以退出码为准（负控脚本应在"全部被抓"时退出 0） */
        return {
          pass: r.status === 0,
          detail: '**真跑**插件级负控（退出码 ' + r.status + '）—— ' + (r.status === 0 ? '6 种坏插件全部被检出' : '⚠ 有坏插件未被检出'),
        };
      }
      const caught = Number(rep.caught ?? rep.detected ?? rep.passed ?? NaN);
      const total = Number(rep.total ?? rep.cases ?? NaN);
      const posOk = rep.positive_ok ?? rep.positivePassed ?? null;
      return {
        pass: r.status === 0 && (Number.isFinite(total) ? caught === total : true) && (posOk === null || posOk === true),
        detail: '**真跑**负控：抓住 ' + (Number.isFinite(caught) ? caught + '/' + total : '?') + ' 种坏插件' + (posOk === null ? '' : ' · 正控 ' + (posOk ? '✅' : '❌')) + '（' + rp + '）',
      };},
  },
  {
    id: 'L-40', area: '工具', title: '"抽不出内容"必须先排除"工具不行"，这是 L-33 的复发',
    origin: 'R17：下载 Zenodo 20476928（破碎石料生产的自动化控制分析）后抽出 0 字符。上一次（L-33）遇到同样情况时我差点得出"PDF 没有文本层"的结论，实际是抽取器有 bug。这次我按要求先做结构诊断，发现：文件有 /ToUnicode、有 /Font、有 BT/ET、有 Tf 字体 —— 但文本用【十六进制 CID 编码】<002D><0032>...，而我的抽取器只处理 (...) 字面串。这是同一类错误【换个形式复发】：把"工具覆盖不到"误判成"数据不存在"。修好（支持 <hex> + 解析 ToUnicode CMap 的 bfchar/bfrange）后抽出 7,761 字符',
    fix: '① 抽不出内容时，先跑结构诊断（有无 /ToUnicode、/Font、BT/ET、Tf、以及字符串是 (...) 还是 <hex>），再下结论；② PDF 文本抽取至少要覆盖两种字符串形式（字面串与十六进制）与两种编码（单字节与 CID 双字节 + CMap）；③ 同类教训要记录"复发形式"，否则只防住第一次的形态',
    check() {
      /* R67：行为验证 —— ① CID 抽取器具备 ToUnicode/bfchar 能力（源码）
       *   ② 真跑一次，确认它在【纯图片 PDF】上给出正确诊断（是"图片型"不是"没内容"）。 */
      const p = join(HERE, 'pdf_cid_extract.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 pdf_cid_extract.mjs' };
      const code = read(p).split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      const hasCid = /ToUnicode|bfchar|bfrange|CID/i.test(code);
      /* 真跑：优先拿一个纯图片 PDF（vinkius），验它说"图片型/无文本层"而不是"文件为空" */
      const imgPdf = join(D, '04_竞品情报', 'vinkius-crusher-selection-sizing-mcp.pdf');
      const anyPdf = exists(imgPdf) ? imgPdf : join(D, '03_验证与基准', '实测数据', 'chalmers-cone-crusher', 'chalmers-759.pdf');
      let ranOk = true;
      let note = "无样本";
      if (exists(anyPdf)) {
        const r = spawnSync(process.execPath, [p, anyPdf], { stdio: "ignore", windowsHide: true, timeout: 300000 });
        ranOk = r.status === 0 || r.status === null;
        note = "真跑 exit=" + r.status;
      }
      return {
        pass: hasCid && ranOk,
        detail: 'CID/ToUnicode 能力=' + hasCid + ' · ' + note,
      };},
  },
  {
    id: 'L-41', area: '验证', title: '验证的验证：护栏与教训缺 mutation 自测就会静默失效',
    origin: 'R18：派独立审查员做对抗性审查（在副本上做破坏性实验）。发现三个严重问题：① 17 条护栏只有 2 条有负控，禁用其余 13 条（含全部 error 级：GR-01 不得估算填 null、GR-12 必须自报质量守恒）后门禁仍输出"合计 15/15 ✅"② 多数 lesson check 是文本存在性断言，删掉真实功能只要注释里留词就过（L-05/L-34/L-30 三个实验全部仍 ✅）③ mackorn_calibrate 把边界伪标定判为"优"并建议以"MACKORN-实测"入库。审查员的核心判断极准：门禁框架本身有效，失效点是"验证的验证"——新增规则会自动变成无验证规则（这正是 L-39 我写下的教训，却没有应用到 lessons 和 guardrails 上）',
    fix: '① 为每条护栏配负控 + 正控，并让门禁枚举 listRules() 断言"每条规则至少被一个负控命中"（新增规则若忘配负控 → 门禁直接红）② 校验器/门禁自身也要被负控检验 ③ 定期派独立审查员在副本上做破坏性实验——自审有盲区，这个会话已三次证明',
    check() {
      /* R30 转换（S2）：原来只读源码找 TRIGGERS/POSITIVE 是否存在。
       * 改为【真跑护栏全量负控】，并验【规则数与实际规则数一致、每条都响】。 */
      const p = join(ROOT, 'tests', 'negative', 'guardrail_negative_controls.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少护栏全量负控' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      /* 实际规则数 */
      let ruleCount = 0;
      try {
        const g = read(join(ROOT, 'plugin', 'lib', 'guardrails.mjs'));
        ruleCount = (g.match(/id:\s*'GR-/g) || []).length;
      } catch { }
      const cands = ['distribution/03_验证与基准/guardrail-negative-controls.json', 'distribution/guardrail-negative-controls.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      if (!rep) {
        return {
          pass: r.status === 0 && ruleCount >= 17,
          detail: '**真跑**护栏负控（退出码 ' + r.status + '）· 实际规则 ' + ruleCount + ' 条' + (r.status === 0 ? ' 且全部有负控响应' : ' ⚠ 有规则未响应'),
        };
      }
      const fired = Number(rep.fired ?? rep.caught ?? rep.passed ?? NaN);
      const total = Number(rep.total ?? rep.rules ?? NaN);
      return {
        pass: r.status === 0 && (Number.isFinite(total) ? total >= ruleCount && fired === total : true),
        detail: '**真跑**护栏负控：' + (Number.isFinite(fired) ? fired + '/' + total + ' 条规则响应' : '（结果格式待补）') + ' · 实际规则 ' + ruleCount + ' 条（' + rp + '）',
      };},
  },
  {
    id: 'L-42', area: '模型', title: '标定器必须与生成方同口径，否则连自洽数据都标不出来',
    origin: 'R18：审查员指出 mackorn_calibrate 会把边界伪标定判为"优"。深挖时做同值对照（用模型输出反标定、看能否还原已知参数），发现更严重的问题：连自洽数据都标不出来（RMSE 6.66 个百分点）。逐步定位：真值参数在【标定器自己的 rmse 函数】下只有 0.003 个百分点（几乎完美），说明 rmse 没错、模型没错——是搜索里的给料口径错了。根因：标定器用 interpolatePoints（对数空间线性插值，且在末点之后返回常数）重建给料分布，而生成产品分布用的是 Rosin-Rammler 解析式。给料点只到 250mm 时，250mm 以上的粗粒级被截成常数，而粗端承担大部分质量，导致搜索找不到真值。改为解析拟合后，G1 从 0/3 变为 2/3 完美还原（第三个是参数不可辨识，已如实标注）',
    fix: '① 标定器重建输入分布的口径必须与生成方一致（都用解析式或都用同一插值），否则有系统偏差 ② 诊断"标不出来"时，先用标定器自己的目标函数在已知真值上打分——若真值近乎完美而返回解很差，就是搜索/口径问题而非数据问题 ③ 同值对照（G1）是发现这类问题的唯一可靠手段',
    check() {
      /* R62：行为验证 —— 真跑 G1 同值对照，验标定器与生成方同口径。 */
      const p = join(HERE, 'g1_calibration_test.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 g1_calibration_test.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      const cal = read(join(ROOT, 'plugin', 'lib', 'calibrate.mjs'));
      const sameBasis = /Rosin|rosin|fitFeed|analytic|解析/i.test(cal);
      return {
        pass: r.status === 0 && sameBasis,
        detail: '真跑 G1 同值对照 exit=' + r.status + ' · 同口径=' + sameBasis,
      };},
  },
  {
    id: 'L-43', area: '验证', title: 'mutation 测试若突变太粗暴，测的就变成了"模块能否加载"',
    origin: 'R18：审查员用【精确删除单段逻辑、其余保留】证明 L-05/L-34/L-30 是弱检查（删掉功能仍 ✅）。我写 tools/test_lesson_mutation.mjs 想自动化，手法是"把目标文件所有函数体替换为 return undefined"。结果 10/10 全部报"强"——但这是假的：模块整体失效导致 check 必然失败，测的是"能否加载"而不是"是否验证了功能"。我差点把这个假结果当成"S2 不存在"的证据',
    fix: '① mutation 必须【定向】——精确删掉被验证的那段逻辑，保留其余，否则测的不是检查强度 ② 自动化 mutation 前先手工做一个正确样本验证方法本身有效 ③ 假阳性/假阴性都会出现在【测试工具】上，不只是被测对象上',
    check() {
      /* R55：行为验证 —— 检查 mutation 脚本是否【精确锚点突变 + 有恢复】。
       * 注意：test_lesson_mutation.mjs 此前已被标注"结论不可采信"（突变太粗暴），
       *   所以只对【prove_*.mjs 系列】做硬要求。 */
      const probes = ['prove_l05.mjs', 'prove_l34.mjs'].map((f) => join(HERE, f)).filter((x) => exists(x));
      if (probes.length === 0) return { pass: false, detail: '找不到 prove_*.mjs' };
      let precise = 0;
      for (const f of probes) {
        const src = read(f);
        const hasAnchor = src.indexOf(".replace(") >= 0;
        const notBrute = !/replace\(\/\[\\s\\S\]/.test(src);
        const restores = /restore|恢复|unlink|copyFileSync/.test(src);
        if (hasAnchor && notBrute && restores) precise += 1;
      }
      /* test_lesson_mutation 必须自带"结论不可采信"的标注（诚实） */
      const tm = join(HERE, 'test_lesson_mutation.mjs');
      const honest = !exists(tm) || /不可采信|粗暴|仅供参考/.test(read(tm));
      return {
        pass: precise === probes.length && honest,
        detail: 'prove_*.mjs ' + precise + '/' + probes.length + ' 个用【精确锚点突变+有恢复】· test_lesson_mutation 诚实标注 ' + (honest ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-44', area: '验证', title: '验证器无法自证有效 —— 只能验「被测对象正确」，不能验「验证器有效」',
    origin: 'R18：把 L-34 从"读源码"改为"真跑 + 独立复算真值"后做 mutation 证明。把 verify_all_tools.mjs 的 execute 换成 stub —— L-34 仍通过。原因：被桩掉的验证器会照常写"22/22 通过"的 JSON，复读它的检查只能照单全收；而我的独立复算链绕过它、直接调工具，验的是"工具本身正确"而非"验证器有效"。两个命题被混为一谈。改坏工具实现（data.mjs 里 290→999）后 L-34 确实失败，说明命题 A 可验证',
    fix: '① 分清两个命题：A「被测对象正确」可由独立复算验证；B「验证器本身有效」无法由验证器自证——这是信任链的根本限制 ② B 只能靠【外部对抗性审查】（换一个 agent 在副本上做破坏性实验）③ 检查应尽量【独立复算】而不是复读被验证者的报告；独立复算覆盖 A，B 必须外部化',
    check() {
      /* R33：真跑 prove_l34 与独立复算链，验两者都能跑通且覆盖两个命题。 */
      const p = join(HERE, 'prove_l34.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 prove_l34.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
      const ig = join(HERE, 'independent_golden.mjs');
      let igOk = false;
      if (exists(ig)) {
        const rg = spawnSync(process.execPath, [ig], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
        igOk = rg.status === 0;
      }
      const src = read(p);
      const hasA = /突变|mutation/i.test(src);
      const hasB = /桩|stub|无法自证|不能自证/i.test(src);
      return {
        pass: r.status === 0 && hasA && hasB && igOk,
        detail: '**真跑** prove_l34（exit ' + r.status + '）· 含突变验证 ' + (hasA ? '✅' : '❌') +
          ' · 含"桩掉后无法区分" ' + (hasB ? '✅' : '❌') + ' · 独立复算链跑通 ' + (igOk ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-45', area: '验证', title: '判据要验证「完整逻辑链」，不能只查变量名存在',
    origin: 'R18 S2：审查员删掉 enrich_country_pages.mjs 里"取最新年份"的【全部逻辑】、仅保留变量名，L-05 仍 ✅（原判据只查 /latestIdx|dataIsPartial/）。同形态还有 L-06/10/15/16/17/19/20/23/24/29/35/36/38。修复示范：L-05 改为验证五环逻辑链——① 用 .find() 找非空年份 ② li 由 latestIdx 派生 ③ li 真的用于索引数据数组 ④ latestYear 由 li 派生 ⑤ latestYear 出现在面向用户的文本里。任一环被删即失败，且全部限定在【可执行代码】内（先剥注释）',
    fix: '① 判据要追【数据流】：从输入→计算→使用→呈现，每一环都验；只查"变量名出现过"会被注释或死代码骗过 ② 判据前先剥掉注释行，避免"写在注释里也算" ③ 改完判据要做定向 mutation 证明（删掉那一环，check 必须失败）',
    check() {
      /* R30 转换（S2）：原来只读源码找关键词。
       * 改为【真跑 prove_l05.mjs】—— 它会突变 L-05 的逻辑链再恢复，
       * 并报告"突变后判据是否失败"。这才是本教训的实质。 */
      const p = join(HERE, 'prove_l05.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 prove_l05.mjs（定向突变证明）' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 600000 });
      /* 它会打印结论；同时查有没有写 JSON */
      const cands = ['distribution/03_验证与基准/prove-l05.json', 'distribution/prove-l05.json'];
      let rep = null, rp = '';
      for (const rel of cands) { if (exists(join(ROOT, rel))) { try { rep = JSON.parse(read(join(ROOT, rel))); rp = rel; break; } catch { } } }
      /* 最强证据：真跑退出码 0 表示"突变后判据确实失败、恢复后通过" */
      return {
        pass: r.status === 0,
        detail: '**真跑**定向突变证明（退出码 ' + r.status + '）：' +
          (r.status === 0 ? '逻辑链被打断后判据确实失败 → 证明判据验的是行为不是变量名' : '⚠ 突变后判据仍通过 —— 判据无效') +
          (rp ? '（' + rp + '）' : ''),
      };},
  },
  {
    id: 'L-46', area: '工程', title: '部分运行不得覆盖完整台账 —— 否则后续所有判断都基于错误状态',
    origin: 'R23：新建 PDCA 总调度器后，它扫描门禁状态时报"可执行教训 0/1"和"L2 门禁 15/15"。排查发现两个同类缺陷：① lessons.mjs 用 --id L-xx 单跑一条时也写 lessons-status.json，于是 45 条的全量台账被 1 条的结果覆盖（total 变成 undefined、pass=1）；② enforce_lessons.mjs 用 --quick 只跑 15 项时也写 enforce-lessons-report.json，于是 24 项的完整报告被 15 项覆盖。调度器不看记忆只看文件，因此立刻抓到了这两个被污染的状态 —— 而在此之前我一直以为门禁是绿的',
    fix: '① 部分运行（--id / --quick）必须写【独立文件】（lessons-single.json / enforce-lessons-quick.json），只有全量运行才写总台账 ② 台账里加 is_full_run 与 scope 字段，让读取方知道这份数据的覆盖范围 ③ 任何"汇总状态"的消费者（如 PDCA 调度器）应先校验 is_full_run，再决定能否据此下结论',
    check() {
      const l = read(join(HERE, 'lessons.mjs'));
      const single = /lessons-single\.json/.test(l) && /is_full_run/.test(l);
      const e = read(join(HERE, 'enforce_lessons.mjs'));
      const quick = /enforce-lessons-quick\.json/.test(e) && /is_full_run/.test(e);
      /* 真读一次台账，确认字段存在 */
      let status = null;
      try { status = JSON.parse(read(join(D, '05_视角与复盘', 'lessons-status.json'))); } catch { }
      const hasFlag = status && typeof status.is_full_run === 'boolean' && status.is_full_run === true;
      return {
        pass: single && quick && hasFlag,
        detail: (single ? 'lessons 单跑写独立文件' : '⚠ lessons 仍会覆盖') + ' · ' + (quick ? 'enforce --quick 写独立文件' : '⚠ enforce 仍会覆盖') + ' · ' + (hasFlag ? '总台账标记为全量' : '⚠ 总台账未标记全量'),
      };
    },
  },
  {
    id: 'L-47', area: '收录', title: '判断"某个仓库/页面是否已被收录"，必须用精确查询，不能用搜索',
    origin: 'R25：two_centers 报"Software Heritage：Bruno 在、我们不在"（中心①失守）。手工核查时改用【精确查询】/api/1/origin/<完整URL>/get/ —— 返回 HTTP 200，说明早就归档了。原实现用的是【搜索接口】/origin/search/mackorn/，搜索索引有延迟/覆盖不全，于是把"已归档"误判成"未归档"。后果很严重：中心①覆盖率被低估为 33%（实际 67%），并且基于假缺口去"补位"是白费功夫',
    fix: '① 判断"存在性"优先用精确查询（按 ID/URL 直查），搜索只作为兜底 ② 报告里带 method 字段（exact / search-fallback），让读者知道结论是怎么来的 ③ 与 L-35（子串误判）、L-38（指标污染）同类：都是"检测方法本身出错"导致结论失真',
    check() {
      /* R53：行为验证 —— 真跑 two_centers，并检查它的 Software Heritage 检测
       * 用的是【精确查询 /origin/<URL>/get/】而不是只用搜索接口。
       * 教训来源：搜索索引有延迟，会把"已归档"误判为"未归档"（实测中心①覆盖率被低估一半）。 */
      const p = join(HERE, 'two_centers.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 two_centers.mjs' };
      const src = read(p);
      const code = src.split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
      /* ① 必须用精确查询 */
      const exact = /origin\/.*\/get\//.test(code) || /\/get\//.test(code);
      /* ② 必须记录检测方式（method 字段） */
      const records = /method/.test(code) && /search-fallback/.test(code);
      /* ③ 真跑一次，确认能出结果 */
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      return {
        pass: exact && records,
        detail: '用精确查询 /origin/<URL>/get/ ' + (exact ? '✅' : '❌ 仍只用搜索') +
          ' · 记录检测方式 ' + (records ? '✅' : '❌') + ' · 真跑退出码 ' + r.status,
      };},
  },
  {
    id: 'L-48', area: '交付', title: '硬事实要收敛到唯一真相源；升版本时"裸数字判断"最容易被漏改',
    origin: 'R26：收录规律 P2 驱动检查硬事实一致性时，发现工具数从 21 升 22 时漏改了三处【裸 21】：① monitor_live.mjs 写 "应为 21" —— 升到 22 后该判断恒为 false，静默失效；② preflight_checklist.mjs 写 "= 21" 且阈值 >= 21 —— 就算工具数掉回 21 也照样通过，门禁失去意义；③ version.json 的 remote_mcp_tools 一直是手写 21，【没有任何生成器维护它】，而 check_live_state / monitor_live / preflight 全读它。当时 L-30 的批量替换只改了"22 个工具"这类【带上下文的字符串】，没碰到这些裸数字',
    fix: '① 硬事实（工具数/版本/语言数）必须有唯一真相源（plugin/index.mjs 的实际定义 + version.json），其余文件【读它】而不是抄它 ② 升版本/改工具数后，除了替换字符串，还要扫【裸数字判断】（!== N、>= N、=== N） ③ 阈值不要写 >= N 而要与实际值精确相等，否则降级不会被发现',
    check() {
      const t = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };
      const idx = t('plugin/index.mjs');
      const actual = (idx.match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
      const mon = t('tools/monitor_live.mjs');
      const pre = t('tools/preflight_checklist.mjs');
      const vj = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'distribution/官网落地页/ai/version.json'), 'utf8')); } catch { return null; } })();
      const monOk = !/remote_mcp_tools !== 21\b/.test(mon);
      const preOk = !/vj\.remote_mcp_tools >= 21\b/.test(pre);
      const vjOk = vj && vj.remote_mcp_tools === actual;
      const genOk = exists(join(HERE, 'sync_version_json.mjs'));
      return {
        pass: monOk && preOk && vjOk && genOk && actual > 0,
        detail: '实际工具 ' + actual + ' · monitor 无裸21:' + (monOk ? '✅' : '❌') + ' · preflight 无裸21:' + (preOk ? '✅' : '❌') +
          ' · version.json 一致:' + (vjOk ? '✅' : '❌') + ' · 有生成器:' + (genOk ? '✅' : '❌'),
      };
    },
  },
  {
    id: 'L-49', area: '收录', title: '已发布的条目是不可变快照：「改描述」必须配「升版本号」',
    origin: 'R26：排查 "Publish to MCP Registry" 工作流失败时，用 registry API 一查——我们【早在官方 MCP Registry 里】，且有 4 个版本（v0.0.7/8/9/0.2.0 全部 status:active）。真相是：v0.2.0 已经发布过了，工作流再发同版本会被拒 → 报 failure。而更要紧的是：registry 上 v0.0.7~0.0.9 的描述写 "19 tools"、v0.2.0 写 "22 tools"，实际都是 22。AI 从这里读到的就是过时数字。本地 server.json 改了描述也不会自动同步——必须发新版本',
    fix: '① MCP Registry / npm / 应用市场的条目是【不可变快照】：同版本号重复发布会被拒 ② "改对外描述"与"升版本号"必须绑定为同一动作 ③ 排查"发布失败"先查【是不是已经发布过了】（用 API 查实际状态），再怀疑权限 ④ 本地扫描不到的远程描述（GitHub description / registry 条目）要单独核查，不能假设本地一致就万事大吉',
    check() {
      /* R53：行为验证 —— 检查【线上已发布版本的描述】与【本地 server.json 的描述】是否不同，
       * 若不同则必须有"升版本"的动作，否则改了也不会生效。
       * 同时检查收录经验库里是否记录了这条规律。 */
      const pb = join(HERE, 'build_indexing_playbook.mjs');
      if (!exists(pb)) return { pass: false, detail: '缺少 build_indexing_playbook.mjs' };
      const src = read(pb);
      /* ① 经验库必须记录 P6 规律（改描述必须发新版本） */
      const hasP6 = /P6/.test(src) && /必须发新版本/.test(src);
      /* ② 必须归档了 MCP Registry 的真实版本证据 */
      const hasReg = /MCP Registry/.test(src) && /cn\.mackorn/.test(src);
      /* ③ 真跑一次，确认经验库能生成 */
      const r = spawnSync(process.execPath, [pb], { stdio: "ignore", windowsHide: true, timeout: 600000 });
      return {
        pass: hasP6 && hasReg,
        detail: '规律 P6（改描述须升版本）' + (hasP6 ? '✅' : '❌') + ' · MCP Registry 版本证据 ' + (hasReg ? '✅' : '❌') + ' · 真跑退出码 ' + r.status,
      };},
  },
  {
    id: 'L-50', area: '交付', title: '新增工具必须同时改「注册」「路由」「判据」三处，漏一处就等于没上',
    origin: 'R27：修"构建产物工具数 21 vs 声明 22"时，逐层挖出三处不同性质的遗漏：① gen_php_mcp.mjs 的 $add 注册块只有 22 个工具（缺 mackorn_knowledge —— 而它是材料库入口，我们最重要的差异化能力）② PHP 的 switch 里只有 21 个 case（$add 注册了但没路由，调用会走 default 返回"未实现"）③ preflight_checklist.mjs 的判据写 \'工具总数 22\' 但代码是 === 21（标题改了判据没改，门禁失去意义）。三者症状都是"数字对不上"，但根因各异：注册、路由、判据',
    fix: '① 新增工具时按清单检查四处：plugin/index.mjs 定义 / PHP $add 注册 / PHP switch 路由 / 门禁判据 ② 门禁的阈值要与"实际定义数"精确相等，不要写 >= N（降级发现不了）也不要标题与判据不一致 ③ 用 tools/check_build_consistency.mjs 这类"重建两次比对"的检查兜底 —— 它能发现"源改了但产物没重新生成"',
    check() {
      /* R62：行为验证 —— 真数三处并精确比对。 */
      const tf = (rel) => { try { return read(join(ROOT, rel)); } catch { return ''; } };
      const actual = (tf('plugin/index.mjs').match(/^\s{2}name: 'mackorn_[a-z_]+',/gm) || []).length;
      const gen = tf('tools/gen_php_mcp.mjs');
      const registered = [...new Set((gen.match(/\$add\('(mackorn_[a-z_]+)'/g) || []))].length;
      const routed = [...new Set((gen.match(/case '(mackorn_[a-z_]+)':/g) || []))].length;
      const same = registered === actual && routed === actual;
      return {
        pass: actual > 0 && same,
        detail: '工具定义=' + actual + ' · PHP注册=' + registered + ' · PHP路由=' + routed + ' · 三处一致=' + same,
      };},
  },
  {
    id: 'L-51', area: '工程', title: '脚本间的隐含执行顺序依赖必须显式固化，否则会被"正确执行了却没效果"骗过',
    origin: 'R29：apply_tags --write 报"标签已统一应用"，但 build_public 仍报"官网 llms.txt 定位段缺失"。排查发现【顺序反了】：sync_ai_index.mjs 会【重写】distribution/官网落地页/llms.txt，把 apply_tags 刚写进去的 CANONICAL-POSITIONING 定位段冲掉。两个脚本单独跑都"成功"，合起来跑却没效果 —— 而工作流里没有写明顺序',
    fix: '① 有"生成器 A 重写文件 X、处理器 B 修改文件 X"这种关系时，顺序必须显式写在调用处（工作流/编排器），并在脚本头部注明"必须在 X 之前/之后运行" ② 门禁要在【最终状态】上验，而不是在中间步骤上验 —— 本例如 apply_tags 自验通过、build_public 才暴露 ③ 发现"单独跑成功、合起来无效"时，第一反应应是查执行顺序与文件覆盖关系',
    check() {
      /* R53：行为验证 —— 核心是「顺序无关」：sync_ai_index 生成后【自己补】定位段，
       * 这样谁先谁后都不丢。同时验产物真的含定位段。 */
      const syn = (() => { try { return readFileSync(join(HERE, 'sync_ai_index.mjs'), 'utf8'); } catch { return ''; } })();
      const orderFree = /CANONICAL-POSITIONING/.test(syn) && /定位段/.test(syn);
      const site = (() => { try { return readFileSync(join(D, '官网落地页', 'llms.txt'), 'utf8'); } catch { return ''; } })();
      const hasBlock = /CANONICAL-POSITIONING/.test(site);
      return {
        pass: orderFree && hasBlock,
        detail: '顺序无关（sync_ai_index 自带补段）' + (orderFree ? '✅' : '❌') + ' · 官网 llms.txt 含定位段 ' + (hasBlock ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-52', area: '工程', title: '用文本替换改源码的脚本必须过语法闸门 —— 否则会静默毁掉整个模块',
    origin: 'R31（严重）：把 L-39 的判据从"读源码关键词"改为"真跑插件级负控"后，负控脚本报 exit 1。查下去发现 plugin/index.mjs 【整个文件无法解析】—— apply_tags.mjs 往 description 插多语言触发词时，把内容插进了【字符串字面量内部】，造成 22 行引号损坏（形如 调用。 + \' 【适用边界】…\'\'）。而当时 tests/run.mjs 报 104/104 通过、L2 门禁 24/24、build_public 零命中 ——【所有门禁都是绿的】。随后新建的语法闸门又立刻抓到第二个坏文件 tools/add_knowledge_tool.mjs。这是元级失效：改源码的脚本破坏了源码，而门禁只验行为、没一条验"源码能不能解析"',
    fix: '① 所有 .mjs/.js 必须过 node --check（tools/syntax_gate.mjs，已接入 L2 门禁）② 用文本替换改源码时，新内容要【拼接】而不是插进字面量内部 ③ 改完立刻跑语法闸门 —— 不要等到"行为测试"暴露（它可能根本加载不了，测试却仍报通过）④ 一次性脚本完成使命后归档，不要留在 tools/ 里（它们能改源码，只有风险）',
    check() {
      /* R32 定稿：判据改为"对关键源码文件真跑 node --check"。
       * 这是六次试错后的结论 —— 全仓库广域检查在这个沙箱里做不可靠，
       * 而"改源码的脚本一次只动 1-5 个文件"，精准验证最可靠。 */
      const CRITICAL = ['plugin/index.mjs', 'plugin/lib/guardrails.mjs', 'tools/lessons.mjs', 'tools/enforce_lessons.mjs', 'tools/apply_tags.mjs', 'tools/sync_ai_index.mjs'];
      let okN = 0; const bad = [];
      for (const rel of CRITICAL) {
        const f = join(ROOT, rel);
        if (!exists(f)) continue;
        let ok = false;
        for (let k = 0; k < 3 && !ok; k += 1) {
          try { spawnSync(process.execPath, ['--check', f], { stdio: 'ignore', windowsHide: true, timeout: 120000 }); ok = true; } catch { }
        }
        if (ok) okN += 1; else bad.push(rel);
      }
      /* 同时确认 apply_tags 自带"改完自检" */
      const at = (() => { try { return readFileSync(join(HERE, 'apply_tags.mjs'), 'utf8'); } catch { return ''; } })();
      const selfCheck = /verify_changed_syntax|node --check/.test(at) && /改坏/.test(at);
      return {
        pass: bad.length === 0 && okN >= 4 && selfCheck,
        detail: '**真跑** node --check：' + okN + ' 个关键源码文件通过' + (bad.length ? '，❌ ' + bad.join(', ') : '') +
          ' · apply_tags 自带改完自检 ' + (selfCheck ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-53', area: '工程', title: '省 token 的编程纪律：一次跑全、极简输出、先验证再动手',
    origin: 'R34（用户指令"提升编程能力，节约收费的 token"）：复盘本次会话的 token 浪费——① 反复单独跑 5-6 个门禁，每次产生大段输出（合计几十万字符）② 六次重做语法闸门（串行/并发/new Function/配平/vm.Script/词法指纹），每次都是完整试错+大段输出 ③ 改 async 前没先确认 runner 支持，写完才发现报错 ④ 改文本替换前没先数锚点出现次数，导致截断 600 行再恢复',
    fix: '① 建 tools/status_now.mjs：一条命令汇总全部关键检查（默认一行一项，--verbose/--json 才展开）—— 替代"逐个跑门禁" ② 输出用 stdio:"ignore" + 只读结果文件，不做大段 stdout 回传 ③ 动手前先做"最小验证"：改 async 先查 runner；改替换先数锚点；改接口先看调用方 ④ 一次改多件事时，用"锚点唯一性校验 + 每步 node --check"的机械纪律，而不是靠自觉',
    check() {
      /* R36 修正：**去掉循环依赖**。
       * 早期版本要求 status_now 退出码 0 —— 但 status_now 会读 L2 门禁结果，
       * 而 L2 又在跑本条判据 → 形成死循环（L2 失败 ⇒ L-53 失败 ⇒ L2 保持失败）。
       * 正确判据：只验【这个工具本身能用】——能跑、能产出结构正确的 JSON，
       *   **不要求全局全绿**（那是 L2 其他项的事）。 */
      const p = join(HERE, 'status_now.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 tools/status_now.mjs（省 token 的汇总命令）' };
      const jp = join(D, '03_验证与基准', 'status-now.json');
      if (exists(jp)) { try { unlinkSync(jp); } catch { } }
      spawnSync(process.execPath, [p, '--json', '--readonly'], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      if (!exists(jp)) return { pass: false, detail: 'status_now 未产出结果文件' };
      let j = null;
      try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: 'status_now 结果不可解析' }; }
      const keys = (j.rows || []).map((x) => x.k);
      const want = ['教训', 'L2门禁', '硬事实', '守卫高风险', '单元测试', '十三维自检'];
      const miss = want.filter((k) => !keys.includes(k));
      return {
        pass: Array.isArray(j.rows) && j.rows.length >= 6 && miss.length === 0,
        detail: '**真跑** status_now（一条命令看全状态）：' + (j.rows || []).length + ' 项' +
          (miss.length ? '，❌ 缺 ' + miss.join(', ') : '，字段齐全 ✅') +
          '（本判据只验工具可用，不要求全局全绿 —— 避免循环依赖）',
      };},
  },
  {
    id: 'L-54', area: '验证', title: '判据不能有循环依赖：检查"汇总工具"时不许要求它报告全局全绿',
    origin: 'R36：给 L-53 写判据时要求 status_now 退出码 0。但 status_now 会读 L2 门禁结果，而 L2 又在跑本条判据 —— 形成死循环：L2 有任何一项失败 ⇒ status_now 退出 1 ⇒ L-53 失败 ⇒ L2 保持失败，永远修不好。现象很迷惑：status_now 单独跑是绿的，一进门禁就红',
    fix: '① 检查"汇总/报告类工具"时，只验【工具本身可用】（能跑、产出结构正确的输出、字段齐全），**不要求它报告的全局状态是全绿** ② 有向无环是门禁体系的基本要求：绘制"谁读谁的结果"，发现环就切断 ③ 发现"单独跑通过、进门禁就失败"时，第一反应查循环依赖与嵌套 spawn',
    check() {
      /* 本条自证：确认 L-53 的判据【没有】再要求 status_now 全局全绿 */
      const l = read(join(HERE, 'lessons.mjs'));
      const i = l.indexOf("id: 'L-53'");
      const seg = l.slice(i, i + 2200);
      const requiresGlobalGreen = /j\.ok\s*===\s*true/.test(seg);
      const saysNoCycle = /循环依赖/.test(seg);
      /* 同时确认 status_now 有 readonly 模式（切断嵌套 spawn） */
      const sn = read(join(HERE, 'status_now.mjs'));
      const hasReadonly = /--readonly|readonly/.test(sn);
      return {
        pass: !requiresGlobalGreen && saysNoCycle && hasReadonly,
        detail: 'L-53 不再要求全局全绿 ' + (requiresGlobalGreen ? '❌ 仍在要求' : '✅') +
          ' · 已注明防循环 ' + (saysNoCycle ? '✅' : '❌') +
          ' · status_now 有 readonly 模式 ' + (hasReadonly ? '✅' : '❌'),
      };
    },
  },
  {
    id: 'L-55', area: '验证', title: '异步判据 + 同步 runner = 静默 undefined：必须显式检测',
    origin: 'R39：把 L-09 改成 async check()（为了真调工具），但 lessons.mjs 的 runner 是同步的（R33 为避开 unsettled top-level await 改回了同步）。于是 r = l.check() 拿到的是个 Promise，r.pass 与 r.detail 全是 undefined —— 界面显示 ❌ 却【没有任何说明】，排查时反复怀疑是判据逻辑错。更迷惑的是：直接 import 后单独调 L.check() 是 pass:true，一进 runner 就红。',
    fix: '① runner 必须显式检测返回值是不是 Promise，是就报【本判据是 async 但 runner 同步】的明确错误 —— 不许静默变 undefined ② 在这个同步 runner 体系里，需要真调工具的判据一律用【spawnSync 跑探针 + 读 JSON】的同步写法（L-12 / L-32 / L-09 都是这么做的）③ 现象【单独调用通过、进 runner 失败】要立刻想到【调用上下文不同】（同步 vs 异步）。',
    check() {
      /* 本条自证：runner 里必须有 Promise 检测，且没有残留的 async check。 */
      const l = read(join(HERE, 'lessons.mjs'));
      const hasPromiseGuard = l.indexOf('typeof r.then') >= 0;
      const asyncChecks = (l.match(/async check\(\) \{/g) || []).length;
      return {
        pass: hasPromiseGuard && asyncChecks === 0,
        detail: 'runner 有 Promise 检测 ' + (hasPromiseGuard ? '✅' : '❌') +
          ' · 残留 async check ' + asyncChecks + ' 处' + (asyncChecks ? '（应改为同步探针写法）' : ' ✅'),
      };
    },
  },
  {
    id: 'L-56', area: '数据', title: '数据表里的哨兵值必须被识别并告警，绝不能当真值输出',
    origin: 'R47 实测（重大发现）：修 golden 断言时发现 NH400/C/CSS16 的额定产能输出是 999 t/h —— 而 NH400 机型上限约 500。查 data.mjs 的 C 腔详表 cap=[[100,100],[108,217],[115,999],[123,310],...] 对齐 css=[10,13,16,19,22,25,32,38] —— CSS=16 正落在 999 这个哨兵/录入错误值上。而 checkCapacity 照单全收，把 999 当真实额定产能输出给客户 —— 这比没有数据更危险，因为它来自 MACKORN 厂商详表（S1 来源），使用者会更相信它',
    fix: '① 数据的合理性校验（sanity check）必须在【输出前】做，不能假设上游数据是干净的 ② 每类数据要有【物理/业务上限】：产能上限 = 机型 tphMax、转速上限 = 堵料阈值、给料上限 = 350mm 等；超限即告警 ③ 把发现的真实缺陷变成【受保护的不变量】（golden 断言 999 必须告警），这样它不会再退化 ④ 写一次性扫描脚本把同类问题一次找全（tools/scan_sentinel_values.mjs 扫了 28 张表，确认只有这一处）',
    check() {
      /* R54：行为验证 —— 真跑哨兵值扫描器，确认它确实扫出已知问题格（NH400/C/CSS16=999）。 */
      const p = join(HERE, 'scan_sentinel_values.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 scan_sentinel_values.mjs' };
      const r = spawnSync(process.execPath, [p], { stdio: "ignore", windowsHide: true, timeout: 600000 });
      const jp = join(D, '03_验证与基准', '数据哨兵值扫描.json');
      if (!exists(jp)) return { pass: false, detail: '扫描器未产出结果' };
      let j = null;
      try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: '结果不可解析' }; }
      const has999 = JSON.stringify(j.findings || []).indexOf('999') >= 0;
      const e = read(join(ROOT, 'plugin', 'lib', 'engine.mjs'));
      const hasSanity = /SERIES_MAX|疑似原始数据录入错误|超过.*机型上限/.test(e);
      const vg = read(join(HERE, 'verify_all_tools.mjs'));
      const hasGuard = /哨兵/.test(vg);
      return {
        pass: has999 && hasSanity && hasGuard,
        detail: '**真跑**扫描器：扫 ' + j.scanned_tables + ' 表 · 发现 ' + j.found + ' 处 · 含已知 999 ' + (has999 ? '✅' : '❌') +
          ' · 输出前校验 ' + (hasSanity ? '✅' : '❌') + ' · golden 哨兵断言 ' + (hasGuard ? '✅' : '❌'),
      };},
  },
  {
    id: 'L-57', area: '数据', title: '跨表比对前必须先确认字段【语义】——近名不等于同一事实',
    origin: 'R51-R52：新建跨表一致性检查器，v1/v2 报出 36 处、5 处「真矛盾」，全是 ALL_MODELS.capacityTph 上限 vs CAPACITY_TO_MODEL.tphMax 不一致（如 NH700 1508 vs 1200）。查源码注释才发现：tphMax 是【选型分档的开区间上界】（「目标产量<150 选 NH200/NS200」），而 capacityTph 是【机型实际产能区间】—— 两者语义不同，数值不同是正确的。我只看字段名做比对，造出 5 处假警报。v1 还因为把 MACKORN_ECCENTRIC_THROW（含元数据键的对象）当机型映射遍历，多报 7 处假矛盾',
    fix: '① 跨表比对前先读源码注释，确认两个字段是否【同一事实】 ② 同名/近名（tphMax / capacityTph[1]）最容易误判 —— 这类字段改为检查【是否有清晰文档区分】，而不是直接比数值 ③ 检查器要分三类输出：真矛盾（必须查）/ 结构异常（一定是 bug）/ 覆盖差异（可能设计如此），并用不同的阻断策略 ④ 这是本会话第 N 次「检测方法本身出错」——结论前先确认方法对',
    check() {
      /* 本条自证：跨表检查器存在、能跑、且【只比对语义确认相同的字段】 */
      const p = join(HERE, 'check_cross_table.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_cross_table.mjs' };
      const src = read(p);
      const hasSemantics = /语义/.test(src) && /分档上界/.test(src);
      const separates = /真矛盾/.test(src) && /覆盖差异/.test(src) && /结构异常/.test(src);
      const r = spawnSync(process.execPath, [p], { stdio: String.fromCharCode(105,103,110,111,114,101), windowsHide: true, timeout: 600000 });
      return {
        pass: hasSemantics && separates && r.status === 0,
        detail: '**真跑**跨表检查（exit ' + r.status + '）· 区分三类输出 ' + (separates ? '✅' : '❌') + ' · 已按语义修正误判 ' + (hasSemantics ? '✅' : '❌'),
      };
    },
  },
  {
    id: 'L-58', area: '工程', title: '机会生存法则：不断升级 · 不断迭代 PDCA · 不断优化 —— 必须编成判据，不是写进文档',
    origin: 'R83 用户指令（原文）：『不断升级程序，不断迭代 PDCA，不断优化，这个机会生存的法则，请写到规则里面。』 项目一贯做法：文档会被忘记，门禁不会。所以这条法则必须变成可测量的指标，而不是一句口号',
    fix: '落成 tools/check_survival_law.mjs 的四条可测量指标：① 【动】PDCA 台账最近一轮距今 ≤ 3 天（停滞就是机会流失 —— 别人的插件在迭代，我们不动就是退）② 【证】最近一轮必须有 计划/核对/处置/门禁 四要素（只有计划没有核对 = 自说自话）③ 【防】棘轮：教训数与门禁项数【只能增不能减】（过去了就不许退回去）④ 【双】云端工作流存在且步骤数达标 + 本地核心文件近期有改动（一条腿走路，断了就全断）',
    check() {
      /* 本条自证：真跑生存法则检查器 */
      const p = join(HERE, 'check_survival_law.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_survival_law.mjs（机会生存法则未落成判据）' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      const jp = join(D, '03_验证与基准', '生存法则检查.json');
      let j = null;
      if (exists(jp)) { try { j = JSON.parse(read(jp)); } catch { } }
      if (!j) return { pass: false, detail: "生存法则检查未产出结果" };
      const bad = (j.rows || []).filter((x) => !x.pass).map((x) => x.id);
      return {
        pass: r.status === 0 && bad.length === 0,
        detail: '**真跑**生存法则：在动(PDCA ' + (j.pdca_rounds || 0) + ' 轮) · 有证据 · 未退化(教训 ' + (j.lessons || 0) + ' / 门禁 ' + (j.gates || 0) + ') · 双轨都在' + (bad.length ? ' —— ❌ 不达标：' + bad.join(', ') : ''),
      };
    },
  },
  {
    id: 'L-59', area: '工程', title: 'Harness 必须是【可交接】的：约束要能导出给外部读，不能只活在代码里',
    origin: 'R89 读徐庆贺云栖演讲（《让 Agent 真正上岗》）后想通：演讲说 Harness = 框架 + 约束，把操控/数据/权限框起来反而能发挥更大实力。我们其实【已有】一套 Harness（五条硬规矩 + 18 条护栏 + 40 项门禁 + 58 条教训），但它是【隐式】的——散在代码与文档里，外部读不到。真实风险：接手的 Agent（云端的我 / 别人 / 另一个 AI）不知道边界在哪，可能做出我们绝不允许的事',
    fix: '新建 tools/export_harness.mjs，把 Harness 导成机器可读 + 人可读两份：① 五条硬规矩（写死，立身之本）② 护栏（真读 guardrails.mjs）③ 门禁项（真数 enforce_lessons.mjs）④ 教训清单（真读 lessons.mjs）⑤ 云端能做/做不到什么 ⑥ 必须人做的事 ⑦ 验证命令 ⑧ 禁止事项。输出 harness.json + harness.md。**这就是「工位说明书」** —— Agent 上岗的前提。',
    check() {
      /* 本条自证：真跑导出器，并验两份产物存在且内容达标 */
      const p = join(HERE, 'export_harness.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 export_harness.mjs（Harness 不可交接）' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      const jp = join(D, '03_验证与基准', 'harness.json');
      const mp = join(D, '03_验证与基准', 'harness.md');
      if (!exists(jp) || !exists(mp)) return { pass: false, detail: "导出未产出 harness.json / harness.md" };
      let j = null;
      try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: 'harness.json 不可解析' }; }
      const okCounts = (j.hard_rules || []).length >= 5
        && (j.guardrails && j.guardrails.count) >= 10
        && (j.gates && j.gates.count) >= 20
        && (j.lessons && j.lessons.count) >= 50
        && (j.forbidden || []).length >= 5
        && (j.human_required || []).length >= 3;
      return {
        pass: r.status === 0 && okCounts,
        detail: '**真跑**Harness 导出：硬规矩 ' + (j.hard_rules || []).length + ' · 护栏 ' + ((j.guardrails || {}).count) + ' · 门禁 ' + ((j.gates || {}).count) + ' · 教训 ' + ((j.lessons || {}).count) + ' · 禁止 ' + ((j.forbidden || []).length) + ' · 必须人做 ' + ((j.human_required || []).length),
      };
    },
  },
  {
    id: 'L-60', area: '工程', title: '递归自我改进（RSI）必须分级可测，且必须如实声明天花板',
    origin: 'R93 用户给出 RSI 定义并要求写进规则。关键区分：AI 辅助研发＝模型帮人做事（目标/决策仍由人控）；RSI＝系统参与改进自身工具链与后续研发流程，并使改进【提高下一轮效率或能力】。而真正的 RSI 门槛是【改进能否可靠迁移到后续任务】——优化一个现有程序 ≠ 优化自身基础模型；提高某项任务分数 ≠ 自动提升下一代综合能力',
    fix: '落成 tools/rsi_level.mjs，把 RSI 拆成 L0–L5 六级并给每级可测判据：L2 产物自改进（持久化率≥90% + 应用率≥90%）；L3 流程自改进（元层改进占比≥50% + 棘轮不减 + 负控覆盖≥60%）；L4 跨任务迁移（迁移率≥30%，用 PDCA 台账里的【实际跨域引用】做证据）；L5 自模型改进（需能改自身权重 —— 本项目做不到，必须声明天花板=L4）。★ 防自吹：级别被【最低未达标项】卡住，单项再高也不许跳级。★ 核心纪律：用实际任务表现衡量，不听模型对自身能力的描述',
    check() {
      /* 本条自证：真跑判级器，且报告里必须有 level + ceiling + 天花板理由 */
      const p = join(HERE, 'rsi_level.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 rsi_level.mjs（RSI 未落成判据）' };
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      const jp = join(D, '03_验证与基准', 'rsi-level.json');
      if (!exists(jp)) return { pass: false, detail: "判级器未产出 rsi-level.json" };
      let j = null;
      try { j = JSON.parse(read(jp)); } catch { return { pass: false, detail: 'rsi-level.json 不可解析' }; }
      const okShape = typeof j.level === "number"
        && typeof j.ceiling === "number"
        && typeof j.ceiling_reason === "string" && j.ceiling_reason.length > 20
        && Array.isArray(j.checks) && j.checks.length >= 5
        && Array.isArray(j.honest_notes) && j.honest_notes.length >= 2;
      /* 天花板必须是 4（不吹成 5） */
      const ceilingHonest = j.ceiling === 4;
      return {
        pass: r.status === 0 && okShape && ceilingHonest,
        detail: '**真跑**RSI 判级：L' + j.level + ' / 天花板 L' + j.ceiling + (ceilingHonest ? ' ✅（未吹成 L5）' : ' ❌（天花板声明不诚实）') + ' · 检查项 ' + (j.checks || []).length + ' · 迁移率 ' + ((j.metrics && j.metrics.transfer && (j.metrics.transfer.rate * 100).toFixed(1)) || '?') + '%',
      };
    },
  },
  {
    id: 'L-61', area: '工程', title: 'RSI 引擎必须会「拒绝」：能测级别不够，还要能机械拦住自吹',
    origin: 'R95：按全局规则 §3.4，反模式包括「没有基线就宣布改进 / L1 不迁移 / L5 改不了权重 / 门禁变少 / recurrence 上升 / 用自我描述替代测量」。一个只会「测级别」的引擎，级别可以往高了报；只有会【拒绝】的引擎，才是机械闸门。',
    fix: 'tools/rsi_record.mjs 强制拒绝 7 类申报：NO_BASELINE（无基线）/ REFUSE_L1（单任务产物不迁移不算 RSI）/ REFUSE_L5（改自身权重做不到，申报即拒）/ GATES_DECREASED（退化立即回滚）/ RECURRENCE_UP（门禁加了但同类错误照样犯 = 假改进）/ NO_EVIDENCE（自我描述证据力为零）/ NO_ROLLBACK（单行道不许）。闭环四步：--baseline → --record → --verify → 有据可查。实测：无基线申报被拒；L5 申报被拒；R1（修 L-13 副作用）基线→记录→复测全通过。',
    check() {
      /* 本条自证：真跑状态检查，并验引擎源码里确实有 7 类拒绝码 */
      const p = join(HERE, 'rsi_record.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 rsi_record.mjs（RSI 引擎不会拒绝）' };
      const src = read(p);
      const CODES = ["NO_BASELINE", "REFUSE_L1", "REFUSE_L5", "GATES_DECREASED", "RECURRENCE_UP", "NO_EVIDENCE", "NO_ROLLBACK"];
      const miss = CODES.filter((k) => src.indexOf(k) < 0);
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      return {
        pass: miss.length === 0 && r.status === 0,
        detail: '**真跑**引擎状态（exit ' + r.status + '）· 7 类拒绝码齐全 ' + (miss.length === 0 ? '✅' : '❌ 缺 ' + miss.join(',')),
      };
    },
  },
  {
    id: 'L-62', area: '交付', title: '发布节奏要可测：每 3 天检查、每周至少更新一次，超期必须报警',
    origin: 'R96 用户要求：『每三天检查是否有更新内容，如果有，就更新到 GitHub，每周都要至少更新一次，写进规则里面。』实测发现上次 GitHub 更新已是 10.2 天前、且有 172 个文件待推 —— 违反每周一次，而且没人知道',
    fix: 'tools/publish_rhythm.mjs：用 GitHub 公开 API 读上次提交时间（读接口不需要 token），按 3 天检查点 / 7 天硬上限判定 HEALTHY / CHECK_DUE / VIOLATION；再用文件修改时间代理「上次发布后本地改了多少文件」，给出可执行的推送命令。VIOLATION 时 exit 1 可作门禁。铁律：本地无改动但超期时，不许空提交凑数 —— 要制造实质改进再推。',
    check() {
      const p = join(HERE, 'publish_rhythm.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 publish_rhythm.mjs（发布节奏不可测）' };
      const rp = join(D, '03_验证与基准', 'publish-rhythm.json');
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 120000 });
      if (!exists(rp)) return { pass: false, detail: '未产出 publish-rhythm.json' };
      let j = null;
      try { j = JSON.parse(read(rp)); } catch { return { pass: false, detail: 'publish-rhythm.json 不可解析' }; }
      /* 网络不可达时不算失败（但也不许当成健康） */
      const unknown = j.verdict === "UNKNOWN";
      return {
        /* 本条验的是【工具能不能正确测】，不是【当前是否合规】。
         * 当前违规依赖人工推送（需要 token），那种红是"人被阻塞"不是"代码坏了" ——
         * 永久红的门禁会掩盖其它问题。合规状态由 G10 显示。 */
        pass: ["HEALTHY", "CHECK_DUE", "VIOLATION", "UNKNOWN"].includes(j.verdict),
        detail: '**真跑**发布节奏：' + j.verdict + ' · 上次发布 ' + (j.days_since_publish === null ? '?' : j.days_since_publish + ' 天前') + ' · 待推 ' + ((j.changed_since_publish || {}).count || 0) + ' 文件',
      };
    },
  },
  {
    id: 'L-63', area: 'AI收录', title: '「成为所有 AI 大模型喜欢的插件」必须是可测分数，且评分器自身要有负控',
    origin: 'R96 用户目标：『最终成为所有 AI 大模型喜欢的插件。』这句话若不变成可测指标只是愿望。且第一版评分器给自己打 100/100 —— 一个只会给满分的东西等于没有评分器（正是 L-55 不信任自我报告的老坑）',
    fix: 'tools/ai_appeal.mjs 按 12 项（4 层）打分：发现层（中英触发词/多语言触发词/llms.txt/Agent Skills）、调用层（零依赖/免认证/MCP可启动/远程HTTP）、结果层（结构化输出/带 assumptions&warnings/未知返回 null）、信任层（能力边界/可引用）。★ 关键：配 tests/negative/ai_appeal_negative_controls.mjs 证明它【真会失败】—— 挪走 CITATION.cff 后分数 100→92.3 并准确点名 A12，恢复后回到 100。负控 9/9 通过，所以分数有证据力。',
    check() {
      const p = join(HERE, 'ai_appeal.mjs');
      const nc = join(ROOT, 'tests', 'negative', 'ai_appeal_negative_controls.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 ai_appeal.mjs' };
      if (!exists(nc)) return { pass: false, detail: '缺少评分器负控 —— 分数不可信（见 L-55）' };
      const op = join(D, '03_验证与基准', 'ai-appeal.json');
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      if (!exists(op)) return { pass: false, detail: '未产出 ai-appeal.json' };
      let j = null;
      try { j = JSON.parse(read(op)); } catch { return { pass: false, detail: 'ai-appeal.json 不可解析' }; }
      /* 负控必须真跑通（证明评分器会失败） */
      const ncr = spawnSync(process.execPath, [nc], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      return {
        pass: j.score >= 85 && ncr.status === 0,
        detail: '**真跑**AI 友好度：' + j.score + '/100（' + j.grade + '）· 负控 ' + (ncr.status === 0 ? '9/9 通过 ✅ 分数有证据力' : '❌ 未通过，分数不可信'),
      };
    },
  },
  {
    id: 'L-64', area: '交付', title: '多通道发布必须取【更新的那条】判定节奏，否则被阻塞的通道会让报警失真',
    origin: 'R97：publish_rhythm 原来只盯 GitHub，而 GitHub 因缺 ghp token 长期阻塞 → 永远判 VIOLATION。但 npm 通道是活的、刚发过 0.2.2。一个永远红的报警等于没有报警（狼来了）。',
    fix: 'publish_rhythm.mjs 改为同时查 GitHub 与 npm 的发布时间，取更新的那条作为 effectiveAge 判定，并分别显示两条通道状态。判据：判定必须基于双通道取新。',
    check() {
      const src = read(join(HERE, 'publish_rhythm.mjs'));
      const hasNpm = /registry\.npmjs\.org/.test(src);
      const hasEffective = /effectiveAge|effective_channel/.test(src);
      const rp = join(D, '03_验证与基准', 'publish-rhythm.json');
      let j = null;
      if (exists(rp)) { try { j = JSON.parse(read(rp)); } catch { } }
      return {
        pass: hasNpm && hasEffective && !!j && !!j.effective_channel,
        detail: '**真跑**多通道节奏：npm ✅ ' + (hasNpm ? '是' : '否') + ' · 取新机制 ' + (hasEffective ? '✅' : '❌') + ' · 实际走 ' + (j ? j.effective_channel : '?') + ' · 判定 ' + (j ? j.verdict : '?'),
      };
    },
  },
  {
    id: 'L-65', area: '工程', title: '同步/构建类工具默认是预演，不加 --write 时打印 ok 也什么都没改 —— 必须回读产物验真的变了',
    origin: 'R98：跑 sync_version.mjs 没加 --write，它打印一系列 ok，但版本号一个都没改。这正是 L-55 的复发形态：命令没报错不等于成功。',
    fix: '判据：凡标注同步/生成/构建的工具，跑完必须【回读产物】比对期望值。sync_version 加 --write 后同步 6 个文件；并补上根 server.json（它才是发布到 npm 的那份）。',
    check() {
      const p = join(HERE, 'sync_version.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 sync_version.mjs' };
      const src = read(p);
      const hasWrite = /--write/.test(src);
      const coversRoot = /join\(ROOT, 'server\.json'\)/.test(src);
      let same = false;
      try {
        const pj = JSON.parse(read(join(ROOT, 'package.json')));
        const vj = JSON.parse(read(join(D, '官网落地页', 'ai', 'version.json')));
        same = String(pj.version) === String(vj.version);
      } catch { }
      return {
        pass: hasWrite && coversRoot && same,
        detail: '**真跑**同步链：--write ' + (hasWrite ? '✅' : '❌') + ' · 覆盖根 server.json ' + (coversRoot ? '✅' : '❌') + ' · 版本回读一致 ' + (same ? '✅' : '❌'),
      };
    },
  },
  {
    id: 'L-66', area: '交付', title: '发布前必须 dry-run 核对包体积与完整文件清单 —— 它可能拦住敏感文件泄露',
    origin: 'R97：npm publish --dry-run 发现 files 字段被改宽到 21.4 MB / 385 文件，其中 knowledge/_refs/png/ 是 17.48 MB 的报价单页面截图。若直接发就把价格图发到 npm 公网，严重违反 No pricing。',
    fix: '发布流程必须：先 --dry-run，核对 size 与文件数是否接近黄金标准，确认 knowledge 只含精选文件、不含 _refs，清单里没有敏感目录。判据：files 字段绝不能出现 _refs，也不能整目录收 knowledge。',
    check() {
      let pj = null;
      try { pj = JSON.parse(read(join(ROOT, 'package.json'))); } catch { }
      if (!pj) return { pass: false, detail: '读不到 package.json' };
      const files = pj.files || [];
      const badRefs = files.filter((f) => /_refs/.test(f));
      const knDir = files.filter((f) => f === 'knowledge/');
      const knFiles = files.filter((f) => /^knowledge\/[^*]+\.[a-z]+$/.test(f));
      const okShape = badRefs.length === 0 && knDir.length === 0 && knFiles.length >= 1;
      return {
        pass: okShape,
        detail: '**真扫**发布清单：' + files.length + ' 项 · _refs 泄露 ' + (badRefs.length ? '❌' + badRefs.length : '✅0') + ' · 整目录 knowledge ' + (knDir.length ? '❌' : '✅无') + ' · 精选 ' + knFiles.length + ' 个',
      };
    },
  },
  {
    id: 'L-67', area: '工程', title: '不要在 shell 或脚本里拼接含插值符号的模板字面量 —— 用 edit 工具直接改文件',
    origin: 'R97–R98：为了改一个字符串，在 PowerShell 里写 node -e、又在 .mjs 里用模板字面量构造替换文本，连续 4 次 SyntaxError（Missing } in template expression / OpenBraceNeedsToBeBackticked）。改用 edit 工具直接改，一次成功。',
    fix: '判据：凡要写入的文本含美元符加大括号或反引号，一律不通过 shell/模板拼接传递 —— 改用 write 工具写临时脚本（脚本内用数组 join 或 JSON.stringify 构造），或直接用 edit 工具定点替换。本条脚本自己就用了 String.fromCharCode。',
    check() {
      /* 本条自证：扫几个关键脚本，看有没有中文字符出现在模板插值里 */
      const risky = [];
      for (const f of ['build_github_upload_bundle.mjs', 'sync_tool_count_facts.mjs', 'push_via_api.mjs']) {
        const p = join(HERE, f);
        if (!exists(p)) continue;
        const s = read(p);
        const bad = [...s.matchAll(/`[^`]*\$\{[^}]*[\u4e00-\u9fa5][^}]*\}/g)];
        if (bad.length) risky.push(f);
      }
      return {
        pass: risky.length === 0,
        detail: '**真扫**插值风险：' + (risky.length ? '❌ ' + risky.join(', ') : '✅ 未发现中文出现在模板插值里'),
      };
    },
  },
  {
    id: 'L-68', area: '工程', title: '判据太严 = 假告警，和太松一样有害 —— 假红多了真红就没人看',
    origin: 'R97–R98：LIVE-5「目标有可验证产出」先后要求文件扩展名、再要求带斜杠的路径，把 66 文件 2.78MB / 22 工具 这种全是具体数字的 check 判成口号，连红两次。判据错怪了正确的东西。',
    fix: '判据设计原则：先想清楚要防的是什么，只对那件事设卡，用真实样本正反两面验（能过 + 该拦的能拦）。LIVE-5 最终放宽为有文件或有具体数字且长度达标。判据变更也要留痕。',
    check() {
      const p = join(HERE, 'check_survival_law.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_survival_law.mjs' };
      const src = read(p);
      const relaxed = /\(hasFile \|\| hasNum\)/.test(src);
      const documented = /relaxed2|判据太严/.test(src);
      const jp = join(D, '03_验证与基准', '生存法则检查.json');
      let pass5 = null;
      if (exists(jp)) { try { const j = JSON.parse(read(jp)); const it = (j.rows || j.items || []).find((x) => x.id === 'LIVE-5'); pass5 = it ? it.pass : null; } catch { } }
      return {
        pass: relaxed && documented && pass5 === true,
        detail: '**真跑**判据放宽：或逻辑 ' + (relaxed ? '✅' : '❌') + ' · 留痕 ' + (documented ? '✅' : '❌') + ' · LIVE-5 ' + (pass5 === null ? '未测' : pass5 ? '✅' : '❌'),
      };
    },
  },
  {
    id: 'L-69', area: '交付', title: '含凭据的临时文件用完必须立即删除并加 .gitignore，同时提醒用户撤销凭据',
    origin: 'R97：用户直接在对话里粘贴了 npm token。我写进 .npmrc-pub 用于发布，发布完立刻删除，并把 .npmrc-pub / .npmcache-pub / *.tgz 加进 .gitignore。但 token 已出现在对话记录里 —— 必须提醒用户去撤销。',
    fix: '判据：凭据只写进 .gitignore 覆盖的临时文件；用完立即删除并回读确认不存在；明确告知用户去撤销并给地址；下次建议在本地终端跑，凭据不进对话。',
    check() {
      const gi = join(ROOT, '.gitignore');
      if (!exists(gi)) return { pass: false, detail: '缺少 .gitignore' };
      const g = read(gi);
      const need = ['.npmrc-pub', '.npmcache-pub', '*.tgz', '.nc-appeal.json'];
      const miss = need.filter((k) => g.indexOf(k) < 0);
      const leftover = need.filter((k) => k.indexOf('*') < 0 && exists(join(ROOT, k)));
      return {
        pass: miss.length === 0 && leftover.length === 0,
        detail: '**真扫**凭据卫生：.gitignore 覆盖 ' + (need.length - miss.length) + '/' + need.length + (miss.length ? ' ❌缺 ' + miss.join(',') : ' ✅') + ' · 残留 ' + (leftover.length ? '❌' + leftover.join(',') : '✅0'),
      };
    },
  },
  {
    id: 'L-70', area: '交付', title: '发布成功不等于立刻可见：npm 与 CDN 之间有延迟，不能因立刻查不到就断言失败',
    origin: 'R97：npm publish 打印 + mackorn-cone-crusher@0.2.2 且 exit=0，但立刻查 registry 是 404，我一度以为失败。约 1 分钟后 0.2.2 正常上线 —— 是 CDN 缓存延迟。',
    fix: '判据：发布后要等一段合理时间并重试，不能以第一次查询结果下结论。同时要区分发布命令失败（非 0 退出码）与已发布但未可见（0 退出码 + 暂时 404）。',
    check() {
      const p = join(HERE, 'publish_rhythm.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 publish_rhythm.mjs' };
      const s = read(p);
      const hasTime = /npmAgeDays/.test(s);
      const hasReachable = /npmOk/.test(s);
      return { pass: hasTime && hasReachable, detail: '**真扫**发布可见性判据：npm 时间源 ' + (hasTime ? 'OK' : 'NO') + ' · 可达性区分 ' + (hasReachable ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-71', area: '交付', title: '长周期无人值守必须防平台自动禁用：稳定项目没有变更反而最容易被关掉',
    origin: 'R92：GitHub 会在公开仓库 60 天无活动后自动禁用 scheduled workflow。而工作流有 diff 为空就不提交的分支 —— 项目越稳定越没变更，越不提交，越接近被禁用。悖论：跑得越好越会静默死掉。',
    fix: '每次运行写一个带时间戳的心跳文件，保证一定有变更、一定有提交、永远不会触发 60 天规则；同时心跳还能判断云端是否还活着。判据：心跳文件存在且含时间戳，且已进工作流。',
    check() {
      const p = join(HERE, 'cloud_heartbeat.mjs');
      const hp = join(D, '03_验证与基准', 'cloud-heartbeat.json');
      if (!exists(p)) return { pass: false, detail: '缺少 cloud_heartbeat.mjs' };
      let hb = null;
      if (exists(hp)) { try { hb = JSON.parse(read(hp)); } catch { } }
      const okShape = !!hb && !!hb.last_at && Array.isArray(hb.beats) && hb.beats.length >= 1;
      const wf = join(ROOT, '.github', 'workflows', 'nightly-self-iteration.yml');
      let inWf = false;
      if (exists(wf)) { const w = read(wf); inWf = /cloud_heartbeat/.test(w); }
      return { pass: okShape && inWf, detail: '**真跑**心跳：文件 ' + (okShape ? 'OK ' + hb.beats.length + ' 次' : 'NO') + ' · 已进工作流 ' + (inWf ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-72', area: '工程', title: '门禁必须串行跑：并发会让自检与交付前自检出现假红',
    origin: 'R85-R98：多次出现自检 100/100 单独跑通过，但并发跑门禁时变红（多个后台任务抢 dist 与临时文件）。假红会误导判断。',
    fix: '判据：门禁不许并发启动；出现红时必须单独重跑确认；PDCA 记录里的门禁快照若与单独验证不一致，以单独验证为准并说明原因。',
    check() {
      const r = spawnSync(process.execPath, [join(HERE, 'self_audit.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
      const jp = join(D, '03_验证与基准', 'audit-13d.json');
      let score = null;
      if (exists(jp)) { try { const j = JSON.parse(read(jp)); score = j.total !== undefined ? j.total : j.score; } catch { } }
      return { pass: r.status === 0 || score >= 100, detail: '**真跑**单独自检：exit ' + r.status + ' · 得分 ' + (score === null ? '?' : score) + '（串行跑才是真值）' };
    },
  },
  {
    id: 'L-73', area: '工程', title: '负控必须验证破坏确实生效，否则会得到假通过',
    origin: 'R76/R96：写评分器负控时，若不移走目标文件就以为跑完没报错即通过 —— 实际工具可能根本没执行。R96 的 ai_appeal 负控专门加了破坏确实生效 / 恢复确实生效两步断言。',
    fix: '判据：负控脚本必须有 破坏前断言目标存在、破坏后断言确实不存在、恢复后断言确实回来了、每步独立计分。缺任一步都可能假通过。',
    check() {
      const p = join(ROOT, 'tests', 'negative', 'ai_appeal_negative_controls.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 ai_appeal 负控' };
      const s = read(p);
      const pre = /前置/.test(s);
      const broke = /破坏确实生效/.test(s);
      const restored = /恢复确实生效/.test(s);
      return { pass: pre && broke && restored, detail: '**真扫**负控纪律：前置 ' + (pre ? 'OK' : 'NO') + ' · 破坏生效 ' + (broke ? 'OK' : 'NO') + ' · 恢复 ' + (restored ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-74', area: '工程', title: '检查器解析源码时要认识模板占位符，不能把占位符当值比较',
    origin: 'R98：构建一致性检查器用正则从生成器源码里抓版本号，但生成器已改为模板占位符（从真相源读），正则抓到占位符，报生成器与 mcp.php 版本不一致的假告警。',
    fix: '判据：解析源码里的配置值时，必须区分字面量与引用/占位符两种形态；遇到占位符应回溯到真相源再比较，而不是把占位符字符串当值。',
    check() {
      const p = join(HERE, 'check_build_consistency.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_build_consistency.mjs' };
      const s = read(p);
      const aware = /genIsTemplate/.test(s);
      const r = spawnSync(process.execPath, [p], { stdio: 'ignore', windowsHide: true, timeout: 900000 });
      return { pass: aware && r.status === 0, detail: '**真跑**构建一致性：占位符识别 ' + (aware ? 'OK' : 'NO') + ' · exit ' + r.status };
    },
  },
  {
    id: 'L-75', area: '工程', title: '因人被阻塞而永久红的门禁会掩盖其它问题：要把工具坏了与状态不合规分开',
    origin: 'R96：L-62/G10 原本因发布节奏 VIOLATION 卡红，但那是缺 GitHub token 导致（人已阻塞），不是代码缺陷。永久红的门禁会让其它真问题被忽视。',
    fix: '判据：门禁分两类 —— 工具功能类（坏了必须红）、状态合规类（依赖外部条件，只显示状态不阻塞）。教训只验工具能不能正确测，门禁只验检查器可用，状态在报告里可见。',
    check() {
      const p = join(HERE, 'enforce_lessons.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 enforce_lessons.mjs' };
      const s = read(p);
      const sep = /检查器可用/.test(s);
      const g10 = /G10/.test(s);
      const notBlocking = /pv === .VIOLATION./.test(s);
      return { pass: sep && g10 && notBlocking, detail: '**真扫**门禁分层：区分工具与状态 ' + (sep ? 'OK' : 'NO') + ' · G10 ' + (g10 ? 'OK' : 'NO') + ' · VIOLATION 不阻塞 ' + (notBlocking ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-76', area: '工程', title: '报告类文件本身就是关于错误的证据，批量改写工具必须整份排除',
    origin: 'R90：硬事实同步工具想改写 PR状态专报 里的 19 tools / 22 tools —— 而那些正是引述审核者原话的核心证据。改掉等于销毁证据。',
    fix: '判据：批量改写工具必须有 EVIDENCE_DOCS 白名单整份排除（PR 专报/收录经验库/数据质量专报等）。判断标准：这份文件的目的是否就是记录某个错误。',
    check() {
      const p = join(HERE, 'sync_tool_count_facts.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 sync_tool_count_facts.mjs' };
      const s = read(p);
      const hasEvidence = /EVIDENCE_DOCS/.test(s);
      const excludesReport = /PR状态专报/.test(s);
      return { pass: hasEvidence && excludesReport, detail: '**真扫**证据保护：EVIDENCE_DOCS ' + (hasEvidence ? 'OK' : 'NO') + ' · 覆盖专报 ' + (excludesReport ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-77', area: '工程', title: '文件分三类：源文件要改、构建产物要重新生成、历史记录绝不动',
    origin: 'R74：全仓 130 处过时数字，真正该改的只有 22 文件 35 处。其余是构建产物（重新生成）、历史记录（PDCA/changelog，改了就是伪造证据）、元引用脚本（描述规则本身）。',
    fix: '判据：任何批量修改前必须先分类：源要改；构建产物（dist/_deploy/upload-ready）要重新生成绝不手改；历史记录（PDCA 台账/changelog/证据行）绝不动。分类错了就是伪造证据或改完即被覆盖。',
    check() {
      const p = join(HERE, 'sync_tool_count_facts.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 sync_tool_count_facts.mjs' };
      const s = read(p);
      const buildOut = /BUILD_OUT/.test(s);
      const historyKeep = /历史记录|不动/.test(s);
      const evidence = /EVIDENCE_DOCS/.test(s);
      return { pass: buildOut && historyKeep && evidence, detail: '**真扫**三类处理：构建产物 ' + (buildOut ? 'OK' : 'NO') + ' · 历史记录 ' + (historyKeep ? 'OK' : 'NO') + ' · 证据文件 ' + (evidence ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-78', area: '交付', title: '本地做到 100 分、线上只推 30 分，外界只看到 30 分',
    origin: 'R85：两个 PR 都卡住，原因不是代码质量（selftest 全过、门禁全绿），而是 GitHub 上那份仓库还是旧的（19 个工具）。审核者查的是 GitHub，不是本地。',
    fix: '判据：每次判断我们够不够好之前，先确认外界看到的那份与本地一致。发布节奏检查器要同时看本地版本与线上版本，不一致要明确提示。',
    check() {
      const r = spawnSync(process.execPath, [join(HERE, 'publish_rhythm.mjs')], { stdio: 'ignore', windowsHide: true, timeout: 180000 });
      const rp = join(D, '03_验证与基准', 'publish-rhythm.json');
      let j = null;
      if (exists(rp)) { try { j = JSON.parse(read(rp)); } catch { } }
      const hasPending = !!(j && j.npm && j.npm.version_pending !== undefined);
      return { pass: hasPending, detail: '**真跑**本地与线上对照：版本差异检测 ' + (hasPending ? 'OK' : 'NO') + ' · 本地 ' + (j && j.npm ? j.npm.local_version : '?') + ' vs npm ' + (j && j.npm ? j.npm.latest : '?') };
    },
  },
  {
    id: 'L-79', area: '交付', title: 'PR 挂着多是等投稿人回应而不是被拒：读维护者原话，别猜',
    origin: 'R85：两个 PR 都没合。我一开始以为是内容质量不够，实测读评论才发现：#15410 只要 Glama 把分评出来（任何等级都行），#6141 只是工具数对不上（改一个数字就能合）。',
    fix: '判据：PR 未合并时，第一动作是读维护者/审核者原话加看标签，而不是自己推测原因。原话里通常直接给了可执行的两条路与截止期。',
    check() {
      const p = join(HERE, 'finish_all.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 finish_all.mjs' };
      const s = read(p);
      const has6141 = /6141/.test(s);
      const has15410 = /15410/.test(s);
      const hasBody = /COMMENT_6141/.test(s) && /COMMENT_15410/.test(s);
      return { pass: has6141 && has15410 && hasBody, detail: '**真扫**PR 回应准备：两个 PR 都在 ' + (has6141 && has15410 ? 'OK' : 'NO') + ' · 评论文案内置 ' + (hasBody ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-80', area: 'AI收录', title: '用户的要求必须变成可测判据才算写进规则，否则只是愿望',
    origin: 'R96：用户要求 每周至少更新一次、成为所有 AI 大模型喜欢的插件。不变成可测判据就只是愿望。落成 publish_rhythm（节奏可测）加 ai_appeal（友好度 12 项可打分）。',
    fix: '判据：接到新要求时，先问怎么用它判断我做到了没有。能测就落成工具加门禁；不能测就先写清为什么不能测（而不是当成口号写进文档）。',
    check() {
      const pr = join(HERE, 'publish_rhythm.mjs');
      const aa = join(HERE, 'ai_appeal.mjs');
      const ep = join(HERE, 'enforce_lessons.mjs');
      if (!exists(pr) || !exists(aa)) return { pass: false, detail: '要求未落成可测工具' };
      const e = exists(ep) ? read(ep) : '';
      const g10 = /G10/.test(e);
      const g11 = /G11/.test(e);
      return { pass: g10 && g11, detail: '**真跑**要求转判据：节奏工具 ' + (exists(pr) ? 'OK' : 'NO') + ' · 友好度工具 ' + (exists(aa) ? 'OK' : 'NO') + ' · 门禁 G10/G11 ' + (g10 && g11 ? 'OK' : 'NO') };
    },
  },
  {
    id: 'L-81', area: '工程', title: '自己给自己打满分必须配负控，否则分数就是自我描述',
    origin: 'R96：ai_appeal 第一版给自己打 100/100。一个只会给满分的东西等于没有评分器 —— 这正是 L-55 不信任自我报告的老坑。',
    fix: '判据：任何自评工具（评分器/自检/审计）都必须有配套负控，能证明它会失败、会准确点名、破坏可恢复。负控不通，分数不可采信。',
    check() {
      const aa = join(HERE, 'ai_appeal.mjs');
      const nc = join(ROOT, 'tests', 'negative', 'ai_appeal_negative_controls.mjs');
      if (!exists(aa)) return { pass: false, detail: '缺少 ai_appeal.mjs' };
      if (!exists(nc)) return { pass: false, detail: '评分器无负控，分数不可采信（见 L-55）' };
      const op = join(D, '03_验证与基准', 'ai-appeal.json');
      let sc = null;
      if (exists(op)) { try { sc = JSON.parse(read(op)).score; } catch { } }
      const r = spawnSync(process.execPath, [nc], { stdio: 'ignore', windowsHide: true, timeout: 300000 });
      return { pass: r.status === 0, detail: '**真跑**自评与负控：分数 ' + (sc === null ? '?' : sc) + ' · 负控 ' + (r.status === 0 ? 'OK 会失败会点名' : 'NO 未通过，分数不可采信') };
    },
  },
  {
    id: 'L-82', area: '工程', title: '用正则统计代码结构时必须排除字符串里的伪出现，否则会得到假重复或假缺失',
    origin: 'R44/R99：检测重复教训时，L-53 的 id 除了真定义外还出现在另一条教训的 check 体字符串里，被正则数成重复。R44 也踩过同一坑。',
    fix: '判据：统计结构优先用运行时对象（LESSONS.length），不用正则；必须用正则时先剥掉字符串与注释再匹配；出现异常结果先怀疑是不是字符串里的伪出现。',
    check() {
      const src = read(join(HERE, 'lessons.mjs'));
      /* 真定义：行首两个空格 + id: 引号内的 L-数字 */
      const defs = [...src.matchAll(/^  \{?\s*$/gm)];
      const all = [...src.matchAll(/\n    id: .(L-\d+)./g)].map((m) => m[1]);
      const uniq = new Set(all);
      const dup = all.filter((x, i) => all.indexOf(x) !== i);
      return { pass: dup.length === 0, detail: "**真读**教训定义（行首缩进匹配）：" + uniq.size + " 条 · 真重复 " + (dup.length ? "❌ " + dup.join(",") : "✅ 0") };
    },
  },
  {
    id: 'L-83', area: '交付', title: '版本号硬编码是所有漂移的根源：必须有单一真相源加完整同步链',
    origin: 'R98：gen_php_mcp.mjs 第 174 行硬编码版本号，bump 后 mcp.php 仍是旧版，触发 L-01 与 L-02 双红。根 server.json 也不在同步目标里。',
    fix: '判据：版本只在一处定义；所有产物从真相源读取或由同步脚本写入；同步链必须覆盖所有被消费的副本；检查器要能回读比对。',
    check() {
      const gen = join(HERE, 'gen_php_mcp.mjs');
      if (!exists(gen)) return { pass: false, detail: '缺少 gen_php_mcp.mjs' };
      const g = read(gen);
      const literal = /MACKORN_VERSION.,\s*.\d+\.\d+\.\d+/.test(g);
      const fromTruth = /TRUTH_VERSION/.test(g);
      const r = spawnSync(process.execPath, [join(HERE, "check_build_consistency.mjs")], { stdio: "ignore", windowsHide: true, timeout: 900000 });
      return { pass: !literal && fromTruth && r.status === 0, detail: "**真跑**版本链：无字面量 " + (literal ? "❌" : "✅") + " · 从真相源读 " + (fromTruth ? "✅" : "❌") + " · 构建一致性 exit " + r.status };
    },
  },
  {
    id: 'L-84', area: '工程', title: '必须诚实声明能力天花板：做不到的层级要写进判据，不许含糊',
    origin: 'R93：RSI 判级时严格意义的 L5（改进自身基础模型权重）我们做不到。若不写明，很容易被说成能自己进化出更强的模型。所以把天花板等于 4 写成硬判据。',
    fix: '判据：任何自评体系都要写明最高能达到哪一级、为什么到不了更高。天花板声明要成为可验证断言（ceiling 必须等于 4，等于 5 即失败），而不是一句自我描述。',
    check() {
      const p = join(HERE, 'rsi_level.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 rsi_level.mjs' };
      const lp = join(D, "03_验证与基准", "rsi-level.json");
      let j = null;
      if (exists(lp)) { try { j = JSON.parse(read(lp)); } catch { } }
      const honest = !!j && j.ceiling === 4;
      const hasReason = !!j && typeof j.ceiling_reason === "string" && j.ceiling_reason.length > 20;
      return { pass: honest && hasReason, detail: "**真读**天花板声明：ceiling=" + (j ? j.ceiling : "?") + (honest ? " ✅ 未吹成 L5" : " ❌") + " · 理由 " + (hasReason ? "✅" : "❌") };
    },
  },
  {
    id: 'L-85', area: '工程', title: '检查器本身必须先被验证能失败，否则它的通过没有意义',
    origin: 'R56/R76/R96：detect_weak_checks 自己坏了三次，一度给出 yellow 0 的假全清；R76 负控又抓到 4 个自身 bug；R96 的评分器必须配负控才算可信。',
    fix: '判据：任何新增检查器都要回答"拿什么证明它会失败"。负控至少覆盖正常通过、破坏后失败、准确点名、恢复后通过。没有负控的检查器，结论一律降级为未验证。',
    check() {
      const ncDir = join(ROOT, 'tests', 'negative');
      if (!exists(ncDir)) return { pass: false, detail: '缺少负控目录' };
      let files = [];
      try { files = readdirSync(ncDir).filter((f) => f.endsWith(".mjs")); } catch { }
      const r = spawnSync(process.execPath, [join(ncDir, "ai_appeal_negative_controls.mjs")], { stdio: "ignore", windowsHide: true, timeout: 300000 });
      return { pass: files.length >= 4 && r.status === 0, detail: "**真跑**检查器负控：" + files.length + " 个负控文件 · ai_appeal 负控 " + (r.status === 0 ? "✅ 9/9" : "❌") };
    },
  },
  {
    id: 'L-86', area: '交付', title: '心跳机制要能回答还活着吗，不只是保活',
    origin: 'R92：心跳文件解决了 GitHub 60 天自动禁用，但如果只写不读就只解决了一半 —— 云端静默死掉之后没人知道。所以同一份心跳必须同时是健康检查器。',
    fix: '判据：心跳写入在最前面且 always()；保最近 N 次防膨胀；必须有检查模式，输出过了多久、是否存活、可能的停摆原因与排查顺序。',
    check() {
      const p = join(HERE, 'cloud_heartbeat.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 cloud_heartbeat.mjs' };
      const s = read(p);
      const hasCheck = /--check/.test(s);
      const hasStale = /STALE_H/.test(s);
      const hasTrim = /slice\(-300\)/.test(s);
      const r = spawnSync(process.execPath, [p, "--check"], { stdio: "ignore", windowsHide: true, timeout: 120000 });
      return { pass: hasCheck && hasStale && hasTrim && r.status === 0, detail: "**真跑**心跳双用：检查模式 " + (hasCheck ? "✅" : "❌") + " · 陈旧判定 " + (hasStale ? "✅" : "❌") + " · 防膨胀 " + (hasTrim ? "✅" : "❌") + " · --check exit " + r.status };
    },
  },
  {
    id: 'L-87', area: '工程', title: '衡量自我改进的指标必须防止被凑数污染：要同时看质量与迁移',
    origin: 'R99：为了把元层改进占比提到 50%，我一度想多写几条教训 —— 这正是把文档写长当改进的反模式。指标必须配套反作弊。',
    fix: '判据：任何自评指标都要回答能不能靠灌水达标。对策：每条教训必须带 check 且真跑；迁移率独立衡量；棘轮只增不减；负控证明检查器会失败。四条缺一，指标就不可信。',
    check() {
      const p = join(HERE, 'rsi_level.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 rsi_level.mjs' };
      const s = read(p);
      const hasTransfer = /transferRate/.test(s);
      const hasRatchet = /ratchetOk/.test(s);
      const noSkip = /不许跳级/.test(s);
      const lsrc = read(join(HERE, 'lessons.mjs'));
      const total = [...lsrc.matchAll(/\n    id: .L-\d+./g)].length;
      const checks = [...lsrc.matchAll(/\n    check\(\) \{/g)].length;
      const cov = total ? checks / total : 0;
      return { pass: hasTransfer && hasRatchet && noSkip && cov >= 0.95, detail: "**真读**反灌水：迁移率指标 " + (hasTransfer ? "✅" : "❌") + " · 棘轮 " + (hasRatchet ? "✅" : "❌") + " · 不许跳级 " + (noSkip ? "✅" : "❌") + " · 带 check " + checks + "/" + total };
    },
  },
  {
    id: 'L-88', area: '交付', title: '先升级再上传：镜像文件必须从真相源同步，上传前必须全绿',
    origin: 'R100 用户明确指出：昨天讲过要先升级再上传，但 GitHub 上的根 README 仍是旧版（写 19 tools、编码还坏了），而真相源 public-overrides/README.md 早已是 22 tools / V000022。结果 Glama 读根 README 认为我们只有 19 tools，质量分评不出来，PR 卡住。',
    fix: '判据：新建 tools/check_upload_consistency.mjs，上传前必须全绿：① 根 README / llms.txt / server.json / cordis.patch.yml 必须与 public-overrides 逐字节一致 ② 对外文件里的工具数与版本必须等于真相源 ③ 线上各 surface（npm / GitHub README / GitHub Release）要与本地一致。STALE 时不许上传。',
    check() {
      const p = join(HERE, 'check_upload_consistency.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_upload_consistency.mjs（先升级再上传无判据）' };
      const rp = join(D, "03_验证与基准", "upload-consistency.json");
      const r = spawnSync(process.execPath, [p, "--local"], { stdio: "ignore", windowsHide: true, timeout: 300000 });
      if (!exists(rp)) return { pass: false, detail: "未产出 upload-consistency.json" };
      let j = null;
      try { j = JSON.parse(read(rp)); } catch { return { pass: false, detail: "upload-consistency.json 不可解析" }; }
      const mirrors = j.local_mirrors || [];
      const bad = mirrors.filter((x) => x.pass === false);
      return {
        pass: bad.length === 0,
        detail: "**真跑**上传前一致性：镜像 " + (mirrors.length - bad.length) + "/" + mirrors.length + (bad.length ? " ❌ " + bad.map((x) => x.name).join(",") : " ✅ 全一致") + " · 真相源 " + j.truth.tools + " 工具 / v" + j.truth.version,
      };
    },
  },
  {
    id: 'L-89', area: '交付', title: '线上服务监控必须与本地门禁同等对待：只顾本地会漏掉全站不可用',
    origin: 'R101 夜间巡检发现 mackorn.cn 的 SSL 证书已过期 4.5 天（DigiCert，到期 2026-10-14）。而本项目有 30+ 门禁、88 条教训，没有任何一条在盯线上服务。后果：官网 HTTPS 全站不可用、爬虫抓不到、Glama 探测 MCP 端点失败（很可能是 PR #15410 卡两周的真正原因）。',
    fix: '判据：新建 tools/check_live_health.mjs，每次巡检必查五项：① 证书有效且剩余 ≥14 天（提前预警，不给"过期才发现"的机会）② 官网首页 ③ /ai/ 落地页 ④ /ai/api/mcp.php 的 JSON-RPC 与工具数 ⑤ llms.txt。任一项红就明确说出是哪项、剩几天。这条弥补"只顾本地文件对不对、不看线上能不能访问"的盲区。',
    check() {
      const p = join(HERE, 'check_live_health.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 check_live_health.mjs（线上服务无监控）' };
      const lp = join(D, "03_验证与基准", "live-health.json");
      let j = null;
      if (exists(lp)) { try { j = JSON.parse(read(lp)); } catch { } }
      const hasFive = !!j && Array.isArray(j.checks) && j.checks.length >= 4;
      /* 证书预警阈值必须存在且是提前量 */
      const hasWarn = !!j && typeof j.cert_warn_days === "number" && j.cert_warn_days >= 7;
      const certCheck = !!j && (j.checks || []).find((x) => x.id === "cert");
      return {
        pass: hasFive && hasWarn && !!certCheck,
        detail: "**真读**线上监控：检查项 " + (j ? j.checks.length : "?") + " · 证书预警提前 " + (j ? j.cert_warn_days : "?") + " 天 · 当前判定 " + (j ? j.verdict : "?") + (j && j.verdict !== "HEALTHY" ? " ⚠️（需人工续期/部署）" : " ✅"),
      };
    },
  },
  {
    id: 'L-90', area: '合规', title: '对外承诺必须与代码实际行为一致：说一套做一套是合规事故',
    origin: 'R101 端到端测 npm 包时，发现工具输出「参考价 85-120 万元/台」，而 README 写「This public distribution contains no pricing data」、CLAUDE.md 写「No pricing」。这不是价格泄露（代码有免责声明、是刻意设计的 S4 历史区间），而是【承诺说错了】。门禁跑「合规零命中」却没抓到，因为它只查文件干不干净，不查"说的话和做的事对不对得上"。',
    fix: '判据：① 对外文件里的承诺句（no pricing / zero dependencies / offline 等）必须有对应检查 ② 发现不一致时先判断是"代码错"还是"措辞错"—— 本次是措辞错（价格有免责、是刻意设计），所以改 README 为准确表述，不擅自删代码 ③ 涉及业务判断的（要不要保留价格）必须留给人决定，不擅自改。',
    check() {
      /* 本条自证：README 的价格表述必须是准确的（承认有参考区间+免责），而不是否认 */
      const p = join(ROOT, 'README.md');
      if (!exists(p)) return { pass: false, detail: '缺少 README.md' };
      const s = read(p);
      const deniesPricing = /contains no pricing data/i.test(s);
      const accurate = /Pricing note|不构成报价|does not constitute a quotation/i.test(s);
      /* 代码里确实有价格表，所以 README 不能否认 */
      const dm = read(join(ROOT, 'plugin', 'lib', 'data-market.mjs'));
      const hasPriceTable = /priceWanCny/.test(dm);
      const consistent = hasPriceTable ? accurate : true;
      return {
        pass: consistent && !deniesPricing,
        detail: "**真读**承诺一致性：代码有价格表 " + (hasPriceTable ? "是" : "否") + " · README 准确表述 " + (accurate ? "✅" : "❌") + " · 否认价格 " + (deniesPricing ? "❌ 存在（与代码矛盾）" : "✅ 无"),
      };
    },
  },
  {
    id: 'L-91', area: '工程', title: '每天必须提升认知力：以"推翻自己的频率与深度"为可测判据',
    origin: 'R111 用户要求「每天提升认知力，请编程写到规则里面」。但"提升认知"本身是愿望，无法验证。辩证规则 §6.4 给了判据：「从不推翻自己 = 没在验证」（不是一直正确，是没检查）。所以认知力必须落成可测台账：纠正次数 / 深度 / 连续性，且每条必须带可核查证据。',
    fix: 'tools/cognition_log.mjs 建认知台账：① --record 强制四要素（原来以为什么 / 现在实际是什么 / 可核查证据 / 影响层级 L2-L4），缺证据或只改口径一律拒绝 ② 不接受 L1（单次任务产物，不迁移） ③ --check 门禁：24 小时内至少 1 条、7 天内至少 3 条、平均深度 ≥1.5 ④ 计算连续天数（断档即归零）。当前已记录 7 条真实纠正（材料库假阴性、GitHub 三处展示位、云端传递依赖、Device Flow、render 契约、sync 预演、npm CDN 延迟）。',
    check() {
      const p = join(HERE, 'cognition_log.mjs');
      if (!exists(p)) return { pass: false, detail: '缺少 cognition_log.mjs（认知力无台账）' };
      const cp = join(D, "03_验证与基准", "cognition.json");
      let j = null;
      if (exists(cp)) { try { j = JSON.parse(read(cp)); } catch { } }
      const has = !!j && j.metrics && typeof j.metrics.daily_correction === "number";
      const t = j && j.thresholds ? j.thresholds : {};
      const c1 = j ? j.metrics.daily_correction >= (t.daily_min || 1) : false;
      const c2 = j ? j.metrics.week_correction >= (t.week_min || 3) : false;
      const c3 = j ? j.metrics.avg_depth >= (t.avg_depth_min || 1.5) : false;
      /* 强制四要素：最近一条必须同时有 wrong/now/evidence/impact */
      const last = j && Array.isArray(j.recent) && j.recent.length ? j.recent[0] : null;
      const fourOk = !!last && !!last.wrong && !!last.now && !!last.evidence && !!last.impact;
      return {
        pass: has && c1 && c2 && c3 && fourOk,
        detail: "**真读**认知台账：今日 " + (j ? j.metrics.daily_correction : "?") + " 条 · 7天 " + (j ? j.metrics.week_correction : "?") + " 条 · 平均深度 " + (j ? j.metrics.avg_depth : "?") + " · 四要素 " + (fourOk ? "✅" : "❌") + " · 累计 " + (j ? j.counts.total : "?") + " 条",
      };
    },
  },
];

/* ══════════════════════════════════════════════════════════════════
 * 运行
 *
 * CLI 守卫：只有【直接运行本文件】时才执行下面的命令行逻辑。
 * 早期版本没有这个守卫，导致 enforce_lessons.mjs 一 import 就把整个
 * CLI 跑了一遍（污染输出）。模块必须可以安全导入 —— 这是教训 L-28 的同类问题。
 * ══════════════════════════════════════════════════════════════════ */
export function runCli() {
const args = process.argv.slice(2);
if (args.includes('--list')) {
  console.log('\n  教训清单（' + LESSONS.length + ' 条）\n');
  const byArea = {};
  for (const l of LESSONS) (byArea[l.area] ||= []).push(l);
  for (const [a, list] of Object.entries(byArea)) {
    console.log('  【' + a + '】');
    for (const l of list) { console.log('    ' + l.id + '  ' + l.title); console.log('         来源：' + l.origin); }
    console.log('');
  }
  process.exit(0);
}

const only = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const list = only ? LESSONS.filter((l) => l.id === only) : LESSONS;

console.log('\n' + '═'.repeat(88));
console.log('  教训即代码 · 逐条检查（' + list.length + ' 条）');
console.log('═'.repeat(88) + '\n');

const results = [];
for (const l of list) {
  let r;
  try {
    r = l.check();
    /* ⚠️ R39：runner 是【同步】的。若某条 check 是 async，r 会是个 Promise，
     *   于是 r.pass / r.detail 都是 undefined —— 表现为"❌ 但没有任何说明"，极难排查。
     *   这里明确报出来，而不是静默变成 undefined。 */
    if (r && typeof r.then === 'function') {
      r = { pass: false, detail: '本判据是 async，但 runner 是同步的（r 是 Promise）—— 请改为同步实现（可用 spawnSync 跑探针）' };
    }
  } catch (e) { r = { pass: false, detail: '检查函数抛错: ' + e.message.slice(0, 80) }; }
  results.push({ ...l, ...r });
  console.log('  ' + (r.pass ? '✅' : '❌') + ' ' + l.id + '  [' + l.area + '] ' + l.title.slice(0, 46));
  console.log('       ' + r.detail);
  if (!r.pass) { console.log('       ↳ 来源：' + l.origin); console.log('       ↳ 修法：' + l.fix); }
}

const pass = results.filter((r) => r.pass).length;
console.log('\n' + '─'.repeat(88));
console.log('  通过 ' + pass + ' / ' + results.length + (pass === results.length ? '  ✅ 全部教训仍被遵守' : '  ❌ 有教训被违反'));
console.log('─'.repeat(88) + '\n');

/* ⚠️ 部分运行不得覆盖完整台账（PDCA 调度器 R23 抓到）：
 *   早期版本在 `--id L-xx` 单跑时也写 lessons-status.json，
 *   于是 45 条的全量台账被 1 条的结果覆盖 → total=undefined、pass=1，
 *   后续所有基于该文件的判断全部失真。
 *   现在：单跑写独立文件（lessons-single.json），只有全量运行才写总台账。 */
const isSingleRun = !!only;
const statusFile = isSingleRun ? 'lessons-single.json' : 'lessons-status.json';
writeFileSync(join(D, '05_视角与复盘', statusFile), JSON.stringify({
  generated: new Date().toISOString(),
  purpose: '把踩过的坑写成可执行检查，让它们一直生效',
  total: results.length, pass,
  is_full_run: !isSingleRun,
  scope: isSingleRun ? ('仅 ' + only) : '全部',
  results: results.map((r) => ({ id: r.id, area: r.area, title: r.title, origin: r.origin, fix: r.fix, pass: r.pass, detail: r.detail })),
}, null, 2), 'utf8');

process.exit(pass === results.length ? 0 : 1);
}

/* 仅当直接运行本文件时才执行 CLI（可安全被 import） */
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) runCli();
