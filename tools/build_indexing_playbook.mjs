/**
 * 收录经验库（Indexing Playbook）—— 把"哪些 AI/渠道收录了我们、为什么、怎么复制"编程化
 *
 * 核心思路（用户要求）：
 *   · 收录了的 → 提炼【收录原因】→ 写进经验库 → 可复制到其他渠道
 *   · 没收录的 → 归因到【待提高项】→ 排优先级 → 变成可执行动作
 *   · 每次实测后更新，让"经验库"随收录数增长而变厚
 *
 * 纪律（本会话反复踩过的坑）：
 *   · 区分【通道可达】与【已被收录】—— 两件事，不合并（L-17）
 *   · 测不到的记 UNKNOWN，不记为"没有"（L-21）
 *   · 结论要带证据（URL / 快照日期 / 证据片段）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');
const OUTDIR = join(D, '04_AI收录与分发');
mkdirSync(OUTDIR, { recursive: true });

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/* ══════════════════════════════════════════════════════════════════
 * 实测数据（本轮真跑得到，每条带证据）
 * ══════════════════════════════════════════════════════════════════ */
const MEASURED = {
  at: new Date().toISOString().slice(0, 10),
  /** 已确认【被收录】的渠道 —— 证据是能搜到/能在目录里找到 */
  indexed: [
    {
      channel: 'GitHub 仓库搜索',
      evidence: 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher 可在检索中直接命中',
      evidence_detail: '检索到的描述为 "19 tools, MCP server, 10 languages" —— 【已过时，线上实为 22 工具】',
      since: '2026-10-01 前后',
      reason: [
        '公开仓库 + 清晰的 README（含工具清单与参数表）',
        '仓库 description 密写行业触发词（cone crusher / mining / aggregate）',
        '有 LICENSE（MIT）—— 检索排序对合规仓库友好',
        '持续提交（commit 历史活跃，快照有更新信号）',
      ],
      reusable: '所有"目录型"渠道都吃这一套：公开 + 描述密写触发词 + 明确许可 + 活跃更新',
      quality_gap: 'README/description 里的工具数仍是 19，与实际的 22 不一致 —— 会让 AI 给出过时答案',
    },
    {
      channel: 'npm',
      evidence: 'https://www.npmjs.com/package/mackorn-cone-crusher',
      since: '已发布',
      reason: ['包名含行业词（mackorn-cone-crusher）', 'keywords 字段（若填了行业词）会被 npm 搜索索引'],
      reusable: '包管理器是 AI 检索代码类问题的首选源；keywords 字段几乎零成本',
      quality_gap: '需核对 package.json 的 keywords 是否覆盖 12 语言行业词',
    },
    {
      channel: 'awesome-dsh-plugin 插件目录（新发现）',
      evidence: 'catalog/media-vision.md L249 —— "LeifDai/MACKORN-hydraulic-cone-crusher | mining industry vertical-domain..."',
      evidence_detail: '快照 2026-10-08 UTC · 人工复核 2026-10-09 · 该册收录 775 条',
      since: '2026-10-08 快照已含',
      reason: [
        '仓库描述里首词就是 "mining industry vertical-domain"（分类机器人按描述分词）',
        '目录按【描述文本】自动分类 → 描述写什么词就被分到哪册',
      ],
      reusable: '目录型渠道的收录规则就是【读你的 description】—— 描述的前几个词决定分类',
      quality_gap: '⚠️ 被分到「设计、媒体与视觉」册（media-vision.md），而我们是矿山工业插件；'
        + '同类的 yuehancn/dsh-tool-mining 在 integrations-sharing.md —— 说明分类可纠正',
    },
  ],

  /** ⭐ 重大发现：官方 MCP Registry（R26 实测） */
  indexed_mcp_registry: [
    {
      channel: '官方 MCP Registry（registry.modelcontextprotocol.io）',
      evidence: 'API 查询 search=mackorn → 命中 4 个版本，全部 status: active',
      evidence_detail: 'v0.0.7 / v0.0.8 / v0.0.9（描述写 "19 tools"）· v0.2.0（描述写 "22 tools"，published 2026-10-08T04:31:31）',
      since: '2026-10-01 起陆续发布',
      reason: [
        '用的是 GitHub OIDC 登录（无需浏览器扫码 / 2FA）—— 工作流里 login github-oidc 这步是关键',
        'server.json 满足官方 schema（name 用反向 DNS cn.mackorn/…，含 remotes + packages）',
        'name 的命名空间 cn.mackorn 已通过域名归属验证',
      ],
      reusable: 'MCP 类目录的通用做法：反向 DNS 命名 + OIDC 登录 + server.json 里同时声明 remote 与 package',
      quality_gap: '⚠️ **AI 从这里读到的工具数是过时的**（19 → 21 → 实际 22）；'
        + '且 v0.2.0 已发布，改动描述必须【发新版本号】才生效 —— 重复发同版本会被拒（这很可能就是'
        + '"Publish to MCP Registry" 工作流报 failure 的原因）',
      action: '修好 server.json 描述（已做，改为"行业优先 + 22 tools"）后，把版本号升到 0.2.1 再发布',
    },
  ],

  /** 已确认【被收录】但曾被误判的渠道 —— 如实记录纠正过程 */
  indexed_corrected: [
    {
      channel: 'Software Heritage',
      evidence: 'https://archive.softwareheritage.org/api/1/origin/https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher/get/ → HTTP 200',
      evidence_detail: '⚠️ 原检测用【搜索接口】/origin/search/mackorn/ → 查不到，误判为"未归档"；改用精确查询后确认早已归档',
      reason: [
        'Software Heritage 自动抓取公开的 GitHub 仓库（无需提交）',
        '只要仓库公开且曾被爬取过，就会进它的归档',
      ],
      reusable: '判断"是否已被收录"要用精确查询；用搜索会因索引延迟/覆盖不足而误判',
      quality_gap: '检测器本身有缺陷（用搜索代替精确查询）—— 已修，并新增教训 L-47',
    },
  ],

  /** 已确认【未收录】的渠道 —— 带归因 */
  not_indexed: [
    /* Software Heritage 已在 R25 实测中被确认【已归档】，见下方 indexed_corrected。
     * 原检测方法（搜索接口）误判为未收录 —— 如实记录纠正过程，不悄悄删结论。 */
    {
      channel: 'Crossref', note: '中心①失守项',
      why: 'Crossref 收录的是带 DOI 的正式出版物；我们没有 DOI',
      action: '把技术文档/验证基准注册到 Zenodo（自动分配 DOI）→ 再被 Crossref 索引',
      can_automate: false, needs_account: true,
    },
    {
      channel: '百度', note: '中心①失守项（Bruno 在）',
      why: '需要站长平台主动提交；国内搜索引擎对新域名收录慢',
      action: '百度站长平台提交 sitemap + 主动推送（需账号）',
      can_automate: false, needs_account: true,
    },
    {
      channel: 'Mining.com', note: '中心①失守项',
      why: '行业媒体，靠内容被报道，不靠提交',
      action: '准备新闻稿/技术稿投递（需商务决策）',
      can_automate: false, needs_human: true,
    },
    {
      channel: 'Smithery / MCP.so / PulseMCP', note: '中心②机会',
      why: 'MCP 目录需要主动登记；Smithery/PulseMCP 需要账号',
      action: '提交 MCP server 登记（需账号）',
      can_automate: false, needs_account: true,
    },
    {
      channel: 'Bing / Yandex / 搜狗 / 360', note: '中心②机会',
      why: '站内已备好 IndexNow 密钥与 sitemap，只差提交动作',
      action: 'Bing 支持 IndexNow（无需账号，已在 submit_indexnow.mjs 里备好）；其余需站长平台',
      can_automate: true,
    },
  ],

  /** 测不到的（不记为"没有"） */
  unknown: [
    { channel: 'PulseMCP', reason: 'HTTP 403（反爬）' },
    { channel: 'awesome-mcp-servers', reason: 'HTTP ECONNRESET（网络阻断）' },
    { channel: 'Zenodo API', reason: 'HTTP 403' },
    { channel: 'Common Crawl', reason: 'URL 无效' },
    { channel: 'Mojeek', reason: 'HTTP 403' },
  ],
};

