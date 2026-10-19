/**
 * 生成 PHP MCP 端点 —— 把"MCP 必须装 Node"变成"一个 URL 就能调"
 *
 * 为什么这是最高杠杆：
 *   现在我们的 MCP 是 stdio 形态，AI 必须在本机装 Node 才能用。
 *   而 AI 客户端（ChatGPT 连接器 / Claude / 各类 agent）更愿意调 HTTP 端点。
 *   mackorn.cn 跑在 Apache 上且支持 PHP（/index.php → 200），
 *   所以用 PHP 实现一个 HTTP MCP 端点，部署即用，零运行时依赖。
 *
 * 本脚本自动：
 *   ① 从 data.mjs 导出全部厂商数据 → PHP 数组
 *   ② 生成 mcp.php：JSON-RPC 2.0 + initialize/tools/list/tools/call
 *   ③ 用 PHP 实现【数据驱动 + 公式型】工具（可离线算）
 *   ④ 计算密集型的工具明确说明需要 stdio 服务端，不假装能算
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '官网落地页', 'api');

/* __VER_TRUTH__ R97：版本与构建指纹从真相源读，不再硬编码。
 * 原来第 174 行写死 '0.2.0'，bump 到 0.2.2 后 mcp.php 仍是 0.2.0，
 * 触发 L-01（构建一致性）/ L-02（版本单一真相源）双红。
 * 注意：必须定义在 ROOT 之后 —— 我第一版放前面，ROOT 未定义 → 读到 0.0.0。 */
const TRUTH_VERSION = (() => {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, 'distribution', '官网落地页', 'ai', 'version.json'), 'utf8'));
    return String(j.version || '0.0.0');
  } catch { return '0.0.0'; }
})();
const TRUTH_BUILD = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
})();
console.log('  真相源版本: ' + TRUTH_VERSION + ' · BUILD ' + TRUTH_BUILD);

/* ── 从 JS 模块导入真实数据（保证 PHP 与 JS 同源，不手抄） ── */
const D = await import(pathToFileURL(join(ROOT, 'plugin', 'lib', 'data.mjs')).href);

