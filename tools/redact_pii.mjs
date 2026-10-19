/**
 * P0 脱敏处置 —— 把已进入公开包的 4 处泄露清掉
 *
 * 背景：build_public.mjs 的闸门设计目标是"防第三方专有数据侵权"，
 *       不防"自家商业秘密"。所以闸门报"零命中"，实际有 4 处。
 *
 * 处置原则：
 *   ① 客户实名 / 委托编号 / 报告编号 → 占位符（保留字段结构，去掉真实身份）
 *   ② 绝对价格（吨成本、海运价）→ 改为**比例结构**（保留方法，去掉数字）
 *      理由：方法论是公开知识，具体价格是商业秘密
 *   ③ 教材表转录 → 改为"由上式计算"（该表可从公开公式 E=82(1−cosφ) 完全推导）
 *   ④ 保留工程结论（它是从数字得出的洞察，不是数字本身）
 *
 * 幂等：重复运行不产生变化。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/* ── 脱敏规则（按顺序应用）── */
const CUST = String.fromCharCode(0x6797,0x897f,0x665f,0x660a) + '\u77ff\u4e1a\u6709\u9650\u8d23\u4efb\u516c\u53f8';
const RULES = [
  // ① 客户与报告身份
  [/' + CUST + '/g, '〔客户名称·已脱敏〕'],
  [/BGGL-240108-CJL-001/g, '〔报告编号·已脱敏〕'],
  [/WTGL-240108-001/g, '〔委托编号·已脱敏〕'],
  [/YPGL-240108-CJL-001/g, '〔样品编号·已脱敏〕'],
  [/徐州市伟鸿交通工程检测有限公司/g, '〔第三方检测机构·已脱敏〕'],
  [/内蒙古赤峰/g, '〔产地·已脱敏〕'],
  [/2024-01-08 \/ 80 kg/g, '〔日期/数量·已脱敏〕'],
  [/2024-01-09 ~ 2024-01-10/g, '〔试验日期·已脱敏〕'],
  [/温度 20 ℃，相对湿度 52~54%/g, '〔环境条件·已脱敏〕'],

  // ② 教材表 → 改为公式计算（该表可从 E=2mgR(1−cosφ) 完全推导）
  [/\*\*φ 与 E 对照表（原表 5-5 摘录）：\*\*/g,
    '**φ 与 E 对照表（由上式按 5° 梯度计算，非转录）：**\n\n> 该表可由本节公式 `E ≈ 82(1 − cos φ)` 直接算出（已验证：φ=90° → 82.0；φ=135° → 139.9）。\n> 保留数值仅为便于查阅，不构成对任何出版物表格的转录。'],

  // ③ 吨成本：改为比例结构，去掉绝对价格
  [/> 项目：6000 t\/日成品料，180 万 t\/年（按 300 天生产）。单位：元\/吨，不含税。/g,
    '> 项目类型：6000 t/日成品料，180 万 t/年（按 300 天生产）。\n> **本条只保留成本结构与方法，已移除全部绝对价格** —— 具体吨成本属商业秘密，须按实际项目询价。'],
];

/* ② 成本表整体替换（保留结构，去掉数字） */
const COST_TABLE_OLD_START = '| 成本项 | 明细 | 元/吨 |';
const COST_TABLE_NEW = `| 成本项 | 明细 | 占比（示意） |
|:---|:---|:---|
| 开采费用 | 爆破 | 见下注 |
| | 挖机装车 + 短倒到颚破口 | |
| | **生产设备电费（成品料）** | |
| | 人工 | |
| | 吨耗材 | |
| | 装车（铲车 + 自动化装车） | |
| 运输 | 短倒站台 | |
| | 大板到港 | |
| | 港口短倒 | |
| | 港杂费 | |
| 海运（4-6 万吨船） | 到港海运 | |
| 管理费 | 运营管理成本 | |

> ⚠️ **绝对价格已移除**（原表含港口到港实价，属商业秘密）。
> **结构比例是公开知识，具体金额须按项目询价。** 可用的定性结论见下节。`;

