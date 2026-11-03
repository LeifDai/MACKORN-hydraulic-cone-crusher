#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
MACKORN 插件项目 · 认知力引擎（R204）

用户要求（2026-11-02 21:48）：
  「每天提升认知力，请编程，到明天早上7点」

══════════════════════════════════════════════════════════════
为什么要重写（用户给的初版）

用户给的 mackorn_cognition.py 扫描的是【外贸项目】的文件：
  gate-chain.py / mx_gate.py / email_lint.py / relay.php
  campaign_26 / 发25封测试信 / 废纸篓552封 / NH890-Technical-Data-Sheet.pdf
这些在本项目（MACKORN-DSH-Plugin）里一个都不存在。
→ 跑出来的分数是假的（分母全是 0）。

而且它把 adopted/rejected/unexplored 三类状态【硬编码在代码里】，
等于「我以为的教训」而不是「项目真实沉淀的教训」。
→ 违反了「不硬编码、要真扫描」的要求。

本版全部改成【真扫描本项目】：
  C1 记录率  ← 扫 distribution/*.md 里的「教训/根因/踩坑/实测」
  C2 否定率  ← 读 cognition-data/cognition.json 的 refutations 条数
  C3 迁移率  ← 扫 tools/ 里真有几种门禁/校验器
  C4 复用率  ← 扫关键资产（ai-pack / listing-data / 部署树）是否齐
  C5 落地率  ← 读 listing-data/latest.json 的真实收录数

权威状态表也从【真实文件】里抽，不硬编码。

用法：
  python tools/mackorn_cognition.py             # 跑一遍出报告
  python tools/mackorn_cognition.py --json      # 只出 JSON
  python tools/mackorn_cognition.py --check     # 门禁：低于阈值 exit 1
"""
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "distribution" / "03_验证与基准"
REPORT_MD = OUT_DIR / "MACKORN_COGNITION_REPORT.md"
SCORES_JSON = OUT_DIR / "mackorn-cognition-scores.json"

TODAY = datetime.now().strftime("%Y-%m-%d")
NOW = datetime.now().strftime("%Y-%m-%d %H:%M")

# 阈值（低于即门禁失败）
THRESHOLDS = {"total": 60.0, "c2": 30.0, "c5": 20.0}


# ══════════════════════════════════════════════════════════════
# 工具
# ══════════════════════════════════════════════════════════════
def read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def read_json(p: Path):
    try:
        return json.loads(read_text(p))
    except Exception:
        return None


def scan_md(directory: Path, keywords):
    """扫目录下所有 .md，统计关键词命中次数与命中文件数"""
    hits = 0
    files = 0
    if not directory.exists():
        return 0, 0
    for f in list(directory.rglob("*.md"))[:200]:
        c = read_text(f)
        local = 0
        for kw in keywords:
            local += c.count(kw)
        if local:
            files += 1
            hits += local
    return hits, files


# ══════════════════════════════════════════════════════════════
# C1 记录率：项目里有没有把「踩坑/根因/实测」写下来
# ══════════════════════════════════════════════════════════════
def evaluate_c1():
    kws = ["根因", "教训", "踩坑", "实测", "假阳性", "推翻", "错在"]
    hits, files = scan_md(ROOT / "distribution", kws)
    # 也扫交接文档
    hits2, files2 = scan_md(ROOT, ["根因", "教训", "实测"])
    total_hits = hits + hits2
    total_files = files + files2
    # 20 处记录 = 100 分（经验值：一天能有 20 处沉淀已经很扎实）
    score = min(100.0, total_hits * 5.0)
    return score, f"{total_hits} 处教训/根因记录（分布在 {total_files} 个文件）"


# ══════════════════════════════════════════════════════════════
# C2 否定率：主动推翻过自己多少次
# ══════════════════════════════════════════════════════════════
def evaluate_c2():
    cj = read_json(ROOT / "cognition-data" / "cognition.json")
    refs = 0
    if cj:
        if isinstance(cj.get("refutations"), list):
            refs = len(cj["refutations"])
        elif isinstance(cj.get("refutations"), int):
            refs = cj["refutations"]
        elif isinstance(cj.get("records"), list):
            refs = len(cj["records"])
    # 30 条推翻 = 100 分（否定率高才是真的在验证）
    score = min(100.0, refs / 30.0 * 100.0)
    # 附：今天的条数
    today_count = 0
    if cj and isinstance(cj.get("refutations"), list):
        for r in cj["refutations"]:
            at = str(r.get("at", ""))
            if at.startswith(TODAY):
                today_count += 1
    return score, f"累计 {refs} 条自我推翻（今日 {today_count} 条）"


# ══════════════════════════════════════════════════════════════
# C3 迁移率：教训有没有变成可执行的校验器/门禁
# ══════════════════════════════════════════════════════════════
def evaluate_c3():
    tools = ROOT / "tools"
    if not tools.exists():
        return 0.0, "tools/ 目录不存在"

    # 真扫描：这些名字代表「把教训固化成程序」
    gate_patterns = [
        (r"check_publish_artifact", "发布产物门禁"),
        (r"syntax_gate", "语法闸门"),
        (r"enforce_lessons", "教训门禁"),
        (r"brand_coverage", "品牌规则"),
        (r"verify_ai_pack", "AI 包验证器"),
        (r"listing_engine", "收录引擎"),
        (r"cognition", "认知门禁"),
        (r"recurrence", "复现率追踪"),
    ]
    all_tools = [f.name for f in tools.glob("*.mjs")] + [f.name for f in tools.glob("*.py")]
    found = []
    for pat, label in gate_patterns:
        hit = [t for t in all_tools if re.search(pat, t)]
        if hit:
            found.append((label, hit[0]))

    score = len(found) / len(gate_patterns) * 100.0
    detail = "落地 %d/%d 类门禁：" % (len(found), len(gate_patterns))
    detail += "、".join(x[0] for x in found) if found else "无"
    return score, detail


# ══════════════════════════════════════════════════════════════
# C4 复用率：关键资产是否齐备（能被重复使用的东西）
# ══════════════════════════════════════════════════════════════
def evaluate_c4():
    checks = [
        (ROOT / "ai-pack" / "openapi.json", "OpenAPI 3.0 规范"),
        (ROOT / "ai-pack" / "tools-openai.json", "OpenAI Function Calling"),
        (ROOT / "ai-pack" / "tools-anthropic.json", "Anthropic tool_use"),
        (ROOT / "ai-pack" / "platform-snippets.md", "平台接入片段"),
        (ROOT / "distribution" / "官网落地页" / "api" / "ai_execute.php", "REST 执行层"),
        (ROOT / "distribution" / "官网落地页" / "api" / "mcp.php", "MCP 端点"),
        (ROOT / "listing-data" / "latest.json", "收录台账"),
        (ROOT / "distribution" / "官网落地页" / "ai.txt", "ai.txt 实体索引"),
        (ROOT / "distribution" / "官网落地页" / "llms.txt", "llms.txt"),
        (ROOT / "skills", "Agent Skills 目录"),
    ]
    found = [(label, p.exists()) for p, label in checks]
    ok = sum(1 for _, e in found if e)
    score = ok / len(found) * 100.0
    missing = [l for l, e in found if not e]
    detail = "资产就绪 %d/%d" % (ok, len(found))
    if missing:
        detail += "；缺：" + "、".join(missing[:3])
    return score, detail


# ══════════════════════════════════════════════════════════════
# C5 落地率：真实收录状态（不是「文件在不在」，是「真被收录了几个」）
# ══════════════════════════════════════════════════════════════
def evaluate_c5():
    latest = read_json(ROOT / "listing-data" / "latest.json")
    if not latest:
        return 0.0, "无收录台账（先跑 node tools/listing_engine.mjs）"

    totals = latest.get("totals", {})
    listed = totals.get("listed", 0)
    ready = totals.get("ready", 0)
    missing = totals.get("missing", 0)
    total = totals.get("platforms", 0) or 1

    # 收录占比为主（60）+ 就绪占比为辅（40）
    score = (listed / total) * 60.0 + (ready / total) * 40.0
    detail = "已收录 %d · 就绪 %d · 缺条件 %d（共 %d 平台）" % (listed, ready, missing, total)
    return score, detail


# ══════════════════════════════════════════════════════════════
# 权威状态表：从真实文件里抽（不硬编码）
# ══════════════════════════════════════════════════════════════
def build_authority_table():
    adopted, rejected, unexplored = [], [], []

    # ── 已采纳：从交接文档的「已修/已完成/实证」段抽 ──
    for f in sorted((ROOT / "distribution").glob("*交接*.md"), reverse=True)[:3]:
        c = read_text(f)
        for line in c.split("\n"):
            s = line.strip()
            if not s or len(s) < 12 or len(s) > 90:
                continue
            if re.match(r"^[-*]\s*(✅|✔)", s):
                txt = re.sub(r"^[-*]\s*(✅|✔)\s*", "", s)
                if txt and txt not in adopted:
                    adopted.append(txt)

    # ── 已否决：从认知台账的 refutations 里抽「现在实际情况」 ──
    cj = read_json(ROOT / "cognition-data" / "cognition.json")
    if cj and isinstance(cj.get("refutations"), list):
        for r in cj["refutations"][-15:]:
            now = str(r.get("now") or r.get("new") or "").strip()
            if 10 < len(now) < 200:
                rejected.append("❌ " + now)

    # ── 未探索：从债清单/未完成里抽 ──
    latest = read_json(ROOT / "listing-data" / "latest.json")
    if latest:
        for p in latest.get("platforms", []):
            if p.get("status") == "missing":
                bad = [c["desc"] for c in p.get("conditions", []) if not c.get("pass")]
                if bad:
                    unexplored.append("%s：缺 %s" % (p.get("name", "?"), "；".join(bad[:2])))

    return adopted[:12], rejected[:10], unexplored[:8]


# ══════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════
def main():
    only_json = "--json" in sys.argv
    check_mode = "--check" in sys.argv

    c1, r1 = evaluate_c1()
    c2, r2 = evaluate_c2()
    c3, r3 = evaluate_c3()
    c4, r4 = evaluate_c4()
    c5, r5 = evaluate_c5()

    total = round((c1 + c2 + c3 + c4 + c5) / 5.0, 1)
    adopted, rejected, unexplored = build_authority_table()

    data = {
        "schema": "mackorn-cognition-engine/1",
        "date": TODAY,
        "at": NOW,
        "total": total,
        "dims": {
            "C1_记录率": {"score": round(c1, 1), "detail": r1},
            "C2_否定率": {"score": round(c2, 1), "detail": r2},
            "C3_迁移率": {"score": round(c3, 1), "detail": r3},
            "C4_复用率": {"score": round(c4, 1), "detail": r4},
            "C5_落地率": {"score": round(c5, 1), "detail": r5},
        },
        "authority": {"adopted": adopted, "rejected": rejected, "unexplored": unexplored},
        "thresholds": THRESHOLDS,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SCORES_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")

    if only_json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print()
        print("  ══ MACKORN 插件 · 认知力引擎 ══")
        print("  %s" % NOW)
        print()
        print("  ── 五维打分 ──")
        for k, v in data["dims"].items():
            bar = "█" * int(v["score"] / 5) + "░" * (20 - int(v["score"] / 5))
            print("  %-10s %5.1f  %s" % (k, v["score"], bar))
            print("             %s" % v["detail"])
        print()
        print("  ── 综合得分：%.1f / 100 ──" % total)
        if total >= 80:
            print("  🟢 认知健康（记录/否定/迁移/复用/落地 都扎实）")
        elif total >= 60:
            print("  🟡 及格（有短板，看下面哪一维最低）")
        else:
            print("  🔴 不健康（先补最低的那一维）")
        print()

        print("  ── 权威状态表（从真实文件抽取，未硬编码）──")
        print()
        print("  ✅ 已采纳（%d 条）" % len(adopted))
        for x in adopted[:6]:
            print("     · %s" % x[:80])
        print()
        print("  ❌ 已否决（%d 条）" % len(rejected))
        for x in rejected[:6]:
            print("     · %s" % x[:80])
        print()
        print("  🔵 未探索/缺条件（%d 条）" % len(unexplored))
        for x in unexplored[:6]:
            print("     · %s" % x[:80])
        print()
        print("  报告：%s" % REPORT_MD.relative_to(ROOT))
        print("  JSON：%s" % SCORES_JSON.relative_to(ROOT))
        print()

        # Markdown 报告
        md = ["# 🧠 MACKORN 插件 · 认知力日报 %s" % TODAY, ""]
        md.append("> 生成 %s · 全部由真实文件扫描得出，无硬编码" % NOW)
        md.append("")
        md.append("## 一、五维打分（综合 %.1f / 100）" % total)
        md.append("")
        md.append("| 维度 | 得分 | 说明 |")
        md.append("|:---|:---:|:---|")
        for k, v in data["dims"].items():
            md.append("| **%s** | %.1f | %s |" % (k, v["score"], v["detail"]))
        md.append("")
        md.append("## 二、权威状态表")
        md.append("")
        md.append("### ✅ 已采纳（必须坚持）")
        md.append("")
        for x in adopted:
            md.append("- %s" % x)
        if not adopted:
            md.append("- （无）")
        md.append("")
        md.append("### ❌ 已否决（绝不重复踩坑）")
        md.append("")
        for x in rejected:
            md.append("- %s" % x)
        if not rejected:
            md.append("- （无）")
        md.append("")
        md.append("### 🔵 未探索 / 缺条件")
        md.append("")
        for x in unexplored:
            md.append("- %s" % x)
        if not unexplored:
            md.append("- （无）")
        md.append("")
        md.append("---")
        md.append("")
        md.append("*本报告由 `tools/mackorn_cognition.py` 生成 · 每天重跑一次*")
        REPORT_MD.write_text("\n".join(md), "utf-8")

    if check_mode:
        fails = []
        if total < THRESHOLDS["total"]:
            fails.append("综合 %.1f < %.0f" % (total, THRESHOLDS["total"]))
        if c2 < THRESHOLDS["c2"]:
            fails.append("C2 否定率 %.1f < %.0f" % (c2, THRESHOLDS["c2"]))
        if c5 < THRESHOLDS["c5"]:
            fails.append("C5 落地率 %.1f < %.0f" % (c5, THRESHOLDS["c5"]))
        if fails:
            print("  ❌ 认知门禁失败：" + "；".join(fails))
            sys.exit(1)
        print("  ✅ 认知门禁通过（综合 %.1f ≥ %.0f）" % (total, THRESHOLDS["total"]))

    sys.exit(0)


if __name__ == "__main__":
    main()
