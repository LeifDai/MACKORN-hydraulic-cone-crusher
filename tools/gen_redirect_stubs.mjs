/**
 * 生成旧 URL 的跳转文件（方案 A：不用改服务器配置，只上传文件）
 *
 * 为什么给两个方案：
 *   见 SOP 文档。方案 A 只需上传文件，不碰 .htaccess，对新手最安全。
 *   跳转用 【meta refresh + canonical + JS】 三重保险，不依赖服务器配置。
 */
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'distribution', '旧链接跳转包');
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

const BASE = 'https://mackorn.cn';

/* 旧路径 → 新路径（末尾带斜杠的按目录处理） */
const DIRS = [
  ['glossary', 'ai/glossary', '12 语言术语表'],
  ['markets', 'ai/markets', '市场页'],
  ['distributors', 'ai/distributors', '经销商招募'],
  ['engineering-firms', 'ai/engineering-firms', '设计院/EPC'],
  ['contact', 'ai/contact', '联系方式'],
  ['en', 'ai/en', '英语'],
  ['ru', 'ai/ru', '俄语'],
  ['es', 'ai/es', '西班牙语'],
  ['pt', 'ai/pt', '葡萄牙语'],
  ['fr', 'ai/fr', '法语'],
  ['ar', 'ai/ar', '阿拉伯语'],
  ['id', 'ai/id', '印尼语'],
  ['ja', 'ai/ja', '日语'],
  ['de', 'ai/de', '德语'],
  ['tr', 'ai/tr', '土耳其语'],
  ['vi', 'ai/vi', '越南语'],
];

function page(oldPath, newPath, label) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>页面已迁移 · ${label} | MACKORN 美矿</title>
<!-- 三重跳转：canonical 告诉搜索引擎新地址，meta refresh 与 JS 负责把访客送过去 -->
<link rel="canonical" href="${BASE}/${newPath}/">
<meta http-equiv="refresh" content="0; url=${BASE}/${newPath}/">
<meta name="robots" content="noindex,follow">
<script>location.replace("${BASE}/${newPath}/");</script>
<style>body{font-family:-apple-system,"Microsoft YaHei",sans-serif;max-width:640px;margin:80px auto;padding:0 24px;line-height:1.8;color:#16202E}
a{color:#1B6CB5}h1{font-size:20px;color:#0A2A4F}.box{background:#F4F8FC;border-left:4px solid #1B6CB5;padding:16px 20px;border-radius:0 10px 10px 0;margin:20px 0}
code{background:#F4F8FC;padding:2px 6px;border-radius:4px}</style>
</head>
<body>
<h1>页面已迁移到新地址</h1>
<div class="box">
本页（<code>/${oldPath}/</code>）的内容已迁入 <code>/${newPath}/</code>。<br>
如果浏览器没有自动跳转，请点这里：<br><br>
<a href="${BASE}/${newPath}/">${BASE}/${newPath}/</a>
</div>
<p style="color:#5A6B80;font-size:14px">MACKORN 美矿 · 上海美矿机械股份有限公司 · 液压圆锥破碎机与破碎筛分生产线</p>
</body>
</html>
`;
}

let n = 0;
for (const [oldP, newP, label] of DIRS) {
  const d = join(OUT, oldP);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), page(oldP, newP, label), 'utf8');
  n++;
}
/* 根文件跳转 */
writeFileSync(join(OUT, 'llms-full.txt'), `MACKORN 完整参考已迁移。

新地址：${BASE}/ai/llms-full.txt

MACKORN 美矿 · 上海美矿机械股份有限公司
液压圆锥破碎机与破碎筛分生产线
`, 'utf8');
writeFileSync(join(OUT, 'CLAUDE.md'), `# MACKORN — 文件已迁移

本文件已迁移至：${BASE}/ai/CLAUDE.md

（MACKORN 液压圆锥破碎机选型插件的项目说明）
`, 'utf8');
n += 2;

/* api/mcp.php 跳转（PHP 版，若无法用 .htaccess 时的兜底） */
mkdirSync(join(OUT, 'api'), { recursive: true });
writeFileSync(join(OUT, 'api', 'mcp.php'), `<?php
/**
 * 旧地址跳转：/api/mcp.php → /ai/api/mcp.php
 * 用 308 永久重定向，保留 POST body 与 JSON-RPC 语义。
 */
$new = '/ai/api/mcp.php';
if (isset($_SERVER['REQUEST_URI']) && strpos($_SERVER['REQUEST_URI'], '/ai/') !== false) {
    http_response_code(500);
    echo json_encode(['error' => 'redirect stub misconfigured']);
    exit;
}
// 307/308 保留方法与请求体；MCP 客户端会跟随
http_response_code(308);
header('Location: ' . $new);
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
  'jsonrpc' => '2.0',
  'error' => ['code' => -32000, 'message' => 'Moved Permanently: ' . $new],
], JSON_UNESCAPED_UNICODE);
`, 'utf8');
n++;

console.log('  ✅ 生成 ' + n + ' 个跳转文件 → ' + OUT.replace(ROOT + '\\', ''));
console.log('');
console.log('  目录结构：');
for (const [oldP, newP] of DIRS) console.log('    /' + oldP + '/index.html   →   /' + newP + '/');
console.log('    /llms-full.txt        →   /ai/llms-full.txt');
console.log('    /CLAUDE.md            →   /ai/CLAUDE.md');
console.log('    /api/mcp.php          →   /ai/api/mcp.php');
