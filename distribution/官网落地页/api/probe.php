<?php
/**
 * MACKORN 云端探测引擎（R211 · 2026-11-04）
 *
 * 为什么用 PHP 而不是 Node：
 *   阿里云装 Node + PM2 需要 SSH + 安装 + 维护，服务器重启会挂。
 *   而 PHP 本来就在跑（mackorn.cn 是 PHP 站），传一个文件 + 配一次 cron 就完事。
 *   这是最轻的「电脑关机也能探」。
 *
 * 部署：
 *   1. 本文件 → /ai/api/probe.php
 *   2. cron（宝塔面板 → 计划任务 → Shell 脚本）：
 *        */30 * * * * /usr/bin/curl -s "https://mackorn.cn/ai/api/probe.php?token=XXX&run=1" > /dev/null
 *   3. 查看结果：https://mackorn.cn/ai/api/probe.php?token=XXX
 *
 * 安全：
 *   token 必填，不匹配直接 403（否则别人可以刷你的 cron）
 *
 * 探测逻辑（全部真实 HTTP，不是读本地 JSON）：
 *   · 每个平台定义 url + successCheck
 *   · 记录 http_status / response_time_ms / matched / evidence
 *   · 区分 5 种状态：listed / not_found / endpoint_changed / deprecated / error
 *   · 结果写 cloud_data/probe_state.json，保留最近 60 次历史
 */

header('Content-Type: application/json; charset=utf-8');

/* ══════════════════════════════════════════════════════════════
 * 配置
 * ══════════════════════════════════════════════════════════════ */
define('PROBE_TOKEN', 'mackorn-probe-2026-Kx9mQ');
define('PKG', 'mackorn-cone-crusher');
define('TIMEOUT', 12);
define('DATA_DIR', __DIR__ . '/cloud_data');
define('STATE_FILE', DATA_DIR . '/probe_state.json');
define('HISTORY_FILE', DATA_DIR . '/probe_history.jsonl');

/* ══════════════════════════════════════════════════════════════
 * 鉴权
 * ══════════════════════════════════════════════════════════════ */
$token = isset($_GET['token']) ? $_GET['token'] : '';
if ($token !== PROBE_TOKEN) {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized', 'hint' => 'need ?token=...'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0755, true);

/* ══════════════════════════════════════════════════════════════
 * HTTP 抓取（用 curl，失败降级到 file_get_contents）
 * ══════════════════════════════════════════════════════════════ */
function httpFetch($url, $timeout = TIMEOUT) {
    $t0 = microtime(true);
    $out = ['ok' => false, 'status' => 0, 'body' => '', 'ms' => 0, 'err' => null];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => false,   /* 服务器偶发证书链问题，探测不因此误判 */
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; MACKORN-Probe/1.0; +https://mackorn.cn/ai/)',
            CURLOPT_HTTPHEADER     => ['Accept: text/html,application/json;q=0.9,*/*;q=0.8'],
        ]);
        $body = curl_exec($ch);
        $out['status'] = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $out['err'] = curl_error($ch) ?: null;
        curl_close($ch);
        $out['body'] = is_string($body) ? $body : '';
    } else {
        $ctx = stream_context_create([
            'http' => ['timeout' => $timeout, 'user_agent' => 'Mozilla/5.0 MACKORN-Probe', 'ignore_errors' => true],
            'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false],
        ]);
        $body = @file_get_contents($url, false, $ctx);
        $out['body'] = is_string($body) ? $body : '';
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $out['status'] = (int)$m[1];
        }
        $out['err'] = $body === false ? 'file_get_contents failed' : null;
    }

    $out['ms'] = (int)round((microtime(true) - $t0) * 1000);
    $out['ok'] = ($out['status'] >= 200 && $out['status'] < 300);
    return $out;
}

/* ══════════════════════════════════════════════════════════════
 * 平台清单（全部真实 URL，2026-11-04 实测校准）
 *
 * status 五态：
 *   listed          真的收录了（返回内容里找到我们）
 *   not_found       端点活着但找不到我们
 *   endpoint_changed端点没了（404/410）→ 需要更新探测 URL
 *   deprecated      平台已废弃（410 API_SUNSET）
 *   error           网络/超时/异常
 * ══════════════════════════════════════════════════════════════ */