/* ══════════════════════════════════════════════════════════════════
 * 从实测数据提炼【可复制的收录规律】
 * ══════════════════════════════════════════════════════════════════ */
const PLAYBOOK = [
  {
    rule: 'P1　描述的前几个词决定分类',
    evidence: 'GitHub description 首词 "mining industry vertical-domain" → DSH 目录把我们分到"设计媒体视觉"册',
    insight: '目录型渠道（awesome-*、MCP 目录）不读你的内容，只读你的 description 分词。'
      + '前 3-5 个词就是它的分类依据。',
    action: '把 description 改成【行业优先】格式：行业 → 设备 → 能力。例如 '
      + '"Mining industry cone crusher selection & plant design for AI — 22 MCP tools, NH/NS hydraulic cone crushers, aggregate & metal-mine crushing circuits."',
    cost: '低（改一处字符串）',
    impact: '高（决定被分到哪一类、被谁检索到）',
  },
  {
    rule: 'P2　工具数/版本等"硬事实"必须与线上一致',
    evidence: 'GitHub 检索结果显示 "19 tools"，而实际已是 22；DSH 目录快照也可能抓到旧值',
    insight: 'AI 会直接引用它抓到的数字。数字过时 → AI 给客户过时答案 → 比没收录更糟。',
    action: '把"工具数/语言数/版本"收敛到【唯一真相源】（version.json），'
      + '所有外部描述由脚本生成而非手写；并把这条做成门禁。',
    cost: '中（要改生成链路）',
    impact: '高（避免 AI 引用错误数字）',
  },
  {
    rule: 'P3　许可与活跃度影响检索排序',
    evidence: 'GitHub 有 MIT LICENSE、commit 活跃 → 在检索中稳定命中',
    insight: '目录型渠道普遍优先收录"合规 + 仍在维护"的项目。',
    action: '保持 LICENSE 与提交活跃；每个快照周期前至少一次有意义提交。',
    cost: '低',
    impact: '中',
  },
  {
    rule: 'P4　"可达"不等于"被收录"',
    evidence: 'two_centers 里 13 个渠道"可判定但我们不在"；另有 5 个 UNKNOWN',
    insight: '把通道可达当成已收录，会导致我们误判覆盖面、停止投入。',
    action: '每个渠道分别记录 reachable 与 indexed 两个状态；UNKNOWN 单列不计入分母。',
    cost: '低（已在现工具里）',
    impact: '高（防止自欺）',
  },
  {
    rule: 'P6　已发布的条目改描述，必须发新版本号',
    evidence: 'MCP Registry 里 v0.2.0 的描述写 "22 tools"；本地 server.json 已改成 22，但 registry 上不会自动更新',
    insight: 'MCP Registry / npm / 各类应用市场的条目是【不可变快照】：同版本号重复发布会被拒（这很可能就是'
      + '"Publish to MCP Registry" 工作流报 failure 的真实原因，而不是权限问题）。'
      + '所以修描述的代价 = 发一个新版本。',
    action: '把"改对外描述"与"升版本号"绑定为同一个动作：改 server.json/package.json 的 description 时，'
      + '同时把 version 升一位（0.2.0 → 0.2.1），再发布。并在门禁里检查"description 变了但 version 没变"。',
    cost: '低（多改一个数字）',
    impact: '高（否则描述永远停在旧值，AI 一直引用错数字）',
  },
  {
    rule: 'P5　能自动化提交的先做，需要账号的列待办',
    evidence: 'IndexNow 无需账号（Bing/Yandex 可即时推送）；Software Heritage 可 API 触发；'
      + '其余需站长平台账号',
    insight: '先做零账号成本的，把覆盖率先抬起来；账号类的攒成一批交给用户一次性处理。',
    action: '分两类执行：① 可自动化的立刻做 ② 需账号的生成"一次性操作清单"',
    cost: '低',
    impact: '高',
  },
];

