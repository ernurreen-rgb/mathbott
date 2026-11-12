import asyncio
import json
import sys
from pathlib import Path

bot_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(bot_dir))

from database import Database

def get_db_url():
    with open(bot_dir / '.env.prod.test', 'r') as f:
        for line in f:
            if line.startswith('DATABASE_URL='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return None

tasks_data = [
    # 1
    {
        "slot_index": 1,
        "text": r"\frac{x}{x^2+4} = \frac{a}{x-1} теңдеуінде x_1 = 2 болса, x_2 мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"-\frac{2}{3}"},
            {"label": "C", "text": "-3"},
            {"label": "D", "text": "1"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал теңдеулер", "Теңдеулер"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": "Табаны 3, 4, биіктігі 4 болатын тік бұрышты үшбұрышты призма берілген. Призманың толық бетінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "54"},
            {"label": "B", "text": "60"},
            {"label": "C", "text": "64"},
            {"label": "D", "text": "72"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Толық бетінің ауданы"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"A(3; 1; 1), B(1; 3; 0), C(5; 3; 2). \overline{AB} және \overline{AC} векторларының ұзындықтарының қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "6"},
            {"label": "B", "text": "7"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Вектор ұзындығы"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"\left(\frac{1}{8}\right)^{-x^2} \cdot \left(\frac{1}{16}\right)^x = \frac{1}{2} теңдеуді шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1; 3"},
            {"label": "B", "text": r"1; \frac{1}{3}"},
            {"label": "C", "text": r"1; -\frac{1}{3}"},
            {"label": "D", "text": "1; 0"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер", "Теңдеулер"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"Қабырғасы 6, сүйір бұрышы 60^\circ болатын ромбтың ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "36"},
            {"label": "B", "text": r"18\sqrt{2}"},
            {"label": "C", "text": r"18\sqrt{3}"},
            {"label": "D", "text": r"12\sqrt{3}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Ромб", "Аудан"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\frac{a^2-25b^2}{a-5b} ықшамдаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a - 5b"},
            {"label": "B", "text": "a + 5b"},
            {"label": "C", "text": "a^2 + 25b^2"},
            {"label": "D", "text": "(a - 5b)^2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары", "Бөлшектерді қысқарту"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\cos 2x \ge \frac{\sqrt{2}}{2} теңсіздігін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x \in \left[-\frac{\pi}{6} + \pi n; \frac{\pi}{6} + \pi n\right], n \in \mathbb{Z}"},
            {"label": "B", "text": r"x \in \left[-\frac{\pi}{8} + \pi n; \frac{\pi}{8} + \pi n\right], n \in \mathbb{Z}"},
            {"label": "C", "text": r"x \in \left[-\frac{\pi}{8} + 2\pi n; \frac{\pi}{8} + 2\pi n\right], n \in \mathbb{Z}"},
            {"label": "D", "text": r"x \in \left[-\frac{\pi}{4} + \pi n; \frac{\pi}{4} + \pi n\right], n \in \mathbb{Z}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздіктер"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"\int \frac{dx}{\sqrt[3]{x^2}} интегралды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt[3]{x} + C"},
            {"label": "B", "text": r"3\sqrt[3]{x} + C"},
            {"label": "C", "text": r"\frac{1}{3} x^{\frac{1}{3}} + C"},
            {"label": "D", "text": r"\frac{3}{\sqrt[3]{x}} + C"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"y = 3x^2 - 2x - 2 функциясына x_0 = -1 нүктесінде жүргізілген жанаманың теңдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "y = -8x - 5"},
            {"label": "B", "text": "y = 8x + 5"},
            {"label": "C", "text": "y = -6x + 1"},
            {"label": "D", "text": "y = -8x + 5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Туынды", "Жанаманың теңдеуі"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"y = x^2 - 6x + 7 функциясының [0; 4] аралығындағы ең үлкен мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-2"},
            {"label": "B", "text": "-1"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "7"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция", "Ең үлкен және ең кіші мәндер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\frac{e^x - e^{-x}}{e^x + e^{-x}} = \frac{1}{3}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-\frac{1}{2}\ln 2 ; \frac{1}{2}\ln 2"},
            {"label": "B", "text": r"\ln\sqrt{2}"},
            {"label": "C", "text": r"2\ln 2"},
            {"label": "D", "text": r"\ln 2"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер", "Логарифм"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\begin{cases} x^2 + 2y = 10 \\ x^2 - 2x + 2y = 6 \end{cases} теңдеулер жүйесін шешіп, x + y мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "7"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Суретте (4; 0), (5; 4) нүктелері арқылы өтетін y = a\log_2(x - b) функциясының графигі берілген. a және b мәндерін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "a = 2; b = 2"},
            {"label": "B", "text": "a = 1; b = 3"},
            {"label": "C", "text": "a = 3; b = 4"},
            {"label": "D", "text": "a = 4; b = 3"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік функция", "Функция графигі"],
        "image_filename": "v6_q13_log_graph.png",
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Егер x, y \begin{cases} x^{\log_2 y} + y^{\log_2 x} = 8 \\ \log_2 x - \log_2 y = 1 \end{cases} теңдеулер жүйесінің шешімдері болса, x \cdot y мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "9"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеулер жүйесі", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Есептеңіз: |3 - \sqrt{11}| + |\sqrt{11} - 2|",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\sqrt{11} - 5"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "-5"},
            {"label": "D", "text": r"\sqrt{11} - 5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Модуль", "Иррационал сандар"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"(x - 2)^{x^2 - 1} > 1 теңсіздігін қанағаттандыратын ең кіші бүтін түбірін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "2"},
            {"label": "D", "text": "5"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңсіздіктер", "Теңсіздіктер"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"Суретте көрсетілген шеңбердің ACB мен ADB бұрыштарының градустық өлшемдерінің қосындысын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"60^\circ"},
            {"label": "B", "text": r"240^\circ"},
            {"label": "C", "text": r"120^\circ"},
            {"label": "D", "text": r"90^\circ"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Іштей сызылған бұрыш"],
        "image_filename": "v6_q17_circle.png",
    },
    # 18
    {
        "slot_index": 18,
        "text": r"Көлемі 2696\pi болатын шардың радиусы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt[3]{2021}"},
            {"label": "B", "text": r"\sqrt[3]{2025}"},
            {"label": "C", "text": r"\sqrt[3]{2030}"},
            {"label": "D", "text": r"\sqrt[3]{2022}"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Шар", "Шар көлемі"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"Теңдеуді шешіңіз: 2\cos 3x \cdot \cos 2x + 2\sin 3x \cdot \sin 2x = \sqrt{2}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"x = \pm \frac{\pi}{20} + \frac{\pi n}{5}, n \in \mathbb{Z}"},
            {"label": "B", "text": r"x = \pm \frac{\pi}{20} + \frac{2\pi n}{5}, n \in \mathbb{Z}"},
            {"label": "C", "text": r"x = \pm \frac{\pi}{4} + 2\pi n, n \in \mathbb{Z}"},
            {"label": "D", "text": r"x = \pm \frac{\pi}{4} + \pi n, n \in \mathbb{Z}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"F(x) = \frac{x^3}{3} - \frac{5x^2}{2} + 6x + 2024 функциясы берілген. f(x) функциясының ордината осімен қиылысу нүктесінің координатасын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(0; 6)"},
            {"label": "B", "text": "(6; 0)"},
            {"label": "C", "text": "(-6; 0)"},
            {"label": "D", "text": "(0; -6)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Математикалық анализ", "Алғашқы функция", "Туынды"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"S_n = 4n^2 + n арифметикалық прогрессия бойынша a_1 + d = ?",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "13"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "14"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"Бір катеті 7, гипотенузасы 2\sqrt{13} болатын тікбұрышты үшбұрышты үлкен катетінен айналдырғанда пайда болған дененің көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"7\pi"},
            {"label": "B", "text": r"5\sqrt{3}\pi"},
            {"label": "C", "text": r"9\pi"},
            {"label": "D", "text": r"4\pi"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Айналу денелері", "Конус"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"OB = 15, AB = 24. AB \parallel CD, CD-ның ұзындығын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "16"},
            {"label": "C", "text": "18"},
            {"label": "D", "text": "20"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Шеңбер", "Хорда", "Жанама"],
        "image_filename": "v6_q23_circle_chord.png",
    },
    # 24
    {
        "slot_index": 24,
        "text": "Тік параллелепипедтің табаны диагональдары 6 см және 8 см-ге тең ромб. Бүйір жағының диагоналі 13 см болса, параллелепипедтің биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "10"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "14"},
            {"label": "D", "text": "8"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Параллелепипед", "Ромб"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": r"Өспелі геометриялық прогрессияда S_2 = 6, S_8 = 510 болса, геометриялық прогрессияның еселігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": (
            "**Баскетбол алаңы**\n\n"
            "A, B, C, D секторлары берілген. Әр сектор 12 қатардан тұрады. "
            "A_1, A_6 және B_1, B_4 - тің бірінші қатарында 2 орындық, ал әр келесі қатар сайын 1 орындық қосылып отырады. "
            "A_2, A_5 - тің бірінші қатарында 10 орындық және әр келесі үш қатар сайын 2 орындыққа артып отырады. "
            "A_3, A_4 және B_2, B_3 - тің әр қатарында 10 орындық бар. Екінші қабатта барлығы 2600 орындық бар. "
            "(A мен C, B мен D секторларындағы орындар саны тең)\n\n"
            "A_1, A_6 секторында қанша орындық бар"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "90"},
            {"label": "B", "text": "100"},
            {"label": "C", "text": "180"},
            {"label": "D", "text": "150"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": "v6_context_arena.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": (
            "**Баскетбол алаңы**\n\n"
            "A, B, C, D секторлары берілген. Әр сектор 12 қатардан тұрады. "
            "A_1, A_6 және B_1, B_4 - тің бірінші қатарында 2 орындық, ал әр келесі қатар сайын 1 орындық қосылып отырады. "
            "A_2, A_5 - тің бірінші қатарында 10 орындық және әр келесі үш қатар сайын 2 орындыққа артып отырады. "
            "A_3, A_4 және B_2, B_3 - тің әр қатарында 10 орындық бар. Екінші қабатта барлығы 2600 орындық бар. "
            "(A мен C, B мен D секторларындағы орындар саны тең)\n\n"
            "A_4 және B_3 секторында қанша орындық бар"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "240"},
            {"label": "B", "text": "120"},
            {"label": "C", "text": "180"},
            {"label": "D", "text": "220"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Арифметика"],
        "image_filename": "v6_context_arena.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": (
            "**Баскетбол алаңы**\n\n"
            "A, B, C, D секторлары берілген. Әр сектор 12 қатардан тұрады. "
            "A_1, A_6 және B_1, B_4 - тің бірінші қатарында 2 орындық, ал әр келесі қатар сайын 1 орындық қосылып отырады. "
            "A_2, A_5 - тің бірінші қатарында 10 орындық және әр келесі үш қатар сайын 2 орындыққа артып отырады. "
            "A_3, A_4 және B_2, B_3 - тің әр қатарында 10 орындық бар. Екінші қабатта барлығы 2600 орындық бар. "
            "(A мен C, B мен D секторларындағы орындар саны тең)\n\n"
            "A_2 және A_5 секторында жалпы қанша орындық бар"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "156"},
            {"label": "B", "text": "152"},
            {"label": "C", "text": "312"},
            {"label": "D", "text": "256"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Прогрессия"],
        "image_filename": "v6_context_arena.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": (
            "**Баскетбол алаңы**\n\n"
            "A, B, C, D секторлары берілген. Әр сектор 12 қатардан тұрады. "
            "A_1, A_6 және B_1, B_4 - тің бірінші қатарында 2 орындық, ал әр келесі қатар сайын 1 орындық қосылып отырады. "
            "A_2, A_5 - тің бірінші қатарында 10 орындық және әр келесі үш қатар сайын 2 орындыққа артып отырады. "
            "A_3, A_4 және B_2, B_3 - тің әр қатарында 10 орындық бар. Екінші қабатта барлығы 2600 орындық бар. "
            "(A мен C, B мен D секторларындағы орындар саны тең)\n\n"
            "Жалпы A секторындағы орындықтар саны?"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "820"},
            {"label": "B", "text": "764"},
            {"label": "C", "text": "732"},
            {"label": "D", "text": "780"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Арифметика"],
        "image_filename": "v6_context_arena.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": (
            "**Баскетбол алаңы**\n\n"
            "A, B, C, D секторлары берілген. Әр сектор 12 қатардан тұрады. "
            "A_1, A_6 және B_1, B_4 - тің бірінші қатарында 2 орындық, ал әр келесі қатар сайын 1 орындық қосылып отырады. "
            "A_2, A_5 - тің бірінші қатарында 10 орындық және әр келесі үш қатар сайын 2 орындыққа артып отырады. "
            "A_3, A_4 және B_2, B_3 - тің әр қатарында 10 орындық бар. Екінші қабатта барлығы 2600 орындық бар. "
            "(A мен C, B мен D секторларындағы орындар саны тең)\n\n"
            "Залдағы жалпы орындықтар саны?"
        ),
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4904"},
            {"label": "B", "text": "4968"},
            {"label": "C", "text": "5208"},
            {"label": "D", "text": "4080"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Мәнмәтіндік тапсырма", "Қолданбалы есептер"],
        "image_filename": "v6_context_arena.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"y = \frac{1}{3}x^3 - \frac{1}{2}x^2 - 20x + 15 функциясының экстремум нүктелерін табыңыз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-4"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "-5"},
            {"label": "D", "text": "5"},
        ],
        "subquestions": [
            {"text": r"x_{\max}", "correct": "A"},
            {"text": r"x_{\min}", "correct": "D"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Математикалық анализ", "Экстремум", "Функция"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"\{b_n\} өспелі геометриялық прогрессия құрайтын қатар берілген. Ал мүшелерінің арифметикалық орталары c_8 = 31,875, c_{10} = 102,3",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "61,(6)"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "56,(7)"},
            {"label": "D", "text": "5"},
        ],
        "subquestions": [
            {"text": r"b_3", "correct": "B"},
            {"text": r"c_9", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": "ABCDEFGH нүктелері шеңберді теңдей сегіз доғаға бөледі",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"45^\circ"},
            {"label": "B", "text": r"90^\circ"},
            {"label": "C", "text": r"22,5^\circ"},
            {"label": "D", "text": r"67,5^\circ"},
        ],
        "subquestions": [
            {"text": "AGH бұрышының мәні", "correct": "C"},
            {"text": "BFE бұрышының мәні", "correct": "D"},
        ],
        "answer": '["C", "D"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Планиметрия", "Шеңбер", "Бұрыш"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"\vec{a} = 2\vec{i} - 2\vec{j} + \vec{k} векторының координаталары мен ұзындығын дұрыс жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "(-2; 2; -1)"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "(2; -2; 1)"},
        ],
        "subquestions": [
            {"text": r"\vec{a}\text{ координаталары}", "correct": "D"},
            {"text": r"|\vec{a}|", "correct": "B"},
        ],
        "answer": '["D", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Геометрия", "Векторлар", "Вектор ұзындығы"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"\{a_n\} арифметикалық прогрессияда S_4 = -28, S_6 = 78 болса, онда S_2 және S_3-ті жауаптарымен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-56"},
            {"label": "B", "text": "-54"},
            {"label": "C", "text": "-51"},
            {"label": "D", "text": "-49"},
        ],
        "subquestions": [
            {"text": r"S_2", "correct": "B"},
            {"text": r"S_3", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессия", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\frac{\cos^2 2x + \sin^2 2x - \sin^2 x}{\cos^2 x} өрнегінің мәні жатқан аралығын көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "(-5; 2)"},
            {"label": "B", "text": "[-2; 0]"},
            {"label": "C", "text": "(-2; 0)"},
            {"label": "D", "text": "(-3; 2)"},
            {"label": "E", "text": "(1; 3)"},
            {"label": "F", "text": "(0; 1]"},
        ],
        "answer": '["A", "D", "F"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық өрнектер", "Аралықтар"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Табан аудандары 225\pi және 400\pi болатын қиық конус берілген. Қиық конустың осінен 12 см қашықтықта осіне параллель қима жүргізілген. Қиманың ауданы 750\text{ см}^2. Қиық конустың биіктігінің бөлгіштерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "4"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": "7"},
            {"label": "F", "text": "9"},
        ],
        "answer": '["A", "B", "D"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Қиық конус", "Қима ауданы"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": "Бірінші және бесінші мүшелерінің қосындысы 82, үшінші мүшесі 9 болатын геометриялық прогрессияның еселігін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "-3"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "5"},
            {"label": "E", "text": "3"},
            {"label": "F", "text": "-5"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессия", "Геометриялық прогрессия"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\frac{x+1}{x} - \frac{x}{x^2 - 4} = 0 теңдеуінің түбірлері болмайтындай x-тің қабылдайтын мәндерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
            {"label": "E", "text": "-2"},
            {"label": "F", "text": "0"},
        ],
        "answer": '["B", "E", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Бөлшек-рационал теңдеулер", "Анықталу облысы"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": "Суреттегі берілгендер бойынша конустардың көлемдерін табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\frac{416}{3}\pi"},
            {"label": "B", "text": r"\frac{4}{3}\pi"},
            {"label": "C", "text": r"144\pi"},
            {"label": "D", "text": r"196\pi"},
            {"label": "E", "text": r"\frac{16}{3}\pi"},
            {"label": "F", "text": r"\frac{320}{3}\pi"},
        ],
        "answer": '["A", "C", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Конус", "Қиық конус", "Көлем"],
        "image_filename": "v6_q40_cone.png",
    },
]

async def import_variant():
    db_url = get_db_url()
    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()
    
    # Check folder 11
    folder = await db.trial_tests.get_trial_test_folders(include_empty=True)
    ubt_folder = next((f for f in folder if f['name'] == 'ҰБТ есептері'), None)
    if not ubt_folder:
        print("Creating folder ҰБТ есептері...", flush=True)
        ubt_folder = await db.trial_tests.create_trial_test_folder(name='ҰБТ есептері', sort_order=1)
    
    folder_id = ubt_folder['id']
    print(f"Target folder ID: {folder_id}", flush=True)

    test_title = "6-нұсқа: Баскетбол алаңы"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description="ҰБТ 6-нұсқа математика тапсырмалары (Контекст: Баскетбол алаңы)",
            sort_order=6,
            expected_tasks_count=40,
            category="ҰБТ есептері",
            folder_id=folder_id
        )
        test_id = test['id']
        filled_slots = set()
        print(f"Created test ID: {test_id} ({test_title})", flush=True)
    else:
        test_id = target_test['id']
        existing_tasks = await db.trial_tests.get_trial_test_tasks(test_id)
        filled_slots = {int(t['sort_order']) + 1 for t in existing_tasks}
        print(f"Reusing test ID: {test_id} ({test_title}), already filled slots: {sorted(list(filled_slots))}", flush=True)

    # Import each task
    for item in tasks_data:
        slot_idx = item['slot_index']
        if slot_idx in filled_slots:
            print(f"Slot {slot_idx:02d} already filled, skipping.", flush=True)
            continue

        q_type = item['question_type']
        q_text = item['text']
        opts = item['options']
        subqs = item.get('subquestions')
        ans = item['answer']
        topcs = item['topics']
        img = item['image_filename']

        for attempt in range(3):
            try:
                # 1. Create bank task
                bank_task = await db.bank_tasks.create_task(
                    text=q_text,
                    answer=ans,
                    question_type=q_type,
                    answer_mode="choices",
                    accepted_answers=None,
                    text_scale="md",
                    difficulty="B",
                    topics=topcs,
                    options=opts,
                    subquestions=subqs,
                    image_filename=img,
                    solution_filename=None,
                    source="ubt_import_v6",
                )
                bank_task_id = bank_task['id']

                # 2. Placement into slot
                await db.trial_tests.upsert_trial_test_slot(
                    trial_test_id=test_id,
                    slot_index=slot_idx,
                    bank_task_id=bank_task_id,
                    created_by=None,
                )
                print(f"Slot {slot_idx:02d}: bank_task_id={bank_task_id}, type={q_type}, img={img}", flush=True)
                break
            except Exception as e:
                print(f"Slot {slot_idx:02d} attempt {attempt+1} failed: {e}. Reconnecting...", flush=True)
                await asyncio.sleep(2)
                db = Database(db_url, use_pool=True, auto_migrate=False)
                await db.init()

    print("\n--- ALL 40 TASKS FOR VARIANT 6 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
