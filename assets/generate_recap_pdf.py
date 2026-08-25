#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "02_复盘总结" / "导出PDF" / "AI产品经理转型学习项目-关键共识与双轨计划-v1.pdf"
HERO = ROOT / "assets" / "dual-track-journey.png"

PAPER = colors.HexColor("#F7F6F1")
WHITE = colors.HexColor("#FFFFFF")
INK = colors.HexColor("#16212B")
INK_SOFT = colors.HexColor("#46535F")
MUTED = colors.HexColor("#5F6A72")
LINE = colors.HexColor("#D8DDD9")
COBALT = colors.HexColor("#315BD6")
COBALT_DARK = colors.HexColor("#2345AA")
TEAL = colors.HexColor("#167C77")
TEAL_LIGHT = colors.HexColor("#DDECEA")
AMBER = colors.HexColor("#B56C14")
AMBER_LIGHT = colors.HexColor("#FFF3DD")
RED = colors.HexColor("#AD3E38")
RED_LIGHT = colors.HexColor("#FBEAE7")


def register_fonts() -> None:
    font_path = "/System/Library/Fonts/Supplemental/Songti.ttc"
    pdfmetrics.registerFont(TTFont("AIPMBody", font_path, subfontIndex=3))
    pdfmetrics.registerFont(TTFont("AIPMBold", font_path, subfontIndex=1))
    pdfmetrics.registerFontFamily("AIPM", normal="AIPMBody", bold="AIPMBold")


register_fonts()

styles = getSampleStyleSheet()
BODY = ParagraphStyle(
    "BodyCN",
    parent=styles["BodyText"],
    fontName="AIPMBody",
    fontSize=9.4,
    leading=15,
    textColor=INK_SOFT,
    wordWrap="CJK",
    spaceAfter=5,
)
BODY_SMALL = ParagraphStyle(
    "BodySmallCN",
    parent=BODY,
    fontSize=8.1,
    leading=12.4,
    spaceAfter=2,
)
BODY_TINY = ParagraphStyle(
    "BodyTinyCN",
    parent=BODY,
    fontSize=7.2,
    leading=10.2,
    spaceAfter=1,
)
BOLD = ParagraphStyle(
    "BoldCN",
    parent=BODY,
    fontName="AIPMBold",
    textColor=INK,
)
TITLE = ParagraphStyle(
    "TitleCN",
    parent=BODY,
    fontName="AIPMBold",
    fontSize=30,
    leading=39,
    textColor=INK,
    alignment=TA_LEFT,
    spaceAfter=10,
)
SUBTITLE = ParagraphStyle(
    "SubtitleCN",
    parent=BODY,
    fontSize=12,
    leading=19,
    textColor=INK_SOFT,
    spaceAfter=8,
)
KICKER = ParagraphStyle(
    "KickerCN",
    parent=BODY,
    fontName="AIPMBold",
    fontSize=7.7,
    leading=10,
    textColor=TEAL,
    tracking=1.1,
    spaceAfter=7,
)
H1 = ParagraphStyle(
    "H1CN",
    parent=BODY,
    fontName="AIPMBold",
    fontSize=21,
    leading=28,
    textColor=INK,
    spaceAfter=9,
)
H2 = ParagraphStyle(
    "H2CN",
    parent=BODY,
    fontName="AIPMBold",
    fontSize=12.5,
    leading=18,
    textColor=INK,
    spaceBefore=5,
    spaceAfter=5,
)
H3 = ParagraphStyle(
    "H3CN",
    parent=BODY,
    fontName="AIPMBold",
    fontSize=9.5,
    leading=14,
    textColor=INK,
    spaceAfter=2,
)
QUOTE = ParagraphStyle(
    "QuoteCN",
    parent=BODY,
    fontName="AIPMBold",
    fontSize=14.5,
    leading=23,
    leftIndent=4 * mm,
    borderColor=COBALT,
    borderWidth=0,
    borderPadding=0,
    textColor=INK,
)
CENTER = ParagraphStyle(
    "CenterCN",
    parent=BODY,
    alignment=TA_CENTER,
)
WHITE_BODY = ParagraphStyle(
    "WhiteBodyCN",
    parent=BODY,
    textColor=colors.HexColor("#EAF0F1"),
)
WHITE_H = ParagraphStyle(
    "WhiteHCN",
    parent=H2,
    textColor=WHITE,
)
WHITE_CENTER = ParagraphStyle(
    "WhiteCenterCN",
    parent=BODY_TINY,
    fontName="AIPMBold",
    textColor=WHITE,
    alignment=TA_CENTER,
)
WHITE_H3 = ParagraphStyle(
    "WhiteH3CN",
    parent=H3,
    textColor=WHITE,
)


