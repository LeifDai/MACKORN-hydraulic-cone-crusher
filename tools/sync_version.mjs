/**
 * 版本号单一真相源同步工具
 *
 * 问题：版本号散落在 README / llms.txt / server.json / package.json / index.html /
 * server-card.json / 发布清单.md / 构建脚本 里，手工改必然漏，漏了就会
 * "包是 0.0.5、README 写 0.0.3" 这种自相矛盾 —— 对一个主打"数据诚实"的项目是硬伤。
 *
 * 用法：
 *   node tools/sync_version.mjs            # 检查，不一致就报错退出（用于 CI / 构建门禁）
 *   node tools/sync_version.mjs --write    # 以 VERSION + package.json 为准，统一改写
 *
 * 真相源：public-overrides/package.json 的 version 字段 + VERSION 文件前缀。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OVR = join(ROOT, 'public-overrides');
const WRITE = process.argv.includes('--write');

// ---- 真相源 ----
const pkg = JSON.parse(readFileSync(join(OVR, 'package.json'), 'utf8'));
const SEMVER = pkg.version;
const RELEASE = 'V' + SEMVER.replace(/\./g, '').padStart(6, '0');

/** 每个目标：文件 + 一组 [匹配旧值的正则, 生成新值的函数] */
const TARGETS = [
  {
    file: join(OVR, 'README.md'),
    rules: [
      [/version: V\d+ \(semver \d+\.\d+\.\d+\)/g, () => `version: ${RELEASE} (semver ${SEMVER})`],
      [/badge\/version-V\d+-blue/g, () => `badge/version-${RELEASE}-blue`],
      [/version= \{V\d+\}/g, () => `version= {${RELEASE}}`],
    ],
  },
  {
    file: join(OVR, 'llms.txt'),
    rules: [
      [/- \*\*Version\*\*: V\d+ \(semver \d+\.\d+\.\d+\)/g, () => `- **Version**: ${RELEASE} (semver ${SEMVER})`],
    ],
  },
  {
    file: join(OVR, 'server.json'),
    rules: [
      [/"version":\s*"\d+\.\d+\.\d+"/g, () => `"version": "${SEMVER}"`],
    ],
  },

  /* R97 root server.json —— 这个才是【发布到 npm】的那份。
   * 原来 TARGETS 只含 public-overrides/server.json，
   * 导致根 server.json 长期停在 0.2.0 而无人发现（L-02 只查了 overrides 那份）。
   * 教训：真相源同步链要覆盖【所有实际被消费的副本】。 */
  {
    file: join(ROOT, 'server.json'),
    rules: [
      [/"version":\s*"\d+\.\d+\.\d+"/g, () => `"version": "${SEMVER}"`],
    ],
  },
  {
    file: join(OVR, '发布清单.md'),
    rules: [
      [/上架清单（V\d+）/g, () => `上架清单（${RELEASE}）`],
      [/mackorn-cone-crusher-\d+\.\d+\.\d+\.tgz/g, () => `mackorn-cone-crusher-${SEMVER}.tgz`],
      [/plugin V\d+/g, () => `plugin ${RELEASE}`],
    ],
  },
  {
    file: join(ROOT, 'distribution', '官网落地页', 'index.html'),
    rules: [
      [/"softwareVersion":\s*"\d+\.\d+\.\d+"/g, () => `"softwareVersion": "${SEMVER}"`],
    ],
  },
  {
    file: join(ROOT, 'distribution', '官网落地页', '.well-known', 'mcp', 'server-card.json'),
    rules: [
      [/"version":\s*"\d+\.\d+\.\d+"/g, () => `"version": "${SEMVER}"`],
    ],
  },
];

let problems = 0;
let changed = 0;

for (const t of TARGETS) {
  if (!existsSync(t.file)) {
    console.log(`  [skip] ${t.file.replace(ROOT + '\\', '')} 不存在`);
    continue;
  }
  let text = readFileSync(t.file, 'utf8');
  const before = text;
  const found = [];

  for (const [re, make] of t.rules) {
    const matches = text.match(re);
    if (matches) {
      // 记录"改前 → 改后"，便于向用户交代
      const want = make();
      for (const m of matches) if (m !== want) found.push(`${m}  →  ${want}`);
    }
    text = text.replace(re, make);
  }

  const rel = t.file.replace(ROOT + '\\', '');
  if (text !== before) {
    if (WRITE) { writeFileSync(t.file, text, 'utf8'); changed++; console.log(`  [fixed] ${rel}`); }
    else { problems++; console.log(`  [STALE] ${rel}`); }
    for (const f of found) console.log(`      ${f}`);
  } else {
    console.log(`  [ok]    ${rel}`);
  }
}

console.log('');
console.log(`  真相源: ${RELEASE} (semver ${SEMVER})`);
if (WRITE) console.log(`  已同步 ${changed} 个文件`);
else if (problems) { console.log(`  ❌ ${problems} 个文件的版本号与真相源不一致（运行 node tools/sync_version.mjs --write 修复）`); process.exit(1); }
else console.log('  ✅ 所有公开文件版本号一致');