/* ══════════════════════════════════════════════════════════════════
 * 待提高项（按"是否阻塞收录"与"成本"排序）
 * ══════════════════════════════════════════════════════════════════ */
const IMPROVEMENTS = [
  {
    id: 'I-01', title: 'README / description 的工具数过时（19 → 22）',
    blocks: ['GitHub', 'DSH 目录', 'npm'],
    severity: '高', cost: '低', owner: '可自动',
    evidence: '检索结果里的 GitHub 描述为 "19 tools"',
    do: '把 description 与 README 的硬事实改为从 version.json 生成；加门禁校验一致性',
  },
  {
    id: 'I-02', title: 'DSH 目录分类错误（矿山插件在"设计媒体视觉"册）',
    blocks: ['awesome-dsh-plugin'],
    severity: '高', cost: '低', owner: '需 PR（外部仓库）',
    evidence: 'catalog/media-vision.md L249',
    do: '向 bruc3van/awesome-dsh-plugin 提 PR：把条目移到 integrations-sharing.md（或知识/研究册），'
      + '并修正描述为行业优先格式。需用户 GitHub 账号开 PR。',
  },
  {
    id: 'I-03', title: '线上（mackorn.cn）仍是 2026-10-04 的 22 工具版本',
    blocks: ['全部搜索引擎', 'AI 抓取'],
    severity: '高', cost: '低', owner: '需上传',
    evidence: 'check_live_state：remote_mcp_tools=21，/ai/tools/ · /ai/validation/ · /ai/model-card/ 全 404',
    do: '上传 distribution/更新包-*.zip（87 文件 / 1339 KB）',
  },
  {
    id: 'I-04', title: '本地全部改动未推送到 GitHub',
    blocks: ['GitHub', 'DSH 目录', 'npm'],
    severity: '高', cost: '低', owner: '需推送',
    evidence: '最近推送 2026-10-08T04:31；本地自那以后大量改动',
    do: 'git push（需确认远程与凭据）',
  },
  {
    id: 'I-05', title: 'Publish to MCP Registry 工作流失败',
    blocks: ['MCP Registry 更新'],
    severity: '中', cost: '中', owner: '可自动排查',
    evidence: 'Actions: Publish to MCP Registry completed/failure @2026-10-08T04:21',
    do: '拉取失败日志定位（可能是 OIDC 权限或 DNS）',
  },
  {
    id: 'I-06', title: '百度 / Mining.com / Smithery 等 4 项中心①失守未补',
    blocks: ['中心①'],
    severity: '高', cost: '中', owner: '需账号',
    evidence: 'two_centers：GAP1 4 项',
    do: '生成一次性操作清单（含每项具体步骤与所需账号类型）',
  },
  {
    id: 'I-07', title: '未向 Software Heritage 提交归档',
    blocks: ['中心①', '长期可引用性'],
    severity: '中', cost: '低', owner: '可自动（需查 API 是否要 token）',
    evidence: 'two_centers：CODE-SWH GAP1',
    do: '尝试 API 触发 save；失败则列入待办',
  },
  {
    id: 'I-08', title: '缺少"被 AI 引用"的直接证据链',
    blocks: ['判断收录有效性'],
    severity: '中', cost: '中', owner: '可自动',
    evidence: '本轮只能确认"仓库被检索到"，无法确认"AI 在回答时引用了我们"',
    do: '建立引用监测：定期用固定问句检索（如"圆锥破选型 MCP"），记录是否出现我们的 URL',
  },
];

