import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL('D:/DSH desktop/DSH destop工作区/MACKORN-DSH-Plugin/plugin/lib/intake.mjs').href);
const p = process.argv[2];
const t = readFileSync(p, 'utf8');

const line = t.split('\n').find((l) => l.includes('除土需求')) ?? '(未找到 除土需求 行)';
console.log('原文行:', JSON.stringify(line));
console.log('码点  :', [...line].map((c) => `${c}=U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' '));
console.log('');

const CHECKED = '[☑■√✔✓☒×]';
const yes = new RegExp(`${CHECKED}\\s*是|是\\s*${CHECKED}`).test(t);
const no = new RegExp(`${CHECKED}\\s*否|否\\s*${CHECKED}`).test(t);
console.log('yes =', yes, ' no =', no);

const cleaned = mod.stripBoilerplate(t);
console.log('stripBoilerplate 后是否仍含该行:', cleaned.includes('除土需求'));
console.log('stripUncheckedOptions 后:', JSON.stringify(mod.stripUncheckedOptions(cleaned).split('\n').find((l) => l.includes('除土需求')) ?? '整行被删'));

const parsed = mod.parseFormText(t);
console.log('\nparsed.soil_removal_needed =', parsed.soil_removal_needed);
console.log('parsed.soil_level          =', parsed.soil_level);
console.log('parsed.production_method   =', parsed.production_method);
console.log('parsed.ore_source          =', parsed.ore_source);
console.log('parsed.scope               =', parsed.scope);
console.log('parsed.belt_type           =', parsed.belt_type);
console.log('parsed.electrical_origin   =', parsed.electrical_origin);
console.log('parsed.storage_type        =', parsed.storage_type);
console.log('parsed.days_per_year       =', parsed.days_per_year);
console.log('parsed.hours_per_day       =', parsed.hours_per_day);
console.log('parsed.dust_limit_mgm3     =', parsed.dust_limit_mgm3);

const r = mod.intakeRequirement({ capacity_tph: 600, form_text: t });
console.log('\nintake.flags =', JSON.stringify(r.normalized.flags));
