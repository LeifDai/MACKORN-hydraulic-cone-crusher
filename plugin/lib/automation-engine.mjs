/**
 * 自动化方案推荐引擎（R112 · P5）
 *
 * 回答：给定工序 + 规模 + 现状，该配几层自动化、哪些仪表、哪些回路、
 *       是否具备上先进控制（L3）的条件。
 *
 * 数据纪律：继承 D1-D5。未知返回 null，不编造。
 *
 * ⚠️ 诚实边界：不含 PLC/DCS 品牌组态、不含 PID 整定值（必须现场调试）、
 *    不含仪表型号量程、不含电气单线图、不含报价。
 */
import {
  AUTOMATION_LAYERS, CONTROL_LOOPS, INSTRUMENTS, ADVANCED_CONTROL_READINESS, DRIVE_NOTES, AUTOMATION_GAPS,
} from './data-automation.mjs';
import { DATA_DISCIPLINE } from './data-valuechain.mjs';

const SRC = { S3: '公开文献', S5: '设计手册', S6: '设计规范', S4: '现场经验' };
const A = (assumption, source) => ({ assumption, source, source_name: SRC[source] || source });

/**
 * 推荐自动化方案
 * @param {object} input
 * @param {string} [input.section]      工序（破碎/磨矿/选矿/全部）
 * @param {number} [input.targetTph]    处理量 t/h
 * @param {boolean} [input.hasPlc]      是否已有 PLC
 * @param {boolean} [input.hasScada]    是否已有 SCADA/DCS
 * @param {boolean} [input.hasOnlineAnalyzer] 是否有在线品位/粒度分析
 * @param {boolean} [input.hasDedicatedStaff] 是否有专职维护人员
 */