function platforms() {
    $pkg = PKG;
    return [
        [
            'id' => 'npm', 'name' => 'npm Registry', 'weight' => 100,
            'url' => "https://registry.npmjs.org/{$pkg}/latest",
            'check' => 'json_name',
            'action' => '未收录 → npm publish --access public',
        ],
        [
            'id' => 'npm_search', 'name' => 'npm 站内搜索', 'weight' => 70,
            'url' => 'https://www.npmjs.com/search?q=' . urlencode('mackorn cone crusher'),
            'check' => 'text_mackorn',
            'action' => '未收录 → 检查 package.json keywords',
        ],
        [
            'id' => 'mcp_registry', 'name' => 'MCP 官方注册中心', 'weight' => 95,
            'url' => 'https://registry.modelcontextprotocol.io/v0/servers?search=mackorn',
            'check' => 'text_mackorn',
            'action' => '未收录 → 提交 server.json',
        ],
        [
            'id' => 'mcp_so', 'name' => 'mcp.so', 'weight' => 80,
            'url' => 'https://mcp.so/search?q=' . urlencode('mackorn'),
            'check' => 'text_mackorn',
            'action' => '未收录 → mcp.so/submit 提交',
        ],
        [
            'id' => 'github_topics', 'name' => 'GitHub 仓库 topics', 'weight' => 60,
            'url' => 'https://github.com/LeifDai/MACKORN-hydraulic-cone-crusher',
            'check' => 'text_mackorn',
            'action' => '未收录 → 检查仓库 topics 是否有 mcp',
        ],
        [
            'id' => 'glama', 'name' => 'Glama', 'weight' => 80,
            'url' => 'https://glama.ai/mcp/servers?q=mackorn',
            'check' => 'text_mackorn',
            'action' => '未收录（200 但页面无我们）→ 页面是 JS 渲染，需人工查 glama.ai 后台',
        ],
        [
            'id' => 'smithery', 'name' => 'Smithery', 'weight' => 75,
            'url' => 'https://smithery.ai/server/@mackorn/mackorn-cone-crusher',
            'check' => 'text_mackorn',
            'action' => '端点 404 → API 已改版，需去 smithery.ai 登录 GitHub 手动 submit',
        ],
        [
            'id' => 'pulsemcp', 'name' => 'PulseMCP', 'weight' => 50,
            'url' => 'https://pulsemcp.com/servers?q=mackorn',
            'check' => 'text_mackorn',
            'action' => '410 API_SUNSET → 平台 API 已废弃，改人工网页提交',
        ],
        [
            'id' => 'skills_sh', 'name' => 'skills.sh', 'weight' => 70,
            'url' => 'https://skills.sh',
            'check' => 'text_mackorn',
            'action' => '未收录 → 等爬虫（skills/ 目录已有）',
        ],
        [
            'id' => 'rest_exec', 'name' => 'REST 执行层 ai_execute.php', 'weight' => 90,
            'url' => 'https://mackorn.cn/ai/api/ai_execute.php?action=help',
            'check' => 'json_response',
            'action' => '不通 → 上传 ai_execute.php',
        ],
        [
            'id' => 'mcp_endpoint', 'name' => 'MCP 端点 mcp.php', 'weight' => 90,
            'url' => 'https://mackorn.cn/ai/api/mcp.php',
            'check' => 'json_mackorn',
            'action' => '不通 → 检查 mcp.php',
        ],
    ];
}

/* ══════════════════════════════════════════════════════════════
 * 判定
 * ══════════════════════════════════════════════════════════════ */
function judge($plat, $res) {
    $status = 'error';
    $evidence = '';
    $matched = false;
    $body = $res['body'];
    $hay = strtolower($body);

    /* 先判 HTTP 层 */
    if (!$res['ok']) {
        if ($res['status'] === 410) {
            $status = 'deprecated';
            $evidence = 'HTTP 410（平台已废弃）';
        } elseif ($res['status'] === 404) {
            $status = 'endpoint_changed';
            $evidence = 'HTTP 404（端点已变）';
        } elseif ($res['status'] === 0) {
            $status = 'error';
            $evidence = '连接失败：' . ($res['err'] ?: 'unknown');
        } else {
            $status = 'error';
            $evidence = 'HTTP ' . $res['status'];
        }
        return [$status, $evidence, false];
    }

    /* 再按 check 类型判内容 */
    switch ($plat['check']) {
        case 'json_name':
            $j = json_decode($body, true);
            $matched = is_array($j) && isset($j['name']) && strpos($j['name'], 'mackorn') !== false;
            $evidence = $matched ? ('name=' . $j['name'] . ' version=' . (isset($j['version']) ? $j['version'] : '?')) : 'JSON 里没有 mackorn';
            break;

        case 'json_response':
            $j = json_decode($body, true);
            $matched = is_array($j) && isset($j['response']) && strlen((string)$j['response']) > 20;
            $evidence = $matched ? ('response 长度 ' . strlen((string)$j['response'])) : '缺 response 字段';
            break;

        case 'json_mackorn':
            $matched = (strpos($hay, 'mackorn') !== false);
            $evidence = $matched ? 'JSON 含 mackorn' : 'JSON 不含 mackorn';
            break;

        case 'text_mackorn':
        default:
            $matched = (strpos($hay, 'mackorn') !== false);
            $evidence = $matched ? ('页面含 mackorn（' . strlen($body) . ' 字节）') : ('页面不含 mackorn（' . strlen($body) . ' 字节）');
            break;
    }

    $status = $matched ? 'listed' : 'not_found';
    return [$status, $evidence, $matched];
}