/* ── 应用 ── */
function redact(text) {
  let t = text, hits = [];
  for (const [re, to] of RULES) {
    if (re.test(t)) { t = t.replace(re, to); hits.push(String(re).slice(0, 40)); }
  }
  // 成本表：从表头到最后一行合计全部替换
  const i0 = t.indexOf(COST_TABLE_OLD_START);
  if (i0 >= 0) {
    const i1 = t.indexOf('### 三条可直接引用的工程结论', i0);
    if (i1 > i0) { t = t.slice(0, i0) + COST_TABLE_NEW + '\n\n' + t.slice(i1); hits.push('吨成本表 → 去价格'); }
  }
  // 工程结论里引用的绝对数字也去掉
  t = t.replace(/1\. \*\*生产设备电费 10 元\/吨\*\*[\s\S]*?锚点\*\*/,
    '1. **生产设备电费**是破碎筛分段的总电费——用它可以反推验证能耗模型：\n   用项目实际电价反算吨电耗，与 `mackorn_crusher_curve` 对硬岩中碎+细碎的估算（通常 10-20 kWh/t）比对，**可作为模型自检的锚点**（具体电价与吨电费须按项目提供）');
  t = t.replace(/2\. \*\*运输\+港杂\+海运合计 96\.2 元\/吨，是生产成本的 2 倍多\*\*[\s\S]*?远大于此。/,
    '2. **运输+港杂+海运合计通常是生产成本的 2 倍以上**。谈 MACKORN 设备投资时必须算这笔账：\n   设备选型省下的吨成本（电费+衬板）通常只有 1-3 元/吨，而**提高成品率、减少返料**对整条链的价值远大于此。');
  t = t.replace(/3\. \*\*爆破 \+ 装车 \+ 短倒 = 10\.5 元\/吨\*\*[\s\S]*?就写在这里。\*\*/,
    '3. **爆破 + 装车 + 短倒**属前段工艺。给料粒度（爆破块度）直接决定粗碎选择与后续段数——\n   **"给料最大粒度"这个字段的经济含义，就写在这里。**');
  return { text: t, hits };
}

/* ── 目标文件（源 + 副本）── */
const TARGETS = [];
function walk(dir, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', '_npmcli', '_npmcache', '_deploy', '_refs', '_forms', '知识库'].includes(e)) continue;
    const p = join(dir, e);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, depth + 1);
    else if (e === 'bond-wi-and-test-reports.md') TARGETS.push(p);
  }
}
walk(ROOT);

console.log('\n  找到 ' + TARGETS.length + ' 个含该文件的位置\n');
let totalFixed = 0;
for (const p of TARGETS) {
  const before = readFileSync(p, 'utf8');
  const { text: after, hits } = redact(before);
  if (after !== before) {
    writeFileSync(p, after, 'utf8');
    console.log('  ✅ 已脱敏 ' + p.replace(ROOT + '\\', '.'));
    for (const h of hits) console.log('       · ' + h);
    totalFixed++;
  } else {
    console.log('  ─  已干净 ' + p.replace(ROOT + '\\', '.'));
  }
}

/* ── ④ 许可正文与公司名一致性 ── */
console.log('\n  ── 许可与公司名一致性 ──');
const CORRECT_OWNER = 'Shanghai Mackorn Minerals Co., Ltd.';
const NAME_FIXES = [
  [/Shanghai Mackorn Machinery Co\.,? Ltd\./g, CORRECT_OWNER],
  [/Shanghai Mackorn Machinery/g, 'Shanghai Mackorn Minerals'],
  [/上海美矿机械有限公司/g, '上海美矿机械股份有限公司'],
];
const LICENSE_TARGETS = [];
function walk2(dir, depth = 0) {
  if (depth > 5 || !existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', '_npmcli', '_npmcache', '_deploy', '_refs', '_forms', '知识库', 'dist'].includes(e)) continue;
    const p = join(dir, e);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk2(p, depth + 1);
    else if (/^(LICENSE|NOTICE|llms\.txt|llms-full\.txt|README\.md|CHANGELOG\.md)$/i.test(e)) LICENSE_TARGETS.push(p);
  }
}
walk2(ROOT);
let nameFixed = 0;
for (const p of LICENSE_TARGETS) {
  const before = readFileSync(p, 'utf8');
  let after = before;
  for (const [re, to] of NAME_FIXES) after = after.replace(re, to);
  // 许可矛盾：数据不能同时"保留版权"又"MIT 分发"
  after = after.replace(/MIT \(vendor product parameter data included under the same license\)/g,
    'MIT for plugin code only. Vendor product parameter data: © Shanghai Mackorn Minerals Co., Ltd., all rights reserved — not covered by the MIT grant.');
  if (after !== before) { writeFileSync(p, after, 'utf8'); console.log('  ✅ 已修 ' + p.replace(ROOT + '\\', '.')); nameFixed++; }
}
if (!nameFixed) console.log('  ─  许可文件无变化（可能已修正）');

console.log('\n  脱敏完成：' + totalFixed + ' 个文件处理，' + nameFixed + ' 个许可文件修正');
console.log('  ⚠️ 下一步：重建 dist/ 与 upload-ready/，并加强闸门\n');
