#!/usr/bin/env python3
"""Презентация «Точки роста» для встречи с ГД Ондулин."""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import nsmap, qn
from pptx.util import Emu, Inches, Pt
from lxml import etree

# 16:9
W, H = Inches(13.333), Inches(7.5)
RED = RGBColor(0xB4, 0x23, 0x18)
INK = RGBColor(0x1C, 0x19, 0x17)
MUTED = RGBColor(0x57, 0x53, 0x4E)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
PAPER = RGBColor(0xFA, 0xFA, 0xF9)
LINE = RGBColor(0xE7, 0xE5, 0xE4)
SOFT = RGBColor(0xFE, 0xF3, 0xF2)
DARK = RGBColor(0x14, 0x10, 0x0E)
OK = RGBColor(0x3F, 0x62, 0x12)


def set_run(run, size=18, bold=False, color=INK, font="Calibri"):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = font
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = etree.SubElement(rPr, qn("a:ea"))
    ea.set("typeface", font)


def box(slide, l, t, w, h, fill=None, line=None):
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, l, t, w, h)
    sh.shadow.inherit = False
    sh.line.fill.background()
    if line:
        sh.line.fill.solid()
        sh.line.color.rgb = line
        sh.line.width = Pt(1)
    else:
        sh.line.fill.background()
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    sp = sh._element
    spPr = sp.find(qn("p:spPr"))
    # no shadow
    return sh


def tb(slide, l, t, w, h, text, size=18, bold=False, color=INK, align=PP_ALIGN.LEFT, font="Calibri", anchor=MSO_ANCHOR.TOP):
    tx = slide.shapes.add_textbox(l, t, w, h)
    tf = tx.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    try:
        tf._txBody.bodyPr.set("anchor", {MSO_ANCHOR.TOP: "t", MSO_ANCHOR.MIDDLE: "ctr", MSO_ANCHOR.BOTTOM: "b"}[anchor])
    except Exception:
        pass
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color, font=font)
    return tf


def add_para(tf, text, size=16, bold=False, color=INK, space_before=6, align=PP_ALIGN.LEFT):
    p = tf.add_paragraph()
    p.alignment = align
    p.space_before = Pt(space_before)
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color)
    return p


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def footer(slide, n, total, dark=False):
    c = RGBColor(0xA8, 0xA2, 0x9E) if not dark else RGBColor(0xA8, 0xA2, 0x9E)
    tb(slide, Inches(0.55), Inches(7.12), Inches(10), Inches(0.28),
       "Ондулин  ·  точки роста выручки и доли  ·  гипотезы по открытым данным, к сверке",
       size=11, color=c)
    tb(slide, Inches(11.6), Inches(7.12), Inches(1.2), Inches(0.28),
       f"{n} / {total}", size=11, color=c, align=PP_ALIGN.RIGHT)


def accent_bar(slide):
    box(slide, Inches(0), Inches(0), Inches(0.12), H, fill=RED)


def new(prs, dark=False):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H)
    bg.line.fill.background()
    bg.fill.solid()
    bg.fill.fore_color.rgb = DARK if dark else PAPER
    bg.shadow.inherit = False
    # send to back
    spTree = s.shapes._spTree
    sp = bg._element
    spTree.remove(sp)
    spTree.insert(2, sp)
    if not dark:
        accent_bar(s)
    return s


def card(slide, l, t, w, h, title, body, num=None):
    box(slide, l, t, w, h, fill=WHITE, line=LINE)
    if num:
        tb(slide, l + Inches(0.18), t + Inches(0.12), w - Inches(0.3), Inches(0.32),
           num, size=12, bold=True, color=RED)
        tb(slide, l + Inches(0.18), t + Inches(0.40), w - Inches(0.36), Inches(0.4),
           title, size=16, bold=True, color=INK)
        tb(slide, l + Inches(0.18), t + Inches(0.82), w - Inches(0.36), h - Inches(0.95),
           body, size=13, color=MUTED)
    else:
        tb(slide, l + Inches(0.18), t + Inches(0.16), w - Inches(0.36), Inches(0.4),
           title, size=16, bold=True, color=INK)
        tb(slide, l + Inches(0.18), t + Inches(0.56), w - Inches(0.36), h - Inches(0.7),
           body, size=13, color=MUTED)


