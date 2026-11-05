<?php
/**
 * MACKORN 云端全息引擎 · probe.php
 * 版本 YU0001.2（2026-11-04）
 *
 * ============================================================================
 * 这一版做了什么（合并两套设计的优点）
 * ============================================================================
 *   来自 SW0001.3（我自己验证过的）：
 *     ① register_shutdown_function 抓致命错 → 返回带行号的 JSON，不再 0 字节黑盒
 *     ② action=ping 最小探针 → 先测这个，能区分「PHP 环境问题」和「文件问题」
 *     ③ PHP 5.6 兼容 → 不用空合并运算符 / 箭头函数 / 返回类型 / 类型声明
 *     ④ SSL 校验强制开启 → 关掉等于让中间人伪造探测结果
 *
 *   来自 YU0001.1 提案（真正有价值的三条）：
 *     ⑤ **三级 token**（phone / pc / admin）→ 手机泄露不影响电脑
 *     ⑥ **heartbeats 心跳** → 三端谁掉线立刻能看出来
 *     ⑦ **history 自动归档** → 电脑关机期间云端攒历史，回来能知道发生了什么
 *
 *   ⚠️ 明确不采纳的：
 *     · PHP 7.4 及以上才有的语法 —— 服务器版本未知，用这个可能又 500
 *     · 硬编码 token —— 一律走文件（0600）
 *
 * 部署
 * ────
 *   ① 传本文件到 htdocs/ai/api/probe.php
 *   ② 浏览器开  probe.php?action=ping     ← 必须看到 {"ok":true,...}
 *   ③ 浏览器开  probe.php?action=init     拿到 3 个 token（只显示这一次）
 *   ④ 宝塔→计划任务→访问URL→每30分钟：
 *        probe.php?action=holo&token=<pc_token>
 */

/* ============================================================================
   第 0 步：错误可见（这一段是全文件最重要的 20 行）
   ============================================================================ */
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
@set_time_limit(300);

$GLOBALS['__PROBE_DEBUG'] = (isset($_GET['debug']) && $_GET['debug'] === '1');

register_shutdown_function(function () {
    $e = error_get_last();
    if ($e === null) return;
    $fatal = array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR);
    if (!in_array($e['type'], $fatal, true)) return;

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    $out = array(
        'ok'      => false,
        'error'   => 'PHP_FATAL',
        'message' => $e['message'],
        'line'    => $e['line'],
        'php'     => PHP_VERSION,
        'hint'    => '把这段原样发回给 Leif —— 有行号就能定位',
    );
    if ($GLOBALS['__PROBE_DEBUG']) { $out['file'] = basename($e['file']); }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
});

/* ============================================================================
   第 1 步：常量
   ============================================================================ */
define('YU_VER',         'YU0001.2');
define('DIR_DATA',       __DIR__ . '/_probe');
define('FILE_HOLO',      DIR_DATA . '/holo.json');
define('FILE_STATE',     DIR_DATA . '/latest.json');
define('FILE_HIST',      DIR_DATA . '/history.jsonl');
define('FILE_HB',        DIR_DATA . '/heartbeats.json');
define('HIST_MAX_LINES', 5000);
define('HTTP_TIMEOUT',   12);
define('ROLES',          'phone,pc,admin');   // 逗号串，避免 array 常量（PHP 5.6 不支持数组常量）

/* ============================================================================
   第 2 步：基础工具（PHP 5.6 兼容）
   ============================================================================ */
function jout($code, $data) {
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function ensureDir() {
    if (!is_dir(DIR_DATA)) { @mkdir(DIR_DATA, 0700, true); }
    @chmod(DIR_DATA, 0700);
    $ht = DIR_DATA . '/.htaccess';
    if (!file_exists($ht)) {
        $rule = "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n"
              . "<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n";
        @file_put_contents($ht, $rule);
        @chmod($ht, 0600);
    }
}

/** 文件读 JSON，坏了一律返回空数组（不让坏文件把接口打挂） */
function readJsonFile($f, $fallback) {
    if (!is_file($f)) return $fallback;
    $raw = @file_get_contents($f);
    if (!is_string($raw) || $raw === '') return $fallback;
    $j = json_decode($raw, true);
    return is_array($j) ? $j : $fallback;
}

/** 原子写：先写 tmp 再 rename，避免读到半个文件 */
function writeJsonFile($f, $data) {
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $tmp = $f . '.tmp';
    if (@file_put_contents($tmp, $json) === false) return false;
    @chmod($tmp, 0600);
    if (!@rename($tmp, $f)) {
        @unlink($tmp);
        return @file_put_contents($f, $json) !== false;
    }
    @chmod($f, 0600);
    return true;
}

/* ── 三级 token ── */
function tokenFile($role) { return DIR_DATA . '/.token_' . $role; }

function readRoleToken($role) {
    $f = tokenFile($role);
    if (!is_file($f)) return '';
    $s = trim((string)@file_get_contents($f));
    return strlen($s) >= 32 ? $s : '';
}

function writeRoleToken($role, $tok) {
    ensureDir();
    @file_put_contents(tokenFile($role), $tok);
    @chmod(tokenFile($role), 0600);
}

function newToken() { return bin2hex(random_bytes(24)); }   // 48 hex

/** 恒定时间比较；长度不同直接 false */
function tokEq($a, $b) {
    if (!is_string($a) || !is_string($b) || strlen($b) < 32) return false;
    if (strlen($a) !== strlen($b)) return false;
    return hash_equals($b, $a);
}

function givenToken() {
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $h = trim($_SERVER['HTTP_AUTHORIZATION']);
        if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    }
    if (isset($_GET['token'])) return trim((string)$_GET['token']);
    if (isset($_POST['token'])) return trim((string)$_POST['token']);
    return '';
}