export function recommendAutomation(input = {}) {
  const section = input.section && input.section !== '全部' ? String(input.section) : null;
  const targetTph = Number.isFinite(Number(input.targetTph)) ? Number(input.targetTph) : null;
  const hasPlc = input.hasPlc === true;
  const hasScada = input.hasScada === true;
  const hasOnline = input.hasOnlineAnalyzer === true;
  const hasStaff = input.hasDedicatedStaff === true;

  const assumptions = [
    A('自动化分层与控制回路取自设计规范与手册（S6/S5），非特定厂商方案', 'S6'),
    A('本引擎【不含】品牌组态、PID 整定值、仪表型号、电气单线图', 'S6'),
  ];
  const warnings = [];
  const rejections = [];

  /* ── ① 输入不足 ── */
  if (!section && targetTph === null) {
    return {
      request: { section, targetTph, hasPlc, hasScada, hasOnline, hasStaff },
      error: 'insufficient_input',
      message: '至少需要 section（工序）或 targetTph（处理量），否则无法判断自动化范围',
      recommended_layers: [],
      assumptions: [],
      warnings: ['输入不足：既没给工序也没给处理量。自动化范围高度依赖这两项，不能猜。'],
      basis: 'NO_CALCULATION',
    };
  }

  /* ── ② 按规模推荐层级 ── */
  const layers = [];
  if (targetTph !== null) {
    if (targetTph >= 5000) {
      layers.push({ level: 'L1', recommend: '必须', reason: '大型矿山（≥5000 t/h）无人化是基本要求，PLC 是底线' });
      layers.push({ level: 'L2', recommend: '必须', reason: '中控室集中监控是大型项目标配' });
      layers.push({ level: 'L3', recommend: '建议', reason: '规模够大，先进控制投资回收期较短' });
    } else if (targetTph >= 500) {
      layers.push({ level: 'L1', recommend: '必须', reason: '中型项目必须 PLC 做联锁与启停' });
      layers.push({ level: 'L2', recommend: '建议', reason: 'SCADA 便于少人值守' });
      layers.push({ level: 'L3', recommend: '视条件', reason: '需评估投资回收期与维护能力' });
    } else {
      layers.push({ level: 'L1', recommend: '必须', reason: '即使小型项目，安全联锁也必须硬线 + PLC' });
      layers.push({ level: 'L2', recommend: '可选', reason: '小型项目可用触摸屏 HMI 替代 SCADA' });
      layers.push({ level: 'L3', recommend: '不建议', reason: '规模太小，先进控制投资无法回收' });
    }
  }

  /* ── ③ 先决条件检查（负控：没基础不要上 L3）── */
  const readiness = ADVANCED_CONTROL_READINESS.map((r) => ({ ...r, met: null }));
  if (!hasPlc) {
    warnings.push('★ 尚无 PLC（L1）—— 绝不能直接上先进控制（L3）。必须先完成基础自动化，否则是在沙地上盖楼');
    rejections.push({ rule: '缺少 L1 基础自动化', action: '先做 PLC + 联锁，6 个月稳定后再考虑 L3' });
  }
  if (!hasScada) {
    warnings.push('尚无 SCADA/DCS（L2）—— L3 需要历史数据与中控，建议先补 L2');
  }
  if (!hasOnline) {
    warnings.push('无在线品位/粒度分析 —— L3 的模型预测缺少关键输入。只能做软测量（精度差很多），' +
      '或先上在线分析仪表');
  }
  if (!hasStaff) {
    warnings.push('★ 无专职维护人员 —— 先进控制不是"装完就好"，模型会漂移需持续维护。' +
      '没人维护的 MPC 通常 6-12 个月后失效');
    rejections.push({ rule: '无专职维护人员', action: '不建议上 L3；先培养工艺+自动化复合人员' });
  }

  /* ── ④ 按工序给仪表清单 ── */
  const instruments = {};
  const sections = section ? [section] : ['破碎', '磨矿', '选矿'];
  for (const s of sections) {
    if (INSTRUMENTS[s]) {
      instruments[s] = INSTRUMENTS[s].map((i) => ({
        ...i,
        note: i.critical ? '★ 关键仪表（缺了会直接影响安全或控制）' : '建议仪表（用于优化）',
      }));
    }
  }

  /* ── ⑤ 控制回路（按工序筛）── */
  const loopMap = { 破碎: ['CL-01', 'CL-02', 'CL-06'], 磨矿: ['CL-03', 'CL-04', 'CL-05'], 选矿: [] };
  const relevantLoops = section
    ? CONTROL_LOOPS.filter((l) => (loopMap[section] || []).includes(l.id) || l.id === 'CL-06')
    : CONTROL_LOOPS;

  /* ── ⑥ 电气驱动要点（总要提醒）── */
  const drives = DRIVE_NOTES.map((d) => ({ ...d }));

  return {
    request: { section, targetTph, hasPlc, hasScada, hasOnline, hasStaff },
    recommended_layers: layers,
    layer_catalog: AUTOMATION_LAYERS.map((l) => ({ level: l.level, name: l.name, scope: l.scope, typical: l.typical, notes: l.notes })),
    instruments,
    control_loops: relevantLoops,
    drive_notes: drives,
    advanced_control_readiness: readiness,
    advanced_control_verdict: (() => {
      const blocks = [];
      if (!hasPlc) blocks.push('无 L1 基础自动化');
      if (!hasScada) blocks.push('无 L2 中控');
      if (!hasOnline) blocks.push('无在线分析仪表');
      if (!hasStaff) blocks.push('无专职维护人员');
      if (blocks.length === 0) return { go: true, reason: '四项前提均满足，可评估上 L3' };
      return { go: false, reason: '暂不具备上先进控制（L3）的条件：' + blocks.join('、') };
    })(),
    rejections,
    known_gaps: AUTOMATION_GAPS,
    data_discipline: DATA_DISCIPLINE.map((d) => d.rule),
    assumptions,
    warnings: [...warnings, '本工具为 P5 首版：分层架构与仪表清单可信，但【不含品牌组态、PID 整定值、仪表型号、电气单线图】，' +
      '正式设计须由有资质的设计院出图 + 现场调试'],
    basis: 'S6 设计规范 + S5 设计手册典型做法；非特定厂商方案',
  };
}

/** 自动化知识目录 */
export function automationCatalog() {
  return {
    layers: AUTOMATION_LAYERS,
    control_loops: CONTROL_LOOPS,
    instruments_by_section: INSTRUMENTS,
    advanced_control_readiness: ADVANCED_CONTROL_READINESS,
    drive_notes: DRIVE_NOTES,
    known_gaps: AUTOMATION_GAPS,
    basis: 'S6 设计规范 + S5 设计手册',
  };
}
