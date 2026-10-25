# -*- coding: utf-8 -*-
"""
follow-up-list0001.1 Excel 生成器（R175 · openpyxl 版）

用户要求（2026-10-24）：
  「请编程列出来回顾清单 follow-up-list0001.1，
    所有 Ai、第三方平台，学习基地等 Ai 经常收录的地方清单，
    被收录的目录，和待收录的清单；
    备注上，已经收录，和待收录，及提高收录机会事项，
    汇总成 Excel 方便比 md 容易阅读，每天回顾，补充，完善，迭代，
    请编程写进迭代规则。」

Sheet:
  0-总览        统计 + 分类覆盖 + 图例
  1-全部平台    74 个平台（按分组排序，颜色区分）
  2-已收录      已通的平台 + 收录时间 + 版本
  3-待收录      ★ 核心：原因 + 提高机会怎么做
  4-被挡与外部  非我们能控的
  5-提高收录机会 ★ 核心：20 条具体动作（P0/P1/P2）
  6-每日回顾    每天填一行
  7-迭代规则    8 条写进系统
"""
import json
import os
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

ROOT = r"D:\DSH desktop\DSH destop工作区\MACKORN-DSH-Plugin"
OUT_DIR = os.path.join(ROOT, "follow-up")
OUT_XLSX = os.path.join(OUT_DIR, "follow-up-list0001.1.xlsx")
TODAY = datetime.now().strftime("%Y-%m-%d")

# ═══ 样式 ═══
THIN = Side(style="thin", color="D0D0D0")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

C_TITLE = "0B5CAB"
C_HEADER = "0B5CAB"
C_OK = "E8F5E9"
C_TODO = "FFF3E0"
C_WAIT = "E3F2FD"
C_PUB = "F3E5F5"
C_BLOCK = "FFEBEE"
C_EXT = "ECEFF1"
C_P0 = "FFCDD2"
C_P1 = "FFE0B2"
C_P2 = "F0F4C3"


def fill(hexcolor):
    return PatternFill("solid", fgColor=hexcolor)


def style(cell, bold=False, size=9, color="000000", bg=None, wrap=True, align="left", valign="top", border=True):
    cell.font = Font(bold=bold, size=size, color=color)
    cell.alignment = Alignment(wrap_text=wrap, horizontal=align, vertical=valign)
    if bg:
        cell.fill = fill(bg)
    if border:
        cell.border = BORDER


