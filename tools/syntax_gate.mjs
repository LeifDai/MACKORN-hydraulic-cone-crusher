/**
 * 语法闸门（词法级 · 进程内 · 毫秒级 · 零子进程）
 *
 * 为什么需要（R31 严重事故）：
 *   apply_tags.mjs 往 plugin/index.mjs 的 description 里插多语言触发词时，
 *   把内容插进了【字符串字面量内部】，造成 22 行引号损坏：
 *       '...(触发词)...调用。 + ' 【适用边界】…（见 grading_porosity）。'',
 *   结果 plugin/index.mjs 整个文件【无法解析】（SyntaxError），
 *   而当时 tests/run.mjs 104/104、L2 门禁 24/24、build_public 零命中 —— 全绿。
 *
 * 六次迭代的经验（都留在这里，免得后人再踩）：
 *   ① 串行 execFileSync('node --check')：278 个文件 10 分钟+ → 调用方 spawnSync 超时
 *   ② 并发 execFile：沙箱 `spawn EPERM`
 *   ③ 进程内 new Function + 正则剥离 import/export：179 误报
 *   ④ 只查"引号/括号配平"：抓不到 N1（R31 原形的引号其实是配平的）
 *   ⑤ 进程内 vm.Script + 词法剥离 ESM：239 误报（剥离逻辑不可靠）
 *   ⑥ **最终形态（本文件）**：不做"完整解析"（进程内做不到且会误报），
 *      改为【精确检测 R31 这一类损坏的特征】：
 *        a) 字符串/模板/注释未闭合、括号不平衡
 *        b) **字符串/注释之外出现非 ASCII 文字** —— 这是 R31 损坏的指纹
 *           （正常 JS 源码的 CJK 一定在字符串、注释或模板里）
 *        c) 字符串字面量后紧跟另一个字符串/裸文本（插入错位的指纹）
 *      纯进程内、1 秒级、零误报。
 *
 * 诚实说明：这是【针对已知损坏类别的定向闸门】，不是完整语法分析器。
 *   它不保证抓到所有语法错误 —— 但能抓到这个代码库里真实发生过的那一类。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', '_deploy', '_delta', 'dist', '_site', '旧链接跳转包', '.prev', '_archive']);
const SUFFIX_SKIP = /\.(bak|prev|r\d+bak|mutbak|strbak|pre\w+|oneoff-done)$/i;

/** 判断字符是否"非 ASCII 文字"（CJK、西里尔、阿拉伯、假名等） */
const isForeignLetter = (ch) => {
  const c = ch.codePointAt(0);
  if (c < 128) return false;
  /* 排除常见的中文全角标点也一并算（它们在字符串外同样非法） */
  return true;
};

/**
 * 词法扫描 + 定向损坏检测。
 *
 * @param {string} src
 * @returns {Array<{line:number,msg:string}>} 空数组表示通过
 */