/** 判断给到的 token 属于哪个角色；不匹配返回 '' */
function detectRole($given) {
    foreach (array('phone', 'pc', 'admin') as $r) {
        if (tokEq($given, readRoleToken($r))) return $r;
    }
    return '';
}

/* ── 心跳 ── */
function recordHeartbeat($role) {
    ensureDir();
    $hb = readJsonFile(FILE_HB, array());
    $hb[$role] = array('at' => date('c'), 'ts' => time());
    writeJsonFile(FILE_HB, $hb);
}

function readHeartbeats() {
    $hb = readJsonFile(FILE_HB, array());
    $now = time();
    foreach ($hb as $role => $info) {
        $ts = isset($info['ts']) ? (int)$info['ts'] : 0;
        $age = $now - $ts;
        $hb[$role]['age_seconds'] = $age;
        $hb[$role]['age_human'] = $age < 60 ? ($age . 's')
                                : ($age < 3600 ? (round($age / 60) . 'min')
                                : (round($age / 3600) . 'h'));
        $hb[$role]['status'] = $age > 7200 ? 'lost' : ($age > 1800 ? 'stale' : 'alive');
    }
    return $hb;
}

/* ── 历史归档（超过上限切走旧的）── */
function appendHistory($line) {
    ensureDir();
    @file_put_contents(FILE_HIST, $line . "\n", FILE_APPEND);
    @chmod(FILE_HIST, 0600);
    if (!is_file(FILE_HIST)) return;
    $lines = @file(FILE_HIST, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines) || count($lines) <= HIST_MAX_LINES) return;
    $keep = array_slice($lines, -HIST_MAX_LINES);
    $arch = array_slice($lines, 0, count($lines) - HIST_MAX_LINES);
    $af = DIR_DATA . '/history_' . date('Ym') . '.jsonl';
    @file_put_contents($af, implode("\n", $arch) . "\n", FILE_APPEND);
    @chmod($af, 0600);
    @file_put_contents(FILE_HIST, implode("\n", $keep) . "\n");
    @chmod(FILE_HIST, 0600);
}

/* ============================================================================
   第 3 步：HTTP 抓取（SSL 校验强制开启）
   ============================================================================ */
function fetchUrl($url, $timeout) {
    $t0 = microtime(true);
    $res = array('status' => 0, 'body' => '', 'err' => null, 'ms' => 0);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 4);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; MACKORN/' . YU_VER . ')');
        curl_setopt($ch, CURLOPT_ENCODING, '');
        $body = curl_exec($ch);
        $res['status'] = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $res['body']   = is_string($body) ? $body : '';
        $e = curl_error($ch);
        $res['err']    = ($e === '') ? null : $e;
        curl_close($ch);
    } else {
        $ctx = stream_context_create(array(
            'http' => array('timeout' => $timeout, 'ignore_errors' => true,
                            'user_agent' => 'Mozilla/5.0 (compatible; MACKORN/' . YU_VER . ')'),
            'ssl'  => array('verify_peer' => true, 'verify_peer_name' => true),
        ));
        $body = @file_get_contents($url, false, $ctx);
        $res['body']   = is_string($body) ? $body : '';
        $res['status'] = is_string($body) ? 200 : 0;
        $res['err']    = is_string($body) ? null : 'file_get_contents failed';
    }
    $res['ms'] = (int)round((microtime(true) - $t0) * 1000);
    return $res;
}

/* ============================================================================
   第 4 步：探测目标（12 个）
   ============================================================================ */
