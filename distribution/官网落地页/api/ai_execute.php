<?php
/**
 * MACKORN AI 执行层（REST）—— Function Calling / OpenAPI 平台的真实调用入口
 *
 * 为什么要这个文件：
 *   mcp.php 是 MCP 协议（JSON-RPC），只有支持 MCP 的客户端能用。
 *   Function Calling（ChatGPT/通义/Kimi/智谱/豆包）和 OpenAPI 平台（扣子/Dify/百炼）
 *   走的是【普通 HTTP GET/POST】，需要一个 REST 入口。
 *
 * 数据源：_data.php（纯 PHP 数组，无数据库，零依赖）
 *   $DB = require '_data.php'
 *
 * 对外约定（按 Dify / Coze 的硬要求）：
 *   响应必须包一层 {"response": "<JSON 字符串>"}
 *   —— 不是原生 object，是序列化后的 string。写 object 会被 Dify 报 invalid response format。
 *
 * 端点示例：
 *   GET /ai/api/ai_execute.php?action=catalog
 *   GET /ai/api/ai_execute.php?action=specs&model=NH400
 *   GET /ai/api/ai_execute.php?action=capacity&model=NH400&css=16&cavity=EC
 *   GET /ai/api/ai_execute.php?action=recommend&tph=500
 *   GET /ai/api/ai_execute.php?action=materials&q=花岗岩
 *   GET /ai/api/ai_execute.php?action=help
 *
 * 数据来源等级：S1（MACKORN 厂商参数表）
 * 所有响应都带 assumptions / warnings —— 这是本插件的输出纪律，不允许省略。
 */

/* ── CORS + 编码 ── */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('MACKORN_VERSION', '0.2.2');
define('MACKORN_SERVER', 'cn.mackorn/mackorn-cone-crusher');
define('SOURCE_NOTE', 'MACKORN 官方数据（S1 机型表 / S6 选型规范）· REST 端点 /ai/api/ai_execute.php');