def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    total = 12

    # 1 cover
    s = new(prs, dark=True)
    box(s, Inches(0), Inches(0), Inches(0.18), H, fill=RED)
    tb(s, Inches(0.7), Inches(1.7), Inches(12), Inches(0.4),
       "К ДИАЛОГУ С ГД И HR", size=13, bold=True, color=RED)
    tb(s, Inches(0.7), Inches(2.15), Inches(12), Inches(1.6),
       "Ондулин: семь точек роста\nвыручки и доли", size=40, bold=True, color=WHITE)
    tb(s, Inches(0.7), Inches(4.4), Inches(11), Inches(1.1),
       "Как быть выше падающего рынка, не сливая маржу в канал.\nГипотезы по открытым данным — на встрече сверить, не защищать.",
       size=18, color=RGBColor(0xD6, 0xD3, 0xD1))
    tb(s, Inches(0.7), Inches(6.35), Inches(11), Inches(0.4),
       "Олег Сильченко  ·  директор по продажам  ·  сентябрь 2026",
       size=14, color=RGBColor(0xA8, 0xA2, 0x9E))
    notes(s, "Не читать титул. После приветствия: «Принёс одну рамку — где рост, если ниша уже наша. Хочу сверить с вашими цифрами».")

    # 2 diagnosis
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.35),
       "ИСХОДНАЯ ТОЧКА", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.62), Inches(12), Inches(0.55),
       "Компания уже ниже рынка — не «падает вместе с ним»", size=26, bold=True, color=INK)

    metrics = [
        ("5,48 млрд ₽", "выручка торговой, 2025", "−14%", True),
        ("4,02 млрд ₽", "завод Ондулин-С.М., 2025", "−16%", True),
        ("−5…−8,5%", "рынок стройки / кровли, 2025", "бенчмарк вакансии −5%", False),
        ("6,34 млрд ₽", "пик 2024, «оборот 6+»", "план, не факт", False),
    ]
    for i, (n, sub, tag, neg) in enumerate(metrics):
        x = Inches(0.55) + i * Inches(3.15)
        box(s, x, Inches(1.4), Inches(3.0), Inches(1.85), fill=WHITE, line=LINE)
        tb(s, x + Inches(0.18), Inches(1.52), Inches(2.65), Inches(0.55),
           n, size=22, bold=True, color=RED if neg else INK)
        tb(s, x + Inches(0.18), Inches(2.1), Inches(2.65), Inches(0.7),
           sub, size=13, color=MUTED)
        tb(s, x + Inches(0.18), Inches(2.75), Inches(2.65), Inches(0.35),
           tag, size=12, bold=True, color=RED if neg else MUTED)

    tb(s, Inches(0.55), Inches(3.5), Inches(12.2), Inches(0.4),
       "Скатная кровля 2024: 261 млн м². ИЖС даёт ~89% спроса.", size=16, color=INK)

    # structure bar
    labels = [("Металл 67%", 0.67, INK), ("Гибкая 17%", 0.17, RED),
              ("БВЛ 8%", 0.08, RGBColor(0xA1, 0x62, 0x07)), ("Шифер 8%", 0.08, RGBColor(0x78, 0x71, 0x6C))]
    x0 = Inches(0.55)
    y0 = Inches(4.05)
    bw = Inches(12.2)
    box(s, x0, y0, bw, Inches(0.42), fill=RGBColor(0xE7, 0xE5, 0xE4))
    cx = x0
    for lab, sh, col in labels:
        ww = int(bw * sh)
        box(s, cx, y0, ww, Inches(0.42), fill=col)
        tb(s, cx, y0, ww, Inches(0.42), lab, size=11, bold=True, color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        cx += ww

    box(s, Inches(0.55), Inches(4.7), Inches(12.2), Inches(2.05), fill=SOFT)
    tb(s, Inches(0.8), Inches(4.85), Inches(11.7), Inches(1.75),
       "Вывод для коммерции. В еврошифере ~99% производства уже ваши — доля внутри ниши не растёт. "
       "Конкурент не «другой ондулин», а металл, гибкая черепица и ремонт шифера. "
       "Задача года: быть выше рынка на 5–8 п.п. и закрыть разрыв 2025-го без отгрузки в полный склад.",
       size=16, color=INK)
    footer(s, 2, total)
    notes(s, "Одна цифра — один вывод — вопрос: «Как вы считаете рынок, к которому себя меряете? План от 5,48 или от 6,34?» Не спорить, если поправят.")

    # 3 map
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.35),
       "КАРТА РОСТА", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.62), Inches(12), Inches(0.5),
       "Семь точек. Не новый продукт — управление каналом и чеком", size=24, bold=True, color=INK)

    items = [
        ("01", "Sell-out вместо sell-in", "Сток топ-20. Не грузить полный склад после всплеска 2024."),
        ("02", "JBP с топ-20 дистрибьюторов", "20 имён ≈ 60–70% денег. Взаимная выгода, не скидка."),
        ("03", "Микс и система", "Смарт → Черепица / Ондувилла + конёк, гвозди, лента."),
        ("04", "ONDUTISS в каждый заказ", "Единственный фронт, где долю можно отнять."),
        ("05", "Замена шифера и хозблок", "Доля скатной кровли 8% → 8,3–8,6%. Донор рынка."),
        ("06", "DIY как доля в сети", "Лемана ПРО, Петрович, Максидом. Полка комплекта."),
        ("07", "E-com в правилах канала", "Сначала MAP, потом GMV. Лид дилеру, не обход."),
    ]
    for i, (num, title, body) in enumerate(items):
        col, row = i % 4, i // 4
        if i == 6:
            x = Inches(0.55) + 0 * Inches(3.15)
            y = Inches(1.35) + 2 * Inches(1.75)
            ww = Inches(12.2)
        else:
            x = Inches(0.55) + col * Inches(3.15)
            y = Inches(1.35) + row * Inches(1.75)
            ww = Inches(3.0)
        hh = Inches(1.6)
        box(s, x, y, ww, hh, fill=WHITE, line=LINE)
        tb(s, x + Inches(0.16), y + Inches(0.12), Inches(0.6), Inches(0.3), num, size=14, bold=True, color=RED)
        tb(s, x + Inches(0.16), y + Inches(0.42), ww - Inches(0.32), Inches(0.4), title, size=15, bold=True, color=INK)
        tb(s, x + Inches(0.16), y + Inches(0.85), ww - Inches(0.32), Inches(0.65), body, size=12, color=MUTED)
    footer(s, 3, total)
    notes(s, "Порядок на встрече: сначала 01–02 (дистрибьюция), потом микс и плёнка, DIY, e-com последним и с ограничением. Не открывать с маркетплейсов.")

    # 4 disti
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "ТОЧКИ 01–02", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.5),
       "Дистрибьюторы: главный P&L", size=26, bold=True, color=INK)
    tb(s, Inches(0.55), Inches(1.15), Inches(12), Inches(0.4),
       "~100 ключевых, пул ~500. Лечить минус рынка скидкой и вагоном — повторить 2025.",
       size=16, color=MUTED)

    steps = [
        ("ABC", "Топ-20 вести лично + РСМ. Остальным — стандарт. Спящих из 500 не раздувать."),
        ("Sell-out", "Дни запаса листа / доборов / плёнки. Где сток выше нормы — помогаем продать, не грузим."),
        ("JBP", "Квартал: объём, микс, attach, покрытие, обучение продавцов, коридор цены."),
        ("Заработок", "MAP и территория, приоритет в сезон, комплект на складе. Скидка — последний рычаг."),
    ]
    for i, (t, b) in enumerate(steps):
        y = Inches(1.7) + i * Inches(1.05)
        box(s, Inches(0.55), y, Inches(12.2), Inches(0.95), fill=WHITE, line=LINE)
        box(s, Inches(0.55), y, Inches(0.12), Inches(0.95), fill=RED)
        tb(s, Inches(0.9), y + Inches(0.12), Inches(2.2), Inches(0.7), t, size=18, bold=True, color=INK, anchor=MSO_ANCHOR.MIDDLE)
        tb(s, Inches(3.2), y + Inches(0.18), Inches(9.2), Inches(0.65), b, size=15, color=MUTED, anchor=MSO_ANCHOR.MIDDLE)

    footer(s, 4, total)
    notes(s, "Связать с кейсом Связной 26%: JBP — тот же инструмент, клиент — дистрибьютор. Евросеть: вы знаете, чего партнёр хочет, потому что сидели с той стороны. Эффект 01: 80–120 млн; покрытие: 50–100.")

    # 5 mix system
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "ТОЧКА 03", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.5),
       "Микс и система: деньги с м², не ещё один лист", size=24, bold=True, color=INK)

    prods = [
        ("Ондулин Смарт", "Эконом / замена / хозблок\n490–510 ₽/м², Smart Lock\nНе единственный ответ на металл"),
        ("Черепица Ондулин", "Средний сегмент, DIY-формат\nГарантия 20 лет\nОтвет «выглядит как черепица»"),
        ("Ондувилла", "Премиум внутри линейки\nМодуль, выше чек\nНе конкурировать скидкой Смарта"),
        ("Доборы и гвозди", "Конёк, ендова, щипец, лента\nМаржа партнёра и герметичность\nAttach +2–3 п.п. к счёту"),
    ]
    for i, (t, b) in enumerate(prods):
        x = Inches(0.55) + i * Inches(3.15)
        box(s, x, Inches(1.35), Inches(3.0), Inches(3.15), fill=WHITE, line=LINE)
        box(s, x, Inches(1.35), Inches(3.0), Inches(0.1), fill=RED)
        tb(s, x + Inches(0.18), Inches(1.6), Inches(2.65), Inches(0.7), t, size=16, bold=True, color=INK)
        tb(s, x + Inches(0.18), Inches(2.35), Inches(2.65), Inches(1.9), b, size=14, color=MUTED)

    box(s, Inches(0.55), Inches(4.7), Inches(12.2), Inches(2.05), fill=WHITE, line=LINE)
    tb(s, Inches(0.8), Inches(4.9), Inches(11.7), Inches(1.7),
       "Как делать. Цель микса — в JBP и в KPI РСМ, не в буклете. Не отгружать лист, если у партнёра нет конька и гвоздей. "
       "В DIY — SKU-линейка Onduline DIY (уже есть узкий лист) + 3–4 добора на полке. "
       "Позиционирование «дёшево и выцветает» лечится черепицей и комплектом, не ещё одной скидкой на Смарт.\n\n"
       "Эффект: микс 50–80 млн  ·  attach доборов 80–120 млн.",
       size=15, color=INK)
    footer(s, 5, total)
    notes(s, "Grand Line уже говорит рынку: кровля = система. Мы должны говорить то же про битум. УТП: тихий, лёгкий, монтаж в одиночку, без коррозии.")

    # 6 ONDUTISS + slate
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "ТОЧКИ 04–05", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.55),
       "Где берётся доля: плёнка и чужой м²", size=24, bold=True, color=INK)

    box(s, Inches(0.55), Inches(1.35), Inches(6.05), Inches(5.0), fill=WHITE, line=LINE)
    tb(s, Inches(0.8), Inches(1.55), Inches(5.6), Inches(0.35), "04  ONDUTISS", size=14, bold=True, color=RED)
    tb(s, Inches(0.8), Inches(1.95), Inches(5.6), Inches(0.7),
       "Единственный рынок, где вы не монополист", size=18, bold=True, color=INK)
    tb(s, Inches(0.8), Inches(2.7), Inches(5.6), Inches(3.3),
       "Изоспан, ТехноНИКОЛЬ, Megaflex — здесь долю отнимают.\n\n"
       "1. Attach: каждый заказ кровли видит мембрану и ленту.\n"
       "2. Белые пятна: каркас, фасад, металл конкурента.\n"
       "3. SMART/PRO AM — профессиональный ярус, не «дешёвая плёнка».\n\n"
       "Эффект: 80–150 млн. KPI — доля плёнки в кровельном счёте, не абстрактный % рынка.",
       size=15, color=MUTED)

    box(s, Inches(6.8), Inches(1.35), Inches(5.95), Inches(5.0), fill=WHITE, line=LINE)
    tb(s, Inches(7.05), Inches(1.55), Inches(5.5), Inches(0.35), "05  ШИФЕР И ХОЗБЛОК", size=14, bold=True, color=RED)
    tb(s, Inches(7.05), Inches(1.95), Inches(5.5), Inches(0.7),
       "Доля скатной кровли 8% → 8,3–8,6%", size=18, bold=True, color=INK)
    tb(s, Inches(7.05), Inches(2.7), Inches(5.5), Inches(3.3),
       "Шифер сжимается ~9,5% CAGR, это 8% рынка — донор. СКАИ, BF Tech.\n\n"
       "Комплект «лист + гвозди + лента», без усиления стропил. Регионы с шиферным фондом. Контент и обучение дилера.\n\n"
       "Хозблок / дача / гараж: металл шумный, Ондулин лёгкий и DIY. Отдельная витрина, не «тот же коттедж».\n\n"
       "ИЖС 2025: ввод +2%, новые коттеджи −40%. Ремонт устойчивее новостроя.",
       size=15, color=MUTED)
    footer(s, 6, total)
    notes(s, "УТП из продуктового брифа: бесшумность, нет коррозии, лёгкий, монтаж без специнструмента. Это аргумент vs металл на хозблоке, не vs Shinglas на коттедже.")

    # 7 DIY ecom
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "ТОЧКИ 06–07", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.55),
       "DIY и e-com: витрина, не война с сотней партнёров", size=24, bold=True, color=INK)

    box(s, Inches(0.55), Inches(1.35), Inches(6.05), Inches(5.0), fill=WHITE, line=LINE)
    tb(s, Inches(0.8), Inches(1.55), Inches(5.6), Inches(0.35), "06  DIY", size=14, bold=True, color=RED)
    tb(s, Inches(0.8), Inches(1.95), Inches(5.6), Inches(0.55),
       "Лемана ПРО · Петрович · Максидом", size=18, bold=True, color=INK)
    tb(s, Inches(0.8), Inches(2.6), Inches(5.6), Inches(3.4),
       "Цель — доля категории на полке, не «нас возят».\n\n"
       "Матрица: Смарт + DIY-черепица + доборы + 1–2 плёнки.\n"
       "Обучение зала, промокалендарь, наличие комплекта.\n"
       "Цена сети не самая дешёвая в городе.\n"
       "Пилот доли внутри одной сети — как 26% в Связном.\n\n"
       "Партнёры по смыслу: Grand Line, ТСТН, «Твой Мир» и региональные — отдельные JBP, не смешивать с DIY.\n\n"
       "Эффект: 40–80 млн + доступность бренда для частника.",
       size=14, color=MUTED)

    box(s, Inches(6.8), Inches(1.35), Inches(5.95), Inches(5.0), fill=SOFT)
    tb(s, Inches(7.05), Inches(1.55), Inches(5.5), Inches(0.35), "07  E-COM", size=14, bold=True, color=RED)
    tb(s, Inches(7.05), Inches(1.95), Inches(5.5), Inches(0.7),
       "Сначала правила, потом объём", size=18, bold=True, color=INK)
    tb(s, Inches(7.05), Inches(2.7), Inches(5.5), Inches(3.3),
       "Онлайн DIY растёт (2,1→2,5 трлн), офлайн падает. Без MAP e-com съест топ-100 быстрее, чем даст 100 млн.\n\n"
       "Аудит серых карточек Ozon/WB.\n"
       "Официальная матрица, цена ≥ MAP.\n"
       "Сайт: комплект «крыша 50 м²» и лид дилеру, не обход сети.\n"
       "Стык с РСМ: лид и цена, не конкуренция за Орёл.\n\n"
       "Эффект года 1: 40–80 млн в рамке. Больше — решение ГД пожертвовать частью дистрибьюции.",
       size=14, color=INK)
    footer(s, 7, total)
    notes(s, "Первым предложением по e-com — ограничение, не GMV. «Четыре миллиарда в LG научили КАК масштабировать. Эта роль требует ещё КОГДА НЕ НАДО».")

    # 8 P&L bridge
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "МОСТ К ВЫРУЧКЕ", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.5),
       "Три сценария 12 месяцев. База — факт 2025: 5,48 млрд", size=24, bold=True, color=INK)

    # table-like
    rows = [
        ("", "Выручка", "К рынку −5%", "Смысл"),
        ("A  Дисциплина", "5,37 млрд (−2%)", "+3 п.п.", "Перестали проигрывать"),
        ("B  База «выше рынка»", "5,48–5,64 (0…+3%)", "+5…8 п.п.", "Честная цель года 1"),
        ("C  Возврат к «6+»", "6,0–6,15 (+10…12%)", "+15…17 п.п.", "Только если канал пустой и база 2024"),
    ]
    y = Inches(1.25)
    box(s, Inches(0.55), y, Inches(12.2), Inches(0.42), fill=INK)
    headers = [(0.7, 3.2), (4.0, 2.6), (6.7, 2.4), (9.2, 3.3)]
    for (x, w), t in zip(headers, rows[0][0:4] if False else ["Сценарий", "Выручка", "К рынку −5%", "Смысл"]):
        pass
    tb(s, Inches(0.7), y, Inches(3.2), Inches(0.42), "Сценарий", size=12, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, Inches(4.0), y, Inches(2.6), Inches(0.42), "Выручка", size=12, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, Inches(6.7), y, Inches(2.5), Inches(0.42), "К рынку −5%", size=12, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)
    tb(s, Inches(9.3), y, Inches(3.2), Inches(0.42), "Смысл", size=12, bold=True, color=WHITE, anchor=MSO_ANCHOR.MIDDLE)

    data = [
        ("A  Дисциплина", "5,37 (−2%)", "+3 п.п.", "Перестали проигрывать"),
        ("B  Выше рынка", "5,48–5,64 (0…+3%)", "+5…8 п.п.", "Команда + партнёры + микс"),
        ("C  План «6+»", "6,0–6,15 (+10…12%)", "+15…17 п.п.", "Риск отгрузки в сток"),
    ]
    for i, row in enumerate(data):
        yy = Inches(1.67) + i * Inches(0.52)
        fill = WHITE if i != 1 else SOFT
        box(s, Inches(0.55), yy, Inches(12.2), Inches(0.52), fill=fill, line=LINE)
        tb(s, Inches(0.7), yy, Inches(3.2), Inches(0.52), row[0], size=14, bold=True, color=INK, anchor=MSO_ANCHOR.MIDDLE)
        tb(s, Inches(4.0), yy, Inches(2.6), Inches(0.52), row[1], size=14, color=INK, anchor=MSO_ANCHOR.MIDDLE)
        tb(s, Inches(6.7), yy, Inches(2.5), Inches(0.52), row[2], size=14, bold=True, color=RED if i == 2 else INK, anchor=MSO_ANCHOR.MIDDLE)
        tb(s, Inches(9.3), yy, Inches(3.2), Inches(0.52), row[3], size=13, color=MUTED, anchor=MSO_ANCHOR.MIDDLE)

    tb(s, Inches(0.55), Inches(3.4), Inches(12), Inches(0.4),
       "Мост к сценарию B, млн ₽ (порядок величин, не бюджет)", size=16, bold=True, color=INK)

    levers = [
        ("Сток / sell-out", "+80…120"),
        ("Микс", "+50…80"),
        ("Доборы", "+80…120"),
        ("ONDUTISS", "+80…150"),
        ("Покрытие", "+50…100"),
        ("DIY / e-com", "+40…80"),
        ("Минус рынка", "−270"),
    ]
    for i, (t, n) in enumerate(levers):
        x = Inches(0.55) + i * Inches(1.8)
        box(s, x, Inches(3.9), Inches(1.7), Inches(1.45), fill=WHITE, line=LINE)
        tb(s, x + Inches(0.08), Inches(4.0), Inches(1.54), Inches(0.55), t, size=12, color=MUTED, align=PP_ALIGN.CENTER)
        tb(s, x + Inches(0.08), Inches(4.55), Inches(1.54), Inches(0.55), n, size=16, bold=True,
           color=RED if n.startswith("−") else INK, align=PP_ALIGN.CENTER)

    tb(s, Inches(0.55), Inches(5.55), Inches(12.2), Inches(1.2),
       "Без ответа на вопрос «план от 5,48 или от 6,34?» обещать C нельзя. "
       "Если база 2024 — это обгон рынка на ~15 п.п. Так можно только при пустом канале и рычагах микса/плёнки/покрытия.",
       size=15, color=MUTED)
    footer(s, 8, total)
    notes(s, "Не обещать 6,3 до стока топ-20. Сценарий B — ваша ставка как кандидата. C — если они сами настаивают на «шесть плюс», запросить рычаги.")

    # 9 team 90-180-365
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "КАК ЭТО ДЕЛАЕТСЯ", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.5),
       "План, команда, 90 / 180 / 365", size=26, bold=True, color=INK)

    times = [
        ("3 месяца", "Перенять, не ломать",
         "Все РО + завод. Ride-along с 7 РСМ. ABC-100. Сток топ-20. Сплит продукт/канал. Черновик правил каналов. Пилот JBP на 5–7. Людей не трогать."),
        ("6 месяцев", "Система и люди",
         "Оценка 7 РСМ, планы развития. KPI: не только отгрузка — микс, attach, покрытие, цена. JBP на топ-20. Омниканальная мотивация DIY/e-com и поля."),
        ("12 месяцев", "Результат",
         "Сценарий B как база. Сам в полях в сезон. Ревью с топ-партнёрами. Честный прогноз ГД за квартал до конца года. Без сюрприза в декабре."),
    ]
    for i, (h, sub, b) in enumerate(times):
        x = Inches(0.55) + i * Inches(4.2)
        box(s, x, Inches(1.3), Inches(4.0), Inches(3.55), fill=WHITE, line=LINE)
        box(s, x, Inches(1.3), Inches(4.0), Inches(0.1), fill=RED)
        tb(s, x + Inches(0.22), Inches(1.55), Inches(3.55), Inches(0.4), h, size=18, bold=True, color=RED)
        tb(s, x + Inches(0.22), Inches(2.0), Inches(3.55), Inches(0.4), sub, size=16, bold=True, color=INK)
        tb(s, x + Inches(0.22), Inches(2.5), Inches(3.55), Inches(2.1), b, size=14, color=MUTED)

    box(s, Inches(0.55), Inches(5.05), Inches(12.2), Inches(1.7), fill=INK)
    tb(s, Inches(0.8), Inches(5.2), Inches(11.7), Inches(1.4),
       "Система, которая остаётся без ручного режима: план продукт × канал × регион × месяц  ·  правила каналов на одной странице  ·  "
       "JBP топ-20  ·  стандарт визита и стока системы  ·  недельный ритм с заводом и финансами  ·  премия, которая не платит за завал склада партнёра.",
       size=15, color=WHITE)
    footer(s, 9, total)
    notes(s, "Лидер = процессы, люди, результат. 20–30% командировок. DIY/e-com в прямом подчинении стыкуются правилом, не войной с РСМ.")

    # 10 what to verify
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "ЧТО СВЕРИТЬ", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.5),
       "Восемь вопросов, без которых цифры — пожелание", size=24, bold=True, color=INK)

    qs = [
        "План 2026 от какой базы — 5,48 или 6,34?",
        "Победа года лично для вас: объём, маржа, доля, команда, завод?",
        "Где утечка 2025: сток, цена, микс, DIY-конфликт, поле?",
        "Сколько партнёров дают 50%? Кто незаменим? Grand Line / ТСТН / «Твой Мир» — какой вес?",
        "Сток топ-20 в днях. Есть ли sell-out или живём по отгрузке?",
        "Правила маркетплейса уже есть? Кто продаёт на Ozon/WB?",
        "DIY и РСМ в одном городе — кто решает спор по цене?",
        "Формула мотивации поля. Когда меняли. Что нельзя трогать 90 дней?",
    ]
    for i, q in enumerate(qs):
        col, row = i % 2, i // 2
        x = Inches(0.55) + col * Inches(6.3)
        y = Inches(1.3) + row * Inches(1.2)
        box(s, x, y, Inches(6.1), Inches(1.08), fill=WHITE, line=LINE)
        tb(s, x + Inches(0.18), y + Inches(0.12), Inches(0.5), Inches(0.8), f"{i+1:02d}", size=18, bold=True, color=RED, anchor=MSO_ANCHOR.MIDDLE)
        tb(s, x + Inches(0.75), y + Inches(0.18), Inches(5.15), Inches(0.75), q, size=14, color=INK, anchor=MSO_ANCHOR.MIDDLE)
    footer(s, 10, total)
    notes(s, "Задавать пакетами по 2–3, не допросом. Условия и пакет — во второй половине встречи.")

    # 11 principles
    s = new(prs)
    tb(s, Inches(0.55), Inches(0.32), Inches(12), Inches(0.3), "КАК Я ЭТО ВЕДУ", size=12, bold=True, color=RED)
    tb(s, Inches(0.55), Inches(0.6), Inches(12), Inches(0.5),
       "Четыре правила, чтобы рост не съел маржу и партнёров", size=24, bold=True, color=INK)

    rules = [
        ("Доля — в скатной кровле, не в БВЛ",
         "99% еврошифера не KPI. KPI: доля 8%+, деньги с м², доля плёнки в счёте."),
        ("Партнёр зарабатывает — тогда остаётся",
         "Защита цены и территории важнее акции. Скидка — последний рычаг."),
        ("E-com не обгоняет правила",
         "MAP и лид дилеру. GMV без рамки — минус доверия топ-100."),
        ("План живёт на территории",
         "Не раскладывается до РСМ и топ-дистрибьютора — это пожелание. 90 дней сезон не ломаем."),
    ]
    for i, (t, b) in enumerate(rules):
        y = Inches(1.3) + i * Inches(1.2)
        box(s, Inches(0.55), y, Inches(12.2), Inches(1.08), fill=WHITE, line=LINE)
        box(s, Inches(0.55), y, Inches(0.12), Inches(1.08), fill=RED)
        tb(s, Inches(0.95), y + Inches(0.12), Inches(11.5), Inches(0.4), t, size=18, bold=True, color=INK)
        tb(s, Inches(0.95), y + Inches(0.52), Inches(11.5), Inches(0.45), b, size=15, color=MUTED)
    footer(s, 11, total)
    notes(s, "Здесь можно сесть в диалог: «Что из этого уже есть, что сознательно не делали?»")

    # 12 close
    s = new(prs, dark=True)
    box(s, Inches(0), Inches(0), Inches(0.18), H, fill=RED)
    tb(s, Inches(0.7), Inches(1.8), Inches(12), Inches(0.35),
       "ИТОГ", size=13, bold=True, color=RED)
    tb(s, Inches(0.7), Inches(2.2), Inches(12), Inches(1.5),
       "Рост — не новый ондулин.\nЭто доля, чек системы и дисциплина канала.",
       size=28, bold=True, color=WHITE)
    tb(s, Inches(0.7), Inches(4.1), Inches(11.5), Inches(1.6),
       "Выше рынка на 5–8 п.п. за 12 месяцев — выполнимая ставка.\n"
       "Возврат к «6+ млрд» — только после стока и согласованной базы плана.\n"
       "Готов идти в филиалы и к топ-партнёрам. Сначала сверить ваши цифры.",
       size=18, color=RGBColor(0xD6, 0xD3, 0xD1))
    tb(s, Inches(0.7), Inches(6.3), Inches(11), Inches(0.4),
       "Олег Сильченко", size=14, color=RGBColor(0xA8, 0xA2, 0x9E))
    notes(s, "Финал: интересно. На очной — топ-партнёры и один филиал. Не торговать пакет на этой странице.")

    out = "/workspace/ondulin-sales-strategy/Ondulin-tochki-rosta.pptx"
    prs.save(out)
    return out


if __name__ == "__main__":
    print(build())