function platformDefs() {
    return array(
        array('id' => 'npm',           'name' => 'npm Registry',    'w' => 100,
              'url' => 'https://registry.npmjs.org/mackorn-cone-crusher/latest', 'kw' => 'mackorn-cone-crusher'),
        array('id' => 'npm_search',    'name' => 'npm 搜索',         'w' => 90,
              'url' => 'https://registry.npmjs.org/-/v1/search?text=mackorn-cone-crusher&size=5', 'kw' => 'mackorn'),
        array('id' => 'mcp_registry',  'name' => 'MCP 官方注册中心',  'w' => 95,
              'url' => 'https://registry.modelcontextprotocol.io/v0/servers?search=mackorn-cone-crusher', 'kw' => 'mackorn'),
        array('id' => 'mcp_so',        'name' => 'mcp.so',           'w' => 85,
              'url' => 'https://mcp.so/search?q=mackorn-cone-crusher', 'kw' => 'mackorn'),
        array('id' => 'glama',         'name' => 'Glama',            'w' => 80,
              'url' => 'https://glama.ai/mcp/servers?q=mackorn-cone-crusher', 'kw' => 'mackorn'),
        array('id' => 'smithery',      'name' => 'Smithery',         'w' => 75,
              'url' => 'https://smithery.ai/api/servers/search?q=mackorn-cone-crusher', 'kw' => 'mackorn'),
        array('id' => 'pulsemcp',      'name' => 'PulseMCP',         'w' => 70,
              'url' => 'https://api.pulsemcp.com/v0beta/servers?search=mackorn-cone-crusher', 'kw' => 'mackorn'),
        array('id' => 'skills_sh',     'name' => 'skills.sh',        'w' => 65,
              'url' => 'https://skills.sh', 'kw' => 'mackorn'),
        array('id' => 'github_repo',   'name' => 'GitHub 仓库 topics','w' => 90,
              'url' => 'https://api.github.com/repos/LeifDai/MACKORN-hydraulic-cone-crusher', 'kw' => '"topics"'),
        array('id' => 'self_rest',     'name' => '自检 REST API',    'w' => 50,
              'url' => 'https://mackorn.cn/ai/api/ai_execute.php?action=help', 'kw' => 'response'),
        array('id' => 'self_mcp',      'name' => '自检 MCP 端点',     'w' => 50,
              'url' => 'https://mackorn.cn/ai/api/mcp.php', 'kw' => 'mackorn'),
        array('id' => 'self_materials','name' => '自检物料库(Q6)',   'w' => 95,
              'url' => 'https://mackorn.cn/ai/api/ai_execute.php?action=materials&q=%E8%8A%B1%E5%B2%97%E5%B2%A9', 'kw' => 'MATERIAL_LIBRARY'),
    );
}

function doProbe() {
    $defs = platformDefs();
    $out = array();
    $sum = array('listed' => 0, 'not_found' => 0, 'problem' => 0);
    $q6 = null;

    foreach ($defs as $d) {
        $r = fetchUrl($d['url'], HTTP_TIMEOUT);
        $status = 'problem';

        if ($r['err'] !== null && $r['status'] === 0) {
            $status = 'problem';
        } elseif ($r['status'] === 410) {
            $status = 'api_gone';
        } elseif ($r['status'] === 401 || $r['status'] === 403) {
            $status = 'need_auth';
        } elseif ($r['status'] < 200 || $r['status'] >= 300) {
            $status = 'not_found';
        } elseif (stripos($r['body'], $d['kw']) !== false) {
            $status = 'listed';
        } else {
            $status = 'not_found';
        }

        // Q6 专项：从 materials 响应里抠 total_in_library
        if ($d['id'] === 'self_materials') {
            if (preg_match('/"total_in_library"\s*:\s*(\d+)/', $r['body'], $m)) {
                $q6 = (int)$m[1];
            } elseif (preg_match('/\\\\"total_in_library\\\\"\s*:\s*(\d+)/', $r['body'], $m)) {
                $q6 = (int)$m[1];
            }
        }

        if ($status === 'listed') $sum['listed']++;
        elseif ($status === 'not_found') $sum['not_found']++;
        else $sum['problem']++;

        $out[] = array(
            'id' => $d['id'], 'name' => $d['name'], 'weight' => $d['w'],
            'status' => $status, 'http' => $r['status'], 'ms' => $r['ms'],
            'bytes' => strlen($r['body']),
            'evidence' => ($status === 'listed')
                ? ('含 "' . $d['kw'] . '"')
                : (($r['err'] !== null) ? ('错误: ' . substr($r['err'], 0, 60)) : ('HTTP ' . $r['status'])),
        );
    }
    return array('summary' => $sum, 'platforms' => $out, 'materials_count' => $q6);
}