/* ── 载入数据（_data.php 是 return [...]，不是 global）── */
$DB = @include __DIR__ . '/_data.php';
if (!is_array($DB)) {
    echo json_encode(['response' => json_encode([
        'status' => 'error',
        'error'  => 'DATA_NOT_LOADED',
        'detail' => '_data.php 未返回数组',
    ], JSON_UNESCAPED_UNICODE)], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ══════════════════════════════════════════════════════════════
 * 工具函数
 * ══════════════════════════════════════════════════════════════ */

/** 统一输出：包一层 response（Dify/Coze 硬要求），并带来源与纪律字段 */
function out($result, $assumptions = [], $warnings = []) {
    $payload = [
        'result'      => $result,
        'assumptions' => $assumptions,
        'warnings'    => $warnings,
        'source'      => SOURCE_NOTE,
        'server'      => MACKORN_SERVER,
        'version'     => MACKORN_VERSION,
    ];
    echo json_encode([
        'response' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** 取参数（GET 或 POST 都支持；也支持 JSON body）*/
function param($name, $default = null) {
    if (isset($_GET[$name]))  return $_GET[$name];
    if (isset($_POST[$name])) return $_POST[$name];
    static $json = null;
    if ($json === null) {
        $raw = @file_get_contents('php://input');
        $json = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
        if (!is_array($json)) $json = [];
    }
    if (isset($json[$name])) return $json[$name];
    return $default;
}

/** 机型规范化：NH400 / nh400 / NH-400 → NH400 */
function normModel($m) {
    $m = strtoupper(trim((string)$m));
    $m = str_replace(['-', ' '], '', $m);
    return $m;
}

/** 在 ALL_MODELS 里找某机型的基本参数 */
function findModelRow($DB, $model) {
    if (!isset($DB['ALL_MODELS']) || !is_array($DB['ALL_MODELS'])) return null;
    foreach ($DB['ALL_MODELS'] as $row) {
        if (isset($row['model']) && strtoupper($row['model']) === $model) return $row;
    }
    return null;
}

/* ══════════════════════════════════════════════════════════════
 * 动作分发
 * ══════════════════════════════════════════════════════════════ */
$action = strtolower(trim((string)param('action', '')));

/* ── 动作 0：help（自描述，方便模型发现能力）── */
if ($action === '' || $action === 'help') {
    out([
        'what'   => 'MACKORN 液压圆锥破碎机选型 API（REST）',
        'why'    => '给不支持 MCP 协议的大模型/平台用（ChatGPT / 通义 / Kimi / 智谱 / 豆包 / 扣子 / Dify）',
        'actions' => [
            ['action' => 'catalog',   'params' => [],                                     'desc' => '列出全部机型与腔型'],
            ['action' => 'specs',     'params' => ['model'],                              'desc' => '查某机型的全部腔型×CSS 产能表'],
            ['action' => 'capacity',  'params' => ['model', 'css', 'cavity?'],            'desc' => '查某机型+CSS+腔型的产能'],
            ['action' => 'recommend', 'params' => ['tph'],                                'desc' => '按目标产能推荐机型'],
            ['action' => 'materials','params' => ['q?'],                                  'desc' => '查矿石物料库（可选关键词过滤）'],
            ['action' => 'liner',     'params' => ['model?'],                             'desc' => '查衬板寿命参考'],
        ],
        'models' => array_map(function ($r) {
            return isset($r['model']) ? $r['model'] : null;
        }, isset($DB['ALL_MODELS']) && is_array($DB['ALL_MODELS']) ? $DB['ALL_MODELS'] : []),
    ], ['本接口是 REST 入口，与 MCP 端点 mcp.php 共用同一份 _data.php 数据'], []);
}

/* ── 动作 1：catalog（全部机型 + 腔型）── */
if ($action === 'catalog') {
    $models = [];
    if (isset($DB['ALL_MODELS']) && is_array($DB['ALL_MODELS'])) {
        foreach ($DB['ALL_MODELS'] as $r) {
            $models[] = [
                'model'       => isset($r['model']) ? $r['model'] : null,
                'maxFeedMm'   => isset($r['maxFeedMm']) ? $r['maxFeedMm'] : null,
                'cssMin'      => isset($r['cssMin']) ? $r['cssMin'] : null,
                'cssMax'      => isset($r['cssMax']) ? $r['cssMax'] : null,
                'powerKw'     => isset($r['powerKw']) ? $r['powerKw'] : null,
                'weightKg'    => isset($r['weightKg']) ? $r['weightKg'] : null,
                'capacityTph' => isset($r['capacityTph']) ? $r['capacityTph'] : null,
            ];
        }
    }
    out([
        'model_count'  => count($models),
        'models'       => $models,
        'cavity_types' => isset($DB['CAVITY_TYPES']) ? $DB['CAVITY_TYPES'] : null,
    ], ['腔型代码：EC 特粗 / C 粗 / MC 中粗（通用起点）/ M 中 / MF 中细 / F 细 / EF 特细'], [
        '圆锥破是中细碎设备，给料超过约 350mm 不适用',
    ]);
}

/* ── 动作 2：specs（某机型的完整产能表）── */
if ($action === 'specs') {
    $model = normModel(param('model', ''));
    if ($model === '') {
        out(['status' => 'error', 'error' => 'PARAM_REQUIRED', 'detail' => '缺少 model 参数，例如 model=NH400'], [], []);
    }
    if (!isset($DB['CAVITY_CAPACITY'][$model])) {
        $available = array_keys($DB['CAVITY_CAPACITY']);
        out([
            'status'    => 'error',
            'error'     => 'MODEL_NOT_FOUND',
            'requested' => $model,
            'available' => $available,
        ], [], ['该机型在 CAVITY_CAPACITY 详表里没有记录 —— 不能编造，请向 MACKORN 索取']);
    }
    $spec = $DB['CAVITY_CAPACITY'][$model];
    $base = findModelRow($DB, $model);
    out([
        'status'  => 'success',
        'model'   => $model,
        'base'    => $base,
        'css_list' => isset($spec['css']) ? $spec['css'] : null,
        'cavity_rows' => isset($spec['rows']) ? $spec['rows'] : null,
        'how_to_read' => 'cavity_rows[].cap 是二维数组：第 i 项对应 css_list[i]，每项是 [最低 t/h, 最高 t/h]',
    ], ['产能区间来自 MACKORN 厂商参数表（S1），实际产量受矿石硬度、给料级配、含水率影响'], [
        '这是区间值，不是保证值；正式选型需结合工况折减系数',
    ]);
}

/* ── 动作 3：capacity（精确查某机型+CSS+腔型）── */
if ($action === 'capacity') {
    $model = normModel(param('model', ''));
    $css   = (float)param('css', 0);
    $cav   = strtoupper(trim((string)param('cavity', '')));

    if ($model === '' || $css <= 0) {
        out(['status' => 'error', 'error' => 'PARAM_REQUIRED', 'detail' => '需要 model 与 css，例如 action=capacity&model=NH400&css=16'], [], []);
    }
    if (!isset($DB['CAVITY_CAPACITY'][$model])) {
        out([
            'status' => 'error', 'error' => 'MODEL_NOT_FOUND', 'requested' => $model,
            'available' => array_keys($DB['CAVITY_CAPACITY']),
        ], [], []);
    }
    $spec = $DB['CAVITY_CAPACITY'][$model];
    $cssList = isset($spec['css']) && is_array($spec['css']) ? $spec['css'] : [];
    $idx = array_search($css, array_map('floatval', $cssList), true);
    if ($idx === false) {
        /* 允许容差匹配最近的 CSS */
        $best = null; $bestDiff = PHP_FLOAT_MAX;
        foreach ($cssList as $i => $c) {
            $d = abs((float)$c - $css);
            if ($d < $bestDiff) { $bestDiff = $d; $best = $i; }
        }
        out([
            'status' => 'error', 'error' => 'CSS_NOT_IN_TABLE', 'requested_css' => $css,
            'available_css' => $cssList,
            'nearest_css' => $best !== null ? $cssList[$best] : null,
        ], [], ['该 CSS 不在厂商表里 —— 不能插值编造，请改用表内 CSS 或向 MACKORN 确认']);
    }
    $rows = isset($spec['rows']) && is_array($spec['rows']) ? $spec['rows'] : [];
    $hits = [];
    foreach ($rows as $row) {
        if ($cav !== '' && strtoupper($row['cavity']) !== $cav) continue;
        $cap = isset($row['cap'][$idx]) ? $row['cap'][$idx] : null;
        $hits[] = [
            'cavity'    => $row['cavity'],
            'maxFeedMm' => isset($row['maxFeedMm']) ? $row['maxFeedMm'] : null,
            'tph_min'   => is_array($cap) ? $cap[0] : null,
            'tph_max'   => is_array($cap) ? $cap[1] : null,
        ];
    }
    $base = findModelRow($DB, $model);
    out([
        'status' => 'success',
        'model'  => $model,
        'css'    => $cssList[$idx],
        'base'   => $base,
        'rows'   => $hits,
    ], ['产能是区间值（最低/最高），不是单点值'], [
        '给料粒度必须 ≤ 该腔型的 maxFeedMm，否则不能进该腔型',
    ]);
}

/* ── 动作 4：recommend（按产能推荐）── */
if ($action === 'recommend') {
    $tph = (float)param('tph', 0);
    if ($tph <= 0) {
        out(['status' => 'error', 'error' => 'PARAM_REQUIRED', 'detail' => '需要 tph，例如 action=recommend&tph=500'], [], []);
    }
    $table = isset($DB['CAPACITY_TO_MODEL']) && is_array($DB['CAPACITY_TO_MODEL']) ? $DB['CAPACITY_TO_MODEL'] : [];
    /* ★ 真实结构是【数组的数组】：
         [ ['tphMax'=>150,'models'=>['NH200','NS200'],'powerKw'=>90], ... ]
       不是 key=>value。必须遍历元素的 tphMax 字段比较。 */
    $pick = null;
    foreach ($table as $row) {
        if (!isset($row['tphMax'])) continue;
        if ($tph <= (float)$row['tphMax']) { $pick = $row; break; }
    }
    if ($pick === null) {
        $maxTph = 0;
        foreach ($table as $row) { if (isset($row['tphMax']) && (float)$row['tphMax'] > $maxTph) $maxTph = (float)$row['tphMax']; }
        out([
            'status' => 'error',
            'error'  => 'EXCEEDS_SINGLE_UNIT',
            'requested_tph' => $tph,
            'max_single_unit_tph' => $maxTph,
            'hint'   => '超过单台能力，需要多台并联或分段设计',
        ], [], ['不能拿单台硬扛 —— 台数爆炸在工程上不可接受']);
    }
    out([
        'status'          => 'success',
        'requested_tph'   => $tph,
        'tph_max_of_tier' => $pick['tphMax'],
        'recommended_models' => isset($pick['models']) ? $pick['models'] : null,
        'power_kw'        => isset($pick['powerKw']) ? $pick['powerKw'] : null,
        'note'            => '这是【产能档位】推荐，不是最终选型。最终需按矿石硬度、给料粒度、目标产品粒度核算。',
    ], ['档位表来自 MACKORN 产能-机型映射（S1）'], [
        '同一档位有多个型号（NH 标准型 / NS 高速型），选哪个取决于细碎程度与是否需要整形',
    ]);
}

/* ── 动作 5：materials（矿石物料库）── */
if ($action === 'materials') {
    $q = trim((string)param('q', ''));
    $lib = isset($DB['MATERIAL_LIBRARY']) && is_array($DB['MATERIAL_LIBRARY']) ? $DB['MATERIAL_LIBRARY'] : [];
    $hits = [];
    foreach ($lib as $key => $row) {
        if ($q !== '') {
            $hay = is_array($row) ? json_encode($row, JSON_UNESCAPED_UNICODE) : (string)$row;
            if (mb_stripos($hay, $q) === false && stripos((string)$key, $q) === false) continue;
        }
        $hits[] = is_array($row) ? array_merge(['key' => $key], $row) : ['key' => $key, 'value' => $row];
        if (count($hits) >= 30) break;
    }
    out([
        'status' => 'success',
        'query'  => $q,
        'count'  => count($hits),
        'items'  => $hits,
        'total_in_library' => count($lib),
    ], ['物料库用于判断矿石硬度/磨蚀性对产能与衬板寿命的影响'], [
        '物料参数是文献区间值，实际以现场取样为准',
    ]);
}

/* ── 动作 6：liner（衬板寿命）── */
if ($action === 'liner') {
    $model = normModel(param('model', ''));
    $lib = isset($DB['MACKORN_LINER_LIFE']) ? $DB['MACKORN_LINER_LIFE'] : null;
    $picked = null;
    if (is_array($lib)) {
        if ($model !== '' && isset($lib[$model])) $picked = $lib[$model];
        else $picked = $lib;
    }
    out([
        'status' => 'success',
        'model'  => $model !== '' ? $model : '（未指定，返回全表）',
        'liner_life' => $picked,
    ], ['衬板寿命受矿石磨蚀性、给料级配、CSS 影响极大，这是参考值'], [
        '建议用现场换衬板记录做威布尔拟合，得到该矿的实际 B10 寿命',
    ]);
}

/* ── 未知动作 ── */
out([
    'status'  => 'error',
    'error'   => 'UNKNOWN_ACTION',
    'requested' => $action,
    'available_actions' => ['help', 'catalog', 'specs', 'capacity', 'recommend', 'materials', 'liner'],
], [], ['调用 action=help 可看全部能力与参数']);