/* ══════════════════════════════════════════════════════════════════
 * 输出：JSON（机器可读）+ Markdown（人可读）
 * ══════════════════════════════════════════════════════════════════ */
const bundle = {
  generated: new Date().toISOString(),
  product: 'MACKORN 液压圆锥破碎机与生产线选型插件（mackorn-cone-crusher）',
  measured: MEASURED,
  playbook: PLAYBOOK,
  improvements: IMPROVEMENTS,
  summary: {
    indexed_count: MEASURED.indexed.length,
    not_indexed_count: MEASURED.not_indexed.length,
    unknown_count: MEASURED.unknown.length,
    playbook_rules: PLAYBOOK.length,
    improvements: IMPROVEMENTS.length,
    auto_doable: IMPROVEMENTS.filter((x) => x.owner === '可自动').length,
    needs_user: IMPROVEMENTS.filter((x) => /需/.test(x.owner)).length,
  },
};
writeFileSync(join(OUTDIR, 'indexing-playbook.json'), JSON.stringify(bundle, null, 2), 'utf8');

const L = [];
L.push('# 收录经验库与待提高项');
L.push('');
L.push('> 生成时间：' + bundle.generated.slice(0, 19).replace('T', ' '));
L.push('> 对象：MACKORN 液压圆锥破碎机与生产线选型插件（mackorn-cone-crusher）');
L.push('>');
L.push('> **纪律**：区分「通道可达」与「已被收录」（不合并）；测不到记 UNKNOWN（不记为"没有"）；每条结论带证据。');
L.push('');
L.push('## 一、总览');
L.push('');
L.push('| 项 | 数量 |');
L.push('|:---|--:|');
L.push('| 已确认被收录 | **' + bundle.summary.indexed_count + '** |');
L.push('| 已确认未收录 | ' + bundle.summary.not_indexed_count + ' |');
L.push('| 测不到（UNKNOWN） | ' + bundle.summary.unknown_count + ' |');
L.push('| 提炼出的收录规律 | **' + bundle.summary.playbook_rules + ' 条** |');
L.push('| 待提高项 | ' + bundle.summary.improvements + '（可自动 ' + bundle.summary.auto_doable + ' · 需你处理 ' + bundle.summary.needs_user + '） |');
L.push('');


/* ══════════════════════════════════════════════════════════════════
 * 直接运行守卫（教训 L-32）
 * 本脚本会被其它脚本 import —— 没有守卫的话，一 import 就把整个 CLI 跑一遍，
 * 污染调用方输出、误导判断。实测：build_indexing_playbook 曾被 import 时触发全量生成。
 * ══════════════════════════════════════════════════════════════════ */