/* ============================================================================
   第 5 步：路由
   ============================================================================ */
$action = isset($_GET['action']) ? preg_replace('/[^a-z_]/', '', strtolower((string)$_GET['action'])) : '';
if ($action === '') $action = 'help';

/* ── ping：最小探针（不需要 token、不需要目录）── */
if ($action === 'ping') {
    jout(200, array(
        'ok'       => true,
        'pong'     => true,
        'version'  => YU_VER,
        'php'      => PHP_VERSION,
        'time'     => date('c'),
        'curl'     => function_exists('curl_init'),
        'writable' => is_writable(__DIR__),
        'dir'      => __DIR__,
    ));
}

/* ── help ── */
if ($action === 'help') {
    jout(200, array(
        'ok'      => true,
        'what'    => 'MACKORN 云端全息引擎 ' . YU_VER,
        'why'     => '电脑关机时，云端每 30 分钟探一次并攒历史',
        'version' => YU_VER,
        'roles'   => array('phone', 'pc', 'admin'),
        'actions' => array(
            'ping'      => '最小探针（无 token）★ 先测这个',
            'help'      => '本文档（无 token）',
            'init'      => '首次生成 3 个 token（phone/pc/admin）',
            'rotate'    => '轮换 token（admin 才能做）',
            'heartbeat' => '上报心跳（任何角色）',
            'holo'      => '执行探测并落盘（pc/admin）★ Cron 调这个',
            'get'       => '读最近快照（任何角色）',
            'status'    => '状态 + 三端心跳（任何角色）',
            'history'   => '读历史轨迹（任何角色）',
        ),
        'cron_example' => 'https://mackorn.cn/ai/api/probe.php?action=holo&token=<pc_token>',
        'note'         => '带 ?debug=1 可看完整错误信息',
    ));
}

/* ── 以下都需要目录 ── */
ensureDir();

/* ── init：只在没有 admin token 时可用 ── */
if ($action === 'init') {
    $cur = readRoleToken('admin');
    if ($cur !== '') {
        jout(409, array('ok' => false, 'error' => 'ALREADY_INITIALIZED',
            'hint' => '已有 token。用 ?action=rotate&token=<admin_token>&role=all'));
    }
    $tokens = array(
        'phone' => newToken(),
        'pc'    => newToken(),
        'admin' => newToken(),
    );
    foreach ($tokens as $r => $t) { writeRoleToken($r, $t); }
    jout(200, array(
        'ok'      => true,
        'version' => YU_VER,
        'tokens'  => $tokens,
        'warning' => '★ 三个 token 只显示这一次，立刻保存。phone 给手机，pc 给电脑，admin 自己留着',
        'cron'    => 'https://mackorn.cn/ai/api/probe.php?action=holo&token=' . $tokens['pc'],
        'role_capabilities' => array(
            'phone' => array('heartbeat', 'get', 'status', 'history'),
            'pc'    => array('heartbeat', 'holo', 'get', 'status', 'history'),
            'admin' => array('heartbeat', 'holo', 'get', 'status', 'history', 'rotate'),
        ),
    ));
}

/* ── 鉴权 ── */
$role = detectRole(givenToken());
if ($role === '') {
    // 区分「没初始化」和「token 错」
    if (readRoleToken('admin') === '') {
        jout(412, array('ok' => false, 'error' => 'NOT_INITIALIZED',
            'hint' => '先浏览器打开 ?action=init 生成 token'));
    }
    jout(401, array('ok' => false, 'error' => 'UNAUTHORIZED',
        'hint' => '需要 ?token=xxx 或 Authorization: Bearer xxx'));
}

/* ── rotate（仅 admin）── */
if ($action === 'rotate') {
    if ($role !== 'admin') {
        jout(403, array('ok' => false, 'error' => 'ADMIN_ONLY'));
    }
    $target = isset($_GET['role']) ? preg_replace('/[^a-z]/', '', strtolower((string)$_GET['role'])) : 'all';
    $new = array();
    foreach (array('phone', 'pc', 'admin') as $r) {
        if ($target === 'all' || $target === $r) {
            $new[$r] = newToken();
            writeRoleToken($r, $new[$r]);
        }
    }
    jout(200, array('ok' => true, 'rotated' => array_keys($new), 'tokens' => $new,
        'warning' => '旧 token 已失效，立刻更新 cron 和手机配置'));
}

/* ── heartbeat（任何角色）── */
if ($action === 'heartbeat') {
    recordHeartbeat($role);
    jout(200, array('ok' => true, 'role' => $role, 'at' => date('c')));
}