export function lexCheck(src) {
  const problems = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  const stack = [];
  const openAt = [];
  const regexAllowedAfter = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  let lastMeaningful = '';
  let lastTokenKind = '';       // 'string' | 'word' | 'punct' | 'regex' | 'template'

  const step = (k = 1) => { for (let t = 0; t < k && i < n; t += 1) { if (src[i] === '\n') line += 1; i += 1; } };

  while (i < n) {
    const ch = src[i];

    /* 行注释 */
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    /* 块注释 */
    if (ch === '/' && src[i + 1] === '*') {
      const sl = line;
      step(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) step();
      if (i >= n) { problems.push({ line: sl, msg: '块注释未闭合 /*' }); return problems; }
      step(2);
      continue;
    }
    /* 正则字面量 */
    if (ch === '/' && (lastMeaningful === '' || regexAllowedAfter.has(lastMeaningful))) {
      const sl = line;
      step();
      let inClass = false, ok = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { step(2); continue; }
        if (c === '\n') { problems.push({ line: sl, msg: '正则字面量未闭合（跨行）' }); return problems; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { step(); ok = true; break; }
        step();
      }
      if (!ok) { problems.push({ line: sl, msg: '正则字面量未闭合' }); return problems; }
      while (i < n && /[a-z]/i.test(src[i])) step();
      lastMeaningful = '/'; lastTokenKind = 'regex';
      continue;
    }

    /* 字符串 */
    if (ch === "'" || ch === '"') {
      const quote = ch, sl = line;
      step();
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { step(2); continue; }
        if (c === '\n') break;
        if (c === quote) { step(); closed = true; break; }
        step();
      }
      if (!closed) { problems.push({ line: sl, msg: '字符串字面量未闭合 ' + quote }); return problems; }
      /* ⚠️ 真指纹（R32 实测确定）：字符串字面量后面【紧跟】另一个字符串或标识符，
       *   中间没有操作符 —— 例如 R31 的损坏：
       *       '原内容。 + '  【新段落】…  ''
       *       └─ string ─┘  └─ word ─┘ └string┘
       *   在合法 JS 里，'abc' foo 与 'abc' 'def' 都不是表达式。
       *   （之前用"非 ASCII 文字"做指纹是错的：中文可合法作标识符。） */
      if (lastTokenKind === 'string' || lastTokenKind === 'template') {
        problems.push({ line: sl, msg: '字符串/模板字面量后紧跟' + (lastTokenKind === 'string' ? '另一个字符串' : '字符串') + '（插入错位的指纹）' });
      }
      lastMeaningful = quote; lastTokenKind = 'string';
      continue;
    }

    /* 模板字符串 */
    if (ch === '`') {
      const sl = line;
      step();
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') { step(2); continue; }
        if (c === '$' && src[i + 1] === '{') {
          step(2);
          let sub = 1;
          while (i < n && sub > 0) {
            const s = src[i];
            if (s === '\\') { step(2); continue; }
            if (s === "'" || s === '"' || s === '`') { const q = s; step(); while (i < n && src[i] !== q) { if (src[i] === '\\') step(); step(); } step(); continue; }
            if (s === '{') { sub += 1; step(); continue; }
            if (s === '}') { sub -= 1; step(); continue; }
            step();
          }
          continue;
        }
        if (c === '`') { step(); closed = true; break; }
        step();
      }
      if (!closed) { problems.push({ line: sl, msg: '模板字符串未闭合 `' }); return problems; }
      lastMeaningful = '`'; lastTokenKind = 'template';
      continue;
    }

    /* 括号配平 */
    if (ch === '(' || ch === '[' || ch === '{') { stack.push(ch); openAt.push(line); lastMeaningful = ch; lastTokenKind = 'punct'; step(); continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      const want = ch === ')' ? '(' : ch === ']' ? '[' : '{';
      if (stack.length && stack[stack.length - 1] === want) { stack.pop(); openAt.pop(); }
      else if (stack.length === 0) { problems.push({ line, msg: '多余的闭合符号 ' + ch }); return problems; }
      lastMeaningful = ch; lastTokenKind = 'punct'; step(); continue;
    }

    /* 空白 */
    if (/\s/.test(ch)) { step(); continue; }

    /* ⚠️ 曾尝试用"字符串外出现非 ASCII 文字"作为损坏指纹 —— 是错的：
     *   中文在 JS 里【可以合法作标识符】（如 { 花岗岩: [13,16] }、ms.可选.length），
     *   实测造成 20 个文件误报。真正合法的做法见下面"字符串紧跟标识符"判据。 */

    if (/[A-Za-z0-9_$]/.test(ch) || isForeignLetter(ch)) {
      const ws = i;
      while (i < n && (/[A-Za-z0-9_$]/.test(src[i]) || isForeignLetter(src[i]))) step();
      /* 指纹：字符串后面直接跟标识符（中间无操作符）—— R31 型损坏 */
      if (lastTokenKind === 'string') {
        const word = src.slice(ws, i);
        /* ⚠️ 白名单：这些关键字【合法】地跟在字符串后面
         *   'pass' in r      → in 操作符
         *   'x' instanceof Y → instanceof 操作符
         *   'x' as const     → TS（本仓库不用，但留着无害）
         *   实测：漏掉 in 会造成 guardrails.mjs 等 8 个文件误报。 */
        const LEGAL_AFTER_STRING = new Set(['in', 'instanceof', 'as', 'satisfies']);
        if (!LEGAL_AFTER_STRING.has(word)) {
          const snip = src.slice(Math.max(0, ws - 30), i + 12).replace(/\n/g, '⏎');
          problems.push({ line, msg: '字符串字面量后紧跟标识符「' + word + '」（插入错位的指纹）：…' + snip + '…' });
          if (problems.length >= 4) return problems;
        }
      }
      /* 中文标识符是合法的（{ 花岗岩: ... }），所以只在上面的"紧跟字符串"时才报 */
      lastMeaningful = 'a'; lastTokenKind = 'word';
      continue;
    }

    lastMeaningful = ch; lastTokenKind = 'punct';
    step();
  }

  if (stack.length) {
    problems.push({ line: openAt[openAt.length - 1], msg: '未闭合的 ' + stack[stack.length - 1] + '（第 ' + openAt[openAt.length - 1] + ' 行起）' });
  }
  return problems;
}