def load_json(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


STATUS_ZH = {
    "already-native": "✅ 原生支持", "usable-now": "✅ 现在可用",
    "listed": "✅ 已收录", "auto-listed": "✅ 自动镜像", "merged": "✅ 已合并",
    "reference": "📚 参考资料", "not-applicable": "⬜ 不适用",
    "pr-open": "🔵 PR 已开", "listed-but-unscored": "⚠️ 已收录未评分",
    "blocked-or-pending": "🚫 被挡/待抓", "not-listed": "❌ 未收录",
    "not-posted": "❌ 未发帖", "not-launched": "❌ 未发布", "not-featured": "❌ 未上榜",
    "not-accessible": "⛔ 接入不了", "not-having": "❌ 缺失", "unknown": "❓ 不清楚",
}


def status_group(st):
    if st in ("already-native", "usable-now", "listed", "auto-listed", "merged"):
        return "已通"
    if st == "pr-open":
        return "待合并"
    if st == "listed-but-unscored":
        return "需补动作"
    if st == "blocked-or-pending":
        return "被挡"
    if st in ("not-listed", "unknown", "not-having"):
        return "待收录"
    if st in ("not-posted", "not-launched", "not-featured"):
        return "待发布"
    if st == "not-accessible":
        return "外部阻塞"
    return "其他"


GROUP_BG = {
    "已通": C_OK, "需补动作": C_TODO, "待合并": C_WAIT, "待收录": C_TODO,
    "待发布": C_PUB, "被挡": C_BLOCK, "外部阻塞": C_EXT, "其他": None,
}

# ═══ 数据 ═══
dist = load_json("distribution-registry/registry.json") or {}
dirs = load_json("directory-registry/registry.json") or {}

probe_map = {}
for p in dirs.get("platforms", []):
    probe_map[p.get("id")] = {
        "last_checked": p.get("last_checked", ""),
        "blockers": p.get("blockers", []),
        "submit_method": p.get("submit_method", ""),
        "notes": p.get("notes", ""),
    }

rows = []
for cat in dist.get("categories", []):
    for p in cat.get("platforms", []):
        pid = p.get("id")
        st = p.get("status", "unknown")
        pr = probe_map.get(pid, {})
        rows.append({
            "分类": cat.get("name", ""), "平台": p.get("name", ""), "id": pid,
            "类型": p.get("type", ""), "URL": p.get("url", ""),
            "状态": st, "状态说明": STATUS_ZH.get(st, st), "分组": status_group(st),
            "可信度": p.get("confidence", ""),
            "收录时间": p.get("recorded_at") or pr.get("last_checked", ""),
            "收录版本": p.get("recorded_version", ""),
            "提交方式": p.get("submit_method") or p.get("how_to_use") or pr.get("submit_method", ""),
            "阻塞": " / ".join(p.get("blockers", []) or pr.get("blockers", [])),
            "提高机会": p.get("improvement", ""),
            "上次检查": pr.get("last_checked", ""),
            "备注": (p.get("note") or p.get("notes") or pr.get("notes") or "")[:200],
        })

GROUP_ORDER = {"已通": 0, "需补动作": 1, "待合并": 2, "待收录": 3, "待发布": 4, "被挡": 5, "外部阻塞": 6, "其他": 7}
rows.sort(key=lambda r: (GROUP_ORDER.get(r["分组"], 9), r["分类"], r["平台"]))

group_counts = {}
for r in rows:
    group_counts[r["分组"]] = group_counts.get(r["分组"], 0) + 1

# ═══ 提高收录机会事项 ═══
BOOST = [
    ("P0", "基础设施", "SSL 证书有效", "端点探测失败会让所有平台判定我们「死的」",
     "✅ 已完成（2026-10-24，剩 89 天）", "阿里云免费证书 / 宝塔 Let's Encrypt（自动续期）",
     "修复后 AI 目录收录 6→8 个，端点 0/5→5/5"),
    ("P0", "基础设施", "服务器 mcp.php 与本地版本一致", "AI 通过 HTTP 连我们时看到的是服务器版本。旧版=少工具",
     "✅ 已完成（2026-10-24，21→29 工具，v0.2.0→v0.2.2）", "每次版本升级后必须重传 api/mcp.php",
     "部署前 21 工具，部署后 29 工具（8 个工具差在整条价值链）"),
    ("P0", "基础设施", "llms.txt 可访问", "AI 抓取时的入口文件；404 = AI 找不到我们的索引",
     "✅ 已完成（2026-10-24，之前 404）", "部署 llms.txt 到 /ai/llms.txt",
     "部署前 404，部署后 HTTP 200 · 15820B"),
    ("P0", "Glama 专项", "做 containerized release",
     "Glama 的 Release 是【容器化构建】，不探测源站。不做=永远 cannot be deployed",
     "🔴 待做（三件套已备：Dockerfile/.dockerignore/glama.json）",
     "glama.ai/mcp/servers/.../admin/dockerfile → 配置留空 → Deploy → Make Release → 0.2.2",
     "官方文档：A Glama release is a containerized build"),
    ("P0", "awesome-mcp 专项", "PR 前先确保 Glama 评分已出",
     "punkpeye/awesome-mcp-servers 的合并前置条件就是 Glama 评分",
     "🔵 PR #15410 已开，卡在 Glama 评分",
     "先做 Glama containerized release → 评分出 → PR 补评论",
     "PR 最新评论：still showing as '?' and needs to be evaluated"),
    ("P0", "提交材料", "材料包里的数字必须与服务器实际一致",
     "写 29 工具但服务器只有 21 = 审核员实测发现不一致会拒",
     "✅ 已解决（2026-10-24 服务器已更新到 29 工具）",
     "每次提交前跑 node tools/verify_live_mcp.mjs 确认服务器真数字",
     "2026-10-24 实测服务器曾为 21 工具，与材料声明的 29 不符"),
    ("P0", "提交材料", "提交前先实测端点可用", "端点不可用时提交=白提交，还浪费审核资源",
     "✅ 已完成（2026-10-24 端点 5/5 可访问）", "node tools/cert_monitor.mjs 应显示 GREEN",
     "SSL 修好前 0/5，修好后 5/5"),
    ("P1", "工具描述", "工具描述含多语言触发词", "AI 客户端选工具时【只看 description】",
     "✅ 已完成（29/29 全部含触发词）", "每个工具描述开头写「Multilingual triggers / 多语言触发词: ...」",
     "brand_coverage --keywords 测出 135/136 词有工具对应"),
    ("P1", "工具描述", "工具描述写清适用边界", "AI 知道边界才不会误用；也提升描述信息量",
     "✅ 已完成（29/29）", "每个描述含「【适用边界】...」段落", "实测最短 436 字、最长 1576 字"),
    ("P1", "仓库信号", "根目录有 AGENTS.md", "Claude Code 等 AI 编程代理会自动加载它",
     "✅ 已完成（14.5KB · 7 章 + 29 工具速查 + 6 条输出规则）",
     "写触发条件 / 调用方式 / 输出规则 / 禁止事项", "AGENTS.md 品牌信息从 0/6 补到 6/6"),
    ("P1", "仓库信号", "GitHub topics 含 mcp-server", "mcp.so / PulseMCP / MCPServers.org 靠 topic 自动抓",
     "✅ 已完成（20 个 topic）", "GitHub 仓库 Settings → Topics", "mcp.so 需要 mcp-server topic 才会抓"),
    ("P1", "仓库信号", "server.json 符合 MCP Registry schema", "官方注册表是权重最高的目录",
     "✅ 已完成（5/5 条件满足）", "name 用 cn.mackorn/xxx，packages 声明 npm，version 与 npm 一致",
     "Official MCP Registry 已收录"),
    ("P1", "仓库信号", "skills/*/SKILL.md 有 frontmatter", "skills.sh 靠这个收录，73 个 AI 编程助手通过它装",
     "✅ 已完成（6 个技能全部有 name+description）", "每个 SKILL.md 开头写 frontmatter",
     "skills.sh 已收录"),
    ("P1", "Glama 专项", ".dockerignore 排除 knowledge/_refs（19.59MB）",
     "镜像从 20MB 降到 0.6MB，避免构建超限；且 _refs 含报价截图不能公开",
     "✅ 已完成", ".dockerignore 加 knowledge/_refs/ 和 knowledge/**/*.png",
     "移走 _refs 后 selftest 依然 36 通过 0 失败"),
    ("P1", "内容信号", "llms.txt 含品牌 + 触发规则 + 视频资产",
     "AI 抓取时的第一入口，信息密度决定被引用的概率",
     "✅ 已完成（21KB · 含 136 关键词 + 15 条视频事实）",
     "llms.txt 开头写品牌段（logo/联系人/地址），再写触发规则",
     "llms.txt 现已含「视频资产」段"),
    ("P1", "内容信号", "官网有视频页（/ai/videos/）", "视频里的真实型号/案例是外部目录给不了的信任凭证",
     "🟠 已建待部署（14.3KB，16 条抖音链接）",
     "部署 distribution/官网落地页/videos/index.html",
     "从 15 条抖音链接提取出 7 个真实型号 + 3 个真实案例 + 2 次展会"),
    ("P2", "社区", "先参与讨论 2 周再发自己的内容", "HN/Reddit 对纯推广零容忍，会被标记 spam",
     "❌ 未开始", "r/mcp、r/ClaudeAI 先回答问题，建立信誉再发", "通用社区规范"),
    ("P2", "社区", "内容必须是有真实技术价值的复盘", "社区识别营销内容的能力很强",
     "✅ 已备好 1 篇（T-003 可发现性四坑复盘，2400 字）",
     "写踩坑 + 根因 + 修法 + 可迁移教训", "traffic-registry/drafts/T-003-开发者社区-COMPLETE.md"),
    ("P2", "长期", "给 GitHub Release 打 DOI（Zenodo）",
     "有 DOI 的软件在学术引用里权重高，AI 训练数据里学术来源权重也高",
     "❌ 未做", "GitHub 仓库开启 Zenodo 集成 → 发 Release → 自动获 DOI", "Zenodo 官方支持"),
    ("P2", "长期", "推 Docker 镜像到 Docker Hub", "Glama 等平台可直接拉；也增加一个可发现入口",
     "❌ 未做", "docker build → docker push mackorn/mackorn-cone-crusher:0.2.2", "Dockerfile 已备好"),
]

RULES = [
    ("规则", "内容", "工具/命令", "门禁", "频率", "判据"),
    ("一、每日回顾", "每天跑一次 follow_up_list.py，填写「今日主要动作」与「明日计划」",
     "python tools/follow_up_list.py", "无（人工）", "每天", "Sheet 6 每天有一行新记录"),
    ("二、平台清单只增不减", "发现新平台必须立刻加进台账，不许只在对话里说",
     "node tools/distribution_registry.mjs --stats", "G26", "发现即加", "平台总数单调不减"),
    ("三、提交前必查服务器真状态", "提交材料声明的工具数必须与服务器实际一致",
     "node tools/verify_live_mcp.mjs", "无", "每次提交前", "服务器 tools/list 数量 = 材料声明数量"),
    ("四、提交前必查端点可用", "端点不可用时提交=白提交",
     "node tools/cert_monitor.mjs", "G21", "每次提交前", "端点 5/5 可访问 · SSL > 14 天"),
    ("五、收录后立刻记录时间与版本", "记录才能知道什么时候该更新",
     "node tools/distribution_registry.mjs --record --id <平台> --version <版本>", "无", "收录当次",
     "台账里有 recorded_at + recorded_version"),
    ("六、提高机会事项必须落盘", "每个待收录平台都要写清「怎么提高机会」",
     "本文件 --boost", "无", "每周更新", "Sheet 5 无空白「提高机会」列"),
    ("七、被挡平台条件变化时重查", "反爬会变；平台策略会变",
     "node tools/directory_checker.mjs --check", "G17", "每 3 天", "被挡平台的 HTTP 码有变化时更新状态"),
    ("八、每轮迭代的棘轮", "至少一个指标变好，不许有指标变差",
     "node tools/brand_coverage.mjs --check", "G23-G25", "每轮",
     "flow/keywords/brand 三项目前均需 100%"),
]

# ═══ 生成 ═══
os.makedirs(OUT_DIR, exist_ok=True)
wb = Workbook()

# ── Sheet 0：总览 ──
ws = wb.active
ws.title = "0-总览"
ws.merge_cells("A1:D1")
ws["A1"] = "MACKORN 美矿 · AI 收录回顾清单 follow-up-list0001.1"
style(ws["A1"], bold=True, size=16, color=C_TITLE, border=False)
ws.row_dimensions[1].height = 28

ws.merge_cells("A2:D2")
ws["A2"] = f"生成 {TODAY} · tools/follow_up_list.py 自动生成 · 每天回顾 → 补充 → 完善 → 迭代"
style(ws["A2"], size=10, color="666666", border=False)

r = 4
for i, h in enumerate(["统计项", "数量", "说明"]):
    c = ws.cell(row=r, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
r += 1
stats = [
    ("平台总数", len(rows), "全部已知的 AI 客户端 / 目录 / 包管理器 / 社区 / 行业门户"),
    ("✅ 已通", group_counts.get("已通", 0), "已收录或现在就能用"),
    ("🟠 待收录", group_counts.get("待收录", 0), "未收录，需提交或已被动待抓"),
    ("⚠️ 需补动作", group_counts.get("需补动作", 0), "已收录但缺关键动作（如 Glama 未做 release）"),
    ("🔵 待合并", group_counts.get("待合并", 0), "PR 已开，等合并"),
    ("🟣 待发布", group_counts.get("待发布", 0), "社区未发帖 / 未发布 / 未上榜"),
    ("🚫 被挡", group_counts.get("被挡", 0), "被反爬，无法自动验证"),
    ("⛔ 外部阻塞", group_counts.get("外部阻塞", 0), "需企业资质 / 审核，我们做不到"),
]
for name, n, desc in stats:
    style(ws.cell(row=r, column=1, value=name), size=9)
    style(ws.cell(row=r, column=2, value=n), size=9, align="center", valign="center")
    style(ws.cell(row=r, column=3, value=desc), size=9)
    r += 1

r += 1
for i, h in enumerate(["按分类", "总数", "已通", "覆盖率"]):
    c = ws.cell(row=r, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
r += 1
cat_stats = {}
for row in rows:
    c = row["分类"]
    cat_stats.setdefault(c, {"total": 0, "ok": 0})
    cat_stats[c]["total"] += 1
    if row["分组"] == "已通":
        cat_stats[c]["ok"] += 1
for c, v in sorted(cat_stats.items(), key=lambda x: -x[1]["total"]):
    style(ws.cell(row=r, column=1, value=c), size=9)
    style(ws.cell(row=r, column=2, value=v["total"]), size=9, align="center")
    style(ws.cell(row=r, column=3, value=v["ok"]), size=9, align="center")
    pct = round(v["ok"] / v["total"] * 100) if v["total"] else 0
    style(ws.cell(row=r, column=4, value=f"{pct}%"), size=9, align="center")
    r += 1

r += 1
c = ws.cell(row=r, column=1, value="颜色图例")
style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center")
r += 1
legend = [("绿 = 已通", C_OK), ("橙 = 待收录/需补动作", C_TODO), ("蓝 = 待合并", C_WAIT),
          ("紫 = 待发布", C_PUB), ("红 = 被挡", C_BLOCK), ("灰 = 外部阻塞", C_EXT)]
for label, bg in legend:
    style(ws.cell(row=r, column=1, value=label), size=9, bg=bg)
    r += 1

ws.column_dimensions["A"].width = 26
ws.column_dimensions["B"].width = 10
ws.column_dimensions["C"].width = 62
ws.column_dimensions["D"].width = 12

# ── Sheet 1：全部平台 ──
ws = wb.create_sheet("1-全部平台")
headers = ["分类", "平台", "id", "类型", "URL", "状态", "状态说明", "分组", "可信度",
           "收录时间", "收录版本", "提交方式", "阻塞", "提高机会", "上次检查", "备注"]
widths = [22, 26, 18, 16, 32, 16, 18, 10, 10, 11, 10, 28, 32, 38, 11, 38]
for i, h in enumerate(headers):
    c = ws.cell(row=1, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
    ws.column_dimensions[get_column_letter(i + 1)].width = widths[i]
ws.row_dimensions[1].height = 28
ws.freeze_panes = "A2"

r = 2
for row in rows:
    bg = GROUP_BG.get(row["分组"])
    vals = [row["分类"], row["平台"], row["id"], row["类型"], row["URL"], row["状态"], row["状态说明"],
            row["分组"], row["可信度"], row["收录时间"], row["收录版本"], row["提交方式"],
            row["阻塞"], row["提高机会"], row["上次检查"], row["备注"]]
    for i, v in enumerate(vals):
        c = ws.cell(row=r, column=i + 1, value=v)
        if i == 4 and v:
            c.hyperlink = v
            style(c, size=8, color=C_TITLE, bg=bg)
        else:
            style(c, size=8, bg=bg)
    r += 1
ws.auto_filter.ref = f"A1:P{r-1}"

# ── Sheet 2：已收录 ──
ws = wb.create_sheet("2-已收录")
listed = [x for x in rows if x["分组"] == "已通"]
headers2 = ["分类", "平台", "URL", "状态", "收录时间", "当时版本", "怎么收录的", "备注"]
widths2 = [24, 28, 36, 16, 12, 11, 32, 42]
for i, h in enumerate(headers2):
    c = ws.cell(row=1, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
    ws.column_dimensions[get_column_letter(i + 1)].width = widths2[i]
ws.row_dimensions[1].height = 28
ws.freeze_panes = "A2"
r = 2
for row in listed:
    vals = [row["分类"], row["平台"], row["URL"], row["状态说明"], row["收录时间"],
            row["收录版本"], row["提交方式"], row["备注"]]
    for i, v in enumerate(vals):
        c = ws.cell(row=r, column=i + 1, value=v)
        if i == 2 and v:
            c.hyperlink = v
            style(c, size=9, color=C_TITLE, bg=C_OK)
        else:
            style(c, size=9, bg=C_OK)
    r += 1

# ── Sheet 3：待收录（核心） ──
ws = wb.create_sheet("3-待收录")
todo = [x for x in rows if x["分组"] in ("待收录", "需补动作", "待合并", "待发布")]
headers3 = ["分类", "平台", "URL", "状态", "阻塞原因", "★ 提高收录机会怎么做", "提交方式", "备注"]
widths3 = [22, 26, 34, 18, 34, 50, 28, 36]
for i, h in enumerate(headers3):
    c = ws.cell(row=1, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
    ws.column_dimensions[get_column_letter(i + 1)].width = widths3[i]
ws.row_dimensions[1].height = 28
ws.freeze_panes = "A2"
r = 2
for row in todo:
    bg = GROUP_BG.get(row["分组"], C_TODO)
    vals = [row["分类"], row["平台"], row["URL"], row["状态说明"], row["阻塞"],
            row["提高机会"], row["提交方式"], row["备注"]]
    for i, v in enumerate(vals):
        c = ws.cell(row=r, column=i + 1, value=v)
        if i == 2 and v:
            c.hyperlink = v
            style(c, size=9, color=C_TITLE, bg=bg)
        elif i == 5:
            style(c, size=9, bg="FFE0B2", bold=True)  # 提高机会高亮
        else:
            style(c, size=9, bg=bg)
    r += 1

# ── Sheet 4：被挡与外部 ──
ws = wb.create_sheet("4-被挡与外部")
blocked = [x for x in rows if x["分组"] in ("被挡", "外部阻塞")]
headers4 = ["分类", "平台", "URL", "状态", "原因", "我们能做什么", "备注"]
widths4 = [22, 26, 34, 18, 38, 42, 38]
for i, h in enumerate(headers4):
    c = ws.cell(row=1, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
    ws.column_dimensions[get_column_letter(i + 1)].width = widths4[i]
ws.row_dimensions[1].height = 28
ws.freeze_panes = "A2"
r = 2
for row in blocked:
    bg = GROUP_BG.get(row["分组"])
    vals = [row["分类"], row["平台"], row["URL"], row["状态说明"], row["阻塞"], row["提高机会"], row["备注"]]
    for i, v in enumerate(vals):
        c = ws.cell(row=r, column=i + 1, value=v)
        if i == 2 and v:
            c.hyperlink = v
            style(c, size=9, color=C_TITLE, bg=bg)
        else:
            style(c, size=9, bg=bg)
    r += 1

# ── Sheet 5：提高收录机会（核心） ──
ws = wb.create_sheet("5-提高收录机会")
headers5 = ["优先级", "分类", "事项", "为什么重要", "状态", "怎么做", "实证依据"]
widths5 = [8, 14, 32, 40, 40, 44, 44]
for i, h in enumerate(headers5):
    c = ws.cell(row=1, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
    ws.column_dimensions[get_column_letter(i + 1)].width = widths5[i]
ws.row_dimensions[1].height = 28
ws.freeze_panes = "A2"
r = 2
PRI_BG = {"P0": C_P0, "P1": C_P1, "P2": C_P2}
for item in sorted(BOOST, key=lambda x: (x[0], x[1])):
    pri, cat, thing, why, state, how, evidence = item
    style(ws.cell(row=r, column=1, value=pri), bold=True, size=9, bg=PRI_BG.get(pri), align="center", valign="center")
    style(ws.cell(row=r, column=2, value=cat), size=9)
    style(ws.cell(row=r, column=3, value=thing), size=9, bold=True)
    style(ws.cell(row=r, column=4, value=why), size=9)
    style(ws.cell(row=r, column=5, value=state), size=9)
    style(ws.cell(row=r, column=6, value=how), size=9)
    style(ws.cell(row=r, column=7, value=evidence), size=9)
    r += 1

# ── Sheet 6：每日回顾 ──
ws = wb.create_sheet("6-每日回顾")
headers6 = ["日期", "平台总数", "已通", "待收录", "新收录", "失去收录", "今日主要动作", "明日计划", "备注"]
widths6 = [12, 10, 8, 10, 10, 11, 48, 48, 30]
for i, h in enumerate(headers6):
    c = ws.cell(row=1, column=i + 1, value=h)
    style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
    ws.column_dimensions[get_column_letter(i + 1)].width = widths6[i]
ws.row_dimensions[1].height = 28
ws.freeze_panes = "A2"
# 首行：今天基准
style(ws.cell(row=2, column=1, value=TODAY), size=9, align="center", bg=C_OK)
style(ws.cell(row=2, column=2, value=len(rows)), size=9, align="center", bg=C_OK)
style(ws.cell(row=2, column=3, value=group_counts.get("已通", 0)), size=9, align="center", bg=C_OK)
style(ws.cell(row=2, column=4, value=group_counts.get("待收录", 0)), size=9, align="center", bg=C_OK)
style(ws.cell(row=2, column=5, value=""), size=9, align="center", bg=C_OK)
style(ws.cell(row=2, column=6, value=""), size=9, align="center", bg=C_OK)
style(ws.cell(row=2, column=7, value="SSL 已修好(89天) · 服务器 mcp.php 更新到29工具 · llms.txt 部署完成 · 端点5/5"), size=9, bg=C_OK)
style(ws.cell(row=2, column=8, value="Glama containerized release · Claude Connectors 提交 · mcp.so/MCP-X/MCPList 提交"), size=9, bg=C_OK)
style(ws.cell(row=2, column=9, value="收录从6个→8个（SSL修复的直接收益）"), size=9, bg=C_OK)
ws.row_dimensions[2].height = 44
# 60 行空白
for i in range(3, 63):
    for j in range(1, len(headers6) + 1):
        style(ws.cell(row=i, column=j, value=""), size=9,
              align="center" if j <= 6 else "left")

# ── Sheet 7：迭代规则 ──
ws = wb.create_sheet("7-迭代规则")
ws.merge_cells("A1:F1")
ws["A1"] = "迭代规则（写进系统，不只是文档）"
style(ws["A1"], bold=True, size=14, color=C_TITLE, border=False)
ws.row_dimensions[1].height = 26
ws.merge_cells("A2:F2")
ws["A2"] = "本 Sheet 内容同时存在于 AGENTS.md §2.8 与 plugin/lib/data-brand-rules.mjs（可执行版本）"
style(ws["A2"], size=10, color="666666", border=False)

widths7 = [20, 44, 44, 10, 12, 40]
for i, w in enumerate(widths7):
    ws.column_dimensions[get_column_letter(i + 1)].width = w

r = 4
for idx, rec in enumerate(RULES):
    for j, v in enumerate(rec):
        c = ws.cell(row=r, column=j + 1, value=v)
        if idx == 0:
            style(c, bold=True, size=10, color="FFFFFF", bg=C_HEADER, align="center", valign="center")
        else:
            style(c, size=9, bg=C_OK if idx <= 8 else None)
    if idx == 0:
        ws.row_dimensions[r].height = 28
    r += 1

wb.save(OUT_XLSX)

print(f"  OK  Excel 已生成")
print(f"      路径: {OUT_XLSX}")
print(f"      大小: {os.path.getsize(OUT_XLSX) / 1024:.1f} KB")
print(f"")
print(f"  Sheet 明细:")
print(f"      0-总览             {len(rows)} 个平台统计")
print(f"      1-全部平台         {len(rows)} 行（含颜色分组）")
print(f"      2-已收录           {len(listed)} 个")
print(f"      3-待收录           {len(todo)} 个（★ 含提高机会）")
print(f"      4-被挡与外部       {len(blocked)} 个")
print(f"      5-提高收录机会     {len(BOOST)} 条（P0/P1/P2）")
print(f"      6-每日回顾         60 行待填")
print(f"      7-迭代规则         8 条")
print(f"")
print(f"  分组统计:")
for g in ["已通", "需补动作", "待合并", "待收录", "待发布", "被挡", "外部阻塞", "其他"]:
    if group_counts.get(g):
        print(f"      {g}: {group_counts[g]}")