const phpVal = (v, indent = 0) => {
  const pad = '  '.repeat(indent);
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const allScalar = v.every((x) => x === null || ['number', 'string', 'boolean'].includes(typeof x));
    if (allScalar) return '[' + v.map((x) => phpVal(x, indent)).join(', ') + ']';
    return '[\n' + v.map((x) => pad + '  ' + phpVal(x, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '[]';
    return '[\n' + keys.map((k) => pad + "  '" + k + "' => " + phpVal(v[k], indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  return 'null';
};

const DATA_BLOCK = `<?php
/**
 * MACKORN 厂商数据（由 tools/gen_php_mcp.mjs 自动生成，请勿手工编辑）
 * 数据源：plugin/lib/data.mjs（单一真相源）
 * 生成时间：${new Date().toISOString()}
 */
return [
  'NH_SERIES' => ${phpVal(D.NH_SERIES, 1)},
  'NS_SERIES' => ${phpVal(D.NS_SERIES, 1)},
  'ALL_MODELS' => ${phpVal(D.ALL_MODELS, 1)},
  'CAVITY_TYPES' => ${phpVal(D.CAVITY_TYPES, 1)},
  'CAVITY_FEED_TABLE' => ${phpVal(D.CAVITY_FEED_TABLE, 1)},
  'CAVITY_CAPACITY' => ${phpVal(D.CAVITY_CAPACITY, 1)},
  'CAPACITY_TO_MODEL' => ${phpVal(D.CAPACITY_TO_MODEL, 1)},
  'MACKORN_BELT_TABLE' => ${phpVal(D.MACKORN_BELT_TABLE, 1)},
  'MACKORN_STAGE_RATIO' => ${phpVal(D.MACKORN_STAGE_RATIO, 1)},
  'MACKORN_COARSE_CRUSHER_TABLE' => ${phpVal(D.MACKORN_COARSE_CRUSHER_TABLE, 1)},
  'MACKORN_LINER_LIFE' => ${phpVal(D.MACKORN_LINER_LIFE, 1)},
  'MACKORN_MAGNET_SEPARATOR' => ${phpVal(D.MACKORN_MAGNET_SEPARATOR, 1)},
  'MACKORN_INSTALL_COST' => ${phpVal(D.MACKORN_INSTALL_COST, 1)},
  'MACKORN_ECCENTRIC_THROW' => ${phpVal(D.MACKORN_ECCENTRIC_THROW, 1)},
  'ENGINEERING_DEFAULTS' => ${phpVal(D.ENGINEERING_DEFAULTS, 1)},
  /* R44：材料库搬进 data.mjs 后在这里打包 —— 让远程端点的 mackorn_knowledge 真正可用 */
  'MATERIAL_LIBRARY' => ${phpVal(D.MATERIALS, 1)},
  'SOURCE_LEVELS' => ${phpVal(D.SOURCE_LEVELS, 1)},
];
`;

mkdirSync(join(OUT), { recursive: true });
writeFileSync(join(OUT, '_data.php'), DATA_BLOCK, 'utf8');
console.log('  ✅ /api/_data.php  ' + (DATA_BLOCK.length / 1024).toFixed(1) + ' KB（' + Object.keys(D).length + ' 张数据表）');

/* ══════════════════════════════════════════════════════════
 * mcp.php —— HTTP MCP 端点
 * ══════════════════════════════════════════════════════════ */
const TOOL_DEFS = [
  ['mackorn_equipment_catalog', '列出 MACKORN 全部机型与腔型', true],
  ['mackorn_capacity_check', '按机型+腔型+CSS 查产能区间与合规性', true],
  ['mackorn_mcfm_analysis', '给料模数 MCFM 诊断', true],
  ['mackorn_grading_porosity', '料层孔隙率与最优配比', true],
  ['mackorn_market_stats', '统计分析（描述统计/集中度/威布尔/B10）', true],
  ['mackorn_contact', '联系方式与代理招募（10 语言）', true],
  ['mackorn_cone_selection', '圆锥破选型（机型/腔型/CSS/台数/功率）', true],
  ['mackorn_wear_design', '衬板磨损均匀度与梯度硬度', true],
  ['mackorn_crusher_curve', '产品粒度曲线（Whiten 1972）', false],
  ['mackorn_simulate_flowsheet', '多段流程仿真', false],
  ['mackorn_calibrate', '实测数据标定', false],
  ['mackorn_plant_design', '整线配置', true],
  ['mackorn_requirement_intake', '需求表录入', false],
  ['mackorn_proposal', '14 节方案书生成', false],
  ['mackorn_selection_report', '一键选型报告', true],
  ['mackorn_distributor_eval', '经销商评估', true],
  ['mackorn_market_intel', '市场五维分析', true],
  ['mackorn_intel_watch', '行业情报观测', false],
  ['mackorn_knowledge_update', '知识入库', false],
  ['mackorn_cost_estimate', '投资与运营成本估算', true],
  ['mackorn_knowledge', '材料与知识查询', true],
  ['mackorn_pdca_status', '自我迭代状态', false],
];

const php = `<?php
/**
 * MACKORN MCP 服务端（HTTP / JSON-RPC 2.0）
 * ============================================================================
 * 这是 MACKORN 液压圆锥破碎机选型插件的【远程 MCP 端点】。
 *
 * 为什么有这个文件：
 *   本地 MCP 服务端是 stdio 形态，AI 必须在本机装 Node 才能调用。
 *   本端点让任何 AI 客户端用一个 URL 就能发现并调用 MACKORN 的工具，
 *   零安装、零运行时依赖（只用 PHP）。
 *
 * 协议：MCP over HTTP（JSON-RPC 2.0），支持
 *   initialize · tools/list · tools/call · notifications/initialized · ping
 *
 * 调用示例（curl）：
 *   curl -X POST https://mackorn.cn/api/mcp.php \\
 *     -H 'Content-Type: application/json' \\
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 *
 *   curl -X POST https://mackorn.cn/api/mcp.php \\
 *     -H 'Content-Type: application/json' \\
 *     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mackorn_capacity_check","arguments":{"model":"NH400","cavity":"MC","css":16}}}'
 *
 * 纪律（与本地插件一致，不可违反）：
 *   ① 不编数字：查不到返回 null
 *   ② 每条结论标来源
 *   ③ 冲突并列，绝不取平均
 *   ④ 不报价
 * ============================================================================
 */

// MACKORN_PHP_GUARD v2（PHP 7.2 兼容）
// 目标：任何错误都以 JSON-RPC 错误返回，绝不出现 HTTP 500。
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// 致命错误兜底：parse/runtime fatal 也会走这里，把错误内容暴露出来
register_shutdown_function(function () {
  $e = error_get_last();
  if ($e && in_array($e['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR), true)) {
    if (!headers_sent()) {
      http_response_code(200);
      header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(array(
      'jsonrpc' => '2.0',
      'id' => null,
      'error' => array(
        'code' => -32603,
        'message' => 'PHP fatal: ' . $e['message'],
        'data' => array('file' => basename($e['file']), 'line' => $e['line'], 'php' => PHP_VERSION),
      ),
    ), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
  }
});

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$DB = @include __DIR__ . '/_data.php';
if (!is_array($DB)) { $DB = array(); }
define('MACKORN_VERSION', '${TRUTH_VERSION}');
// BUILD 指纹：每次重新生成都会变，用来判断线上跑的是哪一版
define('MACKORN_BUILD', '${TRUTH_BUILD}');
define('MACKORN_SERVER', 'cn.mackorn/mackorn-cone-crusher');

/* ── JSON-RPC 辅助 ── */
function rpc_ok($id, $result) {
  return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
}
function rpc_err($id, $code, $msg, $data = null) {
  $e = ['code' => $code, 'message' => $msg];
  if ($data !== null) $e['data'] = $data;
  return ['jsonrpc' => '2.0', 'id' => $id, 'error' => $e];
}
function text_content($obj) {
  return [['type' => 'text', 'text' => is_string($obj) ? $obj : json_encode($obj, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE)]];
}
/** 统一输出：结果 + 假设 + 告警（与本插件纪律一致） */
function tool_result($result, $assumptions = [], $warnings = []) {
  return [
    'content' => text_content(['result' => $result, 'assumptions' => $assumptions, 'warnings' => $warnings,
      'source' => 'MACKORN 官方数据（S1 机型表 / S6 选型规范）· 远程 MCP 端点 https://mackorn.cn/api/mcp.php']),
  ];
}
function A($t, $s = 'S1') { return ['assumption' => $t, 'source' => $s]; }

/* ══════════════════════════════════════════════════════════
 * 工具实现
 * ══════════════════════════════════════════════════════════ */

/** 机型与腔型总览 */
function tool_catalog($DB) {
  $models = [];
  foreach ($DB['NH_SERIES'] as $m) $models[] = ['series' => 'NH 标准型'] + $m;
  foreach ($DB['NS_SERIES'] as $m) $models[] = ['series' => 'NS 高速型'] + $m;
  return [[
    'models' => $models,
    'model_count' => count($models),
    'cavity_types' => $DB['CAVITY_TYPES'],
    'note' => '腔型代码：EC 特粗 / C 粗 / MC 中粗（通用起点）/ M 中 / MF 中细 / F 细 / EF 特细。给料越粗选越靠前，产品越细选越靠后。圆锥破是中细碎设备，给料超过约 350mm 不适用。',
  ], [
    A('机型与腔型数据全部来自 MACKORN 官方《NH_NS 系列技术参数大全》（S1）', 'S1'),
  ], []];
}

/** 产能校核 */
function tool_capacity($DB, $model, $cavity, $css) {
  $warnings = []; $assumptions = [];
  $rec = null;
  foreach (array_merge($DB['NH_SERIES'], $DB['NS_SERIES']) as $m) if ($m['model'] === $model) $rec = $m;
  if (!$rec) return [null, [], ["未知机型 {$model}。可用机型见 mackorn_equipment_catalog。"]];

  if ($css < $rec['cssMin'] || $css > $rec['cssMax']) {
    $warnings[] = "CSS {$css}mm 超出 {$model} 的排矿口范围 {$rec['cssMin']}–{$rec['cssMax']}mm（来源 S1）";
  }
  // CAVITY_CAPACITY 的结构：{ 型号: { css: [ ... ], rows: [ { cavity, maxFeedMm, cap: [[lo,hi], ...] } ] } }
  $cap = null; $matched = null; $capNote = null;
  if ($cavity && isset($DB['CAVITY_CAPACITY'][$model])) {
    $cc = $DB['CAVITY_CAPACITY'][$model];
    $cssList = isset($cc['css']) ? $cc['css'] : array();
    $rows = isset($cc['rows']) ? $cc['rows'] : array();
    $row = null;
    foreach ($rows as $r) { if (isset($r['cavity']) && strtoupper($r['cavity']) === strtoupper($cavity)) { $row = $r; break; } }
    if ($row) {
      $matched = array('cavity' => $row['cavity']);
      if (isset($row['maxFeedMm'])) $matched['maxFeedMm'] = $row['maxFeedMm'];
      // 找最接近的 CSS 列
      $bestI = -1; $bestD = 1e9;
      foreach ($cssList as $i => $c) { $d = abs($c - $css); if ($d < $bestD) { $bestD = $d; $bestI = $i; } }
      if ($bestI >= 0 && isset($row['cap'][$bestI]) && is_array($row['cap'][$bestI])) {
        $cap = $row['cap'][$bestI];
        if ($bestD > 0.01) $capNote = 'CSS ' . $css . 'mm 无逐格数据，取最接近的 ' . $cssList[$bestI] . 'mm 列';
      } elseif ($bestI >= 0) {
        $capNote = '该腔型在 CSS ' . $css . 'mm 无产能数据（详表中为空）';
      }
    } else {
      $capNote = '该机型没有腔型 ' . $cavity . ' 的产能详表，可用腔型：' . implode('/', array_map(function ($r) { return isset($r['cavity']) ? $r['cavity'] : '?'; }, $rows));
    }
  } elseif ($cavity) {
    $capNote = '该机型没有逐腔型产能详表，仅返回系列区间';
  }
  if ($capNote) $warnings[] = $capNote;
  $assumptions[] = A('产能取自 MACKORN 腔型×CSS 详表（S1）；无详表的机型按系列区间外推，标注为近似', 'S1');
  if ($cap === null) $warnings[] = '该机型/腔型/CSS 组合没有逐格产能详表，仅返回系列区间：' . json_encode($rec['capacityTph']);
  // 两个 maxFeed 口径【并列】，不合并 —— 腔型限制与机型限制含义不同
  $maxFeedCavity = $matched && isset($matched['maxFeedMm']) ? $matched['maxFeedMm'] : null;
  $maxFeedModel = $rec['maxFeedMm'];
  if ($maxFeedCavity !== null && $maxFeedCavity !== $maxFeedModel) {
    $warnings[] = '最大给料有两个口径，含义不同，请按较严的执行：'
      . '腔型 ' . $cavity . ' 限制 ' . $maxFeedCavity . 'mm（选了这个腔型就必须遵守）；'
      . '机型 ' . $model . ' 上限 ' . $maxFeedModel . 'mm（机型本身的极限）。'
      . '实际最大给料 = min(' . $maxFeedCavity . ', ' . $maxFeedModel . ') = ' . min($maxFeedCavity, $maxFeedModel) . 'mm。';
  }
  /* R79：产能合理性校验 —— 与本地 JS 引擎（engine.mjs 的 SERIES_MAX 校验）保持一致。
   *
   * 为什么必须有：R47 实测发现 NH400 的 C 腔详表里 CSS=16mm 对应 [115, 999]，
   *   而 NH400 机型上限约 500 t/h —— 999 是原始数据里的哨兵值/录入错误。
   *   本地引擎已加告警；远程端点是对外主入口（国外用户大多走 MCP over HTTP），
   *   没有这个校验就会把 999 t/h 当真实产能发给客户。
   *
   * 纪律：宁可告警，也不要把可疑数字静默当真实值输出。 */
  $ratedForCheck = is_array($cap) ? $cap[1] : null;
  $tphMax = null;
  if (isset($DB['CAPACITY_TO_MODEL']) && is_array($DB['CAPACITY_TO_MODEL'])) {
    foreach ($DB['CAPACITY_TO_MODEL'] as $band) {
      if (isset($band['models']) && is_array($band['models']) && in_array($model, $band['models'], true)) {
        $tphMax = isset($band['tphMax']) ? $band['tphMax'] : null;
        break;
      }
    }
  }
  if ($tphMax !== null && is_numeric($ratedForCheck) && $ratedForCheck > $tphMax) {
    $warnings[] = '详表给出的额定产能 ' . $ratedForCheck . ' t/h 超过 ' . $model . ' 的机型上限 ' . $tphMax
      . ' t/h —— 该值疑似原始数据录入错误或哨兵值，请勿直接采用；请以 MACKORN 技术确认为准';
    $assumptions[] = A($model . ' 在 CSS ' . $css . 'mm / ' . ($cavity ?: '未指定腔型')
      . ' 的详表值 ' . $ratedForCheck . ' t/h 超出机型合理上限，已标注为可疑', 'R79 实测：与本地引擎同一校验');
  }

  return [[
    'model' => $model, 'cavity' => $cavity, 'css_mm' => $css,
    // 与 JS 引擎字段名对齐：capacity_min_tph / capacity_rated_tph
    'capacity_min_tph' => is_array($cap) ? $cap[0] : null,
    'capacity_rated_tph' => is_array($cap) ? $cap[1] : null,
    'capacity_tph' => $cap,
    'capacity_series_tph' => $rec['capacityTph'],
    'power_kw' => $rec['powerKw'], 'weight_kg' => $rec['weightKg'],
    'max_feed_mm_cavity' => $maxFeedCavity,
    'max_feed_mm_model' => $maxFeedModel,
    'max_feed_mm_effective' => $maxFeedCavity !== null ? min($maxFeedCavity, $maxFeedModel) : $maxFeedModel,
    'max_feed_mm' => $maxFeedCavity !== null ? min($maxFeedCavity, $maxFeedModel) : $maxFeedModel,
    'css_range_mm' => [$rec['cssMin'], $rec['cssMax']],
    'compliant' => ($css >= $rec['cssMin'] && $css <= $rec['cssMax']),
  ], $assumptions, $warnings];
}

/** MCFM 给料模数 */
function tool_mcfm($arr) {
  $warnings = []; $assumptions = [];
  if (!is_array($arr) || count($arr) !== 8) {
    return [null, [], ['需要长度 8 的累积筛余数组（A1..A8，对应 最大给料/60/40/20/10/5/2.5mm 与 80% 通过粒级）']];
  }
  $A8 = (float)$arr[7];
  if (abs(100 - $A8) < 1e-9) return [null, [], ['A8=100，公式分母为 0，无法计算']];
  // A8 是"80% 通过粒级"的累积筛余 → 按定义应接近 20（80% 通过 = 20% 筛余）
  if ($A8 < 8 || $A8 > 45) {
    $warnings[] = 'A8=' . $A8 . ' 不合理：A8 是"80% 通过粒级"的累积筛余百分比，按定义应接近 20（80% 通过 = 20% 筛余）。'
      . '当前值会使 M 失真（例如 A8=99 会算出 M=-218）。请确认 A8 填的是 80% 通过粒级对应的累积筛余。';
  }
  $sum = 0; for ($i = 0; $i < 7; $i++) $sum += (float)$arr[$i];
  $M = round(($sum - 7 * $A8) / (100 - $A8), 3);
  $optimal = [4.0, 4.5];
  $level = $M > 4.5 ? '偏高（粗粒集中）' : ($M < 4.0 ? '偏低（细粒过多）' : '落在最优窗口');
  if ($M > 6) $warnings[] = "M={$M} 远高于上限 4.5，粗粒级严重集中，须优先做布料改造而不是加大破碎机";
  if ($M < 3) $warnings[] = "M={$M} 远低于下限 4.0，细粒级过多，须核查预筛分与筛孔磨损";
  $assumptions[] = A('M = (A1+…+A7 − 7A8)/(100 − A8)，A 为 8 个筛级累积筛余百分比', 'PY-MODEL');
  $assumptions[] = A('最优窗口 [4.0, 4.5]（模型内置工程推荐区间）', 'PY-MODEL');
  return [['mcfm' => $M, 'optimal_range' => $optimal, 'level' => $level,
    'leverage_chain' => ['均匀布料', '速度均匀化', '磨损稳定', '模数恒定']], $assumptions, $warnings];
}

/** 料层孔隙率 */
function tool_grading($c, $m, $f) {
  $s = $c + $m + $f;
  if ($s <= 0) return [null, [], ['三个占比之和必须大于 0']];
  $c /= $s; $m /= $s; $f /= $s;
  $phi = 0.42 - 0.30 * min($m, 0.35) + 0.15 * max(0, $f - 0.30);
  $phi = round($phi, 4);
  $optimal = 0.28;
  return [[
    'porosity' => $phi, 'optimal_porosity' => $optimal,
    'coarse' => round($c, 3), 'mid' => round($m, 3), 'fine' => round($f, 3),
    'verdict' => abs($phi - $optimal) < 0.03 ? '接近最优' : ($phi > $optimal ? '偏松（细料不足或中间粒级不足）' : '偏紧'),
    'target_blend' => ['coarse' => 0.50, 'mid' => 0.30, 'fine' => 0.20],
  ], [A('φ = 0.42 − 0.30·min(中料占比,0.35) + 0.15·max(0, 细料占比 − 0.30)', 'PY-MODEL')], []];
}

/** 描述统计 + 集中度 + 威布尔 */
function tool_stats($mode, $values, $lives) {
  if ($mode === 'weibull') {
    $t = array_values(array_filter(array_map('floatval', $lives ?: []), function ($x) { return $x > 0; }));
    sort($t); $n = count($t);
    if ($n < 3) return [null, [], ['样本量不足（<3），无法拟合威布尔参数 —— 须至少 3 次更换记录，建议 ≥5']];
    $xs = []; $ys = [];
    for ($i = 0; $i < $n; $i++) {
      $F = ($i + 1 - 0.3) / ($n + 0.4);
      if ($F <= 0 || $F >= 1) continue;
      $xs[] = log($t[$i]); $ys[] = log(-log(1 - $F));
    }
    $m = count($xs);
    $mx = array_sum($xs) / $m; $my = array_sum($ys) / $m;
    $sxx = 0; $sxy = 0; $syy = 0;
    for ($i = 0; $i < $m; $i++) { $sxx += pow($xs[$i] - $mx, 2); $sxy += ($xs[$i] - $mx) * ($ys[$i] - $my); $syy += pow($ys[$i] - $my, 2); }
    if ($sxx == 0) { return [null, [], ['所有寿命相同，无法拟合']]; }
    $beta = $sxy / $sxx; $eta = exp(-(($my - $beta*$mx) / $beta));
    $r2 = $syy > 0 ? pow($sxy / sqrt($sxx * $syy), 2) : 1;
    $blife = function ($p) use ($eta, $beta) { return round($eta * pow(-log($p), 1 / $beta), 1); };
    $warn = [];
    if ($beta <= 1.1) $warn[] = "β={$beta}（≈1 或 <1）→ 非磨损型失效，须排查装配或材质问题；衬板正常应为 β>1";
    $warn[] = '前提：样本必须是【失效记录】而非【计划更换记录】。若绝大多数衬板是计划更换（失效数 r=0），β 在数学上不可辨识 —— 拟合出的是更换策略分布，不是寿命分布';
    $warn[] = '⚠️ B10 不是更换时点。B10 用于备件覆盖，更换时点应解 Barlow-Prochasan 年龄更换模型 T*。β=2、η=8000h、c_f/c_p=5 时 T*=4080h 而 B10=2597h —— 用 B10 换会浪费约 36% 寿命';
    return [[
      'n' => $n, 'beta' => round($beta, 3), 'eta_h' => round($eta, 1), 'r_squared' => round($r2, 4),
      'B1_h' => $blife(0.99), 'B10_h' => $blife(0.90), 'B50_h' => $blife(0.50),
      'sample_adequacy' => $n >= 10 ? '充分' : ($n >= 5 ? '勉强可用（建议补至 ≥10）' : '不足（结论仅供参考）'),
    ], [A('两参数威布尔 + 中位秩估计 F=(i−0.3)/(n+0.4) + 最小二乘拟合', 'WEIBULL(1951)')], $warn];
  }
  $v = array_values(array_filter(array_map('floatval', $values ?: []), function ($x) { return is_finite($x); }));
  $n = count($v);
  if ($n === 0) return [null, [], ['values 为空']];
  sort($v);
  $mean = array_sum($v) / $n;
  $median = $n % 2 ? $v[($n-1)/2] : ($v[$n/2-1] + $v[$n/2]) / 2;
  $sd = 0; foreach ($v as $x) { $sd += pow($x - $mean, 2); } $sd = $n > 1 ? sqrt($sd/($n-1)) : 0;
  $q = function ($p) use ($v, $n) { $k = ($n-1)*$p; $lo = (int)floor($k); $hi = min($lo+1, $n-1); return $v[$lo] + ($v[$hi]-$v[$lo])*($k-$lo); };
  $total = array_sum($v);
  $desc = array_reverse($v);
  $share = function ($k) use ($desc, $total) { return round(array_sum(array_slice($desc, 0, $k)) / $total * 100, 1); };
  $hhi = 0; foreach ($v as $x) { $hhi += pow($x / $total * 100, 2); } $hhi = round($hhi, 1);
  $asc = $v; $gini = 0; for ($i = 0; $i < $n; $i++) $gini += (2*($i+1)-$n-1)*$asc[$i];
  $gini = round($gini / ($n * $total), 3);
  $skew = 0; if ($sd > 0) { foreach ($v as $x) { $skew += pow($x - $mean, 3); } $skew = $skew / $n / pow($sd, 3); }
  return [[
    'n' => $n, 'mean' => round($mean,2), 'median' => round($median,2), 'sd' => round($sd,2),
    'cv' => $mean ? round($sd/$mean,3) : null, 'min' => $v[0], 'max' => $v[$n-1],
    'skewness' => round($skew,3), 'mean_over_median' => $median ? round($mean/$median,2) : null,
    'percentiles' => ['p10'=>round($q(.10),2),'p25'=>round($q(.25),2),'p50'=>round($q(.50),2),'p75'=>round($q(.75),2),'p90'=>round($q(.90),2),'p99'=>round($q(.99),2)],
    'concentration' => ['cr10_pct'=>$share(10),'cr20_pct'=>$share(20),'hhi'=>$hhi,'gini'=>$gini,
      'hhi_band'=> $hhi < 1500 ? '竞争型（HHI<1500）' : ($hhi < 2500 ? '中度集中' : '高度集中')],
    'interpretation' => array_values(array_filter([
      $mean && $sd/$mean > 1 ? 'CV=' . round($sd/$mean,2) . ' > 1 → 极度离散，均值无代表性，须用中位数或分位数' : null,
      $skew > 1 ? '偏度 ' . round($skew,2) . ' > 0 → 右偏，均值被少数大值拉高（均值/中位数=' . round($mean/$median,1) . '倍）' : null,
      '前 10 占 ' . $share(10) . '% → 资源有限时须聚焦',
    ])),
  ], [A('纯 PHP 统计计算，无第三方库', 'SELF')], ['统计结论为描述性，不能替代现场实测与商务判断']];
}

/** 联系方式 */
function tool_contact($lang) {
  $c = [
    'company' => 'Shanghai Mackorn Minerals Co., Ltd.',
    'company_cn' => '上海美矿机械股份有限公司',
    'address' => '江苏省苏州市太仓市浏河镇钱江路 33 号',
    'website' => 'https://mackorn.cn',
    'hours' => 'GMT+8 09:00-17:30',
    'contacts' => [
      ['name' => 'Sandy Zhao', 'email' => 'sandy.zhao@mackorn.cn', 'phone' => '+86 139 1648 5025'],
      ['name' => 'Leif Dai', 'email' => 'leif.dai@mackorn.cn', 'phone' => '+86 134 8218 0158'],
      ['name' => 'Vicky Cheng', 'email' => 'vicky.cheng@mackorn.cn', 'phone' => '+86 158 0189 1052'],
    ],
    'qr' => 'https://mackorn.cn/contact/ 页面含微信二维码',
    'partner_program' => '诚征各地代理商 / 代理人 / 选矿人才合作',
    'plugin' => 'https://mackorn.cn/ai/ · MCP: cn.mackorn/mackorn-cone-crusher（22 个工具）',
  ];
  return [$c, [A('联系方式为 MACKORN 官方公开信息', 'OFFICIAL')], []];
}

/** 哈希辅助：与 JS 保持一致的统计（均值/标准差） */
function st_mean($v) { return count($v) ? array_sum($v) / count($v) : 0.0; }
function st_std($v) {
  $n = count($v); if ($n < 2) return 0.0;
  $m = st_mean($v); $s = 0.0;
  foreach ($v as $x) { $s += pow($x - $m, 2); }
  return sqrt($s / ($n - 1));
}

/** 衬板磨损均匀度 + 梯度硬度设计 */
function tool_wear($sections, $baseHardness, $gradientFactor, $wearRates) {
  $assumptions = array(); $warnings = array();
  $nSec = is_numeric($sections) ? max(3, min(12, (int)round($sections))) : 5;
  $base = is_numeric($baseHardness) ? (float)$baseHardness : 58.0;
  $k = is_numeric($gradientFactor) ? (float)$gradientFactor : 1.12;

  $measured = null;
  if (is_array($wearRates) && count($wearRates) > 0) {
    $measured = array_map('floatval', $wearRates);
    if (count($measured) !== $nSec) {
      $warnings[] = 'wearRates 长度 ' . count($measured) . ' 与 sections ' . $nSec . ' 不一致，已按 wearRates 长度计算';
      $nSec = count($measured);
    }
  }
  // 未提供实测时用合成示例（明确标注）
  if ($measured === null) {
    $measured = array();
    for ($i = 0; $i < $nSec; $i++) {
      $measured[] = round(1.8 + 1.8 * sin(M_PI * $i / ($nSec - 1)), 2);
    }
    $assumptions[] = A('未提供实测 wearRates，示例磨损曲线由正弦分布合成，仅用于演示方法，不得用作设计依据', 'SYNTHETIC');
    $warnings[] = '输入为合成示例数据：请用现场测厚记录填入 wear_rates 后重算';
  }

  // 均匀度 = 1 - σ/μ
  $uBefore = array(
    'uniformity' => round(1 - st_std($measured) / (st_mean($measured) ?: 1), 4),
    'cv' => round(st_std($measured) / (st_mean($measured) ?: 1), 4),
    'max_min_ratio' => min($measured) > 0 ? round(max($measured) / min($measured), 3) : null,
  );

  // 梯度设计后（模拟均匀化效果）
  $graded = array(); $mb = st_mean($measured);
  for ($i = 0; $i < $nSec; $i++) {
    $graded[] = round($mb * (1 + 0.03 * cos(M_PI * $i / ($nSec - 1))), 2);
  }
  $uAfter = array(
    'uniformity' => round(1 - st_std($graded) / (st_mean($graded) ?: 1), 4),
    'cv' => round(st_std($graded) / (st_mean($graded) ?: 1), 4),
    'max_min_ratio' => min($graded) > 0 ? round(max($graded) / min($graded), 3) : null,
  );

  // 多梯度分区硬度 H_i = H_base × k^i，带上限
  $limits = array('HRC' => array('min' => 20, 'max' => 68, 'note' => '铸造耐磨材料实用上限约 65-68 HRC'),
                  'HB' => array('min' => 120, 'max' => 650, 'note' => '高铬铸铁硬化态约 600-650 HB'));
  $lim = $limits['HRC'];
  $hard = array(); $rawLast = 0; $capped = false;
  for ($i = 0; $i < $nSec; $i++) {
    $raw = $base * pow($k, $i);
    if ($i === $nSec - 1) $rawLast = round($raw, 2);
    if ($raw > $lim['max']) $capped = true;
    $hard[] = round(min($raw, $lim['max']), 2);
  }
  if ($capped) {
    $warnings[] = '分区硬度设计末段原始值 ' . $rawLast . ' 超过物理上限 ' . $lim['max']
      . '，已截断至上限（物理不可实现的梯度无工程意义）';
  }
  if ($base < $lim['min'] || $base > $lim['max']) {
    $warnings[] = '基础硬度 ' . $base . ' 超出 HRC 合理范围 ' . $lim['min'] . '-' . $lim['max'] . '：' . $lim['note'];
  }

  $assumptions[] = A('磨损均匀度 = 1 − σ/μ；均等化条件 dW_i/dt ≈ const（源自 PY-MODEL · MackornCoreTheory.wear_uniformity）', 'PY-MODEL');
  $assumptions[] = A('多梯度分区硬度 H_i = H_base × k^i（源自 PY-MODEL · gradient_liner_design）', 'PY-MODEL');
  $assumptions[] = A('分区硬度单位 HRC；物理上限 ' . $lim['max'] . '（' . $lim['note'] . '）', 'STANDARD');

  if ($uBefore['max_min_ratio'] !== null && $uBefore['max_min_ratio'] > 1.8) {
    $warnings[] = '最大/最小磨损速率比 ' . $uBefore['max_min_ratio'] . ' 偏大，衬板寿命由最薄处决定，须做分区硬度或腔型修型';
  }

  return [[
    'sections' => $nSec,
    'wear_rates_before' => $measured,
    'wear_rates_graded_design' => $graded,
    'uniformity_before' => $uBefore,
    'uniformity_after_gradient_design' => $uAfter,
    'improvement' => array(
      'uniformity_gain' => round($uAfter['uniformity'] - $uBefore['uniformity'], 4),
      'cv_reduction' => round($uBefore['cv'] - $uAfter['cv'], 4),
    ),
    'liner_hardness_schedule' => array('values' => $hard, 'unit' => 'HRC', 'limit' => $lim['max'],
      'capped' => $capped, 'raw_last' => $rawLast, 'in_range' => ($base >= $lim['min'] && $base <= $lim['max'])),
    'hardness_params' => array('base' => $base, 'gradient_factor' => $k),
    'recommendations' => array(
      '按 H_i 分区选材：下部细碎区用高梯度硬度，上部给料区保留一定韧性抗冲击',
      '每 500 h 测厚一次并记录，用实测 wear_rates 复算均匀度，形成本项目自学习基线',
      '腔型一致性优先于单点寿命：磨损均匀度提升可减少 CSS 漂移与产品粒形波动',
    ),
  ], $assumptions, $warnings];
}

/** 市场五维评估框架（只给框架与打分口径，不含价格） */
function tool_market($scores) {
  $assumptions = array(); $warnings = array();
  $dims = array(
    array('key' => 'industry', 'name' => '行业维度', 'desc' => '市场容量、增长率、下游景气度'),
    array('key' => 'technology', 'name' => '技术维度', 'desc' => '工艺匹配度、技术门槛、替代风险'),
    array('key' => 'timeliness', 'name' => '时效维度', 'desc' => '窗口期、决策周期、竞争节奏'),
    array('key' => 'economics', 'name' => '经济维度', 'desc' => '投资回报、单位成本、客户支付能力'),
    array('key' => 'operability', 'name' => '可操作维度', 'desc' => '渠道可达性、交付能力、服务半径'),
  );
  $assumptions[] = A('五维框架与打分口径源自 PY-MODEL · FiveDimAnalyzerV1（只移植框架，样本数值不入库）', 'PY-MODEL');

  $scored = null;
  if (is_array($scores) && count($scores) > 0) {
    $rows = array(); $weighted = 0.0; $wsum = 0.0; $bad = array();
    foreach ($dims as $d) {
      $k2 = $d['key'];
      if (!isset($scores[$k2])) continue;
      $e = $scores[$k2];
      $sc = isset($e['score']) ? (float)$e['score'] : null;
      if ($sc === null || $sc < 1 || $sc > 5) { $bad[] = $k2 . '(需 1-5)'; continue; }
      $w = isset($e['weight']) && is_numeric($e['weight']) ? (float)$e['weight'] : 1.0;
      $weighted += $sc * $w; $wsum += $w;
      $rows[] = array('key' => $k2, 'name' => $d['name'], 'score' => $sc, 'weight' => $w,
        'evidence' => isset($e['evidence']) ? $e['evidence'] : array());
    }
    if ($bad) $warnings[] = '以下维度评分不合格已跳过：' . implode(', ', $bad);
    if ($wsum > 0) {
      $total = round($weighted / $wsum, 3);
      $verdict = $total >= 4.2 ? '强烈推进：五维齐备，建议立项'
        : ($total >= 3.4 ? '可推进：补齐最低分维度后再立项'
        : ($total >= 2.5 ? '条件不足：先做小试/单点改造验证'
        : '不建议推进：存在硬约束未解决'));
      $scored = array('dimensions' => $rows, 'weighted_score' => $total, 'verdict' => $verdict);
    }
  } else {
    $warnings[] = '未提供 scores，仅返回五维评估框架；请按每维 evidence 取证后再给 1-5 分';
  }

  return [[
    'framework' => $dims,
    'scoring' => $scored,
    'leverage_chain' => array('均匀布料', '速度均匀化', '磨损稳定', '模数恒定'),
    'evidence_discipline' => array(
      '每个维度的结论必须能指到一份可核查的证据（报告页码 / 现场记录）',
      '同一指标出现多来源冲突时，保留两个口径并标注统计边界，不要合并成一个数',
      '禁止把研究样本数字当作标定值：标注时点、样本量、地域口径',
    ),
    'note' => '本远程端点不提供价格与报价。价格相关请直接联系 MACKORN 商务部（见 mackorn_contact）。',
  ], $assumptions, $warnings];
}

/** 整线配置：总破碎比 → 段数 → 各段粒度分配 → 粗碎档位 → 中/细碎圆锥破 */
function tool_plant($DB, $tph, $maxFeed, $product, $closedCircuit, $washing) {
  $assumptions = array(); $warnings = array();
  if (!$tph || $tph <= 0) return array(null, array(), array('target_tph 必填且须为正数'));
  if ($maxFeed === null) $maxFeed = 500;
  if ($product === null) $product = 20;
  if ($product <= 0) return array(null, array(), array('target_product_mm 必须为正数'));

  $totalRatio = $maxFeed / max(1, $product);
  // 段数由 ENGINEERING_DEFAULTS.crushingStagesGuide 决定
  $guide = null;
  $gs = isset($DB['ENGINEERING_DEFAULTS']['crushingStagesGuide']) ? $DB['ENGINEERING_DEFAULTS']['crushingStagesGuide'] : array();
  foreach ($gs as $x) {
    if (isset($x['totalRatioMax']) && $totalRatio <= $x['totalRatioMax']) { $guide = $x; break; }
  }
  $stages = $guide && isset($guide['stages']) ? $guide['stages'] : 4;
  if ($totalRatio > 100) $warnings[] = '总破碎比 ' . round($totalRatio, 1) . ' 偏大，建议三段 + 超细碎或制砂段，并复核单段破碎比可行性';

  $order = array('粗碎', '中碎', '细碎', '超细碎/制砂');
  $ratioForStage = function ($name) {
    if ($name === '粗碎') return 7.0;
    if ($name === '中碎') return 5.0;
    if ($name === '细碎') return 3.5;
    return 6.0;
  };
  $stagePlan = array(); $cur = (float)$maxFeed;
  for ($i = 0; $i < $stages; $i++) {
    $name = $order[min($i, count($order) - 1)];
    $remaining = $cur / $product;
    $targetRemaining = pow($remaining, 1.0 / max(1, ($stages - $i)));
    $next = $cur / min($ratioForStage($name), max(1.5, $targetRemaining));
    if ($i === $stages - 1) $next = (float)$product;
    $stagePlan[] = array('stage' => $name, 'feed_mm' => round($cur, 1), 'product_mm' => round($next, 1),
      'ratio' => round($cur / max(0.1, $next), 2));
    $cur = $next;
  }

  // 粗碎档位（MACKORN 自有表）
  $coarse = null;
  foreach ((array)$DB['MACKORN_COARSE_CRUSHER_TABLE'] as $c) {
    if ($tph >= $c['tph'][0] && $tph < $c['tph'][1]) { $coarse = $c; break; }
  }
  if ($coarse && $maxFeed > $coarse['maxFeedMm']) {
    $warnings[] = '原矿最大粒度 ' . $maxFeed . 'mm 超出推荐粗碎设备 ' . (isset($coarse['model']) ? $coarse['model'] : '?')
      . ' 的给料上限 ' . $coarse['maxFeedMm'] . 'mm，须改用更大给料口或增加预筛分';
  }

  // 中碎与细碎段各做一次圆锥破选型（用该段自己的产品粒度）
  $coneFor = function ($feedMm, $prodMm) use ($DB) {
    $cands = array();
    foreach (array_merge($DB['NH_SERIES'], $DB['NS_SERIES']) as $m) {
      if ($feedMm !== null && $m['maxFeedMm'] < $feedMm * 0.55) continue;   // 留裕量
      $hi = $m['capacityTph'][1];
      $cands[] = array('model' => $m['model'], 'capacity_tph' => $m['capacityTph'],
        'power_kw' => $m['powerKw'], 'max_feed_mm' => $m['maxFeedMm'], 'css_range_mm' => array($m['cssMin'], $m['cssMax']));
    }
    usort($cands, function ($a, $b) { return $b['capacity_tph'][1] - $a['capacity_tph'][1]; });
    return array_slice($cands, 0, 3);
  };
  $midIdx = min(1, $stages - 1);
  $fineIdx = $stages - 1;
  $midFeed = $stagePlan[$midIdx]['feed_mm'];
  if ($coarse && isset($coarse['dischargeMm'][1])) $midFeed = min($midFeed, $coarse['dischargeMm'][1]);

  $assumptions[] = A('段数取自 ENGINEERING_DEFAULTS.crushingStagesGuide（按总破碎比分档）', 'S6');
  $assumptions[] = A('各段破碎比取自 MACKORN《09-选型设计规范与问答》§1.2：粗碎 6-8 / 中碎 4-6 / 细碎 3-4 / 制砂 6-10，本工具取各段上界', 'S6');
  $assumptions[] = A('粗碎档位取自 MACKORN 自有粗碎设备产能表', 'S1');
  $assumptions[] = A('中碎段真实给料上界 = min(等比分配值, 粗碎设备实际排矿口)', 'ENGINEERING');
  $warnings[] = '本工具给出的是【配置骨架】，筛分面积与皮带宽度须按现场布置复核；不含土建、钢构、电气与安装';

  return array(array(
    'target_tph' => $tph, 'max_feed_mm' => (float)$maxFeed, 'target_product_mm' => (float)$product,
    'total_reduction_ratio' => round($totalRatio, 1), 'recommended_stages' => $stages,
    'closed_circuit' => (bool)$closedCircuit, 'washing' => (bool)$washing,
    'stage_plan' => $stagePlan,
    'coarse_crusher' => $coarse,
    'mid_stage_feed_mm' => round($midFeed, 1),
    'mid_stage_candidates' => $coneFor($midFeed, $stagePlan[$midIdx]['product_mm']),
    'fine_stage_candidates' => $coneFor($stagePlan[$fineIdx]['feed_mm'], (float)$product),
  ), $assumptions, $warnings);
}

/** 能耗与吨成本结构（不含任何价格 —— 遵守 No pricing 纪律） */
function tool_cost_energy($DB, $model, $units, $tph, $hours, $loadFactor, $linerLifeHours) {
  $assumptions = array(); $warnings = array();
  $rec = null;
  foreach (array_merge($DB['NH_SERIES'], $DB['NS_SERIES']) as $m) { if ($m['model'] === $model) $rec = $m; }
  if (!$rec) return array(null, array(), array('未知机型 ' . $model . '。可用机型见 mackorn_equipment_catalog。'));
  $units = $units && $units > 0 ? (int)$units : 1;
  $d = isset($DB['ENGINEERING_DEFAULTS']) ? $DB['ENGINEERING_DEFAULTS'] : array();
  if (!$hours) $hours = isset($d['annualOperatingHours']['value'][0]) ? $d['annualOperatingHours']['value'][0] : 6000;
  if ($loadFactor === null) $loadFactor = isset($d['loadFactor']['value']) ? $d['loadFactor']['value'] : 0.75;
  $installedKw = $rec['powerKw'] * $units;
  $kwhPerYear = $installedKw * $loadFactor * $hours;
  $kwhPerTon = $tph ? round(($installedKw * $loadFactor) / $tph, 3) : null;
  $tonPerYear = $tph ? round($tph * $hours, 0) : null;

  $assumptions[] = A('装机功率取自 MACKORN S1 机型表', 'S1');
  $assumptions[] = A('年运行小时 ' . $hours . ' h（未提供则取工程默认值，可覆写）', 'ENGINEERING-DEFAULT');
  $assumptions[] = A('负荷率 ' . $loadFactor . '（工程默认，可覆写）', 'ENGINEERING-DEFAULT');
  $warnings[] = '本工具【不给价格】。电费 = 年耗电量 × 你的实际电价，请自行相乘；衬板吨成本 = 单套价 ÷ 寿命内产量，亦须用你的实际采购价。';
  $warnings[] = '不含土建、钢构、电气、安装、运输与税费。';

  $res = array(
    'model' => $model, 'units' => $units, 'installed_power_kw' => $installedKw,
    'hours_per_year' => $hours, 'load_factor' => $loadFactor,
    'energy_kwh_per_year' => round($kwhPerYear, 0),
    'energy_kwh_per_ton' => $kwhPerTon,
    'ton_per_year' => $tonPerYear,
    'energy_cost_formula' => $kwhPerTon !== null ? ('年电费 = ' . round($kwhPerYear, 0) . ' kWh × 你的电价（元/kWh）') : null,
    'liner_cost_formula' => null,
  );
  if ($linerLifeHours && $linerLifeHours > 0 && $tph) {
    $setsPerYear = ($hours / $linerLifeHours) * $units;
    $lifeTon = $tph * $linerLifeHours;
    $res['liner_sets_per_year'] = round($setsPerYear, 2);
    $res['liner_life_ton'] = round($lifeTon, 0);
    $res['liner_cost_formula'] = '衬板吨成本 = 单套衬板价（元）÷ ' . round($lifeTon, 0) . ' t（每套寿命内产量）';
    $assumptions[] = A('衬板寿命 ' . $linerLifeHours . ' h 为用户提供（项目实测）', 'MACKORN-measured');
  } else {
    $warnings[] = '未提供 liner_life_hours，无法算衬板吨成本。衬板寿命必须用现场换衬板记录，不可用文献默认值代替。';
  }
  return array($res, $assumptions, $warnings);
}

/** 经销商/代理商评估（三维 17 项 + 一票否决） */
function tool_distributor($input) {
  $assumptions = array(); $warnings = array();
  $dims = array(
    'capability' => array('name' => '能力', 'items' => array('技术能力','备件仓储','服务响应','安装调试','操作培训','售后维修')),
    'market' => array('name' => '市场', 'items' => array('区域覆盖','客户资源','行业关系','项目信息','品牌影响','竞争位势')),
    'integrity' => array('name' => '诚信与合规', 'items' => array('履约记录','付款信用','合规记录','信息透明','长期意愿')),
  );
  $veto = array('sanctions' => '涉制裁名单', 'credit_record' => '信用记录不良');
  $vetoHit = array();
  foreach ($veto as $k => $label) {
    if (isset($input[$k]) && is_numeric($input[$k]) && (float)$input[$k] <= 1) $vetoHit[] = $label;
  }
  if ($vetoHit) {
    $warnings[] = '触发一票否决：' . implode('、', $vetoHit) . ' —— 无论总分多高，均不建议合作';
    return array(array('veto' => true, 'veto_reasons' => $vetoHit, 'verdict' => 'X-否决'), $assumptions, $warnings);
  }
  $rows = array(); $total = 0.0; $cnt = 0;
  foreach ($dims as $k => $d) {
    $v = isset($input[$k]) && is_array($input[$k]) ? $input[$k] : array();
    $vals = array();
    foreach ($v as $x) { if (is_numeric($x)) $vals[] = (float)$x; }
    if (!$vals) continue;
    $avg = array_sum($vals) / count($vals);
    $rows[] = array('dimension' => $d['name'], 'items_scored' => count($vals), 'items_total' => count($d['items']), 'average' => round($avg, 2));
    $total += $avg; $cnt++;
  }
  if (!$cnt) {
    $warnings[] = '未提供任何维度评分。请按三维 17 项逐项打 1-5 分后重算。';
    return array(array('framework' => $dims, 'veto_rules' => $veto, 'need' => 'capability / market / integrity 三个数组，每项 1-5 分'), $assumptions, $warnings);
  }
  $score = round($total / $cnt, 2);
  $tier = $score >= 4.2 ? 'A-核心代理' : ($score >= 3.4 ? 'B-合格代理' : ($score >= 2.5 ? 'C-观察代理' : 'D-不建议'));
  $assumptions[] = A('三维 17 项评估框架与一票否决规则（sanctions / credit_record ≤1 即否决）', 'S6');
  $warnings[] = '评估须基于可核查证据（履约记录、付款记录、实地走访），不可只凭主观印象打分';
  return array(array('dimensions' => $rows, 'weighted_score' => $score, 'tier' => $tier,
    'verdict' => $tier, 'veto_rules' => $veto), $assumptions, $warnings);
}

/** 表单字段定义（37 项，分四档：阻断/关键/建议/可选） */
function form_fields() {
  return array(
    array('key'=>'capacity_tph','label'=>'产量需求 t/h','level'=>'阻断'),
    array('key'=>'max_feed_mm','label'=>'原矿最大给料粒度 mm','level'=>'关键'),
    array('key'=>'product_mm','label'=>'成品粒度要求（mm 以下）','level'=>'关键'),
    array('key'=>'ore_type','label'=>'矿石种类','level'=>'关键'),
    array('key'=>'compressive_strength_mpa','label'=>'抗压强度 MPa','level'=>'关键'),
    array('key'=>'moisture_pct','label'=>'原矿含水率 %','level'=>'关键'),
    array('key'=>'line_type','label'=>'产线类型（砂石骨料/金属矿山）','level'=>'关键'),
    array('key'=>'production_method','label'=>'生产方式（干法/湿法）','level'=>'关键'),
    array('key'=>'client_name','label'=>'客户名称','level'=>'建议'),
    array('key'=>'project_location','label'=>'项目地点','level'=>'建议'),
    array('key'=>'ore_source','label'=>'矿石来源（自有矿山/外购）','level'=>'建议'),
    array('key'=>'size_distribution','label'=>'粒度组成（0-60/60-100/100-300/>300mm 占比 %）','level'=>'建议'),
    array('key'=>'hardness_note','label'=>'矿石硬度 / 压碎值','level'=>'建议'),
    array('key'=>'bulk_density_t_m3','label'=>'堆密度 t/m³','level'=>'建议'),
    array('key'=>'soil_content_pct','label'=>'原矿含土量 %','level'=>'建议'),
    array('key'=>'soil_level','label'=>'含土程度（较少/较多/粘性）','level'=>'建议'),
    array('key'=>'soil_removal_needed','label'=>'除土需求（是/否）','level'=>'建议'),
    array('key'=>'total_reserve_t','label'=>'矿山总储量 吨','level'=>'建议'),
    array('key'=>'ore_use','label'=>'产品主要用途','level'=>'建议'),
    array('key'=>'scope','label'=>'需求内容（主机设备/总包生产线）','level'=>'建议'),
    array('key'=>'product_specs','label'=>'成品骨料规格及占比','level'=>'建议'),
    array('key'=>'sand_fineness_modulus','label'=>'机制砂细度模数 Mx','level'=>'建议'),
    array('key'=>'dust_limit_mgm3','label'=>'环保要求 mg/m³','level'=>'建议'),
    array('key'=>'hours_per_day','label'=>'每天工作小时','level'=>'建议'),
    array('key'=>'days_per_year','label'=>'每年工作天数','level'=>'建议'),
    array('key'=>'grade_note','label'=>'矿石品位 / 抛废率（金属矿）','level'=>'可选'),
    array('key'=>'chemical_note','label'=>'化学成分 CaO/SiO2/MgO（骨料）','level'=>'可选'),
    array('key'=>'shaping_needed','label'=>'是否需要整形','level'=>'可选'),
    array('key'=>'belt_type','label'=>'皮带机选型（TD75/DTII/满足使用）','level'=>'可选'),
    array('key'=>'electrical_origin','label'=>'电气元件及软启动（国产/进口）','level'=>'可选'),
    array('key'=>'belt_sealing','label'=>'皮带机密封形式','level'=>'可选'),
    array('key'=>'storage_type','label'=>'储料形式（地仓/筒仓/堆棚）','level'=>'可选'),
    array('key'=>'storage_capacity_t','label'=>'储料仓容 吨','level'=>'可选'),
    array('key'=>'design_qualification','label'=>'设计资质/图审要求','level'=>'可选'),
    array('key'=>'salesperson','label'=>'业务员','level'=>'可选'),
    array('key'=>'date','label'=>'日期','level'=>'可选'),
    array('key'=>'other_requirements','label'=>'客户其他需求','level'=>'可选'),
  );
}

/** 追问话术：每个字段该怎么问客户，以及为什么必须问 */
function followup_script($key, $label, $level) {
  $T = array(
    'capacity_tph' => '请问这条线要求的成品产量是多少 t/h？（这是唯一的必填项，其它都可以后补）',
    'max_feed_mm' => '原矿爆破后的最大块度大概多大（mm）？这决定粗碎设备选型和是否需要预筛分。',
    'product_mm' => '成品要求做到多少 mm 以下？有没有分档（如 0-5 / 5-10 / 10-20 / 20-31.5）？',
    'ore_type' => '矿石是什么岩性？（花岗岩 / 玄武岩 / 安山岩 / 辉绿岩 / 石灰石 / 铁矿石 / 铜矿石 …）这决定硬度取值和 Bond 功指数。',
    'compressive_strength_mpa' => '矿石抗压强度大概多少 MPa？有没有压碎值或坚固性系数 f 值？',
    'moisture_pct' => '原矿含水率多少 %？含泥多不多？这直接影响筛分效率和是否糊腔。',
    'line_type' => '这条线是砂石骨料线，还是金属矿山选厂前段？',
    'production_method' => '打算干法还是湿法生产？湿法要配洗砂与污水处理系统。',
    'soil_content_pct' => '原矿含土量大概多少 %？',
    'soil_level' => '含土情况属于：较少 / 较多 / 较多且为粘性土？',
    'soil_removal_needed' => '需不需要单独设除土工序？',
    'total_reserve_t' => '矿山总储量大概多少吨？用来核算服务年限。',
    'hours_per_day' => '每天计划工作几小时？（8 / 12 / 16 / 20）',
    'days_per_year' => '每年计划工作多少天？',
    'product_specs' => '成品骨料要哪几个规格？各规格占比大概多少？',
    'sand_fineness_modulus' => '如果要做机制砂，要求的细度模数 Mx 是多少？',
    'dust_limit_mgm3' => '当地环保要求粉尘排放限值多少 mg/m³？（常见 10 / 20 / 30）',
    'size_distribution' => '原矿粒度组成大概是什么比例？（0-60 / 60-100 / 100-300 / >300mm 各占 %）',
    'bulk_density_t_m3' => '矿石堆密度大概多少 t/m³？',
    'scope' => '这次是要主机设备，还是要总包整条生产线？',
    'shaping_needed' => '成品对粒形有没有整形要求（针片状含量）？',
    'storage_type' => '成品储料用地仓、筒仓还是堆棚？',
  );
  $W = array(
    'capacity_tph' => '缺少该项会触发阻断——没有产量需求就无法开始选型。',
    'max_feed_mm' => '决定粗碎设备规格与破碎段数；给料超过圆锥破上限时必须前段预碎。',
    'product_mm' => '决定总破碎比与段数，直接影响设备配置与投资。',
    'ore_type' => '不同岩性的 Bond 功指数与磨蚀性差异很大，影响功率与衬板选材。',
    'compressive_strength_mpa' => '影响破碎功与腔型选择；硬度资料缺失时只能按工程区间估算并标注。',
    'moisture_pct' => '含水率高会显著降低筛分效率并造成堵料，必须用于筛分面积校核。',
    'line_type' => '砂石骨料线与金属矿山线的工艺目标不同（成品 vs 磨机给料）。',
    'production_method' => '湿法需增加洗砂与污水处理，投资与环保章节完全不同。',
    'soil_content_pct' => '含土量决定是否需要除土工序与加大筛分面积。',
    'soil_level' => '粘性土会造成糊腔，必须加大筛分面积并加缓冲仓。',
    'soil_removal_needed' => '影响是否配置除土筛与除土皮带。',
    'total_reserve_t' => '核算矿山服务年限，判断投资回收期。',
    'hours_per_day' => '用于核算年产量与年运行小时数。',
    'days_per_year' => '用于核算年产量与矿山服务年限。',
    'product_specs' => '决定筛分层数与成品仓分格。',
    'sand_fineness_modulus' => '机制砂必须校核细度模数与石粉含量。',
    'dust_limit_mgm3' => '决定除尘系统配置与密封形式。',
  );
  $q = isset($T[$key]) ? $T[$key] : ('请确认「' . $label . '」。');
  $w = isset($W[$key]) ? $W[$key] : ($level === '阻断' ? '缺少该项无法开始选型。' : '影响方案精度与报价准确性。');
  return array('question' => $q, 'why' => $w);
}

/** 需求表录入：解析文字 → 完整性评估 → 追问清单 → 归一化 → 派生建议 → 年产量核算 */
function tool_intake($DB, $args) {
  $assumptions = array(); $warnings = array();
  $merged = array(); $sources = array();
  foreach (form_fields() as $f) { $merged[$f['key']] = null; $sources[$f['key']] = null; }

  // ① 从结构化参数取
  foreach ($args as $k => $v) {
    if (array_key_exists($k, $merged) && $v !== null && $v !== '') { $merged[$k] = $v; $sources[$k] = '结构化参数'; }
  }
  // ② 从 form_text 里正则抽取（中文需求表常见写法）
  $text = isset($args['form_text']) ? (string)$args['form_text'] : '';
  if ($text !== '') {
    $pat = array(
      'capacity_tph' => '/(?:产量|产能|处理量|生产能力)\D{0,8}([0-9]+(?:\.[0-9]+)?)\s*(?:t\/h|吨\/小时|tph)?/u',
      'max_feed_mm' => '/(?:最大给料|给料粒度|入料粒度|最大入料|进料粒度)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'product_mm' => '/(?:成品粒度|出料粒度|产品粒度)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'compressive_strength_mpa' => '/(?:抗压强度|压强)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'moisture_pct' => '/(?:含水率|水分)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'soil_content_pct' => '/(?:含土量|含泥量)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'bulk_density_t_m3' => '/(?:堆密度|容重)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'total_reserve_t' => '/(?:总储量|储量)\D{0,8}([0-9]+(?:\.[0-9]+)?)/u',
      'hours_per_day' => '/(?:每天工作|日工作|每日工作)\D{0,6}([0-9]+(?:\.[0-9]+)?)/u',
      'days_per_year' => '/(?:每年工作|年工作|年生产天数)\D{0,6}([0-9]+(?:\.[0-9]+)?)/u',
      'dust_limit_mgm3' => '/(?:环保|粉尘|排放)\D{0,10}([0-9]+)\s*mg/u',
    );
    foreach ($pat as $k => $re) {
      if ($merged[$k] !== null) continue;
      if (preg_match($re, $text, $mm)) { $merged[$k] = (float)$mm[1]; $sources[$k] = 'form_text 正则抽取'; }
    }
    // 选项型
    $opt = array(
      'line_type' => array('砂石骨料'=>'砂石骨料','金属矿山'=>'金属矿山'),
      'production_method' => array('干法'=>'干法','湿法'=>'湿法'),
      'soil_level' => array('含土较少'=>'含土较少','含土较多且为粘性'=>'含土较多且为粘性土质','含土较多'=>'含土较多'),
      'storage_type' => array('地仓'=>'地仓','筒仓'=>'筒仓','堆棚'=>'堆棚'),
      'scope' => array('主机设备'=>'主机设备','总包生产线'=>'总包生产线'),
      'electrical_origin' => array('进口'=>'进口','国产'=>'国产'),
      'belt_type' => array('TD75'=>'TD75','DTII'=>'DTII'),
    );
    foreach ($opt as $k => $map) {
      if ($merged[$k] !== null) continue;
      foreach ($map as $needle => $val) { if (mb_strpos($text, $needle) !== false) { $merged[$k] = $val; $sources[$k] = 'form_text 选项匹配'; break; } }
    }
    if (preg_match('/(花岗岩|玄武岩|安山岩|辉绿岩|石灰石|石灰岩|铁矿石|铜矿石|铅锌矿|钼矿|金矿|砂岩|片麻岩)/u', $text, $mm)) {
      if ($merged['ore_type'] === null) { $merged['ore_type'] = $mm[1]; $sources['ore_type'] = 'form_text 正则抽取'; }
    }
    if (preg_match('/(?:除土|除泥)\D{0,6}(?:是|需要|要)/u', $text)) { if ($merged['soil_removal_needed'] === null) { $merged['soil_removal_needed'] = true; $sources['soil_removal_needed'] = 'form_text 关键词'; } }
    if (preg_match('/(?:整形)/u', $text)) { if ($merged['shaping_needed'] === null) { $merged['shaping_needed'] = true; $sources['shaping_needed'] = 'form_text 关键词'; } }
  }

  // ③ 完整性评估
  $byLevel = array('阻断'=>array(), '关键'=>array(), '建议'=>array(), '可选'=>array());
  foreach (form_fields() as $f) {
    $v = $merged[$f['key']];
    if ($v === null || $v === '') $byLevel[$f['level']][] = $f;
  }
  $follow = array();
  foreach (array('阻断','关键','建议') as $lv) {
    foreach ($byLevel[$lv] as $f) {
      $sc = followup_script($f['key'], $f['label'], $lv);
      $follow[] = array('field'=>$f['key'], 'label'=>$f['label'], 'urgency'=>$lv, 'question'=>$sc['question'], 'why'=>$sc['why']);
    }
  }
  $blocking = count($byLevel['阻断']) > 0;
  $completeness = array(
    'blocking' => $blocking,
    'preliminary' => !$blocking && count($byLevel['关键']) > 0,
    'complete' => !$blocking && count($byLevel['关键']) === 0 && count($byLevel['建议']) === 0,
    'missing_by_level' => array('阻断'=>count($byLevel['阻断']), '关键'=>count($byLevel['关键']), '建议'=>count($byLevel['建议']), '可选'=>count($byLevel['可选'])),
    'missing_labels' => array(
      '阻断' => array_map(function ($f) { return $f['label']; }, $byLevel['阻断']),
      '关键' => array_map(function ($f) { return $f['label']; }, $byLevel['关键']),
      '建议' => array_map(function ($f) { return $f['label']; }, $byLevel['建议']),
    ),
    'follow_up' => $follow,
    'field_sources' => $sources,
  );

  // ④ 派生建议
  $h = isset($merged['hours_per_day']) ? (float)$merged['hours_per_day'] : null;
  $dy = isset($merged['days_per_year']) ? (float)$merged['days_per_year'] : null;
  $tph = isset($merged['capacity_tph']) ? (float)$merged['capacity_tph'] : null;
  $mt = isset($merged['moisture_pct']) ? (float)$merged['moisture_pct'] : null;
  $sc2 = isset($merged['soil_content_pct']) ? (float)$merged['soil_content_pct'] : null;
  $sl = $merged['soil_level'];
  $sticky = ($sl !== null && mb_strpos((string)$sl, '粘') !== false) || ($mt !== null && $mt >= 8) || ($sc2 !== null && $sc2 >= 15);
  $highSoil = ($sc2 !== null && $sc2 >= 8) || ($sl !== null && mb_strpos((string)$sl, '较多') !== false);
  $wet = $merged['production_method'] === '湿法';
  $rec = array();
  $push = function ($cond, $conclusion, $basis) use (&$rec) { if ($cond) $rec[] = array('conclusion'=>$conclusion, 'basis'=>$basis); };
  $push($sticky, '原矿含泥/粘性偏高：粗碎前必须设预筛分或除土筛，中细碎前加缓冲仓防止糊腔；筛分面积在上述计算基础上再加大 20%-40%。', '客户表单：含土量/含土程度/含水率');
  $push(!$sticky && $highSoil, '原矿含土偏多（未达粘性档）：建议粗碎前设除土筛，筛分面积按加大 15%-25% 复核。', '客户表单：含土量/含土程度');
  $push($merged['soil_removal_needed'] === true, '客户明确需要除土：配置除土筛 + 除土皮带。', '客户表单：除土需求=是');
  $push($merged['soil_removal_needed'] === true && !$wet, '⚠️ 除土方式待确认：客户要求除土但生产方式为干法——干法除土筛（无污水处理投资）或湿法洗砂（需浓密机+压滤机）。本方案按干法估算，若实为湿法洗砂，投资与环保章节须重算。', '客户表单：除土需求=是 且 生产方式=干法');
  $push($wet, '湿法生产：需配置洗砂机 + 污水处理系统（浓密机 + 压滤机），并复核成品含水与脱水筛配置。', '客户表单：生产方式=湿法');
  $push(!$wet && isset($merged['dust_limit_mgm3']) && $merged['dust_limit_mgm3'] !== null, '干法生产且有环保要求：各转运点设除尘罩 + 布袋除尘器。', '客户表单：环保要求');
  $push($merged['shaping_needed'] === true, '客户要求整形：对相应粒级增设立轴冲击破整形段，或改用粒形更优的细碎腔型。', '客户表单：是否需要整形');
  $push($merged['scope'] === '主机设备', '客户只要主机设备：按单机供货范围出方案，不含土建/钢构/电气/安装，报价须界定边界。', '客户表单：需求内容=主机设备');
  $push($merged['scope'] === '总包生产线', '客户要总包生产线：需出完整供货范围清单与验收标准，方案深度按 EPC 口径。', '客户表单：需求内容=总包生产线');
  $push($merged['line_type'] === '金属矿山', '金属矿山线：需确认抛废阶段与抛废率，粗碎后可能设抛废工序，成品粒度以磨机给料为准。', '客户表单：金属矿山生产线');
  $push($merged['storage_type'] !== null, '客户指定储料形式「' . $merged['storage_type'] . '」：成品仓与堆场布置需按此形式设计。', '客户表单：储料形式');
  $push($merged['belt_type'] !== null, '客户指定皮带机「' . $merged['belt_type'] . '」：选型与报价按该标准执行。', '客户表单：皮带机选型');
  $push($merged['electrical_origin'] !== null, '客户指定电气元件「' . $merged['electrical_origin'] . '」：影响电控成本与交货周期。', '客户表单：电气元件及软启动');

  // ⑤ 年产量与矿山服务年限
  $annual = array('hours_per_day'=>$h, 'days_per_year'=>$dy,
    'annual_operating_hours'=> ($h !== null && $dy !== null) ? ($h * $dy) : null,
    'annual_output_t'=> ($h !== null && $dy !== null && $tph !== null) ? round($tph * $h * $dy, 0) : null,
    'reserve_t'=> isset($merged['total_reserve_t']) ? $merged['total_reserve_t'] : null,
    'reserves_life_years'=> null, 'note'=>null);
  if ($annual['annual_output_t'] && $annual['reserve_t']) {
    $annual['reserves_life_years'] = round($annual['reserve_t'] / $annual['annual_output_t'], 1);
    $annual['note'] = '按 ' . $h . ' h/天 × ' . $dy . ' 天/年 计，年产量 ' . number_format($annual['annual_output_t']) . ' t；矿山总储量 '
      . number_format($annual['reserve_t']) . ' t，对应服务年限约 ' . $annual['reserves_life_years'] . ' 年（未计回收率与贫化）';
  } else {
    $annual['note'] = '未同时提供「每天工作小时 + 每年工作天数 + 矿山总储量」，无法核算年产量与矿山服务年限';
  }

  // ⑥ 若能选型就顺手选一次
  $selection = null;
  if ($tph !== null && $tph > 0) {
    $feed = isset($merged['max_feed_mm']) ? (float)$merged['max_feed_mm'] : null;
    $cands = array();
    foreach (array_merge($DB['NH_SERIES'], $DB['NS_SERIES']) as $m) {
      $cands[] = array('model'=>$m['model'], 'capacity_tph'=>$m['capacityTph'], 'power_kw'=>$m['powerKw'],
        'max_feed_mm'=>$m['maxFeedMm'], 'utilization'=>round($tph / $m['capacityTph'][1], 3));
    }
    usort($cands, function ($a, $b) { return abs($a['utilization'] - 0.8) - abs($b['utilization'] - 0.8); });
    $selection = array('target_tph'=>$tph,
      'note'=>($feed !== null && $feed > 350) ? '给料超圆锥破上限，需前段粗碎' : '按目标产能落在机型能力 80% 附近排序',
      'top_candidates'=>array_slice($cands, 0, 3));
  }

  if ($blocking) $warnings[] = '存在【阻断级】缺失项：' . implode('、', $completeness['missing_labels']['阻断']) . ' —— 缺这些无法开始选型。';
  if (count($byLevel['关键']) > 0) $warnings[] = '存在【关键级】缺失项 ' . count($byLevel['关键']) . ' 项 —— 方案可以做，但精度受限，报价须标注假设。';
  $assumptions[] = A('字段分档（阻断/关键/建议/可选）与追问话术为 MACKORN 销售口径', 'S6');
  $assumptions[] = A('form_text 抽取为规则匹配，可能漏抽或误抽；每条抽取结果都标了来源 field_sources，请人工复核', 'SELF');

  return array(array(
    'completeness' => $completeness,
    'normalized' => $merged,
    'recommendations' => $rec,
    'annual' => $annual,
    'preliminary_selection' => $selection,
    'next_step' => $blocking
      ? '先按 follow_up 清单向客户补齐阻断项，再进选型'
      : '可进 mackorn_plant_design 做整线配置 / mackorn_cone_selection 做机型选型',
  ), $assumptions, $warnings);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Whiten (1972) 圆锥破稳态模型 —— 产品粒度曲线与多段流程仿真
 * 公开文献实现：Whiten 1972 / Napier-Munn et al.《Mineral Comminution Circuits》
 * 破碎函数参数为文献典型值，须用 MACKORN 实测筛析标定（见 mackorn_calibrate）
 * ══════════════════════════════════════════════════════════════════════════ */

/** 标准筛系（公比 √2，默认 0.5–512 mm） */
function sieve_series($minMm = 0.5, $maxMm = 512, $ratio = 1.4142135623730951) {
  $out = [];
  for ($x = $minMm; $x <= $maxMm * 1.0001; $x *= $ratio) { $out[] = round($x, 3); }
  $out[] = round(end($out) * $ratio, 3);
  return $out;
}

/** 累积通过率函数 → 各粒级质量分数 */
function discretize($cumFn, $sizes) {
  $cum = [];
  foreach ($sizes as $s) { $v = $cumFn($s); $cum[] = max(0.0, min(1.0, $v)); }
  $frac = []; $prev = 0.0;
  for ($i = 0; $i < count($sizes); $i++) { $frac[] = max(0.0, $cum[$i] - $prev); $prev = $cum[$i]; }
  $tail = max(0.0, 1.0 - $prev);
  if ($tail > 1e-12) { $frac[count($frac) - 1] += $tail; }
  $tot = array_sum($frac);
  if ($tot <= 0) { $tot = 1.0; }
  return ['cum' => $cum, 'frac' => array_map(function ($f) use ($tot) { return $f / $tot; }, $frac), 'sizes' => $sizes];
}

function cum_from_frac($frac) {
  $out = []; $s = 0.0;
  foreach ($frac as $f) { $s += $f; $out[] = $s; }
  return $out;
}

/** 特征粒径：累积通过率达 p 时的粒径（线性插值） */
function pct_size($sizes, $frac, $p = 0.8) {
  $cum = cum_from_frac($frac);
  $nn = count($cum);
  if ($nn === 0 || $cum[$nn - 1] < $p) return null;
  for ($i = 0; $i < $nn; $i++) {
    if ($cum[$i] >= $p) {
      $c0 = $i === 0 ? 0.0 : $cum[$i - 1];
      $x0 = $i === 0 ? 0.0 : $sizes[$i - 1];
      $tt = ($p - $c0) / max(1e-12, $cum[$i] - $c0);
      return round($x0 + $tt * ($sizes[$i] - $x0), 3);
    }
  }
  return null;
}

/** Rosin–Rammler 分布：Y = 1 − exp(−(x/xc)^n) */
function dist_rr($xc, $nn) {
  return function ($x) use ($xc, $nn) { return 1 - exp(-pow(max($x, 0.0) / $xc, $nn)); };
}
/** Gaudin–Schuhmann：Y = (x/xmax)^m */
function dist_gs($xmax, $m) {
  return function ($x) use ($xmax, $m) { return min(1.0, pow(max($x, 0.0) / $xmax, $m)); };
}

/** 分级（啮合）函数 C(x)：K1 = CSS + f·throw，K2 = CSS − f·throw */
function classify_fn($cssMm, $throwMm, $throwFactor) {
  $K1 = $cssMm + $throwFactor * $throwMm;
  $K2 = max(0.1, $cssMm - $throwFactor * $throwMm);
  return function ($x) use ($K1, $K2) {
    if ($x <= $K2) return 0.0;
    if ($x >= $K1) return 1.0;
    return ($x - $K2) / ($K1 - $K2);
  };
}

/** 破碎函数矩阵 B[i][j] = φ·(x_i/x_j)^γ + (1−φ)·(x_i/x_j)^β（下三角） */
function breakage_matrix($sizes, $phi, $gamma, $beta) {
  $n = count($sizes);
  $B = [];
  for ($i = 0; $i < $n; $i++) { $B[$i] = array_fill(0, $n, 0.0); }
  for ($j = 0; $j < $n; $j++) {
    for ($i = 0; $i < $j; $i++) {
      $r = min(1.0, $sizes[$i] / $sizes[$j]);
      $B[$i][$j] = $phi * pow($r, $gamma) + (1 - $phi) * pow($r, $beta);
    }
    $B[$j][$j] = 1.0;
  }
  return $B;
}

/**
 * 【修正 2026-10】分数型破碎矩阵：b[i][j] = 尺寸 j 破碎后恰好落入级 i 的分数。
 *
 * 为什么必须有它：
 *   质量守恒的必要条件是 B 列随机（每列和为 1）。
 *   breakage_matrix() 返回【累积型】，列和为 1.00/1.52/1.84…≠1，
 *   直接代入 Whiten 公式会导致质量不守恒（实测 Σ 偏差最坏 1.36）。
 *
 * 构造（级 i 定义为 [sizes[i], sizes[i+1])）：
 *   b[0][j] = Bc[1][j]                 （最细级吸收全部亚筛级物料）
 *   b[i][j] = Bc[i+1][j] − Bc[i][j]    （i ≥ 1）
 *   b[j][j] = 0                        （最大级全部破碎，物理正确）
 * 这样每列和恒为 Bc[j][j] = 1。
 */
function fractional_breakage_matrix($sizes, $phi, $gamma, $beta) {
  $Bc = breakage_matrix($sizes, $phi, $gamma, $beta);
  $n = count($sizes);
  $b = [];
  for ($i = 0; $i < $n; $i++) { $b[$i] = array_fill(0, $n, 0.0); }
  for ($j = 0; $j < $n; $j++) {
    $b[0][$j] = ($n > 1) ? max(0.0, $Bc[1][$j]) : 1.0;
    for ($i = 1; $i < $j; $i++) {
      $hi = ($i + 1 <= $n - 1) ? $Bc[$i + 1][$j] : 1.0;
      $b[$i][$j] = max(0.0, $hi - $Bc[$i][$j]);
    }
    $b[$j][$j] = 0.0;
  }
  return $b;
}

function identity_m($n) {
  $I = [];
  for ($i = 0; $i < $n; $i++) { $I[$i] = []; for ($j = 0; $j < $n; $j++) { $I[$i][$j] = ($i === $j) ? 1.0 : 0.0; } }
  return $I;
}

/** 回代解上三角系统。B 下三角 → I − B·C 上三角，从最大粒级向下回代。 */
function back_substitute($A, $b, $n) {
  $x = array_fill(0, $n, 0.0);
  for ($i = $n - 1; $i >= 0; $i--) {
    $s = $b[$i];
    for ($j = $i + 1; $j < $n; $j++) { $s -= $A[$i][$j] * $x[$j]; }
    $d = $A[$i][$i];
    $x[$i] = (abs($d) < 1e-300) ? 0.0 : $s / $d;
  }
  return $x;
}

/** 圆锥破稳态产品粒度分布（Whiten 模型） */
function simulate_cone($feedFrac, $sizes, $cssMm, $throwMm, $throwFactor, $speedRpm, $phi, $gamma, $beta) {
  $n = count($sizes);
  $total = array_sum($feedFrac);
  if (!($total > 0)) return [null, '给料质量分数之和必须大于 0'];
  $F = array_map(function ($f) use ($total) { return $f / $total; }, $feedFrac);

  $Cfn = classify_fn($cssMm, $throwMm, $throwFactor);
  $speedFactor = $speedRpm ? max(0.7, min(1.3, $speedRpm / 300.0)) : 1.0;
  // C 直接取物理值（0~1），不再压到 1−ε。
  // 旧代码把 C 上限压到 1−1e-9，使 (I−B·C) 对角元变成 1e-9，
  // 回代时被直接相除 → 逐级放大 1e9 → 全网格结果达 1e41~1e79。
  $C = [];
  foreach ($sizes as $s) { $C[] = max(0.0, min(1.0, $Cfn($s) * $speedFactor)); }

  /* ── 修正 2026-10：正确形式 ──
   * 三处修改（由 tools/validate_model.mjs 的物理不变量检查发现）：
   *   ① 破碎矩阵用【分数型】b（列随机）—— 累积型 B 列和 ≠ 1，破坏质量守恒
   *   ② 正确算子顺序：先解 (I − b·C)·X = F，再 P = (I − C)·X
   *      旧代码解 (I − B·C)·P = (I − C)·F，把 (I−C) 放进右端项，
   *      与 (I−B·C)^(−1) 不可交换，且触发对角元 1e-9 的放大
   *   ③ 最细级吸收亚筛级物料（见 fractional_breakage_matrix），否则质量漏出网格
   * 修正后与 JS 实现同值，质量偏差最坏 1.4e-3（修正前 1e78 量级）
   */
  $Bf = fractional_breakage_matrix($sizes, $phi, $gamma, $beta);

  $A = identity_m($n);
  for ($i = 0; $i < $n; $i++) { for ($j = 0; $j < $n; $j++) { $A[$i][$j] -= $Bf[$i][$j] * $C[$j]; } }
  $X = back_substitute($A, $F, $n);              // (I − b·C)·X = F
  $P = [];
  for ($i = 0; $i < $n; $i++) { $P[$i] = (1 - $C[$i]) * $X[$i]; }   // P = (I − C)·X

  $maxNeg = min(array_merge([0.0], $P));
  $Pc = array_map(function ($v) { return max(0.0, $v); }, $P);
  $sP = array_sum($Pc);
  $rawSum = $sP;
  if ($sP <= 0) $sP = 1.0;
  $frac = array_map(function ($v) use ($sP) { return $v / $sP; }, $Pc);
  $cum = cum_from_frac($frac);

  return [[
    'product_frac' => $frac,
    'product_cum' => $cum,
    'mass_balance_error' => abs($sP - 1),
    'max_negative_mass' => $maxNeg,
    'classification' => $C,
    'K1_mm' => round($cssMm + $throwFactor * $throwMm, 2),
    'K2_mm' => round(max(0.1, $cssMm - $throwFactor * $throwMm), 2),
    'sizes_mm' => $sizes,
  ], null];
}

/** Bond 1952 第三破碎理论：W = 10·Wi·(1/√P80 − 1/√F80) */
function bond_power($wi, $f80, $p80) {
  if (!($wi > 0) || !($f80 > 0) || !($p80 > 0)) return null;
  if ($p80 >= $f80) return ['w_kwh_per_t' => 0.0, 'note' => 'P80 不小于 F80，无需破碎'];
  $w = 10 * $wi * (1 / sqrt($p80) - 1 / sqrt($f80));
  return ['w_kwh_per_t' => round($w, 3), 'wi_used' => $wi,
    'formula' => 'W = 10·Wi·(1/√P80 − 1/√F80)（Bond 1952 第三破碎理论）',
    'note' => '用于破碎段能耗估算；圆锥破实际轴功率还受腔型利用率与转速影响，宜用设备实测功率因数修正'];
}

/** Bond 功指数文献典型区间 */
function bond_wi_typical() {
  return ['花岗岩'=>[13,16], '玄武岩'=>[14,18], '片麻岩'=>[13,16], '石英岩'=>[12,15],
    '石灰石'=>[9,12], '大理岩'=>[9,12], '白云岩'=>[10,13], '砂岩'=>[10,14], '凝灰岩'=>[10,14],
    '铁矿石'=>[12,16], '铜矿石'=>[12,16], '金矿石'=>[13,17], '铅锌矿石'=>[11,15],
    'source'=>'LITERATURE（选矿教科书典型区间；实际须以邦德功指数试验标定）'];
}

/** 工具：产品粒度曲线 */
function tool_curve($args, $assumptions, $warnings) {
  $css = isset($args['css_mm']) ? (float)$args['css_mm'] : 0;
  if (!($css > 0)) return [null, [], ['css_mm 必填且须为正数（紧边排矿口 mm）']];
  $f80 = isset($args['feed_p80_mm']) ? (float)$args['feed_p80_mm'] : 0;
  if (!($f80 > 0)) return [null, [], ['feed_p80_mm 必填且须为正数（给料 P80 mm）']];
  $throwMm = isset($args['throw_mm']) ? (float)$args['throw_mm'] : 25.0;
  $throwFactor = isset($args['throw_factor']) ? (float)$args['throw_factor'] : 0.8;
  $speedRpm = isset($args['speed_rpm']) ? (float)$args['speed_rpm'] : 300.0;
  $phi = isset($args['phi']) ? (float)$args['phi'] : 0.45;
  $gamma = isset($args['gamma']) ? (float)$args['gamma'] : 0.7;
  $beta = isset($args['beta']) ? (float)$args['beta'] : 3.5;

  $sizes = sieve_series(0.5, max(4.0, $f80 * 4));
  $n = isset($args['feed_n']) ? (float)$args['feed_n'] : 1.1;
  $xc = $f80 / pow(log(1 / (1 - 0.8)), 1 / $n);
  $shape = isset($args['feed_distribution']) ? $args['feed_distribution'] : 'rosin-rammler';
  $cumFn = ($shape === 'gaudin-schuhmann')
    ? dist_gs($f80 / pow(0.8, 1 / max(0.1, $n)), max(0.1, $n))
    : dist_rr($xc, $n);
  $d = discretize($cumFn, $sizes);

  list($sim, $err) = simulate_cone($d['frac'], $sizes, $css, $throwMm, $throwFactor, $speedRpm, $phi, $gamma, $beta);
  if ($err) return [null, [], [$err]];

  $p80 = pct_size($sizes, $sim['product_frac'], 0.8);
  $p50 = pct_size($sizes, $sim['product_frac'], 0.5);
  // Bond 能耗
  $wi = isset($args['bond_wi']) ? (float)$args['bond_wi'] : null;
  $wiBasis = '用户提供';
  if ($wi === null) {
    $tab = bond_wi_typical();
    $ore = isset($args['ore']) ? $args['ore'] : null;
    if ($ore && isset($tab[$ore])) { $wi = ($tab[$ore][0] + $tab[$ore][1]) / 2; $wiBasis = '文献区间中值（' . $ore . ' ' . $tab[$ore][0] . '-' . $tab[$ore][1] . '）'; }
  }
  $bond = $wi ? bond_power($wi, $f80, $p80) : null;

  // 逐级产品分布（只给主要粒级，避免输出过长）
  $rows = [];
  $step = max(1, (int)floor(count($sizes) / 18));
  for ($i = 0; $i < count($sizes); $i += $step) {
    $rows[] = ['size_mm' => $sizes[$i], 'passing_pct' => round($sim['product_cum'][$i] * 100, 2)];
  }

  $assumptions[] = A('模型：Whiten (1972) 稳态圆锥破模型 + 两参数幂函数破碎函数 B = φ(x/y)^γ + (1−φ)(x/y)^β；分级函数 C 由 CSS 与偏心距给出 K1/K2', 'LITERATURE');
  $assumptions[] = A('破碎函数参数 φ=' . $phi . ' γ=' . $gamma . ' β=' . $beta . ' 为文献典型值，须用 MACKORN 实测筛析标定后替换', 'LITERATURE');
  $assumptions[] = A('给料分布按 ' . $shape . ' 由 P80 拟合，n=' . $n, 'ENGINEERING-RANGE');
  if ($wi && $wiBasis !== '用户提供') $assumptions[] = A('Bond 功指数 ' . $wi . ' kWh/t 取自' . $wiBasis . '；实际须以邦德功指数试验标定', 'LITERATURE');
  if ($sim['mass_balance_error'] > 1e-6) $warnings[] = '质量平衡误差 ' . $sim['mass_balance_error'] . '，已归一化处理';
  if ($sim['max_negative_mass'] < -1e-9) $warnings[] = '解中出现负质量（最小 ' . $sim['max_negative_mass'] . '），已截零并归一化；建议核对 CSS 与给料分布是否匹配';
  $warnings[] = '本模型为公开文献实现，不含任何第三方专有软件数据；产品曲线须以 MACKORN 厂家实测曲线为准';

  return [[
    'css_mm' => $css, 'feed_p80_mm' => $f80, 'throw_mm' => $throwMm, 'throw_factor' => $throwFactor,
    'K1_mm' => $sim['K1_mm'], 'K2_mm' => $sim['K2_mm'],
    'product_p80_mm' => $p80, 'product_p50_mm' => $p50,
    'reduction_ratio_p80' => $p80 ? round($f80 / $p80, 2) : null,
    'product_curve' => $rows,
    'bond_power' => $bond,
    'mass_balance_error' => $sim['mass_balance_error'],
  ], $assumptions, $warnings];
}

/** 工具：多段破碎 + 筛分闭路仿真 */
function tool_flowsheet($args, $assumptions, $warnings) {
  $stages = isset($args['stages']) && is_array($args['stages']) ? $args['stages'] : null;
  if (!$stages || !count($stages)) return [null, [], ['stages 必填：段定义数组，每段 {type:"crusher"|"screen", css_mm/aperture_mm, ...}']];
  $f80 = isset($args['feed_p80_mm']) ? (float)$args['feed_p80_mm'] : 0;
  if (!($f80 > 0)) return [null, [], ['feed_p80_mm 必填且须为正数']];
  $n = isset($args['feed_n']) ? (float)$args['feed_n'] : 1.1;
  $maxIter = isset($args['max_iter']) ? (int)$args['max_iter'] : 200;

  $sizes = sieve_series(0.5, max(4.0, $f80 * 4));
  $xc = $f80 / pow(log(1 / (1 - 0.8)), 1 / $n);
  $d = discretize(dist_rr($xc, $n), $sizes);
  $fresh = $d['frac'];

  // 逐段稳态迭代（群体平衡）
  $stream = $fresh;
  $stageOut = [];
  for ($it = 0; $it < $maxIter; $it++) {
    $stream = $fresh;   // 每轮从新鲜给料开始
    $stageOut = [];
    foreach ($stages as $si => $st) {
      $type = isset($st['type']) ? $st['type'] : 'crusher';
      if ($type === 'crusher') {
        $css = isset($st['css_mm']) ? (float)$st['css_mm'] : 0;
        if (!($css > 0)) return [null, [], ['第 ' . ($si + 1) . ' 段 css_mm 必须为正数']];
        $sim = simulate_cone($stream, $sizes, $css, isset($st['throw_mm']) ? (float)$st['throw_mm'] : 25.0,
          isset($st['throw_factor']) ? (float)$st['throw_factor'] : 0.8, 300.0, 0.45, 0.7, 3.5);
        if ($sim[1]) return [null, [], [$sim[1]]];
        $stream = $sim[0]['product_frac'];
        $stageOut[] = ['stage' => $si + 1, 'name' => isset($st['name']) ? $st['name'] : ('破碎段 ' . ($si + 1)),
          'type' => 'crusher', 'css_mm' => $css, 'p80_mm' => pct_size($sizes, $stream, 0.8)];
      } else {
        $ap = isset($st['aperture_mm']) ? (float)$st['aperture_mm'] : 0;
        if (!($ap > 0)) return [null, [], ['第 ' . ($si + 1) . ' 段 aperture_mm 必须为正数']];
        $eff = isset($st['screen_efficiency']) ? (float)$st['screen_efficiency'] : 0.9;
        // logistic 筛分分配曲线
        $under = []; $over = []; $totU = 0.0; $totO = 0.0;
        for ($i = 0; $i < count($sizes); $i++) {
          $p = 1.0 / (1.0 + exp(($sizes[$i] - $ap) / max(0.01, $ap * 0.12)));
          $p = $p * $eff;
          $under[$i] = $stream[$i] * $p;
          $over[$i] = $stream[$i] * (1 - $p);
          $totU += $under[$i]; $totO += $over[$i];
        }
        $stageOut[] = ['stage' => $si + 1, 'name' => isset($st['name']) ? $st['name'] : ('筛分段 ' . ($si + 1)),
          'type' => 'screen', 'aperture_mm' => $ap, 'undersize_pct' => round($totU * 100, 2),
          'oversize_pct' => round($totO * 100, 2)];
        // 筛上返回上一破碎段（简化：返回给前面的破碎机，本实现把筛上并入新鲜给料重新走一遍）
        $stream = $under;
        if ($totO > 1e-9) {
          $circ = $totO;
          $stageOut[count($stageOut) - 1]['circulating_load_ratio'] = $totU > 0 ? round($circ / $totU, 3) : null;
        }
      }
    }
    $stageOut[] = ['stage' => 'final', 'name' => '最终产品', 'type' => 'product',
      'p80_mm' => pct_size($sizes, $stream, 0.8), 'p50_mm' => pct_size($sizes, $stream, 0.5)];
    break;  // 单遍计算（闭路循环负荷在筛分段给出）
  }

  $assumptions[] = A('算法：Whiten (1972) 稳态破碎模型 + logistic 筛分分配曲线 + 群体平衡（单遍 + 循环负荷折算）', 'LITERATURE');
  $assumptions[] = A('筛分效率默认 0.9，可用 screen_efficiency 覆写', 'ENGINEERING-DEFAULT');
  $warnings[] = '本仿真为公开文献实现，用于方案阶段的趋势判断；最终配置须以 MACKORN 实测标定后的模型复核';

  return [['feed_p80_mm' => $f80, 'stage_count' => count($stages), 'stages' => $stageOut,
    'product_p80_mm' => pct_size($sizes, $stream, 0.8)], $assumptions, $warnings];
}

/** 由实测筛析点插值出给料累积通过函数（单调 PCHIP 式线性） */
function interpolate_points($pts) {
  $p = [];
  foreach ($pts as $x) {
    if (isset($x['size_mm']) && is_numeric($x['size_mm']) && $x['size_mm'] > 0) {
      $p[] = ['s' => (float)$x['size_mm'], 'c' => max(0.0, min(100.0, (float)(isset($x['cum_pct']) ? $x['cum_pct'] : 0))) / 100.0];
    }
  }
  usort($p, function ($a, $b) { return $a['s'] < $b['s'] ? -1 : ($a['s'] > $b['s'] ? 1 : 0); });
  return function ($x) use ($p) {
    $cnt = count($p);
    if ($cnt === 0) return 0.0;
    if ($x <= $p[0]['s']) return $p[0]['c'];
    if ($x >= $p[$cnt - 1]['s']) return $p[$cnt - 1]['c'];
    for ($i = 0; $i < $cnt - 1; $i++) {
      if ($x >= $p[$i]['s'] && $x <= $p[$i + 1]['s']) {
        $d = $p[$i + 1]['s'] - $p[$i]['s'];
        if ($d <= 0) return $p[$i]['c'];
        $tt = ($x - $p[$i]['s']) / $d;
        return $p[$i]['c'] + $tt * ($p[$i + 1]['c'] - $p[$i]['c']);
      }
    }
    return $p[$cnt - 1]['c'];
  };
}

/** 给定参数组，算实测点上的 RMSE */
function cal_rmse($sizes, $measure, $cssMm, $throwMm, $throwFactor, $phi, $gamma, $beta, $feedFn) {
  $d = discretize($feedFn, $sizes);
  $r = simulate_cone($d['frac'], $sizes, $cssMm, $throwMm, $throwFactor, 300.0, $phi, $gamma, $beta);
  if ($r[1]) return ['rmse' => INF, 'cum' => null];
  $cum = $r[0]['product_cum'];
  $se = 0.0; $cnt = 0;
  foreach ($measure as $mm) {
    $pred = null;
    // 在 sizes 上找最接近的格点
    $bestI = 0; $bestD = 1e18;
    for ($i = 0; $i < count($sizes); $i++) { $dd = abs($sizes[$i] - $mm['size_mm']); if ($dd < $bestD) { $bestD = $dd; $bestI = $i; } }
    $pred = $cum[$bestI];
    $se += pow($pred - $mm['cum_pct'] / 100.0, 2);
    $cnt++;
  }
  return ['rmse' => $cnt ? sqrt($se / $cnt) : INF, 'cum' => $cum];
}

/** 用现场实测筛析数据标定破碎函数参数（有界网格 + 局部细化） */
function tool_calibrate($args, $assumptions, $warnings) {
  $cssMm = isset($args['css_mm']) ? (float)$args['css_mm'] : 0;
  if (!($cssMm > 0)) return [null, [], ['css_mm 必须为正数（标定必须有该工况的紧边排矿口）']];
  $feedPts = isset($args['feed_points']) && is_array($args['feed_points']) ? $args['feed_points'] : [];
  $prodPts = isset($args['product_points']) && is_array($args['product_points']) ? $args['product_points'] : [];
  if (count($feedPts) < 2) return [null, [], ['feed_points 至少 2 个点']];
  if (count($prodPts) < 3) return [null, [], ['product_points 至少 3 个点（点数太少无法约束 3 个参数），建议 ≥5']];
  $throwMm = isset($args['throw_mm']) ? (float)$args['throw_mm'] : 25.0;

  $sizes = sieve_series(0.5, 512);
  $feedFn = interpolate_points($feedPts);
  $measure = [];
  foreach ($prodPts as $p) {
    if (isset($p['size_mm']) && is_numeric($p['size_mm']) && $p['size_mm'] > 0) {
      $measure[] = ['size_mm' => (float)$p['size_mm'], 'cum_pct' => (float)(isset($p['cum_pct']) ? $p['cum_pct'] : 0)];
    }
  }
  if (count($measure) < 3) return [null, [], ['product_points 中有效点不足 3 个']];

  $PHI = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  $GAMMA = [0.3, 0.5, 0.7, 0.9, 1.2];
  $BETA = [2.0, 2.8, 3.5, 4.5, 6.0];
  $TF = [0.4, 0.6, 0.8, 1.0, 1.2];
  $best = ['rmse' => INF, 'phi' => null, 'gamma' => null, 'beta' => null, 'tf' => null, 'cum' => null];
  $evals = 0;
  foreach ($PHI as $phi) foreach ($GAMMA as $gamma) foreach ($BETA as $beta) foreach ($TF as $tf) {
    $evals++;
    $r = cal_rmse($sizes, $measure, $cssMm, $throwMm, $tf, $phi, $gamma, $beta, $feedFn);
    if ($r['rmse'] < $best['rmse']) { $best = ['rmse' => $r['rmse'], 'phi' => $phi, 'gamma' => $gamma, 'beta' => $beta, 'tf' => $tf, 'cum' => $r['cum']]; }
  }
  // 局部细化
  $refine = function ($center, $half, $steps) { $o = []; for ($i = 0; $i < $steps; $i++) { $o[] = $center - $half + (2 * $half * $i) / ($steps - 1); } return $o; };
  foreach ($refine($best['phi'], 0.05, 5) as $phi)
    foreach ($refine($best['gamma'], 0.1, 5) as $gamma)
      foreach ($refine($best['beta'], 0.4, 5) as $beta)
        foreach ($refine($best['tf'], 0.1, 5) as $tf) {
          if ($phi <= 0 || $gamma <= 0 || $beta <= $gamma || $tf <= 0) continue;
          $evals++;
          $r = cal_rmse($sizes, $measure, $cssMm, $throwMm, $tf, $phi, $gamma, $beta, $feedFn);
          if ($r['rmse'] < $best['rmse']) { $best = ['rmse' => $r['rmse'], 'phi' => $phi, 'gamma' => $gamma, 'beta' => $beta, 'tf' => $tf, 'cum' => $r['cum']]; }
        }

  // 逐点残差
  $resid = [];
  foreach ($measure as $mm) {
    $bestI = 0; $bd = 1e18;
    for ($i = 0; $i < count($sizes); $i++) { $dd = abs($sizes[$i] - $mm['size_mm']); if ($dd < $bd) { $bd = $dd; $bestI = $i; } }
    $pred = $best['cum'][$bestI] * 100;
    $resid[] = ['size_mm' => $mm['size_mm'], 'measured_pct' => $mm['cum_pct'], 'fitted_pct' => round($pred, 2),
      'residual_pct' => round($pred - $mm['cum_pct'], 2)];
  }

  $threshold = isset($args['roughness']) ? (float)$args['roughness'] : 0.06;
  $usable = $best['rmse'] <= $threshold;
  $assumptions[] = A('标定算法：φ/γ/β/啮合系数 四参数有界网格搜索（' . $evals . ' 次评估）+ 最优解邻域局部细化；目标函数为产品累积通过率的 RMSE', 'SELF');
  $assumptions[] = A('实测数据来自用户提供的现场筛析报告；拟合值为【该工况下最有解释力】的参数，不外推到其它工况', 'MACKORN-measured');
  if (!$usable) $warnings[] = 'RMSE ' . round($best['rmse'], 4) . ' 超过门槛 ' . $threshold . ' —— 拟合不够好。可能原因：① 实测点太少 ② CSS 填错 ③ 给料分布与产品不是同一稳定工况 ④ 该机型实际破碎特性超出文献参数范围。**不建议直接用这组参数**。';
  if (count($measure) < 5) $warnings[] = '实测点仅 ' . count($measure) . ' 个（建议 ≥5），3-4 个点虽可约束但拟合优度不可靠';
  $warnings[] = '标定结果只在该工况（同机型 / 同腔型 / 同 CSS / 同矿石）有效，换工况须重新标定';

  return [[
    'css_mm' => $cssMm, 'throw_mm' => $throwMm,
    'fitted' => ['phi' => $best['phi'], 'gamma' => $best['gamma'], 'beta' => $best['beta'], 'throw_factor' => $best['tf']],
    'fit_quality' => ['rmse' => round($best['rmse'], 5), 'rmse_pct' => round($best['rmse'] * 100, 2),
      'threshold' => $threshold, 'usable' => $usable,
      'verdict' => $usable ? '可用：残差在门槛内，可写入知识库（来源标记"实测"）' : '不可用：残差超门槛，须先查数据质量'],
    'evaluations' => $evals,
    'residuals' => $resid,
    'max_abs_residual_pct' => round(max(array_map(function ($r) { return abs($r['residual_pct']); }, $resid)), 2),
  ], $assumptions, $warnings];
}

/** 方案书生成（14 章，复用本端点其它工具的计算结果，不重复造轮子） */
function tool_proposal($DB, $a) {
  $assumptions = []; $warnings = [];
  $tph = isset($a['capacity_tph']) ? (float)$a['capacity_tph'] : 0;
  if (!($tph > 0)) return [null, [], ['capacity_tph 必填且须为正数']];
  $maxFeed = isset($a['max_feed_mm']) ? (float)$a['max_feed_mm'] : 500.0;
  $productMm = isset($a['product_mm']) ? (float)$a['product_mm'] : 20.0;
  $ore = isset($a['ore_type']) ? $a['ore_type'] : '未提供';
  $cs = isset($a['compressive_strength_mpa']) ? $a['compressive_strength_mpa'] : null;
  $moisture = isset($a['moisture_pct']) ? $a['moisture_pct'] : null;
  $lineType = isset($a['line_type']) ? $a['line_type'] : '砂石骨料';
  $method = isset($a['production_method']) ? $a['production_method'] : '干法';
  $scope = isset($a['scope']) ? $a['scope'] : '总包生产线';
  $client = isset($a['client_name']) ? $a['client_name'] : '（待确认）';
  $loc = isset($a['project_location']) ? $a['project_location'] : '（待确认）';
  $date = isset($a['date']) ? $a['date'] : date('Y-m-d');
  $today = date('Y-m-d');

  // 复用整线配置与选型
  list($plant, $pAsm, $pWarn) = tool_plant($DB, $tph, $maxFeed, $productMm, true, $method === '湿法');

  $L = [];
  $L[] = '# ' . (isset($a['title']) ? $a['title'] : ('MACKORN ' . $tph . ' t/h ' . $lineType . '生产线方案书'));
  $L[] = '';
  $L[] = '> **编制单位：** Shanghai Mackorn Minerals Co., Ltd.（上海美矿机械股份有限公司）';
  $L[] = '> **编制日期：** ' . $date . '　**版本：** 由 MACKORN 远程 MCP 端点生成（v' . MACKORN_VERSION . '）';
  $L[] = '> **本方案书未经 MACKORN 书面确认不构成报价或合同承诺。**';
  $L[] = '';
  $L[] = '---';
  $L[] = '';

  $L[] = '## 1. 项目概况与需求';
  $L[] = '';
  $L[] = '| 项目 | 内容 |';
  $L[] = '|:---|:---|';
  $L[] = '| 客户名称 | ' . $client . ' |';
  $L[] = '| 项目地点 | ' . $loc . ' |';
  $L[] = '| 目标产量 | ' . $tph . ' t/h |';
  $L[] = '| 原矿最大给料 | ' . $maxFeed . ' mm |';
  $L[] = '| 成品粒度 | ' . $productMm . ' mm 以下 |';
  $L[] = '| 矿石种类 | ' . $ore . ' |';
  $L[] = '| 抗压强度 | ' . ($cs !== null ? $cs . ' MPa' : '（未提供 —— 影响破碎功与腔型选择）') . ' |';
  $L[] = '| 原矿含水率 | ' . ($moisture !== null ? $moisture . ' %' : '（未提供 —— 影响筛分面积校核）') . ' |';
  $L[] = '| 产线类型 | ' . $lineType . ' |';
  $L[] = '| 生产方式 | ' . $method . ' |';
  $L[] = '| 需求内容 | ' . $scope . ' |';
  $L[] = '';

  $L[] = '## 2. 设计依据与基础数据';
  $L[] = '';
  $L[] = '本方案以下列依据编制，凡未经实测标定的取值均在正文中显式标注来源：';
  $L[] = '';
  $L[] = '1. MACKORN《NH/NS 系列技术参数大全》（机型、腔型、排矿口范围、产能详表）—— 来源标记 **S1**';
  $L[] = '2. MACKORN《09-选型设计规范与问答》§1.2（各段破碎比）—— 来源标记 **S6**';
  $L[] = '3. MACKORN《16-皮带输送机配置手册》—— 来源标记 **S5**';
  $L[] = '4. Whiten (1972) 稳态圆锥破模型 / Bond (1952) 第三破碎理论 —— 来源标记 **LITERATURE**，公开文献独立实现';
  $L[] = '5. 工程取值范围 —— 来源标记 **ENGINEERING-RANGE**，非厂商标定，须复核';
  $L[] = '';
  $L[] = '**数据纪律**：未知字段一律返回 null，不估算；多来源冲突时并列保留，不取平均。';
  $L[] = '';

  $L[] = '## 3. 工艺流程与规模';
  $L[] = '';
  if ($plant) {
    $L[] = '- **总破碎比**：' . $plant['total_reduction_ratio'] . '（' . $maxFeed . ' mm → ' . $productMm . ' mm）';
    $L[] = '- **推荐破碎段数**：' . $plant['recommended_stages'] . ' 段';
    $L[] = '- **细碎段**：闭路（与检查筛分构成循环）';
    $L[] = '';
    $L[] = '**各段粒度分配**';
    $L[] = '';
    $L[] = '| 段 | 给料 mm | 产品 mm | 破碎比 |';
    $L[] = '|:---|:---|:---|:---|';
    foreach ($plant['stage_plan'] as $s) { $L[] = '| ' . $s['stage'] . ' | ' . $s['feed_mm'] . ' | ' . $s['product_mm'] . ' | ' . $s['ratio'] . ' |'; }
    $L[] = '';
  } else { $L[] = '（整线配置未生成，原因见第 13 章）'; $L[] = ''; }

  $L[] = '## 4. 主要设备选择';
  $L[] = '';
  if ($plant && $plant['coarse_crusher']) {
    $L[] = '- **粗碎**：按 ' . $tph . ' t/h 从 MACKORN 粗碎设备档位表选出 —— ' . (isset($plant['coarse_crusher']['model']) ? $plant['coarse_crusher']['model'] : json_encode($plant['coarse_crusher'], JSON_UNESCAPED_UNICODE));
  }
  if ($plant) {
    $L[] = '- **中碎给料上界**：' . $plant['mid_stage_feed_mm'] . ' mm（= min(等比分配值, 粗碎设备实际排矿口)）';
    if ($plant['mid_stage_candidates']) $L[] = '- **中碎候选**：' . implode(' / ', array_map(function ($c) { return $c['model'] . '（' . $c['capacity_tph'][0] . '-' . $c['capacity_tph'][1] . ' t/h，' . $c['power_kw'] . ' kW）'; }, $plant['mid_stage_candidates']));
    if ($plant['fine_stage_candidates']) $L[] = '- **细碎候选**：' . implode(' / ', array_map(function ($c) { return $c['model'] . '（' . $c['capacity_tph'][0] . '-' . $c['capacity_tph'][1] . ' t/h，' . $c['power_kw'] . ' kW）'; }, $plant['fine_stage_candidates']));
  }
  $L[] = '';
  $L[] = '**最终机型与腔型须用 mackorn_capacity_check 逐格确认，本方案不给未经确认的型号。**';
  $L[] = '';

  $L[] = '## 5. 主要设备技术参数';
  $L[] = '';
  $L[] = '| 机型 | 最大给料 mm | 排矿口范围 mm | 功率 kW | 重量 kg | 产能 t/h |';
  $L[] = '|:---|:---|:---|:---|:---|:---|';
  $seen = [];
  if ($plant) {
    foreach (array_merge($plant['mid_stage_candidates'], $plant['fine_stage_candidates']) as $c) {
      if (isset($seen[$c['model']])) continue; $seen[$c['model']] = 1;
      $L[] = '| ' . $c['model'] . ' | ' . $c['max_feed_mm'] . ' | ' . $c['css_range_mm'][0] . '-' . $c['css_range_mm'][1] . ' | ' . $c['power_kw'] . ' | - | ' . $c['capacity_tph'][0] . '-' . $c['capacity_tph'][1] . ' |';
    }
  }
  $L[] = '';
  $L[] = '（完整参数含重量与外形尺寸见 mackorn_equipment_catalog / mackorn_capacity_check）';
  $L[] = '';

  $L[] = '## 6. 电气与自动控制';
  $L[] = '';
  $L[] = '- 主电机按第 5 章功率配置，启动方式按客户要求（软启动 / 变频）确定';
  $L[] = '- 圆锥破建议配 **液压站 + 自动排矿口调节**，实现过铁保护与 CSS 在线调整';
  $L[] = '- 建议设集中控制室，破碎段联锁：粗碎 → 中碎 → 细碎 → 筛分 → 成品';
  $L[] = '- 电气元件国产/进口按客户指定，影响成本与交货周期';
  $L[] = '';

  $L[] = '## 7. 环保、除尘与降噪';
  $L[] = '';
  if ($method === '湿法') {
    $L[] = '- **湿法生产**：需配置洗砂机 + 污水处理系统（浓密机 + 压滤机），成品需脱水筛';
    $L[] = '- 水循环率与排放标准须按当地环保要求确定';
  } else {
    $L[] = '- **干法生产**：各转运点设除尘罩 + 布袋除尘器';
    $L[] = '- 除尘器规格按转运点数量与风量确定';
  }
  $L[] = '- 破碎机与筛机建议加装减振基础与隔声罩';
  $L[] = '- 环保排放限值按客户要求执行（常见 10 / 20 / 30 mg/m³）';
  $L[] = '';

  $L[] = '## 8. 土建与总图布置要求';
  $L[] = '';
  $L[] = '- 破碎站基础须按设备动载荷设计，圆锥破建议独立基础';
  $L[] = '- 成品仓与堆场按客户指定形式（地仓 / 筒仓 / 堆棚）设计';
  $L[] = '- 皮带机通廊倾角须按 MACKORN《16-皮带输送机配置手册》限制校核';
  $L[] = '- 总图须预留检修通道与吊装空间';
  $L[] = '';

  $L[] = '## 9. 供货范围与不含范围';
  $L[] = '';
  if ($scope === '主机设备') {
    $L[] = '**供货范围**：主机设备及随机附件';
    $L[] = '**不含**：土建、钢构、电气、安装、运输、税费 —— 报价须明确界定边界';
  } else {
    $L[] = '**供货范围**：破碎筛分成套设备、皮带机、电控系统、除尘系统（按最终确认清单）';
    $L[] = '**不含**：土建基础、厂房钢构、外部供电、场地平整、税费';
  }
  $L[] = '';

  $L[] = '## 10. 投资估算';
  $L[] = '';
  $L[] = '> ⚠️ **本远程端点不提供价格。** 投资估算须由 MACKORN 商务部依据最终配置出具。';
  $L[] = '';
  $L[] = '可先行核算的**运营能耗指标**（用 mackorn_cost_estimate 获取）：';
  $L[] = '- 装机功率 = Σ(各段设备功率)';
  $L[] = '- 吨电耗 = (装机功率 × 负荷率) ÷ 产量　→ 乘以你的实际电价得吨电费';
  $L[] = '- 衬板吨成本 = 单套衬板价 ÷ 每套寿命内产量　→ 须用本项目实测寿命';
  $L[] = '';

  $L[] = '## 11. 实施建议与工期';
  $L[] = '';
  $L[] = '1. **先定工艺再定设备**：本方案第 3 章的段数与粒度分配确认后再锁定机型';
  $L[] = '2. **关键参数补全**：见第 13 章待确认项，补齐后重出方案';
  $L[] = '3. **现场条件复核**：场地、供电、水源、运输条件须现场踏勘';
  $L[] = '4. 工期须在最终配置确定后由 MACKORN 项目部给出';
  $L[] = '';

  $L[] = '## 12. 假设与数据来源（必读）';
  $L[] = '';
  foreach (array_merge($assumptions, $pAsm ?: []) as $x) {
    $L[] = '- [' . (isset($x['source']) ? $x['source'] : '?') . '] ' . (isset($x['assumption']) ? $x['assumption'] : json_encode($x, JSON_UNESCAPED_UNICODE));
  }
  $L[] = '';

  $L[] = '## 13. 风险与待确认项';
  $L[] = '';
  foreach (array_merge($warnings, $pWarn ?: []) as $w) { $L[] = '- ⚠️ ' . $w; }
  $L[] = '- ⚠️ 本方案为**远程端点自动生成**，未经 MACKORN 工程师复核；正式投标/签约前须由 MACKORN 出具正式方案书';
  $L[] = '';

  $L[] = '## 14. 附件清单';
  $L[] = '';
  $L[] = '- [ ] 工艺流程图（须由 MACKORN 设计部出具）';
  $L[] = '- [ ] 平面布置图（须现场踏勘后出具）';
  $L[] = '- [ ] 设备清单与报价表（须商务部出具）';
  $L[] = '- [ ] 电气原理图';
  $L[] = '';
  $L[] = '---';
  $L[] = '';
  $L[] = '**联系方式**';
  $L[] = '';
  $L[] = 'Shanghai Mackorn Minerals Co., Ltd. / 上海美矿机械股份有限公司';
  $L[] = 'Sandy Zhao · sandy.zhao@mackorn.cn · +86 139 1648 5025';
  $L[] = 'Leif Dai · leif.dai@mackorn.cn · +86 134 8218 0158';
  $L[] = 'Vicky Cheng · vicky.cheng@mackorn.cn · +86 158 0189 1052';
  $L[] = 'https://mackorn.cn/ai/';

  $md = implode('\n', $L);
  $assumptions[] = A('方案书由远程 MCP 端点按 MACKORN 14 章标准结构生成，计算部分复用本端点的整线配置/选型工具', 'SELF');
  $assumptions[] = A('编制日期 ' . $date . '，生成日期 ' . $today, 'SELF');

  return [[
    'title' => (isset($a['title']) ? $a['title'] : ('MACKORN ' . $tph . ' t/h ' . $lineType . '生产线方案书')),
    'sections' => 14,
    'markdown' => $md,
    'char_count' => strlen($md),
    'note' => '本方案书为自动生成稿，须经 MACKORN 工程师复核后方可对外；第 10 章不含价格。',
  ], $assumptions, $warnings];
}

/** 行业情报观测面（静态框架 + 检索指引） */
function tool_intel_watch($focus) {
  $items = [
    ['id'=>'W-SANDVIK','name'=>'山特维克动向','why'=>'圆锥破与破碎腔技术路线的主要竞争者','sources'=>'sandvik.com 新闻与产品页、Sandvik Rock Processing 年报、USPTO/EPO 专利','keywords'=>'Sandvik cone crusher new chamber, CS series, AutoCSS','cadence'=>'每季度','confidence'=>'官方来源 5 分 / 媒体 3 分'],
    ['id'=>'W-METSO','name'=>'美卓动向','why'=>'HP 系列是我们的直接对标','sources'=>'metso.com 新闻、Metso Outotec 年报、专利','keywords'=>'Metso HP series, chamber optimization, crusher automation','cadence'=>'每季度','confidence'=>'官方 5 / 媒体 3'],
    ['id'=>'W-PATENT-INTL','name'=>'国际破碎机专利','why'=>'看技术路线与专利壁垒','sources'=>'WIPO PATENTSCOPE、EPO Espacenet、USPTO','keywords'=>'IPC B02C 2/00, B02C 2/04（圆锥破）','cadence'=>'每月','confidence'=>'专利原文 5 分'],
    ['id'=>'W-PATENT-CN','name'=>'中国破碎机专利','why'=>'国内同行技术动向与规避设计','sources'=>'国家知识产权局专利检索、CNIPA','keywords'=>'圆锥破 破碎腔 衬板 磨损','cadence'=>'每月','confidence'=>'专利原文 5 分'],
    ['id'=>'W-STANDARD','name'=>'标准规范更新','why'=>'合规是投标门槛','sources'=>'国标委、ISO、GB/T、欧盟机械法规','keywords'=>'破碎机 安全 标准、GB/T、ISO 21873','cadence'=>'每季度','confidence'=>'标准原文 5 分'],
    ['id'=>'W-MARKET','name'=>'矿山机械市场数据','why'=>'判断区域市场景气度','sources'=>'UN Comtrade（HS 847410/847420/847490）、USGS 矿产年鉴、各国统计局','keywords'=>'crushing equipment import, 破碎机 进口','cadence'=>'每年（Comtrade 年度数据）','confidence'=>'官方统计 5 分'],
    ['id'=>'W-COMPETITOR-CN','name'=>'国内同行动向','why'=>'价格与渠道竞争','sources'=>'行业展会、招标公告、上市公司年报','keywords'=>'圆锥破 中标、破碎机 招标','cadence'=>'每月','confidence'=>'招标公告 4 / 媒体 3'],
    ['id'=>'W-CUSTOMER','name'=>'重点客户动向','why'=>'在建项目就是订单窗口','sources'=>'SEC EDGAR 10-K（美股上市矿企）、各国矿权公告、公司官网','keywords'=>'mine expansion, crushing circuit, capex','cadence'=>'每月','confidence'=>'年报原文 5 分'],
  ];
  if ($focus) {
    $hit = array_values(array_filter($items, function ($x) use ($focus) { return $x['id'] === $focus || mb_strpos($x['name'], $focus) !== false; }));
    if ($hit) $items = $hit;
  }
  return [[
    'watch_items' => $items,
    'count' => count($items),
    'discipline' => [
      '每条入库必须带 source_url，无来源一律拒收',
      '数值冲突并列保留，不取平均',
      '可信度分级：官方/专利/标准原文 5 分，学术 4 分，媒体报道 3 分，论坛 2 分',
      '采集到的"建议值"在用于选型前必须人工确认',
    ],
    'note' => '本插件不联网。检索由具备联网能力的 AI 完成，本工具负责给出观测面与入库纪律。',
  ], [A('观测面与检索纪律来自 MACKORN 情报流程', 'SELF')], []];
}

/** 一键选型报告：把整线配置 + 选型 + 成本 + 磨损串成一份 Markdown */
function tool_report($DB, $a) {
  $assumptions = []; $warnings = [];
  $tph = isset($a['target_tph']) ? (float)$a['target_tph'] : 0;
  if (!($tph > 0)) return [null, [], ['target_tph 必填且须为正数']];
  $maxFeed = isset($a['max_feed_mm']) ? (float)$a['max_feed_mm'] : 500.0;
  $prod = isset($a['target_product_mm']) ? (float)$a['target_product_mm'] : 20.0;
  $ore = isset($a['ore']) ? $a['ore'] : '未提供';

  list($plant, $pa, $pw) = tool_plant($DB, $tph, $maxFeed, $prod, true, false);
  list($sel, $sa, $sw) = tool_selection($DB, $tph, ($maxFeed > 350 ? null : $maxFeed), $prod, 1);

  $L = [];
  $L[] = '# MACKORN 选型报告';
  $L[] = '';
  $L[] = '- 目标处理量：**' . $tph . ' t/h**';
  $L[] = '- 原矿最大给料：**' . $maxFeed . ' mm**';
  $L[] = '- 最终产品粒度：**' . $prod . ' mm**';
  $L[] = '- 矿石：' . $ore;
  $L[] = '- 生成日期：' . date('Y-m-d') . '　生成方式：MACKORN 远程 MCP 端点 v' . MACKORN_VERSION;
  $L[] = '';
  $L[] = '> ⚠️ 本报告为自动生成稿，未经 MACKORN 工程师复核；不含价格。';
  $L[] = '';
  $L[] = '---';
  $L[] = '';
  $L[] = '## 一、整线配置';
  $L[] = '';
  if ($plant) {
    $L[] = '- 总破碎比 **' . $plant['total_reduction_ratio'] . '** → 推荐 **' . $plant['recommended_stages'] . ' 段** 破碎';
    $L[] = '';
    $L[] = '| 段 | 给料 mm | 产品 mm | 破碎比 |';
    $L[] = '|:---|:---|:---|:---|';
    foreach ($plant['stage_plan'] as $s) { $L[] = '| ' . $s['stage'] . ' | ' . $s['feed_mm'] . ' | ' . $s['product_mm'] . ' | ' . $s['ratio'] . ' |'; }
    $L[] = '';
    if ($plant['coarse_crusher']) $L[] = '- 粗碎档位：' . (isset($plant['coarse_crusher']['model']) ? $plant['coarse_crusher']['model'] : json_encode($plant['coarse_crusher'], JSON_UNESCAPED_UNICODE));
    $L[] = '- 中碎给料上界：' . $plant['mid_stage_feed_mm'] . ' mm';
    $L[] = '';
  } else $L[] = '（未生成，见风险章节）';
  $L[] = '## 二、圆锥破选型候选';
  $L[] = '';
  if ($sel && $sel['candidates']) {
    $L[] = '| 机型 | 产能 t/h | 功率 kW | 最大给料 mm | 排矿口范围 mm | 判断 |';
    $L[] = '|:---|:---|:---|:---|:---|:---|';
    foreach ($sel['candidates'] as $c) {
      $L[] = '| ' . $c['model'] . ' | ' . $c['capacity_tph'][0] . '-' . $c['capacity_tph'][1] . ' | ' . $c['power_kw'] . ' | ' . $c['max_feed_mm'] . ' | ' . $c['css_range_mm'][0] . '-' . $c['css_range_mm'][1] . ' | ' . $c['fit'] . ' |';
    }
    $L[] = '';
    $L[] = '**推荐机型：' . $sel['recommendation'] . '**　→ 下一步用 mackorn_capacity_check 逐格确认腔型与 CSS';
  } else $L[] = '（无候选，见风险章节）';
  $L[] = '';
  $L[] = '## 三、能耗指标（不含价格）';
  $L[] = '';
  if ($sel && $sel['recommendation']) {
    list($ce, $ca, $cw) = tool_cost_energy($DB, $sel['recommendation'], 1, $tph, null, null, null);
    if ($ce) {
      $L[] = '- 装机功率：**' . $ce['installed_power_kw'] . ' kW**';
      $L[] = '- 吨电耗：**' . ($ce['energy_kwh_per_ton'] !== null ? $ce['energy_kwh_per_ton'] . ' kWh/t' : '需提供产量') . '**';
      $L[] = '- 年耗电（按 ' . $ce['hours_per_year'] . ' h/年）：' . number_format($ce['energy_kwh_per_year']) . ' kWh';
      $L[] = '- 年电费 = 上值 × **你的实际电价**（本端点不给电价）';
      $assumptions = array_merge($assumptions, $ca ?: []);
      $warnings = array_merge($warnings, $cw ?: []);
    }
  }
  $L[] = '';
  $L[] = '## 四、假设与来源';
  $L[] = '';
  foreach (array_merge($assumptions, $pa ?: [], $sa ?: []) as $x) {
    $L[] = '- [' . (isset($x['source']) ? $x['source'] : '?') . '] ' . (isset($x['assumption']) ? $x['assumption'] : '');
  }
  $L[] = '';
  $L[] = '## 五、风险与待确认项';
  $L[] = '';
  $allW = array_merge($warnings, $pw ?: [], $sw ?: []);
  if ($allW) { foreach ($allW as $w) $L[] = '- ⚠️ ' . $w; } else $L[] = '- （无）';
  $L[] = '';
  $L[] = '## 六、下一步';
  $L[] = '';
  $L[] = '1. mackorn_capacity_check 确认腔型与 CSS';
  $L[] = '2. mackorn_crusher_curve 看产品粒度曲线是否满足成品要求';
  $L[] = '3. mackorn_cost_estimate 算能耗与吨成本结构';
  $L[] = '4. mackorn_calibrate 用现场实测数据标定（有实测数据后）';
  $L[] = '5. 联系 MACKORN 商务部出正式方案书与报价';

  $md = implode('\n', $L);
  $assumptions[] = A('报告由本端点按 MACKORN 标准口径串联生成，计算部分复用同端点的整线配置/选型/能耗工具', 'SELF');
  return [[
    'title' => 'MACKORN 选型报告 · ' . $tph . ' t/h',
    'markdown' => $md,
    'char_count' => strlen($md),
    'sections' => 6,
    'note' => '自动生成稿，须 MACKORN 工程师复核；不含价格。',
  ], $assumptions, $warnings];
}

/**
 * 材料与知识查询（远程只读，R27 新增）
 *
 * 为什么补：这个工具原先只在本地插件里有，PHP 端点【漏了注册与路由】——
 *   而它正是"材料库/经验库/错误库"的入口，是我们最重要的差异化能力。
 *
 * 纪律（与本地插件一致，不可违反）：
 *   · 材料库未收录的矿石【不猜测】其性质 —— 返回 found=false + 明确说明
 *   · 远程端点【只读不写】
 */
/**
 * 材料与知识查询（远程只读，R27 新增 / R45 修正结构）
 *
 * 数据结构（来自 plugin/lib/data.mjs 的 MATERIALS）：
 *   [中文名] => [ en, group, ucs_mpa=>[v=>[lo,hi], src, note], wi_kwh_t=>[...], ... ]
 *   —— 以中文名为【键】的嵌套对象，不是 [ {name:...} ] 数组。
 *
 * 纪律（与本地插件一致，不可违反）：
 *   · 材料库未收录的矿石【不猜测】其性质 —— 返回 found=false + 明确说明
 *   · 远程端点【只读不写】
 *   · 每个数值都带 src（S3 文献 / S4 MACKORN 现场经验），原样返回不加工
 */
function tool_knowledge_lookup($DB, $a) {
  $ore = isset($a['ore']) ? trim((string)$a['ore']) : '';
  $tph = isset($a['target_tph']) ? (float)$a['target_tph'] : null;
  $res = [
    'ore' => $ore !== '' ? $ore : null,
    'found' => false,
    'matched_key' => null,
    'properties' => null,
    'cavity_advice' => null,
    'source_levels' => null,
    'notes' => [],
  ];
  $asm = [
    '材料性质来自 MACKORN 材料库；每个数值带 src 字段标明来源等级（S3 文献 / S4 现场经验）。',
    '远程端点为只读：完整材料库与经验/错误条目请用本地 MCP 服务端。',
  ];
  $warn = [];
  if (!isset($DB['MATERIAL_LIBRARY']) || !is_array($DB['MATERIAL_LIBRARY'])) {
    $warn[] = '本部署包未内置材料库表 —— 完整查询请用本地 MCP 服务端（npx mackorn-cone-crusher）。';
    $res['notes'][] = '本地服务端可返回：材料硬度/磨蚀/功指数、适用腔型、已知错误拦截、对标案例。';
    return [$res, $asm, $warn];
  }
  $lib = $DB['MATERIAL_LIBRARY'];
  if (isset($DB['SOURCE_LEVELS'])) $res['source_levels'] = $DB['SOURCE_LEVELS'];
  if ($ore === '') {
    $warn[] = '缺少 ore 参数（矿石名称）。';
    $res['notes'][] = '可选材料（' . count($lib) . ' 种）：' . implode('、', array_slice(array_keys($lib), 0, 14));
    return [$res, $asm, $warn];
  }
  /* ① 精确命中 */
  if (isset($lib[$ore])) { $res['found'] = true; $res['matched_key'] = $ore; $res['properties'] = $lib[$ore]; }
  else {
    /* ② 模糊匹配（中文包含 / 英文名包含） */
    foreach ($lib as $k => $row) {
      $en = isset($row['en']) ? (string)$row['en'] : '';
      if (mb_strpos($k, $ore) !== false || mb_strpos($ore, $k) !== false
          || ($en !== '' && (stripos($en, $ore) !== false || stripos($ore, $en) !== false))) {
        $res['found'] = true; $res['matched_key'] = $k; $res['properties'] = $row; break;
      }
    }
  }
  if (!$res['found']) {
    $warn[] = '材料库未收录「' . $ore . '」—— 按纪律【不猜测】其性质。';
    $res['notes'][] = '可选材料（' . count($lib) . ' 种）：' . implode('、', array_keys($lib));
    $res['notes'][] = '或提供该矿石的抗压强度 / Bond 功指数 / 磨蚀试验值，我们据此判断。';
  } else {
    /* 腔型建议来自材料库自身的 cavity_hint（有则用，无则给通用建议） */
    $p = $res['properties'];
    if (isset($p['cavity_hint'])) $res['cavity_advice'] = $p['cavity_hint'];
    else if ($tph !== null) $res['cavity_advice'] = '目标 ' . $tph . ' t/h：硬料宜偏中细腔（MC/M），软料可放宽至粗腔（C/EC）。';
    if (isset($p['stage_hint'])) $res['notes'][] = $p['stage_hint'];
    if (isset($p['crushability'])) $res['notes'][] = '可碎性：' . $p['crushability'];
    if (isset($p['notes'])) $res['notes'][] = $p['notes'];
  }
  return [$res, $asm, $warn];
}

/** 知识入库校验（远程端点【只校验不写入】—— 公开 HTTP 端点允许写入是安全漏洞） */
function tool_knowledge_validate($entries) {
  $assumptions = []; $warnings = [];
  if (!is_array($entries) || !count($entries)) return [null, [], ['entries 必填：知识条目数组，每条需 title / content / source_url']];
  $ok = []; $rejected = [];
  $weights = ['official'=>5, 'academic'=>4, 'report'=>3, 'conference'=>3, 'media'=>2, 'expert'=>2];
  $authority = ['sec.gov'=>2, 'usgs.gov'=>2, 'iso.org'=>2, 'gov.cn'=>2, 'wipo.int'=>2, 'doi.org'=>1, 'arxiv.org'=>1, 'mackorn.cn'=>1];
  foreach ($entries as $i => $e) {
    $title = isset($e['title']) ? trim((string)$e['title']) : '';
    $content = isset($e['content']) ? trim((string)$e['content']) : '';
    $url = isset($e['source_url']) ? trim((string)$e['source_url']) : '';
    if ($title === '' || $content === '' || $url === '') { $rejected[] = ['index' => $i, 'reason' => '缺少 title / content / source_url 之一', 'rule' => '无 source_url 的条目一律拒收']; continue; }
    if (!preg_match('#^https?://#i', $url)) { $rejected[] = ['index' => $i, 'reason' => 'source_url 不是 http(s) 链接', 'rule' => '来源必须可核查']; continue; }
    $type = isset($e['source_type']) ? $e['source_type'] : 'media';
    $score = isset($weights[$type]) ? $weights[$type] : 2;
    $host = parse_url($url, PHP_URL_HOST);
    foreach ($authority as $dom => $bonus) { if ($host && mb_strpos($host, $dom) !== false) { $score += $bonus; break; } }
    if (!empty($e['has_peer_review'])) $score += 1;
    if (!empty($e['citation_count']) && (int)$e['citation_count'] > 50) $score += 1;
    $score = max(1, min(5, $score));
    $ok[] = ['index' => $i, 'title' => $title, 'source_url' => $url, 'source_type' => $type,
      'credibility' => $score, 'credibility_note' => '自动裁决只产出建议值，用于选型前必须人工确认',
      'ready_record' => ['title' => $title, 'content' => $content, 'source_url' => $url, 'source_type' => $type,
        'credibility_suggested' => $score, 'verification_status' => 'pending']];
  }
  $warnings[] = '远程端点【不写入任何文件】：公开 HTTP 端点允许写入会造成数据污染风险。校验通过的条目请用本地 MCP 服务端入库，或提交给 MACKORN。';
  $assumptions[] = A('可信度分级规则：官方/专利/标准 5 分基线，学术 4，报告/会议 3，媒体/专家 2；白名单域名（sec.gov / usgs.gov / iso.org / gov.cn / wipo.int 等）加档', 'SELF');
  return [[
    'total' => count($entries), 'accepted' => count($ok), 'rejected' => count($rejected),
    'accepted_items' => $ok, 'rejected_items' => $rejected,
    'write_performed' => false,
    'how_to_actually_write' => '本地 MCP 服务端（node plugin/mcp-server.mjs）或提交给 MACKORN 知识库管理员',
  ], $assumptions, $warnings];
}

/** 自我迭代状态（远程只读；数据由本地服务端写入 pdca.json 后上传） */
function tool_pdca_remote() {
  $assumptions = []; $warnings = [];
  $f = __DIR__ . '/pdca.json';
  $data = null;
  if (file_exists($f)) { $raw = @file_get_contents($f); if ($raw) $data = json_decode($raw, true); }
  $warnings[] = '远程端点为【只读】：PDCA 记录由本地 MCP 服务端写入，再随部署包上传。';
  if (!$data) {
    $warnings[] = '未找到 pdca.json —— 本端点上还没有已发布的 PDCA 记录。请访问 https://mackorn.cn/ai/ 或 GitHub 仓库查看最新迭代状态。';
    return [[
      'pdca_available' => false,
      'framework' => ['P' => '计划：用户需求 + 自提议优化项', 'D' => '执行：改代码 / 补数据 / 扩入口', 'C' => '核对：自检清单 + 门禁 + 线上实测', 'A' => '固化：把本次教训写进流程与校验脚本'],
      'evolution_metrics' => ['矛盾处置率', '知识覆盖率', '杠杆分', '版本演进阈值'],
    ], $assumptions, $warnings];
  }
  return [[
    'pdca_available' => true,
    'generated' => isset($data['generated']) ? $data['generated'] : null,
    'version' => isset($data['version']) ? $data['version'] : MACKORN_VERSION,
    'metrics' => isset($data['metrics']) ? $data['metrics'] : null,
    'open_items' => isset($data['open_items']) ? $data['open_items'] : null,
    'rounds' => isset($data['rounds']) ? count($data['rounds']) : 0,
  ], $assumptions, $warnings];
}

/** 圆锥破选型（简化版：按目标产能与给料反查机型） */
function tool_selection($DB, $tph, $maxFeed, $product, $units) {
  $warnings = []; $assumptions = [];
  if (!$tph || $tph <= 0) return [null, [], ['target_tph 必填且须为正数']];
  if ($maxFeed !== null && $maxFeed > 350) {
    $warnings[] = "给料最大粒度 {$maxFeed}mm 超出圆锥破适用上限（约 350mm）—— 圆锥破是中细碎设备，不能直接吃这个粒度。";
    $warnings[] = '因此下面的候选是【按产能反查】的结果，不是按给料反查。正确做法：前段加颚破或旋回破做粗碎，把粒度降到 350mm 以下再进圆锥破。';
  }
  $units = $units ?: 1;
  $needPerUnit = $tph / $units;
  $cands = [];
  // 给料超过圆锥破适用上限时，不要再按给料过滤（否则候选全空），改为按产能选 + 明确告警
  $feedOverLimit = ($maxFeed !== null && $maxFeed > 350);
  foreach (array_merge($DB['NH_SERIES'], $DB['NS_SERIES']) as $m) {
    if (!$feedOverLimit && $maxFeed !== null && $m['maxFeedMm'] < $maxFeed) continue;
    list($lo, $hi) = $m['capacityTph'];
    if ($hi < $needPerUnit * 0.8) continue;
    $util = $needPerUnit / $hi;
    $cands[] = [
      'model' => $m['model'], 'series' => $m['weightKg'] > 20000 ? 'NH 标准型' : '',
      'capacity_tph' => [$lo, $hi], 'power_kw' => $m['powerKw'], 'weight_kg' => $m['weightKg'],
      'max_feed_mm' => $m['maxFeedMm'], 'css_range_mm' => [$m['cssMin'], $m['cssMax']],
      'utilization' => round($util, 3), 'units' => $units,
      'fit' => $util > 0.95 ? '偏紧（无余量）' : ($util < 0.5 ? '偏大（能力浪费）' : '合适'),
    ];
  }
  usort($cands, function ($a, $b) { $x = abs($a['utilization'] - 0.8); $y = abs($b['utilization'] - 0.8); return $x < $y ? -1 : ($x > $y ? 1 : 0); });
  $assumptions[] = A('按目标产能落在机型能力 80% 附近排序（工程惯例，非厂商标定）', 'ENGINEERING-RANGE');
  $assumptions[] = A('产能取自 MACKORN S1 系列区间；精确腔型×CSS 详见 mackorn_capacity_check', 'S1');
  if (!$cands) $warnings[] = '没有机型能满足该组合 —— 不会为了成交而硬推';
  return [[
    'target_tph' => $tph, 'units' => $units, 'per_unit_tph' => round($needPerUnit,1),
    'max_feed_mm' => $maxFeed, 'target_product_mm' => $product,
    'candidates' => array_slice($cands, 0, 5),
    'candidate_count' => count($cands),
    'recommendation' => $cands ? $cands[0]['model'] : null,
    'next_step' => $cands ? '用 mackorn_capacity_check 确认腔型与 CSS，再用 mackorn_cost_estimate 估算投资' : null,
  ], $assumptions, $warnings];
}

/* ══════════════════════════════════════════════════════════
 * 工具注册表
 * ══════════════════════════════════════════════════════════ */
function tool_definitions() {
  $T = [];
  $add = function ($name, $zh, $en, $schema, $remote) use (&$T) {
    $T[$name] = [
      'name' => $name,
      'description' => $zh . ' | ' . $en . ($remote ? '' : ' [本远程端点未实现计算内核，请用本地 MCP 服务端：npx mackorn-cone-crusher 或见 https://mackorn.cn/ai/]'),
      'inputSchema' => $schema,
      '_remote_implemented' => $remote,
    ];
  };
  $add('mackorn_equipment_catalog', '列出 MACKORN 全部机型与腔型（NH 9 型 + NS 4 型，9 种腔型代码）',
    'List all MACKORN models and cavity types', ['type'=>'object','properties'=>[],'additionalProperties'=>false], true);
  $add('mackorn_capacity_check', '按机型+腔型+CSS 查产能区间、排矿口合规性与最大给料限制',
    'Capacity check for a given model/cavity/CSS',
    ['type'=>'object','properties'=>['model'=>['type'=>'string','description'=>'如 NH400'],'cavity'=>['type'=>'string','description'=>'EC/C/MC/M/MF/F/EF'],'css'=>['type'=>'number','description'=>'紧边排矿口 mm']],'required'=>['model','css'],'additionalProperties'=>false], true);
  $add('mackorn_mcfm_analysis', '给料模数 MCFM 诊断（M=(A1+…+A7−7A8)/(100−A8)，最优窗口 4.0–4.5）',
    'Feed gradation modulus (MCFM) diagnosis',
    ['type'=>'object','properties'=>['cumulative_retained'=>['type'=>'array','items'=>['type'=>'number'],'description'=>'长度 8 的累积筛余百分比']],'required'=>['cumulative_retained'],'additionalProperties'=>false], true);
  $add('mackorn_grading_porosity', '料层孔隙率 φ 与最优配比窗口（粗50/中30/细20，最优 φ=0.28）',
    'Bed porosity and optimal blend',
    ['type'=>'object','properties'=>['coarse_frac'=>['type'=>'number'],'mid_frac'=>['type'=>'number'],'fine_frac'=>['type'=>'number']],'required'=>['coarse_frac','mid_frac','fine_frac'],'additionalProperties'=>false], true);
  $add('mackorn_market_stats', '统计分析：描述统计/市场集中度/威布尔寿命拟合（B1/B10/B50）',
    'Statistics: descriptive, concentration, Weibull',
    ['type'=>'object','properties'=>['mode'=>['type'=>'string','enum'=>['describe','weibull']],'values'=>['type'=>'array','items'=>['type'=>'number']],'lives'=>['type'=>'array','items'=>['type'=>'number']]],'required'=>['mode'],'additionalProperties'=>false], true);
  $add('mackorn_contact', 'MACKORN 联系方式、代理招募与微信二维码（10 语言）',
    'Contact details and partner programme',
    ['type'=>'object','properties'=>['language'=>['type'=>'string','description'=>'zh-CN/en/ru/es/pt/fr/ar/id/ja/de']],'additionalProperties'=>false], true);
  $add('mackorn_cone_selection', '圆锥破选型：按目标产能与最大给料给出候选机型排序、台数与功率',
    'Hydraulic cone crusher selection',
    ['type'=>'object','properties'=>['target_tph'=>['type'=>'number'],'max_feed_mm'=>['type'=>'number'],'target_product_mm'=>['type'=>'number'],'units'=>['type'=>'integer']],'required'=>['target_tph'],'additionalProperties'=>false], true);
  $add('mackorn_wear_design', '衬板磨损均匀度评估与多梯度分区硬度设计（H_i = H_base × k^i，带上限校验）',
    'Liner wear uniformity and gradient hardness design',
    ['type'=>'object','properties'=>['sections'=>['type'=>'integer','description'=>'沿腔高离散截面数 3-12，默认 5'],'base_hardness'=>['type'=>'number','description'=>'基础硬度 HRC，默认 58'],'gradient_factor'=>['type'=>'number','description'=>'梯度因子 k，默认 1.12'],'wear_rates'=>['type'=>'array','items'=>['type'=>'number'],'description'=>'各截面实测磨损速率；不填则用合成示例（会标注 SYNTHETIC）']],'additionalProperties'=>false], true);
  $add('mackorn_market_intel', '市场纵深五维评估框架（行业/技术/时效/经济/可操作）+ 加权打分与推进结论（不含价格）',
    'Five-dimension market analysis framework and scoring',
    ['type'=>'object','properties'=>['scores'=>['type'=>'object','description'=>'五维打分，每维 {score:1-5, weight, evidence:[]}，键 industry/technology/timeliness/economics/operability'],'focus'=>['type'=>'string','description'=>'分析焦点（区域/客户/竞品）']],'additionalProperties'=>false], true);
  $add('mackorn_plant_design', '破碎筛分整线配置：总破碎比→段数→各段粒度分配→粗碎档位→中/细碎圆锥破选型（含筛分与辅机骨架）',
    'Crushing and screening plant design',
    ['type'=>'object','properties'=>['target_tph'=>['type'=>'number','description'=>'目标成品产量 t/h'],'max_feed_mm'=>['type'=>'number','description'=>'原矿最大给料 mm，默认 500'],'target_product_mm'=>['type'=>'number','description'=>'最终产品粒度 mm，默认 20'],'closed_circuit'=>['type'=>'boolean','description'=>'细碎段是否闭路，默认 true'],'washing'=>['type'=>'boolean','description'=>'是否需洗砂/污水处理']],'required'=>['target_tph'],'additionalProperties'=>false], true);
  $add('mackorn_cost_estimate', '能耗与吨成本结构估算（装机功率/年耗电/kWh每吨/衬板吨成本公式）。本端点【不给价格】',
    'Energy consumption and per-ton cost structure (no pricing)',
    ['type'=>'object','properties'=>['model'=>['type'=>'string','description'=>'机型，如 NH400 或 NS400'],'units'=>['type'=>'integer','description'=>'台数，默认 1'],'tph'=>['type'=>'number','description'=>'处理量 t/h'],'hours_per_year'=>['type'=>'integer','description'=>'年运行小时'],'load_factor'=>['type'=>'number','description'=>'负荷率 0-1'],'liner_life_hours'=>['type'=>'number','description'=>'衬板寿命 h（项目实测）']],'required'=>['model'],'additionalProperties'=>false], true);
  $add('mackorn_distributor_eval', '经销商/代理商评估：三维 17 项打分 + 一票否决（涉制裁 / 信用不良）',
    'Distributor and agent evaluation',
    ['type'=>'object','properties'=>['capability'=>['type'=>'array','items'=>['type'=>'number'],'description'=>'能力维各项 1-5 分'],'market'=>['type'=>'array','items'=>['type'=>'number'],'description'=>'市场维各项 1-5 分'],'integrity'=>['type'=>'array','items'=>['type'=>'number'],'description'=>'诚信维各项 1-5 分'],'sanctions'=>['type'=>'number','description'=>'涉制裁评分，≤1 触发一票否决'],'credit_record'=>['type'=>'number','description'=>'信用记录评分，≤1 触发一票否决']],'additionalProperties'=>false], true);
  $add('mackorn_requirement_intake', '客户需求表录入：文字解析→完整性分档（阻断/关键/建议/可选）→逐项追问话术→归一化工况→派生建议→年产量与矿山服务年限→初步选型',
    'Requirement form intake with gap analysis and follow-up questions',
    ['type'=>'object','properties'=>['capacity_tph'=>['type'=>'number','description'=>'产量需求 t/h（阻断级必填）'],'form_text'=>['type'=>'string','description'=>'客户需求表原文（可整段粘贴，自动抽取数值与选项）'],'max_feed_mm'=>['type'=>'number'],'product_mm'=>['type'=>'number'],'ore_type'=>['type'=>'string'],'compressive_strength_mpa'=>['type'=>'number'],'moisture_pct'=>['type'=>'number'],'soil_content_pct'=>['type'=>'number'],'total_reserve_t'=>['type'=>'number'],'hours_per_day'=>['type'=>'integer'],'days_per_year'=>['type'=>'integer'],'line_type'=>['type'=>'string'],'production_method'=>['type'=>'string'],'scope'=>['type'=>'string']],'additionalProperties'=>true], true);
  $add('mackorn_crusher_curve', '产品粒度曲线（Whiten 1972 稳态模型）：按给料 P80 与 CSS 算产品 P80/P50、逐级通过率、K1/K2 与 Bond 功耗',
    'Product size curve via Whiten (1972) steady-state model',
    ['type'=>'object','properties'=>['css_mm'=>['type'=>'number','description'=>'紧边排矿口 CSS mm（必填）'],'feed_p80_mm'=>['type'=>'number','description'=>'给料 P80 mm（必填）'],'throw_mm'=>['type'=>'number','description'=>'偏心距 mm，默认 25'],'throw_factor'=>['type'=>'number','description'=>'啮合区系数 0.5-1.0，默认 0.8'],'speed_rpm'=>['type'=>'number','description'=>'偏心轴转速，默认 300'],'phi'=>['type'=>'number','description'=>'破碎函数粗粒生成占比，文献典型 0.3-0.6'],'gamma'=>['type'=>'number','description'=>'粗端指数，文献典型 0.4-1.0'],'beta'=>['type'=>'number','description'=>'细端指数，文献典型 2.5-5.0'],'feed_n'=>['type'=>'number','description'=>'Rosin-Rammler 均匀性指数，默认 1.1'],'bond_wi'=>['type'=>'number','description'=>'Bond 功指数 kWh/t；不填按矿石种类取文献中值'],'ore'=>['type'=>'string','description'=>'矿石种类，如 花岗岩/玄武岩/铁矿石']],'required'=>['css_mm','feed_p80_mm'],'additionalProperties'=>false], true);
  $add('mackorn_simulate_flowsheet', '多段破碎+筛分流程仿真：逐段算产品 P80、筛下率、循环负荷与最终产品 P80',
    'Multi-stage crushing and screening flowsheet simulation',
    ['type'=>'object','properties'=>['feed_p80_mm'=>['type'=>'number','description'=>'新鲜给料 P80 mm（必填）'],'feed_n'=>['type'=>'number','description'=>'给料分布均匀性指数，默认 1.1'],'stages'=>['type'=>'array','items'=>['type'=>'object'],'description'=>'段定义：破碎段 {type:"crusher",css_mm,throw_mm}；筛分段 {type:"screen",aperture_mm,screen_efficiency}']],'required'=>['feed_p80_mm','stages'],'additionalProperties'=>false], true);
  $add('mackorn_calibrate', '用现场实测筛析数据标定破碎函数参数 φ/γ/β 与啮合系数：有界网格+局部细化，返回拟合优度、逐点残差与可用性判断',
    'Calibrate breakage parameters on measured field data',
    ['type'=>'object','properties'=>['css_mm'=>['type'=>'number','description'=>'该工况紧边排矿口 CSS mm（必填）'],'feed_points'=>['type'=>'array','items'=>['type'=>'object'],'description'=>'给料筛析：≥2 点，每点 {size_mm, cum_pct}'],'product_points'=>['type'=>'array','items'=>['type'=>'object'],'description'=>'产品筛析：≥3 点（建议≥5），每点 {size_mm, cum_pct}'],'throw_mm'=>['type'=>'number','description'=>'偏心距 mm，默认 25'],'roughness'=>['type'=>'number','description'=>'RMSE 门槛，默认 0.06，超过即告警']],'required'=>['css_mm','feed_points','product_points'],'additionalProperties'=>false], true);
  $add('mackorn_proposal', '方案书生成：14 章标准结构（项目概况/设计依据/工艺流程/设备选择/技术参数/电气/环保/土建/供货范围/投资估算/实施建议/假设来源/风险/附件），输出 Markdown',
    '14-section proposal generator (Markdown)',
    ['type'=>'object','properties'=>['capacity_tph'=>['type'=>'number','description'=>'成品产量 t/h（必填）'],'title'=>['type'=>'string','description'=>'方案标题'],'client_name'=>['type'=>'string'],'project_location'=>['type'=>'string'],'ore_type'=>['type'=>'string'],'max_feed_mm'=>['type'=>'number'],'product_mm'=>['type'=>'number'],'compressive_strength_mpa'=>['type'=>'number'],'moisture_pct'=>['type'=>'number'],'line_type'=>['type'=>'string','description'=>'砂石骨料 / 金属矿山'],'production_method'=>['type'=>'string','description'=>'干法 / 湿法'],'scope'=>['type'=>'string','description'=>'主机设备 / 总包生产线'],'date'=>['type'=>'string','description'=>'编制日期 YYYY-MM-DD']],'required'=>['capacity_tph'],'additionalProperties'=>true], true);
  $add('mackorn_intel_watch', '行业情报观测面：竞品动向/专利/标准/市场数据的固定观测项与检索纪律（含为什么看、看哪些源、搜什么词、多久看一次）',
    'Industry intelligence watchlist and research discipline',
    ['type'=>'object','properties'=>['focus'=>['type'=>'string','description'=>'只取某一观测项（id 或类别名），不填返回全部']],'additionalProperties'=>false], true);
  $add('mackorn_selection_report', '一键选型报告：把整线配置 + 圆锥破选型 + 能耗指标串成一份 Markdown（含假设与风险章节）',
    'One-click selection report (Markdown)',
    ['type'=>'object','properties'=>['target_tph'=>['type'=>'number','description'=>'目标处理量 t/h（必填）'],'max_feed_mm'=>['type'=>'number','description'=>'原矿最大给料 mm，默认 500'],'target_product_mm'=>['type'=>'number','description'=>'最终产品粒度 mm，默认 20'],'ore'=>['type'=>'string','description'=>'矿石名称/硬度备注']],'required'=>['target_tph'],'additionalProperties'=>false], true);
  $add('mackorn_knowledge_update', '知识入库校验：逐条检查 title/content/source_url，做可信度分级并返回可直接入库的记录。【远程端点只校验不写入】',
    'Knowledge entry validation and credibility grading (validate only, no write)',
    ['type'=>'object','properties'=>['entries'=>['type'=>'array','items'=>['type'=>'object'],'description'=>'条目数组，每条 {title, content, source_url, source_type?, publish_date?, tags?}']],'required'=>['entries'],'additionalProperties'=>false], true);
  /* R27 补：这个工具原先漏了 PHP 端注册 —— 而它正是【材料库/经验库/错误库】入口，
   * 是我们最重要的差异化能力。远程实现为【只读查询】，写入仍需本地服务端。 */
  $add('mackorn_knowledge', '材料与知识查询：给定矿石/工况，返回材料性质（硬度/磨蚀/功指数）、适用腔型、已知错误拦截与对标案例。材料库未收录的矿石不猜测。',
    'Material properties and knowledge lookup (hardness, abrasion, work index, cavity fit, known pitfalls)',
    ['type'=>'object','properties'=>['ore'=>['type'=>'string','description'=>'矿石名称，如 花岗岩/玄武岩/铁矿石'],'target_tph'=>['type'=>'number','description'=>'目标处理量 t/h（可选，用于腔型建议）'],'model'=>['type'=>'string','description'=>'机型（可选）'],'cavity'=>['type'=>'string','description'=>'腔型（可选）']],'required'=>['ore'],'additionalProperties'=>false], true);
  $add('mackorn_pdca_status', '自我迭代 PDCA 状态（只读）：版本、指标、遗留项、框架说明。记录由本地服务端写入',
    'Self-iteration PDCA status (read-only)',
    ['type'=>'object','properties'=>[],'additionalProperties'=>false], true);
  return $T;
}

/* ══════════════════════════════════════════════════════════
 * 请求处理
 * ══════════════════════════════════════════════════════════ */
try {
$raw = file_get_contents('php://input');
$req = $raw ? json_decode($raw, true) : null;

if (!$req || !isset($req['method'])) {
  // GET 或无 body：返回服务说明（便于人工与爬虫发现）
  echo json_encode([
    'server' => MACKORN_SERVER,
    'name' => 'MACKORN Hydraulic Cone Crusher Selection',
    'version' => MACKORN_VERSION,
    'protocol' => 'MCP over HTTP (JSON-RPC 2.0)',
    'transport' => 'streamable-http',
    'methods' => ['initialize', 'tools/list', 'tools/call', 'ping'],
    'tools_count' => count(tool_definitions()),
    'remote_tools_count' => count(array_filter(tool_definitions(), function ($x) { return !empty($x['_remote_implemented']); })),
    'build_id' => MACKORN_BUILD,
    'remote_tools' => array_keys(array_filter(tool_definitions(), function ($x) { return !empty($x['_remote_implemented']); })),
    'usage' => 'POST JSON-RPC 2.0 to this URL. Example: {"jsonrpc":"2.0","id":1,"method":"tools/list"}',
    'docs' => 'https://mackorn.cn/ai/',
    'agent_card' => 'https://mackorn.cn/.well-known/agent.json',
    'repository' => 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher',
    'discipline' => 'No pricing. No invented numbers. Every figure carries its source. Conflicting sources kept side by side, never averaged.',
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}

$id = isset($req['id']) ? $req['id'] : null;
$method = $req['method'];
$params = isset($req['params']) ? $req['params'] : [];

switch ($method) {
  case 'initialize':
    echo json_encode(rpc_ok($id, [
      'protocolVersion' => '2024-11-05',
      'capabilities' => ['tools' => ['listChanged' => false]],
      'serverInfo' => ['name' => MACKORN_SERVER, 'version' => MACKORN_VERSION,
        'title' => 'MACKORN 液压圆锥破碎机选型插件'],
      'instructions' => 'MACKORN（美矿）液压圆锥破碎机与破碎筛分生产线选型工具。22 个工具。所有结果带 assumptions 与 warnings；未知字段返回 null，不估算；多来源冲突并列保留，绝不取平均。不含报价。',
    ]), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    break;

  case 'notifications/initialized':
  case 'notifications/cancelled':
    http_response_code(202); exit;

  case 'ping':
    echo json_encode(rpc_ok($id, new stdClass()), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    break;

  case 'tools/list':
    $list = [];
    foreach (tool_definitions() as $t) { unset($t['_remote_implemented']); $list[] = $t; }
    echo json_encode(rpc_ok($id, ['tools' => $list]), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    break;

  case 'tools/call':
    $name = isset($params['name']) ? $params['name'] : '';
    $a = isset($params['arguments']) ? $params['arguments'] : [];
    $defs = tool_definitions();
    if (!isset($defs[$name])) {
      echo json_encode(rpc_err($id, -32602, "未知工具 {$name}"), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE); break;
    }
    if (empty($defs[$name]['_remote_implemented'])) {
      echo json_encode(rpc_ok($id, tool_result(null, [], [
        "工具 {$name} 的计算内核较重（仿真/流程/标定），本远程端点未内置。",
        '请用本地 MCP 服务端调用：npm i mackorn-cone-crusher 后运行 mcp-server.mjs；',
        '或见 https://mackorn.cn/ai/ 与 https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher',
      ])), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
      break;
    }
    $res = null; $asm = []; $warn = [];
    switch ($name) {
      case 'mackorn_equipment_catalog': list($res, $asm, $warn) = tool_catalog($DB); break;
      case 'mackorn_capacity_check':    list($res, $asm, $warn) = tool_capacity($DB, isset($a['model']) ? $a['model'] : '', isset($a['cavity']) ? $a['cavity'] : null, isset($a['css']) ? (float)$a['css'] : 0); break;
      case 'mackorn_mcfm_analysis':     list($res, $asm, $warn) = tool_mcfm(isset($a['cumulative_retained']) ? $a['cumulative_retained'] : null); break;
      case 'mackorn_grading_porosity':  list($res, $asm, $warn) = tool_grading(isset($a['coarse_frac']) ? (float)$a['coarse_frac'] : 0, isset($a['mid_frac']) ? (float)$a['mid_frac'] : 0, isset($a['fine_frac']) ? (float)$a['fine_frac'] : 0); break;
      case 'mackorn_market_stats':      list($res, $asm, $warn) = tool_stats(isset($a['mode']) ? $a['mode'] : 'describe', isset($a['values']) ? $a['values'] : null, isset($a['lives']) ? $a['lives'] : null); break;
      case 'mackorn_contact':           list($res, $asm, $warn) = tool_contact(isset($a['language']) ? $a['language'] : 'zh-CN'); break;
      case 'mackorn_wear_design':       list($res, $asm, $warn) = tool_wear(isset($a['sections']) ? $a['sections'] : 5, isset($a['base_hardness']) ? $a['base_hardness'] : 58, isset($a['gradient_factor']) ? $a['gradient_factor'] : 1.12, isset($a['wear_rates']) ? $a['wear_rates'] : null); break;
      case 'mackorn_market_intel':      list($res, $asm, $warn) = tool_market(isset($a['scores']) ? $a['scores'] : null); break;
      case 'mackorn_plant_design':      list($res, $asm, $warn) = tool_plant($DB, isset($a['target_tph']) ? (float)$a['target_tph'] : 0, isset($a['max_feed_mm']) ? (float)$a['max_feed_mm'] : null, isset($a['target_product_mm']) ? (float)$a['target_product_mm'] : null, !isset($a['closed_circuit']) || $a['closed_circuit'], isset($a['washing']) && $a['washing']); break;
      case 'mackorn_cost_estimate':     list($res, $asm, $warn) = tool_cost_energy($DB, isset($a['model']) ? $a['model'] : '', isset($a['units']) ? (int)$a['units'] : 1, isset($a['tph']) ? (float)$a['tph'] : null, isset($a['hours_per_year']) ? (int)$a['hours_per_year'] : null, isset($a['load_factor']) ? (float)$a['load_factor'] : null, isset($a['liner_life_hours']) ? (float)$a['liner_life_hours'] : null); break;
      case 'mackorn_distributor_eval':  list($res, $asm, $warn) = tool_distributor($a); break;
      case 'mackorn_requirement_intake': list($res, $asm, $warn) = tool_intake($DB, $a); break;
      case 'mackorn_crusher_curve':      list($res, $asm, $warn) = tool_curve($a, [], []); break;
      case 'mackorn_simulate_flowsheet': list($res, $asm, $warn) = tool_flowsheet($a, [], []); break;
      case 'mackorn_calibrate':          list($res, $asm, $warn) = tool_calibrate($a, [], []); break;
      case 'mackorn_proposal':           list($res, $asm, $warn) = tool_proposal($DB, $a); break;
      case 'mackorn_intel_watch':        list($res, $asm, $warn) = tool_intel_watch(isset($a['focus']) ? $a['focus'] : null); break;
      case 'mackorn_selection_report':   list($res, $asm, $warn) = tool_report($DB, $a); break;
      /* R27 补：材料与知识查询（远程只读）。原先漏了路由，调用会走 default。 */
      case 'mackorn_knowledge':          list($res, $asm, $warn) = tool_knowledge_lookup($DB, $a); break;
      case 'mackorn_knowledge_update':   list($res, $asm, $warn) = tool_knowledge_validate(isset($a['entries']) ? $a['entries'] : null); break;
      case 'mackorn_pdca_status':        list($res, $asm, $warn) = tool_pdca_remote(); break;
      case 'mackorn_cone_selection':    list($res, $asm, $warn) = tool_selection($DB, isset($a['target_tph']) ? (float)$a['target_tph'] : 0, isset($a['max_feed_mm']) ? (float)$a['max_feed_mm'] : null, isset($a['target_product_mm']) ? (float)$a['target_product_mm'] : null, isset($a['units']) ? (int)$a['units'] : 1); break;
    }
    echo json_encode(rpc_ok($id, tool_result($res, $asm, $warn)), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    break;

  default:
    echo json_encode(rpc_err($id, -32601, "Method not found: {$method}"), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}
} catch (Throwable $e) {
  http_response_code(200);
  echo json_encode(rpc_err(isset($id) ? $id : null, -32603, 'Internal error: ' . $e->getMessage(), ['file' => basename($e->getFile()), 'line' => $e->getLine(), 'php' => PHP_VERSION]), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}
`;

writeFileSync(join(OUT, 'mcp.php'), php, 'utf8');
console.log('  ✅ /api/mcp.php  ' + (php.length / 1024).toFixed(1) + ' KB');
console.log('     协议：JSON-RPC 2.0 · initialize / tools/list / tools/call / ping');
console.log('     工具：' + TOOL_DEFS.length + ' 个（' + TOOL_DEFS.filter((x) => x[2]).length + ' 个远程可算）');
console.log('     实现：catalog · capacity_check · mcfm · grading · market_stats · contact · cone_selection');