/* ══════════════════════════════════════════════════════════════
 * 执行探测
 * ══════════════════════════════════════════════════════════════ */
function runProbe() {
    $results = [];
    foreach (platforms() as $plat) {
        $res = httpFetch($plat['url']);
        list($status, $evidence, $matched) = judge($plat, $res);
        $results[] = [
            'id'          => $plat['id'],
            'name'        => $plat['name'],
            'weight'      => $plat['weight'],
            'status'      => $status,
            'http'        => $res['status'],
            'ms'          => $res['ms'],
            'bytes'       => strlen($res['body']),
            'evidence'    => $evidence,
            'action'      => ($status === 'listed') ? null : $plat['action'],
            'probed_at'   => date('c'),
        ];
        /* 平台之间错开 300ms，避免被当成爬虫 */
        usleep(300000);
    }

    $summary = [
        'listed'    => 0, 'not_found' => 0,
        'endpoint_changed' => 0, 'deprecated' => 0, 'error' => 0,
    ];
    foreach ($results as $r) { $summary[$r['status']]++; }

    /* 加权收录率（按平台重要度加权，比简单计数更有意义） */
    $totalW = 0; $gotW = 0;
    foreach ($results as $r) {
        $totalW += $r['weight'];
        if ($r['status'] === 'listed') $gotW += $r['weight'];
    }
    $weighted = $totalW > 0 ? round($gotW / $totalW * 100, 1) : 0;

    $state = [
        'at'          => date('c'),
        'at_local'    => date('Y-m-d H:i:s'),
        'pkg'         => PKG,
        'summary'     => $summary,
        'weighted_pct'=> $weighted,
        'platforms'   => $results,
        'todo'        => array_values(array_filter($results, function ($r) {
            return $r['status'] !== 'listed';
        })),
    ];
    return $state;
}

/* ══════════════════════════════════════════════════════════════
 * 历史对比（看哪些平台从红变绿 / 从绿变红）
 * ══════════════════════════════════════════════════════════════ */
function diffWithLast($state) {
    if (!is_file(STATE_FILE)) return ['has_prev' => false];
    $prev = json_decode(@file_get_contents(STATE_FILE), true);
    if (!is_array($prev) || !isset($prev['platforms'])) return ['has_prev' => false];

    $prevMap = [];
    foreach ($prev['platforms'] as $p) $prevMap[$p['id']] = $p['status'];

    $fixed = []; $regressed = [];
    foreach ($state['platforms'] as $p) {
        $old = isset($prevMap[$p['id']]) ? $prevMap[$p['id']] : null;
        if ($old === null) continue;
        if ($old !== 'listed' && $p['status'] === 'listed') {
            $fixed[] = ['id' => $p['id'], 'name' => $p['name'], 'from' => $old];
        }
        if ($old === 'listed' && $p['status'] !== 'listed') {
            $regressed[] = ['id' => $p['id'], 'name' => $p['name'], 'to' => $p['status']];
        }
    }
    return [
        'has_prev'   => true,
        'prev_at'    => isset($prev['at_local']) ? $prev['at_local'] : '?',
        'prev_pct'   => isset($prev['weighted_pct']) ? $prev['weighted_pct'] : null,
        'pct_delta'  => isset($prev['weighted_pct']) ? round($state['weighted_pct'] - $prev['weighted_pct'], 1) : null,
        'fixed'      => $fixed,
        'regressed'  => $regressed,
    ];
}

/* ══════════════════════════════════════════════════════════════
 * 路由
 * ══════════════════════════════════════════════════════════════ */
$doRun = isset($_GET['run']) && $_GET['run'] === '1';
$asMd  = isset($_GET['md']) && $_GET['md'] === '1';