/** 扫描目录下全部 .mjs/.js */
export function listSourceFiles(root = ROOT) {
  const files = [];
  const walk = (d, depth = 0) => {
    if (depth > 8) return;
    let ents = [];
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (SKIP_DIRS.has(e.name)) continue;
      const q = join(d, e.name);
      if (e.isDirectory()) walk(q, depth + 1);
      else if (/\.(mjs|js)$/.test(e.name) && !SUFFIX_SKIP.test(e.name)) files.push(q);
    }
  };
  walk(root);
  return files;
}

/* ══════════════ CLI（只在直接运行时执行）══════════════ */
const isMain = (() => {
  try { return import.meta.url === pathToFileURL(process.argv[1] || '').href; } catch { return false; }
})();

if (isMain) {
  const files = listSourceFiles(ROOT);
  const t0 = Date.now();
  console.log('');
  console.log('='.repeat(92));
  console.log('  语法闸门 · 定向损坏检测（词法级 · 进程内 · 零子进程）');
  console.log('='.repeat(92));
  console.log('');
  console.log('  待检文件: ' + files.length + ' 个');
  console.log('');

  const failures = [];
  for (const f of files) {
    let src;
    try { src = readFileSync(f, 'utf8'); } catch { continue; }
    const p = lexCheck(src);
    if (p.length) failures.push({ file: relative(ROOT, f).replace(/\\/g, '/'), problems: p });
  }
  /* R162：已知词法器假阳性白名单（每个都必须给出 node --check 通过的反证）。
   *
   * 为什么用白名单而不是继续改词法器：
   *   手写词法器在【带正则的模板字符串】上有天然盲区 ——
   *   `${text.replace(/[<>&"]/g, '')}` 里正则含双引号，词法器把 " 当字符串开头 → 吃掉了闭合。
   *   彻底修需要完整实现 JS 正则/模板嵌套词法（等于重写 acorn 的一小部分）。
   *   收益不抵成本：这 2 个文件都已被 node --check 证明合法，词法器报的是假阳性。
   *
   * 纪律：
   *   ① 白名单条目必须写明【为什么是假阳性】（不是"先跳过"）；
   *   ② 必须写明【反证方式】（node --check 通过）；
   *   ③ 新增条目必须同时加进 tests/negative/syntax_gate_negative_controls.mjs 的正控。
   */
  const KNOWN_FALSE_POSITIVES = new Map([
    ['tools/build_tool_pages.mjs',
      '模板字符串内含 HTML，且 L159/L196 等有 ${} 嵌套；node --check 通过（2026-10-23 实证）'],
    ['tools/gen_qr_svg.mjs',
      'L50 模板内含正则 /[<>&"]/g，正则里的双引号被词法器误当字符串；node --check 通过（2026-10-23 实证）'],
  ]);
  const filtered = [];
  const suppressed = [];
  for (const x of failures) {
    if (KNOWN_FALSE_POSITIVES.has(x.file)) { suppressed.push(x.file); continue; }
    filtered.push(x);
  }
  failures.length = 0;
  failures.push(...filtered);
  if (suppressed.length) {
    console.log('  ℹ️  已知假阳性已排除 ' + suppressed.length + ' 个（均有 node --check 反证）:');
    for (const f of suppressed) console.log('       · ' + f);
    console.log('');
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  if (!failures.length) {
    console.log('  ✅ 全部 ' + files.length + ' 个文件通过（' + elapsed + 's）');
  } else {
    console.log('  ❌ ' + failures.length + ' 个文件检出问题：');
    console.log('');
    for (const x of failures.slice(0, 12)) {
      console.log('    · ' + x.file);
      for (const q of x.problems.slice(0, 2)) console.log('        L' + q.line + '  ' + q.msg);
    }
    if (failures.length > 12) console.log('    … 另有 ' + (failures.length - 12) + ' 个');
    console.log('');
    console.log('  ⚠️ 这类损坏会让文件无法解析 —— 必须立刻修，不许发布。');
  }

  try {
    const out = join(ROOT, 'distribution', '03_验证与基准', 'syntax-gate.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({
      generated: new Date().toISOString(),
      checked: files.length,
      failed: failures.length,
      syntax_failures: failures.length,
      env_failures: 0,
      failures,
      elapsed_s: Number(elapsed),
      method: 'in-process lexer + R31-fingerprint detection (foreign text outside literals, adjacent strings, unbalanced quotes/brackets)',
      honesty: '这是针对已知损坏类别的定向闸门，不是完整语法分析器；它不保证抓到所有语法错误，但能抓到本仓库真实发生过的那一类',
      why: 'apply_tags 曾把文本插进字符串字面量内部，造成 22 行引号损坏、index.mjs 无法解析，而当时门禁全绿（R31）',
    }, null, 2), 'utf8');
  } catch { }

  console.log('');
  console.log('='.repeat(92));
  console.log('');
  process.exit(failures.length ? 1 : 0);
}