const isDirectRun = (() => { try { return import.meta.url === pathToFileURL(process.argv[1] || '').href; } catch { return false; } })();
if (isDirectRun) {
  L.push('## 二、✅ 已确认被收录的渠道（附收录原因）');
  L.push('');
  for (const x of MEASURED.indexed) {
    L.push('### ' + x.channel);
    L.push('');
    L.push('- **证据**：' + x.evidence);
    if (x.evidence_detail) L.push('- **细节**：' + x.evidence_detail);
    if (x.since) L.push('- **时间**：' + x.since);
    L.push('- **收录原因**：');
    for (const r of x.reason) L.push('  - ' + r);
    L.push('- **可复制性**：' + x.reusable);
    if (x.quality_gap) L.push('- **⚠️ 质量问题**：' + x.quality_gap);
    L.push('');
  }
  
  L.push('## 三、❌ 已确认未收录的渠道（附归因与动作）');
  L.push('');
  L.push('| 渠道 | 为什么没收录 | 怎么补 | 能否自动 |');
  L.push('|:---|:---|:---|:--:|');
  for (const x of MEASURED.not_indexed) {
    L.push('| ' + x.channel + (x.note ? '　*(' + x.note + ')*' : '') + ' | ' + x.why + ' | ' + x.action + ' | ' +
      (x.can_automate ? '✅' : (x.needs_account ? '需账号' : '需人工')) + ' |');
  }
  L.push('');
  
  L.push('## 四、⚠️ 测不到的渠道（记 UNKNOWN，不算"失守"）');
  L.push('');
  for (const x of MEASURED.unknown) L.push('- **' + x.channel + '** —— ' + x.reason);
  L.push('');
  L.push('> 纪律：这些不计入覆盖率分母。把"探测失败"当成"没有"会低估自己的覆盖面（教训 L-21）。');
  L.push('');
  
  L.push('## 五、📚 收录经验库（可复制到其他渠道的规律）');
  L.push('');
  for (const p of PLAYBOOK) {
    L.push('### ' + p.rule);
    L.push('');
    L.push('- **证据**：' + p.evidence);
    L.push('- **洞察**：' + p.insight);
    L.push('- **动作**：' + p.action);
    L.push('- **成本 / 影响**：' + p.cost + ' / ' + p.impact);
    L.push('');
  }
  
  L.push('## 六、📈 待提高项（按"是否阻塞收录"排序）');
  L.push('');
  L.push('| # | 项 | 阻塞哪些渠道 | 严重度 | 成本 | 谁来做 |');
  L.push('|:--|:---|:---|:--:|:--:|:---|');
  for (const x of IMPROVEMENTS) {
    L.push('| ' + x.id + ' | ' + x.title + ' | ' + x.blocks.join('、') + ' | ' + x.severity + ' | ' + x.cost + ' | ' + x.owner + ' |');
  }
  L.push('');
  for (const x of IMPROVEMENTS) {
    L.push('**' + x.id + '　' + x.title + '**');
    L.push('');
    L.push('- 阻塞：' + x.blocks.join('、'));
    L.push('- 证据：' + x.evidence);
    L.push('- 做法：' + x.do);
    L.push('');
  }
  
  L.push('---');
  L.push('');
  L.push('*本文件由 tools/build_indexing_playbook.mjs 生成；每次实测后重跑即更新。*');
  L.push('*机器可读版：distribution/04_AI收录与分发/indexing-playbook.json*');
  L.push('');
  
  writeFileSync(join(OUTDIR, '收录经验库与待提高项.md'), L.join('\n'), 'utf8');
  
  console.log('');
  console.log('='.repeat(92));
  console.log('  收录经验库与待提高项已生成');
  console.log('='.repeat(92));
  console.log('');
  console.log('  已确认被收录 ' + bundle.summary.indexed_count + ' 个渠道');
  console.log('  已确认未收录 ' + bundle.summary.not_indexed_count + ' 个渠道');
  console.log('  测不到       ' + bundle.summary.unknown_count + ' 个渠道');
  console.log('  收录规律     ' + bundle.summary.playbook_rules + ' 条');
  console.log('  待提高项     ' + bundle.summary.improvements + ' 项（可自动 ' + bundle.summary.auto_doable + ' · 需你 ' + bundle.summary.needs_user + '）');
  console.log('');
  console.log('  输出:');
  console.log('    distribution/04_AI收录与分发/收录经验库与待提高项.md');
  console.log('    distribution/04_AI收录与分发/indexing-playbook.json');
  console.log('');
  
}