/* 只读：返回上次结果 */
if (!$doRun) {
    if (!is_file(STATE_FILE)) {
        echo json_encode([
            'status' => 'never_run',
            'hint'   => '第一次运行：' . $_SERVER['REQUEST_URI'] . '&run=1',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $prev = json_decode(file_get_contents(STATE_FILE), true);
    /* md 格式（方便人看） */
    if ($asMd) {
        header('Content-Type: text/markdown; charset=utf-8');
        echo renderMarkdown($prev);
        exit;
    }
    echo json_encode($prev, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/* 执行探测 */
$state = runProbe();
$state['diff'] = diffWithLast($state);

file_put_contents(STATE_FILE, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

/* 历史留痕（保留最近 500 条 = 约 10 天 @30min） */
@file_put_contents(
    HISTORY_FILE,
    json_encode([
        'at' => $state['at'], 'at_local' => $state['at_local'],
        'summary' => $state['summary'], 'weighted_pct' => $state['weighted_pct'],
    ], JSON_UNESCAPED_UNICODE) . "\n",
    FILE_APPEND
);

/* 历史太长就截断 */
if (is_file(HISTORY_FILE) && filesize(HISTORY_FILE) > 512 * 1024) {
    $lines = file(HISTORY_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $lines = array_slice($lines, -500);
    file_put_contents(HISTORY_FILE, implode("\n", $lines) . "\n");
}

if ($asMd) {
    header('Content-Type: text/markdown; charset=utf-8');
    echo renderMarkdown($state);
    exit;
}

echo json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

/* ══════════════════════════════════════════════════════════════
 * Markdown 渲染
 * ══════════════════════════════════════════════════════════════ */
function renderMarkdown($s) {
    $icon = [
        'listed' => '✅', 'not_found' => '❌',
        'endpoint_changed' => '🔀', 'deprecated' => '💀', 'error' => '⚠️',
    ];
    $out = "# MACKORN 云端探测报告\n\n";
    $out .= "> 探测时间：" . (isset($s['at_local']) ? $s['at_local'] : '?') . "\n";
    $out .= "> 加权收录率：**" . (isset($s['weighted_pct']) ? $s['weighted_pct'] : 0) . "%**\n\n";

    $sum = isset($s['summary']) ? $s['summary'] : [];
    $out .= "## 总览\n\n| 状态 | 数量 |\n|:---|---:|\n";
    $out .= "| ✅ 已收录 | " . (isset($sum['listed']) ? $sum['listed'] : 0) . " |\n";
    $out .= "| ❌ 未收录 | " . (isset($sum['not_found']) ? $sum['not_found'] : 0) . " |\n";
    $out .= "| 🔀 端点已变 | " . (isset($sum['endpoint_changed']) ? $sum['endpoint_changed'] : 0) . " |\n";
    $out .= "| 💀 已废弃 | " . (isset($sum['deprecated']) ? $sum['deprecated'] : 0) . " |\n";
    $out .= "| ⚠️ 异常 | " . (isset($sum['error']) ? $sum['error'] : 0) . " |\n\n";

    if (!empty($s['diff']) && !empty($s['diff']['has_prev'])) {
        $d = $s['diff'];
        $out .= "## 与上次对比（上次 " . $d['prev_at'] . "）\n\n";
        if ($d['pct_delta'] !== null) {
            $sign = $d['pct_delta'] >= 0 ? '+' : '';
            $out .= "加权收录率变化：**" . $sign . $d['pct_delta'] . "%**\n\n";
        }
        if (!empty($d['fixed'])) {
            $out .= "### 🎉 新收录\n\n";
            foreach ($d['fixed'] as $f) $out .= "- **" . $f['name'] . "**（" . $f['from'] . " → listed）\n";
            $out .= "\n";
        }
        if (!empty($d['regressed'])) {
            $out .= "### 📉 掉收录\n\n";
            foreach ($d['regressed'] as $f) $out .= "- **" . $f['name'] . "**（listed → " . $f['to'] . "）\n";
            $out .= "\n";
        }
    }

    $out .= "## 逐平台\n\n| 平台 | 状态 | HTTP | 耗时 | 证据 |\n|:---|:---:|:---:|---:|:---|\n";
    foreach ((isset($s['platforms']) ? $s['platforms'] : []) as $p) {
        $ic = isset($icon[$p['status']]) ? $icon[$p['status']] : '❓';
        $out .= "| **" . $p['name'] . "** | " . $ic . " " . $p['status'] . " | " . $p['http'] . " | " . $p['ms'] . "ms | " . $p['evidence'] . " |\n";
    }

    if (!empty($s['todo'])) {
        $out .= "\n## 待办（按权重排序）\n\n";
        $todo = $s['todo'];
        usort($todo, function ($a, $b) { return $b['weight'] - $a['weight']; });
        foreach ($todo as $t) {
            $out .= "### " . $t['name'] . "（权重 " . $t['weight'] . "）\n\n";
            $out .= "- 状态：" . $t['status'] . "\n";
            $out .= "- 证据：" . $t['evidence'] . "\n";
            $out .= "- 动作：" . $t['action'] . "\n\n";
        }
    }

    $out .= "---\n\n*由 `probe.php` 自动生成 · 配 cron 后每 30 分钟自动跑一次，电脑关机也在探*\n";
    return $out;
}
