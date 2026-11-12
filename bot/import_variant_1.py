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
        "text": r"\int \frac{8-2x}{3x^2+1} dx есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"arctg\sqrt{3}x + \frac{1}{3}\ln|3x^2+1| + C"},
            {"label": "B", "text": r"\frac{8\sqrt{3}}{3}arctg\sqrt{3}x - \frac{1}{3}\ln|3x^2+1| + C"},
            {"label": "C", "text": r"\frac{\sqrt{3}}{3}arctg\sqrt{3}x - \frac{1}{3}\ln|3x^2+1| + C"},
            {"label": "D", "text": r"\frac{8\sqrt{3}}{3}arctg\sqrt{3}x + \ln|3x^2+1| + C"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Интеграл", "Анықталмаған интеграл"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"1 + x + x^2 + \dots + x^{15} = 0 теңдеуін шешіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "-2"},
            {"label": "D", "text": "-1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеу", "Прогрессия"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": "Катеттері 8 см тікбұрышты үшбұрышқа үшбұрышпен тік бұрышы ортақ тіктөртбұрыш салынған. Тіктөртбұрыштың периметрін есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "20"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "16"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Үшбұрыш", "Тіктөртбұрыш", "Периметр"],
        "image_filename": None,
    },
    # 4
    {
        "slot_index": 4,
        "text": r"b_3 = \frac{1}{3}, b_6 = \frac{1}{81} шексіз кемімелі геометриялық прогрессияның қосындысын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7,5"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4,5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Геометриялық прогрессия", "Прогрессия"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": "Теңқабырғалы үшбұрыштың ауданы 16. Орта сызығы оны екі фигураға бөледі. Пайда болған төртбұрыштың ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "12"},
            {"label": "C", "text": "14"},
            {"label": "D", "text": "10"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Үшбұрыш", "Трапеция", "Аудан"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"\frac{\cos^2 x - 1}{\sin x + 7} \ge 0 теңсіздігінің шешімі",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\pi n"},
            {"label": "B", "text": r"\frac{1}{7}\pi n"},
            {"label": "C", "text": r"2\pi n"},
            {"label": "D", "text": r"\pi + 2\pi n"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңсіздіктер", "Теңсіздіктер"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"f(x) = \left(\frac{x+3}{2}\right)^3 функциясының M(0; 0) нүктесі арқылы өтетін алғашқы функциясы",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"F(x) = \frac{(x+3)^4+8}{4}"},
            {"label": "B", "text": r"F(x) = \frac{(x+3)^4-81}{32}"},
            {"label": "C", "text": r"F(x) = \frac{(x+3)^4-9}{8}"},
            {"label": "D", "text": r"F(x) = \frac{(x+3)^4-27}{16}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Алғашқы функция", "Интеграл"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"Ықшамдаңыз: \cos 34^\circ - 2\sin 47^\circ \sin 13^\circ",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "B", "text": r"-\frac{\sqrt{3}}{2}"},
            {"label": "C", "text": r"\frac{1}{2}"},
            {"label": "D", "text": r"-\frac{1}{2}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық формулалар"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"x^2 - 3x + y < 0 теңсіздігінің шешімі бола алатын сандар жұбын анықтаңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(-1; -1)"},
            {"label": "B", "text": "(-1; 2)"},
            {"label": "C", "text": "(1; -2)"},
            {"label": "D", "text": "(0; 1)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Екі айнымалысы бар теңсіздік"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"25^x + 25^{-x} = a, онда 5^x + 5^{-x} мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{a-2}"},
            {"label": "B", "text": r"2\sqrt{a}"},
            {"label": "C", "text": r"\sqrt{a+2}"},
            {"label": "D", "text": r"\sqrt{2}a"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік функция", "Дәрежелер"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"y = \frac{x}{\ln x} функциясының кему аралығында ең кіші бүтін санды табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Функцияның кему аралығы"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\vec{p}(-\sqrt{7}; 3) векторымен бағыттас бірлік вектордың координатасын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\left(\frac{\sqrt{7}}{3}; \frac{7}{4}\right)"},
            {"label": "B", "text": r"\left(-\frac{\sqrt{6}}{10}; \frac{3}{4}\right)"},
            {"label": "C", "text": r"\left(-\frac{\sqrt{7}}{4}; \frac{3}{4}\right)"},
            {"label": "D", "text": r"\left(\frac{\sqrt{7}}{4}; \frac{7}{12}\right)"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Векторлар", "Бірлік вектор"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"Диаметрі 16 см-ге тең шеңберге ұзындығы 8\sqrt{2} см-ге тең AB хордасы жүргізілген. AB хордасы бөлетін екі сегменттің кішісінің ауданын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"36\pi - 9\sqrt{3}"},
            {"label": "B", "text": r"64\pi - 16\sqrt{3}"},
            {"label": "C", "text": r"16\pi - 32"},
            {"label": "D", "text": r"32\pi - 64"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Шеңбер", "Аудан", "Дөңгелек сегменті"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"Теңдеуді шешіңіз: arctg\,2x = \frac{\pi}{6}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{2}"},
            {"label": "B", "text": r"\frac{\sqrt{3}}{6}"},
            {"label": "C", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "D", "text": r"\frac{2\sqrt{3}}{3}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Кері тригонометриялық функциялар", "Теңдеу"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"Егер (x_0; y_0) жұбы \begin{cases} 2 \cdot 5^{2y} - 3 \cdot 4^x = 2 \\ 5 \cdot 4^x - 3 \cdot 5^{2y} = 5 \end{cases} теңдеулер жүйесінің шешімдері болса, онда x_0 + y_0 өрнегінің мәнін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Көрсеткіштік теңдеулер жүйесі", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"a-ның қандай мәндерінде x + 4 = \frac{a}{x} теңдеуінің әртүрлі екі түбірі болады",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-4; 0) \cup (0; +\infty)"},
            {"label": "B", "text": r"(-4; +\infty)"},
            {"label": "C", "text": r"(-\infty; 4)"},
            {"label": "D", "text": r"(-\infty; 0) \cup (0; +\infty)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Параметрлі теңдеулер", "Квадрат теңдеу", "Теңдеу"],
        "image_filename": None,
    },
    # 17
    {
        "slot_index": 17,
        "text": r"x^{\log_2 \sqrt{x}} = 16x теңдеуінің түбірлерінің көбейтіндісін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "16"},
            {"label": "D", "text": "8"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифмдік теңдеу", "Логарифм", "Теңдеу"],
        "image_filename": None,
    },
    # 18
    {
        "slot_index": 18,
        "text": "Түзудің бағыттаушы векторының координаталары (2; 1; 2) және жазықтықтың нормаль векторының координаталары (-1; 2; 2). Осы түзу мен жазықтықтың арасындағы бұрыштың синусын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{1}{4}"},
            {"label": "B", "text": r"\frac{4}{9}"},
            {"label": "C", "text": "1"},
            {"label": "D", "text": r"\frac{1}{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Векторлар", "Түзу мен жазықтық арасындағы бұрыш"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": "-2 + 5x = 5x - 2 теңдеуінің шешімдерінің саны",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "шешімі жоқ"},
            {"label": "D", "text": "шексіз көп"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Сызықтық теңдеу", "Теңдеу"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": "ABC үшбұрышында BD биссектриса мен BE биіктігі, AD = 6, DE = 1 және EC = 2 болса, BE биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\sqrt{2}"},
            {"label": "B", "text": r"\sqrt{11}"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": r"\sqrt{13}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Үшбұрыш", "Биссектриса", "Пифагор теоремасы"],
        "image_filename": "v1_q20_triangle.png",
    },
    # 21
    {
        "slot_index": 21,
        "text": r"Графикте y = 2^x + a функциясы берілген, y(2) = ? мәнін есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "7"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функция графигі", "Көрсеткіштік функция"],
        "image_filename": "v1_q21_graph.png",
    },
    # 22
    {
        "slot_index": 22,
        "text": "Үшбұрышты көлбеу призманың бүйір қабырғалары арасындағы қашықтық 13, 14, 15. Ал бүйір қабырғасы 19 см. Призманың көлемін есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1975"},
            {"label": "B", "text": "1687"},
            {"label": "C", "text": "1596"},
            {"label": "D", "text": "1782"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Көлем"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\frac{x+1}{x-3} - \frac{x}{x+2} = 0 теңдеуінің түбірлері болмайтындай x-тің қабылдайтын мәндерінің қосындысын есептеңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал теңдеу", "Анықталу облысы", "Теңдеу"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": "y = x + 4 функциясының абсцисса осімен қиылысу нүктесін көрсетіңіз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "(0; 4)"},
            {"label": "B", "text": "(-4; 0)"},
            {"label": "C", "text": "(-2; 0)"},
            {"label": "D", "text": "(3; 0)"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Сызықтық функция", "Функция графигі"],
        "image_filename": None,
    },
    # 25
    {
        "slot_index": 25,
        "text": "Радиусы 6 см-ге тең сфераға іштей сызылған тетраэдрдің көлемін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"64\sqrt{3}"},
            {"label": "B", "text": r"172\sqrt{3}"},
            {"label": "C", "text": r"384\sqrt{3}"},
            {"label": "D", "text": r"216\sqrt{3}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Тетраэдр", "Сфера", "Көлем"],
        "image_filename": None,
    },
    # 26
    {
        "slot_index": 26,
        "text": "№26–30. Жылыжайдағы су\n\nЖылыжайдағы су h(t) = 1 + 4\\sin^2\\left(\\frac{\\pi}{4} + t\\right), t \\ge 0 гармоникалық тербеліс теңдеуі арқылы қозғалады.\n\nСу деңгейінің максимум биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y_{max} = 4"},
            {"label": "B", "text": r"y_{max} = 5"},
            {"label": "C", "text": r"y_{max} = 2"},
            {"label": "D", "text": r"y_{max} = 3"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функцияның ең үлкен және ең кіші мәндері", "Контекст", "Мәтінді есеп"],
        "image_filename": "v1_q26_wave.png",
    },
    # 27
    {
        "slot_index": 27,
        "text": "№26–30. Жылыжайдағы су\n\nЖылыжайдағы су h(t) = 1 + 4\\sin^2\\left(\\frac{\\pi}{4} + t\\right), t \\ge 0 гармоникалық тербеліс теңдеуі арқылы қозғалады.\n\nМинимумын биіктігін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y_{min} = 1"},
            {"label": "B", "text": r"y_{min} = 2"},
            {"label": "C", "text": r"y_{min} = 3"},
            {"label": "D", "text": r"y_{min} = 5"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функцияның ең үлкен және ең кіші мәндері", "Контекст", "Мәтінді есеп"],
        "image_filename": "v1_q26_wave.png",
    },
    # 28
    {
        "slot_index": 28,
        "text": "№26–30. Жылыжайдағы су\n\nЖылыжайдағы су h(t) = 1 + 4\\sin^2\\left(\\frac{\\pi}{4} + t\\right), t \\ge 0 гармоникалық тербеліс теңдеуі арқылы қозғалады.\n\nЕң кіші оң периодын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"T = 2"},
            {"label": "B", "text": r"T = \pi"},
            {"label": "C", "text": r"T = \frac{\pi}{4}"},
            {"label": "D", "text": r"T = 4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Функцияның периоды", "Контекст", "Мәтінді есеп"],
        "image_filename": "v1_q26_wave.png",
    },
    # 29
    {
        "slot_index": 29,
        "text": "№26–30. Жылыжайдағы су\n\nЖылыжайдағы су h(t) = 1 + 4\\sin^2\\left(\\frac{\\pi}{4} + t\\right), t \\ge 0 гармоникалық тербеліс теңдеуі арқылы қозғалады.\n\nАмплитудасын табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"A = 4"},
            {"label": "B", "text": r"A = 3"},
            {"label": "C", "text": r"A = 1"},
            {"label": "D", "text": r"A = 2"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тербелістер", "Амплитуда", "Контекст"],
        "image_filename": "v1_q26_wave.png",
    },
    # 30
    {
        "slot_index": 30,
        "text": "№26–30. Жылыжайдағы су\n\nЖылыжайдағы су h(t) = 1 + 4\\sin^2\\left(\\frac{\\pi}{4} + t\\right), t \\ge 0 гармоникалық тербеліс теңдеуі арқылы қозғалады.\n\nФункция бойынша гармоникалық тербелістің дифференциалдық теңдеуін табыңыз",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y'' - 4\sin 2t = 0"},
            {"label": "B", "text": r"y'' - 8\sin t = 0"},
            {"label": "C", "text": r"y'' + 8\sin 2t = 0"},
            {"label": "D", "text": r"y'' + 4\sin 2t = 0"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Дифференциалдық теңдеулер", "Туынды", "Тербелістер", "Контекст"],
        "image_filename": "v1_q26_wave.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": "Суретте екі шаршы берілген. S_1 — үлкен шаршының ауданы, S_2 — кіші шаршының ауданы болса, өрнектерді мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "12"},
            {"label": "B", "text": "13"},
            {"label": "C", "text": "17"},
            {"label": "D", "text": "19"},
        ],
        "subquestions": [
            {"text": r"\sqrt{S_1 + S_2}", "correct": "B"},
            {"text": r"\sqrt{S_1} + \sqrt{S_2}", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Шаршы", "Аудан", "Сәйкестендіру"],
        "image_filename": "v1_q31_squares.png",
    },
    # 32
    {
        "slot_index": 32,
        "text": r"a = \frac{z^2 - 1}{x - y} \cdot \frac{2x - 2y}{zy - y} \div \frac{z + 1}{y} өрнегін ықшамдап, өрнектерді мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "subquestions": [
            {"text": r"a", "correct": "B"},
            {"text": r"a^2 - 1", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Рационал өрнектер", "Өрнекті ықшамдау", "Сәйкестендіру"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"a = \frac{3{,}9 \cdot 11{,}5 - 45{,}05}{44{,}52 \div 10{,}6 - 4{,}225} өрнегі берілген. Сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "2,8"},
            {"label": "B", "text": "3,6"},
            {"label": "C", "text": "4,8"},
            {"label": "D", "text": "7,2"},
        ],
        "subquestions": [
            {"text": r"a санының 35%-ы", "correct": "A"},
            {"text": r"a санының 60%-ы", "correct": "C"},
        ],
        "answer": '["A", "C"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Сандар", "Пайыз", "Сәйкестендіру"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"g(x) = (2x + 1)^3 функциясына x_0 = -1 нүктеде жүргізілген жанаманың теңдеуі y = kx + b болса, k бұрыштық коэффициенті мен b бос мүшесін сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "7"},
        ],
        "subquestions": [
            {"text": r"b", "correct": "B"},
            {"text": r"k", "correct": "C"},
        ],
        "answer": '["B", "C"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Туынды", "Жанаманың теңдеуі", "Сәйкестендіру"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": "Арифметикалық прогрессияның жиырмасыншы мүшесі 0, алпыс алтыншы мүшесі 92-ге тең болса, төмендегі қосындыларын тауып, сан мәндерімен сәйкестендіріңіз",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "-360"},
            {"label": "B", "text": "423"},
            {"label": "C", "text": "-368"},
            {"label": "D", "text": "-676"},
        ],
        "subquestions": [
            {"text": r"S_{16}", "correct": "C"},
            {"text": r"S_{24}", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Арифметикалық прогрессия", "Прогрессия", "Сәйкестендіру"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\begin{cases} \cos(x - y) = 0 \\ \sin^2(x + y) = \frac{3}{4} \end{cases} теңдеулер жүйесінің шешімдерін көрсетіңіз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"\left(\frac{5\pi}{12} + \frac{\pi n}{2} + \frac{\pi k}{2}; -\frac{\pi}{12} - \frac{\pi n}{2} + \frac{\pi k}{2}\right), n, k \in \mathbb{Z}"},
            {"label": "B", "text": r"\left(\frac{\pi}{12} + \frac{\pi n}{2} + \frac{\pi k}{2}; -\frac{\pi}{12} - \frac{\pi n}{2} + \frac{\pi k}{2}\right), n, k \in \mathbb{Z}"},
            {"label": "C", "text": r"\left(\frac{5\pi}{6} + \frac{\pi n}{2} + \frac{\pi k}{2}; -\frac{\pi}{6} - \frac{\pi n}{2} + \frac{\pi k}{2}\right), n, k \in \mathbb{Z}"},
            {"label": "D", "text": r"\left(\frac{\pi}{12} + \frac{\pi n}{2} + \frac{\pi k}{2}; -\frac{5\pi}{12} - \frac{\pi n}{2} + \frac{\pi k}{2}\right), n, k \in \mathbb{Z}"},
            {"label": "E", "text": r"\left(\frac{\pi}{3} + \frac{\pi n}{2} + \frac{\pi k}{2}; -\frac{\pi}{4} - \frac{\pi n}{2} + \frac{\pi k}{2}\right), n, k \in \mathbb{Z}"},
            {"label": "F", "text": r"\left(\frac{3\pi}{4} + \frac{\pi n}{2} + \frac{\pi k}{2}; -\frac{\pi}{4} - \frac{\pi n}{2} + \frac{\pi k}{2}\right), n, k \in \mathbb{Z}"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық теңдеулер жүйесі", "Теңдеулер жүйесі"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"Радиусы 4 см-ге тең шеңберге AD диаметрі және оған параллель 60^\circ доғаны керетін BC хордасы жүргізілген. ABCD трапецияның \angle BAD бұрышының шамасын, периметрін және ауданын табыңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"30^\circ"},
            {"label": "B", "text": "20 см"},
            {"label": "C", "text": r"24\sqrt{3}\text{ см}^2"},
            {"label": "D", "text": r"60^\circ"},
            {"label": "E", "text": "24 см"},
            {"label": "F", "text": r"12\sqrt{3}\text{ см}^2"},
        ],
        "answer": '["B", "D", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Трапеция", "Шеңбер", "Периметр", "Аудан"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": "Бүйірі 5 см, кіші табаны 2 см болатын теңбүйірлі трапецияға іштей шеңбер сызылған. Трапецияның орта сызығы оны екі бөлікке бөледі. Пайда болған трапециялардың аудандары",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "8"},
            {"label": "C", "text": "10"},
            {"label": "D", "text": "12"},
            {"label": "E", "text": "13"},
            {"label": "F", "text": "20"},
        ],
        "answer": '["A", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Трапеция", "Аудан", "Іштей сызылған шеңбер"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"BCD үшбұрышының ауданы 48 см^2. Егер ABCD тіктөртбұрыш болса, онда шеңбердің ұзындығының жай бөлгіштерін көрсетіңіз (\pi \approx 3)",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "5"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
            {"label": "E", "text": "6"},
            {"label": "F", "text": "2"},
        ],
        "answer": '["C", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Тіктөртбұрыш", "Шеңбер", "Жай сандар"],
        "image_filename": "v1_q39_rect_circle.png",
    },
    # 40
    {
        "slot_index": 40,
        "text": r"Координаталық жазықтықта y = ax^2 + bx + c функциясының графигі берілген. Сурет бойынша a, b және c коэффициенттерінің таңбасын анықтаңыз",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"c > 0"},
            {"label": "B", "text": r"c < 0"},
            {"label": "C", "text": r"a > 0"},
            {"label": "D", "text": r"b = 0"},
            {"label": "E", "text": r"b < 0"},
            {"label": "F", "text": r"a < 0"},
        ],
        "answer": '["A", "E", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Квадраттық функция", "Парабола", "Функция графигі"],
        "image_filename": "v1_q40_parabola.png",
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

    test_title = "1-нұсқа: Жылыжайдағы су"
    existing_tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = next((t for t in existing_tests if t['title'] == test_title), None)
    
    if target_test:
        print(f"Test already exists with ID: {target_test['id']}, deleting to re-import...", flush=True)
        await db.trial_tests.delete_trial_test(target_test['id'])
    
    # Create test
    test = await db.trial_tests.create_trial_test(
        title=test_title,
        description="ҰБТ 1-нұсқа математика тапсырмалары (Контекст: Жылыжайдағы су)",
        sort_order=1,
        expected_tasks_count=40,
        category="ҰБТ есептері",
        folder_id=folder_id
    )
    test_id = test['id']
    print(f"Created test ID: {test_id} ({test_title})", flush=True)

    # Import each task
    for item in tasks_data:
        slot_idx = item['slot_index']
        q_type = item['question_type']
        q_text = item['text']
        opts = item['options']
        subqs = item.get('subquestions')
        ans = item['answer']
        topcs = item['topics']
        img = item['image_filename']

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
            source="ubt_import_v1",
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

    print("\n--- ALL 40 TASKS IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