def P(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(f"<bullet>&bull;</bullet>{text}", style)


def section_header(kicker: str, title: str, subtitle: str | None = None):
    items = [P(kicker.upper(), KICKER), P(title, H1)]
    if subtitle:
        items.append(P(subtitle, BODY))
    items.append(Spacer(1, 4 * mm))
    return items


def band(title: str, body: str, background=TEAL_LIGHT, accent=TEAL):
    content = [[P(title, H2), P(body, BODY)]]
    table = Table(content, colWidths=[48 * mm, 116 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.6, accent),
                ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def small_label(text: str, background=INK):
    style = ParagraphStyle(
        f"label-{text}",
        parent=BODY_TINY,
        fontName="AIPMBold",
        textColor=WHITE,
        alignment=TA_CENTER,
    )
    table = Table([[P(text, style)]], colWidths=[42 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def page_number(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.45)
    canvas.line(doc.leftMargin, 12.5 * mm, width - doc.rightMargin, 12.5 * mm)
    canvas.setFont("AIPMBody", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 8.6 * mm, "AI 产品经理转型学习项目 · 关键共识与双轨计划 v1")
    canvas.drawRightString(width - doc.rightMargin, 8.6 * mm, f"{page:02d}")
    canvas.restoreState()


def cover_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(COBALT_DARK)
    canvas.rect(0, height - 7 * mm, width, 7 * mm, fill=1, stroke=0)
    canvas.setStrokeColor(colors.HexColor("#C7D0CC"))
    canvas.circle(width - 18 * mm, height - 18 * mm, 32 * mm, fill=0, stroke=1)
    canvas.circle(width - 18 * mm, height - 18 * mm, 47 * mm, fill=0, stroke=1)
    canvas.restoreState()


def build_story():
    story = []

    story.extend(
        [
            Spacer(1, 15 * mm),
            P("REVIEW DOCUMENT · 2026.08.06", KICKER),
            P("AI 产品经理转型学习项目<br/>——关键共识与双轨计划 v1", TITLE),
            P("从产品经验出发，建立 AI 方案判断力；用两周形成最小闭环，用十二周补齐深度与证据。", SUBTITLE),
            Spacer(1, 4 * mm),
            Image(str(HERO), width=164 * mm, height=109.3 * mm),
            Spacer(1, 6 * mm),
            Table(
                [
                    [P("当前优先", H3), P("真实停点", H3), P("掌握状态", H3)],
                    [P("A 轨 · 两周突击线", BODY_SMALL), P("第 20 课结束规则未配置", BODY_SMALL), P("0 项已掌握 · 全部待核验", BODY_SMALL)],
                ],
                colWidths=[54.7 * mm] * 3,
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 7),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ]
                ),
            ),
            Spacer(1, 7 * mm),
            P("本文件只保存结构化关键共识，不保存完整聊天原文；个人经历仅保留脱敏能力标签。", BODY_SMALL),
            PageBreak(),
        ]
    )

    story.extend(section_header("01 · Background and positioning", "背景、求职定位与能力目标", "目标不是把模型指标做高，而是把技术能力转化为用户、产品和商业结果。"))
    story.append(P("可迁移能力", H2))
    abilities = [
        "C 端用户洞察", "竞品调研", "PRD", "跨团队协作", "A/B 实验", "漏斗分析", "用户增长", "商业化", "海外产品经验"
    ]
    ability_cells = [[P(item, CENTER) for item in abilities[i:i+3]] for i in range(0, len(abilities), 3)]
    ability_table = Table(ability_cells, colWidths=[54.7 * mm] * 3)
    ability_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(ability_table)
    story.append(Spacer(1, 5 * mm))
    story.append(band("目标岗位", "面向普通消费者或内容创作者的 ToC AI 应用产品经理，重点关注 AI 内容生产、创作者工具、AI 助手、搜索决策、交易服务和成熟产品 AI 化。", TEAL_LIGHT, TEAL))
    story.append(Spacer(1, 4 * mm))
    result_data = [
        [P("用户价值", H3), P("产品体验", H3), P("激活与留存", H3), P("付费转化", H3)],
        [P("商业化", H3), P("模型调用成本", H3), P("风险与合规", H3), P("跨团队落地", H3)],
    ]
    result_table = Table(result_data, colWidths=[41 * mm] * 4)
    result_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.extend([P("岗位结果责任", H2), result_table, Spacer(1, 5 * mm)])
    story.append(P("能力目标", H2))
    story.extend([
        bullet("大模型认知达到 L2“方案可判”，能够解释 Prompt、RAG、Fine-tuning、Agent、规则系统与非 AI 方案的边界。"),
        bullet("独立搭建可运行 AI 原型，建设 Eval Set，分析 Badcase，并完成至少一轮修复回归。"),
        bullet("能够讨论效果、延迟、成本、商业化、隐私与风险之间的取舍。"),
    ])
    story.append(Spacer(1, 5 * mm))
    story.append(P("主项目：证据驱动型面试与项目答辩教练", H2))
    story.append(P("面向零实习或项目证据不足、学历竞争力较弱、或对岗位能力边界不清晰的 AI PM 转型者。第一版聚焦基于真实证据的自适应面试与项目答辩训练。", BODY))
    process = ["岗位/JD", "脱敏经历", "考查计划", "动态问答", "证据提取", "结构评分", "风险判断", "复盘任务"]
    process_table = Table([[P(f"{i+1:02d}<br/>{item}", WHITE_CENTER) for i, item in enumerate(process)]], colWidths=[20.5 * mm] * 8)
    process_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INK), ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.6, INK), ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#63717A")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([Spacer(1, 2 * mm), process_table, PageBreak()])

    story.extend(section_header("02 · Two-track plan", "双轨计划：一套成果，两种时间尺度", "两周突击线优先执行；十二周长期线完整保留，并承接两周成果。"))
    story.append(band("A 轨 · 两周突击", "14 天，约 62-80 小时。先完成独立 Web Demo、Prompt / RAG / Agent / 评测 / Badcase / 风险 / 成本 / 商业化最小闭环和投递材料。", colors.HexColor("#E9EDFA"), COBALT))
    story.append(Spacer(1, 3 * mm))
    story.append(band("B 轨 · 十二周长期", "沿同一项目补原理、稳定性、系统评测、长期风险治理、商业实验、作品集与目标 JD 适配；不重复已验证的基础版本。", TEAL_LIGHT, TEAL))
    story.append(Spacer(1, 5 * mm))
    story.append(P("两周时间预算", H2))
    budget_table = Table(
        [
            [P("普通学习日", WHITE_H3), P("集中学习日", WHITE_H3), P("总投入", WHITE_H3)],
            [P("Day 1-5、8-12<br/><b>每天 3-4 小时</b>", BODY), P("Day 6、7、13、14<br/><b>每天 8-10 小时</b>", BODY), P("两周约<br/><b>62-80 小时</b>", BODY)],
        ],
        colWidths=[54.7 * mm] * 3,
    )
    budget_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK), ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.7, INK),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([budget_table, Spacer(1, 5 * mm), P("14 天任务 · Day 1-7", H2)])
    days_1 = [
        ("01", "旧知识核验、AI PM 知识地图、冻结 MVP 范围", "核验记录、知识地图、冻结清单"),
        ("02", "Prompt、RAG、微调、Agent、规则与非 AI 方案选型", "选型备忘、架构图"),
        ("03", "System Prompt、Few-shot、JSON Schema、校验与重试", "Prompt 与 Schema v1"),
        ("04", "自适应面试、能力覆盖、状态机、追问和结束规则", "状态机与停止规则"),
        ("05", "评分 Rubric、证据提取、Grounding、Traceability 与报告", "评分与证据链"),
        ("06*", "创建独立 Web 骨架：设置、面试、结果、代理和状态", "可运行页面骨架"),
        ("07*", "接入模型 API，完成问答、追问、评分和最终报告", "最小端到端链路"),
    ]
    day_rows = [[P(day, H3), P(task, BODY_SMALL), P(output, BODY_SMALL)] for day, task, output in days_1]
    day_table = Table(day_rows, colWidths=[19 * mm, 99 * mm, 46 * mm], repeatRows=0)
    day_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9EDFA")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([day_table, P("* 集中学习日，8-10 小时。", BODY_TINY), PageBreak()])

    story.extend(section_header("03 · Sprint delivery", "两周突击线：Day 8-14 与最低验收线"))
    days_2 = [
        ("08", "最小 RAG、知识源登记、检索、来源引用和时效规则", "RAG 与引用链路"),
        ("09", "建立不少于 30 条 Eval Set，覆盖正常与高风险案例", "Eval Set v1"),
        ("10", "Badcase、Injection、隐私、长上下文、拒答、降级与回归", "Badcase 与风险回归"),
        ("11", "激活、留存、复练、付费、Token 成本与单位经济", "指标树与商业模型"),
        ("12", "交互、加载、失败、移动端、来源提示和 PDF 导出", "体验与可用性修复"),
        ("13*", "完整测试、P0/P1 修复、回归、成本、部署和备用演示", "部署版与测试记录"),
        ("14*", "PRD、架构、评测、风险、README、视频和 8 分钟答辩", "投递与答辩材料包"),
    ]
    day_rows_2 = [[P(day, H3), P(task, BODY_SMALL), P(output, BODY_SMALL)] for day, task, output in days_2]
    day_table_2 = Table(day_rows_2, colWidths=[19 * mm, 99 * mm, 46 * mm])
    day_table_2.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9EDFA")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([day_table_2, P("* 集中学习日，8-10 小时。", BODY_TINY), Spacer(1, 5 * mm), P("两周最低验收线", H2)])
    acceptance = [
        "独立可访问的 AI Web Demo", "三题自适应面试，每题最多追问一次", "关键结论引用真实回答",
        "严重事实虚构为 0", "至少 30 条评测案例", "至少一次 Badcase 修复和回归",
        "公开知识检索与来源展示", "成本记录和商业指标树", "PRD、架构、评测、风险与答辩材料",
    ]
    acc_cells = []
    for i in range(0, len(acceptance), 3):
        row = []
        for j, item in enumerate(acceptance[i:i+3], start=i+1):
            row.append(P(f"<b>{j:02d}</b><br/>{item}", BODY_SMALL))
        acc_cells.append(row)
    acc_table = Table(acc_cells, colWidths=[54.7 * mm] * 3)
    acc_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([acc_table, Spacer(1, 5 * mm), band("去重原则", "两周成果直接进入十二周对应周次；长期线只补深度、稳定性、复测证据与未通过部分。", AMBER_LIGHT, AMBER), PageBreak()])

    story.extend(section_header("04 · Twelve-week depth", "十二周长期线", "沿同一主项目，逐周补齐原理、系统质量、商业判断与求职表达。"))
    weeks = [
        ("W01", "旧知识核验、继续第 20 课、跑通平台 Agent", "承接 Day 1、4"),
        ("W02", "Transformer、Embedding、Prompt、RAG、微调、规则、Agent 与 API 选型", "深化 Day 2-3"),
        ("W03", "RAG、切片、向量化、检索、重排、引用和知识更新", "深化 Day 8"),
        ("W04", "自适应面试、能力覆盖、状态机、上下文与停止规则", "深化 Day 4"),
        ("W05", "证据评分、Rubric、信息不足、置信度、结构化输出与重试", "深化 Day 5、7"),
        ("W06", "Eval Set、Golden Set、人工评测、LLM-as-a-Judge 与评测报告", "深化 Day 9"),
        ("W07", "Badcase 收集、归因、修复与回归", "深化 Day 10、13"),
        ("W08", "幻觉、长上下文、过期信息、Injection、隐私、合规与兜底", "深化 Day 10"),
        ("W09", "激活、留存、付费、Token 成本、模型路由与商业实验", "深化 Day 11"),
        ("W10", "独立 Web、前后端、API、安全代理、状态、RAG 与结构校验", "深化 Day 6-8"),
        ("W11", "功能、边界、响应、成本、移动端、无障碍、部署与评测迭代", "深化 Day 12-13"),
        ("W12", "PRD、架构、评测、风险、商业、作品集、答辩与 JD 适配", "深化 Day 14"),
    ]
    week_rows = [[P(week, H3), P(topic, BODY_SMALL), P(link, BODY_SMALL)] for week, topic, link in weeks]
    week_table = Table(week_rows, colWidths=[19 * mm, 111 * mm, 34 * mm], repeatRows=0)
    week_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 0), (0, -1), TEAL_LIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.3),
    ]))
    story.extend([week_table, Spacer(1, 4 * mm)])
    story.append(P("长期线只做三类工作：补深度、补稳定性、补未通过；并用新的 ToC AI 场景与目标 JD 检验迁移能力。", BODY))
    story.append(PageBreak())

    story.extend(section_header("05 · Mastery system", "掌握标准与学习状态", "“听懂了”只能调节讲解节奏，不能改变掌握状态。"))
    story.append(P("每个概念必须覆盖九项", H2))
    nine = ["英文全称", "中文全称", "通俗含义", "基本机制", "适用场景", "不适用场景", "主要风险", "产品兜底", "评测方法"]
    nine_cells = [[P(f"<b>{i+1:02d}</b><br/>{item}", CENTER) for i, item in enumerate(nine[j:j+3], start=j)] for j in range(0, 9, 3)]
    nine_table = Table(nine_cells, colWidths=[54.7 * mm] * 3)
    nine_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE), ("BOX", (0, 0), (-1, -1), 0.7, INK),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([nine_table, Spacer(1, 5 * mm), P("标准学习循环", H2)])
    loop = ["课程讲解", "闭卷复述", "相似比较", "新场景", "风险兜底", "评测设计", "补课复测", "错题记录", "间隔复习"]
    loop_table = Table([[P(f"{i+1:02d}<br/>{item}", WHITE_CENTER) for i, item in enumerate(loop)]], colWidths=[18.2 * mm] * 9)
    loop_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INK), ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.6, INK), ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#65747C")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([loop_table, Spacer(1, 5 * mm)])
    story.append(band("单题测验", "每次只问一道题。未通过时先补课，再用同一概念的新场景重答；通过后安排 D+1、D+3、D+7、D+14、D+30 间隔复习。", AMBER_LIGHT, AMBER))
    story.append(Spacer(1, 5 * mm))
    story.append(P("当前学习状态", H2))
    status_table = Table(
        [
            [P("待复核", H3), P("待巩固", H3), P("未测试", H3), P("已掌握", H3)],
            [P("29 项", TITLE), P("4 项", TITLE), P("22 项", TITLE), P("0 项", TITLE)],
            [P("已有材料或已讲解", BODY_SMALL), P("第 20 课结束判断", BODY_SMALL), P("突击线新增能力", BODY_SMALL), P("尚无九项完整证据", BODY_SMALL)],
        ],
        colWidths=[41 * mm] * 4,
    )
    status_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER), ("BOX", (0, 0), (-1, -1), 0.7, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([status_table, Spacer(1, 5 * mm), P("只有准确复述、解释机制、比较边界、处理新场景、设计风险兜底并说明评测方法，才标记为“已掌握”。", QUOTE), PageBreak()])

    story.extend(section_header("06 · AI product reasoning", "AI 项目统一分析链路", "所有项目都走完十步，并对不可行原因做可行动的分类。"))
    analysis_steps = [
        "项目定性", "用户和业务问题", "任务拆解", "AI 必要性", "方案选型",
        "不可行原因归因", "替代方案", "风险与兜底", "评测验证", "成本与商业结果",
    ]
    rows = []
    for i in range(0, 10, 2):
        rows.append([P(f"{i+1:02d}", H3), P(analysis_steps[i], BODY), P(f"{i+2:02d}", H3), P(analysis_steps[i+1], BODY)])
    chain_table = Table(rows, colWidths=[16 * mm, 66 * mm, 16 * mm, 66 * mm])
    chain_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E9EDFA")),
        ("BACKGROUND", (2, 0), (2, -1), TEAL_LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.7, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([chain_table, Spacer(1, 5 * mm), P("不可行原因至少分为", H2)])
    reason_data = [[P(item, WHITE_CENTER) for item in ["模型能力", "数据与知识", "系统工程", "产品与商业", "合规与组织约束"]]]
    reason_table = Table(reason_data, colWidths=[32.8 * mm] * 5)
    reason_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INK), ("TEXTCOLOR", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.6, INK), ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#68757C")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.extend([reason_table, Spacer(1, 6 * mm), P("AI PM 知识能力地图", H2)])
    capability_rows = [
        [P("用户与产品", H3), P("ToC 场景、用户洞察、MVP、体验、激活留存", BODY_SMALL)],
        [P("模型与方案", H3), P("LLM、Prompt、RAG、Fine-tuning、Agent、规则与非 AI", BODY_SMALL)],
        [P("系统与交互", H3), P("状态机、上下文、结构化输出、校验重试、来源引用", BODY_SMALL)],
        [P("质量与治理", H3), P("Rubric、Eval Set、Badcase、幻觉、Injection、隐私合规", BODY_SMALL)],
        [P("商业与交付", H3), P("Token 成本、单位经济、付费转化、部署、作品集与答辩", BODY_SMALL)],
    ]
    capability_table = Table(capability_rows, colWidths=[43 * mm, 121 * mm])
    capability_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 0), (0, -1), PAPER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([capability_table, PageBreak()])

    story.extend(section_header("07 · Truth, delivery and next step", "真实性红线、最终交付物与真实停点"))
    story.append(P("真实性与隐私红线", H2))
    redlines = [
        ("01", "不虚构用户的实习、项目、职责、数据或成果，不把他人项目包装成用户经历。"),
        ("02", "上下文过长、信息不足或资料不存在时明确标记，不为满足用户而创造事实。"),
        ("03", "不把过期信息当作当前事实；没有证据时不输出确定性评价。"),
        ("04", "内部实习材料仅在本机抽象能力标签，不写入公司信息、截图、数据、指标、链接或未脱敏事实。"),
    ]
    red_rows = [[P(idx, H2), P(text, BODY)] for idx, text in redlines]
    red_table = Table(red_rows, colWidths=[18 * mm, 146 * mm])
    red_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), RED_LIGHT), ("TEXTCOLOR", (0, 0), (0, -1), RED),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([red_table, Spacer(1, 5 * mm), P("最终交付物", H2)])
    deliverables = [
        [P("可运行产品", H3), P("独立 Web Demo；三题自适应面试；每题最多追问一次；来源展示与 PDF 导出。", BODY_SMALL)],
        [P("质量证据", H3), P("30+ Eval Set；Badcase 归因；至少一次修复回归；风险、拒答与降级清单。", BODY_SMALL)],
        [P("商业判断", H3), P("Token 成本记录；单位经济模型；激活、留存、复练、转化与付费指标树。", BODY_SMALL)],
        [P("求职材料", H3), P("PRD、架构说明、评测报告、README、演示视频与 8 分钟项目答辩稿。", BODY_SMALL)],
    ]
    delivery_table = Table(deliverables, colWidths=[38 * mm, 126 * mm])
    delivery_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.35, LINE),
        ("BACKGROUND", (0, 0), (0, -1), PAPER), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([delivery_table, Spacer(1, 6 * mm)])
    story.append(band("原课程真实停点", "第 20 课已理解 End Condition、Normal Completion Condition、Early Termination Condition 与 Minimum Evidence Requirement；结束规则尚未配置；原下一小节为 Early Termination Confirmation。", AMBER_LIGHT, AMBER))
    story.append(Spacer(1, 4 * mm))
    next_table = Table(
        [[P("下一次正式学习", WHITE_H), P("两周突击线第 1 天 → 旧知识核验 → 第一题闭卷核验 AI 产品经理职责、结果责任与岗位边界。", WHITE_BODY)]],
        colWidths=[50 * mm, 114 * mm],
    )
    next_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COBALT_DARK), ("BOX", (0, 0), (-1, -1), 0.7, COBALT_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 13),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
    ]))
    story.extend([next_table, Spacer(1, 4 * mm), P("本次只完成计划整合、学习系统、HTML、PDF 与验证，不在此处开始 Day 1 闭卷题。第 20 课未闭环部分由长期线第 1 周承接。", BODY)])

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=23 * mm,
        leftMargin=23 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="AI 产品经理转型学习项目——关键共识与双轨计划 v1",
        author="AI 产品经理转型学习项目",
        subject="关键共识、双轨计划、掌握标准与下一步",
    )
    doc.build(build_story(), onFirstPage=cover_page, onLaterPages=page_number)
    print(OUTPUT)


if __name__ == "__main__":
    main()
