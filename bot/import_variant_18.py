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
        "text": r"\frac{x^3 - 6x^2 + 8x}{x^2 - 2x - 3} \le 0",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-\infty; -1) \cup (0; 2) \cup (3; 4]"},
            {"label": "B", "text": r"(-\infty; 1) \cup (1; 2) \cup (3; 4]"},
            {"label": "C", "text": r"(-\infty; -1) \cup (-1; 2) \cup (3; 4]"},
            {"label": "D", "text": r"(-\infty; -1) \cup [0; 2] \cup (3; 4]"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Теңсіздіктер", "Бөлшек-рационал теңсіздіктер", "Интервалдар әдісі"],
        "image_filename": None,
    },
    # 2
    {
        "slot_index": 2,
        "text": r"x^2 - 3; 2x^2 + 1; x^4 + 1 \text{ ретімен алынған өрнектер арифметикалық прогрессия болатындай айнымалының мәнін тауып, алғашқы бес мүшенің қосындысын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "70"},
            {"label": "B", "text": "78"},
            {"label": "C", "text": "52"},
            {"label": "D", "text": "85"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессиялар", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 3
    {
        "slot_index": 3,
        "text": r"\text{График бойынша функция теңдеуін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \frac{1}{x - 3} - 5"},
            {"label": "B", "text": r"y = \frac{2}{x - 3} - 5"},
            {"label": "C", "text": r"y = \frac{2}{x - 3} + 5"},
            {"label": "D", "text": r"y = \frac{1}{x + 3} + 5"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Функция графигі", "Гипербола"],
        "image_filename": "v18_q03_hyperbola.png",
    },
    # 4
    {
        "slot_index": 4,
        "text": r"y = \sqrt{5^x - 3^x} \text{ функцияның анықталу облысын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"[0; \infty)"},
            {"label": "B", "text": r"[1; \infty)"},
            {"label": "C", "text": r"(-\infty; 0]"},
            {"label": "D", "text": r"(-\infty; 1]"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Анықталу облысы", "Көрсеткіштік теңсіздіктер"],
        "image_filename": None,
    },
    # 5
    {
        "slot_index": 5,
        "text": r"3^{\log_3^2 x} + x^{\log_3 x} = 6 \text{ теңдеудің түбірлерінің көбейтіндісін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "0"},
            {"label": "D", "text": "1"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік теңдеулер"],
        "image_filename": None,
    },
    # 6
    {
        "slot_index": 6,
        "text": r"y = x \text{ және } y = x^3 \text{ функциялармен шектелген фигура ауданын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "0,4"},
            {"label": "B", "text": "0,8"},
            {"label": "C", "text": "0,5"},
            {"label": "D", "text": "0,25"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Интеграл", "Қисықсызықты трапеция ауданы"],
        "image_filename": None,
    },
    # 7
    {
        "slot_index": 7,
        "text": r"\log_{x^2}(16) + \log_{2x}(8) = 2 \text{ теңдеудің түбірлерінің көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": r"2\sqrt{2}"},
            {"label": "C", "text": r"2\sqrt{3}"},
            {"label": "D", "text": r"\sqrt{2}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік теңдеулер"],
        "image_filename": None,
    },
    # 8
    {
        "slot_index": 8,
        "text": r"(a - b)(a^3 + a^2 b + ab^2 + b^3) \text{ өрнегін ықшамда}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"a^4 + b^4"},
            {"label": "B", "text": r"a^5 + b^5"},
            {"label": "C", "text": r"a^5 - b^5"},
            {"label": "D", "text": r"a^4 - b^4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Қысқаша көбейту формулалары", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 9
    {
        "slot_index": 9,
        "text": r"P(x) = x^5 - 3x^3 - 5x^2 + 4x + 10 \text{ көпмүшесін } x - 1\text{-екімүшеге бөлгендегі қалдықты тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Көпмүшелер", "Безу теоремасы"],
        "image_filename": None,
    },
    # 10
    {
        "slot_index": 10,
        "text": r"x^2 + (y - 2)^2 = 1 \text{ функциясына координаталар бас нүктесі арқылы өтетін жанаманың теңдеуін табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"y = \pm\sqrt{2}x"},
            {"label": "B", "text": r"y = \pm\sqrt{3}x"},
            {"label": "C", "text": r"y = \pm\frac{\sqrt{3}}{2}x"},
            {"label": "D", "text": r"y = \pm\frac{\sqrt{5}}{2}x"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Геометрия", "Аналитикалық геометрия", "Шеңбер теңдеуі", "Жанама теңдеуі"],
        "image_filename": None,
    },
    # 11
    {
        "slot_index": 11,
        "text": r"\text{Катеттері 8 см тікбұрышты үшбұрышқа үшбұрышпен тік бұрышы ортақ тіктөртбұрыш салынған. Тіктөртбұрыштың периметрін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "18"},
            {"label": "B", "text": "20"},
            {"label": "C", "text": "12"},
            {"label": "D", "text": "16"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Тікбұрышты үшбұрыш", "Тіктөртбұрыш"],
        "image_filename": None,
    },
    # 12
    {
        "slot_index": 12,
        "text": r"\text{Үшбұрыштың екі қабырғасы 8 см және 12 см. Үшінші қабырғасының ұзындығы бола алатын сан аралығы}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(4; 20)"},
            {"label": "B", "text": r"(7; 10)"},
            {"label": "C", "text": r"(1; 17)"},
            {"label": "D", "text": r"(7; 9)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Планиметрия", "Үшбұрыштар", "Үшбұрыш теңсіздігі"],
        "image_filename": None,
    },
    # 13
    {
        "slot_index": 13,
        "text": r"|\vec{a}| = 1, |\vec{b}| = |\vec{c}| = 2, \angle(\vec{a}, \vec{b}) = 60^\circ, \angle(\vec{a}, \vec{c}) = 45^\circ \text{ екендігі белгілі, } (\vec{a} + \vec{b} - \vec{c})(\vec{b} + \vec{c}) \text{ есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"1 + \sqrt{2}"},
            {"label": "B", "text": r"2 - \sqrt{2}"},
            {"label": "C", "text": r"2 + \sqrt{2}"},
            {"label": "D", "text": r"1 - \sqrt{2}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Векторлар", "Векторлардың скаляр көбейтіндісі"],
        "image_filename": None,
    },
    # 14
    {
        "slot_index": 14,
        "text": r"x + 2y + z - 3 = 0, 2x + 4y + 2z - 8 = 0 \text{ жазықтықтарының арақашықтығын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{\sqrt{3}}{3}"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": r"\frac{\sqrt{6}}{6}"},
            {"label": "D", "text": "10"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Аналитикалық геометрия", "Жазықтықтар арасындағы қашықтық"],
        "image_filename": None,
    },
    # 15
    {
        "slot_index": 15,
        "text": r"b_3 = \frac{1}{3}, b_6 = \frac{1}{81} \text{ мүшелері оң геометриялық прогрессияның қосындысын есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "7,5"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4,5"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессиялар", "Геометриялық прогрессия", "Шексіз кемімелі геометриялық прогрессия"],
        "image_filename": None,
    },
    # 16
    {
        "slot_index": 16,
        "text": r"y = \frac{\operatorname{tg} x \cdot \operatorname{ctg} x - \cos^2 x}{\sin x} \text{ функциясының графигін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "A"},
            {"label": "B", "text": "B"},
            {"label": "C", "text": "C"},
            {"label": "D", "text": "D"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Тригонометрия", "Тригонометриялық функциялар", "Функция графигі"],
        "image_filename": "v18_q16_graphs.png",
    },
    # 17
    {
        "slot_index": 17,
        "text": r"\text{Дұрыс алтыбұрышты призманың барлық қырлары 2-ге тең. } E_1 \text{ төбесінен } AB \text{ қабырғасына дейінгі қашықтықты есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "3,5"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "4"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Призма", "Кеңістіктегі арақашықтық"],
        "image_filename": "v18_q17_prism.png",
    },
    # 18
    {
        "slot_index": 18,
        "text": r"\text{Есепте: } \frac{\lg 5 \cdot \log_{0,5} 5}{\lg 5 + \log_{0,5} 5}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "10"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 19
    {
        "slot_index": 19,
        "text": r"y = 2024 + 4\arcsin 2x \text{ функциясы берілген. } f(x) = y'(x) + y\left(\frac{1}{2}\right) \text{ функцияның анықталу облысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(-0,25; 0,25)"},
            {"label": "B", "text": r"(-0,5; 0,5)"},
            {"label": "C", "text": r"[-0,25; 0,25]"},
            {"label": "D", "text": r"[-0,5; 0,5]"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Анықталу облысы", "Кері тригонометриялық функциялар"],
        "image_filename": None,
    },
    # 20
    {
        "slot_index": 20,
        "text": r"S(t) = \frac{2t + 1}{t + 2} \text{ заңымен қозғалатын материалдық дененің } t = 8 \text{ кезіндегі үдеуін есепте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "-0,004"},
            {"label": "B", "text": "0,003"},
            {"label": "C", "text": "-0,006"},
            {"label": "D", "text": "0,002"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Математикалық талдау", "Туынды", "Туындының физикалық мағынасы"],
        "image_filename": None,
    },
    # 21
    {
        "slot_index": 21,
        "text": r"\frac{\sqrt{8 - 2\sqrt{7}}}{\sqrt{7 - 4\sqrt{3}}} - \frac{\sqrt{8 + 2\sqrt{7}}}{\sqrt{7 + 4\sqrt{3}}} \text{ өрнектің мәнін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"-2 + \sqrt{21}"},
            {"label": "B", "text": r"-4 + 2\sqrt{21}"},
            {"label": "C", "text": r"4 - 2\sqrt{21}"},
            {"label": "D", "text": r"2 - \sqrt{21}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Түбірлер", "Иррационал өрнектер", "Өрнекті ықшамдау"],
        "image_filename": None,
    },
    # 22
    {
        "slot_index": 22,
        "text": r"\text{Егер } \lg 5 = x, \lg 2 = y \text{ болса, онда } \log_{16} 50\text{-ны өрнекте}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\frac{x + 1}{4y}"},
            {"label": "B", "text": r"\frac{4x + 1}{y}"},
            {"label": "C", "text": r"\frac{4x - 1}{2y}"},
            {"label": "D", "text": r"\frac{x + 4}{y}"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Алгебра", "Логарифм", "Логарифмдік өрнектер"],
        "image_filename": None,
    },
    # 23
    {
        "slot_index": 23,
        "text": r"\vec{a} = -2\vec{i} - 3\vec{j} \text{ және } \vec{b} = \vec{i} - 2\vec{j} + \vec{k} \text{ векторларының скаляр көбейтіндісін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "8"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Векторлар", "Векторлардың скаляр көбейтіндісі"],
        "image_filename": None,
    },
    # 24
    {
        "slot_index": 24,
        "text": r"y = f(x) \text{ функциясына тиісті } A(x; y) \text{ нүктесі бойынша функцияға } y = \frac{1}{2}f(x) \text{ түрлендіру жасағанда көшетін нүктенің координаталарының қосындысын тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": "8"},
            {"label": "B", "text": "5"},
            {"label": "C", "text": "13"},
            {"label": "D", "text": "4"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Алгебра", "Функциялар", "Функция графигін түрлендіру", "Парабола"],
        "image_filename": "v18_q24_parabola.png",
    },
    # 25
    {
        "slot_index": 25,
        "text": r"\text{Центрі } C(4; -2; 1) \text{ нүктесінде және координаталар басы арқылы өтетін сфера теңдеуін тап}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(x - 4)^2 + (y + 2)^2 + (z - 1)^2 = 21"},
            {"label": "B", "text": r"(x + 4)^2 + (y - 2)^2 + (z + 1)^2 = 21"},
            {"label": "C", "text": r"x^2 + y^2 + z^2 = 21"},
            {"label": "D", "text": r"(x + 4)^2 + (y - 2)^2 + (z - 1)^2 = 21"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Сфера теңдеуі", "Аналитикалық геометрия"],
        "image_filename": None,
    },
    # 26 (Context: Бекет)
    {
        "slot_index": 26,
        "text": r"\text{Суретте көрсетілгендей } A, B, C \text{ бекеттері берілген. } 1 \text{ торкөз } 1 \text{ км-ге тең. } A \text{ бекетінің координаталарын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(3; 10)"},
            {"label": "B", "text": r"(10; 3)"},
            {"label": "C", "text": r"(1; 10)"},
            {"label": "D", "text": r"(1; 4)"},
        ],
        "answer": "A",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Координаталық әдіс"],
        "image_filename": "v18_q26_beket.png",
    },
    # 27 (Context: Бекет)
    {
        "slot_index": 27,
        "text": r"\text{Суретте көрсетілгендей } A, B, C \text{ бекеттері берілген. } 1 \text{ торкөз } 1 \text{ км-ге тең. } A \text{ және } B \text{ бекеттерінің арақашықтығын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"10\sqrt{3} \text{ км}"},
            {"label": "B", "text": r"10 \text{ км}"},
            {"label": "C", "text": r"10\sqrt{5} \text{ км}"},
            {"label": "D", "text": r"15 \text{ км}"},
        ],
        "answer": "C",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Нүктелер арасындағы қашықтық", "Координаталық әдіс"],
        "image_filename": "v18_q26_beket.png",
    },
    # 28 (Context: Бекет)
    {
        "slot_index": 28,
        "text": r"\text{Суретте көрсетілгендей } A, B, C \text{ бекеттері берілген. } 1 \text{ торкөз } 1 \text{ км-ге тең. } A \text{ және } C \text{ бекеттерінің арақашықтығын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"2\sqrt{26} \text{ км}"},
            {"label": "B", "text": r"3\sqrt{26} \text{ км}"},
            {"label": "C", "text": r"3\sqrt{19} \text{ км}"},
            {"label": "D", "text": r"2\sqrt{19} \text{ км}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Нүктелер арасындағы қашықтық", "Координаталық әдіс"],
        "image_filename": "v18_q26_beket.png",
    },
    # 29 (Context: Бекет)
    {
        "slot_index": 29,
        "text": r"\text{Суретте көрсетілгендей } A, B, C \text{ бекеттері берілген. } 1 \text{ торкөз } 1 \text{ км-ге тең. } B \text{ және } C \text{ бекеттерінің арақашықтығын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"\sqrt{85} \text{ км}"},
            {"label": "B", "text": r"\sqrt{74} \text{ км}"},
            {"label": "C", "text": r"\sqrt{83} \text{ км}"},
            {"label": "D", "text": r"\sqrt{71} \text{ км}"},
        ],
        "answer": "B",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Нүктелер арасындағы қашықтық", "Координаталық әдіс"],
        "image_filename": "v18_q26_beket.png",
    },
    # 30 (Context: Бекет)
    {
        "slot_index": 30,
        "text": r"\text{Суретте көрсетілгендей } A, B, C \text{ бекеттері берілген. } 1 \text{ торкөз } 1 \text{ км-ге тең. } A \text{ және } B \text{ бекеттерінен бірдей қашықтықта шам қойылған. Шам орналасатын нүктенің координаталарын табыңыз}",
        "question_type": "mcq",
        "options": [
            {"label": "A", "text": r"(0; 4)"},
            {"label": "B", "text": r"(0; -2)"},
            {"label": "C", "text": r"(-3; -2)"},
            {"label": "D", "text": r"(-2; 0)"},
        ],
        "answer": "D",
        "topics": ["ҰБТ есебі", "Контекст", "Геометрия", "Кесіндінің ортасы", "Координаталық әдіс"],
        "image_filename": "v18_q26_beket.png",
    },
    # 31
    {
        "slot_index": 31,
        "text": r"\text{Өспелі арифметикалық прогрессияның тақ орындағы алғашқы үш мүшесінің қосындысы } 33\text{–ке тең, ал алғашқы екі жұп орында орналасқан мүшелерінің көбейтіндісі } 112\text{–ге тең. Төмендегі шамаларды жауаптарымен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "4"},
            {"label": "C", "text": "5"},
            {"label": "D", "text": "6"},
        ],
        "subquestions": [
            {"text": r"\text{арифметикалық прогрессияның бірінші мүшесі}", "correct": "C"},
            {"text": r"\text{арифметикалық прогрессияның айырымы}", "correct": "A"},
        ],
        "answer": '["C", "A"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Прогрессиялар", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 32
    {
        "slot_index": 32,
        "text": r"y = \sin x \text{ және } y = \arcsin x \text{ функциялары берілген. Сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\text{қарама-қарсы функция}"},
            {"label": "B", "text": "1"},
            {"label": "C", "text": r"\text{кері функция}"},
            {"label": "D", "text": "2"},
        ],
        "subquestions": [
            {"text": r"\text{екі функция өзара...}", "correct": "C"},
            {"text": r"\text{екі функция қанша нүктеде қиылысады?}", "correct": "B"},
        ],
        "answer": '["C", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Тригонометрия", "Кері функциялар", "Функциялар"],
        "image_filename": None,
    },
    # 33
    {
        "slot_index": 33,
        "text": r"a \text{ және } b \text{ оң рационал сандары үшін } \frac{14a^4}{5b^3} \cdot \frac{15b^2(a - 5)^2}{21a^2} : \frac{a^2}{2b^6} \text{ өрнегінің мәні } 1\text{–ге тең. Егер } b = 1 \text{ болса, } a\text{–ның мәндерін анықтап, сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "4"},
            {"label": "B", "text": "6"},
            {"label": "C", "text": "4,5"},
            {"label": "D", "text": "5,5"},
        ],
        "subquestions": [
            {"text": r"a\text{–ның үлкен мәні}", "correct": "D"},
            {"text": r"a\text{–ның кіші мәні}", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Рационал өрнектер", "Теңдеулер"],
        "image_filename": None,
    },
    # 34
    {
        "slot_index": 34,
        "text": r"(x - 2)^2 - (x + 3)^2 + 10x + 9 \text{ өрнегін ықшамдап, мәндерімен сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": "1"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "3"},
            {"label": "D", "text": "4"},
        ],
        "subquestions": [
            {"text": r"\text{Өрнектің мәні}", "correct": "D"},
            {"text": r"\text{Өрнек мәнінің бөлгіштер саны}", "correct": "C"},
        ],
        "answer": '["D", "C"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Өрнекті ықшамдау", "Сандар теориясы", "Бөлгіштер саны"],
        "image_filename": None,
    },
    # 35
    {
        "slot_index": 35,
        "text": r"|3x^2 + x| + c = 0 \text{ теңдеуі берілген. } c\text{–ның мәніне байланысты нақты түбірлерінің санын сәйкестендіріңіз}",
        "question_type": "select",
        "options": [
            {"label": "A", "text": r"\text{түбірі жоқ}"},
            {"label": "B", "text": r"\text{екі түбірі бар}"},
            {"label": "C", "text": r"\text{бір түбірі бар}"},
            {"label": "D", "text": r"\text{төрт түбірі бар}"},
        ],
        "subquestions": [
            {"text": "c > 0", "correct": "A"},
            {"text": "c = -4", "correct": "B"},
        ],
        "answer": '["A", "B"]',
        "topics": ["ҰБТ есебі", "Сәйкестендіру", "Алгебра", "Модульді теңдеулер", "Параметрлі теңдеулер"],
        "image_filename": None,
    },
    # 36
    {
        "slot_index": 36,
        "text": r"\text{Арифметикалық прогрессияның үшінші және төртінші мүшесінің қосындысы } 4\text{–ке, бесінші және алтыншы мүшесінің қосындысы } 20\text{–ға тең. Осы прогрессияның алғашқы алты мүшесінің қосындысы болатын мән(дер)ін табыңыз.}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "14"},
            {"label": "B", "text": r"\sqrt{196}"},
            {"label": "C", "text": r"\left(\frac{1}{12}\right)^{-1}"},
            {"label": "D", "text": r"\left(\frac{1}{14}\right)^{-1}"},
            {"label": "E", "text": r"(2\sqrt{3})^2"},
            {"label": "F", "text": "12"},
        ],
        "answer": '["C", "E", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Прогрессиялар", "Арифметикалық прогрессия"],
        "image_filename": None,
    },
    # 37
    {
        "slot_index": 37,
        "text": r"MABCD \text{ дұрыс пирамидасы берілген. } AB = 6, \text{ ал қиманың ауданы } S_{MBD} = 9\sqrt{2}. \text{ Пирамиданың бүйір қыры мен биіктігін табыңыз.}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "2"},
            {"label": "B", "text": "3"},
            {"label": "C", "text": r"2\sqrt{2}"},
            {"label": "D", "text": r"3\sqrt{2}"},
            {"label": "E", "text": r"3\sqrt{3}"},
            {"label": "F", "text": "5"},
        ],
        "answer": '["B", "E"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Қима ауданы"],
        "image_filename": None,
    },
    # 38
    {
        "slot_index": 38,
        "text": r"\begin{cases} \sqrt{x} + \sqrt{y} = 10 \\ \sqrt[4]{x} + \sqrt[4]{y} = 4 \end{cases} \text{ теңдеулер жүйесінің шешімі } (x_0; y_0) \text{ сандар жұбы болса, онда } \sqrt[4]{x_0 \cdot y_0} \text{ өрнегі мәнінің бөлгіші бола алатын сан(дар)ды табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "3"},
            {"label": "B", "text": "9"},
            {"label": "C", "text": "6"},
            {"label": "D", "text": "1"},
            {"label": "E", "text": "15"},
            {"label": "F", "text": "5"},
        ],
        "answer": '["A", "D"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Теңдеулер жүйесі", "Иррационал теңдеулер жүйесі", "Бөлгіштер"],
        "image_filename": None,
    },
    # 39
    {
        "slot_index": 39,
        "text": r"\text{Егер } x - y = 12 \text{ болса, онда } (18 + x) - (y + 8) \text{ өрнегінің мәнінің жай бөлгіші бола алатын сан(дар)}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": "9"},
            {"label": "B", "text": "2"},
            {"label": "C", "text": "7"},
            {"label": "D", "text": "13"},
            {"label": "E", "text": "1"},
            {"label": "F", "text": "11"},
        ],
        "answer": '["B", "F"]',
        "topics": ["ҰБТ есебі", "Алгебра", "Сандар мен есептеулер", "Жай сандар", "Бөлгіштер"],
        "image_filename": None,
    },
    # 40
    {
        "slot_index": 40,
        "text": r"HABCDEF \text{ дұрыс пирамидасы берілген. } AB \text{ қабырғасының ортасына } P \text{ нүктесі орналасқан. } PH \text{ апофемасы } 5 \text{ см–ге тең. } AB \text{ қабырғасынан басқа, табан қабырғасының ортасынан } K \text{ нүктесі алынған. } HPK \text{ үшбұрышының ауданын табыңыз}",
        "question_type": "mcq6",
        "options": [
            {"label": "A", "text": r"3\sqrt{26} \text{ см}^2"},
            {"label": "B", "text": r"51 \text{ см}^2"},
            {"label": "C", "text": r"12 \text{ см}^2"},
            {"label": "D", "text": r"24 \text{ см}^2"},
            {"label": "E", "text": r"\sqrt{66} \text{ см}^2"},
            {"label": "F", "text": r"2\sqrt{39} \text{ см}^2"},
        ],
        "answer": '["C", "E", "F"]',
        "topics": ["ҰБТ есебі", "Геометрия", "Стереометрия", "Пирамида", "Апофема", "Үшбұрыш ауданы"],
        "image_filename": "v18_q40_pyramid.png",
    },
]

async def import_variant():
    db_url = get_db_url()
    if not db_url:
        print("DATABASE_URL not found!")
        return

    db = Database(db_url, use_pool=True, auto_migrate=False)
    await db.init()

    folder_id = 11  # "ҰБТ есептері"
    test_title = "18-нұсқа: Бекет"
    test_desc = "ҰБТ 18-нұсқа математика тапсырмалары (Контекст: Бекет)"

    # Check if test already exists in folder 11
    tests = await db.trial_tests.get_trial_tests(folder_id=folder_id)
    target_test = None
    for t in tests:
        if t['title'] == test_title or t['title'].startswith("18-нұсқа"):
            target_test = t
            break

    if not target_test:
        test = await db.trial_tests.create_trial_test(
            title=test_title,
            description=test_desc,
            sort_order=18,
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
                    source="ubt_import_v18",
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

    print("\n--- ALL 40 TASKS FOR VARIANT 18 IMPORTED SUCCESSFULLY! ---", flush=True)

if __name__ == '__main__':
    asyncio.run(import_variant())