/* ── holo / run（pc / admin）── */
if ($action === 'holo' || $action === 'run') {
    if ($role !== 'pc' && $role !== 'admin') {
        jout(403, array('ok' => false, 'error' => 'PC_OR_ADMIN_ONLY',
            'hint' => '手机端用 action=get 读快照，不要触发探测'));
    }
    $t0 = microtime(true);
    $res = doProbe();
    $elapsed = (int)round((microtime(true) - $t0) * 1000);

    $snapshot = array(
        'version'         => YU_VER,
        'snapshot_at'     => date('c'),
        'snapshot_ts'     => time(),
        'elapsed_ms'      => $elapsed,
        'triggered_by'    => $role,
        'summary'         => $res['summary'],
        'materials_count' => $res['materials_count'],
        'platforms'       => $res['platforms'],
    );

    writeJsonFile(FILE_HOLO, $snapshot);
    writeJsonFile(FILE_STATE, $snapshot);   // 兼容老客户端

    // 历史（一行一条，含关键指标）
    appendHistory(json_encode(array(
        'at'        => $snapshot['snapshot_at'],
        'listed'    => $res['summary']['listed'],
        'not_found' => $res['summary']['not_found'],
        'problem'   => $res['summary']['problem'],
        'materials' => $res['materials_count'],
        'ms'        => $elapsed,
    ), JSON_UNESCAPED_UNICODE));

    recordHeartbeat($role);   // 探测的同时也记心跳
    jout(200, $snapshot);
}

/* ── get（任何角色）── */
if ($action === 'get') {
    if (is_file(FILE_HOLO)) {
        $raw = @file_get_contents(FILE_HOLO);
    } elseif (is_file(FILE_STATE)) {
        $raw = @file_get_contents(FILE_STATE);
    } else {
        jout(404, array('ok' => false, 'error' => 'NEVER_RUN',
            'hint' => '先访问 ?action=holo 跑一次（需要 pc 或 admin token）'));
    }
    if (!headers_sent()) {
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo $raw;
    exit;
}

/* ── status（任何角色）── */
if ($action === 'status') {
    $out = array(
        'ok'         => true,
        'version'    => YU_VER,
        'php'        => PHP_VERSION,
        'role'       => $role,
        'heartbeats' => readHeartbeats(),
    );

    $snap = readJsonFile(FILE_HOLO, null);
    if (!$snap) $snap = readJsonFile(FILE_STATE, null);

    if ($snap) {
        $out['last_snapshot_at'] = isset($snap['snapshot_at']) ? $snap['snapshot_at'] : null;
        $out['summary']          = isset($snap['summary']) ? $snap['summary'] : null;
        $out['materials_count']  = isset($snap['materials_count']) ? $snap['materials_count'] : null;
        $ts = isset($snap['snapshot_ts']) ? (int)$snap['snapshot_ts'] : 0;
        if ($ts > 0) {
            $age = time() - $ts;
            $out['age_seconds'] = $age;
            $out['age_human']   = $age < 60 ? ($age . 's')
                                : ($age < 3600 ? (round($age / 60) . 'min')
                                : (round($age / 3600) . 'h'));
            $out['fresh'] = ($age < 3600);
            if ($age > 3600) $out['warning'] = '⚠️ 超过 1 小时没探测，检查 cron 是否在跑';
        }
    } else {
        $out['last_snapshot_at'] = null;
        $out['hint'] = '云端还没探测过。Cron 配了吗？或者手动开 ?action=holo';
    }

    // 有多少历史行
    if (is_file(FILE_HIST)) {
        $lines = @file(FILE_HIST, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $out['history_lines'] = is_array($lines) ? count($lines) : 0;
    }

    jout(200, $out);
}

/* ── history（任何角色）── */
if ($action === 'history') {
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
    if ($limit < 1) $limit = 1;
    if ($limit > 500) $limit = 500;

    if (!is_file(FILE_HIST)) {
        jout(200, array('ok' => true, 'count' => 0, 'history' => array()));
    }
    $lines = @file(FILE_HIST, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) $lines = array();
    $slice = array_slice($lines, -$limit);

    $hist = array();
    foreach ($slice as $l) {
        $j = json_decode($l, true);
        if (is_array($j)) $hist[] = $j;
    }
    jout(200, array('ok' => true, 'count' => count($hist), 'history' => $hist));
}

/* ── 未识别 ── */
jout(400, array('ok' => false, 'error' => 'UNKNOWN_ACTION',
    'given' => $action,
    'available' => array('ping','help','init','rotate','heartbeat','holo','run','get','status','history')));
