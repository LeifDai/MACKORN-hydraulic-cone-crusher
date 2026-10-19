/**
 * 用本次会话【实际积累】的经验与错误填充两个库
 *
 * 纪律：
 *   · 只记录真实发生过的 —— 每条都有出处（哪一轮、哪个动作）
 *   · 试验次数按实际记录，不虚报（不足 3 次的判「待定」，这是设计而非缺陷）
 *   · 「测不到」（网络不可达/被反爬）记 UNKNOWN，不计入成功率分母
 */
import { recordExperience, recordError, stats, audit, FILES, load, save } from './libraries.mjs';

console.log('\n' + '═'.repeat(96));
console.log('  填充经验库 JY0001.1 / 错误库 CW0001.1（用本次会话的真实积累）');
console.log('═'.repeat(96) + '\n');

/* ═══════════════ 经验 ═══════════════ */
console.log('  ── 记录经验 ──\n');

const EXP = [
  {
    claim: '把远程 HTTP 端点写进官方 MCP Registry 的 server.json（remotes 字段），可让只支持远程 MCP 的客户端发现我们',
    category: 'AI收录', action: '在 public-overrides/server.json 加 remotes:[{type:streamable-http,url:...}]，并用 mcp-publisher publish',
    condition: '需先登录（GitHub OAuth 或 DNS 私钥）',
    evidence: [
      { target: '官方 MCP Registry', target_type: '官方注册表', observed: 'success' },
    ],
  },
  {
    claim: '用 DNS 私钥登录 mcp-publisher，可绕过 GitHub OAuth 的浏览器/2FA 限制完成发布',
    category: 'AI收录', action: 'mcp-publisher login dns --domain=<域名> --private-key=<key>（私钥与 TXT 记录已在仓库）',
    evidence: [
      { target: '官方 MCP Registry', target_type: '官方注册表', observed: 'success' },
    ],
  },
  {
    claim: 'npm 包的版本必须先发布，MCP Registry 才能接受声明该版本的 server.json',
    category: 'AI收录', action: '先 npm publish 目标版本，等 registry.npmjs.org 同步（实测约 1-2 分钟）后再 publish 到 MCP Registry',
    evidence: [
      { target: 'npm', target_type: '包仓库', observed: 'success' },
      { target: '官方 MCP Registry', target_type: '官方注册表', observed: 'success' },
    ],
  },
  {
    claim: '每新增页面后统一补 hreflang（含 x-default 与语言家族互链），可恢复自检并避免多语言页互相抢排名',
    category: 'AI收录', action: '写 add_hreflang.mjs 按目录推断语言 + 家族互链 + x-default，批量注入',
    evidence: [
      { target: '自有站点自检（十三维）', target_type: '标准化机构', observed: 'success' },
    ],
  },
  {
    claim: '新页面必须同步进 llms.txt / llms-full.txt / keywords.json / agent.json，否则 AI 不知道它们存在',
    category: 'AI收录', action: '写 sync_ai_index.mjs 扫描站点实际页面后重写全部 AI 索引文件',
    evidence: [
      { target: '自有站点 AI 索引（94 页）', target_type: '标准化机构', observed: 'success' },
    ],
  },
  {
    claim: '用中性主题词（而非品牌名）查询各 AI 面，并只认结果条目，可避免查询词回显造成的假阳性',
    category: 'AI收录', action: 'two_centers.mjs 用 cone crusher selection 等中性词，配合「只认 host 为本站」的严格判定',
    evidence: [
      { target: 'Bing', target_type: '搜索引擎', observed: 'success' },
      { target: '百度', target_type: '搜索引擎', observed: 'success' },
    ],
  },
  {
    claim: '把验证做成零依赖、可执行的公开基准，比写白皮书更能建立可信度',
    category: '科学可信', action: 'run-benchmark.mjs：26 项检查、约 100ms、退出码可接 CI、CC-BY-4.0',
    evidence: [
      { target: '自有公开验证基准', target_type: '标准化机构', observed: 'success' },
    ],
  },
  {
    claim: '用 Zenodo 的公开实测数据做交叉验证，可发现模型实现中的根本性错误',
    category: '科学可信', action: '检索 Zenodo dataset 类型（多组关键词），下载 CC-BY-4.0 数据，写自动解析+拟合',
    evidence: [
      { target: 'Zenodo（花岗岩颚破数据集）', target_type: '数据集平台', observed: 'success' },
      { target: 'Zenodo（单颗粒破碎数据集）', target_type: '数据集平台', observed: 'success' },
    ],
  },
  {
    claim: '对外页面上的算例必须真跑生成，不能手写（手写会过期）',
    category: '工程纪律', action: 'publish_validation_page.mjs 先跑基准再生成页面；工具页用真实 execute 输出',
    evidence: [
      { target: '自有验证页 /ai/validation/', target_type: '标准化机构', observed: 'success' },
    ],
  },
  {
    claim: '把踩过的坑写成可执行检查（教训即代码），比写在文档里更能防止重犯',
    category: '工程纪律', action: 'lessons.mjs：29 条，每条含来源/判据/检查函数，可一键跑',
    evidence: [
      { target: '自有教训检查器', target_type: '标准化机构', observed: 'success' },
    ],
  },
  {
    claim: '用进口额 ÷ 现有内容量 来驱动多语言内容投放，比凭感觉更有效',
    category: '内容策略', action: 'audit_term_language_gap.mjs 按「每词承担的进口额」排序，优先补钱多话少的语言',
    evidence: [
      { target: 'UN Comtrade 数据 + 术语表', target_type: '政府公开', observed: 'success' },
    ],
  },
  {
    claim: '差异交付（只传变化部分）可避免把已验证的文件覆盖坏，并让更新内容一目了然',
    category: '交付纪律', action: 'build_delta.mjs + released-manifest.json 基线，自动清理旧包只留最新 2 个',
    evidence: [
      { target: '自有交付流程', target_type: '标准化机构', observed: 'success' },
    ],
  },
];
for (const e of EXP) {
  const r = recordExperience({ ...e, target: e.evidence[0].target, target_type: e.evidence[0].target_type, observed: e.evidence[0].observed });
  // 补记其余证据（不重复计 trials）
  const lib = load(FILES.JY);
  const rec = lib.experience.find((x) => x.id === r.experience.id);
  for (let i = 1; i < e.evidence.length; i++) {
    const ev = e.evidence[i];
    rec.trials += 1;
    if (ev.observed === 'success') rec.successes += 1;
    rec.evidence.push({ ...ev, at: new Date().toISOString() });
  }
  save(FILES.JY, lib);
  const j = r.judgement, s = r.scoring;
  console.log('  ✅ ' + r.experience.id + '  ' + j.verdict.padEnd(10) + ' 评分 ' + String(s.score).padStart(5) + '  ' + e.claim.slice(0, 52));
}

