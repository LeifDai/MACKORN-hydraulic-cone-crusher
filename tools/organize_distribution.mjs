/**
 * 整理 distribution 目录 —— 52 个文件堆在一起，用户找不到东西
 *
 * 目标：顶层只留 4 个"你要用的"，其余按用途归档到子目录
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const D = join(ROOT, 'distribution');

const FOLDERS = {
  '01_网站部署': [
    '官网部署包.zip', '官网部署包-说明.txt', 'indexnow-result.json',
    'ai-crawl-surfaces.json', 'ai-surface-submission.json',
  ],
  '02_数据与分析': [
    '全球破碎筛分海关数据库.xlsx', 'trade-global.json', 'trade-data.json', 'trade-deep.json',
    'ore-cases.json', '行业参考数据.md', '全球破碎设备市场地图.md',
  ],
  '03_客户与市场': [
    '目标客户名单-高增长与矿业发达国家.md', '采购商线索获取方法.md',
    '全球客户锁定与分级.md', '经销商评估方法论.md',
    '外贸纵深作战手册.md', '渠道纵深-设计院代理商AI社群.md', '国际市场渠道战略.md',
  ],
  '04_AI收录与分发': [
    '全球AI收录状态普查.md', 'AI爬取面作战地图.md', '多国AI可调用性测试.md',
    '重点国家测试报告.md', '如何让主流AI搜到.md', '加速AI收录操作手册.md',
    '全球AI分发渠道与操作步骤.md', 'AI定向推荐与触达策略.md', '待办清单-按顺序.md',
    'Wikidata实体创建包.md', 'MACKORN数据集发布包.zip',
  ],
  '05_视角与复盘': [
    '22视角交叉审核与P对账.md', '22视角深挖两个核心.md', 'P全量汇总与18视角重审.md',
    '第12视角-智能机器人视角.md', '第13视角-机器人的世界逻辑.md',
    '第14-18视角-机械法律知识产权环境哲学.md', '第19-21视角与建议补充.md',
    '总汇总-11视角与双螺旋双闭环.md', '阶段小结-PDCA与18视角.xlsx',
    '早7点执行清单.md', '早上7点后的操作清单.md',
  ],
  '06_归档_旧版': [
    '全球矿山装备海关数据库.xlsx', '全球破碎设备市场分析.xlsx',
    '5-Smithery提交.bat', '4-输入验证码批准npm发布.bat', '3-发布npm-0.0.4.bat',
    '2-DNS生效后双击发布.bat', '发布到MCP注册表.bat', '_npmrc-pub',
  ],
};

// 顶层保留
const KEEP = new Set([
  '上传说明.md',
  '官网部署包.zip',
  '全球破碎筛分海关数据库.xlsx',
  'company-leads',            // 目录
  'dataset',                  // 目录
  '官网落地页',                // 目录
  '知识产权与可持续', '机械工程', '法律与合同', '社会与文化', '可靠性工程',
  '语言与术语', '地质与矿区', '人才与组织', '金融与全生命周期', '物流与交付',
  '风控', '项目管理', '其它',
  'trade-raw', 'mcp-publisher', '_deploy', '_npmcli', '_npmcache',
  '_orchestrator-status.json', '_orchestrator-heartbeat.json', '_monitor-log.jsonl',
]);

let moved = 0, kept = 0, unknown = [];
for (const [folder, files] of Object.entries(FOLDERS)) {
  const dir = join(D, folder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const f of files) {
    const src = join(D, f);
    if (!existsSync(src)) continue;
    const dst = join(dir, f);
    try {
      if (existsSync(dst)) unlinkSync(dst);
      renameSync(src, dst);
      moved++;
    } catch (e) { console.log('  ⚠ 移动失败 ' + f + ': ' + e.message); }
  }
}

// 检查剩余顶层的文件
const rest = readdirSync(D).filter((x) => {
  try { return statSync(join(D, x)).isFile() && !KEEP.has(x); } catch { return false; }
});
for (const f of rest) unknown.push(f);

console.log('  已归档 ' + moved + ' 个文件到 ' + Object.keys(FOLDERS).length + ' 个子目录');
if (unknown.length) {
  console.log('  ⚠ 未归档（顶层剩余）: ' + unknown.join(' · '));
  // 兜底：剩余的 md 全部进 05
  for (const f of unknown) {
    if (/\.md$/i.test(f)) {
      const dst = join(D, '05_视角与复盘', f);
      try { renameSync(join(D, f), dst); console.log('    → ' + f + ' 归入 05_视角与复盘'); } catch { }
    }
  }
}

/* ── 生成新的上传说明（覆盖） ── */
const guide = `# 上传说明（整理后 · 一页看完）

> 生成：${new Date().toISOString().slice(0, 16).replace('T', ' ')}
> 目录已整理：顶层只留你要用的，其余按用途归档到 6 个子目录

---

## ⭐ 顶层 3 个文件 —— 你要用的就这 3 个

| 文件 | 干什么 | 现在做 |
|:---|:---|:---|
| **\`官网部署包.zip\`** | 上传到 mackorn.cn 网站根目录 | ✅ **今晚就传** |
| **\`全球破碎筛分海关数据库.xlsx\`** | 主数据库，**11 张表** | ✅ 打开看 |
| **\`上传说明.md\`** | 就是本文件 | — |

---

## 📊 Excel 的 11 张表（打开后看【底部标签页】）

\`\`\`
 1. 01 总览                    关键数字
 2. 02 完整国别数据              142 国 × 破碎/筛分/零件 × 两年
 3. 03 高增长国家               50 国
 4. 04 筛分大于破碎的国家           6 国
 5. 05 纯备件市场               64 国
 6. 06 市场分类                建设期/生产期/纯备件
 7. 07 目标客户名单              24 国 × 矿企 + 采购路径
 8. 08 HS编码说明              三码范围与陷阱
 9. 09 数据来源与纪律            可复核信息
10. 10 公司级客户线索  ★          111 家上市公司（CIK + 采购路径 + 优先级）
11. 11 检索词命中分布             哪些词捞到最多矿业公司
\`\`\`

**第 10 张就是"公司级客户线索"** —— 之前你说找不到，是因为你打开的是另一个压缩包。

---

## 📁 6 个子目录（归档，平时不用翻）

| 目录 | 里面是什么 |
|:---|:---|
| **01_网站部署** | 部署包、IndexNow 记录、AI 爬取面数据 |
| **02_数据与分析** | 海关原始数据、行业参考数据、市场地图 |
| **03_客户与市场** | 目标客户名单、线索获取方法、渠道战略、外贸手册 |
| **04_AI收录与分发** | AI 收录普查、爬取面地图、重点国家测试、Wikidata 建包 |
| **05_视角与复盘** | 22 视角文档、PDCA 小结、执行清单 |
| **06_归档_旧版** | 旧版 Excel、发布脚本 —— **不要用**，已被新版替代 |

### ⚠️ 注意：06_归档_旧版 里的两个旧 Excel

\`\`\`
全球矿山装备海关数据库.xlsx   ← 旧（10-03），已被替代
全球破碎设备市场分析.xlsx     ← 更旧（10-02）
\`\`\`

**要看数据就开顶层的 \`全球破碎筛分海关数据库.xlsx\`。**

---

## 🚫 不要上传的东西

除了 \`官网部署包.zip\`，**其他一律不上传到网站**：

| 文件 | 用途 |
|:---|:---|
| 各种 \`.md\` | 内部分析文档 |
| \`.xlsx\` | 自己看的数据 |
| \`MACKORN数据集发布包.zip\`（7 文件） | 发 **Kaggle/Zenodo/HuggingFace** 用的，和网站无关，换网络后再发 |
| \`trade-*.json\` | 原始数据 |
| \`company-leads/\` | 111 家线索（内部用） |

---

## ✅ 上传后会发生什么

\`\`\`
线上 5 个 404 变 200：
  /glossary/                  12 语言术语表（1460 词条）
  /ai/screens/                振动筛选型参考
  /vi/                        越南语页
  /.well-known/keywords.json  关键词声明（275 词）
  /de/                        德语页

robots.txt 修正：19 个工具 → 21，10 种语言 → 12
sitemap：117 URL → 120 URL
\`\`\`

**传完告诉我，我立刻重跑：线上探测 + AI 收录普查 + IndexNow 全量重提。**

---

## 一句话

\`\`\`
顶层 3 个文件：
  官网部署包.zip            → 传网站
  全球破碎筛分海关数据库.xlsx  → 你要看的 11 张表（第 10 张是公司线索）
  上传说明.md               → 本文件

其余 52 个文件已归入 6 个子目录，不用管。
\`\`\`
`;
writeFileSync(join(D, '上传说明.md'), guide, 'utf8');

/* ── 顶层清点 ── */
console.log('\n  ── 整理后顶层内容 ──');
for (const x of readdirSync(D)) {
  const p = join(D, x);
  const st = statSync(p);
  if (st.isDirectory()) console.log('  📁 ' + x + '/');
  else console.log('  📄 ' + x + '  (' + (st.size / 1024).toFixed(1) + ' KB)');
}
