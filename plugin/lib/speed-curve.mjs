/**
 * 转速敏感性曲线 —— 把模型对转速的响应摊开给用户看
 *
 * 为什么做这个（而不是去"改好"转速模型）：
 *   我们的转速处理是分类函数的线性乘子，而公开文献（Chalmers 2015）用的是
 *   无量纲压缩比 s/b。这是已知局限（已写进模型卡 L-SPEED）。
 *
 *   我手里【没有】能定标转速响应曲线的实测数据 —— 论文里那张
 *   "Capacity vs Eccentric speed" 图的数值在图表里，文本层抽不到。
 *
 *   所以诚实的做法不是"猜一个更好的形状"，而是：
 *   把当前模型的转速响应【完整画出来】，并明确标注：
 *     · 这是本模型的行为，不是厂商标定曲线
 *     · 哪一段可信（≤400 rpm，文献实测无堵料）
 *     · 哪一段是外推（>400 rpm 会堵料，已由护栏 GR-15 拦截）
 *   用户拿自己的现场经验一对，就知道该不该信。
 *
 * 复用 sim-adapter.crusherCurve —— 不重复实现，保证与单机工具口径完全一致。
 */
import { crusherCurve } from './sim-adapter.mjs';

/**
 * @param {object} base 基础工况（与 mackorn_crusher_curve 同参数名）
 * @param {number[]} speeds 要扫描的转速
 */
export function speedSensitivity(base = {}, speeds = [200, 250, 300, 350, 400, 450, 500]) {
  const baseSpeed = Number(base.speed_rpm) || 300;
  const rows = [];
  let baseP80 = null;

  for (const rpm of speeds) {
    let r = null;
    try { r = crusherCurve({ ...base, speed_rpm: rpm }); } catch { r = null; }
    const p80 = r && Number.isFinite(r.product_p80_mm) ? r.product_p80_mm : null;
    if (rpm === baseSpeed && p80 != null) baseP80 = p80;
    /* Bond 功耗字段是 w_kwh_per_t（见 simulate.mjs bondPower 的返回），
     * 早期写成 kwh_per_t 导致该列恒为空 —— 又一个"字段名靠猜"的例子。 */
    rows.push({ rpm, p80, reduction_ratio: r ? r.reduction_ratio : null, power_kwh_t: r && r.power ? r.power.w_kwh_per_t : null });
  }
  // 若基准转速不在扫描点里，补算一次用于归一化
  if (baseP80 == null) {
    try { const b = crusherCurve({ ...base, speed_rpm: baseSpeed }); baseP80 = b.product_p80_mm; }
    catch { baseP80 = rows.find((x) => x.p80 != null)?.p80 ?? null; }
  }
  for (const x of rows) x.p80_vs_base = baseP80 && x.p80 != null ? +(x.p80 / baseP80).toFixed(3) : null;

  const valid = rows.filter((x) => x.p80 != null);
  const first = valid[0], last = valid[valid.length - 1];
  const span = first && last && first.p80 ? +(((last.p80 - first.p80) / first.p80) * 100).toFixed(1) : null;
  const reliable = valid.filter((x) => x.rpm <= 400);
  const extrapolated = valid.filter((x) => x.rpm > 400);

  return {
    base_speed_rpm: baseSpeed,
    base_p80_mm: baseP80,
    rows,
    span_pct_across_range: span,
    reliable_range: reliable.length ? { from: reliable[0].rpm, to: reliable[reliable.length - 1].rpm, count: reliable.length } : null,
    extrapolated_range: extrapolated.length ? { from: extrapolated[0].rpm, to: extrapolated[extrapolated.length - 1].rpm, count: extrapolated.length } : null,
    /* ── 必须让用户看到的三条声明 ── */
    what_this_shows: '这是【本模型】对转速的响应 —— 用于对照你的现场经验，不是厂商标定曲线。',
    known_limitation: '本实现对转速的建模是【分类函数的线性乘子】；公开文献（Chalmers《Cone Crusher Performance》2015）用的是无量纲压缩比 s/b。'
      + '因此这条曲线的【形状本身未经实测标定】—— 它能告诉你「模型会怎么变」，不能告诉你「实际会怎么变」。',
    boundary: '公开文献实测：偏心转速 >400 rpm 且给料不受限时会发生堵料（packing）。'
      + '表中 >400 rpm 的行为属【外推】，相关工况已被运行时护栏 GR-15 拦截。',
    how_to_use: '把表里 300→350→400 rpm 段的变化幅度，与你现场调速后的实际产量变化对一下：'
      + '若量级接近，说明本模型转速响应在你的工况下可用；若差很多，说明该工况需要现场标定（mackorn_calibrate）。',
    source: '本模型（Whiten 1972 框架 + 线性转速乘子）；局限出处见 distribution/03_验证与基准/Chalmers模型知识提取.md',
  };
}

export default { speedSensitivity };