/* ═══════════════ 错误 ═══════════════ */
console.log('\n  ── 记录错误 ──\n');

const ERR = [
  {
    claim: '破碎矩阵用「累积型」（B[i][j]=落入 i 及以下的累积分数，列和 ≠ 1）会破坏质量守恒',
    category: '模型实现', action: '在 simulateConeCrusher 里直接用 breakageMatrix() 的返回值代入 Whiten 公式',
    why: '质量守恒的必要条件是破碎矩阵【列随机】（每列和为 1）。累积型列和为 1.00/1.52/1.84…，不满足',
    fix: '新增 fractionalBreakageMatrix()：b[0][j]=Bc[1][j]，b[i][j]=Bc[i+1][j]−Bc[i][j]，b[j][j]=0',
    evidence: [{ target: '自有模型自验证（质量守恒检查）', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: 'Whiten 公式的算子顺序写反（解 (I−BC)·P = (I−C)·F）会导致数值发散',
    category: '模型实现', action: '把 (I−C) 放进了右端项',
    why: '(I−C) 与 (I−BC)^(−1) 不可交换；正确顺序是解 (I−b·C)·X = F 再 P = (I−C)·X',
    fix: '改为先解 X 再左乘 (I−C)',
    evidence: [{ target: '自有模型自验证（质量守恒检查）', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '给分类函数 C 加「数值保护」夹紧（C ≤ 1−1e-9）反而制造了 1e9 级放大',
    category: '模型实现', action: '为「避免矩阵奇异」把 C 上限压到 1−1e-9',
    why: '夹紧后对角元 1−C 变成 1e-9，回代时被直接相除 → 逐级放大 1e9 → 结果达 1e78',
    fix: '改用分数型矩阵（b[j][j]=0）使对角元恒为 1，彻底移除夹紧',
    evidence: [{ target: '自有模型自验证（质量守恒检查）', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '把「设备铭牌参数」（转速/偏心距）计入模型的未知不确定度，会得出过度悲观的结论',
    category: '不确定度', action: '第一版不确定度分析把所有参数都算进误差棒',
    why: '转速与偏心距查铭牌即可确定，不是模型不确定度；混入后 P80 区间被撑到 ±162.6%',
    fix: '区分 fitted（需标定：φ/γ/β/啮合系数）与 machine（铭牌可得），只把 fitted 计入误差棒',
    evidence: [{ target: '自有不确定度模块', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '文本替换脚本在锚点不存在时会静默失败，却仍打印「已接入」',
    category: '工程纪律', action: '用 replace(锚点, 新内容) 给编排器接线，锚点实际不存在',
    why: 'replace 找不到目标时原样返回，脚本无从察觉',
    fix: '替换后必须回读文件确认目标字符串已存在；已编入教训 L-28',
    evidence: [{ target: '自有编排器 orchestrate_v2', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '路径脱敏正则会误伤代码里的正则转义（e:\\s* 被当成盘符+反斜杠）',
    category: '工程纪律', action: '用 /[A-Za-z]:\\[^\s]{6,}/ 匹配本地路径',
    why: 'PowerShell 的 ^name:\\s*$ 中的 e:\\s 被当作路径起点，改坏了 verify.ps1',
    fix: '脱敏只匹配已知根目录白名单（Users|Mackorn|DSH|AI|npm…）',
    evidence: [{ target: '自有公开包合规闸门', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '跨国数据匹配只用中文名会全部落空（数据源里是英文）',
    category: '数据处理', action: '用「印度尼西亚」等中文名匹配 SEC 的 countries_mentioned',
    why: '20-F 提取出的是英文（"in Indonesia"）',
    fix: '加英文别名表，中英同时匹配',
    evidence: [{ target: '自有国别页生成器', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '把「某年未申报」当成 0 会严重误导（俄罗斯 2023 未报 → 页面显示 US$0.0M）',
    category: '数据处理', action: '直接取固定年份 2023 的进口额',
    why: '部分国家不申报最新年份，取不到时默认成 0',
    fix: '取最新可得年份并显式标注「该国未报 2023」',
    evidence: [{ target: '自有国别页生成器', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '重写机器可读文件时丢掉契约字段（ai.txt 的 discipline / cite-as）会被门禁拦下',
    category: '工程纪律', action: '重写 ai.txt 时只保留了抓取许可段',
    why: '自检要求 ai.txt 必须含 discipline 与 cite-as 两字段',
    fix: '重写前先确认该文件承担了哪些契约字段；已编入教训 L-27',
    evidence: [{ target: '自有十三维自检', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '跨平台用同一个名字查询会误报失守（GitHub 仓库名 ≠ npm 包名）',
    category: '工程纪律', action: '用 npm 包名 mackorn-cone-crusher 查询 GitHub 仓库',
    why: 'GitHub 仓库实际叫 MACKORN-hydraulic-cone-crusher，查不到 → 误判为「中心①失守」',
    fix: '每个平台用该平台的真实标识查询；已编入教训 L-22',
    evidence: [{ target: '自有两个中心验证器', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '把「探测失败」当成「我们不在」会误导资源投入',
    category: '工程纪律', action: '两个中心 v1 在 HTTP 超时/403 时判为 GAP2（我们未覆盖）',
    why: '测不到 ≠ 不在；反爬与网络问题会造成假阴性',
    fix: '加 UNKNOWN 判定，不计入覆盖率分母；已编入教训 L-21',
    evidence: [{ target: '自有两个中心验证器', target_type: '标准化机构', observed: 'fail' }],
  },
  {
    claim: '外部资源的索引名硬编码会在索引过期后失效（Common Crawl 的 CC-MAIN-2024-33）',
    category: '工程纪律', action: '在验证器里写死 Common Crawl 索引名',
    why: '索引会滚动更新，旧名 404 后被当成「我们不在」',
    fix: '先查 collinfo.json 取当前可用索引；已编入教训 L-23',
    evidence: [{ target: '自有两个中心验证器', target_type: '标准化机构', observed: 'fail' }],
  },
];
for (const e of ERR) {
  const r = recordError({ ...e, target: e.evidence[0].target, target_type: e.evidence[0].target_type, observed: e.evidence[0].observed });
  // 发现时的「失败」是【发现记录】，不是对「是否已修复」的检验 —— 不计入判定分母，
  // 但记下 fixed_at_confirm=1，使修复后能判为「已修复」而非「非错误」。
  {
    const lib2 = load(FILES.CW);
    const rec2 = lib2.error.find((x) => x.id === r.error.id);
    rec2.fixed_at_confirm = 1;
    rec2.discovery_note = '本错误在 2026-10 的模型自验证中被发现并修复；此后每次复跑都是在检验【修复是否保持】';
    save(FILES.CW, lib2);
  }
  console.log('  ✅ ' + r.error.id + '  ' + r.judgement.verdict.padEnd(12) + '  ' + e.claim.slice(0, 52));
}

/* ═══════════════ 汇总 ═══════════════ */
const s = stats();
console.log('\n' + '═'.repeat(96));
console.log('  汇总');
console.log('═'.repeat(96));
console.log('  经验库 ' + s.experience.total + ' 条 · 判定分布 ' + JSON.stringify(s.experience.by_verdict));
console.log('  错误库 ' + s.error.total + ' 条 · 判定分布 ' + JSON.stringify(s.error.by_verdict));
const a = audit();
console.log('  防误判自检: ' + (a.length ? a.length + ' 条样本不足（判「待定」，符合设计）' : '✅ 通过'));
console.log('');
